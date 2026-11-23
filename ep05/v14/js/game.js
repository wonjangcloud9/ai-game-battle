/* 어스름 전선 — game: 경기 규칙 (피해·상태 이상·강제 이동·투사체·장판·시야·웨이브·정글·처치 보상)
   화면/소리는 G.events 에 쌓이는 사건을 읽어 그린다. 주요 사건:
     hit{src,tgt,amt,tier:'basic'|'skill'|'big'|'dot'|'proc',slot,absorbed,lethal}  attackStart  melee  shoot  projHit  deflect  dodge
     cast / castFire / chargeStart / chargeEnd / channelStart / channelEnd / roll / dashStart / dashEnd / blink
     cc{u,kind,dur}  buff  heal  gold{u,amt,reason}  lastHit  levelup  buy
     kill{victim,killer,assists,gold,first,multi,streak,shutdown,recap}  ace  death  respawn
     towerLock  towerDown  coreDown  superLane  wave  campSpawn  campClear  buffGain  bossSpawn  bossDown  elderDown
     zoneNew / zoneBlast / zoneEnd  strikeNew / strikeBlast  fx{kind,...}  sfx{name}  say{u,text,x,y} */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map, TUNE = TW.TUNE;
  const EMPTY = Object.freeze({});
  const ATTACK = Object.freeze({ attack: true });

  /* ---------- 공간 해시 ---------- */
  const CELL = 8, HW = Math.ceil(C.W / CELL), HH = Math.ceil(C.H / CELL);
  class Hash {
    constructor() { this.cells = []; for (let i = 0; i < HW * HH; i++) this.cells.push([]); }
    rebuild(units) {
      const cs = this.cells;
      for (let i = 0; i < cs.length; i++) cs[i].length = 0;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.dead) continue;
        const cx = U.clamp((u.x / CELL) | 0, 0, HW - 1), cy = U.clamp((u.y / CELL) | 0, 0, HH - 1);
        cs[cy * HW + cx].push(u);
      }
    }
    /* 중심 거리 ≤ r + 대상 반지름 인 유닛 */
    query(x, y, r) {
      const out = [], pad = r + 4;
      const x0 = U.clamp(((x - pad) / CELL) | 0, 0, HW - 1), x1 = U.clamp(((x + pad) / CELL) | 0, 0, HW - 1);
      const y0 = U.clamp(((y - pad) / CELL) | 0, 0, HH - 1), y1 = U.clamp(((y + pad) / CELL) | 0, 0, HH - 1);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * HW + cx];
        for (let i = 0; i < cell.length; i++) {
          const u = cell[i], dx = u.x - x, dy = u.y - y, rr = r + u.r;
          if (dx * dx + dy * dy <= rr * rr) out.push(u);
        }
      }
      return out;
    }
  }

  const CC_NAME = { stun: '기절', freeze: '빙결', air: '띄움', root: '속박', taunt: '홀림' };

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.opts = opts;
      // 놀이 방식: 한 줄 난전이면 노을 협곡(다리 하나) · 3대3 또는 5대5. 어스름 전선은 늘 5대5
      this.mode = opts.mode === 'brawl' ? 'brawl' : 'classic'; this.brawl = this.mode === 'brawl';
      this.size = this.brawl && +opts.size === 3 ? 3 : 5;
      M.use(this.brawl ? 'ember' : 'dusk');
      const raw = U.mulberry32(opts.seed === undefined ? 12345 : opts.seed);
      this.rngN = 0;                                          // 뽑은 횟수 — 친구 방에서 두 화면이 같은 난수를 같은 만큼 썼는지 견준다
      this.rng = () => { this.rngN++; return raw(); };
      this.t = 0; this.nextId = 1; this.wave = 0; this.nextWaveT = C.FIRST_WAVE; this.goldT = 0; this.auraT = 0; this.visT = 0;
      this.units = []; this.heroes = []; this.minions = []; this.monsters = []; this.structs = [];
      this.projs = []; this.zones = []; this.strikes = []; this.timers = []; this.events = []; this.wards = [];
      this.hash = new Hash();
      this.over = false; this.winner = -1; this.overT = 0; this.firstBlood = false;
      this.superLane = [M.lanes.map(() => false), M.lanes.map(() => false)];
      const nT = (team) => M.towers.filter(t => t.team === team).length;
      this.teams = [{ kills: 0, towers: nT(0), towersMax: nT(0), bossUntil: -1, bossKills: 0 }, { kills: 0, towers: nT(1), towersMax: nT(1), bossUntil: -1, bossKills: 0 }];
      this.lastSeen = [[], []];       // lastSeen[보는 팀][적 영웅 번호] = {x,y,t}
      this.stat = { firstBloodT: -1, kills: [], towers: [], boss: [], elder: [], camps: [0, 0], buffs: [0, 0], lastHits: [0, 0], minionDeaths: [0, 0], aces: [0, 0], ganks: [0, 0], gankKills: [0, 0], heroDmg: [], deaths: [], dodges: 0, deflects: 0, wallSlams: 0, endT: 0, packs: [0, 0], packLog: [], timeUp: null, finalT: -1 };
      this.difficulty = opts.difficulty || 'normal';
      M.reset();
      // 구조물
      this.cores = [];
      for (let team = 0; team < 2; team++) {
        const c = M.bases[team].core;
        const core = new TW.Structure(this, team, 'core', -1, 3, c.x, c.y);
        this.cores.push(core); this.addUnit(core); M.setBlock(c.x, c.y, core.r + 0.3, true);
      }
      this.towers = [];
      for (const t of M.towers) {
        const tw = new TW.Structure(this, t.team, 'tower', t.lane, t.tier, t.x, t.y);
        tw.lt = t.t;
        this.towers.push(tw); this.addUnit(tw); M.setBlock(t.x, t.y, tw.r + 0.2, true);
      }
      this.refreshVulnerable();
      this.fountains = [0, 1].map(team => ({ team, x: M.bases[team].fountain.x, y: M.bases[team].fountain.y, r: 0, isFountain: true, name: '본진 등불', pen: 0 }));
      // 영웅
      // 한 줄 난전: 두 편 모두 영웅을 무작위로 뽑는다 (내 영웅도). opts.forceHero 는 시험 도구용
      const picks = opts.teams || (this.brawl ? TW.pickBrawlTeams(this.size, this.rng, opts.forceHero || null) : TW.pickTeams(opts.playerHero || null, opts.playerPos || null, this.rng));
      const spectate = !!opts.spectate, humans = opts.humans || null;      // humans: 친구 방 — 사람이 모는 자리들 [{team, idx}]
      for (let team = 0; team < 2; team++) for (let i = 0; i < this.size; i++) {
        const pk = picks[team][i];
        const human = humans ? humans.some(q => q.team === team && q.idx === i) : (team === 0 && i === 0 && !spectate);
        const h = new TW.Hero(this, team, pk.id, i, human, pk.pos);
        this.heroes.push(h); this.addUnit(h);
        this.lastSeen[1 - team].push({ x: h.x, y: h.y, t: -99 });
      }
      this.player = spectate ? null : humans ? (this.heroes.find(h => h.isPlayer) || null) : this.heroes[0];
      // 출전 바람: 경기 첫 출전에만, 처음 맞닿을 때까지(최대 C.DEPLOY_DUR초) 빨리 달린다 — 본진에서 라인까지 걷는 시간을 줄인다 (양 팀 똑같이)
      // 한 줄 난전: 레벨 3 · 골드를 넉넉히 들고 시작한다 (다리에 닿자마자 스킬 셋으로 싸운다)
      if (this.brawl) for (const h of this.heroes) { h.gold = h.stats.gold = C.BRAWL.GOLD; h.level = C.BRAWL.LEVEL; h.recalc(); h.hp = h.maxHp; }
      for (const h of this.heroes) { h.deployOn = true; this.addBuff(h, { id: 'deploy', dur: C.DEPLOY_DUR, msPct: C.DEPLOY_MS, fx: 'haste', color: C.TEAM_LIGHT[h.team], quiet: true, onExpire(u) { u.deployOn = false; } }); }
      // 정글 캠프 (노을 협곡에는 없다 — 큰 몬스터 자리는 비어 있는 자리표로 둔다)
      this.camps = M.camps.map(c => ({ id: c.id, kind: c.kind, x: c.x, y: c.y, side: c.side, low: c.low, alive: [], nextT: c.kind === 'boss' ? C.BOSS_FIRST : c.kind === 'elder' ? C.ELDER_FIRST : C.CAMP_FIRST, upT: -1, clears: 0 }));
      const none = (kind) => ({ id: -1, kind, x: -999, y: -999, side: -1, low: false, alive: [], nextT: 1e9, upT: -99, clears: 0, none: true });
      this.bossCamp = this.camps.find(c => c.kind === 'boss') || none('boss'); this.elderCamp = this.camps.find(c => c.kind === 'elder') || none('elder');
      // 회복 꾸러미 (한 줄 난전): 다리 위 자리마다 정해진 시각에 생기고, 체력이 깎인 영웅이 지나가면 줍는다
      this.packs = (M.packs || []).map((p, i) => ({ id: i, x: p.x, y: p.y, up: false, nextT: p.first, every: p.every, upT: -1, takes: [0, 0] }));
      if (TW.AI) TW.AI.setup(this);
      this.hash.rebuild(this.units);
      this.updateVision();
    }
    addUnit(u) {
      this.units.push(u);
      if (u.isMinion) this.minions.push(u); else if (u.isStruct) this.structs.push(u); else if (u.isMonster) this.monsters.push(u);
    }
    emit(type, data) { const e = data || {}; e.type = type; if (this.events.length < 9000) this.events.push(e); }
    fx(kind, data) { const e = data || {}; e.type = 'fx'; e.kind = kind; if (this.events.length < 9000) this.events.push(e); }
    after(sec, fn) { this.timers.push({ t: this.t + sec, fn }); }
    /* 그 팀에서 사람이 모는 첫 영웅 (혼자 하기에서는 새벽의 플레이어 = this.player) */
    humanOn(team) { const hs = this.heroes; for (let i = 0; i < hs.length; i++) if (hs[i].isPlayer && hs[i].team === team) return hs[i]; return null; }
    unitById(id) { const us = this.units; for (let i = 0; i < us.length; i++) if (us[i].id === id) return us[i]; return null; }

    /* ----- 조회 ----- */
    canTarget(src, tg) {
      if (tg.dead || tg.team === src.team) return false;
      if (tg.isStruct && !tg.vulnerable) return false;
      if (src.team !== 2 && !tg.seen[src.team]) return false;
      return true;
    }
    /* team 의 적(상대 팀 + 중립). 구조물 제외 */
    enemiesIn(team, x, y, r, opt) {
      const out = [], list = this.hash.query(x, y, r); opt = opt || EMPTY;
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (u.team === team || u.dead || u.isStruct) continue;
        if (u.isHero ? opt.heroes === false : u.isMinion ? (opt.minions === false || team === 2) : opt.monsters === false) continue;
        out.push(u);
      }
      return out;
    }
    alliesIn(team, x, y, r, heroesOnly) {
      const out = [], list = this.hash.query(x, y, r);
      for (let i = 0; i < list.length; i++) { const u = list[i]; if (u.team !== team || u.dead || u.isStruct) continue; if (heroesOnly && !u.isHero) continue; out.push(u); }
      return out;
    }
    enemiesInLine(team, x1, y1, x2, y2, hw) {
      const out = [], us = this.units;
      for (let i = 0; i < us.length; i++) {
        const u = us[i];
        if (u.team === team || u.dead || u.isStruct || (team === 2 && !u.isHero)) continue;
        if (U.segDist(u.x, u.y, x1, y1, x2, y2) <= hw + u.r) out.push(u);
      }
      return out;
    }
    enemiesInCone(team, x, y, ang, half, r) {
      const out = [], list = this.hash.query(x, y, r);
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (u.team === team || u.dead || u.isStruct || (team === 2 && !u.isHero)) continue;
        const d = Math.hypot(u.x - x, u.y - y);
        if (d < u.r + 0.4 || Math.abs(U.angDiff(ang, Math.atan2(u.y - y, u.x - x))) <= half + Math.asin(Math.min(1, u.r / d))) out.push(u);
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
      for (const c of this.cores) { let open = false; for (const t of this.towers) if (t.team === c.team && t.tier === 2 && t.dead) open = true; c.vulnerable = open; }
    }
    backdoor(s, atkTeam) {
      const list = this.hash.query(s.x, s.y, 14);
      for (let i = 0; i < list.length; i++) if (list[i].isMinion && list[i].team === atkTeam && !list[i].dead) return false;
      return true;
    }
    reveal(u, dur) { u.revealT = Math.max(u.revealT, this.t + dur); }

    /* ----- 상점: 어디서든 살 수 있다. 살 때마다 그 아이템이 한 단계 오른다 ----- */
    buyWhy(h, id) {
      const it = TW.Items[id]; if (!it) return 'none';
      const tier = h.items[id] || 0;
      if (tier >= 3) return 'max';
      if (h.gold < TW.ITEM_COST[tier]) return 'gold';
      return null;
    }
    buy(h, id) {
      if (this.buyWhy(h, id)) return false;
      const tier = h.items[id] || 0, cost = TW.ITEM_COST[tier];
      h.gold -= cost; h.items[id] = tier + 1; h.recalc();
      this.emit('buy', { u: h, item: id, tier: tier + 1, cost });
      return true;
    }

    /* ----- 상태 이상 ----- */
    addBuff(u, b) {
      if (!u || u.dead || u.isStruct) return null;
      const hard = b.stun || b.freeze || b.airborne || b.taunt, cc = hard || b.root || b.slow;
      if (cc) {
        if (u.unstoppable) return null;
        if (u.heavy) { if (b.airborne || b.taunt) return null; if (hard) b.dur *= 0.5; }
        if (b.src && b.src.isHero && u.isHero && b.src.team !== u.team) u.damagers.set(b.src, this.t);
      }
      b.t = 0;
      const bs = u.buffs;
      for (let i = 0; i < bs.length; i++) {
        if (bs[i].id !== b.id) continue;
        const old = bs[i];
        if (cc && !b.stacks && (old.dur - old.t) > b.dur && (old.slow || 0) >= (b.slow || 0)) return old;
        if (b.dot && old.dot) b.dotT = old.dotT;
        bs[i] = b; u.recalc();
        if (hard) this.interrupt(u);
        return b;
      }
      bs.push(b); u.recalc();
      if (hard) this.interrupt(u);
      if (hard || b.root) this.emit('cc', { u, kind: b.id, name: CC_NAME[b.id] || '', dur: b.dur, src: b.src });
      else if (!b.quiet) this.emit('buff', { u, b });
      return b;
    }
    interrupt(u) { u.wind = null; if (u.isHero) u.interruptActs(false); }
    slow(src, u, pct, dur) { return this.addBuff(u, { id: 'slow', slow: pct, dur, src, fx: 'slow', quiet: true }); }
    stun(src, u, dur) { return this.addBuff(u, { id: 'stun', stun: true, dur, src, fx: 'stun' }); }
    root(src, u, dur) { return this.addBuff(u, { id: 'root', root: true, dur, src, fx: 'root' }); }
    freeze(src, u, dur) { return this.addBuff(u, { id: 'freeze', freeze: true, dur, src, fx: 'freeze' }); }
    knockup(src, u, dur) { return this.addBuff(u, { id: 'air', airborne: true, dur, src, fx: 'air' }); }
    taunt(src, u, dur) { return this.addBuff(u, { id: 'taunt', taunt: src, dur, src, fx: 'taunt' }); }
    cleanse(u) {
      let any = false;
      for (let i = u.buffs.length - 1; i >= 0; i--) { const b = u.buffs[i]; if (b.slow || b.stun || b.root || b.freeze || b.taunt) { u.buffs.splice(i, 1); any = true; } }
      if (any) u.recalc();
    }
    /* 강제 이동 */
    canDisplace(u) { return u && !u.dead && !u.isStruct && !u.heavy && !u.unstoppable; }
    knockback(src, u, dx, dy, dist, dur) {
      if (!this.canDisplace(u)) return false;
      if (u.dash) this.endDash(u, 'interrupt');
      u.disp = { kind: 'knock', dx, dy, dist, dur: Math.max(0.05, dur), t: 0, src };
      this.interrupt(u);
      return true;
    }
    pullTo(src, u, x, y, speed, o) {
      if (!this.canDisplace(u)) return false;
      if (u.dash) this.endDash(u, 'interrupt');
      const d = Math.hypot(x - u.x, y - u.y);
      u.disp = { kind: 'pull', tx: x, ty: y, speed, t: 0, maxT: d / speed + 0.3, stun: (o && o.stun) || 0, src, chain: !!(o && o.chain) };
      this.interrupt(u);
      if (src && src.isHero && u.isHero) u.damagers.set(src, this.t);
      this.emit('pull', { u, src, chain: !!(o && o.chain) });
      return true;
    }
    toss(src, u, x, y, dur, onLand) {
      if (!this.canDisplace(u)) return false;
      if (u.dash) this.endDash(u, 'interrupt');
      const p = M.rayWalk(src.x, src.y, x, y);
      u.disp = { kind: 'toss', x0: u.x, y0: u.y, tx: p.x, ty: p.y, dur, h: 2.4, t: 0, src, onEnd: onLand };
      this.interrupt(u);
      if (src && src.isHero && u.isHero) u.damagers.set(src, this.t);
      this.emit('toss', { u, src });
      return true;
    }

    heal(src, tg, amt, o) {
      if (!tg || tg.dead || amt <= 0) return 0;
      const real = Math.min(amt, tg.maxHp - tg.hp);
      tg.hp += real;
      if (src && src.isHero && src.stats) src.stats.heal += real;
      if (real >= 1 && !(o && o.quiet)) this.emit('heal', { src, tgt: tg, amt: real });
      return real;
    }

    /* ----- 피해 ----- */
    damage(src, tg, amount, kind, opts) {
      if (!tg || tg.dead || this.over || !(amount > 0)) return 0;
      opts = opts || EMPTY;
      const isAtk = !!opts.attack, srcHero = !!(src && src.isHero), slot = opts.skill, isSkill = slot !== undefined;
      if (tg.isStruct) {
        if (!tg.vulnerable || !isAtk) return 0;
        if (this.backdoor(tg, src.team)) amount *= TUNE.backdoor;
        if (src.isMinion) amount *= (src.kind === 'siege' ? TUNE.siegeVsStruct : src.kind === 'super' ? TUNE.superVsStruct : TUNE.minionVsStruct) * (1 + U.clamp((this.t - TUNE.siegeLateFrom) / 360, 0, 1) * TUNE.siegeLate);      // 14분부터 미니언이 건물을 점점 더 잘 부순다
        else if (srcHero) amount *= TUNE.heroVsStruct * (1 + src.structMul);
        // 안쪽 등불탑과 큰등불은 초반에 단단하다 (한 번 밀렸다고 곧장 끝나지 않게)
        if (this.brawl) amount *= 1 + U.clamp((this.t - C.BRAWL.FINAL) / (C.BRAWL.LIMIT - C.BRAWL.FINAL), 0, 1) * C.BRAWL.FINAL_STRUCT;      // 한 줄 난전: 초반 단단함 없음 · 8분부터 '마지막 불꽃'으로 점점 더 잘 부서진다
        else {
          if (tg.kind === 'core' || tg.tier === 2) amount *= U.lerp(TUNE.earlyFort, 1, U.clamp((this.t - TUNE.fortFrom) / TUNE.fortSpan, 0, 1));
          // 밤이 깊어지면 등불이 약해진다: 15분부터 모든 구조물이 조금씩 더 잘 부서진다 (버티기만 해서는 끝까지 못 간다)
          amount *= 1 + U.clamp((this.t - TUNE.lateStructFrom) / 300, 0, 1) * TUNE.lateStruct;
        }
      }
      let mult = 1;
      if (kind !== 'true') { let def = tg.def; if (src && src.pen) def *= 1 - src.pen; mult = 100 / (100 + Math.max(0, def)); }
      if (src) {
        if (src.isMinion) { if (tg.isHero) mult *= TUNE.minionVsHero; else if (tg.isMinion) mult *= TUNE.minionVsMinion; if (src.emp && !tg.isStruct) mult *= 1 + TUNE.bossAura; }
        else if (srcHero) { mult *= src.dmgMul * (1 + src.dmgOut); if (isSkill && slot < 4 && src.pas.echo) mult *= 1.12; }
      }
      if (tg.dmgTaken) mult *= 1 + tg.dmgTaken;
      if (tg.isMinion && tg.emp) mult *= 0.75;
      let dmg = amount * mult, absorbed = 0;
      if (tg.shield > 0) {
        let rem = dmg;
        for (const b of tg.buffs) { if (!(b.shield > 0)) continue; const a = Math.min(b.shield, rem); b.shield -= a; rem -= a; if (b.shield <= 0) b.shieldOnly = true; if (rem <= 0) break; }
        absorbed = dmg - rem; dmg = rem; tg.shield = Math.max(0, tg.shield - absorbed);
      }
      tg.hp -= dmg; tg.lastHurt = this.t; tg.hitT = this.t;
      const total = dmg + absorbed;
      if (srcHero) {
        src.lastAct = this.t;
        if (tg.isHero) {
          tg.damagers.set(src, this.t); src.stats.dmg += total;
          src.lastHeroFight = this.t; tg.lastHeroFight = this.t; tg.lastHeroHurt = this.t;
          const bk = (this.t / 30) | 0; this.stat.heroDmg[bk] = (this.stat.heroDmg[bk] || 0) + total;
          if (!opts.dot && !opts.proc) this.callForHelp(src, tg);
          if (isSkill && slot < 4 && src.hitSeq[slot] !== src.stats.shots[slot]) { src.hitSeq[slot] = src.stats.shots[slot]; src.stats.hits[slot]++; }
        } else if (tg.isStruct) src.stats.struct += total;
        else if (tg.isMonster) { src.lastMonsterHit = this.t; tg.provoke(src); }
      }
      if (tg.isHero) {
        tg.stats.taken += total; if (tg.recall) tg.cancelRecall();
        const log = tg.hurtLog;
        log.push({
          t: this.t, a: total,
          type: srcHero ? 'hero' : !src ? 'etc' : src.isMinion ? 'minion' : src.isMonster ? 'monster' : src.isStruct ? 'tower' : 'fountain',
          who: src ? src.name : '', heroId: srcHero ? src.heroId : null,
          ab: opts.name || (isAtk ? '기본 공격' : isSkill ? (slot < 4 ? src.hd.abilities[slot].name : src.hd.passive.name) : opts.dot ? '지속 피해' : '추가 피해'),
        });
        if (log.length > 90) log.splice(0, 30);
      }
      if (isAtk && src.ls > 0 && !tg.isStruct && dmg > 0) this.heal(src, src, dmg * src.ls, { quiet: true });
      const lethal = tg.hp <= 0;
      this.emit('hit', { src, tgt: tg, amt: total, kind, tier: opts.dot ? 'dot' : isAtk ? 'basic' : opts.big ? 'big' : isSkill ? 'skill' : 'proc', slot, absorbed, lethal, x: tg.x, y: tg.y });
      // 출전 바람은 처음 맞닿는 순간(때리거나 맞으면) 걷힌다 — 싸움 속도는 늘 같다
      if (srcHero && src.deployOn) { src.deployOn = false; src.removeBuff('deploy', true); }
      if (tg.isHero && tg.deployOn) { tg.deployOn = false; tg.removeBuff('deploy', true); }
      if (srcHero && src.burn && !opts.dot && !tg.isStruct && !lethal) this.addBuff(tg, { id: 'burn', dur: 3, dot: (24 + 7 * src.level) / 6, src, name: '잉걸불', fx: 'burn', quiet: true });
      if (lethal) this.kill(tg, src);
      else if (tg.isHero && tg.pas.laststand && tg.hp < tg.maxHp * 0.3 && this.t >= tg.lastStandT) {
        tg.lastStandT = this.t + 60;
        this.addBuff(tg, { id: 'laststand', dur: 4, shield: tg.maxHp * 0.2, fx: 'shield', color: '#ffd9a0' });
        this.fx('ring', { x: tg.x, y: tg.y, r0: 0.5, r1: 3, dur: 0.4, color: '#ffd9a0', w: 0.3 });
      }
      if (isAtk && tg.isHero && !tg.dead && tg.pas.thorns && src && !src.isStruct && !src.isFountain && !src.dead) this.damage(tg, src, 20 + 0.2 * tg.def, 'magic', { proc: true, name: '이끼 갑옷' });
      return total;
    }
    /* 아군 영웅이 맞으면 근처 미니언·등불탑이 가해자를 노린다 */
    callForHelp(attacker, victim) {
      const list = this.hash.query(victim.x, victim.y, 9);
      for (let i = 0; i < list.length; i++) { const u = list[i]; if (u.isMinion && u.team === victim.team && !u.dead && U.du(u, attacker) <= 10) { u.forced = attacker; u.forcedT = this.t + 2.5; u.retT = 0; } }
      for (const s of this.structs) { if (s.team !== victim.team || s.dead) continue; if (U.du(s, attacker) - attacker.r <= s.range) s.forced = attacker; }
    }
    /* 기본 공격이 나가는 순간(근접 = 적중, 원거리 = 발사) */
    attackLand(u, tg) {
      if (u.isHero) u.lastAct = this.t;
      if (u.ranged) {
        const tri = u.isHero ? u.getBuff('triple') : null;
        if (tri) {
          u.removeBuff('triple', true);
          for (let i = 0; i < 3; i++) this.after(i * 0.07, () => { if (!u.dead && !tg.dead) this.launch(u, tg, u.ad * 0.6, 'phys', i === 0, (i - 1) * 0.5); });
        } else this.launch(u, tg, u.ad, 'phys', true, 0);
      } else {
        this.emit('melee', { u, target: tg });
        this.attackHit(u, tg, u.ad, 'phys', true);
      }
    }
    attackHit(src, tg, dmg, kind, first) {
      if (src.isHero && tg.isStruct) dmg += 0.5 * src.ap;
      this.damage(src, tg, dmg, kind, ATTACK);
      if (!src.isHero || !first || src.dead) return;
      if (src.pas.chain && !tg.isStruct && ++src.atkN % 4 === 0) {          // 바람 깃 3단계: 연쇄 번개
        let from = tg; const hit = new Set([tg]), amt = 40 + 0.4 * src.ad;
        for (let k = 0; k < 3; k++) {
          let nx = null, nd = 6.5;
          for (const e of this.enemiesIn(src.team, from.x, from.y, 6.5)) { if (hit.has(e)) continue; const d = U.du(e, from); if (d < nd) { nd = d; nx = e; } }
          if (!nx) break;
          this.fx('bolt', { x1: from.x, y1: from.y, x2: nx.x, y2: nx.y, color: '#a8f0c8', dur: 0.22 });
          this.damage(src, nx, amt, 'magic', { proc: true, name: '바람 깃' });
          hit.add(nx); from = nx;
        }
      }
      if (src.hd.onAttack) src.hd.onAttack(this, src, tg);
    }
    launch(u, tg, dmg, kind, first, side) {
      const pr = u.proj || { kind: 'mbolt', speed: 26 };
      const a = Math.atan2(tg.y - u.y, tg.x - u.x);
      this.projs.push({
        homing: true, src: u, team: u.team, target: tg, x: u.x + Math.cos(a) * u.r * 0.8 - Math.sin(a) * (side || 0), y: u.y + Math.sin(a) * u.r * 0.8 + Math.cos(a) * (side || 0), ang: a,
        speed: pr.speed, dmg, kind, first: !!first, vis: { kind: pr.kind, color: pr.color || C.TEAM_LIGHT[u.team] || '#d0ffe8', size: 1 }, born: this.t, id: this.nextId++,
      });
      this.emit('shoot', { u, target: tg });
    }
    skillshot(o) {
      const p = {
        homing: false, src: o.src, team: o.src.team, x: o.x, y: o.y, dx: o.dx, dy: o.dy, ang: Math.atan2(o.dy, o.dx),
        speed: o.speed, left: o.range, range: o.range, radius: o.radius, pierce: !!o.pierce, hit: new Set(), skip: o.skip || null, slot: o.slot, allies: !!o.allies,
        onHit: o.onHit, onAlly: o.onAlly || null, onEnd: o.onEnd || null, vis: o.vis, born: this.t, id: this.nextId++, skill: true,
        boomerang: o.boomerang || 0, returning: false, done: false, x0: o.x, y0: o.y, nHit: 0, sub: !!o.sub,      // nHit: 맞힌 수 (0 이면 빗나감) · sub: 쪼개진 조각 같은 곁가지
      };
      this.projs.push(p);
      this.emit('shot', { p });
      return p;
    }
    zone(o) {
      const z = {
        src: o.src, team: o.src.team, x: o.x, y: o.y, radius: o.radius, delay: o.delay || 0, dur: o.dur || 0, tick: o.tick || 0.5,
        onBlast: o.onBlast || null, onTick: o.onTick || null, onEnd: o.onEnd || null, vis: o.vis || { kind: 'warn', color: '#ffffff' },
        friendly: !!o.friendly, follow: o.follow || null, vx: o.vx || 0, vy: o.vy || 0, pull: o.pull || 0, smoke: !!o.smoke, dark: !!o.dark, orb: o.orb || null, lob: o.lob || null,
        t: 0, tickT: 0, active: false, done: false, id: this.nextId++, born: this.t,
      };
      this.zones.push(z);
      this.emit('zoneNew', { z });
      return z;
    }
    /* 예고 뒤에 한 번 터지는 공격 (원·직선·부채꼴) */
    strike(o) {
      const s = Object.assign({ t: 0, team: o.src.team, id: this.nextId++, born: this.t, done: false }, o);
      this.strikes.push(s);
      this.emit('strikeNew', { s });
      return s;
    }
    dash(u, tx, ty, speed, o) {
      o = o || {};
      let wallEnd = false;
      if (o.leap) { const p = M.nearestWalkable(tx, ty, 8); tx = p.x; ty = p.y; }
      else { const p = M.rayWalk(u.x, u.y, tx, ty); wallEnd = p.hit; tx = p.x; ty = p.y; }
      const dist = Math.hypot(tx - u.x, ty - u.y);
      u.wind = null;
      u.dash = { tx, ty, speed, o, hit: new Set(), t: 0, maxT: dist / speed + 0.4, x0: u.x, y0: u.y, dist, carried: null, wallEnd };
      if (o.leap) u.unstoppable = true;
      this.emit('dashStart', { u, kind: o.kind || 'dash', tx, ty, dur: dist / speed, trail: o.trail });
      if (dist < 0.05) this.endDash(u, wallEnd ? 'wall' : 'done');
    }
    updateDash(u, dt) {
      const d = u.dash, o = d.o;
      const dx = d.tx - u.x, dy = d.ty - u.y, dist = Math.hypot(dx, dy);
      let step = d.speed * dt, end = false, reason = 'done';
      if (dist <= step) { step = dist; end = true; if (d.wallEnd) reason = 'wall'; }
      if (dist > 1e-6 && step > 0) {
        const ux = dx / dist, uy = dy / dist, nx = u.x + ux * step, ny = u.y + uy * step;
        if (o.leap) { u.x = nx; u.y = ny; const k = 1 - (dist - step) / Math.max(0.01, d.dist); u.z = 4 * 2.8 * k * (1 - k); }
        else if (M.isWalkable(nx, ny)) {
          const c = d.carried;
          if (c) {
            const gap = u.r + c.r + 0.1, cx = nx + ux * gap, cy = ny + uy * gap;
            if (c.dead || !c.disp || c.disp.kind !== 'carry') { d.carried = null; u.x = nx; u.y = ny; }
            else if (!M.isWalkable(cx, cy)) { end = true; reason = 'wall'; }
            else { u.x = nx; u.y = ny; c.x = cx; c.y = cy; }
          } else { u.x = nx; u.y = ny; }
        } else { end = true; reason = 'wall'; }
        u.facing = Math.atan2(dy, dx);
      }
      d.t += dt; if (d.t > d.maxT) end = true;
      if (o.onHit && !o.leap) {
        const list = this.hash.query(u.x, u.y, o.hitR || 1.5);
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e.team === u.team || e.dead || e.isStruct || d.hit.has(e) || (u.team === 2 && !e.isHero)) continue;
          d.hit.add(e); o.onHit(e);
          if (o.carry && !d.carried && this.canDisplace(e) && (e.isHero || e.isMonster)) {
            if (e.dash) this.endDash(e, 'interrupt');
            d.carried = e; e.disp = { kind: 'carry', by: u, t: 0 }; this.interrupt(e);
            if (u.isHero && e.isHero) e.damagers.set(u, this.t);
          }
        }
      }
      if (end && u.dash === d) this.endDash(u, reason);
    }
    endDash(u, reason) {
      const d = u.dash; if (!d) return;
      u.dash = null; u.z = 0; if (d.o.leap) u.unstoppable = false;
      if (!M.isWalkable(u.x, u.y)) { const p = M.nearestWalkable(u.x, u.y, 10); u.x = p.x; u.y = p.y; }
      const c = d.carried;
      if (c) { if (c.disp && c.disp.kind === 'carry') c.disp = null; if (!c.dead && !M.isWalkable(c.x, c.y)) { const p = M.nearestWalkable(c.x, c.y, 10); c.x = p.x; c.y = p.y; } if (c.repath) c.repath(); }
      if (u.repath) u.repath();
      if (reason === 'wall' && c && !c.dead) this.stat.wallSlams++;
      this.emit('dashEnd', { u, kind: d.o.kind || 'dash', reason });
      if (reason !== 'interrupt' && d.o.onEnd) d.o.onEnd(reason, c);
    }
    blink(u, x, y) {
      const p = M.nearestWalkable(x, y, 8), ox = u.x, oy = u.y;
      u.x = u.px = p.x; u.y = u.py = p.y;
      if (u.repath) u.repath();
      this.emit('blink', { u, x0: ox, y0: oy });
    }

    /* ----- 처치 ----- */
    kill(tg, src) {
      if (tg.dead) return;
      tg.dead = true; tg.hp = 0; tg.wind = null; tg.deathT = this.t;
      if (tg.dash) { const d = tg.dash; tg.dash = null; tg.z = 0; tg.unstoppable = false; if (d.carried && d.carried.disp && d.carried.disp.kind === 'carry') d.carried.disp = null; }
      tg.disp = null;
      if (tg.isMinion) {
        this.grantXp(tg.x, tg.y, 1 - tg.team, tg.xp * (this.brawl ? C.BRAWL.XP_MUL : 1), null);
        this.stat.minionDeaths[tg.team]++;
        if (src && src.isHero) {
          const g = src.addGold(tg.gold * (this.brawl ? C.BRAWL.MINION_GOLD : 1)); src.cs++; this.stat.lastHits[src.team]++;
          this.emit('lastHit', { u: src, tgt: tg, amt: g, x: tg.x, y: tg.y });
          this.emit('gold', { u: src, amt: g, x: tg.x, y: tg.y, reason: 'cs' });
        }
        this.emit('death', { u: tg, killer: src });
      } else if (tg.isMonster) this.monsterDeath(tg, src);
      else if (tg.isHero) this.heroDeath(tg, src);
      else this.structDeath(tg, src);
    }
    grantXp(x, y, team, amount, always) {
      const list = [];
      for (const h of this.heroes) { if (h.team !== team || h.dead) continue; if (h === always || U.dist(h.x, h.y, x, y) <= C.XP_RANGE) list.push(h); }
      if (!list.length) return;
      const share = list.length === 1 ? 1 : list.length === 2 ? 0.65 : 0.45;
      // 상대 팀 평균보다 레벨이 낮은 영웅은 조금 더 빨리 배운다 (격차가 끝없이 벌어지지 않게)
      let lv = 0, n = 0; for (const e of this.heroes) if (e.team !== team) { lv += e.level; n++; }
      const avg = n ? lv / n : 1;
      for (const h of list) h.addXp(amount * share * U.clamp(1 + TUNE.catchXp * (avg - h.level), 0.9, 1.5));
    }
    campBuff(h, kind, dur) {
      if (kind === 'fire') this.addBuff(h, { id: 'buff_fire', dur, dmgOut: 0.08, burn: true, camp: 'fire', fx: 'campfire', color: '#ff8a3c' });
      else if (kind === 'water') this.addBuff(h, { id: 'buff_water', dur, cdRate: 0.25, msPct: 0.08, regenPct: 0.01, camp: 'water', fx: 'campwater', color: '#5fd4ff' });
      else if (kind === 'elder') this.addBuff(h, { id: 'buff_elder', dur, structMul: 0.5, camp: 'elder', fx: 'campelder', color: '#9fe07a' });
      else if (kind === 'boss') this.addBuff(h, { id: 'buff_boss', dur, dmgOut: 0.12, structMul: 0.6, regenPct: 0.006, camp: 'boss', fx: 'campboss', color: '#7dffd9' });
      this.emit('buffGain', { u: h, kind });
    }
    monsterDeath(m, src) {
      const camp = m.camp, killer = src && src.isHero ? src : this.lastHeroOn(m);
      const i = camp.alive.indexOf(m); if (i >= 0) camp.alive.splice(i, 1);
      if (killer) {
        if (m.gold > 0) { const g = killer.addGold(m.gold); killer.cs++; this.emit('gold', { u: killer, amt: g, x: m.x, y: m.y, reason: 'camp' }); }
        if (m.xp > 0) { killer.addXp(m.xp); for (const a of this.alliesIn(killer.team, m.x, m.y, 12, true)) if (a !== killer) a.addXp(m.xp * 0.5); }
        if (m.buffKind) { this.campBuff(killer, m.buffKind, C.BUFF_DUR); this.stat.buffs[killer.team]++; }
        if (m.kind === 'elder' || m.kind === 'boss') {
          const team = killer.team, boss = m.kind === 'boss';
          for (const h of this.heroes) {
            if (h.team !== team) continue;
            const g = h.addGold(boss ? 160 : 85); h.addXp(boss ? 250 : 140);
            if (!h.dead) this.emit('gold', { u: h, amt: g, x: h.x, y: h.y, reason: 'objective' });
          }
          if (boss) {
            this.teams[team].bossUntil = this.t + C.BOSS_BUFF; this.teams[team].bossKills++;
            for (const h of this.heroes) if (h.team === team) { if (h.dead) h.bossPending = true; else this.campBuff(h, 'boss', C.BOSS_BUFF); }
            this.stat.boss.push({ t: this.t, team });
            this.emit('bossDown', { team, killer, x: m.x, y: m.y });
          } else {
            for (const h of this.heroes) if (h.team === team && !h.dead) this.campBuff(h, 'elder', 75);
            this.stat.elder.push({ t: this.t, team }); this.emit('elderDown', { team, killer, x: m.x, y: m.y });
          }
        }
      }
      this.emit('death', { u: m, killer });
      if (!camp.alive.length) {
        camp.clears++;
        camp.nextT = this.t + (camp.kind === 'boss' ? C.BOSS_RESPAWN : camp.kind === 'elder' ? C.ELDER_RESPAWN : (camp.kind === 'fire' || camp.kind === 'water') ? C.BUFF_CAMP_RESPAWN : C.CAMP_RESPAWN);
        if (killer) { this.stat.camps[killer.team]++; killer.stats.camps++; }
        this.emit('campClear', { camp, killer });
      }
    }
    lastHeroOn(u) { let best = null, bd = 14; for (const h of this.heroes) { if (h.dead) continue; const d = U.du(h, u); if (d < bd && this.t - h.lastMonsterHit < 5) { bd = d; best = h; } } return best; }
    /* 사망 요약: 마지막 12초 동안 누구의 무엇에 얼마나 맞았나 */
    recapOf(v, killer, src) {
      const by = new Map(); let sum = 0, blow = null, t0 = this.t;
      for (const e of v.hurtLog) {
        if (this.t - e.t > 12) continue;
        if (e.t < t0) t0 = e.t;
        const key = e.type + '|' + e.who;
        let s = by.get(key);
        if (!s) { s = { name: e.who, type: e.type, heroId: e.heroId, total: 0, parts: new Map() }; by.set(key, s); }
        s.total += e.a; sum += e.a; s.parts.set(e.ab, (s.parts.get(e.ab) || 0) + e.a);
        blow = e;
      }
      const sources = Array.from(by.values()).sort((a, b) => b.total - a.total).slice(0, 4);
      for (const s of sources) s.parts = Array.from(s.parts, ([ab, a]) => ({ ab, a })).sort((a, b) => b.a - a.a).slice(0, 3);
      // span: 첫 피해부터 쓰러질 때까지(초) · blow.a: 마지막 일격의 피해 · killerHp: 쓰러뜨린 영웅에게 남은 체력 비율 (처치·쓰러짐 쪽지가 '누가 어떻게'를 보여 준다)
      const recap = { t: this.t, total: sum, span: this.t - t0, sources, killer, by: src, blow: blow ? { who: blow.who, ab: blow.ab, type: blow.type, a: blow.a, heroId: blow.heroId } : null, level: v.level, killerHp: killer ? killer.hp / killer.maxHp : -1 };
      v.hurtLog.length = 0; v.lastDeath = recap;
      return recap;
    }
    respawnTime(h) {
      if (this.brawl) { const B = C.BRAWL; return U.clamp((B.RESP_BASE + B.RESP_LEVEL * h.level) * (1 + U.clamp((this.t - 240) / 360, 0, 1) * B.RESP_LATE), 5, B.RESP_MAX); }      // 한 줄 난전: 짧다 (4분부터 조금씩 길어져 10분에 최대)
      // 시간이 갈수록 길어진다: 8분부터 서서히, 16분 뒤로는 한 번 더 (막판 한타 한 번이 승부를 가르게)
      const late = 1 + U.clamp((this.t - TUNE.respLateFrom) / TUNE.respLateSpan, 0, 1) * TUNE.respLateMul + U.clamp((this.t - 960) / 300, 0, 1) * TUNE.respLastMul;
      return U.clamp((TUNE.respBase + TUNE.respLevel * h.level + TUNE.respDeath * Math.min(12, h.deaths)) * late, 6, TUNE.respMax);
    }
    heroDeath(v, src) {
      let killer = src && src.isHero ? src : null;
      if (!killer) { let bt = this.t - C.ASSIST_WINDOW; for (const [h, t] of v.damagers) if (t > bt && !h.dead) { bt = t; killer = h; } }
      const assists = [];
      for (const [h, t] of v.damagers) if (h !== killer && this.t - t <= C.ASSIST_WINDOW) assists.push(h);
      v.damagers.clear();
      const recap = this.recapOf(v, killer, src);
      // 잘나가던 영웅을 잡으면 더 벌고, 연달아 쓰러진 영웅은 값이 싸진다
      const shutdown = v.streak >= 3, bountyAdd = Math.min(400, 80 * Math.max(0, v.streak - 2));
      const worth = U.clamp(1 - 0.15 * v.feed, 0.5, 1);
      v.respawnMax = v.respawnT = this.respawnTime(v);
      recap.respawn = v.respawnMax;
      v.deaths++; v.streak = 0; v.feed++;
      const steal = [];
      for (const b of v.buffs) if (b.camp === 'fire' || b.camp === 'water') steal.push({ kind: b.camp, left: b.dur - b.t });
      v.order = null; v.cast = null; v.channel = null; v.charge = null; v.recall = null; v.hold = false; v.buffs.length = 0; v.oocOn = false; v.bossPending = false; v.st = {}; v.recalc();
      let gold = 0, first = false, multi = 0, fbReward = null;
      this.stat.deaths.push({ t: this.t, team: v.team, by: killer ? 'hero' : src ? (src.isStruct ? 'tower' : src.isMinion ? 'minion' : src.isMonster ? 'monster' : 'etc') : 'etc', pos: v.pos });
      if (killer) {
        this.teams[killer.team].kills++; killer.kills++; killer.streak++; killer.feed = 0;
        killer.multi = (this.t - killer.lastKillT < C.MULTI_WINDOW) ? killer.multi + 1 : 1; killer.lastKillT = this.t; multi = killer.multi;
        // 뒤처진 팀이 잡으면 더 벌고, 앞선 팀이 잡으면 덜 번다 (한쪽으로 굴러가지 않게)
        let g0 = 0, g1 = 0; for (const h of this.heroes) { if (h.team === killer.team) g0 += h.stats.gold; else g1 += h.stats.gold; }
        const swing = U.clamp(1 - (g0 - g1) / TUNE.swingGold, 0.5, 1.7);
        gold = (C.KILL_GOLD * worth + bountyAdd) * swing;
        if (!this.firstBlood) { this.firstBlood = true; first = true; gold += C.FIRST_BLOOD_GOLD; this.stat.firstBloodT = this.t; }
        gold = killer.addGold(gold);
        // 첫 처치 보상: 골드에 더해 경험치와 30초 동안의 '첫 불꽃'(피해 +10% · 이동 +10%) — 처치 알림이 이 보상을 그대로 적어 준다
        if (first) {
          killer.addXp(C.FIRST_BLOOD_XP);
          this.addBuff(killer, { id: 'firstBlood', dur: C.FIRST_BLOOD_DUR, dmgOut: C.FIRST_BLOOD_DMG, msPct: C.FIRST_BLOOD_MS, fx: 'haste', color: '#ffd36a', name: '첫 불꽃' });
          fbReward = { gold: Math.round(C.FIRST_BLOOD_GOLD * killer.goldMul), xp: C.FIRST_BLOOD_XP, dur: C.FIRST_BLOOD_DUR, dmg: C.FIRST_BLOOD_DMG, ms: C.FIRST_BLOOD_MS };
          this.fbReward = fbReward;
        }
        this.emit('gold', { u: killer, amt: gold, x: v.x, y: v.y, reason: 'kill' });
        const part = [killer].concat(assists);
        for (const a of assists) { a.assists++; a.feed = Math.max(0, a.feed - 1); const g = a.addGold(C.ASSIST_GOLD * worth * swing); this.emit('gold', { u: a, amt: g, x: a.x, y: a.y, reason: 'assist' }); }
        // 처치 경험치: 여럿이 잡으면 나눠 갖는다 (한 번의 한타로 레벨이 확 벌어지지 않게 합계는 1.5배까지)
        const xp = (TUNE.killXp + TUNE.killXpLv * v.level) * (0.6 + 0.4 * worth);
        for (const a of part) { if (!a.dead) a.addXp(xp * (part.length === 1 ? 1 : part.length === 2 ? 0.62 : 1.5 / part.length) * U.clamp(1 + 0.16 * (v.level - a.level), 0.6, 1.7)); if (a.pas.feast && !a.dead) this.heal(a, a, (a.maxHp - a.hp) * 0.2); }
        for (const s of steal) if (!killer.dead && s.left > 3) { this.campBuff(killer, s.kind, Math.max(20, s.left)); this.emit('buffSteal', { u: killer, from: v, kind: s.kind }); }
        this.stat.kills.push({ t: this.t, team: killer.team, killer: killer.heroId, victim: v.heroId });
        if (killer.brain && killer.brain.ganking) this.stat.gankKills[killer.team]++;
      }
      this.emit('kill', { victim: v, killer, assists, gold, first, fbReward, multi, streak: killer ? killer.streak : 0, shutdown: shutdown && !!killer, by: src, recap });
      this.emit('death', { u: v, killer: killer || src });
      let all = true; for (const h of this.heroes) if (h.team === v.team && !h.dead) all = false;
      if (all) { this.stat.aces[1 - v.team]++; this.emit('ace', { team: 1 - v.team }); }
    }
    structDeath(s, src) {
      const et = 1 - s.team;
      if (s.kind === 'core') {
        this.over = true; this.winner = et; this.overT = 0; this.stat.endT = this.t;
        this.emit('death', { u: s, killer: src });
        this.emit('coreDown', { core: s, winner: et });
        return;
      }
      M.setBlock(s.x, s.y, s.r + 0.2, false);
      this.teams[s.team].towers--;
      const near = [];
      for (const h of this.heroes) { if (h.team !== et) continue; h.addGold(C.TOWER_GOLD_TEAM); if (!h.dead && U.du(h, s) <= 20) near.push(h); }
      for (const h of this.heroes) if (h.team === et && !h.dead) this.emit('gold', { u: h, amt: C.TOWER_GOLD_TEAM + (near.indexOf(h) >= 0 ? Math.round(C.TOWER_GOLD_NEAR / near.length) : 0), x: h.x, y: h.y, reason: 'tower' });
      for (const h of near) h.addGold(C.TOWER_GOLD_NEAR / near.length);
      this.refreshVulnerable();
      this.stat.towers.push({ t: this.t, team: et, tier: s.tier, lane: s.lane });
      this.emit('death', { u: s, killer: src });
      this.emit('towerDown', { tower: s, team: et, killer: src });
      if (s.tier === 2) { this.superLane[et][s.lane] = true; this.emit('superLane', { team: et, lane: s.lane }); }
    }
    respawn(h) {
      h.dead = false; h.x = h.px = h.spawnX; h.y = h.py = h.spawnY;
      h.hp = h.maxHp; h.order = null; h.wind = null; h.atkCd = 0; h.hold = false; h.hurtLog.length = 0; h.disp = null; h.dash = null; h.z = 0;
      h.facing = h.team === 0 ? 0 : Math.PI; h.lastHurt = -99; h.lastHeroHurt = -99; h.spawnT = this.t; h.revealT = -9;
      if (h.bossPending && this.t < this.teams[h.team].bossUntil - 5) this.campBuff(h, 'boss', this.teams[h.team].bossUntil - this.t);
      h.bossPending = false;
      this.emit('respawn', { u: h });
    }

    /* ----- 미니언 웨이브 ----- */
    spawnWave() {
      this.wave++;
      const B = this.brawl ? C.BRAWL : null, nL = M.lanes.length;
      const siege = this.wave % (B ? B.SIEGE_EVERY : C.SIEGE_EVERY) === 0, first = this.wave === 1;
      for (let team = 0; team < 2; team++) for (let lane = 0; lane < nL; lane++) {
        const base = first ? (B ? B.FIRST_WAVE_PROG : lane === 1 ? 34 : 62) : 7;           // 첫 웨이브는 이미 길 위에 나와 있다 (세 길에서 거의 동시에, 출전 바람을 탄 영웅이 닿을 즈음 맞붙는다)
        const offs = [-2.1, 0, 2.1];
        for (const o of offs) this.addUnit(new TW.Minion(this, team, lane, 'melee', base + 3, o));
        for (const o of offs) this.addUnit(new TW.Minion(this, team, lane, 'ranged', base, o));
        if (siege) this.addUnit(new TW.Minion(this, team, lane, 'siege', base - 2, 1.0));
        let n = 0;
        if (this.superLane[team][lane]) {       // 안쪽 등불탑을 부순 길: 정예병이 합류한다 (안쪽을 여럿 부술수록, 시간이 갈수록 더 많이)
          let downs = 0; for (let l = 0; l < nL; l++) if (this.superLane[team][l]) downs++;
          n = 1 + (downs >= 2 ? 1 : 0) + (this.t > 780 ? 1 : 0);
        }
        if (B && this.t >= B.FINAL) n = Math.max(n, 1) + (this.superLane[team][lane] ? 1 : 0);        // 한 줄 난전 '마지막 불꽃': 두 편 모두 웨이브마다 정예병
        for (let k = 0; k < n; k++) this.addUnit(new TW.Minion(this, team, lane, 'super', base + 5 + k * 1.8, k === 0 ? 0 : k === 1 ? 2.2 : -2.2));
      }
      this.emit('wave', { n: this.wave });
    }
    /* ----- 회복 꾸러미 (한 줄 난전) ----- */
    updatePacks() {
      const B = C.BRAWL;
      for (const p of this.packs) {
        if (!p.up) { if (this.t >= p.nextT) { p.up = true; p.upT = this.t; this.emit('packSpawn', { pack: p, x: p.x, y: p.y }); } continue; }
        let taker = null, bd = 1e9;
        for (const h of this.heroes) {
          if (h.dead || h.hp >= h.maxHp * 0.98) continue;          // 체력이 다 찬 영웅은 밟고 지나가도 줍지 않는다
          const d = Math.hypot(h.x - p.x, h.y - p.y);
          if (d <= B.PACK_R + h.r * 0.5 && d < bd) { bd = d; taker = h; }
        }
        if (!taker) continue;
        p.up = false; p.nextT = this.t + p.every; p.takes[taker.team]++; this.stat.packs[taker.team]++;
        const before = taker.hp, amt = this.heal(taker, taker, taker.maxHp * B.PACK_HEAL + B.PACK_FLAT);
        this.addBuff(taker, { id: 'packHaste', dur: B.PACK_MS_DUR, msPct: B.PACK_MS, fx: 'haste', color: '#b8ffcf', quiet: true });
        taker.stats.packs = (taker.stats.packs || 0) + 1;
        this.stat.packLog.push({ t: this.t, team: taker.team, hp0: before / taker.maxHp, amt });
        this.emit('packTake', { u: taker, pack: p, amt, x: p.x, y: p.y });
      }
    }
    /* 10분: 큰등불이 더 많이 남은 편이 이긴다 (같으면 등불탑 · 처치 수). 진 편 큰등불이 꺼지며 끝난다 */
    timeUp() {
      const f = this.cores.map(c => c.dead ? 0 : c.hp / c.maxHp), T = this.teams;
      let w;
      if (Math.abs(f[0] - f[1]) > 1e-6) w = f[0] > f[1] ? 0 : 1;
      else if (T[0].towers !== T[1].towers) w = T[0].towers > T[1].towers ? 0 : 1;
      else if (T[0].kills !== T[1].kills) w = T[0].kills > T[1].kills ? 0 : 1;
      else w = this.rng() < 0.5 ? 0 : 1;
      this.stat.timeUp = { frac: f, winner: w, towers: [T[0].towers, T[1].towers], kills: [T[0].kills, T[1].kills] };
      this.emit('timeUp', { winner: w, frac: f });
      this.kill(this.cores[1 - w], null);
    }
    /* ----- 정글 ----- */
    updateCamps() {
      for (const c of this.camps) {
        if (c.alive.length || this.t < c.nextT) continue;
        const kinds = TW.CAMPS[c.kind];
        for (let i = 0; i < kinds.length; i++) {
          const a = i / kinds.length * U.TAU + c.id, rr = kinds.length > 1 ? 1.9 : 0;
          const m = new TW.Monster(this, c, kinds[i], c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr);
          c.alive.push(m); this.addUnit(m);
        }
        c.upT = this.t;
        this.emit('campSpawn', { camp: c });
        if (c.kind === 'boss') this.emit('bossSpawn', { camp: c });
        else if (c.kind === 'elder') this.emit('elderSpawn', { camp: c });
      }
    }

    /* ----- 시야: 나무는 시야를 막고, 수풀·연막 속은 밖에서 안 보인다 ----- */
    updateVision() {
      const us = this.units, t = this.t;
      const smokes = [];
      for (const z of this.zones) if (z.smoke && z.active && !z.done) smokes.push(z);
      for (let i = 0; i < us.length; i++) {
        const u = us[i];
        if (u.isStruct) { u.seen[0] = u.seen[1] = true; continue; }
        if (u.dead) { u.seen[0] = u.seen[1] = false; continue; }
        let b = M.bushAt(u.x, u.y);
        for (let k = 0; k < smokes.length; k++) { const z = smokes[k]; if (U.dist2(u.x, u.y, z.x, z.y) <= z.radius * z.radius) { b = 1000 + z.id; break; } }
        u.bush = b;
        u.seen[0] = u.team === 0; u.seen[1] = u.team === 1;
      }
      for (let i = 0; i < us.length; i++) {
        const e = us[i];
        if (e.dead || e.isStruct) continue;
        const hidden = e.bush !== 0 && e.revealT <= t;
        let need0 = e.team !== 0, need1 = e.team !== 1;
        const list = this.hash.query(e.x, e.y, C.SIGHT_HERO);
        for (let k = 0; k < list.length && (need0 || need1); k++) {
          const v = list[k], vt = v.team;
          if (vt === 2 || vt === e.team || v.dead) continue;
          if (vt === 0 ? !need0 : !need1) continue;
          const s = v.sightCap ? Math.min(v.sight, v.sightCap) : v.sight, dx = v.x - e.x, dy = v.y - e.y, d2 = dx * dx + dy * dy;
          if (d2 > s * s) continue;
          if (hidden && v.bush !== e.bush && d2 > C.BUSH_REVEAL_R * C.BUSH_REVEAL_R) continue;
          if (!M.los(v.x, v.y, e.x, e.y)) continue;
          e.seen[vt] = true; if (vt === 0) need0 = false; else need1 = false;
        }
        if ((need0 || need1) && this.wards.length) {
          for (const w of this.wards) {
            if (w.team === e.team || (w.team === 0 ? !need0 : !need1)) continue;
            const d2 = U.dist2(w.x, w.y, e.x, e.y);
            if (d2 > w.r * w.r || (hidden && d2 > w.reveal * w.reveal)) continue;
            if (!M.los(w.x, w.y, e.x, e.y)) continue;
            e.seen[w.team] = true; if (w.team === 0) need0 = false; else need1 = false;
          }
        }
      }
      for (let i = 0; i < this.heroes.length; i++) {
        const h = this.heroes[i], vt = 1 - h.team;
        if (!h.dead && h.seen[vt]) { const ls = this.lastSeen[vt][h.slot]; ls.x = h.x; ls.y = h.y; ls.t = t; }
      }
    }

    /* ----- 메인 틱 ----- */
    update(dt) {
      if (this.over) { this.overT += dt; return; }
      this.t += dt;
      if (this.t >= this.nextWaveT) { this.spawnWave(); this.nextWaveT += this.brawl ? C.BRAWL.WAVE : C.WAVE_INTERVAL; }
      this.goldT += dt;
      if (this.goldT >= 1) { this.goldT -= 1; const gps = this.brawl ? C.BRAWL.GOLD_PER_SEC : C.GOLD_PER_SEC; for (const h of this.heroes) h.addGold(gps * (h.pos === 'sup' ? 1.5 : 1)); }
      if (this.brawl) {
        if (this.stat.finalT < 0 && this.t >= C.BRAWL.FINAL) { this.stat.finalT = this.t; this.emit('brawlFinal', { left: C.BRAWL.LIMIT - this.t }); }
        if (this.t >= C.BRAWL.LIMIT - 1e-6) { this.t = C.BRAWL.LIMIT; this.timeUp(); return; }      // 10:00 정각에 끝낸다 (틱이 넘쳐도 10:00.0)
        this.updatePacks();
      }
      this.updateCamps();
      this.hash.rebuild(this.units);
      this.visT -= dt;
      if (this.visT <= 0) { this.visT = 0.2; this.updateVision(); }
      if (this.timers.length) {
        for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= this.t) { const tm = this.timers[i]; this.timers.splice(i, 1); tm.fn(); }
      }
      if (TW.AI) TW.AI.update(this, dt);
      // 갱신 순서를 틱마다 뒤집는다 (늘 같은 팀이 먼저 행동하지 않게)
      const us = this.units, n = us.length, rev = ((this.tickN = (this.tickN || 0) + 1) & 1) === 1;
      for (let k = 0; k < n; k++) {
        const u = us[rev ? n - 1 - k : k];
        if (u.dead && !u.isHero) continue;
        u.px = u.x; u.py = u.y;
        u.update(dt);
        if (this.over) return;
      }
      this.updateProjs(dt);
      this.updateZones(dt);
      this.updateStrikes(dt);
      if (this.over) return;
      this.separate();
      this.fountainTick(dt);
      this.auraT -= dt;
      if (this.auraT <= 0) { this.auraT = 0.5; this.updateAura(); }
      if (this.wards.length) {
        // 길잡이 등불: 가까이 있는 아군 영웅의 공격 속도를 올린다
        if (this.tickN % 6 === 0) for (const w of this.wards) for (const h of this.heroes) if (h.team === w.team && !h.dead && U.dist(h.x, h.y, w.x, w.y) < w.reveal + 1) this.addBuff(h, { id: 'wardAS', dur: 0.45, asPct: 0.12, quiet: true });
        this.wards = this.wards.filter(w => w.until > this.t);
      }
      // 걷기 위상
      for (let i = 0; i < us.length; i++) {
        const u = us[i]; if (u.isStruct) continue;
        const sp = Math.hypot(u.x - u.px, u.y - u.py);
        u.moving = sp > 0.3 * dt && !u.dash && !u.disp;
        if (u.moving) u.walkPhase += sp * 1.9;
      }
      let dead = false;
      for (let i = 0; i < us.length; i++) if (us[i].dead && !us[i].isHero) { dead = true; break; }
      if (dead) {
        this.units = us.filter(u => !u.dead || u.isHero);
        this.minions = this.minions.filter(u => !u.dead);
        this.monsters = this.monsters.filter(u => !u.dead);
        this.structs = this.structs.filter(u => !u.dead);
      }
    }
    updateAura() {
      for (const m of this.minions) m.emp = false;
      for (const h of this.heroes) {
        if (h.dead || !h.hasBuff('buff_boss')) continue;
        const list = this.hash.query(h.x, h.y, 12);
        for (let i = 0; i < list.length; i++) if (list[i].isMinion && list[i].team === h.team) list[i].emp = true;
      }
    }
    updateProjs(dt) {
      const ps = this.projs;
      let defl = null;
      for (const h of this.heroes) if (!h.dead && h.deflect > 0) (defl = defl || []).push(h);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]; let done = p.done;
        if (!done && defl) {
          for (const h of defl) {
            if (h.team === p.team || U.dist2(h.x, h.y, p.x, p.y) > h.deflect * h.deflect) continue;
            done = true; this.stat.deflects++;
            this.emit('deflect', { u: h, p, x: p.x, y: p.y });
            const b = h.getBuff('deflect'); if (b && b.onDeflect) b.onDeflect();
            break;
          }
        }
        if (done) { /* 쳐냄 */ }
        else if (p.homing) {
          const tg = p.target;
          if (tg.dead || this.t - p.born > 3) done = true;
          else {
            const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
            if (d <= step + tg.r * 0.5) {
              p.x = tg.x; p.y = tg.y; done = true;
              this.emit('projHit', { p, target: tg });
              this.attackHit(p.src, tg, p.dmg, p.kind, p.first);
            } else { p.x += dx / d * step; p.y += dy / d * step; p.ang = Math.atan2(dy, dx); }
          }
        } else {
          if (p.returning) {
            const s = p.src, dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
            if (s.dead || d < 1.2) { done = true; p.caught = true; }
            else { p.dx = dx / d; p.dy = dy / d; p.ang = Math.atan2(dy, dx); p.left = d; }
          }
          const step = Math.min((p.returning ? p.boomerang : p.speed) * dt, p.left);
          const n = Math.max(1, Math.ceil(step / Math.max(0.5, p.radius)));
          for (let k = 0; k < n && !done; k++) {
            p.x += p.dx * step / n; p.y += p.dy * step / n; p.left -= step / n;
            const list = this.hash.query(p.x, p.y, p.radius);
            for (let q = 0; q < list.length; q++) {
              const u = list[q];
              if (u.dead || u.isStruct || p.hit.has(u) || u === p.skip) continue;
              if (u.team === p.team) { if (p.allies && p.onAlly && u !== p.src) { p.hit.add(u); p.onAlly(u, p); } continue; }
              if (p.team === 2 && !u.isHero) continue;
              if (u.dodgeUntil > this.t) { p.hit.add(u); this.stat.dodges++; this.emit('dodge', { u, p }); continue; }
              if (u.z > 1.2 && u.disp && u.disp.kind === 'toss') continue;          // 내던져져 높이 떠 있는 동안은 스킬이 밑으로 지나간다
              p.hit.add(u); p.nHit++;
              this.emit('projHit', { p, target: u });
              p.onHit(u, p);
              if (!p.pierce) { done = true; break; }
            }
          }
          if (!done && p.left <= 1e-6) {
            if (p.boomerang && !p.returning) { p.returning = true; p.hit.clear(); p.left = 99; this.emit('projTurn', { p }); }
            else if (!p.returning) done = true;
          }
          if (!done && (p.x < 0 || p.y < 0 || p.x > C.W || p.y > C.H)) done = true;
        }
        if (done) {
          p.done = true;
          if (!p.homing) { this.emit('projEnd', { p }); if (p.onEnd) p.onEnd(p); }
          ps[i] = ps[ps.length - 1]; ps.pop();
        }
        if (this.over) return;
      }
    }
    updateZones(dt) {
      const zs = this.zones, n = zs.length;
      for (let i = 0; i < n; i++) {
        const z = zs[i];
        if (z.done) continue;
        z.t += dt;
        if (!z.active) {
          if (z.t >= z.delay) {
            z.active = true; z.t = 0;
            this.emit('zoneBlast', { z });
            if (z.onBlast) z.onBlast(z);
            if (!(z.dur > 0)) z.done = true;
          }
        } else {
          if (z.follow) { if (z.follow.dead) { z.done = true; continue; } z.x = z.follow.x; z.y = z.follow.y; }
          if (z.vx || z.vy) { z.x += z.vx * dt; z.y += z.vy * dt; }
          if (z.pull) {
            const list = this.hash.query(z.x, z.y, z.radius);
            for (let k = 0; k < list.length; k++) {
              const u = list[k];
              if (u.team === z.team || u.dead || u.isStruct || u.heavy || u.unstoppable || u.dash || u.disp) continue;
              const dx = z.x - u.x, dy = z.y - u.y, d = Math.hypot(dx, dy);
              if (d < 0.6) continue;
              const st = Math.min(d - 0.5, z.pull * dt), nx = u.x + dx / d * st, ny = u.y + dy / d * st;
              if (M.isWalkable(nx, ny)) { u.x = nx; u.y = ny; }
            }
          }
          z.tickT += dt;
          while (z.tickT >= z.tick && !z.done) { z.tickT -= z.tick; if (z.onTick) z.onTick(z); }
          if (!z.done && z.t >= z.dur) { z.done = true; if (z.onEnd) z.onEnd(z); this.emit('zoneEnd', { z }); }
        }
        if (this.over) return;
      }
      let any = false;
      for (let i = 0; i < zs.length; i++) if (zs[i].done) { any = true; break; }
      if (any) this.zones = zs.filter(z => !z.done);
    }
    updateStrikes(dt) {
      const ss = this.strikes; if (!ss.length) return;
      for (let i = 0; i < ss.length; i++) {
        const s = ss[i]; s.t += dt;
        if (s.t < s.delay || s.done) continue;
        s.done = true;
        if (s.src.dead && !s.keep) continue;
        const list = s.shape === 'line' ? this.enemiesInLine(s.team, s.x, s.y, s.x2, s.y2, s.hw) : s.shape === 'cone' ? this.enemiesInCone(s.team, s.x, s.y, s.ang, s.half, s.r) : this.enemiesIn(s.team, s.x, s.y, s.r);
        this.emit('strikeBlast', { s });
        for (const u of list) { if (u.dodgeUntil > this.t + 0.12) { this.stat.dodges++; this.emit('dodge', { u, p: s }); continue; } s.onHit(u, s); }
      }
      this.strikes = ss.filter(s => !s.done);
    }
    separate() {
      const us = this.units;
      // 먼저 모두의 밀림을 셈하고, 그다음 한꺼번에 옮긴다 (먼저 셈한 쪽이 더 밀리는 치우침이 없게)
      let sx = this._sx, sy = this._sy;
      if (!sx || sx.length < us.length) { sx = this._sx = new Float32Array(us.length + 64); sy = this._sy = new Float32Array(us.length + 64); }
      // 걷는 중인 영웅(이동 명령 · 사거리 밖의 적을 쫓는 중)은 다른 영웅에게 막히지 않는다
      for (const h of this.heroes) { const o = h.order; h._go = !h.dead && !!o && (o.type === 'move' || (o.type === 'attack' && !h.wind && U.du(h, o.target) - o.target.r > h.range + 0.1)); }
      for (let i = 0; i < us.length; i++) {
        const u = us[i];
        sx[i] = 0; sy[i] = 0;
        if (u.dead || u.isStruct || u.dash || u.disp || (u.isMonster && u.baseMs === 0)) continue;
        const near = this.hash.query(u.x, u.y, u.r + 0.4);
        let ox = 0, oy = 0;
        for (let k = 0; k < near.length; k++) {
          const v = near[k];
          if (v === u || v.dead) continue;
          let dx = u.x - v.x, dy = u.y - v.y, d = Math.hypot(dx, dy);
          if (v.isStruct || (v.isMonster && v.baseMs === 0)) {
            const min = v.r + u.r * 0.5;
            if (d < min) { if (d < 1e-4) { dx = 1; dy = 0; d = 1; } ox += dx / d * (min - d); oy += dy / d * (min - d); }
            continue;
          }
          if (v.dash || v.disp) continue;
          // 영웅끼리: 둘 다 서 있을 때(싸우는 중 · 기다리는 중)는 몸이 포개지지 않게 넉넉히 벌린다 (큰 싸움에서 누가 누군지 보이게).
          // 어느 한쪽이라도 걷는 중이면 예전처럼 거의 그냥 지나간다 — 아군이 길을 막아 발이 묶이거나, 앞사람을 밀고 가느라 느려지지 않게
          const firm = u.isHero && v.isHero && !u._go && !v._go, min = (u.r + v.r) * (firm ? 1.14 : 0.82);
          if (d >= min) continue;
          if (d < 1e-4) { const a = (u.id * 2.399) % 6.283; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
          let w = 0.5;
          if (u.isHero && !v.isHero) w = 0.12; else if (!u.isHero && v.isHero) w = 0.88;
          else if (u.isHero && u._go !== v._go) w = u._go ? 0.15 : 0.85;          // 걷는 영웅은 거의 밀리지 않고, 서 있던 영웅이 비킨다
          const push = (min - d) * w * (firm ? 0.7 : 0.5);
          ox += dx / d * push; oy += dy / d * push;
          if (u.isHero && v.isHero && !u._go && v._go) {       // 서 있다가 밀릴 때는 앞으로 밀려가지 않고 옆으로 비켜선다 (걷는 영웅의 길 밖으로)
            const fx = Math.cos(v.facing), fy = Math.sin(v.facing), cr = fx * dy - fy * dx, sg = cr > 0.02 ? 1 : cr < -0.02 ? -1 : ((u.id & 1) ? 1 : -1);
            ox += -fy * sg * push * 0.8; oy += fx * sg * push * 0.8;
          }
        }
        sx[i] = ox; sy[i] = oy;
      }
      for (let i = 0; i < us.length; i++) {
        if (!sx[i] && !sy[i]) continue;
        const u = us[i], nx = u.x + sx[i], ny = u.y + sy[i];
        if (M.isWalkable(nx, ny)) { u.x = nx; u.y = ny; }
      }
    }
    fountainTick(dt) {
      for (const h of this.heroes) {
        if (h.dead) { h.atFountain = false; continue; }
        const own = M.bases[h.team].fountain, en = M.bases[1 - h.team].fountain;
        const was = h.atFountain;
        h.atFountain = U.dist(h.x, h.y, own.x, own.y) <= C.FOUNTAIN_R;
        if (h.atFountain) {
          if (h.hp < h.maxHp && !this.brawl) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.2 * dt);      // 한 줄 난전: 본진에서는 회복되지 않는다 (다리 위 회복 꾸러미로)
          const b = h.getBuff('homeguard');
          if (!h.deployOn && (!b || b.dur - b.t < 4.5)) this.addBuff(h, { id: 'homeguard', dur: 5, msPct: 0.55, fx: 'haste', color: C.TEAM_LIGHT[h.team], quiet: true });
        } else if (was) { /* 본진을 나선 뒤에도 잠깐 빠르다 */ }
        if (U.dist(h.x, h.y, en.x, en.y) <= C.FOUNTAIN_R + 1) this.damage(this.fountains[1 - h.team], h, (h.maxHp * 0.5 + 60) * dt, 'true', { name: '본진 등불' });
      }
    }
  }

  /* ---------- 중립 몬스터의 예고 공격 (피할 수 있다) ---------- */
  TW.monsterSkill = function (G, m, tg) {
    const d = Math.hypot(tg.x - m.x, tg.y - m.y) || 1, dx = (tg.x - m.x) / d, dy = (tg.y - m.y) / d, g = m.grow;
    const heroes = { minions: false, monsters: false };
    m.skillN++; m.facing = Math.atan2(dy, dx);
    const spout = (x, y, r, delay, dmg, name) => G.zone({
      src: m, x, y, radius: r, delay, vis: { kind: 'spout', color: '#5fd4ff', danger: true },
      onBlast(z) { for (const u of G.enemiesIn(2, z.x, z.y, z.radius, heroes)) G.damage(m, u, dmg, 'magic', { name }); G.fx('pillar', { x: z.x, y: z.y, r: z.radius * 0.8, color: '#9fe8ff', dur: 0.45 }); G.emit('sfx', { name: 'spout', x: z.x, y: z.y }); },
    });
    if (m.skill === 'charge') {
      m.skillT = 7; m.casting = 0.75;
      const x2 = m.x + dx * 8, y2 = m.y + dy * 8;
      G.strike({ src: m, shape: 'line', x: m.x, y: m.y, x2, y2, hw: 1.3, delay: 0.7, vis: { kind: 'charge', color: '#ff8a5a' }, onHit(u) { G.damage(m, u, 60 * g, 'phys', { name: '돌진' }); G.knockback(m, u, dx, dy, 2.5, 0.2); } });
      G.after(0.7, () => { if (!m.dead && !m.cc && !m.dash) G.dash(m, x2, y2, 30, { kind: 'ram' }); });
    } else if (m.skill === 'spouts') {
      m.skillT = 7; m.casting = 0.4;
      spout(tg.x, tg.y, 2.3, 0.9, 55 * g, '물기둥');
      for (let i = 0; i < 2; i++) { const a = G.rng() * U.TAU, r = 2.5 + G.rng() * 2.5; spout(tg.x + Math.cos(a) * r, tg.y + Math.sin(a) * r, 2.3, 1.05 + i * 0.15, 55 * g, '물기둥'); }
    } else if (m.skill === 'embers') {
      m.skillT = 6; m.casting = 0.4;
      const a0 = Math.atan2(dy, dx);
      for (let i = -1; i <= 1; i++) {
        const a = a0 + i * 0.36;
        G.skillshot({ src: m, x: m.x, y: m.y, dx: Math.cos(a), dy: Math.sin(a), speed: 15, range: 11, radius: 0.85, vis: { kind: 'ember', color: '#ff9340', size: 1.3 }, onHit(u) { G.damage(m, u, 50 * g, 'magic', { name: '불씨 뱉기' }); G.slow(m, u, 0.2, 1); } });
      }
    } else if (m.skill === 'roots') {
      m.skillT = 8; m.casting = 0.6;
      G.zone({
        src: m, x: tg.x, y: tg.y, radius: 4.5, delay: 1.0, vis: { kind: 'roots', color: '#9fe07a', danger: true },
        onBlast(z) { for (const u of G.enemiesIn(2, z.x, z.y, z.radius, heroes)) { G.damage(m, u, 110 * g, 'phys', { name: '뿌리 내리치기' }); G.root(m, u, 1.0); } G.fx('shock', { x: z.x, y: z.y, r: z.radius, color: '#c8f0a0', dur: 0.4 }); G.fx('shake', { x: z.x, y: z.y, amp: 0.4 }); G.emit('sfx', { name: 'slam', x: z.x, y: z.y }); },
      });
    } else if (m.skill === 'boss') {
      const rage = m.hp < m.maxHp * 0.5, pw = m.ad / 105;
      m.skillT = rage ? 4.2 : 5.5; m.casting = 1.0;
      const a0 = Math.atan2(dy, dx);
      if (m.skillN % 2 === 1) {
        G.strike({
          src: m, shape: 'cone', x: m.x, y: m.y, ang: a0, half: 1.0, r: 8.5, delay: 1.0, vis: { kind: 'sweep', color: '#7dffd9' },
          onHit(u) { G.damage(m, u, 170 * pw, 'phys', { name: '꼬리 휩쓸기' }); const dd = Math.hypot(u.x - m.x, u.y - m.y) || 1; G.knockback(m, u, (u.x - m.x) / dd, (u.y - m.y) / dd, 4, 0.25); },
        });
        G.after(1.0, () => { if (!m.dead) { G.fx('shake', { x: m.x, y: m.y, amp: 0.6 }); G.emit('sfx', { name: 'sweep', x: m.x, y: m.y }); } });
      } else {
        G.strike({
          src: m, shape: 'line', x: m.x, y: m.y, x2: m.x + dx * 17, y2: m.y + dy * 17, hw: 1.6, delay: 1.1, vis: { kind: 'breath', color: '#7dffd9' },
          onHit(u) { G.damage(m, u, 210 * pw, 'magic', { name: '물안개 숨결' }); G.slow(m, u, 0.3, 1.5); },
        });
        G.after(1.1, () => { if (!m.dead) { G.fx('beam', { x1: m.x, y1: m.y, x2: m.x + dx * 17, y2: m.y + dy * 17, w: 2.4, color: '#b8ffe9', dur: 0.45 }); G.fx('shake', { x: m.x, y: m.y, amp: 0.5 }); G.emit('sfx', { name: 'breath', x: m.x, y: m.y }); } });
      }
      if (rage) for (const h of G.heroes) if (!h.dead && U.du(h, m) < 14 && G.t - h.lastMonsterHit < 5) spout(h.x, h.y, 2.6, 1.2, 120 * pw, '솟구치는 물');
    }
  };

  /* ---------- 한 줄 난전의 팀 구성: 두 편 모두 영웅을 무작위로 (한 편 안에서는 겹치지 않게). 자리는 그 영웅에게 어울리는 곳(정글은 없다 → 윗길 몫) ----------
     자리 이름은 AI 의 성향(지원은 뒤에서 돕기 등)과 골드에만 쓰인다. 모두가 같은 다리에 선다 */
  TW.pickBrawlTeams = function (size, rng, forceHero) {
    const build = (first) => {
      const pool = TW.HeroOrder.slice(), team = [];
      if (first && TW.Heroes[first]) { pool.splice(pool.indexOf(first), 1); team.push(first); }
      while (team.length < size) { const k = Math.floor(rng() * pool.length); team.push(pool.splice(k, 1)[0]); }
      const used = new Set();
      return team.map((id) => {
        const p = TW.Heroes[id].pos, order = TW.POS.filter(q => q !== 'jg').sort((a, b) => (p[b] || 0) - (p[a] || 0));
        let pos = order.find(q => !used.has(q)) || order[0]; used.add(pos);
        return { id, pos };
      });
    };
    return [build(forceHero), build(null)];
  };
  /* ---------- 팀 구성: 다섯 자리(윗길·정글·가운뎃길·아랫길·지원)에 어울리는 영웅을 채운다 ---------- */
  TW.pickTeams = function (playerHero, playerPos, rng) {
    function build(first, firstPos) {
      const team = [], used = new Set(), open = TW.POS.slice();
      if (first) { const p = firstPos || TW.bestPos(first); team.push({ id: first, pos: p }); used.add(first); open.splice(open.indexOf(p), 1); }
      const order = ['carry', 'jg', 'mid', 'sup', 'top'].filter(p => open.indexOf(p) >= 0);
      for (const pos of order) {
        let pool = [], best = 0;
        for (const id of TW.HeroOrder) { if (used.has(id)) continue; const a = TW.Heroes[id].pos[pos] || 0; if (a > best) best = a; }
        for (const id of TW.HeroOrder) { if (used.has(id)) continue; const a = TW.Heroes[id].pos[pos] || 0; if (a >= Math.max(1, best - 1) || best === 0) pool.push({ id, w: best === 0 ? 1 : a * a }); }
        let sum = 0; for (const p of pool) sum += p.w;
        let r = rng() * sum, pick = pool[0];
        for (const p of pool) { r -= p.w; if (r <= 0) { pick = p; break; } }
        team.push({ id: pick.id, pos }); used.add(pick.id);
      }
      return team;
    }
    return [build(playerHero, playerPos), build(null, null)];
  };

  TW.Game = Game;
})();
