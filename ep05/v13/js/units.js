/* 어스름 전선 — units: 유닛(영웅·미니언·중립 몬스터·구조물)의 상태와 행동
   규칙의 나머지 절반(피해·처치·투사체·시야·웨이브)은 game.js 의 Game 이 맡는다. */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map;

  const TUNE = TW.TUNE = {
    minionVsMinion: 0.62,       // 미니언끼리 주는 피해 배율 (낮을수록 막타 치기 쉽다)
    minionVsHero: 0.55,
    minionVsStruct: 0.45, siegeVsStruct: 2.3, superVsStruct: 1.55,
    heroVsStruct: 1.0,
    backdoor: 0.3,              // 아군 미니언 없이 구조물을 칠 때 피해 배율
    towerHeat: 0.3, towerHeatMax: 4,
    xpBase: 150, xpStep: 60,
    oocRegen: 2.5,              // 5초 동안 안 맞으면 체력 재생 배율
    waveHp: 0.024, waveAd: 0.018,   // 웨이브마다 미니언 성장
    monsterGrow: 0.07,          // 분당 중립 몬스터 성장
    respBase: 5, respLevel: 1.35, respDeath: 1.1, respLateFrom: 480, respLateSpan: 480, respLateMul: 0.7, respLastMul: 0.6, respMax: 88,   // 12차: 중반 부활 늘어남 1.1 → 0.7 (한타 한 번 졌다고 곧장 끝나지 않게)
    earlyFort: 0.55, fortFrom: 540, fortSpan: 420,       // 안쪽 등불탑·큰등불이 받는 피해: 9분까지 55%, 16분에 100% (12차: 6분 60% → 9분 100% 에서 늦춤)
    swingGold: 5000, catchXp: 0.12,                      // 뒤진 팀의 처치 골드·미니언 경험치 보정
    killXp: 80, killXpLv: 24,                            // 영웅 처치 경험치 = killXp + killXpLv × 쓰러진 영웅의 레벨
    lateStructFrom: 900, lateStruct: 0,                   // (쓰지 않음) 15분 뒤 구조물이 받는 피해 증가 — 0 이면 꺼짐
    siegeLateFrom: 1020, siegeLate: 0.5,                  // 후반(17분~23분)에 미니언이 건물에 주는 피해가 최대 +50%까지 는다 (12차: 14분 → 17분)
    superLaneBonus: 0.25, superLaneLate: 0.3,       // 안쪽 등불탑을 부순 길의 우리 미니언 강화 (+ 12분부터 20분까지 더해지는 몫)
    bossAura: 0.5,              // 이무기의 기운: 주변 미니언 피해 증가
    towerHp1: 2700, towerHp2: 4200, coreHp: 9500,   // 바깥 등불탑 · 안쪽 등불탑 · 큰등불 체력 (12차: 3300 → 4200 · 6500 → 9500 — 판의 70%가 15분 전에 끝나던 것을 늦춘다)
  };
  const xpNeed = (L) => TUNE.xpBase + TUNE.xpStep * (L - 1);
  TW.xpNeed = xpNeed;
  const COMMIT = C.DT + 0.004;      // 평타가 이만큼 안에 맞을 참이면 이동 명령이 와도 끊지 않는다 (한 틱)

  /* 지금 h 가 u 를 평타 한 대 치면 들어갈 피해. 막타 표시와 자동 조준이 쓴다 (Game.damage 의 계산과 같아야 한다) */
  TW.atkPreview = function (h, u) {
    let amt = h.ad;
    if (h.isHero) { if (h.getBuff('triple')) amt *= 1.8; if (h.hd.atkBonus) amt += h.hd.atkBonus(h, u); }
    let def = u.def; if (h.pen) def *= 1 - h.pen;
    let mult = 100 / (100 + Math.max(0, def));
    if (h.isHero) mult *= h.dmgMul * (1 + h.dmgOut);
    if (u.dmgTaken) mult *= 1 + u.dmgTaken;
    if (u.isMinion && u.emp) mult *= 0.75;
    return amt * mult - (u.shield || 0);
  };

  /* ---------- 유닛 공통 ---------- */
  class Unit {
    constructor(G, team, x, y) {
      this.G = G; this.id = G.nextId++; this.team = team;
      this.x = x; this.y = y; this.px = x; this.py = y; this.z = 0;
      this.r = 0.7; this.facing = team === 1 ? Math.PI : 0;
      this.hp = 1; this.maxHp = 1; this.dead = false;
      this.buffs = []; this.shield = 0;
      this.stunned = false; this.rooted = false; this.airborne = false; this.frozen = false; this.taunter = null; this.slowPct = 0;
      this.ad = 10; this.ap = 0; this.def = 0; this.as = 1; this.range = 2; this.ms = 5; this.baseMs = 5; this.pen = 0; this.ls = 0;
      this.baseAd = 10; this.baseDef = 0;
      this.dmgOut = 0; this.dmgTaken = 0; this.sightCap = 0; this.deflect = 0;
      this.atkCd = 0; this.wind = null; this.ranged = false; this.proj = null;
      this.seen = [true, true]; this.sight = 10; this.bush = 0; this.revealT = -9;
      this.lastHurt = -99; this.spawnT = G.t; this.hitT = -9; this.atkT = -9;
      this.isHero = false; this.isMinion = false; this.isMonster = false; this.isStruct = false; this.heavy = false;
      this.target = null; this.disp = null; this.dash = null; this.st = {}; this.moving = false; this.walkPhase = 0; this.unstoppable = false;
      this.dodgeUntil = -9;
    }
    get cc() { return this.stunned || this.airborne || !!this.disp; }
    recalc() {
      let slowP = 0, stun = false, root = false, air = false, frozen = false, taunter = null, shield = 0, dt = 0, def = this.baseDef, cap = 0, deflect = 0;
      for (const b of this.buffs) {
        if (b.slow > slowP) slowP = b.slow;
        if (b.stun) stun = true; if (b.root) root = true; if (b.airborne) { air = true; stun = true; } if (b.freeze) { frozen = true; stun = true; }
        if (b.taunt && !b.taunt.dead) taunter = b.taunt;
        if (b.shield > 0) shield += b.shield;
        if (b.dmgTaken) dt += b.dmgTaken; if (b.def) def += b.def;
        if (b.sight && (!cap || b.sight < cap)) cap = b.sight;
        if (b.deflect > deflect) deflect = b.deflect;
      }
      this.slowPct = slowP; this.stunned = stun; this.rooted = root || stun; this.airborne = air; this.frozen = frozen; this.taunter = taunter;
      this.shield = shield; this.dmgTaken = dt; this.def = def; this.sightCap = cap; this.deflect = deflect;
      this.ms = this.baseMs * (1 - slowP);
    }
    getBuff(id) { const bs = this.buffs; for (let i = 0; i < bs.length; i++) if (bs[i].id === id) return bs[i]; return null; }
    hasBuff(id) { return this.getBuff(id) !== null; }
    removeBuff(id, silent) {
      const bs = this.buffs;
      for (let i = bs.length - 1; i >= 0; i--) if (bs[i].id === id) { const b = bs[i]; bs.splice(i, 1); this.recalc(); if (!silent && b.onExpire) b.onExpire(this, b); return true; }
      return false;
    }
    tickBuffs(dt) {
      const bs = this.buffs; if (!bs.length) return;
      let changed = false;
      for (let i = bs.length - 1; i >= 0; i--) {
        const b = bs[i]; if (!b) continue;
        b.t += dt;
        if (b.dot) {                       // 지속 피해: 0.5초마다
          b.dotT = (b.dotT || 0) + dt;
          while (b.dotT >= 0.4999 && !this.dead) { b.dotT -= 0.5; this.G.damage(b.src, this, b.dot, 'true', { dot: true, name: b.name }); }
          if (this.dead) return;
        }
        if (b.t >= b.dur || (b.shield0 !== undefined && b.shield <= 0) || (b.shieldOnly && b.shield <= 0)) {
          const k = bs.indexOf(b); if (k >= 0) bs.splice(k, 1);
          changed = true; this.recalc();
          if (b.onExpire) b.onExpire(this, b);
          if (this.dead) return;
        }
      }
      if (changed) this.recalc();
    }
    faceTo(u) { this.facing = Math.atan2(u.y - this.y, u.x - this.x); }
    tryMove(nx, ny) {
      if (M.isWalkable(nx, ny)) { this.x = nx; this.y = ny; return true; }
      // 한 축으로만 미끄러질 때는 실제로 움직이는 경우만 성공으로 친다 (제자리에서 '성공'하면 막힌 줄 모른다)
      if (nx !== this.x && M.isWalkable(nx, this.y)) { this.x = nx; return true; }
      if (ny !== this.y && M.isWalkable(this.x, ny)) { this.y = ny; return true; }
      return false;
    }
    stepToward(x, y, dt, mul) {
      const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
      if (d < 1e-4) return false;
      const k = Math.min(1, this.ms * (mul || 1) * dt / d);
      this.facing = Math.atan2(dy, dx);
      return this.tryMove(this.x + dx * k, this.y + dy * k);
    }
    /* 평타 선딜(누른 뒤 맞기까지). 다듬은 영웅은 hd.atk 로 짧고 고르게 잡는다 → 누르면 바로 나가고, 맞은 뒤의 동작은 언제든 이동으로 끊긴다 */
    windTime() {
      const period = 1 / this.as, a = this.hd && this.hd.atk;
      if (a) return U.clamp(period * a.wind, a.min, a.max);
      return Math.max(0.1, period * (this.ranged ? 0.22 : 0.28));
    }
    startAttack(tg) {
      const period = 1 / this.as;
      this.wind = { t: 0, dur: this.windTime(), target: tg };
      this.atkCd = period; this.atkT = this.G.t;
      this.faceTo(tg);
      this.G.emit('attackStart', { u: this, target: tg, dur: this.wind.dur });
      if (this.bush) this.revealT = this.G.t + C.REVEAL_ON_ACT;
    }
    /* 공격 선딜: true 면 이번 틱은 다른 행동을 하지 않는다 */
    tickWind(dt) {
      const w = this.wind; if (!w) return false;
      if (w.target.dead || !this.G.canTarget(this, w.target)) { this.wind = null; this.atkCd = Math.min(this.atkCd, 0.15); return false; }
      w.t += dt;
      this.faceTo(w.target);
      if (w.t >= w.dur) {
        this.wind = null;
        if (U.du(this, w.target) - w.target.r <= this.range + 4) this.G.attackLand(this, w.target);
        else this.atkCd = Math.min(this.atkCd, 0.3);
      }
      return true;
    }
    /* 강제 이동(넉백·끌려감·던져짐) 진행 */
    updateDisp(dt) {
      const d = this.disp, G = this.G;
      d.t += dt;
      let end = false;
      if (d.kind === 'carry') { if (!d.by.dash || d.by.dash.carried !== this || d.t > 2) end = true; }
      else if (d.kind === 'pull') {
        const dx = d.tx - this.x, dy = d.ty - this.y, dist = Math.hypot(dx, dy), step = d.speed * dt;
        if (dist <= step + 0.05) { if (M.isWalkable(d.tx, d.ty)) { this.x = d.tx; this.y = d.ty; } end = true; }
        else if (!this.tryMove(this.x + dx / dist * step, this.y + dy / dist * step)) end = true;
        if (d.t > d.maxT) end = true;
      } else if (d.kind === 'knock') {
        const step = d.dist / d.dur * dt, nx = this.x + d.dx * step, ny = this.y + d.dy * step;
        if (M.isWalkable(nx, ny)) { this.x = nx; this.y = ny; } else end = true;
        if (d.t >= d.dur) end = true;
      } else if (d.kind === 'toss') {
        const k = U.clamp(d.t / d.dur, 0, 1);
        this.x = d.x0 + (d.tx - d.x0) * k; this.y = d.y0 + (d.ty - d.y0) * k;
        this.z = 4 * d.h * k * (1 - k);
        if (k >= 1) end = true;
      } else end = true;
      if (end) {
        this.disp = null; this.z = 0;
        if (!M.isWalkable(this.x, this.y)) { const p = M.nearestWalkable(this.x, this.y, 10); this.x = p.x; this.y = p.y; }
        if (this.repath) this.repath();
        if (d.stun > 0 && !this.dead) G.stun(d.src, this, d.stun);
        if (d.onEnd) d.onEnd();
      }
    }
  }

  /* ---------- 미니언 ---------- */
  const AGGRO = 8.5;
  class Minion extends Unit {
    constructor(G, team, lane, kind, prog, off) {
      const t = M.toT(team, lane, Math.max(0, prog));
      const p = M.lanePoint(lane, t), d = M.laneDir(lane, t);
      super(G, team, p.x - d.y * off, p.y + d.x * off);
      const s = TW.MINION[kind], w = Math.max(0, G.wave - 1);
      const sup = G.superLane[team][lane] ? 1 + TUNE.superLaneBonus + U.clamp((G.t - 720) / 480, 0, 1) * TUNE.superLaneLate : 1;      // 안쪽을 부순 길의 미니언은 후반으로 갈수록 더 세진다
      this.isMinion = true; this.kind = kind; this.lane = lane; this.off = off; this.lt = t; this.laneD = Math.abs(off); this.name = s.name;
      this.r = s.r; this.ranged = s.ranged; this.proj = s.proj || null;
      this.maxHp = this.hp = Math.round(s.hp * (1 + TUNE.waveHp * w) * sup);
      this.ad = this.baseAd = s.ad * (1 + TUNE.waveAd * w) * sup; this.as = s.as; this.range = s.range; this.baseMs = this.ms = s.ms; this.def = this.baseDef = s.def;
      this.gold = Math.round(s.gold + 0.35 * w); this.xp = Math.round(s.xp * (1 + 0.012 * w));
      this.sight = C.SIGHT_MINION; this.emp = false;
      this.retT = G.rng() * 0.3; this.forced = null; this.forcedT = 0; this.path = null; this.pi = 0;
      this.facing = Math.atan2(d.y, d.x) + (team === 0 ? 0 : Math.PI);
      this.walkPhase = G.rng() * 6;
    }
    acquire() {
      const G = this.G;
      const pr = M.laneProject(this.lane, this.x, this.y); this.lt = pr.t; this.laneD = pr.d;
      if (this.forced) {
        const f = this.forced;
        if (G.t > this.forcedT || f.dead || !G.canTarget(this, f) || U.du(this, f) > 12) this.forced = null;
        else { this.target = f; return; }
      }
      let best = null, bs = Infinity;
      const list = G.hash.query(this.x, this.y, AGGRO);
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (u.team === this.team || u.team === 2 || !G.canTarget(this, u)) continue;
        let score = U.du(this, u) - u.r;
        if (u.isHero) score += 4; else if (u.isStruct) score += 2;
        if (u === this.target) score -= 1.5;
        if (score < bs) { bs = score; best = u; }
      }
      this.target = best;
    }
    advance(dt) {
      const L = M.lanes[this.lane], dir = this.team === 0 ? 1 : -1;
      // 등불탑 같은 것에 막히면 잠깐 길 한가운데 쪽으로 비켜 지나간다
      const slip = this.slip > 0, off = slip ? this.off * 0.1 : this.off;
      if (slip) this.slip -= dt;
      const look = this.lt + dir * (slip ? 2.6 : 5);
      let tx, ty;
      if ((dir > 0 && look >= L.len) || (dir < 0 && look <= 0)) { const c = M.bases[1 - this.team].core; tx = c.x; ty = c.y; }
      else {
        const p = M.lanePoint(this.lane, look), d = M.laneDir(this.lane, look);
        tx = p.x - d.y * off; ty = p.y + d.x * off;
      }
      if (this.laneD > M.LANE_HW + 3) {       // 길에서 크게 벗어났으면(끌려감 등) 길찾기로 돌아온다
        if (!this.path) { this.path = M.findPath(this.x, this.y, tx, ty); this.pi = 0; }
        const p = this.path[this.pi];
        if (!p) { this.path = null; return; }
        if (U.dist(this.x, this.y, p.x, p.y) < 0.6) { this.pi++; return; }
        this.stepToward(p.x, p.y, dt);
        return;
      }
      this.path = null;
      const ox = this.x, oy = this.y;
      this.stepToward(tx, ty, dt);
      if (Math.hypot(this.x - ox, this.y - oy) < this.ms * dt * 0.3 && !this.rooted && !this.stunned) { this.stuckT = (this.stuckT || 0) + dt; if (this.stuckT > 0.2) { this.slip = 1.8; this.stuckT = 0; } } else this.stuckT = 0;
    }
    repath() { this.path = null; }
    update(dt) {
      const G = this.G;
      this.tickBuffs(dt);
      if (this.dead) return;
      if (this.atkCd > 0) this.atkCd -= dt;
      if (this.disp) { this.wind = null; this.updateDisp(dt); return; }
      if (this.stunned) { this.wind = null; return; }
      if (this.taunter) { this.forced = this.taunter; this.forcedT = G.t + 0.3; this.target = this.taunter; }
      if (this.tickWind(dt)) return;
      this.retT -= dt;
      const tg0 = this.target;
      if (this.retT <= 0 || (tg0 && (tg0.dead || !G.canTarget(this, tg0) || U.du(this, tg0) > AGGRO + 4))) {
        this.acquire(); this.retT = 0.32 + G.rng() * 0.16;
      }
      const tg = this.target;
      if (tg) {
        const d = U.du(this, tg) - tg.r;
        if (d <= this.range) { this.faceTo(tg); if (this.atkCd <= 0) this.startAttack(tg); }
        else if (!this.rooted) { this.path = null; this.stepToward(tg.x, tg.y, dt); }
      } else if (!this.rooted) this.advance(dt);
    }
  }

  /* ---------- 중립 몬스터 ---------- */
  class Monster extends Unit {
    constructor(G, camp, kind, x, y) {
      super(G, 2, x, y);
      const s = TW.MONSTER[kind], grow = 1 + TUNE.monsterGrow * (G.t / 60);
      this.isMonster = true; this.kind = kind; this.camp = camp; this.name = s.name; this.heavy = !!s.heavy;
      this.homeX = x; this.homeY = y; this.r = s.r;
      this.maxHp = this.hp = Math.round(kind === 'boss' ? s.hp + 300 * (G.t / 60) : s.hp * grow);
      this.ad = this.baseAd = s.ad * (kind === 'boss' ? 1 + 0.05 * (G.t / 60) : grow); this.as = s.as; this.range = s.range; this.baseMs = this.ms = s.ms; this.def = this.baseDef = s.def;
      this.gold = Math.round(s.gold * (1 + 0.03 * (G.t / 60))); this.xp = Math.round(s.xp * (1 + 0.04 * (G.t / 60)));
      this.skill = s.skill || null; this.buffKind = s.buff || null; this.grow = grow;
      this.skillT = 3 + G.rng() * 2; this.skillN = 0; this.reset = false; this.calmT = 0; this.casting = 0;
      this.sight = 8; this.facing = Math.PI / 2 + (G.rng() - 0.5) * 0.6;
      if (kind === 'boss') { this.ranged = true; this.range = 10.5; this.proj = { kind: 'spit', speed: 24, color: '#7dffd9' }; }
      this.leash = kind === 'boss' ? 15 : kind === 'elder' ? 12 : 10;
    }
    repath() { }
    /* 맞으면 그 영웅을 노린다 */
    provoke(src) {
      if (this.dead || !src || !src.isHero) return;
      this.reset = false; this.calmT = 0;
      if (!this.target || this.target.dead || U.du(this, src) < U.du(this, this.target) - 2) this.target = src;
      for (const m of this.camp.alive) if (m !== this && !m.dead && !m.target) { m.target = src; m.reset = false; }
    }
    pickTarget() {
      let best = null, bd = this.leash;
      for (const h of this.G.heroes) {
        if (h.dead) continue;
        const d = U.dist(h.x, h.y, this.homeX, this.homeY);
        if (d < bd && this.G.t - h.lastMonsterHit < 4) { bd = d; best = h; }
      }
      return best;
    }
    update(dt) {
      const G = this.G;
      this.tickBuffs(dt);
      if (this.dead) return;
      if (this.atkCd > 0) this.atkCd -= dt;
      if (this.disp) { this.wind = null; this.updateDisp(dt); return; }
      if (this.dash) { G.updateDash(this, dt); return; }
      if (this.stunned) { this.wind = null; return; }
      if (this.taunter && !this.heavy) this.target = this.taunter;
      let tg = this.target;
      if (tg && (tg.dead || U.dist(tg.x, tg.y, this.homeX, this.homeY) > this.leash + 2)) { tg = this.target = this.pickTarget(); }
      if (!tg) {
        // 싸움이 끝남: 집으로 돌아가며 회복
        this.wind = null;
        const dh = U.dist(this.x, this.y, this.homeX, this.homeY);
        if (dh > 0.6 && this.baseMs > 0) this.stepToward(this.homeX, this.homeY, dt, 1.4);
        if (this.hp < this.maxHp) { this.calmT += dt; if (this.calmT > 1.5) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.12 * dt); }
        return;
      }
      this.calmT = 0;
      if (this.tickWind(dt)) return;
      if (this.casting > 0) { this.casting -= dt; return; }
      this.skillT -= dt;
      const d = U.du(this, tg) - tg.r;
      if (this.skill && this.skillT <= 0 && d < 13) { TW.monsterSkill(G, this, tg); return; }
      if (d <= this.range) { this.faceTo(tg); if (this.atkCd <= 0) this.startAttack(tg); }
      else if (!this.rooted && this.baseMs > 0) {
        if (U.dist(this.x, this.y, this.homeX, this.homeY) < this.leash) this.stepToward(tg.x, tg.y, dt);
      }
    }
  }

  /* ---------- 구조물 (등불탑 / 큰등불) ---------- */
  class Structure extends Unit {
    constructor(G, team, kind, lane, tier, x, y) {
      super(G, team, x, y);
      this.isStruct = true; this.kind = kind; this.lane = lane; this.tier = tier; this.heavy = true;
      this.ranged = true; this.vulnerable = false; this.heat = 0; this.heatTarget = null; this.forced = null;
      if (kind === 'core') {
        this.name = '큰등불'; this.r = 3.6; this.maxHp = this.hp = TUNE.coreHp; this.def = this.baseDef = 60; this.ad = 190; this.as = 1.0; this.range = C.CORE_RANGE; this.sight = C.SIGHT_CORE;
      } else {
        this.name = tier === 1 ? '바깥 등불탑' : '안쪽 등불탑'; this.r = 1.9; this.range = C.TOWER_RANGE; this.as = 0.9; this.sight = C.SIGHT_TOWER;
        if (tier === 1) { this.maxHp = this.hp = TUNE.towerHp1; this.def = this.baseDef = 45; this.ad = 140; }
        else { this.maxHp = this.hp = TUNE.towerHp2; this.def = this.baseDef = 55; this.ad = 165; }
      }
      this.proj = { kind: 'tower', speed: 30 };
      this.lastShotT = -99; this.lockT = 0; this.lockMax = 1; this.lockHero = null; this.lockHeroT = -99;
    }
    recalc() { /* 구조물은 상태 이상을 받지 않는다 */ }
    aimAt(tg, defend) {
      this.target = tg;
      if (tg && tg.isHero) {
        const again = tg === this.lockHero && this.G.t - this.lockHeroT < 4;
        this.lockT = this.lockMax = again ? 0.2 : defend ? 0.3 : 0.6;
        this.lockHero = tg; this.lockHeroT = this.G.t;
        this.G.emit('towerLock', { tower: this, target: tg, defend: !!defend });
      } else this.lockT = 0;
    }
    update(dt) {
      const G = this.G;
      if (this.atkCd > 0) this.atkCd -= dt;
      let tg = this.target;
      if (tg && (tg.dead || !G.canTarget(this, tg) || U.du(this, tg) - tg.r > this.range)) { tg = this.target = null; this.lockT = 0; }
      if (this.forced) {            // 범위 안에서 아군 영웅을 때린 적 영웅이 최우선
        const f = this.forced; this.forced = null;
        if (f !== tg && !f.dead && G.canTarget(this, f) && U.du(this, f) - f.r <= this.range && (!tg || !tg.isHero)) { this.aimAt(f, true); tg = f; }
      }
      if (!tg) {
        let best = null, bs = Infinity;
        const list = G.hash.query(this.x, this.y, this.range);
        for (let i = 0; i < list.length; i++) {
          const u = list[i];
          if (u.team === this.team || u.team === 2 || !G.canTarget(this, u)) continue;
          let score = U.du(this, u);
          if (u.isHero) score += 100; else if (u.kind === 'siege' || u.kind === 'super') score -= 6;
          if (score < bs) { bs = score; best = u; }
        }
        tg = best; this.aimAt(tg, false);
      }
      if (tg !== this.heatTarget) { this.heat = 0; this.heatTarget = tg; }
      if (!tg) return;
      this.faceTo(tg);
      if (tg.isHero) this.lockHeroT = G.t;
      if (this.lockT > 0) { this.lockT -= dt; return; }
      if (this.atkCd <= 0) {
        this.atkCd = 1 / this.as; this.lastShotT = G.t;
        let dmg = this.ad * (1 + 0.025 * Math.max(0, G.t - 240) / 60), kind = 'phys';
        if (tg.isHero) { dmg *= 1 + TUNE.towerHeat * this.heat; this.heat = Math.min(TUNE.towerHeatMax, this.heat + 1); }
        else if (tg.isMinion) {
          const pct = tg.kind === 'melee' ? 0.45 : tg.kind === 'ranged' ? 0.7 : tg.kind === 'siege' ? 0.14 : 0.08;
          dmg = Math.max(dmg, tg.maxHp * pct); kind = 'true';
        }
        G.launch(this, tg, dmg, kind);
        G.emit('attackStart', { u: this, target: tg, dur: 0 });
      }
    }
  }

  /* ---------- 영웅 ---------- */
  class Hero extends Unit {
    constructor(G, team, heroId, slot, isPlayer, pos) {
      const f = M.bases[team].fountain;
      const ang = (slot - 2) * 0.6 + (team === 0 ? 0 : Math.PI);
      super(G, team, f.x + Math.cos(ang) * 3.4, f.y + Math.sin(ang) * 3.4);
      this.isHero = true; this.hd = TW.Heroes[heroId]; this.heroId = heroId; this.name = this.hd.name;
      this.slot = slot; this.isPlayer = !!isPlayer; this.brain = null; this.pos = pos || 'mid';
      this.spawnX = this.x; this.spawnY = this.y;
      this.r = 1.0; this.ranged = this.hd.ranged; this.proj = this.hd.proj || null;
      this.level = 1; this.xp = 0; this.gold = C.START_GOLD; this.items = {}; this.pas = {};
      this.kills = 0; this.deaths = 0; this.assists = 0; this.cs = 0; this.streak = 0; this.feed = 0; this.multi = 0; this.lastKillT = -99;
      this.stats = { dmg: 0, taken: 0, heal: 0, struct: 0, gold: C.START_GOLD, shots: [0, 0, 0, 0], hits: [0, 0, 0, 0], camps: 0, rolls: 0 };
      this.cds = [0, 0, 0, 0]; this.rollCd = 0;
      this.order = null; this.cast = null; this.channel = null; this.charge = null; this.recall = null; this.hold = false;
      this.respawnT = 0; this.respawnMax = 1; this.damagers = new Map(); this.hurtLog = []; this.lastDeath = null;
      this.sight = C.SIGHT_HERO; this.idleT = 0; this.atFountain = true;
      this.lastAct = -99; this.lastHeroFight = -99; this.lastHeroHurt = -99; this.lastMonsterHit = -99; this.lastCastT = -99; this.lastCastSlot = -1; this.levelUpT = -99;
      this.dmgMul = 1; this.goldMul = 1; this.cdr = 0; this.regen = 0; this.cdRate = 0; this.regenPct = 0; this.structMul = 0; this.burn = false;
      this.aimX = this.x + (team === 0 ? 5 : -5); this.aimY = this.y; this.aimUnit = null;
      this.atkN = 0; this.lastStandT = 0; this.oocOn = false; this.bossPending = false; this.hitSeq = [-1, -1, -1, -1];
      this.recalc();
      this.hp = this.maxHp;
    }
    recalc() {
      const b = this.hd.base, L = this.level - 1;
      let hp = b.hp + b.hpG * L, ad = b.ad + b.adG * L, ap = 0, def = b.def + b.defG * L;
      let asPct = b.asG * L / b.as, msFlat = 0, msPct = 0, cdr = 0, ls = 0, pen = 0, regen = b.regen + 0.25 * L;
      const pas = this.pas = {};
      for (const id in this.items) {
        const tier = this.items[id]; if (!tier) continue;
        const it = TW.Items[id], v = it.v[tier - 1];
        if (it.stat === 'ad') ad += v; else if (it.stat === 'asPct') asPct += v; else if (it.stat === 'ap') ap += v; else if (it.stat === 'hp') hp += v;
        else if (it.stat === 'def') def += v; else if (it.stat === 'ls') ls += v; else if (it.stat === 'ms') msFlat += v; else if (it.stat === 'cdr') cdr += v;
        if (it.ad) ad += it.ad[tier - 1];
        if (it.def) def += it.def[tier - 1];
        if (tier >= 3) pas[it.pas] = true;
      }
      if (pas.pierce) pen = 0.3;
      if (pas.swift && this.oocOn) msPct += 0.12;
      let slowP = 0, stun = false, root = false, air = false, frozen = false, taunter = null, shield = 0, dT = 0, dO = 0, cdRate = 0, cap = 0, deflect = 0, regenPct = 0, structMul = 0, burn = false;
      for (const bf of this.buffs) {
        if (bf.ad) ad += bf.ad; if (bf.ap) ap += bf.ap; if (bf.def) def += bf.def; if (bf.asPct) asPct += bf.asPct; if (bf.msPct) msPct += bf.msPct;
        if (bf.slow > slowP) slowP = bf.slow;
        if (bf.stun) stun = true; if (bf.root) root = true; if (bf.airborne) { air = true; stun = true; } if (bf.freeze) { frozen = true; stun = true; }
        if (bf.taunt && !bf.taunt.dead) taunter = bf.taunt;
        if (bf.shield > 0) shield += bf.shield;
        if (bf.dmgTaken) dT += bf.dmgTaken; if (bf.dmgOut) dO += bf.dmgOut; if (bf.cdRate) cdRate += bf.cdRate;
        if (bf.sight && (!cap || bf.sight < cap)) cap = bf.sight;
        if (bf.deflect > deflect) deflect = bf.deflect;
        if (bf.regenPct) regenPct += bf.regenPct; if (bf.structMul) structMul += bf.structMul; if (bf.burn) burn = true;
      }
      const oldHp = this.maxHp, fresh = !this._init;
      this.maxHp = hp;
      if (!fresh && !this.dead && hp > oldHp) this.hp += hp - oldHp;
      if (this.hp > hp) this.hp = hp;
      this._init = true;
      this.ad = ad; this.ap = ap; this.def = def; this.as = Math.min(2.6, b.as * (1 + asPct));
      this.baseMs = b.ms + msFlat; this.ms = this.baseMs * (1 + msPct) * (1 - slowP);
      this.cdr = Math.min(0.4, cdr); this.ls = ls; this.pen = pen; this.regen = regen; this.cdRate = cdRate; this.regenPct = regenPct; this.structMul = structMul; this.burn = burn;
      this.stunned = stun; this.rooted = root || stun; this.airborne = air; this.frozen = frozen; this.taunter = taunter; this.shield = shield; this.slowPct = slowP;
      this.dmgTaken = dT; this.dmgOut = dO; this.sightCap = cap; this.deflect = deflect;
      this.range = b.range;
    }
    xpNeed() { return xpNeed(this.level); }
    addXp(a) {
      if (this.level >= C.MAX_LEVEL) return;
      this.xp += a;
      while (this.level < C.MAX_LEVEL && this.xp >= xpNeed(this.level)) {
        this.xp -= xpNeed(this.level); this.level++; this.recalc(); this.levelUpT = this.G.t;
        this.G.emit('levelup', { u: this, ult: this.level === C.ULT_LEVEL });
      }
      if (this.level >= C.MAX_LEVEL) this.xp = 0;
    }
    addGold(g) { g = Math.round(g * this.goldMul); this.gold += g; this.stats.gold += g; return g; }
    ultReady() { return this.level >= C.ULT_LEVEL; }

    /* ----- 명령 ----- */
    /* 구조물에 바짝 붙은 자리(몸이 밀려나는 고리 안)에는 설 수 없다 → 목적지를 그 바깥으로 옮긴다.
       (예전에는 등불탑 옆을 누르면 그 자리로 가려다 밀려나기를 되풀이하며 제자리걸음을 했다) */
    standable(p) {
      const ss = this.G.structs;
      for (let i = 0; i < ss.length; i++) {
        const s = ss[i]; if (s.dead) continue;
        const min = s.r + this.r * 0.5 + 0.25, dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy);
        if (d >= min) continue;
        const base = d > 0.3 ? Math.atan2(dy, dx) : Math.atan2(this.y - s.y, this.x - s.x);
        for (let k = 0; k < 9; k++) {
          const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45, nx = s.x + Math.cos(a) * (min + 0.1), ny = s.y + Math.sin(a) * (min + 0.1);
          if (M.isWalkable(nx, ny)) return { x: nx, y: ny };
        }
        return p;
      }
      return p;
    }
    cmdMove(x, y, attackMove) {
      if (this.dead) return;
      const p = this.standable(M.nearestWalkable(x, y));
      const o = this.order;
      this.hold = false;
      if (this.recall) this.cancelRecall();
      if (o && o.type === 'move' && !!o.attackMove === !!attackMove && U.dist(o.gx, o.gy, p.x, p.y) < 0.4) return;
      this.order = { type: 'move', path: M.findPath(this.x, this.y, p.x, p.y), pi: 0, attackMove: !!attackMove, gx: p.x, gy: p.y };
      // 평타 선딜 중의 이동: 한 틱 안에 맞을 참이면 때리고 나서 움직이고(때리고 빠지기), 아니면 그 자리에서 끊고 움직인다. 끊긴 평타는 곧바로 다시 칠 수 있다
      if (this.wind && this.wind.dur - this.wind.t > COMMIT) { this.wind = null; this.atkCd = Math.min(this.atkCd, 0.12); this.G.emit('atkCancel', { u: this }); }
    }
    cmdAttack(u) {
      if (this.dead || !u || u.dead) return;
      const o = this.order;
      this.hold = false;
      if (this.recall) this.cancelRecall();
      if (o && o.type === 'attack' && o.target === u && !o.auto) return;
      if (this.wind && this.wind.target !== u) this.wind = null;
      this.order = { type: 'attack', target: u };
    }
    cmdStop() { this.order = null; this.wind = null; this.hold = true; if (this.recall) this.cancelRecall(); }
    cmdRecall() {
      if (this.dead || this.dash || this.cast || this.channel || this.charge || this.cc || this.recall) return false;
      this.order = null; this.wind = null; this.recall = { t: 0 };
      this.G.emit('recallStart', { u: this });
      return true;
    }
    cancelRecall() { if (this.recall) { this.recall = null; this.G.emit('recallCancel', { u: this }); } }
    rollCdMax() { return C.ROLL_CD * (this.pas.tumble ? 0.65 : 1); }
    /* 구르기: 커서 쪽으로 짧게 몸을 날린다. 구르는 동안 날아오는 스킬은 맞지 않는다 */
    cmdRoll(x, y) {
      if (this.dead || this.rollCd > 0 || this.cc || this.rooted || this.dash || this.taunter) return false;
      let dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
      if (d < 0.05) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); d = 1; }
      dx /= d; dy /= d;
      this.interruptActs(true);
      this.rollCd = this.rollCdMax();
      this.dodgeUntil = this.G.t + C.ROLL_IFRAME;
      this.stats.rolls++;
      this.G.dash(this, this.x + dx * C.ROLL_DIST, this.y + dy * C.ROLL_DIST, C.ROLL_DIST / C.ROLL_TIME, { kind: 'roll', trail: this.hd.glow });
      this.G.emit('roll', { u: this, dx, dy });
      return true;
    }
    /* 시전·차징·집중·귀환을 끊는다 */
    interruptActs(byUser) {
      this.wind = null;
      if (this.cast) { this.cast = null; }
      if (this.channel) { const ch = this.channel; this.channel = null; if (ch.ab.onEnd) ch.ab.onEnd(this.G, this, ch, true); this.G.emit('channelEnd', { u: this, slot: ch.slot }); }
      if (this.charge) { const slot = this.charge.slot; this.charge = null; if (!byUser) this.cds[slot] = TW.Heroes[this.heroId].abilities[slot].cd * (1 - this.cdr) * 0.5; this.G.emit('chargeEnd', { u: this, slot, fired: false }); }
      if (this.recall) this.cancelRecall();
    }
    castBlock(slot) {
      const ab = this.hd.abilities[slot];
      if (this.dead) return 'dead';
      if (ab.ult && !this.ultReady()) return 'locked';
      if (this.cds[slot] > 0) return 'cd';
      if (this.cc || this.taunter) return 'cc';
      if (this.dash || this.cast || this.channel || this.charge) return 'busy';
      return null;
    }
    /* 반환: 'ok' 또는 차단 사유 */
    cmdCast(slot, x, y, unit) {
      const ab = this.hd.abilities[slot];
      const why = this.castBlock(slot); if (why) return why;
      if (ab.type === 'charge') { this.beginCharge(slot); return 'ok'; }
      let dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
      if (!(d > 0.01)) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); d = 1; x = this.x + dx; y = this.y + dy; }
      let tg;
      if (ab.type === 'self') tg = { x: this.x, y: this.y, dx: Math.cos(this.facing), dy: Math.sin(this.facing), unit: null };
      else if (ab.type === 'dir') tg = { x, y, dx: dx / d, dy: dy / d, unit: null };
      else if (ab.type === 'ground') {
        if (d > ab.range) { x = this.x + dx / d * ab.range; y = this.y + dy / d * ab.range; }
        if (ab.ind === 'blink' || ab.icon === 'landslide') { const p = M.nearestWalkable(x, y, 8); x = p.x; y = p.y; }
        tg = { x, y, dx: dx / d, dy: dy / d, unit: null };
      } else {    // ally
        if (!unit || unit.dead || unit.team !== this.team || !unit.isHero || U.du(this, unit) > ab.range + 1) unit = this;
        tg = { x: unit.x, y: unit.y, dx: 0, dy: 0, unit };
      }
      this.beginCast(slot, tg);
      return 'ok';
    }
    beginCast(slot, tg) {
      const G = this.G, ab = this.hd.abilities[slot];
      this.cds[slot] = ab.cd * (1 - this.cdr);
      this.hold = false; this.wind = null;
      if (this.recall) this.cancelRecall();
      if (tg.dx || tg.dy) this.facing = Math.atan2(tg.dy, tg.dx);
      this.lastCastT = G.t; this.lastCastSlot = slot; this.lastAct = G.t; this.stats.shots[slot]++;
      if (this.bush) this.revealT = G.t + C.REVEAL_ON_ACT;
      G.emit('cast', { u: this, slot, ab, tg });
      if (ab.castTime > 0) this.cast = { t: 0, dur: ab.castTime, ab, tg, slot };
      else this.fire(slot, tg);
    }
    fire(slot, tg) {
      const G = this.G, ab = this.hd.abilities[slot];
      G.emit('castFire', { u: this, slot, ab, tg });
      if (ab.chan) {
        this.channel = { slot, ab, t: 0, n: 0, tickT: ab.chan.tick, tg };     // 첫 발은 바로
        G.emit('channelStart', { u: this, slot, dur: ab.chan.dur });
        if (!ab.chan.canMove) this.order = null;
      }
      ab.cast(G, this, tg);
    }
    beginCharge(slot) {
      const G = this.G;
      this.wind = null; this.hold = false; if (this.recall) this.cancelRecall();
      this.charge = { slot, t: 0, queued: false };
      this.lastAct = G.t; if (this.bush) this.revealT = G.t + C.REVEAL_ON_ACT;
      G.emit('chargeStart', { u: this, slot });
    }
    /* 모으던 스킬을 (x,y) 쪽으로 쏜다. 아직 최소 시간이 안 됐으면 채워지는 순간 나간다 */
    cmdRelease(x, y) {
      const ch = this.charge; if (!ch) return false;
      ch.queued = true; ch.qx = x; ch.qy = y;
      return true;
    }
    chargeK() { const ch = this.charge; if (!ch) return 0; const c = this.hd.abilities[ch.slot].charge; return U.clamp((ch.t - c.min) / (c.max - c.min), 0, 1); }
    doRelease() {
      const G = this.G, ch = this.charge, ab = this.hd.abilities[ch.slot], k = this.chargeK();
      let dx = ch.qx - this.x, dy = ch.qy - this.y, d = Math.hypot(dx, dy);
      if (!(d > 0.01)) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); d = 1; }
      const tg = { x: ch.qx, y: ch.qy, dx: dx / d, dy: dy / d, unit: null };
      this.charge = null;
      this.cds[ch.slot] = ab.cd * (1 - this.cdr);
      this.facing = Math.atan2(dy, dx);
      this.lastCastT = G.t; this.lastCastSlot = ch.slot; this.lastAct = G.t; this.stats.shots[ch.slot]++;
      if (this.bush) this.revealT = G.t + C.REVEAL_ON_ACT;
      G.emit('cast', { u: this, slot: ch.slot, ab, tg, k });
      G.emit('castFire', { u: this, slot: ch.slot, ab, tg, k });
      ab.release(G, this, tg, k);
      G.emit('chargeEnd', { u: this, slot: ch.slot, fired: true, k });
    }
    repath() {
      const o = this.order;
      if (o && o.type === 'move') { o.path = M.findPath(this.x, this.y, o.gx, o.gy); o.pi = 0; }
      else if (o) o.path = null;
    }
    followPath(o, dt, mul) {
      let move = this.ms * (mul || 1) * dt, guard = 0;
      while (move > 1e-6 && o.pi < o.path.length && guard++ < 8) {
        const p = o.path[o.pi];
        const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
        if (d <= move) {
          if (M.isWalkable(p.x, p.y)) { this.x = p.x; this.y = p.y; }
          move -= d; o.pi++;
          if (d > 1e-3) this.facing = Math.atan2(dy, dx);
        } else {
          this.facing = Math.atan2(dy, dx);
          if (!this.tryMove(this.x + dx / d * move, this.y + dy / d * move)) {
            const last = o.path[o.path.length - 1];
            if (!o.rp || this.G.t - o.rp > 0.4) { o.rp = this.G.t; o.path = M.findPath(this.x, this.y, last.x, last.y); o.pi = 0; }
          }
          move = 0;
        }
      }
      return o.pi >= o.path.length;
    }
    chase(o, tg, dt) {
      o.repathT = (o.repathT || 0) - dt;
      if (!o.path || (o.repathT <= 0 && U.dist(tg.x, tg.y, o.gx, o.gy) > 1.0) || o.pi >= o.path.length) {
        o.path = M.findPath(this.x, this.y, tg.x, tg.y); o.pi = 0; o.gx = tg.x; o.gy = tg.y; o.repathT = 0.3;
      }
      this.followPath(o, dt);
    }
    /* 가만히 있을 때 알아서 칠 대상 (플레이어 영웅용) */
    findAutoTarget(r, minionsOnly) {
      const G = this.G; let best = null, bs = Infinity;
      const list = G.hash.query(this.x, this.y, r);
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (u.team === this.team || !G.canTarget(this, u)) continue;
        if (u.isStruct) continue;
        if (u.isMonster && !(u.target === this)) continue;                 // 중립 몬스터는 먼저 건드리지 않는다
        if (u.isHero && minionsOnly && G.t - this.lastHeroHurt > 3) continue;
        let score = U.du(this, u) - u.r;
        if (u.isHero) score -= 1.5;
        else if (u.isMinion && u.hp <= TW.atkPreview(this, u)) score -= 6;      // 한 대면 쓰러지는 미니언부터 (알아서 칠 때도 막타를 흘리지 않게)
        if (score < bs) { bs = score; best = u; }
      }
      return best;
    }
    runOrder(dt, moveOnly, mul) {
      const G = this.G, o = this.order;
      if (!o) {
        if (this.brain || this.hold || moveOnly) return;
        this.idleT -= dt;
        if (this.idleT <= 0) {
          this.idleT = 0.15;
          const e = this.findAutoTarget(this.ranged ? this.range + 0.5 : 5, true);
          if (e) this.order = { type: 'attack', target: e, auto: true, leash: 3 };
        }
        return;
      }
      if (o.type === 'move') {
        if (o.attackMove && !moveOnly) {
          const e = this.findAutoTarget(this.ranged ? this.range + 1 : 6.5, false);
          if (e) { this.order = { type: 'attack', target: e, auto: true, leash: 4, resume: o }; return; }
        }
        if (this.rooted) return;
        // 마지막 길목 코앞에서 더 나아가지 못하면(무언가에 밀려 제자리걸음) 다 온 것으로 친다 → 명령이 끝나야 다시 알아서 친다
        if (o.lx !== undefined && Math.hypot(this.x - o.lx, this.y - o.ly) < 0.02) o.still = (o.still || 0) + 1; else o.still = 0;
        o.lx = this.x; o.ly = this.y;
        if (this.followPath(o, dt, mul) || (o.still >= 6 && o.pi >= o.path.length - 1 && U.dist(this.x, this.y, o.gx, o.gy) < 1.5)) { this.order = null; this.idleT = 0.2; }
      } else if (o.type === 'attack') {
        let tg = o.target;
        // 알아서 치는 중(내가 고른 대상이 아님)이면, 칠 차례가 올 때 한 대면 쓰러지는 미니언으로 눈을 돌린다
        if (o.auto && !moveOnly && this.isPlayer && this.atkCd <= 0.1 && !(tg.isMinion && tg.hp <= TW.atkPreview(this, tg))) {
          const e = this.findAutoTarget(this.ranged ? this.range + 0.5 : 5, true);
          if (e && e !== tg && e.isMinion && e.hp <= TW.atkPreview(this, e)) tg = o.target = e;
        }
        if (tg.dead || !G.canTarget(this, tg)) {
          this.order = o.resume ? { type: 'move', path: M.findPath(this.x, this.y, o.resume.gx, o.resume.gy), pi: 0, attackMove: true, gx: o.resume.gx, gy: o.resume.gy } : null;
          return;
        }
        const d = U.du(this, tg) - tg.r;
        if (d <= this.range && !moveOnly) {
          this.faceTo(tg);
          if (this.atkCd <= 0) this.startAttack(tg);
        } else if (d > this.range) {
          if (o.auto && d > this.range + (o.leash || 4)) { this.order = o.resume || null; if (this.order) this.repath(); return; }
          if (this.rooted) return;
          this.chase(o, tg, dt);
        }
      }
    }
    update(dt) {
      const G = this.G;
      if (this.dead) { this.respawnT -= dt; if (this.respawnT <= 0) G.respawn(this); return; }
      this.tickBuffs(dt);
      if (this.dead) return;
      const cdk = dt * (1 + this.cdRate);
      for (let i = 0; i < 4; i++) if (this.cds[i] > 0) this.cds[i] = Math.max(0, this.cds[i] - cdk);
      if (this.rollCd > 0) this.rollCd = Math.max(0, this.rollCd - cdk);
      if (this.atkCd > 0) { this.atkCd -= dt; if (this.atkCd <= 0 && this.isPlayer) G.emit('atkReady', { u: this }); }
      const ooc = G.t - this.lastHurt > 5;
      if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + (this.regen * (ooc ? TUNE.oocRegen : 1) + this.maxHp * (this.regenPct + (ooc && this.pas.regen ? 0.02 : 0))) * dt);
      if (this.pas.swift || this.oocOn) { const calm = !!this.pas.swift && G.t - Math.max(this.lastHurt, this.lastAct) > 5; if (calm !== this.oocOn) { this.oocOn = calm; this.recalc(); } }
      if (this.aimUnit) { const a = this.aimUnit; if (a.dead || !a.seen[this.team]) this.aimUnit = null; else { this.aimX = a.x; this.aimY = a.y; } }
      if (this.hd.onTick) this.hd.onTick(G, this, dt);
      if (this.disp) { this.interruptActs(false); this.updateDisp(dt); return; }
      if (this.dash) { G.updateDash(this, dt); return; }
      if (this.stunned) { this.interruptActs(false); return; }
      if (this.taunter) {                       // 홀림: 건 쪽으로 걸어가 때린다
        const tn = this.taunter;
        this.interruptActs(false);
        if (this.tickWind(dt)) return;
        const d = U.du(this, tn) - tn.r;
        if (d <= this.range) { this.faceTo(tn); if (this.atkCd <= 0) this.startAttack(tn); }
        else if (!this.rooted) this.stepToward(tn.x, tn.y, dt);
        return;
      }
      if (this.cast) {
        const c = this.cast; c.t += dt;
        if (c.t >= c.dur) { this.cast = null; this.fire(c.slot, c.tg); }
        return;
      }
      if (this.channel) {
        const ch = this.channel, cn = ch.ab.chan;
        const want = Math.atan2(this.aimY - this.y, this.aimX - this.x);
        this.facing += U.clamp(U.angDiff(this.facing, want), -cn.turn * dt, cn.turn * dt);
        ch.t += dt; ch.tickT += dt;
        while (ch.tickT >= cn.tick && this.channel === ch) { ch.tickT -= cn.tick; ch.ab.onTick(G, this, ch); ch.n++; if (this.bush) this.revealT = G.t + C.REVEAL_ON_ACT; }
        if (this.channel === ch && ch.t >= cn.dur) { this.channel = null; if (ch.ab.onEnd) ch.ab.onEnd(G, this, ch, false); G.emit('channelEnd', { u: this, slot: ch.slot }); }
        if (cn.canMove && this.order && this.order.type === 'move') { const f = this.facing; this.runOrder(dt, true, cn.moveMul); this.facing = f; }
        return;
      }
      if (this.charge) {
        const ch = this.charge, c = this.hd.abilities[ch.slot].charge;
        ch.t += dt;
        this.facing = Math.atan2(this.aimY - this.y, this.aimX - this.x);
        if (ch.t >= c.hold && !ch.queued) { ch.queued = true; ch.qx = this.aimX; ch.qy = this.aimY; }
        if (ch.queued && ch.t >= c.min) { this.doRelease(); return; }
        if (this.order && this.order.type === 'move') { const f = this.facing; this.runOrder(dt, true, c.moveMul); this.facing = f; }
        return;
      }
      if (this.recall) {
        this.recall.t += dt;
        if (this.recall.t >= C.RECALL_TIME) {
          this.recall = null; this.order = null;
          G.fx('recallOut', { x: this.x, y: this.y });
          this.x = this.px = this.spawnX; this.y = this.py = this.spawnY;
          G.emit('recallDone', { u: this });
        }
        return;
      }
      // 선딜이 이어지는 동안에는 다른 행동을 하지 않는다. 방금 맞혔으면(선딜이 끝났으면) 같은 틱에 곧바로 다음 명령으로 넘어간다 → 때린 그 순간부터 발이 움직인다
      if (this.tickWind(dt) && this.wind) return;
      this.runOrder(dt, false, 1);
    }
  }

  TW.Unit = Unit; TW.Minion = Minion; TW.Monster = Monster; TW.Structure = Structure; TW.Hero = Hero;
})();
