/* 엔딩 — 한 판이 어떻게 끝났는지 가르고(judge), 시험 뒤의 이야기를 보여 주고(에필로그), 본 엔딩을 모아 둔다.
 *
 * 엔딩은 열 가지다. 무엇이 갈림길인지:
 *   안경을 냈는가(정직) / 탐지기에 빼앗겼는가 / 끝까지 썼는가 / 시험 중에 들켰는가
 *   합격선(과목별 40점 이상 · 평균 60점 이상)을 넘었는가
 *   AI 안경으로 합격했다면: 시험장에 남긴 '흔적'이 EXPOSE_AT 점 이상인가 → 나중에 들킨다
 *   AI 안경을 쓰고 떨어졌다면: 렌즈의 틀린 답을 따라 적은 문항만 맞았어도 합격이었는가 → 렌즈 탓에 떨어진 것
 * 흔적은 시험 중에 남의 눈·귀에 걸린 일들(notice.js 가 센다)과, 렌즈의 틀린 답을 그대로 적은 답안지다.
 * (같은 날 압수된 다른 AI 안경이 내놓는 답과 오답까지 겹치는 답안지는, 그것만으로 조사 대상이 된다)
 * 진행(flow.js)의 Game 에 덧붙인다.
 */
(function (GX) {
  'use strict';
  var UI = GX.UI, Au = GX.Audio, Input = GX.Input, G = GX.Game.prototype;

  var EXPOSE_AT = 4;           /* 흔적이 이만큼 쌓인 합격은 나중에 들킨다 */
  var KEY = 'lens-exam-endings';

  /* 엔딩 목록(번호는 이 순서대로 1~10). hint: 아직 못 본 엔딩 칸에 보여 주는 실마리 */
  var LIST = [
    { id: 'honest_pass', title: '내 힘으로 합격', hint: '안경을 내고, 내 머리로 합격선을 넘는다' },
    { id: 'honest_fail', title: '떳떳한 불합격', hint: '안경을 내고 풀었지만 합격선에 닿지 못한다' },
    { id: 'expelled', title: '시험 중 적발 · 퇴실', hint: '시험 중에 AI 안경을 쓰다가 들킨다' },
    { id: 'exposed', title: '합격, 그리고 취소', hint: 'AI 안경으로 합격하지만, 시험장에 흔적을 남긴다' },
    { id: 'fooled', title: '렌즈를 믿은 불합격', hint: '렌즈가 내민 틀린 답을 따라 적다가 떨어진다' },
    { id: 'wasted', title: '반칙하고도 불합격', hint: 'AI 안경을 쓰고도 합격선에 닿지 못한다' },
    { id: 'hollow', title: '들키지 않은 합격', hint: 'AI 안경으로 합격하고, 흔적을 거의 남기지 않는다' },
    { id: 'seized', title: '시작도 전에 압수', hint: '렌즈를 켠 채로 탐지기 검사를 받는다' },
    { id: 'unused', title: '켜지 않은 안경', hint: '안경을 내지 않되, 렌즈에 답을 한 번도 띄우지 않는다' },
    { id: 'peeker', title: '안경도 없이 퇴실', hint: '안경 없이 시험을 보다가 자꾸 옆을 본다' }
  ];
  var byId = {};
  LIST.forEach(function (e, i) { e.no = i + 1; byId[e.id] = e; });

  /* ───────── 본 엔딩 모음(브라우저에 저장. 저장소를 못 쓰면 이 창을 닫을 때까지만 기억한다) ───────── */
  var seen = {};
  function load() {
    try {
      var a = JSON.parse(window.localStorage.getItem(KEY) || '[]');
      if (Array.isArray(a)) a.forEach(function (id) { if (byId[id]) seen[id] = true; });
    } catch (e) { /* 저장소를 못 쓰는 환경 */ }
  }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(Object.keys(seen))); } catch (e) { /* 무시 */ }
  }
  var E = {
    LIST: LIST, EXPOSE_AT: EXPOSE_AT,
    /* 처음 본 엔딩이면 true */
    unlock: function (id) { if (!byId[id] || seen[id]) return false; seen[id] = true; save(); return true; },
    collection: function () { return LIST.map(function (e) { return { id: e.id, no: e.no, title: e.title, hint: e.hint, found: !!seen[e.id] }; }); },
    count: function () { return Object.keys(seen).length; },
    reset: function () { seen = {}; save(); }
  };
  load();
  GX.Endings = E;

  function times(n) { return n > 1 ? ' (' + n + '번)' : ''; }

  /* ───────── 판정 ─────────
   * 돌려주는 값: { id, no, title, stamp, stampClass, story, glassesNote, kept, score,
   *               evidence:[{ pts, text }], evidencePts, exposeAt, lead, beats:[에필로그 장면] } */
  G.judge = function () {
    var g = this, sc = g.exam.score(), st = g.stat, no = g.seat.no, why = g.caughtWhy;
    var kept = !g.submitted && !g.confiscated;         /* 안경을 끝까지 얼굴에 얹고 있었는가 */

    /* 시험장에 남긴 흔적. 누구 눈에 남았는가: p 감독관 · w 옆자리 수험생 · a 답안지.
       점수: 스친 일은 1점, 기록에 남는 일(탐지기 경보·안경 검사)과 목격자는 2점, 렌즈의 오답을 그대로 적은 문항은 하나에 2점.
       그러니 렌즈의 오답 둘을 따라 적었으면 그것만으로 들키고, 하나였다면 남의 눈에 두 번은 걸려야 들킨다 */
    var ev = [], pts = 0, by = { p: 0, w: 0, a: 0 };
    function add(kind, p, text) { if (p > 0) { ev.push({ pts: p, text: text }); pts += p; by[kind] += p; } }
    if (kept) {
      add('p', g.flags.seenLit ? 1 : 0, '신분 확인 때 렌즈에 글자가 떠 있었다');
      add('p', g.marked ? 2 : 0, '탐지기가 울렸다 · 감독관이 내 얼굴을 기억했다');
      add('p', Math.min(2, st.takes), '렌즈에 비친 불빛에 감독관이 걸음을 멈췄다' + times(st.takes));
      add('p', st.heard ? 1 : 0, '안경의 진동 소리가 감독관 귀에 들어갔다');
      add('p', st.watches ? 1 : 0, '감독관이 옆에 와서 지켜봤다');
      add('p', st.inspections ? 2 : 0, '시험 중에 안경 검사를 받았다');
      add('w', Math.min(4, st.saws * 2), '옆자리 수험생이 켜진 렌즈를 봤다' + times(st.saws));
      add('a', Math.min(6, sc.aiFooled * 2), 'AI가 틀린 답 ' + sc.aiFooled + '개를 똑같이 적었다');
    }
    /* 조사가 어디서 시작되는가: 목격자 > 감독관 > 답안지(같은 점수면 앞쪽) */
    var lead = by.w > 0 && by.w >= by.p && by.w >= by.a ? 'w' : (by.p > 0 && by.p >= by.a ? 'p' : (by.a > 0 ? 'a' : ''));

    var id;
    if (g.caught) id = why === 'look' ? 'peeker' : 'expelled';
    else if (g.submitted) id = sc.pass ? 'honest_pass' : 'honest_fail';
    else if (g.confiscated) id = 'seized';
    else if (sc.aiUsed === 0) id = 'unused';
    else if (sc.pass) id = pts >= EXPOSE_AT ? 'exposed' : 'hollow';
    else id = sc.aiFooled > 0 && sc.fixPass ? 'fooled' : 'wasted';

    var end = {
      id: id, no: byId[id].no, title: byId[id].title, kept: kept, score: sc,
      evidence: ev, evidencePts: pts, exposeAt: EXPOSE_AT, lead: lead,
      glassesNote: g.confiscated ? '탐지기 검사에서 압수' : (g.submitted ? '안경을 제출함' : '안경을 낀 채 응시'),
      stamp: '', stampClass: '', story: '', beats: []
    };
    var avg = sc.avg + '점';
    var lookup = { kind: 'lookup', when: '한 달 뒤 · 합격자 발표일', no: no, tax: sc.tax, acc: sc.acc, avg: sc.avg, pass: sc.pass };
    function text(when, lines) { return { kind: 'text', when: when, lines: lines }; }
    /* 내 힘만으로는 어땠을까(렌즈를 따라 적어 맞힌 문항을 빼고) */
    var solo = sc.aiFollowed === 0 ? '렌즈에 답을 띄우고도 한 문항도 따라 적지 않았다. 쓰지 않아도 붙었을 시험이었다.'
      : (sc.soloPass ? '렌즈를 따라 적은 문항을 빼도 평균 ' + sc.soloAvg + '점 — 쓰지 않아도 붙었을 시험이었다.'
        : '렌즈를 따라 적은 문항을 빼면 평균 ' + sc.soloAvg + '점 — 내 힘만으로는 닿지 못했을 합격선이다.');

    switch (id) {
      case 'honest_pass':
        end.stamp = '합격'; end.stampClass = '';
        end.story = '안경은 수거함에 내고, 내 머리로만 풀었다. 평균 ' + avg + '으로 합격선을 넘었다. 이 점수는 한 점도 빠짐없이 내 것이다.';
        end.beats = [lookup, text('', ['합격.', '렌즈도, 남의 답안지도 없이 넘은 합격선이다.', '돌려받은 안경은 서랍에 넣었다. 2차 시험 공부를 시작한다.'])];
        break;
      case 'honest_fail':
        end.stamp = '불합격'; end.stampClass = 'gray';
        end.story = '안경은 수거함에 내고, 내 머리로만 풀었다. 평균 ' + avg + ', 합격선에는 닿지 못했다. 그래도 이 점수는 온전히 내 것이고, 아래의 해설은 다음 시험의 밑천이다.';
        end.beats = [lookup, text('', ['불합격.', '아쉽지만 부끄럽지는 않다. 모자란 점수까지 전부 내 것이다.', '틀린 문제의 해설에 밑줄을 긋는다. 시험은 내년에도 있다.'])];
        break;
      case 'expelled':
        end.stamp = '시험 무효'; end.stampClass = 'bad';
        end.story = (why === 'lit' ? '검사하러 온 감독관에게 안경을 넘겨주는 순간에도 렌즈는 켜져 있었다. '
          : (why === 'warm' ? '렌즈는 꺼 두었지만, 방금까지 일하던 안경다리는 식지 않았다. ' : '쌓이고 쌓인 의심 끝에, 감독관이 곧장 걸어와 안경을 벗겨 갔다. ')) +
          '답안지는 회수되었고 이 시험은 무효가 되었다. 렌즈에 떴던 답은 한 문제도 내 점수가 되지 못했다.';
        end.beats = [
          text('시험장 복도', ['가방을 챙겨 감독관을 따라 복도로 나왔다.', '등 뒤에서 교실 문이 닫힌다. 남은 사람들의 펜 소리가 문틈으로 새어 나온다.']),
          { kind: 'letter', when: '2주 뒤', title: '부정행위자 처리 결과 통지', no: no, seal: '시험 무효',
            body: ['위 수험생은 2030년도 세무사 제1차 시험 시행 중 화면이 나오는 안경형 전자기기를 사용한 사실이 확인되었습니다.', '이에 당해 시험을 무효로 처리하였음을 알려 드립니다.'] }
        ];
        break;
      case 'peeker':
        end.stamp = '시험 무효'; end.stampClass = 'bad';
        end.story = '안경은 없었지만 고개가 자꾸 옆으로 돌아갔다. 답안지는 회수되었고 이 시험은 무효가 되었다. ' +
          (g.confiscated ? '안경을 빼앗기고도, 남의 답을 넘겨다보는 버릇은 남아 있었다.' : '안경까지 내놓고서, 정작 고개를 간수하지 못했다.');
        end.beats = [
          text('시험장 복도', ['안경도 없이, 고개만 돌리다가 복도로 나왔다.', '넘겨다본 답안지에 내 답은 없었다.']),
          { kind: 'letter', when: '2주 뒤', title: '부정행위자 처리 결과 통지', no: no, seal: '시험 무효',
            body: ['위 수험생은 2030년도 세무사 제1차 시험 시행 중 다른 수험생의 답안지를 여러 차례 넘겨다본 사실이 확인되었습니다.', '이에 당해 시험을 무효로 처리하였음을 알려 드립니다.'] }
        ];
        break;
      case 'exposed':
        end.stamp = '합격 취소'; end.stampClass = 'bad';
        var how = lead === 'w' ? '옆자리 수험생의 제보에서 조사가 시작되었다.'
          : (lead === 'p' ? '감독관이 써낸 특이사항 보고서에서 조사가 시작되었다.' : '압수된 다른 AI 안경의 답과 내 답안지의 오답이 똑같이 겹쳤다.');
        end.story = '렌즈에 답을 ' + sc.aiUsed + '번 띄워 평균 ' + avg + '으로 합격선을 넘었다. ' + solo + ' 그러나 시험장에 남긴 흔적이 뒤늦게 나를 따라왔다. ' + how + ' 합격 결정은 취소되었다.';
        var after = [];
        if (lead === 'w') {
          after.push('시험이 끝난 날 저녁, 옆자리에 앉았던 수험생이 시행본부에 제보를 넣었다.', '“옆 사람 안경에 글자가 떠 있었어요.”');
        } else if (lead === 'p') {
          after.push('감독관은 시험이 끝난 뒤 ‘특이사항 보고서’에 내 수험번호를 적어 냈다.',
            g.marked ? '탐지기가 울렸던 자리.' : (st.inspections ? '시험 중에 안경을 확인했던 자리.' : (st.takes ? '안경에 불빛이 비쳤던 자리.' : '자꾸 눈길이 가던 자리.')));
        } else {
          after.push('같은 날 다른 고사장에서, 내 것과 똑같은 AI 안경이 압수되었다.', '시행본부는 그 안경에 문제지를 읽혀, 안경이 내놓는 답을 — 틀린 답까지 — 모든 답안지와 대조했다.');
        }
        if (by.a > 0) after.push(lead === 'a' ? '내 답안지의 오답 ' + sc.aiFooled + '개가 그대로 겹쳤다.' : '조사가 시작되자 답안지도 다시 읽혔다. 내 오답 ' + sc.aiFooled + '개는 그 안경이 틀리는 방식 그대로였다.');
        end.beats = [
          lookup,
          text('', ['합격.', (sc.soloPass ? '렌즈를 켜 둔 채로 넘은 합격선이지만' : '렌즈가 풀어 준 문제로 넘은 합격선이지만') + ', 화면에 뜬 번호는 내 번호였다.']),
          text('그로부터 3주 뒤', after),
          { kind: 'letter', when: '등기 우편', title: '부정행위 조사 결과 통지', no: no, seal: '합격 취소',
            body: ['위 수험생은 2030년도 세무사 제1차 시험에서 화면이 나오는 안경형 전자기기를 사용한 사실이 조사로 확인되었습니다.', '이에 당해 시험의 합격 결정을 취소하였음을 알려 드립니다.'] }
        ];
        break;
      case 'hollow':
        end.stamp = '합격 · 미적발'; end.stampClass = 'gray';
        /* 남의 눈에 걸린 일이 있었는데도(4점에는 못 미쳐) 넘어간 판이라면 '아무도 모른다'고 하지 않는다 */
        var noticed = by.p + by.w > 0;
        end.story = '렌즈에 답을 ' + sc.aiUsed + '번 띄워 평균 ' + avg + '으로 합격선을 넘었다. ' +
          (noticed ? '눈치챈 사람이 없지는 않았지만, 조사가 시작될 만큼은 아니었다. ' : '감독관도, 옆자리도, 시행본부도 알아채지 못했다. ') + solo +
          ' 합격자 명단의 번호는 내 번호지만, 그 점수가 누구의 것인지는 나만 안다.';
        end.beats = [
          lookup,
          text('', ['합격.', noticed ? '수상하게 본 사람은 있었다. 그러나 아무도 끝까지 캐묻지 않았다.' : '아무도 모른다. 감독관도, 옆자리도, 시행본부도.', '나만 안다. 이 점수 가운데 내 것이 몇 점인지.']),
          /* 내 힘으로도 붙었을 사람과, 렌즈 없이는 못 붙었을 사람의 석 달 뒤는 다르다 */
          text('석 달 뒤 · 제2차 시험장', ['2차 시험은 서술형이다. 입구에는 전자기기 탐지 게이트가 새로 섰다.',
            sc.soloPass ? '안경 없이도 문제는 읽혔다. 그런데 1차 때는 왜 그것을 얹고 있었는지, 답할 말이 없다.' : '안경을 가방에 넣고 받아 든 문제지는, 첫 줄부터 낯설었다.'])
        ];
        break;
      case 'fooled':
        end.stamp = '불합격'; end.stampClass = 'bad';
        end.story = '렌즈가 내민 틀린 답 ' + sc.aiFooled + '개를 그대로 받아 적었다.' +
          (sc.aiFooledSure ? ' 그 가운데 ' + sc.aiFooledSure + '개는 신뢰도 90% 이상으로 자신 있게 내민 답이었다.' : '') +
          ' 그 ' + sc.aiFooled + '문항만 맞았어도 평균 ' + sc.fixAvg + '점으로 합격이었다. 실제 점수는 평균 ' + avg + '. 규정을 어기고 얻은 것은, 남이 대신 틀려 준 답이었다.';
        end.beats = [lookup, text('', ['불합격.', '렌즈는 틀린 답을 내밀 때도 망설이지 않았다.', '그 ' + sc.aiFooled + '문항만 아니었으면 합격이었다. 따질 곳은 없다.'])];
        break;
      case 'wasted':
        end.stamp = '불합격'; end.stampClass = 'bad';
        end.story = '전자기기를 숨겨 들어와 렌즈에 답을 ' + sc.aiUsed + '번 띄웠다. 그러고도 평균 ' + avg + ', 합격선에 닿지 못했다.' +
          (sc.aiFooled ? ' 렌즈가 내민 틀린 답 ' + sc.aiFooled + '개를 따라 적기도 했지만, 그것이 맞았더라도 모자랐을 점수다.'
            : (sc.aiWrong ? ' 렌즈가 내민 틀린 답은 따라 적지 않았지만, 그것만으로는 모자랐다.' : '')) +
          ' 들키지 않은 것이 이번 시험에서 얻은 전부다.';
        end.beats = [lookup, text('', ['불합격.', '규정을 어기고, 눈치를 보고, 마음을 졸이고 — 그러고도 떨어졌다.', '떨어진 답안지는 아무도 다시 들여다보지 않는다. 다행인지는 모르겠다.'])];
        break;
      case 'seized':
        end.stamp = '안경 압수'; end.stampClass = 'gray';
        end.story = '탐지기가 울렸을 때 렌즈는 켜져 있었다. 안경은 수거함으로 갔고, 시험은 내 머리로만 봤다. ' +
          (sc.pass ? '평균 ' + avg + '으로 합격선은 넘었다. 결국 이 점수는 온전히 내 것이 되었다.' : '평균 ' + avg + ', 합격선에는 닿지 못했다.') +
          ' 전자기기를 숨겨 들어오려던 일은 감독관의 기록부에 남았다.';
        end.beats = [lookup, text('', sc.pass
          ? ['합격.', '안경을 빼앗긴 덕분에, 이 점수는 온전히 내 것이 되었다.', '기록부에 남은 한 줄만 아니었다면 더 좋았겠지만.']
          : ['불합격.', '안경은 시작도 전에 빼앗겼고, 내 머리는 준비가 덜 되어 있었다.', '돌려받은 안경은 서랍 깊숙이 넣었다.'])];
        break;
      default:       /* unused */
        end.stamp = '적발되지 않음'; end.stampClass = 'gray';
        end.story = '안경은 얼굴에 얹혀 있었지만, 렌즈에는 끝내 답이 한 번도 뜨지 않았다. ' +
          (sc.pass ? '평균 ' + avg + ' — 내 머리로 합격선을 넘었다.' : '평균 ' + avg + ', 합격선에는 닿지 못했다.') +
          ' 다만 내야 할 전자기기를 내지 않고 시험을 본 것은 사실이다.';
        end.beats = [lookup, text('', sc.pass
          ? ['합격.', '렌즈는 끝내 답을 띄우지 않았다. 이 점수는 내 것이다.', '그래도 다음에는 안경을 수거함에 넣기로 한다. 시험 내내 얼굴이 무거웠다.']
          : ['불합격.', '유혹을 얼굴에 얹은 채, 끝내 쓰지는 않았다.', '쓰지도 않을 것을 숨기느라 졸인 마음만 남았다.'])];
    }
    return end;
  };

  /* ───────── 에필로그 ─────────
   * 검은 화면 위에 장면(조회 화면 · 글 · 통지서)을 차례로 보여 준다. 클릭하거나 Space·Enter 를 누르면 넘어가고,
   * 가만히 두어도 얼마 뒤 스스로 넘어간다(한 판이 늘어지지 않게). */
  function* wait(s) { var t = 0; while (t < s) t += (yield) || 0; }

  /* 넘기는 입력을 한 번 받아 간다 */
  G.epiTake = function () {
    var hit = this.epiClick || Input.hit('Space') || Input.hit('Enter') || Input.hit('NumpadEnter');
    this.epiClick = false;
    return hit;
  };

  G.epilogueScene = function* () {
    var g = this, end = g.ending = g.judge(), i, b, t, hold, n, k;
    g.phase = 'epilogue';
    g.epiClick = false;
    Au.ambience(false); Au.lens(0);
    UI.hud(false); UI.clearSay(); UI.setBlur(0); UI.setFade(1); UI.setCoach(null); UI.setMarker(null);
    Input.releaseLock();            /* 커서를 풀어 준다(이 단계에서는 잠금이 풀려도 일시정지하지 않는다: main.js) */
    yield* wait(0.6);
    for (i = 0; i < end.beats.length; i++) {
      b = end.beats[i];
      UI.epilogue(b, function () { g.epiClick = true; });
      g.epiClick = false;
      if (b.kind === 'lookup') {
        /* 수험번호를 넣고 조회를 누른다 … 결과가 뜬다 */
        Au.ui('select');
        t = 0;
        while (t < 1.5) { t += (yield) || 0; if (t > 0.4 && g.epiTake()) break; }
        UI.epilogueReveal();
        Au.sting(b.pass ? 'good' : 'end');
        hold = 4.2;
      } else if (b.kind === 'letter') {
        Au.paper(undefined, 0, 0, 0.5);
        yield* wait(0.5);
        UI.epilogueReveal();        /* 도장이 찍힌다 */
        Au.sting('caught');
        hold = 8;
      } else {
        n = 0;
        for (k = 0; k < b.lines.length; k++) n += b.lines[k].length;
        hold = GX.clamp(2.2 + n * 0.075, 4, 8.5);
      }
      t = 0;
      while (t < hold) { t += (yield) || 0; if (t > 0.5 && g.epiTake()) break; }
      UI.epilogueOut();
      yield* wait(0.4);
    }
    UI.epilogue(null);
  };
})(window.GX = window.GX || {});
