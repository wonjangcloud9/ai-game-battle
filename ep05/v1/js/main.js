/* 청홍대전 — main: 부트스트랩, 입력, 메인 루프 */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const C = AOS.C, U = AOS.U, M = AOS.Map, W = AOS.World, UI = AOS.UI, Au = AOS.Audio;
  const App = AOS.App = {
    state: 'menu', G: null, me: null, canvas: null, ctx: null, dpr: 1, cssW: 1600, cssH: 900, resScale: 1,
    mouse: { x: 800, y: 450, down: [false, false, false], inside: true }, keys: {},
    last: 0, aimSlot: -1, holdWorld: false, holdT: 0, rallyT: 0, slowT: 0, demoT: 0, demoFocus: null,
    lastHero: 'lira', lastDiff: 'normal', frameEma: 0.016, slowFrames: 0, err: null, frames: 0,
  };
  const KEY_SLOT = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 };
  const WHY = { cd: '아직 사용할 수 없습니다 (재사용 대기 중)', mana: '마나가 부족합니다', level: C.ULT_LEVEL + '레벨에 해금됩니다', target: '대상이 없습니다 — 적에게 커서를 올리세요', cc: '지금은 행동할 수 없습니다', busy: '다른 행동 중입니다', dead: '부활을 기다리는 중입니다' };

  function savePrefs() { try { localStorage.setItem('chd_prefs', JSON.stringify({ hero: UI.sel.hero, diff: UI.sel.diff, muted: Au.muted, autoBuy: UI.autoBuy })); } catch (e) { /* 무시 */ } }
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem('chd_prefs') || 'null');
      if (p) { if (AOS.Heroes[p.hero]) UI.sel.hero = p.hero; if (AOS.Difficulty[p.diff]) UI.sel.diff = p.diff; Au.muted = !!p.muted; UI.muted = Au.muted; UI.autoBuy = !!p.autoBuy; }
    } catch (e) { /* 무시 */ }
  }

  /* ---------- 화면 크기 ---------- */
  function resize() {
    const cv = App.canvas;
    App.cssW = Math.max(320, window.innerWidth || 1600); App.cssH = Math.max(240, window.innerHeight || 900);
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const maxPx = 5.6e6;
    if (App.cssW * App.cssH * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (App.cssW * App.cssH));
    dpr = Math.max(0.6, dpr * App.resScale);
    App.dpr = dpr;
    cv.width = Math.round(App.cssW * dpr); cv.height = Math.round(App.cssH * dpr);
    cv.style.width = App.cssW + 'px'; cv.style.height = App.cssH + 'px';
    App.ctx = cv.getContext('2d');
    const us = U.clamp(Math.min(App.cssW / 1600, App.cssH / 900), 0.5, 2.2);
    W.resize(cv.width, cv.height, Math.max(0.7, us) * dpr);
  }

  /* ---------- 게임 시작 / 데모 ---------- */
  function startDemo() {
    const ids = AOS.HeroOrder;
    App.G = new AOS.Game({ spectate: true, seed: (Math.random() * 1e9) | 0, playerHero: ids[(Math.random() * ids.length) | 0], difficulty: 'normal' });
    App.me = null; App.state = 'menu'; App.demoT = 0; App.demoFocus = null;
    W.attach(App.G, null);
    // 데모는 전투가 벌어지는 시점부터 보여 준다
    const G = App.G;
    for (let i = 0; i < 30 * 55 && !G.over; i++) { G.update(1 / 30); G.events.length = 0; }
    W.cam.x = 130; W.cam.y = 80; W.cam.zoom = 1;
    UI.reset();
  }
  function startGame(heroId, diff) {
    Au.init();
    App.lastHero = heroId; App.lastDiff = diff;
    App.G = new AOS.Game({ playerHero: heroId, difficulty: diff, seed: (Math.random() * 1e9) | 0 });
    App.me = App.G.player; App.state = 'play'; App.aimSlot = -1; App.slowT = 0; App.holdWorld = false;
    W.attach(App.G, App.me); W.cam.zoom = 1;
    UI.reset(); UI.keyAim = -1;
    UI.announce('전투 준비!', UI.COL.gold, '추천 라인: ' + C.LANE_NAMES[App.me.hd.lane] + ' · 미니언은 ' + C.FIRST_WAVE + '초 뒤 출발합니다', 4.5);
    // 추천 라인으로 가는 길 안내
    { const me = App.me, lane = me.hd.lane, tw = App.G.towerOf(me.team, lane, 1), p = M.lanePoint(lane, M.toT(me.team, lane, M.toProg(me.team, lane, tw.lt) + 7)); UI.guide = { x: p.x, y: p.y, until: 22, label: C.LANE_NAMES[lane] + ' 라인으로 이동하세요 (우클릭)' }; }
    savePrefs();
  }
  UI.on.start = startGame;
  UI.on.restart = () => startGame(App.lastHero, App.lastDiff);
  UI.on.menu = () => { startDemo(); };
  UI.on.pause = () => { if (App.state === 'play' && !UI.ended) { UI.paused = !UI.paused; UI.helpOpen = false; } };
  UI.on.mute = () => { Au.init(); Au.setMuted(!Au.muted); UI.muted = Au.muted; savePrefs(); };
  UI.on.select = () => { Au.init(); Au.play('click', 0.8); };
  UI.on.prefs = () => { savePrefs(); Au.play('click', 0.8); };
  UI.on.buy = (id) => { const G = App.G; if (G && App.me && G.buy(App.me, id)) { /* 효과음은 이벤트로 */ } };
  UI.on.sell = (i) => { const G = App.G; if (G && App.me && G.sell(App.me, i)) Au.play('gold', 0.7); };
  UI.on.deny = (msg) => { UI.toast(msg); Au.play('deny', 0.8); };
  UI.on.recall = () => { if (App.me && !App.me.dead) App.me.cmdRecall(); };
  UI.on.look = (x, y) => { W.cam.locked = false; W.cam.x = x; W.cam.y = y; };
  UI.on.miniMove = (x, y) => { const me = App.me; if (me && !me.dead) { me.cmdMove(x, y); const p = M.nearestWalkable(x, y); W.clickMark(p.x, p.y, false); } };
  UI.on.castSlot = (i) => { quickCast(i); };

  /* ---------- 스킬 시전 ---------- */
  function devMouse() { return { x: App.mouse.x * App.dpr, y: App.mouse.y * App.dpr }; }
  function findAimTarget(ab) {
    const me = App.me, G = App.G, mw = W.mouse;
    if (ab.type === 'unit') {
      const ok = (u) => !u.dead && u.team !== me.team && !u.isStruct && G.canTarget(me, u) && (!ab.heroOnly || u.isHero);
      const hv = W.hover;
      if (hv && ok(hv)) return hv;
      let best = null, bd = 5.5;
      for (const u of G.units) { if (!ok(u)) continue; const d = U.dist(u.x, u.y, mw.x, mw.y) - (u.isHero ? 1.5 : 0); if (d < bd) { bd = d; best = u; } }
      return best;
    }
    if (ab.type === 'ally') {
      let best = null, bd = 6;
      for (const u of G.heroes) { if (u.dead || u.team !== me.team) continue; const d = U.dist(u.x, u.y, mw.x, mw.y); if (d < bd) { bd = d; best = u; } }
      return best || me;
    }
    return null;
  }
  function doCast(slot, x, y, unit) {
    const me = App.me; if (!me) return;
    const res = me.cmdCast(slot, x, y, unit);
    if (res !== 'ok' && res !== 'queued') { UI.toast(WHY[res] || '사용할 수 없습니다'); Au.play('deny', 0.8); }
  }
  /* HUD 아이콘 클릭: 가까운 적을 자동으로 겨냥 */
  function quickCast(slot) {
    const me = App.me, G = App.G; if (!me || me.dead) return;
    const ab = me.hd.abilities[slot];
    if (ab.type === 'self') { doCast(slot, me.x, me.y, null); return; }
    if (ab.type === 'ally') { let low = me; for (const h of G.heroes) if (!h.dead && h.team === me.team && U.du(h, me) <= ab.range && h.hp / h.maxHp < low.hp / low.maxHp) low = h; doCast(slot, low.x, low.y, low); return; }
    let best = null, bd = Infinity;
    for (const u of G.units) {
      if (u.dead || u.team === me.team || u.isStruct || !G.canTarget(me, u) || (ab.heroOnly && !u.isHero)) continue;
      const d = U.du(u, me) - (u.isHero ? 6 : 0);
      if (d < bd && U.du(u, me) <= (ab.range || 8) + 3) { bd = d; best = u; }
    }
    if (best) doCast(slot, best.x, best.y, best);
    else if (ab.type === 'unit') { UI.toast(WHY.target); Au.play('deny', 0.8); }
    else doCast(slot, me.x + Math.cos(me.facing) * (ab.range || 6), me.y + Math.sin(me.facing) * (ab.range || 6), null);
  }
  function releaseAim(cast) {
    const slot = App.aimSlot; App.aimSlot = -1; UI.keyAim = -1; W.aim = null;
    if (slot < 0 || !cast) return;
    const me = App.me; if (!me || me.dead) return;
    const ab = me.hd.abilities[slot];
    doCast(slot, W.mouse.x, W.mouse.y, findAimTarget(ab));
  }

  /* ---------- 입력 ---------- */
  function setMouse(e) {
    const r = App.canvas.getBoundingClientRect();
    App.mouse.x = e.clientX - r.left; App.mouse.y = e.clientY - r.top; App.mouse.inside = true;
  }
  function onMouseDown(e) {
    if (e.preventDefault) e.preventDefault();
    setMouse(e);
    if (e.button !== 0 && e.button !== 2) return;
    App.mouse.down[e.button] = true;
    if (e.button === 0) UI.down = true;
    UI.clicks.push({ x: App.mouse.x / UI.us, y: App.mouse.y / UI.us, b: e.button === 2 ? 2 : 0, used: false });
    Au.init();
  }
  function onMouseUp(e) {
    if (e.button === 0 || e.button === 2) App.mouse.down[e.button] = false;
    if (!App.mouse.down[0]) UI.down = false;
    if (!App.mouse.down[0] && !App.mouse.down[2]) App.holdWorld = false;
  }
  function onWheel(e) {
    if (e.preventDefault) e.preventDefault();
    if (App.state !== 'play' || UI.shopOpen || UI.paused) return;
    W.cam.zoom = U.clamp(W.cam.zoom * (e.deltaY > 0 ? 0.93 : 1.075), 0.72, 1.3);
  }
  function onKeyDown(e) {
    const code = e.code;
    if (code === 'Tab' || code === 'Space' || code === 'F1' || code.indexOf('Arrow') === 0) { if (e.preventDefault) e.preventDefault(); }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const first = !App.keys[code];
    App.keys[code] = true;
    if (!first) return;
    Au.init();
    if (code === 'KeyM') { UI.on.mute(); return; }
    if (App.state === 'menu') {
      if (code === 'Enter' || code === 'NumpadEnter') startGame(UI.sel.hero, UI.sel.diff);
      return;
    }
    const me = App.me, G = App.G;
    if (code === 'Escape') {
      if (UI.ended) return;
      if (UI.shopOpen) UI.shopOpen = false; else if (UI.helpOpen) UI.helpOpen = false; else UI.on.pause();
      return;
    }
    if (code === 'F1' || code === 'KeyH') { if (!UI.ended) UI.helpOpen = !UI.helpOpen; return; }
    if (code === 'Tab') { UI.scoreOpen = true; return; }
    if (UI.ended || UI.paused || !me) return;
    if (code === 'KeyP') { UI.shopOpen = !UI.shopOpen; Au.play('click', 0.8); return; }
    if (code === 'Space') { W.cam.locked = true; W.cam.x = me.x; W.cam.y = me.y + 1.2; return; }
    if (code === 'KeyY') { W.cam.locked = !W.cam.locked; UI.toast(W.cam.locked ? '카메라 고정' : '카메라 자유 이동', '#cfe6ff'); return; }
    if (me.dead || UI.shopOpen) return;
    if (KEY_SLOT[code] !== undefined) {
      const slot = KEY_SLOT[code], ab = me.hd.abilities[slot];
      const why = me.castBlock(slot);
      if (why) { UI.toast(WHY[why] || '사용할 수 없습니다'); Au.play('deny', 0.8); return; }
      if (ab.type === 'self') { doCast(slot, me.x, me.y, null); return; }
      App.aimSlot = slot; UI.keyAim = slot;
      return;
    }
    if (code === 'KeyA') { me.cmdMove(W.mouse.x, W.mouse.y, true); W.clickMark(W.mouse.x, W.mouse.y, true); return; }
    if (code === 'KeyS') { me.cmdStop(); return; }
    if (code === 'KeyB') { me.cmdRecall(); return; }
    if (code === 'KeyG') {
      if (G.t < App.rallyT) return;
      App.rallyT = G.t + 3;
      AOS.AI.rally(G, me.team, W.mouse.x, W.mouse.y, 12);
      W.ping(W.mouse.x, W.mouse.y, '#ffe680'); UI.toast('집결 신호! 아군이 이곳으로 모입니다', '#ffe680'); Au.play('announce', 0.7);
    }
  }
  function onKeyUp(e) {
    const code = e.code;
    App.keys[code] = false;
    if (code === 'Tab') UI.scoreOpen = false;
    if (KEY_SLOT[code] !== undefined && App.aimSlot === KEY_SLOT[code]) releaseAim(true);
  }
  function clearInput() { App.keys = {}; App.mouse.down = [false, false, false]; UI.down = false; App.holdWorld = false; UI.scoreOpen = false; releaseAim(false); }

  function worldClicks() {
    const me = App.me, G = App.G;
    for (const c of UI.clicks) {
      if (c.used) continue;
      if (App.state !== 'play' || UI.paused || UI.ended || !me || me.dead) continue;
      const dx = c.x * UI.us * App.dpr, dy = c.y * UI.us * App.dpr;
      const tg = W.pick(dx, dy, (u) => u.team !== me.team && G.canTarget(me, u));
      if (tg) { me.cmdAttack(tg); W.clickMark(tg.x, tg.y, true); }
      else {
        const locked = W.pick(dx, dy, (u) => u.team !== me.team && u.isStruct && !u.vulnerable);
        if (locked) UI.toast(locked.kind === 'core' ? '내부 포탑을 하나 이상 파괴해야 코어를 공격할 수 있습니다' : '같은 라인의 외곽 포탑을 먼저 파괴해야 합니다', '#ffe680');
        const p = W.toWorld(dx, dy), q = M.nearestWalkable(p.x, p.y);
        me.cmdMove(p.x, p.y); W.clickMark(q.x, q.y, false);
        // 버튼을 아직 누르고 있을 때만 '누른 채 이동'으로 이어진다 (짧은 탭은 한 번의 이동 명령)
        App.holdWorld = App.mouse.down[0] || App.mouse.down[2]; App.holdT = 0.18;
      }
      Au.play('click', 0.35);
    }
  }

  /* ---------- 프레임 ---------- */
  function simStep(dt) {
    const G = App.G, n = dt > 0.034 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      G.update(dt / n);
      const ev = G.events;
      for (let k = 0; k < ev.length; k++) {
        const e = ev[k];
        W.onEvent(e, G);
        if (App.state === 'play') { UI.onEvent(e, G, App.me); Au.onEvent(e, G, App.me); }
      }
      ev.length = 0;
    }
  }
  function demoCamera(dt) {
    const G = App.G;
    App.demoT -= dt;
    if (App.demoT <= 0 || !App.demoFocus || App.demoFocus.dead) {
      App.demoT = 9;
      // 교전 중인 영웅을 우선으로 비춘다
      let best = null, bs = -1;
      for (const h of G.heroes) { if (h.dead) continue; const s = (G.t - h.lastHeroFight < 3 ? 5 : 0) + (G.t - h.lastAct < 2 ? 2 : 0) + Math.random(); if (s > bs) { bs = s; best = h; } }
      App.demoFocus = best;
    }
    W.updateCam(dt * 0.35, App.demoFocus || { x: 130, y: 80 }, true);
  }
  function tick(dt) {
    const G = App.G, me = App.me, ctx = App.ctx, mouse = App.mouse;
    let wdt = dt;
    if (App.state === 'menu') {
      simStep(dt);
      if (G.over || G.t > 900) startDemo();
      demoCamera(dt);
    } else {
      if (!UI.paused) {
        if (G.over) {
          if (!UI.ended) { UI.ended = { t: 0, win: G.winner === me.team }; App.slowT = 2.2; UI.shopOpen = false; UI.scoreOpen = false; releaseAim(false); }
          simStep(dt);
        } else {
          // 누른 채 끌어서 이동
          if (App.holdWorld && !(mouse.down[0] || mouse.down[2])) App.holdWorld = false;
          if (App.holdWorld && me && !me.dead && !UI.captured) {
            App.holdT -= dt;
            if (App.holdT <= 0) { App.holdT = 0.1; const d = devMouse(), p = W.toWorld(d.x, d.y); me.cmdMove(p.x, p.y); }
          }
          simStep(dt);
          // 추천 아이템 자동 구매
          if (UI.autoBuy && me && G.canShop(me)) { const id = UI.nextRec(me); if (id && me.gold >= AOS.Items[id].cost) G.buy(me, id); }
        }
      } else wdt = 0;
      if (App.slowT > 0) { App.slowT -= dt; wdt = dt * 0.4; }
      // 카메라
      const cam = W.cam;
      if (G.over) { const core = G.cores[1 - G.winner]; W.updateCam(dt, { x: core.x, y: core.y - 3 }, true); }
      else if (cam.locked && me) W.updateCam(dt, me);
      else {
        const sp = 46 / cam.zoom * dt, k = App.keys, edge = 14;
        let mx = 0, my = 0;
        if (k.ArrowLeft) mx -= 1; if (k.ArrowRight) mx += 1; if (k.ArrowUp) my -= 1; if (k.ArrowDown) my += 1;
        if (mouse.inside && !UI.captured && !UI.shopOpen && !UI.paused) {
          if (mouse.x < edge) mx -= 1; else if (mouse.x > App.cssW - edge) mx += 1;
          if (mouse.y < edge) my -= 1; else if (mouse.y > App.cssH - edge) my += 1;
        }
        cam.x += mx * sp; cam.y += my * sp;
        W.updateCam(dt, null);
      }
      if ((App.keys.ArrowLeft || App.keys.ArrowRight || App.keys.ArrowUp || App.keys.ArrowDown) && cam.locked && !UI.shopOpen) cam.locked = false;
      // 커서 아래 정보
      const d = devMouse(), wp = W.toWorld(d.x, d.y);
      W.mouse.x = wp.x; W.mouse.y = wp.y;
      W.hover = (UI.captured || UI.topLayer > 1 || !me) ? null : W.pick(d.x, d.y, (u) => u !== me && (u.team !== me.team || u.isHero));
      if (App.aimSlot >= 0 && me) {
        if (me.dead) releaseAim(false);
        else { const ab = me.hd.abilities[App.aimSlot]; W.aim = { slot: App.aimSlot, ab, ok: !me.castBlock(App.aimSlot), target: findAimTarget(ab) }; }
      } else W.aim = null;
    }
    W.render(ctx, App.G, wdt);
    UI.begin(ctx, App.cssW, App.cssH, App.dpr, mouse.x, mouse.y, dt);
    if (App.state === 'menu') UI.drawMenu(ctx); else UI.drawHUD(ctx, App.G, App.me, dt);
    UI.end(ctx);
    worldClicks();
    UI.clicks.length = 0;
    let cur = UI.cursor;
    if (cur === 'default' && App.state === 'play' && !UI.captured) {
      if (App.aimSlot >= 0) cur = 'crosshair';
      else if (W.hover && me && W.hover.team !== me.team) cur = 'crosshair';
    }
    if (App.canvas.style.cursor !== cur) App.canvas.style.cursor = cur;
    Au.tick();
  }
  function showError(err) {
    if (App.err) return;
    App.err = err;
    try {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:12px;top:12px;max-width:70%;padding:10px 14px;background:rgba(40,8,8,0.92);color:#ffd0c8;font:13px/1.5 monospace;border:1px solid #ff5247;border-radius:8px;z-index:9;white-space:pre-wrap';
      d.textContent = '오류가 발생했습니다. 새로고침(F5) 해 주세요.\n' + (err && err.stack ? err.stack : String(err));
      document.body.appendChild(d);
    } catch (e) { /* 무시 */ }
    if (globalThis.console) console.error(err);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - App.last) / 1000; App.last = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.25) { dt = 0.016; }            // 탭 전환 등으로 오래 멈췄다가 돌아온 경우
    // 프레임이 계속 느리면 해상도를 낮춘다
    App.frameEma += (dt - App.frameEma) * 0.05;
    // (30fps 고정처럼 보이는 경우는 절전 모드일 수 있으므로 한 단계만 낮춘다)
    if ((App.frameEma > 0.04 || (App.frameEma > 0.026 && App.resScale > 0.9)) && App.frames > 120) { if (++App.slowFrames > 90 && App.resScale > 0.55) { App.resScale *= 0.85; App.slowFrames = 0; App.frameEma = 0.016; resize(); } } else App.slowFrames = 0;
    App.frames++;
    if (dt > 0.05) dt = 0.05;
    if (App.err && App.errCount > 5) return;
    try { tick(dt); } catch (err) { App.errCount = (App.errCount || 0) + 1; showError(err); }
  }

  function init() {
    const cv = App.canvas = document.getElementById('game');
    loadPrefs();
    resize();
    window.addEventListener('resize', resize);
    cv.addEventListener('mousedown', onMouseDown);
    cv.addEventListener('mousemove', setMouse);
    cv.addEventListener('contextmenu', (e) => { if (e.preventDefault) e.preventDefault(); });
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('mouseleave', () => { App.mouse.inside = false; });
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', setMouse);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (App.state === 'play' && !UI.ended) UI.paused = true; } });
    startDemo();
    App.last = (globalThis.performance && performance.now) ? performance.now() : 0;
    requestAnimationFrame(frame);
  }
  App.init = init; App.tick = tick; App.startGame = startGame; App.startDemo = startDemo;
  if (typeof document !== 'undefined' && document.getElementById && document.getElementById('game')) init();
})();
