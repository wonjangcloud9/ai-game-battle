/* 어스름 전선 — ui: 경기 중 화면 (스킬 부채·체력 띠·지도·처치 수·킬 알림·연속 처치 배너·쓰러진 까닭 쪽지)
   좌표는 '디자인 단위'(1600×900 기준, 화면 크기에 맞춰 us 배율). 매 프레임 다시 그리는 즉시 모드 UI.
   메뉴·상점·점수판·일시정지·결과 화면은 uimenu.js */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map, X = TW.X, Art = TW.Art, W = TW.World, TAU = Math.PI * 2;
  const UI = TW.UI = {
    us: 1, W: 1600, H: 900, mx: 0, my: 0, down: false, clicks: [], captured: false, cursor: 'default', t: 0, dt: 0.016,
    feed: [], banners: [], banner: null, toasts: [], tip: null, recap: null, combo: { n: 0, t: -9 }, readyT: [-9, -9, -9, -9, -9], prevCd: [0, 0, 0, 0, 0],
    shopOpen: false, scoreOpen: false, paused: false, helpOpen: false, ended: null, autoBuy: true, muted: false, musicOn: true,
    on: {}, hoverTip: null, blocks: [], startT: 0, mmBase: null, mmFog: null, mmFogT: 0, warnT: -9, lowHpT: 0, bossSeenT: -9,
    sel: { hero: 'moru', pos: null, diff: 'normal' },
    castMode: 'quick',        // 스킬 발사 방식: 'quick' = 누르는 순간 커서 쪽으로 · 'aim' = 누른 채 조준하고 떼면 발사
    outHold: 0, outGone: 0, outA: 0,      // 수가 밀릴 때 뜨는 "G 아군 부르기" 안내
    zones: [], zonesNow: [],   // 지난 프레임에 그려진 '눌리는 HUD 자리'. 클릭이 온 순간(프레임 사이)에 월드 명령인지 가리는 데 쓴다
  };
  const COL = UI.COL = { ink: '#0b0d22', panel: 'rgba(12,14,36,0.84)', line: 'rgba(190,180,255,0.24)', text: '#eef0ff', dim: '#9aa0c4', gold: '#ffd84a', dawn: C.TEAM_COL[0], dusk: C.TEAM_COL[1], good: '#8dffb4', bad: '#ff6a7c' };

  /* ---------- 기본 도구 ---------- */
  UI.begin = function (ctx, cssW, cssH, dpr, mx, my, dt) {
    UI.us = U.clamp(Math.min(cssW / 1600, cssH / 900), 0.55, 1.5);
    UI.W = cssW / UI.us; UI.H = cssH / UI.us; UI.mx = mx / UI.us; UI.my = my / UI.us; UI.dt = dt; UI.t += dt;
    UI.captured = false; UI.cursor = 'default'; UI.hoverTip = null; UI.ctx = ctx; UI.blocks.length = 0; UI.zonesNow.length = 0;
    ctx.setTransform(dpr * UI.us, 0, 0, dpr * UI.us, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
  UI.zone = function (x, y, w, h) { UI.zonesNow.push(x, y, w, h); };
  UI.zoneC = function (x, y, r) { UI.zonesNow.push(x - r, y - r, r * 2, r * 2); };
  /* (디자인 단위) 이 점이 HUD 위인가 — 지난 프레임의 배치로 본다 */
  UI.pointOverUI = function (x, y) { const z = UI.zones; for (let i = 0; i < z.length; i += 4) if (x >= z[i] && x <= z[i] + z[i + 2] && y >= z[i + 1] && y <= z[i + 1] + z[i + 3]) return true; return false; };
  UI.end = function (ctx) {
    if (UI.hoverTip) drawTip(ctx, UI.hoverTip);
    // 패널 위를 누른 클릭은 월드로 새지 않게 여기서 한꺼번에 소비한다 (단추들이 먼저 받을 수 있도록 맨 끝에)
    const bl = UI.blocks;
    for (const c of UI.clicks) { if (c.used) continue; for (let i = 0; i < bl.length; i += 4) if (c.x >= bl[i] && c.x <= bl[i] + bl[i + 2] && c.y >= bl[i + 1] && c.y <= bl[i + 1] + bl[i + 3]) { c.used = true; break; } }
    const z = UI.zones; UI.zones = UI.zonesNow; UI.zonesNow = z;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
  UI.over = function (x, y, w, h) { return UI.mx >= x && UI.mx <= x + w && UI.my >= y && UI.my <= y + h; };
  /* 마우스가 올라간 영역: 월드 클릭을 막고, 클릭이 있으면 소비한다 */
  UI.hit = function (x, y, w, h, button) {
    UI.zonesNow.push(x, y, w, h);
    if (!UI.over(x, y, w, h)) return false;
    UI.captured = true;
    for (const c of UI.clicks) if (!c.used && (button === undefined || c.b === button) && c.x >= x && c.x <= x + w && c.y >= y && c.y <= y + h) { c.used = true; return true; }
    return false;
  };
  UI.block = function (x, y, w, h) { UI.blocks.push(x, y, w, h); UI.zonesNow.push(x, y, w, h); if (UI.over(x, y, w, h)) { UI.captured = true; return true; } return false; };
  function panel(ctx, x, y, w, h, r, fill, line) { X.rr(ctx, x, y, w, h, r === undefined ? 14 : r); ctx.fillStyle = fill || COL.panel; ctx.fill(); ctx.strokeStyle = line || COL.line; ctx.lineWidth = 1; ctx.stroke(); }
  UI.panel = panel;
  function ring(ctx, x, y, r, w, frac, color, back) {
    if (back) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = back; ctx.lineWidth = w; ctx.stroke(); }
    if (frac > 0) { ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * U.clamp(frac, 0, 1)); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'butt'; ctx.stroke(); }
  }
  UI.ring = ring;
  /* 둥근 초상화 (캐시) */
  const roundCache = new Map();
  function portrait(ctx, heroId, x, y, r, ringCol, dim) {
    const px = Math.round(r * 2 * UI.us * (globalThis.devicePixelRatio > 1 ? 1.5 : 1)), key = heroId + '|' + px;
    let cv = roundCache.get(key);
    if (!cv) {
      cv = X.canvas(px, px); const c = cv.getContext('2d');
      c.save(); c.beginPath(); c.arc(px / 2, px / 2, px / 2, 0, TAU); c.clip();
      c.drawImage(Art.portrait(heroId, px), 0, 0, px, px);        // 원본이 더 클 수 있다(최소 16px) → 크기를 맞춰 찍는다
      c.restore();
      if (roundCache.size > 80) roundCache.clear();
      roundCache.set(key, cv);
    }
    ctx.globalAlpha = dim ? 0.35 : 1; ctx.drawImage(cv, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
    if (ringCol) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = ringCol; ctx.lineWidth = Math.max(1.5, r * 0.12); ctx.stroke(); }
  }
  UI.portrait = portrait;
  function chip(ctx, str, x, y, px, fg, bg, padX) {
    const w = X.textW(ctx, str, px, 800) + (padX || 8) * 2, h = px + 7;
    X.rr(ctx, x - w / 2, y - h / 2, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    X.text(ctx, str, x, y + 0.5, px, fg, 'center', 800);
    return w;
  }
  UI.chip = chip;
  /* 단추: 눌렸으면 true */
  UI.button = function (ctx, label, x, y, w, h, o) {
    o = o || {};
    const hot = UI.over(x, y, w, h) && !o.disabled, hit = UI.hit(x, y, w, h, 0) && !o.disabled;
    if (hot) UI.cursor = 'pointer';
    X.rr(ctx, x, y, w, h, o.r === undefined ? 12 : o.r);
    if (o.primary) { const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, hot ? '#ffffff' : '#f6f1e4'); g.addColorStop(1, hot ? '#f1ead8' : '#d9d1bc'); ctx.fillStyle = g; }      // 으뜸 단추: 한지 빛
    else ctx.fillStyle = o.on ? 'rgba(120,108,220,0.6)' : hot ? 'rgba(70,66,130,0.75)' : 'rgba(28,30,64,0.8)';
    ctx.fill(); ctx.strokeStyle = o.on ? '#c9bcff' : o.primary ? '#ffffff' : COL.line; ctx.lineWidth = o.on ? 1.6 : 1; ctx.stroke();
    X.text(ctx, label, x + w / 2, y + h / 2 + 1, o.px || 16, o.primary ? '#141024' : o.disabled ? '#6a6f90' : COL.text, 'center', o.primary ? 900 : 700);
    return hit;
  };
  function drawTip(ctx, tp) {
    const w = tp.w || 330, lines = [];
    for (const para of tp.body) for (const l of X.wrap(ctx, para, w - 28, 13.5, 500)) lines.push(l);
    const h = 46 + lines.length * 19 + (tp.foot ? 22 : 0);
    let x = U.clamp(tp.x - w / 2, 8, UI.W - w - 8), y = tp.y - h - 10; if (y < 8) y = tp.y + 30;
    panel(ctx, x, y, w, h, 12, 'rgba(8,10,28,0.95)', tp.color || COL.line);
    X.text(ctx, tp.title, x + 14, y + 20, 16, tp.color || COL.text, 'left', 800);
    if (tp.right) X.text(ctx, tp.right, x + w - 14, y + 20, 12.5, COL.dim, 'right', 600);
    for (let i = 0; i < lines.length; i++) X.text(ctx, lines[i], x + 14, y + 44 + i * 19, 13.5, '#d8dcf4', 'left', 500);
    if (tp.foot) X.text(ctx, tp.foot, x + 14, y + h - 14, 12, COL.gold, 'left', 600);
  }

  /* ---------- 알림 ---------- */
  UI.toast = function (msg, color) { const tt = UI.toasts; if (tt.length && tt[tt.length - 1].msg === msg) { tt[tt.length - 1].t = 0; return; } tt.push({ msg, color: color || '#ffe2a6', t: 0 }); if (tt.length > 3) tt.shift(); };
  UI.announce = function (text, color, sub, dur, opts) { UI.banners.push(Object.assign({ text, color: color || COL.gold, sub: sub || '', dur: dur || 2.6, t: 0 }, opts || {})); if (UI.banners.length > 4) UI.banners.splice(0, UI.banners.length - 4); };
  function feedPush(e) { e.t = 0; UI.feed.unshift(e); if (UI.feed.length > 6) UI.feed.pop(); }
  UI.reset = function () {
    UI.feed.length = 0; UI.banners.length = 0; UI.banner = null; UI.toasts.length = 0; UI.recap = null; UI.combo = { n: 0, t: -9 }; UI.hurtK = 0; UI.hurtAt = -9; UI.meLag = -1; UI.gain = null; UI.kc = null; UI.kcard = null; W.lens = null;
    UI.shopOpen = false; UI.scoreOpen = false; UI.paused = false; UI.helpOpen = false; UI.ended = null; UI.startT = UI.t; UI.outHold = 0; UI.outGone = 0; UI.outA = 0; UI.mmFogT = 0; UI.warnT = -9; UI.readyT = [-9, -9, -9, -9, -9]; UI.prevCd = [0, 0, 0, 0, 0];
  };

  /* ---------- 산 뒤: 얼마나 세졌는지 숫자로 (한꺼번에 산 것은 한 장으로 묶는다) ---------- */
  UI.gain = null;
  const fmt0 = (v) => U.fmtNum ? U.fmtNum(Math.round(v)) : String(Math.round(v));
  function gainAdd(me, e) {
    let g = UI.gain;
    if (!g || g.u !== me || UI.t - g.at > 0.8) g = UI.gain = { u: me, bought: [], at: UI.t, t0: UI.t, lines: [] };
    g.bought.push({ id: e.item, tier: e.tier }); g.at = UI.t;
    // 사기 전 = 지금 아이템에서 이 장에 묶인 것을 뺀 것 (같은 레벨로 견준다 → 레벨이 올라 생긴 차이는 섞이지 않는다)
    const base = Object.assign({}, me.items);
    for (const b of g.bought) base[b.id] = Math.min(base[b.id] || 0, b.tier - 1);
    const a = TW.powerOf(me, base), z = TW.powerOf(me), L = [];
    const pct = (p, q) => Math.round((q / Math.max(1e-6, p) - 1) * 100);
    if (z.dps - a.dps > 0.4) L.push({ k: '평타 초당 피해', a: fmt0(a.dps), z: fmt0(z.dps), d: '+' + pct(a.dps, z.dps) + '%', big: true });
    if (z.ehp - a.ehp > 1) L.push({ k: '버티는 힘', a: fmt0(a.ehp), z: fmt0(z.ehp), d: '+' + pct(a.ehp, z.ehp) + '%', big: true });
    const sk = TW.skillGain(me, a, z)[0];
    if (sk) L.push({ k: sk.key + ' ' + sk.name, a: fmt0(sk.from), z: fmt0(sk.to), d: '+' + pct(sk.from, sk.to) + '%', big: true });
    const row = (k, p, q, f, unit) => { if (Math.abs(q - p) > 1e-6) L.push({ k, a: f(p) + (unit || ''), z: f(q) + (unit || ''), d: '+' + (unit === '%' ? Math.round((q - p) * 100) : f(q - p)) + (unit || '') }); };
    const pc = (v) => String(Math.round(v * 100));
    row('공격력', a.ad, z.ad, fmt0); row('주문력', a.ap, z.ap, fmt0); row('체력', a.hp, z.hp, fmt0); row('방어력', a.def, z.def, fmt0);
    row('공격 속도', a.as, z.as, (v) => v.toFixed(2)); row('이동 속도', a.ms, z.ms, (v) => v.toFixed(1));
    row('재사용 감소', a.cdr, z.cdr, pc, '%'); row('흡혈', a.ls, z.ls, pc, '%');
    g.lines = L;
    g.pas = g.bought.filter(b => b.tier === 3).map(b => TW.Items[b.id].ptext);
  }
  UI.gainAdd = gainAdd;
  function drawGain(ctx) {
    const g = UI.gain; if (!g) return;
    const age = UI.t - g.at, life = 6.5; if (age > life || UI.ended) { if (age > life) UI.gain = null; return; }
    const a = Math.min(1, (UI.t - g.t0) / 0.18) * Math.min(1, (life - age) / 0.6), pop = 1 + 0.06 * Math.max(0, 1 - (UI.t - g.t0) / 0.25);
    const big = g.lines.filter(l => l.big), small = g.lines.filter(l => !l.big), w = 336;
    const h = 52 + big.length * 26 + Math.ceil(small.length / 2) * 20 + (g.pas.length ? 20 : 0) + 8;
    // 자리: 오른쪽 가운데(처치 소식 아래, 스킬 부채 위). 상점이 열려 있으면 상점 왼쪽
    let x = UI.W - w - 16, y = Math.min(372, UI.H - 330 - h);
    if (UI.shopOpen && TW.UIMenu) { const R = TW.UIMenu.shopRect(); x = R.x - w - 12; y = R.y; }
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x + w, y); ctx.scale(pop, pop); ctx.translate(-w, 0);
    X.rr(ctx, 0, 0, w, h, 14); ctx.fillStyle = 'rgba(8,11,30,0.93)'; ctx.fill(); ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.6; ctx.stroke();
    X.text(ctx, '강해졌다!', 16, 22, 19, COL.gold, 'left', 900, INK, 3);
    let ix = 118;
    for (const b of g.bought) { if (ix > w - 30) break; const it = TW.Items[b.id]; Art.iconButton(ctx, it.icon, ix, 22, 11, it.color, 1); X.text(ctx, String(b.tier), ix + 9, 30, 10, '#ffffff', 'center', 900, 'rgba(4,6,18,0.95)', 2.5); ix += 30; }
    X.text(ctx, g.bought.length > 1 ? g.bought.length + '개를 한 번에' : TW.Items[g.bought[0].id].name + ' ' + g.bought[0].tier + '단계', w - 14, 23, 12, COL.dim, 'right', 700);
    let ly = 54;
    for (const l of big) {
      X.text(ctx, l.k, 16, ly, 14, '#eef0ff', 'left', 800);
      X.text(ctx, l.a + '  →  ' + l.z, w - 76, ly, 16, '#ffffff', 'right', 900);
      X.text(ctx, l.d, w - 14, ly, 15, COL.good, 'right', 900);
      ly += 26;
    }
    for (let i = 0; i < small.length; i++) {
      const l = small[i], sx = 16 + (i % 2) * (w / 2 - 6);
      X.text(ctx, l.k + ' ' + l.a + '→' + l.z, sx, ly, 12.5, '#d8dcf4', 'left', 700);
      if (i % 2 === 1 || i === small.length - 1) ly += 20;
    }
    if (g.pas.length) { const pl = X.wrap(ctx, '3단계 효과 · ' + g.pas[0], w - 32, 12, 700); X.text(ctx, pl[0] + (pl.length > 1 ? '…' : ''), 16, ly, 12, COL.gold, 'left', 700); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  UI.drawGain = drawGain;

  /* ---------- 처치의 순간 (7차: "킬 순간이 짜릿하게") ----------
     ① 처치 알림: 줄을 서지 않고 처치한 그 프레임에 뜬다. 연속이면 같은 자리에서 '처치 → 2연속 → 3연속 …'으로 커지며 바뀐다
        (예전 배너는 한 줄로 기다려서, 한 방에 셋을 잡으면 둘째 알림이 1.0초 · 셋째가 2.0초 늦게 떴다)
     ② 처치 쪽지(내가 잡았을 때): 누가 → 누구를 · 무엇으로 마무리 · 내가 준 피해와 그 갈래 · 걸린 시간 · 도움 · 골드
        — 지도 아래, 쓰러졌을 때의 쪽지와 같은 자리 (눌리지 않는다: 그 아래 땅 클릭은 그대로 이동이 된다)
     ③ 렌즈: 마지막 한 방의 순간 화면 가장자리가 어두워지며 금빛(내가 잡음) / 붉은빛(내가 쓰러짐). 실제 시간으로 흐르고 그림에만 걸린다 */
  const KC_TITLE = ['', '처치!', '2연속 처치!', '3연속 처치!', '4연속 처치!', '5연속 — 싹쓸이!'];
  const KC_FLAVOR = ['', '', '두 불을 껐다', '세 불을 껐다', '네 불을 껐다', '다섯 불을 모두 껐다'];
  const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xAC00; if (!(c >= 0 && c <= 11171)) return b; const j = c % 28; return j === 0 || j === 8 ? b : a; };      // 받침이 없거나 ㄹ 이면 '로'
  function abInfo(h, ab) {
    if (!h || !h.hd || !ab) return null;
    const L = h.hd.abilities; for (let i = 0; i < L.length; i++) if (L[i].name === ab) return { key: 'QWER'[i] };
    return null;
  }
  const howOf = (h, ab) => { if (!ab) return ''; const bi = abInfo(h, ab); return (bi ? bi.key + ' ' : '') + ab + josa(ab, '으로', '로') + ' 마무리'; };
  UI.kc = null; UI.kcard = null;
  function killCall(e, me, mine) {
    const v = e.victim, k = e.killer, n = Math.min(5, Math.max(1, e.multi || 1)), r = e.recap || {};
    const ab = r.blow && k && r.blow.heroId === k.heroId ? r.blow.ab : '';
    const title = mine && e.first && n < 2 ? '첫 처치!' : KC_TITLE[n];
    const sub = mine ? (n >= 2 ? KC_FLAVOR[n] + ' · ' : '') + v.name + ' · +' + Math.round(e.gold) + ' 골드' : k.name + (n >= 2 ? ' · ' + KC_FLAVOR[n] : '');
    UI.kc = { mine, n, title, sub, how: howOf(k, ab), a: k, b: v, col: mine ? COL.gold : (me && k.team === me.team) ? COL.good : COL.bad, t: 0, dur: 2.3 + 0.35 * (n - 1) };
  }
  function makeCard(e, me) {
    const r = e.recap || {}, src = r.sources || [], mine = src.find(s => s.type === 'hero' && s.heroId === me.heroId) || null;
    return { t: 0, dur: 5.5, v: e.victim, n: Math.min(5, Math.max(1, e.multi || 1)), first: !!e.first, gold: Math.round(e.gold), my: mine ? mine.total : 0, total: Math.max(1, r.total || 0),
      parts: mine ? mine.parts : [], others: src.filter(s => s !== mine), blow: r.blow && r.blow.heroId === me.heroId ? r.blow : null, span: r.span || 0, assists: (e.assists || []).slice(0, 4) };
  }
  UI.onEvent = function (e, G, me) {
    const myTeam = me ? me.team : 0;
    switch (e.type) {
      case 'kill': {
        const v = e.victim, k = e.killer;
        feedPush({ kind: 'kill', killer: k, victim: v, assists: e.assists, by: e.by });
        if (v === me) UI.recap = { r: e.recap, t: 0 };
        if (k && k === me) { killCall(e, me, true); UI.kcard = makeCard(e, me); }
        else {
          if (e.first) UI.announce('첫 처치!', COL.gold, (k ? k.name : '?') + ' → ' + v.name, 2.6, { a: k, b: v });
          if (k && e.multi >= 2) { if (UI.kc && UI.kc.mine) UI.announce(KC_TITLE[Math.min(5, e.multi)], k.team === myTeam ? COL.good : COL.bad, k.name, 2.4, { a: k, multi: Math.min(5, e.multi) }); else killCall(e, me, false); }
        }
        if (k && !(e.multi >= 2) && (e.streak === 3 || e.streak === 5 || e.streak >= 7)) UI.announce(k.name + (e.streak >= 7 ? ' — 전장의 별' : e.streak >= 5 ? ' — 아무도 못 막는다' : ' — 기세등등'), k.team === myTeam ? COL.gold : COL.bad, '쓰러지지 않고 ' + e.streak + '명째', 2.6, { a: k });
        if (e.shutdown) UI.announce('기세를 꺾었다!', k && k.team === myTeam ? COL.good : COL.bad, v.name + '의 연속 처치가 끝났습니다', 2.4, { a: k, b: v });
        if (k !== me && me && e.assists.indexOf(me) >= 0) UI.toast(v.name + ' 처치 도움', COL.good);
        break;
      }
      case 'ace': UI.announce(e.team === myTeam ? '적 전멸!' : '아군 전멸…', e.team === myTeam ? COL.gold : COL.bad, e.team === myTeam ? '지금 밀어붙이세요' : '', 3, { big: true }); break;
      case 'towerDown': {
        const mine = e.team === myTeam, inner = e.tower.tier === 2;
        feedPush({ kind: 'tower', team: e.team, tower: e.tower });
        UI.announce((mine ? '적 ' : '우리 ') + (inner ? '안쪽 등불탑' : '바깥 등불탑') + (mine ? ' 파괴' : '이 꺼졌습니다'), mine ? COL.gold : COL.bad, C.LANE_NAMES[e.tower.lane] + (inner ? (mine ? ' · 우리 정예병이 합류합니다' : ' · 적 정예병이 몰려옵니다') : ''), 2.8);
        break;
      }
      case 'bossSpawn': UI.announce('이무기가 강에 나타났습니다', '#7dffd9', '잡으면 팀 전체가 강해집니다 (아래쪽 강)', 3.4, { icon: 'boss' }); break;
      case 'elderSpawn': if (G.t > 200) break; UI.announce('고목 정령이 깨어났습니다', '#9fe07a', '위쪽 강 · 잡으면 팀 전체가 등불탑을 더 빨리 부숩니다', 2.8); break;
      case 'bossDown': feedPush({ kind: 'obj', team: e.team, text: '이무기 처치' }); UI.announce(C.TEAM_NAMES[e.team] + '이 이무기를 쓰러뜨렸습니다', e.team === myTeam ? '#7dffd9' : COL.bad, e.team === myTeam ? '이무기의 기운 — 100초 동안 팀 전체 강화' : '적 팀 전체가 100초 동안 강해집니다', 3.4, { icon: 'boss', big: true }); break;
      case 'elderDown': feedPush({ kind: 'obj', team: e.team, text: '고목 정령 처치' }); UI.announce(C.TEAM_NAMES[e.team] + '이 고목 정령을 쓰러뜨렸습니다', e.team === myTeam ? '#9fe07a' : COL.bad, e.team === myTeam ? '고목의 힘 — 75초 동안 등불탑을 더 빨리 부숩니다' : '적이 75초 동안 등불탑을 더 빨리 부숩니다', 2.8); break;
      case 'buffGain': if (e.u === me && e.kind !== 'boss' && e.kind !== 'elder') UI.toast(TW.BUFFS[e.kind].name + ' — ' + TW.BUFFS[e.kind].text, TW.BUFFS[e.kind].color); break;
      case 'buffSteal': if (e.u === me) UI.toast('버프를 빼앗았습니다!', COL.gold); break;
      case 'say': if (e.team === myTeam) feedPush({ kind: 'say', u: e.u, text: e.text, tone: e.kind }); break;
      case 'levelup': if (e.u === me && e.ult) UI.announce('궁극기 해금!', me.hd.glow, 'R — ' + me.hd.abilities[3].name, 2.6, { a: me }); break;
      case 'lastHit': if (e.u === me) { const c = UI.combo; c.n = (G.t - c.t < 6) ? c.n + 1 : 1; c.t = G.t; c.pop = UI.t; } break;
      // 내가 맞았다: 왼쪽 아래 체력 띠가 흔들리고 테두리가 붉게 번쩍인다 (크게 깎일수록 크게)
      case 'hit': if (me && e.tgt === me && e.tier !== 'dot' && e.amt > 0) { const fr = e.amt / Math.max(1, me.maxHp), weak = !!e.src && !!e.src.isMinion && fr < 0.03; UI.hurtK = Math.min(1, Math.max(UI.hurtK || 0, (weak ? 0.12 : 0.3) + fr * 6)); UI.hurtAt = UI.t; } break;
      case 'towerLock': if (e.target === me) { UI.warnT = UI.t; } break;
      case 'buy': if (e.u === me) gainAdd(me, e); break;
      case 'respawn': if (e.u === me) UI.recap = null; break;
      case 'coreDown': break;
      default: break;
    }
  };

  /* =====================================================================
     HUD — 화면 가운데 아래는 비워 둔다 (싸움이 벌어지는 곳).
     왼쪽 위 = 지도 · 가운데 위 = 시간과 처치 수 · 오른쪽 위 = 골드와 아이템 · 왼쪽 아래 = 나 · 오른쪽 아래 = 스킬 부채
     ===================================================================== */
  const KEYS = ['Q', 'W', 'E', 'R'];
  const INK = 'rgba(6,9,24,0.9)';
  /* 기울어진 판(평행사변형): 위쪽이 오른쪽으로 밀린다 */
  function slab(ctx, x, y, w, h, lean) { const k = h * (lean === undefined ? 0.22 : lean); ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + w + k, y); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x - k, y + h); ctx.closePath(); }
  function diamond(ctx, x, y, r) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
  function keycap(ctx, str, x, y, px, on) { const w = Math.max(px + 8, X.textW(ctx, str, px, 900) + 12), h = px + 8; X.rr(ctx, x - w / 2, y - h / 2, w, h, 6); ctx.fillStyle = on ? '#fff6dc' : '#7d829f'; ctx.fill(); ctx.strokeStyle = 'rgba(6,9,24,0.9)'; ctx.lineWidth = 2; ctx.stroke(); X.text(ctx, str, x, y + 0.5, px, '#0b0d22', 'center', 900); }

  function skillButton(ctx, me, i, x, y, r) {
    const ab = me.hd.abilities[i], cd = me.cds[i], max = ab.cd * (1 - me.cdr), locked = ab.ult && !me.ultReady(), col = me.hd.glow;
    const ready = !locked && cd <= 0 && !me.dead, hot = Math.hypot(UI.mx - x, UI.my - y) <= r;
    if (UI.prevCd[i] > 0 && cd <= 0) UI.readyT[i] = UI.t; UI.prevCd[i] = cd;
    const flash = Math.max(0, 1 - (UI.t - UI.readyT[i]) / 0.5);
    UI.zoneC(x, y, r + 6);
    const aiming = W.aim && W.aim.slot === i, charging = me.charge && me.charge.slot === i, chan = me.channel && me.channel.slot === i;
    if (flash > 0) { ctx.globalAlpha = flash; X.circle(ctx, x, y, r + 7 + (1 - flash) * 12); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1; }
    X.circle(ctx, x, y, r + 5); ctx.fillStyle = 'rgba(6,9,24,0.94)'; ctx.fill();
    Art.iconButton(ctx, ab.icon, x, y, r, ready ? col : U.mix(col, '#4a4f72', 0.6), 1);       // 재사용 중에도 그림은 보인다
    if (!ready && !locked && cd > 0) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * U.clamp(cd / Math.max(0.1, max), 0, 1)); ctx.closePath(); ctx.fillStyle = 'rgba(4,6,18,0.62)'; ctx.fill();
      X.text(ctx, cd < 3 ? cd.toFixed(1) : String(Math.ceil(cd)), x, y + 1, r * 0.7, '#ffffff', 'center', 900, 'rgba(4,6,18,0.92)');
    }
    if (locked) { X.circle(ctx, x, y, r); ctx.fillStyle = 'rgba(4,6,18,0.58)'; ctx.fill(); X.text(ctx, C.ULT_LEVEL + '레벨', x, y + 1, r * 0.4, '#e8ecff', 'center', 900, 'rgba(4,6,18,0.92)'); }
    ring(ctx, x, y, r + 2.5, aiming || charging || chan ? 4 : 2.5, 1, aiming || charging || chan ? '#ffffff' : ready ? col : 'rgba(150,156,200,0.35)');
    if (charging) ring(ctx, x, y, r + 9, 4, me.chargeK(), '#ffffff', 'rgba(255,255,255,0.2)');
    if (chan) ring(ctx, x, y, r + 9, 4, 1 - me.channel.t / me.channel.ab.chan.dur, col, 'rgba(255,255,255,0.2)');
    keycap(ctx, KEYS[i], x, y + r + 4, i === 3 ? 17 : 15, ready);
    // 방금 쓴 스킬의 판정: 맞았으면 흰 고리가 퍼지고, 빗나갔으면 잿빛으로 식는다
    const vd = TW.Feel ? TW.Feel.btn[i] : null;
    if (vd && UI.t - vd.t < 0.55 && UI.t >= vd.t) {
      const k = (UI.t - vd.t) / 0.55;
      ctx.globalAlpha = 1 - k; X.circle(ctx, x, y, r + 6 + k * 12); ctx.strokeStyle = vd.ok ? '#ffffff' : '#8a90aa'; ctx.lineWidth = vd.ok ? 5 : 3; ctx.stroke();
      ctx.globalAlpha = Math.min(1, (1 - k) * 2.5); chip(ctx, vd.ok ? '명중' : '빗나감', x, y - r - 18, 12.5, vd.ok ? '#0b0d22' : '#e8ecff', vd.ok ? '#ffffff' : 'rgba(72,76,104,0.96)', 8);
      ctx.globalAlpha = 1;
    }
    if (hot) {
      UI.captured = true; UI.cursor = 'pointer';
      UI.hoverTip = { x, y: y - r - 8, title: ab.name, right: '재사용 ' + (Math.round(max * 10) / 10) + '초', body: [ab.desc(me)], color: col, foot: locked ? '레벨 ' + C.ULT_LEVEL + '에 열립니다' : ab.type === 'charge' ? '키를 누르고 있다가 떼세요' : ab.type === 'self' ? '키를 누르면 바로 씁니다' : UI.castMode === 'quick' ? '키를 누르는 순간 커서 쪽으로 나갑니다' : '키를 누른 채 조준하고, 떼면 나갑니다' };
      for (const c of UI.clicks) if (!c.used && c.b === 0 && Math.hypot(c.x - x, c.y - y) <= r) { c.used = true; if (UI.on.castSlot) UI.on.castSlot(i); }
    }
  }
  function smallButton(ctx, icon, key, x, y, r, cd, max, col, tip, cb) {
    const ready = cd <= 0, hot = Math.hypot(UI.mx - x, UI.my - y) <= r;
    UI.zoneC(x, y, r + 4);
    X.circle(ctx, x, y, r + 4); ctx.fillStyle = 'rgba(6,9,24,0.94)'; ctx.fill();
    Art.iconButton(ctx, icon, x, y, r, ready ? col : U.mix(col, '#4a4f72', 0.6), 1);
    if (!ready) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * U.clamp(cd / Math.max(0.1, max), 0, 1)); ctx.closePath(); ctx.fillStyle = 'rgba(4,6,18,0.62)'; ctx.fill(); X.text(ctx, String(Math.ceil(cd)), x, y + 1, r * 0.74, '#ffffff', 'center', 900, 'rgba(4,6,18,0.92)'); }
    ring(ctx, x, y, r + 2, 2, 1, ready ? col : 'rgba(150,156,200,0.35)');
    if (key) keycap(ctx, key, x, y + r + 3, 12, ready);
    if (hot) { UI.captured = true; UI.cursor = 'pointer'; UI.hoverTip = Object.assign({ x, y: y - r - 8 }, tip); for (const c of UI.clicks) if (!c.used && c.b === 0 && Math.hypot(c.x - x, c.y - y) <= r) { c.used = true; if (cb) cb(); } }
  }
  /* 스킬 단추의 자리 (시험 도구도 쓴다) */
  UI.skillPos = function (i) {
    const ax = UI.W - 100, ay = UI.H - 104;
    return i === 3 ? { x: ax, y: ay, r: 45 } : i === 0 ? { x: ax - 128, y: ay + 8, r: 34 } : i === 1 ? { x: ax - 94, y: ay - 92, r: 34 } : i === 2 ? { x: ax + 6, y: ay - 128, r: 34 }
      : i === 4 ? { x: ax - 200, y: ay - 82, r: 23 } : i === 5 ? { x: ax - 84, y: ay - 198, r: 23 } : { x: ax - 150, y: ay - 150, r: 19 };      // 4 = 구르기 · 5 = 귀환 · 6 = 패시브
  };
  /* 오른쪽 아래: 궁극기를 축으로 Q·W·E 가 부채처럼 둘러선다 */
  function drawSkills(ctx, G, me) {
    const col = me.hd.glow, cw = UI.W, chh = UI.H;
    const g = ctx.createRadialGradient(cw, chh, 60, cw, chh, 380); g.addColorStop(0, 'rgba(6,9,24,0.72)'); g.addColorStop(0.62, 'rgba(6,9,24,0.36)'); g.addColorStop(1, 'rgba(6,9,24,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cw, chh); ctx.arc(cw, chh, 380, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
    const R = UI.skillPos(3);
    ctx.strokeStyle = U.rgba(col, 0.22); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(R.x, R.y, 130, Math.PI * 0.94, Math.PI * 1.56); ctx.stroke();
    const pp = UI.skillPos(6);
    Art.iconButton(ctx, me.hd.passive.icon, pp.x, pp.y, pp.r, col, 0.95); ring(ctx, pp.x, pp.y, pp.r + 1.5, 1.5, 1, 'rgba(255,255,255,0.3)');
    if (Math.hypot(UI.mx - pp.x, UI.my - pp.y) < pp.r + 1) { const p = me.hd.passive; UI.hoverTip = { x: pp.x, y: pp.y - 26, title: p.name, right: '패시브', body: [p.desc(me)], color: col }; UI.captured = true; }
    const ro = UI.skillPos(4), rc = UI.skillPos(5);
    smallButton(ctx, 'roll', 'SPACE', ro.x, ro.y, ro.r, me.rollCd, me.rollCdMax(), '#eafff0', { title: '구르기', right: '재사용 ' + Math.round(me.rollCdMax()) + '초', body: ['커서 쪽으로 몸을 날립니다. 구르는 동안에는 날아오는 스킬에 맞지 않습니다.'], color: '#eafff0' }, () => UI.on.roll && UI.on.roll());
    smallButton(ctx, 'recall', 'B', rc.x, rc.y, rc.r, 0, 1, C.TEAM_LIGHT[me.team], { title: '귀환', body: [C.RECALL_TIME + '초 동안 가만히 있으면 본진으로 돌아갑니다. 맞으면 끊깁니다.'], color: C.TEAM_LIGHT[me.team] }, () => UI.on.recall && UI.on.recall());
    for (let i = 0; i < 4; i++) { const p = UI.skillPos(i); skillButton(ctx, me, i, p.x, p.y, p.r); }
  }
  /* 왼쪽 아래: 나 — 초상(경험치 고리) · 체력 띠 · 버프 · 전적 */
  function drawMe(ctx, G, me) {
    const col = me.hd.glow, tc = C.TEAM_COL[me.team], yb = UI.H;
    const g = ctx.createRadialGradient(0, yb, 60, 0, yb, 500); g.addColorStop(0, 'rgba(6,9,24,0.72)'); g.addColorStop(0.6, 'rgba(6,9,24,0.36)'); g.addColorStop(1, 'rgba(6,9,24,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, yb); ctx.arc(0, yb, 500, Math.PI * 1.5, TAU); ctx.closePath(); ctx.fill();
    // 초상 + 경험치 고리 + 레벨 마름모
    const px = 84, py = yb - 84;
    X.circle(ctx, px, py, 62); ctx.fillStyle = 'rgba(6,9,24,0.95)'; ctx.fill();
    portrait(ctx, me.heroId, px, py, 51, null, me.dead);
    ring(ctx, px, py, 57, 6, me.level >= C.MAX_LEVEL ? 1 : me.xp / me.xpNeed(), '#ffd98a', 'rgba(255,255,255,0.13)');
    diamond(ctx, px + 44, py + 44, 20); ctx.fillStyle = '#0b0d22'; ctx.fill(); ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2.5; ctx.stroke();
    X.text(ctx, String(me.level), px + 44, py + 45, 17, '#ffffff', 'center', 900);
    UI.block(px - 62, py - 62, 124, 124);
    if (Math.hypot(UI.mx - px, UI.my - py) < 60) { const p = me.hd.passive; UI.hoverTip = { x: px + 120, y: py - 66, title: me.name + ' · ' + me.hd.title, right: '패시브: ' + p.name, body: [p.desc(me), '공격력 ' + Math.round(me.ad) + ' · 주문력 ' + Math.round(me.ap) + ' · 방어력 ' + Math.round(me.def) + ' · 공격 속도 ' + me.as.toFixed(2) + ' · 이동 ' + me.ms.toFixed(1)], color: col }; }
    // 체력 띠. 맞으면: 띠가 흔들리고(떨림은 0.2초 안에 잦아든다) · 테두리가 붉게 번쩍 · 깎인 만큼은 잠깐 하얗다가 살구빛으로 남아 줄어든다
    const hk = UI.hurtK || 0; if (hk > 0) UI.hurtK = Math.max(0, hk - UI.dt * 5);
    const hx = 168 + (hk > 0.02 ? Math.cos(UI.t * 95) * 6 * hk : 0), hy = yb - 112 + (hk > 0.02 ? Math.sin(UI.t * 71) * 3 * hk : 0), hw = 348, hh = 26, frac = me.dead ? 0 : me.hp / me.maxHp;
    if (!(UI.meLag >= 0) || me.dead || me.hp >= UI.meLag) UI.meLag = me.dead ? 0 : me.hp;
    else if (UI.t - (UI.hurtAt || 0) > 0.25) UI.meLag = Math.max(me.hp, UI.meLag - Math.max(me.maxHp * 0.5, (UI.meLag - me.hp) * 3) * UI.dt);
    slab(ctx, hx - 4, hy - 4, hw + 8, hh + 8); ctx.fillStyle = 'rgba(4,6,18,0.92)'; ctx.fill();
    if (hk > 0.04) { ctx.strokeStyle = 'rgba(255,72,92,' + Math.min(1, hk * 1.2).toFixed(3) + ')'; ctx.lineWidth = 2 + 3 * hk; ctx.stroke(); }
    { const lf = UI.meLag / me.maxHp; if (lf > frac + 0.002) { slab(ctx, hx, hy, Math.max(6, hw * Math.min(1, lf)), hh); ctx.fillStyle = UI.t - (UI.hurtAt || 0) < 0.08 ? '#ffffff' : 'rgba(255,196,150,0.95)'; ctx.fill(); } }
    if (frac > 0) { const gg = ctx.createLinearGradient(0, hy, 0, hy + hh); gg.addColorStop(0, frac < 0.3 ? '#ff97a2' : '#b4ffd0'); gg.addColorStop(1, frac < 0.3 ? '#e03a52' : '#2fbf7c'); slab(ctx, hx, hy, Math.max(6, hw * frac), hh); ctx.fillStyle = gg; ctx.fill(); }
    if (me.shield > 0 && !me.dead) { const sw = Math.min(hw, hw * me.shield / me.maxHp); slab(ctx, Math.min(hx + hw * frac, hx + hw - sw), hy, sw, hh); ctx.fillStyle = 'rgba(234,246,255,0.92)'; ctx.fill(); }
    ctx.strokeStyle = 'rgba(4,6,18,0.4)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let hp = 250; hp < me.maxHp; hp += 250) { const tx = hx + hw * hp / me.maxHp, th = hh * (hp % 1000 === 0 ? 1 : 0.5), k = hh * 0.22; ctx.moveTo(tx + k, hy); ctx.lineTo(tx + k - th / hh * 2 * k, hy + th); }
    ctx.stroke();
    X.text(ctx, Math.ceil(me.dead ? 0 : me.hp) + ' / ' + Math.round(me.maxHp) + (me.shield > 0 ? '  (+' + Math.round(me.shield) + ')' : ''), hx + hw / 2, hy + hh / 2 + 1, 15, '#ffffff', 'center', 900, 'rgba(4,6,18,0.8)', 3.5);
    // 전적 한 줄
    const ky = hy + hh + 26;
    X.text(ctx, me.kills + ' / ' + me.deaths + ' / ' + me.assists, hx - 2, ky, 17, '#ffffff', 'left', 900, INK, 4);
    X.text(ctx, '처치 / 죽음 / 도움', hx + 78, ky + 1, 11.5, COL.dim, 'left', 600, INK, 3);
    X.text(ctx, '막타 ' + me.cs, hx + 196, ky, 15, '#ffe2a6', 'left', 800, INK, 4);
    const c = UI.combo;
    if (c.n >= 2 && G.t - c.t < 6) { const pop = 1 + 0.5 * Math.max(0, 1 - (UI.t - c.pop) / 0.2); X.text(ctx, '연속 ×' + c.n, hx + 266, ky, 16 * pop, COL.gold, 'left', 900, INK, 4); }
    // 버프 줄 (체력 띠 위)
    let bx = hx + 4; const byy = hy - 26;
    for (const b of me.buffs) {
      let icon = null, bc = '#ffffff';
      if (b.camp) { icon = b.camp; bc = b.color; } else if (b.id === 'heat') { icon = 'heat'; bc = '#ffb46a'; } else if (b.id === 'flow') { icon = 'flow'; bc = '#8fe8f0'; } else if (b.shield > 0) { icon = 'bark'; bc = '#eaf6ff'; } else if (b.id === 'dawn') { icon = 'dawn'; bc = '#fff0b0'; } else if (b.id === 'homeguard') { icon = 'boots'; bc = tc; } else if (b.id === 'triple') { icon = 'barrage'; bc = '#ffd27a'; }
      if (!icon) continue;
      Art.iconButton(ctx, icon, bx + 14, byy, 14, bc, 1); ring(ctx, bx + 14, byy, 15.5, 2, 1 - b.t / b.dur, bc, 'rgba(255,255,255,0.15)');
      if (b.stacks) chip(ctx, String(b.stacks), bx + 26, byy + 11, 10.5, '#0b0d22', bc, 4);
      if (b.camp && Math.hypot(UI.mx - bx - 14, UI.my - byy) < 15) UI.hoverTip = { x: bx + 14, y: byy - 20, title: TW.BUFFS[b.camp].name, right: Math.ceil(b.dur - b.t) + '초', body: [TW.BUFFS[b.camp].text], color: bc };
      bx += 37;
    }
    if (me.heroId === 'geumeum' && me.st.ambush && !me.dead) { chip(ctx, '기습 준비', bx + 42, byy, 12.5, '#0b0d22', '#cfd6ff'); }
  }
  /* 오른쪽 위: 골드 · 다음 아이템 · 가진 아이템 · 메뉴 단추 */
  function drawPurse(ctx, G, me) {
    const w = 318, x = UI.W - w - 66, y = 12, h = 60;
    X.rr(ctx, x, y, w, h, 16); ctx.fillStyle = 'rgba(8,11,30,0.84)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,216,74,0.3)'; ctx.lineWidth = 1; ctx.stroke(); UI.block(x, y, w, h);
    Art.icon(ctx, 'gold', x + 24, y + 30, 12, COL.gold);
    X.text(ctx, String(Math.floor(me.gold)), x + 42, y + 31, 24, COL.gold, 'left', 900);
    // 다음 추천 아이템 (누르면 산다)
    const nb = TW.nextBuy(me), nx = x + 118, nw = w - 126;
    if (nb) {
      const it = TW.Items[nb.id], can = me.gold >= nb.cost, hot = UI.over(nx, y + 7, nw, h - 14);
      X.rr(ctx, nx, y + 7, nw, h - 14, 11); ctx.fillStyle = hot ? 'rgba(70,70,132,0.85)' : 'rgba(24,28,62,0.9)'; ctx.fill();
      if (can) { ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.5 + Math.sin(UI.t * 6) * 0.6; ctx.stroke(); }
      Art.iconButton(ctx, it.icon, nx + 23, y + 30, 16, it.color, 1);
      X.text(ctx, it.name + ' ' + nb.tier + '단계', nx + 46, y + 23, 13, COL.text, 'left', 700);
      X.rr(ctx, nx + 46, y + 35, nw - 104, 6, 3); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
      X.rr(ctx, nx + 46, y + 35, (nw - 104) * U.clamp(me.gold / nb.cost, 0.03, 1), 6, 3); ctx.fillStyle = can ? COL.gold : '#a48a3a'; ctx.fill();
      X.text(ctx, String(nb.cost), nx + nw - 10, y + 31, 14.5, can ? COL.gold : COL.dim, 'right', 800);
      if (hot) { UI.cursor = 'pointer'; UI.hoverTip = { x: nx + nw / 2, y: y + h + 150, title: it.name + ' ' + nb.tier + '단계', right: nb.cost + ' 골드', body: [it.descAt(nb.tier)].concat(nb.tier === 3 ? ['3단계 효과: ' + it.ptext] : []), color: it.color, foot: can ? '눌러서 구매' : '골드가 모이면 살 수 있습니다' }; if (UI.hit(nx, y + 7, nw, h - 14, 0) && UI.on.buy) UI.on.buy(nb.id); }
    } else X.text(ctx, '아이템을 모두 갖췄습니다', nx + nw / 2, y + 31, 13, COL.dim, 'center', 600);
    // 가진 아이템(단계 점) + 상점
    let ix = x + 20; const iy = y + h + 20;
    { let n = 0; for (const id of TW.ItemOrder) if (me.items[id]) n++; if (n) { X.rr(ctx, x, iy - 16, n * 35 + 12, 38, 19); ctx.fillStyle = 'rgba(8,11,30,0.72)'; ctx.fill(); } }
    for (const id of TW.ItemOrder) { const tier = me.items[id] || 0; if (!tier) continue; const it = TW.Items[id]; Art.iconButton(ctx, it.icon, ix, iy + 2, 14, it.color, 1); X.text(ctx, String(tier), ix + 11, iy + 12, 11, '#ffffff', 'center', 900, 'rgba(4,6,18,0.95)', 3); ix += 35; }
    if (UI.button(ctx, UI.shopOpen ? '닫기' : '상점 P', x + w - 78, y + h + 8, 78, 26, { px: 12.5, r: 13 })) { UI.shopOpen = !UI.shopOpen; if (UI.on.click) UI.on.click(); }
    // 메뉴(멈춤) 단추 하나: 소리·조작법은 그 안에 있다
    const mx = UI.W - 36, my = y + 30, hot = Math.hypot(UI.mx - mx, UI.my - my) < 22;
    UI.zoneC(mx, my, 23);
    // 살 수 있는데 자동 구매가 꺼져 있으면: 몇 개를 한 번에 살 수 있는지 바로 아래에 알려 준다
    if (nb && me.gold >= nb.cost && !UI.autoBuy) {
      const n = TW.affordPlan(me).list.length, pk = 0.5 + 0.5 * Math.sin(UI.t * 6);
      ctx.globalAlpha = 0.75 + 0.25 * pk;
      chip(ctx, '살 수 있어요 ' + n + '개 — V 한 번에 사기', x + w / 2 - 44, y + h + 50, 12.5, '#0b0d22', COL.gold, 10);
      ctx.globalAlpha = 1;
    }
    X.circle(ctx, mx, my, 22); ctx.fillStyle = hot ? 'rgba(70,70,132,0.9)' : 'rgba(8,11,30,0.84)'; ctx.fill(); ctx.strokeStyle = 'rgba(190,196,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = hot ? '#ffffff' : '#c9cdf0'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); for (let k = -1; k <= 1; k++) { ctx.moveTo(mx - 9, my + k * 7); ctx.lineTo(mx + 9, my + k * 7); } ctx.stroke(); ctx.lineCap = 'butt';
    if (hot) { UI.captured = true; UI.cursor = 'pointer'; UI.hoverTip = { x: mx - 60, y: my + 190, title: '메뉴 (ESC)', body: ['멈춤 · 소리 · 조작법 · 나가기'], w: 220 }; for (const c of UI.clicks) if (!c.used && Math.hypot(c.x - mx, c.y - my) < 22) { c.used = true; if (UI.on.pause) UI.on.pause(); } }
  }
  UI.menuBtn = () => ({ x: UI.W - 36, y: 42 });
  function drawTop(ctx, G, me) {
    const cx = UI.W / 2, myTeam = me ? me.team : 0;
    // 시계 판 + 양옆 처치 수 판
    slab(ctx, cx - 58, 10, 116, 40, 0); ctx.fillStyle = 'rgba(8,11,30,0.9)'; ctx.fill();
    X.text(ctx, U.fmtTime(G.t), cx, 31, 22, COL.text, 'center', 900);
    let gold0 = 0, gold1 = 0; for (const h of G.heroes) { if (h.team) gold1 += h.stats.gold; else gold0 += h.stats.gold; }
    for (let tm = 0; tm < 2; tm++) {
      const sx = tm === 0 ? -1 : 1, col = C.TEAM_COL[tm];
      ctx.beginPath();
      if (tm === 0) { ctx.moveTo(cx - 132, 10); ctx.lineTo(cx - 62, 10); ctx.lineTo(cx - 62, 50); ctx.lineTo(cx - 118, 50); } else { ctx.moveTo(cx + 132, 10); ctx.lineTo(cx + 62, 10); ctx.lineTo(cx + 62, 50); ctx.lineTo(cx + 118, 50); }
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
      X.text(ctx, String(G.teams[tm].kills), cx + sx * 92, 31, 27, '#141024', 'center', 900);
      X.text(ctx, C.TEAM_NAMES[tm], cx + sx * 92, 62, 11.5, C.TEAM_LIGHT[tm], 'center', 800, INK, 3);
      // 영웅 줄
      const hs = G.heroes.filter(h => h.team === tm);
      for (let i = 0; i < 5; i++) {
        const h = hs[i], x = cx + sx * (172 + i * 45), y = 32;
        portrait(ctx, h.heroId, x, y, 19, h === me ? '#ffffff' : col, h.dead);
        if (h.dead) X.text(ctx, String(Math.ceil(h.respawnT)), x, y + 1, 15, '#ffffff', 'center', 900, 'rgba(4,6,18,0.9)');
        else { const fr = (tm === myTeam || h.seen[myTeam]) ? h.hp / h.maxHp : -1; if (fr >= 0) { X.rr(ctx, x - 17, y + 22, 34, 4, 2); ctx.fillStyle = 'rgba(4,6,18,0.8)'; ctx.fill(); X.rr(ctx, x - 17, y + 22, Math.max(2, 34 * fr), 4, 2); ctx.fillStyle = fr < 0.3 ? COL.bad : col; ctx.fill(); } }
        if (tm === myTeam && h.ultReady() && h.cds[3] <= 0 && !h.dead) { X.circle(ctx, x + 15, y - 15, 4); ctx.fillStyle = h.hd.glow; ctx.fill(); }
      }
    }
    // 세력 띠: 두 진영이 번 골드의 비율 (어느 쪽이 앞서는지 한눈에)
    const share = U.clamp(gold0 / Math.max(1, gold0 + gold1), 0.15, 0.85), bw = 116, bx = cx - bw / 2;
    ctx.fillStyle = C.TEAM_COL[1]; ctx.fillRect(bx, 52, bw, 5); ctx.fillStyle = C.TEAM_COL[0]; ctx.fillRect(bx, 52, bw * share, 5);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bx + bw * share - 1.5, 50, 3, 9);
    // 이무기 버프 남은 시간
    for (let tm = 0; tm < 2; tm++) if (G.teams[tm].bossUntil > G.t) { const sx = tm === 0 ? -1 : 1; chip(ctx, '이무기의 기운 ' + Math.ceil(G.teams[tm].bossUntil - G.t), cx + sx * 262, 72, 11.5, '#0b0d22', '#7dffd9'); }
  }
  function drawFeed(ctx, G, me) {
    let y = 122; const xr = UI.W - 16;
    for (let i = 0; i < UI.feed.length; i++) {
      const f = UI.feed[i]; f.t += UI.dt;
      const life = f.kind === 'say' ? 5.5 : 7; if (f.t > life) { UI.feed.splice(i, 1); i--; continue; }
      const a = Math.min(1, f.t / 0.18) * Math.min(1, (life - f.t) / 0.5), slide = (1 - U.easeOut3(Math.min(1, f.t / 0.22))) * 60;
      ctx.globalAlpha = a;
      if (f.kind === 'kill') {
        const n = f.assists.length, w = 150 + n * 24, x = xr - w + slide, kc = f.killer ? C.TEAM_COL[f.killer.team] : '#c9cde0';
        X.rr(ctx, x, y, w, 40, 20); ctx.fillStyle = (f.killer === me || f.victim === me) ? 'rgba(60,50,20,0.9)' : 'rgba(8,11,30,0.86)'; ctx.fill(); ctx.strokeStyle = kc; ctx.lineWidth = 1.5; ctx.stroke();
        if (f.killer) portrait(ctx, f.killer.heroId, x + 22, y + 20, 16, kc); else Art.iconButton(ctx, f.by && f.by.isStruct ? 'tower' : 'skull', x + 22, y + 20, 16, '#c9cde0', 1);
        for (let k = 0; k < n; k++) portrait(ctx, f.assists[k].heroId, x + 50 + k * 24, y + 20, 10, C.TEAM_COL[f.assists[k].team]);
        Art.icon(ctx, 'sword', x + w - 68, y + 20, 9, '#ffffff');
        portrait(ctx, f.victim.heroId, x + w - 24, y + 20, 16, C.TEAM_COL[f.victim.team], true);
        ctx.strokeStyle = COL.bad; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + w - 35, y + 9); ctx.lineTo(x + w - 13, y + 31); ctx.stroke();
        y += 46;
      } else if (f.kind === 'tower' || f.kind === 'obj') {
        const str = f.kind === 'tower' ? C.TEAM_NAMES[f.team] + ' — ' + (f.tower.tier === 2 ? '안쪽' : '바깥') + ' 등불탑 파괴' : C.TEAM_NAMES[f.team] + ' — ' + f.text;
        const w = X.textW(ctx, str, 13, 700) + 54, x = xr - w + slide, col = C.TEAM_COL[f.team];
        X.rr(ctx, x, y, w, 32, 16); ctx.fillStyle = 'rgba(8,11,30,0.86)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
        Art.icon(ctx, f.kind === 'tower' ? 'tower' : 'boss', x + 20, y + 16, 9, col); X.text(ctx, str, x + 38, y + 17, 13, COL.text, 'left', 700);
        y += 38;
      } else {
        const str = f.text, w = X.textW(ctx, str, 13.5, 600) + 62, x = xr - w + slide, col = f.tone === 'warn' ? COL.bad : f.tone === 'go' ? COL.gold : '#bfeaff';
        X.rr(ctx, x, y, w, 34, 17); ctx.fillStyle = 'rgba(8,11,30,0.86)'; ctx.fill();
        portrait(ctx, f.u.heroId, x + 18, y + 17, 13, col); X.text(ctx, str, x + 40, y + 18, 13.5, col, 'left', 600);
        y += 40;
      }
      ctx.globalAlpha = 1;
    }
  }
  /* ① 처치 알림 — 화면 위 가운데. 별 다섯 칸 중 연속 수만큼 불이 켜진다 */
  function drawKillCall(ctx) {
    const c = UI.kc; if (!c) return false;
    c.t += UI.dt; if (c.t > c.dur) { UI.kc = null; return false; }
    const cx = UI.W / 2, y = 190, inK = U.easeBack(Math.min(1, c.t / 0.2)), a = Math.min(1, c.t / 0.05) * Math.min(1, (c.dur - c.t) / 0.4);
    const px = (c.mine ? 36 + 4.5 * (c.n - 1) : 30 + 3 * (c.n - 1)) * (1.4 - 0.4 * inK);        // 연속이 길수록 크게 (36 → 54px), 뜰 때 1.4배에서 내려앉는다
    ctx.globalAlpha = a;
    const sw = Math.max(c.sub ? X.textW(ctx, c.sub, 16, 700) : 0, c.how ? X.textW(ctx, c.how, 15, 700) : 0), w = Math.max(X.textW(ctx, c.title, px, 900), sw) + 150, h = 56 + (c.sub ? 26 : 0) + (c.how ? 24 : 0);
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, 'rgba(6,9,24,0)'); g.addColorStop(0.18, 'rgba(6,9,24,0.86)'); g.addColorStop(0.82, 'rgba(6,9,24,0.86)'); g.addColorStop(1, 'rgba(6,9,24,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - w / 2 - 50, y - 44, w + 100, h + 4);
    const sweep = U.easeOut3(Math.min(1, c.t / 0.3));
    ctx.fillStyle = c.col; ctx.globalAlpha = a * 0.95; ctx.fillRect(cx - w * 0.45 * sweep, y - 45, w * 0.9 * sweep, 2.5); ctx.fillRect(cx - w * 0.45 * sweep, y + h - 42, w * 0.9 * sweep, 2.5);
    ctx.globalAlpha = a;
    for (let i = 0; i < 5; i++) {
      const lit = i < c.n, pop = lit && i === c.n - 1 ? 1 + 0.7 * Math.max(0, 1 - c.t / 0.25) : 1;
      X.star(ctx, cx - 48 + i * 24, y - 60, (lit ? 9.5 : 6.5) * pop, 5, 0.45, -Math.PI / 2); ctx.fillStyle = lit ? c.col : 'rgba(150,156,200,0.35)'; ctx.fill();
      if (lit) { ctx.strokeStyle = 'rgba(4,6,18,0.9)'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    if (c.a) portrait(ctx, c.a.heroId, cx - w / 2 + 40, y + 4, 28, C.TEAM_COL[c.a.team]);
    if (c.b) { const bx = cx + w / 2 - 40; portrait(ctx, c.b.heroId, bx, y + 4, 28, C.TEAM_COL[c.b.team], true); ctx.strokeStyle = COL.bad; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx - 16, y - 12); ctx.lineTo(bx + 16, y + 20); ctx.stroke(); }
    X.text(ctx, c.title, cx, y - 10, px, c.col, 'center', 900, 'rgba(4,6,18,0.95)', px * 0.16);
    if (c.t < 0.18) { ctx.globalAlpha = a * (1 - c.t / 0.18); X.text(ctx, c.title, cx, y - 10, px, '#ffffff', 'center', 900); ctx.globalAlpha = a; }
    let ly = y + 24;
    if (c.sub) { X.text(ctx, c.sub, cx, ly, 16, '#eef0ff', 'center', 700, 'rgba(4,6,18,0.9)', 3); ly += 25; }
    if (c.how) X.text(ctx, c.how, cx, ly, 15, c.mine ? '#ffe9a8' : '#d8dcf4', 'center', 700, 'rgba(4,6,18,0.9)', 3);
    ctx.globalAlpha = 1;
    return true;
  }
  /* ② 처치 쪽지 — 내가 잡았을 때: 누가 → 누구를, 무엇으로 마무리, 내가 준 피해와 갈래, 걸린 시간, 도움, 골드 */
  function drawKillCard(ctx, G, me) {
    const c = UI.kcard; if (!c) return false;
    if (me.dead) { UI.kcard = null; return false; }          // 잡고 곧 쓰러졌으면 버린다 (부활한 뒤에 지난 쪽지가 다시 뜨지 않게)
    c.t += UI.dt; if (c.t > c.dur) { UI.kcard = null; return false; }
    const w = 336, y = 252, h = 158 + (c.assists.length ? 24 : 0);
    const a = Math.min(1, c.t / 0.2) * Math.min(1, (c.dur - c.t) / 0.5), x = 16 - (1 - U.easeOut3(Math.min(1, c.t / 0.3))) * 60, grow = U.easeOut3(Math.min(1, c.t / 0.6));
    ctx.globalAlpha = a;
    X.rr(ctx, x, y, w, h, 16); ctx.fillStyle = 'rgba(8,9,26,0.93)'; ctx.fill(); ctx.strokeStyle = U.rgba(COL.gold, 0.5); ctx.lineWidth = 1.2; ctx.stroke();
    X.rr(ctx, x, y, 6, h, 3); ctx.fillStyle = COL.gold; ctx.fill();
    X.text(ctx, c.n >= 2 ? KC_TITLE[c.n].replace('!', '') : c.first ? '첫 처치' : '처치', x + 20, y + 19, 13, COL.gold, 'left', 900);
    X.text(ctx, '+' + c.gold + ' 골드', x + w - 16, y + 19, 13.5, COL.gold, 'right', 900);
    // 누가 → 누구를
    portrait(ctx, me.heroId, x + 42, y + 54, 21, C.TEAM_COL[me.team]);
    X.text(ctx, me.name, x + 70, y + 54, 16, '#ffffff', 'left', 900);
    portrait(ctx, c.v.heroId, x + w - 40, y + 54, 21, C.TEAM_COL[c.v.team], true);
    ctx.strokeStyle = COL.bad; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + w - 53, y + 41); ctx.lineTo(x + w - 27, y + 67); ctx.stroke();
    X.text(ctx, c.v.name, x + w - 70, y + 54, 16, '#ffd0d6', 'right', 900);
    { const ax = x + 70 + X.textW(ctx, me.name, 16, 900) + 12, bx = x + w - 70 - X.textW(ctx, c.v.name, 16, 900) - 12; if (bx - ax > 24) { ctx.strokeStyle = COL.gold; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ax, y + 54); ctx.lineTo(bx, y + 54); ctx.moveTo(bx - 8, y + 48); ctx.lineTo(bx, y + 54); ctx.lineTo(bx - 8, y + 60); ctx.stroke(); } }
    // 무엇으로 마무리
    let ly = y + 90;
    if (c.blow) {
      const bi = abInfo(me, c.blow.ab); let tx = x + 20;
      X.text(ctx, '마지막 일격', tx, ly, 12, COL.dim, 'left', 800); tx += 74;
      if (bi) { keycap(ctx, bi.key, tx + 9, ly, 12, true); tx += 24; }
      X.text(ctx, c.blow.ab + (c.blow.a > 0 ? ' · ' + Math.round(c.blow.a) : ''), tx, ly, 14, '#ffe9a8', 'left', 900);
    }
    // 내가 준 피해: 띠 (내 스킬 갈래 = 금빛 계열 · 다른 이 = 잿빛) + 숫자
    ly += 24;
    X.text(ctx, '내가 준 피해 ' + Math.round(c.my) + ' (' + Math.round(c.my / c.total * 100) + '%)' + (c.span > 0.05 ? ' · ' + c.span.toFixed(1) + '초' : ''), x + 20, ly, 12.5, '#eef0ff', 'left', 800);
    ly += 13;
    const bx = x + 20, bw = w - 40, PC = ['#ffd84a', '#ffb347', '#ff8a5c'];
    X.rr(ctx, bx, ly, bw, 10, 5); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
    let sx = bx;
    for (let i = 0; i < c.parts.length; i++) { const pw = bw * c.parts[i].a / c.total * grow; ctx.fillStyle = PC[i % 3]; ctx.fillRect(sx, ly, Math.max(1, pw - 2), 10); sx += pw; }
    for (const o of c.others) { const pw = bw * o.total / c.total * grow; ctx.fillStyle = o.heroId ? U.rgba(TW.Heroes[o.heroId].glow, 0.55) : 'rgba(184,190,220,0.45)'; ctx.fillRect(sx, ly, Math.max(1, pw - 2), 10); sx += pw; }
    ly += 24;
    { let tx = bx; for (let i = 0; i < c.parts.length && i < 3; i++) { const p = c.parts[i], str = p.ab + ' ' + Math.round(p.a); ctx.fillStyle = PC[i % 3]; ctx.fillRect(tx, ly - 5, 8, 8); X.text(ctx, str, tx + 12, ly, 11.5, '#d8dcf4', 'left', 700); tx += X.textW(ctx, str, 11.5, 700) + 26; if (tx > x + w - 40) break; } }
    if (c.assists.length) {
      ly += 24; X.text(ctx, '함께', x + 20, ly, 12, COL.dim, 'left', 800);
      let tx = x + 60; for (const as of c.assists) { portrait(ctx, as.heroId, tx + 9, ly, 9, C.TEAM_COL[as.team]); X.text(ctx, as.name, tx + 22, ly, 12, COL.good, 'left', 800); tx += 34 + X.textW(ctx, as.name, 12, 800); }
    }
    ctx.globalAlpha = 1;
    return true;
  }
  /* ③ 렌즈: 마지막 한 방의 순간 (실제 시간) */
  function drawLens(ctx) {
    const L = W.lens; if (!L) return;
    L.t += UI.dt; if (L.t > L.dur) { W.lens = null; return; }
    const k = L.t / L.dur, a = Math.min(1, L.t / 0.05) * Math.pow(1 - k, 1.4) * (0.85 + 0.03 * L.n);
    const cx = UI.W / 2, cy = UI.H / 2, g = ctx.createRadialGradient(cx, cy, Math.min(UI.W, UI.H) * 0.3, cx, cy, Math.hypot(UI.W, UI.H) * 0.56);
    g.addColorStop(0, 'rgba(4,6,18,0)'); g.addColorStop(0.5, U.rgba(L.col, 0.12 * a)); g.addColorStop(1, 'rgba(4,6,18,' + (0.6 * a).toFixed(3) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, UI.W, UI.H);
  }
  function drawBanner(ctx) {
    if (drawKillCall(ctx)) return;          // 처치 알림이 떠 있는 동안 다른 배너는 기다린다 (겹치지 않게)
    let b = UI.banner;
    if (!b && UI.banners.length) { b = UI.banner = UI.banners.shift(); b.t = 0; if (UI.on.banner) UI.on.banner(b); }
    if (!b) return;
    b.t += UI.dt;
    if (b.t > b.dur || (UI.banners.length && b.t > 1.2)) { UI.banner = null; return; }
    const cx = UI.W / 2, y = b.small ? 172 : 190, inK = U.easeBack(Math.min(1, b.t / 0.22)), a = Math.min(1, b.t / 0.1) * Math.min(1, (b.dur - b.t) / 0.35);
    const px = (b.big ? 48 : b.small ? 28 : 36) * (0.6 + 0.4 * inK);
    ctx.globalAlpha = a;
    const w = Math.max(X.textW(ctx, b.text, px, 900), b.sub ? X.textW(ctx, b.sub, 15, 600) : 0) + (b.a ? 130 : 70);
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, 'rgba(6,9,24,0)'); g.addColorStop(0.2, 'rgba(6,9,24,0.84)'); g.addColorStop(0.8, 'rgba(6,9,24,0.84)'); g.addColorStop(1, 'rgba(6,9,24,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - w / 2 - 60, y - 40, w + 120, b.sub ? 86 : 64);
    ctx.fillStyle = b.color; ctx.globalAlpha = a * 0.9; ctx.fillRect(cx - w * 0.42 * inK, y - 41, w * 0.84 * inK, 2); ctx.fillRect(cx - w * 0.42 * inK, y + (b.sub ? 45 : 23), w * 0.84 * inK, 2);
    ctx.globalAlpha = a;
    if (b.a) portrait(ctx, b.a.heroId, cx - w / 2 + 34, y + (b.sub ? 4 : -8), 26, C.TEAM_COL[b.a.team]);
    if (b.b) { portrait(ctx, b.b.heroId, cx + w / 2 - 34, y + (b.sub ? 4 : -8), 26, C.TEAM_COL[b.b.team], true); }
    X.text(ctx, b.text, cx, y - 8, px, b.color, 'center', 900, 'rgba(4,6,18,0.95)', px * 0.16);
    if (b.t < 0.25) { ctx.globalAlpha = a * (1 - b.t / 0.25); X.text(ctx, b.text, cx, y - 8, px, '#ffffff', 'center', 900); ctx.globalAlpha = a; }
    if (b.sub) X.text(ctx, b.sub, cx, y + 26, 15, '#e8ecff', 'center', 600, 'rgba(4,6,18,0.9)', 3);
    if (b.multi) for (let i = 0; i < b.multi; i++) { X.star(ctx, cx - (b.multi - 1) * 13 + i * 26, y - 54, 9, 5, 0.45, -Math.PI / 2); ctx.fillStyle = b.color; ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  /* 쓰러졌을 때(지도 아래 쪽지): 누가, 무엇으로, 얼마나. 받은 피해를 한 줄 띠로 나눠 보여 준다 */
  function drawRecap(ctx, G, me) {
    const rc = UI.recap; if (!rc || !me.dead) return;
    rc.t += UI.dt;
    const r = rc.r, src = r.sources.slice(0, 4), w = 336, h = 168 + src.length * 40, y = 252;
    const a = Math.min(1, rc.t / 0.3), x = 16 - (1 - U.easeOut3(Math.min(1, rc.t / 0.35))) * 60, grow = U.easeOut3(Math.min(1, rc.t / 0.6));
    ctx.globalAlpha = a;
    X.rr(ctx, x, y, w, h, 16); ctx.fillStyle = 'rgba(8,9,26,0.96)'; ctx.fill(); UI.block(x, y, w, h);
    X.rr(ctx, x, y, 6, h, 3); ctx.fillStyle = COL.bad; ctx.fill();
    // 화면 한가운데 위: 부활까지 남은 시간 (고리가 줄어든다)
    { const want = (UI.kc || UI.banner || UI.banners.length) ? 340 : 236; UI.ringY = rc.t < 0.05 || !(UI.ringY > 0) ? want : UI.ringY + (want - UI.ringY) * Math.min(1, UI.dt * 10);      // 처치 알림·배너(예: 적의 '첫 처치!')가 떠 있으면 그 아래로 미끄러진다 — 예전엔 배너가 부활 고리를 덮었다
      const cx = UI.W / 2, cy = UI.ringY, fr = me.respawnMax > 0 ? me.respawnT / me.respawnMax : 0;
      X.circle(ctx, cx, cy, 50); ctx.fillStyle = 'rgba(8,9,26,0.84)'; ctx.fill();
      ring(ctx, cx, cy, 44, 6, fr, '#ffe2a6', 'rgba(255,255,255,0.14)');
      X.text(ctx, String(Math.ceil(me.respawnT)), cx, cy - 2, 40, '#ffffff', 'center', 900);
      X.text(ctx, '부활', cx, cy + 27, 11.5, '#ffe2a6', 'center', 800); }
    const k = r.killer;
    if (k) portrait(ctx, k.heroId, x + 52, y + 50, 34, C.TEAM_COL[k.team]); else Art.iconButton(ctx, r.blow && r.blow.type === 'tower' ? 'tower' : 'skull', x + 52, y + 50, 34, COL.bad, 1);
    X.text(ctx, '쓰러뜨린 자', x + 100, y + 26, 11.5, COL.bad, 'left', 800);
    X.text(ctx, k ? k.name : (r.blow ? r.blow.who : '알 수 없음'), x + 100, y + 50, 24, '#ffffff', 'left', 900);
    if (r.blow) { const bi = abInfo(k, r.blow.ab); X.text(ctx, '마지막 일격 · ' + (bi ? bi.key + ' ' : '') + r.blow.ab + (r.blow.a > 0 ? ' ' + Math.round(r.blow.a) : ''), x + 100, y + 76, 12.5, '#ffb3bd', 'left', 700); }
    // 쓰러뜨린 영웅에게 남은 체력: 거의 잡을 뻔했는지 (7차)
    if (k && r.killerHp >= 0) { const p = Math.max(1, Math.round(r.killerHp * 100)); chip(ctx, k.name + ' 체력 ' + p + '% 남음', x + w - 16 - X.textW(ctx, k.name + ' 체력 ' + p + '% 남음', 11.5, 800) / 2 - 8, y + 24, 11.5, '#0b0d22', p <= 25 ? COL.gold : '#ffb3bd'); }
    // 띠: 출처별 비율
    const bx = x + 20, bw = w - 40, by = y + 104, tot = Math.max(1, r.total);
    X.text(ctx, '받은 피해 ' + Math.round(r.total) + (r.span > 0.05 ? ' · ' + r.span.toFixed(1) + '초 동안' : ''), bx, by - 10, 11.5, COL.dim, 'left', 700);
    X.rr(ctx, bx, by, bw, 12, 6); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
    let sx = bx; const cols = [];
    for (let i = 0; i < r.sources.length; i++) { const s = r.sources[i], col = s.heroId ? TW.Heroes[s.heroId].glow : s.type === 'tower' ? '#ffe2a6' : '#b8bedc', sw = bw * s.total / tot * grow; cols.push(col); ctx.fillStyle = col; ctx.fillRect(sx, by, Math.max(1, sw - 2), 12); sx += sw; }
    // 출처 줄
    let ry = by + 30;
    for (let i = 0; i < src.length; i++) {
      const s = src[i], top = s.parts[0];
      ctx.fillStyle = cols[i]; ctx.fillRect(bx, ry - 12, 4, 26);
      if (s.heroId) portrait(ctx, s.heroId, bx + 26, ry + 1, 14, null); else Art.iconButton(ctx, s.type === 'tower' ? 'tower' : s.type === 'minion' ? 'sword' : 'skull', bx + 26, ry + 1, 14, '#c9cde0', 1);
      X.text(ctx, s.name || '기타', bx + 48, ry - 6, 13.5, COL.text, 'left', 800);
      X.text(ctx, top ? top.ab + ' ' + Math.round(top.a) + (s.parts.length > 1 ? '  외 ' + (s.parts.length - 1) : '') : '', bx + 48, ry + 10, 11.5, COL.dim, 'left', 500);
      X.text(ctx, String(Math.round(s.total)), x + w - 20, ry + 1, 16, '#ffffff', 'right', 900);
      ry += 40;
    }
    X.text(ctx, '부활까지 ' + Math.ceil(me.respawnT) + '초' + (me.deaths >= 2 ? ' · 쓰러질수록 길어집니다' : ''), x + 20, y + h - 18, 12.5, '#ffe2a6', 'left', 700);
    ctx.globalAlpha = 1;
  }
  /* 지도: 왼쪽 위. 왼쪽 단추 = 화면 이동, 오른쪽 단추 = 그곳으로 걸어간다 */
  UI.mmRect = function () { const mw = 292; return { x: 16, y: 16, w: mw, h: Math.round(mw * C.H / C.W), s: mw / C.W }; };
  function drawMinimap(ctx, G, me) {
    const R = UI.mmRect(), mw = R.w, mh = R.h, x = R.x, y = R.y, s = R.s, team = me ? me.team : -1;
    if (!UI.mmBase || UI.mmBase._us !== UI.us) { UI.mmBase = W.minimapBase(Math.round(mw * UI.us * 1.5), Math.round(mh * UI.us * 1.5)); UI.mmBase._us = UI.us; }
    ctx.save(); X.rr(ctx, x, y, mw, mh, 18); ctx.clip();
    ctx.drawImage(UI.mmBase, x, y, mw, mh);
    // 안개
    if (team >= 0) {
      UI.mmFogT -= UI.dt;
      if (!UI.mmFog) { UI.mmFog = X.canvas(W.FW, W.FH); UI.mmFogImg = UI.mmFog.getContext('2d').createImageData(W.FW, W.FH); }
      if (UI.mmFogT <= 0) { UI.mmFogT = 0.25; const d = UI.mmFogImg.data, f = W.fogData(); for (let i = 0, j = 0; i < f.length; i++, j += 4) { d[j] = 3; d[j + 1] = 6; d[j + 2] = 18; d[j + 3] = (1 - f[i]) * 150; } UI.mmFog.getContext('2d').putImageData(UI.mmFogImg, 0, 0); }
      ctx.imageSmoothingEnabled = true; ctx.drawImage(UI.mmFog, x, y, mw, mh);
    }
    ctx.restore();
    X.rr(ctx, x, y, mw, mh, 18); ctx.strokeStyle = 'rgba(200,210,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    const px = (wx) => x + wx * s, py = (wy) => y + wy * s;
    for (const c of G.camps) {
      const alive = c.alive.length > 0, col = c.kind === 'boss' ? '#7dffd9' : c.kind === 'elder' ? '#9fe07a' : c.kind === 'fire' ? '#ff9a50' : c.kind === 'water' ? '#6fd8ff' : '#e8dcc0';
      const big = c.kind === 'boss' || c.kind === 'elder', r = big ? 5.5 : (c.kind === 'fire' || c.kind === 'water') ? 3.8 : 2.5;
      ctx.globalAlpha = alive ? 1 : 0.28;
      if (big) { diamond(ctx, px(c.x), py(c.y), r + 1.5); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#0b0d22'; ctx.lineWidth = 1.2; ctx.stroke(); } else { X.circle(ctx, px(c.x), py(c.y), r); ctx.fillStyle = col; ctx.fill(); }
      ctx.globalAlpha = 1;
      // 강의 두 큰 몬스터: 다시 나올 때까지 남은 시간을 지도 위 제자리에 적는다
      if (big) { const left = c.nextT - G.t; if (alive) { const k = (UI.t * 0.8) % 1; ctx.globalAlpha = 1 - k; X.circle(ctx, px(c.x), py(c.y), 7 + k * 9); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1; } else if (left > 0) X.text(ctx, U.fmtTime(left), px(c.x) + 11, py(c.y) + 0.5, 11, col, 'left', 800, 'rgba(4,6,18,0.92)', 3); }
    }
    for (const st of G.structs) { if (st.dead) continue; const col = C.TEAM_COL[st.team]; if (st.kind === 'core') { X.circle(ctx, px(st.x), py(st.y), 6.5); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.stroke(); } else { X.rr(ctx, px(st.x) - 3, py(st.y) - 4.5, 6, 9, 2); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#0b0d22'; ctx.lineWidth = 1; ctx.stroke(); } }
    for (const m of G.minions) { if (team >= 0 && m.team !== team && !m.seen[team]) continue; ctx.fillStyle = C.TEAM_COL[m.team]; ctx.fillRect(px(m.x) - 1, py(m.y) - 1, 2, 2); }
    for (const w of G.wards) if (team < 0 || w.team === team) { X.circle(ctx, px(w.x), py(w.y), 2); ctx.fillStyle = '#fff0b0'; ctx.fill(); }
    for (const h of G.heroes) {
      if (h.dead) continue;
      if (team >= 0 && h.team !== team && !h.seen[team]) continue;
      portrait(ctx, h.heroId, px(h.x), py(h.y), h === me ? 9.5 : 8, h === me ? '#ffffff' : C.TEAM_COL[h.team]);
    }
    for (const p of W.pings) { const k = p.t % 1; ctx.globalAlpha = 1 - k; X.circle(ctx, px(p.x), py(p.y), 3 + k * 12); ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1; }
    // 집결 신호에 답한 아군: 오는 길을 점선으로 (누가 오고 있는지 지도에서 보인다)
    { const lr = TW.AI && TW.AI.lastRally; if (lr && G.t - lr.t < Math.min(14, lr.far + 3) && G.t >= lr.t) { ctx.strokeStyle = '#ffe680'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.lineDashOffset = -UI.t * 14; ctx.globalAlpha = 0.9; for (const h of lr.list) { if (h.dead) continue; ctx.beginPath(); ctx.moveTo(px(h.x), py(h.y)); ctx.lineTo(px(lr.x), py(lr.y)); ctx.stroke(); } ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1; } }
    // 지금 목표: 지도 위에서 깜빡이는 마름모
    { const ob = TW.Feel ? TW.Feel.pointer() : null; if (ob) { const k = (UI.t * 1.1) % 1; ctx.globalAlpha = 1 - k; diamond(ctx, px(ob.x), py(ob.y), 7 + k * 11); ctx.strokeStyle = ob.col; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1; diamond(ctx, px(ob.x), py(ob.y), 9.5); ctx.strokeStyle = ob.col; ctx.lineWidth = 2.2; ctx.stroke(); } }
    const v = W.view, vx0 = Math.max(0, v.x0), vy0 = Math.max(0, v.y0); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2; ctx.strokeRect(px(vx0), py(vy0), (Math.min(C.W, v.x1) - vx0) * s, (Math.min(C.H, v.y1) - vy0) * s);
    UI.block(x, y, mw, mh);
    if (UI.over(x, y, mw, mh)) {
      UI.captured = true;
      const wx = (UI.mx - x) / s, wy = (UI.my - y) / s;
      for (const c of UI.clicks) if (!c.used && c.x >= x && c.x <= x + mw && c.y >= y && c.y <= y + mh) { c.used = true; const cwx = (c.x - x) / s, cwy = (c.y - y) / s; if (c.b === 2) { if (UI.on.miniMove) UI.on.miniMove(cwx, cwy); } else { UI.mmDrag = true; if (UI.on.look) UI.on.look(cwx, cwy); } }      // 톡 치기만 해도 화면이 옮겨 간다
      if (UI.mmDrag && UI.down && UI.on.look) UI.on.look(wx, wy);
    }
    if (!UI.down) UI.mmDrag = false;
  }
  /* 지도 바로 아래: 급할 때(귀환·본진 막기)는 그것을, 평소에는 화면 위 '다음 목표'를 이루는 방법 한마디 (+ 과녁의 남은 체력) */
  function drawObjective(ctx, G, me) {
    const F = TW.Feel; if (!F) return;
    let o = F.objective(); if (!o) return;
    const urgent = o.kind === 'recall' || o.kind === 'defend';
    if (!urgent) { const g = F.goal(); if (!g || !g.sub) return; o = { text: g.sub, col: g.col, frac: g.frac }; }
    const R = UI.mmRect(), x = R.x, y = R.y + R.h + 8, w = R.w;
    const tl = urgent ? [o.text] : X.wrap(ctx, o.text, w - 72, 12.5, 700).slice(0, 2), sl = urgent && o.sub ? X.wrap(ctx, o.sub, w - 28, 11.5, 500).slice(0, 2) : [];
    const h = 18 + tl.length * 17 + (sl.length ? sl.length * 16 + 4 : 0) + (o.frac >= 0 ? 8 : 0);
    X.rr(ctx, x, y, w, h, 12); ctx.fillStyle = 'rgba(8,11,30,0.86)'; ctx.fill(); ctx.strokeStyle = U.rgba(o.col, 0.6); ctx.lineWidth = 1.2; ctx.stroke();
    chip(ctx, urgent ? '지금!' : '방법', x + 30, y + 17, 11.5, '#0b0d22', o.col, 7);
    for (let i = 0; i < tl.length; i++) X.text(ctx, tl[i], x + 58, y + 18 + i * 17, urgent ? (o.text.length > 19 ? 12 : 13.5) : 12.5, '#ffffff', 'left', urgent ? 800 : 700);
    for (let i = 0; i < sl.length; i++) X.text(ctx, sl[i], x + 14, y + 22 + tl.length * 17 + i * 16, 11.5, '#cfd6ee', 'left', 500);
    if (o.frac >= 0) { X.rr(ctx, x + 12, y + h - 9, w - 24, 4, 2); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill(); X.rr(ctx, x + 12, y + h - 9, Math.max(3, (w - 24) * U.clamp(o.frac, 0, 1)), 4, 2); ctx.fillStyle = o.col; ctx.fill(); }
    UI.objRect = { x, y, w, h };
  }
  /* 8차: 화면 위 가운데(점수판 바로 아래) — 다음 목표 한 줄과 네 칸 길(라인 지키기 › 정글 몬스터 › 큰 몬스터 › 탑 부수기).
     이루면 그 줄이 금빛 '목표 달성! +골드'로 튀어 오르고(소리와 함께) 다음 목표로 바뀐다. 눌리지 않는다(그 아래 땅 클릭은 그대로 이동) */
  const ROUTE_NAME = { lane: '라인 지키기', camp: '정글 몬스터', big: '큰 몬스터', tower: '탑 부수기' };
  UI.goalY = 101;
  function drawRoute(ctx, cx, y, gl, curKind, me) {
    const F = TW.Feel, steps = F.ROUTE.filter(k => !(k === 'lane' && me.pos === 'jg'));
    const st = steps.map(k => { const l = gl.log.find(e => e.kind === k); return l ? (l.ok ? 'ok' : 'miss') : k === curKind ? 'now' : 'todo'; });
    const px = 12, gap = 30, ck = 15; let tw = 0;
    const ws = steps.map((k, i) => { const w = X.textW(ctx, ROUTE_NAME[k], px, st[i] === 'now' ? 900 : 700) + (st[i] === 'ok' ? ck : 0); tw += w; return w; });
    tw += gap * (steps.length - 1);
    let x = cx - tw / 2;
    for (let i = 0; i < steps.length; i++) {
      const k = steps[i], s = st[i], col = s === 'ok' ? COL.gold : s === 'now' ? F.GOAL[k].col : s === 'miss' ? 'rgba(150,155,185,0.7)' : 'rgba(205,210,240,0.62)';
      if (s === 'ok') { ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + 4.5, y + 3.5); ctx.lineTo(x + 10, y - 4); ctx.strokeStyle = INK; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.strokeStyle = COL.gold; ctx.lineWidth = 2.2; ctx.stroke(); }
      const tx = x + (s === 'ok' ? ck : 0);
      X.text(ctx, ROUTE_NAME[k], tx, y, px, col, 'left', s === 'now' ? 900 : 700, INK, 3);
      if (s === 'miss') { ctx.fillStyle = col; ctx.fillRect(tx, y, ws[i], 1.5); }
      if (s === 'now') { ctx.fillStyle = col; ctx.fillRect(tx, y + 9, ws[i], 2); }
      x += ws[i];
      if (i < steps.length - 1) X.text(ctx, '›', x + gap / 2, y, 14, 'rgba(205,210,240,0.55)', 'center', 800, INK, 3);
      x += gap;
    }
  }
  function drawGoal(ctx, G, me) {
    const F = TW.Feel; if (!F || !F.goal) return;
    const g = F.goal(); if (!g) return;
    const gl = F.gl, fl = gl.flash, cx = UI.W / 2, cy = UI.goalY, H = 34, firstRound = g.n <= (me.pos === 'jg' ? 3 : 4);
    const fdur = fl ? (fl.ok ? 2.6 : 1.8) : 0, fa = fl ? UI.t - fl.at : 99;
    if (fl && fa >= 0 && fa < fdur) {
      // 이룬 순간: 금빛 판이 크게 튀었다 내려앉고, 둘레로 금빛 고리가 퍼진다
      const def = F.GOAL[fl.kind], inK = U.easeBack(Math.min(1, fa / 0.22)), a = Math.min(1, fa / 0.06) * Math.min(1, (fdur - fa) / 0.35);
      const t1 = fl.ok ? '목표 달성!' : fl.why === 'enemy' ? '적이 먼저 잡았습니다' : '시간이 지났습니다';
      const t2 = fl.ok ? def.name + '   +' + fl.gold + ' 골드 · 경험치 +' + fl.xp : def.name + ' → 다음 목표로';
      const p1 = fl.ok ? 21 : 15, w1 = X.textW(ctx, t1, p1, 900), w = w1 + X.textW(ctx, t2, 15, 800) + 66, s = fl.ok ? 1.3 - 0.3 * inK : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(cx, cy); ctx.scale(s, s);
      X.rr(ctx, -w / 2, -H / 2 - 2, w, H + 4, (H + 4) / 2); ctx.fillStyle = fl.ok ? 'rgba(54,40,6,0.95)' : 'rgba(8,11,30,0.9)'; ctx.fill();
      ctx.strokeStyle = fl.ok ? COL.gold : 'rgba(200,205,230,0.5)'; ctx.lineWidth = fl.ok ? 2.5 : 1.2; ctx.stroke();
      X.text(ctx, t1, -w / 2 + 24, 1, p1, fl.ok ? COL.gold : '#c9cde0', 'left', 900, INK, 3);
      X.text(ctx, t2, -w / 2 + 24 + w1 + 18, 1, 15, fl.ok ? '#fff1bf' : '#c9cde0', 'left', 800);
      ctx.restore();
      if (fl.ok && fa < 0.9) { const r = fa / 0.9; ctx.globalAlpha = (1 - r) * 0.85; X.rr(ctx, cx - w / 2 - r * 34, cy - H / 2 - 2 - r * 12, w + r * 68, H + 4 + r * 24, (H + 4 + r * 24) / 2); ctx.strokeStyle = COL.gold; ctx.lineWidth = 2.5; ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.globalAlpha = 1;
      if (gl.log.length <= 4) drawRoute(ctx, cx, cy + 31, gl, null, me);
      return;
    }
    // 평소: [다음 목표 n] 이름 · 할 일 · 진행 n/N · 보상 · 남은 시간 (+ 진행 막대)
    const col = g.col, lbl = '다음 목표 ' + g.n, prog = g.have + '/' + g.need, rew = g.gold > 0 ? '+' + g.gold + ' 골드' : '승리!', tl = g.left >= 0 ? U.fmtTime(Math.ceil(g.left)) : '';
    const pk = Math.max(0, 1 - (UI.t - (gl.pop || -9)) / 0.6), born = Math.min(1, Math.max(0, fa - fdur) / 0.3);        // pk: 진행이 막 올랐다 · born: 새 목표가 막 왔다
    const narrow = UI.W < 1280;        // 좁은 창(예: 480×800): 할 일 문장과 네 칸 길을 빼고, 왼쪽 위 지도에 겹치지 않게 오른쪽으로 비킨다
    const wL = X.textW(ctx, lbl, 12, 800) + 16, wN = X.textW(ctx, g.name, 16, 900), wT = narrow ? -16 : X.textW(ctx, g.text, 15, 800), wP = X.textW(ctx, prog, 17, 900), wR = X.textW(ctx, rew, 12.5, 800) + 18, wM = tl ? X.textW(ctx, tl, 13, 800) : 0;
    const w = 14 + wL + 12 + wN + 12 + wT + 16 + wP + 14 + wR + (tl ? 12 + wM : 0) + 16, mmR = UI.mmRect(), x0 = narrow ? Math.max(cx - w / 2, mmR.x + mmR.w + 12) : cx - w / 2, y0 = cy - H / 2;
    ctx.globalAlpha = born < 1 ? 0.25 + 0.75 * born : 1;
    const dy = (1 - U.easeOut3(born)) * -8;
    X.rr(ctx, x0, y0 + dy, w, H, H / 2); ctx.fillStyle = 'rgba(8,11,30,0.88)'; ctx.fill(); ctx.strokeStyle = U.rgba(col, 0.7 + 0.3 * pk); ctx.lineWidth = 1.5 + 2 * pk; ctx.stroke();
    const fr = U.clamp(g.have / Math.max(1, g.need), 0, 1);
    if (fr > 0) { X.rr(ctx, x0 + 18, y0 + dy + H - 5, (w - 36) * fr, 3, 1.5); ctx.fillStyle = col; ctx.fill(); }
    let x = x0 + 14; const yy = cy + dy;
    chip(ctx, lbl, x + wL / 2, yy, 12, '#0b0d22', col, 8); x += wL + 12;
    X.text(ctx, g.name, x, yy + 1, 16, col, 'left', 900); x += wN + 12;
    if (!narrow) X.text(ctx, g.text, x, yy + 1, 15, '#ffffff', 'left', 800); x += wT + 16;
    X.text(ctx, prog, x, yy + 1, 17 * (1 + 0.25 * pk), pk > 0.05 ? COL.gold : '#ffffff', 'left', 900); x += wP + 14;
    chip(ctx, rew, x + wR / 2, yy, 12.5, '#0b0d22', COL.gold, 9); x += wR + 12;
    if (tl) X.text(ctx, tl, x, yy + 1, 13, g.left < 20 ? COL.bad : COL.dim, 'left', 800);
    ctx.globalAlpha = 1;
    if (firstRound && !narrow) drawRoute(ctx, cx, cy + 31, gl, g.kind, me);
  }
  /* F3: 프레임 기록 (최근 10초의 프레임 간격 그래프) */
  UI.drawPerf = function (ctx, P) {
    const w = 250, h = 66, x = UI.W / 2 - w / 2, y = UI.H - 150;
    X.rr(ctx, x, y, w, h, 10); ctx.fillStyle = 'rgba(4,6,18,0.82)'; ctx.fill();
    const n = Math.min(P.n, 600); let mx = 0; for (let k = 1; k <= n; k++) mx = Math.max(mx, P.buf[(P.i - k + 600) % 600]);
    ctx.fillStyle = '#7dffb2'; for (let k = 1; k <= Math.min(n, 240); k++) { const v = P.buf[(P.i - k + 600) % 600], bh = Math.min(30, v * 0.9); ctx.fillStyle = v > 20 ? '#ff6a7c' : '#7dffb2'; ctx.fillRect(x + w - 6 - k, y + h - 6 - bh, 1, bh); }
    X.text(ctx, Math.round(P.fps()) + ' fps', x + 10, y + 14, 14, '#ffffff', 'left', 900);
    X.text(ctx, '계산 ' + P.tickMs.toFixed(1) + 'ms · 최악 ' + P.worst.toFixed(0) + 'ms · 20ms 넘김 ' + P.over20 + '/' + P.n, x + 74, y + 14, 10.5, '#cfd6ee', 'left', 600);
  };
  function drawBossBar(ctx, G, me) {
    const b = G.bossCamp.alive[0]; if (!b || b.hp >= b.maxHp && !b.target) return;
    if (me && !(b.seen[me.team] || U.du(me, b) < 24)) return;
    const w = 460, x = UI.W / 2 - w / 2, y = 146, fr = b.hp / b.maxHp;        // 8차: 위의 '다음 목표' 줄 아래로 (예전 104)
    slab(ctx, x - 4, y - 4, w + 8, 22); ctx.fillStyle = 'rgba(4,6,18,0.9)'; ctx.fill();
    slab(ctx, x, y, Math.max(6, w * fr), 14); ctx.fillStyle = fr < 0.5 ? '#ff8a6a' : '#7dffd9'; ctx.fill();
    X.text(ctx, '이무기  ' + Math.ceil(b.hp) + ' / ' + Math.round(b.maxHp), UI.W / 2, y + 8, 12.5, '#ffffff', 'center', 800, 'rgba(4,6,18,0.8)', 3);
  }
  function drawTips(ctx, G, me) {
    const t = G.t, cx = UI.W / 2;
    // 알림 한 줄 (가운데 아래)
    let ty = UI.H - 92;
    for (let i = UI.toasts.length - 1; i >= 0; i--) {
      const tt = UI.toasts[i]; tt.t += UI.dt; if (tt.t > 3.2) { UI.toasts.splice(i, 1); continue; }
      const a = Math.min(1, tt.t / 0.15) * Math.min(1, (3.2 - tt.t) / 0.4), w = Math.min(700, X.textW(ctx, tt.msg, 14, 700) + 30);
      ctx.globalAlpha = a; X.rr(ctx, cx - w / 2, ty - 14, w, 28, 14); ctx.fillStyle = 'rgba(6,9,24,0.86)'; ctx.fill(); X.text(ctx, tt.msg, cx, ty + 1, 14, tt.color, 'center', 700); ctx.globalAlpha = 1;
      ty -= 34;
    }
    // 본진에 돌아왔고 살 것이 있으면 (자동 구매를 껐을 때): 한 번에 사기 단추
    if (me && !me.dead && me.atFountain && !UI.autoBuy && !G.over && !UI.shopOpen) {
      const ap = TW.affordPlan(me);
      if (ap.list.length) {
        const str = '본진 — 추천 아이템 ' + ap.list.length + '개 한 번에 사기 · ' + ap.cost + ' 골드', bw = X.textW(ctx, str, 15, 800) + 70, bx = cx - bw / 2, by = ty - 20;
        const hot = UI.over(bx, by, bw, 38), pk = 0.5 + 0.5 * Math.sin(UI.t * 5);
        X.rr(ctx, bx, by, bw, 38, 19); ctx.fillStyle = hot ? 'rgba(60,52,20,0.95)' : 'rgba(8,11,30,0.92)'; ctx.fill(); ctx.strokeStyle = COL.gold; ctx.lineWidth = 1.6 + pk; ctx.stroke();
        keycap(ctx, 'V', bx + 26, by + 19, 13, true); X.text(ctx, str, bx + 48, by + 20, 15, COL.gold, 'left', 800);
        if (hot) UI.cursor = 'pointer';
        if (UI.hit(bx, by, bw, 38, 0) && UI.on.buyAll) UI.on.buyAll();
        ty -= 48;
      }
    }
    // 수가 밀리는 싸움이면 아군을 부를 수 있다고 알려 준다 ("왜 아무도 안 와"). 한 번 뜨면 6초까지, 부른 뒤 12초 동안은 띄우지 않는다
    if (me && !me.dead && !G.over) {
      let en = 0, al = 0;
      for (const h of G.heroes) { if (h.dead || h === me) continue; if (h.team === me.team) { if (U.du(h, me) < 14) al++; } else if (h.seen[me.team] && U.du(h, me) < 12) en++; }
      const out = en > al + 1, rt = TW.App && TW.App.rallyT !== undefined ? TW.App.rallyT : -99;
      if (out) { UI.outHold += UI.dt; UI.outGone = 0; } else { UI.outGone += UI.dt; if (UI.outGone > 15) UI.outHold = 0; }
      UI.outA = U.clamp(UI.outA + (out && UI.outHold < 6 && t - rt > 12 ? 4 : -3) * UI.dt, 0, 1);
    } else UI.outA = 0;
    if (UI.outA > 0.01) {
      const str = '아군 부르기 — 적이 더 많아요', w = X.textW(ctx, str, 14, 800) + 62;
      ctx.globalAlpha = UI.outA; X.rr(ctx, cx - w / 2, ty - 15, w, 30, 15); ctx.fillStyle = 'rgba(6,9,24,0.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,230,128,0.85)'; ctx.lineWidth = 1.3; ctx.stroke();
      keycap(ctx, 'G', cx - w / 2 + 24, ty, 13, true); X.text(ctx, str, cx - w / 2 + 44, ty + 1, 14, '#ffe680', 'left', 800);
      ctx.globalAlpha = 1; ty -= 34;
    }
    // 처음 얼마간: 조작 안내
    if (t < 26) {
      const a = Math.min(1, t / 0.6) * Math.min(1, (26 - t) / 1), y = UI.H - 40;
      ctx.globalAlpha = a;
      const items = [['우클릭', '이동 · 공격'], ['Q W E', UI.castMode === 'quick' ? '누르는 순간 커서 쪽으로 발사' : '누른 채 조준, 떼면 발사'], ['A', '커서 근처 적 공격'], ['SPACE', '구르기'], ['B', '귀환']];
      let tw = 0; const ws = items.map(it => { const w = X.textW(ctx, it[0], 13, 900) + X.textW(ctx, it[1], 13.5, 600) + 34; tw += w + 16; return w; });
      let x = cx - tw / 2;
      for (let i = 0; i < items.length; i++) { const kw = X.textW(ctx, items[i][0], 13, 900) + 12; keycap(ctx, items[i][0], x + kw / 2, y, 13, true); X.text(ctx, items[i][1], x + kw + 8, y + 1, 13.5, '#eef0ff', 'left', 600, INK, 3.5); x += ws[i] + 16; }
      ctx.globalAlpha = 1;
    }
    // 처음 한 분 남짓: 이 영웅의 손맛 길잡이 (다듬은 영웅만)
    if (me && me.hd.tips && t > 3.4 && t < 3.4 + me.hd.tips.length * 13) {
      const i = Math.floor((t - 3.4) / 13), lt = (t - 3.4) % 13, a = Math.min(1, lt / 0.4) * Math.min(1, (13 - lt) / 0.6), str = me.hd.tips[i], w = X.textW(ctx, str, 14.5, 700) + 96, y = 156;      // 8차: '다음 목표' 줄 아래로 (예전 106)
      ctx.globalAlpha = a; X.rr(ctx, cx - w / 2, y - 16, w, 32, 16); ctx.fillStyle = 'rgba(6,9,24,0.88)'; ctx.fill(); ctx.strokeStyle = U.rgba(me.hd.glow, 0.7); ctx.lineWidth = 1.2; ctx.stroke();
      chip(ctx, '길잡이 ' + (i + 1) + '/' + me.hd.tips.length, cx - w / 2 + 44, y, 11, '#0b0d22', me.hd.glow, 6); X.text(ctx, str, cx - w / 2 + 84, y + 1, 14.5, '#ffffff', 'left', 700);
      ctx.globalAlpha = 1;
    }
    // 등불탑이 나를 조준
    if (UI.t - UI.warnT < 1.4) { const k = (UI.t - UI.warnT) / 1.4; ctx.globalAlpha = 1 - k; X.text(ctx, '등불탑이 나를 노립니다!', cx, 258, 22, COL.bad, 'center', 900, 'rgba(4,6,18,0.95)'); ctx.globalAlpha = 1; }
    // 체력이 낮을 때 가장자리 맥박
    if (me && !me.dead && me.hp / me.maxHp < 0.3) { UI.lowHpT += UI.dt; const k = 0.5 + 0.5 * Math.sin(UI.lowHpT * 6); W.hurt = Math.max(W.hurt, 0.22 + 0.2 * k); }
  }
  UI.drawHUD = function (ctx, G, me, dt) {
    // 멈춤·결과·조작법 창이 떠 있으면 그 아래 HUD 는 눌리지 않는다
    // 결과 화면이 다 떠오르면 그 아래 HUD 는 그리지 않는다 (비쳐 보이면 어수선하다)
    if (UI.ended && UI.ended.t > 2.1) { W.noOverlay = true; if (TW.UIMenu) TW.UIMenu.overlays(ctx, G, me); return; }
    const modal = UI.paused || !!UI.ended || UI.helpOpen, held = UI.clicks, hmx = UI.mx;
    if (modal) { UI.clicks = []; UI.mx = -9999; }
    else if (UI.shopOpen && TW.UIMenu) {       // 상점이 덮은 자리의 클릭·가리킴은 그 아래 HUD 로 새지 않는다
      const r = TW.UIMenu.shopRect(), inR = (px, py) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
      UI.clicks = held.filter(c => !inR(c.x, c.y)); if (inR(UI.mx, UI.my)) UI.mx = -9999;
    }
    drawLens(ctx);
    drawMinimap(ctx, G, me);
    drawTop(ctx, G, me);
    drawFeed(ctx, G, me);
    drawBossBar(ctx, G, me);
    if (me) drawGoal(ctx, G, me);
    if (me) { if (!(UI.kcard && !me.dead)) drawObjective(ctx, G, me); drawMe(ctx, G, me); drawSkills(ctx, G, me); drawPurse(ctx, G, me); drawTips(ctx, G, me); drawRecap(ctx, G, me); drawKillCard(ctx, G, me); drawGain(ctx); }
    drawBanner(ctx);
    if (modal) { UI.clicks = held; UI.mx = hmx; UI.hoverTip = null; UI.cursor = 'default'; UI.captured = true; }
    else if (UI.clicks !== held) { UI.clicks = held; UI.mx = hmx; }
    if (TW.UIMenu) TW.UIMenu.overlays(ctx, G, me);
  };

})();
