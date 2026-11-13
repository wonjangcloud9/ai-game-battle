// AURORA FALL — island terrain: heightfield, biome colours, points of interest (no DOM dependencies)
'use strict';

const POI_DEFS = [
  { id: 'market', name: '한울 시장', at: [26, 18], r: 64, tier: 1, type: 'town' },
  { id: 'harbor', name: '은빛 항구', coast: [-0.12, 1], inland: 54, r: 58, tier: 1, type: 'harbor' },
  { id: 'village', name: '자작나무 마을', at: [196, -46], r: 50, tier: 1, type: 'village' },
  { id: 'keep', name: '폐허 성채', at: [190, -236], r: 42, tier: 2, type: 'ruins' },
  { id: 'lumber', name: '곰발 벌목장', at: [-214, 196], r: 46, tier: 1, type: 'lumber' },
  { id: 'base', name: '북풍 기지', at: [44, -292], r: 62, tier: 2, type: 'military' },
  { id: 'farm', name: '풍차 농장', at: [150, 204], r: 56, tier: 1, type: 'farm' },
  { id: 'light', name: '등대 곶', coast: [1, 0.16], inland: 34, r: 30, tier: 1, type: 'lighthouse' },
  { id: 'camp', name: '호숫가 야영지', at: [-290, 4], r: 32, tier: 0, type: 'camp', falloff: 1.25 },
  { id: 'obs', name: '서리봉 관측소', at: [-58, -88], r: 40, tier: 2, type: 'observatory' },
];
const ROAD_LINKS = [['market', 'harbor'], ['market', 'village'], ['market', 'lumber'], ['market', 'base'], ['market', 'farm'], ['village', 'light'],
  ['village', 'keep'], ['base', 'keep'], ['lumber', 'camp'], ['market', 'obs'], ['farm', 'harbor'], ['camp', 'obs'], ['farm', 'light']];

const Terrain = {
  SIZE: CFG.WORLD_SIZE, HALF: CFG.WORLD_SIZE / 2, CELL: 4, N: CFG.WORLD_SIZE / 4 + 1,
  SEA: 0,
  h: null, col: null, nrm: null,
  pois: [], sites: [], roads: [],
  maxHeight: 0,
  MOUNTAIN: [-130, -150],
  LAKE: [-215, 45],

  generate(seed) {
    const T = this;
    const N = T.N, CELL = T.CELL, HALF = T.HALF;
    const nA = makeNoise2D(seed + 1), nB = makeNoise2D(seed + 2), nC = makeNoise2D(seed + 3), nD = makeNoise2D(seed + 4);
    const nE = makeNoise2D(seed + 5), nF = makeNoise2D(seed + 6), nG = makeNoise2D(seed + 7), nH = makeNoise2D(seed + 8);
    T._nG = nG; T._nH = nH; T._nE = nE;

    const raw = (x, z) => {
      const wx = x + 55 * nA(x * 0.0035 + 3.1, z * 0.0035 - 1.7);
      const wz = z + 55 * nA(x * 0.0035 - 8.3, z * 0.0035 + 5.2);
      const r = Math.hypot(wx, wz * 1.08) / 430;
      const ang = Math.atan2(wz, wx);
      const lobes = 0.07 * Math.sin(ang * 3 + 0.6) + 0.05 * Math.sin(ang * 5 + 2.1);
      const coast = r + lobes + 0.1 * fbm2(nB, x * 0.006, z * 0.006, 3);
      const sm = (0.93 - coast) * 430;                 // ~metres inland from the shoreline (negative = sea)
      if (sm <= 0) return -(2.4 * smoothstep(0, -30, sm) + 12.6 * smoothstep(-18, -120, sm));
      const big = fbm2(nC, x * 0.0022, z * 0.0022, 3) * 0.5 + 0.5;
      const mid = fbm2(nD, x * 0.007, z * 0.007, 4);
      const fine = fbm2(nE, x * 0.03, z * 0.03, 2);
      let hills = 4 + big * 13 + mid * 6 * (0.4 + big);
      const mx = x - T.MOUNTAIN[0], mz = z - T.MOUNTAIN[1];
      const me = Math.exp(-(mx * mx + mz * mz) / (2 * 100 * 100));
      const rg = ridged2(nF, x * 0.007, z * 0.007, 3);
      hills += Math.pow(me, 1.15) * (58 + rg * 56);
      const ex = x - 250, ez = z + 150;
      hills += Math.exp(-(ex * ex + ez * ez) / (2 * 75 * 75)) * 20;
      const ld = Math.hypot(x - T.LAKE[0], z - T.LAKE[1]);
      hills = lerp(hills, 3.1, smoothstep(155, 52, ld));   // broad lowland basin around the lake
      let h = 2.6 * smoothstep(0, 24, sm) + smoothstep(8, 120, sm) * (hills - 2.6) + fine * 0.8 * smoothstep(5, 40, sm);
      h = lerp(h, -5.5, smoothstep(54, 20, ld));
      return h;
    };
    T._raw = raw;

    const H = T.h = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = raw(i * CELL - HALF, j * CELL - HALF);

    // ---- points of interest
    const rng = makeRng(seed + 99);
    T.pois = [];
    for (const d of POI_DEFS) {
      let x, z;
      if (d.at) { x = d.at[0]; z = d.at[1]; }
      else {
        const l = Math.hypot(d.coast[0], d.coast[1]), dx = d.coast[0] / l, dz = d.coast[1] / l;
        let t = 150;
        while (t < 520 && raw(dx * t, dz * t) > 1.2) t += 2;
        t -= d.inland;
        x = dx * t; z = dz * t;
      }
      let sum = 0, cnt = 0;
      for (let a = 0; a < 16; a++) for (let q = 0; q < 3; q++) {
        const rr = d.r * (0.25 + q * 0.3), ang = a / 16 * TAU;
        sum += raw(x + Math.cos(ang) * rr, z + Math.sin(ang) * rr); cnt++;
      }
      const y = d.type === 'harbor' ? 2.5 : Math.max(3.4, sum / cnt);
      T.pois.push({ id: d.id, name: d.name, x, z, r: d.r, y, tier: d.tier, type: d.type, yaw: 0, falloff: d.falloff || 1.6 });
    }
    // orient coastal POIs toward the sea, the camp toward the lake, others toward the island centre
    for (const p of T.pois) {
      if (p.type === 'harbor' || p.type === 'lighthouse') p.yaw = Math.atan2(p.x, p.z);
      else if (p.type === 'camp') p.yaw = Math.atan2(T.LAKE[0] - p.x, T.LAKE[1] - p.z);
      else p.yaw = Math.atan2(-p.x, -p.z) + (rng() - 0.5) * 0.6;
    }
    for (const p of T.pois) T._flatten(p.x, p.z, p.r, p.y, p.falloff);

    // ---- minor sites (cabins, towers, campsites, small ruins)
    T.sites = [];
    const want = [['cabin', 10], ['tower', 6], ['campsite', 6], ['shrine', 4], ['bunker', 3]];
    for (const [type, count] of want) {
      let placed = 0, tries = 0;
      while (placed < count && tries++ < 4000) {
        const a = rng() * TAU, rad = 60 + rng() * 340;
        const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        const h0 = T.height(x, z);
        if (h0 < 4.5 || h0 > 64) continue;
        let ok = true, lo = h0, hi = h0;
        for (let k = 0; k < 8 && ok; k++) {
          const hh = T.height(x + Math.cos(k / 8 * TAU) * 9, z + Math.sin(k / 8 * TAU) * 9);
          lo = Math.min(lo, hh); hi = Math.max(hi, hh);
          if (hh < 3.2) ok = false;
        }
        if (!ok || hi - lo > 3.4) continue;
        for (const p of T.pois) if (dist2D(x, z, p.x, p.z) < p.r * 1.7 + 30) { ok = false; break; }
        if (!ok) continue;
        for (const s of T.sites) if (dist2D(x, z, s.x, s.z) < 78) { ok = false; break; }
        if (!ok) continue;
        const r = type === 'tower' ? 12.5 : type === 'bunker' ? 12 : 11;
        const site = { type, x, z, r, y: (lo + hi) / 2 + 0.2, yaw: rng() * TAU, tier: type === 'bunker' ? 2 : type === 'tower' ? 1 : 0 };
        T.sites.push(site);
        T._flatten(x, z, r, site.y, 1.9);
        placed++;
      }
    }

    // ---- roads between POIs (polyline segments with a little wobble)
    T.roads = [];
    const byId = {}; for (const p of T.pois) byId[p.id] = p;
    for (const [a, b] of ROAD_LINKS) {
      const A = byId[a], B = byId[b];
      const segs = Math.max(4, Math.round(dist2D(A.x, A.z, B.x, B.z) / 45));
      let px = A.x, pz = A.z;
      const nx = -(B.z - A.z), nz = B.x - A.x, nl = Math.hypot(nx, nz);
      for (let k = 1; k <= segs; k++) {
        const t = k / segs;
        const wob = Math.sin(t * Math.PI) * 26 * nA((A.x + B.x) * 0.01 + t * 2.2, (A.z + B.z) * 0.01);
        const x = lerp(A.x, B.x, t) + nx / nl * wob, z = lerp(A.z, B.z, t) + nz / nl * wob;
        T.roads.push([px, pz, x, z]);
        px = x; pz = z;
      }
    }
    T._buildRoadGrid();
    T._finalize();
  },

  _flatten(x, z, r, y, falloff) {
    const T = this, N = T.N, CELL = T.CELL, HALF = T.HALF, H = T.h;
    const R = r * falloff;
    const i0 = Math.max(0, Math.floor((x - R + HALF) / CELL)), i1 = Math.min(N - 1, Math.ceil((x + R + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((z - R + HALF) / CELL)), j1 = Math.min(N - 1, Math.ceil((z + R + HALF) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = dist2D(i * CELL - HALF, j * CELL - HALF, x, z);
      const w = smoothstep(R, r * 0.97, d);
      if (w > 0) H[j * N + i] = lerp(H[j * N + i], y, w);
    }
  },

  _buildRoadGrid() {
    // coarse grid of road segments for fast distance queries
    const T = this, G = 32, n = Math.ceil(T.SIZE / G);
    T._rg = { G, n, cells: new Array(n * n) };
    T.roads.forEach((s, idx) => {
      const minX = Math.min(s[0], s[2]) - 10, maxX = Math.max(s[0], s[2]) + 10, minZ = Math.min(s[1], s[3]) - 10, maxZ = Math.max(s[1], s[3]) + 10;
      for (let j = Math.max(0, Math.floor((minZ + T.HALF) / G)); j <= Math.min(n - 1, Math.floor((maxZ + T.HALF) / G)); j++)
        for (let i = Math.max(0, Math.floor((minX + T.HALF) / G)); i <= Math.min(n - 1, Math.floor((maxX + T.HALF) / G)); i++)
          (T._rg.cells[j * n + i] || (T._rg.cells[j * n + i] = [])).push(idx);
    });
  },
  // distance to the nearest road centre line (capped at 99)
  roadDist(x, z) {
    const T = this, rg = T._rg;
    const i = Math.floor((x + T.HALF) / rg.G), j = Math.floor((z + T.HALF) / rg.G);
    if (i < 0 || j < 0 || i >= rg.n || j >= rg.n) return 99;
    const list = rg.cells[j * rg.n + i];
    if (!list) return 99;
    let best = 99;
    for (const idx of list) {
      const s = T.roads[idx];
      const vx = s[2] - s[0], vz = s[3] - s[1];
      let t = ((x - s[0]) * vx + (z - s[1]) * vz) / (vx * vx + vz * vz || 1);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (s[0] + vx * t), z - (s[1] + vz * t));
      if (d < best) best = d;
    }
    return best;
  },

  _finalize() {
    const T = this, N = T.N, CELL = T.CELL, HALF = T.HALF, H = T.h;
    const nrm = T.nrm = new Float32Array(N * N * 3);
    const col = T.col = new Float32Array(N * N * 3);
    const tint = T.tint = new Float32Array(N * N * 3);
    let maxH = 0;
    const C = {
      seabed: hexLin(0x8f8a6a), wet: hexLin(0xb9a983), sand: hexLin(0xdccb9f),
      grassA: hexLin(0x86a548), grassB: hexLin(0x5f8c3d), dry: hexLin(0xb9a84e), forest: hexLin(0x4d6a35), moss: hexLin(0x6b6f3a),
      rockA: hexLin(0x807a72), rockB: hexLin(0x5f5a56), cliff: hexLin(0x6f6359), snow: hexLin(0xeef3f8), dirt: hexLin(0x8c7653), pave: hexLin(0x8f897c),
      alpine: hexLin(0x8a8f6a),
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const hl = H[j * N + Math.max(0, i - 1)], hr = H[j * N + Math.min(N - 1, i + 1)];
      const hd = H[Math.max(0, j - 1) * N + i], hu = H[Math.min(N - 1, j + 1) * N + i];
      let nx = (hl - hr), nz = (hd - hu), ny = 2 * CELL;
      const l = 1 / Math.hypot(nx, ny, nz); nx *= l; ny *= l; nz *= l;
      nrm[k * 3] = nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nz;
      const h = H[k]; if (h > maxH) maxH = h;
    }
    T.maxHeight = maxH;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, x = i * CELL - HALF, z = j * CELL - HALF, h = H[k];
      const slope = 1 - nrm[k * 3 + 1];
      const m = fbm2(T._nG, x * 0.011, z * 0.011, 3);          // moisture-ish
      const d2 = T._nE(x * 0.05, z * 0.05);                      // small variation
      const forest = T.forest(x, z);
      // ground-cover tint of the biome (what grows here, before sand / rock / paths are laid over it)
      let g = mixCol(C.grassA, C.grassB, clamp01(m * 0.7 + 0.5));
      g = mixCol(g, C.dry, smoothstep(0.15, 0.6, fbm2(T._nH, x * 0.004 + 40, z * 0.004 - 12, 2)) * 0.75);
      g = mixCol(g, C.forest, forest * 0.75);
      g = mixCol(g, C.alpine, smoothstep(48, 74, h) * 0.8);
      g = scaleCol(g, 1 + d2 * 0.07);
      tint[k * 3] = g[0] * 0.6 + 0.006; tint[k * 3 + 1] = g[1] * 0.56; tint[k * 3 + 2] = g[2] * 0.62;      // (the map keeps the brighter colours)
      let c;
      if (h < -0.4) c = mixCol(C.wet, C.seabed, smoothstep(-0.4, -5, h));
      else if (h < 2.3 + d2 * 0.4) c = mixCol(C.wet, C.sand, smoothstep(-0.2, 0.9, h));
      else c = mixCol(C.sand, g, smoothstep(2.3, 3.6, h + d2 * 0.4));
      if (h > 0.5) {
        const rk = smoothstep(0.1, 0.2, slope + d2 * 0.02);
        if (rk > 0) c = mixCol(c, mixCol(C.rockA, m > 0 ? C.rockB : C.cliff, clamp01(Math.abs(m) * 1.4)), rk);
      }
      const sn = smoothstep(70, 84, h + m * 7) * smoothstep(0.34, 0.16, slope);
      if (sn > 0) c = mixCol(c, C.snow, sn);
      // POI / site ground
      for (const p of T.pois) {
        const d = dist2D(x, z, p.x, p.z);
        if (d < p.r * 1.15) {
          const w = smoothstep(p.r * 1.12, p.r * 0.8, d) * (p.type === 'ruins' || p.type === 'camp' || p.type === 'lumber' ? 0.55 : 0.85);
          const ground = (p.type === 'town' || p.type === 'military' || p.type === 'harbor' || p.type === 'observatory') ? C.pave : C.dirt;
          c = mixCol(c, scaleCol(ground, 1 + d2 * 0.06), w * (0.75 + 0.25 * m));
        }
      }
      for (const s of T.sites) {
        const d = dist2D(x, z, s.x, s.z);
        if (d < s.r * 1.3) c = mixCol(c, C.dirt, smoothstep(s.r * 1.3, s.r * 0.5, d) * 0.7);
      }
      if (h > 0.6) {
        const rd = T.roadDist(x, z);
        if (rd < 7) c = mixCol(c, scaleCol(C.dirt, 0.92 + d2 * 0.08), smoothstep(6.5, 2.2, rd) * 0.9);
      }
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    }
  },

  // Forest density 0..1 (before exclusions)
  forest(x, z) {
    const n = fbm2(this._nH, x * 0.0062, z * 0.0062, 3);
    return smoothstep(-0.12, 0.3, n);
  },

  // Exact height of the rendered terrain triangle under (x, z)
  height(x, z) {
    const N = this.N;
    let fx = (x + this.HALF) / this.CELL, fz = (z + this.HALF) / this.CELL;
    if (fx < 0) fx = 0; else if (fx > N - 1.001) fx = N - 1.001;
    if (fz < 0) fz = 0; else if (fz > N - 1.001) fz = N - 1.001;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * N + i, H = this.h;
    const ha = H[k], hb = H[k + 1], hd = H[k + N], hc = H[k + N + 1];
    return u >= v ? ha + (hb - ha) * u + (hc - hb) * v : ha + (hd - ha) * v + (hc - hd) * u;
  },
  // Geometric normal of the triangle under (x, z)
  normal(x, z, out) {
    const N = this.N, C = this.CELL;
    let fx = (x + this.HALF) / C, fz = (z + this.HALF) / C;
    if (fx < 0) fx = 0; else if (fx > N - 1.001) fx = N - 1.001;
    if (fz < 0) fz = 0; else if (fz > N - 1.001) fz = N - 1.001;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * N + i, H = this.h;
    const ha = H[k], hb = H[k + 1], hd = H[k + N], hc = H[k + N + 1];
    let dhx, dhz;
    if (u >= v) { dhx = hb - ha; dhz = hc - hb; } else { dhx = hc - hd; dhz = hd - ha; }
    const l = 1 / Math.hypot(dhx, C, dhz);
    out[0] = -dhx * l; out[1] = C * l; out[2] = -dhz * l;
    return out;
  },
  // max height difference per metre around a point (cheap steepness estimate)
  steepness(x, z) {
    const C = this.CELL, N = this.N;
    let fx = (x + this.HALF) / C, fz = (z + this.HALF) / C;
    if (fx < 0) fx = 0; else if (fx > N - 1.001) fx = N - 1.001;
    if (fz < 0) fz = 0; else if (fz > N - 1.001) fz = N - 1.001;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * N + i, H = this.h;
    const ha = H[k], hb = H[k + 1], hd = H[k + N], hc = H[k + N + 1];
    let dhx, dhz;
    if (u >= v) { dhx = hb - ha; dhz = hc - hb; } else { dhx = hc - hd; dhz = hd - ha; }
    return Math.hypot(dhx, dhz) / C;
  },
  colorAt(x, z, out) {
    const N = this.N;
    let fx = (x + this.HALF) / this.CELL, fz = (z + this.HALF) / this.CELL;
    if (fx < 0) fx = 0; else if (fx > N - 1.001) fx = N - 1.001;
    if (fz < 0) fz = 0; else if (fz > N - 1.001) fz = N - 1.001;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = (j * N + i) * 3, c = this.col, r = N * 3;
    for (let q = 0; q < 3; q++) out[q] = (c[k + q] * (1 - u) + c[k + 3 + q] * u) * (1 - v) + (c[k + r + q] * (1 - u) + c[k + r + 3 + q] * u) * v;
    return out;
  },
  tintAt(x, z, out) {
    const N = this.N;
    let fx = (x + this.HALF) / this.CELL, fz = (z + this.HALF) / this.CELL;
    if (fx < 0) fx = 0; else if (fx > N - 1.001) fx = N - 1.001;
    if (fz < 0) fz = 0; else if (fz > N - 1.001) fz = N - 1.001;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = (j * N + i) * 3, c = this.tint, r = N * 3;
    for (let q = 0; q < 3; q++) out[q] = (c[k + q] * (1 - u) + c[k + 3 + q] * u) * (1 - v) + (c[k + r + q] * (1 - u) + c[k + r + 3 + q] * u) * v;
    return out;
  },

  // ---- ground control map, one texel per metre: r = bare earth (paths, yards), g = paving (level = kind), b = baked lamp light,
  //      a = openness (darkened under trees and against walls). Built once the world is populated.
  CTL: 1024, ctl: null,
  buildControl() {
    const T = this, R = T.CTL, ctl = T.ctl = new Uint8Array(R * R * 4), K = R / T.SIZE, HALF = T.HALF;
    for (let i = 3; i < ctl.length; i += 4) ctl[i] = 255;
    // visit every texel within `rad` metres of (x, z): fn(index, distance)
    const disc = (x, z, rad, fn) => {
      const i0 = Math.max(0, Math.floor((x - rad + HALF) * K)), i1 = Math.min(R - 1, Math.ceil((x + rad + HALF) * K));
      const j0 = Math.max(0, Math.floor((z - rad + HALF) * K)), j1 = Math.min(R - 1, Math.ceil((z + rad + HALF) * K));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = Math.hypot((i + 0.5) / K - HALF - x, (j + 0.5) / K - HALF - z);
        if (d < rad) fn((j * R + i) * 4, d);
      }
    };
    const put = (o, v) => { v = v * 255; if (v > ctl[o]) ctl[o] = v; };
    const PAVED = { town: 0.4, military: 0.92, harbor: 0.86, observatory: 0.62 };
    for (const p of T.pois) {
      const soft = p.type === 'ruins' || p.type === 'camp' || p.type === 'lumber' ? 0.34 : 0.43;      // worn in patches, not stripped bare
      disc(p.x, p.z, p.r * 1.14, (o, d) => put(o, smoothstep(p.r * 1.12, p.r * 0.8, d) * soft));
      const pv = PAVED[p.type];
      // the level says which paving: cobbles (town) reach 1, concrete slabs stay at 0.76 (see terrainFS)
      if (pv) { const lvl = p.type === 'town' ? 1 : 0.76; disc(p.x, p.z, p.r * pv, (o, d) => put(o + 1, smoothstep(p.r * pv, p.r * pv * 0.78, d) * lvl)); }
    }
    for (const s of T.sites) disc(s.x, s.z, s.r * 1.3, (o, d) => put(o, smoothstep(s.r * 1.3, s.r * 0.5, d) * 0.55));
    for (const s of T.roads) {
      const vx = s[2] - s[0], vz = s[3] - s[1], len = Math.hypot(vx, vz) || 1;
      disc((s[0] + s[2]) / 2, (s[1] + s[3]) / 2, len / 2 + 7.5, (o) => {
        const x = ((o / 4) % R + 0.5) / K - HALF, z = (Math.floor(o / 4 / R) + 0.5) / K - HALF;
        let t = ((x - s[0]) * vx + (z - s[1]) * vz) / (len * len);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const rd = Math.hypot(x - (s[0] + vx * t), z - (s[1] + vz * t));
        if (rd < 7) put(o, smoothstep(6.6, 2.4, rd) * 0.95);
      });
    }
    if (typeof World === 'undefined') return;
    // buildings: no growth on the floor, and a soft dark skirt around the walls
    for (const f of World.footprints) {
      const c = Math.cos(f.yaw), s = Math.sin(f.yaw), hw = f.w / 2, hd = f.d / 2, reach = Math.hypot(hw, hd) + 2.5;
      disc(f.x, f.z, reach, (o) => {
        const x = ((o / 4) % R + 0.5) / K - HALF - f.x, z = (Math.floor(o / 4 / R) + 0.5) / K - HALF - f.z;
        const lx = Math.abs(x * c - z * s) - hw, lz = Math.abs(x * s + z * c) - hd, out = Math.max(lx, lz);
        if (out < 0.6) put(o, 1); else if (out < 3.4) put(o, 0.8 * (1 - (out - 0.6) / 2.8));          // trodden yard around the walls
        if (out < 2.4) { const a = (out < 0 ? 0.5 : 0.5 + 0.5 * out / 2.4) * 255; if (a < ctl[o + 3]) ctl[o + 3] = a; }
      });
    }
    for (let i = 0; i < World.treeCount; i++) {
      const q = i * 8, type = World.trees[q + 7], sc = World.trees[q + 3];
      if (type === 4) continue;
      const rad = (type === 5 ? 1.5 : type === 0 ? 3.1 : 3.9) * sc, dark = type === 5 ? 0.22 : 0.36;
      disc(World.trees[q], World.trees[q + 2], rad, (o, d) => { const k = 1 - d / rad; ctl[o + 3] *= 1 - dark * k * (2 - k); });
    }
    for (let i = 0; i < World.rockCount; i++) {
      const q = i * 8, sc = World.rocks[q + 3];
      if (sc < 0.9) continue;
      disc(World.rocks[q], World.rocks[q + 2], sc * 1.5, (o, d) => { const k = 1 - d / (sc * 1.5); ctl[o + 3] *= 1 - 0.4 * k; });
    }
    for (const l of (World.lamps || [])) {
      if (!l.baked) continue;
      disc(l.x, l.z, l.r, (o, d) => { const k = 1 - (d * d) / (l.r * l.r); put(o + 2, k * k * l.k); });
    }
  },
  // nearest texel of the control map: how bare the ground is at (x, z), 0 = growth .. 1 = earth or paving
  bareAt(x, z) {
    const R = this.CTL, K = R / this.SIZE;
    const i = clamp(Math.floor((x + this.HALF) * K), 0, R - 1), j = clamp(Math.floor((z + this.HALF) * K), 0, R - 1), o = (j * R + i) * 4;
    return Math.max(this.ctl[o], this.ctl[o + 1]) / 255;
  },
  lampAt(x, z) {
    const R = this.CTL, K = R / this.SIZE;
    const i = clamp(Math.floor((x + this.HALF) * K), 0, R - 1), j = clamp(Math.floor((z + this.HALF) * K), 0, R - 1);
    return this.ctl[(j * R + i) * 4 + 2] / 255;
  },

  // Multiply the vertex colours around (x, z) — used for fake ambient occlusion under trees / buildings.
  darken(x, z, radius, amount) {
    const N = this.N, C = this.CELL, HALF = this.HALF, col = this.col;
    const i0 = Math.max(0, Math.floor((x - radius + HALF) / C)), i1 = Math.min(N - 1, Math.ceil((x + radius + HALF) / C));
    const j0 = Math.max(0, Math.floor((z - radius + HALF) / C)), j1 = Math.min(N - 1, Math.ceil((z + radius + HALF) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = dist2D(i * C - HALF, j * C - HALF, x, z);
      if (d >= radius) continue;
      const f = 1 - amount * (1 - d / radius), k = (j * N + i) * 3;
      col[k] *= f; col[k + 1] *= f; col[k + 2] *= f;
    }
  },
  poiAt(x, z, margin) {
    for (const p of this.pois) if (dist2D(x, z, p.x, p.z) < p.r + (margin || 0)) return p;
    return null;
  },
  siteAt(x, z, margin) {
    for (const s of this.sites) if (dist2D(x, z, s.x, s.z) < s.r + (margin || 0)) return s;
    return null;
  },
  inBounds(x, z, margin) { const m = this.HALF - (margin || 0); return x > -m && x < m && z > -m && z < m; },

  // Render data: shared vertex arrays + per-chunk index ranges.
  buildMesh() {
    const T = this, N = T.N, CELL = T.CELL, HALF = T.HALF;
    const positions = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 3;
      positions[k] = i * CELL - HALF; positions[k + 1] = T.h[j * N + i]; positions[k + 2] = j * CELL - HALF;
    }
    const CH = 32, nc = (N - 1) / CH;
    const indices = new Uint32Array((N - 1) * (N - 1) * 6);
    const chunks = [];
    let o = 0;
    for (let cj = 0; cj < nc; cj++) for (let ci = 0; ci < nc; ci++) {
      const start = o;
      let lo = Infinity, hi = -Infinity;
      for (let j = cj * CH; j < (cj + 1) * CH; j++) for (let i = ci * CH; i < (ci + 1) * CH; i++) {
        const a = j * N + i, b = a + 1, d = a + N, c = d + 1;
        indices[o++] = a; indices[o++] = d; indices[o++] = c;
        indices[o++] = a; indices[o++] = c; indices[o++] = b;
      }
      for (let j = cj * CH; j <= (cj + 1) * CH; j++) for (let i = ci * CH; i <= (ci + 1) * CH; i++) { const h = T.h[j * N + i]; if (h < lo) lo = h; if (h > hi) hi = h; }
      const size = CH * CELL;
      const cx = ci * size - HALF + size / 2, cz = cj * size - HALF + size / 2;
      chunks.push({ start, count: o - start, cx, cy: (lo + hi) / 2, cz, radius: Math.hypot(size / 2, size / 2, (hi - lo) / 2), maxY: hi });
    }
    return { positions, normals: T.nrm, colors: T.tint, indices, chunks };
  },
};
