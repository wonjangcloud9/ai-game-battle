// AURORA FALL — procedural models: characters (with animation), weapons, items, chests, plane, props.
// Everything is emitted as instanced primitives into the Prims batches.
'use strict';

const CharModel = (function () {
  const root = m4.create(), L = m4.create(), W = m4.create(), P = m4.create();
  const chest = m4.create(), head = m4.create(), aim = m4.create(), gun = m4.create(), tmpM = m4.create(), RP = m4.create();
  let parent = root, oy = 0, flash = 0;
  const v1 = [0, 0, 0], v2 = [0, 0, 0], v3 = [0, 0, 0], v4 = [0, 0, 0], e1 = [0, 0, 0], e2 = [0, 0, 0], t1 = [0, 0, 0], t2 = [0, 0, 0];

  const lin = hex => hexLin(hex);
  const SUITS = SUIT_COLORS.map(h => { const c = lin(h); return { main: c, dark: scaleCol(c, 0.6), light: mixCol(c, [1, 1, 1], 0.25) }; });
  const PANTS = [lin(0x2e3440), lin(0x4a4338), lin(0x38414a), lin(0x3a3a34)];
  const COL = {
    boot: lin(0x1f1d1c), glove: lin(0x17181a), face: lin(0x22252a), pack: lin(0x4a4d3c), strap: lin(0x2b2d26), visor: [0.25, 1.0, 0.82],
    gunDark: lin(0x25282d), gunMid: lin(0x3b4048), gunLight: lin(0x6c737d), wood: lin(0x6e4a2f), white: lin(0xf0ede6), red: lin(0xd8362c), cyan: lin(0x49d6ff),
    chestWood: lin(0x7a5a3a), chestTrim: lin(0x2f3238), gold: lin(0xffc247), orange: lin(0xe8782a), teal: lin(0x35d9bb), green: lin(0x5d6b3c),
    planeBody: lin(0xe9e6df), planeDark: lin(0x39414d), canvas: lin(0xd8cfb4),
  };
  const RAR = RARITY.map(r => lin(r.color));
  const AMMO_COL = {}; for (const k in AMMO) AMMO_COL[k] = lin(AMMO[k].color);

  function col(c) { return flash > 0 ? [c[0] + flash, c[1] + flash, c[2] + flash] : c; }
  // box / rounded box part: centre, size, rotation (rx = pitch, ry = yaw, rz = roll) in the current parent frame
  function part(batch, cx, cy, cz, sx, sy, sz, c, e, rx, ry, rz) {
    m4.compose(L, cx, cy + oy, cz, ry || 0, rx || 0, rz || 0, sx, sy, sz);
    m4.multiply(W, parent, L);
    const k = col(c);
    batch.add(W, k[0], k[1], k[2], (e || 0) + flash * 0.4);
  }
  // limb segment from a to b with cross-section w x d
  function bone(batch, a, b, w, d, c, hx, hy, hz) {
    let yx = b[0] - a[0], yy = b[1] - a[1], yz = b[2] - a[2];
    const len = Math.hypot(yx, yy, yz) || 1e-4;
    yx /= len; yy /= len; yz /= len;
    if (hx === undefined) { hx = 1; hy = 0; hz = 0; }
    let dot = hx * yx + hy * yy + hz * yz;
    let xx = hx - yx * dot, xy = hy - yy * dot, xz = hz - yz * dot, xl = Math.hypot(xx, xy, xz);
    if (xl < 1e-3) { dot = yz; xx = -yx * dot; xy = -yy * dot; xz = 1 - yz * dot; xl = Math.hypot(xx, xy, xz) || 1; }
    xx /= xl; xy /= xl; xz /= xl;
    const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
    L[0] = xx * w; L[1] = xy * w; L[2] = xz * w; L[3] = 0;
    L[4] = yx * len; L[5] = yy * len; L[6] = yz * len; L[7] = 0;
    L[8] = zx * d; L[9] = zy * d; L[10] = zz * d; L[11] = 0;
    L[12] = (a[0] + b[0]) / 2; L[13] = (a[1] + b[1]) / 2 + oy; L[14] = (a[2] + b[2]) / 2; L[15] = 1;
    m4.multiply(W, parent, L);
    const k = col(c);
    batch.add(W, k[0], k[1], k[2], flash * 0.4);
  }
  // two-bone IK: shoulder s, target t, lengths l1/l2, bend hint -> elbow e (t may be pulled in if out of reach)
  function ik(s, t, l1, l2, hx, hy, hz, e) {
    let dx = t[0] - s[0], dy = t[1] - s[1], dz = t[2] - s[2];
    let d = Math.hypot(dx, dy, dz) || 1e-4;
    dx /= d; dy /= d; dz /= d;
    const maxD = l1 + l2 - 0.002;
    if (d > maxD) { d = maxD; t[0] = s[0] + dx * d; t[1] = s[1] + dy * d; t[2] = s[2] + dz * d; }
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const dot = hx * dx + hy * dy + hz * dz;
    let px = hx - dx * dot, py = hy - dy * dot, pz = hz - dz * dot;
    const pl = Math.hypot(px, py, pz) || 1;
    e[0] = s[0] + dx * a + px / pl * h; e[1] = s[1] + dy * a + py / pl * h; e[2] = s[2] + dz * a + pz / pl * h;
  }
  // leg from hip joint with swing angle a (forward +), knee bend k, swing-plane yaw th
  function leg(hx, hy, a, k, th, pants, side) {
    const st = Math.sin(th), ct = Math.cos(th);
    v1[0] = hx; v1[1] = hy; v1[2] = 0;
    const sa = Math.sin(a), ca = Math.cos(a);
    v2[0] = hx + sa * st * 0.45; v2[1] = hy - ca * 0.45; v2[2] = sa * ct * 0.45;
    const a2 = a - k, s2 = Math.sin(a2), c2 = Math.cos(a2);
    v3[0] = v2[0] + s2 * st * 0.42; v3[1] = v2[1] - c2 * 0.42; v3[2] = v2[2] + s2 * ct * 0.42;
    bone(Prims.rbox, v1, v2, 0.17, 0.19, pants);
    bone(Prims.rbox, v2, v3, 0.14, 0.16, pants);
    // boot: forward-pointing box at the ankle
    v4[0] = v3[0] + st * 0.07 * Math.cos(a2); v4[1] = v3[1] - 0.045; v4[2] = v3[2] + ct * 0.07 * Math.cos(a2);
    part(Prims.rbox, v4[0], v4[1], v4[2], 0.16, 0.13, 0.29, COL.boot, 0, Math.max(-0.5, Math.min(0.9, -a2 * 0.6)), th, 0);
  }

  // ------------------------------------------------------------------ weapons (gun space: +z barrel, origin at the grip)
  function gpart(batch, cx, cy, cz, sx, sy, sz, c, e, rx) {
    m4.compose(L, cx, cy, cz, 0, rx || 0, 0, sx, sy, sz);
    m4.multiply(W, parent, L);
    batch.add(W, c[0], c[1], c[2], e || 0);
  }
  function barrel(cz, len, r, c) { // cylinder along +z
    m4.compose(L, 0, 0.028, cz, 0, Math.PI / 2, 0, r * 2, len, r * 2);
    m4.multiply(W, parent, L);
    Prims.cyl.add(W, c[0], c[1], c[2], 0);
  }
  const FORE = { pistol: 0.02, smg: 0.16, ar: 0.27, shotgun: 0.33, sniper: 0.33, aurora: 0.26 };
  function drawGun(type, rarity) {
    const B = Prims.box, d = COL.gunDark, m = COL.gunMid, l = COL.gunLight, r = RAR[rarity];
    switch (type) {
      case 'pistol':
        gpart(B, 0, 0.035, 0.07, 0.05, 0.065, 0.21, m); gpart(B, 0, -0.045, -0.01, 0.046, 0.12, 0.06, d, 0, 0.2);
        gpart(B, 0, 0.072, 0.02, 0.052, 0.012, 0.08, r, 0.5); break;
      case 'smg':
        gpart(B, 0, 0.03, 0.1, 0.06, 0.09, 0.34, m); gpart(B, 0, -0.1, 0.1, 0.04, 0.17, 0.05, d); gpart(B, 0, -0.045, -0.02, 0.045, 0.1, 0.055, d, 0, 0.2);
        gpart(B, 0, 0.03, -0.15, 0.035, 0.05, 0.18, d); barrel(0.33, 0.14, 0.018, d); gpart(B, 0, 0.082, 0.08, 0.062, 0.012, 0.12, r, 0.5); break;
      case 'ar':
        gpart(B, 0, 0.03, 0.1, 0.06, 0.1, 0.46, m); gpart(B, 0, -0.11, 0.13, 0.045, 0.19, 0.075, d, 0, -0.18); gpart(B, 0, -0.045, -0.03, 0.045, 0.1, 0.055, d, 0, 0.2);
        gpart(B, 0, 0.02, -0.24, 0.05, 0.1, 0.22, d); gpart(B, 0, 0.03, 0.39, 0.068, 0.075, 0.2, l); barrel(0.6, 0.24, 0.016, d);
        gpart(B, 0, 0.1, 0.08, 0.03, 0.04, 0.12, d); gpart(B, 0, 0.086, 0.26, 0.064, 0.012, 0.14, r, 0.5); break;
      case 'shotgun':
        gpart(B, 0, 0.03, 0.06, 0.06, 0.085, 0.36, m); gpart(B, 0, 0.0, -0.24, 0.05, 0.1, 0.26, COL.wood, 0, -0.08); gpart(B, 0, -0.04, -0.04, 0.045, 0.09, 0.055, COL.wood, 0, 0.2);
        barrel(0.5, 0.5, 0.026, d); gpart(B, 0, -0.02, 0.36, 0.07, 0.06, 0.17, COL.wood); gpart(B, 0, 0.08, 0.1, 0.062, 0.012, 0.12, r, 0.5); break;
      case 'sniper':
        gpart(B, 0, 0.03, 0.1, 0.055, 0.085, 0.58, m); gpart(B, 0, 0.0, -0.3, 0.05, 0.12, 0.28, COL.wood, 0, -0.06); gpart(B, 0, -0.045, -0.04, 0.045, 0.1, 0.055, d, 0, 0.2);
        barrel(0.78, 0.56, 0.015, d); gpart(B, 0, -0.07, 0.12, 0.04, 0.09, 0.06, d);
        m4.compose(L, 0, 0.11, 0.1, 0, Math.PI / 2, 0, 0.06, 0.3, 0.06); m4.multiply(W, parent, L); Prims.cyl.add(W, d[0], d[1], d[2], 0);
        gpart(B, 0, 0.078, 0.3, 0.058, 0.012, 0.14, r, 0.5); break;
      default: // aurora cannon
        gpart(B, 0, 0.035, 0.1, 0.09, 0.12, 0.46, m); gpart(B, 0, -0.05, -0.03, 0.05, 0.11, 0.06, d, 0, 0.2); gpart(B, 0, 0.02, -0.24, 0.06, 0.1, 0.2, d);
        gpart(B, 0.035, 0.035, 0.46, 0.022, 0.05, 0.3, l); gpart(B, -0.035, 0.035, 0.46, 0.022, 0.05, 0.3, l);
        gpart(B, 0, 0.035, 0.44, 0.03, 0.03, 0.26, COL.teal, 2.2); gpart(B, 0, 0.1, 0.06, 0.095, 0.016, 0.26, COL.teal, 1.4);
        gpart(B, 0, -0.035, 0.16, 0.07, 0.03, 0.14, r, 0.6);
    }
  }

  // ------------------------------------------------------------------ characters
  function drawCharacter(ch, time, simple) {
    if (ch.mode === 'plane') return;
    if (ch.mode === 'dead' && ch.deadT > 7) return;
    const suit = SUITS[ch.color % SUITS.length], pants = PANTS[ch.id % PANTS.length];
    const R = Prims.rbox;
    flash = ch.hitT > 0 ? ch.hitT * 1.3 : 0;
    const mode = ch.mode;
    const ph = ch.animPhase, amt = Math.min(1.15, ch.moveAmt);
    const crouch = ch.crouch ? 1 : 0;
    let pitch = 0, roll = 0, py = ch.y, pivot = 0, scale = 1;
    let hipY = 0.93 - crouch * 0.3 + Math.abs(Math.sin(ph)) * 0.045 * amt;
    let aL, aR, kL, kR, th = ch.moveDir;
    const sp = ch.sprinting ? 1 : 0;
    const A = (sp ? 0.86 : 0.62) * Math.min(1, amt) * (crouch ? 0.6 : 1);
    aL = A * Math.sin(ph) + crouch * 0.95; aR = -A * Math.sin(ph) + crouch * 0.95;
    kL = 0.14 + A * 1.05 * Math.max(0, Math.cos(ph)) + crouch * 1.75; kR = 0.14 + A * 1.05 * Math.max(0, -Math.cos(ph)) + crouch * 1.75;
    let aimP = ch.aimPitch;
    let armMode = ch.curWeapon() ? 'gun' : 'fists';
    if (mode === 'ground' && !ch.grounded && !ch.swimming) { aL = 0.55; aR = -0.1; kL = 0.95; kR = 0.45; th = 0; }
    if (mode === 'fall') { pivot = 0.95; pitch = 1.12; aL = -0.35; aR = -0.3; kL = 0.55; kR = 0.7; th = 0; armMode = 'spread'; aimP = 0; hipY = 0.93; }
    else if (mode === 'glide') { pitch = 0.14; aL = -0.12 + Math.sin(time * 2.1) * 0.06; aR = -0.2 - Math.sin(time * 2.1) * 0.06; kL = 0.4; kR = 0.5; th = 0; armMode = 'glide'; aimP = 0; hipY = 0.93; }
    else if (mode === 'dead') {
      const e = smoothstep(0, 0.5, ch.deadT);
      pitch = -1.5 * e; py += 0.16 * e; aL = 0.12; aR = -0.08; kL = 0.2; kR = 0.1; th = 0; armMode = 'limp'; aimP = 0; hipY = 0.93;
      scale = 1 - smoothstep(5.5, 7, ch.deadT);
    } else if (ch.swimming) {
      pivot = 0.95; pitch = 1.15; py += 0.32; const sw = time * 5 + ch.id;
      aL = 0.25 * Math.sin(sw); aR = -0.25 * Math.sin(sw); kL = 0.3; kR = 0.3; th = 0; armMode = 'swim'; aimP = 0; hipY = 0.93;
    }
    if (ch.useT > 0 && armMode === 'gun') armMode = 'use';
    else if (ch.useT > 0) armMode = 'use';
    if (ch.throwT > 0.3) armMode = 'throw';
    m4.compose(root, ch.x, py + pivot, ch.z, ch.yaw, pitch, roll, scale, scale, scale);
    oy = -pivot; parent = root;

    // ---- legs + hips
    leg(0.11, hipY, aL, kL, th, pants, 1);
    leg(-0.11, hipY, aR, kR, th, pants, -1);
    part(R, 0, hipY + 0.02, 0, 0.37, 0.2, 0.23, pants);

    // ---- chest frame
    const lean = (mode === 'ground' ? -aimP * 0.3 + sp * 0.2 * Math.min(1, amt) + crouch * 0.22 : 0);
    m4.compose(chest, 0, hipY + 0.08, 0, 0, lean, 0, 1, 1, 1);
    m4.compose(tmpM, 0, hipY + 0.08 + oy, 0, 0, lean, 0, 1, 1, 1);
    m4.multiply(RP, root, tmpM);
    const saveOy = oy;
    parent = RP; oy = 0;
    part(R, 0, 0.27, 0, 0.43, 0.52, 0.26, suit.main);
    part(R, 0, 0.06, 0.005, 0.4, 0.1, 0.25, COL.strap);
    part(R, 0, 0.29, -0.19, 0.3, 0.38, 0.15, COL.pack);
    part(R, 0, 0.47, -0.19, 0.26, 0.08, 0.13, suit.dark);
    // head
    const hp = mode === 'ground' ? -aimP * 0.45 : (mode === 'fall' || ch.swimming ? -0.7 : 0);
    m4.compose(tmpM, 0, 0.69, 0.015, 0, hp, 0, 1, 1, 1);
    m4.multiply(head, RP, tmpM);
    parent = head;
    part(R, 0, 0, 0, 0.26, 0.27, 0.27, suit.dark);
    part(R, 0, -0.03, 0.09, 0.2, 0.17, 0.12, COL.face);
    part(Prims.box, 0, 0.015, 0.153, 0.19, 0.06, 0.02, COL.visor, 0.9);
    if (!simple) part(R, 0, -0.14, -0.02, 0.3, 0.09, 0.28, suit.main);
    parent = root; oy = saveOy;

    // ---- arms
    const sLx = 0.27, sRx = -0.27;
    m4.transformPoint(v1, chest, sLx, 0.46, 0); m4.transformPoint(v2, chest, sRx, 0.46, 0);
    const SL = [v1[0], v1[1], v1[2]], SR = [v2[0], v2[1], v2[2]];
    const sleeve = suit.main, hand = COL.glove;
    const arm = (S, T, hx, hy, hz) => {
      ik(S, T, 0.3, 0.3, hx, hy, hz, e1);
      bone(R, S, e1, 0.13, 0.14, sleeve);
      bone(R, e1, T, 0.11, 0.12, sleeve);
      part(R, T[0], T[1], T[2], 0.1, 0.1, 0.11, hand);
    };
    if (armMode === 'gun') {
      const w = ch.curWeapon();
      const kick = ch.fireAnim > 0 ? ch.fireAnim / 0.12 : 0;
      const reload = ch.reloadT > 0 ? Math.sin((1 - ch.reloadT / Math.max(0.01, ch.reloadTotal)) * Math.PI) : 0;
      const lower = sp * 0.55 * Math.min(1, amt) + (ch.switchT > 0 ? ch.switchT * 2.2 : 0);
      m4.compose(aim, 0, hipY + 0.5, 0.04, 0, -aimP * 0.92 + lower, 0, 1, 1, 1);
      m4.compose(tmpM, -0.13, -0.02 - reload * 0.05, 0.34 - kick * 0.05 - lower * 0.12, 0, -kick * 0.07 - reload * 0.35, reload * 0.5, 1, 1, 1);
      m4.multiply(gun, aim, tmpM);
      m4.transformPoint(t1, gun, 0, -0.06, -0.02);                         // right hand on the grip
      const fz = FORE[w.type] || 0.2;
      if (reload > 0.05) m4.transformPoint(t2, gun, 0.02, -0.16 - reload * 0.08, 0.12);
      else m4.transformPoint(t2, gun, 0.0, -0.035, fz);
      arm(SR, t1, -0.5, -0.8, -0.3);
      arm(SL, t2, 0.6, -0.75, -0.2);
      // weapon parts
      m4.compose(tmpM, 0, oy, 0, 0, 0, 0, 1, 1, 1);
      m4.multiply(P, root, tmpM); m4.multiply(RP, P, gun);
      parent = RP;
      const f = flash; flash = 0;
      drawGun(w.type, w.rarity);
      flash = f;
      parent = root;
    } else if (armMode === 'fists') {
      const punch = ch.meleeAnim > 0 ? Math.sin((1 - ch.meleeAnim / 0.3) * Math.PI) : 0;
      const sw = A * 0.7 * Math.sin(ph);
      if (mode === 'ground' && (ch.fireHold > 0 || punch > 0)) {
        t1[0] = -0.16; t1[1] = hipY + 0.5 + punch * 0.06; t1[2] = 0.24 + punch * 0.42;
        t2[0] = 0.16; t2[1] = hipY + 0.46; t2[2] = 0.26;
      } else {
        t1[0] = -0.3; t1[1] = hipY + 0.08 + Math.abs(sw) * 0.12; t1[2] = 0.06 + sw * 0.42;
        t2[0] = 0.3; t2[1] = hipY + 0.08 + Math.abs(sw) * 0.12; t2[2] = 0.06 - sw * 0.42;
      }
      arm(SR, t1, -0.6, -0.4, -0.7); arm(SL, t2, 0.6, -0.4, -0.7);
    } else if (armMode === 'use') {
      const bobv = Math.sin(time * 9) * 0.02;
      t1[0] = -0.07; t1[1] = hipY + 0.36 + bobv; t1[2] = 0.27; t2[0] = 0.07; t2[1] = hipY + 0.34 - bobv; t2[2] = 0.27;
      arm(SR, t1, -0.6, -0.7, -0.2); arm(SL, t2, 0.6, -0.7, -0.2);
      const ic = ch.useType === 'medkit' ? COL.red : ch.useType === 'cell' ? COL.cyan : COL.white;
      part(Prims.box, 0, hipY + 0.37, 0.3, 0.14, 0.1, 0.1, ic, ch.useType === 'cell' ? 1.5 : 0);
    } else if (armMode === 'throw') {
      const k = clamp01((ch.throwT - 0.3) / 0.55);
      t1[0] = -0.3; t1[1] = hipY + 0.5 + k * 0.42; t1[2] = 0.45 - k * 0.6; t2[0] = 0.2; t2[1] = hipY + 0.4; t2[2] = 0.3;
      arm(SR, t1, -0.7, -0.3, -0.5); arm(SL, t2, 0.6, -0.6, -0.3);
    } else if (armMode === 'spread') {
      t1[0] = -0.72; t1[1] = hipY + 0.62; t1[2] = 0.3; t2[0] = 0.72; t2[1] = hipY + 0.62; t2[2] = 0.3;
      arm(SR, t1, 0, 0, -1); arm(SL, t2, 0, 0, -1);
    } else if (armMode === 'glide') {
      t1[0] = -0.42; t1[1] = hipY + 1.08; t1[2] = 0.1; t2[0] = 0.42; t2[1] = hipY + 1.08; t2[2] = 0.1;
      arm(SR, t1, -1, 0, -0.3); arm(SL, t2, 1, 0, -0.3);
      // glider wing
      const c2 = suit.main, c3 = COL.canvas;
      part(Prims.box, 0.95, hipY + 1.52, -0.1, 1.9, 0.07, 1.5, c2, 0, 0.1, 0, 0.16);
      part(Prims.box, -0.95, hipY + 1.52, -0.1, 1.9, 0.07, 1.5, c2, 0, 0.1, 0, -0.16);
      part(Prims.box, 0, hipY + 1.38, -0.1, 0.5, 0.08, 1.6, c3, 0, 0.1, 0, 0);
      part(Prims.box, 2.05, hipY + 1.72, -0.1, 0.4, 0.07, 1.3, c3, 0, 0.1, 0, 0.3);
      part(Prims.box, -2.05, hipY + 1.72, -0.1, 0.4, 0.07, 1.3, c3, 0, 0.1, 0, -0.3);
      part(Prims.box, 0.42, hipY + 1.24, 0.1, 0.03, 0.3, 0.03, COL.gunDark); part(Prims.box, -0.42, hipY + 1.24, 0.1, 0.03, 0.3, 0.03, COL.gunDark);
    } else if (armMode === 'swim') {
      const sw = time * 5 + ch.id;
      t1[0] = -0.3; t1[1] = hipY + 0.9 + Math.sin(sw) * 0.25; t1[2] = 0.2 + Math.cos(sw) * 0.2; t2[0] = 0.3; t2[1] = hipY + 0.9 - Math.sin(sw) * 0.25; t2[2] = 0.2 - Math.cos(sw) * 0.2;
      arm(SR, t1, -1, 0, -0.2); arm(SL, t2, 1, 0, -0.2);
    } else { // limp
      t1[0] = -0.5; t1[1] = hipY + 0.2; t1[2] = 0.1; t2[0] = 0.52; t2[1] = hipY + 0.3; t2[2] = 0.12;
      arm(SR, t1, -0.5, -0.5, -0.5); arm(SL, t2, 0.5, -0.5, -0.5);
    }
    flash = 0; oy = 0; parent = root;
  }

  // ------------------------------------------------------------------ items / chests / props
  function drawItem(it, time) {
    const bob = Math.sin(time * 2.2 + it.phase) * 0.06;
    const y = it.y + (it.rest ? 0.42 + bob : 0.25);
    const yaw = time * 1.1 + it.phase;
    flash = 0; oy = 0;
    if (it.kind === 'weapon') {
      m4.compose(root, it.x, y, it.z, yaw, -0.25, 0, 1.55, 1.55, 1.55);
      // centre the model roughly around its middle
      m4.compose(tmpM, 0, 0, -0.12, 0, 0, 0, 1, 1, 1);
      m4.multiply(RP, root, tmpM);
      parent = RP;
      drawGun(it.type, it.rarity);
      parent = root;
      return RAR[it.rarity];
    }
    m4.compose(root, it.x, y - 0.12, it.z, yaw, 0, 0, 1, 1, 1);
    parent = root;
    if (it.kind === 'ammo') {
      const c = AMMO_COL[it.type];
      part(Prims.rbox, 0, 0, 0, 0.34, 0.22, 0.24, COL.gunMid);
      part(Prims.box, 0, 0.12, 0, 0.3, 0.035, 0.2, c, 0.5);
      part(Prims.box, 0, 0, 0.123, 0.14, 0.1, 0.01, c, 0.5);
      return c;
    }
    if (it.kind === 'heal') {
      if (it.type === 'bandage') {
        m4.compose(L, 0, 0, 0, 0, Math.PI / 2, 0, 0.24, 0.2, 0.24); m4.multiply(W, root, L); Prims.cyl.add(W, COL.white[0], COL.white[1], COL.white[2], 0.1);
        part(Prims.box, 0, 0, 0.105, 0.03, 0.12, 0.012, COL.red, 0.3); part(Prims.box, 0, 0, 0.105, 0.12, 0.03, 0.012, COL.red, 0.3);
        return COL.white;
      }
      if (it.type === 'medkit') {
        part(Prims.rbox, 0, 0, 0, 0.38, 0.26, 0.26, COL.red, 0.1);
        part(Prims.box, 0, 0, 0.133, 0.06, 0.17, 0.012, COL.white, 0.4); part(Prims.box, 0, 0, 0.133, 0.17, 0.06, 0.012, COL.white, 0.4);
        part(Prims.box, 0, 0.14, 0, 0.14, 0.03, 0.05, COL.white);
        return COL.red;
      }
      m4.compose(L, 0, 0.02, 0, 0, 0, 0, 0.19, 0.3, 0.19); m4.multiply(W, root, L); Prims.cyl.add(W, COL.cyan[0], COL.cyan[1], COL.cyan[2], 1.6);
      part(Prims.rbox, 0, 0.19, 0, 0.21, 0.06, 0.21, COL.gunDark); part(Prims.rbox, 0, -0.15, 0, 0.21, 0.06, 0.21, COL.gunDark);
      return COL.cyan;
    }
    m4.compose(L, 0, 0, 0, 0, 0, 0, 0.24, 0.27, 0.24); m4.multiply(W, root, L); Prims.sphere.add(W, COL.green[0], COL.green[1], COL.green[2], 0);
    part(Prims.box, 0, 0.16, 0, 0.08, 0.08, 0.08, COL.gunLight); part(Prims.box, 0.05, 0.18, 0, 0.1, 0.02, 0.03, COL.gunDark);
    return COL.orange;
  }
  function drawNade(n) {
    flash = 0; oy = 0; parent = root;
    m4.compose(root, n.x, n.y, n.z, n.spin, n.spin * 0.7, 0, 1, 1, 1);
    m4.compose(L, 0, 0, 0, 0, 0, 0, 0.2, 0.23, 0.2); m4.multiply(W, root, L); Prims.sphere.add(W, COL.green[0], COL.green[1], COL.green[2], 0);
    part(Prims.box, 0, 0.13, 0, 0.07, 0.07, 0.07, COL.gunLight);
  }
  function drawChest(c, time) {
    flash = 0; oy = 0; parent = root;
    const air = c.airdrop, s = air ? 1.35 : 1;
    m4.compose(root, c.x, c.y, c.z, c.yaw, 0, 0, s, s, s);
    const body = air ? COL.orange : COL.chestWood, glow = c.opened ? 0 : (0.9 + 0.5 * Math.sin(time * 3 + c.x));
    const accent = air ? COL.teal : COL.gold;
    part(Prims.rbox, 0, 0.26, 0, 0.96, 0.52, 0.62, body);
    part(Prims.box, -0.36, 0.26, 0, 0.07, 0.54, 0.64, COL.chestTrim); part(Prims.box, 0.36, 0.26, 0, 0.07, 0.54, 0.64, COL.chestTrim);
    part(Prims.box, 0, 0.3, 0.315, 0.16, 0.16, 0.03, accent, glow * 1.4);
    // lid hinged at the back
    const ang = c.openT * 1.75;
    m4.compose(tmpM, 0, 0.52, -0.31, 0, -ang, 0, 1, 1, 1);
    m4.multiply(RP, root, tmpM);
    parent = RP;
    part(Prims.rbox, 0, 0.08, 0.31, 0.98, 0.17, 0.64, air ? COL.teal : scaleCol(COL.chestWood, 0.85), air && !c.opened ? 0.25 : 0);
    part(Prims.box, 0, 0.08, 0.31, 0.1, 0.19, 0.66, COL.chestTrim);
    parent = root;
    return accent;
  }
  function drawAirdropFalling(d, time) {
    flash = 0; oy = 0; parent = root;
    const sway = Math.sin(time * 1.3) * 0.12;
    m4.compose(root, d.x, d.y, d.z, time * 0.3, sway * 0.4, sway, 1, 1, 1);
    part(Prims.rbox, 0, 0.65, 0, 1.3, 1.3, 1.3, COL.orange);
    part(Prims.box, 0, 0.65, 0, 1.34, 0.18, 1.34, COL.teal, 1.2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      v1[0] = sx * 0.6; v1[1] = 1.3; v1[2] = sz * 0.6; v2[0] = sx * 1.3; v2[1] = 5.2; v2[2] = sz * 1.3;
      bone(Prims.box, v1, v2, 0.035, 0.035, COL.gunDark);
    }
    m4.compose(L, 0, 6.3, 0, 0, 0, 0, 5.2, 3.2, 5.2); m4.multiply(W, root, L); Prims.sphere.add(W, COL.white[0], COL.white[1], COL.white[2], 0);
    m4.compose(L, 0, 6.5, 0, 0, 0, 0, 5.3, 1.2, 5.3); m4.multiply(W, root, L); Prims.sphere.add(W, COL.teal[0], COL.teal[1], COL.teal[2], 0.25);
  }
  function drawPlane(p, time) {
    flash = 0; oy = 0; parent = root;
    m4.compose(root, p.x, p.y, p.z, p.yaw, 0, Math.sin(time * 0.7) * 0.03, 1, 1, 1);
    const b = COL.planeBody, d = COL.planeDark, R = Prims.rbox, B = Prims.box;
    part(R, 0, 0, 0, 3.4, 3.2, 18, b);
    m4.compose(L, 0, -0.1, 10, 0, 0, 0, 3.3, 3.0, 6.5); m4.multiply(W, root, L); Prims.sphere.add(W, b[0], b[1], b[2], 0);
    part(R, 0, 0.75, 10.4, 2.2, 1.0, 2.6, d);
    part(B, 0, 0.9, 1, 30, 0.4, 4.0, b); part(B, 0, 1.0, 1, 30.2, 0.12, 1.2, COL.teal, 0.5);
    part(B, 0, 1.3, -8.2, 10.5, 0.3, 2.4, b); part(B, 0, 3.0, -8.4, 0.35, 3.8, 3.2, b); part(B, 0, 4.6, -8.6, 0.4, 0.7, 3.0, COL.teal, 0.5);
    part(B, 1.72, 0.2, 0, 0.05, 0.5, 15, COL.teal, 0.4); part(B, -1.72, 0.2, 0, 0.05, 0.5, 15, COL.teal, 0.4);
    part(B, 0, -0.4, -9.05, 2.2, 2.0, 0.1, d);
    for (const sx of [-1, 1]) for (const k of [7.2, 12.2]) {
      part(R, sx * k, 0.25, 1.6, 1.5, 1.5, 3.6, d);
      m4.compose(tmpM, sx * k, 0.25 + oy, 3.5, 0, 0, time * 26 + k, 1, 1, 1);
      m4.multiply(RP, root, tmpM);
      parent = RP;
      part(B, 0, 0, 0, 0.16, 3.8, 0.24, COL.gunDark); part(B, 0, 0, 0, 3.8, 0.16, 0.24, COL.gunDark);
      parent = root;
    }
  }
  function drawWindmill(w, time) {
    flash = 0; oy = 0;
    m4.compose(root, w.x, w.y, w.z, w.yaw, 0, time * 0.55, 1, 1, 1);
    parent = root;
    part(Prims.rbox, 0, 0, 0, 0.7, 0.7, 0.9, COL.gunDark);
    for (let k = 0; k < 4; k++) {
      m4.compose(tmpM, 0, 0, 0.35, 0, 0, k * Math.PI / 2, 1, 1, 1);
      m4.multiply(RP, root, tmpM);
      parent = RP;
      part(Prims.box, 0, 3.4, 0, 0.16, 6.6, 0.12, COL.gunDark);
      part(Prims.box, 0.55, 3.9, 0, 0.95, 5.2, 0.05, COL.canvas);
      parent = root;
    }
  }
  return { drawCharacter, drawItem, drawNade, drawChest, drawAirdropFalling, drawPlane, drawWindmill, RAR, COL };
})();
