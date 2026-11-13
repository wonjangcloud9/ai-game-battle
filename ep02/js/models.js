// AURORA FALL — instanced models (weapons, loot, chests, vehicles, props): built once, drawn through the model batches.
// Vertices built while `b.param = 1` take the instance colour (rarity stripe, jacket-coloured glider, ...).
'use strict';

const Models = (function () {
  const C = {
    dark: matCol(0x25282d, 'metal'), mid: matCol(0x3b4048, 'metal'), light: matCol(0x6c737d, 'metal'), wood: matCol(0x6e4a2f, 'planks'), white: hexLin(0xf0ede6), tint: [1, 1, 1],
    red: hexLin(0xd8362c), cyan: hexLin(0x49d6ff), green: matCol(0x5d6b3c, 'metal'), chestWood: matCol(0x7a5a3a, 'planks'), iron: matCol(0x2f3238, 'metal'), gold: hexLin(0xffc247),
    orange: matCol(0xe8782a, 'ribbed'), teal: hexLin(0x35d9bb), body: matCol(0xe9e6df, 'metal'), planeDark: matCol(0x39414d, 'metal'), canvas: matCol(0xd8cfb4, 'fabric'),
    rubber: hexLin(0x18191b), brass: matCol(0xb89a4a, 'metal'), cloth: matCol(0xe6e2d8, 'fabric'),
  };
  const mk = fn => { const b = new MeshBuilder(); b.param = 0; fn(b); return b.build(); };
  // round barrel / tube along +z
  const zcyl = (b, x, y, z0, z1, r0, r1, col, sides, o) => b.beam(x, y, z0, x, y, z1, r0, r1 === undefined ? r0 : r1, sides || 8, col, Object.assign({ smooth: true }, o || {}));
  // the part that takes the rarity colour: a glowing stripe
  const stripe = (b, cx, cy, cz, sx, sy, sz) => { b.param = 1; b.box(cx, cy, cz, sx, sy, sz, 0, C.tint, { em: 2 }); b.param = 0; };
  const grip = (b, z, w, col) => { b.box(0, -0.052, z, w || 0.042, 0.125, 0.058, 0, col || C.dark, { pitch: 0.22 }); b.box(0, -0.008, z + 0.062, 0.012, 0.012, 0.07, 0, C.dark); b.box(0, -0.03, z + 0.094, 0.012, 0.05, 0.012, 0, C.dark); };

  // ---- weapons: +z along the barrel, origin at the pistol grip
  const GUNS = {
    pistol(b) {
      b.box(0, 0.04, 0.065, 0.044, 0.05, 0.215, 0, C.mid); b.box(0, 0.012, 0.05, 0.04, 0.03, 0.16, 0, C.dark);
      grip(b, -0.012, 0.04);
      zcyl(b, 0, 0.044, 0.16, 0.183, 0.011, 0.011, C.dark);
      b.box(0, 0.07, -0.03, 0.02, 0.012, 0.014, 0, C.dark); b.box(0, 0.07, 0.155, 0.008, 0.012, 0.012, 0, C.dark);
      stripe(b, 0, 0.067, 0.06, 0.046, 0.006, 0.09);
    },
    smg(b) {
      b.box(0, 0.035, 0.09, 0.052, 0.078, 0.33, 0, C.mid); b.box(0, 0.08, 0.09, 0.03, 0.014, 0.24, 0, C.dark);
      grip(b, -0.02);
      b.box(0, -0.085, 0.105, 0.034, 0.2, 0.046, 0, C.dark, { pitch: -0.06 });                         // magazine
      b.box(0, 0.035, -0.14, 0.02, 0.022, 0.2, 0, C.dark); b.box(0, 0.01, -0.24, 0.03, 0.09, 0.02, 0, C.dark);   // wire stock
      zcyl(b, 0, 0.04, 0.25, 0.4, 0.016, 0.016, C.dark); zcyl(b, 0, 0.04, 0.34, 0.41, 0.022, 0.022, C.dark);
      b.box(0, 0.094, 0.2, 0.01, 0.02, 0.012, 0, C.dark);
      stripe(b, 0, 0.076, 0.02, 0.054, 0.008, 0.1);
    },
    ar(b) {
      b.box(0, 0.034, 0.08, 0.05, 0.085, 0.36, 0, C.mid);                                              // receiver
      grip(b, -0.03);
      b.box(0, -0.105, 0.12, 0.036, 0.2, 0.068, 0, C.dark, { pitch: -0.2 });                           // curved magazine
      b.box(0, 0.03, -0.2, 0.04, 0.07, 0.22, 0, C.dark); b.box(0, 0.0, -0.3, 0.044, 0.13, 0.04, 0, C.dark);        // stock
      zcyl(b, 0, 0.04, 0.26, 0.5, 0.03, 0.028, C.light, 8);                                             // handguard
      zcyl(b, 0, 0.04, 0.5, 0.72, 0.013, 0.013, C.dark); zcyl(b, 0, 0.04, 0.66, 0.74, 0.02, 0.02, C.dark);
      b.box(0, 0.084, 0.12, 0.026, 0.014, 0.42, 0, C.dark);                                            // rail
      b.box(0, 0.108, 0.02, 0.02, 0.034, 0.03, 0, C.dark); b.box(0, 0.105, 0.47, 0.012, 0.04, 0.014, 0, C.dark);   // sights
      stripe(b, 0, 0.034, 0.2, 0.053, 0.03, 0.09);
    },
    shotgun(b) {
      b.box(0, 0.03, 0.05, 0.05, 0.075, 0.32, 0, C.mid);
      b.box(0, 0.004, -0.2, 0.044, 0.085, 0.24, 0, C.wood, { pitch: -0.1 }); b.box(0, -0.03, -0.31, 0.046, 0.12, 0.03, 0, C.rubber);
      b.box(0, -0.04, -0.04, 0.04, 0.09, 0.05, 0, C.wood, { pitch: 0.3 });
      zcyl(b, 0, 0.05, 0.2, 0.76, 0.02, 0.02, C.dark); zcyl(b, 0, 0.006, 0.2, 0.64, 0.019, 0.019, C.dark);
      zcyl(b, 0, 0.006, 0.3, 0.5, 0.03, 0.03, C.wood, 8);                                               // pump
      b.box(0, 0.075, 0.74, 0.008, 0.014, 0.012, 0, C.brass);
      stripe(b, 0, 0.07, 0.06, 0.052, 0.008, 0.12);
    },
    sniper(b) {
      b.box(0, 0.03, 0.08, 0.046, 0.07, 0.48, 0, C.mid);
      b.box(0, 0.0, -0.25, 0.044, 0.1, 0.3, 0, C.wood, { pitch: -0.07 }); b.box(0, 0.045, -0.26, 0.036, 0.03, 0.16, 0, C.wood); b.box(0, -0.02, -0.4, 0.046, 0.13, 0.025, 0, C.rubber);
      b.box(0, -0.045, -0.04, 0.04, 0.1, 0.05, 0, C.wood, { pitch: 0.3 });
      b.box(0, -0.06, 0.11, 0.034, 0.08, 0.07, 0, C.dark);
      zcyl(b, 0, 0.038, 0.3, 1.06, 0.014, 0.011, C.dark); zcyl(b, 0, 0.038, 1.0, 1.12, 0.02, 0.02, C.dark);
      zcyl(b, 0, 0.115, -0.06, 0.26, 0.026, 0.026, C.dark, 10); zcyl(b, 0, 0.115, 0.2, 0.3, 0.034, 0.034, C.dark, 10); zcyl(b, 0, 0.115, -0.1, -0.05, 0.031, 0.031, C.dark, 10);   // scope
      b.box(0, 0.082, 0.02, 0.02, 0.03, 0.03, 0, C.dark); b.box(0, 0.082, 0.18, 0.02, 0.03, 0.03, 0, C.dark);
      b.box(0.012, -0.11, 0.6, 0.008, 0.2, 0.012, 0, C.dark, { roll: 0.25 }); b.box(-0.012, -0.11, 0.6, 0.008, 0.2, 0.012, 0, C.dark, { roll: -0.25 });   // bipod
      stripe(b, 0, 0.068, 0.3, 0.048, 0.008, 0.14);
    },
    aurora(b) {
      b.box(0, 0.036, 0.08, 0.078, 0.11, 0.42, 0, C.mid);
      grip(b, -0.03, 0.046);
      b.box(0, 0.02, -0.22, 0.05, 0.09, 0.2, 0, C.dark); b.box(0, 0.0, -0.33, 0.056, 0.14, 0.03, 0, C.dark);
      b.box(0.034, 0.036, 0.44, 0.02, 0.05, 0.32, 0, C.light); b.box(-0.034, 0.036, 0.44, 0.02, 0.05, 0.32, 0, C.light);
      zcyl(b, 0, 0.036, 0.26, 0.6, 0.016, 0.016, C.teal, 8, { em: 2 });                                  // glowing core
      for (let k = 0; k < 4; k++) zcyl(b, 0, 0.036, 0.32 + k * 0.07, 0.335 + k * 0.07, 0.038, 0.038, C.dark, 8);
      b.box(0, 0.098, 0.06, 0.082, 0.012, 0.26, 0, C.teal, { em: 2 });
      stripe(b, 0, -0.03, 0.15, 0.064, 0.022, 0.13);
    },
  };

  const defs = {
    // ---- loot
    ammo(b) {
      b.box(0, 0, 0, 0.34, 0.2, 0.22, 0, C.green, { grad: 0.8 }); b.box(0, 0.105, 0, 0.35, 0.03, 0.23, 0, C.dark);
      b.box(0, 0.135, 0, 0.12, 0.03, 0.03, 0, C.dark); b.box(0.172, 0.02, 0, 0.012, 0.06, 0.05, 0, C.brass);
      b.param = 1; b.box(0, 0, 0.112, 0.2, 0.09, 0.006, 0, C.tint, { em: 2 }); b.box(0, 0, -0.112, 0.2, 0.09, 0.006, 0, C.tint, { em: 2 }); b.param = 0;
    },
    bandage(b) {
      b.beam(-0.1, 0, 0, 0.1, 0, 0, 0.115, 0.115, 12, C.cloth, { smooth: true, capCol: C.cloth });
      b.beam(-0.102, 0, 0, 0.102, 0, 0, 0.045, 0.045, 8, hexLin(0xb9b2a4), { smooth: true });
      b.box(0, 0, 0.116, 0.035, 0.11, 0.006, 0, C.red); b.box(0, 0, 0.116, 0.11, 0.035, 0.006, 0, C.red);
    },
    medkit(b) {
      b.box(0, 0, 0, 0.38, 0.24, 0.26, 0, C.red, { grad: 0.85 }); b.box(0, 0, 0, 0.385, 0.02, 0.265, 0, hexLin(0x8a1f1a));
      b.box(0, 0, 0.132, 0.055, 0.16, 0.006, 0, C.white); b.box(0, 0, 0.132, 0.16, 0.055, 0.006, 0, C.white);
      b.box(0, 0.14, 0, 0.15, 0.03, 0.04, 0, C.white); b.box(0.12, 0.02, 0.133, 0.03, 0.04, 0.008, 0, C.light); b.box(-0.12, 0.02, 0.133, 0.03, 0.04, 0.008, 0, C.light);
    },
    cell(b) {
      b.lathe(0, -0.13, 0, [[0.086, 0], [0.09, 0.03], [0.09, 0.27], [0.086, 0.3]], 12, C.cyan, { em: 2 });
      b.lathe(0, -0.17, 0, [[0.06, 0], [0.102, 0.012], [0.102, 0.05], [0.09, 0.056]], 12, C.dark, { capBottom: true }); b.lathe(0, 0.15, 0, [[0.09, 0], [0.102, 0.006], [0.102, 0.044], [0.05, 0.056]], 12, C.dark, { capTop: true });
      for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; b.box(Math.sin(a) * 0.095, 0.005, Math.cos(a) * 0.095, 0.022, 0.3, 0.012, a, C.dark); }
    },
    grenade(b) {
      b.blob(0, 0, 0, 0.1, 0.125, 0.1, C.green, { detail: 2 });
      for (let k = -1; k <= 1; k++) b.lathe(0, k * 0.045 - 0.006, 0, [[0.1, 0], [0.105, 0.006], [0.1, 0.012]], 12, hexLin(0x3d472a));
      b.lathe(0, 0.115, 0, [[0.04, 0], [0.04, 0.045], [0.02, 0.055]], 8, C.light, { capTop: true });
      b.box(0.038, 0.12, 0, 0.012, 0.11, 0.03, 0, C.light, { roll: -0.5 }); b.beam(-0.06, 0.15, 0, -0.03, 0.15, 0, 0.022, 0.022, 8, C.brass, { smooth: true });
    },
    // ---- chest: body and hinged lid (origin of the lid at the hinge)
    chest(b) {
      b.box(0, 0.26, 0, 0.94, 0.52, 0.6, 0, C.chestWood, { grad: 0.75 });
      for (const sx of [-0.36, 0, 0.36]) b.box(sx, 0.26, 0, 0.07, 0.54, 0.63, 0, C.iron);
      b.box(0, 0.035, 0, 0.98, 0.07, 0.64, 0, C.iron); b.box(0, 0.5, 0, 0.97, 0.05, 0.63, 0, C.iron);
      for (const sx of [-0.49, 0.49]) b.beam(sx, 0.3, -0.1, sx, 0.3, 0.1, 0.02, 0.02, 6, C.iron, { smooth: true });
      b.param = 1; b.box(0, 0.33, 0.318, 0.13, 0.16, 0.03, 0, C.tint, { em: 2 }); b.param = 0;
      b.box(0, 0.33, 0.33, 0.05, 0.06, 0.02, 0, C.iron);
    },
    chestLid(b) {
      // arched top: half a barrel along x
      const rings = [];
      for (const x of [-0.49, -0.3, 0, 0.3, 0.49]) { const r = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; r.push([x, Math.sin(a) * 0.17, 0.31 - Math.cos(a) * 0.32]); } r.push([x, -0.01, 0.63]); r.push([x, -0.01, -0.01]); rings.push(r); }
      b.loft(rings, C.chestWood, { capStart: true, capEnd: true });
      for (const sx of [-0.36, 0, 0.36]) { const r2 = []; for (const x of [sx - 0.036, sx + 0.036]) { const r = []; for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; r.push([x, Math.sin(a) * 0.185, 0.31 - Math.cos(a) * 0.335]); } r.push([x, -0.012, 0.645]); r.push([x, -0.012, -0.025]); r2.push(r); } b.loft(r2, C.iron, { capStart: true, capEnd: true }); }
    },
    // ---- supply drop
    crate(b) {
      b.box(0, 0.65, 0, 1.3, 1.3, 1.3, 0, C.orange, { grad: 0.8 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.64, 0.65, sz * 0.64, 0.08, 1.34, 0.08, 0, C.iron);
      for (const y of [0.04, 1.26]) { b.box(0, y, 0.64, 1.34, 0.08, 0.08, 0, C.iron); b.box(0, y, -0.64, 1.34, 0.08, 0.08, 0, C.iron); b.box(0.64, y, 0, 0.08, 0.08, 1.34, 0, C.iron); b.box(-0.64, y, 0, 0.08, 0.08, 1.34, 0, C.iron); }
      b.box(0, 0.65, 0, 1.33, 0.2, 1.33, 0, C.teal, { em: 2 });
    },
    chute(b) {
      // canopy with scalloped gores, alternating colours, and the lines down to the crate
      const N = 16, rings = [], cols = [];
      for (const [t, r, y] of [[0, 2.9, 5.0], [0.3, 2.75, 5.7], [0.6, 2.2, 6.4], [0.85, 1.2, 6.95], [1, 0.25, 7.15]]) {
        const ring = [];
        for (let k = 0; k < N * 2; k++) { const a = k / (N * 2) * TAU, puff = (k & 1) ? 1.06 : 0.94; ring.push([Math.sin(a) * r * (t < 0.9 ? puff : 1), y + ((k & 1) && t < 0.1 ? 0.12 : 0), Math.cos(a) * r * (t < 0.9 ? puff : 1)]); }
        rings.push(ring); cols.push(C.cloth);
      }
      const v0 = b.count;
      b.loft(rings, C.cloth, { cols });
      b.loft(rings.map(r => r.slice().reverse()), scaleCol(C.cloth, 0.8), {});          // the underside, seen from the ground
      for (let k = v0; k < b.count; k++) { const a = Math.atan2(b.p[k * 3], b.p[k * 3 + 2]); if (Math.floor((a / TAU + 1) * 8) & 1) { b.c[k * 4] = C.teal[0] * 0.6; b.c[k * 4 + 1] = C.teal[1] * 0.6; b.c[k * 4 + 2] = C.teal[2] * 0.6; } }
      for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * TAU; b.beam(Math.sin(a) * 2.8, 5.05, Math.cos(a) * 2.8, Math.sign(Math.sin(a)) * 0.6, 1.32, Math.sign(Math.cos(a)) * 0.6, 0.014, 0.014, 4, C.dark, { noCaps: true }); }
    },
    // ---- transport plane (nose toward +z) and its propeller
    plane(b) {
      b.tube([[0, 0.2, -10.5, 0.25], [0, 0.35, -8.5, 0.95], [0, 0.1, -5, 1.55], [0, 0, 0, 1.75], [0, 0, 5.5, 1.72], [0, -0.1, 9, 1.4], [0, -0.35, 11.4, 0.75], [0, -0.5, 12.3, 0.2]], 14, C.body, { caps: true });
      b.blob(0, 0.55, 9.6, 1.0, 0.62, 1.7, C.planeDark, { detail: 2 });                                        // cockpit glazing
      // wing: thick at the root, thin and swept at the tips
      for (const sx of [-1, 1]) {
        const rings = [];
        for (const [x, chord, th, zo, y] of [[0.8, 4.4, 0.52, 0.6, 0.95], [7, 3.4, 0.4, 0.2, 1.15], [13, 2.3, 0.26, -0.3, 1.4], [15.2, 1.2, 0.12, -0.7, 1.5]]) {
          const r = [];
          for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; r.push([sx * x, y + Math.sin(a) * th * 0.5, zo + Math.cos(a) * chord * 0.5]); }
          rings.push(sx > 0 ? r.reverse() : r);
        }
        b.loft(rings, C.body, { capEnd: true });
        for (const ex of [5.6, 10.4]) { b.tube([[sx * ex, 0.55, -1.0, 0.5], [sx * ex, 0.5, 0.6, 0.8], [sx * ex, 0.5, 2.6, 0.78], [sx * ex, 0.5, 3.5, 0.5]], 10, C.planeDark, { caps: true }); }
        b.box(sx * 1.74, 0.25, 0.5, 0.06, 0.46, 13, 0, C.teal, { em: 2 });
        // tail plane
        const tr = [];
        for (const [x, chord, th, zo] of [[0.3, 2.6, 0.26, -8.6], [5, 1.4, 0.14, -9.2]]) { const r = []; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; r.push([sx * x, 0.9 + Math.sin(a) * th * 0.5, zo + Math.cos(a) * chord * 0.5]); } tr.push(sx > 0 ? r.reverse() : r); }
        b.loft(tr, C.body, { capEnd: true });
      }
      const fin = [];
      for (const [y, chord, th, zo] of [[0.7, 3.4, 0.3, -8.2], [4.6, 1.5, 0.14, -9.5]]) { const r = []; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; r.push([Math.sin(a) * th * 0.5, y, zo + Math.cos(a) * chord * 0.5]); } fin.push(r); }
      b.loft(fin, C.body, { capEnd: true });
      b.box(0, 4.2, -9.4, 0.2, 0.7, 1.5, 0, C.teal, { em: 2 });
      for (let k = -4; k <= 4; k++) for (const sx of [-1, 1]) b.box(sx * 1.73, 0.7, k * 1.3, 0.05, 0.36, 0.5, 0, C.planeDark);     // windows
      b.box(0, -0.2, -9.9, 2.0, 1.9, 0.12, 0, C.planeDark);                                                                         // ramp door
    },
    prop(b) {
      b.lathe(0, 0, 0, [[0.34, 0], [0.3, 0.25], [0.16, 0.55], [0.02, 0.7]], 10, C.light, { capBottom: true });
      b.transform(0, m4.compose(m4.create(), 0, 0, 0, 0, Math.PI / 2, 0, 1, 1, 1));
      for (let k = 0; k < 3; k++) { const v0 = b.count; b.box(0, 1.1, 0.2, 0.3, 2.0, 0.05, 0.35, C.dark); b.transform(v0, m4.compose(m4.create(), 0, 0, 0, 0, 0, k / 3 * TAU, 1, 1, 1)); }
    },
    // ---- glider: arched wing in the pilot's colour, frame and harness lines (origin at the pilot's hips)
    glider(b) {
      const rings = [], cols = [];
      b.param = 1;
      for (const [x, chord, lift, zo] of [[-2.25, 0.9, 0.34, -0.25], [-1.6, 1.45, 0.16, -0.12], [-0.8, 1.7, 0.04, -0.05], [0, 1.78, 0, 0], [0.8, 1.7, 0.04, -0.05], [1.6, 1.45, 0.16, -0.12], [2.25, 0.9, 0.34, -0.25]]) {
        const r = [];
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; r.push([x, 1.55 + lift + Math.sin(a) * 0.05 + Math.max(0, Math.cos(a)) * 0.06, zo - 0.1 + Math.cos(a) * chord * 0.5]); }
        rings.push(r.reverse()); cols.push(Math.abs(x) > 1 && Math.abs(x) < 2 ? C.tint : scaleCol(C.tint, 0.78));
      }
      b.loft(rings, withMat(C.tint, 'fabric'), { cols: cols.map(c => withMat(c, 'fabric')), capStart: true, capEnd: true });
      b.param = 0;
      b.beam(-2.2, 1.86, 0.2, 2.2, 1.86, 0.2, 0.022, 0.022, 5, C.dark, { smooth: true }); b.beam(0, 1.5, -0.95, 0, 1.56, 0.8, 0.022, 0.022, 5, C.dark, { smooth: true });
      b.beam(-0.4, 0.97, 0.12, 0.4, 0.97, 0.12, 0.018, 0.018, 5, C.light, { smooth: true });                 // control bar
      for (const sx of [-1, 1]) { b.beam(sx * 0.4, 0.97, 0.12, sx * 1.3, 1.66, 0.25, 0.008, 0.008, 4, C.dark, { noCaps: true }); b.beam(sx * 0.4, 0.97, 0.12, 0, 1.52, 0.7, 0.008, 0.008, 4, C.dark, { noCaps: true }); b.beam(sx * 0.12, 0.5, -0.12, sx * 0.3, 1.5, -0.2, 0.008, 0.008, 4, C.dark, { noCaps: true }); }
    },
    // ---- windmill sails (rotates around z, hub at the origin)
    windmill(b) {
      b.lathe(0, 0, 0, [[0.42, 0], [0.4, 0.5], [0.22, 0.8], [0.02, 0.9]], 10, C.dark, { capBottom: true });
      b.transform(0, m4.compose(m4.create(), 0, 0, -0.2, 0, Math.PI / 2, 0, 1, 1, 1));
      for (let k = 0; k < 4; k++) {
        const v0 = b.count;
        b.box(0, 3.5, 0.4, 0.14, 6.8, 0.12, 0, C.wood);
        for (let i = 0; i < 9; i++) b.box(0.52, 1.3 + i * 0.62, 0.38, 1.0, 0.045, 0.05, 0, C.wood);
        b.box(1.02, 3.8, 0.38, 0.05, 5.1, 0.05, 0, C.wood);
        b.box(0.52, 3.8, 0.35, 0.96, 5.0, 0.012, 0, C.canvas, { roll: 0, pitch: 0 });
        b.transform(v0, m4.compose(m4.create(), 0, 0, 0, 0, 0, k * Math.PI / 2, 1, 1, 1));
      }
    },
  };
  for (const k in GUNS) defs[k] = GUNS[k];

  return {
    // most instances of each model in one frame (held and dropped weapons, loot within sight, ...); extra ones are skipped
    CAP: { pistol: 120, smg: 120, ar: 120, shotgun: 120, sniper: 120, aurora: 120, ammo: 240, bandage: 160, medkit: 100, cell: 140, grenade: 120, chest: 80, chestLid: 80, crate: 8, chute: 8, plane: 2, prop: 8, glider: 44, windmill: 4 },
    NO_SHADOW: {},
    GLASS: {},                 // models drawn in the translucent pass (window panes of vehicles)
    extra: {},                 // models registered by other files (js/vehmodel.js): name -> builder
    // where the supporting hand holds each weapon (metres in front of the grip)
    FORE: { pistol: 0.02, smg: 0.13, ar: 0.2, shotgun: 0.24, sniper: 0.24, aurora: 0.2 },
    build() { const out = {}; for (const k in defs) out[k] = mk(defs[k]); for (const k in this.extra) out[k] = mk(this.extra[k]); return out; },
  };
})();
