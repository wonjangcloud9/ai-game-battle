/* 어스름 전선 — main: 시작, 입력, 메인 루프
   시뮬레이션은 1/30초 고정 틱으로 돌고 화면은 그 사이를 보간한다.
   타격감: 멈칫(hitstop)과 느려짐(slow)은 '시뮬레이션에 흘려보내는 시간'만 줄인다 → 화면은 계속 부드럽다. */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map, W = TW.World, UI = TW.UI, Au = TW.Audio, FX = TW.FX;
  const App = TW.App = {
    state: 'menu', G: null, me: null, canvas: null, ctx: null, dpr: 1, cssW: 1600, cssH: 900, resScale: 1,
    mouse: { x: 800, y: 450, down: [false, false, false], inside: true }, keys: {},
    last: 0, acc: 0, aimSlot: -1, aimCharge: false, holdMove: false, holdT: 0, rallyT: -9, buyT: 0, moodT: 0, mood: 0,
    frameEma: 0.016, slowFrames: 0, frames: 0, err: null, errCount: 0, lastGame: null, deadCamT: 0,
  };
  const KEY_SLOT = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 };
  const WHY = { cd: '아직 쓸 수 없습니다 (재사용 대기 중)', locked: '궁극기는 레벨 ' + C.ULT_LEVEL + '에 열립니다', cc: '지금은 움직일 수 없습니다', busy: '다른 동작 중입니다', dead: '부활을 기다리는 중입니다' };
  const PREF = 'eoseureum_prefs_v1';

  function savePrefs() { try { localStorage.setItem(PREF, JSON.stringify({ hero: UI.sel.hero, pos: UI.sel.pos, diff: UI.sel.diff, muted: UI.muted, music: UI.musicOn, autoBuy: UI.autoBuy })); } catch (e) { /* 저장 못 해도 진행 */ } }
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) || 'null'); if (!p) return;
      if (TW.Heroes[p.hero]) UI.sel.hero = p.hero; if (TW.POS.indexOf(p.pos) >= 0) UI.sel.pos = p.pos; if (TW.Difficulty[p.diff]) UI.sel.diff = p.diff;
      UI.muted = !!p.muted; UI.musicOn = p.music !== false; UI.autoBuy = p.autoBuy !== false;
    } catch (e) { /* 무시 */ }
  }
  function deny(msg) { UI.toast(msg || '지금은 쓸 수 없습니다', '#ffb0b8'); Au.play('deny'); }

  /* ---------- 화면 크기 ---------- */
  function resize() {
    const cv = App.canvas;
    App.cssW = Math.max(320, window.innerWidth || 1600); App.cssH = Math.max(240, window.innerHeight || 900);
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const maxPx = 2.8e6;
    if (App.cssW * App.cssH * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (App.cssW * App.cssH));
    dpr = Math.max(0.5, dpr * App.resScale);
    App.dpr = dpr;
    cv.width = Math.round(App.cssW * dpr); cv.height = Math.round(App.cssH * dpr);
    cv.style.width = App.cssW + 'px'; cv.style.height = App.cssH + 'px';
    App.ctx = cv.getContext('2d');
    W.resize(cv.width, cv.height, U.clamp(Math.min(App.cssW / 1600, App.cssH / 900), 0.55, 1.5) * dpr);
  }

  /* ---------- 시작 / 메뉴 ---------- */
  function startGame(heroId, pos, diff) {
    Au.init();
    pos = pos || TW.bestPos(heroId);
    App.lastGame = { heroId, pos, diff };
    const G = App.G = new TW.Game({ playerHero: heroId, playerPos: pos, difficulty: diff, seed: (Math.random() * 1e9) | 0 });
    const me = App.me = G.player;
    App.state = 'play'; App.acc = 0; App.aimSlot = -1; App.buf = null; App.holdMove = false; App.buyT = 0.5; App.mood = 0; App.rallyT = -9;
    W.attach(G, me); W.resetFx(); W.cam.zoom = 1; W.cam.locked = true;
    W.prewarm(me.x, me.y, 99);
    UI.reset();
    const lane = TW.POS_LANE[pos];
    UI.announce('출전!', C.TEAM_COL[0], pos === 'jg' ? '정글 — 숲의 몬스터를 잡고 수풀에서 기습하세요' : TW.POS_NAME[pos] + ' — 미니언이 벌써 맞붙고 있습니다', 3.2, { big: true });
    // 가야 할 곳을 미니맵과 땅에 알려 준다
    const fireCamp = TW.Map.camps.find(k => k.kind === 'fire' && k.side === 0) || { x: 80, y: 117 };
    const g = lane >= 0 ? TW.AI.lanePt(0, lane, TW.Map.lanes[lane].len * 0.44, 0) : { x: fireCamp.x, y: fireCamp.y };
    W.ping(g.x, g.y, '#ffe680', 'go', 14); W.pings[W.pings.length - 1].label = pos === 'jg' ? '첫 사냥감: 잉걸 두꺼비' : '이쪽으로!';
    Au.startGame();
    savePrefs();
  }
  function toMenu() { App.state = 'menu'; App.G = null; App.me = null; W.G = null; UI.reset(); UI.showT = UI.t; Au.menu(); }
  UI.on.start = startGame;
  UI.on.restart = () => { const l = App.lastGame; if (l) startGame(l.heroId, l.pos, l.diff); };
  UI.on.menu = toMenu;
  UI.on.select = () => { Au.init(); Au.play('click'); };
  UI.on.click = () => Au.play('click');
  UI.on.prefs = () => { savePrefs(); Au.play('click'); };
  UI.on.mute = () => { Au.init(); UI.muted = !UI.muted; Au.setMuted(UI.muted); savePrefs(); };
  UI.on.music = () => { UI.musicOn = !UI.musicOn; Au.setMusic(UI.musicOn); savePrefs(); };
  UI.on.pause = () => { if (App.state === 'play' && !UI.ended) { UI.paused = !UI.paused; UI.helpOpen = false; Au.play('click'); } };
  UI.on.buy = (id) => { const G = App.G, me = App.me; if (!G || !me) return; if (!G.buy(me, id)) deny(G.buyWhy(me, id) === 'max' ? '이미 완성한 아이템입니다' : '골드가 부족합니다'); };
  UI.on.deny = deny;
  UI.on.recall = () => { const me = App.me; if (me && !me.dead) me.cmdRecall(); };
  UI.on.roll = () => roll();
  UI.on.look = (x, y) => { if (W.cam.locked) UI.toast('화면 자유 이동 — Y를 누르면 내 영웅으로 돌아옵니다', '#cfe6ff'); W.cam.locked = false; W.cam.x = x; W.cam.y = y; };
  UI.on.miniMove = (x, y) => { const me = App.me; if (me && !me.dead) { me.cmdMove(x, y); Au.play('move'); } };
  UI.on.castSlot = (i) => quickCast(i);
  UI.on.banner = (b) => Au.banner(b);

  /* ---------- 스킬 ---------- */
  function allyNear(range) {
    const me = App.me; let best = null, bd = 7;
    for (const h of App.G.heroes) { if (h.dead || h.team !== me.team || h === me || U.du(h, me) > range) continue; const d = U.dist(h.x, h.y, W.mouse.x, W.mouse.y); if (d < bd) { bd = d; best = h; } }
    return best || me;
  }
  function doCast(slot, x, y) {
    const me = App.me, ab = me.hd.abilities[slot];
    const r = me.cmdCast(slot, x, y, ab.type === 'ally' ? allyNear(ab.range) : null);
    if (r !== 'ok') deny(WHY[r]);
    return r === 'ok';
  }
  function beginAim(slot) {
    const me = App.me, ab = me.hd.abilities[slot], why = me.castBlock(slot);
    // 다른 동작이 막 끝나려는 참이면 잠깐 기억해 두었다가 이어서 쓴다 (연속 입력이 씹히지 않게)
    if (why === 'busy' || (why === 'cd' && me.cds[slot] < 0.25)) { App.buf = { slot, t: 0.35, held: true }; return; }
    if (why) { deny(WHY[why]); return; }
    if (App.aimSlot >= 0 && App.aimSlot !== slot) endAim(false);
    if (ab.type === 'self') { doCast(slot, W.mouse.x, W.mouse.y); return; }
    if (ab.type === 'charge') { me.aimX = W.mouse.x; me.aimY = W.mouse.y; if (doCast(slot, W.mouse.x, W.mouse.y)) { App.aimSlot = slot; App.aimCharge = true; } return; }
    App.aimSlot = slot; App.aimCharge = false;
  }
  function endAim(fire) {
    const slot = App.aimSlot; if (slot < 0) return;
    App.aimSlot = -1; W.aim = null;
    const me = App.me; if (!me || me.dead) return;
    if (App.aimCharge) { App.aimCharge = false; if (me.charge) { if (fire) me.cmdRelease(W.mouse.x, W.mouse.y); else me.interruptActs(true); } return; }
    if (fire) doCast(slot, W.mouse.x, W.mouse.y);
  }
  /* HUD 단추를 눌렀을 때: 가까운 적 영웅 쪽으로 바로 쓴다 */
  function quickCast(slot) {
    const me = App.me, G = App.G; if (!me || me.dead) return;
    const ab = me.hd.abilities[slot], why = me.castBlock(slot);
    if (why) { deny(WHY[why]); return; }
    let best = null, bd = (ab.range || 8) + 2;
    for (const h of G.heroes) { if (h.dead || h.team === me.team || !h.seen[me.team]) continue; const d = U.du(h, me); if (d < bd) { bd = d; best = h; } }
    const x = best ? best.x : me.x + Math.cos(me.facing) * (ab.range || 6), y = best ? best.y : me.y + Math.sin(me.facing) * (ab.range || 6);
    if (ab.type === 'charge') { me.aimX = x; me.aimY = y; if (me.cmdCast(slot, x, y) === 'ok') me.cmdRelease(x, y); return; }
    me.aimX = x; me.aimY = y; doCast(slot, x, y);
  }
  function roll() {
    const me = App.me; if (!me || me.dead) return;
    if (me.rollCd > 0) { deny('구르기 재사용 대기 중 (' + Math.ceil(me.rollCd) + '초)'); return; }
    if (App.aimSlot >= 0) endAim(false);
    if (!me.cmdRoll(W.mouse.x, W.mouse.y)) deny(WHY.cc);
  }

  /* ---------- 입력 ---------- */
  function setMouse(e) { const r = App.canvas.getBoundingClientRect(); App.mouse.x = e.clientX - r.left; App.mouse.y = e.clientY - r.top; App.mouse.inside = true; }
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
    if (!App.mouse.down[0] && !App.mouse.down[2]) App.holdMove = false;
  }
  function onWheel(e) {
    if (e.preventDefault) e.preventDefault();
    if (App.state !== 'play' || UI.shopOpen || UI.paused || UI.ended) return;
    if (!e.deltaY) return;                                               // 가로 스크롤은 무시
    const zk = U.clamp(Math.abs(e.deltaY) / 100, 0.12, 1);              // 터치패드의 잔 스크롤은 조금씩만
    W.cam.zoom = U.clamp(W.cam.zoom * (e.deltaY > 0 ? 1 - 0.06 * zk : 1 + 0.065 * zk), 0.78, 1.22);
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
    if (code === 'F1') { UI.helpOpen = !UI.helpOpen; return; }
    if (App.state === 'menu') {
      if (code === 'Escape') UI.helpOpen = false;
      else if ((code === 'Enter' || code === 'NumpadEnter') && !UI.helpOpen) startGame(UI.sel.hero, UI.sel.pos, UI.sel.diff);
      return;
    }
    const me = App.me, G = App.G;
    if (code === 'Escape') {
      if (UI.ended) return;
      if (App.aimSlot >= 0) endAim(false); else if (UI.helpOpen) UI.helpOpen = false; else if (UI.shopOpen) UI.shopOpen = false; else UI.on.pause();
      return;
    }
    if (code === 'Tab') { UI.scoreOpen = true; return; }
    if (UI.ended || UI.paused || !me) return;
    if (code === 'KeyP') { UI.shopOpen = !UI.shopOpen; Au.play('click'); return; }
    if (code === 'KeyY') { W.cam.locked = !W.cam.locked; UI.toast(W.cam.locked ? '화면 고정' : '화면 자유 이동 (Y로 다시 고정)', '#cfe6ff'); return; }
    if (me.dead) return;
    if (KEY_SLOT[code] !== undefined) { beginAim(KEY_SLOT[code]); return; }
    if (code === 'Space' || code === 'KeyF') { roll(); return; }
    if (code === 'KeyA') { me.cmdMove(W.mouse.x, W.mouse.y, true); W.clickMark(W.mouse.x, W.mouse.y, true); return; }
    if (code === 'KeyS') { me.cmdStop(); return; }
    if (code === 'KeyB') { me.cmdRecall(); return; }
    if (code === 'KeyG') {
      if (G.t - App.rallyT < 4) return;
      App.rallyT = G.t;
      const n = TW.AI.rally(G, me.team, W.mouse.x, W.mouse.y);
      W.ping(W.mouse.x, W.mouse.y, '#ffe680', 'go', 4); UI.toast(n ? '집결 신호! 아군 ' + n + '명이 이곳으로 옵니다' : '집결 신호 — 올 수 있는 아군이 없습니다', '#ffe680'); Au.play('ping');
    }
  }
  function onKeyUp(e) {
    const code = e.code;
    App.keys[code] = false;
    if (code === 'Tab') UI.scoreOpen = false;
    if (KEY_SLOT[code] !== undefined && App.buf && App.buf.slot === KEY_SLOT[code]) App.buf.held = false;
    if (KEY_SLOT[code] !== undefined && App.aimSlot === KEY_SLOT[code]) endAim(true);
  }
  function clearInput() { App.keys = {}; App.mouse.down = [false, false, false]; UI.down = false; App.holdMove = false; UI.scoreOpen = false; App.buf = null; endAim(false); }

  function worldClicks() {
    const me = App.me, G = App.G;
    for (const c of UI.clicks) {
      if (c.used) continue;
      if (App.state !== 'play' || UI.paused || UI.ended || !me || me.dead) continue;
      c.used = true;
      if (App.aimSlot >= 0) {       // 조준 중: 왼쪽 = 지금 발사, 오른쪽 = 취소
        if (c.b === 0) { endAim(true); continue; }
        endAim(false);
      }
      const sx = c.x * UI.us * App.dpr, sy = c.y * UI.us * App.dpr;
      const tg = W.pick(sx, sy, (u) => u.team !== me.team && G.canTarget(me, u));
      if (tg) { me.cmdAttack(tg); W.clickMark(tg.x, tg.y, true); Au.play('move'); }
      else {
        const locked = W.pick(sx, sy, (u) => u.team !== me.team && u.isStruct && !u.vulnerable);
        if (locked) UI.toast(locked.kind === 'core' ? '안쪽 등불탑을 하나 이상 부숴야 큰등불을 칠 수 있습니다' : '같은 길의 바깥 등불탑부터 부숴야 합니다', '#ffe680');
        const p = W.toWorld(sx, sy), q = M.nearestWalkable(p.x, p.y);
        me.cmdMove(p.x, p.y); W.clickMark(q.x, q.y, false);
        App.holdMove = App.mouse.down[0] || App.mouse.down[2]; App.holdT = 0.16;
        Au.play('move');
      }
    }
  }

  /* ---------- 프레임 ---------- */
  function simStep() {
    const G = App.G;
    G.update(C.DT);
    const ev = G.events, me = App.me;
    for (let k = 0; k < ev.length; k++) { const e = ev[k]; W.onEvent(e); UI.onEvent(e, G, me); Au.onEvent(e, G, me); }
    ev.length = 0;
  }
  /* 지금 얼마나 격한 상황인가 (배경 음악이 따라간다): 0 평온 · 1 교전 · 2 영웅전 · 3 한타/이무기/본진 */
  function mood(G, me) {
    if (!me) return 1;
    let near = 0, allies = 0;
    for (const h of G.heroes) { if (h.dead) continue; const d = U.du(h, me); if (h.team !== me.team) { if (h.seen[me.team] && d < 16) near++; } else if (h !== me && d < 16) allies++; }
    const boss = G.bossCamp.alive[0];
    if ((near >= 2 && allies >= 2) || (boss && boss.target && U.du(me, boss) < 18) || (G.t - G.cores[me.team].lastHurt < 4)) return 3;
    if (G.t - me.lastHeroFight < 4 || near >= 1) return 2;
    if (G.t - me.lastAct < 4 || G.t - me.lastHurt < 4) return 1;
    return 0;
  }
  function tick(rdt) {
    const ctx = App.ctx, mouse = App.mouse;
    W.mouse.sx = mouse.x * App.dpr; W.mouse.sy = mouse.y * App.dpr;
    if (App.state === 'menu') {
      UI.begin(ctx, App.cssW, App.cssH, App.dpr, mouse.x, mouse.y, rdt);
      TW.UIMenu.drawMenu(ctx);
      UI.end(ctx);
      UI.clicks.length = 0;
      if (App.canvas.style.cursor !== UI.cursor) App.canvas.style.cursor = UI.cursor;
      Au.tick(rdt, 0);
      return;
    }
    const G = App.G, me = App.me;
    let scale = 1;
    if (!UI.paused) {
      if (G.over && !UI.ended) { UI.ended = { t: 0, win: !!me && G.winner === me.team }; W.slowT = 2.4; UI.shopOpen = false; UI.scoreOpen = false; endAim(false); Au.gameOver(UI.ended.win); }
      if (W.hitstop > 0) { W.hitstop -= rdt; scale = 0.03; } else if (W.slowT > 0) { W.slowT -= rdt; scale = 0.32; }
      // 누른 채 이동
      if (App.holdMove && !(mouse.down[0] || mouse.down[2])) App.holdMove = false;
      if (App.holdMove && me && !me.dead && !UI.captured && App.aimSlot < 0) { App.holdT -= rdt; if (App.holdT <= 0) { App.holdT = 0.1; const p = W.toWorld(W.mouse.sx, W.mouse.sy); me.cmdMove(p.x, p.y); } }
      if (me) { me.aimX = W.mouse.x; me.aimY = W.mouse.y; }
      if (App.buf && me) {         // 기억해 둔 스킬 입력
        const b = App.buf; b.t -= rdt;
        if (me.dead || b.t <= 0) App.buf = null;
        else if (!me.castBlock(b.slot)) { App.buf = null; beginAim(b.slot); if (!b.held && App.aimSlot === b.slot) endAim(true); }
      }
      App.acc += rdt * scale;
      let n = 0;
      while (App.acc >= C.DT && n < 4) { simStep(); App.acc -= C.DT; n++; }
      if (App.acc > C.DT) App.acc = 0;
      // 추천 아이템 자동 구매
      if (UI.autoBuy && me && !G.over) { App.buyT -= rdt; if (App.buyT <= 0) { App.buyT = 0.6; const nb = TW.nextBuy(me); if (nb && me.gold >= nb.cost) G.buy(me, nb.id); } }
    }
    const alpha = UI.paused ? 1 : U.clamp(App.acc / C.DT, 0, 1), fdt = UI.paused ? 0 : rdt * Math.max(scale, 0.3);
    W.update(fdt, alpha); W.fxUpdate(fdt);
    // 카메라
    const cam = W.cam;
    if (G.over) { const core = G.cores[1 - G.winner]; W.updateCam(rdt, { x: core.x, y: core.y - 2 }, true); }
    else if (cam.locked && me && !me.dead) W.updateCam(rdt, { x: me.px + (me.x - me.px) * alpha, y: me.py + (me.y - me.py) * alpha - (me.z || 0) * 0.3 });
    else {
      const sp = 44 / cam.zoom * rdt, k = App.keys, edge = 10; let mx = 0, my = 0;
      if (k.ArrowLeft) mx -= 1; if (k.ArrowRight) mx += 1; if (k.ArrowUp) my -= 1; if (k.ArrowDown) my += 1;
      if (!cam.locked && mouse.inside && !UI.captured && !UI.shopOpen && !UI.paused) { if (mouse.x < edge) mx -= 1; else if (mouse.x > App.cssW - edge) mx += 1; if (mouse.y < edge) my -= 1; else if (mouse.y > App.cssH - edge) my += 1; }
      cam.x += mx * sp; cam.y += my * sp;
      W.updateCam(rdt, null);
    }
    if ((App.keys.ArrowLeft || App.keys.ArrowRight || App.keys.ArrowUp || App.keys.ArrowDown) && cam.locked && !UI.shopOpen) cam.locked = false;
    // 커서 아래
    const wp = W.toWorld(W.mouse.sx, W.mouse.sy); W.mouse.x = wp.x; W.mouse.y = wp.y;
    W.hover = (UI.captured || !me || UI.paused) ? null : W.pick(W.mouse.sx, W.mouse.sy, (u) => u !== me);
    if (App.aimSlot >= 0 && me) {
      if (me.dead || (App.aimCharge && !me.charge)) { App.aimSlot = -1; App.aimCharge = false; W.aim = null; }
      else { const ab = me.hd.abilities[App.aimSlot]; W.aim = { slot: App.aimSlot, ab, x: W.mouse.x, y: W.mouse.y, ok: App.aimCharge || !me.castBlock(App.aimSlot), k: me.chargeK(), unit: ab.type === 'ally' ? allyNear(ab.range) : null }; }
    } else W.aim = null;
    W.render(ctx);
    UI.begin(ctx, App.cssW, App.cssH, App.dpr, mouse.x, mouse.y, rdt);
    UI.drawHUD(ctx, G, me, rdt);
    UI.end(ctx);
    worldClicks();
    UI.clicks.length = 0;
    let cur = UI.cursor;
    if (cur === 'default' && !UI.captured && !UI.paused && !UI.ended) { if (App.aimSlot >= 0) cur = 'crosshair'; else if (W.hover && me && W.hover.team !== me.team) cur = 'crosshair'; }
    if (App.canvas.style.cursor !== cur) App.canvas.style.cursor = cur;
    App.moodT -= rdt; if (App.moodT <= 0) { App.moodT = 0.5; App.mood = G.over ? 0 : mood(G, me); }
    Au.tick(rdt, App.mood, G, me);
  }
  function showError(err) {
    if (App.err) return;
    App.err = err;
    try { const d = document.getElementById('err'); if (d) { d.style.display = 'block'; d.textContent = '오류가 났습니다. 새로고침(F5) 해 주세요.\n' + (err && err.stack ? err.stack : String(err)); } } catch (e) { /* 무시 */ }
    if (globalThis.console) console.error(err);
  }
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - App.last) / 1000; App.last = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.25) dt = 0.016;                 // 탭을 떠났다 돌아온 경우
    // 계속 느리면 해상도와 입자 수를 낮춘다
    App.frameEma += (dt - App.frameEma) * 0.05; App.frames++;
    if (App.state === 'play' && App.frames > 150 && (App.frameEma > 0.045 || (App.frameEma > 0.036 && App.resScale > 0.9))) { if (++App.slowFrames > 90 && App.resScale > 0.55) { App.resScale *= 0.85; FX.quality = Math.max(0.5, FX.quality - 0.2); W.quality = FX.quality; App.slowFrames = 0; App.frameEma = 0.016; resize(); } } else App.slowFrames = 0;
    if (dt > 0.05) dt = 0.05;
    if (App.err && App.errCount > 5) return;
    try { tick(dt); } catch (err) { App.errCount++; showError(err); }
  }
  function init() {
    const cv = App.canvas = document.getElementById('game');
    loadPrefs();
    Au.setMuted(UI.muted); Au.setMusic(UI.musicOn);
    resize();
    window.addEventListener('resize', resize);
    cv.addEventListener('mousedown', onMouseDown);
    cv.addEventListener('contextmenu', (e) => { if (e.preventDefault) e.preventDefault(); });
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('mouseleave', () => { App.mouse.inside = false; });
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', setMouse);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (App.state === 'play' && !UI.ended) UI.paused = true; } });
    UI.showT = 0;
    App.last = (globalThis.performance && performance.now) ? performance.now() : 0;
    requestAnimationFrame(frame);
  }
  App.init = init; App.tick = tick; App.startGame = startGame; App.toMenu = toMenu; App.resize = resize;
  if (typeof document !== 'undefined' && document.getElementById && document.getElementById('game')) init();
})();
