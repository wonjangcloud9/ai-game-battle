/* 해돌전쟁 — 시작과 게임 루프 */
'use strict';
(function (g0) {
  var R = g0.RTS, TILE = R.TILE, UI = R.UI;
  var Main = R.Main = {};
  var canvas, mm, lastT = 0, acc = 0, lastOpts = null, frameNo = 0, resultTimer = 0;

  function resize() {
    var dpr = Math.min(2, g0.devicePixelRatio || 1);
    canvas.width = Math.floor(g0.innerWidth * dpr); canvas.height = Math.floor(g0.innerHeight * dpr);
    var G = R.game;
    if (G) { G.dpr = dpr; G.vw = g0.innerWidth; G.vh = g0.innerHeight; R.Input.clampCam(G); }
    if (mm) { mm.width = 172 * dpr; mm.height = 172 * dpr; }
  }

  /* opts: { players:[{faction, ai?, name?}], human: 팀 번호(-1이면 관전), seed, mapSize, demo } */
  Main.newGame = function (opts) {
    lastOpts = opts;
    clearTimeout(resultTimer);
    var W = R.createGame({ seed: opts.seed, mapSize: opts.mapSize, players: opts.players, keepEvents: true });
    var human = opts.human;
    if (human < 0) { W.teams.forEach(function (t) { t.revealAll = true; }); W.updateFog(); }
    var dpr = Math.min(2, g0.devicePixelRatio || 1);
    // 화면이 클수록 조금 더 가까이: 세로로 약 24타일이 보이게 맞춘다
    var baseZoom = R.clamp(g0.innerHeight / 760, 1, 1.5);
    var G = R.game = {
      world: W, human: human, viewTeam: human >= 0 ? human : 0, canvas: canvas, ctx: canvas.getContext('2d'),
      dpr: dpr, vw: g0.innerWidth, vh: g0.innerHeight, cam: { x: 0, y: 0, zoom: opts.demo ? baseZoom * 0.8 : baseZoom },
      terrain: new R.Terrain(W.map), fx: new R.FX(),
      selection: [], selSet: new Set(), groups: {}, mode: null, drag: null, card: 'main',
      mouse: { x: 0, y: 0, inside: false }, pings: [], time: 0, paused: false, speed: 1,
      ended: false, demo: !!opts.demo, autoCam: human < 0, focus: null, alertPos: null, combatT: -99, blockT: -99,
      mm: mm, mmCtx: mm.getContext('2d'), mmSize: 172, guideOff: false, showScore: human < 0
    };
    R.Input.setMode(G, null);                       // 지난 판의 배치/표적 커서가 남지 않게
    canvas.classList.remove('c-foe');
    var st = W.teams[G.viewTeam];
    G.cam.x = st.startX; G.cam.y = st.startY;
    R.Input.clampCam(G);
    G.terrain.warm(opts.demo ? 3 : 6, G.cam.x, G.cam.y);
    R.Render.init(G);
    UI.reset();
    UI.showHud(!opts.demo);
    document.getElementById('hud').classList.toggle('spectate', human < 0);
    acc = 0;
    document.getElementById('btn-speed').textContent = '1×';
    if (!opts.demo) {
      document.documentElement.style.setProperty('--accent', human >= 0 ? W.teams[human].fdef.ui.accent : '#ffd23f');
      R.Audio.music(human >= 0 ? W.teams[human].faction : W.teams[0].faction);
      if (human >= 0) {
        var enemies = W.teams.filter(function (t) { return t.id !== human; }).map(function (t) { return t.fdef.name; }).join(', ');
        UI.msg(W.teams[human].fdef.name + ' vs ' + enemies + ' — ' + R.DIFFICULTY[W.teams[1].level].name, 'good');
      } else UI.msg('관전 모드 — Space: 자동 카메라', 'good');
    }
    return G;
  };

  function pickEnemy(mine, n, rng) {
    var others = R.FACTION_IDS.filter(function (f) { return f !== mine; });
    if (UI.opt.enemy !== 'random') return UI.opt.enemy;
    return n < 2 ? others[n % 2 === rng ? 0 : 1] : R.FACTION_IDS[(rng + n) % 3];
  }

  Main.startFromMenu = function (watch) {
    var o = UI.opt, players = [], seed = (Math.random() * 1e9) | 0, coin = seed % 2;
    var names = ['', '컴퓨터 1', '컴퓨터 2', '컴퓨터 3'];
    if (watch) {
      var fs = R.FACTION_IDS.slice();
      for (var i = 0; i <= o.count; i++) players.push({ faction: i === 0 ? o.faction : (o.enemy !== 'random' ? o.enemy : fs[(R.FACTION_IDS.indexOf(o.faction) + i) % 3]), ai: o.level, name: '컴퓨터 ' + (i + 1) });
    } else {
      players.push({ faction: o.faction, name: '나' });
      for (var k = 0; k < o.count; k++) players.push({ faction: pickEnemy(o.faction, k, coin), ai: o.level, name: o.count > 1 ? names[k + 1] : '컴퓨터' });
    }
    players.forEach(function (p) { if (p.ai !== undefined) p.name += ' · ' + R.FACTIONS[p.faction].name; });
    UI.showMenu(false); UI.hideOverlays();
    Main.newGame({ players: players, human: watch ? -1 : 0, seed: seed, mapSize: o.size });
  };
  Main.restart = function () {
    if (!lastOpts || lastOpts.demo) return Main.toMenu();
    UI.hideOverlays();
    var o = {}; for (var k in lastOpts) o[k] = lastOpts[k];
    o.seed = (Math.random() * 1e9) | 0;
    Main.newGame(o);
  };
  Main.toMenu = function () {
    UI.hideOverlays();
    startDemo();
    UI.showMenu(true);
    R.Audio.music('menu');
  };
  Main.togglePause = function () {
    var G = R.game;
    if (!G || G.demo) return;
    G.paused = !G.paused;
    UI.showPause(G, G.paused);
  };
  Main.cycleSpeed = function () {
    var G = R.game;
    if (!G) return;
    G.speed = G.speed === 1 ? 1.5 : (G.speed === 1.5 ? 2 : 1);
    document.getElementById('btn-speed').textContent = G.speed + '×';
    R.Audio.play('click');
  };
  Main.spectateRest = function () {
    var G = R.game, W = G.world;
    G.human = -1; G.showScore = true; G.autoCam = true;
    G.guideOff = true; G.alertPos = null;           // 길잡이를 치우고, Space는 다시 자동 카메라로
    document.getElementById('guide').classList.add('hidden');
    document.getElementById('hud').classList.add('spectate');
    R.Input.setMode(G, null);
    UI.invalidate();
    W.teams.forEach(function (t) { t.revealAll = true; });
    W.updateFog();
    R.Input.select(G, []);
    R.Render.init(G);
  };

  function startDemo() {
    var fs = R.FACTION_IDS.slice(), a = (Math.random() * 3) | 0, b = (a + 1 + ((Math.random() * 2) | 0)) % 3;
    Main.newGame({ players: [{ faction: fs[a], ai: 2 }, { faction: fs[b], ai: 2 }], human: -1, seed: (Math.random() * 1e9) | 0, mapSize: 'small', demo: true });
    R.game.speed = 1;
  }

  /* ── 시뮬레이션 이벤트를 소리·이펙트·알림으로 ── */
  function handleEvents(G) {
    var W = G.world, evs = W.events, vt = W.teams[G.viewTeam], all = !!vt.revealAll;
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i], mine = ev.team === G.human;
      var vis = all || ev.x === undefined || vt.visible[W.cellAt(ev.x, ev.y)] === 1 || (mine && ev.t !== 'death');
      switch (ev.t) {
        case 'alert':
          if (mine) {
            G.alertPos = { x: ev.x, y: ev.y };
            G.pings.push({ x: ev.x, y: ev.y, t: G.time, col: '#ff4a3a' });
            UI.msg(ev.building ? '기지가 공격받고 있습니다! (Space)' : '아군이 공격받고 있습니다! (Space)', 'warn');
            R.Audio.play('alert', 0.8);
          }
          break;
        case 'error': if (mine) UI.error(G, { code: ev.code }); break;
        case 'built':
          if (mine) { UI.msg(R.BUILDINGS[ev.type].name + ' 완성', 'good'); R.Audio.play('built_' + R.BUILDINGS[ev.type].faction, 0.9); }
          break;
        case 'unitReady': if (mine) R.Audio.play('ready', 0.45); break;
        case 'researched': if (mine) { UI.msg(R.UPGRADES[ev.id].name + ' 연구 완료', 'good'); R.Audio.play('research'); } break;
        case 'eliminated': if (!G.demo) UI.msg(W.teams[ev.team].name + ' 탈락!', ev.team === G.human ? 'err' : 'good'); break;
        case 'death':
          if (mine && ev.kind === 'building') UI.msg(R.BUILDINGS[ev.type].name + ' 파괴됨', 'err');
          break;
        case 'depleted':
          if (vis && !G.demo && G.human >= 0) UI.msg(R.NODES[ev.type].name + ' 고갈', 'warn');
          break;
        case 'power':
          var pdef = R.POWERS[W.teams[ev.team].faction];
          if (mine) { UI.msg(pdef.name + '!', 'good'); R.Audio.play('pw_' + ev.id, 1); }
          else if (vis && !G.demo) {
            R.Audio.at('pw_' + ev.id, ev.x, ev.y, G, 1.2);
            if (G.human >= 0) { UI.msg('적의 ' + pdef.name + '!', 'warn'); G.pings.push({ x: ev.x, y: ev.y, t: G.time, col: '#ffb347' }); }
          }
          break;
        case 'rankup':
          if (mine) {
            G.fx.text(ev.x, ev.y - 24, '진급 ' + '★'.repeat(ev.rank), '#ffe27a'); R.Audio.at('rank', ev.x, ev.y, G, 0.9);
            if (!G.rankTold) { G.rankTold = true; UI.msg('유닛이 진급했습니다 — 적을 잡을수록 더 세고 단단해집니다', 'good'); }
          }
          break;
        case 'blocked':
          // 생산 건물이 보급에 막힌 순간 한 번 알린다 (너무 자주 울리지 않게 간격을 둔다)
          if (mine && G.time - G.blockT > 16) {
            G.blockT = G.time;
            var sn = R.BUILDINGS[W.teams[G.human].fdef.supply].name;
            UI.msg(ev.max ? '보급 한도 ' + R.MAX_SUPPLY + '에 도달했습니다' : '보급이 부족해 생산이 멈췄습니다 — ' + R.josa(sn, '을', '를') + ' 지으세요', 'warn');
            UI.flashRes('supply'); R.Audio.play('supply', 0.9);
          }
          break;
      }
      if (ev.t === 'shot') {
        // 쏜 쪽이 안개 속이어도 맞는 쪽이 보이면 낙뢰 예고·번개 줄기는 보여야 한다 (ev.sv: 쏜 자리가 보이는가)
        ev.sv = vis;
        if (!vis && ev.tx !== undefined && vt.visible[W.cellAt(ev.tx, ev.ty)] === 1) vis = true;
      }
      if (ev.t === 'shot' || ev.t === 'boom') {
        if (vis) G.combatT = G.time;
        G.focus = { x: ev.x, y: ev.y, t: G.time };
      }
      if (vis && ev.x !== undefined) {
        G.fx.onEvent(ev, W);
        if (!G.demo) R.Audio.onEvent(ev, G);
      }
    }
    evs.length = 0;
  }

  // 굴뚝 연기, 부서져 가는 건물의 불꽃 같은 분위기 연출
  var CHIM = { furnace: [[30, 30], [-30, 30], [30, -30], [-30, -30]], assembly: [[28, -2]], foundry: [[30, -28]], boiler: [[23, 15]] };
  function ambient(G) {
    var W = G.world, vt = W.teams[G.viewTeam], all = !!vt.revealAll, hw = G.vw / 2 / G.cam.zoom + 80, hh = G.vh / 2 / G.cam.zoom + 80;
    for (var zi = 0; zi < W.zones.length; zi++) {
      var z = W.zones[zi];
      if (Math.abs(z.x - G.cam.x) > hw + z.r || Math.abs(z.y - G.cam.y) > hh + z.r) continue;
      if (!all && z.team !== G.viewTeam && !vt.visible[W.cellAt(z.x, z.y)]) continue;
      for (var zk = 0; zk < 3; zk++) {
        var za = Math.random() * 6.2832, zr = Math.sqrt(Math.random()) * z.r, zx = z.x + Math.cos(za) * zr, zy = z.y + Math.sin(za) * zr;
        if (z.id === 'bloom') G.fx.add(R.FX.SPARK, zx, zy, 0, -34 - Math.random() * 30, 0.9, 1.7, zk ? '#b8ff9a' : '#f4ffd0', { drag: 0.4 });       // 피어오르는 빛
        else if (z.id === 'tempest') G.fx.add(R.FX.SPARK, zx + 20, zy - 60, -110, 330, 0.2, 1.1, '#9fb6e8', { high: true });                      // 비
      }
    }
    for (var i = 0; i < W.buildings.length; i++) {
      var b = W.buildings[i];
      if (b.dead || Math.abs(b.x - G.cam.x) > hw || Math.abs(b.y - G.cam.y) > hh) continue;
      if (!all && b.team !== G.viewTeam && !W.rectVisible(vt, b)) continue;
      var ch = CHIM[b.type];
      if (ch && b.built && Math.random() < (b.queue.length ? 0.5 : 0.22)) {
        var c = ch[(Math.random() * ch.length) | 0];
        G.fx.add(R.FX.SMOKE, b.x + c[0], b.y + c[1], 8 + Math.random() * 8, -22 - Math.random() * 14, 1.5, 3.5, b.type === 'boiler' ? '#d9dee6' : '#3c3833', { grow: 9, a: b.type === 'boiler' ? 0.3 : 0.4, high: true });
      }
      if (b.built && b.hp < b.maxHp * 0.5 && Math.random() < 0.4) {
        var s = b.w * TILE * 0.35, x = b.x + (Math.random() - 0.5) * 2 * s, y = b.y + (Math.random() - 0.5) * 2 * s;
        G.fx.add(R.FX.SMOKE, x, y, 6, -30, 1.2, 4, '#26221e', { grow: 10, a: 0.5, high: true });
        if (b.hp < b.maxHp * 0.3) G.fx.add(R.FX.SPARK, x, y, (Math.random() - 0.5) * 50, -40 - Math.random() * 50, 0.5, 2.2, b.def.faction === 'storm' ? '#fff7b0' : '#ff9a3a', { drag: 1 });
      }
      if (!b.built && W.teams[b.team].fdef.buildStyle === 'stay' && b.builders > 0 && Math.random() < 0.3) {
        var s2 = b.w * TILE * 0.5;
        G.fx.sparks(b.x + (Math.random() - 0.5) * 2 * s2, b.y + (Math.random() - 0.5) * 2 * s2, 2, 80, '#ffe9a8', 0.25);
      }
    }
  }

  function autoCamera(G, dt) {
    var W = G.world, tx, ty;
    if (G.focus && G.time - G.focus.t < 5) { tx = G.focus.x; ty = G.focus.y; }
    else {
      // 싸움이 없으면 군대나 기지를 천천히 둘러본다
      var alive = W.teams.filter(function (t) { return t.alive; });
      if (!alive.length) return;
      var t = alive[Math.floor(G.time / 9) % alive.length], sx = 0, sy = 0, n = 0;
      for (var i = 0; i < W.units.length; i++) { var u = W.units[i]; if (u.team === t.id && !u.def.worker && !u.dead) { sx += u.x; sy += u.y; n++; } }
      if (n >= 3) { tx = sx / n; ty = sy / n; } else { tx = t.startX; ty = t.startY; }
    }
    var k = Math.min(1, dt * 1.1);
    G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
    R.Input.clampCam(G);
  }

  // 상대 기지를 처음 찾았을 때 알린다
  function scout(G) {
    var W = G.world, bit = 1 << G.human;
    if (!G.found) G.found = {};
    for (var i = 0; i < W.buildings.length; i++) {
      var b = W.buildings[i];
      if (b.dead || b.team === G.human || G.found[b.team] || !(b.seen & bit)) continue;
      G.found[b.team] = true;
      UI.msg(W.teams[b.team].name + '의 기지를 찾았습니다!', 'good');
      G.pings.push({ x: b.x, y: b.y, t: G.time, col: R.TEAM_COLORS[W.teams[b.team].color].light });
      R.Audio.play('research', 0.6);
    }
  }

  function endCheck(G) {
    var W = G.world;
    if (G.ended) {
      if (G.demo && W.over && !G.demoRestart) { G.demoRestart = true; setTimeout(function () { if (R.game === G) startDemo(); }, 4000); }
      if (!G.demo && G.human < 0 && W.over && !G.finalShown) { G.finalShown = true; resultTimer = setTimeout(function () { if (R.game === G) UI.showResult(G, 'done'); }, 1500); }
      return;
    }
    var kind = null;
    if (G.human >= 0 && !W.teams[G.human].alive) kind = 'lose';
    else if (W.over) kind = G.human < 0 ? 'done' : (W.winner === G.human ? 'win' : 'lose');
    if (!kind) return;
    G.ended = true;
    if (G.demo) return;
    if (kind === 'done') G.finalShown = true;
    R.Input.setMode(G, null);
    R.Audio.setIntensity(0);
    R.Audio.stopMusic();
    R.Audio.play(kind === 'lose' ? 'defeat' : 'victory', 1);
    resultTimer = setTimeout(function () { if (R.game === G) UI.showResult(G, kind); }, 1600);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var G = R.game;
    if (!G) return;
    var dt = Math.max(0, Math.min(0.1, (now - lastT) / 1000));
    lastT = now; frameNo++;
    G.time += dt;
    if (!G.paused) {
      acc += dt * G.speed;
      var steps = 0;
      while (acc >= R.DT && steps < 6) { G.world.step(); handleEvents(G); acc -= R.DT; steps++; }
      if (steps >= 6) acc = 0;
      G.fx.update(dt);
      if (frameNo % 4 === 0) ambient(G);
      if (G.autoCam) autoCamera(G, dt);
    }
    R.Input.update(G, dt);
    R.Input.prune(G);
    G.terrain.warm(1);
    R.Render.draw(G, G.paused ? 1 : acc / R.DT);
    if (!G.demo) {
      if (frameNo % 3 === 0) R.Render.drawMinimap(G);
      UI.update(G);
      if (frameNo % 30 === 0) { R.Audio.setIntensity(G.time - G.combatT < 5 ? 1 : 0.25); if (G.human >= 0 && !G.ended) scout(G); }
    }
    endCheck(G);
  }

  Main.init = function () {
    canvas = document.getElementById('game');
    mm = document.getElementById('minimap');
    resize();
    g0.addEventListener('resize', resize);
    UI.initMenu();
    R.Input.attach(canvas, mm);
    document.addEventListener('visibilitychange', function () {
      var G = R.game;
      if (document.hidden && G && !G.demo && !G.paused && !G.ended) Main.togglePause();
    });
    // 첫 클릭에서 소리 켜기 (브라우저 정책)
    var unlock = function () { R.Audio.resume(); if (R.game && R.game.demo) R.Audio.music('menu'); };
    g0.addEventListener('pointerdown', unlock, { once: true });
    g0.addEventListener('keydown', unlock, { once: true });

    // 주소 뒤에 ?auto=1&f=forge&e=storm&d=1&n=1&size=small&seed=7&watch=1 을 붙이면 메뉴를 건너뛴다 (시험용)
    var q = {};
    (g0.location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[p[0]] = decodeURIComponent(p[1] || ''); });
    if (q.auto) {
      var n = Math.max(1, Math.min(3, +(q.n || 1))), players = [], watch = !!q.watch, lvl = q.d === undefined ? 1 : +q.d;
      var mine = R.FACTIONS[q.f] ? q.f : 'forge';
      players.push(watch ? { faction: mine, ai: lvl, name: '컴퓨터 1 · ' + R.FACTIONS[mine].name } : { faction: mine, name: '나' });
      for (var i = 0; i < n; i++) { var ef = R.FACTIONS[q.e] ? q.e : R.FACTION_IDS[(R.FACTION_IDS.indexOf(mine) + 1 + i) % 3]; players.push({ faction: ef, ai: lvl, name: '컴퓨터 ' + (i + (watch ? 2 : 1)) + ' · ' + R.FACTIONS[ef].name }); }
      UI.showMenu(false);
      Main.newGame({ players: players, human: watch ? -1 : 0, seed: +(q.seed || 12345), mapSize: q.size || 'medium' });
    } else {
      startDemo();
      UI.showMenu(true);
    }
    lastT = performance.now();
    requestAnimationFrame(frame);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Main.init);
  else Main.init();
})(typeof globalThis !== 'undefined' ? globalThis : this);
