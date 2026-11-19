/* 청홍대전 — ai: 봇 두뇌 + 팀 단위 라인 배분 */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const C = AOS.C, U = AOS.U, M = AOS.Map;

  const power = (u) => (u.hp + u.shield) * (0.55 + 0.07 * u.level + 0.0016 * (u.ad + u.ap * 0.8)) + 60;

  /* ---------- 팀 상태 ---------- */
  function teamSetup(G, team) {
    const ai = G.teams[team].ai = {
      team, allocT: 0.5, objT: 0, objective: C.MID, playerLane: C.MID, fronts: [null, null, null], frontT: [-1, -1, -1],
      rally: null, lastWant: [2, 1, 2],
    };
    const hs = G.heroes.filter(h => h.team === team);
    const cap = [2, 1, 2], lanes = new Map();
    for (const h of hs) { const pref = h.hd.lane; if (cap[pref] > 0) { lanes.set(h, pref); cap[pref]--; } }
    for (const h of hs) {
      if (lanes.has(h)) continue;
      let best = 0; for (let l = 1; l < 3; l++) if (cap[l] > cap[best]) best = l;
      lanes.set(h, best); cap[best]--;
    }
    for (const h of hs) {
      if (h.brain) h.brain.lane = lanes.get(h);
      if (h.isPlayer) ai.playerLane = lanes.get(h);
    }
    return ai;
  }

  /* 라인별 전선 정보 (팀 기준 전진도) */
  function front(G, team, lane) {
    const ai = G.teams[team].ai;
    if (ai.frontT[lane] === G.t && ai.fronts[lane]) return ai.fronts[lane];
    const L = M.lanes[lane];
    let wave = -1, enemyWave = Infinity, waveN = 0;
    for (const m of G.minions) {
      if (m.lane !== lane || m.dead || m.laneD > 12) continue;
      const prog = M.toProg(team, lane, m.lt);
      if (m.team === team) { if (prog > wave) wave = prog; waveN++; }
      else if (prog < enemyWave) enemyWave = prog;
    }
    let structProg = L.len + 10, structRange = C.CORE_RANGE, own = 0, es = G.cores[1 - team];
    for (const t of G.towers) {
      if (t.dead || t.lane !== lane) continue;
      const prog = M.toProg(team, lane, t.lt);
      if (t.team === team) { if (prog > own) own = prog; }
      else if (prog < structProg) { structProg = prog; structRange = t.range; es = t; }
    }
    const f = { wave, waveN, enemyWave, limit: structProg - structRange - 1.6, own, struct: es, structProg };
    ai.fronts[lane] = f; ai.frontT[lane] = G.t;
    return f;
  }

  function pickObjective(G, team) {
    let best = C.MID, bs = -Infinity;
    for (let l = 0; l < 3; l++) {
      let s = l === C.MID ? 0.6 : 0;
      const o = G.towerOf(1 - team, l, 1), i = G.towerOf(1 - team, l, 2);
      if (!o || o.dead) s += 2; else s += (1 - o.hp / o.maxHp) * 1.5;
      if (!i || i.dead) s += 2.5; else if (!o || o.dead) s += (1 - i.hp / i.maxHp) * 1.5;
      s += G.rng() * 1.2;
      if (s > bs) { bs = s; best = l; }
    }
    return best;
  }

  function allocate(G, team) {
    const ai = G.teams[team].ai;
    const hs = G.heroes.filter(h => h.team === team);
    let want;
    if (G.t < 200) want = [2, 1, 2];
    else {
      if (G.t >= ai.objT) { ai.objT = G.t + 40; ai.objective = pickObjective(G, team); }
      want = [1, 1, 1]; want[ai.objective] += 2;
    }
    // 수비 우선: 우리 구조물 근처에 적 영웅이 몰리면 그 라인으로 집결
    const need = [0, 0, 0];
    for (const s of G.structs) {
      if (s.team !== team || s.dead || !s.vulnerable) continue;
      let e = 0, em = 0;
      for (const u of G.hash.query(s.x, s.y, 18)) {
        if (u.team === team || u.dead) continue;
        if (u.isHero) e++; else if (u.isMinion) em++;
      }
      if (s.kind === 'core') {
        if (e >= 1 || em >= 3) {
          // 코어가 위협받으면 가장 가까운 라인 기준으로 전원 수비
          let l = C.MID, bd = Infinity;
          for (const u of G.hash.query(s.x, s.y, 20)) {
            if (u.team === team || u.dead || u.isStruct) continue;
            const nl = M.nearestLane(u.x, u.y); const d = U.du(u, s);
            if (d < bd) { bd = d; l = nl.lane; }
          }
          need[l] = Math.max(need[l], 4);
        }
      } else if (e >= 2 || (e >= 1 && em >= 4 && s.hp / s.maxHp < 0.6)) need[s.lane] = Math.max(need[s.lane], Math.min(4, e + 1));
    }
    if (need[0] + need[1] + need[2] > 0) {
      for (let l = 0; l < 3; l++) want[l] = Math.max(want[l], need[l]);
      let guard = 0;
      while (want[0] + want[1] + want[2] > 5 && guard++ < 20) {
        let low = -1;
        for (let l = 0; l < 3; l++) if (want[l] > need[l] && want[l] > 0 && (low < 0 || need[l] < need[low] || (need[l] === need[low] && want[l] > want[low]))) low = l;
        if (low < 0) { for (let l = 0; l < 3; l++) if (want[l] > 0 && (low < 0 || need[l] < need[low])) low = l; }
        want[low]--;
      }
    }
    ai.lastWant = want.slice();
    // 플레이어가 실제로 서 있는 라인을 반영
    const pl = hs.find(h => h.isPlayer);
    if (pl) {
      if (!pl.dead) {
        const nl = M.nearestLane(pl.x, pl.y);
        const f = M.bases[team].fountain;
        if (nl.d < 10 && U.dist(pl.x, pl.y, f.x, f.y) > 34) ai.playerLane = nl.lane;
      }
      if (want[ai.playerLane] > 0) want[ai.playerLane]--;
      else { let hi = 0; for (let l = 1; l < 3; l++) if (want[l] > want[hi]) hi = l; want[hi]--; }
    }
    const bots = hs.filter(h => h.brain);
    const cap = want.slice(), assigned = new Map();
    for (const b of bots) { const l = b.brain.lane; if (cap[l] > 0) { cap[l]--; assigned.set(b, l); } }
    for (const b of bots) {
      if (assigned.has(b)) continue;
      let best = -1, bd = Infinity;
      for (let l = 0; l < 3; l++) {
        if (cap[l] <= 0) continue;
        const d = M.laneProject(l, b.x, b.y).d;
        if (d < bd) { bd = d; best = l; }
      }
      if (best < 0) best = b.brain.lane; else cap[best]--;
      assigned.set(b, best);
    }
    for (const [b, l] of assigned) b.brain.lane = l;
  }

  /* ---------- 봇 두뇌 ---------- */
  class Brain {
    constructor(h, prof) {
      this.h = h; this.p = prof; this.lane = h.hd.lane; this.state = 'lane';
      const G = h.G;
      this.thinkT = G.rng() * 0.3; this.lateral = (G.rng() - 0.5) * 6;
      this.focus = null; this.shopped = false; this.dodged = new Map();
      this.diveT = 0; this.lastPos = { x: h.x, y: h.y, t: 0 }; this.pokeT = 0; this.farmT = 0;
      this.S = null;
    }
    update(dt) {
      const h = this.h, G = h.G;
      if (h.dead) { if (!this.shopped) { this.shop(); this.shopped = true; } this.state = 'lane'; this.focus = null; return; }
      this.shopped = false;
      this.thinkT -= dt; if (this.thinkT > 0) return;
      this.thinkT = this.p.think * (0.8 + G.rng() * 0.4);
      if (h.dash || h.cast || h.stunned) return;
      this.think();
    }
    shop() {
      const h = this.h, G = h.G;
      if (!G.canShop(h)) return false;
      let bought = false;
      for (const id of h.hd.build) {
        if (h.items.indexOf(id) >= 0) continue;
        if (h.items.length >= 6 || h.gold < AOS.Items[id].cost) break;
        G.buy(h, id); bought = true;
      }
      return bought;
    }
    nextItemCost() {
      const h = this.h;
      if (h.items.length >= 6) return Infinity;
      for (const id of h.hd.build) if (h.items.indexOf(id) < 0) return AOS.Items[id].cost;
      return Infinity;
    }
    sense() {
      const h = this.h, G = h.G, team = h.team;
      const S = { eh: [], ah: [], em: [], am: [], hpP: h.hp / h.maxHp, mpP: h.maxMp > 0 ? h.mp / h.maxMp : 1 };
      for (const u of G.hash.query(h.x, h.y, 21)) {
        if (u.dead || u === h || u.isStruct) continue;
        const d = U.du(h, u);
        if (u.team === team) { if (u.isHero) { if (d < 17) S.ah.push(u); } else if (d < 15) S.am.push(u); }
        else {
          if (!u.seen[team] || u.stealth) continue;
          if (u.isHero) S.eh.push(u); else if (d < 15) S.em.push(u);
        }
      }
      S.eh.sort((a, b) => U.du(h, a) - U.du(h, b));
      S.nearE = S.eh.length ? U.du(h, S.eh[0]) : 99;
      // 가장 가까운 적 구조물
      let es = null, ed = Infinity, as = null, ad = Infinity;
      for (const s of G.structs) {
        if (s.dead) continue;
        const d = U.du(h, s);
        if (s.team === team) { if (d < ad) { ad = d; as = s; } }
        else if (d < ed) { ed = d; es = s; }
      }
      S.es = es; S.esD = ed; S.as = as; S.asD = ad;
      S.inTower = !!es && ed - h.r <= es.range + 1.0;
      S.towerAim = !!es && es.target === h;
      S.tanks = 0;
      if (es && ed < 30) for (const m of S.am) if (U.du(m, es) - m.r <= es.range) S.tanks++;
      this.S = S;
      return S;
    }
    /* 적 타워 사거리 안에 머물러도 되는가 */
    towerOk(S) {
      const h = this.h, G = h.G, es = S.es;
      if (S.towerAim) return es.hp / es.maxHp < 0.1 && S.hpP > 0.55;
      if (G.t < this.diveT) return true;
      if (S.tanks >= 2) return true;
      if (S.tanks >= 1 && es.target && es.target !== h && h.order && h.order.type === 'attack' && h.order.target === es) return true;
      return false;
    }
    backPoint(dist) {
      const h = this.h, team = h.team;
      const pr = M.laneProject(this.lane, h.x, h.y);
      if (pr.d < 16) {
        const prog = Math.max(2, M.toProg(team, this.lane, pr.t) - dist);
        return M.lanePoint(this.lane, M.toT(team, this.lane, prog));
      }
      const f = M.bases[team].fountain;
      return { x: f.x, y: f.y };
    }
    backOff(S, dist) {
      const p = this.backPoint(dist || 9);
      this.h.cmdMove(p.x, p.y, false, true);
    }
    aim(tg, speed, delay, ground) {
      const h = this.h, G = h.G;
      const d = U.du(h, tg);
      const tt = (speed >= 900 ? 0 : d / speed) + (delay || 0);
      let x = tg.x + tg.vx * tt * this.p.lead, y = tg.y + tg.vy * tt * this.p.lead;
      const err = (G.rng() - 0.5) * 2 * this.p.aimErr;
      if (ground) { x += Math.cos(err * 17) * err * d * 0.6; y += Math.sin(err * 17) * err * d * 0.6; }
      else {
        const dx = x - h.x, dy = y - h.y, c = Math.cos(err), s = Math.sin(err);
        x = h.x + dx * c - dy * s; y = h.y + dx * s + dy * c;
      }
      return { x, y };
    }
    lineBlocked(tg, radius) {
      const h = this.h, G = h.G, d = U.du(h, tg);
      for (const u of G.enemiesInLine(h.team, h.x, h.y, tg.x, tg.y, radius)) {
        if (u === tg || !u.isMinion) continue;
        if (U.du(h, u) < d - 0.5) return true;
      }
      return false;
    }
    pickTarget(S) {
      const h = this.h;
      let best = null, bs = Infinity;
      for (const u of S.eh) {
        const d = U.du(h, u); if (d > 16) continue;
        let s = (u.hp + u.shield) * (100 + u.def) / 100 + d * 28;
        if (u === this.focus) s *= 0.8;
        if (s < bs) { bs = s; best = u; }
      }
      this.focus = best;
      return best;
    }
    advantage(S, tg) {
      const h = this.h, G = h.G, team = h.team;
      let my = power(h), their = 0;
      for (const a of S.ah) if (U.du(a, tg) < 14 || U.du(a, h) < 9) my += power(a) * (a.hp / a.maxHp < 0.25 ? 0.5 : 1);
      let lv = 0, n = 0;
      for (const e of S.eh) if (U.du(e, tg) < 13 || U.du(e, h) < 10) { their += power(e); lv += e.level; n++; }
      // 구조물 영향
      for (const s of G.structs) {
        if (s.dead) continue;
        const d = U.du(s, tg);
        if (s.team !== team && d - tg.r <= s.range + 1) {
          let pen = 700 + 90 * (n ? lv / n : h.level);
          if (S.tanks >= 2) pen *= 0.45;
          their += pen;
        } else if (s.team === team && d - tg.r <= s.range) my += 650;
      }
      their += S.em.length * (G.t < 240 ? 22 : 10);
      my += S.am.length * (G.t < 240 ? 14 : 6);
      let adv = my / Math.max(1, their);
      const tp = tg.hp / tg.maxHp;
      if (tp < 0.3) adv *= 1.35; else if (tp < 0.5) adv *= 1.12;
      if (S.hpP < 0.45) adv *= 0.85;
      return adv;
    }
    /* 반응형 스킬: 치유·방어·불굴 */
    useReactive(S) {
      const h = this.h, G = h.G;
      for (let i = 0; i < 4; i++) {
        const ab = h.hd.abilities[i], ai = ab.ai;
        if (ai.use !== 'heal' && ai.use !== 'teamHeal' && ai.use !== 'lowHp' && ai.use !== 'defensive') continue;
        if (h.castBlock(i)) continue;
        if (ai.use === 'heal') {
          let best = null, bp = 0.66;
          const cands = S.ah.concat([h]);
          for (const a of cands) { const p = a.hp / a.maxHp; if (p < bp && U.du(h, a) <= ai.range) { bp = p; best = a; } }
          if (best && (S.mpP > 0.25 || bp < 0.35)) { h.cmdCast(i, best.x, best.y, best); return true; }
        } else if (ai.use === 'teamHeal') {
          if (!S.eh.length) continue;
          let n = 0, sum = 0;
          for (const a of S.ah.concat([h])) if (U.du(h, a) <= ai.radius) { n++; sum += a.hp / a.maxHp; }
          if ((n >= 2 && sum / n < 0.6) || S.hpP < 0.3) { h.cmdCast(i, h.x, h.y); return true; }
        } else if (ai.use === 'lowHp') {
          if (S.hpP < ai.hp && S.nearE < 12 && G.t - h.lastHurt < 1.5) { h.cmdCast(i, h.x, h.y); return true; }
        } else if (ai.use === 'defensive') {
          if (G.t - h.lastHurt < 0.8 && (S.hpP < 0.75 || S.nearE < 9) && G.rng() < this.p.skillUse) { h.cmdCast(i, h.x, h.y); return true; }
        }
      }
      return false;
    }
    /* 도주용 스킬 */
    useEscape(S, away) {
      const h = this.h, G = h.G;
      if (S.nearE > 9 || G.rng() > this.p.skillUse + 0.2) return false;
      for (let i = 0; i < 4; i++) {
        const ab = h.hd.abilities[i], ai = ab.ai;
        if (h.castBlock(i)) continue;
        if (ai.use === 'mobility' || ai.use === 'gapclose' || (ai.use === 'ground' && ai.gap)) {
          const r = ai.range || 7;
          h.cmdCast(i, h.x + away.x * r, h.y + away.y * r); return true;
        }
        if (ai.use === 'stealth') { h.cmdCast(i, h.x, h.y); return true; }
      }
      // 쫓아오는 적에게 둔화/속박을 걸고 도망
      const e = S.eh[0];
      if (e && S.nearE < 8) {
        for (let i = 0; i < 3; i++) {
          const ab = h.hd.abilities[i], ai = ab.ai;
          if (h.castBlock(i)) continue;
          if (ai.use === 'selfAoe' && !ai.ult && S.nearE < ai.radius) { h.cmdCast(i, h.x, h.y); return true; }
          if (ai.use === 'ground' && !ai.ult && !ai.gap && S.nearE < ai.range) { const p = this.aim(e, 999, ai.delay, true); h.cmdCast(i, p.x, p.y); return true; }
        }
      }
      return false;
    }
    /* 교전·견제 스킬. mode: 'fight' | 'poke' */
    useSkills(S, tg, mode) {
      const h = this.h, G = h.G;
      if (!tg) return false;
      const d = U.du(h, tg), tp = tg.hp / tg.maxHp;
      if (mode === 'poke' && S.mpP < 0.4) return false;
      for (let i = 3; i >= 0; i--) {
        const ab = h.hd.abilities[i], ai = ab.ai;
        if (h.castBlock(i)) continue;
        if (G.rng() > this.p.skillUse) continue;
        if (ai.ult && mode !== 'fight') continue;
        let nearHeroes = 0;
        switch (ai.use) {
          case 'skillshot': {
            if (d > ai.range) break;
            if (ai.ult && !(tp < (ai.execute || 0.7) || S.eh.length >= 3)) break;
            if (!ai.pierce && this.lineBlocked(tg, ab.width || 0.9)) break;
            const p = this.aim(tg, ai.speed, ab.castTime);
            h.cmdCast(i, p.x, p.y); return true;
          }
          case 'ground': {
            if (ai.gap) {
              if (mode !== 'fight' || d < h.range + 1.5 || d > ai.range + 2) break;
              if (S.es && U.du(tg, S.es) - tg.r <= S.es.range + 1 && G.t >= this.diveT && S.tanks < 2) break;
            } else if (d > ai.range + ai.radius * 0.6) break;
            if (ai.ult) {
              for (const e of S.eh) if (U.du(e, tg) <= ai.radius) nearHeroes++;
              if (!(nearHeroes >= 2 || tp < 0.65)) break;
            }
            const p = this.aim(tg, 999, (ai.delay || 0) + ab.castTime, true);
            h.cmdCast(i, p.x, p.y); return true;
          }
          case 'selfAoe': {
            for (const e of S.eh) if (U.du(h, e) - e.r <= ai.radius) nearHeroes++;
            if (ai.ult ? (nearHeroes >= 2 || (nearHeroes >= 1 && tp < 0.55)) : nearHeroes >= 1) { h.cmdCast(i, h.x, h.y); return true; }
            break;
          }
          case 'gapclose': {
            if (mode !== 'fight' || d < h.range + 1.5 || d > ai.range) break;
            if (S.es && U.du(tg, S.es) - tg.r <= S.es.range + 1 && G.t >= this.diveT && S.tanks < 2) break;
            const p = this.aim(tg, 30, 0);
            h.cmdCast(i, p.x, p.y); return true;
          }
          case 'unit': {
            if (d - tg.r > ai.range) break;
            if (ai.ult && tp > ai.execute) break;
            if (ai.gap && (mode !== 'fight' || d < h.range + 1)) break;
            if (ai.gap && S.es && U.du(tg, S.es) - tg.r <= S.es.range + 1 && G.t >= this.diveT && S.tanks < 2) break;
            h.cmdCast(i, tg.x, tg.y, tg); return true;
          }
          case 'steroid':
            if (mode === 'fight' && d - tg.r <= h.range + 2.5) { h.cmdCast(i, h.x, h.y); return true; }
            break;
          case 'stealth':
            if (mode === 'fight' && d > 3.5 && d < 15) { h.cmdCast(i, h.x, h.y); return true; }
            break;
          case 'mobility': {
            if (ai.escapeOnly || mode !== 'fight') break;
            if (h.ranged) {
              const e = S.eh[0];
              if (e && !e.ranged && S.nearE < 4) {       // 근접 영웅이 붙으면 뒤로
                const ax = (h.x - e.x) / (S.nearE || 1), ay = (h.y - e.y) / (S.nearE || 1);
                h.cmdCast(i, h.x + ax * ai.range, h.y + ay * ai.range); return true;
              }
            }
            if (tp < 0.35 && d > h.range + 1 && d < h.range + ai.range) { h.cmdCast(i, tg.x, tg.y); return true; }
            break;
          }
          default: break;
        }
      }
      return false;
    }
    useFarm(S) {
      const h = this.h, G = h.G;
      if (S.em.length < 3 || S.mpP < 0.55 || G.t < this.farmT) return false;
      if (S.eh.length && S.mpP < 0.8) return false;
      let cx = 0, cy = 0;
      for (const m of S.em) { cx += m.x; cy += m.y; }
      cx /= S.em.length; cy /= S.em.length;
      const dC = U.dist(h.x, h.y, cx, cy);
      for (let i = 0; i < 3; i++) {
        const ab = h.hd.abilities[i], ai = ab.ai;
        if (!ai.farm || h.castBlock(i)) continue;
        if (ai.use === 'selfAoe') {
          let n = 0; for (const m of S.em) if (U.du(h, m) <= ai.radius) n++;
          if (n >= 3) { h.cmdCast(i, h.x, h.y); this.farmT = G.t + 2; return true; }
        } else if (ai.use === 'ground') {
          let n = 0; for (const m of S.em) if (U.dist(m.x, m.y, cx, cy) <= ai.radius) n++;
          if (n >= 3 && dC <= ai.range) { h.cmdCast(i, cx, cy); this.farmT = G.t + 2; return true; }
        } else if (ai.use === 'skillshot') {
          if (dC <= ai.range * 0.8 && dC > 1) { h.cmdCast(i, cx, cy); this.farmT = G.t + 2; return true; }
        } else if (ai.use === 'unit') {
          const m = S.em[0];
          if (m && U.du(h, m) - m.r <= ai.range) { h.cmdCast(i, m.x, m.y, m); this.farmT = G.t + 2; return true; }
        }
      }
      return false;
    }
    dodge(S) {
      const h = this.h, G = h.G;
      for (const z of G.zones) {
        if (z.team === h.team || z.friendly || z.done) continue;
        const d = U.dist(h.x, h.y, z.x, z.y);
        if (d > z.radius + h.r + 0.4) continue;
        let dec = this.dodged.get(z.id);
        if (dec === undefined) { dec = G.rng() < (z.active ? Math.min(1, this.p.dodge + 0.35) : this.p.dodge); this.dodged.set(z.id, dec); if (this.dodged.size > 40) this.dodged.clear(); }
        if (!dec) continue;
        let ax = h.x - z.x, ay = h.y - z.y, ad = Math.hypot(ax, ay);
        if (ad < 0.3) { const f = M.bases[h.team].fountain; ax = f.x - h.x; ay = f.y - h.y; ad = Math.hypot(ax, ay) || 1; }
        const tx = z.x + ax / ad * (z.radius + 2.4), ty = z.y + ay / ad * (z.radius + 2.4);
        const p = M.nearestWalkable(tx, ty, 4);
        h.cmdMove(p.x, p.y, false, true);
        return true;
      }
      return false;
    }
    doRetreat(S) {
      const h = this.h, G = h.G, f = M.bases[h.team].fountain;
      const dF = U.dist(h.x, h.y, f.x, f.y);
      if (h.atFountain) {
        this.shop();
        if (S.hpP > 0.93 && S.mpP > 0.8) { this.state = 'lane'; return; }
        if (h.order) h.cmdStop();
        return;
      }
      this.useReactive(S);
      if (h.recall) {
        if (S.nearE < 13) h.cmdMove(f.x, f.y, false, true);
        return;
      }
      const ad = Math.hypot(f.x - h.x, f.y - h.y) || 1;
      if (this.useEscape(S, { x: (f.x - h.x) / ad, y: (f.y - h.y) / ad })) return;
      // 체력이 꽤 회복됐고 주변이 안전하면 그냥 복귀
      if (S.hpP > 0.75 && S.mpP > 0.4 && S.nearE > 18 && this.nextItemCost() > h.gold) { this.state = 'lane'; return; }
      let minionNear = false;
      for (const m of S.em) if (U.du(h, m) < 9) { minionNear = true; break; }
      const safe = S.nearE > 17 && G.t - h.lastHurt > 2.5 && !S.inTower && !minionNear;
      if (safe && dF > 42) { h.cmdRecall(); return; }
      h.cmdMove(f.x, f.y, false, true);
    }
    fight(S, tg) {
      const h = this.h, G = h.G;
      if (this.useReactive(S)) return;
      if (this.useSkills(S, tg, 'fight')) return;
      // 원거리 영웅 카이팅
      if (h.ranged && this.p.lead > 0.5 && !h.wind && h.atkCd > 0.3) {
        const e = S.eh[0];
        if (e && !e.ranged && S.nearE < 3.6) {
          const ax = (h.x - e.x) / (S.nearE || 1), ay = (h.y - e.y) / (S.nearE || 1);
          const p = M.nearestWalkable(h.x + ax * 3, h.y + ay * 3, 3);
          h.cmdMove(p.x, p.y, false, true);
          return;
        }
      }
      h.cmdAttack(tg, true);
    }
    siege(S) {
      const h = this.h, G = h.G, es = S.es;
      if (!es || !es.vulnerable || S.esD > 24) return false;
      const safe = S.tanks >= 2 || (S.tanks >= 1 && es.target && es.target !== h && es.target.isMinion);
      if (!safe) return false;
      let emNear = 0;
      for (const m of S.em) if (U.du(h, m) < h.range + 4) emNear++;
      if (emNear >= 3) return false;
      h.cmdAttack(es, true);
      return true;
    }
    pickMinion(S) {
      const h = this.h, G = h.G;
      let best = null, bs = Infinity;
      for (const m of S.em) {
        const d = U.du(h, m) - m.r;
        if (d > h.range + 4.5) continue;
        if (S.es && U.du(m, S.es) - m.r <= S.es.range && !(S.tanks >= 2) && G.t >= this.diveT && !h.ranged) continue;
        const s = m.hp + d * 12;
        if (s < bs) { bs = s; best = m; }
      }
      return best;
    }
    laning(S, tg) {
      const h = this.h, G = h.G, team = h.team, ai = G.teams[team].ai;
      // 집결 신호
      if (ai.rally && G.t < ai.rally.until) {
        const r = ai.rally;
        if (U.dist(h.x, h.y, r.x, r.y) > 7) {
          h.cmdMove(r.x + this.lateral * 0.6, r.y + (this.lateral > 0 ? 2 : -2), false, true);
          return;
        }
      }
      const lane = this.lane, L = M.lanes[lane];
      const F = front(G, team, lane);
      let stand;
      if (F.wave >= 0) stand = F.wave - (h.ranged ? 4.5 : 0.8);
      else stand = F.own + 3;
      if (F.enemyWave < Infinity) stand = Math.min(stand, F.enemyWave - (h.ranged ? h.range * 0.75 : 1.2));
      if (!(F.wave > F.limit + 1.5 && F.waveN >= 2)) stand = Math.min(stand, F.limit);
      stand = Math.max(stand, Math.min(F.own - 4, F.limit), 4);
      stand = Math.min(stand, L.len - 1);
      const m = this.pickMinion(S);
      if (m) {
        if (this.useFarm(S)) return;
        h.cmdAttack(m, true);
        return;
      }
      const t = M.toT(team, lane, stand);
      const p = M.lanePoint(lane, t), d = M.laneDir(lane, t);
      let tx = p.x - d.y * this.lateral, ty = p.y + d.x * this.lateral;
      if (!M.isWalkable(tx, ty)) { tx = p.x; ty = p.y; }
      if (U.dist(h.x, h.y, tx, ty) > 1.6) h.cmdMove(tx, ty, false, true);
      else if (h.order && h.order.type === 'move') h.cmdStop();
    }
    think() {
      const h = this.h, G = h.G;
      const S = this.sense();
      // 끼임 감지
      if (G.t - this.lastPos.t > 5) {
        if (U.dist(h.x, h.y, this.lastPos.x, this.lastPos.y) < 0.6 && h.order && h.order.type === 'move' && !h.atFountain) { h.order = null; h.repath(); }
        this.lastPos.x = h.x; this.lastPos.y = h.y; this.lastPos.t = G.t;
      }
      if (this.state === 'retreat') { this.doRetreat(S); return; }
      const low = S.hpP < this.p.retreat || (S.hpP < 0.45 && S.mpP < 0.08 && S.nearE > 14);
      if (low && !h.undying) { this.state = 'retreat'; this.doRetreat(S); return; }
      // 우물에서는 충분히 회복하고 물건을 산 뒤 출발
      if (h.atFountain) {
        this.shop();
        if ((S.hpP < 0.85 || S.mpP < 0.6) && S.nearE > 14) { if (h.order) h.cmdStop(); return; }
      }
      // 돈이 충분히 모였고 한가하면 귀환해서 쇼핑
      const cost = this.nextItemCost();
      if (h.gold >= cost + 100 && S.nearE > 20 && !S.inTower && G.t - h.lastHurt > 4 && (S.hpP < 0.7 || h.gold >= cost * 1.5 + 200)) {
        this.state = 'retreat'; this.doRetreat(S); return;
      }
      if (this.dodge(S)) return;
      if (this.useReactive(S)) return;
      const tg = this.pickTarget(S);
      if (S.inTower && !this.towerOk(S)) {
        // 다이브 판단: 빈사 상태의 적을 마무리할 수 있으면 잠깐 들어간다
        if (tg && !S.towerAim && tg.hp / tg.maxHp < 0.22 && S.hpP > 0.6 && h.level >= 3 && this.p.aggro >= 1 && U.du(h, tg) < 9) this.diveT = G.t + 2.5;
        else {
          if (tg) this.useSkills(S, tg, 'poke');
          this.backOff(S, 9);
          return;
        }
      }
      if (tg) {
        const adv = this.advantage(S, tg) * this.p.aggro;
        const tgInTower = S.es && U.du(tg, S.es) - tg.r <= S.es.range + 0.5 && G.t >= this.diveT && S.tanks < 2;
        if (adv >= 1.12 && !tgInTower) { this.fight(S, tg); return; }
        if (adv < 0.72 && S.nearE < 12) {
          const bp = this.backPoint(10);
          const ad = Math.hypot(bp.x - h.x, bp.y - h.y) || 1;
          if (S.hpP < 0.55) this.useEscape(S, { x: (bp.x - h.x) / ad, y: (bp.y - h.y) / ad });
          this.useSkills(S, tg, 'poke');
          h.cmdMove(bp.x, bp.y, false, true);
          return;
        }
        // 비등한 상황: 견제
        if (G.t >= this.pokeT) {
          if (this.useSkills(S, tg, 'poke')) { this.pokeT = G.t + 0.6; return; }
          const d = U.du(h, tg) - tg.r;
          if (d <= h.range + 1 && !tgInTower && S.hpP > 0.5 && adv > 0.9) {
            h.cmdAttack(tg, true); this.pokeT = G.t + 0.9; return;
          }
        } else if (h.order && h.order.type === 'attack' && h.order.target === tg) return;
      }
      if (this.siege(S)) return;
      this.laning(S, tg);
    }
  }

  AOS.AI = {
    front,
    setup(G) {
      const diff = AOS.Difficulty[G.difficulty] || AOS.Difficulty.normal;
      const normal = AOS.Difficulty.normal;
      for (const h of G.heroes) {
        if (h.isPlayer) continue;
        const prof = (h.team === 1 && !G.opts.mirrorSkill) ? diff : normal;
        h.brain = new Brain(h, prof);
        if (h.team === 1) { h.dmgMul = diff.dmg; h.goldMul = diff.gold; }
      }
      teamSetup(G, 0); teamSetup(G, 1);
    },
    update(G, dt) {
      for (let team = 0; team < 2; team++) {
        const ai = G.teams[team].ai;
        ai.allocT -= dt;
        if (ai.allocT <= 0) { ai.allocT = 1.5; allocate(G, team); }
      }
      for (const h of G.heroes) if (h.brain) h.brain.update(dt);
    },
    /* 플레이어의 집결 신호 */
    rally(G, team, x, y, dur) { G.teams[team].ai.rally = { x, y, until: G.t + (dur || 12) }; },
    Brain,
  };
})();
