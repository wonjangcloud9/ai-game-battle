// AURORA FALL — navigation grid (1 m cells) + A* path finding for bots (no DOM dependencies)
'use strict';

const Nav = {
  N: 0, cost: null, reach: null,
  _g: null, _f: null, _parent: null, _state: null, _stamp: null, _stampId: 0, _heap: null,
  INFLATE: 0.4,
  stats: { searches: 0, expanded: 0 },

  build() {
    const N = this.N = Terrain.SIZE, H = Terrain.HALF;
    const cost = this.cost = new Uint8Array(N * N);
    // terrain pass
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i - H + 0.5, z = j - H + 0.5;
      const h = Terrain.height(x, z);
      let c = 1;
      if (i < 3 || j < 3 || i >= N - 3 || j >= N - 3) c = 0;
      else if (h < -CFG.SWIM_DEPTH) c = 9;
      else if (h < -0.15) c = 4;
      else {
        const st = Terrain.steepness(x, z);
        if (st > 1.0) c = 0; else if (st > 0.62) c = 3;
      }
      cost[j * N + i] = c;
    }
    // colliders pass
    const inf = this.INFLATE;
    for (const col of Phys.cols) {
      if (!(col.flags & F_NAV)) continue;
      let ex, ez;
      if (col.t === COL_CYL) { ex = ez = col.r + inf; }
      else { ex = Math.abs(col.hx * col.c) + Math.abs(col.hz * col.s) + inf * 1.5; ez = Math.abs(col.hx * col.s) + Math.abs(col.hz * col.c) + inf * 1.5; }
      const i0 = Math.max(0, Math.floor(col.x - ex + H)), i1 = Math.min(N - 1, Math.ceil(col.x + ex + H));
      const j0 = Math.max(0, Math.floor(col.z - ez + H)), j1 = Math.min(N - 1, Math.ceil(col.z + ez + H));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = i - H + 0.5, z = j - H + 0.5;
        const dx = x - col.x, dz = z - col.z;
        if (col.t === COL_CYL) { const rr = col.r + inf; if (dx * dx + dz * dz > rr * rr) continue; }
        else {
          const lx = dx * col.c - dz * col.s, lz = dx * col.s + dz * col.c;
          if (Math.abs(lx) > col.hx + inf || Math.abs(lz) > col.hz + inf) continue;
        }
        if (col.t !== COL_RAMP) {
          const g = Terrain.height(x, z);
          if (!(col.y0 < g + 1.6 && col.y1 > g + 0.62)) continue;
        }
        cost[j * N + i] = 0;
      }
    }
    // reachability flood fill from the island centre
    const reach = this.reach = new Uint8Array(N * N);
    let seed = -1;
    const town = Terrain.pois[0];
    for (let r = 0; r < 40 && seed < 0; r++) {
      const i = Math.floor(town.x + H) + r + 8, j = Math.floor(town.z + H) + r + 14;
      if (cost[j * N + i] === 1) seed = j * N + i;
    }
    const stack = new Int32Array(N * N);
    let sp = 0;
    stack[sp++] = seed; reach[seed] = 1;
    while (sp > 0) {
      const k = stack[--sp];
      const i = k % N, j = (k / N) | 0;
      if (i > 0 && !reach[k - 1] && cost[k - 1]) { reach[k - 1] = 1; stack[sp++] = k - 1; }
      if (i < N - 1 && !reach[k + 1] && cost[k + 1]) { reach[k + 1] = 1; stack[sp++] = k + 1; }
      if (j > 0 && !reach[k - N] && cost[k - N]) { reach[k - N] = 1; stack[sp++] = k - N; }
      if (j < N - 1 && !reach[k + N] && cost[k + N]) { reach[k + N] = 1; stack[sp++] = k + N; }
    }
    this._g = new Float32Array(N * N); this._f = new Float32Array(N * N);
    this._parent = new Int32Array(N * N); this._stamp = new Uint32Array(N * N); this._closed = new Uint32Array(N * N);
    this._heap = new Int32Array(N * N > 400000 ? 400000 : N * N);
    this._stampId = 0;
  },

  cellOf(x, z) {
    const N = this.N, H = Terrain.HALF;
    const i = clamp(Math.floor(x + H), 0, N - 1), j = clamp(Math.floor(z + H), 0, N - 1);
    return j * N + i;
  },
  costAt(x, z) { return this.cost[this.cellOf(x, z)]; },
  // walkable, dry-ish and connected to the main island
  isOpen(x, z) { const k = this.cellOf(x, z); return this.reach[k] === 1 && this.cost[k] > 0 && this.cost[k] < 4; },
  // Nearest reachable cell (spiral search). land=true additionally avoids water. Returns cell index or -1.
  nearestFree(x, z, maxR, land) {
    const N = this.N, H = Terrain.HALF, cost = this.cost, reach = this.reach;
    const ci = clamp(Math.floor(x + H), 1, N - 2), cj = clamp(Math.floor(z + H), 1, N - 2);
    const ok = k => reach[k] === 1 && cost[k] > 0 && (!land || cost[k] < 4);
    if (ok(cj * N + ci)) return cj * N + ci;
    for (let r = 1; r <= maxR; r++) {
      let best = -1, bd = 1e9;
      for (let d = -r; d <= r; d++) {
        const cand = [[ci + d, cj - r], [ci + d, cj + r], [ci - r, cj + d], [ci + r, cj + d]];
        for (const [i, j] of cand) {
          if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
          const k = j * N + i;
          if (!ok(k)) continue;
          const dd = (i - ci) * (i - ci) + (j - cj) * (j - cj);
          if (dd < bd) { bd = dd; best = k; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  },
  cellX(k) { return (k % this.N) - Terrain.HALF + 0.5; },
  cellZ(k) { return ((k / this.N) | 0) - Terrain.HALF + 0.5; },

  // Grid line of sight between two cells: every touched cell must be walkable and cheap.
  lineClear(k0, k1, maxCost) {
    const N = this.N, cost = this.cost;
    let x0 = k0 % N, y0 = (k0 / N) | 0;
    const x1 = k1 % N, y1 = (k1 / N) | 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    maxCost = maxCost || 2;
    for (let guard = 0; guard < 4096; guard++) {
      const c = cost[y0 * N + x0];
      if (c === 0 || c > maxCost) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy && e2 < dx) { // diagonal step: also check both orthogonal neighbours (no corner cutting)
        const ca = cost[y0 * N + x0 + sx], cb = cost[(y0 + sy) * N + x0];
        if (ca === 0 || cb === 0 || ca > maxCost || cb > maxCost) return false;
      }
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return false;
  },
  lineClearWorld(ax, az, bx, bz) { return this.lineClear(this.cellOf(ax, az), this.cellOf(bx, bz), 3); },

  // A* with a slightly weighted heuristic. Returns a flat array [x0, z0, x1, z1, ...] or null.
  findPath(sx, sz, tx, tz, maxExpand) {
    const N = this.N, cost = this.cost;
    let start = this.nearestFree(sx, sz, 6, false);
    let goal = this.nearestFree(tx, tz, 40, false);
    if (start < 0 || goal < 0) return null;
    this.stats.searches++;
    if (start === goal) return [this.cellX(goal), this.cellZ(goal)];
    const g = this._g, f = this._f, parent = this._parent, stamp = this._stamp, closed = this._closed, heap = this._heap;
    const id = ++this._stampId;
    const gi = goal % N, gj = (goal / N) | 0;
    const W = 1.3;
    const hfn = k => { const dx = Math.abs((k % N) - gi), dy = Math.abs(((k / N) | 0) - gj); return (dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx) * W; };
    let hn = 0;
    const push = k => {
      let i = hn++;
      if (i >= heap.length) { hn--; return; }
      heap[i] = k;
      while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[k]) break; heap[i] = heap[p]; i = p; }
      heap[i] = k;
    };
    const pop = () => {
      const top = heap[0], last = heap[--hn];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= hn) break;
        if (c + 1 < hn && f[heap[c + 1]] < f[heap[c]]) c++;
        if (f[heap[c]] >= f[last]) break;
        heap[i] = heap[c]; i = c;
      }
      heap[i] = last;
      return top;
    };
    g[start] = 0; f[start] = hfn(start); parent[start] = -1; stamp[start] = id;
    push(start);
    let best = start, bestH = f[start], expanded = 0, found = false;
    maxExpand = maxExpand || 60000;
    const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (hn > 0) {
      const k = pop();
      if (closed[k] === id) continue;
      closed[k] = id;
      if (k === goal) { found = true; break; }
      if (++expanded > maxExpand) break;
      const ki = k % N, kj = (k / N) | 0, gk = g[k];
      for (let d = 0; d < 8; d++) {
        const ni = ki + DI[d], nj = kj + DJ[d];
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni, c = cost[nk];
        if (c === 0 || closed[nk] === id) continue;
        if (d >= 4 && (cost[kj * N + ni] === 0 || cost[nj * N + ki] === 0)) continue;
        const ng = gk + (d >= 4 ? 1.4142 : 1) * c;
        if (stamp[nk] === id && ng >= g[nk]) continue;
        const h = hfn(nk);
        g[nk] = ng; f[nk] = ng + h; parent[nk] = k; stamp[nk] = id;
        if (h < bestH) { bestH = h; best = nk; }
        push(nk);
      }
    }
    this.stats.expanded += expanded;
    let end = found ? goal : best;
    if (end === start) return null;
    // reconstruct + string-pull
    const cells = [];
    for (let k = end; k !== -1; k = parent[k]) cells.push(k);
    cells.reverse();
    const out = [];
    let anchor = 0;
    while (anchor < cells.length - 1) {
      let far = anchor + 1;
      const lim = Math.min(cells.length - 1, anchor + 60);
      for (let q = lim; q > anchor + 1; q--) { if (this.lineClear(cells[anchor], cells[q], 2)) { far = q; break; } }
      out.push(this.cellX(cells[far]), this.cellZ(cells[far]));
      anchor = far;
    }
    out.partial = !found;
    return out;
  },

  // Random open land position within [rMin, rMax] of (x, z); returns [x, z] or null.
  randomOpen(x, z, rMin, rMax, rng) {
    for (let t = 0; t < 24; t++) {
      const a = rng() * TAU, r = rMin + (rMax - rMin) * Math.sqrt(rng());
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (Terrain.inBounds(px, pz, 30) && this.isOpen(px, pz)) return [px, pz];
    }
    return null;
  },
};
