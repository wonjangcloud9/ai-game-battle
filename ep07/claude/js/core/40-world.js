/* 해돌전쟁 — 월드 상태: 팀, 개체 목록, 시야(전장의 안개), 공간 격자, 피해 처리 */
'use strict';
(function (g) {
  var R = g.RTS, TILE = R.TILE;
  var CELL = 64;

  function World(opts) {
    opts = opts || {};
    this.opts = opts;
    this.seed = (opts.seed >>> 0) || 12345;
    this.rng = R.makeRng(this.seed ^ 0x9e3779b9);
    this.map = R.generateMap({ size: opts.mapSize || 'medium', seed: this.seed });
    this.nav = new R.Nav(this.map);
    this.w = this.map.w; this.h = this.map.h;
    this.pw = this.w * TILE; this.ph = this.h * TILE;
    this.tick = 0; this.time = 0; this.nextId = 1;
    this.byId = new Map();
    this.units = []; this.buildings = []; this.nodes = []; this.projectiles = [];
    this.zones = [];          // 진행 중인 진영 기술 (65-powers.js)
    this.dead = [];
    this.events = []; this.keepEvents = !!opts.keepEvents;
    this.teams = []; this.over = false; this.winner = -1;
    this.gridW = Math.ceil(this.pw / CELL); this.gridH = Math.ceil(this.ph / CELL);
    this.grid = [];
    for (var i = 0; i < this.gridW * this.gridH; i++) this.grid.push([]);
    this.sightCache = {};
    this.fogVersion = 0;
    this._initNodes();
    this._initTeams(opts.players || [{ faction: 'forge' }, { faction: 'sprout', ai: 1 }]);
    this.rebuildGrid();
    this.updateFog();
  }

  World.prototype._initNodes = function () {
    var m = this.map;
    for (var i = 0; i < m.nodes.length; i++) {
      var n = m.nodes[i], def = R.NODES[n.kind], s = def.size;
      var node = {
        id: this.nextId++, kind: 'node', type: n.kind, def: def, team: -1,
        tx: n.tx, ty: n.ty, w: s, h: s, x: (n.tx + s / 2) * TILE, y: (n.ty + s / 2) * TILE, r: s * TILE / 2,
        amount: def.amount, max: def.amount, miners: [], site: n.site, dead: false, variant: (i * 7 + 3) % 5
      };
      this.nodes.push(node); this.byId.set(node.id, node);
      this.nav.setOcc(n.tx, n.ty, s, s, node.id, true);
    }
    this.nav.rebuild();
  };

  World.prototype._initTeams = function (players) {
    var m = this.map, rng = this.rng, n = players.length;
    // 시작 위치: 2명이면 대각선 맞은편
    var order = rng.chance(0.5) ? [0, 3, 1, 2] : [1, 2, 0, 3];
    if (rng.chance(0.5)) { var t0 = order[0]; order[0] = order[1]; order[1] = t0; }
    if (rng.chance(0.5)) { var t1 = order[2]; order[2] = order[3]; order[3] = t1; }
    if (this.opts.fixedStarts) order = this.opts.fixedStarts.slice();
    for (var i = 0; i < n; i++) {
      var p = players[i], fdef = R.FACTIONS[p.faction];
      var isAI = p.ai !== undefined && p.ai !== null && p.ai !== false;
      var level = isAI ? (p.ai | 0) : 1;
      var team = {
        id: i, faction: p.faction, fdef: fdef, isAI: isAI, level: level, ai: null,
        name: p.name || (isAI ? fdef.name : '나'), color: p.color !== undefined ? p.color : i,
        res: { sun: p.sun !== undefined ? p.sun : 200, dew: p.dew || 0 },
        supplyUsed: 0, supplyCap: 0,
        upg: { atk: 0, def: 0, spc: false }, done: {}, researching: {},
        alive: true, hasHQ: true, noHqSince: 0, exposed: false, revealAll: !!p.revealAll,
        visible: new Uint8Array(this.w * this.h), explored: new Uint8Array(this.w * this.h),
        counts: {}, pending: {}, ghosts: [],
        gatherMult: isAI ? R.DIFFICULTY[level].gather : 1,
        lastAlert: -99, alertX: 0, alertY: 0, powerAt: 0,
        threat: { x: 0, y: 0, t: -99 },
        site: m.mains[order[i]],
        stats: { produced: 0, lostUnits: 0, kills: 0, built: 0, lostBuildings: 0, razed: 0, sun: 0, dew: 0, spent: 0, powers: 0 }
      };
      this.teams.push(team);
      var site = m.sites[team.site];
      var hq = R.Buildings.create(this, fdef.hq, i, site.cx - 2, site.cy - 2, true);
      team.startX = hq.x; team.startY = hq.y;
      // 시작 지점 둘레는 처음부터 지형을 알고 있다 (건물 지을 자리를 넉넉히)
      this.stamp(team, site.cx, site.cy, 16);
      // 일꾼 6기: 자원과 본진 사이에 줄지어 선다
      var cxm = this.pw / 2, cym = this.ph / 2;
      var back = Math.atan2(hq.y - cym, hq.x - cxm);
      var taken = {};
      for (var k = 0; k < 6; k++) {
        var a = back + (k - 2.5) * 0.3;
        var ux = hq.x + Math.cos(a) * 100, uy = hq.y + Math.sin(a) * 100;
        var u = R.Units.spawn(this, fdef.worker, i, ux, uy, false);
        u.angle = a;
        // 시작 일꾼은 곧바로 가장 가까운 해돌을 캐러 간다 (서로 다른 무더기로)
        var bestN = null, bd = 1e12;
        for (var q = 0; q < this.nodes.length; q++) {
          var nd = this.nodes[q];
          if (nd.def.res !== 'sun' || taken[nd.id]) continue;
          var dd = R.dist2(ux, uy, nd.x, nd.y);
          if (dd < bd) { bd = dd; bestN = nd; }
        }
        if (bestN && bd < 400 * 400) { taken[bestN.id] = 1; u.order = R.Units.gatherOrder(bestN); }
      }
      this.recount(team);
    }
  };

  World.prototype.hostile = function (a, b) { return a !== b && a >= 0 && b >= 0; };

  World.prototype.cellAt = function (x, y) {
    var cx = (x / TILE) | 0, cy = (y / TILE) | 0;
    if (cx < 0) cx = 0; else if (cx >= this.w) cx = this.w - 1;
    if (cy < 0) cy = 0; else if (cy >= this.h) cy = this.h - 1;
    return cy * this.w + cx;
  };

  World.prototype.emit = function (ev) { if (this.keepEvents) this.events.push(ev); };

  /* ── 공간 격자 ── */
  World.prototype.rebuildGrid = function () {
    var grid = this.grid, gw = this.gridW, gh = this.gridH, i;
    for (i = 0; i < grid.length; i++) grid[i].length = 0;
    var units = this.units;
    for (i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.dead) continue;
      var gx = (u.x / CELL) | 0, gy = (u.y / CELL) | 0;
      if (gx < 0) gx = 0; else if (gx >= gw) gx = gw - 1;
      if (gy < 0) gy = 0; else if (gy >= gh) gy = gh - 1;
      grid[gy * gw + gx].push(u);
    }
  };

  // (x,y) 주변 r 안의 유닛 후보를 out에 담아 돌려준다 (정확한 거리 판정은 호출자가)
  World.prototype.queryUnits = function (x, y, r, out) {
    out.length = 0;
    var gw = this.gridW, gh = this.gridH, grid = this.grid;
    var x0 = ((x - r) / CELL) | 0, x1 = ((x + r) / CELL) | 0, y0 = ((y - r) / CELL) | 0, y1 = ((y + r) / CELL) | 0;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= gw) x1 = gw - 1; if (y1 >= gh) y1 = gh - 1;
    for (var gy = y0; gy <= y1; gy++) for (var gx = x0; gx <= x1; gx++) {
      var c = grid[gy * gw + gx];
      for (var i = 0; i < c.length; i++) out.push(c[i]);
    }
    return out;
  };

  /* ── 전장의 안개 ── */
  World.prototype.sightOffsets = function (rad) {
    var key = Math.round(rad * 2);
    var c = this.sightCache[key];
    if (c) return c;
    var r = key / 2, out = [], ri = Math.ceil(r);
    for (var dy = -ri; dy <= ri; dy++) for (var dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy <= r * r + 0.5) { out.push(dx); out.push(dy); }
    }
    return (this.sightCache[key] = out);
  };

  World.prototype.stamp = function (team, cx, cy, rad) {
    var off = this.sightOffsets(rad), w = this.w, h = this.h, vis = team.visible, exp = team.explored;
    for (var i = 0; i < off.length; i += 2) {
      var x = cx + off[i], y = cy + off[i + 1];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      var c = y * w + x;
      vis[c] = 1; exp[c] = 1;
    }
  };

  World.prototype.rectVisible = function (team, b) {
    var vis = team.visible, w = this.w;
    if (vis[((b.y / TILE) | 0) * w + ((b.x / TILE) | 0)]) return true;
    var x1 = b.tx + b.w - 1, y1 = b.ty + b.h - 1;
    return vis[b.ty * w + b.tx] === 1 || vis[b.ty * w + x1] === 1 || vis[y1 * w + b.tx] === 1 || vis[y1 * w + x1] === 1;
  };

  World.prototype.updateFog = function () {
    var teams = this.teams, i, t, j;
    for (i = 0; i < teams.length; i++) {
      t = teams[i];
      if (t.revealAll) { t.visible.fill(1); t.explored.fill(1); }
      else t.visible.fill(0);
    }
    var units = this.units, blds = this.buildings;
    for (i = 0; i < units.length; i++) {
      var u = units[i];
      if (u.dead) continue;
      t = teams[u.team];
      if (t.revealAll) continue;
      this.stamp(t, (u.x / TILE) | 0, (u.y / TILE) | 0, u.def.sight);
    }
    for (i = 0; i < blds.length; i++) {
      var b = blds[i];
      if (b.dead) continue;
      t = teams[b.team];
      if (!t.revealAll) this.stamp(t, (b.x / TILE) | 0, (b.y / TILE) | 0, b.built ? b.def.sight : 3.5);
      // 본진을 잃고 버티는 팀의 건물은 모두에게 드러난다
      if (t.exposed) {
        for (j = 0; j < teams.length; j++) if (j !== b.team && !teams[j].revealAll) this.stamp(teams[j], (b.x / TILE) | 0, (b.y / TILE) | 0, 2.5);
      }
    }
    for (i = 0; i < blds.length; i++) {
      var bb = blds[i];
      if (bb.dead) continue;
      for (j = 0; j < teams.length; j++) {
        if (j === bb.team || (bb.seen & (1 << j))) continue;
        if (this.rectVisible(teams[j], bb)) bb.seen |= (1 << j);
      }
    }
    // 기억 속 건물(유령) 정리: 그 자리가 다시 보이면 지운다
    for (i = 0; i < teams.length; i++) {
      t = teams[i];
      if (!t.ghosts.length) continue;
      var keep = [];
      for (j = 0; j < t.ghosts.length; j++) if (!this.rectVisible(t, t.ghosts[j])) keep.push(t.ghosts[j]);
      t.ghosts = keep;
    }
    this.fogVersion++;
  };

  World.prototype.isVisible = function (teamId, e) {
    var t = this.teams[teamId];
    if (e.kind === 'unit') return t.visible[this.cellAt(e.x, e.y)] === 1;
    return this.rectVisible(t, e);
  };

  /* ── 자원 / 집계 ── */
  World.prototype.addRes = function (team, res, n) {
    var v = n * team.gatherMult;
    team.res[res] += v;
    team.stats[res] += v;
  };

  World.prototype.canAfford = function (team, cost) {
    if (team.res.sun < cost.sun) return 'sun';
    if (team.res.dew < (cost.dew || 0)) return 'dew';
    return null;
  };
  World.prototype.pay = function (team, cost) {
    team.res.sun -= cost.sun; team.res.dew -= (cost.dew || 0);
    team.stats.spent += cost.sun + (cost.dew || 0);
  };
  World.prototype.refund = function (team, cost, ratio) {
    ratio = ratio === undefined ? 1 : ratio;
    team.res.sun += cost.sun * ratio; team.res.dew += (cost.dew || 0) * ratio;
    team.stats.spent -= (cost.sun + (cost.dew || 0)) * ratio;
  };

  // 팀의 건물 수, 보급 한도, 사용 중인 보급을 다시 센다
  World.prototype.recount = function (team) {
    var counts = {}, pending = {}, cap = 0, hasHQ = false, used = 0, i, nb = 0;
    for (i = 0; i < this.buildings.length; i++) {
      var b = this.buildings[i];
      if (b.dead || b.team !== team.id) continue;
      nb++;
      if (b.built) {
        counts[b.type] = (counts[b.type] || 0) + 1;
        cap += b.def.provides || 0;
        if (b.def.hq) hasHQ = true;
        for (var q = 0; q < b.queue.length; q++) {
          var it = b.queue[q];
          if (it.kind === 'unit' && it.started) used += R.UNITS[it.id].supply;
        }
      } else pending[b.type] = (pending[b.type] || 0) + 1;
    }
    for (i = 0; i < this.units.length; i++) {
      var u = this.units[i];
      if (!u.dead && u.team === team.id) used += u.def.supply;
    }
    team.counts = counts; team.pending = pending;
    team.supplyCap = Math.min(R.MAX_SUPPLY, cap);
    team.supplyUsed = used; team.hasHQ = hasHQ; team.buildingCount = nb;
  };

  World.prototype.hasReq = function (team, def) {
    if (!def.requires) return null;
    for (var i = 0; i < def.requires.length; i++) if (!team.counts[def.requires[i]]) return def.requires[i];
    return null;
  };

  /* ── 피해와 죽음 ── */
  World.prototype.damage = function (t, amount, src, srcTeamId) {
    if (!t || t.dead || t.kind === 'node') return 0;
    var team = this.teams[t.team];
    var armor = (t.def.armor || 0) + team.upg.def;
    var dmg = Math.max(amount * 0.3, amount - armor);
    t.hp -= dmg; t.lastHit = this.time; t.hitTick = this.tick;
    var sTeam = src ? src.team : (srcTeamId === undefined ? -1 : srcTeamId);
    // 경보
    if (sTeam >= 0 && sTeam !== t.team) {
      team.threat.x = t.x; team.threat.y = t.y; team.threat.t = this.time;
      if (src && !src.dead) { team.threat.sx = src.x; team.threat.sy = src.y; }
      var far = R.dist2(t.x, t.y, team.alertX, team.alertY) > 640 * 640;
      if (this.time - team.lastAlert > (far ? 4 : 14)) {
        team.lastAlert = this.time; team.alertX = t.x; team.alertY = t.y;
        this.emit({ t: 'alert', team: t.team, x: t.x, y: t.y, building: t.kind === 'building' });
      }
    }
    if (t.hp <= 0) { this.kill(t, src, sTeam); return dmg; }
    // 반격: 한가한 전투 유닛은 때린 상대를 쫓는다
    if (t.kind === 'unit' && src && !src.dead && t.order.type === 'idle' && t.def.weapon && !t.def.worker) {
      if (src.kind !== 'node' && this.hostile(t.team, src.team) && R.Units.canHit(t, src)) {
        t.order = { type: 'guard', hx: t.x, hy: t.y, targetId: src.id };
      }
    }
    return dmg;
  };

  World.prototype.kill = function (e, src, srcTeamId) {
    if (e.dead) return;
    e.dead = true; e.hp = 0;
    this.dead.push(e);
    var sTeam = src ? src.team : (srcTeamId === undefined ? -1 : srcTeamId);
    if (e.kind === 'node') {
      this.nav.clearOcc(e.tx, e.ty, e.w, e.h);
      this.emit({ t: 'depleted', x: e.x, y: e.y, type: e.type });
      return;
    }
    var team = this.teams[e.team];
    if (e.kind === 'unit') {
      R.Units.onDeath(this, e);
      team.stats.lostUnits++;
      team.supplyUsed -= e.def.supply;
      if (sTeam >= 0 && sTeam !== e.team) this.teams[sTeam].stats.kills++;
      if (src && src.kind === 'unit' && !src.dead && src.team !== e.team) {
        src.kills = (src.kills || 0) + 1;
        // 계급: 적을 잡을수록 단단하고 매서워진다 (3 / 7 / 14기 처치)
        if (!src.def.worker) {
          var RK = R.RANKS.kills, rk = src.kills >= RK[2] ? 3 : (src.kills >= RK[1] ? 2 : (src.kills >= RK[0] ? 1 : 0));
          if (rk > (src.rank || 0)) {
            var add = src.def.hp * R.RANKS.bonus * (rk - (src.rank || 0));
            src.rank = rk; src.maxHp += add; src.hp += add;
            this.emit({ t: 'rankup', team: src.team, id: src.id, x: src.x, y: src.y, rank: rk });
          }
        }
      }
      this.emit({ t: 'death', kind: 'unit', type: e.type, team: e.team, x: e.x, y: e.y, r: e.r, layer: e.layer, angle: e.angle });
    } else {
      this.nav.clearOcc(e.tx, e.ty, e.w, e.h);
      team.stats.lostBuildings++;
      if (sTeam >= 0 && sTeam !== e.team) this.teams[sTeam].stats.razed++;
      // 생산 대기열 환불 없음. 지켜보지 못한 팀에게는 유령으로 남는다
      for (var j = 0; j < this.teams.length; j++) {
        if (j === e.team) continue;
        var tj = this.teams[j];
        if ((e.seen & (1 << j)) && !this.rectVisible(tj, e)) {
          tj.ghosts.push({ type: e.type, team: e.team, tx: e.tx, ty: e.ty, w: e.w, h: e.h, x: e.x, y: e.y });
        }
      }
      // 연구 중이던 항목 풀어 주기
      for (var q = 0; q < e.queue.length; q++) if (e.queue[q].kind === 'upgrade') delete team.researching[e.queue[q].id];
      this.recount(team);
      this.emit({ t: 'death', kind: 'building', type: e.type, team: e.team, x: e.x, y: e.y, size: e.w, built: e.built });
    }
  };

  World.prototype.cleanup = function () {
    if (!this.dead.length) return;
    var i;
    for (i = 0; i < this.dead.length; i++) this.byId.delete(this.dead[i].id);
    this.units = this.units.filter(alive);
    this.buildings = this.buildings.filter(alive);
    this.nodes = this.nodes.filter(alive);
    this.dead.length = 0;
  };
  function alive(e) { return !e.dead; }

  /* ── 승패 ── */
  World.prototype.checkVictory = function () {
    if (this.over) return;
    var aliveTeams = [], i, t;
    for (i = 0; i < this.teams.length; i++) {
      t = this.teams[i];
      if (!t.alive) continue;
      this.recount(t);
      if (t.buildingCount === 0) {
        t.alive = false;
        this.emit({ t: 'eliminated', team: i });
        // 남은 유닛은 흩어진다
        for (var k = 0; k < this.units.length; k++) if (this.units[k].team === i && !this.units[k].dead) this.kill(this.units[k], null, -1);
        continue;
      }
      // 본진 없이 오래 버티면 위치가 드러난다
      if (!t.hasHQ) {
        if (!t.noHqSince) t.noHqSince = this.time || 0.01;
        var workers = 0;
        for (var m = 0; m < this.units.length; m++) if (this.units[m].team === i && this.units[m].def.worker && !this.units[m].dead) workers++;
        if (workers === 0 || this.time - t.noHqSince > 40) t.exposed = true;
      } else { t.noHqSince = 0; t.exposed = false; }
      aliveTeams.push(i);
    }
    if (aliveTeams.length <= 1) {
      this.over = true;
      this.winner = aliveTeams.length ? aliveTeams[0] : -1;
      this.emit({ t: 'gameover', winner: this.winner });
    }
    this.cleanup();      // 탈락한 팀의 유닛을 목록에서 바로 치운다 (경기가 끝나면 step이 더 돌지 않으므로)
  };

  R.World = World;
})(typeof globalThis !== 'undefined' ? globalThis : this);
