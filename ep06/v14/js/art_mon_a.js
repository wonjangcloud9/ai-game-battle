'use strict';
/* 등불지기 — monster art A: 허수아비 · 이슬풀 들판/바람언덕 · 속삭임 숲 · 반딧불 늪 · 메아리 동굴(박쥐·게)
   A.M[id](ctx, s) — local coords, origin = bottom-center of the hitbox, creature faces RIGHT, y up is negative.
   s: { t, state:'idle'|'move'|'attack'|'hit', p, atk, air, vy, rage, w, h, seed }
   The engine does flip / hit-flash / death / shadow / bars; these only draw the creature. */
(function () {
  const G = window.G, U = G.U, A = G.Art;
  const M = A.M || (A.M = {});
  const AN = A.MANCHOR || (A.MANCHOR = {});
  const PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs;
  const lerp = U.lerp, sat = U.sat, clamp = U.clamp, E = U.ease;
  const OUT = A.OUT, fs = A.fs, ell = A.ell, rr = A.rr, poly = A.poly, glow = A.glow, shade = A.shade, mix = A.mix;

  // ------------------------------------------------------------ helpers
  const tt = (s) => (s.t || 0) + (s.seed || 0) * 0.613;
  const isBlink = (s, per) => { per = per || 3.3; return (tt(s) % per) > per - 0.13; };
  const begin = (ctx) => { ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; };
  function pivot(ctx, x, y, r) { ctx.translate(x, y); ctx.rotate(r); ctx.translate(-x, -y); }
  // stroke the current path as an outlined "tube" (limbs, stems)
  function stroke2(ctx, color, wIn, wOut) {
    ctx.lineWidth = wOut || wIn + 4.6; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.lineWidth = wIn; ctx.strokeStyle = color; ctx.stroke();
  }
  function seg(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); }
  // merged circles [x,y,r,...]: outline pass then fill pass (no inner outlines)
  function blobs(ctx, b, fill, lw) {
    ctx.lineWidth = (lw || A.LW) * 2; ctx.strokeStyle = OUT;
    for (let i = 0; i < b.length; i += 3) { ell(ctx, b[i], b[i + 1], b[i + 2]); ctx.stroke(); }
    ctx.fillStyle = fill;
    for (let i = 0; i < b.length; i += 3) { ell(ctx, b[i], b[i + 1], b[i + 2]); ctx.fill(); }
  }
  // fluffy ball (ring of bumps + core)
  function fluff(ctx, cx, cy, R, t, fill, n, lw) {
    const b = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + 0.35; b.push(cx + cos(a) * R * 0.64, cy + sin(a) * R * 0.64, R * 0.43 + sin(t * 3 + i * 1.9) * R * 0.018); }
    b.push(cx, cy, R * 0.74);
    blobs(ctx, b, fill, lw);
  }
  // pointed leaf: base at (x,y), grows toward rot (0 = up, + = clockwise)
  function leaf(ctx, x, y, len, wid, rot, fill, lw, vein) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-wid, -len * 0.55, 0, -len); ctx.quadraticCurveTo(wid, -len * 0.55, 0, 0); ctx.closePath();
    fs(ctx, fill, lw);
    if (vein) { ctx.beginPath(); ctx.moveTo(0, -len * 0.14); ctx.lineTo(0, -len * 0.78); ctx.lineWidth = 1.3; ctx.strokeStyle = vein; ctx.stroke(); }
    ctx.restore();
  }
  // rounder petal (lotus)
  function petal(ctx, x, y, len, wid, rot, fill, lw, tip) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-wid, -len * 0.25, -wid * 0.95, -len * 0.78, 0, -len); ctx.bezierCurveTo(wid * 0.95, -len * 0.78, wid, -len * 0.25, 0, 0); ctx.closePath();
    fs(ctx, fill, lw);
    if (tip) { ctx.beginPath(); ctx.moveTo(0, -len * 0.3); ctx.quadraticCurveTo(-wid * 0.22, -len * 0.6, 0, -len * 0.86); ctx.lineWidth = 2; ctx.strokeStyle = tip; ctx.stroke(); }
    ctx.restore();
  }
  function crystal(ctx, x, y, len, wid, rot, col, lw) {
    const h = wid / 2, P = [-h, 0, -h, -len * 0.68, 0, -len, h, -len * 0.68, h, 0];
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    poly(ctx, P); fs(ctx, col, lw || 2.3);
    poly(ctx, [-h, 0, -h, -len * 0.68, 0, -len, 0, 0]); ctx.fillStyle = shade(col, 0.4); ctx.fill();
    poly(ctx, P); ctx.lineWidth = lw || 2.3; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(0, -1); ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
    ctx.restore();
  }
  function hurtEyes(ctx, x1, x2, y, r, col, lw) {
    ctx.lineWidth = lw || 2.2; ctx.strokeStyle = col || OUT;
    ctx.beginPath(); ctx.moveTo(x1 - r, y - r); ctx.lineTo(x1 + r, y); ctx.lineTo(x1 - r, y + r); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2 + r, y - r); ctx.lineTo(x2 - r, y); ctx.lineTo(x2 + r, y + r); ctx.stroke();
  }
  // pair of eyes (far/right one slightly smaller). mode: open | closed | hurt | angry
  function eyes2(ctx, x1, x2, y, rx, ry, mode, col) {
    if (mode === 'hurt') { hurtEyes(ctx, x1, x2, y, rx * 0.95); return; }
    if (mode === 'closed') { A.eye(ctx, x1, y, rx, ry, 1, col); A.eye(ctx, x2, y, rx * 0.88, ry, 1, col); return; }
    A.eye(ctx, x1, y, rx, ry, 0, col); A.eye(ctx, x2, y, rx * 0.88, ry * 0.96, 0, col);
    if (mode === 'angry') {
      ctx.lineWidth = Math.max(1.9, rx * 0.72); ctx.strokeStyle = OUT; ctx.beginPath();
      ctx.moveTo(x1 - rx * 1.5, y - ry * 1.5); ctx.lineTo(x1 + rx * 1.3, y - ry * 0.72);
      ctx.moveTo(x2 + rx * 1.4, y - ry * 1.5); ctx.lineTo(x2 - rx * 1.2, y - ry * 0.72); ctx.stroke();
    }
  }
  // half-lidded sleepy eye
  function sleepyEye(ctx, x, y, rx, ry, col) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, PI); ctx.closePath(); ctx.fillStyle = col || OUT; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - rx - 1, y); ctx.lineTo(x + rx + 1, y); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    ell(ctx, x - rx * 0.3, y + ry * 0.36, rx * 0.3, ry * 0.26); ctx.fillStyle = '#fff'; ctx.fill();
  }
  function cheeks(ctx, x1, x2, y, r, a) {
    ctx.fillStyle = 'rgba(255,118,118,' + (a || 0.45) + ')';
    ell(ctx, x1, y, r, r * 0.6); ctx.fill(); ell(ctx, x2, y, r * 0.8, r * 0.55); ctx.fill();
  }
  function flower(ctx, x, y, r, col, sway) {
    seg(ctx, [x, y, x + sway, y - 7]); stroke2(ctx, '#5fa83c', 1.6, 4.6);
    const hx = x + sway, hy = y - 8.5;
    ctx.lineWidth = 3.4; ctx.strokeStyle = OUT;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - PI / 2; ell(ctx, hx + cos(a) * r, hy + sin(a) * r, r * 0.78); ctx.stroke(); }
    ctx.fillStyle = col;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - PI / 2; ell(ctx, hx + cos(a) * r, hy + sin(a) * r, r * 0.78); ctx.fill(); }
    ell(ctx, hx, hy, r * 0.66); ctx.fillStyle = '#ffd84a'; ctx.fill();
  }
  function angerMark(ctx, x, y, r) {
    ctx.lineWidth = 2.8; ctx.strokeStyle = '#e2392f';
    for (let i = 0; i < 4; i++) { const a = (i * PI) / 2 + PI / 4; ctx.beginPath(); ctx.arc(x + cos(a) * r * 1.35, y + sin(a) * r * 1.35, r * 0.85, a + PI * 0.68, a + PI * 1.32); ctx.stroke(); }
  }
  function spiral(ctx, x, y, r, t) {
    ctx.beginPath();
    for (let i = 0; i <= 22; i++) { const a = i * 0.55 + t, rr2 = (i / 22) * r; ctx[i ? 'lineTo' : 'moveTo'](x + cos(a) * rr2, y + sin(a) * rr2); }
    ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
  }
  const bez = (a, b, c, d, u) => { const v = 1 - u; return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d; };
  const bezD = (a, b, c, d, u) => { const v = 1 - u; return 3 * v * v * (b - a) + 6 * v * u * (c - b) + 3 * u * u * (d - c); };

  // ============================================================ 1. dummy · 허수아비 (46×78)
  M.dummy = function (ctx, s) {
    const t = tt(s), p = sat(s.p || 0), hit = s.state === 'hit';
    let rot = sin(t * 1.5) * 0.02, sx = 1;
    if (hit) { const k = 1 - p, c = cos(E.outCubic(p) * TAU); rot = sin(p * 20) * 0.26 * k; sx = (c < 0 ? -1 : 1) * Math.max(0.22, abs(c)); }
    begin(ctx);
    ell(ctx, 0, -2.6, 14, 3.6); fs(ctx, '#8a6040', 2.2);
    ctx.translate(0, -3); ctx.rotate(rot); ctx.scale(sx, 1);
    rr(ctx, -3.3, -42, 6.6, 41, 2); fs(ctx, '#a06a3c', 2.2);
    rr(ctx, -23, -47.5, 46, 5.6, 2.6); fs(ctx, '#a06a3c', 2.2);
    for (let i = -1; i <= 1; i += 2) { poly(ctx, [i * 21, -49.5, i * 29.5, -53, i * 27.5, -47, i * 30.5, -42.5, i * 21, -40]); fs(ctx, '#f0d488', 2); }
    // straw body
    ctx.beginPath(); ctx.moveTo(-10.5, -54); ctx.quadraticCurveTo(-15.5, -40, -12.5, -25);
    ctx.lineTo(-8.5, -20.5); ctx.lineTo(-5, -26); ctx.lineTo(-1, -20); ctx.lineTo(3, -26); ctx.lineTo(7, -20.5); ctx.lineTo(12.5, -25);
    ctx.quadraticCurveTo(15.5, -40, 10.5, -54); ctx.closePath(); fs(ctx, '#e8c873');
    ell(ctx, 0.5, -39.5, 7.4); fs(ctx, '#f6f1e2', 1.8); ell(ctx, 0.5, -39.5, 4.5); fs(ctx, '#e2573f', 1.5); ell(ctx, 0.5, -39.5, 1.6); ctx.fillStyle = '#f6f1e2'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-13, -29.5); ctx.quadraticCurveTo(0, -27, 13, -29.5); ctx.lineWidth = 2.2; ctx.strokeStyle = '#8a6040'; ctx.stroke();
    // scarf
    const fl = sin(t * 5) * 1.5 + (hit ? sin(p * 30) * 4 * (1 - p) : 0);
    ctx.beginPath(); ctx.moveTo(-7, -55.5); ctx.quadraticCurveTo(-15, -50, -17.5 + fl * 0.4, -39 + fl * 0.3); ctx.lineTo(-11.5 + fl * 0.4, -37.5); ctx.quadraticCurveTo(-9.5, -47, -3, -51.5); ctx.closePath(); fs(ctx, shade('#f6a43c', -0.14), 2.1);
    rr(ctx, -11.5, -58.5, 23, 7.6, 3.8); fs(ctx, '#f6a43c', 2.2);
    // head
    poly(ctx, [-12, -74, -18, -71.5, -13.5, -78]); fs(ctx, '#f0d488', 1.8); poly(ctx, [12, -74, 18, -72, 13.5, -78]); fs(ctx, '#f0d488', 1.8);
    ell(ctx, 0, -67, 13, 11.5); fs(ctx, '#f3ddaa');
    seg(ctx, [-5.5, -61.6, -3, -60, -0.5, -62, 2, -60, 4.5, -62, 7, -60.6]); ctx.lineWidth = 1.7; ctx.strokeStyle = OUT; ctx.stroke();
    if (hit) {
      ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.beginPath();
      ctx.moveTo(-7, -70.5); ctx.lineTo(-2, -65.5); ctx.moveTo(-2, -70.5); ctx.lineTo(-7, -65.5); ctx.moveTo(3, -70.5); ctx.lineTo(7.5, -66); ctx.moveTo(7.5, -70.5); ctx.lineTo(3, -66); ctx.stroke();
    } else {
      ell(ctx, -4.5, -68, 3.5); fs(ctx, '#4a3a52', 1.6); ell(ctx, 5.2, -68.4, 2.8); fs(ctx, '#7a4a2a', 1.6);
      ctx.fillStyle = '#f6f1e2'; ell(ctx, -5.4, -68.6, 0.8); ctx.fill(); ell(ctx, -3.6, -67.4, 0.8); ctx.fill(); ell(ctx, 4.6, -68.9, 0.65); ctx.fill(); ell(ctx, 5.9, -67.9, 0.65); ctx.fill();
    }
    cheeks(ctx, -8, 9, -63.5, 2.4, 0.4);
    // pot-lid hat
    ell(ctx, 0, -77.5, 16.5, 4.4); fs(ctx, '#b9c0cc', 2.2);
    ctx.beginPath(); ctx.ellipse(0, -78.2, 11, 2.1, 0, PI * 1.1, PI * 1.9); ctx.lineWidth = 1.4; ctx.strokeStyle = '#f2f5fa'; ctx.stroke();
    rr(ctx, -2.6, -84.6, 5.2, 5.6, 2); fs(ctx, '#6a4630', 1.8);
    ctx.restore();
  };

  // ============================================================ 2. puff · 솜뭉치 (44×40)
  M.puff = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0);
    let sx = 1, sy = 1, mode = 'sleepy';
    if (s.air) { const k = Math.min(abs(s.vy || 0) / 1500, 0.16); sy = 1 + k; sx = 1 - k * 0.6; }
    else if (st === 'move') { const a = abs(sin(t * 7)); sy = 1 - 0.09 * a; sx = 1 + 0.07 * a; }
    else if (st === 'idle') { sy = 1 + sin(t * 2.3) * 0.025; sx = 1 - sin(t * 2.3) * 0.02; }
    if (st === 'attack') { const g = p < 0.5 ? 1 + 0.2 * E.outQuad(p / 0.5) : 1.2 - 0.2 * E.outBack(sat((p - 0.5) / 0.3)); sx *= g; sy *= g; mode = 'angry'; }
    else if (st === 'hit') { const k = 1 - p; sx *= 1 + 0.2 * k; sy *= 1 - 0.2 * k; mode = 'hurt'; }
    else if (isBlink(s, 4.2)) mode = 'closed';
    begin(ctx);
    ctx.scale(sx, sy);
    const fy = s.air ? 2 : 0;
    ell(ctx, -8, -2.5 + fy, 5.2, 3); fs(ctx, '#4a3a52', 2); ell(ctx, 8.5, -2.5 + fy, 5.2, 3); fs(ctx, '#4a3a52', 2);
    // sprout
    const sw = sin(t * 2.8) * 1.6 + (s.air ? clamp((s.vy || 0) / 260, -3, 3) : 0);
    ctx.beginPath(); ctx.moveTo(0, -36); ctx.quadraticCurveTo(-1, -42, 1 + sw, -46.5); stroke2(ctx, '#5fa83c', 2, 5.6);
    leaf(ctx, 1 + sw, -46, 10.5, 4.8, 1.0 + sw * 0.07, '#8ad05a', 2, '#5fa83c');
    fluff(ctx, 0, -20.5, 19.6, t, '#fbfbf3', 9);
    ell(ctx, -1.5, -9.4, 13, 5.2); ctx.fillStyle = 'rgba(150,150,205,0.2)'; ctx.fill();
    if (mode === 'sleepy') { sleepyEye(ctx, 5.4, -21.8, 3, 3.7); sleepyEye(ctx, 14.4, -21.8, 2.6, 3.5); }
    else eyes2(ctx, 5.4, 14.4, -21, 2.8, 3.8, mode);
    cheeks(ctx, 1.3, 17.6, -15.3, 3.1);
    if (mode === 'hurt' || mode === 'angry') { ell(ctx, 10, -15.2, 1.9, 2.2); fs(ctx, '#b8433f', 1.5); }
    else { ctx.beginPath(); ctx.arc(10, -17, 2.1, 0.15 * PI, 0.85 * PI); ctx.lineWidth = 1.7; ctx.strokeStyle = OUT; ctx.stroke(); }
    ctx.restore();
  };

  // ============================================================ 3. leafling · 잎새귀 (46×44)
  M.leafling = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0);
    const C = '#8ad05a', CD = shade(C, -0.2), CL = '#d8f3a8';
    let bob = sin(t * 2.4) * 0.8, eL = -0.62 + sin(t * 1.9) * 0.07, eR = 0.3 + sin(t * 1.9 + 1.2) * 0.07, lean = 0, dx = 0, sx = 1, sy = 1;
    let mode = isBlink(s) ? 'closed' : 'open', lf = 0, lb = 0;
    if (st === 'move') { const ph = t * 11, sn = sin(ph); lf = sn * 3.4; lb = -sn * 3.4; bob = -abs(cos(ph)) * 2.2; eL += sin(ph - 0.6) * 0.3; eR += sin(ph - 1.4) * 0.3; lean = 0.07; }
    else if (st === 'attack') {
      const w = E.outQuad(sat(p / 0.5)), k = E.outCubic(sat((p - 0.5) / 0.12)), r = sat((p - 0.68) / 0.32);
      lean = -0.2 * w + 0.5 * k - 0.3 * r; dx = -4 * w + 13 * k - 9 * r; eL = lerp(eL, -0.12, w) - 0.9 * k * (1 - r); eR = lerp(eR, 0.1, w) - 0.7 * k * (1 - r); mode = 'angry';
    } else if (st === 'hit') { const k = 1 - p; sx = 1 + 0.18 * k; sy = 1 - 0.18 * k; eL = lerp(eL, -1.45, k); eR = lerp(eR, 1.3, k); mode = 'hurt'; lean = -0.12 * k; }
    begin(ctx);
    ctx.translate(dx, 0); ctx.scale(sx, sy);
    ell(ctx, -7 + lb, -2.3 - Math.max(0, lb) * 0.5, 4.8, 2.9); fs(ctx, CD, 2);
    ell(ctx, 7 + lf, -2.3 - Math.max(0, lf) * 0.5, 4.8, 2.9); fs(ctx, CD, 2);
    pivot(ctx, 0, -6, lean); ctx.translate(0, bob);
    leaf(ctx, -15, -11, 11, 4.4, -1.9 + sin(t * 3) * 0.12, CD, 2);
    leaf(ctx, -5.5, -29, 24, 9, eL, CD, A.LW, shade(C, -0.38));
    leaf(ctx, 5, -30.5, 24, 9, eR, C, A.LW, CD);
    ell(ctx, 0, -17, 18, 16.6); fs(ctx, C);
    ell(ctx, 4.5, -11.3, 10, 7.4); ctx.fillStyle = CL; ctx.fill();
    ctx.beginPath(); ctx.arc(-3, -20, 11.5, 1.05 * PI, 1.5 * PI); ctx.lineWidth = 2.2; ctx.strokeStyle = shade(C, 0.3); ctx.stroke();
    eyes2(ctx, 4.6, 13.2, -20.5, 3, 4.3, mode);
    cheeks(ctx, 0.2, 16.2, -14, 3.2);
    if (mode === 'hurt' || mode === 'angry') { ell(ctx, 9, -13.2, 2, 2.3); fs(ctx, '#b8433f', 1.5); }
    else { ctx.beginPath(); ctx.arc(9, -15.4, 2.3, 0.15 * PI, 0.85 * PI); ctx.lineWidth = 1.7; ctx.strokeStyle = OUT; ctx.stroke(); }
    ctx.restore();
  };

  // ============================================================ 4. acorn · 도토리 병정 (42×52)
  M.acorn = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0);
    const NUT = '#cf9550', NUTL = '#e9be7c', ARM = '#b9783c', CAP = '#7a4a2a', CAPL = '#9c6438';
    let bob = sin(t * 2.6) * 0.6, lean = 0, dx = 0, lf = 0, lb = 0, hx = 17.5, hy = -17, sr = 0.32 + sin(t * 2.6) * 0.03, mode = 'open', capDy = 0, rock = 0;
    if (st === 'move') { const ph = t * 12, sn = sin(ph); lf = sn * 3; lb = -sn * 3; bob = -abs(cos(ph)) * 1.8; rock = sn * 0.07; sr = 0.42 + sn * 0.06; }
    else if (st === 'attack') {
      const w = E.outQuad(sat(p / 0.45)), k = E.outCubic(sat((p - 0.5) / 0.1)), r = E.inOutQuad(sat((p - 0.68) / 0.32));
      hx = 17.5 - 13 * w + 21.5 * k - 8.5 * r; hy = -17 - 3 * w + 3 * r;
      sr = lerp(lerp(lerp(0.32, 1.42, w), 1.57, k), 0.32, r);
      lean = -0.16 * w + 0.36 * k - 0.2 * r; dx = -3 * w + 14 * k - 11 * r; lf = 5 * k * (1 - r); lb = -3 * k * (1 - r);
      sr -= lean * sat(k * 2 + w) * (1 - r); hy -= 4 * k * (1 - r);
    } else if (st === 'hit') { const k = 1 - p; lean = -0.25 * k; mode = 'hurt'; capDy = -4 * sin(sat(p * 1.6) * PI); sr = 0.32 - 0.4 * k; }
    begin(ctx);
    ctx.translate(dx, 0);
    ell(ctx, -6 + lb, -2.3, 4.6, 2.8); fs(ctx, '#5b3a2e', 2); ell(ctx, 6.5 + lf, -2.3, 4.6, 2.8); fs(ctx, '#5b3a2e', 2);
    pivot(ctx, 0, -4, lean + rock); ctx.translate(0, bob);
    seg(ctx, [-12, -24, -16.5, -17]); stroke2(ctx, shade(ARM, -0.15), 3.2, 7.4);
    // nut body
    ctx.beginPath(); ctx.moveTo(-15.5, -33); ctx.bezierCurveTo(-18.5, -18, -9, -6.5, 0, -5); ctx.bezierCurveTo(9, -6.5, 18.5, -18, 15.5, -33); ctx.closePath(); fs(ctx, NUT);
    ctx.beginPath(); ctx.moveTo(-8.5, -27); ctx.quadraticCurveTo(-11.5, -19, -6, -11.5); ctx.lineWidth = 2.6; ctx.strokeStyle = NUTL; ctx.stroke();
    // face under the rim
    if (mode === 'hurt') hurtEyes(ctx, 3.2, 11.8, -23.6, 2.7);
    else { eyes2(ctx, 3.2, 11.8, -24.4, 3, 4.2, 'open'); }
    cheeks(ctx, -0.6, 15, -18.4, 2.6, 0.42);
    if (st === 'attack' || mode === 'hurt') { ell(ctx, 7.6, -15.6, 2, 2.3); fs(ctx, '#7a2f2a', 1.4); }
    else { seg(ctx, [5.4, -16, 9.8, -16.4]); ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke(); }
    // cap (helmet)
    ctx.save(); ctx.translate(0, capDy);
    rr(ctx, -2.3, -58.5, 4.8, 7.5, 2); fs(ctx, CAP, 2);
    ctx.beginPath(); ctx.moveTo(-18.5, -32.5); ctx.bezierCurveTo(-20, -47, -10, -53.5, 0, -53.5); ctx.bezierCurveTo(10, -53.5, 20.5, -46, 19.5, -26.5); ctx.quadraticCurveTo(4, -29, -18.5, -32.5); ctx.closePath(); fs(ctx, CAP);
    ctx.lineWidth = 1.5; ctx.strokeStyle = CAPL; ctx.beginPath();
    ctx.moveTo(-13, -37); ctx.quadraticCurveTo(-9, -41, -5, -37); ctx.quadraticCurveTo(-1, -41, 3, -36.5); ctx.quadraticCurveTo(7, -40, 11, -35.5); ctx.quadraticCurveTo(14, -38, 16.5, -34.5);
    ctx.moveTo(-11, -44); ctx.quadraticCurveTo(-7, -48, -3, -44); ctx.quadraticCurveTo(1, -48, 5, -44); ctx.quadraticCurveTo(9, -47.5, 13, -43);
    ctx.stroke();
    ctx.restore();
    // spear
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(sr);
    seg(ctx, [0, 13, 0, -27]); stroke2(ctx, '#f1e2b8', 2.2, 6);
    poly(ctx, [0, -22, -6.5, -19.5, 0, -16.5]); fs(ctx, '#e2573f', 1.5);
    poly(ctx, [-2.7, -26, 0, -35.5, 2.7, -26]); fs(ctx, '#e3eaf2', 1.8);
    ctx.restore();
    seg(ctx, [11, -24, hx, hy]); stroke2(ctx, ARM, 3.2, 7.4);
    ell(ctx, hx, hy, 3.2); fs(ctx, ARM, 1.8);
    ctx.restore();
  };

  // ============================================================ 5. bosspuff · 몽실대왕 (130×120) BOSS
  M.bosspuff = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0), atk = st === 'attack' ? s.atk : '', rage = !!s.rage;
    const base = rage ? mix('#fffaea', '#ff9a8a', 0.42) : '#fffaea';
    let sx = 1, sy = 1, rot = 0, feet = 1, mode = 'angry', mouth = 'frown', cheek = 0, sc = 1, dizzy = false;
    if (st === 'idle') { sy = 1 + sin(t * 2) * 0.02; sx = 1 - sin(t * 2) * 0.015; }
    else if (st === 'move') { const a = abs(sin(t * 6)); sy = 1 - 0.05 * a; sx = 1 + 0.04 * a; rot = sin(t * 6) * 0.035; }
    else if (st === 'hit') { const k = 1 - p; sx = 1 + 0.07 * k; sy = 1 - 0.07 * k; mode = 'hurt'; mouth = 'open'; }
    if (atk === 'hop') {
      if (s.air) { const k = Math.min(abs(s.vy || 0) / 2200, 0.14); sy = 1 + k; sx = 1 - k * 0.55; mouth = 'open'; }
      else if (p < 0.25) { const w = E.outQuad(p / 0.25); sy = 1 - 0.24 * w; sx = 1 + 0.17 * w; mode = 'closed'; }
      else { const k = 1 - sat((p - 0.25) / 0.75); sy = 1 - 0.2 * k * k; sx = 1 + 0.14 * k * k; }
    } else if (atk === 'roll') {
      if (p < 0.3) { const w = E.outQuad(p / 0.3); rot = -0.34 * w; sy = 1 - 0.08 * w; feet = 1 - w; mode = 'closed'; mouth = 'grit'; }
      else if (p < 0.9) { rot = t * 15; feet = 0; mode = 'closed'; mouth = 'grit'; }
      else { const r = (p - 0.9) / 0.1; rot = sin(t * 22) * 0.12 * (1 - r); feet = r; dizzy = true; mouth = 'open'; }
    } else if (atk === 'puff') {
      if (p < 0.5) { const w = E.outQuad(p / 0.5); sc = 1 + 0.25 * w + sin(t * 45) * 0.008 * w; cheek = w; mode = 'closed'; mouth = 'tight'; }
      else if (p < 0.62) { sc = lerp(1.25, 0.9, E.outCubic((p - 0.5) / 0.12)); mouth = 'open'; mode = 'wide'; }
      else { sc = lerp(0.9, 1, E.outBack((p - 0.62) / 0.38)); mouth = 'open'; mode = 'open'; }
    }
    begin(ctx);
    ctx.scale(sx * sc, sy * sc);
    if (feet > 0.05) {
      const fy = s.air ? 3 : 0;
      ell(ctx, -26, -4.6 + fy, 15 * feet, 7 * feet); fs(ctx, '#4a3a52', 3); ell(ctx, 27, -4.6 + fy, 15 * feet, 7 * feet); fs(ctx, '#4a3a52', 3);
    }
    pivot(ctx, 0, -58, rot);
    fluff(ctx, 0, -58, 55, t, base, 12, 3.1);
    ell(ctx, -4, -24, 36, 12.5); ctx.fillStyle = 'rgba(160,140,200,0.2)'; ctx.fill();
    // crown: vine band + leaves + berries
    ctx.beginPath(); ctx.arc(4, -58, 49, -2.2, -0.78); stroke2(ctx, '#7a5236', 4.2, 9.6);
    const LA = [-2.12, -1.8, -1.5, -1.2, -0.9], LL = [19, 24, 27, 24, 19], LC = ['#5fa83c', '#8ad05a', '#6fbf4a', '#8ad05a', '#5fa83c'];
    for (let i = 0; i < 5; i++) leaf(ctx, 4 + cos(LA[i]) * 48, -58 + sin(LA[i]) * 48, LL[i], 8.5, LA[i] + PI / 2 + sin(t * 2.2 + i) * 0.05, LC[i], 2.8, '#4a8f34');
    for (const a of [-1.96, -1.35, -1.04]) { ell(ctx, 4 + cos(a) * 49, -58 + sin(a) * 49, 4.6); fs(ctx, '#e2573f', 2.2); ell(ctx, 3 + cos(a) * 49, -59.4 + sin(a) * 49, 1.3); ctx.fillStyle = '#ffd0c0'; ctx.fill(); }
    // face
    const ex1 = 13, ex2 = 39, ey = -62;
    if (cheek > 0.05) { ell(ctx, -3, -47, 9 + 6 * cheek, 8 + 5 * cheek); ctx.fillStyle = 'rgba(255,110,110,0.5)'; ctx.fill(); ell(ctx, 46, -48, 6.5 + 4.5 * cheek, 7 + 4 * cheek); ctx.fill(); }
    else cheeks(ctx, -1, 47.5, -47, 8.5, rage ? 0.6 : 0.42);
    if (dizzy) { spiral(ctx, ex1, ey, 8, t * 9); spiral(ctx, ex2, ey, 7, t * 9 + 2); }
    else if (mode === 'hurt') hurtEyes(ctx, ex1, ex2, ey, 6.5, OUT, 3.4);
    else if (mode === 'closed') {
      ctx.lineWidth = 3.4; ctx.strokeStyle = OUT;
      ctx.beginPath(); ctx.moveTo(ex1 - 7, ey - 2); ctx.quadraticCurveTo(ex1, ey + 4, ex1 + 7, ey - 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex2 - 6, ey - 1); ctx.quadraticCurveTo(ex2, ey + 4, ex2 + 6, ey - 2); ctx.stroke();
    } else if (mode === 'wide') {
      ell(ctx, ex1, ey, 8, 9.5); fs(ctx, '#fff', 2.6); ell(ctx, ex2, ey, 7, 9); fs(ctx, '#fff', 2.6);
      ell(ctx, ex1 + 1, ey, 2.6); ctx.fillStyle = OUT; ctx.fill(); ell(ctx, ex2 + 1, ey, 2.4); ctx.fill();
    } else {
      A.eye(ctx, ex1, ey, 6, 8.6, 0, rage ? '#7a1420' : OUT); A.eye(ctx, ex2, ey, 5.3, 8.2, 0, rage ? '#7a1420' : OUT);
    }
    if (!dizzy && mode !== 'wide') { // thick grumpy brows
      const b = rage ? 4 : 0;
      ctx.lineWidth = 5.6; ctx.strokeStyle = OUT; ctx.beginPath();
      ctx.moveTo(ex1 - 11, ey - 18 - b * 0.4); ctx.lineTo(ex1 + 8, ey - 10.5 + b);
      ctx.moveTo(ex2 + 10, ey - 17 - b * 0.4); ctx.lineTo(ex2 - 7, ey - 10.5 + b); ctx.stroke();
    }
    if (mouth === 'open') { ell(ctx, 26, -41, 7.5, 8.5); fs(ctx, '#7a2a3a', 2.6); ell(ctx, 26, -37.5, 4.6, 3.6); ctx.fillStyle = '#f08a9a'; ctx.fill(); }
    else if (mouth === 'tight') { ell(ctx, 27, -42, 3.2, 3.6); fs(ctx, '#b8433f', 2.2); }
    else if (mouth === 'grit') { rr(ctx, 16, -46, 21, 8.5, 3); fs(ctx, '#fff', 2.4); ctx.beginPath(); ctx.moveTo(21, -46); ctx.lineTo(21, -37.5); ctx.moveTo(26.5, -46); ctx.lineTo(26.5, -37.5); ctx.moveTo(32, -46); ctx.lineTo(32, -37.5); ctx.lineWidth = 1.7; ctx.strokeStyle = OUT; ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(26, -32.5, 10.5, 1.2 * PI, 1.8 * PI); ctx.lineWidth = 3.2; ctx.strokeStyle = OUT; ctx.stroke(); }
    if (rage) angerMark(ctx, -22, -88, 6.5);
    ctx.restore();
  };
  AN.bosspuff = { muzzle: [26, -41], center: [0, -58] };

  // ============================================================ 6. mossback · 이끼등껍질 (64×46)
  M.mossback = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0);
    const ROCK = '#909886', ROCKD = '#6e7668', MOSS = '#6fae5a', MOSSL = '#93cc6a', SKIN = '#d3d99f', SKIND = '#b2ba7e';
    let hdx = 0, hdy = sin(t * 2.2) * 0.6, rot = 0, bob = 0, mouthO = 0, mode = isBlink(s, 4) ? 'closed' : 'open';
    let lg = [0, 0, 0, 0];
    if (st === 'move') { const ph = t * 5.5; lg = [sin(ph) * 3.6, sin(ph + PI) * 3.6, sin(ph + PI) * 3.6, sin(ph) * 3.6]; hdx = 1 + sin(ph * 2) * 0.9; bob = -abs(sin(ph)) * 1.1; }
    else if (st === 'attack') { const w = E.outQuad(sat(p / 0.45)), k = E.outCubic(sat((p - 0.5) / 0.1)), r = sat((p - 0.66) / 0.34); hdx = -9 * w + 19 * k - 10 * r; mouthO = k * (1 - r); mode = 'angry'; }
    else if (st === 'hit') { const k = 1 - p; hdx = -13 * sat(k * 1.6); mode = 'hurt'; rot = sin(p * 16) * 0.07 * k; }
    const shell = () => { ctx.beginPath(); ctx.moveTo(-29, -11); ctx.bezierCurveTo(-31, -34, -18, -47, -3, -47); ctx.bezierCurveTo(12, -47, 24, -34, 23, -11); ctx.closePath(); };
    begin(ctx);
    pivot(ctx, 0, 0, rot);
    rr(ctx, -18 + lg[2], -11, 9, 11, 3.5); fs(ctx, SKIND, 2.2); rr(ctx, 9 + lg[3], -11, 9, 11, 3.5); fs(ctx, SKIND, 2.2);
    ctx.translate(0, bob);
    poly(ctx, [-26, -15.5, -35, -11, -26, -8]); fs(ctx, SKIN, 2.2);
    // neck + head
    ctx.save(); ctx.translate(hdx, hdy);
    rr(ctx, 10, -24, 16, 10.5, 4); fs(ctx, SKIN, 2.2);
    ell(ctx, 26, -20.5, 9.6, 8.6); fs(ctx, SKIN);
    eyes2(ctx, 25.5, 31.6, -23, 2.2, 3.1, mode);
    cheeks(ctx, 23, 32.5, -17.5, 2.2, 0.4);
    if (mouthO > 0.1) { ell(ctx, 31, -16.5, 3.4, 1 + 2.8 * mouthO); fs(ctx, '#7a2a3a', 1.6); }
    else { ctx.beginPath(); ctx.moveTo(26, -15.8); ctx.quadraticCurveTo(30, -14.4, 34, -16.6); ctx.lineWidth = 1.7; ctx.strokeStyle = OUT; ctx.stroke(); }
    ctx.restore();
    // shell
    shell(); fs(ctx, ROCK);
    ctx.save(); shell(); ctx.clip();
    ctx.beginPath(); ctx.moveTo(-34, -50); ctx.lineTo(-34, -27);
    ctx.quadraticCurveTo(-27, -21, -21, -27); ctx.quadraticCurveTo(-15, -34, -9, -28); ctx.quadraticCurveTo(-3, -21, 3, -28); ctx.quadraticCurveTo(9, -35, 14, -29); ctx.quadraticCurveTo(19, -23, 27, -30);
    ctx.lineTo(27, -50); ctx.closePath(); ctx.fillStyle = MOSS; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-20, -36); ctx.quadraticCurveTo(-10, -44, 2, -42); ctx.lineWidth = 3; ctx.strokeStyle = MOSSL; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-18, -21); ctx.quadraticCurveTo(-12, -17, -9, -12); ctx.moveTo(8, -21); ctx.quadraticCurveTo(12, -17, 13, -12); ctx.moveTo(-2, -22); ctx.lineTo(-2, -15); ctx.lineWidth = 1.8; ctx.strokeStyle = ROCKD; ctx.stroke();
    ctx.restore();
    shell(); ctx.lineWidth = A.LW; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, -30.5, -15.5, 55, 7.6, 3.7); fs(ctx, ROCKD);
    // near legs
    rr(ctx, -23 + lg[0], -10, 10.5, 10.5, 4); fs(ctx, SKIN, 2.2); rr(ctx, 7 + lg[1], -10, 10.5, 10.5, 4); fs(ctx, SKIN, 2.2);
    // flora on the shell
    const sw = sin(t * 2.4) * 1.2;
    leaf(ctx, -19, -38, 10, 3.2, -0.75 + sw * 0.04, MOSSL, 1.8); leaf(ctx, -19, -38, 11, 3.2, -0.2 + sw * 0.04, MOSSL, 1.8); leaf(ctx, -19, -38, 9, 3, 0.4 + sw * 0.04, MOSSL, 1.8);
    flower(ctx, -6, -45.5, 2.5, '#ffb3c8', sw); flower(ctx, 8, -43.5, 2.1, '#fff4e0', -sw * 0.8);
    ctx.restore();
  };

  // ============================================================ 7. hootling · 수풀부엉 (48×46) flyer
  M.hootling = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0);
    const B = '#b98a5a', BD = shade(B, -0.22), BEL = '#f3dfb4', LF = '#6fae5a', LFD = '#4f8f48';
    let f = sin(t * 13), rot = sin(t * 2.1) * 0.04, bob = sin(t * 13 + 1.2) * 1.5, mode = isBlink(s, 3.1) ? 'closed' : 'open', swoop = 0;
    if (st === 'idle') f = sin(t * 10);
    else if (st === 'attack') {
      if (p < 0.5) { const w = E.outQuad(p / 0.5); rot = -0.38 * w; f = lerp(f, 1, w); bob = -3 * w; }
      else { const k = E.outCubic(sat((p - 0.5) / 0.12)), r = sat((p - 0.78) / 0.22); rot = lerp(-0.38, 0.62, k) * (1 - r); swoop = k * (1 - r); f = lerp(1, 1.3, swoop); bob = -3 * (1 - k); }
      mode = 'angry';
    } else if (st === 'hit') { const k = 1 - p; rot = sin(p * 12) * 0.35 * k; f = -1; mode = 'hurt'; }
    begin(ctx);
    ctx.translate(0, bob); pivot(ctx, 0, -23, rot);
    for (const sd of [-1, 1]) {
      ctx.save(); ctx.translate(sd * 12, -27); ctx.scale(sd, 1); ctx.rotate(-(0.12 + f * 0.62));
      leaf(ctx, 0, 2.5, 15, 5.6, PI / 2 + 0.6, LFD, 2.2);
      leaf(ctx, 0, 0.5, 19.5, 6.2, PI / 2 + 0.14, sd < 0 ? LFD : LF, 2.2, sd < 0 ? null : LFD);
      leaf(ctx, 0, -1.5, 16.5, 5.6, PI / 2 - 0.34, sd < 0 ? LFD : LF, 2.2);
      ctx.restore();
    }
    // talons
    for (const sd of [-1, 1]) { const x = sd * 6 + swoop * (sd > 0 ? 12 : 8), y = -2.8 - swoop * (sd > 0 ? 3 : 1); ell(ctx, x, y, 4.2 + swoop * 1.5, 2.7); fs(ctx, '#f0a030', 2); }
    leaf(ctx, -10, -36.5, 12, 4.6, -0.55 + sin(t * 3) * 0.05, LF, 2); leaf(ctx, 10.5, -37.5, 12, 4.6, 0.5 - sin(t * 3) * 0.05, LF, 2);
    ell(ctx, 0, -22.5, 18.5, 20); fs(ctx, B);
    ell(ctx, 2, -14.8, 11.5, 11); ctx.fillStyle = BEL; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#cfa670';
    for (const c of [[-2.5, -13], [6.5, -13], [2, -8.5]]) { ctx.beginPath(); ctx.moveTo(c[0] - 2.6, c[1] - 1.4); ctx.lineTo(c[0], c[1] + 1.2); ctx.lineTo(c[0] + 2.6, c[1] - 1.4); ctx.stroke(); }
    ctx.fillStyle = '#e9cb98'; ell(ctx, -4.5, -29.5, 9.4); ctx.fill(); ell(ctx, 9.5, -29.5, 8.6); ctx.fill();
    const e1 = -4, e2 = 9.6, ey = -29.8;
    if (mode === 'hurt') hurtEyes(ctx, e1, e2, ey, 3.6, OUT, 2.4);
    else if (mode === 'closed') { A.eye(ctx, e1, ey, 5, 5, 1); A.eye(ctx, e2, ey, 4.5, 5, 1); }
    else {
      ell(ctx, e1, ey, 6.7); fs(ctx, '#fffdf2', 2); ell(ctx, e2, ey, 6); fs(ctx, '#fffdf2', 2);
      ell(ctx, e1 + 1.4, ey + 0.2, 3.5); ctx.fillStyle = OUT; ctx.fill(); ell(ctx, e2 + 1.3, ey + 0.2, 3.2); ctx.fill();
      ctx.fillStyle = '#fff'; ell(ctx, e1 + 0.2, ey - 1.2, 1.3); ctx.fill(); ell(ctx, e2 + 0.2, ey - 1.2, 1.2); ctx.fill();
      if (mode === 'angry') { ctx.lineWidth = 3.4; ctx.strokeStyle = BD; ctx.beginPath(); ctx.moveTo(e1 - 7.5, ey - 8.6); ctx.lineTo(e1 + 5.5, ey - 4.4); ctx.moveTo(e2 + 7, ey - 8.6); ctx.lineTo(e2 - 4.5, ey - 4.6); ctx.stroke(); }
    }
    poly(ctx, [0.6, -25.4, 5.4, -25.4, 3.1, -20]); fs(ctx, '#f0a030', 1.8);
    ctx.restore();
  };

  // ============================================================ 8. bramble · 가시덩굴 (46×64) stationary shooter
  M.bramble = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0);
    const GR = '#4f9a4a', GRD = '#3a7a3c', GRL = '#74bf5c', PK = '#e0568a', PKD = '#b83a6c', PKL = '#f7a0c0';
    const sw = sin(t * 1.8) * 2.2;
    let hx = 7 + sw, hy = -46 + sin(t * 3.6) * 0.8, ha = sin(t * 1.8 + 0.6) * 0.08, open = 0.1, sc = 1, mode = 'angry';
    const u = t % 2.7;
    if (st !== 'attack' && st !== 'hit' && u < 0.32) open = 0.1 + sin((u / 0.32) * PI) * 0.55;
    if (st === 'attack') {
      const w = E.outQuad(sat(p / 0.45)), k = E.outCubic(sat((p - 0.5) / 0.09)), r = E.inOutQuad(sat((p - 0.66) / 0.34));
      hx = lerp(lerp(lerp(7, -9, w), 15, k), 7, r); hy = lerp(lerp(lerp(-46, -40, w), -45, k), -46, r);
      ha = lerp(-0.4 * w, 0.08, k) * (1 - r); sc = 1 + 0.32 * w * (1 - k); open = lerp(0.02, 1, k) * (1 - r) + 0.1 * r;
    } else if (st === 'hit') { const k = 1 - p; hx = lerp(hx, -12, k); hy = lerp(hy, -38, k); ha = -0.55 * k; mode = 'hurt'; open = 0.5 * k; }
    begin(ctx);
    // base
    leaf(ctx, -3, -3, 18, 5.6, -1.36, GRD, 2.2, GR); leaf(ctx, 3, -3, 18, 5.6, 1.36, GRD, 2.2, GR);
    ell(ctx, 0, -3, 9.5, 4); fs(ctx, '#6a4a36', 2.2);
    // stem bezier
    const x0 = 0, y0 = -5, x1 = -13, y1 = -20, x2 = hx - 15, y2 = hy + 17, x3 = hx - 8, y3 = hy + 1.5;
    const at = (q, sd, len) => { // point on the stem + normal offset
      const px = bez(x0, x1, x2, x3, q), py = bez(y0, y1, y2, y3, q), tx = bezD(x0, x1, x2, x3, q), ty = bezD(y0, y1, y2, y3, q), m = Math.hypot(tx, ty) || 1;
      return [px, py, (-ty / m) * sd, (tx / m) * sd, tx / m, ty / m, len];
    };
    for (const [q, sd] of [[0.2, 1], [0.46, -1], [0.72, 1], [0.9, -1]]) {
      const a = at(q, sd);
      poly(ctx, [a[0] - a[4] * 2.8, a[1] - a[5] * 2.8, a[0] + a[2] * 8, a[1] + a[3] * 8, a[0] + a[4] * 2.8, a[1] + a[5] * 2.8]); fs(ctx, '#efe6c8', 1.8);
    }
    for (const [q, sd] of [[0.33, -1], [0.6, 1]]) { const a = at(q, sd); leaf(ctx, a[0], a[1], 13, 4.6, Math.atan2(a[3], a[2]) + PI / 2, GRL, 2, GRD); }
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3); stroke2(ctx, GR, 5, 9.8);
    // bud head
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(ha); ctx.scale(sc, sc);
    leaf(ctx, -8, 0, 11.5, 4.2, -PI / 2 - 0.62, GRD, 2); leaf(ctx, -8, 0, 11.5, 4.2, -PI / 2 + 0.62, GRD, 2);
    if (open > 0.14) { ell(ctx, 3, 0.5, 9.5, 2 + 7 * open); ctx.fillStyle = '#5e1632'; ctx.fill(); }
    ctx.save(); ctx.translate(-9, 1); ctx.rotate(open * 0.45); ctx.translate(9, -1);
    ctx.beginPath(); ctx.moveTo(-11, 0.5); ctx.bezierCurveTo(-11, 11.5, 8, 11, 15, 1.5);
    ctx.lineTo(11.5, -1); ctx.lineTo(8.5, 1.6); ctx.lineTo(5.5, -1); ctx.lineTo(2.5, 1.6); ctx.lineTo(-0.5, -1); ctx.lineTo(-3.5, 1.6); ctx.lineTo(-7, 0.3);
    ctx.closePath(); fs(ctx, PKD, 2.3);
    ctx.restore();
    ctx.save(); ctx.translate(-9, -1); ctx.rotate(-open * 0.6); ctx.translate(9, 1);
    ctx.beginPath(); ctx.moveTo(-11, -0.5); ctx.bezierCurveTo(-11, -14, 8, -13.5, 16, -1.5);
    ctx.lineTo(12.5, 1.2); ctx.lineTo(9.5, -1.4); ctx.lineTo(6.5, 1.2); ctx.lineTo(3.5, -1.4); ctx.lineTo(0.5, 1.2); ctx.lineTo(-2.5, -1.4); ctx.lineTo(-6.5, 0.3);
    ctx.closePath(); fs(ctx, PK, 2.3);
    ctx.beginPath(); ctx.moveTo(-6, -8.5); ctx.quadraticCurveTo(1, -11.6, 9, -7.6); ctx.lineWidth = 2; ctx.strokeStyle = PKL; ctx.stroke();
    if (mode === 'hurt') hurtEyes(ctx, 0.5, 7.4, -5, 1.9, OUT, 1.8);
    else {
      ell(ctx, 0.6, -5, 2, 2.6); ctx.fillStyle = OUT; ctx.fill(); ell(ctx, 7.2, -4.4, 1.7, 2.4); ctx.fill();
      ctx.fillStyle = '#fff'; ell(ctx, 0.1, -5.9, 0.75); ctx.fill(); ell(ctx, 6.8, -5.2, 0.65); ctx.fill();
      ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.beginPath(); ctx.moveTo(-2.4, -8.8); ctx.lineTo(3, -7.2); ctx.moveTo(10, -8); ctx.lineTo(5.4, -6.8); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
    ctx.restore();
  };
  AN.bramble = { muzzle: [30, -45] };

  // ============================================================ 9. stag · 뿔갑대장 톨록 (170×120) BOSS
  M.stag = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0), atk = st === 'attack' ? s.atk : '', rage = !!s.rage;
    const SH = '#4a4494', SHD = '#35307a', SHL = '#625dbe', LEG = '#383368', BEL = '#3a3566', HORN = '#5d58a6';
    const GOLD = rage ? '#ff8a4a' : '#f0c35a';
    let dx = 0, bob = sin(t * 2.2) * 1.1, rot = 0, hp = sin(t * 1.3) * 0.03, mo = (sin(t * 2.4) * 0.5 + 0.5) * 0.12, amp = 0.12, lsp = 3, brace = 0, paw = 0, sq = 0, wince = false;
    if (st === 'move') { amp = 1; lsp = 13; bob = sin(t * 26) * 0.9; }
    else if (st === 'hit') { const k = 1 - p; dx = -5 * k; hp = -0.16 * k; wince = true; }
    if (atk === 'charge') {
      if (p < 0.35) { const w = E.outQuad(p / 0.35); dx = -10 * w; hp = 0.34 * w; rot = -0.035 * w; paw = 1; mo = 0.25 * w; }
      else if (p < 0.85) { amp = 1.35; lsp = 30; hp = 0.14; rot = 0.045; bob = sin(t * 40) * 1.4; mo = 0.3; dx = 4; }
      else { const r = (p - 0.85) / 0.15; brace = 1 - r * 0.6; rot = -0.09 * (1 - r); hp = -0.1 * (1 - r); dx = 4 * (1 - r); }
    } else if (atk === 'toss') {
      if (p < 0.45) { const w = E.outQuad(p / 0.45); hp = 0.58 * w; rot = 0.05 * w; mo = 0.3 * w; }
      else if (p < 0.6) { const k = E.outCubic((p - 0.45) / 0.15); hp = lerp(0.58, -0.95, k); rot = lerp(0.05, -0.15, k); mo = 0.3; }
      else { const r = E.inOutQuad((p - 0.6) / 0.4); hp = lerp(-0.95, 0, r); rot = lerp(-0.15, 0, r); mo = 0.3 * (1 - r); }
    } else if (atk === 'stomp') {
      if (p < 0.5) { const w = E.outQuad(sat(p / 0.38)); rot = -0.52 * w + sin(t * 30) * 0.012 * w; hp = -0.15 * w; mo = 0.3 * w; paw = 0.6; amp = 0.5; lsp = 16; }
      else { const k = E.outCubic(sat((p - 0.5) / 0.08)), r = sat((p - 0.6) / 0.4); rot = lerp(-0.52, 0.03, k) * (1 - r); sq = k * (1 - r); hp = 0.12 * k * (1 - r); }
    }
    const ph = t * lsp;
    const LG = [[40, -40, 59, -54, 66], [8, -37, -3, -56, -13], [-32, -39, -55, -59, -73]];
    const drawLeg = (i, far) => {
      const L = LG[i], q = ph + i * 2.1 + (far ? PI : 0);
      let fx = sin(q) * 12 * amp, lift = Math.max(0, cos(q)) * 8 * amp;
      if (paw && i === 0 && !far) { fx = sin(t * 18) * 9 * paw; lift = Math.max(0, cos(t * 18)) * 7 * paw; }
      if (brace) { fx = 13 * brace; lift = 0; }
      const ox = far ? 8 : 0, oy = far ? -3 : 0, c = far ? shade(LEG, -0.3) : LEG;
      const fxx = L[4] + ox + fx, fyy = oy * 0.6 - lift;
      ctx.beginPath(); ctx.moveTo(L[0] + ox, L[1] + bob + oy); ctx.lineTo(L[2] + ox + fx * 0.45, L[3] + bob * 0.5 + oy - lift * 0.5); ctx.lineTo(fxx, fyy - 1.5);
      ctx.lineTo(fxx + (i === 2 ? -5 : 5), fyy - 0.5);
      stroke2(ctx, c, 5.4, 10.6);
    };
    const mandible = (far) => {
      ctx.save();
      if (far) ctx.translate(-5, -9);
      pivot(ctx, 64, -56, far ? -mo : mo * 0.6);
      ctx.translate(62, -57); ctx.scale(1.16, 1.24); ctx.translate(-62, 57);
      ctx.beginPath(); ctx.moveTo(62, -49); ctx.bezierCurveTo(84, -44, 106, -50, 122, -76);
      ctx.bezierCurveTo(110, -66, 102, -63, 97, -65); ctx.lineTo(99, -81); ctx.lineTo(88, -65);
      ctx.bezierCurveTo(80, -65, 72, -65, 62, -65); ctx.closePath();
      fs(ctx, far ? shade(HORN, -0.28) : HORN, 3);
      if (!far) {
        ctx.beginPath(); ctx.moveTo(70, -60); ctx.quadraticCurveTo(84, -60, 92, -60.5); ctx.lineWidth = 2.4; ctx.strokeStyle = shade(HORN, 0.35); ctx.stroke();
        poly(ctx, [122, -76, 113, -68.5, 110.5, -60]); ctx.fillStyle = GOLD; ctx.fill();
        ctx.beginPath(); ctx.moveTo(62, -49); ctx.bezierCurveTo(84, -44, 106, -50, 122, -76); ctx.bezierCurveTo(110, -66, 102, -63, 97, -65); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
        if (rage) glow(ctx, 119, -73, 17, '#ff8a4a', 0.65);
      }
      ctx.restore();
    };
    begin(ctx);
    ctx.translate(dx - 16, 0);
    pivot(ctx, -74, 0, rot);
    if (sq) ctx.scale(1 + 0.04 * sq, 1 - 0.07 * sq);
    for (let i = 0; i < 3; i++) drawLeg(i, true);
    ctx.save(); ctx.translate(0, bob);
    ctx.save(); pivot(ctx, 54, -64, hp); mandible(true); ctx.restore();
    // abdomen (elytra)
    const abd = () => { ctx.beginPath(); ctx.moveTo(-84, -38); ctx.bezierCurveTo(-88, -86, -52, -115, -22, -113); ctx.bezierCurveTo(4, -111, 22, -90, 24, -58); ctx.lineTo(24, -34); ctx.quadraticCurveTo(-30, -22, -84, -38); ctx.closePath(); };
    abd(); fs(ctx, SH, 3);
    ctx.save(); abd(); ctx.clip();
    ctx.beginPath(); ctx.moveTo(-92, -47); ctx.quadraticCurveTo(-30, -35, 28, -51); ctx.lineTo(28, -10); ctx.lineTo(-92, -10); ctx.closePath(); ctx.fillStyle = BEL; ctx.fill();
    ctx.lineWidth = 1.8; ctx.strokeStyle = shade(BEL, -0.3); ctx.beginPath();
    for (const x of [-62, -40, -18, 4]) { ctx.moveTo(x, -42); ctx.lineTo(x - 3, -26); }
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-64, -88); ctx.quadraticCurveTo(-42, -107, -8, -103); ctx.lineWidth = 5.5; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-73, -66); ctx.quadraticCurveTo(-72, -74, -68, -80); ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(21, -80); ctx.quadraticCurveTo(-28, -104, -81, -62); ctx.lineWidth = 2; ctx.strokeStyle = SHD; ctx.stroke();
    ctx.restore();
    abd(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-83, -46.5); ctx.quadraticCurveTo(-30, -35, 23, -50.5); ctx.lineWidth = 3.4; ctx.strokeStyle = GOLD; ctx.stroke();
    ctx.fillStyle = GOLD; for (const c of [[-58, -52], [-30, -48.5], [-2, -50.5]]) { ell(ctx, c[0], c[1], 2.6); ctx.fill(); }
    // thorax
    ctx.beginPath(); ctx.moveTo(18, -36); ctx.lineTo(18, -86); ctx.bezierCurveTo(22, -104, 52, -102, 58, -82); ctx.lineTo(60, -46); ctx.quadraticCurveTo(40, -32, 18, -36); ctx.closePath(); fs(ctx, SHL, 3);
    ctx.beginPath(); ctx.moveTo(23.5, -91); ctx.quadraticCurveTo(20, -62, 23.5, -40); ctx.lineWidth = 3.6; ctx.strokeStyle = GOLD; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(32, -93); ctx.quadraticCurveTo(42, -97, 51, -89); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
    // head group
    ctx.save(); pivot(ctx, 54, -64, hp);
    ctx.beginPath(); ctx.moveTo(70, -85); ctx.quadraticCurveTo(77, -101, 89, -104 + sin(t * 5) * 2); stroke2(ctx, LEG, 2, 5.6);
    ell(ctx, 89.5, -104.5 + sin(t * 5) * 2, 2.8); fs(ctx, GOLD, 1.8);
    rr(ctx, 50, -88, 30, 46, [9, 15, 12, 8]); fs(ctx, SHD, 3);
    ctx.beginPath(); ctx.moveTo(56, -82); ctx.quadraticCurveTo(64, -85, 72, -81); ctx.lineWidth = 2.6; ctx.strokeStyle = shade(SHD, 0.3); ctx.stroke();
    if (wince) { seg(ctx, [63, -77, 71.5, -72, 63, -67]); ctx.lineWidth = 3; ctx.strokeStyle = GOLD; ctx.stroke(); }
    else {
      if (rage) glow(ctx, 68, -72, 15, '#ff5a3a', 0.7);
      ell(ctx, 68, -72, 5.8, 6.4); fs(ctx, rage ? '#ff5a3a' : '#ffd84a', 2.2);
      ell(ctx, 69.4, -72, 2, 4.1); ctx.fillStyle = OUT; ctx.fill();
      ell(ctx, 66.4, -74.4, 1.4); ctx.fillStyle = '#fff'; ctx.fill();
      seg(ctx, [59.5, -82, 77, -76.5]); ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
    }
    mandible(false);
    ctx.restore();
    ctx.restore();
    for (let i = 0; i < 3; i++) drawLeg(i, false);
    ctx.restore();
  };
  AN.stag = { horn: [114, -80] };

  // ============================================================ 10. toad · 늪방울 두꺼비 (56×44) hopper + spit
  M.toad = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0);
    const C = '#3fa89a', CD = '#2f857a', CL = '#c9eed2', SP = '#2a776d', SAC = '#eaf7dc';
    let sx = 1, sy = 1, rot = 0, th = 6.5 + (sin(t * 2.6) * 0.5 + 0.5) * 2.2, mode = isBlink(s, 3.6) ? 'closed' : 'sleepy', mouthO = 0, ext = 0;
    if (s.air) { rot = clamp((s.vy || 0) / 1500, -0.38, 0.38); ext = 1; sx = 1.06; sy = 0.95; mode = 'open'; th = 5; }
    else if (st === 'move') { const a = abs(sin(t * 6)); sy = 1 - 0.1 * a; sx = 1 + 0.07 * a; }
    if (st === 'attack') {
      if (p < 0.5) { const w = E.outQuad(p / 0.5); th = lerp(6.5, 14.5, w) + sin(t * 40) * 0.3 * w; rot = -0.14 * w; mode = 'open'; }
      else { const k = E.outCubic(sat((p - 0.5) / 0.08)), r = sat((p - 0.7) / 0.3); th = lerp(14.5, 5, k); rot = lerp(-0.14, 0.1, k) * (1 - r); mouthO = 1 - r; mode = 'open'; }
    } else if (st === 'hit') { const k = 1 - p; sx = 1 + 0.16 * k; sy = 1 - 0.16 * k; mode = 'hurt'; }
    begin(ctx);
    ctx.scale(sx, sy); pivot(ctx, 0, -12, rot);
    // hind leg
    if (ext) { seg(ctx, [-14, -13, -27, -7, -37, -2]); stroke2(ctx, CD, 6.4, 11); ctx.save(); ctx.translate(-40, -1); ctx.rotate(0.35); ell(ctx, 0, 0, 7, 3.2); fs(ctx, CD, 2.2); ctx.restore(); }
    else {
      rr(ctx, -28, -6, 20, 5.8, 2.9); fs(ctx, CD, 2.2);
      ctx.save(); ctx.translate(-16, -10); ctx.rotate(-0.35); ell(ctx, 0, 0, 12.5, 8.6); fs(ctx, CD); ctx.restore();
    }
    // body silhouette
    ctx.beginPath(); ctx.moveTo(-26, -8); ctx.bezierCurveTo(-30, -24, -14, -33, 0, -31); ctx.bezierCurveTo(10, -30, 22, -31, 27, -22);
    ctx.bezierCurveTo(30, -15, 24, -6, 14, -4); ctx.bezierCurveTo(4, -2, -18, -1, -26, -8); ctx.closePath(); fs(ctx, C);
    ell(ctx, 4, -8.6, 13, 4.8); ctx.fillStyle = CL; ctx.fill();
    ctx.fillStyle = SP; ell(ctx, -12, -24, 3.2, 2.6); ctx.fill(); ell(ctx, -20, -16.5, 2.4, 2); ctx.fill(); ell(ctx, -3, -26.5, 2.3, 1.8); ctx.fill(); ell(ctx, -8, -16, 1.8, 1.5); ctx.fill();
    // mouth line
    if (!mouthO) { ctx.beginPath(); ctx.moveTo(5, -17.5); ctx.quadraticCurveTo(17, -15, 27.5, -20.5); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }
    // throat sac
    const scx = 19 + th * 0.55, scy = -9 - (th - 6.5) * 0.7;
    ell(ctx, scx, scy, th * 1.05, th); fs(ctx, SAC, 2.2);
    if (th > 8) { ctx.beginPath(); ctx.arc(scx, scy, th * 0.68, 1.15 * PI, 1.55 * PI); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    // eye bumps
    ell(ctx, 6, -32, 7.2, 6.8); fs(ctx, C); ell(ctx, 18.5, -31, 6.2, 6); fs(ctx, C);
    if (mode === 'hurt') hurtEyes(ctx, 6.5, 18.8, -31.6, 2.7);
    else if (mode === 'closed') { A.eye(ctx, 7, -32, 3.2, 3.4, 1); A.eye(ctx, 19.2, -31, 2.8, 3.2, 1); }
    else if (mode === 'sleepy') { sleepyEye(ctx, 7, -32.6, 3.5, 3.6); sleepyEye(ctx, 19.2, -31.6, 3, 3.3); }
    else { A.eye(ctx, 7, -32, 3.3, 3.9); A.eye(ctx, 19.2, -31, 2.9, 3.6); }
    ctx.fillStyle = OUT; ell(ctx, 24, -24.4, 0.9); ctx.fill(); ell(ctx, 26.4, -23.4, 0.9); ctx.fill();
    if (mouthO) { ell(ctx, 25, -18.5, 4.2, 2 + 3.4 * mouthO); fs(ctx, '#7a2a3a', 2); }
    // front leg
    if (ext) { seg(ctx, [13, -9, 24, -4]); stroke2(ctx, C, 5, 9.6); ell(ctx, 26, -3, 4.6, 2.4); fs(ctx, C, 2); }
    else { seg(ctx, [12, -8, 15.5, -3]); stroke2(ctx, C, 5, 9.6); ell(ctx, 17.5, -2.2, 5.2, 2.5); fs(ctx, C, 2); }
    ctx.restore();
  };
  AN.toad = { muzzle: [28, -20] };

  // ============================================================ 11. glowmoth · 반디나방 (44×40) flyer
  M.glowmoth = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0);
    const W1 = '#f1e8ff', W2 = '#d8c6f6', SPOT = '#b48cf0', FUR = '#f7efd8', GL = '#d8ff7a';
    let flap = sin(t * 24) * 0.5 + 0.5, rot = sin(t * 5.3) * 0.1 + sin(t * 8.7) * 0.05, glowR = 21 + sin(t * 4) * 3, glowA = 0.85, mode = isBlink(s, 2.9) ? 'closed' : 'open', sweep = 0, dy = sin(t * 9) * 1.2;
    if (st === 'attack') {
      if (p < 0.5) { const w = E.outQuad(p / 0.5); glowR = lerp(21, 33, w) + sin(t * 40) * 1.5 * w; glowA = 1.1; rot = -0.3 * w; }
      else { const k = E.outCubic(sat((p - 0.5) / 0.12)), r = sat((p - 0.75) / 0.25); rot = lerp(-0.3, 0.45, k) * (1 - r); sweep = k * (1 - r); glowR = 31 - 9 * r; glowA = 1.1; }
      mode = 'angry';
    } else if (st === 'hit') { const k = 1 - p; rot = sin(p * 13) * 0.4 * k; flap = 0.12; mode = 'hurt'; glowA = 0.35; }
    if (sweep) flap = lerp(flap, 0.25, sweep);
    const wings = (far) => {
      ctx.save(); ctx.translate(2, -23);
      ctx.rotate((far ? 0.3 : 0) + (1 - flap) * 0.42 - 0.12 - sweep * 0.4);
      ctx.scale(1, lerp(0.3, 1, flap));
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.bezierCurveTo(-5, -20, -25, -23, -28, -11); ctx.bezierCurveTo(-29, -3, -14, 2, 0, 1); ctx.closePath(); fs(ctx, far ? W2 : W1, 2.3);
      if (!far) {
        ctx.beginPath(); ctx.moveTo(-8, -15); ctx.quadraticCurveTo(-21, -19, -25, -10); ctx.lineWidth = 2; ctx.strokeStyle = W2; ctx.stroke();
        ell(ctx, -17, -9.5, 4.2); ctx.fillStyle = SPOT; ctx.fill(); ell(ctx, -17, -9.5, 1.7); ctx.fillStyle = '#fff'; ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(-1, 1); ctx.bezierCurveTo(-12, 0, -24, 5, -21, 14); ctx.bezierCurveTo(-17, 19, -7, 12, -1, 4); ctx.closePath(); fs(ctx, far ? shade(W2, -0.1) : W2, 2.3);
      if (!far) { ell(ctx, -14.5, 9, 2.4); ctx.fillStyle = SPOT; ctx.fill(); }
      ctx.restore();
    };
    begin(ctx);
    ctx.translate(0, dy); pivot(ctx, 2, -20, rot);
    glow(ctx, -5, -9, glowR, GL, glowA * 0.85);
    wings(true);
    // abdomen (the lantern)
    ctx.save(); ctx.translate(-1, -15.5); ctx.rotate(0.55);
    ell(ctx, 0, 5.5, 6.2, 9.6); fs(ctx, st === 'attack' ? mix(GL, '#ffffff', 0.45) : GL, 2.3);
    ctx.beginPath(); ctx.moveTo(-5.4, 3); ctx.quadraticCurveTo(0, 5, 5.4, 3); ctx.moveTo(-5.6, 8); ctx.quadraticCurveTo(0, 10, 5.6, 8); ctx.lineWidth = 1.5; ctx.strokeStyle = '#a4d44a'; ctx.stroke();
    ell(ctx, -2, 2, 1.8, 3); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    ctx.restore();
    wings(false);
    // antennae
    for (const a of [[9, -31, 11, -40, 18, -42], [13, -31, 18, -38, 24, -37]]) {
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(a[2], a[3], a[4], a[5]); stroke2(ctx, '#c9b48a', 1.5, 4.4);
      ell(ctx, a[4], a[5], 1.9); fs(ctx, '#f7efd8', 1.5);
    }
    blobs(ctx, [3, -22, 6.4, -2.5, -20, 4.6, 5, -17.5, 4.6], FUR, 2.3);
    ell(ctx, 11.5, -26.5, 6.5, 6.2); fs(ctx, FUR, 2.3);
    if (mode === 'hurt') hurtEyes(ctx, 10.2, 15, -27, 1.9, OUT, 1.9);
    else if (mode === 'closed') { A.eye(ctx, 10.2, -27, 2.2, 2.6, 1); A.eye(ctx, 15, -27, 1.9, 2.6, 1); }
    else {
      A.eye(ctx, 10.2, -27, 2.3, 3); A.eye(ctx, 15, -27, 1.9, 2.8);
      if (mode === 'angry') { ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.beginPath(); ctx.moveTo(7, -31.2); ctx.lineTo(12.4, -29.6); ctx.moveTo(17.6, -31); ctx.lineTo(13.6, -29.6); ctx.stroke(); }
    }
    cheeks(ctx, 8.2, 16.4, -23.4, 1.9, 0.5);
    glow(ctx, -5, -9, glowR * 0.5, '#ffffff', glowA * 0.4);
    ctx.restore();
  };

  // ============================================================ 12. mudling · 진흙덩이 (56×58)
  M.mudling = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0);
    const C = '#7a5f4c', CL = '#9a7b61', CD = '#5c4638';
    let sx = 1 + sin(t * 2) * 0.015, sy = 1 - sin(t * 2) * 0.02, lean = 0, aN = 0.38 + sin(t * 2) * 0.05, aF = -0.3 - sin(t * 2) * 0.05, mode = isBlink(s, 4.4) ? 'closed' : 'open', mouth = 0, reach = 1;
    if (st === 'move') { const a = sin(t * 7); sx = 1 + a * 0.045; sy = 1 - a * 0.045; lean = 0.06; aN = 0.38 + a * 0.3; aF = -0.3 - a * 0.3; }
    else if (st === 'attack') {
      if (p < 0.5) { const w = E.outQuad(sat(p / 0.42)); aN = lerp(0.38, 2.95, w); aF = lerp(-0.3, 2.7, w); sy = 1 + 0.12 * w; sx = 1 - 0.06 * w; lean = -0.1 * w; mouth = w; }
      else {
        const k = E.outCubic(sat((p - 0.5) / 0.1)), r = E.inOutQuad(sat((p - 0.68) / 0.32));
        aN = lerp(lerp(2.95, 1.0, k), 0.38, r); aF = lerp(lerp(2.7, 0.85, k), -0.3, r); sy = lerp(lerp(1.12, 0.88, k), 1, r); sx = lerp(lerp(0.94, 1.1, k), 1, r);
        lean = lerp(lerp(-0.1, 0.16, k), 0, r); mouth = 1 - r; reach = 1 + 0.4 * k * (1 - r);
      }
      mode = 'angry';
    } else if (st === 'hit') { const k = 1 - p; sx = 1 + 0.14 * k * cos(p * 18); sy = 1 - 0.1 * k; mode = 'hurt'; }
    const arm = (x, y, a, col, len) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-a);
      A.capsule(ctx, len, 11); fs(ctx, col);
      ell(ctx, 0, len + 3.5, 8.4); fs(ctx, col);
      ctx.fillStyle = col; ctx.fillRect(-4, len - 6, 8, 6);
      ctx.restore();
    };
    begin(ctx);
    ctx.scale(sx, sy); pivot(ctx, 0, -4, lean);
    arm(-20, -30, aF, CD, 12 * reach);
    // reeds
    const sw = sin(t * 2.1) * 2.2 - lean * 20;
    leaf(ctx, -13, -43, 16, 3.4, -0.5 + sw * 0.03, '#74bf5c', 2);
    for (const c of [[-7, -47, -10 + sw, -62], [3, -49, 6 + sw, -66]]) {
      seg(ctx, [c[0], c[1], c[2], c[3] - 7]); stroke2(ctx, '#5fa83c', 1.7, 4.8);
      ctx.save(); ctx.translate(c[2], c[3]); ctx.rotate(Math.atan2(c[2] - c[0], c[1] - c[3])); rr(ctx, -2.9, -6, 5.8, 12, 2.9); fs(ctx, '#6a4630', 2); ctx.restore();
    }
    // body
    ctx.beginPath(); ctx.moveTo(-27, 0); ctx.bezierCurveTo(-31, -14, -25, -30, -20, -40); ctx.bezierCurveTo(-15, -53, 14, -54, 20, -41); ctx.bezierCurveTo(26, -30, 31, -14, 28, 0);
    ctx.quadraticCurveTo(20, 2.4, 13, 0); ctx.quadraticCurveTo(6, -2.6, 0, 0); ctx.quadraticCurveTo(-8, 2.4, -15, 0); ctx.quadraticCurveTo(-21, -2, -27, 0); ctx.closePath(); fs(ctx, C);
    ctx.save(); ctx.translate(-8, -42); ctx.rotate(-0.3); ell(ctx, 0, 0, 9, 4.2); ctx.fillStyle = CL; ctx.fill(); ctx.restore();
    ctx.fillStyle = CD; ell(ctx, -18, -13, 2.6, 4.2); ctx.fill(); ell(ctx, 21, -11, 2.2, 3.6); ctx.fill(); ell(ctx, -9, -6, 2, 3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-23, -22); ctx.quadraticCurveTo(-25, -12, -22, -5); ctx.lineWidth = 2.4; ctx.strokeStyle = CL; ctx.stroke();
    // face
    const e1 = 0.5, e2 = 11.6, ey = -30;
    if (mode === 'hurt') hurtEyes(ctx, e1, e2, ey, 3.4, OUT, 2.4);
    else if (mode === 'closed') { ctx.lineWidth = 2.4; ctx.strokeStyle = '#2e2233'; ctx.beginPath(); ctx.moveTo(e1 - 4, ey); ctx.lineTo(e1 + 4, ey); ctx.moveTo(e2 - 3.4, ey); ctx.lineTo(e2 + 3.4, ey); ctx.stroke(); }
    else {
      ell(ctx, e1, ey, 5.2, 5.7); ctx.fillStyle = '#2e2233'; ctx.fill(); ell(ctx, e2, ey + 0.4, 4.4, 5.1); ctx.fill();
      glow(ctx, e1 + 0.8, ey, 8, '#d8ff7a', 0.55); glow(ctx, e2 + 0.7, ey + 0.4, 7, '#d8ff7a', 0.55);
      ell(ctx, e1 + 0.8, ey, 2.3); ctx.fillStyle = '#eaffa0'; ctx.fill(); ell(ctx, e2 + 0.7, ey + 0.4, 2); ctx.fill();
      if (mode === 'angry') { ctx.lineWidth = 3.4; ctx.strokeStyle = CD; ctx.beginPath(); ctx.moveTo(e1 - 6.5, ey - 7.5); ctx.lineTo(e1 + 4.5, ey - 4); ctx.moveTo(e2 + 6, ey - 7); ctx.lineTo(e2 - 3.8, ey - 3.8); ctx.stroke(); }
    }
    if (mouth > 0.1) { ell(ctx, 6, -17.5, 2 + 5.5 * mouth, 1 + 4.2 * mouth); ctx.fillStyle = '#2e2233'; ctx.fill(); seg(ctx, [3.5, -21, 3.8, -15]); ctx.lineWidth = 1.8; ctx.strokeStyle = C; ctx.stroke(); seg(ctx, [8.5, -21, 8.2, -15.5]); ctx.stroke(); }
    else { seg(ctx, [-1.5, -19.5, 2, -17.5, 5.5, -19.5, 9, -17.5, 13, -19.5]); ctx.lineWidth = 2.2; ctx.strokeStyle = '#2e2233'; ctx.stroke(); }
    arm(23, -28, aN, C, 12 * reach);
    // idle drip from the near fist
    if (st === 'idle') { const q = (t % 1.9) / 1.9; if (q < 0.55) { const fx = 23 + sin(aN) * 16, fy = -28 + cos(aN) * 16, ga = ctx.globalAlpha; ctx.globalAlpha = ga * (1 - q / 0.55); ell(ctx, fx, fy + 8 + q * 20, 2, 2.8); fs(ctx, C, 1.6); ctx.globalAlpha = ga; } }
    ctx.restore();
  };

  // ============================================================ 13. lotus · 연꽃마녀 로타 (120×150) BOSS floater
  M.lotus = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0), atk = st === 'attack' ? s.atk : '', rage = !!s.rage;
    const PK = rage ? '#e8608f' : '#f08fc0', PKD = rage ? '#b83a6c' : '#d86aa8', PKL = rage ? '#ffa0c4' : '#ffc6e4';
    const PAD = '#4a9a7a', PADD = '#357a60', ROBE = '#5a3f8a', ROBED = '#432e6c', HAIR = '#3fa89a', HAIRD = '#2f857a', SKIN = '#fbe8d8';
    const by = sin(t * 2) * 3;
    let close = 0, sink = 0, scl = 1, lean = 0, wob = 0, aa = 1.05 + sin(t * 2) * 0.05, faa = -0.35, wa = 0.5 + sin(t * 1.6) * 0.06, tipG = 13 + sin(t * 5) * 2, flash = 0;
    let mode = isBlink(s, 3.8) ? 'closed' : 'sly', sparkle = 0, hatTilt = 0, mouthO = false;
    if (st === 'move') lean = 0.07;
    else if (st === 'hit') { const k = 1 - p; wob = sin(p * 14) * 0.07 * k; mode = 'hurt'; hatTilt = -0.25 * k; mouthO = true; }
    if (atk === 'bubbles') { const u = E.outQuad(sat(p / 0.2)) * (1 - sat((p - 0.9) / 0.1)); aa = lerp(aa, 1.5, u); wa = lerp(wa, PI / 2 - 0.05, u); tipG = 13 + u * (8 + sin(p * 44) * 6); mode = 'angry'; lean = 0.05 * u; mouthO = u > 0.5; }
    else if (atk === 'rain') { const u = E.outQuad(sat(p / 0.4)) * (1 - sat((p - 0.9) / 0.1)); aa = lerp(aa, 2.3, u); faa = lerp(-0.35, -2.4, u); wa = lerp(wa, 0.25, u); tipG = 13 + u * (14 + sin(t * 12) * 3); sparkle = p > 0.35 ? u : 0; mode = 'closed'; mouthO = u > 0.5; }
    else if (atk === 'blink') {
      const k = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5; close = E.inOutQuad(sat(k / 0.6)); sink = close * 30; scl = 1 - E.inQuad(sat((k - 0.6) / 0.4)); mode = 'closed';
      const tuck = sat(close * 2.2); aa = lerp(aa, 0.2, tuck); wa = lerp(wa, -0.1, tuck); tipG *= 1 - tuck;
    }
    else if (atk === 'summon') { wa = 0.5 + E.inOutQuad(p) * TAU * 2; aa = 1.6; flash = Math.max(0, 1 - abs(p - 0.5) / 0.13); tipG = 13 + flash * 34; mode = 'angry'; mouthO = true; }
    if (scl < 0.03) return;
    const arm = (x, y, a, col) => { ctx.save(); ctx.translate(x, y); ctx.rotate(-a); A.capsule(ctx, 9.5, 7.6); fs(ctx, col, 2.4); ell(ctx, 0, 12, 3.9); fs(ctx, SKIN, 2); ctx.restore(); };
    const witch = () => {
      const hs = sin(t * 2.2) * 2 - lean * 40;
      ctx.beginPath(); ctx.moveTo(-15, -98); ctx.bezierCurveTo(-27, -84, -24 + hs, -66, -28 + hs, -48); ctx.lineTo(-9 + hs * 0.5, -48); ctx.lineTo(9 + hs * 0.5, -48); ctx.lineTo(25 + hs, -50);
      ctx.bezierCurveTo(22 + hs, -68, 24, -84, 15, -98); ctx.closePath(); fs(ctx, HAIRD, 2.6);
      arm(-9, -73, faa, ROBED);
      ctx.beginPath(); ctx.moveTo(-10.5, -77); ctx.lineTo(10.5, -77); ctx.quadraticCurveTo(15, -62, 19, -46); ctx.lineTo(-19, -46); ctx.quadraticCurveTo(-15, -62, -10.5, -77); ctx.closePath(); fs(ctx, ROBE, 2.6);
      seg(ctx, [-6, -77.5, 1.5, -69, 8, -77.5]); ctx.lineWidth = 2.4; ctx.strokeStyle = PKL; ctx.stroke();
      ell(ctx, 1.5, -64.5, 2.6); fs(ctx, '#d8ff7a', 1.6);
      // head
      ctx.save(); ctx.translate(1, -92); ctx.rotate(hatTilt * 0.4);
      ell(ctx, 0, 0, 16.5, 15.5); fs(ctx, SKIN, 2.6);
      cheeks(ctx, 0.5, 13.2, 6.2, 2.8, 0.45);
      const e1 = 4, e2 = 10.8, ey = 0.8;
      if (mode === 'hurt') hurtEyes(ctx, e1, e2, ey, 2.5, OUT, 2);
      else if (mode === 'closed') { A.eye(ctx, e1, ey, 2.8, 3.2, 1); A.eye(ctx, e2, ey, 2.4, 3.2, 1); }
      else {
        if (rage) { glow(ctx, e1, ey, 8, '#ff4a8a', 0.6); glow(ctx, e2, ey, 7, '#ff4a8a', 0.6); }
        for (const [x, rx] of [[e1, 2.9], [e2, 2.5]]) {
          ell(ctx, x, ey, rx, 4); ctx.fillStyle = '#3a1f4a'; ctx.fill();
          ell(ctx, x + 0.3, ey + 1.3, rx * 0.62, 2); ctx.fillStyle = rage ? '#ff4a8a' : '#d0409a'; ctx.fill();
          ctx.fillStyle = SKIN; ctx.fillRect(x - rx - 1, ey - 5.2, rx * 2 + 2, mode === 'angry' ? 3.2 : 4);
          ctx.beginPath();
          if (mode === 'angry') { const sgn = x === e1 ? 1 : -1; ctx.moveTo(x - (rx + 1.4) * sgn, ey - 3.4); ctx.lineTo(x + (rx + 1.2) * sgn, ey - 1.2); }
          else { ctx.moveTo(x - rx - 1.3, ey - 1.1); ctx.lineTo(x + rx + 1.3, ey - 1.6); }
          ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
        }
      }
      if (mouthO) { ell(ctx, 7.6, 9, 2.1, 2.5); fs(ctx, '#b8433f', 1.5); }
      else { ctx.beginPath(); ctx.moveTo(5, 8.2); ctx.quadraticCurveTo(8, 10.6, 11.4, 7.4); ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke(); }
      // bangs
      ctx.beginPath(); ctx.moveTo(-17, 4); ctx.bezierCurveTo(-21, -14, -8, -21, 2, -19.5); ctx.bezierCurveTo(12, -19, 18, -12, 17.2, -3);
      ctx.quadraticCurveTo(13, -9, 6, -8); ctx.quadraticCurveTo(0, -5, -6, -8.5); ctx.quadraticCurveTo(-10, -3, -10.5, 6); ctx.quadraticCurveTo(-15, 8, -17, 4); ctx.closePath(); fs(ctx, HAIR, 2.6);
      // hat: lotus-bud crown + lily-pad brim
      ctx.save(); ctx.translate(0, -12.5); ctx.rotate(-0.07 + hatTilt);
      petal(ctx, -5, -2, 23, 8, -0.3, PKD, 2.4); petal(ctx, 7, -2, 23, 8, 0.36, PKD, 2.4); petal(ctx, 1, -1, 29, 9.5, 0.04 + sin(t * 2) * 0.03, PK, 2.4, PKL);
      ell(ctx, 0, 0, 30, 7.4); fs(ctx, '#5fb06a', 2.6);
      ctx.lineWidth = 1.4; ctx.strokeStyle = '#3f9450'; ctx.beginPath();
      for (const a of [0.25, 0.9, 1.6, 2.3, 2.9, 3.6, 4.6, 5.6]) { ctx.moveTo(cos(a) * 6, sin(a) * 1.6 + 0.4); ctx.lineTo(cos(a) * 25, sin(a) * 5.8 + 0.4); }
      ctx.stroke();
      poly(ctx, [-30.5, -1.2, -16, 0.6, -29, 3.6]); ctx.fillStyle = OUT; ctx.fill();
      ctx.restore();
      ctx.restore();
      // wand (reed + glowing bud) and near arm
      const hx = 9 + sin(aa) * 13, hy = -73 + cos(aa) * 13;
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(wa);
      seg(ctx, [0, 8, 0, -41]); stroke2(ctx, '#a8985a', 2.4, 6.2);
      leaf(ctx, 0, -20, 10, 3, 0.75, '#74bf5c', 1.8);
      petal(ctx, 0, -39, 12.5, 5.2, 0, PKL, 2.2);
      if (tipG > 1) glow(ctx, 0, -46, tipG, '#ffb0e0', 0.8);
      if (flash) glow(ctx, 0, -46, tipG * 1.4, '#ffffff', flash * 0.85);
      if (sparkle) for (let i = 0; i < 3; i++) { const a = t * 4.2 + i * 2.094; A.star(ctx, cos(a) * 14, -46 + sin(a) * 14, 3.6, 1.4, 4, t * 3); ctx.fillStyle = 'rgba(255,247,200,' + sparkle + ')'; ctx.fill(); }
      ctx.restore();
      arm(9, -73, aa, ROBE);
    };
    begin(ctx);
    ctx.translate(0, by);
    pivot(ctx, 0, -30, lean + wob);
    if (scl !== 1) { ctx.translate(0, -30); ctx.scale(scl, scl); ctx.translate(0, 30); }
    if (rage) glow(ctx, 0, -22, 82, '#b06aff', 0.3);
    // roots + drip
    for (const x of [-20, -2, 17]) { const q = sin(t * 2.3 + x) * 2; ctx.beginPath(); ctx.moveTo(x, -8); ctx.quadraticCurveTo(x + q, -4.5, x - q * 0.6, -1); stroke2(ctx, PADD, 1.8, 4.8); }
    { const q = (t % 1.6) / 1.6; if (q < 0.5 && !close) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * (1 - q * 2); ell(ctx, -2, -1 + q * 14 - by, 1.9, 2.7); fs(ctx, '#9fe4ff', 1.5); ctx.globalAlpha = ga; } }
    ell(ctx, 0, -10, 47, 8.6); fs(ctx, PAD, 3);
    ctx.beginPath(); ctx.ellipse(0, -11.5, 38, 4.6, 0, PI * 1.1, PI * 1.9); ctx.lineWidth = 2; ctx.strokeStyle = '#6fbf96'; ctx.stroke();
    // back petals
    for (const r0 of [-1.3, 1.3, -0.68, 0.68, 0]) petal(ctx, r0 * 5, -13, lerp(60, 86, close), 21, r0 * (1 - 0.86 * close) + sin(t * 1.7 + r0) * 0.025, PKD, 3);
    if (close < 0.97) { const ws = 1 - 0.55 * close; ctx.save(); ctx.translate(0, -46 + sink); ctx.scale(ws, ws); ctx.translate(0, 46); witch(); ctx.restore(); }
    // front petals
    for (const r0 of [-1.52, 1.52, -0.98, 0.98, -0.36, 0.36]) {
      const big = abs(r0) > 1.2;
      petal(ctx, r0 * 7, -11, lerp(big ? 52 : 46, 84, close), big ? 17 : 19, r0 * (1 - 0.9 * close) + sin(t * 1.9 + r0 * 2) * 0.02, PK, 3, PKL);
    }
    ctx.restore();
  };
  AN.lotus = { muzzle: [68, -74], wandUp: [30, -126] };

  // ============================================================ 14. crybat · 수정박쥐 (50×38) flyer
  M.crybat = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0);
    const B = '#5d4c8c', BL = '#8a76b8', C1 = '#8f7fe0', C2 = '#7fe0ff', C3 = '#c79bff';
    let fa = sin(t * 15) * 0.62 + 0.1, rot = sin(t * 3) * 0.05, bob = sin(t * 15 + 1.3) * 1.6, mode = isBlink(s, 3.4) ? 'closed' : 'open', mouth = 0, eg = 0.55;
    if (st === 'idle') fa = sin(t * 11) * 0.55 + 0.1;
    else if (st === 'attack') {
      if (p < 0.5) { const w = E.outQuad(p / 0.5); rot = -0.42 * w; fa = lerp(fa, 0.95, w); bob = -3 * w; mouth = w * 0.5; }
      else { const k = E.outCubic(sat((p - 0.5) / 0.12)), r = sat((p - 0.78) / 0.22); rot = lerp(-0.42, 0.8, k) * (1 - r); fa = 1.2; mouth = 1 - r; bob = -3 * (1 - k); }
      eg = 1; mode = 'angry';
    } else if (st === 'hit') { const k = 1 - p; rot = sin(p * 13) * 0.4 * k; fa = -0.55; mode = 'hurt'; }
    const V = [0, 0, 10, -13, 21, -10, 26, 0, 18, 6.5, 10, 4.5, 3, 6.5];
    begin(ctx);
    ctx.translate(0, bob); pivot(ctx, 0, -17, rot);
    for (const sd of [-1, 1]) {
      const cols = sd < 0 ? [shade(C1, -0.16), shade(C2, -0.16), shade(C3, -0.16), shade(C1, -0.16), shade(C2, -0.16)] : [C1, C2, C3, C1, C2];
      ctx.save(); ctx.translate(sd * 7, -19.5); ctx.scale(sd * 0.84, 0.84); ctx.rotate(-fa);
      poly(ctx, V); ctx.lineWidth = 6.2; ctx.strokeStyle = OUT; ctx.stroke();
      for (let i = 1; i < 6; i++) { poly(ctx, [0, 0, V[i * 2], V[i * 2 + 1], V[i * 2 + 2], V[i * 2 + 3]]); ctx.fillStyle = cols[i - 1]; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = cols[i - 1]; ctx.stroke(); }
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath();
      for (let i = 2; i < 6; i++) { ctx.moveTo(1, 0); ctx.lineTo(V[i * 2], V[i * 2 + 1]); }
      ctx.stroke();
      A.star(ctx, 16, -5, 2.6, 0.9, 4, 0); ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * sin(t * 6 + sd)) + ')'; ctx.fill();
      ctx.restore();
    }
    poly(ctx, [-8.5, -24, -11.5, -37, -2.5, -27]); fs(ctx, B, 2.3); poly(ctx, [8, -24.5, 12.5, -37, 2.5, -27]); fs(ctx, B, 2.3);
    poly(ctx, [-8, -27, -10, -33.5, -5.2, -28]); ctx.fillStyle = C3; ctx.fill(); poly(ctx, [8, -27, 10.8, -33.5, 5, -28]); ctx.fill();
    ell(ctx, -3.6, -6.8, 2, 2.4); fs(ctx, BL, 1.6); ell(ctx, 3.8, -6.8, 2, 2.4); fs(ctx, BL, 1.6);
    ell(ctx, 0, -17, 10.8, 10.6); fs(ctx, B);
    ell(ctx, 1.5, -11.6, 5.6, 4); ctx.fillStyle = BL; ctx.fill();
    const e1 = 0.3, e2 = 7, ey = -19.6;
    if (mode === 'hurt') hurtEyes(ctx, e1, e2, ey, 2.4, '#c9f6ff', 2);
    else if (mode === 'closed') { ctx.lineWidth = 1.9; ctx.strokeStyle = '#c9f6ff'; ctx.beginPath(); ctx.moveTo(e1 - 2.6, ey); ctx.lineTo(e1 + 2.6, ey); ctx.moveTo(e2 - 2.2, ey); ctx.lineTo(e2 + 2.2, ey); ctx.stroke(); }
    else {
      glow(ctx, e1, ey, 7.5, C2, eg); glow(ctx, e2, ey, 6.5, C2, eg);
      ell(ctx, e1, ey, 2.8, 3.5); ctx.fillStyle = '#d4f8ff'; ctx.fill(); ell(ctx, e2, ey, 2.4, 3.3); ctx.fill();
      ctx.fillStyle = B; ell(ctx, e1 + 0.6, ey + 0.3, 0.95, 2.2); ctx.fill(); ell(ctx, e2 + 0.6, ey + 0.3, 0.85, 2.1); ctx.fill();
      if (mode === 'angry') { ctx.lineWidth = 2.8; ctx.strokeStyle = B; ctx.beginPath(); ctx.moveTo(e1 - 4.4, ey - 5); ctx.lineTo(e1 + 3, ey - 2.4); ctx.moveTo(e2 + 4, ey - 5); ctx.lineTo(e2 - 2.4, ey - 2.4); ctx.stroke(); }
    }
    if (mouth > 0.05) { ell(ctx, 4.2, -12.4, 3.7, 1.2 + 2.6 * mouth); ctx.fillStyle = '#35102c'; ctx.fill(); }
    const fl = 3 + mouth * 1.6;
    ctx.fillStyle = '#fff'; poly(ctx, [1.3, -13.8, 2.5, -13.8 + fl, 3.7, -13.8]); ctx.fill(); poly(ctx, [5, -13.8, 6.1, -13.8 + fl, 7.2, -13.8]); ctx.fill();
    ctx.restore();
  };

  // ============================================================ 15. orecrab · 광석게 (62×44)
  M.orecrab = function (ctx, s) {
    const t = tt(s), st = s.state, p = sat(s.p || 0);
    const SHL = '#7f8fb0', SHD = '#5f6d8c', SHLT = '#a6b5d2', LEGC = '#6a7896', K1 = '#7fe0ff', K2 = '#c79bff', NUG = '#ffd27a';
    let bob = sin(t * 2.3) * 0.7, rot = 0, amp = 0.15, ph = t * 3, cx = 27, cy = -22, po = 0.22 + (sin(t * 2.1) * 0.5 + 0.5) * 0.22, stalk = 1, mode = isBlink(s, 3.3) ? 'closed' : 'open', sx = 1, sy = 1, ca = -0.2;
    if (st === 'move') { amp = 1; ph = t * 14; bob = sin(t * 14) * 0.9; rot = sin(t * 7) * 0.03; }
    else if (st === 'attack') {
      if (p < 0.5) { const w = E.outQuad(sat(p / 0.42)); cx = lerp(27, 20, w); cy = lerp(-22, -45, w); po = lerp(0.3, 0.85, w); ca = lerp(-0.2, -1.0, w); rot = -0.06 * w; }
      else {
        const k = E.outCubic(sat((p - 0.5) / 0.09)), r = E.inOutQuad(sat((p - 0.68) / 0.32));
        cx = lerp(lerp(20, 44, k), 27, r); cy = lerp(lerp(-45, -19, k), -22, r); po = lerp(lerp(0.85, 0, k), 0.3, r); ca = lerp(lerp(-1.0, 0.1, k), -0.2, r); rot = lerp(-0.06, 0.07, k) * (1 - r);
      }
      mode = 'angry';
    } else if (st === 'hit') { const k = 1 - p; sx = 1 + 0.12 * k; sy = 1 - 0.14 * k; stalk = 1 - 0.6 * k; mode = 'hurt'; }
    const claw = (x, y, ang, open, sc, far) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sc, sc);
      ctx.save(); ctx.rotate(open * 0.75);
      ctx.beginPath(); ctx.moveTo(-4, 1); ctx.quadraticCurveTo(6, 9.5, 16, 3.5); ctx.quadraticCurveTo(7, 1.5, 0, -1); ctx.closePath(); fs(ctx, SHD, 2.3 / sc);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.bezierCurveTo(-10, -12.5, 4, -14.5, 17, -3); ctx.quadraticCurveTo(8, -3.5, 3, 0.5); ctx.quadraticCurveTo(-2, 6.5, -9, 0); ctx.closePath(); fs(ctx, far ? SHD : SHL, 2.3 / sc);
      ctx.beginPath(); ctx.moveTo(-5, -6); ctx.quadraticCurveTo(0, -10.5, 7, -8); ctx.lineWidth = 2; ctx.strokeStyle = far ? SHL : SHLT; ctx.stroke();
      ctx.restore();
    };
    begin(ctx);
    ctx.scale(sx, sy);
    // legs (3 per side, tips on the ground)
    const LEGS = [[15, -12, 27, -17, 31], [10, -9, 19, -14, 22], [3, -8, 10, -12, 12]];
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) {
      const L = LEGS[i], q = ph + i * 1.4 + (sd > 0 ? 0 : PI * 0.6), fx = sin(q) * 3 * amp, lift = Math.max(0, cos(q)) * 3.5 * amp;
      const X = (x) => (sd > 0 ? x : -4 - x);
      ctx.beginPath(); ctx.moveTo(X(L[0]), L[1] + bob); ctx.lineTo(X(L[2]) + fx * 0.5, L[3] + bob - lift * 0.5); ctx.lineTo(X(L[4]) + fx, -lift - 1); stroke2(ctx, LEGC, 3.4, 7.8);
    }
    ctx.translate(0, bob); pivot(ctx, -2, -12, rot);
    // ore on the back
    crystal(ctx, -23, -24, 12, 5, -0.8, K2);
    crystal(ctx, -14, -28, 19, 7, -0.3, K1);
    crystal(ctx, -3, -30, 20, 7.4, 0.08, K2);
    glow(ctx, -9, -40, 13 + sin(t * 3) * 2, K1, 0.35);
    // small far pincer
    seg(ctx, [-23, -19, -28, -23.5]); stroke2(ctx, SHD, 4, 8.4);
    ctx.save(); ctx.translate(-29, -23.5); ctx.scale(-1, 1); claw(0, 0, -0.25, po * 0.8, 0.52, true); ctx.restore();
    // shell
    const shell = () => { ctx.beginPath(); ctx.moveTo(-28, -18); ctx.bezierCurveTo(-28, -32, -14, -35, -2, -35); ctx.bezierCurveTo(12, -35, 25, -31, 25, -18); ctx.bezierCurveTo(25, -9, 12, -6.5, -2, -6.5); ctx.bezierCurveTo(-15, -6.5, -28, -9, -28, -18); ctx.closePath(); };
    shell(); fs(ctx, SHL);
    ctx.save(); shell(); ctx.clip();
    ctx.fillStyle = SHD; ctx.beginPath(); ctx.moveTo(-30, -15); ctx.quadraticCurveTo(-2, -8, 27, -15); ctx.lineTo(27, 0); ctx.lineTo(-30, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-20, -27); ctx.quadraticCurveTo(-8, -32.5, 6, -31.5); ctx.lineWidth = 2.6; ctx.strokeStyle = SHLT; ctx.stroke();
    ctx.restore();
    shell(); ctx.lineWidth = A.LW; ctx.strokeStyle = OUT; ctx.stroke();
    ell(ctx, 3, -27, 3.6, 3); fs(ctx, NUG, 1.8); ell(ctx, -18, -19, 2.8, 2.4); fs(ctx, NUG, 1.6); ell(ctx, -8, -23, 2, 1.7); fs(ctx, K1, 1.5);
    // mouth + bubbles
    ctx.beginPath(); ctx.arc(13, -14.5, 2.4, 0.1 * PI, 0.9 * PI); ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke();
    if (st === 'idle') { const q = (t % 2.2) / 2.2; if (q < 0.6) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * (1 - q / 0.6); ell(ctx, 17 + q * 6, -15 - q * 12, 1.6 + q * 2); ctx.lineWidth = 1.3; ctx.strokeStyle = '#eaf6ff'; ctx.stroke(); ctx.globalAlpha = ga; } }
    // eye stalks
    const st1 = [9, -32, 9, -32 - 8.5 * stalk], st2 = [18, -30, 19.5, -30 - 7.5 * stalk];
    seg(ctx, st1); stroke2(ctx, SHL, 2.6, 6.6); seg(ctx, st2); stroke2(ctx, SHL, 2.6, 6.6);
    const ex1 = st1[2], ey1 = st1[3] - 2.5, ex2 = st2[2], ey2 = st2[3] - 2.5;
    ell(ctx, ex1, ey1, 4.6); fs(ctx, '#f6f1e2', 2); ell(ctx, ex2, ey2, 4.1); fs(ctx, '#f6f1e2', 2);
    if (mode === 'hurt') { hurtEyes(ctx, ex1, ex2, (ey1 + ey2) / 2, 2.2, OUT, 1.8); }
    else if (mode === 'closed') { ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.beginPath(); ctx.moveTo(ex1 - 2.8, ey1); ctx.lineTo(ex1 + 2.8, ey1); ctx.moveTo(ex2 - 2.5, ey2); ctx.lineTo(ex2 + 2.5, ey2); ctx.stroke(); }
    else {
      A.eye(ctx, ex1 + 0.9, ey1 + 0.2, 2.2, 2.9); A.eye(ctx, ex2 + 0.9, ey2 + 0.2, 2, 2.7);
      if (mode === 'angry') { ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.beginPath(); ctx.moveTo(ex1 - 4.6, ey1 - 4.8); ctx.lineTo(ex1 + 3.4, ey1 - 2.2); ctx.moveTo(ex2 + 4.4, ey2 - 4.8); ctx.lineTo(ex2 - 2.8, ey2 - 2.2); ctx.stroke(); }
    }
    // big near pincer
    const elx = (21 + cx - 7) / 2 + 2, ely = (-19 + cy) / 2 - 6;
    seg(ctx, [21, -19, elx, ely, cx - 7, cy + 1]); stroke2(ctx, SHD, 5.4, 10);
    claw(cx, cy, ca, po, 0.9, false);
    ctx.restore();
  };
})();
