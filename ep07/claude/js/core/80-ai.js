/* 해돌전쟁 — 컴퓨터 상대
   사람과 같은 명령 창구(R.Cmd)만 써서 채집·건설·생산·공격·수비를 한다. */
'use strict';
(function (g) {
  var R = g.RTS, TILE = R.TILE, tmpQ = [];

  function AI(W, teamId) {
    this.W = W; this.id = teamId; this.team = W.teams[teamId];
    this.f = this.team.fdef; this.cfg = R.DIFFICULTY[this.team.level];
    this.rng = R.makeRng(((W.seed ^ (teamId * 7919 + 13)) >>> 0) || 7);
    this.wave = 0; this.state = 'gather'; this.waveSize = 0;
    this.nextWaveAt = this.cfg.firstAttack * (0.92 + this.rng.next() * 0.16);
    this.expandAt = (this.cfg.expandAt || 420) * (0.9 + this.rng.next() * 0.2);
    this.lastOrderT = -99; this.lastDefendT = -99; this.lastRallyT = -99;
    this.saving = null; this.staging = null;
    this.probeAt = (this.cfg.probeAt || 0) * (0.9 + this.rng.next() * 0.25);      // 초반 견제를 보내는 때 (0이면 안 보냄)
    this.probed = !this.cfg.probeAt; this.probeUntil = 0; this.probeTarget = null;
    this.nextPowerT = 0;
    this.workers = []; this.army = []; this.blds = []; this.hqs = []; this.byType = {};
    this.unitCount = {}; this.queued = {}; this.ordered = {}; this.nodeLoad = {}; this.threats = [];
    this.armySupply = 0;
  }

  AI.prototype.update = function () {
    var W = this.W;
    if (!this.team.alive || W.over) return;
    if ((W.tick + this.id * 7) % this.cfg.think !== 0) return;
    this.scan();
    this.economy();
    this.construction();
    this.production();
    this.research();
    this.military();
    this.usePower();
  };

  /* ── 상황 파악 ── */
  AI.prototype.scan = function () {
    var W = this.W, id = this.id, i, j, u, b;
    var workers = [], army = [], blds = [], hqs = [], byType = {}, ordered = {}, unitCount = {}, queued = {}, nodeLoad = {}, repairing = {}, constructing = {};
    var armySupply = 0, sites = [];
    for (i = 0; i < W.units.length; i++) {
      u = W.units[i];
      if (u.dead || u.team !== id) continue;
      unitCount[u.type] = (unitCount[u.type] || 0) + 1;
      if (u.def.worker) {
        workers.push(u);
        var o = u.order;
        if (o.type === 'build') { ordered[o.btype] = (ordered[o.btype] || 0) + 1; sites.push({ tx: o.tx, ty: o.ty, s: R.BUILDINGS[o.btype].size }); }
        else if (o.type === 'gather' && o.nodeId) nodeLoad[o.nodeId] = (nodeLoad[o.nodeId] || 0) + 1;
        else if (o.type === 'repair') repairing[o.tid] = (repairing[o.tid] || 0) + 1;
        else if (o.type === 'construct') constructing[o.bid] = (constructing[o.bid] || 0) + 1;
        for (j = 0; j < u.queue.length; j++) if (u.queue[j].type === 'build') { ordered[u.queue[j].btype] = (ordered[u.queue[j].btype] || 0) + 1; sites.push({ tx: u.queue[j].tx, ty: u.queue[j].ty, s: R.BUILDINGS[u.queue[j].btype].size }); }
      } else { army.push(u); armySupply += u.def.supply; }
    }
    this.sites = sites;     // 일꾼이 지으러 가는 중인 자리 (겹쳐 짓지 않게)
    for (i = 0; i < W.buildings.length; i++) {
      b = W.buildings[i];
      if (b.dead || b.team !== id) continue;
      blds.push(b);
      (byType[b.type] = byType[b.type] || []).push(b);
      if (b.def.hq && b.built) hqs.push(b);
      for (j = 0; j < b.queue.length; j++) if (b.queue[j].kind === 'unit') queued[b.queue[j].id] = (queued[b.queue[j].id] || 0) + 1;
    }
    this.workers = workers; this.army = army; this.blds = blds; this.hqs = hqs; this.byType = byType;
    this.ordered = ordered; this.unitCount = unitCount; this.queued = queued; this.nodeLoad = nodeLoad; this.repairing = repairing;
    this.constructing = constructing;     // 건물별로 조립하러 가는 중이거나 조립 중인 일꾼 수
    this.armySupply = armySupply;

    // 기지 근처에 보이는 적
    var threats = [], vis = this.team.visible, lim = 12 * TILE;
    for (i = 0; i < W.units.length; i++) {
      u = W.units[i];
      if (u.dead || u.team === id) continue;
      if (!vis[W.cellAt(u.x, u.y)]) continue;
      var bd = 1e12;
      for (j = 0; j < blds.length; j++) {
        var d = R.dist(u.x, u.y, blds[j].x, blds[j].y) - blds[j].r;
        if (d < bd) bd = d;
      }
      if (bd < lim) { u._bd = bd; threats.push(u); }
    }
    threats.sort(function (a, c) { return a._bd - c._bd; });
    this.threats = threats;
  };

  AI.prototype.have = function (type) {
    return (this.team.counts[type] || 0) + (this.team.pending[type] || 0) + (this.ordered[type] || 0);
  };

  /* ── 살림 ── */
  AI.prototype.pickNode = function (res, u) {
    var W = this.W, style = u.def.worker.style, best = null, bs = 1e12, pass, i, j;
    for (pass = 0; pass < 2 && !best; pass++) {
      for (i = 0; i < W.nodes.length; i++) {
        var n = W.nodes[i];
        if (n.dead || n.def.res !== res) continue;
        var dHq = 1e12;
        for (j = 0; j < this.hqs.length; j++) { var d = R.dist(this.hqs[j].x, this.hqs[j].y, n.x, n.y); if (d < dHq) dHq = d; }
        var load = this.nodeLoad[n.id] || 0;
        var cap = style === 'beam' ? n.def.beamSlots : n.def.carrySlots * 2.3;
        if (pass === 0) {
          if (style !== 'beam' && dHq > 13 * TILE) continue;
          if (load >= cap) continue;
        }
        if (!W.nav.sameRegion(u.layer, u.x, u.y, n.x, n.y + n.h * TILE / 2 + TILE / 2) && !W.nav.sameRegion(u.layer, u.x, u.y, n.x + n.w * TILE / 2 + TILE / 2, n.y) && !W.nav.sameRegion(u.layer, u.x, u.y, n.x - n.w * TILE / 2 - TILE / 2, n.y) && !W.nav.sameRegion(u.layer, u.x, u.y, n.x, n.y - n.h * TILE / 2 - TILE / 2)) continue;
        var s = R.dist(u.x, u.y, n.x, n.y) + load * 90 + (dHq > 13 * TILE ? dHq * (style === 'beam' ? 0.7 : 2) : 0);
        if (s < bs) { bs = s; best = n; }
      }
    }
    return best;
  };

  AI.prototype.sendGather = function (u, res) {
    var n = this.pickNode(res, u);
    if (!n && res === 'dew') n = this.pickNode('sun', u);
    if (!n) return false;
    R.Units.give(this.W, u, R.Units.gatherOrder(n), false);
    this.nodeLoad[n.id] = (this.nodeLoad[n.id] || 0) + 1;
    return true;
  };

  AI.prototype.economy = function () {
    var W = this.W, team = this.team, f = this.f, cfg = this.cfg, id = this.id, i, u;
    // 1) 일꾼 생산
    var nW = this.workers.length + (this.queued[f.worker] || 0);
    var want = Math.min(cfg.maxWorkers, this.hqs.length * 17 + 4);
    if (nW < want) {
      for (i = 0; i < this.hqs.length && nW < want; i++) {
        var hq = this.hqs[i];
        if (hq.queue.length < (team.res.sun > 250 ? 2 : 1)) { if (R.Cmd.train(W, id, hq.id, f.worker).ok) nW++; }
      }
    }
    // 2) 달이슬 일꾼 수 맞추기
    var c = team.counts, n = this.workers.length;
    var wantDew = 0;
    var needDew = !!(c[f.prod2] || c[f.tech] || team.pending[f.tech] || team.pending[f.prod2]);
    if (c[f.prod1] || team.pending[f.prod1]) wantDew = n >= 9 ? 2 : 0;
    if (needDew) wantDew = R.clamp(Math.round(n * 0.27), 3, 8);
    // 쌓인 양에 따라 조절: 달이슬이 남아돌면 해돌로 돌린다
    if (team.res.dew > 450) wantDew = 0;
    else if (team.res.dew > 220 && team.res.dew > team.res.sun * 1.5) wantDew = Math.min(wantDew, 2);
    if (needDew && team.res.sun > 500 && team.res.dew < 100) wantDew += 2;
    var dewNow = 0, sunW = [];
    for (i = 0; i < this.workers.length; i++) {
      u = this.workers[i];
      if (u.order.type !== 'gather') continue;
      if (u.order.rtype === 'dew') dewNow++; else sunW.push(u);
    }
    var moved = 0;
    while (dewNow < wantDew && sunW.length > 4 && moved < 2) {
      u = sunW.pop();
      if (u.carry) continue;
      var before = u.order.nodeId;
      var nd = this.pickNode('dew', u);
      if (!nd) break;
      this.nodeLoad[before] = Math.max(0, (this.nodeLoad[before] || 1) - 1);
      R.Units.give(W, u, R.Units.gatherOrder(nd), false);
      this.nodeLoad[nd.id] = (this.nodeLoad[nd.id] || 0) + 1;
      dewNow++; moved++;
    }
    if (dewNow > wantDew) {
      var back = 0;
      for (i = 0; i < this.workers.length && dewNow > wantDew && back < 2; i++) {
        u = this.workers[i];
        if (u.order.type === 'gather' && u.order.rtype === 'dew' && !u.carry) { if (this.sendGather(u, 'sun')) { dewNow--; back++; } }
      }
    }
    // 3) 노는 일꾼은 일터로
    for (i = 0; i < this.workers.length; i++) {
      u = this.workers[i];
      if (u.order.type !== 'idle') continue;
      if (this.threats.length && R.dist(u.x, u.y, this.threats[0].x, this.threats[0].y) < 5 * TILE) continue;
      this.sendGather(u, dewNow < wantDew ? 'dew' : 'sun');
    }
    // 4) 무쇠 공방: 손이 떠난 공사를 이어 짓고, 상한 건물을 고친다
    if (f.buildStyle === 'stay') {
      for (i = 0; i < this.blds.length; i++) {
        var b = this.blds[i];
        if (!b.built && b.builders === 0 && W.tick - b.born > 45 && !this.constructing[b.id]) {
          // 이미 가고 있는 일꾼이 있으면 또 보내지 않는다
          var w = this.pickBuilder(b.x, b.y, true);
          if (w) { R.Cmd.construct(W, id, [w.id], b.id, false); this.constructing[b.id] = 1; }
        } else if (b.built && !this.threats.length && b.hp < b.maxHp * 0.65 && !this.repairing[b.id]) {
          var w2 = this.pickBuilder(b.x, b.y, true);
          if (w2) { R.Cmd.repair(W, id, [w2.id], b.id, false); this.repairing[b.id] = 1; }
        }
      }
    }
  };

  AI.prototype.pickBuilder = function (x, y, allowAny) {
    var best = null, bd = 1e12;
    for (var i = 0; i < this.workers.length; i++) {
      var u = this.workers[i], t = u.order.type;
      if (t === 'build' || t === 'construct' || t === 'repair' || t === 'attack') continue;
      var d = R.dist(u.x, u.y, x, y) + (u.carry ? 80 : 0) + (t === 'gather' && u.order.rtype === 'dew' ? 120 : 0);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  };

  /* ── 건설 ── */
  AI.prototype.construction = function () {
    var W = this.W, team = this.team, f = this.f, cfg = this.cfg, self = this;
    this.saving = null;
    if (!this.workers.length) return;
    var c = team.counts, time = W.time, nW = this.workers.length;
    function built(t) { return c[t] || 0; }
    function have(t) { return self.have(t); }
    var wants = [];
    var prodCount = built(f.prod1) + built(f.prod2);
    var margin = Math.min(12, 2 + prodCount * 3 + this.hqs.length);
    var inProg = have(f.supply) - built(f.supply);
    if (team.supplyCap < R.MAX_SUPPLY && team.supplyCap - team.supplyUsed <= margin && inProg < (team.supplyUsed > 36 ? 2 : 1)) wants.push([f.supply, true]);
    if (have(f.hq) === 0) wants.push([f.hq, true, 'rebuild']);
    if (have(f.prod1) < 1 && nW >= 8) wants.push([f.prod1, true]);
    if (built(f.prod1) >= 1) {
      if (cfg.towers >= 1 && have(f.tower) < 1 && time > 160) wants.push([f.tower, false]);
      if (have(f.tech) < 1 && nW >= 11) wants.push([f.tech, true]);
      if (have(f.prod2) < 1 && have(f.tech) >= 1 && nW >= 12) wants.push([f.prod2, true]);
      if (have(f.prod1) < 2 && nW >= 13 && cfg.prodCap >= 3) wants.push([f.prod1, false]);
      if (cfg.expand && have(f.hq) < 2 && time > this.expandAt && this.armySupply >= 10 && !this.threats.length) wants.push([f.hq, true, 'expand']);
      if (cfg.towers >= 2 && have(f.tower) < 2 && time > 320) wants.push([f.tower, false]);
      if (team.res.sun > 420 && have(f.prod1) + have(f.prod2) < cfg.prodCap) {
        var p2 = have(f.prod2) < have(f.prod1) && team.res.dew > 140 && built(f.tech) > 0;
        wants.push([p2 ? f.prod2 : f.prod1, false]);
      }
      if (cfg.expand && cfg.id === 2 && have(f.hq) < 3 && time > this.expandAt + 330 && this.armySupply >= 20 && !this.threats.length) wants.push([f.hq, false, 'expand']);
      if (have(f.tower) < cfg.towers + (this.hqs.length - 1) && time > 440) wants.push([f.tower, false]);
    }
    for (var i = 0; i < wants.length; i++) {
      var def = R.BUILDINGS[wants[i][0]];
      if (W.hasReq(team, def)) continue;
      var lack = W.canAfford(team, def.cost);
      if (lack === 'dew') continue;
      if (lack === 'sun') { if (wants[i][1]) { this.saving = def.cost; return; } continue; }
      if (this.place(wants[i][0], wants[i][2])) return;
    }
  };

  AI.prototype.freeWithMargin = function (tx, ty, s, margin) {
    var W = this.W, nav = W.nav, w = W.w, h = W.h, sites = this.sites || [];
    for (var k = 0; k < sites.length; k++) {
      var st = sites[k];
      if (tx - margin < st.tx + st.s && tx + s + margin > st.tx && ty - margin < st.ty + st.s && ty + s + margin > st.ty) return false;
    }
    for (var y = ty - margin; y < ty + s + margin; y++) for (var x = tx - margin; x < tx + s + margin; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      var cidx = y * w + x;
      var inside = x >= tx && x < tx + s && y >= ty && y < ty + s;
      if (inside) { if (nav.terrain[cidx] !== 0 || nav.occ[cidx] !== 0) return false; }
      else if (nav.occ[cidx] !== 0) return false;
    }
    return true;
  };

  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return R.dist(px, py, ax + dx * t, ay + dy * t);
  }

  AI.prototype.findSpot = function (type, hq) {
    var W = this.W, def = R.BUILDINGS[type], s = def.size;
    var hcx = hq.tx + hq.w / 2, hcy = hq.ty + hq.h / 2;
    var fdx = W.w / 2 - hcx, fdy = W.h / 2 - hcy, fl = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
    fdx /= fl; fdy /= fl;
    var nodes = [], i;
    for (i = 0; i < W.nodes.length; i++) {
      var n = W.nodes[i];
      if (!n.dead && R.dist(n.x, n.y, hq.x, hq.y) < 12 * TILE) nodes.push(n);
    }
    var isTower = !!def.weapon, isSupply = !!def.provides && !def.hq;
    var towerAng = this.rng.range(-0.9, 0.9);
    var best = null, bs = 1e12;
    for (var ty = Math.floor(hcy - 15 - s); ty <= hcy + 15; ty++) for (var tx = Math.floor(hcx - 15 - s); tx <= hcx + 15; tx++) {
      if (!this.freeWithMargin(tx, ty, s, 1)) continue;
      var ccx = tx + s / 2, ccy = ty + s / 2, bad = false;
      for (i = 0; i < nodes.length && !bad; i++) {
        var nx = nodes[i].x / TILE, ny = nodes[i].y / TILE;
        if (R.dist(ccx, ccy, nx, ny) < 3 + s / 2) bad = true;
        else if (segDist(ccx, ccy, hcx, hcy, nx, ny) < 1.6 + s / 2) bad = true;
      }
      if (bad) continue;
      var d = R.dist(ccx, ccy, hcx, hcy);
      if (d < 2 + s / 2 + 1.5) continue;
      var dot = (ccx - hcx) * fdx + (ccy - hcy) * fdy, score;
      if (isTower) {
        var ca = Math.cos(towerAng), sa = Math.sin(towerAng);
        var gx = hcx + (fdx * ca - fdy * sa) * 7, gy = hcy + (fdx * sa + fdy * ca) * 7;
        score = R.dist(ccx, ccy, gx, gy);
      } else if (isSupply) score = d + dot * 0.2;
      else score = d - dot * 0.3;
      score += this.rng.next() * 1.2;
      if (score < bs) { bs = score; best = { tx: tx, ty: ty }; }
    }
    return best;
  };

  AI.prototype.pickExpansion = function () {
    var W = this.W, team = this.team, best = null, bs = 1e12, i, j;
    for (i = 0; i < W.map.sites.length; i++) {
      var site = W.map.sites[i];
      var sx = site.cx * TILE, sy = site.cy * TILE, taken = false, sun = 0;
      for (j = 0; j < W.buildings.length; j++) {
        var b = W.buildings[j];
        if (!b.dead && b.def.hq && R.dist(b.x, b.y, sx, sy) < 9 * TILE) { taken = true; break; }
      }
      if (taken) continue;
      for (j = 0; j < W.nodes.length; j++) if (!W.nodes[j].dead && W.nodes[j].site === site.id && W.nodes[j].def.res === 'sun') sun++;
      if (sun < 3) continue;
      var dEnemy = 1e12;
      for (j = 0; j < W.teams.length; j++) {
        if (j === this.id || !W.teams[j].alive) continue;
        var de = R.dist(sx, sy, W.teams[j].startX, W.teams[j].startY);
        if (de < dEnemy) dEnemy = de;
      }
      if (dEnemy < 22 * TILE) continue;
      var d = R.dist(sx, sy, team.startX, team.startY);
      var score = d - dEnemy * 0.35 + (site.kind === 'center' ? 12 * TILE : 0) + (site.kind === 'main' ? 4 * TILE : 0);
      if (score < bs) { bs = score; best = site; }
    }
    return best;
  };

  AI.prototype.place = function (type, mode) {
    var W = this.W, f = this.f, spot = null;
    if (mode === 'expand' || mode === 'rebuild') {
      var site = null;
      if (mode === 'rebuild') {
        var home = W.map.sites[this.team.site];
        if (R.canPlace(W, this.id, type, home.cx - 2, home.cy - 2, true)) site = home;
      }
      if (!site) site = this.pickExpansion();
      if (!site) return false;
      for (var rad = 0; rad <= 3 && !spot; rad++) {
        for (var dy = -rad; dy <= rad && !spot; dy++) for (var dx = -rad; dx <= rad && !spot; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
          if (R.canPlace(W, this.id, type, site.cx - 2 + dx, site.cy - 2 + dy, true)) spot = { tx: site.cx - 2 + dx, ty: site.cy - 2 + dy };
        }
      }
    } else {
      // 가장 넉넉한 본진 주변에 짓는다
      var hq = this.hqs.length ? this.hqs[this.rng.int(Math.min(this.hqs.length, type === f.tower || type === f.supply ? this.hqs.length : 1))] : this.blds[0];
      if (!hq) return false;
      spot = this.findSpot(type, hq);
    }
    if (!spot) return false;
    var s = R.BUILDINGS[type].size;
    var w = this.pickBuilder((spot.tx + s / 2) * TILE, (spot.ty + s / 2) * TILE, false);
    if (!w) return false;
    var r = R.Cmd.build(W, this.id, w.id, type, spot.tx, spot.ty, false);
    if (r.ok) { this.ordered[type] = (this.ordered[type] || 0) + 1; this.sites.push({ tx: spot.tx, ty: spot.ty, s: s }); return true; }
    return false;
  };

  /* ── 생산 ── */
  AI.prototype.production = function () {
    var W = this.W, team = this.team, f = this.f, id = this.id, i, k;
    var counts = {}, total = 0, wsum = 0;
    for (k in f.army) {
      counts[k] = (this.unitCount[k] || 0) + (this.queued[k] || 0); total += counts[k];
      var ud0 = R.UNITS[k];
      if (!W.hasReq(team, ud0) && team.counts[ud0.madeAt]) wsum += f.army[k];
    }
    if (wsum <= 0) return;
    var types = [f.prod2, f.prod1], reserve = 0;
    for (var t = 0; t < types.length; t++) {
      var list = this.byType[types[t]] || [], big = t === 0;
      for (i = 0; i < list.length; i++) {
        var b = list[i];
        if (!b.built || b.queue.length >= (team.res.sun > 480 ? 2 : 1)) continue;
        var bestU = null, bestDef = -1e9;
        for (var p = 0; p < b.def.produces.length; p++) {
          var uid = b.def.produces[p], ud = R.UNITS[uid];
          if (W.hasReq(team, ud)) continue;
          var lack = W.canAfford(team, ud.cost);
          // 큰 유닛은 달이슬만 있으면 후보로 삼고, 해돌이 모자라면 모일 때까지 기본 병력 생산을 잠시 미룬다
          if (lack === 'dew' || (lack === 'sun' && !big)) continue;
          var deficit = f.army[uid] / wsum - counts[uid] / Math.max(1, total);
          if (deficit > bestDef) { bestDef = deficit; bestU = uid; }
        }
        if (!bestU) continue;
        var ud2 = R.UNITS[bestU];
        if (team.supplyUsed + ud2.supply > team.supplyCap) continue;
        if (big && team.res.sun < ud2.cost.sun) { reserve = Math.max(reserve, ud2.cost.sun); continue; }
        if (!big && reserve && team.res.sun - ud2.cost.sun < reserve && this.armySupply >= 8 && !this.threats.length) continue;
        if (this.saving && team.res.sun - ud2.cost.sun < this.saving.sun && this.armySupply >= 6 && !this.threats.length) continue;
        if (R.Cmd.train(W, id, b.id, bestU).ok) { counts[bestU]++; total++; }
      }
    }
  };

  AI.prototype.research = function () {
    var W = this.W, team = this.team, f = this.f;
    if (!this.cfg.upgrades || this.armySupply < 10) return;
    var list = this.byType[f.tech] || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b.built || b.queue.length) continue;
      var order = [f.upgrades[0], f.upgrades[2], f.upgrades[4], f.upgrades[1], f.upgrades[3]];
      for (var k = 0; k < order.length; k++) {
        var up = R.UPGRADES[order[k]];
        if (team.done[up.id] || team.researching[up.id]) continue;
        if (up.requiresUpg && !team.done[up.requiresUpg]) continue;
        if (team.res.sun < up.cost.sun + 120 || team.res.dew < up.cost.dew + 40) break;
        R.Cmd.research(W, this.id, b.id, up.id);
        break;
      }
    }
  };

  /* ── 군사 ── */
  AI.prototype.computeStaging = function (hq) {
    var W = this.W;
    var dx = W.pw / 2 - hq.x, dy = W.ph / 2 - hq.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
    var x = hq.x + dx / l * 9 * TILE, y = hq.y + dy / l * 9 * TILE;
    var c = W.nav.nearestPassable(0, (x / TILE) | 0, (y / TILE) | 0, 8);
    if (c >= 0) { x = (c % W.w + 0.5) * TILE; y = (((c / W.w) | 0) + 0.5) * TILE; }
    return { x: x, y: y };
  };

  AI.prototype.pickTarget = function (cx, cy) {
    var W = this.W, best = null, bd = 1e18, i;
    for (i = 0; i < W.buildings.length; i++) {
      var b = W.buildings[i];
      if (b.dead || b.team === this.id) continue;
      var d = R.dist2(cx, cy, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) return best;
    for (i = 0; i < W.units.length; i++) {
      var u = W.units[i];
      if (u.dead || u.team === this.id) continue;
      var d2 = R.dist2(cx, cy, u.x, u.y);
      if (d2 < bd) { bd = d2; best = u; }
    }
    return best;
  };

  AI.prototype.military = function () {
    var W = this.W, team = this.team, cfg = this.cfg, id = this.id, i, u, ids;
    var army = this.army, now = W.time;
    var hq = this.hqs[0] || this.blds[0];
    if (!hq) return;
    if (!this.staging || (W.tick % 600) < cfg.think) this.staging = this.computeStaging(hq);
    var home = [], attackers = [], probes = [], homeSupply = 0;
    for (i = 0; i < army.length; i++) {
      u = army[i];
      if (u.tag === 1) attackers.push(u);
      else if (u.tag === 2) probes.push(u);
      else { home.push(u); homeSupply += u.def.supply; }
    }
    var threats = this.threats;

    // ── 초반 견제: 본대가 모이기 전에 발 빠른 몇 기를 보내 상대 일터를 찔러 본다 ──
    if (probes.length) {
      var hpNow = 0, hpMax = 0, pcx = 0, pcy = 0, pSup = 0, fSup = 0;
      for (i = 0; i < probes.length; i++) { hpNow += probes[i].hp; hpMax += probes[i].maxHp; pcx += probes[i].x; pcy += probes[i].y; pSup += probes[i].def.supply; }
      pcx /= probes.length; pcy /= probes.length;
      // 눈앞에 버티고 있는 상대 병력과 탑을 센다. 상대가 훨씬 많으면 헛되이 죽지 않고 물러난다 (어려움일수록 몸을 사린다)
      var near = W.queryUnits(pcx, pcy, 8 * TILE, tmpQ);
      for (i = 0; i < near.length; i++) {
        var fe = near[i];
        if (fe.dead || fe.team === id || fe.def.worker || !team.visible[W.cellAt(fe.x, fe.y)] || R.dist(pcx, pcy, fe.x, fe.y) > 8 * TILE) continue;
        fSup += fe.def.supply;
      }
      for (i = 0; i < W.buildings.length; i++) {
        var tb = W.buildings[i];
        if (!tb.dead && tb.team !== id && tb.built && tb.def.weapon && R.dist(pcx, pcy, tb.x, tb.y) < 8 * TILE && W.rectVisible(team, tb)) fSup += 3;
      }
      if (now >= this.probeUntil || hpNow < hpMax * 0.4 || fSup > pSup * (cfg.id >= 2 ? 1.3 : 2.5)) {
        // 시간이 다 됐거나, 많이 다쳤거나, 상대가 훨씬 많으면 돌아온다
        ids = [];
        for (i = 0; i < probes.length; i++) { probes[i].tag = 0; ids.push(probes[i].id); }
        R.Cmd.move(W, id, ids, this.staging.x, this.staging.y, false);
      } else if (this.probeTarget) {
        ids = [];
        for (i = 0; i < probes.length; i++) if (probes[i].order.type === 'idle' && R.dist(probes[i].x, probes[i].y, this.probeTarget.x, this.probeTarget.y) > 5 * TILE) ids.push(probes[i].id);
        if (ids.length) R.Cmd.attackMove(W, id, ids, this.probeTarget.x, this.probeTarget.y, false);
        if (cfg.id >= 2) {
          // 어려움: 건물을 두드리는 대신 일꾼을 골라 친다 (무장한 적과 싸우는 중이면 그대로 싸운다)
          var vis = team.visible;
          for (i = 0; i < probes.length; i++) {
            var pu = probes[i], cur = pu.order.targetId ? W.byId.get(pu.order.targetId) : null;
            if (cur && !cur.dead && cur.kind === 'unit' && (!cur.def.worker || pu.order.type === 'attack')) continue;
            if (W.time - pu.lastHit < 2 && !(cur && cur.kind === 'building')) continue;
            var prey = null, pd = 9 * TILE;
            for (var k = 0; k < W.units.length; k++) {
              var wk = W.units[k];
              if (wk.dead || wk.team === id || !wk.def.worker || !vis[W.cellAt(wk.x, wk.y)] || !R.Units.canHit(pu, wk)) continue;
              var dk = R.dist(pu.x, pu.y, wk.x, wk.y);
              if (dk < pd) { pd = dk; prey = wk; }
            }
            if (prey) R.Cmd.attack(W, id, [pu.id], prey.id, false);
          }
        }
      }
    } else if (!this.probed && now >= this.probeAt && this.state === 'gather') {
      var needP = Math.min(cfg.id >= 2 ? 3 : 2, home.length - 1);             // 집에 적어도 하나는 남긴다
      if (now > this.nextWaveAt - 35) this.probed = true;                   // 너무 늦었다: 본대 공격으로 넘어간다
      else if (!threats.length && needP >= 2) {
        var foe = null, fd = 1e12;
        for (i = 0; i < W.teams.length; i++) {
          if (i === id || !W.teams[i].alive) continue;
          var dF = R.dist(team.startX, team.startY, W.teams[i].startX, W.teams[i].startY);
          if (dF < fd) { fd = dF; foe = W.teams[i]; }
        }
        if (foe) {
          var fast = home.filter(function (x) { return !x.def.weapon.min; });
          fast.sort(function (a, b) { return b.def.speed - a.def.speed || a.id - b.id; });
          fast = fast.slice(0, needP);
          if (fast.length === needP) {
            ids = [];
            var slowP = 99;
            for (i = 0; i < fast.length; i++) slowP = Math.min(slowP, fast[i].def.speed);
            for (i = 0; i < fast.length; i++) {
              fast[i].tag = 2; ids.push(fast[i].id);
              home.splice(home.indexOf(fast[i]), 1); homeSupply -= fast[i].def.supply;
            }
            this.probeTarget = { x: foe.startX, y: foe.startY };
            this.probeUntil = now + 45 + fd / (slowP * TILE) * 1.4;
            this.probed = true;
            R.Cmd.attackMove(W, id, ids, foe.startX, foe.startY, false);
          }
        }
      }
    }

    // ── 수비 ──
    if (threats.length) {
      var tx = threats[0].x, ty = threats[0].y, threatSupply = 0, nearHq = false, groundOnly = true;
      for (i = 0; i < threats.length; i++) {
        threatSupply += threats[i].def.worker ? 0.5 : threats[i].def.supply;
        if (threats[i].layer === 2) groundOnly = false;
        for (var h = 0; h < this.hqs.length; h++) if (R.dist(threats[i].x, threats[i].y, this.hqs[h].x, this.hqs[h].y) < 11 * TILE) nearHq = true;
      }
      if (now - this.lastDefendT > 1.5) {
        this.lastDefendT = now;
        ids = [];
        for (i = 0; i < home.length; i++) {
          u = home[i];
          var o = u.order;
          if (o.type === 'idle' || o.type === 'move' || (o.type === 'guard' && !o.targetId) ||
            (o.type === 'amove' && !o.targetId && R.dist(o.x, o.y, tx, ty) > 6 * TILE)) ids.push(u.id);
        }
        if (ids.length) R.Cmd.attackMove(W, id, ids, tx, ty, false);
        if (this.state === 'attack' && nearHq && threatSupply > homeSupply * 1.3 + 4) {
          // 본진이 위험하다 → 공격대를 불러들인다
          ids = [];
          for (i = 0; i < attackers.length; i++) { attackers[i].tag = 0; attackers[i].cap = 0; ids.push(attackers[i].id); }
          if (ids.length) R.Cmd.attackMove(W, id, ids, tx, ty, false);
          this.state = 'gather'; this.nextWaveAt = now + cfg.waveGap * 0.5;
          attackers = [];
        }
        if (!home.length && cfg.id >= 1 && threats.length <= 3 && groundOnly && threatSupply <= 3) {
          // 군대가 없으면 일꾼이 나선다
          ids = [];
          for (i = 0; i < this.workers.length && ids.length < 6; i++) {
            u = this.workers[i];
            if (u.order.type === 'gather' && R.dist(u.x, u.y, tx, ty) < 9 * TILE) ids.push(u.id);
          }
          if (ids.length) R.Cmd.attack(W, id, ids, threats[0].id, false);
        }
      }
    } else if (now - this.lastRallyT > 3) {
      this.lastRallyT = now;
      ids = [];
      for (i = 0; i < home.length; i++) {
        u = home[i];
        if (u.order.type === 'idle' && R.dist(u.x, u.y, this.staging.x, this.staging.y) > 7 * TILE) ids.push(u.id);
      }
      if (ids.length) R.Cmd.attackMove(W, id, ids, this.staging.x, this.staging.y, false);
      // 싸우러 나갔다 돌아온 일꾼은 economy()가 다시 일터로 보낸다
    }

    // ── 공격 ──
    if (this.state === 'gather') {
      var threshold = Math.min(cfg.waveBase + this.wave * cfg.waveGrow, 62);
      var maxed = team.supplyUsed >= R.MAX_SUPPLY - 6;
      if (!threats.length && now >= this.nextWaveAt && (homeSupply >= threshold || maxed) && home.length >= 3) {
        var slow = 99;
        for (i = 0; i < home.length; i++) slow = Math.min(slow, R.Units.speedOf(W, home[i]));
        for (i = 0; i < home.length; i++) { home[i].tag = 1; home[i].cap = slow; }
        this.state = 'attack'; this.waveSize = home.length; this.lastOrderT = -99;
        attackers = home; home = [];
      }
    }
    if (this.state === 'attack') {
      if (!attackers.length || attackers.length < Math.max(2, this.waveSize * 0.25)) {
        ids = [];
        for (i = 0; i < attackers.length; i++) { attackers[i].tag = 0; attackers[i].cap = 0; ids.push(attackers[i].id); }
        if (ids.length) R.Cmd.move(W, id, ids, this.staging.x, this.staging.y, false);
        this.state = 'gather'; this.wave++;
        this.nextWaveAt = now + cfg.waveGap;
      } else if (now - this.lastOrderT > 2.5) {
        this.lastOrderT = now;
        var cx = 0, cy = 0;
        for (i = 0; i < attackers.length; i++) { cx += attackers[i].x; cy += attackers[i].y; }
        cx /= attackers.length; cy /= attackers.length;
        var target = this.pickTarget(cx, cy);
        if (target) {
          ids = [];
          for (i = 0; i < attackers.length; i++) {
            u = attackers[i];
            var o2 = u.order;
            if (o2.type === 'idle' || (o2.type === 'guard' && !o2.targetId) ||
              (o2.type === 'amove' && !o2.targetId && R.dist(o2.goal ? (o2.goal.cell % W.w + 0.5) * TILE : o2.x, o2.goal ? (((o2.goal.cell / W.w) | 0) + 0.5) * TILE : o2.y, target.x, target.y) > 4 * TILE)) ids.push(u.id);
          }
          if (ids.length) R.Cmd.attackMove(W, id, ids, target.x, target.y, false);
        }
        // 뒤늦게 나온 병력이 모이면 합류시킨다
        if (!threats.length && home.length >= 5) {
          for (i = 0; i < home.length; i++) { home[i].tag = 1; home[i].cap = 0; }
          this.waveSize += home.length;
        }
      }
    }
  };

  /* ── 진영 기술: 적이 몰린 곳(또는 다친 아군이 몰린 곳)을 골라 쓴다 ── */
  AI.prototype.usePower = function () {
    var W = this.W, team = this.team, cfg = this.cfg;
    if (!cfg.powers || W.time < this.nextPowerT || W.time < cfg.powerAt) return;
    this.nextPowerT = W.time + 1.2;
    if (R.Powers.check(W, team)) return;
    var p = R.Powers.of(team), rad = p.radius * TILE, vis = team.visible, pts = [], need, i, j;
    if (p.id === 'bloom') {
      // 싸우다 다친 아군이 모여 있는 곳
      for (i = 0; i < this.army.length; i++) {
        var a = this.army[i], miss = a.maxHp - a.hp;
        if (miss > 8 && W.time - a.lastHit < 5) pts.push({ x: a.x, y: a.y, w: Math.min(miss, p.heal * p.dur) });
      }
      for (i = 0; i < this.blds.length; i++) {
        var ob = this.blds[i], mb = ob.maxHp - ob.hp;
        if (ob.built && mb > 80 && W.time - ob.lastHit < 5) pts.push({ x: ob.x, y: ob.y, w: Math.min(mb, p.healB * p.dur) * 0.5 });
      }
      need = cfg.id >= 2 ? 170 : 230;
    } else {
      var air = p.wpn.air, lob = p.id === 'barrage';
      for (i = 0; i < W.units.length; i++) {
        var u = W.units[i];
        if (u.dead || u.team === this.id || !vis[W.cellAt(u.x, u.y)]) continue;
        if (u.layer === 2 && !air) continue;
        // 포격은 떨어지기까지 틈이 있으니 달리는 적은 덜 쳐준다
        var moving = lob && Math.abs(u.vx) + Math.abs(u.vy) > 24;
        pts.push({ x: u.x, y: u.y, w: (u.def.worker ? 0.8 : u.def.supply) * (moving ? 0.45 : 1) });
      }
      for (i = 0; i < W.buildings.length; i++) {
        var eb = W.buildings[i];
        if (eb.dead || eb.team === this.id || !W.rectVisible(team, eb)) continue;
        pts.push({ x: eb.x, y: eb.y, w: (lob ? 2.2 : 0.7) * (eb.def.weapon ? 1.5 : 1) });
      }
      need = cfg.id >= 2 ? 6 : 8;
    }
    if (!pts.length) return;
    // 후보 지점마다 반경 안의 무게를 더해 가장 묵직한 곳을 고른다
    var lim2 = rad * rad * 0.64, best = null, bs = 0;
    for (i = 0; i < pts.length; i++) {
      var s = 0, cx = 0, cy = 0;
      for (j = 0; j < pts.length; j++) {
        if (R.dist2(pts[i].x, pts[i].y, pts[j].x, pts[j].y) > lim2) continue;
        s += pts[j].w; cx += pts[j].x * pts[j].w; cy += pts[j].y * pts[j].w;
      }
      if (s > bs) { bs = s; best = { x: cx / s, y: cy / s, sx: pts[i].x, sy: pts[i].y }; }
    }
    if (!best || bs < need) return;
    if (!R.Cmd.power(W, this.id, best.x, best.y).ok) R.Cmd.power(W, this.id, best.sx, best.sy);
  };

  R.AI = AI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
