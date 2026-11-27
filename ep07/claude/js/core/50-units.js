/* 해돌전쟁 — 유닛: 명령 수행, 이동, 채집, 건설, 전투, 투사체 */
'use strict';
(function (g) {
  var R = g.RTS, TILE = R.TILE, DT = R.DT;
  var Units = R.Units = {};
  var tmp = [], tmp2 = [];
  var AP = { x: 0, y: 0 };

  function idle() { return { type: 'idle' }; }

  Units.spawn = function (W, type, teamId, x, y, supplied) {
    var def = R.UNITS[type];
    var u = {
      id: W.nextId++, kind: 'unit', type: type, def: def, team: teamId,
      x: x, y: y, px: x, py: y, vx: 0, vy: 0, dirX: 0, dirY: 0,
      angle: 0, aim: 0, face: 0, faceLock: false, aimLock: false,
      r: def.r, hp: def.hp, maxHp: def.hp,
      layer: def.layer === 'air' ? 2 : (def.layer === 'hover' ? 1 : 0),
      order: idle(), queue: [],
      cd: 0, charge: 99, carry: null,
      wpNext: 0, wpKey: '', wpX: x, wpY: y, wpState: 0,
      lastHit: -99, lastAtk: -99, atkTick: -99, hitTick: -99,
      moving: false, working: false, ghost: false, weight: 1,
      ignoreId: 0, ignoreUntil: 0, kills: 0, rank: 0, dead: false, tag: 0
    };
    W.units.push(u); W.byId.set(u.id, u);
    if (!supplied) W.teams[teamId].supplyUsed += def.supply;
    return u;
  };

  Units.speedOf = function (W, u) {
    var team = W.teams[u.team];
    var sp = u.def.speed * ((team.upg.spc && team.faction === 'forge') ? 1.15 : 1);
    // 공격대는 가장 느린 유닛에 발을 맞춘다 (싸우는 중에는 제 속도)
    if (u.cap && u.cap < sp && u.order.type === 'amove' && !u.order.targetId) sp = u.cap;
    return sp;
  };

  Units.canHit = function (u, t) {
    var w = u.def.weapon;
    if (!w || !t || t.kind === 'node') return false;
    if (t.kind === 'unit' && t.layer === 2) return !!w.air;
    return !!w.ground;
  };

  // 개체의 가장자리까지 거리 (유닛은 원, 건물·자원은 사각형)
  function edgeDist(x, y, t) {
    if (t.kind === 'unit') return Math.max(0, R.dist(x, y, t.x, t.y) - t.r);
    var hw = t.w * TILE / 2, hh = t.h * TILE / 2;
    var dx = Math.max(Math.abs(x - t.x) - hw, 0), dy = Math.max(Math.abs(y - t.y) - hh, 0);
    return Math.sqrt(dx * dx + dy * dy);
  }
  Units.edgeDist = edgeDist;

  // 사각형에 다가설 지점
  function approach(u, cx, cy, hw, hh) {
    var px = R.clamp(u.x, cx - hw, cx + hw), py = R.clamp(u.y, cy - hh, cy + hh);
    var dx = u.x - px, dy = u.y - py, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.01) { AP.x = u.x; AP.y = u.y; return AP; }
    var off = Math.min(d, u.r * 1.05 + 2);
    AP.x = px + dx / d * off; AP.y = py + dy / d * off;
    return AP;
  }
  function entGoal(e) { return e.goal || (e.goal = { key: 'e' + e.id, tx: e.tx, ty: e.ty, w: e.w, h: e.h }); }

  function setDir(W, u, tx, ty) {
    var dx = tx - u.x, dy = ty - u.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.75) { u.dirX = 0; u.dirY = 0; return; }
    var step = Units.speedOf(W, u) * TILE * DT * 2.2;
    var k = d < step ? Math.max(0.25, d / step) : 1;   // 다 와 가면 속도를 줄인다
    u.dirX = dx / d * k; u.dirY = dy / d * k;
  }

  /* 조향: (tx,ty)를 향해 간다. goal은 흐름장 목표(없으면 지점 자체).
     반환 0: 가는 중, 1: 흐름장 목표 칸 도착, 2: 더 못 감, 3: 닿을 수 없어 가장 가까운 곳으로 가는 중 */
  function steer(W, u, tx, ty, goal) {
    if (u.layer === 2) { setDir(W, u, tx, ty); return 0; }
    var key = goal ? goal.key : '~';
    if (W.tick >= u.wpNext || u.wpKey !== key) {
      u.wpKey = key; u.wpNext = W.tick + 4 + (u.id & 3);
      var nav = W.nav;
      if (nav.lineClear(u.layer, u.x, u.y, tx, ty, u.r)) { u.wpX = tx; u.wpY = ty; u.wpState = 0; }
      else {
        if (!goal) { var c = W.cellAt(tx, ty); goal = { key: 'p' + c, cell: c }; }
        var wp = nav.waypoint(nav.getField(u.layer, goal), u.layer, u.x, u.y, u.r);
        if (wp.state === 0) { u.wpX = wp.x; u.wpY = wp.y; u.wpState = 0; }
        else if (wp.state === 1) { u.wpX = tx; u.wpY = ty; u.wpState = 1; }
        else {
          var alt = nav.closestReachable(u.layer, u.x, u.y, tx, ty);
          u.wpState = 2; u.wpX = u.x; u.wpY = u.y;
          if (alt >= 0 && alt !== W.cellAt(u.x, u.y)) {
            var wp2 = nav.waypoint(nav.getField(u.layer, { key: 'p' + alt, cell: alt }), u.layer, u.x, u.y, u.r);
            if (wp2.state === 0) { u.wpX = wp2.x; u.wpY = wp2.y; u.wpState = 3; }
          }
        }
      }
    }
    if (u.wpState === 1) { u.wpX = tx; u.wpY = ty; }
    if (u.wpState === 2) { u.dirX = 0; u.dirY = 0; return 2; }
    setDir(W, u, u.wpX, u.wpY);
    return u.wpState;
  }
  Units.steer = steer;

  /* ── 명령 주고받기 ── */
  function dropOrder(W, u, o) {
    if (o.type === 'build' && o.paid) { W.refund(W.teams[u.team], R.BUILDINGS[o.btype].cost); o.paid = false; }
    if (o.type === 'gather' && o.state === 'mine') {
      var node = W.byId.get(o.nodeId);
      if (node) { var k = node.miners.indexOf(u.id); if (k >= 0) node.miners.splice(k, 1); }
      o.state = 'go';
    }
  }
  Units.give = function (W, u, order, queued) {
    if (queued && u.order.type !== 'idle') {
      // '일 끝나면 다시 채집' 예약은 늘 맨 뒤에 둔다
      var q = u.queue;
      if (q.length && q[q.length - 1].resume) q.splice(q.length - 1, 0, order); else q.push(order);
      return;
    }
    dropOrder(W, u, u.order);
    if (!queued) {
      for (var i = 0; i < u.queue.length; i++) dropOrder(W, u, u.queue[i]);
      u.queue.length = 0;
    }
    u.order = order; u.wpNext = 0;
  };
  function finish(W, u) {
    dropOrder(W, u, u.order);
    u.order = u.queue.length ? u.queue.shift() : idle();
    u.wpNext = 0;
  }
  Units.onDeath = function (W, u) {
    dropOrder(W, u, u.order);
    for (var i = 0; i < u.queue.length; i++) dropOrder(W, u, u.queue[i]);
    u.queue.length = 0;
  };

  /* ── 표적 찾기 ── */
  function acqRange(u) {
    var w = u.def.weapon;
    return Math.min(Math.max(w.range + 1.5, 6), u.def.sight + 1) * TILE;
  }

  // src: 유닛 또는 탑. range(픽셀) 안에서 가장 알맞은 적을 고른다
  Units.acquire = function (W, src, range) {
    var wpn = src.def.weapon, team = W.teams[src.team], vis = team.visible;
    var best = null, bestScore = 1e9, i, d, score;
    var minR = wpn.min ? wpn.min * TILE : 0;
    var list = W.queryUnits(src.x, src.y, range + 24, tmp);
    for (i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.dead || v.team === src.team) continue;
      if (v.layer === 2 ? !wpn.air : !wpn.ground) continue;
      if (!vis[W.cellAt(v.x, v.y)]) continue;
      if (src.ignoreId === v.id && W.time < src.ignoreUntil) continue;
      d = R.dist(src.x, src.y, v.x, v.y);
      if (d - v.r > range || d < minR) continue;
      score = d + (v.def.worker ? 60 : 0);
      if (score < bestScore) { bestScore = score; best = v; }
    }
    if (wpn.ground) {
      var blds = W.buildings;
      for (i = 0; i < blds.length; i++) {
        var b = blds[i];
        if (b.dead || b.team === src.team) continue;
        d = edgeDist(src.x, src.y, b);
        if (d > range) continue;
        if (minR && R.dist(src.x, src.y, b.x, b.y) < minR) continue;
        if (!W.rectVisible(team, b)) continue;
        if (src.ignoreId === b.id && W.time < src.ignoreUntil) continue;
        score = d + ((b.def.weapon && b.built) ? 0 : 170);
        if (score < bestScore) { bestScore = score; best = b; }
      }
    }
    return best;
  };

  function validTarget(W, u, t) {
    if (!t || t.dead || t.kind === 'node' || t.team === u.team) return false;
    if (!Units.canHit(u, t)) return false;
    if (t.kind === 'unit') return W.teams[u.team].visible[W.cellAt(t.x, t.y)] === 1;
    return true;
  }

  /* 교전: 사거리 안이면 쏘고, 아니면 다가간다.
     반환 0: 접근 중, 1: 사격 중, 2: 닿을 수 없음 */
  // 다가가려 해도 제자리걸음이면(물 위에 뜬 적, 아군에게 가로막힌 적) 닿을 수 없는 표적으로 본다
  function blockedTooLong(W, u, t) {
    if (u.engId !== t.id || R.dist2(u.x, u.y, u.engX, u.engY) > 64) { u.engId = t.id; u.engX = u.x; u.engY = u.y; u.engT = W.time; return false; }
    return W.time - u.engT > 1.5;
  }

  function engage(W, u, t, noMove) {
    var wpn = u.def.weapon;
    var reach = wpn.range * TILE + u.r;
    var ed = edgeDist(u.x, u.y, t);
    var tooClose = wpn.min && R.dist(u.x, u.y, t.x, t.y) < wpn.min * TILE;
    if (ed <= reach && !tooClose) {
      var ang = Math.atan2(t.y - u.y, t.x - u.x);
      u.weight = 4;
      if (wpn.turret) { u.aimT = ang; u.aimLock = true; }
      else { u.face = ang; u.faceLock = true; }
      u.engId = 0;
      if (u.cd <= 0) {
        var off = Math.abs(R.wrapAngle((wpn.turret ? u.aim : u.angle) - ang));
        if (off < 0.9) Units.fire(W, u, t);
      }
      return 1;
    }
    if (tooClose || noMove) return 2;
    var st;
    if (t.kind === 'unit') st = steer(W, u, t.x, t.y, null);
    else { var a = approach(u, t.x, t.y, t.w * TILE / 2, t.h * TILE / 2); st = steer(W, u, a.x, a.y, entGoal(t)); }
    u.weight = 2;
    if (st === 2 || blockedTooLong(W, u, t)) return 2;
    return 0;
  }

  /* ── 발사 ── */
  function bonusOf(wpn, t) {
    if (!wpn.bonus) return 1;
    var at = t.kind === 'building' ? 'structure' : t.def.atype;
    return wpn.bonus[at] || 1;
  }

  function splash(W, x, y, rad, dmg, wpn, src, teamId, skipId) {
    var list = W.queryUnits(x, y, rad + 20, tmp2), i, d, f;
    for (i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.dead || v.team === teamId || v.id === skipId) continue;
      if (v.layer === 2 ? !wpn.air : !wpn.ground) continue;
      d = R.dist(x, y, v.x, v.y) - v.r;
      if (d > rad) continue;
      f = 1 - 0.5 * Math.max(0, d) / rad;
      W.damage(v, dmg * f * bonusOf(wpn, v), src, teamId);
    }
    if (!wpn.ground) return;
    var blds = W.buildings;
    for (i = 0; i < blds.length; i++) {
      var b = blds[i];
      if (b.dead || b.team === teamId || b.id === skipId) continue;
      d = edgeDist(x, y, b);
      if (d > rad) continue;
      f = 1 - 0.5 * d / rad;
      W.damage(b, dmg * f * bonusOf(wpn, b), src, teamId);
    }
  }

  Units.splash = splash;

  Units.fire = function (W, src, t) {
    var wpn = src.def.weapon, team = W.teams[src.team];
    var mult = (1 + 0.15 * team.upg.atk) * (1 + R.RANKS.bonus * (src.rank || 0)), charged = false;      // 연구 + 계급
    var ch = src.def.charge;
    if (ch) {
      if (src.charge >= ch.time * (team.upg.spc ? 0.5 : 1)) { mult *= ch.mult; charged = true; }
      src.charge = 0;
    }
    var base = wpn.dmg * mult;
    src.cd = wpn.cd; src.lastAtk = W.time; src.atkTick = W.tick;
    var ang = Math.atan2(t.y - src.y, t.x - src.x);
    var mx = src.x + Math.cos(ang) * (src.kind === 'unit' ? src.r : 10), my = src.y + Math.sin(ang) * (src.kind === 'unit' ? src.r : 10);
    var ev = { t: 'shot', fx: wpn.fx, kind: wpn.kind, x: mx, y: my, tx: t.x, ty: t.y, team: src.team, charged: charged, sid: src.id, tid: t.id, air: src.layer === 2 };
    switch (wpn.kind) {
      case 'melee':
        W.damage(t, base * bonusOf(wpn, t), src);
        if (wpn.cleave) splash(W, t.x, t.y, wpn.cleave * TILE, base * 0.5, wpn, src, src.team, t.id);
        break;
      case 'proj':
        W.projectiles.push({
          kind: 'homing', fx: wpn.fx, x: mx, y: my, px: mx, py: my, tx: t.x, ty: t.y, tid: t.id,
          speed: wpn.speed * TILE, dmg: base * bonusOf(wpn, t), team: src.team, srcId: src.id, charged: charged, high: src.layer === 2 || (t.kind === 'unit' && t.layer === 2)
        });
        break;
      case 'lob':
      case 'strike':
        var dist = R.dist(src.x, src.y, t.x, t.y);
        W.projectiles.push({
          kind: wpn.kind, fx: wpn.fx, sx: mx, sy: my, x: mx, y: my, tx: t.x, ty: t.y, t: 0,
          dur: wpn.kind === 'strike' ? wpn.delay : Math.max(0.45, dist / (wpn.speed * TILE)),
          dmg: base, splash: wpn.splash * TILE, wpn: wpn, team: src.team, srcId: src.id, charged: charged
        });
        break;
      case 'zap':
        var pts = [t.x, t.y], hit = [t.id], cur = t, dmg = base;
        W.damage(t, dmg * bonusOf(wpn, t), src);
        for (var hop = 1; hop < (wpn.chain || 1); hop++) {
          dmg *= 0.65;
          var nxt = null, bd = 2.4 * TILE;
          var list = W.queryUnits(cur.x, cur.y, bd + 20, tmp2);
          for (var i = 0; i < list.length; i++) {
            var v = list[i];
            if (v.dead || v.team === src.team || hit.indexOf(v.id) >= 0) continue;
            if (v.layer === 2 ? !wpn.air : !wpn.ground) continue;
            var d = R.dist(cur.x, cur.y, v.x, v.y);
            if (d < bd) { bd = d; nxt = v; }
          }
          if (!nxt) break;
          hit.push(nxt.id); pts.push(nxt.x, nxt.y);
          W.damage(nxt, dmg * bonusOf(wpn, nxt), src);
          cur = nxt;
        }
        ev.pts = pts;
        break;
    }
    W.emit(ev);
  };

  Units.updateProjectiles = function (W) {
    var list = W.projectiles;
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i], done = false;
      if (p.kind === 'homing') {
        var t = W.byId.get(p.tid);
        if (t && !t.dead) { p.tx = t.x; p.ty = t.y; } else t = null;
        var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy), step = p.speed * DT;
        p.px = p.x; p.py = p.y;
        if (d <= step + (t ? t.r * 0.5 : 0)) {
          if (t) W.damage(t, p.dmg, W.byId.get(p.srcId) || null, p.team);
          W.emit({ t: 'hit', fx: p.fx, x: p.tx, y: p.ty, team: p.team, charged: p.charged });
          done = true;
        } else { p.x += dx / d * step; p.y += dy / d * step; }
      } else {
        p.t += DT;
        if (p.t >= p.dur) {
          splash(W, p.tx, p.ty, p.splash, p.dmg, p.wpn, W.byId.get(p.srcId) || null, p.team, 0);
          W.emit({ t: 'boom', fx: p.fx, x: p.tx, y: p.ty, r: p.splash, team: p.team });
          done = true;
        }
      }
      if (done) { list[i] = list[list.length - 1]; list.pop(); }
    }
  };

  /* ── 자원 찾기 ── */
  Units.findNode = function (W, u, res, x, y, maxDist, needFree) {
    var best = null, bs = 1e9, style = u.def.worker.style;
    for (var i = 0; i < W.nodes.length; i++) {
      var n = W.nodes[i];
      if (n.dead || n.def.res !== res) continue;
      var d = R.dist(x, y, n.x, n.y);
      if (d > maxDist) continue;
      var cap = style === 'beam' ? n.def.beamSlots : n.def.carrySlots;
      if (needFree && n.miners.length >= cap) continue;
      var s = d + n.miners.length * 56 + (n.claims || 0) * 20;
      if (s < bs) { bs = s; best = n; }
    }
    return best;
  };

  Units.nearestDepot = function (W, u) {
    var best = null, bd = 1e9;
    for (var i = 0; i < W.buildings.length; i++) {
      var b = W.buildings[i];
      if (b.dead || b.team !== u.team || !b.built || !b.def.dropoff) continue;
      var d = R.dist2(u.x, u.y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };

  Units.gatherOrder = function (node) {
    return { type: 'gather', nodeId: node.id, rtype: node.def.res, nx: node.x, ny: node.y, state: 'go', t: 0, depotId: 0 };
  };

  /* ── 명령별 처리 ── */
  function doIdle(W, u) {
    if (!u.def.weapon || u.def.worker) return;
    if ((W.tick + u.id) % 8 !== 0) return;
    var t = Units.acquire(W, u, acqRange(u));
    if (t) u.order = { type: 'guard', hx: u.x, hy: u.y, targetId: t.id };
  }

  function progress(W, u, o, d) {
    if ((W.tick + u.id) % 15 !== 0) return;
    if (o.lastD !== undefined && o.lastD - d < 4) o.stuck = (o.stuck || 0) + 1; else o.stuck = 0;
    o.lastD = d;
  }

  // 지점으로 이동. 도착하면 true
  function moveStep(W, u, o) {
    var d = R.dist(u.x, u.y, o.x, o.y);
    if (d < 5) return true;
    var st = steer(W, u, o.x, o.y, o.goal || null);
    u.weight = 2;
    progress(W, u, o, d);
    if (st === 2) return true;
    if (o.stuck >= 2 && d < TILE * 3.5) return true;
    if (o.stuck >= 9) return true;
    return false;
  }

  function doMove(W, u, o) { if (moveStep(W, u, o)) finish(W, u); }

  function doAmove(W, u, o) {
    if (!u.def.weapon) { doMove(W, u, o); return; }
    var t = o.targetId ? W.byId.get(o.targetId) : null;
    if (o.targetId && !validTarget(W, u, t)) { t = null; o.targetId = 0; }      // 죽어서 목록에서 빠진 표적도 여기서 정리된다
    if (!t && (W.tick + u.id) % 6 === 0) {
      t = Units.acquire(W, u, acqRange(u));
      if (t) { o.targetId = t.id; o.stuck = 0; o.lastD = undefined; }
    }
    if (t) {
      var r = engage(W, u, t, false);
      if (r === 2) { u.ignoreId = t.id; u.ignoreUntil = W.time + 3; o.targetId = 0; }
      return;
    }
    if (moveStep(W, u, o)) finish(W, u);
  }

  function doAttack(W, u, o) {
    var t = W.byId.get(o.targetId);
    if (!t || t.dead || !Units.canHit(u, t) || t.team === u.team) { finish(W, u); return; }
    if (t.kind === 'unit' && !W.teams[u.team].visible[W.cellAt(t.x, t.y)]) { finish(W, u); return; }
    var r = engage(W, u, t, false);
    if (r === 2) {
      o.fail = (o.fail || 0) + 1;
      if (o.fail > 90) finish(W, u);
    } else o.fail = 0;
  }

  function doGuard(W, u, o) {
    var t = o.targetId ? W.byId.get(o.targetId) : null;
    var far = R.dist(u.x, u.y, o.hx, o.hy) > TILE * 9;
    if (o.targetId && (!validTarget(W, u, t) || far)) {
      if (far && t) { u.ignoreId = t.id; u.ignoreUntil = W.time + 2.5; }
      t = null; o.targetId = 0;
    }
    if (!t && !far && (W.tick + u.id) % 8 === 0) {
      t = Units.acquire(W, u, acqRange(u));
      if (t) o.targetId = t.id;
    }
    if (t) {
      if (engage(W, u, t, false) === 2) { u.ignoreId = t.id; u.ignoreUntil = W.time + 3; o.targetId = 0; }
      return;
    }
    // 제자리로 돌아간다
    var d = R.dist(u.x, u.y, o.hx, o.hy);
    if (d < 10) { finish(W, u); return; }      // 예약해 둔 명령이 있으면 이어서 수행
    var st = steer(W, u, o.hx, o.hy, null);
    u.weight = 2;
    progress(W, u, o, d);
    if (st === 2 || o.stuck >= 2) finish(W, u);
  }

  function doHold(W, u, o) {
    u.weight = 8;
    if (!u.def.weapon) return;
    var t = o.targetId ? W.byId.get(o.targetId) : null;
    var reach = u.def.weapon.range * TILE + u.r;
    if (o.targetId && (!validTarget(W, u, t) || edgeDist(u.x, u.y, t) > reach)) { t = null; o.targetId = 0; }
    if (!t && (W.tick + u.id) % 6 === 0) {
      t = Units.acquire(W, u, reach);
      if (t) o.targetId = t.id;
    }
    if (t) engage(W, u, t, true);
  }

  function doGather(W, u, o) {
    var wk = u.def.worker, team = W.teams[u.team];
    if (!wk) { finish(W, u); return; }
    u.ghost = true;
    var a, node;
    if (o.state === 'return') {
      var depot = o.depotId ? W.byId.get(o.depotId) : null;
      if (!depot || depot.dead || !depot.built) { depot = Units.nearestDepot(W, u); o.depotId = depot ? depot.id : 0; }
      if (!depot) { u.ghost = false; return; }
      if (edgeDist(u.x, u.y, depot) <= u.r + 7) {
        if (u.carry) {
          W.addRes(team, u.carry.res, u.carry.n);
          W.emit({ t: 'deposit', team: u.team, x: u.x, y: u.y, res: u.carry.res, n: u.carry.n });
          u.carry = null;
        }
        if (!o.nodeId) { finish(W, u); return; }
        o.state = 'go';
      } else {
        a = approach(u, depot.x, depot.y, depot.w * TILE / 2, depot.h * TILE / 2);
        steer(W, u, a.x, a.y, entGoal(depot));
      }
      return;
    }
    node = W.byId.get(o.nodeId);
    if (!node || node.dead) {
      node = Units.findNode(W, u, o.rtype, o.nx, o.ny, TILE * 14, false);
      if (!node) {
        o.nodeId = 0;
        if (u.carry && wk.style === 'carry') { o.state = 'return'; return; }
        finish(W, u); return;
      }
      o.nodeId = node.id; o.nx = node.x; o.ny = node.y; o.state = 'go';
    }
    if (o.state === 'go') {
      if (wk.style === 'carry' && u.carry && u.carry.n >= wk.carry && u.carry.res === o.rtype) { o.state = 'return'; return; }
      if (edgeDist(u.x, u.y, node) <= u.r + 7) {
        var cap = wk.style === 'beam' ? node.def.beamSlots : node.def.carrySlots;
        if (node.miners.length < cap) { node.miners.push(u.id); o.state = 'mine'; o.t = 0; }
        else if ((W.tick + u.id) % 9 === 0) {
          // 자리가 없으면 근처의 빈 노드로 옮긴다
          var alt = Units.findNode(W, u, o.rtype, node.x, node.y, TILE * 8, true);
          if (alt) { o.nodeId = alt.id; o.nx = alt.x; o.ny = alt.y; }
        }
        u.face = Math.atan2(node.y - u.y, node.x - u.x); u.faceLock = true;
      } else {
        a = approach(u, node.x, node.y, node.w * TILE / 2, node.h * TILE / 2);
        var st = steer(W, u, a.x, a.y, entGoal(node));
        if (st === 2) {
          o.fail = (o.fail || 0) + 1;
          if (o.fail > 60) { o.fail = 0; var other = Units.findNode(W, u, o.rtype, u.x, u.y, TILE * 30, false); if (other && other !== node && W.nav.sameRegion(u.layer, u.x, u.y, other.x, other.y + other.h * TILE)) { o.nodeId = other.id; o.nx = other.x; o.ny = other.y; } else finish(W, u); }
        }
      }
      return;
    }
    // 채굴 중
    u.working = true;
    u.face = Math.atan2(node.y - u.y, node.x - u.x); u.faceLock = true;
    o.t += DT;
    if (o.t >= wk.mineTime) {
      o.t = 0;
      var n = Math.min(wk.carry, node.amount);
      node.amount -= n;
      if (wk.style === 'beam') {
        W.addRes(team, node.def.res, n);
        W.emit({ t: 'beam', team: u.team, x: u.x, y: u.y, nx: node.x, ny: node.y, res: node.def.res, n: n });
      } else {
        u.carry = { res: node.def.res, n: n };
        var k = node.miners.indexOf(u.id); if (k >= 0) node.miners.splice(k, 1);
        o.state = 'return'; o.depotId = 0;
      }
      if (node.amount <= 0) W.kill(node, null, -1);
    }
  }

  function doBuild(W, u, o) {
    var def = R.BUILDINGS[o.btype], s = def.size, team = W.teams[u.team];
    var cx = (o.tx + s / 2) * TILE, cy = (o.ty + s / 2) * TILE, half = s * TILE / 2;
    var style = u.def.worker ? u.def.worker.build : null;
    if (!style) { finish(W, u); return; }
    var inRange;
    if (style === 'remote') inRange = R.dist(u.x, u.y, cx, cy) <= team.fdef.remoteRange * TILE;
    else {
      var dx = Math.max(Math.abs(u.x - cx) - half, 0), dy = Math.max(Math.abs(u.y - cy) - half, 0);
      inRange = Math.sqrt(dx * dx + dy * dy) <= u.r + 8;
    }
    if (inRange) {
      if (!R.canPlace(W, u.team, o.btype, o.tx, o.ty, true)) {
        W.emit({ t: 'error', team: u.team, code: 'blocked' });
        finish(W, u);     // dropOrder가 비용을 돌려준다
        return;
      }
      o.paid = false;
      var b = R.Buildings.create(W, o.btype, u.team, o.tx, o.ty, false);
      team.stats.built++;
      W.emit({ t: 'buildStart', team: u.team, x: b.x, y: b.y, type: o.btype, id: b.id });
      if (style === 'stay') { u.order = { type: 'construct', bid: b.id }; u.wpNext = 0; }
      else finish(W, u);
      return;
    }
    var a = approach(u, cx, cy, half, half);
    var goal = o.goal || (o.goal = { key: 's' + o.tx + '_' + o.ty + '_' + s, tx: o.tx, ty: o.ty, w: s, h: s });
    var st = steer(W, u, a.x, a.y, goal);
    u.weight = 2;
    var d = R.dist(u.x, u.y, cx, cy);
    progress(W, u, o, d);
    if (st === 2 || o.stuck >= 10) {
      W.emit({ t: 'error', team: u.team, code: 'unreachable' });
      finish(W, u);
    }
  }

  function doConstruct(W, u, o) {
    var b = W.byId.get(o.bid);
    if (!b || b.dead || b.built || b.team !== u.team) { finish(W, u); return; }
    if (edgeDist(u.x, u.y, b) <= u.r + 9) {
      b.buildPower++;
      u.working = true; u.weight = 6;
      u.face = Math.atan2(b.y - u.y, b.x - u.x); u.faceLock = true;
    } else {
      var a = approach(u, b.x, b.y, b.w * TILE / 2, b.h * TILE / 2);
      var st = steer(W, u, a.x, a.y, entGoal(b));
      u.weight = 2;
      if (st === 2 || blockedTooLong(W, u, b)) { o.fail = (o.fail || 0) + 1; if (o.fail > 90) finish(W, u); }
    }
  }

  function doRepair(W, u, o) {
    var t = W.byId.get(o.tid);
    if (!t || t.dead || t.team !== u.team || t.hp >= t.maxHp || (t.kind === 'building' && !t.built)) { finish(W, u); return; }
    if (edgeDist(u.x, u.y, t) <= u.r + 9) {
      var rate = t.kind === 'building' ? t.maxHp / (t.def.time * 1.4) : 9;
      t.hp = Math.min(t.maxHp, t.hp + rate * DT);
      u.working = true; u.weight = 6;
      u.face = Math.atan2(t.y - u.y, t.x - u.x); u.faceLock = true;
    } else {
      var st;
      if (t.kind === 'unit') st = steer(W, u, t.x, t.y, null);
      else { var a = approach(u, t.x, t.y, t.w * TILE / 2, t.h * TILE / 2); st = steer(W, u, a.x, a.y, entGoal(t)); }
      u.weight = 2;
      if (st === 2 || blockedTooLong(W, u, t)) { o.fail = (o.fail || 0) + 1; if (o.fail > 90) finish(W, u); }
    }
  }

  Units.update = function (W, u) {
    if (u.cd > 0) u.cd -= DT;
    u.charge += DT;
    u.dirX = 0; u.dirY = 0; u.faceLock = false; u.aimLock = false; u.working = false; u.ghost = false; u.weight = 1;
    var def = u.def;
    if (def.regen && u.hp < u.maxHp) {
      var team = W.teams[u.team];
      var rate = def.regen * (team.upg.spc ? 2 : 1) * (W.time - u.lastHit > 6 ? 2.5 : 1);
      u.hp = Math.min(u.maxHp, u.hp + rate * DT);
    }
    var o = u.order;
    switch (o.type) {
      case 'idle': doIdle(W, u); break;
      case 'move': doMove(W, u, o); break;
      case 'amove': doAmove(W, u, o); break;
      case 'attack': doAttack(W, u, o); break;
      case 'guard': doGuard(W, u, o); break;
      case 'hold': doHold(W, u, o); break;
      case 'gather': doGather(W, u, o); break;
      case 'build': doBuild(W, u, o); break;
      case 'construct': doConstruct(W, u, o); break;
      case 'repair': doRepair(W, u, o); break;
      default: u.order = idle();
    }
  };

  /* ── 이동 적분, 서로 밀어내기, 지형 충돌 ── */
  Units.integrate = function (W) {
    var units = W.units, n = units.length, i, u;
    var nav = W.nav, nw = nav.w, nh = nav.h, pw = W.pw, ph = W.ph;
    for (i = 0; i < n; i++) {
      u = units[i];
      if (u.dead) continue;
      var sp = Units.speedOf(W, u) * TILE;
      u.vx += (u.dirX * sp - u.vx) * 0.45;
      u.vy += (u.dirY * sp - u.vy) * 0.45;
      if (u.dirX === 0 && u.dirY === 0 && Math.abs(u.vx) + Math.abs(u.vy) < 8) { u.vx = 0; u.vy = 0; }
      u.px = u.x; u.py = u.y;
      u.x += u.vx * DT; u.y += u.vy * DT;
    }
    for (i = 0; i < n; i++) {
      u = units[i];
      if (u.dead) continue;
      var list = W.queryUnits(u.x, u.y, u.r + 26, tmp);
      for (var j = 0; j < list.length; j++) {
        var v = list[j];
        if (v.id <= u.id || v.dead) continue;
        if ((u.layer === 2) !== (v.layer === 2)) continue;
        var k = 0.6, gap = 0.92;
        if (u.ghost || v.ghost) { if (u.ghost && v.ghost) k = 0.1; else continue; }
        else if (u.order.type === 'idle' && v.order.type === 'idle') { gap = 1.32; k = 0.1; }     // 쉬는 유닛끼리는 한 덩어리로 뭉치지 않고 조금 벌려 선다
        var dx = u.x - v.x, dy = u.y - v.y, min = (u.r + v.r) * gap;
        var d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        var d = Math.sqrt(d2);
        if (d < 0.01) { var a = (u.id * 2.399) % 6.283; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
        var ov = (min - d) * k, tot = u.weight + v.weight;
        var nx = dx / d, ny = dy / d;
        u.x += nx * ov * (v.weight / tot); u.y += ny * ov * (v.weight / tot);
        v.x -= nx * ov * (u.weight / tot); v.y -= ny * ov * (u.weight / tot);
      }
    }
    for (i = 0; i < n; i++) {
      u = units[i];
      if (u.dead) continue;
      if (u.layer !== 2) {
        var pass = nav.pass[u.layer];
        var rr = Math.min(u.r, 13) * 0.8;
        var cx = (u.x / TILE) | 0, cy = (u.y / TILE) | 0;
        if (cx < 0) cx = 0; else if (cx >= nw) cx = nw - 1;
        if (cy < 0) cy = 0; else if (cy >= nh) cy = nh - 1;
        if (!pass[cy * nw + cx]) {
          // 막힌 칸 안에 끼었다 → 가장 가까운 열린 칸으로 빠져나온다
          var e = nav.nearestPassable(u.layer, cx, cy, 6);
          if (e >= 0) {
            var ex = (e % nw + 0.5) * TILE, ey = (((e / nw) | 0) + 0.5) * TILE;
            var ddx = ex - u.x, ddy = ey - u.y, dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
            var mv = Math.min(dd, 5);
            u.x += ddx / dd * mv; u.y += ddy / dd * mv;
          }
        } else {
          for (var ny2 = cy - 1; ny2 <= cy + 1; ny2++) for (var nx2 = cx - 1; nx2 <= cx + 1; nx2++) {
            if (nx2 === cx && ny2 === cy) continue;
            if (nx2 >= 0 && ny2 >= 0 && nx2 < nw && ny2 < nh && pass[ny2 * nw + nx2]) continue;
            var qx = R.clamp(u.x, nx2 * TILE, nx2 * TILE + TILE), qy = R.clamp(u.y, ny2 * TILE, ny2 * TILE + TILE);
            var ex2 = u.x - qx, ey2 = u.y - qy, e2 = ex2 * ex2 + ey2 * ey2;
            if (e2 < rr * rr && e2 > 0.0001) { var el = Math.sqrt(e2), push = rr - el; u.x += ex2 / el * push; u.y += ey2 / el * push; }
          }
        }
      }
      if (u.x < u.r) u.x = u.r; else if (u.x > pw - u.r) u.x = pw - u.r;
      if (u.y < u.r) u.y = u.r; else if (u.y > ph - u.r) u.y = ph - u.r;
      var spd2 = u.vx * u.vx + u.vy * u.vy;
      if (u.faceLock) u.angle = R.turnToward(u.angle, u.face, 14 * DT);
      else if (spd2 > 100) u.angle = R.turnToward(u.angle, Math.atan2(u.vy, u.vx), 10 * DT);
      if (u.def.weapon && u.def.weapon.turret) u.aim = R.turnToward(u.aim, u.aimLock ? u.aimT : u.angle, 9 * DT);
      u.moving = spd2 > 64;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
