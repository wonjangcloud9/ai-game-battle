/* 게임 진행 — 입실 → 신분 확인·전자기기 수거·탐지기 검사 → 준비령 → 배부 → 본령 → 시험 → 종료령(또는 적발) → 에필로그 → 결과
 * 감독관은 두 명: 정감독(proctor)이 말하고 내 줄을 맡고, 부감독(proctor2)이 다른 줄을 돌다가 시험 중에는 교실 뒤를 지킨다.
 * AI 안경 기기는 glasses.js, 그것이 남의 눈·귀에 걸리는 경로와 긴장은 notice.js, 어느 엔딩으로 끝나는지와 에필로그는 endings.js,
 * 처음 하는 사람을 위한 조작 안내는 coach.js 에 있다. 여기는 대본과 규칙.
 */
(function (GX) {
  'use strict';
  var W = GX.W, UI = GX.UI, Au = GX.Audio, Input = GX.Input;
  var EXAM_SECONDS = 300;      /* 실제 5분 = 교실 시계로 80분(09:30~10:50) */
  var T_BELL = 9.5 * 3600;
  var WATCH_AT = 55;           /* 의심이 이만큼 차면 감독관이 옆에 와서 지켜본다 */
  var INSPECT_AT = 80;         /* 이만큼 차면 안경을 벗겨 검사한다(한 번) */
  var PRE = { pre: true };     /* 시험 전의 안경: 글자만 알아보는 대기 상태 */
  var WALK_HURRY = 45;         /* 자리를 못 찾고 이만큼(초) 지나면 재촉한다 */
  var WALK_LIMIT = 75;         /* 이만큼 지나면 입실 마감: 감독관이 자리로 데려다 앉힌다(한 판이 끝없이 늘어지지 않게) */
  var COVER_AUTO = 8;          /* 본령이 울리고 이만큼 지나도 표지를 넘기지 않으면 넘긴 것으로 친다 */

  function clockText(t) {
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function mmss(s) {
    s = Math.max(0, Math.ceil(s));
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function Game(eng, canvas) {
    this.eng = eng; this.canvas = canvas;
    this.tx = GX.buildTextures(eng);
    this.world = GX.buildClassroom(eng, this.tx);
    this.player = new GX.Player();
    this.proctor = new GX.Proctor(eng, this.world, 'chief');
    this.proctor2 = new GX.Proctor(eng, this.world, 'assist');
    this.proctor.other = this.proctor2; this.proctor2.other = this.proctor;
    this.proctors = [this.proctor, this.proctor2];
    var self = this;
    var step = function (x, z, sp, who) {
      /* 빨리 감는 동안에는 걸음도 여덟 배로 잦아진다: 수험생 소리와 마찬가지로 여덟에 하나만 내서 소리의 빽빽함을 그대로 둔다 */
      if (self.ffwd && Math.random() > 0.125) return;
      Au.step(x, z, sp > 1.3 ? 1.2 : 0.85, who.chief ? 0 : 1);
    };
    this.proctor.onStep = step; this.proctor2.onStep = step;
    /* 감독관 책상에 내려놓은 수거함 두 개 */
    this.deskBasket = eng.add(this.proctor.rig.basket.mesh, { visible: false });
    GX.M4.fromPose(this.deskBasket.model, -2.52, W.DESK_Y + 0.066, -3.8, 0.2, 0, 0);
    this.deskBasket2 = eng.add(this.proctor.rig.basket.mesh, { visible: false });
    GX.M4.fromPose(this.deskBasket2.model, -2.94, W.DESK_Y + 0.066, -3.74, -0.12, 0, 0);
    this.npcs = []; this.present = []; this.exam = null;
    this.dev = new GX.Glasses();
    this.phase = 'title'; this.script = null; this.tasks = []; this.t = 0;
    this.titleT = 0;
    this.ffwd = false;
    this.aspect = 16 / 9;
    this.onResult = null; this.onRestart = null; this.onTitle = null;
    this.newSession((GX.SEED !== undefined) ? GX.SEED : ((Date.now() ^ (Math.random() * 1e9)) >>> 0));
  }

  /* ───────── 한 판 준비(자리·결시자·문항을 새로 뽑는다) ───────── */
  Game.prototype.newSession = function (seed) {
    var g = this, eng = g.eng, world = g.world, i;
    for (i = 0; i < g.npcs.length; i++) g.npcs[i].dispose();
    if (g.present.length) GX.disposeDeskProps(eng, world, g.present);
    if (g.exam) g.exam.dispose();
    g.tasks = [];
    g.seed = seed >>> 0;
    var r = g.rnd = GX.rng(g.seed);
    var cands = [];
    for (var c = 1; c <= 3; c++) for (var row = 1; row <= 3; row++) cands.push(c * 5 + row);
    var mine = cands[Math.floor(r() * cands.length)];
    if (GX.DEBUG_SEAT !== undefined) mine = GX.DEBUG_SEAT;
    var absent = {};
    while (Object.keys(absent).length < 3) {
      var a = Math.floor(r() * 20);
      if (a !== mine) absent[a] = 1;
    }
    g.seat = world.seats[mine];
    g.present = world.seats.filter(function (s) { return s.i !== mine && !absent[s.i]; });
    g.emptySeats = world.seats.filter(function (s) { return !!absent[s.i]; });
    GX.buildDeskProps(eng, world, g.present);
    g.npcs = g.present.map(function (s) {
      var n = new GX.Examinee(eng, s, r, world);
      n.onSound = function (type, who, o) { g.npcSound(type, who, o); };
      return n;
    });
    g.exam = new GX.Exam(eng, world, g.seat, r);
    g.player.reset();
    g.proctor.reset(); g.proctor2.reset();
    g.proctor.autoLook = false; g.proctor2.autoLook = true;
    g.deskBasket.visible = false; g.deskBasket2.visible = false;
    world.door.target = 1; world.door.open = 1;
    world.clockTime = 8 * 3600 + 52 * 60; g.clockTarget = world.clockTime; g.clockRate = 14;
    g.sus = 0; g.peak = 0; g.uses = 0; g.floor = 0; g.clean = 0; g.lookT = 0;
    g.att = 0; g.heart = 0; g.left = EXAM_SECONDS;
    g.glasses = 'ai'; g.submitted = false; g.caught = false;
    g.confiscated = false;       /* 시험 전 탐지기 검사에서 안경을 빼앗겼는가 */
    g.marked = false;            /* 탐지기가 울렸지만 넘어갔는가(감독관이 얼굴을 기억한다) */
    g.inspecting = false;        /* 시험 중 안경 검사가 진행 중인가 */
    g.specsTaken = false;        /* 안경이 감독관 손에 가 있는가(검사하느라 벗겨 갔거나 빼앗겼다) */
    g.caughtWhy = 'sus';         /* 적발 까닭: sus(의심이 가득 참) · lit(검사 때 렌즈가 켜져 있었음) · warm(검사 때 안경이 뜨거웠음) */
    g.noHands = false;
    g.want = null; g.placed = false; g.idShown = false; g.phoneGiven = false; g.choicePick = -1; g.choosing = false;
    g.flags = {}; g.walkT = 0; g.greetT = 0; g.passT = 0;
    g.walkAll = 0;               /* 복도에 선 뒤로 흐른 시간(자리 찾기 제한 시간) */
    g.coverT = 0;                /* 본령 뒤 표지를 넘기지 않고 보낸 시간 */
    g.wheelQuiet = 0;            /* 마우스 휠 신호가 잠잠해지기를 기다리는 시간(한 번 굴린 것을 한 장으로 치려고) */
    g.playT = 0;                 /* 이번 판에 실제로 흐른 시간(빨리 감은 구간은 감은 만큼만 센다) */
    g.ffHold = false;            /* 본령 전부터 누르고 있던 T 를 아직 떼지 않았는가(시험 중 빨리 보내기를 막아 둔다) */
    g.ending = null;             /* 어느 엔딩으로 끝났는가(endings.js 의 judge 가 채운다) */
    g.ffwd = false;
    /* 안경: 복도에서는 켜진 채로 시작한다. 배터리는 판마다 다르다(어젯밤에 덜 충전했다) */
    g.dev.rnd = GX.rng((g.seed ^ 0x5bd1e995) >>> 0);
    g.dev.reset({ power: 'on', battery: 58 + Math.floor(r() * 13) });
    g.noticeReset();
    g.coachReset();
    g.findNeighbors();
    UI.setBlur(0); UI.setLens(null); UI.setPeek(false, false); UI.setMarker(null); UI.epilogue(null);
  };

  /* 수험생이 내는 소리(위치·목소리 높이와 함께 오디오로 넘긴다) */
  Game.prototype.npcSound = function (type, who, o) {
    if (this.phase === 'title' || this.phase === 'result' || this.phase === 'intro' || this.phase === 'epilogue') return;
    if (this.ffwd && Math.random() > 0.125) return;      /* 빨리 감는 동안에도 소리의 빽빽함은 그대로 */
    var y = type === 'cough' || type === 'sigh' || type === 'sniff' || type === 'throat' ? 1.1 : (type === 'creak' ? 0.4 : 0.76);
    Au.npc(type, who.cx, y, who.cz - (y > 1 ? 0.15 : 0.45), who.voice, o);
  };

  /* ───────── 대본용 도우미(제너레이터) ───────── */
  function* wait(s) { var t = 0; while (t < s) t += (yield) || 0; }
  function* until(fn, timeout) {
    var t = 0;
    while (!fn()) { t += (yield) || 0; if (timeout && t >= timeout) return false; }
    return true;
  }
  /* 대본과 나란히 도는 곁가지(부감독이 맡은 줄 등). 끝나면 done 이 true */
  Game.prototype.spawn = function (gen) {
    var t = { gen: gen, done: false };
    this.tasks.push(t);
    return t;
  };
  Game.prototype.say = function* (kind, text, o) {
    var P = (o && o.who) || this.proctor, d = UI.say(kind, text, o && o.dur);
    /* 기다리는 시간을 빨리 보내는 동안에는 말소리를 내지 않는다(여덟 배로 겹쳐 울린다) */
    if (this.ffwd) { /* 자막만 스친다 */ }
    else if (kind === 'proctor') Au.voice(text, P.chief ? 'proctor' : 'proctor2', [P.x, 1.6, P.z]);
    else if (kind === 'pa') Au.voice(text, 'pa');
    yield* wait(o && o.wait !== undefined ? o.wait : d + 0.2);
  };
  /* 시험 전, 앉아서 기다리는 동안에도 T 를 길게 눌러 시간을 빨리 보낼 수 있는가.
   * 여러 판째 같은 절차(입실 마감 → 신분 확인 → 배부)를 다시 기다리지 않게 하려는 것이라, 내가 할 일이 없는 동안에만 된다:
   * 무언가 꺼내거나 내밀 차례(want) · 감독관이 내 자리에 와 있는 동안(withMe: 신분 확인, 안경을 어떻게 할지, 탐지기) · 본령 직전(nearBell)에는 안 된다 */
  Game.prototype.canSkipWait = function () {
    var g = this, f = g.flags;
    return g.phase === 'seated' && !!f.settled && !g.want && !g.choosing && !f.withMe && !f.nearBell && !g.noHands;
  };
  Game.prototype.fade = function* (from, to, dur) {
    var t = 0;
    while (t < dur) { t += (yield) || 0; UI.setFade(GX.lerp(from, to, GX.smooth(t / dur))); }
    UI.setFade(to);
  };
  Game.prototype.walkTo = function* (x, z, speed, timeout, who) {
    var P = who || this.proctor;
    P.goTo(x, z, speed);
    yield* until(function () { return P.arrived(); }, timeout || 30);
  };
  Game.prototype.choose = function* (title, text, options, seconds, fallback) {
    var g = this, t = 0;
    g.choicePick = -1;
    g.choosing = true;
    UI.choice(title, text, options, function (i) { g.choicePick = i; });
    while (g.choicePick < 0 && t < seconds) {
      t += (yield) || 0;
      UI.choiceProgress(1 - t / seconds);
      for (var i = 0; i < options.length; i++) {
        if (Input.hit('Digit' + (i + 1)) || Input.hit('Numpad' + (i + 1))) g.choicePick = i;
      }
    }
    g.choosing = false;
    UI.choiceClose();
    Au.ui('select');
    return g.choicePick < 0 ? fallback : g.choicePick;
  };

  /* 교실 시계를 seconds 초에 걸쳐 target 시각까지 돌린다(준비 시간은 빨리 감기처럼 흐른다) */
  Game.prototype.runClock = function (target, seconds) {
    this.clockTarget = target;
    this.clockRate = Math.max(1, (target - this.world.clockTime) / Math.max(1, seconds));
  };

  /* ───────── 대본 ───────── */
  Game.prototype.begin = function (from) {
    this.tasks = [];
    this.script = this.mainScript(from || 'intro');
  };

  Game.prototype.mainScript = function* (from) {
    var g = this, P = g.proctor, P2 = g.proctor2, pl = g.player, seat = g.seat, world = g.world, i, t2;
    /* 내 줄은 정감독이, 다른 줄은 부감독이 맡는다 */
    var mineAisle = seat.col < 2 ? -1.7 : 1.7, mineCols = seat.col < 2 ? [0, 1] : [2, 3];
    var otherAisle = -mineAisle, otherCols = seat.col < 2 ? [2, 3] : [0, 1];
    /* 감독관 책상 앞 두 자리: 먼저 끝나는 부감독이 안쪽, 나를 상대하느라 늦는 정감독이 바깥쪽 */
    var pSpot = [-2.3, -3.38], p2Spot = [-3.05, -3.25];

    if (from === 'intro') {
      g.phase = 'intro';
      pl.reset();                      /* 시작 화면의 배경 카메라가 건드린 시선을 복도 출발 자세로 되돌린다 */
      UI.setFade(1); UI.hud(false);
      UI.intro('시험 날 아침.<br>주머니에는 수험표, 얼굴에는 어제 산 <b>AI 안경</b>.<br>안경다리를 톡 건드리면 켜지고, 문제를 보면 렌즈에 답이 뜬다고 했다.<br>쓸지 말지는, 들어가서 정하기로 했다.<small>클릭하거나 Space 를 누르면 넘어갑니다</small>');
      yield* wait(0.6);
      yield* until(function () { return Input.hit('Space') || Input.hit('Enter') || Input.clicked; }, 8);
      UI.intro(null);
      yield* wait(0.5);
      g.phase = 'walk';
      Input.active = true;
      UI.hud(true); UI.setGlasses('ai'); UI.setCross(true);
      UI.setObjective('제3고사실에 들어가 수험번호 ' + seat.no + ' 자리를 찾아 앉으세요');
      UI.ticket(seat.no, true);
      UI.setHints('<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 이동 · 마우스로 둘러보기 · <kbd>Shift</kbd> 빠르게 걷기 · <kbd>E</kbd> 행동' +
        '<br><span class="ai"><kbd>F</kbd> 안경다리 터치: 렌즈 켜기/끄기</span>');
      Au.ambience(true);
      yield* g.fade(1, 0, 1.3);
      Au.ui('boot');
      UI.say('lens', '시야 보정 완료. 글자를 보면 읽어 드립니다.', 3.4);
      yield* until(function () { return g.phase === 'seated'; });
    } else {
      g.jumpSeated(from);
    }

    if (from === 'intro' || from === 'seated') {
      /* ── 앉은 뒤: 입실 마감 ── */
      UI.ticket(null, false);
      UI.setObjective('감독관의 안내를 기다리세요');
      UI.setHints('마우스로 둘러보기 · <kbd>Space</kbd> 고개 들기/숙이기 · <kbd>E</kbd> 행동 · <kbd>T</kbd> 길게: 기다리는 시간 빨리 보내기' +
        (g.glasses === 'ai' ? '<br><span class="ai"><kbd>F</kbd> 안경다리 터치: 렌즈 켜기/끄기</span>' : ''));
      g.flags.settled = true;            /* 이제부터 내 차례가 아닌 동안에는 T 로 시간을 빨리 보낼 수 있다(canSkipWait) */
      /* 엔딩을 한 번이라도 본 사람(여러 판째)에게는 한 번 짚어 준다. 처음 하는 사람은 절차를 제 속도로 겪게 둔다 */
      if (GX.Endings && GX.Endings.count() > 0) UI.toast('기다리는 시간은 T 를 길게 눌러 빨리 보낼 수 있다', 'info', 5);
      g.runClock(9 * 3600 + 19 * 60 + 40, 62);
      yield* wait(0.9);
      world.door.target = 0; Au.door(3.9, 3.6);
      yield* g.say('think', '(뒷문이 닫혔다. 교실이 조용해진다.)', { wait: 2.6 });
      P.autoLook = false; P.faceYaw = Math.PI; P.lookRel(0, -0.05);
      yield* g.say('proctor', '입실을 마감하겠습니다. 수험생 여러분, 신분증과 수험표를 책상 위에 올려 주십시오.');
      UI.setObjective('신분증과 수험표를 꺼내세요');
      g.want = 'place';
      yield* until(function () { return g.placed; }, 6);
      if (!g.placed) g.placeItems();
      g.want = null;
      yield* g.say('proctor', '지금부터 신분을 확인하고 전자기기를 걷겠습니다. 휴대전화와 스마트워치 같은 전자기기는 전원을 끄고 준비해 주십시오.');
      g.flags.collecting = true;        /* 이제부터 감독관이 내 자리로 온다(조작 안내가 '렌즈를 끄세요'를 띄우는 때) */
      if (g.lensOn()) {
        Au.ui('warn'); UI.say('lens', '⚠ 주변에서 전자기기를 수거하고 있습니다', 2.4);
        yield* wait(2.5);
        yield* g.say('think', '(렌즈에 글자가 떠 있으면 가까이서는 보인다. 감독관이 오기 전에 꺼 두는 편이 낫겠다.)', { wait: 3.4 });
        UI.setObjective('감독관이 오기 전에 안경을 끄세요 (F: 안경다리를 톡)');
      } else UI.setObjective('감독관이 올 때까지 기다리세요');
      P2.autoLook = false;
      t2 = g.spawn(g.sweep(P2, 'check', otherAisle, otherCols, p2Spot));
      yield* g.sweep(P, 'check', mineAisle, mineCols, pSpot);
      /* 수거함을 감독관 책상에 내려놓는다 */
      P.faceYaw = 0; P.lookRel(0, -0.5);
      yield* wait(0.7);
      P.rig.hold = 'none'; g.deskBasket.visible = true; Au.clunk(-2.5, 0.8, -3.8);
      yield* wait(0.6);
      yield* until(function () { return t2.done; }, 40);

      /* ── 준비령 ── */
      g.runClock(9 * 3600 + 19 * 60 + 56, 3);
      P.rig.hold = 'clip';
      yield* g.walkTo(-0.35, -3.55, 1.2);
      P.faceYaw = Math.PI; P.lookRel(0, -0.05);
      yield* wait(0.4);
      world.clockTime = 9 * 3600 + 20 * 60; g.clockTarget = world.clockTime;
      Au.chime('prep'); UI.banner('준비령', '딩 — 동 — 댕 — 동', 5);
      for (i = 0; i < g.npcs.length; i++) g.npcs[i].react('bell');
      g.runClock(T_BELL - 14, 36);
      yield* wait(4.9);
      yield* g.say('proctor', '준비령이 울렸습니다. 지금부터 문제지와 답안지를 나눠 드립니다. 본령이 울리기 전에는 문제지를 넘기지 마십시오.');
      UI.setObjective('문제지와 답안지를 받으세요');
      t2 = g.spawn(g.sweep(P2, 'hand', otherAisle, otherCols, [-1.75, -3.3]));
      yield* g.sweep(P, 'hand', mineAisle, mineCols, [-0.35, -3.55]);
      P.rig.hold = 'clip'; P.faceYaw = Math.PI; P.lookRel(0, -0.05);
      yield* until(function () { return t2.done; }, 40);
      yield* g.say('proctor', '답안지의 수험번호를 확인하시고, 본령을 기다려 주십시오. 문제지는 아직 넘기지 않습니다.');
    }

    /* ── 본령 ── */
    g.flags.nearBell = true;             /* 여기서부터는 시간을 빨리 보낼 수 없다(누른 채로 본령을 지나쳐 시험 시간을 흘려보내지 않게) */
    UI.setObjective('본령이 울리기를 기다리세요');
    g.runClock(T_BELL - 4, 4);
    if (g.lensOn()) UI.say('lens', '문제지 표지 인식. 본령이 울리면 문항을 읽습니다.', 3.2);
    P.lookAtPoint(W.CLOCK[0], W.CLOCK[1], -4.8);
    P2.lookAtPoint(W.CLOCK[0], W.CLOCK[1], -4.8);
    yield* wait(3.8);
    P.lookRel(0, -0.05); P2.lookRel(0, -0.05);
    world.clockTime = T_BELL; g.clockTarget = T_BELL;
    Au.chime('start'); UI.banner('딩 — 동 — 댕 — 동', '본령 · 시험 시작', 3.6);
    g.flags.bell = true;               /* 종이 울린 뒤에 표지를 넘기려는 것은 이른 것이 아니다(seatLogic 이 적어 두었다가 시작과 함께 넘긴다) */
    yield* wait(1.3);
    UI.say('proctor', '시험을 시작하십시오.', 2.4); Au.voice('시험을 시작하십시오.', 'proctor', [P.x, 1.6, P.z]);
    g.startExam();
    yield* until(function () { return g.phase !== 'exam'; });

    if (g.phase === 'caught') yield* g.caughtScene(); else yield* g.endScene();
    /* 그 뒤의 이야기(합격자 발표·통지서)를 보여 준 다음 결과 화면으로 */
    yield* g.epilogueScene();
    g.finish();
  };

  /* 입실 마감: 끝내 자리를 못 찾은 수험생을 감독관이 자리로 데려다 앉힌다 */
  Game.prototype.escort = function* () {
    var g = this, pl = g.player, s = g.seat, P = g.proctor, line = '입실 마감 시각입니다. 수험생, 자리로 안내하겠습니다.';
    UI.say('proctor', line, 3.2);
    Au.voice(line, 'proctor', [P.x, 1.6, P.z]);
    yield* g.fade(0, 1, 0.7);
    if (g.phase === 'walk') {          /* 그 사이에 스스로 앉았다면 그대로 둔다 */
      pl.x = s.chair[0] + 0.55; pl.z = s.chair[1] + 0.15; pl.vx = pl.vz = 0;
      pl.eye[0] = pl.x; pl.eye[2] = pl.z; pl.yaw = Math.atan2(-(s.x - pl.x), -(s.z - pl.z)); pl.pitch = -0.3;
      g.beginSit();
    }
    yield* g.fade(1, 0, 0.9);
  };

  /* 감독관 한 명이 통로 하나를 앞에서 뒤로 걸으며 양옆 책상에 들른 뒤 back 자리로 돌아온다.
   * kind: check(신분 확인·수거) / hand(배부). cols: 통로 양옆의 책상 열 */
  Game.prototype.sweep = function* (P, kind, ax, cols, back) {
    var g = this, world = g.world, check = kind === 'check';
    var speed = check ? 1.2 : 1.3, r, j;
    P.rig.hold = check ? 'basket' : 'stack'; P.rig.gesture = 'none';
    P.rig.tool = check ? 'wand' : null; P.rig.toolPose = null;       /* 걷으면서 탐지기로 한 번씩 훑는다 */
    for (r = 0; r < 5; r++) {
      yield* g.walkTo(ax, W.ROWS[r] + 0.3, speed, 30, P);
      for (j = 0; j < 2; j++) {
        var st = world.seats[cols[j] * 5 + r];
        if (st === g.seat) {
          if (check) yield* g.checkPlayer(P); else yield* g.handPlayer(P);
          continue;
        }
        if (g.present.indexOf(st) < 0) continue;
        P.lookAtPoint(st.x, 0.8, st.z);
        if (check) P.rig.toolPose = [0.72, 0.5, st.x > P.x ? -0.12 : 0.3, 0];
        yield* wait(check ? 0.5 : 0.28);
        /* 시간을 빨리 보내는 동안에는 책상마다 나는 소리를 내지 않는다(여덟 배로 몰려 난다) */
        if (check) { st.phone.visible = false; if (!g.ffwd) Au.clunk(P.x, 0.9, P.z); P.rig.toolPose = null; }
        else { st.cover.visible = true; if (!g.ffwd) Au.paper(st.x, 0.76, st.z, 0.4); }
      }
      P.lookRel(0, -0.1);
      yield* wait(0.12);
    }
    P.rig.tool = null; P.rig.toolPose = null;
    yield* g.walkTo(back[0], back[1], speed + 0.05, 30, P);
    if (P === g.proctor2) {
      P.faceYaw = check ? 0 : Math.PI; P.lookRel(0, check ? -0.5 : -0.05);
      if (check) {
        yield* wait(0.6);
        P.rig.hold = 'none'; g.deskBasket2.visible = true; Au.clunk(-2.9, 0.8, -3.75);
        yield* wait(0.5);
        P.faceYaw = Math.PI; P.lookRel(0, -0.05);
      } else { P.rig.hold = 'none'; P.rig.gesture = 'back'; }
    }
  };

  Game.prototype.checkPlayer = function* (P) {
    var g = this, pl = g.player, seat = g.seat, ex = g.exam, k, t;
    g.flags.checked = true;            /* 감독관이 내 자리에 왔다: '오기 전에 렌즈를 끄라'는 안내는 여기까지다 */
    g.flags.withMe = true;             /* 내 차례다: 끝날 때까지 시간을 빨리 보낼 수 없다 */
    P.faceYaw = Math.atan2(-(seat.x - P.x), -(seat.z + 0.35 - P.z));
    P.lookAtPoint(seat.x, 1.15, seat.z + 0.4);
    yield* wait(0.45);
    pl.lookAt(P.x, 1.56, P.z, 1.8);
    yield* g.say('proctor', '신분증 확인하겠습니다.', { wait: 1.3 });
    UI.setObjective('신분증을 내밀어 보이세요');
    g.want = 'id';
    var ok = yield* until(function () { return g.idShown; }, 5);
    if (!ok) {
      yield* g.say('proctor', '수험생, 신분증 보여 주세요.', { wait: 1.2 });
      yield* until(function () { return g.idShown; }, 4);
      g.idShown = true;
    }
    g.want = null; UI.setPrompt(null);
    /* 신분증을 들어 보인다 */
    var side = P.x > seat.x ? 1 : -1;
    var up = [seat.x + side * 0.36, 1.27, seat.z + 0.36], home = ex.idHome;
    Au.paper(undefined, 0, 0, 0.25);
    ex.holdId = true;
    for (t = 0; t < 0.45;) {
      t += (yield) || 0; k = GX.smooth(t / 0.45);
      for (var i = 0; i < 3; i++) ex.idPos[i] = GX.lerp(home[i], up[i], k);
      ex.idTilt = 1.2 * k; ex.idYaw = side * 1.25 * k;
    }
    P.lookAtPoint(up[0], up[1], up[2]);
    P.leanWant = -0.1;
    yield* wait(1.3);
    P.lookAtPoint(pl.eye[0], pl.eye[1], pl.eye[2]);
    g.heart = 0.75;
    if (g.lensOn()) {
      /* 렌즈를 켠 채로 얼굴을 맞대면 글자가 비친다 */
      g.addSus(7); g.flags.seenLit = true;
      yield* g.say('think', '(감독관이 신분증과 내 얼굴을 번갈아 본다. 시선이 렌즈에 뜬 글자에서 멈춘 것 같다.)', { wait: 3.3 });
    } else {
      yield* g.say('think', '(감독관이 신분증과 내 얼굴을 번갈아 본다. 시선이 안경테에서 잠깐 멈춘다.)', { wait: 3.3 });
    }
    P.leanWant = 0;
    yield* g.say('proctor', '네, 본인 확인됐습니다.', { wait: 1.5 });
    g.heart = 0.3;
    for (t = 0; t < 0.4;) {
      t += (yield) || 0; k = 1 - GX.smooth(t / 0.4);
      for (var i2 = 0; i2 < 3; i2++) ex.idPos[i2] = GX.lerp(home[i2], up[i2], k);
      ex.idTilt = 1.2 * k; ex.idYaw = side * 1.25 * k;
    }
    ex.holdId = false;
    /* 휴대폰 제출 */
    P.lookAtPoint(seat.x, 0.8, seat.z);
    yield* g.say('proctor', '전자기기는 여기 넣어 주세요. 가지고만 있어도 부정행위로 처리될 수 있습니다.', { wait: 2.8 });
    UI.setObjective('휴대폰을 수거함에 넣으세요');
    g.want = 'phone';
    ok = yield* until(function () { return g.phoneGiven; }, 6);
    g.phoneGiven = true; g.want = null; UI.setPrompt(null);
    var bm = P.rig.basket.model, from = ex.phonePos.slice(), to = [bm[12], bm[13] + 0.02, bm[14]];
    ex.holdPhone = true;
    for (t = 0; t < 0.5;) {
      t += (yield) || 0; k = GX.smooth(t / 0.5);
      ex.phonePos[0] = GX.lerp(from[0], to[0], k);
      ex.phonePos[1] = GX.lerp(from[1], to[1], k) + Math.sin(k * Math.PI) * 0.12;
      ex.phonePos[2] = GX.lerp(from[2], to[2], k);
    }
    ex.holdPhone = false;
    ex.phone.visible = false; Au.clunk(P.x, 0.9, P.z);
    /* 안경을 어떻게 할 것인가 */
    P.lookAtPoint(pl.eye[0], pl.eye[1], pl.eye[2]);
    pl.lookAt(P.x, 1.56, P.z, 1.2);
    g.heart = 1;
    yield* wait(1.2);
    UI.setObjective('안경을 어떻게 할지 정하세요');
    var pick = yield* g.choose('AI 안경도 전자기기다', '감독관이 수거함을 든 채 기다리고 있다. 다른 손에는 전자기기 탐지기가 들려 있다.', [
      { key: '1', label: '안경도 낸다', sub: '오늘 시험은 내 실력으로 본다' },
      { key: '2', label: '그냥 쓰고 있는다', sub: '평범한 안경인 척한다 · 탐지기가 오기 전에 렌즈는 꺼 둬야 한다' }
    ], 12, 1);
    UI.setObjective('감독관의 안내를 기다리세요');
    if (pick === 0) {
      g.submitted = true; g.glasses = 'plain'; ex.glasses = false; ex.refresh({ ar: 1 });
      g.dev.off('force');
      UI.setGlasses('none'); UI.setLensLabel(null); UI.setBlur(2.5); Au.ui('off');
      yield* g.say('think', '(안경을 벗어 수거함에 넣었다. 세상이 흐릿해진다.)', { wait: 2.0 });
      yield* g.say('proctor', '안경형 기기네요. 보관했다가 시험이 끝나면 돌려 드리겠습니다.', { wait: 3.0 });
      UI.setGlasses('plain'); UI.setBlur(0);
      yield* g.say('think', '(가방에 넣어 둔 여분의 평범한 안경을 꺼내 썼다. 이제 믿을 것은 내 머리뿐이다.)', { wait: 3.4 });
    } else {
      yield* g.say('think', '(아무 말도 하지 않았다. 감독관이 내 얼굴을 한 번 더 본다.)', { wait: 2.4 });
      yield* g.wandCheck(P);
    }
    g.heart = 0;
    P.rig.tool = 'wand'; P.rig.toolPose = null;
    P.lookRel(0, -0.1);
    g.flags.withMe = false;
    UI.setObjective('감독관의 안내를 기다리세요');
  };

  /* 전자기기 탐지기 검사: 책상 위를 훑고 얼굴 높이로 올라온다. 그때 렌즈가 켜져 있으면 경보가 울리고,
   * 울린 뒤에도 바로 끄면(급하게 끄기) 금속 테 탓으로 넘어가지만 얼굴은 기억된다. 끝내 켜져 있으면 압수 */
  Game.prototype.wandCheck = function* (P) {
    var g = this, pl = g.player, seat = g.seat, dev = g.dev, ex = g.exam, t, k, hw = P.rig.headWorld;
    var near = P.x > seat.x ? 0.3 : -0.12;       /* 탐지기를 든 오른팔이 내 쪽으로 가는 방향 */
    P.rig.tool = 'wand';
    yield* g.say('proctor', '전자기기 탐지기로 확인하겠습니다. 잠시 그대로 계세요.', { wait: 2.5 });
    UI.setObjective(g.lensOn() ? '탐지기가 얼굴에 오기 전에 안경을 끄세요 (F: 안경다리를 톡)' : '그대로 기다리세요');
    /* 1) 책상 쪽으로 몸을 틀어 책상 위를 좌우로 훑는다 */
    var toMe = P.faceYaw;
    P.faceYaw = Math.atan2(-(seat.x - P.x), -(seat.z - 0.08 - P.z));
    P.lookAtPoint(seat.x, 0.8, seat.z);
    for (t = 0; t < 1.9;) {
      t += (yield) || 0; k = t / 1.9;
      P.rig.toolPose = [0.6, 0.4, 0.06 + 0.2 * Math.sin(k * Math.PI * 2), 0];
    }
    /* 2) 내 쪽으로 돌아서 얼굴 높이로 올린다 */
    P.faceYaw = toMe;
    P.lookAtPoint(pl.eye[0], pl.eye[1], pl.eye[2]);
    pl.lookAt(P.x, 1.5, P.z, 1.2);
    for (t = 0; t < 1.1;) {
      t += (yield) || 0; k = GX.smooth(t / 1.1);
      P.rig.toolPose = [GX.lerp(0.6, 1.02, k), GX.lerp(0.4, 0.42, k), GX.lerp(0.06, near, k), 0];
    }
    /* 3) 안경 옆을 지난다. 울리면 그동안이 급하게 끌 마지막 틈이고, 그 뒤로는 감독관이 코앞에서 보고 있어 손을 올릴 수 없다 */
    if (g.lensOn()) {
      Au.wand('beep', (hw[0] + pl.eye[0]) / 2, 1.3, (hw[2] + pl.eye[2]) / 2);
      g.heart = 1; g.spike = 1; g.flags.beeped = true;
      UI.say('think', '(삑, 삑, 삑. 탐지기가 내 얼굴 앞에서 운다.)', 2.2);
      UI.toast('탐지기가 울린다 · 지금 바로 안경을 끄세요 (F)', 'warn', 2.4);
      UI.setObjective('지금 바로 안경을 끄세요 (F)');
      for (t = 0; t < 1.7;) {
        t += (yield) || 0;
        P.rig.toolPose = [1.02 + 0.03 * Math.sin(t * 9), 0.42, near + 0.05 * Math.sin(t * 6), 0];
      }
      g.noHands = true;
      if (g.lensOn()) {
        /* 끝내 켜져 있었다 → 압수 */
        UI.setObjective('감독관의 안내를 기다리세요');
        yield* g.say('proctor', '안경에서 반응이 나네요. 잠깐 벗어 보시겠어요?', { wait: 2.6 });
        dev.off('force');
        g.takeGlasses(P);
        P.rig.toolPose = [0.72, 1.7, 0.04, 0.3];
        P.lookRel(0.1, -0.45);
        yield* g.say('think', '(안경이 감독관의 손으로 넘어갔다. 렌즈에는 아직 글자가 떠 있었다.)', { wait: 3.0 });
        yield* g.say('proctor', '화면이 나오는 안경이군요. 전자기기는 가지고 계실 수 없습니다. 시험이 끝날 때까지 보관하겠습니다.', { wait: 4.8 });
        g.confiscated = true; g.glasses = 'plain'; ex.glasses = false; ex.refresh({ ar: 1 });
        P.rig.tool = null; P.rig.toolPose = null; Au.clunk(P.x, 0.9, P.z);
        P.lookAtPoint(pl.eye[0], pl.eye[1], pl.eye[2]);
        UI.setGlasses('plain'); UI.setBlur(0);
        g.noHands = false;
        yield* g.say('think', '(가방에서 여분의 평범한 안경을 꺼내 썼다. 시작도 하기 전에 들켰다. 이제 믿을 것은 내 머리뿐이다.)', { wait: 4.0 });
      } else {
        /* 울리는 동안 급하게 껐다 → 넘어가지만 얼굴을 기억한다 */
        UI.setObjective('감독관의 안내를 기다리세요');
        P.rig.toolPose = [0.5, 0.4, 0.1, 0];
        P.leanWant = -0.12;
        yield* g.say('proctor', '…안경에서 반응이 있었는데요.', { wait: 2.0 });
        yield* g.say('think', '(감독관이 허리를 숙여 내 안경을 들여다본다. 렌즈는 이미 꺼져 있다.)', { wait: 3.0 });
        P.leanWant = 0;
        yield* g.say('proctor', '…금속 테라서 그런가 보네요. 됐습니다.', { wait: 2.4 });
        g.marked = true; g.addSus(16); g.floor = Math.max(g.floor, 10); g.heatExtra = Math.max(g.heatExtra, 0.2);
        g.noHands = false;
        yield* g.say('think', '(넘어갔다. 하지만 내 얼굴은 기억했을 것이다.)', { wait: 2.4 });
      }
    } else {
      /* 꺼진 안경: 쇠붙이에 스친 약한 반응만 난다. 탐지기가 얼굴 앞에 있는 동안은 가만히 있는다 */
      g.noHands = true;
      Au.wand('tick', (hw[0] + pl.eye[0]) / 2, 1.3, (hw[2] + pl.eye[2]) / 2);
      for (t = 0; t < 0.9;) {
        t += (yield) || 0;
        P.rig.toolPose = [1.02, 0.42, near + 0.06 * Math.sin(t * 5), 0];
      }
      P.rig.toolPose = [0.5, 0.4, 0.1, 0];
      yield* g.say('proctor', '…네, 됐습니다.', { wait: 1.4 });
      g.noHands = false;
      yield* g.say('think', '(탐지기가 안경 옆을 그냥 지나갔다. 꺼진 안경은 그냥 안경이다. 일단은.)', { wait: 2.8 });
    }
    P.rig.toolPose = null;
  };

  /* 감독관이 내 안경을 받아 든다: 안경 없는 눈에는 세상이 흐리다 */
  Game.prototype.takeGlasses = function (P) {
    UI.setGlasses('none'); UI.setLens(null); UI.setLensLabel(null); UI.setRing(null); UI.setBlur(2.5);
    this.exam.arWant = 0;
    this.noHands = true;
    this.specsTaken = true;
    P.rig.tool = 'specs';
    Au.ui('off');
  };
  Game.prototype.returnGlasses = function (P) {
    UI.setGlasses('ai'); UI.setBlur(0);
    this.noHands = false;
    this.specsTaken = false;
    P.rig.tool = null; P.rig.toolPose = null;
    Au.haptic('tap');
  };

  Game.prototype.handPlayer = function* (P) {
    var g = this, seat = g.seat;
    P.lookAtPoint(seat.x, 0.8, seat.z);
    P.leanWant = -0.12;
    yield* wait(0.35);
    g.exam.setState('cover');
    Au.paper(undefined, 0, 0, 0.6);
    g.flags.hasPaper = true;
    UI.setObjective('본령 전에는 문제지를 넘기지 않습니다');
    yield* wait(0.3);
    P.leanWant = 0;
  };

  /* 대본 중간부터 시작(개발·시험용). 앉은 상태로 맞춘다 */
  Game.prototype.jumpSeated = function (from) {
    var g = this, pl = g.player, seat = g.seat, i;
    pl.mode = 'seat'; pl.seat = seat; pl.yaw = 0; pl.pitch = -0.06; pl.lean = 0;
    pl.eye[0] = seat.x; pl.eye[1] = 1.22; pl.eye[2] = seat.z + 0.42;
    g.world.door.target = 0; g.world.door.open = 0;
    g.phase = 'seated';
    Input.active = true;
    UI.setFade(0); UI.intro(null); UI.hud(true); UI.setCross(true); UI.ticket(null, false);
    UI.setGlasses(g.glasses === 'ai' ? 'ai' : 'plain');
    Au.ambience(true);
    g.exam.seated(true);
    if (from === 'seated') return;
    g.dev.reset({ power: 'off', battery: g.dev.battery - 4 });      /* 검사를 꺼진 채로 지나온 것으로 친다 */
    g.proctor.autoLook = false; g.proctor2.autoLook = false;
    g.proctor2.rig.pos[0] = -1.75; g.proctor2.rig.pos[2] = -3.3;
    g.placeItems();
    g.exam.phone.visible = false;
    for (i = 0; i < g.present.length; i++) { g.present[i].phone.visible = false; g.present[i].cover.visible = true; }
    g.deskBasket.visible = true; g.deskBasket2.visible = true;
    g.exam.setState('cover');
    g.flags.hasPaper = true;
    g.world.clockTime = 9 * 3600 + 29 * 60 + 40;
  };

  Game.prototype.placeItems = function () {
    var ex = this.exam;
    this.placed = true;
    ex.idCard.visible = true; ex.ticket.visible = true; ex.phone.visible = true; ex.handVisible = true;
    Au.paper(undefined, 0, 0, 0.3);
  };

  Game.prototype.beginSit = function () {
    var g = this;
    if (g.phase !== 'walk') return;
    g.phase = 'sitting';
    UI.setPrompt(null); UI.setLensLabel(null); UI.setMarker(null);
    Au.sit();
    g.player.sit(g.seat, function () { g.phase = 'seated'; g.exam.seated(true); });
  };

  Game.prototype.startExam = function () {
    var g = this, i;
    g.phase = 'exam';
    g.left = EXAM_SECONDS;
    g.coverT = 0;
    g.ffwd = false;
    g.ffHold = Input.down('KeyT');     /* 누른 채로 본령을 맞았다: 뗐다가 다시 누를 때까지 시험 시간은 제 속도로 흐른다 */
    /* 내 문제지의 표지는 내 손으로 넘긴다(examLogic). 문제지를 받지 못한 채로 왔다면(그럴 일은 없지만) 바로 펼친다 */
    if (g.exam.state !== 'cover') { g.exam.setState('open'); Au.pageTurn(0.6); }
    g.exam.handVisible = true;
    for (i = 0; i < g.present.length; i++) { g.present[i].cover.visible = false; g.present[i].open.visible = true; }
    /* 종이 울리면 다들 한꺼번에 표지를 넘긴다 */
    for (i = 0; i < g.npcs.length; i++) { var n = g.npcs[i]; n.mode = 'write'; n._go('flip', 1.25); n.at = -n.rnd() * 0.9; }
    g.proctor.startExam(g.seat, g.rnd);
    g.proctor2.startExam(g.seat, g.rnd);
    UI.setObjective(g.exam.state === 'cover' ? '문제지 표지를 넘기세요 (D 키)' : '10문항을 풀어 답안지에 표기하세요');
    /* 종소리를 듣자마자(감독관이 "시작하십시오" 하기 전에) 넘기려 했다면 지금 넘긴다 */
    if (g.flags.coverWanted) g.openBook(false);
    var ai = g.glasses === 'ai';
    UI.setHints('<kbd>1</kbd>~<kbd>5</kbd> 답 표시 · <kbd>A</kbd><kbd>D</kbd> 문항 넘기기 · <kbd>Space</kbd> 고개 들기/숙이기 · <kbd>T</kbd> 길게: 시간 빨리 보내기' +
      (ai ? '<br><span class="ai"><kbd>F</kbd> 안경다리 터치: 렌즈 켜기/끄기 · 켜고 문제지를 보면 스스로 읽고 답을 띄운다 · 시선이 오면 바로 끄기</span>' : ''));
    g.player.lookDir(0.25, -0.93, 1.2, 4);
    g.findNeighbors();
    if (g.marked) UI.toast('탐지기가 울렸던 자리다 · 감독관이 이쪽을 더 자주 본다', 'warn', 4.5);
  };

  /* 문제지 표지를 넘긴다. auto: 내가 넘기지 않아 저절로 넘어간 것 */
  Game.prototype.openBook = function (auto) {
    var g = this;
    if (!g.exam.openCover()) return false;
    Au.pageTurn(1);
    UI.banner(null);                   /* 본령 글씨가 화면 가운데에 남아 1번 문항을 가리지 않게 거둔다 */
    UI.setObjective('10문항을 풀어 답안지에 표기하세요');
    if (auto) { g.flags.autoCover = true; UI.say('think', '(다들 표지를 넘겼다. 나도 얼른 넘겼다.)', 2.4); }
    return true;
  };

  Game.prototype.stopProctors = function () {
    var i;
    this.proctor.stopExam(); this.proctor2.stopExam();
    /* 시험이 끝나면 안경은 그대로 꺼 둔다 */
    if (this.glasses === 'ai') this.dev.off('auto');
    Au.lens(0); UI.setRing(null); UI.ff(false); this.ffwd = false;
    UI.setPeek(false, false); UI.setPrompt(null);
    this.peekL = this.peekR = false; this.reporter = null;
    /* 탐지기는 치운다. 검사하다 받아 든 안경은 그대로 들고 있는다(팔 자세도 그대로) */
    for (i = 0; i < 2; i++) { var rg = this.proctors[i].rig; if (rg.tool !== 'specs') { rg.tool = null; rg.toolPose = null; } }
  };

  Game.prototype.endScene = function* () {
    var g = this, P = g.proctor, P2 = g.proctor2, i;
    g.stopProctors();
    g.world.clockTime = T_BELL + 80 * 60; g.clockTarget = g.world.clockTime;
    Au.chime('end'); UI.banner('딩 — 동 — 댕 — 동', '종료령 · 시험 종료', 4.2);
    g.exam.setState('closed');
    for (i = 0; i < g.npcs.length; i++) { g.npcs[i].mode = 'done'; g.npcs[i].react('bell'); }
    UI.setTimer(null); UI.setHints(null); UI.setObjective('필기도구를 내려놓으세요');
    P.goTo(-0.35, -3.55, 1.1); P.lookRel(0, -0.05);
    P2.rig.gesture = 'back'; P2.lookRel(0, -0.05);
    if (P2.z < W.LANE_BACK - 0.1) P2.goTo(P2.x, W.LANE_BACK, 0.9);
    yield* wait(3.2);
    yield* g.say('proctor', '종료령이 울렸습니다. 필기도구를 내려놓고 답안지에서 손을 떼 주십시오.', { wait: 4.2 });
    yield* g.fade(0, 1, 1.6);
  };

  /* 지금 나를 지켜보고 있거나, 가장 가까이 있는 감독관 */
  Game.prototype.catcher = function () {
    var a = this.proctor, b = this.proctor2, s = this.seat;
    if (a.isWatching() !== b.isWatching()) return a.isWatching() ? a : b;
    return a.dist(s.x, s.z) <= b.dist(s.x, s.z) ? a : b;
  };

  /* 시험 중 안경 검사를 시작한다(곁가지 대본으로 돈다). why: sus(의심이 높아져서) / report(옆자리가 손을 들어서) */
  Game.prototype.startInspect = function (P, why) {
    var i;
    this.inspecting = true;
    this.flags.inspected = true;
    this.stat.inspections++;
    /* 멈춰 서서 보던 감독관도 이제 검사 결과를 기다린다. 손을 들려던 옆 사람도 감독관이 오는 것을 보고 그만둔다 */
    for (i = 0; i < 2; i++) { this.proctors[i].take = null; this.proctors[i].glintAcc = 0; }
    this.reporter = null; this.sawCount = 0;
    this.spawn(this.inspectScene(P, why));
  };
  /* 안경을 검사하러 올 감독관: 지금 지켜보고 있거나 불빛을 눈치챈 쪽, 없으면 가까운 쪽 */
  Game.prototype.inspector = function () {
    var a = this.proctor, b = this.proctor2;
    if (a.isWatching() !== b.isWatching()) return a.isWatching() ? a : b;
    if (!!a.take !== !!b.take) return a.take ? a : b;
    return this.catcher();
  };

  /* 안경 검사: 감독관이 와서 안경을 벗겨 본다. 오는 동안이 렌즈를 끄고 식힐 마지막 틈이다.
   * 넘겨주는 순간 렌즈에 불빛이 남아 있거나 안경다리가 따뜻하면 그대로 적발, 꺼져 있고 차가우면 그냥 안경으로 돌려받는다.
   * 검사가 도는 동안에는 종료령도 다른 적발도 기다리므로(examLogic) 보통은 끝까지 간다.
   * 그래도 단계가 바뀌어 있으면(만약을 위한 안전장치) inspectAbort 가 안경을 돌려주고 그만둔다 */
  Game.prototype.inspectScene = function* (P, why) {
    var g = this, pl = g.player, seat = g.seat, dev = g.dev, t, line;
    function* hold(sec) {
      var e = 0;
      while (e < sec) { e += (yield) || 0; if (g.phase !== 'exam') return false; }
      return true;
    }
    function* speak(kind, text, sec) {
      UI.say(kind, text, sec + 0.2);
      if (kind === 'proctor') Au.voice(text, P.chief ? 'proctor' : 'proctor2', [P.x, 1.6, P.z]);
      return yield* hold(sec);
    }
    P.beginInspect();
    P.other.ai.watchCool = Math.max(P.other.ai.watchCool, 22);
    g.spike = 1;
    UI.setObjective('감독관이 안경을 확인하러 온다 · 렌즈를 끄고 기다리세요');
    if (!(yield* speak('proctor', why === 'report' ? '…네, 확인해 보겠습니다. 수험생, 잠깐만요.' : '수험생, 잠깐만요.', 1.6))) return g.inspectAbort(P);
    t = 0;
    while (!P.arrived() && t < 9) { t += (yield) || 0; if (g.phase !== 'exam') return g.inspectAbort(P); }
    P.faceYaw = Math.atan2(-(seat.x - P.x), -(seat.z + 0.35 - P.z));
    P.lookAtPoint(pl.eye[0], pl.eye[1], pl.eye[2]);
    pl.lookAt(P.x, 1.56, P.z, 1.4);
    if (!(yield* speak('proctor', '안경 좀 확인하겠습니다. 벗어서 주시겠어요?', 2.6))) return g.inspectAbort(P);
    /* 넘겨주는 순간의 증거 */
    var lit = g.lensOn(), warm = dev.warm();
    dev.off('force');
    g.takeGlasses(P);
    UI.setObjective('감독관이 안경을 살펴보고 있다');
    P.rig.toolPose = [0.78, 1.72, 0.04, 0.3];
    P.lookRel(0.12, -0.42);
    if (lit) { g.caughtWhy = 'lit'; g.phase = 'caught'; g.inspecting = false; return undefined; }
    if (!(yield* speak('think', '(감독관이 안경을 받아 든다. 꺼진 렌즈는 그냥 유리다.)', 2.4))) return g.inspectAbort(P);
    /* 형광등에 비춰 보고, 안경다리를 만져 본다 */
    P.rig.toolPose = [1.25, 1.35, 0.06, 0.3];
    P.lookRel(0.1, 0.3);
    if (!(yield* hold(1.7))) return g.inspectAbort(P);
    P.rig.toolPose = [0.7, 1.75, 0.02, 0.3];
    P.lookRel(0.12, -0.5);
    if (warm) { g.caughtWhy = 'warm'; g.phase = 'caught'; g.inspecting = false; return undefined; }
    if (!(yield* speak('think', '(엄지가 안경다리를 훑는다. 다행히 식어 있다.)', 2.2))) return g.inspectAbort(P);
    if (!(yield* speak('proctor', '…실례했습니다. 계속 보세요.', 2.0))) return g.inspectAbort(P);
    g.returnGlasses(P);
    g.sus = Math.min(g.sus, 42); g.floor = Math.max(g.floor, 28); g.clean = 0;
    g.spike = 0.5;
    UI.setObjective('10문항을 풀어 답안지에 표기하세요');
    line = '(안경이 돌아왔다. 손바닥에 땀이 찼다. 한 번 더 걸리면 그때는 끝이다.)';
    UI.say('think', line, 3.6);
    P.lookAtPoint(seat.x, 0.8, seat.z);
    if (!(yield* hold(1.2))) return g.inspectAbort(P);
    P.endInspect();
    g.inspecting = false;
    return undefined;
  };
  /* 검사 도중에 시험 단계가 바뀌어 버렸을 때의 안전장치: 안경을 돌려주고 물러난다 */
  Game.prototype.inspectAbort = function (P) {
    if (this.noHands && this.glasses === 'ai' && this.phase !== 'caught') this.returnGlasses(P);
    this.inspecting = false;
    return undefined;
  };

  Game.prototype.caughtScene = function* () {
    var g = this, pl = g.player, seat = g.seat, why = g.caughtWhy, i;
    /* 의심이 가득 차서 걸렸으면 지켜보던(또는 가까운) 감독관이, 검사에서 걸렸으면 검사하던 감독관이 맡는다 */
    var P = why === 'sus' || why === 'look' ? g.catcher() : (g.proctor.isInspecting() ? g.proctor : g.proctor2), O = P.other;
    var lit = g.lensOn();
    g.caught = true; g.inspecting = false;
    g.stopProctors();
    UI.setTimer(null); UI.setHints(null); UI.setObjective(null);
    Au.sting('caught'); g.heart = 1;
    P.rig.gesture = 'none';
    P.lookAtPoint(seat.x, 1.15, seat.z + 0.4);
    O.lookAtPoint(seat.x, 1.15, seat.z + 0.4);
    for (i = 0; i < g.npcs.length; i++) if (g.npcs[i].rnd() < 0.5) { g.npcs[i]._go('look', 3 + g.npcs[i].rnd() * 4); g.npcs[i].lookAt = [seat.x, 1.1, seat.z + 0.4]; }
    var last = '부정행위로 처리하겠습니다. 답안지는 회수합니다. 소지품을 챙겨 따라 나오세요.';
    if (why === 'sus' || why === 'look') {
      /* 의심이 가득 찼다: 곧장 걸어온다 */
      var sp = P.sideSpot(seat, 0.4);
      P.goTo(sp[0], sp[1], 1.75);
      UI.say('think', '(감독관이 곧장 이쪽으로 걸어온다.)', 2.6);
      yield* wait(0.5);
      var t = 0;
      while (!P.arrived() && t < 9) { t += (yield) || 0; pl.lookAt(P.x, 1.56, P.z, 0.5, true, 5); }
      P.faceYaw = Math.atan2(-(seat.x - P.x), -(seat.z + 0.35 - P.z));
      pl.lookAt(P.x, 1.58, P.z, 9, true, 5);
      yield* g.say('proctor', '수험생. 잠깐 멈추세요.', { wait: 2.0, who: P });
      if (why === 'look') {
        /* 안경은 이미 냈다(또는 빼앗겼다): 두리번거리다 걸린 것 */
        yield* g.say('proctor', '아까부터 계속 옆 사람 답안지를 넘겨다보셨습니다.', { wait: 3.2, who: P });
        yield* g.say('think', '(안경도 없이, 고개만 돌리다가 걸렸다.)', { wait: 2.6 });
        yield* g.say('proctor', last, { wait: 5.4, who: P });
        yield* g.fade(0, 1, 1.6);
        return;
      }
      yield* g.say('proctor', '그 안경, 벗어서 보여 주시겠습니까?', { wait: 2.8, who: P });
      g.dev.off('force');
      g.takeGlasses(P);
      P.rig.toolPose = [0.78, 1.72, 0.04, 0.3];
      g.exam.glasses = false; g.exam.refresh({ ar: 1 });
      yield* g.say('think', lit ? '(렌즈의 글자가 꺼지기도 전에, 안경이 감독관의 손에 넘어갔다.)'
        : '(렌즈는 꺼 두었지만 소용없었다. 감독관의 엄지가 안경다리 안쪽의 충전 단자를 찾아낸다.)', { wait: 3.6 });
      yield* g.say('proctor', (lit ? '화면이 나오는 안경이군요. ' : '전자기기군요. ') + last, { wait: 6.2, who: P });
    } else {
      /* 검사하던 감독관의 손에 이미 안경이 들려 있다 */
      pl.lookAt(P.x, 1.58, P.z, 9, true, 5);
      g.exam.glasses = false; g.exam.refresh({ ar: 1 });
      if (why === 'lit') {
        yield* g.say('think', '(끄는 것이 한발 늦었다. 렌즈의 불빛이 감독관의 얼굴에 푸르게 어린다.)', { wait: 3.4 });
        yield* g.say('proctor', '렌즈에 글자가 떠 있군요.', { wait: 2.4, who: P });
        yield* g.say('proctor', '화면이 나오는 안경이네요. ' + last, { wait: 6.2, who: P });
      } else {
        yield* g.say('proctor', '…안경다리가 따뜻하네요. 안에 뭐가 들어 있습니까?', { wait: 3.2, who: P });
        yield* g.say('think', '(렌즈는 꺼져 있었지만 식을 틈이 없었다. 감독관의 엄지가 안쪽의 충전 단자를 찾아낸다.)', { wait: 3.8 });
        yield* g.say('proctor', '전자기기군요. ' + last, { wait: 6.0, who: P });
      }
    }
    yield* g.fade(0, 1, 1.6);
  };

  /* 결과 화면으로. 어느 엔딩인지는 endings.js 의 judge 가 가른다(에필로그가 먼저 불러 두었으면 그것을 쓴다) */
  Game.prototype.finish = function () {
    var g = this, end = g.ending || (g.ending = g.judge()), d = {};
    g.phase = 'result';
    Input.active = false;
    Au.ambience(false); Au.lens(0);
    UI.hud(false); UI.clearSay(); UI.setBlur(0); UI.setCoach(null); UI.setMarker(null); UI.epilogue(null);
    d.score = end.score; d.caught = g.caught; d.peak = g.peak; d.qs = g.exam.qs;
    d.answers = g.exam.answers.slice(); d.scanned = g.exam.scanned.slice();
    /* 안경이 한 판 동안 겪은 일 */
    d.device = {
      battery: Math.ceil(g.dev.battery), dead: g.dev.dead, maxTemp: Math.round(26 + g.dev.stats.maxHeat * 0.3), thermal: g.dev.stats.thermal,
      boots: g.dev.stats.boots, takes: g.stat.takes, peeks: g.stat.peeks, saws: g.stat.saws, inspections: g.stat.inspections, used: end.kept
    };
    /* 엔딩 */
    d.ending = end.id; d.no = end.no; d.title = end.title; d.headline = end.title;
    d.stamp = end.stamp; d.stampClass = end.stampClass; d.story = end.story; d.glassesNote = end.glassesNote;
    d.kept = end.kept; d.evidence = end.evidence; d.evidencePts = end.evidencePts; d.exposeAt = end.exposeAt;
    d.playT = g.playT;
    d.isNew = GX.Endings.unlock(end.id);
    d.collection = GX.Endings.collection();
    g.result = d;
    Input.releaseLock();
    UI.showResult(d, function () { if (g.onRestart) g.onRestart(); }, function () { if (g.onTitle) g.onTitle(); });
    if (g.onResult) g.onResult(d);
  };

  /* 두 감독관 가운데 내 쪽으로 더 쏠린 시선(0..1) */
  Game.prototype.gaze = function () {
    var s = this.seat;
    return Math.max(this.proctor.attention(s.x, s.z + 0.4), this.proctor2.attention(s.x, s.z + 0.4));
  };
  Game.prototype.anyWatching = function () { return this.proctor.isWatching() || this.proctor2.isWatching(); };
  Game.prototype.nearestProctor = function () {
    var s = this.seat;
    return Math.min(this.proctor.dist(s.x, s.z), this.proctor2.dist(s.x, s.z));
  };

  /* ───────── 프레임마다 ───────── */
  Game.prototype.update = function (dt) {
    var g = this, pl = g.player, P = g.proctor, P2 = g.proctor2, world = g.world, i;
    g.t += dt;
    if (g.script) { if (g.script.next(dt).done) g.script = null; }
    for (i = g.tasks.length - 1; i >= 0; i--) {
      if (g.tasks[i].gen.next(dt).done) { g.tasks[i].done = true; g.tasks.splice(i, 1); }
    }

    /* 이번 판에 실제로 흐른 시간(시작 화면·결과 화면은 빼고, 빨리 감는 동안은 감은 만큼만) */
    if (g.phase !== 'title' && g.phase !== 'result') g.playT += g.ffwd ? dt / 8 : dt;
    if (g.phase === 'title' || g.phase === 'result') {
      g.titleCamera(dt);
    } else if (g.phase !== 'intro' && g.phase !== 'epilogue') {
      var extra = world.doorBlocked() ? [world.doorCollider] : null;
      pl.update(dt, Input, {
        colliders: world.colliders, extra: extra, circles: [[P.x, P.z, 0.32], [P2.x, P2.z, 0.32]],
        canMove: g.phase === 'walk', canLook: true
      });
      if (pl.stepped) Au.ownStep();
      g.exam.aspect = g.aspect;
      var inExam = g.phase === 'exam';
      if (g.phase === 'walk') g.walkLogic(dt);
      else if (inExam) g.examLogic(dt);
      else if (pl.mode === 'seat') g.seatLogic(dt);
      /* 시험 밖에서의 안경: 켜고 끌 수는 있지만 문항을 읽지는 않는다. 시험 중에는 examLogic 이 돌린다
         (시험이 끝나는 바로 그 프레임에 두 번 돌지 않도록, 프레임을 시작할 때의 단계로 가른다) */
      if (!inExam) g.lensTick(dt, PRE);
    }
    g.feel(dt);
    P.update(dt); P2.update(dt);
    for (i = 0; i < g.npcs.length; i++) g.npcs[i].update(dt);
    g.exam.update(dt, pl);
    /* 시계: 목표 시각까지 빠르게 돌아간다 */
    if (world.clockTime < g.clockTarget) world.clockTime = Math.min(g.clockTarget, world.clockTime + dt * g.clockRate);
    else if (g.phase === 'walk' || g.phase === 'sitting' || g.phase === 'title') world.clockTime += dt;
    world.updateDoor(dt); world.updateClock();
    var quiet = g.phase === 'title' || g.phase === 'result' || g.phase === 'intro' || g.phase === 'epilogue';
    if (world.updateLights(dt) && !quiet) Au.tubeFlick(world.flickPos[0], world.flickPos[1], world.flickPos[2]);
    g.hud(dt);
    g.coachTick(dt);
    var cam = pl.cam;
    Au.listener(cam.pos[0], cam.pos[1], cam.pos[2], pl.fwd[0], pl.fwd[1], pl.fwd[2]);
    Au.tick(dt, { clock: !quiet, tension: quiet ? 0 : g.tension, room: !quiet, inside: pl.eye[0] < 3.8 });
    UI.update(dt);
  };

  Game.prototype.titleCamera = function (dt) {
    var pl = this.player;
    this.titleT += dt;
    var a = this.titleT * 0.06;
    pl.eye[0] = 3.0 + Math.sin(a) * 0.35; pl.eye[1] = 1.72; pl.eye[2] = 4.15 + Math.cos(a * 0.7) * 0.12;
    pl.yaw = 0.56 + Math.sin(a * 0.8) * 0.07; pl.pitch = -0.1; pl.fov = 60;
  };

  /* 복도·교실을 걸어 자리를 찾는 동안 */
  Game.prototype.walkLogic = function (dt) {
    var g = this, pl = g.player, P = g.proctor, seat = g.seat, i, s, d;
    g.walkT += dt;
    var inside = pl.x < 3.72 && Math.abs(pl.z) < 4.8;
    if (inside && !g.flags.greet) {
      g.flags.greet = true; g.greetT = 5;
      UI.say('proctor', '어서 오세요. 수험번호 확인하시고 본인 자리에 앉아 주세요.');
      Au.voice('어서 오세요. 수험번호 확인하시고 본인 자리에 앉아 주세요.', 'proctor', [P.x, 1.6, P.z]);
    }
    if (g.greetT > 0) { g.greetT -= dt; P.lookAtPoint(pl.eye[0], pl.eye[1], pl.eye[2]); if (g.greetT <= 0) P.lookRel(0, -0.05); }
    /* 자리를 못 찾고 시간이 가면 재촉하고, 입실 마감 시각이 되면 감독관이 자리로 데려다 앉힌다 */
    g.walkAll += dt;
    if (!g.flags.hurry && g.walkAll > WALK_HURRY) {
      g.flags.hurry = true;
      if (inside) {
        UI.say('proctor', '수험생, 곧 입실 마감입니다. 자리에 앉아 주세요.');
        Au.voice('수험생, 곧 입실 마감입니다.', 'proctor', [P.x, 1.6, P.z]);
        g.greetT = 3;
      } else UI.say('think', '(곧 입실 마감이다. 제3고사실 뒷문으로 들어가 내 자리를 찾아야 한다.)', 3.6);
    }
    if (!g.flags.escort && g.walkAll > WALK_LIMIT) { g.flags.escort = true; g.spawn(g.escort()); }
    /* 자리 앞에서 */
    var prompt = null, near = null, nd = 0.95;
    for (i = 0; i < g.world.seats.length; i++) {
      s = g.world.seats[i];
      d = Math.sqrt(Math.pow(pl.x - s.chair[0], 2) + Math.pow(pl.z - s.chair[1], 2));
      if (d < nd) { nd = d; near = s; }
    }
    if (near === seat) {
      prompt = '<kbd>E</kbd> 내 자리에 앉기';
      if (Input.hit('KeyE')) { g.beginSit(); return; }
    } else if (near && g.emptySeats.indexOf(near) >= 0) {
      prompt = '<kbd>E</kbd> 앉기';
      if (Input.hit('KeyE')) { UI.toast('내 자리가 아니다. 내 수험번호는 ' + seat.no, 'warn'); Au.ui('deny'); }
    }
    UI.setPrompt(prompt);
    /* 렌즈의 글자 인식: 책상 번호표·좌석 배치도·고사실 표지(렌즈가 켜져 있을 때만) */
    var label = null, f = pl.fwd, e = pl.eye;
    var live = g.glasses === 'ai' && g.dev.power === 'on';
    g.seatMarker(live && near !== seat);
    if (!live) { UI.setLensLabel(null); return; }
    if (f[1] < -0.12) {
      var t = (W.DESK_Y - e[1]) / f[1], hx = e[0] + f[0] * t, hz = e[2] + f[2] * t;
      if (t > 0 && t < 2.8) {
        for (i = 0; i < g.world.seats.length; i++) {
          s = g.world.seats[i];
          if (Math.abs(hx - s.x) < 0.34 && Math.abs(hz - s.z) < 0.24) {
            label = '수험번호 ' + s.no + (s === seat ? '  ✓ 내 자리' : '');
            break;
          }
        }
      }
    }
    if (!label) {
      var cx = 4.0 - e[0], cy = 1.43 - e[1], cz = 1.8 - e[2], cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
      if (cl < 2.3 && e[0] > 4.0 && (cx * f[0] + cy * f[1] + cz * f[2]) / cl > 0.9) {
        label = '좌석 배치도 인식 · 내 자리: 창 쪽에서 ' + (seat.col + 1) + '번째 열, 앞에서 ' + (seat.row + 1) + '번째';
      } else {
        cx = 3.95 - e[0]; cy = 1.87 - e[1]; cz = 2.875 - e[2]; cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (cl < 2.6 && e[0] > 4.0 && (cx * f[0] + cy * f[1] + cz * f[2]) / cl > 0.93) label = '제3고사실 인식 · 수험표의 고사실과 일치';
      }
    }
    UI.setLensLabel(label);
  };

  /* 렌즈가 켜져 있으면 내 자리 위에 표시를 띄워 길을 알려 준다(시야 밖이면 그쪽 가장자리에 붙는다).
     안경이 얼마나 편한 물건인지 — 그래서 왜 벗기 싫어지는지 — 를 처음 걷는 복도에서부터 보여 주는 장치이기도 하다 */
  Game.prototype.seatMarker = function (on) {
    var g = this, pl = g.player, s = g.seat;
    if (!on) { UI.setMarker(null); return; }
    var e = pl.eye, cy = Math.cos(pl.yaw), sy = Math.sin(pl.yaw), cp = Math.cos(pl.pitch), sp = Math.sin(pl.pitch);
    var dx = s.chair[0] - e[0], dy = 1.22 - e[1], dz = s.chair[1] - e[2];      /* 내 의자 위, 앉은 사람 머리 높이 */
    var fx = -sy * cp, fy = sp, fz = -cy * cp, rx = cy, rz = -sy;             /* 시선 방향 · 오른쪽 */
    var ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;                   /* 위 = 오른쪽 × 시선 */
    var zc = dx * fx + dy * fy + dz * fz, xc = dx * rx + dz * rz, yc = dx * ux + dy * uy + dz * uz;
    var tv = pl.tanHalfFov(g.aspect || 1.6), x, y, edge = 0;
    if (zc < 0.08) { x = xc >= 0 ? 0.95 : 0.05; y = 0.5; edge = xc >= 0 ? 1 : -1; }
    else {
      x = 0.5 + xc / (zc * tv * (g.aspect || 1.6)) * 0.5; y = 0.5 - yc / (zc * tv) * 0.5;
      if (x < 0.05) { x = 0.05; edge = -1; } else if (x > 0.95) { x = 0.95; edge = 1; }
      y = GX.clamp(y, 0.2, 0.8);
    }
    var dist = Math.sqrt(dx * dx + dz * dz);
    UI.setMarker({ x: x, y: y, edge: edge, text: '내 자리 · ' + Math.max(1, Math.round(dist)) + 'm' });
  };

  /* 앉아서 기다리는 동안(시험 전) */
  Game.prototype.seatLogic = function (dt) {
    var g = this, prompt = null;
    void dt;
    if (g.want === 'place') { prompt = '<kbd>E</kbd> 신분증·수험표 꺼내기'; if (Input.hit('KeyE')) g.placeItems(); }
    else if (g.want === 'id') { prompt = '<kbd>E</kbd> 신분증 내밀기'; if (Input.hit('KeyE')) g.idShown = true; }
    else if (g.want === 'phone') { prompt = '<kbd>E</kbd> 휴대폰 제출'; if (Input.hit('KeyE')) g.phoneGiven = true; }
    UI.setPrompt(prompt);
    if (Input.hit('Space')) g.toggleLook();
    /* 내가 할 일이 없는 동안에는 T 를 길게 눌러 기다리는 시간을 빨리 보낼 수 있다(canSkipWait) */
    var wantFF = Input.down('KeyT');
    g.ffwd = wantFF && g.canSkipWait();
    if (wantFF && !g.ffwd && Input.hit('KeyT') && g.phase === 'seated') {
      UI.toast(g.flags.nearBell ? '곧 본령이다 · 시간을 빨리 보낼 수 없다' : '지금은 내 차례라 시간을 빨리 보낼 수 없다', 'info', 2.2);
    }
    UI.ff(g.ffwd);
    /* 종은 이미 울렸고 감독관의 "시작하십시오"만 남은 짧은 틈: 넘기려는 손은 이른 것이 아니다. 적어 두었다가 시작과 함께 넘긴다 */
    if (g.flags.bell) {
      if (Input.hit('KeyD') || Input.hit('ArrowRight') || Input.wheel > 0) g.flags.coverWanted = true;
      return;
    }
    /* 본령 전에 문제지를 넘기려 하면 */
    if (g.exam.state === 'cover' && g.phase === 'seated') {
      var tried = Input.hit('KeyA') || Input.hit('KeyD') || Input.hit('ArrowLeft') || Input.hit('ArrowRight') || Input.wheel !== 0;
      for (var k = 1; k <= 5; k++) if (Input.hit('Digit' + k)) tried = true;
      if (tried) {
        if (!g.flags.flipWarn) {
          g.flags.flipWarn = true;
          UI.say('proctor', '수험생, 본령 전에는 문제지를 넘기지 마세요.');
          Au.voice('수험생, 본령 전에는 문제지를 넘기지 마세요.', 'proctor', [g.proctor.x, 1.6, g.proctor.z]);
          g.addSus(7);
        } else {
          UI.toast('본령 전에는 문제지를 넘길 수 없다', 'warn');
        }
        g.exam.nudge();
        Au.ui('deny');
      }
    }
  };

  Game.prototype.toggleLook = function () {
    var pl = this.player;
    if (pl.pitch < -0.5) pl.lookDir(0, -0.04, 0.9, 7);
    else pl.lookDir(0.25, -0.93, 0.9, 7);
  };
  Game.prototype.addSus = function (v) {
    this.sus = GX.clamp(this.sus + v, 0, 100);
    if (this.sus > this.peak) this.peak = this.sus;
    this.clean = 0;
  };

  /* 시험 시간 */
  Game.prototype.examLogic = function (dt) {
    var g = this, pl = g.player, P = g.proctor, P2 = g.proctor2, ex = g.exam, dev = g.dev, i, k;
    var ai = g.glasses === 'ai';
    /* 시간 빨리 보내기는 고개를 숙이고 기다리는 것이다: 렌즈가 켜져 있거나 검사를 받는 중에는 안 된다 */
    var wantFF = Input.down('KeyT'), lensBusy = ai && dev.power !== 'off';
    /* 본령 전부터 누르고 있던 T 는 한 번 뗐다가 다시 눌러야 듣는다(모르는 사이에 시험 시간을 흘려보내지 않게) */
    if (!wantFF) g.ffHold = false;
    g.ffwd = wantFF && !g.ffHold && !lensBusy && !g.inspecting;
    if (wantFF && !g.ffwd && Input.hit('KeyT')) UI.toast(g.inspecting ? '지금은 시간을 빨리 보낼 수 없다' : '렌즈가 켜져 있는 동안에는 시간을 빨리 보낼 수 없다', 'info', 2.2);
    UI.ff(g.ffwd);
    /* 시간 */
    g.left -= dt;
    g.world.clockTime = T_BELL + (1 - Math.max(0, g.left) / EXAM_SECONDS) * 80 * 60;
    g.clockTarget = g.world.clockTime;
    if (!g.flags.ten && g.left <= EXAM_SECONDS / 8) {
      g.flags.ten = true;
      if (!g.inspecting) {
        UI.say('proctor', '시험 종료 10분 전입니다.');
        Au.voice('시험 종료 10분 전입니다.', 'proctor', [P.x, 1.6, P.z]);
      }
      for (i = 0; i < g.npcs.length; i++) g.npcs[i].react('announce');
    }
    /* 종료령은 진행 중인 안경 검사가 끝난 다음에 울린다 */
    if (g.left <= 0 && !g.inspecting) { g.phase = 'ended'; return; }

    /* 조작 */
    var gz = ex.gaze(pl.eye, pl.fwd), covered = ex.state === 'cover';
    /* 마우스 휠: 한 번 굴린 것(트랙패드라면 한 번 쓸어 넘긴 것)이 한 장이다.
       휠 신호가 이어지는 동안은 같은 동작으로 치고, 잠잠해진 뒤의 신호부터 다음 장으로 친다(관성으로 여러 장이 넘어가지 않게) */
    var wheel = 0;
    if (Input.wheel) { if (g.wheelQuiet <= 0) wheel = Input.wheel > 0 ? 1 : -1; g.wheelQuiet = 0.3; }
    else if (g.wheelQuiet > 0) g.wheelQuiet -= dt;
    if (!g.ffwd) {
      var num = -1;
      for (k = 1; k <= 5; k++) if (Input.hit('Digit' + k) || Input.hit('Numpad' + k)) num = k - 1;
      var dir = (Input.hit('KeyD') || Input.hit('ArrowRight') ? 1 : 0) - (Input.hit('KeyA') || Input.hit('ArrowLeft') ? 1 : 0);
      if (!dir) dir = wheel;
      if (covered) {
        /* 본령이 울렸다: 표지는 내 손으로 넘긴다(문항을 넘기는 것과 같은 키) */
        if (dir > 0) g.openBook(false);
        else if (num >= 0 || dir < 0) UI.toast('먼저 표지를 넘기세요 · D 키(또는 →, 마우스 휠)', 'info', 2.2);
      } else {
        if (num >= 0 && ex.mark(ex.flipTo !== null ? ex.flipTo : ex.cur, num)) Au.penMark();
        if (dir && ex.goto(ex.cur + dir)) Au.pageTurn(1);
        if (Input.clicked) {
          /* 답안지 칸을 직접 눌러 표기(드래그 모드에서는 커서 위치 기준) */
          var gc = (Input.clickX || Input.clickY) ? ex.gaze(pl.eye, pl.rayAt(Input.clickX, Input.clickY, g.aspect)) : gz;
          if (gc.on === 'omr' && gc.row >= 0) {
            if (ex.mark(gc.row, gc.col)) Au.penMark();
            if (gc.row !== ex.cur && ex.goto(gc.row)) Au.pageTurn(1);
          }
        }
      }
      if (Input.hit('Space')) g.toggleLook();
    }
    if (ex.state === 'cover') {
      /* 넘기는 법을 몰라 시간을 다 보내지 않도록, 조금 기다렸다가 저절로 넘긴다 */
      g.coverT += dt;
      if (g.coverT >= COVER_AUTO) g.openBook(true);
    }
    UI.setLensLabel(null);

    /* AI 안경: 켜진 채로 문제지를 보고 있으면 스스로 문항을 읽고 답을 만든다.
       표지가 덮여 있는 동안은 시험 전과 같은 대기 상태다: 읽을 문항이 없고, 기다리다 스스로 꺼지지도 않는다
       ("본령이 울리면 문항을 읽습니다"라고 해 놓고 표지를 넘기기 직전에 꺼져 버리면 안 된다) */
    g.lensTick(dt, ex.state === 'open'
      ? { gaze: gz.on === 'book', q: ex.flipTo === null ? ex.cur : -1, scanned: ex.scanned, chars: ex.chars(ex.cur) } : PRE);
    if (g.flags.firstUse > 0) {
      g.flags.firstUse -= dt;
      if (g.flags.firstUse <= 0) {
        UI.say('think', '(…정말로 답이 뜬다.)', 2.4);
        UI.toast('신뢰도가 높아도 틀릴 수 있다 · 다 보면 꺼 두자(그냥 두면 8초 뒤 스스로 꺼진다)', 'info', 5.5);
      }
    }

    /* 눈에 띄는 것들(렌즈 반사·안경 만지는 손·진동 소리·옆자리 시선)이 의심으로 쌓인다. A: 감독관의 시선 */
    var A = g.notice(dt);
    g.att = GX.damp(g.att, A, 10, dt);
    /* 렌즈가 켜져 있는데 눈길이 오거나, 옆에서 쳐다보거나, 감독관이 다가오면: 급하게 끌 때다 */
    var threat = ai && (dev.power === 'on' || dev.power === 'boot') && !g.noHands &&
      (A > 0.2 || g.peekL || g.peekR || !!P.take || !!P2.take || g.inspecting || g.anyWatching() || g.nearestProctor() < 2.0);
    UI.setPrompt(threat ? '<kbd>F</kbd> 급하게 끄기' : null, threat);
    var heat = GX.clamp(g.sus / 70 + g.uses * 0.05 + g.heatExtra, 0, 1);
    P.examUpdate(dt, heat); P2.examUpdate(dt, heat);
    /* 감독관이 옆을 지나가면 수험생들이 움찔한다 */
    g.passT -= dt;
    if (g.passT <= 0) {
      g.passT = 0.5;
      for (i = 0; i < g.npcs.length; i++) {
        var n = g.npcs[i];
        if ((P.moving && P.dist(n.cx, n.cz - 0.3) < 1.0) || (P2.moving && P2.dist(n.cx, n.cz - 0.3) < 1.0)) n.react('pass');
      }
    }

    /* 두리번거림: 옆·뒤를 오래 보면 의심을 산다. 다가온 감독관을 쳐다보는 것은 예외이고,
       시간을 빨리 보내는 동안은 고개를 숙이고 기다리는 것으로 친다 */
    var atProctor = false;
    for (i = 0; i < 2; i++) {
      var hw = g.proctors[i].rig.headWorld, tx = hw[0] - pl.eye[0], ty = hw[1] - pl.eye[1], tz = hw[2] - pl.eye[2];
      var tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      if ((tx * pl.fwd[0] + ty * pl.fwd[1] + tz * pl.fwd[2]) / tl > 0.88 && tl < 3.5) atProctor = true;
    }
    var looking = Math.abs(pl.yaw) > 1.0 && !g.ffwd && !atProctor && !g.inspecting;
    if (looking) {
      g.lookT += dt;
      if (g.lookT > 1.2) {
        g.blame(dt * (2.5 + 6 * A), '두리번거림');
        if (!g.flags.lookWarn && A > 0.3) {
          g.flags.lookWarn = true;
          var wp = P.attention(g.seat.x, g.seat.z + 0.4) >= P2.attention(g.seat.x, g.seat.z + 0.4) ? P : P2;
          UI.say('proctor', '수험생, 본인 답안지만 보세요.');
          Au.voice('수험생, 본인 답안지만 보세요.', wp.chief ? 'proctor' : 'proctor2', [wp.x, 1.6, wp.z]);
        } else if (!g.flags.lookTip) { g.flags.lookTip = true; UI.toast('두리번거리면 의심을 산다', 'warn'); }
      }
    } else g.lookT = Math.max(0, g.lookT - dt * 2);

    /* 의심은 렌즈를 끄고 가만히 있으면 천천히 가라앉는다(감독관이 눈으로 본 만큼은 남는다) */
    if (!looking && !g.inspecting && !(ai && dev.isLit())) {
      g.clean += dt;
      /* 빨리 감는 동안에는 실제 시간 기준으로만 가라앉는다(빨리 감기로 의심을 씻어 낼 수 없게) */
      var calm = g.ffwd ? dt / 8 : dt;
      if (g.clean > 2.5 && !g.anyWatching() && g.sus > g.floor) g.sus = Math.max(g.floor, g.sus - calm * 1.3);
    }
    if (g.inspecting) {
      /* 검사 대본이 도는 동안에는 다른 규칙이 끼어들지 않는다 */
    } else if (g.sus >= INSPECT_AT && g.sus < 100 && ai && !g.flags.inspected && g.left > 18) {
      /* 안경 검사: 지켜보던 감독관(없으면 가까운 감독관)이 안경을 벗겨 본다 */
      g.startInspect(g.inspector(), 'sus');
    } else if (g.sus >= WATCH_AT && !g.anyWatching()) {
      /* 가까운 감독관이 와서 지켜본다 */
      var w1 = P.canWatch(), w2 = P2.canWatch(), who = null;
      if (w1 && w2) who = P.dist(g.seat.x, g.seat.z) <= P2.dist(g.seat.x, g.seat.z) ? P : P2;
      else if (w1) who = P; else if (w2) who = P2;
      if (who) {
        who.watchPlayer();
        g.stat.watches++;
        who.other.ai.watchCool = Math.max(who.other.ai.watchCool, 14);
        UI.say('think', who.z > pl.eye[2] ? '(뒤에서 발소리가 다가온다.)' : '(감독관이 이쪽으로 걸어온다.)', 2.6);
      }
    }
    if (g.sus >= 70 && g.sus < 100 && !g.flags.hot && !g.inspecting) {
      g.flags.hot = true;
      UI.say('think', ai && !g.flags.inspected ? '(의심이 턱밑까지 찼다. 조금만 더 차면 안경을 보자고 할 것이다.)' : '(의심이 턱밑까지 찼다. 한 번만 더 눈에 띄면 끝이다.)', 3.4);
    }
    /* 안경 없이 의심이 가득 찼다면 남의 답안지를 넘겨다본 것이다 */
    if (g.sus >= 100 && !g.inspecting) { g.caughtWhy = ai ? 'sus' : 'look'; g.phase = 'caught'; return; }

    /* 표시 */
    var answered = 0;
    for (i = 0; i < 10; i++) if (ex.answers[i] >= 0) answered++;
    UI.setTimer(mmss(g.left), '교실 시계 ' + clockText(g.world.clockTime) + ' · 표기 ' + answered + '/10', g.left < 45);
    if (answered === 10 && !g.flags.allDone) {
      g.flags.allDone = true;
      UI.toast('모두 표기했다 · T 를 길게 누르면 종료령까지 기다린다', 'info', 4.5);
    }
  };

  Game.prototype.hud = function (dt) {
    var g = this;
    var seated = g.player.mode === 'seat' && g.phase !== 'result' && g.phase !== 'title' && g.phase !== 'epilogue';
    var exam = g.phase === 'exam', T = g.tension, i;
    /* 긴장하면 심장이 뛸 때마다 시야 가장자리가 붉게 조여 온다 */
    var pulse = 0.7 + 0.3 * g.beatEnv;
    UI.setPeek(exam && g.peekL, exam && g.peekR);
    UI.setGlint(exam ? GX.clamp(g.glint * 2.2, 0, 1) : 0);
    /* 의심도는 시험이 시작된 뒤(또는 이미 의심을 산 뒤)에만 보여 준다 */
    var show = seated && (exam || g.phase === 'ended' || g.phase === 'caught' || g.sus > 0);
    if (!show) { UI.setSuspicion(null); UI.setDanger(seated ? T * 0.5 * pulse : 0); return; }
    if (!exam) g.att = GX.damp(g.att, g.gaze(), 10, dt);
    var lvl = g.att < 0.1 ? 0 : (g.att < 0.38 ? 1 : 2);
    var beside = g.proctor.ai.state === 'watch' || g.proctor2.ai.state === 'watch';
    var taking = !!(g.proctor.take || g.proctor2.take);
    var txt = g.inspecting ? '시선: 안경을 검사하는 중' : (beside ? '시선: 바로 옆에서 지켜보는 중' :
      (taking ? '시선: 걸음을 멈추고 이쪽을 본다' :
        (exam && g.glint > 0.06 ? '시선: 렌즈에 비친 빛을 본다' :
          (lvl === 0 ? '시선: 느껴지지 않음' : (lvl === 1 ? '시선: 스치는 눈길' : '시선: 따가운 눈길')))));
    if (taking || (exam && g.glint > 0.06)) lvl = 2;
    var why = [];
    for (i = 0; i < g.causes.length; i++) why.push(g.causes[i].text);
    UI.setSuspicion(g.sus, lvl, txt, why, g.glasses === 'ai' && !g.flags.inspected);
    UI.setHeart(g.bpm, T);
    /* 안경 상태(배터리·온도): 꺼져 있어도 내가 아는 만큼은 보여 준다. 안경이 감독관 손에 가 있는 동안은 알 길이 없다 */
    if (g.glasses === 'ai' && !g.specsTaken) {
      var d = g.dev;
      UI.setDevice({ power: d.dead ? 'dead' : (d.locked ? 'hot' : d.power), battery: Math.ceil(d.battery), low: d.battery <= 20, temp: d.tempC(), zone: d.heatZone(), heat: d.heat, uses: g.uses });
    } else UI.setDevice(null);
    var danger = GX.smoothstep(60, 100, g.sus) * 0.85;
    UI.setDanger(Math.max(danger, T * 0.55) * pulse);
  };

  GX.Game = Game;
  GX.EXAM_SECONDS = EXAM_SECONDS;
})(window.GX = window.GX || {});
