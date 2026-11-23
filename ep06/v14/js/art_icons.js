'use strict';
/* 등불지기 — icons: equipment, consumables, materials, skills, UI.
   Procedural 48×48 logical icons (96×96 backing), sticker style. A.icon(key) / A.iconURL(key) / A.drawIcon(ctx,key,x,y,size) */
(function () {
  const G = window.G, U = G.U, A = G.Art;
  const PI = Math.PI, TAU = PI * 2;
  const OUT = A.OUT, LW = 2.3;
  const GOLD = '#f0c35a', GOLD_D = '#c8922e', WOOD = '#8a5a3a', WOOD_D = '#6a4630';
  const cache = {}, urls = {};
  const R = {};   // exact key → draw(ctx)
  const FAM = {}; // family (key without _tier) → draw(ctx, tier)

  // ------------------------------------------------------------ local helpers
  const fs = (c, fill, lw, stroke) => A.fs(c, fill, lw === undefined ? LW : lw, stroke);
  const dot = (c, x, y, r, col) => { A.ell(c, x, y, r); c.fillStyle = col; c.fill(); };
  const line = (c, pts, col, w) => { A.poly(c, pts, true); c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
  const spark = (c, x, y, r, col, rot) => { A.star(c, x, y, r, r * 0.3, 4, rot || 0); c.fillStyle = col || '#fff'; c.fill(); };
  const gem = (c, x, y, r, col) => { A.poly(c, [x, y - r, x + r, y, x, y + r, x - r, y]); fs(c, col, 1.6); dot(c, x - r * 0.28, y - r * 0.3, r * 0.26, '#fff'); };
  // fill a path, paint details clipped inside it, then outline it
  const shape = (c, path, fill, inner, lw) => {
    c.save(); path(c); c.fillStyle = fill; c.fill();
    if (inner) { c.clip(); inner(c); }
    c.restore();
    path(c); c.lineWidth = lw === undefined ? LW : lw; c.strokeStyle = OUT; c.stroke();
  };
  // thick outlined stroke of the current path builder
  const rope = (c, path, col, w) => {
    path(c); c.lineWidth = w + 3.4; c.strokeStyle = OUT; c.stroke();
    path(c); c.lineWidth = w; c.strokeStyle = col; c.stroke();
  };
  const leaf = (c, x, y, len, wid, rot, col) => {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -wid, len, 0); c.quadraticCurveTo(len * 0.5, wid, 0, 0); c.closePath(); fs(c, col, 1.8);
    c.beginPath(); c.moveTo(len * 0.12, 0); c.lineTo(len * 0.8, 0); c.lineWidth = 1; c.strokeStyle = A.shade(col, -0.3); c.stroke();
    c.restore();
  };
  const heart = (c, x, y, s) => {
    c.beginPath(); c.moveTo(x, y + s * 0.9);
    c.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.8, y - s * 1.2, x, y - s * 0.35);
    c.bezierCurveTo(x + s * 0.8, y - s * 1.2, x + s * 1.5, y - s * 0.1, x, y + s * 0.9); c.closePath();
  };
  const drop = (c, x, y, s) => {
    c.beginPath(); c.moveTo(x, y - s * 1.3);
    c.bezierCurveTo(x + s * 0.2, y - s * 0.5, x + s, y - s * 0.1, x + s, y + s * 0.35);
    c.bezierCurveTo(x + s, y + s * 1.2, x - s, y + s * 1.2, x - s, y + s * 0.35);
    c.bezierCurveTo(x - s, y - s * 0.1, x - s * 0.2, y - s * 0.5, x, y - s * 1.3); c.closePath();
  };
  const tierAccent = ['', '#c8503f', '#6fb8ff', '#5fb86a', '#6fd8ff', '#ff6a4a', '#4fc0ff', '#ff5a8a'];

  // ------------------------------------------------------------ weapons
  FAM.sword = (c, t) => {
    const col = A.TIER[t], gl = A.TIER_GLOW[t], dk = A.shade(col, -0.22), lt = A.shade(col, 0.55);
    c.translate(23.5, 24.5); c.rotate(PI / 4);
    const hw = 4 + t * 0.2, tip = -17 - t * 1.25, g = 10;
    if (gl) A.glow(c, 0, -3, 21, gl, 0.55);
    A.rr(c, -2.5, g + 1, 5, 12.5, 2); fs(c, WOOD_D, 2);
    line(c, [-2, g + 6.5, 2, g + 5], A.shade(WOOD_D, 0.3), 1.2); line(c, [-2, g + 10.5, 2, g + 9], A.shade(WOOD_D, 0.3), 1.2);
    A.ell(c, 0, g + 15, 3.4); fs(c, t >= 2 ? GOLD : '#8a6040', 2);
    shape(c, (c) => A.poly(c, [-hw, g, -hw, tip + 7, 0, tip, hw, tip + 7, hw, g]), col, (c) => {
      c.fillStyle = dk; c.fillRect(0.4, tip - 1, hw + 2, g - tip + 2);
      c.fillStyle = lt; c.fillRect(-hw + 1.3, tip + 8, 1.5, g - tip - 11);
    });
    if (t === 1) { A.rr(c, -7, g - 2.2, 14, 4.6, 2.2); fs(c, '#8a6040', 2); }
    else if (t === 2) { A.rr(c, -8.5, g - 2.5, 17, 5.2, 2.5); fs(c, GOLD, 2); dot(c, 0, g + 0.1, 1.7, '#6fb8ff'); }
    else if (t === 3) { A.ell(c, -6.5, g + 0.5, 6.4, 3.3, 0.4); fs(c, '#5fb86a', 2); A.ell(c, 6.5, g + 0.5, 6.4, 3.3, -0.4); fs(c, '#5fb86a', 2); A.ell(c, 0, g, 3.1); fs(c, GOLD, 1.8); }
    else if (t === 4) { A.poly(c, [-11.5, g, -7, g - 3.6, -2, g, -7, g + 3.6]); fs(c, '#6fd8ff', 2); A.poly(c, [11.5, g, 7, g - 3.6, 2, g, 7, g + 3.6]); fs(c, '#6fd8ff', 2); gem(c, 0, g, 3.7, '#e8fbff'); }
    else if (t === 5) { A.poly(c, [-12.5, g - 6.5, -9, g + 2.6, 0, g + 3.6, 9, g + 2.6, 12.5, g - 6.5, 6, g - 1.8, 0, g - 3, -6, g - 1.8]); fs(c, GOLD, 2); gem(c, 0, g + 0.2, 3.1, '#ff6a4a'); }
    else if (t === 6) { A.poly(c, [-12.5, g + 1, -8, g - 4.5, -5, g - 1.5, 0, g - 5, 5, g - 1.5, 8, g - 4.5, 12.5, g + 1, 6, g + 3.8, -6, g + 3.8]); fs(c, '#f2fbff', 2); gem(c, 0, g + 0.2, 3.1, '#4fc0ff'); }
    else { A.poly(c, [-14.5, g - 8.5, -10, g + 3, 0, g + 4.2, 10, g + 3, 14.5, g - 8.5, 8.5, g - 3.5, 5, g - 7, 0, g - 2.5, -5, g - 7, -8.5, g - 3.5]); fs(c, '#fff6cf', 2); gem(c, 0, g + 0.5, 3.3, '#ff5a8a'); }
    if (t >= 4) spark(c, -0.4, tip + 12, 3.4, '#fff', PI / 4);
    if (t >= 6) spark(c, 1.6, (tip + g) / 2 + 3, 2.3, '#fff', PI / 4);
  };

  FAM.staff = (c, t) => {
    const col = t <= 1 ? '#8fd6ff' : A.TIER[t], gl = A.TIER_GLOW[t] || col, oy = -18.5;
    const ring = t >= 2 ? GOLD : '#a87a52';
    c.translate(21, 27); c.rotate(PI / 4);
    A.glow(c, 0, oy, 14.5, gl, 0.75);
    // behind-orb ornaments
    if (t === 4) for (const a of [-0.8, 0, 0.8]) { c.save(); c.translate(0, oy); c.rotate(a); A.poly(c, [0, -18.5, 3.6, -11, 0, -6, -3.6, -11]); fs(c, '#7fe0ff', 1.8); c.restore(); }
    if (t === 5) for (let i = 0; i < 7; i++) { c.save(); c.translate(0, oy); c.rotate(-PI * 0.75 + i * PI * 0.25); A.poly(c, [-2.4, -9.5, 0, -14.5, 2.4, -9.5]); fs(c, GOLD, 1.6); c.restore(); }
    if (t === 6) for (let i = 0; i < 5; i++) { c.save(); c.translate(0, oy); c.rotate(-PI * 0.6 + i * PI * 0.3); A.poly(c, [-2, -9, 0, -17, 2, -9]); fs(c, '#f2fbff', 1.6); c.restore(); }
    if (t === 7) {
      for (const s of [-1, 1]) { c.save(); c.translate(0, oy + 2); c.scale(s, 1); A.poly(c, [5, 2, 16, -9, 13, -2.5, 17, -2, 12, 2.5, 14.5, 4.5, 6, 6.5]); fs(c, '#fff6cf', 1.8); c.restore(); }
      c.save(); c.translate(0, oy); c.rotate(PI / 4); A.star(c, 0, 0, 15, 4, 4, 0); c.fillStyle = 'rgba(255,246,200,0.85)'; c.fill(); c.restore();
    }
    // shaft
    A.rr(c, -2.4, oy + 6, 4.8, 39, 2.4); fs(c, t >= 5 ? '#efe6d2' : WOOD, 2);
    if (t >= 2) { A.rr(c, -3.2, oy + 13, 6.4, 3.4, 1.4); fs(c, ring, 1.6); A.rr(c, -3.2, oy + 36, 6.4, 3.4, 1.4); fs(c, ring, 1.6); }
    else line(c, [-1.6, oy + 20, 1.6, oy + 18], WOOD_D, 1.3);
    if (t === 3) { leaf(c, 1, oy + 11, 9, 3.6, -0.5, '#5fb86a'); leaf(c, -1, oy + 11, 9, 3.6, PI + 0.5, '#5fb86a'); }
    // holder ring (open at the bottom) + orb
    rope(c, (c) => { c.beginPath(); c.arc(0, oy, 8.6, 0.22 * PI, 0.78 * PI, true); }, ring, 3);
    A.ell(c, 0, oy, 6); fs(c, col, 2);
    c.save(); A.ell(c, 0, oy, 6); c.clip(); dot(c, 2.5, oy + 2.5, 5, A.shade(col, -0.2)); c.restore();
    A.ell(c, 0, oy, 6); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    dot(c, -2, oy - 2.2, 1.9, '#fff');
    if (t >= 4) spark(c, 3.2, oy + 2.6, 2.2, '#fff', PI / 4);
  };

  FAM.bow = (c, t) => {
    const col = t <= 1 ? '#b98a5a' : A.TIER[t], gl = A.TIER_GLOW[t], hg = 19 + t * 0.35, ac = tierAccent[t];
    c.translate(21.5, 26); c.rotate(-PI / 4);
    if (gl) A.glow(c, 3, 0, 22.5, gl, 0.45);
    const limb = (c) => { c.beginPath(); c.moveTo(-4.5, -hg); c.quadraticCurveTo(10.5, -hg * 0.55, 3.5, 0); c.quadraticCurveTo(10.5, hg * 0.55, -4.5, hg); };
    // string
    line(c, [-4.5, -hg, -4.5, hg], '#f6f1e2', 1.4);
    // arrow
    line(c, [-11, 0, 17, 0], OUT, 4); line(c, [-11, 0, 17, 0], '#f1e2b8', 1.8);
    A.poly(c, [16, -3.8, 23.5, 0, 16, 3.8]); fs(c, t >= 4 ? A.shade(col, 0.3) : '#dfe6ee', 1.7);
    A.poly(c, [-13, 0, -9.5, -4, -5.5, -4, -8, 0, -5.5, 4, -9.5, 4]); fs(c, ac, 1.5);
    // limbs
    limb(c); c.lineWidth = 8; c.strokeStyle = OUT; c.stroke();
    limb(c); c.lineWidth = 4.6; c.strokeStyle = col; c.stroke();
    c.beginPath(); c.moveTo(-2.6, -hg + 2.5); c.quadraticCurveTo(7.6, -hg * 0.55, 2.4, -3); c.lineWidth = 1.3; c.strokeStyle = A.shade(col, 0.5); c.stroke();
    // grip
    A.rr(c, 0.4, -4.4, 5.6, 8.8, 2.4); fs(c, t >= 5 ? GOLD : WOOD_D, 1.8);
    // tips
    for (const s of [-1, 1]) {
      c.save(); c.translate(-4.5, s * hg); c.scale(1, s);
      if (t === 2) { A.ell(c, 0, 0, 2.6); fs(c, '#eef2f8', 1.6); }
      else if (t === 3) leaf(c, 0, 0, 8.5, 3.4, PI * 0.68, '#5fb86a');
      else if (t === 4) { A.poly(c, [0, -1.5, -6, 3, -3, 6.5, 2, 2.5]); fs(c, '#6fd8ff', 1.7); }
      else if (t === 5) { A.ell(c, -1, 1.5, 3.4); fs(c, GOLD, 1.7); dot(c, -1, 1.5, 1.3, '#ff6a4a'); }
      else if (t === 6) { A.poly(c, [1.5, -2, -7.5, 5.5, 1, 4]); fs(c, '#f2fbff', 1.7); }
      else if (t === 7) { A.poly(c, [2, -2, -4, 0.5, -11, 8, -6.5, 6.5, -8, 11, -2, 6, 2, 4]); fs(c, '#fff6cf', 1.7); }
      c.restore();
    }
    if (t >= 6) spark(c, 9, -8, 2.6, '#fff', PI / 4);
  };

  R.rod_1 = (c) => {
    A.glow(c, 32.5, 23, 15, '#ffc95a', 0.75);
    rope(c, (c) => { c.beginPath(); c.moveTo(9.5, 43.5); c.lineTo(23, 9.5); }, WOOD, 3.2);
    rope(c, (c) => { c.beginPath(); c.moveTo(22.6, 10.5); c.quadraticCurveTo(25.5, 2.5, 33, 7.5); }, WOOD, 2.6);
    line(c, [33, 8, 33, 13], OUT, 1.6);
    A.rr(c, 26.8, 15.5, 12.4, 15.5, 3.2); fs(c, '#ffe9a0', 2);
    A.rr(c, 25.6, 12.6, 14.8, 4.4, 1.8); fs(c, WOOD_D, 1.8);
    A.rr(c, 26.6, 29.8, 12.8, 3.2, 1.4); fs(c, WOOD_D, 1.8);
    drop(c, 33, 24, 3.1); c.fillStyle = '#ff9a2e'; c.fill();
    dot(c, 33, 25.4, 1.4, '#fff3b0');
    line(c, [14.5, 33.5, 17.5, 34.8], WOOD_D, 1.3);
  };

  // ------------------------------------------------------------ armor pieces
  const snow = (c, x, y, r, col, w) => {
    const path = (c) => {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * PI) / 3 - PI / 2, ca = Math.cos(a), sa = Math.sin(a), bx = x + ca * r * 0.58, by = y + sa * r * 0.58;
        c.moveTo(x, y); c.lineTo(x + ca * r, y + sa * r);
        for (const d of [-1, 1]) { c.moveTo(bx, by); c.lineTo(bx + Math.cos(a + d * 0.95) * r * 0.36, by + Math.sin(a + d * 0.95) * r * 0.36); }
      }
    };
    path(c); c.lineWidth = (w || 1.6) + 2.4; c.strokeStyle = OUT; c.stroke();
    path(c); c.lineWidth = w || 1.6; c.strokeStyle = col; c.stroke();
  };
  // tier motif: 2 dew drop · 3 leaf · 4 crystal · 5 sun · 6 snowflake · 7 dawn star
  const emblem = (c, t, x, y, s) => {
    s = s || 1;
    if (t === 2) { drop(c, x, y + s, 3.6 * s); fs(c, '#6fb8ff', 1.6); dot(c, x - 1.2 * s, y + 0.6 * s, s, '#fff'); }
    else if (t === 3) leaf(c, x - 3.6 * s, y + 3.8 * s, 10.5 * s, 4.6 * s, -0.8, '#5fb86a');
    else if (t === 4) { A.poly(c, [x, y - 6 * s, x + 4 * s, y, x, y + 6 * s, x - 4 * s, y]); fs(c, '#6fd8ff', 1.6); line(c, [x - 3.4 * s, y, x + 3.4 * s, y], '#e8fbff', 1); dot(c, x - 1.2 * s, y - 2.2 * s, s, '#fff'); }
    else if (t === 5) { A.star(c, x, y, 6.8 * s, 4.2 * s, 8); fs(c, GOLD, 1.5); dot(c, x, y, 2.6 * s, '#ff6a4a'); }
    else if (t === 6) snow(c, x, y, 6 * s, '#f2fbff', 1.5);
    else if (t === 7) { A.star(c, x, y, 7.6 * s, 2.6 * s, 4); fs(c, '#fffbe6', 1.5); dot(c, x, y, 2 * s, '#ff5a8a'); }
  };

  FAM.helm = (c, t) => {
    const col = A.TIER[t], gl = A.TIER_GLOW[t], dk = A.shade(col, -0.2), lt = A.shade(col, 0.5);
    if (t === 1) { // cloth hood with a knot
      A.poly(c, [36, 27, 46.5, 29.5, 45, 35.5, 35.5, 31.5]); fs(c, A.shade(col, -0.14), 2);
      A.poly(c, [36.5, 29.5, 43.5, 40, 38.5, 42.5, 33.5, 32.5]); fs(c, A.shade(col, -0.26), 2);
      shape(c, (c) => { c.beginPath(); c.moveTo(6.5, 31); c.bezierCurveTo(5.5, 7, 40.5, 7, 39.5, 31); c.quadraticCurveTo(23, 37.5, 6.5, 31); c.closePath(); }, col, (c) => {
        c.fillStyle = dk; c.beginPath(); c.moveTo(27, 6); c.bezierCurveTo(35, 12, 36, 24, 34, 36); c.lineTo(44, 36); c.lineTo(44, 6); c.closePath(); c.fill();
        c.strokeStyle = '#c8503f'; c.lineWidth = 3.6; c.beginPath(); c.moveTo(6, 27.5); c.quadraticCurveTo(23, 34, 40, 27.5); c.stroke();
        c.strokeStyle = A.shade(col, 0.4); c.lineWidth = 2; c.beginPath(); c.moveTo(12, 22); c.quadraticCurveTo(13, 14, 19, 11.5); c.stroke();
      });
      A.ell(c, 37.2, 29.6, 3.5); fs(c, '#c8503f', 2);
      return;
    }
    if (gl) A.glow(c, 24, 23, 22, gl, 0.5);
    if (t === 5) { c.beginPath(); c.moveTo(22, 11); c.bezierCurveTo(30, -2, 47, 3, 45, 23); c.quadraticCurveTo(41, 14.5, 34, 14); c.quadraticCurveTo(29, 12, 24, 13); c.closePath(); fs(c, '#ff6a4a', 2.1); line(c, [30, 7.5, 39, 12.5], '#ffb08a', 1.5); }
    if (t === 6) for (const s of [-1, 1]) { A.poly(c, [24 + s * 12.5, 24, 24 + s * 21.5, 17.5, 24 + s * 20.5, 3.5, 24 + s * 15.5, 13, 24 + s * 10.5, 16]); fs(c, '#f2fbff', 2); }
    if (t === 7) for (const s of [-1, 1]) { A.poly(c, [24 + s * 12, 24.5, 24 + s * 22, 5, 24 + s * 20, 14.5, 24 + s * 23.6, 13.5, 24 + s * 19.5, 21, 24 + s * 22.5, 21.5, 24 + s * 14, 28.5]); fs(c, '#fff6cf', 2); }
    A.poly(c, [9.8, 30, 18, 30, 17, 41, 12.5, 43, 9.8, 38]); fs(c, dk, 2.1);
    A.poly(c, [38.2, 30, 30, 30, 31, 41, 35.5, 43, 38.2, 38]); fs(c, A.shade(col, -0.32), 2.1);
    shape(c, (c) => { c.beginPath(); c.moveTo(8, 30); c.bezierCurveTo(7, 6, 41, 6, 40, 30); c.closePath(); }, col, (c) => {
      c.fillStyle = dk; c.beginPath(); c.moveTo(27, 5); c.bezierCurveTo(35.5, 10, 37, 22, 36, 32); c.lineTo(44, 32); c.lineTo(44, 5); c.closePath(); c.fill();
      c.strokeStyle = lt; c.lineWidth = 2.2; c.beginPath(); c.moveTo(13, 24); c.quadraticCurveTo(13, 14, 19.5, 11); c.stroke();
      c.strokeStyle = A.shade(col, -0.36); c.lineWidth = 1.4; c.beginPath(); c.moveTo(24, 9); c.lineTo(24, 28); c.stroke();
    });
    A.rr(c, 6.4, 26.4, 35.2, 6.2, 3.1); fs(c, GOLD, 2.1);
    A.rr(c, 21.7, 30.5, 4.6, 10, 2.2); fs(c, col, 2);
    if (t === 2) gem(c, 24, 29.5, 3, '#6fb8ff');
    else if (t === 3) { leaf(c, 24, 12.5, 11, 4.2, -PI / 2 - 0.55, '#5fb86a'); leaf(c, 24, 12.5, 11, 4.2, -PI / 2 + 0.55, '#7fcf86'); gem(c, 24, 29.5, 2.8, '#5fb86a'); }
    else if (t === 4) { A.poly(c, [17, 5.5, 19.8, 10.5, 17, 15, 14.2, 10.5]); fs(c, '#6fd8ff', 1.8); A.poly(c, [31, 5.5, 33.8, 10.5, 31, 15, 28.2, 10.5]); fs(c, '#6fd8ff', 1.8); A.poly(c, [24, 0.8, 27.8, 8, 24, 14.5, 20.2, 8]); fs(c, '#9feaff', 1.8); gem(c, 24, 29.5, 2.8, '#e8fbff'); }
    else if (t === 5) gem(c, 24, 29.5, 3.1, '#ff6a4a');
    else if (t === 6) gem(c, 24, 29.5, 3.1, '#4fc0ff');
    else if (t === 7) { gem(c, 24, 29.5, 3.2, '#ff5a8a'); spark(c, 15.5, 15.5, 3.2, '#fff'); }
  };

  FAM.armor = (c, t) => {
    const col = A.TIER[t], gl = A.TIER_GLOW[t], dk = A.shade(col, -0.2), lt = A.shade(col, 0.5);
    if (t === 1) { // cloth tunic
      shape(c, (c) => { c.beginPath(); c.moveTo(16, 7.5); c.lineTo(20, 7.5); c.quadraticCurveTo(24, 13.5, 28, 7.5); c.lineTo(32, 7.5); c.lineTo(43.5, 15.5); c.lineTo(38.8, 24.5); c.lineTo(33.6, 21.2); c.lineTo(34.8, 41.5); c.lineTo(13.2, 41.5); c.lineTo(14.4, 21.2); c.lineTo(9.2, 24.5); c.lineTo(4.5, 15.5); c.closePath(); }, col, (c) => {
        c.fillStyle = dk; c.beginPath(); c.moveTo(27, 6); c.lineTo(46, 6); c.lineTo(46, 44); c.lineTo(29, 44); c.closePath(); c.fill();
        c.fillStyle = WOOD_D; c.fillRect(10, 29.2, 28, 4.4);
        c.strokeStyle = A.shade(col, 0.42); c.lineWidth = 1.8; c.beginPath(); c.moveTo(17.5, 22); c.lineTo(17, 27.5); c.stroke();
      });
      line(c, [20.2, 8.4, 24, 15, 27.8, 8.4], '#f6e7b8', 2);
      A.rr(c, 21.5, 28.4, 5.2, 6, 1.5); fs(c, GOLD, 1.6);
      line(c, [24, 16.5, 24, 21], A.shade(col, -0.36), 1.3); dot(c, 24, 23.5, 1.1, A.shade(col, -0.36));
      return;
    }
    if (gl) A.glow(c, 24, 25, 23, gl, 0.45);
    shape(c, (c) => { c.beginPath(); c.moveTo(14.5, 10.5); c.quadraticCurveTo(24, 16.5, 33.5, 10.5); c.lineTo(36.6, 24); c.quadraticCurveTo(35, 37.5, 24, 44); c.quadraticCurveTo(13, 37.5, 11.4, 24); c.closePath(); }, col, (c) => {
      c.fillStyle = dk; c.fillRect(24, 8, 16, 38);
      c.strokeStyle = A.shade(col, -0.4); c.lineWidth = 1.4; c.beginPath(); c.moveTo(12.5, 31.5); c.quadraticCurveTo(24, 36.5, 35.5, 31.5); c.moveTo(15.5, 37); c.quadraticCurveTo(24, 41, 32.5, 37); c.stroke();
      c.strokeStyle = lt; c.lineWidth = 2; c.beginPath(); c.moveTo(15.6, 18); c.lineTo(14.6, 26.5); c.stroke();
    });
    for (const s of [-1, 1]) {
      shape(c, (c) => A.ell(c, 24 + s * 13.6, 13.2, 8.4, 6.3, s * 0.28), s < 0 ? A.shade(col, 0.14) : A.shade(col, -0.1), (c) => {
        c.strokeStyle = GOLD; c.lineWidth = 2.4; c.beginPath(); c.ellipse(24 + s * 13.6, 16.8, 8.4, 6.3, s * 0.28, 0, TAU); c.stroke();
      });
    }
    rope(c, (c) => { c.beginPath(); c.moveTo(16, 11.6); c.quadraticCurveTo(24, 16.6, 32, 11.6); }, GOLD, 1.6);
    emblem(c, t, 24, 25.5, 1);
    if (t === 7) spark(c, 34.5, 34, 2.8, '#fff');
  };

  FAM.gloves = (c, t) => {
    const col = A.TIER[t], gl = A.TIER_GLOW[t], dk = A.shade(col, -0.2), lt = A.shade(col, 0.5), ac = tierAccent[t];
    if (gl) A.glow(c, 24, 24, 22, gl, 0.45);
    c.translate(24, 24); c.rotate(-0.2); c.translate(-24, -24);
    if (t === 7) { A.poly(c, [36, 31, 46.5, 24, 43.5, 30.5, 47, 31.5, 42, 34.5, 44, 37.5, 37, 37]); fs(c, '#fff6cf', 1.9); }
    A.ell(c, 35.2, 22.5, 4.3, 6.8, -0.5); fs(c, dk, 2.1);
    shape(c, (c) => {
      c.beginPath(); c.moveTo(11.6, 31); c.lineTo(11.6, 14);
      c.quadraticCurveTo(11.6, 8.5, 14.9, 8.5); c.quadraticCurveTo(18, 8.5, 18, 12.5);
      c.quadraticCurveTo(18, 6.3, 21, 6.3); c.quadraticCurveTo(24, 6.3, 24, 11.5);
      c.quadraticCurveTo(24, 6.3, 27, 6.3); c.quadraticCurveTo(30, 6.3, 30, 12.5);
      c.quadraticCurveTo(30, 8.5, 32.9, 8.5); c.quadraticCurveTo(35.8, 8.5, 35.8, 14); c.lineTo(35.8, 31); c.closePath();
    }, col, (c) => {
      c.fillStyle = dk; c.fillRect(28, 4, 10, 30);
      c.strokeStyle = A.shade(col, -0.4); c.lineWidth = 1.4; c.beginPath(); c.moveTo(18, 12); c.lineTo(18, 19.5); c.moveTo(24, 11); c.lineTo(24, 19.5); c.moveTo(30, 12); c.lineTo(30, 19.5); c.stroke();
      c.strokeStyle = lt; c.lineWidth = 1.9; c.beginPath(); c.moveTo(14.4, 14); c.lineTo(14.4, 27); c.stroke();
      if (t >= 2) { c.fillStyle = A.shade(col, 0.3); c.fillRect(10, 18.6, 28, 4.2); c.strokeStyle = A.shade(col, -0.4); c.lineWidth = 1.2; c.strokeRect(10, 18.6, 28, 4.2); }
    });
    shape(c, (c) => A.poly(c, [10.4, 30, 37, 30, 39.6, 42.6, 7.8, 42.6]), t === 1 ? A.shade(col, -0.14) : col, (c) => { c.fillStyle = t === 1 ? A.shade(col, -0.3) : dk; c.fillRect(28, 28, 14, 16); });
    if (t === 6) { for (let i = 0; i < 6; i++) { A.ell(c, 11.5 + i * 5, 30.4, 3.4, 3); fs(c, '#ffffff', 1.8); } }
    else { A.rr(c, 9.2, 28, 29, 4.8, 2.2); fs(c, t === 1 ? WOOD_D : GOLD, 2); }
    if (t === 1) { c.strokeStyle = '#f6e7b8'; c.lineWidth = 1.3; c.setLineDash([2, 2.4]); c.beginPath(); c.moveTo(13, 38.5); c.lineTo(35, 38.5); c.stroke(); c.setLineDash([]); }
    else if (t === 2) gem(c, 23.6, 36.4, 2.6, ac);
    else if (t === 3) leaf(c, 19.5, 39, 9.5, 3.6, -0.6, '#5fb86a');
    else gem(c, 23.6, 36.6, 3.3, ac);
    if (t >= 6) spark(c, 16.5, 25.5, 2.6, '#fff');
  };

  FAM.boots = (c, t) => {
    const col = A.TIER[t], gl = A.TIER_GLOW[t], dk = A.shade(col, -0.2), lt = A.shade(col, 0.5), ac = tierAccent[t];
    if (gl) A.glow(c, 25, 25, 22, gl, 0.45);
    if (t === 7) { A.poly(c, [17, 27, 3.5, 13, 8, 22, 2.5, 22.5, 9, 28, 5.5, 31, 16, 33]); fs(c, '#fff6cf', 1.9); }
    A.rr(c, 11, 37, 34, 5.4, 2.4); fs(c, t === 1 ? WOOD_D : '#4a4458', 2.1);
    shape(c, (c) => {
      c.beginPath(); c.moveTo(14, 9); c.lineTo(28.5, 9); c.lineTo(28.5, 24.5); c.quadraticCurveTo(30.5, 28.5, 37.5, 29.5); c.quadraticCurveTo(43.6, 30.5, 43.6, 35.5);
      c.lineTo(43.6, 38); c.lineTo(12.4, 38); c.lineTo(12.4, 30); c.quadraticCurveTo(14.6, 20, 14, 9); c.closePath();
    }, col, (c) => {
      c.fillStyle = dk; c.beginPath(); c.moveTo(23.5, 8); c.lineTo(30, 8); c.lineTo(30, 26); c.lineTo(46, 31); c.lineTo(46, 40); c.lineTo(10, 40); c.lineTo(10, 34.5); c.lineTo(23.5, 34.5); c.closePath(); c.fill();
      c.fillStyle = lt; c.fillRect(16.6, 13.5, 1.9, 13);
      if (t >= 2) { A.ell(c, 40.5, 37.5, 7.4, 6.6); c.fillStyle = A.shade(col, 0.34); c.fill(); c.lineWidth = 1.3; c.strokeStyle = A.shade(col, -0.4); c.stroke(); }
      c.strokeStyle = A.shade(col, -0.4); c.lineWidth = 1.3; c.beginPath(); c.moveTo(22.5, 28.5); c.quadraticCurveTo(26, 26.5, 28.5, 23.5); c.stroke();
    });
    if (t === 6) { for (let i = 0; i < 4; i++) { A.ell(c, 14.4 + i * 4.6, 9.4, 3.3, 3.5); fs(c, '#ffffff', 1.8); } }
    else { A.rr(c, 12, 6, 18.6, 6.8, 3.2); fs(c, t === 1 ? A.shade(col, -0.2) : GOLD, 2.1); }
    if (t <= 2) { c.strokeStyle = t === 1 ? '#f6e7b8' : A.shade(col, -0.45); c.lineWidth = 1.4; c.beginPath(); for (let i = 0; i < 3; i++) { c.moveTo(23.8, 15.5 + i * 3.6); c.lineTo(28, 14.2 + i * 3.6); } c.stroke(); }
    if (t === 3) leaf(c, 21.5, 13.5, 10, 3.8, 2.2, '#5fb86a');
    else if (t >= 4) gem(c, 21, 20.5, 3.3, ac);
    if (t === 5) line(c, [14, 30.5, 27, 30.5], GOLD, 2);
    if (t >= 6) spark(c, 35.5, 26, 2.6, '#fff');
  };

  FAM.charm = (c, t) => {
    const col = A.TIER[t], gl = A.TIER_GLOW[t], cord = t >= 4 ? GOLD : '#c8503f';
    if (gl) A.glow(c, 24, 30, 18, gl, 0.65);
    rope(c, (c) => { c.beginPath(); c.moveTo(14.5, 3.6); c.quadraticCurveTo(15, 12, 24, 16.5); c.quadraticCurveTo(33, 12, 33.5, 3.6); }, cord, 1.9);
    if (t === 1) {
      shape(c, (c) => A.rr(c, 15, 18.5, 18, 25, 4.5), col, (c) => { c.fillStyle = A.shade(col, -0.2); c.fillRect(25, 16, 10, 30); });
      dot(c, 24, 22.3, 1.7, OUT);
      A.rr(c, 20.4, 28, 7.2, 9.4, 1.8); fs(c, '#ffe9a0', 1.6); A.rr(c, 19.6, 26.4, 8.8, 2.6, 1); fs(c, WOOD_D, 1.4);
      drop(c, 24, 33.4, 1.7); c.fillStyle = '#ff9a2e'; c.fill();
    } else if (t === 2) {
      shape(c, (c) => A.ell(c, 24, 31, 11.6), col, (c) => { dot(c, 28, 35, 10.5, A.shade(col, -0.18)); });
      A.ell(c, 24, 31, 8.2); c.lineWidth = 1.3; c.strokeStyle = A.shade(col, -0.42); c.stroke();
      drop(c, 24, 32, 4.6); fs(c, '#6fb8ff', 1.7); dot(c, 22.4, 31.6, 1.2, '#fff');
    } else if (t === 3) {
      c.save(); c.translate(24, 44.5); c.rotate(-PI / 2);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(13, -13.5, 27.5, 0); c.quadraticCurveTo(13, 13.5, 0, 0); c.closePath(); fs(c, '#6fc97a', 2.1);
      c.strokeStyle = '#3f8f52'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(2.5, 0); c.lineTo(23, 0); c.moveTo(9, 0); c.lineTo(13, -4.6); c.moveTo(9, 0); c.lineTo(13, 4.6); c.moveTo(15, 0); c.lineTo(18.5, -3.6); c.moveTo(15, 0); c.lineTo(18.5, 3.6); c.stroke();
      c.restore();
      dot(c, 20.4, 29, 1.5, '#d8f6d8');
    } else if (t === 4) {
      shape(c, (c) => A.poly(c, [24, 17.5, 32.6, 24.5, 32.6, 36.5, 24, 45, 15.4, 36.5, 15.4, 24.5]), '#7fdcff', (c) => {
        c.fillStyle = '#4fb2e6'; A.poly(c, [24, 17, 34, 24, 34, 37, 24, 46]); c.fill();
        c.fillStyle = '#d8f8ff'; A.poly(c, [24, 17.5, 15.4, 24.5, 24, 28]); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1.1; A.poly(c, [15.4, 24.5, 24, 28, 32.6, 24.5], true); c.stroke(); line(c, [24, 28, 24, 45], 'rgba(255,255,255,0.75)', 1.1);
      });
      spark(c, 19.4, 31.5, 2.8, '#fff');
    } else if (t === 5) {
      A.star(c, 24, 31, 14.2, 9.6, 10); fs(c, GOLD, 2);
      A.ell(c, 24, 31, 7.6); fs(c, '#ffe08a', 1.7); A.ell(c, 24, 31, 3.9); fs(c, '#ff6a4a', 1.6); dot(c, 22.8, 29.8, 1.1, '#fff');
    } else if (t === 6) {
      shape(c, (c) => A.ell(c, 24, 31, 12), col, (c) => { dot(c, 28.5, 35.5, 10.5, '#a8d8f4'); });
      snow(c, 24, 31, 8, '#ffffff', 1.7); spark(c, 31.6, 23.2, 2.6, '#fff');
    } else {
      c.save(); c.translate(24, 31); c.rotate(PI / 4); A.star(c, 0, 0, 10, 3.2, 4, 0); fs(c, '#ffe9a0', 1.8); c.restore();
      A.star(c, 24, 31, 14.6, 4.4, 4); fs(c, '#fffbe6', 2);
      A.ell(c, 24, 31, 3.3); fs(c, '#ff5a8a', 1.6); dot(c, 23, 30, 1, '#fff');
    }
    A.ell(c, 24, 17, 2.7); fs(c, GOLD, 1.7);
  };

  // ------------------------------------------------------------ consumables / misc
  function potion(c, kind, n) {
    const liq = kind === 'hp' ? '#ff5a5a' : '#4a9aff', dk = A.shade(liq, -0.26), lt = A.shade(liq, 0.45), glass = '#e4f3ff';
    const ny = n === 1 ? 13.5 : n === 2 ? 10.5 : 9, top = n === 1 ? 27 : n === 2 ? 27 : 25;
    const body = n === 1 ? (c) => A.ell(c, 24, 31, 11, 11)
      : n === 2 ? (c) => { c.beginPath(); c.moveTo(19.5, 19.5); c.lineTo(28.5, 19.5); c.quadraticCurveTo(38, 24, 37.2, 34); c.quadraticCurveTo(36.4, 43.5, 24, 43.5); c.quadraticCurveTo(11.6, 43.5, 10.8, 34); c.quadraticCurveTo(10, 24, 19.5, 19.5); c.closePath(); }
      : (c) => A.ell(c, 24, 31, 15, 12.6);
    if (n === 3) {
      A.glow(c, 24, 30, 22, liq, 0.45);
      for (const s of [-1, 1]) rope(c, (c) => { c.beginPath(); c.moveTo(24 + s * 4, 17); c.quadraticCurveTo(24 + s * 15, 14, 24 + s * 13.5, 24); }, GOLD, 1.8);
    }
    A.rr(c, 20.3, ny, 7.4, 31 - ny - 8, 2); fs(c, glass, 2);
    shape(c, body, glass, (c) => {
      c.fillStyle = liq; c.fillRect(0, top, 48, 48);
      c.fillStyle = dk; c.beginPath(); c.ellipse(31, 41, 14, 8.5, 0, 0, TAU); c.fill();
      c.fillStyle = lt; c.fillRect(0, top, 48, 1.8);
      dot(c, 29.5, top + 5.5, 1.5, lt); dot(c, 33, top + 9.5, 1, lt);
    });
    c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 2.1; c.beginPath(); c.arc(24, 31, n === 3 ? 10.6 : 7.6, PI * 0.92, PI * 1.3); c.stroke();
    if (n >= 2) { A.rr(c, 18.6, ny + (n === 2 ? 6.4 : 6), 10.8, 3.8, 1.7); fs(c, GOLD, 1.7); }
    if (n < 3) { A.rr(c, 19.2, ny - 4.6, 9.6, 6.2, 2.4); fs(c, '#b98a5a', 2); line(c, [21.4, ny - 2.6, 26.6, ny - 2.6], '#d9ac78', 1.2); }
    else { A.rr(c, 18.2, ny - 3.6, 11.6, 6, 2.4); fs(c, GOLD, 2); gem(c, 24, ny - 4.6, 2.8, lt); }
    if (n >= 2) {
      if (kind === 'hp') heart(c, 24, 34.5, n === 3 ? 4.8 : 4); else A.star(c, 24, 34.5, n === 3 ? 6.4 : 5.4, 2.3, 4);
      c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.3; c.strokeStyle = dk; c.stroke();
    }
    if (n === 3) spark(c, 38, 15.5, 3.2, '#fff');
  }
  for (const n of [1, 2, 3]) { R['pot_hp_' + n] = (c) => potion(c, 'hp', n); R['pot_mp_' + n] = (c) => potion(c, 'mp', n); }

  R.elixir = (c) => {
    A.glow(c, 24, 27, 23, '#ffc95a', 0.8);
    rope(c, (c) => { c.beginPath(); c.arc(24, 8.2, 4.4, 0, TAU); }, GOLD, 1.9);
    A.poly(c, [15.6, 17, 19.2, 11.6, 28.8, 11.6, 32.4, 17]); fs(c, GOLD, 2);
    shape(c, (c) => A.rr(c, 14, 16.4, 20, 23.4, 5), '#fff7d6', (c) => {
      c.fillStyle = '#ffd24a'; c.fillRect(0, 21.5, 48, 30);
      c.fillStyle = '#f5a623'; c.beginPath(); c.ellipse(32, 41, 12, 8, 0, 0, TAU); c.fill();
      c.fillStyle = '#fff3b0'; c.fillRect(0, 21.5, 48, 1.8);
    });
    line(c, [19.6, 17.5, 19.6, 39], GOLD_D, 1.4); line(c, [28.4, 17.5, 28.4, 39], GOLD_D, 1.4);
    spark(c, 24, 30, 6.2, '#ffffff');
    A.rr(c, 12.4, 38.6, 23.2, 4.8, 2.1); fs(c, GOLD, 2);
    line(c, [16.6, 21, 16.6, 33], 'rgba(255,255,255,0.9)', 1.8);
    spark(c, 37.5, 12.5, 3, '#fff'); spark(c, 9.5, 24, 2.4, '#fff3b0');
  };

  R.scroll = (c) => {
    c.translate(24, 24); c.rotate(-0.42); c.translate(-24, -24);
    shape(c, (c) => A.rr(c, 8, 15.5, 32, 17, 2.5), '#f3e3b8', (c) => {
      c.fillStyle = '#dcc48e'; c.fillRect(8, 27.5, 32, 6);
      c.strokeStyle = '#bfa46c'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(12.5, 20); c.lineTo(19, 20); c.moveTo(29, 20); c.lineTo(35.5, 20); c.moveTo(12.5, 23.5); c.lineTo(17, 23.5); c.moveTo(31, 23.5); c.lineTo(35.5, 23.5); c.stroke();
    });
    for (const x of [8, 40]) { A.rr(c, x - 4, 12.6, 8, 22.8, 4); fs(c, '#e9d4a2', 2.1); A.ell(c, x, 24, 1.5, 6.4); c.lineWidth = 1.2; c.strokeStyle = '#a88e5a'; c.stroke(); }
    A.rr(c, 21.2, 14.6, 5.6, 18.8, 1); fs(c, '#c8503f', 1.8);
    A.ell(c, 24, 24, 6.8); fs(c, '#de4b3c', 2);
    c.fillStyle = '#ffe08a'; A.rr(c, 21.7, 23.4, 4.6, 4.4, 0.8); c.fill(); A.poly(c, [20.5, 23.8, 24, 20, 27.5, 23.8]); c.fill();
    dot(c, 24, 25.6, 0.9, '#de4b3c');
  };

  R.dust = (c) => {
    A.glow(c, 24, 28, 22, '#ffd86a', 0.85);
    shape(c, (c) => { c.beginPath(); c.moveTo(6.5, 39.5); c.quadraticCurveTo(13, 37, 17, 29); c.quadraticCurveTo(21.5, 20.5, 25.5, 22); c.quadraticCurveTo(30, 23, 33.5, 31.5); c.quadraticCurveTo(36.5, 38, 41.5, 39.5); c.quadraticCurveTo(24, 44.5, 6.5, 39.5); c.closePath(); }, '#ffd86a', (c) => {
      c.fillStyle = '#f2a93a'; c.beginPath(); c.moveTo(27, 21); c.quadraticCurveTo(33, 30, 35, 38); c.lineTo(44, 46); c.lineTo(26, 46); c.closePath(); c.fill();
      c.fillStyle = '#fff3b0'; c.beginPath(); c.ellipse(21.5, 28, 3, 4.6, 0.5, 0, TAU); c.fill();
      for (const [x, y] of [[13.5, 38.5], [18.5, 35.5], [24.5, 32], [29.5, 36.5], [23, 39], [33.5, 39.8]]) dot(c, x, y, 0.95, '#fff8d0');
    });
    spark(c, 11.5, 20.5, 4.8, '#fff8d0'); spark(c, 35.5, 15, 6, '#ffffff'); spark(c, 24.5, 9.5, 3.6, '#ffe9a0'); spark(c, 40.5, 28, 2.8, '#fff');
    dot(c, 17.5, 13, 1.2, '#ffe9a0'); dot(c, 31, 24.5, 1.1, '#fff');
  };

  const coin = (c, x, y, r, stamp) => {
    shape(c, (c) => A.ell(c, x, y, r), '#ffd24a', (c) => { dot(c, x + r * 0.34, y + r * 0.4, r, '#f2ae2e'); });
    A.ell(c, x, y, r * 0.74); c.lineWidth = 1.4; c.strokeStyle = '#c8801e'; c.stroke();
    if (stamp) {
      const s = r / 14;
      c.fillStyle = '#c8801e';
      A.rr(c, x - 3.6 * s, y - 2.4 * s, 7.2 * s, 8.2 * s, 1.6 * s); c.fill();
      A.rr(c, x - 4.6 * s, y - 4.6 * s, 9.2 * s, 2.6 * s, s); c.fill();
      c.beginPath(); c.arc(x, y - 5.4 * s, 2.2 * s, PI, TAU); c.lineWidth = 1.4 * s; c.strokeStyle = '#c8801e'; c.stroke();
      drop(c, x, y + 2 * s, 1.8 * s); c.fillStyle = '#fff3b0'; c.fill();
    }
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.8; c.beginPath(); c.arc(x, y, r * 0.86, PI * 1.05, PI * 1.38); c.stroke();
  };
  R.gold = (c) => { A.glow(c, 24, 24, 22, '#ffd24a', 0.4); coin(c, 24, 24.5, 15, true); spark(c, 37, 11, 3.8, '#fff'); };
  R.gold_pile = (c) => {
    A.glow(c, 24, 27, 22, '#ffd24a', 0.4);
    const flat = (x, y) => { A.rr(c, x - 11, y - 2.6, 22, 8.2, 4.1); fs(c, '#e09a26', 2); A.ell(c, x, y - 2.2, 11, 4.3); fs(c, '#ffd24a', 2); A.ell(c, x, y - 2.2, 6.8, 2.2); c.lineWidth = 1.1; c.strokeStyle = '#c8801e'; c.stroke(); };
    flat(15.5, 39); flat(32.5, 39); flat(24, 33.5); flat(16.5, 27.5);
    coin(c, 31.5, 20, 9.6, true);
    spark(c, 11, 13.5, 3.8, '#fff'); spark(c, 41.5, 9.5, 2.6, '#fff3b0');
  };

  // ------------------------------------------------------------ materials (m_<monsterId>)
  const MC = (id, fb) => (G.D && G.D.MON && G.D.MON[id] && G.D.MON[id].col) || fb;
  const M = {};
  // union of circles [x,y,r,...] with a single outline; inner() paints clipped details
  const blobs = (c, bl, fill, inner, lw) => {
    const path = (c) => { c.beginPath(); for (let i = 0; i < bl.length; i += 3) { c.moveTo(bl[i] + bl[i + 2], bl[i + 1]); c.arc(bl[i], bl[i + 1], bl[i + 2], 0, TAU); } };
    path(c); c.lineWidth = (lw || LW) * 2; c.strokeStyle = OUT; c.stroke();
    c.save(); path(c); c.fillStyle = fill; c.fill();
    if (inner) { c.clip(); inner(c); }
    c.restore();
  };

  M.puff = (c) => {
    const col = MC('puff', '#f6f6ee');
    rope(c, (c) => { c.beginPath(); c.moveTo(25, 13); c.quadraticCurveTo(26, 8, 24, 5); }, '#6fae5a', 1.8);
    leaf(c, 25, 9, 10, 3.8, -0.35, '#8ad05a');
    blobs(c, [14.5, 28, 8.6, 25, 20.5, 9.6, 34.5, 27, 8.6, 20, 35, 8, 30.5, 36, 7.6], col, (c) => {
      dot(c, 31, 40, 14, A.shade(col, -0.13));
      c.strokeStyle = A.shade(col, -0.28); c.lineWidth = 1.4;
      c.beginPath(); c.arc(17, 29, 3.6, 0.2, 1.9); c.stroke(); c.beginPath(); c.arc(27.5, 23, 4, 0.3, 2); c.stroke(); c.beginPath(); c.arc(31, 33, 3, 0.2, 1.8); c.stroke();
    });
    dot(c, 20.5, 16.5, 1.6, '#ffffff'); dot(c, 11.5, 24.5, 1.2, '#ffffff');
  };
  M.leafling = (c) => {
    const col = MC('leafling', '#8ad05a');
    c.save(); c.translate(9, 41); c.rotate(-0.82);
    rope(c, (c) => { c.beginPath(); c.moveTo(-5, 0); c.lineTo(3, 0); }, '#5a9a3c', 2);
    shape(c, (c) => { c.beginPath(); c.moveTo(1, 0); c.quadraticCurveTo(18, -19.5, 43, 0); c.quadraticCurveTo(18, 19.5, 1, 0); c.closePath(); }, col, (c) => {
      c.fillStyle = A.shade(col, -0.16); c.beginPath(); c.moveTo(1, 0); c.lineTo(43, 0); c.quadraticCurveTo(18, 19.5, 1, 0); c.fill();
      c.strokeStyle = A.shade(col, -0.38); c.lineWidth = 1.5; c.beginPath(); c.moveTo(3, 0); c.lineTo(39, 0);
      for (const x of [11, 19, 27]) { c.moveTo(x, 0); c.lineTo(x + 6, -6.5); c.moveTo(x, 0); c.lineTo(x + 6, 6.5); }
      c.stroke();
    });
    c.restore();
    drop(c, 31, 16.5, 3.3); fs(c, '#c9eeff', 1.5); dot(c, 30, 16, 0.9, '#fff');
  };
  M.acorn = (c) => {
    const col = MC('acorn', '#b9783c');
    c.translate(24, 24); c.rotate(0.3); c.translate(-24, -24);
    shape(c, (c) => { c.beginPath(); c.moveTo(11.5, 21); c.quadraticCurveTo(11, 38, 24, 44.5); c.quadraticCurveTo(37, 38, 36.5, 21); c.closePath(); }, '#dba660', (c) => {
      c.fillStyle = col; c.beginPath(); c.ellipse(32, 35, 10, 15, 0, 0, TAU); c.fill();
      c.fillStyle = '#f6d9a4'; c.beginPath(); c.ellipse(17.5, 30, 2.1, 5, 0.15, 0, TAU); c.fill();
    });
    A.rr(c, 22.3, 3.6, 3.6, 7.6, 1.6); fs(c, WOOD_D, 1.9);
    shape(c, (c) => { c.beginPath(); c.moveTo(8.5, 22.5); c.quadraticCurveTo(8, 9.5, 24, 9.5); c.quadraticCurveTo(40, 9.5, 39.5, 22.5); c.quadraticCurveTo(24, 27, 8.5, 22.5); c.closePath(); }, '#8a5a34', (c) => {
      c.fillStyle = '#6f4526'; c.fillRect(27, 6, 16, 22);
      c.strokeStyle = '#573418'; c.lineWidth = 1.2; c.beginPath();
      for (let i = 0; i < 6; i++) { c.moveTo(7 + i * 6, 9); c.lineTo(13 + i * 6, 26); c.moveTo(13 + i * 6, 9); c.lineTo(7 + i * 6, 26); }
      c.stroke();
    });
  };
  M.bosspuff = (c) => {
    A.glow(c, 24, 24, 22, '#fff3b0', 0.6);
    leaf(c, 12, 32, 17, 6, -PI / 2 - 0.5, '#5fae52'); leaf(c, 36, 32, 17, 6, -PI / 2 + 0.5, '#5fae52');
    leaf(c, 18, 32, 21, 6.4, -PI / 2 - 0.2, '#7fc95a'); leaf(c, 30, 32, 21, 6.4, -PI / 2 + 0.2, '#7fc95a');
    leaf(c, 24, 32, 26, 7.6, -PI / 2, '#a6e06a');
    shape(c, (c) => A.rr(c, 7, 29.5, 34, 10.5, 4.6), GOLD, (c) => { c.fillStyle = GOLD_D; c.fillRect(6, 36, 36, 5); c.fillStyle = '#fff0b0'; c.fillRect(10, 31.4, 28, 1.6); });
    gem(c, 24, 34.8, 3.4, '#ff6a4a'); dot(c, 13.5, 34.8, 1.7, '#fff8e0'); dot(c, 34.5, 34.8, 1.7, '#fff8e0');
    spark(c, 38.5, 12, 3.2, '#fff');
  };
  M.mossback = (c) => {
    const col = MC('mossback', '#6fae5a');
    shape(c, (c) => A.poly(c, [7.5, 30.5, 13.5, 17.5, 27.5, 12.5, 40, 19.5, 41.5, 33, 30.5, 42.5, 14.5, 41]), '#a39078', (c) => {
      c.fillStyle = '#84735f'; A.poly(c, [25, 27, 44, 20, 44, 46, 18, 46]); c.fill();
      c.strokeStyle = '#5c5044'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(25, 28); c.lineTo(15.5, 40.5); c.moveTo(25, 28); c.lineTo(41, 32); c.moveTo(25, 28); c.lineTo(23, 14); c.stroke();
      c.fillStyle = '#c2b196'; c.beginPath(); c.ellipse(14.5, 30, 2, 3.6, 0.3, 0, TAU); c.fill();
    });
    blobs(c, [14, 19, 4.8, 20.5, 14.5, 5.6, 28.5, 13.5, 5.2, 35.5, 18.5, 4.8, 25.5, 19.5, 4.2], col, (c) => { dot(c, 31, 22, 9, A.shade(col, -0.2)); dot(c, 18.5, 12.5, 1.5, A.shade(col, 0.45)); }, 2.1);
    rope(c, (c) => { c.beginPath(); c.moveTo(29, 10); c.quadraticCurveTo(30, 6, 32.5, 4.5); }, '#5a9a3c', 1.5);
    dot(c, 33.5, 4.4, 2, '#ffd0e0');
  };
  M.hootling = (c) => {
    const col = MC('hootling', '#b98a5a');
    c.save(); c.translate(9.5, 41); c.rotate(-0.8);
    rope(c, (c) => { c.beginPath(); c.moveTo(-5, 0); c.lineTo(8, 0); }, '#f1e2b8', 1.8);
    shape(c, (c) => { c.beginPath(); c.moveTo(5, 0); c.bezierCurveTo(8, -10, 16, -12.5, 22, -11.5); c.lineTo(21.5, -7.5); c.lineTo(26, -11); c.bezierCurveTo(33, -9.5, 38, -5, 43.5, -1); c.bezierCurveTo(36, 7, 28, 11, 19, 11); c.lineTo(17, 7); c.lineTo(14.5, 10.5); c.bezierCurveTo(10, 9, 6.5, 5, 5, 0); c.closePath(); }, A.shade(col, 0.22), (c) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(5, 0); c.lineTo(44, -1); c.lineTo(44, 14); c.lineTo(5, 14); c.fill();
      c.fillStyle = A.shade(col, -0.34);
      for (const x of [16, 26, 35]) { c.beginPath(); c.moveTo(x, -13); c.lineTo(x + 3, -13); c.lineTo(x - 0.6, 13); c.lineTo(x - 3.6, 13); c.closePath(); c.fill(); }
      c.strokeStyle = A.shade(col, -0.2); c.lineWidth = 1; c.beginPath();
      for (let x = 9; x < 40; x += 4.5) { c.moveTo(x, 0); c.lineTo(x + 4, -8); c.moveTo(x, 0); c.lineTo(x + 4, 8); }
      c.stroke();
      c.strokeStyle = '#fff6e0'; c.lineWidth = 1.7; c.beginPath(); c.moveTo(6, 0); c.lineTo(41, -0.9); c.stroke();
    });
    c.restore();
    dot(c, 38.5, 36, 1.2, '#fff6e0'); dot(c, 41.5, 31.5, 0.9, '#fff6e0');
  };
  M.bramble = (c) => {
    const col = MC('bramble', '#4f9a4a');
    const th = [[13, 33, 6.5, 14.5, 23.5, 25.5], [24, 25.5, 27, 4.5, 35, 18.5], [19.5, 34.5, 36, 45, 31.5, 26.5]];
    for (const p of th) { A.poly(c, p); fs(c, '#f4e6b8', 2); }
    rope(c, (c) => { c.beginPath(); c.moveTo(6.5, 39.5); c.quadraticCurveTo(21, 31.5, 27, 23.5); c.quadraticCurveTo(33, 15.5, 42, 12.5); }, col, 5.8);
    c.strokeStyle = A.shade(col, 0.38); c.lineWidth = 1.5; c.beginPath(); c.moveTo(10, 36); c.quadraticCurveTo(20.5, 30, 25.5, 23); c.stroke();
    A.poly(c, [6.5, 14.5, 10.6, 20.2, 8.2, 21.4]); c.fillStyle = '#d9483a'; c.fill(); A.poly(c, [27, 4.5, 29.6, 9.6, 26.4, 10.2]); c.fill(); A.poly(c, [36, 45, 30.6, 42.6, 32.6, 40.2]); c.fill();
    leaf(c, 36, 14.5, 8.5, 3.4, 0.5, '#7fc95a');
  };
  M.stag = (c) => {
    const col = A.shade(MC('stag', '#5a4a7a'), 0.22);
    A.glow(c, 24, 24, 22, '#b9a0ff', 0.6);
    shape(c, (c) => { c.beginPath(); c.moveTo(9, 41.5); c.quadraticCurveTo(6, 16, 30, 6.5); c.quadraticCurveTo(38, 4.5, 41.5, 9.5); c.quadraticCurveTo(33, 11, 29.5, 16); c.lineTo(35.5, 17.5); c.quadraticCurveTo(28, 20, 25.5, 24.5); c.lineTo(31, 26.5); c.quadraticCurveTo(22.5, 30, 19.5, 41.5); c.closePath(); }, col, (c) => {
      c.fillStyle = A.shade(col, -0.28); c.beginPath(); c.moveTo(19, 44); c.quadraticCurveTo(21, 30, 31, 26); c.lineTo(36, 18); c.lineTo(42, 9); c.lineTo(46, 46); c.closePath(); c.fill();
      c.strokeStyle = A.shade(col, 0.5); c.lineWidth = 2.2; c.beginPath(); c.moveTo(12.5, 35); c.quadraticCurveTo(12, 20, 26, 11.5); c.stroke();
    });
    A.poly(c, [7.5, 40.5, 11.5, 37.5, 14.5, 41, 17.5, 38, 21, 41.5, 20, 44.6, 8.5, 44.6]); fs(c, A.shade(col, 0.24), 1.8);
    spark(c, 37.5, 23, 3.4, '#fff');
  };
  M.toad = (c) => {
    const col = MC('toad', '#3fa89a'), lt = A.shade(col, 0.5);
    shape(c, (c) => A.ell(c, 21.5, 27.5, 14.5, 14), lt, (c) => { dot(c, 27, 33, 13.5, col); dot(c, 31.5, 38.5, 9, A.shade(col, -0.22)); });
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2.4; c.beginPath(); c.arc(21.5, 27.5, 10.2, PI * 1.02, PI * 1.42); c.stroke();
    dot(c, 27.5, 19.5, 1.7, '#fff');
    A.ell(c, 38.5, 12.5, 5.4); fs(c, lt, 2); dot(c, 37, 11, 1.4, '#fff');
    A.ell(c, 40, 37, 3.6); fs(c, lt, 1.8); dot(c, 39.2, 36.2, 0.9, '#fff');
    A.ell(c, 8.5, 10.5, 2.6); fs(c, lt, 1.6);
  };
  M.glowmoth = (c) => {
    const col = MC('glowmoth', '#d8ff7a');
    A.glow(c, 24, 28, 22, col, 0.85);
    A.rr(c, 19.5, 8, 9, 6.6, 2.2); fs(c, '#b98a5a', 2);
    A.rr(c, 18.2, 13.2, 11.6, 4.6, 1.8); fs(c, '#e4f3ff', 1.9);
    shape(c, (c) => A.rr(c, 11.5, 17, 25, 26, 8.5), '#eefaff', (c) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(8, 34); c.quadraticCurveTo(17, 28, 24, 32); c.quadraticCurveTo(31, 36, 40, 30); c.lineTo(40, 46); c.lineTo(8, 46); c.closePath(); c.fill();
      c.fillStyle = A.shade(col, -0.24); c.beginPath(); c.ellipse(33, 43.5, 10, 5, 0, 0, TAU); c.fill();
      for (const [x, y] of [[16.5, 37], [22, 39.5], [28, 37.5], [31.5, 40.5]]) dot(c, x, y, 0.95, '#fff');
    });
    line(c, [15, 21.5, 15, 30], 'rgba(255,255,255,0.9)', 1.9);
    spark(c, 24.5, 25, 3.6, '#fff'); spark(c, 39, 12.5, 3.2, '#f4ffc0'); spark(c, 8, 24, 2.4, '#f4ffc0');
  };
  M.mudling = (c) => {
    const col = MC('mudling', '#7a5f4c');
    rope(c, (c) => { c.beginPath(); c.moveTo(30, 22); c.quadraticCurveTo(33, 13.5, 31, 6); }, '#6fae5a', 1.8);
    leaf(c, 32, 13.5, 9, 3.4, -0.45, '#8ad05a');
    shape(c, (c) => { c.beginPath(); c.moveTo(5.5, 38); c.quadraticCurveTo(5, 30.5, 12, 28.5); c.quadraticCurveTo(13, 17.5, 24, 17.5); c.quadraticCurveTo(35, 17.5, 36.5, 27.5); c.quadraticCurveTo(43.5, 29.5, 43, 38); c.quadraticCurveTo(24, 46.5, 5.5, 38); c.closePath(); }, A.shade(col, 0.14), (c) => {
      c.fillStyle = A.shade(col, -0.2); c.beginPath(); c.ellipse(33, 42, 17, 10.5, 0, 0, TAU); c.fill();
      c.fillStyle = A.shade(col, 0.48); c.beginPath(); c.ellipse(18.5, 24.5, 4, 2.4, -0.5, 0, TAU); c.fill();
      dot(c, 14.5, 35, 1.5, A.shade(col, -0.3)); dot(c, 27, 31, 1.2, A.shade(col, -0.3));
    });
    A.ell(c, 40.5, 23.5, 2.4); fs(c, A.shade(col, 0.14), 1.6);
  };
  M.lotus = (c) => {
    const col = MC('lotus', '#f08fc0');
    A.glow(c, 24, 24, 22, '#ffc0e0', 0.65);
    const petal = (x, y, len, wid, rot, fill) => {
      c.save(); c.translate(x, y); c.rotate(rot);
      shape(c, (c) => { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-wid, -len * 0.35, -wid * 0.85, -len * 0.8, 0, -len); c.bezierCurveTo(wid * 0.85, -len * 0.8, wid, -len * 0.35, 0, 0); c.closePath(); }, fill, (c) => {
        c.fillStyle = A.shade(fill, -0.14); c.fillRect(0, -len, wid + 2, len);
        c.strokeStyle = A.shade(fill, 0.55); c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -4); c.lineTo(0, -len + 6); c.stroke();
      }, 2.1);
      c.restore();
    };
    petal(24, 42.5, 27, 9, -0.8, A.shade(col, -0.1)); petal(24, 42.5, 27, 9, 0.8, A.shade(col, -0.1));
    petal(24, 43.5, 37, 11.5, 0, A.shade(col, 0.3));
    spark(c, 38, 11.5, 3.2, '#fff');
  };
  M.crybat = (c) => {
    const col = MC('crybat', '#8f7fe0');
    shape(c, (c) => { c.beginPath(); c.moveTo(7, 12); c.quadraticCurveTo(22, 5.5, 41.5, 10.5); c.quadraticCurveTo(43, 22, 39.5, 33); c.quadraticCurveTo(35.5, 28.5, 31.5, 34); c.quadraticCurveTo(28, 28.5, 23.5, 36); c.quadraticCurveTo(21, 29, 15, 38.5); c.quadraticCurveTo(13.5, 24, 7, 12); c.closePath(); }, A.shade(col, 0.3), (c) => {
      c.fillStyle = A.shade(col, 0.05); A.poly(c, [7.5, 12.5, 31.5, 34, 23.5, 36]); c.fill(); A.poly(c, [7.5, 12.5, 42, 9, 39.5, 33]); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(24, 12); c.lineTo(28, 19.5); c.lineTo(35, 13.5); c.stroke();
    });
    c.strokeStyle = A.shade(col, -0.5); c.lineWidth = 2.1; c.beginPath();
    for (const [x, y] of [[39.5, 33], [31.5, 34], [23.5, 36], [15, 38.5]]) { c.moveTo(7.5, 12.5); c.lineTo(x, y); }
    c.stroke();
    rope(c, (c) => { c.beginPath(); c.moveTo(7.5, 12.5); c.quadraticCurveTo(22, 6, 41.5, 10.5); }, A.shade(col, -0.3), 2.2);
    A.poly(c, [5, 14.5, 3.5, 6.5, 10.5, 10]); fs(c, '#f2ecff', 1.7);
    spark(c, 35, 18, 3.2, '#fff');
  };
  M.orecrab = (c) => {
    const col = MC('orecrab', '#7f8fb0');
    A.poly(c, [27, 4.5, 33.5, 12, 30, 24, 23, 22]); fs(c, '#8fe6ff', 2);
    A.poly(c, [12.5, 12, 19, 9.5, 22, 22, 15, 24]); fs(c, '#c79bff', 2);
    line(c, [27.5, 8, 26, 19], '#e8fbff', 1.3);
    shape(c, (c) => A.poly(c, [6.5, 33, 12.5, 22, 24, 19.5, 36.5, 22, 42, 32.5, 36.5, 42.5, 12, 43]), col, (c) => {
      c.fillStyle = A.shade(col, -0.24); A.poly(c, [24, 19, 38, 22, 44, 33, 37, 46, 22, 46, 28, 32]); c.fill();
      c.fillStyle = A.shade(col, 0.32); A.poly(c, [12.5, 22, 24, 19.5, 20, 26.5, 10.5, 29.5]); c.fill();
    });
    gem(c, 17.5, 35, 3.7, '#8fe6ff'); gem(c, 31.5, 31, 3.1, '#ffe08a');
    spark(c, 37, 11, 3.6, '#fff'); spark(c, 8.5, 17.5, 2.4, '#fff');
  };

  M.shade = (c) => {
    const col = MC('shade', '#6a5aa8');
    c.strokeStyle = A.rgba('#c9b8ff', 0.9); c.lineWidth = 1.7;
    for (const r of [13.5, 19]) { c.beginPath(); c.arc(24, 25, r, -0.55, 0.55); c.stroke(); c.beginPath(); c.arc(24, 25, r, PI - 0.55, PI + 0.55); c.stroke(); }
    shape(c, (c) => A.poly(c, [24, 4.5, 32, 20, 28.5, 43, 20.5, 43, 15.5, 22]), col, (c) => {
      c.fillStyle = A.shade(col, -0.3); A.poly(c, [24, 4, 34, 20, 29, 46, 24, 46]); c.fill();
      c.fillStyle = A.shade(col, 0.42); A.poly(c, [24, 4.5, 15.5, 22, 21.5, 24.5]); c.fill();
    });
    A.glow(c, 23.5, 27, 8, '#d8ccff', 0.8); dot(c, 23.5, 27, 1.9, '#f0eaff');
    spark(c, 20.5, 13.5, 2.6, '#fff');
  };
  M.golem = (c) => {
    const col = MC('golem', '#7fe0ff');
    A.glow(c, 24, 24, 23, col, 0.9);
    const pts = [24, 5.5, 37, 12.5, 41.5, 26, 33, 40.5, 18, 42.5, 7.5, 30, 10.5, 14.5];
    shape(c, (c) => A.poly(c, pts), col, (c) => {
      c.fillStyle = A.shade(col, -0.26); A.poly(c, [24, 24, 41.5, 26, 33, 40.5, 18, 42.5]); c.fill();
      c.fillStyle = A.shade(col, 0.55); A.poly(c, [24, 5.5, 10.5, 14.5, 24, 24]); c.fill();
      c.fillStyle = A.shade(col, 0.22); A.poly(c, [24, 5.5, 37, 12.5, 24, 24]); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.1; c.beginPath();
      for (let i = 0; i < pts.length; i += 2) { c.moveTo(24, 24); c.lineTo(pts[i], pts[i + 1]); }
      c.stroke();
    });
    A.glow(c, 24, 24, 11, '#ffffff', 0.95); dot(c, 24, 24, 3.2, '#ffffff');
    spark(c, 36.5, 8.5, 3.4, '#fff');
  };
  M.skink = (c) => {
    const col = MC('skink', '#e0a868');
    const sc = (x, y, s, f) => shape(c, (c) => { c.beginPath(); c.moveTo(x - 8.5 * s, y - 7 * s); c.quadraticCurveTo(x, y - 10 * s, x + 8.5 * s, y - 7 * s); c.bezierCurveTo(x + 9.5 * s, y + 5 * s, x + 4 * s, y + 10 * s, x, y + 10.5 * s); c.bezierCurveTo(x - 4 * s, y + 10 * s, x - 9.5 * s, y + 5 * s, x - 8.5 * s, y - 7 * s); c.closePath(); }, f, (c) => {
      c.fillStyle = A.shade(f, -0.16); c.beginPath(); c.ellipse(x + 4 * s, y + 6 * s, 9 * s, 8 * s, 0, 0, TAU); c.fill();
      c.strokeStyle = A.shade(f, 0.55); c.lineWidth = 1.6; c.beginPath(); c.arc(x, y + 1 * s, 6.4 * s, PI * 1.1, PI * 1.5); c.stroke();
    }, 2);
    const lt = A.shade(col, 0.22);
    sc(24, 14, 0.82, A.shade(col, -0.12)); sc(11.5, 15.5, 0.82, A.shade(col, -0.12)); sc(36.5, 15.5, 0.82, A.shade(col, -0.12));
    sc(17.5, 25.5, 0.9, col); sc(30.5, 25.5, 0.9, col);
    sc(24, 35, 0.95, lt);
    spark(c, 39.5, 37, 2.6, '#fff');
  };
  M.cactus = (c) => {
    const col = MC('cactus', '#5fb06a');
    shape(c, (c) => A.rr(c, 14, 28.5, 20, 17, [9, 9, 4, 4]), col, (c) => {
      c.fillStyle = A.shade(col, -0.22); c.fillRect(25.5, 26, 12, 22);
      c.strokeStyle = A.shade(col, -0.4); c.lineWidth = 1.2; c.beginPath(); c.moveTo(20, 33); c.lineTo(20, 46); c.moveTo(28, 33); c.lineTo(28, 46); c.stroke();
    });
    c.strokeStyle = '#f6f1e2'; c.lineWidth = 1.4; c.beginPath();
    for (const [x, y, dx, dy] of [[14, 35, -3.4, -1.6], [14, 41, -3.4, 1], [34, 35, 3.4, -1.6], [34, 41, 3.4, 1]]) { c.moveTo(x, y); c.lineTo(x + dx, y + dy); }
    c.stroke();
    for (let i = 0; i < 5; i++) { const a = -PI / 2 + (i * TAU) / 5; A.ell(c, 24 + Math.cos(a) * 7.8, 18.5 + Math.sin(a) * 7.8, 6.6, 4.8, a); fs(c, i % 2 ? '#ff7fae' : '#ff9cc2', 2); }
    A.ell(c, 24, 18.5, 4.6); fs(c, '#ffd84a', 1.8); dot(c, 22.9, 17.4, 1.3, '#fff6c0');
  };
  M.dustdevil = (c) => {
    const col = MC('dustdevil', '#e8cf9a');
    line(c, [4.5, 15, 10, 13.5], '#fff6dc', 1.8); line(c, [38.5, 39.5, 44, 38], '#fff6dc', 1.8); line(c, [5.5, 34, 9, 33], '#fff6dc', 1.5);
    shape(c, (c) => A.ell(c, 24, 25, 16), A.shade(col, 0.5), (c) => {
      dot(c, 29, 31, 15.5, A.shade(col, 0.12)); dot(c, 34, 38, 10, A.shade(col, -0.18));
      // tornado funnel inside the marble: stacked wind bands, wide at the top
      const bands = [[15.5, 10.5, 2.6, 2.5], [20.5, 8.4, 2.3, 0.5], [25.2, 6.2, 2, -1.5], [29.6, 4.4, 1.8, -0.5], [33.6, 2.8, 1.5, 1], [37, 1.4, 1.1, 2.2]];
      for (const [y, rx, ry, dx] of bands) {
        c.beginPath(); c.ellipse(24 + dx, y, rx, ry, -0.1, PI * 0.08, PI * 1.72); c.lineWidth = 4.4; c.strokeStyle = '#6f7fa8'; c.stroke();
        c.lineWidth = 2.4; c.strokeStyle = '#ffffff'; c.stroke();
      }
      dot(c, 12.5, 30.5, 1.1, '#fff'); dot(c, 35.5, 21, 1.2, '#fff'); dot(c, 15, 36.5, 0.9, '#fff');
    });
    c.strokeStyle = 'rgba(255,255,255,0.98)'; c.lineWidth = 2.2; c.beginPath(); c.arc(24, 25, 12.8, PI * 1.02, PI * 1.3); c.stroke();
    dot(c, 34, 15.5, 1.4, '#fff');
  };
  M.scorpion = (c) => {
    const col = MC('scorpion', '#b8503c');
    A.glow(c, 27, 22, 20, '#c8ff6a', 0.5);
    shape(c, (c) => { c.beginPath(); c.moveTo(20, 23); c.quadraticCurveTo(26, 5.5, 39.5, 11.5); c.quadraticCurveTo(42.5, 14, 41, 21); c.quadraticCurveTo(36, 13.5, 29.5, 18.5); c.quadraticCurveTo(27, 22, 27.5, 28); c.closePath(); }, A.shade(col, 0.16), (c) => {
      c.fillStyle = '#4a1f24'; A.poly(c, [36, 9, 44, 12, 42, 23, 37, 15]); c.fill();
      c.strokeStyle = A.shade(col, 0.5); c.lineWidth = 1.7; c.beginPath(); c.moveTo(23.5, 20); c.quadraticCurveTo(28, 10.5, 35, 11.5); c.stroke();
    });
    shape(c, (c) => A.ell(c, 17.5, 32, 11.8, 10.6, -0.4), col, (c) => {
      dot(c, 22.5, 37.5, 10.5, A.shade(col, -0.25));
      c.fillStyle = A.shade(col, 0.45); c.beginPath(); c.ellipse(12.5, 27, 3.6, 2.2, -0.7, 0, TAU); c.fill();
      c.strokeStyle = A.shade(col, -0.45); c.lineWidth = 1.4; c.beginPath(); c.arc(4, 44, 17, -1.25, -0.2); c.stroke(); c.beginPath(); c.arc(1, 47, 26, -1.2, -0.35); c.stroke();
    });
    drop(c, 40.5, 28.5, 3.5); fs(c, '#b6f24a', 1.7); dot(c, 39.5, 28, 1, '#fff');
  };
  M.snowimp = (c) => {
    A.glow(c, 24, 24, 22, '#c9f0ff', 0.65);
    snow(c, 24, 24, 18, '#f4fbff', 2.8);
    A.star(c, 24, 24, 5.6, 4.8, 6, PI / 6); fs(c, '#a8dcf6', 1.8);
    dot(c, 23, 23, 1.3, '#fff');
    spark(c, 39, 9, 3.2, '#fff');
  };
  M.ram = (c) => {
    const col = '#c6e9fb';
    A.glow(c, 24, 24, 21, '#c9f0ff', 0.35);
    shape(c, (c) => {
      c.beginPath(); c.moveTo(7.5, 38.5); c.bezierCurveTo(1.5, 14, 30, 1.5, 40.5, 15.5); c.bezierCurveTo(47.5, 28, 34.5, 40.5, 25, 34.5);
      c.bezierCurveTo(18.5, 30, 24, 20.5, 30.5, 23.5); c.bezierCurveTo(27, 26, 28.5, 29.8, 31.2, 29.2); c.bezierCurveTo(37.5, 27, 35.5, 15.2, 26.5, 15.2);
      c.bezierCurveTo(16, 15.2, 16.5, 30, 18.8, 42); c.closePath();
    }, col, (c) => {
      c.fillStyle = '#8fc4e8'; c.beginPath(); c.moveTo(12, 40); c.bezierCurveTo(8, 22, 26, 8, 37, 16); c.bezierCurveTo(44, 24, 38, 36, 28, 35); c.lineTo(46, 46); c.lineTo(8, 46); c.closePath(); c.fill();
      c.strokeStyle = '#5f9ac8'; c.lineWidth = 1.4; c.beginPath();
      for (const [x1, y1, x2, y2] of [[6.5, 31, 16.5, 31], [7, 23, 16.5, 24.5], [12, 14.5, 19, 19.5], [21, 8, 23.5, 15.5], [31.5, 7, 30, 15.5], [39.5, 14, 34.5, 19], [42.5, 24, 36.5, 24.5], [38, 34, 34, 28.5]]) { c.moveTo(x1, y1); c.lineTo(x2, y2); }
      c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.moveTo(8.5, 27); c.bezierCurveTo(8, 17, 16, 9.5, 25, 8); c.stroke();
    });
    spark(c, 40, 39.5, 3, '#fff');
  };
  M.wraith = (c) => {
    const col = MC('wraith', '#a8dcf6');
    shape(c, (c) => { c.beginPath(); c.moveTo(9, 8.5); c.quadraticCurveTo(24, 12.5, 39.5, 7.5); c.quadraticCurveTo(37, 22, 41.5, 33); c.lineTo(36.5, 42); c.lineTo(32.5, 34.5); c.lineTo(28, 44); c.lineTo(23, 35); c.lineTo(18, 43); c.lineTo(14.5, 33.5); c.lineTo(8, 39.5); c.quadraticCurveTo(12, 22, 9, 8.5); c.closePath(); }, col, (c) => {
      c.fillStyle = A.shade(col, -0.2); c.beginPath(); c.moveTo(27, 6); c.quadraticCurveTo(25, 26, 29, 46); c.lineTo(46, 46); c.lineTo(46, 6); c.closePath(); c.fill();
      c.strokeStyle = A.shade(col, -0.4); c.lineWidth = 1.3; c.beginPath(); c.moveTo(17, 12); c.quadraticCurveTo(15.5, 24, 17.5, 33); c.moveTo(33.5, 11.5); c.quadraticCurveTo(32, 22, 34.5, 32); c.stroke();
      c.fillStyle = '#eefaff'; c.beginPath(); c.moveTo(8, 8); c.quadraticCurveTo(24, 12.5, 40, 7); c.lineTo(40, 12); c.quadraticCurveTo(24, 17, 9, 13); c.closePath(); c.fill();
    });
    snow(c, 23.5, 25, 5.2, '#ffffff', 1.3);
    spark(c, 37.5, 22, 2.6, '#fff'); spark(c, 12.5, 29, 2.2, '#fff');
  };
  M.yeti = (c) => {
    A.glow(c, 24, 23, 22, '#c9f0ff', 0.65);
    shape(c, (c) => { c.beginPath(); c.moveTo(10.5, 30.5); c.quadraticCurveTo(12, 9, 39, 4.5); c.quadraticCurveTo(32, 16, 31.5, 26); c.quadraticCurveTo(31, 35, 25.5, 41); c.closePath(); }, '#dcf3ff', (c) => {
      c.fillStyle = '#9fd2f2'; c.beginPath(); c.moveTo(39, 4.5); c.quadraticCurveTo(24, 18, 20, 38); c.lineTo(30, 46); c.lineTo(42, 20); c.closePath(); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 2.1; c.beginPath(); c.moveTo(15, 26); c.quadraticCurveTo(17, 15, 28, 10); c.stroke();
    });
    blobs(c, [11, 33.5, 4.8, 16.5, 38, 5.2, 23, 41.5, 5, 28.5, 40.5, 4.2], '#ffffff', (c) => { dot(c, 24, 46, 9, '#dbe6f4'); }, 2);
    spark(c, 40, 18.5, 3.2, '#fff');
  };
  M.gsoldier = (c) => {
    const col = A.shade(MC('gsoldier', '#5a4a7a'), 0.2);
    shape(c, (c) => A.poly(c, [10, 9.5, 31, 6.5, 41, 17.5, 36.5, 30, 40, 38, 27.5, 42.5, 20.5, 36, 9.5, 37.5, 7, 22]), col, (c) => {
      c.fillStyle = A.shade(col, -0.27); A.poly(c, [26, 6, 43, 17, 37, 30, 42, 40, 27, 46, 24, 24]); c.fill();
      c.strokeStyle = '#9486b8'; c.lineWidth = 2.8; c.beginPath(); c.moveTo(8, 16); c.lineTo(40, 12.5); c.stroke();
      c.strokeStyle = A.shade(col, 0.45); c.lineWidth = 2; c.beginPath(); c.moveTo(11.5, 20.5); c.lineTo(10.5, 31); c.stroke();
    });
    A.glow(c, 24.5, 27, 10, '#b06aff', 0.8);
    line(c, [22, 19.5, 26, 25, 22.5, 29, 27, 36], '#e2bfff', 2);
    dot(c, 14.5, 12.4, 1.5, '#d5ccec'); dot(c, 33.5, 10.6, 1.5, '#d5ccec');
  };
  M.ghexer = (c) => {
    c.strokeStyle = 'rgba(205,195,230,0.95)'; c.lineWidth = 2.3; c.beginPath(); c.moveTo(24, 16); c.bezierCurveTo(17.5, 11.5, 30.5, 9, 24.5, 3); c.stroke();
    c.lineWidth = 1.6; c.beginPath(); c.moveTo(30, 13.5); c.bezierCurveTo(33.5, 10.5, 29, 8, 32.5, 4.5); c.stroke();
    rope(c, (c) => { c.beginPath(); c.moveTo(24, 33); c.quadraticCurveTo(21.5, 25.5, 24.5, 19.5); }, '#eadfbe', 3.6);
    line(c, [22.2, 29.5, 24.6, 28], '#b9a67c', 1.2); line(c, [22, 25.5, 24.6, 24], '#b9a67c', 1.2);
    A.ell(c, 24.8, 18.5, 2.8, 3.2); fs(c, '#3a2f42', 1.6); A.glow(c, 24.8, 18.5, 6, '#b06aff', 0.8); dot(c, 24.8, 19, 1, '#d9a8ff');
    shape(c, (c) => A.poly(c, [13.5, 31, 34.5, 31, 31.5, 43, 16.5, 43]), '#c9a24a', (c) => { c.fillStyle = '#9a7630'; c.fillRect(25, 30, 12, 15); c.fillStyle = '#ecd28a'; c.fillRect(17, 34, 1.8, 6); });
    A.rr(c, 11.5, 28.6, 25, 4.8, 2.1); fs(c, '#e0bd62', 2);
  };
  M.gargoyle = (c) => {
    const col = MC('gargoyle', '#8a8098');
    shape(c, (c) => { c.beginPath(); c.moveTo(8.5, 39.5); c.quadraticCurveTo(7, 15, 30, 6.5); c.quadraticCurveTo(38, 5, 41.5, 10); c.lineTo(35.5, 14.5); c.lineTo(40.5, 19.5); c.lineTo(33.5, 22.5); c.lineTo(37.5, 28.5); c.lineTo(29.5, 30); c.lineTo(31.5, 36.5); c.lineTo(22.5, 36); c.lineTo(21.5, 42.5); c.closePath(); }, col, (c) => {
      c.fillStyle = A.shade(col, -0.22); c.beginPath(); c.moveTo(8.5, 40); c.lineTo(41.5, 10); c.lineTo(46, 46); c.closePath(); c.fill();
      c.strokeStyle = A.shade(col, -0.45); c.lineWidth = 1.4; c.beginPath(); c.moveTo(13, 33); c.lineTo(35.5, 14.5); c.moveTo(14.5, 35.5); c.lineTo(33.5, 22.5); c.moveTo(16.5, 37.5); c.lineTo(29.5, 30); c.stroke();
      c.strokeStyle = A.shade(col, 0.45); c.lineWidth = 2; c.beginPath(); c.moveTo(11.5, 30); c.quadraticCurveTo(12.5, 18, 26, 10.5); c.stroke();
    });
    line(c, [17, 19.5, 20.5, 23, 18.5, 26.5], A.shade(col, -0.55), 1.4);
    A.poly(c, [36, 36.5, 41.5, 38.5, 38, 43]); fs(c, col, 1.7); A.poly(c, [6, 9, 10, 7.5, 9.5, 12]); fs(c, col, 1.5);
  };
  M.nox = (c) => {
    const col = '#66529a';
    A.glow(c, 24, 25, 23, '#b06aff', 0.8);
    shape(c, (c) => A.poly(c, [7.5, 37.5, 6, 13.5, 14.5, 24.5, 19.5, 8.5, 24.5, 18.5, 27, 16, 31.5, 25.5, 41.5, 11, 40.5, 37.5]), col, (c) => {
      c.fillStyle = A.shade(col, -0.32); c.fillRect(25.5, 4, 20, 36);
      c.strokeStyle = A.shade(col, 0.42); c.lineWidth = 2; c.beginPath(); c.moveTo(9.4, 21); c.lineTo(10, 32); c.stroke();
    });
    line(c, [26, 17.5, 23.5, 23, 27, 28, 24.5, 33], '#e6c8ff', 1.7);
    shape(c, (c) => A.rr(c, 6.2, 33, 35.6, 8.2, 2.8), '#6f5f9c', (c) => { c.fillStyle = '#54467c'; c.fillRect(6, 37.5, 36, 4); });
    gem(c, 24, 37, 3.3, '#d08aff'); dot(c, 13.5, 37, 1.8, '#ff7a3a'); dot(c, 34.5, 37, 1.8, '#ff7a3a');
    dot(c, 6.4, 13.6, 2.1, '#d08aff'); dot(c, 41.4, 11.2, 2.1, '#d08aff');
    spark(c, 37, 22, 2.8, '#fff');
  };

  for (const k in M) R['m_' + k] = M[k];

  // ------------------------------------------------------------ skill tiles (sk_<skillId>)
  const FAMC = {
    novice: ['#ffc85a', '#de7426', '#7a3210'],
    blade: ['#ff8a3c', '#cc2a30', '#5a0f1e'],
    star: ['#7f82ff', '#3d2da0', '#16104c'],
    gale: ['#62e29c', '#1f8c7a', '#0a3c3c'],
  };
  function tile(c, fam, passive) {
    const k = FAMC[fam] || FAMC.novice;
    const g = c.createLinearGradient(6, 4, 42, 44); g.addColorStop(0, k[0]); g.addColorStop(0.55, k[1]); g.addColorStop(1, k[2]);
    A.rr(c, 3.2, 3.2, 41.6, 41.6, 9); c.fillStyle = g; c.fill();
    const rg = c.createRadialGradient(22, 20, 2, 24, 24, 27); rg.addColorStop(0, 'rgba(255,255,255,0.26)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = rg; c.fill();
    c.save(); A.rr(c, 3.2, 3.2, 41.6, 41.6, 9); c.clip();
    if (passive) {
      A.ell(c, 24, 24, 15.6); c.fillStyle = 'rgba(22,10,44,0.5)'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = '#ffe08a'; c.stroke();
      A.ell(c, 24, 24, 12.8); c.lineWidth = 1; c.strokeStyle = 'rgba(255,224,138,0.45)'; c.stroke();
      for (const [x, y] of [[8.5, 8.5], [39.5, 8.5], [8.5, 39.5], [39.5, 39.5]]) { A.poly(c, [x, y - 2.4, x + 2.4, y, x, y + 2.4, x - 2.4, y]); c.fillStyle = '#ffe08a'; c.fill(); }
    }
  }
  function tileEnd(c) {
    c.restore();
    A.rr(c, 4.7, 4.7, 38.6, 38.6, 7.6); c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,255,255,0.3)'; c.stroke();
    A.rr(c, 3.2, 3.2, 41.6, 41.6, 9); c.lineWidth = 2.4; c.strokeStyle = OUT; c.stroke();
  }
  const skill = (id, fam, passive, draw) => { R['sk_' + id] = (c) => { tile(c, fam, passive); draw(c); tileEnd(c); }; };
  // outlined arrow from (x1,y1) to its tip (x2,y2)
  const arrow = (c, x1, y1, x2, y2, col, w, head, feather) => {
    const a = Math.atan2(y2 - y1, x2 - x1), h = head || 6, ex = x2 - Math.cos(a) * h * 0.6, ey = y2 - Math.sin(a) * h * 0.6;
    w = w || 2.2;
    line(c, [x1, y1, ex, ey], OUT, w + 2.6); line(c, [x1, y1, ex, ey], col, w);
    c.save(); c.translate(x2, y2); c.rotate(a); A.poly(c, [0, 0, -h, -h * 0.62, -h * 0.7, 0, -h, h * 0.62]); fs(c, col, 1.7); c.restore();
    if (feather) { c.save(); c.translate(x1, y1); c.rotate(a); A.poly(c, [2, 0, -1.5, -3.3, -5, -3.3, -2, 0, -5, 3.3, -1.5, 3.3]); fs(c, feather, 1.4); c.restore(); }
  };
  // teardrop flame with a bright core; base center (x,y), s ≈ half width
  const flame = (c, x, y, s, c1, c2) => {
    const p = (k, dy) => {
      const Y = y + dy;
      c.beginPath(); c.moveTo(x + 0.15 * s * k, Y - 2.5 * s * k);
      c.bezierCurveTo(x + 1.3 * s * k, Y - 1.3 * s * k, x + 1.2 * s * k, Y - 0.5 * s * k, x + 0.95 * s * k, Y - 0.1 * s * k);
      c.bezierCurveTo(x + 0.75 * s * k, Y + 0.75 * s * k, x - 0.75 * s * k, Y + 0.75 * s * k, x - 0.95 * s * k, Y - 0.1 * s * k);
      c.bezierCurveTo(x - 1.25 * s * k, Y - 0.9 * s * k, x - 0.5 * s * k, Y - 1.1 * s * k, x + 0.15 * s * k, Y - 2.5 * s * k); c.closePath();
    };
    p(1, 0); fs(c, c1 || '#ffb03a', 1.8);
    p(0.55, s * 0.12); c.fillStyle = c2 || '#fff3b0'; c.fill();
  };
  const miniSword = (c, x, y, rot, len, col) => {
    c.save(); c.translate(x, y); c.rotate(rot);
    A.rr(c, -1.5, 5, 3, 6.6, 1.3); fs(c, WOOD_D, 1.5);
    A.poly(c, [-2.5, 3.6, -2.5, -len + 4, 0, -len, 2.5, -len + 4, 2.5, 3.6]); fs(c, col || '#f4f8ff', 1.6);
    A.rr(c, -4.8, 3, 9.6, 3.1, 1.4); fs(c, GOLD, 1.5);
    c.restore();
  };

  skill('n_smash', 'novice', false, (c) => {
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2.6; c.beginPath(); c.arc(31, 37, 25, PI * 1.07, PI * 1.5); c.stroke();
    A.star(c, 15, 35, 12.5, 5.2, 8, 0.3); fs(c, '#fff3b0', 1.8);
    A.star(c, 15, 35, 6.6, 3, 8, 0.7); c.fillStyle = '#ffffff'; c.fill();
    rope(c, (c) => { c.beginPath(); c.moveTo(41, 8); c.lineTo(22, 28.5); }, '#8a5a3a', 3);
    c.save(); c.translate(19.5, 30.5); c.rotate(0.75);
    A.rr(c, -5.2, -5.6, 10.4, 11.4, 2.6); fs(c, '#ffe9a0', 1.9); A.rr(c, -6, -7.6, 12, 3.3, 1.3); fs(c, WOOD_D, 1.6);
    drop(c, 0, 0.9, 2.3); c.fillStyle = '#ff9a2e'; c.fill();
    c.restore();
  });
  skill('b_cleave', 'blade', false, (c) => {
    A.poly(c, [5.5, 40.5, 15, 41.5, 17, 46, 24, 40.5, 29.5, 44.5, 32.5, 36.5, 39.5, 38, 38.5, 29.5, 45, 27, 40.5, 20, 45.5, 13.5, 40, 4.5, 33, 24, 22, 33.5]); fs(c, '#ffb03a', 1.9);
    c.beginPath(); c.moveTo(7.5, 39); c.quadraticCurveTo(38, 39.5, 40, 7); c.quadraticCurveTo(31.5, 30.5, 7.5, 39); c.closePath(); fs(c, '#fff6c8', 1.8);
    spark(c, 13, 14, 3.6, '#fff'); dot(c, 21, 9, 1.2, '#ffe08a');
  });
  skill('b_rush', 'blade', false, (c) => {
    line(c, [4, 13.5, 21, 13.5], '#ffe08a', 2.4); line(c, [3, 34.5, 19, 34.5], '#ffe08a', 2.4);
    c.beginPath(); c.moveTo(3.5, 24); c.quadraticCurveTo(13, 14, 27, 17); c.lineTo(27, 31); c.quadraticCurveTo(13, 34, 3.5, 24); c.closePath(); fs(c, '#ffb03a', 1.8);
    c.beginPath(); c.moveTo(9, 24); c.quadraticCurveTo(15, 19, 24, 20.5); c.lineTo(24, 27.5); c.quadraticCurveTo(15, 29, 9, 24); c.closePath(); c.fillStyle = '#fff3b0'; c.fill();
    A.rr(c, 13, 22, 7, 4, 1.5); fs(c, WOOD_D, 1.6);
    A.poly(c, [22.5, 19.8, 37, 19.8, 44, 24, 37, 28.2, 22.5, 28.2]); fs(c, '#f4f8ff', 1.9);
    line(c, [24.5, 22.2, 37, 22.2], '#ffffff', 1.2); line(c, [24.5, 26, 37.5, 26], '#b3c2d8', 1.3);
    A.rr(c, 19, 16.5, 4.2, 15, 1.9); fs(c, GOLD, 1.7);
  });
  skill('b_quake', 'blade', false, (c) => {
    for (const s of [-1, 1]) {
      rope(c, (c) => { c.beginPath(); c.arc(24, 34, 21, s < 0 ? PI * 1.08 : PI * 1.6, s < 0 ? PI * 1.4 : PI * 1.92); }, '#ffb03a', 2.3);
      rope(c, (c) => { c.beginPath(); c.arc(24, 34, 14, s < 0 ? PI * 1.06 : PI * 1.58, s < 0 ? PI * 1.42 : PI * 1.94); }, '#fff3b0', 2.5);
    }
    A.poly(c, [0, 33.5, 14.5, 31.5, 21, 34.5, 27, 31, 33.5, 34, 48, 32, 48, 48, 0, 48]); fs(c, '#5a2a22', 1.9);
    A.poly(c, [24, 30.5, 20, 36, 25.5, 38.5, 21.5, 46, 27.5, 46, 30, 38.5, 25.5, 36, 28.5, 31]); fs(c, '#ffe45a', 1.5);
    A.star(c, 24, 27, 9, 3.6, 6, -PI / 2); fs(c, '#ffffff', 1.7);
    A.poly(c, [8.5, 11.5, 13, 9.5, 14.5, 14, 10, 15.5]); fs(c, '#8a4a3a', 1.5); A.poly(c, [35, 9, 39.5, 10.5, 38, 15, 34, 13.5]); fs(c, '#8a4a3a', 1.5);
  });
  skill('b_body', 'blade', true, (c) => {
    shape(c, (c) => { c.beginPath(); c.moveTo(24, 11); c.quadraticCurveTo(30, 14.8, 35.4, 14.2); c.quadraticCurveTo(36.4, 30.5, 24, 37.5); c.quadraticCurveTo(11.6, 30.5, 12.6, 14.2); c.quadraticCurveTo(18, 14.8, 24, 11); c.closePath(); }, '#f1f4fa', (c) => { c.fillStyle = '#b6c3d8'; c.fillRect(24, 8, 14, 32); }, 2);
    heart(c, 24, 24.4, 5.6); fs(c, '#ff5a5a', 1.7); dot(c, 21.6, 22.4, 1.2, '#ffd6d6');
  });
  skill('b_whirl', 'blade', false, (c) => {
    for (let i = 0; i < 3; i++) {
      c.save(); c.translate(24, 24); c.rotate((i * TAU) / 3 + 0.35);
      c.beginPath(); c.moveTo(2, -4.5); c.bezierCurveTo(9, -19, 24, -12, 20, 5); c.bezierCurveTo(18, -4.5, 10.5, -6.5, 5.5, 1.5); c.closePath(); fs(c, i === 1 ? '#fff3b0' : '#ffb03a', 1.8);
      c.restore();
    }
    A.ell(c, 24, 24, 4.4); fs(c, '#ffffff', 1.7);
  });
  skill('b_roar', 'blade', false, (c) => {
    flame(c, 24, 34, 8.6, '#ffb03a', '#fff3b0');
    for (const s of [-1, 1]) { const x = 24 + s * 15; A.poly(c, [x, 11.5, x + 5.4, 18.5, x + 2.2, 18.5, x + 2.2, 27, x - 2.2, 27, x - 2.2, 18.5, x - 5.4, 18.5]); fs(c, '#ffffff', 1.7); }
    line(c, [6, 31.5, 12, 31.5], '#ffe08a', 2); line(c, [36, 31.5, 42, 31.5], '#ffe08a', 2);
  });
  skill('b_mastery', 'blade', true, (c) => {
    miniSword(c, 24, 26.5, -PI / 4, 18); miniSword(c, 24, 26.5, PI / 4, 18);
    A.star(c, 24, 13, 3.8, 1.6, 4, 0); fs(c, '#ffe45a', 1.3);
  });
  skill('b_sun', 'blade', false, (c) => {
    A.poly(c, [25.5, 15.5, 41, 0, 48, 0, 48, 9, 33, 24]); fs(c, '#ffb03a', 1.8);
    A.poly(c, [28.5, 17.5, 43.5, 2.5, 46.5, 5.5, 31.5, 20.5]); c.fillStyle = '#fff3b0'; c.fill();
    A.star(c, 20, 25.5, 15, 10.2, 10, 0.2); fs(c, '#ffe45a', 1.8);
    A.ell(c, 20, 25.5, 7.8); fs(c, '#ffffff', 1.6);
    line(c, [5.5, 42, 42.5, 42], OUT, 4.4); line(c, [5.5, 42, 42.5, 42], '#ffe45a', 2.1);
  });
  skill('b_ember', 'blade', true, (c) => {
    flame(c, 24, 18.5, 3.8, '#ffe45a', '#ffffff');
    heart(c, 24, 27.5, 8.4); fs(c, '#ff7a3a', 1.9);
    heart(c, 24, 28.6, 4.3); c.fillStyle = '#ffe08a'; c.fill();
  });

  // --- star
  const shootStar = (c, x, y, r, len, a, col) => {
    c.save(); c.translate(x, y); c.rotate(a);
    A.poly(c, [-len, 0, -1, -r * 0.62, -1, r * 0.62]); fs(c, '#9fe4ff', 1.5);
    A.poly(c, [-len * 0.7, 0, -1, -r * 0.28, -1, r * 0.28]); c.fillStyle = '#ffffff'; c.fill();
    A.star(c, 0, 0, r, r * 0.45, 5, -PI / 2 - a); fs(c, col || '#fff3b0', 1.7);
    c.restore();
  };
  skill('s_bolt', 'star', false, (c) => {
    shootStar(c, 36, 10.5, 6.2, 24, -0.55); shootStar(c, 29, 23.5, 5.6, 22, -0.55, '#ffffff'); shootStar(c, 37.5, 36, 5.4, 22, -0.55);
  });
  skill('s_blink', 'star', false, (c) => {
    A.star(c, 12.5, 33.5, 6.8, 3, 5); c.fillStyle = 'rgba(159,228,255,0.35)'; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(210,244,255,0.95)'; c.setLineDash([2.2, 2]); c.stroke(); c.setLineDash([]);
    for (let i = 1; i <= 5; i++) { const t = i / 6; dot(c, 12.5 + 22.5 * t, 33.5 - 17.5 * t - Math.sin(t * PI) * 10, 1.2 + t * 1.1, '#ffffff'); }
    A.glow(c, 35, 16, 13, '#9fe4ff', 0.85);
    A.star(c, 35, 16, 9.4, 4.1, 5); fs(c, '#fff3b0', 1.8);
    spark(c, 24, 39.5, 2.4, '#9fe4ff'); spark(c, 9.5, 14, 2.2, '#ffffff');
  });
  skill('s_nova', 'star', false, (c) => {
    for (let i = 0; i < 8; i++) { c.save(); c.translate(24, 24); c.rotate((i * PI) / 4); A.poly(c, [-3.2, -12.5, 0, -21, 3.2, -12.5]); fs(c, '#e6f8ff', 1.6); c.restore(); }
    rope(c, (c) => { c.beginPath(); c.arc(24, 24, 11.6, 0, TAU); }, '#8fe6ff', 3.4);
    snow(c, 24, 24, 6.6, '#ffffff', 1.5);
  });
  skill('s_mind', 'star', true, (c) => {
    drop(c, 24, 25.5, 9.8); fs(c, '#6fc8ff', 1.9);
    c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.arc(24, 28.4, 4.8, PI * 0.15, PI * 1.55); c.stroke();
    c.beginPath(); c.arc(25.2, 27.2, 1.7, PI * 1.1, PI * 2.6); c.stroke();
    dot(c, 21, 20.6, 1.3, '#fff');
  });
  const meteor = (c, x, y, r) => {
    A.poly(c, [x - r * 0.35, y - r * 0.95, x + r * 3.3, y - r * 3.5, x + r * 0.95, y + r * 0.35]); fs(c, '#ffb03a', 1.7);
    A.poly(c, [x + r * 0.05, y - r * 0.6, x + r * 2.4, y - r * 2.7, x + r * 0.6, y - r * 0.05]); c.fillStyle = '#fff3b0'; c.fill();
    A.ell(c, x, y, r); fs(c, '#d6b0ff', 1.7); dot(c, x - r * 0.3, y - r * 0.32, r * 0.36, '#ffffff');
  };
  skill('s_meteor', 'star', false, (c) => {
    meteor(c, 34, 21, 3.8); meteor(c, 13.5, 14.5, 3.2); meteor(c, 17, 32, 6);
    line(c, [6, 42.5, 15, 42.5], '#ffe08a', 2); line(c, [22, 43.5, 28, 43.5], '#ffe08a', 2);
  });
  skill('s_chain', 'star', false, (c) => {
    const bolt = [9, 35, 15.5, 25, 12.5, 22.5, 24, 12.5, 26.5, 21.5, 30.5, 19.5, 39.5, 33];
    line(c, bolt, OUT, 6.6); line(c, bolt, '#ffe45a', 3.8); line(c, bolt, '#ffffff', 1.4);
    for (const [x, y] of [[9, 35], [24, 12.5], [39.5, 33]]) { A.glow(c, x, y, 9, '#9fe4ff', 0.9); A.ell(c, x, y, 3.8); fs(c, '#e6f8ff', 1.7); }
  });
  skill('s_wisdom', 'star', true, (c) => {
    shape(c, (c) => { c.beginPath(); c.moveTo(24, 21.5); c.quadraticCurveTo(18, 18, 11, 20); c.lineTo(11, 33.5); c.quadraticCurveTo(18, 31.5, 24, 35); c.quadraticCurveTo(30, 31.5, 37, 33.5); c.lineTo(37, 20); c.quadraticCurveTo(30, 18, 24, 21.5); c.closePath(); }, '#f8f3e4', (c) => {
      c.fillStyle = '#d6ccb4'; c.fillRect(24, 16, 14, 22);
      c.strokeStyle = '#8f8570'; c.lineWidth = 1; c.beginPath(); c.moveTo(14, 24.5); c.lineTo(21, 25.5); c.moveTo(14, 28); c.lineTo(21, 29); c.moveTo(27, 25.5); c.lineTo(34, 24.5); c.moveTo(27, 29); c.lineTo(34, 28); c.stroke();
    }, 1.9);
    line(c, [24, 21.5, 24, 35], OUT, 1.6);
    A.star(c, 24, 13, 5.6, 2.4, 5); fs(c, '#ffe45a', 1.6);
  });
  skill('s_galaxy', 'star', false, (c) => {
    const arm = (rot, col, w) => {
      c.save(); c.translate(24, 24); c.rotate(rot); c.scale(1, 0.74); c.beginPath();
      for (let i = 0; i <= 30; i++) { const a = i * 0.165, r = 2 + i * 0.6, x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.restore(); c.lineWidth = w; c.strokeStyle = col; c.stroke();
    };
    c.save(); c.translate(24, 24); c.rotate(-0.4); c.translate(-24, -24);
    arm(0, OUT, 6.8); arm(PI, OUT, 6.8); arm(0, '#c79bff', 4.2); arm(PI, '#8fe6ff', 4.2); arm(0, '#ffffff', 1.3); arm(PI, '#ffffff', 1.3);
    c.restore();
    A.glow(c, 24, 24, 11, '#ffffff', 0.9); A.ell(c, 24, 24, 4.2); fs(c, '#fff3b0', 1.6);
    for (const [x, y, r] of [[9, 10.5, 1.2], [40, 13, 1], [10, 38.5, 1], [38.5, 38, 1.3], [33, 7.5, 0.8]]) dot(c, x, y, r, '#fff');
  });
  skill('s_ward', 'star', true, (c) => {
    const hex = (r) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * PI) / 3 - PI / 2; c[i ? 'lineTo' : 'moveTo'](24 + Math.cos(a) * r, 24 + Math.sin(a) * r); } c.closePath(); };
    hex(13); fs(c, '#6fc8ff', 1.9);
    hex(9); c.fillStyle = '#c9eeff'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#3a7ac0'; c.stroke();
    drop(c, 24, 25, 3.8); fs(c, '#4a7fe0', 1.4);
    line(c, [16.6, 18.4, 19.4, 16.6], '#fff', 1.6);
  });

  // --- gale
  skill('g_multi', 'gale', false, (c) => {
    line(c, [5, 16, 10, 12.3], '#dffff0', 1.8); line(c, [20, 43, 25, 39.3], '#dffff0', 1.8);
    arrow(c, 4.5, 28, 31.5, 7.5, '#ffffff', 2.3, 6.4, '#ffe45a');
    arrow(c, 9.3, 34.4, 37, 13.6, '#fff3b0', 2.3, 6.4, '#ffffff');
    arrow(c, 14.1, 40.8, 42, 19.8, '#ffffff', 2.3, 6.4, '#ffe45a');
  });
  skill('g_back', 'gale', false, (c) => {
    rope(c, (c) => { c.beginPath(); c.moveTo(36.5, 25); c.quadraticCurveTo(25, 1.5, 11.5, 17.5); }, '#ffffff', 2.8);
    c.save(); c.translate(9.6, 20.4); c.rotate(2.2); A.poly(c, [0, 0, -7.5, -5, -7.5, 5]); fs(c, '#ffffff', 1.7); c.restore();
    for (const [x, y, r] of [[38.5, 28.5, 2.6], [42, 25.5, 1.8], [34.5, 29.5, 1.6]]) { A.ell(c, x, y, r); fs(c, '#dffff0', 1.4); }
    arrow(c, 9, 37, 42, 37, '#ffe45a', 2.6, 7.5, '#ffffff');
    line(c, [4, 32, 12, 32], '#dffff0', 1.6); line(c, [5, 42, 15, 42], '#dffff0', 1.6);
  });
  skill('g_pierce', 'gale', false, (c) => {
    const a = Math.atan2(14 - 33, 43 - 5);
    const ring = (x, y, half) => { c.save(); c.translate(x, y); c.rotate(a); rope(c, (c) => { c.beginPath(); c.ellipse(0, 0, 3.8, 10, 0, half ? -PI / 2 : PI / 2, half ? PI / 2 : PI * 1.5); }, '#9ff0c0', 2.4); c.restore(); };
    ring(16, 27.5, false); ring(31, 20, false);
    A.glow(c, 40, 15.5, 9, '#ffffff', 0.7);
    arrow(c, 4.5, 33.2, 43.5, 13.8, '#ffffff', 2.8, 8, '#ffe45a');
    ring(16, 27.5, true); ring(31, 20, true);
  });
  skill('g_eye', 'gale', true, (c) => {
    shape(c, (c) => { c.beginPath(); c.moveTo(10, 25.5); c.quadraticCurveTo(24, 12.5, 38, 25.5); c.quadraticCurveTo(24, 37, 10, 25.5); c.closePath(); }, '#ffffff', (c) => {
      A.ell(c, 24, 25.2, 7.8); c.fillStyle = '#ffd84a'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#c8801e'; c.stroke();
      A.ell(c, 24, 25.2, 2.7, 6.2); c.fillStyle = OUT; c.fill(); dot(c, 21.4, 22.4, 1.5, '#fff');
    }, 1.9);
    line(c, [9.5, 18.5, 24, 12.5, 38.5, 17.5], OUT, 4.6); line(c, [9.5, 18.5, 24, 12.5, 38.5, 17.5], '#ffe08a', 2.1);
  });
  skill('g_rain', 'gale', false, (c) => {
    for (const [x, y, l] of [[11, 24, 17], [21.5, 36, 19], [30, 21, 15], [38.5, 35, 18]]) arrow(c, x + l * 0.32, y - l, x, y, '#ffffff', 2.1, 5.6, '#ffe45a');
    line(c, [5, 42, 43, 42], OUT, 4.2); line(c, [5, 42, 43, 42], '#9ff0c0', 2);
  });
  skill('g_gale', 'gale', false, (c) => {
    rope(c, (c) => { c.beginPath(); c.moveTo(4.5, 15); c.quadraticCurveTo(13, 9, 19, 12.5); c.arc(18.5, 16, 3.5, -PI / 2, PI * 0.9); }, '#dffff0', 2.1);
    rope(c, (c) => { c.beginPath(); c.moveTo(4, 38.5); c.quadraticCurveTo(14, 42.5, 23, 38.5); }, '#dffff0', 2);
    shape(c, (c) => { c.beginPath(); c.moveTo(13, 32); c.quadraticCurveTo(24, 12.5, 43.5, 8.5); c.quadraticCurveTo(41.5, 15, 37.5, 17.5); c.lineTo(42, 18); c.quadraticCurveTo(39.5, 24, 34.5, 25.5); c.lineTo(38.5, 27); c.quadraticCurveTo(33.5, 32.5, 26.5, 32); c.quadraticCurveTo(20, 35.5, 13, 32); c.closePath(); }, '#ffffff', (c) => {
      c.fillStyle = '#c4f0dc'; c.beginPath(); c.moveTo(13, 32); c.quadraticCurveTo(29, 29, 44, 9); c.lineTo(46, 36); c.lineTo(13, 38); c.fill();
    }, 1.9);
    line(c, [20, 28, 31, 19.5], '#8fd6b8', 1.3);
  });
  skill('g_mastery', 'gale', true, (c) => {
    c.save(); c.translate(23, 25); c.rotate(-PI / 4);
    line(c, [-4, -12.5, -4, 12.5], '#ffffff', 1.3);
    const limb = (c) => { c.beginPath(); c.moveTo(-4, -12.5); c.quadraticCurveTo(8.5, -7, 2.5, 0); c.quadraticCurveTo(8.5, 7, -4, 12.5); };
    limb(c); c.lineWidth = 6.2; c.strokeStyle = OUT; c.stroke(); limb(c); c.lineWidth = 3.8; c.strokeStyle = '#ffd24a'; c.stroke();
    c.restore();
    arrow(c, 15.5, 32.5, 34.5, 13.5, '#ffffff', 2, 5.6, '#9ff0c0');
  });
  skill('g_sky', 'gale', false, (c) => {
    A.glow(c, 27, 21, 21, '#fff3b0', 0.75);
    const b1 = [5.5, 12.5, 13.5, 16, 10.5, 20.5, 19, 24], b2 = [29, 42, 32, 35.5, 28, 33.5, 35.5, 28];
    for (const b of [b1, b2]) { line(c, b, OUT, 4.8); line(c, b, '#ffe45a', 2.4); }
    arrow(c, 6.5, 41, 42, 7.5, '#ffffff', 4.6, 13, '#ffe45a');
    line(c, [10, 37.7, 32.5, 16.5], '#ffe45a', 1.6);
    spark(c, 20, 8.5, 2.6, '#fff'); spark(c, 41, 27, 2.4, '#fff');
  });
  skill('g_twin', 'gale', true, (c) => {
    arrow(c, 11.5, 29.5, 30, 11, '#ffffff', 2.2, 6.2, '#9ff0c0');
    arrow(c, 18, 36.5, 36.5, 18, '#ffe45a', 2.2, 6.2, '#ffffff');
  });

  // ------------------------------------------------------------ UI icons
  R.ui_char = (c) => {
    shape(c, (c) => { c.beginPath(); c.moveTo(7, 44.5); c.quadraticCurveTo(7.5, 30.5, 24, 30.5); c.quadraticCurveTo(40.5, 30.5, 41, 44.5); c.closePath(); }, '#4fb0a5', (c) => { c.fillStyle = '#3c8f88'; c.fillRect(27, 28, 16, 18); });
    A.rr(c, 14, 28.5, 20, 6.6, 3.3); fs(c, '#f6a43c', 2);
    A.ell(c, 24, 18.5, 12.6, 11.9); fs(c, '#ffe2c6');
    c.beginPath(); c.moveTo(11, 21); c.bezierCurveTo(8.5, 6, 20, 3.2, 26, 4.6); c.bezierCurveTo(34.5, 5.2, 38.8, 11.5, 37.2, 19.5);
    c.lineTo(34, 14.5); c.lineTo(30.5, 17.6); c.lineTo(26.5, 12.4); c.lineTo(22, 17.2); c.lineTo(17.5, 13); c.quadraticCurveTo(13.5, 16, 14, 22); c.closePath(); fs(c, '#6d4428', 2.1);
    c.fillStyle = OUT; A.ell(c, 20.8, 21, 1.8, 2.6); c.fill(); A.ell(c, 28.6, 21, 1.8, 2.6); c.fill();
    dot(c, 20.2, 20, 0.75, '#fff'); dot(c, 28, 20, 0.75, '#fff');
    c.fillStyle = 'rgba(255,120,110,0.5)'; A.ell(c, 17.2, 24.6, 2.1, 1.2); c.fill(); A.ell(c, 31.8, 24.6, 2.1, 1.2); c.fill();
    c.beginPath(); c.arc(24.7, 23.8, 2.2, 0.2 * PI, 0.8 * PI); c.lineWidth = 1.5; c.strokeStyle = OUT; c.stroke();
  };
  R.ui_bag = (c) => {
    rope(c, (c) => { c.beginPath(); c.arc(24, 12.5, 6.2, PI, TAU); }, '#8a5a3a', 2.5);
    shape(c, (c) => A.rr(c, 8.2, 12.5, 31.6, 31, [10, 10, 7, 7]), '#d69d58', (c) => { c.fillStyle = '#b57c3e'; c.fillRect(27.5, 10, 16, 36); c.fillStyle = '#ecc183'; c.fillRect(11.6, 26, 2.2, 11); });
    shape(c, (c) => { c.beginPath(); c.moveTo(8.2, 22.5); c.lineTo(8.2, 20); c.quadraticCurveTo(8.2, 12.5, 16, 12.5); c.lineTo(32, 12.5); c.quadraticCurveTo(39.8, 12.5, 39.8, 20); c.lineTo(39.8, 22.5); c.quadraticCurveTo(24, 32, 8.2, 22.5); c.closePath(); }, '#bb7a3e', (c) => { c.fillStyle = '#9a6030'; c.fillRect(27.5, 10, 16, 24); }, 2.1);
    A.rr(c, 20.4, 23, 7.2, 8.2, 2); fs(c, GOLD, 1.8); dot(c, 24, 27.2, 1.3, OUT);
    A.rr(c, 14.5, 34.5, 19, 6.2, 2.5); c.lineWidth = 1.5; c.strokeStyle = '#8a5a3a'; c.stroke();
  };
  R.ui_skill = (c) => {
    A.glow(c, 26, 22, 20, '#ffe45a', 0.45);
    c.save(); c.translate(23.5, 27); c.rotate(-0.12);
    shape(c, (c) => A.rr(c, -15.5, -13.5, 31, 27, 3.6), '#6266e0', (c) => { c.fillStyle = '#4649ae'; c.fillRect(2, -15, 15, 30); c.fillStyle = '#f6f1e2'; c.fillRect(-16, 9.6, 33, 2.6); });
    A.rr(c, -15.5, -13.5, 5.6, 27, 2); fs(c, '#3a2f7a', 1.8);
    c.restore();
    A.star(c, 26, 24.5, 9.8, 4.2, 5); fs(c, '#ffe45a', 1.9);
    spark(c, 39.5, 9, 4.2, '#ffffff'); spark(c, 9.5, 8.5, 2.6, '#fff3b0');
  };
  R.ui_quest = (c) => {
    shape(c, (c) => A.rr(c, 11.5, 9, 25, 31, 2.5), '#f6e7be', (c) => { c.fillStyle = '#e0cc98'; c.fillRect(28.5, 8, 10, 34); });
    A.rr(c, 8.2, 5.2, 31.6, 7.4, 3.7); fs(c, '#ecd8a6', 2.1); A.rr(c, 8.2, 36.2, 31.6, 7.4, 3.7); fs(c, '#ecd8a6', 2.1);
    A.rr(c, 21.5, 15, 5, 12.6, 2.3); fs(c, '#e2483a', 1.8); A.ell(c, 24, 31.5, 2.8); fs(c, '#e2483a', 1.8);
  };
  R.ui_map = (c) => {
    shape(c, (c) => A.poly(c, [5.5, 14, 17, 9.5, 31, 14.5, 42.5, 10, 42.5, 36, 31, 40.5, 17, 35.5, 5.5, 40]), '#f6e7be', (c) => {
      c.fillStyle = '#dcc890'; A.poly(c, [17, 9.5, 31, 14.5, 31, 40.5, 17, 35.5]); c.fill();
      c.fillStyle = '#8fd0e8'; c.beginPath(); c.ellipse(11.5, 19.5, 4.2, 2.6, 0.3, 0, TAU); c.fill();
      c.strokeStyle = '#4f9e74'; c.lineWidth = 2; c.setLineDash([3, 2.6]); c.beginPath(); c.moveTo(9.5, 33.5); c.quadraticCurveTo(16, 23, 24, 29); c.quadraticCurveTo(30, 33, 33.5, 26.5); c.stroke(); c.setLineDash([]);
    });
    line(c, [17, 9.5, 17, 35.5], '#b9a472', 1.3); line(c, [31, 14.5, 31, 40.5], '#b9a472', 1.3);
    c.beginPath(); c.moveTo(34, 27); c.bezierCurveTo(26, 17.5, 28.2, 8.5, 34, 8.5); c.bezierCurveTo(39.8, 8.5, 42, 17.5, 34, 27); c.closePath(); fs(c, '#e2483a', 1.9);
    dot(c, 34, 15.2, 2.4, '#ffffff');
  };
  R.ui_menu = (c) => {
    const gear = (c) => {
      c.beginPath();
      for (let i = 0; i < 8; i++) for (const [da, r] of [[-0.25, 12.6], [-0.14, 17.4], [0.14, 17.4], [0.25, 12.6]]) { const a = (i * TAU) / 8 + da; c[i === 0 && da === -0.25 ? 'moveTo' : 'lineTo'](24 + Math.cos(a) * r, 24 + Math.sin(a) * r); }
      c.closePath(); c.moveTo(29.4, 24); c.arc(24, 24, 5.4, 0, TAU, true);
    };
    c.save(); gear(c); c.fillStyle = '#dbe1ec'; c.fill('evenodd'); c.clip('evenodd'); dot(c, 31, 32, 15.5, '#a9b3c8'); c.restore();
    gear(c); c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
    A.ell(c, 24, 24, 9.2); c.lineWidth = 1.3; c.strokeStyle = '#7f8aa2'; c.stroke();
  };
  R.ui_sound = (c) => {
    rope(c, (c) => { c.beginPath(); c.arc(25, 24, 8, -0.78, 0.78); }, '#ffe45a', 2.5);
    rope(c, (c) => { c.beginPath(); c.arc(25, 24, 15, -0.8, 0.8); }, '#ffe45a', 2.5);
    shape(c, (c) => A.poly(c, [5.5, 18.5, 13.5, 18.5, 24.5, 9, 24.5, 39, 13.5, 29.5, 5.5, 29.5]), '#f1f4fa', (c) => { c.fillStyle = '#b6c3d8'; c.fillRect(4, 24, 22, 16); });
    line(c, [13.5, 19.5, 13.5, 28.5], '#8f9ab0', 1.3);
  };
  // 전투력 emblem: two crossed blades over a flame shield
  R.ui_cp = (c) => {
    A.glow(c, 24, 24, 22, '#ffb040', 0.5);
    const blade = (rot) => {
      c.save(); c.translate(24, 25); c.rotate(rot);
      shape(c, (c) => A.poly(c, [-2.6, 6, -2.6, -15, 0, -20, 2.6, -15, 2.6, 6]), '#e8eef6', (c) => { c.fillStyle = '#b8c4d6'; c.fillRect(0, -22, 4, 30); }, 2);
      A.rr(c, -7, 5.4, 14, 3.6, 1.8); fs(c, GOLD, 1.8);
      A.rr(c, -1.8, 9, 3.6, 7, 1.5); fs(c, WOOD, 1.6);
      c.restore();
    };
    blade(-0.72); blade(0.72);
    shape(c, (c) => { c.beginPath(); c.moveTo(24, 41); c.quadraticCurveTo(13.5, 35, 14, 22.5); c.lineTo(24, 18.5); c.lineTo(34, 22.5); c.quadraticCurveTo(34.5, 35, 24, 41); c.closePath(); }, '#e2483a', (c) => { c.fillStyle = '#b8302a'; c.fillRect(24, 16, 12, 28); });
    c.beginPath(); c.moveTo(24, 36.5); c.bezierCurveTo(19, 33, 20, 28.5, 23, 25); c.quadraticCurveTo(23, 29, 25.5, 29.5); c.quadraticCurveTo(25, 26.5, 27.5, 24.5); c.bezierCurveTo(30, 29, 29.5, 33.5, 24, 36.5); c.closePath(); fs(c, '#ffd84a', 1.6);
    spark(c, 38, 10, 3.6, '#ffffff'); spark(c, 10, 12, 2.4, '#fff3b0');
  };
  // jump: little winged boot-arrow
  R.ui_jump = (c) => {
    A.glow(c, 24, 22, 18, '#9fe4ff', 0.45);
    for (const [y, col] of [[30, '#9fdcff'], [19, '#ffffff']]) rope(c, (c) => { c.beginPath(); c.moveTo(12, y + 7); c.lineTo(24, y - 5); c.lineTo(36, y + 7); }, col, 4.2);
    dot(c, 24, 41, 2.6, '#ffe45a');
  };
  // travel: a tiny lit lighthouse
  R.ui_travel = (c) => {
    A.glow(c, 24, 14, 20, '#ffd27a', 0.7);
    shape(c, (c) => A.poly(c, [15, 43, 18.5, 17, 29.5, 17, 33, 43]), '#ece2cc', (c) => { c.fillStyle = '#c8553f'; c.fillRect(10, 27, 30, 5.5); c.fillStyle = 'rgba(29,20,48,0.2)'; c.fillRect(26, 14, 10, 32); });
    A.rr(c, 17.5, 9, 13, 9, 2); fs(c, '#fff3b8', 2);
    dot(c, 24, 13.5, 2.6, '#ffb02e');
    c.beginPath(); c.moveTo(16, 9.5); c.quadraticCurveTo(24, 1, 32, 9.5); c.closePath(); fs(c, '#c8553f', 2);
    A.rr(c, 11, 41.5, 26, 4, 2); fs(c, '#a9a1b8', 1.8);
  };
  R.ui_close = (c) => {
    shape(c, (c) => A.ell(c, 24, 24, 16.5), '#e9503f', (c) => { dot(c, 29.5, 31, 15, '#c2362c'); });
    line(c, [17.2, 17.2, 30.8, 30.8], OUT, 7.2); line(c, [30.8, 17.2, 17.2, 30.8], OUT, 7.2);
    line(c, [17.2, 17.2, 30.8, 30.8], '#ffffff', 3.8); line(c, [30.8, 17.2, 17.2, 30.8], '#ffffff', 3.8);
  };

  // ------------------------------------------------------------ fallback + API
  function fallback(c) {
    shape(c, (c) => { c.beginPath(); c.moveTo(16, 18); c.quadraticCurveTo(6, 30, 12, 39); c.quadraticCurveTo(24, 45, 36, 39); c.quadraticCurveTo(42, 30, 32, 18); c.closePath(); }, '#b79a78', (c) => { dot(c, 31, 35, 11, '#9c8062'); });
    A.poly(c, [15, 18, 12, 11, 19, 13.5, 24, 9.5, 29, 13.5, 36, 11, 33, 18]); fs(c, '#c7ab88', 2);
    A.rr(c, 14.5, 16, 19, 4.2, 2); fs(c, '#c8503f', 1.8);
    A.text(c, '?', 24, 30.5, { size: 15, weight: 900, color: '#fff8e0', sw: 3 });
  }
  function render(c, key) {
    if (R[key]) return R[key](c);
    const m = /^(.+)_(\d)$/.exec(key);
    if (m && FAM[m[1]]) { const t = +m[2]; if (t >= 1 && t <= 7) return FAM[m[1]](c, t); }
    fallback(c);
  }
  A.icon = function (key) {
    key = String(key);
    let cv = cache[key];
    if (cv) return cv;
    cv = document.createElement('canvas'); cv.width = cv.height = 96; cv._w = cv._h = 48; cv._s = 2;
    const c = cv.getContext('2d');
    const reset = () => { c.setTransform(2, 0, 0, 2, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.lineJoin = 'round'; c.lineCap = 'round'; };
    reset(); c.save();
    try { render(c, key); c.restore(); }
    catch (e) { reset(); c.clearRect(0, 0, 48, 48); try { fallback(c); } catch (e2) {} }
    cache[key] = cv;
    return cv;
  };
  // the same icon drawn at s× (48·s px square) for big, crisp close-ups (the blacksmith's enhancement show)
  const hd = {};
  A.iconHD = function (key, s) {
    key = String(key); s = s || 4;
    const id = key + '@' + s;
    if (hd[id]) return hd[id];
    const cv = document.createElement('canvas'); cv.width = cv.height = 48 * s; cv._w = cv._h = 48; cv._s = s;
    const c = cv.getContext('2d');
    const reset = () => { c.setTransform(s, 0, 0, s, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.lineJoin = 'round'; c.lineCap = 'round'; };
    reset(); c.save();
    try { render(c, key); c.restore(); }
    catch (e) { reset(); c.clearRect(0, 0, 48, 48); try { fallback(c); } catch (e2) {} }
    return (hd[id] = cv);
  };
  A.iconURL = function (key) {
    key = String(key);
    if (urls[key]) return urls[key];
    let u = '';
    try { u = A.icon(key).toDataURL('image/png'); } catch (e) { u = ''; }
    return (urls[key] = u);
  };
  A.drawIcon = function (ctx, key, x, y, size) {
    size = size || 48;
    ctx.drawImage(A.icon(key), x - size / 2, y - size / 2, size, size);
  };
  A.hasIcon = (key) => { if (R[key]) return true; const m = /^(.+)_(\d)$/.exec(String(key)); return !!(m && FAM[m[1]] && +m[2] >= 1 && +m[2] <= 7); };
})();
