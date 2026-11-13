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
    this.buildVehicleLayer();
  },

  // ---- a second grid for vehicles (the functions below take `veh` = true to work on it)
  // Every solid obstacle counts here, also the trees and small props a walker simply brushes past, and each is grown by
  // the width of a vehicle. Water and steep ground are out. Cost: 1 on a road, 2 in the open, more close to obstacles
  // and on slopes, so that a driver keeps to the roads and gives things a wide berth.
  vcost: null, vreach: null,
  VEH_CLEAR: 1.25, VEH_STEEP: 0.75,
  buildVehicleLayer() {
    const N = this.N, H = Terrain.HALF, cost = this.cost;
    const v = this.vcost = new Uint8Array(N * N);
    for (let j = 12; j < N - 12; j++) for (let i = 12; i < N - 12; i++) {
      const k = j * N + i;
      if (cost[k] === 0) continue;                           // (terrain a walker cannot cross, walls, big rocks)
      const x = i - H + 0.5, z = j - H + 0.5, h = Terrain.height(x, z);
      if (h < -0.35) continue;
      const st = Terrain.steepness(x, z);
      if (st > this.VEH_STEEP) continue;
      v[k] = h < -0.05 || st > 0.45 ? 4 : Terrain.roadDist(x, z) < 3.2 ? 1 : 2;
    }
    const inf = this.VEH_CLEAR;
    for (const col of Phys.cols) {
      if (!(col.flags & F_SOLID)) continue;
      let ex, ez;
      if (col.t === COL_CYL) { ex = ez = col.r + inf; }
      else { ex = Math.abs(col.hx * col.c) + Math.abs(col.hz * col.s) + inf; ez = Math.abs(col.hx * col.s) + Math.abs(col.hz * col.c) + inf; }
      const i0 = Math.max(0, Math.floor(col.x - ex + H)), i1 = Math.min(N - 1, Math.ceil(col.x + ex + H));
      const j0 = Math.max(0, Math.floor(col.z - ez + H)), j1 = Math.min(N - 1, Math.ceil(col.z + ez + H));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (!v[j * N + i]) continue;
        const x = i - H + 0.5, z = j - H + 0.5, dx = x - col.x, dz = z - col.z;
        if (col.t === COL_CYL) { const rr = col.r + inf; if (dx * dx + dz * dz > rr * rr) continue; }
        else {
          // rounded box: the obstacle grown by `inf` in every direction
          const lx = Math.abs(dx * col.c - dz * col.s) - col.hx, lz = Math.abs(dx * col.s + dz * col.c) - col.hz;
          if (lx > inf || lz > inf || (lx > 0 && lz > 0 && lx * lx + lz * lz > inf * inf)) continue;
        }
        if (col.t !== COL_RAMP) {
          const g = Terrain.height(x, z);
          if (!(col.y0 < g + 2.0 && col.y1 > g + 0.6)) continue;      // overhead, or low enough to drive over
        }
        v[j * N + i] = 0;
      }
    }
    // two rings of costlier cells around everything that blocks
    for (let ring = 0; ring < 2; ring++) {
      const mark = ring ? 3 : 5, edge = ring ? 5 : 0;
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const k = j * N + i, c = v[k];
        if (c === 0 || c >= mark) continue;
        if (v[k - 1] === edge || v[k + 1] === edge || v[k - N] === edge || v[k + N] === edge || v[k - N - 1] === edge || v[k - N + 1] === edge || v[k + N - 1] === edge || v[k + N + 1] === edge) v[k] = ring ? mark : 255;
      }
      if (!ring) for (let k = 0; k < v.length; k++) if (v[k] === 255) v[k] = mark;       // (marked afterwards, so that the ring does not grow from itself)
    }
    // what can be reached on wheels from the town
    const reach = this.vreach = new Uint8Array(N * N);
    const town = Terrain.pois[0];
    let seed = -1;
    for (let r = 0; r < 60 && seed < 0; r++) for (let a = 0; a < 16 && seed < 0; a++) {
      const k = this.cellOf(town.x + Math.cos(a / 16 * TAU) * (18 + r), town.z + Math.sin(a / 16 * TAU) * (18 + r));
      if (v[k] > 0 && v[k] <= 2) seed = k;
    }
    if (seed < 0) return;
    const stack = new Int32Array(N * N);
    let sp = 0;
    stack[sp++] = seed; reach[seed] = 1;
    while (sp > 0) {
      const k = stack[--sp];
      const i = k % N, j = (k / N) | 0;
      if (i > 0 && !reach[k - 1] && v[k - 1]) { reach[k - 1] = 1; stack[sp++] = k - 1; }
      if (i < N - 1 && !reach[k + 1] && v[k + 1]) { reach[k + 1] = 1; stack[sp++] = k + 1; }
      if (j > 0 && !reach[k - N] && v[k - N]) { reach[k - N] = 1; stack[sp++] = k - N; }
      if (j < N - 1 && !reach[k + N] && v[k + N]) { reach[k + N] = 1; stack[sp++] = k + N; }
    }
  },
  // can a vehicle stand here (and get to the rest of the island from here)?
  isDrivable(x, z) { const k = this.cellOf(x, z); return this.vreach[k] === 1 && this.vcost[k] > 0; },

  cellOf(x, z) {
    const N = this.N, H = Terrain.HALF;
    const i = clamp(Math.floor(x + H), 0, N - 1), j = clamp(Math.floor(z + H), 0, N - 1);
    return j * N + i;
  },
  costAt(x, z) { return this.cost[this.cellOf(x, z)]; },
  // walkable, dry-ish and connected to the main island
  isOpen(x, z) { const k = this.cellOf(x, z); return this.reach[k] === 1 && this.cost[k] > 0 && this.cost[k] < 4; },
  // Nearest reachable cell (spiral search). land=true additionally avoids water. Returns cell index or -1.
  nearestFree(x, z, maxR, land, veh) {
    const N = this.N, H = Terrain.HALF, cost = veh ? this.vcost : this.cost, reach = veh ? this.vreach : this.reach;
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
  lineClear(k0, k1, maxCost, veh) {
    const N = this.N, cost = veh ? this.vcost : this.cost;
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
  // veh: plan for a vehicle (its own grid; the heuristic leans harder on the goal, since most of that grid costs 2 a cell)
  // A search runs in three parts (_begin / _step / _finish) so that it can be spread over several frames: the bots ask
  // for their routes with request(), and pump() works a limited number of cells per frame off the queue. A long search
  // took 10 - 30 ms in one go, which is a frame or two of a 60 Hz display. findPath() is the same search done at once.
  findPath(sx, sz, tx, tz, maxExpand, veh) {
    const S = this._begin(sx, sz, tx, tz, maxExpand, veh);
    if (!S) return null;
    for (const r of this._q) r.S = null;        // (one that was half done shares the work arrays: it starts over)
    this._step(S, 1e9);
    return this._finish(S);
  },
  _begin(sx, sz, tx, tz, maxExpand, veh) {
    const N = this.N, start = this.nearestFree(sx, sz, veh ? 9 : 6, false, veh), goal = this.nearestFree(tx, tz, 40, false, veh);
    if (start < 0 || goal < 0) return null;
    this.stats.searches++;
    const S = { start, goal, veh: !!veh, max: maxExpand || 60000, expanded: 0, hn: 0, id: ++this._stampId, gi: goal % N, gj: (goal / N) | 0, W: veh ? 2 : 1.3, best: start, bestH: 0, found: start === goal, done: start === goal };
    if (!S.done) {
      const dx = Math.abs((start % N) - S.gi), dy = Math.abs(((start / N) | 0) - S.gj), h = (dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx) * S.W;
      this._g[start] = 0; this._f[start] = h; this._parent[start] = -1; this._stamp[start] = S.id;
      this._heap[0] = start; S.hn = 1; S.bestH = h;
    }
    return S;
  },
  // Expand up to `cells` cells of the search S. Returns how many were expanded; S.done says whether that was all of it.
  _step(S, cells) {
    if (S.done) return 0;
    const N = this.N, cost = S.veh ? this.vcost : this.cost;
    const g = this._g, f = this._f, parent = this._parent, stamp = this._stamp, closed = this._closed, heap = this._heap, cap = heap.length;
    const id = S.id, goal = S.goal, gi = S.gi, gj = S.gj, W = S.W, DI = this._DI, DJ = this._DJ;
    let hn = S.hn, used = 0, best = S.best, bestH = S.bestH, expanded = S.expanded;
    const limit = S.max;
    while (hn > 0) {
      // ---- pop the cell with the lowest f
      const k = heap[0], last = heap[--hn];
      if (hn > 0) {
        let i = 0;
        const fl = f[last];
        for (;;) {
          let c = 2 * i + 1;
          if (c >= hn) break;
          if (c + 1 < hn && f[heap[c + 1]] < f[heap[c]]) c++;
          if (f[heap[c]] >= fl) break;
          heap[i] = heap[c]; i = c;
        }
        heap[i] = last;
      }
      if (closed[k] === id) continue;
      closed[k] = id;
      if (k === goal) { S.found = true; S.done = true; break; }
      if (++expanded > limit) { S.done = true; break; }
      used++;
      const ki = k % N, kj = (k / N) | 0, gk = g[k];
      for (let d = 0; d < 8; d++) {
        const ni = ki + DI[d], nj = kj + DJ[d];
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nk = nj * N + ni, c = cost[nk];
        if (c === 0 || closed[nk] === id) continue;
        if (d >= 4 && (cost[kj * N + ni] === 0 || cost[nj * N + ki] === 0)) continue;
        const ng = gk + (d >= 4 ? 1.4142 : 1) * c;
        if (stamp[nk] === id && ng >= g[nk]) continue;
        const dx = ni > gi ? ni - gi : gi - ni, dy = nj > gj ? nj - gj : gj - nj, h = (dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx) * W;
        const fn = ng + h;
        g[nk] = ng; f[nk] = fn; parent[nk] = k; stamp[nk] = id;
        if (h < bestH) { bestH = h; best = nk; }
        // ---- push
        if (hn < cap) {
          let i = hn++;
          while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= fn) break; heap[i] = heap[p]; i = p; }
          heap[i] = nk;
        }
      }
      if (used >= cells) break;
    }
    if (hn === 0) S.done = true;
    this.stats.expanded += expanded - S.expanded;
    S.hn = hn; S.best = best; S.bestH = bestH; S.expanded = expanded;
    return used;
  },
  _DI: [1, -1, 0, 0, 1, 1, -1, -1], _DJ: [0, 0, 1, -1, 1, -1, 1, -1],
  // The route a finished search has found: string-pulled, or the way to the cell nearest the goal when that was not reached.
  _finish(S) {
    const start = S.start, goal = S.goal, veh = S.veh, parent = this._parent;
    if (start === goal) return [this.cellX(goal), this.cellZ(goal)];
    const end = S.found ? goal : S.best;
    if (end === start) return null;
    const cells = [];
    for (let k = end; k !== -1; k = parent[k]) cells.push(k);
    cells.reverse();
    const out = [];
    let anchor = 0;
    while (anchor < cells.length - 1) {
      let far = anchor + 1;
      const lim = Math.min(cells.length - 1, anchor + 60);
      for (let q = lim; q > anchor + 1; q--) { if (this.lineClear(cells[anchor], cells[q], veh ? 3 : 2, veh)) { far = q; break; } }
      out.push(this.cellX(cells[far]), this.cellZ(cells[far]));
      anchor = far;
    }
    out.partial = !S.found;
    return out;
  },
  // ---- routes for the bots, a little per frame
  // request(): queue a search for `owner` (whose earlier request, if any, is dropped); cb(path or null, request) is called
  // from pump() when it is done. pump(cells): expand at most that many cells now, first come first served.
  _q: [],
  START_COST: 60,           // what setting up and tracing back one search counts for, in cells
  request(owner, sx, sz, tx, tz, maxExpand, veh, cb) {
    this.cancel(owner);
    const r = { owner, sx, sz, tx, tz, max: maxExpand, veh: !!veh, cb, S: null };
    this._q.push(r);
    return r;
  },
  cancel(owner) {
    const q = this._q;
    for (let i = 0; i < q.length; i++) if (q[i].owner === owner) { q.splice(i, 1); return; }
  },
  // is a request of this owner still in the queue?
  waiting(owner) {
    const q = this._q;
    for (let i = 0; i < q.length; i++) if (q[i].owner === owner) return true;
    return false;
  },
  pump(cells) {
    const q = this._q;
    while (q.length && cells > 0) {
      const r = q[0];
      if (!r.S) {
        r.S = this._begin(r.sx, r.sz, r.tx, r.tz, r.max, r.veh);
        cells -= this.START_COST;
        if (!r.S) { q.shift(); r.cb(null, r); continue; }
      }
      cells -= this._step(r.S, Math.max(1, cells));
      if (!r.S.done) break;
      if (q[0] === r) q.shift();
      r.cb(this._finish(r.S), r);
    }
  },
  clearRequests() { this._q.length = 0; },

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
