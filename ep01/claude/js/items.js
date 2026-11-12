// AURORA FALL — world items, supply chests, loot tables (no DOM dependencies)
'use strict';

const Items = {
  list: [], chests: [], nextId: 1,
  CELL: 16, n: 0, grid: null,

  reset() {
    this.list = []; this.chests = []; this.nextId = 1;
    this.n = Math.ceil(Terrain.SIZE / this.CELL);
    this.grid = new Array(this.n * this.n);
  },
  _cell(x, z) {
    const i = clamp(Math.floor((x + Terrain.HALF) / this.CELL), 0, this.n - 1), j = clamp(Math.floor((z + Terrain.HALF) / this.CELL), 0, this.n - 1);
    return j * this.n + i;
  },
  _gridAdd(it) { const c = this._cell(it.x, it.z); it.cell = c; (this.grid[c] || (this.grid[c] = [])).push(it); },
  _gridRemove(it) { const l = this.grid[it.cell]; if (!l) return; const k = l.indexOf(it); if (k >= 0) { l[k] = l[l.length - 1]; l.pop(); } },

  // desc: { kind, type, rarity, count, ammo }
  spawn(desc, x, y, z, vel, upper) {
    const it = {
      id: this.nextId++, kind: desc.kind, type: desc.type || '', rarity: desc.rarity || 0, count: desc.count || 1, ammo: desc.ammo || 0,
      x, y, z, vx: vel ? vel[0] : 0, vy: vel ? vel[1] : 0, vz: vel ? vel[2] : 0, rest: !vel, upper: !!upper, age: 0, alive: true, phase: (this.nextId * 0.731) % TAU, cell: 0,
    };
    this.list.push(it);
    this._gridAdd(it);
    return it;
  },
  remove(it) {
    if (!it.alive) return;
    it.alive = false;
    this._gridRemove(it);
    const k = this.list.indexOf(it);
    if (k >= 0) { this.list[k] = this.list[this.list.length - 1]; this.list.pop(); }
  },
  // Calls fn(item, dist) for every item within r of (x, z).
  forNear(x, z, r, fn) {
    const C = this.CELL, H = Terrain.HALF, n = this.n;
    const i0 = clamp(Math.floor((x - r + H) / C), 0, n - 1), i1 = clamp(Math.floor((x + r + H) / C), 0, n - 1);
    const j0 = clamp(Math.floor((z - r + H) / C), 0, n - 1), j1 = clamp(Math.floor((z + r + H) / C), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const l = this.grid[j * n + i];
      if (!l) continue;
      for (let k = l.length - 1; k >= 0; k--) {
        const it = l[k], d = Math.hypot(it.x - x, it.z - z);
        if (d <= r) fn(it, d);
      }
    }
  },

  // ---- loot tables
  _pick(weights, rng) {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = rng() * total;
    for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
    for (const k in weights) return k;
  },
  _rarity(tier, rng) {
    const w = LOOT.rarityWeights[clamp(tier, 0, 2)];
    let r = rng() * (w[0] + w[1] + w[2] + w[3]);
    for (let i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) return i; }
    return 0;
  },
  weapon(type, rarity) { return { kind: 'weapon', type, rarity, ammo: WEAPONS[type].mag, count: 1 }; },
  rollWeapon(tier, rng) { return this.weapon(this._pick(LOOT.weaponWeights[clamp(tier, 0, 2)], rng), this._rarity(tier, rng)); },
  ammoPack(type, rng, mult) { return { kind: 'ammo', type, count: Math.round(AMMO[type].pack * (mult || 1)) }; },
  rollAmmo(rng) { return this.ammoPack(this._pick({ light: 30, medium: 30, shell: 20, heavy: 16 }, rng), rng); },
  rollHeal(rng) { const type = this._pick(LOOT.healWeights, rng); return { kind: 'heal', type, count: type === 'bandage' ? rng.int(2, 3) : 1 }; },

  spawnInitial(rng) {
    for (const s of World.lootSpots) {
      if (rng() < (s.wild ? 0.25 : 0.1)) continue;
      const w = LOOT.kindWeights[clamp(s.tier, 0, 2)];
      let r = rng() * (w[0] + w[1] + w[2] + w[3]);
      const y = s.y + 0.02;
      if ((r -= w[0]) <= 0) {
        const wp = this.rollWeapon(s.tier, rng);
        this.spawn(wp, s.x, y, s.z, null, s.upper);
        const a = rng() * TAU;
        this.spawn(this.ammoPack(WEAPONS[wp.type].ammo, rng), s.x + Math.cos(a) * 0.75, y, s.z + Math.sin(a) * 0.75, null, s.upper);
      } else if ((r -= w[1]) <= 0) this.spawn(this.rollAmmo(rng), s.x, y, s.z, null, s.upper);
      else if ((r -= w[2]) <= 0) this.spawn(this.rollHeal(rng), s.x, y, s.z, null, s.upper);
      else this.spawn({ kind: 'grenade', count: 1 }, s.x, y, s.z, null, s.upper);
    }
    for (const c of World.chestSpots) this.chests.push({ x: c.x, y: c.y, z: c.z, yaw: c.yaw, tier: c.tier, upper: c.upper, opened: false, openT: 0, airdrop: false });
  },
  _pop(desc, x, y, z, rng, upper) {
    const a = rng() * TAU, sp = rng.range(1.2, 2.6);
    return this.spawn(desc, x, y + 0.5, z, [Math.cos(a) * sp, rng.range(4.2, 6.2), Math.sin(a) * sp], upper);
  },
  openChest(chest, rng, opener) {
    if (chest.opened) return false;
    chest.opened = true; chest.openT = 0;
    const { x, y, z, upper } = chest;
    if (chest.airdrop) {
      const main = rng() < 0.6 ? 'aurora' : (rng() < 0.5 ? 'sniper' : 'ar');
      this._pop(this.weapon(main, 3), x, y, z, rng, upper);
      this._pop(this.weapon(this._pick({ ar: 3, smg: 2, shotgun: 2, sniper: 2 }, rng), rng() < 0.5 ? 3 : 2), x, y, z, rng, upper);
      this._pop(this.ammoPack('heavy', rng, 2), x, y, z, rng, upper);
      this._pop(this.ammoPack('medium', rng, 2), x, y, z, rng, upper);
      this._pop({ kind: 'heal', type: 'cell', count: 3 }, x, y, z, rng, upper);
      this._pop({ kind: 'heal', type: 'medkit', count: 2 }, x, y, z, rng, upper);
      this._pop({ kind: 'grenade', count: 2 }, x, y, z, rng, upper);
    } else {
      const wp = this.rollWeapon(Math.min(2, chest.tier + 1), rng);
      this._pop(wp, x, y, z, rng, upper);
      this._pop(this.ammoPack(WEAPONS[wp.type].ammo, rng, 1.5), x, y, z, rng, upper);
      this._pop(this.rollAmmo(rng), x, y, z, rng, upper);
      this._pop(rng() < 0.5 ? { kind: 'heal', type: 'cell', count: rng.int(1, 2) } : this.rollHeal(rng), x, y, z, rng, upper);
      if (rng() < 0.45) this._pop(this.rollHeal(rng), x, y, z, rng, upper);
      if (rng() < 0.3) this._pop({ kind: 'grenade', count: 1 }, x, y, z, rng, upper);
    }
    Game.events.emit('chest', chest, opener);
    return true;
  },
  // Everything a character carried drops where it fell.
  dropAll(ch, rng) {
    const upper = ch.y > Terrain.height(ch.x, ch.z) + 2;
    const pop = d => this._pop(d, ch.x, ch.y, ch.z, rng, upper);
    for (const w of ch.weapons) if (w) pop({ kind: 'weapon', type: w.type, rarity: w.rarity, ammo: w.ammo, count: 1 });
    for (const t in ch.ammo) if (ch.ammo[t] > 0) pop({ kind: 'ammo', type: t, count: ch.ammo[t] });
    for (const t in ch.heals) if (ch.heals[t] > 0) pop({ kind: 'heal', type: t, count: ch.heals[t] });
    if (ch.grenades > 0) pop({ kind: 'grenade', count: ch.grenades });
  },
  nearestChest(x, z, r, y) {
    let best = null, bd = r;
    for (const c of this.chests) {
      if (c.opened) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd && (y === undefined || Math.abs(c.y - y) < 2.2)) { bd = d; best = c; }
    }
    return best;
  },
  update(dt) {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const it = this.list[k];
      it.age += dt;
      if (it.rest) continue;
      it.vy -= CFG.GRAVITY * dt;
      it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
      const g = Math.max(Phys.groundHeight(it.x, it.z, it.y + 0.3, 0.2), -0.4);
      if (it.vy <= 0 && it.y <= g) {
        it.y = g + 0.02;
        if (it.vy < -3) { it.vy = -it.vy * 0.28; it.vx *= 0.5; it.vz *= 0.5; }
        else { it.rest = true; it.vx = it.vy = it.vz = 0; this._gridRemove(it); this._gridAdd(it); }
      }
    }
    for (const c of this.chests) if (c.opened && c.openT < 1) c.openT = Math.min(1, c.openT + dt * 3);
  },
  label(it) {
    if (it.kind === 'weapon') return WEAPONS[it.type].name;
    if (it.kind === 'ammo') return AMMO[it.type].name + ' ×' + it.count;
    if (it.kind === 'heal') return HEALS[it.type].name + (it.count > 1 ? ' ×' + it.count : '');
    return GRENADE.name + (it.count > 1 ? ' ×' + it.count : '');
  },
};
