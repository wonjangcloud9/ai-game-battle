/* 해돌전쟁 — 건물 그림 (위에서 내려다본 모습) */
'use strict';
(function (g0) {
  var R = g0.RTS, S = R.Sprites, H = S.h, OUT = S.OUT;
  var B = S.buildingDraw, BO = S.buildingOverlay;
  var F = S.F, P = S.P, T = S.T, TAU = 6.2832;

  function plate(g, s, rad) {
    var h = s / 2;
    H.rr(g, -h + 3, -h + 3, s - 6, s - 6, rad, H.lg(g, -h, -h, h, h, [0, '#5b6068', 1, '#2a2d33']), OUT, 1.8);
  }
  function molten(g, x, y, r) { return H.rg(g, x, y, 1, r, [0, '#fff6c0', 0.38, '#ffc247', 0.82, '#f0661a', 1, '#8a2a08']); }
  function spiral(g, n, step, r0, dr) {
    g.beginPath();
    for (var i = 0; i <= n; i++) { var a = i * step, rr = r0 + i * dr; if (!i) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  }
  function tentShade(g, r) {
    g.fillStyle = H.rg2(g, -r * 0.28, -r * 0.32, r * 0.06, 0, 0, r, [0, 'rgba(255,255,255,0.34)', 0.6, 'rgba(255,255,255,0)', 1, 'rgba(0,0,0,0.3)']);
  }

  /* ════════ 무쇠 공방 ════════ */
  B.furnace = function (g, C, s) {
    var h = s / 2, i, a;
    H.ngon(g, 0, 0, 8, h - 3, 0.3927, H.lg(g, -h, -h, h, h, [0, '#868c95', 0.5, F.iron, 1, F.ironD]), OUT, 2);
    H.ngon(g, 0, 0, 8, h - 11, 0.3927, H.lg(g, -h, -h, h, h, [0, '#565b63', 1, '#2c2f35']), OUT, 1.2);
    H.dots(g, 0, 0, h - 7, 16, 1.6, '#b4bac2', 0.19);
    for (i = 0; i < 4; i++) {
      g.save(); g.rotate(i * 1.5708);
      H.poly(g, [-16, -h + 13, 16, -h + 13, 10, -29, -10, -29], H.lg(g, 0, -h + 13, 0, -29, [0, C.t, 1, C.td]), OUT, 1.3);
      H.line(g, 0, -h + 17, 0, -32, 'rgba(255,255,255,0.28)', 1.4);
      g.restore();
    }
    for (i = 0; i < 4; i++) {
      a = 0.7854 + i * 1.5708;
      var x = Math.cos(a) * (h - 21), y = Math.sin(a) * (h - 21);
      H.circ(g, x, y, 10.5, H.ball(g, x, y, 10.5, F.copper), OUT, 1.4);
      H.circ(g, x, y, 6.2, '#16110d', OUT, 1);
    }
    H.circ(g, 0, 0, 28, H.ball(g, 0, 0, 28, F.brass), OUT, 1.6);
    H.ring(g, 0, 0, 23.5, F.copperD, 2);
    H.dots(g, 0, 0, 25.6, 12, 1.2, '#7a5a1e', 0);
    H.circ(g, 0, 0, 19.5, molten(g, 0, 0, 19.5), OUT, 1.4);
    H.line(g, -18.5, 0, 18.5, 0, 'rgba(30,20,12,0.8)', 2.2);
    H.line(g, -16.5, -9, 16.5, -9, 'rgba(30,20,12,0.8)', 2.2);
    H.line(g, -16.5, 9, 16.5, 9, 'rgba(30,20,12,0.8)', 2.2);
  };
  BO.furnace = function (g, t) { H.glow(g, 0, 0, 34 + Math.sin(t * 3) * 3, '#ff9a3a', 0.3 + 0.1 * Math.sin(t * 3)); };

  B.boiler = function (g, C, s) {
    plate(g, s, 8);
    H.rr(g, 8, 12, 20, 6, 3, F.copper, OUT, 1.2);
    H.rr(g, 21, 9, 5, 12, 2, F.brass, OUT, 1);
    H.circ(g, -2, -2, 22, H.ball(g, -2, -2, 22, '#868c95'), OUT, 1.8);
    H.ring(g, -2, -2, 16.5, C.t, 4.5);
    H.ring(g, -2, -2, 18.9, OUT, 0.9); H.ring(g, -2, -2, 14.1, OUT, 0.9);
    H.dots(g, -2, -2, 20.4, 12, 1.1, '#c9cfd7', 0.2);
    H.circ(g, -2, -2, 8, H.ball(g, -2, -2, 8, F.brass), OUT, 1.3);
    H.circ(g, -2, -2, 3, F.copperD, OUT, 0.8);
    H.circ(g, 12, 11, 5.4, '#f4f1e6', OUT, 1.2);
    H.line(g, 12, 11, 14.8, 8, '#c22', 1.3);
    H.circ(g, 12, 11, 0.9, OUT, null);
  };

  B.assembly = function (g, C, s) {
    var h = s / 2, i, n = 5, w = (s - 16) / n;
    plate(g, s, 6);
    for (i = 0; i < n; i++) {
      var x = -h + 8 + i * w;
      g.fillStyle = H.lg(g, x, 0, x + w, 0, [0, '#b3b9c1', 0.74, '#6d727a', 0.76, '#3f434a', 1, '#3f434a']);
      g.fillRect(x, -h + 8, w + 0.5, s - 29);
      H.rr(g, x + 2.5, -h + 13, w * 0.5, 9, 1.5, '#ffd98a', OUT, 0.8);
      H.rr(g, x + 2.5, -h + 28, w * 0.5, 9, 1.5, '#ffd98a', OUT, 0.8);
    }
    H.rr(g, -h + 8, -h + 8, s - 16, s - 29, 3, null, OUT, 1.6);
    H.rr(g, -h + 8, h - 22, s - 16, 14, 2.5, H.lg(g, 0, h - 22, 0, h - 8, [0, C.t, 1, C.td]), OUT, 1.5);
    H.rr(g, -14, h - 20, 28, 12, 2, '#1c1a18', OUT, 1.2);
    g.setLineDash([4, 3]); H.line(g, -13, h - 6, 13, h - 6, '#ffcf3a', 2.2); g.setLineDash([]);
    H.circ(g, h - 20, -h + 46, 8.5, H.ball(g, h - 20, -h + 46, 8.5, F.copper), OUT, 1.3);
    H.circ(g, h - 20, -h + 46, 4.8, '#16110d', OUT, 0.9);
    H.circ(g, -h + 26, 3, 14, '#34383e', OUT, 1.2);
  };
  BO.assembly = function (g, t, C, b) {
    var busy = b && b.queue && b.queue.length;
    H.gear(g, -22, 3, 12, 9, busy ? t * 2.4 : 0.2, F.brass, OUT, 1);
    H.circ(g, -22, 3, 3.4, F.copperD, OUT, 0.8);
  };

  B.foundry = function (g, C, s) {
    var h = s / 2;
    plate(g, s, 6);
    H.rr(g, -h + 8, -h + 12, s - 32, s - 22, 5, H.lg(g, -h, -h, h, h, [0, '#959ba3', 0.5, F.iron, 1, F.ironD]), OUT, 1.6);
    H.poly(g, [-h + 8, -h + 28, -h + 24, -h + 12, -h + 36, -h + 12, -h + 8, -h + 40], C.t, OUT, 1.1);
    H.poly(g, [h - 24, h - 10, h - 40, h - 10, h - 24, h - 26], C.t, OUT, 1.1);
    H.rr(g, h - 22, -6, 9, 36, 3, F.ironD, OUT, 1.2);
    H.circ(g, -8, 6, 21.5, H.ball(g, -8, 6, 21.5, '#4b4f56'), OUT, 1.6);
    H.circ(g, -8, 6, 15.5, molten(g, -8, 6, 15.5), OUT, 1.3);
    H.circ(g, h - 18, -h + 20, 12.5, H.ball(g, h - 18, -h + 20, 12.5, F.copper), OUT, 1.5);
    H.circ(g, h - 18, -h + 20, 7.6, '#16110d', OUT, 1);
    H.line(g, h - 18, 27, -8, 6, OUT, 4.8); H.line(g, h - 18, 27, -8, 6, F.brass, 2.8);
    H.circ(g, h - 18, 27, 4.8, F.brass, OUT, 1.1);
    H.dots(g, -8, 6, 18.6, 10, 1.1, '#9aa0a8', 0.3);
  };
  BO.foundry = function (g, t) { H.glow(g, -8, 6, 24 + Math.sin(t * 2.6) * 2, '#ff9a3a', 0.28 + 0.1 * Math.sin(t * 2.6)); };

  B.draft = function (g, C, s) {
    var h = s / 2, i;
    plate(g, s, 10);
    H.circ(g, 0, 0, h - 8, H.ball(g, 0, 0, h - 8, F.brass), OUT, 1.6);
    for (i = 0; i < 8; i++) { g.save(); g.rotate(i * 0.7854 + 0.39); H.poly(g, [h - 13, -4.5, h - 5, 0, h - 13, 4.5], C.t, OUT, 0.9); g.restore(); }
    H.circ(g, 0, 0, h - 17, H.rg(g, -8, -8, 2, h - 17, [0, '#7cbcff', 0.6, '#2a69c2', 1, '#143a7a']), OUT, 1.5);
    g.save();
    g.beginPath(); g.arc(0, 0, h - 18, 0, TAU); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 0.7;
    for (i = -4; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 8, -h); g.lineTo(i * 8, h); g.stroke();
      g.beginPath(); g.moveTo(-h, i * 8); g.lineTo(h, i * 8); g.stroke();
    }
    H.ring(g, -6, 4, 11, 'rgba(255,255,255,0.85)', 1.1);
    H.ring(g, -6, 4, 4, 'rgba(255,255,255,0.85)', 1.1);
    for (i = 0; i < 8; i++) { var a = i * 0.7854; H.line(g, -6 + Math.cos(a) * 11, 4 + Math.sin(a) * 11, -6 + Math.cos(a) * 14, 4 + Math.sin(a) * 14, 'rgba(255,255,255,0.85)', 2.2); }
    H.line(g, 6, -16, 15, 6, 'rgba(255,255,255,0.7)', 1); H.line(g, 6, -16, 22, -4, 'rgba(255,255,255,0.7)', 1);
    g.restore();
    H.line(g, 12, -12, h - 9, -h + 9, OUT, 5.4); H.line(g, 12, -12, h - 9, -h + 9, F.ironL, 3.2);
    H.circ(g, h - 9, -h + 9, 5.4, F.brass, OUT, 1.2);
    H.circ(g, h - 9, -h + 9, 2.6, '#9fd4ff', OUT, 0.7);
    H.circ(g, 12, -12, 3.8, F.ironD, OUT, 1);
  };

  B.turret = function (g, C, s) {
    var h = s / 2;
    H.ngon(g, 0, 0, 8, h - 4, 0.3927, H.lg(g, -h, -h, h, h, [0, '#868c95', 0.5, F.iron, 1, F.ironD]), OUT, 1.7);
    H.dots(g, 0, 0, h - 8.5, 8, 1.3, '#c9cfd7', 0);
    H.circ(g, 0, 0, 17, '#2c2f35', OUT, 1.3);
    H.ring(g, 0, 0, 14, C.t, 3);
  };
  B.turret_head = function (g, C) {
    H.rr(g, 6, -6.4, 17, 4, 1.2, F.ironD, OUT, 1.1);
    H.rr(g, 6, 2.4, 17, 4, 1.2, F.ironD, OUT, 1.1);
    H.rr(g, 21, -7, 3.6, 5.2, 1, F.black, OUT, 0.9);
    H.rr(g, 21, 1.8, 3.6, 5.2, 1, F.black, OUT, 0.9);
    H.circ(g, 0, 0, 11, H.ball(g, 0, 0, 11, F.brass), OUT, 1.5);
    H.rr(g, -8, -2.3, 14, 4.6, 2, C.t, OUT, 1);
    H.circ(g, -3, 0, 1.2, C.tl, null);
  };

  /* ════════ 새순 일족 ════════ */
  B.mothertree = function (g, C, s) {
    var h = s / 2, rng = R.makeRng(11), i, a, x, y;
    for (i = 0; i < 7; i++) {
      a = i * 0.8976 + 0.3; x = Math.cos(a); y = Math.sin(a);
      H.poly(g, [x * 20 - y * 7, y * 20 + x * 7, x * (h + 1), y * (h + 1), x * 20 + y * 7, y * 20 - x * 7], H.lg(g, x * 20, y * 20, x * h, y * h, [0, P.bark, 1, P.barkD]), OUT, 1.4);
    }
    var layers = [[h - 15, 13, 15, P.leafD], [h - 26, 10, 14, P.leaf], [h - 39, 7, 13, '#74c247']];
    for (var L = 0; L < 3; L++) {
      for (i = 0; i < layers[L][1]; i++) {
        a = i / layers[L][1] * TAU + rng.range(-0.15, 0.15);
        var rr = layers[L][0] + rng.range(-3, 3), cr = layers[L][2] + rng.range(-2, 2);
        x = Math.cos(a) * rr; y = Math.sin(a) * rr;
        H.circ(g, x, y, cr, H.rg2(g, x - 4, y - 5, 1, x, y, cr + 2, [0, H.shade(layers[L][3], 0.32), 1, layers[L][3]]), OUT, 1.1);
      }
    }
    H.circ(g, 0, 0, 17.5, H.ball(g, 0, 0, 17.5, P.bark), OUT, 1.6);
    H.circ(g, 0, 0, 11.5, H.rg(g, 0, 0, 1, 11.5, [0, '#fff9c4', 0.5, '#d7f06a', 1, '#5a8a1e']), OUT, 1.2);
    for (i = 0; i < 11; i++) {
      a = rng.range(0, TAU); var r2 = rng.range(25, h - 13);
      H.flower(g, Math.cos(a) * r2, Math.sin(a) * r2, 4.4, i % 3 ? C.t : C.tl);
    }
  };
  BO.mothertree = function (g, t) { H.glow(g, 0, 0, 20 + Math.sin(t * 2) * 2, '#e4ff8a', 0.3 + 0.12 * Math.sin(t * 2)); };

  B.dewbloom = function (g, C, s) {
    var h = s / 2, i, a;
    for (i = 0; i < 4; i++) { a = 0.7854 + i * 1.5708; H.leaf(g, 0, 0, h + 1, 9, a, H.lg(g, 0, 0, Math.cos(a) * h, Math.sin(a) * h, [0, P.leafD, 1, P.leaf]), OUT, 1.2); }
    for (i = 0; i < 8; i++) { a = i * 0.7854; H.leaf(g, Math.cos(a) * 4, Math.sin(a) * 4, h - 7, 8, a, H.lg(g, 0, 0, Math.cos(a) * h, Math.sin(a) * h, [0, C.td, 0.5, C.t, 1, C.tl]), OUT, 1.1); }
    H.circ(g, 0, 0, 10, H.ball(g, 0, 0, 10, '#e8d24a'), OUT, 1.3);
    H.dots(g, 0, 0, 7, 8, 1, '#a8862a', 0.3);
    H.circ(g, 0, 0, 5.2, H.rg2(g, -1.5, -1.5, 0.3, 0, 0, 5.2, [0, '#ffffff', 0.4, '#b9f4ff', 1, '#4fb8d8']), OUT, 0.9);
  };

  B.seedbed = function (g, C, s) {
    var h = s / 2, i, a, x, y;
    H.circ(g, 0, 0, h - 5, H.rg(g, -6, -6, 4, h - 5, [0, '#8a6238', 0.7, '#6a4526', 1, '#4a2f1c']), OUT, 1.8);
    H.ring(g, 0, 0, h - 16, 'rgba(50,30,15,0.5)', 1.2);
    H.ring(g, 0, 0, h - 27, 'rgba(50,30,15,0.4)', 1);
    for (i = 0; i < 22; i++) {
      a = i / 22 * TAU;
      if (Math.abs(R.wrapAngle(a - 1.5708)) < 0.42) continue;
      H.ell(g, Math.cos(a) * (h - 6), Math.sin(a) * (h - 6), 5.6, 3.3, a + 1.5708, i % 2 ? P.leafD : '#3d7a30', OUT, 0.9);
    }
    for (i = 0; i < 7; i++) {
      a = i / 7 * TAU - 0.6; x = Math.cos(a) * (h - 21); y = Math.sin(a) * (h - 21);
      H.leaf(g, x, y, 8.5, 3.3, a + 0.9, P.leafL, OUT, 0.8);
      H.leaf(g, x, y, 8.5, 3.3, a - 0.9 + 3.14, P.leaf, OUT, 0.8);
      H.circ(g, x, y, 1.9, P.seed, OUT, 0.7);
    }
    H.circ(g, 0, 0, 14, H.ball(g, 0, 0, 14, P.leaf), OUT, 1.5);
    for (i = 0; i < 5; i++) { a = i * 1.2566 - 1.57; H.leaf(g, 0, 0, 12.5, 4.8, a, i % 2 ? C.t : C.tl, OUT, 0.9); }
    H.circ(g, 0, 0, 4.6, H.ball(g, 0, 0, 4.6, '#ffe27a'), OUT, 1);
  };

  B.hollow = function (g, C, s) {
    var h = s / 2, rng = R.makeRng(23), i, a, pts = [];
    for (i = 0; i < 18; i++) { a = i / 18 * TAU; var rr = h - 6 + rng.range(-3.5, 3.5); pts.push(Math.cos(a) * rr, Math.sin(a) * rr); }
    for (i = 0; i < 5; i++) {
      a = i * 1.2566 + 0.5;
      H.poly(g, [Math.cos(a - 0.25) * 30, Math.sin(a - 0.25) * 30, Math.cos(a) * (h + 4), Math.sin(a) * (h + 4), Math.cos(a + 0.25) * 30, Math.sin(a + 0.25) * 30], P.barkD, OUT, 1.2);
    }
    H.poly(g, pts, H.rg(g, -6, -6, 6, h, [0, P.bark, 1, P.barkD]), OUT, 1.8);
    H.circ(g, 0, 0, h - 15, H.rg(g, -5, -5, 2, h - 15, [0, '#e6c898', 0.7, P.barkL, 1, '#96683e']), OUT, 1.2);
    for (i = 1; i <= 3; i++) H.ring(g, 0, 0, (h - 15) * i / 4, 'rgba(110,70,35,0.45)', 1);
    H.ell(g, 0, 6, 15, 12, 0, H.rg(g, 0, 8, 1, 15, [0, '#0f0a06', 1, '#2a1a0e']), OUT, 1.5);
    H.glow(g, 0, 8, 10, '#b4ff6a', 0.25);
    H.circ(g, -22, -18, 8, P.leaf, OUT, 0.9);
    H.circ(g, -28, -8, 6, P.leafD, OUT, 0.9);
    H.circ(g, 20, -24, 7, P.leaf, OUT, 0.9);
    var mush = [[24, 14, 6.5], [31, 2, 4.6], [-26, 18, 5.5], [-14, -30, 4.5]];
    for (i = 0; i < mush.length; i++) {
      var m = mush[i];
      H.circ(g, m[0], m[1], m[2], H.ball(g, m[0], m[1], m[2], C.t), OUT, 1);
      H.circ(g, m[0] - m[2] * 0.3, m[1] - m[2] * 0.2, m[2] * 0.22, '#fff', null);
      H.circ(g, m[0] + m[2] * 0.3, m[1] + m[2] * 0.3, m[2] * 0.16, '#fff', null);
    }
  };

  B.elder = function (g, C, s) {
    var h = s / 2, rng = R.makeRng(41), i, a, x, y;
    for (i = 0; i < 6; i++) {
      a = i * 1.047 + 0.2;
      H.poly(g, [Math.cos(a - 0.22) * 16, Math.sin(a - 0.22) * 16, Math.cos(a + 0.15) * (h - 1), Math.sin(a + 0.15) * (h - 1), Math.cos(a + 0.22) * 16, Math.sin(a + 0.22) * 16], P.barkD, OUT, 1.2);
    }
    for (i = 0; i < 9; i++) {
      a = i / 9 * TAU + 0.2;
      var rr = h - 17 + rng.range(-3, 3), cr = 11 + rng.range(-2, 2.5);
      x = Math.cos(a) * rr; y = Math.sin(a) * rr;
      H.circ(g, x, y, cr, H.rg2(g, x - 3, y - 4, 1, x, y, cr, [0, '#9be0bc', 1, '#3f8f77']), OUT, 1.1);
    }
    H.circ(g, 0, 0, 17, H.ball(g, 0, 0, 17, P.bark), OUT, 1.6);
    spiral(g, 40, 0.36, 1, 0.36);
    g.strokeStyle = 'rgba(60,35,15,0.7)'; g.lineWidth = 1.5; g.stroke();
    for (i = 0; i < 4; i++) {
      a = i * 1.5708 + 0.8;
      H.poly(g, [Math.cos(a) * 15, Math.sin(a) * 15, Math.cos(a + 0.2) * 28, Math.sin(a + 0.2) * 28, Math.cos(a - 0.05) * 25, Math.sin(a - 0.05) * 25], C.t, OUT, 0.9);
    }
    for (i = 0; i < 7; i++) {
      a = i / 7 * TAU + 0.5; x = Math.cos(a) * (h - 17); y = Math.sin(a) * (h - 17);
      H.circ(g, x, y, 3.3, H.ball(g, x, y, 3.3, '#ffe27a'), OUT, 0.8);
    }
  };
  BO.elder = function (g, t) {
    for (var i = 0; i < 7; i++) {
      var a = i / 7 * TAU + 0.5;
      H.glow(g, Math.cos(a) * 31, Math.sin(a) * 31, 8, '#ffe27a', 0.3 + 0.28 * Math.sin(t * 2.2 + i * 1.7));
    }
  };

  B.thornvine = function (g, C, s) {
    var h = s / 2, i, a;
    H.circ(g, 0, 0, h - 6, H.rg(g, -4, -4, 3, h - 6, [0, '#8a6238', 1, '#4a2f1c']), OUT, 1.5);
    for (i = 0; i < 12; i++) {
      a = i * 0.5236;
      H.poly(g, [Math.cos(a - 0.13) * 20, Math.sin(a - 0.13) * 20, Math.cos(a) * 28, Math.sin(a) * 28, Math.cos(a + 0.13) * 20, Math.sin(a + 0.13) * 20], '#e8e0b0', OUT, 0.8);
    }
    spiral(g, 44, 0.3, 5, 0.4); H.fs(g, null, OUT, 7.6);
    spiral(g, 44, 0.3, 5, 0.4); H.fs(g, null, P.leafD, 5.2);
    spiral(g, 44, 0.3, 5, 0.4); H.fs(g, null, 'rgba(164,220,92,0.5)', 1.4);
  };
  B.thornvine_head = function (g, C) {
    for (var i = 0; i < 5; i++) { var a = 3.14 + (i - 2) * 0.55; H.leaf(g, 0, 0, 12.5, 4.6, a, i % 2 ? C.tl : C.t, OUT, 0.9); }
    H.poly(g, [4, -4.6, 19.5, 0, 4, 4.6], '#e8e0b0', OUT, 1.1);
    H.circ(g, 0, 0, 8.6, H.ball(g, 0, 0, 8.6, P.leaf), OUT, 1.4);
    H.circ(g, 2.6, -3, 1.2, OUT, null);
    H.circ(g, 2.6, 3, 1.2, OUT, null);
  };

  /* ════════ 번개 유랑단 ════════ */
  B.pavilion = function (g, C, s) {
    var h = s / 2, i, a, n = 16, R0 = h - 8;
    for (i = 0; i < 8; i++) {
      a = i * 0.7854 + 0.39;
      H.line(g, Math.cos(a) * (h - 12), Math.sin(a) * (h - 12), Math.cos(a) * (h + 3), Math.sin(a) * (h + 3), 'rgba(60,50,35,0.85)', 1);
      H.circ(g, Math.cos(a) * (h + 3), Math.sin(a) * (h + 3), 1.9, T.wood, OUT, 0.7);
    }
    for (i = 0; i < n; i++) {
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R0, i / n * TAU, (i + 1) / n * TAU + 0.01); g.closePath();
      g.fillStyle = i % 2 ? T.cloth : T.indigo; g.fill();
    }
    tentShade(g, R0); g.beginPath(); g.arc(0, 0, R0, 0, TAU); g.fill();
    H.ring(g, 0, 0, R0, OUT, 2);
    for (i = 0; i < n; i++) { a = (i + 0.5) / n * TAU; H.circ(g, Math.cos(a) * (R0 - 2), Math.sin(a) * (R0 - 2), 6.2, C.t, OUT, 1); }
    H.ring(g, 0, 0, R0 - 10, C.td, 2.2);
    for (i = 0; i < n; i++) { a = i / n * TAU; H.line(g, Math.cos(a) * 15, Math.sin(a) * 15, Math.cos(a) * (R0 - 11), Math.sin(a) * (R0 - 11), 'rgba(20,20,40,0.35)', 0.8); }
    H.circ(g, 0, 0, 15.5, H.ball(g, 0, 0, 15.5, C.t), OUT, 1.6);
    H.circ(g, 0, 0, 8.2, T.navy, OUT, 1.2);
    H.circ(g, 0, 0, 5.2, H.rg(g, -1, -1, 0.5, 5.2, [0, '#ffffff', 0.5, T.bolt, 1, '#d9a020']), null);
  };
  BO.pavilion = function (g, t) {
    H.glow(g, 0, 0, 14 + Math.sin(t * 4) * 2, '#ffe66b', 0.5 + 0.2 * Math.sin(t * 4));
    var a = t * 1.7;
    H.line(g, Math.cos(a) * 5, Math.sin(a) * 5, Math.cos(a + 0.5) * 12, Math.sin(a + 0.5) * 12, 'rgba(255,251,224,0.8)', 1.2);
  };

  B.pinwheel = function (g, C, s) {
    var h = s / 2, i, a;
    for (i = 0; i < 3; i++) {
      a = i * 2.0944 + 0.5;
      H.line(g, Math.cos(a) * 12, Math.sin(a) * 12, Math.cos(a) * (h - 5), Math.sin(a) * (h - 5), 'rgba(60,50,35,0.85)', 1);
      H.circ(g, Math.cos(a) * (h - 5), Math.sin(a) * (h - 5), 1.9, T.wood, OUT, 0.7);
    }
    H.circ(g, 0, 0, 13.5, H.rg(g, -3, -3, 1, 13.5, [0, '#b99468', 1, '#6a4e30']), OUT, 1.5);
    H.dots(g, 0, 0, 9.8, 6, 1.2, '#4a3520', 0.2);
  };
  BO.pinwheel = function (g, t, C, b) {
    g.save(); g.rotate(t * 2.4 + (b && b.id ? b.id * 1.3 : 0));
    for (var i = 0; i < 4; i++) {
      g.rotate(1.5708);
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(8, -20, 26, -13); g.quadraticCurveTo(17, 1, 0, 0); g.closePath();
      H.fs(g, i % 2 ? T.cloth : C.t, OUT, 1.1);
      H.line(g, 3, -2, 20, -11, 'rgba(20,20,40,0.25)', 0.8);
    }
    g.restore();
    H.circ(g, 0, 0, 3.8, T.bolt, OUT, 1);
  };

  B.whirltent = function (g, C, s) {
    var h = s / 2, i, a, R0 = h - 6, by = R0 * 0.866;
    for (i = 0; i < 6; i++) { a = i * 1.0472; H.line(g, Math.cos(a) * R0, Math.sin(a) * R0, Math.cos(a) * (h + 3), Math.sin(a) * (h + 3), 'rgba(60,50,35,0.85)', 1); H.circ(g, Math.cos(a) * (h + 3), Math.sin(a) * (h + 3), 1.8, T.wood, OUT, 0.7); }
    for (i = 0; i < 6; i++) {
      var a0 = i * 1.0472, a1 = a0 + 1.0472, front = (i === 1);
      H.poly(g, [0, 0, Math.cos(a0) * R0, Math.sin(a0) * R0, Math.cos(a1) * R0, Math.sin(a1) * R0],
        front ? H.lg(g, 0, 0, 0, R0, [0, C.t, 1, C.td]) : (i % 2 ? T.cloth : '#dcd2b6'), OUT, 1.3);
    }
    tentShade(g, R0); g.beginPath();
    for (i = 0; i < 6; i++) { a = i * 1.0472; if (!i) g.moveTo(Math.cos(a) * R0, Math.sin(a) * R0); else g.lineTo(Math.cos(a) * R0, Math.sin(a) * R0); }
    g.closePath(); g.fill();
    H.ngon(g, 0, 0, 6, R0 - 7, 0, null, T.indigo, 2.4);
    H.poly(g, [-8, by - 1, 0, by - 20, 8, by - 1], '#1c1a18', OUT, 1.1);
    H.circ(g, 0, 0, 10.5, H.ball(g, 0, 0, 10.5, T.indigo), OUT, 1.4);
    spiral(g, 18, 0.5, 0.8, 0.42); g.strokeStyle = T.bolt; g.lineWidth = 1.5; g.stroke();
    H.circ(g, -17, by + 1, 2.8, T.bolt, OUT, 0.9);
    H.circ(g, 17, by + 1, 2.8, T.bolt, OUT, 0.9);
  };
  BO.whirltent = function (g, t) {
    var by = 42 * 0.866;
    H.glow(g, -17, by + 1, 7, '#ffe66b', 0.5 + 0.2 * Math.sin(t * 9));
    H.glow(g, 17, by + 1, 7, '#ffe66b', 0.5 + 0.2 * Math.sin(t * 9 + 2));
  };

  B.altar = function (g, C, s) {
    var h = s / 2, i, a;
    H.circ(g, 0, 0, h - 5, H.rg(g, -6, -6, 4, h - 5, [0, '#a4adc2', 0.7, '#6b7490', 1, '#444c66']), OUT, 1.8);
    H.ring(g, 0, 0, h - 14, 'rgba(20,25,50,0.5)', 1.2);
    H.circ(g, 0, 0, 22, H.rg(g, -3, -3, 2, 22, [0, '#59648c', 1, '#2a3154']), OUT, 1.4);
    for (i = 0; i < 8; i++) { a = i * 0.7854; H.line(g, Math.cos(a) * 9, Math.sin(a) * 9, Math.cos(a) * 20, Math.sin(a) * 20, 'rgba(255,230,107,0.75)', 1.3); }
    H.ring(g, 0, 0, 15, 'rgba(255,230,107,0.6)', 1);
    for (i = 0; i < 8; i++) {
      a = i * 0.7854 + 0.39;
      g.save(); g.translate(Math.cos(a) * (h - 13), Math.sin(a) * (h - 13)); g.rotate(a);
      H.rr(g, -4.6, -6.8, 9.2, 13.6, 3, H.lg(g, -4, -6, 4, 6, [0, '#b4bdd2', 1, '#525b78']), OUT, 1.2);
      if (i % 2 === 0) H.rr(g, -1.7, -4.4, 3.4, 8.8, 1.2, C.t, OUT, 0.6);
      g.restore();
    }
    H.circ(g, 0, 0, 7, T.navy, OUT, 1.2);
    H.circ(g, 0, 0, 4.6, H.rg(g, -1, -1, 0.4, 4.6, [0, '#ffffff', 0.5, T.bolt, 1, '#d9a020']), null);
  };
  BO.altar = function (g, t, C, b) {
    H.glow(g, 0, 0, 13 + Math.sin(t * 3.4) * 2, '#ffe66b', 0.55 + 0.2 * Math.sin(t * 3.4));
    var k = Math.floor(t * 5) % 8, a = k * 0.7854 + 0.39;
    if ((Math.floor(t * 5) * 7) % 3 === 0 || (b && b.queue && b.queue.length)) {
      var mx = Math.cos(a) * 18 + Math.sin(t * 40) * 3, my = Math.sin(a) * 18 + Math.cos(t * 37) * 3;
      g.strokeStyle = 'rgba(255,251,224,0.85)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(mx, my); g.lineTo(Math.cos(a) * 34, Math.sin(a) * 34); g.stroke();
    }
  };

  B.weather = function (g, C, s) {
    var h = s / 2, i, a, n = 10, R0 = 28;
    H.circ(g, 0, 0, h - 6, H.rg(g, -6, -6, 4, h - 6, [0, '#b99468', 1, '#5a4028']), OUT, 1.8);
    for (i = 0; i < 12; i++) { a = i * 0.5236; H.line(g, Math.cos(a) * 27, Math.sin(a) * 27, Math.cos(a) * (h - 7), Math.sin(a) * (h - 7), 'rgba(50,30,15,0.5)', 1); }
    for (i = 0; i < n; i++) {
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R0, i / n * TAU, (i + 1) / n * TAU + 0.01); g.closePath();
      g.fillStyle = i % 2 ? T.cloth : '#dcd2b6'; g.fill();
    }
    tentShade(g, R0); g.beginPath(); g.arc(0, 0, R0, 0, TAU); g.fill();
    H.ring(g, 0, 0, R0, OUT, 1.6);
    H.ring(g, 0, 0, R0 - 4.5, T.indigo, 2.4);
    H.line(g, 27, -27, 27, -34, OUT, 3); H.circ(g, 27, -27, 2.6, T.wood, OUT, 0.9);
    H.poly(g, [27, -37, 43, -33.5, 43, -29.5, 27, -31], C.t, OUT, 1);
    H.line(g, 32.5, -35.6, 32.5, -30.6, C.tl, 1.6); H.line(g, 38, -34.6, 38, -30, C.tl, 1.6);
    H.circ(g, 0, 0, 6.5, H.ball(g, 0, 0, 6.5, C.t), OUT, 1.3);
  };
  BO.weather = function (g, t) {
    g.save(); g.rotate(t * 3);
    for (var i = 0; i < 3; i++) {
      g.rotate(2.0944);
      H.line(g, 0, 0, 20, 0, OUT, 2.8); H.line(g, 0, 0, 20, 0, '#d7dde6', 1.3);
      H.circ(g, 20, 0, 4.2, T.navy, OUT, 1);
      H.circ(g, 20.6, -0.6, 2, T.slate, null);
    }
    g.restore();
    H.circ(g, 0, 0, 3.2, T.bolt, OUT, 0.9);
  };

  B.rod = function (g, C, s) {
    var h = s / 2, i, a;
    for (i = 0; i < 3; i++) {
      a = i * 2.0944 - 1.5708;
      H.line(g, 0, 0, Math.cos(a) * (h - 6), Math.sin(a) * (h - 6), OUT, 6);
      H.line(g, 0, 0, Math.cos(a) * (h - 6), Math.sin(a) * (h - 6), T.slate, 3.6);
      H.circ(g, Math.cos(a) * (h - 6), Math.sin(a) * (h - 6), 4.6, T.navy, OUT, 1.1);
    }
    H.circ(g, 0, 0, 15.5, H.rg(g, -3, -3, 1, 15.5, [0, '#fffaf0', 1, T.clothD]), OUT, 1.5);
    H.ring(g, 0, 0, 11.8, C.t, 3);
    H.circ(g, 0, 0, 8.6, T.navy, OUT, 1.2);
    H.ring(g, 0, 0, 6.3, '#d9a020', 1.4);
    H.ring(g, 0, 0, 4, T.bolt, 1.3);
    H.circ(g, 0, 0, 2.3, T.spark, null);
  };
  BO.rod = function (g, t, C, b) {
    var hot = b && b.atkTick !== undefined && R.game && R.game.world && (R.game.world.tick - b.atkTick) < 8;
    H.glow(g, 0, 0, hot ? 22 : 9 + Math.sin(t * 6) * 1.5, '#ffe66b', hot ? 0.95 : 0.5);
    var a = Math.floor(t * 9) * 2.4;
    g.strokeStyle = 'rgba(255,251,224,0.8)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 5 + 2, Math.sin(a) * 5); g.lineTo(Math.cos(a + 0.4) * 10, Math.sin(a + 0.4) * 10); g.stroke();
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
