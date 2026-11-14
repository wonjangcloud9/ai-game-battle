/* 화면 위 UI — 목표·자막·의심도·렌즈 표시와 시작/일시정지/결과 화면(전부 DOM 으로 만든다) */
(function (GX) {
  'use strict';
  var UI = {}, el = {}, timers = { sub: 0, toast: 0, banner: 0, beat: 0, nudge: 0 };
  var SVGNS = 'http://www.w3.org/2000/svg';

  function h(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function s(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]); }
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function show(e, on) { e.classList.toggle('on', !!on); }

  UI.init = function () {
    var root = el.root = document.getElementById('ui');
    var hud = el.hud = h('div', 'hud', root);

    el.glass = h('div', 'glass', hud);
    var gs = s('svg', { viewBox: '0 0 1600 900', preserveAspectRatio: 'none' }, el.glass);
    s('path', {
      'fill-rule': 'evenodd',
      d: 'M-60,-60 H1660 V960 H-60 Z M84,30 Q800,-2 1516,30 Q1582,36 1590,112 Q1610,450 1590,788 Q1582,864 1516,870 Q800,902 84,870 Q18,864 10,788 Q-10,450 10,112 Q18,36 84,30 Z'
    }, gs);
    h('div', 'tint', el.glass);
    el.glint = h('div', 'glint', el.glass);          /* 렌즈 불빛이 남의 눈에 걸릴 때 가장자리에 어리는 빛 */
    el.vignette = h('div', 'vignette', hud);
    el.cross = h('div', 'cross', hud);

    /* 옆자리에서 쳐다볼 때 시야 가장자리에 뜨는 표시 */
    function peek(cls) {
      var p = h('div', 'peek ' + cls, hud);
      var e = s('svg', { viewBox: '0 0 30 20' }, p);
      s('path', { d: 'M2,10 Q15,-1 28,10 Q15,21 2,10 Z' }, e);
      s('circle', { cx: cls === 'left' ? '18' : '12', cy: '10', r: '4.2' }, e);
      h('span', '', p, '옆자리 시선');
      return p;
    }
    el.peekL = peek('left'); el.peekR = peek('right');

    el.ring = h('div', 'ring', hud);
    var rs = s('svg', { viewBox: '0 0 76 76', width: '76', height: '76' }, el.ring);
    s('circle', { 'class': 'bg', cx: '38', cy: '38', r: '32' }, rs);
    el.ringFg = s('circle', { 'class': 'fg', cx: '38', cy: '38', r: '32', transform: 'rotate(-90 38 38)' }, rs);
    el.ringFg.style.strokeDasharray = '201.1';
    el.ringFg.style.strokeDashoffset = '201.1';

    el.prompt = h('div', 'prompt', hud);
    el.lensLabel = h('div', 'lens lens-label', hud);
    /* 렌즈가 내 자리 위에 띄워 주는 표시(자리를 찾아 걷는 동안) */
    el.marker = h('div', 'lens marker', hud);
    el.markerText = h('span', '', el.marker);
    el.markerArrow = h('b', '', el.marker, '▼');
    /* 렌즈 화면: 안경이 켜져 있을 때만 보인다(상태 줄 · 읽은 문장 · 진행 막대 · 답과 근거) */
    el.lens = h('div', 'lens lens-hud', hud);
    var lh = h('div', 'lh', el.lens);
    h('span', 'brand', lh, 'AI LENS');
    el.lensDot = h('i', 'dot', lh);
    el.lensHead = h('span', 'st', lh);
    el.lensBat = h('span', 'bat', lh);
    el.lensLine = h('div', 'll', el.lens);
    el.lensTail = h('div', 'lt', el.lens);
    el.lensBarBox = h('div', 'lb', el.lens);
    el.lensBar = h('i', '', el.lensBarBox);
    el.lensAns = h('div', 'la', el.lens);
    el.lensAnsN = h('b', '', el.lensAns);
    el.lensAnsC = h('span', '', el.lensAns);
    el.lensConf = h('i', '', h('div', 'conf', el.lensAns));
    el.lensWhy = h('p', '', el.lensAns);

    el.obj = h('div', 'obj', hud);
    h('small', '', el.obj, '지금 할 일');
    el.objText = h('span', '', el.obj);

    el.timer = h('div', 'timer', hud);
    el.timerMain = h('b', '', el.timer);
    el.timerSub = h('small', '', el.timer);

    el.sus = h('div', 'sus g0', hud);
    var top = h('div', 'sus-top', el.sus);
    var eye = s('svg', { 'class': 'eye', viewBox: '0 0 30 20' }, top);
    s('path', { 'class': 'lid shut', d: 'M3,9 Q15,17 27,9' }, eye);
    s('path', { 'class': 'lid open', d: 'M2,10 Q15,-1 28,10 Q15,21 2,10 Z' }, eye);
    s('circle', { 'class': 'pupil', cx: '15', cy: '10', r: '4.2' }, eye);
    h('span', '', top, '감독관 의심');
    el.susVal = h('em', '', top, '0%');
    var bar = h('div', 'sus-bar', el.sus);
    el.susBar = h('i', '', bar);
    h('u', 'm55', bar);                              /* 이만큼 차면 옆에 와서 지켜본다 */
    el.susMark = h('u', 'm80', bar);                 /* 이만큼 차면 안경을 검사한다 */
    el.susGaze = h('div', 'sus-gaze', el.sus, '');
    el.susWhy = h('div', 'sus-why', el.sus);         /* 방금 의심이 오른 까닭 */
    /* 긴장(심박) */
    el.heart = h('div', 'heart', el.sus);
    var hv = s('svg', { viewBox: '0 0 24 22' }, el.heart);
    s('path', { d: 'M12,21 C5,15 1,11 1,6.5 C1,3 3.5,1 6.5,1 C9,1 11,2.5 12,4.5 C13,2.5 15,1 17.5,1 C20.5,1 23,3 23,6.5 C23,11 19,15 12,21 Z' }, hv);
    h('span', '', el.heart, '심박');
    el.heartV = h('em', '', el.heart, '62');
    /* 안경 상태: 꺼져 있어도 배터리와 온도는 대강 안다 */
    el.dev = h('div', 'dev', el.sus);
    var dtop = h('div', 'dev-top', el.dev);
    h('span', '', dtop, 'AI 안경');
    el.devState = h('em', '', dtop, '꺼짐');
    var r1 = h('div', 'dev-row', el.dev);
    h('span', '', r1, '배터리');
    el.devBat = h('i', '', h('div', 'meter bat', r1));
    el.devBatV = h('b', '', r1, '');
    var r2 = h('div', 'dev-row', el.dev);
    h('span', '', r2, '온도');
    el.devHeat = h('i', '', h('div', 'meter heat', r2));
    el.devHeatV = h('b', '', r2, '');

    el.hints = h('div', 'hints', hud);
    /* 조작 안내(처음 하는 사람에게 그때그때 하나씩) */
    el.coach = h('div', 'coach', hud);
    el.coachTag = h('span', 'tag', el.coach, '조작 안내');
    el.coachMsg = h('span', 'msg', el.coach);
    el.sub = h('div', 'sub', hud);
    el.subWho = h('b', '', el.sub);
    el.subText = h('span', '', el.sub);
    el.toast = h('div', 'toast', hud);
    el.banner = h('div', 'banner', hud);
    el.bannerBig = h('b', '', el.banner);
    el.bannerSmall = h('span', '', el.banner);
    el.ff = h('div', 'ff', hud, '▶▶ 시간을 빨리 보내는 중');

    el.ticket = h('div', 'ticket', hud);
    h('h4', '', el.ticket, '수 험 표');
    h('p', '', el.ticket, '세무사 제1차 시험 (가상)');
    h('p', '', el.ticket, '수험번호');
    el.ticketNo = h('strong', '', el.ticket, '');
    el.ticketRoom = h('p', '', el.ticket, '제3고사실');

    el.choice = h('div', 'choice', hud);
    el.choiceTitle = h('h3', '', el.choice);
    el.choiceText = h('p', '', el.choice);
    el.choiceBtns = h('div', '', el.choice);
    el.choiceBar = h('i', '', h('div', 'bar', el.choice));

    el.fade = h('div', 'fade', root);
    el.intro = h('div', 'intro', root);
    /* 에필로그(시험 뒤의 이야기): 검은 화면 위에 조회 화면·글·통지서를 차례로 띄운다. 누르면 다음으로 */
    el.epi = h('div', 'epi', root);
    el.epi.addEventListener('click', function (ev) { ev.stopPropagation(); if (UI._epiClick) UI._epiClick(); });

    el.title = h('div', 'screen title', root);
    el.pause = h('div', 'screen pause', root);
    el.result = h('div', 'screen result', root);
    el.error = h('div', 'screen error', root);
  };

  UI.hud = function (on) { show(el.hud, on); };
  UI.setGlasses = function (mode) {
    el.glass.classList.toggle('ai', mode === 'ai');
    el.glass.classList.toggle('plain', mode === 'plain');
  };
  UI.setObjective = function (text) { show(el.obj, !!text); if (text) el.objText.textContent = text; };
  UI.setHints = function (html) { show(el.hints, !!html); if (html) el.hints.innerHTML = html; };
  /* 화면 가운데 아래의 한 줄 안내. urgent 면 붉게 깜빡인다(급하게 꺼야 할 때) */
  var lastPrompt = null;
  UI.setPrompt = function (html, urgent) {
    var key = html ? (urgent ? '!' : '') + html : null;
    if (key === lastPrompt) return;
    lastPrompt = key;
    show(el.prompt, !!html);
    el.prompt.classList.toggle('urgent', !!(html && urgent));
    if (html) el.prompt.innerHTML = html;
  };
  var lastLabel = null;
  UI.setLensLabel = function (text) {
    if (text === lastLabel) return;
    lastLabel = text;
    show(el.lensLabel, !!text); if (text) el.lensLabel.textContent = text;
  };
  /* 조작 안내 한 줄. state: 'show'(해 보라는 안내) / 'done'(방금 해냈다). html 이 없으면 감춘다 */
  var coachSig = null;
  UI.setCoach = function (html, state) {
    var sig = html ? (state || 'show') + '|' + html : null;
    if (sig === coachSig) return;
    coachSig = sig;
    show(el.coach, !!html);
    el.hud.classList.toggle('coaching', !!html);
    if (!html) return;
    el.coach.classList.toggle('done', state === 'done');
    el.coachTag.textContent = state === 'done' ? '✓ 좋아요' : '조작 안내';
    el.coachMsg.innerHTML = html;
  };
  /* 렌즈가 띄우는 '내 자리' 표시. v: { x, y(화면 비율 0..1), edge(-1 왼쪽 밖 · 1 오른쪽 밖 · 0 화면 안), text } 또는 null */
  var markSig = null;
  UI.setMarker = function (v) {
    if (!v) { if (markSig !== null) { markSig = null; show(el.marker, false); } return; }
    var x = (v.x * 100).toFixed(1), y = (v.y * 100).toFixed(1), sig = x + '|' + y + '|' + v.edge + '|' + v.text;
    if (sig === markSig) return;
    markSig = sig;
    show(el.marker, true);
    el.marker.style.left = x + '%'; el.marker.style.top = y + '%';
    el.marker.classList.toggle('l', v.edge < 0); el.marker.classList.toggle('r', v.edge > 0);
    el.markerArrow.textContent = v.edge < 0 ? '◀' : (v.edge > 0 ? '▶' : '▼');
    el.markerText.textContent = v.text;
  };

  /* ───────── 에필로그 ─────────
   * b: { kind:'lookup', when, no, tax, acc, avg, pass }   합격자 조회 화면(결과는 epilogueReveal 때 뜬다)
   *    { kind:'letter', when, title, no, body:[…], seal }  통지서(도장은 epilogueReveal 때 찍힌다)
   *    { kind:'text', when, lines:[…] }                    글
   * b 가 없으면 닫는다. onClick: 화면을 눌렀을 때 */
  var epiOn = false;
  UI.epilogue = function (b, onClick) {
    var e = el.epi;
    if (!b) {
      UI._epiClick = null; el.epiBox = null;
      if (epiOn) { epiOn = false; show(e, false); e.replaceChildren(); }
      return;
    }
    epiOn = true;
    UI._epiClick = onClick || null;
    e.replaceChildren();
    var box = el.epiBox = h('div', 'epi-in ' + b.kind, e);
    if (b.when) h('div', 'epi-when', box, b.when);
    if (b.kind === 'lookup') {
      var lk = h('div', 'lk-card', box);
      h('div', 'lk-head', lk, '2030년도 세무사 제1차 시험 · 합격자 조회 (가상)');
      var row = h('div', 'lk-row', lk);
      h('span', '', row, '수험번호');
      h('b', '', row, b.no);
      h('div', 'lk-wait', lk, '조회 중 …');
      var res = h('div', 'lk-res', lk);
      h('div', 'lk-scores', res).innerHTML = '세법학개론 <b>' + b.tax + '</b>점 · 회계학개론 <b>' + b.acc + '</b>점 · 평균 <b>' + b.avg + '</b>점';
      h('div', 'lk-verdict ' + (b.pass ? 'pass' : 'fail'), res, b.pass ? '합 격' : '불 합 격');
      h('div', 'lk-foot', lk, '합격 기준: 과목별 40점 이상 · 평균 60점 이상');
    } else if (b.kind === 'letter') {
      var lt = h('div', 'lt-card', box);
      h('div', 'lt-org', lt, '세무사 자격시험 시행본부 (가상)');
      h('h3', '', lt, b.title);
      h('p', 'lt-to', lt, '수험번호 ' + b.no + ' 귀하');
      b.body.forEach(function (t) { h('p', '', lt, t); });
      h('div', 'lt-seal', lt, b.seal);
    } else {
      b.lines.forEach(function (t, i) { h('p', i === 0 && /^(합격|불합격)\.$/.test(t) ? 'verdict' : '', box, t); });
    }
    h('div', 'epi-next', e, '클릭 · Space 로 넘기기 ▶');
    show(e, true);
  };
  UI.epilogueReveal = function () { if (el.epiBox) el.epiBox.classList.add('shown'); };
  UI.epilogueOut = function () { if (el.epiBox) el.epiBox.classList.add('out'); };

  /* 렌즈 화면. v: GX.Glasses.view() 가 돌려준 것(꺼져 있으면 null 이나 on:false) */
  var lensSig = 'off', lensOp = '';
  UI.setLens = function (v) {
    if (!v || !v.on) {
      if (lensSig !== 'off') { lensSig = 'off'; show(el.lens, false); el.glass.classList.remove('lit', 'boot', 'dim'); }
      return;
    }
    /* 화면 밝기는 렌즈 밝기를 따라간다(답을 만드는 동안 일렁인다) */
    var op = (0.4 + 0.6 * Math.min(1, v.lum / 0.45)).toFixed(2);
    if (op !== lensOp) { lensOp = op; el.lens.style.opacity = op; }
    var a = v.answer, pct = Math.round(v.pct * 50);
    var sig = [v.stage, v.head, v.line, v.tail, v.dot, v.battery, v.low ? 1 : 0, a ? a.n + a.conf + a.why : '', pct].join('|');
    if (sig === lensSig) return;
    lensSig = sig;
    show(el.lens, true);
    el.glass.classList.add('lit');
    el.glass.classList.toggle('boot', v.stage === 'boot');
    el.glass.classList.toggle('dim', !!v.low);
    el.lensDot.className = 'dot ' + v.dot;
    el.lensHead.textContent = v.head;
    el.lensBat.textContent = '배터리 ' + v.battery + '%';
    el.lensBat.classList.toggle('low', !!v.low);
    el.lensLine.textContent = v.line;
    show(el.lensLine, !!v.line);
    el.lensTail.textContent = v.tail ? '읽음 “' + v.tail + '”' : '';
    show(el.lensTail, !!v.tail);
    var bar = v.stage === 'boot' || v.stage === 'lock' || v.stage === 'read' || v.stage === 'think';
    show(el.lensBarBox, bar);
    if (bar) el.lensBar.style.width = (pct * 2) + '%';
    show(el.lensAns, !!a);
    if (a) {
      el.lensAnsN.textContent = '답 ' + a.n;
      el.lensAnsC.textContent = '신뢰도 ' + a.conf + '%' + (a.low ? ' · 낮음' : '');
      el.lensConf.style.width = a.conf + '%';
      el.lensAns.classList.toggle('low', !!a.low);
      el.lensWhy.textContent = a.why ? '근거 · ' + a.why : '';
    }
  };
  /* 안경 상태(배터리·온도). d: { power, battery, low, temp, zone, heat } 또는 null */
  var devSig = '';
  UI.setDevice = function (d) {
    if (!d) { if (devSig !== 'none') { devSig = 'none'; show(el.dev, false); } return; }
    var sig = d.power + '|' + d.battery + '|' + d.temp + '|' + d.zone + '|' + (d.low ? 1 : 0) + '|' + Math.round(d.heat);
    if (sig === devSig) return;
    devSig = sig;
    el.dev.className = 'dev on p-' + d.power + ' z' + d.zone + (d.low ? ' low' : '');
    el.devState.textContent = { off: '꺼짐', fade: '꺼짐', boot: '켜는 중', on: '켜짐', dead: '방전', hot: '과열 · 식는 중' }[d.power] || '';
    el.devBat.style.width = GX.clamp(d.battery, 0, 100) + '%';
    el.devBatV.textContent = d.battery + '%';
    el.devHeat.style.width = GX.clamp((d.heat - 24) / 76 * 100, 3, 100).toFixed(0) + '%';
    el.devHeatV.textContent = d.temp + '°';
  };
  /* 심박수와 긴장도(0..1) */
  var lastBpm = -1, lastTense = -1;
  UI.setHeart = function (bpm, tension) {
    if (bpm !== lastBpm) { lastBpm = bpm; el.heartV.textContent = String(bpm); }
    var lv = tension > 0.7 ? 2 : (tension > 0.35 ? 1 : 0);
    if (lv !== lastTense) { lastTense = lv; el.heart.classList.toggle('mid', lv === 1); el.heart.classList.toggle('high', lv === 2); }
  };
  /* 심장이 한 번 뛴다 */
  UI.beat = function () { el.heart.classList.add('beat'); timers.beat = 0.14; };
  /* 옆자리 시선(왼쪽, 오른쪽) */
  var lastPL = null, lastPR = null;
  UI.setPeek = function (l, r) {
    l = !!l; r = !!r;
    if (l !== lastPL) { lastPL = l; show(el.peekL, l); }
    if (r !== lastPR) { lastPR = r; show(el.peekR, r); }
  };
  /* 렌즈 불빛이 남의 눈에 걸리는 정도 0..1 */
  var lastGlint = '';
  UI.setGlint = function (a) {
    var v = GX.clamp(a, 0, 1).toFixed(2);
    if (v !== lastGlint) { lastGlint = v; el.glint.style.opacity = v; }
  };
  /* 안경다리를 톡 치면 안경테가 살짝 흔들린다 */
  UI.nudge = function () { el.glass.classList.add('nudge'); timers.nudge = 0.16; };
  /* 안경을 벗으면 세상이 흐려진다. 일시정지 중에는 화면을 아예 가린다(setVeil) */
  var lastBlur = 0, veilOn = false, filterSig = 'none';
  function applyFilter() {
    var sig = veilOn ? 'blur(18px) brightness(0.75)' : (lastBlur ? 'blur(' + lastBlur + 'px)' : 'none');
    if (sig === filterSig) return;
    filterSig = sig;
    var c = document.getElementById('game');
    if (c) c.style.filter = sig;
  }
  UI.setBlur = function (px) {
    px = px || 0;
    if (px === lastBlur) return;
    lastBlur = px;
    applyFilter();
  };
  /* 일시정지 중에는 3D 화면을 읽을 수 없게 뭉개고 화면 위 표시(렌즈의 답·타이머)도 감춘다.
     시간이 멈춘 동안 문제지나 렌즈에 뜬 답을 느긋하게 읽을 수 있으면 5분이라는 제한이 뜻이 없어진다 */
  UI.setVeil = function (on) {
    on = !!on;
    if (on === veilOn) return;
    veilOn = on;
    el.hud.classList.toggle('veil', on);
    applyFilter();
  };
  var ringSig = null;
  UI.setRing = function (p) {
    var sig = p !== null && p !== undefined ? (201.1 * (1 - GX.clamp(p, 0, 1))).toFixed(1) : null;
    if (sig === ringSig) return;
    ringSig = sig;
    show(el.ring, sig !== null);
    if (sig !== null) el.ringFg.style.strokeDashoffset = sig;
  };
  /* 시험 중에는 프레임마다 불리지만 글자는 1초에 한 번 바뀐다: 바뀔 때만 화면을 건드린다 */
  var timerSig = null;
  UI.setTimer = function (main, sub, low) {
    var sig = main ? main + '|' + (sub || '') + '|' + (low ? 1 : 0) : null;
    if (sig === timerSig) return;
    timerSig = sig;
    show(el.timer, !!main);
    if (main) { el.timerMain.textContent = main; el.timerSub.textContent = sub || ''; el.timer.classList.toggle('low', !!low); }
  };
  /* 의심 게이지. why: 방금 의심이 오른 까닭들(꼬리표), inspect: 안경 검사 눈금(80%)을 보일지 */
  var lastSus = -1, lastGaze = -1, lastGazeText = null, lastWhy = '', lastInspect = null;
  UI.setSuspicion = function (val, gaze, gazeText, why, inspect) {
    show(el.sus, val !== null && val !== undefined);
    if (val === null || val === undefined) return;
    var v = Math.round(GX.clamp(val, 0, 100));
    if (v !== lastSus) {
      lastSus = v;
      el.susVal.textContent = v + '%';
      el.susBar.style.width = v + '%';
      el.sus.classList.toggle('mid', v >= 40 && v < 70);
      el.sus.classList.toggle('high', v >= 70);
    }
    if (gaze !== lastGaze) {
      lastGaze = gaze;
      el.sus.classList.toggle('g0', gaze === 0);
      el.sus.classList.toggle('g1', gaze === 1);
      el.sus.classList.toggle('g2', gaze === 2);
    }
    if (gazeText !== lastGazeText) { lastGazeText = gazeText; el.susGaze.textContent = gazeText || ''; }
    var w = why && why.length ? why.join('|') : '';
    if (w !== lastWhy) {
      lastWhy = w;
      el.susWhy.innerHTML = w ? why.map(function (t) { return '<i>+ ' + esc(t) + '</i>'; }).join('') : '';
    }
    inspect = !!inspect;
    if (inspect !== lastInspect) { lastInspect = inspect; show(el.susMark, inspect); }
  };
  /* 아래 둘은 프레임마다 불린다: 값이 그대로면 스타일을 다시 쓰지 않는다 */
  var lastDanger = '', lastFade = '';
  UI.setDanger = function (a) {
    var v = GX.clamp(a, 0, 1).toFixed(2);
    if (v !== lastDanger) { lastDanger = v; el.vignette.style.opacity = v; }
  };
  UI.setFade = function (a) {
    var v = GX.clamp(a, 0, 1).toFixed(3);
    if (v !== lastFade) { lastFade = v; el.fade.style.opacity = v; }
  };
  UI.ff = function (on) { show(el.ff, on); };
  UI.setCross = function (on) { el.cross.style.opacity = on ? '1' : '0'; };

  /* 자막. kind: proctor(감독관) / pa(방송) / think(속마음) / lens(렌즈) */
  UI.say = function (kind, text, dur) {
    var who = { proctor: '감독관', pa: '안내 방송', think: '', lens: 'AI 안경', me: '나' }[kind] || '';
    el.sub.className = 'sub on' + (kind === 'think' ? ' think' : '') + (kind === 'pa' ? ' pa' : '') + (kind === 'lens' ? ' lensline' : '');
    el.subWho.textContent = who;
    el.subWho.style.display = who ? 'block' : 'none';
    el.subText.textContent = text;
    timers.sub = dur || Math.max(2.2, 1.1 + String(text).length * 0.085);
    return timers.sub;
  };
  UI.clearSay = function () { timers.sub = 0; show(el.sub, false); };
  UI.toast = function (text, kind, dur) {
    el.toast.className = 'toast on' + (kind === 'info' ? ' info' : '');
    el.toast.textContent = text;
    timers.toast = dur || 2.6;
  };
  /* 화면 가운데의 큰 글(종소리). big 이 없으면 바로 거둔다 */
  UI.banner = function (big, small, dur) {
    if (!big) { timers.banner = 0; show(el.banner, false); return; }
    el.bannerBig.textContent = big; el.bannerSmall.textContent = small || '';
    show(el.banner, true); timers.banner = dur || 2.6;
  };
  UI.intro = function (html) { show(el.intro, !!html); if (html) el.intro.innerHTML = html; };
  UI.ticket = function (no, on) { show(el.ticket, on); if (no) el.ticketNo.textContent = no; };

  UI.update = function (dt) {
    if (timers.sub > 0) { timers.sub -= dt; if (timers.sub <= 0) show(el.sub, false); }
    if (timers.toast > 0) { timers.toast -= dt; if (timers.toast <= 0) show(el.toast, false); }
    if (timers.banner > 0) { timers.banner -= dt; if (timers.banner <= 0) show(el.banner, false); }
    if (timers.beat > 0) { timers.beat -= dt; if (timers.beat <= 0) el.heart.classList.remove('beat'); }
    if (timers.nudge > 0) { timers.nudge -= dt; if (timers.nudge <= 0) el.glass.classList.remove('nudge'); }
  };

  /* 선택지 창. options: [{ key:'1', label, sub }]. onPick(index) */
  UI.choice = function (title, text, options, onPick) {
    el.choiceTitle.textContent = title;
    el.choiceText.textContent = text;
    el.choiceBtns.replaceChildren();
    options.forEach(function (o, i) {
      var b = h('button', '', el.choiceBtns);
      b.type = 'button';
      b.innerHTML = '<kbd>' + esc(o.key) + '</kbd> ' + esc(o.label) + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '');
      b.addEventListener('click', function (ev) { ev.stopPropagation(); onPick(i); });
    });
    el.choiceBar.style.width = '100%';
    show(el.choice, true);
  };
  UI.choiceProgress = function (p) { el.choiceBar.style.width = (GX.clamp(p, 0, 1) * 100).toFixed(1) + '%'; };
  UI.choiceClose = function () { show(el.choice, false); };

  /* 조작법 한눈에(시작 화면과 일시정지 화면에 함께 쓴다) */
  var KEYS_HTML =
    '<b>둘러보기</b> 마우스 · <b>이동</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · <b>행동</b> <kbd>E</kbd> · <b>고개 들기/숙이기</b> <kbd>Space</kbd><br>' +
    '<b>답 표기</b> <kbd>1</kbd>~<kbd>5</kbd> · <b>문항 넘기기</b> <kbd>A</kbd><kbd>D</kbd> · <b>AI 안경 켜기/끄기</b> <kbd>F</kbd><br>' +
    '<b>시간 빨리 보내기</b> <kbd>T</kbd> 길게 · <b>소리 끄기</b> <kbd>M</kbd> · <b>일시정지</b> <kbd>Esc</kbd>';

  /* ───────── 시작 화면 ─────────
   * info: { endings:[{ no, title, found }], coach(이미 배운 조작 수), onCoachReset } */
  UI.showTitle = function (onStart, note, info) {
    var t = el.title;
    t.replaceChildren();
    var box = h('div', 'title-in', t);
    h('span', 'tag', box, '1인칭 시험장 체험 · 세무사 1차 · 한 판 8분 안팎');
    var h1 = h('h1', '', box);
    h1.innerHTML = '<i>렌즈</i> 속 정답';
    h('p', 'lead', box, '시험 날 아침. 얼굴에는 어제 산 AI 안경이 얹혀 있다. 안경다리를 톡 건드리면 켜지고, 문제를 보고 있으면 렌즈에 답이 뜬다. 쓸지 말지는 당신이 고른다. 다만 렌즈의 불빛은 남의 눈에도 보이고, 답은 가끔 자신 있게 틀린다. 어떻게 치르느냐에 따라 끝이 달라진다.');
    var b = h('button', 'btn', box, '시험장 입장');
    b.type = 'button';
    b.addEventListener('click', function (ev) { ev.stopPropagation(); onStart(); });
    /* 지금까지 본 엔딩 */
    if (info && info.endings) {
      var found = 0;
      info.endings.forEach(function (e) { if (e.found) found++; });
      var ends = h('div', 'ends', box);
      h('span', '', ends).innerHTML = '지금까지 본 엔딩 <b>' + found + '</b> / ' + info.endings.length;
      var dots = h('span', 'dots', ends);
      info.endings.forEach(function (e) {
        var d = h('i', e.found ? 'on' : '', dots, String(e.no));
        d.title = e.found ? e.title : '아직 못 본 엔딩';
      });
    }
    var keys = h('div', 'keys', box);
    keys.innerHTML = KEYS_HTML + '<small>조작은 게임 안에서 필요할 때마다 하나씩 알려 드립니다.</small>';
    if (info && info.coach > 0 && info.onCoachReset) {
      var again = h('button', 'link', box, '조작 안내를 처음부터 다시 보기');
      again.type = 'button';
      again.addEventListener('click', function (ev) {
        ev.stopPropagation();
        info.onCoachReset();
        again.textContent = '다음 판에 조작 안내를 처음부터 보여 드립니다';
        again.disabled = true;
      });
    }
    h('p', 'disclaimer', box, '※ 실제 시험·인물과 무관한 가상 상황입니다.');
    h('p', 'fine', box, note || '문항은 이 게임을 위해 새로 지은 것이며, 소리를 켜고 데스크톱 브라우저에서 하는 것을 권합니다.');
    show(t, true);
    el.startBtn = b;
  };
  UI.hideTitle = function () { show(el.title, false); };

  /* ───────── 일시정지 ───────── */
  UI.showPause = function (on, cfg) {
    var p = el.pause;
    UI.setVeil(on);
    if (!on) { show(p, false); el.pauseNote = null; return; }
    p.replaceChildren();
    var box = h('div', 'pause-in', p);
    h('h2', '', box, '일시정지');
    h('p', '', box, cfg.lock ? '화면을 클릭하면 이어서 합니다.' : '아래 버튼을 누르면 이어서 합니다.');
    el.pauseNote = h('p', 'pause-note', box, '');          /* 일시정지 중에 알릴 말(화면 위 알림은 가려져 있으므로 여기에 띄운다) */
    function slider(label, min, max, step, val, fn) {
      var l = h('label', '', box);
      h('span', '', l, label);
      var i = h('input', '', l);
      i.type = 'range'; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(val);
      i.addEventListener('input', function () { fn(parseFloat(i.value)); });
      i.addEventListener('click', function (ev) { ev.stopPropagation(); });
      return i;
    }
    slider('마우스 감도', 0.3, 2.5, 0.05, cfg.sens, cfg.onSens);
    slider('소리 크기', 0, 1, 0.02, cfg.volume, cfg.onVolume);
    h('div', 'keys', box).innerHTML = KEYS_HTML;
    var row = h('div', 'row', box);
    var c = h('button', 'btn', row, '계속하기');
    c.type = 'button';
    c.addEventListener('click', function (ev) { ev.stopPropagation(); cfg.onResume(); });
    var q = h('button', 'btn ghost', row, '처음으로');
    q.type = 'button';
    q.addEventListener('click', function (ev) { ev.stopPropagation(); cfg.onQuit(); });
    if (!UI._pauseClick) {
      UI._pauseClick = function () { if (UI._pauseResume) UI._pauseResume(); };
      p.addEventListener('click', UI._pauseClick);
    }
    UI._pauseResume = cfg.onResume;
    show(p, true);
  };

  /* 일시정지 화면에 한 줄 알린다. 일시정지 화면이 떠 있지 않으면 false */
  UI.pauseNote = function (text) {
    if (!el.pauseNote) return false;
    el.pauseNote.textContent = text || '';
    show(el.pauseNote, !!text);
    return true;
  };

  /* ───────── 결과(엔딩) ─────────
   * d: flow.js 의 finish 가 만든 것. 엔딩 번호·이름·이야기, 점수, 남긴 흔적, 엔딩 모음, 문항별 해설 */
  UI.showResult = function (d, onRestart, onTitle) {
    var r = el.result, C = GX.CIRC, i;
    r.replaceChildren();
    var box = h('div', 'result-in', r);
    var total = d.collection ? d.collection.length : 0, found = 0;
    for (i = 0; i < total; i++) if (d.collection[i].found) found++;
    var top = h('div', 'end-top', box);
    h('span', 'end-no', top, '엔딩 ' + d.no + '번' + (total ? ' · 전체 ' + total + '가지' : ''));
    if (d.isNew) h('span', 'end-new', top, '처음 본 엔딩');
    h('span', 'stamp ' + d.stampClass, box, d.stamp);
    h('h2', '', box, d.title);
    h('p', 'story', box, d.story);

    var cards = h('div', 'cards', box);
    function card(cls, label, value, note, voided) {
      var c = h('div', 'card ' + cls, cards);
      h('small', '', c, label);
      h('b', voided ? 'void' : '', c, value);
      if (note) h('em', '', c, note);
    }
    var sc = d.score, undone = d.ending === 'exposed', gone = d.caught || undone;      /* 무효가 되었거나 취소된 점수는 줄을 긋는다 */
    card('', '세법학개론', sc.tax + '점', '5문항 · 과목당 100점', gone);
    card('', '회계학개론', sc.acc + '점', '5문항 · 과목당 100점', gone);
    card(gone ? 'bad' : (sc.pass ? 'good' : 'bad'), '평균', sc.avg + '점', d.caught ? '무효 처리' : (undone ? '합격 취소' : (sc.pass ? '합격선 통과' : '합격선 미달')), gone);
    card(gone ? 'bad' : '', '들켰는가', d.caught ? '적발' : (undone ? '사후 적발' : '안 들킴'), (undone ? '시험이 끝난 뒤에 들킴 · ' : '') + '최고 의심도 ' + Math.round(d.peak) + '%');
    card('ai', 'AI 안경 사용', sc.aiUsed + '회', d.glassesNote);
    card('', '내 힘으로 맞힌 문항', sc.own + '개', 'AI를 보지 않고 맞힌 수');
    var dv = d.device;
    if (dv && dv.used) {
      card(dv.dead ? 'bad' : '', '안경 배터리', dv.dead ? '방전' : dv.battery + '%', '최고 온도 ' + dv.maxTemp + '°' + (dv.thermal ? ' · 과열로 ' + dv.thermal + '번 꺼짐' : ''));
      card(dv.takes + dv.saws + dv.inspections ? 'bad' : 'good', '눈에 띈 순간', (dv.takes + dv.saws + dv.inspections) + '번',
        '렌즈 반사 ' + dv.takes + ' · 옆자리 ' + dv.saws + ' · 안경 검사 ' + dv.inspections);
    }
    if (d.playT) {
      var sec = Math.round(d.playT);
      card('', '이번 판에 걸린 시간', Math.floor(sec / 60) + '분 ' + (sec % 60) + '초', '입장부터 결과까지');
    }

    /* 시험장에 남긴 흔적: AI 안경을 끝까지 쓰고 나온 판에서, 왜 나중에 들켰는지(또는 안 들켰는지)를 보여 준다 */
    if (d.kept && !d.caught && sc.aiUsed > 0) {
      var tr = h('div', 'traces' + (d.evidencePts >= d.exposeAt ? ' hot' : ''), box);
      h('h4', '', tr).innerHTML = '시험장에 남긴 흔적 <em>' + d.evidencePts + '점</em>';
      if (d.evidence.length) {
        var ul = h('ul', '', tr);
        d.evidence.forEach(function (e) { h('li', '', ul).innerHTML = '<b>+' + e.pts + '</b> ' + esc(e.text); });
      } else h('p', '', tr, '남의 눈에 걸린 일도, 렌즈를 따라 적은 오답도 없었다.');
      h('p', 'why', tr, sc.pass
        ? (d.evidencePts >= d.exposeAt ? '흔적이 ' + d.exposeAt + '점 이상 쌓인 합격이라, 시험이 끝난 뒤에 조사가 시작되었습니다.'
          : '흔적이 ' + d.exposeAt + '점에 못 미쳐, 아무도 조사를 시작하지 않았습니다.')
        : '합격했다면: 흔적이 ' + d.exposeAt + '점 이상 쌓인 합격은 시험이 끝난 뒤에 들킵니다.');
    }

    h('p', 'note', box, '게임 속 합격선: 과목별 40점 이상이면서 평균 60점 이상.' +
      (sc.aiUsed ? (sc.aiWrong ? ' AI 안경이 띄운 답 ' + sc.aiUsed + '개 가운데 ' + sc.aiWrong + '개는 틀린 답이었고' +
        (sc.aiSure ? ', 그중 ' + sc.aiSure + '개는 신뢰도 90% 이상으로 자신 있게 내민 답이었습니다.' : ' 신뢰도는 낮게 표시되었습니다.') +
        (sc.aiFooled ? ' 그 가운데 ' + sc.aiFooled + '개를 그대로 따라 적었습니다.' : ' 틀린 답은 따라 적지 않았습니다.')
        : ' 이번에 AI 안경이 띄운 답은 모두 맞았지만, 자신 있게 틀린 답을 내는 문항도 있었습니다.') : ''));

    /* 엔딩 모음 */
    if (total) {
      h('h3', '', box).innerHTML = '엔딩 모음 <em>지금까지 ' + found + ' / ' + total + '</em>';
      var grid = h('div', 'ends-grid', box);
      d.collection.forEach(function (e) {
        var t = h('div', 'end-tile' + (e.found ? ' on' : '') + (e.id === d.ending ? ' now' : ''), grid);
        h('small', '', t, '엔딩 ' + e.no);
        h('b', '', t, e.found ? e.title : '？');
        h('em', '', t, e.found ? (e.id === d.ending ? '이번 판' : '') : e.hint);
      });
    }
    var foot = h('div', 'foot', box);
    var b = h('button', 'btn', foot, '다시 하기');
    b.type = 'button';
    b.addEventListener('click', function (ev) { ev.stopPropagation(); onRestart(); });
    if (onTitle) {
      var tb = h('button', 'btn ghost', foot, '처음 화면으로');
      tb.type = 'button';
      tb.addEventListener('click', function (ev) { ev.stopPropagation(); onTitle(); });
      el.titleBtn = tb;
    }

    h('h3', '', box).innerHTML = '문항별 돌아보기 <em>해설을 읽어 두면 다음 판의 밑천이 됩니다</em>';
    for (i = 0; i < 10; i++) {
      var q = d.qs[i], a = d.answers[i], ok = a === q.answer;
      var row = h('div', 'rev ' + (a < 0 ? 'none' : (ok ? '' : 'x')), box);
      h('div', 'q', row, (i + 1) + '. [' + GX.SUBJECTS[q.subj].short + '] ' + q.text);
      var line = h('div', 'a', row);
      var html = '정답 <b>' + C[q.answer] + '</b> ' + esc(q.choices[q.answer]) + '<br>내 답 ' +
        (a < 0 ? '<b>표기 안 함</b>' : '<b>' + C[a] + '</b> ' + (ok ? '○' : '×'));
      if (d.scanned[i]) {
        html += ' · <i class="' + (q.ai.wrong ? 'w' : '') + '">AI 안경 ' + C[q.ai.pick] + ' (신뢰도 ' + q.ai.conf + '%' +
          (q.ai.kind === 'sure' ? ', 자신 있게 틀림' : (q.ai.wrong ? ', 오답' : '')) + ')</i>';
        if (q.ai.wrong) {
          html += '<br><i class="w">렌즈가 내민 근거 · ' + esc(q.ai.why) + '</i>' +
            (q.ai.misread ? '<br><i class="w">문제를 “' + esc(GX.stemTail(q.ai.readAs, 17)) + '”로 잘못 읽었습니다.</i>' : '');
        }
      } else {
        html += ' · AI 안경 안 봄';
      }
      line.innerHTML = html;
      h('div', 'ex', row, '해설 · ' + q.ex);
    }
    h('p', 'note', box, '※ 실제 시험·인물과 무관한 가상 상황입니다. 문항은 모두 이 게임을 위해 새로 지은 것이며, 실제 시험에서 부정행위를 하면 관련 법령과 시행기관 공고에 따라 처분을 받습니다. 이 게임은 처분의 구체적인 내용이나 기간을 다루지 않습니다.');
    r.scrollTop = 0;
    show(r, true);
    el.restartBtn = b;
  };
  UI.hideResult = function () { show(el.result, false); };

  UI.showError = function (title, msg, detail) {
    if (!el.error) { UI.init(); }
    var e = el.error;
    e.replaceChildren();
    var box = h('div', 'error-in', e);
    h('h2', '', box, title);
    h('p', '', box, msg);
    if (detail) h('pre', '', box, detail);
    show(e, true);
  };

  UI.el = el;
  GX.UI = UI;
})(window.GX = window.GX || {});
