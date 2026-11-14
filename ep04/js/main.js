/* 시작점 — 엔진·게임을 만들고 매 프레임 돌린다. 일시정지·창 크기·설정 저장도 여기서 */
(function (GX) {
  'use strict';
  var UI = GX.UI, Au = GX.Audio, Input = GX.Input;
  var eng, game, canvas, paused = false, last = 0, dead = false;
  var scale = 1, slow = 0, frames = 0, acc = 0, adapt = true, probe = null;
  var idle = 0;                 /* 일시정지한 뒤로 지난 프레임 수 */
  var settings = { sens: 1, volume: 0.8 };

  function load() {
    try {
      var s = JSON.parse(window.localStorage.getItem('lens-exam-settings') || 'null');
      if (s && typeof s.sens === 'number' && typeof s.volume === 'number') {
        settings.sens = GX.clamp(s.sens, 0.3, 2.5); settings.volume = GX.clamp(s.volume, 0, 1);
      }
    } catch (e) { /* 저장소를 못 쓰는 환경이면 기본값 */ }
  }
  function save() {
    try { window.localStorage.setItem('lens-exam-settings', JSON.stringify(settings)); } catch (e) { /* 무시 */ }
  }

  var MAX_PIXELS = 4.4e6;       /* 한 프레임에 칠할 픽셀 수의 상한(약 2560x1700). 그보다 큰 화면은 조금 낮은 해상도로 그린다 */
  function resize() {
    var w = window.innerWidth || 1280, h = window.innerHeight || 720;
    var pr = Math.min(window.devicePixelRatio || 1, 2);
    var cap = Math.sqrt(MAX_PIXELS / Math.max(1, w * h * pr * pr));
    pr *= Math.min(1, cap) * scale;
    eng.resize(w * pr, h * pr);
    game.aspect = w / h;
    idle = 0;                   /* 크기가 바뀌면 그림이 지워지므로, 일시정지 중이어도 바로 다시 그린다 */
  }

  /* 조작을 받는 중인가. 에필로그는 커서를 풀어 놓고 보는 장면이라 여기서 뺀다(잠금이 풀려도 일시정지하지 않는다) */
  function playing() { return game.phase !== 'title' && game.phase !== 'result' && game.phase !== 'epilogue'; }

  function setPaused(on) {
    if (on === paused) return;
    paused = on;
    if (on) {
      Au.suspend();
      UI.showPause(true, {
        lock: Input.mode === 'lock', sens: settings.sens, volume: settings.volume,
        onSens: function (v) { settings.sens = v; Input.sens = v; save(); },
        onVolume: function (v) { settings.volume = v; Au.setVolume(v); save(); },
        onResume: resume,
        onQuit: toTitle
      });
    } else {
      UI.showPause(false);
      Au.resume();
      last = 0;
    }
  }
  function resume() {
    if (Input.mode === 'lock') {
      Input.requestLock();            /* 잠금이 걸리면 onLock 에서 재개 */
      if (Input.locked) setPaused(false);
    } else setPaused(false);
  }

  function start() {
    Au.init(); Au.setVolume(settings.volume); Au.resume();
    UI.hideTitle();
    Input.sens = settings.sens;
    Input.requestLock();
    game.begin(GX.DEBUG_JUMP || 'intro');
  }
  function restart() {
    UI.hideResult();
    game.newSession((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    Au.resume();
    Input.requestLock();
    game.begin('intro');
  }
  function toTitle() {
    paused = false;
    UI.showPause(false); UI.hideResult();
    Input.releaseLock();
    Input.active = false;
    Au.resume(); Au.ambience(false); Au.lens(0);
    game.script = null; game.tasks = [];
    game.newSession((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    game.phase = 'title';
    UI.hud(false); UI.setFade(0); UI.intro(null); UI.choiceClose(); UI.clearSay();
    /* 시험 도중에 나왔더라도 다음 판에 남지 않게 화면 위 표시를 비운다 */
    UI.setTimer(null); UI.setHints(null); UI.setObjective(null); UI.setPrompt(null); UI.setRing(null); UI.ff(false);
    UI.setSuspicion(null); UI.setDanger(0); UI.setGlint(0); UI.setCoach(null); UI.setMarker(null); UI.epilogue(null);
    showTitle();
  }
  function titleNote() {
    return eng.mode === 'basic' ? '이 기기에서는 간단한 그래픽으로 실행됩니다. 문항은 이 게임을 위해 새로 지은 것입니다.' : undefined;
  }
  /* 시작 화면: 지금까지 본 엔딩과, 조작 안내를 처음부터 다시 볼지 */
  function showTitle() {
    UI.showTitle(start, titleNote(), { endings: GX.Endings.collection(), coach: GX.Coach.count(), onCoachReset: GX.Coach.reset });
  }

  function fail(title, msg, err) {
    dead = true;
    try { Input.releaseLock(); } catch (e) { /* 무시 */ }
    UI.showError(title, msg, err ? String((err && err.stack) || err) : '');
  }

  function frame(t) {
    if (dead) return;
    window.requestAnimationFrame(frame);
    var dt = last ? (t - last) / 1000 : 0.016;
    var raw = dt;
    last = t;
    if (dt > 0.05) dt = 0.05;
    if (dt < 0.0005) dt = 0.0005;
    try {
      if (!paused) {
        var steps = game.ffwd ? 8 : 1;
        for (var i = 0; i < steps; i++) {
          game.update(dt);
          if (i === 0) Input.endFrame();
          if (!game.ffwd) break;
        }
      } else Input.endFrame();
      var cam = game.player.updateCamera(game.aspect);
      /* 일시정지 중에는 화면이 바뀌지 않으므로(그리고 가려져 있으므로) 가끔만 다시 그린다: 멈춰 둔 동안 그래픽 장치를 쉬게 한다 */
      idle = paused ? idle + 1 : 0;
      if (!GX.noRender && (idle < 3 || idle % 12 === 0)) eng.render(cam);
    } catch (e) {
      fail('게임 실행 중 문제가 생겼습니다', '페이지를 새로고침해 주세요. 계속 같은 문제가 나면 아래 내용이 원인을 찾는 데 도움이 됩니다.', e);
      throw e;
    }
    /* 프레임이 밀리면(약 40fps 아래가 2초쯤 이어지면) 렌더 해상도를 한 단계씩 낮춰 부드러움을 지킨다.
       화면 주사율에 묶여 있으면(60Hz 화면에서는 30fps 아니면 60fps) 한 단계로는 차이가 안 보일 수 있으므로 세 단계까지 내려가 본다.
       그래도 나아지지 않으면 기기가 느린 것이 아니라 화면 주사율이 낮거나 절전 중인 것이므로 처음 해상도로 되돌리고 그만둔다.
       1초마다 판단한다(프레임 수로 세면 느린 기기일수록 판단이 늦어진다) */
    if (raw < 0.25 && !paused) { frames++; acc += raw; }
    if (acc >= 1 && frames >= 8) {
      var avg = acc / frames;
      frames = 0; acc = 0;
      if (probe) {
        if (avg <= probe.avg * 0.9) { probe = null; slow = 0; }                 /* 나아졌다: 이 해상도로 간다(아직 느리면 다음에 또 낮춘다) */
        else if (probe.tries < 3 && scale > 0.5) { probe.tries++; scale = Math.max(0.5, scale - 0.15); resize(); }
        else { scale = probe.scale; adapt = false; probe = null; slow = 0; resize(); }
      } else if (adapt && !GX.FIXED_SCALE && avg > 0.025 && scale > 0.5) {
        slow++;
        if (slow >= 2) { probe = { avg: avg, scale: scale, tries: 1 }; scale = Math.max(0.5, scale - 0.15); slow = 0; resize(); }
      } else slow = 0;
    }
  }

  GX.boot = function () {
    canvas = document.getElementById('game');
    UI.init();
    try {
      eng = new GX.Engine(canvas);
    } catch (e) {
      fail('이 브라우저에서는 실행할 수 없습니다', 'WebGL2 를 지원하는 최신 브라우저(Chrome · Edge · Firefox · Safari)에서 index.html 을 열어 주세요.', e);
      return;
    }
    try {
      game = new GX.Game(eng, canvas);
    } catch (e2) {
      fail('게임을 준비하다 문제가 생겼습니다', '페이지를 새로고침해 주세요.', e2);
      throw e2;
    }
    GX.game = game; GX.eng = eng;
    /* 지금의 렌더 해상도 배율(점검 도구가 '느린 기기에서 해상도 낮추기'를 확인할 때 본다) */
    GX.perf = function () { return { scale: scale, adapting: adapt, probing: !!probe }; };
    /* 셰이더가 안 돼서 단순 그래픽으로 내려갔다면 이유를 콘솔에 남긴다(원인을 찾을 때 쓴다) */
    if (eng.warnings.length && window.console && window.console.warn) window.console.warn('[렌즈 속 정답] 그래픽 경고: ' + eng.warnings.join(' / '));
    load();
    Input.init(canvas);
    Input.sens = settings.sens;
    var q = null;
    try { q = new window.URLSearchParams(window.location.search); } catch (e3) { q = null; }
    if (q && q.get('seed')) { game.newSession(parseInt(q.get('seed'), 10) >>> 0); }
    if (q && q.get('jump')) GX.DEBUG_JUMP = q.get('jump');
    /* 깊이 먼저 그리기를 억지로 켜거나 끈다(점검 도구용. 보통은 그래픽 장치를 보고 엔진이 정한다) */
    if (q && q.get('prepass')) eng.prepass = q.get('prepass') !== '0';

    Input.onLock = function (locked) {
      if (locked) setPaused(false);
      else if (playing() && Input.mode === 'lock') setPaused(true);
    };
    /* 일시정지 중에는 화면 위 알림이 가려져 있으므로 일시정지 창 안에 알린다 */
    function notify(text, dur) { if (!(paused && UI.pauseNote(text))) UI.toast(text, 'info', dur); }
    Input.onRetry = function () { notify('잠시 뒤 화면을 한 번 더 클릭해 주세요', 2.5); };
    Input.onFallback = function () {
      if (paused) setPaused(false);
      /* 둘러보는 법을 아직 안 배운 사람에게는 조작 안내(coach.js)가 같은 말을 해 주므로 겹쳐 띄우지 않는다 */
      if (playing() && GX.Coach.has('look')) UI.toast('마우스를 누른 채 끌어서 둘러보세요', 'info', 4);
    };
    canvas.addEventListener('mousedown', function () {
      if (playing() && !paused && Input.mode === 'lock' && !Input.locked) Input.requestLock();
    });
    window.addEventListener('keydown', function (e) {
      if (!playing()) return;
      if (Input.mode === 'drag' && (e.code === 'Escape' || e.code === 'KeyP')) setPaused(!paused);
      else if (e.code === 'KeyP' && Input.locked) Input.releaseLock();      /* 잠금이 풀리면서 일시정지된다 */
      if (e.code === 'KeyM') { Au.setMuted(!Au.muted); notify(Au.muted ? '소리 끔' : '소리 켬', 1.4); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && playing()) { if (Input.mode === 'lock') Input.releaseLock(); setPaused(true); }
    });
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      fail('그래픽 장치와의 연결이 끊겼습니다', '페이지를 새로고침해 주세요.');
    });
    window.addEventListener('resize', resize);
    game.onRestart = restart;
    game.onTitle = toTitle;
    resize();
    showTitle();
    window.requestAnimationFrame(frame);
  };

  GX.boot();
})(window.GX = window.GX || {});
