// AURORA FALL — vegetation and rocks: instanced models (three levels of detail) and the grass / flower chunk builder.
// Pure data (no WebGL, no DOM). Foliage is built from alpha-tested cards that use the leaf layers of the material array.
'use strict';

const Flora = (function () {
  const BARK = matCol(0x6a5444, 'bark'), BARK_DARK = matCol(0x4f4036, 'bark'), BIRCH = matCol(0xe9e4d6, 'birch'), DEADWOOD = matCol(0x8a7d6e, 'bark');
  const norm = v => { const l = 1 / (Math.hypot(v[0], v[1], v[2]) || 1); return [v[0] * l, v[1] * l, v[2] * l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // One foliage card centred at c in the plane spanned by r (right) and u (up), half sizes hw / hh.
  // Shading normals point away from the crown centre k so the whole crown reads as one soft volume;
  // shade(point) returns the baked brightness of a corner (darker inside and underneath).
  function card(b, c, r, u, hw, hh, k, col, shade, uv) {
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(q => [c[0] + r[0] * hw * q[0] + u[0] * hh * q[1], c[1] + r[1] * hw * q[0] + u[1] * hh * q[1], c[2] + r[2] * hw * q[0] + u[2] * hh * q[1]]);
    const N = P.map(p => norm([p[0] - k[0], (p[1] - k[1]) * 0.8 + 0.5, p[2] - k[2]]));
    const C = P.map(p => scaleCol(col, shade(p)));
    b.card(P[0], P[1], P[2], P[3], N, C, 1, uv);
  }
  // A ball of cards with random orientations (broadleaf sprays, shrubs).
  function cluster(b, c, rad, k, n, col, rng, shade) {
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU;
      let nrm;
      if (i % 3 === 2) nrm = norm([Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4]);                 // a few lie flat so the crown has a top
      else nrm = norm([Math.cos(a), (rng() - 0.5) * 0.8, Math.sin(a)]);
      let r = cross(Math.abs(nrm[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], nrm); r = norm(r);
      let u = cross(nrm, r);
      const roll = rng() * TAU, cr = Math.cos(roll), sr = Math.sin(roll);
      const r2 = [r[0] * cr + u[0] * sr, r[1] * cr + u[1] * sr, r[2] * cr + u[2] * sr], u2 = [u[0] * cr - r[0] * sr, u[1] * cr - r[1] * sr, u[2] * cr - r[2] * sr];
      const s = rad * (0.82 + rng() * 0.45);
      const cc = [c[0] + (rng() - 0.5) * rad * 0.8, c[1] + (rng() - 0.5) * rad * 0.6, c[2] + (rng() - 0.5) * rad * 0.8];
      card(b, cc, r2, u2, s, s, k, col, shade);
    }
  }
  function trunk(b, rng, height, radius, sides, segs, col, lean) {
    const pts = [], bx = (rng() - 0.5) * lean, bz = (rng() - 0.5) * lean, wob = rng() * TAU;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, y = -0.6 + t * (height + 0.6);
      const flare = 1 + 0.75 * Math.pow(1 - t, 5);
      pts.push([bx * t * t + Math.sin(t * 3.3 + wob) * 0.07 * height / 5, y, bz * t * t + Math.cos(t * 2.7 + wob) * 0.06 * height / 5, radius * flare * (1 - 0.5 * t)]);
    }
    b.param = 1;
    b.tube(pts, sides, col);
    return pts[pts.length - 1];
  }

  // ---- broadleaf tree: bent trunk, a few limbs, sprays of leaves at their ends
  function broadleaf(lod, o) {
    const b = new MeshBuilder(), rng = makeRng(o.seed);
    const top = trunk(b, rng, o.trunkH, o.trunkR, lod === 0 ? 8 : lod === 1 ? 5 : 3, lod === 0 ? 5 : 2, o.bark, 0.7);
    const K = [top[0], o.trunkH + o.crownH * 0.4, top[2]], cr = o.crownR, leaf = o.leaf;
    const shade = p => {
      const d = Math.hypot(p[0] - K[0], (p[1] - K[1]) * cr / (o.crownH * 0.6), p[2] - K[2]) / cr;
      return clamp(0.5 + 0.5 * d, 0.5, 1) * (0.78 + 0.22 * clamp01((p[1] - (K[1] - o.crownH * 0.5)) / o.crownH));
    };
    const spots = [];
    for (let i = 0; i < o.limbs; i++) {
      const a = i / o.limbs * TAU + rng() * 0.9, tilt = 0.6 + rng() * 0.5, len = cr * (0.62 + rng() * 0.32);
      const e = [top[0] + Math.cos(a) * Math.sin(tilt) * len, top[1] + Math.cos(tilt) * len * 0.85 + 0.25, top[2] + Math.sin(a) * Math.sin(tilt) * len];
      if (lod < 2) {
        const mid = [(top[0] + e[0]) / 2 + (rng() - 0.5) * 0.25, (top[1] + e[1]) / 2 + 0.2, (top[2] + e[2]) / 2 + (rng() - 0.5) * 0.25];
        b.param = 0.85;
        b.tube([[top[0], top[1] - 0.35, top[2], top[3] * 0.8], [mid[0], mid[1], mid[2], top[3] * 0.5], [e[0], e[1], e[2], top[3] * 0.2]], lod === 0 ? 5 : 3, o.bark);
      }
      spots.push([e, cr * (0.5 + rng() * 0.16)]);
    }
    spots.push([[K[0] + (rng() - 0.5) * 0.3, top[1] + o.crownH * 0.72, K[2] + (rng() - 0.5) * 0.3], cr * 0.56]);
    spots.push([[K[0], K[1] - o.crownH * 0.05, K[2]], cr * 0.6]);
    b.param = 1;
    if (lod === 2) {            // far away: three big cards
      for (let i = 0; i < 2; i++) { const a = i * Math.PI / 2 + 0.4; card(b, K, [Math.cos(a), 0, Math.sin(a)], [0, 1, 0], cr * 1.12, o.crownH * 0.66, K, leaf, shade); }
      card(b, [K[0], K[1] + o.crownH * 0.1, K[2]], [1, 0, 0], [0, 0.25, 0.97], cr * 1.05, cr * 1.05, K, leaf, shade);
    } else {
      const per = lod === 0 ? o.cards : 3;
      spots.forEach((s, i) => cluster(b, s[0], s[1] * (lod === 0 ? 1 : 1.25), K, per, leaf, rng, shade));
    }
    return b.build();
  }

  // ---- conifer: straight trunk, the whole crown as crossed profile cards, plus tiers of drooping boughs up close
  function conifer(lod, o) {
    const b = new MeshBuilder(), rng = makeRng(o.seed);
    trunk(b, rng, o.height * 0.9, o.trunkR, lod === 0 ? 7 : lod === 1 ? 4 : 3, lod === 0 ? 4 : 2, o.bark, 0.2);
    const base = o.crownBase, H = o.height, leaf = o.leaf, prof = withMat(o.leaf, 'leafD');
    const K = [0, base + (H - base) * 0.35, 0];
    b.param = 1;
    const planes = lod === 2 ? 2 : 3, y0 = base + 0.25, y1 = H + 0.35;       // the lowest boughs hang just above head height
    for (let i = 0; i < planes; i++) {
      const a = i / planes * Math.PI + 0.35, r = [Math.cos(a), 0, Math.sin(a)], hw = o.spread * (lod === 0 ? 0.94 : 1.08);
      const P = [[-r[0] * hw, y0, -r[2] * hw], [r[0] * hw, y0, r[2] * hw], [r[0] * hw, y1, r[2] * hw], [-r[0] * hw, y1, -r[2] * hw]];
      const N2 = P.map((p, q) => norm([p[0] * 0.3, 0.75 + (q > 1 ? 0.6 : 0), p[2] * 0.3]));        // mostly upward: the two halves of a card shade alike
      const C = P.map((p, q) => scaleCol(prof, (q > 1 ? 1.0 : 0.66) * (lod === 0 ? 0.82 : 1)));
      b.card(P[0], P[1], P[2], P[3], N2, C, 1);
    }
    // seen from above (dropping in, gliding, from a hillside) upright cards are only thin lines: two flat layers of
    // boughs give the crown a top
    const flat = withMat(o.leaf, 'leafA');
    for (const [fy, fr, sh] of [[0.2, 0.98, 0.7], [0.58, 0.58, 0.9]]) {
      const y = base + (H - base) * fy, r = o.spread * fr;
      b.card([-r, y, -r], [r, y, -r], [r, y + 0.25, r], [-r, y + 0.25, r], [0, 1, 0], scaleCol(flat, sh), 1);
    }
    if (lod === 2) return b.build();
    const levels = lod === 0 ? 10 : 4;
    for (let l = 0; l < levels; l++) {
      const t = l / (levels - 1), y = base + 1.25 + (H - base - 2.5) * t;
      const len = o.spread * (1 - t * 0.8) * (0.95 + rng() * 0.15);
      const n = lod === 0 ? (t < 0.55 ? 6 : 5) : 4;
      const droop = lerp(0.42, 0.05, t);                       // old low boughs sag, young top ones reach out
      for (let k = 0; k < n; k++) {
        const a = (k + (l & 1) * 0.5) / n * TAU + rng() * 0.4;
        const dir = norm([Math.cos(a), -droop, Math.sin(a)]);
        const side = norm(cross([0, 1, 0], dir));
        const c = [dir[0] * len * 0.5, y + dir[1] * len * 0.5, dir[2] * len * 0.5];
        const shade = p => { const r = Math.hypot(p[0], p[2]) / (len + 0.01); return (0.55 + 0.45 * clamp01(r * 1.2)) * (0.8 + 0.2 * t); };
        const hw = len * 0.5, hh = len * 0.56;
        // texture u runs from the trunk to the tip of the bough
        const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(q => [c[0] + dir[0] * hw * q[0] + side[0] * hh * q[1], c[1] + dir[1] * hw * q[0] + side[1] * hh * q[1] - Math.abs(q[1]) * len * 0.08, c[2] + dir[2] * hw * q[0] + side[2] * hh * q[1]]);
        const N2 = P.map(p => norm([p[0] - K[0], 0.8 + (p[1] - y) * 0.6, p[2] - K[2]]));
        b.card(P[0], P[1], P[2], P[3], N2, P.map(p => scaleCol(leaf, shade(p))), 1);
      }
    }
    return b.build();
  }

  function deadTree(lod) {
    const b = new MeshBuilder(), rng = makeRng(77);
    trunk(b, rng, 5.4, 0.25, lod === 0 ? 7 : 4, lod === 0 ? 5 : 2, DEADWOOD, 0.9);
    const limbs = [[2.3, 0.4, 1.5, 0.9], [3.1, 2.6, 1.6, 0.8], [3.8, 4.3, 1.3, 0.7], [4.5, 1.4, 1.1, 0.5], [4.9, 3.4, 0.9, 0.4]];
    for (const [y, a, len, up] of limbs) {
      const e = [Math.cos(a) * len, y + up, Math.sin(a) * len];
      b.tube([[0, y - 0.1, 0, 0.1], [e[0] * 0.55, y + up * 0.35, e[2] * 0.55, 0.06], [e[0], e[1], e[2], 0.02]], lod === 0 ? 5 : 3, DEADWOOD);
      if (lod === 0) b.tube([[e[0] * 0.55, y + up * 0.35, e[2] * 0.55, 0.045], [e[0] * 0.7 - Math.sin(a) * 0.5, y + up * 0.9, e[2] * 0.7 + Math.cos(a) * 0.5, 0.012]], 4, DEADWOOD);
    }
    return b.build();
  }
  function shrub(lod, o) {
    const b = new MeshBuilder(), rng = makeRng(o.seed), K = [0, o.h * 0.3, 0];
    const shade = p => clamp(0.55 + 0.45 * (p[1] / o.h), 0.5, 1);
    b.param = 1;
    if (lod === 2) { for (let i = 0; i < 2; i++) { const a = i * Math.PI / 2 + 0.6; card(b, [0, o.h * 0.5, 0], [Math.cos(a), 0, Math.sin(a)], [0, 1, 0], o.r, o.h * 0.55, K, o.leaf, shade); } return b.build(); }
    const n = lod === 0 ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rng(), d = o.r * 0.45 * rng();
      cluster(b, [Math.cos(a) * d, o.h * (0.42 + rng() * 0.2), Math.sin(a) * d], o.r * 0.62, K, lod === 0 ? 4 : 2, o.leaf, rng, shade);
    }
    return b.build();
  }
  // upright fans of fronds (ferns, reeds): crossed cards using the frond texture, base at the ground
  function fronds(o) {
    const b = new MeshBuilder(), rng = makeRng(o.seed);
    b.param = 1;
    for (let i = 0; i < o.n; i++) {
      const a = i / o.n * Math.PI + rng() * 0.3, r = [Math.cos(a), 0, Math.sin(a)], lean = (rng() - 0.5) * o.lean;
      const u = norm([-r[2] * lean, 1, r[0] * lean]);
      const c = [(rng() - 0.5) * 0.1, o.h * 0.5 - 0.03, (rng() - 0.5) * 0.1];
      const shade = p => 0.6 + 0.4 * clamp01(p[1] / o.h);
      const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(q => [c[0] + r[0] * o.w * q[0] + u[0] * o.h * 0.5 * q[1], c[1] + u[1] * o.h * 0.5 * q[1], c[2] + r[2] * o.w * q[0] + u[2] * o.h * 0.5 * q[1]]);
      b.card(P[0], P[1], P[2], P[3], P.map(p => norm([p[0] * 0.6, 1, p[2] * 0.6])), P.map(p => scaleCol(o.leaf, shade(p))), 1);
    }
    return b.build();
  }
  function rock(seed, lod) {
    const b = new MeshBuilder(), col = matCol(0x8a857d, 'rock');
    b.param = 1;
    b.blob(0, 0.12, 0, 1, 0.82, 1, col, { detail: lod === 0 ? 2 : 1, noise: 0.42, seed, grad: 0.62 });
    return b.build();
  }

  // ---- a clump of grass blades / a few flowers (instanced by the thousand; see grassVS for the vertex layout)
  function grassClump(blades, seed) {
    const b = new MeshBuilder(), rng = makeRng(seed);
    for (let k = 0; k < blades; k++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * 0.17, bx = Math.cos(a) * d, bz = Math.sin(a) * d;
      const face = rng() * TAU, fx = Math.cos(face), fz = Math.sin(face);          // the blade is flat across (fx, fz)
      const w = 0.016 + rng() * 0.012, hgt = 0.62 + rng() * 0.38, lean = 0.1 + rng() * 0.22, la = a + (rng() - 0.5) * 1.4;
      const lx = Math.cos(la) * lean, lz = Math.sin(la) * lean, shade = 0.82 + rng() * 0.3, stiff = rng() * 0.3;
      const col = [shade, shade * (0.96 + rng() * 0.08), shade * (0.9 + rng() * 0.1)];
      const P = (side, t, wk) => [bx + fx * w * side * wk + lx * t * t, t * hgt, bz + fz * w * side * wk + lz * t * t];
      const V = (p) => b.vert(p[0], p[1], p[2], -fz, 0, fx, col, stiff, 0, 0);
      const i0 = b.count;
      V(P(-1, 0, 1)); V(P(1, 0, 1)); V(P(-1, 0.55, 0.72)); V(P(1, 0.55, 0.72)); V(P(0, 1, 0));
      b.i.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2, i0 + 2, i0 + 3, i0 + 4);
    }
    return b.build();
  }
  function flowerClump(seed) {
    const b = new MeshBuilder(), rng = makeRng(seed), green = [0.2, 0.34, 0.1];
    for (let k = 0; k < 3; k++) {
      const a = rng() * TAU, d = 0.05 + rng() * 0.12, bx = Math.cos(a) * d, bz = Math.sin(a) * d, hgt = 0.7 + rng() * 0.3, lx = (rng() - 0.5) * 0.12, lz = (rng() - 0.5) * 0.12;
      const fx = Math.cos(a + 1), fz = Math.sin(a + 1), w = 0.008;
      const P = (side, t) => [bx + fx * w * side + lx * t * t, t * hgt, bz + fz * w * side + lz * t * t];
      const i0 = b.count;
      for (const q of [P(-1, 0), P(1, 0), P(-1, 1), P(1, 1)]) b.vert(q[0], q[1], q[2], -fz, 0, fx, green, 1, 0, 0);
      b.i.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2);
      // flower head: a small tilted disc of petals with a darker heart
      const c = P(0, 1), r = 0.05 + rng() * 0.02, tx = (rng() - 0.5) * 0.5, tz = (rng() - 0.5) * 0.5, c0 = b.count;
      b.vert(c[0], c[1] + 0.012, c[2], 0, 1, 0, [1.0, 0.72, 0.18], 0.9, 0, 0);
      for (let s = 0; s < 6; s++) { const an = s / 6 * TAU; b.vert(c[0] + Math.cos(an) * r, c[1] + (Math.cos(an) * tx + Math.sin(an) * tz) * r, c[2] + Math.sin(an) * r, 0, 1, 0, [1, 1, 1], 0.9, 0, 0); }
      for (let s = 0; s < 6; s++) b.i.push(c0, c0 + 1 + (s + 1) % 6, c0 + 1 + s);
    }
    return b.build();
  }

  const TREES = [
    lod => conifer(lod, { seed: 31, height: 8.6, crownBase: 1.7, spread: 2.35, trunkR: 0.26, bark: BARK_DARK, leaf: matCol(0x4f7a52, 'leafB') }),
    lod => broadleaf(lod, { seed: 17, trunkH: 4.7, trunkR: 0.17, crownR: 1.85, crownH: 3.3, limbs: 4, cards: 6, bark: BIRCH, leaf: matCol(0xd9b03a, 'leafA') }),
    lod => broadleaf(lod, { seed: 23, trunkH: 3.1, trunkR: 0.27, crownR: 2.55, crownH: 3.6, limbs: 5, cards: 7, bark: BARK, leaf: matCol(0xc7622f, 'leafA') }),
    lod => broadleaf(lod, { seed: 29, trunkH: 3.0, trunkR: 0.28, crownR: 2.45, crownH: 3.5, limbs: 5, cards: 7, bark: BARK, leaf: matCol(0x6c9443, 'leafA') }),
    lod => deadTree(lod),
    lod => shrub(lod, { seed: 5, r: 1.0, h: 1.15, leaf: matCol(0x5c8a46, 'leafA') }),
  ];
  // small undergrowth scattered separately from the trees (no collision): 0 fern, 1 reeds, 2 low shrub
  const PLANTS = [
    () => fronds({ seed: 3, n: 3, w: 0.62, h: 0.85, lean: 0.5, leaf: matCol(0x5a8a3c, 'leafC') }),
    () => fronds({ seed: 8, n: 3, w: 0.42, h: 1.7, lean: 0.25, leaf: matCol(0x8a9a4a, 'leafC') }),
    () => shrub(0, { seed: 12, r: 0.62, h: 0.7, leaf: matCol(0x557f3e, 'leafA') }),
  ];

  const _c = [0, 0, 0];
  return {
    // { trees: [type][lod] meshes, rocks: [variant][lod], plants: [kind] }
    build() {
      const out = { trees: [], rocks: [], plants: [] };
      for (const mk of TREES) out.trees.push([mk(0), mk(1), mk(2)]);
      for (let v = 0; v < 3; v++) out.rocks.push([rock(40 + v * 13, 0), rock(40 + v * 13, 1)]);
      for (const mk of PLANTS) out.plants.push(mk());
      return out;
    },
    grassMesh() { return grassClump(7, 91); },
    flowerMesh() { return flowerClump(64); },
    FLOWERS: [[1.0, 0.98, 0.94], [1.0, 0.82, 0.2], [0.72, 0.5, 1.0], [1.0, 0.55, 0.7], [0.55, 0.7, 1.0]],
    // Fill one square of ground with clumps. Layout per instance: x, y, z, height, r, g, b, yaw (0..1).
    // Returns [grass count, flower count]; `step` is the spacing of the jittered grid in metres.
    fillChunk(x0, z0, size, step, grass, flowers) {
      let ng = 0, nf = 0;
      const gx0 = Math.round(x0 / step), gz0 = Math.round(z0 / step), n = Math.round(size / step);
      const maxG = grass.length / 8, maxF = flowers.length / 8, FL = this.FLOWERS;
      // cells are visited in a scrambled order, so drawing only the first part of a chunk thins it evenly (distant chunks)
      for (let q = 0, nn = n * n; q < nn; q++) {
        const k = (q * 7919) % nn, i = k % n, j = (k / n) | 0;
        const gx = gx0 + i, gz = gz0 + j;
        const x = (gx + hash2i(gx, gz, 23)) * step, z = (gz + hash2i(gx, gz, 37)) * step;
        const h = Terrain.height(x, z);
        if (h < 2.75 || h > 72) continue;
        const bare = Terrain.bareAt(x, z), r1 = hash2i(gx, gz, 11);
        if (bare > 0.3 + r1 * 0.32) continue;
        const steep = Terrain.steepness(x, z);
        if (steep > 0.42 + r1 * 0.12) continue;
        const beach = smoothstep(3.7, 2.8, h + (r1 - 0.5) * 0.8);               // sparse dune grass toward the sand
        if (beach > 0.05 && r1 < beach * 0.93) continue;
        const forest = Terrain.forest(x, z), patch = fbm2(Terrain._nE, x * 0.035, z * 0.035, 2) * 0.5 + 0.5;
        Terrain.tintAt(x, z, _c);
        const v = 0.86 + hash2i(gx, gz, 51) * 0.3;
        let hgt = (0.13 + patch * patch * 0.34) * (1 - forest * 0.3) * (1 - bare * 1.2) * (0.75 + hash2i(gx, gz, 67) * 0.5) * (1 - smoothstep(55, 72, h) * 0.5);
        if (beach > 0.05) hgt *= 1.25;
        if (hgt < 0.06) continue;
        const flower = hash2i(gx, gz, 97) < 0.028 * (1 - forest) * (1 - beach) * smoothstep(0.35, 0.6, patch) && nf < maxF;
        if (flower) {
          const c = FL[Math.floor(hash2i(gx >> 3, gz >> 3, 131) * FL.length + hash2i(gx, gz, 139) * 1.3) % FL.length], o = nf * 8;
          flowers[o] = x; flowers[o + 1] = h - 0.02; flowers[o + 2] = z; flowers[o + 3] = hgt * 1.25 + 0.14;
          flowers[o + 4] = c[0]; flowers[o + 5] = c[1]; flowers[o + 6] = c[2]; flowers[o + 7] = hash2i(gx, gz, 83);
          nf++;
        }
        if (ng >= maxG) continue;
        const o = ng * 8, dry = beach > 0.05 ? 1 : 0;
        grass[o] = x; grass[o + 1] = h - 0.03; grass[o + 2] = z; grass[o + 3] = hgt;
        grass[o + 4] = _c[0] * v * (1.02 + dry * 0.5); grass[o + 5] = _c[1] * v * (1.1 + dry * 0.25); grass[o + 6] = _c[2] * v * (1 - dry * 0.2); grass[o + 7] = hash2i(gx, gz, 83);
        ng++;
      }
      return [ng, nf];
    },
  };
})();
