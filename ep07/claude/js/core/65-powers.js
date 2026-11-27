/* 해돌전쟁 — 진영 기술: 진영마다 하나씩 있는, 재사용 대기 시간이 긴 큰 기술
   연구 건물을 지으면 쓸 수 있고, 보이는 곳을 찍어서 쓴다. 컴퓨터도 같은 창구(R.Cmd.power)로 쓴다. */
'use strict';
(function (g) {
  var R = g.RTS, TILE = R.TILE, DT = R.DT;

  R.POWERS = {
    forge: {
      id: 'barrage', name: '불비 포격', requires: 'draft', cooldown: 75, radius: 2.8,
      desc: '찍은 곳에 불덩이 7발을 퍼붓습니다. 뭉친 적과 건물에 강합니다. (지상만)',
      shells: 7, dmg: 34, splash: 1.3, delay: 1.2, gap: 0.28,
      wpn: { ground: true, air: false, bonus: { structure: 1.5 } }
    },
    sprout: {
      id: 'bloom', name: '생명의 비', requires: 'elder', cooldown: 65, radius: 3.6,
      desc: '찍은 곳의 아군 유닛과 건물을 8초 동안 빠르게 치유합니다.',
      dur: 8, heal: 14, healB: 30
    },
    storm: {
      id: 'tempest', name: '천둥 폭풍', requires: 'weather', cooldown: 75, radius: 3.0,
      desc: '찍은 곳에 6초 동안 벼락이 잇달아 떨어집니다. 공중의 적도 맞습니다.',
      dur: 6, first: 0.7, gap: 0.45, dmg: 28, splash: 0.9,
      wpn: { ground: true, air: true, bonus: { structure: 0.6 } }
    }
  };

  var P = R.Powers = {};
  P.of = function (team) { return R.POWERS[team.faction]; };

  // 지금 쓸 수 있는가: 가능하면 null, 아니면 사유
  P.check = function (W, team) {
    var p = P.of(team);
    if (!team.counts[p.requires]) return { code: 'req', what: p.requires };
    if (W.time < team.powerAt) return { code: 'cooldown', left: Math.ceil(team.powerAt - W.time) };
    return null;
  };

  P.cast = function (W, teamId, x, y) {
    var team = W.teams[teamId];
    if (!team || !team.alive) return { err: { code: 'bad' } };
    var p = P.of(team), err = P.check(W, team);
    if (err) return { err: err };
    x = R.clamp(x, 0, W.pw - 1); y = R.clamp(y, 0, W.ph - 1);
    if (!team.visible[W.cellAt(x, y)]) return { err: { code: 'novision' } };
    var z = { id: p.id, def: p, team: teamId, x: x, y: y, r: p.radius * TILE, t: 0, n: 0, pts: null };
    if (p.id === 'barrage') {
      // 첫 발은 한가운데, 나머지는 원 안에 흩어져 떨어진다. 떨어질 자리는 쓸 때 정해 둔다 (화면에 날아오는 포탄을 그리려고)
      z.pts = [];
      for (var k = 0; k < p.shells; k++) {
        var a = W.rng.range(0, 6.2832), rr = k === 0 ? 0 : Math.sqrt(W.rng.next()) * z.r * 0.9;
        z.pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, at: p.delay + k * p.gap });
      }
    }
    W.zones.push(z);
    team.powerAt = W.time + p.cooldown;
    team.stats.powers = (team.stats.powers || 0) + 1;
    W.emit({ t: 'power', id: p.id, team: teamId, x: x, y: y, r: p.radius * TILE });
    return { ok: true };
  };

  var tmp = [];
  P.update = function (W) {
    var zones = W.zones;
    for (var zi = zones.length - 1; zi >= 0; zi--) {
      var z = zones[zi], d = z.def, done = false, i;
      z.t += DT;
      if (z.id === 'barrage') {
        while (z.n < d.shells && z.t >= z.pts[z.n].at) {
          var pt = z.pts[z.n];
          R.Units.splash(W, pt.x, pt.y, d.splash * TILE, d.dmg, d.wpn, null, z.team, 0);
          W.emit({ t: 'boom', fx: 'mortar', x: pt.x, y: pt.y, r: d.splash * TILE, team: z.team });
          z.n++;
        }
        done = z.n >= d.shells;
      } else if (z.id === 'bloom') {
        var list = W.queryUnits(z.x, z.y, z.r + 20, tmp);
        for (i = 0; i < list.length; i++) {
          var u = list[i];
          if (u.dead || u.team !== z.team || u.hp >= u.maxHp) continue;
          if (R.dist(z.x, z.y, u.x, u.y) <= z.r) u.hp = Math.min(u.maxHp, u.hp + d.heal * DT);
        }
        for (i = 0; i < W.buildings.length; i++) {
          var b = W.buildings[i];
          if (b.dead || b.team !== z.team || b.hp >= b.maxHp || !b.built) continue;
          if (R.Units.edgeDist(z.x, z.y, b) <= z.r) b.hp = Math.min(b.maxHp, b.hp + d.healB * DT);
        }
        done = z.t >= d.dur;
      } else {
        while (z.t < d.dur && z.t >= d.first + z.n * d.gap) {
          // 원 안의 적 하나를 골라 내리친다. 적이 없으면 아무 데나
          var cands = [], c2 = W.queryUnits(z.x, z.y, z.r + 20, tmp);
          for (i = 0; i < c2.length; i++) if (!c2[i].dead && c2[i].team !== z.team && R.dist(z.x, z.y, c2[i].x, c2[i].y) <= z.r) cands.push(c2[i]);
          for (i = 0; i < W.buildings.length; i++) { var bb = W.buildings[i]; if (!bb.dead && bb.team !== z.team && R.dist(z.x, z.y, bb.x, bb.y) <= z.r + bb.r * 0.5) cands.push(bb); }
          var sx, sy;
          if (cands.length) { var tg = cands[W.rng.int(cands.length)]; sx = tg.x + W.rng.range(-8, 8); sy = tg.y + W.rng.range(-8, 8); }
          else { var a2 = W.rng.range(0, 6.2832), r2 = Math.sqrt(W.rng.next()) * z.r; sx = z.x + Math.cos(a2) * r2; sy = z.y + Math.sin(a2) * r2; }
          R.Units.splash(W, sx, sy, d.splash * TILE, d.dmg, d.wpn, null, z.team, 0);
          W.emit({ t: 'boom', fx: 'strike', x: sx, y: sy, r: d.splash * TILE, team: z.team });
          z.n++;
        }
        done = z.t >= d.dur;
      }
      if (done) zones.splice(zi, 1);
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
