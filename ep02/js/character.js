// AURORA FALL — character simulation shared by the player and bots (no DOM dependencies)
'use strict';

const _cpos = { x: 0, z: 0 };
const _cn = [0, 1, 0];

class Character {
  // Stride phase (radians) per metre travelled: short quick steps when crouched or walking, long ones at a run.
  // The model derives the stride length from the same number, so the feet keep pace with the ground.
  static stepRate(speed, crouch, sprinting) { return crouch ? 4.0 : sprinting ? 1.55 : lerp(2.7, 1.85, clamp01((speed - 3.3) / 2.4)); }
  constructor(id, name, isPlayer, color) {
    this.id = id; this.name = name; this.isPlayer = isPlayer; this.color = color;
    this.bot = null;
    this.team = id; this.squad = null;      // solo: everybody is a team of one; squad mode: Game._makeTeams fills these in
    this.in = { mx: 0, mz: 0, sprint: false, crouch: false, jump: false, fire: false, firePressed: false, ads: false, reload: false, use: null, nade: false, slot: -1, aimYaw: 0, aimPitch: 0,
      drive: 0, steer: 0, brake: false };      // at the wheel: throttle (-1 .. 1), steering (-1 left .. 1 right), handbrake
    this.resetState();
  }
  resetState() {
    this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.aimYaw = 0; this.aimPitch = 0;
    this.hp = CFG.MAX_HP; this.shield = 0; this.alive = true;
    this.mode = 'plane'; this.grounded = false; this.crouch = false; this.sprinting = false; this.swimming = false;
    this.weapons = [null, null, null]; this.slot = 0;
    this.ammo = { light: 0, medium: 0, shell: 0, heavy: 0 };
    this.heals = { bandage: 0, medkit: 0, cell: 0 }; this.grenades = 0;
    this.fireCd = 0; this.reloadT = 0; this.reloadTotal = 0; this.switchT = 0; this.useT = 0; this.useTotal = 0; this.useType = null;
    this.bloom = 0; this.meleeT = 0; this.throwT = 0; this.fireHold = 0; this.jumpCd = 0;
    this.animPhase = 0; this.moveAmt = 0; this.moveDir = 0; this.hitT = 0; this.fireAnim = 0; this.meleeAnim = 0; this.deadT = 0; this.airT = 0; this.landT = 0;
    this.lastShotT = -99; this.lastStepPhase = 0; this.glideT = 0;
    this.kills = 0; this.damageDealt = 0; this.lastDamageBy = null; this.lastDamageT = -99; this.lastDamageWeapon = ''; this.placement = 0; this.deathPos = null; this.killer = null; this.killWeapon = '';
    this.aimPoint = null;       // player only: world point under the crosshair
    this.recoilP = 0; this.recoilY = 0;
    this.noPick = null; this.noPickT = 0;
    this.spare = 0;             // bots: fractions of a round saved on reloads (see _spend)
    this.groundY = 0;           // height of the ground under the feet in the frame before (see _updateGround)
    this.provoked = false;      // bots only: the player has hurt this one (it is free to fight back during the landing protection)
    this.vehicle = null;        // the vehicle being driven (mode 'drive')
    this.seat = -1;             // ... or ridden in (squad mode): -1 = at the wheel, otherwise the passenger seat (VEHICLES[..].pass)
    this.rideHitT = -99; this.rideHitBy = null;      // when and by whom that vehicle was last shot
    // squad mode (see SQUAD in config.js): knocked down (mode 'down') and helping a team-mate up
    this.downT = 0; this.downs = 0; this.bleed = 0; this.downBy = null; this.downWeapon = '';
    this.reviving = null; this.reviver = null; this.reviveT = 0; this.reviveTotal = 0;      // the team-mate being helped up / who is helping this one
    this.knocks = 0; this.revives = 0; this.lastHit = null; this.lastHitT = -99;            // lastHit: whom this character last hurt
  }
  curWeapon() { return this.weapons[this.slot]; }
  def() { const w = this.weapons[this.slot]; return w ? WEAPONS[w.type] : WEAPONS.fists; }
  // (in a seat `y` is half a metre under the hips: see Vehicles._seat)
  eyeY() { return this.y + (this.mode === 'drive' ? 1.18 : this.mode === 'down' ? 0.5 : this.swimming ? 1.3 : this.crouch ? CFG.CROUCH_EYE : CFG.EYE_HEIGHT); }
  height() { return this.mode === 'down' ? 0.8 : this.crouch ? CFG.CROUCH_HEIGHT : CFG.CHAR_HEIGHT; }
  hasGun() { return !!(this.weapons[0] || this.weapons[1] || this.weapons[2]); }
  gunCount() { return (this.weapons[0] ? 1 : 0) + (this.weapons[1] ? 1 : 0) + (this.weapons[2] ? 1 : 0); }

  // ------------------------------------------------------------------ inventory
  pickup(it) {
    if (!it.alive || !this.alive) return false;
    if (it.kind === 'ammo') return this._take(it, this.ammo, it.type, AMMO[it.type].max);
    if (it.kind === 'heal') return this._take(it, this.heals, it.type, HEALS[it.type].max);
    if (it.kind === 'grenade') {
      const room = GRENADE.max - this.grenades;
      if (room <= 0) return false;
      const n = Math.min(room, it.count);
      this.grenades += n; it.count -= n;
      Game.events.emit('pickup', this, it, n);
      if (it.count <= 0) Items.remove(it);
      return true;
    }
    // weapon: needs a free slot
    let s = this.weapons[this.slot] ? -1 : this.slot;
    if (s < 0) s = this.weapons.indexOf(null);
    if (s < 0) return false;
    const hadGun = this.hasGun();
    this.weapons[s] = { type: it.type, rarity: it.rarity, ammo: it.ammo };
    if (!hadGun || !this.weapons[this.slot]) { this.slot = s; this.switchT = 0.25; }
    Game.events.emit('pickup', this, it, 1);
    Items.remove(it);
    return true;
  }
  _take(it, store, type, max) {
    const room = max - store[type];
    if (room <= 0) return false;
    const n = Math.min(room, it.count);
    store[type] += n; it.count -= n;
    Game.events.emit('pickup', this, it, n);
    if (it.count <= 0) Items.remove(it);
    return true;
  }
  // Replace the weapon in the given (or current) slot with a world item.
  swapWeapon(it, slot) {
    if (!it.alive || it.kind !== 'weapon') return false;
    const s = slot === undefined ? this.slot : slot;
    const old = this.weapons[s];
    if (old) {
      const d = Items.spawn({ kind: 'weapon', type: old.type, rarity: old.rarity, ammo: old.ammo, count: 1 }, this.x, this.y + 0.6, this.z,
        [Math.sin(this.aimYaw) * 2.2, 3.2, Math.cos(this.aimYaw) * 2.2], this.y > Terrain.height(this.x, this.z) + 2);
      d.noPick = this; d.noPickT = Game.time + 2.0;
    }
    this.weapons[s] = { type: it.type, rarity: it.rarity, ammo: it.ammo };
    this.slot = s; this.switchT = 0.3; this.cancelReload(); this.bloom = 0;
    Game.events.emit('pickup', this, it, 1);
    Items.remove(it);
    return true;
  }
  switchTo(s) {
    if (s === this.slot || s < 0 || s > 2 || this.reviving) return;
    this.slot = s; this.switchT = 0.32; this.bloom = 0;
    this.cancelReload(); this.cancelUse();
    Game.events.emit('switch', this);
  }
  startReload() {
    const w = this.curWeapon();
    if (!w || this.reloadT > 0 || this.switchT > 0 || this.reviving) return false;
    const def = WEAPONS[w.type];
    if (w.ammo >= def.mag || this.ammo[def.ammo] <= 0) return false;
    this.cancelUse();
    this.reloadTotal = this.reloadT = def.reload * RARITY[w.rarity].reload;
    Game.events.emit('reload', this, def);
    return true;
  }
  cancelReload() { this.reloadT = 0; }
  _finishReload() {
    const w = this.curWeapon();
    if (!w) return;
    const def = WEAPONS[w.type];
    if (def.shellReload) {
      if (this.ammo[def.ammo] > 0 && w.ammo < def.mag) { w.ammo++; this._spend(def.ammo, 1); }
      if (w.ammo < def.mag && this.ammo[def.ammo] > 0) { this.reloadTotal = this.reloadT = def.reload * RARITY[w.rarity].reload; Game.events.emit('reload', this, def); }
    } else {
      const n = Math.min(def.mag - w.ammo, this.ammo[def.ammo]);
      w.ammo += n; this._spend(def.ammo, n);
    }
  }
  // Take n rounds out of the reserve for a reload. A bot pays only part of them (Game.botAmmo): while the bots do each
  // other a fraction of the real damage, their fights last that much longer, and at full price most of the lobby stood
  // there with empty guns after a minute and a half. The magazine and the reloading itself are as for everybody.
  _spend(type, n) {
    if (!this.isPlayer) { this.spare += n * (1 - Game.botAmmo()); const free = Math.min(n, Math.floor(this.spare)); this.spare -= free; n -= free; }
    this.ammo[type] -= n;
  }
  startUse(type) {
    const h = HEALS[type];
    if (!h || this.useT > 0 || this.heals[type] <= 0 || this.mode !== 'ground' || this.reviving) return false;
    if (h.hp > 0 && this.hp >= CFG.MAX_HP) return false;
    if (h.shield > 0 && this.shield >= CFG.MAX_SHIELD) return false;
    this.cancelReload();
    this.useType = type; this.useTotal = this.useT = h.time;
    Game.events.emit('useStart', this, type);
    return true;
  }
  cancelUse() { if (this.useT > 0) { this.useT = 0; this.useType = null; Game.events.emit('useCancel', this); } }
  _finishUse() {
    const h = HEALS[this.useType];
    if (h && this.heals[this.useType] > 0) {
      this.heals[this.useType]--;
      this.hp = Math.min(CFG.MAX_HP, this.hp + h.hp);
      this.shield = Math.min(CFG.MAX_SHIELD, this.shield + h.shield);
      Game.events.emit('heal', this, this.useType);
    }
    this.useType = null;
  }
  // ------------------------------------------------------------------ squad: helping a knocked-down team-mate up
  startRevive(t) {
    if (!this.alive || this.mode !== 'ground' || this.swimming || this.reviving || !t || t === this || !t.alive || t.mode !== 'down' || t.team !== this.team) return false;
    if (t.reviver && t.reviver !== this) return false;                 // somebody is at it already
    if (Math.hypot(t.x - this.x, t.z - this.z) > SQUAD.reviveRange || Math.abs(t.y - this.y) > 1.8) return false;
    this.cancelReload(); this.cancelUse();
    this.reviving = t; t.reviver = this; this.reviveTotal = this.reviveT = SQUAD.reviveTime;
    Game.events.emit('reviveStart', this, t);
    return true;
  }
  cancelRevive() {
    const t = this.reviving;
    if (!t) return;
    this.reviving = null; this.reviveT = 0;
    if (t.reviver === this) t.reviver = null;
    Game.events.emit('reviveStop', this, t);
  }
  _tickRevive(dt) {
    const t = this.reviving;
    if (!t.alive || t.mode !== 'down' || t.reviver !== this || this.swimming || Math.hypot(t.x - this.x, t.z - this.z) > SQUAD.reviveLeash || Math.abs(t.y - this.y) > 2.2) { this.cancelRevive(); return; }
    this.reviveT -= dt;
    if (this.reviveT > 0) return;
    this.reviving = null; this.reviveT = 0; t.reviver = null; this.revives++;
    t._getUp(this);
  }
  // back on their feet
  _getUp(by) {
    this.mode = 'ground'; this.hp = SQUAD.reviveHp; this.downBy = null; this.downWeapon = ''; this.switchT = Math.max(this.switchT, 0.5);
    this.vx = 0; this.vz = 0;
    Game.events.emit('revive', by, this);
  }

  // ------------------------------------------------------------------ damage
  // Returns the amount actually removed. bypass = ignore shield (zone damage).
  damage(amount, attacker, weaponId, head, bypass) {
    if (!this.alive || this.mode === 'plane' || amount <= 0) return 0;
    const down = this.mode === 'down';                                 // (what is left of somebody who is down is not behind their shield)
    let dealt = 0, shieldDmg = 0;
    if (!bypass && !down && this.shield > 0) {
      shieldDmg = Math.min(this.shield, amount);
      this.shield -= shieldDmg; amount -= shieldDmg; dealt += shieldDmg;
      if (this.shield <= 0.001) { this.shield = 0; Game.events.emit('shieldBreak', this); }
    }
    if (amount > 0) { const h = Math.min(this.hp, amount); this.hp -= h; dealt += h; }
    if (!bypass) this.hitT = 0.2;
    this.lastDamageT = Game.time;
    if (attacker) { this.lastDamageBy = attacker; this.lastDamageWeapon = weaponId; attacker.damageDealt += dealt; if (attacker.isPlayer) this.provoked = true; attacker.lastHit = this; attacker.lastHitT = Game.time; }
    if (this.useT > 0 && !bypass) this.cancelUse();
    Game.events.emit('damage', this, attacker, dealt, !!head, shieldDmg, weaponId);
    if (this.hp <= 0.001) {
      if (!down && Game.canKnock(this)) this._knock(attacker, weaponId, !!head);
      else this._die(attacker, weaponId, !!head);
    }
    return dealt;
  }
  // Squad mode: out of hit points with a team-mate still standing. Down, not out.
  _knock(attacker, weaponId, head) {
    this.cancelRevive(); this.cancelUse();
    if (this.vehicle) Vehicles.driverDown(this);                       // out of the seat, onto the ground beside it
    this.mode = 'down'; this.hp = SQUAD.downHp; this.downT = 0;
    this.bleed = SQUAD.bleed[Math.min(this.downs, SQUAD.bleed.length - 1)]; this.downs++;
    this.downBy = attacker || null; this.downWeapon = weaponId || 'zone';
    this.reloadT = 0; this.crouch = false; this.sprinting = false; this.fireHold = 0; this.grounded = false;
    Game.onKnock(this, attacker, weaponId, head);
  }
  _die(attacker, weaponId, head) {
    if (!this.alive) return;
    // Finished off, bled out or lost with the rest of the team: the kill belongs to whoever knocked this one down.
    if (this.mode === 'down' && this.downBy && this.downBy !== this) { attacker = this.downBy; weaponId = this.downWeapon; head = false; }
    this.cancelRevive();
    if (this.reviver) this.reviver.cancelRevive();
    if (this.vehicle) Vehicles.driverDown(this);
    this.alive = false; this.mode = 'dead'; this.deadT = 0; this.hp = 0;
    this.deathPos = [this.x, this.y, this.z];
    this.killer = attacker || null; this.killWeapon = weaponId || 'zone';
    this.reloadT = 0; this.useT = 0;
    Game.onDeath(this, attacker, weaponId, head);
  }

  // ------------------------------------------------------------------ simulation
  update(dt) {
    if (this.hitT > 0) this.hitT -= dt;
    if (this.fireAnim > 0) this.fireAnim -= dt;
    if (this.meleeAnim > 0) this.meleeAnim -= dt;
    if (this.landT > 0) this.landT -= dt;
    if (this.mode === 'dead') {
      this.deadT += dt;
      // a body that died in the air (or on a ledge that is gone) drops to the ground
      const g = Math.max(Phys.groundHeight(this.x, this.z, this.y, CFG.CHAR_RADIUS), -CFG.SWIM_DEPTH);
      if (this.y > g + 0.01) { this.vy -= CFG.GRAVITY * dt; this.y = Math.max(g, this.y + this.vy * dt); } else this.vy = 0;
      return;
    }
    if (this.mode === 'plane') return;
    const inp = this.in;
    this.aimYaw = inp.aimYaw; this.aimPitch = clamp(inp.aimPitch, -1.45, 1.45);
    if (this.mode === 'fall') this._updateFall(dt);
    else if (this.mode === 'glide') this._updateGlide(dt);
    else if (this.mode === 'drive') this._updateDrive(dt);
    else if (this.mode === 'down') this._updateDown(dt);
    else this._updateGround(dt);
  }
  // Knocked down (squad mode): bleeding out unless a team-mate is at work, crawling at best. The moving itself is that of
  // somebody on foot, with everything else switched off (see `down` in _updateGround).
  _updateDown(dt) {
    this.downT += dt;
    if (!this.reviver && Game.state !== 'ended') {
      this.hp -= this.bleed * dt;
      if (this.hp <= 0) { this.hp = 0; this._die(this.downBy, this.downWeapon, false); return; }
    }
    this._updateGround(dt);
  }
  jumpFromPlane(pvx, pvz) {
    if (this.mode !== 'plane') return;
    this.mode = 'fall'; this.vx = pvx * 0.45; this.vz = pvz * 0.45; this.vy = -6; this.airT = 0; this.glideT = 0;
    this.yaw = this.aimYaw;
    Game.events.emit('jumpPlane', this);
  }
  _land(hard) {
    this.mode = 'ground'; this.grounded = true; this.vy = 0; this.landT = 0.35;
    Game.events.emit('land', this, hard);
  }
  _updateFall(dt) {
    const inp = this.in;
    this.airT += dt;
    const dive = clamp01((-this.aimPitch - 0.15) / 0.85);
    const term = lerp(CFG.FREEFALL_SPEED, CFG.DIVE_SPEED, dive);
    this.vy = moveToward(this.vy, -term, 34 * dt);
    const hs = lerp(24, 9, dive);
    let mx = inp.mx, mz = inp.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    this.vx = dampTo(this.vx, mx * hs, 2.2, dt); this.vz = dampTo(this.vz, mz * hs, 2.2, dt);
    this.x = clamp(this.x + this.vx * dt, -Terrain.HALF + 8, Terrain.HALF - 8);
    this.z = clamp(this.z + this.vz * dt, -Terrain.HALF + 8, Terrain.HALF - 8);
    this.y += this.vy * dt;
    this.yaw = dampAngle(this.yaw, this.aimYaw, 6, dt);
    const g = Math.max(Phys.groundHeight(this.x, this.z, this.y, CFG.CHAR_RADIUS), -CFG.SWIM_DEPTH);
    const alt = this.y - g;
    if (alt < CFG.DROP_GLIDE_ALT || (inp.jump && this.airT > 0.6)) { this.mode = 'glide'; this.glideT = 0; Game.events.emit('glider', this); }
    if (this.y <= g) { this.y = g; this._land(true); }
  }
  _updateGlide(dt) {
    const inp = this.in;
    this.airT += dt; this.glideT += dt;
    this.vy = dampTo(this.vy, -CFG.GLIDE_FALL, 3.5, dt);
    let mx = inp.mx, mz = inp.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const hs = CFG.GLIDE_SPEED;
    this.vx = dampTo(this.vx, mx * hs, 2.6, dt); this.vz = dampTo(this.vz, mz * hs, 2.6, dt);
    _cpos.x = clamp(this.x + this.vx * dt, -Terrain.HALF + 8, Terrain.HALF - 8);
    _cpos.z = clamp(this.z + this.vz * dt, -Terrain.HALF + 8, Terrain.HALF - 8);
    Phys.collideXZ(_cpos, this.y, CFG.CHAR_RADIUS, CFG.CHAR_HEIGHT);
    this.x = _cpos.x; this.z = _cpos.z;
    this.y += this.vy * dt;
    const sp = Math.hypot(this.vx, this.vz);
    this.yaw = dampAngle(this.yaw, sp > 2 ? Math.atan2(this.vx, this.vz) : this.aimYaw, 5, dt);
    const g = Math.max(Phys.groundHeight(this.x, this.z, this.y, CFG.CHAR_RADIUS), -CFG.SWIM_DEPTH);
    if (this.y <= g + 0.02) { this.y = g; this.vx *= 0.4; this.vz *= 0.4; this._land(false); }
  }
  // At the wheel (or, in squad mode, in a passenger seat): the vehicle does the moving (Vehicles.update puts everybody in
  // their seats); the driver passes the controls on. Changing or reloading the gun is possible, using it is not.
  _updateDrive(dt) {
    const inp = this.in, v = this.vehicle;
    if (!v) { this.mode = 'ground'; this.grounded = false; return; }
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.switchT > 0) this.switchT -= dt;
    if (this.meleeT > 0) this.meleeT -= dt;
    if (this.throwT > 0) this.throwT -= dt;
    if (this.fireHold > 0) this.fireHold -= dt;
    if (this.bloom > 0) this.bloom = Math.max(0, this.bloom - (this.def().recover || 6) * dt);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; this._finishReload(); } }
    if (v.driver === this) { v.throttle = inp.drive; v.steerIn = inp.steer; v.handbrake = !!inp.brake; }      // (a passenger just sits there)
    this.crouch = false; this.sprinting = false; this.swimming = false; this.grounded = true; this.airT = 0;
    this.moveAmt = dampTo(this.moveAmt, 0, 10, dt);
    if (inp.slot >= 0) this.switchTo(inp.slot);
    if (inp.reload) this.startReload();
  }
  _updateGround(dt) {
    const inp = this.in, R = CFG.CHAR_RADIUS, down = this.mode === 'down';
    // ---- timers
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.switchT > 0) this.switchT -= dt;
    if (this.meleeT > 0) this.meleeT -= dt;
    if (this.throwT > 0) this.throwT -= dt;
    if (this.fireHold > 0) this.fireHold -= dt;
    if (this.jumpCd > 0) this.jumpCd -= dt;
    const wdef = this.def();
    if (this.bloom > 0) this.bloom = Math.max(0, this.bloom - (wdef.recover || 6) * dt);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; this._finishReload(); } }
    if (this.useT > 0) { this.useT -= dt; if (this.useT <= 0) { this.useT = 0; this._finishUse(); } }
    if (this.reviving) this._tickRevive(dt);

    // ---- movement intent
    // (helping a team-mate up is done kneeling, and at a shuffle: walking off breaks it off)
    this.crouch = (inp.crouch || !!this.reviving) && this.grounded && !this.swimming && !down;
    const hgt = this.height();
    let mx = inp.mx, mz = inp.mz, ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }
    const fwd = ml > 0.1 ? (mx * Math.sin(this.aimYaw) + mz * Math.cos(this.aimYaw)) / ml : 0;
    this.sprinting = inp.sprint && ml > 0.5 && (fwd > 0.25 || !this.isPlayer) && !this.crouch && !inp.ads && this.useT <= 0 && this.fireHold <= 0 && !this.swimming && !down;
    let speed = this.swimming ? CFG.SWIM_SPEED : this.crouch ? CFG.CROUCH_SPEED : this.sprinting ? CFG.SPRINT_SPEED : (inp.ads ? CFG.WALK_SPEED : CFG.RUN_SPEED);
    if (this.useT > 0) speed *= 0.55;
    if (down) speed = SQUAD.crawl; else if (this.reviving) speed *= 0.5;
    const tvx = mx * speed, tvz = mz * speed;
    const accel = (this.grounded || this.swimming ? 48 : 10) * dt;
    const dvx = tvx - this.vx, dvz = tvz - this.vz, dl = Math.hypot(dvx, dvz);
    if (dl <= accel) { this.vx = tvx; this.vz = tvz; } else { this.vx += dvx / dl * accel; this.vz += dvz / dl * accel; }
    if (inp.jump && this.grounded && !this.swimming && this.jumpCd <= 0 && !down) {
      this.vy = CFG.JUMP_SPEED; this.grounded = false; this.jumpCd = 0.3;
      Game.events.emit('jump', this);
    }
    if (!this.grounded) this.vy -= CFG.GRAVITY * dt;

    // ---- horizontal move + collisions
    // (in steps short enough not to skip a wall: somebody thrown by a vehicle covers a metre in one frame of a slow display)
    const ox = this.x, oz = this.z, lim = Terrain.HALF - 6;
    const mvx = this.vx * dt, mvz = this.vz * dt, parts = Math.min(8, Math.max(1, Math.ceil(Math.hypot(mvx, mvz) / 0.4)));
    let hit = false;
    _cpos.x = ox; _cpos.z = oz;
    for (let k = 0; k < parts; k++) {
      _cpos.x = clamp(_cpos.x + mvx / parts, -lim, lim); _cpos.z = clamp(_cpos.z + mvz / parts, -lim, lim);
      const shoved = Vehicles.pushOut(_cpos, this.y, R, hgt);        // (before the walls, so that those have the last word)
      if (Phys.collideXZ(_cpos, this.y, R, hgt) || shoved) hit = true;
    }
    // very steep terrain cannot be climbed
    if (this.grounded && !this.swimming) {
      const hOld = Terrain.height(ox, oz), hNew = Terrain.height(_cpos.x, _cpos.z);
      if (hNew > hOld + 0.004 && Math.abs(this.y - hOld) < 0.2) {
        Terrain.normal(_cpos.x, _cpos.z, _cn);
        if (_cn[1] < 0.6) {
          _cpos.x = ox + _cn[0] * 2.5 * dt; _cpos.z = oz + _cn[2] * 2.5 * dt;
          this.vx *= 0.5; this.vz *= 0.5;
        }
      }
    }
    if (hit && dt > 0) { this.vx = (_cpos.x - ox) / dt; this.vz = (_cpos.z - oz) / dt; }
    this.x = _cpos.x; this.z = _cpos.z;

    // ---- vertical
    let ny = this.y + this.vy * dt;
    let ground = Phys.groundHeight(this.x, this.z, this.y, R);
    const floatY = -CFG.SWIM_DEPTH;
    let swim = false;
    if (ground < floatY) { ground = floatY; swim = true; }
    // Still going up, and the ground has come up to meet the feet (a jump while running up a hillside or a flight of
    // stairs): that is a landing too. Without it the body sank up to a metre into the slope until the jump was over.
    // (Not for a ledge that only now comes within stepping height: the jump carries on and comes down onto it.)
    const met = this.vy > 0 && ny < ground - 0.02 && ground - this.groundY < CFG.STEP_HEIGHT;
    this.groundY = ground;
    if ((this.vy <= 0 || met) && ny <= ground + (this.grounded ? 0.32 : 0)) {
      if (!this.grounded && this.vy < -8.5) { this.landT = 0.3; Game.events.emit('land', this, this.vy < -14); }
      ny = ground; this.vy = 0; this.grounded = true;
    } else this.grounded = false;
    this.swimming = swim && ny <= floatY + 0.05;
    if (this.vy > 0) {
      const c = Phys.ceilingHeight(this.x, this.z, ny + hgt, R);
      if (ny + hgt > c - 0.02) { ny = c - hgt - 0.02; this.vy = 0; }
    }
    this.y = ny;
    if (!this.grounded) this.airT += dt; else this.airT = 0;

    // ---- facing + animation state
    const faceAim = !down && (this.isPlayer || inp.ads || inp.fire || this.fireHold > 0 || (this.bot && this.bot.faceAim));      // (crawling: head first)
    const sp = Math.hypot(this.vx, this.vz);
    const targetYaw = faceAim ? this.aimYaw : (sp > 0.6 ? Math.atan2(this.vx, this.vz) : this.yaw);
    this.yaw = dampAngle(this.yaw, targetYaw, faceAim ? 18 : 9, dt);
    this.moveAmt = dampTo(this.moveAmt, clamp01(sp / CFG.RUN_SPEED), 10, dt);
    if (sp > 0.4) this.moveDir = dampAngle(this.moveDir, wrapAngle(Math.atan2(this.vx, this.vz) - this.yaw), 12, dt);
    this.animPhase += sp * dt * Character.stepRate(sp, this.crouch, this.sprinting);
    if ((this.grounded || this.swimming) && sp > 1.5) {
      const steps = Math.floor(this.animPhase / Math.PI);
      if (steps !== this.lastStepPhase) { this.lastStepPhase = steps; Game.events.emit('step', this, sp); }
    }

    // ---- actions
    if (down) return;
    if (inp.slot >= 0) this.switchTo(inp.slot);
    if (inp.reload) this.startReload();
    if (inp.use) this.startUse(inp.use);
    if (inp.nade) Combat.throwGrenade(this);
    if (inp.fire) Combat.tryFire(this, inp.firePressed);
  }
}
