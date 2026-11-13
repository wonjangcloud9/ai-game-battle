// AURORA FALL — match flow: drop plane, characters, zone damage, supply drops, win conditions (no DOM dependencies)
'use strict';

const Game = {
  events: makeEmitter(),
  state: 'idle',            // idle | plane | playing | ended
  time: 0, chars: [], player: null, rng: makeRng(1), diff: DIFFICULTY.normal, diffName: 'normal',
  aliveCount: 0, plane: null, airdrops: [], winner: null, playerDead: false, endTime: 0,
  noises: [], interact: null, wantJump: false, wantInteract: false,
  playerLandT: -1,          // match time at which the player first touched the ground (-1 while still dropping)
  playerArmedT: -1,         // match time at which the player first held a gun
  // squad mode (see SQUAD in config.js): teams of four, knock-downs, the last team standing wins
  squad: false, teams: [], teamsAlive: 0, winTeam: null,
  _zoneTick: 0, _pickT: 0, _dropPhases: {},

  start(opts) {
    opts = opts || {};
    const seed = opts.seed || ((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    const rng = this.rng = makeRng(seed);
    this.seed = seed;
    this.diffName = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
    this.diff = DIFFICULTY[this.diffName];
    this.squad = !!opts.squad; this.teams = []; this.teamsAlive = 0; this.winTeam = null;
    this.time = 0; this.state = 'plane'; this.winner = null; this.playerDead = false; this.endTime = 0;
    this.noises = []; this.airdrops = []; this.interact = null; this.wantJump = false; this.wantInteract = false;
    this._zoneTick = 0; this._pickT = 0; this._dropPhases = {}; this.playerLandT = -1; this.playerArmedT = -1;
    this._kept.t = -1; this._kept.gun = null; this._kept.chest = null;
    Items.reset(); Items.spawnInitial(rng);
    // vehicles draw from a random stream of their own, so that the loot, the bots and the zone of a seed stay what they were
    Vehicles.reset();
    if (opts.vehicles !== false) Vehicles.spawnInitial(makeRng((seed ^ 0x5bd1e995) >>> 0), this.squad);
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
    if (this.squad) this._makeTeams(seed);
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
  // and rising as the field thins, which keeps the match length close to the zone schedule (numbers: CFG.BOT_BASE ...).
  // Squad mode goes by teams and by its own numbers (SQUAD.botBase / botGain). With attacker and victim given, the player's
  // own team-mates give and take by the difficulty (DIFFICULTY.mates: what they deal to other bots, what they take from them).
  botScale(by, to) {
    if (this.squad) {
      const left = clamp01(1 - (this.teamsAlive - 2) / Math.max(1, this.teams.length - 2));     // 0 = every team still in, 1 = the last two
      let q = SQUAD.botBase + SQUAD.botGain * Math.pow(left, 1.5);
      if (Zone.phase >= 4) q = Math.max(q, SQUAD.botLate);
      const p = this.player, M = this.diff.mates;
      if (p && M) { if (by && by.team === p.team) q *= M[0]; else if (to && to.team === p.team) q *= M[1]; }
      return Math.min(1, q);
    }
    const thin = clamp01(1 - (this.aliveCount - 4) / (this.chars.length - 4));   // 0 = full lobby, 1 = final few
    let s = CFG.BOT_BASE + CFG.BOT_VS_BOT * Math.pow(thin, CFG.BOT_POW);
    if (Zone.phase >= 4) s = Math.max(s, CFG.BOT_LATE);
    return s;
  },
  // Share of a reload that a bot pays for out of its reserve (see Character._spend): as much as its shots are worth.
  botAmmo() { return Math.max(CFG.BOT_AMMO, this.botScale()); },
  // ---- the opening (see OPENING in config.js). Everything is counted from the player's own landing, so jumping late costs nothing.
  // Seconds since the player touched down (0 while still in the air).
  sinceLanding() { return this.playerLandT < 0 ? 0 : this.time - this.playerLandT; },
  // Match time at which the landing protection ends (Infinity while the player is still in the air).
  protectEnd() {
    if (this.playerLandT < 0) return Infinity;
    const g = this.diff.grace, armed = this.playerArmedT < 0 ? Infinity : this.playerArmedT - this.playerLandT + OPENING.armedGrace;
    return this.playerLandT + clamp(armed, g, g * OPENING.unarmedMul);
  },
  // Landing protection: bots neither pick a fight with the player nor hurt them (a bot the player has hurt does fight back).
  playerShielded() { return !!this.player && this.time < this.protectEnd(); },
  graceLeft() { return this.player && this.playerLandT >= 0 ? Math.max(0, this.protectEnd() - this.time) : 0; },
  // What the countdown chip shows: [seconds, extended]. Picking up a gun must never appear to cost protection time, so while
  // the player is unarmed only the guaranteed part counts down; in the extension the end depends on when a gun is found and no
  // number is shown (seconds = -1) until the hard limit is as close as the armedGrace a pick-up would leave anyway.
  graceShown() {
    const left = this.graceLeft();
    if (left <= 0) return [0, false];
    if (this.playerArmedT >= 0) return [left, false];
    const base = this.diff.grace - this.sinceLanding();
    if (base > 0) return [base, false];
    return [left <= OPENING.armedGrace ? left : -1, true];
  },
  // 0 until the protection has run out, then rising to 1 = bots at full strength against the player.
  // With a bot: how far along that particular bot is (one the player attacked does not start from zero).
  playerEase(bot) {
    const e = clamp01((this.time - this.protectEnd()) / OPENING.ramp);
    return bot && bot.provoked ? Math.max(e, OPENING.provoked) : e;
  },
  // Damage scale for a bot hitting the player. 0 = soaked up by the landing protection (stray fire from a fight between bots included).
  playerScale(bot) {
    if (bot && !bot.provoked && this.playerShielded()) return 0;
    return this.diff.dmgToPlayer * lerp(OPENING.dmg, 1, this.playerEase(bot));
  },
  // First pick: from the final approach of the glide until the landing protection ends, a bot keeps its hands off a gun or chest
  // the player is nearer to.
  // (squad mode: the player's own team-mates do so all match long, within SQUAD.dibs metres)
  playerHasDibs(bot, x, z) {
    const p = this.player;
    if (!p || !p.alive) return false;
    const mate = this.squad && bot.team === p.team;
    if (!mate && !this.playerShielded()) return false;
    if (p.mode !== 'ground' && !(p.mode === 'glide' && p.y - Terrain.height(p.x, p.z) < CFG.DROP_GLIDE_ALT)) return false;
    const d = Math.hypot(p.x - x, p.z - z);
    // For the first SQUAD.keepT seconds on the ground, while the player has no gun at all: a team-mate that has one keeps
    // its hands off every gun and chest within SQUAD.dibsBare metres of the player, nearer to it or not. (Three bots
    // landing beside the player, each filling three slots, took two or three guns from around a newcomer before that
    // newcomer had found the first. Not for longer than that: a team whose bots stay unarmed for a player who is in no
    // hurry does worse.)
    if (mate && bot !== p && !p.hasGun() && this.sinceLanding() < SQUAD.keepT) {
      if (bot.hasGun() && d < SQUAD.dibsBare) return true;
      // ... and the one gun and the one chest nearest to the player are the player's, whoever of the team is nearer to them
      const R = this._kept;
      if (this.time - R.t > 0.25 || this.time < R.t) {
        R.t = this.time; R.gun = null; R.chest = null;
        let bd = SQUAD.dibsBare;
        Items.forNear(p.x, p.z, SQUAD.dibsBare, (it, q) => { if (it.kind === 'weapon' && it.rest && !it.upper && q < bd) { bd = q; R.gun = it; } });
        bd = SQUAD.dibsBare;
        for (const c of Items.chests) { if (c.opened || c.upper) continue; const q = Math.hypot(c.x - p.x, c.z - p.z); if (q < bd) { bd = q; R.chest = c; } }
      }
      if ((R.gun && R.gun.alive && R.gun.x === x && R.gun.z === z) || (R.chest && R.chest.x === x && R.chest.z === z)) return true;
    }
    return d < (mate ? SQUAD.dibs : OPENING.dibs) && d < Math.hypot(bot.x - x, bot.z - z);
  },
  _kept: { t: -1, gun: null, chest: null },      // (squad mode: what is being kept for a player without a gun, looked up four times a second)
  // Squad mode: what has only just dropped right next to the player (the contents of a chest the player opened, what a
  // fallen enemy leaves behind) is the player's to pick through first.
  freshForPlayer(bot, it) {
    const p = this.player;
    if (!p || bot === p || !p.alive || p.mode !== 'ground' || bot.team !== p.team || it.age >= SQUAD.freshT) return false;
    return Math.hypot(p.x - it.x, p.z - it.z) < SQUAD.fresh;
  },
  // How many bots may hunt the player at the same time: one at first, no limit once the opening is over.
  maxHunters() { const e = this.playerEase(); return e >= 1 ? 99 : 1 + Math.floor(e * 3); },
  noise(x, z, loud, src) {
    if (loud <= 0) return;
    this.noises.push({ x, z, loud, src, t: this.time });
    if (this.noises.length > 24) this.noises.shift();
  },

  // ---- squad mode
  // Teams of SQUAD.size in the order of the character list: the player's team comes first. Each team wears one jacket
  // colour (the player's choice for theirs), so that friend and foe can be told apart at a glance.
  _makeTeams(seed) {
    const rng = makeRng((seed ^ 0x2545f491) >>> 0), n = SQUAD.size, p = this.player;      // (a stream of its own: loot, bots and zone of a seed stay what they were)
    const cols = [];
    for (let i = 0; i < SUIT_COLORS.length; i++) if (!p || i !== p.color) cols.push(i);
    rng.shuffle(cols);
    for (let i = 0; i < this.chars.length; i += n) {
      const id = this.teams.length, members = this.chars.slice(i, i + n), mine = !!p && members.indexOf(p) >= 0;
      const T = { id, members, mine, color: mine ? p.color : cols[id % cols.length], out: false, placement: 0 };
      for (const m of members) { m.team = id; m.squad = T; m.color = T.color; }
      this.teams.push(T);
    }
    this.teamsAlive = this.teams.length;
  },
  // on their feet (or still dropping in): alive and not knocked down
  standing(c) { return c.alive && c.mode !== 'down'; },
  // Out of hit points: knocked down rather than dead as long as a team-mate is still standing.
  canKnock(c) {
    if (!this.squad) return false;
    for (const m of c.squad.members) if (m !== c && m.alive && m.mode !== 'down') return true;
    return false;
  },
  // whom the bots of a team follow: its first member on their feet (in the player's team that is the player)
  leaderOf(c) {
    if (c.squad) for (const m of c.squad.members) if (m.alive && m.mode !== 'down') return m;
    return c;
  },
  // nearest knocked-down team-mate of c within r metres (unless anyY: on the same level, as it takes to help), or null
  downedMate(c, r, anyY) {
    let best = null, bd = r, free = null, fd = r;      // (free: one nobody else is helping yet: that one first)
    if (c.squad) for (const m of c.squad.members) {
      if (m === c || !m.alive || m.mode !== 'down') continue;
      const d = Math.hypot(m.x - c.x, m.z - c.z);
      if (!(anyY || Math.abs(m.y - c.y) < 1.8)) continue;
      if (d < bd) { bd = d; best = m; }
      if (d < fd && (!m.reviver || m.reviver === c)) { fd = d; free = m; }
    }
    return free || best;
  },
  onKnock(victim, attacker, weaponId, head) {
    if (attacker && attacker !== victim) attacker.knocks++;
    this.events.emit('knock', victim, attacker, weaponId, head);
  },
  // A member of a team has died: if nobody of it is left standing, those who were down go too, and the team is out.
  _teamAfterDeath(victim) {
    const T = victim.squad;
    if (!T.members.some(m => m.alive && m.mode !== 'down')) for (const m of T.members) if (m.alive) m._die(m.downBy, m.downWeapon, false);
    if (T.out || T.members.some(m => m.alive)) return;
    T.out = true; this.teamsAlive--;
    T.placement = this.teamsAlive + 1;
    for (const m of T.members) m.placement = T.placement;
    this.events.emit('teamOut', T);
    if (this.teamsAlive <= 1 && this.state !== 'ended') {
      const W = this.teams.find(t => !t.out) || T, p = this.player;
      W.placement = 1;
      for (const m of W.members) m.placement = 1;
      this.winTeam = W;
      this.winner = (p && p.squad === W && this.standing(p) ? p : null) || W.members.find(m => this.standing(m)) || W.members.find(m => m.alive) || W.members[0];
      this.state = 'ended'; this.endTime = this.time;
      this.events.emit('end', this.winner);
    }
  },

  onDeath(victim, attacker, weaponId, head) {
    this.aliveCount--;
    if (this.squad) {                 // (placements go by team: see _teamAfterDeath)
      if (attacker && attacker !== victim) attacker.kills++;
      Items.dropAll(victim, this.rng);
      this.events.emit('death', victim, attacker, weaponId, head);
      if (victim === this.player) { this.playerDead = true; this.events.emit('playerDeath', victim, attacker, weaponId); }
      this._teamAfterDeath(victim);
      return;
    }
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

  // Nearest thing the player can interact with (chest to open / vehicle to get into / weapon to swap for; at the wheel: getting out).
  _findInteract() {
    const p = this.player, was = this.interact && this.interact.type === 'weapon' ? this.interact.ref : null;
    this.interact = null;
    if (!p || !p.alive) return;
    if (p.mode === 'drive') { this.interact = { type: 'exit', ref: p.vehicle, label: '내리기' }; return; }
    if (p.mode !== 'ground') return;
    if (this.squad) {                 // a team-mate who is down comes before everything else
      if (p.reviving) return;         // (hands full)
      const m = p.swimming ? null : this.downedMate(p, SQUAD.reviveRange);
      if (m && !(m.reviver && m.reviver !== p)) { this.interact = { type: 'revive', ref: m, label: '살리기: ' + m.name }; return; }
    }
    const chest = Items.nearestChest(p.x, p.z, CFG.CHEST_RANGE, p.y);
    if (chest) { this.interact = { type: 'chest', ref: chest, label: chest.airdrop ? '보급 상자 열기' : '상자 열기' }; return; }
    // (the gun offered a moment ago stays the one on offer unless another is clearly nearer: between two guns lying side
    //  by side the prompt would otherwise change with every step)
    let best = null, bd = CFG.PICKUP_RANGE, bs = CFG.PICKUP_RANGE;
    Items.forNear(p.x, p.z, CFG.PICKUP_RANGE, (it, d) => {
      if (it.kind !== 'weapon' || !it.rest || Math.abs(it.y - p.y) > 1.8) return;
      const sc = it === was ? d - 0.4 : d;
      if (sc < bs) { bs = sc; bd = d; best = it; }
    });
    // a vehicle, unless a gun lies clearly closer than its side (the gun of a driver just shot lies right at the door)
    const veh = p.swimming ? null : Vehicles.nearest(p.x, p.z, p.y, VEHICLE_CFG.enter, p);
    if (veh && !(best && bd + 0.4 < Vehicles.nearestDist)) { this.interact = { type: 'vehicle', ref: veh, label: (veh.driver ? '같이 타기: ' : '타기: ') + veh.def.name }; return; }
    if (best) {
      const free = p.weapons.indexOf(null) >= 0, held = p.curWeapon(), name = RARITY[best.rarity].name + ' ' + WEAPONS[best.type].name;
      // with all three slots taken, F swaps out the gun in hand: say which one goes
      this.interact = { type: 'weapon', ref: best, label: free ? '줍기: ' + name : '교체: ' + (held ? WEAPONS[held.type].name + ' → ' : '') + name, rarity: best.rarity };
    }
  },
  doInteract() {
    const it = this.interact, p = this.player;
    if (!it || !p || !p.alive) return false;
    if (it.type === 'exit') return Vehicles.exit(p);
    if (it.type === 'revive') return p.startRevive(it.ref);
    if (it.type === 'vehicle') return Vehicles.enter(p, it.ref);
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
    const pl = this.player;
    if (pl) {
      if (this.playerLandT < 0 && pl.mode === 'ground') this.playerLandT = this.time;
      if (this.playerArmedT < 0 && pl.hasGun()) this.playerArmedT = this.time;
    }
    this._updatePlane(dt);
    const ended = this.state === 'ended';
    if (!ended) BotAI.update(dt);
    else for (const c of this.chars) { const i = c.in; i.mx = i.mz = 0; i.fire = i.firePressed = i.jump = i.sprint = false; i.use = null; i.nade = false; i.reload = false; i.slot = -1; i.drive = 0; i.steer = 0; i.brake = false; }
    for (let i = 0; i < this.chars.length; i++) this.chars[i].update(dt);
    Vehicles.update(dt);
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
          if (this.squad && this.state === 'ended') break;      // (the tick that decides the match does not go on to take the winners as well)
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
