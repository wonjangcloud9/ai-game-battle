// AURORA FALL — characters (skeleton pose + procedural animation), held weapons, loot, chests, vehicles and props.
// Characters go to the skinned batch (bone matrices), everything else to the instanced model batches.
'use strict';

const CharModel = (function () {
  const NB = CharMesh.COUNT, BIND = CharMesh.BIND, B = CharMesh.BONE;
  // pose in character space: per bone a rotation (3x3, columns) and the position of its joint
  const R = new Float32Array(NB * 9), P = new Float32Array(NB * 3);
  const root = m4.create(), M = m4.create(), W = m4.create(), aim = m4.create(), gun = m4.create(), tmpM = m4.create();
  const rA = new Float32Array(9), rB = new Float32Array(9), rC = new Float32Array(9), rD = new Float32Array(9), rE = new Float32Array(9), rL = new Float32Array(9);
  const v1 = [0, 0, 0], v2 = [0, 0, 0], sL = [0, 0, 0], sR = [0, 0, 0], eL = [0, 0, 0], eR = [0, 0, 0], tL = [0, 0, 0], tR = [0, 0, 0];
  const hL = [0, 0, 0], hR = [0, 0, 0], kL = [0, 0, 0], kR = [0, 0, 0], fL = [0, 0, 0], fR = [0, 0, 0];

  const lin = hex => hexLin(hex);
  const SUITS = SUIT_COLORS.map(lin);
  const PANTS = [lin(0x2e3440), lin(0x4a4338), lin(0x38414a), lin(0x3a3a34), lin(0x51483a)];
  const SKIN = [lin(0xe0b08c), lin(0xc68e68), lin(0x9a6a48), lin(0xf0c8a4), lin(0x6e4a34)];
  const COL = { white: lin(0xf0ede6), red: lin(0xd8362c), cyan: lin(0x49d6ff), gold: lin(0xffc247), orange: lin(0xe8782a), teal: lin(0x35d9bb), green: lin(0x5d6b3c) };
  const RAR = RARITY.map(r => lin(r.color));
  const AMMO_COL = {}; for (const k in AMMO) AMMO_COL[k] = lin(AMMO[k].color);

  // ---- small 3x3 helpers (column-major, same rotation order as m4.compose: yaw, then pitch, then roll)
  function rotSet(o, yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    o[0] = cy * cr + sy * sp * sr; o[1] = cp * sr; o[2] = -sy * cr + cy * sp * sr;
    o[3] = -cy * sr + sy * sp * cr; o[4] = cp * cr; o[5] = sy * sr + cy * sp * cr;
    o[6] = sy * cp; o[7] = -sp; o[8] = cy * cp;
    return o;
  }
  function rotMul(o, a, b) {
    for (let c = 0; c < 3; c++) {
      const b0 = b[c * 3], b1 = b[c * 3 + 1], b2 = b[c * 3 + 2];
      o[c * 3] = a[0] * b0 + a[3] * b1 + a[6] * b2; o[c * 3 + 1] = a[1] * b0 + a[4] * b1 + a[7] * b2; o[c * 3 + 2] = a[2] * b0 + a[5] * b1 + a[8] * b2;
    }
    return o;
  }
  function setBone(b, r, x, y, z) { for (let i = 0; i < 9; i++) R[b * 9 + i] = r[i]; P[b * 3] = x; P[b * 3 + 1] = y; P[b * 3 + 2] = z; }
  // joint of `child` when its parent bone (rotation r, joint at px,py,pz) carries it
  function carry(out, r, parent, child, px, py, pz) {
    const dx = BIND[child][0] - BIND[parent][0], dy = BIND[child][1] - BIND[parent][1], dz = BIND[child][2] - BIND[parent][2];
    out[0] = px + r[0] * dx + r[3] * dy + r[6] * dz; out[1] = py + r[1] * dx + r[4] * dy + r[7] * dz; out[2] = pz + r[2] * dx + r[5] * dy + r[8] * dz;
    return out;
  }
  // bone b at joint p pointing toward q (the child joint); (fx, fy, fz) is the side the bone's front faces
  function aimBone(b, p, q, fx, fy, fz) {
    let yx = p[0] - q[0], yy = p[1] - q[1], yz = p[2] - q[2];
    let l = 1 / (Math.hypot(yx, yy, yz) || 1); yx *= l; yy *= l; yz *= l;
    let xx = yy * fz - yz * fy, xy = yz * fx - yx * fz, xz = yx * fy - yy * fx;           // x = y cross front
    l = Math.hypot(xx, xy, xz);
    if (l < 1e-4) { xx = 1; xy = 0; xz = 0; l = 1; }
    xx /= l; xy /= l; xz /= l;
    const o = b * 9;
    R[o] = xx; R[o + 1] = xy; R[o + 2] = xz; R[o + 3] = yx; R[o + 4] = yy; R[o + 5] = yz;
    R[o + 6] = xy * yz - xz * yy; R[o + 7] = xz * yx - xx * yz; R[o + 8] = xx * yy - xy * yx;   // z = x cross y
    P[b * 3] = p[0]; P[b * 3 + 1] = p[1]; P[b * 3 + 2] = p[2];
  }
  // two-bone IK: from s reach for t with segment lengths l1 / l2, the middle joint leaning toward (hx, hy, hz) -> e
  function ik(s, t, l1, l2, hx, hy, hz, e) {
    let dx = t[0] - s[0], dy = t[1] - s[1], dz = t[2] - s[2];
    let d = Math.hypot(dx, dy, dz) || 1e-4;
    dx /= d; dy /= d; dz /= d;
    const maxD = l1 + l2 - 0.004;
    if (d > maxD) { d = maxD; t[0] = s[0] + dx * d; t[1] = s[1] + dy * d; t[2] = s[2] + dz * d; }
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const dot = hx * dx + hy * dy + hz * dz;
    let px = hx - dx * dot, py = hy - dy * dot, pz = hz - dz * dot;
    const pl = Math.hypot(px, py, pz) || 1;
    e[0] = s[0] + dx * a + px / pl * h; e[1] = s[1] + dy * a + py / pl * h; e[2] = s[2] + dz * a + pz / pl * h;
  }
  const UPPER = 0.28, FORE = 0.26, THIGH = 0.43, SHIN = 0.415;
  // arm: shoulder s, wrist target t, elbow leaning toward the hint; the hand keeps the forearm's orientation
  function arm(up, fo, ha, s, t, e, hx, hy, hz) {
    ik(s, t, UPPER, FORE, hx, hy, hz, e);
    const fx = (s[0] + t[0]) / 2 - e[0], fy = (s[1] + t[1]) / 2 - e[1], fz = (s[2] + t[2]) / 2 - e[2], l = Math.hypot(fx, fy, fz);
    const ux = l > 0.004 ? fx / l : -hx, uy = l > 0.004 ? fy / l : -hy, uz = l > 0.004 ? fz / l : -hz;
    aimBone(up, s, e, ux, uy, uz); aimBone(fo, e, t, ux, uy, uz);
    for (let i = 0; i < 9; i++) R[ha * 9 + i] = R[fo * 9 + i];
    P[ha * 3] = t[0]; P[ha * 3 + 1] = t[1]; P[ha * 3 + 2] = t[2];
  }
  // leg: hip h, ankle target a, knee leaning toward the hint; the foot is turned by (yaw, pitch)
  function leg(th, sh, ft, h, a, k, hx, hy, hz, footYaw, footPitch) {
    ik(h, a, THIGH, SHIN, hx, hy, hz, k);
    const fx = k[0] - (h[0] + a[0]) / 2, fy = k[1] - (h[1] + a[1]) / 2, fz = k[2] - (h[2] + a[2]) / 2, l = Math.hypot(fx, fy, fz);
    const ux = l > 0.004 ? fx / l : hx, uy = l > 0.004 ? fy / l : hy, uz = l > 0.004 ? fz / l : hz;
    aimBone(th, h, k, ux, uy, uz); aimBone(sh, k, a, ux, uy, uz);
    rotSet(rL, footYaw, footPitch, 0);
    setBone(ft, rL, a[0], a[1], a[2]);
  }

  // ---- lighting of things that move: dimmer under a roof, warmed by the lamps there at night
  const _io = [1, 0];
  function indoor(x, y, z) {
    _io[0] = 1; _io[1] = 0;
    const F = World.footprints;
    for (let i = 0; i < F.length; i++) {
      const f = F[i], dx = x - f.x, dz = z - f.z, r = Math.max(f.w, f.d) * 0.72;
      if (dx * dx + dz * dz > r * r) continue;
      const c = Math.cos(f.yaw), s = Math.sin(f.yaw), lx = Math.abs(dx * c - dz * s), lz = Math.abs(dx * s + dz * c);
      if (lx < f.w / 2 - 0.15 && lz < f.d / 2 - 0.15 && y < Terrain.height(f.x, f.z) + 6.6) { _io[0] = 0.5; _io[1] = 0.32; return _io; }
    }
    _io[1] = Terrain.lampAt(x, z) * 0.55;
    return _io;
  }

  // ------------------------------------------------------------------ characters
  function state(ch) {
    return ch._ps || (ch._ps = { crouch: ch.crouch ? 1 : 0, sprint: 0, air: 0, gun: ch.curWeapon() ? 1 : 0, aimOff: 0, ready: 0, leanX: 0, lastYaw: ch.yaw, hipYaw: ch.yaw, turning: false, turnPh: 0 });
  }
  // The pose in R / P goes to the skinned batch. `pivot`: height the root matrix turns the figure around.
  function submit(ch, far, pivot, io, flash) {
    const off = SkinBatch.add(far ? 1 : 0, flash, io[0], io[1], SUITS[ch.color % SUITS.length], PANTS[ch.id % PANTS.length], SKIN[(ch.id * 7 + 3) % SKIN.length]);
    if (off < 0) return;
    const d = SkinBatch.bones;
    for (let b = 0; b < NB; b++) {
      const o = b * 9, bx = BIND[b][0], by = BIND[b][1], bz = BIND[b][2];
      // character-space matrix: rotation R, translation joint - R * bind joint (minus the pivot the root turns around)
      const tx = P[b * 3] - (R[o] * bx + R[o + 3] * by + R[o + 6] * bz), ty = P[b * 3 + 1] - (R[o + 1] * bx + R[o + 4] * by + R[o + 7] * bz) - pivot, tz = P[b * 3 + 2] - (R[o + 2] * bx + R[o + 5] * by + R[o + 8] * bz);
      const q = off + b * 12;
      for (let r = 0; r < 3; r++) {
        const m0 = root[r], m1 = root[4 + r], m2 = root[8 + r];
        d[q + r * 4] = m0 * R[o] + m1 * R[o + 1] + m2 * R[o + 2];
        d[q + r * 4 + 1] = m0 * R[o + 3] + m1 * R[o + 4] + m2 * R[o + 5];
        d[q + r * 4 + 2] = m0 * R[o + 6] + m1 * R[o + 7] + m2 * R[o + 8];
        d[q + r * 4 + 3] = m0 * tx + m1 * ty + m2 * tz + root[12 + r];
      }
    }
  }
  // ------------------------------------------------------------------ at the wheel
  // Seated in the vehicle and moving with it: hands on the wheel (or the bars of a bike), feet on the pedals (or pegs).
  // Character space here: the hip joint half a metre above the origin, which sits under the seat.
  const _g = [0, 0, 0];
  function drawDriver(ch, time, far) {
    const v = ch.vehicle, def = v.def, seat = def.seat, bike = def.sit === 'bike';
    const ox = seat[0], oy = seat[1] - 0.5, oz = seat[2];
    VehModel.matrix(v, M);
    m4.compose(tmpM, ox, oy, oz, 0, 0, 0, 1, 1, 1);
    m4.multiply(root, M, tmpM);
    const breath = Math.sin(time * 1.5 + ch.id * 1.7), steer = v.steer, bump = clamp(v.vy * 0.012, -0.05, 0.05);
    const look = clamp(angleDelta(v.yaw, ch.aimYaw), -1.25, 1.25), flinch = ch.hitT > 0 ? ch.hitT / 0.2 : 0;
    // ---- spine: leaning over the bars, or back into the seat; into the bend a little
    const lean = bike ? 0.5 : -0.2;
    rotSet(rA, 0, lean * 0.5, steer * (bike ? 0 : -0.03));
    setBone(B.hips, rA, 0, 0.5 + bump, 0);
    carry(v1, rA, B.hips, B.spine, 0, 0.5 + bump, 0);
    rotMul(rB, rA, rotSet(rE, 0, lean * 0.3, 0));
    setBone(B.spine, rB, v1[0], v1[1], v1[2]);
    carry(v2, rB, B.spine, B.chest, v1[0], v1[1], v1[2]);
    rotMul(rC, rB, rotSet(rE, look * 0.15 - steer * 0.06, lean * 0.2 + breath * 0.008 - flinch * 0.1, steer * (bike ? 0.04 : -0.05)));
    setBone(B.chest, rC, v2[0], v2[1], v2[2]);
    const cx = v2[0], cy = v2[1], cz = v2[2];
    carry(v1, rC, B.chest, B.neck, cx, cy, cz);
    rotMul(rD, rC, rotSet(rE, look * 0.35, -lean * 0.45, 0));          // the head stays level and looks where the driver looks
    setBone(B.neck, rD, v1[0], v1[1], v1[2]);
    carry(v2, rD, B.neck, B.head, v1[0], v1[1], v1[2]);
    rotMul(rB, rD, rotSet(rE, look * 0.5, -lean * 0.45 + (bike ? -0.08 : 0.04), 0));
    setBone(B.head, rB, v2[0], v2[1], v2[2]);
    carry(sL, rC, B.chest, B.armL, cx, cy, cz); carry(sR, rC, B.chest, B.armR, cx, cy, cz);
    carry(hL, rA, B.hips, B.thighL, 0, 0.5 + bump, 0); carry(hR, rA, B.hips, B.thighR, 0, 0.5 + bump, 0);
    // ---- hands
    for (let s = 0; s < 2; s++) {
      const sd = s ? -1 : 1, S = s ? sR : sL, T = s ? tR : tL;
      if (bike) VehModel.forkPoint(sd * def.handW, 0.14, -0.03, v.wheelAng, _g);
      else {
        // on the rim of the steering wheel, at ten and two, going round with it
        const a = sd * 1.05 - steer * 0.85, H = def.hands, rad = def.handW;
        _g[0] = H[0] + Math.sin(a) * rad; _g[1] = H[1] + Math.cos(a) * rad * 0.83; _g[2] = H[2] + Math.cos(a) * rad * 0.55;
      }
      // the wrist stops short of the grip: the hand closes the gap
      let dx = S[0] - (_g[0] - ox), dy = S[1] - (_g[1] - oy), dz = S[2] - (_g[2] - oz);
      const l = Math.hypot(dx, dy, dz) || 1;
      T[0] = _g[0] - ox + dx / l * 0.07; T[1] = _g[1] - oy + dy / l * 0.07; T[2] = _g[2] - oz + dz / l * 0.07;
    }
    arm(B.armR, B.foreR, B.handR, sR, tR, eR, bike ? -0.9 : -0.55, bike ? 0.1 : -0.8, -0.3);
    arm(B.armL, B.foreL, B.handL, sL, tL, eL, bike ? 0.9 : 0.55, bike ? 0.1 : -0.8, -0.3);
    // ---- feet: on the pegs with the knees against the tank, or stretched out to the pedals
    const F = def.feet;
    fL[0] = (bike ? 0 : seat[0]) + F[0] - ox; fL[1] = F[1] - oy; fL[2] = F[2] - oz;
    fR[0] = (bike ? 0 : seat[0]) - F[0] - ox; fR[1] = F[1] - oy; fR[2] = F[2] - oz;
    leg(B.thighL, B.shinL, B.footL, hL, fL, kL, bike ? 0.35 : 0.12, bike ? 0.2 : 1, bike ? 1 : 0.5, 0.08, bike ? 0.15 : -0.5);
    leg(B.thighR, B.shinR, B.footR, hR, fR, kR, bike ? -0.35 : -0.12, bike ? 0.2 : 1, bike ? 1 : 0.5, -0.08, bike ? 0.15 : -0.5);
    submit(ch, far, 0, indoor(ch.x, ch.y + 1, ch.z), ch.hitT > 0 ? ch.hitT * 0.9 : 0);
  }

  // Squad mode: riding along in a passenger seat. Seat space: the hip joint half a metre above the origin, +z the way the
  // seat faces. Behind the rider of a bike (holding on to them), in a car seat (hands in the lap) or on the side of a load
  // bed (facing inwards, hands on the knees).
  function drawPassenger(ch, time, far) {
    const v = ch.vehicle, S = v.def.pass[ch.seat], seat = S.seat, pill = S.sit === 'pillion', bench = S.sit === 'bench', oy = seat[1] - 0.5;
    VehModel.matrix(v, M);
    m4.compose(tmpM, seat[0], oy, seat[2], S.yaw, 0, 0, 1, 1, 1);
    m4.multiply(root, M, tmpM);
    const breath = Math.sin(time * 1.5 + ch.id * 1.7), bump = clamp(v.vy * 0.012, -0.05, 0.05), sway = clamp(v.steer * Math.abs(v.speed) * 0.006, -0.09, 0.09);
    const look = clamp(angleDelta(v.yaw + S.yaw, ch.aimYaw), -1.25, 1.25), flinch = ch.hitT > 0 ? ch.hitT / 0.2 : 0;
    const lean = pill ? 0.3 : bench ? 0.14 : -0.2, hy = 0.5 + bump;
    rotSet(rA, 0, lean * 0.5, 0);
    setBone(B.hips, rA, 0, hy, 0);
    carry(v1, rA, B.hips, B.spine, 0, hy, 0);
    rotMul(rB, rA, rotSet(rE, 0, lean * 0.3, sway));
    setBone(B.spine, rB, v1[0], v1[1], v1[2]);
    carry(v2, rB, B.spine, B.chest, v1[0], v1[1], v1[2]);
    rotMul(rC, rB, rotSet(rE, look * 0.15, lean * 0.2 + breath * 0.008 - flinch * 0.1, sway * 0.5));
    setBone(B.chest, rC, v2[0], v2[1], v2[2]);
    const cx = v2[0], cy = v2[1], cz = v2[2];
    carry(v1, rC, B.chest, B.neck, cx, cy, cz);
    rotMul(rD, rC, rotSet(rE, look * 0.35, -lean * 0.45, 0));
    setBone(B.neck, rD, v1[0], v1[1], v1[2]);
    carry(v2, rD, B.neck, B.head, v1[0], v1[1], v1[2]);
    rotMul(rB, rD, rotSet(rE, look * 0.5, -lean * 0.45 + 0.04, 0));
    setBone(B.head, rB, v2[0], v2[1], v2[2]);
    carry(sL, rC, B.chest, B.armL, cx, cy, cz); carry(sR, rC, B.chest, B.armR, cx, cy, cz);
    carry(hL, rA, B.hips, B.thighL, 0, hy, 0); carry(hR, rA, B.hips, B.thighR, 0, hy, 0);
    // hands: round the rider's waist, in the lap, or on the knees
    const hx = pill ? 0.2 : bench ? 0.17 : 0.13, hh = hy + (pill ? 0.36 : bench ? 0.07 : 0.1), hz = pill ? 0.37 : bench ? 0.33 : 0.3;
    tL[0] = hx; tL[1] = hh; tL[2] = hz; tR[0] = -hx; tR[1] = hh; tR[2] = hz;
    arm(B.armR, B.foreR, B.handR, sR, tR, eR, -0.6, -0.75, -0.3); arm(B.armL, B.foreL, B.handL, sL, tL, eL, 0.6, -0.75, -0.3);
    // feet: on the pegs, on the floor in front of the seat, on the load bed
    const F = S.feet;
    fL[0] = F[0]; fL[1] = F[1] - oy; fL[2] = F[2]; fR[0] = -F[0]; fR[1] = F[1] - oy; fR[2] = F[2];
    leg(B.thighL, B.shinL, B.footL, hL, fL, kL, pill ? 0.3 : 0.12, pill ? 0.2 : 1, pill ? 1 : 0.5, 0.08, pill || bench ? 0.1 : -0.5);
    leg(B.thighR, B.shinR, B.footR, hR, fR, kR, pill ? -0.3 : -0.12, pill ? 0.2 : 1, pill ? 1 : 0.5, -0.08, pill || bench ? 0.1 : -0.5);
    submit(ch, far, 0, indoor(ch.x, ch.y + 1, ch.z), ch.hitT > 0 ? ch.hitT * 0.9 : 0);
  }

  function drawCharacter(ch, time, dt, far) {
    const mode = ch.mode;
    if (mode === 'plane') return;
    if (mode === 'dead' && ch.deadT > 7) return;
    if (mode === 'drive' && ch.vehicle) { const s0 = state(ch); s0.hipYaw = s0.lastYaw = ch.yaw; s0.gun = 0; if (ch.seat >= 0) drawPassenger(ch, time, far); else drawDriver(ch, time, far); return; }
    const st = state(ch);
    // (knocked down, squad mode: flat on the ground and crawling; in deep water it looks like swimming)
    const down = mode === 'down' && !ch.swimming;
    const ground = mode === 'ground' || (mode === 'down' && !down), swim = ground && ch.swimming, dead = mode === 'dead';
    // ---- smoothed blend factors
    const k = dt > 0 ? 1 - Math.exp(-dt * 11) : 0;
    st.crouch += ((ch.crouch ? 1 : 0) - st.crouch) * k;
    st.sprint += ((ch.sprinting ? 1 : 0) - st.sprint) * k;
    st.air += ((ground && !ch.grounded && !swim ? 1 : 0) - st.air) * (dt > 0 ? 1 - Math.exp(-dt * 14) : 0);
    const w = ch.curWeapon();
    st.gun += ((w ? 1 : 0) - st.gun) * k;
    const busy = ch.fireHold > 0 || ch.in.ads || ch.in.fire || ch.reloadT > 0;
    st.ready += ((busy ? 1 : 0) - st.ready) * (dt > 0 ? 1 - Math.exp(-dt * (busy ? 16 : 3.5)) : 0);
    const turn = dt > 0 ? clamp(angleDelta(st.lastYaw, ch.yaw) / dt, -6, 6) : 0;
    st.lastYaw = ch.yaw;
    st.leanX += (turn * 0.022 * Math.min(1, ch.moveAmt) - st.leanX) * k;
    st.aimOff += (clamp(angleDelta(ch.yaw, ch.aimYaw), -1.1, 1.1) - st.aimOff) * k;
    // The feet stay planted while the upper body turns to follow the aim; past about a quarter turn, or as soon as the
    // character moves, the hips swing round after it (with a little shuffle of the feet when standing).
    let twist = 0, shuffle = 0;
    if (ground && !swim) {
      const diff = angleDelta(st.hipYaw, ch.yaw);
      if (ch.moveAmt > 0.12 || !ch.grounded || Math.abs(diff) > 2.2) { st.hipYaw = Math.abs(diff) > 2.2 ? ch.yaw : dampAngle(st.hipYaw, ch.yaw, 14, dt); st.turning = false; }
      else {
        if (Math.abs(diff) > 0.8) st.turning = true;
        if (st.turning) {
          const before = st.hipYaw;
          st.hipYaw = dampAngle(st.hipYaw, ch.yaw, 8, dt);
          st.turnPh += Math.abs(angleDelta(before, st.hipYaw)) * 6;
          shuffle = Math.min(1, Math.abs(diff) * 2.5);
          if (Math.abs(diff) < 0.06) st.turning = false;
        }
      }
      twist = angleDelta(st.hipYaw, ch.yaw);
    } else { st.hipYaw = ch.yaw; st.turning = false; }

    const cr = st.crouch, sp = st.sprint, air = st.air, gunK = st.gun;
    const amt = Math.min(1.15, ch.moveAmt), ph = ch.animPhase, run = clamp01(amt);
    const breath = Math.sin(time * 1.5 + ch.id * 1.7);
    const aimP = ground && !swim ? ch.aimPitch : 0;
    const land = ch.landT > 0 ? Math.sin(clamp01(ch.landT / 0.35) * Math.PI) : 0;
    const flinch = ch.hitT > 0 ? ch.hitT / 0.2 : 0;

    // ---- whole body placement
    let pitch = 0, roll = st.leanX, py = ch.y, pivot = 0, scale = 1, yawAdd = 0;
    let hipsY = 0.96, hipsX = 0, hipsZ = 0;
    let pelYaw = 0, pelPitch = 0, pelRoll = 0, spPitch = 0, spYaw = 0, chPitch = 0, chYaw = 0, chRoll = 0, hdPitch = 0, hdYaw = 0;
    let armMode = w ? 'gun' : 'fists', legMode = 'walk';
    const stanceF = clamp(lerp(0.62, 0.4, run) - sp * 0.05 + cr * 0.1, 0.3, 0.7);
    if (ground && !swim) {
      const bobA = (0.016 + 0.03 * run) * Math.min(1, amt * 1.5) * (1 - cr * 0.4);
      hipsY = 0.96 - 0.012 - run * 0.035 - sp * 0.02 - cr * 0.33 - land * 0.16 - bobA * Math.cos(2 * (ph - Math.PI * stanceF)) + breath * 0.003 * (1 - run);
      hipsX = 0.018 * Math.cos(ph - Math.PI * stanceF) * Math.min(1, amt * 2) * (1 - run * 0.5) + Math.sin(time * 0.7 + ch.id) * 0.006 * (1 - run);
      hipsZ = -cr * 0.07 - air * 0.03;
      pelYaw = -(0.1 + 0.07 * sp) * Math.cos(ph) * Math.min(1, amt * 1.3) - gunK * 0.16 * (1 - sp);
      pelRoll = 0.045 * Math.sin(ph - Math.PI * stanceF) * Math.min(1, amt * 1.3);
      pelPitch = 0.03 + run * 0.06 + sp * 0.1 + cr * 0.2 + land * 0.12;
      spPitch = 0.03 + run * 0.05 + sp * 0.12 + cr * 0.2 - aimP * 0.16 + land * 0.1;
      spYaw = -pelYaw * 0.5;
      chPitch = 0.02 + sp * 0.08 + cr * 0.12 - aimP * 0.22 + breath * 0.008 - flinch * 0.1;
      chYaw = -pelYaw * 0.9 * (1 - gunK * 0.6) - gunK * 0.3 * (1 - sp * 0.6) + st.aimOff * 0.45 + flinch * 0.12 * (ch.id & 1 ? 1 : -1);
      chRoll = -pelRoll * 0.6;
      spYaw += twist * 0.35; chYaw += twist * 0.65;
      hdPitch = -aimP * 0.4 - (spPitch + chPitch + aimP * 0.38) * 0.75;
      hdYaw = twist + st.aimOff * 0.8 - chYaw - spYaw - pelYaw;                   // the head keeps facing where the character looks
      if (air > 0.3) legMode = 'air';
    }
    if (mode === 'fall') {
      pivot = 0.96; pitch = 1.14; armMode = 'spread'; legMode = 'fall';
      roll = Math.sin(time * 2.3 + ch.id) * 0.06; spPitch = -0.12; chPitch = -0.14; hdPitch = -0.55;
    } else if (mode === 'glide') {
      pitch = 0.2; armMode = 'glide'; legMode = 'glide'; roll = st.leanX * 2.5;
      spPitch = -0.08; hdPitch = 0.12 + ch.aimPitch * 0.3;
    } else if (dead) {
      const e = smoothstep(0, 0.55, ch.deadT), e2 = smoothstep(0.08, 0.6, ch.deadT), side = ch.id & 1 ? 1 : -1;
      pivot = 0.96; pitch = -1.46 * e; roll = side * 0.16 * e; py -= 0.8 * e2; armMode = 'limp'; legMode = 'limp';
      spPitch = -0.1 * e; chPitch = 0.1 * e; hdPitch = -0.28 * e; hdYaw = side * 0.5 * e; chRoll = side * 0.08 * e;
      scale = 1 - smoothstep(5.5, 7, ch.deadT);
    } else if (swim) {
      pivot = 0.96; pitch = 1.2; py += 0.3; armMode = 'swim'; legMode = 'swim';
      roll = Math.sin(time * 5 + ch.id) * 0.14 * (0.4 + 0.6 * run); hdPitch = -0.7; chPitch = -0.1;
    } else if (down) {
      // on their front, chest and head propped up a little, dragging themselves along on the forearms
      const e = smoothstep(0, 0.4, ch.downT), crawl = Math.min(1, amt * 4);
      pivot = 0.96; pitch = 1.5 * e; py -= 0.79 * e; armMode = 'crawl'; legMode = 'crawl';
      roll = Math.sin(ph) * 0.09 * crawl + (ch.id & 1 ? 0.05 : -0.05);
      spPitch = -0.08 * e; chPitch = (-0.15 - flinch * 0.08) * e; chYaw = Math.sin(ph) * 0.1 * crawl; hdPitch = -0.95 * e + breath * 0.02; hdYaw = Math.sin(time * 0.9 + ch.id) * 0.25;
    }
    const helping = !!ch.reviving && ground && !swim;      // kneeling over a team-mate, both hands on them
    if (helping) { spPitch += 0.3; chPitch += 0.22; hdPitch += 0.25; }
    if (ch.useT > 0 && ground) armMode = 'use';
    if (ch.throwT > 0.3 && ground) armMode = 'throw';
    if (helping) armMode = 'help';
    m4.compose(root, ch.x, py + pivot, ch.z, st.hipYaw + yawAdd, pitch, roll, scale, scale, scale);

    // ---- spine chain
    rotSet(rA, pelYaw, pelPitch, pelRoll);
    setBone(B.hips, rA, hipsX, hipsY, hipsZ);
    carry(v1, rA, B.hips, B.spine, hipsX, hipsY, hipsZ);
    rotMul(rB, rA, rotSet(rE, spYaw, spPitch, 0));
    setBone(B.spine, rB, v1[0], v1[1], v1[2]);
    carry(v2, rB, B.spine, B.chest, v1[0], v1[1], v1[2]);
    rotMul(rC, rB, rotSet(rE, chYaw, chPitch, chRoll));
    setBone(B.chest, rC, v2[0], v2[1], v2[2]);
    const cx = v2[0], cy = v2[1], cz = v2[2];
    carry(v1, rC, B.chest, B.neck, cx, cy, cz);
    rotMul(rD, rC, rotSet(rE, hdYaw * 0.4, hdPitch * 0.4, 0));
    setBone(B.neck, rD, v1[0], v1[1], v1[2]);
    carry(v2, rD, B.neck, B.head, v1[0], v1[1], v1[2]);
    rotMul(rB, rD, rotSet(rE, hdYaw * 0.6, hdPitch * 0.6, 0));
    setBone(B.head, rB, v2[0], v2[1], v2[2]);
    carry(sL, rC, B.chest, B.armL, cx, cy, cz); carry(sR, rC, B.chest, B.armR, cx, cy, cz);
    carry(hL, rA, B.hips, B.thighL, hipsX, hipsY, hipsZ); carry(hR, rA, B.hips, B.thighR, hipsX, hipsY, hipsZ);

    // ---- legs
    const md = ch.moveDir, mdx = Math.sin(md), mdz = Math.cos(md);
    if (legMode === 'walk') {
      // ground covered while a foot is planted = distance per stride cycle x the share of the cycle spent on the ground
      const cycle = TAU / Character.stepRate(amt * CFG.RUN_SPEED, ch.crouch, ch.sprinting);
      const stride = Math.min(1.3 - cr * 0.4, cycle * stanceF) * Math.min(1, amt * 3);      // (shrinks to nothing only while coming to a stop)
      const lift = (lerp(0.06, 0.19, run) + sp * 0.07) * (1 - cr * 0.3) * Math.min(1, amt * 2);
      const width = 0.095 + cr * 0.05, stag = (gunK * 0.09 + cr * 0.08) * (1 - Math.min(1, amt * 2));
      for (let s = 0; s < 2; s++) {
        const sd = s ? -1 : 1;
        let u = (ph / TAU + (s ? 0.5 : 0)) % 1; if (u < 0) u += 1;
        let fz, up = 0, fp;
        if (u < stanceF) { const q = u / stanceF; fz = stride * (0.42 - q); fp = lerp(-0.22, 0.4, q * q) * run; }
        else { const v = (u - stanceF) / (1 - stanceF), ev = v * v * (3 - 2 * v); fz = stride * (-0.58 + ev); up = lift * Math.sin(Math.PI * Math.pow(v, 0.75)); fp = lerp(0.75, -0.3, ev) * run + (1 - run) * 0.2 * Math.sin(Math.PI * v); }
        up += shuffle * 0.055 * Math.max(0, Math.sin(st.turnPh + (s ? Math.PI : 0)));
        const t = s ? fR : fL;
        t[0] = sd * width + mdx * fz; t[1] = 0.085 + up + Math.max(0, fp) * 0.05; t[2] = mdz * fz + (s ? -stag : stag);
        leg(s ? B.thighR : B.thighL, s ? B.shinR : B.shinL, s ? B.footR : B.footL, s ? hR : hL, t, s ? kR : kL, sd * 0.12 + mdx * 0.3, 0.1, 1, md * 0.25 + sd * 0.1, fp * Math.min(1, amt * 2));
      }
    } else {
      // poses without a walk cycle: targets for both ankles relative to the hips
      let lx = 0.1, ly = -0.845, lz = 0.02, rx = -0.1, ry = -0.845, rz = -0.02, lp = 0.1, rp = 0.1, kz = 1;
      if (legMode === 'air') { const up = clamp(ch.vy / 7, -1, 1); lx = 0.1; ly = -0.6 - up * 0.08; lz = 0.24; rx = -0.1; ry = -0.78; rz = -0.2 - up * 0.08; lp = 0.5; rp = 0.7; }
      else if (legMode === 'fall') { const f = Math.sin(time * 9 + ch.id) * 0.03; lx = 0.3; ly = -0.56 + f; lz = -0.5; rx = -0.3; ry = -0.56 - f; rz = -0.5; lp = 1.0; rp = 1.0; }
      else if (legMode === 'glide') { const sw = Math.sin(time * 2.1 + ch.id) * 0.07; lx = 0.1; ly = -0.8; lz = -0.2 + sw; rx = -0.1; ry = -0.74; rz = -0.34 - sw; lp = 0.7; rp = 0.8; }
      else if (legMode === 'swim') { const q = time * 6 + ch.id, kick = 0.16 * (0.5 + 0.5 * run); lx = 0.09; ly = -0.83; lz = Math.sin(q) * kick; rx = -0.09; ry = -0.83; rz = -Math.sin(q) * kick; lp = 1.1; rp = 1.1; }
      else if (legMode === 'limp') { lx = 0.16; ly = -0.8; lz = 0.2; rx = -0.13; ry = -0.83; rz = 0.06; lp = 0.6; rp = 0.4; }
      else if (legMode === 'crawl') {                // trailing behind, a knee drawn up in turn
        const c = Math.min(1, amt * 4), a = Math.max(0, Math.sin(ph)) * c, b = Math.max(0, -Math.sin(ph)) * c;
        lx = 0.13 + a * 0.14; ly = -0.82 + a * 0.24; lz = 0.05; rx = -0.13 - b * 0.14; ry = -0.82 + b * 0.24; rz = 0.05; lp = 1.15; rp = 1.15;
      }
      fL[0] = hipsX + lx; fL[1] = hipsY + ly; fL[2] = hipsZ + lz; fR[0] = hipsX + rx; fR[1] = hipsY + ry; fR[2] = hipsZ + rz;
      leg(B.thighL, B.shinL, B.footL, hL, fL, kL, 0.12, 0.1, kz, 0.1, lp);
      leg(B.thighR, B.shinR, B.footR, hR, fR, kR, -0.12, 0.1, kz, -0.1, rp);
    }

    // ---- arms
    let drawGunNow = false;
    if (armMode === 'gun') {
      const kick = ch.fireAnim > 0 ? ch.fireAnim / 0.12 : 0;
      const reload = ch.reloadT > 0 ? Math.sin((1 - ch.reloadT / Math.max(0.01, ch.reloadTotal)) * Math.PI) : 0;
      const relax = (1 - st.ready) * (1 - cr * 0.5);                                   // carried low when nothing is going on
      const lower = sp * 0.55 * Math.min(1, amt) + (ch.switchT > 0 ? ch.switchT * 2.2 : 0) + relax * 0.3;
      const bob = Math.sin(2 * ph) * 0.012 * Math.min(1, amt * 2) + breath * 0.004;
      m4.compose(aim, cx * 0.6, cy + 0.19 + bob, cz + 0.03, twist + st.aimOff * 0.75, -aimP * 0.92 + lower, 0, 1, 1, 1);
      m4.compose(tmpM, -0.135 + relax * 0.03, -0.035 - reload * 0.05 - relax * 0.05, 0.28 - kick * 0.05 - lower * 0.1, relax * 0.25, -kick * 0.07 - reload * 0.35, reload * 0.5, 1, 1, 1);
      m4.multiply(gun, aim, tmpM);
      m4.transformPoint(tR, gun, 0.004, -0.085, -0.03);                                // wrist behind the grip
      const fz = Models.FORE[w.type] || 0.18;
      if (reload > 0.05) m4.transformPoint(tL, gun, 0.03, -0.17 - reload * 0.08, 0.1);
      else m4.transformPoint(tL, gun, 0.012, -0.055, fz - 0.02);
      arm(B.armR, B.foreR, B.handR, sR, tR, eR, -0.55, -0.8, -0.25);
      arm(B.armL, B.foreL, B.handL, sL, tL, eL, 0.45, -0.85, -0.15);
      drawGunNow = true;
    } else if (armMode === 'fists') {
      const punch = ch.meleeAnim > 0 ? Math.sin((1 - ch.meleeAnim / 0.3) * Math.PI) : 0;
      if (ground && (ch.fireHold > 0 || punch > 0)) {
        tR[0] = -0.13; tR[1] = cy + 0.2 + punch * 0.05; tR[2] = 0.22 + punch * 0.4; tL[0] = 0.13; tL[1] = cy + 0.16; tL[2] = 0.24;
        arm(B.armR, B.foreR, B.handR, sR, tR, eR, -0.6, -0.6, -0.5); arm(B.armL, B.foreL, B.handL, sL, tL, eL, 0.6, -0.6, -0.5);
      } else {
        // relaxed swing against the legs; the elbows fold up as the pace picks up
        const sw = Math.cos(ph) * (0.42 * run + 0.22 * sp + 0.1) * Math.min(1, amt * 1.6) * (1 - air) + 0.06, bend = 0.34 + run * 0.85 + sp * 0.3 + air * 0.6 + cr * 0.4;
        for (let s = 0; s < 2; s++) {
          const sd = s ? -1 : 1, a = (s ? sw : -sw) + cr * 0.25, S = s ? sR : sL, E = s ? eR : eL, T = s ? tR : tL;
          const ux = sd * (0.13 + air * 0.35 + breath * 0.006), uy = -Math.cos(a), uz = Math.sin(a) - 0.06, ul = Math.hypot(ux, uy, uz);
          E[0] = S[0] + ux / ul * UPPER; E[1] = S[1] + uy / ul * UPPER; E[2] = S[2] + uz / ul * UPPER;
          const a2 = a + bend * (0.75 + 0.25 * Math.sin(ph + (s ? 0 : Math.PI)));
          const wx = -sd * 0.12 * run, wy = -Math.cos(a2), wz = Math.sin(a2), wl = Math.hypot(wx, wy, wz);
          T[0] = E[0] + wx / wl * FORE; T[1] = E[1] + wy / wl * FORE; T[2] = E[2] + wz / wl * FORE;
          arm(s ? B.armR : B.armL, s ? B.foreR : B.foreL, s ? B.handR : B.handL, S, T, E, sd * 0.3, -0.2, -1);
        }
      }
    } else if (armMode === 'use') {
      const bobv = Math.sin(time * 9) * 0.02;
      tR[0] = -0.06; tR[1] = cy + 0.06 + bobv; tR[2] = 0.25; tL[0] = 0.06; tL[1] = cy + 0.04 - bobv; tL[2] = 0.25;
      arm(B.armR, B.foreR, B.handR, sR, tR, eR, -0.6, -0.7, -0.2); arm(B.armL, B.foreL, B.handL, sL, tL, eL, 0.6, -0.7, -0.2);
    } else if (armMode === 'help') {
      const press = Math.sin(time * 7 + ch.id) * 0.03;
      tR[0] = -0.1; tR[1] = cy - 0.3 + press; tR[2] = 0.44; tL[0] = 0.1; tL[1] = cy - 0.32 + press; tL[2] = 0.44;
      arm(B.armR, B.foreR, B.handR, sR, tR, eR, -0.7, -0.2, -0.3); arm(B.armL, B.foreL, B.handL, sL, tL, eL, 0.7, -0.2, -0.3);
    } else if (armMode === 'crawl') {
      // elbows out on the ground, the forearms reaching forward in turn (the ground is `0.17` in front of the hips here)
      const c = Math.min(1, amt * 4), r = Math.sin(ph) * 0.13 * c;
      tR[0] = -0.24; tR[1] = cy + 0.26 - r; tR[2] = 0.2; tL[0] = 0.24; tL[1] = cy + 0.26 + r; tL[2] = 0.2;
      arm(B.armR, B.foreR, B.handR, sR, tR, eR, -1, -0.35, 0.5); arm(B.armL, B.foreL, B.handL, sL, tL, eL, 1, -0.35, 0.5);
    } else if (armMode === 'throw') {
      const q = clamp01((ch.throwT - 0.3) / 0.55);
      tR[0] = -0.28; tR[1] = cy + 0.2 + q * 0.4; tR[2] = 0.42 - q * 0.6; tL[0] = 0.18; tL[1] = cy + 0.1; tL[2] = 0.3;
      arm(B.armR, B.foreR, B.handR, sR, tR, eR, -0.7, -0.3, -0.5); arm(B.armL, B.foreL, B.handL, sL, tL, eL, 0.6, -0.6, -0.3);
    } else if (armMode === 'spread') {
      const f = Math.sin(time * 8 + ch.id) * 0.02;
      tR[0] = -0.5; tR[1] = cy + 0.18 + f; tR[2] = 0.3; tL[0] = 0.5; tL[1] = cy + 0.18 - f; tL[2] = 0.3;
      arm(B.armR, B.foreR, B.handR, sR, tR, eR, -0.4, 0, -1); arm(B.armL, B.foreL, B.handL, sL, tL, eL, 0.4, 0, -1);
    } else if (armMode === 'glide') {
      tR[0] = -0.36; tR[1] = hipsY + 0.92; tR[2] = 0.12; tL[0] = 0.36; tL[1] = hipsY + 0.92; tL[2] = 0.12;
      arm(B.armR, B.foreR, B.handR, sR, tR, eR, -1, 0, -0.3); arm(B.armL, B.foreL, B.handL, sL, tL, eL, 1, 0, -0.3);
    } else if (armMode === 'swim') {
      const q = time * 5 + ch.id, reach = 0.5 + 0.5 * run;
      tR[0] = -0.24; tR[1] = cy + 0.34 + Math.sin(q) * 0.2 * reach; tR[2] = 0.22 + Math.cos(q) * 0.22 * reach;
      tL[0] = 0.24; tL[1] = cy + 0.34 - Math.sin(q) * 0.2 * reach; tL[2] = 0.22 - Math.cos(q) * 0.22 * reach;
      arm(B.armR, B.foreR, B.handR, sR, tR, eR, -1, 0, -0.2); arm(B.armL, B.foreL, B.handL, sL, tL, eL, 1, 0, -0.2);
    } else {                                                                             // limp
      tR[0] = -0.46; tR[1] = cy - 0.02; tR[2] = 0.16; tL[0] = 0.5; tL[1] = cy + 0.1; tL[2] = 0.1;
      arm(B.armR, B.foreR, B.handR, sR, tR, eR, -0.5, -0.5, -0.5); arm(B.armL, B.foreL, B.handL, sL, tL, eL, 0.5, -0.5, -0.5);
    }

    // ---- hand the pose to the renderer
    const io = indoor(ch.x, ch.y + 1, ch.z);
    submit(ch, far, pivot, io, ch.hitT > 0 ? ch.hitT * 0.9 : 0);
    if (drawGunNow) {
      m4.compose(tmpM, 0, -pivot, 0, 0, 0, 0, 1, 1, 1);
      m4.multiply(M, root, tmpM); m4.multiply(W, M, gun);
      const c = RAR[w.rarity];
      Batches[w.type].add(W, c[0], c[1], c[2], 0.55, io[0], io[1], 0);
    }
    if (armMode === 'glide') {
      m4.compose(tmpM, 0, hipsY - pivot, 0, 0, 0, 0, 1, 1, 1);
      m4.multiply(W, root, tmpM);
      const c = SUITS[ch.color % SUITS.length];
      Batches.glider.add(W, c[0], c[1], c[2], 0, 1, 0, 0);
    } else if (armMode === 'use') {
      const name = ch.useType === 'medkit' ? 'medkit' : ch.useType === 'cell' ? 'cell' : 'bandage';
      m4.compose(tmpM, 0, cy + 0.04 - pivot, 0.3, 0.4, 0.3, 0, 0.5, 0.5, 0.5);
      m4.multiply(W, root, tmpM);
      Batches[name].add(W, 1, 1, 1, 1, io[0], io[1], 0);
    }
  }

  // ------------------------------------------------------------------ items / chests / props
  function drawItem(it, time) {
    const bob = Math.sin(time * 2.2 + it.phase) * 0.06;
    const y = it.y + (it.rest ? 0.42 + bob : 0.25);
    const yaw = time * 1.1 + it.phase;
    const io = indoor(it.x, it.y + 0.5, it.z);
    if (it.kind === 'weapon') {
      m4.compose(root, it.x, y, it.z, yaw, -0.25, 0, 1.5, 1.5, 1.5);
      m4.compose(tmpM, 0, 0, -0.14, 0, 0, 0, 1, 1, 1);           // centre the model roughly around its middle
      m4.multiply(W, root, tmpM);
      const c = RAR[it.rarity];
      Batches[it.type].add(W, c[0], c[1], c[2], 0.9, io[0], io[1], 0);
      return c;
    }
    m4.compose(W, it.x, y - 0.12, it.z, yaw, 0, 0, 1, 1, 1);
    if (it.kind === 'ammo') { const c = AMMO_COL[it.type]; Batches.ammo.add(W, c[0], c[1], c[2], 0.55, io[0], io[1], 0); return c; }
    if (it.kind === 'heal') {
      if (it.type === 'bandage') { Batches.bandage.add(W, 1, 1, 1, 1, io[0], io[1], 0); return COL.white; }
      if (it.type === 'medkit') { Batches.medkit.add(W, 1, 1, 1, 1, io[0], io[1], 0); return COL.red; }
      Batches.cell.add(W, 1, 1, 1, 0.9, io[0], io[1], 0);
      return COL.cyan;
    }
    Batches.grenade.add(W, 1, 1, 1, 1, io[0], io[1], 0);
    return COL.orange;
  }
  function drawNade(n) {
    m4.compose(W, n.x, n.y, n.z, n.spin, n.spin * 0.7, 0, 1, 1, 1);
    Batches.grenade.add(W, 1, 1, 1, 1, 1, 0, 0);
  }
  function drawChest(c, time) {
    const air = c.airdrop, s = air ? 1.35 : 1;
    const glow = c.opened ? 0 : (0.7 + 0.4 * Math.sin(time * 3 + c.x));
    const accent = air ? COL.teal : COL.gold, io = indoor(c.x, c.y + 0.5, c.z);
    m4.compose(root, c.x, c.y, c.z, c.yaw, 0, 0, s, s, s);
    Batches.chest.add(root, accent[0], accent[1], accent[2], glow, io[0], io[1], 0);
    m4.compose(tmpM, 0, 0.52, -0.31, 0, -c.openT * 1.75, 0, 1, 1, 1);      // lid hinged at the back
    m4.multiply(W, root, tmpM);
    Batches.chestLid.add(W, 1, 1, 1, 1, io[0], io[1], 0);
    return accent;
  }
  function drawAirdropFalling(d, time) {
    const sway = Math.sin(time * 1.3) * 0.12;
    m4.compose(W, d.x, d.y, d.z, time * 0.3, sway * 0.4, sway, 1, 1, 1);
    Batches.crate.add(W, 1, 1, 1, 0.6, 1, 0, 0);
    Batches.chute.add(W, 1, 1, 1, 1, 1, 0, 0);
  }
  function drawPlane(p, time) {
    m4.compose(root, p.x, p.y, p.z, p.yaw, 0, Math.sin(time * 0.7) * 0.03, 1, 1, 1);
    Batches.plane.add(root, 1, 1, 1, 0.5, 1, 0, 0);
    for (const sx of [-1, 1]) for (const ex of [5.6, 10.4]) {
      m4.compose(tmpM, sx * ex, 0.5, 3.5, 0, 0, time * 26 + ex, 1, 1, 1);
      m4.multiply(W, root, tmpM);
      Batches.prop.add(W, 1, 1, 1, 1, 1, 0, 0);
    }
  }
  function drawWindmill(w, time) {
    m4.compose(W, w.x, w.y, w.z, w.yaw, 0, time * 0.55, 1, 1, 1);
    Batches.windmill.add(W, 1, 1, 1, 1, 1, 0, 0);
  }
  return { drawCharacter, drawItem, drawNade, drawChest, drawAirdropFalling, drawPlane, drawWindmill, RAR, COL, indoor };
})();
