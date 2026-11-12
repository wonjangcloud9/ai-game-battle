// AURORA FALL — match flow: drop plane, characters, zone damage, supply drops, win conditions (no DOM dependencies)
'use strict';

const Game = {
  events: makeEmitter(),
  state: 'idle',            // idle | plane | playing | ended
  time: 0, chars: [], player: null, rng: makeRng(1), diff: DIFFICULTY.normal, diffName: 'normal',
  aliveCount: 0, plane: null, airdrops: [], winner: null, playerDead: false, endTime: 0,
  noises: [], interact: null, wantJump: false, wantInteract: false,
  _zoneTick: 0, _pickT: 0, _dropPhases: {},

  start(opts) {
    opts = opts || {};
    const seed = opts.seed || ((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    const rng = this.rng = makeRng(seed);
    this.seed = seed;
    this.diffName = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
    this.diff = DIFFICULTY[this.diffName];
    this.time = 0; this.state = 'plane'; this.winner = null; this.playerDead = false; this.endTime = 0;
    this.noises = []; this.airdrops = []; this.interact = null; this.wantJump = false; this.wantInteract = false;
    this._zoneTick = 0; this._pickT = 0; this._dropPhases = {};
    Items.reset(); Items.spawnInitial(rng);
    Combat.reset();
    Zone.reset(rng);
    // ---- characters
    const total = opts.players || CFG.TOTAL_PLAYERS;
    const names = rng.shuffle(BOT_NAMES.slice());
    this.chars = [];
    const hasPlayer = opts.spectate ? false : true;
    if (hasPlayer) this.player = new Character(0, opts.name || '플레이어', true, opts.color === undefined ? 4 : opts.color);
    else this.player = null;
    if (this.player) this.chars.push(this.player);
    for (let i = this.chars.length; i < total; i++) {
      let col = Math.floor(rng() * SUIT_COLORS.length);
      if (this.player && col === this.player.color) col = (col + 3) % SUIT_COLORS.length;
      this.chars.push(new Character(i, names[i % names.length], false, col));
    }
    this.aliveCount = this.chars.length;
    // ---- plane path across the island
    const a = rng() * TAU, dx = Math.cos(a), dz = Math.sin(a);
    const cx = rng.range(-110, 110), cz = rng.range(-110, 110);
    const half = 680;
    const sx = cx - dx * half, sz = cz - dz * half;
    // segment of the path that is over the island (inside radius 430 of the origin)
    const b = sx * dx + sz * dz, c = sx * sx + sz * sz - 430 * 430, disc = Math.sqrt(Math.max(0, b * b - c));
    this.plane = { x: sx, y: CFG.PLANE_ALT, z: sz, sx, sz, dx, dz, vx: dx * CFG.PLANE_SPEED, vz: dz * CFG.PLANE_SPEED, yaw: Math.atan2(dx, dz), dist: 0, len: half * 2, dropStart: -b - disc + 25, dropEnd: -b + disc - 25, active: true };
    for (const ch of this.chars) { ch.x = sx; ch.y = CFG.PLANE_ALT; ch.z = sz; ch.aimYaw = ch.in.aimYaw = this.plane.yaw; ch.yaw = this.plane.yaw; }
    BotAI.reset(this.chars, rng, this.diff);
    this.events.emit('start');
  },

  planeTimeToDrop() { const p = this.plane; return p ? Math.max(0, (p.dropStart - p.dist) / CFG.PLANE_SPEED) : 0; },
  canJump() { const p = this.plane; return !!(p && p.active && p.dist >= p.dropStart && p.dist <= p.dropEnd); },

  // Damage scale between bots: gentle while the lobby is full (so it does not wipe itself out before the player gets going)
  // and rising as the field thins, which keeps the match length close to the zone schedule.
  botScale() {
    const thin = clamp01(1 - (this.aliveCount - 4) / (this.chars.length - 4));   // 0 = full lobby, 1 = final few
    let s = 0.1 + CFG.BOT_VS_BOT * Math.pow(thin, 1.5);
    if (Zone.phase >= 4) s = Math.max(s, 0.5);
    return s;
  },
  // Damage scale for bots hitting the player: difficulty based, with a short grace period right after landing.
  playerScale() { return this.diff.dmgToPlayer * lerp(0.45, 1, clamp01((this.time - 30) / 60)); },
  noise(x, z, loud, src) {
    if (loud <= 0) return;
    this.noises.push({ x, z, loud, src, t: this.time });
    if (this.noises.length > 24) this.noises.shift();
  },

  onDeath(victim, attacker, weaponId, head) {
    this.aliveCount--;
    victim.placement = this.aliveCount + 1;
    if (attacker && attacker !== victim) attacker.kills++;
    Items.dropAll(victim, this.rng);
    this.events.emit('death', victim, attacker, weaponId, head);
    if (victim === this.player) { this.playerDead = true; this.events.emit('playerDeath', victim, attacker, weaponId); }
    if (this.aliveCount <= 1 && this.state !== 'ended') {
      let w = null;
      for (const c of this.chars) if (c.alive) w = c;
      if (!w) { w = victim; }
      w.placement = 1;
      this.winner = w; this.state = 'ended'; this.endTime = this.time;
      this.events.emit('end', w);
    }
  },

  _updatePlane(dt) {
    const p = this.plane;
    if (!p || !p.active) return;
    p.dist += CFG.PLANE_SPEED * dt;
    p.x = p.sx + p.dx * p.dist; p.z = p.sz + p.dz * p.dist;
    const force = p.dist >= p.dropEnd;
    for (const ch of this.chars) {
      if (ch.mode !== 'plane') continue;
      ch.x = p.x; ch.y = p.y - 2.5; ch.z = p.z;
      if (force) ch.jumpFromPlane(p.vx, p.vz);
    }
    if (this.player && this.player.mode === 'plane' && this.wantJump && p.dist >= p.dropStart) this.player.jumpFromPlane(p.vx, p.vz);
    if (this.state === 'plane' && p.dist >= p.dropStart) { this.state = 'playing'; this.events.emit('dropOpen'); }
    if (p.dist >= p.len) p.active = false;
  },

  _spawnAirdrop() {
    const rng = this.rng;
    let x = Zone.toX, z = Zone.toZ;
    for (let t = 0; t < 30; t++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * Math.max(10, Zone.toR * 0.8);
      const px = Zone.toX + Math.cos(a) * d, pz = Zone.toZ + Math.sin(a) * d;
      if (Nav.isOpen(px, pz) && Terrain.steepness(px, pz) < 0.3 && !World_nearStructure(px, pz, 6)) { x = px; z = pz; break; }
    }
    const g = Terrain.height(x, z);
    const drop = { x, z, y: g + 150, ground: g, landed: false, chest: null, t: 0 };
    this.airdrops.push(drop);
    this.events.emit('airdrop', drop, 'incoming');
  },
  _updateAirdrops(dt) {
    for (const d of this.airdrops) {
      d.t += dt;
      if (d.landed) continue;
      d.y -= 10 * dt;
      if (d.y <= d.ground) {
        d.y = d.ground; d.landed = true;
        d.chest = { x: d.x, y: d.ground, z: d.z, yaw: 0, tier: 2, upper: false, opened: false, openT: 0, airdrop: true };
        Items.chests.push(d.chest);
        this.events.emit('airdrop', d, 'landed');
      }
    }
  },

  // Nearest thing the player can interact with (chest to open / weapon to swap for).
  _findInteract() {
    const p = this.player;
    this.interact = null;
    if (!p || !p.alive || p.mode !== 'ground') return;
    const chest = Items.nearestChest(p.x, p.z, 2.7, p.y);
    if (chest) { this.interact = { type: 'chest', ref: chest, label: chest.airdrop ? '보급 상자 열기' : '상자 열기' }; return; }
    let best = null, bd = CFG.PICKUP_RANGE;
    Items.forNear(p.x, p.z, CFG.PICKUP_RANGE, (it, d) => {
      if (it.kind !== 'weapon' || !it.rest || Math.abs(it.y - p.y) > 1.8) return;
      if (d < bd) { bd = d; best = it; }
    });
    if (best) {
      const free = p.weapons.indexOf(null) >= 0;
      this.interact = { type: 'weapon', ref: best, label: (free ? '줍기: ' : '교체: ') + RARITY[best.rarity].name + ' ' + WEAPONS[best.type].name, rarity: best.rarity };
    }
  },
  doInteract() {
    const it = this.interact, p = this.player;
    if (!it || !p || !p.alive) return false;
    if (it.type === 'chest') return Items.openChest(it.ref, this.rng, p);
    if (it.type === 'weapon') return p.pickup(it.ref) || p.swapWeapon(it.ref);
    return false;
  },
  _autoPickup() {
    const p = this.player;
    if (!p || !p.alive || p.mode !== 'ground') return;
    Items.forNear(p.x, p.z, 1.5, it => {
      if (!it.rest || it.age < 0.35 || Math.abs(it.y - p.y) > 1.7) return;
      if (it.noPick === p && this.time < it.noPickT) return;
      p.pickup(it);
    });
  },

  update(dt) {
    if (this.state === 'idle') return;
    this.time += dt;
    this._updatePlane(dt);
    const ended = this.state === 'ended';
    if (!ended) BotAI.update(dt);
    else for (const c of this.chars) { const i = c.in; i.mx = i.mz = 0; i.fire = i.firePressed = i.jump = i.sprint = false; i.use = null; i.nade = false; i.reload = false; i.slot = -1; }
    for (let i = 0; i < this.chars.length; i++) this.chars[i].update(dt);
    if (ended) { Items.update(dt); return; }
    Combat.update(dt);
    Items.update(dt);
    this._pickT -= dt;
    if (this._pickT <= 0) { this._pickT = 0.08; this._autoPickup(); this._findInteract(); }
    if (this.wantInteract) { this.wantInteract = false; this.doInteract(); this._findInteract(); }
    this.wantJump = false;
    // ---- safe zone
    if (this.state === 'playing') {
      Zone.update(dt);
      this._zoneTick += dt;
      if (this._zoneTick >= 0.5) {
        this._zoneTick -= 0.5;
        for (const c of this.chars) {
          if (!c.alive || c.mode === 'plane') continue;
          if (Zone.outside(c.x, c.z)) { c.damage(Zone.dps * 0.5, null, 'zone', false, true); if (c === this.player) this.events.emit('zoneHurt'); }
        }
      }
      // supply drops at the start of selected phases
      for (const ph of [1, 3]) if (Zone.phase === ph && Zone.state === 'wait' && !this._dropPhases[ph]) { this._dropPhases[ph] = true; this._spawnAirdrop(); }
    }
    this._updateAirdrops(dt);
    while (this.noises.length && this.time - this.noises[0].t > 2) this.noises.shift();
  },
};

// true when a building footprint is close to (x, z)
function World_nearStructure(x, z, margin) {
  for (const f of World.footprints) if (dist2D(x, z, f.x, f.z) < Math.max(f.w, f.d) * 0.72 + margin) return true;
  return false;
}
