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
    this.hunter = false;      // holds one of the slots for going after the player (see Game.maxHunters)
    // vehicles: the one this bot is walking to, where it means to drive, the route and what has gone wrong on the way
    this.ride = null; this.rideUntil = 0; this.noRideT = 0; this.tripX = 0; this.tripZ = 0; this.tripKind = ''; this.driving = false;
    this.vpath = null; this.vpathI = 0; this.vplanT = 0; this.driveT = 0; this.jamT = 0; this.jams = 0; this.revT = 0; this.revSteer = 0; this.farX = 0; this.farZ = 0; this.noPathN = 0;
    this.backT = 0; this.fwdT = 0; this.rodeT = -99; this.tripPhase = -1;      // rodeT: when this bot last sat in a vehicle
    // squad mode: whom this bot follows (null: it leads, or plays alone), its place in the formation, whom it drops in with (the
    // player's team-mates: the player), the team-mate who is down and the one it could not get to, whom the team is fighting
    this.lead = null; this.slotIdx = 0; this.dropLead = null; this.mate = null; this.skipMate = null; this.skipMateT = 0; this.focus = null;
    // routes are worked out a little per frame (Nav.request / Nav.pump) and handed over here
    this.vreq = null;
    this.onPath = (p, r) => {
      if (!this.hasGoal || r.tx !== this.goalX || r.tz !== this.goalZ) return;      // (it has changed its mind meanwhile)
      this.path = p || [r.tx, r.tz]; this.pathI = 0; this.pathPending = false;
    };
    this.onRoute = (p, r) => {
      this.vreq = null;
      const c = this.ch, v = c.vehicle;
      if (!this.driving || c.mode !== 'drive' || !v || v.driver !== c || r.tx !== this.tripX || r.tz !== this.tripZ) return;
      // a route that ends no nearer than where we are is no route (cut off by water or cliffs)
      const gd = Math.hypot(this.tripX - v.x, this.tripZ - v.z);
      if (p && Math.hypot(p[p.length - 2] - this.tripX, p[p.length - 1] - this.tripZ) < gd - 3) { this.vpath = p; this.vpathI = 0; this.noPathN = 0; }
      else if (++this.noPathN >= 2) this.leaveVehicle(true);
      else { this.vpath = null; this.vplanT = 0.6; }
    };
  }

  // ------------------------------------------------------------------ frame update
  update(dt) {
    const ch = this.ch, inp = ch.in;
    inp.jump = false; inp.reload = false; inp.use = null; inp.nade = false; inp.slot = -1; inp.firePressed = false; inp.fire = false;
    inp.sprint = false; inp.mx = 0; inp.mz = 0; inp.ads = false; inp.drive = 0; inp.steer = 0; inp.brake = false;
    if (ch.mode === 'plane') {
      // (the player's team-mates leave the plane the moment the player does)
      if (this.dropLead ? this.dropLead.mode !== 'plane' : Game.plane.dist >= this.jumpAt) ch.jumpFromPlane(Game.plane.vx, Game.plane.vz);
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
    if (this.driving && ch.mode !== 'drive') this.endTrip();          // thrown out: the vehicle blew up or sank
    if (ch.mode === 'down') { this.actDown(); return; }               // knocked down (squad mode): nothing to decide
    this.thinkT -= dt;
    if (this.thinkT <= 0) { const iv = 0.22 + this.rng() * 0.12; this.thinkT = iv; this.think(iv); }
    if (ch.mode === 'drive') {
      inp.crouch = false; this.faceAim = false; this.wantMove = false;
      if (ch.vehicle && ch.vehicle.driver !== ch) this.actRide(dt); else this.actDrive(dt);      // (squad mode: riding along as a passenger)
      return;
    }
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
    const ch = this.ch, inp = ch.in, L = this.dropLead;
    if (L && L.alive && L.mode !== 'plane' && L.mode !== 'down') { this.steerWith(L); return; }
    const dx = this.dropX - ch.x, dz = this.dropZ - ch.z, d = Math.hypot(dx, dz);
    if (d > 3) { inp.mx = dx / d; inp.mz = dz / d; }
    inp.aimYaw = d > 3 ? Math.atan2(dx, dz) : ch.aimYaw;
    const alt = ch.y - Terrain.height(ch.x, ch.z);
    inp.aimPitch = d < alt * 0.4 ? -1.2 : -0.2;
  }
  // Squad mode, the player's team-mates: down the way the player goes, a few metres to the side and behind, level with
  // them (diving when above, flattening out when below) and opening the glider when they do.
  steerWith(L) {
    const ch = this.ch, inp = ch.in, k = this.slotIdx;
    const air = L.mode === 'fall' || L.mode === 'glide', sp = Math.hypot(L.vx, L.vz);
    const head = air && sp > 3 ? Math.atan2(L.vx, L.vz) : L.aimYaw;
    const a = head + (k === 0 ? 2.3 : k === 1 ? -2.3 : Math.PI), r = 5 + k;
    const tx = L.x + Math.sin(a) * r, tz = L.z + Math.cos(a) * r;
    this.dropX = tx; this.dropZ = tz;                                   // (should the leader be lost on the way down: on to there)
    const dx = tx - ch.x, dz = tz - ch.z, d = Math.hypot(dx, dz);
    if (d > 1.5) { inp.mx = dx / d; inp.mz = dz / d; }
    inp.aimYaw = air ? L.aimYaw : d > 3 ? Math.atan2(dx, dz) : ch.aimYaw;
    inp.aimPitch = -0.2;
    if (ch.mode !== 'fall') return;
    const dy = ch.y - L.y;
    inp.aimPitch = air ? clamp(L.aimPitch - (dy - 2) * 0.12, -1.3, 0.1) : -1.2;
    if (L.mode === 'glide' && dy < 6) inp.jump = true;
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
        if (this.goalKind === 'revive' && this.goalRef) { this.skipMate = this.goalRef; this.skipMateT = Game.time + 8; }      // (not for good: they crawl)
        else if (this.goalRef) this.ignored.add(this.goalRef);
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
    // whoever hurt this bot lately, or shot at the vehicle it sits in
    const attacker = ch.lastDamageBy && ch.lastDamageBy.alive && ch.lastDamageBy.mode !== 'down' && now - ch.lastDamageT < 5 ? ch.lastDamageBy
      : ch.rideHitBy && ch.rideHitBy.alive && ch.rideHitBy.mode !== 'down' && ch.rideHitBy.team !== ch.team && now - ch.rideHitT < 5 ? ch.rideHitBy : null;
    if (this.target && this.target.mode === 'down') this.target = null;      // (squad mode) down: no threat any more, and not shot at on the ground
    // ---- the opening: is the player off limits to this bot right now? (never to one the player has hurt: it fights back)
    const pl = Game.player;
    let playerOff = false;
    if (pl && pl !== ch && !ch.provoked) {
      if (Game.playerShielded()) playerOff = true;                                                           // landing protection
      else if (!this.hunter && this.threatTo(pl) && BotAI.onPlayer >= Game.maxHunters()) playerOff = true;   // no ganging up on a newcomer
      else if ((ch.mode === 'drive' || now - this.rodeT < OPENING.rideCalm) && Game.playerEase() < 1) playerOff = true;   // nor arriving on wheels to do it
    }
    if (playerOff && this.target === pl) this.target = null;
    const focus = this.focus = Game.squad ? this.teamFocus() : null;                          // squad mode: whom the team is fighting
    const cand = [];
    for (const c of Game.chars) {
      // nobody gets shot at while still dropping in (nor, in squad mode, a team-mate or somebody who is down already)
      if (c === ch || !c.alive || c.team === ch.team || (c.mode !== 'ground' && c.mode !== 'drive')) continue;
      if (playerOff && c === pl) continue;
      const dx = c.x - ex, dz = c.z - ez, d = Math.hypot(dx, dz);
      let range = 95;
      if (c.crouch && Math.abs(c.vx) + Math.abs(c.vz) < 0.5) range *= 0.6;
      if (now - c.lastShotT < 1.5) range *= 1.35;
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
      // (a driver sits lower; a hull standing in the way hides whoever is behind it)
      const cy = c.y + (c.mode === 'drive' ? 1.05 : c.crouch ? 0.8 : 1.25);
      if (!Phys.segmentClear(ex, ey, ez, c.x, cy, c.z) || Vehicles.blocks(ex, ey, ez, c.x, cy, c.z, ch.vehicle, c.vehicle)) continue;
      let score = 60 / (d + 6);
      if (c === attacker) score += 3;
      if (c === this.target) score += 1.2;
      if (c === focus) score += 1.5;
      if (c.hp + c.shield < 60) score += 0.6;
      if (score > bestScore) { bestScore = score; best = c; bestD = d; }
    }
    if (best) {
      if (best !== this.target) {
        this.target = best; this.seenT = 0; this.errT = 0;
        this.reactT = (0.26 + this.rng() * 0.32) * this.diff.react * (bestD > 60 ? 1.4 : 1);
        if (best.isPlayer) this.reactT *= lerp(OPENING.react, 1, Game.playerEase(ch));
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
    // squad mode: a team-mate is in a fight and this bot sees nobody: over there
    if (focus && !this.target && !this.investigate && ch.hasGun()) { this.investigate = [focus.x, focus.z]; this.investigateT = 8; }
    // A bot that has the player as its target and the means to hurt them holds a hunter slot until it gives that target up
    // (not just while it has line of sight: ducking behind a wall must not let a second bot take over and the first one come back).
    const hunting = !!pl && this.target === pl && this.threatTo(pl);
    if (hunting && !this.hunter) BotAI.onPlayer++;       // counted at once, so that the next bot to think this frame sees the slot as taken
    this.hunter = hunting;
  }
  // Could this bot hurt `t` now? (an unarmed bot far away may watch the player, or run from them, without taking up a hunter slot)
  threatTo(t) { return this.usableGuns() > 0 || Math.hypot(t.x - this.ch.x, t.z - this.ch.z) < 6; }
  // Squad mode: somebody a team-mate is fighting (whom a bot has in its sights, who hurt a team-mate, whom a team-mate hurt:
  // the last two are all there is to go by for the player), the nearest such to this bot.
  teamFocus() {
    const ch = this.ch, now = Game.time;
    let best = null, bd = 80;
    for (const m of ch.squad.members) {
      if (m === ch || !m.alive) continue;
      const c = m.bot && m.bot.target && m.bot.visible ? m.bot.target
        : m.lastDamageBy && now - m.lastDamageT < 4 ? m.lastDamageBy
        : m.lastHit && now - m.lastHitT < 4 ? m.lastHit : null;
      if (!c || !c.alive || c.team === ch.team || (c.mode !== 'ground' && c.mode !== 'drive')) continue;
      const d = Math.hypot(c.x - ch.x, c.z - ch.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  gunScore(type, rarity) { return (GUN_SCORE[type] || 1) + rarity * 0.55; }
  ammoFor(w) { return w ? w.ammo + this.ch.ammo[WEAPONS[w.type].ammo] : 0; }
  usableGuns() { let n = 0; for (const w of this.ch.weapons) if (w && this.ammoFor(w) > 0) n++; return n; }
  // has t a gun with something in it? (what a bot standing next to them can tell)
  canShoot(t) { return t.bot ? t.bot.usableGuns() > 0 : t.hasGun(); }

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
    if (Game.squad && Game.freshForPlayer(ch, it)) return 0;
    if (it.kind === 'weapon') {
      if (Game.playerHasDibs(ch, it.x, it.z)) return 0;
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
    if (c && !(this.visible && this.target) && !Game.playerHasDibs(ch, c.x, c.z)) Items.openChest(c, Game.rng, ch);
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
        // (no boxing match with a bot that cannot shoot either: at what bots do to each other with their fists that takes
        //  minutes, in which neither of them looks for a gun. Whoever is being punched does hit back.)
        if (dT < 4.5 && (t.isPlayer || this.canShoot(t) || (ch.lastDamageBy === t && Game.time - ch.lastDamageT < 2.5))) s = 'fight';
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
    if (Game.squad) s = this.squadState(s, armed, dT, outside);
    if (ch.mode === 'drive') s = ch.vehicle.driver === ch ? this.driveState(s, armed, dT) : this.rideState(s);
    if (s !== this.state) { this.state = s; this.stateT = 0; this.hasGoal = false; this.path = null; this.goalRef = null; this.pathPending = false; this.holdT = 0; this.ride = null; }
    if (s === 'loot') this.lootTime += 0.28;
    switch (s) {
      case 'follow': if (!this.planRide()) { this.planFollow(); this.seekRide(); } break;
      case 'revive': this.planRevive(); break;
      case 'cover': this.planCover(); break;
      case 'loot': this.planLoot(); break;
      case 'zone': if (!this.planRide()) { this.planZone(); this.seekRide(); } break;
      case 'roam': if (!this.planRide()) { this.planRoam(); this.seekRide(); } break;
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
      if (c.opened || c.upper || this.ignored.has(c) || Game.playerHasDibs(ch, c.x, c.z)) continue;
      const d = Math.hypot(c.x - ch.x, c.z - ch.z);
      if (d < (c.airdrop ? 150 * this.aggro : 22)) return true;
    }
    return false;
  }

  goTo(x, z, arrive) {
    this.arrive = arrive || 1.3;
    // (on the way there already, or the route is being worked out. Should the request have gone astray - another one of
    //  this bot's took its place in the queue - it is simply asked for again)
    if (this.hasGoal && this.path && Math.hypot(x - this.goalX, z - this.goalZ) < 2.5 && !(this.pathPending && !Nav.waiting(this))) return;
    const ch = this.ch;
    this.goalX = x; this.goalZ = z; this.hasGoal = true;
    const d = Math.hypot(x - ch.x, z - ch.z);
    if (d < 2.2 || (d < 46 && Nav.lineClearWorld(ch.x, ch.z, x, z))) { Nav.cancel(this); this.path = [x, z]; this.pathI = 0; this.pathPending = false; return; }
    // the route arrives within a frame or a few (onPath); until then straight ahead
    // (not on along the route to the old goal: reaching its end would count as having arrived at the new one)
    this.path = [x, z]; this.pathI = 0;
    this.pathPending = true;
    Nav.request(this, ch.x, ch.z, x, z, 45000, false, this.onPath);
  }

  planLoot() {
    const ch = this.ch;
    const ref = this.goalRef;
    if (this.hasGoal && ref) {
      if (this.goalKind === 'item' && ref.alive && this.itemValue(ref) > 0) { this.goTo(ref.x, ref.z, 1.2); return; }
      if (this.goalKind === 'chest' && !ref.opened && !Game.playerHasDibs(ch, ref.x, ref.z)) { this.goTo(ref.x, ref.z, 1.7); return; }
    } else if (this.hasGoal && this.goalKind === 'spot') return;
    let best = null, bestV = 0, kind = '';
    // squad mode: a follower loots only what lies within reach of its leader, and nothing a team-mate is on the way to
    const L = this.lead, reach = this.lootLeash(this.usableGuns() > 0) + 6, team = Game.squad;
    Items.forNear(ch.x, ch.z, 50, (it, d) => {
      if (it.upper || !it.rest) return;
      if (L && Math.hypot(it.x - L.x, it.z - L.z) > reach) return;
      const v = this.itemValue(it);
      if (v <= 0) return;
      if (team && this.claimed(it)) return;
      const s = v / (d + 5);
      if (s > bestV) { bestV = s; best = it; kind = 'item'; }
    });
    for (const c of Items.chests) {
      if (c.opened || c.upper || this.ignored.has(c) || Game.playerHasDibs(ch, c.x, c.z)) continue;
      const d = Math.hypot(c.x - ch.x, c.z - ch.z);
      if (d > (c.airdrop ? 170 : 75)) continue;
      if ((L && Math.hypot(c.x - L.x, c.z - L.z) > reach) || (team && this.claimed(c))) continue;
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
      if (L && Math.hypot(sp.x - L.x, sp.z - L.z) > reach) continue;
      if (d < bd && !Zone.outside(sp.x, sp.z)) { bd = d; bi = i; }
    }
    if (bi >= 0) { this.goalKind = 'spot'; this.goalRef = null; this.goalIdx = bi; this.sprintMove = bd > 20; this.goTo(spots[bi].x, spots[bi].z, 2.0); }
    else if (L) this.planFollow();                   // (nothing near the leader: back to them, and on to the next place with them)
    else { this.lootTime = 999; this.hasGoal = false; }
  }
  planZone() {
    const ch = this.ch;
    this.sprintMove = true;
    if (this.hasGoal && this.goalKind === 'zone' && Math.hypot(this.goalX - Zone.toX, this.goalZ - Zone.toZ) <= Math.max(3, Zone.toR * 0.9)) return;
    let x, z;
    const L = this.lead;
    if (L) {
      // squad mode: a follower heads where its leader is heading, or (the leader not being on the way yet: the player takes
      // their time) to just inside the next zone on the leader's side, each a few metres apart
      const lb = L.bot;
      if (lb && lb.hasGoal && lb.goalKind === 'zone') { x = lb.goalX; z = lb.goalZ; }
      else { const dx = L.x - Zone.toX, dz = L.z - Zone.toZ, d = Math.hypot(dx, dz) || 1, r = Math.min(d, Zone.toR * 0.82); x = Zone.toX + dx / d * r; z = Zone.toZ + dz / d * r; }
      x += Math.cos(this.slotIdx * 2.1) * 4; z += Math.sin(this.slotIdx * 2.1) * 4;
    } else {
      const a = Math.atan2(ch.z - Zone.toZ, ch.x - Zone.toX) + this.rng.range(-0.7, 0.7);
      const r = Zone.toR * this.rng.range(0.2, 0.78);
      x = Zone.toX + Math.cos(a) * r; z = Zone.toZ + Math.sin(a) * r;
    }
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
  // ------------------------------------------------------------------ squad mode
  // What the team needs comes on top of what the bot would do by itself (s): a team-mate who is down is helped up by the
  // nearest bot and watched over by the others, and a follower stays within reach of its leader.
  squadState(s, armed, dT, outside) {
    const ch = this.ch, L = Game.leaderOf(ch);
    this.lead = L === ch ? null : L;
    const fighting = s === 'fight' || s === 'retreat' || s === 'flee';
    const m = this.mate = this.pickMate();
    if (m) {
      if (this.medicFor(m)) {
        // Only an enemy in plain view at close quarters comes first, or being shot at when already badly hurt: bots do each
        // other little harm (Game.botScale), so kneeling down under fire from further off is a risk worth taking.
        const hurt = ch.hp + ch.shield;
        const hot = fighting && this.visible && (dT < SQUAD.medicClose || hurt < SQUAD.medicLow || (Game.time - ch.lastDamageT < 1.5 && hurt < SQUAD.medicHp));
        // (more than SQUAD.medicStay of the way through: finished whatever comes. Getting up and kneeling down again
        //  starts from nothing, and the one on the ground watched a helper come and go)
        const nearlyDone = ch.reviving === m && ch.reviveT < SQUAD.reviveTime * (1 - SQUAD.medicStay);
        if ((!hot || nearlyDone) && this.canAfford(m, s)) return 'revive';
      } else if (!fighting && s !== 'heal' && s !== 'zone') return 'cover';
    }
    if (!this.lead) return s;
    const dL = Math.hypot(L.x - ch.x, L.z - ch.z), leash = this.lootLeash(armed);
    if (this.boardable(L) && !(fighting && this.visible)) return 'follow';      // the leader is in a vehicle with a seat to spare: get in
    if (fighting) return !this.visible && dL > SQUAD.leash * 2 ? 'follow' : s;
    if (s === 'heal' || s === 'zone') return s;      // (into the zone as a team: see planZone)
    if (s === 'loot') return dL > (this.state === 'follow' ? leash * 0.6 : leash) ? 'follow' : s;      // (once called back, all the way)
    if (s === 'hunt' || s === 'investigate') return dL > SQUAD.leash * 1.5 ? 'follow' : s;
    return 'follow';
  }
  // how far from its leader a follower goes for loot: a long way while it has no gun, not far once it is only topping up
  lootLeash(armed) { return SQUAD.leash * (armed ? 1 : 2.4); }
  // Is helping m up worth it as far as the zone goes? Not when m lies so far outside that neither of them would make it back
  // in; and with the zone on its way (s = 'zone') only if its edge will not be over the two of them for longer than this
  // bot's health allows.
  canAfford(m, s) {
    const ch = this.ch, dps = Zone.dps, need = Math.hypot(m.x - ch.x, m.z - ch.z) / 6 + SQUAD.reviveTime;      // seconds until m is up
    const out = Math.hypot(m.x - Zone.x, m.z - Zone.z) - Zone.r;           // how far outside the zone m lies (negative: inside)
    if (out > 0) return dps * (out / 5 + 1) <= SQUAD.reviveHp - 8 && dps * (need + out / 5.5) <= ch.hp - 20;
    if (s !== 'zone' || Zone.nextDist(m.x, m.z) <= 0) return true;         // (not pressed for time, or m lies where the zone will not get to this time)
    const wait = Zone.state === 'wait' ? Zone.timer : 0, left = Zone.state === 'wait' ? ZONE_CFG.phases[Zone.phase].shrink : Math.max(0.5, Zone.timer);
    const speed = Math.max(0.5, (Zone.r - Zone.toR) / left) * 1.3;          // how fast the edge comes in (the centre moves as well)
    const late = need - (wait - out / speed);                              // seconds of standing in it
    return late <= 0 || dps * late <= ch.hp - 30;
  }
  // the nearest team-mate who is down and can still be got to
  pickMate() {
    const ch = this.ch;
    if (ch.reviving && ch.reviving.alive && ch.reviving.mode === 'down') return ch.reviving;      // (the one already being helped, to the end)
    let best = null, bd = 90, free = null, fd = 90;      // (free: one nobody else is helping yet: that one first)
    for (const m of ch.squad.members) {
      if (m === ch || !m.alive || m.mode !== 'down' || (m === this.skipMate && Game.time < this.skipMateT)) continue;
      const d = Math.hypot(m.x - ch.x, m.z - ch.z);
      if (d < bd) { bd = d; best = m; }
      if (d < fd && !m.reviver) { fd = d; free = m; }
    }
    return free || best;
  }
  // Is this the bot to go and help m up? The nearest one that is free to (bots do not wait to see what the player does).
  medicFor(m) {
    const ch = this.ch;
    if (m.reviver) return m.reviver === ch;
    const mine = Math.hypot(m.x - ch.x, m.z - ch.z);
    for (const o of ch.squad.members) {
      const b = o.bot;
      if (o === ch || !b || !o.alive || (o.mode !== 'ground' && o.mode !== 'drive')) continue;
      if (b.skipMate === m && Game.time < b.skipMateT) continue;
      if (o.reviving && o.reviving !== m) continue;                      // (busy with somebody else)
      if (b.visible && b.target && Math.hypot(b.target.x - o.x, b.target.z - o.z) < SQUAD.medicClose) continue;      // (has its hands full)
      const d = Math.hypot(m.x - o.x, m.z - o.z);
      if (d < mine || (d === mine && o.id < ch.id)) return false;
    }
    return true;
  }
  // has a team-mate set out for this item or chest already?
  claimed(ref) {
    for (const m of this.ch.squad.members) if (m !== this.ch && m.alive && m.bot && m.bot.hasGoal && m.bot.goalRef === ref) return true;
    return false;
  }
  // Stay with the leader: once more than SQUAD.near away, up to a spot a few metres short of them (each follower a little to
  // one side of the straight line), then stand by.
  planFollow() {
    const ch = this.ch, L = this.lead;
    if (!L) return;
    const dx = ch.x - L.x, dz = ch.z - L.z, d = Math.hypot(dx, dz) || 1;
    if (ch.mode !== 'ground') return;
    if (this.boardable(L)) {                         // into the passenger seat, once close enough
      const v = L.vehicle;
      if (Vehicles.hullDist(v, ch.x, ch.z) < VEHICLE_CFG.enter - 0.25 && Math.abs(v.y - ch.y) < 2 && Vehicles.reachable(v, ch.x, ch.y, ch.z) && Vehicles.enter(ch, v)) { this.hasGoal = false; this.path = null; this.rodeT = Game.time; return; }
      this.goalKind = 'board'; this.goalRef = null; this.sprintMove = true;
      this.goTo(v.x, v.z, 1.5);
      return;
    }
    if (!this.hasGoal && d < SQUAD.near) return;
    // the leader is still outside the next zone with it about to close: wait inside rather than go back out to them
    const dn = Zone.nextDist(L.x, L.z);
    if (!Zone.done && dn > 0 && Zone.nextDist(ch.x, ch.z) <= 0 && (Zone.state === 'shrink' || Zone.timer < (dn + 15) / 5.5 + 9 + this.zoneMargin)) { this.hasGoal = false; this.path = null; return; }
    const a = Math.atan2(dx, dz) + (this.slotIdx % 3 - 1) * 0.7, r = Math.min(d, 4.5);
    this.goalKind = 'follow'; this.goalRef = null; this.sprintMove = d > 14 || L.sprinting || L.mode === 'drive';
    this.goTo(L.x + Math.sin(a) * r, L.z + Math.cos(a) * r, 1.6);
  }
  // Is there a seat for this bot in the vehicle its leader sits in, near and slow enough to get to?
  boardable(L) {
    const v = L.mode === 'drive' ? L.vehicle : null;
    return !!v && !v.burning && this.ch.mode === 'ground' && Vehicles.freeSeat(this.ch, v) >= 0 && Math.abs(v.speed) < 5 && Vehicles.hullDist(v, this.ch.x, this.ch.z) < 40;
  }
  // At the wheel with team-mates on their way to the seats: are any still coming?
  matesBoarding() {
    const ch = this.ch, v = ch.vehicle;
    if (v.pass.indexOf(null) < 0) return false;
    for (const m of ch.squad.members) {
      const b = m.bot;      // (bots that follow somebody sitting in this vehicle, and are not busy fighting)
      if (m !== ch && b && m.alive && m.mode === 'ground' && b.lead && b.lead.vehicle === v && Vehicles.hullDist(v, m.x, m.z) < 40 && !(b.visible && b.state === 'fight')) return true;
    }
    return false;
  }
  // In a passenger seat: out when nobody is at the wheel any more, when the vehicle is on fire, or - once it stands - to
  // help a team-mate up or to fight somebody in view; otherwise along for the ride. (These are the very conditions under
  // which a bot on foot does not get in: see boardable and squadState. Otherwise it would be in and out all the time.)
  rideState(s) {
    const ch = this.ch, v = ch.vehicle;
    const out = !v.driver || !v.alive || v.burning || (Math.abs(v.speed) < 2 && (s === 'revive' || (this.visible && (s === 'fight' || s === 'retreat' || s === 'flee'))));
    if (!out) return 'ride';
    Vehicles.exit(ch);
    this.rodeT = Game.time; this.hasGoal = false; this.path = null; this.px = ch.x; this.pz = ch.z; this.stuckT = 0;
    return s;
  }
  actRide(dt) {
    const ch = this.ch;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = this.rng.range(1.5, 3.5); this.scanYaw = ch.vehicle.yaw + this.rng.range(-1.2, 1.2); }
    this.turnAim(this.scanYaw, 0, 2.5, dt);
  }
  // To the team-mate who is down, then kneel there until they are back on their feet.
  planRevive() {
    const ch = this.ch, m = this.mate;
    if (!m) return;
    if (ch.reviving !== m && !(Math.hypot(m.x - ch.x, m.z - ch.z) < SQUAD.reviveRange - 0.2 && ch.startRevive(m))) {
      this.goalKind = 'revive'; this.goalRef = m; this.sprintMove = true;
      this.goTo(m.x, m.z, 1.5);
      return;
    }
    this.hasGoal = false; this.path = null; this.crouchT = Math.max(this.crouchT, 0.4);
  }
  // Not the one to help: stay close to the team-mate who is down and keep watch.
  planCover() {
    const ch = this.ch, m = this.mate;
    if (!m) return;
    const dx = ch.x - m.x, dz = ch.z - m.z, d = Math.hypot(dx, dz) || 1;
    if (d <= SQUAD.cover) { if (this.goalKind === 'cover') { this.hasGoal = false; this.path = null; } return; }
    this.goalKind = 'cover'; this.goalRef = null; this.sprintMove = true;
    this.goTo(m.x + dx / d * 6, m.z + dz / d * 6, 2.5);
  }
  // Knocked down: crawl toward the nearest team-mate on their feet (they are on their way), lie still once somebody is at work.
  actDown() {
    const ch = this.ch, inp = ch.in;
    this.target = null; this.visible = false; this.hunter = false; this.hasGoal = false; this.path = null; this.pathPending = false;
    this.faceAim = false; this.wantMove = false; this.stuckT = 0; this.mate = null; this.ride = null; this.thinkT = 0;
    if (ch.reviver || !ch.squad) return;
    let tx = 0, tz = 0, bd = 1e9;
    if (Zone.outside(ch.x, ch.z)) { tx = Zone.x; tz = Zone.z; bd = Math.hypot(tx - ch.x, tz - ch.z); }      // (first of all out of the zone's reach)
    else for (const m of ch.squad.members) {
      if (m === ch || !m.alive || m.mode === 'down') continue;
      const d = Math.hypot(m.x - ch.x, m.z - ch.z);
      if (d < bd) { bd = d; tx = m.x; tz = m.z; }
    }
    if (bd > 1e8 || bd < 2) return;
    inp.mx = (tx - ch.x) / bd; inp.mz = (tz - ch.z) / bd;
    inp.aimYaw = Math.atan2(inp.mx, inp.mz); inp.aimPitch = 0;
  }

  // ------------------------------------------------------------------ vehicles
  // A long way to go and something to drive standing close by: walk over to it first.
  seekRide() {
    const ch = this.ch;
    // squad mode: a leader takes only what seats everybody still standing; of the followers only the player's, when left behind
    let seats = 0;
    if (Game.squad) {
      if (this.lead && !this.lead.isPlayer) return;
      if (!this.lead) for (const m of ch.squad.members) if (m.alive && m.mode !== 'down') seats++;
    }
    if (!this.hasGoal || this.ride || Game.time < this.noRideT || Game.time - ch.lastDamageT < 4) return;
    if (Math.hypot(this.goalX - ch.x, this.goalZ - ch.z) < VEHICLE_CFG.rideMin) return;
    const v = Vehicles.findFor(ch, this.goalX, this.goalZ, this.ignored, seats);
    if (!v) { this.noRideT = Game.time + 2; return; }
    this.ride = v; this.tripX = this.goalX; this.tripZ = this.goalZ; this.tripKind = this.state; this.rideUntil = Game.time + 22;
    this.planRide();
  }
  // true while the bot is at the wheel or on its way to a vehicle (then the usual planning of the state is left alone)
  planRide() {
    const ch = this.ch, v = this.ride;
    if (ch.mode === 'drive') return true;
    if (!v) return false;
    if (!Vehicles.canEnter(ch, v) || v.burning || this.ignored.has(v) || Game.time > this.rideUntil) {
      if (Game.time > this.rideUntil) this.ignored.add(v);       // could not get to it
      this.ride = null; this.hasGoal = false; this.path = null; this.noRideT = Game.time + 5;
      return false;
    }
    if (Vehicles.hullDist(v, ch.x, ch.z) < VEHICLE_CFG.enter - 0.25 && Math.abs(v.y - ch.y) < 2 && Vehicles.reachable(v, ch.x, ch.y, ch.z) && Vehicles.enter(ch, v)) {
      this.ride = null;
      this.startTrip(this.tripX, this.tripZ, this.tripKind);
      return true;
    }
    this.goalKind = 'vehicle'; this.goalRef = v; this.sprintMove = true;
    this.goTo(v.x, v.z, 1.5);
    return true;
  }
  // Set off (already in the seat). The destination is moved to the nearest spot a vehicle can get to.
  startTrip(x, z, kind) {
    const k = Nav.nearestFree(x, z, 34, false, true);
    this.driving = true; this.tripKind = kind || 'roam'; this.tripPhase = Zone.phase;
    this.tripX = k < 0 ? x : Nav.cellX(k); this.tripZ = k < 0 ? z : Nav.cellZ(k);
    this.vpath = null; this.vpathI = 0; this.vplanT = 0; this.driveT = 0; this.jamT = 0; this.jams = 0; this.revT = 0; this.noPathN = 0; this.backT = 0; this.fwdT = 0;
    this.vreq = null; Nav.cancel(this);
    this.farX = this.ch.x; this.farZ = this.ch.z;
    this.hasGoal = false; this.path = null; this.goalRef = null;
    if (k < 0) this.leaveVehicle(true);
  }
  endTrip() { this.driving = false; this.vpath = null; if (this.vreq) { this.vreq = null; Nav.cancel(this); } this.ride = null; this.hasGoal = false; this.path = null; this.holdT = 0; this.rodeT = Game.time; }
  // get out; giveUp: this vehicle is no use to this bot any more (stuck, nowhere to go)
  leaveVehicle(giveUp) {
    const ch = this.ch, v = ch.vehicle;
    if (v && giveUp) { this.ignored.add(v); this.noRideT = Game.time + 12; }
    Vehicles.exit(ch);
    this.endTrip();
    this.px = ch.x; this.pz = ch.z; this.stuckT = 0;
  }
  // a point inside the next safe zone to drive to
  zonePoint() {
    const ch = this.ch, a = Math.atan2(ch.z - Zone.toZ, ch.x - Zone.toX) + this.rng.range(-0.7, 0.7), r = Zone.toR * this.rng.range(0.2, 0.7);
    return [Zone.toX + Math.cos(a) * r, Zone.toZ + Math.sin(a) * r];
  }
  // What the bot does about its situation while at the wheel (s: what it would do on foot). It cannot shoot from the
  // seat: a fight close by, a vehicle on fire or bad wounds mean getting out, anything else means driving on.
  driveState(s, armed, dT) {
    const ch = this.ch, v = ch.vehicle, now = Game.time;
    const hurt = now - ch.lastDamageT < 1.6 || now - ch.rideHitT < 1.6;
    const trip = this.tripKind === 'zone' ? 'zone' : 'roam';
    if (!this.driving) this.startTrip(this.tripX || ch.x, this.tripZ || ch.z, trip);      // (put in the seat by something other than planRide)
    if (ch.mode !== 'drive') return s;
    if (v.burning || v.hp < v.def.hp * 0.3) { this.leaveVehicle(true); return s; }
    if (s === 'revive' || s === 'cover') { this.tripX = v.x; this.tripZ = v.z; return trip; }      // (squad mode: a team-mate is down: pull up, which also lets everybody out)
    if (s === 'fight' || s === 'retreat' || s === 'flee') {
      if (armed && this.visible && (dT < 26 || hurt) && Math.abs(v.speed) < 14) { this.leaveVehicle(false); return s; }
      if (hurt && Math.abs(v.speed) < 3) { this.leaveVehicle(false); return s; }           // a sitting duck: out
      return trip;
    }
    if (s === 'heal' && !hurt && ch.hp < 45 && Math.abs(v.speed) < 6) { this.leaveVehicle(false); return s; }
    if (s === 'zone') {
      // the zone has moved on: head for the new one (once per phase: the last circles are smaller than any margin)
      if (this.tripKind !== 'zone' || (this.tripPhase !== Zone.phase && Zone.nextDist(this.tripX, this.tripZ) > -Math.min(4, Zone.toR * 0.3))) { const q = this.zonePoint(); this.startTrip(q[0], q[1], 'zone'); }
      return 'zone';
    }
    return trip;
  }
  // Driving (every frame): follow the route with the front wheels, slow down for bends and near things, back out when wedged.
  actDrive(dt) {
    const ch = this.ch, inp = ch.in, v = ch.vehicle, def = v.def, C = VEHICLE_CFG;
    this.driveT += dt;
    this.turnAim(v.yaw, 0, 4, dt);
    if (Game.squad && this.driveT < 8 && this.matesBoarding()) { inp.brake = true; return; }      // (the team is getting in: a few seconds at most)
    const gd = Math.hypot(this.tripX - v.x, this.tripZ - v.z), speed = v.speed;
    // ---- there (or as near as wheels get), or this is taking for ever
    if (gd < 9 || this.driveT > 150) {
      inp.brake = Math.abs(speed) > 1.5;
      if (Math.abs(speed) <= 1.5) this.leaveVehicle(this.driveT > 150);
      return;
    }
    // ---- route
    if (this.vplanT > 0) this.vplanT -= dt;
    const done = this.vpath && this.vpathI >= this.vpath.length - 2 && Math.hypot(this.vpath[this.vpath.length - 2] - v.x, this.vpath[this.vpath.length - 1] - v.z) < 7;
    if (this.vreq && !Nav.waiting(this)) this.vreq = null;                                 // (gone astray: ask again)
    if ((!this.vpath || done) && this.vplanT <= 0 && !this.vreq) {
      this.vplanT = 0.6;
      this.vreq = Nav.request(this, v.x, v.z, this.tripX, this.tripZ, 70000, true, this.onRoute);      // (the answer comes with onRoute)
    }
    if (!this.vpath) { inp.brake = true; return; }
    // ---- backing out of a jam
    if (this.revT > 0) {
      this.revT -= dt;
      inp.drive = -1; inp.steer = this.revSteer;
      if (this.revT <= 0) { this.vpath = null; this.vplanT = 0; this.jamT = 0; }
      return;
    }
    // ---- aim point: the furthest of the next waypoints that is close and in a clear line
    const P = this.vpath, look = clamp(Math.abs(speed) * 0.6 + 3.5, 4.5, 13), here = Nav.cellOf(v.x, v.z);
    while (this.vpathI < P.length - 2) {
      const dc = Math.hypot(P[this.vpathI] - v.x, P[this.vpathI + 1] - v.z);
      if (dc > look) break;
      if (dc > 2.2 && !Nav.lineClear(here, Nav.cellOf(P[this.vpathI + 2], P[this.vpathI + 3]), 5, true)) break;
      this.vpathI += 2;
    }
    const wx = P[this.vpathI], wz = P[this.vpathI + 1], wd = Math.hypot(wx - v.x, wz - v.z);
    const err = angleDelta(v.yaw, Math.atan2(wx - v.x, wz - v.z));       // > 0: the aim point is to the left
    // ---- the aim point lies inside the turning circle (or behind): back round until the nose can be brought onto it
    {
      const sn = Math.sin(v.yaw), cs = Math.cos(v.yaw), lz = (wx - v.x) * sn + (wz - v.z) * cs, lx = Math.abs((wx - v.x) * cs - (wz - v.z) * sn);
      const rmin = (def.axF - def.axR) / Math.tan(def.steer) * 1.25;
      const tight = (lx - rmin) * (lx - rmin) + lz * lz < rmin * rmin * 0.85 || (lz < 0 && Math.abs(err) > 1.7);
      if (this.backT > 0) {
        this.backT -= dt;
        inp.drive = -0.85; inp.steer = err > 0 ? 1 : -1;                // (in reverse the nose swings the other way)
        if (speed > -0.5 && this.backT < 2.2) this.jamT += dt; else this.jamT = 0;
        if (this.backT <= 0 || (!tight && Math.abs(err) < 0.6) || this.jamT > 0.7) { this.backT = 0; this.jamT = 0; this.fwdT = 1.4; }
        return;
      }
      if (this.fwdT > 0) this.fwdT -= dt;
      else if (tight && speed < 4) { this.backT = 3; this.jamT = 0; return; }
    }
    inp.steer = clamp(-err * 2.6, -1, 1);
    // ---- speed: flat out on a clear straight, slower into bends, near obstacles and for the last stretch
    let want = def.maxSpeed * C.botSpeed * clamp(1.15 - Math.abs(err) * 1.5, 0.22, 1);
    if (this.vpathI < P.length - 2) {
      const turn = Math.abs(angleDelta(Math.atan2(wx - v.x, wz - v.z), Math.atan2(P[this.vpathI + 2] - wx, P[this.vpathI + 3] - wz)));
      const vTurn = lerp(def.maxSpeed, 5, clamp01((turn - 0.2) / 0.9));
      want = Math.min(want, Math.sqrt(vTurn * vTurn + 2 * def.brake * 0.55 * Math.max(0, wd - 2)));
    }
    const tight = Nav.vcost[here];
    if (tight >= 3 || tight === 0) want = Math.min(want, tight === 3 ? 11 : 7);
    want = Math.min(want, Math.sqrt(2 * def.brake * 0.5 * Math.max(0, gd - 8)) + 2);
    const dv = want - speed;
    inp.drive = dv > 0 ? clamp(dv * 0.7, 0.15, 1) : dv < -2.5 && speed > 1.5 ? -1 : 0;
    // ---- wedged against something?
    if (Math.abs(speed) < 0.8 && v.mountT <= 0) this.jamT += dt; else this.jamT = Math.max(0, this.jamT - dt * 2);
    if (Math.hypot(v.x - this.farX, v.z - this.farZ) > 30) { this.farX = v.x; this.farZ = v.z; this.jams = 0; }
    if (this.jamT > 1.1) {
      this.jamT = 0;
      if (++this.jams > 4) { this.leaveVehicle(true); return; }
      this.revT = 1.0 + this.jams * 0.25; this.revSteer = err > 0 ? 1 : -1;                // reverse with the nose swinging toward the route
    }
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
        if (ref && !ref.opened && !Game.playerHasDibs(ch, ref.x, ref.z)) { if (Math.hypot(ref.x - ch.x, ref.z - ch.z) < 3 && Math.abs(ref.y - ch.y) < 2.2) Items.openChest(ref, Game.rng, ch); else this.ignored.add(ref); }
        this.goalRef = null; this.holdT = 0.5; break;
      case 'spot': this.visited.add(this.goalIdx); this.thinkT = Math.min(this.thinkT, 0.05); break;
      case 'vehicle': this.thinkT = Math.min(this.thinkT, 0.05); break;      // (planRide gets in, or gives the vehicle up)
      case 'revive':      // there: the next thought starts on it. Out of reach after all (another floor, a ledge): somebody else's turn for a while
        // (only if they still lie where this bot was heading: somebody who has crawled on a little is simply gone after)
        if (ref && Math.hypot(ref.x - this.goalX, ref.z - this.goalZ) < 1 && (Math.hypot(ref.x - ch.x, ref.z - ch.z) > SQUAD.reviveRange - 0.2 || Math.abs(ref.y - ch.y) > 1.8 || ch.swimming)) { this.skipMate = ref; this.skipMateT = Game.time + 8; }
        this.goalRef = null; this.thinkT = Math.min(this.thinkT, 0.05); break;
      case 'follow': case 'cover': break;
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
    const ease = t.isPlayer ? Game.playerEase(ch) : 1;
    const settle = 0.9 + 2.8 * Math.exp(-this.seenT / (0.8 * lerp(OPENING.settle, 1, ease)));
    const tv = Math.hypot(t.vx, t.vz), ov = Math.hypot(ch.vx, ch.vz);
    let e = settle * this.diff.aim / this.skill * (1 + tv / 7 * 0.7) * (1 + ov / 7 * 0.35);
    e *= lerp(OPENING.aim, 1, ease);
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
    const aimH = t.mode === 'drive' ? (this.headAim ? 1.2 : 0.7) : t.swimming ? 1.2 : t.crouch ? 0.8 : (this.headAim ? 1.6 : 1.12);
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
  bots: [],
  // Path finding per frame, all bots together (see Nav.pump): NAV_CELLS cells at 60 frames a second, and in proportion
  // more at a lower frame rate (so that a route takes as long in seconds either way), up to NAV_MAX. At that pace a route
  // is there in the same frame for half the requests and within a quarter of a second for 99 in 100.
  NAV_CELLS: 2500, NAV_MAX: 6000,
  onPlayer: 0,              // bots holding a hunter slot (Bot.hunter)
  reset(chars, rng, diff) {
    this.bots = [];
    Nav.clearRequests();
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
    // squad mode: a team drops together. The player's team-mates go when and where the player goes; the others jump right
    // after their first member and land around the same spot.
    if (Game.squad) for (const T of Game.teams) {
      const first = T.members[0];
      let k = 0;
      for (const m of T.members) {
        const b = m.bot;
        if (!b) continue;
        b.slotIdx = k++;
        if (first.isPlayer) { b.dropLead = first; continue; }
        if (m === first) continue;
        const a = k * 2.1, r = SQUAD.spread * (0.6 + k * 0.35);
        let x = first.bot.dropX + Math.cos(a) * r, z = first.bot.dropZ + Math.sin(a) * r;
        const cell = Nav.nearestFree(x, z, 20, true);
        if (cell >= 0) { x = Nav.cellX(cell); z = Nav.cellZ(cell); }
        b.dropX = x; b.dropZ = z; b.jumpAt = first.bot.jumpAt + k * 3;
      }
    }
  },
  update(dt) {
    const bots = this.bots;
    let n = 0;
    for (const b of bots) if (b.ch.alive && b.hunter && b.target === Game.player) n++;
    this.onPlayer = n;
    for (let i = 0; i < bots.length; i++) if (bots[i].ch.alive) bots[i].update(dt);
    Nav.pump(Math.min(this.NAV_MAX, Math.round(this.NAV_CELLS * dt * 60)));
  },
};
