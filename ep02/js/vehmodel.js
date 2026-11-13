// AURORA FALL — vehicles as seen: the models (frames of tube, lofted panels, wheels) and how an instance is put together
// each frame. The body panels are built with `param = 1`, so they take the paint of the instance; lamps glow with its
// emissive value (on while somebody drives). The driver is posed by CharModel (see drawDriver there).
'use strict';

const VehModel = (function () {
  const C = {
    paint: withMat([1, 1, 1], 'metal'), dark: matCol(0x1f2226, 'metal'), mid: matCol(0x3a3f47, 'metal'), steel: matCol(0x8a9199, 'metal'), chrome: matCol(0xc9ced4, 'metal'),
    tyre: hexLin(0x131415), tread: hexLin(0x0c0d0e), rim: hexLin(0x9aa1a9), hub: hexLin(0x23262b), seat: matCol(0x2b2622, 'fabric'), black: hexLin(0x0d0e10),
    lamp: hexLin(0xfff0c8), tail: hexLin(0xff2a18), glass: matCol(0x9fc4d8, MAT_GLASS), wood: matCol(0x7a5a3a, 'planks'),
    spring: matCol(0xc8452f, 'metal'), can: matCol(0x9c2f2a, 'metal'), bed: matCol(0x2e3238, 'ribbed'), rubber: hexLin(0x18191b),
  };
  const painted = (b, fn) => { b.param = 1; fn(); b.param = 0; };
  const tube = (b, pts, r, col, sides) => b.tube(pts.map(p => [p[0], p[1], p[2], p[3] || r]), sides || 6, col, { caps: true });
  // the same thing on both sides
  const both = fn => { fn(1); fn(-1); };

  // ---- a wheel: tyre with tread blocks, dished rim with spokes. Turns about the x axis; built upright, then laid over.
  function wheel(b, R, W, o) {
    const v0 = b.count, hw = W / 2, rr = R * o.rim, n = o.sides || 18;
    const prof = [[0.001, -hw * 0.34], [rr * 0.45, -hw * 0.4], [rr * 0.9, -hw * 0.78], [rr, -hw * 0.9], [rr, -hw * 0.9],
      [R * 0.9, -hw], [R * 0.985, -hw * 0.7], [R, -hw * 0.3], [R, hw * 0.3], [R * 0.985, hw * 0.7], [R * 0.9, hw],
      [rr, hw * 0.9], [rr, hw * 0.9], [rr * 0.9, hw * 0.78], [rr * 0.45, hw * 0.4], [0.001, hw * 0.34]];
    const cols = prof.map((q, i) => (i < 2 || i > 13 ? C.hub : i < 4 || i > 11 ? C.rim : C.tyre));
    b.lathe(0, 0, 0, prof, n, C.tyre, { cols });
    for (let k = 0; k < o.lugs; k++) {                          // tread: blocks alternating between the two shoulders
      const a = k / o.lugs * TAU, sd = k & 1 ? 1 : -1;
      b.box(Math.sin(a) * (R + 0.008), sd * hw * 0.46, Math.cos(a) * (R + 0.008), o.lugW, hw * 0.86, 0.034, a, C.tread);
    }
    for (const sd of [-1, 1]) for (let k = 0; k < o.spokes; k++) {     // spokes on both faces
      const a = k / o.spokes * TAU + (sd > 0 ? 0 : 0.3);
      b.box(Math.sin(a) * rr * 0.52, sd * hw * (0.5 + o.dish), Math.cos(a) * rr * 0.52, o.spokeW, 0.022, rr * 0.92, a, C.rim);
    }
    for (const sd of [-1, 1]) b.cyl(0, sd * hw * (0.44 + o.dish) - 0.015, 0, rr * 0.2, rr * 0.16, 0.03, 8, C.steel);          // hub cap
    b.transform(v0, m4.compose(m4.create(), 0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 1));
  }
  // arc of flattened tube over a wheel (mudguard, wheel-arch flare): centre (y, z), radius, from angle a0 to a1 (0 = straight up, + = forward)
  function arc(b, x, y, z, rad, a0, a1, r, squash, col, n) {
    const pts = [];
    for (let k = 0; k <= n; k++) { const a = lerp(a0, a1, k / n); pts.push([x, y + Math.cos(a) * rad, z + Math.sin(a) * rad, r]); }
    b.tube(pts, 6, col, { caps: true, squash });
  }
  // ring of tube: a steering wheel, facing along the axis (ax, ay, az)
  function ring(b, cx, cy, cz, ax, ay, az, rad, r, col) {
    const l = Math.hypot(ax, ay, az), dx = ax / l, dy = ay / l, dz = az / l;
    // two directions across the axis: u to the side, w = axis x u
    const ux = 1, uy = 0, uz = 0, wx = dy * uz - dz * uy, wy = dz * ux - dx * uz, wz = dx * uy - dy * ux;
    const pts = [];
    for (let k = 0; k <= 12; k++) { const a = k / 12 * TAU, c = Math.cos(a) * rad, s = Math.sin(a) * rad; pts.push([cx + ux * c + wx * s, cy + uy * c + wy * s, cz + uz * c + wz * s, r]); }
    b.tube(pts, 5, col, {});
    for (const a of [0.5, 2.6, 4.7]) b.beam(cx, cy, cz, cx + ux * Math.cos(a) * rad + wx * Math.sin(a) * rad, cy + wy * Math.sin(a) * rad, cz + wz * Math.sin(a) * rad, r * 0.9, r * 0.9, 4, col, { noCaps: true });
  }
  // rounded cross-section in the x-y plane at z (for lofting a body from the tail to the nose): half-width w, y0 .. y1,
  // corner radius r, crown = extra height in the middle of the top
  function sect(z, w, y0, y1, r, crown) {
    const pts = [], q = 3;
    for (const [sx, sy, a0] of [[1, -1, -Math.PI / 2], [1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI]]) for (let k = 0; k <= q; k++) {
      const a = a0 + k / q * Math.PI / 2, x = sx * (w - r) + Math.cos(a) * r;
      pts.push([x, (sy > 0 ? y1 - r : y0 + r) + Math.sin(a) * r + (sy > 0 && crown ? crown * (1 - x * x / (w * w)) : 0), z]);
    }
    return pts;
  }

  const defs = {
    // ------------------------------------------------------------------ wheels
    wheel(b) { wheel(b, 0.38, 0.3, { rim: 0.56, lugs: 22, lugW: 0.075, spokes: 5, spokeW: 0.07, dish: 0.12 }); },
    bikeWheel(b) {
      wheel(b, 0.33, 0.13, { rim: 0.74, lugs: 26, lugW: 0.045, spokes: 9, spokeW: 0.016, dish: 0.3, sides: 20 });
      b.beam(0.052, 0, 0, 0.058, 0, 0, 0.115, 0.115, 12, C.steel, { smooth: true });           // brake disc
    },
    // the same wheels from further off: no tread blocks, no spokes
    wheelLo(b) { wheel(b, 0.38, 0.3, { rim: 0.56, lugs: 0, spokes: 0, dish: 0.12, sides: 10 }); },
    bikeWheelLo(b) { wheel(b, 0.33, 0.13, { rim: 0.74, lugs: 0, spokes: 0, dish: 0.3, sides: 10 }); },

    // ------------------------------------------------------------------ motorbike (off-road): everything but the fork
    bike(b) {
      // frame: backbone, down tube, cradle, seat rails
      tube(b, [[0, 0.98, 0.48], [0, 0.9, 0.2], [0, 0.84, -0.12], [0, 0.82, -0.5], [0, 0.86, -0.86]], 0.026, C.dark);
      tube(b, [[0, 0.95, 0.46], [0, 0.56, 0.36], [0, 0.3, 0.2], [0, 0.26, -0.14], [0, 0.42, -0.26], [0, 0.82, -0.3]], 0.024, C.dark);
      both(s => tube(b, [[s * 0.07, 0.8, -0.2], [s * 0.1, 0.62, -0.5], [s * 0.09, 0.84, -0.84]], 0.016, C.dark));
      // engine: crankcase, finned cylinder leaning forward, carburettor, skid plate
      b.blob(0, 0.4, 0.04, 0.13, 0.13, 0.19, C.steel, { detail: 1 });
      b.box(0, 0.36, 0.04, 0.3, 0.2, 0.2, 0, C.mid);
      for (let k = 0; k < 5; k++) b.box(0, 0.53 + k * 0.045, 0.1 + k * 0.016, 0.17 - k * 0.006, 0.02, 0.16, 0, C.steel, { pitch: -0.3 });
      b.box(0, 0.62, 0.115, 0.12, 0.22, 0.11, 0, C.mid, { pitch: -0.3 });
      b.box(0, 0.76, 0.17, 0.13, 0.05, 0.14, 0, C.dark, { pitch: -0.3 });
      b.beam(0, 0.6, -0.02, 0, 0.64, -0.16, 0.035, 0.045, 6, C.dark, { smooth: true });
      b.box(0, 0.25, 0.08, 0.2, 0.02, 0.42, 0, C.steel, { pitch: 0.12 });
      // exhaust: out of the front of the cylinder, round the right side, up to a silencer under the seat
      tube(b, [[0, 0.62, 0.2], [-0.06, 0.5, 0.26], [-0.13, 0.4, 0.14], [-0.15, 0.44, -0.2], [-0.15, 0.62, -0.42]], 0.022, C.chrome);
      b.beam(-0.15, 0.62, -0.4, -0.16, 0.74, -0.82, 0.05, 0.045, 8, C.steel, { smooth: true, capCol: C.black });
      // tank, seat, panels and mudguard in the paint
      painted(b, () => {
        b.blob(0, 0.9, 0.22, 0.135, 0.105, 0.25, C.paint, { detail: 2 });
        both(s => b.box(s * 0.135, 0.8, 0.3, 0.018, 0.22, 0.3, s * 0.2, C.paint, { pitch: -0.25 }));          // shrouds beside the tank
        both(s => b.box(s * 0.125, 0.7, -0.44, 0.016, 0.2, 0.3, s * -0.06, C.paint, { pitch: 0.12 }));        // number boards
        arc(b, 0, 0.33, -0.68, 0.43, -0.2, -1.35, 0.03, 3.4, C.paint, 6);
      });
      b.blob(0, 0.905, -0.3, 0.115, 0.05, 0.34, C.seat, { detail: 1 });
      b.box(0, 0.86, -0.3, 0.2, 0.05, 0.6, 0, C.seat);
      // swing arm, shock, chain, pegs, rear light
      both(s => tube(b, [[s * 0.07, 0.4, -0.2], [s * 0.1, 0.33, -0.68]], 0.022, C.steel));
      b.beam(0, 0.78, -0.3, 0, 0.44, -0.42, 0.03, 0.03, 6, C.spring, { smooth: true });
      b.box(0.085, 0.37, -0.42, 0.012, 0.03, 0.5, 0, C.black, { pitch: 0.16 });
      b.beam(0.09, 0.33, -0.68, 0.096, 0.33, -0.68, 0.085, 0.085, 10, C.steel, { smooth: true });
      both(s => { b.beam(s * 0.1, 0.36, -0.1, s * 0.27, 0.36, -0.11, 0.016, 0.016, 5, C.steel, { smooth: true }); });
      b.box(0, 0.83, -0.9, 0.09, 0.04, 0.03, 0, C.tail, { em: 2 });
    },
    // the fork with handlebar, headlamp and front mudguard. Origin at the steering head, y along the steering axis.
    bikeFork(b) {
      both(s => {
        b.beam(s * 0.095, 0.1, 0, s * 0.095, -0.34, 0, 0.022, 0.022, 6, C.chrome, { smooth: true });
        b.beam(s * 0.095, -0.3, 0, s * 0.095, -0.7, 0, 0.03, 0.03, 6, C.dark, { smooth: true });
      });
      b.box(0, 0.07, 0, 0.26, 0.03, 0.09, 0, C.dark); b.box(0, -0.12, 0, 0.26, 0.035, 0.09, 0, C.dark);
      b.beam(-0.11, -0.693, 0, 0.11, -0.693, 0, 0.016, 0.016, 5, C.steel, { smooth: true });
      // bar with a cross brace, grips, levers
      tube(b, [[-0.37, 0.14, -0.03], [-0.22, 0.2, -0.03], [-0.07, 0.11, 0], [0.07, 0.11, 0], [0.22, 0.2, -0.03], [0.37, 0.14, -0.03]], 0.013, C.steel);
      b.beam(-0.2, 0.19, -0.03, 0.2, 0.19, -0.03, 0.009, 0.009, 4, C.steel, { noCaps: true });
      both(s => { b.beam(s * 0.27, 0.165, -0.03, s * 0.39, 0.135, -0.03, 0.02, 0.02, 6, C.rubber, { smooth: true }); b.beam(s * 0.26, 0.17, 0.02, s * 0.37, 0.15, 0.03, 0.006, 0.006, 4, C.steel, { noCaps: true }); });
      // headlamp in a number plate, mudguard above the wheel
      painted(b, () => {
        b.box(0, -0.03, 0.09, 0.24, 0.26, 0.03, 0, C.paint, { pitch: 0.12 });
        const pts = [];
        for (let k = 0; k <= 6; k++) { const a = lerp(-0.5, 1.15, k / 6); pts.push([0, -0.693 + Math.cos(a) * 0.43, Math.sin(a) * 0.43, 0.028]); }
        b.tube(pts, 6, C.paint, { caps: true, squash: 3.2 });
      });
      b.beam(0, -0.03, 0.105, 0, -0.03, 0.125, 0.075, 0.07, 10, C.lamp, { smooth: true, em: 2 });
    },

    // ------------------------------------------------------------------ dune buggy: a cage of tube with a few panels
    buggy(b) {
      const T = 0.034;
      both(s => {
        tube(b, [[s * 0.62, 0.34, -1.28], [s * 0.67, 0.34, 0.5], [s * 0.42, 0.36, 1.48]], T, C.mid);                                   // lower rail
        tube(b, [[s * 0.67, 0.76, -1.3], [s * 0.72, 0.74, 0.5], [s * 0.45, 0.6, 1.48]], T, C.mid);                                    // sill
        tube(b, [[s * 0.72, 0.74, 0.5], [s * 0.64, 1.3, 0.2], [s * 0.6, 1.52, 0.02], [s * 0.6, 1.53, -0.76], [s * 0.66, 0.78, -1.3]], T, C.mid);    // screen pillar, roof rail, rear stay
        tube(b, [[s * 0.66, 0.34, -0.74], [s * 0.64, 1.0, -0.76], [s * 0.6, 1.53, -0.76]], T, C.mid);                                 // hoop behind the seats
        tube(b, [[s * 0.67, 0.34, 0.5], [s * 0.72, 0.74, 0.5]], T, C.mid);
        tube(b, [[s * 0.62, 0.34, -1.28], [s * 0.67, 0.76, -1.3]], T, C.mid);
        tube(b, [[s * 0.42, 0.36, 1.48], [s * 0.45, 0.6, 1.48]], T, C.mid);
        tube(b, [[s * 0.6, 1.53, -0.76], [s * 0.3, 0.8, -1.3]], T * 0.8, C.mid);                                                      // braces
        tube(b, [[s * 0.66, 0.36, -0.74], [s * 0.7, 0.74, -0.1]], T * 0.8, C.mid);
        // suspension: wishbones out to the hubs, coil over a damper
        for (const [z, y] of [[1.15, 0.38], [-1.05, 0.38]]) {
          tube(b, [[s * 0.4, 0.36, z + 0.2], [s * 0.6, y - 0.06, z], [s * 0.4, 0.36, z - 0.2]], 0.022, C.steel);
          tube(b, [[s * 0.42, 0.6, z + 0.12], [s * 0.6, y + 0.1, z], [s * 0.42, 0.6, z - 0.12]], 0.018, C.steel);
          b.beam(s * 0.45, 0.78, z, s * 0.58, 0.4, z, 0.045, 0.045, 7, C.spring, { smooth: true });
          b.beam(s * 0.44, 0.8, z, s * 0.59, 0.36, z, 0.02, 0.02, 5, C.steel, { smooth: true });
        }
        // mudguards over the rear wheels, lamps
        painted(b, () => arc(b, s * 0.75, 0.38, -1.05, 0.5, -1.0, 0.9, 0.03, 4.2, C.paint, 7));
        b.beam(s * 0.3, 0.66, 1.56, s * 0.3, 0.66, 1.6, 0.085, 0.08, 10, C.lamp, { smooth: true, em: 2 });
        b.beam(s * 0.3, 0.66, 1.5, s * 0.3, 0.66, 1.565, 0.095, 0.095, 10, C.dark, { smooth: true });
        b.box(s * 0.52, 0.76, -1.345, 0.14, 0.07, 0.03, 0, C.tail, { em: 2 });
      });
      // cross members, nudge bar
      for (const [w, y, z] of [[0.6, 1.52, 0.02], [0.6, 1.53, -0.76], [0.72, 0.74, 0.5], [0.67, 0.76, -1.3], [0.42, 0.36, 1.48], [0.45, 0.6, 1.48], [0.64, 1.0, -0.76], [0.66, 0.34, -0.74], [0.62, 0.34, -1.28]]) tube(b, [[-w, y, z], [w, y, z]], T, C.mid);
      tube(b, [[-0.6, 1.53, -0.76], [0.6, 1.52, 0.02]], T * 0.8, C.mid);
      b.beam(-0.5, 0.42, 1.62, 0.5, 0.42, 1.62, T, T, 6, C.steel, { smooth: true }); b.beam(-0.44, 0.74, 1.6, 0.44, 0.74, 1.6, T * 0.85, T * 0.85, 6, C.steel, { smooth: true });
      both(s => { b.beam(s * 0.44, 0.36, 1.48, s * 0.5, 0.42, 1.62, T, T, 6, C.steel, { smooth: true }); b.beam(s * 0.5, 0.42, 1.62, s * 0.44, 0.74, 1.6, T * 0.85, T * 0.85, 6, C.steel, { smooth: true }); });
      // floor, firewall, dashboard
      b.box(0, 0.33, -0.08, 1.3, 0.035, 2.5, 0, C.dark);
      b.box(0, 0.56, 0.52, 1.36, 0.42, 0.04, 0, C.dark);
      b.box(0, 0.8, 0.44, 1.3, 0.12, 0.2, 0, C.black, { pitch: -0.3 });
      b.box(0.34, 0.84, 0.36, 0.26, 0.09, 0.03, 0, C.steel, { pitch: -0.5 });
      // bonnet, side panels, roof: the paint
      painted(b, () => {
        b.loft([sect(0.5, 0.7, 0.72, 0.8, 0.03, 0.045), sect(1.0, 0.6, 0.66, 0.74, 0.03, 0.045), sect(1.4, 0.47, 0.58, 0.66, 0.03, 0.03), sect(1.52, 0.4, 0.54, 0.6, 0.025, 0.01)], C.paint, { capStart: true, capEnd: true });
        both(s => b.box(s * 0.705, 0.55, -0.36, 0.03, 0.36, 1.7, 0, C.paint, { roll: s * -0.06 }));
        both(s => b.box(s * 0.6, 0.5, 1.0, 0.03, 0.26, 0.92, s * -0.24, C.paint, { roll: s * -0.06 }));
        b.loft([sect(-0.74, 0.6, 1.545, 1.58, 0.015, 0.03), sect(-0.36, 0.61, 1.545, 1.585, 0.015, 0.04), sect(0.02, 0.6, 1.54, 1.575, 0.015, 0.03)], C.paint, { capStart: true, capEnd: true });
        b.box(0, 0.86, -0.86, 1.04, 0.2, 0.2, 0, C.paint);                                                                        // fuel tank
      });
      // seats
      both(s => {
        b.box(s * 0.34, 0.42, -0.2, 0.42, 0.09, 0.44, 0, C.seat);
        b.box(s * 0.34, 0.76, -0.47, 0.42, 0.64, 0.09, 0, C.seat, { pitch: -0.2 });
        b.box(s * 0.34, 1.13, -0.56, 0.24, 0.16, 0.08, 0, C.seat, { pitch: -0.2 });
        for (const e of [-1, 1]) b.box(s * 0.34 + e * 0.215, 0.5, -0.24, 0.035, 0.2, 0.42, 0, C.black);
      });
      // steering
      b.beam(0.34, 0.68, 0.5, 0.34, 0.9, 0.14, 0.018, 0.018, 5, C.dark, { smooth: true });
      ring(b, 0.34, 0.9, 0.14, 0, 0.24, -0.36, 0.17, 0.016, C.black);
      // engine at the back: block, heads, air filter, belt cover, two silencers
      b.box(0, 0.6, -1.08, 0.5, 0.34, 0.42, 0, C.mid);
      both(s => { b.box(s * 0.34, 0.64, -1.08, 0.2, 0.2, 0.32, 0, C.steel, { roll: s * -0.5 }); for (let k = 0; k < 4; k++) b.box(s * 0.36, 0.64, -1.2 + k * 0.08, 0.26, 0.24, 0.016, 0, C.dark, { roll: s * -0.5 }); });
      b.cyl(0, 0.78, -1.04, 0.13, 0.13, 0.13, 10, C.chrome);
      b.beam(0, 0.6, -1.3, 0, 0.6, -1.33, 0.16, 0.16, 10, C.dark, { smooth: true });
      both(s => { tube(b, [[s * 0.3, 0.5, -1.2], [s * 0.34, 0.44, -1.34], [s * 0.24, 0.46, -1.5]], 0.025, C.chrome); b.beam(s * 0.24, 0.46, -1.42, s * 0.2, 0.5, -1.72, 0.06, 0.055, 8, C.steel, { smooth: true, capCol: C.black }); });
      // lamps on the roof bar, aerial
      for (const x of [-0.36, -0.12, 0.12, 0.36]) { b.beam(x, 1.6, 0.03, x, 1.6, 0.09, 0.062, 0.058, 8, C.lamp, { smooth: true, em: 2 }); b.beam(x, 1.6, -0.02, x, 1.6, 0.045, 0.07, 0.07, 8, C.dark, { smooth: true }); }
      b.beam(-0.6, 1.53, -0.76, -0.62, 2.5, -0.9, 0.007, 0.004, 4, C.dark, { noCaps: true });
      painted(b, () => b.box(-0.62, 2.42, -0.99, 0.01, 0.12, 0.2, 0, C.paint));
    },

    // ------------------------------------------------------------------ pickup truck
    truck(b) {
      painted(b, () => {
        // one skin from the tailgate to the nose: load-bed height, then the cab up to the windows, then the bonnet
        b.loft([sect(-2.43, 0.86, 0.5, 0.78, 0.07), sect(-2.36, 0.9, 0.46, 0.8, 0.08), sect(-0.72, 0.9, 0.44, 0.8, 0.08), sect(-0.66, 0.92, 0.44, 1.28, 0.1), sect(0.94, 0.92, 0.44, 1.28, 0.1),
          sect(1.06, 0.92, 0.44, 1.1, 0.12, 0.04), sect(1.9, 0.91, 0.46, 1.07, 0.12, 0.04), sect(2.3, 0.88, 0.48, 1.0, 0.12, 0.03), sect(2.43, 0.82, 0.52, 0.9, 0.1, 0.01)], C.paint, { capStart: true, capEnd: true });
        // load bed: sides and tailgate
        both(s => b.box(s * 0.865, 0.98, -1.53, 0.07, 0.4, 1.78, 0, C.paint));
        b.box(0, 0.98, -2.395, 1.8, 0.4, 0.07, 0, C.paint); b.box(0, 0.98, -0.69, 1.66, 0.4, 0.06, 0, C.paint);
        // cab: pillars, rails, roof
        both(s => {
          tube(b, [[s * 0.87, 1.27, 0.97], [s * 0.78, 1.86, 0.5]], 0.045, C.paint);
          tube(b, [[s * 0.78, 1.86, 0.5], [s * 0.8, 1.87, -0.58]], 0.045, C.paint);
          tube(b, [[s * 0.88, 1.27, -0.62], [s * 0.8, 1.87, -0.58]], 0.05, C.paint);
          b.box(s * 0.875, 1.36, 0.8, 0.05, 0.06, 0.05, 0, C.paint);
        });
        tube(b, [[-0.78, 1.86, 0.5], [0.78, 1.86, 0.5]], 0.045, C.paint); tube(b, [[-0.8, 1.87, -0.58], [0.8, 1.87, -0.58]], 0.05, C.paint);
        b.loft([sect(-0.6, 0.8, 1.85, 1.9, 0.02, 0.04), sect(-0.05, 0.8, 1.85, 1.905, 0.02, 0.05), sect(0.5, 0.78, 1.84, 1.89, 0.02, 0.04)], C.paint, { capStart: true, capEnd: true });
        both(s => b.box(s * 1.0, 1.4, 0.82, 0.09, 0.15, 0.03, 0, C.paint));                                                     // mirrors
      });
      // nose: grille, lamps, bumper
      b.box(0, 0.8, 2.445, 1.24, 0.26, 0.03, 0, C.black);
      for (let k = 0; k < 4; k++) b.box(0, 0.71 + k * 0.06, 2.462, 1.2, 0.018, 0.012, 0, C.chrome);
      both(s => { b.box(s * 0.7, 0.86, 2.4, 0.28, 0.15, 0.06, 0, C.lamp, { em: 2, yaw: 0 }); b.box(s * 0.7, 0.86, 2.39, 0.32, 0.19, 0.05, 0, C.dark); b.box(s * 0.8, 0.72, 2.4, 0.12, 0.06, 0.05, 0, hexLin(0xffa028), { em: 2 }); });
      b.beam(-0.9, 0.5, 2.5, 0.9, 0.5, 2.5, 0.1, 0.1, 8, C.steel, { smooth: true }); b.box(0, 0.5, 2.6, 0.36, 0.13, 0.012, 0, C.black);
      // tail: lamps, bumper, plate
      both(s => b.box(s * 0.84, 0.94, -2.436, 0.1, 0.3, 0.02, 0, C.tail, { em: 2 }));
      b.beam(-0.9, 0.5, -2.46, 0.9, 0.5, -2.46, 0.085, 0.085, 8, C.steel, { smooth: true }); b.box(0, 0.74, -2.438, 0.34, 0.12, 0.012, 0, hexLin(0xd8d8d0));
      b.box(0, 1.0, -2.435, 0.3, 0.05, 0.02, 0, C.dark);
      // sills, wheel-arch flares, door seams and handles
      both(s => {
        b.box(s * 0.93, 0.43, 0.1, 0.12, 0.05, 1.6, 0, C.dark);
        for (const z of [1.5, -1.4]) arc(b, s * 0.915, 0.42, z, 0.51, -1.35, 1.35, 0.045, 1.5, C.dark, 9);
        b.box(s * 0.924, 0.9, 0.94, 0.006, 0.74, 0.012, 0, C.black); b.box(s * 0.924, 0.9, -0.6, 0.006, 0.74, 0.012, 0, C.black);
        b.box(s * 0.93, 1.1, -0.42, 0.02, 0.03, 0.13, 0, C.chrome);
      });
      // inside the cab: dashboard, seats, steering wheel (seen through the glass)
      b.box(0, 1.22, 0.84, 1.7, 0.16, 0.28, 0, C.black);
      both(s => { b.box(s * 0.42, 1.1, -0.34, 0.5, 0.62, 0.11, 0, C.seat, { pitch: -0.14 }); b.box(s * 0.42, 1.5, -0.4, 0.26, 0.18, 0.09, 0, C.seat, { pitch: -0.14 }); });
      b.beam(0.42, 1.12, 0.82, 0.42, 1.3, 0.46, 0.02, 0.02, 5, C.dark, { smooth: true });
      ring(b, 0.42, 1.3, 0.46, 0, 0.18, -0.36, 0.18, 0.017, C.black);
      b.box(0, 1.56, -0.615, 1.58, 0.56, 0.02, 0, C.black, { noTop: true });                                                    // (keeps the bed from showing through under the back window frame)
      // load bed: floor, rails, a few things lying in it
      b.box(0, 0.79, -1.53, 1.66, 0.03, 1.72, 0, C.bed);
      both(s => b.box(s * 0.865, 1.19, -1.53, 0.09, 0.03, 1.8, 0, C.dark));
      b.box(0, 1.19, -2.395, 1.8, 0.03, 0.09, 0, C.dark);
      b.box(0.36, 0.98, -1.0, 0.56, 0.36, 0.5, 0.2, C.wood); b.box(-0.42, 0.93, -1.9, 0.3, 0.42, 0.18, -0.3, C.can); b.box(-0.42, 1.16, -1.9, 0.08, 0.05, 0.06, -0.3, C.black);
      { const v0 = b.count; wheel(b, 0.4, 0.26, { rim: 0.56, lugs: 20, lugW: 0.075, spokes: 5, spokeW: 0.07, dish: 0.12, sides: 14 }); b.transform(v0, m4.compose(m4.create(), -0.3, 0.94, -1.4, 0.3, 0, Math.PI / 2, 1, 1, 1)); }       // spare wheel
      // roll bar behind the cab with two spot lamps, exhaust, chassis
      tube(b, [[-0.82, 1.2, -0.84], [-0.8, 1.98, -0.8], [0.8, 1.98, -0.8], [0.82, 1.2, -0.84]], 0.04, C.dark);
      both(s => { b.beam(s * 0.45, 2.07, -0.8, s * 0.45, 2.07, -0.72, 0.09, 0.085, 10, C.lamp, { smooth: true, em: 2 }); b.beam(s * 0.45, 2.07, -0.86, s * 0.45, 2.07, -0.745, 0.1, 0.1, 10, C.dark, { smooth: true }); });
      b.box(0, 0.4, 0.05, 1.3, 0.1, 4.3, 0, C.black);
      b.beam(-0.6, 0.38, -2.2, -0.62, 0.38, -2.5, 0.04, 0.04, 6, C.steel, { smooth: true, capCol: C.black });
    },
    // the glazing of the truck, drawn in the translucent pass
    truckGlass(b) {
      const g = C.glass;
      b.quad([-0.8, 1.29, 0.985], [0.8, 1.29, 0.985], [0.73, 1.84, 0.52], [-0.73, 1.84, 0.52], g, 0);
      b.quad([0.76, 1.3, -0.605], [-0.76, 1.3, -0.605], [-0.74, 1.84, -0.585], [0.74, 1.84, -0.585], g, 0);
      both(s => b.quad([s * 0.885, 1.3, -0.56], [s * 0.885, 1.3, 0.9], [s * 0.8, 1.83, 0.5], [s * 0.81, 1.84, -0.53], g, 0));
    },
  };

  // ------------------------------------------------------------------ putting an instance together
  const M = m4.create(), A = m4.create(), B = m4.create(), W = m4.create();
  const PAINT = VEHICLE_PAINTS.map(hexLin), SOOT = [0.03, 0.028, 0.026];
  const FORK = { head: [0, 0.98, 0.48], rake: 0.354, len: 0.693 };
  const WHEEL_SCALE = { buggy: [1, 1, 1], truck: [0.9, 1.105, 1.105] };
  const _c = [0, 0, 0];
  // vehicle space -> world, with the body rocking on its springs
  function matrix(v, out) {
    const wreck = !v.alive && !v.sunk;
    return m4.compose(out, v.x, v.y - (wreck ? 0.07 : 0), v.z, v.yaw, -(v.pitch + v.squat), v.roll + v.lean + (wreck ? 0.05 : 0), 1, 1, 1);
  }
  // a point of the fork (in its own frame) in vehicle space, with the bar turned by `ang` (> 0 = to the right)
  function forkPoint(x, y, z, ang, out) {
    const cs = Math.cos(-ang), sn = Math.sin(-ang), cr = Math.cos(-FORK.rake), sr = Math.sin(-FORK.rake);
    const x1 = x * cs + z * sn, z1 = -x * sn + z * cs;
    out[0] = FORK.head[0] + x1; out[1] = FORK.head[1] + y * cr - z1 * sr; out[2] = FORK.head[2] + y * sr + z1 * cr;
    return out;
  }
  // lights: 0 = off .. 1 = on (lamps of a vehicle somebody drives); far: simpler wheels
  function draw(v, time, lights, far) {
    const def = v.def, io = CharModel.indoor(v.x, v.y + 1, v.z), wreck = !v.alive;
    let c = PAINT[v.paint % PAINT.length];
    if (wreck && !v.sunk) c = SOOT;
    else if (v.burning) { const k = clamp01(v.hp / (def.hp * VEHICLE_CFG.burnAt)); _c[0] = lerp(SOOT[0], c[0], k); _c[1] = lerp(SOOT[1], c[1], k); _c[2] = lerp(SOOT[2], c[2], k); c = _c; }
    const em = wreck ? 0 : lights, flash = v.hitT > 0 ? 0.22 : 0;
    matrix(v, M);
    Batches[v.type].add(M, c[0], c[1], c[2], em, io[0], io[1], flash);
    if (v.type === 'bike') {
      m4.compose(A, FORK.head[0], FORK.head[1], FORK.head[2], 0, -FORK.rake, 0, 1, 1, 1);
      m4.multiply(B, M, A);
      m4.compose(A, 0, 0, 0, -v.wheelAng, 0, 0, 1, 1, 1);
      m4.multiply(W, B, A);
      Batches.bikeFork.add(W, c[0], c[1], c[2], em, io[0], io[1], flash);
      m4.compose(A, 0, -FORK.len, 0, 0, v.spin, 0, 1, 1, 1);
      m4.multiply(B, W, A);
      const wb = far ? Batches.bikeWheelLo : Batches.bikeWheel;
      wb.add(B, 1, 1, 1, 0, io[0], io[1], 0);
      m4.compose(A, 0, def.wheelR, def.axR, 0, v.spin, 0, 1, 1, 1);
      m4.multiply(B, M, A);
      wb.add(B, 1, 1, 1, 0, io[0], io[1], 0);
      return;
    }
    if (v.type === 'truck') Batches.truckGlass.add(M, 1, 1, 1, 0, io[0], io[1], 0);
    const s = WHEEL_SCALE[v.type], ht = def.track / 2, wb = far ? Batches.wheelLo : Batches.wheel;
    for (let k = 0; k < 4; k++) {
      const front = k < 2, side = k & 1 ? -1 : 1;
      m4.compose(A, side * ht, def.wheelR, front ? def.axF : def.axR, front ? -v.wheelAng : 0, v.spin, 0, s[0], s[1], s[2]);
      m4.multiply(B, M, A);
      wb.add(B, 1, 1, 1, 0, io[0], io[1], 0);
    }
  }
  // where things are, in vehicle space: the engine (smoke, fire), the lamps, the exhaust
  const SPOTS = {
    bike: { engine: [0, 0.6, 0.1], lamp: [0, 0.98, 0.66], rear: [0, 0.2, -0.7] },
    buggy: { engine: [0, 0.85, -1.1], lamp: [0, 0.7, 1.62], rear: [0, 0.2, -1.1] },
    truck: { engine: [0, 1.15, 1.7], lamp: [0, 0.88, 2.46], rear: [0, 0.2, -1.4] },
  };

  for (const k in defs) Models.extra[k] = defs[k];
  Object.assign(Models.CAP, { bike: 40, bikeFork: 40, bikeWheel: 80, bikeWheelLo: 80, buggy: 40, truck: 40, truckGlass: 40, wheel: 160, wheelLo: 160 });
  Models.GLASS.truckGlass = true; Models.NO_SHADOW.truckGlass = true;
  return { draw, matrix, forkPoint, FORK, SPOTS, PAINT };
})();
