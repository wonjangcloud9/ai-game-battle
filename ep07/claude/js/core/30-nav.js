/* 해돌전쟁 — 길찾기
   타일 격자 + 흐름장(목표에서 퍼지는 거리장). 같은 목표를 가진 유닛들이 한 장을 함께 쓴다. */
'use strict';
(function (g) {
  var R = g.RTS, TILE = R.TILE;
  var INF = 65535;
  var DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];

  function Nav(map) {
    this.w = map.w; this.h = map.h; this.n = map.w * map.h;
    this.terrain = map.terrain;
    this.occ = new Int32Array(this.n);
    this.pass = [new Uint8Array(this.n), new Uint8Array(this.n)];
    this.version = 0;
    this.fields = new Map();
    this.clock = 0;
    this.heap = new Float64Array(this.n * 8 + 16);
    this.reg = [new Int32Array(this.n), new Int32Array(this.n)];
    this.regVer = [-1, -1];
    this.fieldComputes = 0;
    this.rebuild();
  }

  Nav.prototype.rebuild = function () {
    var n = this.n, t = this.terrain, occ = this.occ, p0 = this.pass[0], p1 = this.pass[1];
    for (var i = 0; i < n; i++) {
      var free = occ[i] === 0;
      p0[i] = (free && t[i] === 0) ? 1 : 0;
      p1[i] = (free && t[i] <= 1) ? 1 : 0;
    }
    this.version++;
  };

  Nav.prototype.setOcc = function (tx, ty, w, h, id, noRebuild) {
    for (var y = ty; y < ty + h; y++) for (var x = tx; x < tx + w; x++) {
      if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.occ[y * this.w + x] = id;
    }
    if (!noRebuild) this.rebuild();
  };
  Nav.prototype.clearOcc = function (tx, ty, w, h, noRebuild) { this.setOcc(tx, ty, w, h, 0, noRebuild); };

  Nav.prototype.passable = function (layer, tx, ty) {
    if (layer === 2) return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.pass[layer][ty * this.w + tx] === 1;
  };

  // 가장 가까운 지나갈 수 있는 칸 (없으면 -1)
  Nav.prototype.nearestPassable = function (layer, tx, ty, maxR) {
    var w = this.w, h = this.h, pass = this.pass[layer];
    tx = R.clamp(tx, 0, w - 1); ty = R.clamp(ty, 0, h - 1);
    if (pass[ty * w + tx]) return ty * w + tx;
    for (var rad = 1; rad <= maxR; rad++) {
      var best = -1, bd = 1e9;
      for (var y = ty - rad; y <= ty + rad; y++) {
        if (y < 0 || y >= h) continue;
        var edge = (y === ty - rad || y === ty + rad);
        for (var x = tx - rad; x <= tx + rad; x += (edge ? 1 : 2 * rad)) {
          if (x < 0 || x >= w) continue;
          if (pass[y * w + x]) {
            var d = (x - tx) * (x - tx) + (y - ty) * (y - ty);
            if (d < bd) { bd = d; best = y * w + x; }
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  };

  // 사각형(건물·자원) 둘레의 지나갈 수 있는 칸들
  Nav.prototype.ringCells = function (layer, tx, ty, w, h) {
    var out = [], pass = this.pass[layer], W = this.w, H = this.h;
    for (var y = ty - 1; y <= ty + h; y++) {
      if (y < 0 || y >= H) continue;
      for (var x = tx - 1; x <= tx + w; x++) {
        if (x < 0 || x >= W) continue;
        if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
        if (pass[y * W + x]) out.push(y * W + x);
      }
    }
    return out;
  };

  // 다익스트라: seeds에서 모든 칸까지의 거리 (직선 10, 대각 14)
  Nav.prototype.computeField = function (layer, seeds, reuse) {
    var n = this.n, w = this.w, h = this.h, pass = this.pass[layer];
    var dist = reuse || new Uint16Array(n);
    dist.fill(INF);
    var heap = this.heap, hn = 0, i, key, p, c;
    this.fieldComputes++;
    for (i = 0; i < seeds.length; i++) {
      var s = seeds[i];
      if (dist[s] === 0) continue;
      dist[s] = 0;
      // push
      c = hn++; key = s;
      while (c > 0) { p = (c - 1) >> 1; if (heap[p] <= key) break; heap[c] = heap[p]; c = p; }
      heap[c] = key;
    }
    while (hn > 0) {
      // pop
      var top = heap[0];
      var last = heap[--hn];
      if (hn > 0) {
        c = 0;
        for (;;) {
          var l = c * 2 + 1; if (l >= hn) break;
          var r = l + 1, m = (r < hn && heap[r] < heap[l]) ? r : l;
          if (heap[m] >= last) break;
          heap[c] = heap[m]; c = m;
        }
        heap[c] = last;
      }
      var idx = top % 65536, cost = (top - idx) / 65536;
      if (cost > dist[idx]) continue;
      var x = idx % w, y = (idx - x) / w;
      for (var d = 0; d < 8; d++) {
        var nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var ni = ny * w + nx;
        if (!pass[ni]) continue;
        var nd;
        if (d >= 4) {
          if (!pass[idx + DX[d]] || !pass[idx + DY[d] * w]) continue;   // 모서리 끼어들기 금지
          nd = cost + 14;
        } else nd = cost + 10;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          c = hn++; key = nd * 65536 + ni;
          while (c > 0) { p = (c - 1) >> 1; if (heap[p] <= key) break; heap[c] = heap[p]; c = p; }
          heap[c] = key;
        }
      }
    }
    return dist;
  };

  /* goal: { key, cell } (지점)  또는  { key, tx, ty, w, h } (사각형 둘레) */
  Nav.prototype.getField = function (layer, goal) {
    var k = layer + goal.key;
    var f = this.fields.get(k);
    if (f && f.ver === this.version) { f.used = ++this.clock; return f.dist; }
    var seeds;
    if (goal.cell !== undefined) {
      var c = goal.cell;
      if (!this.pass[layer][c]) c = this.nearestPassable(layer, c % this.w, (c / this.w) | 0, 14);
      seeds = c >= 0 ? [c] : [];
    } else {
      seeds = this.ringCells(layer, goal.tx, goal.ty, goal.w, goal.h);
    }
    var dist = this.computeField(layer, seeds, f ? f.dist : null);
    if (f) { f.ver = this.version; f.used = ++this.clock; }
    else {
      this.fields.set(k, { dist: dist, ver: this.version, used: ++this.clock });
      if (this.fields.size > 120) this.evict();
    }
    return dist;
  };

  Nav.prototype.evict = function () {
    var arr = [];
    this.fields.forEach(function (v, key) { arr.push([v.used, key]); });
    arr.sort(function (a, b) { return a[0] - b[0]; });
    for (var i = 0; i < 40 && i < arr.length; i++) this.fields.delete(arr[i][1]);
  };

  Nav.prototype.descend = function (dist, pass, c) {
    var w = this.w, h = this.h, x = c % w, y = (c - x) / w;
    var best = -1, bd = dist[c];
    for (var d = 0; d < 8; d++) {
      var nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      var ni = ny * w + nx;
      if (dist[ni] >= bd) continue;
      if (d >= 4 && (!pass[c + DX[d]] || !pass[c + DY[d] * w])) continue;
      bd = dist[ni]; best = ni;
    }
    return best;
  };

  // 흐름장을 따라 몇 칸 앞을 내다보고, 곧장 갈 수 있는 가장 먼 칸을 돌려준다.
  // state: 0 = 이동할 지점 있음, 1 = 목표 칸에 도착, 2 = 도달 불가
  var WP = { x: 0, y: 0, state: 0 };
  Nav.prototype.waypoint = function (dist, layer, x, y, r) {
    var w = this.w, h = this.h, pass = this.pass[layer];
    var cx = R.clamp((x / TILE) | 0, 0, w - 1), cy = R.clamp((y / TILE) | 0, 0, h - 1);
    var c = cy * w + cx;
    if (!pass[c]) {
      var e = this.nearestPassable(layer, cx, cy, 5);
      if (e < 0) { WP.state = 2; return WP; }
      WP.x = (e % w + 0.5) * TILE; WP.y = (((e / w) | 0) + 0.5) * TILE; WP.state = 0;
      return WP;
    }
    var d = dist[c];
    if (d === INF) { WP.state = 2; return WP; }
    if (d === 0) { WP.state = 1; return WP; }
    var cur = c, bx = -1, by = 0;
    for (var step = 0; step < 10; step++) {
      var nb = this.descend(dist, pass, cur);
      if (nb < 0) break;
      cur = nb;
      var wx = (cur % w + 0.5) * TILE, wy = (((cur / w) | 0) + 0.5) * TILE;
      if (step === 0) { bx = wx; by = wy; }
      else if (this.lineClear(layer, x, y, wx, wy, r)) { bx = wx; by = wy; }
      else break;
      if (dist[cur] === 0) break;
    }
    if (bx < 0) { WP.state = 1; return WP; }
    WP.x = bx; WP.y = by; WP.state = 0;
    return WP;
  };

  // 반지름 r인 유닛이 (x0,y0)→(x1,y1) 직선으로 지나갈 수 있는가
  Nav.prototype.lineClear = function (layer, x0, y0, x1, y1, r) {
    var pass = this.pass[layer], w = this.w, h = this.h;
    var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy);
    var rr = Math.min(r, 13) * 0.7;
    var n = Math.max(1, Math.ceil(len / 10));
    for (var i = 1; i <= n; i++) {
      var t = i / n, px = x0 + dx * t, py = y0 + dy * t;
      if (px - rr < 0 || py - rr < 0) return false;
      var ax = ((px - rr) / TILE) | 0, bx = ((px + rr) / TILE) | 0, ay = ((py - rr) / TILE) | 0, by = ((py + rr) / TILE) | 0;
      if (bx >= w || by >= h) return false;
      if (!pass[ay * w + ax] || !pass[ay * w + bx] || !pass[by * w + ax] || !pass[by * w + bx]) return false;
    }
    return true;
  };

  // 이어진 구역 번호 (모서리 끼어들기 금지 규칙에서는 4방향 연결과 같다)
  Nav.prototype.regions = function (layer) {
    if (this.regVer[layer] === this.version) return this.reg[layer];
    var n = this.n, w = this.w, h = this.h, pass = this.pass[layer], reg = this.reg[layer];
    reg.fill(0);
    var label = 0, stack = [];
    for (var i = 0; i < n; i++) {
      if (!pass[i] || reg[i]) continue;
      label++; reg[i] = label; stack.push(i);
      while (stack.length) {
        var c = stack.pop(), x = c % w, y = (c - x) / w;
        if (x > 0 && pass[c - 1] && !reg[c - 1]) { reg[c - 1] = label; stack.push(c - 1); }
        if (x < w - 1 && pass[c + 1] && !reg[c + 1]) { reg[c + 1] = label; stack.push(c + 1); }
        if (y > 0 && pass[c - w] && !reg[c - w]) { reg[c - w] = label; stack.push(c - w); }
        if (y < h - 1 && pass[c + w] && !reg[c + w]) { reg[c + w] = label; stack.push(c + w); }
      }
    }
    this.regVer[layer] = this.version;
    return reg;
  };

  // (x,y)에 있는 유닛이 갈 수 있는 칸 중 (gx,gy)에 가장 가까운 칸
  Nav.prototype.closestReachable = function (layer, x, y, gx, gy) {
    var w = this.w, h = this.h, reg = this.regions(layer);
    var cx = R.clamp((x / TILE) | 0, 0, w - 1), cy = R.clamp((y / TILE) | 0, 0, h - 1);
    var lab = reg[cy * w + cx];
    if (!lab) {
      var e = this.nearestPassable(layer, cx, cy, 5);
      if (e < 0) return -1;
      lab = reg[e];
    }
    var tx = gx / TILE - 0.5, ty = gy / TILE - 0.5, best = -1, bd = 1e12;
    for (var i = 0, n = this.n; i < n; i++) {
      if (reg[i] !== lab) continue;
      var ix = i % w, iy = (i - ix) / w;
      var d = (ix - tx) * (ix - tx) + (iy - ty) * (iy - ty);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  Nav.prototype.sameRegion = function (layer, x0, y0, x1, y1) {
    if (layer === 2) return true;
    var w = this.w, reg = this.regions(layer);
    var a = reg[R.clamp((y0 / TILE) | 0, 0, this.h - 1) * w + R.clamp((x0 / TILE) | 0, 0, w - 1)];
    var b = reg[R.clamp((y1 / TILE) | 0, 0, this.h - 1) * w + R.clamp((x1 / TILE) | 0, 0, w - 1)];
    return a !== 0 && a === b;
  };

  R.Nav = Nav;
  R.NAV_INF = INF;
})(typeof globalThis !== 'undefined' ? globalThis : this);
