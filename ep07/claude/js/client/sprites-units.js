/* 해돌전쟁 — 유닛 그림 (위에서 내려다본 모습, +x 방향이 앞) */
'use strict';
(function (g0) {
  var R = g0.RTS, S = R.Sprites, H = S.h, OUT = S.OUT;
  var U = S.unitDraw, UO = S.unitOverlay;
  var TAU = 6.2832;

  var F = S.F = { iron: '#6b7078', ironD: '#3d4148', ironL: '#a3a9b2', brass: '#c9973f', brassL: '#ecc76c', copper: '#b8693a', copperD: '#7d4526', black: '#16181c', wood: '#8a6a48' };
  var P = S.P = { leaf: '#5fae3c', leafD: '#2f6b2a', leafL: '#a4dc5c', bark: '#7a5232', barkD: '#4a2f1c', barkL: '#b98a58', seed: '#e3cf8f', pump: '#e08a2c', pumpD: '#a85a18' };
  var T = S.T = { cloth: '#efe6cf', clothD: '#c9bc9a', indigo: '#33407a', navy: '#1b2244', slate: '#56628a', bolt: '#ffe66b', spark: '#fffbe0', wood: '#8a6a48' };

  function limb(g, x1, y1, x2, y2, col, w) { H.line(g, x1, y1, x2, y2, OUT, w + 1.6); H.line(g, x1, y1, x2, y2, col, w); }

  /* ════════ 무쇠 공방 ════════ */
  U.tinker = function (g, C, f) {
    var s = Math.sin(f.w * TAU), ex = f.a ? 2.5 : 0;
    limb(g, 1, -5, 7 + ex + s * 1.2, -4.2, F.ironL, 1.8);
    limb(g, 1, 5, 7 + ex - s * 1.2, 4.2, F.ironL, 1.8);
    H.circ(g, 7.6 + ex + s * 1.2, -4.2, 1.7, F.brass, OUT, 0.8);
    H.circ(g, 7.6 + ex - s * 1.2, 4.2, 1.7, F.brass, OUT, 0.8);
    H.rr(g, -9.2, -4, 5.5, 8, 2, F.ironD, OUT, 1.1);
    H.rr(g, -8.3, -1.5, 2.2, 3, 1, F.brass, null);
    H.circ(g, -1, 0, 6.6, H.ball(g, -1, 0, 6.6, F.copper), OUT, 1.2);
    H.circ(g, 1.2, 0, 3.7, H.ball(g, 1.2, 0, 3.7, C.t), OUT, 1.1);
    H.circ(g, 3, 0, 1.1, '#fff6c9', null);
    if (f.a) H.star(g, 11, 0, 4, 3.4, 1.2, 0.4, '#fff3a8', null);
  };

  U.hammerer = function (g, C, f) {
    var s = Math.sin(f.w * TAU);
    H.ell(g, -1 + s * 2.6, -4.2, 3.4, 2.2, 0, F.black, null);
    H.ell(g, -1 - s * 2.6, 4.2, 3.4, 2.2, 0, F.black, null);
    g.save();
    if (f.a) { g.translate(3, 5); g.rotate(-0.85); } else { g.translate(-1, 8.2); g.rotate(0.08 * s); }
    H.rr(g, -1, -1.3, 12, 2.6, 1, F.wood, OUT, 1);
    H.rr(g, 9, -4.2, 6, 8.4, 1.4, H.lg(g, 9, -4, 15, 4, [0, F.ironL, 1, F.ironD]), OUT, 1.2);
    g.restore();
    H.rr(g, -4.6, -8.6, 9.2, 17.2, 4, H.lg(g, -4, -8, 4, 8, [0, F.ironL, 0.5, F.iron, 1, F.ironD]), OUT, 1.2);
    H.circ(g, 0, -7, 3.3, H.ball(g, 0, -7, 3.3, C.t), OUT, 1.1);
    H.circ(g, 0, 7, 3.3, H.ball(g, 0, 7, 3.3, C.t), OUT, 1.1);
    H.circ(g, 0.6, 0, 3.5, H.ball(g, 0.6, 0, 3.5, F.brass), OUT, 1.1);
    H.rr(g, 1.9, -1.9, 1.4, 3.8, 0.6, F.black, null);
    if (f.a) H.arc(g, 3, 2, 12, -1.1, 0.2, 'rgba(255,255,255,0.7)', 1.6);
  };

  U.nailer = function (g, C, f) {
    var s = Math.sin(f.w * TAU), rc = f.a ? -1.4 : 0;
    H.ell(g, -1.5 + s * 2.4, -3.8, 3, 2, 0, F.black, null);
    H.ell(g, -1.5 - s * 2.4, 3.8, 3, 2, 0, F.black, null);
    H.rr(g, 2 + rc, -2.6, 11, 2, 0.8, F.ironD, OUT, 0.9);
    H.rr(g, 2 + rc, 0.6, 11, 2, 0.8, F.ironD, OUT, 0.9);
    H.rr(g, 1.5 + rc, -3.2, 5, 6.4, 1.2, F.iron, OUT, 1);
    H.ell(g, -1.5, 0, 5.6, 6.6, 0, H.ball(g, -1.5, 0, 6.6, F.iron), OUT, 1.2);
    H.circ(g, 0.5, 5.6, 2.9, H.ball(g, 0.5, 5.6, 2.9, F.brass), OUT, 1);
    H.circ(g, 0.5, 5.6, 1, F.copperD, null);
    H.circ(g, -0.8, 0, 3.8, H.ball(g, -0.8, 0, 3.8, C.t), OUT, 1.1);
    H.rr(g, -4.2, -0.8, 6.8, 1.6, 0.6, C.tl, null);
    if (f.a) { H.star(g, 14.5, -1.6, 4, 3.6, 1.2, 0.2, '#fff3a8', null); H.star(g, 14.5, 1.6, 4, 2.8, 1, 0.6, '#ffd36b', null); }
  };

  U.turtle = function (g, C, f) {
    var i, sd;
    for (sd = -1; sd <= 1; sd += 2) {
      H.rr(g, -14, sd * 10.5 - 2.7, 28, 5.4, 2, F.black, OUT, 1);
      for (i = 0; i < 7; i++) { var x = -13 + ((i * 4 + f.w * 4) % 26); H.line(g, x, sd * 10.5 - 2, x, sd * 10.5 + 2, '#50545b', 1); }
    }
    H.rr(g, -13, -9, 26, 18, 5, H.lg(g, 0, -9, 0, 9, [0, F.ironL, 0.5, F.iron, 1, F.ironD]), OUT, 1.3);
    H.ngon(g, -1, 0, 8, 8.8, 0.3927, H.ball(g, -1, 0, 8.8, F.brass), OUT, 1.1);
    for (i = 0; i < 8; i++) { var a = 0.3927 + i * 0.7854; H.line(g, -1 + Math.cos(a) * 5.2, Math.sin(a) * 5.2, -1 + Math.cos(a) * 8.6, Math.sin(a) * 8.6, F.copperD, 0.9); }
    H.circ(g, 11, -5.2, 1.3, '#fff6c9', OUT, 0.5);
    H.circ(g, 11, 5.2, 1.3, '#fff6c9', OUT, 0.5);
  };
  U.turtle_turret = function (g, C, f) {
    var rc = f.a ? -2.4 : 0;
    H.rr(g, 3 + rc, -1.9, 13, 3.8, 1, H.lg(g, 0, -2, 0, 2, [0, F.ironL, 1, F.ironD]), OUT, 1.1);
    H.rr(g, 14.5 + rc, -2.8, 3.6, 5.6, 1, F.ironD, OUT, 1);
    H.circ(g, -1, 0, 5.6, H.ball(g, -1, 0, 5.6, C.t), OUT, 1.2);
    H.circ(g, -1, 0, 2, C.td, OUT, 0.6);
    if (f.a) { H.star(g, 20.5, 0, 5, 5.8, 2, 0.3, '#fff3a8', null); H.circ(g, 19.5, 0, 2.2, '#ffffff', null); }
  };

  U.mortar = function (g, C, f) {
    var pts = [[-6, -9], [5, -9], [-6, 9], [5, 9]], i;
    for (i = 0; i < 4; i++) {
      H.rr(g, pts[i][0] - 3.4, pts[i][1] - 2.1, 6.8, 4.2, 1.6, F.black, OUT, 1);
      var sx = pts[i][0] - 2.4 + ((f.w * 4.8) % 2.4) * 2;
      H.line(g, sx, pts[i][1] - 1.5, sx, pts[i][1] + 1.5, '#555a61', 0.9);
    }
    H.poly(g, [-11, -5, -15.5, -7, -15.5, 7, -11, 5], F.ironD, OUT, 1.1);
    H.rr(g, -11, -7.5, 21, 15, 3.5, H.lg(g, 0, -8, 0, 8, [0, F.ironL, 0.5, F.iron, 1, F.ironD]), OUT, 1.3);
    H.circ(g, 0.5, 0, 6.8, H.ball(g, 0.5, 0, 6.8, F.brass), OUT, 1.3);
    H.ring(g, 0.5, 0, 5.3, C.t, 1.9);
    H.circ(g, 2.2, 0, 3.7, f.a ? '#ffb347' : F.black, OUT, 1);
    if (f.a) H.glow(g, 2.2, 0, 11, '#ffcf5a', 0.95);
  };

  U.dragonfly = function (g, C, f) {
    var rc = f.a ? -1 : 0;
    H.rr(g, -16, -1.1, 12, 2.2, 1, F.ironD, OUT, 1);
    H.poly(g, [-16, 0, -19.5, -4.2, -14.5, -1.2, -14.5, 1.2, -19.5, 4.2], C.t, OUT, 1);
    limb(g, 1, -9.5, 1, 9.5, F.ironL, 2);
    H.rr(g, 6 + rc, -3.9, 6, 1.4, 0.5, F.black, null);
    H.rr(g, 6 + rc, 2.5, 6, 1.4, 0.5, F.black, null);
    H.ell(g, 0, 0, 10.5, 3.9, 0, H.lg(g, 0, -4, 0, 4, [0, F.ironL, 0.5, F.iron, 1, F.ironD]), OUT, 1.2);
    H.ell(g, 8, 0, 3, 2.6, 0, H.ball(g, 8, 0, 3, F.brass), OUT, 1);
    H.ell(g, 3.2, 0, 3.3, 2.3, 0, H.ball(g, 3.2, 0, 3.3, C.t), OUT, 1);
    H.circ(g, 1, -9.5, 2, F.brass, OUT, 1);
    H.circ(g, 1, 9.5, 2, F.brass, OUT, 1);
    if (f.a) { H.star(g, 13.5, -3.2, 4, 3, 1, 0.2, '#fff3a8', null); H.star(g, 13.5, 3.2, 4, 3, 1, 0.5, '#fff3a8', null); }
  };
  UO.dragonfly = function (g, t) {
    for (var sd = -1; sd <= 1; sd += 2) {
      g.fillStyle = 'rgba(215,225,235,0.2)';
      g.beginPath(); g.arc(1, sd * 9.5, 6.6, 0, TAU); g.fill();
      var a = t * 40 * sd;
      g.strokeStyle = 'rgba(35,38,44,0.7)'; g.lineWidth = 1.3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(1 + Math.cos(a) * 6.6, sd * 9.5 + Math.sin(a) * 6.6); g.lineTo(1 - Math.cos(a) * 6.6, sd * 9.5 - Math.sin(a) * 6.6); g.stroke();
    }
  };

  /* ════════ 새순 일족 ════════ */
  U.sprig = function (g, C, f) {
    var s = Math.sin(f.w * TAU), ex = f.a ? 2 : 0;
    H.line(g, 1, -3.5, 6.5 + ex + s, -3.2, P.barkD, 2.2);
    H.line(g, 1, 3.5, 6.5 + ex - s, 3.2, P.barkD, 2.2);
    H.leaf(g, -2, -1, 9.5, 3.6, -2.5 + s * 0.14, H.lg(g, -8, -8, 0, 0, [0, P.leafL, 1, P.leaf]), OUT, 1);
    H.leaf(g, -2, 1, 9.5, 3.6, 2.5 - s * 0.14, H.lg(g, -8, 8, 0, 0, [0, P.leaf, 1, P.leafD]), OUT, 1);
    H.ell(g, 0, 0, 5.8, 5.2, 0, H.ball(g, 0, 0, 5.8, P.seed), OUT, 1.2);
    H.circ(g, -1.6, 0, 2.5, H.ball(g, -1.6, 0, 2.5, C.t), OUT, 1);
    H.circ(g, 3.4, -2, 0.9, OUT, null);
    H.circ(g, 3.4, 2, 0.9, OUT, null);
  };

  U.burr = function (g, C, f) {
    var out = f.a ? 11.2 : 9.6;
    H.star(g, 0, 0, 12, out, 5.8, f.w * 0.5236, H.rg(g, -2, -2, 1, 10, [0, '#c1dc5e', 0.6, '#7da83a', 1, '#4f7a25']), OUT, 1.1);
    H.circ(g, 0, 0, 5, H.ball(g, 0, 0, 5, '#8a5a2c'), OUT, 1);
    H.circ(g, -1.2, 0, 2.2, H.ball(g, -1.2, 0, 2.2, C.t), OUT, 0.6);
    H.circ(g, 3, -1.8, 1, '#fff', null); H.circ(g, 3, 1.8, 1, '#fff', null);
    H.circ(g, 3.3, -1.8, 0.5, OUT, null); H.circ(g, 3.3, 1.8, 0.5, OUT, null);
  };

  U.spitter = function (g, C, f) {
    var s = Math.sin(f.w * TAU), ex = f.a ? 1.6 : 0, i;
    H.leaf(g, -3, 0, 8.5, 3, 2.6 + s * 0.12, P.leaf, OUT, 1);
    H.leaf(g, -3, 0, 8.5, 3, -2.6 - s * 0.12, P.leafD, OUT, 1);
    for (i = 0; i < 6; i++) { var a = i * 1.0472 + 0.52; H.leaf(g, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 6.4, 3, a, i % 2 ? C.t : C.tl, OUT, 0.9); }
    H.poly(g, [2, -2.4, 10.5 + ex, -1.7, 10.5 + ex, 1.7, 2, 2.4], P.leafL, OUT, 1.1);
    H.ell(g, 10.5 + ex, 0, 1.2, 1.7, 0, P.barkD, OUT, 0.8);
    H.circ(g, 0, 0, 4.7, H.ball(g, 0, 0, 4.7, P.leaf), OUT, 1.2);
    H.circ(g, 1.6, -1.7, 0.9, OUT, null); H.circ(g, 1.6, 1.7, 0.9, OUT, null);
    if (f.a) H.circ(g, 13.8, 0, 1.8, P.seed, OUT, 0.8);
  };

  U.stumpling = function (g, C, f) {
    var s = Math.sin(f.w * TAU), fw = f.a ? 5 : 0, sd;
    for (sd = -1; sd <= 1; sd += 2) {
      var ax = 10 + fw + s * 2.2 * sd, ay = sd * (f.a ? 5.5 : 9.5);
      limb(g, 1, sd * 8, ax, ay, P.bark, 4.4);
      H.circ(g, ax + 1, ay, 4.5, H.ball(g, ax + 1, ay, 4.5, P.leaf), OUT, 1.1);
      H.circ(g, ax + 1.6, ay, 1.5, C.t, null);
    }
    H.poly(g, [-9, -5, -14.5, -7.5 + s, -10, -1], P.barkD, OUT, 1);
    H.poly(g, [-9, 5, -14.5, 7.5 - s, -10, 1], P.barkD, OUT, 1);
    H.circ(g, 0, 0, 10.8, P.barkD, OUT, 1.3);
    H.circ(g, 0, 0, 8.7, H.rg(g, -2, -2, 1, 9, [0, '#e6c898', 0.7, P.barkL, 1, '#96683e']), null);
    H.ring(g, 0, 0, 6, 'rgba(110,70,35,0.55)', 0.9);
    H.ring(g, 0, 0, 3.4, 'rgba(110,70,35,0.55)', 0.9);
    H.line(g, 2, -1, 7.5, -3.5, 'rgba(80,45,20,0.7)', 1);
    H.circ(g, -5.5, -5, 3.5, P.leaf, OUT, 0.8);
    H.circ(g, -7, 2.5, 2.9, P.leafD, OUT, 0.8);
    H.circ(g, -3, 6.2, 2.5, P.leaf, OUT, 0.8);
    H.flower(g, -5.5, -5, 2.7, C.t);
    H.flower(g, -3, 6.2, 2.1, C.tl);
    H.circ(g, 5, -2.6, 1.3, '#fff8d0', OUT, 0.6);
    H.circ(g, 5, 2.6, 1.3, '#fff8d0', OUT, 0.6);
    if (f.a) H.arc(g, 8, 0, 11, -0.6, 0.6, 'rgba(255,255,255,0.65)', 1.8);
  };

  U.gourd = function (g, C, f) {
    var s = Math.sin(f.w * TAU), legs = [[-7, -7], [6, -7], [-7, 7], [6, 7]], i;
    for (i = 0; i < 4; i++) {
      var k = (i % 2 ? s : -s) * 1.5;
      limb(g, legs[i][0] * 0.5, legs[i][1] * 0.5, legs[i][0] + k, legs[i][1] * 1.25, P.leafD, 2);
    }
    H.circ(g, 0, 0, 9.4, H.rg(g, -3, -3, 1, 10, [0, '#ffc266', 0.55, P.pump, 1, P.pumpD]), OUT, 1.3);
    H.ell(g, 0, 0, 3.2, 9.2, 0, null, 'rgba(120,60,10,0.55)', 0.9);
    H.ell(g, 0, 0, 6.7, 9.2, 0, null, 'rgba(120,60,10,0.4)', 0.9);
    H.leaf(g, -1, 0, 7.5, 3, 2.3, C.t, OUT, 0.9);
    H.leaf(g, -1, 0, 7.5, 3, -2.3, C.t, OUT, 0.9);
    if (f.a) { limb(g, 0, 0, 9.5, 0, P.leaf, 2.2); H.circ(g, 10.5, 0, 1.7, P.leafL, OUT, 0.8); }
    else { limb(g, 0, 0, -8, 0, P.leaf, 2.2); H.circ(g, -9.8, 0, 3.4, H.ball(g, -9.8, 0, 3.4, P.pump), OUT, 1); }
    H.circ(g, 0, 0, 2.7, H.ball(g, 0, 0, 2.7, P.leafD), OUT, 1);
    H.poly(g, [5, -3.8, 7.6, -2.5, 5, -1.4], '#3a1c05', null);
    H.poly(g, [5, 3.8, 7.6, 2.5, 5, 1.4], '#3a1c05', null);
  };

  U.moth = function (g, C, f) {
    var k = [1, 0.72, 0.45, 0.72][Math.round(f.w * 4) % 4], sd;
    for (sd = -1; sd <= 1; sd += 2) {
      g.save(); g.scale(1, sd * k);
      H.leaf(g, -1, 1, 11.5, 5.6, 2.25, H.lg(g, -8, 2, 0, 9, [0, P.leafD, 1, P.leaf]), OUT, 1);
      H.leaf(g, 1, 1, 14.5, 7.2, 1.15, H.lg(g, 0, 0, 6, 13, [0, P.leaf, 1, P.leafL]), OUT, 1);
      H.line(g, 1, 1, 6.4, 12, 'rgba(30,80,30,0.55)', 0.8);
      H.circ(g, 5.2, 8.4, 2.6, C.t, OUT, 0.8);
      H.circ(g, 5.2, 8.4, 1, C.tl, null);
      g.restore();
    }
    H.ell(g, 0, 0, 6.5, 2, 0, H.lg(g, 0, -2, 0, 2, [0, P.barkL, 1, P.barkD]), OUT, 1);
    H.circ(g, 6.4, 0, 2.2, P.bark, OUT, 1);
    H.line(g, 7.6, -1, 11, -3.4, OUT, 0.9);
    H.line(g, 7.6, 1, 11, 3.4, OUT, 0.9);
    if (f.a) H.circ(g, 12.5, 0, 1.7, '#f4ffb0', OUT, 0.6);
  };

  /* ════════ 번개 유랑단 ════════ */
  U.strider = function (g, C, f) {
    var s = Math.sin(f.w * TAU), legs = [[6.5, -8.5, 1], [-6, -8.5, -1], [6.5, 8.5, -1], [-6, 8.5, 1]], i;
    for (i = 0; i < 4; i++) {
      var x = legs[i][0] + s * 1.4 * legs[i][2];
      limb(g, 0, 0, x, legs[i][1], T.slate, 1);
      H.ell(g, x, legs[i][1], 2.3, 1.4, 0, T.navy, OUT, 0.8);
    }
    H.leaf(g, -8.5, 0, 18, 3.8, 0, H.lg(g, 0, -3, 0, 3, [0, '#fffaf0', 1, T.clothD]), OUT, 1.2);
    H.line(g, -5, 0, 6, 0, T.indigo, 1.4);
    H.circ(g, -0.5, 0, 2.9, H.ball(g, -0.5, 0, 2.9, C.t), OUT, 1);
    H.circ(g, 7.4, 0, 1.4, T.bolt, OUT, 0.7);
    if (f.a) H.glow(g, 8, 0, 7, '#ffe66b', 0.9);
  };

  U.gale = function (g, C, f) {
    var s = Math.sin(f.w * TAU), sd;
    g.beginPath(); g.moveTo(-3, -1.3); g.quadraticCurveTo(-8, -3 + s * 2, -13.5, s * 2.5); g.quadraticCurveTo(-8, 1 + s * 2, -3, 1.3); g.closePath();
    H.fs(g, C.t, OUT, 0.9);
    H.poly(g, [10, 0, 0, -3.6, -9, -2, -9, 2, 0, 3.6], H.lg(g, 0, -4, 0, 4, [0, T.slate, 1, T.navy]), OUT, 1.2);
    H.line(g, -7, 0, 7.5, 0, T.cloth, 1);
    for (sd = -1; sd <= 1; sd += 2) {
      g.beginPath();
      if (f.a) { g.moveTo(1, sd * 4.5); g.quadraticCurveTo(9, sd * 7, 13.5, sd * 0.8); g.quadraticCurveTo(8, sd * 4, 1, sd * 2.6); }
      else { g.moveTo(-1, sd * 4.5); g.quadraticCurveTo(5, sd * 10.5, 11.5, sd * 7.5); g.quadraticCurveTo(5, sd * 7.5, -1, sd * 2.8); }
      g.closePath();
      H.fs(g, H.lg(g, 0, 0, 11, sd * 8, [0, '#cfd6e2', 1, '#ffffff']), OUT, 1);
    }
    H.ell(g, -1, 0, 3.6, 4.4, 0, T.navy, OUT, 1);
    H.circ(g, -0.6, 0, 3, H.ball(g, -0.6, 0, 3, C.t), OUT, 1);
    if (f.a) H.arc(g, 5, 0, 9.5, -0.7, 0.7, 'rgba(255,255,255,0.85)', 1.7);
  };

  U.bolter = function (g, C, f) {
    var s = Math.sin(f.w * TAU);
    H.poly(g, [-3, -3, -11.5, -2 + s * 1.6, -9.5, 0, -11.5, 2 + s * 1.6, -3, 3], C.td, OUT, 0.9);
    H.circ(g, 0, 0, 6.6, H.rg(g, -2, -2, 1, 7, [0, '#fffaf0', 1, T.clothD]), OUT, 1.2);
    H.ring(g, 0, 0, 4.6, T.indigo, 1.3);
    var rad = f.a ? 8.6 : 9.8;
    H.arc(g, -1.5, 0, rad, -1.15, 1.15, OUT, 3.2);
    H.arc(g, -1.5, 0, rad, -1.15, 1.15, T.wood, 1.7);
    var bx = -1.5 + Math.cos(1.15) * rad, by = Math.sin(1.15) * rad;
    if (f.a) H.line(g, bx, -by, bx, by, 'rgba(255,255,255,0.85)', 0.8);
    else {
      H.line(g, bx, -by, -1, 0, 'rgba(255,255,255,0.85)', 0.8);
      H.line(g, bx, by, -1, 0, 'rgba(255,255,255,0.85)', 0.8);
      H.line(g, -1, 0, 10.8, 0, OUT, 2.4);
      H.line(g, -1, 0, 10.8, 0, T.bolt, 1.3);
      H.circ(g, 11, 0, 1.4, T.spark, OUT, 0.5);
    }
    H.circ(g, -0.5, 0, 3, H.ball(g, -0.5, 0, 3, C.t), OUT, 1);
    if (f.a) H.glow(g, 11, 0, 8, '#ffe66b', 0.95);
  };

  U.chariot = function (g, C, f) {
    var s = Math.sin(f.w * TAU), sd;
    for (sd = -1; sd <= 1; sd += 2) {
      H.rr(g, -13, sd * 9 - 2.9, 27, 5.8, 2.9, H.lg(g, 0, sd * 9 - 3, 0, sd * 9 + 3, [0, T.slate, 1, T.navy]), OUT, 1.2);
      H.line(g, -9, sd * 9, 9, sd * 9, T.cloth, 1);
      H.circ(g, 11.8, sd * 9, 1.7, C.t, OUT, 0.7);
    }
    H.rr(g, -9, -7, 17, 14, 2.5, H.lg(g, 0, -7, 0, 7, [0, '#fffaf0', 1, T.clothD]), OUT, 1.2);
    H.line(g, -4.5, -6, -4.5, 6, 'rgba(120,100,70,0.5)', 0.8);
    H.line(g, 3, -6, 3, 6, 'rgba(120,100,70,0.5)', 0.8);
    H.poly(g, [5.8, 0, -3.5, -2.2 + s, -3.5, 2.2 + s], C.t, OUT, 0.9);
    for (sd = -1; sd <= 1; sd += 2) {
      H.circ(g, -1.5, sd * 4.4, 3.4, T.navy, OUT, 1);
      H.circ(g, -1.5, sd * 4.4, 2.3, H.rg(g, -2, sd * 4.4 - 0.6, 0.2, 2.6, [0, '#ffffff', 0.5, T.bolt, 1, '#d9a020']), null);
    }
    H.circ(g, 6, 0, 1.7, T.wood, OUT, 0.8);
    if (f.a) {
      H.glow(g, -1.5, -4.4, 9, '#ffe66b', 0.9); H.glow(g, -1.5, 4.4, 9, '#ffe66b', 0.9);
      H.line(g, -1.5, -4.4, -0.3, 0, '#fffbe0', 1.4); H.line(g, -0.3, 0, -2.4, 4.4, '#fffbe0', 1.4);
    }
  };

  U.drum = function (g, C, f) {
    var i, a;
    H.circ(g, 0, 0, 10.8, H.rg(g, -3, -3, 1, 11, [0, '#fffaf0', 1, T.clothD]), OUT, 1.3);
    H.ring(g, 0, 0, 9.1, T.indigo, 1.6);
    for (i = 0; i < 3; i++) {
      a = i * 2.0944 + 1.047;
      H.circ(g, Math.cos(a) * 10.6, Math.sin(a) * 10.6, 2, T.navy, OUT, 0.8);
      H.circ(g, Math.cos(a) * 10.6, Math.sin(a) * 10.6, 0.9, T.bolt, null);
    }
    H.circ(g, 0, 0, 7.3, C.t, OUT, 1.2);
    H.circ(g, 0, 0, 5.8, f.a ? '#fff6b8' : H.rg(g, -1.5, -1.5, 0.5, 6, [0, '#fff8e6', 1, '#d9c9a0']), OUT, 0.8);
    g.beginPath();
    for (i = 0; i <= 20; i++) { a = i * 0.42; var rr = 0.6 + i * 0.23; if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.strokeStyle = T.indigo; g.lineWidth = 1.1; g.stroke();
    var m = f.a ? 1.5 : 5.5;
    limb(g, -9, -7, -m, -m * 0.6 - 0.5, T.wood, 1.3); H.circ(g, -m, -m * 0.6 - 0.5, 1.8, '#fff', OUT, 0.7);
    limb(g, -9, 7, -m, m * 0.6 + 0.5, T.wood, 1.3); H.circ(g, -m, m * 0.6 + 0.5, 1.8, '#fff', OUT, 0.7);
    if (f.a) H.glow(g, 0, 0, 14, '#ffe66b', 0.8);
  };

  U.hawk = function (g, C, f) {
    var k = [1, 0.9, 0.78, 0.9][Math.round(f.w * 4) % 4], sd;
    H.poly(g, [-9, -1, -15.5, -3.6, -12, 0, -15.5, 3.6, -9, 1], T.indigo, OUT, 1);
    for (sd = -1; sd <= 1; sd += 2) {
      g.save(); g.scale(1, sd * k);
      H.poly(g, [10, 0, 3, 3, -5, 14.5, -7.5, 9, -4, 3.5, -10, 0.8, -10, 0], H.lg(g, 6, 0, -6, 13, [0, '#fffaf0', 1, T.clothD]), OUT, 1.2);
      H.poly(g, [3, 3, -5, 14.5, -3.2, 14.6, 5.5, 2.4], T.indigo, null);
      H.poly(g, [-5, 14.5, -7.5, 9, -5.6, 8.6, -3.4, 12.6], C.t, OUT, 0.8);
      H.line(g, 0, 2, -5.5, 9.5, 'rgba(60,60,90,0.4)', 0.7);
      g.restore();
    }
    H.ell(g, 0, 0, 9, 2.4, 0, H.lg(g, 0, -2.4, 0, 2.4, [0, T.slate, 1, T.navy]), OUT, 1.1);
    H.circ(g, -1, 0, 2.5, H.ball(g, -1, 0, 2.5, C.t), OUT, 0.9);
    H.poly(g, [9, -1.3, 12.8, 0, 9, 1.3], T.bolt, OUT, 0.8);
    H.circ(g, 6, 0, 1.3, T.spark, null);
    if (f.a) H.glow(g, 11.5, 0, 8, '#ffe66b', 0.95);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
