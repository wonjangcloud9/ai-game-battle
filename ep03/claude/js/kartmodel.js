/* SUNDRIFT GP — kart + driver models, generated from primitives. +Z is forward, +X is the kart's left. */
(function (root) {
  'use strict';
  var SD = root.SD, MAT = SD.MAT, hex = SD.hex, TAU = SD.TAU;

  /* The eight racers. Player is index 0. */
  SD.RACERS = [
    { name: 'YOU', primary: 0xff3d3d, secondary: 0xfafafa, accent: 0xffd21f, helmet: 0xfafafa, suit: 0x2b2f38, orn: 'fin' },
    { name: '모카', primary: 0xb9703a, secondary: 0xfff1d6, accent: 0x5a3a22, helmet: 0xc9843f, suit: 0xfff1d6, orn: 'round' },
    { name: '라임', primary: 0x86e01f, secondary: 0x232a36, accent: 0xffffff, helmet: 0x9ff03a, suit: 0x232a36, orn: 'antenna' },
    { name: '코발트', primary: 0x2f6df6, secondary: 0xffffff, accent: 0xffc928, helmet: 0x2f6df6, suit: 0xffffff, orn: 'horns' },
    { name: '두부', primary: 0xf4f1e8, secondary: 0x30343c, accent: 0xff5d8f, helmet: 0xfdfbf5, suit: 0xff8fb1, orn: 'bunny' },
    { name: '만두', primary: 0xffc928, secondary: 0x30343c, accent: 0xe9453f, helmet: 0xffd95a, suit: 0x30343c, orn: 'ears' },
    { name: '보라', primary: 0x9b5de5, secondary: 0xfee440, accent: 0xffffff, helmet: 0x7a3fd0, suit: 0xfee440, orn: 'star' },
    { name: '민트', primary: 0x22d6bd, secondary: 0xffffff, accent: 0xff7a1a, helmet: 0x1fc4ad, suit: 0xffffff, orn: 'propeller' }
  ];

  /* Attachment points in kart space. */
  SD.KART = {
    wheels: [[0.69, 0.27, 0.78], [-0.69, 0.27, 0.78], [0.75, 0.32, -0.72], [-0.75, 0.32, -0.72]],   // FL FR RL RR
    wheelR: [0.27, 0.27, 0.32, 0.32],
    exhaust: [[0.24, 0.64, -1.4], [-0.24, 0.64, -1.4]],
    head: [0, 1.0, -0.24]
  };

  function wheel(mb, R, w, hubCol, tyreCol) {
    var rh = R * 0.56;
    mb.push();
    mb.rotZ(Math.PI / 2);              // lathe axis (Y) -> kart X
    mb.color(tyreCol, MAT.RUBBER);
    mb.lathe([[rh, -w / 2], [R - 0.05, -w / 2], [R, -w / 2 + 0.05], [R, w / 2 - 0.05], [R - 0.05, w / 2], [rh, w / 2]], 18);
    mb.color(hubCol, MAT.GLOSS);
    mb.cyl(rh + 0.005, rh + 0.005, w * 0.84, 14, { y0: -w * 0.42 });
    mb.color(0x2a2e37, MAT.METAL);
    for (var s = -1; s <= 1; s += 2) {
      for (var k = 0; k < 5; k++) {
        mb.push(); mb.rotY(k / 5 * TAU);
        mb.box(rh * 0.52, s * (w * 0.42 + 0.012), 0, rh * 0.86, 0.03, 0.07);
        mb.pop();
      }
      mb.push(); mb.translate(0, s * (w * 0.42 + 0.02), 0); mb.cyl(0.06, 0.06, 0.04, 8, { y0: -0.02 }); mb.pop();
    }
    mb.pop();
  }

  function numberPlate(mb, n) {
    var uv = SD.atlasUV('n' + n);
    mb.color(0xffffff, MAT.ATLAS);
    // on the nose, readable from the chase camera (top of the digit points forward)
    mb.quad([0.2, 0.592, 0.74], [-0.2, 0.592, 0.74], [-0.2, 0.592, 1.14], [0.2, 0.592, 1.14], [uv[0], uv[3]], [uv[2], uv[3]], [uv[2], uv[1]], [uv[0], uv[1]]);
    // on the back of the seat, facing the camera
    mb.quad([0.21, 0.5, -0.587], [-0.21, 0.5, -0.587], [-0.21, 0.92, -0.587], [0.21, 0.92, -0.587], [uv[0], uv[3]], [uv[2], uv[3]], [uv[2], uv[1]], [uv[0], uv[1]]);
  }

  /** Build all meshes for one racer. Returns { body, head, wheelF, wheelR } (MeshBuilder.build() results). */
  SD.buildKart = function (cfg, number) {
    var P = hex(cfg.primary), S = hex(cfg.secondary), A = hex(cfg.accent), suit = hex(cfg.suit), k;
    var DARK = hex(0x2a2e37), mb = new SD.MeshBuilder(16384);

    // ---- chassis
    mb.color(DARK, MAT.MATTE); mb.rbox(0, 0.25, 0.02, 1.04, 0.14, 2.12, 0.06, 2);
    // nose + fairing
    mb.color(P, MAT.GLOSS);
    mb.rbox(0, 0.44, 0.9, 0.76, 0.3, 0.82, 0.13, 3);
    mb.push(); mb.translate(0, 0.42, 1.28); mb.sphere(0.38, 16, 10, { sy: 0.64, sz: 0.8 }); mb.pop();
    // racing stripe
    mb.color(S, MAT.GLOSS); mb.rbox(0, 0.455, 1.0, 0.2, 0.3, 1.06, 0.1, 2);
    // side pods
    for (k = -1; k <= 1; k += 2) {
      mb.color(S, MAT.GLOSS); mb.rbox(k * 0.57, 0.37, -0.04, 0.3, 0.25, 1.0, 0.11, 3);
      mb.color(A, MAT.GLOSS); mb.rbox(k * 0.6, 0.4, -0.04, 0.26, 0.09, 0.84, 0.04, 2);
    }
    // front wing
    mb.color(A, MAT.GLOSS); mb.rbox(0, 0.2, 1.42, 1.56, 0.09, 0.28, 0.04, 2);
    mb.color(P, MAT.GLOSS);
    mb.rbox(0.77, 0.27, 1.42, 0.05, 0.22, 0.34, 0.02, 1); mb.rbox(-0.77, 0.27, 1.42, 0.05, 0.22, 0.34, 0.02, 1);
    // seat
    mb.color(DARK, MAT.MATTE);
    mb.rbox(0, 0.36, -0.2, 0.58, 0.12, 0.52, 0.05, 2);
    mb.rbox(0, 0.68, -0.5, 0.62, 0.64, 0.16, 0.07, 2);
    // engine + exhausts
    mb.color(0x4a4f5a, MAT.METAL); mb.rbox(0, 0.47, -0.88, 0.68, 0.34, 0.46, 0.08, 2);
    mb.color(A, MAT.GLOSS); mb.push(); mb.translate(0, 0.64, -0.86); mb.cyl(0.13, 0.1, 0.16, 10); mb.pop();
    for (k = -1; k <= 1; k += 2) {
      mb.color(0xc9ced6, MAT.METAL);
      mb.push(); mb.alignY(k * 0.2, 0.52, -0.96, k * 0.24, 0.64, -1.4); mb.cyl(0.07, 0.085, 0.46, 10); mb.pop();
      mb.color(0x15171c, MAT.MATTE);
      mb.push(); mb.alignY(k * 0.239, 0.637, -1.39, k * 0.2405, 0.6415, -1.405); mb.cyl(0.062, 0.062, 0.02, 10); mb.pop();
    }
    // rear wing
    mb.color(DARK, MAT.MATTE);
    mb.box(0.42, 0.82, -1.04, 0.06, 0.4, 0.12); mb.box(-0.42, 0.82, -1.04, 0.06, 0.4, 0.12);
    mb.color(P, MAT.GLOSS); mb.rbox(0, 1.04, -1.08, 1.5, 0.07, 0.38, 0.03, 2);
    mb.color(S, MAT.GLOSS); mb.rbox(0, 1.045, -1.08, 0.36, 0.075, 0.385, 0.03, 1);
    mb.color(A, MAT.GLOSS);
    mb.rbox(0.76, 1.0, -1.08, 0.05, 0.26, 0.44, 0.02, 1); mb.rbox(-0.76, 1.0, -1.08, 0.05, 0.26, 0.44, 0.02, 1);
    // steering column + wheel
    mb.color(DARK, MAT.MATTE);
    mb.push(); mb.alignY(0, 0.5, 0.54, 0, 0.8, 0.25); mb.cyl(0.03, 0.03, 0.42, 6);
    mb.translate(0, 0.42, 0); mb.color(0x15171c, MAT.RUBBER); mb.torus(0.17, 0.035, 14, 8);
    mb.pop();
    // ---- driver torso + arms
    mb.color(suit, MAT.GLOSS); mb.rbox(0, 0.72, -0.26, 0.48, 0.52, 0.36, 0.15, 3);
    mb.color(A, MAT.GLOSS); mb.rbox(0, 0.93, -0.26, 0.4, 0.09, 0.3, 0.04, 2);      // collar / scarf
    for (k = -1; k <= 1; k += 2) {
      mb.color(suit, MAT.GLOSS);
      mb.push(); mb.alignY(k * 0.25, 0.86, -0.2, k * 0.17, 0.8, 0.2); mb.cyl(0.075, 0.065, 0.41, 8); mb.pop();
      mb.color(0xf4f1e8, MAT.GLOSS);
      mb.push(); mb.translate(k * 0.17, 0.8, 0.22); mb.sphere(0.085, 8, 6); mb.pop();
    }
    numberPlate(mb, number);
    var body = mb.build();

    // ---- head (pivot at the neck)
    var hb = new SD.MeshBuilder(4096);
    hb.color(hex(cfg.helmet), MAT.GLOSS);
    hb.push(); hb.translate(0, 0.27, 0); hb.sphere(0.34, 20, 14);
    hb.color(0x141a26, MAT.GLASS);
    hb.sphere(0.348, 14, 6, { th0: 1.02, th1: 1.9, ph0: 0.42, ph1: Math.PI - 0.42 });
    hb.color(A, MAT.GLOSS);
    hb.sphere(0.346, 14, 2, { th0: 0.02, th1: 1.0, ph0: Math.PI / 2 - 0.16, ph1: Math.PI / 2 + 0.16 });   // helmet stripe (front)
    hb.sphere(0.346, 14, 2, { th0: 0.02, th1: 2.2, ph0: -Math.PI / 2 - 0.16, ph1: -Math.PI / 2 + 0.16 }); // helmet stripe (back)
    hb.pop();
    hb.color(A, MAT.GLOSS);
    var o = cfg.orn;
    if (o === 'ears') {
      for (k = -1; k <= 1; k += 2) { hb.push(); hb.translate(k * 0.19, 0.5, 0); hb.rotZ(-k * 0.35); hb.cyl(0.12, 0, 0.24, 4, { flat: true }); hb.pop(); }
    } else if (o === 'round') {
      for (k = -1; k <= 1; k += 2) { hb.push(); hb.translate(k * 0.24, 0.52, 0); hb.sphere(0.12, 10, 8, { sz: 0.6 }); hb.pop(); }
    } else if (o === 'bunny') {
      for (k = -1; k <= 1; k += 2) { hb.push(); hb.translate(k * 0.13, 0.74, -0.03); hb.rotZ(-k * 0.2); hb.sphere(0.085, 8, 8, { sy: 3.0, sz: 0.6 }); hb.pop(); }
    } else if (o === 'fin') {
      hb.push(); hb.translate(0, 0.6, -0.02); hb.rotY(-Math.PI / 2);     // polygon X -> kart forward
      hb.extrude([[-0.3, 0.0], [0.26, -0.03], [0.08, 0.16], [-0.24, 0.2]], -0.025, 0.025);    // shark fin (polygon in XY)
      hb.pop();
    } else if (o === 'antenna') {
      hb.push(); hb.translate(0, 0.58, 0); hb.color(0x2a2e37, MAT.METAL); hb.cyl(0.015, 0.015, 0.3, 5);
      hb.translate(0, 0.33, 0); hb.color(A, MAT.EMISSIVE); hb.sphere(0.07, 8, 6); hb.pop();
    } else if (o === 'horns') {
      for (k = -1; k <= 1; k += 2) { hb.push(); hb.translate(k * 0.2, 0.5, 0); hb.rotZ(-k * 0.75); hb.cyl(0.075, 0, 0.26, 7); hb.pop(); }
    } else if (o === 'star') {
      hb.push(); hb.translate(0, 0.66, 0);
      var star = [];
      for (k = 0; k < 10; k++) { var rr = k % 2 ? 0.07 : 0.16, a = k / 10 * TAU + Math.PI / 2; star.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      for (k = 0; k < 10; k++) {                                 // fan triangles (star is not convex)
        var p0 = star[k], p1 = star[(k + 1) % 10];
        hb.tri([0, 0, 0.03], [p0[0], p0[1], 0.0], [p1[0], p1[1], 0.0]); hb.tri([0, 0, -0.03], [p1[0], p1[1], 0.0], [p0[0], p0[1], 0.0]);
      }
      hb.pop();
    } else if (o === 'propeller') {
      hb.push(); hb.translate(0, 0.58, 0); hb.color(0x2a2e37, MAT.METAL); hb.cyl(0.02, 0.02, 0.14, 5);
      hb.translate(0, 0.15, 0); hb.color(A, MAT.GLOSS);
      hb.box(0, 0, 0, 0.5, 0.025, 0.09); hb.box(0, 0, 0, 0.09, 0.025, 0.5);
      hb.pop();
    }
    var head = hb.build();

    // ---- wheels
    var wf = new SD.MeshBuilder(4096), wr = new SD.MeshBuilder(4096);
    wheel(wf, 0.27, 0.25, A, hex(0x1b1d22));
    wheel(wr, 0.32, 0.36, A, hex(0x1b1d22));
    return { body: body, head: head, wheelF: wf.build(), wheelR: wr.build() };
  };
})(typeof window !== 'undefined' ? window : globalThis);
