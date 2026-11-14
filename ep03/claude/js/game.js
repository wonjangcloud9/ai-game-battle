/* SUNDRIFT GP — game: boot, state machine, chase camera, effects, main loop. */
(function (root) {
  'use strict';
  var SD = root.SD, M = SD.M, C = SD.CFG, hud = SD.hud, input = SD.input, audio = SD.audio;
  var DEG = Math.PI / 180, TEST = !!root.__TEST__;

  var G = SD.game = {
    state: 'loading', paused: false, difficulty: 1,
    time: 0, lastNow: 0, fade: 0,
    track: null, world: null, R: null, race: null, player: null,
    meshes: [], draws: [], drawCount: 0,
    fxAdd: new SD.Particles(2600), fxAlpha: new SD.Particles(1800), skid: new SD.Skid(2400),
    cam: { yaw: 0, y: 0, fov: 62 * DEG, roll: 0, shake: 0, boost: 0, orbit: 0, pitch: 0, eye: [0, 30, 0], target: [0, 0, 0], focus: [0, 0, 0] },
    lights: [0, 0, 0], crowd: 0.6, countShown: 9, autopilot: false,
    finishT: 0, wrongT: 0, hintShown: false, everDrifted: false, driftTip: false, lost: false, bestEver: Infinity
  };
  var cam = G.cam;
  var mCh = M.create(), mBody = M.create(), mTmp = M.create();
  var scene = { time: 0, cam: { eye: cam.eye, target: cam.target, fov: cam.fov, roll: 0 }, focus: cam.focus, draws: G.draws, drawCount: 0,
    skid: G.skid, fxAdd: G.fxAdd, fxAlpha: G.fxAlpha, fx: { blur: 0, lines: 0, tint: 0, fade: 1, crowd: 0.6, lights: G.lights } };

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ================================================================= boot
  G.init = function () {
    hud.init();
    try {
      G.track = new SD.Track();
      G.world = new SD.World(G.track);
      G.R = new SD.Renderer(document.getElementById('gl'));
      G.R.setWorld(G.world, G.track);
      for (var i = 0; i < SD.RACERS.length; i++) {
        var b = SD.buildKart(SD.RACERS[i], i + 1);
        G.meshes.push({ body: G.R.addMesh(b.body), head: G.R.addMesh(b.head), wheelF: G.R.addMesh(b.wheelF), wheelR: G.R.addMesh(b.wheelR) });
      }
      for (i = 0; i < SD.RACERS.length * 6; i++) G.draws.push({ mesh: null, m: M.create(), tint: new Float32Array(4), noShadow: false });
    } catch (e) {
      var msg = String(e && e.message || e);
      if (root.console) console.error(e);
      hud.fatal(msg === 'WEBGL2_UNAVAILABLE'
        ? '이 브라우저는 WebGL2를 지원하지 않아요. 최신 Chrome · Edge · Safari · Firefox에서 index.html을 열어 주세요.'
        : '초기화 중 문제가 생겼어요: ' + msg.split('\n')[0]);
      return;
    }
    try { var bv = parseFloat(root.localStorage.getItem('sundrift.best')); if (bv > 0) G.bestEver = bv; } catch (e2) { /* no storage */ }
    input.attach();
    wireUI();
    G.toTitle();
    hud.show('loading', false);
    hud.muted(audio.muted);
    G.lastNow = performance.now();
    if (!TEST) root.requestAnimationFrame(G.frame);
    root.__ready = true;
  };

  function wireUI() {
    var e = hud.el;
    function click(el, fn) { if (el) el.addEventListener('click', function (ev) { ev.preventDefault(); el.blur(); fn(); }); }
    click(e['btn-start'], function () { G.start(); });
    click(e['btn-again'], function () { G.start(); });
    click(e['btn-title'], function () { audio.play('click'); G.toTitle(); });
    click(e['btn-resume'], function () { G.setPaused(false); });
    click(e['btn-restart'], function () { G.start(); });
    click(e['btn-quit'], function () { G.toTitle(); });
    Array.prototype.forEach.call(e.diff.querySelectorAll('button'), function (b) {
      click(b, function () { setDifficulty(parseInt(b.getAttribute('data-diff'), 10)); });
    });
    input.on(function (a) {
      if (a === 'mute') { audio.setMuted(!audio.muted); hud.muted(audio.muted); return; }
      if (a === 'fullscreen') { toggleFullscreen(); return; }
      if (G.state === 'title') {
        if (a === 'confirm' || a === 'confirm-soft') G.start();
        else if (a === 'left') setDifficulty(Math.max(0, G.difficulty - 1));
        else if (a === 'right') setDifficulty(Math.min(2, G.difficulty + 1));
      } else if (G.state === 'results') {
        if (a === 'confirm' || a === 'restart') G.start();
        else if (a === 'pause') G.toTitle();
      } else if (G.state === 'race' || G.state === 'countdown') {
        if (a === 'pause') G.setPaused(!G.paused);
        else if (G.paused && a === 'confirm') G.setPaused(false);
        else if (G.paused && a === 'restart') G.start();
      } else if (G.state === 'finish') {
        if (a === 'confirm' && G.finishT > 1.2) showResults();
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && !TEST && (G.state === 'race' || G.state === 'countdown')) G.setPaused(true);
    });
    root.addEventListener('resize', function () { if (G.state !== 'title' && G.state !== 'loading') hud.setTrack(G.track); });
    G.R.canvas.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();
      G.lost = true;
      hud.fatal('그래픽 장치가 초기화됐어요. 페이지를 새로고침(F5 / ⌘R)해 주세요.');
    });
    // browsers only allow sound after a gesture: wake the audio engine on the first click / key press
    function wake() {
      audio.init(); audio.resume();
      if (G.state === 'title' && audio.ready && !G.titleMusic) { G.titleMusic = true; audio.musicStart(0); }
    }
    root.addEventListener('pointerdown', wake, { passive: true });
    root.addEventListener('keydown', wake);
  }
  function toggleFullscreen() {
    var d = document, el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else {
        var rq = el.requestFullscreen || el.webkitRequestFullscreen;
        if (rq) { var pr = rq.call(el); if (pr && pr.catch) pr.catch(function () { /* denied */ }); }
      }
    } catch (e) { /* fullscreen unavailable */ }
  }
  function setDifficulty(d) {
    if (d === G.difficulty) return;
    G.difficulty = d;
    Array.prototype.forEach.call(hud.el.diff.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', parseInt(b.getAttribute('data-diff'), 10) === d);
    });
    audio.play('select');
  }

  // ================================================================= states
  G.newRace = function () {
    G.race = new SD.Race(G.track, { laps: 3, difficulty: G.difficulty, seed: ((Math.random() * 1e9) | 0) + 1 });
    G.player = G.race.player;
    for (var i = 0; i < G.race.karts.length; i++) {
      G.race.karts[i].fx = { smoke: 0, spark: 0, flame: 0, dust: 0, skid: [null, null] };
    }
    G.fxAdd.clear(); G.fxAlpha.clear(); G.skid.clear();
    G.lights[0] = G.lights[1] = G.lights[2] = 0;
    G.countShown = 9; G.wrongT = 0; G.finishT = 0; G.confetti = 0; G.driftTip = false;
    cam.yaw = G.player.course; cam.y = G.player.y; cam.boost = 0; cam.roll = 0; cam.shake = 0; cam.pitch = 0;
    hud.buildBoard(G.race.karts);
    hud.wrongWay(false);
  };

  G.toTitle = function () {
    G.newRace();
    G.race.time = 0;                                   // attract mode: the field races on its own behind the menu
    G.state = 'title'; G.paused = false;
    hud.show('title', true); hud.show('hud', false); hud.show('results', false); hud.show('pause', false); hud.show('count', false);
    G.titleMusic = false;
    if (audio.ready) { audio.musicStart(0); G.titleMusic = true; } // mellow groove (bass + chords) behind the menu
    G.fade = 0;
  };

  G.start = function () {
    audio.init(); audio.resume();
    audio.play('select');
    G.newRace();
    G.state = 'countdown'; G.paused = false;
    hud.show('title', false); hud.show('results', false); hud.show('pause', false); hud.show('hud', true); hud.show('count', false);
    hud.setTrack(G.track);
    hud.update(G.race, G.player, 0);
    audio.musicStart(0);
    G.fade = 0;
  };

  G.setPaused = function (p) {
    if (G.state !== 'race' && G.state !== 'countdown') p = false;
    G.paused = p;
    hud.show('pause', p);
    if (p) { audio.musicPause(true); audio.update({ on: false, speed: 0, throttle: 0, boost: 0, drift: 0, offroad: false, charge: -1 }); }
    else { audio.musicPause(false); G.lastNow = performance.now(); }
    audio.play('click');
  };

  function showResults() {
    if (G.state === 'results') return;
    G.state = 'results';
    var res = G.race.results(), pos = 1, i;
    for (i = 0; i < res.length; i++) if (res[i].isPlayer) pos = res[i].pos;
    var best = G.player.bestLap, record = best < G.bestEver;
    if (record) { G.bestEver = best; try { root.localStorage.setItem('sundrift.best', String(best)); } catch (e) { /* no storage */ } }
    hud.show('hud', false);
    hud.results(res, pos, best, record && isFinite(best));
  }

  // ================================================================= simulation
  G.tick = function (dt) {
    G.time += dt;
    G.fade = Math.min(1, G.fade + dt * 1.6);
    var inp = input.poll(), race = G.race, p = G.player, st = G.state, i;

    if (st === 'title' && race.player.finished) { G.newRace(); race = G.race; p = G.player; race.time = 0; }
    if (st !== 'loading') {
      var before = race.time;
      // physics in small steps for stability at any frame rate
      var steps = Math.max(1, Math.ceil(dt / (1 / 100))), h = dt / steps;
      for (i = 0; i < steps; i++) {
        race.update(h, inp, G.autopilot || st === 'title');
        if (i === 0) inp.boost = false;
      }
      if (st === 'countdown') countdown(before, race.time, inp);
    }
    if (st === 'title') {
      for (i = 0; i < race.karts.length; i++) kartEvents(race.karts[i]);
    } else if (st === 'race' || st === 'finish' || st === 'results') {
      for (i = 0; i < race.karts.length; i++) kartEvents(race.karts[i]);
      raceEvents();
      // first-timer nudge: explain drifting on the way into the hairpin
      if (p.drifting) G.everDrifted = true;
      if (st === 'race' && !G.everDrifted && !G.driftTip && !G.autopilot) {
        var toT2 = G.track.delta(G.track.sOf('t2', 0), p.s);
        if (toT2 > 8 && toT2 < 55) { G.driftTip = true; hud.tip('코너에서 SPACE + 방향키 = 드리프트!'); }
      }
      if (st === 'race' && G.lights[0] === 2 && G.time - G.goAt > 2.4) G.lights[0] = G.lights[1] = G.lights[2] = 0;
      // wrong way?
      var ti = p.ti, fwd = Math.cos(p.course - G.track.hd[ti]);
      if (st === 'race' && fwd < -0.35 && Math.abs(p.speed) > 2) G.wrongT += dt; else G.wrongT = 0;
      hud.wrongWay(G.wrongT > 1.0);
    }
    if (st === 'finish') {
      G.finishT += dt;
      celebrate(dt);
      if (G.finishT > 5.2) showResults();
    } else if (st === 'results') {
      celebrate(dt);
    }
    for (i = 0; i < race.karts.length; i++) race.karts[i].events.length = 0;
    race.events.length = 0;

    G.fxAdd.update(dt); G.fxAlpha.update(dt);
    updateCamera(dt);
    buildDraws(dt);

    var onStraight = Math.abs(G.track.delta(p.s, G.track.sOf('main', 0.5))) < 70;
    G.crowd = SD.damp(G.crowd, (st === 'finish' || st === 'results') ? 1.25 : (onStraight || st === 'countdown' ? 1.0 : 0.55), 2, dt);

    if (st !== 'title') hud.update(race, p, dt);
    var racing = (st === 'race' || st === 'countdown' || st === 'finish') && !G.paused;
    audio.update({
      on: racing, speed: Math.abs(p.speed) / C.topSpeed, throttle: st === 'finish' ? 0.2 : inp.throttle, boost: cam.boost,
      drift: p.drifting && p.grounded ? SD.clamp01(0.45 + Math.abs(p.slip)) : 0, offroad: p.offroad,
      charge: p.drifting && st === 'race' ? (p.stock >= C.maxStock ? 1 : p.gauge) : -1
    });
  };

  function countdown(t0, t1, inp) {
    var n = Math.ceil(-t1);                       // 3, 2, 1 while waiting, 0 at GO
    if (t1 >= 0) {
      G.lights[0] = G.lights[1] = G.lights[2] = 2;
      hud.count('GO!', true);
      audio.play('go');
      audio.musicStart(1);                           // the tune proper kicks in on GO
      G.state = 'race';
      G.goAt = G.time;
      // rocket start: throttle pressed just before the lights go green
      var since = performance.now() - input.throttleDownAt;
      if (!G.autopilot && inp.throttle > 0.5 && since >= 0 && since < 430) {
        G.player.boostT = C.startBoostTime;
        hud.message('로켓 스타트!', 'gold');
        hud.flash(true);
        audio.play('rocket');
        cam.shake = 0.5;
      }
      return;
    }
    if (n <= 3 && n !== G.countShown) {
      G.countShown = n;
      hud.count(String(n), false);
      audio.play('beep');
      G.lights[0] = n <= 3 ? 1 : 0; G.lights[1] = n <= 2 ? 1 : 0; G.lights[2] = n <= 1 ? 1 : 0;
      if (n === 3) hud.tip('신호가 바뀌기 직전에 ↑ 를 누르면 로켓 스타트!');
    }
  }

  function raceEvents() {
    var ev = G.race.events, p = G.player;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'bump') {
        if (e.a === p || e.b === p) { audio.play('bump'); cam.shake = Math.max(cam.shake, 0.25); }
        var mx = (e.a.x + e.b.x) / 2, mz = (e.a.z + e.b.z) / 2;
        for (var q = 0; q < 6; q++) G.fxAdd.spawn(mx, e.a.y + 0.5, mz, rnd(-5, 5), rnd(1, 5), rnd(-5, 5), rnd(0.2, 0.4), 0.1, 0.02, 1, 0.8, 0.4, 1, 1, 1, 12, e.a.y);
      } else if (e.type === 'lap' && e.kart === p) {
        if (e.lap === G.race.laps) {
          hud.message('FINAL LAP!', 'pink', '랩 타임 ' + SD.fmtTime(e.time));
          audio.play('final'); audio.musicLevel(2, 1.08);
        } else {
          hud.message('LAP ' + e.lap, '', '랩 타임 ' + SD.fmtTime(e.time));
          audio.play('lap');
        }
      } else if (e.type === 'finish' && e.kart === p) {
        G.state = 'finish'; G.finishT = 0;
        hud.message(e.pos === 1 ? '1등 골인!' : 'FINISH!', 'gold', e.pos + '위 · ' + SD.fmtTime(e.time));
        hud.flash(true);
        audio.musicStop(0.5);
        audio.play('finish');
        cam.orbit = 0;
        G.confetti = 3.2;
      }
    }
  }

  function kartEvents(k) {
    var ev = k.events, isP = k.isPlayer && G.state !== 'title', i, q;
    for (i = 0; i < ev.length; i++) {
      var e = ev[i];
      switch (e.type) {
        case 'driftStart': if (isP) audio.play('driftStart'); break;
        case 'stock':
          if (isP) {
            audio.play('stock'); hud.flash(true);
            if (!G.hintShown) { G.hintShown = true; hud.message('부스터 충전 완료!', 'gold', 'SHIFT 를 눌러 발사!'); }
          }
          for (q = 0; q < 22; q++) {
            var a = q / 22 * SD.TAU;
            G.fxAdd.spawn(k.x, k.y + 0.7, k.z, Math.sin(a) * 7 + Math.sin(k.course) * k.speed, rnd(0.5, 2.5), Math.cos(a) * 7 + Math.cos(k.course) * k.speed,
              0.42, 0.34, 0.05, 1, 0.85, 0.3, 1, 3, 2.5, 0);
          }
          break;
        case 'boost':
          if (isP) { audio.play('boost'); hud.flash(false); cam.shake = Math.max(cam.shake, 0.55); }
          burstBehind(k, 34, 0.45, 0.85, 1.0);
          break;
        case 'kick': if (isP) audio.play('kick'); burstBehind(k, 10, 1.0, 0.6, 0.25); break;
        case 'pad': if (isP) { audio.play('pad'); hud.flash(false); cam.shake = Math.max(cam.shake, 0.3); } burstBehind(k, 16, 0.3, 0.95, 1.0); break;
        case 'wall':
          if (isP) { audio.play('wall', e.v); cam.shake = Math.max(cam.shake, 0.35 + e.v * 0.6); }
          for (q = 0; q < 10 + e.v * 14; q++) {
            G.fxAdd.spawn(e.x, k.y + rnd(0.2, 0.8), e.z, rnd(-6, 6) + Math.sin(k.course) * k.speed * 0.5, rnd(1, 6), rnd(-6, 6) + Math.cos(k.course) * k.speed * 0.5,
              rnd(0.25, 0.5), 0.1, 0.02, 1, rnd(0.6, 0.9), 0.3, 1, 1, 0.8, 14, k.y);
          }
          for (q = 0; q < 4; q++) G.fxAlpha.spawn(e.x, k.y + 0.5, e.z, rnd(-2, 2), rnd(0.5, 2), rnd(-2, 2), rnd(0.5, 0.9), 0.4, 1.6, 0.9, 0.9, 0.9, 0.4, 0, 1.5, -0.5);
          break;
        case 'land': if (isP && e.v > 3) audio.play('land'); break;
        default: break;
      }
    }
  }
  function burstBehind(k, n, r, g, b) {
    var hx = Math.sin(k.course + k.slip), hz = Math.cos(k.course + k.slip), vx = Math.sin(k.course) * k.speed, vz = Math.cos(k.course) * k.speed;
    for (var q = 0; q < n; q++) {
      G.fxAdd.spawn(k.x - hx * 1.4 + rnd(-0.3, 0.3), k.y + 0.6 + rnd(-0.1, 0.2), k.z - hz * 1.4 + rnd(-0.3, 0.3),
        vx * 0.6 - hx * rnd(2, 9) + rnd(-3, 3), rnd(-0.5, 3), vz * 0.6 - hz * rnd(2, 9) + rnd(-3, 3), rnd(0.2, 0.5), rnd(0.3, 0.6), 0.04, r, g, b, 1, 3, 2, 0);
    }
  }
  var CONF = [[1, 0.25, 0.3], [1, 0.8, 0.15], [0.25, 0.85, 1], [0.45, 0.95, 0.4], [1, 0.45, 0.8], [1, 1, 1], [0.6, 0.45, 1]];
  function celebrate(dt) {
    if (G.confetti <= 0) return;
    G.confetti -= dt;
    var p = G.player, n = Math.round(dt * 150);
    for (var q = 0; q < n; q++) {
      var c = CONF[(Math.random() * CONF.length) | 0];
      G.fxAlpha.spawn(p.x + rnd(-9, 9), p.y + rnd(6, 10), p.z + rnd(-9, 9), rnd(-2, 2) + Math.sin(p.course) * p.speed * 0.8, rnd(-1, 2), rnd(-2, 2) + Math.cos(p.course) * p.speed * 0.8,
        rnd(2.2, 3.6), 0.16, 0.16, c[0], c[1], c[2], 1, 2, 0.9, 3.2, p.y + 0.05);
    }
  }

  // ================================================================= camera
  function updateCamera(dt) {
    var k = G.player, st = G.state, t = G.track;
    var sf = SD.clamp01(Math.abs(k.speed) / C.topSpeed), b = k.boostAmount();
    cam.boost = SD.damp(cam.boost, b, b > cam.boost ? 10 : 2.4, dt);
    cam.shake = Math.max(0, cam.shake - dt * 1.6);
    var yaw, dist, h, look = 5.2, fov;
    if (st === 'title') {
      cam.orbit += dt * 0.11;
      cam.y = SD.damp(cam.y, k.y, 5, dt);
      cam.yaw = SD.dampAngle(cam.yaw, k.course, 2.2, dt);
      var oa = cam.yaw + cam.orbit, rr = 11.5 + Math.sin(cam.orbit * 0.6) * 2.5, hh = 5.2 + Math.sin(cam.orbit * 0.43) * 1.6;
      var tx = k.x - Math.sin(oa) * rr, tz = k.z - Math.cos(oa) * rr, ty = Math.max(cam.y + hh, G.world.heightAt(tx, tz) + 2.2);
      cam.eye[0] = tx; cam.eye[1] = ty; cam.eye[2] = tz;
      cam.target[0] = k.x; cam.target[1] = cam.y + 0.9; cam.target[2] = k.z;
      cam.fov = 52 * DEG; cam.roll = 0;
      cam.focus[0] = k.x; cam.focus[1] = k.y; cam.focus[2] = k.z;
      return;
    }
    cam.y = SD.damp(cam.y, k.y, 10, dt);
    cam.pitch = SD.damp(cam.pitch, k.groundPitch, 3.5, dt);
    if (st === 'countdown') {
      var u = SD.smoothstep(-SD.COUNTDOWN, -0.3, G.race.time);
      yaw = k.course + (1 - u) * 2.55;
      cam.yaw = k.course;
      dist = SD.lerp(7.6, 6.3, u); h = SD.lerp(1.5, 2.75, u); look = SD.lerp(0.5, 5.2, u);
      fov = SD.lerp(48, 60, u) * DEG;
    } else if (st === 'finish' || st === 'results') {
      cam.orbit += dt * 0.5;
      yaw = k.course + Math.PI * 0.82 + Math.sin(cam.orbit * 0.5) * 0.9;
      dist = 7.2; h = 2.2; look = 0;
      fov = 52 * DEG;
    } else {
      cam.yaw = SD.dampAngle(cam.yaw, k.course + k.slip * 0.34, 5.2 + sf * 2.6, dt);
      yaw = cam.yaw;
      dist = 6.3 + sf * 0.5 + cam.boost * 1.15; h = 2.75 - cam.boost * 0.18;
      fov = (60 + sf * 9 + cam.boost * 15) * DEG;
    }
    cam.fov = SD.damp(cam.fov, fov, 5.5, dt);
    cam.roll = SD.damp(cam.roll, st === 'race' ? -k.yawRate * 0.03 * sf : 0, 4, dt);
    var dx = Math.sin(yaw), dz = Math.cos(yaw);
    var sh = cam.shake + cam.boost * 0.045;
    var ex = k.x - dx * dist + (Math.random() - 0.5) * sh * 0.5, ez = k.z - dz * dist + (Math.random() - 0.5) * sh * 0.5;
    var ey = cam.y + h - Math.tan(cam.pitch) * dist * 0.55 + (Math.random() - 0.5) * sh * 0.4;
    var floor = G.world.heightAt(ex, ez) + 1.25;
    if (ey < floor) ey = floor;
    cam.eye[0] = ex; cam.eye[1] = ey; cam.eye[2] = ez;
    cam.target[0] = k.x + dx * look; cam.target[1] = cam.y + 1.0 + Math.tan(cam.pitch) * look * 0.7; cam.target[2] = k.z + dz * look;
    cam.focus[0] = k.x + dx * 24; cam.focus[1] = k.y; cam.focus[2] = k.z + dz * 24;
  }

  // ================================================================= draw list + per-kart effects
  var W = SD.KART.wheels, WR = SD.KART.wheelR, EX = SD.KART.exhaust, HD = SD.KART.head;
  function buildDraws(dt) {
    var karts = G.race.karts, n = 0, i, w, d;
    for (i = 0; i < karts.length; i++) {
      var k = karts[i], ms = G.meshes[i], yaw = k.course + k.slip;
      M.fromPose(mCh, k.x, k.y, k.z, yaw, -k.groundPitch, k.groundRoll);
      // body (leans and squats on top of the chassis)
      M.copy(mBody, mCh);
      M.translate(mBody, mBody, 0, 0.3 + k.hop, 0);
      M.rotateX(mBody, mBody, k.pitch); M.rotateZ(mBody, mBody, k.roll);
      M.translate(mBody, mBody, 0, -0.3, 0);
      if (!k.isPlayer) {                                     // a rival sitting on the lens would block the whole view
        var cdx = k.x - cam.eye[0], cdz = k.z - cam.eye[2];
        if (cdx * cdx + cdz * cdz < 9.5) { if (!G.paused) kartFx(k, dt); continue; }
      }
      var tintA = k.boostAmount() * 0.1;
      d = G.draws[n++]; d.mesh = ms.body; d.m.set(mBody); d.tint[0] = 0.3; d.tint[1] = 0.7; d.tint[2] = 1; d.tint[3] = tintA;
      d = G.draws[n++]; d.mesh = ms.head;
      M.translate(d.m, mBody, HD[0], HD[1], HD[2]); M.rotateY(d.m, d.m, k.headYaw); M.rotateZ(d.m, d.m, -k.roll * 0.6);
      d.tint[3] = 0;
      for (w = 0; w < 4; w++) {
        d = G.draws[n++]; d.mesh = w < 2 ? ms.wheelF : ms.wheelR;
        M.translate(d.m, mCh, W[w][0], W[w][1] + k.hop * 0.35, W[w][2]);
        if (w < 2) M.rotateY(d.m, d.m, k.steerVis);
        M.rotateX(d.m, d.m, k.wheelSpin / WR[w]);
        d.tint[3] = 0;
      }
      if (!G.paused) kartFx(k, dt);
    }
    G.drawCount = n;
  }

  function sparkColor(g, out) {           // matches the HUD gauge gradient: cyan -> violet -> pink
    if (g < 0.55) { var a = g / 0.55; out[0] = 0.22 + a * 0.2; out[1] = 0.9 - a * 0.35; out[2] = 1; }
    else { var b2 = (g - 0.55) / 0.45; out[0] = 0.42 + b2 * 0.58; out[1] = 0.55 - b2 * 0.3; out[2] = 1 - b2 * 0.4; }
    return out;
  }
  var colTmp = [0, 0, 0];
  function kartFx(k, dt) {
    var fx = k.fx, sp = Math.abs(k.speed), vx = Math.sin(k.course) * k.speed, vz = Math.cos(k.course) * k.speed, w, p, q;
    var lx = mCh[0], ly = mCh[1], lz = mCh[2];                      // kart's left axis in world space
    if (k.drifting && k.grounded) {
      var g = k.stock >= C.maxStock ? 1 : k.gauge;
      sparkColor(g, colTmp);
      fx.smoke += dt * (10 + sp * 0.45);
      fx.spark += dt * (26 + g * 34);
      while (fx.smoke >= 1) {
        fx.smoke -= 1;
        p = M.point(mCh, Math.random() < 0.5 ? 0.75 : -0.75, 0.12, -0.8);
        G.fxAlpha.spawn(p[0], p[1], p[2], vx * 0.12 + rnd(-1.2, 1.2), rnd(0.4, 1.4), vz * 0.12 + rnd(-1.2, 1.2), rnd(0.5, 0.95), 0.32, rnd(1.2, 1.9), 0.95, 0.95, 0.97, 0.36, 0, 1.4, -0.7);
      }
      while (fx.spark >= 1) {
        fx.spark -= 1;
        var side = Math.random() < 0.5 ? 1 : -1;
        p = M.point(mCh, side * 0.78, 0.06, -0.86);
        var out = -k.driftDir * rnd(1, 5);
        G.fxAdd.spawn(p[0], p[1], p[2], vx * 0.35 + lx * out + rnd(-1.5, 1.5), rnd(1.2, 4.6), vz * 0.35 + lz * out + rnd(-1.5, 1.5),
          rnd(0.24, 0.5), 0.135, 0.03, colTmp[0], colTmp[1], colTmp[2], 1, 1, 0.6, 13, k.y + 0.02);
      }
      // tyre marks
      for (w = 0; w < 2; w++) {
        p = M.point(mCh, w === 0 ? 0.75 : -0.75, 0.035, -0.72);
        var prev = fx.skid[w];
        if (!prev) { fx.skid[w] = { x: p[0], y: p[1], z: p[2], lx: lx, lz: lz, a: 0 }; continue; }
        var ddx = p[0] - prev.x, ddz = p[2] - prev.z;
        if (ddx * ddx + ddz * ddz > 0.3) {
          var hw = 0.17, a1 = Math.min(0.5, prev.a + 0.14);
          G.skid.add(prev.x + prev.lx * hw, prev.y, prev.z + prev.lz * hw, prev.x - prev.lx * hw, prev.y, prev.z - prev.lz * hw,
            p[0] + lx * hw, p[1], p[2] + lz * hw, p[0] - lx * hw, p[1], p[2] - lz * hw, prev.a, a1);
          prev.x = p[0]; prev.y = p[1]; prev.z = p[2]; prev.lx = lx; prev.lz = lz; prev.a = a1;
        }
      }
    } else {
      fx.skid[0] = fx.skid[1] = null;
    }
    // booster / kick / pad flames from the exhausts
    var ba = k.boostAmount();
    if (ba > 0) {
      var blue = k.boostT > 0 || k.padT > 0;
      fx.flame += dt * (blue ? 110 : 60);
      while (fx.flame >= 1) {
        fx.flame -= 1;
        var ex = EX[(Math.random() * 2) | 0];
        p = M.point(mBody, ex[0], ex[1], ex[2] - 0.05);
        var hot = Math.random();
        if (blue) q = [0.35 + hot * 0.5, 0.75 + hot * 0.2, 1.0]; else q = [1.0, 0.55 + hot * 0.35, 0.15 + hot * 0.2];
        G.fxAdd.spawn(p[0], p[1], p[2], vx * 0.6 + rnd(-0.5, 0.5), rnd(-0.2, 0.7), vz * 0.6 + rnd(-0.5, 0.5), rnd(0.09, 0.2) * (0.7 + ba * 0.5), 0.2 * (0.7 + ba * 0.45), 0.03,
          q[0], q[1], q[2], 0.5, 3, 0.4, -1.2);
      }
    }
    // dust off the tarmac
    if (k.offroad && sp > 7 && k.grounded) {
      fx.dust += dt * 16;
      while (fx.dust >= 1) {
        fx.dust -= 1;
        p = M.point(mCh, rnd(-0.8, 0.8), 0.15, -0.8);
        G.fxAlpha.spawn(p[0], p[1], p[2], vx * 0.2 + rnd(-1.5, 1.5), rnd(0.6, 2), vz * 0.2 + rnd(-1.5, 1.5), rnd(0.5, 0.9), 0.3, rnd(1.1, 1.8), 0.78, 0.7, 0.5, 0.4, 0, 1.3, -0.3);
      }
    }
  }

  // ================================================================= frame
  G.render = function () {
    var f = scene.fx;
    G.R.resize();
    scene.time = G.time;
    // narrow windows: widen the vertical field of view so the horizontal one stays playable
    var asp = G.R.canvas.width / Math.max(1, G.R.canvas.height);
    scene.cam.fov = asp < 1.4 ? 2 * Math.atan(Math.tan(cam.fov / 2) * Math.min(2.1, 1.4 / asp)) : cam.fov;
    scene.cam.roll = cam.roll;
    scene.drawCount = G.drawCount;
    var sf = SD.clamp01(Math.abs(G.player.speed) / (C.topSpeed * 1.35));
    var racing = G.state === 'race';
    f.blur = racing ? cam.boost * 0.062 : 0;
    f.lines = racing ? SD.clamp01(cam.boost * 0.95 + Math.max(0, sf - 0.7) * 0.5) : 0;
    f.tint = racing ? cam.boost * 0.7 : 0;
    f.fade = G.fade;
    f.crowd = G.crowd;
    G.R.render(scene);
  };

  G.frame = function (now) {
    if (G.lost) return;
    root.requestAnimationFrame(G.frame);
    var raw = now - G.lastNow;
    G.lastNow = now;
    if (raw > 0 && raw < 250) G.R.adapt(raw);
    var dt = Math.min(0.05, Math.max(0.0005, raw / 1000));
    if (!G.paused) G.tick(dt);
    G.render();
  };

  /* Test hooks (used by the headless harness; harmless in normal play). */
  SD.debug = {
    run: function (seconds, fps) {
      var n = Math.round(seconds * (fps || 60));
      for (var i = 0; i < n; i++) G.tick(1 / (fps || 60));
      G.render();
      return SD.debug.info();
    },
    info: function () {
      var p = G.player, r = G.race;
      return { state: G.state, t: +r.time.toFixed(2), rank: p.rank, lap: r.lapOf(p), speed: +p.speed.toFixed(1), s: +p.s.toFixed(0), d: +p.d.toFixed(1),
        gauge: +p.gauge.toFixed(2), stock: p.stock, drift: p.drifting, boostT: +Math.max(0, p.boostT).toFixed(2),
        partsAdd: G.fxAdd.n, partsAlpha: G.fxAlpha.n, skid: G.skid.used, glErr: G.R.gl.getError(), q: G.R.quality, res: G.R.T.w + 'x' + G.R.T.h };
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { root.setTimeout(G.init, 40); });
  else root.setTimeout(G.init, 40);
})(window);
