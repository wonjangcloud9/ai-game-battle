// AURORA FALL — procedural world: structures, colliders, trees, rocks, loot spots (no DOM dependencies)
'use strict';

const PAL = {
  wood: hexLin(0x8a6242), woodDark: hexLin(0x5e4634), woodLight: hexLin(0xb08a5c), plank: hexLin(0x9c7a52),
  plaster: hexLin(0xe6dfd0), plasterWarm: hexLin(0xe8d2ac), plasterBlue: hexLin(0xb4cad8), plasterGreen: hexLin(0xbcd3ae), plasterPink: hexLin(0xe3bcb0),
  barnRed: hexLin(0x9c2f2a), white: hexLin(0xf0ede6),
  roofSlate: hexLin(0x4a5560), roofTerra: hexLin(0xb5553c), roofTeal: hexLin(0x2f6f73), roofBrown: hexLin(0x6b4a38), roofRed: hexLin(0x8f3a34),
  stone: hexLin(0x8d8a84), stoneDark: hexLin(0x6d6a66), moss: hexLin(0x727d58), concrete: hexLin(0x9d9c97), concreteDark: hexLin(0x77787a),
  metal: hexLin(0x5f7486), metalDark: hexLin(0x3c4854), rust: hexLin(0x9a5a3a), olive: hexLin(0x6a6f45), tarp: hexLin(0x44685c),
  lamp: hexLin(0xffd27a), teal: hexLin(0x35d9bb), orange: hexLin(0xe08a2e), yellow: hexLin(0xe6c23a), red: hexLin(0xc8452f),
  hay: hexLin(0xd9b95a), crop: hexLin(0x7f9a3a), cropDry: hexLin(0xc2a64a), soil: hexLin(0x6a4e36), canvas: hexLin(0xd6c8a4),
  sand: hexLin(0xc9b98f), brick: hexLin(0x9a5a48), black: hexLin(0x24262b), blue: hexLin(0x3a6fb0), green: hexLin(0x3f9a63),
};
const WALL_COLORS = ['plaster', 'plasterWarm', 'plasterBlue', 'plasterGreen', 'plasterPink', 'woodLight'];
const ROOF_COLORS = ['roofSlate', 'roofTerra', 'roofTeal', 'roofBrown', 'roofRed'];
const CONTAINER_COLORS = ['red', 'blue', 'green', 'orange', 'metal', 'yellow', 'rust'];

const World = {
  meshes: [], trees: null, treeCount: 0, rocks: null, rockCount: 0,
  lootSpots: [], chestSpots: [], footprints: [],
  props: { windmills: [], lighthouse: null, campfires: [], beacons: [], monument: null },
};

class Structure {
  constructor(mb, x, y, z, yaw) { this.mb = mb; this.x = x; this.y = y; this.z = z; this.yaw = yaw; this.c = Math.cos(yaw); this.s = Math.sin(yaw); }
  wx(lx, lz) { return this.x + lx * this.c + lz * this.s; }
  wz(lx, lz) { return this.z - lx * this.s + lz * this.c; }
  sub(lx, lz, yaw, dy) { return new Structure(this.mb, this.wx(lx, lz), this.y + (dy || 0), this.wz(lx, lz), this.yaw + (yaw || 0)); }
  // o: { yaw, grad, em, pitch, roll, topCol, solid, vis, flags, noBottom }
  box(lx, ly, lz, sx, sy, sz, col, o) {
    o = o || {};
    const wx = this.wx(lx, lz), wz = this.wz(lx, lz), yaw = this.yaw + (o.yaw || 0);
    if (o.vis !== false) this.mb.box(wx, this.y + ly, wz, sx, sy, sz, yaw, col, { grad: o.grad === undefined ? 0.86 : o.grad, em: o.em, pitch: o.pitch, roll: o.roll, topCol: o.topCol, noBottom: o.noBottom });
    if (o.solid !== false && !o.pitch && !o.roll) Phys.addBox(wx, this.y + ly, wz, sx, sy, sz, yaw, o.flags === undefined ? F_ALL : o.flags);
  }
  cyl(lx, ly, lz, r0, r1, h, sides, col, o) {
    o = o || {};
    const wx = this.wx(lx, lz), wz = this.wz(lx, lz);
    if (o.vis !== false) this.mb.cyl(wx, this.y + ly, wz, r0, r1, h, sides, col, { grad: o.grad === undefined ? 0.85 : o.grad, em: o.em, flat: o.flat, topCol: o.topCol, noBottom: true, yawOff: this.yaw });
    if (o.solid !== false) Phys.addCyl(wx, wz, o.colR || Math.max(r0, r1), this.y + ly, this.y + ly + h, o.flags === undefined ? F_ALL : o.flags);
  }
  beam(ax, ay, az, bx, by, bz, r0, r1, sides, col, o) {
    this.mb.beam(this.wx(ax, az), this.y + ay, this.wz(ax, az), this.wx(bx, bz), this.y + by, this.wz(bx, bz), r0, r1, sides, col, o);
  }
  blob(lx, ly, lz, rx, ry, rz, col, o) { this.mb.blob(this.wx(lx, lz), this.y + ly, this.wz(lx, lz), rx, ry, rz, col, o); }
  gable(lx, ly, lz, w, d, h, col, o) { this.mb.gable(this.wx(lx, lz), this.y + ly, this.wz(lx, lz), w, d, h, this.yaw + ((o && o.yaw) || 0), col, o); }
  // Stairs rising along the ramp's local +x (rotated by yawLocal). open = thin slab with space underneath.
  ramp(lx, lz, len, wid, yawLocal, yLow, yHigh, col, open) {
    const wx = this.wx(lx, lz), wz = this.wz(lx, lz), yaw = this.yaw + yawLocal;
    Phys.addRamp(wx, wz, len, wid, yaw, this.y + Math.min(yLow, yHigh) - 0.4, this.y + yLow, this.y + yHigh, F_ALL, open ? 0.35 : 0);
    const rise = yHigh - yLow, n = Math.max(2, Math.ceil(Math.abs(rise) / 0.27));
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let k = 0; k < n; k++) {
      const u = -len / 2 + (k + 0.5) * len / n, top = yLow + (k + 1) * rise / n;
      const px = wx + u * c, pz = wz - u * s;
      if (open) this.mb.box(px, this.y + top - 0.07, pz, len / n + 0.04, 0.14, wid, yaw, col, { grad: 0.9 });
      else { const base = Math.min(yLow, yHigh) - 0.4; this.mb.box(px, this.y + (top + base) / 2, pz, len / n + 0.02, top - base, wid, yaw, col, { grad: 0.8, noBottom: true }); }
    }
    if (open) {
      const ang = Math.atan2(rise, len), hyp = Math.hypot(rise, len);
      for (const side of [-1, 1]) {
        const ox = side * (wid / 2 - 0.06);
        this.mb.box(wx + ox * s, this.y + (yLow + yHigh) / 2 - 0.2, wz + ox * c, hyp, 0.22, 0.1, yaw, scaleCol(col, 0.7), { roll: ang, grad: 1 });
      }
    }
  }
  // Wall along a local axis-aligned segment with openings [{a, b, y0, y1}] (metres from the start, heights relative to y0).
  wall(x0, z0, x1, z1, y0, h, t, col, ops, o) {
    const alongX = Math.abs(z1 - z0) < 1e-6;
    const L = alongX ? x1 - x0 : z1 - z0;
    const seg = (a, b, ya, yb) => {
      if (b - a < 0.03 || yb - ya < 0.03) return;
      const m = (a + b) / 2;
      if (alongX) this.box(x0 + m, y0 + (ya + yb) / 2, z0, b - a, yb - ya, t, col, o);
      else this.box(x0, y0 + (ya + yb) / 2, z0 + m, t, yb - ya, b - a, col, o);
    };
    const list = (ops || []).filter(Boolean).slice().sort((p, q) => p.a - q.a);
    let cur = 0;
    for (const op of list) {
      seg(cur, op.a, 0, h);
      if (op.y0 > 0) seg(op.a, op.b, 0, op.y0);
      if (op.y1 < h) seg(op.a, op.b, op.y1, h);
      cur = op.b;
    }
    seg(cur, L, 0, h);
  }
  loot(lx, ly, lz, tier, upper) { World.lootSpots.push({ x: this.wx(lx, lz), y: this.y + ly, z: this.wz(lx, lz), tier: tier || 0, upper: !!upper }); }
  chest(lx, ly, lz, yaw, tier, upper) { World.chestSpots.push({ x: this.wx(lx, lz), y: this.y + ly, z: this.wz(lx, lz), yaw: this.yaw + (yaw || 0), tier: tier || 0, upper: !!upper }); }
  footprint(w, d, kind) { World.footprints.push({ x: this.x, z: this.z, w, d, yaw: this.yaw, kind: kind || 0 }); }
}

const WorldGen = {
  build() {
    const rng = this.rng = makeRng(CFG.WORLD_SEED + 7);
    Phys.reset();
    World.meshes = []; World.lootSpots = []; World.chestSpots = []; World.footprints = [];
    World.props = { windmills: [], lighthouse: null, campfires: [], beacons: [], monument: null };
    for (const p of Terrain.pois) {
      const mb = new MeshBuilder();
      const S = new Structure(mb, p.x, p.y, p.z, p.yaw);
      this['poi_' + p.type](S, p, rng);
      World.meshes.push(mb.build());
    }
    for (const s of Terrain.sites) {
      const mb = new MeshBuilder();
      const S = new Structure(mb, s.x, s.y, s.z, s.yaw);
      this['site_' + s.type](S, s, rng);
      World.meshes.push(mb.build());
    }
    this.scatterRocks(rng);
    this.scatterTrees(rng);
    this.scatterGroundLoot(rng);
    Phys.finalize();
  },

  // ------------------------------------------------------------------ helpers
  wins(L, avoid, y0, y1, width) {
    const out = [], n = Math.max(1, Math.floor(L / 3.3));
    width = width || 1.3;
    for (let k = 0; k < n; k++) {
      const c = L * (k + 0.5) / n, a = c - width / 2, b = c + width / 2;
      if (a < 0.5 || b > L - 0.5) continue;
      if (avoid && b > avoid.a - 0.45 && a < avoid.b + 0.45) continue;
      out.push({ a, b, y0: y0 === undefined ? 1.0 : y0, y1: y1 === undefined ? 2.15 : y1 });
    }
    return out;
  },
  roof(S, w, d, top, col, wallCol, gh) {
    S.box(0, top + 0.12, 0, w + 0.6, 0.24, d + 0.6, scaleCol(col, 0.78), { grad: 1 });
    S.box(0, top - 0.03, 0, w - 0.4, 0.06, d - 0.4, PAL.woodLight, { grad: 1, solid: false });      // ceiling
    if (gh > 0) {
      if (w >= d) S.gable(0, top + 0.24, 0, w + 0.9, d + 0.9, gh, col, { endCol: wallCol });
      else S.gable(0, top + 0.24, 0, d + 0.9, w + 0.9, gh, col, { endCol: wallCol, yaw: Math.PI / 2 });
    }
  },
  crate(S, lx, lz, size, rng, stack) {
    const col = rng.chance(0.25) ? PAL.tarp : rng.chance(0.5) ? PAL.wood : PAL.woodLight;
    const yaw = rng.range(-0.3, 0.3);
    S.box(lx, size / 2, lz, size, size, size, col, { yaw, topCol: scaleCol(col, 1.15), flags: size > 1.3 ? F_ALL : (F_SOLID | F_BULLET) });
    if (stack) S.box(lx + rng.range(-0.1, 0.1), size + size * 0.4, lz, size * 0.8, size * 0.8, size * 0.8, PAL.woodLight, { yaw: yaw + 0.4, flags: F_SOLID | F_BULLET });
  },
  barrel(S, lx, lz, rng) { S.cyl(lx, 0, lz, 0.42, 0.42, 1.05, 8, rng.chance(0.5) ? PAL.rust : PAL.metal, { flags: F_SOLID | F_BULLET, topCol: PAL.metalDark }); },
  lampPost(S, lx, lz) {
    S.box(lx, 1.8, lz, 0.14, 3.6, 0.14, PAL.metalDark, { solid: false, grad: 1 });
    S.box(lx, 3.7, lz, 0.5, 0.28, 0.5, PAL.lamp, { solid: false, em: 1, grad: 1 });
  },
  fence(S, x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.4));
    const yaw = Math.atan2(-(z1 - z0), x1 - x0); // local yaw so the box's x axis follows the segment
    for (let k = 0; k <= n; k++) S.box(lerp(x0, x1, k / n), 0.55, lerp(z0, z1, k / n), 0.13, 1.1, 0.13, PAL.woodDark, { solid: false, grad: 0.9 });
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    S.box(mx, 0.9, mz, len, 0.09, 0.06, PAL.wood, { yaw, solid: false, grad: 1 });
    S.box(mx, 0.5, mz, len, 0.09, 0.06, PAL.wood, { yaw, solid: false, grad: 1 });
    S.box(mx, 0.5, mz, len, 1.0, 0.16, PAL.wood, { yaw, vis: false, flags: F_SOLID | F_NAV });
  },
  lowWall(S, x0, z0, x1, z1, h, col) {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
    S.box((x0 + x1) / 2, h / 2 - 0.2, (z0 + z1) / 2, len, h + 0.4, 0.5, col || PAL.stone, { yaw, grad: 0.8, topCol: scaleCol(col || PAL.stone, 1.1) });
  },
  sandbags(S, lx, lz, yaw, len) {
    S.box(lx, 0.3, lz, len, 0.6, 0.8, PAL.sand, { yaw, grad: 0.8 });
    S.box(lx, 0.8, lz, len - 0.3, 0.45, 0.62, scaleCol(PAL.sand, 0.92), { yaw, grad: 0.9 });
  },
  hayBale(S, lx, lz) { S.cyl(lx, 0, lz, 0.8, 0.8, 1.25, 10, PAL.hay, { topCol: scaleCol(PAL.hay, 1.1) }); },
  stump(S, lx, lz, rng) { S.cyl(lx, -0.2, lz, 0.5, 0.42, 0.7, 7, PAL.woodDark, { topCol: PAL.woodLight, flags: F_SOLID | F_BULLET }); },
  logPile(S, lx, lz, yaw, rng) {
    const P = S.sub(lx, lz, yaw);
    const L = 4.6, r = 0.36;
    const rows = [[-0.74, 0, 0.74], [-0.37, 0.37], [0]];
    rows.forEach((row, ri) => row.forEach(off => P.beam(-L / 2, r + ri * 0.62, off, L / 2, r + ri * 0.62, off, r, r, 7, PAL.wood, { capCol: PAL.woodLight })));
    P.box(0, 0.85, 0, L, 1.7, 2.1, PAL.wood, { vis: false });
  },
  tent(S, lx, lz, yaw, col) {
    const P = S.sub(lx, lz, yaw);
    P.gable(0, 0, 0, 3.4, 3.0, 1.9, col, { endCol: scaleCol(col, 0.7), noBottom: true });
    P.box(0, 0.8, 0, 3.2, 1.6, 2.2, col, { vis: false });
  },
  campfire(S, lx, lz) {
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; S.blob(lx + Math.cos(a) * 0.75, 0.1, lz + Math.sin(a) * 0.75, 0.24, 0.18, 0.24, PAL.stoneDark, { detail: 0, flat: true }); }
    S.beam(lx - 0.5, 0.15, lz - 0.2, lx + 0.5, 0.3, lz + 0.2, 0.11, 0.11, 5, PAL.woodDark);
    S.beam(lx - 0.2, 0.15, lz + 0.5, lx + 0.2, 0.3, lz - 0.5, 0.11, 0.11, 5, PAL.woodDark);
    S.blob(lx, 0.2, lz, 0.3, 0.2, 0.3, PAL.orange, { detail: 0, flat: true, em: 2 });
    World.props.campfires.push({ x: S.wx(lx, lz), y: S.y + 0.3, z: S.wz(lx, lz) });
  },
  mast(S, lx, lz, h) {
    S.beam(lx, 0, lz, lx, h, lz, 0.28, 0.08, 5, PAL.metal, { noCaps: true });
    for (let k = 1; k <= 3; k++) S.box(lx, h * k / 4, lz, 1.4 - k * 0.3, 0.08, 0.08, PAL.metalDark, { solid: false, grad: 1 });
    S.blob(lx, h + 0.2, lz, 0.3, 0.3, 0.3, PAL.red, { detail: 0, em: 2 });
    Phys.addCyl(S.wx(lx, lz), S.wz(lx, lz), 0.3, S.y, S.y + h, F_SOLID | F_BULLET);
    World.props.beacons.push({ x: S.wx(lx, lz), y: S.y + h + 0.2, z: S.wz(lx, lz), color: 0xff4030 });
  },

  // ------------------------------------------------------------------ buildings
  house(S, rng, w, d, h, o) {
    o = o || {};
    const t = 0.3, fl = 0.25, wallC = o.wall || PAL[rng.pick(WALL_COLORS)], roofC = o.roof || PAL[rng.pick(ROOF_COLORS)];
    S.footprint(w, d);
    S.box(0, fl - 1.25, 0, w + 0.3, 2.5, d + 0.3, o.base || PAL.stone, { grad: 0.8, topCol: PAL.plank });
    const da = w / 2 - 1.2 + (o.doorOff || 0);
    const door = { a: da, b: da + 2.4, y0: 0, y1: 2.35 };
    S.wall(-w / 2, d / 2 - t / 2, w / 2, d / 2 - t / 2, fl, h, t, wallC, [door].concat(this.wins(w, door)));
    const bdoor = o.backDoor ? { a: w / 2 - 1.2 - (o.doorOff || 0), b: w / 2 + 1.2 - (o.doorOff || 0), y0: 0, y1: 2.35 } : null;
    S.wall(-w / 2, -d / 2 + t / 2, w / 2, -d / 2 + t / 2, fl, h, t, wallC, [bdoor].concat(this.wins(w, bdoor)));
    S.wall(-w / 2 + t / 2, -d / 2 + t, -w / 2 + t / 2, d / 2 - t, fl, h, t, wallC, this.wins(d - 2 * t));
    S.wall(w / 2 - t / 2, -d / 2 + t, w / 2 - t / 2, d / 2 - t, fl, h, t, wallC, this.wins(d - 2 * t));
    this.roof(S, w, d, fl + h, roofC, wallC, o.flat ? 0 : (o.gh || Math.min(w, d) * 0.34));
    if (!o.flat && rng.chance(0.7)) S.box(w * 0.26, fl + h + 1.1, -d * 0.18, 0.7, 2.0, 0.7, PAL.brick, { solid: false });
    S.box(da + 1.2 - w / 2, fl - 0.16, d / 2 + 0.62, 2.6, 0.28, 0.9, PAL.stone, { grad: 0.9 });       // door step
    S.box(0, fl + h - 0.22, 0, 0.36, 0.2, 0.36, PAL.lamp, { solid: false, em: 1, grad: 1 });           // ceiling lamp
    S.box(-w / 2 + 1.25, fl + 0.42, -d / 2 + 0.95, 1.5, 0.84, 0.8, PAL.woodDark, { flags: F_SOLID | F_BULLET }); // table
    const n = o.loot === undefined ? 2 : o.loot;
    for (let k = 0; k < n; k++) S.loot(rng.range(-w / 2 + 1.0, w / 2 - 1.0), fl, rng.range(-d / 2 + 2.0, d / 2 - 1.0), o.tier || 0);
    if (rng.chance(o.chest === undefined ? 0.3 : o.chest)) S.chest(w / 2 - 1.0, fl, -d / 2 + 1.0, -0.6, o.tier || 0);
  },
  house2(S, rng, o) {
    o = o || {};
    const w = 10, d = 8, h1 = 3.0, h2 = 2.9, t = 0.3, fl = 0.25, slab = 0.25, f2 = fl + h1 + slab;
    const wallC = o.wall || PAL[rng.pick(WALL_COLORS)], roofC = o.roof || PAL[rng.pick(ROOF_COLORS)];
    S.footprint(w, d, 1);
    S.box(0, fl - 1.25, 0, w + 0.3, 2.5, d + 0.3, PAL.stone, { grad: 0.8, topCol: PAL.plank });
    const door = { a: w / 2 - 1.2 + 2.0, b: w / 2 + 1.2 + 2.0, y0: 0, y1: 2.35 };
    const H1 = h1 + slab;
    // ground floor
    S.wall(-w / 2, d / 2 - t / 2, w / 2, d / 2 - t / 2, fl, H1, t, wallC, [door].concat(this.wins(w, door)));
    S.wall(-w / 2, -d / 2 + t / 2, w / 2, -d / 2 + t / 2, fl, H1, t, wallC, []);
    S.wall(-w / 2 + t / 2, -d / 2 + t, -w / 2 + t / 2, d / 2 - t, fl, H1, t, wallC, this.wins(d - 2 * t));
    S.wall(w / 2 - t / 2, -d / 2 + t, w / 2 - t / 2, d / 2 - t, fl, H1, t, wallC, this.wins(d - 2 * t));
    // upper floor
    const upC = scaleCol(wallC, 0.93);
    S.wall(-w / 2, d / 2 - t / 2, w / 2, d / 2 - t / 2, f2, h2, t, upC, this.wins(w, null, 0.95, 2.1, 1.5));
    S.wall(-w / 2, -d / 2 + t / 2, w / 2, -d / 2 + t / 2, f2, h2, t, upC, this.wins(w, null, 0.95, 2.1, 1.5));
    S.wall(-w / 2 + t / 2, -d / 2 + t, -w / 2 + t / 2, d / 2 - t, f2, h2, t, upC, this.wins(d - 2 * t, null, 0.95, 2.1));
    S.wall(w / 2 - t / 2, -d / 2 + t, w / 2 - t / 2, d / 2 - t, f2, h2, t, upC, this.wins(d - 2 * t, null, 0.95, 2.1));
    // stairs along the back wall, rising toward +x
    const rampLen = 5.2, rampW = 1.3, rx0 = -w / 2 + t + 1.1, rz = -d / 2 + t + rampW / 2;
    S.ramp(rx0 + rampLen / 2, rz, rampLen, rampW, 0, fl, f2, PAL.wood, false);
    const zA = -d / 2 + t + rampW + 0.1, zB = d / 2 - t;
    S.box(0, f2 - slab / 2, (zA + zB) / 2, w - 2 * t, slab, zB - zA, PAL.plank, { grad: 0.8 });
    const lx0 = rx0 + rampLen, lx1 = w / 2 - t;
    S.box((lx0 + lx1) / 2, f2 - slab / 2, (-d / 2 + t + zA) / 2, lx1 - lx0, slab, zA - (-d / 2 + t), PAL.plank, { grad: 0.8 });
    S.box(rx0 + rampLen / 2, f2 + 0.5, zA, rampLen, 1.0, 0.1, PAL.woodDark, { flags: F_SOLID | F_BULLET }); // railing by the stairwell
    this.roof(S, w, d, f2 + h2, roofC, upC, 2.6);
    S.box(door.a + 1.2 - w / 2, fl - 0.16, d / 2 + 0.62, 2.6, 0.28, 0.9, PAL.stone, { grad: 0.9 });
    S.box(1.5, fl + h1 - 0.2, 1.0, 0.36, 0.2, 0.36, PAL.lamp, { solid: false, em: 1, grad: 1 });
    S.box(0, f2 + h2 - 0.22, 1.0, 0.36, 0.2, 0.36, PAL.lamp, { solid: false, em: 1, grad: 1 });
    S.box(w / 2 - 1.3, fl + 0.42, d / 2 - 1.1, 1.6, 0.84, 0.8, PAL.woodDark, { flags: F_SOLID | F_BULLET });
    S.loot(rng.range(0, w / 2 - 1.2), fl, rng.range(-0.5, d / 2 - 1.3), o.tier || 1);
    S.loot(rng.range(-w / 2 + 1.2, -0.5), fl, rng.range(0.5, d / 2 - 1.3), o.tier || 1);
    S.loot(rng.range(-w / 2 + 1.2, w / 2 - 1.2), f2, rng.range(0.2, d / 2 - 1.2), o.tier || 1, true);
    S.loot(w / 2 - 1.4, f2, -d / 2 + 1.1, o.tier || 1, true);
    if (rng.chance(0.55)) S.chest(-w / 2 + 1.1, f2, d / 2 - 1.1, 2.4, o.tier || 1, true);
  },
  // Flat-roofed shop with outside stairs up to a parapet roof
  shop(S, rng, o) {
    o = o || {};
    const w = 11, d = 8, h = 3.4, t = 0.3, fl = 0.25, R = fl + h + 0.24;
    const wallC = o.wall || PAL[rng.pick(['plasterWarm', 'plaster', 'plasterBlue', 'brick'])];
    S.footprint(w + 1.5, d, 1);
    S.box(0, fl - 1.25, 0, w + 0.3, 2.5, d + 0.3, PAL.stone, { grad: 0.8, topCol: PAL.concrete });
    const front = { a: 1.4, b: w - 1.4, y0: 0, y1: 2.6 };
    S.wall(-w / 2, d / 2 - t / 2, w / 2, d / 2 - t / 2, fl, h, t, wallC, [front]);
    const bd = { a: 1.2, b: 3.6, y0: 0, y1: 2.35 };
    S.wall(-w / 2, -d / 2 + t / 2, w / 2, -d / 2 + t / 2, fl, h, t, wallC, [bd].concat(this.wins(w, bd)));
    S.wall(-w / 2 + t / 2, -d / 2 + t, -w / 2 + t / 2, d / 2 - t, fl, h, t, wallC, this.wins(d - 2 * t));
    S.wall(w / 2 - t / 2, -d / 2 + t, w / 2 - t / 2, d / 2 - t, fl, h, t, wallC, []);
    S.box(0, fl + h + 0.12, 0, w + 0.3, 0.24, d + 0.3, PAL.concreteDark, { grad: 1, topCol: PAL.concrete });
    // parapet (gap at the stair head on the +x side, toward -z)
    const pc = scaleCol(wallC, 0.9), ph = 0.95, pt = 0.25;
    S.wall(-w / 2, d / 2 - pt / 2, w / 2, d / 2 - pt / 2, R, ph, pt, pc, []);
    S.wall(-w / 2, -d / 2 + pt / 2, w / 2, -d / 2 + pt / 2, R, ph, pt, pc, []);
    S.wall(-w / 2 + pt / 2, -d / 2 + pt, -w / 2 + pt / 2, d / 2 - pt, R, ph, pt, pc, []);
    S.wall(w / 2 - pt / 2, -d / 2 + pt, w / 2 - pt / 2, d / 2 - pt, R, ph, pt, pc, [{ a: 0.1, b: 1.9, y0: 0, y1: ph }]);
    // exterior stairs on the +x side rising toward -z
    const sl = 6.4;
    S.ramp(w / 2 + 0.85, -d / 2 + 0.3 + sl / 2, sl, 1.4, Math.PI / 2, 0.0, R, PAL.concrete, false);
    S.box(0, fl + 2.75, d / 2 + 0.75, w - 2.0, 0.14, 1.5, PAL[rng.pick(['roofTeal', 'roofTerra', 'orange', 'blue'])], { solid: false, grad: 1 }); // awning
    S.box(0, fl + 0.5, d / 2 - 2.4, 4.2, 1.0, 0.8, PAL.woodDark, {});                                 // counter
    S.box(-w / 2 + 0.9, fl + 1.0, -d / 2 + 1.6, 1.2, 2.0, 2.2, PAL.wood, { flags: F_SOLID | F_BULLET }); // shelf
    S.box(0, fl + h - 0.22, 0, 0.36, 0.2, 0.36, PAL.lamp, { solid: false, em: 1, grad: 1 });
    S.loot(rng.range(-2.5, 3.5), fl, rng.range(-d / 2 + 1.2, 0), o.tier || 1);
    S.loot(rng.range(-3, 3.5), fl, rng.range(0.3, d / 2 - 3.2), o.tier || 1);
    S.loot(rng.range(-w / 2 + 1.5, w / 2 - 2.5), R, rng.range(-1, d / 2 - 1.5), o.tier || 1, true);
    if (rng.chance(0.45)) S.chest(-w / 2 + 1.2, R, d / 2 - 1.2, 2.2, o.tier || 1, true);
    else if (rng.chance(0.5)) S.chest(w / 2 - 1.1, fl, -d / 2 + 1.1, -0.7, o.tier || 1);
  },
  warehouse(S, rng, o) {
    o = o || {};
    const w = 15, d = 22, h = 6.0, t = 0.35, fl = 0.2;
    const wallC = o.wall || PAL[rng.pick(['metal', 'rust', 'olive', 'concrete'])];
    S.footprint(w, d, 2);
    S.box(0, fl - 1.1, 0, w + 0.4, 2.2, d + 0.4, PAL.concreteDark, { grad: 0.8, topCol: PAL.concrete });
    const big = { a: w / 2 - 2.7, b: w / 2 + 2.7, y0: 0, y1: 4.2 };
    S.wall(-w / 2, d / 2 - t / 2, w / 2, d / 2 - t / 2, fl, h, t, wallC, [big]);
    S.wall(-w / 2, -d / 2 + t / 2, w / 2, -d / 2 + t / 2, fl, h, t, wallC, [big]);
    const hi = this.wins(d - 2 * t, null, 3.4, 4.7, 2.0);
    const side = { a: 4, b: 6.4, y0: 0, y1: 2.4 };
    S.wall(-w / 2 + t / 2, -d / 2 + t, -w / 2 + t / 2, d / 2 - t, fl, h, t, wallC, hi);
    S.wall(w / 2 - t / 2, -d / 2 + t, w / 2 - t / 2, d / 2 - t, fl, h, t, wallC, [side].concat(hi.filter(q => q.a > side.b + 0.5)));
    this.roof(S, w, d, fl + h, scaleCol(wallC, 0.75), wallC, 2.0);
    for (const [cx, cz, st] of [[-5, -7, 1], [-5, -4.6, 0], [4.6, 6, 1], [5, -8, 0], [-4.8, 5.5, 0], [0.5, 0.8, 1], [-5.2, 8.2, 0]]) this.crate(S, cx, cz, rng.range(1.3, 1.8), rng, st);
    S.box(w / 2 - 1.0, fl + 1.25, -3.5, 1.1, 2.5, 6.5, PAL.metalDark, {});
    for (const lz of [-6, 0, 6]) S.box(0, fl + h - 0.3, lz, 0.5, 0.2, 0.5, PAL.lamp, { solid: false, em: 1, grad: 1 });
    for (let k = 0; k < 5; k++) S.loot(rng.range(-w / 2 + 1.5, w / 2 - 2.6), fl, rng.range(-d / 2 + 1.5, d / 2 - 1.5), o.tier || 1);
    S.chest(-w / 2 + 1.2, fl, -d / 2 + 1.4, 0.8, o.tier || 1);
    if (rng.chance(0.5)) S.chest(2.5, fl, d / 2 - 3.5, 3.1, o.tier || 1);
  },
  container(S, rng, col, stacked, loot) {
    const L = 6.1, W = 2.5, H = 2.6, t = 0.12;
    col = col || PAL[rng.pick(CONTAINER_COLORS)];
    const dk = scaleCol(col, 0.72);
    S.box(0, 0.09, 0, W, 0.18, L, dk, { grad: 1 });
    S.box(-W / 2 + t / 2, 0.18 + (H - 0.18) / 2, 0, t, H - 0.18, L, col, { grad: 0.8 });
    S.box(W / 2 - t / 2, 0.18 + (H - 0.18) / 2, 0, t, H - 0.18, L, col, { grad: 0.8 });
    S.box(0, 0.18 + (H - 0.18) / 2, -L / 2 + t / 2, W - 2 * t, H - 0.18, t, col, { grad: 0.8 });
    S.box(0, H + 0.05, 0, W, 0.1, L, dk, { grad: 1 });
    for (let k = -2; k <= 2; k++) for (const sx of [-1, 1]) S.box(sx * (W / 2 + 0.03), H / 2 + 0.1, k * 1.15, 0.06, H - 0.3, 0.16, dk, { solid: false, grad: 1 });
    if (stacked) {
      const c2 = PAL[rng.pick(CONTAINER_COLORS)];
      S.box(rng.range(-0.15, 0.15), H + 0.1 + H / 2, rng.range(-0.3, 0.3), W, H, L, c2, { grad: 0.8, yaw: rng.range(-0.05, 0.05) });
    }
    if (loot) S.loot(0, 0.18, -L / 2 + 1.4, loot - 1);
  },
  tower(S, rng, o) {
    o = o || {};
    const ph = 6.0, ps = 4.2, wd = PAL.woodDark;
    const q = ps / 2 - 0.2;
    for (const [lx, lz] of [[-q, -q], [q, -q], [q, q], [-q, q]]) S.box(lx, ph / 2, lz, 0.34, ph, 0.34, wd, { flags: F_SOLID | F_BULLET });
    S.beam(-q, 0.4, -q, q, ph - 0.6, -q, 0.09, 0.09, 4, wd, { noCaps: true }); S.beam(q, 0.4, q, -q, ph - 0.6, q, 0.09, 0.09, 4, wd, { noCaps: true });
    S.beam(-q, 0.4, q, -q, ph - 0.6, -q, 0.09, 0.09, 4, wd, { noCaps: true });
    S.box(0, ph - 0.12, 0, ps, 0.24, ps, PAL.plank, { grad: 0.8 });
    const rt = 0.12, rh = 1.0;
    S.wall(-ps / 2, ps / 2 - rt / 2, ps / 2, ps / 2 - rt / 2, ph, rh, rt, PAL.wood, []);
    S.wall(-ps / 2, -ps / 2 + rt / 2, ps / 2, -ps / 2 + rt / 2, ph, rh, rt, PAL.wood, []);
    S.wall(-ps / 2 + rt / 2, -ps / 2 + rt, -ps / 2 + rt / 2, ps / 2 - rt, ph, rh, rt, PAL.wood, []);
    S.wall(ps / 2 - rt / 2, -ps / 2 + rt, ps / 2 - rt / 2, ps / 2 - rt, ph, rh, rt, PAL.wood, [{ a: ps - 2 * rt - 1.5, b: ps - 2 * rt - 0.05, y0: 0, y1: rh }]);
    for (const [lx, lz] of [[-q, -q], [q, -q], [q, q], [-q, q]]) S.box(lx, ph + 1.1, lz, 0.16, 2.2, 0.16, wd, { solid: false });
    S.box(0, ph + 2.3, 0, ps + 0.8, 0.16, ps + 0.8, PAL.roofBrown, { grad: 1, flags: F_SOLID | F_BULLET });
    S.gable(0, ph + 2.38, 0, ps + 1.0, ps + 1.0, 1.1, PAL.roofBrown, {});
    // open stairs on the +x side, rising toward the tower
    const rl = 8.6;
    S.ramp(ps / 2 + rl / 2, ps / 2 - 0.85, rl, 1.3, Math.PI, -0.5, ph, PAL.wood, true);
    S.loot(rng.range(-1, 1), ph, rng.range(-1.2, 0.2), o.tier || 1, true);
    if (rng.chance(0.6)) S.loot(-1.2, ph, 1.0, o.tier || 1, true);
    if (rng.chance(0.4)) S.chest(-1.2, ph, -1.2, 0.8, o.tier || 1, true);
  },
  pier(mb, x, z, yaw, length, deckY, width) {
    // march from (x, z) along yaw until the ground drops below the deck, then build outward
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    let t = 0;
    while (t < 140 && Terrain.height(x + dx * t, z + dz * t) > deckY - 0.15) t += 1;
    if (t >= 140) return null;
    const start = t - 2.5;
    const S = new Structure(mb, x + dx * start, deckY, z + dz * start, yaw);
    S.box(0, -0.15, length / 2, width, 0.3, length, PAL.plank, { grad: 0.85, topCol: scaleCol(PAL.plank, 1.08) });
    for (let k = 0; k <= length; k += 5.5) for (const sx of [-1, 1]) S.beam(sx * (width / 2 - 0.25), -5, k + 0.4, sx * (width / 2 - 0.25), 0.55, k + 0.4, 0.2, 0.2, 6, PAL.woodDark);
    for (let k = 1; k < length; k += 1.3) S.box(0, 0.005, k, width, 0.012, 0.05, scaleCol(PAL.plank, 0.7), { solid: false, grad: 1 });
    S.loot(0, 0, length - 1.6, 0);
    return S;
  },

  // ------------------------------------------------------------------ points of interest
  poi_town(S, p, rng) {
    // central plaza with the aurora monument
    S.cyl(0, 0, 0, 4.2, 4.0, 0.45, 12, PAL.stone, { topCol: PAL.concrete });
    S.cyl(0, 0.45, 0, 2.6, 2.4, 0.5, 12, PAL.stoneDark, { topCol: PAL.stone, colR: 2.6 });
    S.cyl(0, 0.95, 0, 1.05, 0.38, 8.5, 4, PAL.stoneDark, { flat: true, colR: 0.9 });
    S.blob(0, 10.3, 0, 0.75, 1.5, 0.75, PAL.teal, { detail: 0, flat: true, em: 2 });
    World.props.monument = { x: S.x, y: S.y + 10.3, z: S.z };
    World.props.beacons.push({ x: S.x, y: S.y + 10.3, z: S.z, color: 0x35d9bb });
    const stallCols = [PAL.red, PAL.blue, PAL.yellow, PAL.green, PAL.orange, PAL.roofTeal];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU + 0.4, P = S.sub(Math.sin(a) * 11, Math.cos(a) * 11, a + Math.PI);
      for (const [lx, lz] of [[-1.4, -0.9], [1.4, -0.9], [1.4, 0.9], [-1.4, 0.9]]) P.box(lx, 1.2, lz, 0.1, 2.4, 0.1, PAL.woodDark, { solid: false });
      P.box(0, 2.45, 0, 3.2, 0.12, 2.2, stallCols[k], { solid: false, grad: 1 });
      P.box(0, 0.45, 0.2, 2.8, 0.9, 0.8, PAL.wood, {});
      if (rng.chance(0.5)) P.loot(0, 0, -1.4, 1);
    }
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; this.lampPost(S, Math.sin(a) * 16.5, Math.cos(a) * 16.5); }
    const inner = ['house2', 'shop', 'house2', 'house', 'shop', 'house2', 'house', 'shop'];
    inner.forEach((type, k) => {
      const a = k / 8 * TAU + 0.2, P = S.sub(Math.sin(a) * 31, Math.cos(a) * 31, a + Math.PI + rng.range(-0.08, 0.08));
      if (type === 'house2') this.house2(P, rng, { tier: 1 });
      else if (type === 'shop') this.shop(P, rng, { tier: 1 });
      else this.house(P, rng, 8.5, 7, 3.2, { tier: 1 });
    });
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * TAU + 0.52, R = 52 + rng.range(-2, 2), P = S.sub(Math.sin(a) * R, Math.cos(a) * R, a + Math.PI + rng.range(-0.25, 0.25));
      if (k % 3 === 1) { this.container(P, rng, null, false, 2); const P2 = P.sub(3.4, 0.5, 0.2); this.container(P2, rng, null, rng.chance(0.5), 0); }
      else this.house(P, rng, rng.range(6.5, 8), rng.range(5.6, 6.6), 3.0, { tier: 1, loot: 2 });
    }
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU + 0.6, R = 20.5;
      if (k % 2) this.lowWall(S, Math.sin(a) * R - 2 * Math.cos(a), Math.cos(a) * R + 2 * Math.sin(a), Math.sin(a) * R + 2 * Math.cos(a), Math.cos(a) * R - 2 * Math.sin(a), 1.05);
      else { this.crate(S, Math.sin(a) * R, Math.cos(a) * R, 1.2, rng, rng.chance(0.4)); this.barrel(S, Math.sin(a) * R + 1.3, Math.cos(a) * R + 0.4, rng); }
    }
    for (let k = 0; k < 6; k++) { const a = rng() * TAU, R = rng.range(14, 24); S.loot(Math.sin(a) * R, 0, Math.cos(a) * R, 1); }
    S.chest(3.6, 0.45, 0.4, -1.4, 2);
  },
  poi_village(S, p, rng) {
    S.cyl(0, 0, 0, 1.3, 1.3, 0.9, 10, PAL.stone, { topCol: PAL.stoneDark });
    for (const sx of [-1, 1]) S.box(sx * 1.2, 1.4, 0, 0.14, 2.8, 0.14, PAL.woodDark, { solid: false });
    S.gable(0, 2.7, 0, 3.2, 1.8, 0.8, PAL.roofBrown, {});
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU + 0.3, R = 27 + (k % 2) * 9, P = S.sub(Math.sin(a) * R, Math.cos(a) * R, a + Math.PI + rng.range(-0.3, 0.3));
      if (k === 3) this.house2(P, rng, { tier: 1 });
      else this.house(P, rng, rng.range(6.6, 8.6), rng.range(5.6, 7), 3.0, { tier: 1, wall: PAL[rng.pick(['woodLight', 'plaster', 'plasterWarm', 'plasterGreen'])] });
      if (k % 2 === 0) { const F = P.sub(0, 0, 0); this.fence(F, -6.5, 6, -6.5, 12); this.fence(F, -6.5, 12, -1.6, 12); }
    }
    // meeting hall
    const H = S.sub(Math.sin(5.6) * 16, Math.cos(5.6) * 16, 5.6 + Math.PI);
    this.house(H, rng, 8, 12, 4.4, { tier: 1, loot: 3, chest: 1, wall: PAL.plaster, roof: PAL.roofTeal, gh: 3.6, backDoor: true });
    H.box(0, 9.6, -3, 1.6, 3.0, 1.6, PAL.plaster, { solid: false }); H.gable(0, 11.1, -3, 2.2, 2.2, 1.6, PAL.roofTeal, {});
    for (let k = 0; k < 5; k++) { const a = rng() * TAU, R = rng.range(8, 20); if (rng.chance(0.5)) this.crate(S, Math.sin(a) * R, Math.cos(a) * R, 1.1, rng); else this.hayBale(S, Math.sin(a) * R, Math.cos(a) * R); S.loot(Math.sin(a) * R + 1.6, 0, Math.cos(a) * R + 0.6, 0); }
    this.lampPost(S, 4, 4); this.lampPost(S, -5, -3);
  },
  poi_harbor(S, p, rng) {
    // +z is seaward
    const w1 = S.sub(-30, -2, Math.PI / 2); this.warehouse(w1, rng, { tier: 1 });
    const w2 = S.sub(31, -10, -Math.PI / 2); this.warehouse(w2, rng, { tier: 1 });
    for (const [lx, lz, yaw] of [[-22, -38, 0], [-2, -42, 0.1], [18, -40, -0.1], [-44, -24, Math.PI / 2]]) {
      const P = S.sub(lx, lz, yaw);
      if (lx === -2) this.house2(P, rng, { tier: 1 }); else this.house(P, rng, rng.range(7, 8.5), rng.range(6, 7), 3.1, { tier: 1 });
    }
    this.shop(S.sub(-42, 22, Math.PI / 2), rng, { tier: 1 });
    // container yard
    let ci = 0;
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) {
      if (rng.chance(0.15)) continue;
      const P = S.sub(10 + k * 3.3 + (row === 1 ? 0.6 : 0), 12 + row * 7.6, (row % 2 ? Math.PI : 0) + rng.range(-0.03, 0.03));
      this.container(P, rng, null, rng.chance(0.3), (ci++ % 3 === 0) ? 2 : 0);
    }
    // crane
    const C = S.sub(-14, 26, 0);
    for (const sx of [-1, 1]) C.box(sx * 5, 7, 0, 1.0, 14, 1.0, PAL.yellow, { grad: 0.8 });
    C.box(0, 14.5, 4, 11.4, 1.1, 1.1, PAL.yellow, { solid: false }); C.box(0, 14.5, 3, 1.2, 1.2, 22, PAL.yellow, { solid: false });
    C.box(0, 13.2, -2, 2.4, 1.8, 2.4, PAL.metalDark, { solid: false }); C.box(0, 9.5, 12, 0.12, 9, 0.12, PAL.black, { solid: false, grad: 1 }); C.box(0, 4.8, 12, 0.9, 0.6, 0.9, PAL.rust, { solid: false });
    World.props.beacons.push({ x: C.wx(0, 14), y: C.y + 15.3, z: C.wz(0, 14), color: 0xff4030 });
    for (let k = 0; k < 7; k++) { const lx = rng.range(-24, 6), lz = rng.range(8, 30); if (rng.chance(0.5)) this.crate(S, lx, lz, rng.range(1.0, 1.5), rng, rng.chance(0.3)); else this.barrel(S, lx, lz, rng); S.loot(lx + 1.4, 0, lz + 0.3, 1); }
    for (let k = -2; k <= 2; k++) this.lampPost(S, k * 14, 33);
    const pier = this.pier(S.mb, S.wx(0, 20), S.wz(0, 20), S.yaw, 48, 1.55, 5.2);
    if (pier) {
      // moored boat
      const B = pier.sub(4.45, 30, 0);
      B.box(0, -0.35, 0, 3.4, 1.5, 9.5, PAL.white, { grad: 0.75, topCol: PAL.plank });
      B.box(0, -0.35, 5.6, 2.3, 1.5, 2.2, PAL.white, { grad: 0.75, yaw: Math.PI / 4, topCol: PAL.plank });
      B.box(0, 1.25, -1.6, 2.5, 1.7, 3.0, PAL.blue, { grad: 0.85 });
      B.box(0, 2.2, -1.6, 2.9, 0.14, 3.4, PAL.white, { solid: false, grad: 1 });
      B.box(0, 3.4, 1.4, 0.14, 6, 0.14, PAL.woodDark, { solid: false });
      B.loot(0, 0.4, 2.6, 1); B.chest(0, 0.4, -4.0, 0, 1);
      this.crate(pier, -1.4, 12, 1.1, rng); this.crate(pier, 1.2, 26, 1.2, rng, true); this.barrel(pier, -1.6, 38, rng);
      pier.chest(1.2, 0, 45, 3.14, 1);
    }
    S.chest(-8, 0, -20, 0.4, 1);
  },
  poi_farm(S, p, rng) {
    // barn
    const B = S.sub(-18, -12, 0.15);
    { const w = 10, d = 15, h = 5.2, t = 0.35, fl = 0.2;
      B.footprint(w, d, 2);
      B.box(0, fl - 1.1, 0, w + 0.3, 2.2, d + 0.3, PAL.stone, { grad: 0.8, topCol: PAL.soil });
      const big = { a: w / 2 - 2.2, b: w / 2 + 2.2, y0: 0, y1: 3.8 };
      B.wall(-w / 2, d / 2 - t / 2, w / 2, d / 2 - t / 2, fl, h, t, PAL.barnRed, [big]);
      B.wall(-w / 2, -d / 2 + t / 2, w / 2, -d / 2 + t / 2, fl, h, t, PAL.barnRed, [big]);
      B.wall(-w / 2 + t / 2, -d / 2 + t, -w / 2 + t / 2, d / 2 - t, fl, h, t, PAL.barnRed, this.wins(d - 2 * t, null, 1.2, 2.3));
      B.wall(w / 2 - t / 2, -d / 2 + t, w / 2 - t / 2, d / 2 - t, fl, h, t, PAL.barnRed, this.wins(d - 2 * t, null, 1.2, 2.3));
      this.roof(B, w, d, fl + h, PAL.roofSlate, PAL.barnRed, 3.4);
      for (const sx of [-1, 1]) B.box(sx * 2.35, fl + 1.9, d / 2 + 0.02, 0.22, 3.8, 0.1, PAL.white, { solid: false, grad: 1 });
      B.box(0, fl + 3.9, d / 2 + 0.02, 4.9, 0.22, 0.1, PAL.white, { solid: false, grad: 1 });
      this.hayBale(B, -3.4, -5); this.hayBale(B, -3.2, -3.2); this.hayBale(B, 3.3, 4.5); B.cyl(-3.3, 1.25, -4.1, 0.8, 0.8, 1.25, 10, PAL.hay, { flags: F_SOLID | F_BULLET });
      B.box(0, fl + h - 0.3, 0, 0.5, 0.2, 0.5, PAL.lamp, { solid: false, em: 1, grad: 1 });
      for (let k = 0; k < 3; k++) B.loot(rng.range(-3.5, 3.5), fl, rng.range(-6, 6), 1);
      B.chest(3.4, fl, -6, -0.8, 1);
    }
    this.house2(S.sub(17, -24, -0.3), rng, { tier: 1, wall: PAL.plaster, roof: PAL.roofRed });
    this.house(S.sub(-36, 16, Math.PI / 2), rng, 6.5, 5.6, 2.9, { tier: 1, wall: PAL.woodLight, loot: 2 });
    // windmill
    const W = S.sub(32, 14, 0);
    W.cyl(0, 0, 0, 2.9, 1.7, 11.5, 8, PAL.plaster, { colR: 2.7, grad: 0.75 });
    W.cyl(0, 11.5, 0, 2.1, 0, 2.6, 8, PAL.roofBrown, { solid: false, flat: true });
    W.box(0, 1.2, 2.75, 1.5, 2.4, 0.2, PAL.woodDark, { solid: false });
    World.props.windmills.push({ x: W.wx(0, 2.4), y: W.y + 10.4, z: W.wz(0, 2.4), yaw: W.yaw });
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.5; W.loot(Math.sin(a) * 4.6, 0, Math.cos(a) * 4.6, 1); }
    // silos
    for (const lz of [-26, -19]) { S.cyl(-38, 0, lz, 2.4, 2.4, 9, 10, PAL.metal, { grad: 0.8 }); S.cyl(-38, 9, lz, 2.5, 0, 1.6, 10, PAL.metalDark, { solid: false }); }
    // fields
    const F = S.sub(0, 30, 0.1);
    for (let r = -5; r <= 5; r++) F.box(0, 0.08, r * 1.9, 36, 0.3, 0.9, r % 2 ? PAL.crop : PAL.cropDry, { solid: false, grad: 0.8 });
    this.fence(F, -19, -11.5, 19, -11.5); this.fence(F, -19, 11.5, 19, 11.5); this.fence(F, -19, -11.5, -19, 11.5); this.fence(F, 19, -11.5, 19, -3); this.fence(F, 19, 3, 19, 11.5);
    for (let k = 0; k < 9; k++) { const lx = rng.range(-17, 17), lz = rng.range(-10, 10); this.hayBale(F, lx, lz); if (k % 3 === 0) F.loot(lx + 1.5, 0, lz, 0); }
    // tractor
    const T = S.sub(-4, 4, 0.7);
    T.box(0, 1.1, 0, 1.5, 1.0, 3.2, PAL.red, {}); T.box(0, 2.0, -0.8, 1.4, 1.2, 1.3, PAL.metalDark, {});
    for (const sx of [-1, 1]) { T.beam(sx * 0.75, 0.75, -0.9, sx * 1.1, 0.75, -0.9, 0.75, 0.75, 9, PAL.black); T.beam(sx * 0.75, 0.45, 1.2, sx * 1.0, 0.45, 1.2, 0.45, 0.45, 8, PAL.black); }
    for (let k = 0; k < 4; k++) S.loot(rng.range(-12, 12), 0, rng.range(-6, 12), 0);
    this.lampPost(S, 6, -8); this.lampPost(S, -10, 4);
  },
  poi_lumber(S, p, rng) {
    for (const [lx, lz, yaw] of [[-22, -16, 0.6], [20, -20, -0.5], [-8, 26, Math.PI]]) this.house(S.sub(lx, lz, yaw), rng, rng.range(6.5, 7.6), rng.range(5.6, 6.4), 2.9, { tier: 1, wall: PAL.wood, base: PAL.stoneDark, roof: PAL[rng.pick(['roofBrown', 'roofSlate', 'roofTeal'])] });
    // sawmill shed
    const M = S.sub(10, 6, 0.2);
    for (const lx of [-5, 0, 5]) for (const lz of [-3.2, 3.2]) M.box(lx, 1.9, lz, 0.3, 3.8, 0.3, PAL.woodDark, { flags: F_SOLID | F_BULLET });
    M.box(0, 3.9, 0, 11.4, 0.2, 7.6, PAL.roofBrown, { grad: 1 }); M.gable(0, 4.0, 0, 11.8, 8.0, 1.6, PAL.roofBrown, {});
    M.box(0, 0.5, 0, 6, 1.0, 1.3, PAL.wood, {}); M.cyl(1.2, 1.0, 0, 0.7, 0.7, 0.08, 12, PAL.metal, { solid: false });
    M.beam(-2.8, 1.25, 0.1, 0.4, 1.25, 0.1, 0.3, 0.3, 7, PAL.woodLight, {});
    M.loot(-3.5, 0, 2, 1); M.loot(3.6, 0, -1.8, 1); M.chest(4.2, 0, 2.2, 2.6, 1);
    M.box(0, 3.6, 0, 0.5, 0.2, 0.5, PAL.lamp, { solid: false, em: 1, grad: 1 });
    for (const [lx, lz, yaw] of [[-4, -8, 0.2], [24, 10, 1.4], [-24, 8, 1.0], [2, -26, 0.1], [-30, -30, 0.8]]) this.logPile(S, lx, lz, yaw, rng);
    for (let k = 0; k < 16; k++) { const a = rng() * TAU, R = rng.range(10, 42); this.stump(S, Math.sin(a) * R, Math.cos(a) * R, rng); }
    for (let k = 0; k < 6; k++) { const a = rng() * TAU, R = rng.range(6, 34); this.crate(S, Math.sin(a) * R, Math.cos(a) * R, 1.1, rng); S.loot(Math.sin(a) * R + 1.5, 0, Math.cos(a) * R, 0); }
    this.tower(S.sub(28, 26, -2.2), rng, { tier: 1 });
  },
  poi_military(S, p, rng) {
    const W = 84, D = 70, h = 2.7, t = 0.5, cc = PAL.concrete;
    const gate = L => ({ a: L / 2 - 3.5, b: L / 2 + 3.5, y0: 0, y1: h });
    S.wall(-W / 2, D / 2, W / 2, D / 2, 0, h, t, cc, [gate(W)]);
    S.wall(-W / 2, -D / 2, W / 2, -D / 2, 0, h, t, cc, [gate(W)]);
    S.wall(-W / 2, -D / 2, -W / 2, D / 2, 0, h, t, cc, [gate(D)]);
    S.wall(W / 2, -D / 2, W / 2, D / 2, 0, h, t, cc, [gate(D)]);
    // hangar
    const Hg = S.sub(-24, -12, Math.PI / 2);
    { const w = 18, d = 20, hh = 7, tt = 0.4, fl = 0.15;
      Hg.footprint(w, d, 2);
      Hg.box(0, fl - 1.0, 0, w + 0.4, 2.0, d + 0.4, PAL.concreteDark, { grad: 0.8, topCol: PAL.concrete });
      Hg.wall(-w / 2, d / 2 - tt / 2, w / 2, d / 2 - tt / 2, fl, hh, tt, PAL.olive, [{ a: 2, b: w - 2, y0: 0, y1: 5.4 }]);
      Hg.wall(-w / 2, -d / 2 + tt / 2, w / 2, -d / 2 + tt / 2, fl, hh, tt, PAL.olive, [{ a: w / 2 - 1.2, b: w / 2 + 1.2, y0: 0, y1: 2.4 }]);
      Hg.wall(-w / 2 + tt / 2, -d / 2 + tt, -w / 2 + tt / 2, d / 2 - tt, fl, hh, tt, PAL.olive, this.wins(d - 2 * tt, null, 3.6, 4.8, 2.2));
      Hg.wall(w / 2 - tt / 2, -d / 2 + tt, w / 2 - tt / 2, d / 2 - tt, fl, hh, tt, PAL.olive, this.wins(d - 2 * tt, null, 3.6, 4.8, 2.2));
      this.roof(Hg, w, d, fl + hh, PAL.metalDark, PAL.olive, 2.4);
      for (const [cx, cz, st] of [[-6, -6, 1], [6, -7, 0], [-6.5, 3, 0], [6, 2, 1], [0, -8, 0]]) this.crate(Hg, cx, cz, rng.range(1.4, 1.9), rng, st);
      for (const lz of [-5, 5]) Hg.box(0, fl + hh - 0.3, lz, 0.5, 0.2, 0.5, PAL.lamp, { solid: false, em: 1, grad: 1 });
      for (let k = 0; k < 5; k++) Hg.loot(rng.range(-7, 7), fl, rng.range(-8, 8), 2);
      Hg.chest(-7.5, fl, 8, 2.3, 2); Hg.chest(7.4, fl, -8.4, -0.8, 2);
    }
    // bunkers
    for (const [lx, lz, yaw] of [[24, -22, -0.4], [26, 18, 0.5]]) this.bunker(S.sub(lx, lz, yaw), rng, 2);
    // barracks
    for (const [lx, lz, yaw] of [[-27, 24, Math.PI], [-6, 25, Math.PI]]) this.house(S.sub(lx, lz, yaw), rng, 11, 6.4, 3.0, { tier: 2, wall: PAL.olive, roof: PAL.metalDark, loot: 3, chest: 0.5, flat: true, base: PAL.concreteDark });
    // helipad
    S.cyl(6, 0, -4, 7.5, 7.5, 0.14, 20, PAL.concreteDark, { solid: false, topCol: scaleCol(PAL.concreteDark, 0.9) });
    S.box(6, 0.15, -4, 0.7, 0.03, 5, PAL.white, { solid: false, grad: 1 }); S.box(4.3, 0.15, -4, 0.7, 0.03, 5, PAL.white, { solid: false, grad: 1 }); S.box(7.7, 0.15, -4, 0.7, 0.03, 5, PAL.white, { solid: false, grad: 1 });
    S.box(6, 0.15, -4, 3.4, 0.031, 0.7, PAL.white, { solid: false, grad: 1 });
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; S.box(6 + Math.sin(a) * 7, 0.2, -4 + Math.cos(a) * 7, 0.3, 0.14, 0.3, PAL.teal, { solid: false, em: 2, grad: 1 }); }
    S.loot(6, 0.14, -4, 2);
    this.tower(S.sub(33, -6, Math.PI / 2), rng, { tier: 2 });
    this.tower(S.sub(-36, 6, -Math.PI / 2), rng, { tier: 2 });
    this.mast(S, 37, -30, 24);
    // fuel tanks
    for (const lz of [-30, -25]) { S.beam(-4, 1.3, lz, 4, 1.3, lz, 1.3, 1.3, 10, PAL.rust, {}); S.box(0, 1.3, lz, 8, 2.6, 2.4, PAL.rust, { vis: false }); }
    for (const [lx, lz, yaw, len] of [[0, 30, 0, 5], [-12, -30, 0, 4], [38, 8, Math.PI / 2, 5], [-38, -8, Math.PI / 2, 5], [14, 6, 0.6, 4], [-8, -18, 0.2, 4], [12, -14, 1.2, 3.5]]) this.sandbags(S, lx, lz, yaw, len);
    for (let k = 0; k < 8; k++) { const lx = rng.range(-36, 36), lz = rng.range(-30, 30); if (Math.hypot(lx - 6, lz + 4) < 9) continue; this.crate(S, lx, lz, rng.range(1.0, 1.5), rng, rng.chance(0.3)); S.loot(lx + 1.5, 0, lz + 0.4, 2); }
    for (const [lx, lz] of [[-40, -33], [40, 33], [-40, 33], [40, -33]]) this.lampPost(S, lx, lz);
  },
  bunker(S, rng, tier) {
    const w = 9, d = 7, h = 2.8, t = 0.6, fl = 0.15, cc = PAL.concreteDark;
    S.footprint(w, d, 2);
    S.box(0, fl - 1.0, 0, w + 0.3, 2.0, d + 0.3, cc, { grad: 0.8, topCol: PAL.concrete });
    const door = { a: w / 2 - 1.2, b: w / 2 + 1.2, y0: 0, y1: 2.3 };
    const slit = L => { const out = []; for (let a = 1.2; a + 1.6 < L - 0.8; a += 2.6) out.push({ a, b: a + 1.6, y0: 1.15, y1: 1.6 }); return out; };
    S.wall(-w / 2, d / 2 - t / 2, w / 2, d / 2 - t / 2, fl, h, t, cc, [door]);
    S.wall(-w / 2, -d / 2 + t / 2, w / 2, -d / 2 + t / 2, fl, h, t, cc, slit(w));
    S.wall(-w / 2 + t / 2, -d / 2 + t, -w / 2 + t / 2, d / 2 - t, fl, h, t, cc, slit(d - 2 * t));
    S.wall(w / 2 - t / 2, -d / 2 + t, w / 2 - t / 2, d / 2 - t, fl, h, t, cc, slit(d - 2 * t));
    S.box(0, fl + h + 0.25, 0, w + 0.6, 0.5, d + 0.6, PAL.concrete, { grad: 0.85 });
    S.blob(0, fl + h + 0.45, 0, w * 0.5, 0.75, d * 0.5, hexLin(0x5f7a3d), { detail: 1, flat: true, grad: 0.8 });
    S.box(0, fl + h - 0.22, 0, 0.36, 0.2, 0.36, PAL.lamp, { solid: false, em: 1, grad: 1 });
    S.loot(-2.4, fl, 0.6, tier); S.loot(2.4, fl, -1.0, tier);
    S.chest(-w / 2 + 1.3, fl, -d / 2 + 1.3, 0.8, tier);
  },
  poi_observatory(S, p, rng) {
    S.cyl(0, 0, -8, 8, 8, 4.6, 14, PAL.white, { grad: 0.8 });
    S.blob(0, 4.6, -8, 8, 7.2, 8, PAL.plaster, { detail: 2 });
    S.box(0, 8.6, -5.2, 2.2, 6.4, 6.0, PAL.metalDark, { solid: false, pitch: -0.55 });
    S.box(0, 1.2, 0.05, 2.2, 2.4, 0.2, PAL.metalDark, { solid: false });
    Phys.addCyl(S.wx(0, -8), S.wz(0, -8), 7.6, S.y + 4.5, S.y + 11.5, F_SOLID | F_BULLET);
    for (const [lx, lz, yaw, wc] of [[-19, 9, 0.9, PAL.white], [17, 12, -0.8, PAL.orange], [-22, -14, 1.6, PAL.white]]) this.house(S.sub(lx, lz, yaw), rng, 8.5, 6, 3.0, { tier: 2, wall: wc, roof: PAL.metal, flat: true, loot: 2, chest: 0.6, base: PAL.concreteDark });
    // radar dish
    const R = S.sub(22, -14, 0);
    R.cyl(0, 0, 0, 0.6, 0.45, 6.5, 8, PAL.metal, {});
    R.cyl(0, 6.5, 0, 0.5, 3.8, 1.5, 12, PAL.white, { solid: false });
    R.beam(0, 6.8, 0, 0, 9.4, 0, 0.08, 0.08, 4, PAL.metalDark, {}); R.blob(0, 9.5, 0, 0.3, 0.3, 0.3, PAL.red, { detail: 0, em: 2 });
    World.props.beacons.push({ x: R.x, y: R.y + 9.5, z: R.z, color: 0xff4030 });
    this.mast(S, -8, 24, 20);
    for (let k = -2; k <= 2; k++) {
      const P = S.sub(k * 4.2 + 6, 26, 0);
      P.box(0, 1.25, 0, 3.4, 0.12, 2.0, PAL.blue, { solid: false, pitch: 0.55, grad: 1 });
      P.box(-1.3, 0.55, 0.3, 0.12, 1.1, 0.12, PAL.metalDark, { solid: false }); P.box(1.3, 0.55, 0.3, 0.12, 1.1, 0.12, PAL.metalDark, { solid: false });
      P.box(0, 0.7, 0, 3.4, 1.4, 1.5, PAL.blue, { vis: false, flags: F_SOLID | F_BULLET | F_NAV });
    }
    for (let k = 0; k < 6; k++) { const a = rng() * TAU, Rr = rng.range(12, 30); const lx = Math.sin(a) * Rr, lz = Math.cos(a) * Rr; if (Math.hypot(lx, lz + 8) < 11) continue; this.crate(S, lx, lz, rng.range(1.0, 1.4), rng, rng.chance(0.3)); S.loot(lx + 1.4, 0, lz + 0.5, 2); }
    S.chest(3.6, 0, 1.6, 3.4, 2); S.chest(-3.4, 0, 1.8, 2.9, 2);
    this.lampPost(S, 8, 6); this.lampPost(S, -10, 2);
  },
  ruinWall(S, x0, z0, x1, z1, hMax, rng, thick) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.2)), yaw = Math.atan2(-(z1 - z0), x1 - x0);
    for (let k = 0; k < n; k++) {
      if (rng.chance(0.14)) continue;
      const tt = (k + 0.5) / n, hh = hMax * rng.range(0.35, 1);
      const col = rng.chance(0.3) ? PAL.moss : rng.chance(0.5) ? PAL.stone : PAL.stoneDark;
      S.box(lerp(x0, x1, tt), hh / 2 - 0.3, lerp(z0, z1, tt), len / n + 0.02, hh + 0.6, thick || 0.9, col, { yaw, grad: 0.75, topCol: scaleCol(col, 1.12) });
    }
  },
  poi_ruins(S, p, rng) {
    // keep
    const k = 5;
    this.ruinWall(S, -k, -k, k, -k, 7.5, rng, 1.0); this.ruinWall(S, -k, k, -1.6, k, 6.5, rng, 1.0); this.ruinWall(S, 1.6, k, k, k, 6.5, rng, 1.0);
    this.ruinWall(S, -k, -k, -k, k, 7, rng, 1.0); this.ruinWall(S, k, -k, k, k, 7, rng, 1.0);
    S.box(0, -0.1, 0, 2 * k, 0.5, 2 * k, PAL.stoneDark, { grad: 1, topCol: PAL.stone });
    S.box(0, 0.75, -2.6, 2.6, 1.0, 1.3, PAL.stone, {});
    S.chest(0, 0.25, -0.9, 3.14, 2); S.loot(-2.6, 0.25, 1.6, 2); S.loot(2.6, 0.25, 0.8, 2); S.loot(2.4, 0.25, -3, 2);
    S.blob(0, 1.7, -2.6, 0.35, 0.6, 0.35, PAL.teal, { detail: 0, flat: true, em: 2 });
    World.props.beacons.push({ x: S.wx(0, -2.6), y: S.y + 1.7, z: S.wz(0, -2.6), color: 0x35d9bb });
    // colonnade toward the front
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
      const hh = rng.chance(0.3) ? rng.range(1.2, 2.5) : rng.range(4, 5.4);
      S.cyl(sx * 4, 0, 9 + i * 4.6, 0.62, 0.52, hh, 8, rng.chance(0.3) ? PAL.moss : PAL.stone, { topCol: PAL.stoneDark });
    }
    // outer ring
    const R = 31, segs = 14;
    for (let i = 0; i < segs; i++) {
      if (i % 4 === 1) continue;
      const a0 = i / segs * TAU, a1 = (i + 0.82) / segs * TAU;
      this.ruinWall(S, Math.sin(a0) * R, Math.cos(a0) * R, Math.sin(a1) * R, Math.cos(a1) * R, 4.2, rng);
    }
    for (let i = 0; i < 14; i++) {
      const a = rng() * TAU, rr = rng.range(9, 27), s = rng.range(0.7, 1.7);
      S.box(Math.sin(a) * rr, s * 0.3, Math.cos(a) * rr, s * 1.4, s, s, rng.chance(0.4) ? PAL.moss : PAL.stone, { yaw: rng() * 3, grad: 0.75 });
      if (i % 2 === 0) S.loot(Math.sin(a) * rr + 1.6, 0, Math.cos(a) * rr + 0.5, 2);
    }
    // two side chambers
    for (const sx of [-1, 1]) {
      const C = S.sub(sx * 17, -8, sx * 0.5);
      this.ruinWall(C, -3.5, -3, 3.5, -3, 4, rng); this.ruinWall(C, -3.5, -3, -3.5, 3, 3.6, rng); this.ruinWall(C, 3.5, -3, 3.5, 3, 3.6, rng);
      C.loot(0, 0, -0.6, 2); if (sx > 0) C.chest(0, 0, -1.6, 3.14, 2);
    }
  },
  poi_lighthouse(S, p, rng) {
    const L = S.sub(0, 12, 0);
    L.cyl(0, -1, 0, 5.2, 4.8, 2.0, 14, PAL.stone, { topCol: PAL.stoneDark, colR: 5.0 });
    const segs = 6, H = 22;
    for (let k = 0; k < segs; k++) {
      const r0 = lerp(3.2, 2.1, k / segs), r1 = lerp(3.2, 2.1, (k + 1) / segs);
      L.cyl(0, 1 + k * H / segs, 0, r0, r1, H / segs, 12, k % 2 ? PAL.red : PAL.white, { solid: false, grad: 0.92 });
    }
    Phys.addCyl(L.x, L.z, 3.1, L.y + 1, L.y + 1 + H + 5, F_ALL);
    L.cyl(0, 1 + H, 0, 3.0, 3.0, 0.35, 12, PAL.metalDark, { solid: false });
    L.cyl(0, 1.35 + H, 0, 1.5, 1.5, 2.3, 10, PAL.lamp, { solid: false, em: 2, grad: 1 });
    L.cyl(0, 3.65 + H, 0, 2.2, 0, 2.0, 12, PAL.red, { solid: false });
    L.box(0, 2.1, 3.15, 1.3, 2.2, 0.2, PAL.woodDark, { solid: false });
    World.props.lighthouse = { x: L.x, y: L.y + 2.5 + H, z: L.z };
    L.ramp(0, 6.9, 3.6, 2.4, Math.PI / 2, -0.4, 1.0, PAL.stone, false);
    this.house(S.sub(-5, -12, 0.25), rng, 8, 6.4, 3.0, { tier: 1, wall: PAL.white, roof: PAL.roofRed, loot: 3, chest: 0.8 });
    this.container(S.sub(13, -8, 1.3), rng, null, false, 2);
    for (let k = 0; k < 5; k++) { const a = rng() * TAU, R = rng.range(7, 20); const lx = Math.sin(a) * R, lz = Math.cos(a) * R; if (Math.hypot(lx, lz - 12) < 7 || Math.hypot(lx + 5, lz + 12) < 8) continue; this.crate(S, lx, lz, 1.1, rng); S.loot(lx + 1.4, 0, lz, 1); }
    L.chest(0, 1.0, 4.2, 3.14, 1);
    this.fence(S, -16, 2, -16, 14); this.fence(S, 9, 2, 16, 2);
  },
  poi_camp(S, p, rng) {
    this.campfire(S, 0, 0);
    const cols = [PAL.orange, PAL.tarp, PAL.canvas, PAL.red, PAL.blue, PAL.olive];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU + 0.5, R = 9.5 + (k % 2) * 4;
      if (k === 3) continue;
      this.tent(S, Math.sin(a) * R, Math.cos(a) * R, a + Math.PI / 2, cols[k]);
      S.loot(Math.sin(a) * (R - 3.2), 0, Math.cos(a) * (R - 3.2), 0);
    }
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.2; S.beam(Math.sin(a) * 2.6 - Math.cos(a), 0.25, Math.cos(a) * 2.6 + Math.sin(a), Math.sin(a) * 2.6 + Math.cos(a), 0.25, Math.cos(a) * 2.6 - Math.sin(a), 0.25, 0.25, 6, PAL.wood, {}); }
    this.house(S.sub(-18, -14, 0.7), rng, 7, 6, 2.9, { tier: 1, wall: PAL.wood, roof: PAL.roofTeal, base: PAL.stoneDark, chest: 1 });
    for (let k = 0; k < 5; k++) { const a = rng() * TAU, R = rng.range(15, 26); this.crate(S, Math.sin(a) * R, Math.cos(a) * R, 1.0, rng); if (k % 2) S.loot(Math.sin(a) * R + 1.3, 0, Math.cos(a) * R, 0); }
    const pier = this.pier(S.mb, S.wx(0, 8), S.wz(0, 8), S.yaw, 22, 1.1, 3.2);
    if (pier) {
      pier.chest(0, 0, 20, 3.14, 1);
      pier.blob(2.8, -0.75, 8, 0.75, 0.42, 2.6, PAL.red, { detail: 1 }); pier.blob(-2.9, -0.75, 13, 0.75, 0.42, 2.6, PAL.teal, { detail: 1 });
    }
    this.tower(S.sub(16, -18, 2.4), rng, { tier: 1 });
  },

  // ------------------------------------------------------------------ minor sites
  site_cabin(S, s, rng) {
    this.house(S, rng, rng.range(6.2, 7.4), rng.range(5.4, 6.2), 2.9, { tier: 0, wall: PAL[rng.pick(['wood', 'woodLight', 'woodDark'])], base: PAL.stoneDark, chest: 0.45 });
    this.logPile(S, 6.4, -1, Math.PI / 2, rng);
    if (rng.chance(0.6)) this.crate(S, -5.6, 2, 1.1, rng);
    S.loot(rng.range(-2, 2), 0, 6.5, 0);
  },
  site_tower(S, s, rng) { this.tower(S, rng, { tier: 1 }); this.crate(S, -3.6, -2.5, 1.1, rng); S.loot(-3.2, 0, 0.5, 0); },
  site_campsite(S, s, rng) {
    this.campfire(S, 0, 0);
    this.tent(S, -4.4, 1.5, 1.2, rng.chance(0.5) ? PAL.orange : PAL.tarp);
    this.tent(S, 3.6, -3.4, -0.5, rng.chance(0.5) ? PAL.canvas : PAL.blue);
    this.crate(S, 4.4, 3.4, 1.0, rng);
    S.beam(-1.2, 0.25, 2.6, 1.2, 0.25, 2.9, 0.25, 0.25, 6, PAL.wood, {});
    S.loot(1.8, 0, 2.0, 0); S.loot(-2.0, 0, -2.4, 0); S.loot(5.6, 0, 1.6, 0);
    if (rng.chance(0.5)) S.chest(-1.4, 0, -4.6, 0.3, 0);
  },
  site_shrine(S, s, rng) {
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU, hh = rng.range(2.4, 3.8);
      const col = rng.chance(0.4) ? PAL.moss : PAL.stone;
      S.box(Math.sin(a) * 6.4, hh / 2 - 0.3, Math.cos(a) * 6.4, 1.1, hh + 0.6, 0.75, col, { yaw: a, grad: 0.75, topCol: scaleCol(col, 1.1) });
    }
    S.box(0, 0.3, 0, 2.2, 1.0, 1.3, PAL.stoneDark, { topCol: PAL.stone });
    S.blob(0, 1.4, 0, 0.3, 0.55, 0.3, PAL.teal, { detail: 0, flat: true, em: 2 });
    World.props.beacons.push({ x: S.x, y: S.y + 1.4, z: S.z, color: 0x35d9bb });
    S.chest(0, 0, 1.8, 3.14, 1); S.loot(-2.6, 0, -1.6, 1); S.loot(2.8, 0, -1.0, 1);
  },
  site_bunker(S, s, rng) { this.bunker(S, rng, 2); this.sandbags(S, 0, 6.6, 0, 4.5); this.crate(S, 6.2, 1.5, 1.2, rng, true); S.loot(-6, 0, 2, 1); },

  // ------------------------------------------------------------------ nature
  scatterRocks(rng) {
    const data = [];
    let tries = 0;
    while (data.length / 8 < 620 && tries++ < 20000) {
      const x = rng.range(-470, 470), z = rng.range(-470, 470);
      const h = Terrain.height(x, z);
      if (h < -0.6) continue;
      const steep = Terrain.steepness(x, z);
      const bias = h < 2.5 ? 0.5 : h > 45 ? 0.9 : steep > 0.35 ? 0.75 : 0.14;
      if (!rng.chance(bias)) continue;
      if (Terrain.poiAt(x, z, 2) || Terrain.siteAt(x, z, 3) || Terrain.roadDist(x, z) < 5) continue;
      const big = rng.chance(0.22);
      const size = big ? rng.range(1.8, 3.6) : rng.range(0.45, 1.3);
      const squash = rng.range(0.55, 0.9);
      data.push(x, h - size * 0.22, z, size, rng() * TAU, rng.range(0.82, 1.12), Math.floor(rng() * 3), squash);
      if (size > 1.1) Phys.addCyl(x, z, size * 0.72, h - 1, h + size * squash * 0.72, F_ALL);
    }
    World.rocks = new Float32Array(data); World.rockCount = data.length / 8;
  },
  scatterTrees(rng) {
    const data = [];
    const G = 5.0, H = Terrain.HALF;
    const nV = makeNoise2D(CFG.WORLD_SEED + 31);
    for (let gz = -H + 20; gz < H - 20; gz += G) for (let gx = -H + 20; gx < H - 20; gx += G) {
      const x = gx + rng() * G, z = gz + rng() * G;
      const h = Terrain.height(x, z);
      if (h < 3.1 || h > 88) { rng(); continue; }
      const f = Terrain.forest(x, z);
      let prob = 0.05 + 0.9 * Math.pow(f, 1.6);
      if (h > 58) prob *= smoothstep(88, 58, h) * 0.8;
      if (h < 5) prob *= 0.4;
      if (!rng.chance(prob)) continue;
      if (Terrain.steepness(x, z) > 0.8) continue;
      const poi = Terrain.poiAt(x, z, 5);
      if (poi) continue;
      if (Terrain.siteAt(x, z, 4) || Terrain.roadDist(x, z) < 4.6) continue;
      // species: 0 pine, 1 birch, 2 maple, 3 green broadleaf, 4 dead, 5 bush
      const v = nV(x * 0.012, z * 0.012), r = rng();
      let type;
      if (h > 46 || v < -0.25) type = r < 0.86 ? 0 : r < 0.93 ? 4 : 5;
      else if (v > 0.3) type = r < 0.42 ? 1 : r < 0.74 ? 2 : r < 0.88 ? 3 : 5;
      else type = r < 0.5 ? 0 : r < 0.66 ? 1 : r < 0.8 ? 2 : r < 0.9 ? 3 : r < 0.94 ? 4 : 5;
      const scale = type === 5 ? rng.range(0.8, 1.5) : rng.range(0.8, 1.45) * (type === 0 ? 1.08 : 1);
      data.push(x, h - 0.15, z, scale, rng() * TAU, rng(), rng() * TAU, type);
      if (type !== 5) {
        Phys.addCyl(x, z, (type === 2 || type === 3 ? 0.3 : 0.24) * scale, h - 1, h + 4.5 * scale, F_SOLID | F_BULLET);
        Terrain.darken(x, z, 4.2 * scale, 0.13);
      }
    }
    // a few trees inside settlements for charm
    for (const p of Terrain.pois) {
      if (p.type === 'military' || p.type === 'harbor') continue;
      for (let k = 0; k < 10; k++) {
        const a = rng() * TAU, R = p.r * rng.range(0.82, 1.02), x = p.x + Math.cos(a) * R, z = p.z + Math.sin(a) * R;
        if (Terrain.roadDist(x, z) < 5 || this._nearFootprint(x, z, 7)) continue;
        const h = Terrain.height(x, z);
        if (h < 3) continue;
        const type = p.type === 'observatory' ? 0 : rng.pick([1, 2, 3, 0]);
        const scale = rng.range(0.9, 1.3);
        data.push(x, h - 0.15, z, scale, rng() * TAU, rng(), rng() * TAU, type);
        Phys.addCyl(x, z, 0.26 * scale, h - 1, h + 4.5 * scale, F_SOLID | F_BULLET);
      }
    }
    World.trees = new Float32Array(data); World.treeCount = data.length / 8;
  },
  _nearFootprint(x, z, r) {
    for (const f of World.footprints) if (dist2D(x, z, f.x, f.z) < Math.max(f.w, f.d) / 2 + r) return true;
    return false;
  },
  scatterGroundLoot(rng) {
    // sparse loot out in the wild so nobody lands on nothing
    let placed = 0, tries = 0;
    while (placed < 46 && tries++ < 4000) {
      const x = rng.range(-430, 430), z = rng.range(-430, 430), h = Terrain.height(x, z);
      if (h < 3.4 || h > 70 || Terrain.steepness(x, z) > 0.45) continue;
      if (Terrain.poiAt(x, z, 10) || Terrain.siteAt(x, z, 6)) continue;
      World.lootSpots.push({ x, y: h, z, tier: 0, upper: false, wild: true });
      placed++;
    }
  },
};

// ---- instanced nature models (colour alpha = foliage mask used for wind sway / tinting)
const NatureModels = {
  build() {
    const out = { trees: [], treesLod: [], rocks: [] };
    const trunk = hexLin(0x5c4232), birch = hexLin(0xe6e1d2), dead = hexLin(0x6b5d50);
    // 0 pine
    const pine = lod => {
      const b = new MeshBuilder();
      b.cyl(0, -0.5, 0, 0.27, 0.13, 3.6, lod ? 4 : 6, trunk, { noBottom: true, noTop: true, grad: 0.8 });
      const tiers = lod ? 2 : 4, g1 = hexLin(0x3d7a48), tip = hexLin(0x5c9a58);
      for (let k = 0; k < tiers; k++) {
        const y = lod ? 1.5 + k * 2.5 : 1.45 + k * 1.3, r = lod ? 2.05 - k * 0.8 : 2.1 - k * 0.43, hh = lod ? 4.3 - k * 0.6 : 2.6 - k * 0.12;
        b.cyl(0, y, 0, r, 0, hh, lod ? 5 : 7, g1, { flat: true, grad: 0.55, topCol: tip, yawOff: k * 0.6, em: 1, noBottom: lod });
      }
      return b.build();
    };
    const broad = (lod, trunkCol, leaf, trunkH, trunkR, blobs) => {
      const b = new MeshBuilder();
      b.cyl(0, -0.5, 0, trunkR, trunkR * 0.55, trunkH + 0.5, lod ? 4 : 6, trunkCol, { noBottom: true, noTop: true, grad: 0.8 });
      const list = lod ? blobs.slice(0, 1).map(q => [q[0], q[1], q[2], q[3] * 1.25, q[4] * 1.2]) : blobs;
      list.forEach((q, i) => b.blob(q[0], q[1], q[2], q[3], q[4], q[3], leaf, { detail: 0, flat: true, jitter: 0.16, seed: 11 + i * 7, grad: 0.6, shadeJitter: 0.08, em: 1 }));
      return b.build();
    };
    const deadTree = () => {
      const b = new MeshBuilder();
      b.cyl(0, -0.5, 0, 0.24, 0.1, 5.2, 5, dead, { noBottom: true, grad: 0.8 });
      b.beam(0, 2.6, 0, 1.3, 3.9, 0.4, 0.09, 0.03, 4, dead, { noCaps: true });
      b.beam(0, 3.3, 0, -1.1, 4.6, -0.5, 0.08, 0.03, 4, dead, { noCaps: true });
      b.beam(0, 3.9, 0, 0.3, 5.3, -1.0, 0.07, 0.02, 4, dead, { noCaps: true });
      return b.build();
    };
    const bush = () => {
      const b = new MeshBuilder();
      b.blob(0, 0.45, 0, 0.95, 0.7, 0.95, hexLin(0x4f8a45), { detail: 0, flat: true, jitter: 0.2, seed: 5, grad: 0.6, em: 1 });
      b.blob(0.6, 0.35, 0.3, 0.6, 0.5, 0.6, hexLin(0x5c9648), { detail: 0, flat: true, jitter: 0.2, seed: 9, grad: 0.6, em: 1 });
      return b.build();
    };
    const birchBlobs = [[0, 5.3, 0, 1.75, 1.9], [0.95, 4.3, 0.4, 1.15, 1.1], [-0.8, 4.5, -0.5, 1.2, 1.15]];
    const mapleBlobs = [[0, 4.5, 0, 2.3, 1.9], [1.3, 3.7, 0.5, 1.4, 1.2], [-1.2, 3.9, -0.7, 1.5, 1.25], [0.2, 5.6, -0.3, 1.4, 1.1]];
    const greenBlobs = [[0, 4.3, 0, 2.2, 2.0], [1.1, 3.5, -0.6, 1.4, 1.2], [-1.0, 3.6, 0.7, 1.45, 1.2]];
    out.trees = [pine(false), broad(false, birch, hexLin(0xe6b637), 4.6, 0.17, birchBlobs), broad(false, trunk, hexLin(0xd65f2c), 3.3, 0.27, mapleBlobs),
      broad(false, trunk, hexLin(0x6a9a42), 3.2, 0.27, greenBlobs), deadTree(), bush()];
    out.treesLod = [pine(true), broad(true, birch, hexLin(0xe6b637), 4.6, 0.17, birchBlobs), broad(true, trunk, hexLin(0xd65f2c), 3.3, 0.27, mapleBlobs),
      broad(true, trunk, hexLin(0x6a9a42), 3.2, 0.27, greenBlobs), deadTree(), bush()];
    for (let v = 0; v < 3; v++) {
      const b = new MeshBuilder();
      b.blob(0, 0, 0, 1, 1, 1, hexLin(0x8a8680), { detail: 1, flat: true, jitter: 0.2, seed: 40 + v * 13, grad: 0.72, shadeJitter: 0.1 });
      out.rocks.push(b.build());
    }
    return out;
  },
};
