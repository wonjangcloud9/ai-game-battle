/* 청홍대전 — map: 3라인 지형, 보행 격자, 길찾기(A*) */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const C = AOS.C, U = AOS.U;
  const W = C.W, H = C.H, N = W * H;
  const M = AOS.Map = { W, H };

  /* ---------- 스플라인 ---------- */
  function catmull(ctrl, step) {
    if (ctrl.length === 2) {
      const [a, b] = ctrl; const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(d / step)); const out = [];
      for (let i = 0; i <= n; i++) out.push({ x: a[0] + (b[0] - a[0]) * i / n, y: a[1] + (b[1] - a[1]) * i / n });
      return out;
    }
    const out = [];
    const P = (i) => ctrl[U.clamp(i, 0, ctrl.length - 1)];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.max(2, Math.ceil(d / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          y: 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        });
      }
    }
    const last = ctrl[ctrl.length - 1];
    out.push({ x: last[0], y: last[1] });
    return out;
  }
  function mkPath(ctrl, hw, type, step) {
    const pts = catmull(ctrl, step || 1.5);
    const cum = new Float32Array(pts.length);
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return { pts, cum, len: cum[pts.length - 1], hw, type, ctrl };
  }

  /* ---------- 지형 정의 ---------- */
  const LANE_HW = 7;
  const topCtrl = [[30, 66], [38, 40], [56, 22], [84, 15], [130, 13], [176, 15], [204, 22], [222, 40], [230, 66]];
  const midCtrl = [[40, 80], [220, 80]];
  const botCtrl = topCtrl.map(p => [p[0], H - p[1]]);
  M.lanes = [mkPath(topCtrl, LANE_HW, 'lane'), mkPath(midCtrl, LANE_HW, 'lane'), mkPath(botCtrl, LANE_HW, 'lane')];
  M.lanes.forEach((l, i) => { l.id = i; });
  M.LANE_HW = LANE_HW;

  const quad = [
    { c: [[88, 15], [86, 34], [90, 56], [88, 80]], hw: 4.2 },
    { c: [[88, 46], [108, 48], [130, 44]], hw: 4.2 },
    { c: [[50, 29], [60, 42], [66, 50]], hw: 4.0 },
    { c: [[66, 50], [78, 54], [89, 56]], hw: 4.0 },
    { c: [[66, 50], [64, 66], [66, 80]], hw: 4.0 },
    { c: [[108, 48], [106, 64], [108, 80]], hw: 4.0 },
  ];
  const quadClear = [[66, 50, 6.5], [108, 48, 6.5]];
  const mirrors = [(p) => [p[0], p[1]], (p) => [W - p[0], p[1]], (p) => [p[0], H - p[1]], (p) => [W - p[0], H - p[1]]];
  M.jungle = [];
  M.clearings = [];
  for (const mf of mirrors) {
    for (const q of quad) M.jungle.push(mkPath(q.c.map(mf), q.hw, 'jungle'));
    for (const c of quadClear) { const p = mf(c); M.clearings.push({ x: p[0], y: p[1], r: c[2] }); }
  }
  M.clearings.push({ x: 130, y: 80, r: 9.5 });
  M.river = mkPath([[130, 13], [126, 40], [134, 62], [130, 80], [126, 98], [134, 120], [130, 147]], 6.5, 'river');

  M.PLAZA_R = 24;
  M.bases = [
    { core: { x: 26, y: 80 }, fountain: { x: 9, y: 80 } },
    { core: { x: W - 26, y: 80 }, fountain: { x: W - 9, y: 80 } },
  ];
  /* 타워: tier 1 = 외곽, tier 2 = 내부 */
  const blueTowers = [
    { lane: C.TOP, tier: 1, x: 96, y: 9.2 }, { lane: C.TOP, tier: 2, x: 43, y: 27 },
    { lane: C.MID, tier: 1, x: 98, y: 74.5 }, { lane: C.MID, tier: 2, x: 62, y: 74.5 },
    { lane: C.BOT, tier: 1, x: 96, y: H - 9.2 }, { lane: C.BOT, tier: 2, x: 43, y: H - 27 },
  ];
  M.towers = [];
  for (const t of blueTowers) M.towers.push({ team: 0, lane: t.lane, tier: t.tier, x: t.x, y: t.y });
  for (const t of blueTowers) M.towers.push({ team: 1, lane: 2 - t.lane, tier: t.tier, x: W - t.x, y: H - t.y });

  /* ---------- 보행 격자 ---------- */
  const baseWalk = new Uint8Array(N);   // 지형만 반영
  const blockCnt = new Uint8Array(N);   // 구조물 점유
  const walk = new Uint8Array(N);       // 최종 보행 가능
  const nav = new Uint8Array(N);        // 벽에서 한 칸 떨어진 여유 칸
  M.walk = walk; M.baseWalk = baseWalk;

  function stamp(arr, x, y, r, val) {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const dx = cx + 0.5 - x, dy = cy + 0.5 - y;
      if (dx * dx + dy * dy <= r2) arr[cy * W + cx] = val;
    }
  }
  function carve(path) {
    const pts = path.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 0.5));
      for (let k = 0; k <= n; k++) stamp(baseWalk, a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, path.hw, 1);
    }
  }
  function buildBase() {
    baseWalk.fill(0);
    for (const l of M.lanes) carve(l);
    for (const j of M.jungle) carve(j);
    carve(M.river);
    for (const c of M.clearings) stamp(baseWalk, c.x, c.y, c.r, 1);
    for (const b of M.bases) stamp(baseWalk, b.core.x, b.core.y, M.PLAZA_R, 1);
    // 맵 가장자리 2칸은 항상 막힘
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) baseWalk[y * W + x] = 0;
    }
  }
  function refresh(x0, y0, x1, y1) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x; walk[i] = (baseWalk[i] && !blockCnt[i]) ? 1 : 0;
    }
    for (let y = Math.max(1, y0 - 1); y <= Math.min(H - 2, y1 + 1); y++) for (let x = Math.max(1, x0 - 1); x <= Math.min(W - 2, x1 + 1); x++) {
      const i = y * W + x;
      nav[i] = (walk[i] && walk[i - 1] && walk[i + 1] && walk[i - W] && walk[i + W] && walk[i - W - 1] && walk[i - W + 1] && walk[i + W - 1] && walk[i + W + 1]) ? 1 : 0;
    }
  }
  M.reset = function () { blockCnt.fill(0); refresh(0, 0, W - 1, H - 1); };
  M.setBlock = function (x, y, r, on) {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const dx = cx + 0.5 - x, dy = cy + 0.5 - y;
      if (dx * dx + dy * dy <= r2) { const i = cy * W + cx; if (on) blockCnt[i]++; else if (blockCnt[i] > 0) blockCnt[i]--; }
    }
    refresh(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  };
  buildBase();
  M.reset();

  M.isWalkable = function (x, y) {
    if (!(x >= 0 && x < W && y >= 0 && y < H)) return false;
    return walk[(y | 0) * W + (x | 0)] === 1;
  };
  /* 지형 기준(구조물 무시) 보행 가능 여부 — 렌더러 장식 배치용 */
  M.isGround = function (x, y) {
    if (!(x >= 0 && x < W && y >= 0 && y < H)) return false;
    return baseWalk[(y | 0) * W + (x | 0)] === 1;
  };
  M.nearestWalkable = function (x, y, maxR) {
    if (M.isWalkable(x, y)) return { x, y };
    maxR = maxR || 16;
    const cx = U.clamp(Math.floor(x), 0, W - 1), cy = U.clamp(Math.floor(y), 0, H - 1);
    let best = null, bd = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !walk[ny * W + nx]) continue;
        const d = (nx + 0.5 - x) * (nx + 0.5 - x) + (ny + 0.5 - y) * (ny + 0.5 - y);
        if (d < bd) { bd = d; best = { x: nx + 0.5, y: ny + 0.5 }; }
      }
      if (best && r * r > bd + 2) break;
      if (best && r >= Math.sqrt(bd) + 1) break;
    }
    return best || { x: U.clamp(x, 3, W - 3), y: U.clamp(y, 3, H - 3) };
  };

  M.lineClear = function (ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    if (d < 1e-6) return M.isWalkable(ax, ay);
    const n = Math.ceil(d / 0.45);
    const ox = -dy / d * 0.55, oy = dx / d * 0.55;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + dx * t, y = ay + dy * t;
      if (!M.isWalkable(x, y)) return false;
      const fromEnds = Math.min(t * d, (1 - t) * d);
      if (fromEnds > 0.9 && (!M.isWalkable(x + ox, y + oy) || !M.isWalkable(x - ox, y - oy))) return false;
    }
    return true;
  };

  /* ---------- A* ---------- */
  const gArr = new Float32Array(N), fArr = new Float32Array(N);
  const par = new Int32Array(N), openMark = new Uint32Array(N), closeMark = new Uint32Array(N);
  const HEAP_CAP = N * 4;
  const heap = new Int32Array(HEAP_CAP);
  let heapN = 0, searchId = 0;
  function hpush(i) {
    if (heapN >= HEAP_CAP) return;
    let k = heapN++; heap[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (fArr[heap[p]] <= fArr[heap[k]]) break;
      const tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp; k = p;
    }
  }
  function hpop() {
    const top = heap[0]; heapN--;
    if (heapN > 0) {
      heap[0] = heap[heapN];
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1; let m = k;
        if (l < heapN && fArr[heap[l]] < fArr[heap[m]]) m = l;
        if (r < heapN && fArr[heap[r]] < fArr[heap[m]]) m = r;
        if (m === k) break;
        const tmp = heap[m]; heap[m] = heap[k]; heap[k] = tmp; k = m;
      }
    }
    return top;
  }
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  M.pathCalls = 0;

  M.findPath = function (ax, ay, bx, by) {
    const goalP = M.nearestWalkable(bx, by);
    bx = goalP.x; by = goalP.y;
    if (!M.isWalkable(ax, ay)) { const s = M.nearestWalkable(ax, ay); ax = s.x; ay = s.y; }
    if (M.lineClear(ax, ay, bx, by)) return [{ x: bx, y: by }];
    M.pathCalls++;
    const sx = ax | 0, sy = ay | 0, gx = bx | 0, gy = by | 0;
    const start = sy * W + sx, goal = gy * W + gx;
    if (start === goal) return [{ x: bx, y: by }];
    searchId++; if (searchId > 4e9) { searchId = 1; openMark.fill(0); closeMark.fill(0); }
    heapN = 0;
    const hfun = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); };
    gArr[start] = 0; fArr[start] = hfun(sx, sy); par[start] = -1; openMark[start] = searchId; hpush(start);
    let found = false, expansions = 0, bestNode = start, bestH = fArr[start];
    while (heapN > 0) {
      const cur = hpop();
      if (closeMark[cur] === searchId) continue;
      closeMark[cur] = searchId;
      if (cur === goal) { found = true; break; }
      if (++expansions > 26000) break;
      const cx = cur % W, cy = (cur / W) | 0;
      const hh = fArr[cur] - gArr[cur];
      if (hh < bestH) { bestH = hh; bestNode = cur; }
      for (let k = 0; k < 8; k++) {
        const nb = NB[k], nx = cx + nb[0], ny = cy + nb[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (!walk[ni] || closeMark[ni] === searchId) continue;
        if (k >= 4 && (!walk[cy * W + nx] || !walk[ny * W + cx])) continue;
        const ng = gArr[cur] + nb[2] * (nav[ni] ? 1 : 2.6);
        if (openMark[ni] !== searchId || ng < gArr[ni]) {
          gArr[ni] = ng; fArr[ni] = ng + hfun(nx, ny); par[ni] = cur; openMark[ni] = searchId; hpush(ni);
        }
      }
    }
    let node = found ? goal : bestNode;
    const cells = [];
    while (node !== -1 && cells.length < 4000) { cells.push(node); node = par[node]; }
    cells.reverse();
    const pts = [{ x: ax, y: ay }];
    for (let i = 1; i < cells.length; i++) pts.push({ x: (cells[i] % W) + 0.5, y: ((cells[i] / W) | 0) + 0.5 });
    if (found) pts.push({ x: bx, y: by });
    // 직선화(끈 당기기)
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let lo = i + 1, hi = Math.min(pts.length - 1, i + 90);
      if (hi > lo) {
        if (M.lineClear(pts[i].x, pts[i].y, pts[hi].x, pts[hi].y)) lo = hi;
        else {
          while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (M.lineClear(pts[i].x, pts[i].y, pts[mid].x, pts[mid].y)) lo = mid; else hi = mid;
          }
        }
      }
      out.push(pts[lo]); i = lo;
    }
    return out;
  };

  /* ---------- 라인 헬퍼 ---------- */
  M.lanePoint = function (lane, t, out) {
    const L = M.lanes[lane], cum = L.cum, pts = L.pts;
    out = out || { x: 0, y: 0 };
    if (t <= 0) { out.x = pts[0].x; out.y = pts[0].y; return out; }
    if (t >= L.len) { const p = pts[pts.length - 1]; out.x = p.x; out.y = p.y; return out; }
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= t) lo = mid; else hi = mid; }
    const f = (t - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    out.x = pts[lo].x + (pts[hi].x - pts[lo].x) * f;
    out.y = pts[lo].y + (pts[hi].y - pts[lo].y) * f;
    return out;
  };
  /* 진행 방향(파랑 → 빨강) 단위 벡터 */
  M.laneDir = function (lane, t, out) {
    const a = M.lanePoint(lane, t - 1, { x: 0, y: 0 }), b = M.lanePoint(lane, t + 1, { x: 0, y: 0 });
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    out = out || { x: 0, y: 0 };
    out.x = (b.x - a.x) / d; out.y = (b.y - a.y) / d;
    return out;
  };
  M.laneProject = function (lane, x, y) {
    const L = M.lanes[lane], pts = L.pts;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - x, dy = pts[i].y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    let t = L.cum[bi], d = Math.sqrt(bd);
    // 인접 선분으로 보정
    for (const j of [bi - 1, bi]) {
      if (j < 0 || j >= pts.length - 1) continue;
      const s = U.segPoint(x, y, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y);
      const sd = Math.sqrt(s.d2);
      if (sd <= d) { d = sd; t = L.cum[j] + (L.cum[j + 1] - L.cum[j]) * s.t; }
    }
    return { t, d };
  };
  /* 팀 기준 전진도(자기 본진 쪽 0 → 적 본진 쪽 len) ↔ 라인 매개변수 */
  M.toT = (team, lane, prog) => (team === 0 ? prog : M.lanes[lane].len - prog);
  M.toProg = (team, lane, t) => (team === 0 ? t : M.lanes[lane].len - t);
  M.nearestLane = function (x, y) {
    let best = 0, bd = Infinity, bt = 0;
    for (let i = 0; i < 3; i++) { const p = M.laneProject(i, x, y); if (p.d < bd) { bd = p.d; best = i; bt = p.t; } }
    return { lane: best, d: bd, t: bt };
  };

  /* 타워의 라인 매개변수 */
  for (const t of M.towers) t.t = M.laneProject(t.lane, t.x, t.y).t;
})();
