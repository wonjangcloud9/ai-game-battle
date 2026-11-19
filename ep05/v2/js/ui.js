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
    rects: { skill: null, learn: null, recall: null, shop: null },      // 길잡이 말풍선이 가리킬 HUD 위치
    statFlash: {}, learnT: [], buyT: {}, goldT: -9,                      // 성장 연출용 시각
    coachOn: true, coach: null, hint: null, recap: null,
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
    gsword: [['p', [[78, 4], [96, 22], [46, 72], [28, 54]]], ['l', [[16, 50], [50, 84]], 10], ['l', [[28, 72], [10, 90]], 13], ['L', [[80, 20], [42, 58]], 4]],
    glove: [['p', [[26, 46], [26, 20], [36, 16], [38, 38], [42, 12], [52, 10], [53, 36], [57, 12], [67, 13], [67, 38], [71, 24], [80, 27], [78, 60], [68, 76], [68, 92], [32, 92], [32, 76], [20, 62], [12, 46], [19, 40]]], ['L', [[34, 78], [66, 78]], 5]],
    bow: [['a', 36, 50, 42, -1.25, 1.25, 9], ['l', [[49, 10], [49, 90]], 4], ['l', [[18, 50], [82, 50]], 6], ['p', [[98, 50], [78, 39], [78, 61]]]],
    book: [['p', [[12, 18], [46, 25], [46, 88], [12, 80]]], ['p', [[54, 25], [88, 18], [88, 80], [54, 88]]], ['L', [[21, 38], [38, 42]], 4], ['L', [[21, 54], [38, 58]], 4], ['L', [[62, 42], [79, 38]], 4], ['L', [[62, 58], [79, 54]], 4]],
    prism: [['p', [[50, 12], [88, 82], [12, 82]]], ['L', [[50, 34], [50, 68]], 4], ['L', [[34, 68], [66, 68]], 4], ['l', [[2, 44], [28, 52]], 5], ['l', [[72, 50], [98, 36]], 4], ['l', [[74, 60], [98, 60]], 4]],
    crown: [['p', [[10, 80], [10, 28], [31, 52], [50, 16], [69, 52], [90, 28], [90, 80]]], ['L', [[16, 67], [84, 67]], 5], ['C', 50, 48, 6]],
    gear: [star(50, 50, 47, 34, 8, 0.3), ['C', 50, 50, 15], ['c', 50, 50, 6]],
    cup: [['p', [[20, 12], [80, 12], [72, 48], [58, 58], [58, 76], [74, 88], [26, 88], [42, 76], [42, 58], [28, 48]]], ['L', [[30, 26], [70, 26]], 4]],
    charm: [['o', 50, 22, 14, 7], ['p', [[50, 36], [78, 62], [50, 96], [22, 62]]], ['C', 50, 64, 9]],
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
    T(ctx, "처음이라면 '쉬움' 추천", gx + bw, dy + 10, 13, COL.dim, 'right', 600);
    if (button(ctx, 'start', gx, dy + 46, bw, 66, '전투 시작', { primary: true, size: 27, weight: 900, r: 12 })) { if (UI.on.start) UI.on.start(UI.sel.hero, UI.sel.diff); }
    const hy = dy + 136;
    T(ctx, '조작', gx, hy, 14, COL.gold, 'left', 800);
    T(ctx, '우클릭 이동·공격  ·  Q W E R 스킬 (누르고 있으면 조준, 떼면 발사)  ·  1 2 3 4 스킬 배우기·강화', gx + 44, hy, 14, COL.text, 'left', 500);
    T(ctx, 'B 귀환  ·  P 상점  ·  Tab 점수판  ·  A 공격 이동  ·  S 정지  ·  G 아군 집결  ·  Space 카메라  ·  Esc 일시정지', gx + 44, hy + 22, 14, COL.dim, 'left', 500);
    // 초보자 안내
    const ty = hy + 44, th = LH - ty - 28;
    if (th >= 84) {
      X.rr(ctx, gx, ty, bw, th, 12); ctx.fillStyle = 'rgba(14,20,38,0.6)'; ctx.fill(); ctx.strokeStyle = COL.line; ctx.lineWidth = 1.2; ctx.stroke();
      const tips = ['골드는 적 미니언에게 마지막 일격(막타)을 넣어야 들어옵니다. 체력 막대가 금색일 때 치세요.', '레벨이 오를 때마다 스킬을 하나 골라 찍습니다. ' + C.ULT_LEVEL + '레벨에 궁극기(R)가 열립니다.', '불리하면 아군 포탑 밑으로! B로 귀환해 본진 상점(P)에서 아이템을 사면 확실히 강해집니다.', '아군 미니언 없이 적 포탑에 들어가면 포탑이 나를 공격합니다. (게임 중 길잡이가 알려 줍니다)'];
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
      T(ctx, (ab.ult ? '궁극기 · ' + C.ULT_LEVEL + '레벨 해금 · ' : '') + '재사용 ' + AOS.abCd(ab, 1) + '초 · 마나 ' + ab.cost, px + pw - 30, y + 23, 13, COL.dim, 'right', 500);
      lines(ctx, ab.desc(dh), px + 98, y + 35, pw - 98 - 30, 14.5, '#c3cde6', 21, 500, Math.max(1, Math.floor((rowH - 44) / 21)));
    });
  };

  /* ---------- 공지 / 킬 로그 ---------- */
  UI.announce = function (text, color, sub, dur) { UI.ann.push({ text, color: color || COL.text, sub: sub || '', t: 0, dur: dur || 3.2 }); if (UI.ann.length > 4) UI.ann.shift(); };
  UI.toast = function (text, color, dur) { UI.msg = { text, color: color || '#ffd0c8', t: 0, dur: dur || Math.min(3.2, 1.3 + text.length * 0.035) }; };
  UI.reset = function () {
    UI.bdT = 0; UI.guide = null; UI.feed.length = 0; UI.ann.length = 0; UI.msg = null; UI.shopOpen = UI.scoreOpen = UI.helpOpen = UI.paused = false; UI.ended = null; UI.dragMini = false;
    UI.statFlash = {}; UI.learnT = []; UI.buyT = {}; UI.goldT = -9; UI.hint = null; UI.recap = null; UI.coach = null; UI.phaseSeen = {};
  };

  /* ---------- 길잡이: 처음 하는 사람에게 '지금 뭘 누르면 되는지'를 차례로 알려 준다 ---------- */
  const COACH = [
    { id: 'learn', key: '1 2 3', title: '스킬 배우기', text: '레벨이 오를 때마다 스킬 포인트를 1점 받습니다. 스킬 아이콘 위의 [+] 를 누르거나 숫자 키 1·2·3 으로 배울 스킬을 고르세요.' },
    { id: 'shop', key: 'P', title: '첫 아이템 사기', text: '시작 골드로 아이템 하나를 살 수 있습니다. P 키로 상점을 열고 [추천] 아이템을 클릭하세요. 상점은 본진에서만 열립니다.' },
    { id: 'move', key: '우클릭', title: '라인으로 이동', text: '땅을 우클릭하면 그곳으로 걸어갑니다. 노란 화살표를 따라 내 라인의 아군 포탑 앞까지 가세요.' },
    { id: 'lasthit', key: '우클릭', title: '막타로 골드 벌기', text: '적 미니언을 우클릭하면 공격합니다. 골드는 마지막 일격(막타)을 넣어야 들어옵니다 — 체력 막대가 금색으로 빛날 때 치세요.' },
    { id: 'skill', key: 'Q W E', title: '스킬 쓰기', text: '배운 스킬의 키를 누르고 있으면 범위가 보이고, 떼면 커서 쪽으로 나갑니다. 적 영웅과 딜 교환을 하다 불리하면 아군 포탑 밑으로 물러나세요.' },
    { id: 'recall', key: 'B', title: '귀환해서 강해지기', text: '체력이 낮거나 골드가 모이면 안전한 곳(아군 포탑 뒤)에서 B 키. 본진에서 회복하고 P로 아이템을 사면 눈에 띄게 강해집니다.' },
  ];
  UI.COACH = COACH;
  UI.coachStart = function (G, me) {
    UI.coach = { done: {}, cur: 0, doneT: -1, cast: false, recalled: false, spSince: -1, laneT: 0, hints: {}, hpWarn: false, startX: me.x, startY: me.y };
  };
  /* 상황별 한 줄 안내. cd초에 한 번, 한 판에 max번까지 */
  function hint(G, id, text, color, key, dur, cd, max) {
    const c = UI.coach; if (!c || !UI.coachOn) return false;
    const h = c.hints[id] || (c.hints[id] = { t: -999, n: 0 });
    if (h.n >= (max || 99) || G.t - h.t < (cd || 20)) return false;
    if (UI.hint && UI.hint.t < 1.2 && UI.hint.id !== id) return false;       // 방금 뜬 안내는 잠깐 지켜 준다
    h.t = G.t; h.n++;
    UI.hint = { id, text, color: color || COL.gold, key: key || '', t: 0, dur: dur || 4.5 };
    return true;
  }
  UI.hintNow = hint;
  const SRC_NAME = { tower: '적 포탑', core: '적 코어', minion: '적 미니언', fountain: '적 우물' };
  const partName = (p) => (p.k === 'hero' ? p.n : SRC_NAME[p.k] || '알 수 없음');
  const DEATH_TIP = {
    tower: '포탑은 아군 미니언이 사거리 안에 있으면 미니언부터 쏩니다. 미니언 없이 들어가거나, 포탑 안에서 적 영웅을 때리면 나를 노립니다.',
    core: '코어도 포탑처럼 공격합니다. 아군 미니언이 먼저 맞고 있을 때만 다가가세요.',
    minion: '적 미니언 무리 한가운데에 오래 서 있으면 조금씩 깎여 나갑니다. 아군 미니언 뒤에서 싸우세요.',
    hero: '체력이 절반 아래로 내려가면 아군 포탑 쪽으로 물러나세요. 포탑 밑까지 쫓아온 적은 포탑이 때려 줍니다. B 키로 귀환하면 체력을 채울 수 있습니다.',
    fountain: '적 본진 우물은 다가오는 적을 순식간에 쓰러뜨립니다.',
  };
  UI.DEATH_TIP = DEATH_TIP;
  function coachTick(G, me, dt) {
    const c = UI.coach; if (!c) return;
    // 진행 판정
    const d = c.done, f = M.bases[me.team].fountain, dF = U.dist(me.x, me.y, f.x, f.y);
    if (me.ranks[0] + me.ranks[1] + me.ranks[2] + me.ranks[3] > 0) d.learn = true;
    if (me.items.length > 0) d.shop = true;
    if (dF > 42) d.move = true;
    if (me.cs >= 3) d.lasthit = true;
    if (c.cast) d.skill = true;
    if (c.recalled) d.recall = true;
    // 지금 보여 줄 단계: 아직 안 한 것 중 첫 번째 (본진을 떠났으면 '아이템 사기'는 돌아올 때까지 미룬다)
    let cur = -1;
    for (let i = 0; i < COACH.length; i++) {
      const id = COACH[i].id;
      if (d[id]) continue;
      if (id === 'shop' && !G.canShop(me)) continue;
      if (id === 'skill' && !d.learn) continue;
      cur = i; break;
    }
    c.cur = cur;
    W.csHelp = UI.coachOn && cur >= 0 && COACH[cur].id === 'lasthit';      // 전장에서 '지금 우클릭!' 표시
    if (cur < 0 && c.doneT < 0 && COACH.every(s => d[s.id])) c.doneT = UI.clock;
    if (!UI.coachOn || me.dead || G.over) return;
    // 상황별 안내
    const hpP = me.hp / me.maxHp;
    if (me.sp > 0) { if (c.spSince < 0) c.spSince = G.t; } else c.spSince = -1;
    if (c.spSince >= 0 && G.t - c.spSince > 7 && d.learn) hint(G, 'sp', '스킬 포인트가 남아 있습니다 — 스킬 아이콘 위의 [+] 를 누르세요', COL.gold, '1~4', 4, 16, 30);
    let foe = 99, foeHero = null;
    for (const h of G.heroes) if (h.team !== me.team && !h.dead && h.seen[me.team]) { const dd = U.du(h, me); if (dd < foe) { foe = dd; foeHero = h; } }
    // 적 포탑 앞
    for (const s of G.structs) {
      if (s.team === me.team || s.dead) continue;
      const sd = U.du(me, s) - me.r;
      if (sd > s.range + 5 || sd < s.range - 1) continue;
      let tank = 0;
      for (const m of G.minions) if (m.team === me.team && !m.dead && U.du(m, s) - m.r <= s.range) tank++;
      if (tank === 0 && s.target !== me) hint(G, 'towerNear', '바로 앞이 적 포탑 사거리(점선 원)입니다 — 아군 미니언이 먼저 들어가 맞아 줄 때만 들어가세요', '#ffb04a', '', 5, 30, 4);
    }
    // 체력 낮음 / 불리한 딜 교환
    if (hpP < 0.35 && !me.atFountain && !me.recall) hint(G, 'low', '체력이 낮습니다 — 아군 포탑 뒤로 물러나 귀환하세요', '#ff8a80', 'B', 5, 22, 12);
    else if (hpP < 0.6 && foe < 10 && G.t - me.lastHeroHurt < 2.5 && foeHero && foeHero.hp / foeHero.maxHp > hpP + 0.12) {
      let own = null, od = 99;
      for (const s of G.structs) if (s.team === me.team && !s.dead) { const dd = U.du(me, s); if (dd < od) { od = dd; own = s; } }
      if (own && od > own.range && od < 34) hint(G, 'towerSafe', '불리하면 아군 포탑 밑으로! 포탑이 쫓아온 적 영웅을 공격합니다', '#9bd4ff', '', 5, 45, 3);
    }
    // 골드가 모였다
    const nb = AOS.nextBuy(me);
    if (nb && me.gold >= nb.price && nb.price >= 300 && d.shop) {
      if (G.canShop(me)) { if (!UI.shopOpen && me.atFountain) hint(G, 'shopHere', '지금 살 수 있는 아이템: ' + AOS.Items[nb.id].name + ' — 상점을 여세요', COL.gold, 'P', 4, 14, 20); }
      else if (foe > 15 && G.t - me.lastHurt > 3 && (nb.price >= 600 || hpP < 0.7)) hint(G, 'goldReady', '골드가 모였습니다 (' + Math.floor(me.gold) + ') — 귀환해서 ' + AOS.Items[nb.id].name + ' 구매', COL.gold, 'B', 5, 50, 12);
    }
    // 라인에 섰는데 막타가 안 나올 때
    if (d.move && !d.lasthit && dF > 42) {
      let near = 0; for (const m of G.minions) if (m.team !== me.team && !m.dead && U.du(m, me) < 13) near++;
      if (near > 0) c.laneT += dt;
      if (c.laneT > 22) { c.laneT = 6; hint(G, 'csHow', '체력 막대가 금색으로 변하는 순간 그 미니언을 우클릭! 내가 마지막으로 때려야 골드가 들어옵니다', COL.gold, '', 6, 20, 4); }
    }
    // 경기 흐름 안내
    const ps = UI.phaseSeen;
    if (!ps.grace && G.t >= C.GRACE_END) { ps.grace = true; UI.toast('개전 보호가 끝났습니다 — 이제부터는 쓰러지면 부활을 기다려야 합니다', '#9bd4ff'); }
  }
  UI.onEvent = function (e, G, me) {
    const c = UI.coach;
    if (e.type === 'kill') {
      UI.feed.push({ k: e.killer, v: e.victim, by: e.by, t: 0, multi: e.multi, first: e.first });
      if (UI.feed.length > 5) UI.feed.shift();
      const vt = e.victim.team, mine = me && e.killer === me, dead = me && e.victim === me;
      const multiName = ['', '', '더블 킬!', '트리플 킬!', '쿼드라 킬!', '펜타 킬!'][Math.min(5, e.multi)] || '';
      if (dead) { UI.recap = e.recap; UI.announce('처치당했습니다', COL.red, e.killer ? e.killer.name + '에게 당했습니다' : e.recap && e.recap.parts.length ? partName(e.recap.parts[0]) + '에게 당했습니다' : '', 3); }
      else if (e.first) UI.announce('선취점!', COL.gold, (e.killer ? e.killer.name : '') + ' → ' + e.victim.name, 3.4);
      else if (e.multi >= 2 && e.killer) UI.announce(multiName, e.killer.team === 0 ? COL.blue : COL.red, e.killer.name, 3);
      else if (mine) UI.announce('적 처치!', COL.gold, e.victim.name + ' 처치 · +' + e.bounty + ' 골드', 2.4);
      else if (me && vt !== me.team && e.assists.indexOf(me) >= 0) UI.announce('어시스트', '#9bd4ff', e.victim.name + ' 처치 지원 (골드 획득)', 2);
    } else if (e.type === 'rescue') {
      if (e.u === me) {
        const top = e.recap.parts[0], k = top ? top.k : 'hero';
        UI.announce('긴급 귀환!', '#9bd4ff', '개전 ' + Math.round(C.GRACE_END / 60) + '분 동안은 쓰러지는 대신 본진으로 돌아옵니다 (원인: ' + (top ? partName(top) : '?') + ')', 5);
        UI.hint = { id: 'rescue', text: DEATH_TIP[k] || DEATH_TIP.hero, color: '#9bd4ff', key: '', t: 0, dur: 9 };
      }
    } else if (e.type === 'towerDown') {
      const ours = me && e.tower.team === me.team;
      UI.announce(ours ? '아군 포탑이 파괴되었습니다' : '적 포탑을 파괴했습니다!', ours ? COL.red : COL.gold, C.LANE_NAMES[e.tower.lane] + ' ' + (e.tower.tier === 1 ? '외곽 포탑' : '내부 포탑 — 코어가 열렸습니다'), 3.4);
    } else if (e.type === 'wave') {
      if (e.n === 1) UI.announce('미니언이 출발했습니다', COL.text, '라인으로 가서 미니언과 함께 싸우세요', 3);
      else if (e.showdown > 0 && !UI.phaseSeen.showdown) { UI.phaseSeen.showdown = true; UI.announce('결전!', '#ff9d5c', '구조물이 점점 약해지고, 양 팀에 대형 미니언이 합류합니다', 4.5); }
    } else if (e.type === 'burnStart') UI.announce('최후의 불길', '#ff5247', '양 팀 코어가 무너지기 시작합니다 — 포탑을 더 많이 잃은 쪽이 먼저 쓰러집니다', 5);
    else if (e.type === 'hit') {
      if (e.src === me && e.tgt.isStruct && G.t > (UI.bdT || 0) && G.backdoor(e.tgt, me.team)) { UI.bdT = G.t + 12; UI.toast('아군 미니언이 근처에 없으면 구조물에 주는 피해가 크게 줄어듭니다', '#ffe680'); }
      else if (e.src === me && e.tgt.isHero && e.attack && c) {
        let n = 0; for (const m of G.minions) if (m.team !== me.team && !m.dead && U.du(m, me) < 9) n++;
        if (n >= 3) hint(G, 'minionAggro', '적 영웅을 때리면 근처의 적 미니언들이 나를 공격합니다 — 미니언이 적을 때 견제하세요', '#ffb04a', '', 5, 60, 2);
      }
    } else if (e.type === 'towerAggro') {
      if (e.target === me && (G.t < 600 || !c || !c.hints.towerAim || c.hints.towerAim.n < 8)) hint(G, 'towerAim', e.defend ? '포탑 안에서 적 영웅을 때려서 포탑이 나를 노립니다! 붉은 원 밖으로 나가세요' : '적 포탑이 나를 조준합니다! 붉은 원 밖으로 나가세요', '#ff5247', '', 3.5, 5, 40);
    } else if (e.type === 'levelup' && e.u === me) {
      UI.statFlash.ad = UI.statFlash.def = UI.clock;
      if (me.level === C.ULT_LEVEL) UI.announce('궁극기를 배울 수 있습니다!', COL.gold, '4 키 또는 R 아이콘 위의 [+] — ' + me.hd.abilities[3].name, 4);
      else UI.toast('레벨 ' + me.level + '! 스킬 포인트 +1 — 1·2·3·4 키로 스킬을 고르세요', COL.gold);
    } else if (e.type === 'learn' && e.u === me) {
      UI.learnT[e.slot] = G.t;
      const ab = me.hd.abilities[e.slot];
      UI.toast(ab.name + (e.rank === 1 ? ' 습득! — ' + ab.key + ' 키로 사용' : ' ' + e.rank + '단계로 강화!'), COL.gold);
    } else if (e.type === 'buy' && e.u === me) {
      UI.buyT[e.item] = G.t; pvCache.key = '';
      const b = e.before, diffs = [];
      const chk = (k, cur, name, dec) => { if (cur > b[k] + 1e-6) { UI.statFlash[k === 'maxHp' ? 'hp' : k] = UI.clock; diffs.push(name + ' +' + (cur - b[k]).toFixed(dec)); } };
      chk('ad', me.ad, '공격력', 0); chk('ap', me.ap, '주문력', 0); chk('maxHp', me.maxHp, '체력', 0); chk('def', me.def, '방어력', 0); chk('as', me.as, '공격 속도', 2); chk('ms', me.baseMs, '이동 속도', 1);
      UI.toast(AOS.Items[e.item].name + ' 구매!' + (diffs.length ? '  ' + diffs.slice(0, 3).join(' · ') : ''), '#8dffa0');
    } else if (e.type === 'gold' && e.u === me) UI.goldT = UI.clock;
    else if (e.type === 'cast' && e.u === me) { if (c) c.cast = true; }
    else if (e.type === 'recallDone' && e.u === me) { if (c && G.t > 30) c.recalled = true; }
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
      if (UI.msg.t > UI.msg.dur) UI.msg = null;
      else { ctx.globalAlpha = Math.min(1, (UI.msg.dur - UI.msg.t) * 3); TO(ctx, UI.msg.text, LW / 2, UI.LH - 262, 18, UI.msg.color, 'center', 700, 'rgba(6,10,20,0.9)', 4, 'middle'); ctx.globalAlpha = 1; }
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
    const ab = h.hd.abilities[i], rank = h.ranks[i], maxR = h.maxRank(i);
    let sub = (rank > 0 ? rank + '단계 / 최대 ' + maxR : '아직 배우지 않음') + ' · 재사용 ' + (AOS.abCd(ab, rank) * (1 - h.cdr)).toFixed(1) + '초 · 마나 ' + ab.cost;
    let body = ab.desc(h);
    if (rank === 0) body += '\n' + (h.level < h.learnLevel(i) ? h.learnLevel(i) + '레벨부터 배울 수 있습니다.' : h.sp > 0 ? '스킬 포인트로 배울 수 있습니다: ' + (i + 1) + ' 키 또는 아이콘 클릭' : '레벨이 오르면 스킬 포인트로 배울 수 있습니다.');
    else if (rank < maxR) body += '\n다음 단계는 ' + h.learnLevel(i) + '레벨부터 · ' + (i + 1) + ' 키로 강화';
    return { title: ab.name, key: KEYS[i], sub, body, color: h.hd.color };
  }
  /* [+] 버튼 위에서: 찍으면 어떻게 되는지 */
  function learnTip(h, i) {
    const ab = h.hd.abilities[i], rank = h.ranks[i];
    const cdNow = AOS.abCd(ab, Math.max(1, rank)), cdNext = AOS.abCd(ab, rank + 1);
    return {
      title: ab.name + (rank === 0 ? ' 배우기' : ' → ' + (rank + 1) + '단계'), key: String(i + 1),
      sub: '스킬 포인트 1 사용 · 남은 포인트 ' + h.sp + (rank > 0 && cdNext !== cdNow ? ' · 재사용 ' + cdNow + ' → ' + cdNext + '초' : ''),
      body: (rank > 0 ? '강화하면: ' : '') + AOS.descAt(h, i, rank + 1), color: UI.COL.gold,
    };
  }
  function itemTip(h, id, why, G) {
    const it = AOS.Items[id], pr = h ? AOS.itemPrice(h, id) : { cost: it.cost, use: null };
    let body = it.desc;
    if (it.pas) body += '\n[' + it.pname + '] ' + it.ptext;
    if (it.from) body += '\n재료: ' + AOS.Items[it.from].name + (pr.use && why !== 'owned' ? ' (보유 중 → ' + pr.cost + ' 골드에 조합)' : '');
    const ups = upgradesOf(id); if (ups.length) body += '\n다음 단계: ' + ups.map(n => AOS.Items[n].name).join(' / ');
    if (h && why !== 'owned') {
      const pv = previewBuy(h, id); if (pv.length) body += '\n구매 시  ' + pv.join(' · ');
      body += '\n' + (!why ? '클릭하여 구매' : why === 'gold' ? (pr.cost - Math.floor(h.gold)) + ' 골드가 부족합니다.' : BUY_WHY[why]);
    }
    return { title: it.name, sub: it.tierName + ' 아이템 · ' + it.cost + ' 골드', body, color: it.color, w: 380 };
  }

  function drawTip(ctx) {
    const tp = UI.tip; if (!tp) return;
    const w = tp.w || 340, pad = 14;
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
    return why === 'cd' ? 1 : why === 'mana' ? 2 : why === 'level' ? 3 : why === 'dead' ? 4 : why === 'unlearned' ? 5 : 0;
  }
  /* 능력치 패널: 아이템을 사거나 레벨이 오르면 바뀐 수치가 초록색으로 번쩍인다 */
  const STAT_ROWS = [['ad', '공격력', 0], ['ap', '주문력', 0], ['def', '방어력', 0], ['as', '공격 속도', 2], ['ms', '이동 속도', 1], ['cdr', '재사용 감소', -1]];
  function drawStats(ctx, G, me, x, y) {
    const w = 158, h = 134;
    panel(ctx, x, y, w, h, 12, 0.9); UI.block(x, y, w, h);
    STAT_ROWS.forEach((r, i) => {
      const val = me[r[0]], t = UI.clock - (UI.statFlash[r[0]] || -9), hot = t < 3;
      const ry = y + 15 + i * 20.5;
      if (hot) { X.rr(ctx, x + 6, ry - 10, w - 12, 19, 5); ctx.fillStyle = X.rgba('#62dd62', 0.22 * Math.min(1, (3 - t) * 1.2)); ctx.fill(); }
      T(ctx, r[1], x + 14, ry + 1, 13, COL.dim, 'left', 600, 'middle');
      T(ctx, r[2] < 0 ? Math.round(val * 100) + '%' : val.toFixed(r[2]), x + w - 14, ry + 1, 15, hot ? '#8dffa0' : COL.text, 'right', 800, 'middle');
    });
    const r = UI.hit('hudStats', x, y, w, h);
    if (r.hover) UI.tip = { title: '능력치', sub: '아이템과 레벨로 강해집니다', body: '공격력: 기본 공격(과 일부 스킬)의 피해\n주문력: 마법 스킬의 피해·회복량\n방어력 ' + Math.round(me.def) + ' → 받는 피해 ' + Math.round(100 - 10000 / (100 + me.def)) + '% 감소\n생명력 흡수 ' + Math.round(me.lifesteal * 100) + '% · 사거리 ' + me.range, color: me.hd.color };
  }
  function drawBottom(ctx, G, me) {
    const LW = UI.LW, LH = UI.LH, w = 800, h = 134, x = LW / 2 - w / 2 - 60, y = LH - h - 10;
    if (x - 166 >= 4) drawStats(ctx, G, me, x - 164, y);
    panel(ctx, x, y, w, h, 14, 0.92); UI.block(x, y, w, h);
    // 초상화 + 레벨 + 경험치
    drawPortrait(ctx, me.heroId, me.team, x + 14, y + 14, 92, false, me.dead ? '#59607a' : COL.gold);
    if (me.dead) { X.rr(ctx, x + 14, y + 14, 92, 92, 13); ctx.fillStyle = 'rgba(8,12,24,0.7)'; ctx.fill(); T(ctx, String(Math.ceil(me.respawnT)), x + 60, y + 62, 40, '#ffb0a8', 'center', 900, 'middle'); }
    X.circle(ctx, x + 100, y + 100, 17); ctx.fillStyle = COL.bg0; ctx.fill(); ctx.strokeStyle = COL.gold; ctx.lineWidth = 2; ctx.stroke();
    T(ctx, String(me.level), x + 100, y + 101, 17, COL.gold, 'center', 900, 'middle');
    bar(ctx, x + 14, y + 112, 76, 8, me.level >= C.MAX_LEVEL ? 1 : me.xp / me.xpNeed(), '#b98cff');
    const pr = UI.hit('hudPortrait', x + 14, y + 14, 92, 106);
    if (pr.hover) UI.tip = { title: me.name + ' · ' + me.hd.title, sub: me.hd.roleName + ' · 레벨 ' + me.level + (me.level < C.MAX_LEVEL ? ' · 다음 레벨까지 경험치 ' + Math.ceil(me.xpNeed() - me.xp) : ' (최고 레벨)'), body: '경험치는 적 미니언·영웅이 근처에서 쓰러지면 받습니다.\n레벨이 오를 때마다 스킬 포인트 1점을 받아 원하는 스킬을 직접 찍습니다. 궁극기(R)는 ' + C.ULT_LEVELS.join('·') + '레벨에 찍을 수 있습니다.', color: me.hd.color };
    // 스킬
    const ax = x + 128, ay = y + 12, as = 64;
    const rec = me.sp > 0 ? AOS.nextSkill(me) : -1;
    UI.rects.skill = { x: ax, y: ay, w: 4 * (as + 9) - 9, h: as }; UI.rects.learnRec = null;
    for (let i = 0; i < 4; i++) {
      const ab = me.hd.abilities[i], bx = ax + i * (as + 9), st = slotState(me, i), r = UI.hit('ab' + i, bx, ay, as, as);
      const rank = me.ranks[i], maxR = me.maxRank(i), learnable = me.canLearn(i);
      iconTile(ctx, ab.icon, bx, ay, as, me.hd.color, st !== 0);
      if (st === 1) {
        const total = AOS.abCd(ab, rank) * (1 - me.cdr), f = U.clamp(me.cds[i] / total, 0, 1);
        ctx.save(); X.rr(ctx, bx, ay, as, as, as * 0.16); ctx.clip();
        ctx.beginPath(); ctx.moveTo(bx + as / 2, ay + as / 2); ctx.arc(bx + as / 2, ay + as / 2, as, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.closePath(); ctx.fillStyle = 'rgba(6,10,20,0.78)'; ctx.fill(); ctx.restore();
        TO(ctx, me.cds[i] >= 10 ? String(Math.ceil(me.cds[i])) : me.cds[i].toFixed(1), bx + as / 2, ay + as / 2 + 1, 23, '#ffffff', 'center', 900, 'rgba(6,10,20,0.9)', 4, 'middle');
      } else if (st === 2) { X.rr(ctx, bx, ay, as, as, as * 0.16); ctx.fillStyle = 'rgba(20,40,120,0.55)'; ctx.fill(); }
      else if (st === 3) { X.rr(ctx, bx, ay, as, as, as * 0.16); ctx.fillStyle = 'rgba(6,10,20,0.72)'; ctx.fill(); UI.glyph(ctx, 'lock', bx + 20, ay + 14, 24, '#aab3cc'); T(ctx, 'Lv ' + C.ULT_LEVEL, bx + as / 2, ay + 51, 12, '#aab3cc', 'center', 700, 'middle'); }
      else if (st === 5) { X.rr(ctx, bx, ay, as, as, as * 0.16); ctx.fillStyle = 'rgba(6,10,20,0.66)'; ctx.fill(); T(ctx, learnable ? '배우기' : '미습득', bx + as / 2, ay + as / 2 + 6, 13, learnable ? COL.gold : '#aab3cc', 'center', 800, 'middle'); }
      else if (st === 4) { X.rr(ctx, bx, ay, as, as, as * 0.16); ctx.fillStyle = 'rgba(6,10,20,0.6)'; ctx.fill(); }
      if (G.t - (UI.learnT[i] || -9) < 0.9) { const q = (G.t - UI.learnT[i]) / 0.9; X.rr(ctx, bx - 3 - q * 6, ay - 3 - q * 6, as + 6 + q * 12, as + 6 + q * 12, 12 + q * 4); ctx.strokeStyle = X.rgba(COL.gold, 1 - q); ctx.lineWidth = 3; ctx.stroke(); }
      if (UI.keyAim === i || r.hover) { X.rr(ctx, bx - 1, ay - 1, as + 2, as + 2, 11); ctx.strokeStyle = UI.keyAim === i ? '#ffffff' : COL.gold; ctx.lineWidth = 2.5; ctx.stroke(); }
      X.rr(ctx, bx + 3, ay + 3, 20, 19, 5); ctx.fillStyle = 'rgba(6,10,20,0.85)'; ctx.fill();
      T(ctx, KEYS[i], bx + 13, ay + 13, 13, st === 0 ? COL.gold : COL.dim, 'center', 800, 'middle');
      if (st !== 3 && st !== 5) T(ctx, String(ab.cost), bx + as - 5, ay + as - 7, 11, st === 2 ? '#ff9a8f' : '#9cc6ff', 'right', 700);
      // 단계 표시 (채워진 칸 = 찍은 단계)
      for (let k = 0; k < maxR; k++) { X.rr(ctx, bx + as / 2 - (maxR * 10 - 3) / 2 + k * 10, ay + as + 3, 7, 5, 2); ctx.fillStyle = k < rank ? COL.gold : '#2a3558'; ctx.fill(); }
      if (r.hover) { UI.tip = abilityTip(me, i); UI.cursor = 'pointer'; }
      if (r.click && UI.on.castSlot) UI.on.castSlot(i);
      // 스킬 포인트가 있으면 아이콘 위에 [+] 버튼
      if (me.sp > 0 && learnable) {
        const py = y - 36, pw = as - 8, pxx = bx + 4, q = 0.5 + 0.5 * Math.sin(UI.clock * 6 + i * 0.6);
        const lr = UI.hit('learn' + i, pxx, py, pw, 32); UI.block(pxx, py, pw, 36);
        X.rr(ctx, pxx, py, pw, 32, 9);
        const lg = ctx.createLinearGradient(0, py, 0, py + 32); lg.addColorStop(0, lr.hover ? '#ffe28a' : '#f6c85a'); lg.addColorStop(1, lr.hover ? '#eeb040' : '#d99a2b');
        ctx.fillStyle = lg; ctx.fill(); ctx.strokeStyle = X.rgba('#fff6d0', 0.55 + q * 0.45); ctx.lineWidth = 2 + q * 1.5; ctx.stroke();
        T(ctx, '+', pxx + 16, py + 17, 24, '#2a1c05', 'center', 900, 'middle');
        X.rr(ctx, pxx + pw - 25, py + 6, 20, 20, 5); ctx.fillStyle = 'rgba(42,28,5,0.85)'; ctx.fill();
        T(ctx, String(i + 1), pxx + pw - 15, py + 17, 13, '#ffe9a8', 'center', 800, 'middle');
        X.poly(ctx, [bx + as / 2 - 7, py + 32, bx + as / 2 + 7, py + 32, bx + as / 2, py + 39]); ctx.fillStyle = '#d99a2b'; ctx.fill();
        if (i === rec) { UI.rects.learnRec = { x: pxx, y: py - 22, w: pw, h: 56 }; X.rr(ctx, pxx + pw / 2 - 20, py - 19, 40, 17, 6); ctx.fillStyle = 'rgba(8,12,24,0.92)'; ctx.fill(); ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.2; ctx.stroke(); T(ctx, '추천', pxx + pw / 2, py - 10, 11, COL.gold, 'center', 800, 'middle'); }
        if (lr.hover) { UI.cursor = 'pointer'; UI.tip = learnTip(me, i); }
        if (lr.click && UI.on.learn) UI.on.learn(i);
      }
    }
    if (me.sp > 0) {
      const q = 0.5 + 0.5 * Math.sin(UI.clock * 6);
      X.rr(ctx, x + 8, y - 36, 110, 32, 9); ctx.fillStyle = 'rgba(8,12,24,0.92)'; ctx.fill(); ctx.strokeStyle = X.rgba(COL.gold, 0.5 + q * 0.5); ctx.lineWidth = 2; ctx.stroke();
      UI.block(x + 8, y - 36, 110, 32);
      T(ctx, '스킬 포인트 ' + me.sp, x + 63, y - 19, 14, COL.gold, 'center', 800, 'middle');
      UI.rects.learn = { x: ax, y: y - 36, w: 4 * (as + 9) - 9, h: 32 };
    } else UI.rects.learn = null;
    // 귀환 버튼
    const rx = ax + 4 * (as + 9) + 4, rr0 = UI.hit('recall', rx, ay + 6, 52, 52);
    UI.rects.recall = { x: rx, y: ay + 6, w: 52, h: 52 };
    X.rr(ctx, rx, ay + 6, 52, 52, 10); ctx.fillStyle = rr0.hover ? '#2c3a66' : '#1a2340'; ctx.fill(); ctx.strokeStyle = me.recall ? '#9bd4ff' : COL.line; ctx.lineWidth = me.recall ? 2.5 : 1.5; ctx.stroke();
    UI.glyph(ctx, 'recall', rx + 12, ay + 14, 28, '#9bd4ff'); T(ctx, 'B', rx + 44, ay + 52, 11, COL.gold, 'right', 800);
    if (rr0.hover) { UI.tip = { title: '귀환', key: 'B', sub: C.RECALL_TIME + '초 집중', body: '본진 우물로 돌아갑니다. 피해를 입거나 움직이면 취소됩니다. 우물에서는 체력과 마나가 빠르게 회복되고 상점을 이용할 수 있습니다.', color: '#7fc8ff' }; UI.cursor = 'pointer'; }
    if (rr0.click && UI.on.recall) UI.on.recall();
    // 체력 / 마나
    const bx = x + 128, bw = 352;
    bar(ctx, bx, y + 88, bw, 20, me.hp / me.maxHp, me.dead ? '#59607a' : COL.green);
    if (me.shield > 0) { ctx.fillStyle = 'rgba(238,246,255,0.85)'; ctx.fillRect(bx + bw * U.clamp(me.hp / me.maxHp, 0, 1) - Math.min(bw * 0.3, bw * me.shield / me.maxHp), y + 88, Math.min(bw * 0.3, bw * me.shield / me.maxHp), 5); }
    TO(ctx, Math.ceil(me.hp) + ' / ' + Math.round(me.maxHp) + (me.shield > 0 ? '  (+' + Math.round(me.shield) + ')' : ''), bx + bw / 2, y + 98.5, 14, '#ffffff', 'center', 800, 'rgba(6,10,20,0.85)', 3, 'middle');
    bar(ctx, bx, y + 111, bw, 13, me.mp / Math.max(1, me.maxMp), COL.mana);
    TO(ctx, Math.floor(me.mp) + ' / ' + Math.round(me.maxMp), bx + bw / 2, y + 118, 11, '#ffffff', 'center', 700, 'rgba(6,10,20,0.85)', 3, 'middle');
    // 아이템
    const ix = x + 498, iy = y + 14, is = 48;
    for (let i = 0; i < 6; i++) {
      const sx = ix + (i % 3) * (is + 6), sy = iy + Math.floor(i / 3) * (is + 6), id = me.items[i];
      if (id) {
        const it = AOS.Items[id]; iconTile(ctx, it.icon, sx, sy, is, it.color);
        for (let k = 0; k < it.tier; k++) { X.circle(ctx, sx + 7 + k * 7, sy + is - 6, 2.4); ctx.fillStyle = '#fff3c4'; ctx.fill(); }
        if (G.t - (UI.buyT[id] || -9) < 1.2) { const q = (G.t - UI.buyT[id]) / 1.2; X.rr(ctx, sx - 2 - q * 5, sy - 2 - q * 5, is + 4 + q * 10, is + 4 + q * 10, 9); ctx.strokeStyle = X.rgba('#8dffa0', 1 - q); ctx.lineWidth = 3; ctx.stroke(); }
        const r = UI.hit('inv' + i, sx, sy, is, is); if (r.hover) UI.tip = itemTip(me, id, 'owned', G);
      } else { X.rr(ctx, sx, sy, is, is, 8); ctx.fillStyle = 'rgba(6,10,20,0.6)'; ctx.fill(); ctx.strokeStyle = '#263256'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    // 골드 + 상점
    const gx = x + 670;
    UI.glyph(ctx, 'coin', gx, y + 16, 24, COL.gold, '#a9781c');
    const gpop = Math.max(0, 1 - (UI.clock - UI.goldT) / 0.35);
    T(ctx, U.fmtNum(Math.floor(me.gold)), gx + 30, y + 29, 22 + gpop * 5, gpop > 0 ? '#fff3c4' : COL.gold, 'left', 900, 'middle');
    const can = G.canShop(me), nb = AOS.nextBuy(me), afford = !!nb && me.gold >= nb.price;
    UI.rects.shop = { x: gx, y: y + 50, w: 116, h: 38 };
    if (button(ctx, 'shopBtn', gx, y + 50, 116, 38, '상점 (P)', { size: 15, active: can && afford, color: '#8a6a1c', textColor: can && afford ? '#fff0b8' : COL.text, tip: { title: '상점', key: 'P', body: '본진(우물 근처)에서만 살 수 있습니다. 라인에 있을 때는 B 키로 귀환한 뒤 여세요.' + (nb ? '\n다음 추천: ' + AOS.Items[nb.id].name + ' (' + nb.price + ' 골드)' : ''), color: COL.gold } })) UI.shopOpen = !UI.shopOpen;
    T(ctx, me.kills + ' / ' + me.deaths + ' / ' + me.assists, gx + 58, y + 104, 15, COL.text, 'center', 800, 'middle');
    if (!can && afford) T(ctx, 'B 귀환 후 구매 가능', gx + 58, y + 121, 11, COL.gold, 'center', 700, 'middle');
    else T(ctx, 'K / D / A  ·  막타 ' + me.cs, gx + 58, y + 121, 11, COL.dim, 'center', 600, 'middle');
    if (can && afford && !UI.shopOpen) { const q = 0.5 + Math.sin(UI.clock * 6) * 0.5; X.rr(ctx, gx - 2, y + 48, 120, 42, 10); ctx.strokeStyle = X.rgba(COL.gold, 0.4 + q * 0.6); ctx.lineWidth = 2.5; ctx.stroke(); }
    // 귀환 진행 막대
    if (me.recall) { const f = me.recall.t / C.RECALL_TIME; panel(ctx, LW / 2 - 170, y - 96, 340, 36, 10, 0.9); bar(ctx, LW / 2 - 158, y - 72, 316, 7, f, '#7fc8ff'); T(ctx, '귀환 중… ' + (C.RECALL_TIME - me.recall.t).toFixed(1) + '초  (움직이면 취소)', LW / 2, y - 82, 13, '#cfe6ff', 'center', 700, 'middle'); }
    else if (me.cast && me.cast.dur >= 0.5) { const f = me.cast.t / me.cast.dur; panel(ctx, LW / 2 - 130, y - 86, 260, 26, 9, 0.9); bar(ctx, LW / 2 - 120, y - 77, 240, 8, f, me.hd.color); }
  }
  function nextRec(h) { const nb = AOS.nextBuy(h); return nb ? nb.id : null; }
  UI.nextRec = nextRec;

  /* ---------- 상점: 분류별 조합 트리 ---------- */
  const BUY_WHY = { owned: '이미 보유한 아이템입니다', boots: '장화는 한 켤레만 신을 수 있습니다', full: '아이템 칸이 가득 찼습니다 (내 아이템을 우클릭하면 되팔 수 있습니다)', gold: '골드가 부족합니다', shop: '상점은 본진에서만 이용할 수 있습니다 (B 키로 귀환)', none: '살 수 없는 아이템입니다' };
  UI.BUY_WHY = BUY_WHY;
  const PV = [['ad', '공격력', 0], ['ap', '주문력', 0], ['maxHp', '체력', 0], ['def', '방어력', 0], ['as', '공격 속도', 2], ['baseMs', '이동 속도', 1], ['maxMp', '마나', 0]];
  const pvCache = { key: '', val: null };
  /* 이 아이템을 사면 능력치가 어떻게 바뀌는지 (잠깐 입혀 보고 되돌린다) */
  function previewBuy(h, id) {
    const key = id + '|' + h.items.join(',') + '|' + h.level + '|' + h.id;
    if (pvCache.key === key) return pvCache.val;
    const pr = AOS.itemPrice(h, id), items0 = h.items, hp0 = h.hp, mp0 = h.mp;
    const before = PV.map(p => h[p[0]]);
    const items = items0.slice(); if (pr.use) items[items.indexOf(pr.use)] = id; else items.push(id);
    h.items = items; h.recalc();
    const after = PV.map(p => h[p[0]]);
    h.items = items0; h.recalc(); h.hp = hp0; h.mp = mp0;
    const out = [];
    PV.forEach((p, i) => { if (Math.abs(after[i] - before[i]) > 0.004) out.push(p[1] + ' ' + before[i].toFixed(p[2]) + ' → ' + after[i].toFixed(p[2])); });
    pvCache.key = key; pvCache.val = out;
    return out;
  }
  const upgradesOf = (id) => AOS.ItemOrder.filter(k => AOS.Items[k].from === id);
  function shopChip(ctx, G, me, id, x, y, w, hh, nb) {
    const it = AOS.Items[id], why = G.buyWhy(me, id), pr = AOS.itemPrice(me, id), owned = why === 'owned';
    const ok = !why, r = UI.hit('shop' + id, x, y, w, hh);
    UI.rects['item_' + id] = { x, y, w, h: hh };
    const isRec = !!nb && nb.id === id, isGoal = !!nb && nb.goal === id && nb.id !== id;
    const reach = owned || ok || why === 'shop';             // 골드·칸은 충분한가
    X.rr(ctx, x, y, w, hh, 9);
    ctx.fillStyle = owned ? '#16301f' : reach ? (r.hover ? '#34447a' : '#243260') : '#151c34'; ctx.fill();
    ctx.strokeStyle = owned ? '#3fae5f' : isRec ? COL.gold : reach ? (r.hover ? '#a9bdf5' : '#51639c') : '#2a365c'; ctx.lineWidth = isRec ? 2.6 : 1.5; ctx.stroke();
    if (isRec && ok) { const q = 0.5 + 0.5 * Math.sin(UI.clock * 6); X.rr(ctx, x - 3, y - 3, w + 6, hh + 6, 11); ctx.strokeStyle = X.rgba(COL.gold, 0.25 + q * 0.5); ctx.lineWidth = 2; ctx.stroke(); }
    iconTile(ctx, it.icon, x + 5, y + 5, hh - 10, it.color, !reach);
    T(ctx, it.name, x + hh + 3, y + 19, 13.5, owned ? '#8de28f' : reach ? COL.text : '#8490b2', 'left', 700);
    if (owned) T(ctx, '보유 중', x + hh + 3, y + 37, 12, '#8de28f', 'left', 700);
    else {
      const affordable = me.gold >= pr.cost;
      UI.glyph(ctx, 'coin', x + hh + 3, y + 27, 13, affordable ? COL.gold : '#7a6a48', '#6a5a30');
      T(ctx, String(pr.cost), x + hh + 20, y + 38, 13.5, affordable ? COL.gold : '#b0747a', 'left', 800);
      if (pr.use) T(ctx, '조합', x + hh + 58, y + 38, 11, '#8de28f', 'left', 700);
    }
    if (isRec || isGoal) { X.rr(ctx, x + w - 36, y - 7, 34, 16, 6); ctx.fillStyle = isRec ? COL.gold : '#1d2847'; ctx.fill(); if (!isRec) { ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.2; ctx.stroke(); } T(ctx, isRec ? '추천' : '목표', x + w - 19, y + 1.5, 10.5, isRec ? '#2a1c05' : COL.gold, 'center', 800, 'middle'); }
    if (r.hover) { UI.tip = itemTip(me, id, why, G); if (ok) UI.cursor = 'pointer'; }
    if (r.click) { if (ok) { if (UI.on.buy) UI.on.buy(id); } else if (UI.on.deny) UI.on.deny(why === 'gold' ? (pr.cost - Math.floor(me.gold)) + ' 골드가 부족합니다' : BUY_WHY[why]); }
  }
  function drawShop(ctx, G, me) {
    const LW = UI.LW, LH = UI.LH, w = 1070, h = 606, x = LW / 2 - w / 2, y = Math.max(62, Math.min(LH - h - 152, LH / 2 - h / 2 - 50));
    ctx.fillStyle = 'rgba(4,8,18,0.45)'; ctx.fillRect(0, 0, LW, LH);
    panel(ctx, x, y, w, h, 16, 0.97); UI.block(0, 0, LW, LH);
    const can = G.canShop(me), nb = AOS.nextBuy(me);
    T(ctx, '상점', x + 26, y + 42, 28, COL.text, 'left', 900);
    UI.glyph(ctx, 'coin', x + 104, y + 21, 24, COL.gold, '#a9781c'); T(ctx, U.fmtNum(Math.floor(me.gold)), x + 134, y + 42, 24, COL.gold, 'left', 900);
    T(ctx, can ? '아이템을 클릭하면 바로 삽니다 · 재료를 갖고 있으면 그 값만큼 싸게 조합됩니다' : '상점은 본진에서만 이용할 수 있습니다 — 지금은 구경만 가능 (B 키로 귀환)', x + w - 66, y + 40, 14, can ? COL.dim : '#ffb0a8', 'right', 600);
    if (button(ctx, 'shopClose', x + w - 52, y + 14, 36, 36, '×', { size: 24 })) UI.shopOpen = false;
    // 단계 머리말
    const tx = x + 104, cw = 178, chh = 46, colStep = 190, subH = 52;
    ['기초', '중급', '완성 (고유 효과)'].forEach((s, i) => T(ctx, s, tx + i * colStep + 4, y + 70, 12, COL.dim, 'left', 700));
    let ry = y + 78;
    for (const row of AOS.ShopRows) {
      const n = row.branches.length, rh = n * subH;
      X.rr(ctx, x + 14, ry, 862, rh - 4, 8); ctx.fillStyle = 'rgba(255,255,255,0.028)'; ctx.fill();
      T(ctx, row.name, x + 26, ry + rh / 2 - 1, 14, '#c3cde6', 'left', 800, 'middle');
      const y1 = ry + (rh - 4) / 2 - chh / 2;
      // 연결선
      ctx.strokeStyle = '#3d4d80'; ctx.lineWidth = 2; ctx.beginPath();
      for (let b = 0; b < n; b++) {
        const by = ry + b * subH + 1 + chh / 2, br = row.branches[b];
        ctx.moveTo(tx + cw, y1 + chh / 2); ctx.lineTo(tx + cw + 6, y1 + chh / 2); ctx.lineTo(tx + cw + 6, by); ctx.lineTo(tx + colStep, by);
        if (br.length > 1) { ctx.moveTo(tx + colStep + cw, by); ctx.lineTo(tx + 2 * colStep, by); }
        if (br.length > 2) { ctx.moveTo(tx + 2 * colStep + cw, by); ctx.lineTo(tx + 3 * colStep, by); }
      }
      ctx.stroke();
      shopChip(ctx, G, me, row.root, tx, y1, cw, chh, nb);
      for (let b = 0; b < n; b++) {
        const br = row.branches[b], by = ry + b * subH + 1;
        for (let k = 0; k < br.length; k++) shopChip(ctx, G, me, br[k], tx + (k + 1) * colStep, by, cw, chh, nb);
        if (br.length > 2) { X.rr(ctx, tx + 2 * colStep + cw - 1, by + chh / 2 - 9, 14, 18, 5); ctx.fillStyle = '#1d2847'; ctx.fill(); T(ctx, '/', tx + 2 * colStep + cw + 6, by + chh / 2 + 1, 12, COL.dim, 'center', 800, 'middle'); }
      }
      ry += rh + 6;
    }
    // 오른쪽: 내 아이템
    const sx0 = x + 892, sw = 160;
    X.rr(ctx, sx0 - 6, y + 62, sw + 12, h - 76, 10); ctx.fillStyle = 'rgba(8,12,24,0.5)'; ctx.fill(); ctx.strokeStyle = COL.line; ctx.lineWidth = 1.2; ctx.stroke();
    T(ctx, '내 아이템 ' + me.items.length + ' / 6', sx0 + 4, y + 86, 14, '#c3cde6', 'left', 800);
    for (let i = 0; i < 6; i++) {
      const sx = sx0 + 12 + (i % 2) * 70, sy = y + 98 + Math.floor(i / 2) * 70, id = me.items[i];
      if (id) {
        const it = AOS.Items[id]; iconTile(ctx, it.icon, sx, sy, 62, it.color);
        for (let k = 0; k < it.tier; k++) { X.circle(ctx, sx + 9 + k * 8, sy + 54, 2.8); ctx.fillStyle = '#fff3c4'; ctx.fill(); }
        const r = UI.hit('sell' + i, sx, sy, 62, 62);
        if (r.hover) { UI.tip = itemTip(me, id, 'owned', G); if (can) UI.tip.body += '\n우클릭: 되팔기 (+' + Math.round(it.cost * 0.6) + ' 골드)'; }
        if (r.rclick) { if (can) { if (UI.on.sell) UI.on.sell(i); } else if (UI.on.deny) UI.on.deny(BUY_WHY.shop); }
      } else { X.rr(ctx, sx, sy, 62, 62, 9); ctx.fillStyle = 'rgba(6,10,20,0.6)'; ctx.fill(); ctx.strokeStyle = '#263256'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    T(ctx, '우클릭: 되팔기 (60%)', sx0 + sw / 2, y + 326, 12, COL.dim, 'center', 500);
    // 다음 추천
    const ny = y + 344;
    T(ctx, '다음 추천', sx0 + 4, ny + 12, 13, COL.gold, 'left', 800);
    if (nb) {
      const it = AOS.Items[nb.id], goal = AOS.Items[nb.goal];
      iconTile(ctx, it.icon, sx0 + 4, ny + 22, 44, it.color);
      const nl = X.wrap(ctx, it.name, sw - 58, 13.5, 700);
      for (let k = 0; k < Math.min(2, nl.length); k++) T(ctx, nl[k], sx0 + 56, ny + 38 + k * 16, 13.5, COL.text, 'left', 700);
      T(ctx, nb.price + ' 골드', sx0 + 56, ny + 38 + Math.min(2, nl.length) * 16 + 1, 13, me.gold >= nb.price ? COL.gold : '#b0747a', 'left', 800);
      if (nb.goal !== nb.id) T(ctx, '→ 목표: ' + goal.name, sx0 + 4, ny + 86, 12, COL.dim, 'left', 600);
      const left = nb.price - Math.floor(me.gold);
      T(ctx, left > 0 ? left + ' 골드 더 모으면 구매' : can ? '지금 살 수 있습니다!' : '귀환하면 살 수 있습니다', sx0 + 4, ny + 104, 12, left > 0 ? COL.dim : '#8de28f', 'left', 700);
    } else T(ctx, '추천 빌드를 모두 갖췄습니다', sx0 + 4, ny + 38, 12, COL.dim, 'left', 600);
    if (button(ctx, 'autoBuy', sx0, y + h - 132, sw, 40, '자동 구매: ' + (UI.autoBuy ? '켜짐' : '꺼짐'), { size: 14, active: UI.autoBuy, color: '#2e8a55', tip: { title: '추천 아이템 자동 구매', body: '켜 두면 본진에 있거나 부활을 기다리는 동안 추천 순서대로 아이템을 자동으로 삽니다.', color: '#8de28f' } })) { UI.autoBuy = !UI.autoBuy; if (UI.on.prefs) UI.on.prefs(); }
    T(ctx, 'P 또는 Esc: 닫기', sx0 + sw / 2, y + h - 68, 12, COL.dim, 'center', 500);
    T(ctx, '점 개수 = 단계', sx0 + sw / 2, y + h - 48, 12, COL.dim, 'center', 500);
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
      ['레벨', 'K / D / A', '막타', '골드', extra ? '영웅 피해' : '상태', '아이템'].forEach((s, i) => T(ctx, s, hx + cols[i + 1], ty + 16, 12, COL.dim, 'left', 600, 'middle'));
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
    ['우클릭 / 좌클릭', '땅: 이동 · 적: 공격 (누른 채 끌면 계속 이동)'], ['Q W E R', '스킬 — 누르고 있으면 조준 표시, 떼면 커서 방향으로 발사'],
    ['1 2 3 4', '스킬 포인트로 Q·W·E·R 배우기/강화 (아이콘 위의 + 클릭도 가능)'], ['A', '커서 위치로 공격 이동 (가는 길의 적을 공격)'],
    ['S', '정지 — 다음 명령까지 자동 공격도 멈춤 (막타 타이밍을 잴 때)'], ['B', '귀환 (본진 우물로 순간이동, ' + C.RECALL_TIME + '초)'], ['P', '상점 (본진에서만 구매 · 부활 대기 중에도 가능)'], ['G', '집결 신호 — 아군 봇들이 커서 위치로 모입니다'],
    ['Tab', '점수판 (누르고 있는 동안)'], ['Space', '카메라를 내 영웅에 고정'], ['Y / 미니맵 클릭', '카메라 자유 이동 (화면 가장자리·방향키로 이동)'], ['마우스 휠', '확대 / 축소'], ['M', '소리 켜기 / 끄기'], ['Esc', '일시정지'],
  ];
  function drawHelpBody(ctx, x, y, w) {
    HELP.forEach((r, i) => {
      const ry = y + i * 29;
      X.rr(ctx, x, ry, 168, 23, 6); ctx.fillStyle = '#222d50'; ctx.fill(); ctx.strokeStyle = COL.line; ctx.lineWidth = 1.2; ctx.stroke();
      T(ctx, r[0], x + 84, ry + 12.5, 13, COL.gold, 'center', 800, 'middle');
      T(ctx, r[1], x + 182, ry + 12.5, 14, COL.text, 'left', 500, 'middle');
    });
    return HELP.length * 29;
  }
  function drawHelp(ctx) {
    const LW = UI.LW, LH = UI.LH, w = 800, h = 716, x = LW / 2 - w / 2, y = Math.max(20, LH / 2 - h / 2 - 20);
    ctx.fillStyle = 'rgba(4,8,18,0.6)'; ctx.fillRect(0, 0, LW, LH); UI.block(0, 0, LW, LH);
    panel(ctx, x, y, w, h, 16, 0.98);
    T(ctx, '조작법', x + 28, y + 44, 26, COL.text, 'left', 900);
    T(ctx, '목표: 미니언과 함께 라인을 밀어 포탑을 부수고, 적 본진의 코어를 파괴하면 승리합니다.', x + 28, y + 72, 14, COL.dim, 'left', 500);
    const bh = drawHelpBody(ctx, x + 28, y + 90, w - 56);
    let ry = y + 90 + bh + 6;
    const rules = ['골드는 미니언 막타, 영웅 처치·지원, 포탑 파괴로만 법니다. 시간이 지난다고 저절로 들어오지 않습니다.', '포탑은 사거리 안의 아군 미니언 → 적 영웅 순으로 쏘고, 그 안에서 아군 영웅을 때린 적을 가장 먼저 노립니다.', '개전 ' + Math.round(C.GRACE_END / 60) + '분 동안은 쓰러지지 않고(긴급 귀환), ' + Math.round(C.SHOWDOWN / 60) + '분부터 결전, ' + Math.round(C.BURN_START / 60) + '분부터는 양 팀 코어가 무너지기 시작합니다.'];
    for (const s of rules) { X.circle(ctx, x + 36, ry + 9, 3); ctx.fillStyle = COL.gold; ctx.fill(); ry += lines(ctx, s, x + 48, ry, w - 84, 13.5, '#c3cde6', 19, 500, 2) + 5; }
    if (button(ctx, 'helpClose', x + w / 2 - 90, y + h - 52, 180, 40, '닫기', { size: 16 })) UI.helpOpen = false;
  }
  function drawPause(ctx) {
    const LW = UI.LW, LH = UI.LH, w = 420, h = 384, x = LW / 2 - w / 2, y = LH / 2 - h / 2 - 20;
    ctx.fillStyle = 'rgba(4,8,18,0.66)'; ctx.fillRect(0, 0, LW, LH); UI.block(0, 0, LW, LH);
    panel(ctx, x, y, w, h, 16, 0.98);
    T(ctx, '일시정지', LW / 2, y + 54, 30, COL.text, 'center', 900);
    if (button(ctx, 'pResume', x + 50, y + 88, w - 100, 50, '계속하기', { primary: true, size: 19, weight: 800 })) { if (UI.on.pause) UI.on.pause(); }
    if (button(ctx, 'pHelp', x + 50, y + 148, w - 100, 44, '조작법 보기', { size: 16 })) { UI.helpOpen = true; }
    if (button(ctx, 'pCoach', x + 50, y + 200, w - 100, 44, '길잡이(초보자 안내): ' + (UI.coachOn ? '켜짐' : '꺼짐'), { size: 16, active: UI.coachOn, color: '#2e8a55' })) { if (UI.on.coach) UI.on.coach(); }
    if (button(ctx, 'pRestart', x + 50, y + 252, w - 100, 44, '같은 영웅으로 다시 시작', { size: 16 })) { if (UI.on.restart) UI.on.restart(); }
    if (button(ctx, 'pMenu', x + 50, y + 304, w - 100, 44, '영웅 선택으로', { size: 16 })) { if (UI.on.menu) UI.on.menu(); }
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
    T(ctx, C.TEAM_NAMES[1 - G.winner] + ' 팀의 코어가 ' + (G.burning ? '최후의 불길에 먼저 무너졌습니다' : '파괴되었습니다') + ' · ' + C.TEAM_NAMES[G.winner] + ' 팀 승리 · 경기 시간 ' + U.fmtTime(G.t), LW / 2, y + 120, 17, COL.text, 'center', 600);
    panel(ctx, x, y + 140, w, 530, 16, 0.96);
    drawScoreTable(ctx, G, me, x + 20, y + 156, w - 40, true);
    if (button(ctx, 'eAgain', LW / 2 - 310, y + 690, 300, 56, '같은 영웅으로 다시 하기', { primary: true, size: 19, weight: 800 })) { if (UI.on.restart) UI.on.restart(); }
    if (button(ctx, 'eMenu', LW / 2 + 10, y + 690, 300, 56, '영웅 다시 고르기', { size: 18 })) { if (UI.on.menu) UI.on.menu(); }
    ctx.globalAlpha = 1;
  }

  /* ---------- 길잡이 카드 · 말풍선 · 한 줄 안내 · 사망 원인 ---------- */
  function keycap(ctx, label, x, y, h) {
    ctx.font = X.font(h * 0.52, 800);
    const w = Math.max(h, ctx.measureText(label).width + h * 0.6);
    X.rr(ctx, x, y, w, h, 6);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#3a4a7c'); g.addColorStop(1, '#222d50');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.5; ctx.stroke();
    T(ctx, label, x + w / 2, y + h / 2 + 1, h * 0.52, '#fff0b8', 'center', 800, 'middle');
    return w;
  }
  /* HUD의 특정 위치를 가리키는 통통 튀는 화살표 */
  function pointAt(ctx, r, label) {
    if (!r) return;
    const cx = r.x + r.w / 2, top = r.y - 8 - Math.abs(Math.sin(UI.clock * 5)) * 9, q = 0.5 + 0.5 * Math.sin(UI.clock * 6);
    X.rr(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 11); ctx.strokeStyle = X.rgba(COL.gold, 0.35 + q * 0.55); ctx.lineWidth = 3; ctx.stroke();
    X.poly(ctx, [cx - 14, top - 22, cx + 14, top - 22, cx, top]); ctx.fillStyle = COL.gold; ctx.fill(); ctx.strokeStyle = 'rgba(6,10,20,0.9)'; ctx.lineWidth = 2.5; ctx.stroke();
    if (label) {
      ctx.font = X.font(15, 800); const tw = ctx.measureText(label).width + 24;
      const bx = U.clamp(cx - tw / 2, 8, UI.LW - tw - 8);
      X.rr(ctx, bx, top - 54, tw, 30, 9); ctx.fillStyle = 'rgba(8,12,24,0.94)'; ctx.fill(); ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.8; ctx.stroke();
      T(ctx, label, bx + tw / 2, top - 38, 15, '#fff0b8', 'center', 800, 'middle');
    }
  }
  function drawCoach(ctx, G, me) {
    const c = UI.coach; if (!c || !UI.coachOn || UI.ended || UI.shopOpen) return;
    const x = 14, y = 232, w = 348;
    if (c.cur < 0) {
      if (c.doneT < 0 || UI.clock - c.doneT > 10) return;
      ctx.globalAlpha = Math.min(1, (10 - (UI.clock - c.doneT)) * 1.5);
      panel(ctx, x, y, w, 70, 12, 0.93);
      T(ctx, '길잡이 완료!', x + 16, y + 28, 17, COL.gold, 'left', 800);
      T(ctx, '기본기는 모두 익혔습니다. F1 키로 언제든 조작법을 볼 수 있습니다.', x + 16, y + 52, 12.5, COL.text, 'left', 500);
      ctx.globalAlpha = 1;
      return;
    }
    const s = COACH[c.cur];
    let key = s.key, title = s.title;
    if (s.id === 'lasthit') title += '  ' + Math.min(3, me.cs) + ' / 3';
    if (s.id === 'skill') { for (let i = 0; i < 3; i++) if (me.ranks[i] > 0) { key = KEYS[i]; break; } }
    const ls = X.wrap(ctx, s.text, w - 30, 13.5, 500);
    const h = 70 + ls.length * 19 + 22;
    panel(ctx, x, y, w, h, 12, 0.93); UI.block(x, y, w, h);
    X.rr(ctx, x, y, 5, h, 3); ctx.fillStyle = COL.gold; ctx.fill();
    let nDone = 0; for (const st of COACH) if (c.done[st.id]) nDone++;
    T(ctx, '길잡이  ' + (nDone + 1) + ' / ' + COACH.length, x + 16, y + 21, 12, COL.gold, 'left', 800);
    const cr = UI.hit('coachOff', x + w - 54, y + 6, 46, 22);
    X.rr(ctx, x + w - 54, y + 6, 46, 22, 6); ctx.fillStyle = cr.hover ? '#2c3a66' : 'rgba(16,22,42,0.8)'; ctx.fill(); ctx.strokeStyle = COL.line; ctx.lineWidth = 1.2; ctx.stroke();
    T(ctx, '끄기', x + w - 31, y + 18, 11.5, COL.dim, 'center', 700, 'middle');
    if (cr.hover) { UI.cursor = 'pointer'; UI.tip = { title: '길잡이 끄기', body: '초보자 안내를 숨깁니다. Esc(일시정지) 메뉴에서 다시 켤 수 있습니다.' }; }
    if (cr.click && UI.on.coach) { UI.on.coach(); UI.toast('길잡이를 껐습니다 — Esc 메뉴에서 다시 켤 수 있습니다', '#cfe6ff'); }
    const kw = keycap(ctx, key, x + 16, y + 32, 28);
    T(ctx, title, x + 26 + kw, y + 52, 17, COL.text, 'left', 800);
    for (let i = 0; i < ls.length; i++) T(ctx, ls[i], x + 16, y + 82 + i * 19, 13.5, '#d5dcf0', 'left', 500);
    // 진행 점
    for (let i = 0; i < COACH.length; i++) {
      const dn = !!c.done[COACH[i].id];
      X.circle(ctx, x + 22 + i * 16, y + h - 14, i === c.cur ? 5 : 4); ctx.fillStyle = dn ? '#62dd62' : i === c.cur ? COL.gold : '#2c385e'; ctx.fill();
    }
    T(ctx, '하나씩 해 보면 다음 안내가 나옵니다', x + w - 14, y + h - 10, 11, COL.dim, 'right', 500);
    // 지금 눌러야 할 곳을 가리킨다
    if (UI.topLayer > 0 || me.dead) return;
    const R = UI.rects;
    if (s.id === 'learn') pointAt(ctx, R.learnRec || R.learn, '배울 스킬을 고르세요 (1·2·3)');
    else if (s.id === 'shop' && !UI.shopOpen) pointAt(ctx, R.shop, 'P — 첫 아이템 사기');
    else if (s.id === 'recall' && !me.atFountain && !me.recall) {
      const nb = AOS.nextBuy(me);
      if (me.hp / me.maxHp < 0.5 || (nb && me.gold >= nb.price && nb.price >= 300)) pointAt(ctx, R.recall, 'B — 귀환');
    } else if (s.id === 'skill' && R.skill) {
      let near = false;
      for (const u of G.units) if (!u.dead && u.team !== me.team && !u.isStruct && u.seen[me.team] && U.du(u, me) < 13) { near = true; break; }
      if (near) for (let i = 0; i < 3; i++) if (me.ranks[i] > 0 && !me.castBlock(i)) { pointAt(ctx, { x: R.skill.x + i * 73, y: R.skill.y, w: 64, h: 64 }, KEYS[i] + ' 누르고 → 떼기'); break; }
    }
  }
  function drawHint(ctx, dt) {
    const hn = UI.hint; if (!hn) return;
    hn.t += dt;
    if (hn.t >= hn.dur) { UI.hint = null; return; }
    const LW = UI.LW, y = UI.LH - 318, al = Math.min(1, hn.t * 6, (hn.dur - hn.t) * 3);
    ctx.font = X.font(16, 700);
    const tw = ctx.measureText(hn.text).width, kw = hn.key ? Math.max(30, hn.key.length * 11 + 16) + 10 : 0, w = tw + kw + 40, x = LW / 2 - w / 2;
    ctx.globalAlpha = al;
    X.rr(ctx, x, y, w, 40, 10); ctx.fillStyle = 'rgba(8,12,24,0.93)'; ctx.fill(); ctx.strokeStyle = hn.color; ctx.lineWidth = 2; ctx.stroke();
    X.rr(ctx, x, y, 6, 40, 3); ctx.fillStyle = hn.color; ctx.fill();
    if (hn.key) keycap(ctx, hn.key, x + 18, y + 7, 26);
    T(ctx, hn.text, x + 22 + kw, y + 21, 16, '#f4f7ff', 'left', 700, 'middle');
    ctx.globalAlpha = 1;
  }
  /* 쓰러졌을 때: 무엇에 당했는지 */
  function drawRecap(ctx, G, me) {
    const rc = UI.recap; if (!rc || !rc.parts.length) return;
    const LW = UI.LW, w = 540, x = LW / 2 - w / 2, y = 292;
    const top = rc.parts[0], tip = DEATH_TIP[top.k] || DEATH_TIP.hero;
    const ls = X.wrap(ctx, tip, w - 40, 13.5, 500);
    const h = 54 + rc.parts.length * 26 + 14 + ls.length * 19 + 14;
    panel(ctx, x, y, w, h, 14, 0.94);
    T(ctx, '무엇에 당했나', x + 20, y + 30, 17, '#ffd0c8', 'left', 800);
    T(ctx, '마지막 12초 동안 받은 피해 ' + Math.round(rc.total), x + w - 20, y + 30, 12.5, COL.dim, 'right', 600);
    rc.parts.forEach((p, i) => {
      const ry = y + 46 + i * 26, f = p.a / Math.max(1, rc.total);
      const col = p.k === 'hero' ? COL.red : p.k === 'minion' ? '#c9a2ff' : '#ffb04a';
      T(ctx, partName(p), x + 20, ry + 14, 14, COL.text, 'left', 700);
      bar(ctx, x + 150, ry + 4, w - 300, 12, f, col);
      T(ctx, Math.round(p.a) + '  (' + Math.round(f * 100) + '%)', x + w - 20, ry + 14, 13.5, col, 'right', 700);
    });
    const ty = y + 46 + rc.parts.length * 26 + 12;
    X.line(ctx, x + 20, ty - 4, x + w - 20, ty - 4, COL.line, 1);
    for (let i = 0; i < ls.length; i++) T(ctx, ls[i], x + 20, ty + 15 + i * 19, 13.5, '#d5dcf0', 'left', 500);
  }
  /* 경기 흐름 한 줄 (타이머 아래) */
  function drawPhase(ctx, G) {
    const LW = UI.LW; let text = '', col = COL.dim;
    if (G.t < C.GRACE_END) { text = '개전 보호 ' + U.fmtTime(C.GRACE_END - G.t) + ' · 쓰러지는 대신 본진으로 돌아옵니다'; col = '#9bd4ff'; }
    else if (G.t >= C.BURN_START) { text = '최후의 불길 · 양 팀 코어가 무너지는 중'; col = '#ff7466'; }
    else if (G.t >= C.SHOWDOWN) { text = '결전 · 구조물이 받는 피해 +' + Math.round(C.SHOWDOWN_RATE * (G.t - C.SHOWDOWN) * 100) + '%'; col = '#ff9d5c'; }
    else {
      const f1 = G.fortOf({ kind: 'tower', tier: 1 }), f2 = G.fortOf({ kind: 'tower', tier: 2 }), fc = G.fortOf({ kind: 'core', tier: 3 });
      if (f1 > 0.02) text = '외곽 포탑 방비 중 · 받는 피해 −' + Math.round(f1 * 100) + '%';
      else if (f2 > 0.02) text = '내부 포탑 방비 중 · 받는 피해 −' + Math.round(f2 * 100) + '%';
      else if (fc > 0.02) text = '코어 방비 중 · 받는 피해 −' + Math.round(fc * 100) + '%';
    }
    if (!text) return 0;
    ctx.font = X.font(12.5, 700); const tw = ctx.measureText(text).width + 24;
    X.rr(ctx, LW / 2 - tw / 2, 64, tw, 22, 11); ctx.fillStyle = 'rgba(8,12,24,0.82)'; ctx.fill(); ctx.strokeStyle = X.rgba(col, 0.7); ctx.lineWidth = 1.2; ctx.stroke();
    T(ctx, text, LW / 2, 75.5, 12.5, col, 'center', 700, 'middle');
    return 26;
  }

  UI.drawHUD = function (ctx, G, me, dt) {
    const LW = UI.LW, LH = UI.LH, c = UI.coach;
    if (!UI.paused) coachTick(G, me, dt);
    if (me.dead && !UI.ended) {
      ctx.fillStyle = 'rgba(26,30,48,0.42)'; ctx.fillRect(0, 0, LW, LH);
      TO(ctx, '부활까지 ' + Math.ceil(me.respawnT) + '초', LW / 2, 232, 30, '#ffd0c8', 'center', 900, 'rgba(6,10,20,0.9)', 5, 'middle');
      T(ctx, '본진에서 부활합니다 · 기다리는 동안 P 키로 상점을 열어 아이템을 살 수 있습니다', LW / 2, 266, 15, COL.text, 'center', 600, 'middle');
      drawRecap(ctx, G, me);
    }
    const ph = UI.ended ? 0 : drawPhase(ctx, G);
    if (!W.cam.locked && !UI.ended) TO(ctx, 'Space: 내 영웅으로 카메라 복귀', LW / 2, 84 + ph, 14, '#cfe6ff', 'center', 700, 'rgba(6,10,20,0.9)', 4, 'middle');
    // 라인으로 가는 길 화살표: 길잡이가 '이동' 단계일 때 (길잡이를 껐으면 시작 직후에만)
    const gd = UI.guide, coaching = c && UI.coachOn;
    if (gd && !UI.ended && !me.dead && (coaching ? (c.cur >= 0 && COACH[c.cur].id === 'move') : G.t < gd.until)) {
      const dx = gd.x - me.x, dy = gd.y - me.y, dist = Math.hypot(dx, dy);
      if (dist < 20) { if (!coaching) gd.until = 0; }
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
    if (me.dead && UI.hint && UI.hint.id !== 'rescue') UI.hint = null;      // 쓰러진 동안에는 상황 안내 대신 '무엇에 당했나'를 보여 준다
    if (showHud) { drawTop(ctx, G, me); drawFeed(ctx, dt); drawBottom(ctx, G, me); drawMinimap(ctx, G, me); drawCoach(ctx, G, me); drawAnnounce(ctx, dt); if (!UI.shopOpen) drawHint(ctx, dt); }
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
