/* 어스름 전선 — map: 지형(세 갈래 길·정글 오솔길·강·수풀), 보행 격자, 시야 차단, 길찾기(A*)
   좌우 대칭(x → W-x). 왼쪽 = 새벽 진영, 오른쪽 = 황혼 진영, 가운데 세로로 흐르는 넓은 강이 경계.
   강 위쪽 호수 = 고목 정령, 아래쪽 호수 = 이무기(팀 전체 버프). */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U;
  const W = C.W, H = C.H, N = W * H;
  const M = TW.Map = { W, H };

  /* ---------- 스플라인 ---------- */
  function catmull(ctrl, step) {
    if (ctrl.length === 2) {
      const a = ctrl[0], b = ctrl[1], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(d / step)), out = [];
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
  function mkPath(ctrl, hw, type) {
    const pts = catmull(ctrl, 1.5);
    const cum = new Float32Array(pts.length);
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return { pts, cum, len: cum[pts.length - 1], hw, type, ctrl };
  }
  const mx = (p) => [W - p[0], p[1]], my = (p) => [p[0], H - p[1]];

  /* ---------- 지형 정의 ----------
     '눈' 모양 전장: 두 본진에서 길 세 갈래가 부챗살처럼 벌어졌다가 넓은 강(어스름 강)에서 다시 만난다.
     윗길·아랫길은 활처럼 휘고, 가운뎃길은 곧다. 강에는 호수 둘(위 = 고목 정령, 아래 = 이무기)과 가운데 섬, 다리 넷. */
  const LANE_HW = 6.5, CX = W / 2, CY = H / 2;
  M.LANE_HW = LANE_HW; M.CX = CX; M.CY = CY;
  const topHalf = [[30, 66], [46, 46], [76, 28], [100, 19.5], [CX, 19]];       // 강을 건너는 곳(다리)은 거의 곧게
  const topCtrl = topHalf.concat(topHalf.slice(0, -1).reverse().map(mx));
  const midCtrl = [[42, CY], [W - 42, CY]];
  const botCtrl = topCtrl.map(my);
  M.lanes = [mkPath(topCtrl, LANE_HW, 'lane'), mkPath(midCtrl, LANE_HW, 'lane'), mkPath(botCtrl, LANE_HW, 'lane')];
  M.lanes.forEach((l, i) => { l.id = i; });

  /* 강: 위·아래 줄기는 곧고, 가운데에서는 두 갈래로 갈라져 버들잎 모양의 섬을 감싼다 (가운뎃길은 다리 → 섬 → 다리로 건넌다) */
  const armL = [[CX - 2.5, 57], [CX - 8.5, 67], [CX - 10.5, CY], [CX - 8.5, H - 67], [CX - 2.5, H - 57]];
  M.rivers = [mkPath([[CX, 23], [CX, 46]], 7.2, 'river'), mkPath([[CX, H - 46], [CX, H - 23]], 7.2, 'river'), mkPath(armL, 4.2, 'river'), mkPath(armL.map(mx), 4.2, 'river')];
  M.river = M.rivers[0];
  M.POND = null;
  M.pits = [{ x: CX, y: 50, r: 9.5, kind: 'elder' }, { x: CX, y: H - 50, r: 10.5, kind: 'boss' }];
  /* 다리(그림용): 세 길이 강을 건너는 자리 */
  M.bridges = [{ x: CX, y: 18.85, w: 18, h: 13.5 }, { x: CX - 10.5, y: CY, w: 11.6, h: 13.5 }, { x: CX + 10.5, y: CY, w: 11.6, h: 13.5 }, { x: CX, y: H - 18.85, w: 18, h: 13.5 }];

  M.PLAZA_R = 18;
  M.bases = [
    { core: { x: 26, y: CY }, fountain: { x: 9, y: CY } },
    { core: { x: W - 26, y: CY }, fountain: { x: W - 9, y: CY } },
  ];

  /* 정글 오솔길 (왼쪽 위 쐐기 기준 → 네 방향으로 대칭 복사) */
  const TRAIL_HW = 3.4;
  const quadTrails = [
    [[68, 74], [65, 60], [67, 48], [62, 40]],            // A: 가운뎃길 ↔ 윗길
    [[66, 54], [86, 52], [105, 50]],                     // B: A ↔ 강(위 호수)
    [[42, 70], [54, 62], [65, 60]],                      // C: 본진 ↔ A
    [[94, 74], [92, 63], [93, 52], [96, 40], [100, 30]], // D: 가운뎃길 ↔ B ↔ 윗길(강 쪽)
    [[80, 48], [80, 52]],                                // 샘지기 캠프 입구(남)
    [[74, 44], [67, 47]],                                // 샘지기 캠프 입구(서)
    [[80, 59], [80, 54]],                                // 버섯 캠프 입구(북)
    [[85, 64], [92, 63]],                                // 버섯 캠프 입구(동)
  ];
  const quadClear = [[80, 43, 5.8], [80, 64, 5.0], [103, 36, 5.0]];
  const mirrors = [(p) => [p[0], p[1]], mx, my, (p) => mx(my(p))];
  M.trails = []; M.clearings = [];
  for (const mf of mirrors) {
    for (const t of quadTrails) M.trails.push(mkPath(t.map(mf), TRAIL_HW, 'trail'));
    for (const c of quadClear) { const p = mf(c); M.clearings.push({ x: p[0], y: p[1], r: c[2] }); }
  }

  /* 수풀: 원 또는 캡슐. 왼쪽 위 쐐기 정의 → 대칭 복사 (각 복사본이 서로 다른 수풀) */
  const quadBush = [
    { a: [84, 20.2], b: [95, 16.4], r: 1.9 },            // 윗길 바깥 가장자리(강 가까이)
    { a: [50.3, 38.2], b: [57.1, 34.0], r: 1.9 },        // 윗길 바깥 가장자리(본진 가까이)
    { a: [94, 71.5], r: 3.0 },                           // D 입구(가운뎃길 기습 자리)
    { a: [68, 71.5], r: 3.0 },                           // A 입구(가운뎃길 쪽)
    { a: [63, 42], r: 2.8 },                             // A 입구(윗길 쪽)
    { a: [103, 50], r: 2.8 },                            // 위 호수 서쪽 입구
    { a: [108.5, 31], r: 2.4 },                          // 강가 갈대(윗길 ↔ 호수)
    { a: [105.5, 67], r: 2.4 },                          // 강가 갈대(호수 ↔ 가운뎃길)
    { a: [80, 50], r: 2.2 },                             // 샘지기 캠프 입구
    { a: [54, 62], r: 2.4 },                             // 본진에서 정글로 드는 길
  ];
  M.bushes = [];
  for (const mf of mirrors) for (const b of quadBush) {
    const a = mf(b.a), bb = b.b ? mf(b.b) : a;
    M.bushes.push({ x1: a[0], y1: a[1], x2: bb[0], y2: bb[1], r: b.r, id: M.bushes.length + 1, x: (a[0] + bb[0]) / 2, y: (a[1] + bb[1]) / 2 });
  }

  /* 중립 캠프. side: 0 = 새벽 쪽 정글, 1 = 황혼 쪽 정글, -1 = 강 */
  const quadCamps = [
    { kind: 'water', x: 80, y: 43, kindLow: 'fire' },
    { kind: 'shrooms', x: 80, y: 64, kindLow: 'crabs' },
    { kind: 'boar', x: 103, y: 36, kindLow: 'shrooms' },
  ];
  M.camps = [];
  for (let side = 0; side < 2; side++) for (let low = 0; low < 2; low++) for (const c of quadCamps) {
    M.camps.push({ id: M.camps.length, kind: low ? c.kindLow : c.kind, x: side ? W - c.x : c.x, y: low ? H - c.y : c.y, side, low: !!low });
  }
  M.camps.push({ id: M.camps.length, kind: 'elder', x: CX, y: 50, side: -1, low: false });
  M.camps.push({ id: M.camps.length, kind: 'boss', x: CX, y: H - 50, side: -1, low: true });

  /* ---------- 보행 격자 ---------- */
  const baseWalk = new Uint8Array(N);   // 지형만
  const blockCnt = new Uint8Array(N);   // 구조물 점유
  const walk = new Uint8Array(N);       // 최종 보행 가능
  const nav = new Uint8Array(N);        // 벽에서 한 칸 떨어진 여유 칸
  const water = new Uint8Array(N);      // 얕은 물(걸을 수 있음)
  const bush = new Uint8Array(N);       // 수풀 번호(0 = 없음)
  const laneMask = new Uint8Array(N);   // 1 = 길 바닥(렌더용)
  M.walk = walk; M.baseWalk = baseWalk; M.water = water; M.bushGrid = bush; M.laneMask = laneMask;

  function stamp(arr, x, y, r, val, onlyWalk) {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const dx = cx + 0.5 - x, dy = cy + 0.5 - y;
      if (dx * dx + dy * dy <= r2 && (!onlyWalk || baseWalk[cy * W + cx])) arr[cy * W + cx] = val;
    }
  }
  function carve(arr, path, val, hw) {
    const pts = path.pts; hw = hw || path.hw;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 0.5));
      for (let k = 0; k <= n; k++) stamp(arr, a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, hw, val);
    }
  }
  (function build() {
    for (const l of M.lanes) { carve(baseWalk, l, 1); carve(laneMask, l, 1); }
    for (const t of M.trails) carve(baseWalk, t, 1);
    for (const r of M.rivers) carve(baseWalk, r, 1);
    for (const c of M.clearings) stamp(baseWalk, c.x, c.y, c.r, 1);
    for (const p of M.pits) stamp(baseWalk, p.x, p.y, p.r, 1);
    for (const b of M.bases) { stamp(baseWalk, b.core.x, b.core.y, M.PLAZA_R, 1); stamp(laneMask, b.core.x, b.core.y, M.PLAZA_R, 1); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) baseWalk[y * W + x] = 0;
    // 물: 강 + 호수 둘. 세 길이 강을 건너는 곳은 다리(물 아님)
    for (const r of M.rivers) carve(water, r, 1);
    for (const p of M.pits) stamp(water, p.x, p.y, p.r, 1);
    for (const l of M.lanes) carve(water, l, 0);
    for (let i = 0; i < N; i++) if (!baseWalk[i]) water[i] = 0;
    // 수풀
    for (const b of M.bushes) {
      const d = Math.hypot(b.x2 - b.x1, b.y2 - b.y1), n = Math.max(1, Math.ceil(d / 0.5));
      for (let k = 0; k <= n; k++) stamp(bush, b.x1 + (b.x2 - b.x1) * k / n, b.y1 + (b.y2 - b.y1) * k / n, b.r, b.id, true);
    }
  })();

  function refresh(x0, y0, x1, y1) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; walk[i] = (baseWalk[i] && !blockCnt[i]) ? 1 : 0; }
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
  M.reset();

  /* 벽 안쪽 깊이 / 벽까지 거리 (렌더·AI용, 칸 단위 근사) */
  (function distField() {
    const INF = 255, wd = new Uint8Array(N), ed = new Uint8Array(N);
    for (let i = 0; i < N; i++) { wd[i] = baseWalk[i] ? 0 : INF; ed[i] = baseWalk[i] ? INF : 0; }
    const pass = (d) => {
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; const m = Math.min(d[i - 1], d[i - W], d[i - W - 1], d[i - W + 1]) + 1; if (m < d[i]) d[i] = m; }
      for (let y = H - 2; y >= 1; y--) for (let x = W - 2; x >= 1; x--) { const i = y * W + x; const m = Math.min(d[i + 1], d[i + W], d[i + W + 1], d[i + W - 1]) + 1; if (m < d[i]) d[i] = m; }
    };
    pass(wd); pass(ed);
    M.wallDepth = wd;     // 벽 칸: 가장 가까운 땅까지 칸 수 (땅 = 0)
    M.edgeDist = ed;      // 땅 칸: 가장 가까운 벽까지 칸 수 (벽 = 0)
  })();

  M.isWalkable = function (x, y) {
    if (!(x >= 0 && x < W && y >= 0 && y < H)) return false;
    return walk[(y | 0) * W + (x | 0)] === 1;
  };
  M.isGround = function (x, y) {
    if (!(x >= 0 && x < W && y >= 0 && y < H)) return false;
    return baseWalk[(y | 0) * W + (x | 0)] === 1;
  };
  M.isWater = function (x, y) {
    if (!(x >= 0 && x < W && y >= 0 && y < H)) return false;
    return water[(y | 0) * W + (x | 0)] === 1;
  };
  M.bushAt = function (x, y) {
    if (!(x >= 0 && x < W && y >= 0 && y < H)) return 0;
    return bush[(y | 0) * W + (x | 0)];
  };
  /* 진영 색조: 0 = 새벽(왼쪽) … 0.5 = 강 … 1 = 황혼(오른쪽) */
  M.terr = (x) => U.smooth((x - 78) / 84);

  /* 시야 차단: 나무(걸을 수 없는 지형)가 가로막으면 false */
  M.los = function (ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    if (d < 0.7) return true;
    const n = Math.ceil(d / 0.7), sx = dx / n, sy = dy / n;
    let x = ax, y = ay;
    for (let i = 1; i < n; i++) {
      x += sx; y += sy;
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      if (!baseWalk[(y | 0) * W + (x | 0)]) return false;
    }
    return true;
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
      if (best && r >= Math.sqrt(bd) + 1) break;
    }
    return best || { x: U.clamp(x, 3, W - 3), y: U.clamp(y, 3, H - 3) };
  };

  /* 두 점 사이를 곧장 걸어갈 수 있는가 (몸 너비 고려) */
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
  /* (ax,ay)에서 (bx,by) 쪽으로 벽에 막히기 전까지 갈 수 있는 지점 */
  M.rayWalk = function (ax, ay, bx, by, out) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    out = out || { x: ax, y: ay, hit: false };
    out.x = ax; out.y = ay; out.hit = false;
    if (d < 1e-6) return out;
    const n = Math.max(1, Math.ceil(d / 0.35));
    for (let i = 1; i <= n; i++) {
      const x = ax + dx * i / n, y = ay + dy * i / n;
      if (!M.isWalkable(x, y)) { out.hit = true; return out; }
      out.x = x; out.y = y;
    }
    return out;
  };

  /* ---------- A* ---------- */
  const gArr = new Float32Array(N), fArr = new Float32Array(N);
  const par = new Int32Array(N), openMark = new Uint32Array(N), closeMark = new Uint32Array(N);
  const HEAP_CAP = N * 4, heap = new Int32Array(HEAP_CAP);
  let heapN = 0, searchId = 0;
  function hpush(i) {
    if (heapN >= HEAP_CAP) return;
    let k = heapN++; heap[k] = i;
    while (k > 0) { const p = (k - 1) >> 1; if (fArr[heap[p]] <= fArr[heap[k]]) break; const tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp; k = p; }
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
  const NBX = [1, -1, 0, 0, 1, 1, -1, -1], NBY = [0, 0, 1, -1, 1, -1, 1, -1], NBC = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];
  M.pathCalls = 0;
  /* 반환: 지나갈 점들의 배열(시작점 제외, 마지막 = 목표) */
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
      if (++expansions > 30000) break;
      const cx = cur % W, cy = (cur / W) | 0;
      const hh = fArr[cur] - gArr[cur];
      if (hh < bestH) { bestH = hh; bestNode = cur; }
      for (let k = 0; k < 8; k++) {
        const nx = cx + NBX[k], ny = cy + NBY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (!walk[ni] || closeMark[ni] === searchId) continue;
        if (k >= 4 && (!walk[cy * W + nx] || !walk[ny * W + cx])) continue;
        const ng = gArr[cur] + NBC[k] * (nav[ni] ? 1 : 2.6);
        if (openMark[ni] !== searchId || ng < gArr[ni]) { gArr[ni] = ng; fArr[ni] = ng + hfun(nx, ny); par[ni] = cur; openMark[ni] = searchId; hpush(ni); }
      }
    }
    let node = found ? goal : bestNode;
    const cells = [];
    while (node !== -1 && cells.length < 4000) { cells.push(node); node = par[node]; }
    cells.reverse();
    const pts = [{ x: ax, y: ay }];
    for (let i = 1; i < cells.length; i++) pts.push({ x: (cells[i] % W) + 0.5, y: ((cells[i] / W) | 0) + 0.5 });
    if (found) pts.push({ x: bx, y: by });
    // 끈 당기기(직선화)
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let lo = i + 1, hi = Math.min(pts.length - 1, i + 90);
      if (hi > lo) {
        if (M.lineClear(pts[i].x, pts[i].y, pts[hi].x, pts[hi].y)) lo = hi;
        else { while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (M.lineClear(pts[i].x, pts[i].y, pts[mid].x, pts[mid].y)) lo = mid; else hi = mid; } }
      }
      out.push(pts[lo]); i = lo;
    }
    return out;
  };
  /* 경로 길이(걸어가는 거리) */
  M.pathLen = function (ax, ay, bx, by) {
    const p = M.findPath(ax, ay, bx, by); let d = 0, x = ax, y = ay;
    for (const q of p) { d += Math.hypot(q.x - x, q.y - y); x = q.x; y = q.y; }
    return d;
  };

  /* ---------- 길(라인) 헬퍼 ---------- */
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
  const _a = { x: 0, y: 0 }, _b = { x: 0, y: 0 };
  /* 진행 방향(새벽 → 황혼) 단위 벡터 */
  M.laneDir = function (lane, t, out) {
    M.lanePoint(lane, t - 1, _a); M.lanePoint(lane, t + 1, _b);
    const d = Math.hypot(_b.x - _a.x, _b.y - _a.y) || 1;
    out = out || { x: 0, y: 0 };
    out.x = (_b.x - _a.x) / d; out.y = (_b.y - _a.y) / d;
    return out;
  };
  M.laneProject = function (lane, x, y) {
    const L = M.lanes[lane], pts = L.pts;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const dx = pts[i].x - x, dy = pts[i].y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i; } }
    let t = L.cum[bi], d = Math.sqrt(bd);
    for (let j = bi - 1; j <= bi; j++) {
      if (j < 0 || j >= pts.length - 1) continue;
      const s = U.segPoint(x, y, pts[j].x, pts[j].y, pts[j + 1].x, pts[j + 1].y), sd = Math.sqrt(s.d2);
      if (sd <= d) { d = sd; t = L.cum[j] + (L.cum[j + 1] - L.cum[j]) * s.t; }
    }
    return { t, d };
  };
  /* 팀 기준 전진도(자기 본진 0 → 적 본진 len) ↔ 길 매개변수 */
  M.toT = (team, lane, prog) => (team === 0 ? prog : M.lanes[lane].len - prog);
  M.toProg = (team, lane, t) => (team === 0 ? t : M.lanes[lane].len - t);
  M.nearestLane = function (x, y) {
    let best = 0, bd = Infinity, bt = 0;
    for (let i = 0; i < 3; i++) { const p = M.laneProject(i, x, y); if (p.d < bd) { bd = p.d; best = i; bt = p.t; } }
    return { lane: best, d: bd, t: bt };
  };

  /* ---------- 구조물 자리: 길 위의 위치(전진도) + 옆으로 비킨 거리 ---------- */
  M.towers = [];
  const TOWER_PROG = { 1: [65, 44, 65], 2: [30, 18, 30] };     // tier → 길별 전진도 (1 = 바깥, 2 = 안쪽)
  for (let team = 0; team < 2; team++) for (let lane = 0; lane < 3; lane++) for (let tier = 1; tier <= 2; tier++) {
    const prog = TOWER_PROG[tier][lane], t = M.toT(team, lane, prog);
    const p = M.lanePoint(lane, t), d = M.laneDir(lane, t);
    // 길 가장자리 쪽으로 비켜 세운다: 윗길은 바깥(위)쪽, 아랫길은 바깥(아래)쪽, 가운뎃길은 위쪽
    let nx = -d.y, ny = d.x;
    const outward = lane === 2 ? 1 : -1;
    if (ny * outward < 0 || (Math.abs(ny) < 0.2 && nx * (team === 0 ? -1 : 1) < 0)) { nx = -nx; ny = -ny; }
    M.towers.push({ team, lane, tier, x: p.x + nx * 4.9, y: p.y + ny * 4.9, t, prog });      // 미니언 줄(±2.1)에 걸리지 않을 만큼 비킨다
  }

  /* 길가 등불(장식 + 빛). 강 위와 구조물 근처는 건너뛴다 */
  M.lamps = [];
  for (let lane = 0; lane < 3; lane++) {
    const L = M.lanes[lane]; let k = 0;
    for (let t = 16; t < L.len / 2 - 12; t += 17.5, k++) {
      const p = M.lanePoint(lane, t), d = M.laneDir(lane, t), s = (k % 2 ? 1 : -1) * (LANE_HW - 0.7);
      const x = p.x - d.y * s, y = p.y + d.x * s;
      let near = false;
      for (const tw of M.towers) if (U.dist(tw.x, tw.y, x, y) < 6) near = true;
      if (near || !M.isGround(x, y) || M.isWater(x, y)) continue;
      M.lamps.push({ x, y }); M.lamps.push({ x: W - x, y });      // 좌우 대칭
    }
  }
  /* 가운데 섬의 쌍등불 (길 양옆) */
  M.lamps.push({ x: CX, y: CY - LANE_HW - 0.9 }, { x: CX, y: CY + LANE_HW + 0.9 });
})();
