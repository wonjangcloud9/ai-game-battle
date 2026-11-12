// AURORA FALL — shooting, melee, grenades (no DOM dependencies)
'use strict';

const Combat = {
  nades: [],
  reset() { this.nades = []; },

  _raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const px = ox - cx, py = oy - cy, pz = oz - cz;
    const b = px * dx + py * dy + pz * dz, c = px * px + py * py + pz * pz - r * r;
    if (c > 0 && b > 0) return -1;
    const disc = b * b - c;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t < 0 ? 0 : t;
  },
  // vertical cylinder (no caps)
  _rayCyl(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1) {
    const px = ox - cx, pz = oz - cz, a = dx * dx + dz * dz;
    if (a < 1e-9) return -1;
    const b = px * dx + pz * dz, c = px * px + pz * pz - r * r;
    const disc = b * b - a * c;
    if (disc < 0) return -1;
    let t = (-b - Math.sqrt(disc)) / a;
    if (t < 0) { if (c > 0) return -1; t = 0; }
    const y = oy + dy * t;
    if (y < y0 || y > y1) {
      // entered through the top or bottom plane?
      if (Math.abs(dy) < 1e-6) return -1;
      const tp = ((y < y0 ? y0 : y1) - oy) / dy;
      if (tp < 0) return -1;
      const qx = px + dx * tp, qz = pz + dz * tp;
      if (qx * qx + qz * qz > r * r) return -1;
      return tp;
    }
    return t;
  },

  // Current bullet spread half-angle in degrees (also drives the crosshair).
  spreadOf(ch, def) {
    if (def.kind !== 'gun') return 1.0;
    const sp = Math.hypot(ch.vx, ch.vz);
    let spread = def.spreadMin + ch.bloom + def.moveSpread * clamp01(sp / CFG.RUN_SPEED) + (ch.grounded || ch.swimming ? 0 : 1.6);
    spread = Math.min(spread, def.spreadMax);
    if (ch.in.ads) spread *= def.adsMul; else if (def.hipMin) spread = Math.max(spread, def.hipMin);
    if (ch.crouch) spread *= 0.8;
    return spread;
  },
  // Nearest character hit by a ray (for the crosshair). Returns t or -1; the character is left in Combat.rayVictim.
  rayVictim: null,
  rayChars(ox, oy, oz, dx, dy, dz, maxT, ignore, minT) {
    let best = -1;
    this.rayVictim = null;
    for (const c of Game.chars) {
      if (!c.alive || c === ignore || c.mode === 'plane') continue;
      const cy = c.y + 0.9;
      const tc = (c.x - ox) * dx + (cy - oy) * dy + (c.z - oz) * dz;
      if (tc < (minT || 0) || tc > maxT + 1.2) continue;
      const qx = ox + dx * tc - c.x, qy = oy + dy * tc - cy, qz = oz + dz * tc - c.z;
      if (qx * qx + qy * qy + qz * qz > 1.9) continue;
      let t = this._raySphere(ox, oy, oz, dx, dy, dz, c.x, c.y + (c.swimming ? 1.3 : c.crouch ? 1.12 : 1.62), c.z, 0.25);
      const t2 = this._rayCyl(ox, oy, oz, dx, dy, dz, c.x, c.z, 0.4, c.y + 0.05, c.y + (c.crouch ? 0.98 : 1.44));
      if (t < 0 || (t2 >= 0 && t2 < t)) t = t2;
      if (t >= (minT || 0) && t <= maxT && (best < 0 || t < best)) { best = t; this.rayVictim = c; }
    }
    return best;
  },

  tryFire(ch, pressed) {
    if (ch.switchT > 0 || ch.mode !== 'ground' || ch.throwT > 0.45) return false;
    const w = ch.curWeapon();
    if (!w) return pressed || !ch.isPlayer ? this.melee(ch) : false;
    const def = WEAPONS[w.type];
    if (ch.fireCd > 0) return false;
    if (!def.auto && !pressed) return false;
    if (w.ammo <= 0) { if (pressed) Game.events.emit('empty', ch); ch.startReload(); return false; }
    if (ch.reloadT > 0) { if (def.shellReload) ch.cancelReload(); else return false; }
    if (ch.useT > 0) ch.cancelUse();
    const rng = Game.rng;
    w.ammo--;
    ch.fireCd += def.interval;      // keep the leftover so the fire rate does not depend on the frame rate
    ch.fireHold = 0.35; ch.fireAnim = 0.12; ch.lastShotT = Game.time; ch.sprinting = false;
    const spread = this.spreadOf(ch, def);
    ch.bloom = Math.min(def.spreadMax, ch.bloom + def.bloom);
    // aim ray from the eye
    const ex = ch.x, ey = ch.eyeY(), ez = ch.z;
    const cp = Math.cos(ch.aimPitch);
    let dx = Math.sin(ch.aimYaw) * cp, dy = Math.sin(ch.aimPitch), dz = Math.cos(ch.aimYaw) * cp;
    if (ch.aimPoint) {
      const ax = ch.aimPoint[0] - ex, ay = ch.aimPoint[1] - ey, az = ch.aimPoint[2] - ez, al = Math.hypot(ax, ay, az);
      if (al > 1.2) { dx = ax / al; dy = ay / al; dz = az / al; }
    }
    // muzzle position (for effects only)
    const fx = Math.sin(ch.aimYaw), fz = Math.cos(ch.aimYaw);
    const mx = ex + dx * 0.85 - fz * 0.2, my = ey - 0.17 + dy * 0.85, mz = ez + dz * 0.85 + fx * 0.2;
    // perpendicular basis
    let ux = -dz, uy = 0, uz = dx;
    const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const vx = uy * dz - uz * dy, vy = uz * dx - ux * dz, vz = ux * dy - uy * dx;
    Game.events.emit('shot', ch, def, mx, my, mz, dx, dy, dz);
    for (let p = 0; p < def.pellets; p++) {
      const sr = Math.tan(spread * DEG * Math.sqrt(rng())), th = rng() * TAU;
      const a = Math.cos(th) * sr, b = Math.sin(th) * sr;
      let px = dx + ux * a + vx * b, py = dy + uy * a + vy * b, pz = dz + uz * a + vz * b;
      const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl;
      this.hitscan(ch, ex, ey, ez, px, py, pz, def, w.rarity, mx, my, mz);
    }
    ch.recoilP += def.recoilV * DEG * (ch.in.ads ? 0.7 : 1) * (ch.crouch ? 0.8 : 1);
    ch.recoilY += (rng() - 0.5) * 2 * def.recoilH * DEG;
    Game.noise(ch.x, ch.z, def.loud, ch);
    if (w.ammo <= 0) ch.startReload();
    return true;
  },

  hitscan(ch, ox, oy, oz, dx, dy, dz, def, rarity, mx, my, mz) {
    let tBest = Phys.raycast(ox, oy, oz, dx, dy, dz, def.range, F_BULLET);
    const kind = Phys.hit.kind, nx = Phys.hit.nx, ny = Phys.hit.ny, nz = Phys.hit.nz;
    let victim = null, head = false;
    const chars = Game.chars;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (!c.alive || c === ch || c.mode === 'plane') continue;
      const cy = c.y + 0.9;
      const tc = (c.x - ox) * dx + (cy - oy) * dy + (c.z - oz) * dz;
      if (tc < -1.2 || tc > tBest + 1.2) continue;
      const qx = ox + dx * tc - c.x, qy = oy + dy * tc - cy, qz = oz + dz * tc - c.z;
      if (qx * qx + qy * qy + qz * qz > 1.9) continue;
      const hy = c.y + (c.swimming ? 1.3 : c.crouch ? 1.12 : 1.62);
      let t = this._raySphere(ox, oy, oz, dx, dy, dz, c.x, hy, c.z, 0.25);
      if (t >= 0 && t < tBest) { tBest = t; victim = c; head = true; }
      t = this._rayCyl(ox, oy, oz, dx, dy, dz, c.x, c.z, 0.4, c.y + (c.swimming ? 0.85 : 0.05), c.y + (c.swimming ? 1.2 : c.crouch ? 0.98 : 1.44));
      if (t >= 0 && t < tBest) { tBest = t; victim = c; head = false; }
    }
    const hx = ox + dx * tBest, hy = oy + dy * tBest, hz = oz + dz * tBest;
    Game.events.emit('tracer', def, mx, my, mz, hx, hy, hz, ch);
    if (victim) {
      let dmg = def.dmg * RARITY[rarity].dmg;
      if (tBest > def.falloff0) dmg *= tBest >= def.falloff1 ? def.minMul : lerp(1, def.minMul, (tBest - def.falloff0) / (def.falloff1 - def.falloff0));
      if (head) dmg *= def.head;
      if (victim.isPlayer && !ch.isPlayer) dmg *= Game.playerScale();
      else if (!victim.isPlayer && !ch.isPlayer) dmg *= Game.botScale();
      Game.events.emit('hitChar', victim, ch, hx, hy, hz, head);
      victim.damage(dmg, ch, def.id, head, false);
    } else if (kind) Game.events.emit('impact', hx, hy, hz, nx, ny, nz, kind);
  },

  melee(ch) {
    if (ch.meleeT > 0) return false;
    const F = WEAPONS.fists;
    ch.meleeT = F.rate; ch.meleeAnim = 0.3; ch.fireHold = 0.3;
    const fx = Math.sin(ch.aimYaw), fz = Math.cos(ch.aimYaw);
    let best = null, bd = F.range;
    for (const c of Game.chars) {
      if (!c.alive || c === ch || c.mode !== 'ground') continue;
      const dx = c.x - ch.x, dz = c.z - ch.z, d = Math.hypot(dx, dz);
      if (d < bd && Math.abs(c.y - ch.y) < 1.7 && (d < 0.4 || (dx * fx + dz * fz) / d > 0.4)) { bd = d; best = c; }
    }
    Game.events.emit('melee', ch, best);
    if (best) {
      let dmg = F.dmg;
      if (best.isPlayer && !ch.isPlayer) dmg *= Game.playerScale();
      else if (!best.isPlayer && !ch.isPlayer) dmg *= Game.botScale();
      Game.events.emit('hitChar', best, ch, best.x, best.y + 1.2, best.z, false);
      best.damage(dmg, ch, 'fists', false, false);
    }
    return true;
  },

  throwGrenade(ch) {
    if (ch.grenades <= 0 || ch.throwT > 0 || ch.mode !== 'ground') return false;
    ch.grenades--; ch.throwT = 0.85; ch.fireHold = 0.4;
    ch.cancelUse();
    const ey = ch.eyeY();
    const cp = Math.cos(ch.aimPitch);
    let dx = Math.sin(ch.aimYaw) * cp, dy = Math.sin(ch.aimPitch), dz = Math.cos(ch.aimYaw) * cp;
    if (ch.aimPoint) {
      const ax = ch.aimPoint[0] - ch.x, ay = ch.aimPoint[1] - ey, az = ch.aimPoint[2] - ch.z, al = Math.hypot(ax, ay, az);
      if (al > 1.5) { dx = ax / al; dy = ay / al; dz = az / al; }
    }
    dy += 0.2;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const S = GRENADE.throwSpeed;
    this.nades.push({ x: ch.x + dx * 0.5, y: ey - 0.05, z: ch.z + dz * 0.5, vx: dx * S + ch.vx * 0.5, vy: dy * S + 1.2, vz: dz * S + ch.vz * 0.5, fuse: GRENADE.fuse, owner: ch, rest: false, spin: 0 });
    Game.events.emit('throw', ch);
    return true;
  },

  explode(x, y, z, owner) {
    Game.events.emit('explosion', x, y, z);
    const R = GRENADE.radius;
    for (const c of Game.chars) {
      if (!c.alive || c.mode === 'plane') continue;
      const d = dist3D(x, y, z, c.x, c.y + 0.9, c.z);
      if (d > R) continue;
      if (d > 2.2 && !Phys.segmentClear(x, y + 0.35, z, c.x, c.y + 1.1, c.z)) continue;
      let dmg = GRENADE.dmg * clamp01(1.08 - d / R);
      if (c.isPlayer && owner && !owner.isPlayer) dmg *= Game.playerScale();
      else if (!c.isPlayer && owner && !owner.isPlayer) dmg *= Game.botScale();
      if (dmg > 1) { Game.events.emit('hitChar', c, owner, c.x, c.y + 1.1, c.z, false); c.damage(dmg, owner, 'grenade', false, false); }
    }
    Game.noise(x, z, 160, owner);
  },

  update(dt) {
    const G = CFG.GRAVITY;
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.fuse -= dt;
      if (n.fuse <= 0) { this.explode(n.x, n.y + 0.15, n.z, n.owner); this.nades.splice(i, 1); continue; }
      if (n.rest) continue;
      n.vy -= G * dt; n.spin += dt * 9;
      const sx = n.vx * dt, sy = n.vy * dt, sz = n.vz * dt, len = Math.hypot(sx, sy, sz);
      if (len < 1e-6) continue;
      const dx = sx / len, dy = sy / len, dz = sz / len;
      const t = Phys.raycast(n.x, n.y, n.z, dx, dy, dz, len + 0.13, F_BULLET);
      if (Phys.hit.kind) {
        const h = Phys.hit, back = Math.max(0, t - 0.13);
        n.x += dx * back; n.y += dy * back; n.z += dz * back;
        const vn = n.vx * h.nx + n.vy * h.ny + n.vz * h.nz;
        if (vn < 0) {
          n.vx -= 1.42 * vn * h.nx; n.vy -= 1.42 * vn * h.ny; n.vz -= 1.42 * vn * h.nz;
          n.vx *= 0.74; n.vy *= 0.74; n.vz *= 0.74;
          const speed = Math.hypot(n.vx, n.vy, n.vz);
          if (speed > 2.5) Game.events.emit('bounce', n.x, n.y, n.z);
          if (speed < 1.6 && h.ny > 0.55) { n.rest = true; n.vx = n.vy = n.vz = 0; }
        }
      } else { n.x += sx; n.y += sy; n.z += sz; }
      if (n.y < -3) { n.rest = true; }
    }
  },
};
