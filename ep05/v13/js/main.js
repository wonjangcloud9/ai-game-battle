/* 어스름 전선 — main: 시작, 입력, 메인 루프
   시뮬레이션은 1/30초 고정 틱으로 돌고 화면은 그 사이를 보간한다.
   조작감(이 파일이 지키는 약속):
     · 명령은 입력 사건이 온 '그 자리에서' 내린다 (다음 프레임을 기다리지 않는다)
     · 내 명령이 들어오면 연출(멈칫·느려짐)을 걷어내고, 시뮬레이션 한 틱을 당겨 돌린다 → 몸이 다음 프레임에 반응한다
     · 몸의 방향은 부드럽게 돌지 않고 바로 돈다. 맞고 난 평타 동작은 이동 명령에 끊긴다
   타격감: 멈칫(hitstop)과 느려짐(slow)은 '시뮬레이션에 흘려보내는 시간'만 줄인다 → 화면은 계속 부드럽다.
     한 대 한 대의 무게(맞은 몸의 멈칫·떨림·번쩍·젖힘, 화면 툭)는 그림에만 걸린다(worldfx.js impact) → 시뮬레이션과 조작은 그대로 흐른다. */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map, W = TW.World, UI = TW.UI, Au = TW.Audio, FX = TW.FX, F = TW.Feel;
  const App = TW.App = {
    state: 'menu', G: null, me: null, canvas: null, ctx: null, dpr: 1, cssW: 1600, cssH: 900, resScale: 1,
    mouse: { x: 800, y: 450, down: [false, false, false], inside: true }, keys: {},
    last: 0, acc: 0, debt: 0, kick: false, aimSlot: -1, aimCharge: false, holdMove: false, holdT: 0, rallyT: -9, buyT: 0, moodT: 0, mood: 0,
    frameEma: 0.016, slowFrames: 0, frames: 0, err: null, errCount: 0, lastGame: null, deadCamT: 0,
  };
  /* 프레임 기록: 최근 10초의 프레임 간격(ms)과 판 전체의 느린 프레임 수. F3 로 화면에 띄운다 */
  const Perf = TW.Perf = { buf: new Float32Array(600), i: 0, n: 0, over20: 0, over34: 0, worst: 0, tickMs: 0, show: false, hz: 60 };
  Perf.reset = function () { Perf.n = 0; Perf.over20 = 0; Perf.over34 = 0; Perf.worst = 0; };
  Perf.fps = function () { const n = Math.min(Perf.n, 120); if (!n) return 0; let s = 0; for (let k = 1; k <= n; k++) s += Perf.buf[(Perf.i - k + 600) % 600]; return 1000 * n / s; };
  const nowMs = () => (globalThis.performance && performance.now ? performance.now() : Date.now());
  const KEY_SLOT = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 };
  const WHY = { cd: '아직 쓸 수 없습니다 (재사용 대기 중)', locked: '궁극기는 레벨 ' + C.ULT_LEVEL + '에 열립니다', cc: '지금은 움직일 수 없습니다', busy: '다른 동작 중입니다', dead: '부활을 기다리는 중입니다' };
  const PREF = 'eoseureum_prefs_v1';

  function savePrefs() { try { localStorage.setItem(PREF, JSON.stringify({ hero: UI.sel.hero, pos: UI.sel.pos, diff: UI.sel.diff, muted: UI.muted, music: UI.musicOn, autoBuy: UI.autoBuy, cast: UI.castMode })); } catch (e) { /* 저장 못 해도 진행 */ } }
  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) || 'null'); if (!p) return;
      if (TW.Heroes[p.hero]) UI.sel.hero = p.hero; if (TW.POS.indexOf(p.pos) >= 0) UI.sel.pos = p.pos; if (TW.Difficulty[p.diff]) UI.sel.diff = p.diff;
      UI.muted = !!p.muted; UI.musicOn = p.music !== false; UI.autoBuy = p.autoBuy !== false;
      if (p.cast === 'quick' || p.cast === 'aim') UI.castMode = p.cast;
    } catch (e) { /* 무시 */ }
  }
  function deny(msg) { UI.toast(msg || '지금은 쓸 수 없습니다', '#ffb0b8'); Au.play('deny'); }
  /* 친구 방(net.js): 경기 중이면 그 연결. 이때 내 입력은 게임 상태를 바로 바꾸지 않고 '몇 번째 틱에 무엇을 눌렀다'로 보낸다 →
     모든 화면이 같은 틱에 같은 명령을 적용한다(applyCmd). 누른 순간의 반응(몸 돌리기·클릭 표시·소리)은 그림에만 바로 건다. */
  const NET = () => (TW.Net && TW.Net.live && App.netGame) ? TW.Net : null;
  const r2 = (v) => Math.round(v * 100) / 100;          // 좌표는 0.01 칸으로 맞춰 보낸다 (보낸 값 그대로 내 화면에도 적용한다)

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
    if (App.netGame) { App.netGame = false; F.mpEnd(); }
    pos = pos || TW.bestPos(heroId);
    App.lastGame = { heroId, pos, diff };
    const G = App.G = new TW.Game({ playerHero: heroId, playerPos: pos, difficulty: diff, seed: (Math.random() * 1e9) | 0 });
    const me = App.me = G.player;
    // 먼저 '준비' 상태: 지형·그림·소리를 데우는 몇 프레임 동안은 경기 시간이 흐르지 않는다 → 경기는 첫 프레임부터 고르게 돈다 (tick 의 loading 참고)
    App.state = 'loading'; App.loadN = 0; App.loadT = 0; App.loadPrev = 1;
    App.acc = 0; App.debt = 0; App.kick = false; App.aimSlot = -1; App.buf = null; App.holdMove = false; App.buyT = 0.5; App.mood = 0; App.rallyT = -9;
    W.attach(G, me); W.resetFx(); W.cam.zoom = 1; W.cam.locked = true;
    W.prewarm(me.x, me.y, 99);
    UI.reset(); F.reset(); Perf.reset();
    Au.finish();
    savePrefs();
  }
  /* 친구 방 경기 시작 (net.js 가 방장이 정한 설정 cfg 를 모두에게 똑같이 넘긴다): 씨앗·팀 구성·사람 자리가 같으면 같은 경기다 */
  function startNetGame(cfg, myPid) {
    Au.init();
    App.netGame = true; App.lastGame = null;
    const G = App.G = new TW.Game({ teams: cfg.teams, humans: cfg.humans.map(q => ({ team: q.team, idx: q.idx })), difficulty: cfg.diff, seed: cfg.seed, mp: true });
    const mine = cfg.humans.find(q => q.pid === myPid);
    const me = App.me = G.heroes[mine.team * 5 + mine.idx];
    App.state = 'loading'; App.loadN = 0; App.loadT = 0; App.loadPrev = 1;
    App.acc = 0; App.debt = 0; App.kick = false; App.aimSlot = -1; App.buf = null; App.holdMove = false; App.buyT = 0.5; App.mood = 0; App.rallyT = -9; App.aimSent = null;
    W.attach(G, me); W.resetFx(); W.cam.zoom = 1; W.cam.locked = true;
    W.prewarm(me.x, me.y, 99);
    UI.reset(); F.reset(); F.mpStart(G.heroes.filter(h => h.isPlayer), me); Perf.reset();
    Au.finish();
    return G;
  }
  App.startNetGame = startNetGame;
  /* 준비가 끝났다: 경기 시작 */
  function beginPlay() {
    const G = App.G, me = App.me, pos = me.pos;
    App.state = 'play'; App.acc = 0; App.last = nowMs();
    const lane = TW.POS_LANE[pos];
    UI.announce('출전!', C.TEAM_COL[me.team], (pos === 'jg' ? '정글 — 숲의 몬스터를 잡고 수풀에서 기습하세요' : TW.POS_NAME[pos] + ' — 출전 바람을 타고 라인으로! 곧 적과 맞붙습니다') + ' · 첫 처치 +' + C.FIRST_BLOOD_GOLD + ' 골드', 3.4, { big: true });
    if (NET()) NET().began();
    // 가야 할 곳을 미니맵과 땅에 알려 준다
    const fireCamp = TW.Map.camps.find(k => k.kind === 'fire' && k.side === me.team) || { x: 80, y: 117 };
    const g = lane >= 0 ? TW.AI.lanePt(me.team, lane, TW.Map.lanes[lane].len * 0.44, 0) : { x: fireCamp.x, y: fireCamp.y };
    W.ping(g.x, g.y, '#ffe680', 'go', 14); W.pings[W.pings.length - 1].label = pos === 'jg' ? '첫 사냥감: 잉걸 두꺼비' : '이쪽으로!';
    Au.startGame();
  }
  function toMenu() {
    if (App.netGame) { App.netGame = false; F.mpEnd(); if (TW.Net && TW.Net.leave) TW.Net.leave(); }
    App.state = 'menu'; App.G = null; App.me = null; W.G = null; UI.reset(); UI.showT = UI.t; Au.menu();
  }
  UI.on.start = startGame;
  UI.on.restart = () => {
    if (App.netGame) { App.netGame = false; F.mpEnd(); App.state = 'menu'; App.G = null; App.me = null; W.G = null; UI.reset(); Au.menu(); if (TW.Net && TW.Net.toLobby) TW.Net.toLobby(); return; }       // 친구 방: 다시 하기 = 같은 방의 대기실로
    const l = App.lastGame; if (l) startGame(l.heroId, l.pos, l.diff);
  };
  UI.on.menu = toMenu;
  App.toMenuSilently = () => { App.netGame = false; F.mpEnd(); App.state = 'menu'; App.G = null; App.me = null; W.G = null; UI.reset(); Au.menu(); };      // 방장이 대기실로 불러들였을 때
  UI.on.friends =() => { Au.init(); Au.play('click'); if (TW.Net && TW.Net.openLobby) TW.Net.openLobby(); };
  UI.on.select = () => { Au.init(); Au.play('click'); };
  UI.on.click = () => Au.play('click');
  UI.on.prefs = () => { savePrefs(); Au.play('click'); };
  UI.on.mute = () => { Au.init(); UI.muted = !UI.muted; Au.setMuted(UI.muted); savePrefs(); };
  UI.on.music = () => { UI.musicOn = !UI.musicOn; Au.setMusic(UI.musicOn); savePrefs(); };
  UI.on.castMode = () => { UI.castMode = UI.castMode === 'quick' ? 'aim' : 'quick'; endAim(false); savePrefs(); Au.play('click'); };
  UI.on.pause = () => { if (App.state === 'play' && !UI.ended) { UI.paused = !UI.paused; UI.helpOpen = false; Au.play('click'); } };
  UI.on.buy = (id) => {
    const G = App.G, me = App.me; if (!G || !me) return;
    const N = NET();
    if (N) { const why = G.buyWhy(me, id); if (why) deny(why === 'max' ? '이미 완성한 아이템입니다' : '골드가 부족합니다'); else N.cmd(['by', id]); return; }
    if (!G.buy(me, id)) deny(G.buyWhy(me, id) === 'max' ? '이미 완성한 아이템입니다' : '골드가 부족합니다');
  };
  /* 한 번에 사기: 추천 순서대로 지금 골드로 살 수 있는 만큼 (V · 상점 단추 · 본진에 돌아왔을 때의 자동 구매) */
  function buyAllFor(G, h) {
    let n = 0;
    for (let k = 0; k < 27; k++) { const nb = TW.nextBuy(h); if (!nb || h.gold < nb.cost || !G.buy(h, nb.id)) break; n++; }
    return n;
  }
  function buyAll() {
    const G = App.G, me = App.me; if (!G || !me || G.over) return 0;
    const N = NET();
    if (N) {      // 친구 방: 살 수 있어 보이면 '한 번에 사기'를 보낸다 — 무엇을 살지는 그 틱의 골드로 모든 화면이 똑같이 정한다
      const nb = TW.nextBuy(me); if (!nb || me.gold < nb.cost) return 0;
      if (nowMs() - (App.baSent || -1e9) < 250) return 1;
      App.baSent = nowMs(); N.cmd(['ba']); return 1;
    }
    return buyAllFor(G, me);
  }
  App.buyAll = buyAll;
  UI.on.buyAll = () => { const me = App.me; if (!me) return; if (!buyAll()) { const nb = TW.nextBuy(me); deny(nb ? '골드가 부족합니다 — ' + TW.Items[nb.id].name + '까지 ' + Math.ceil(nb.cost - me.gold) + ' 골드' : '아이템을 모두 갖췄습니다'); } };
  UI.on.deny = deny;
  UI.on.recall = () => { const me = App.me; if (me && !me.dead) { if (NET()) NET().cmd(['rc']); else me.cmdRecall(); } };
  UI.on.roll = () => roll();
  UI.on.look = (x, y) => { if (W.cam.locked) UI.toast('화면 자유 이동 — Y를 누르면 내 영웅으로 돌아옵니다', '#cfe6ff'); W.cam.locked = false; W.cam.x = x; W.cam.y = y; };
  UI.on.miniMove = (x, y) => { const me = App.me; if (me && !me.dead) { orderMove(x, y, false); Au.play('move'); } };
  UI.on.castSlot = (i) => quickCast(i);
  UI.on.banner = (b) => Au.banner(b);

  /* ---------- 명령: 바로 반응한다 ---------- */
  /* 내 명령이 방금 들어갔다 → 연출을 걷어내고(입력이 연출보다 먼저다) 한 틱을 당겨 돌린다 */
  function acted() {
    App.kick = true; W.cmdAt = nowMs();
    W.hitstop = 0; if (W.slowT > 0 && !(App.G && App.G.over)) W.slowT = 0;
  }
  const canMoveNow = (me) => !(me.cc || me.rooted || me.dash || me.cast || me.taunter || me.wind);
  /* 친구 방: 이동을 누른 순간 몸을 첫 길목 쪽으로 돌려 둔다 (그림만 — 명령이 도착하면 시뮬레이션도 같은 쪽으로 돈다) */
  function predictFace(me, x, y) {
    if (!canMoveNow(me) || me.channel || me.charge) return;
    const q = me.standable(M.nearestWalkable(x, y)), path = M.findPath(me.x, me.y, q.x, q.y);
    let p = null; for (let i = 0; i < path.length; i++) { p = path[i]; if (U.dist(p.x, p.y, me.x, me.y) > 0.25) break; }
    if (p) W.snapFace(me, Math.atan2(p.y - me.y, p.x - me.x), NET().holdSec());
    W.cutAttack(me);
  }
  function orderMove(x, y, attackMove) {
    const me = App.me; if (!me || me.dead) return;
    const N = NET();
    if (N) { x = r2(x); y = r2(y); N.cmd(['mv', x, y, attackMove ? 1 : 0]); predictFace(me, x, y); acted(); return; }
    me.cmdMove(x, y, attackMove);
    const o = me.order;
    if (o && o.type === 'move' && canMoveNow(me) && !(me.channel && !me.channel.ab.chan.canMove)) {
      // 첫 길목 쪽으로 몸을 바로 돌리고, 남아 있던 평타 동작을 끊는다
      let p = null; for (let i = o.pi; i < o.path.length; i++) { p = o.path[i]; if (U.dist(p.x, p.y, me.x, me.y) > 0.25) break; }
      if (p && !me.channel && !me.charge) { const a = Math.atan2(p.y - me.y, p.x - me.x); me.facing = a; W.snapFace(me, a); }
      W.cutAttack(me);
    }
    acted();
  }
  function orderAttack(tg) {
    const me = App.me; if (!me || me.dead) return;
    const N = NET();
    if (N) { N.cmd(['at', tg.id]); if (canMoveNow(me) && !me.channel && !me.charge) W.snapFace(me, Math.atan2(tg.y - me.y, tg.x - me.x), N.holdSec()); acted(); return; }
    me.cmdAttack(tg);
    if (canMoveNow(me) && !me.channel && !me.charge) { const a = Math.atan2(tg.y - me.y, tg.x - me.x); me.facing = a; W.snapFace(me, a); }
    acted();
  }

  /* ---------- 스킬 ---------- */
  function allyNear(range) {
    const me = App.me; let best = null, bd = 7;
    for (const h of App.G.heroes) { if (h.dead || h.team !== me.team || h === me || U.du(h, me) > range) continue; const d = U.dist(h.x, h.y, W.mouse.x, W.mouse.y); if (d < bd) { bd = d; best = h; } }
    return best || me;
  }
  function doCast(slot, x, y) {
    const me = App.me, ab = me.hd.abilities[slot];
    const N = NET();
    if (N) {
      const why = me.castBlock(slot); if (why) { deny(WHY[why]); return false; }
      const ally = ab.type === 'ally' ? allyNear(ab.range) : null;
      x = r2(x); y = r2(y);
      N.cmd(['cs', slot, x, y, ally && ally !== me ? ally.id : 0]);
      if (ab.type === 'dir' || ab.type === 'ground' || ab.type === 'charge') W.snapFace(me, Math.atan2(y - me.y, x - me.x), N.holdSec());
      if (ab.type === 'charge') App.chargeSentAt = nowMs();
      W.cutAttack(me); acted();
      return true;
    }
    const r = me.cmdCast(slot, x, y, ab.type === 'ally' ? allyNear(ab.range) : null);
    if (r !== 'ok') { deny(WHY[r]); return false; }
    if (ab.type === 'dir' || ab.type === 'ground') W.snapFace(me, me.facing);
    W.cutAttack(me); acted();
    return true;
  }
  /* 조준 방식: 키를 누르고 있는 동안 조준선이 보이고, 떼면 나간다 */
  function beginAim(slot) {
    const me = App.me, ab = me.hd.abilities[slot], why = me.castBlock(slot);
    // 다른 동작이 막 끝나려는 참이면 잠깐 기억해 두었다가 이어서 쓴다 (연속 입력이 씹히지 않게)
    if (why === 'busy' || (why === 'cd' && me.cds[slot] < 0.3)) { App.buf = { slot, t: 0.4, held: true, quick: false }; return; }
    if (why) { deny(WHY[why]); return; }
    if (App.aimSlot >= 0 && App.aimSlot !== slot) endAim(false);
    if (ab.type === 'self') { doCast(slot, W.mouse.x, W.mouse.y); return; }
    if (ab.type === 'charge') { if (!NET()) { me.aimX = W.mouse.x; me.aimY = W.mouse.y; } if (doCast(slot, W.mouse.x, W.mouse.y)) { App.aimSlot = slot; App.aimCharge = true; } return; }
    App.aimSlot = slot; App.aimCharge = false;
  }
  function endAim(fire) {
    const slot = App.aimSlot; if (slot < 0) return;
    App.aimSlot = -1; W.aim = null;
    const me = App.me; if (!me || me.dead) return;
    if (App.aimCharge && NET()) { App.aimCharge = false; if (fire) { NET().cmd(['rl', r2(W.mouse.x), r2(W.mouse.y)]); acted(); } else NET().cmd(['ci']); return; }       // 모으기가 아직 도착 전이어도 같은 순서로 적용된다
    if (App.aimCharge) { App.aimCharge = false; if (me.charge) { if (fire) { me.cmdRelease(W.mouse.x, W.mouse.y); acted(); } else me.interruptActs(true); } return; }
    if (fire) doCast(slot, W.mouse.x, W.mouse.y);
  }
  /* 바로 쏘기: 키를 누르는 순간 커서 쪽으로 나간다. 어디로 나갔는지는 잔상 조준선이 잠깐 보여 준다 */
  function quickKey(slot) {
    const me = App.me, ab = me.hd.abilities[slot], why = me.castBlock(slot);
    if (why === 'busy' || (why === 'cd' && me.cds[slot] < 0.3)) { App.buf = { slot, t: 0.4, held: true, quick: true }; return; }
    if (why) { deny(WHY[why]); return; }
    if (App.aimSlot >= 0) endAim(false);
    if (ab.type === 'charge') { beginAim(slot); return; }       // 모으는 스킬은 누르는 동안 모으고, 떼면 나간다
    if (doCast(slot, W.mouse.x, W.mouse.y)) F.castGhost(slot, W.mouse.x, W.mouse.y);
  }
  function pressSkill(slot) { if (UI.castMode === 'quick') quickKey(slot); else beginAim(slot); }
  /* HUD 단추를 눌렀을 때: 가까운 적 영웅 쪽으로 바로 쓴다 */
  function quickCast(slot) {
    const me = App.me, G = App.G; if (!me || me.dead) return;
    const ab = me.hd.abilities[slot], why = me.castBlock(slot);
    if (why) { deny(WHY[why]); return; }
    let best = null, bd = (ab.range || 8) + 2;
    for (const h of G.heroes) { if (h.dead || h.team === me.team || !h.seen[me.team]) continue; const d = U.du(h, me); if (d < bd) { bd = d; best = h; } }
    const x = best ? best.x : me.x + Math.cos(me.facing) * (ab.range || 6), y = best ? best.y : me.y + Math.sin(me.facing) * (ab.range || 6);
    if (NET()) {
      if (ab.type === 'charge') { NET().cmd(['cs', slot, r2(x), r2(y), 0]); NET().cmd(['rl', r2(x), r2(y)]); acted(); return; }
      if (doCast(slot, x, y)) F.castGhost(slot, x, y);
      return;
    }
    if (ab.type === 'charge') { me.aimX = x; me.aimY = y; if (me.cmdCast(slot, x, y) === 'ok') { me.cmdRelease(x, y); acted(); } return; }
    me.aimX = x; me.aimY = y; if (doCast(slot, x, y)) F.castGhost(slot, x, y);
  }
  function roll() {
    const me = App.me; if (!me || me.dead) return;
    if (me.rollCd > 0) { deny('구르기 재사용 대기 중 (' + Math.ceil(me.rollCd) + '초)'); return; }
    if (App.aimSlot >= 0) endAim(false);
    if (NET()) {
      if (me.cc || me.rooted || me.dash || me.taunter) { deny(WHY.cc); return; }
      NET().cmd(['ro', r2(W.mouse.x), r2(W.mouse.y)]); W.cutAttack(me); acted(); return;
    }
    if (!me.cmdRoll(W.mouse.x, W.mouse.y)) deny(WHY.cc); else { W.cutAttack(me); acted(); }
  }
  /* A: 커서 가까이의 적을 친다 (한 대면 쓰러지는 미니언 → 영웅 → 가장 가까운 것). 가까이에 아무도 없으면 그곳까지 공격하며 이동 */
  function attackKey() {
    const me = App.me, G = App.G, mx = W.mouse.x, my = W.mouse.y;
    let best = null, bs = 1e9;
    for (const u of G.hash.query(mx, my, 4.5)) {
      if (u.team === me.team || !G.canTarget(me, u)) continue;
      let s = U.dist(u.x, u.y, mx, my) - u.r;
      if (u.isMinion && u.hp <= TW.atkPreview(me, u)) s -= 3; else if (u.isHero) s -= 1.5;
      if (s < bs) { bs = s; best = u; }
    }
    if (best) { orderAttack(best); W.clickMark(best.x, best.y, true, best); }
    else { orderMove(mx, my, true); const q = M.nearestWalkable(mx, my); W.clickMark(q.x, q.y, true); }
    Au.play('move');
  }

  /* ---------- 입력 ---------- */
  function syncMouse() { W.mouse.sx = App.mouse.x * App.dpr; W.mouse.sy = App.mouse.y * App.dpr; if (W.G) { const p = W.toWorld(W.mouse.sx, W.mouse.sy); W.mouse.x = p.x; W.mouse.y = p.y; } }
  function setMouse(e) { const r = App.canvas.getBoundingClientRect(); App.mouse.x = e.clientX - r.left; App.mouse.y = e.clientY - r.top; App.mouse.inside = true; syncMouse(); }
  const canCommand = () => App.state === 'play' && !UI.paused && !UI.ended && !UI.helpOpen && !!App.me && !App.me.dead && !!App.G && !App.G.over;
  /* 땅·유닛을 누른 클릭 → 그 자리에서 명령 */
  function worldCommand(c) {
    const me = App.me, G = App.G;
    if (App.aimSlot >= 0) {       // 조준 중: 왼쪽 = 지금 발사, 오른쪽 = 취소
      if (c.b === 0) { endAim(true); return; }
      endAim(false);
    }
    const sx = W.mouse.sx, sy = W.mouse.sy;
    const tg = W.pick(sx, sy, (u) => u.team !== me.team && G.canTarget(me, u));
    if (tg) { orderAttack(tg); W.clickMark(tg.x, tg.y, true, tg); Au.play('move'); }
    else {
      const locked = W.pick(sx, sy, (u) => u.team !== me.team && u.isStruct && !u.vulnerable);
      if (locked) UI.toast(locked.kind === 'core' ? '안쪽 등불탑을 하나 이상 부숴야 큰등불을 칠 수 있습니다' : '같은 길의 바깥 등불탑부터 부숴야 합니다', '#ffe680');
      const p = W.toWorld(sx, sy), q = M.nearestWalkable(p.x, p.y);
      orderMove(p.x, p.y, false); W.clickMark(q.x, q.y, false);
      App.holdMove = true; App.holdT = 0.16;
      Au.play('move');
    }
  }
  function onMouseDown(e) {
    if (e.preventDefault) e.preventDefault();
    setMouse(e);
    if (e.button !== 0 && e.button !== 2) return;
    App.mouse.down[e.button] = true;
    if (e.button === 0) UI.down = true;
    Au.init();
    const c = { x: App.mouse.x / UI.us, y: App.mouse.y / UI.us, b: e.button === 2 ? 2 : 0, used: false };
    // HUD 위가 아니면 프레임을 기다리지 않고 지금 명령한다
    if (canCommand() && !UI.pointOverUI(c.x, c.y)) { c.used = true; worldCommand(c); }
    UI.clicks.push(c);
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
    if (TW.Net && TW.Net.lobbyOpen && App.state === 'menu') return;          // 친구 방 대기실(글자 칸)에 치는 글자는 게임 단축키가 아니다
    if (code === 'Tab' || code === 'Space' || code === 'F1' || code === 'F3' || code.indexOf('Arrow') === 0) { if (e.preventDefault) e.preventDefault(); }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const first = !App.keys[code];
    App.keys[code] = true;
    if (!first) return;
    Au.init();
    if (code === 'KeyM') { UI.on.mute(); return; }
    if (code === 'F1') { UI.helpOpen = !UI.helpOpen; return; }
    if (code === 'F3') { Perf.show = !Perf.show; return; }
    if (App.state === 'menu') {
      if (code === 'Escape') UI.helpOpen = false;
      else if ((code === 'Enter' || code === 'NumpadEnter') && !UI.helpOpen) startGame(UI.sel.hero, UI.sel.pos, UI.sel.diff);
      return;
    }
    if (App.state !== 'play') return;         // 준비(loading) 중에는 누르지 않은 것으로 친다
    const me = App.me, G = App.G;
    if (code === 'Escape') {
      if (UI.ended) return;
      if (App.aimSlot >= 0) endAim(false); else if (UI.helpOpen) UI.helpOpen = false; else if (UI.shopOpen) UI.shopOpen = false; else UI.on.pause();
      return;
    }
    if (code === 'Tab') { UI.scoreOpen = true; return; }
    if (UI.ended || UI.paused || !me) return;
    if (code === 'KeyP') { UI.shopOpen = !UI.shopOpen; Au.play('click'); return; }
    if (code === 'KeyV') { UI.on.buyAll(); return; }       // 추천 아이템을 살 수 있는 만큼 한 번에 사기
    if (code === 'KeyY') { W.cam.locked = !W.cam.locked; UI.toast(W.cam.locked ? '화면 고정' : '화면 자유 이동 (Y로 다시 고정)', '#cfe6ff'); return; }
    if (me.dead) return;
    syncMouse();
    if (KEY_SLOT[code] !== undefined) { pressSkill(KEY_SLOT[code]); return; }
    if (code === 'Space' || code === 'KeyF') { roll(); return; }
    if (code === 'KeyA') { attackKey(); return; }
    if (code === 'KeyS') { if (NET()) NET().cmd(['st']); else me.cmdStop(); W.cutAttack(me); acted(); return; }
    if (code === 'KeyB') { if (NET()) NET().cmd(['rc']); else me.cmdRecall(); return; }
    if (code === 'KeyG') {
      if (G.t - App.rallyT < 4) return;
      App.rallyT = G.t;
      if (NET()) { NET().cmd(['ry', r2(W.mouse.x), r2(W.mouse.y)]); return; }      // 친구 방: 도착한 틱에 모두의 화면에서 부르고, 알림은 그때 띄운다 (rallyToast)
      rallyToast(G, me, W.mouse.x, W.mouse.y, TW.AI.rally(G, me.team, W.mouse.x, W.mouse.y));
    }
  }
  function rallyToast(G, me, mx, my, n) {
    {
      const lr = TW.AI.lastRally;
      const goes = lr ? lr.list.filter(e => e.st === 'go').length : 0, no = lr ? lr.list.filter(e => e.st === 'no').length : 0;
      W.ping(mx, my, '#ffe680', 'go', n ? Math.min(20, lr.far + 4) : 4);
      UI.toast(n ? '집결 신호! 아군 ' + n + '명이 옵니다' + (goes ? ' — 가장 가까운 아군 약 ' + Math.max(1, lr.eta) + '초' + (goes > 1 ? ', 다 모이기까지 약 ' + Math.max(1, lr.far) + '초' : '') : ' — 이미 곁에 있습니다') + (no ? ' · 못 오는 아군 ' + no + '명 (까닭은 오른쪽 위)' : '')
        : '집결 신호 — 지금은 올 수 있는 아군이 없습니다 (까닭은 오른쪽 위)', '#ffe680'); Au.play('ping');
    }
  }
  function onKeyUp(e) {
    const code = e.code;
    App.keys[code] = false;
    if (code === 'Tab') UI.scoreOpen = false;
    if (KEY_SLOT[code] !== undefined && App.buf && App.buf.slot === KEY_SLOT[code]) App.buf.held = false;
    if (KEY_SLOT[code] !== undefined && App.aimSlot === KEY_SLOT[code]) { syncMouse(); endAim(true); }
  }
  function clearInput() { App.keys = {}; App.mouse.down = [false, false, false]; UI.down = false; App.holdMove = false; UI.scoreOpen = false; App.buf = null; endAim(false); }

  /* ---------- 프레임 ---------- */
  function simStep() {
    const G = App.G;
    G.update(C.DT);
    const ev = G.events, me = App.me;
    for (let k = 0; k < ev.length; k++) { const e = ev[k]; W.onEvent(e); F.onEvent(e, G, me); UI.onEvent(e, G, me); Au.onEvent(e, G, me); }
    ev.length = 0;
  }

  /* ---------- 친구 방: 한 틱 = 그 틱의 명령(모든 사람 것, 정해진 순서) 적용 → 시뮬레이션 한 틱 ----------
     여기서 게임 상태를 바꾸는 것은 명령과 G.update 뿐이다. 모든 화면이 같은 틱에 같은 명령을 같은 순서로 적용하므로 같은 경기가 된다. */
  function applyCmd(G, h, c) {
    const me = App.replaying ? null : App.me, mine = h === me;          // 다시 돌리는 중(replayNetGame)에는 알림·그림을 건드리지 않는다
    switch (c[0]) {
      case 'mv': case 'mh': {
        h.cmdMove(c[1], c[2], !!c[3]);
        if (c[0] === 'mh') break;           // 누른 채 이동(되풀이)은 혼자 하기처럼 길만 새로 잡는다
        const o = h.order;
        if (o && o.type === 'move' && canMoveNow(h) && !(h.channel && !h.channel.ab.chan.canMove)) {
          let p = null; for (let i = o.pi; i < o.path.length; i++) { p = o.path[i]; if (U.dist(p.x, p.y, h.x, h.y) > 0.25) break; }
          if (p && !h.channel && !h.charge) { const a = Math.atan2(p.y - h.y, p.x - h.x); h.facing = a; if (mine) W.snapFace(h, a); }
          if (mine) W.cutAttack(h);
        }
        break;
      }
      case 'at': {
        const tg = G.unitById(c[1]); if (!tg || tg.dead || h.dead) break;
        h.cmdAttack(tg);
        if (canMoveNow(h) && !h.channel && !h.charge) { const a = Math.atan2(tg.y - h.y, tg.x - h.x); h.facing = a; if (mine) W.snapFace(h, a); }
        break;
      }
      case 'cs': {
        const slot = c[1], ab = h.hd.abilities[slot]; if (!ab) break;
        h.aimX = c[2]; h.aimY = c[3];
        const ally = c[4] ? G.unitById(c[4]) : null;
        const r = h.cmdCast(slot, c[2], c[3], ab.type === 'ally' ? (ally || h) : null);
        if (r === 'ok') { if (mine && (ab.type === 'dir' || ab.type === 'ground')) W.snapFace(h, h.facing); }
        else if (mine && r !== 'busy') deny(WHY[r]);
        break;
      }
      case 'rl': h.cmdRelease(c[1], c[2]); break;
      case 'ci': if (h.charge) h.interruptActs(true); break;
      case 'am': h.aimX = c[1]; h.aimY = c[2]; break;
      case 'ro': if (!h.cmdRoll(c[1], c[2]) && mine && !h.dead) deny(WHY.cc); break;
      case 'st': h.cmdStop(); break;
      case 'rc': h.cmdRecall(); break;
      case 'by': if (!G.buy(h, c[1]) && mine) deny(G.buyWhy(h, c[1]) === 'max' ? '이미 완성한 아이템입니다' : '골드가 부족합니다'); break;
      case 'ba': buyAllFor(G, h); break;
      case 'ry': { const n = TW.AI.rally(G, h.team, c[1], c[2]); if (mine) rallyToast(G, h, c[1], c[2], n); else if (me && h.team === me.team) { W.ping(c[1], c[2], '#ffe680', 'go', 6); UI.toast(h.name + ' (친구)가 집결 신호를 보냈습니다', '#ffe680'); } break; }
      case 'drop': TW.AI.takeOver(G, h); if (me) UI.toast((c[1] || '친구') + '가 나가서 ' + h.name + ' 자리를 봇이 이어받았습니다', '#cfe6ff'); break;
      default: break;
    }
  }
  /* frame = [[영웅 번호, 명령], ...] (net.js 가 사람 번호를 영웅 번호로 바꿔 넘긴다) */
  function netStep(frame) {
    const G = App.G;
    if (G.over) return;
    for (let i = 0; i < frame.length; i++) { const h = G.heroes[frame[i][0]]; if (h) applyCmd(G, h, frame[i][1]); }
    G.update(C.DT);
    const ev = G.events, me = App.me;
    F.simGoals(G, ev);                       // 목표 보상도 틱 안에서 (게임 상태를 바꾸므로)
    for (let k = 0; k < ev.length; k++) { const e = ev[k]; W.onEvent(e); F.onEvent(e, G, me); UI.onEvent(e, G, me); Au.onEvent(e, G, me); }
    ev.length = 0;
  }
  App.netStep = netStep; App.applyCmd = applyCmd;
  /* 친구 방: 두 화면이 어긋났을 때 맞추기 — 처음부터 받은 틱별 명령(flog)을 그대로 다시 돌려 새 경기 상태를 만든다 (그림·소리 없이, netStep 과 같은 순서).
     내 화면에서만 생긴 어긋남(입력이 아닌 데서 몰래 바뀐 값)은 이것으로 방장 화면과 같아진다. onTick(G, k): 틱 k 까지 돈 뒤 */
  function replayNetGame(cfg, myPid, flog, upto, onTick) {
    const G = new TW.Game({ teams: cfg.teams, humans: cfg.humans.map(q => ({ team: q.team, idx: q.idx })), difficulty: cfg.diff, seed: cfg.seed, mp: true });
    const mine = cfg.humans.find(q => q.pid === myPid), me = G.heroes[mine.team * 5 + mine.idx], humans = G.heroes.filter(h => h.isPlayer);
    const keepMp = F.mp, keepGl = F.gl, keepRally = TW.AI.lastRally;
    F.mp = humans; for (const h of humans) h._gl = { cur: null, n: 0, log: [], flash: null };
    App.replaying = true;
    try {
      for (let k = 0; k < upto; k++) {
        if (!G.over) { const frame = flog[k] || []; for (let i = 0; i < frame.length; i++) { const h = G.heroes[frame[i][0]]; if (h) applyCmd(G, h, frame[i][1]); } G.update(C.DT); F.simGoals(G, G.events); }
        G.events.length = 0;
        if (onTick) onTick(G, k + 1);
      }
    } finally { App.replaying = false; F.mp = keepMp; F.gl = keepGl; }
    return { G, me, humans, keepRally };
  }
  /* 다시 돌린 경기로 갈아탄다 / 못 맞췄으면 지금 경기의 지도 막힘을 되살린다 (new Game 이 지도를 처음으로 되돌리므로) */
  function adoptNetGame(r) {
    App.G = r.G; App.me = r.me;
    W.attach(r.G, r.me); W.resetFx(); W.cam.locked = true;
    F.mp = r.humans; F.gl = r.me._gl;
    App.aimSlot = -1; App.aimCharge = false; App.buf = null; W.aim = null;
  }
  function keepNetGame(r) {
    const G = App.G; M.reset();
    for (const s of G.structs) if (!s.dead) M.setBlock(s.x, s.y, s.r + (s.kind === 'core' ? 0.3 : 0.2), true);
    TW.AI.lastRally = r.keepRally;
  }
  App.replayNetGame = replayNetGame; App.adoptNetGame = adoptNetGame; App.keepNetGame = keepNetGame;
  /* 친구 방의 시간: 방장은 혼자 하기처럼 실제 시간으로 틱을 돌린다(내 명령이 오면 한 틱 당겨 돌리기도 그대로). 친구는 방장이 보낸 틱을 받는 대로 돈다.
     입력이 모자라면(친구의 틱이 아직 안 옴) 기다린다 — 시간을 쌓아 두지 않아서 늦게 와도 한꺼번에 몰아 돌지 않는다 */
  function netSim(rdt) {
    const N = NET(); if (!N || App.state !== 'play') return 0;
    let add = rdt;
    if (N.host) {
      if (App.debt > 0) { const pay = Math.min(App.debt, add * 0.5); add -= pay; App.debt -= pay; }
      App.acc += add;
      if (App.kick) { App.kick = false; if (App.acc < C.DT && App.debt <= 1e-6 && N.ready()) { App.debt = C.DT - App.acc; App.acc = C.DT; } }
    } else { App.kick = false; App.acc += add; }
    let n = 0;
    while (n < 8 && N.ready() && (App.acc >= C.DT || N.behind() > 2)) { N.step(netStep); App.acc = Math.max(0, App.acc - C.DT); n++; }
    if (!N.ready() && App.acc > C.DT) { N.wait(App.acc - C.DT); App.acc = C.DT; }
    return n;
  }
  App.netSim = netSim;
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
    if (App.state === 'loading') {
      // 화면은 그리되 시뮬레이션은 돌리지 않는다. 다섯 프레임 넘게 그렸고 프레임이 고르게 나오면(또는 2초가 지나면) 시작한다
      App.loadN++; App.loadT += rdt;
      W.update(rdt, 1); W.fxUpdate(rdt); F.update(rdt);
      W.updateCam(rdt, { x: me.x, y: me.y });
      const lp = W.toWorld(W.mouse.sx, W.mouse.sy); W.mouse.x = lp.x; W.mouse.y = lp.y; W.hover = null; W.aim = null;
      W.render(ctx);
      UI.begin(ctx, App.cssW, App.cssH, App.dpr, mouse.x, mouse.y, rdt);
      UI.drawHUD(ctx, G, me, rdt);
      if (App.loadT > 0.3) UI.toast('등불을 켜는 중…', '#ffe2a6');
      UI.end(ctx);
      UI.clicks.length = 0;
      Au.tick(rdt, 0);
      if ((App.loadN >= 5 && rdt < 0.022 && App.loadPrev < 0.022) || App.loadT > 2) beginPlay();
      App.loadPrev = rdt;
      return;
    }
    let scale = 1;
    const N = NET(), frozen = UI.paused && !N;          // 친구 방에서는 멈춤 창을 띄워도 경기는 흐른다 (혼자 멈추면 친구도 멈춘다)
    if (N) {
      if (G.over && !UI.ended) { UI.ended = { t: 0, win: !!me && G.winner === me.team }; W.slowT = 2.4; W.slowMax = 0; UI.shopOpen = false; UI.scoreOpen = false; endAim(false); Au.gameOver(UI.ended.win); }
      // 멈칫·느려짐은 그림(효과 시간)에만 건다 — 시뮬레이션 시간을 늦추면 친구 화면과 틱이 어긋난다
      if (W.hitstop > 0) { W.hitstop -= rdt; scale = 0.03; } else if (W.slowT > 0) { W.slowT -= rdt; const k = W.slowMax > 0 ? U.clamp(1 - W.slowT / W.slowMax, 0, 1) : -1; scale = k < 0 ? 0.32 : 0.2 + 0.8 * k * k; }
      if (App.holdMove && !(mouse.down[0] || mouse.down[2])) App.holdMove = false;
      if (App.holdMove && me && !me.dead && !UI.captured && !UI.paused && App.aimSlot < 0) { App.holdT -= rdt; if (App.holdT <= 0) { App.holdT = 0.1; const p = W.toWorld(W.mouse.sx, W.mouse.sy); N.cmd(['mh', r2(p.x), r2(p.y), 0]); } }
      // 조준점: 모으기·집중 스킬이 따라가는 커서 자리 → 바뀌었을 때만 틱마다 하나씩 보낸다
      if (me && !me.dead) {
        const busy = me.charge || me.channel || App.aimCharge, a = App.aimSent, dx = a ? W.mouse.x - a.x : 9, dy = a ? W.mouse.y - a.y : 9;
        if ((dx * dx + dy * dy > (busy ? 0.04 : 1.0)) && N.aimSlotFree()) { const x = r2(W.mouse.x), y = r2(W.mouse.y); N.cmd(['am', x, y]); App.aimSent = { x, y }; }
      }
      if (App.buf && me) {
        const b = App.buf; b.t -= rdt;
        if (me.dead || b.t <= 0) App.buf = null;
        else if (!me.castBlock(b.slot)) { App.buf = null; if (b.quick) quickKey(b.slot); else { beginAim(b.slot); if (!b.held && App.aimSlot === b.slot) endAim(true); } }
      }
      netSim(rdt);
      if (UI.autoBuy && me && !G.over && !me.dead) { App.buyT -= rdt; if (App.buyT <= 0) { App.buyT = 0.6; buyAll(); } }
    } else if (!UI.paused) {
      if (G.over && !UI.ended) { UI.ended = { t: 0, win: !!me && G.winner === me.team }; W.slowT = 2.4; W.slowMax = 0; UI.shopOpen = false; UI.scoreOpen = false; endAim(false); Au.gameOver(UI.ended.win); }
      // 느려짐: 처치의 느려짐(slowMax > 0)은 0.2배에서 시작해 부드럽게 제 속도로 돌아온다 (뚝 끊기지 않게). 내 명령이 들어오면 그 자리에서 풀린다(acted)
      if (W.hitstop > 0) { W.hitstop -= rdt; scale = 0.03; } else if (W.slowT > 0) { W.slowT -= rdt; const k = W.slowMax > 0 ? U.clamp(1 - W.slowT / W.slowMax, 0, 1) : -1; scale = k < 0 ? 0.32 : 0.2 + 0.8 * k * k; }
      // 누른 채 이동
      if (App.holdMove && !(mouse.down[0] || mouse.down[2])) App.holdMove = false;
      if (App.holdMove && me && !me.dead && !UI.captured && App.aimSlot < 0) { App.holdT -= rdt; if (App.holdT <= 0) { App.holdT = 0.1; const p = W.toWorld(W.mouse.sx, W.mouse.sy); me.cmdMove(p.x, p.y); } }
      if (me) { me.aimX = W.mouse.x; me.aimY = W.mouse.y; }
      if (App.buf && me) {         // 기억해 둔 스킬 입력
        const b = App.buf; b.t -= rdt;
        if (me.dead || b.t <= 0) App.buf = null;
        else if (!me.castBlock(b.slot)) { App.buf = null; if (b.quick) quickKey(b.slot); else { beginAim(b.slot); if (!b.held && App.aimSlot === b.slot) endAim(true); } }
      }
      // 시뮬레이션에 흘려보낼 시간. 내 명령이 방금 들어왔으면 한 틱을 당겨 돌리고(kick), 당겨 쓴 만큼은 이어지는 프레임에서 갚는다(debt) → 게임 속도는 그대로
      let add = rdt * scale;
      if (App.debt > 0) { const pay = Math.min(App.debt, add * 0.5); add -= pay; App.debt -= pay; }
      App.acc += add;
      if (App.kick) { App.kick = false; if (App.acc < C.DT && App.debt <= 1e-6 && scale === 1) { App.debt = C.DT - App.acc; App.acc = C.DT; } }
      let n = 0;
      while (App.acc >= C.DT && n < 4) { simStep(); App.acc -= C.DT; n++; }
      if (App.acc > C.DT) App.acc = 0;
      // 추천 아이템 자동 구매: 살 수 있게 되면 그 자리에서 (여럿이면 한 번에) → 세진 만큼이 한 장에 숫자로 뜬다
      // (본진에서만 사게 해 봤더니 같은 장면 6분에 '살 수 있는데 못 산 시간'이 1~1.5초 → 146~200초로 늘어 되돌렸다. AI 는 어디서든 산다)
      if (UI.autoBuy && me && !G.over) { App.buyT -= rdt; if (App.buyT <= 0) { App.buyT = 0.6; buyAll(); } }
    } else App.kick = false;
    const alpha = frozen ? 1 : U.clamp(App.acc / C.DT, 0, 1), fdt = frozen ? 0 : rdt * Math.max(scale, 0.3);
    W.update(fdt, alpha); W.fxUpdate(fdt); F.update(fdt);
    W.impactTick(frozen ? 0 : rdt);         // 한 대의 무게(멈칫·번쩍·젖힘)는 실제 시간으로 흐른다 — 그림에만 걸리고 시뮬레이션은 멈추지 않는다
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
      if (me.dead || (App.aimCharge && !me.charge && !(N && nowMs() - (App.chargeSentAt || 0) < N.holdSec() * 1000 + 250))) { App.aimSlot = -1; App.aimCharge = false; W.aim = null; }      // 친구 방: 보낸 '모으기'가 도착하기 전까지는 조준을 이어 간다
      else { const ab = me.hd.abilities[App.aimSlot]; W.aim = { slot: App.aimSlot, ab, x: W.mouse.x, y: W.mouse.y, ok: App.aimCharge || !me.castBlock(App.aimSlot), k: me.chargeK(), unit: ab.type === 'ally' ? allyNear(ab.range) : null }; }
    } else W.aim = null;
    W.render(ctx);
    UI.begin(ctx, App.cssW, App.cssH, App.dpr, mouse.x, mouse.y, rdt);
    UI.drawHUD(ctx, G, me, rdt);
    if (Perf.show) UI.drawPerf(ctx, Perf);
    if (N && N.hud) N.hud(ctx);             // 친구 방: 구석의 작은 지연(ms) 숫자 · 연결 알림
    UI.end(ctx);
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
  /* 화면이 60프레임을 못 지키면 먼저 입자를, 그래도 안 되면 해상도를 낮춘다 (한 번 낮추면 그 판 동안은 그대로) */
  function adapt(dt) {
    App.frameEma += (dt - App.frameEma) * 0.05; App.frames++;
    if (App.state !== 'play' || UI.paused || App.frames < 150) { App.slowFrames = 0; return; }
    if (App.frameEma > 0.0195) {         // 약 51프레임 아래로 1.5초쯤 이어지면
      if (++App.slowFrames > 90) {
        App.slowFrames = 0; App.frameEma = 0.0167;
        if (FX.quality > 0.55) { FX.quality = Math.max(0.5, FX.quality - 0.25); W.quality = FX.quality; }
        else if (App.resScale > 0.6) { App.resScale *= 0.88; resize(); }
      }
    } else App.slowFrames = 0;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - App.last) / 1000; App.last = now;
    if (!(dt > 0)) dt = 0.016;
    if (App.state === 'play' && !UI.paused && dt < 0.25) { const ms = dt * 1000; Perf.buf[Perf.i] = ms; Perf.i = (Perf.i + 1) % 600; Perf.n++; if (ms > 20) Perf.over20++; if (ms > 34) Perf.over34++; if (ms > Perf.worst) Perf.worst = ms; }
    if (dt > 0.25) dt = 0.016;                 // 탭을 떠났다 돌아온 경우
    adapt(dt);
    if (dt > 0.05) dt = 0.05;
    if (App.err && App.errCount > 5) return;
    const t0 = nowMs();
    try { tick(dt); } catch (err) { App.errCount++; showError(err); }
    Perf.tickMs += (nowMs() - t0 - Perf.tickMs) * 0.05;
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
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); if (App.state === 'play' && !UI.ended && !NET()) UI.paused = true; } });       // 친구 방은 멈추지 않는다 (탭을 가려도 net.js 가 받은 틱을 계속 돌린다)
    UI.showT = 0;
    App.last = (globalThis.performance && performance.now) ? performance.now() : 0;
    requestAnimationFrame(frame);
  }
  App.init = init; App.tick = tick; App.startGame = startGame; App.toMenu = toMenu; App.resize = resize; App.beginPlay = () => { if (App.state === 'loading') beginPlay(); };
  if (typeof document !== 'undefined' && document.getElementById && document.getElementById('game')) init();
})();
