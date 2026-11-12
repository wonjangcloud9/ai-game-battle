// AURORA FALL — procedural geometry builder (pure data, no WebGL)
'use strict';

class MeshBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; this.count = 0; }

  vert(x, y, z, nx, ny, nz, col, a) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2], a || 0);
    return this.count++;
  }
  // Triangle with flat normal. If hint (outward direction) is given the winding is fixed automatically.
  tri(a, b, c, col, em, hint) {
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    const l = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= l; ny *= l; nz *= l;
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, col, em);
    this.vert(b[0], b[1], b[2], nx, ny, nz, col, em);
    this.vert(c[0], c[1], c[2], nx, ny, nz, col, em);
    this.i.push(i0, i0 + 1, i0 + 2);
  }
  // Quad a,b,c,d (counter-clockwise seen from outside). colTop (optional) is used for c,d.
  quad(a, b, c, d, col, em, hint, colCD) {
    let nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
    let ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
    let nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    let flip = false;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { flip = true; nx = -nx; ny = -ny; nz = -nz; }
    const l = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= l; ny *= l; nz *= l;
    const c2 = colCD || col;
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, col, em);
    this.vert(b[0], b[1], b[2], nx, ny, nz, col, em);
    this.vert(c[0], c[1], c[2], nx, ny, nz, c2, em);
    this.vert(d[0], d[1], d[2], nx, ny, nz, c2, em);
    if (flip) this.i.push(i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2);
    else this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  // Oriented box. opts: { em, grad (bottom darkening 0..1), noBottom, noTop, pitch, roll }
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
    const F = MeshBuilder.BOX_FACES;
    // side faces: vertex order chosen so the first two are bottom vertices where needed
    for (let f = 0; f < 6; f++) {
      if (f === 3 && opts.noBottom) continue;
      if (f === 2 && opts.noTop) continue;
      const q = F[f];
      const a = corners[q[0]], b = corners[q[1]], c = corners[q[2]], d = corners[q[3]];
      if (f === 2) { this.quad(a, b, c, d, opts.topCol || col, em); continue; }
      if (f === 3) { this.quad(a, b, c, d, low, em); continue; }
      // per-vertex gradient by y sign of the local corner
      let nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
      let ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
      let nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
      const l = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= l; ny *= l; nz *= l;
      const i0 = this.count;
      for (let k = 0; k < 4; k++) { const ci = q[k], p = corners[ci]; this.vert(p[0], p[1], p[2], nx, ny, nz, (ci & 2) ? col : low, em); }
      this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    }
  }
  // Vertical (optionally tapered) cylinder, base centre at (cx, cy, cz). opts: { em, flat, noBottom, noTop, grad, yawOff }
  cyl(cx, cy, cz, r0, r1, h, sides, col, opts) {
    opts = opts || {};
    const em = opts.em || 0, g = opts.grad === undefined ? 1 : opts.grad, low = g === 1 ? col : scaleCol(col, g);
    const topCol = opts.topCol || col;
    const a0 = opts.yawOff || 0;
    const slope = (r0 - r1) / h;
    const ring = [];
    for (let k = 0; k <= sides; k++) { const a = a0 + (k / sides) * TAU; ring.push([Math.sin(a), Math.cos(a)]); }
    for (let k = 0; k < sides; k++) {
      const s0 = ring[k], s1 = ring[k + 1];
      const b0 = [cx + s0[0] * r0, cy, cz + s0[1] * r0], b1 = [cx + s1[0] * r0, cy, cz + s1[1] * r0];
      const t0 = [cx + s0[0] * r1, cy + h, cz + s0[1] * r1], t1 = [cx + s1[0] * r1, cy + h, cz + s1[1] * r1];
      if (opts.flat) {
        const hint = [s0[0] + s1[0], slope, s0[1] + s1[1]];
        if (r1 <= 0.0001) {
          this.tri(b0, b1, t0, low, em, hint);
          for (let q = this.count - 3; q < this.count; q++) { // recolour the apex vertex
            if (this.p[q * 3 + 1] > cy + h - 1e-6) { this.c[q * 4] = topCol[0]; this.c[q * 4 + 1] = topCol[1]; this.c[q * 4 + 2] = topCol[2]; }
          }
        } else this.quad(b0, b1, t1, t0, low, em, hint, topCol);
      } else {
        const l0 = 1 / Math.hypot(1, slope);
        const i0 = this.vert(b0[0], b0[1], b0[2], s0[0] * l0, slope * l0, s0[1] * l0, low, em);
        this.vert(b1[0], b1[1], b1[2], s1[0] * l0, slope * l0, s1[1] * l0, low, em);
        this.vert(t1[0], t1[1], t1[2], s1[0] * l0, slope * l0, s1[1] * l0, topCol, em);
        this.vert(t0[0], t0[1], t0[2], s0[0] * l0, slope * l0, s0[1] * l0, topCol, em);
        // winding: b0 -> b1 -> t1 -> t0 must face outward
        const hx = s0[0] + s1[0], hz = s0[1] + s1[1];
        const ex = b1[0] - b0[0], ez = b1[2] - b0[2];
        // normal of (b1-b0) x (t0-b0) ~ (ex,0,ez) x (0,h,0) = (-ez*h, 0, ex*h)
        if ((-ez * hx + ex * hz) >= 0) this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
        else this.i.push(i0, i0 + 2, i0 + 1, i0, i0 + 3, i0 + 2);
      }
    }
    if (!opts.noTop && r1 > 0.0001) {
      const c = this.vert(cx, cy + h, cz, 0, 1, 0, topCol, em);
      const first = this.count;
      for (let k = 0; k < sides; k++) this.vert(cx + ring[k][0] * r1, cy + h, cz + ring[k][1] * r1, 0, 1, 0, topCol, em);
      for (let k = 0; k < sides; k++) this.i.push(c, first + k, first + (k + 1) % sides);
    }
    if (!opts.noBottom) {
      const c = this.vert(cx, cy, cz, 0, -1, 0, low, em);
      const first = this.count;
      for (let k = 0; k < sides; k++) this.vert(cx + ring[k][0] * r0, cy, cz + ring[k][1] * r0, 0, -1, 0, low, em);
      for (let k = 0; k < sides; k++) this.i.push(c, first + (k + 1) % sides, first + k);
    }
  }
  // Cylinder between two arbitrary points (flat shaded), used for logs / branches / beams.
  beam(ax, ay, az, bx, by, bz, r0, r1, sides, col, opts) {
    opts = opts || {};
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1; dx /= len; dy /= len; dz /= len;
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(dy) > 0.9) { ux = 1; uy = 0; }
    let px = uy * dz - uz * dy, py = uz * dx - ux * dz, pz = ux * dy - uy * dx;
    let l = 1 / Math.hypot(px, py, pz); px *= l; py *= l; pz *= l;
    const qx = dy * pz - dz * py, qy = dz * px - dx * pz, qz = dx * py - dy * px;
    const pts0 = [], pts1 = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * TAU, c = Math.cos(a), s = Math.sin(a);
      const ox = px * c + qx * s, oy = py * c + qy * s, oz = pz * c + qz * s;
      pts0.push([ax + ox * r0, ay + oy * r0, az + oz * r0, ox, oy, oz]);
      pts1.push([bx + ox * r1, by + oy * r1, bz + oz * r1]);
    }
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      const hint = [pts0[k][3] + pts0[k1][3], pts0[k][4] + pts0[k1][4], pts0[k][5] + pts0[k1][5]];
      this.quad(pts0[k], pts0[k1], pts1[k1], pts1[k], col, opts.em || 0, hint);
    }
    if (!opts.noCaps) {
      const capCol = opts.capCol || col;
      for (let k = 1; k + 1 < sides; k++) {
        this.tri(pts0[0], pts0[k], pts0[k + 1], capCol, opts.em || 0, [-dx, -dy, -dz]);
        if (r1 > 0.0001) this.tri(pts1[0], pts1[k], pts1[k + 1], capCol, opts.em || 0, [dx, dy, dz]);
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
    this.quad(D, C, R1, R0, low, 0, null, col);
    this.quad(B, A, R0, R1, low, 0, null, col);
    this.tri(A, D, R0, endCol, 0);
    this.tri(C, B, R1, endCol, 0);
    if (!opts.noBottom) this.quad(A, B, C, D, scaleCol(col, 0.6), 0);
  }
  // Low-poly ellipsoid blob (icosphere). opts: { flat, jitter, seed, grad }
  blob(cx, cy, cz, rx, ry, rz, col, opts) {
    opts = opts || {};
    const ico = MeshBuilder.icosphere(opts.detail === undefined ? 1 : opts.detail);
    const rng = makeRng(opts.seed || 1);
    const pts = [];
    for (let k = 0; k < ico.verts.length; k++) {
      const v = ico.verts[k];
      const j = 1 + (opts.jitter || 0) * (rng() * 2 - 1);
      pts.push([cx + v[0] * rx * j, cy + v[1] * ry * j, cz + v[2] * rz * j]);
    }
    const g = opts.grad === undefined ? 1 : opts.grad;
    const em = opts.em || 0;
    if (opts.flat) {
      for (const f of ico.faces) {
        const a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
        const my = (ico.verts[f[0]][1] + ico.verts[f[1]][1] + ico.verts[f[2]][1]) / 3;
        const shade = lerp(g, 1, my * 0.5 + 0.5) * (1 + (opts.shadeJitter || 0) * (rng() * 2 - 1));
        this.tri(a, b, c, scaleCol(col, shade), em, [a[0] + b[0] + c[0] - 3 * cx, a[1] + b[1] + c[1] - 3 * cy, a[2] + b[2] + c[2] - 3 * cz]);
      }
    } else {
      const base = this.count;
      for (let k = 0; k < pts.length; k++) {
        const v = ico.verts[k];
        let nx = v[0] / rx, ny = v[1] / ry, nz = v[2] / rz; const l = 1 / Math.hypot(nx, ny, nz);
        this.vert(pts[k][0], pts[k][1], pts[k][2], nx * l, ny * l, nz * l, scaleCol(col, lerp(g, 1, v[1] * 0.5 + 0.5)), em);
      }
      for (const f of ico.faces) this.i.push(base + f[0], base + f[1], base + f[2]);
    }
  }
  append(other, ox, oy, oz) {
    const base = this.count;
    for (let k = 0; k < other.count; k++) {
      this.p.push(other.p[k * 3] + (ox || 0), other.p[k * 3 + 1] + (oy || 0), other.p[k * 3 + 2] + (oz || 0));
      this.n.push(other.n[k * 3], other.n[k * 3 + 1], other.n[k * 3 + 2]);
      this.c.push(other.c[k * 4], other.c[k * 4 + 1], other.c[k * 4 + 2], other.c[k * 4 + 3]);
    }
    for (let k = 0; k < other.i.length; k++) this.i.push(base + other.i[k]);
    this.count += other.count;
  }
  build() {
    const positions = new Float32Array(this.p), normals = new Float32Array(this.n), colors = new Float32Array(this.c);
    const indices = new Uint32Array(this.i);
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let k = 0; k < positions.length; k += 3) {
      const x = positions[k], y = positions[k + 1], z = positions[k + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!this.count) { minX = minY = minZ = maxX = maxY = maxZ = 0; }
    const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2;
    return { positions, normals, colors, indices, vertexCount: this.count, indexCount: indices.length, center, radius, min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }
}
MeshBuilder._m = new Float32Array(16);
// corner index bits: 1 = +x, 2 = +y, 4 = +z ; faces listed counter-clockwise from outside
MeshBuilder.BOX_FACES = [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]];

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

// ---- unit primitives used by the instanced "prim" batches (centre at origin, size 1)
const PrimShapes = {
  box() { const b = new MeshBuilder(); b.box(0, 0, 0, 1, 1, 1, 0, [1, 1, 1]); return b.build(); },
  // chamfered cube
  rbox() {
    const b = new MeshBuilder(), h = 0.5, c = 0.13, w = [1, 1, 1];
    const S = [-1, 1];
    const P = (axis, sx, sy, sz) => {
      const v = [sx * (h - c), sy * (h - c), sz * (h - c)];
      v[axis] = [sx, sy, sz][axis] * h; return v;
    };
    for (let axis = 0; axis < 3; axis++) for (const s of S) { // 6 faces
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const mk = (su, sv) => { const sg = [0, 0, 0]; sg[axis] = s; sg[u] = su; sg[v] = sv; return P(axis, sg[0], sg[1], sg[2]); };
      const hint = [0, 0, 0]; hint[axis] = s;
      b.quad(mk(-1, -1), mk(1, -1), mk(1, 1), mk(-1, 1), w, 0, hint);
    }
    for (let axis = 0; axis < 3; axis++) { // 12 edges (edge runs along `axis`)
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      for (const su of S) for (const sv of S) {
        const mk = (sa, face) => { const sg = [0, 0, 0]; sg[axis] = sa; sg[u] = su; sg[v] = sv; return P(face, sg[0], sg[1], sg[2]); };
        const hint = [0, 0, 0]; hint[u] = su; hint[v] = sv;
        b.quad(mk(-1, u), mk(1, u), mk(1, v), mk(-1, v), w, 0, hint);
      }
    }
    for (const sx of S) for (const sy of S) for (const sz of S) b.tri(P(0, sx, sy, sz), P(1, sx, sy, sz), P(2, sx, sy, sz), w, 0, [sx, sy, sz]); // 8 corners
    return b.build();
  },
  cyl() { const b = new MeshBuilder(); b.cyl(0, -0.5, 0, 0.5, 0.5, 1, 12, [1, 1, 1]); return b.build(); },
  cone() { const b = new MeshBuilder(); b.cyl(0, -0.5, 0, 0.5, 0, 1, 10, [1, 1, 1]); return b.build(); },
  sphere() { const b = new MeshBuilder(); b.blob(0, 0, 0, 0.5, 0.5, 0.5, [1, 1, 1], { detail: 2 }); return b.build(); },
};

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
