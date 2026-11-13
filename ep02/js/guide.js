// AURORA FALL — beginner guidance: works out which hint, world marker and highlight the player needs right now (no DOM dependencies)
'use strict';

const Guide = {
  enabled: true,
  LEARNED: 2,               // a written hint retires once the player has done the thing this many times (counted across matches)
  seen: { chest: 0, weapon: 0, heal: 0, cell: 0, ride: 0, revive: 0 },
  tip: null,                // coach line: { id, parts } where parts are strings and { k: 'F' } key caps
  marker: null,             // while unarmed, the nearest way to get a gun: { ref, x, y, z, kind: 'chest' | 'weapon', label }
  tags: [],                 // unopened chests close enough to label in the world: { ref, x, y, z, label }
  healSlot: '',             // consumable worth using right now: 'bandage' | 'medkit' | 'cell' | ''
  guardEnded: false,        // true for the one update in which the landing protection runs out
  TAG_RANGE: 16,
  _t: 0, _gunT: 0, _rideT: 0, _guard: false, _lootTip: false,
  _nearT: 0, _sameT: 0, _skip: new Map(),   // marker targets that turned out to be out of reach -> match time until which they are passed over

  // per match
  reset() { this._clear(); this._t = 0; this._gunT = 0; this._rideT = 0; this._lootTip = false; this._guard = false; this.guardEnded = false; this._nearT = 0; this._sameT = 0; this._skip.clear(); },
  _clear() { this.tip = null; this.marker = null; this.tags.length = 0; this.healSlot = ''; },
  knows(what) { return this.seen[what] >= this.LEARNED; },
  // the player just did one of the things the guidance teaches: 'chest' | 'weapon' | 'heal' | 'cell' | 'ride' (got into a vehicle)
  // | 'revive' (squad mode: helped a team-mate up)
  note(what) {
    if (what in this.seen) this.seen[what]++;
    if (what === 'weapon') { this._gunT = 10; this._lootTip = false; }
    if (what === 'ride') this._rideT = 14;
    if (what === 'lift') this._rideT = 8;       // (squad mode: got into a team-mate's vehicle as a passenger: a word on that, nothing to count)
    this._t = 0;            // refresh the hint straight away
  },

  update(dt) {
    const p = Game.player;
    this.guardEnded = false;
    if (this._gunT > 0) this._gunT -= dt;
    if (this._rideT > 0) this._rideT -= dt;
    if (p && p.alive && p.mode === 'down' && Game.state !== 'ended') {      // squad mode, knocked down: the one thing left to do
      this._clear(); this._guard = false;
      const K = k => ({ k });
      if (this.enabled) this.tip = p.reviver ? { id: 'up', parts: [p.reviver.name + ' — 일으켜 세우는 중입니다. 가만히 기다리세요'] }
        : { id: 'down', parts: ['기절했습니다 — ', K('W'), K('A'), K('S'), K('D'), ' 로 엄폐물 뒤로 기어가 팀원을 기다리세요'] };
      return;
    }
    if (!p || !p.alive || (p.mode !== 'ground' && p.mode !== 'drive') || Game.state === 'ended') { this._clear(); this._guard = false; return; }
    const guard = Game.playerShielded();
    if (this._guard && !guard) this.guardEnded = true;
    this._guard = guard;
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.2;
    if (!this.enabled) { this._clear(); return; }
    if (p.mode === 'drive') {                      // at the wheel: only how to drive, the first couple of times
      this._clear();
      const K = k => ({ k });
      if (p.vehicle && p.vehicle.driver !== p) { if (this._rideT > 0) this.tip = { id: 'pass', parts: ['팀원이 운전하는 탈것에 같이 탔습니다 — ', K('F'), ' 내리기'] }; }      // (squad mode: a passenger)
      else if (this._rideT > 0 && this.seen.ride <= this.LEARNED) this.tip = { id: 'drive', parts: [K('W'), K('S'), ' 가속·후진  ', K('A'), K('D'), ' 방향  ', K('Space'), ' 브레이크  ', K('F'), ' 내리기'] };
      return;
    }
    this.healSlot = this._heal(p);
    const was = this.marker ? this.marker.ref : null;
    this.marker = p.hasGun() ? null : this._nearestArms(p);
    // Within reach on the map yet not offered (it is on another floor), or still not reached after a long time close by:
    // it must be out of reach from here, so point somewhere else for a while.
    const m = this.marker;
    if (m && m.ref === was) {
      const d = Math.hypot(m.x - p.x, m.z - p.z), offered = !!(Game.interact && Game.interact.ref === m.ref);
      this._sameT += 0.2;
      this._nearT = !offered && d < (m.kind === 'chest' ? CFG.CHEST_RANGE : CFG.PICKUP_RANGE) ? this._nearT + 0.2 : 0;
      if (this._nearT > 4 || (this._sameT > 25 && d < 15)) { this._skip.set(m.ref, Game.time + 45); this._nearT = this._sameT = 0; this.marker = this._nearestArms(p); }
    } else { this._nearT = 0; this._sameT = 0; }
    this._findTags(p);
    this.tip = this._pickTip(p);
  },

  // Which medicine is worth using now ('' = none). The slot highlight and the Q key both go by this, so they always agree.
  // eager (Q was pressed: the player has asked for it): anything that does some good, also under fire.
  bestHeal(p, eager) {
    const h = p.heals, need = CFG.MAX_HP - p.hp, shieldNeed = CFG.MAX_SHIELD - p.shield;
    if (p.hp < 45 && h.medkit > 0) return 'medkit';
    if (need >= HEALS.bandage.hp && h.bandage > 0) return 'bandage';
    if (p.hp <= 60 && h.medkit > 0) return 'medkit';
    if (shieldNeed >= HEALS.cell.shield && h.cell > 0 && (eager || Game.time - p.lastDamageT > 2.5)) return 'cell';
    if (!eager) return '';
    if (need > 0 && h.bandage > 0) return 'bandage';
    if (need > 0 && h.medkit > 0) return 'medkit';
    if (shieldNeed > 0 && h.cell > 0) return 'cell';
    return '';
  },
  _heal(p) { return p.useT > 0 ? '' : this.bestHeal(p, false); },   // nothing to highlight while one is being applied

  // The easiest way for the player to get a gun: the chest or loose weapon with the lowest "walking cost".
  _nearestArms(p) {
    const zoned = Game.state === 'playing', cur = this.marker ? this.marker.ref : null;
    let best = null, bc = 1e9;
    const consider = (ref, kind, label, lift) => {
      if (Game.time < (this._skip.get(ref) || 0) || (zoned && Zone.outside(ref.x, ref.z)) || !this._walkable(p, ref)) return;
      const d = Math.hypot(ref.x - p.x, ref.z - p.z);
      let cost = d + Math.abs(ref.y - p.y) * 3;                         // a climb costs more than the same distance on the flat
      if (kind === 'chest') cost *= 0.8;                                // gun + ammo + medicine in one stop
      if (this._contested(p, ref, d)) cost *= 1.7;                      // somebody else will probably get there first
      if (ref === cur) cost *= 0.6;                                     // no flip-flopping between two similar options (where a crowd has landed, guns come and go by the second)
      if (cost < bc) { bc = cost; best = { ref, x: ref.x, y: ref.y + lift, z: ref.z, kind, label }; }
    };
    for (const c of Items.chests) if (!c.opened) consider(c, 'chest', c.airdrop ? '보급 상자' : '상자', 1.15);
    // (a gun still flying out of a chest counts at once: otherwise the marker would jump to some other chest for the second it takes to land)
    Items.forNear(p.x, p.z, 90, it => { if (it.kind === 'weapon') consider(it, 'weapon', WEAPONS[it.type].name, 1.0); });
    return best;
  },
  // Can the player simply walk there? Upper floors and spots off the walkable ground (pier ends, ledges) only count from close by.
  _walkable(p, ref) {
    const d = Math.hypot(ref.x - p.x, ref.z - p.z);
    if (ref.upper) return d < 12 && Math.abs(ref.y - p.y) < 1.5;
    return d < 8 || Nav.nearestFree(ref.x, ref.z, 2, true) >= 0;
  },
  // Is another character nearer to it than the player is?
  _contested(p, ref, d) {
    for (const c of Game.chars) if (c !== p && c.alive && c.mode === 'ground' && Math.hypot(c.x - ref.x, c.z - ref.z) < d) return true;
    return false;
  },

  _findTags(p) {
    const list = [];
    for (const c of Items.chests) {
      if (c.opened || Math.abs(c.y - p.y) > 3) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < this.TAG_RANGE) list.push({ ref: c, x: c.x, y: c.y + 1.1, z: c.z, label: c.airdrop ? '보급 상자' : '상자', d });
    }
    list.sort((a, b) => a.d - b.d);
    this.tags = list.slice(0, 3);
  },

  // loose ammo / medicine lying right next to the player (what a freshly opened chest leaves behind)
  _looseLoot(p) {
    let n = 0;
    Items.forNear(p.x, p.z, 6, it => { if (it.kind !== 'weapon' && Math.abs(it.y - p.y) < 2) n++; });
    return n > 0;
  },

  _pickTip(p) {
    const it = Game.interact, heal = this.healSlot, K = k => ({ k });
    // ---- 1. medicine
    if ((heal === 'bandage' || heal === 'medkit') && !this.knows('heal')) {
      const h = HEALS[heal];
      if (Game.time - p.lastDamageT < 2.5) return { id: 'heal', parts: ['몸을 숨긴 뒤 ', K(h.key), ' ' + h.name + '로 회복하세요'] };
      return { id: 'heal', parts: [K(h.key), ' ' + h.name + ' 사용 — ' + (heal === 'medkit' ? '체력을 전부 회복합니다' : '체력 +' + h.hp)] };
    }
    // ---- squad mode: a team-mate is down (comes before everything but one's own wounds)
    if (Game.squad) {
      if (p.reviving) return { id: 'reviving', parts: [p.reviving.name + ' 살리는 중 — 곁에 있어야 합니다 (쏘거나 멀어지면 취소)'] };
      if (it && it.type === 'revive') return { id: 'revive', parts: [K('F'), ' 팀원 살리기 — ' + SQUAD.reviveTime + '초 동안 곁에 있어야 합니다'] };
      if (!this.knows('revive')) {
        const m = Game.downedMate(p, 70, true);
        if (m && !m.reviver) return { id: 'mate', parts: ['팀원 ' + m.name + ' 기절 — 붉은 빛기둥으로 가서 ', K('F'), ' 로 살리세요'] };
      }
    }
    // ---- 2. getting armed
    if (!p.hasGun()) {
      if (it && it.type === 'chest') return { id: 'open', parts: [K('F'), ' 상자를 여세요 — 무기가 들어 있습니다'] };
      if (it && it.type === 'weapon') return { id: 'grab', parts: [K('F'), ' 무기를 주우세요 (위로 걸어가도 주워집니다)'] };
      const m = this.marker;
      if (m && m.kind === 'weapon') return { id: 'walk', parts: ['화살표가 가리키는 무기 위로 걸어가면 주워집니다'] };
      if (m) return { id: 'find', parts: ['무기부터 구하세요 — 화살표가 가리키는 상자에 다가가 ', K('F')] };
      return { id: 'find', parts: ['무기부터 구하세요 — 건물 안이나 금빛 빛기둥을 살펴보세요'] };
    }
    if (p.hp < 40 && p.heals.bandage + p.heals.medkit === 0 && !this.knows('heal')) return { id: 'noheal', parts: ['체력이 낮습니다 — 흰 붕대나 빨간 구급상자를 찾으세요'] };
    // ---- 3. first steps with a gun
    if (this._gunT > 0 && this.seen.weapon <= this.LEARNED) {
      // (once it has come up it stays for those seconds, also after the last pack has been walked over: a line that
      //  comes and goes with every pick-up cannot be read)
      if (this._gunT > 5.5 && (this._lootTip || this._looseLoot(p))) { this._lootTip = true; return { id: 'loot', parts: ['떨어진 탄약·회복 아이템도 위로 지나가면 챙겨집니다'] }; }
      return { id: 'shoot', parts: [K('좌클릭'), ' 사격 · ', K('우클릭'), ' 조준 · ', K('R'), ' 재장전'] };
    }
    if (it && it.type === 'chest' && !this.knows('chest')) return { id: 'open', parts: [K('F'), ' 상자를 여세요 — 탄약과 회복 아이템이 들어 있습니다'] };
    if (it && it.type === 'vehicle' && !this.knows('ride')) return { id: 'ride', parts: [K('F'), ' 탈것 타기 — 섬을 빨리 가로지릅니다 (타는 동안은 총을 쏠 수 없습니다)'] };
    if (heal === 'cell' && !this.knows('cell')) return { id: 'cell', parts: [K(HEALS.cell.key), ' 실드 셀 사용 — 실드 +' + HEALS.cell.shield + ' (체력보다 먼저 닳는 보호막)'] };
    return null;
  },
};
