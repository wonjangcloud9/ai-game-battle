/* 해돌전쟁 — 명령: 사람과 컴퓨터가 똑같이 쓰는 조작 창구 */
'use strict';
(function (g) {
  var R = g.RTS, TILE = R.TILE;
  var Cmd = R.Cmd = {};
  var Units = R.Units;

  /* 한 칸에 지을 수 있는가. ignoreFog가 거짓이면 '그 팀이 아는 만큼'만 따진다:
     안 가 본 땅에는 못 짓고, 지금 안 보이는 칸에 본 적 없는 적 건물이 있어도 모르는 것으로 친다
     (명령은 받아들이고, 일꾼이 가 보면 막혀 있어 환불된다). */
  R.cellBuildable = function (W, teamId, c, ignoreFog) {
    var nav = W.nav;
    if (nav.terrain[c] !== 0) return false;
    var occ = nav.occ[c];
    if (ignoreFog) return occ === 0;
    var team = W.teams[teamId];
    if (!team.explored[c]) return false;
    if (occ === 0) return true;
    if (team.visible[c]) return false;
    var e = W.byId.get(occ);
    if (!e || e.kind !== 'building' || e.team === teamId) return false;     // 자원과 내 건물은 늘 안다
    return !(e.seen & (1 << teamId));
  };

  R.canPlace = function (W, teamId, btype, tx, ty, ignoreFog) {
    var def = R.BUILDINGS[btype], s = def.size;
    if (tx < 0 || ty < 0 || tx + s > W.w || ty + s > W.h) return false;
    for (var y = ty; y < ty + s; y++) for (var x = tx; x < tx + s; x++) {
      if (!R.cellBuildable(W, teamId, y * W.w + x, ignoreFog)) return false;
    }
    return true;
  };

  R.errText = function (err, team) {
    if (!err) return '';
    switch (err.code) {
      case 'sun': return '해돌이 부족합니다';
      case 'dew': return '달이슬이 부족합니다';
      case 'supply': return '보급이 부족합니다 — ' + R.josa(R.BUILDINGS[team.fdef.supply].name, '을', '를') + ' 더 지으세요';
      case 'maxsupply': return '보급 한도(' + R.MAX_SUPPLY + ')에 도달했습니다';
      case 'req': return '먼저 ' + R.josa(R.BUILDINGS[err.what].name, '이', '가') + ' 필요합니다';
      case 'requpg': return '먼저 ' + R.josa(R.UPGRADES[err.what].name, '을', '를') + ' 연구해야 합니다';
      case 'place': return '여기에는 지을 수 없습니다';
      case 'blocked': return '지을 자리가 막혔습니다 (비용 환불)';
      case 'unreachable': return '그곳에 갈 수 없습니다 (비용 환불)';
      case 'queue': return '대기열이 가득 찼습니다';
      case 'busy': return '이미 연구 중이거나 끝난 연구입니다';
      case 'cooldown': return '진영 기술을 다시 쓰려면 ' + err.left + '초 더 기다려야 합니다';
      case 'novision': return '지금 보이는 곳에만 쓸 수 있습니다';
      default: return '할 수 없는 명령입니다';
    }
  };

  function own(W, teamId, ids) {
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var u = W.byId.get(ids[i]);
      if (u && !u.dead && u.kind === 'unit' && u.team === teamId) out.push(u);
    }
    return out;
  }

  function slots(n, spacing) {
    var out = [[0, 0]], ring = 1;
    while (out.length < n) {
      var cnt = ring * 6;
      for (var i = 0; i < cnt && out.length < n; i++) {
        var a = i / cnt * Math.PI * 2 + ring * 0.5;
        out.push([Math.cos(a) * ring * spacing, Math.sin(a) * ring * spacing]);
      }
      ring++;
    }
    return out;
  }

  function groupMove(W, teamId, ids, x, y, queued, type) {
    var us = own(W, teamId, ids), n = us.length;
    if (!n) return 0;
    x = R.clamp(x, 6, W.pw - 6); y = R.clamp(y, 6, W.ph - 6);
    var sumR = 0, i;
    for (i = 0; i < n; i++) sumR += us[i].r;
    var sl = slots(n, (sumR / n) * 2 + 7);
    var cell = W.cellAt(x, y), goal = { key: 'p' + cell, cell: cell };
    var free = us.slice();
    for (i = 0; i < sl.length; i++) {
      var sx = x + sl[i][0], sy = y + sl[i][1];
      var bi = 0, bd = 1e12;
      for (var j = 0; j < free.length; j++) {
        var d = R.dist2(free[j].x, free[j].y, sx, sy);
        if (d < bd) { bd = d; bi = j; }
      }
      var u = free[bi];
      free[bi] = free[free.length - 1]; free.pop();
      var px = R.clamp(sx, 6, W.pw - 6), py = R.clamp(sy, 6, W.ph - 6);
      if (u.layer !== 2) {
        var sc = W.cellAt(px, py);
        if (!W.nav.pass[u.layer][sc]) {
          var c = W.nav.nearestPassable(u.layer, sc % W.w, (sc / W.w) | 0, 5);
          if (c >= 0) { px = (c % W.w + 0.5) * TILE; py = (((c / W.w) | 0) + 0.5) * TILE; }
          else { px = x; py = y; }
        }
      }
      Units.give(W, u, { type: type, x: px, y: py, goal: goal, targetId: 0 }, queued);
    }
    return n;
  }

  Cmd.move = function (W, teamId, ids, x, y, queued) { return groupMove(W, teamId, ids, x, y, queued, 'move'); };
  Cmd.attackMove = function (W, teamId, ids, x, y, queued) { return groupMove(W, teamId, ids, x, y, queued, 'amove'); };

  Cmd.attack = function (W, teamId, ids, targetId, queued) {
    var t = W.byId.get(targetId), us = own(W, teamId, ids), n = 0;
    if (!t || t.dead || t.kind === 'node') return 0;
    var rest = [];
    for (var i = 0; i < us.length; i++) {
      if (Units.canHit(us[i], t)) { Units.give(W, us[i], { type: 'attack', targetId: targetId }, queued); n++; }
      else rest.push(us[i].id);
    }
    if (rest.length) groupMove(W, teamId, rest, t.x, t.y, queued, 'move');
    return n;
  };

  Cmd.gather = function (W, teamId, ids, nodeId, queued) {
    var node = W.byId.get(nodeId), us = own(W, teamId, ids), n = 0, rest = [];
    if (!node || node.dead || node.kind !== 'node') return 0;
    for (var i = 0; i < us.length; i++) {
      if (us[i].def.worker) { Units.give(W, us[i], Units.gatherOrder(node), queued); n++; }
      else rest.push(us[i].id);
    }
    if (rest.length) groupMove(W, teamId, rest, node.x, node.y, queued, 'move');
    return n;
  };

  Cmd.stop = function (W, teamId, ids) {
    var us = own(W, teamId, ids);
    for (var i = 0; i < us.length; i++) Units.give(W, us[i], { type: 'idle' }, false);
  };
  Cmd.hold = function (W, teamId, ids) {
    var us = own(W, teamId, ids);
    for (var i = 0; i < us.length; i++) Units.give(W, us[i], { type: 'hold', targetId: 0 }, false);
  };

  // 채집하던 일꾼에게 다른 일을 시키면, 일을 마친 뒤 하던 채집으로 돌아가게 예약한다
  function giveWork(W, u, order, queued) {
    var prev = u.order, back = null;
    if (!queued && prev.type === 'gather' && prev.nodeId) back = { type: 'gather', nodeId: prev.nodeId, rtype: prev.rtype, nx: prev.nx, ny: prev.ny, state: 'go', t: 0, depotId: 0, resume: true };
    else if (!queued && u.queue.length && u.queue[u.queue.length - 1].resume) back = u.queue[u.queue.length - 1];
    Units.give(W, u, order, queued);
    if (back) u.queue.push(back);
  }

  Cmd.build = function (W, teamId, uid, btype, tx, ty, queued) {
    var team = W.teams[teamId], u = W.byId.get(uid), def = R.BUILDINGS[btype];
    if (!u || u.dead || u.team !== teamId || !u.def.worker || !def || def.faction !== u.def.faction) return { err: { code: 'bad' } };
    var req = W.hasReq(team, def);
    if (req) return { err: { code: 'req', what: req } };
    var lack = W.canAfford(team, def.cost);
    if (lack) return { err: { code: lack } };
    if (!R.canPlace(W, teamId, btype, tx, ty, team.isAI)) return { err: { code: 'place' } };
    W.pay(team, def.cost);
    giveWork(W, u, { type: 'build', btype: btype, tx: tx, ty: ty, paid: true }, queued);
    return { ok: true };
  };

  Cmd.construct = function (W, teamId, ids, bid, queued) {
    var b = W.byId.get(bid), us = own(W, teamId, ids), n = 0;
    if (!b || b.dead || b.built || b.team !== teamId) return 0;
    for (var i = 0; i < us.length; i++) {
      if (us[i].def.worker && us[i].def.worker.build === 'stay') { giveWork(W, us[i], { type: 'construct', bid: bid }, queued); n++; }
    }
    return n;
  };

  Cmd.repair = function (W, teamId, ids, tid, queued) {
    var t = W.byId.get(tid), us = own(W, teamId, ids), n = 0;
    if (!t || t.dead || t.team !== teamId || t.hp >= t.maxHp) return 0;
    if (t.kind === 'unit' && t.def.faction !== 'forge') return 0;
    for (var i = 0; i < us.length; i++) {
      if (us[i].def.worker && us[i].def.worker.repair && us[i].id !== tid) { giveWork(W, us[i], { type: 'repair', tid: tid }, queued); n++; }
    }
    return n;
  };

  Cmd.train = function (W, teamId, bid, utype) {
    var team = W.teams[teamId], b = W.byId.get(bid), def = R.UNITS[utype];
    if (!b || b.dead || b.team !== teamId || !b.built || !def || !b.def.produces || b.def.produces.indexOf(utype) < 0) return { err: { code: 'bad' } };
    var req = W.hasReq(team, def);
    if (req) return { err: { code: 'req', what: req } };
    if (b.queue.length >= 5) return { err: { code: 'queue' } };
    var lack = W.canAfford(team, def.cost);
    if (lack) return { err: { code: lack } };
    if (team.supplyUsed + def.supply > team.supplyCap) return { err: { code: team.supplyCap >= R.MAX_SUPPLY ? 'maxsupply' : 'supply' } };
    W.pay(team, def.cost);
    b.queue.push({ kind: 'unit', id: utype, t: 0, total: def.time, started: false });
    return { ok: true };
  };

  Cmd.research = function (W, teamId, bid, upId) {
    var team = W.teams[teamId], b = W.byId.get(bid), up = R.UPGRADES[upId];
    if (!b || b.dead || b.team !== teamId || !b.built || !up || !b.def.researches || b.def.researches.indexOf(upId) < 0) return { err: { code: 'bad' } };
    if (team.done[upId] || team.researching[upId]) return { err: { code: 'busy' } };
    if (up.requiresUpg && !team.done[up.requiresUpg]) return { err: { code: 'requpg', what: up.requiresUpg } };
    if (b.queue.length >= 5) return { err: { code: 'queue' } };
    var lack = W.canAfford(team, up.cost);
    if (lack) return { err: { code: lack } };
    W.pay(team, up.cost);
    team.researching[upId] = true;
    b.queue.push({ kind: 'upgrade', id: upId, t: 0, total: up.time, started: false });
    return { ok: true };
  };

  // 대기열 취소 (idx 생략 시 맨 뒤). 전액 환불
  Cmd.cancelQueue = function (W, teamId, bid, idx) {
    var team = W.teams[teamId], b = W.byId.get(bid);
    if (!b || b.dead || b.team !== teamId || !b.queue.length) return false;
    if (idx === undefined || idx < 0 || idx >= b.queue.length) idx = b.queue.length - 1;
    var it = b.queue.splice(idx, 1)[0];
    if (it.kind === 'unit') {
      W.refund(team, R.UNITS[it.id].cost);
      if (it.started) team.supplyUsed -= R.UNITS[it.id].supply;
    } else {
      W.refund(team, R.UPGRADES[it.id].cost);
      delete team.researching[it.id];
    }
    return true;
  };

  // 짓는 중인 건물 취소: 75% 환불
  Cmd.cancelBuilding = function (W, teamId, bid) {
    var team = W.teams[teamId], b = W.byId.get(bid);
    if (!b || b.dead || b.team !== teamId || b.built) return false;
    W.refund(team, b.def.cost, 0.75);
    b.dead = true; b.hp = 0;
    W.dead.push(b);
    W.nav.clearOcc(b.tx, b.ty, b.w, b.h);
    W.recount(team);
    W.emit({ t: 'cancelled', team: teamId, x: b.x, y: b.y, size: b.w });
    return true;
  };

  // 진영 기술 (보이는 지점에, 연구 건물이 있고 재사용 대기가 끝났을 때)
  Cmd.power = function (W, teamId, x, y) { return R.Powers.cast(W, teamId, x, y); };

  Cmd.setRally = function (W, teamId, bids, x, y, nodeId) {
    var n = 0;
    for (var i = 0; i < bids.length; i++) {
      var b = W.byId.get(bids[i]);
      if (!b || b.dead || b.team !== teamId || !b.def.produces) continue;
      var rn = nodeId ? W.byId.get(nodeId) : null;
      b.rally = { x: R.clamp(x, 6, W.pw - 6), y: R.clamp(y, 6, W.ph - 6), nodeId: rn && rn.kind === 'node' ? rn.id : 0, res: rn && rn.kind === 'node' ? rn.def.res : null };
      n++;
    }
    return n;
  };

  /* 오른쪽 클릭 한 번으로 알맞은 명령을 고른다. 반환: 수행한 명령 종류 */
  Cmd.smart = function (W, teamId, ids, x, y, target, queued) {
    var us = own(W, teamId, ids);
    if (!us.length) return null;
    if (target && !target.dead) {
      if (target.kind === 'node') {
        var anyWorker = us.some(function (u) { return !!u.def.worker; });
        if (anyWorker) { Cmd.gather(W, teamId, ids, target.id, queued); return 'gather'; }
        Cmd.move(W, teamId, ids, x, y, queued); return 'move';
      }
      if (target.team !== teamId) {
        if (Cmd.attack(W, teamId, ids, target.id, queued)) return 'attack';
        Cmd.move(W, teamId, ids, x, y, queued); return 'move';
      }
      // 아군
      if (target.kind === 'building') {
        var workers = [], others = [], i;
        for (i = 0; i < us.length; i++) (us[i].def.worker ? workers : others).push(us[i].id);
        var done = null;
        if (workers.length) {
          if (!target.built && Cmd.construct(W, teamId, workers, target.id, queued)) done = 'construct';
          else if (target.built && target.hp < target.maxHp && Cmd.repair(W, teamId, workers, target.id, queued)) done = 'repair';
          else if (target.built && target.def.dropoff) {
            // 들고 있는 자원 반납
            var rest = [];
            for (i = 0; i < workers.length; i++) {
              var u = W.byId.get(workers[i]);
              if (u.carry && u.def.worker.style === 'carry') {
                var prev = u.order.type === 'gather' ? u.order : null;
                Units.give(W, u, { type: 'gather', nodeId: prev ? prev.nodeId : 0, rtype: u.carry.res, nx: prev ? prev.nx : u.x, ny: prev ? prev.ny : u.y, state: 'return', t: 0, depotId: target.id }, queued);
                done = 'gather';
              } else rest.push(workers[i]);
            }
            if (rest.length) Cmd.move(W, teamId, rest, x, y, queued);
            if (!done) done = 'move';
          } else Cmd.move(W, teamId, workers, x, y, queued);
        }
        if (others.length) Cmd.move(W, teamId, others, x, y, queued);
        return done || 'move';
      }
      if (target.kind === 'unit' && target.def.faction === 'forge' && target.hp < target.maxHp) {
        if (Cmd.repair(W, teamId, ids, target.id, queued)) return 'repair';
      }
    }
    Cmd.move(W, teamId, ids, x, y, queued);
    return 'move';
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
