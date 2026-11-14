/* 눈치 — AI 안경을 쓰는 순간이 남의 눈과 귀에 걸리는 경로, 그리고 내 긴장.
 *  · 안경 조작: 안경다리를 건드려 켜고 끄기, 기기가 알려 오는 사건(켜짐·답·배터리·과열)을 소리와 글로
 *  · 렌즈 불빛: 감독관이 내 쪽을 보고 있을 때 켜진 렌즈가 눈에 걸린다 → 쌓이면 걸음을 멈추고 다시 본다
 *  · 손동작: 안경다리를 만지는 손이 보인다 / 진동 소리: 가까이 있는 감독관 귀에 들어간다
 *  · 옆자리 시선: 곁눈에 불빛이 걸린 옆 사람이 고개를 돌린다 → 봤으면 감독관의 눈길을 끌고, 거듭되면 손을 든다
 *  · 긴장: 위의 모든 것이 심장 박동·숨·먹먹한 소리·떨리는 손으로 돌아온다
 * 진행(flow.js)의 Game 에 덧붙인다.
 */
(function (GX) {
  'use strict';
  var UI = GX.UI, Au = GX.Audio, Input = GX.Input, G = GX.Game.prototype;

  var N = {
    GLINT_RATE: 34,            /* 렌즈 불빛이 정면에서 또렷이 보일 때 초당 의심 */
    GLINT_MIN: 0.05,           /* 이보다 흐릿하게 스친 불빛은 '다시 보게' 만들지는 않는다 */
    GLINT_TAKE: 0.4,           /* 한 감독관 눈에 이만큼 쌓이면 걸음을 멈추고 다시 본다 */
    TAKE_TIME: 2.4,            /* 멈춰 서서 보는 시간 */
    TAKE_GRACE: 1.0,           /* 그 안에 렌즈가 꺼지면 '잘못 봤나' 하고 넘어간다 */
    TOUCH_RATE: 16,            /* 안경다리를 만지는 손이 보일 때 초당 의심 */
    FIDGET_N: 6, FIDGET_T: 20, /* 이 시간 안에 이만큼 만지면 '자꾸 만진다'(켰다 껐다를 세 번) */
    NOISE: { boot: 0.25, ready: 0.4, low: 0.5, dead: 0.6, thermal: 1.0 },       /* 진동 소리 크기 */
    CURIOUS_LUM: 0.12,         /* 옆 사람의 궁금증: 렌즈 밝기에 비례해 초당 */
    CURIOUS_TOUCH: 0.15,       /* 손이 올라가 있는 동안 초당 */
    CURIOUS_NOISE: 0.15,       /* 진동 소리 한 번에(크기에 비례) */
    CURIOUS_FADE: 0.012,       /* 아무 일 없으면 초당 이만큼 시들해진다(쉬어 가며 쓰면 눈치채지 못한다) */
    WITNESS: 1.3,              /* 쳐다보는 동안 렌즈가 이만큼(초) 켜져 있으면 '봤다' */
    STARE_BACK: 0.45           /* 내가 이만큼 마주 보면 옆 사람이 눈을 피한다 */
  };
  GX.NOTICE_CFG = N;
  var GLINT = '렌즈 반사';       /* 의심 게이지에 뜨는 까닭 이름: 켜진 렌즈에 비친 불빛이 남의 눈에 걸린 것 */

  G.noticeReset = function () {
    var g = this, i;
    g.tension = 0; g.spike = 0; g.beatT = 0; g.beatEnv = 0; g.breathT = 2; g.bpm = 62;
    g.glint = 0; g.A = 0;
    g.causeAcc = {}; g.causes = [];
    g.neighbors = []; g.peekL = false; g.peekR = false; g.sawCount = 0; g.reportT = 0; g.reporter = null;
    g.heatExtra = 0;
    g.touchLog = []; g.fidgetCool = 0;
    g.lensFlags = {};
    g.stat = { takes: 0, peeks: 0, saws: 0, heard: 0, panicOff: 0, inspections: 0, watches: 0, by: {} };
    for (i = 0; i < 2; i++) if (g.proctors && g.proctors[i]) { g.proctors[i].glintAcc = 0; g.proctors[i].take = null; }
  };

  /* 좌우 옆자리에 앉은 수험생(같은 줄, 바로 옆 열) */
  G.findNeighbors = function () {
    var g = this, out = [], i;
    for (i = 0; i < g.npcs.length; i++) {
      var s = g.npcs[i].seat;
      if (s.row === g.seat.row && Math.abs(s.col - g.seat.col) === 1) {
        out.push({ npc: g.npcs[i], side: s.x < g.seat.x ? -1 : 1, curious: 0.15 + g.rnd() * 0.25, witness: 0, cool: 6 + g.rnd() * 6, peeking: false, sawNow: false, saw: 0, stare: 0 });
      }
    }
    g.neighbors = out;
  };

  G.lensOn = function () { return this.glasses === 'ai' && (this.dev.power === 'on' || this.dev.power === 'boot' || this.dev.lum > 0.05); };

  /* 의심을 올리며 까닭을 적어 둔다(화면에 '+ 렌즈 반사' 같은 꼬리표로 뜬다) */
  G.blame = function (v, why) {
    if (v <= 0 || this.inspecting) return;       /* 검사가 시작되면 판가름은 안경을 넘겨주는 순간에 난다 */
    this.addSus(v);
    if (!why) return;
    this.stat.by[why] = (this.stat.by[why] || 0) + v;      /* 한 판 동안 까닭별로 쌓인 의심(결과 화면에 보여 준다) */
    var acc = this.causeAcc;
    acc[why] = (acc[why] || 0) + v;
    if (acc[why] >= 1.2) {
      acc[why] = 0;
      var c = this.causes, i;
      for (i = 0; i < c.length; i++) if (c[i].text === why) { c[i].t = 2.6; return; }
      c.push({ text: why, t: 2.6 });
      if (c.length > 3) c.shift();
    }
  };

  /* ───────── 안경 조작 ───────── */
  /* F(또는 마우스 오른쪽 버튼)를 눌렀다: 왼손이 안경다리로 올라간다 */
  G.lensKey = function () {
    var g = this, ex = g.exam;
    if (g.glasses !== 'ai') { UI.toast(g.confiscated ? 'AI 안경은 압수당했다' : 'AI 안경은 수거함에 있다', 'info', 1.8); return; }
    if (g.noHands || ex.holdId || ex.holdPhone) { UI.toast('지금은 손을 쓸 수 없다', 'info', 1.4); return; }
    if (!ex.touchTemple(g.dev.power === 'on' || g.dev.power === 'boot')) g.lensHit();        /* 걷는 중에는 손이 보이지 않으니 바로 닿은 것으로 */
  };
  /* 손끝이 안경다리에 닿았다 */
  G.lensHit = function () {
    var g = this, dev = g.dev, was = dev.busy(), r = dev.toggle();
    Au.haptic('tap');
    UI.nudge();
    g.touchLog.push(g.t);
    g.coachTap(r);              /* 조작 안내가 '내 손으로 켰다/껐다'를 알 수 있게(스스로 꺼지거나 빼앗긴 것과 가른다) */
    if (r === 'dead') UI.toast('반응이 없다 · 배터리가 다 됐다', 'warn', 2.2);
    else if (r === 'hot') UI.toast('아직 뜨겁다 · 식을 때까지 켜지지 않는다', 'warn', 2.4);
    else if (r === 'off' && g.phase === 'exam' && (g.A > 0.2 || g.peekL || g.peekR || g.nearestProctor() < 2.2)) {
      g.stat.panicOff++;
      if (was && !g.lensFlags.panic) { g.lensFlags.panic = true; UI.toast('급하게 껐다 · 읽던 것은 날아갔다', 'info', 2.2); }
    }
  };

  /* 프레임마다: 조작을 받고, 기기를 돌리고, 기기가 알려 온 일을 처리하고, 렌즈 화면을 그린다 */
  G.lensTick = function (dt, ctx) {
    var g = this, dev = g.dev, ex = g.exam, ai = g.glasses === 'ai', pressed = Input.hit('KeyF') || Input.rhit;
    var over = g.phase === 'ended' || g.phase === 'caught';          /* 시험이 끝났거나 적발된 뒤에는 안경을 만질 수 없다 */
    if (pressed && g.ffwd) UI.toast('시간을 빨리 보내는 동안에는 안경을 만질 수 없다 · T 를 떼세요', 'info', 2);
    else if (pressed && !over && g.phase !== 'sitting') g.lensKey();
    /* 손끝이 닿은 순간에 켜지고 꺼진다. 손이 올라가는 사이에 안경이 감독관 손으로 넘어갔거나 시험이 끝났다면 허공을 친 것이다
       (끝나면서 꺼진 안경을 늦게 닿은 손이 도로 켜면 안 된다) */
    if (ex.takeHit() && ai && !g.noHands && !over) g.lensHit();
    if (!ai) { UI.setLens(null); Au.lens(0); ex.arWant = 0; ex.scanT = -1; UI.setRing(null); return; }
    dev.update(dt, ctx);
    g.lensEvents();
    var v = dev.view(ex);
    UI.setLens(v);
    /* 문제지 위에 겹쳐 뜨는 표시 */
    var m = dev.power === 'on' ? dev.mode : 'idle', step = 0;
    if (m === 'lock') step = Math.min(3, Math.floor(dev.k * 4));
    else if (m === 'read') step = Math.min(6, Math.floor(dev.k * 6.4));
    else if (m === 'think') step = Math.floor(dev.t * 2.5) % 4;
    ex.setAR(m === 'stream' ? 'show' : m, step, dev.q);
    ex.arWant = GX.clamp(dev.lum * 2.4, 0, 1);
    ex.scanT = (m === 'lock' || m === 'read') && dev.awayT === 0 ? dev.t * 0.5 : -1;
    UI.setRing(dev.power === 'boot' || dev.busy() ? dev.progress() : null);
    Au.lens(dev.power === 'on' ? (m === 'think' ? 1 : (m === 'read' || m === 'lock' || m === 'stream' ? 0.6 : 0.18)) : (dev.power === 'boot' ? 0.4 : 0));
  };

  G.lensEvents = function () {
    var g = this, dev = g.dev, ex = g.exam, ev = dev.drain(), i, e, F = g.lensFlags;
    /* 안경이 감독관 손에 가 있거나(검사·적발) 시험이 끝났으면, 식었다느니 따뜻하다느니 하는 내 느낌은 띄우지 않는다
       (빼앗긴 안경을 두고 "다시 켤 수 있다"고 알리면 안 된다) */
    var gone = g.specsTaken || g.phase === 'ended' || g.phase === 'caught';
    for (i = 0; i < ev.length; i++) {
      e = ev[i];
      switch (e.type) {
        case 'boot': Au.haptic('boot'); g.noise(N.NOISE.boot); break;
        case 'booted': Au.ui('boot'); break;
        case 'lock': Au.ui('lock'); break;
        case 'read': Au.ui('read'); break;
        case 'retry': Au.ui('retry'); break;
        case 'recall': Au.ui('lock'); break;
        case 'lost':
          Au.ui('lost');
          if (!F.lost) { F.lost = true; UI.toast('문항을 놓쳤다 · 읽는 동안에는 문제지를 보고 있어야 한다', 'info', 3.2); }
          break;
        case 'answer': g.onAnswer(e.q); break;
        case 'sleep':
          if (e.why !== 'force') Au.ui('off');
          break;
        case 'low':
          Au.haptic('low'); Au.ui('low'); g.noise(N.NOISE.low);
          UI.toast('배터리 20% · 경고 진동이 울렸다', 'warn', 3);
          break;
        case 'crit':
          Au.ui('low');
          UI.toast('배터리 8% · 절전 상태라 답이 느리게 나온다', 'warn', 3);
          break;
        case 'dead':
          Au.haptic('dead'); g.noise(N.NOISE.dead);
          UI.say('think', '(렌즈가 꺼졌다. 배터리가 다 됐다. 남은 문제는 내 머리로 풀어야 한다.)', 4);
          break;
        case 'warm':
          if (!F.warm && !gone) { F.warm = true; UI.say('think', '(안경다리가 따뜻해졌다. 지금 누가 만져 보면 알 것이다.)', 3.4); }
          break;
        case 'hot':
          Au.ui('hot');
          UI.toast('안경이 뜨겁다 · 답이 느리게 나온다 · 꺼 두면 식는다', 'warn', 3.4);
          break;
        case 'thermal':
          Au.haptic('thermal'); g.noise(N.NOISE.thermal);
          g.spike = Math.max(g.spike, 0.8);
          UI.say('think', '(안경이 길게 떨더니 꺼졌다. 과열이다. 관자놀이가 뜨겁다.)', 3.6);
          UI.toast('과열로 꺼졌다 · 식을 때까지 켤 수 없다', 'warn', 3.4);
          break;
        case 'cool':
          if (!gone) UI.toast('안경이 식었다 · 다시 켤 수 있다', 'info', 2.4);
          break;
        default: break;
      }
    }
    void ex;
  };

  /* 렌즈에 답이 떴다 */
  G.onAnswer = function (q) {
    var g = this, res = g.exam.reveal(q), i;
    g.uses++;
    Au.haptic('ready'); g.noise(N.NOISE.ready);
    Au.ui(res.conf < 80 ? 'shaky' : 'found');
    if (g.uses === 1) g.flags.firstUse = 2.2;
    /* 옆에 서서 지켜보는 감독관 앞에서 답이 뜨면 그대로 들킨다 */
    for (i = 0; i < 2; i++) {
      var P = g.proctors[i];
      if (P.ai.state === 'watch' && P.dist(g.seat.x, g.seat.z) < 1.5) g.blame(100, '눈앞에서 답이 떴다');
    }
  };

  /* ───────── 들키는 경로 ───────── */
  /* 감독관 자리에서 내 렌즈가 얼마나 잘 보이는가(0..1.25): 얼굴이 향한 쪽에서는 잘 보이고, 뒤에서는 가까이 와야 보인다.
     고개를 들고 있으면 렌즈가 정면을 향해 더 잘 보인다 */
  G.lensGeo = function (P) {
    var pl = this.player, hw = P.rig.headWorld, dx = hw[0] - pl.eye[0], dz = hw[2] - pl.eye[2], d = Math.sqrt(dx * dx + dz * dz) || 0.001;
    var f = (-Math.sin(pl.yaw) * dx - Math.cos(pl.yaw) * dz) / d;
    var front = 0.12 + 0.88 * GX.smoothstep(-0.35, 0.5, f);
    var close = 0.8 * GX.smoothstep(1.9, 1.1, d);
    return Math.max(front, close) * GX.lerp(0.8, 1.25, GX.smoothstep(-0.7, -0.2, pl.pitch));
  };

  /* 진동 소리가 났다: 가까이 있는 감독관이 듣고 돌아본다. 옆 사람도 궁금해한다 */
  G.noise = function (level) {
    var g = this, s = g.seat, pl = g.player, i, heard = false;
    if (g.phase !== 'exam') return;
    for (i = 0; i < 2; i++) {
      var P = g.proctors[i], d = P.dist(s.x, s.z + 0.4), R = 0.9 + 1.7 * level;
      if (d < R && P.ai.state !== 'off') {
        g.blame(3 + 9 * level * (1 - d / R), '진동 소리');
        P.glanceAt(pl.eye[0], pl.eye[1], pl.eye[2], 1.6 + level);
        heard = true;
      }
    }
    for (i = 0; i < g.neighbors.length; i++) g.neighbors[i].curious += N.CURIOUS_NOISE * level * g.neighbors[i].npc.awareness();
    if (heard) {
      g.stat.heard++;
      g.spike = Math.max(g.spike, 0.7);
      if (!g.lensFlags.buzz) { g.lensFlags.buzz = true; UI.toast('진동 소리가 감독관 귀에 들어갔다 · 가까이 있을 때는 켜지 말 것', 'warn', 4); }
    }
  };

  /* 감독관이 렌즈 불빛을 눈치채고 멈춰 선다 */
  G.startTake = function (P) {
    var g = this, pl = g.player;
    P.glintAcc = 0;
    P.take = { t: N.TAKE_TIME, grace: N.TAKE_GRACE, seen: 0 };
    P.doubleTake(pl.eye[0], pl.eye[1], pl.eye[2], N.TAKE_TIME);
    g.stat.takes++;
    g.spike = Math.max(g.spike, 0.9);
    g.floor = Math.min(60, g.floor + 5);
    g.blame(4, GLINT);
    UI.say('think', P.z > pl.eye[2] + 0.3 ? '(뒤에서 발소리가 뚝 멈췄다.)' : '(감독관이 걸음을 멈추고 내 안경 쪽을 본다.)', 2.4);
    if (!g.lensFlags.take) { g.lensFlags.take = true; UI.toast('렌즈에 비친 불빛이 눈에 띄었다 · 지금 바로 끄면 넘어갈 수 있다', 'warn', 4); }
  };

  G.endTake = function (P) {
    var g = this, pl = g.player, sure = P.take.seen > 0.35;
    P.take = null; P.glintAcc = 0;
    if (sure) {
      g.blame(20, GLINT);
      g.floor = Math.min(60, g.floor + 8);
      P.ai.watchCool = 0; P.ai.pause = 0;         /* 확신했으니 쉬는 시간과 상관없이 바로 다가온다 */
      if (!g.anyWatching() && !g.inspecting && P.canWatch()) {
        P.watchPlayer();
        g.stat.watches++;
        P.other.ai.watchCool = Math.max(P.other.ai.watchCool, 14);
        UI.say('think', P.z > pl.eye[2] ? '(발소리가 이쪽으로 다가온다. 봤다.)' : '(감독관이 이쪽으로 걸어온다. 봤다.)', 2.6);
      }
    } else {
      g.blame(3, GLINT);
      UI.say('think', '(…감독관이 고개를 갸웃하더니 눈길을 거둔다.)', 2.4);
    }
  };

  /* 옆 사람이 내 렌즈를 봤다 */
  G.onSaw = function (n) {
    var g = this, pl = g.player, i, best = null, bd = 99;
    n.saw++; g.sawCount++; g.stat.saws++;
    g.heatExtra = Math.min(0.5, g.heatExtra + 0.2);
    g.spike = Math.max(g.spike, 0.85);
    /* 수험생이 한곳을 빤히 보면 감독관의 눈도 그리로 간다 */
    for (i = 0; i < 2; i++) { var P = g.proctors[i], d = P.dist(g.seat.x, g.seat.z); if (P.free() && d < bd) { bd = d; best = P; } }
    if (best) best.glanceAt(pl.eye[0], pl.eye[1], pl.eye[2], 2.6);
    if (g.sawCount >= 2 && !g.reporter && g.left > 20) {
      g.reporter = n; g.reportT = 1.3;
      UI.say('think', '(옆자리 수험생이 내 렌즈를 똑똑히 봤다. 펜을 내려놓는다.)', 3);
    } else {
      UI.say('think', '(옆자리 수험생의 눈이 내 렌즈에 박힌다. 봤다.)', 2.8);
      if (!g.lensFlags.saw) { g.lensFlags.saw = true; UI.toast('옆 사람이 렌즈를 봤다 · 한 번 더 보이면 손을 들 것이다', 'warn', 4.5); }
    }
  };

  /* 옆자리 시선 */
  G.neighborsUpdate = function (dt, lum, touching) {
    var g = this, pl = g.player, i, L = false, R = false;
    for (i = 0; i < g.neighbors.length; i++) {
      var n = g.neighbors[i], npc = n.npc, aw = npc.awareness();
      if (n.cool > 0) n.cool -= dt;
      n.curious += dt * lum * N.CURIOUS_LUM * aw;
      if (touching) n.curious += dt * N.CURIOUS_TOUCH * aw;
      n.curious = Math.max(0, n.curious - dt * N.CURIOUS_FADE);
      if (npc.act === 'peek') {
        if (npc.isPeeking()) {
          if (n.side < 0) L = true; else R = true;
          if (lum > 0.1) n.witness += dt;
          if (n.witness >= N.WITNESS && !n.sawNow) { n.sawNow = true; g.onSaw(n); }
          /* 내가 마주 보면 머쓱해서 눈을 피한다 */
          var hx = npc.cx - pl.eye[0], hy = 1.12 - pl.eye[1], hz = npc.cz - 0.12 - pl.eye[2], hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
          if ((hx * pl.fwd[0] + hy * pl.fwd[1] + hz * pl.fwd[2]) / hl > 0.9) {
            n.stare += dt;
            if (n.stare >= N.STARE_BACK && !n.sawNow) {
              npc.at = npc.dur;                       /* 쳐다보기를 끝낸다 */
              n.curious = Math.max(0, n.curious - 0.4);
              if (!g.lensFlags.stare) { g.lensFlags.stare = true; UI.say('think', '(눈이 마주치자 옆 사람이 얼른 고개를 돌린다.)', 2.6); }
            }
          } else n.stare = 0;
        }
      } else if (n.peeking) {
        /* 쳐다보기가 끝났다: 본 것이 있으면 금방 또 보고, 없으면 한동안 시들하다 */
        n.peeking = false;
        n.curious = n.sawNow ? 0.6 : 0.2;
        n.cool = n.sawNow ? 5 + g.rnd() * 3 : 9 + g.rnd() * 6;
        n.witness = 0; n.sawNow = false; n.stare = 0;
      } else if (n.curious >= 1 && n.cool <= 0 && npc.mode === 'write' && npc.act !== 'cough' && npc.act !== 'report' && !g.inspecting) {
        npc.peek(pl.eye[0], pl.eye[1], pl.eye[2], 2.3 + g.rnd() * 1.2);
        n.peeking = true; n.witness = 0; n.sawNow = false; n.stare = 0;
        g.stat.peeks++;
        g.spike = Math.max(g.spike, 0.6);
        Au.npc('creak', npc.cx, 0.4, npc.cz, npc.voice);
        if (!g.lensFlags.peek) { g.lensFlags.peek = true; UI.toast('옆자리에서 쳐다본다 · 렌즈가 꺼져 있으면 볼 것이 없다', 'warn', 4.5); }
      }
    }
    g.peekL = L; g.peekR = R;
    /* 손을 든 옆 사람: 감독관이 확인하러 온다 */
    if (g.reporter) {
      g.reportT -= dt;
      if (g.reportT <= 0) {
        var who = g.catcher(), rn = g.reporter.npc;
        g.reporter = null; g.sawCount = 0;
        rn.report(who.x, 1.6, who.z, 3.4);
        Au.npc('creak', rn.cx, 0.4, rn.cz, rn.voice);
        UI.say('think', '(옆자리에서 손이 올라간다.)', 2.4);
        if (!g.inspecting && !g.flags.inspected && g.left > 18) g.startInspect(g.inspector(), 'report');
        else g.blame(26, '옆자리 제보');
      }
    }
  };

  /* 시험 중 프레임마다: 눈에 띄는 것들을 의심으로 바꾼다. 돌려주는 값: 감독관의 시선(0..1) */
  G.notice = function (dt) {
    var g = this, dev = g.dev, ex = g.exam, seat = g.seat, pl = g.player, i;
    var lum = g.glasses === 'ai' ? dev.lum : 0, touching = ex.touching();
    var A = 0, best = 0;
    for (i = 0; i < 2; i++) {
      var P = g.proctors[i], a = P.attention(seat.x, seat.z + 0.4);
      if (a > A) A = a;
      if (g.inspecting) continue;
      var v = lum * a * g.lensGeo(P);
      if (v > best) best = v;
      /* 불빛이 눈에 쌓이는 것은 순찰하는 동안뿐이다. 이미 옆에서 지켜보는 감독관은 '다시 볼' 것이 없으니 쌓아 두지 않는다
         (쌓아 두면 렌즈를 끈 뒤에야 뒤늦게 멈춰 서게 된다) */
      if (!P.free()) P.glintAcc = 0;
      else if (v > N.GLINT_MIN) P.glintAcc = Math.min(N.GLINT_TAKE, P.glintAcc + (v - N.GLINT_MIN * 0.6) * dt);
      else P.glintAcc = Math.max(0, P.glintAcc - dt * 0.2);
      if (P.take) {
        P.take.t -= dt;
        if (P.take.grace > 0) P.take.grace -= dt;
        else if (lum > 0.1) P.take.seen += dt;
        P.lookAtPoint(pl.eye[0], pl.eye[1], pl.eye[2]);
        if (P.take.t <= 0) g.endTake(P);
      } else if (P.glintAcc >= N.GLINT_TAKE && v > N.GLINT_MIN && P.free()) g.startTake(P);    /* 지금 불빛이 보이고 있을 때만 */
    }
    g.A = A; g.glint = best;
    if (g.inspecting) { g.peekL = g.peekR = false; return A; }
    if (best > 0.004) g.blame(dt * N.GLINT_RATE * best, GLINT);
    if (touching && A > 0.05) g.blame(dt * N.TOUCH_RATE * A, '안경 만짐');
    /* 자꾸 만지면 그것만으로도 눈에 띈다 */
    if (g.fidgetCool > 0) g.fidgetCool -= dt;
    while (g.touchLog.length && g.t - g.touchLog[0] > N.FIDGET_T) g.touchLog.shift();
    if (g.touchLog.length >= N.FIDGET_N && g.fidgetCool <= 0 && A > 0.2) {
      g.fidgetCool = 12;
      g.blame(7, '안경을 자꾸 만짐');
      if (!g.lensFlags.fidget) { g.lensFlags.fidget = true; UI.toast('안경을 자꾸 만지면 그것만으로도 눈에 띈다', 'warn', 3.6); }
    }
    g.neighborsUpdate(dt, lum, touching);
    return A;
  };

  /* ───────── 긴장 ───────── */
  G.feel = function (dt) {
    var g = this, pl = g.player, i;
    var seated = pl.mode === 'seat' && g.phase !== 'result' && g.phase !== 'title' && g.phase !== 'epilogue';
    var rdt = g.ffwd ? dt / 8 : dt, target = 0;
    if (seated) {
      var lit = g.lensOn() && g.dev.lum > 0.1, near = g.nearestProctor(), exam = g.phase === 'exam';
      target = Math.max(g.spike, g.heart, GX.smoothstep(45, 95, g.sus) * 0.8);
      if (exam) {
        target = Math.max(target,
          lit ? GX.smoothstep(4.5, 1.2, near) * 0.75 : GX.smoothstep(2.2, 0.9, near) * 0.3,
          g.A * (lit ? 0.95 : 0.3),
          (g.peekL || g.peekR) ? (lit ? 0.85 : 0.5) : 0,
          g.inspecting ? 0.95 : 0);
      }
    }
    g.spike = Math.max(0, g.spike - rdt * 0.22);
    g.tension = GX.damp(g.tension, target, target > g.tension ? 3.5 : 0.45, rdt);
    var T = g.tension, period = GX.lerp(1.02, 0.43, T);
    g.bpm = Math.round(60 / period);
    g.beatEnv = Math.max(0, g.beatEnv - rdt * 5);
    /* 심장 소리는 긴장이 어느 정도 올랐을 때만 들린다(시험 내내 깔리면 무뎌진다) */
    if (T > 0.16 && seated) {
      g.beatT -= rdt;
      if (g.beatT <= 0) {
        g.beatT = period;
        g.beatEnv = 1;
        Au.thump(0.22 + 0.78 * T, T);
        UI.beat();
      }
      if (T > 0.7) {
        g.breathT -= rdt;
        if (g.breathT <= 0) { g.breathT = 3.2 + Math.random() * 1.6; Au.breath((T - 0.7) / 0.3); }
      }
    } else g.beatT = 0;
    g.exam.tremor = seated ? GX.smoothstep(0.45, 0.95, T) : 0;
    /* 꼬리표는 잠깐 떴다 사라진다 */
    for (i = g.causes.length - 1; i >= 0; i--) { g.causes[i].t -= rdt; if (g.causes[i].t <= 0) g.causes.splice(i, 1); }
  };
})(window.GX = window.GX || {});
