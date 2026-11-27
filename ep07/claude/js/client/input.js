/* 해돌전쟁 — 입력: 마우스 선택/명령, 키보드 단축키, 화면 이동 */
'use strict';
(function (g0) {
  var R = g0.RTS, TILE = R.TILE;
  var In = R.Input = { edgeScroll: true };
  try { var es = localStorage.getItem('haedol.edge'); if (es !== null) In.edgeScroll = es === '1'; } catch (e) { /* 무시 */ }
  In.setEdgeScroll = function (v) { In.edgeScroll = !!v; try { localStorage.setItem('haedol.edge', v ? '1' : '0'); } catch (e) { /* 무시 */ } };

  var keys = {}, lastClick = { t: 0, id: 0 }, lastTap = { n: -1, t: 0 }, mmDrag = false, panDrag = null, idleIdx = 0;
  var winMouse = { x: -1, y: -1, inside: false };

  function overlayOpen() {
    return !document.getElementById('menu').classList.contains('hidden') || !document.getElementById('pause').classList.contains('hidden') ||
      !document.getElementById('help').classList.contains('hidden') || !document.getElementById('result').classList.contains('hidden');
  }
  function playable(G) { return G && !G.demo && G.human >= 0 && !G.ended; }

  In.select = function (G, ids) {
    G.selection = ids.slice(0, 240); G.selSet = new Set(G.selection); G.card = 'main';
    if (G.mode) In.setMode(G, null);
  };
  In.prune = function (G) {
    var W = G.world, out = null;
    for (var i = 0; i < G.selection.length; i++) {
      var e = W.byId.get(G.selection[i]);
      if (!e || e.dead) { out = G.selection.filter(function (id) { var x = W.byId.get(id); return x && !x.dead; }); break; }
    }
    if (out) { G.selection = out; G.selSet = new Set(out); if (!out.length && G.mode && G.mode.cmd !== 'power') In.setMode(G, null); }
  };
  In.setMode = function (G, mode) {
    G.mode = mode;
    G.canvas.classList.toggle('c-target', !!mode && mode.type === 'target');
    G.canvas.classList.toggle('c-place', !!mode && mode.type === 'place');
  };
  In.centerOn = function (G, x, y) { G.cam.x = x; G.cam.y = y; G.autoCam = false; clampCam(G); };

  function clampCam(G) {
    var W = G.world, hw = G.vw / 2 / G.cam.zoom, hh = G.vh / 2 / G.cam.zoom, m = (G.demo ? -30 : 60) / G.cam.zoom, hud = (G.demo ? 0 : 200) / G.cam.zoom;
    if (hw * 2 >= W.pw + m * 2) G.cam.x = W.pw / 2; else G.cam.x = R.clamp(G.cam.x, hw - m, W.pw - hw + m);
    if (hh * 2 >= W.ph + m * 2 + hud) G.cam.y = W.ph / 2; else G.cam.y = R.clamp(G.cam.y, hh - m - 44 / G.cam.zoom, W.ph - hh + m + hud);
  }
  In.clampCam = clampCam;

  function selEnts(G) {
    var out = [], W = G.world;
    for (var i = 0; i < G.selection.length; i++) { var e = W.byId.get(G.selection[i]); if (e && !e.dead) out.push(e); }
    return out;
  }
  function ownUnitIds(G) {
    return selEnts(G).filter(function (e) { return e.kind === 'unit' && e.team === G.human; }).map(function (e) { return e.id; });
  }

  /* ── 집기 ── */
  In.pick = function (G, wx, wy) {
    var W = G.world, vt = W.teams[G.viewTeam], all = !!vt.revealAll, best = null, bs = 1e9, i;
    for (i = 0; i < W.units.length; i++) {
      var u = W.units[i];
      if (u.dead) continue;
      if (!all && u.team !== G.viewTeam && !vt.visible[W.cellAt(u.x, u.y)]) continue;
      var uy = u.y - (u.layer === 2 ? R.Render.ALT : 0);
      var d = R.dist(wx, wy, u.x, uy);
      if (d > u.r + (u.team === G.human ? 11 : 6)) continue;
      var s = d - (u.team === G.human ? 8 : 0) - (u.layer === 2 ? 5 : 0);
      if (s < bs) { bs = s; best = u; }
    }
    if (best) return best;
    for (i = 0; i < W.buildings.length; i++) {
      var b = W.buildings[i];
      if (b.dead) continue;
      if (!all && b.team !== G.viewTeam && !(b.seen & (1 << G.viewTeam))) continue;
      if (Math.abs(wx - b.x) <= b.w * TILE / 2 && Math.abs(wy - b.y) <= b.h * TILE / 2) return b;
    }
    for (i = 0; i < W.nodes.length; i++) {
      var n = W.nodes[i];
      if (n.dead || (!all && !vt.explored[W.cellAt(n.x, n.y)])) continue;
      if (Math.abs(wx - n.x) <= n.w * TILE / 2 + 5 && Math.abs(wy - n.y) <= n.h * TILE / 2 + 5) return n;
    }
    return null;
  };

  function selSound(G, e) {
    if (e.team === G.human) R.Audio.play('sel_' + e.def.faction, 0.8);
    else R.Audio.play('click', 0.6);
  }

  function clickSelect(G, wx, wy, shift) {
    var W = G.world, e = In.pick(G, wx, wy), now = performance.now();
    if (!e) { if (!shift) In.select(G, []); return; }
    var dbl = now - lastClick.t < 330 && lastClick.id === e.id;
    lastClick.t = now; lastClick.id = e.id;
    if (e.team !== G.human || e.kind === 'node') { In.select(G, [e.id]); selSound(G, e); return; }
    if (dbl) {
      // 화면 안의 같은 종류 모두
      var hw = G.vw / 2 / G.cam.zoom, hh = G.vh / 2 / G.cam.zoom, ids = [];
      var list = e.kind === 'unit' ? W.units : W.buildings;
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (!o.dead && o.team === G.human && o.type === e.type && Math.abs(o.x - G.cam.x) < hw && Math.abs(o.y - G.cam.y) < hh) ids.push(o.id);
      }
      In.select(G, ids);
    } else if (shift && G.selection.length) {
      var cur = selEnts(G);
      if (cur.length && cur[0].team === G.human && cur[0].kind === e.kind && (e.kind === 'unit' || cur[0].type === e.type)) {
        if (G.selSet.has(e.id)) In.select(G, G.selection.filter(function (id) { return id !== e.id; }));
        else In.select(G, G.selection.concat([e.id]));
      } else In.select(G, [e.id]);
    } else In.select(G, [e.id]);
    selSound(G, e);
  }

  function boxSelect(G, d, shift) {
    var W = G.world, a = R.Render.s2w(G, Math.min(d.x0, d.x1), Math.min(d.y0, d.y1)), b = R.Render.s2w(G, Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
    var ids = [], i;
    if (G.human < 0) return;
    for (i = 0; i < W.units.length; i++) {
      var u = W.units[i];
      if (u.dead || u.team !== G.human) continue;
      var uy = u.y - (u.layer === 2 ? R.Render.ALT : 0);
      if (u.x >= a.x - u.r * 0.5 && u.x <= b.x + u.r * 0.5 && uy >= a.y - u.r * 0.5 && uy <= b.y + u.r * 0.5) ids.push(u.id);
    }
    if (ids.length) {
      if (shift) { var cur = ownUnitIds(G); ids.forEach(function (id) { if (cur.indexOf(id) < 0) cur.push(id); }); ids = cur; }
      In.select(G, ids);
      R.Audio.play('sel_' + W.byId.get(ids[0]).def.faction, 0.8);
      return;
    }
    var type = null;
    for (i = 0; i < W.buildings.length; i++) {
      var bd = W.buildings[i];
      if (bd.dead || bd.team !== G.human) continue;
      if (bd.x >= a.x && bd.x <= b.x && bd.y >= a.y && bd.y <= b.y) { if (!type) type = bd.type; if (bd.type === type) ids.push(bd.id); }
    }
    if (ids.length) { In.select(G, ids); R.Audio.play('sel_' + W.byId.get(ids[0]).def.faction, 0.8); }
    else if (!shift) In.select(G, []);
  }

  /* ── 명령 ── */
  function feedback(G, kind, x, y) {
    var f = G.world.teams[G.human].faction;
    if (kind === 'attack') { G.fx.mark(x, y, '#ff5a4a'); R.Audio.play('atk', 0.8); }
    else if (kind === 'gather') { G.fx.mark(x, y, '#ffd23f'); R.Audio.play('ack_' + f, 0.7); }
    else if (kind === 'repair' || kind === 'construct') { G.fx.mark(x, y, '#6ab8ff'); R.Audio.play('ack_' + f, 0.7); }
    else { G.fx.mark(x, y, '#7dff6a'); R.Audio.play('ack_' + f, 0.7); }
  }

  In.rightClick = function (G, wx, wy, shift) {
    if (G.mode) { In.setMode(G, null); return; }
    if (!playable(G)) return;
    var W = G.world, sel = selEnts(G);
    if (!sel.length || sel[0].team !== G.human) return;
    var target = In.pick(G, wx, wy);
    if (sel[0].kind === 'unit') {
      var kind = R.Cmd.smart(W, G.human, ownUnitIds(G), wx, wy, target, shift);
      if (kind) feedback(G, kind, target && kind !== 'move' ? target.x : wx, target && kind !== 'move' ? target.y : wy);
    } else if (sel[0].kind === 'building') {
      var bids = sel.filter(function (b) { return b.kind === 'building' && b.def.produces; }).map(function (b) { return b.id; });
      if (bids.length) {
        var nodeId = target && target.kind === 'node' ? target.id : 0;
        R.Cmd.setRally(W, G.human, bids, nodeId ? target.x : wx, nodeId ? target.y : wy, nodeId);
        G.fx.mark(wx, wy, '#ffcf4a'); R.Audio.play('click');
      }
    }
  };

  function targetClick(G, wx, wy, shift) {
    var W = G.world, m = G.mode, ids = ownUnitIds(G), target = In.pick(G, wx, wy);
    if (m.cmd === 'power') {
      // 진영 기술: 고른 유닛과 상관없이 찍은 자리에 쓴다. 안 보이는 곳을 찍었으면 조준을 유지한다
      var pr = R.Cmd.power(W, G.human, wx, wy);
      if (pr.err) { R.UI.error(G, pr.err); if (pr.err.code !== 'novision') In.setMode(G, null); return; }
      In.setMode(G, null);
      return;
    }
    if (!ids.length) { In.setMode(G, null); return; }
    if (m.cmd === 'attack') {
      if (target && target.kind !== 'node' && target.team !== G.human) { R.Cmd.attack(W, G.human, ids, target.id, shift); feedback(G, 'attack', target.x, target.y); }
      else { R.Cmd.attackMove(W, G.human, ids, wx, wy, shift); feedback(G, 'attack', wx, wy); }
    } else if (m.cmd === 'repair') {
      if (target && target.team === G.human && R.Cmd.repair(W, G.human, ids, target.id, shift)) feedback(G, 'repair', target.x, target.y);
      else if (target && target.team === G.human && target.kind === 'building' && !target.built && R.Cmd.construct(W, G.human, ids, target.id, shift)) feedback(G, 'construct', target.x, target.y);
      else { R.UI.msg('고칠 수 있는 아군 건물이나 기계를 찍으세요', 'err'); R.Audio.play('error'); return; }
    }
    if (!shift) In.setMode(G, null);
  }

  function placeClick(G, wx, wy, shift) {
    var W = G.world, m = G.mode, def = R.BUILDINGS[m.btype], s = def.size;
    var tx = Math.round(wx / TILE - s / 2), ty = Math.round(wy / TILE - s / 2);
    var cx = (tx + s / 2) * TILE, cy = (ty + s / 2) * TILE;
    var workers = selEnts(G).filter(function (e) { return e.kind === 'unit' && e.team === G.human && e.def.worker; });
    if (!workers.length) { In.setMode(G, null); return; }
    // 가장 한가하고 가까운 일꾼에게 맡긴다
    var best = null, bs = 1e12;
    workers.forEach(function (u) {
      var busy = (u.order.type === 'build' || u.order.type === 'construct' ? 1 : 0) + u.queue.length;
      var sc = R.dist(u.x, u.y, cx, cy) + busy * 2000;
      if (sc < bs) { bs = sc; best = u; }
    });
    var queued = shift && (best.order.type === 'build' || best.order.type === 'construct');
    var r = R.Cmd.build(W, G.human, best.id, m.btype, tx, ty, queued);
    if (r.err) { R.UI.error(G, r.err); return; }
    R.Audio.play('place'); G.fx.mark(cx, cy, '#6ab8ff');
    if (!shift) { In.setMode(G, null); G.card = 'main'; }
  }

  /* ── 편의 기능 ── */
  // 진영 기술 조준 시작 (다시 누르면 취소)
  In.powerMode = function (G) {
    if (!playable(G)) return;
    if (G.mode && G.mode.cmd === 'power') { In.setMode(G, null); return; }
    var err = R.Powers.check(G.world, G.world.teams[G.human]);
    if (err) { R.UI.error(G, err); return; }
    In.setMode(G, { type: 'target', cmd: 'power' });
    R.Audio.play('click');
  };
  // 일꾼을 고르지 않고 B를 눌렀을 때: 마우스에서 가장 가까운(되도록 한가한) 일꾼을 골라 건설 메뉴를 연다
  In.quickBuild = function (G) {
    if (!playable(G) || G.card === 'build') return false;
    var W = G.world, ref = G.mouse.inside ? R.Render.s2w(G, G.mouse.x, G.mouse.y) : { x: G.cam.x, y: G.cam.y }, best = null, bs = 1e12;
    for (var i = 0; i < W.units.length; i++) {
      var u = W.units[i];
      if (u.dead || u.team !== G.human || !u.def.worker) continue;
      var t = u.order.type;
      var sc = R.dist(u.x, u.y, ref.x, ref.y) + (t === 'idle' ? -300 : 0) + (u.carry ? 120 : 0) + (t === 'build' || t === 'construct' || t === 'repair' ? 4000 : 0) + (t === 'gather' && u.order.rtype === 'dew' ? 200 : 0);
      if (sc < bs) { bs = sc; best = u; }
    }
    if (!best) { R.UI.msg('일꾼이 없습니다', 'err'); R.Audio.play('error'); return true; }
    In.select(G, [best.id]); G.card = 'build';
    R.Audio.play('sel_' + best.def.faction, 0.8);
    return true;
  };
  In.idleWorker = function (G, allIdle) {
    if (!playable(G)) return;
    var W = G.world, idle = W.units.filter(function (u) { return !u.dead && u.team === G.human && u.def.worker && u.order.type === 'idle'; });
    if (!idle.length) { R.UI.msg('쉬는 일꾼이 없습니다'); return; }
    if (allIdle) { In.select(G, idle.map(function (u) { return u.id; })); In.centerOn(G, idle[0].x, idle[0].y); }
    else { idleIdx = (idleIdx + 1) % idle.length; In.select(G, [idle[idleIdx].id]); In.centerOn(G, idle[idleIdx].x, idle[idleIdx].y); }
    R.Audio.play('sel_' + idle[0].def.faction, 0.8);
  };
  In.selectArmy = function (G) {
    if (!playable(G)) return;
    var ids = G.world.units.filter(function (u) { return !u.dead && u.team === G.human && !u.def.worker; }).map(function (u) { return u.id; });
    if (!ids.length) { R.UI.msg('전투 유닛이 없습니다'); return; }
    In.select(G, ids);
    R.Audio.play('sel_' + G.world.teams[G.human].faction, 0.8);
  };
  function group(G, n, e) {
    var now = performance.now();
    if (e.ctrlKey || e.altKey) {
      if (G.selection.length && selEnts(G)[0] && selEnts(G)[0].team === G.human) { G.groups[n] = G.selection.slice(); R.UI.msg(n + '번 부대 지정'); R.Audio.play('click'); }
      return;
    }
    var ids = (G.groups[n] || []).filter(function (id) { var x = G.world.byId.get(id); return x && !x.dead; });
    G.groups[n] = ids;
    if (!ids.length) return;
    if (e.shiftKey) {
      // 지금 고른 것 중 내 것이면서 같은 종류(유닛끼리, 건물끼리)인 것에만 더한다. 자원이나 적을 골라 둔 상태면 부대만 고른다
      var kind = G.world.byId.get(ids[0]).kind;
      var cur = selEnts(G).filter(function (x) { return x.team === G.human && x.kind === kind; }).map(function (x) { return x.id; });
      ids.forEach(function (id) { if (cur.indexOf(id) < 0) cur.push(id); });
      In.select(G, cur);
      return;
    }
    if (lastTap.n === n && now - lastTap.t < 350) {
      var cx = 0, cy = 0;
      ids.forEach(function (id) { var x = G.world.byId.get(id); cx += x.x; cy += x.y; });
      In.centerOn(G, cx / ids.length, cy / ids.length);
    }
    lastTap.n = n; lastTap.t = now;
    In.select(G, ids);
    R.Audio.play('sel_' + G.world.teams[G.human].faction, 0.7);
  }

  // 부대 번호 표시줄을 눌렀을 때 (숫자 키와 같은 동작)
  In.pickGroup = function (G, n, shift) { if (playable(G)) group(G, n, { ctrlKey: false, altKey: false, shiftKey: !!shift }); };

  /* ── 이벤트 연결 (한 번만) ── */
  In.attach = function (canvas, mm) {
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    // 화면 어디서든 오른쪽 클릭이 브라우저 기본 메뉴를 띄우지 않게 한다 (오른쪽 클릭은 게임 명령이다. HUD 패널 위로 빗나가도 메뉴가 뜨면 안 된다)
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    canvas.addEventListener('mousedown', function (e) {
      var G = R.game;
      if (!G || G.demo) return;
      R.Audio.resume();
      var p = pos(e), w = R.Render.s2w(G, p.x, p.y);
      var right = e.button === 2 || (e.button === 0 && e.ctrlKey && /Mac/.test(navigator.platform || ''));
      e.preventDefault();
      if (e.button === 1) { panDrag = { x: e.clientX, y: e.clientY, cx: G.cam.x, cy: G.cam.y }; return; }
      var chain = e.shiftKey || e.altKey;        // 명령 이어 붙이기: Shift 또는 Alt (파이어폭스는 Shift+오른쪽 클릭에 브라우저 메뉴를 띄운다)
      if (right) { In.rightClick(G, w.x, w.y, chain); return; }
      if (e.button !== 0) return;
      if (G.mode && playable(G)) {
        if (G.mode.type === 'place') placeClick(G, w.x, w.y, chain); else targetClick(G, w.x, w.y, chain);
        return;
      }
      G.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, active: false, shift: e.shiftKey };
    });
    g0.addEventListener('mousemove', function (e) {
      var G = R.game;
      winMouse.x = e.clientX; winMouse.y = e.clientY; winMouse.inside = true;
      if (!G) return;
      var p = pos(e);
      G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.inside = e.target === canvas;
      if (panDrag) { G.cam.x = panDrag.cx - (e.clientX - panDrag.x) / G.cam.zoom; G.cam.y = panDrag.cy - (e.clientY - panDrag.y) / G.cam.zoom; G.autoCam = false; clampCam(G); }
      if (G.drag) {
        G.drag.x1 = p.x; G.drag.y1 = p.y;
        if (Math.abs(G.drag.x1 - G.drag.x0) + Math.abs(G.drag.y1 - G.drag.y0) > 7) G.drag.active = true;
      }
      if (mmDrag) mmMove(G, e);
    });
    g0.addEventListener('mouseup', function (e) {
      var G = R.game;
      if (e.button === 1) panDrag = null;
      if (e.button === 0) mmDrag = false;
      if (!G || !G.drag || e.button !== 0) return;
      var d = G.drag; G.drag = null;
      if (d.active) boxSelect(G, d, e.shiftKey);
      else { var w = R.Render.s2w(G, d.x0, d.y0); clickSelect(G, w.x, w.y, e.shiftKey); }
    });
    document.addEventListener('mouseleave', function () { winMouse.inside = false; });
    document.addEventListener('mouseenter', function () { winMouse.inside = true; });
    canvas.addEventListener('wheel', function (e) {
      var G = R.game;
      if (!G || G.demo) return;
      e.preventDefault();
      var p = pos(e), before = R.Render.s2w(G, p.x, p.y);
      var dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      G.cam.zoom = R.clamp(G.cam.zoom * Math.exp(-dy * 0.0016), 0.5, 1.7);
      var after = R.Render.s2w(G, p.x, p.y);
      G.cam.x += before.x - after.x; G.cam.y += before.y - after.y;
      G.autoCam = false; clampCam(G);
    }, { passive: false });

    // 미니맵
    function mmWorld(G, e) { var r = mm.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * G.world.pw, y: (e.clientY - r.top) / r.height * G.world.ph }; }
    function mmMove(G, e) { var w = mmWorld(G, e); In.centerOn(G, R.clamp(w.x, 0, G.world.pw), R.clamp(w.y, 0, G.world.ph)); }
    mm.addEventListener('mousedown', function (e) {
      var G = R.game;
      if (!G) return;
      e.preventDefault(); e.stopPropagation();
      var w = mmWorld(G, e);
      if (e.button === 0) {
        if (G.mode && G.mode.type === 'target' && playable(G)) { targetClick(G, w.x, w.y, e.shiftKey || e.altKey); return; }
        mmDrag = true; mmMove(G, e);
      } else if (e.button === 2 && playable(G)) {
        var ids = ownUnitIds(G);
        if (ids.length) { R.Cmd.move(G.world, G.human, ids, w.x, w.y, e.shiftKey || e.altKey); R.Audio.play('ack_' + G.world.teams[G.human].faction, 0.7); G.pings.push({ x: w.x, y: w.y, t: G.time, col: '#7dff6a' }); }
      }
    });

    g0.addEventListener('keydown', function (e) {
      var G = R.game, code = e.code;
      if (e.metaKey) return;
      if (code === 'Escape' && e.repeat) { e.preventDefault(); return; }     // 꾹 눌러도 한 번만
      if (code === 'Escape') {
        if (!document.getElementById('help').classList.contains('hidden')) { document.getElementById('help').classList.add('hidden'); e.preventDefault(); return; }
        if (!document.getElementById('pause').classList.contains('hidden')) { R.Main.togglePause(); e.preventDefault(); return; }
      }
      if (!G || G.demo || overlayOpen()) return;
      if (code.indexOf('Arrow') === 0) { keys[code] = true; G.autoCam = false; e.preventDefault(); return; }
      if (e.repeat) { if (code !== 'Tab') e.preventDefault(); return; }
      var handled = true;
      if (code === 'Escape') {
        // 취소할 것부터 차례로: 조준·배치 → 건설 메뉴 → 선택 해제 → (아무것도 없으면) 일시 정지
        if (G.mode) In.setMode(G, null);
        else if (G.card === 'build') G.card = 'main';
        else if (G.selection.length && playable(G)) In.select(G, []);
        else R.Main.togglePause();
      } else if (code === 'KeyP' || code === 'Pause') R.Main.togglePause();
      else if (code === 'Space') { if (G.alertPos) In.centerOn(G, G.alertPos.x, G.alertPos.y); else if (G.human < 0) G.autoCam = true; }
      else if (code === 'Home' || code === 'Backspace') { var t = G.world.teams[G.human >= 0 ? G.human : 0]; In.centerOn(G, t.startX, t.startY); }
      else if (code === 'Backquote' || code === 'F1') In.idleWorker(G, e.shiftKey || e.ctrlKey);
      else if (code === 'F2' || (code === 'KeyA' && (e.ctrlKey || e.altKey))) In.selectArmy(G);
      else if (/^Digit[1-9]$/.test(code)) { if (playable(G)) group(G, +code.charAt(5), e); }
      else if (playable(G) && !e.ctrlKey && !e.altKey) {
        handled = R.UI.hotkey(G, code, e.shiftKey);
        if (!handled && code === 'KeyF') { In.powerMode(G); handled = true; }
        if (!handled && code === 'KeyB') handled = In.quickBuild(G);
      }
      else handled = false;
      if (handled) e.preventDefault();
    });
    g0.addEventListener('keyup', function (e) { keys[e.code] = false; });
    g0.addEventListener('blur', function () { keys = {}; panDrag = null; mmDrag = false; winMouse.inside = false; if (R.game) R.game.drag = null; });
  };

  // 화면 이동 (방향키, 가장자리)
  In.update = function (G, dt) {
    if (G.demo) return;
    var sp = 950 / G.cam.zoom * dt, dx = 0, dy = 0;
    if (keys.ArrowLeft) dx -= 1; if (keys.ArrowRight) dx += 1; if (keys.ArrowUp) dy -= 1; if (keys.ArrowDown) dy += 1;
    // 마우스가 실제로 움직여 좌표를 알게 된 뒤에만 (창에 들어왔다는 신호만 받고 좌표가 아직 -1이면 왼쪽 위 가장자리로 착각해 화면이 저절로 흘러간다)
    if (In.edgeScroll && winMouse.inside && winMouse.x >= 0 && winMouse.y >= 0 && !overlayOpen() && document.hasFocus() && !panDrag) {
      var m = 6;
      if (winMouse.x <= m) dx -= 1; else if (winMouse.x >= g0.innerWidth - m - 1) dx += 1;
      if (winMouse.y <= m) dy -= 1; else if (winMouse.y >= g0.innerHeight - m - 1) dy += 1;
    }
    if (dx || dy) { G.cam.x += dx * sp; G.cam.y += dy * sp; G.autoCam = false; }
    clampCam(G);
    // 마우스 아래의 개체 (테두리 강조, 커서 모양)
    var hover = null;
    if (G.mouse.inside && !(G.drag && G.drag.active) && !panDrag && !overlayOpen()) {
      var w = R.Render.s2w(G, G.mouse.x, G.mouse.y);
      hover = In.pick(G, w.x, w.y);
    }
    G.hoverId = hover ? hover.id : 0;
    var foe = !!hover && playable(G) && !G.mode && hover.kind !== 'node' && hover.team !== G.human && ownUnitIds(G).length > 0;
    if (foe !== G.hoverFoe) { G.hoverFoe = foe; G.canvas.classList.toggle('c-foe', foe); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
