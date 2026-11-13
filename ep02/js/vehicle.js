// AURORA FALL — ground vehicles: driving, getting in and out, damage, fire, wrecks, parking spots (no DOM dependencies)
// A vehicle is steered like a car (front wheels turn, the rear follows) and collides as a row of discs along its length.
// Its hull is a box that stops bullets and people; the driver sits in it as an ordinary character in mode 'drive'.
'use strict';

const _vp = { x: 0, z: 0 };
const _vn = [0, 1, 0];
const _vs = [0, 0, 0];

const Vehicles = {
  list: [], spots: null, nextId: 1,
  rayV: null, rayN: [0, 1, 0],          // result of rayHit: the vehicle and the surface normal
  STAND: 0.17,                          // how far a parked bike leans over on its stand (rad)

  reset() { this.list = []; this.nextId = 1; this.rayV = null; },

  // ------------------------------------------------------------------ where they stand at the start of a match
  // Parking spots: beside the roads into every landmark, half way along the long roads, next to some cabins and towers.
  // Worked out once per world (same for every match); which of them hold a vehicle is decided per match.
  buildSpots() {
    const rng = makeRng(CFG.WORLD_SEED + 977), out = [];
    const byId = {};
    for (const p of Terrain.pois) byId[p.id] = p;
    // a cell with room around it, at most maxR from (x, z) and (when wanted) beside the road rather than on it
    const room = (x, z, maxR, offRoad) => {
      let best = null, bd = 1e9;
      for (let dz = -maxR; dz <= maxR; dz += 1) for (let dx = -maxR; dx <= maxR; dx += 1) {
        const px = x + dx, pz = z + dz, d = dx * dx + dz * dz;
        if (d >= bd || d > maxR * maxR) continue;
        const k = Nav.cellOf(px, pz), c = Nav.vcost[k];
        if (!Nav.vreach[k] || c === 0 || c > 2 || Terrain.steepness(px, pz) > 0.22 || Terrain.height(px, pz) < 1.2) continue;
        if (offRoad && Terrain.roadDist(px, pz) < 3.4) continue;
        let ok = true;
        for (let a = 0; a < 8 && ok; a++) { const q = Nav.vcost[Nav.cellOf(px + Math.cos(a * 0.785) * 2.2, pz + Math.sin(a * 0.785) * 2.2)]; if (q === 0 || q > 3) ok = false; }
        if (ok) { bd = d; best = [px, pz]; }
      }
      return best;
    };
    const add = (x, z, yaw, kind, first) => {
      const p = room(x, z, 8, kind !== 'site');
      if (!p) return false;
      for (const s of out) if (dist2D(s.x, s.z, p[0], p[1]) < 10) return false;
      out.push({ x: p[0], z: p[1], yaw, kind, first: !!first });
      return true;
    };
    // roads: ROAD_LINKS in order, each a run of segments in Terrain.roads
    let idx = 0;
    const perPoi = {};
    for (const [a, b] of ROAD_LINKS) {
      const A = byId[a], B = byId[b], segs = Math.max(4, Math.round(dist2D(A.x, A.z, B.x, B.z) / 45));
      const pts = [[A.x, A.z]];
      for (let k = 0; k < segs; k++) { const s = Terrain.roads[idx++]; pts.push([s[2], s[3]]); }
      const lens = [0];
      for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + dist2D(pts[k][0], pts[k][1], pts[k - 1][0], pts[k - 1][1]));
      const total = lens[lens.length - 1];
      // point and direction at a distance along the road
      const at = d => {
        let k = 1;
        while (k < pts.length - 1 && lens[k] < d) k++;
        const t = clamp01((d - lens[k - 1]) / (lens[k] - lens[k - 1] || 1)), dx = pts[k][0] - pts[k - 1][0], dz = pts[k][1] - pts[k - 1][1], l = Math.hypot(dx, dz) || 1;
        return [lerp(pts[k - 1][0], pts[k][0], t), lerp(pts[k - 1][1], pts[k][1], t), dx / l, dz / l];
      };
      const park = (d, side, kind, flip, first) => {
        const q = at(d), nx = -q[3] * side, nz = q[2] * side;
        return add(q[0] + nx * 5.5, q[1] + nz * 5.5, Math.atan2(q[2], q[3]) + (flip ? Math.PI : 0) + rng.range(-0.25, 0.25), kind, first);
      };
      for (const [P, d] of [[A, A.r * 0.92], [B, total - B.r * 0.92]]) {
        const n = perPoi[P.id] || 0;
        if (n >= 3 || d < 0 || d > total) continue;
        if (park(d, rng.sign(), P.type, P === A, n === 0)) perPoi[P.id] = n + 1;
      }
      if (total > 215) park(total * rng.range(0.42, 0.58), rng.sign(), 'road', rng.chance(0.5), false);
    }
    for (const s of Terrain.sites) {
      if (!rng.chance(0.55)) continue;
      const a = s.yaw + 2.3;
      add(s.x + Math.sin(a) * (s.r + 2.5), s.z + Math.cos(a) * (s.r + 2.5), s.yaw + rng.range(-0.6, 0.6), 'site', false);
    }
    this.spots = out;
    return out;
  },
  // which kind of vehicle fits the place: [bike, buggy, truck]
  WEIGHTS: {
    military: [0.2, 0.36, 0.44], harbor: [0.2, 0.34, 0.46], farm: [0.22, 0.3, 0.48], lumber: [0.25, 0.3, 0.45],
    camp: [0.52, 0.36, 0.12], lighthouse: [0.5, 0.36, 0.14], ruins: [0.5, 0.38, 0.12], site: [0.56, 0.32, 0.12], observatory: [0.4, 0.45, 0.15],
    road: [0.36, 0.42, 0.22], town: [0.36, 0.38, 0.26], village: [0.42, 0.36, 0.22],
  },
  spawnInitial(rng, squad) {
    const spots = this.spots || this.buildSpots();
    for (const s of spots) {
      if (!s.first && rng() >= VEHICLE_CFG.spawn) continue;
      const w = this.WEIGHTS[s.kind] || this.WEIGHTS.road;
      const r = rng();
      // (squad mode: more pick-ups, the one vehicle that seats a whole team, and fewer bikes; the same spots either way)
      const bikes = squad ? Math.max(0.1, w[0] - 0.2) : w[0];
      const type = r < bikes ? 'bike' : r < bikes + w[1] ? 'buggy' : 'truck';
      this.spawn(type, s.x, s.z, s.yaw, Math.floor(rng() * VEHICLE_PAINTS.length));
    }
  },
  spawn(type, x, z, yaw, paint) {
    const def = VEHICLES[type];
    const v = {
      id: this.nextId++, type, def, x, y: Terrain.height(x, z), z, yaw: yaw || 0, pitch: 0, roll: 0, lean: def.track > 0 ? 0 : this.STAND, squat: 0,
      vx: 0, vy: 0, vz: 0, speed: 0, steer: 0, wheelAng: 0, spin: 0, air: false, awake: false, wet: 0, skid: 0, bare: 1,
      hp: def.hp, alive: true, burning: false, sunk: false, deadT: 0, hitT: 0, lastHitBy: null, lastHitT: -99,
      driver: null, lastDriver: null, leftT: -99, throttle: 0, steerIn: 0, handbrake: false, mountT: 0, noiseT: 0, paint: paint || 0,
      pass: def.pass.map(() => null), riders: 0,      // squad mode: who sits in the passenger seats, and how many of them
      box: { t: COL_BOX, x, z, y0: 0, y1: 0, hx: def.wid / 2, hz: def.len / 2, c: 1, s: 0, flags: F_ALL },
    };
    this.list.push(v);
    this._ground(v);
    v.y = v._gy; v.pitch = v._gp; v.roll = v._gr;
    this._box(v);
    return v;
  },

  // ------------------------------------------------------------------ geometry helpers
  _box(v) {
    const b = v.box, def = v.def, s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    b.x = v.x + s * def.cz; b.z = v.z + c * def.cz; b.c = c; b.s = s; b.y0 = v.y + def.clear; b.y1 = v.y + def.top;
  },
  // distance from a point to the hull (0 inside)
  hullDist(v, x, z) {
    const b = v.box, dx = x - b.x, dz = z - b.z;
    const lx = Math.abs(dx * b.c - dz * b.s) - b.hx, lz = Math.abs(dx * b.s + dz * b.c) - b.hz;
    return Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
  },
  // vehicle space -> world (out: [x, y, z]); pitch and roll are left out: good enough for seats, exits and effects
  toWorld(v, lx, ly, lz, out) {
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    out[0] = v.x + c * lx + s * lz; out[1] = v.y + ly; out[2] = v.z - s * lx + c * lz;
    return out;
  },
  // Ground under the wheels: height of the vehicle (v._gy), nose-up angle (v._gp) and left-up angle (v._gr).
  _ground(v) {
    const def = v.def, s = Math.sin(v.yaw), c = Math.cos(v.yaw), ht = def.track / 2;
    const tp = Math.tan(v.pitch), tr = Math.tan(v.roll), y0 = v.y - 0.2;
    // (the reference height follows the slope the vehicle already stands on, so that a wheel far from the centre is not
    //  mistaken for standing on a ledge)
    const G = (lx, lz) => Phys.groundHeight(v.x + c * lx + s * lz, v.z - s * lx + c * lz, y0 + lz * tp + lx * tr, 0.3, true);
    let gF, gR, roll = 0;
    if (ht > 0) {
      const fl = G(ht, def.axF), fr = G(-ht, def.axF), rl = G(ht, def.axR), rr = G(-ht, def.axR);
      gF = (fl + fr) / 2; gR = (rl + rr) / 2;
      roll = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, def.track);
    } else { gF = G(0, def.axF); gR = G(0, def.axR); }
    const base = def.axF - def.axR;
    // height at the origin, which need not be half way between the axles
    v._gy = gR + (gF - gR) * (-def.axR / base);
    v._gp = Math.atan2(gF - gR, base);
    v._gr = roll;
  },
  // a staircase higher than a wheel can take, at (x, z)?
  _stairs(x, z, y) {
    const C = Phys.CELL, H = Terrain.HALF, n = Phys.n;
    const list = Phys.cells[clamp(Math.floor((z + H) / C), 0, n - 1) * n + clamp(Math.floor((x + H) / C), 0, n - 1)];
    if (!list) return false;
    for (let k = 0; k < list.length; k++) {
      const col = Phys.cols[list[k]];
      if (col.t !== COL_RAMP || !(col.flags & F_SOLID)) continue;
      const dx = x - col.x, dz = z - col.z, lx = dx * col.c - dz * col.s, lz = dx * col.s + dz * col.c;
      if (Math.abs(lx) > col.hx || Math.abs(lz) > col.hz) continue;
      const top = col.yLo + (col.yHi - col.yLo) * clamp((lx + col.hx) / (2 * col.hx), 0, 1);
      if (top > y + 0.3 && top - col.th < y + 1.2) return true;
    }
    return false;
  },

  // ------------------------------------------------------------------ getting in and out
  // (squad mode: not while somebody of another team still sits in a passenger seat)
  canEnter(ch, v) { return !!v && v.alive && !v.driver && ch.alive && ch.mode === 'ground' && !ch.swimming && !(v.riders && this.strangers(ch, v)); },
  strangers(ch, v) { for (const q of v.pass) if (q && q.team !== ch.team) return true; return false; },
  // Squad mode: a free passenger seat for ch in a vehicle that a team-mate drives (-1: none). Never in solo: nobody shares a team.
  freeSeat(ch, v) {
    if (!v || !v.alive || !v.driver || v.driver === ch || v.driver.team !== ch.team || !ch.alive || ch.mode !== 'ground' || ch.swimming) return -1;
    return v.pass.indexOf(null);
  },
  // everybody in it: the driver first
  occupants(v) { const out = v.driver ? [v.driver] : []; for (const q of v.pass) if (q) out.push(q); return out; },
  // nothing solid between somebody at (x, y, z) and the vehicle (no getting in through a wall it is parked against)
  reachable(v, x, y, z) { return Phys.segmentClear(x, y + 1.2, z, v.x, v.y + 1.2, v.z); },
  // nearest vehicle that (x, z) is close enough to get into (forCh: also as a passenger of a team-mate)
  nearest(x, z, y, range, forCh) {
    let best = null, bd = range;
    for (const v of this.list) {
      if (!v.alive || Math.abs(y - v.y) > 2.2) continue;
      if (v.driver && !(forCh && this.freeSeat(forCh, v) >= 0)) continue;
      const d = this.hullDist(v, x, z);
      if (d < bd && this.reachable(v, x, y, z)) { bd = d; best = v; }
    }
    this.nearestDist = bd;
    return best;
  },
  // Behind the wheel if nobody sits there, otherwise (squad mode) into a free passenger seat of a team-mate's vehicle.
  enter(ch, v) {
    let k = -1;
    if (!this.canEnter(ch, v)) { k = this.freeSeat(ch, v); if (k < 0) return false; }
    ch.cancelReload(); ch.cancelUse(); ch.cancelRevive();
    ch.mode = 'drive'; ch.vehicle = v; ch.seat = k; ch.crouch = false; ch.sprinting = false; ch.swimming = false; ch.grounded = true; ch.vy = 0; ch.moveAmt = 0;
    if (k < 0) {
      v.driver = ch; v.lastDriver = ch; v.awake = true; v.mountT = VEHICLE_CFG.mount;
      v.throttle = 0; v.steerIn = 0; v.handbrake = false;
    } else { v.pass[k] = ch; v.riders++; v.awake = true; }
    this._seat(v);
    Game.events.emit('vehEnter', ch, v);
    return true;
  },
  // put the driver (and whoever rides along) where the seats are
  _seat(v) {
    const d = v.driver, s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    if (d) {
      const st = v.def.seat;
      d.x = v.x + c * st[0] + s * st[2]; d.z = v.z - s * st[0] + c * st[2]; d.y = v.y + st[1] - 0.5;
      d.vx = v.vx; d.vz = v.vz; d.vy = 0; d.yaw = v.yaw;
    }
    if (v.riders) for (let k = 0; k < v.pass.length; k++) {
      const q = v.pass[k];
      if (!q) continue;
      const P = v.def.pass[k], st = P.seat;
      q.x = v.x + c * st[0] + s * st[2]; q.z = v.z - s * st[0] + c * st[2]; q.y = v.y + st[1] - 0.5;
      q.vx = v.vx; q.vz = v.vz; q.vy = 0; q.yaw = v.yaw + P.yaw;
    }
  },
  // Where the driver ends up when getting out: beside the seat if there is room, else the other side, behind, in front.
  // (st: the seat that is being left; the driver's by default)
  _exitSpot(v, st) {
    const def = v.def, R = CFG.CHAR_RADIUS, side = def.exitSide, hl = def.len / 2 + 0.75;
    st = st || def.seat;
    const seatZ = st[2], first = st[0] >= 0 ? 1 : -1;
    const cand = [[first * side, seatZ], [-first * side, seatZ], [0, def.cz - hl], [0, def.cz + hl], [first * side, def.cz - hl + 0.4], [-first * side, def.cz - hl + 0.4]];
    const from = this.toWorld(v, st[0], st[1], seatZ, _vs), fx = from[0], fy = from[1], fz = from[2];
    for (const q of cand) {
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw), px = v.x + c * q[0] + s * q[1], pz = v.z - s * q[0] + c * q[1];
      const g = Math.max(Phys.groundHeight(px, pz, v.y + 0.5, R), -CFG.SWIM_DEPTH);
      if (g > v.y + 1.1 || g < v.y - 3.5) continue;
      _vp.x = px; _vp.z = pz;
      Phys.collideXZ(_vp, g, R, CFG.CHAR_HEIGHT);
      if (Math.hypot(_vp.x - px, _vp.z - pz) > 0.3) continue;
      if (!Phys.segmentClear(fx, fy + 0.2, fz, _vp.x, g + 1.0, _vp.z)) continue;
      let free = true;
      for (const o of this.list) if (o !== v && Math.abs(o.y - v.y) < 2.5 && this.hullDist(o, _vp.x, _vp.z) < R) { free = false; break; }
      if (free) return [_vp.x, _vp.z, g];
    }
    return [fx, fz, Math.max(v.y, -CFG.SWIM_DEPTH)];          // boxed in on all sides: on the spot (the hull then pushes them clear)
  },
  _release(v, ch) {
    if (ch.seat >= 0) { if (v.pass[ch.seat] === ch) { v.pass[ch.seat] = null; v.riders--; } v.awake = true; }      // (a passenger: the vehicle carries on)
    else { v.driver = null; v.leftT = Game.time; v.throttle = 0; v.steerIn = 0; v.handbrake = false; v.awake = true; }
    ch.vehicle = null; ch.seat = -1;
  },
  _seatOf(v, ch) { return ch.seat >= 0 ? v.def.pass[ch.seat].seat : v.def.seat; },
  exit(ch) {
    const v = ch.vehicle;
    if (!v || ch.mode !== 'drive') return false;
    const p = this._exitSpot(v, this._seatOf(v, ch));
    this._release(v, ch);
    ch.mode = 'ground'; ch.x = p[0]; ch.z = p[1]; ch.y = Math.max(p[2], Math.min(v.y, p[2] + 0.6));
    ch.vx = v.vx * 0.5; ch.vz = v.vz * 0.5; ch.vy = 0; ch.grounded = false; ch.airT = 0;
    ch.switchT = Math.max(ch.switchT, 0.45);                  // a moment to get the gun up
    Game.events.emit('vehExit', ch, v);
    return true;
  },
  // called when a character dies at the wheel: the body ends up beside the vehicle, which rolls on by itself
  driverDown(ch) {
    const v = ch.vehicle;
    if (!v) return;
    const p = this._exitSpot(v, this._seatOf(v, ch));
    this._release(v, ch);
    ch.x = p[0]; ch.z = p[1]; ch.y = Math.max(p[2], Math.min(v.y, p[2] + 0.6)); ch.vy = 0;
  },

  // ------------------------------------------------------------------ bullets, blasts, people in the way
  // Nearest hull hit by a ray. Returns t or -1; the vehicle is left in rayV, the surface normal in rayN.
  rayHit(ox, oy, oz, dx, dy, dz, tMax, skip) {
    let best = -1;
    this.rayV = null;
    for (const v of this.list) {
      if (v === skip) continue;
      const b = v.box, cy = (b.y0 + b.y1) / 2;
      const tc = (b.x - ox) * dx + (cy - oy) * dy + (b.z - oz) * dz, reach = b.hz + 1.2;
      if (tc < -reach || tc > tMax + reach) continue;
      const qx = ox + dx * tc - b.x, qy = oy + dy * tc - cy, qz = oz + dz * tc - b.z;
      if (qx * qx + qy * qy + qz * qz > reach * reach) continue;
      const t = Phys._rayCol(b, ox, oy, oz, dx, dy, dz, best < 0 ? tMax : best);
      if (t >= 0 && t <= tMax && (best < 0 || t < best)) { best = t; this.rayV = v; this.rayN[0] = Phys._n[0]; this.rayN[1] = Phys._n[1]; this.rayN[2] = Phys._n[2]; }
    }
    return best;
  },
  // Does a hull stand between a and b? (line of sight; skipA / skipB: the vehicles the two ends sit in)
  blocks(ax, ay, az, bx, by, bz, skipA, skipB) {
    if (!this.list.length) return false;
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return false;
    dx /= len; dy /= len; dz /= len;
    const h2 = dx * dx + dz * dz;
    for (const v of this.list) {
      if (v === skipA || v === skipB) continue;
      const b = v.box, tc = h2 > 1e-9 ? clamp(((b.x - ax) * dx + (b.z - az) * dz) / h2, 0, len) : 0, reach = b.hz + 1;
      const qx = ax + dx * tc - b.x, qz = az + dz * tc - b.z;
      if (qx * qx + qz * qz > reach * reach) continue;
      const t = Phys._rayCol(b, ax, ay, az, dx, dy, dz, len);
      if (t >= 0 && t < len - 0.05) return true;
    }
    return false;
  },
  // Keep a walking character (disc of radius r at pos, feet at y) out of the hulls. Returns true if it was pushed.
  pushOut(pos, y, r, hgt) {
    let any = false;
    for (const v of this.list) {
      const b = v.box, dx = pos.x - b.x, dz = pos.z - b.z;
      if (dx * dx + dz * dz > (b.hz + r + 1) * (b.hz + r + 1)) continue;
      if (y >= b.y1 - 0.05 || y + hgt <= v.y) continue;
      const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (lx < -b.hx - r || lx > b.hx + r || lz < -b.hz - r || lz > b.hz + r) continue;
      const qx = lx < -b.hx ? -b.hx : lx > b.hx ? b.hx : lx, qz = lz < -b.hz ? -b.hz : lz > b.hz ? b.hz : lz;
      const ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
      if (d2 >= r * r) continue;
      let nx, nz, push;
      if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; push = r - d; }
      else {
        const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz);
        if (px < pz) { nx = lx < 0 ? -1 : 1; nz = 0; push = px + r; } else { nx = 0; nz = lz < 0 ? -1 : 1; push = pz + r; }
      }
      pos.x += (nx * b.c + nz * b.s) * push;
      pos.z += (-nx * b.s + nz * b.c) * push;
      any = true;
    }
    return any;
  },
  // Damage from bullets and blasts. A vehicle below a quarter of its strength catches fire and blows up a few seconds later.
  damage(v, amount, attacker, weaponId) {
    if (!v.alive || !(amount > 0)) return 0;
    v.hp -= amount; v.hitT = 0.12;
    if (attacker) {
      v.lastHitBy = attacker; v.lastHitT = Game.time;
      const d = v.driver;
      if (d && d !== attacker && d.team !== attacker.team) { d.rideHitT = Game.time; d.rideHitBy = attacker; if (attacker.isPlayer) d.provoked = true; }
      if (v.riders) for (const q of v.pass) if (q && q.team !== attacker.team) { q.rideHitT = Game.time; q.rideHitBy = attacker; if (attacker.isPlayer) q.provoked = true; }
    }
    Game.events.emit('vehDamage', v, attacker, amount, weaponId);
    if (!v.burning && v.hp <= v.def.hp * VEHICLE_CFG.burnAt) { v.burning = true; Game.events.emit('vehBurn', v); }
    if (v.hp <= 0) this.explode(v);
    return amount;
  },
  // a knock from driving into something: dents, never fire
  _crash(v, impact) {
    if (!v.alive || impact <= VEHICLE_CFG.crashFrom) return;
    const dmg = (impact - VEHICLE_CFG.crashFrom) * VEHICLE_CFG.crashDmg;
    if (!v.burning) v.hp = Math.max(Math.min(v.hp, v.def.hp * VEHICLE_CFG.burnAt + 1), v.hp - dmg);
    v.hitT = 0.12;
  },
  // who gets the blame for what this vehicle does to somebody (a blast, a body in the road)
  _culprit(v) { return v.driver || (Game.time - v.leftT < 6 ? v.lastDriver : null); },
  _scale(victim, attacker) {
    if (!attacker) return victim.isPlayer && Game.playerShielded() ? 0 : 1;      // (a runaway, a chain of blasts: the landing protection covers those too)
    if (attacker !== victim && attacker.team === victim.team) return 0;          // (squad mode: nothing a team-mate does with a vehicle hurts)
    if (attacker.isPlayer) return 1;
    return victim.isPlayer ? Game.playerScale(attacker) : Game.botScale(attacker, victim);
  },
  explode(v) {
    if (!v.alive) return;
    const C = VEHICLE_CFG, by = Game.time - v.lastHitT < 12 ? v.lastHitBy : null;
    v.alive = false; v.burning = false; v.hp = 0; v.deadT = 0; v.awake = true;
    const x = v.x, y = v.y + 0.8, z = v.z;
    Game.events.emit('vehExplode', v, x, y, z);
    const inside = this.occupants(v);
    for (const d of inside) {                                  // still in their seats: thrown clear, badly hurt
      this.exit(d);
      d.vy = 5; d.vx += (d.x - x) * 2.5; d.vz += (d.z - z) * 2.5;
      const dmg = C.blastDriver * this._scale(d, by);
      if (dmg > 0) { Game.events.emit('hitChar', d, by, d.x, d.y + 1.1, d.z, false); d.damage(dmg, by, 'blast', false, false); }
      else Game.events.emit('guard', d, by, d.x, d.y + 1.1, d.z);
    }
    for (const c of Game.chars) {
      if (!c.alive || inside.indexOf(c) >= 0 || c.mode === 'plane') continue;
      const dist = dist3D(x, y, z, c.x, c.y + 0.9, c.z);
      if (dist > C.blastR) continue;
      if (dist > 2.6 && !Phys.segmentClear(x, y + 0.6, z, c.x, c.y + 1.1, c.z)) continue;
      const dmg = C.blastDmg * clamp01(1.08 - dist / C.blastR) * this._scale(c, by) * (c.mode === 'down' ? SQUAD.downBlast : 1);
      if (dmg > 1) { Game.events.emit('hitChar', c, by, c.x, c.y + 1.1, c.z, false); c.damage(dmg, by, 'blast', false, false); }
    }
    for (const o of this.list) {
      if (o === v || !o.alive) continue;
      const dist = dist3D(x, y, z, o.x, o.y + 0.8, o.z);
      if (dist < C.blastR) this.damage(o, C.blastVeh * clamp01(1.1 - dist / C.blastR), by, 'blast');
    }
    v.vx *= 0.35; v.vz *= 0.35;
    Game.noise(x, z, 170, by);
  },
  // flooded: the engine is gone for good, whoever sat in it swims
  _sink(v) {
    if (!v.alive) return;
    const inside = this.occupants(v);
    v.alive = false; v.sunk = true; v.burning = false; v.deadT = 0; v.vx = 0; v.vz = 0;
    for (const d of inside) this.exit(d);
    Game.events.emit('vehSink', v);
  },
  // somebody on foot in the path of a moving vehicle
  _ram(v, sp) {
    const def = v.def, b = v.box, R = CFG.CHAR_RADIUS, C = VEHICLE_CFG, reach = b.hz + R + 0.5;
    for (const c of Game.chars) {
      if (!c.alive || c.mode !== 'ground' || c === v.driver) continue;
      if (v.driver && c.team === v.driver.team) continue;                // (squad mode: team-mates are nudged aside by the hull, not run over)
      const dx = c.x - b.x, dz = c.z - b.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (c.y > v.y + def.top || c.y + 1.7 < v.y + 0.1) continue;
      const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) > b.hx + R + 0.05 || Math.abs(lz) > b.hz + R + 0.05) continue;
      if ((v.vx * dx + v.vz * dz) / (sp * (Math.hypot(dx, dz) || 1)) < 0.2) continue;       // not in the direction of travel
      if (c.ramT !== undefined && Game.time < c.ramT) continue;
      c.ramT = Game.time + 0.7;
      const by = this._culprit(v);
      const dmg = (sp - C.ramFrom + 1.5) * def.ram * this._scale(c, by);
      c.vx = v.vx * 0.85; c.vz = v.vz * 0.85; c.vy = 3 + sp * 0.12; c.grounded = false;
      Game.events.emit('vehRam', v, c, sp);
      if (dmg > 0) { Game.events.emit('hitChar', c, by, c.x, c.y + 1.0, c.z, false); c.damage(dmg, by === c ? null : by, 'vehicle', false, false); }
      else Game.events.emit('guard', c, by, c.x, c.y + 1.0, c.z);
      const k = 1 - 0.1 / def.mass;
      v.vx *= k; v.vz *= k;
    }
  },

  // ------------------------------------------------------------------ simulation
  update(dt) {
    const over = Game.state === 'ended';        // the match is decided: vehicles roll to a stop, nothing blows up or runs anybody over any more
    for (let i = 0; i < this.list.length; i++) {
      const v = this.list[i];
      if (v.hitT > 0) v.hitT -= dt;
      if (!v.alive) v.deadT += dt;
      else if (v.burning && !over) { v.hp -= v.def.hp * VEHICLE_CFG.burnRate * dt; if (v.hp <= 0) this.explode(v); }
      if (v.awake || v.driver) this._step(v, dt);
    }
  },
  // the other vehicles, as discs: pushes p (radius of v) clear of them and passes some of the knock on
  _others(v, p) {
    let hit = false;
    const r0 = v.def.rad;
    for (const o of this.list) {
      if (o === v) continue;
      const dx = p.x - o.x, dz = p.z - o.z, reach = r0 + o.def.rad + o.def.len / 2;
      if (dx * dx + dz * dz > reach * reach || Math.abs(v.y - o.y) > 1.8) continue;
      const s = Math.sin(o.yaw), c = Math.cos(o.yaw), rr = r0 + o.def.rad, C = o.def.circles;
      for (let k = 0; k < C.length; k++) {
        const ex = p.x - (o.x + s * C[k]), ez = p.z - (o.z + c * C[k]), d2 = ex * ex + ez * ez;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4, nx = ex / d, nz = ez / d;
        p.x += nx * (rr - d); p.z += nz * (rr - d);
        hit = true;
        if (o.alive && o.shoveT !== Game.time) {
          const vn = (v.vx - o.vx) * nx + (v.vz - o.vz) * nz;           // closing speed along the contact (negative = approaching)
          if (vn < -0.6) {
            o.shoveT = Game.time;
            const k2 = -vn * v.def.mass / (v.def.mass + o.def.mass) * 0.9;
            o.vx -= nx * k2; o.vz -= nz * k2; o.awake = true;
            this._crash(o, -vn * 0.7);
          }
        }
      }
    }
    return hit;
  },
  // Move by the current velocity for h seconds and resolve what is in the way. Returns the speed of the knock, if any.
  _move(v, h) {
    const def = v.def, C = def.circles, a0 = C[0], a1 = C[C.length - 1], r = def.rad, lim = Terrain.HALF - 8;
    const ox = v.x, oz = v.z, oyaw = v.yaw, yy = v.y - 0.2, hh = def.high + 0.2;
    const wx = clamp(ox + v.vx * h, -lim, lim), wz = clamp(oz + v.vz * h, -lim, lim);
    let cx = wx, cz = wz, s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    // front and rear disc: each is pushed clear on its own, which also turns the vehicle (it glances off instead of sticking)
    _vp.x = cx + s * a1; _vp.z = cz + c * a1;
    let hitF = Phys.collideXZ(_vp, yy, r, hh);
    if (this._others(v, _vp)) hitF = true;
    const fx = _vp.x, fz = _vp.z;
    _vp.x = cx + s * a0; _vp.z = cz + c * a0;
    let hitR = Phys.collideXZ(_vp, yy, r, hh);
    if (this._others(v, _vp)) hitR = true;
    const rx = _vp.x, rz = _vp.z;
    let hit = hitF || hitR;
    if (hit) {
      const yaw = v.yaw + clamp(angleDelta(v.yaw, Math.atan2(fx - rx, fz - rz)), -0.1, 0.1);
      s = Math.sin(yaw); c = Math.cos(yaw);
      if (hitF && !hitR) { cx = fx - s * a1; cz = fz - c * a1; }
      else if (hitR && !hitF) { cx = rx - s * a0; cz = rz - c * a0; }
      else { const m = (a0 + a1) / 2; cx = (fx + rx) / 2 - s * m; cz = (fz + rz) / 2 - c * m; }
      v.yaw = yaw;
    }
    for (let i = 1; i < C.length - 1; i++) {                   // the discs in between only shift it sideways
      _vp.x = cx + s * C[i]; _vp.z = cz + c * C[i];
      let m = Phys.collideXZ(_vp, yy, r, hh);
      if (this._others(v, _vp)) m = true;
      if (m) { cx = _vp.x - s * C[i]; cz = _vp.z - c * C[i]; hit = true; }
    }
    // ground too steep to climb, or a staircase: stays where it was
    const lead = v.vx * s + v.vz * c >= 0 ? a1 : a0, lx = cx + s * lead, lz = cz + c * lead;
    const os = Math.sin(oyaw), oc = Math.cos(oyaw);
    if (Terrain.height(lx, lz) > Terrain.height(ox + os * lead, oz + oc * lead) + 0.004) {
      Terrain.normal(lx, lz, _vn);
      if (_vn[1] < 0.6) { cx = ox + _vn[0] * 1.5 * h; cz = oz + _vn[2] * 1.5 * h; v.yaw = oyaw; hit = true; }
    }
    if (this._stairs(lx, lz, v.y)) { cx = ox; cz = oz; v.yaw = oyaw; hit = true; }
    let impact = 0;
    const px = cx - wx, pz = cz - wz, pl = Math.hypot(px, pz);
    if (pl > 1e-5) {
      const nx = px / pl, nz = pz / pl, vn = v.vx * nx + v.vz * nz;
      if (vn < 0) { impact = -vn; v.vx -= 1.12 * vn * nx; v.vz -= 1.12 * vn * nz; }
    }
    if (hit) { const k = Math.exp(-0.9 * h); v.vx *= k; v.vz *= k; }      // scraping along
    v.x = cx; v.z = cz;
    return impact;
  },
  _step(v, dt) {
    const def = v.def, d = v.driver, C = VEHICLE_CFG;
    if (v.mountT > 0) v.mountT -= dt;
    const live = v.alive && !!d, go = live && v.mountT <= 0;
    const thr = go ? clamp(v.throttle, -1, 1) : 0, hb = go && v.handbrake;
    let s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    let fwd = v.vx * s + v.vz * c;
    // ---- steering: the wheel angle follows the input, and turns in less the faster it goes
    const want = live ? clamp(v.steerIn, -1, 1) : 0;
    v.steer = moveToward(v.steer, want, (want === 0 || want * v.steer < 0 ? 5.5 : 3.4) * dt);
    const sp01 = clamp01(Math.abs(fwd) / def.maxSpeed);
    v.wheelAng = v.steer * lerp(def.steer, def.steerHi, smoothstep(0, 0.85, sp01));
    const yawRate = v.air ? 0 : fwd / (def.axF - def.axR) * Math.tan(v.wheelAng);          // > 0 = to the right
    v.yaw = wrapAngle(v.yaw - yawRate * dt);
    s = Math.sin(v.yaw); c = Math.cos(v.yaw);
    fwd = v.vx * s + v.vz * c;
    let lat = v.vx * c - v.vz * s;                             // sideways slip (toward the left)
    const fwd0 = fwd;
    if (!v.air) {
      // ---- tyres: sideways motion is scrubbed off (much less with the handbrake on: the tail comes round)
      const grip = def.grip * (hb ? 0.22 : v.wet > 0.4 ? 0.6 : 1);
      v.skid = Math.abs(lat) > 2.2 || (hb && Math.abs(fwd) > 3) ? 1 : 0;
      lat *= Math.exp(-grip * dt);
      // ---- engine, brakes
      const top = def.maxSpeed * lerp(def.offroad, 1, v.bare) * lerp(1, 0.14, smoothstep(C.wet, 1.0, v.wet));
      // (the engine pulls harder up a hill, as in a low gear: every slope the route finder allows can be climbed)
      const climb = Math.sin(v.pitch);
      if (hb) fwd = moveToward(fwd, 0, def.brake * 0.8 * dt);
      else if (thr > 0) {
        if (fwd < -0.4) fwd = moveToward(fwd, 0, def.brake * thr * dt);
        else fwd += def.accel * thr * (1 + clamp(climb * 2.2, 0, 0.9)) * Math.max(0, 1 - Math.pow(clamp01(fwd / top), 2.4)) * dt;
      } else if (thr < 0) {
        if (fwd > 0.4) fwd = moveToward(fwd, 0, def.brake * -thr * dt);
        else fwd += def.accel * 0.7 * thr * (1 + clamp(-climb * 2.2, 0, 0.9)) * Math.max(0, 1 - clamp01(-fwd / def.reverse)) * dt;
      }
      // rolling resistance, and engine braking with nobody on the pedal; water drags hard
      fwd -= fwd * ((thr !== 0 ? 0.04 : 0.25) + 5 * smoothstep(C.wet, 0.9, v.wet)) * dt;
      if (thr === 0) fwd = moveToward(fwd, 0, 1.2 * dt);
      // At a crawl with the pedals untouched the brake holds it (no rolling back on a hill); a vehicle nobody sits in
      // brakes by itself: gently for the first two seconds, so that one left in a hurry rolls on for a bit, then firmly.
      const hold = go && thr === 0 && !hb && Math.abs(fwd) < 1.2;
      if (!go || hold) fwd = moveToward(fwd, 0, (d || Game.time - v.leftT > 2 ? def.brake * 0.6 : 4.5) * dt);
      // the slope pulls it down the hill
      if (go ? !hold : Math.abs(fwd) > 0.3) fwd -= 15 * climb * dt;
      if (fwd > top) fwd = Math.max(top, fwd - (6 + (fwd - top) * 2.5) * dt);              // bogged down, or faster than it can go
      const back = -def.reverse * 1.25;
      if (fwd < back) fwd = Math.min(back, fwd + (6 + (back - fwd) * 2.5) * dt);           // (rolling backwards down a hill)
      if (!go && Math.abs(fwd) < 0.3) fwd = 0;
    }
    v.vx = s * fwd + c * lat; v.vz = c * fwd - s * lat;
    // ---- move, in steps short enough not to skip a wall
    let sp = Math.hypot(v.vx, v.vz), impact = 0;
    if (sp > 0.001) {
      const n = Math.max(1, Math.ceil(sp * dt / 0.3));
      for (let k = 0; k < n; k++) impact = Math.max(impact, this._move(v, dt / n));
      sp = Math.hypot(v.vx, v.vz);
    }
    if (impact > 2.5) { Game.events.emit('vehCrash', v, impact); this._crash(v, impact); }
    // ---- up and down: follows the ground, leaves it over a crest, falls off ledges
    this._ground(v);
    const gy = v._gy, y0 = v.y;
    v.vy -= CFG.GRAVITY * dt;
    let ny = y0 + v.vy * dt;
    if (ny <= gy + 0.02) {
      if (v.air && v.vy < -9) { Game.events.emit('vehCrash', v, -v.vy * 0.6); this._crash(v, -v.vy * 0.75); }
      // a slope is followed exactly, a kerb is climbed over a few frames
      const rise = gy - y0, easy = (sp * 1.2 + 2) * dt;
      ny = rise <= easy ? gy : y0 + easy + (rise - easy) * (1 - Math.exp(-20 * dt));
      v.vy = dt > 0 ? clamp((ny - y0) / dt, -30, Math.min(7, sp * 0.5)) * 0.8 : 0;
      v.air = false;
    } else v.air = ny > gy + 0.15;
    v.y = ny;
    const k = 1 - Math.exp(-(v.air ? 2 : 12) * dt);
    v.pitch += ((v.air ? v.pitch * 0.6 : v._gp) - v.pitch) * k;
    v.roll += ((v.air ? 0 : v._gr) - v.roll) * k;
    // ---- how the body sits on its springs (looks only): into the bend on two wheels, out of it on four; nose down under braking
    const latAcc = yawRate * fwd, lon = dt > 0 ? (fwd - fwd0) / dt : 0;
    const lean = def.track > 0 ? clamp(-latAcc * 0.006, -0.07, 0.07) : d || sp > 1 ? clamp(latAcc * 0.05, -0.62, 0.62) : this.STAND;
    v.lean += (lean - v.lean) * (1 - Math.exp(-7 * dt));
    v.squat += (clamp(lon * 0.004, -0.05, 0.05) - v.squat) * (1 - Math.exp(-8 * dt));
    v.speed = v.vx * s + v.vz * c;
    v.spin += v.speed / def.wheelR * dt;
    v.bare = Terrain.bareAt(v.x, v.z);
    this._box(v);
    // ---- water
    v.wet = Math.max(0, -v.y);
    if (v.alive && v.wet > C.wade) this._sink(v);
    if (v.driver) {
      this._seat(v);
      if (sp > 4) { v.noiseT -= dt; if (v.noiseT <= 0) { v.noiseT = 0.7; Game.noise(v.x, v.z, 60, v.driver); } }
    } else if (v.riders) this._seat(v);
    if (v.alive && sp > C.ramFrom && Game.state !== 'ended') this._ram(v, sp);
    // ---- comes to rest
    if (!v.driver && !v.air && sp < 0.05) { v.vx = 0; v.vz = 0; v.speed = 0; v.steer = moveToward(v.steer, 0, 3 * dt); if (Math.abs(v.steer) < 0.01 && Math.abs(v.pitch - v._gp) < 0.004 && Math.abs(v.lean - lean) < 0.01) v.awake = false; }
  },

  // ------------------------------------------------------------------ for the bots
  // A vehicle worth taking for a trip from (x, z) to (gx, gz): close by, drivable from where it stands, and no detour.
  // (seats: how many it has to hold, squad mode: nobody is left behind)
  findFor(ch, gx, gz, ignored, seats) {
    const C = VEHICLE_CFG, trip = Math.hypot(gx - ch.x, gz - ch.z);
    if (ch.swimming) return null;
    let best = null, bd = C.rideSeek;
    for (const v of this.list) {
      if (!v.alive || v.driver || v.burning || v.hp < v.def.hp * 0.45 || (ignored && ignored.has(v))) continue;
      if (seats && 1 + v.def.pass.length < seats) continue;
      const d = Math.hypot(v.x - ch.x, v.z - ch.z);
      if (d >= bd || Math.abs(v.y - ch.y) > 3) continue;
      if (d + Math.hypot(gx - v.x, gz - v.z) > trip * 1.2 + 6) continue;
      if (Nav.nearestFree(v.x, v.z, 5, false, true) < 0 || Nav.nearestFree(v.x, v.z, 3, true) < 0) continue;
      bd = d; best = v;
    }
    return best;
  },
};
