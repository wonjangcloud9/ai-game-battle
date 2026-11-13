// AURORA FALL — particles, tracers and light beams (CPU side; rendering happens in renderer.js)
'use strict';

const FX = {
  MAXP: 4000, MAXB: 1200,
  // particle pool (struct of arrays)
  n: 0,
  px: null, py: null, pz: null, vx: null, vy: null, vz: null, life: null, maxLife: null, s0: null, s1: null,
  cr: null, cg: null, cb: null, ca: null, kind: null, add: null, grav: null, drag: null, rot: null, rotV: null, seed: null,
  pData: null, pCount: 0,
  bData: null, bCount: 0,
  tracers: [],
  rng: makeRng(4242),
  light: 1,             // ambient brightness used to shade smoke / dust

  init() {
    const N = this.MAXP, F = () => new Float32Array(N);
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F(); this.life = F(); this.maxLife = F(); this.s0 = F(); this.s1 = F();
    this.cr = F(); this.cg = F(); this.cb = F(); this.ca = F(); this.kind = F(); this.add = F(); this.grav = F(); this.drag = F(); this.rot = F(); this.rotV = F(); this.seed = F();
    this.pData = new Float32Array(N * 12);
    this.bData = new Float32Array(this.MAXB * 12);
    this.n = 0; this.tracers = [];
  },
  clear() { this.n = 0; this.tracers.length = 0; this.pCount = 0; this.bCount = 0; },

  // kind: 0 glow, 1 smoke, 2 flash star, 3 ring, 4 chip
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, kind, additive, grav, drag) {
    let i = this.n;
    if (i >= this.MAXP) { i = Math.floor(this.rng() * this.MAXP); } else this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.cr[i] = r; this.cg[i] = g; this.cb[i] = b; this.ca[i] = a; this.kind[i] = kind; this.add[i] = additive ? 1 : 0;
    this.grav[i] = grav || 0; this.drag[i] = drag || 0; this.rot[i] = this.rng() * TAU; this.rotV[i] = (this.rng() - 0.5) * 2; this.seed[i] = this.rng();
  },

  // Immediate-mode beam for this frame (loot pillars, lighthouse, ...). pow shapes the brightness along a -> b.
  beam(ax, ay, az, bx, by, bz, width, r, g, b, a, pow) {
    if (this.bCount >= this.MAXB) return;
    const o = this.bCount++ * 12, d = this.bData;
    d[o] = ax; d[o + 1] = ay; d[o + 2] = az; d[o + 3] = width;
    d[o + 4] = bx; d[o + 5] = by; d[o + 6] = bz; d[o + 7] = pow === undefined ? 1 : pow;
    d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = a;
  },
  beginFrame() { this.bCount = 0; },
  // Immediate-mode sprite for this frame (call after update()): lamp glows, beacons, markers.
  sprite(x, y, z, size, r, g, b, a, kind, additive) {
    if (this.pCount >= this.MAXP) return;
    const o = this.pCount++ * 12, d = this.pData;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = size;
    d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a;
    d[o + 8] = 0; d[o + 9] = kind || 0; d[o + 10] = additive === false ? 0 : 1; d[o + 11] = 0;
  },

  update(dt) {
    // ---- particles
    const d = this.pData;
    let n = this.n, w = 0;
    for (let i = 0; i < n; i++) {
      let life = this.life[i] - dt;
      if (life <= 0) {
        // swap-remove
        n--;
        if (i < n) {
          this.px[i] = this.px[n]; this.py[i] = this.py[n]; this.pz[i] = this.pz[n]; this.vx[i] = this.vx[n]; this.vy[i] = this.vy[n]; this.vz[i] = this.vz[n];
          this.life[i] = this.life[n]; this.maxLife[i] = this.maxLife[n]; this.s0[i] = this.s0[n]; this.s1[i] = this.s1[n];
          this.cr[i] = this.cr[n]; this.cg[i] = this.cg[n]; this.cb[i] = this.cb[n]; this.ca[i] = this.ca[n]; this.kind[i] = this.kind[n]; this.add[i] = this.add[n];
          this.grav[i] = this.grav[n]; this.drag[i] = this.drag[n]; this.rot[i] = this.rot[n]; this.rotV[i] = this.rotV[n]; this.seed[i] = this.seed[n];
          i--;
        }
        continue;
      }
      this.life[i] = life;
      const dr = this.drag[i];
      if (dr > 0) { const k = Math.exp(-dr * dt); this.vx[i] *= k; this.vy[i] *= k; this.vz[i] *= k; }
      this.vy[i] -= this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.rotV[i] * dt;
      const t = 1 - life / this.maxLife[i];
      const size = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fade = this.kind[i] === 1 ? Math.min(1, t * 6) * (1 - t) * 1.6 : (1 - t * t);
      const lit = this.add[i] ? 1 : this.light;
      const o = w * 12;
      d[o] = this.px[i]; d[o + 1] = this.py[i]; d[o + 2] = this.pz[i]; d[o + 3] = size;
      d[o + 4] = this.cr[i] * lit; d[o + 5] = this.cg[i] * lit; d[o + 6] = this.cb[i] * lit; d[o + 7] = this.ca[i] * Math.min(1, fade);
      d[o + 8] = this.rot[i]; d[o + 9] = this.kind[i]; d[o + 10] = this.add[i]; d[o + 11] = this.seed[i];
      w++;
    }
    this.n = n; this.pCount = w;
    // ---- tracers (append to this frame's beams)
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      const head = Math.min(t.len, t.speed * t.t), tail = Math.max(0, head - t.seg);
      if (t.speed * t.t - t.seg > t.len) { this.tracers.splice(i, 1); continue; }
      this.beam(t.ax + t.dx * tail, t.ay + t.dy * tail, t.az + t.dz * tail, t.ax + t.dx * head, t.ay + t.dy * head, t.az + t.dz * head, t.width, t.r, t.g, t.b, t.a, t.pow);
    }
  },

  // ------------------------------------------------------------------ effect recipes
  tracer(def, ax, ay, az, bx, by, bz) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1.5) return;
    dx /= len; dy /= len; dz /= len;
    const c = hexLin(def.tracer || 0xffe9a8);
    const beam = !!def.beam;
    if (this.tracers.length > 220) this.tracers.shift();
    this.tracers.push({ ax, ay, az, dx, dy, dz, len, t: 0, speed: beam ? 900 : 420, seg: beam ? Math.min(len, 60) : Math.min(len, 16), width: beam ? 0.12 : 0.045, r: c[0] * (beam ? 5 : 3.2), g: c[1] * (beam ? 5 : 3.2), b: c[2] * (beam ? 5 : 3.2), a: 1, pow: beam ? 0.4 : 0.7 });
  },
  muzzle(x, y, z, dx, dy, dz, def) {
    const c = def.beam ? [0.3, 1.0, 0.85] : [1.0, 0.75, 0.35];
    const big = def.pellets > 1 || def.id === 'sniper' ? 1.5 : 1;
    this.spawn(x, y, z, dx * 2, dy * 2, dz * 2, 0.05, 0.3 * big, 0.18 * big, c[0] * 5, c[1] * 5, c[2] * 5, 1, 2, true);
    this.spawn(x, y, z, 0, 0, 0, 0.06, 0.45 * big, 0.6 * big, c[0] * 1.1, c[1] * 1.1, c[2] * 1.1, 0.7, 0, true);
    this.spawn(x + dx * 0.2, y + dy * 0.2, z + dz * 0.2, dx * 1.5, dy * 1.5 + 0.4, dz * 1.5, 0.5, 0.12, 0.5, 0.75, 0.75, 0.75, 0.22, 1, false, -0.3, 2);
  },
  impact(x, y, z, nx, ny, nz, kind) {
    const rng = this.rng;
    if (kind === 1) { // terrain: dirt puff tinted by the ground colour
      const c = [0.5, 0.45, 0.35];
      if (typeof Terrain !== 'undefined' && Terrain.col) Terrain.colorAt(x, z, c);
      for (let k = 0; k < 3; k++) this.spawn(x, y + 0.05, z, nx * 1.2 + (rng() - 0.5) * 1.6, ny * 1.5 + rng() * 1.2, nz * 1.2 + (rng() - 0.5) * 1.6, 0.5 + rng() * 0.3, 0.12, 0.6, c[0] * 1.3 + 0.1, c[1] * 1.3 + 0.1, c[2] * 1.3 + 0.1, 0.5, 1, false, 0.8, 2.5);
      for (let k = 0; k < 3; k++) this.spawn(x, y + 0.05, z, nx * 2 + (rng() - 0.5) * 3, ny * 3 + rng() * 2, nz * 2 + (rng() - 0.5) * 3, 0.45, 0.045, 0.03, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 1, 4, false, 12, 0.5);
    } else { // hard surface: sparks + dust
      for (let k = 0; k < 5; k++) this.spawn(x, y, z, nx * 3 + (rng() - 0.5) * 6, ny * 3 + (rng() - 0.5) * 6 + 1, nz * 3 + (rng() - 0.5) * 6, 0.16 + rng() * 0.16, 0.06, 0.02, 6, 4, 1.6, 1, 0, true, 10, 1);
      this.spawn(x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, nx * 0.8, ny * 0.8 + 0.3, nz * 0.8, 0.5, 0.1, 0.5, 0.7, 0.68, 0.64, 0.35, 1, false, -0.1, 2.5);
      this.spawn(x, y, z, 0, 0, 0, 0.05, 0.22, 0.3, 4, 3, 1.5, 1, 0, true);
    }
  },
  // near = the hit is on the character the camera is following: keep it subtle so it does not cover the view
  hit(x, y, z, head, shield, near) {
    const rng = this.rng;
    if (near) {
      for (let k = 0; k < 2; k++) this.spawn(x, y, z, (rng() - 0.5) * 4, rng() * 2.5, (rng() - 0.5) * 4, 0.22, 0.05, 0.02, shield ? 1.2 : 2, shield ? 5 : 0.5, shield ? 6 : 0.2, 1, 0, true, 6, 1.5);
      return;
    }
    if (shield) {
      this.spawn(x, y, z, 0, 0, 0, 0.14, 0.12, 0.42, 0.3, 1.3, 1.7, 0.8, 3, true);
      for (let k = 0; k < 5; k++) this.spawn(x, y, z, (rng() - 0.5) * 5, (rng() - 0.5) * 5 + 1, (rng() - 0.5) * 5, 0.25, 0.07, 0.02, 1.2, 5, 6, 1, 0, true, 4, 2);
    } else {
      for (let k = 0; k < 6; k++) this.spawn(x, y, z, (rng() - 0.5) * 4, rng() * 3, (rng() - 0.5) * 4, 0.35 + rng() * 0.2, 0.06, 0.03, 1.6, 0.25, 0.12, 1, 4, false, 11, 0.6);
      this.spawn(x, y, z, 0, 0.4, 0, 0.3, 0.12, 0.5, 0.9, 0.16, 0.1, 0.5, 1, false, 0, 2);
    }
    if (head) this.spawn(x, y, z, 0, 0, 0, 0.12, 0.5, 0.9, 7, 6, 3, 1, 2, true);
  },
  shieldBreak(x, y, z) {
    const rng = this.rng;
    this.spawn(x, y, z, 0, 0, 0, 0.3, 0.25, 1.5, 0.45, 1.9, 2.5, 0.7, 3, true);
    for (let k = 0; k < 14; k++) this.spawn(x, y, z, (rng() - 0.5) * 8, (rng() - 0.5) * 8 + 1.5, (rng() - 0.5) * 8, 0.5, 0.09, 0.02, 1, 4.5, 6, 1, 0, true, 9, 1.2);
  },
  explosion(x, y, z) {
    const rng = this.rng;
    this.spawn(x, y + 0.4, z, 0, 0, 0, 0.12, 2.5, 5.5, 9, 6, 2.6, 1, 0, true);
    this.spawn(x, y + 0.3, z, 0, 0, 0, 0.4, 0.8, 9.5, 5, 3.4, 1.6, 0.9, 3, true);
    for (let k = 0; k < 12; k++) {
      const a = rng() * TAU, s = rng() * 3.5;
      this.spawn(x + Math.cos(a) * 0.5, y + 0.5 + rng(), z + Math.sin(a) * 0.5, Math.cos(a) * s, 1.5 + rng() * 3.5, Math.sin(a) * s, 0.35 + rng() * 0.3, 0.8, 2.4, 7, 3.2, 0.9, 0.9, 0, true, -1, 2.5);
    }
    for (let k = 0; k < 14; k++) {
      const a = rng() * TAU, s = 1 + rng() * 4;
      this.spawn(x + Math.cos(a) * 0.8, y + 0.6 + rng() * 1.2, z + Math.sin(a) * 0.8, Math.cos(a) * s, 1 + rng() * 2.5, Math.sin(a) * s, 1.8 + rng() * 1.4, 1.0, 4.2, 0.3, 0.29, 0.28, 0.6, 1, false, -0.6, 1.4);
    }
    for (let k = 0; k < 26; k++) {
      const a = rng() * TAU, s = 4 + rng() * 11;
      this.spawn(x, y + 0.3, z, Math.cos(a) * s, 3 + rng() * 9, Math.sin(a) * s, 0.5 + rng() * 0.6, 0.09, 0.03, 7, 4, 1.2, 1, 0, true, 14, 0.6);
    }
    for (let k = 0; k < 14; k++) {
      const a = rng() * TAU, s = 2 + rng() * 6;
      this.spawn(x, y + 0.2, z, Math.cos(a) * s, 3 + rng() * 6, Math.sin(a) * s, 0.9 + rng() * 0.5, 0.1, 0.07, 0.3, 0.26, 0.2, 1, 4, false, 16, 0.3);
    }
  },
  dust(x, y, z, count, power) {
    const rng = this.rng, c = [0.5, 0.45, 0.35];
    if (typeof Terrain !== 'undefined' && Terrain.col) Terrain.colorAt(x, z, c);
    for (let k = 0; k < count; k++) {
      const a = rng() * TAU, s = (0.5 + rng()) * (power || 1);
      this.spawn(x + Math.cos(a) * 0.2, y + 0.08, z + Math.sin(a) * 0.2, Math.cos(a) * s, 0.3 + rng() * 0.5, Math.sin(a) * s, 0.5 + rng() * 0.4, 0.15, 0.7, c[0] + 0.15, c[1] + 0.15, c[2] + 0.12, 0.3, 1, false, -0.2, 2.5);
    }
  },
  splash(x, z, count) {
    const rng = this.rng;
    for (let k = 0; k < count; k++) {
      const a = rng() * TAU, s = 0.6 + rng() * 1.6;
      this.spawn(x + Math.cos(a) * 0.2, 0.05, z + Math.sin(a) * 0.2, Math.cos(a) * s, 1.5 + rng() * 2, Math.sin(a) * s, 0.5, 0.07, 0.03, 0.85, 0.95, 1, 0.8, 4, false, 9, 0.5);
    }
    this.spawn(x, 0.04, z, 0, 0, 0, 0.5, 0.15, 0.8, 0.8, 0.95, 1, 0.22, 3, false);
  },
  sparkle(x, y, z, r, g, b, count) {
    const rng = this.rng;
    for (let k = 0; k < count; k++) this.spawn(x + (rng() - 0.5) * 0.5, y + rng() * 0.5, z + (rng() - 0.5) * 0.5, (rng() - 0.5) * 1.6, 1 + rng() * 2.2, (rng() - 0.5) * 1.6, 0.5 + rng() * 0.4, 0.09, 0.02, r * 4, g * 4, b * 4, 1, 0, true, 1.5, 1.5);
  },
  ring(x, y, z, r, g, b, size) { this.spawn(x, y, z, 0, 0, 0, 0.45, 0.2, size, r * 3, g * 3, b * 3, 0.9, 3, true); },
  fire(x, y, z, dt) {
    const rng = this.rng;
    if (rng() < dt * 22) this.spawn(x + (rng() - 0.5) * 0.3, y, z + (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3, 0.9 + rng() * 0.9, (rng() - 0.5) * 0.3, 0.5 + rng() * 0.35, 0.34, 0.08, 6, 2.6, 0.6, 0.9, 0, true, -0.5, 0.5);
    if (rng() < dt * 5) this.spawn(x, y + 0.5, z, (rng() - 0.5) * 0.3, 0.9, (rng() - 0.5) * 0.3, 2.4, 0.25, 1.1, 0.35, 0.33, 0.32, 0.3, 1, false, -0.25, 0.4);
    if (rng() < dt * 4) this.spawn(x, y + 0.2, z, (rng() - 0.5) * 1.2, 1.5 + rng() * 1.5, (rng() - 0.5) * 1.2, 1 + rng(), 0.04, 0.01, 8, 3, 0.6, 1, 0, true, -0.4, 0.6);
  },
  // floating motes / snow close to the camera
  ambient(cx, cy, cz, dt, night, high) {
    const rng = this.rng;
    if (rng() < dt * (high ? 30 : 9)) {
      const x = cx + (rng() - 0.5) * 34, y = cy + (rng() - 0.3) * 9, z = cz + (rng() - 0.5) * 34;
      if (high) this.spawn(x, y + 3, z, 0.6 + (rng() - 0.5), -1.1, (rng() - 0.5), 4.5, 0.035, 0.035, 0.95, 0.97, 1, 0.75, 4, false, 0, 0);
      else if (night > 0.5) this.spawn(x, y, z, (rng() - 0.5) * 0.3, 0.12, (rng() - 0.5) * 0.3, 3.5, 0.05, 0.05, 0.5, 3.4, 2.4, 0.9, 0, true, 0, 0);
      else this.spawn(x, y, z, 0.35 + (rng() - 0.5) * 0.3, 0.05, (rng() - 0.5) * 0.3, 4, 0.03, 0.03, 1.1, 1.05, 0.85, 0.5, 0, true, 0, 0);
    }
  },
};
