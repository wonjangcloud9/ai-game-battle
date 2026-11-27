/* 해돌전쟁 — 건물: 건설 진행, 생산, 연구, 방어 탑 */
'use strict';
(function (g) {
  var R = g.RTS, TILE = R.TILE, DT = R.DT;
  var B = R.Buildings = {};

  B.create = function (W, type, teamId, tx, ty, built) {
    var def = R.BUILDINGS[type], s = def.size;
    var b = {
      id: W.nextId++, kind: 'building', type: type, def: def, team: teamId,
      tx: tx, ty: ty, w: s, h: s, x: (tx + s / 2) * TILE, y: (ty + s / 2) * TILE, r: s * TILE / 2,
      hp: built ? def.hp : def.hp * 0.1, maxHp: def.hp,
      built: !!built, progress: built ? 1 : 0, buildPower: 0, builders: 0,
      queue: [], rally: null, blocked: false,
      cd: 0, targetId: 0, aim: -Math.PI / 2,
      lastHit: -99, hitTick: -99, atkTick: -99, seen: 1 << teamId, dead: false, born: W.tick
    };
    W.buildings.push(b); W.byId.set(b.id, b);
    W.nav.setOcc(tx, ty, s, s, b.id);
    W.recount(W.teams[teamId]);
    return b;
  };

  B.complete = function (W, b) {
    b.built = true; b.progress = 1;
    W.recount(W.teams[b.team]);
    W.emit({ t: 'built', team: b.team, type: b.type, x: b.x, y: b.y, id: b.id });
  };

  // 건물 밖으로 나올 자리: (rx,ry)에 가장 가까운 둘레의 빈 칸
  B.exitPoint = function (W, b, layer, rx, ry) {
    if (layer === 2) {
      var a = Math.atan2(ry - b.y, rx - b.x);
      return { x: b.x + Math.cos(a) * (b.r + 6), y: b.y + Math.sin(a) * (b.r + 6) };
    }
    var nav = W.nav, best = -1, bd = 1e12;
    for (var ring = 1; ring <= 3 && best < 0; ring++) {
      for (var y = b.ty - ring; y < b.ty + b.h + ring; y++) for (var x = b.tx - ring; x < b.tx + b.w + ring; x++) {
        if (x > b.tx - ring && x < b.tx + b.w + ring - 1 && y > b.ty - ring && y < b.ty + b.h + ring - 1) continue;
        if (!nav.passable(layer, x, y)) continue;
        var px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
        var d = R.dist2(px, py, rx, ry);
        if (d < bd) { bd = d; best = y * nav.w + x; }
      }
    }
    if (best < 0) return { x: b.x, y: b.y };
    return { x: (best % nav.w + 0.5) * TILE, y: (((best / nav.w) | 0) + 0.5) * TILE };
  };

  B.spawnUnit = function (W, b, utype) {
    var def = R.UNITS[utype], layer = def.layer === 'air' ? 2 : (def.layer === 'hover' ? 1 : 0);
    var rx, ry, node = null;
    if (b.rally) {
      rx = b.rally.x; ry = b.rally.y;
      if (b.rally.nodeId) {
        node = W.byId.get(b.rally.nodeId);
        if (node && node.dead) node = null;
        // 찍어 둔 자원이 바닥났으면 그 근처의 같은 자원으로 간다
        if (!node && def.worker) node = R.Units.findNode(W, { def: def }, b.rally.res || 'sun', rx, ry, TILE * 13, false);
      }
    } else { rx = W.pw / 2; ry = W.ph / 2; }
    if (def.worker && !b.rally) {
      // 새 일꾼은 알아서 가까운 해돌로 간다
      node = R.Units.findNode(W, { def: def }, 'sun', b.x, b.y, TILE * 13, false);
      if (node) { rx = node.x; ry = node.y; }
    }
    var pos = B.exitPoint(W, b, layer, rx, ry);
    var u = R.Units.spawn(W, utype, b.team, pos.x, pos.y, true);
    u.angle = u.aim = Math.atan2(ry - pos.y, rx - pos.x);
    if (def.worker && node) R.Units.give(W, u, R.Units.gatherOrder(node));
    else if (b.rally) R.Cmd.move(W, b.team, [u.id], b.rally.x, b.rally.y, false);
    else {
      var a = Math.atan2(pos.y - b.y, pos.x - b.x);
      R.Cmd.move(W, b.team, [u.id], pos.x + Math.cos(a) * 46, pos.y + Math.sin(a) * 46, false);
    }
    W.teams[b.team].stats.produced++;
    W.emit({ t: 'unitReady', team: b.team, type: utype, x: u.x, y: u.y, id: u.id, bid: b.id });
    return u;
  };

  B.applyUpgrade = function (W, team, upId) {
    var up = R.UPGRADES[upId];
    team.done[upId] = true;
    delete team.researching[upId];
    if (up.effect.atk) team.upg.atk = Math.max(team.upg.atk, up.effect.atk);
    if (up.effect.def) team.upg.def = Math.max(team.upg.def, up.effect.def);
    if (up.effect.spc) team.upg.spc = true;
  };

  B.update = function (W, b) {
    var def = b.def, team = W.teams[b.team];
    if (!b.built) {
      var rate = team.fdef.buildStyle === 'stay' ? (b.buildPower > 0 ? 1 + 0.6 * (b.buildPower - 1) : 0) : 1;
      b.builders = b.buildPower; b.buildPower = 0;
      if (rate > 0) {
        var dp = rate * DT / def.time;
        b.progress += dp;
        b.hp = Math.min(b.maxHp, b.hp + dp * b.maxHp * 0.9);
        if (b.progress >= 1) B.complete(W, b);
      }
      return;
    }
    if (def.regen && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + def.regen * (team.upg.spc ? 2 : 1) * DT);

    // 생산 / 연구
    if (b.queue.length) {
      var it = b.queue[0];
      if (!it.started) {
        if (it.kind === 'unit') {
          var s = R.UNITS[it.id].supply;
          if (team.supplyUsed + s > team.supplyCap) {
            if (!b.blocked) W.emit({ t: 'blocked', team: b.team, x: b.x, y: b.y, max: team.supplyCap >= R.MAX_SUPPLY });
            b.blocked = true; it = null;
          }
          else { team.supplyUsed += s; it.started = true; b.blocked = false; }
        } else it.started = true;
      }
      if (it) {
        it.t += DT;
        if (it.t >= it.total) {
          b.queue.shift();
          if (it.kind === 'unit') B.spawnUnit(W, b, it.id);
          else {
            B.applyUpgrade(W, team, it.id);
            W.emit({ t: 'researched', team: b.team, id: it.id, x: b.x, y: b.y });
          }
        }
      }
    } else b.blocked = false;

    // 방어 탑
    if (def.weapon) {
      if (b.cd > 0) b.cd -= DT;
      var range = def.weapon.range * TILE;
      var t = b.targetId ? W.byId.get(b.targetId) : null;
      if (t && (t.dead || R.Units.edgeDist(b.x, b.y, t) > range || (t.kind === 'unit' && !team.visible[W.cellAt(t.x, t.y)]))) { t = null; b.targetId = 0; }
      if (!t && (W.tick + b.id) % 6 === 0) {
        t = R.Units.acquire(W, b, range);
        if (t) b.targetId = t.id;
      }
      if (t) {
        var ang = Math.atan2(t.y - b.y, t.x - b.x);
        b.aim = R.turnToward(b.aim, ang, 9 * DT);
        if (b.cd <= 0 && Math.abs(R.wrapAngle(b.aim - ang)) < 0.5) R.Units.fire(W, b, t);
      }
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
