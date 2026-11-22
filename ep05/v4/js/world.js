/* 어스름 전선 — world: 월드 렌더러의 뼈대 (카메라 · 지형 타일 · 전장의 안개와 조명 · 그리기 순서 · 집기)
   시점: 땅을 비스듬히 내려다본다. 땅은 세로로 K 만큼 눌려 보이고, 서 있는 것(유닛·나무·탑)은 눌리지 않는다.
     땅 좌표 (x, y)        → 화면 ((x - cam.x) · s, (y - cam.y) · K · s)
     '선 좌표'(upright)     = (x, y · K - 높이) : 유닛·빛·투사체를 그릴 때 쓰는, 눌리지 않은 좌표
   그리는 순서: 땅 타일 → 물결 → 땅 위 표시(장판·예고·조준) → 뒤쪽 나무 → 유닛(y 순) → 앞쪽 나무·수풀 → 구조물 → 조명 곱하기 → 빛(더하기) → 머리 위 정보
   유닛/효과의 세부 그리기는 worlddraw.js, 사건 → 효과 변환은 worldfx.js */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map, X = TW.X, FX = TW.FX, TAU = Math.PI * 2;
  const K = 0.78, IK = 1 / K;
  const W = TW.World = {
    G: null, me: null, team: -1, vw: 1600, vh: 900, S: 30, ui: 1, time: 0, alpha: 1, K,
    cam: { x: C.W / 2, y: C.H / 2, zoom: 1, punch: 0, trauma: 0, sx: 0, sy: 0, locked: true, lookX: 0, lookY: 0, intro: 0 },
    mouse: { x: C.W / 2, y: C.H / 2, sx: 0, sy: 0 }, hover: null, aim: null,
    vis: new Map(), glows: [], lights: [], hitstop: 0, slowT: 0, flash: 0, flashCol: '#ffffff', hurt: 0, quality: 1,
    view: { x0: 0, y0: 0, x1: 0, y1: 0 }, pings: [], lasers: [], teles: [],
  };
  FX.K = K; FX.LIFT = 0.28;

  /* ---------- 색: 온 전장이 같은 밤빛. 진영은 등불탑과 본진의 불빛으로만 구분한다 ---------- */
  const PAL = {
    wall: '#122b36', bank: '#1b3c46', floor: '#2a5553', floor2: '#33655f',
    roadE: '#5b617b', road: '#8f95b0', road2: '#a4aac3',
    foam: '#8fe6d2', water: '#2fa9a6', water2: '#23888e', deep: '#1b6c7a', deep2: '#155a6a',
    leafD: '#153a41', leafM: '#215a57', leafL: '#4aa086', trunk: '#2b2536', rock: '#59607a', rockL: '#8a90a8',
    bush: '#4aa87e', bushD: '#286a55',
    wood: '#4d4852', woodL: '#7c7688', woodD: '#35323c',
    lamp: '#ffd9a0',
  };
  W.PAL = PAL;
  W.tint = function (key) { return PAL[key]; };

  /* ---------- 화면 크기 ---------- */
  W.resize = function (vw, vh, uiScale) {
    W.vw = vw; W.vh = vh; W.ui = uiScale || 1;
    let S = vh / 30;
    if (vw / S > 68) S = vw / 68; else if (vw / S < 40) S = vw / 40;
    S = Math.round(S * 4) / 4;
    if (S !== W.S || !W.lightCv) { W.S = S; chunks.clear(); }
    const lw = Math.max(32, Math.ceil(vw / 6)), lh = Math.max(18, Math.ceil(vh / 6));
    if (!W.lightCv || W.lightCv.width !== lw || W.lightCv.height !== lh) { W.lightCv = X.canvas(lw, lh); W.lightCv.scratch = true; W.lightCtx = W.lightCv.getContext('2d'); }
    if (!W.vigCv || W.vigCv.width !== 256) buildVignette();
  };
  function buildVignette() {
    const cv = W.vigCv = X.canvas(256, 144), c = cv.getContext('2d');
    const g = c.createRadialGradient(128, 72, 50, 128, 72, 156);
    g.addColorStop(0, 'rgba(6,10,24,0)'); g.addColorStop(0.72, 'rgba(6,10,24,0.06)'); g.addColorStop(1, 'rgba(6,10,24,0.3)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 144);
    const hv = W.hurtCv = X.canvas(256, 144), h = hv.getContext('2d');
    const g2 = h.createRadialGradient(128, 72, 66, 128, 72, 152);
    g2.addColorStop(0, 'rgba(255,60,80,0)'); g2.addColorStop(0.8, 'rgba(255,60,80,0.14)'); g2.addColorStop(1, 'rgba(255,60,80,0.5)');
    h.fillStyle = g2; h.fillRect(0, 0, 256, 144);
    const fv = W.flashCv = X.canvas(256, 144), f = fv.getContext('2d');
    const g3 = f.createRadialGradient(128, 72, 74, 128, 72, 152);
    g3.addColorStop(0, 'rgba(255,246,220,0)'); g3.addColorStop(0.78, 'rgba(255,246,220,0.16)'); g3.addColorStop(1, 'rgba(255,246,220,0.62)');
    f.fillStyle = g3; f.fillRect(0, 0, 256, 144);
  }

  W.attach = function (G, me) {
    W.G = G; W.me = me; W.team = me ? me.team : -1;
    W.vis.clear(); FX.clear(); W.pings.length = 0; W.lasers.length = 0; W.teles.length = 0;
    W.hitstop = 0; W.slowT = 0; W.flash = 0; W.hurt = 0; W.aim = null; W.hover = null; W.click = null; W.noOverlay = false;
    fogCur.fill(W.team < 0 ? 1 : 0); fogTarget.fill(W.team < 0 ? 1 : 0); fogT = 0;
    const c = W.cam; c.trauma = 0; c.punch = 0; c.locked = true; c.lookX = c.lookY = 0;
    if (me) { c.x = me.x; c.y = me.y; }
  };

  /* ---------- 좌표 ---------- */
  W.scale = () => W.S * W.cam.zoom * (1 + W.cam.punch);
  /* 땅 위의 점 (wx, wy)에서 h 만큼 떠 있는 곳의 화면 좌표 */
  W.toScreen = function (wx, wy, out, h) { const s = W.scale(); out = out || { x: 0, y: 0 }; out.x = (wx - W.cam.x - W.cam.sx) * s + W.vw / 2; out.y = ((wy - W.cam.y - W.cam.sy) * K - (h || 0)) * s + W.vh / 2; return out; };
  /* 화면의 점이 가리키는 땅 위의 점 */
  W.toWorld = function (sx, sy, out) { const s = W.scale(); out = out || { x: 0, y: 0 }; out.x = (sx - W.vw / 2) / s + W.cam.x + W.cam.sx; out.y = (sy - W.vh / 2) / (s * K) + W.cam.y + W.cam.sy; return out; };
  W.shake = function (amp, x, y) {
    if (x !== undefined) { const d = U.dist(x, y, W.cam.x, W.cam.y); if (d > 46) return; amp *= U.clamp(1.25 - d / 40, 0.15, 1); }
    W.cam.trauma = Math.min(1, W.cam.trauma + amp);
  };
  W.onScreen = function (x, y, pad) { const v = W.view; pad = pad || 0; return x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad * IK && y < v.y1 + pad * IK; };

  /* ---------- 카메라 ---------- */
  W.updateCam = function (dt, target, free) {
    const c = W.cam;
    if (target && !free) {
      // 커서 쪽을 조금 더 보여 준다
      const lx = U.clamp((W.mouse.sx - W.vw / 2) / (W.vw / 2), -1, 1) * 3.4, ly = U.clamp((W.mouse.sy - W.vh / 2) / (W.vh / 2), -1, 1) * 2.6;
      c.lookX += (lx - c.lookX) * Math.min(1, dt * 3.5); c.lookY += (ly - c.lookY) * Math.min(1, dt * 3.5);
      const tx = target.x + c.lookX, ty = target.y - 1.6 + c.lookY, k = Math.min(1, dt * 9);
      c.x += (tx - c.x) * k; c.y += (ty - c.y) * k;
    } else if (target) { const k = Math.min(1, dt * 3); c.x += (target.x - c.x) * k; c.y += (target.y - c.y) * k; }
    const hw = W.vw / 2 / W.scale(), hh = W.vh / 2 / (W.scale() * K);
    c.x = U.clamp(c.x, Math.min(hw - 7, C.W / 2), Math.max(C.W - hw + 7, C.W / 2)); c.y = U.clamp(c.y, Math.min(hh - 9, C.H / 2), Math.max(C.H - hh + 11, C.H / 2));
    c.trauma = Math.max(0, c.trauma - dt * 1.9);
    const tr = c.trauma * c.trauma, t = W.time * 31;
    c.sx = (U.noise2(t, 1.3, 7) - 0.5) * 1.5 * tr; c.sy = (U.noise2(3.7, t, 11) - 0.5) * 1.5 * tr;
    c.punch += (0 - c.punch) * Math.min(1, dt * 7);
    if (c.intro > 0) c.intro = Math.max(0, c.intro - dt);
    const s = W.scale();
    W.view.x0 = c.x + c.sx - W.vw / 2 / s; W.view.x1 = c.x + c.sx + W.vw / 2 / s; W.view.y0 = c.y + c.sy - W.vh / 2 / (s * K); W.view.y1 = c.y + c.sy + W.vh / 2 / (s * K);
  };

  /* =====================================================================
     지형 타일 (한 번 그려 두고 재사용). 타일은 땅 좌표로 그리고, 화면에 붙일 때 세로로 눌린다.
     그래서 서 있는 것(나무·풀·난간)은 타일 안에서 미리 1/K 만큼 세로로 늘여 그린다.
     ===================================================================== */
  const CH = 24, chunks = new Map(), queue = [];
  const NCX = Math.ceil(C.W / CH), NCY = Math.ceil(C.H / CH);       // 맵 밖 한 칸 둘레(-1 … N)까지 숲으로 그린다
  const shapes = [];        // 길·오솔길·강의 꺾은선과 원
  (function collect() {
    const box = (pts, hw) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; } return [x0 - hw - 2, y0 - hw - 2, x1 + hw + 2, y1 + hw + 2]; };
    for (const t of M.trails) shapes.push({ k: 'trail', pts: t.pts, hw: t.hw, box: box(t.pts, t.hw) });
    for (const c of M.clearings) shapes.push({ k: 'clear', x: c.x, y: c.y, r: c.r, box: [c.x - c.r - 2, c.y - c.r - 2, c.x + c.r + 2, c.y + c.r + 2] });
    for (const r of M.rivers) shapes.push({ k: 'river', pts: r.pts, hw: r.hw, box: box(r.pts, r.hw) });
    for (const p of M.pits) shapes.push({ k: 'pit', x: p.x, y: p.y, r: p.r, box: [p.x - p.r - 2, p.y - p.r - 2, p.x + p.r + 2, p.y + p.r + 2] });
    for (const l of M.lanes) shapes.push({ k: 'lane', pts: l.pts, hw: l.hw, box: box(l.pts, l.hw), id: l.id });
    for (let i = 0; i < 2; i++) { const b = M.bases[i].core; shapes.push({ k: 'plaza', x: b.x, y: b.y, r: M.PLAZA_R, team: i, box: [b.x - M.PLAZA_R - 3, b.y - M.PLAZA_R - 3, b.x + M.PLAZA_R + 3, b.y + M.PLAZA_R + 3] }); }
  })();
  const LAND = ['trail', 'clear', 'river', 'pit', 'lane', 'plaza'], WATER = ['river', 'pit'];
  const inBridge = (x, y) => { for (const b of M.bridges) if (Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2) return true; return false; };
  function pathLine(c, pts) { c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); }
  function strokeShapes(c, list, kinds, grow, style) {
    c.strokeStyle = style; c.fillStyle = style; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of list) {
      if (kinds.indexOf(s.k) < 0) continue;
      if (s.pts) { c.lineWidth = Math.max(0.1, (s.hw + grow) * 2); pathLine(c, s.pts); c.stroke(); }
      else { c.beginPath(); c.arc(s.x, s.y, Math.max(0.1, s.r + grow), 0, TAU); c.fill(); }
    }
  }
  const inMap = (x, y) => x >= 0 && y >= 0 && x < C.W && y < C.H;

  function renderGround(cx, cy) {
    const S = Math.min(W.S, 28), x0 = cx * CH, y0 = cy * CH, cv = X.canvas(CH * S, CH * S), c = cv.getContext('2d');      // 고해상도 화면에서도 타일 메모리를 아낀다
    c.setTransform(S, 0, 0, S, -x0 * S, -y0 * S);
    c.fillStyle = PAL.wall; c.fillRect(x0, y0, CH, CH);
    const list = shapes.filter(s => s.box[0] < x0 + CH && s.box[2] > x0 && s.box[1] < y0 + CH && s.box[3] > y0);
    strokeShapes(c, list, LAND, 1.3, PAL.bank);
    strokeShapes(c, list, LAND, 0.15, PAL.floor);
    // 숲 바닥의 이끼 얼룩
    const hx0 = Math.floor(x0) - 1, hy0 = Math.floor(y0) - 1;
    c.fillStyle = PAL.floor2;
    for (let y = hy0; y < y0 + CH + 1; y += 2) for (let x = hx0; x < x0 + CH + 1; x += 2) {
      if (!inMap(x + 1, y + 1) || !M.isGround(x + 1, y + 1) || M.laneMask[(y + 1) * C.W + x + 1] || M.isWater(x + 1, y + 1)) continue;
      const h = U.hash2(x, y, 3); if (h > 0.5) continue;
      c.globalAlpha = 0.35 + h * 0.5; X.ell(c, x + 0.5 + U.hash2(x, y, 4) * 1.4, y + 0.5 + U.hash2(x, y, 5) * 1.4, 0.7 + h * 1.6, 0.6 + h * 1.3); c.fill();
    }
    c.globalAlpha = 1;
    // 수풀이 자라는 자리는 흙이 더 짙다
    c.fillStyle = 'rgba(10,34,30,0.5)';
    for (const b of M.bushes) { if (b.x < x0 - 12 || b.x > x0 + CH + 12 || b.y < y0 - 12 || b.y > y0 + CH + 12) continue; c.lineCap = 'round'; c.strokeStyle = c.fillStyle; c.lineWidth = b.r * 2 + 0.5; c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2 + 0.001, b.y2); c.stroke(); }
    // 길: 가장자리 → 바닥 → 밝은 가운데
    strokeShapes(c, list, ['lane', 'plaza'], -0.45, PAL.roadE);
    strokeShapes(c, list, ['lane', 'plaza'], -0.95, PAL.road);
    c.globalAlpha = 0.5; strokeShapes(c, list, ['lane'], -3.6, PAL.road2); c.globalAlpha = 1;
    // 물: 물가의 밝은 띠 → 얕은 물 → 깊은 물
    strokeShapes(c, list, WATER, -0.3, PAL.foam);
    strokeShapes(c, list, WATER, -0.62, PAL.water);
    strokeShapes(c, list, WATER, -2.4, PAL.water2);
    for (const s of list) if (s.k === 'pit') { c.fillStyle = PAL.deep; c.beginPath(); c.arc(s.x, s.y, s.r * 0.62, 0, TAU); c.fill(); c.fillStyle = PAL.deep2; c.beginPath(); c.arc(s.x, s.y, s.r * 0.38, 0, TAU); c.fill(); }
    // 나무다리: 세 길이 강을 건너는 자리
    for (const b of M.bridges) {
      if (b.x + b.w / 2 + 2 < x0 || b.x - b.w / 2 - 2 > x0 + CH || b.y + b.h / 2 + 3 < y0 || b.y - b.h / 2 - 3 > y0 + CH) continue;
      const bx = b.x - b.w / 2, by = b.y - b.h / 2;
      c.fillStyle = 'rgba(4,10,22,0.34)'; X.rr(c, bx + 0.6, by + 0.9, b.w - 1.2, b.h + 0.4, 0.5); c.fill();                  // 물에 드리운 그림자
      X.rr(c, bx, by, b.w, b.h, 0.45); c.fillStyle = PAL.woodD; c.fill();
      X.rr(c, bx + 0.2, by + 0.55, b.w - 0.4, b.h - 1.1, 0.25); c.fillStyle = PAL.wood; c.fill();
      for (let x = bx + 0.2, i = 0; x < bx + b.w - 0.3; x += 1.225, i++) {          // 널빤지
        const h = U.hash2(i, b.y | 0, 5), pw = Math.min(1.14, bx + b.w - 0.2 - x);
        c.fillStyle = h < 0.45 ? 'rgba(255,226,190,0.09)' : h > 0.8 ? 'rgba(12,6,20,0.14)' : 'rgba(0,0,0,0)'; c.fillRect(x, by + 0.55, pw, b.h - 1.1);
        c.fillStyle = 'rgba(22,12,24,0.42)'; c.fillRect(x + pw, by + 0.55, 0.085, b.h - 1.1);
        c.fillStyle = 'rgba(30,20,30,0.5)'; c.beginPath(); c.arc(x + pw / 2, by + 1.0, 0.07, 0, TAU); c.arc(x + pw / 2, by + b.h - 1.0, 0.07, 0, TAU); c.fill();
      }
      // 먼 쪽 난간 (가까운 쪽 난간은 유닛 위에 그린다 → renderTop)
      rail(c, bx, by + 0.3, b.w);
    }
    // 본진 바닥 무늬
    for (const s of list) if (s.k === 'plaza') {
      const col = C.TEAM_COL[s.team];
      for (let i = 0; i < 3; i++) { c.strokeStyle = i === 1 ? U.rgba(col, 0.55) : 'rgba(20,24,48,0.24)'; c.lineWidth = i === 1 ? 0.3 : 0.16; c.beginPath(); c.arc(s.x, s.y, 6 + i * 4.6, 0, TAU); c.stroke(); }
      c.strokeStyle = 'rgba(20,24,48,0.2)'; c.lineWidth = 0.14; c.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.moveTo(s.x + Math.cos(a) * 6, s.y + Math.sin(a) * 6); c.lineTo(s.x + Math.cos(a) * 17.5, s.y + Math.sin(a) * 17.5); } c.stroke();
      const f = M.bases[s.team].fountain; c.fillStyle = U.rgba(col, 0.35); c.beginPath(); c.arc(f.x, f.y, 4.2, 0, TAU); c.fill(); c.strokeStyle = U.rgba(C.TEAM_LIGHT[s.team], 0.9); c.lineWidth = 0.25; c.beginPath(); c.arc(f.x, f.y, 4.2, 0, TAU); c.stroke(); c.beginPath(); c.arc(f.x, f.y, 2.4, 0, TAU); c.stroke();
    }
    // 캠프 자리: 돌 고리
    for (const k of M.camps) {
      if (k.x < x0 - 8 || k.x > x0 + CH + 8 || k.y < y0 - 8 || k.y > y0 + CH + 8 || k.kind === 'boss') continue;
      const r = k.kind === 'elder' ? 5.2 : (k.kind === 'fire' || k.kind === 'water') ? 4.2 : 3.2, n = Math.round(r * 3.2);
      for (let i = 0; i < n; i++) { const a = i / n * TAU + k.id; c.fillStyle = i % 2 ? 'rgba(190,198,224,0.5)' : 'rgba(132,142,176,0.5)'; X.ell(c, k.x + Math.cos(a) * r, k.y + Math.sin(a) * r, 0.3 + U.hash2(i, k.id, 1) * 0.2, 0.3); c.fill(); }
    }
    // 잔 무늬: 박석·풀·꽃·물결
    for (let y = hy0; y < y0 + CH + 1; y++) for (let x = hx0; x < x0 + CH + 1; x++) {
      if (!inMap(x, y)) continue;
      const i = y * C.W + x; if (!M.baseWalk[i]) continue;
      const h = U.hash2(x, y, 9), ox = x + U.hash2(x, y, 1), oy = y + U.hash2(x, y, 2);
      if (M.water[i]) {
        // 물가: 흙이 들쭉날쭉 밀려 나와 강기슭이 자로 그은 듯 곧지 않게
        const lw = x > 0 && !M.water[i - 1] && !M.laneMask[i - 1], rw = x < C.W - 1 && !M.water[i + 1] && !M.laneMask[i + 1];
        if ((lw || rw) && U.hash2(x, y, 21) < 0.62) { const br = 0.4 + U.hash2(x, y, 22) * 0.55; c.fillStyle = PAL.bank; X.ell(c, lw ? x + 0.02 : x + 0.98, y + 0.5 + (U.hash2(x, y, 23) - 0.5) * 0.6, br, 0.5 + U.hash2(x, y, 24) * 0.45); c.fill(); c.fillStyle = PAL.floor; X.ell(c, lw ? x - 0.1 : x + 1.1, y + 0.5, br * 0.8, 0.5); c.fill(); }
        if (h < 0.16) { c.strokeStyle = 'rgba(214,255,244,0.4)'; c.lineWidth = 0.09; c.beginPath(); c.arc(ox, oy, 0.35 + h * 3, 3.6, 5.6); c.stroke(); }
        else if (h > 0.965 && M.edgeDist[i] > 1) { c.fillStyle = '#4fa873'; c.beginPath(); c.arc(ox, oy, 0.42, 0.5, TAU - 0.2); c.lineTo(ox, oy); c.fill(); c.fillStyle = '#ffd6ea'; c.beginPath(); c.arc(ox + 0.1, oy - 0.05, 0.12, 0, TAU); c.fill(); }
      } else if (M.laneMask[i]) {
        if (inBridge(x + 0.5, y + 0.5)) continue;
        // 돌을 깐 길: 두 칸마다 박석 하나
        if ((x & 1) === 0 && (y & 1) === 0 && M.edgeDist[i] > 1) {
          const px = x + 0.15 + U.hash2(x, y, 11) * 0.45, py = y + 0.15 + U.hash2(x, y, 12) * 0.45, pw = 1.25 + U.hash2(x, y, 13) * 0.45, ph = 1.1 + U.hash2(x, y, 14) * 0.5;
          X.rr(c, px, py, pw, ph, 0.28); c.fillStyle = h < 0.5 ? 'rgba(236,240,255,0.12)' : 'rgba(18,20,48,0.1)'; c.fill();
          c.strokeStyle = 'rgba(18,20,48,0.17)'; c.lineWidth = 0.06; c.stroke();
        }
        if (h < 0.07) { c.fillStyle = 'rgba(24,26,50,0.16)'; X.ell(c, ox, oy, 0.16 + h * 2, 0.13 + h); c.fill(); }
      } else {
        if (h < 0.3) { c.strokeStyle = PAL.leafL; c.globalAlpha = 0.55; c.lineWidth = 0.07; c.beginPath(); c.moveTo(ox - 0.14, oy); c.lineTo(ox - 0.2, oy - 0.38); c.moveTo(ox, oy); c.lineTo(ox, oy - 0.48); c.moveTo(ox + 0.14, oy); c.lineTo(ox + 0.22, oy - 0.36); c.stroke(); c.globalAlpha = 1; }
        else if (h > 0.95) { c.fillStyle = h > 0.975 ? '#fff2c0' : '#c8f4ff'; c.beginPath(); c.arc(ox, oy, 0.1, 0, TAU); c.fill(); }
        else if (h > 0.9 && M.edgeDist[i] <= 2) { c.fillStyle = 'rgba(150,158,186,0.8)'; X.ell(c, ox, oy, 0.3, 0.24); c.fill(); }
      }
    }
    return cv;
  }
  /* 다리 난간 한 줄 (y = 난간이 선 땅의 줄). 타일 안이라 높이를 1/K 로 늘여 그린다 */
  function rail(c, x, y, w) {
    const h = 0.95 * IK;
    c.fillStyle = PAL.woodD; for (let px = x + 0.35; px < x + w; px += 2.4) c.fillRect(px - 0.13, y - h, 0.26, h);
    c.fillStyle = PAL.woodL; c.fillRect(x, y - h - 0.12, w, 0.3);
    c.fillStyle = PAL.wood; c.fillRect(x, y - h * 0.5, w, 0.16);
  }

  /* 나무 한 그루. (x, y) = 밑동, h = 화면에서 보이는 키, r = 잎 너비, v = 변주(0…1), kind: 0 = 버들잎나무 · 1 = 소나무 · 2 = 덤불 */
  function tree(c, x, y, r, h, v, kind) {
    const H = h * IK;
    c.fillStyle = 'rgba(3,8,18,0.3)'; X.ell(c, x + r * 0.22, y + 0.12, r * 0.9, r * 0.62); c.fill();
    const dark = PAL.leafD, mid = U.mix(PAL.leafD, PAL.leafM, 0.55 + v * 0.45), lite = U.mix(PAL.leafM, PAL.leafL, 0.2 + v * 0.45);
    if (kind === 2) {
      c.fillStyle = dark; X.ell(c, x, y - H * 0.5, r, H * 0.62); c.fill();
      c.fillStyle = mid; X.ell(c, x - r * 0.18, y - H * 0.64, r * 0.72, H * 0.42); c.fill();
      c.fillStyle = lite; X.ell(c, x - r * 0.34, y - H * 0.8, r * 0.36, H * 0.2); c.fill();
      return;
    }
    if (kind === 1) {
      // 소나무: 휜 줄기에 구름 같은 잎 뭉치 셋
      const lean = (v - 0.5) * r * 0.9;
      c.strokeStyle = PAL.trunk; c.lineWidth = r * 0.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * 1.6, y - H * 0.5, x + lean * 0.4, y - H); c.stroke();
      const pads = [[lean * 0.9 + r * 0.55, 0.52, 0.62], [lean * 0.7 - r * 0.6, 0.74, 0.7], [lean * 0.4, 1.0, 0.86]];
      for (let i = 0; i < 3; i++) {
        const px = x + pads[i][0], py = y - H * pads[i][1], pr = r * pads[i][2];
        c.fillStyle = dark; X.ell(c, px, py, pr, pr * 0.46 * IK); c.fill();
        c.fillStyle = mid; X.ell(c, px - pr * 0.1, py - pr * 0.13 * IK, pr * 0.8, pr * 0.3 * IK); c.fill();
        c.fillStyle = lite; X.ell(c, px - pr * 0.28, py - pr * 0.24 * IK, pr * 0.42, pr * 0.13 * IK); c.fill();
      }
      return;
    }
    // 버들잎나무: 길쭉한 잎사귀 모양 수관
    c.fillStyle = PAL.trunk; c.fillRect(x - r * 0.09, y - H * 0.4, r * 0.18, H * 0.4);
    const b = y - H * 0.22, t = y - H * 1.12, m = b - t;
    const leaf = (w, sx, k0) => { c.beginPath(); c.moveTo(x + sx, b); c.bezierCurveTo(x + sx + w * 1.3, b - m * 0.12, x + sx + w * 0.75, b - m * 0.74, x + sx * 0.4, t + m * k0); c.bezierCurveTo(x + sx - w * 0.75, b - m * 0.74, x + sx - w * 1.3, b - m * 0.12, x + sx, b); c.closePath(); c.fill(); };
    c.fillStyle = dark; leaf(r, 0, 0);
    c.fillStyle = mid; leaf(r * 0.66, -r * 0.2, 0.1);
    c.fillStyle = lite; leaf(r * 0.3, -r * 0.4, 0.26);
  }

  /* 나무는 두 층으로 나눈다. 바로 남쪽(화면 아래)에 걸을 수 있는 땅이 있는 나무는 유닛의 '뒤'에 서 있으므로 유닛보다 먼저 그리고(back),
     그렇지 않은 나무(길의 아래쪽 가장자리 등)는 유닛보다 나중에 그려 발치를 살짝 가린다(front). 수풀과 다리 난간은 front 층. */
  function southGround(xi, yi) {
    for (let dy = 1; dy <= 6; dy++) for (let dx = -2; dx <= 2; dx++) { const x = xi + dx, y = yi + dy; if (inMap(x, y) && M.baseWalk[y * C.W + x]) return true; }
    return false;
  }
  function renderTop(cx, cy, back) {
    const S = Math.min(W.S, 28), x0 = cx * CH, y0 = cy * CH, cv = X.canvas(CH * S, CH * S), c = cv.getContext('2d');
    c.setTransform(S, 0, 0, S, -x0 * S, -y0 * S);
    // 수풀·갈대 (허리 높이: 영웅이 들어가면 반쯤 가려진다)
    if (!back) for (let y = Math.max(0, y0 - 1); y < Math.min(C.H, y0 + CH + 3); y++) for (let x = Math.max(0, x0 - 1); x < Math.min(C.W, x0 + CH + 1); x++) {
      const i = y * C.W + x; if (!M.bushGrid[i]) continue;
      const reed = M.water[i] === 1;
      for (let k = 0; k < 4; k++) {
        const ox = x + U.hash2(x, y, 20 + k), oy = y + U.hash2(x, y, 30 + k), h = (0.9 + U.hash2(x, y, 40 + k) * 0.8 + (reed ? 0.5 : 0)) * IK, lean = (U.hash2(x, y, 50 + k) - 0.5) * 0.55;
        c.fillStyle = k % 2 ? PAL.bush : PAL.bushD; c.globalAlpha = 0.92;
        c.beginPath(); c.moveTo(ox - 0.19, oy + 0.1); c.quadraticCurveTo(ox + lean * 0.4, oy - h * 0.6, ox + lean, oy - h); c.quadraticCurveTo(ox + lean * 0.5 + 0.1, oy - h * 0.5, ox + 0.19, oy + 0.1); c.closePath(); c.fill();
        if (reed && k === 1) { c.fillStyle = '#8a6a4a'; X.ell(c, ox + lean, oy - h, 0.1, 0.3 * IK); c.fill(); }
      }
    }
    c.globalAlpha = 1;
    // 다리의 가까운 쪽 난간
    if (!back) for (const b of M.bridges) { if (b.x + b.w / 2 + 2 < x0 || b.x - b.w / 2 - 2 > x0 + CH || b.y + b.h / 2 + 3 < y0 || b.y - b.h / 2 - 3 > y0 + CH) continue; rail(c, b.x - b.w / 2, b.y + b.h / 2 - 0.12, b.w); }
    // 나무: 걸을 수 없는 곳에 선다. 숲 깊은 곳일수록 키가 크다 (길가의 나무가 길을 가리지 않게)
    const G0 = 2.5, gx0 = Math.floor((x0 - 4) / G0), gx1 = Math.ceil((x0 + CH + 4) / G0), gy0 = Math.floor((y0 - 3) / G0), gy1 = Math.ceil((y0 + CH + 9) / G0);
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const x = gx * G0 + U.hash2(gx, gy, 61) * 1.8, y = gy * G0 + U.hash2(gx, gy, 62) * 1.8;
      const xi = Math.floor(x), yi = Math.floor(y), out = !inMap(xi, yi);
      if (!out && M.baseWalk[yi * C.W + xi]) continue;
      if (southGround(xi, yi) !== !!back) continue;
      let skip = false;
      for (const tw of M.towers) if (Math.abs(tw.x - x) < 3.4 && y > tw.y - 1.5 && y < tw.y + 6.5) { skip = true; break; }
      if (!skip) for (const l of M.lamps) if (Math.abs(l.x - x) < 1.8 && y > l.y - 0.5 && y < l.y + 4.5) { skip = true; break; }
      if (!skip) for (const b of M.bridges) if (Math.abs(b.x - x) < b.w / 2 + 1.6 && y > b.y - b.h / 2 - 1.2 && y < b.y + b.h / 2 + 3.2) { skip = true; break; }
      if (skip) continue;
      const depth = out ? 9 : M.wallDepth[yi * C.W + xi];
      const h = U.hash2(gx, gy, 63), v = U.hash2(gx, gy, 64);
      if (depth <= 1) { if (h < 0.3) rock(c, x, y, 0.5 + v * 0.5, h); else tree(c, x, y, 0.95 + h * 0.5, 0.9 + v * 0.6, v, 2); }
      else if (depth === 2) tree(c, x, y, 1.15 + h * 0.5, 1.9 + v * 0.7, v, h < 0.5 ? 2 : 0);
      else tree(c, x, y, 1.35 + h * 0.75, Math.min(4.6, 2.5 + (depth - 3) * 0.6 + v * 1.3), v, h < 0.36 ? 1 : 0);
      if (depth >= 2 && h > 0.86) { c.fillStyle = h > 0.93 ? '#ffe9b0' : '#bff4ff'; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + (U.hash2(gx, gy, 70 + k) - 0.5) * 1.6, y - (1.2 + U.hash2(gx, gy, 80 + k) * 1.6) * IK, 0.09, 0, TAU); c.fill(); } }
    }
    return cv;
  }
  function rock(c, x, y, r, v) {
    c.fillStyle = 'rgba(3,8,18,0.3)'; X.ell(c, x + r * 0.2, y + 0.1, r * 1.1, r * 0.6); c.fill();
    c.fillStyle = PAL.rock; c.beginPath(); c.moveTo(x - r, y); c.lineTo(x - r * 0.7, y - r * 1.0 * IK); c.lineTo(x + r * 0.1, y - r * 1.35 * IK); c.lineTo(x + r * 0.85, y - r * 0.8 * IK); c.lineTo(x + r, y); c.closePath(); c.fill();
    c.fillStyle = PAL.rockL; c.globalAlpha = 0.55 + v; c.beginPath(); c.moveTo(x - r * 0.7, y - r * 1.0 * IK); c.lineTo(x + r * 0.1, y - r * 1.35 * IK); c.lineTo(x - r * 0.1, y - r * 0.6 * IK); c.closePath(); c.fill(); c.globalAlpha = 1;
  }
  /* kind: 'g' 땅 · 'b' 유닛 뒤의 나무 · 't' 유닛 앞의 나무·수풀·난간 */
  function getChunk(cx, cy, kind, need) {
    const key = kind + cx + '_' + cy;
    let e = chunks.get(key);
    if (e) { e.used = W.frame; return e.cv; }
    if (!need) { if (queue.indexOf(key) < 0) queue.push(key); return null; }
    e = { cv: kind === 'g' ? renderGround(cx, cy) : renderTop(cx, cy, kind === 'b'), used: W.frame };
    chunks.set(key, e);
    if (chunks.size > 62) { let old = null, ok = null; for (const [k, v] of chunks) if (!old || v.used < old.used) { old = v; ok = k; } if (ok && old.used < W.frame - 30) chunks.delete(ok); }
    return e.cv;
  }
  W.frame = 0;
  /* 화면에 걸친 타일을 그린다. 아직 없는 타일은 프레임당 budget 개까지만 새로 만든다 */
  function drawChunks(ctx, kind, budget) {
    const v = W.view, top = kind !== 'g', pad = top ? 9 : 0;
    // 화면보다 조금 넓게 훑는다: 곧 보일 타일을 미리 만들어 두려고 (가장자리에서 나무가 뒤늦게 돋지 않게)
    const cx0 = Math.max(-1, Math.floor((v.x0 - 7) / CH)), cx1 = Math.min(NCX, Math.floor((v.x1 + 7) / CH)), cy0 = Math.max(-1, Math.floor((v.y0 - 7) / CH)), cy1 = Math.min(NCY, Math.floor((v.y1 + pad + 7) / CH));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      let cv = getChunk(cx, cy, kind, false);
      if (!cv && budget.n > 0) { budget.n--; cv = getChunk(cx, cy, kind, true); }
      if (cv) ctx.drawImage(cv, cx * CH, cy * CH, CH + 0.02, CH + 0.02);
      else if (!top) { ctx.fillStyle = PAL.wall; ctx.fillRect(cx * CH, cy * CH, CH, CH); }
    }
  }
  /* 미리 만들어 두기(시작 직후 화면이 끊기지 않게). 반환: 남은 개수 */
  W.prewarm = function (x, y, max) {
    const hw = W.vw / 2 / W.S + CH * 0.5, hh = W.vh / 2 / (W.S * K) + CH * 0.5; let left = 0;
    for (let cy = Math.max(-1, Math.floor((y - hh) / CH)); cy <= Math.min(NCY, Math.floor((y + hh) / CH)); cy++) for (let cx = Math.max(-1, Math.floor((x - hw) / CH)); cx <= Math.min(NCX, Math.floor((x + hw) / CH)); cx++) {
      for (const kind of ['g', 'b', 't']) { if (chunks.has(kind + cx + '_' + cy)) continue; if (max > 0) { max--; getChunk(cx, cy, kind, true); } else left++; }
    }
    return left;
  };
  W.chunkCount = () => chunks.size;

  /* 미니맵 바탕 그림 (한 번만): 위에서 똑바로 내려다본 지도 */
  W.minimapBase = function (w, h) {
    const cv = X.canvas(w, h), c = cv.getContext('2d'), s = w / C.W;
    c.setTransform(s, 0, 0, s, 0, 0);
    c.fillStyle = '#0c1a26'; c.fillRect(0, 0, C.W, C.H);
    strokeShapes(c, shapes, LAND, 0.4, '#1f4247');
    strokeShapes(c, shapes, WATER, -0.4, '#2c9a9c');
    strokeShapes(c, shapes, ['lane', 'plaza'], -1.6, '#7f86a4');
    c.fillStyle = PAL.wood; for (const b of M.bridges) c.fillRect(b.x - b.w / 2 + 1, b.y - b.h / 2 + 1.6, b.w - 2, b.h - 3.2);
    c.fillStyle = 'rgba(107,208,154,0.75)'; for (const b of M.bushes) { c.beginPath(); c.arc(b.x, b.y, b.r * 0.85, 0, TAU); c.fill(); }
    return cv;
  };

  /* =====================================================================
     전장의 안개 + 조명
     ===================================================================== */
  const FW = C.W / 2, FH = C.H / 2, fogTarget = new Float32Array(FW * FH), fogCur = new Float32Array(FW * FH), fogSoft = new Float32Array(FW * FH);
  let fogT = 0, fogCv = null, fogCtx = null, fogImg = null;
  const FOG = [122, 134, 176], AMB = [218, 224, 247];
  function stamp(x, y, r, los) {
    const x0 = Math.max(0, Math.floor((x - r) / 2)), x1 = Math.min(FW - 1, Math.floor((x + r) / 2)), y0 = Math.max(0, Math.floor((y - r) / 2)), y1 = Math.min(FH - 1, Math.floor((y + r) / 2)), r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const i = cy * FW + cx; if (fogTarget[i] === 1) continue;
      const wx = cx * 2 + 1, wy = cy * 2 + 1, dx = wx - x, dy = wy - y;
      if (dx * dx + dy * dy > r2) continue;
      if (!los || M.los(x, y, wx, wy)) fogTarget[i] = 1;
    }
  }
  function computeFog() {
    const G = W.G, team = W.team;
    if (team < 0) { fogTarget.fill(1); return; }
    fogTarget.fill(0);
    for (const u of G.units) {
      if (u.team !== team || u.dead) continue;
      const s = u.sightCap ? Math.min(u.sight, u.sightCap) : u.sight;
      stamp(u.x, u.y, s, true);
    }
    for (const w of G.wards) if (w.team === team) stamp(w.x, w.y, w.r, true);
  }
  /* 그 지점이 지금 우리 눈에 보이는가 */
  W.visibleAt = function (x, y) { if (W.team < 0) return true; const cx = U.clamp((x / 2) | 0, 0, FW - 1), cy = U.clamp((y / 2) | 0, 0, FH - 1); return fogCur[cy * FW + cx] > 0.35; };
  W.fogAt = function (x, y) { if (W.team < 0) return 1; const cx = U.clamp((x / 2) | 0, 0, FW - 1), cy = U.clamp((y / 2) | 0, 0, FH - 1); return fogCur[cy * FW + cx]; };
  W.fogData = () => fogCur; W.FW = FW; W.FH = FH;
  function updateFog(dt) {
    fogT -= dt;
    if (fogT <= 0) { fogT = 0.12; computeFog(); }
    if (!fogCv) { fogCv = X.canvas(FW, FH); fogCtx = fogCv.getContext('2d'); fogImg = fogCtx.createImageData(FW, FH); }
    const d = fogImg.data, up = Math.min(1, dt * 11), down = Math.min(1, dt * 4.5);
    for (let i = 0; i < fogCur.length; i++) { const t = fogTarget[i], c = fogCur[i]; fogCur[i] = c + (t - c) * (t > c ? up : down); }
    // 칸 경계가 계단처럼 보이지 않게 이웃 칸과 섞는다
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const i = y * FW + x, xl = x > 0 ? i - 1 : i, xr = x < FW - 1 ? i + 1 : i, yu = y > 0 ? i - FW : i, yd = y < FH - 1 ? i + FW : i;
      fogSoft[i] = fogCur[i] * 0.4 + (fogCur[xl] + fogCur[xr] + fogCur[yu] + fogCur[yd]) * 0.15;
    }
    const r = AMB[0] - FOG[0], g = AMB[1] - FOG[1], b = AMB[2] - FOG[2];
    for (let i = 0, j = 0; i < fogSoft.length; i++, j += 4) { const c = fogSoft[i]; d[j] = r * c; d[j + 1] = g * c; d[j + 2] = b * c; d[j + 3] = 255; }
    fogCtx.putImageData(fogImg, 0, 0);
  }
  function drawLighting(ctx) {
    const lc = W.lightCtx, lw = W.lightCv.width, lh = W.lightCv.height, v = W.view, s = W.scale(), k = lw / W.vw;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over'; lc.globalAlpha = 1;
    lc.fillStyle = 'rgb(' + FOG[0] + ',' + FOG[1] + ',' + FOG[2] + ')'; lc.fillRect(0, 0, lw, lh);
    lc.globalCompositeOperation = 'lighter';
    // 안개 텍스처에서 화면에 해당하는 부분만 늘여 붙인다
    const fw = (v.x1 - v.x0) / 2, fh = (v.y1 - v.y0) / 2;
    let sx = v.x0 / 2, sy = v.y0 / 2, sw = fw, sh = fh, dx = 0, dy = 0, dw = lw, dh = lh;
    if (sx < 0) { const cut = -sx; dx = cut / fw * lw; dw -= dx; sw -= cut; sx = 0; }
    if (sy < 0) { const cut = -sy; dy = cut / fh * lh; dh -= dy; sh -= cut; sy = 0; }
    if (sx + sw > FW) { const cut = sx + sw - FW; dw -= cut / fw * lw; sw -= cut; }
    if (sy + sh > FH) { const cut = sy + sh - FH; dh -= cut / fh * lh; sh -= cut; }
    if (sw > 0.01 && sh > 0.01 && dw > 0.5 && dh > 0.5) { lc.imageSmoothingEnabled = true; lc.drawImage(fogCv, sx, sy, sw, sh, dx, dy, dw, dh); }
    // 빛 (선 좌표)
    const L = W.lights, vy = v.y0 * K;
    for (let i = 0; i < L.length; i += 5) {
      const px = (L[i] - v.x0) * s * k, py = (L[i + 1] - vy) * s * k, pr = L[i + 2] * s * k;
      if (px < -pr || py < -pr || px > lw + pr || py > lh + pr) continue;
      X.glow(lc, px, py, pr, L[i + 3], L[i + 4]);
    }
    for (const p of FX.lights) { const f = 1 - p.t / p.life, px = (p.x - v.x0) * s * k, py = (p.y * K - vy) * s * k; X.glow(lc, px, py, p.r * s * k, p.color, p.a * f); }
    lc.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(W.lightCv, 0, 0, W.vw, W.vh);
    ctx.globalCompositeOperation = 'source-over';
  }
  /* 빛·빛무리는 '선 좌표'로 받는다: (x, 땅 y · K - 높이) */
  W.light = function (x, y, r, color, a) { W.lights.push(x, y, r, color, a); };
  W.glow = function (x, y, r, color, a) { W.glows.push(x, y, r, color, a); };
  /* 빛 예산: 화면을 4칸(땅 단위) 격자로 나누어, 한 칸에 '더하는 빛'이 지나치게 몰리면 그 칸의 빛을 줄인다.
     큰 싸움에서 영웅들이 흰 덩어리로 뭉개지는 것을 막는다. 지난 프레임에 쌓인 양으로 이번 프레임의 배율을 정한다.
     (x, y) = 선 좌표, r = 반지름, a = 진하기 → 돌려주는 값 = 그릴 때 곱할 배율(0.26 ~ 1) */
  const LG = 4, LW = 24, LH = 16, LCAP = 4.6;
  let lumA = new Float32Array(LW * LH), lumB = new Float32Array(LW * LH);
  W.lumK = function (x, y, r, a) {
    const v = W.view, cx = ((x - v.x0) / LG + 1) | 0, cy = ((y - v.y0 * K) / LG + 2) | 0;
    if (cx < 0 || cy < 0 || cx >= LW || cy >= LH) return 1;
    const i = cy * LW + cx;
    lumB[i] += a * Math.min(r * r, 9);
    const e = lumA[i];
    return e > LCAP ? Math.max(0.26, LCAP / e) : 1;
  };
  W.lumSwap = function () { const t = lumA; lumA = lumB; lumB = t; lumB.fill(0); };
  W.lumPeak = function () { let m = 0; for (let i = 0; i < lumA.length; i++) if (lumA[i] > m) m = lumA[i]; return m; };
  FX.lumK = W.lumK;
  /* 빛을 얹는 합성 방식. 'lighter'(그냥 더하기)는 밝은 돌길 위에서 금세 순백으로 타 버린다 → 'screen' 은 밝을수록 덜 더해져 빛깔이 남는다 */
  W.addMode = 'screen';

  /* =====================================================================
     한 프레임
     ===================================================================== */
  /* dt = 실제로 흐른 화면 시간(초), alpha = 시뮬레이션 틱 사이 보간 */
  W.update = function (dt, alpha) {
    const G = W.G; if (!G) return;
    W.alpha = alpha; W.time = G.t + (alpha - 1) * C.DT;
    updateFog(dt);
    FX.update(dt);
    if (W.flash > 0) W.flash = Math.max(0, W.flash - dt * 3.2);
    if (W.hurt > 0) W.hurt = Math.max(0, W.hurt - dt * 1.6);
    for (let i = W.pings.length - 1; i >= 0; i--) { W.pings[i].t += dt; if (W.pings[i].t > W.pings[i].life) W.pings.splice(i, 1); }
    for (let i = W.teles.length - 1; i >= 0; i--) { W.teles[i].t += dt; if (W.teles[i].t > W.teles[i].life) W.teles.splice(i, 1); }
  };
  W.render = function (ctx) {
    const G = W.G; if (!G) return;
    W.frame++;
    const s = W.scale(), D = W.Draw;
    W.glows.length = 0; W.lights.length = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = PAL.wall; ctx.fillRect(0, 0, W.vw, W.vh);
    const ox = W.vw / 2 - (W.cam.x + W.cam.sx) * s, oy = W.vh / 2 - (W.cam.y + W.cam.sy) * K * s;
    const ground = () => ctx.setTransform(s, 0, 0, s * K, ox, oy);      // 땅에 붙은 것
    const upright = () => ctx.setTransform(s, 0, 0, s, ox, oy);         // 서 있는 것 (y 는 미리 K 를 곱해 넘긴다)
    const budget = { n: W.frame < 3 ? 99 : 1 };
    ctx.imageSmoothingEnabled = true;
    ground();
    drawChunks(ctx, 'g', budget);
    D.water(ctx);
    D.ground(ctx);
    FX.drawGround(ctx);
    drawChunks(ctx, 'b', budget);
    upright();
    D.units(ctx);
    FX.drawMid(ctx);
    ground();
    drawChunks(ctx, 't', budget);
    upright();
    D.above(ctx);
    drawLighting(ctx);
    upright();
    ctx.globalCompositeOperation = W.addMode;
    const gl = W.glows;
    for (let i = 0; i < gl.length; i += 5) X.glow(ctx, gl[i], gl[i + 1], gl[i + 2], gl[i + 3], gl[i + 4] * W.lumK(gl[i], gl[i + 1], gl[i + 2], gl[i + 4]) * (gl[i + 2] > 2.4 ? 2.4 / gl[i + 2] : 1));      // 큰 빛무리일수록 옅게
    ctx.globalAlpha = 1;
    D.addPass(ctx);
    FX.drawAdd(ctx);
    W.lumSwap();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!W.noOverlay) D.overlay(ctx);
    // 화면 효과: 쓰러져 있는 동안은 세상이 가라앉는다
    if (W.me && W.me.dead && !G.over) { ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(10,14,40,0.34)'; ctx.fillRect(0, 0, W.vw, W.vh); }
    ctx.globalAlpha = 1; ctx.drawImage(W.vigCv, 0, 0, W.vw, W.vh);
    if (W.hurt > 0.01) { ctx.globalAlpha = Math.min(1, W.hurt); ctx.drawImage(W.hurtCv, 0, 0, W.vw, W.vh); }
    // 처치의 번쩍임은 화면 가장자리에만 준다 (가운데의 싸움이 하얗게 덮이지 않게)
    if (W.flash > 0.01) { ctx.globalAlpha = Math.min(0.85, W.flash * 1.6); ctx.drawImage(W.flashCol === '#ff3a52' ? W.hurtCv : W.flashCv, 0, 0, W.vw, W.vh); }
    ctx.globalAlpha = 1;
    // 다음 프레임을 위해 화면 밖 타일을 조금씩 만들어 둔다
    if (queue.length && budget.n > 0) { const key = queue.shift(), m = /^(t|g|b)(-?\d+)_(-?\d+)$/.exec(key); if (m && !chunks.has(key)) getChunk(+m[2], +m[3], m[1], true); }
  };

  /* ---------- 집기: 화면 좌표 아래의 유닛 (서 있는 몸통을 땅 좌표의 세로 선분으로 본다) ---------- */
  W.pick = function (sx, sy, pred) {
    const G = W.G, p = W.toWorld(sx, sy); let best = null, bs = 1e9;
    for (const u of G.units) {
      if (u.dead || (pred && !pred(u))) continue;
      if (W.team >= 0 && u.team !== W.team && !u.seen[W.team]) continue;
      const h = (u.isStruct ? (u.kind === 'core' ? 4.5 : 3.6) : u.isHero ? 2.9 : u.isMonster ? Math.min(3.5, u.r * 1.6) : 1.3) * IK;
      // 몸통 축에서 얼마나 가까운가(0 = 한가운데, 1 = 몸 가장자리)로 견준다. 예전에는 영웅이 무조건 이겨서,
      // 영웅 옆의 미니언을 눌러도 영웅이 잡혔다(막타를 치려다 영웅을 때림). 이제는 커서에 더 가까운 쪽이 잡히고,
      // 지금 치면 쓰러지는 미니언(금빛 표식)은 조금 더 잘 잡힌다.
      const rad = Math.max(0.9, u.r * (u.isStruct ? 0.9 : 1.15)), ax = U.segDist(p.x, p.y, u.x, u.y, u.x, u.y - h);
      if (ax > rad + (u.isStruct ? 0.5 : 0.8)) continue;
      const lh = u.isMinion && TW.Feel ? TW.Feel.lh.get(u.id) : null;
      const score = ax / rad - (u.isHero ? 0.2 : 0) - (lh && lh.kill ? 0.6 : 0);
      if (score < bs) { bs = score; best = u; }
    }
    return best;
  };
  W.ping = function (x, y, color, kind, life) { W.pings.push({ x, y, color, kind: kind || 'info', t: 0, life: life || 3.2 }); };
})();
