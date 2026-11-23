/* 어스름 전선 — ai: 봇의 판단 (팀 단위 콜 + 영웅 단위 행동)
   봇은 '자기 팀이 보고 있는 것'만 안다. 수풀·어둠 속 적은 모른다.
   팀 콜: boss(이무기) · elder(고목 정령) · siege(모여서 밀기) · defend(막기) · push(끝내기) · rally(플레이어 신호)
   영웅 상태: lane(라인전) · jungle(정글 돌기) · gank(기습) · call(팀 콜 수행) · fight(교전) · retreat(후퇴) · base(회복) */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map;
  const AI = TW.AI = {};

  /* ---------- 전투력 어림 ---------- */
  const effHp = (u) => (u.hp + u.shield) * (1 + u.def / 100);
  function offense(h) {
    let ready = 0;
    for (let i = 0; i < 4; i++) if (h.cds[i] <= 0.6 && (i < 3 || h.ultReady())) ready += i === 3 ? 2 : 1;
    return (h.ad * h.as * 2.2 + (30 + 14 * h.level) * (0.6 + 0.25 * ready)) * (1 + h.dmgOut);
  }
  const strength = (h) => Math.sqrt(Math.max(1, effHp(h)) * offense(h));
  /* 3초쯤 몰아칠 때 줄 수 있는 피해 어림 */
  function burst(h, tg) {
    let d = h.ad * h.as * 2.5;
    for (let i = 0; i < 3; i++) if (h.cds[i] <= 0.4) d += 45 + 13 * h.level;
    if (h.ultReady() && h.cds[3] <= 0.4) d += 140 + 32 * h.level;
    return d * (1 + h.dmgOut) * 100 / (100 + tg.def);
  }
  AI.effHp = effHp; AI.strength = strength; AI.burst = burst;

  const prog = (team, lane, x, y) => M.toProg(team, lane, M.laneProject(lane, x, y).t);
  function lanePt(team, lane, p, off) {
    const L = M.lanes[lane], t = M.toT(team, lane, U.clamp(p, 2, L.len - 2));
    const a = M.lanePoint(lane, t), d = M.laneDir(lane, t);
    return { x: a.x - d.y * (off || 0), y: a.y + d.x * (off || 0) };
  }
  AI.lanePt = lanePt;
  const SAY_GAP = 9;

  /* =====================================================================
     팀 두뇌
     ===================================================================== */
  class TeamBrain {
    constructor(G, team) {
      this.G = G; this.team = team; this.call = null; this.thinkT = 1.2 + team * 0.37; this.lastSay = -99;
      this.lastBossTry = -99; this.lastGroup = -99; this.lastGank = -99; this.lastElder = -99; this.lastScout = -99;
      this.front = [null, null, null]; this.frontT = 0; this.gankPing = null;
      this.my = G.heroes.filter(h => h.team === team); this.en = G.heroes.filter(h => h.team !== team);
    }
    say(u, text, x, y, kind) {
      if (this.G.t - this.lastSay < SAY_GAP) return;
      this.lastSay = this.G.t;
      this.G.emit('say', { u, text, x, y, team: this.team, kind: kind || 'info' });
    }
    /* 길마다 '우리 미니언의 맨 앞'과 '적 미니언의 맨 앞' */
    updateFronts() {
      const G = this.G, team = this.team;
      for (let lane = 0; lane < 3; lane++) {
        const L = M.lanes[lane];
        let af = -1, ef = L.len + 1, an = 0, en = 0;
        for (const m of G.minions) {
          if (m.lane !== lane || m.dead) continue;
          const p = M.toProg(team, lane, m.lt);
          if (m.team === team) { an++; if (p > af) af = p; } else { en++; if (p < ef) ef = p; }
        }
        const myT = this.outerTower(team, lane), enT = this.outerTower(1 - team, lane);
        const myTp = myT ? M.toProg(team, lane, myT.lt) : 8, enTp = enT ? M.toProg(team, lane, enT.lt) : L.len - 8;
        if (af < 0) af = myTp + 2;
        if (ef > L.len) ef = enTp - 2;
        this.front[lane] = { af, ef, an, en, myT, enT, myTp, enTp, len: L.len };
      }
    }
    /* 그 길에서 가장 바깥에 살아 있는 구조물 (없으면 큰등불) */
    outerTower(team, lane) {
      const G = this.G;
      const t1 = G.towerOf(team, lane, 1); if (t1 && !t1.dead) return t1;
      const t2 = G.towerOf(team, lane, 2); if (t2 && !t2.dead) return t2;
      const c = G.cores[team]; if (!c.lt2) c.lt2 = [0, 1, 2].map(l => M.laneProject(l, c.x, c.y).t);
      return { x: c.x, y: c.y, lt: c.lt2[lane], isCore: true, dead: c.dead, hp: c.hp, maxHp: c.maxHp, range: c.range, r: c.r, unit: c, vulnerable: c.vulnerable, team };
    }
    alive(list) { let n = 0; for (const h of list) if (!h.dead) n++; return n; }
    setCall(type, x, y, dur, members, extra) {
      this.call = Object.assign({ type, x, y, until: this.G.t + dur, members: new Set(members), t0: this.G.t, go: false }, extra || {});
      return this.call;
    }
    update(dt) {
      this.frontT -= dt;
      if (this.frontT <= 0) { this.frontT = 0.5; this.updateFronts(); }
      this.thinkT -= dt;
      if (this.thinkT <= 0) { this.thinkT = 1.0; this.think(); }
    }
    bots(pred) { return this.my.filter(h => !h.dead && h.brain && (!pred || pred(h))); }
    think() {
      const G = this.G, team = this.team, t = G.t;
      const myAlive = this.alive(this.my), enAlive = this.alive(this.en), enDead = 5 - enAlive;
      let lvSum = 0, hpSum = 0, n = 0;
      for (const h of this.my) if (!h.dead) { lvSum += h.level; hpSum += h.hp / h.maxHp; n++; }
      const avgLv = n ? lvSum / n : 1, avgHp = n ? hpSum / n : 0;
      let myStr = 0, enStr = 0;
      for (const h of this.my) if (!h.dead) myStr += strength(h);
      for (const h of this.en) if (!h.dead) enStr += strength(h);
      this.myStr = myStr; this.enStr = enStr; this.enDead = enDead; this.avgLv = avgLv;
      const boss = G.bossCamp.alive[0] || null, elder = G.elderCamp.alive[0] || null;
      let c = this.call;
      // 콜 종료 조건
      if (c) {
        let end = t > c.until;
        if (c.type === 'boss' || c.type === 'contest') { if (!boss) end = true; if (c.type === 'boss' && avgHp < 0.38 && t - c.t0 > 6) end = true; }
        if (c.type === 'elder' && !elder) end = true;
        if ((c.type === 'siege' || c.type === 'push') && c.target && c.target.dead) end = true;
        if (c.type === 'push' && enAlive >= 4 && myStr < enStr * 0.9) end = true;
        if (c.type === 'defend' && c.target && c.target.dead) end = true;
        let live = 0; for (const h of c.members) if (!h.dead) live++;
        if (!live) end = true;
        if (end) { this.call = c = null; }
      }
      // 0) 본진과 안쪽 등불탑: 적 미니언·영웅이 밀고 들어오면 가까운(또는 귀환이 빠른) 영웅이 지키러 간다
      const baseThreat = this.assignGuards();
      if (baseThreat && c && (c.type === 'boss' || c.type === 'elder' || c.type === 'scout')) { this.call = c = null; }
      // 1) 막기: 우리 구조물이 여럿에게 맞고 있다 (플레이어가 부른 집결은 덮어쓰지 않는다 — 본진이 급하면 그 아군만 '본진을 지켜요'로 빠진다)
      if (!c || ((c.type === 'siege' || c.type === 'elder') && !c.byPlayer)) {
        let worst = null, wn = 0;
        for (const s of G.structs) {
          if (s.team !== team || s.dead || !s.vulnerable || t - s.lastHurt > 3) continue;
          let cnt = 0; for (const e of this.en) if (!e.dead && e.seen[team] && U.du(e, s) < 18) cnt++;
          if (cnt >= 2 && cnt > wn) { wn = cnt; worst = s; }
        }
        if (worst) {
          const mem = this.bots(h => M.pathLen(h.x, h.y, worst.x, worst.y) < 95 && h.hp / h.maxHp > 0.35);
          if (mem.length >= 2 || worst.kind === 'core') {
            c = this.setCall('defend', worst.x, worst.y, 22, mem, { target: worst });
            this.say(mem[0] || this.my[0], (worst.kind === 'core' ? '본진' : C.LANE_NAMES[worst.lane]) + ' 막아요!', worst.x, worst.y, 'warn');
          }
        }
      }
      // 2) 끝내기: 적이 여럿 쓰러져 있다 → 가장 깊이 민 길로 몰려간다
      if (!c && enDead >= 3 && t > 300) {
        let minResp = 99; for (const e of this.en) if (e.dead) minResp = Math.min(minResp, e.respawnT);
        if (minResp > 9 || enDead >= 4) {
          const tg = this.pushTarget();
          if (tg) { c = this.setCall('push', tg.x, tg.y, 26, this.bots(), { target: tg.unit || tg, lane: tg.lane }); this.say(this.bots()[0] || this.my[0], '지금이에요, 밀어요!', tg.x, tg.y, 'go'); }
        }
      }
      // 3) 이무기
      if (boss && !c && !baseThreat) {
        const fresh = t - G.bossCamp.upT;
        const can = avgLv >= 6 && myAlive >= 4 && avgHp > 0.62;
        let want = false;
        if (can && fresh > 6) {
          if (enDead >= 2) want = true;
          else if (enDead >= 1 && myAlive >= 4) want = t - this.lastBossTry > 30;
          else if (t - this.lastBossTry > 70 && myStr > enStr * 0.92) want = G.rng() < 0.45;
        }
        // 플레이어가 이미 이무기를 치고 있으면 돕는다
        const p = G.player;
        if (p && p.team === team && !p.dead && U.du(p, boss) < 14 && t - p.lastMonsterHit < 2 && avgLv >= 5) want = true;
        if (want) {
          this.lastBossTry = t;
          const mem = this.bots(h => h.hp / h.maxHp > 0.4 && M.pathLen(h.x, h.y, boss.x, boss.y) < 130);
          if (mem.length >= 3 || (p && p.team === team && mem.length >= 2)) {
            c = this.setCall('boss', boss.x, boss.y, 70, mem, { target: boss });
            this.say(mem.find(h => h.pos === 'jg') || mem[0], '이무기 잡으러 가요!', boss.x, boss.y, 'go');
          }
        }
        // 적이 이무기를 치는 게 보인다 → 가서 싸운다
        if (!c && boss.seen[team] && boss.hp < boss.maxHp * 0.97 && t - boss.lastHurt < 4) {
          let pp = false; if (p && p.team === team && t - p.lastMonsterHit < 4) pp = true;
          if (!pp) {
            const mem = this.bots(h => h.hp / h.maxHp > 0.45 && M.pathLen(h.x, h.y, boss.x, boss.y) < 110);
            if (mem.length >= 3) { c = this.setCall('contest', boss.x, boss.y, 30, mem, { target: boss }); this.say(mem[0], '적이 이무기를 쳐요! 막으러!', boss.x, boss.y, 'warn'); }
          }
        }
        // 적이 넷 이상 안 보인다 → 이무기 쪽을 확인하러 간다
        if (!c && fresh > 25 && avgLv >= 6 && t - this.lastScout > 40) {
          let missing = 0; for (let i = 0; i < 5; i++) if (!this.en[i].dead && t - G.lastSeen[team][i].t > 9) missing++;
          if (missing >= 4) {
            this.lastScout = t;
            const mem = this.bots(h => (h.pos === 'jg' || h.pos === 'sup') && h.hp / h.maxHp > 0.6);
            if (mem.length) { c = this.setCall('scout', boss.x + (team === 0 ? -9 : 9), boss.y, 14, mem, {}); this.say(mem[0], '적이 안 보여요. 이무기 쪽 확인할게요', boss.x, boss.y, 'info'); }
          }
        }
      }
      // 4) 고목 정령: 정글러(+가까운 아군)
      if (elder && !c && !baseThreat && t - G.elderCamp.upT > 4 && t - this.lastElder > 45) {
        const jg = this.my.find(h => h.pos === 'jg' && !h.dead && h.brain);
        if (jg && jg.level >= 5 && jg.hp / jg.maxHp > 0.7 && (!jg.brain.gank)) {
          this.lastElder = t;
          const mem = [jg];
          const mid = this.my.find(h => h.pos === 'mid' && !h.dead && h.brain && h.hp / h.maxHp > 0.6);
          if (mid && jg.level < 8) mem.push(mid);
          c = this.setCall('elder', elder.x, elder.y, 45, mem, { target: elder });
          this.say(jg, '고목 정령 잡을게요', elder.x, elder.y, 'info');
        }
      }
      // 5) 모여서 밀기 (중반 이후, 또는 고목의 힘을 얻은 직후)
      const anyT1Down = G.teams[0].towers < 6 || G.teams[1].towers < 6;
      const elderBuff = this.my.some(h => !h.dead && h.hasBuff('buff_elder'));
      if (!c && !baseThreat && (t > 420 || (anyT1Down && t > 300) || (elderBuff && t > 180)) && t - this.lastGroup > (elderBuff ? 14 : t > 780 ? 18 : 40)) {
        this.lastGroup = t;
        const tg = this.pushTarget();
        if (tg && (myStr > enStr * 0.8 || t > 840)) {
          const all = t > 660;
          const mem = this.bots(h => h.hp / h.maxHp > 0.45 && (all || h.pos !== 'top' || tg.lane === C.TOP));
          if (mem.length >= 3) {
            c = this.setCall('siege', tg.x, tg.y, t > 780 ? 45 : 32, mem, { target: tg.unit || tg, lane: tg.lane });
            this.say(mem[0], C.LANE_NAMES[tg.lane] + '로 모여요!', tg.x, tg.y, 'go');
          }
        }
      }
    }
    /* 본진 방어 배정. 반환: 큰등불이 위협받고 있는가 */
    assignGuards() {
      const G = this.G, team = this.team, t = G.t, tasks = [];
      for (const h of this.my) if (h.brain && h.brain.guard && (h.brain.guard.s.dead || t > h.brain.guard.until || h.dead)) h.brain.guard = null;
      for (const s of G.structs) {
        if (s.team !== team || s.dead || (s.kind !== 'core' && (s.tier !== 2 || !s.vulnerable))) continue;
        let th = 0, eh = 0;
        const list = G.hash.query(s.x, s.y, 15);
        for (let i = 0; i < list.length; i++) { const u = list[i]; if (u.team === team || u.team === 2 || u.dead) continue; if (u.isMinion) th += u.kind === 'super' ? 3 : u.kind === 'siege' ? 2 : 1; else if (u.isHero && u.seen[team]) { th += 4; eh++; } }
        const hurt = t - s.lastHurt < 4;
        if (th >= 3 || (hurt && th >= 1)) {
          // 미니언 무리뿐이면 등불탑이 웬만큼은 스스로 막는다: 탑이 맞고 있고 무리가 클 때만 한 명이 돌아간다 (다 같이 집만 지키다 판이 늘어지지 않게)
          let need;
          if (!eh && s.kind !== 'core') { if (!(hurt && th >= 5)) continue; need = 1; }
          else need = U.clamp(Math.max(Math.ceil(th / 4), s.kind === 'core' && hurt ? 3 : 1), 1, 5);
          tasks.push({ s, th, hurt, need });
        }
      }
      if (!tasks.length) return false;
      // 우리가 먼저 끝낼 수 있으면(적 큰등불이 거의 꺼졌으면) 돌아가지 않는다
      const ec = G.cores[1 - team];
      let there = 0; for (const h of this.my) if (!h.dead && U.du(h, ec) < 16) there++;
      const core = tasks.find(k => k.s.kind === 'core');
      if (ec.vulnerable && there >= 3 && t - ec.lastHurt < 2.5 && ec.hp / ec.maxHp < 0.4 && ec.hp / ec.maxHp < (core ? core.s.hp / core.s.maxHp : 1) - 0.15) return !!core;
      tasks.sort((a, b) => (b.s.kind === 'core' ? 1 : 0) - (a.s.kind === 'core' ? 1 : 0) || b.th - a.th);
      const used = new Set(), f = M.bases[team].fountain;
      for (const k of tasks) {
        let have = 0;
        for (const h of this.my) { if (h.dead) continue; if (h.brain ? (h.brain.guard && h.brain.guard.s === k.s) : U.du(h, k.s) < 16) { have++; used.add(h); } }
        const cands = this.bots(h => !used.has(h) && h.hp / h.maxHp > 0.3).map(h => ({ h, eta: Math.min(U.du(h, k.s) * 1.25 / h.ms, C.RECALL_TIME + 0.5 + U.dist(f.x, f.y, k.s.x, k.s.y) / h.ms) })).sort((a, b) => a.eta - b.eta);
        for (const cd of cands) { if (have >= k.need) break; cd.h.brain.guard = { s: k.s, until: t + 12 }; used.add(cd.h); have++; if (k.s.kind === 'core' || k.th >= 6) this.say(cd.h, (k.s.kind === 'core' ? '본진' : C.LANE_NAMES[k.s.lane] + ' 안쪽') + ' 지키러 갑니다', k.s.x, k.s.y, 'warn'); }
      }
      return !!core;
    }
    /* 밀 목표: 칠 수 있는 적 구조물 가운데 (체력이 낮고, 우리 미니언이 가까운) 것 */
    pushTarget() {
      const G = this.G, team = this.team; let best = null, bs = -1e9;
      for (let lane = 0; lane < 3; lane++) {
        const f = this.front[lane]; if (!f) continue;
        const s = this.outerTower(1 - team, lane);
        if (!s || s.dead || (s.isCore && !s.vulnerable)) continue;
        const sp = M.toProg(team, lane, s.lt);
        let score = -(s.hp / s.maxHp) * 40 - Math.max(0, sp - f.af) * 0.5 + (lane === C.MID ? 12 : 0) + (s.isCore ? 30 : 0) + (G.superLane[team][lane] ? 15 : 0);
        if (score > bs) { bs = score; best = { x: s.x, y: s.y, lane, unit: s.unit || s, hp: s.hp, maxHp: s.maxHp }; }
      }
      return best;
    }
  }

  /* =====================================================================
     영웅 두뇌
     ===================================================================== */
  class Brain {
    constructor(G, h, tb, diff) {
      this.G = G; this.h = h; this.tb = tb; this.diff = diff;
      this.thinkT = 0.3 + G.rng() * 0.3; this.state = h.pos === 'jg' ? 'jungle' : 'lane';
      this.lane = TW.POS_LANE[h.pos] >= 0 ? TW.POS_LANE[h.pos] : C.MID;
      this.target = null; this.mode = 'farm'; this.dodge = null; this.seenProj = new Map(); this.csSeen = new Map();
      this.goal = null; this.goalT = 0; this.gank = null; this.ganking = false; this.allinUntil = 0; this.allinTarget = null; this.guard = null;
      this.camp = null; this.lastHp = h.hp; this.dmgRate = 0; this.recallT = 0; this.stuckT = 0; this.kiteT = 0;
      this.off = (G.rng() - 0.5) * 6; this.nextGankT = 70 + G.rng() * 25; this.fleeUntil = 0; this.buyT = 1 + G.rng() * 2; this.pokeT = 0; this.wardT = 20;
    }
    /* ----- 이동 명령(목표가 크게 바뀔 때만 다시 길을 찾는다) ----- */
    go(x, y, attackMove) {
      const h = this.h, g = this.goal, t = this.G.t;
      if (g && U.dist(g.x, g.y, x, y) < 1.2 && !!g.am === !!attackMove && t - this.goalT < 0.8 && h.order && h.order.type === 'move') return;
      this.goal = { x, y, am: !!attackMove }; this.goalT = t;
      h.cmdMove(x, y, !!attackMove);
    }
    attack(u) { this.goal = null; this.h.cmdAttack(u); }
    /* ----- 주변 파악 ----- */
    scan() {
      const G = this.G, h = this.h, team = h.team;
      const ens = [], als = [];
      for (const e of G.heroes) {
        if (e.dead || e === h) continue;
        if (e.team === team) { if (U.du(e, h) < 20) als.push(e); }
        else if (e.seen[team] && U.du(e, h) < 24) ens.push(e);
      }
      ens.sort((a, b) => U.du(a, h) - U.du(b, h));
      this.ens = ens; this.als = als;
      let eT = null, aT = null, ad = 1e9;
      for (const s of G.structs) {
        if (s.dead) continue;
        const d = U.du(s, h);
        if (s.team !== team) { if (d - h.r <= s.range + 1.5) eT = s; }
        else if (d < ad) { ad = d; aT = s; }
      }
      this.eTower = eT; this.aTower = aT; this.aTowerD = ad;
      this.dmgRate += ((this.lastHp - h.hp) / Math.max(0.05, this.diff.think) - this.dmgRate) * 0.5; this.lastHp = h.hp;
    }
    /* 적 등불탑 안에 있어도 괜찮은가: 미니언이 대신 맞아 주고 있을 때만 */
    towerSafe(s) {
      if (!s) return true;
      if (s.target === this.h) return false;
      let tanks = 0;
      const list = this.G.hash.query(s.x, s.y, s.range);
      for (let i = 0; i < list.length; i++) { const m = list[i]; if (m.isMinion && m.team === this.h.team && !m.dead) tanks += (m.kind === 'super' || m.kind === 'siege') ? 2 : 1; }
      // 등불탑이 든든한 아군 영웅을 치고 있는 동안에도 칠 수 있다
      const tg = s.target;
      if (tg && tg.isHero && tg !== this.h && tg.team === this.h.team && tg.hp / tg.maxHp > 0.5) tanks += 1;
      return tanks >= 2;
    }
    /* 주변 세력 비교: 우리 / 적 */
    ratio(x, y, r) {
      const G = this.G, h = this.h, team = h.team;
      let a = 0, e = 0;
      for (const u of G.heroes) {
        if (u.dead) continue;
        const d = U.dist(u.x, u.y, x, y);
        if (u.team === team) { if (d < r + 3 || u === h) a += strength(u) * (u === h ? 1 : U.clamp(1.3 - d / (r + 3), 0.4, 1)); }
        else if (u.seen[team] && d < r) e += strength(u);
      }
      for (const s of G.structs) {
        if (s.dead) continue;
        const d = U.dist(s.x, s.y, x, y);
        if (d > s.range + 1) continue;
        if (s.team === team) a += 230 + 6 * (G.t / 60);
        else if (!this.towerSafe(s) || s.kind === 'core') e += 260 + 8 * (G.t / 60);
      }
      return e <= 0 ? 9 : a / e;
    }
    safeSpot() {
      const h = this.h, G = this.G, team = h.team;
      // 가장 가까운 아군 구조물의 '안쪽'
      let best = null, bd = 1e9;
      for (const s of G.structs) { if (s.team !== team || s.dead) continue; const d = U.du(s, h); if (d < bd) { bd = d; best = s; } }
      const f = M.bases[team].fountain;
      if (!best) return f;
      const dx = f.x - best.x, dy = f.y - best.y, d = Math.hypot(dx, dy) || 1;
      return M.nearestWalkable(best.x + dx / d * 5, best.y + dy / d * 5, 6);
    }

    /* ----- 매 틱: 피하기(반응 속도가 필요한 것) ----- */
    tick(dt) {
      const h = this.h, G = this.G;
      if (h.dead) { this.state = h.pos === 'jg' ? 'jungle' : 'lane'; this.dodge = null; this.gank = null; this.ganking = false; this.target = null; this.goal = null; this.allinUntil = 0; return; }
      if (TW.AI.micro) TW.AI.micro(this, dt);
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        this.thinkT = this.diff.think * (0.85 + G.rng() * 0.3);
        if (!h.cc && !h.dash) this.think();
      }
    }
    think() {
      const h = this.h, G = this.G, t = G.t;
      this.scan();
      // 장보기
      this.buyT -= this.diff.think;
      if (this.buyT <= 0) { this.buyT = 1.5 + G.rng(); const nb = TW.nextBuy(h); if (nb && h.gold >= nb.cost) G.buy(h, nb.id); }
      if (TW.AI.care) TW.AI.care(this);
      if (this.dodge && t < this.dodge.until) return;
      this.dodge = null;
      if (h.channel || h.cast) return;
      if (h.charge) return;                         // 모으는 중: micro 가 쏜다
      // 본진 회복
      if (this.state === 'base') {
        if (h.hp >= h.maxHp * 0.92 || !h.atFountain && h.hp > h.maxHp * 0.75) this.state = h.pos === 'jg' ? 'jungle' : 'lane';
        else { this.cant('체력을 채우는 중이에요'); if (!h.atFountain && !h.recall) { const f = M.bases[h.team].fountain; this.go(f.x, f.y); } return; }
      }
      // 적 본진 등불(샘)의 사거리에는 들어가지 않는다
      { const ef = M.bases[1 - h.team].fountain, fd = U.dist(h.x, h.y, ef.x, ef.y); if (fd < C.FOUNTAIN_R + 4) { const k = (C.FOUNTAIN_R + 9) / Math.max(0.1, fd); this.go(ef.x + (h.x - ef.x) * k, ef.y + (h.y - ef.y) * k); this.allinUntil = 0; return; } }
      if (this.retreatCheck()) return;
      if (this.guard && this.doGuard()) { this.cant('본진을 지켜요'); return; }
      const call = this.tb.call;
      if (call && call.members.has(h)) { this.state = 'call'; if (this.doCall(call)) return; }
      else if (this.state === 'call') this.state = h.pos === 'jg' ? 'jungle' : 'lane';
      if (this.gank) { if (this.doGank()) return; }
      if (this.tryFight()) return;
      if (h.pos === 'jg') this.doJungle(); else this.doLane();
    }

    /* ----- 후퇴 ----- */
    retreatCheck() {
      const h = this.h, G = this.G, t = G.t, hp = h.hp / h.maxHp;
      const near = this.ens.filter(e => U.du(e, h) < 13);
      let danger = false;
      if (t < this.fleeUntil) danger = true;
      const r = near.length ? this.ratio(h.x, h.y, 13) : 9;
      const tg = this.allinTarget && !this.allinTarget.dead ? this.allinTarget : null;
      const killing = tg && tg.seen[h.team] && tg.hp < burst(h, tg) * 0.8 && U.du(tg, h) < h.range + 5;
      let why = t < this.fleeUntil ? this.noWhy || '위험해요' : '';
      if (!killing) {
        if (hp < 0.24 && (near.length || this.dmgRate > 12)) { danger = true; why = '체력이 낮아요'; }
        else if (hp < 0.4 && near.length && r < 1.0) { danger = true; why = '위험해요 — 적 ' + near.length + '명'; }
        else if (near.length && r < 0.5 * (2 - this.diff.aggro)) { danger = true; why = '위험해요 — 적 ' + near.length + '명'; }
        else if (this.eTower && !this.towerSafe(this.eTower) && !(this.state === 'call' && this.tb.call && this.tb.call.type === 'push' && this.tb.enDead >= 4)) { danger = true; why = '적 등불탑이 쏴요'; }
      }
      if (danger) {
        this.cant(why || '위험해요');
        if (t >= this.fleeUntil) this.fleeUntil = t + 1.2;
        this.gank = null; this.ganking = false; this.allinUntil = 0;
        const s = (hp < 0.4 || this.state === 'base') ? M.bases[h.team].fountain : this.safeSpot();
        if (TW.AI.escape) TW.AI.escape(this, near);
        if (!h.dash) this.go(s.x, s.y);
        if (hp < 0.4) this.state = 'base';
        return true;
      }
      // 체력이 낮고 주변이 조용하면 귀환
      if (hp < 0.36 && !near.length && this.dmgRate < 3 && !h.atFountain) {
        this.state = 'base'; this.cant('체력이 낮아 귀환해요');
        let safe = true; for (const e of this.ens) if (U.du(e, h) < 20) safe = false;
        const es = this.eTower;
        if (safe && !es && !h.recall) { if (this.aTowerD < 30 || G.t - h.lastHurt > 4) h.cmdRecall(); else { const s = this.safeSpot(); this.go(s.x, s.y); } }
        else if (!h.recall) { const s = this.safeSpot(); this.go(s.x, s.y); }
        return true;
      }
      if (h.recall) { this.cant('귀환 중이에요'); return true; }
      return false;
    }
    /* 플레이어의 집결에 지금 갈 수 없는 까닭 (AI.rallyTick 이 읽어 '못 가' 로 알린다) */
    cant(why) { this.noWhy = why; this.noAt = this.G.t; }

    /* ----- 본진 지키기 ----- */
    doGuard() {
      const g = this.guard, s = g.s, h = this.h, G = this.G, team = h.team, f = M.bases[team].fountain;
      this.state = 'guard';
      const d = U.du(h, s), viaRecall = C.RECALL_TIME + 0.5 + U.dist(f.x, f.y, s.x, s.y) / h.ms;
      if (h.recall) return true;
      if (d > 40 && viaRecall < d * 1.25 / h.ms - 1.5) {
        let safe = true; for (const e of this.ens) if (U.du(e, h) < 11) safe = false;
        if (safe && !this.eTower) h.cmdRecall(); else { const sp = this.safeSpot(); this.go(sp.x, sp.y); }
        return true;
      }
      if (this.ens.length && this.tryFight()) return true;
      let best = null, bd = 1e9;
      const list = G.hash.query(s.x, s.y, 17);
      for (let i = 0; i < list.length; i++) { const m = list[i]; if (!m.isMinion || m.team === team || m.dead) continue; const dd = U.du(m, h) - (m.kind === 'super' ? 3 : 0); if (dd < bd) { bd = dd; best = m; } }
      if (best) { if (TW.AI.farm) TW.AI.farm(this, G.hash.query(h.x, h.y, h.range + 6)); if (!h.cast && !h.charge && !h.channel) this.attack(best); return true; }
      const dx = f.x - s.x, dy = f.y - s.y, dd = Math.hypot(dx, dy) || 1, px = s.x + dx / dd * 5 + (h.slot - 2), py = s.y + dy / dd * 5 + (h.slot - 2);
      if (U.dist(h.x, h.y, px, py) > 4) this.go(px, py);
      return true;
    }

    /* ----- 교전 판단 ----- */
    pickEnemy(range) {
      const h = this.h; let best = null, bs = -1e9;
      const ef = M.bases[1 - h.team].fountain;
      for (const e of this.ens) {
        const d = U.du(e, h); if (d > range) continue;
        if (U.dist(e.x, e.y, ef.x, ef.y) < C.FOUNTAIN_R + 3.5) continue;          // 적 본진 등불 안으로는 쫓지 않는다
        let s = -effHp(e) * 0.02 - d * 1.2 + (TW.isCC(e) ? 6 : 0) + (e.hp / e.maxHp < 0.35 ? 8 : 0);
        if (h.hd.role === 'assassin' && (e.hd.role === 'marksman' || e.hd.role === 'mage' || e.hd.role === 'support')) s += 6;
        if (e === this.allinTarget) s += 5;
        if (s > bs) { bs = s; best = e; }
      }
      return best;
    }
    tryFight() {
      const h = this.h, G = this.G, t = G.t;
      if (!this.ens.length) { if (t > this.allinUntil) this.allinTarget = null; return false; }
      let tg = null, mode = null, openPoke = false;
      // 이미 올인 중
      if (t < this.allinUntil && this.allinTarget && !this.allinTarget.dead && this.allinTarget.seen[h.team] && U.du(this.allinTarget, h) < 22) { tg = this.allinTarget; mode = 'allin'; }
      if (!tg) {
        const cand = this.pickEnemy(17);
        if (cand) {
          const d = U.du(cand, h), r = this.ratio(cand.x, cand.y, 13);
          const underT = this.enemyTowerNear(cand);
          const killable = cand.hp < burst(h, cand) * (underT ? 0.75 : 1.1);
          let allyFighting = false;
          for (const a of this.als) if (t - a.lastHeroFight < 2 && U.du(a, cand) < 14) allyFighting = true;
          const aggro = this.diff.aggro * U.lerp(0.5, 1, U.clamp((t - 50) / 150, 0, 1)) * (h.pos === 'sup' ? 0.85 : 1);      // 초반에는 사람처럼 몸을 사린다 (올인)
          // 단, 첫 만남(처음 C.OPEN_SKIRMISH초)에는 견제는 제 기세로 주고받는다 — 라인에 닿자마자 적 영웅과 한두 대씩 오간다
          const pokeAggro = t < C.OPEN_SKIRMISH ? this.diff.aggro * (h.pos === 'sup' ? 0.85 : 1) : aggro;
          if (killable && r > 0.75 / aggro && d < 15 && (!underT || h.hp / h.maxHp > 0.55)) mode = 'allin';
          else if (allyFighting && r > 0.85 / aggro && (!underT || this.towerSafe(underT))) mode = 'allin';
          else if (r > 1.35 / aggro && d < 12 && !underT && h.hp / h.maxHp > 0.5) mode = 'allin';
          else if (r > 0.8 / pokeAggro && d < 16 && !underT) { mode = 'poke'; openPoke = !(r > 0.8 / aggro); }
          if (mode) tg = cand;
        }
      }
      if (!tg) return false;
      this.target = tg; this.mode = mode;
      if (mode === 'allin') { if (t >= this.allinUntil) this.allinUntil = t + 3.5; this.allinTarget = tg; }
      const d = U.du(tg, h);
      // 첫 만남에만 생긴 견제(예전 기준으로는 몸을 사렸을 자리)는 평타로만 주고받는다 — 스킬 몰아치기로 갓 출전한 사람을 눕히지 않게
      if (TW.AI.skills && !openPoke) TW.AI.skills(this, tg, mode);
      if (h.cast || h.channel || h.charge || h.dash) return true;
      if (mode === 'allin') { this.fightMove(tg, true); return true; }
      // 첫 만남 인사: 처음 C.OPEN_SKIRMISH초 안, 아직 적 영웅과 한 대도 주고받지 않았으면 한 번은 걸어 들어가 평타를 주고받는다 (맞닿으면 끝 — 그 뒤로는 아래 견제 규칙)
      if (t < C.OPEN_SKIRMISH && h.lastHeroFight < 0 && d < 12 && h.hp / h.maxHp > 0.6 && h.pos !== 'jg') { this.attack(tg); return true; }
      // 견제: 사거리 안이면 한 대 치고, 아니면 하던 일(파밍)을 계속한다
      if (h.ranged && d - tg.r <= h.range + 0.5 && h.atkCd <= 0.1 && h.hp / h.maxHp >= tg.hp / tg.maxHp - 0.25) { this.attack(tg); return true; }
      if (!h.ranged && d - tg.r <= h.range + 1.5 && h.hp / h.maxHp > tg.hp / tg.maxHp + (t < C.OPEN_SKIRMISH ? -0.05 : 0.1) && t > this.pokeT) { this.pokeT = t + 2.5; this.attack(tg); return true; }
      return false;
    }
    enemyTowerNear(u) { for (const s of this.G.structs) if (s.team !== this.h.team && !s.dead && U.du(s, u) - u.r <= s.range + 0.5) return s; return null; }
    /* 붙어서 싸우기: 원거리는 치고 빠지고, 근접은 달라붙는다 */
    fightMove(tg, commit) {
      const h = this.h, d = U.du(tg, h) - tg.r;
      if (h.ranged) {
        let threat = null, td = 5.2;
        for (const e of this.ens) { if (e.ranged) continue; const dd = U.du(e, h); if (dd < td) { td = dd; threat = e; } }
        if (h.atkCd > 0.22 && (threat || d < h.range - 2.5)) {
          const from = threat || tg, dx = h.x - from.x, dy = h.y - from.y, dd = Math.hypot(dx, dy) || 1;
          const f = M.bases[h.team].fountain, bx = f.x - h.x, by = f.y - h.y, bd = Math.hypot(bx, by) || 1;
          this.go(h.x + (dx / dd * 0.7 + bx / bd * 0.3) * 3.5, h.y + (dy / dd * 0.7 + by / bd * 0.3) * 3.5);
          return;
        }
        if (d > h.range && h.atkCd > 0.2 && !commit) { this.go(tg.x, tg.y); return; }
      }
      this.attack(tg);
    }

    /* ----- 라인전 ----- */
    doLane() {
      const h = this.h, G = this.G, team = h.team, t = G.t, lane = this.lane;
      const f = this.tb.front[lane]; if (!f) return;
      this.state = 'lane';
      const myP = prog(team, lane, h.x, h.y);
      // 1) 막타
      const reach = h.range + 5;
      const near = G.hash.query(h.x, h.y, reach + 2);
      let lastHit = null, lhScore = 1e9, lowest = null, lowHp = 1e9, nMin = 0;
      const hit = h.ad;
      for (let i = 0; i < near.length; i++) {
        const m = near[i];
        if (!m.isMinion || m.team === team || m.dead || !m.seen[team]) continue;
        nMin++;
        const d = U.du(m, h) - m.r, dmg = hit * 100 / (100 + m.def);
        const tHit = Math.max(0, d - h.range) / h.ms + Math.max(0, h.atkCd) + h.windTime() + (h.ranged ? Math.min(d, h.range) / h.proj.speed : 0);
        let inc = 0;
        for (let k = 0; k < near.length; k++) { const a = near[k]; if (a.isMinion && a.team === team && a.target === m) inc += a.ad * a.as * TW.TUNE.minionVsMinion * 100 / (100 + m.def); }
        const at = m.hp - inc * tHit;
        if (at <= dmg * 0.98 && at > -dmg * 0.3) {
          let ok = this.csSeen.get(m.id);
          if (ok === undefined) { ok = G.rng() < this.diff.cs; this.csSeen.set(m.id, ok); if (this.csSeen.size > 200) this.csSeen.clear(); }
          if (ok && tHit < lhScore) { lhScore = tHit; lastHit = m; }
        }
        if (m.hp < lowHp && d <= h.range + 2) { lowHp = m.hp; lowest = m; }
      }
      const eT = this.eTower, towerOk = this.towerSafe(eT);
      if (lastHit && (towerOk || !eT)) { this.attack(lastHit); return; }
      // 2) 구조물 치기: 미니언이 맞아 주는 동안
      const st = this.siegeTarget();
      if (st && this.ens.filter(e => U.du(e, h) < 11).length === 0) { this.attack(st); return; }
      // 3) 밀기 / 파밍
      const enemyNear = this.ens.length > 0;
      const push = !enemyNear || t > 200 || nMin >= 5 || h.hp / h.maxHp > 0.75;
      if (lowest && push && towerOk) {
        if (TW.AI.farm) TW.AI.farm(this, near);
        if (!h.cast && !h.charge) this.attack(lowest);
        return;
      }
      // 4) 자리 잡기: 우리 미니언 뒤
      const back = h.pos === 'sup' ? (h.ranged ? 8 : 3) : h.ranged ? 5.5 : 1.5;
      let want = f.an > 0 ? f.af - back : f.myTp + (h.ranged ? -1 : 2);
      // 적 등불탑 사거리 밖에서 기다린다
      const lim = f.enTp - (C.TOWER_RANGE + (h.ranged ? -h.range + 3.5 : 2));
      if (!(f.an >= 2 && f.af > f.enTp - C.TOWER_RANGE)) want = Math.min(want, lim);
      // 적이 안 보이면(강 건너편에서는) 조심
      let missing = 0; for (let i = 0; i < 5; i++) { const e = this.tb.en[i]; if (!e.dead && t - G.lastSeen[team][i].t > 7) missing++; }
      if (missing >= 2 && t > 100) want = Math.min(want, f.len * 0.5 + (missing >= 4 ? -6 : 6));
      want = Math.max(want, 10);
      if (Math.abs(want - myP) > 1.5 || M.laneProject(lane, h.x, h.y).d > 5) {
        const p = lanePt(team, lane, want, this.off);
        this.go(p.x, p.y, true);
      } else if (h.pos === 'sup' && TW.AI.support) TW.AI.support(this);
    }
    /* 지금 쳐도 되는 적 구조물 */
    siegeTarget() {
      const h = this.h, G = this.G;
      let best = null, bd = h.range + 7;
      for (const s of G.structs) {
        if (s.team === h.team || s.dead || !s.vulnerable) continue;
        const d = U.du(s, h) - s.r;
        if (d < bd && this.towerSafe(s) && !G.backdoor(s, h.team)) { bd = d; best = s; }
      }
      return best;
    }

    /* ----- 정글 ----- */
    doJungle() {
      const h = this.h, G = this.G, team = h.team, t = G.t;
      this.state = 'jungle';
      // 기습 각 보기
      if (t > this.nextGankT && h.hp / h.maxHp > 0.6 && !(this.camp && this.camp.alive.length && this.camp.alive.some(m => m.hp < m.maxHp * 0.6))) {
        const g = this.findGank();
        if (g) { this.gank = g; this.nextGankT = t + 26 + G.rng() * 14; G.stat.ganks[team]++; this.tb.gankPing = { lane: g.lane, target: g.target, until: t + 16, by: h }; this.tb.say(h, C.LANE_NAMES[g.lane] + ' 기습 갑니다!', g.target.x, g.target.y, 'go'); if (this.doGank()) return; }
        else this.nextGankT = t + 4;
      }
      // 캠프 고르기: 우리 쪽 정글에서 살아 있는 가장 가까운 캠프 (버프 캠프 우선)
      let c = this.camp;
      if (!c || !c.alive.length) {
        c = null; let bs = 1e9;
        for (const k of G.camps) {
          if (!k.alive.length || k.side !== team) continue;
          const d = U.dist(k.x, k.y, h.x, h.y) - ((k.kind === 'fire' || k.kind === 'water') ? 22 : 0);
          if (d < bs) { bs = d; c = k; }
        }
        this.camp = c;
      }
      if (!c) {
        // 다 잡았다: 다음에 가장 먼저 생기는 캠프 근처에서 기다리거나 가까운 길을 돕는다
        let nx = null, nt = 1e9;
        for (const k of G.camps) if (k.side === team && k.nextT < nt) { nt = k.nextT; nx = k; }
        if (nx && nt - t < 14) { if (U.dist(h.x, h.y, nx.x, nx.y) > 7) this.go(nx.x, nx.y); return; }
        const f = this.tb.front[C.MID], p = lanePt(team, C.MID, Math.min(f.af - 3, f.len * 0.5), -4);
        this.lane = C.MID; this.doLane(); return;
      }
      const d = U.dist(h.x, h.y, c.x, c.y);
      if (d > 9) { this.go(c.x, c.y); return; }
      // 큰 놈부터
      let m = null, mh = -1;
      for (const k of c.alive) if (!k.dead && k.maxHp > mh) { mh = k.maxHp; m = k; }
      if (!m) { this.camp = null; return; }
      if (TW.AI.farm) TW.AI.farm(this, c.alive, m);
      if (!h.cast && !h.charge && !h.channel) this.attack(m);
    }
    /* 어느 길을 찌를까 */
    findGank() {
      const h = this.h, G = this.G, team = h.team, t = G.t;
      let best = null, bs = 2.2;
      for (const e of this.tb.en) {
        if (e.dead || !e.seen[team]) continue;
        const nl = M.nearestLane(e.x, e.y); if (nl.d > 9) continue;
        const lane = nl.lane, f = this.tb.front[lane]; if (!f) continue;
        const ep = M.toProg(team, lane, nl.t);                 // 우리 본진 쪽으로 얼마나 들어와 있나(작을수록 깊이 들어옴)
        const enT = this.tb.outerTower(1 - team, lane), enTp = M.toProg(team, lane, enT.lt);
        const ext = enTp - ep - C.TOWER_RANGE;                  // 자기 등불탑에서 떨어진 거리
        if (ext < 9) continue;
        let ally = null;
        for (const a of this.tb.my) if (a !== h && !a.dead && U.du(a, e) < 22 && a.hp / a.maxHp > 0.4) ally = a;
        if (!ally) continue;
        let others = 0; for (const o of this.tb.en) if (o !== e && !o.dead && o.seen[team] && U.du(o, e) < 14) others++;
        const dist = M.pathLen(h.x, h.y, e.x, e.y);
        if (dist > 85) continue;
        let s = ext * 0.11 + (1 - e.hp / e.maxHp) * 3.2 + (h.level - e.level) * 0.3 - others * 1.3 - dist * 0.016 + (TW.isCC(e) ? 1 : 0) + (others === 1 && this.tb.my.filter(a => !a.dead && U.du(a, e) < 22).length >= 3 ? 1.2 : 0);
        if (s > bs) { bs = s; best = { lane, target: e, t0: t, phase: 'approach', ally }; }
      }
      return best;
    }
    doGank() {
      const g = this.gank, h = this.h, G = this.G, team = h.team, t = G.t, tg = g.target;
      this.state = 'gank';
      if (tg.dead || t - g.t0 > 24 || h.hp / h.maxHp < 0.35) { this.gank = null; this.ganking = false; this.state = 'jungle'; return false; }
      const seen = tg.seen[team], tx = seen ? tg.x : G.lastSeen[team][tg.slot].x, ty = seen ? tg.y : G.lastSeen[team][tg.slot].y;
      const d = U.dist(h.x, h.y, tx, ty);
      if (g.phase === 'approach') {
        // 적의 퇴로 쪽 수풀로 돌아 들어간다
        if (!g.spot) {
          const enT = this.tb.outerTower(1 - team, g.lane);
          let best = null, bs = 1e9;
          for (const b of M.bushes) {
            const db = U.dist(b.x, b.y, tx, ty); if (db > 17 || db < 3) continue;
            const toT = U.dist(b.x, b.y, enT.x, enT.y), tgToT = U.dist(tx, ty, enT.x, enT.y);
            const sc = db + (toT < tgToT ? -6 : 4) + M.pathLen(h.x, h.y, b.x, b.y) * 0.08;
            if (sc < bs) { bs = sc; best = b; }
          }
          g.spot = best ? { x: best.x, y: best.y } : { x: tx, y: ty };
        }
        if (d < 10.5 || (U.dist(h.x, h.y, g.spot.x, g.spot.y) < 2.5 && d < 15)) { g.phase = 'strike'; g.t1 = t; this.ganking = true; this.allinTarget = tg; this.allinUntil = t + 7; }
        else if (U.dist(h.x, h.y, g.spot.x, g.spot.y) < 2 && t - (g.waitT || (g.waitT = t)) > 5) { this.gank = null; this.state = 'jungle'; return false; }
        else { this.go(g.spot.x, g.spot.y); return true; }
      }
      if (g.phase === 'strike') {
        if (t - g.t1 > 9 || !seen && t - G.lastSeen[team][tg.slot].t > 3) { this.gank = null; this.ganking = false; this.state = 'jungle'; return false; }
        const eT = this.enemyTowerNear(tg);
        if (eT && !this.towerSafe(eT) && tg.hp > burst(h, tg) * 0.7) { this.gank = null; this.ganking = false; this.state = 'jungle'; return false; }
        this.target = tg; this.mode = 'allin';
        if (TW.AI.skills) TW.AI.skills(this, tg, 'allin');
        if (!h.cast && !h.channel && !h.charge && !h.dash) this.fightMove(tg, true);
        return true;
      }
      return false;
    }

    /* ----- 팀 콜 수행 ----- */
    doCall(c) {
      const h = this.h, G = this.G, team = h.team, t = G.t;
      if (c.type === 'boss' || c.type === 'elder' || c.type === 'contest') {
        const m = c.target;
        if (!m || m.dead) return false;
        // 적 영웅이 보이면 싸움이 먼저 (플레이어가 부른 것이면 오는 길에는 맞았을 때만)
        if (this.ens.length && (!c.byPlayer || U.du(h, m) < 18 || this.mustFight()) && this.tryFight()) { if (c.byPlayer && U.du(h, m) >= 18) this.cant('가는 길에 싸우는 중이에요'); return true; }
        const d = U.du(h, m);
        let arrived = 0, need = Math.min(c.members.size, c.type === 'elder' ? 1 : 3);
        for (const a of c.members) if (!a.dead && U.du(a, m) < 15) arrived++;
        const p = G.player; if (p && p.team === team && !p.dead && U.du(p, m) < 15) arrived++;
        if (arrived >= need) c.go = true;
        if (!c.go) {
          const side = team === 0 ? -1 : 1, gx = m.x + side * (m.kind === 'boss' ? 11 : 9), gy = m.y + (h.slot - 2) * 1.3;
          if (U.dist(h.x, h.y, gx, gy) > 3) this.go(gx, gy); else if (h.pos === 'sup' && TW.AI.support) TW.AI.support(this, m);
          return true;
        }
        if (c.type === 'contest' && !this.ens.length && m.hp > m.maxHp * 0.5 && d < 13) return true;
        if (TW.AI.farm) TW.AI.farm(this, [m], m);
        if (!h.cast && !h.charge && !h.channel) { if (h.ranged && d < h.range - 2 && h.atkCd > 0.25) { const dx = h.x - m.x, dy = h.y - m.y, dd = Math.hypot(dx, dy) || 1; this.go(h.x + dx / dd * 2.5, h.y + dy / dd * 2.5); } else this.attack(m); }
        return true;
      }
      if (c.type === 'scout') {
        if (this.ens.length && this.tryFight()) return true;
        if (U.dist(h.x, h.y, c.x, c.y) > 3) this.go(c.x, c.y);
        return true;
      }
      // siege / push / defend / rally : 그 지점으로 모여 싸우고, 미니언과 함께 구조물을 친다
      // 플레이어가 부른 집결: 오는 길(14칸 밖)에는 한눈팔지 않는다 — 적 영웅에게 방금 맞았거나 이미 붙은 싸움일 때만 되받아친다 ("왜 아무도 안 와")
      const s = c.target && !c.target.dead && c.target.isStruct ? c.target : null;
      const farCall = !!c.byPlayer && U.dist(h.x, h.y, c.x, c.y) > (s ? C.TOWER_RANGE + 8 : 14);      // 적 구조물 앞 집결이면 탑 사거리 바깥(미니언 전선)이 '도착'
      if (this.ens.length && (!farCall || this.mustFight()) && this.tryFight()) { if (farCall) this.cant('가는 길에 싸우는 중이에요'); return true; }
      if (c.type === 'defend') {
        const f = M.bases[team].fountain, dx = f.x - c.x, dy = f.y - c.y, dd = Math.hypot(dx, dy) || 1;
        const px = c.x + dx / dd * 5 + (h.slot - 2) * 1.2, py = c.y + dy / dd * 5 + (h.slot - 2) * 1.2;
        const mn = this.nearestEnemyMinion(10);
        if (U.dist(h.x, h.y, px, py) > 9) this.go(px, py); else if (mn) this.attack(mn);
        return true;
      }
      if (s && s.team !== team) {
        const d = U.du(h, s) - s.r;
        const st = this.siegeTarget();
        if (st) { this.attack(st); return true; }
        // 미니언 무리와 함께 간다
        const lane = c.lane !== undefined ? c.lane : M.nearestLane(s.x, s.y).lane, f = this.tb.front[lane];
        const sp = M.toProg(team, lane, M.laneProject(lane, s.x, s.y).t);
        // 플레이어가 부른 집결이면 미니언 전선이 뒤에 있어도 탑 사거리 바로 밖(부른 자리)까지 온다
        let want = c.byPlayer ? sp - (C.TOWER_RANGE + 2) : Math.min(f.af - (h.ranged ? 4.5 : 1), sp - (C.TOWER_RANGE + 2));
        if (f.an >= 2 && f.af > sp - C.TOWER_RANGE) want = sp - (h.ranged ? h.range - 1 : 2);
        const mn = farCall ? null : this.nearestEnemyMinion(h.range + 3);
        if (mn && this.towerSafe(this.eTower)) { if (TW.AI.farm) TW.AI.farm(this, G.hash.query(h.x, h.y, h.range + 6)); if (!h.cast && !h.charge) this.attack(mn); return true; }
        const p = lanePt(team, lane, Math.max(8, want), this.off * 0.8);
        if (U.dist(h.x, h.y, p.x, p.y) > 2) this.go(p.x, p.y, !farCall);
        return true;
      }
      if (U.dist(h.x, h.y, c.x, c.y) > 6) this.go(c.x, c.y, !farCall);
      else { const mn = this.nearestEnemyMinion(h.range + 4); if (mn) this.attack(mn); }
      return true;
    }
    /* 집결하러 가는 길에도 받아쳐야 하는 싸움: 이미 붙은 올인이거나, 방금(1.2초 안) 맞았고 적 영웅이 코앞이다 */
    mustFight() {
      const h = this.h, t = this.G.t, e = this.ens[0];
      if (t < this.allinUntil && this.allinTarget && !this.allinTarget.dead && U.du(this.allinTarget, h) < 12) return true;
      return !!e && t - h.lastHurt < 1.2 && U.du(e, h) < Math.max(7, h.range + 2);
    }
    nearestEnemyMinion(r) {
      const h = this.h, list = this.G.hash.query(h.x, h.y, r); let best = null, bd = 1e9;
      for (let i = 0; i < list.length; i++) { const m = list[i]; if (!m.isMinion || m.team === h.team || m.dead || !m.seen[h.team]) continue; const d = U.du(m, h); if (d < bd) { bd = d; best = m; } }
      return best;
    }
  }

  /* =====================================================================
     진입점
     ===================================================================== */
  AI.setup = function (G) {
    const D = TW.Difficulty;
    G.ai = { teams: [new TeamBrain(G, 0), new TeamBrain(G, 1)] };
    for (const h of G.heroes) {
      h.vx = 0; h.vy = 0; h._ax = h.x; h._ay = h.y;
      if (h.isPlayer) continue;
      // 상대 팀은 고른 난이도, 우리 편은 '보통'. 관전(봇 대전)이면 양쪽 다 opts 를 따른다
      const key = h.team === 1 ? (G.opts.difficulty || 'normal') : (G.opts.allyDifficulty || 'normal');
      const diff = D[key] || D.normal;
      h.brain = new Brain(G, h, G.ai.teams[h.team], diff);
      if (h.team === 1 || G.opts.spectate) { h.dmgMul = diff.dmg; h.goldMul = diff.gold; }
    }
  };
  AI.update = function (G, dt) {
    const inv = dt > 0 ? 1 / dt : 0;
    for (const h of G.heroes) {
      const ix = U.clamp((h.x - h._ax) * inv, -h.ms, h.ms), iy = U.clamp((h.y - h._ay) * inv, -h.ms, h.ms);
      h.vx += (ix - h.vx) * 0.35; h.vy += (iy - h.vy) * 0.35; h._ax = h.x; h._ay = h.y;
    }
    G.ai.teams[0].update(dt); G.ai.teams[1].update(dt);
    for (const h of G.heroes) if (h.brain) h.brain.tick(dt);
    if (AI.lastRally && AI.lastRally.g !== G) AI.lastRally = null;       // 새 판: 앞 판의 집결은 잊는다
    AI.rallyTick(G, dt);
  };
  /* 플레이어의 집결 신호: 아군 봇이 그곳으로 모인다 (이무기 근처면 이무기 콜이 된다)
     아군마다 상태를 끝까지 들고 다닌다 — 'go' 가는 중 · 'here' 도착 · 'no' 못 감(+까닭). 지도·말풍선·알림이 이것을 그대로 보여 준다 ("왜 아무도 안 와") */
  const RALLY_R = 10;
  /* 집결 숫자: etaMax = 이 초 안에 올 수 있는 아군만 부른다 · siegeHold = 적 탑 앞 집결이 버티는 최소 초 · maxHold = 오는 아군을 기다려 주는 최대 초 */
  const RC = AI.RALLY = { etaMax: 22, siegeHold: 25, maxHold: 35 };      // 12차: 30 · 35 · 45 → 22 · 25 · 35 (먼 길의 아군까지 오래 끌어와 그 길이 비지 않게)
  const rallySay = (G, R, e, text, kind) => G.emit('say', { u: e.h, text, team: R.team, kind, rally: true });
  const rallyText = (e) => e.st === 'go' ? '가는 중! 약 ' + Math.max(1, Math.round(e.eta)) + '초' : e.st === 'here' ? '여기 있어요!' : '못 가요 — ' + e.why;
  AI.rally = function (G, team, x, y) {
    const tb = G.ai.teams[team], boss = G.bossCamp.alive[0], elder = G.elderCamp.alive[0];
    if (AI.lastRally && !AI.lastRally.done) AI.lastRally.done = true, AI.lastRally.endT = G.t;
    const list = [];
    for (const h of tb.my) {
      if (!h.brain) continue;
      const e = { h, st: 'go', why: '', eta: 0, k: 1.15, t: G.t, noT: 0, okT: 0, fixed: false };
      if (h.dead) { e.st = 'no'; e.why = '쓰러져 있어요 · 부활 ' + Math.ceil(h.respawnT) + '초'; e.fixed = true; }
      else if (h.hp / h.maxHp <= 0.3) { e.st = 'no'; e.why = '체력이 낮아요'; e.fixed = true; }
      else {
        const sd = U.dist(h.x, h.y, x, y), L = sd <= RALLY_R ? sd : M.pathLen(h.x, h.y, x, y);
        e.k = sd > 1 ? U.clamp(L / sd, 1, 3) : 1; e.eta = L / Math.max(4, h.ms);
        if (sd <= RALLY_R) e.st = 'here';
        else if (e.eta > RC.etaMax) { e.st = 'no'; e.why = '너무 멀어요 · 약 ' + Math.round(e.eta) + '초'; e.fixed = true; }
        else if (h.brain.guard) { e.st = 'no'; e.why = '본진을 지켜요'; }
        else if (h.recall || h.brain.state === 'base') { e.st = 'no'; e.why = h.recall ? '귀환 중이에요' : '체력을 채우는 중이에요'; }
      }
      list.push(e);
    }
    const ord = { here: 0, go: 1, no: 2 };
    list.sort((a, b) => ord[a.st] - ord[b.st] || a.eta - b.eta);
    const mem = list.filter(e => !e.fixed).map(e => e.h), coming = list.filter(e => e.st !== 'no'), goes = list.filter(e => e.st === 'go');
    const etaMin = goes.length ? goes[0].eta : 0, etaMax = goes.length ? goes[goes.length - 1].eta : 0;
    const R = AI.lastRally = { team, x, y, t: G.t, list, n: coming.length, eta: Math.round(etaMin), far: Math.round(etaMax), done: !mem.length, endT: mem.length ? 0 : G.t, arriveR: RALLY_R, type: 'rally' };
    Object.defineProperty(R, 'g', { value: G });
    // 부른 사람이 '누가, 언제쯤 오는지 · 누가 왜 못 오는지' 바로 알 수 있게: 아군이 저마다 대답한다 (도착 → 가는 중(가까운 순) → 못 감)
    for (const e of list) rallySay(G, R, e, rallyText(e), e.st === 'no' ? 'warn' : 'go');
    if (!mem.length) return 0;
    const hold = Math.max(18, Math.min(RC.maxHold, etaMax + 12));      // 가장 먼 아군이 닿고도 잠깐은 머문다
    const ex = { byPlayer: true, rally: R };
    if (boss && U.dist(x, y, boss.x, boss.y) < 16) { R.type = 'boss'; tb.setCall('boss', boss.x, boss.y, 60, mem, Object.assign({ target: boss, go: true }, ex)); }
    else if (elder && U.dist(x, y, elder.x, elder.y) < 14) { R.type = 'elder'; tb.setCall('elder', elder.x, elder.y, 45, mem, Object.assign({ target: elder, go: true }, ex)); }
    else {
      let s = null, sd = 20;
      for (const k of G.structs) if (k.team !== team && !k.dead && k.vulnerable) { const d = U.dist(k.x, k.y, x, y); if (d < sd) { sd = d; s = k; } }
      if (s) { R.type = 'siege'; R.arriveR = Math.max(RALLY_R, C.TOWER_RANGE + 6 - sd); tb.setCall('siege', s.x, s.y, Math.max(RC.siegeHold, hold), mem, Object.assign({ target: s, lane: s.lane >= 0 ? s.lane : M.nearestLane(s.x, s.y).lane }, ex)); }
      else tb.setCall('rally', x, y, hold, mem, ex);
    }
    return coming.length;
  };
  /* 매 틱: 집결에 답한 아군의 상태를 실제 몸놀림에 맞춘다 (말만 '가는 중'이고 딴 데 있는 일이 없게) */
  AI.rallyTick = function (G, dt) {
    const R = AI.lastRally; if (!R || R.done || !G.ai) return;
    const c = G.ai.teams[R.team].call;
    if (!c || c.rally !== R) {
      // 콜이 끝났다(시간이 다 됨 · 본진이 급해짐 · 다른 콜): 아직 못 닿은 아군은 '못 가'로 알리고 마친다
      const why = c ? '다른 일이 생겼어요' : G.t >= R.t + 15 ? '시간 안에 못 갔어요' : '작전이 바뀌었어요';
      for (const e of R.list) if (e.st === 'go' && !e.h.dead) { e.st = 'no'; e.why = why; e.t = G.t; rallySay(G, R, e, rallyText(e), 'warn'); }
      R.done = true; R.endT = G.t; return;
    }
    let going = 0;
    for (const e of R.list) {
      if (e.fixed) continue;
      const h = e.h, b = h.brain;
      if (h.dead) { e.st = 'no'; e.why = '쓰러졌어요'; e.fixed = true; e.t = G.t; rallySay(G, R, e, rallyText(e), 'warn'); continue; }
      const d = U.dist(h.x, h.y, R.x, R.y);
      e.eta = Math.max(0, d - R.arriveR * 0.5) * e.k / Math.max(4, h.ms);
      let st = e.st;
      const blocked = b && b.noAt !== undefined && G.t - b.noAt < 0.75;
      // 한 번 닿은 아군은 근처에서 싸우느라 조금 벗어나도 '도착' 그대로 — 본진으로 빠질 때(체력·귀환)만 '못 가'로 알린다
      const leaving = blocked && (b.state === 'base' || h.recall);
      if (e.came && !leaving) st = 'here';
      else if (d <= R.arriveR) { st = 'here'; e.noT = 0; }
      else if (blocked) { e.noT += dt; e.okT = 0; if (e.st === 'no' || e.noT >= 1.2 || b.state === 'base' || b.state === 'guard' || h.recall) st = 'no'; }
      else { e.okT += dt; e.noT = 0; if (e.st !== 'no' || e.okT >= 1.5) st = 'go'; }
      if (st === 'here') e.came = true;
      if (st === 'go') going++;
      if (st === 'no' && blocked && b.noWhy && b.noWhy !== e.why && e.st === 'no') e.why = b.noWhy;       // 까닭이 바뀌면 글만 바꾼다
      if (st !== e.st) {
        const was = e.st; e.st = st; e.t = G.t;
        if (st === 'no') e.why = (b && b.noWhy) || '위험해요';
        rallySay(G, R, e, st === 'go' ? (was === 'no' ? '이제 가요! 약 ' + Math.max(1, Math.round(e.eta)) + '초' : rallyText(e)) : st === 'here' ? '도착!' : rallyText(e), st === 'no' ? 'warn' : 'go');
      }
    }
    // 아직 오고 있는 아군이 있으면 집결을 끝내지 않는다 (예상보다 늦어도 — 부른 뒤 RC.maxHold초까지)
    if (going && c.until < G.t + 3 && G.t - R.t < RC.maxHold) c.until = G.t + 3;
  };
  /* 화면에서 쓰는 것: 지금 보여 줄 집결 (끝난 뒤 3초까지) */
  AI.rallyView = function (G, team) {
    const R = AI.lastRally;
    if (!R || !R.list || R.team !== team || G.t < R.t || (R.done && G.t - R.endT > 3)) return null;
    return R;
  };
  AI.TeamBrain = TeamBrain; AI.Brain = Brain;
})();
