// AURORA FALL — character simulation shared by the player and bots (no DOM dependencies)
'use strict';

const _cpos = { x: 0, z: 0 };
const _cn = [0, 1, 0];

class Character {
  constructor(id, name, isPlayer, color) {
    this.id = id; this.name = name; this.isPlayer = isPlayer; this.color = color;
    this.bot = null;
    this.in = { mx: 0, mz: 0, sprint: false, crouch: false, jump: false, fire: false, firePressed: false, ads: false, reload: false, use: null, nade: false, slot: -1, aimYaw: 0, aimPitch: 0 };
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
  }
  curWeapon() { return this.weapons[this.slot]; }
  def() { const w = this.weapons[this.slot]; return w ? WEAPONS[w.type] : WEAPONS.fists; }
  eyeY() { return this.y + (this.swimming ? 1.3 : this.crouch ? CFG.CROUCH_EYE : CFG.EYE_HEIGHT); }
  height() { return this.crouch ? CFG.CROUCH_HEIGHT : CFG.CHAR_HEIGHT; }
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
    if (s === this.slot || s < 0 || s > 2) return;
    this.slot = s; this.switchT = 0.32; this.bloom = 0;
    this.cancelReload(); this.cancelUse();
    Game.events.emit('switch', this);
  }
  startReload() {
    const w = this.curWeapon();
    if (!w || this.reloadT > 0 || this.switchT > 0) return false;
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
      if (this.ammo[def.ammo] > 0 && w.ammo < def.mag) { w.ammo++; this.ammo[def.ammo]--; }
      if (w.ammo < def.mag && this.ammo[def.ammo] > 0) { this.reloadTotal = this.reloadT = def.reload * RARITY[w.rarity].reload; Game.events.emit('reload', this, def); }
    } else {
      const n = Math.min(def.mag - w.ammo, this.ammo[def.ammo]);
      w.ammo += n; this.ammo[def.ammo] -= n;
    }
  }
  startUse(type) {
    const h = HEALS[type];
    if (!h || this.useT > 0 || this.heals[type] <= 0 || this.mode !== 'ground') return false;
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

  // ------------------------------------------------------------------ damage
  // Returns the amount actually removed. bypass = ignore shield (zone damage).
  damage(amount, attacker, weaponId, head, bypass) {
    if (!this.alive || this.mode === 'plane' || amount <= 0) return 0;
    let dealt = 0, shieldDmg = 0;
    if (!bypass && this.shield > 0) {
      shieldDmg = Math.min(this.shield, amount);
      this.shield -= shieldDmg; amount -= shieldDmg; dealt += shieldDmg;
      if (this.shield <= 0.001) { this.shield = 0; Game.events.emit('shieldBreak', this); }
    }
    if (amount > 0) { const h = Math.min(this.hp, amount); this.hp -= h; dealt += h; }
    if (!bypass) this.hitT = 0.2;
    this.lastDamageT = Game.time;
    if (attacker) { this.lastDamageBy = attacker; this.lastDamageWeapon = weaponId; attacker.damageDealt += dealt; }
    if (this.useT > 0 && !bypass) this.cancelUse();
    Game.events.emit('damage', this, attacker, dealt, !!head, shieldDmg, weaponId);
    if (this.hp <= 0.001) this._die(attacker, weaponId, !!head);
    return dealt;
  }
  _die(attacker, weaponId, head) {
    if (!this.alive) return;
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
    else this._updateGround(dt);
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
  _updateGround(dt) {
    const inp = this.in, R = CFG.CHAR_RADIUS;
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

    // ---- movement intent
    this.crouch = inp.crouch && this.grounded && !this.swimming;
    const hgt = this.height();
    let mx = inp.mx, mz = inp.mz, ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }
    const fwd = ml > 0.1 ? (mx * Math.sin(this.aimYaw) + mz * Math.cos(this.aimYaw)) / ml : 0;
    this.sprinting = inp.sprint && ml > 0.5 && (fwd > 0.25 || !this.isPlayer) && !this.crouch && !inp.ads && this.useT <= 0 && this.fireHold <= 0 && !this.swimming;
    let speed = this.swimming ? CFG.SWIM_SPEED : this.crouch ? CFG.CROUCH_SPEED : this.sprinting ? CFG.SPRINT_SPEED : (inp.ads ? CFG.WALK_SPEED : CFG.RUN_SPEED);
    if (this.useT > 0) speed *= 0.55;
    const tvx = mx * speed, tvz = mz * speed;
    const accel = (this.grounded || this.swimming ? 48 : 10) * dt;
    const dvx = tvx - this.vx, dvz = tvz - this.vz, dl = Math.hypot(dvx, dvz);
    if (dl <= accel) { this.vx = tvx; this.vz = tvz; } else { this.vx += dvx / dl * accel; this.vz += dvz / dl * accel; }
    if (inp.jump && this.grounded && !this.swimming && this.jumpCd <= 0) {
      this.vy = CFG.JUMP_SPEED; this.grounded = false; this.jumpCd = 0.3;
      Game.events.emit('jump', this);
    }
    if (!this.grounded) this.vy -= CFG.GRAVITY * dt;

    // ---- horizontal move + collisions
    const ox = this.x, oz = this.z;
    _cpos.x = ox + this.vx * dt; _cpos.z = oz + this.vz * dt;
    const lim = Terrain.HALF - 6;
    _cpos.x = clamp(_cpos.x, -lim, lim); _cpos.z = clamp(_cpos.z, -lim, lim);
    const hit = Phys.collideXZ(_cpos, this.y, R, hgt);
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
    if (this.vy <= 0 && ny <= ground + (this.grounded ? 0.32 : 0)) {
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
    const faceAim = this.isPlayer || inp.ads || inp.fire || this.fireHold > 0 || (this.bot && this.bot.faceAim);
    const sp = Math.hypot(this.vx, this.vz);
    const targetYaw = faceAim ? this.aimYaw : (sp > 0.6 ? Math.atan2(this.vx, this.vz) : this.yaw);
    this.yaw = dampAngle(this.yaw, targetYaw, faceAim ? 18 : 9, dt);
    this.moveAmt = dampTo(this.moveAmt, clamp01(sp / CFG.RUN_SPEED), 10, dt);
    if (sp > 0.4) this.moveDir = dampAngle(this.moveDir, wrapAngle(Math.atan2(this.vx, this.vz) - this.yaw), 12, dt);
    this.animPhase += sp * dt * (this.crouch ? 2.5 : this.sprinting ? 1.55 : 1.85);
    if ((this.grounded || this.swimming) && sp > 1.5) {
      const steps = Math.floor(this.animPhase / Math.PI);
      if (steps !== this.lastStepPhase) { this.lastStepPhase = steps; Game.events.emit('step', this, sp); }
    }

    // ---- actions
    if (inp.slot >= 0) this.switchTo(inp.slot);
    if (inp.reload) this.startReload();
    if (inp.use) this.startUse(inp.use);
    if (inp.nade) Combat.throwGrenade(this);
    if (inp.fire) Combat.tryFire(this, inp.firePressed);
  }
}
