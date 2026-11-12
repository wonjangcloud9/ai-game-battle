// AURORA FALL — bot brains: drop, loot, rotate with the zone, fight, heal (no DOM dependencies)
'use strict';

const GUN_SCORE = { aurora: 6, ar: 5, smg: 4, sniper: 3.6, shotgun: 3.6, pistol: 2 };

class Bot {
  constructor(ch, rng, diff, idx) {
    this.ch = ch; ch.bot = this;
    this.rng = makeRng(((idx + 1) * 7919 + Math.floor(rng() * 1e6)) >>> 0);
    this.diff = diff;
    this.skill = this.rng.range(0.8, 1.25);
    this.aggro = clamp(this.rng.range(0.45, 1.25) * diff.aggro, 0.2, 1.6);
    this.zoneMargin = this.rng.range(0, 14);
    this.thinkT = this.rng() * 0.3; this.state = 'drop'; this.stateT = 0; this.faceAim = false;
    this.target = null; this.visible = false; this.seenT = 0; this.lostT = 99; this.lastSeen = [0, 0, 0]; this.reactT = 0;
    this.path = null; this.pathI = 0; this.goalX = 0; this.goalZ = 0; this.hasGoal = false; this.goalKind = ''; this.goalRef = null; this.arrive = 1.3; this.pathPending = false;
    this.stuckT = 0; this.px = 0; this.pz = 0; this.unstickT = 0; this.unstickDir = 1; this.wantMove = false;
    this.strafeDir = this.rng.sign(); this.strafeT = 0; this.burstT = 0.5; this.pauseT = 0; this.clickT = 0;
    this.errX = 0; this.errY = 0; this.errTX = 0; this.errTY = 0; this.errT = 0; this.headAim = false;
    this.holdT = 0; this.visited = new Set(); this.ignored = new Set(); this.jumpAt = 0; this.dropX = 0; this.dropZ = 0;
    this.scanT = 0; this.scanYaw = 0; this.alertT = 0; this.alertYaw = 0;
    this.investigate = null; this.investigateT = 0; this.nadeCd = this.rng.range(5, 14); this.nadeNow = false; this.crouchT = 0;
    this.wantSlot = -1; this.jumpNow = false; this.lootTime = 0; this.sprintMove = false; this.retreatX = 0; this.retreatZ = 0;
  }

  // ------------------------------------------------------------------ frame update
  update(dt) {
    const ch = this.ch, inp = ch.in;
    inp.jump = false; inp.reload = false; inp.use = null; inp.nade = false; inp.slot = -1; inp.firePressed = false; inp.fire = false;
    inp.sprint = false; inp.mx = 0; inp.mz = 0; inp.ads = false;
    if (ch.mode === 'plane') {
      if (Game.plane.dist >= this.jumpAt) ch.jumpFromPlane(Game.plane.vx, Game.plane.vz);
      return;
    }
    if (ch.mode === 'fall' || ch.mode === 'glide') { this.steerDrop(); return; }
    if (this.state === 'drop') { this.state = 'loot'; this.stateT = 0; this.px = ch.x; this.pz = ch.z; }
    this.stateT += dt;
    if (this.holdT > 0) this.holdT -= dt;
    if (this.crouchT > 0) this.crouchT -= dt;
    if (this.nadeCd > 0) this.nadeCd -= dt;
    if (this.alertT > 0) this.alertT -= dt;
    if (this.unstickT > 0) this.unstickT -= dt;
    if (this.investigateT > 0) { this.investigateT -= dt; if (this.investigateT <= 0) this.investigate = null; }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { const iv = 0.22 + this.rng() * 0.12; this.thinkT = iv; this.think(iv); }
    inp.crouch = this.crouchT > 0;
    this.faceAim = false;
    if (this.state === 'fight') this.actFight(dt);
    else if (this.state === 'heal') this.actHeal(dt);
    else this.actMove(dt);
    if (this.wantSlot >= 0 && ch.switchT <= 0) { inp.slot = this.wantSlot; this.wantSlot = -1; }
    if (this.jumpNow) { inp.jump = true; this.jumpNow = false; }
    if (this.unstickT > 0) {
      const ml = Math.hypot(inp.mx, inp.mz);
      if (ml > 0.1) { const px = -inp.mz / ml * this.unstickDir, pz = inp.mx / ml * this.unstickDir; inp.mx = inp.mx * 0.35 + px; inp.mz = inp.mz * 0.35 + pz; }
    }
    this.wantMove = Math.hypot(inp.mx, inp.mz) > 0.2;
  }

  steerDrop() {
    const ch = this.ch, inp = ch.in;
    const dx = this.dropX - ch.x, dz = this.dropZ - ch.z, d = Math.hypot(dx, dz);
    if (d > 3) { inp.mx = dx / d; inp.mz = dz / d; }
    inp.aimYaw = d > 3 ? Math.atan2(dx, dz) : ch.aimYaw;
    const alt = ch.y - Terrain.height(ch.x, ch.z);
    inp.aimPitch = d < alt * 0.4 ? -1.2 : -0.2;
  }

  // ------------------------------------------------------------------ thinking (a few times per second)
  think(iv) {
    const ch = this.ch;
    this.perceive(iv);
    const moved = Math.hypot(ch.x - this.px, ch.z - this.pz);
    this.px = ch.x; this.pz = ch.z;
    if (this.wantMove && moved < iv * 0.9) this.stuckT += iv; else this.stuckT = Math.max(0, this.stuckT - iv * 2);
    if (this.stuckT > 0.75) {
      this.unstickT = 0.55; this.unstickDir = this.rng.sign(); this.jumpNow = true;
      if (this.stuckT > 1.6) { this.path = null; this.pathPending = false; }
      if (this.stuckT > 3.4) {
        if (this.goalRef) this.ignored.add(this.goalRef);
        this.hasGoal = false; this.goalRef = null; this.stuckT = 0;
        if (this.goalKind === 'spot' && this.goalIdx >= 0) this.visited.add(this.goalIdx);
      }
    }
    this.quickPickup();
    this.chooseWeapon();
    this.decide();
  }

  perceive(iv) {
    const ch = this.ch, ex = ch.x, ey = ch.eyeY(), ez = ch.z, now = Game.time;
    const fx = Math.sin(ch.aimYaw), fz = Math.cos(ch.aimYaw);
    const attacker = ch.lastDamageBy && ch.lastDamageBy.alive && now - ch.lastDamageT < 5 ? ch.lastDamageBy : null;
    const cand = [];
    for (const c of Game.chars) {
      if (c === ch || !c.alive || c.mode === 'plane') continue;
      const dx = c.x - ex, dz = c.z - ez, d = Math.hypot(dx, dz);
      let range = 95;
      if (c.crouch && Math.abs(c.vx) + Math.abs(c.vz) < 0.5) range *= 0.6;
      if (now - c.lastShotT < 1.5) range *= 1.35;
      if (c.mode !== 'ground') range *= 0.55;
      if (d > range) continue;
      const aware = c === this.target || c === attacker || d < 9;
      if (!aware && d > 1 && (dx * fx + dz * fz) / d < 0.2) continue;
      cand.push(c, d);
    }
    let best = null, bestScore = 0, bestD = 0;
    // check line of sight for the closest few
    for (let pass = 0; pass < 4 && cand.length; pass++) {
      let mi = 0;
      for (let i = 2; i < cand.length; i += 2) if (cand[i + 1] < cand[mi + 1]) mi = i;
      const c = cand[mi], d = cand[mi + 1];
      cand.splice(mi, 2);
      if (!Phys.segmentClear(ex, ey, ez, c.x, c.y + (c.crouch ? 0.8 : 1.25), c.z)) continue;
      let score = 60 / (d + 6);
      if (c === attacker) score += 3;
      if (c === this.target) score += 1.2;
      if (c.hp + c.shield < 60) score += 0.6;
      if (score > bestScore) { bestScore = score; best = c; bestD = d; }
    }
    if (best) {
      if (best !== this.target) {
        this.target = best; this.seenT = 0; this.errT = 0;
        this.reactT = (0.26 + this.rng() * 0.32) * this.diff.react * (bestD > 60 ? 1.4 : 1);
        this.headAim = this.rng() < 0.16 * this.skill;
      }
      this.visible = true; this.lostT = 0;
      this.lastSeen[0] = best.x; this.lastSeen[1] = best.y; this.lastSeen[2] = best.z;
    } else {
      this.visible = false;
      if (this.target) { this.lostT += iv; if (!this.target.alive || this.lostT > 7.5) this.target = null; }
    }
    if (!this.visible && attacker && now - ch.lastDamageT < 0.7) {
      this.alertYaw = Math.atan2(attacker.x - ch.x, attacker.z - ch.z); this.alertT = 1.6;
      if (!this.target) { this.target = attacker; this.lostT = 0.6; this.seenT = 0; this.lastSeen[0] = attacker.x; this.lastSeen[1] = attacker.y; this.lastSeen[2] = attacker.z; }
    }
    if (!this.target && !this.investigate && ch.hasGun()) {
      for (const n of Game.noises) {
        if (n.src === ch || now - n.t > 0.5) continue;
        const d = Math.hypot(n.x - ch.x, n.z - ch.z);
        if (d < 18 || d > n.loud * 0.8) continue;
        if (this.rng() < 0.05 * this.aggro) { this.investigate = [n.x + this.rng.range(-8, 8), n.z + this.rng.range(-8, 8)]; this.investigateT = 14; break; }
      }
    }
  }

  gunScore(type, rarity) { return (GUN_SCORE[type] || 1) + rarity * 0.55; }
  ammoFor(w) { return w ? w.ammo + this.ch.ammo[WEAPONS[w.type].ammo] : 0; }
  usableGuns() { let n = 0; for (const w of this.ch.weapons) if (w && this.ammoFor(w) > 0) n++; return n; }

  chooseWeapon() {
    const ch = this.ch;
    let best = -1, bs = -1;
    const d = this.target ? Math.hypot(this.lastSeen[0] - ch.x, this.lastSeen[2] - ch.z) : 30;
    for (let s = 0; s < 3; s++) {
      const w = ch.weapons[s];
      if (!w || this.ammoFor(w) <= 0) continue;
      const def = WEAPONS[w.type];
      let fit = 1;
      if (this.target) fit = d < def.botMin ? 0.55 : d <= def.botMax ? 2 : Math.max(0.25, 1 - (d - def.botMax) / def.botMax);
      let sc = fit * this.gunScore(w.type, w.rarity);
      if (w.ammo <= 0 && this.visible) sc *= 0.55;      // prefer a loaded gun in a fight
      if (s === ch.slot) sc *= 1.12;
      if (sc > bs) { bs = sc; best = s; }
    }
    if (best >= 0 && best !== ch.slot) this.wantSlot = best;
  }

  itemValue(it) {
    const ch = this.ch;
    if (this.ignored.has(it)) return 0;
    if (it.noPick === ch && Game.time < it.noPickT) return 0;
    if (it.kind === 'weapon') {
      const sc = this.gunScore(it.type, it.rarity);
      let dup = false, worst = 99;
      for (const w of ch.weapons) { if (!w) continue; if (w.type === it.type) dup = dup || w.rarity >= it.rarity; worst = Math.min(worst, this.gunScore(w.type, w.rarity)); }
      if (dup) return 0;
      if (ch.weapons.indexOf(null) >= 0) return 3.5 + sc;
      return sc - worst > 0.7 ? 1.5 + (sc - worst) : 0;
    }
    if (it.kind === 'ammo') {
      let uses = false;
      for (const w of ch.weapons) if (w && WEAPONS[w.type].ammo === it.type) uses = true;
      const have = ch.ammo[it.type];
      if (have >= AMMO[it.type].max) return 0;
      if (uses) return have < AMMO[it.type].pack * 2 ? 2.6 : have < AMMO[it.type].pack * 4 ? 1.0 : 0.2;
      return ch.gunCount() < 3 && have < AMMO[it.type].pack ? 0.25 : 0;
    }
    if (it.kind === 'heal') {
      const have = ch.heals[it.type];
      if (have >= HEALS[it.type].max) return 0;
      if (it.type === 'bandage') return have < 5 ? 1.5 : 0.2;
      if (it.type === 'medkit') return have < 2 ? 2.3 : 0.3;
      return have < 4 ? 2.1 : 0.3;
    }
    return ch.grenades < 2 ? 1.0 : ch.grenades < GRENADE.max ? 0.2 : 0;
  }
  takeItem(it) {
    const ch = this.ch;
    if (ch.pickup(it)) return true;
    if (it.kind === 'weapon' && it.alive && this.itemValue(it) > 0) {
      // swap out the weakest gun
      let ws = 0, worst = 99;
      for (let s = 0; s < 3; s++) { const w = ch.weapons[s]; if (w) { const g = this.gunScore(w.type, w.rarity); if (g < worst) { worst = g; ws = s; } } }
      return ch.swapWeapon(it, ws);
    }
    return false;
  }
  quickPickup() {
    const ch = this.ch;
    if (ch.mode !== 'ground') return;
    Items.forNear(ch.x, ch.z, 1.7, it => {
      if (!it.rest || it.age < 0.4 || Math.abs(it.y - ch.y) > 1.6) return;
      if (this.itemValue(it) > 0) this.takeItem(it);
    });
    const c = Items.nearestChest(ch.x, ch.z, 2.3, ch.y);
    if (c && !(this.visible && this.target)) Items.openChest(c, Game.rng, ch);
  }

  needsLoot() {
    const ch = this.ch, usable = this.usableGuns();
    if (usable === 0) return true;
    if (this.lootTime > 75) return false;
    if (usable < 2) return true;
    let ammo = 0;
    for (const w of ch.weapons) ammo += this.ammoFor(w);
    if (ammo < 45) return true;
    if (ch.heals.bandage + ch.heals.medkit * 2 + ch.heals.cell < 2 && this.lootTime < 45) return true;
    return false;
  }
  // Only pick fights we can actually win at this range (unless we are already being shot at).
  wantsFight(t, d) {
    const ch = this.ch;
    if (ch.lastDamageBy === t && Game.time - ch.lastDamageT < 6) return true;
    if (d < 14) return true;
    let reach = 0;
    for (const w of ch.weapons) if (w && this.ammoFor(w) > 0) reach = Math.max(reach, WEAPONS[w.type].botMax * 1.15);
    if (d > reach) return false;
    if (this.aggro < 0.7 && d > 48) return false;
    return true;
  }
  wantsHeal() {
    const ch = this.ch;
    if (this.visible) return false;
    if (this.target && this.lostT < 2.2) return false;
    if (ch.hp < 76 && (ch.heals.bandage > 0 || ch.heals.medkit > 0)) return true;
    if (ch.shield < 56 && ch.heals.cell > 0) return true;
    return false;
  }
  zoneUrgent() {
    if (Zone.done) return false;
    const ch = this.ch;
    const dn = Zone.nextDist(ch.x, ch.z);
    if (dn <= -3) return false;
    if (Zone.state === 'shrink') return true;
    return Zone.timer < (dn + 15) / 5.5 + 9 + this.zoneMargin;
  }

  decide() {
    const ch = this.ch, t = this.target;
    const armed = this.usableGuns() > 0;
    const dT = t ? Math.hypot(this.lastSeen[0] - ch.x, this.lastSeen[2] - ch.z) : 999;
    const outside = Zone.outside(ch.x, ch.z);
    const canHeal = ch.heals.medkit > 0 || ch.heals.bandage > 0;
    let s = null;
    if (t && (this.visible || this.lostT < 2.2)) {
      if (!armed) {
        // unarmed: brawl only at arm's length, run from nearby guns, otherwise keep looking for a weapon
        if (dT < 4.5) s = 'fight';
        else if (this.visible && dT < 32 && t.hasGun()) s = 'flee';
      }
      else if (ch.hp < 36 && canHeal && dT > 14 && (this.state === 'retreat' || this.rng() < 0.5)) s = 'retreat';
      else if (this.state === 'fight' || this.wantsFight(t, dT)) s = 'fight';
    }
    if (s) { /* decided above */ }
    else if (this.state === 'retreat' && this.stateT < 3.2) s = 'retreat';
    else if (ch.useT > 0 || this.wantsHeal()) s = 'heal';
    else if (outside) s = 'zone';
    else if (t && armed && this.lostT >= 2.2 && this.aggro > 0.55) s = 'hunt';
    else if (this.zoneUrgent()) s = 'zone';
    else if (this.investigate && armed) s = 'investigate';
    else if (this.needsLoot() || this.spotLoot()) s = 'loot';
    else s = 'roam';
    if (outside && (s === 'fight' || s === 'retreat' || s === 'flee') && (dT > 22 || !this.visible || !armed) && Zone.dps >= 2.5) s = 'zone';
    if (s !== this.state) { this.state = s; this.stateT = 0; this.hasGoal = false; this.path = null; this.goalRef = null; this.pathPending = false; this.holdT = 0; }
    if (s === 'loot') this.lootTime += 0.28;
    switch (s) {
      case 'loot': this.planLoot(); break;
      case 'zone': this.planZone(); break;
      case 'roam': this.planRoam(); break;
      case 'hunt': this.goTo(this.lastSeen[0], this.lastSeen[2], 2.5); this.sprintMove = true; break;
      case 'investigate': this.goTo(this.investigate[0], this.investigate[1], 6); this.sprintMove = true; break;
      case 'retreat': case 'flee': this.planRetreat(); break;
      case 'fight':
        if (!this.visible) { this.goTo(this.lastSeen[0], this.lastSeen[2], 2.5); }
        else if (this.nadeCd <= 0 && ch.grenades > 0 && dT > 11 && dT < 34 && this.rng() < 0.2) { this.nadeNow = true; this.nadeCd = this.rng.range(9, 18); }
        if (this.visible && dT > 32 && this.crouchT <= 0 && this.rng() < 0.08) this.crouchT = this.rng.range(1.5, 4);
        break;
    }
  }

  // a valuable item or chest very close by is worth a detour even when "done" looting
  spotLoot() {
    const ch = this.ch;
    let found = false;
    Items.forNear(ch.x, ch.z, 14, it => { if (!found && it.rest && !it.upper && this.itemValue(it) >= 2) found = true; });
    if (found) return true;
    for (const c of Items.chests) {
      if (c.opened || c.upper || this.ignored.has(c)) continue;
      const d = Math.hypot(c.x - ch.x, c.z - ch.z);
      if (d < (c.airdrop ? 150 * this.aggro : 22)) return true;
    }
    return false;
  }

  goTo(x, z, arrive) {
    this.arrive = arrive || 1.3;
    if (this.hasGoal && this.path && !this.pathPending && Math.hypot(x - this.goalX, z - this.goalZ) < 2.5) return;
    const ch = this.ch;
    this.goalX = x; this.goalZ = z; this.hasGoal = true;
    const d = Math.hypot(x - ch.x, z - ch.z);
    if (d < 2.2 || (d < 46 && Nav.lineClearWorld(ch.x, ch.z, x, z))) { this.path = [x, z]; this.pathI = 0; this.pathPending = false; return; }
    if (BotAI.pathBudget <= 0) { if (!this.path) { this.path = [x, z]; this.pathI = 0; } this.pathPending = true; return; }
    BotAI.pathBudget--;
    const p = Nav.findPath(ch.x, ch.z, x, z, 45000);
    this.path = p || [x, z]; this.pathI = 0; this.pathPending = false;
  }

  planLoot() {
    const ch = this.ch;
    const ref = this.goalRef;
    if (this.hasGoal && ref) {
      if (this.goalKind === 'item' && ref.alive && this.itemValue(ref) > 0) { this.goTo(ref.x, ref.z, 1.2); return; }
      if (this.goalKind === 'chest' && !ref.opened) { this.goTo(ref.x, ref.z, 1.7); return; }
    } else if (this.hasGoal && this.goalKind === 'spot') return;
    let best = null, bestV = 0, kind = '';
    Items.forNear(ch.x, ch.z, 50, (it, d) => {
      if (it.upper || !it.rest) return;
      const v = this.itemValue(it);
      if (v <= 0) return;
      const s = v / (d + 5);
      if (s > bestV) { bestV = s; best = it; kind = 'item'; }
    });
    for (const c of Items.chests) {
      if (c.opened || c.upper || this.ignored.has(c)) continue;
      const d = Math.hypot(c.x - ch.x, c.z - ch.z);
      if (d > (c.airdrop ? 170 : 75)) continue;
      const s = (c.airdrop ? 10 : 3.4) / (d + 5);
      if (s > bestV) { bestV = s; best = c; kind = 'chest'; }
    }
    if (best) { this.goalKind = kind; this.goalRef = best; this.sprintMove = true; this.goTo(best.x, best.z, kind === 'chest' ? 1.7 : 1.2); return; }
    // nothing known nearby: walk to the nearest loot spot that has not been checked yet
    let bi = -1, bd = 170;
    const spots = World.lootSpots;
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      if (sp.upper || this.visited.has(i)) continue;
      const d = Math.hypot(sp.x - ch.x, sp.z - ch.z);
      if (d < bd && !Zone.outside(sp.x, sp.z)) { bd = d; bi = i; }
    }
    if (bi >= 0) { this.goalKind = 'spot'; this.goalRef = null; this.goalIdx = bi; this.sprintMove = bd > 20; this.goTo(spots[bi].x, spots[bi].z, 2.0); }
    else { this.lootTime = 999; this.hasGoal = false; }
  }
  planZone() {
    const ch = this.ch;
    this.sprintMove = true;
    if (this.hasGoal && this.goalKind === 'zone' && Math.hypot(this.goalX - Zone.toX, this.goalZ - Zone.toZ) <= Math.max(3, Zone.toR * 0.9)) return;
    const a = Math.atan2(ch.z - Zone.toZ, ch.x - Zone.toX) + this.rng.range(-0.7, 0.7);
    const r = Zone.toR * this.rng.range(0.2, 0.78);
    let x = Zone.toX + Math.cos(a) * r, z = Zone.toZ + Math.sin(a) * r;
    const k = Nav.nearestFree(x, z, 25, true);
    if (k >= 0) { x = Nav.cellX(k); z = Nav.cellZ(k); }
    this.goalKind = 'zone'; this.goalRef = null;
    this.goTo(x, z, 2.5);
  }
  planRoam() {
    if (this.holdT > 0 || this.hasGoal) return;
    const ch = this.ch;
    let p = null;
    if (this.rng() < 0.4) {
      // head for a landmark inside the safe area
      const list = Terrain.pois.filter(q => Zone.nextDist(q.x, q.z) < -q.r * 0.3);
      if (list.length) { const q = this.rng.pick(list); p = Nav.randomOpen(q.x, q.z, 4, q.r * 0.8, this.rng); }
    }
    if (!p) {
      const cx = Zone.done ? Zone.x : Zone.toX, cz = Zone.done ? Zone.z : Zone.toZ, cr = Zone.done ? 6 : Zone.toR;
      p = Nav.randomOpen(lerp(ch.x, cx, 0.5), lerp(ch.z, cz, 0.5), 5, Math.max(12, Math.min(cr * 0.8, 110)), this.rng);
      if (p && Math.hypot(p[0] - cx, p[1] - cz) > cr) p = null;
    }
    if (!p) { this.holdT = 1.5; return; }
    this.goalKind = 'roam'; this.goalRef = null; this.sprintMove = this.rng() < 0.3 * this.aggro;
    this.goTo(p[0], p[1], 2.2);
  }
  planRetreat() {
    const ch = this.ch;
    this.sprintMove = true;
    if (this.hasGoal && Math.hypot(this.goalX - ch.x, this.goalZ - ch.z) > 4) return;
    const base = Math.atan2(ch.z - this.lastSeen[2], ch.x - this.lastSeen[0]);
    for (let k = 0; k < 5; k++) {
      const a = base + (k === 0 ? 0 : this.rng.range(-1.1, 1.1));
      const x = ch.x + Math.cos(a) * 26, z = ch.z + Math.sin(a) * 26;
      if (Nav.isOpen(x, z) && (!Zone.outside(x, z) || Zone.outside(ch.x, ch.z))) { this.goalKind = 'retreat'; this.goTo(x, z, 2.5); return; }
    }
    this.goalKind = 'retreat'; this.goTo(ch.x + Math.cos(base) * 12, ch.z + Math.sin(base) * 12, 2.5);
  }

  // ------------------------------------------------------------------ acting (every frame)
  followPath(sprint) {
    const ch = this.ch, inp = ch.in;
    if (!this.path || !this.hasGoal) return false;
    let wx = this.path[this.pathI], wz = this.path[this.pathI + 1];
    let d = Math.hypot(wx - ch.x, wz - ch.z);
    const last = this.pathI >= this.path.length - 2;
    if (d < (last ? this.arrive : 1.15)) {
      if (last) return false;
      this.pathI += 2;
      wx = this.path[this.pathI]; wz = this.path[this.pathI + 1];
      d = Math.hypot(wx - ch.x, wz - ch.z);
    }
    if (d > 1e-4) { inp.mx = (wx - ch.x) / d; inp.mz = (wz - ch.z) / d; }
    inp.sprint = !!sprint && d > 2.5;
    return true;
  }
  turnAim(wantYaw, wantPitch, rate, dt) {
    const ch = this.ch, inp = ch.in, m = rate * dt;
    inp.aimYaw = ch.aimYaw + clamp(angleDelta(ch.aimYaw, wantYaw), -m, m);
    inp.aimPitch = ch.aimPitch + clamp(wantPitch - ch.aimPitch, -m, m);
  }
  actMove(dt) {
    const ch = this.ch, inp = ch.in;
    const moving = this.holdT > 0 ? false : this.followPath(this.sprintMove);
    if (!moving && this.hasGoal && this.holdT <= 0) this.onArrive();
    // look where we go, or scan while standing
    if (this.alertT > 0) { this.faceAim = true; this.turnAim(this.alertYaw, 0, 9, dt); }
    else if (moving) this.turnAim(Math.atan2(inp.mx, inp.mz), 0, 5, dt);
    else {
      this.scanT -= dt;
      if (this.scanT <= 0) { this.scanT = this.rng.range(1.2, 3.2); this.scanYaw = ch.aimYaw + this.rng.range(-1.6, 1.6); }
      this.turnAim(this.scanYaw, 0, 2.2, dt);
    }
    const w = ch.curWeapon();
    if (w && ch.reloadT <= 0 && w.ammo < WEAPONS[w.type].mag * 0.45 && ch.ammo[WEAPONS[w.type].ammo] > 0 && this.lostT > 2.5) inp.reload = true;
  }
  onArrive() {
    const ch = this.ch, ref = this.goalRef;
    this.hasGoal = false; this.path = null;
    switch (this.goalKind) {
      case 'item':
        if (ref && ref.alive && Math.abs(ref.y - ch.y) < 1.8) this.takeItem(ref);
        if (ref && ref.alive) this.ignored.add(ref);          // could not take it (out of reach / not wanted any more)
        this.goalRef = null; this.thinkT = Math.min(this.thinkT, 0.05); break;
      case 'chest':
        if (ref && !ref.opened) { if (Math.hypot(ref.x - ch.x, ref.z - ch.z) < 3 && Math.abs(ref.y - ch.y) < 2.2) Items.openChest(ref, Game.rng, ch); else this.ignored.add(ref); }
        this.goalRef = null; this.holdT = 0.5; break;
      case 'spot': this.visited.add(this.goalIdx); this.thinkT = Math.min(this.thinkT, 0.05); break;
      case 'roam': this.holdT = this.rng.range(1.5, 6.5) / Math.max(0.5, this.aggro); if (this.rng() < 0.3) this.crouchT = this.holdT; break;
      case 'zone': this.holdT = this.rng.range(0.5, 2.5); break;
      default: if (this.state === 'hunt') { this.target = null; this.holdT = 1.2; } if (this.state === 'investigate') { this.investigate = null; this.holdT = 1.5; }
    }
  }
  actHeal(dt) {
    const ch = this.ch, inp = ch.in;
    this.crouchT = Math.max(this.crouchT, 0.3);
    if (ch.useT <= 0) {
      if (ch.hp < 50 && ch.heals.medkit > 0) inp.use = 'medkit';
      else if (ch.hp < 76 && ch.heals.bandage > 0) inp.use = 'bandage';
      else if (ch.hp < 76 && ch.heals.medkit > 0) inp.use = 'medkit';
      else if (ch.shield < 56 && ch.heals.cell > 0) inp.use = 'cell';
    }
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = this.rng.range(1.0, 2.4); this.scanYaw = ch.aimYaw + this.rng.range(-1.8, 1.8); }
    this.turnAim(this.alertT > 0 ? this.alertYaw : this.scanYaw, 0, 3, dt);
  }
  aimError(t, d) {
    const ch = this.ch;
    const settle = 0.9 + 2.8 * Math.exp(-this.seenT / 0.8);
    const tv = Math.hypot(t.vx, t.vz), ov = Math.hypot(ch.vx, ch.vz);
    let e = settle * this.diff.aim / this.skill * (1 + tv / 7 * 0.7) * (1 + ov / 7 * 0.35);
    if (t.mode !== 'ground') e *= 1.8;
    if (ch.crouch) e *= 0.85;
    return e * DEG;
  }
  actFight(dt) {
    const ch = this.ch, inp = ch.in, t = this.target;
    if (!t) return;
    this.faceAim = true;
    const tx = this.visible ? t.x : this.lastSeen[0], ty = this.visible ? t.y : this.lastSeen[1], tz = this.visible ? t.z : this.lastSeen[2];
    const dx = tx - ch.x, dz = tz - ch.z, d = Math.hypot(dx, dz) || 0.001;
    if (this.visible) this.seenT += dt;
    this.errT -= dt;
    if (this.errT <= 0) {
      this.errT = 0.2 + this.rng() * 0.22;
      const e = this.aimError(t, d);
      this.errTX = this.rng.gauss() * e; this.errTY = this.rng.gauss() * e * 0.7;
    }
    const k = Math.min(1, dt * 6);
    this.errX += (this.errTX - this.errX) * k; this.errY += (this.errTY - this.errY) * k;
    const aimH = t.swimming ? 1.2 : t.crouch ? 0.8 : (this.headAim ? 1.6 : 1.12);
    let wantYaw = Math.atan2(dx, dz), wantPitch = Math.atan2(ty + aimH - ch.eyeY(), d);
    const gun = ch.curWeapon(), def = ch.def();
    if (this.nadeNow && ch.grenades > 0 && ch.throwT <= 0) {
      inp.aimYaw = wantYaw; inp.aimPitch = clamp(wantPitch + 0.2 + d * 0.011, -0.4, 0.9); inp.nade = true; this.nadeNow = false;
      ch.aimYaw = inp.aimYaw; ch.aimPitch = inp.aimPitch;
    } else {
      this.turnAim(wantYaw + this.errX, wantPitch + this.errY, 8.5 / this.diff.react, dt);
      const onTarget = Math.abs(angleDelta(ch.aimYaw, wantYaw)) < 0.1;
      if (this.visible && this.seenT > this.reactT && onTarget) {
        if (!gun) { if (d < 2.6) { inp.fire = true; inp.firePressed = true; } }
        else if (d <= def.range && d <= def.botMax * 1.7) {
          if (def.auto) {
            if (this.pauseT > 0) this.pauseT -= dt;
            else {
              inp.fire = true; this.burstT -= dt;
              if (this.burstT <= 0) { this.pauseT = this.rng.range(0.12, 0.45) * (d > 40 ? 1.7 : 1); this.burstT = this.rng.range(0.25, 0.85); }
            }
          } else {
            this.clickT -= dt;
            if (this.clickT <= 0 && ch.fireCd <= 0) { inp.fire = true; inp.firePressed = true; this.clickT = def.interval * this.rng.range(0.1, 0.7) + (d > 60 ? 0.25 : 0.04); }
          }
          inp.ads = d > 22;
        }
      }
    }
    // movement
    const nx = dx / d, nz = dz / d;
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = this.rng.range(0.5, 1.5);
      if (this.rng() < 0.75) this.strafeDir = -this.strafeDir;
      if (d < 18 && this.rng() < 0.12) this.jumpNow = true;
    }
    if (!this.visible) { this.followPath(true); }
    else if (!gun) { inp.mx = nx; inp.mz = nz; inp.sprint = d > 4; }
    else {
      const minR = def.botMin, maxR = def.botMax * 0.55;
      let fwd = d > maxR ? 1 : d < minR ? -1 : 0;
      if (ch.reloadT > 0 || gun.ammo === 0) fwd = d < 20 ? -1 : fwd * 0.3;
      const amt = this.crouchT > 0 ? 0 : (d < 60 ? 0.9 : 0.5);
      inp.mx = nx * fwd - nz * this.strafeDir * amt; inp.mz = nz * fwd + nx * this.strafeDir * amt;
    }
    if (gun && gun.ammo === 0 && ch.reloadT <= 0) inp.reload = true;
  }
}

const BotAI = {
  bots: [], pathBudget: 0,
  reset(chars, rng, diff) {
    this.bots = [];
    const p = Game.plane;
    // candidate landing areas
    const spots = [];
    for (const q of Terrain.pois) spots.push({ x: q.x, z: q.z, r: q.r * 0.8, w: q.r / 17 * (1 + q.tier * 0.4) });
    for (const s of Terrain.sites) spots.push({ x: s.x, z: s.z, r: 9, w: 1.3 });
    for (let k = 0; k < 24; k++) { const o = Nav.randomOpen(0, 0, 30, 400, rng); if (o) spots.push({ x: o[0], z: o[1], r: 14, w: 1.0 }); }
    // prefer areas within gliding reach of the flight path
    for (const s of spots) {
      const t = (s.x - p.sx) * p.dx + (s.z - p.sz) * p.dz;
      s.t = t;
      const px = p.sx + p.dx * t, pz = p.sz + p.dz * t;
      s.off = Math.hypot(s.x - px, s.z - pz);
      s.w *= s.off < 230 ? 1 : s.off < 330 ? 0.3 : 0.05;
      if (t < p.dropStart - 60 || t > p.dropEnd + 60) s.w *= 0.25;
    }
    let total = 0;
    for (const s of spots) total += s.w;
    let idx = 0;
    for (const ch of chars) {
      if (ch.isPlayer) continue;
      const b = new Bot(ch, rng, diff, idx++);
      let r = rng() * total, sp = spots[0];
      for (const s of spots) { r -= s.w; if (r <= 0) { sp = s; break; } }
      const a = rng() * TAU, rr = Math.sqrt(rng()) * sp.r;
      let x = sp.x + Math.cos(a) * rr, z = sp.z + Math.sin(a) * rr;
      const k = Nav.nearestFree(x, z, 30, true);
      if (k >= 0) { x = Nav.cellX(k); z = Nav.cellZ(k); }
      b.dropX = x; b.dropZ = z;
      b.jumpAt = clamp(sp.t - rng.range(20, 75), p.dropStart + rng.range(0, 12), p.dropEnd - 4);
      this.bots.push(b);
    }
  },
  update(dt) {
    this.pathBudget = 3;
    const bots = this.bots;
    for (let i = 0; i < bots.length; i++) if (bots[i].ch.alive) bots[i].update(dt);
  },
};
