// AURORA FALL — procedural material textures, generated on the CPU at load time (no image files, no DOM dependencies)
'use strict';

// One layer of the material texture array per entry.
//   tile : metres covered by one repeat (mesh UVs are metres / tile)
//   spec : strength of the sun highlight, gloss : how tight it is (0..1)
// Opaque layers store  R = brightness detail (0.5 = neutral), G/B = tangent-space normal xy, A = how much of the surface
// colour shows (1) versus a neutral grey such as mortar or lichen (0).
// Foliage layers (leaf*) store  R = brightness, G = hue shift, B = inner shade, A = coverage.
const MATERIALS = [
  { name: 'grass', tile: 3.2, spec: 0.05, gloss: 0.2 },
  { name: 'dirt', tile: 2.6, spec: 0.03, gloss: 0.15 },
  { name: 'rock', tile: 5.0, spec: 0.1, gloss: 0.3 },
  { name: 'sand', tile: 2.4, spec: 0.07, gloss: 0.25 },
  { name: 'snow', tile: 4.0, spec: 0.3, gloss: 0.5 },
  { name: 'cobble', tile: 2.4, spec: 0.12, gloss: 0.35 },
  { name: 'plaster', tile: 2.2, spec: 0.03, gloss: 0.15 },
  { name: 'planks', tile: 1.6, spec: 0.08, gloss: 0.3 },
  { name: 'brick', tile: 1.0, spec: 0.05, gloss: 0.2 },
  { name: 'stone', tile: 2.0, spec: 0.07, gloss: 0.25 },
  { name: 'shingle', tile: 1.2, spec: 0.12, gloss: 0.35 },
  { name: 'corrug', tile: 1.0, spec: 0.45, gloss: 0.6 },
  { name: 'concrete', tile: 3.0, spec: 0.05, gloss: 0.25 },
  { name: 'fabric', tile: 0.5, spec: 0.03, gloss: 0.1 },
  { name: 'bark', tile: 1.2, spec: 0.03, gloss: 0.15 },
  { name: 'birch', tile: 1.0, spec: 0.07, gloss: 0.25 },
  { name: 'metal', tile: 2.0, spec: 0.55, gloss: 0.65 },
  { name: 'ribbed', tile: 1.2, spec: 0.35, gloss: 0.55 },
  { name: 'hay', tile: 1.0, spec: 0.06, gloss: 0.2 },
  { name: 'leafA', tile: 1.0, spec: 0.1, gloss: 0.35 },      // broadleaf spray
  { name: 'leafB', tile: 1.0, spec: 0.1, gloss: 0.35 },      // conifer bough
  { name: 'leafC', tile: 1.0, spec: 0.1, gloss: 0.35 },      // fern / reed fan
  { name: 'leafD', tile: 1.0, spec: 0.1, gloss: 0.35 },      // whole conifer seen from the side
  { name: 'water', tile: 1.0, spec: 0.9, gloss: 0.9 },       // ripple normals (g/b), r: foam breakup
];
const MAT = {};
MATERIALS.forEach((m, i) => { MAT[m.name] = i; });
const MAT_GLASS = 30;       // not a texture layer: marks window panes for the shader

const TexGen = (function () {
  let N = 512, M = 511;
  const sm = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

  // ---- tileable value noise with a lattice of fx by fy cells across the texture, accumulated into out
  function addNoise(out, seed, fx, fy, amp) {
    const rng = makeRng((seed * 7919 + fx * 131 + fy * 17) | 0);
    const L = new Float32Array(fx * fy);
    for (let i = 0; i < L.length; i++) L[i] = rng();
    const x0 = new Int32Array(N), x1 = new Int32Array(N), wx = new Float32Array(N);
    for (let x = 0; x < N; x++) { const f = x * fx / N, i = Math.floor(f), t = f - i; x0[x] = i % fx; x1[x] = (i + 1) % fx; wx[x] = t * t * t * (t * (t * 6 - 15) + 10); }
    for (let y = 0; y < N; y++) {
      const f = y * fy / N, j = Math.floor(f), t = f - j, wy = t * t * t * (t * (t * 6 - 15) + 10);
      const r0 = (j % fy) * fx, r1 = ((j + 1) % fy) * fx, o = y * N;
      for (let x = 0; x < N; x++) {
        const a = L[r0 + x0[x]], b = L[r0 + x1[x]], c = L[r1 + x0[x]], d = L[r1 + x1[x]], w = wx[x];
        out[o + x] += amp * ((a + (b - a) * w) * (1 - wy) + (c + (d - c) * w) * wy);
      }
    }
  }
  // fractal sum, stretched so the result fills roughly 0..1 around 0.5
  function fbm(seed, fx, fy, oct, gain) {
    const out = new Float32Array(N * N);
    let amp = 1, tot = 0, sq = 0;
    for (let o = 0; o < oct; o++) {
      if (fx > N / 2 || fy > N / 2) break;
      addNoise(out, seed + o * 17, fx, fy, amp); tot += amp; sq += amp * amp; amp *= gain || 0.5; fx *= 2; fy *= 2;
    }
    const k = 0.5 / (Math.sqrt(sq) / tot * 0.87);       // value noise has a narrow spread: widen it
    for (let i = 0; i < out.length; i++) { const v = (out[i] / tot - 0.5) * k + 0.5; out[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
    return out;
  }
  function ridged(seed, fx, fy, oct) {
    const out = new Float32Array(N * N), tmp = new Float32Array(N * N);
    let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      if (fx > N / 2 || fy > N / 2) break;
      tmp.fill(0); addNoise(tmp, seed + o * 31, fx, fy, 1);
      for (let i = 0; i < out.length; i++) { const r = 1 - Math.abs(tmp[i] * 2 - 1); out[i] += amp * r * r; }
      tot += amp; amp *= 0.5; fx *= 2; fy *= 2;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }
  // tileable cellular noise: f1 = distance to the nearest point (in cells), edge = f2 - f1, id = random value of the nearest cell
  function worley(seed, cells) {
    const rng = makeRng((seed * 104729 + cells) | 0);
    const px = new Float32Array(cells * cells), py = new Float32Array(cells * cells), pid = new Float32Array(cells * cells);
    for (let i = 0; i < px.length; i++) { px[i] = rng(); py[i] = rng(); pid[i] = rng(); }
    const f1 = new Float32Array(N * N), edge = new Float32Array(N * N), id = new Float32Array(N * N);
    const k = cells / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x * k, fy = y * k, cx = Math.floor(fx), cy = Math.floor(fy);
      let d1 = 9, d2 = 9, bi = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gy = cy + j, c = ((gy + cells) % cells) * cells + (gx + cells) % cells;
        const dx = gx + px[c] - fx, dy = gy + py[c] - fy, d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; bi = c; } else if (d < d2) d2 = d;
      }
      d1 = Math.sqrt(d1); d2 = Math.sqrt(d2);
      const o = y * N + x;
      f1[o] = d1; edge[o] = d2 - d1; id[o] = pid[bi];
    }
    return { f1, edge, id };
  }

  // ---- working buffers shared by the material recipes
  let lum, hgt, sat, out8, shared;
  function pack(layer, strength) {
    const o0 = layer * N * N * 4, k = strength * N / 512;
    for (let y = 0; y < N; y++) {
      const ym = ((y - 1) & M) * N, yp = ((y + 1) & M) * N, yo = y * N;
      for (let x = 0; x < N; x++) {
        let nx = (hgt[yo + ((x - 1) & M)] - hgt[yo + ((x + 1) & M)]) * k, ny = (hgt[ym + x] - hgt[yp + x]) * k;
        const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        nx *= l; ny *= l;
        const o = o0 + (yo + x) * 4;
        let v = lum[yo + x]; v = v < 0 ? 0 : v > 1 ? 1 : v;
        let s = sat[yo + x]; s = s < 0 ? 0 : s > 1 ? 1 : s;
        out8[o] = v * 255 + 0.5; out8[o + 1] = (nx * 0.5 + 0.5) * 255 + 0.5; out8[o + 2] = (ny * 0.5 + 0.5) * 255 + 0.5; out8[o + 3] = s * 255 + 0.5;
      }
    }
  }
  // anisotropic sampling of a shared field with integer frequency multipliers (stays tileable)
  const at = (f, x, y, mx, my) => f[(((y * my) | 0) & M) * N + (((x * mx) | 0) & M)];

  const RECIPES = {
    grass(S) {
      const a = S.fine, b = S.mid, c = S.big, w = S.wSmall;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const blades = at(S.streakV, x, y, 1, 2) * 0.5 + at(S.grainH, x, y, 2, 1) * 0.5;      // crossed fibres: no grain direction
        const tuft = 0.5 - at(w.f1, x, y, 1, 1);
        const speck = sm(0.2, 0.05, at(w.f1, x, y, 2, 2)) * sm(0.55, 0.8, at(w.id, x, y, 2, 2));   // little bare-soil specks
        lum[i] = 0.5 + (a[i] - 0.5) * 0.24 + (b[i] - 0.5) * 0.3 + (blades - 0.5) * 0.22 + tuft * 0.14 - speck * 0.16;
        hgt[i] = a[i] * 0.4 + blades * 0.45 + b[i] * 0.4 + tuft * 0.5 - speck * 0.4;
        sat[i] = sm(0.3, 0.72, c[i] + (b[i] - 0.5) * 0.4);                // 1 = lush, 0 = dry patches
      }
      return 1.5;
    },
    dirt(S) {
      const w = S.wPebble, b = S.mid, a = S.fine, c = S.big;
      for (let i = 0; i < N * N; i++) {
        const peb = sm(0.16 + w.id[i] * 0.22, 0.06 + w.id[i] * 0.1, w.f1[i]) * sm(0.62, 0.74, w.id[i] * 0.55 + b[i] * 0.6);    // a few pebbles of mixed size
        const clod = sm(0.45, 0.65, at(b, i % N, (i / N) | 0, 2, 2));
        lum[i] = 0.5 + (b[i] - 0.5) * 0.34 + (a[i] - 0.5) * 0.2 + clod * 0.05 + peb * (0.1 + (w.id[i] - 0.5) * 0.2);
        hgt[i] = b[i] * 0.6 + a[i] * 0.3 + clod * 0.25 + peb * 0.9;
        sat[i] = 1 - peb * 0.75 - sm(0.6, 0.8, c[i]) * 0.2;
      }
      return 2.2;
    },
    rock(S) {
      const r = S.ridge, b = S.mid, c = S.big, a = S.fine, rv = S.ridgeV;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const warp = (c[i] - 0.5) * 70 + (b[i] - 0.5) * 18;
        const strata = 0.5 + 0.5 * Math.sin((y + warp) * (Math.PI * 2 * 7 / N));
        const facet = at(r, x, y, 2, 2);                                     // smaller broken faces on top of the big ones
        // fissures follow the contour lines of the noise: long, wandering, never a regular net
        const fis = sm(0.035, 0.0, Math.abs(c[i] - 0.52)) * sm(0.4, 0.6, b[i]) + sm(0.02, 0.0, Math.abs(at(b, x, y, 1, 1) - 0.47)) * sm(0.5, 0.7, at(rv, y, x, 1, 1)) * 0.7;
        lum[i] = 0.5 + (r[i] - 0.45) * 0.36 + (facet - 0.45) * 0.14 + (strata - 0.5) * 0.14 + (a[i] - 0.5) * 0.18 - fis * 0.28;
        hgt[i] = r[i] * 0.9 + facet * 0.3 + strata * 0.22 + a[i] * 0.14 - fis * 0.8;
        sat[i] = 1 - sm(0.56, 0.78, at(c, x + 131, y + 57, 1, 1) + (a[i] - 0.5) * 0.3) * 0.9;     // lichen / weathered patches
      }
      return 2.6;
    },
    sand(S) {
      const a = S.fine, b = S.mid, c = S.big;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const ph = (y + (c[i] - 0.5) * 70 + (b[i] - 0.5) * 22) * (Math.PI * 2 * 12 / N);
        const rip = 0.5 + 0.5 * Math.sin(ph + 0.6 * Math.sin(ph));
        const grain = at(a, x, y, 2, 2);
        lum[i] = 0.5 + (rip - 0.5) * 0.1 + (grain - 0.5) * 0.2 + (b[i] - 0.5) * 0.1;
        hgt[i] = rip * 0.55 + grain * 0.12 + b[i] * 0.2;
        sat[i] = 1 - sm(0.62, 0.85, at(S.wSmall.id, x, y, 2, 2)) * sm(0.22, 0.1, at(S.wSmall.f1, x, y, 2, 2)) * 0.8;   // shell / grit specks
      }
      return 1.3;
    },
    snow(S) {
      const b = S.mid, c = S.big, a = S.fine;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const sparkle = sm(0.93, 0.99, at(a, x, y, 3, 3)) * 0.35;
        lum[i] = 0.5 + (c[i] - 0.5) * 0.12 + (b[i] - 0.5) * 0.1 + sparkle;
        hgt[i] = c[i] * 0.8 + b[i] * 0.35 + a[i] * 0.05;
        sat[i] = 1;
      }
      return 1.1;
    },
    cobble(S) {
      const w = S.wCobble, a = S.fine, b = S.mid;
      for (let i = 0; i < N * N; i++) {
        const body = sm(0.02, 0.16, w.edge[i]);
        const dome = body * (1 - Math.min(1, w.f1[i] * w.f1[i] * 1.6) * 0.5);
        lum[i] = 0.5 + (w.id[i] - 0.5) * 0.3 * body + (a[i] - 0.5) * 0.18 + (b[i] - 0.5) * 0.1 - (1 - body) * 0.2;
        hgt[i] = dome + a[i] * 0.08;
        sat[i] = body * (0.75 + w.id[i] * 0.25);
      }
      return 3.2;
    },
    plaster(S) {
      const a = S.fine, b = S.mid, c = S.big, w = S.wCrack, v = S.dripV;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const crack = sm(0.022, 0.0, w.edge[i]) * sm(0.6, 0.8, c[i]);
        const stain = sm(0.55, 0.9, v[i]) * sm(0.4, 0.7, b[i]);
        const patch = sm(0.74, 0.8, at(c, x, y, 2, 2) + (a[i] - 0.5) * 0.1);       // flaked patch showing the base coat
        lum[i] = 0.5 + (at(a, x, y, 2, 2) - 0.5) * 0.14 + (b[i] - 0.5) * 0.12 - crack * 0.35 - stain * 0.12 - patch * 0.1;
        hgt[i] = at(a, x, y, 2, 2) * 0.4 + b[i] * 0.3 - crack * 0.8 - patch * 0.35;
        sat[i] = 1 - stain * 0.35 - patch * 0.55;
      }
      return 1.0;
    },
    planks(S) {
      const ROWS = 8, rh = N / ROWS, rng = makeRng(771);
      const tone = [], joint = [];
      for (let r = 0; r < ROWS; r++) { tone.push(rng()); joint.push([rng() * N, rng() * N]); }
      const g = S.grainH, a = S.fine, b = S.mid;
      for (let y = 0; y < N; y++) {
        const r = Math.floor(y / rh), fy = (y - r * rh) / rh;
        const gap = sm(0.07, 0.0, Math.min(fy, 1 - fy));
        for (let x = 0; x < N; x++) {
          const i = y * N + x;
          let dj = 1e9;
          for (const j of joint[r]) { let d = Math.abs(x - j); if (d > N / 2) d = N - d; if (d < dj) dj = d; }
          const end = sm(2.6, 0.6, dj);
          const grain = g[(((y + r * 37) & M) * N) + ((x + r * 113) & M)];
          const knot = sm(0.86, 0.95, b[((y + r * 91) & M) * N + ((x * 2 + r * 57) & M)]);
          const groove = Math.max(gap, end);
          lum[i] = 0.5 + (tone[r] - 0.5) * 0.22 + (grain - 0.5) * 0.26 + (a[i] - 0.5) * 0.08 - knot * 0.18 - groove * 0.27;
          hgt[i] = 0.6 + (grain - 0.5) * 0.25 - groove * 1.0 + (tone[r] - 0.5) * 0.15;
          sat[i] = 1 - groove * 0.5 - sm(0.7, 0.95, grain) * 0.15;
        }
      }
      return 2.0;
    },
    brick(S) {
      const COLS = 4, ROWS = 12, bw = N / COLS, bh = N / ROWS, rng = makeRng(332);
      const tone = new Float32Array(COLS * ROWS);
      for (let i = 0; i < tone.length; i++) tone[i] = rng();
      const a = S.fine, b = S.mid;
      for (let y = 0; y < N; y++) {
        const r = Math.floor(y / bh), fy = (y - r * bh) / bh;
        for (let x = 0; x < N; x++) {
          const i = y * N + x, xo = (x + (r & 1) * bw * 0.5 + (b[i] - 0.5) * 1.5) % N;
          const cix = Math.floor(xo / bw) % COLS, fx = (xo - Math.floor(xo / bw) * bw) / bw;
          const ex = Math.min(fx, 1 - fx) * bw, ey = Math.min(fy, 1 - fy) * bh;
          const mortar = sm(3.6, 1.6, Math.min(ex, ey) + (a[i] - 0.5) * 2.2);
          const t = tone[r * COLS + cix];
          const pit = sm(0.8, 0.95, at(a, x, y, 2, 2)) * (1 - mortar);
          lum[i] = (1 - mortar) * (0.48 + (t - 0.5) * 0.34 + (a[i] - 0.5) * 0.14 - pit * 0.12 + (b[i] - 0.5) * 0.1) + mortar * (0.6 + (a[i] - 0.5) * 0.12);
          hgt[i] = (1 - mortar) * (0.85 + (a[i] - 0.5) * 0.12 - pit * 0.2) + mortar * 0.25;
          sat[i] = 1 - mortar * 0.92;
        }
      }
      return 2.4;
    },
    stone(S) {
      const ROWS = 5, rh = N / ROWS, rng = makeRng(9041);
      const rows = [];
      for (let r = 0; r < ROWS; r++) {
        const cuts = [], n = 3 + Math.floor(rng() * 3);
        let p = rng() * N;
        for (let k = 0; k < n; k++) { cuts.push({ x: p % N, t: rng() }); p += N / n * (0.7 + rng() * 0.6); }
        rows.push(cuts.sort((u, v) => u.x - v.x));
      }
      const a = S.fine, b = S.mid, c = S.big, rd = S.ridge;
      for (let y = 0; y < N; y++) {
        const r = Math.floor(y / rh), fy = (y - r * rh) / rh, cuts = rows[r];
        for (let x = 0; x < N; x++) {
          const i = y * N + x, wob = (b[i] - 0.5) * 5;
          let k = cuts.length - 1, dj = 1e9;
          for (let q = 0; q < cuts.length; q++) { if (cuts[q].x <= x) k = q; let d = Math.abs(x - cuts[q].x + wob); if (d > N / 2) d = N - d; if (d < dj) dj = d; }
          const ey = Math.min(fy, 1 - fy) * rh + wob * 0.6;
          const mortar = sm(4.2, 1.4, Math.min(dj, ey) + (a[i] - 0.5) * 3);
          const t = cuts[k].t;
          lum[i] = (1 - mortar) * (0.5 + (t - 0.5) * 0.26 + (rd[i] - 0.45) * 0.2 + (a[i] - 0.5) * 0.14) + mortar * 0.34;
          hgt[i] = (1 - mortar) * (0.75 + rd[i] * 0.25 + (t - 0.5) * 0.2) + mortar * 0.1;
          sat[i] = 1 - mortar * 0.5 - sm(0.6, 0.85, c[i]) * 0.45 * (1 - mortar);     // moss / lichen
        }
      }
      return 2.8;
    },
    shingle(S) {
      const COLS = 6, ROWS = 6, cw = N / COLS, rh = N / ROWS, rng = makeRng(5150);
      const tone = new Float32Array(COLS * ROWS);
      for (let i = 0; i < tone.length; i++) tone[i] = rng();
      const a = S.fine, b = S.mid;
      for (let y = 0; y < N; y++) {
        const r = Math.floor(y / rh), fy = (y - r * rh) / rh;
        for (let x = 0; x < N; x++) {
          const i = y * N + x, xo = (x + (r & 1) * cw * 0.5 + r * 7) % N;
          const cix = Math.floor(xo / cw) % COLS, fx = (xo - Math.floor(xo / cw) * cw) / cw;
          const t = tone[r * COLS + cix];
          const side = sm(0.045, 0.0, Math.min(fx, 1 - fx));
          const lip = sm(0.16, 0.0, fy + (t - 0.5) * 0.06);                 // exposed lower edge of the tile
          const under = sm(0.72, 1.0, fy);                                  // tucked under the row above
          lum[i] = 0.5 + (t - 0.5) * 0.3 + (a[i] - 0.5) * 0.14 + (b[i] - 0.5) * 0.1 + lip * 0.07 - under * 0.2 - side * 0.3;
          hgt[i] = 1 - fy * 0.75 - side * 0.5 + (t - 0.5) * 0.12 + (a[i] - 0.5) * 0.06;
          sat[i] = 1 - side * 0.4 - sm(0.7, 0.9, at(b, x, y, 2, 2)) * 0.3;
        }
      }
      return 2.6;
    },
    corrug(S) {
      const a = S.fine, v = S.dripV, c = S.big;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const wave = 0.5 + 0.5 * Math.cos(x * (Math.PI * 2 * 10 / N));
        const rust = sm(0.6, 0.86, v[i] * 0.6 + c[i] * 0.5);
        const seam = sm(2.5, 0.5, Math.abs(((y + N / 4) % (N / 2)) - 1.5));
        lum[i] = 0.5 + (wave - 0.5) * 0.16 + (a[i] - 0.5) * 0.08 - rust * 0.16 - seam * 0.22;
        hgt[i] = wave - seam * 0.3;
        sat[i] = 1 - rust * 0.7;
      }
      return 3.0;
    },
    concrete(S) {
      const a = S.fine, b = S.mid, c = S.big, w = S.wSmall, v = S.dripV;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const pit = sm(0.16, 0.05, at(w.f1, x, y, 2, 2)) * sm(0.55, 0.75, at(w.id, x, y, 2, 2));
        const sx = Math.abs((x % (N / 2)) - 2), sy = Math.abs((y % (N / 2)) - 2);
        const seam = sm(3.0, 0.8, Math.min(sx, sy));
        const hole = sm(5.0, 3.0, Math.hypot((x % (N / 2)) - N / 8, (y % (N / 2)) - N / 8));
        const stain = sm(0.5, 0.9, v[i]) * sm(0.3, 0.7, c[i]);
        lum[i] = 0.5 + (c[i] - 0.5) * 0.14 + (b[i] - 0.5) * 0.12 + (a[i] - 0.5) * 0.1 - pit * 0.22 - seam * 0.2 - hole * 0.3 - stain * 0.12;
        hgt[i] = 0.6 + (a[i] - 0.5) * 0.1 - pit * 0.6 - seam * 0.7 - hole * 0.9;
        sat[i] = 1 - stain * 0.4;
      }
      return 1.4;
    },
    fabric(S) {
      const a = S.fine, c = S.big, b = S.mid;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const wx = Math.sin(x * (Math.PI * 2 * 48 / N)), wy = Math.sin(y * (Math.PI * 2 * 48 / N));
        const weave = wx * wy;
        lum[i] = 0.5 + weave * 0.022 + (a[i] - 0.5) * 0.09 + (c[i] - 0.5) * 0.14 + (b[i] - 0.5) * 0.06;
        hgt[i] = 0.5 + weave * 0.05 + (c[i] - 0.5) * 1.5 + (b[i] - 0.5) * 0.7;
        sat[i] = 1;
      }
      return 1.6;
    },
    bark(S) {
      const r = S.ridgeV, a = S.fine, b = S.mid;
      for (let i = 0; i < N * N; i++) {
        const plate = sm(0.25, 0.6, r[i]);
        lum[i] = 0.34 + plate * 0.3 + (a[i] - 0.5) * 0.16 + (b[i] - 0.5) * 0.1;
        hgt[i] = plate * 0.9 + r[i] * 0.3 + a[i] * 0.1;
        sat[i] = 0.85 + plate * 0.15;
      }
      return 3.4;
    },
    birch(S) {
      const a = S.fine, b = S.mid, h = S.grainH;
      const rng = makeRng(6601);
      for (let i = 0; i < N * N; i++) { lum[i] = 0.56 + (h[i] - 0.5) * 0.12 + (a[i] - 0.5) * 0.06; hgt[i] = 0.6 + (h[i] - 0.5) * 0.15; sat[i] = 1; }
      for (let k = 0; k < 150; k++) {                         // dark lenticels and a few scars
        const big = k < 9, cx = rng() * N, cy = rng() * N, rx = (big ? 26 + rng() * 34 : 6 + rng() * 16) * N / 512, ry = (big ? 7 + rng() * 9 : 1.4 + rng() * 1.6) * N / 512;
        for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
          if (d >= 1) continue;
          const i = (y & M) * N + (x & M), w = (1 - d) * (big ? 1 : 0.85) * (0.7 + b[i] * 0.6);
          lum[i] -= w * 0.42; hgt[i] -= w * 0.5; sat[i] -= w * 0.8;
        }
      }
      return 1.6;
    },
    metal(S) {
      const h = S.grainH, a = S.fine, c = S.big, w = S.wSmall;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const chip = sm(0.2, 0.06, at(w.f1, x, y, 1, 1)) * sm(0.72, 0.9, c[i] + w.id[i] * 0.3);
        lum[i] = 0.5 + (h[i] - 0.5) * 0.12 + (a[i] - 0.5) * 0.05 + (c[i] - 0.5) * 0.1 - chip * 0.2;
        hgt[i] = 0.5 + (h[i] - 0.5) * 0.08 - chip * 0.5;
        sat[i] = 1 - chip * 0.85;
      }
      return 0.9;
    },
    ribbed(S) {
      const a = S.fine, v = S.dripV, c = S.big;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const ph = (x * 6 / N) % 1, tri = Math.abs(ph - 0.5) * 2;           // 6 ribs per repeat
        const rib = sm(0.2, 0.4, tri) - 0;                                  // flat top, sloped sides
        const rust = sm(0.62, 0.9, v[i] * 0.7 + c[i] * 0.45);
        lum[i] = 0.5 + (rib - 0.5) * 0.1 + (a[i] - 0.5) * 0.07 - rust * 0.2 + (c[i] - 0.5) * 0.08;
        hgt[i] = rib;
        sat[i] = 1 - rust * 0.75;
      }
      return 3.2;
    },
    water(S) {
      const a = S.fine, b = S.mid, c = S.big, r = S.ridge;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const chop = at(b, x, y, 2, 2);
        lum[i] = 0.5 + (r[i] - 0.45) * 0.5 + (b[i] - 0.5) * 0.3;
        hgt[i] = c[i] * 1.1 + b[i] * 0.55 + chop * 0.22 + a[i] * 0.05;
        sat[i] = b[i];
      }
      return 2.6;
    },
    hay(S) {
      const g = S.streakV, a = S.fine, b = S.mid;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const f1 = at(g, x, y, 4, 1), f2 = g[((y + 131) & M) * N + ((x * 3 + 57) & M)];
        const fib = f1 * 0.6 + f2 * 0.4;
        lum[i] = 0.5 + (fib - 0.5) * 0.5 + (a[i] - 0.5) * 0.12 + (b[i] - 0.5) * 0.12;
        hgt[i] = fib + (b[i] - 0.5) * 0.4;
        sat[i] = 0.8 + fib * 0.2;
      }
      return 2.4;
    },
  };

  // ---- foliage cards: R = brightness, G = hue shift, B = inner shade, A = coverage
  function leafLayer(layer, draw) {
    const o0 = layer * N * N * 4;
    const R = new Float32Array(N * N).fill(0.5), G = new Float32Array(N * N).fill(0.5), B = new Float32Array(N * N).fill(1), A = new Float32Array(N * N);
    // paint one leaf: centre (cx, cy), half length len, half width wid, direction ang (all in pixels)
    const leaf = (cx, cy, len, wid, ang, bright, hue, shade) => {
      const ca = Math.cos(ang), sa = Math.sin(ang), rad = Math.ceil(len + 2);
      const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(N - 1, Math.ceil(cx + rad)), y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(N - 1, Math.ceil(cy + rad));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy, u = (dx * ca + dy * sa) / len, v = (-dx * sa + dy * ca) / wid;
        if (u < -1 || u > 1) continue;
        const half = Math.pow(1 - u * u, 0.62) * (1 - 0.28 * u);             // broad near the stem, pointed tip
        const e = (half - Math.abs(v)) * wid;                                // signed distance to the edge in pixels (approx.)
        if (e <= -0.8) continue;
        const cov = e >= 0.8 ? 1 : (e + 0.8) / 1.6, i = y * N + x;
        const rib = 1 + 0.16 * Math.exp(-v * v * 30) - 0.1 * Math.abs(v);    // lighter midrib, darker rim
        const k = cov;
        R[i] = R[i] * (1 - k) + bright * rib * (0.82 + 0.18 * (u * 0.5 + 0.5)) * k;
        G[i] = G[i] * (1 - k) + hue * k;
        B[i] = B[i] * (1 - k) + shade * k;
        if (cov > A[i]) A[i] = cov;
      }
    };
    const line = (ax, ay, bx, by, w0, w1, bright, hue, shade) => {
      const len = Math.hypot(bx - ax, by - ay), steps = Math.ceil(len * 1.3) + 1;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, r = w0 + (w1 - w0) * t;
        const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(N - 1, Math.ceil(cx + r + 1)), y0 = Math.max(0, Math.floor(cy - r - 1)), y1 = Math.min(N - 1, Math.ceil(cy + r + 1));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x - cx, y - cy);
          if (d >= r + 0.7) continue;
          const cov = d <= r - 0.7 ? 1 : (r + 0.7 - d) / 1.4, i = y * N + x;
          R[i] = R[i] * (1 - cov) + bright * cov; G[i] = G[i] * (1 - cov) + hue * cov; B[i] = B[i] * (1 - cov) + shade * cov;
          if (cov > A[i]) A[i] = cov;
        }
      }
    };
    draw(leaf, line, N / 512);
    // spread the leaf colours into the empty texels so that filtered edges do not pick up the neutral fill
    for (let pass = 0; pass < 6; pass++) {
      const A2 = A.slice();
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const i = y * N + x;
        if (A[i] > 0.02) continue;
        let n = 0, r = 0, g = 0, b = 0;
        for (const j of [i - 1, i + 1, i - N, i + N]) if (A[j] > 0.02 || A2[j] < -0.5) { r += R[j]; g += G[j]; b += B[j]; n++; }
        if (n) { R[i] = r / n; G[i] = g / n; B[i] = b / n; A2[i] = -1; }
      }
      for (let i = 0; i < N * N; i++) if (A2[i] < -0.5) A[i] = 0.011;
    }
    for (let i = 0; i < N * N; i++) {
      const o = o0 + i * 4, c = v => (v < 0 ? 0 : v > 1 ? 255 : v * 255 + 0.5);
      out8[o] = c(R[i]); out8[o + 1] = c(G[i]); out8[o + 2] = c(B[i]); out8[o + 3] = A[i] <= 0.011 ? 0 : c(A[i]);
    }
  }
  const LEAVES = {
    // rounded spray of broad leaves around a few twigs
    leafA(leaf, line, k) {
      const rng = makeRng(4107), C = N / 2;
      for (let t = 0; t < 7; t++) { const a = rng() * TAU, r = (120 + rng() * 70) * k; line(C, C, C + Math.cos(a) * r, C + Math.sin(a) * r, 2.6 * k, 0.9 * k, 0.24, 0.45, 0.6); }
      const list = [];
      for (let i = 0; i < 330; i++) {
        const a = rng() * TAU, r = Math.pow(rng(), 0.62) * 212 * k;
        list.push({ x: C + Math.cos(a) * r, y: C + Math.sin(a) * r * 0.94, r, a: a + (rng() - 0.5) * 1.9, s: 0.75 + rng() * 0.6, b: rng(), h: rng() });
      }
      list.forEach((l, i) => {
        const depth = i / list.length;                       // later leaves sit on top and are lighter
        leaf(l.x, l.y, 23 * k * l.s, 10.5 * k * l.s, l.a, 0.3 + depth * 0.28 + l.b * 0.14, 0.32 + l.h * 0.36, 0.5 + depth * 0.5);
      });
    },
    // conifer bough: a central twig with side twigs carrying dense needles, base at the left edge
    leafB(leaf, line, k) {
      const rng = makeRng(8803), y0 = N / 2;
      const needles = (ax, ay, bx, by, n, len, wid) => {
        const dx = bx - ax, dy = by - ay, ang = Math.atan2(dy, dx);
        for (let i = 0; i < n; i++) {
          const t = (i + rng()) / n, side = i & 1 ? 1 : -1, a = ang + side * (0.55 + rng() * 0.5), l = len * (0.6 + rng() * 0.5) * (1 - t * 0.35);
          const cx = ax + dx * t + Math.cos(a) * l, cy = ay + dy * t + Math.sin(a) * l;
          leaf(cx, cy, l, wid, a, 0.34 + rng() * 0.24, 0.35 + rng() * 0.3, 0.55 + rng() * 0.45);
        }
      };
      line(10 * k, y0, 492 * k, y0, 4.2 * k, 1.2 * k, 0.22, 0.4, 0.5);
      for (let i = 0; i < 15; i++) {
        const t = 0.07 + i / 15 * 0.86, side = i & 1 ? 1 : -1, ax = (10 + t * 482) * k, len = (150 - t * 96) * k * (0.85 + rng() * 0.3);
        const a = side * (0.72 + rng() * 0.25), bx = ax + Math.cos(a) * len, by = y0 + Math.sin(a) * len;
        line(ax, y0, bx, by, 2.4 * k, 0.8 * k, 0.22, 0.4, 0.5);
        needles(ax, y0, bx, by, Math.round(len / (3.3 * k)), 15 * k, 2.3 * k);
      }
      needles(10 * k, y0, 492 * k, y0, 130, 17 * k, 2.4 * k);
    },
    // fan of fronds rising from the bottom centre (ferns, reeds, low shrubs)
    leafC(leaf, line, k) {
      const rng = makeRng(2290), bx = N / 2, by = 14 * k;
      for (let f = 0; f < 11; f++) {
        const a0 = Math.PI / 2 + (f - 5) * 0.2 + (rng() - 0.5) * 0.1, len = (330 + rng() * 130) * k * (1 - Math.abs(f - 5) * 0.105), bend = (f - 5) * 0.03;
        let x = bx, y = by, a = a0;
        const segs = 26;
        for (let s = 0; s < segs; s++) {
          const t = s / segs, step = len / segs, nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
          line(x, y, nx, ny, 2.2 * k * (1 - t) + 0.6 * k, 2.0 * k * (1 - t) + 0.6 * k, 0.26, 0.45, 0.6);
          if (s > 2) {
            const ll = (30 * Math.sin(Math.min(1, t * 1.25) * Math.PI) + 5) * k;
            for (const side of [-1, 1]) leaf(nx + Math.cos(a + side * 1.25) * ll * 0.5, ny + Math.sin(a + side * 1.25) * ll * 0.5, ll * 0.5, 4.6 * k, a + side * 1.25, 0.34 + rng() * 0.22, 0.35 + rng() * 0.3, 0.45 + t * 0.55);
          }
          x = nx; y = ny; a += bend + (rng() - 0.5) * 0.03;
        }
      }
    },
  };

  // whole conifer in profile: trunk in the middle, tiers of drooping boughs that get shorter toward the top
  LEAVES.leafD = function (leaf, line, k) {
    const rng = makeRng(1207), cx = N / 2;
    line(cx, 0, cx, 500 * k, 5 * k, 1.4 * k, 0.2, 0.4, 0.5);
    const tiers = 14;
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1), y = (64 + f * 410) * k, half = (222 * (1 - f * 0.9) + 12) * k;
      for (const side of [-1, 1]) {
        const nb = f < 0.55 ? 3 : 2;
        for (let b = 0; b < nb; b++) {
          const len = half * (0.5 + 0.5 * (b + 1) / nb) * (0.9 + rng() * 0.2), droop = 0.2 + 0.4 * (1 - f) + rng() * 0.18;
          const ax = cx, ay = y + b * 10 * k, bx = cx + side * len * Math.cos(droop), by = ay - len * Math.sin(droop);
          line(ax, ay, bx, by, 2.2 * k, 0.8 * k, 0.22, 0.4, 0.5);
          const n = Math.round(len / (2.7 * k)), ang = Math.atan2(by - ay, bx - ax);
          for (let i = 0; i < n; i++) {
            const tt = (i + rng()) / n, px = ax + (bx - ax) * tt, py = ay + (by - ay) * tt;
            const a = ang + (i & 1 ? 1 : -1) * (0.55 + rng() * 0.55), l = (13 + rng() * 9) * k * (1 - tt * 0.3);
            leaf(px + Math.cos(a) * l, py + Math.sin(a) * l, l, 2.5 * k, a, 0.3 + rng() * 0.26, 0.35 + rng() * 0.3, 0.42 + f * 0.4 + rng() * 0.18);
          }
        }
      }
    }
  };

  return {
    size: 512,
    // Material array: { size, layers, data: Uint8Array RGBA (layer-major, row 0 = v 0) }
    build(size) {
      N = size || this.size; M = N - 1;
      const NN = N * N, layers = MATERIALS.length;
      out8 = new Uint8Array(NN * 4 * layers);
      lum = new Float32Array(NN); hgt = new Float32Array(NN); sat = new Float32Array(NN);
      // lattice sizes of the shared noise fields (fewer cells when the texture itself is smaller)
      const q = v => Math.max(2, Math.round(v * (N >= 512 ? 1 : N / 512 * 2)));
      shared = {
        fine: fbm(11, q(64), q(64), 3, 0.6), mid: fbm(23, q(12), q(12), 4, 0.55), big: fbm(37, 3, 3, 4, 0.5),
        streakV: fbm(41, q(96), q(8), 3, 0.6), grainH: fbm(53, 4, q(96), 3, 0.6), dripV: fbm(67, q(28), 2, 3, 0.55),
        ridge: ridged(71, 5, 5, 5), ridgeV: ridged(83, q(14), 3, 4),
        wSmall: worley(5, q(40)), wPebble: worley(7, q(22)), wCrack: worley(9, 6), wCobble: worley(13, 9),
      };
      for (let l = 0; l < layers; l++) {
        const name = MATERIALS[l].name;
        if (RECIPES[name]) { const strength = RECIPES[name](shared); pack(l, strength); }
        else if (LEAVES[name]) leafLayer(l, LEAVES[name]);
      }
      const res = { size: N, layers, data: out8 };
      out8 = lum = hgt = sat = shared = null;
      return res;
    },
    // General purpose tileable noise, RGBA8: R = soft large shapes, G = medium, B = ridged detail, A = fine grain
    noise(size) {
      N = size || 256; M = N - 1;
      const a = fbm(101, 4, 4, 5, 0.5), b = fbm(202, 8, 8, 4, 0.55), c = ridged(303, 6, 6, 4), d = fbm(404, Math.min(64, N / 4), Math.min(64, N / 4), 2, 0.6);
      const out = new Uint8Array(N * N * 4);
      for (let i = 0; i < N * N; i++) { out[i * 4] = a[i] * 255; out[i * 4 + 1] = b[i] * 255; out[i * 4 + 2] = c[i] * 255; out[i * 4 + 3] = d[i] * 255; }
      return { size: N, data: out };
    },
    // 32 x 1 lookup of per-layer shading properties: R = specular strength, G = gloss, B = 1 for foliage layers
    props() {
      const out = new Uint8Array(32 * 4);
      MATERIALS.forEach((m, i) => { out[i * 4] = m.spec * 255; out[i * 4 + 1] = m.gloss * 255; out[i * 4 + 2] = /^leaf/.test(m.name) ? 255 : 0; out[i * 4 + 3] = 255; });
      out[MAT_GLASS * 4] = 255; out[MAT_GLASS * 4 + 1] = 242; out[MAT_GLASS * 4 + 3] = 255;
      return out;
    },
  };
})();
