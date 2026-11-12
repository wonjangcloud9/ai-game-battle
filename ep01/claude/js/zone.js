// AURORA FALL — the shrinking safe zone (no DOM dependencies)
'use strict';

const Zone = {
  x: 0, z: 0, r: 600, fromX: 0, fromZ: 0, fromR: 600, toX: 0, toZ: 0, toR: 300,
  phase: 0, state: 'wait', timer: 0, dps: 0, done: false, elapsed: 0, total: 1, rng: null,

  reset(rng) {
    this.rng = rng;
    this.x = this.z = this.fromX = this.fromZ = 0;
    this.r = this.fromR = ZONE_CFG.startRadius;
    this.phase = 0; this.state = 'wait'; this.done = false; this.elapsed = 0;
    this.timer = ZONE_CFG.phases[0].wait; this.dps = ZONE_CFG.phases[0].dps;
    this.total = 0;
    for (const p of ZONE_CFG.phases) this.total += p.wait + p.shrink;
    this._pickTarget();
  },
  _landFraction(x, z, r) {
    let n = 0;
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; if (Terrain.height(x + Math.cos(a) * r, z + Math.sin(a) * r) > 0.6) n++; }
    return n / 12;
  },
  _pickTarget() {
    const ph = ZONE_CFG.phases[this.phase], rng = this.rng;
    const maxOff = Math.max(0, this.r - ph.radius);
    let bx = this.x, bz = this.z, bestScore = -1;
    for (let t = 0; t < 70; t++) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * maxOff * (this.phase === 0 ? 0.5 : 0.92);
      const x = this.x + Math.cos(a) * d, z = this.z + Math.sin(a) * d;
      if (this.phase === 0 && Math.hypot(x, z) > 190) continue;
      if (Terrain.height(x, z) < 2.5 || !Nav.isOpen(x, z)) continue;
      const score = this._landFraction(x, z, Math.max(8, ph.radius * 0.7)) + rng() * 0.25;
      if (score > bestScore) { bestScore = score; bx = x; bz = z; if (score > 1.05) break; }
    }
    this.toX = bx; this.toZ = bz; this.toR = ph.radius;
  },
  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    this.timer -= dt;
    const ph = ZONE_CFG.phases[this.phase];
    if (this.state === 'wait') {
      if (this.timer <= 0) {
        this.state = 'shrink'; this.timer = ph.shrink;
        this.fromX = this.x; this.fromZ = this.z; this.fromR = this.r; this.dps = ph.dps;
        Game.events.emit('zone', 'shrink', this.phase);
      }
      return;
    }
    const f = 1 - clamp01(this.timer / ph.shrink);
    this.x = lerp(this.fromX, this.toX, f); this.z = lerp(this.fromZ, this.toZ, f); this.r = lerp(this.fromR, this.toR, f);
    if (this.timer <= 0) {
      this.x = this.toX; this.z = this.toZ; this.r = this.toR;
      this.phase++;
      if (this.phase >= ZONE_CFG.phases.length) { this.phase = ZONE_CFG.phases.length - 1; this.done = true; this.state = 'done'; this.timer = 0; Game.events.emit('zone', 'done', this.phase); }
      else { this.state = 'wait'; this.timer = ZONE_CFG.phases[this.phase].wait; this.dps = ZONE_CFG.phases[this.phase].dps; this._pickTarget(); Game.events.emit('zone', 'wait', this.phase); }
    }
  },
  outside(x, z) { return Math.hypot(x - this.x, z - this.z) > this.r; },
  // signed distance outside the next circle (negative = inside)
  nextDist(x, z) { return Math.hypot(x - this.toX, z - this.toZ) - this.toR; },
  progress() { return clamp01(this.elapsed / this.total); },
};
