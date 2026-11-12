// AURORA FALL — static collision world: oriented boxes, ramps, cylinders in a spatial hash + terrain (no DOM)
'use strict';

const COL_BOX = 0, COL_CYL = 1, COL_RAMP = 2;
const F_SOLID = 1, F_BULLET = 2, F_NAV = 4, F_ALL = 7;

const Phys = {
  CELL: 8, n: 0, cells: null, cols: [], stamp: null, stampId: 1,
  hit: { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, kind: 0, col: null },

  reset() {
    this.n = Math.ceil(Terrain.SIZE / this.CELL);
    this.cells = new Array(this.n * this.n);
    this.cols = [];
    this.stamp = null;
  },
  _insert(col, ex, ez) {
    const n = this.n, C = this.CELL, H = Terrain.HALF;
    const i0 = clamp(Math.floor((col.x - ex + H) / C), 0, n - 1), i1 = clamp(Math.floor((col.x + ex + H) / C), 0, n - 1);
    const j0 = clamp(Math.floor((col.z - ez + H) / C), 0, n - 1), j1 = clamp(Math.floor((col.z + ez + H) / C), 0, n - 1);
    const idx = this.cols.length;
    col.idx = idx;
    this.cols.push(col);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (this.cells[j * n + i] || (this.cells[j * n + i] = [])).push(idx);
    return col;
  },
  // Box given by centre, full size and yaw
  addBox(cx, cy, cz, sx, sy, sz, yaw, flags) {
    const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0), hx = sx / 2, hz = sz / 2;
    const col = { t: COL_BOX, x: cx, z: cz, y0: cy - sy / 2, y1: cy + sy / 2, hx, hz, c, s, flags: flags === undefined ? F_ALL : flags };
    return this._insert(col, Math.abs(hx * c) + Math.abs(hz * s), Math.abs(hx * s) + Math.abs(hz * c));
  },
  // Ramp: footprint sx by sz, top rises from yLow at local -x to yHigh at local +x.
  // thick > 0 makes it a thin sloped slab (open underneath); otherwise it is solid down to yBase.
  addRamp(cx, cz, sx, sz, yaw, yBase, yLow, yHigh, flags, thick) {
    const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0), hx = sx / 2, hz = sz / 2;
    const th = thick > 0 ? thick : 1e9;
    const col = { t: COL_RAMP, x: cx, z: cz, y0: thick > 0 ? Math.min(yLow, yHigh) - thick : yBase, y1: Math.max(yLow, yHigh), yLo: yLow, yHi: yHigh, th, hx, hz, c, s, flags: flags === undefined ? F_ALL : flags };
    return this._insert(col, Math.abs(hx * c) + Math.abs(hz * s), Math.abs(hx * s) + Math.abs(hz * c));
  },
  addCyl(x, z, r, y0, y1, flags) {
    const col = { t: COL_CYL, x, z, y0, y1, r, flags: flags === undefined ? F_ALL : flags };
    return this._insert(col, r, r);
  },
  finalize() { this.stamp = new Int32Array(this.cols.length); this.stampId = 1; },

  rampTop(col, x, z) {
    const lx = (x - col.x) * col.c - (z - col.z) * col.s;
    const t = clamp((lx + col.hx) / (2 * col.hx), 0, 1);
    return col.yLo + (col.yHi - col.yLo) * t;
  },

  // Push a vertical cylinder (feet at y, height hgt) out of solid colliders. pos = {x, z}. Returns true if anything was hit.
  collideXZ(pos, y, r, hgt) {
    const n = this.n, C = this.CELL, H = Terrain.HALF, cells = this.cells, cols = this.cols, stamp = this.stamp;
    const stepTop = y + CFG.STEP_HEIGHT, head = y + hgt;
    let any = false;
    for (let iter = 0; iter < 2; iter++) {
      let hitNow = false;
      const id = ++this.stampId;
      const i0 = clamp(Math.floor((pos.x - r + H) / C), 0, n - 1), i1 = clamp(Math.floor((pos.x + r + H) / C), 0, n - 1);
      const j0 = clamp(Math.floor((pos.z - r + H) / C), 0, n - 1), j1 = clamp(Math.floor((pos.z + r + H) / C), 0, n - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const list = cells[j * n + i];
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const ci = list[k];
          if (stamp[ci] === id) continue;
          stamp[ci] = id;
          const col = cols[ci];
          if (!(col.flags & F_SOLID) || col.y0 >= head) continue;
          if (col.t === COL_CYL) {
            if (col.y1 <= stepTop) continue;
            const dx = pos.x - col.x, dz = pos.z - col.z, rr = r + col.r, d2 = dx * dx + dz * dz;
            if (d2 >= rr * rr) continue;
            const d = Math.sqrt(d2);
            if (d < 1e-4) { pos.x += rr; } else { const push = rr - d; pos.x += dx / d * push; pos.z += dz / d * push; }
            hitNow = true;
            continue;
          }
          const dx = pos.x - col.x, dz = pos.z - col.z;
          const lx = dx * col.c - dz * col.s, lz = dx * col.s + dz * col.c;
          if (lx < -col.hx - r || lx > col.hx + r || lz < -col.hz - r || lz > col.hz + r) continue;
          const top = col.t === COL_RAMP ? col.yLo + (col.yHi - col.yLo) * clamp((lx + col.hx) / (2 * col.hx), 0, 1) : col.y1;
          if (top <= stepTop) continue;
          if (col.t === COL_RAMP && top - col.th >= head) continue; // open underneath
          const qx = lx < -col.hx ? -col.hx : lx > col.hx ? col.hx : lx, qz = lz < -col.hz ? -col.hz : lz > col.hz ? col.hz : lz;
          const ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
          if (d2 >= r * r) continue;
          let nx, nz, push;
          if (d2 > 1e-9) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; push = r - d; }
          else {
            const px = col.hx - Math.abs(lx), pz = col.hz - Math.abs(lz);
            if (px < pz) { nx = lx < 0 ? -1 : 1; nz = 0; push = px + r; } else { nx = 0; nz = lz < 0 ? -1 : 1; push = pz + r; }
          }
          pos.x += (nx * col.c + nz * col.s) * push;
          pos.z += (-nx * col.s + nz * col.c) * push;
          hitNow = true;
        }
      }
      if (!hitNow) break;
      any = true;
    }
    return any;
  },

  // Highest walkable surface under a cylinder at (x, z) that is not higher than y + step.
  groundHeight(x, z, y, r) {
    let g = Terrain.height(x, z);
    const n = this.n, C = this.CELL, H = Terrain.HALF, cells = this.cells, cols = this.cols, stamp = this.stamp;
    const lim = y + CFG.STEP_HEIGHT, m = r * 0.35;
    const id = ++this.stampId;
    const i0 = clamp(Math.floor((x - r + H) / C), 0, n - 1), i1 = clamp(Math.floor((x + r + H) / C), 0, n - 1);
    const j0 = clamp(Math.floor((z - r + H) / C), 0, n - 1), j1 = clamp(Math.floor((z + r + H) / C), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const list = cells[j * n + i];
      if (!list) continue;
      for (let k = 0; k < list.length; k++) {
        const ci = list[k];
        if (stamp[ci] === id) continue;
        stamp[ci] = id;
        const col = cols[ci];
        if (!(col.flags & F_SOLID)) continue;
        if (col.t === COL_CYL) {
          if (col.y1 > lim || col.y1 <= g) continue;
          const dx = x - col.x, dz = z - col.z, rr = col.r + m;
          if (dx * dx + dz * dz < rr * rr) g = col.y1;
          continue;
        }
        const dx = x - col.x, dz = z - col.z;
        const lx = dx * col.c - dz * col.s, lz = dx * col.s + dz * col.c;
        if (lx < -col.hx - m || lx > col.hx + m || lz < -col.hz - m || lz > col.hz + m) continue;
        const top = col.t === COL_RAMP ? col.yLo + (col.yHi - col.yLo) * clamp((lx + col.hx) / (2 * col.hx), 0, 1) : col.y1;
        if (top > lim || top <= g) continue;
        g = top;
      }
    }
    return g;
  },

  // Lowest solid underside above the head (for jumping inside buildings). Returns Infinity if none.
  ceilingHeight(x, z, headY, r) {
    let best = Infinity;
    const n = this.n, C = this.CELL, H = Terrain.HALF, cells = this.cells, cols = this.cols;
    const i = clamp(Math.floor((x + H) / C), 0, n - 1), j = clamp(Math.floor((z + H) / C), 0, n - 1);
    const list = cells[j * n + i];
    if (!list) return best;
    for (let k = 0; k < list.length; k++) {
      const col = cols[list[k]];
      if (col.t !== COL_BOX || !(col.flags & F_SOLID) || col.y0 < headY - 0.35 || col.y0 >= best) continue;
      const dx = x - col.x, dz = z - col.z;
      const lx = dx * col.c - dz * col.s, lz = dx * col.s + dz * col.c;
      if (Math.abs(lx) <= col.hx + r * 0.5 && Math.abs(lz) <= col.hz + r * 0.5) best = col.y0;
    }
    return best;
  },

  _rayCol(col, ox, oy, oz, dx, dy, dz, tMax) {
    // returns t or -1; writes normal into this._n
    const N = this._n;
    if (col.t === COL_CYL) {
      const px = ox - col.x, pz = oz - col.z;
      const a = dx * dx + dz * dz;
      let tHit = -1;
      if (a > 1e-9) {
        const b = px * dx + pz * dz, c = px * px + pz * pz - col.r * col.r;
        const disc = b * b - a * c;
        if (disc >= 0) {
          const t = (-b - Math.sqrt(disc)) / a;
          if (t >= 0 && t < tMax) {
            const y = oy + dy * t;
            if (y >= col.y0 && y <= col.y1) { N[0] = (px + dx * t) / col.r; N[1] = 0; N[2] = (pz + dz * t) / col.r; tHit = t; }
          }
        }
      }
      if (tHit < 0 && dy < -1e-6 && oy > col.y1) { // top cap
        const t = (col.y1 - oy) / dy;
        if (t >= 0 && t < tMax) {
          const qx = px + dx * t, qz = pz + dz * t;
          if (qx * qx + qz * qz <= col.r * col.r) { N[0] = 0; N[1] = 1; N[2] = 0; tHit = t; }
        }
      }
      return tHit;
    }
    const rx = ox - col.x, rz = oz - col.z;
    const lox = rx * col.c - rz * col.s, loz = rx * col.s + rz * col.c;
    const ldx = dx * col.c - dz * col.s, ldz = dx * col.s + dz * col.c;
    let t0 = 0, t1 = tMax, axis = -1, sgn = 0;
    // x slab
    if (Math.abs(ldx) < 1e-9) { if (lox < -col.hx || lox > col.hx) return -1; }
    else {
      let ta = (-col.hx - lox) / ldx, tb = (col.hx - lox) / ldx, s = -1;
      if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
      if (ta > t0) { t0 = ta; axis = 0; sgn = s; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    if (Math.abs(dy) < 1e-9) { if (oy < col.y0 || oy > col.y1) return -1; }
    else {
      let ta = (col.y0 - oy) / dy, tb = (col.y1 - oy) / dy, s = -1;
      if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
      if (ta > t0) { t0 = ta; axis = 1; sgn = s; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    if (Math.abs(ldz) < 1e-9) { if (loz < -col.hz || loz > col.hz) return -1; }
    else {
      let ta = (-col.hz - loz) / ldz, tb = (col.hz - loz) / ldz, s = -1;
      if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
      if (ta > t0) { t0 = ta; axis = 2; sgn = s; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    if (col.t === COL_RAMP) {
      // signed height above the sloped surface at the entry / exit of the bounding box
      const k = (col.yHi - col.yLo) / (2 * col.hx);
      const f0 = (oy + dy * t0) - (col.yLo + k * (lox + ldx * t0 + col.hx));
      const f1 = (oy + dy * t1) - (col.yLo + k * (lox + ldx * t1 + col.hx));
      const l = 1 / Math.hypot(k, 1), lnx = -k * l;
      if (f0 > 0.001) {
        if (f1 >= 0) return -1;
        N[0] = lnx * col.c; N[1] = l; N[2] = -lnx * col.s;
        return t0 + (t1 - t0) * f0 / (f0 - f1);
      }
      if (f0 < -col.th) { // below a thin ramp: can only hit its underside
        if (f1 <= -col.th) return -1;
        N[0] = -lnx * col.c; N[1] = -l; N[2] = lnx * col.s;
        return t0 + (t1 - t0) * (-col.th - f0) / (f1 - f0);
      }
    }
    if (axis < 0) { N[0] = -dx; N[1] = -dy; N[2] = -dz; return 0; } // origin inside
    if (axis === 1) { N[0] = 0; N[1] = sgn; N[2] = 0; }
    else if (axis === 0) { N[0] = sgn * col.c; N[1] = 0; N[2] = -sgn * col.s; }
    else { N[0] = sgn * col.s; N[1] = 0; N[2] = sgn * col.c; }
    return t0;
  },
  _n: [0, 1, 0],

  // Ray vs static world. Returns hit distance (maxDist if nothing was hit); details in Phys.hit (kind 0 = none).
  raycast(ox, oy, oz, dx, dy, dz, maxDist, mask, skipTerrain) {
    const hit = this.hit;
    hit.kind = 0; hit.col = null;
    let best = maxDist;
    mask = mask === undefined ? F_BULLET : mask;
    // ---- terrain (adaptive march + bisection)
    if (!skipTerrain) {
      const top = Terrain.maxHeight + 1;
      if (!(oy > top && dy >= 0)) {
        let t = 0;
        if (oy > top && dy < 0) t = (top - oy) / dy;
        let prevT = t, prevD = (oy + dy * t) - Terrain.height(ox + dx * t, oz + dz * t);
        if (prevD < 0) { best = Math.min(best, t); hit.kind = 1; }
        else while (t < best) {
          const stepLen = Math.max(1.2, prevD * 0.45);
          t = Math.min(best, t + stepLen);
          const y = oy + dy * t;
          if (y > top && dy >= 0) break;
          const d = y - Terrain.height(ox + dx * t, oz + dz * t);
          if (d < 0) {
            let a = prevT, b = t;
            for (let k = 0; k < 7; k++) { const m = (a + b) / 2; if ((oy + dy * m) - Terrain.height(ox + dx * m, oz + dz * m) < 0) b = m; else a = m; }
            best = a; hit.kind = 1;
            break;
          }
          prevT = t; prevD = d;
        }
        if (hit.kind === 1) {
          const px = ox + dx * best, pz = oz + dz * best;
          Terrain.normal(px, pz, this._n);
          hit.nx = this._n[0]; hit.ny = this._n[1]; hit.nz = this._n[2];
        }
      }
    }
    // ---- colliders (grid traversal)
    const n = this.n, C = this.CELL, H = Terrain.HALF, cells = this.cells, cols = this.cols, stamp = this.stamp;
    const id = ++this.stampId;
    let gx = (ox + H) / C, gz = (oz + H) / C;
    let ix = Math.floor(gx), iz = Math.floor(gz);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? C / Math.abs(dx) : Infinity, tdz = Math.abs(dz) > 1e-9 ? C / Math.abs(dz) : Infinity;
    let tmx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (ix + 1 - gx) : (gx - ix)) * tdx) : Infinity;
    let tmz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (iz + 1 - gz) : (gz - iz)) * tdz) : Infinity;
    let tEnter = 0, guard = 0;
    while (tEnter <= best && guard++ < 400) {
      if (ix >= 0 && iz >= 0 && ix < n && iz < n) {
        const list = cells[iz * n + ix];
        if (list) for (let k = 0; k < list.length; k++) {
          const ci = list[k];
          if (stamp[ci] === id) continue;
          stamp[ci] = id;
          const col = cols[ci];
          if (!(col.flags & mask)) continue;
          const t = this._rayCol(col, ox, oy, oz, dx, dy, dz, best);
          if (t >= 0 && t < best) { best = t; hit.kind = 2; hit.col = col; hit.nx = this._n[0]; hit.ny = this._n[1]; hit.nz = this._n[2]; }
        }
      } else if ((ix < 0 && sx < 0) || (ix >= n && sx > 0) || (iz < 0 && sz < 0) || (iz >= n && sz > 0)) break;
      if (tmx < tmz) { tEnter = tmx; tmx += tdx; ix += sx; } else { tEnter = tmz; tmz += tdz; iz += sz; }
    }
    hit.t = best;
    hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
    return best;
  },

  // True when nothing blocks the segment a -> b.
  segmentClear(ax, ay, az, bx, by, bz, mask) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    dx /= len; dy /= len; dz /= len;
    this.raycast(ax, ay, az, dx, dy, dz, len - 0.05, mask);
    return this.hit.kind === 0;
  },
};
