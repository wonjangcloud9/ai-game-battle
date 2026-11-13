// AURORA FALL — procedural geometry builder (pure data, no WebGL)
// Vertex layout: position (3), normal (3), colour (rgb + emissive flag), material (u, v, texture layer, param).
// A colour array may carry `.mat` (index into MATERIALS) and `.rot` (rotate the texture a quarter turn);
// texture coordinates are generated in metres divided by the tile size of that material.
'use strict';

class MeshBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; this.m = []; this.i = []; this.count = 0; this.param = 1; this.l = null; }
  // interior lamp seen by vertex k: world position + radius (buildings only; see WorldGen.interior)
  setLamp(k, L) { (this.l || (this.l = new Map())).set(k, L); }

  vert(x, y, z, nx, ny, nz, col, a, u, v) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2], a || 0);
    if (col.rot) this.m.push(v || 0, u || 0, col.mat === undefined ? -1 : col.mat, this.param);
    else this.m.push(u || 0, v || 0, col.mat === undefined ? -1 : col.mat, this.param);
    return this.count++;
  }
  // c with the material of ref: a texture layer cannot blend into another one across a face, so colours that only
  // differ in shade along a face (top ring of a cylinder wall, the far edge of a quad, rings of a loft) share one.
  static sameMat(c, ref) {
    if (c.mat === ref.mat && !c.rot === !ref.rot) return c;
    const r = [c[0], c[1], c[2]];
    if (ref.mat !== undefined) r.mat = ref.mat;
    if (ref.rot) r.rot = 1;
    return r;
  }
  static uvScale(col) { return col.mat === undefined || col.mat >= MATERIALS.length ? 1 : 1 / MATERIALS[col.mat].tile; }
  // planar mapping in world space: walls get (along the wall, height), floors get (x, z)
  _planar(p, nx, ny, nz, s, out) {
    if (Math.abs(ny) > 0.72) { out[0] = p[0] * s; out[1] = p[2] * s; return out; }
    const l = Math.hypot(nx, nz) || 1;
    out[0] = (p[0] * nz - p[2] * nx) / l * s; out[1] = p[1] * s;
    return out;
  }
  // Triangle with flat normal. If hint (outward direction) is given the winding is fixed automatically.
  tri(a, b, c, col, em, hint) {
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    const l = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= l; ny *= l; nz *= l;
    const s = MeshBuilder.uvScale(col), q = MeshBuilder._uv;
    this._planar(a, nx, ny, nz, s, q); const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, col, em, q[0], q[1]);
    this._planar(b, nx, ny, nz, s, q); this.vert(b[0], b[1], b[2], nx, ny, nz, col, em, q[0], q[1]);
    this._planar(c, nx, ny, nz, s, q); this.vert(c[0], c[1], c[2], nx, ny, nz, col, em, q[0], q[1]);
    this.i.push(i0, i0 + 1, i0 + 2);
  }
  // Quad a,b,c,d (counter-clockwise seen from outside). colCD (optional) is used for c,d.
  // uv (optional): [ua, va, ub, vb, uc, vc, ud, vd] in tile units, otherwise planar mapping.
  quad(a, b, c, d, col, em, hint, colCD, uv) {
    let nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
    let ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
    let nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    let flip = false;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { flip = true; nx = -nx; ny = -ny; nz = -nz; }
    const l = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= l; ny *= l; nz *= l;
    const c2 = colCD ? MeshBuilder.sameMat(colCD, col) : col, s = MeshBuilder.uvScale(col), q = MeshBuilder._uv;
    const P = [a, b, c, d];
    const i0 = this.count;
    for (let k = 0; k < 4; k++) {
      if (uv) { q[0] = uv[k * 2]; q[1] = uv[k * 2 + 1]; } else this._planar(P[k], nx, ny, nz, s, q);
      this.vert(P[k][0], P[k][1], P[k][2], nx, ny, nz, k < 2 ? col : c2, em, q[0], q[1]);
    }
    if (flip) this.i.push(i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2);
    else this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  // Oriented box. opts: { em, grad (bottom darkening 0..1), noBottom, noTop, pitch, roll, topCol, skip (bit mask of faces +x -x +y -y +z -z) }
  box(cx, cy, cz, sx, sy, sz, yaw, col, opts) {
    opts = opts || {};
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const corners = [];
    const m = MeshBuilder._m;
    m4.compose(m, cx, cy, cz, yaw || 0, opts.pitch || 0, opts.roll || 0, 1, 1, 1);
    for (let k = 0; k < 8; k++) {
      const out = [0, 0, 0];
      m4.transformPoint(out, m, k & 1 ? hx : -hx, k & 2 ? hy : -hy, k & 4 ? hz : -hz);
      corners.push(out);
    }
    const g = opts.grad === undefined ? 1 : opts.grad;
    const low = g === 1 ? col : scaleCol(col, g);
    const em = opts.em || 0;
    const F = MeshBuilder.BOX_FACES, AX = MeshBuilder.BOX_AXES, skip = opts.skip || 0;
    for (let f = 0; f < 6; f++) {
      if (f === 3 && opts.noBottom) continue;
      if (f === 2 && opts.noTop) continue;
      if (skip & (1 << f)) continue;
      const q = F[f];
      const a = corners[q[0]], b = corners[q[1]], d = corners[q[3]];
      let nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
      let ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
      let nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
      const l = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= l; ny *= l; nz *= l;
      const fc = f === 2 ? (opts.topCol || col) : f === 3 ? low : col;
      const s = MeshBuilder.uvScale(fc), ua = AX[f][0] * 4, va = AX[f][1] * 4;
      const i0 = this.count;
      for (let k = 0; k < 4; k++) {
        const ci = q[k], p = corners[ci];
        const vc = f === 2 || f === 3 ? fc : ((ci & 2) ? col : low);       // side faces: darker toward the bottom
        this.vert(p[0], p[1], p[2], nx, ny, nz, vc, em, (p[0] * m[ua] + p[1] * m[ua + 1] + p[2] * m[ua + 2]) * s, (p[0] * m[va] + p[1] * m[va + 1] + p[2] * m[va + 2]) * s);
      }
      this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    }
  }
  // Vertical (optionally tapered) cylinder, base centre at (cx, cy, cz). opts: { em, flat, noBottom, noTop, grad, yawOff, topCol }
  cyl(cx, cy, cz, r0, r1, h, sides, col, opts) {
    opts = opts || {};
    const em = opts.em || 0, g = opts.grad === undefined ? 1 : opts.grad, low = g === 1 ? col : scaleCol(col, g);
    const topCol = opts.topCol || col, sideTop = MeshBuilder.sameMat(topCol, col);       // rim of the wall / the cap itself
    const a0 = opts.yawOff || 0;
    const slope = (r0 - r1) / h;
    const s = MeshBuilder.uvScale(col), rep = Math.max(1, Math.round(TAU * Math.max(r0, r1) * s)), v0 = cy * s, v1 = (cy + h) * s;
    const ring = [];
    for (let k = 0; k <= sides; k++) { const a = a0 + (k / sides) * TAU; ring.push([Math.sin(a), Math.cos(a)]); }
    for (let k = 0; k < sides; k++) {
      const s0 = ring[k], s1 = ring[k + 1], u0 = k / sides * rep, u1 = (k + 1) / sides * rep;
      const b0 = [cx + s0[0] * r0, cy, cz + s0[1] * r0], b1 = [cx + s1[0] * r0, cy, cz + s1[1] * r0];
      const t0 = [cx + s0[0] * r1, cy + h, cz + s0[1] * r1], t1 = [cx + s1[0] * r1, cy + h, cz + s1[1] * r1];
      if (opts.flat) {
        const hint = [s0[0] + s1[0], slope, s0[1] + s1[1]];
        if (r1 <= 0.0001) {
          this.tri(b0, b1, t0, low, em, hint);
          for (let q = this.count - 3; q < this.count; q++) { // recolour the apex vertex
            if (this.p[q * 3 + 1] > cy + h - 1e-6) { this.c[q * 4] = topCol[0]; this.c[q * 4 + 1] = topCol[1]; this.c[q * 4 + 2] = topCol[2]; }
          }
        } else this.quad(b0, b1, t1, t0, low, em, hint, topCol, [u0, v0, u1, v0, u1, v1, u0, v1]);
      } else {
        const l0 = 1 / Math.hypot(1, slope);
        const i0 = this.vert(b0[0], b0[1], b0[2], s0[0] * l0, slope * l0, s0[1] * l0, low, em, u0, v0);
        this.vert(b1[0], b1[1], b1[2], s1[0] * l0, slope * l0, s1[1] * l0, low, em, u1, v0);
        this.vert(t1[0], t1[1], t1[2], s1[0] * l0, slope * l0, s1[1] * l0, sideTop, em, u1, v1);
        this.vert(t0[0], t0[1], t0[2], s0[0] * l0, slope * l0, s0[1] * l0, sideTop, em, u0, v1);
        // winding: b0 -> b1 -> t1 -> t0 must face outward
        const hx = s0[0] + s1[0], hz = s0[1] + s1[1];
        const ex = b1[0] - b0[0], ez = b1[2] - b0[2];
        if ((-ez * hx + ex * hz) >= 0) this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
        else this.i.push(i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2);
      }
    }
    const st = MeshBuilder.uvScale(topCol);
    if (!opts.noTop && r1 > 0.0001) {
      const c = this.vert(cx, cy + h, cz, 0, 1, 0, topCol, em, cx * st, cz * st);
      const first = this.count;
      for (let k = 0; k < sides; k++) this.vert(cx + ring[k][0] * r1, cy + h, cz + ring[k][1] * r1, 0, 1, 0, topCol, em, (cx + ring[k][0] * r1) * st, (cz + ring[k][1] * r1) * st);
      for (let k = 0; k < sides; k++) this.i.push(c, first + k, first + (k + 1) % sides);
    }
    if (!opts.noBottom) {
      const c = this.vert(cx, cy, cz, 0, -1, 0, low, em, cx * s, cz * s);
      const first = this.count;
      for (let k = 0; k < sides; k++) this.vert(cx + ring[k][0] * r0, cy, cz + ring[k][1] * r0, 0, -1, 0, low, em, (cx + ring[k][0] * r0) * s, (cz + ring[k][1] * r0) * s);
      for (let k = 0; k < sides; k++) this.i.push(c, first + (k + 1) % sides, first + k);
    }
  }
  // Cylinder between two arbitrary points (flat shaded unless opts.smooth), used for logs / branches / beams.
  beam(ax, ay, az, bx, by, bz, r0, r1, sides, col, opts) {
    opts = opts || {};
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1; dx /= len; dy /= len; dz /= len;
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(dy) > 0.9) { ux = 1; uy = 0; }
    let px = uy * dz - uz * dy, py = uz * dx - ux * dz, pz = ux * dy - uy * dx;
    let l = 1 / Math.hypot(px, py, pz); px *= l; py *= l; pz *= l;
    const qx = dy * pz - dz * py, qy = dz * px - dx * pz, qz = dx * py - dy * px;
    const s = MeshBuilder.uvScale(col), rep = Math.max(1, Math.round(TAU * Math.max(r0, r1) * s)), vl = len * s, em = opts.em || 0;
    const pts0 = [], pts1 = [];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TAU, c = Math.cos(a), sn = Math.sin(a);
      const ox = px * c + qx * sn, oy = py * c + qy * sn, oz = pz * c + qz * sn;
      pts0.push([ax + ox * r0, ay + oy * r0, az + oz * r0, ox, oy, oz]);
      pts1.push([bx + ox * r1, by + oy * r1, bz + oz * r1]);
    }
    for (let k = 0; k < sides; k++) {
      const k1 = k + 1, u0 = k / sides * rep, u1 = k1 / sides * rep;
      if (opts.smooth) {
        const A = pts0[k], B = pts0[k1], i0 = this.count;
        this.vert(A[0], A[1], A[2], A[3], A[4], A[5], col, em, u0, 0);
        this.vert(B[0], B[1], B[2], B[3], B[4], B[5], col, em, u1, 0);
        this.vert(pts1[k1][0], pts1[k1][1], pts1[k1][2], B[3], B[4], B[5], col, em, u1, vl);
        this.vert(pts1[k][0], pts1[k][1], pts1[k][2], A[3], A[4], A[5], col, em, u0, vl);
        this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      } else {
        const hint = [pts0[k][3] + pts0[k1][3], pts0[k][4] + pts0[k1][4], pts0[k][5] + pts0[k1][5]];
        this.quad(pts0[k], pts0[k1], pts1[k1], pts1[k], col, em, hint, null, [u0, 0, u1, 0, u1, vl, u0, vl]);
      }
    }
    if (!opts.noCaps) {
      const capCol = opts.capCol || col;
      for (let k = 1; k + 1 < sides; k++) {
        this.tri(pts0[0], pts0[k], pts0[k + 1], capCol, em, [-dx, -dy, -dz]);
        if (r1 > 0.0001) this.tri(pts1[0], pts1[k], pts1[k + 1], capCol, em, [dx, dy, dz]);
      }
    }
  }
  // Gabled roof prism. Base rectangle w (local x) by d (local z) at height cy, ridge along local x.
  gable(cx, cy, cz, w, d, h, yaw, col, opts) {
    opts = opts || {};
    const cs = Math.cos(yaw || 0), sn = Math.sin(yaw || 0);
    const P = (lx, ly, lz) => [cx + lx * cs + lz * sn, cy + ly, cz - lx * sn + lz * cs];
    const A = P(-w / 2, 0, -d / 2), B = P(w / 2, 0, -d / 2), C = P(w / 2, 0, d / 2), D = P(-w / 2, 0, d / 2);
    const R0 = P(-w / 2, h, 0), R1 = P(w / 2, h, 0);
    const low = scaleCol(col, opts.grad === undefined ? 0.82 : opts.grad);
    const endCol = opts.endCol || col;
    const s = MeshBuilder.uvScale(col), sl = Math.hypot(d / 2, h) * s, u0 = (cx * cs - cz * sn - w / 2) * s, u1 = u0 + w * s;
    this.quad(D, C, R1, R0, low, 0, null, col, [u0, 0, u1, 0, u1, sl, u0, sl]);
    this.quad(B, A, R0, R1, low, 0, null, col, [u1 + 0.37, 0, u0 + 0.37, 0, u0 + 0.37, sl, u1 + 0.37, sl]);
    this.tri(A, D, R0, endCol, 0);
    this.tri(C, B, R1, endCol, 0);
    if (!opts.noBottom) this.quad(A, B, C, D, scaleCol(col, 0.6), 0);
  }
  // Low-poly ellipsoid blob (icosphere). opts: { flat, jitter, seed, grad, detail, shadeJitter, em, noise (smooth lumps 0..1) }
  blob(cx, cy, cz, rx, ry, rz, col, opts) {
    opts = opts || {};
    const ico = MeshBuilder.icosphere(opts.detail === undefined ? 1 : opts.detail);
    const rng = makeRng(opts.seed || 1);
    const pts = [], nz3 = opts.noise ? makeNoise2D((opts.seed || 1) + 77) : null;
    for (let k = 0; k < ico.verts.length; k++) {
      const v = ico.verts[k];
      let j = 1 + (opts.jitter || 0) * (rng() * 2 - 1);
      if (nz3) j *= 1 + opts.noise * (nz3(v[0] * 1.3 + v[2] * 0.7, v[1] * 1.3 - v[2] * 0.9) * 0.6 + nz3(v[0] * 3.1 - v[1], v[2] * 3.1 + v[1] * 2.0) * 0.3);
      pts.push([cx + v[0] * rx * j, cy + v[1] * ry * j, cz + v[2] * rz * j]);
    }
    const g = opts.grad === undefined ? 1 : opts.grad;
    const em = opts.em || 0;
    const s = MeshBuilder.uvScale(col), ru = Math.max(1, Math.round(TAU * Math.max(rx, rz) * s)), rv = Math.max(1, Math.round(Math.PI * ry * s));
    const uvOf = v => [Math.atan2(v[0], v[2]) / TAU * ru, (Math.asin(clamp(v[1], -1, 1)) / Math.PI + 0.5) * rv];
    // smooth normals of the (possibly displaced) surface
    let nrm = null;
    if (!opts.flat) {
      nrm = pts.map(() => [0, 0, 0]);
      for (const f of ico.faces) {
        const a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
        const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        for (const q of f) { nrm[q][0] += nx; nrm[q][1] += ny; nrm[q][2] += nz; }
      }
      for (const q of nrm) { const l = 1 / (Math.hypot(q[0], q[1], q[2]) || 1); q[0] *= l; q[1] *= l; q[2] *= l; }
    }
    for (const f of ico.faces) {
      const a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
      const uv = [uvOf(ico.verts[f[0]]), uvOf(ico.verts[f[1]]), uvOf(ico.verts[f[2]])];
      const um = Math.max(uv[0][0], uv[1][0], uv[2][0]);
      for (const q of uv) if (um - q[0] > ru * 0.5) q[0] += ru;                 // keep the triangle on one side of the seam
      if (opts.flat) {
        const my = (ico.verts[f[0]][1] + ico.verts[f[1]][1] + ico.verts[f[2]][1]) / 3;
        const shade = lerp(g, 1, my * 0.5 + 0.5) * (1 + (opts.shadeJitter || 0) * (rng() * 2 - 1));
        const sc = scaleCol(col, shade);
        let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const l = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= l; ny *= l; nz *= l;
        const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, sc, em, uv[0][0], uv[0][1]);
        this.vert(b[0], b[1], b[2], nx, ny, nz, sc, em, uv[1][0], uv[1][1]);
        this.vert(c[0], c[1], c[2], nx, ny, nz, sc, em, uv[2][0], uv[2][1]);
        this.i.push(i0, i0 + 1, i0 + 2);
      } else {
        const i0 = this.count;
        for (let k = 0; k < 3; k++) {
          const q = f[k], p = pts[q], n = nrm[q];
          this.vert(p[0], p[1], p[2], n[0], n[1], n[2], scaleCol(col, lerp(g, 1, ico.verts[q][1] * 0.5 + 0.5)), em, uv[k][0], uv[k][1]);
        }
        this.i.push(i0, i0 + 1, i0 + 2);
      }
    }
  }
  // Smooth skin over a list of closed rings (each ring: array of [x, y, z], all the same length, wound counter-clockwise
  // when seen from the far end of the path looking back). opts: { em, cols (colour per ring), capStart, capEnd, vScale, uRep }
  loft(rings, col, opts) {
    opts = opts || {};
    const R = rings.length, n = rings[0].length, em = opts.em || 0;
    const s = MeshBuilder.uvScale(col);
    // texture v: accumulated distance between ring centres
    const cen = rings.map(r => { let x = 0, y = 0, z = 0; for (const p of r) { x += p[0]; y += p[1]; z += p[2]; } return [x / n, y / n, z / n]; });
    const vv = [0];
    for (let i = 1; i < R; i++) vv.push(vv[i - 1] + Math.hypot(cen[i][0] - cen[i - 1][0], cen[i][1] - cen[i - 1][1], cen[i][2] - cen[i - 1][2]) * s);
    let per = 0;
    for (let j = 0; j < n; j++) { const a = rings[0][j], b = rings[0][(j + 1) % n]; per += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
    const rep = opts.uRep || Math.max(1, Math.round(per * s));
    // normals on the logical grid
    const N = [];
    for (let i = 0; i < R; i++) { N.push([]); for (let j = 0; j < n; j++) N[i].push([0, 0, 0]); }
    const acc = (i0, j0, i1, j1, i2, j2) => {
      const a = rings[i0][j0], b = rings[i1][j1], c = rings[i2][j2];
      const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      for (const q of [N[i0][j0], N[i1][j1], N[i2][j2]]) { q[0] += nx; q[1] += ny; q[2] += nz; }
    };
    for (let i = 0; i + 1 < R; i++) for (let j = 0; j < n; j++) { const j1 = (j + 1) % n; acc(i, j, i, j1, i + 1, j1); acc(i, j, i + 1, j1, i + 1, j); }
    const base = this.count;
    for (let i = 0; i < R; i++) {
      const rc = opts.cols ? MeshBuilder.sameMat(opts.cols[i], col) : col;
      for (let j = 0; j <= n; j++) {
        const p = rings[i][j % n], q = N[i][j % n], l = 1 / (Math.hypot(q[0], q[1], q[2]) || 1);
        this.vert(p[0], p[1], p[2], q[0] * l, q[1] * l, q[2] * l, rc, em, j / n * rep, vv[i] * (opts.vScale || 1));
      }
    }
    const W = n + 1;
    for (let i = 0; i + 1 < R; i++) for (let j = 0; j < n; j++) {
      const a = base + i * W + j, b = a + 1, c = a + W + 1, d = a + W;
      this.i.push(a, b, c, a, c, d);
    }
    const cap = (i, flip) => {
      const c = cen[i], r = rings[i], rc = opts.cols ? opts.cols[i] : col;
      for (let j = 0; j < n; j++) { const a = r[j], b = r[(j + 1) % n]; if (flip) this.tri(c, b, a, rc, em); else this.tri(c, a, b, rc, em); }
    };
    if (opts.capStart) cap(0, true);
    if (opts.capEnd) cap(R - 1, false);
    return base;
  }
  // Round tube along a path: pts = [[x, y, z, radius], ...]. opts: { em, caps, cols, squash (cross-section width factor along the side axis) }
  tube(pts, sides, col, opts) {
    opts = opts || {};
    const rings = [];
    let ux = 0, uy = 0, uz = 1;                   // reference axis carried along the path
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const dl = 1 / (Math.hypot(dx, dy, dz) || 1); dx *= dl; dy *= dl; dz *= dl;
      if (Math.abs(ux * dx + uy * dy + uz * dz) > 0.95) { ux = 1; uy = 0; uz = 0; }
      // side = d x u, fwd = side x d  (so the ring winds counter-clockwise looking along d)
      let sx = dy * uz - dz * uy, sy = dz * ux - dx * uz, sz = dx * uy - dy * ux;
      const sl = 1 / (Math.hypot(sx, sy, sz) || 1); sx *= sl; sy *= sl; sz *= sl;
      const fx = sy * dz - sz * dy, fy = sz * dx - sx * dz, fz = sx * dy - sy * dx;
      ux = fx; uy = fy; uz = fz;
      const r = pts[i][3], ring = [], sq = opts.squash || 1;
      for (let k = 0; k < sides; k++) {
        const an = k / sides * TAU, c = Math.cos(an) * r * sq, s2 = Math.sin(an) * r;
        ring.push([pts[i][0] + sx * c - fx * s2, pts[i][1] + sy * c - fy * s2, pts[i][2] + sz * c - fz * s2]);
      }
      rings.push(ring);
    }
    return this.loft(rings, col, { em: opts.em, cols: opts.cols, capStart: opts.caps, capEnd: opts.caps, uRep: opts.uRep });
  }
  // Surface of revolution around the vertical axis through (cx, cz): profile = [[radius, height], ...] from bottom to top.
  lathe(cx, cy, cz, profile, sides, col, opts) {
    opts = opts || {};
    const rings = profile.map(q => { const ring = []; for (let k = 0; k < sides; k++) { const a = (k / sides) * TAU + (opts.yawOff || 0); ring.push([cx + Math.sin(a) * q[0], cy + q[1], cz + Math.cos(a) * q[0]]); } return ring; });
    return this.loft(rings, col, { em: opts.em, cols: opts.cols, capStart: opts.capBottom, capEnd: opts.capTop, uRep: opts.uRep });
  }
  // Foliage card: corners a (bottom left), b (bottom right), c (top right), d (top left); the texture spans 0..1.
  // One quad only: cards are drawn without back-face culling and are shaded with the explicit (bent) normals given
  // here, one for the whole card or one per corner. alpha is stored in the colour's fourth component (foliage mask).
  card(a, b, c, d, nrm, col, alpha, uv) {
    const u = uv || MeshBuilder.CARD_UV, i0 = this.count, P = [a, b, c, d];
    for (let k = 0; k < 4; k++) {
      const n = Array.isArray(nrm[0]) ? nrm[k] : nrm;
      this.vert(P[k][0], P[k][1], P[k][2], n[0], n[1], n[2], Array.isArray(col[0]) ? col[k] : col, alpha === undefined ? 1 : alpha, u[k * 2], u[k * 2 + 1]);
    }
    this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  // Recompute smooth normals for the vertices added since `from`, welding vertices that share a position.
  smooth(from) {
    const key = k => Math.round(this.p[k * 3] * 2000) + ':' + Math.round(this.p[k * 3 + 1] * 2000) + ':' + Math.round(this.p[k * 3 + 2] * 2000);
    const acc = new Map();
    for (let t = 0; t < this.i.length; t += 3) {
      const a = this.i[t], b = this.i[t + 1], c = this.i[t + 2];
      if (a < from && b < from && c < from) continue;
      const p = this.p;
      const nx = (p[b * 3 + 1] - p[a * 3 + 1]) * (p[c * 3 + 2] - p[a * 3 + 2]) - (p[b * 3 + 2] - p[a * 3 + 2]) * (p[c * 3 + 1] - p[a * 3 + 1]);
      const ny = (p[b * 3 + 2] - p[a * 3 + 2]) * (p[c * 3] - p[a * 3]) - (p[b * 3] - p[a * 3]) * (p[c * 3 + 2] - p[a * 3 + 2]);
      const nz = (p[b * 3] - p[a * 3]) * (p[c * 3 + 1] - p[a * 3 + 1]) - (p[b * 3 + 1] - p[a * 3 + 1]) * (p[c * 3] - p[a * 3]);
      for (const q of [a, b, c]) { if (q < from) continue; const k = key(q); let e = acc.get(k); if (!e) acc.set(k, e = [0, 0, 0]); e[0] += nx; e[1] += ny; e[2] += nz; }
    }
    for (let q = from; q < this.count; q++) {
      const e = acc.get(key(q));
      if (!e) continue;
      const l = 1 / (Math.hypot(e[0], e[1], e[2]) || 1);
      this.n[q * 3] = e[0] * l; this.n[q * 3 + 1] = e[1] * l; this.n[q * 3 + 2] = e[2] * l;
    }
  }
  // Move / rotate / scale the vertices added since `from` (yaw, then translation).
  transform(from, mat) {
    const t = MeshBuilder._t;
    for (let q = from; q < this.count; q++) {
      m4.transformPoint(t, mat, this.p[q * 3], this.p[q * 3 + 1], this.p[q * 3 + 2]);
      this.p[q * 3] = t[0]; this.p[q * 3 + 1] = t[1]; this.p[q * 3 + 2] = t[2];
      m4.transformDir(t, mat, this.n[q * 3], this.n[q * 3 + 1], this.n[q * 3 + 2]);
      const l = 1 / (Math.hypot(t[0], t[1], t[2]) || 1);
      this.n[q * 3] = t[0] * l; this.n[q * 3 + 1] = t[1] * l; this.n[q * 3 + 2] = t[2] * l;
    }
  }
  append(other, ox, oy, oz) {
    const base = this.count;
    for (let k = 0; k < other.count; k++) {
      this.p.push(other.p[k * 3] + (ox || 0), other.p[k * 3 + 1] + (oy || 0), other.p[k * 3 + 2] + (oz || 0));
      this.n.push(other.n[k * 3], other.n[k * 3 + 1], other.n[k * 3 + 2]);
      this.c.push(other.c[k * 4], other.c[k * 4 + 1], other.c[k * 4 + 2], other.c[k * 4 + 3]);
      this.m.push(other.m[k * 4], other.m[k * 4 + 1], other.m[k * 4 + 2], other.m[k * 4 + 3]);
    }
    for (let k = 0; k < other.i.length; k++) this.i.push(base + other.i[k]);
    this.count += other.count;
  }
  build() {
    const positions = new Float32Array(this.p), normals = new Float32Array(this.n), colors = new Float32Array(this.c), mats = new Float32Array(this.m);
    const indices = new Uint32Array(this.i);
    const lamps = new Float32Array(this.count * 4);
    if (this.l) for (const [k, L] of this.l) { lamps[k * 4] = L[0]; lamps[k * 4 + 1] = L[1]; lamps[k * 4 + 2] = L[2]; lamps[k * 4 + 3] = L[3]; }
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let k = 0; k < positions.length; k += 3) {
      const x = positions[k], y = positions[k + 1], z = positions[k + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!this.count) { minX = minY = minZ = maxX = maxY = maxZ = 0; }
    const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2;
    return { positions, normals, colors, mats, lamps, indices, vertexCount: this.count, indexCount: indices.length, center, radius, min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }
}
MeshBuilder._m = new Float32Array(16);
MeshBuilder._uv = [0, 0];
MeshBuilder._t = [0, 0, 0];
MeshBuilder.CARD_UV = [0, 0, 1, 0, 1, 1, 0, 1];
// corner index bits: 1 = +x, 2 = +y, 4 = +z ; faces listed counter-clockwise from outside
MeshBuilder.BOX_FACES = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];
// texture axes per face as columns of the box matrix (0 = local x, 1 = local y, 2 = local z): [u axis, v axis]
MeshBuilder.BOX_AXES = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]];

MeshBuilder._icoCache = {};
MeshBuilder.icosphere = function (detail) {
  if (MeshBuilder._icoCache[detail]) return MeshBuilder._icoCache[detail];
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  verts = verts.map(v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => {
      const key = a < b ? a * 100000 + b : b * 100000 + a;
      if (cache.has(key)) return cache.get(key);
      const va = verts[a], vb = verts[b];
      let x = va[0] + vb[0], y = va[1] + vb[1], z = va[2] + vb[2]; const l = Math.hypot(x, y, z);
      verts.push([x / l, y / l, z / l]); cache.set(key, verts.length - 1); return verts.length - 1;
    };
    for (const f of faces) {
      const a = mid(f[0], f[1]), b = mid(f[1], f[2]), c = mid(f[2], f[0]);
      nf.push([f[0], a, c], [f[1], b, a], [f[2], c, b], [a, b, c]);
    }
    faces = nf;
  }
  // make sure all faces are counter-clockwise from outside
  faces = faces.map(f => {
    const a = verts[f[0]], b = verts[f[1]], c = verts[f[2]];
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return (nx * (a[0] + b[0] + c[0]) + ny * (a[1] + b[1] + c[1]) + nz * (a[2] + b[2] + c[2])) < 0 ? [f[0], f[2], f[1]] : f;
  });
  return (MeshBuilder._icoCache[detail] = { verts, faces });
};

// Colour with a material: matCol(0x8a6242, 'planks') -> linear rgb array carrying the texture layer.
function matCol(hex, mat, rot) {
  const c = hexLin(hex);
  if (mat !== undefined) c.mat = typeof mat === 'number' ? mat : MAT[mat];
  if (rot) c.rot = 1;
  return c;
}
// Same colour, different material / orientation.
function withMat(col, mat, rot) {
  const c = [col[0], col[1], col[2]];
  if (mat !== undefined && mat !== null) c.mat = typeof mat === 'number' ? mat : MAT[mat]; else if (col.mat !== undefined) c.mat = col.mat;
  if (rot) c.rot = 1;
  return c;
}

// Sanity check used by the dev harness: every triangle's winding must agree with its vertex normals.
function meshWindingErrors(mesh) {
  let bad = 0;
  const p = mesh.positions, n = mesh.normals, idx = mesh.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const nx = (p[b + 1] - p[a + 1]) * (p[c + 2] - p[a + 2]) - (p[b + 2] - p[a + 2]) * (p[c + 1] - p[a + 1]);
    const ny = (p[b + 2] - p[a + 2]) * (p[c] - p[a]) - (p[b] - p[a]) * (p[c + 2] - p[a + 2]);
    const nz = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a]);
    const ax = n[a] + n[b] + n[c], ay = n[a + 1] + n[b + 1] + n[c + 1], az = n[a + 2] + n[b + 2] + n[c + 2];
    if (nx * ax + ny * ay + nz * az < 0) bad++;
  }
  return bad;
}
