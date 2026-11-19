/* 청홍대전 — ai: 봇 두뇌(라인전·막타·견제·후퇴·쇼핑) + 팀 단위 라인 배분 */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const C = AOS.C, U = AOS.U, M = AOS.Map;

  const power = (u) => (u.hp + u.shield) * (0.55 + 0.07 * u.level + 0.0016 * (u.ad + u.ap * 0.8)) + 60;
  /* 경기 단계: 0 = 라인전(각자 자기 라인), 1 = 운영(필요할 때만 한 명 지원), 2 = 결전(한 라인에 최대 셋) */
  const GROUP_T = 720;
  const phaseOf = (G) => (G.t < C.LANE_PHASE ? 0 : G.t < GROUP_T ? 1 : 2);

  /* ---------- 팀 상태 ---------- */
  function teamSetup(G, team) {
    const ai = G.teams[team].ai = {
      team, allocT: 0.5, objT: 0, objective: C.MID, playerLane: C.MID, fronts: [null, null, null], frontT: [-1, -1, -1],
      rally: null, lastWant: [2, 1, 2], helper: null, helpUntil: 0, lanes: [[], [], []],
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
      h.homeLane = lanes.get(h);
      if (h.brain) { h.brain.lane = h.brain.home = lanes.get(h); }
      if (h.isPlayer) ai.playerLane = lanes.get(h);
    }
    formation(G, team);
    return ai;
  }

  /* 라인별 전선 정보 (팀 기준 전진도) */
  function front(G, team, lane) {
    const ai = G.teams[team].ai;
    if (ai.frontT[lane] === G.t && ai.fronts[lane]) return ai.fronts[lane];
    const L = M.lanes[lane];
    let wave = -1, enemyWave = Infinity, waveN = 0, enemyN = 0;
    for (const m of G.minions) {
      if (m.lane !== lane || m.dead || m.laneD > 12) continue;
      const prog = M.toProg(team, lane, m.lt);
      if (m.team === team) { if (prog > wave) wave = prog; waveN++; }
      else { if (prog < enemyWave) enemyWave = prog; enemyN++; }
    }
    let structProg = L.len + 10, structRange = C.CORE_RANGE, own = 0, es = G.cores[1 - team];
    for (const t of G.towers) {
      if (t.dead || t.lane !== lane) continue;
      const prog = M.toProg(team, lane, t.lt);
      if (t.team === team) { if (prog > own) own = prog; }
      else if (prog < structProg) { structProg = prog; structRange = t.range; es = t; }
    }
    const f = { wave, waveN, enemyWave, enemyN, limit: structProg - structRange - 1.6, own, struct: es, structProg };
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

  /* 같은 라인의 아군끼리 겹쳐 서지 않도록 좌우·앞뒤 자리를 나눈다 (한 줄로 몰려다니지 않게) */
  function formation(G, team) {
    const ai = G.teams[team].ai, by = [[], [], []];
    for (const h of G.heroes) {
      if (h.team !== team) continue;
      const l = h.brain ? h.brain.lane : ai.playerLane;
      by[l].push(h);
    }
    for (let l = 0; l < 3; l++) {
      const list = by[l].sort((a, b) => a.slot - b.slot), n = list.length;
      ai.lanes[l] = list;
      // 근접은 앞줄, 원거리는 뒷줄. 같은 줄 안에서는 좌우로 벌린다.
      const SP = n <= 1 ? [0] : n === 2 ? [-3.3, 3.3] : n === 3 ? [-4.4, 0, 4.4] : [-4.6, -1.6, 1.6, 4.6, 0];
      for (let i = 0; i < n; i++) if (list[i].brain) { list[i].brain.lateral = SP[i % SP.length] * (team === 0 ? 1 : -1); list[i].brain.mates = n; }
    }
  }

  function allocate(G, team) {
    const ai = G.teams[team].ai;
    const hs = G.heroes.filter(h => h.team === team);
    const ph = phaseOf(G);
    let want = [2, 1, 2];
    if (ph === 2) {
      if (G.t >= ai.objT) { ai.objT = G.t + 45; ai.objective = pickObjective(G, team); }
      if (G.t >= C.SHOWDOWN) {
        // 결전: 넷이 한 라인으로 밀고, 한 명은 가장 많이 밀리는 다른 라인을 막는다
        want = [0, 0, 0]; want[ai.objective] = 4;
        let other = -1, worst = -1;
        for (let l = 0; l < 3; l++) {
          if (l === ai.objective) continue;
          const F = front(G, team, l), press = F.enemyN + (F.enemyWave < F.own + 12 ? 6 : 0) + (l === C.MID ? 0.5 : 0);
          if (press > worst) { worst = press; other = l; }
        }
        want[other] = 1;
      } else { want = [1, 1, 1]; want[ai.objective] += 2; }
    }
    // 구조물이 위협받는 라인 파악
    const need = [0, 0, 0]; let coreLane = -1;
    for (const s of G.structs) {
      if (s.team !== team || s.dead || !s.vulnerable) continue;
      let e = 0, em = 0;
      for (const u of G.hash.query(s.x, s.y, 18)) {
        if (u.team === team || u.dead) continue;
        if (u.isHero) e++; else if (u.isMinion) em++;
      }
      if (s.kind === 'core') {
        if (e >= 1 || em >= 3) {
          // 코어가 위협받으면 가장 가까운 적이 들어온 라인으로 전원 수비
          let l = C.MID, bd = Infinity;
          for (const u of G.hash.query(s.x, s.y, 20)) {
            if (u.team === team || u.dead || u.isStruct) continue;
            const nl = M.nearestLane(u.x, u.y); const d = U.du(u, s);
            if (d < bd) { bd = d; l = nl.lane; }
          }
          coreLane = l;
        }
      } else if (e >= 2 || (e >= 1 && em >= 4 && s.hp / s.maxHp < 0.6)) need[s.lane] = Math.max(need[s.lane], e);
    }
    if (coreLane >= 0) { want = [0, 0, 0]; want[coreLane] = 4; let rest = 1, l = (coreLane + 1) % 3; while (rest-- > 0) want[l]++; }
    else if (ph >= 1) {
      // 운영 단계: 수비가 모자란 라인에 '한 명만' 보낸다. 나머지는 자기 라인을 지킨다.
      let lane = -1, gap = 0;
      for (let l = 0; l < 3; l++) { const g = need[l] - want[l]; if (g > gap) { gap = g; lane = l; } }
      if (lane >= 0) {
        let from = -1;
        for (let l = 0; l < 3; l++) if (l !== lane && want[l] >= 2 && need[l] < want[l] && (from < 0 || want[l] > want[from])) from = l;
        if (from >= 0) { want[from]--; want[lane]++; }
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
    // 1) 자기 라인에 자리가 있으면 그대로  2) 지금 서 있는 라인  3) 가장 가까운 빈 라인
    for (const b of bots) { const l = b.brain.home; if (cap[l] > 0) { cap[l]--; assigned.set(b, l); } }
    for (const b of bots) { if (assigned.has(b)) continue; const l = b.brain.lane; if (cap[l] > 0) { cap[l]--; assigned.set(b, l); } }
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
    formation(G, team);
  }

  /* ---------- 봇 두뇌 ---------- */
  class Brain {
    constructor(h, prof) {
      this.h = h; this.p = prof; this.lane = this.home = (h.homeLane === undefined ? h.hd.lane : h.homeLane); this.state = 'lane'; this.why = '';
      const G = h.G;
      this.thinkT = G.rng() * 0.3; this.lateral = (G.rng() - 0.5) * 6; this.mates = 1;
      this.focus = null; this.shopped = false; this.dodged = new Map();
      this.diveT = 0; this.lastPos = { x: h.x, y: h.y, t: 0 }; this.pokeT = 0; this.pokeNextT = 0; this.farmT = 0;
      this.seenE = -99; this.swayT = 0; this.sway = 0; this.shopT = 0; this.trig = Infinity; this.trigT = -1;
      this.S = null;
    }
    update(dt) {
      const h = this.h, G = h.G;
      if (h.sp > 0) this.spend();
      if (h.dead) { if (!this.shopped) { this.shop(); this.shopped = true; } this.state = 'lane'; this.focus = null; return; }
      this.shopped = false;
      this.thinkT -= dt; if (this.thinkT > 0) return;
      this.thinkT = this.p.think * (0.8 + G.rng() * 0.4);
      if (h.dash || h.cast || h.stunned) return;
      this.think();
    }
    /* 스킬 포인트: 영웅별 추천 순서대로 찍는다 */
    spend() {
      const h = this.h; let guard = 0;
      while (h.sp > 0 && guard++ < 6) { const s = AOS.nextSkill(h); if (s < 0 || !h.learn(s)) break; }
    }
    /* 본진에서: 추천 빌드 순서대로 살 수 있는 만큼 산다 (완성품을 바로 살 수 있으면 바로, 아니면 재료부터) */
    shop() {
      const h = this.h, G = h.G;
      if (!G.canShop(h)) return false;
      let bought = false, guard = 0;
      while (guard++ < 10) {
        const nb = AOS.nextBuy(h); if (!nb) break;
        if (h.gold >= nb.goalPrice && !G.buyWhy(h, nb.goal)) { G.buy(h, nb.goal); bought = true; continue; }
        if (nb.id !== nb.goal) {
          // 재료를 건너뛰고 중급을 바로 살 수 있는지
          const mid = AOS.Items[nb.goal].from;
          if (mid && mid !== nb.id && h.gold >= AOS.itemPrice(h, mid).cost && !G.buyWhy(h, mid)) { G.buy(h, mid); bought = true; continue; }
          if (h.gold >= nb.price && !G.buyWhy(h, nb.id)) { G.buy(h, nb.id); bought = true; continue; }
        }
        break;
      }
      if (bought) this.trigT = -1;
      return bought;
    }
    /* 귀환해서 살 만한 금액: 다음 '중급 이상' 한 단계를 올릴 수 있는 돈 (그 전에 사야 할 기초 아이템 포함) */
    shopTrigger() {
      const h = this.h, G = h.G;
      if (this.trigT >= 0 && G.t - this.trigT < 4) return this.trig;
      this.trigT = G.t;
      const sim = { items: h.items.slice(), hd: h.hd };
      let sum = 0;
      for (let guard = 0; guard < 5; guard++) {
        const nb = AOS.nextBuy(sim);
        if (!nb) { this.trig = Infinity; return Infinity; }
        const gi = AOS.Items[nb.goal];
        if (gi.tier === 1) { sum += nb.goalPrice; sim.items.push(nb.goal); continue; }
        let node = nb.goal;
        if (gi.tier === 3 && sim.items.indexOf(gi.from) < 0) node = gi.from;
        sum += AOS.itemPrice(sim, node).cost;
        break;
      }
      this.trig = Math.max(600, sum);
      return this.trig;
    }
    sense() {
      const h = this.h, G = h.G, team = h.team;
      const S = { eh: [], ah: [], em: [], am: [], hpP: h.hp / h.maxHp, mpP: h.maxMp > 0 ? h.mp / h.maxMp : 1, human: null };
      for (const u of G.hash.query(h.x, h.y, 21)) {
        if (u.dead || u === h || u.isStruct) continue;
        const d = U.du(h, u);
        if (u.team === team) { if (u.isHero) { if (d < 17) { S.ah.push(u); if (u.isPlayer) S.human = u; } } else if (d < 15) S.am.push(u); }
        else {
          if (!u.seen[team] || u.stealth) continue;
          if (u.isHero) S.eh.push(u); else if (d < 15) S.em.push(u);
        }
      }
      S.eh.sort((a, b) => U.du(h, a) - U.du(h, b));
      S.nearE = S.eh.length ? U.du(h, S.eh[0]) : 99;
      if (S.eh.length) this.seenE = G.t;
      // 가장 가까운 적·아군 구조물
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
      S.provoked = G.t - h.lastHeroHurt < 3;
      this.S = S;
      return S;
    }
    /* 개전 직후에는 먼저 싸움을 걸지 않는다: 0(평화) → 1(평소) */
    calm(S) {
      const t = this.h.G.t;
      return U.clamp((t - C.CALM_END) / (C.CALM_RAMP - C.CALM_END), 0, 1);
    }
    /* 대상을 치려면 내가 적 포탑 사거리 안에 들어가야 하는가
       (포탑 안에서 적 영웅을 치면 미니언이 있어도 포탑이 나를 노린다. 다이브를 결심했을 때만 예외) */
    underEnemyTower(S, tg) {
      const h = this.h, es = S.es;
      if (!es || h.G.t < this.diveT) return false;
      const td = U.du(tg, es) - tg.r;
      if (td > es.range + 0.5) return false;
      if (!h.ranged) return true;
      // 원거리: 포탑 사거리 바깥에 선 채로 닿는 대상만 괜찮다
      const md = U.du(h, es), d = U.du(h, tg);
      if (md - h.r <= es.range + 0.8) return true;
      const k = Math.max(0, d - h.range) / Math.max(0.01, d);          // 사거리에 들 때까지 다가간 뒤의 위치
      const px = h.x + (tg.x - h.x) * k, py = h.y + (tg.y - h.y) * k;
      return U.dist(px, py, es.x, es.y) - h.r <= es.range + 0.8;
    }
    /* 내 라인 자리에서 너무 멀리 쫓아가는 중인가 (라인전 단계에서는 깊이 추격하지 않는다) */
    tooFar(tg, leash) {
      const h = this.h, G = h.G, team = h.team, lane = this.lane;
      const pr = M.laneProject(lane, tg.x, tg.y);
      if (pr.d > 14) return leash < 20;
      const F = front(G, team, lane);
      const base = F.wave >= 0 ? F.wave : F.own + 3;
      return M.toProg(team, lane, pr.t) > base + leash;
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
    /* 불리할 때 물러설 곳: 우리 포탑 바로 뒤 (포탑이 쫓아온 적을 때려 준다) */
    safePoint() {
      const h = this.h, G = h.G, team = h.team, lane = this.lane;
      const pr = M.laneProject(lane, h.x, h.y);
      if (pr.d > 18) { const f = M.bases[team].fountain; return { x: f.x, y: f.y, base: true }; }
      const my = M.toProg(team, lane, pr.t);
      let towerProg = -1;
      for (const t of G.towers) {
        if (t.dead || t.team !== team || t.lane !== lane) continue;
        const p = M.toProg(team, lane, t.lt);
        if (p < my + 4 && p > towerProg) towerProg = p;
      }
      if (towerProg < 0) { const f = M.bases[team].fountain; return { x: f.x, y: f.y, base: true }; }
      const prog = Math.max(2, Math.min(my - 6, towerProg - 5));
      const p = M.lanePoint(lane, M.toT(team, lane, prog));
      return { x: p.x, y: p.y, base: false };
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
          if (G.t - h.lastHeroHurt < 0.8 && (S.hpP < 0.75 || S.nearE < 9) && G.rng() < this.p.skillUse) { h.cmdCast(i, h.x, h.y); return true; }
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
      if (mode === 'poke' && S.mpP < 0.45) return false;
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
              if (S.es && U.du(tg, S.es) - tg.r <= S.es.range + 1 && G.t >= this.diveT) break;
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
            if (S.es && U.du(tg, S.es) - tg.r <= S.es.range + 1 && G.t >= this.diveT) break;
            const p = this.aim(tg, 30, 0);
            h.cmdCast(i, p.x, p.y); return true;
          }
          case 'unit': {
            if (d - tg.r > ai.range) break;
            if (ai.ult && tp > ai.execute) break;
            if (ai.gap && (mode !== 'fight' || d < h.range + 1)) break;
            if (ai.gap && S.es && U.du(tg, S.es) - tg.r <= S.es.range + 1 && G.t >= this.diveT) break;
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
    /* 라인을 밀 때: 미니언 무리에 범위 스킬 */
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
    /* 후퇴: 우리 포탑 뒤로 빠진 다음, 안전하면 귀환해서 회복하고 아이템을 산다 */
    doRetreat(S) {
      const h = this.h, G = h.G, f = M.bases[h.team].fountain;
      const dF = U.dist(h.x, h.y, f.x, f.y);
      if (h.atFountain) {
        this.shop();
        if (S.hpP > 0.93 && S.mpP > 0.8) { this.state = 'lane'; this.why = ''; return; }
        if (h.order) h.cmdStop();
        return;
      }
      this.useReactive(S);
      if (h.recall) {
        if (S.nearE < 11) h.cmdMove(f.x, f.y, false, true);
        return;
      }
      const ad = Math.hypot(f.x - h.x, f.y - h.y) || 1;
      if (G.t - h.lastHeroHurt < 2.5 && this.useEscape(S, { x: (f.x - h.x) / ad, y: (f.y - h.y) / ad })) return;
      // 살 것을 못 살 상황이 됐거나(쇼핑 귀환), 체력이 충분히 돌아왔으면 그냥 라인으로
      if (this.why === 'shop' && (h.gold < this.shopTrigger() || S.provoked)) { this.state = 'lane'; this.why = ''; return; }
      if (this.why === 'hp' && S.hpP > 0.78 && S.mpP > 0.4 && S.nearE > 18 && h.gold < this.shopTrigger()) { this.state = 'lane'; this.why = ''; return; }
      let minionNear = false;
      for (const m of S.em) if (U.du(h, m) < 9) { minionNear = true; break; }
      const safe = S.nearE > 15 && G.t - h.lastHurt > 2.2 && !S.inTower && !minionNear;
      if (safe && dF > 40) { h.cmdRecall(); return; }
      const sp = this.safePoint();
      if (sp.base || U.dist(h.x, h.y, sp.x, sp.y) < 2.5) h.cmdMove(f.x, f.y, false, true);
      else h.cmdMove(sp.x, sp.y, false, true);
    }
    fight(S, tg) {
      const h = this.h;
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
      const h = this.h, es = S.es;
      if (!es || !es.vulnerable || S.esD > 24) return false;
      const safe = S.tanks >= 2 || (S.tanks >= 1 && es.target && es.target !== h && es.target.isMinion);
      if (!safe) return false;
      let emNear = 0;
      for (const m of S.em) if (U.du(h, m) < h.range + 4) emNear++;
      if (emNear >= 3) return false;
      h.cmdAttack(es, true);
      return true;
    }

    /* ----- 막타 -----
       내 공격이 닿는 순간(이동 + 선딜 + 투사체 비행) 미니언의 예상 체력이 내 한 방 피해 이하이면 '지금' 친다.
       아직 아니면 곧 막타가 가능한 미니언 곁에서 기다린다. */
    incoming(m, S) {
      let dps = 0;
      for (const a of S.am) {
        if (a.target !== m || a.dead) continue;
        if (U.du(a, m) - m.r > a.range + 0.6) continue;
        dps += a.ad * a.as * AOS.TUNE.minionVsMinion * 100 / (100 + m.def);
      }
      const as = S.as;
      if (as && as.target === m) dps += Math.max(as.ad, m.maxHp * (m.kind === 'melee' ? 0.45 : m.kind === 'ranged' ? 0.7 : 0.14)) * as.as;
      return dps;
    }
    /* 봇마다, 미니언마다 조금씩 다른 판단 오차 (난이도가 낮을수록 크다) */
    csNoise(m) {
      const err = (1 - this.p.cs) * 0.85;
      if (err <= 0.001) return 1;
      return 1 + (U.hash2(m.id, this.h.id, Math.floor(this.h.G.t / 1.6)) - 0.5) * 2 * err;
    }
    findLastHit(S) {
      const h = this.h, G = h.G;
      const res = { now: null, soon: null, soonT: Infinity };
      let ns = -Infinity;
      // 같은 라인의 아군 봇보다 내가 훨씬 많이 벌었으면 원거리 미니언은 양보한다 (둘이 골고루 크도록)
      let yieldRanged = false;
      for (const a of S.ah) if (a.brain && a.brain.lane === this.lane && h.stats.gold > a.stats.gold * 1.1 + 120) yieldRanged = true;
      for (const m of S.em) {
        const d = U.du(h, m) - m.r, reach = d - h.range;
        if (reach > 6.5) continue;
        // 적 포탑 깊숙이 있는 미니언은 아군 미니언이 맞아 주고 있을 때만
        if (S.es && S.tanks < 2 && G.t >= this.diveT) {
          const md = U.du(m, S.es);
          if (md + (h.ranged ? h.range - 1 : 0) < S.es.range + 1.5) continue;
        }
        if (m._claim && m._claim !== h && m._claimT > G.t && !m._claim.dead) continue;    // 같은 라인의 아군 봇과 겹치지 않게
        // 플레이어가 칠 수 있는 거리의 미니언은 플레이어 몫으로 남겨 둔다 (아군 봇이 내 막타를 가로채지 않는다)
        if (S.human && !S.human.dead && !S.human.recall && U.du(S.human, m) - m.r <= S.human.range + 4) continue;
        // 화면의 금색 막대와 같은 계산(AOS.lastHit)에, 봇마다의 판단 오차를 얹는다
        const lh = AOS.lastHit(G, h, m, this.incoming(m, S)), tHit = lh.tHit, inc = lh.inc, hpAt = lh.hpAt;
        let dmg = lh.dmg * this.csNoise(m);
        if (yieldRanged && m.kind === 'ranged') dmg *= 0.4;
        if (m.hp <= dmg || (hpAt <= dmg * 0.94 && hpAt > 0)) {
          if (m.hp > dmg && hpAt <= 0) continue;
          const sc = m.gold - tHit * 10 - (m.hp <= dmg ? 0 : 3);
          if (sc > ns) { ns = sc; res.now = m; }
        } else if (hpAt > 0) {
          const tk = inc > 0.5 ? (hpAt - dmg) / inc : 30;
          if (tk < res.soonT) { res.soonT = tk; res.soon = m; }
        }
      }
      if (res.now) { res.now._claim = h; res.now._claimT = G.t + 1.3; }
      return res;
    }
    /* 라인을 밀 때 칠 미니언: 곧 막타가 나올 놈은 건드리지 않고, 체력이 많은 놈부터 깎는다 */
    pickPush(S, lh) {
      const h = this.h, G = h.G;
      let best = null, bs = -Infinity;
      for (const m of S.em) {
        const d = U.du(h, m) - m.r;
        if (d > h.range + 4.5) continue;
        if (S.es && U.du(m, S.es) - m.r <= S.es.range && !(S.tanks >= 2) && G.t >= this.diveT && !h.ranged) continue;
        if (m === lh.soon && lh.soonT < 1.6) continue;
        // 플레이어 곁에서는 체력이 넉넉한 미니언만 깎아 주고, 마무리는 플레이어에게 남긴다
        if (S.human && !S.human.dead && U.du(S.human, m) - m.r <= S.human.range + 4 && m.hp <= 2.4 * AOS.hitDamage(S.human, m) + AOS.hitDamage(h, m)) continue;
        const s = m.hp / m.maxHp * 40 - Math.max(0, d - h.range) * 9 + (m.kind === 'siege' ? 12 : 0);
        if (s > bs) { bs = s; best = m; }
      }
      return best;
    }
    /* 라인 운영 방식: 'hold' = 막타만 치며 버티기, 'push' = 미니언을 적극적으로 잡아 밀기 */
    laneMode(S, F) {
      const h = this.h, G = h.G;
      if (G.t >= C.LANE_PHASE) return 'push';
      if (G.t > 70 && G.t - this.seenE > 7) return 'push';                 // 맞상대가 자리를 비웠다
      if (S.asD < 16 && F.enemyN >= 5 && F.waveN <= 2) return 'push';      // 우리 포탑에 큰 무리가 붙었다
      return 'hold';
    }
    laning(S, tg, adv, calm) {
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
      const mode = this.laneMode(S, F);
      // 1) 막타
      const lh = this.findLastHit(S);
      if (lh.now) { h.cmdAttack(lh.now, true); return; }
      const waiting = lh.soon && lh.soonT < 1.1;
      // 2) 견제: 막타가 임박하지 않았을 때 적 영웅을 한두 대 치고 빠진다
      if (tg && calm > 0 && !waiting) {
        const tgInTower = this.underEnemyTower(S, tg);
        if (G.t < this.pokeT) {                       // 견제 동작 중: 치던 건 마저 친다
          if (h.order && h.order.type === 'attack' && h.order.target === tg && !tgInTower) return;
        } else if (G.t >= this.pokeNextT) {
          const want = (calm >= 1 || G.rng() < calm) && G.rng() < 0.75 * this.p.harass;
          if (want && adv > 0.82 && S.hpP > 0.42) {
            const rest = (1.3 + G.rng() * 2.4) / this.p.harass;      // 한 번 견제하고 나면 잠깐 쉰다 (계속 두들기지 않는다)
            if (this.useSkills(S, tg, 'poke')) { this.pokeT = G.t + 0.5; this.pokeNextT = this.pokeT + rest; return; }
            const d = U.du(h, tg) - tg.r;
            let aggroMinions = 0;
            for (const m of S.em) if (U.du(m, h) < 8) aggroMinions++;
            if (d <= h.range + 1.2 && !tgInTower && adv > 0.92 && (aggroMinions <= 3 || S.hpP > 0.75)) {
              h.cmdAttack(tg, true); this.pokeT = G.t + 1.1; this.pokeNextT = this.pokeT + rest; return;
            }
          }
        }
      }
      // 3) 포탑 공성
      if (this.siege(S)) return;
      // 4) 밀기
      if (mode === 'push' && !waiting) {
        const m = this.pickPush(S, lh);
        if (m) {
          if (!(S.human && !S.human.dead) && this.useFarm(S)) return;      // 플레이어 곁에서는 범위 스킬로 미니언을 쓸어 담지 않는다
          h.cmdAttack(m, true);
          return;
        }
      }
      // 5) 자리 잡기
      let stand;
      if (F.wave >= 0) stand = F.wave - (h.ranged ? 4.5 : 0.8);
      else stand = F.own + 3;
      if (F.enemyWave < Infinity) stand = Math.min(stand, F.enemyWave - (h.ranged ? h.range * 0.75 : 1.2));
      if (!(F.wave > F.limit + 1.5 && F.waveN >= 2)) stand = Math.min(stand, F.limit);
      // 체력이 밀리면 한 걸음 뒤에서 막타만 받아먹는다. 서포터는 원래 한 걸음 뒤에 선다.
      if (tg && S.hpP < 0.5 && tg.hp / tg.maxHp > S.hpP + 0.15) stand -= 3.5;
      if (h.hd.role === 'support' && this.mates > 1) stand -= 2.2;
      stand = Math.max(stand, Math.min(F.own - 4, F.limit), 4);
      stand = Math.min(stand, L.len - 1);
      // 곧 막타가 나올 미니언이 사거리 밖이면 미리 다가간다
      if (lh.soon && lh.soonT < 2.6) {
        const m = lh.soon, d = U.du(h, m), need = h.range + m.r - (h.ranged ? 0.9 : 0.2);
        if (d > need) {
          const k = (d - need) / d;
          h.cmdMove(h.x + (m.x - h.x) * k, h.y + (m.y - h.y) * k, false, true);
          return;
        }
        if (h.order) h.cmdStop(true);
        return;
      }
      // 가만히 서 있지 않고 조금씩 좌우로 자리를 바꾼다
      if (G.t >= this.swayT) { this.swayT = G.t + 2.5 + G.rng() * 3; this.sway = (G.rng() < 0.5 ? -1 : 1) * (1.4 + G.rng() * 1.6); }
      const t = M.toT(team, lane, stand);
      const p = M.lanePoint(lane, t), d = M.laneDir(lane, t);
      const lat = U.clamp(this.lateral + this.sway, -5.2, 5.2);
      let tx = p.x - d.y * lat, ty = p.y + d.x * lat;
      if (!M.isWalkable(tx, ty)) { tx = p.x; ty = p.y; }
      if (U.dist(h.x, h.y, tx, ty) > 1.6) h.cmdMove(tx, ty, false, true);
      else if (h.order) h.cmdStop(true);           // 치던 것도 멈춘다 (막타가 아닌 평타로 라인을 밀지 않도록)
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
      // 체력이 없으면 뒤로 뺀다 (적이 둘 이상 붙었거나 초반이면 더 일찍)
      let nearFoes = 0;
      for (const e of S.eh) if (U.du(h, e) < 11) nearFoes++;
      const retreatAt = this.p.retreat + (nearFoes >= 2 ? 0.1 : 0) + (G.t < C.LANE_PHASE ? 0.05 : 0);
      const low = S.hpP < retreatAt || (S.hpP < 0.5 && S.mpP < 0.1 && S.nearE > 14);
      if (low && !h.undying) { this.state = 'retreat'; this.why = 'hp'; this.doRetreat(S); return; }
      // 우물에서는 충분히 회복하고 물건을 산 뒤 출발
      if (h.atFountain) {
        this.shop();
        if ((S.hpP < 0.85 || S.mpP < 0.6) && S.nearE > 14) { if (h.order) h.cmdStop(); return; }
      }
      // 골드가 모였으면 귀환해서 아이템을 산다 (싸우는 중이 아닐 때)
      if (G.t >= this.shopT && !h.atFountain) {
        this.shopT = G.t + 1.5;
        if (h.gold >= this.shopTrigger() && S.nearE > 13 && !S.inTower && G.t - h.lastHeroHurt > 4 && G.t > 90) {
          this.state = 'retreat'; this.why = 'shop'; this.doRetreat(S); return;
        }
      }
      if (this.dodge(S)) return;
      if (this.useReactive(S)) return;
      const tg = this.pickTarget(S);
      let calm = this.calm(S);
      const lanePhase = G.t < C.LANE_PHASE;
      // 개전 초반에는 빈사 상태의 상대를 끝까지 몰아붙이지 않는다 (시작하자마자 죽는 일이 없도록)
      if (tg && G.t < C.MERCY_END && tg.hp < tg.maxHp * 0.35) { calm = 0; S.provoked = false; }
      if (S.inTower && !this.towerOk(S)) {
        // 다이브 판단: 빈사 상태의 적을 마무리할 수 있으면 잠깐 들어간다 (라인전 단계에는 하지 않는다)
        if (tg && !lanePhase && !S.towerAim && tg.hp / tg.maxHp < 0.22 && S.hpP > 0.6 && h.level >= 6 && this.p.aggro >= 1 && U.du(h, tg) < 9) this.diveT = G.t + 2.5;
        else {
          if (tg && calm >= 1) this.useSkills(S, tg, 'poke');
          this.backOff(S, 9);
          return;
        }
      }
      let adv = 1;
      if (tg) {
        adv = this.advantage(S, tg) * this.p.aggro;
        const tgInTower = this.underEnemyTower(S, tg);
        // 전면전: 확실히 유리할 때만. 개전 직후에는 문턱이 훨씬 높고, 먼저 맞았을 때는 받아친다.
        const need = (lanePhase ? 1.2 : 1.07) + (1 - calm) * 0.9;
        const hitBack = S.provoked && adv >= 0.98 + (1 - calm) * 0.7;
        if (!tgInTower && !this.tooFar(tg, lanePhase ? 9 : 22) && ((calm > 0 && adv >= need) || hitBack)) { this.fight(S, tg); return; }
        // 개전 직후: 맞았을 때만, 제자리에서 받아치는 정도로
        if (calm <= 0 && S.provoked && !tgInTower && U.du(h, tg) - tg.r <= h.range + 0.8 && adv > 0.8) { h.cmdAttack(tg, true); return; }
        if (adv < 0.72 && S.nearE < 12) {
          // 불리하다: 우리 포탑 쪽으로 물러난다
          const bp = this.backPoint(10);
          const ad = Math.hypot(bp.x - h.x, bp.y - h.y) || 1;
          if (S.hpP < 0.55 && S.provoked) this.useEscape(S, { x: (bp.x - h.x) / ad, y: (bp.y - h.y) / ad });
          if (calm >= 1) this.useSkills(S, tg, 'poke');
          h.cmdMove(bp.x, bp.y, false, true);
          return;
        }
      }
      this.laning(S, tg, adv, calm);
    }
  }

  AOS.AI = {
    front, phaseOf,
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
      // 시작 골드로 첫 아이템을 사고, 첫 스킬을 배운다
      for (const h of G.heroes) if (h.brain) { h.brain.spend(); h.brain.shop(); }
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
