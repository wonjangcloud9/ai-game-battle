/* 청홍대전 — sim: 게임 규칙 전체 (렌더링과 무관하게 동작) */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const C = AOS.C, U = AOS.U, M = AOS.Map;
  const EMPTY = Object.freeze({});
  const ATTACK = Object.freeze({ attack: true }), DOT = Object.freeze({ dot: true }), PROC = Object.freeze({ proc: true }), REFLECT = Object.freeze({ reflect: true });

  /* ---------- 공간 해시 ---------- */
  const CELL = 8, HW = Math.ceil(C.W / CELL), HH = Math.ceil(C.H / CELL);
  class Hash {
    constructor() { this.cells = []; for (let i = 0; i < HW * HH; i++) this.cells.push([]); }
    rebuild(units) {
      for (const c of this.cells) c.length = 0;
      for (const u of units) {
        if (u.dead) continue;
        const cx = U.clamp((u.x / CELL) | 0, 0, HW - 1), cy = U.clamp((u.y / CELL) | 0, 0, HH - 1);
        this.cells[cy * HW + cx].push(u);
      }
    }
    /* 중심 거리 ≤ r + 대상 반지름 인 유닛 */
    query(x, y, r) {
      const out = [];
      const pad = r + 4.5;
      const x0 = U.clamp(((x - pad) / CELL) | 0, 0, HW - 1), x1 = U.clamp(((x + pad) / CELL) | 0, 0, HW - 1);
      const y0 = U.clamp(((y - pad) / CELL) | 0, 0, HH - 1), y1 = U.clamp(((y + pad) / CELL) | 0, 0, HH - 1);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * HW + cx];
        for (let i = 0; i < cell.length; i++) {
          const u = cell[i];
          const dx = u.x - x, dy = u.y - y, rr = r + u.r;
          if (dx * dx + dy * dy <= rr * rr) out.push(u);
        }
      }
      return out;
    }
  }

  /* ---------- 유닛 공통 ---------- */
  class Unit {
    constructor(G, team, x, y) {
      this.G = G; this.id = G.nextId++; this.team = team;
      this.x = x; this.y = y; this.px = x; this.py = y; this.vx = 0; this.vy = 0;
      this.r = 0.7; this.facing = team === 0 ? 0 : Math.PI;
      this.hp = 1; this.maxHp = 1; this.mp = 0; this.maxMp = 0; this.dead = false;
      this.buffs = []; this.shield = 0;
      this.stunned = false; this.rooted = false; this.stealth = false; this.undying = false; this.slowPct = 0;
      this.ad = 10; this.ap = 0; this.def = 0; this.as = 1; this.range = 2; this.ms = 5; this.baseMs = 5;
      this.pen = 0; this.lifesteal = 0;
      this.atkCd = 0; this.wind = null; this.lastAtkT = -99; this.ranged = false;
      this.seen = [true, true]; this.sight = 12;
      this.lastHurt = -99; this.spawnT = G.t;
      this.isHero = false; this.isMinion = false; this.isStruct = false;
      this.target = null;
    }
    recalc() {
      let slowP = 0, stun = false, root = false, shield = 0;
      for (const b of this.buffs) {
        if (b.slow > slowP) slowP = b.slow;
        if (b.stun) stun = true; if (b.root) root = true; if (b.shield > 0) shield += b.shield;
      }
      this.slowPct = slowP; this.stunned = stun; this.rooted = root || stun; this.shield = shield;
      this.ms = this.baseMs * (1 - slowP);
    }
    tickBuffs(dt) {
      const bs = this.buffs; if (!bs.length) return;
      let changed = false;
      for (let i = bs.length - 1; i >= 0; i--) {
        const b = bs[i]; if (!b) continue;
        b.t += dt;
        if (b.dot) {                       // 지속 피해(잔불 등): 0.5초마다
          b.dotT = (b.dotT || 0) + dt;
          while (b.dotT >= 0.4999 && !this.dead) { b.dotT -= 0.5; this.G.damage(b.src, this, b.dot, 'magic', DOT); }
          if (this.dead) return;
        }
        if (b.t >= b.dur) { const k = bs.indexOf(b); if (k >= 0) bs.splice(k, 1); changed = true; if (b.onExpire) b.onExpire(this); }
      }
      if (changed) this.recalc();
    }
    hasBuff(id) { for (const b of this.buffs) if (b.id === id) return true; return false; }
    removeBuff(id) {
      for (let i = this.buffs.length - 1; i >= 0; i--) if (this.buffs[i].id === id) { this.buffs.splice(i, 1); this.recalc(); return true; }
      return false;
    }
    faceTo(u) { this.facing = Math.atan2(u.y - this.y, u.x - this.x); }
    tryMove(nx, ny) {
      if (M.isWalkable(nx, ny)) { this.x = nx; this.y = ny; return true; }
      if (M.isWalkable(nx, this.y)) { this.x = nx; return true; }
      if (M.isWalkable(this.x, ny)) { this.y = ny; return true; }
      return false;
    }
    stepToward(x, y, dt) {
      const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
      if (d < 1e-4) return false;
      const k = Math.min(1, this.ms * dt / d);
      this.facing = Math.atan2(dy, dx);
      return this.tryMove(this.x + dx * k, this.y + dy * k);
    }
    startAttack(tg) {
      const period = 1 / this.as;
      this.wind = { t: 0, dur: Math.max(0.1, period * (this.ranged ? 0.24 : 0.3)), target: tg };
      this.atkCd = period;
      this.faceTo(tg);
    }
    /* 공격 선딜 진행: true면 이번 틱은 다른 행동 불가 */
    tickWind(dt) {
      const w = this.wind; if (!w) return false;
      if (w.target.dead || !this.G.canTarget(this, w.target)) { this.wind = null; this.atkCd = Math.min(this.atkCd, 0.15); return false; }
      w.t += dt;
      if (w.t >= w.dur) {
        this.wind = null;
        // 휘두르는 사이 대상이 멀리 사라졌으면(귀환·순간이동 등) 헛친다
        if (U.du(this, w.target) - w.target.r <= this.range + 5) this.G.strike(this, w.target);
        else this.atkCd = Math.min(this.atkCd, 0.3);
      }
      return true;
    }
  }

  /* ---------- 미니언 ---------- */
  /* gold = 막타를 친 영웅만 받는 골드 */
  const MINION = {
    melee:  { hp: 460,  ad: 13, as: 0.8,  range: 1.6,  ms: 5.2, def: 0,  gold: 32, xp: 58,  r: 0.65, ranged: false },
    ranged: { hp: 290,  ad: 23, as: 0.67, range: 8.5,  ms: 5.2, def: 0,  gold: 24, xp: 30,  r: 0.6,  ranged: true, proj: { kind: 'mbolt', speed: 26 } },
    siege:  { hp: 850,  ad: 40, as: 0.5,  range: 11,   ms: 5.2, def: 15, gold: 66, xp: 90,  r: 1.0,  ranged: true, proj: { kind: 'shell', speed: 22 } },
    super:  { hp: 1500, ad: 52, as: 0.75, range: 2.0,  ms: 5.4, def: 30, gold: 70, xp: 100, r: 1.15, ranged: false },
  };
  const AGGRO = 9;
  /* 밸런스 조절 손잡이 (봇 대전 결과를 보고 맞춘 값) */
  const TUNE = AOS.TUNE = {
    minionVsMinion: 0.65,      // 미니언끼리 주는 피해 배율 (낮을수록 막타 여유가 길다)
    minionVsHero: 0.5, minionVsHeroEarly: 0.3,   // 미니언이 영웅에게 주는 피해 배율 (개전 직후 → 평소)
    heroVsMinionAtk: 1.0,      // 영웅 기본 공격이 미니언에게 주는 피해 배율
    towerEarly: 0.35,          // 개전 직후 포탑이 영웅에게 주는 피해 배율 (→ 1.0)
    earlyFrom: 120, earlyTo: 300,          // 위 '개전 직후' 보정이 풀리는 구간(초)
    towerGrowth: 0.03,         // 5분 이후 분당 포탑 피해 증가
    xpBase: 240, xpStep: 85,
    oocRegen: 2.0,
  };
  class Minion extends Unit {
    constructor(G, team, lane, kind, prog, off) {
      const t = M.toT(team, lane, Math.max(0, prog));
      const p = M.lanePoint(lane, t), d = M.laneDir(lane, t);
      super(G, team, p.x - d.y * off, p.y + d.x * off);
      const s = MINION[kind], w = G.wave - 1;
      this.isMinion = true; this.kind = kind; this.lane = lane; this.off = off; this.lt = t; this.laneD = Math.abs(off);
      this.r = s.r; this.ranged = s.ranged; this.proj = s.proj || null;
      this.maxHp = this.hp = Math.round(s.hp * (1 + 0.022 * w));
      this.ad = s.ad * (1 + 0.016 * w); this.as = s.as; this.range = s.range; this.baseMs = this.ms = s.ms; this.def = s.def;
      this.gold = Math.round(s.gold + 0.4 * w); this.xp = Math.round(s.xp * (1 + 0.012 * w));
      this.sight = C.SIGHT_MINION;
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
      for (const u of list) {
        if (u.team === this.team || !G.canTarget(this, u)) continue;
        let score = U.du(this, u) - u.r;
        if (u.isHero) score += 4; else if (u.isStruct) score += 2;
        if (u === this.target) score -= 1.5;
        if (score < bs) { bs = score; best = u; }
      }
      this.target = best;
    }
    advance(dt) {
      const L = M.lanes[this.lane], dir = this.team === 0 ? 1 : -1;
      const look = this.lt + dir * 5;
      let tx, ty;
      if ((dir > 0 && look >= L.len) || (dir < 0 && look <= 0)) { const c = M.bases[1 - this.team].core; tx = c.x; ty = c.y; }
      else {
        const p = M.lanePoint(this.lane, look), d = M.laneDir(this.lane, look);
        tx = p.x - d.y * this.off; ty = p.y + d.x * this.off;
      }
      if (this.laneD > M.LANE_HW + 3) {       // 라인을 크게 벗어났으면 길찾기로 복귀
        if (!this.path) { this.path = M.findPath(this.x, this.y, tx, ty); this.pi = 0; }
        const p = this.path[this.pi];
        if (!p) { this.path = null; return; }
        if (U.dist(this.x, this.y, p.x, p.y) < 0.6) { this.pi++; return; }
        this.stepToward(p.x, p.y, dt);
        return;
      }
      this.path = null;
      this.stepToward(tx, ty, dt);
    }
    update(dt) {
      const G = this.G;
      this.tickBuffs(dt);
      if (this.dead) return;
      if (this.atkCd > 0) this.atkCd -= dt;
      if (this.stunned) { this.wind = null; return; }
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

  /* ---------- 구조물 (타워 / 코어) ---------- */
  class Structure extends Unit {
    constructor(G, team, kind, lane, tier, x, y) {
      super(G, team, x, y);
      this.isStruct = true; this.kind = kind; this.lane = lane; this.tier = tier;
      this.ranged = true; this.vulnerable = false; this.heat = 0; this.heatTarget = null; this.forced = null;
      if (kind === 'core') {
        this.r = 4; this.maxHp = this.hp = 5200; this.def = 60; this.ad = 185; this.as = 1.1; this.range = C.CORE_RANGE; this.sight = C.SIGHT_CORE;
      } else {
        this.r = 2.1; this.range = C.TOWER_RANGE; this.as = 1.1; this.sight = C.SIGHT_TOWER;
        if (tier === 1) { this.maxHp = this.hp = 2600; this.def = 40; this.ad = 150; }
        else { this.maxHp = this.hp = 3100; this.def = 55; this.ad = 172; }
      }
      this.proj = { kind: 'tower', speed: 30 };
      this.lastShotT = -99; this.lockT = 0; this.lockMax = 1; this.lockHero = null; this.lockHeroT = -99;
    }
    recalc() { /* 구조물은 버프 영향을 받지 않음 */ }
    /* 영웅을 새로 노릴 때: 바로 쏘지 않고 잠깐 조준(경고)한다 */
    aimAt(tg, defend) {
      this.target = tg;
      if (tg && tg.isHero) {
        // 같은 영웅이 들락날락하며 경고 시간만 빼먹지 못하게, 방금 조준했던 대상은 바로 쏜다
        const again = tg === this.lockHero && this.G.t - this.lockHeroT < 5;
        this.lockT = this.lockMax = again ? 0.25 : defend ? C.TOWER_LOCK_DEFEND : C.TOWER_LOCK;
        this.lockHero = tg; this.lockHeroT = this.G.t;
        this.G.emit('towerAggro', { tower: this, target: tg, defend: !!defend });
      } else this.lockT = 0;
    }
    /* 영웅에게 주는 포탑 피해 배율: 개전 직후에는 약하고, 시간이 갈수록 강해진다 */
    heroScale() {
      const t = this.G.t;
      return U.lerp(TUNE.towerEarly, 1, this.G.earlyK()) * (1 + TUNE.towerGrowth * Math.max(0, t - 300) / 60);
    }
    update(dt) {
      const G = this.G;
      if (this.atkCd > 0) this.atkCd -= dt;
      let tg = this.target;
      if (tg && (tg.dead || !G.canTarget(this, tg) || U.du(this, tg) - tg.r > this.range)) { tg = this.target = null; this.lockT = 0; }
      /* 범위 안에서 아군 영웅을 때린 적 영웅이 최우선 */
      if (this.forced) {
        const f = this.forced; this.forced = null;
        if (f !== tg && !f.dead && G.canTarget(this, f) && U.du(this, f) - f.r <= this.range && (!tg || !tg.isHero)) { this.aimAt(f, true); tg = f; }
      }
      /* 그다음은 미니언(공성 먼저), 미니언이 없을 때만 영웅 */
      if (!tg) {
        let best = null, bs = Infinity;
        for (const u of G.hash.query(this.x, this.y, this.range)) {
          if (u.team === this.team || !G.canTarget(this, u)) continue;
          let score = U.du(this, u);
          if (u.isHero) score += 100;
          else if (u.kind === 'siege' || u.kind === 'super') score -= 6;
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
        let dmg = this.ad;
        // 같은 영웅을 계속 쏘면 한 발마다 30%씩 더 아파진다 (개전 직후에는 이 누적도 약하다)
        if (tg.isHero) { dmg *= this.heroScale() * (1 + 0.3 * this.heat * (0.25 + 0.75 * G.earlyK())); this.heat = Math.min(4, this.heat + 1); }
        else if (tg.isMinion) {
          const pct = tg.kind === 'melee' ? 0.45 : tg.kind === 'ranged' ? 0.7 : tg.kind === 'siege' ? 0.14 : 0.09;
          dmg = Math.max(dmg, tg.maxHp * pct);
        }
        G.launch(this, tg, dmg, 0, tg.isMinion ? 'true' : 'phys');
        G.emit('attack', { u: this, target: tg });
      }
    }
  }

  /* ---------- 영웅 ---------- */
  const xpNeed = (L) => TUNE.xpBase + TUNE.xpStep * (L - 1);
  /* 기본 공격 한 대가 대상에게 실제로 주는 피해 (막타 판정·표시용) */
  AOS.hitDamage = function (h, tg) {
    let dmg = h.ad;
    if (h.pas && h.pas.execute && tg.hp <= tg.maxHp * 0.4) dmg *= 1.18;
    let def = tg.def || 0; if (h.pen) def *= 1 - h.pen;
    dmg *= 100 / (100 + Math.max(0, def));
    if (tg.isMinion) dmg *= TUNE.heroVsMinionAtk;
    return dmg * (h.dmgMul || 1);
  };
  /* 미니언이 지금 초당 얼마씩 맞고 있는가 (상대 팀 미니언·포탑이 노리는 만큼) */
  AOS.incomingDps = function (G, m) {
    let dps = 0;
    for (const a of G.hash.query(m.x, m.y, 13)) {
      if (a.team === m.team || a.dead || a.target !== m) continue;
      if (a.isMinion) { if (U.du(a, m) - m.r <= a.range + 0.6) dps += a.ad * a.as * TUNE.minionVsMinion * 100 / (100 + m.def); }
      else if (a.isStruct) dps += Math.max(a.ad, m.maxHp * (m.kind === 'melee' ? 0.45 : m.kind === 'ranged' ? 0.7 : m.kind === 'siege' ? 0.14 : 0.09)) * a.as;
    }
    return dps;
  };
  /* 막타 판정: 지금 공격 명령을 내리면 내 공격이 닿는 순간 이 미니언이 쓰러지는가
     - dmg   : 내 기본 공격 한 방의 피해
     - tHit  : 닿기까지 걸리는 시간(다가가기 + 공격 선딜 + 투사체 비행 + 남은 공격 대기)
     - hpAt  : 그때의 예상 체력
     - now   : 지금 누르면 막타가 된다 (화면의 금색 막대와 봇의 판단이 같은 기준을 쓴다) */
  AOS.lastHit = function (G, h, m, inc) {
    const d = U.du(h, m) - m.r, reach = d - h.range;
    const period = 1 / h.as, wind = Math.max(0.1, period * (h.ranged ? 0.24 : 0.3));
    const projV = h.ranged && h.proj ? h.proj.speed : 0;
    const tHit = Math.max(0, reach) / Math.max(1, h.ms) + Math.max(0, h.atkCd) + wind + (projV ? Math.min(d + m.r, h.range) / projV : 0);
    if (inc === undefined) inc = AOS.incomingDps(G, m);
    const dmg = AOS.hitDamage(h, m), hpAt = m.hp - inc * tHit;
    return { dmg, tHit, inc, hpAt, reach, now: m.hp <= dmg || (hpAt <= dmg * 0.94 && hpAt > 0) };
  };
  class Hero extends Unit {
    constructor(G, team, heroId, slot, isPlayer) {
      const f = M.bases[team].fountain;
      const ang = (slot - 2) * 0.55 + (team === 0 ? 0 : Math.PI);
      super(G, team, f.x + Math.cos(ang) * 3.2, f.y + Math.sin(ang) * 3.2);
      this.isHero = true; this.hd = AOS.Heroes[heroId]; this.heroId = heroId; this.name = this.hd.name;
      this.slot = slot; this.isPlayer = !!isPlayer; this.brain = null;
      this.spawnX = this.x; this.spawnY = this.y;
      this.r = 0.95; this.ranged = this.hd.ranged; this.proj = this.hd.proj || null;
      this.level = 1; this.xp = 0; this.gold = C.START_GOLD; this.items = [];
      this.ranks = [0, 0, 0, 0]; this.sp = 1;          // 스킬 단계와 남은 스킬 포인트 (1레벨에 1점)
      this.pas = {}; this.healAmp = 0; this.oocOn = false; this.hold = false; this.atkN = 0; this.lastStandT = 0;
      this.kills = 0; this.deaths = 0; this.assists = 0; this.cs = 0; this.streak = 0; this.feed = 0; this.multi = 0; this.lastKillT = -99;
      this.stats = { dmg: 0, taken: 0, heal: 0, tower: 0, gold: C.START_GOLD, csGold: 0, killGold: 0 };
      this.cds = [0, 0, 0, 0]; this.order = null; this.cast = null; this.dash = null; this.recall = null;
      this.respawnT = 0; this.respawnMax = 1; this.damagers = new Map(); this.hurtLog = []; this.lastDeath = null;
      this.sight = C.SIGHT_HERO; this.idleT = 0; this.atFountain = true; this.lastAct = -99; this.lastHeroFight = -99; this.lastHeroHurt = -99;
      this.dmgMul = 1; this.goldMul = 1; this.cdr = 0; this.hpRegen = 0; this.mpRegen = 0;
      this.walkPhase = 0; this.lastCastT = -99; this.lastCastSlot = -1; this.levelUpT = -99;
      this.recalc();
      this.hp = this.maxHp; this.mp = this.maxMp;
    }
    recalc() {
      const b = this.hd.base, L = this.level - 1;
      let hp = b.hp + b.hpG * L, mp = b.mp + b.mpG * L, ad = b.ad + b.adG * L, ap = 0, def = b.def + b.defG * L;
      let asPct = b.asG * L, msFlat = 0, msPct = 0, cdr = 0, ls = 0, pen = 0;
      let hpRegen = b.hpRegen + 0.14 * L, mpRegen = b.mpRegen + 0.14 * L;
      const pas = this.pas = {};
      for (const id of this.items) {
        const it = AOS.Items[id];
        hp += it.hp || 0; mp += it.mp || 0; ad += it.ad || 0; ap += it.ap || 0; def += it.def || 0;
        asPct += it.asPct || 0; msFlat += it.msFlat || 0; msPct += it.msPct || 0; cdr += it.cdr || 0;
        ls += it.lifesteal || 0; if ((it.pen || 0) > pen) pen = it.pen; hpRegen += it.hpRegen || 0; mpRegen += it.mpRegen || 0;
        if (it.pas) pas[it.pas] = true;
      }
      this.healAmp = pas.mend ? 0.25 : 0;
      if (pas.ooc && this.oocOn) msPct += 0.12;
      let slowP = 0, stun = false, root = false, stealth = false, undying = false, shield = 0;
      for (const bf of this.buffs) {
        ad += bf.ad || 0; ap += bf.ap || 0; def += bf.def || 0; asPct += bf.asPct || 0; msPct += bf.msPct || 0; ls += bf.lifesteal || 0;
        if (bf.slow > slowP) slowP = bf.slow;
        if (bf.stun) stun = true; if (bf.root) root = true; if (bf.stealth) stealth = true; if (bf.undying) undying = true;
        if (bf.shield > 0) shield += bf.shield;
      }
      const oldHp = this.maxHp, oldMp = this.maxMp, fresh = !this._init;
      this.maxHp = hp; this.maxMp = mp;
      if (!fresh && !this.dead) {
        if (hp > oldHp) this.hp += hp - oldHp;
        if (mp > oldMp) this.mp += mp - oldMp;
      }
      if (this.hp > hp) this.hp = hp;
      if (this.mp > mp) this.mp = mp;
      this._init = true;
      this.ad = ad; this.ap = ap; this.def = def; this.as = Math.min(2.5, b.as * (1 + asPct));
      this.baseMs = b.ms + msFlat; this.ms = this.baseMs * (1 + msPct) * (1 - slowP);
      this.cdr = Math.min(0.4, cdr); this.lifesteal = ls; this.pen = pen; this.hpRegen = hpRegen; this.mpRegen = mpRegen;
      this.stunned = stun; this.rooted = root || stun; this.stealth = stealth; this.undying = undying; this.shield = shield; this.slowPct = slowP;
      this.range = b.range;
    }
    xpNeed() { return xpNeed(this.level); }
    addXp(a) {
      if (this.level >= C.MAX_LEVEL) return;
      this.xp += a;
      while (this.level < C.MAX_LEVEL && this.xp >= xpNeed(this.level)) {
        this.xp -= xpNeed(this.level); this.level++; this.sp++; this.recalc(); this.levelUpT = this.G.t;
        this.G.emit('levelup', { u: this });
      }
      if (this.level >= C.MAX_LEVEL) this.xp = 0;
    }
    addGold(g) { g = Math.round(g * this.goldMul); this.gold += g; this.stats.gold += g; return g; }

    /* ----- 스킬 성장: 레벨마다 1점, 원하는 스킬에 직접 찍는다 ----- */
    maxRank(slot) { return slot === 3 ? C.ULT_RANK_MAX : C.RANK_MAX; }
    /* 다음 단계를 찍는 데 필요한 레벨 (일반 스킬: 1·3·5·7, 궁극기: 6·10·14) */
    learnLevel(slot) { const r = this.ranks[slot]; return slot === 3 ? (C.ULT_LEVELS[r] || 99) : 2 * r + 1; }
    /* 찍을 수 없는 이유: null이면 가능 */
    learnWhy(slot) {
      if (this.ranks[slot] >= this.maxRank(slot)) return 'max';
      if (this.level < this.learnLevel(slot)) return 'level';
      if (this.sp <= 0) return 'point';
      return null;
    }
    canLearn(slot) { return this.learnWhy(slot) === null; }
    learn(slot) {
      if (!this.canLearn(slot)) return false;
      this.ranks[slot]++; this.sp--;
      this.G.emit('learn', { u: this, slot, rank: this.ranks[slot] });
      return true;
    }
    breakStealth() { if (this.stealth) { for (let i = this.buffs.length - 1; i >= 0; i--) if (this.buffs[i].stealth) this.buffs.splice(i, 1); this.recalc(); } }

    /* ----- 명령 ----- */
    cmdMove(x, y, attackMove, keepWind) {
      if (this.dead) return;
      const p = M.nearestWalkable(x, y);
      const o = this.order;
      if (o && o.type === 'move' && !!o.attackMove === !!attackMove && U.dist(o.gx, o.gy, p.x, p.y) < 0.4) return;
      this.order = { type: 'move', path: M.findPath(this.x, this.y, p.x, p.y), pi: 0, attackMove: !!attackMove, gx: p.x, gy: p.y };
      this.hold = false;
      if (!keepWind) this.wind = null;
      if (this.recall) this.cancelRecall();
    }
    cmdAttack(u, keepWind) {
      if (this.dead || !u || u.dead) return;
      const o = this.order;
      this.hold = false;
      if (o && o.type === 'attack' && o.target === u && !o.auto) return;
      if (!keepWind && this.wind && this.wind.target !== u) this.wind = null;
      this.order = { type: 'attack', target: u };
      if (this.recall) this.cancelRecall();
    }
    /* 정지: 다음 명령을 내릴 때까지 자동 공격도 하지 않는다 (막타 타이밍을 잴 때 쓴다) */
    cmdStop(keepWind) { this.order = null; if (!keepWind) this.wind = null; this.hold = true; if (this.recall) this.cancelRecall(); }
    cmdRecall() {
      if (this.dead || this.dash || this.cast || this.stunned || this.recall) return false;
      this.order = null; this.wind = null; this.recall = { t: 0 };
      this.G.emit('recallStart', { u: this });
      return true;
    }
    cancelRecall() { if (this.recall) { this.recall = null; this.G.emit('recallCancel', { u: this }); } }
    castBlock(slot) {
      const ab = this.hd.abilities[slot];
      if (this.dead) return 'dead';
      if (this.ranks[slot] <= 0) return (ab.ult && this.level < C.ULT_LEVEL) ? 'level' : 'unlearned';
      if (this.cds[slot] > 0) return 'cd';
      if (this.mp < ab.cost) return 'mana';
      if (this.stunned) return 'cc';
      if (this.dash || this.cast) return 'busy';
      return null;
    }
    /* 반환: 'ok' | 'queued' | 차단 사유 */
    cmdCast(slot, x, y, unit) {
      const G = this.G, ab = this.hd.abilities[slot];
      const why = this.castBlock(slot); if (why) return why;
      let tg;
      let dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
      if (!(d > 0.01)) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); d = 1; x = this.x + dx; y = this.y + dy; }
      if (ab.type === 'self') tg = { x: this.x, y: this.y, dx: Math.cos(this.facing), dy: Math.sin(this.facing), unit: null };
      else if (ab.type === 'dir') tg = { x, y, dx: dx / d, dy: dy / d, unit: null };
      else if (ab.type === 'ground') {
        if (d > ab.range) { x = this.x + dx / d * ab.range; y = this.y + dy / d * ab.range; }
        if (ab.radius === 0 || ab.ai.gap) { const p = M.nearestWalkable(x, y, 8); x = p.x; y = p.y; }
        tg = { x, y, dx: dx / d, dy: dy / d, unit: null };
      } else if (ab.type === 'unit') {
        if (!unit || unit.dead || !G.canTarget(this, unit) || unit.isStruct || (ab.heroOnly && !unit.isHero)) return 'target';
        if (U.du(this, unit) - unit.r > ab.range) {
          this.order = { type: 'cast', slot, ab, unit };
          if (this.recall) this.cancelRecall();
          return 'queued';
        }
        const ux = unit.x - this.x, uy = unit.y - this.y, ud = Math.hypot(ux, uy) || 1;
        tg = { x: unit.x, y: unit.y, dx: ux / ud, dy: uy / ud, unit };
      } else { // ally
        if (!unit || unit.dead || unit.team !== this.team || !unit.isHero || U.du(this, unit) > ab.range + 1) unit = this;
        tg = { x: unit.x, y: unit.y, dx: 0, dy: 0, unit };
      }
      this.beginCast(slot, tg);
      return 'ok';
    }
    beginCast(slot, tg) {
      const G = this.G, ab = this.hd.abilities[slot];
      this.mp -= ab.cost; this.cds[slot] = AOS.abCd(ab, this.ranks[slot]) * (1 - this.cdr);
      this.hold = false;
      this.wind = null; if (this.recall) this.cancelRecall();
      this.breakStealth();
      if (tg.dx || tg.dy) this.facing = Math.atan2(tg.dy, tg.dx);
      this.lastCastT = G.t; this.lastCastSlot = slot; this.lastAct = G.t;
      G.emit('cast', { u: this, slot, ab, tg });
      if (ab.onStart) ab.onStart(G, this, tg);
      if (ab.castTime > 0) this.cast = { t: 0, dur: ab.castTime, ab, tg, slot };
      else ab.cast(G, this, tg);
    }
    repath() {
      const o = this.order;
      if (o && o.type === 'move') { o.path = M.findPath(this.x, this.y, o.gx, o.gy); o.pi = 0; }
      else if (o) o.path = null;
    }
    followPath(o, dt) {
      let move = this.ms * dt, guard = 0;
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
    /* 자동으로 칠 대상. careful = 가만히 서 있을 때: 적 영웅은 나를 먼저 때렸을 때만 받아친다
       (적 영웅을 치면 근처 미니언과 포탑이 나를 노리므로, 싸움을 거는 건 플레이어가 직접 결정해야 한다) */
    findAutoTarget(r, careful) {
      const G = this.G; let best = null, bs = Infinity;
      let underTower = false;
      if (careful) for (const s of G.structs) if (s.team !== this.team && !s.dead && U.du(this, s) - this.r <= s.range + 0.5) { underTower = true; break; }
      for (const u of G.hash.query(this.x, this.y, r)) {
        if (u.team === this.team || !G.canTarget(this, u)) continue;
        if (careful && u.isHero && (underTower || G.t - this.lastHeroHurt > 3)) continue;   // 적 포탑 안에서는 받아치지도 않는다
        if (careful && u.isStruct && G.backdoor(u, this.team)) continue;
        let score = U.du(this, u) - u.r;
        if (u.isStruct) score += 6;
        if (score < bs) { bs = score; best = u; }
      }
      return best;
    }
    runOrder(dt) {
      const G = this.G, o = this.order;
      if (!o) {
        if (this.brain || this.hold) return;        // 봇은 항상 직접 명령한다 · 정지(S) 중에는 자동 공격 없음
        this.idleT -= dt;
        if (this.idleT <= 0) {
          this.idleT = 0.15;
          const e = this.findAutoTarget(this.ranged ? this.range + 0.5 : 5, true);
          if (e) this.order = { type: 'attack', target: e, auto: true, leash: 3 };
        }
        return;
      }
      if (o.type === 'move') {
        if (o.attackMove) {
          const e = this.findAutoTarget(this.ranged ? this.range + 1 : 6.5);
          if (e) { this.order = { type: 'attack', target: e, auto: true, leash: 4, resume: o }; return; }
        }
        if (this.rooted) return;
        if (this.followPath(o, dt)) { this.order = null; this.idleT = 0.4; }
      } else if (o.type === 'attack') {
        const tg = o.target;
        if (tg.dead || !G.canTarget(this, tg)) {
          this.order = o.resume ? { type: 'move', path: M.findPath(this.x, this.y, o.resume.gx, o.resume.gy), pi: 0, attackMove: true, gx: o.resume.gx, gy: o.resume.gy } : null;
          return;
        }
        const d = U.du(this, tg) - tg.r;
        if (d <= this.range) {
          this.faceTo(tg);
          if (this.atkCd <= 0) { this.breakStealth(); this.startAttack(tg); G.emit('attack', { u: this, target: tg }); }
        } else {
          if (o.auto && d > this.range + (o.leash || 4)) { this.order = o.resume || null; if (this.order) this.repath(); return; }
          if (this.rooted) return;
          this.chase(o, tg, dt);
        }
      } else if (o.type === 'cast') {
        const tg = o.unit;
        if (tg.dead || !G.canTarget(this, tg)) { this.order = null; return; }
        if (this.castBlock(o.slot)) { this.order = null; return; }
        if (U.du(this, tg) - tg.r <= o.ab.range) {
          this.order = null;
          const ux = tg.x - this.x, uy = tg.y - this.y, ud = Math.hypot(ux, uy) || 1;
          this.beginCast(o.slot, { x: tg.x, y: tg.y, dx: ux / ud, dy: uy / ud, unit: tg });
        } else if (!this.rooted) this.chase(o, tg, dt);
      }
    }
    update(dt) {
      const G = this.G;
      if (this.dead) { this.respawnT -= dt; if (this.respawnT <= 0) G.respawn(this); return; }
      this.tickBuffs(dt);
      if (this.dead) return;
      for (let i = 0; i < 4; i++) if (this.cds[i] > 0) this.cds[i] = Math.max(0, this.cds[i] - dt);
      if (this.atkCd > 0) this.atkCd -= dt;
      const ooc = G.t - this.lastHurt > 6;
      if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + (this.hpRegen * (ooc ? TUNE.oocRegen : 1) + (ooc && this.pas.regen ? this.maxHp * 0.015 : 0)) * dt);
      if (this.mp < this.maxMp) this.mp = Math.min(this.maxMp, this.mp + this.mpRegen * dt);
      if (this.pas.ooc || this.oocOn) {           // 질풍 장화: 비전투 시 이동 속도
        const calm = !!this.pas.ooc && G.t - Math.max(this.lastHurt, this.lastAct) > 5;
        if (calm !== this.oocOn) { this.oocOn = calm; this.recalc(); }
      }
      if (this.dash) { G.updateDash(this, dt); return; }
      if (this.stunned) { this.wind = null; this.cast = null; if (this.recall) this.cancelRecall(); return; }
      if (this.cast) {
        const c = this.cast; c.t += dt;
        if (c.t >= c.dur) { this.cast = null; c.ab.cast(G, this, c.tg); }
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
      if (this.tickWind(dt)) return;
      this.runOrder(dt);
    }
  }

  /* ---------- 게임 ---------- */
  class Game {
    constructor(opts) {
      opts = opts || {};
      this.opts = opts;
      this.rng = U.mulberry32(opts.seed === undefined ? 12345 : opts.seed);
      this.t = 0; this.nextId = 1; this.wave = 0; this.nextWaveT = C.FIRST_WAVE;
      this.units = []; this.heroes = []; this.minions = []; this.structs = [];
      this.projs = []; this.zones = []; this.timers = []; this.events = [];
      this.hash = new Hash();
      this.over = false; this.winner = -1; this.overT = 0;
      this.firstBlood = false; this.visT = 0;
      this.stat = { firstBloodT: -1, minionDeaths: [0, 0], lastHits: [0, 0], deaths: [], rescues: 0 };   // 검증용 집계
      this.teams = [{ kills: 0, towers: 6, ai: null }, { kills: 0, towers: 6, ai: null }];
      this.difficulty = opts.difficulty || 'normal';
      M.reset();
      // 구조물
      this.cores = [];
      for (let team = 0; team < 2; team++) {
        const c = M.bases[team].core;
        const core = new Structure(this, team, 'core', -1, 3, c.x, c.y);
        this.cores.push(core); this.addUnit(core); M.setBlock(c.x, c.y, core.r + 0.4, true);
      }
      this.towers = [];
      for (const t of M.towers) {
        const tw = new Structure(this, t.team, 'tower', t.lane, t.tier, t.x, t.y);
        tw.lt = t.t;
        this.towers.push(tw); this.addUnit(tw); M.setBlock(t.x, t.y, tw.r + 0.3, true);
      }
      this.refreshVulnerable();
      this.fountains = [0, 1].map(team => ({ team, x: M.bases[team].fountain.x, y: M.bases[team].fountain.y, r: 0, isFountain: true, name: '우물' }));
      // 영웅
      const teams = opts.teams || AOS.pickTeams(opts.playerHero || 'lira', this.rng);
      const spectate = !!opts.spectate;
      for (let team = 0; team < 2; team++) {
        const ids = team === 0 ? teams.blue : teams.red;
        for (let i = 0; i < 5; i++) {
          const isPlayer = team === 0 && i === 0 && !spectate;
          const h = new Hero(this, team, ids[i], i, isPlayer);
          this.heroes.push(h); this.addUnit(h);
        }
      }
      this.player = spectate ? null : this.heroes[0];
      if (AOS.AI) AOS.AI.setup(this);
      this.hash.rebuild(this.units);
      this.updateVision();
    }
    addUnit(u) {
      this.units.push(u);
      if (u.isMinion) this.minions.push(u); else if (u.isStruct) this.structs.push(u);
    }
    emit(type, data) { const e = data || {}; e.type = type; this.events.push(e); }
    fx(kind, data) { const e = data || {}; e.type = 'fx'; e.kind = kind; this.events.push(e); }
    after(sec, fn) { this.timers.push({ t: this.t + sec, fn }); }

    /* ----- 조회 ----- */
    canTarget(src, tg) {
      if (tg.dead || tg.team === src.team || tg.stealth) return false;
      if (tg.isStruct && !tg.vulnerable) return false;
      if (src.isHero && !tg.seen[src.team]) return false;
      return true;
    }
    enemiesIn(team, x, y, r, opt) {
      const out = []; opt = opt || EMPTY;
      for (const u of this.hash.query(x, y, r)) {
        if (u.team === team || u.dead || u.isStruct) continue;
        if (u.isHero && opt.heroes === false) continue;
        if (u.isMinion && opt.minions === false) continue;
        out.push(u);
      }
      return out;
    }
    alliesIn(team, x, y, r, heroesOnly) {
      const out = [];
      for (const u of this.hash.query(x, y, r)) {
        if (u.team !== team || u.dead || u.isStruct) continue;
        if (heroesOnly && !u.isHero) continue;
        out.push(u);
      }
      return out;
    }
    enemiesInLine(team, x1, y1, x2, y2, hw) {
      const out = [];
      for (const u of this.units) {
        if (u.team === team || u.dead || u.isStruct) continue;
        if (U.segDist(u.x, u.y, x1, y1, x2, y2) <= hw + u.r) out.push(u);
      }
      return out;
    }
    towerOf(team, lane, tier) { for (const t of this.towers) if (t.team === team && t.lane === lane && t.tier === tier) return t; return null; }
    refreshVulnerable() {
      for (const t of this.towers) {
        if (t.dead) continue;
        if (t.tier === 1) t.vulnerable = true;
        else { const outer = this.towerOf(t.team, t.lane, 1); t.vulnerable = !outer || outer.dead; }
      }
      for (const c of this.cores) {
        let open = false;
        for (const t of this.towers) if (t.team === c.team && t.tier === 2 && t.dead) open = true;
        c.vulnerable = open;
      }
    }
    /* 공격 팀의 미니언이 근처에 없으면 구조물이 받는 피해 감소 */
    backdoor(s, atkTeam) {
      for (const u of this.hash.query(s.x, s.y, 15)) if (u.isMinion && u.team === atkTeam && !u.dead) return false;
      return true;
    }
    /* 상점은 본진(우물 근처)에서만. 쓰러져 부활을 기다리는 동안에도 본진에 있는 것으로 친다 */
    canShop(h) { return h.dead || U.dist(h.x, h.y, M.bases[h.team].fountain.x, M.bases[h.team].fountain.y) <= C.SHOP_R; }
    /* 살 수 없는 이유: null이면 구매 가능 */
    buyWhy(h, id) {
      const it = AOS.Items[id];
      if (!it) return 'none';
      if (h.items.indexOf(id) >= 0) return 'owned';
      const pr = AOS.itemPrice(h, id);
      if (it.cat === 'move' && h.items.some(x => AOS.Items[x].cat === 'move' && x !== pr.use)) return 'boots';
      if (!pr.use && h.items.length >= 6) return 'full';
      if (h.gold < pr.cost) return 'gold';
      if (!this.canShop(h)) return 'shop';
      return null;
    }
    buy(h, id) {
      if (this.buyWhy(h, id)) return false;
      const pr = AOS.itemPrice(h, id);
      const before = { ad: h.ad, ap: h.ap, maxHp: h.maxHp, def: h.def, as: h.as, ms: h.baseMs };
      h.gold -= pr.cost;
      if (pr.use) h.items[h.items.indexOf(pr.use)] = id; else h.items.push(id);
      h.recalc();
      this.emit('buy', { u: h, item: id, cost: pr.cost, used: pr.use, before });
      return true;
    }
    sell(h, idx) {
      if (idx < 0 || idx >= h.items.length || !this.canShop(h)) return false;
      const it = AOS.Items[h.items[idx]];
      h.items.splice(idx, 1); h.gold += Math.round(it.cost * 0.6); h.recalc();
      this.emit('sell', { u: h, item: it.id });
      return true;
    }
    /* 결전 단계: 0 = 아직, 그 뒤로 SHOWDOWN_STEP초마다 1씩 (웨이브에 합류하는 대형 미니언 수) */
    showdownLevel() { return this.t < C.SHOWDOWN ? 0 : Math.min(4, 1 + Math.floor((this.t - C.SHOWDOWN) / C.SHOWDOWN_STEP)); }
    /* 개전 직후 보정이 풀린 정도: 0(2분까지) → 1(5분 이후). 초반에는 포탑·미니언이 영웅에게 덜 아프다 */
    earlyK() { return U.clamp((this.t - TUNE.earlyFrom) / (TUNE.earlyTo - TUNE.earlyFrom), 0, 1); }
    /* 구조물이 받는 피해 배율: 초반 방비(감소) → 후반 결전(증가) */
    fortOf(s) {
      const f = s.kind === 'core' ? C.FORT.core : s.tier === 1 ? C.FORT.tower1 : C.FORT.tower2;
      return f[2] * U.clamp(1 - (this.t - f[0]) / (f[1] - f[0]), 0, 1);
    }
    structMul(s) {
      let m = 1 - this.fortOf(s);
      if (this.t > C.SHOWDOWN) m *= 1 + C.SHOWDOWN_RATE * (this.t - C.SHOWDOWN);
      return m;
    }

    /* ----- 전투 ----- */
    addBuff(u, b) {
      if (!u || u.dead || u.isStruct) return;
      b.t = 0;
      if ((b.stun || b.root || b.slow) && u.pas && u.pas.tenacity) b.dur *= 0.75;      // 수호 군화
      const bs = u.buffs;
      for (let i = 0; i < bs.length; i++) {
        if (bs[i].id !== b.id) continue;
        const old = bs[i];
        if ((b.stun || b.root || b.slow) && (old.dur - old.t) > b.dur && (old.slow || 0) >= (b.slow || 0)) return;
        if (b.dot && old.dot) b.dotT = old.dotT;       // 갱신해도 피해 주기는 이어 간다
        bs[i] = b; u.recalc();
        if (b.stun) this.interrupt(u);
        return;
      }
      bs.push(b); u.recalc();
      if (b.stun) this.interrupt(u);
    }
    interrupt(u) { u.wind = null; if (u.isHero) { u.cast = null; if (u.recall) u.cancelRecall(); } }
    heal(src, tg, amt, silent) {
      if (!tg || tg.dead || amt <= 0) return 0;
      if (src && src.healAmp && !silent) amt *= 1 + src.healAmp;                       // 새벽 성배
      const real = Math.min(amt, tg.maxHp - tg.hp);
      tg.hp += real;
      if (src && src.isHero && src.stats) src.stats.heal += real;
      if (real >= 1 && !silent) this.emit('heal', { tgt: tg, amt: real });
      return real;
    }
    damage(src, tg, amount, kind, opts) {
      if (!tg || tg.dead || this.over || !(amount > 0)) return 0;
      opts = opts || EMPTY;
      const isAtk = !!opts.attack, srcHero = !!src.isHero;
      const skill = srcHero && !isAtk && !opts.dot && !opts.proc && !opts.reflect;     // 스킬로 준 피해인가
      if (tg.isStruct) {
        if (!tg.vulnerable || !isAtk) return 0;
        if (this.backdoor(tg, src.team)) amount *= 0.3;
        if (src.isMinion) amount *= (src.kind === 'siege' ? 1.7 : src.kind === 'super' ? 1.1 : 0.6);
        amount *= this.structMul(tg);
      } else if (srcHero) {
        if (src.pas.execute && tg.hp <= tg.maxHp * 0.4) amount *= 1.18;                // 단죄의 대검
        if (skill && src.pas.amp) amount *= 1.1;                                       // 태초의 보주
        if (isAtk && tg.isMinion) amount *= TUNE.heroVsMinionAtk;
      }
      let mult = 1;
      if (kind !== 'true') {
        let def = tg.def;
        if (kind === 'phys' && src.pen) def *= 1 - src.pen;
        mult = 100 / (100 + Math.max(0, def));
      }
      if (src.isMinion) { if (tg.isHero) mult *= U.lerp(TUNE.minionVsHeroEarly, TUNE.minionVsHero, this.earlyK()); else if (tg.isMinion) mult *= TUNE.minionVsMinion; }
      if (srcHero) mult *= src.dmgMul;
      let dmg = amount * mult, absorbed = 0;
      if (tg.shield > 0) {
        let rem = dmg;
        for (const b of tg.buffs) {
          if (!(b.shield > 0)) continue;
          const a = Math.min(b.shield, rem); b.shield -= a; rem -= a;
          if (rem <= 0) break;
        }
        absorbed = dmg - rem; dmg = rem; tg.shield = Math.max(0, tg.shield - absorbed);
      }
      if (tg.undying && tg.hp - dmg < 1) dmg = Math.max(0, tg.hp - 1);
      // 개전 보호: 시작 2분 동안은 쓰러지는 대신 본진으로 긴급 귀환한다 (영문도 모르고 죽는 일이 없게)
      if (tg.isHero && this.t < C.GRACE_END && tg.hp - dmg <= 0) {
        tg.hurtLog.push({ t: this.t, a: tg.hp, k: srcHero ? 'hero' : src.isMinion ? 'minion' : src.isStruct ? (src.kind === 'core' ? 'core' : 'tower') : 'fountain', n: srcHero ? src.name : '' });
        const dealt = tg.hp + absorbed;
        this.emit('hit', { src, tgt: tg, amt: dealt, kind, attack: isAtk, absorbed, x: tg.x, y: tg.y });
        this.rescue(tg, src);
        return dealt;
      }
      tg.hp -= dmg;
      tg.lastHurt = this.t;
      const total = dmg + absorbed;
      if (srcHero) {
        src.lastAct = this.t;
        if (tg.isHero) {
          tg.damagers.set(src, this.t); src.stats.dmg += total;
          src.lastHeroFight = this.t; tg.lastHeroFight = this.t; tg.lastHeroHurt = this.t;
          if (!opts.dot && !opts.reflect) this.callForHelp(src, tg);
        } else if (tg.isStruct) src.stats.tower += total;
      }
      if (tg.isHero) {
        tg.stats.taken += total; if (tg.recall) tg.cancelRecall();
        // 쓰러졌을 때 '무엇에 당했는지' 보여 주기 위한 기록
        const log = tg.hurtLog;
        log.push({ t: this.t, a: total, k: srcHero ? 'hero' : src.isMinion ? 'minion' : src.isStruct ? (src.kind === 'core' ? 'core' : 'tower') : 'fountain', n: srcHero ? src.name : '' });
        if (log.length > 80) log.splice(0, 30);
      }
      if (isAtk && src.lifesteal > 0 && !tg.isStruct && dmg > 0) this.heal(src, src, dmg * src.lifesteal * (src.pas.thirst && src.hp < src.maxHp * 0.5 ? 2 : 1), true);
      this.emit('hit', { src, tgt: tg, amt: total, kind, attack: isAtk, absorbed, x: tg.x, y: tg.y, dot: !!opts.dot });
      if (srcHero && !tg.isStruct) {
        if (skill && src.pas.burn && tg.hp > 0) this.addBuff(tg, { id: 'burn', dur: 3, dot: (30 + 0.2 * src.ap) / 6, src, fx: 'burn' });   // 잿불 왕관
        if (isAtk && src.pas.hitrun) this.addBuff(src, { id: 'hitrun', dur: 2, msPct: 0.12, fx: 'haste', color: '#b6f2c4' });           // 질풍의 깃
      }
      if (tg.hp <= 0) this.kill(tg, src);
      else if (tg.isHero && tg.pas.laststand && tg.hp < tg.maxHp * 0.3 && this.t >= tg.lastStandT) {                                  // 여명의 방패
        tg.lastStandT = this.t + 60;
        this.addBuff(tg, { id: 'laststand', dur: 4, shield: tg.maxHp * 0.18, fx: 'shield', color: '#ffe08a' });
        this.fx('ring', { x: tg.x, y: tg.y, r0: 0.5, r1: 3, dur: 0.4, color: '#ffe08a' });
        this.emit('itemProc', { u: tg, item: 'aegis' });
      }
      // 고슴도치 갑주: 기본 공격을 맞으면 돌려준다
      if (isAtk && tg.isHero && tg.pas.thorns && (srcHero || src.isMinion) && !src.dead) this.damage(tg, src, 15 + 0.15 * tg.def, 'magic', REFLECT);
      return total;
    }
    /* 아군 영웅이 맞으면 근처 미니언·타워가 가해자를 노린다 */
    callForHelp(attacker, victim) {
      if (attacker.stealth) return;
      for (const u of this.hash.query(victim.x, victim.y, 10)) {
        if (u.team !== victim.team || u.dead) continue;
        if (u.isMinion) { if (U.du(u, attacker) <= 11) { u.forced = attacker; u.forcedT = this.t + 2.5; u.retT = 0; } }
      }
      for (const s of this.structs) {
        if (s.team !== victim.team || s.dead) continue;
        if (U.du(s, attacker) - attacker.r <= s.range) s.forced = attacker;
      }
    }
    /* 공격 적중 순간(근접) 또는 발사 순간(원거리) */
    strike(u, tg) {
      u.lastAtkT = this.t;
      let bonus = 0;
      if (u.isHero) {
        for (let i = u.buffs.length - 1; i >= 0; i--) if (u.buffs[i].empower) { bonus += u.buffs[i].empower; u.buffs.splice(i, 1); }
        if (bonus > 0) u.recalc();
      }
      let dmg = u.ad, proc = 0;
      if (u.isHero && tg.isStruct) dmg += 0.4 * u.ap;
      if (u.isHero && u.pas.third && !tg.isStruct && ++u.atkN % 3 === 0) proc = 30 + 0.35 * u.ad;      // 삼연풍 활
      if (u.ranged) this.launch(u, tg, dmg, bonus, 'phys', proc);
      else {
        this.emit('melee', { u, target: tg, bonus: bonus > 0 || proc > 0 });
        this.damage(u, tg, dmg, 'phys', ATTACK);
        if (bonus > 0 && !tg.dead && !tg.isStruct) this.damage(u, tg, bonus, 'phys');
        if (proc > 0 && !tg.dead) { this.damage(u, tg, proc, 'magic', PROC); this.fx('burst', { x: tg.x, y: tg.y, n: 8, color: '#9dffc0', speed: 8, life: 0.3 }); }
      }
    }
    launch(u, tg, dmg, bonus, kind, proc) {
      const pr = u.proj || { kind: 'mbolt', speed: 26 };
      this.projs.push({
        homing: true, src: u, team: u.team, target: tg, x: u.x, y: u.y, ang: Math.atan2(tg.y - u.y, tg.x - u.x),
        speed: pr.speed, dmg, bonus, proc: proc || 0, kind, vis: { kind: pr.kind, color: pr.color || (u.team === 0 ? '#8fd0ff' : '#ff9a8f'), size: bonus > 0 || proc > 0 ? 1.4 : 1 },
        born: this.t, id: this.nextId++,
      });
      this.emit('shoot', { u, target: tg });
    }
    skillshot(o) {
      const p = {
        homing: false, src: o.src, team: o.src.team, x: o.x, y: o.y, dx: o.dx, dy: o.dy, ang: Math.atan2(o.dy, o.dx),
        speed: o.speed, left: o.range, radius: o.radius, pierce: !!o.pierce, hit: new Set(),
        onHit: o.onHit, onEnd: o.onEnd || null, vis: o.vis, born: this.t, id: this.nextId++, skill: true,
      };
      this.projs.push(p);
      return p;
    }
    zone(o) {
      const z = {
        src: o.src, team: o.src.team, x: o.x, y: o.y, radius: o.radius, delay: o.delay || 0, dur: o.dur || 0, tick: o.tick || 0.5,
        onBlast: o.onBlast || null, onTick: o.onTick || null, vis: o.vis || { kind: 'warn', color: '#ffffff' },
        friendly: !!o.friendly, t: 0, tickT: 0, active: false, done: false, id: this.nextId++, born: this.t,
      };
      this.zones.push(z);
      return z;
    }
    dash(u, tx, ty, speed, o) {
      o = o || {};
      if (!o.follow && !o.leap) {
        // 벽 너머로는 가지 않도록 목표를 마지막 보행 가능 지점으로 당김
        const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
        const n = Math.max(1, Math.ceil(d / 0.4)); let ok = 0;
        for (let i = 1; i <= n; i++) { if (M.isWalkable(u.x + dx * i / n, u.y + dy * i / n)) ok = i; else break; }
        tx = u.x + dx * ok / n; ty = u.y + dy * ok / n;
      }
      const dist = Math.hypot(tx - u.x, ty - u.y);
      u.wind = null;
      u.dash = { tx, ty, speed, o, hit: new Set(), t: 0, maxT: dist / speed + 0.5, x0: u.x, y0: u.y, dist };
      if (dist < 0.05 && !o.follow) { u.dash = null; if (o.onEnd) o.onEnd(); }
    }
    updateDash(u, dt) {
      const d = u.dash, o = d.o;
      if (o.follow) { if (o.follow.dead) { u.dash = null; u.repath(); if (o.onEnd) o.onEnd(); return; } d.tx = o.follow.x; d.ty = o.follow.y; }
      const dx = d.tx - u.x, dy = d.ty - u.y, dist = Math.hypot(dx, dy), stop = o.stopDist || 0;
      let step = d.speed * dt, end = false;
      if (dist - stop <= step) { step = Math.max(0, dist - stop); end = true; }
      if (dist > 1e-6 && step > 0) {
        const nx = u.x + dx / dist * step, ny = u.y + dy / dist * step;
        if (o.leap || M.isWalkable(nx, ny)) { u.x = nx; u.y = ny; } else end = true;
        u.facing = Math.atan2(dy, dx);
      }
      d.t += dt; if (d.t > d.maxT) end = true;
      if (o.onHit) {
        for (const e of this.hash.query(u.x, u.y, o.hitR || 1.5)) {
          if (e.team === u.team || e.dead || e.isStruct || d.hit.has(e)) continue;
          d.hit.add(e); o.onHit(e);
          if (o.stopOnHero && e.isHero) { end = true; break; }
        }
      }
      if (end) {
        u.dash = null;
        if (!M.isWalkable(u.x, u.y)) { const p = M.nearestWalkable(u.x, u.y, 10); u.x = p.x; u.y = p.y; }
        u.repath();
        if (o.onEnd) o.onEnd();
      }
    }
    blink(u, x, y) {
      const p = M.nearestWalkable(x, y, 8);
      u.x = u.px = p.x; u.y = u.py = p.y;
      u.repath();
    }

    /* ----- 처치 ----- */
    kill(tg, src) {
      if (tg.dead) return;
      tg.dead = true; tg.hp = 0; tg.wind = null; tg.deathT = this.t;
      if (tg.isMinion) {
        // 경험치는 근처에 있기만 해도 나눠 받지만, 골드는 '막타를 친 영웅'만 받는다
        this.grantXp(tg.x, tg.y, 1 - tg.team, tg.xp, null);
        const st = this.stat; st.minionDeaths[tg.team]++;
        if (src && src.isHero) {
          const g = src.addGold(tg.gold); src.cs++; src.stats.csGold += g; st.lastHits[src.team]++;
          this.emit('gold', { u: src, amt: g, x: tg.x, y: tg.y, cs: true });
        } else {
          // 놓친 막타: 근처에 있던 적 영웅(=골드를 받을 수 있었던 쪽)에게 알려 주기만 한다
          this.emit('csMiss', { u: tg, by: src });
        }
        this.emit('death', { u: tg, killer: src });
      } else if (tg.isHero) this.heroDeath(tg, src);
      else this.structDeath(tg, src);
    }
    grantXp(x, y, team, amount, always) {
      const list = [];
      for (const h of this.heroes) {
        if (h.team !== team || h.dead) continue;
        if (h === always || U.dist(h.x, h.y, x, y) <= C.XP_RANGE) list.push(h);
      }
      if (!list.length) return;
      const share = list.length === 1 ? 1 : 1.3 / list.length;
      for (const h of list) h.addXp(amount * share);
    }
    /* 무엇에 당했는지: 마지막 12초 동안 받은 피해를 출처별로 합산 (사망 화면에 보여 준다) */
    recapOf(v, killer, src) {
      const parts = new Map(); let sum = 0;
      for (const e of v.hurtLog) {
        if (this.t - e.t > 12) continue;
        const key = e.k + '|' + e.n; let p = parts.get(key);
        if (!p) { p = { k: e.k, n: e.n, a: 0 }; parts.set(key, p); }
        p.a += e.a; sum += e.a;
      }
      const recap = { total: sum, parts: Array.from(parts.values()).sort((a, b) => b.a - a.a).slice(0, 4), t: this.t, killer, by: src, level: v.level, underTower: false, rescued: false };
      for (const s of this.structs) if (s.team !== v.team && !s.dead && U.du(s, v) - v.r <= s.range + 1) recap.underTower = true;
      v.hurtLog.length = 0; v.lastDeath = recap;
      return recap;
    }
    /* 개전 보호(시작 2분): 쓰러질 피해를 받으면 죽지 않고 본진으로 돌아온다. 처치 보상도 없다. */
    rescue(v, src) {
      const recap = this.recapOf(v, null, src); recap.rescued = true;
      this.fx('recallOut', { x: v.x, y: v.y });
      v.damagers.clear();
      v.order = null; v.cast = null; v.dash = null; v.recall = null; v.wind = null; v.hold = false; v.buffs.length = 0; v.oocOn = false; v.recalc();
      v.hp = Math.max(1, v.maxHp * 0.3); v.lastHurt = this.t; v.lastHeroHurt = -99;
      v.x = v.px = v.spawnX; v.y = v.py = v.spawnY; v.rescues = (v.rescues || 0) + 1;
      for (const p of this.projs) if (p.homing && p.target === v) p.gone = true;   // 날아오던 공격은 따라오지 않는다
      this.stat.rescues++;
      this.emit('rescue', { u: v, by: src, recap });
    }
    heroDeath(v, src) {
      let killer = src && src.isHero ? src : null;
      if (!killer) {
        let bt = this.t - C.ASSIST_WINDOW;
        for (const [h, t] of v.damagers) if (t > bt) { bt = t; killer = h; }
      }
      const assists = [];
      for (const [h, t] of v.damagers) if (h !== killer && this.t - t <= C.ASSIST_WINDOW) assists.push(h);
      v.damagers.clear();
      const recap = this.recapOf(v, killer, src);
      this.stat.deaths.push({ t: this.t, team: v.team, player: v.isPlayer, by: recap.parts.length ? recap.parts[0].k : 'none' });
      // 연속으로 잘 큰 영웅은 현상금이 붙고, 연달아 쓰러진 영웅은 값이 싸진다 (한쪽으로 기울지 않게)
      const shutdown = Math.min(240, v.streak * 45);
      const worth = U.clamp(1 - 0.18 * v.feed, 0.45, 1);
      v.deaths++; v.streak = 0; v.feed++;
      // 부활 대기: 레벨이 높을수록 길고, 결전에 들어가면 점점 더 길어진다
      v.respawnMax = v.respawnT = (4 + 1.6 * v.level) * (this.t > C.SHOWDOWN ? 1.3 + (this.t - C.SHOWDOWN) / 600 : 1);
      v.order = null; v.cast = null; v.dash = null; v.recall = null; v.buffs.length = 0; v.oocOn = false; v.hold = false; v.recalc();
      let bounty = 0, first = false, multi = 0;
      if (killer) {
        this.teams[killer.team].kills++; killer.kills++; killer.streak++; killer.feed = 0;
        killer.multi = (this.t - killer.lastKillT < 10) ? killer.multi + 1 : 1; killer.lastKillT = this.t; multi = killer.multi;
        bounty = C.KILL_GOLD * worth + shutdown;
        if (!this.firstBlood) { this.firstBlood = true; first = true; bounty += C.FIRST_BLOOD; this.stat.firstBloodT = this.t; }
        bounty = killer.addGold(bounty); killer.stats.killGold += bounty;
        this.emit('gold', { u: killer, amt: bounty, x: v.x, y: v.y });
        for (const a of assists) { a.assists++; a.feed = Math.max(0, a.feed - 1); a.stats.killGold += a.addGold(C.ASSIST_GOLD * worth); }
        this.grantXp(v.x, v.y, killer.team, (130 + 42 * v.level) * (0.6 + 0.4 * worth), killer);
      }
      this.emit('kill', { victim: v, killer, assists, bounty, first, multi, by: src, recap });
      this.emit('death', { u: v, killer: killer || src });
    }
    structDeath(s, src) {
      const et = 1 - s.team;
      if (s.kind === 'core') {
        this.over = true; this.winner = et; this.overT = 0;
        this.emit('death', { u: s, killer: src });
        this.emit('coreDown', { core: s, winner: et });
        return;
      }
      M.setBlock(s.x, s.y, s.r + 0.3, false);
      this.teams[s.team].towers--;
      const near = [];
      for (const h of this.heroes) {
        if (h.team !== et) continue;
        h.addGold(C.TOWER_GOLD_GLOBAL);
        if (!h.dead && U.du(h, s) <= 22) near.push(h);
      }
      for (const h of near) { const g = h.addGold(C.TOWER_GOLD_LOCAL / near.length); this.emit('gold', { u: h, amt: g + C.TOWER_GOLD_GLOBAL, x: s.x, y: s.y }); }
      this.refreshVulnerable();
      this.emit('death', { u: s, killer: src });
      this.emit('towerDown', { tower: s, team: et, killer: src });
    }
    respawn(h) {
      h.dead = false; h.x = h.px = h.spawnX; h.y = h.py = h.spawnY;
      h.hp = h.maxHp; h.mp = h.maxMp; h.order = null; h.wind = null; h.atkCd = 0; h.hold = false; h.hurtLog.length = 0;
      h.facing = h.team === 0 ? 0 : Math.PI; h.lastHurt = -99; h.lastHeroHurt = -99; h.spawnT = this.t;
      this.emit('respawn', { u: h });
    }

    /* ----- 웨이브 ----- */
    spawnWave() {
      this.wave++;
      const siege = this.wave % C.SIEGE_EVERY === 0;
      for (let team = 0; team < 2; team++) for (let lane = 0; lane < 3; lane++) {
        const enemyInner = this.towerOf(1 - team, lane, 2);
        const sup = enemyInner && enemyInner.dead;
        const offs = [-2.3, 0, 2.3];
        for (const o of offs) this.addUnit(new Minion(this, team, lane, 'melee', 3.2, o));
        for (const o of offs) this.addUnit(new Minion(this, team, lane, 'ranged', 0.4, o));
        if (siege) this.addUnit(new Minion(this, team, lane, 'siege', 0, 1.1));
        if (sup) this.addUnit(new Minion(this, team, lane, 'super', 5, 0));
        // 결전: 양 팀 모두 웨이브마다 대형 미니언이 합류한다 (시간이 갈수록 더 많이) → 판이 길게 늘어지지 않는다
        for (let k = 0; k < this.showdownLevel(); k++) this.addUnit(new Minion(this, team, lane, 'super', 6 + k * 1.6, k % 2 ? 2 : -2));
      }
      this.emit('wave', { n: this.wave, showdown: this.showdownLevel() });
    }

    updateVision() {
      const us = this.units;
      for (const u of us) {
        if (u.isStruct) { u.seen[0] = u.seen[1] = true; continue; }
        u.seen[u.team] = !u.dead; u.seen[1 - u.team] = false;
      }
      for (const a of us) {
        if (a.dead) continue;
        for (const b of this.hash.query(a.x, a.y, a.sight)) {
          if (b.team !== a.team && !b.stealth && !b.isStruct) b.seen[a.team] = true;
        }
      }
    }

    /* ----- 메인 틱 ----- */
    update(dt) {
      if (this.over) { this.overT += dt; return; }
      this.t += dt;
      if (this.events.length > 6000) this.events.length = 0;
      if (this.t >= this.nextWaveT) { this.spawnWave(); this.nextWaveT += C.WAVE_INTERVAL; }
      // (시간이 지나면 저절로 들어오는 골드는 없다: 골드는 막타·처치·포탑 파괴로만 번다)
      this.hash.rebuild(this.units);
      this.visT -= dt;
      if (this.visT <= 0) { this.visT = 0.15; this.updateVision(); }
      // 타이머
      if (this.timers.length) {
        for (let i = this.timers.length - 1; i >= 0; i--) {
          if (this.timers[i].t <= this.t) { const tm = this.timers[i]; this.timers.splice(i, 1); tm.fn(); }
        }
      }
      if (AOS.AI) AOS.AI.update(this, dt);
      const us = this.units, n = us.length;
      for (let i = 0; i < n; i++) {
        const u = us[i];
        if (u.dead && !u.isHero) continue;
        u.px = u.x; u.py = u.y;
        u.update(dt);
        if (this.over) return;
      }
      this.updateProjs(dt);
      this.updateZones(dt);
      if (this.over) return;
      this.separate();
      this.fountainTick(dt);
      if (this.t >= C.BURN_START) { this.burnCores(dt); if (this.over) return; }
      // 속도 추정 + 걷기 위상
      const inv = dt > 0 ? 1 / dt : 0;
      for (let i = 0; i < us.length; i++) {
        const u = us[i]; if (u.isStruct) continue;
        const mvx = (u.x - u.px) * inv, mvy = (u.y - u.py) * inv;
        u.vx += (mvx - u.vx) * 0.35; u.vy += (mvy - u.vy) * 0.35;
        const sp = Math.hypot(u.x - u.px, u.y - u.py);
        u.moving = sp > 0.3 * dt && !u.dash;
        if (u.moving) u.walkPhase = (u.walkPhase || 0) + sp * 1.9;
      }
      // 사망 유닛 정리
      let dead = false;
      for (let i = 0; i < us.length; i++) if (us[i].dead && !us[i].isHero) { dead = true; break; }
      if (dead) {
        this.units = us.filter(u => !u.dead || u.isHero);
        this.minions = this.minions.filter(u => !u.dead);
        this.structs = this.structs.filter(u => !u.dead);
      }
    }
    updateProjs(dt) {
      const ps = this.projs;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]; let done = false;
        if (p.homing) {
          const tg = p.target;
          if (tg.dead || p.gone || this.t - p.born > 3) done = true;      // 3초 넘게 쫓아가는 투사체는 없다
          else {
            const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
            if (d <= step + tg.r * 0.5) {
              p.x = tg.x; p.y = tg.y; done = true;
              this.damage(p.src, tg, p.dmg, p.kind, ATTACK);
              if (p.bonus > 0 && !tg.dead && !tg.isStruct) this.damage(p.src, tg, p.bonus, 'phys');
              if (p.proc > 0 && !tg.dead && !tg.isStruct) { this.damage(p.src, tg, p.proc, 'magic', PROC); this.fx('burst', { x: tg.x, y: tg.y, n: 8, color: '#9dffc0', speed: 8, life: 0.3 }); }
              this.emit('projHit', { p, target: tg });
            } else { p.x += dx / d * step; p.y += dy / d * step; p.ang = Math.atan2(dy, dx); }
          }
        } else {
          const step = Math.min(p.speed * dt, p.left);
          const n = Math.max(1, Math.ceil(step / Math.max(0.5, p.radius)));
          for (let k = 0; k < n && !done; k++) {
            p.x += p.dx * step / n; p.y += p.dy * step / n; p.left -= step / n;
            for (const u of this.hash.query(p.x, p.y, p.radius)) {
              if (u.team === p.team || u.dead || u.isStruct || p.hit.has(u)) continue;
              p.hit.add(u); p.onHit(u, p);
              this.emit('projHit', { p, target: u });
              if (!p.pierce) { done = true; break; }
            }
          }
          if (!done && (p.left <= 1e-6 || p.x < 0 || p.y < 0 || p.x > C.W || p.y > C.H)) { done = true; if (p.onEnd) p.onEnd(p); }
        }
        if (done) { ps[i] = ps[ps.length - 1]; ps.pop(); }
        if (this.over) return;
      }
    }
    updateZones(dt) {
      const zs = this.zones, n = zs.length;
      for (let i = 0; i < n; i++) {
        const z = zs[i];
        z.t += dt;
        if (!z.active) {
          if (z.t >= z.delay) {
            z.active = true; z.t = 0;
            if (z.onBlast) z.onBlast(z);
            this.emit('zoneBlast', { z });
            if (!(z.dur > 0)) z.done = true;
            else if (z.onTick) z.onTick(z);
          }
        } else {
          z.tickT += dt;
          while (z.tickT >= z.tick && !z.done) { z.tickT -= z.tick; if (z.onTick) z.onTick(z); }
          if (z.t >= z.dur) z.done = true;
        }
        if (this.over) return;
      }
      let any = false;
      for (let i = 0; i < zs.length; i++) if (zs[i].done) { any = true; break; }
      if (any) this.zones = zs.filter(z => !z.done);
    }
    separate() {
      const us = this.units;
      for (let i = 0; i < us.length; i++) {
        const u = us[i];
        if (u.dead || u.isStruct || u.dash) continue;
        const near = this.hash.query(u.x, u.y, u.r + 0.4);
        let ox = 0, oy = 0;
        for (let k = 0; k < near.length; k++) {
          const v = near[k];
          if (v === u || v.dead) continue;
          let dx = u.x - v.x, dy = u.y - v.y, d = Math.hypot(dx, dy);
          if (v.isStruct) {
            const min = v.r + u.r * 0.5;
            if (d < min) { if (d < 1e-4) { dx = 1; dy = 0; d = 1; } ox += dx / d * (min - d); oy += dy / d * (min - d); }
            continue;
          }
          if (v.dash) continue;
          const min = (u.r + v.r) * 0.82;
          if (d >= min) continue;
          if (d < 1e-4) { const a = (u.id * 2.399) % 6.283; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
          let w = 0.5;
          if (u.isHero && !v.isHero) w = 0.12; else if (!u.isHero && v.isHero) w = 0.88;
          const push = (min - d) * w * 0.5;
          ox += dx / d * push; oy += dy / d * push;
        }
        if (ox || oy) {
          const nx = u.x + ox, ny = u.y + oy;
          if (M.isWalkable(nx, ny)) { u.x = nx; u.y = ny; }
        }
      }
    }
    /* 최후의 불길: 19분이 지나면 양 팀 코어가 스스로 타들어 간다.
       포탑을 많이 잃은 팀(그리고 킬에서 밀리는 팀)의 코어가 더 빨리 타므로, 밀리던 쪽이 먼저 무너진다. */
    burnRate(team) {
      const lost = 6 - this.teams[team].towers, deficit = Math.max(0, this.teams[1 - team].kills - this.teams[team].kills);
      return C.BURN_RATE * (1 + 0.25 * lost + 0.01 * deficit);
    }
    burnCores(dt) {
      if (!this.burning) { this.burning = true; this.emit('burnStart', {}); }
      const left = [0, 0];
      for (let team = 0; team < 2; team++) {
        const c = this.cores[team];
        c.hp -= c.maxHp * this.burnRate(team) * dt; c.lastHurt = this.t;
        left[team] = c.hp / c.maxHp;
      }
      if (left[0] > 0 && left[1] > 0) return;
      // 같은 순간에 둘 다 바닥나면: 더 많이 탄 쪽 → 포탑이 적은 쪽 → 킬이 적은 쪽이 진다
      let loser;
      if (left[0] <= 0 && left[1] <= 0) {
        if (Math.abs(left[0] - left[1]) > 1e-9) loser = left[0] < left[1] ? 0 : 1;
        else if (this.teams[0].towers !== this.teams[1].towers) loser = this.teams[0].towers < this.teams[1].towers ? 0 : 1;
        else if (this.teams[0].kills !== this.teams[1].kills) loser = this.teams[0].kills < this.teams[1].kills ? 0 : 1;
        else loser = this.rng() < 0.5 ? 0 : 1;
      } else loser = left[0] <= 0 ? 0 : 1;
      this.cores[1 - loser].hp = Math.max(1, this.cores[1 - loser].hp);
      this.kill(this.cores[loser], null);
    }
    fountainTick(dt) {
      for (const h of this.heroes) {
        if (h.dead) { h.atFountain = false; continue; }
        const own = M.bases[h.team].fountain, en = M.bases[1 - h.team].fountain;
        h.atFountain = U.dist(h.x, h.y, own.x, own.y) <= C.FOUNTAIN_R;
        if (h.atFountain) {
          if (h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.16 * dt);
          if (h.mp < h.maxMp) h.mp = Math.min(h.maxMp, h.mp + h.maxMp * 0.2 * dt);
        }
        if (U.dist(h.x, h.y, en.x, en.y) <= C.FOUNTAIN_R + 3) {
          this.damage(this.fountains[1 - h.team], h, h.maxHp * 0.6 * dt + 40 * dt, 'true');
        }
      }
    }
  }

  /* 팀 구성: 플레이어 영웅 + 역할이 겹치지 않게 봇 채우기 */
  AOS.pickTeams = function (playerHero, rng) {
    const all = AOS.HeroOrder.slice();
    const role = (id) => AOS.Heroes[id].role;
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
    function build(first) {
      const team = first ? [first] : [];
      const pool = shuffle(all.filter(id => id !== first));
      const has = (pred) => team.some(pred);
      const take = (pred) => { const i = pool.findIndex(pred); if (i >= 0) team.push(pool.splice(i, 1)[0]); };
      const front = (id) => role(id) === 'tank' || role(id) === 'fighter';
      const carry = (id) => role(id) === 'marksman';
      const magic = (id) => role(id) === 'mage' || role(id) === 'support';
      if (!has(front)) take(front);
      if (!has(carry)) take(carry);
      if (!has(magic)) take(magic);
      while (team.length < 5 && pool.length) team.push(pool.shift());
      return team;
    }
    return { blue: build(playerHero), red: build(null) };
  };

  AOS.Game = Game; AOS.Hero = Hero; AOS.Minion = Minion; AOS.Structure = Structure; AOS.MINION = MINION;
})();
