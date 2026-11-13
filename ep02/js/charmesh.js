// AURORA FALL — skinned character mesh: one continuous-looking figure built from lofted rings (pure data)
// Every vertex follows two bones; elbows, knees, waist and neck blend so the limbs bend instead of hinging.
// Bind pose: standing, arms hanging straight down, +x = the character's left, +z = forward.
'use strict';

const CharMesh = (function () {
  const BONE = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, armL: 5, foreL: 6, handL: 7, armR: 8, foreR: 9, handR: 10, thighL: 11, shinL: 12, footL: 13, thighR: 14, shinR: 15, footR: 16 };
  // joint each bone turns around, in the bind pose
  const BIND = [[0, 0.96, 0], [0, 1.08, 0], [0, 1.26, 0], [0, 1.5, 0], [0, 1.58, 0],
    [0.19, 1.44, 0], [0.19, 1.16, 0], [0.19, 0.9, 0], [-0.19, 1.44, 0], [-0.19, 1.16, 0], [-0.19, 0.9, 0],
    [0.095, 0.93, 0], [0.095, 0.5, 0], [0.095, 0.085, 0], [-0.095, 0.93, 0], [-0.095, 0.5, 0], [-0.095, 0.085, 0]];
  // colour zones (see skinVS): 0 = colour baked into the mesh, 1 jacket, 2 jacket dark, 3 trousers, 4 jacket light, 5 skin
  const Z = { baked: 0, suit: 1, dark: 2, pants: 3, light: 4, skin: 5 };

  function build(lod) {
    const b = new MeshBuilder(), W = [];
    const SEG = lod === 0 ? 12 : 7, fine = lod === 0;
    const cloth = withMat([1, 1, 1], 'fabric'), plain = [1, 1, 1];
    const tone = (c, k) => withMat([c[0] * k, c[1] * k, c[2] * k], c.mat);
    const BOOT = withMat([0.034, 0.03, 0.027], 'fabric'), GLOVE = withMat([0.036, 0.038, 0.042], 'fabric'), PACK = withMat([0.085, 0.09, 0.052], 'fabric'),
      STRAP = withMat([0.03, 0.031, 0.028], 'fabric'), GEAR = [0.045, 0.048, 0.052], ROLL = withMat([0.16, 0.17, 0.13], 'fabric');
    // ring in the horizontal plane; pw < 1 squares it off, rf / rb = front / back radius
    const ring = (cx, cy, cz, rx, rf, rb, pw, n) => {
      const out = [];
      n = n || SEG;
      for (let k = 0; k < n; k++) {
        const a = k / n * TAU, s = Math.sin(a), c = Math.cos(a), p = pw || 1;
        const sx = Math.sign(s) * Math.pow(Math.abs(s), p), sz = Math.sign(c) * Math.pow(Math.abs(c), p);
        out.push([cx + sx * rx, cy, cz + sz * (c >= 0 ? rf : (rb === undefined ? rf : rb))]);
      }
      return out;
    };
    // skin a stack of rings. info per ring: { w: [boneA, boneB, weight of A], zone, col }; paint(i, j) may override
    // { zone, col, em } for single vertices (i = ring, j = position around it).
    const part = (rings, info, capS, capE, paint) => {
      const v0 = b.count, n = rings[0].length;
      b.loft(rings, info[0].col || cloth, { cols: info.map(q => q.col || cloth), capStart: capS, capEnd: capE });
      let k = v0;
      for (let i = 0; i < rings.length; i++) for (let j = 0; j <= n; j++, k++) {
        const q = info[i];
        W[k] = [q.w[0], q.w[1], q.w[2], q.zone || 0];
        const o = paint ? paint(i, j % n, n) : null;
        if (o) {
          if (o.zone !== undefined) W[k][3] = o.zone;
          if (o.col) { b.c[k * 4] = o.col[0]; b.c[k * 4 + 1] = o.col[1]; b.c[k * 4 + 2] = o.col[2]; b.m[k * 4 + 2] = o.col.mat === undefined ? -1 : o.col.mat; }
          if (o.em) b.c[k * 4 + 3] = o.em;
        }
      }
      const tail = (q) => { for (let j = 0; j < n * 3; j++, k++) W[k] = [q.w[0], q.w[1], q.w[2], q.zone || 0]; };
      if (capS) tail(info[0]);
      if (capE) tail(info[info.length - 1]);
    };
    // rigid extra piece: everything added by fn() follows one bone (or a fixed blend)
    const rigid = (w, zone, fn) => { const v0 = b.count; fn(); for (let k = v0; k < b.count; k++) W[k] = [w[0], w[1], w[2], zone || 0]; };
    const H = BONE;

    // ---- torso (hips -> collar)
    { const T = [
        [0.84, 0.06, 0.05, 0.05, Z.pants, [H.hips, H.hips, 1], 0.93],
        [0.88, 0.15, 0.105, 0.108, Z.pants, [H.hips, H.hips, 1], 0.95],
        [0.94, 0.17, 0.115, 0.128, Z.pants, [H.hips, H.hips, 1], 1],
        [1.0, 0.168, 0.112, 0.116, Z.pants, [H.hips, H.spine, 0.7], 1],
        [1.02, 0.174, 0.12, 0.12, Z.baked, [H.hips, H.spine, 0.6], 1],
        [1.05, 0.166, 0.113, 0.108, Z.suit, [H.hips, H.spine, 0.4], 0.92],
        [1.12, 0.158, 0.11, 0.1, Z.suit, [H.spine, H.spine, 1], 0.97],
        [1.2, 0.168, 0.12, 0.105, Z.suit, [H.spine, H.chest, 0.6], 1],
        [1.3, 0.188, 0.135, 0.115, Z.suit, [H.chest, H.chest, 1], 1],
        [1.38, 0.196, 0.13, 0.118, Z.suit, [H.chest, H.chest, 1], 1],
        [1.44, 0.186, 0.11, 0.11, Z.suit, [H.chest, H.chest, 1], 1],
        [1.485, 0.12, 0.085, 0.09, Z.suit, [H.chest, H.chest, 1], 0.95],
        [1.512, 0.07, 0.064, 0.068, Z.suit, [H.chest, H.neck, 0.6], 0.85],
      ];
      part(T.map(t => ring(0, t[0], 0.005, t[1], t[2], t[3], 0.85)), T.map(t => ({ w: t[5], zone: t[4], col: t[4] === Z.baked ? STRAP : tone(cloth, t[6]) })), true, true,
        (i, j, n) => (T[i][4] === Z.suit && T[i][0] < 1.45 && (j === Math.round(n / 4) || j === Math.round(n * 3 / 4)) ? { zone: Z.dark } : null));
    }
    // ---- neck + head
    part([ring(0, 1.47, 0, 0.052, 0.05, 0.054), ring(0, 1.53, 0.004, 0.05, 0.05, 0.052), ring(0, 1.585, 0.01, 0.052, 0.055, 0.05)],
      [{ w: [H.neck, H.chest, 0.5], col: STRAP }, { w: [H.neck, H.neck, 1], col: STRAP }, { w: [H.head, H.neck, 0.6], col: STRAP }], false, false);
    { const Hd = [[1.553, 0.034, 0.05, 0.03], [1.575, 0.058, 0.082, 0.058], [1.6, 0.074, 0.097, 0.076], [1.64, 0.086, 0.103, 0.09], [1.68, 0.091, 0.101, 0.097], [1.72, 0.092, 0.098, 0.099], [1.76, 0.083, 0.087, 0.091], [1.79, 0.061, 0.065, 0.069], [1.806, 0.026, 0.028, 0.03]];
      part(Hd.map(h => ring(0, h[0], 0.012, h[1], h[2], h[3])), Hd.map((h, i) => ({ w: [H.head, H.neck, i === 0 ? 0.8 : 1], zone: Z.skin, col: tone(plain, i < 2 ? 0.86 : 1) })), true, true);
      if (fine) rigid([H.head, H.head, 1], Z.skin, () => {                 // nose
        b.loft([[[0.014, 1.618, 0.1], [-0.014, 1.618, 0.1], [0, 1.626, 0.123]], [[0.01, 1.65, 0.103], [-0.01, 1.65, 0.103], [0, 1.655, 0.119]], [[0.006, 1.682, 0.1], [-0.006, 1.682, 0.1], [0, 1.684, 0.106]]], tone(plain, 0.97), { capStart: true, capEnd: true });
      });
      // helmet: covers the top and back of the head, open over the face
      const Hm = [[1.612, 0.092, 0.058, 0.105], [1.66, 0.102, 0.07, 0.112], [1.7, 0.107, 0.086, 0.115], [1.722, 0.111, 0.12, 0.117], [1.76, 0.105, 0.11, 0.112], [1.8, 0.086, 0.09, 0.092], [1.832, 0.05, 0.053, 0.056], [1.845, 0.012, 0.013, 0.014]];
      part(Hm.map(h => ring(0, h[0], 0.012, h[1], h[2], h[3])), Hm.map((h, i) => ({ w: [H.head, H.head, 1], zone: Z.dark, col: tone(plain, i === 3 ? 1.5 : i < 3 ? 1.1 : 1.3) })), false, false,
        (i, j, n) => (i >= 4 && i <= 6 && j === 0 ? { zone: Z.suit, col: tone(plain, 1.1) } : null));            // a stripe in the jacket colour over the crown
      // goggles: strap all the way round; the glowing lens is a piece of its own (a glow cannot fade across a face)
      const G = [[1.656, 0.004], [1.664, 0.014], [1.7, 0.014], [1.708, 0.004]];
      part(G.map(g => ring(0, g[0], 0.012, 0.092 + g[1], 0.102 + g[1], 0.099 + g[1] * 0.4)), G.map(() => ({ w: [H.head, H.head, 1], col: GEAR })), false, false);
      rigid([H.head, H.head, 1], 0, () => {
        const LENS = [0.16, 0.82, 0.68], n = fine ? 6 : 3, A = 0.82;
        const at = (a, y) => [Math.sin(a) * 0.1085, y, 0.012 + Math.cos(a) * 0.1185];
        for (let k = 0; k < n; k++) {
          const a0 = -A + 2 * A * k / n, a1 = -A + 2 * A * (k + 1) / n, am = (a0 + a1) / 2;
          b.quad(at(a0, 1.666), at(a1, 1.666), at(a1, 1.698), at(a0, 1.698), LENS, 1.5 + 0.22, [Math.sin(am), 0, Math.cos(am)]);
        }
      });
    }
    // ---- arms, hands
    for (const side of [1, -1]) {
      const x = 0.19 * side, U = side > 0 ? H.armL : H.armR, F = side > 0 ? H.foreL : H.foreR, Hn = side > 0 ? H.handL : H.handR;
      const A = [
        [0.893, 0.03, Z.dark, [F, Hn, 0.5]], [0.92, 0.034, Z.dark, [F, F, 1]], [0.95, 0.036, Z.suit, [F, F, 1]], [1.02, 0.043, Z.suit, [F, F, 1]], [1.1, 0.047, Z.suit, [F, F, 1]],
        [1.135, 0.0455, Z.suit, [F, U, 0.78]], [1.16, 0.046, Z.suit, [F, U, 0.5]], [1.185, 0.0475, Z.suit, [U, F, 0.78]],
        [1.24, 0.051, Z.suit, [U, U, 1]], [1.32, 0.056, Z.suit, [U, U, 1]], [1.4, 0.063, Z.suit, [U, U, 1]], [1.45, 0.061, Z.suit, [U, U, 1]], [1.487, 0.042, Z.suit, [U, U, 1]], [1.502, 0.012, Z.suit, [U, U, 1]],
      ];
      part(A.map(a => ring(x, a[0], 0, a[1], a[1] * 1.1, a[1] * 1.1, 1, fine ? 10 : 6)), A.map(a => ({ w: a[3], zone: a[2], col: cloth })), true, true);
      const Hd = [[0.725, 0.006, 0.014, 0.034], [0.75, 0.013, 0.034, 0.028], [0.79, 0.017, 0.042, 0.017], [0.84, 0.019, 0.044, 0.007], [0.88, 0.022, 0.036, 0], [0.906, 0.027, 0.031, 0]];
      part(Hd.map(h => ring(x, h[0], h[3], h[1], h[2], h[2], 0.8, fine ? 8 : 5)), Hd.map(() => ({ w: [Hn, Hn, 1], col: GLOVE })), true, false);
      if (fine) rigid([Hn, Hn, 1], 0, () => b.tube([[x - side * 0.004, 0.87, 0.03, 0.013], [x - side * 0.008, 0.83, 0.052, 0.012], [x - side * 0.01, 0.795, 0.062, 0.008]], 5, GLOVE, { caps: true }));
    }
    // ---- legs, boots
    for (const side of [1, -1]) {
      const x = 0.095 * side, T = side > 0 ? H.thighL : H.thighR, S = side > 0 ? H.shinL : H.shinR, F = side > 0 ? H.footL : H.footR;
      const L = [
        [0.1, 0.04, -0.004, [S, F, 0.5]], [0.2, 0.043, -0.006, [S, S, 1]], [0.3, 0.051, -0.012, [S, S, 1]], [0.4, 0.054, -0.008, [S, S, 1]], [0.46, 0.052, -0.002, [S, T, 0.78]],
        [0.5, 0.054, 0.003, [S, T, 0.5]], [0.54, 0.058, 0.004, [T, S, 0.78]], [0.62, 0.066, 0.006, [T, T, 1]], [0.74, 0.078, 0.006, [T, T, 1]], [0.86, 0.088, 0.002, [T, T, 1]],
        [0.93, 0.089, 0, [T, H.hips, 0.7]], [0.985, 0.066, 0, [H.hips, H.hips, 1]],
      ];
      part(L.map(l => ring(x * (l[0] > 0.9 ? 0.92 : 1), l[0], l[2], l[1], l[1] * 1.1, l[1] * 1.1, 1, fine ? 10 : 6)), L.map(l => ({ w: l[3], zone: Z.pants, col: cloth })), false, true);
      if (fine) rigid([S, T, 0.5], 0, () => b.blob(x, 0.5, 0.05, 0.047, 0.062, 0.03, GEAR, { detail: 1 }));                    // knee pad
      // boot: shaft around the ankle, then the foot itself (rings advance toward the toe)
      const Sh = [[0.07, 0.049, [F, F, 1]], [0.13, 0.05, [F, S, 0.6]], [0.2, 0.052, [S, S, 1]], [0.262, 0.057, [S, S, 1]], [0.272, 0.05, [S, S, 1]]];
      part(Sh.map(s => ring(x, s[0], -0.004, s[1], s[1] * 1.12, s[1] * 1.12, 1, fine ? 10 : 6)), Sh.map(s => ({ w: s[2], col: BOOT })), false, true);
      const Ft = [[-0.082, 0.03, 0.05], [-0.052, 0.044, 0.1], [0.0, 0.048, 0.118], [0.065, 0.051, 0.094], [0.125, 0.053, 0.074], [0.17, 0.046, 0.058], [0.193, 0.024, 0.034]];
      const nf = fine ? 10 : 6;
      part(Ft.map(f => { const r = []; for (let k = 0; k < nf; k++) { const a = k / nf * TAU, c = Math.cos(a), s = Math.sin(a), q = 0.62; r.push([x + Math.sign(c) * Math.pow(Math.abs(c), q) * f[1], f[2] / 2 + Math.sign(s) * Math.pow(Math.abs(s), q) * f[2] / 2, f[0]]); } return r; }),
        Ft.map(() => ({ w: [F, F, 1], col: BOOT })), true, true, (i, j, n) => (Math.sin(j / n * TAU) < -0.5 ? { col: tone(BOOT, 0.45) } : null));
    }
    // ---- gear: backpack with bedroll, shoulder straps, belt pouches, raised collar
    rigid([H.chest, H.chest, 1], 0, () => {
      const P = [[1.06, 0.1, 0.045], [1.09, 0.14, 0.07], [1.25, 0.15, 0.078], [1.4, 0.145, 0.072], [1.455, 0.12, 0.055], [1.47, 0.06, 0.03]];
      b.loft(P.map(p => ring(0, p[0], -0.178, p[1], p[2], p[2], 0.55, fine ? 12 : 8)), PACK, { capStart: true, capEnd: true, cols: P.map((p, i) => tone(PACK, i >= 3 ? 1.25 : i === 0 ? 0.7 : 1)) });
      if (fine) {
        b.tube([[-0.16, 1.505, -0.185, 0.046], [0.16, 1.505, -0.185, 0.046]], 8, ROLL, { caps: true });
        for (const sx of [-0.09, 0.09]) b.box(sx, 1.505, -0.185, 0.022, 0.1, 0.1, 0, STRAP);
        b.box(0, 1.2, -0.262, 0.2, 0.15, 0.03, 0, tone(PACK, 0.85));                                                               // outer pocket
      }
    });
    if (fine) {
      for (const sx of [1, -1]) rigid([H.chest, H.spine, 0.75], 0, () => {
        b.tube([[sx * 0.105, 1.47, -0.1, 0.016], [sx * 0.118, 1.485, 0.02, 0.016], [sx * 0.125, 1.4, 0.118, 0.016], [sx * 0.132, 1.24, 0.135, 0.016], [sx * 0.15, 1.12, 0.08, 0.016]], 4, STRAP, { squash: 1.6 });
      });
      rigid([H.hips, H.hips, 1], 0, () => {
        b.box(0.118, 0.995, 0.105, 0.075, 0.085, 0.045, 0.25, tone(PACK, 0.8));
        b.box(-0.105, 0.995, 0.11, 0.06, 0.07, 0.04, -0.2, tone(PACK, 0.8));
        b.box(-0.176, 0.93, -0.01, 0.04, 0.16, 0.085, 0, STRAP);                                                                   // holster on the right hip
      });
    }
    part([ring(0, 1.47, 0, 0.078, 0.072, 0.08), ring(0, 1.525, 0, 0.082, 0.07, 0.086), ring(0, 1.53, 0, 0.07, 0.06, 0.074)], [0, 1, 2].map(i => ({ w: [H.chest, H.neck, 0.7], zone: Z.suit, col: tone(cloth, i === 2 ? 0.6 : 0.9) })), false, false);

    const m = b.build();
    m.bones = new Float32Array(m.vertexCount * 4);
    for (let k = 0; k < m.vertexCount; k++) { const w = W[k] || [0, 0, 1, 0]; m.bones[k * 4] = w[0]; m.bones[k * 4 + 1] = w[1]; m.bones[k * 4 + 2] = w[2]; m.bones[k * 4 + 3] = w[3]; }
    return m;
  }

  return { BONE, BIND, COUNT: BIND.length, build() { return [build(0), build(1)]; } };
})();
