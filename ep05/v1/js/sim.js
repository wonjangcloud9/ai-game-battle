/* 청홍대전 — sim: 게임 규칙 전체 (렌더링과 무관하게 동작) */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const C = AOS.C, U = AOS.U, M = AOS.Map;
  const EMPTY = Object.freeze({});

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
        const b = bs[i]; b.t += dt;
        if (b.t >= b.dur) { bs.splice(i, 1); changed = true; if (b.onExpire) b.onExpire(this); }
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
      if (w.t >= w.dur) { this.wind = null; this.G.strike(this, w.target); }
      return true;
    }
  }

  /* ---------- 미니언 ---------- */
  const MINION = {
    melee:  { hp: 460,  ad: 13, as: 0.8,  range: 1.6,  ms: 5.2, def: 0,  gold: 20, xp: 58,  r: 0.65, ranged: false },
    ranged: { hp: 290,  ad: 23, as: 0.67, range: 8.5,  ms: 5.2, def: 0,  gold: 15, xp: 30,  r: 0.6,  ranged: true, proj: { kind: 'mbolt', speed: 26 } },
    siege:  { hp: 850,  ad: 40, as: 0.5,  range: 11,   ms: 5.2, def: 15, gold: 42, xp: 90,  r: 1.0,  ranged: true, proj: { kind: 'shell', speed: 22 } },
    super:  { hp: 1500, ad: 52, as: 0.75, range: 2.0,  ms: 5.4, def: 30, gold: 55, xp: 100, r: 1.15, ranged: false },
  };
  const AGGRO = 9;
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
      this.gold = Math.round(s.gold + 0.35 * w); this.xp = Math.round(s.xp * (1 + 0.012 * w));
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
      this.lastShotT = -99;
    }
    recalc() { /* 구조물은 버프 영향을 받지 않음 */ }
    update(dt) {
      const G = this.G;
      if (this.atkCd > 0) this.atkCd -= dt;
      let tg = this.target;
      if (tg && (tg.dead || !G.canTarget(this, tg) || U.du(this, tg) - tg.r > this.range)) tg = this.target = null;
      if (this.forced) {
        const f = this.forced; this.forced = null;
        if (!f.dead && G.canTarget(this, f) && U.du(this, f) - f.r <= this.range && (!tg || !tg.isHero)) tg = this.target = f;
      }
      if (!tg) {
        let best = null, bs = Infinity;
        for (const u of G.hash.query(this.x, this.y, this.range)) {
          if (u.team === this.team || !G.canTarget(this, u)) continue;
          let score = U.du(this, u);
          if (u.isHero) score += 100;
          else if (u.kind === 'siege' || u.kind === 'super') score -= 6;
          if (score < bs) { bs = score; best = u; }
        }
        tg = this.target = best;
        if (tg && tg.isHero) G.emit('towerAggro', { tower: this, target: tg });
      }
      if (tg !== this.heatTarget) { this.heat = 0; this.heatTarget = tg; }
      if (tg && this.atkCd <= 0) {
        this.atkCd = 1 / this.as; this.lastShotT = G.t; this.faceTo(tg);
        let dmg = this.ad;
        if (tg.isHero) { dmg *= 1 + 0.3 * this.heat; this.heat = Math.min(4, this.heat + 1); }
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
  const xpNeed = (L) => 240 + 85 * (L - 1);
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
      this.kills = 0; this.deaths = 0; this.assists = 0; this.cs = 0; this.streak = 0; this.multi = 0; this.lastKillT = -99;
      this.stats = { dmg: 0, taken: 0, heal: 0, tower: 0, gold: C.START_GOLD };
      this.cds = [0, 0, 0, 0]; this.order = null; this.cast = null; this.dash = null; this.recall = null;
      this.respawnT = 0; this.respawnMax = 1; this.damagers = new Map();
      this.sight = C.SIGHT_HERO; this.idleT = 0; this.atFountain = true; this.lastAct = -99; this.lastHeroFight = -99;
      this.dmgMul = 1; this.goldMul = 1; this.cdr = 0; this.hpRegen = 0; this.mpRegen = 0;
      this.walkPhase = 0; this.lastCastT = -99; this.lastCastSlot = -1; this.levelUpT = -99;
      this.recalc();
      this.hp = this.maxHp; this.mp = this.maxMp;
    }
    recalc() {
      const b = this.hd.base, L = this.level - 1;
      let hp = b.hp + b.hpG * L, mp = b.mp + b.mpG * L, ad = b.ad + b.adG * L, ap = 0, def = b.def + b.defG * L;
      let asPct = b.asG * L, msFlat = 0, msPct = 0, cdr = 0, ls = 0, pen = 0;
      let hpRegen = b.hpRegen + 0.45 * L, mpRegen = b.mpRegen + 0.3 * L;
      for (const id of this.items) {
        const it = AOS.Items[id];
        hp += it.hp || 0; mp += it.mp || 0; ad += it.ad || 0; ap += it.ap || 0; def += it.def || 0;
        asPct += it.asPct || 0; msFlat += it.msFlat || 0; msPct += it.msPct || 0; cdr += it.cdr || 0;
        ls += it.lifesteal || 0; if ((it.pen || 0) > pen) pen = it.pen; hpRegen += it.hpRegen || 0;
      }
      let slowP = 0, stun = false, root = false, stealth = false, undying = false, shield = 0;
      for (const bf of this.buffs) {
        ad += bf.ad || 0; ap += bf.ap || 0; def += bf.def || 0; asPct += bf.asPct || 0; msPct += bf.msPct || 0; ls += bf.lifesteal || 0;
        if (bf.slow > slowP) slowP = bf.slow;
        if (bf.stun) stun = true; if (bf.root) root = true; if (bf.stealth) stealth = true; if (bf.undying) undying = true;
        if (bf.shield > 0) shield += bf.shield;
      }
      const oldHp = this.maxHp, oldMp = this.maxMp, fresh = !this._init;
      this.maxHp = hp; this.maxMp = mp;
      if (!fresh) {
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
        this.xp -= xpNeed(this.level); this.level++; this.recalc(); this.levelUpT = this.G.t;
        this.G.emit('levelup', { u: this });
      }
      if (this.level >= C.MAX_LEVEL) this.xp = 0;
    }
    addGold(g) { g = Math.round(g * this.goldMul); this.gold += g; this.stats.gold += g; return g; }
    breakStealth() { if (this.stealth) { for (let i = this.buffs.length - 1; i >= 0; i--) if (this.buffs[i].stealth) this.buffs.splice(i, 1); this.recalc(); } }

    /* ----- 명령 ----- */
    cmdMove(x, y, attackMove, keepWind) {
      if (this.dead) return;
      const p = M.nearestWalkable(x, y);
      const o = this.order;
      if (o && o.type === 'move' && !!o.attackMove === !!attackMove && U.dist(o.gx, o.gy, p.x, p.y) < 0.4) return;
      this.order = { type: 'move', path: M.findPath(this.x, this.y, p.x, p.y), pi: 0, attackMove: !!attackMove, gx: p.x, gy: p.y };
      if (!keepWind) this.wind = null;
      if (this.recall) this.cancelRecall();
    }
    cmdAttack(u, keepWind) {
      if (this.dead || !u || u.dead) return;
      const o = this.order;
      if (o && o.type === 'attack' && o.target === u && !o.auto) return;
      if (!keepWind && this.wind && this.wind.target !== u) this.wind = null;
      this.order = { type: 'attack', target: u };
      if (this.recall) this.cancelRecall();
    }
    cmdStop() { this.order = null; this.wind = null; if (this.recall) this.cancelRecall(); }
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
      if (ab.ult && this.level < C.ULT_LEVEL) return 'level';
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
      this.mp -= ab.cost; this.cds[slot] = ab.cd * (1 - this.cdr);
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
    findAutoTarget(r) {
      const G = this.G; let best = null, bs = Infinity;
      for (const u of G.hash.query(this.x, this.y, r)) {
        if (u.team === this.team || !G.canTarget(this, u)) continue;
        let score = U.du(this, u) - u.r;
        if (u.isStruct) score += 6;
        if (score < bs) { bs = score; best = u; }
      }
      return best;
    }
    runOrder(dt) {
      const G = this.G, o = this.order;
      if (!o) {
        this.idleT -= dt;
        if (this.idleT <= 0) {
          this.idleT = 0.15;
          const e = this.findAutoTarget(this.ranged ? this.range + 0.5 : 5);
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
        if (this.followPath(o, dt)) this.order = null;
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
      for (let i = 0; i < 4; i++) if (this.cds[i] > 0) this.cds[i] = Math.max(0, this.cds[i] - dt);
      if (this.atkCd > 0) this.atkCd -= dt;
      const ooc = G.t - this.lastHurt > 6;
      if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.hpRegen * (ooc ? 2.4 : 1) * dt);
      if (this.mp < this.maxMp) this.mp = Math.min(this.maxMp, this.mp + this.mpRegen * dt);
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
      this.firstBlood = false; this.visT = 0; this.goldAcc = 0;
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
    canShop(h) { return h.dead || U.dist(h.x, h.y, M.bases[h.team].fountain.x, M.bases[h.team].fountain.y) <= C.SHOP_R; }
    buy(h, id) {
      const it = AOS.Items[id];
      if (!it || h.items.length >= 6 || h.items.indexOf(id) >= 0 || h.gold < it.cost || !this.canShop(h)) return false;
      h.gold -= it.cost; h.items.push(id); h.recalc();
      this.emit('buy', { u: h, item: id });
      return true;
    }
    sell(h, idx) {
      if (idx < 0 || idx >= h.items.length || !this.canShop(h)) return false;
      const it = AOS.Items[h.items[idx]];
      h.items.splice(idx, 1); h.gold += Math.round(it.cost * 0.7); h.recalc();
      this.emit('sell', { u: h, item: it.id });
      return true;
    }

    /* ----- 전투 ----- */
    addBuff(u, b) {
      if (!u || u.dead || u.isStruct) return;
      b.t = 0;
      const bs = u.buffs;
      for (let i = 0; i < bs.length; i++) {
        if (bs[i].id !== b.id) continue;
        const old = bs[i];
        if ((b.stun || b.root || b.slow) && (old.dur - old.t) > b.dur && (old.slow || 0) >= (b.slow || 0)) return;
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
      const real = Math.min(amt, tg.maxHp - tg.hp);
      tg.hp += real;
      if (src && src.isHero && src.stats) src.stats.heal += real;
      if (real >= 1 && !silent) this.emit('heal', { tgt: tg, amt: real });
      return real;
    }
    damage(src, tg, amount, kind, opts) {
      if (!tg || tg.dead || this.over || !(amount > 0)) return 0;
      opts = opts || EMPTY;
      const isAtk = !!opts.attack;
      if (tg.isStruct) {
        if (!tg.vulnerable || !isAtk) return 0;
        if (this.backdoor(tg, src.team)) amount *= 0.3;
        if (src.isMinion) amount *= (src.kind === 'siege' ? 1.7 : src.kind === 'super' ? 1.1 : 0.6);
      }
      let mult = 1;
      if (kind !== 'true') {
        let def = tg.def;
        if (kind === 'phys' && src.pen) def *= 1 - src.pen;
        mult = 100 / (100 + Math.max(0, def));
      }
      if (src.isMinion && tg.isHero) mult *= 0.55;
      if (src.isHero) mult *= src.dmgMul;
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
      tg.hp -= dmg;
      tg.lastHurt = this.t;
      const total = dmg + absorbed;
      if (src.isHero) {
        src.lastAct = this.t;
        if (tg.isHero) {
          tg.damagers.set(src, this.t); src.stats.dmg += total;
          src.lastHeroFight = this.t; tg.lastHeroFight = this.t;
          this.callForHelp(src, tg);
        } else if (tg.isStruct) src.stats.tower += total;
      }
      if (tg.isHero) { tg.stats.taken += total; if (tg.recall) tg.cancelRecall(); }
      if (isAtk && src.lifesteal > 0 && !tg.isStruct && dmg > 0) this.heal(src, src, dmg * src.lifesteal, true);
      this.emit('hit', { src, tgt: tg, amt: total, kind, attack: isAtk, absorbed, x: tg.x, y: tg.y });
      if (tg.hp <= 0) this.kill(tg, src);
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
      let dmg = u.ad;
      if (u.isHero && tg.isStruct) dmg += 0.4 * u.ap;
      if (u.ranged) this.launch(u, tg, dmg, bonus, 'phys');
      else {
        this.emit('melee', { u, target: tg, bonus: bonus > 0 });
        this.damage(u, tg, dmg, 'phys', { attack: true });
        if (bonus > 0 && !tg.dead && !tg.isStruct) this.damage(u, tg, bonus, 'phys');
      }
    }
    launch(u, tg, dmg, bonus, kind) {
      const pr = u.proj || { kind: 'mbolt', speed: 26 };
      this.projs.push({
        homing: true, src: u, team: u.team, target: tg, x: u.x, y: u.y, ang: Math.atan2(tg.y - u.y, tg.x - u.x),
        speed: pr.speed, dmg, bonus, kind, vis: { kind: pr.kind, color: pr.color || (u.team === 0 ? '#8fd0ff' : '#ff9a8f'), size: bonus > 0 ? 1.4 : 1 },
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
        this.grantXp(tg.x, tg.y, 1 - tg.team, tg.xp, null);
        if (src && src.isHero) {
          const g = src.addGold(tg.gold); src.cs++;
          this.emit('gold', { u: src, amt: g, x: tg.x, y: tg.y });
        } else {
          for (const h of this.heroes) {
            if (h.team === tg.team || h.dead || U.du(h, tg) > 14) continue;
            h.addGold(tg.gold * 0.3);
          }
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
    heroDeath(v, src) {
      let killer = src && src.isHero ? src : null;
      if (!killer) {
        let bt = this.t - C.ASSIST_WINDOW;
        for (const [h, t] of v.damagers) if (t > bt) { bt = t; killer = h; }
      }
      const assists = [];
      for (const [h, t] of v.damagers) if (h !== killer && this.t - t <= C.ASSIST_WINDOW) assists.push(h);
      v.damagers.clear();
      const shutdown = Math.min(240, v.streak * 45);
      v.deaths++; v.streak = 0;
      v.respawnMax = v.respawnT = 5 + 1.7 * v.level + (this.t > 600 ? 4 : 0);
      v.order = null; v.cast = null; v.dash = null; v.recall = null; v.buffs.length = 0; v.recalc();
      let bounty = 0, first = false, multi = 0;
      if (killer) {
        this.teams[killer.team].kills++; killer.kills++; killer.streak++;
        killer.multi = (this.t - killer.lastKillT < 10) ? killer.multi + 1 : 1; killer.lastKillT = this.t; multi = killer.multi;
        bounty = C.KILL_GOLD + shutdown;
        if (!this.firstBlood) { this.firstBlood = true; first = true; bounty += C.FIRST_BLOOD; }
        bounty = killer.addGold(bounty);
        this.emit('gold', { u: killer, amt: bounty, x: v.x, y: v.y });
        for (const a of assists) { a.assists++; a.addGold(C.ASSIST_GOLD); }
        this.grantXp(v.x, v.y, killer.team, 130 + 42 * v.level, killer);
      }
      this.emit('kill', { victim: v, killer, assists, bounty, first, multi, by: src });
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
      h.hp = h.maxHp; h.mp = h.maxMp; h.order = null; h.wind = null; h.atkCd = 0;
      h.facing = h.team === 0 ? 0 : Math.PI; h.lastHurt = -99; h.spawnT = this.t;
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
      }
      this.emit('wave', { n: this.wave });
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
      // 기본 골드
      if (this.t > C.FIRST_WAVE) {
        this.goldAcc += dt * C.PASSIVE_GOLD;
        if (this.goldAcc >= 1) { const g = Math.floor(this.goldAcc); this.goldAcc -= g; for (const h of this.heroes) h.addGold(g); }
      }
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
          if (tg.dead) done = true;
          else {
            const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
            if (d <= step + tg.r * 0.5) {
              p.x = tg.x; p.y = tg.y; done = true;
              this.damage(p.src, tg, p.dmg, p.kind, { attack: true });
              if (p.bonus > 0 && !tg.dead && !tg.isStruct) this.damage(p.src, tg, p.bonus, 'phys');
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
