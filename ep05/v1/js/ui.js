/* 청홍대전 — ui: 캔버스 UI (영웅 선택, HUD, 미니맵, 상점, 점수판, 결과 화면) */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const C = AOS.C, U = AOS.U, M = AOS.Map, X = AOS.Gfx, A = AOS.Art, W = AOS.World;
  const TAU = Math.PI * 2;
  const T = X.text, TO = X.textO;
  const COL = { bg0: '#0c1222', bg1: '#141c33', bg2: '#1d2847', line: '#33426c', gold: '#f2c14e', text: '#e9eefc', dim: '#93a0c0', blue: '#3aa0ff', red: '#ff5247', green: '#62dd62', mana: '#3f8cff' };
  const UI = AOS.UI = {
    us: 1, LW: 1600, LH: 900, mx: 0, my: 0, clicks: [], down: false, hot: null, hotNext: null, captured: false, cursor: 'default',
    layer: 0, topLayer: 0, tip: null, clock: 0,
    shopOpen: false, scoreOpen: false, helpOpen: false, paused: false,
    feed: [], ann: [], msg: null, dragMini: false,
    sel: { hero: 'lira', diff: 'normal' }, on: {}, COL,
    keyAim: -1, muted: false, music: true, autoBuy: false,
  };

  /* ---------- 기본 위젯 ---------- */
  UI.begin = function (ctx, cssW, cssH, dpr, mxCss, myCss, dt) {
    UI.us = U.clamp(Math.min(cssW / 1600, cssH / 900), 0.5, 2.2);
    UI.LW = cssW / UI.us; UI.LH = cssH / UI.us;
    UI.mx = mxCss / UI.us; UI.my = myCss / UI.us;
    UI.hot = UI.hotNext; UI.hotNext = null; UI.captured = false; UI.tip = null; UI.cursor = 'default';
    UI.clock += dt; UI.layer = 0;
    UI.topLayer = UI.ended ? 4 : UI.paused ? 3 : UI.helpOpen ? 3 : UI.shopOpen ? 2 : UI.scoreOpen ? 1 : 0;
    ctx.setTransform(UI.us * dpr, 0, 0, UI.us * dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  };
  const inside = (px, py, x, y, w, h) => px >= x && px < x + w && py >= y && py < y + h;
  /* 영역 등록: {hover, click, rclick} */
  UI.hit = function (id, x, y, w, h) {
    const res = { hover: false, click: false, rclick: false };
    const active = UI.layer >= UI.topLayer;
    if (inside(UI.mx, UI.my, x, y, w, h)) { UI.captured = true; if (active) { res.hover = true; UI.hotNext = id; } }
    for (const c of UI.clicks) {
      if (c.used || !inside(c.x, c.y, x, y, w, h)) continue;
      c.used = true;
      if (active) { if (c.b === 0) res.click = true; else res.rclick = true; }
    }
    return res;
  };
  /* 클릭이 전장으로 새지 않게 막는 영역 (위젯들이 먼저 처리한 뒤 프레임 끝에서 소비) */
  const blocks = [];
  UI.block = function (x, y, w, h) {
    if (inside(UI.mx, UI.my, x, y, w, h)) UI.captured = true;
    blocks.push(x, y, w, h);
  };
  function panel(ctx, x, y, w, h, r, a) {
    X.rr(ctx, x, y, w, h, r === undefined ? 10 : r);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(29,40,71,' + (a === undefined ? 0.94 : a) + ')'); g.addColorStop(1, 'rgba(14,20,38,' + (a === undefined ? 0.96 : a) + ')');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = COL.line; ctx.lineWidth = 1.5; ctx.stroke();
  }
  UI.panel = panel;
  function button(ctx, id, x, y, w, h, label, o) {
    o = o || {};
    const r = o.disabled ? { hover: false, click: false } : UI.hit(id, x, y, w, h);
    const hot = r.hover, base = o.color || COL.bg2;
    X.rr(ctx, x, y, w, h, o.r === undefined ? 8 : o.r);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (o.primary) { g.addColorStop(0, hot ? '#ffd978' : '#f6c85a'); g.addColorStop(1, hot ? '#e9a93a' : '#d99a2b'); }
    else if (o.active) { g.addColorStop(0, X.shade(base, 0.25)); g.addColorStop(1, base); }
    else { g.addColorStop(0, hot ? '#2c3a66' : '#222d50'); g.addColorStop(1, hot ? '#1e2949' : '#182039'); }
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = o.primary ? '#fff0b8' : o.active ? X.shade(base, 0.5) : hot ? '#6f86c8' : COL.line; ctx.lineWidth = o.active || o.primary ? 2 : 1.5; ctx.stroke();
    if (o.disabled) { ctx.fillStyle = 'rgba(10,14,26,0.55)'; ctx.fill(); }
    if (label) T(ctx, label, x + w / 2, y + h / 2 + 1, o.size || 16, o.primary ? '#2a1c05' : o.disabled ? COL.dim : (o.textColor || COL.text), 'center', o.weight || 700, 'middle');
    if (hot) UI.cursor = 'pointer';
    if (hot && o.tip) UI.tip = o.tip;
    return r.click;
  }
  UI.button = button;

  /* ---------- 아이콘 글리프 ---------- */
  const star = (cx, cy, ro, ri, n, rot) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = (rot || -Math.PI / 2) + i * Math.PI / n, r = i % 2 ? ri : ro; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return ['p', p]; };
  const BOLT = [[58, 6], [24, 54], [46, 54], [38, 94], [78, 42], [54, 42]];
  const HEART = [[50, 88], [14, 50], [14, 30], [30, 16], [50, 30], [70, 16], [86, 30], [86, 50]];
  const SHIELD = [[50, 10], [84, 22], [84, 52], [50, 92], [16, 52], [16, 22]];
  const GLY = {
    dash: [['l', [[18, 25], [43, 50], [18, 75]], 13], ['l', [[52, 25], [77, 50], [52, 75]], 13]],
    shield: [['p', SHIELD], ['L', [[50, 24], [50, 78]], 6], ['L', [[28, 44], [72, 44]], 6]],
    quake: [['l', [[8, 72], [28, 56], [44, 74], [60, 52], [76, 70], [92, 60]], 9], ['l', [[50, 12], [50, 38]], 10], ['l', [[26, 20], [36, 40]], 8], ['l', [[74, 20], [64, 40]], 8]],
    roar: [star(50, 50, 44, 20, 8), ['C', 50, 50, 9]],
    arrow: [['l', [[16, 84], [74, 26]], 9], ['p', [[90, 10], [58, 20], [80, 42]]], ['l', [[16, 84], [16, 64]], 7], ['l', [[16, 84], [36, 84]], 7]],
    haste: [['l', [[24, 46], [50, 20], [76, 46]], 11], ['l', [[24, 68], [50, 42], [76, 68]], 11], ['l', [[24, 90], [50, 64], [76, 90]], 11]],
    step: [['a', 50, 54, 28, 0.6, 5.2, 10], ['p', [[60, 8], [86, 28], [58, 40]]]],
    rain: [['l', [[24, 12], [24, 58]], 7], ['p', [[13, 54], [35, 54], [24, 78]]], ['l', [[50, 20], [50, 66]], 7], ['p', [[39, 62], [61, 62], [50, 86]]], ['l', [[76, 12], [76, 58]], 7], ['p', [[65, 54], [87, 54], [76, 78]]]],
    fire: [['p', [[50, 6], [68, 32], [60, 40], [80, 64], [64, 92], [36, 92], [20, 64], [38, 44], [34, 28]]], ['P', [[50, 46], [62, 68], [54, 86], [44, 86], [38, 70]]]],
    pillar: [['p', [[50, 4], [64, 30], [58, 36], [70, 60], [62, 80], [38, 80], [30, 60], [42, 38], [38, 26]]], ['l', [[14, 90], [86, 90]], 9]],
    blink: [star(66, 34, 30, 9, 4), star(28, 74, 16, 5, 4), ['l', [[38, 64], [50, 52]], 5]],
    meteor: [['c', 62, 64, 24], ['l', [[18, 10], [48, 44]], 10], ['l', [[10, 36], [38, 58]], 7], ['l', [[42, 6], [60, 34]], 7]],
    shuriken: [star(50, 50, 44, 13, 4), ['C', 50, 50, 8]],
    smoke: [['c', 34, 56, 20], ['c', 60, 44, 24], ['c', 72, 64, 17], ['c', 46, 70, 18]],
    strike: [['p', [[84, 8], [92, 16], [42, 68], [32, 58]]], ['l', [[22, 56], [44, 78]], 8], ['l', [[28, 72], [14, 86]], 10]],
    skull: [['c', 50, 42, 30], ['p', [[32, 58], [68, 58], [62, 88], [38, 88]]], ['C', 38, 42, 8], ['C', 62, 42, 8], ['L', [[50, 70], [50, 88]], 4]],
    spin: [['a', 50, 50, 30, -0.6, 3.6, 11], ['p', [[10, 40], [34, 44], [22, 66]]], ['c', 50, 50, 8]],
    rage: [['l', [[24, 14], [38, 86]], 10], ['l', [[45, 10], [59, 90]], 10], ['l', [[66, 14], [80, 86]], 10]],
    leap: [['a', 46, 74, 32, 3.14, 6.0, 9], ['p', [[66, 62], [92, 66], [78, 90]]], ['l', [[8, 90], [92, 90]], 6]],
    undying: [['p', HEART], ['L', [[38, 38], [50, 52], [44, 62], [56, 74]], 5]],
    spear: [['p', [[90, 10], [70, 52], [48, 30]]], ['l', [[60, 40], [14, 86]], 9]],
    heal: [['p', [[40, 12], [60, 12], [60, 40], [88, 40], [88, 60], [60, 60], [60, 88], [40, 88], [40, 60], [12, 60], [12, 40], [40, 40]]]],
    ring: [['o', 50, 50, 32, 11], ['c', 50, 50, 9]],
    sanct: [['o', 50, 50, 38, 7], star(50, 50, 24, 9, 4)],
    chain: [['p', BOLT]],
    field: [['o', 50, 50, 40, 6], ['p', BOLT.map(p => [50 + (p[0] - 50) * 0.62, 50 + (p[1] - 50) * 0.62])]],
    charge: [['p', BOLT.map(p => [50 + (p[0] - 50) * 0.8, 50 + (p[1] - 50) * 0.8])], ['l', [[8, 40], [16, 28], [24, 40]], 6], ['l', [[76, 72], [84, 60], [92, 72]], 6]],
    storm: [['c', 32, 34, 17], ['c', 56, 28, 21], ['c', 74, 38, 15], ['p', [[52, 48], [34, 74], [50, 74], [42, 96], [70, 64], [55, 64]]]],
    snipe: [['o', 50, 50, 30, 8], ['l', [[50, 6], [50, 34]], 8], ['l', [[50, 66], [50, 94]], 8], ['l', [[6, 50], [34, 50]], 8], ['l', [[66, 50], [94, 50]], 8], ['c', 50, 50, 6]],
    net: [['o', 50, 50, 38, 7], ['l', [[50, 12], [50, 88]], 5], ['l', [[12, 50], [88, 50]], 5], ['l', [[24, 24], [76, 76]], 5], ['l', [[76, 24], [24, 76]], 5]],
    roll: [['a', 50, 52, 30, 0.9, 5.4, 10], ['p', [[58, 6], [88, 22], [62, 40]]], ['c', 50, 52, 9]],
    beam: [['l', [[8, 50], [70, 50]], 18], ['p', [[62, 20], [96, 50], [62, 80]]], ['L', [[12, 50], [64, 50]], 5]],
    boot: [['p', [[30, 10], [56, 10], [56, 54], [88, 68], [88, 88], [30, 88]]], ['L', [[30, 74], [88, 74]], 5]],
    sword: [['p', [[86, 6], [94, 14], [42, 66], [34, 58]]], ['l', [[22, 54], [46, 78]], 9], ['l', [[30, 70], [12, 88]], 11]],
    axe: [['l', [[28, 92], [58, 16]], 10], ['p', [[50, 18], [88, 10], [94, 50], [62, 46]]]],
    scythe: [['l', [[24, 94], [60, 14]], 9], ['p', [[60, 12], [90, 20], [98, 50], [80, 34], [56, 26]]]],
    wing: [['p', [[10, 72], [28, 32], [52, 18], [90, 12], [70, 34], [86, 36], [62, 52], [76, 56], [40, 74]]]],
    fang: [['p', [[28, 12], [72, 12], [60, 56], [50, 92], [40, 56]]], ['L', [[50, 20], [50, 60]], 5]],
    gem: [['p', [[50, 6], [86, 36], [50, 94], [14, 36]]], ['L', [[14, 36], [86, 36]], 4], ['L', [[50, 6], [36, 36], [50, 94]], 4]],
    glass: [['p', [[22, 10], [78, 10], [55, 50], [78, 90], [22, 90], [45, 50]]], ['l', [[16, 10], [84, 10]], 7], ['l', [[16, 90], [84, 90]], 7]],
    staff: [['l', [[24, 92], [60, 32]], 9], ['c', 70, 22, 17], ['C', 66, 18, 5]],
    orb: [['c', 50, 50, 36], ['C', 38, 38, 10]],
    heart: [['p', HEART]],
    armor: [['p', [[22, 18], [40, 10], [50, 22], [60, 10], [78, 18], [86, 44], [70, 52], [70, 90], [30, 90], [30, 52], [14, 44]]], ['L', [[50, 34], [50, 80]], 5]],
    thorn: [star(50, 50, 46, 22, 9)],
    lock: [['p', [[24, 46], [76, 46], [76, 90], [24, 90]]], ['a', 50, 46, 18, 3.14, 6.28, 9]],
    coin: [['c', 50, 50, 38], ['C', 50, 50, 26]],
    tower: [['p', [[30, 92], [36, 40], [26, 40], [26, 14], [40, 14], [40, 26], [46, 26], [46, 14], [54, 14], [54, 26], [60, 26], [60, 14], [74, 14], [74, 40], [64, 40], [70, 92]]]],
    recall: [['p', [[50, 6], [90, 44], [76, 44], [76, 88], [24, 88], [24, 44], [10, 44]]], ['C', 50, 66, 10]],
    swords: [['l', [[18, 84], [78, 20]], 9], ['l', [[82, 84], [22, 20]], 9], ['l', [[14, 62], [38, 86]], 7], ['l', [[86, 62], [62, 86]], 7]],
  };
  /* 글리프 그리기: (x, y)는 좌상단, s는 한 변 */
  UI.glyph = function (ctx, name, x, y, s, color, dark) {
    const g = GLY[name]; if (!g) return;
    const k = s / 100;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const dk = dark || 'rgba(12,18,34,0.85)';
    for (const p of g) {
      const op = p[0];
      if (op === 'p' || op === 'P') {
        ctx.beginPath(); const pts = p[1];
        ctx.moveTo(x + pts[0][0] * k, y + pts[0][1] * k);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(x + pts[i][0] * k, y + pts[i][1] * k);
        ctx.closePath(); ctx.fillStyle = op === 'p' ? color : dk; ctx.fill();
      } else if (op === 'l' || op === 'L') {
        ctx.beginPath(); const pts = p[1];
        ctx.moveTo(x + pts[0][0] * k, y + pts[0][1] * k);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(x + pts[i][0] * k, y + pts[i][1] * k);
        ctx.strokeStyle = op === 'l' ? color : dk; ctx.lineWidth = Math.max(0.6, p[2] * k); ctx.stroke();
      } else if (op === 'c' || op === 'C') { X.circle(ctx, x + p[1] * k, y + p[2] * k, p[3] * k); ctx.fillStyle = op === 'c' ? color : dk; ctx.fill(); }
      else if (op === 'o') { X.circle(ctx, x + p[1] * k, y + p[2] * k, p[3] * k); ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.6, p[4] * k); ctx.stroke(); }
      else if (op === 'a') { ctx.beginPath(); ctx.arc(x + p[1] * k, y + p[2] * k, p[3] * k, p[4], p[5]); ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.6, p[6] * k); ctx.stroke(); }
    }
    ctx.lineCap = 'butt';
  };
  /* 아이콘 타일 */
  function iconTile(ctx, name, x, y, s, color, dim) {
    X.rr(ctx, x, y, s, s, s * 0.16);
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, X.shade(color, -0.25)); g.addColorStop(1, X.shade(color, -0.68));
    ctx.fillStyle = g; ctx.fill();
    UI.glyph(ctx, name, x + s * 0.17, y + s * 0.17, s * 0.66, dim ? X.shade(color, 0.1) : X.shade(color, 0.72));
    X.rr(ctx, x, y, s, s, s * 0.16); ctx.strokeStyle = X.shade(color, dim ? -0.3 : 0.15); ctx.lineWidth = 1.5; ctx.stroke();
  }
  UI.iconTile = iconTile;

  /* ---------- 초상화 ---------- */
  const portraits = new Map();
  UI.portrait = function (id, team, px) {
    px = Math.max(16, Math.round(px));
    const key = id + team + '_' + px;
    let c = portraits.get(key);
    if (!c) {
      c = X.makeCanvas(px, px);
      const g = c.getContext('2d'), hd = AOS.Heroes[id];
      const gr = g.createLinearGradient(0, 0, 0, px);
      gr.addColorStop(0, X.shade(hd.color, -0.35)); gr.addColorStop(1, X.shade(C.TEAM_DARK[team], -0.45));
      g.fillStyle = gr; g.fillRect(0, 0, px, px);
      X.glow(g, px * 0.5, px * 0.42, px * 0.6, hd.color, 0.5);
      const top = A.heroHeight(id) + 0.05, sc = px / 2.25;
      g.translate(px * 0.44, top * sc); g.scale(sc, sc);
      A.hero(g, id, team, { t: 0.5, walk: 0, moving: false, atk: -1, cast: -1, stun: false });
      portraits.set(key, c);
      if (portraits.size > 200) portraits.clear();
    }
    return c;
  };
  function drawPortrait(ctx, id, team, x, y, s, round, border) {
    const img = UI.portrait(id, team, s * UI.us * (globalThis.devicePixelRatio || 1));
    ctx.save();
    if (round) X.circle(ctx, x + s / 2, y + s / 2, s / 2); else X.rr(ctx, x, y, s, s, s * 0.14);
    ctx.clip(); ctx.drawImage(img, x, y, s, s); ctx.restore();
    if (round) X.circle(ctx, x + s / 2, y + s / 2, s / 2); else X.rr(ctx, x, y, s, s, s * 0.14);
    ctx.strokeStyle = border || C.TEAM_COLORS[team]; ctx.lineWidth = Math.max(1.5, s * 0.045); ctx.stroke();
  }
  UI.drawPortrait = drawPortrait;

  function bar(ctx, x, y, w, h, frac, color, back) {
    X.rr(ctx, x, y, w, h, Math.min(4, h / 2)); ctx.fillStyle = back || 'rgba(6,10,20,0.85)'; ctx.fill();
    frac = U.clamp(frac, 0, 1);
    if (frac > 0.005) { X.rr(ctx, x, y, Math.max(h * 0.5, w * frac), h, Math.min(4, h / 2)); ctx.fillStyle = color; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(x + 1, y + 1, Math.max(0, w * frac - 2), h * 0.35); }
  }
  function lines(ctx, str, x, y, maxW, size, color, lh, weight, maxLines) {
    const ls = X.wrap(ctx, str, maxW, size, weight || 500);
    const n = maxLines ? Math.min(maxLines, ls.length) : ls.length;
    for (let i = 0; i < n; i++) T(ctx, ls[i], x, y + i * (lh || size * 1.4), size, color, 'left', weight || 500, 'top');
    return n * (lh || size * 1.4);
  }
  UI.lines = lines;
  const ROLE_COL = { tank: '#8fb4ff', fighter: '#ff9d5c', assassin: '#b79cff', mage: '#ff7a9a', marksman: '#8de28f', support: '#ffe680' };
  const KEYS = ['Q', 'W', 'E', 'R'];
  const dummyHero = (id) => { const b = AOS.Heroes[id].base; return { level: 1, ad: b.ad, ap: 0, maxHp: b.hp }; };

  /* ---------- 영웅 선택 화면 ---------- */
  UI.drawMenu = function (ctx) {
    const LW = UI.LW, LH = UI.LH, t = UI.clock;
    let g = ctx.createLinearGradient(0, 0, LW, 0);
    g.addColorStop(0, 'rgba(8,14,34,0.84)'); g.addColorStop(0.5, 'rgba(10,12,26,0.66)'); g.addColorStop(1, 'rgba(30,10,14,0.8)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    UI.block(0, 0, LW, LH);
    const sc = Math.min(1, LH / 900), ox = Math.max(40, (LW - 1520) / 2);
    // 제목
    ctx.font = X.font(60, 900); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    g = ctx.createLinearGradient(ox, 0, ox + 300, 0); g.addColorStop(0, '#6cbcff'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#ff7a6e');
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(6,10,22,0.9)'; ctx.strokeText('청홍대전', ox, 92);
    ctx.fillStyle = g; ctx.fillText('청홍대전', ox, 92);
    T(ctx, '5 vs 5 · 3라인 AOS', ox + 268, 68, 20, COL.gold, 'left', 800);
    T(ctx, '영웅 하나를 골라 아군 봇 4명과 함께 적의 코어를 파괴하세요.', ox + 268, 94, 15, COL.dim, 'left', 500);
    // 영웅 카드
    const gx = ox, gy = 138, cw = 164, ch = 204, gap = 14;
    T(ctx, '영웅 선택', gx, gy - 12, 15, COL.dim, 'left', 700);
    AOS.HeroOrder.forEach((id, i) => {
      const hd = AOS.Heroes[id], x = gx + (i % 4) * (cw + gap), y = gy + Math.floor(i / 4) * (ch + gap);
      const r = UI.hit('card' + id, x, y, cw, ch), sel = UI.sel.hero === id;
      if (r.click) { UI.sel.hero = id; if (UI.on.select) UI.on.select(id); }
      if (r.hover) UI.cursor = 'pointer';
      X.rr(ctx, x, y, cw, ch, 12);
      const cg = ctx.createLinearGradient(0, y, 0, y + ch);
      cg.addColorStop(0, sel ? X.shade(hd.color, -0.45) : r.hover ? '#28345c' : '#1c2644'); cg.addColorStop(1, sel ? X.shade(hd.color, -0.75) : '#111830');
      ctx.fillStyle = cg; ctx.fill();
      ctx.strokeStyle = sel ? COL.gold : r.hover ? '#6f86c8' : COL.line; ctx.lineWidth = sel ? 3 : 1.5; ctx.stroke();
      drawPortrait(ctx, id, 0, x + 17, y + 14, 130, false, sel ? COL.gold : X.shade(hd.color, -0.2));
      T(ctx, hd.name, x + 17, y + 172, 21, COL.text, 'left', 800);
      T(ctx, hd.title, x + cw - 16, y + 171, 13, COL.dim, 'right', 500);
      X.rr(ctx, x + 17, y + 181, 8, 8, 2); ctx.fillStyle = ROLE_COL[hd.role]; ctx.fill();
      T(ctx, hd.roleName, x + 30, y + 190, 13, ROLE_COL[hd.role], 'left', 700);
      T(ctx, C.LANE_NAMES[hd.lane], x + cw - 16, y + 190, 12, COL.dim, 'right', 500);
    });
    // 난이도
    const dy = gy + 2 * ch + gap + 20;
    T(ctx, '적 봇 난이도', gx, dy + 10, 15, COL.dim, 'left', 700);
    ['easy', 'normal', 'hard'].forEach((d, i) => {
      const act = UI.sel.diff === d;
      if (button(ctx, 'diff' + d, gx + 112 + i * 132, dy - 12, 122, 40, AOS.Difficulty[d].name, { active: act, color: d === 'easy' ? '#2e8a55' : d === 'normal' ? '#2f6fc0' : '#b83a32', size: 16 })) UI.sel.diff = d;
    });
    const bw = 4 * cw + 3 * gap;
    if (button(ctx, 'start', gx, dy + 46, bw, 66, '전투 시작', { primary: true, size: 27, weight: 900, r: 12 })) { if (UI.on.start) UI.on.start(UI.sel.hero, UI.sel.diff); }
    const hy = dy + 136;
    T(ctx, '조작', gx, hy, 14, COL.gold, 'left', 800);
    T(ctx, '우클릭(또는 좌클릭) 이동·공격  ·  Q W E R 스킬 (누르고 있으면 조준, 떼면 발사)', gx + 44, hy, 14, COL.text, 'left', 500);
    T(ctx, 'B 귀환  ·  P 상점  ·  Tab 점수판  ·  A 공격 이동  ·  S 정지  ·  G 아군 집결  ·  Space 카메라  ·  Esc 일시정지', gx + 44, hy + 22, 14, COL.dim, 'left', 500);
    // 초보자 안내
    const ty = hy + 44, th = LH - ty - 28;
    if (th >= 84) {
      X.rr(ctx, gx, ty, bw, th, 12); ctx.fillStyle = 'rgba(14,20,38,0.6)'; ctx.fill(); ctx.strokeStyle = COL.line; ctx.lineWidth = 1.2; ctx.stroke();
      const tips = ['미니언과 함께 싸우세요. 아군 미니언 없이 적 포탑에 들어가면 포탑이 나를 공격합니다.', '체력이 낮으면 B 키로 귀환해 회복하고, 모은 골드로 아이템을 사세요.', '외곽 포탑 → 내부 포탑 → 코어 순서로 파괴합니다. 5레벨이 되면 궁극기(R)가 열립니다.'];
      const n = Math.min(tips.length, Math.floor((th - 16) / 24));
      for (let i = 0; i < n; i++) {
        X.circle(ctx, gx + 20, ty + 22 + i * 24, 3.5); ctx.fillStyle = COL.gold; ctx.fill();
        T(ctx, tips[i], gx + 34, ty + 27 + i * 24, 14, '#c3cde6', 'left', 500);
      }
    }
    // 상세 패널
    const hd = AOS.Heroes[UI.sel.hero], px = gx + bw + 34, py = 62, pw = Math.max(640, LW - px - ox), ph = LH - py - 28;
    panel(ctx, px, py, pw, ph, 14, 0.9);
    // 미리보기
    const cx = px + 132, cy = py + 262;
    X.ell(ctx, cx, cy + 6, 96, 30); g = ctx.createRadialGradient(cx, cy + 6, 0, cx, cy + 6, 100); g.addColorStop(0, X.rgba(hd.color, 0.5)); g.addColorStop(1, X.rgba(hd.color, 0));
    ctx.fillStyle = g; ctx.fillRect(cx - 110, cy - 60, 220, 130);
    X.ell(ctx, cx, cy + 4, 70, 22); ctx.fillStyle = 'rgba(6,10,20,0.55)'; ctx.fill(); ctx.strokeStyle = X.rgba(C.TEAM_COLORS[0], 0.9); ctx.lineWidth = 3; ctx.stroke();
    const cyc = (t % 3.2), atk = cyc > 1.6 && cyc < 2.3 ? (cyc - 1.6) / 0.7 : -1, cast = cyc > 2.5 && cyc < 3.0 ? (cyc - 2.5) / 0.5 : -1;
    ctx.save(); ctx.translate(cx - 8, cy); ctx.scale(70, 70);
    A.hero(ctx, hd.id, 0, { t, walk: 0, moving: false, atk, cast, stun: false });
    ctx.restore(); ctx.lineCap = 'butt';
    const ix = px + 272, iw = pw - 272 - 28;
    T(ctx, hd.name, ix, py + 62, 40, COL.text, 'left', 900);
    const nameW = (ctx.font = X.font(40, 900), ctx.measureText(hd.name).width);
    T(ctx, hd.title, ix + nameW + 14, py + 62, 19, hd.color, 'left', 700);
    X.rr(ctx, ix, py + 78, 96, 26, 13); ctx.fillStyle = X.rgba(ROLE_COL[hd.role], 0.2); ctx.fill(); ctx.strokeStyle = ROLE_COL[hd.role]; ctx.lineWidth = 1.5; ctx.stroke();
    T(ctx, hd.roleName, ix + 48, py + 92, 13, ROLE_COL[hd.role], 'center', 800, 'middle');
    T(ctx, '추천 라인: ' + C.LANE_NAMES[hd.lane], ix + 110, py + 92, 14, COL.dim, 'left', 600, 'middle');
    T(ctx, '난이도', ix + 222, py + 92, 14, COL.dim, 'left', 600, 'middle');
    for (let i = 0; i < 3; i++) { X.circle(ctx, ix + 276 + i * 16, py + 91, 5); ctx.fillStyle = i < hd.diff ? COL.gold : '#2c385e'; ctx.fill(); }
    lines(ctx, hd.blurb, ix, py + 118, iw, 15, COL.text, 22, 500, 3);
    // 능력치 막대
    const b = hd.base, stats = [['체력', b.hp / 800], ['공격력', b.ad / 66], ['사거리', b.range / 11.5], ['이동 속도', (b.ms - 7) / 1.1]];
    stats.forEach((s, i) => {
      const sx = ix + (i % 2) * (iw / 2), sy = py + 198 + Math.floor(i / 2) * 30;
      T(ctx, s[0], sx, sy + 9, 13, COL.dim, 'left', 600);
      bar(ctx, sx + 70, sy, iw / 2 - 96, 10, s[1], hd.color);
    });
    // 스킬 목록
    const ay = py + 312, rowH = Math.max(72, Math.min(118, (ph - 312 - 14) / 4));
    const dh = dummyHero(hd.id);
    hd.abilities.forEach((ab, i) => {
      const y = ay + i * rowH;
      ctx.fillStyle = 'rgba(255,255,255,0.035)'; X.rr(ctx, px + 18, y, pw - 36, rowH - 8, 8); ctx.fill();
      iconTile(ctx, ab.icon, px + 28, y + 8, 52, hd.color);
      X.rr(ctx, px + 64, y + 44, 22, 20, 5); ctx.fillStyle = COL.bg0; ctx.fill(); ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.2; ctx.stroke();
      T(ctx, KEYS[i], px + 75, y + 55, 13, COL.gold, 'center', 800, 'middle');
      T(ctx, ab.name, px + 98, y + 24, 17, ab.ult ? COL.gold : COL.text, 'left', 800);
      T(ctx, (ab.ult ? '궁극기 · 5레벨 해금 · ' : '') + '재사용 ' + ab.cd + '초 · 마나 ' + ab.cost, px + pw - 30, y + 23, 13, COL.dim, 'right', 500);
      lines(ctx, ab.desc(dh), px + 98, y + 35, pw - 98 - 30, 14.5, '#c3cde6', 21, 500, Math.max(1, Math.floor((rowH - 44) / 21)));
    });
  };

  /* ---------- 공지 / 킬 로그 ---------- */
  UI.announce = function (text, color, sub, dur) { UI.ann.push({ text, color: color || COL.text, sub: sub || '', t: 0, dur: dur || 3.2 }); if (UI.ann.length > 4) UI.ann.shift(); };
  UI.toast = function (text, color) { UI.msg = { text, color: color || '#ffd0c8', t: 0 }; };
  UI.reset = function () { UI.bdT = 0; UI.guide = null; UI.feed.length = 0; UI.ann.length = 0; UI.msg = null; UI.shopOpen = UI.scoreOpen = UI.helpOpen = UI.paused = false; UI.ended = null; UI.dragMini = false; };
  UI.onEvent = function (e, G, me) {
    if (e.type === 'kill') {
      UI.feed.push({ k: e.killer, v: e.victim, by: e.by, t: 0, multi: e.multi, first: e.first });
      if (UI.feed.length > 5) UI.feed.shift();
      const vt = e.victim.team, mine = me && e.killer === me, dead = me && e.victim === me;
      const multiName = ['', '', '더블 킬!', '트리플 킬!', '쿼드라 킬!', '펜타 킬!'][Math.min(5, e.multi)] || '';
      if (dead) UI.announce('처치당했습니다', COL.red, e.killer ? e.killer.name + '에게 당했습니다' : '', 3);
      else if (e.first) UI.announce('선취점!', COL.gold, (e.killer ? e.killer.name : '') + ' → ' + e.victim.name, 3.4);
      else if (e.multi >= 2 && e.killer) UI.announce(multiName, e.killer.team === 0 ? COL.blue : COL.red, e.killer.name, 3);
      else if (mine) UI.announce('적 처치!', COL.gold, e.victim.name + ' 처치 · +' + e.bounty + ' 골드', 2.4);
      else if (me && vt !== me.team && e.assists.indexOf(me) >= 0) UI.announce('어시스트', '#9bd4ff', e.victim.name + ' 처치 지원', 2);
    } else if (e.type === 'towerDown') {
      const ours = me && e.tower.team === me.team;
      UI.announce(ours ? '아군 포탑이 파괴되었습니다' : '적 포탑을 파괴했습니다!', ours ? COL.red : COL.gold, C.LANE_NAMES[e.tower.lane] + ' ' + (e.tower.tier === 1 ? '외곽 포탑' : '내부 포탑 — 코어가 열렸습니다'), 3.4);
    } else if (e.type === 'wave' && e.n === 1) UI.announce('미니언이 출발했습니다', COL.text, '라인으로 가서 미니언과 함께 싸우세요', 3);
    else if (e.type === 'hit' && e.src === me && e.tgt.isStruct && G.t > (UI.bdT || 0) && G.backdoor(e.tgt, me.team)) { UI.bdT = G.t + 12; UI.toast('아군 미니언이 근처에 없으면 구조물에 주는 피해가 크게 줄어듭니다', '#ffe680'); }
    else if (e.type === 'levelup' && e.u === me && me.level === C.ULT_LEVEL) UI.announce('궁극기 해금!', COL.gold, 'R 키로 ' + me.hd.abilities[3].name + ' 사용', 3.2);
  };
  function drawAnnounce(ctx, dt) {
    const LW = UI.LW;
    let y = 132;
    for (let i = UI.ann.length - 1; i >= 0; i--) {
      const a = UI.ann[i]; a.t += dt;
      if (a.t >= a.dur) { UI.ann.splice(i, 1); continue; }
    }
    const a = UI.ann[UI.ann.length - 1];
    if (a) {
      const al = Math.min(1, a.t * 5, (a.dur - a.t) * 2.5), sc = 1 + Math.max(0, 0.25 - a.t) * 1.2;
      ctx.globalAlpha = al;
      const g = ctx.createLinearGradient(LW / 2 - 380, 0, LW / 2 + 380, 0);
      g.addColorStop(0, 'rgba(8,12,24,0)'); g.addColorStop(0.5, 'rgba(8,12,24,0.78)'); g.addColorStop(1, 'rgba(8,12,24,0)');
      ctx.fillStyle = g; ctx.fillRect(LW / 2 - 380, y - 40, 760, a.sub ? 86 : 62);
      TO(ctx, a.text, LW / 2, y, 38 * sc, a.color, 'center', 900, 'rgba(6,10,20,0.9)', 6, 'middle');
      if (a.sub) T(ctx, a.sub, LW / 2, y + 34, 17, COL.text, 'center', 600, 'middle');
      ctx.globalAlpha = 1;
    }
    if (UI.msg) {
      UI.msg.t += dt;
      if (UI.msg.t > 1.4) UI.msg = null;
      else { ctx.globalAlpha = Math.min(1, (1.4 - UI.msg.t) * 3); TO(ctx, UI.msg.text, LW / 2, UI.LH - 214, 18, UI.msg.color, 'center', 700, 'rgba(6,10,20,0.9)', 4, 'middle'); ctx.globalAlpha = 1; }
    }
  }
  function drawFeed(ctx, dt) {
    const LW = UI.LW; let y = 70;
    for (let i = UI.feed.length - 1; i >= 0; i--) { UI.feed[i].t += dt; if (UI.feed[i].t > 7) UI.feed.splice(i, 1); }
    for (const f of UI.feed) {
      const al = Math.min(1, (7 - f.t) * 2), w = 236, x = LW - w - 14;
      ctx.globalAlpha = al;
      X.rr(ctx, x, y, w, 34, 8); ctx.fillStyle = 'rgba(10,14,28,0.82)'; ctx.fill();
      ctx.strokeStyle = f.k ? X.rgba(C.TEAM_COLORS[f.k.team], 0.8) : COL.line; ctx.lineWidth = 1.5; ctx.stroke();
      if (f.k) { drawPortrait(ctx, f.k.heroId, f.k.team, x + 5, y + 4, 26, true); T(ctx, f.k.name, x + 38, y + 18, 14, C.TEAM_LIGHT[f.k.team], 'left', 700, 'middle'); }
      else T(ctx, f.by && f.by.isStruct ? '포탑' : f.by && f.by.isFountain ? '우물' : '미니언', x + 12, y + 18, 14, COL.dim, 'left', 700, 'middle');
      UI.glyph(ctx, 'swords', x + w / 2 - 9, y + 8, 18, f.first ? COL.gold : '#c9d2e3');
      T(ctx, f.v.name, x + w - 38, y + 18, 14, C.TEAM_LIGHT[f.v.team], 'right', 700, 'middle');
      drawPortrait(ctx, f.v.heroId, f.v.team, x + w - 31, y + 4, 26, true);
      ctx.globalAlpha = 1; y += 40;
    }
  }

  /* ---------- 미니맵 ---------- */
  UI.miniRect = { x: 0, y: 0, w: 300, h: 185 };
  function drawMinimap(ctx, G, me) {
    const mw = 300, mh = mw * C.H / C.W, x = UI.LW - mw - 14, y = UI.LH - mh - 14, s = mw / C.W;
    UI.miniRect.x = x; UI.miniRect.y = y; UI.miniRect.w = mw; UI.miniRect.h = mh;
    X.rr(ctx, x - 5, y - 5, mw + 10, mh + 10, 8); ctx.fillStyle = COL.bg0; ctx.fill(); ctx.strokeStyle = COL.line; ctx.lineWidth = 2; ctx.stroke();
    if (W.mini) ctx.drawImage(W.mini, x, y, mw, mh);
    const vt = me ? me.team : -1;
    const fog = W.fogCanvas();
    if (fog) { const fr = W.fogRect; ctx.imageSmoothingEnabled = true; ctx.drawImage(fog, fr.x, fr.y, fr.w, fr.h, x, y, mw, mh); }
    for (const u of G.minions) {
      if (u.dead || (me && !W.visU(u))) continue;
      ctx.fillStyle = C.TEAM_COLORS[u.team]; ctx.fillRect(x + u.x * s - 1.5, y + u.y * s - 1.5, 3, 3);
    }
    for (const st of G.structs) {
      if (st.dead) continue;
      const sx = x + st.x * s, sy = y + st.y * s, r = st.kind === 'core' ? 7 : 4.5;
      ctx.fillStyle = COL.bg0; ctx.fillRect(sx - r - 1.5, sy - r - 1.5, r * 2 + 3, r * 2 + 3);
      ctx.fillStyle = C.TEAM_COLORS[st.team]; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      if (st.kind === 'core') { ctx.fillStyle = '#ffffff'; X.poly(ctx, [sx, sy - 5, sx + 4, sy, sx, sy + 5, sx - 4, sy]); ctx.fill(); }
      if (G.t - st.lastHurt < 2 && Math.sin(UI.clock * 14) > 0) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(sx - r - 3, sy - r - 3, r * 2 + 6, r * 2 + 6); }
    }
    for (const h of G.heroes) {
      if (h.dead || (me && !W.visU(h))) continue;
      const sx = x + h.x * s, sy = y + h.y * s, r = h === me ? 9 : 7.5;
      drawPortrait(ctx, h.heroId, h.team, sx - r, sy - r, r * 2, true, h === me ? '#7dff8a' : C.TEAM_COLORS[h.team]);
    }
    // 추천 라인 안내 표시
    if (UI.guide && me && G.t < UI.guide.until) { const q = (UI.clock * 1.2) % 1, gx2 = x + UI.guide.x * s, gy2 = y + UI.guide.y * s; X.circle(ctx, gx2, gy2, 5 + q * 12); ctx.strokeStyle = X.rgba(COL.gold, 1 - q); ctx.lineWidth = 2.5; ctx.stroke(); X.circle(ctx, gx2, gy2, 4); ctx.fillStyle = COL.gold; ctx.fill(); }
    // 집결 표시
    const ai = me ? G.teams[me.team].ai : null;
    if (ai && ai.rally && G.t < ai.rally.until) { const q = (UI.clock * 1.5) % 1; X.circle(ctx, x + ai.rally.x * s, y + ai.rally.y * s, 4 + q * 10); ctx.strokeStyle = X.rgba(COL.gold, 1 - q); ctx.lineWidth = 2; ctx.stroke(); }
    // 카메라 영역
    const S = W.S * W.cam.zoom, vw = W.vw / S, vh = W.vh / S;
    ctx.save(); X.rr(ctx, x, y, mw, mh, 0); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + (W.cam.x - vw / 2) * s, y + (W.cam.y - vh / 2) * s, vw * s, vh * s);
    ctx.restore();
    const r = UI.hit('minimap', x - 5, y - 5, mw + 10, mh + 10);
    const wx = U.clamp((UI.mx - x) / s, 0, C.W), wy = U.clamp((UI.my - y) / s, 0, C.H);
    if (r.click) UI.dragMini = true;
    if (!UI.down) UI.dragMini = false;
    if (UI.dragMini && UI.on.look) UI.on.look(wx, wy);
    if (r.rclick && UI.on.miniMove) UI.on.miniMove(wx, wy);
  }

  /* ---------- 툴팁 ---------- */
  function abilityTip(h, i) {
    const ab = h.hd.abilities[i];
    return { title: ab.name, key: KEYS[i], sub: '재사용 ' + (ab.cd * (1 - h.cdr)).toFixed(1) + '초 · 마나 ' + ab.cost + (ab.ult && h.level < C.ULT_LEVEL ? ' · ' + C.ULT_LEVEL + '레벨에 해금' : ''), body: ab.desc(h), color: h.hd.color };
  }
  function itemTip(id, extra) { const it = AOS.Items[id]; return { title: it.name, sub: it.cost + ' 골드', body: it.desc + (extra ? '\n' + extra : ''), color: it.color }; }
  function drawTip(ctx) {
    const tp = UI.tip; if (!tp) return;
    const w = 330, pad = 14;
    const ls = X.wrap(ctx, tp.body || '', w - pad * 2, 14, 500);
    const h = pad * 2 + 24 + (tp.sub ? 20 : 0) + ls.length * 20 + 2;
    let x = UI.mx + 18, y = UI.my - h - 12;
    if (x + w > UI.LW - 8) x = UI.LW - w - 8;
    if (y < 8) y = Math.min(UI.LH - h - 8, UI.my + 22);
    X.rr(ctx, x, y, w, h, 10); ctx.fillStyle = 'rgba(8,12,24,0.96)'; ctx.fill(); ctx.strokeStyle = tp.color || COL.gold; ctx.lineWidth = 1.5; ctx.stroke();
    T(ctx, tp.title, x + pad, y + pad + 16, 17, tp.color ? X.shade(tp.color, 0.45) : COL.gold, 'left', 800);
    if (tp.key) T(ctx, '[' + tp.key + ']', x + w - pad, y + pad + 16, 15, COL.gold, 'right', 800);
    let yy = y + pad + 24;
    if (tp.sub) { T(ctx, tp.sub, x + pad, yy + 14, 13, COL.dim, 'left', 600); yy += 20; }
    for (let i = 0; i < ls.length; i++) T(ctx, ls[i], x + pad, yy + 16 + i * 20, 14, COL.text, 'left', 500);
  }

  /* ---------- HUD ---------- */
  function drawTop(ctx, G, me) {
    const LW = UI.LW, w = 380, x = LW / 2 - w / 2;
    panel(ctx, x, 8, w, 52, 12, 0.88);
    UI.block(x, 8, w, 52);
    T(ctx, String(G.teams[0].kills), x + 118, 35, 30, COL.blue, 'right', 900, 'middle');
    T(ctx, String(G.teams[1].kills), x + w - 118, 35, 30, COL.red, 'left', 900, 'middle');
    UI.glyph(ctx, 'tower', x + 14, 20, 26, COL.blue); T(ctx, String(G.teams[0].towers), x + 44, 35, 18, '#bfe0ff', 'left', 800, 'middle');
    UI.glyph(ctx, 'tower', x + w - 40, 20, 26, COL.red); T(ctx, String(G.teams[1].towers), x + w - 44, 35, 18, '#ffc9c4', 'right', 800, 'middle');
    T(ctx, U.fmtTime(G.t), LW / 2, 31, 21, COL.text, 'center', 800, 'middle');
    T(ctx, G.t < C.FIRST_WAVE ? '미니언 출발까지 ' + Math.ceil(C.FIRST_WAVE - G.t) + '초' : '다음 웨이브 ' + Math.ceil(G.nextWaveT - G.t) + '초', LW / 2, 49, 11, COL.dim, 'center', 600, 'middle');
    // 아군 프레임
    let y = 12;
    for (const h of G.heroes) {
      if (!me || h.team !== me.team || h === me) continue;
      panel(ctx, 12, y, 196, 46, 9, 0.84); UI.block(12, y, 196, 46);
      drawPortrait(ctx, h.heroId, h.team, 17, y + 4, 38, true);
      T(ctx, h.name, 62, y + 17, 14, COL.text, 'left', 700);
      T(ctx, 'Lv ' + h.level, 200, y + 17, 12, COL.gold, 'right', 700);
      if (h.dead) { ctx.fillStyle = 'rgba(8,12,24,0.62)'; X.rr(ctx, 12, y, 196, 46, 9); ctx.fill(); T(ctx, '부활 ' + Math.ceil(h.respawnT) + '초', 110, y + 34, 13, '#ffb0a8', 'center', 700); }
      else { bar(ctx, 62, y + 24, 138, 9, h.hp / h.maxHp, COL.blue); bar(ctx, 62, y + 35, 138, 4, h.mp / Math.max(1, h.maxMp), COL.mana); }
      y += 51;
    }
    // 적 영웅 줄 + 시스템 버튼
    let ex = LW - 14 - 3 * 38;
    const sbtn = (id, gl, tip, fn, on) => { const r = UI.hit(id, ex, 12, 34, 34); X.rr(ctx, ex, 12, 34, 34, 8); ctx.fillStyle = r.hover ? '#2c3a66' : 'rgba(16,22,42,0.88)'; ctx.fill(); ctx.strokeStyle = COL.line; ctx.lineWidth = 1.5; ctx.stroke(); gl(ex, 12, on); if (r.hover) { UI.cursor = 'pointer'; UI.tip = { title: tip, body: '' }; } if (r.click) fn(); ex += 38; };
    sbtn('bHelp', (bx, by) => T(ctx, '?', bx + 17, by + 18, 20, COL.text, 'center', 900, 'middle'), '도움말 (F1)', () => { UI.helpOpen = !UI.helpOpen; });
    sbtn('bSnd', (bx, by) => { X.poly(ctx, [bx + 8, by + 14, bx + 13, by + 14, bx + 19, by + 9, bx + 19, by + 25, bx + 13, by + 20, bx + 8, by + 20]); ctx.fillStyle = COL.text; ctx.fill(); if (UI.muted) { X.line(ctx, bx + 22, by + 12, bx + 28, by + 22, COL.red, 2.2); X.line(ctx, bx + 28, by + 12, bx + 22, by + 22, COL.red, 2.2); } else { ctx.beginPath(); ctx.arc(bx + 19, by + 17, 7, -0.8, 0.8); ctx.strokeStyle = COL.text; ctx.lineWidth = 2; ctx.stroke(); } }, UI.muted ? '소리 켜기 (M)' : '소리 끄기 (M)', () => { if (UI.on.mute) UI.on.mute(); });
    sbtn('bPause', (bx, by) => { ctx.fillStyle = COL.text; ctx.fillRect(bx + 11, by + 9, 4.5, 16); ctx.fillRect(bx + 19, by + 9, 4.5, 16); }, '일시정지 (Esc)', () => { if (UI.on.pause) UI.on.pause(); });
    let px = LW - 14 - 3 * 38 - 12;
    const enemies = G.heroes.filter(h => !me || h.team !== me.team);
    for (let i = enemies.length - 1; i >= 0; i--) {
      const h = enemies[i]; px -= 40;
      drawPortrait(ctx, h.heroId, h.team, px, 12, 34, true);
      if (h.dead) { X.circle(ctx, px + 17, 29, 17); ctx.fillStyle = 'rgba(8,12,24,0.7)'; ctx.fill(); T(ctx, String(Math.ceil(h.respawnT)), px + 17, 30, 14, '#ffb0a8', 'center', 800, 'middle'); }
      else { bar(ctx, px + 1, 48, 32, 4, h.hp / h.maxHp, me && !W.visU(h) ? '#6a7290' : COL.red); }
      X.circle(ctx, px + 28, 40, 8); ctx.fillStyle = COL.bg0; ctx.fill(); T(ctx, String(h.level), px + 28, 41, 10, COL.text, 'center', 700, 'middle');
    }
  }
  function slotState(h, i) {
    const why = h.castBlock(i);
    return why === 'cd' ? 1 : why === 'mana' ? 2 : why === 'level' ? 3 : why === 'dead' ? 4 : 0;
  }
  function drawBottom(ctx, G, me) {
    const LW = UI.LW, LH = UI.LH, w = 800, h = 134, x = LW / 2 - w / 2 - 60, y = LH - h - 10;
    panel(ctx, x, y, w, h, 14, 0.92); UI.block(x, y, w, h);
    // 초상화 + 레벨 + 경험치
    drawPortrait(ctx, me.heroId, me.team, x + 14, y + 14, 92, false, me.dead ? '#59607a' : COL.gold);
    if (me.dead) { X.rr(ctx, x + 14, y + 14, 92, 92, 13); ctx.fillStyle = 'rgba(8,12,24,0.7)'; ctx.fill(); T(ctx, String(Math.ceil(me.respawnT)), x + 60, y + 62, 40, '#ffb0a8', 'center', 900, 'middle'); }
    X.circle(ctx, x + 100, y + 100, 17); ctx.fillStyle = COL.bg0; ctx.fill(); ctx.strokeStyle = COL.gold; ctx.lineWidth = 2; ctx.stroke();
    T(ctx, String(me.level), x + 100, y + 101, 17, COL.gold, 'center', 900, 'middle');
    bar(ctx, x + 14, y + 112, 76, 8, me.level >= C.MAX_LEVEL ? 1 : me.xp / me.xpNeed(), '#b98cff');
    const pr = UI.hit('hudPortrait', x + 14, y + 14, 92, 92);
    if (pr.hover) UI.tip = { title: me.name + ' · ' + me.hd.title, sub: me.hd.roleName + ' · 레벨 ' + me.level, body: '공격력 ' + Math.round(me.ad) + ' · 주문력 ' + Math.round(me.ap) + '\n방어력 ' + Math.round(me.def) + ' · 공격 속도 ' + me.as.toFixed(2) + '\n이동 속도 ' + me.ms.toFixed(1) + ' · 재사용 감소 ' + Math.round(me.cdr * 100) + '%\n생명력 흡수 ' + Math.round(me.lifesteal * 100) + '% · 사거리 ' + me.range, color: me.hd.color };
    // 스킬
    const ax = x + 128, ay = y + 12, as = 64;
    for (let i = 0; i < 4; i++) {
      const ab = me.hd.abilities[i], bx = ax + i * (as + 9), st = slotState(me, i), r = UI.hit('ab' + i, bx, ay, as, as);
      iconTile(ctx, ab.icon, bx, ay, as, me.hd.color, st !== 0);
      if (st === 1) {
        const total = ab.cd * (1 - me.cdr), f = U.clamp(me.cds[i] / total, 0, 1);
        ctx.save(); X.rr(ctx, bx, ay, as, as, as * 0.16); ctx.clip();
        ctx.beginPath(); ctx.moveTo(bx + as / 2, ay + as / 2); ctx.arc(bx + as / 2, ay + as / 2, as, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.closePath(); ctx.fillStyle = 'rgba(6,10,20,0.78)'; ctx.fill(); ctx.restore();
        TO(ctx, me.cds[i] >= 10 ? String(Math.ceil(me.cds[i])) : me.cds[i].toFixed(1), bx + as / 2, ay + as / 2 + 1, 23, '#ffffff', 'center', 900, 'rgba(6,10,20,0.9)', 4, 'middle');
      } else if (st === 2) { X.rr(ctx, bx, ay, as, as, as * 0.16); ctx.fillStyle = 'rgba(20,40,120,0.55)'; ctx.fill(); }
      else if (st === 3) { X.rr(ctx, bx, ay, as, as, as * 0.16); ctx.fillStyle = 'rgba(6,10,20,0.72)'; ctx.fill(); UI.glyph(ctx, 'lock', bx + 20, ay + 16, 24, '#aab3cc'); T(ctx, 'Lv ' + C.ULT_LEVEL, bx + as / 2, ay + 52, 11, '#aab3cc', 'center', 700, 'middle'); }
      else if (st === 4) { X.rr(ctx, bx, ay, as, as, as * 0.16); ctx.fillStyle = 'rgba(6,10,20,0.6)'; ctx.fill(); }
      if (st === 0 && G.t - me.levelUpT < 1.2 && i === 3 && me.level === C.ULT_LEVEL) { X.rr(ctx, bx - 2, ay - 2, as + 4, as + 4, 12); ctx.strokeStyle = X.rgba(COL.gold, 0.5 + Math.sin(UI.clock * 14) * 0.5); ctx.lineWidth = 3; ctx.stroke(); }
      if (UI.keyAim === i || r.hover) { X.rr(ctx, bx - 1, ay - 1, as + 2, as + 2, 11); ctx.strokeStyle = UI.keyAim === i ? '#ffffff' : COL.gold; ctx.lineWidth = 2.5; ctx.stroke(); }
      X.rr(ctx, bx + 3, ay + 3, 20, 19, 5); ctx.fillStyle = 'rgba(6,10,20,0.85)'; ctx.fill();
      T(ctx, KEYS[i], bx + 13, ay + 13, 13, st === 0 ? COL.gold : COL.dim, 'center', 800, 'middle');
      if (st !== 3) T(ctx, String(ab.cost), bx + as - 5, ay + as - 7, 11, st === 2 ? '#ff9a8f' : '#9cc6ff', 'right', 700);
      if (r.hover) { UI.tip = abilityTip(me, i); UI.cursor = 'pointer'; }
      if (r.click && UI.on.castSlot) UI.on.castSlot(i);
    }
    // 귀환 버튼
    const rx = ax + 4 * (as + 9) + 4, rr0 = UI.hit('recall', rx, ay + 6, 52, 52);
    X.rr(ctx, rx, ay + 6, 52, 52, 10); ctx.fillStyle = rr0.hover ? '#2c3a66' : '#1a2340'; ctx.fill(); ctx.strokeStyle = me.recall ? '#9bd4ff' : COL.line; ctx.lineWidth = me.recall ? 2.5 : 1.5; ctx.stroke();
    UI.glyph(ctx, 'recall', rx + 12, ay + 14, 28, '#9bd4ff'); T(ctx, 'B', rx + 44, ay + 52, 11, COL.gold, 'right', 800);
    if (rr0.hover) { UI.tip = { title: '귀환', key: 'B', sub: C.RECALL_TIME + '초 집중', body: '본진 우물로 돌아갑니다. 피해를 입거나 움직이면 취소됩니다. 우물에서는 체력과 마나가 빠르게 회복되고 상점을 이용할 수 있습니다.', color: '#7fc8ff' }; UI.cursor = 'pointer'; }
    if (rr0.click && UI.on.recall) UI.on.recall();
    // 체력 / 마나
    const bx = x + 128, bw = 352;
    bar(ctx, bx, y + 86, bw, 21, me.hp / me.maxHp, me.dead ? '#59607a' : COL.green);
    if (me.shield > 0) { ctx.fillStyle = 'rgba(238,246,255,0.85)'; ctx.fillRect(bx + bw * U.clamp(me.hp / me.maxHp, 0, 1) - Math.min(bw * 0.3, bw * me.shield / me.maxHp), y + 86, Math.min(bw * 0.3, bw * me.shield / me.maxHp), 5); }
    TO(ctx, Math.ceil(me.hp) + ' / ' + Math.round(me.maxHp) + (me.shield > 0 ? '  (+' + Math.round(me.shield) + ')' : ''), bx + bw / 2, y + 97, 14, '#ffffff', 'center', 800, 'rgba(6,10,20,0.85)', 3, 'middle');
    bar(ctx, bx, y + 110, bw, 13, me.mp / Math.max(1, me.maxMp), COL.mana);
    TO(ctx, Math.floor(me.mp) + ' / ' + Math.round(me.maxMp), bx + bw / 2, y + 117, 11, '#ffffff', 'center', 700, 'rgba(6,10,20,0.85)', 3, 'middle');
    // 아이템
    const ix = x + 498, iy = y + 14, is = 48;
    for (let i = 0; i < 6; i++) {
      const sx = ix + (i % 3) * (is + 6), sy = iy + Math.floor(i / 3) * (is + 6), id = me.items[i];
      if (id) { const it = AOS.Items[id]; iconTile(ctx, it.icon, sx, sy, is, it.color); const r = UI.hit('inv' + i, sx, sy, is, is); if (r.hover) UI.tip = itemTip(id); }
      else { X.rr(ctx, sx, sy, is, is, 8); ctx.fillStyle = 'rgba(6,10,20,0.6)'; ctx.fill(); ctx.strokeStyle = '#263256'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    // 골드 + 상점
    const gx = x + 670;
    UI.glyph(ctx, 'coin', gx, y + 16, 24, COL.gold, '#a9781c');
    T(ctx, U.fmtNum(Math.floor(me.gold)), gx + 30, y + 29, 22, COL.gold, 'left', 900, 'middle');
    const can = G.canShop(me), next = nextRec(me), afford = next && me.gold >= AOS.Items[next].cost;
    if (button(ctx, 'shopBtn', gx, y + 50, 116, 38, '상점 (P)', { size: 15, active: can && afford, color: '#8a6a1c', textColor: can && afford ? '#fff0b8' : COL.text })) UI.shopOpen = !UI.shopOpen;
    T(ctx, me.kills + ' / ' + me.deaths + ' / ' + me.assists, gx + 58, y + 104, 15, COL.text, 'center', 800, 'middle');
    if (!can && afford) T(ctx, 'B 귀환 후 구매 가능', gx + 58, y + 121, 11, COL.gold, 'center', 700, 'middle');
    else T(ctx, 'K / D / A  ·  CS ' + me.cs, gx + 58, y + 121, 11, COL.dim, 'center', 600, 'middle');
    if (can && afford && !UI.shopOpen) { const q = 0.5 + Math.sin(UI.clock * 6) * 0.5; X.rr(ctx, gx - 2, y + 48, 120, 42, 10); ctx.strokeStyle = X.rgba(COL.gold, 0.4 + q * 0.6); ctx.lineWidth = 2.5; ctx.stroke(); }
    // 귀환 진행 막대
    if (me.recall) { const f = me.recall.t / C.RECALL_TIME; panel(ctx, LW / 2 - 170, y - 54, 340, 36, 10, 0.9); bar(ctx, LW / 2 - 158, y - 30, 316, 7, f, '#7fc8ff'); T(ctx, '귀환 중… ' + (C.RECALL_TIME - me.recall.t).toFixed(1) + '초  (움직이면 취소)', LW / 2, y - 40, 13, '#cfe6ff', 'center', 700, 'middle'); }
    else if (me.cast && me.cast.dur >= 0.5) { const f = me.cast.t / me.cast.dur; panel(ctx, LW / 2 - 130, y - 44, 260, 26, 9, 0.9); bar(ctx, LW / 2 - 120, y - 35, 240, 8, f, me.hd.color); }
  }
  function nextRec(h) { if (h.items.length >= 6) return null; for (const id of h.hd.build) if (h.items.indexOf(id) < 0) return id; return null; }
  UI.nextRec = nextRec;

  /* ---------- 상점 ---------- */
  function drawShop(ctx, G, me) {
    const LW = UI.LW, LH = UI.LH, w = 940, h = 524, x = LW / 2 - w / 2, y = Math.max(66, LH / 2 - h / 2 - 58);
    ctx.fillStyle = 'rgba(4,8,18,0.45)'; ctx.fillRect(0, 0, LW, LH);
    panel(ctx, x, y, w, h, 16, 0.97); UI.block(0, 0, LW, LH);
    const can = G.canShop(me);
    T(ctx, '상점', x + 28, y + 44, 28, COL.text, 'left', 900);
    UI.glyph(ctx, 'coin', x + 110, y + 23, 24, COL.gold, '#a9781c'); T(ctx, U.fmtNum(Math.floor(me.gold)), x + 140, y + 44, 24, COL.gold, 'left', 900);
    T(ctx, can ? '아이템을 클릭하면 바로 구매합니다 · 같은 아이템은 하나만 가질 수 있습니다' : '본진 우물 근처에 있거나 부활 대기 중일 때만 구매할 수 있습니다', x + w - 70, y + 42, 14, can ? COL.dim : '#ffb0a8', 'right', 600);
    if (button(ctx, 'shopClose', x + w - 52, y + 16, 36, 36, '×', { size: 24 })) UI.shopOpen = false;
    const cw = 122, ch = 174, gap = 8, gx = x + 22, gy = y + 70, rec = me.hd.build, nxt = nextRec(me);
    AOS.ItemOrder.forEach((id, i) => {
      const it = AOS.Items[id], cx = gx + (i % 7) * (cw + gap), cy = gy + Math.floor(i / 7) * (ch + gap);
      const owned = me.items.indexOf(id) >= 0, afford = me.gold >= it.cost, full = me.items.length >= 6, ok = can && !owned && afford && !full;
      const r = UI.hit('shop' + id, cx, cy, cw, ch), ri = rec.indexOf(id);
      X.rr(ctx, cx, cy, cw, ch, 10);
      ctx.fillStyle = owned ? '#16301f' : r.hover && ok ? '#2a3760' : '#182140'; ctx.fill();
      ctx.strokeStyle = owned ? '#3fae5f' : id === nxt ? COL.gold : r.hover ? '#6f86c8' : COL.line; ctx.lineWidth = id === nxt ? 2.5 : 1.5; ctx.stroke();
      iconTile(ctx, it.icon, cx + cw / 2 - 30, cy + 14, 60, it.color, !ok && !owned);
      const nl = X.wrap(ctx, it.name, cw - 12, 13.5, 700);
      for (let k = 0; k < Math.min(2, nl.length); k++) T(ctx, nl[k], cx + cw / 2, cy + 96 + k * 17, 13.5, owned ? '#8de28f' : COL.text, 'center', 700);
      if (owned) T(ctx, '보유 중', cx + cw / 2, cy + ch - 14, 13, '#8de28f', 'center', 800);
      else { UI.glyph(ctx, 'coin', cx + cw / 2 - 34, cy + ch - 29, 16, afford ? COL.gold : '#7a6a48', '#6a5a30'); T(ctx, String(it.cost), cx + cw / 2 - 12, cy + ch - 15, 16, afford ? COL.gold : '#a0646a', 'left', 800); }
      if (ri >= 0) { X.rr(ctx, cx + 6, cy + 6, 38, 19, 6); ctx.fillStyle = id === nxt ? COL.gold : 'rgba(242,193,78,0.25)'; ctx.fill(); T(ctx, '추천' + (ri + 1), cx + 25, cy + 16, 11, id === nxt ? '#2a1c05' : COL.gold, 'center', 800, 'middle'); }
      if (r.hover) { UI.tip = itemTip(id, owned ? '이미 보유 중입니다.' : full ? '아이템 칸이 가득 찼습니다.' : !afford ? (it.cost - Math.floor(me.gold)) + ' 골드가 부족합니다.' : !can ? '본진에서 구매할 수 있습니다.' : '클릭하여 구매'); if (ok) UI.cursor = 'pointer'; }
      if (r.click) { if (ok) { if (UI.on.buy) UI.on.buy(id); } else if (UI.on.deny) UI.on.deny(owned ? '이미 보유한 아이템입니다' : full ? '아이템 칸이 가득 찼습니다' : !afford ? '골드가 부족합니다' : '본진에서만 구매할 수 있습니다'); }
    });
    // 보유 아이템
    const by = gy + 2 * (ch + gap) + 10;
    T(ctx, '내 아이템', x + 28, by + 34, 15, COL.dim, 'left', 700);
    for (let i = 0; i < 6; i++) {
      const sx = x + 120 + i * 62, id = me.items[i];
      if (id) {
        const it = AOS.Items[id]; iconTile(ctx, it.icon, sx, by + 2, 54, it.color);
        const r = UI.hit('sell' + i, sx, by + 2, 54, 54);
        if (r.hover) { UI.tip = itemTip(id, can ? '우클릭: 되팔기 (+' + Math.round(it.cost * 0.7) + ' 골드)' : ''); }
        if (r.rclick && can && UI.on.sell) UI.on.sell(i);
      } else { X.rr(ctx, sx, by + 2, 54, 54, 9); ctx.fillStyle = 'rgba(6,10,20,0.6)'; ctx.fill(); ctx.strokeStyle = '#263256'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    T(ctx, '우클릭: 되팔기(70%)', x + 506, by + 34, 13, COL.dim, 'left', 500);
    if (button(ctx, 'autoBuy', x + w - 28 - 268, by + 9, 268, 40, '추천 아이템 자동 구매: ' + (UI.autoBuy ? '켜짐' : '꺼짐'), { size: 14, active: UI.autoBuy, color: '#2e8a55', tip: { title: '추천 아이템 자동 구매', body: '켜 두면 본진에 있거나 부활을 기다리는 동안 추천 순서대로 아이템을 자동으로 삽니다.', color: '#8de28f' } })) { UI.autoBuy = !UI.autoBuy; if (UI.on.prefs) UI.on.prefs(); }
  }

  /* ---------- 점수판 ---------- */
  function drawScoreTable(ctx, G, me, x, y, w, extra) {
    const rowH = 40;
    const cols = [0, 282, 350, 456, 524, 610, 706];
    for (let team = 0; team < 2; team++) {
      const ty = y + team * (5 * rowH + 62), tc = C.TEAM_COLORS[team];
      X.rr(ctx, x, ty, w, 30, 8); ctx.fillStyle = X.rgba(tc, 0.22); ctx.fill();
      T(ctx, C.TEAM_NAMES[team] + ' 팀' + (me && me.team === team ? ' (아군)' : ''), x + 14, ty + 16, 16, C.TEAM_LIGHT[team], 'left', 800, 'middle');
      T(ctx, '킬 ' + G.teams[team].kills + ' · 포탑 ' + G.teams[team].towers, x + 150, ty + 16, 13, COL.text, 'left', 600, 'middle');
      const hx = x + 14;
      ['레벨', 'K / D / A', 'CS', '골드', extra ? '영웅 피해' : '상태', '아이템'].forEach((s, i) => T(ctx, s, hx + cols[i + 1], ty + 16, 12, COL.dim, 'left', 600, 'middle'));
      G.heroes.filter(h => h.team === team).forEach((h, i) => {
        const ry = ty + 34 + i * rowH;
        if (h === me) { X.rr(ctx, x, ry, w, rowH - 4, 7); ctx.fillStyle = 'rgba(125,255,138,0.1)'; ctx.fill(); ctx.strokeStyle = 'rgba(125,255,138,0.5)'; ctx.lineWidth = 1.2; ctx.stroke(); }
        else if (i % 2) { X.rr(ctx, x, ry, w, rowH - 4, 7); ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fill(); }
        drawPortrait(ctx, h.heroId, h.team, hx, ry + 2, 32, true);
        T(ctx, h.name + (h === me ? ' (나)' : ''), hx + 42, ry + 13, 15, COL.text, 'left', 800, 'middle');
        T(ctx, h.hd.title, hx + 42, ry + 28, 11, COL.dim, 'left', 500, 'middle');
        T(ctx, String(h.level), hx + cols[1] + 8, ry + 18, 15, COL.gold, 'left', 800, 'middle');
        T(ctx, h.kills + ' / ' + h.deaths + ' / ' + h.assists, hx + cols[2], ry + 18, 15, COL.text, 'left', 700, 'middle');
        T(ctx, String(h.cs), hx + cols[3], ry + 18, 14, COL.text, 'left', 600, 'middle');
        T(ctx, U.fmtNum(h.stats.gold), hx + cols[4], ry + 18, 14, COL.gold, 'left', 700, 'middle');
        if (extra) T(ctx, U.fmtNum(h.stats.dmg), hx + cols[5], ry + 18, 14, '#ffb0a8', 'left', 700, 'middle');
        else T(ctx, h.dead ? '부활 ' + Math.ceil(h.respawnT) + '초' : '생존', hx + cols[5], ry + 18, 13, h.dead ? '#ffb0a8' : '#8de28f', 'left', 700, 'middle');
        for (let k = 0; k < h.items.length; k++) { const it = AOS.Items[h.items[k]]; iconTile(ctx, it.icon, hx + cols[6] + k * 30, ry + 5, 26, it.color); }
      });
    }
    return 2 * (5 * rowH + 62);
  }
  function drawScore(ctx, G, me) {
    const LW = UI.LW, LH = UI.LH, w = 930, h = 560, x = LW / 2 - w / 2, y = Math.max(64, LH / 2 - h / 2 - 30);
    panel(ctx, x, y, w, h, 16, 0.95);
    T(ctx, '점수판', x + 26, y + 38, 24, COL.text, 'left', 900);
    T(ctx, '경기 시간 ' + U.fmtTime(G.t), x + w - 26, y + 36, 15, COL.dim, 'right', 600);
    drawScoreTable(ctx, G, me, x + 20, y + 56, w - 40, false);
  }

  /* ---------- 도움말 / 일시정지 / 결과 ---------- */
  const HELP = [
    ['우클릭 / 좌클릭', '땅: 이동 · 적: 공격 (누른 채 끌면 계속 이동)'], ['Q W E R', '스킬 — 누르고 있으면 조준 표시, 떼면 커서 방향으로 발사'], ['A', '커서 위치로 공격 이동 (가는 길의 적을 공격)'],
    ['S', '정지'], ['B', '귀환 (본진 우물로 순간이동, ' + C.RECALL_TIME + '초)'], ['P', '상점 (본진 또는 부활 대기 중)'], ['G', '집결 신호 — 아군 봇들이 커서 위치로 모입니다'],
    ['Tab', '점수판 (누르고 있는 동안)'], ['Space', '카메라를 내 영웅에 고정'], ['Y / 미니맵 클릭', '카메라 자유 이동 (화면 가장자리·방향키로 이동)'], ['마우스 휠', '확대 / 축소'], ['M', '소리 켜기 / 끄기'], ['Esc', '일시정지'],
  ];
  function drawHelpBody(ctx, x, y, w) {
    HELP.forEach((r, i) => {
      const ry = y + i * 30;
      X.rr(ctx, x, ry, 168, 24, 6); ctx.fillStyle = '#222d50'; ctx.fill(); ctx.strokeStyle = COL.line; ctx.lineWidth = 1.2; ctx.stroke();
      T(ctx, r[0], x + 84, ry + 13, 13, COL.gold, 'center', 800, 'middle');
      T(ctx, r[1], x + 182, ry + 13, 14, COL.text, 'left', 500, 'middle');
    });
    return HELP.length * 30;
  }
  function drawHelp(ctx) {
    const LW = UI.LW, LH = UI.LH, w = 760, h = 560, x = LW / 2 - w / 2, y = Math.max(40, LH / 2 - h / 2 - 20);
    ctx.fillStyle = 'rgba(4,8,18,0.6)'; ctx.fillRect(0, 0, LW, LH); UI.block(0, 0, LW, LH);
    panel(ctx, x, y, w, h, 16, 0.98);
    T(ctx, '조작법', x + 28, y + 44, 26, COL.text, 'left', 900);
    T(ctx, '목표: 미니언과 함께 라인을 밀어 포탑을 부수고, 적 본진의 코어를 파괴하면 승리합니다.', x + 28, y + 74, 14, COL.dim, 'left', 500);
    drawHelpBody(ctx, x + 28, y + 96, w - 56);
    if (button(ctx, 'helpClose', x + w / 2 - 90, y + h - 58, 180, 42, '닫기', { size: 16 })) UI.helpOpen = false;
  }
  function drawPause(ctx) {
    const LW = UI.LW, LH = UI.LH, w = 420, h = 330, x = LW / 2 - w / 2, y = LH / 2 - h / 2 - 20;
    ctx.fillStyle = 'rgba(4,8,18,0.66)'; ctx.fillRect(0, 0, LW, LH); UI.block(0, 0, LW, LH);
    panel(ctx, x, y, w, h, 16, 0.98);
    T(ctx, '일시정지', LW / 2, y + 54, 30, COL.text, 'center', 900);
    if (button(ctx, 'pResume', x + 50, y + 88, w - 100, 50, '계속하기', { primary: true, size: 19, weight: 800 })) { if (UI.on.pause) UI.on.pause(); }
    if (button(ctx, 'pHelp', x + 50, y + 148, w - 100, 44, '조작법 보기', { size: 16 })) { UI.helpOpen = true; }
    if (button(ctx, 'pRestart', x + 50, y + 200, w - 100, 44, '같은 영웅으로 다시 시작', { size: 16 })) { if (UI.on.restart) UI.on.restart(); }
    if (button(ctx, 'pMenu', x + 50, y + 252, w - 100, 44, '영웅 선택으로', { size: 16 })) { if (UI.on.menu) UI.on.menu(); }
  }
  function drawEnd(ctx, G, me, dt) {
    const LW = UI.LW, LH = UI.LH, e = UI.ended;
    e.t += dt;
    const a = U.clamp((e.t - 1.6) / 0.8, 0, 1);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(4,8,18,0.78)'; ctx.fillRect(0, 0, LW, LH); UI.block(0, 0, LW, LH);
    const win = e.win, w = 930, x = LW / 2 - w / 2, y = Math.max(16, LH / 2 - 420);
    const g = ctx.createLinearGradient(0, y, 0, y + 110);
    g.addColorStop(0, win ? '#fff3c4' : '#ffc9c4'); g.addColorStop(1, win ? '#f2a93a' : '#d9463c');
    ctx.font = X.font(84, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(6,10,22,0.9)'; ctx.strokeText(win ? '승리!' : '패배', LW / 2, y + 86);
    ctx.fillStyle = g; ctx.fillText(win ? '승리!' : '패배', LW / 2, y + 86);
    T(ctx, C.TEAM_NAMES[G.winner] + ' 팀이 ' + C.TEAM_NAMES[1 - G.winner] + ' 팀의 코어를 파괴했습니다 · 경기 시간 ' + U.fmtTime(G.t), LW / 2, y + 120, 17, COL.text, 'center', 600);
    panel(ctx, x, y + 140, w, 530, 16, 0.96);
    drawScoreTable(ctx, G, me, x + 20, y + 156, w - 40, true);
    if (button(ctx, 'eAgain', LW / 2 - 310, y + 690, 300, 56, '같은 영웅으로 다시 하기', { primary: true, size: 19, weight: 800 })) { if (UI.on.restart) UI.on.restart(); }
    if (button(ctx, 'eMenu', LW / 2 + 10, y + 690, 300, 56, '영웅 다시 고르기', { size: 18 })) { if (UI.on.menu) UI.on.menu(); }
    ctx.globalAlpha = 1;
  }

  UI.drawHUD = function (ctx, G, me, dt) {
    const LW = UI.LW, LH = UI.LH;
    if (me.dead && !UI.ended) {
      ctx.fillStyle = 'rgba(26,30,48,0.42)'; ctx.fillRect(0, 0, LW, LH);
      TO(ctx, '부활까지 ' + Math.ceil(me.respawnT) + '초', LW / 2, 232, 30, '#ffd0c8', 'center', 900, 'rgba(6,10,20,0.9)', 5, 'middle');
      T(ctx, 'P 키로 상점을 열어 아이템을 살 수 있습니다', LW / 2, 266, 15, COL.text, 'center', 600, 'middle');
    }
    if (!W.cam.locked && !UI.ended) TO(ctx, 'Space: 내 영웅으로 카메라 복귀', LW / 2, 84, 14, '#cfe6ff', 'center', 700, 'rgba(6,10,20,0.9)', 4, 'middle');
    const gd = UI.guide;
    if (gd && !UI.ended && !me.dead && G.t < gd.until) {
      const dx = gd.x - me.x, dy = gd.y - me.y, dist = Math.hypot(dx, dy);
      if (dist < 20) gd.until = 0;
      else {
        const a = Math.atan2(dy, dx), cx = LW / 2 + Math.cos(a) * Math.min(LW * 0.3, 430), cy = LH / 2 - 50 + Math.sin(a) * Math.min(LH * 0.26, 220), bob = Math.sin(UI.clock * 6) * 6;
        ctx.save(); ctx.translate(cx + Math.cos(a) * bob, cy + Math.sin(a) * bob); ctx.rotate(a);
        X.poly(ctx, [26, 0, -10, -20, -2, 0, -10, 20]); ctx.fillStyle = COL.gold; ctx.fill(); ctx.strokeStyle = 'rgba(6,10,20,0.9)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
        TO(ctx, gd.label, cx, cy + (Math.sin(a) > 0.5 ? -34 : 44), 16, COL.gold, 'center', 800, 'rgba(6,10,20,0.9)', 4, 'middle');
      }
    }
    UI.layer = 0;
    const showHud = !(UI.ended && UI.ended.t > 2.0);
    if (showHud) { drawTop(ctx, G, me); drawFeed(ctx, dt); drawBottom(ctx, G, me); drawMinimap(ctx, G, me); drawAnnounce(ctx, dt); }
    if (UI.scoreOpen && !UI.shopOpen) { UI.layer = 1; drawScore(ctx, G, me); }
    if (UI.shopOpen) { UI.layer = 2; drawShop(ctx, G, me); }
    if (UI.paused && !UI.helpOpen) { UI.layer = 3; drawPause(ctx); }
    if (UI.helpOpen) { UI.layer = 3; drawHelp(ctx); }
    if (UI.ended) { UI.layer = 4; drawEnd(ctx, G, me, dt); }
  };
  UI.end = function (ctx) {
    drawTip(ctx);
    for (const c of UI.clicks) {
      if (c.used) continue;
      if (UI.topLayer > 0) { c.used = true; continue; }
      for (let i = 0; i < blocks.length; i += 4) if (inside(c.x, c.y, blocks[i], blocks[i + 1], blocks[i + 2], blocks[i + 3])) { c.used = true; break; }
    }
    blocks.length = 0;
  };
})();
