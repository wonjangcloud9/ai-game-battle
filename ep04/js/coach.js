/* 조작 안내 — 처음 하는 사람에게, 그 조작이 필요해지는 바로 그때 하나씩 알려 준다.
 *   복도:   마우스로 둘러보기 → 걷기 → 안경다리를 톡 쳐서 렌즈 끄기 → 다시 켜기
 *   자리:   고개 숙이기/들기 → (감독관이 오기 전에) 렌즈 끄기
 *   시험:   표지 넘기기 → 답 표기 → 문항 넘기기 → 렌즈로 답 띄우기
 *  · 안내는 화면 위쪽 가운데에 한 번에 하나만 뜨고, 그 조작을 실제로 해 보면 '✓' 와 함께 사라진다.
 *  · 한 번 해 본 조작은 브라우저에 기억해 두고 다음 판부터는 띄우지 않는다(시작 화면의 '조작 안내 다시 보기'로 되돌린다).
 *  · 안내는 아무것도 막지 않는다. 안내보다 먼저 해 버리면 조용히 '배운 것'으로 친다.
 * 진행(flow.js)의 Game 에 덧붙인다.
 */
(function (GX) {
  'use strict';
  var UI = GX.UI, Au = GX.Audio, Input = GX.Input, G = GX.Game.prototype;
  var KEY = 'lens-exam-coach';

  /* 배운 조작(브라우저에 저장. 저장소를 못 쓰면 이 창을 닫을 때까지만 기억한다) */
  var learned = {};
  function load() {
    try {
      var a = JSON.parse(window.localStorage.getItem(KEY) || '[]');
      if (Array.isArray(a)) a.forEach(function (id) { learned[String(id)] = true; });
    } catch (e) { /* 저장소를 못 쓰는 환경 */ }
  }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(Object.keys(learned))); } catch (e) { /* 무시 */ }
  }
  load();

  function answered(g) {
    var a = g.exam.answers, n = 0, i;
    for (i = 0; i < a.length; i++) if (a[i] >= 0) n++;
    return n;
  }
  function lensLive(g) { return g.glasses === 'ai' && (g.dev.power === 'on' || g.dev.power === 'boot'); }

  /* 안내 목록(위에서부터 먼저 띄운다).
   *   phase  이 단계에서만 띄운다      when   그 밖의 조건
   *   html   띄울 글(함수면 그때 만든다)  done   해 본 것으로 치는 조건(c: 이번 판에 지켜본 것들)
   *   max    이만큼(초) 떠 있어도 하지 않으면 이번 판에는 그만둔다
   *   urgent 지금 하지 않으면 손해를 보는 안내: 다른 안내가 떠 있어도 밀어내고 먼저 뜬다 */
  var LESSONS = [
    {
      id: 'look', phase: 'walk',
      html: function () {
        return Input.mode === 'drag' ? '마우스를 <b>누른 채 끌어서</b> 주위를 둘러보세요' : '<b>마우스를 움직여</b> 주위를 둘러보세요';
      },
      done: function (g, c) { return c.look > 0.9; }
    },
    {
      id: 'move', phase: 'walk',
      html: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 로 걸어 보세요 <small><kbd>Shift</kbd> 를 함께 누르면 빨리 걷습니다</small>',
      done: function (g, c) { return c.walked > 1.2; }
    },
    {
      id: 'lensOff', phase: 'walk',
      when: function (g) { return lensLive(g); },
      html: '<kbd>F</kbd> 를 누르면 <b>안경다리를 톡</b> 칩니다 — 렌즈를 꺼 보세요',
      done: function (g, c) { return c.offs > 0; }
    },
    {
      id: 'lensOn', phase: 'walk',
      when: function (g, c) { return c.offs > 0 && g.glasses === 'ai' && !lensLive(g); },
      html: '<kbd>F</kbd> 를 한 번 더 — 렌즈가 다시 켜집니다 <small>켜진 렌즈는 글자를 읽고 내 자리를 알려 줍니다</small>',
      done: function (g, c) { return c.offs > 0 && c.ons > 0; },
      max: 25                    /* 끈 채로 가겠다는 사람을 붙잡고 있지는 않는다 */
    },
    {
      id: 'head', phase: 'seated',
      html: '<kbd>Space</kbd> 를 누르면 <b>고개를 숙이거나 듭니다</b> <small>마우스로는 앉아서도 교실을 둘러볼 수 있습니다</small>',
      done: function (g, c) { return c.space > 0; },
      max: 30
    },
    {
      id: 'preOff', phase: 'seated', urgent: true,
      /* 전자기기를 걷기 시작한 때부터 감독관이 내 자리에 닿기 전까지만(그 뒤로는 손을 쓸 수 없는 때가 많고, 이미 늦었다) */
      when: function (g) { return !!g.flags.collecting && !g.flags.checked && lensLive(g) && !g.noHands; },
      html: '<kbd>F</kbd> 감독관이 오기 전에 <b>렌즈를 끄세요</b> <small>켜진 렌즈는 탐지기에 걸립니다</small>',
      done: function (g, c) { return c.preOff; }
    },
    {
      id: 'cover', phase: 'exam',
      when: function (g) { return g.exam.state === 'cover'; },
      html: '본령이 울렸습니다 — <kbd>D</kbd> 로 <b>표지를 넘기세요</b> <small><kbd>→</kbd> 키나 마우스 휠도 됩니다</small>',
      done: function (g) { return g.phase === 'exam' && g.exam.state === 'open' && !g.flags.autoCover; }
    },
    {
      id: 'mark', phase: 'exam',
      when: function (g) { return g.exam.state === 'open'; },
      html: '문제를 읽고 <kbd>1</kbd>~<kbd>5</kbd> 로 <b>답안지에 답을 표기</b>하세요 <small>답안지 칸을 조준해 클릭해도 됩니다</small>',
      done: function (g) { return g.phase === 'exam' && answered(g) > 0; }
    },
    {
      id: 'next', phase: 'exam',
      when: function (g) { return g.exam.state === 'open' && answered(g) > 0; },
      html: '<kbd>D</kbd> <b>다음 문항</b> · <kbd>A</kbd> 이전 문항 <small><kbd>←</kbd><kbd>→</kbd> 키나 마우스 휠도 됩니다</small>',
      done: function (g) { var ex = g.exam; return g.phase === 'exam' && ex.state === 'open' && (ex.cur > 0 || (ex.flipTo !== null && ex.flipTo > 0)); }
    },
    {
      id: 'lens', phase: 'exam',
      when: function (g, c) {
        var d = g.dev;
        return g.exam.state === 'open' && g.glasses === 'ai' && g.uses === 0 && d.power === 'off' && !d.locked && !d.dead && c.examT > 9;
      },
      html: '<kbd>F</kbd> 렌즈를 켜고 <b>문제지를 보고 있으면</b> AI가 답을 띄웁니다 <small>쓸지 말지는 내 몫 · 눈길이 오면 다시 <kbd>F</kbd></small>',
      done: function (g, c) { return c.onsExam > 0; },
      max: 12
    }
  ];

  GX.Coach = {
    LESSONS: LESSONS,
    /* 배운 조작의 수 */
    count: function () { return Object.keys(learned).length; },
    has: function (id) { return !!learned[id]; },
    /* 처음부터 다시 알려 준다 */
    reset: function () { learned = {}; save(); }
  };

  function fits(L, g, c) { return g.phase === L.phase && (!L.when || L.when(g, c)); }
  function htmlOf(L) { return typeof L.html === 'function' ? L.html() : L.html; }

  G.coachReset = function () {
    this.coach = {
      cur: null, t: 0, flash: 0, gap: 1.0, gave: {}, seen: {},      /* seen: 안내마다 이번 판에 떠 있던 시간(초) */
      look: 0, walked: 0, px: null, pz: 0, space: 0, offs: 0, ons: 0, onsExam: 0, preOff: false, examT: 0
    };
    UI.setCoach(null);
  };

  /* 내 손끝이 안경다리에 닿아 렌즈가 켜지거나 꺼졌다(notice.js 의 lensHit 가 알려 준다). r: 'on' | 'off' | 그 밖(반응 없음).
     안경을 내서 꺼졌거나, 빼앗겼거나, 스스로 꺼진 것은 '내가 해 본 것'이 아니므로 여기로 오지 않는다 */
  G.coachTap = function (r) {
    var g = this, c = g.coach;
    if (r === 'off') {
      c.offs++;
      if (g.phase === 'seated' && g.flags.collecting && !g.flags.checked) c.preOff = true;
    } else if (r === 'on') {
      c.ons++;
      if (g.phase === 'exam') c.onsExam++;
    }
  };

  G.coachTick = function (dt) {
    var g = this, c = g.coach, pl = g.player, ph = g.phase, i, L;
    var live = ph === 'walk' || ph === 'seated' || ph === 'exam';
    /* ── 플레이어가 한 일을 지켜본다 ── */
    if (live) {
      c.look += (Math.abs(Input.mx) + Math.abs(Input.my)) * 0.0022 * Input.sens;
      if (ph !== 'walk' && Input.hit('Space')) c.space++;
    }
    if (ph === 'walk') {
      if (c.px !== null) c.walked += Math.sqrt((pl.x - c.px) * (pl.x - c.px) + (pl.z - c.pz) * (pl.z - c.pz));
      c.px = pl.x; c.pz = pl.z;
    } else c.px = null;
    if (ph === 'exam') c.examT += dt;

    /* ── 해냈다는 표시가 떠 있는 동안 ── */
    if (c.flash > 0) {
      c.flash -= dt;
      if (c.flash <= 0 || !live) { c.flash = 0; UI.setCoach(null); c.gap = 0.45; }
      return;
    }
    /* 빨리 감는 중·검사받는 중·선택지가 떠 있는 동안에는 띄우지 않는다 */
    var blocked = !live || g.ffwd || g.inspecting || g.choosing;
    /* ── 지금 떠 있는 안내 ── */
    if (c.cur) {
      L = c.cur; c.t += dt;
      if (L.done(g, c)) {
        learned[L.id] = true; save();
        c.cur = null; c.flash = 1.1;
        UI.setCoach(htmlOf(L), 'done');
        Au.ui('select');
      } else if (blocked || !fits(L, g, c)) {
        /* 때가 지나갔다: 다시 맞는 때가 오면 또 띄운다. 떠 있던 시간은 이어서 센다(끊길 때마다 처음부터 세면 판 내내 다시 뜬다) */
        c.seen[L.id] = c.t;
        c.cur = null; c.gap = 0.3; UI.setCoach(null);
      } else if (L.max && c.t > L.max) {
        c.gave[L.id] = true; c.cur = null; c.gap = 0.6; UI.setCoach(null);
      } else {
        /* 급한 안내가 생겼으면 자리를 내준다(밀려난 안내는 나중에 다시 뜬다) */
        if (!L.urgent) {
          for (i = 0; i < LESSONS.length; i++) {
            var U = LESSONS[i];
            if (U.urgent && !learned[U.id] && !c.gave[U.id] && !U.done(g, c) && fits(U, g, c)) { c.seen[L.id] = c.t; c.cur = L = U; c.t = c.seen[U.id] || 0; break; }
          }
        }
        UI.setCoach(htmlOf(L), 'show');
      }
      return;
    }
    if (blocked) return;
    if (c.gap > 0) { c.gap -= dt; return; }
    /* ── 다음에 띄울 안내를 고른다 ── */
    for (i = 0; i < LESSONS.length; i++) {
      L = LESSONS[i];
      if (learned[L.id] || c.gave[L.id]) continue;
      if (L.done(g, c)) { learned[L.id] = true; save(); continue; }      /* 안내보다 먼저 해 버렸다 */
      if (!fits(L, g, c)) continue;
      c.cur = L; c.t = c.seen[L.id] || 0;
      UI.setCoach(htmlOf(L), 'show');
      return;
    }
  };
})(window.GX = window.GX || {});
