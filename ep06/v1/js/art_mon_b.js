'use strict';
/* 등불지기 — monster art, set B (deep cave → citadel):
   shade, golem, skink, cactus, dustdevil, scorpion, snowimp, ram, wraith, yeti, gsoldier, ghexer, gargoyle, nox.
   A.M[id](ctx, s): local coords, origin = bottom-center of the hitbox, creature faces right, y up = negative.
   s = { t, state:'idle'|'move'|'attack'|'hit', p, atk, air, vy, rage, w, h, seed }.  A.MANCHOR[id] = spawn anchors. */
(function () {
  const G = window.G, U = G.U, A = G.Art;
  const M = A.M || (A.M = {});
  const AN = A.MANCHOR || (A.MANCHOR = {});
  const PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs, max = Math.max, min = Math.min;
  const lerp = U.lerp, sat = U.sat;
  const OUT = A.OUT, LW = A.LW;
  const fs = A.fs, ell = A.ell, rr = A.rr, poly = A.poly, glow = A.glow, shade = A.shade, rgba = A.rgba;

  // ------------------------------------------------------------ helpers
  const sub = (p, a, b) => sat((p - a) / (b - a));
  const sm = (k) => k * k * (3 - 2 * k);
  const mixA = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  // keyframes: flat [t0, v0, t1, v1, ...] with smoothstep between keys
  function key(p, ks) {
    if (p <= ks[0]) return ks[1];
    for (let i = 2; i < ks.length; i += 2) {
      if (p <= ks[i]) { const u = (p - ks[i - 2]) / (ks[i] - ks[i - 2]); return ks[i - 1] + (ks[i + 1] - ks[i - 1]) * u * u * (3 - 2 * u); }
    }
    return ks[ks.length - 1];
  }
  const hitK = (s) => (s.state === 'hit' ? sin(sat(s.p || 0) * PI) : 0);
  function rot2(px, py, x, y, a) { const c = cos(a), sn = sin(a), dx = x - px, dy = y - py; return [px + dx * c - dy * sn, py + dx * sn + dy * c]; }
  // 2-bone joint position (dir = ±1 picks the bend side)
  function elbow(x1, y1, x2, y2, l1, l2, dir) {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 0.001, dd = min(d, l1 + l2 - 0.5);
    const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(max(0, l1 * l1 - a * a)), ux = dx / d, uy = dy / d;
    return [x1 + ux * a - uy * h * dir, y1 + uy * a + ux * h * dir];
  }
  const stroke = (ctx, col, lw) => { ctx.lineWidth = lw || LW; ctx.strokeStyle = col || OUT; ctx.stroke(); };
  // outlined thick line(s) — needs round caps/joins on ctx
  function limb(ctx, x1, y1, x2, y2, w, col, lw) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    stroke(ctx, OUT, w + (lw || LW) * 2); stroke(ctx, col, w);
  }
  function limb2(ctx, x1, y1, ex, ey, x2, y2, w, col, lw) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(ex, ey); ctx.lineTo(x2, y2);
    stroke(ctx, OUT, w + (lw || LW) * 2); stroke(ctx, col, w);
  }
  // closed polygon with rounded corners
  function rpoly(ctx, pts, r) {
    const n = pts.length / 2;
    ctx.beginPath(); ctx.moveTo((pts[n * 2 - 2] + pts[0]) / 2, (pts[n * 2 - 1] + pts[1]) / 2);
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2], y = pts[i * 2 + 1], j = ((i + 1) % n) * 2;
      ctx.arcTo(x, y, (x + pts[j]) / 2, (y + pts[j + 1]) / 2, r);
    }
    ctx.closePath();
  }
  // scalloped blob (wool, snow)
  function cloud(ctx, cx, cy, rx, ry, n, bump, rot) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (rot || 0) + (i / n) * TAU, x = cx + cos(a) * rx, y = cy + sin(a) * ry;
      if (!i) ctx.moveTo(x, y);
      else { const am = a - PI / n, k = 1 + bump; ctx.quadraticCurveTo(cx + cos(am) * rx * k, cy + sin(am) * ry * k, x, y); }
    }
    ctx.closePath();
  }
  // jagged fur blob (skew leans the tufts)
  function fur(ctx, cx, cy, rx, ry, n, depth, rot, skew) {
    const m = n * 2, st = TAU / m;
    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      const v = i % 2 === 0, a = (rot || 0) + i * st + (v ? (skew || 0) * st : 0), k = v ? 1 - depth : 1;
      const x = cx + cos(a) * rx * k, y = cy + sin(a) * ry * k;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  // crystal shard pointing up at ang=0 (clockwise positive), base center at x,y
  function shard(ctx, x, y, ang, len, w, col, lw) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    poly(ctx, [-w / 2, 0, -w / 2, -len * 0.6, 0, -len, w / 2, -len * 0.6, w / 2, 0]); ctx.fillStyle = col; ctx.fill();
    poly(ctx, [0, 0, 0, -len, w / 2, -len * 0.6, w / 2, 0]); ctx.fillStyle = shade(col, -0.2); ctx.fill();
    poly(ctx, [-w / 2, 0, -w / 2, -len * 0.6, 0, -len, w / 2, -len * 0.6, w / 2, 0]); stroke(ctx, OUT, lw || LW);
    ctx.beginPath(); ctx.moveTo(-w * 0.22, -len * 0.12); ctx.lineTo(-w * 0.22, -len * 0.55); stroke(ctx, shade(col, 0.6), 1.5);
    ctx.restore();
  }
  function geye(ctx, x, y, rx, ry, col, gcol, ga, gr) { glow(ctx, x, y, gr || max(rx, ry) * 4, gcol, ga === undefined ? 0.7 : ga); ell(ctx, x, y, rx, ry); ctx.fillStyle = col; ctx.fill(); }
  function chev(ctx, x, y, r, dir, col) { ctx.beginPath(); ctx.moveTo(x - r * dir, y - r); ctx.lineTo(x + r * dir, y); ctx.lineTo(x - r * dir, y + r); stroke(ctx, col || OUT, 2.2); }
  function brow(ctx, x, y, w, sl, lw, col) { ctx.beginPath(); ctx.moveTo(x - w, y - sl); ctx.lineTo(x + w, y + sl); stroke(ctx, col || OUT, lw || 2.2); }
  // teardrop flame pointing up, base center at 0,0 (caller transforms)
  function flameP(ctx, w, h, wob) {
    ctx.beginPath(); ctx.moveTo(wob || 0, -h); ctx.bezierCurveTo(w * 1.1, -h * 0.5, w * 1.2, -h * 0.2, w, 0); ctx.bezierCurveTo(w * 0.75, h * 0.28, -w * 0.75, h * 0.28, -w, 0); ctx.bezierCurveTo(-w * 1.2, -h * 0.2, -w * 0.8, -h * 0.55, wob || 0, -h); ctx.closePath();
  }

  // ============================================================ 메아리 그림자 (shade) 46×58 — floating caster
  M.shade = function (ctx, s) {
    const t = s.t, p = s.p || 0, atk = s.state === 'attack', hit = hitK(s);
    const wind = atk ? sat(p / 0.5) : 0, rel = atk ? sub(p, 0.5, 0.6) : 0, rec = atk ? sub(p, 0.6, 1) : 0, hold = wind * (1 - rel);
    const bob = sin(t * 2.6) * 3, sw = sin(t * 3.1) * 4, sw2 = sin(t * 3.1 + 1.3) * 3;
    const body = '#4f4494', bodyD = '#382f6e', bodyL = '#7166bc';
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(-hit * 5 - hold * 2.5 + (rel - rec) * 4, bob - 3);
    ctx.rotate(-hit * 0.22 - hold * 0.08 + (rel - rec) * 0.14);
    for (let i = 0; i < 3; i++) { // echo rings
      const k = (t * 0.6 + i / 3) % 1, r = 23 + k * 27;
      ctx.beginPath(); ctx.arc(-1, -30, r, -0.72, 0.72); stroke(ctx, rgba('#c0b6ff', (1 - k) * 0.85), 2.1);
      ctx.beginPath(); ctx.arc(-1, -30, r, PI - 0.72, PI + 0.72); stroke(ctx, rgba('#c0b6ff', (1 - k) * 0.85), 2.1);
    }
    const k1 = atk ? (p < 0.5 ? wind : 1 - rec) : 0;
    const fhx = lerp(17 + sin(t * 2.6 + 1) * 1.5, 19 + rel * 8, k1), fhy = lerp(-23, -32.5 + rel * 3, k1);
    const bhx = lerp(8, 19 + rel * 8, k1), bhy = lerp(-17, -17 - rel * 3, k1);
    ell(ctx, bhx, bhy, 5, 4.2); fs(ctx, bodyD, 2.2);
    const path = () => {
      ctx.beginPath(); ctx.moveTo(3, -54);
      ctx.bezierCurveTo(16, -55, 22, -42, 18, -30);
      ctx.bezierCurveTo(23, -22, 18, -12, 9, -9);
      ctx.quadraticCurveTo(3 + sw2 * 0.5, -3, -7 + sw, 0);
      ctx.quadraticCurveTo(-17 + sw, 2, -23 + sw * 1.3, -4);
      ctx.quadraticCurveTo(-13 + sw * 0.6, -6, -12, -14);
      ctx.bezierCurveTo(-24, -18, -24, -34, -19, -42);
      ctx.bezierCurveTo(-17, -52, -12, -55, -14, -63);
      ctx.quadraticCurveTo(-4, -58, 3, -54);
      ctx.closePath();
    };
    path(); ctx.fillStyle = body; ctx.fill();
    ctx.save(); ctx.clip(); ell(ctx, -17, -18, 14, 32); ctx.fillStyle = bodyD; ctx.fill(); ctx.restore();
    path(); stroke(ctx);
    ctx.beginPath(); ctx.moveTo(-7, -51); ctx.quadraticCurveTo(-13, -46, -14, -38); stroke(ctx, bodyL, 1.8);
    ell(ctx, 8, -40, 10.4, 10.8); fs(ctx, '#17122b', 2.2);
    if (hit > 0.3) { chev(ctx, 4.4, -40, 2.8, 1, '#e8f3ff'); chev(ctx, 12.4, -40, 2.8, -1, '#e8f3ff'); }
    else {
      const ey = 4.4 * (1 - hold * 0.45), ga = 0.6 + hold * 0.4;
      geye(ctx, 4.2, -40, 2.7, ey, '#eaf4ff', '#9fc4ff', ga); geye(ctx, 12.6, -40, 2.3, ey * 0.94, '#eaf4ff', '#9fc4ff', ga);
    }
    if (atk && p < 0.5) { // growing dark orb between the hands
      const r = 1.5 + wind * 8;
      glow(ctx, 25, -25, r * 3, '#8a6aff', 0.75);
      ell(ctx, 25, -25, r); ctx.fillStyle = '#1b1232'; ctx.fill(); stroke(ctx, '#b79bff', 2);
      ell(ctx, 25 - r * 0.3, -25 - r * 0.35, r * 0.24); ctx.fillStyle = '#d9ccff'; ctx.fill();
    }
    ell(ctx, fhx, fhy, 5.4, 4.5); fs(ctx, bodyL, 2.2);
    ctx.restore();
  };
  AN.shade = { muzzle: [26, -28] };

  // ============================================================ 모래도마뱀 (skink) 62×34 — fast walker
  M.skink = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, mv = st === 'move', atk = st === 'attack', hit = hitK(s);
    const run = mv || (atk && p > 0.42 && p < 0.8), ph = t * 24;
    const lunge = atk ? key(p, [0, 0, 0.4, -5, 0.5, 9, 0.75, 6, 1, 0]) : 0;
    const flare = atk ? key(p, [0, 0.42, 0.35, 1, 0.8, 1, 1, 0.42]) : hit > 0 ? 0.95 : 0.42 + sin(t * 2.3) * 0.06;
    const jaw = atk ? key(p, [0, 0, 0.35, 0.45, 0.5, 1, 0.8, 0.6, 1, 0]) : hit * 0.5;
    const und = run ? sin(ph * 0.5) * 1.1 : 0, wag = sin(t * (run ? 12 : 3)) * (run ? 5 : 2.5);
    const body = '#e2aa68', dark = '#b9783c', belly = '#f6dfb0', fr = '#e8703c', frL = '#f9b860';
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(lunge - hit * 5, run ? -abs(sin(ph * 0.5)) * 1.2 : sin(t * 3) * 0.4);
    const leg = (hx, off, far) => {
      const sw = run ? cos(ph + off) : 0, lf = run ? max(0, sin(ph + off)) * 3.5 : 0, d = hx > 0 ? 1 : -1;
      const fx = hx + d * 3 + sw * 6 + (far ? 4 : 0), fy = -1.6 - lf;
      limb2(ctx, hx, -11, hx + d * 6 + sw * 2 + (far ? 3 : 0), -6.5 - lf, fx, fy, 4.4, far ? dark : body, 2.1);
      ell(ctx, fx + 2, fy - 0.2, 4.3, 2.3); fs(ctx, far ? dark : body, 2);
    };
    leg(13, 0, true); leg(-9, PI, true);
    const tail = () => { ctx.beginPath(); ctx.moveTo(-11, -20); ctx.quadraticCurveTo(-26, -19 + wag * 0.3, -38, -9 + wag); ctx.quadraticCurveTo(-25, -7.5 + wag * 0.3, -11, -7); ctx.closePath(); };
    tail(); ctx.fillStyle = body; ctx.fill();
    ctx.save(); ctx.clip(); ctx.beginPath();
    for (let i = 0; i < 4; i++) { const x = -17 - i * 5.5; ctx.moveTo(x, -24); ctx.lineTo(x - 3, 2 + wag); }
    stroke(ctx, dark, 2.6); ctx.restore();
    tail(); stroke(ctx);
    ell(ctx, 0, -13.5 + und, 18.5, 9.2); ctx.fillStyle = body; ctx.fill();
    ctx.save(); ctx.clip();
    ell(ctx, 2, -6.3 + und, 21, 4.6); ctx.fillStyle = belly; ctx.fill();
    ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(-9 + i * 7, -24 + und); ctx.lineTo(-7 + i * 7, -17.5 + und); }
    stroke(ctx, dark, 2.8); ctx.restore();
    ell(ctx, 0, -13.5 + und, 18.5, 9.2); stroke(ctx);
    leg(9, PI, false); leg(-13, 0, false);
    // neck frill
    const R = 7 + 12 * flare, a0 = PI * (1.06 - 0.06 * flare), a1 = PI * (1.5 + 0.14 * flare), fx0 = 12.5, fy0 = -16;
    ctx.beginPath(); ctx.moveTo(fx0 + 2, fy0 + 1);
    for (let i = 0; i <= 8; i++) { const a = lerp(a0, a1, i / 8), r = i % 2 ? R : R * 0.74; ctx.lineTo(fx0 + cos(a) * r, fy0 + sin(a) * r); }
    ctx.closePath(); fs(ctx, fr, 2.2);
    ctx.beginPath();
    for (let i = 1; i <= 7; i += 2) { const a = lerp(a0, a1, i / 8); ctx.moveTo(fx0 + cos(a) * 4, fy0 + sin(a) * 4); ctx.lineTo(fx0 + cos(a) * (R - 2.5), fy0 + sin(a) * (R - 2.5)); }
    stroke(ctx, frL, 1.5);
    // head
    ctx.save(); ctx.translate(13, -15); ctx.rotate(-jaw * 0.14 - hit * 0.2);
    const ja = jaw * 0.45;
    if (jaw > 0.1) { poly(ctx, [0, 0.5, 21, 0.5, 21 * cos(ja) - 2 * sin(ja), 21 * sin(ja) + 2 * cos(ja) + 1]); ctx.fillStyle = '#b8433f'; ctx.fill(); }
    ctx.save(); ctx.rotate(ja);
    ctx.beginPath(); ctx.moveTo(-2, 3.2); ctx.quadraticCurveTo(10, 8.4, 21, 3.6); ctx.lineTo(20.5, 0.8); ctx.lineTo(-2, 0); ctx.closePath(); fs(ctx, belly, 2.2);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-3, -7); ctx.quadraticCurveTo(8, -13.5, 18, -7.5); ctx.quadraticCurveTo(23.5, -4, 22, 0.6); ctx.lineTo(-2, 1.6); ctx.quadraticCurveTo(-6.5, -3, -3, -7); ctx.closePath(); fs(ctx, body);
    if (hit > 0.3) chev(ctx, 10, -5.2, 2.6, 1);
    else { A.eye(ctx, 10, -5.4, 2.7, 3.5, 0); if (atk) brow(ctx, 10.5, -9.6, 4, 1.4); }
    ell(ctx, 19.6, -4.4, 0.9); ctx.fillStyle = OUT; ctx.fill();
    ctx.restore();
    ctx.restore();
  };

  // ============================================================ 선인장 권투사 (cactus) 48×66 — melee puncher
  function glove(ctx, x, y, r, col, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    rr(ctx, -r * 1.32, -r * 0.5, r * 0.6, r, 2); fs(ctx, '#fbf6e6', 2);
    ell(ctx, -r * 0.5, r * 0.42, r * 0.44); fs(ctx, col, 2.2);
    ell(ctx, 0, 0, r, r * 0.92); fs(ctx, col);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, PI * 1.15, PI * 1.62); stroke(ctx, 'rgba(255,255,255,0.8)', 2);
    ctx.restore();
  }
  M.cactus = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, mv = st === 'move', atk = st === 'attack', hit = hitK(s);
    const bph = t * (mv ? 9 : 6), bounce = abs(sin(bph)) * (mv ? 4 : 2.2) * (atk ? 0.3 : 1);
    let lean = -hit * 0.26, gx = 20, gy = -32 - sin(bph * 2) * 1, gs = 1, dx = -hit * 4, bgx = 9, bgy = -39 + sin(bph * 2) * 1;
    if (atk) {
      gx = key(p, [0, 20, 0.42, -13, 0.5, 43, 0.64, 45, 1, 20]); gy = key(p, [0, -32, 0.42, -36, 0.5, -31, 1, -32]);
      lean = key(p, [0, 0, 0.42, -0.2, 0.5, 0.26, 0.66, 0.2, 1, 0]); gs = key(p, [0, 1, 0.44, 1.05, 0.5, 1.38, 0.68, 1.2, 1, 1]);
      dx = key(p, [0, 0, 0.42, -4, 0.5, 8, 0.7, 5, 1, 0]); bgx = key(p, [0, 9, 0.42, 15, 0.5, 3, 1, 9]);
    }
    const g1 = '#62b46c', g2 = '#3f8a52', red = '#e8506a', redD = '#bf3c58';
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const fl = mv ? sin(bph) : 0;
    ell(ctx, -7 + dx * 0.3, -2.6 - max(0, fl) * 3, 6.5, 3.6); fs(ctx, g2, 2.2);
    ell(ctx, 8 + dx * 0.3, -2.6 - max(0, -fl) * 3, 6.5, 3.6); fs(ctx, g2, 2.2);
    ctx.translate(dx, -bounce); ctx.rotate(lean);
    limb(ctx, -9, -35, bgx - 4, bgy + 2, 6, g2, 2.2);
    glove(ctx, bgx, bgy, 9.2, redD, 0.2);
    rr(ctx, -14, -56, 28, 52, [13, 13, 8, 8]); ctx.fillStyle = g1; ctx.fill();
    rr(ctx, -14, -56, 9, 52, [13, 0, 0, 8]); ctx.fillStyle = g2; ctx.fill();
    ctx.beginPath(); ctx.moveTo(1, -53); ctx.quadraticCurveTo(-1, -30, 1, -7); ctx.moveTo(9, -52); ctx.quadraticCurveTo(11, -30, 9, -7); stroke(ctx, g2, 1.6);
    rr(ctx, -14, -56, 28, 52, [13, 13, 8, 8]); stroke(ctx);
    ctx.beginPath(); // spines
    const sp = [-15, -46, -19, -48, -15, -32, -19.5, -32, -15, -18, -19, -16, 15, -48, 19, -50, 15, -17, 19, -15, -6, -57, -8, -61];
    for (let i = 0; i < sp.length; i += 4) { ctx.moveTo(sp[i], sp[i + 1]); ctx.lineTo(sp[i + 2], sp[i + 3]); }
    stroke(ctx, OUT, 1.7);
    // flower
    ctx.save(); ctx.translate(3, -57); ctx.rotate(sin(bph) * 0.14 - lean * 0.5);
    for (let i = 0; i < 5; i++) { const a = -PI / 2 + (i * TAU) / 5; ell(ctx, cos(a) * 5.6, sin(a) * 5.6 - 3, 4.4, 3.4, a); fs(ctx, '#ff8fb8', 1.8); }
    ell(ctx, 0, -3, 3.3); fs(ctx, '#ffd84a', 1.6);
    ctx.restore();
    // face
    const punch = atk && p > 0.45 && p < 0.72;
    if (hit > 0.3) { chev(ctx, 2, -38, 2.8, 1); chev(ctx, 10.5, -38, 2.8, -1); }
    else {
      A.eye(ctx, 2, -38, 2.7, 3.7, 0); A.eye(ctx, 10.5, -38, 2.4, 3.5, 0);
      brow(ctx, 1.6, -43.6, 3.8, 1.5, 2.4); brow(ctx, 11, -43.6, 3.2, -1.4, 2.4);
    }
    if (punch || hit > 0.3) { ell(ctx, 6.5, -29.5, 3, 2.7); fs(ctx, '#8a2f3f', 1.6); }
    else { ctx.beginPath(); ctx.moveTo(3, -30.6); ctx.quadraticCurveTo(6.5, -28.2, 10.4, -31.2); stroke(ctx, OUT, 1.9); }
    ctx.save(); ctx.translate(-7.5, -27.5); ctx.rotate(-0.5); rr(ctx, -4, -1.7, 8, 3.4, 1); fs(ctx, '#f6e7c8', 1.4); ctx.restore();
    // front arm + glove
    if (punch) {
      ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(gx - 15, gy - 7 + i * 7); ctx.lineTo(gx - 30 - (i % 2) * 6, gy - 7 + i * 7); }
      stroke(ctx, rgba('#ffffff', 0.9 * (1 - sub(p, 0.5, 0.72))), 2);
    }
    limb(ctx, 11, -32, gx - 5 * gs, gy + 1, 6.2, g1, 2.2);
    glove(ctx, gx, gy, 10 * gs, red, 0);
    ctx.restore();
  };

  // ============================================================ 회오리 정령 (dustdevil) 50×70 — charging whirlwind
  M.dustdevil = function (ctx, s) {
    const t = s.t, p = s.p || 0, atk = s.state === 'attack', hit = hitK(s), mv = s.state === 'move';
    const chg = atk ? (p < 0.5 ? U.ease.outQuad(p / 0.5) * 0.7 : 1) : mv ? 0.15 : 0;
    const spin = t * (9 + chg * 9), wide = 1 + chg * 0.18 - hit * 0.15, lean = chg * 0.3 - hit * 0.22;
    const c1 = '#efd9a8', c1b = '#e2c58a', c2 = '#c59f62', c3 = '#fff6dc', N = 6, T = N - 1;
    const cx = [], yy = [], rx = [], ry = [];
    for (let i = 0; i < N; i++) { yy[i] = -7 - i * 10.4; rx[i] = (6.5 + i * 3.8) * wide; ry[i] = 6.4 + i * 0.5; cx[i] = sin(spin * 0.5 + i * 0.95) * (1.2 + i * 1.3); }
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) { // dust puffs at the base
      const k = (t * 1.6 + i * 0.5) % 1, d = i ? 1 : -1;
      ell(ctx, d * (8 + k * 15), -3 - k * 3, 5.5 * (1 - k * 0.4)); ctx.fillStyle = rgba('#f6ead0', 0.9 * (1 - k)); ctx.fill();
    }
    ctx.translate(-hit * 4, 0); ctx.rotate(lean);
    const bits = (front) => {
      for (let i = 0; i < 5; i++) {
        const a = spin * 0.55 + i * 1.257;
        if ((sin(a) > 0) !== front) continue;
        const lv = 0.6 + ((i * 1.7) % 4.2), x = sin(spin * 0.5 + lv * 0.95) * (1.2 + lv * 1.3) + cos(a) * ((6.5 + lv * 3.8) * wide + 8), y = -7 - lv * 10.4 + sin(a) * 3;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a * 2);
        if (i % 3 === 0) { poly(ctx, [-3.5, -2, 1, -3.5, 4, 0, 1.5, 3, -3, 2.5]); fs(ctx, '#9a7a5a', 1.8); }
        else if (i % 3 === 1) { ell(ctx, 0, 0, 4.8, 2.4); fs(ctx, '#8fca6a', 1.8); }
        else { ctx.beginPath(); ctx.moveTo(-4.5, 0); ctx.lineTo(4.5, 0); stroke(ctx, OUT, 4.8); stroke(ctx, '#a9824f', 1.9); }
        ctx.restore();
      }
    };
    bits(false);
    poly(ctx, [cx[0] - 4.5, -6, cx[0] + 4.5, -6, cx[0] + sin(spin * 0.5 - 0.9) * 3.5, 1]); fs(ctx, c1b, 2.3);
    for (let i = 0; i < N; i++) { // stacked spinning discs, narrow → wide
      ell(ctx, cx[i], yy[i], rx[i], ry[i]); fs(ctx, i % 2 ? c1 : c1b);
      ctx.beginPath(); ctx.ellipse(cx[i], yy[i], rx[i] - 2.6, ry[i] - 2.4, 0, 0.3, PI - 0.3); stroke(ctx, c2, 2);
      const a0 = PI + ((spin * 0.6 + i * 1.3) % PI);
      ctx.beginPath(); ctx.ellipse(cx[i], yy[i], rx[i] - 3, ry[i] - 2.8, 0, a0, min(a0 + 0.9, TAU)); stroke(ctx, c3, 2);
    }
    ell(ctx, cx[T], yy[T] - 2.2, rx[T] - 6.5, ry[T] - 5.2); fs(ctx, c2, 2);
    const a1 = (spin * 0.7) % TAU;
    ctx.beginPath(); ctx.ellipse(cx[T], yy[T] - 2.2, (rx[T] - 6.5) * 0.55, (ry[T] - 5.2) * 0.5, 0, a1, a1 + 2.6); stroke(ctx, c1, 1.6);
    for (let i = 0; i < 3; i++) { // wind swooshes
      const k = (t * 1.4 + i * 0.33) % 1, j = 1 + i * 2, d = i % 2 ? 1 : -1, x0 = cx[j] + d * (rx[j] + 5), y0 = yy[j];
      ctx.beginPath(); ctx.moveTo(x0, y0 + 6); ctx.quadraticCurveTo(x0 + d * 8, y0, x0 + d * 2, y0 - 8); stroke(ctx, rgba('#ffffff', sin(k * PI) * 0.95), 2.2);
    }
    // face: eyes ride disc 4, mouth rides disc 3
    const ex = cx[4] + 2.5, ey = yy[4] + 2.5, mx = cx[3] + 3, my = yy[3] + 3;
    if (hit > 0.3) { chev(ctx, ex - 6.5, ey, 3.2, 1); chev(ctx, ex + 6.5, ey, 3.2, -1); }
    else {
      A.eye(ctx, ex - 6.5, ey, 3.5, 5, 0); A.eye(ctx, ex + 6.5, ey, 3.2, 4.8, 0);
      if (atk) { brow(ctx, ex - 7, ey - 7.4, 4.4, 1.8, 2.4); brow(ctx, ex + 7, ey - 7.4, 4, -1.8, 2.4); }
      else { brow(ctx, ex - 7, ey - 7.2, 4.2, 1.5, 2.2); ctx.beginPath(); ctx.arc(ex + 6.8, ey - 5.6, 4.2, PI * 1.2, PI * 1.85); stroke(ctx, OUT, 2.2); }
    }
    if (atk) { ctx.beginPath(); ctx.moveTo(mx - 5, my - 1); ctx.quadraticCurveTo(mx, my + 6, mx + 5.6, my - 1.4); ctx.closePath(); fs(ctx, '#8a4a2f', 1.8); }
    else { ctx.beginPath(); ctx.moveTo(mx - 4, my); ctx.quadraticCurveTo(mx + 1.5, my + 3.6, mx + 5.4, my - 1.6); stroke(ctx, OUT, 2); }
    bits(true);
    ctx.restore();
  };

  // ============================================================ 눈뭉치 도깨비 (snowimp) 44×50 — snowball thrower
  function twig2(ctx, x, y, dir, col) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dir * 4, y - 13); ctx.moveTo(x + dir * 2.4, y - 7.5); ctx.lineTo(x + dir * 8.5, y - 11.5);
    stroke(ctx, OUT, 6.8); stroke(ctx, col, 2.6);
  }
  M.snowimp = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, mv = st === 'move', atk = st === 'attack', hit = hitK(s);
    const hop = mv ? abs(sin(t * 8)) * 4 : abs(sin(t * 2.4)) * 1.2;
    const tilt = (mv ? sin(t * 8) * 0.09 : 0) - hit * 0.26 + (atk ? key(p, [0, 0, 0.42, -0.24, 0.52, 0.24, 1, 0]) : 0);
    const snow = '#f6fbff', snowD = '#c9def2', red = '#e2573f', redD = '#b8402f', twig = '#8a5a36';
    let hx = 18.5 + sin(t * 2.4 + 1) * 1, hy = -22, ball = 0;
    if (atk) {
      hx = key(p, [0, 18.5, 0.42, -13, 0.5, 21, 0.6, 23, 1, 18.5]); hy = key(p, [0, -22, 0.42, -45, 0.5, -37, 0.6, -28, 1, -22]);
      ball = p < 0.5 ? sat(p / 0.2) : 0;
    }
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const fl = mv ? sin(t * 8) : 0;
    ell(ctx, -7, -2.6 - max(0, fl) * 2.5, 6.2, 3.4); fs(ctx, twig, 2.2);
    ell(ctx, 7.5, -2.6 - max(0, -fl) * 2.5, 6.2, 3.4); fs(ctx, twig, 2.2);
    ctx.translate(-hit * 4, -hop); ctx.translate(0, -8); ctx.rotate(tilt); ctx.translate(0, 8);
    const fw = sin(t * 7) * 2.5;
    ctx.beginPath(); ctx.moveTo(-13, -17); ctx.quadraticCurveTo(-22, -18 + fw * 0.5, -30, -11 + fw); ctx.lineTo(-28, -4 + fw); ctx.quadraticCurveTo(-20, -10 + fw * 0.5, -12, -10); ctx.closePath(); fs(ctx, redD, 2.2);
    ell(ctx, -18, -21 + sin(t * 2.4) * 1, 5.4, 5); fs(ctx, redD, 2.2);
    twig2(ctx, -7, -35, -1, twig); twig2(ctx, 8, -36, 1, twig);
    cloud(ctx, 0, -21, 18.5, 17.5, 10, 0.07, 0.3); ctx.fillStyle = snow; ctx.fill();
    ctx.save(); ctx.clip(); ell(ctx, -7, -7, 21, 9.5); ctx.fillStyle = snowD; ctx.fill(); ctx.restore();
    cloud(ctx, 0, -21, 18.5, 17.5, 10, 0.07, 0.3); stroke(ctx);
    // scarf
    ctx.beginPath(); ctx.moveTo(-16.5, -15.5); ctx.quadraticCurveTo(0, -5.5, 17, -15.5); stroke(ctx, OUT, 10); stroke(ctx, red, 5.2);
    ctx.beginPath(); ctx.moveTo(-8, -13.4); ctx.lineTo(-7, -8.6); ctx.moveTo(0, -12.6); ctx.lineTo(0, -7.6); ctx.moveTo(8, -13.4); ctx.lineTo(7, -8.6); stroke(ctx, '#f6e7b8', 1.8);
    // face
    ell(ctx, 0.5, -20.6, 3.2, 1.8); ctx.fillStyle = 'rgba(120,180,255,0.45)'; ctx.fill(); ell(ctx, 13.4, -21, 2.6, 1.7); ctx.fill();
    if (hit > 0.3) { chev(ctx, 2.5, -26.5, 2.8, 1); chev(ctx, 11.5, -26.5, 2.8, -1); ell(ctx, 7, -18.6, 2.6, 2.8); fs(ctx, '#3a2440', 1.6); }
    else {
      A.eye(ctx, 2.5, -26.5, 2.8, 3.9, 0); A.eye(ctx, 11.5, -26.5, 2.5, 3.7, 0);
      brow(ctx, 2, -32.6, 3.8, 1.5, 2.3); brow(ctx, 12, -32.6, 3.3, -1.4, 2.3);
      ctx.beginPath(); ctx.moveTo(1.5, -19.6); ctx.quadraticCurveTo(7, -11.8, 13.4, -20); ctx.quadraticCurveTo(7, -16.6, 1.5, -19.6); ctx.closePath(); fs(ctx, '#3a2440', 1.8);
      poly(ctx, [3.8, -18.6, 6.4, -17.6, 5, -15.2]); ctx.fillStyle = '#fff'; ctx.fill();
    }
    // throwing arm
    limb(ctx, 13.5, -23, hx - 3, hy + 1, 2.4, twig, 1.9);
    if (ball > 0) { const r = 7.2 * ball; cloud(ctx, hx + 1, hy - 9.5, r, r, 7, 0.07, 0.5); fs(ctx, snow, 2.2); ctx.beginPath(); ctx.arc(hx + 1, hy - 9.5, r * 0.55, 0.3, 1.6); stroke(ctx, snowD, 1.8); }
    ell(ctx, hx - 4, hy + 3, 2.6); fs(ctx, red, 2);
    ell(ctx, hx, hy, 6, 5.5); fs(ctx, red, 2.2);
    ctx.restore();
  };
  AN.snowimp = { muzzle: [22, -38] };

  // ============================================================ 얼음뿔 산양 (ram) 66×54 — charger
  function ramHorn(ctx, cx, cy, sc, col, hi) {
    const seg = (w, c, u0, u1, dr) => {
      ctx.beginPath();
      for (let i = 0; i <= 14; i++) { const u = lerp(u0, u1, i / 14), a = -1.25 - u * 4.6, r = (14.5 - u * 9.5 + (dr || 0)) * sc, x = cx + cos(a) * r, y = cy + sin(a) * r * 0.92; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      stroke(ctx, c, w);
    };
    seg(10.4 * sc, OUT, 0, 1); seg(5.6 * sc, col, 0, 1); seg(1.5, hi, 0.04, 0.55, 1.4);
    ctx.beginPath();
    for (let i = 1; i < 7; i++) { const u = i / 7.6, a = -1.25 - u * 4.6, r = (14.5 - u * 9.5) * sc; ctx.moveTo(cx + cos(a) * (r - 2.6 * sc), cy + sin(a) * (r - 2.6 * sc) * 0.92); ctx.lineTo(cx + cos(a) * (r + 0.6 * sc), cy + sin(a) * (r + 0.6 * sc) * 0.92); }
    stroke(ctx, shade(col, -0.3), 1.3);
  }
  M.ram = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, mv = st === 'move', atk = st === 'attack', hit = hitK(s);
    const windup = atk && p < 0.5, gal = atk && p >= 0.5, ph = t * (gal ? 21 : 11);
    const hd = atk ? key(p, [0, 0, 0.22, 0.62, 1, 0.66]) : -hit * 0.3;
    const bob = gal ? -abs(sin(ph)) * 4 : mv ? -abs(sin(ph)) * 1.6 : sin(t * 2.2) * 0.7;
    const wool = '#f3eddd', woolD = '#d3c9b6', skin = '#6c5c6e', skinL = '#93839a', hoof = '#2f2540', ice = '#8fd6ff', iceL = '#eaf9ff';
    let aFN = 0, aFF = 0, aBN = 0, aBF = 0;
    if (gal) { aFN = sin(ph) * 0.95 - 0.2; aFF = sin(ph + 0.5) * 0.95 - 0.2; aBN = sin(ph + 2.6) * 0.95 + 0.2; aBF = sin(ph + 3.1) * 0.95 + 0.2; }
    else if (windup) { aFN = -0.35 + sin(t * 17) * 0.55; aFF = 0.1; aBN = 0.12; aBF = -0.05; }
    else if (mv) { const w = sin(ph) * 0.5; aFN = w; aFF = -w; aBN = -w; aBF = w; }
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(-hit * 5 + (windup ? -sub(p, 0, 0.4) * 4 : 0), 0);
    const leg = (x, ang, far) => {
      ctx.save(); ctx.translate(x, -21 + bob * 0.6); ctx.rotate(ang);
      rr(ctx, -3.6, 0, 7.2, 17, 3); fs(ctx, far ? shade(skin, -0.22) : skin, 2.3);
      rr(ctx, -4.5, 15, 9, 6, [1.5, 1.5, 3, 3]); fs(ctx, hoof, 2);
      ctx.restore();
    };
    leg(-17, aBF, true); leg(13, aFF, true); leg(-10, aBN, false); leg(19, aFN, false);
    if (windup) for (let i = 0; i < 2; i++) { const k = (t * 3 + i * 0.5) % 1; ell(ctx, 12 - k * 14, -3 - k * 5, 3 + k * 2.5); ctx.fillStyle = rgba('#e9e2d0', 0.8 * (1 - k)); ctx.fill(); }
    ctx.translate(0, bob); if (gal) ctx.rotate(0.06 + sin(ph) * 0.05);
    ell(ctx, -31.5, -35, 5.6); fs(ctx, wool, 2.2);
    cloud(ctx, -4, -32, 27, 18.5, 10, 0.2, 0.2); ctx.fillStyle = wool; ctx.fill();
    ctx.save(); ctx.clip(); ell(ctx, -8, -18, 31, 9.5); ctx.fillStyle = woolD; ctx.fill(); ctx.restore();
    cloud(ctx, -4, -32, 27, 18.5, 10, 0.2, 0.2); stroke(ctx);
    ctx.beginPath(); ctx.arc(-14, -36, 5, PI * 0.1, PI * 0.9); ctx.moveTo(1, -30); ctx.arc(-4, -30, 5, 0, PI * 0.8); ctx.moveTo(-17, -24); ctx.arc(-21, -25, 4, 0.2, PI * 0.9); stroke(ctx, woolD, 1.8);
    // head
    ctx.save(); ctx.translate(17, -38); ctx.rotate(hd);
    ramHorn(ctx, -7, -9, 0.74, shade(ice, -0.2), ice);
    poly(ctx, [-4, -4, -13, -1, -5, 3]); fs(ctx, shade(skin, -0.15), 2.2);
    ctx.beginPath(); ctx.moveTo(-6, -9); ctx.quadraticCurveTo(6, -14, 15, -7); ctx.quadraticCurveTo(22, 0, 22, 7); ctx.quadraticCurveTo(21, 13, 14, 13); ctx.quadraticCurveTo(4, 12, -4, 6); ctx.quadraticCurveTo(-9, -1, -6, -9); ctx.closePath(); fs(ctx, skin);
    ell(ctx, 17.6, 8.4, 4.8, 4); ctx.fillStyle = skinL; ctx.fill();
    ell(ctx, 20.2, 6.6, 1.3, 1); ctx.fillStyle = OUT; ctx.fill();
    ctx.beginPath(); ctx.moveTo(14.5, 10.8); ctx.lineTo(19.6, 10.4); stroke(ctx, OUT, 1.6);
    ell(ctx, 13.4, -0.6, 4.2, 4.6); ctx.fillStyle = '#f6efe4'; ctx.fill();
    if (hit > 0.3) chev(ctx, 13.4, -0.6, 2.6, 1);
    else { A.eye(ctx, 14, -0.2, 2.4, 3.1, 0); if (atk) brow(ctx, 13.6, -5.8, 4.4, 1.8, 2.5); }
    cloud(ctx, 1, -11, 9, 5.4, 5, 0.25, 0.4); fs(ctx, wool, 2.2);
    glow(ctx, -3, -5, 20, '#9fe4ff', 0.3);
    ramHorn(ctx, -3, -5, 0.86, ice, iceL);
    ctx.restore();
    if (windup) for (let i = 0; i < 2; i++) { const k = (t * 2.4 + i * 0.5) % 1; ell(ctx, 36 + k * 13, -19 + k * 5, 2.5 + k * 3); ctx.fillStyle = rgba('#ffffff', 0.85 * (1 - k)); ctx.fill(); }
    ctx.restore();
  };

  // ============================================================ 서리 망령 (wraith) 50×66 — floating ice caster
  M.wraith = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, atk = st === 'attack', hit = hitK(s);
    const bob = sin(t * 2.2) * 3, b2 = sin(t * 2.2 + 1) * 1.2, hw = (i) => sin(t * 4 + i * 1.9) * 2;
    const cl = '#7db4e0', clD = '#5687be', clL = '#b9defa', frost = '#e8f7ff', iceC = '#c4ebff';
    let hx = 24 + b2, hy = -28, ha = 0.55, shardK = 0;
    if (atk) {
      hx = key(p, [0, 24, 0.42, 18, 0.5, 21, 0.6, 30, 1, 24]); hy = key(p, [0, -28, 0.42, -62, 0.5, -57, 0.6, -38, 1, -28]);
      ha = key(p, [0, 0.55, 0.42, -1.35, 0.5, -1.0, 0.6, 0.15, 1, 0.55]); shardK = p < 0.5 ? sat(p / 0.4) : 0;
    }
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(-hit * 5, bob - 2); ctx.rotate(-hit * 0.2 + (atk ? key(p, [0, 0, 0.42, -0.1, 0.56, 0.14, 1, 0]) : 0));
    for (let i = 0; i < 6; i++) { // drifting snow motes
      const k = (t * 0.35 + i * 0.173) % 1;
      ell(ctx, sin(i * 2.4 + t * 1.3) * (24 + i * 2), -72 + k * 70, 1.2 + (i % 3) * 0.5); ctx.fillStyle = rgba('#ffffff', sin(k * PI) * 0.9); ctx.fill();
    }
    const hand = (x, y, a, far) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      for (let i = -1; i <= 1; i++) { poly(ctx, [1, i * 3.8 - 2.5, 15.5 - abs(i) * 2.5, i * 6, 1, i * 3.8 + 2.5]); fs(ctx, far ? shade(iceC, -0.2) : '#e6f8ff', 1.6); }
      ell(ctx, 0, 0, 4.4, 4); fs(ctx, far ? shade(clL, -0.22) : clL, 2);
      ctx.restore();
    };
    limb(ctx, -4, -41, 6, -25 + b2, 5, clD, 2.2); hand(7.5, -23 + b2, 1.0, true);
    shard(ctx, -23, -45, -0.8, 15, 7, iceC, 2); shard(ctx, -17, -47.5, -0.3, 12, 6, iceC, 2);
    shard(ctx, -10, -67, -0.5, 10, 5.5, iceC, 1.9);
    const path = () => {
      ctx.beginPath(); ctx.moveTo(-7, -71);
      ctx.quadraticCurveTo(7, -67, 13, -55);
      ctx.lineTo(14.5, -47); ctx.lineTo(22, -44.5); ctx.lineTo(17.5, -36);
      ctx.bezierCurveTo(14.5, -28, 12, -20, 11.5, -13);
      ctx.lineTo(7, -1 + hw(0)); ctx.lineTo(2, -9.5); ctx.lineTo(-4, 2 + hw(1)); ctx.lineTo(-9, -9.5); ctx.lineTo(-12.5, -14);
      ctx.bezierCurveTo(-16, -24, -20, -31, -23, -39);
      ctx.lineTo(-27.5, -47); ctx.lineTo(-18.5, -49);
      ctx.bezierCurveTo(-20, -58, -15, -66, -7, -71);
      ctx.closePath();
    };
    path(); ctx.fillStyle = cl; ctx.fill();
    ctx.save(); ctx.clip();
    poly(ctx, [-32, -76, -9, -76, -5, 6, -32, 6]); ctx.fillStyle = clD; ctx.fill();
    poly(ctx, [-18, -18, -11, -23, -4, -18, 3, -23, 10, -18, 16, -22, 16, 8, -18, 8]); ctx.fillStyle = frost; ctx.fill();
    ctx.restore();
    path(); stroke(ctx);
    ctx.beginPath(); ctx.moveTo(-26, -46.4); ctx.lineTo(-10, -42.6); ctx.lineTo(3, -44.4); ctx.lineTo(20.5, -43.8); stroke(ctx, clL, 2);
    ctx.beginPath(); ctx.moveTo(1.5, -42); ctx.quadraticCurveTo(-1, -30, 0, -20); stroke(ctx, clD, 1.6);
    ell(ctx, 4.5, -55.5, 8.4, 9.2); fs(ctx, '#122040', 2.2);
    if (hit > 0.3) { chev(ctx, 1.2, -56, 2.5, 1, '#eafaff'); chev(ctx, 8.4, -56, 2.5, -1, '#eafaff'); }
    else {
      const ga = atk ? 1 : 0.8;
      glow(ctx, 0.8, -56, 7, '#8fdcff', ga); glow(ctx, 8.6, -56, 6.5, '#8fdcff', ga);
      ctx.fillStyle = '#f0fcff';
      ctx.save(); ctx.translate(0.8, -56); ctx.rotate(0.32); ell(ctx, 0, 0, 2.6, 1.6); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(8.6, -56); ctx.rotate(-0.32); ell(ctx, 0, 0, 2.3, 1.5); ctx.fill(); ctx.restore();
    }
    shard(ctx, 20, -45, 0.9, 12, 6.5, iceC, 2); shard(ctx, 15.5, -46.5, 0.3, 10, 5.5, iceC, 2);
    limb(ctx, 13, -41, hx - cos(ha) * 3, hy - sin(ha) * 3, 5.4, cl, 2.2);
    if (shardK > 0) {
      const sx = hx + 2, sy = hy - 7;
      glow(ctx, sx, sy - 9 * shardK, 16 * shardK + 3, '#9fdcff', 0.7);
      shard(ctx, sx, sy + 1, 0.12, 18 * shardK, 8.5 * shardK, '#e3f7ff', 2);
      ctx.save(); ctx.translate(sx, sy + 1); ctx.rotate(0.12 + PI); ctx.beginPath(); ctx.moveTo(-4.2 * shardK, 0); ctx.lineTo(0, 6 * shardK); ctx.lineTo(4.2 * shardK, 0); ctx.closePath(); fs(ctx, '#c9ecff', 2); ctx.restore();
    }
    hand(hx, hy, ha, false);
    ctx.restore();
  };
  AN.wraith = { muzzle: [28, -48] };

  // ============================================================ 어스름 병사 (gsoldier) 50×70 — sword melee
  M.gsoldier = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, mv = st === 'move', atk = st === 'attack', hit = hitK(s);
    const ph = t * 10, sw = mv ? sin(ph) : 0;
    let lean = (mv ? 0.09 : 0) - hit * 0.26, armF = 0.38 + (mv ? -sw * 0.15 : sin(t * 2.2) * 0.04), wAng = 0.75 + (mv ? 0.15 : 0), armB = mv ? sw * 0.6 : -0.15;
    let dx = -hit * 4;
    const bob = mv ? -abs(cos(ph)) * 2 : sin(t * 2.2) * 0.8;
    if (atk) {
      armF = key(p, [0, 0.38, 0.42, 3.0, 0.5, 0.5, 0.72, 0.32, 1, 0.38]); wAng = key(p, [0, 0.75, 0.42, -0.95, 0.5, 2.15, 0.72, 2.3, 1, 0.75]);
      lean = key(p, [0, 0, 0.42, -0.15, 0.5, 0.25, 0.72, 0.2, 1, 0]); dx = key(p, [0, 0, 0.42, -3, 0.5, 6, 0.72, 5, 1, 0]); armB = key(p, [0, -0.15, 0.42, 0.5, 0.5, -0.7, 1, -0.15]);
    }
    if (hit > 0) { armF = lerp(armF, 1.1, hit); armB = lerp(armB, -1.1, hit); }
    const a1 = '#4b4166', a2 = '#352d4c', aL = '#685e8e', gC = '#b06aff', cape = '#5c2a4e', capeD = '#421c39';
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(dx, 0);
    const leg = (hx, ang, far) => {
      ctx.save(); ctx.translate(hx, -16 + bob * 0.5); ctx.rotate(-ang);
      A.capsule(ctx, 10, 8.8); fs(ctx, far ? a2 : a1);
      rr(ctx, -5.2, 7.2, 13, 8.8, [3, 5, 3, 3]); fs(ctx, far ? '#241d38' : '#2f2748');
      ctx.restore();
    };
    const la = atk ? 0.3 * sub(p, 0.4, 0.5) * (1 - sub(p, 0.8, 1)) : 0;
    leg(-4.5, -sw * 0.75 - la, true); leg(4.5, sw * 0.75 + la, false);
    ctx.translate(0, bob); ctx.translate(0, -16); ctx.rotate(lean); ctx.translate(0, 16);
    // cape
    const fl = sin(t * 6) * 2.5 + (mv ? 5 : 0) + (atk ? 3 : 0);
    ctx.beginPath(); ctx.moveTo(-8, -42); ctx.quadraticCurveTo(-19 - fl * 0.5, -32, -22 - fl, -9);
    ctx.lineTo(-17 - fl * 0.8, -13); ctx.lineTo(-14 - fl * 0.6, -6); ctx.lineTo(-10 - fl * 0.4, -12); ctx.lineTo(-6, -8); ctx.lineTo(-3, -40); ctx.closePath(); fs(ctx, cape);
    ctx.beginPath(); ctx.moveTo(-9, -36); ctx.quadraticCurveTo(-14 - fl * 0.4, -26, -15 - fl * 0.7, -14); stroke(ctx, capeD, 1.8);
    // back arm
    ctx.save(); ctx.translate(-7.5, -37); ctx.rotate(-armB); A.capsule(ctx, 10.5, 7.6); fs(ctx, a2); ell(ctx, 0, 12.5, 4.4); fs(ctx, '#241d38', 2.2); ctx.restore();
    // body
    rr(ctx, -11.5, -42, 23, 28.5, [8, 8, 6.5, 6.5]); fs(ctx, a1);
    ctx.fillStyle = '#241d38'; ctx.fillRect(-10.2, -23.4, 20.4, 3.8);
    rr(ctx, -9.6, -40.6, 19.2, 14.6, [6.5, 6.5, 4, 4]); fs(ctx, aL, 2.1);
    glow(ctx, 1.5, -33, 9, gC, 0.5);
    ctx.beginPath(); ctx.moveTo(1.5, -39); ctx.lineTo(1.5, -28); ctx.moveTo(-4, -34.5); ctx.lineTo(7, -34.5); stroke(ctx, '#d9b0ff', 1.6);
    poly(ctx, [-9, -19.6, -1.5, -19.6, -2.5, -13.4, -8, -14.4]); fs(ctx, a2, 1.8); poly(ctx, [1.5, -19.6, 9, -19.6, 8, -14.4, 2.5, -13.4]); fs(ctx, a2, 1.8);
    // head: plume, helmet, visor
    ctx.save(); ctx.translate(2, -55); ctx.rotate(-hit * 0.15);
    ctx.beginPath(); ctx.moveTo(1, -13); ctx.quadraticCurveTo(-11, -22, -23 - fl * 0.6, -11 + fl * 0.4); ctx.lineTo(-17 - fl * 0.4, -9); ctx.lineTo(-21 - fl * 0.5, -3 + fl * 0.4); ctx.quadraticCurveTo(-10, -8, -4, -9); ctx.closePath(); fs(ctx, '#8a4fd0', 2.2);
    ell(ctx, 0, 0, 15.6, 14.6); fs(ctx, a1);
    ctx.beginPath(); ctx.arc(0, 0, 11, PI * 1.12, PI * 1.5); stroke(ctx, aL, 2);
    ctx.beginPath(); ctx.moveTo(-7.5, -4.5); ctx.quadraticCurveTo(5, -8.6, 15.4, -3.2); ctx.lineTo(15.6, 3.4); ctx.quadraticCurveTo(5, 6.4, -6.6, 3.6); ctx.closePath(); fs(ctx, '#150f24', 2.1);
    glow(ctx, 7.5, 0, 12, gC, hit > 0.3 ? 0.4 : 0.8);
    if (hit > 0.3) { chev(ctx, 3.5, 0, 2.2, 1, '#e3b8ff'); chev(ctx, 11.5, 0, 2.2, -1, '#e3b8ff'); }
    else { poly(ctx, [0.6, -2.4, 6, -0.6, 6, 1.9, 0.6, 0.9]); ctx.fillStyle = '#ecc8ff'; ctx.fill(); poly(ctx, [14, -2.2, 9.4, -0.6, 9.4, 1.9, 14, 1]); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-10, 8.6); ctx.quadraticCurveTo(2, 12.6, 13, 8); stroke(ctx, a2, 2.2);
    ctx.restore();
    // sword + front arm
    const hx = 7.5 + sin(armF) * 12.5, hy = -37 + cos(armF) * 12.5;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(wAng);
    rr(ctx, -1.9, -4, 3.8, 11, 1.5); fs(ctx, '#2f2540', 2);
    poly(ctx, [-4, -6, -4.6, -19, -1.6, -21.5, -4.6, -30, -0.8, -43, 3.7, -34, 3.7, -6]); fs(ctx, '#9087b0');
    ctx.beginPath(); ctx.moveTo(1.4, -9); ctx.lineTo(1.4, -34); stroke(ctx, '#c9c0e6', 1.4);
    glow(ctx, -1.6, -21.5, 8, gC, 0.7);
    poly(ctx, [-8.4, -9.4, -5, -5.4, 5, -5.4, 8.4, -9.4, 5.4, -3.4, -5.4, -3.4]); fs(ctx, '#5a5078', 2);
    ctx.restore();
    ctx.save(); ctx.translate(7.5, -37); ctx.rotate(-armF); A.capsule(ctx, 10.5, 7.6); fs(ctx, a1); ell(ctx, 0, 12.5, 4.5); fs(ctx, '#2f2748', 2.2); ctx.restore();
    poly(ctx, [5, -41, 9, -48, 12.5, -41]); fs(ctx, aL, 2);
    ell(ctx, 8.4, -38, 6.4, 5.4); fs(ctx, aL, 2.1);
    ctx.restore();
  };

  // ============================================================ 어스름 주술사 (ghexer) 48×70 — dark-lantern caster
  M.ghexer = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, mv = st === 'move', atk = st === 'attack', hit = hitK(s);
    const sp = mv ? 7 : 2.3, swy = sin(t * sp), bob = swy * (mv ? 1.6 : 1);
    const lift = atk ? key(p, [0, 0, 0.42, 1, 0.62, 1, 1, 0]) : 0;
    const flame = atk ? key(p, [0, 1, 0.45, 2.3, 0.5, 2.6, 0.58, 0.6, 1, 1]) : 1 + sin(t * 9) * 0.08;
    const robe = '#3d2c60', robeD = '#2a1e46', robeL = '#56408a', trim = '#8a4fd0', gC = '#b06aff', iron = '#4a4266';
    const bodyRot = -hit * 0.2 + (mv ? 0.05 : 0) - lift * 0.06;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(-hit * 4, bob * 0.6 - 0.6); ctx.rotate(bodyRot);
    limb(ctx, -6, -40, -9 + swy * 1.2, -25, 8, robeD, 2.3);
    const hw = (i) => sin(t * 5 + i * 1.7) * 1.4;
    const rp = () => {
      ctx.beginPath(); ctx.moveTo(10, -45); ctx.quadraticCurveTo(16, -26, 19.5, -3);
      ctx.lineTo(14, -6 + hw(0)); ctx.lineTo(9, 0); ctx.lineTo(3.5, -6 + hw(1)); ctx.lineTo(-2, 0); ctx.lineTo(-7.5, -6 + hw(2)); ctx.lineTo(-13, 0); ctx.lineTo(-19.5, -5);
      ctx.quadraticCurveTo(-15, -28, -10.5, -45); ctx.closePath();
    };
    rp(); ctx.fillStyle = robe; ctx.fill();
    ctx.save(); ctx.clip();
    poly(ctx, [-22, -48, -5, -48, -9, 4, -22, 4]); ctx.fillStyle = robeD; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-20, -11.5); ctx.quadraticCurveTo(0, -8.5, 20, -11.5); stroke(ctx, trim, 2.6);
    ctx.restore();
    rp(); stroke(ctx);
    ctx.beginPath(); ctx.moveTo(-12.6, -27.5); ctx.quadraticCurveTo(0, -24.5, 15.2, -27.5); stroke(ctx, '#c9a25a', 2.2);
    ctx.beginPath(); ctx.moveTo(5, -26); ctx.lineTo(4, -18); ctx.moveTo(7.5, -26); ctx.lineTo(8.5, -19); stroke(ctx, '#c9a25a', 1.6);
    ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(3, -17); ctx.lineTo(0, -14.5); ctx.moveTo(-6, -38); ctx.lineTo(-3.5, -34.5); stroke(ctx, robeL, 1.5);
    // hood
    const tip = sin(t * 3) * 1.5;
    ctx.beginPath(); ctx.moveTo(-13.5, -42);
    ctx.bezierCurveTo(-20, -56, -11, -70, -1, -76);
    ctx.quadraticCurveTo(9, -82 + tip, 18, -72 + tip);
    ctx.quadraticCurveTo(10, -73 + tip * 0.5, 9, -66);
    ctx.bezierCurveTo(17, -62, 19.5, -50, 14.5, -43);
    ctx.quadraticCurveTo(0, -38.5, -13.5, -42);
    ctx.closePath(); fs(ctx, robe);
    ctx.beginPath(); ctx.moveTo(-9, -66); ctx.quadraticCurveTo(-15, -58, -14.5, -48); stroke(ctx, robeL, 1.8);
    ell(ctx, 18, -70 + tip, 2.5); fs(ctx, trim, 1.8);
    ell(ctx, 7.5, -53, 8.2, 8.8); fs(ctx, '#140e24', 2.2);
    if (hit > 0.3) { chev(ctx, 4.5, -54, 2.3, 1, '#f3c4ff'); chev(ctx, 11.4, -54, 2.3, -1, '#f3c4ff'); }
    else {
      const ga = 0.65 + lift * 0.35;
      ctx.save(); ctx.translate(4.4, -54); ctx.rotate(0.25); geye(ctx, 0, 0, 2.2, 3 - lift * 0.8, '#f6d2ff', gC, ga); ctx.restore();
      ctx.save(); ctx.translate(11.4, -54); ctx.rotate(-0.25); geye(ctx, 0, 0, 1.9, 2.8 - lift * 0.8, '#f6d2ff', gC, ga); ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(3.4, -48.6); ctx.lineTo(5.2, -47.4); ctx.lineTo(7, -48.8); ctx.lineTo(8.8, -47.4); ctx.lineTo(10.6, -48.8); ctx.lineTo(12.2, -47.6); stroke(ctx, '#d9a0ff', 1.2);
    // rod + hanging dark lantern
    const hx = lerp(17, 15, lift), hy = lerp(-30, -45, lift), ra = lerp(0.15, 0.05, lift) + (mv ? swy * 0.04 : 0);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(ra);
    rr(ctx, -1.8, -34, 3.6, 43, 1.8); fs(ctx, '#2f2540', 2);
    ctx.beginPath(); ctx.moveTo(0, -33); ctx.quadraticCurveTo(0.5, -41, 8, -39.5); stroke(ctx, OUT, 5.8); stroke(ctx, '#2f2540', 2.4);
    ctx.translate(8, -39); ctx.rotate(-ra - bodyRot + sin(t * 3.1) * 0.12 + (mv ? swy * 0.15 : 0));
    glow(ctx, 0, 11, 11 + flame * 7, gC, 0.7);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 3); stroke(ctx, OUT, 2);
    rr(ctx, -4.8, 4.6, 9.6, 11.4, 2.4); fs(ctx, '#1b1232', 2);
    ctx.save(); ctx.translate(0, 14); ctx.scale(flame, flame);
    flameP(ctx, 3.4, 9.5, sin(t * 13) * 0.8); ctx.fillStyle = '#c58aff'; ctx.fill(); stroke(ctx, '#7a3fd0', 1.2 / flame);
    flameP(ctx, 1.6, 5.5, 0); ctx.fillStyle = '#1a0f2e'; ctx.fill();
    ctx.restore();
    rr(ctx, -5.6, 2.6, 11.2, 3, 1.4); fs(ctx, iron, 1.8);
    rr(ctx, -5.4, 15.2, 10.8, 2.8, 1.2); fs(ctx, iron, 1.8);
    ctx.restore();
    // sleeve + hand
    limb(ctx, 7, -40, hx - 2, hy + 1, 8.4, robe, 2.3);
    ell(ctx, hx, hy, 4, 3.8); fs(ctx, '#b9a8d8', 2);
    ctx.restore();
  };
  AN.ghexer = { muzzle: [25, -72] };

  // ============================================================ 잿빛 가고일 (gargoyle) 64×60 — diving flyer
  M.gargoyle = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, atk = st === 'attack', hit = hitK(s);
    const fl = sin(t * 8.5), dive = atk ? key(p, [0, 0, 0.35, -0.3, 0.5, 0.62, 0.85, 0.62, 1, 0]) : 0;
    const flap = atk ? key(p, [0, fl, 0.35, 1, 0.5, -0.8, 0.85, -0.8, 1, fl]) : fl;
    const reach = atk ? key(p, [0, 0, 0.35, -0.3, 0.5, 1, 0.85, 1, 1, 0]) : 0, rk = max(0, reach);
    const bob = atk ? 0 : -fl * 2.2;
    const s1 = '#8c8399', s2 = '#6a6178', s3 = '#aaa1b8', mem = '#5c5370', bone = '#e9e2d0';
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(-hit * 5, bob - 7); ctx.scale(0.9, 0.9);
    ctx.translate(0, -30); ctx.rotate(dive - hit * 0.2); ctx.translate(0, 30);
    const wing = (x, y, far) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.3 + flap * 0.6 + (far ? 0.2 : 0)); ctx.scale(0.86, (0.82 + 0.18 * abs(flap)) * 0.86);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-9, -27, -7, -42);
      ctx.quadraticCurveTo(-14, -31, -27, -33); ctx.quadraticCurveTo(-23, -23, -41, -17); ctx.quadraticCurveTo(-30, -11, -32, 1);
      ctx.quadraticCurveTo(-15, -6, 0, 0); ctx.closePath(); fs(ctx, far ? shade(mem, -0.2) : mem);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-9, -27, -7, -42); ctx.moveTo(-1, -3); ctx.lineTo(-27, -33); ctx.moveTo(-1, -2); ctx.lineTo(-41, -17); stroke(ctx, far ? s2 : s1, 2.6);
      poly(ctx, [-9, -40, -6, -49, -4, -40]); fs(ctx, bone, 1.6);
      ctx.restore();
    };
    const claws = (x, y, a, far) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      for (let i = -1; i <= 1; i++) { poly(ctx, [1.5, i * 3.6 - 2.3, 11, i * 5, 1.5, i * 3.6 + 2.3]); fs(ctx, bone, 1.4); }
      ell(ctx, 0, 0, 4.6, 4.2); fs(ctx, far ? s2 : s1, 2.1);
      ctx.restore();
    };
    wing(-1, -43, true);
    const tw = sin(t * 4) * 3; // tail
    ctx.beginPath(); ctx.moveTo(-11, -19); ctx.quadraticCurveTo(-22, -12, -29, -9 + tw); stroke(ctx, OUT, 9.4); stroke(ctx, s2, 4.6);
    poly(ctx, [-27, -13 + tw, -37, -9 + tw, -28, -3.5 + tw]); fs(ctx, s2, 2.1);
    const fax = lerp(12, 28, rk), fay = lerp(-18, -28, rk);
    limb2(ctx, 6, -36, 4 + reach * 8, -24, fax, fay, 6, s2, 2.2); claws(fax, fay, lerp(1.2, 0.1, rk), true);
    limb2(ctx, -6, -18, 3 - rk * 8, -9, -4 - rk * 12, -3 + rk * 2, 6.4, s2, 2.2); claws(-4 - rk * 12, -3 + rk * 2, lerp(0.5, 2.6, rk), true);
    limb2(ctx, 2, -17, 10 - rk * 9, -9, 5 - rk * 14, -2.5 + rk * 1, 6.6, s1, 2.2); claws(5 - rk * 14, -2.5 + rk * 1, lerp(0.4, 2.7, rk), false);
    ell(ctx, 0, -28.5, 15, 16.6, 0.28); ctx.fillStyle = s1; ctx.fill();
    ctx.save(); ctx.clip(); ell(ctx, 7, -24, 8, 11.5, 0.28); ctx.fillStyle = s3; ctx.fill(); ell(ctx, -12, -24, 8, 18); ctx.fillStyle = s2; ctx.fill(); ctx.restore();
    ell(ctx, 0, -28.5, 15, 16.6, 0.28); stroke(ctx);
    ctx.beginPath(); ctx.moveTo(-8, -39); ctx.lineTo(-4.5, -34); ctx.lineTo(-7.5, -30); ctx.lineTo(-5, -26.5); ctx.moveTo(1, -16.5); ctx.lineTo(4, -20); stroke(ctx, '#4d4460', 1.5);
    // head
    ctx.save(); ctx.translate(11, -46); ctx.rotate(-dive * 0.6 + hit * 0.25);
    ctx.beginPath(); ctx.moveTo(-5, -6); ctx.quadraticCurveTo(-10, -14, -15, -24); ctx.quadraticCurveTo(-4, -17, 1, -9); ctx.closePath(); fs(ctx, shade(s3, -0.15), 2.2);
    poly(ctx, [-8, -4, -18, -9, -8, 4.5]); fs(ctx, s2, 2.2);
    ctx.beginPath(); ctx.moveTo(-9.5, -6); ctx.quadraticCurveTo(0, -13.5, 10, -8); ctx.quadraticCurveTo(17.5, -5, 19.5, 2); ctx.lineTo(18.5, 6); ctx.quadraticCurveTo(10, 10.4, -2, 8.8); ctx.quadraticCurveTo(-10.5, 5, -9.5, -6); ctx.closePath(); fs(ctx, s1);
    ctx.beginPath(); ctx.moveTo(3, -8.5); ctx.quadraticCurveTo(3, -18, -2, -26); ctx.quadraticCurveTo(9.5, -19, 10.5, -8.5); ctx.closePath(); fs(ctx, s3, 2.2);
    ctx.beginPath(); ctx.moveTo(4, 6.6); ctx.quadraticCurveTo(11, 8.4, 18, 5); stroke(ctx, OUT, 1.8);
    poly(ctx, [8.4, 6.8, 11, 6.9, 9.8, 10.8]); fs(ctx, '#fff', 1.3); poly(ctx, [13, 6.4, 15.6, 5.8, 14.6, 9.8]); fs(ctx, '#fff', 1.3);
    if (hit > 0.3) chev(ctx, 8.5, -0.8, 2.6, 1, '#ffd27a');
    else { glow(ctx, 8.6, -0.6, 10, '#ff8a3a', 0.85); poly(ctx, [4.6, -2.8, 12.4, -0.6, 11.6, 2, 5.4, 1.4]); ctx.fillStyle = '#ffd27a'; ctx.fill(); brow(ctx, 8, -4.4, 5.6, 1.9, 2.6); }
    ell(ctx, 17, 0.6, 0.9); ctx.fillStyle = OUT; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5, -2); ctx.lineTo(-2, 1.5); stroke(ctx, '#4d4460', 1.4);
    ctx.restore();
    const nax = lerp(17, 31, rk), nay = lerp(-19, -34, rk);
    limb2(ctx, 9, -37, 8 + reach * 9, -25 - reach * 2, nax, nay, 6.4, s1, 2.2); claws(nax, nay, lerp(1.1, -0.05, rk), false);
    wing(-5, -42, false);
    ctx.restore();
  };

  // ============================================================ 수정거인 크리스타 (golem) 180×190 — BOSS
  // attacks: slam · spikes · laser · rockfall
  M.golem = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, a = st === 'attack' ? s.atk : '', hit = hitK(s), mv = st === 'move', rage = !!s.rage;
    const cry = rage ? '#ff6a9a' : '#7fe0ff', cryG = rage ? '#ff3a70' : '#5fd0ff', coreC = rage ? '#ffe6c4' : '#eafcff';
    const rock = '#544e78', rockD = '#3b3558', rockL = '#766fa2', rockLL = '#918ab8', rockDD = '#2a2542', LB = 3, PV = -58;
    const br = sin(t * 1.7), wp = t * 5.2, ws = mv ? sin(wp) : 0, wc = mv ? cos(wp) : 0;
    let lean = 0.015 * br - hit * 0.07 + ws * 0.025, dx = -hit * 5, dy = br * 1.2 - (mv ? abs(wc) * 3 : 0);
    let fFx = 98 - ws * 14, fFy = -54 + br * 1.5, fBx = -66 + ws * 14, fBy = -50 + br * 1.5;
    let liftF = max(0, ws) * 10, liftB = max(0, -ws) * 10;
    const lxF = wc * 8, lxB = -wc * 8;
    let coreK = 0.5 + 0.12 * sin(t * 3) + (rage ? 0.25 : 0), jaw = rage ? 0.3 : 0, headTilt = -hit * 0.12, shake = 0;
    if (a === 'slam') {
      lean = key(p, [0, 0, 0.42, -0.14, 0.5, 0.36, 0.68, 0.36, 1, 0]);
      dx = key(p, [0, 0, 0.42, -6, 0.5, 16, 0.68, 16, 1, 0]); dy = key(p, [0, 0, 0.42, -6, 0.5, 22, 0.68, 22, 1, 0]);
      fFx = key(p, [0, 98, 0.42, 44, 0.5, 100, 0.68, 100, 1, 98]); fFy = key(p, [0, -54, 0.42, -216, 0.5, -22, 0.68, -22, 1, -54]);
      fBx = key(p, [0, -66, 0.42, -10, 0.5, 114, 0.68, 114, 1, -66]); fBy = key(p, [0, -50, 0.42, -220, 0.5, -24, 0.68, -24, 1, -50]);
      jaw = key(p, [0, 0, 0.42, 0.7, 0.5, 1, 0.75, 0.5, 1, 0]);
    } else if (a === 'spikes') {
      lean = key(p, [0, 0, 0.3, -0.12, 0.5, 0.34, 0.85, 0.34, 1, 0]);
      dx = key(p, [0, 0, 0.3, -4, 0.5, 12, 0.85, 12, 1, 0]); dy = key(p, [0, 0, 0.3, 0, 0.5, 18, 0.85, 18, 1, 0]);
      fFx = key(p, [0, 98, 0.3, 40, 0.5, 104, 0.85, 104, 1, 98]); fFy = key(p, [0, -54, 0.3, -196, 0.5, -15, 0.85, -15, 1, -54]);
      fBx = key(p, [0, -66, 0.5, -86, 0.85, -86, 1, -66]); fBy = key(p, [0, -50, 0.5, -74, 0.85, -74, 1, -50]);
      jaw = key(p, [0, 0, 0.5, 0.6, 0.85, 0.4, 1, 0]); shake = p > 0.5 && p < 0.85 ? 1 : 0;
    } else if (a === 'laser') {
      lean = key(p, [0, 0, 0.36, -0.1, 0.44, 0.18, 0.9, 0.18, 1, 0]);
      fFx = key(p, [0, 98, 0.36, 88, 0.9, 84, 1, 98]); fFy = key(p, [0, -54, 0.36, -76, 0.9, -72, 1, -54]);
      fBx = key(p, [0, -66, 0.36, -78, 0.9, -84, 1, -66]); fBy = key(p, [0, -50, 0.36, -72, 0.9, -70, 1, -50]);
      coreK = key(p, [0, 0.5, 0.4, 1.7, 0.44, 2.4, 0.9, 2.2, 1, 0.5]); shake = p > 0.4 && p < 0.9 ? 1 : 0; jaw = key(p, [0, 0, 0.4, 0.3, 0.9, 0.8, 1, 0]);
    } else if (a === 'rockfall') {
      lean = key(p, [0, 0, 0.4, -0.12, 0.5, 0.06, 1, 0]); headTilt = key(p, [0, 0, 0.4, -0.28, 0.6, -0.2, 1, 0]);
      fFx = key(p, [0, 98, 0.4, 134, 0.7, 128, 1, 98]); fFy = key(p, [0, -54, 0.4, -180, 0.7, -162, 1, -54]);
      fBx = key(p, [0, -66, 0.4, -122, 0.7, -116, 1, -66]); fBy = key(p, [0, -50, 0.4, -180, 0.7, -162, 1, -50]);
      liftF = key(p, [0, 0, 0.42, 30, 0.5, 0, 1, 0]); jaw = key(p, [0, 0, 0.3, 1, 0.75, 1, 1, 0]);
      dy = key(p, [0, 0, 0.42, -6, 0.5, 10, 0.7, 4, 1, 0]);
    }
    if (shake) dx += sin(t * 55) * 1.3;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const shF = rot2(0, PV, 62, -140, lean), shB = rot2(0, PV, -50, -138, lean);
    shF[0] += dx; shF[1] += dy; shB[0] += dx; shB[1] += dy;
    const fist = (x, y, ang, c, cl, far) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      rr(ctx, -24, -22, 48, 44, 13); ctx.fillStyle = c; ctx.fill();
      rr(ctx, -24, -22, 17, 44, [13, 4, 4, 13]); ctx.fillStyle = cl; ctx.fill();
      rr(ctx, -24, -22, 48, 44, 13); stroke(ctx, OUT, LB);
      ctx.beginPath(); ctx.moveTo(-8, 21); ctx.lineTo(-8, 8); ctx.moveTo(8, 21); ctx.lineTo(8, 8); stroke(ctx, rockDD, 2.2);
      if (!far) shard(ctx, 12, -18, 0.5, 15, 9, cry, 2.2);
      ctx.restore();
    };
    const arm = (sh, hx, hy, far) => {
      const up = hy < sh[1] - 20, c = far ? rockD : rock, e = elbow(sh[0], sh[1], hx, hy, 54, 54, far ? (up ? -1 : 1) : (up ? 1 : -1));
      limb(ctx, sh[0], sh[1], e[0], e[1], 30, c, LB);
      limb(ctx, e[0], e[1], hx, hy, 34, c, LB);
      ell(ctx, e[0], e[1], 12); fs(ctx, far ? rock : rockL, 2.4);
      fist(hx, hy, Math.atan2(hy - e[1], hx - e[0]) - PI / 2, far ? rock : rockL, far ? rockL : rockLL, far);
    };
    const leg = (x, lift, lx, far) => {
      const c = far ? rockD : rock, cl = far ? rock : rockL;
      rr(ctx, x - 19 + lx, -72 - lift * 0.5 + dy * 0.3, 38, 60, 10); fs(ctx, c, LB);
      rr(ctx, x - 26 + lx, -19 - lift, 54, 19, [8, 10, 3, 3]); fs(ctx, cl, LB);
      ctx.beginPath(); ctx.moveTo(x - 4 + lx, -4 - lift); ctx.lineTo(x - 4 + lx, -12 - lift); ctx.moveTo(x + 12 + lx, -4 - lift); ctx.lineTo(x + 12 + lx, -12 - lift); stroke(ctx, far ? rockDD : rockD, 2.2);
    };
    arm(shB, fBx, fBy, true);
    leg(-32, liftB, lxB, true); leg(34, liftF, lxF, false);
    ctx.save(); ctx.translate(dx, dy); ctx.translate(0, PV); ctx.rotate(lean); ctx.translate(0, -PV);
    // back crystals
    glow(ctx, -46, -184, 48, cryG, rage ? 0.5 : 0.3);
    shard(ctx, -50, -146, -0.78, 46, 21, cry, LB); shard(ctx, -42, -152, -0.32, 62, 25, cry, LB); shard(ctx, -30, -158, 0.08, 42, 18, cry, LB);
    shard(ctx, -12, -162, -0.2, 30, 14, cry, LB);
    // torso
    const tp = () => rpoly(ctx, [-60, -144, -34, -170, 38, -164, 70, -142, 60, -88, 40, -54, -38, -54, -56, -92], 14);
    tp(); ctx.fillStyle = rock; ctx.fill();
    ctx.save(); ctx.clip();
    poly(ctx, [-70, -180, -24, -180, -38, -40, -70, -40]); ctx.fillStyle = rockD; ctx.fill();
    poly(ctx, [-70, -72, 70, -80, 70, -40, -70, -40]); ctx.fillStyle = rockD; ctx.fill();
    poly(ctx, [4, -174, 78, -152, 72, -130, 16, -152]); ctx.fillStyle = rockL; ctx.fill();
    ctx.restore();
    tp(); stroke(ctx, OUT, LB);
    ctx.beginPath(); ctx.moveTo(-46, -132); ctx.lineTo(-32, -120); ctx.lineTo(-38, -104); ctx.lineTo(-24, -92); ctx.moveTo(46, -94); ctx.lineTo(38, -82); ctx.lineTo(44, -68); ctx.moveTo(-14, -70); ctx.lineTo(-4, -62); stroke(ctx, rockDD, 2.4);
    // chest core
    const ck = min(coreK, 2.4), cr = 15 + ck * 1.5;
    ell(ctx, 16, -112, 24.5); fs(ctx, rockDD, LB);
    glow(ctx, 16, -112, 26 + coreK * 20, cryG, min(0.9, 0.4 + coreK * 0.22));
    ell(ctx, 16, -112, cr); fs(ctx, cry, 2.4);
    ell(ctx, 16, -112, cr * (0.42 + ck * 0.14)); ctx.fillStyle = coreC; ctx.fill();
    if (coreK > 1.2) glow(ctx, 16, -112, 18 + coreK * 11, '#ffffff', 0.5);
    for (let i = 0; i < 4; i++) {
      const an = PI / 4 + (i * PI) / 2, c0 = cos(an), s0 = sin(an);
      poly(ctx, [16 + cos(an - 0.24) * 26, -112 + sin(an - 0.24) * 26, 16 + c0 * 15.5, -112 + s0 * 15.5, 16 + cos(an + 0.24) * 26, -112 + sin(an + 0.24) * 26]); fs(ctx, rockL, 2.2);
    }
    // front shoulder crystals
    glow(ctx, 74, -180, 44, cryG, rage ? 0.5 : 0.28);
    shard(ctx, 66, -140, 0.95, 34, 16, cry, LB); shard(ctx, 60, -146, 0.22, 58, 24, cry, LB); shard(ctx, 68, -144, 0.58, 44, 20, cry, LB);
    // head
    ctx.save(); ctx.translate(24, -168); ctx.rotate(headTilt);
    shard(ctx, -8, -26, -0.35, 20, 10, cry, 2.4);
    rr(ctx, -12, -8 + jaw * 9, 32, 13, [3, 3, 6, 6]); fs(ctx, rockD, LB);
    if (jaw > 0.05) { rr(ctx, -9, -8, 26, jaw * 9 + 3, 2); ctx.fillStyle = '#150f24'; ctx.fill(); glow(ctx, 4, -4 + jaw * 4, 10 + jaw * 9, cryG, 0.45 * jaw); }
    rr(ctx, -20, -30, 42, 26, [10, 12, 5, 5]); ctx.fillStyle = rockL; ctx.fill();
    rr(ctx, -20, -30, 13, 26, [10, 0, 0, 5]); ctx.fillStyle = rock; ctx.fill();
    rr(ctx, -20, -30, 42, 26, [10, 12, 5, 5]); stroke(ctx, OUT, LB);
    glow(ctx, 6, -16, 18, cryG, 0.7);
    poly(ctx, [-8, -20.5, 2, -17.5, 2, -13.5, -8, -15.5]); ctx.fillStyle = cry; ctx.fill(); poly(ctx, [18, -20.5, 8, -17.5, 8, -13.5, 18, -15.5]); ctx.fill();
    brow(ctx, -4, -22.6, 7, 2.3, 3.2); brow(ctx, 13.5, -22.6, 6.5, -2.3, 3.2);
    ctx.restore();
    ctx.restore();
    arm(shF, fFx, fFy, false);
    ctx.restore();
  };
  AN.golem = { muzzle: [26, -108], slam: [104, 0] };

  // ============================================================ 전갈왕 스카브 (scorpion) 200×140 — BOSS
  // attacks: stab · sweep · spit · burrow
  M.scorpion = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, a = st === 'attack' ? s.atk : '', hit = hitK(s), mv = st === 'move', rage = !!s.rage;
    const shell = '#b8503c', shellD = '#8e3a30', shellL = '#d8745a', gold = '#f0c35a', under = '#5c2a30';
    const sting = rage ? '#ffd24a' : '#9fff6a', stG = rage ? '#ff8a2a' : '#7dff5a', LB = 2.8;
    const wp = t * 13, br = sin(t * 2), sway = sin(t * 1.8) * 4;
    let bx = -hit * 6, sink = 0, hidden = false, mound = 0;
    const by = br * 0.8;
    const T0 = [-150, -84 + sway * 0.3, -112, -192 + sway * 0.5, -22 + sway, -152 + sway * 0.4], d0 = 0.55 + sin(t * 1.8) * 0.07;
    let T = T0, dir = d0, sg = 0.4 + 0.15 * sin(t * 3) + (rage ? 0.4 : 0);
    const cN0 = [112, -34, 0.05, 0.3 + sin(t * 2.2) * 0.14], cF0 = [98, -58, -0.12, 0.3 + sin(t * 2.2 + 1) * 0.14];
    let cN = cN0, cF = cF0;
    if (a === 'stab') {
      const T1 = [-165, -70, -175, -195, -95, -188], T2 = [-120, -150, 30, -172, 156, -44];
      if (p < 0.45) { const k = sm(p / 0.45); T = mixA(T0, T1, k); dir = lerp(d0, -0.5, k); }
      else if (p < 0.72) { const k = sm(sub(p, 0.45, 0.56)); T = mixA(T1, T2, k); dir = lerp(-0.5, 0.6, k); }
      else { const k = sm(sub(p, 0.72, 1)); T = mixA(T2, T0, k); dir = lerp(0.6, d0, k); }
      bx += key(p, [0, 0, 0.45, -8, 0.56, 12, 0.72, 10, 1, 0]); sg = key(p, [0, 0.4, 0.45, 1.3, 0.7, 0.9, 1, 0.4]);
    } else if (a === 'spit') {
      const k = key(p, [0, 0, 0.4, 1, 0.5, 1, 0.56, 1.14, 0.7, 1, 1, 0]);
      T = mixA(T0, [-150, -88, -96, -176, 20, -132], k); dir = lerp(d0, -0.6, min(1, k)); sg = key(p, [0, 0.4, 0.45, 1.6, 0.5, 2.1, 0.6, 0.6, 1, 0.4]);
    } else if (a === 'sweep') {
      const o = key(p, [0, 0, 0.4, 1, 0.5, 2, 0.62, 2, 1, 0]);
      const N1 = [80, -70, -0.55, 1.0], N2 = [126, -26, 0.28, 0.02], F1 = [62, -88, -0.65, 1.0], F2 = [118, -42, 0.2, 0.02];
      if (o <= 1) { cN = mixA(cN0, N1, o); cF = mixA(cF0, F1, o); } else { cN = mixA(N1, N2, o - 1); cF = mixA(F1, F2, o - 1); }
      bx += key(p, [0, 0, 0.4, -6, 0.5, 14, 0.62, 12, 1, 0]);
    } else if (a === 'burrow') {
      if (p < 0.35) { sink = U.ease.inQuad(p / 0.35) * 170; mound = sat(p / 0.25); }
      else if (p < 0.65) { hidden = true; mound = 1; }
      else { sink = (1 - U.ease.outBack(sub(p, 0.65, 0.88))) * 170; mound = 1 - sub(p, 0.82, 1); }
    }
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.scale(1.12, 1.12);
    if (!hidden) {
      ctx.save();
      if (a === 'burrow') { ctx.beginPath(); ctx.rect(-340, -480, 680, 480); ctx.clip(); ctx.translate(sin(t * 47) * 2, sink); }
      ctx.translate(bx, by);
      const leg = (ax, d, off, far) => {
        const sw = mv ? cos(wp + off) : 0, lf = mv ? max(0, sin(wp + off)) * 10 : 0, o = far ? 12 : 0;
        const kx = ax + o + d * 17 + sw * 3, ky = -60 - lf * 0.5 + (far ? 4 : 0), fx = ax + o + d * 33 + sw * 11, fy = -lf - by, c = far ? shellD : shell;
        limb(ctx, ax + o, -34, kx, ky, 9, c, 2.4);
        ctx.beginPath(); ctx.moveTo(kx - 5, ky); ctx.lineTo(kx + 5, ky); ctx.lineTo(fx, fy); ctx.closePath(); fs(ctx, c, 2.4);
        ell(ctx, kx, ky, 6); fs(ctx, far ? shell : shellL, 2.2);
      };
      const claw = (c, far) => {
        const col = far ? shellD : shell, colL = far ? shell : shellL, sx = far ? 56 : 66, sy = far ? -50 : -38;
        const e = elbow(sx, sy, c[0], c[1], 30, 30, far ? 1 : -1);
        limb2(ctx, sx, sy, e[0], e[1], c[0], c[1], 13, col, 2.6);
        ell(ctx, e[0], e[1], 7.5); fs(ctx, colL, 2.2);
        ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(c[2]);
        ctx.save(); ctx.translate(14, 5); ctx.rotate(c[3] * 0.9);
        ctx.beginPath(); ctx.moveTo(-4, -3); ctx.quadraticCurveTo(18, -6, 36, 2); ctx.quadraticCurveTo(16, 12, -4, 8); ctx.closePath(); fs(ctx, col, 2.6);
        ctx.restore();
        ctx.save(); ctx.translate(12, -4); ctx.rotate(-c[3] * 0.35);
        ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(4, -16, 28, -10); ctx.quadraticCurveTo(40, -6, 42, 4); ctx.quadraticCurveTo(24, -2, 4, 8); ctx.closePath(); fs(ctx, colL, 2.6);
        ctx.restore();
        ell(ctx, 6, 0, 17, 13.5); fs(ctx, col, 2.6);
        ctx.beginPath(); ctx.ellipse(6, 0, 12, 9, 0, PI * 1.1, PI * 1.75); stroke(ctx, gold, 2.4);
        ctx.restore();
      };
      const plate = (cx, cy, rx, ry) => {
        ell(ctx, cx, cy, rx, ry); ctx.fillStyle = shell; ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = shellD; ctx.fillRect(cx - rx, cy + ry * 0.25, rx * 2, ry); ctx.restore();
        ctx.beginPath(); ctx.ellipse(cx, cy, rx - 4.5, ry - 4.5, 0, PI * 0.85, PI * 1.55); stroke(ctx, gold, 2.4);
        ell(ctx, cx, cy, rx, ry); stroke(ctx, OUT, LB);
      };
      leg(-58, -1, 0, true); leg(-30, -1, PI, true); leg(2, 1, 0.5, true); leg(34, 1, PI + 0.5, true);
      claw(cF, true);
      rr(ctx, -70, -32, 138, 12, 6); fs(ctx, under, 2.4);
      plate(-76, -46, 19, 17); plate(-54, -46, 25, 22); plate(-26, -45, 31, 26);
      const ceph = () => { ctx.beginPath(); ctx.moveTo(-20, -42); ctx.bezierCurveTo(-20, -80, 42, -84, 72, -62); ctx.bezierCurveTo(88, -52, 88, -34, 72, -26); ctx.lineTo(-6, -22); ctx.quadraticCurveTo(-20, -26, -20, -42); ctx.closePath(); };
      ceph(); ctx.fillStyle = shell; ctx.fill();
      ctx.save(); ctx.clip(); ctx.fillStyle = shellD; ctx.fillRect(-30, -36, 130, 20); ctx.restore();
      ctx.beginPath(); ctx.moveTo(-14.5, -44); ctx.bezierCurveTo(-14, -74, 41, -78, 69, -58); stroke(ctx, gold, 2.6);
      ctx.beginPath(); ctx.moveTo(20, -75); ctx.quadraticCurveTo(13, -52, 20, -25); stroke(ctx, shellD, 2.2);
      ctx.beginPath(); ctx.moveTo(-6, -58); ctx.quadraticCurveTo(2, -68, 12, -70); stroke(ctx, shellL, 2.6);
      ceph(); stroke(ctx, OUT, LB);
      // tail: spine + armored segments + stinger
      const B0x = -86, B0y = -50, bz = (u, i) => { const v = 1 - u; return v * v * v * (i ? B0y : B0x) + 3 * v * v * u * T[i] + 3 * v * u * u * T[i + 2] + u * u * u * T[i + 4]; };
      ctx.beginPath(); ctx.moveTo(B0x, B0y); ctx.bezierCurveTo(T[0], T[1], T[2], T[3], T[4], T[5]); stroke(ctx, OUT, 15); stroke(ctx, shellD, 9.4);
      for (let k = 0; k < 7; k++) {
        const u = 0.06 + k * 0.14, x = bz(u, 0), y = bz(u, 1), ang = Math.atan2(bz(u + 0.03, 1) - y, bz(u + 0.03, 0) - x), rx = 24 - k * 1.6, ry = 17 - k * 1.2;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ell(ctx, 0, 0, rx, ry); ctx.fillStyle = shell; ctx.fill();
        ell(ctx, 0, ry * 0.42, rx * 0.82, ry * 0.5); ctx.fillStyle = shellD; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-rx * 0.5, -ry * 0.8); ctx.quadraticCurveTo(-rx * 0.74, 0, -rx * 0.5, ry * 0.8); stroke(ctx, gold, 2.2);
        ell(ctx, 0, 0, rx, ry); stroke(ctx, OUT, LB);
        ctx.restore();
      }
      ctx.save(); ctx.translate(T[4], T[5]); ctx.rotate(dir);
      ctx.beginPath(); ctx.moveTo(8, -8.5); ctx.quadraticCurveTo(30, -13, 38, 2); ctx.quadraticCurveTo(22, 1, 8, 8.5); ctx.closePath(); fs(ctx, sting, 2.4);
      glow(ctx, 34, 0, 13 + sg * 14, stG, min(1, 0.45 + sg * 0.35));
      ell(ctx, 0, 0, 14.5, 12.5); ctx.fillStyle = shellL; ctx.fill(); ell(ctx, -1, 4.6, 11, 6); ctx.fillStyle = shell; ctx.fill(); ell(ctx, 0, 0, 14.5, 12.5); stroke(ctx, OUT, LB);
      ctx.restore();
      leg(-64, -1, PI, false); leg(-36, -1, 0, false); leg(-4, 1, PI + 0.5, false); leg(28, 1, 0.5, false);
      // face
      glow(ctx, 66, -55, 24, rage ? '#ff5a3a' : '#ffd24a', rage ? 0.8 : 0.45);
      const eye = (x, y, r1, r2) => { ell(ctx, x, y, r1, r2); fs(ctx, rage ? '#ffb08a' : '#ffe27a', 2); ell(ctx, x + 0.8, y, r1 * 0.3, r2 * 0.75); ctx.fillStyle = OUT; ctx.fill(); };
      eye(59, -56, 6, 7.2); eye(74, -50, 4.8, 6);
      ell(ctx, 46, -64, 2.2); fs(ctx, '#ffe27a', 1.4); ell(ctx, 52, -67.5, 2); fs(ctx, '#ffe27a', 1.4); ell(ctx, 82, -42, 2); fs(ctx, '#ffe27a', 1.4);
      ctx.beginPath(); ctx.moveTo(50, -68.5); ctx.lineTo(82, -56); stroke(ctx, OUT, 3.4);
      poly(ctx, [78, -36, 89, -29, 80, -27]); fs(ctx, '#f1e2b8', 2); poly(ctx, [70, -31, 80, -23, 71, -22]); fs(ctx, '#f1e2b8', 2);
      claw(cN, false);
      ctx.restore();
    }
    if (mound > 0.01) { // burrow: dirt mound + flying clods
      const mw = 20 + 62 * mound, mh = 3 + 16 * mound;
      ctx.beginPath(); ctx.ellipse(0, 0, mw, mh, 0, PI, TAU); ctx.closePath(); fs(ctx, '#c99a5a', 2.6);
      ctx.beginPath(); ctx.ellipse(-8, -1, mw * 0.55, mh * 0.55, 0, PI * 1.1, PI * 1.8); stroke(ctx, '#e4c084', 2.4);
      if (p < 0.36 || p > 0.62) {
        const pa = ctx.globalAlpha;
        for (let i = 0; i < 6; i++) {
          const k = (t * 2.6 + i * 0.37) % 1, an = -PI / 2 + (i - 2.5) * 0.42, d = k * 74;
          ctx.globalAlpha = pa * (1 - k);
          ctx.save(); ctx.translate(cos(an) * d * 1.5, sin(an) * d - 6 + k * k * 44); ctx.rotate(k * 6 + i);
          poly(ctx, [-5, -3, 2, -5, 6, 0, 2, 5, -4, 4]); fs(ctx, '#b98a52', 1.8);
          ctx.restore();
        }
        ctx.globalAlpha = pa;
      }
    }
    ctx.restore();
  };
  AN.scorpion = { muzzle: [59, -170], stab: [208, -23] };

  // ============================================================ 설원군주 보르칸 (yeti) 190×200 — BOSS
  // attacks: pound · throw · breath · leap
  M.yeti = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, a = st === 'attack' ? s.atk : '', hit = hitK(s), mv = st === 'move', rage = !!s.rage;
    const furC = '#eef4fb', furD = '#c3d4ea', furDD = '#a7bcd9', mane = '#bfe2f8', maneD = '#93c2e8', ice = '#7fd0ff', iceL = '#e6f8ff', face = '#8397ba', LB = 3, PV = -56;
    const br = sin(t * 1.9), wp = t * 6, ws = mv ? sin(wp) : 0, wc = mv ? cos(wp) : 0;
    let lean = br * 0.012 - hit * 0.08 + (mv ? 0.06 + ws * 0.02 : 0), dx = -hit * 5, dy = br * 1.2 - (mv ? abs(wc) * 4 : 0);
    let nx = 104 - ws * 20, ny = -44 + br, fx = -82 + ws * 20, fy = -42 + br;
    const liftN = max(0, ws) * 12, liftF = max(0, -ws) * 12, lxN = wc * 10, lxF = -wc * 10;
    let mo = rage ? 0.32 + 0.1 * sin(t * 5) : 0, puff = 0, headTilt = -hit * 0.1, boulder = 0, tuck = 0;
    if (a === 'pound') {
      lean = key(p, [0, 0, 0.42, -0.12, 0.5, 0.34, 0.7, 0.34, 1, 0]);
      dx = key(p, [0, 0, 0.5, 14, 0.7, 14, 1, 0]); dy = key(p, [0, 0, 0.42, -4, 0.5, 18, 0.7, 18, 1, 0]);
      nx = key(p, [0, 104, 0.42, 46, 0.5, 114, 0.7, 114, 1, 104]); ny = key(p, [0, -44, 0.42, -228, 0.5, -16, 0.7, -16, 1, -44]);
      fx = key(p, [0, -82, 0.42, -14, 0.5, 74, 0.7, 74, 1, -82]); fy = key(p, [0, -42, 0.42, -230, 0.5, -16, 0.7, -16, 1, -42]);
      mo = key(p, [0, 0, 0.42, 0.8, 0.5, 1, 0.8, 0.5, 1, 0]);
    } else if (a === 'throw') {
      lean = key(p, [0, 0, 0.4, -0.16, 0.5, -0.12, 0.62, 0.26, 1, 0]);
      nx = key(p, [0, 104, 0.4, 50, 0.5, 58, 0.62, 122, 1, 104]); ny = key(p, [0, -44, 0.4, -216, 0.5, -218, 0.62, -112, 1, -44]);
      fx = key(p, [0, -82, 0.4, -22, 0.5, -14, 0.62, 62, 1, -82]); fy = key(p, [0, -42, 0.4, -218, 0.5, -220, 0.62, -120, 1, -42]);
      boulder = p < 0.5 ? sub(p, 0.24, 0.4) : 0; mo = key(p, [0, 0, 0.4, 0.3, 0.5, 0.9, 0.7, 0.6, 1, 0]);
    } else if (a === 'breath') {
      lean = key(p, [0, 0, 0.3, -0.16, 0.4, 0.3, 0.9, 0.3, 1, 0]); puff = key(p, [0, 0, 0.3, 1, 0.42, 0.2, 1, 0]);
      mo = key(p, [0, 0, 0.3, 0.12, 0.38, 1, 0.9, 1, 1, 0]); dx = key(p, [0, 0, 0.3, -6, 0.4, 8, 0.9, 8, 1, 0]); dy = key(p, [0, 0, 0.4, 6, 0.9, 6, 1, 0]);
      nx = key(p, [0, 104, 0.3, 92, 0.4, 116, 0.9, 116, 1, 104]); ny = key(p, [0, -44, 0.3, -60, 0.4, -30, 0.9, -30, 1, -44]);
      fx = key(p, [0, -82, 0.3, -84, 0.4, -66, 0.9, -66, 1, -82]); fy = key(p, [0, -42, 0.3, -60, 0.4, -40, 0.9, -40, 1, -42]);
      if (p > 0.4 && p < 0.9) headTilt = sin(t * 32) * 0.02;
    } else if (a === 'leap') {
      if (p < 0.3) { const e = sm(p / 0.3); dy += 20 * e; lean = 0.16 * e; nx = lerp(nx, 44, e); ny = lerp(ny, -30, e); fx = lerp(fx, -102, e); fy = lerp(fy, -40, e); }
      else if (s.air) {
        if ((s.vy || 0) < 0) { lean = -0.1; nx = 104; ny = -150; fx = -102; fy = -150; tuck = 1; mo = 0.6; }
        else { lean = 0.12; nx = 62; ny = -228; fx = -8; fy = -228; tuck = 0.35; mo = 1; }
      } else { dy += 14; lean = 0.3; dx += 10; nx = 110; ny = -16; fx = 80; fy = -16; mo = 0.7; }
    } else if (s.air) tuck = 0.6;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const shN = rot2(0, PV, 66, -134, lean), shF = rot2(0, PV, -56, -140, lean);
    shN[0] += dx; shN[1] += dy; shF[0] += dx; shF[1] += dy;
    const arm = (sh, hx, hy, far) => {
      const up = hy < sh[1] - 20, c = far ? furD : furC, e = elbow(sh[0], sh[1], hx, hy, 58, 56, far ? (up ? -1 : 1) : (up ? 1 : -1)), ang = Math.atan2(hy - e[1], hx - e[0]);
      limb2(ctx, sh[0], sh[1], e[0], e[1], hx, hy, 40, c, LB);
      ctx.beginPath(); ctx.moveTo(e[0] - 8, e[1] - 6); ctx.lineTo(e[0] - 15, e[1] + 4); ctx.lineTo(e[0] - 5, e[1] + 4); ctx.lineTo(e[0] - 9, e[1] + 13); stroke(ctx, far ? furDD : furD, 2.2);
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
      for (let i = -1; i <= 1; i++) { poly(ctx, [14, i * 13 - 6.5, 42 - abs(i) * 6, i * 16, 14, i * 13 + 6.5]); fs(ctx, far ? shade(ice, -0.16) : ice, 2.4); }
      fur(ctx, 0, 0, 27, 25, 9, 0.12, 0.3, 0.3); fs(ctx, c, LB);
      ctx.restore();
    };
    const leg = (x, lift, lx, far) => {
      const c = far ? furD : furC, L = lift + tuck * 22, f0 = -L, x0 = x + lx;
      rr(ctx, x0 - 27, -74 - L * 0.4 + dy * 0.4, 54, 62 - tuck * 14, 15); fs(ctx, c, LB);
      rr(ctx, x0 - 31, f0 - 21, 60, 21, [10, 12, 4, 4]); fs(ctx, c, LB);
      for (let i = 0; i < 3; i++) { const bx = x0 + 25 - i * 12, by = f0 - 15; poly(ctx, [bx - 5, by - 3, bx + 9, by - 1 + i, bx + 3, by + 8]); fs(ctx, far ? shade(ice, -0.16) : ice, 2.1); }
      ctx.beginPath(); ctx.moveTo(x0 - 26, f0 - 23); for (let i = 1; i <= 6; i++) ctx.lineTo(x0 - 26 + i * 8.6, f0 - 23 + (i % 2 ? 7 : 0)); stroke(ctx, far ? furDD : furD, 2.2);
    };
    arm(shF, fx, fy, true);
    leg(-34, liftF, lxF, true); leg(36, liftN, lxN, false);
    ctx.save(); ctx.translate(dx, dy); ctx.translate(0, PV); ctx.rotate(lean); ctx.translate(0, -PV);
    // torso
    const trx = 76 * (1 + puff * 0.07), tr = 72 * (1 + puff * 0.05);
    fur(ctx, 2, -108, trx, tr, 15, 0.085, 0.2, 0.3); ctx.fillStyle = furC; ctx.fill();
    ctx.save(); ctx.clip(); ell(ctx, -44, -100, 46, 86); ctx.fillStyle = furD; ctx.fill(); ell(ctx, 10, -40, 80, 16); ctx.fill(); ctx.restore();
    fur(ctx, 2, -108, trx, tr, 15, 0.085, 0.2, 0.3); stroke(ctx, OUT, LB);
    ell(ctx, 24, -94, 37 + puff * 4, 43 + puff * 3); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(8, -74); ctx.lineTo(13, -68); ctx.lineTo(18, -74); ctx.moveTo(30, -66); ctx.lineTo(35, -60); ctx.lineTo(40, -66); ctx.moveTo(20, -112); ctx.lineTo(25, -106); ctx.lineTo(30, -112); stroke(ctx, furD, 2.2);
    // mane
    const mk = 1 + puff * 0.1;
    fur(ctx, 14, -160, 64 * mk, 35 * mk, 12, 0.3, 0.1 + sin(t * 2) * 0.02, 0.4); ctx.fillStyle = mane; ctx.fill();
    ctx.save(); ctx.clip(); ell(ctx, 4, -140, 70, 18); ctx.fillStyle = maneD; ctx.fill(); ctx.restore();
    fur(ctx, 14, -160, 64 * mk, 35 * mk, 12, 0.3, 0.1 + sin(t * 2) * 0.02, 0.4); stroke(ctx, OUT, LB);
    // head
    ctx.save(); ctx.translate(28, -172); ctx.rotate(headTilt);
    ctx.beginPath(); ctx.moveTo(-10, -24); ctx.quadraticCurveTo(-14, -50, -40, -60); ctx.quadraticCurveTo(-28, -42, -26, -18); ctx.closePath(); fs(ctx, shade(ice, -0.16), LB);
    ell(ctx, -29, -8, 9, 10.5); fs(ctx, furD, 2.4);
    if (mo > 0.08) { ell(ctx, 15, 21 + mo * 10, 23, 13 + mo * 8); fs(ctx, furC, LB); }
    fur(ctx, 0, 0, 37, 31, 11, 0.1, 0.15, 0.3); ctx.fillStyle = furC; ctx.fill();
    ctx.save(); ctx.clip(); ell(ctx, -26, 8, 22, 36); ctx.fillStyle = furD; ctx.fill(); ctx.restore();
    fur(ctx, 0, 0, 37, 31, 11, 0.1, 0.15, 0.3); stroke(ctx, OUT, LB);
    ell(ctx, 11, 6, 24, 20); fs(ctx, face, 2.2);
    ell(ctx, 19, 14, 14.5, 10.5); ctx.fillStyle = '#a9bad8'; ctx.fill();
    if (rage) { glow(ctx, 2, 1, 13, '#ff4a3a', 0.8); glow(ctx, 23, 1, 13, '#ff4a3a', 0.8); }
    ell(ctx, 2, 1.5, 3.8, 4.2); fs(ctx, rage ? '#ffd8cc' : '#ffffff', 1.6); ell(ctx, 23, 1.5, 3.6, 4); fs(ctx, rage ? '#ffd8cc' : '#ffffff', 1.6);
    ctx.fillStyle = rage ? '#e0202a' : OUT; ell(ctx, 3, 2, 2, 2.2); ctx.fill(); ell(ctx, 23.8, 2, 1.9, 2.1); ctx.fill();
    poly(ctx, [-11, -13, 8.5, -5.5, 8.5, -0.5, -11, -6]); fs(ctx, furC, 2.2); poly(ctx, [33, -11, 15.5, -5.5, 15.5, -0.5, 33, -4.5]); fs(ctx, furC, 2.2);
    ell(ctx, 26, 9.5, 5.2, 3.8); ctx.fillStyle = OUT; ctx.fill(); ell(ctx, 24.6, 8.4, 1.5, 1); ctx.fillStyle = '#8a80a0'; ctx.fill();
    if (mo > 0.08) {
      const my = 19 + mo * 8, mrx = 14 + mo * 3, mry = 4 + mo * 13;
      ell(ctx, 17, my, mrx, mry); ctx.fillStyle = '#3a2440'; ctx.fill();
      ctx.save(); ctx.clip(); ell(ctx, 17, my + mry * 0.7, mrx * 0.72, mry * 0.5); ctx.fillStyle = '#e0708a'; ctx.fill(); ctx.restore();
      ell(ctx, 17, my, mrx, mry); stroke(ctx, OUT, 2.6);
      poly(ctx, [7, my - mry * 0.7, 10, my - mry * 0.15, 13, my - mry * 0.86]); fs(ctx, '#fff', 1.6); poly(ctx, [21, my - mry * 0.86, 24, my - mry * 0.15, 27, my - mry * 0.7]); fs(ctx, '#fff', 1.6);
      poly(ctx, [9, my + mry * 0.72, 11.5, my + mry * 0.18, 14, my + mry * 0.86]); fs(ctx, '#fff', 1.6); poly(ctx, [20, my + mry * 0.86, 22.5, my + mry * 0.18, 25, my + mry * 0.72]); fs(ctx, '#fff', 1.6);
    } else {
      ctx.beginPath(); ctx.moveTo(4, 19); ctx.quadraticCurveTo(17, 23.5, 30, 17.5); stroke(ctx, OUT, 2.4);
      poly(ctx, [8, 20, 10.8, 13, 13.6, 20.8]); fs(ctx, '#fff', 1.6); poly(ctx, [21.6, 20.6, 24.4, 13.2, 27, 19.4]); fs(ctx, '#fff', 1.6);
    }
    if (puff > 0.3) { ell(ctx, -2, 16, 7, 6); ctx.fillStyle = rgba('#ffffff', 0.5 * puff); ctx.fill(); }
    glow(ctx, 26, -46, 26, '#9fe4ff', rage ? 0.5 : 0.25);
    ctx.beginPath(); ctx.moveTo(8, -22); ctx.quadraticCurveTo(8, -50, 36, -62); ctx.quadraticCurveTo(22, -44, 26, -20); ctx.closePath(); fs(ctx, ice, LB);
    ctx.beginPath(); ctx.moveTo(13, -26); ctx.quadraticCurveTo(13, -44, 27, -54); stroke(ctx, iceL, 2);
    ctx.restore();
    if (rage) for (let i = 0; i < 2; i++) { const k = (t * 1.4 + i * 0.5) % 1; ell(ctx, 62 + k * 22, -160 - k * 22, 5 + k * 7); ctx.fillStyle = rgba('#ffffff', 0.6 * (1 - k)); ctx.fill(); }
    ctx.restore();
    arm(shN, nx, ny, false);
    if (boulder > 0) { // snow boulder hoisted overhead
      const bx = (nx + fx) / 2 + 4, by = min(ny, fy) - 30 * boulder, r = 36 * boulder;
      cloud(ctx, bx, by, r, r * 0.93, 9, 0.1, 0.4); ctx.fillStyle = '#f6fbff'; ctx.fill();
      ctx.save(); ctx.clip(); ell(ctx, bx - r * 0.3, by + r * 0.55, r * 1.1, r * 0.5); ctx.fillStyle = '#c9def2'; ctx.fill(); ctx.restore();
      cloud(ctx, bx, by, r, r * 0.93, 9, 0.1, 0.4); stroke(ctx, OUT, LB);
      if (boulder > 0.6) { shard(ctx, bx - r * 0.4, by - r * 0.5, -0.5, 16, 9, ice, 2.2); shard(ctx, bx + r * 0.45, by - r * 0.3, 0.7, 13, 8, ice, 2.2); }
    }
    ctx.restore();
  };
  AN.yeti = { muzzle: [80, -122], hold: [22, -250] };

  // ============================================================ 어스름 군주 녹스 (nox) 150×200 — FINAL BOSS
  // attacks: slash · orbs · warp · meteor · summon
  M.nox = function (ctx, s) {
    const t = s.t, p = s.p || 0, st = s.state, a = st === 'attack' ? s.atk : '', hit = hitK(s), mv = st === 'move', rage = !!s.rage;
    const ar = '#4b4076', arL = '#6b5ea0', arD = '#352c58', seam = '#b06aff', capeC = '#3a2550', capeL = '#7a3a86', metal = '#b8a878', boot = '#2c2448', bootD = '#221b3a', LB = 2.8, HP = -80;
    const eyeC = rage ? '#ffe0ff' : '#e3b8ff', eyeG = rage ? '#ff5af0' : '#b06aff';
    const br = sin(t * 1.8), wp = t * 7, ws = mv ? sin(wp) : 0, wc = mv ? cos(wp) : 0;
    let lean = -hit * 0.1 + (mv ? 0.05 : 0), dx = -hit * 5, dy = br * 1.2 - (mv ? abs(wc) * 2.5 : 0), rise = 0, alpha = 1, sx = 1, sy = 1;
    let hNx = 38, hNy = -96 + br * 1.5, sa = 2.3 + sin(t * 1.5) * 0.03, hFx = -34 + ws * 8, hFy = -92 + br * 1.5;
    let cape = mv ? 0.35 : 0.1, headTilt = hit * 0.1, orbN = 0, orbF = 0, pulse = -1, legTuck = 0;
    const lxN = wc * 9, lxF = -wc * 9, liftN = max(0, ws) * 7, liftF = max(0, -ws) * 7;
    if (a === 'slash') {
      hNx = key(p, [0, 38, 0.4, -8, 0.55, 58, 0.75, 54, 1, 38]); hNy = key(p, [0, -96, 0.4, -182, 0.55, -74, 0.75, -78, 1, -96]);
      sa = key(p, [0, 2.3, 0.4, -0.95, 0.55, 2.3, 0.75, 2.45, 1, 2.3]);
      lean = key(p, [0, 0, 0.4, -0.12, 0.55, 0.2, 0.75, 0.16, 1, 0]); dx = key(p, [0, 0, 0.4, -6, 0.55, 12, 0.75, 10, 1, 0]); cape = key(p, [0, 0.1, 0.4, 0.3, 0.55, 0.9, 1, 0.1]);
      hFx = key(p, [0, -34, 0.4, -20, 0.55, -50, 1, -34]); hFy = key(p, [0, -92, 0.4, -120, 0.55, -100, 1, -92]);
    } else if (a === 'orbs') {
      const u = key(p, [0, 0, 0.15, 1, 0.85, 1, 1, 0]);
      rise = u * 24 + sin(t * 3) * 3 * u; cape = 0.2 + u * 0.8; legTuck = u * 0.5; headTilt = -0.08 * u; orbN = u * 0.7; orbF = u;
      hNx = lerp(38, 66, u); hNy = lerp(-96, -150, u); sa = lerp(2.3, 0.3, u); hFx = lerp(-34, -66, u); hFy = lerp(-92, -150, u);
    } else if (a === 'warp') {
      if (p < 0.4) { const e = sm(sub(p, 0.04, 0.4)); alpha = 1 - e; sx = 1 - 0.7 * e; sy = 1 + 0.18 * e; cape = 0.5; }
      else if (p < 0.5) alpha = 0;
      else if (p < 0.7) {
        const e = sub(p, 0.5, 0.7), f = e * e, g = sm(e);
        alpha = sat(e / 0.3); rise = 90 * (1 - f); legTuck = 1 - f; cape = 1;
        hNx = lerp(-4, 52, g); hNy = lerp(-184, -66, g); sa = lerp(-0.7, 2.55, g); lean = lerp(-0.1, 0.26, e); hFx = lerp(-10, 30, g); hFy = lerp(-176, -74, g);
      } else {
        const e = sm(sub(p, 0.7, 1));
        dy += 10 * (1 - e); lean = 0.26 * (1 - e); hNx = lerp(52, 38, e); hNy = lerp(-66, hNy, e); sa = lerp(2.55, sa, e); hFx = lerp(30, hFx, e); hFy = lerp(-74, hFy, e); cape = lerp(0.8, 0.1, e);
      }
    } else if (a === 'meteor') {
      const u = key(p, [0, 0, 0.45, 1, 0.85, 1, 1, 0]);
      hFx = lerp(-34, -8, u); hFy = lerp(-92, -212, u); headTilt = -0.16 * u; orbF = u; lean = -0.05 * u; cape = 0.1 + 0.4 * u;
    } else if (a === 'summon') {
      const u = key(p, [0, 0, 0.3, 1, 0.5, 2, 0.8, 2, 1, 0]), u1 = min(1, u);
      if (u <= 1) { hNx = lerp(38, 46, u); hNy = lerp(hNy, -150, u); sa = lerp(sa, PI, u); }
      else { hNx = lerp(46, 48, u - 1); hNy = lerp(-150, -106, u - 1); sa = PI; }
      hFx = lerp(hFx, 45, u1); hFy = lerp(hFy, hNy - 14, u1);
      dy += u > 1 ? (u - 1) * 8 : 0; lean = u > 1 ? 0.1 * (u - 1) : -0.05 * u; pulse = p >= 0.5 ? sub(p, 0.5, 0.85) : -1; cape = 0.1 + 0.3 * u1;
    }
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (alpha < 0.999) { // warp: shadow wisps where he dissolves / re-forms
      for (let i = 0; i < 7; i++) {
        const k = (t * 1.3 + i * 0.143) % 1;
        ell(ctx, sin(i * 2.1 + t) * 26, -24 - i * 24 - k * 30 - rise * 0.5, 9 * (1 - k) + 3); ctx.fillStyle = rgba('#3a1f5a', 0.7 * (1 - alpha) * (1 - k)); ctx.fill();
      }
      if (alpha < 0.02) { ctx.restore(); return; }
    }
    ctx.globalAlpha = ctx.globalAlpha * alpha;
    ctx.translate(dx, -rise); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    if (rage) { // violet aura flames
      glow(ctx, 0, -110, 135, '#8a3ff0', 0.32 + 0.08 * sin(t * 6));
      for (let i = 0; i < 7; i++) {
        const k = (t * 0.9 + i * 0.143) % 1;
        ctx.save(); ctx.translate(-54 + i * 18 + sin(t * 3 + i) * 5, -30 - (i % 3) * 34 - k * 90); ctx.scale(1 - k * 0.5, 1 - k * 0.3);
        flameP(ctx, 9, 30, sin(t * 9 + i) * 3); ctx.fillStyle = rgba('#b06aff', 0.6 * (1 - k)); ctx.fill();
        ctx.restore();
      }
    }
    if (pulse >= 0) { // summon pulse at the planted blade
      glow(ctx, 48, -2, 34 + pulse * 100, seam, 0.85 * (1 - pulse));
      ctx.beginPath(); ctx.ellipse(48, -1, 20 + pulse * 110, 5 + pulse * 16, 0, 0, TAU); stroke(ctx, rgba('#d9b0ff', 0.9 * (1 - pulse)), 3);
    }
    // cape
    const cw = sin(t * 2.6) * 4, c = cape, cx0 = -78 - c * 40 + cw, hem = -4 - c * 46;
    ctx.beginPath(); ctx.moveTo(-30, -150 + dy);
    ctx.bezierCurveTo(-52 - c * 20, -120 + dy, -70 - c * 34 + cw, -70, cx0, hem - 6);
    const hz = [12, -18 - c * 6, 24, 2, 38, -16 - c * 4, 52, 4, 66, -14, 80 + c * 10, 4 + c * 10];
    for (let i = 0; i < hz.length; i += 2) ctx.lineTo(cx0 + hz[i] + sin(t * 3 + i) * 2, hem + hz[i + 1]);
    ctx.lineTo(22, -40); ctx.lineTo(30, -146 + dy); ctx.closePath(); fs(ctx, capeC, LB);
    ctx.beginPath(); ctx.moveTo(-27, -138 + dy); ctx.quadraticCurveTo(-46 - c * 18, -90, cx0 + 24, hem - 4); ctx.moveTo(-13, -138 + dy); ctx.quadraticCurveTo(-24 - c * 10, -84, cx0 + 52, hem - 2); stroke(ctx, capeL, 2.4);
    const shN = rot2(0, HP, 30, -142, lean), shF = rot2(0, HP, -28, -144, lean);
    shN[1] += dy; shF[1] += dy;
    const arm = (sh, hx, hy, far, de) => {
      const e = elbow(sh[0], sh[1], hx, hy, 31, 31, de);
      limb2(ctx, sh[0], sh[1], e[0], e[1], hx, hy, 15, far ? arD : ar, LB);
      ell(ctx, e[0], e[1], 7); fs(ctx, far ? ar : arL, 2.2);
      poly(ctx, [hx - 9, hy - 9, hx - 14, hy - 15, hx - 3, hy - 11]); fs(ctx, far ? ar : arL, 2);
      ell(ctx, hx, hy, 9.5, 9); fs(ctx, far ? bootD : boot, 2.4);
    };
    const orb = (x, y, k) => {
      if (k <= 0.02) return;
      glow(ctx, x, y, 26 * k + sin(t * 9) * 2, '#8a3ff0', 0.85 * k);
      ell(ctx, x, y, 8.5 * k); ctx.fillStyle = '#120a22'; ctx.fill(); stroke(ctx, '#c9a0ff', 2);
      ell(ctx, x - 2.5 * k, y - 3 * k, 2 * k); ctx.fillStyle = '#e3ccff'; ctx.fill();
    };
    const leg = (x, lx, lift, far) => {
      const tk = legTuck, top = -82 + dy, kx = x + lx * 0.5 + (far ? -2 : 3) + tk * 6, ky = -44 - lift * 0.6 - tk * 12, fx2 = x + lx - tk * 10, fy2 = -lift - tk * 22;
      limb2(ctx, x, top, kx, ky, fx2, fy2 - 9, 17, far ? arD : ar, LB);
      poly(ctx, [kx - 7, ky - 8, kx + 9, ky - 2, kx - 4, ky + 9]); fs(ctx, far ? ar : arL, 2.2);
      ctx.beginPath(); ctx.moveTo(fx2 - 10, fy2 - 15); ctx.lineTo(fx2 + 9, fy2 - 15); ctx.lineTo(fx2 + 23, fy2 - 3); ctx.lineTo(fx2 + 23, fy2); ctx.lineTo(fx2 - 10, fy2); ctx.closePath(); fs(ctx, far ? bootD : boot, LB);
      ctx.beginPath(); ctx.moveTo(fx2 - 9, fy2 - 15); ctx.lineTo(fx2 + 9, fy2 - 15); stroke(ctx, far ? shade(metal, -0.3) : metal, 2);
    };
    const lant = (x, y, sc, r, lit) => { // crown lantern frame
      ctx.save(); ctx.translate(x, y); ctx.rotate(r); ctx.scale(sc, sc);
      rr(ctx, -5, -16, 10, 14, 2); fs(ctx, '#151022', 2.2);
      if (lit) { glow(ctx, 0, -9, 11, '#b06aff', 0.8); ctx.save(); ctx.translate(0, -4); flameP(ctx, 2.6, 8, sin(t * 15 + x) * 0.8); ctx.fillStyle = '#b06aff'; ctx.fill(); ctx.restore(); }
      ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, -2); stroke(ctx, metal, 1.5);
      poly(ctx, [-6.5, -16, 0, -22, 6.5, -16]); fs(ctx, metal, 2);
      rr(ctx, -6, -3.4, 12, 3.4, 1); fs(ctx, metal, 1.8);
      ctx.restore();
    };
    const sword = () => {
      ctx.save(); ctx.translate(hNx, hNy); ctx.rotate(sa);
      rr(ctx, -2.6, -8, 5.2, 26, 2); fs(ctx, '#17122a', 2.2);
      rr(ctx, -4.6, 17, 9.2, 9, 2); fs(ctx, '#1b1526', 2); rr(ctx, -5.6, 15.4, 11.2, 3, 1.2); fs(ctx, metal, 1.6);
      glow(ctx, 0, -60, 40, seam, rage ? 0.55 : 0.32);
      const bl = [-8.5, -12, -9.5, -40, -6, -44, -9.5, -52, -8, -92, 0, -112, 8, -92, 8.5, -12];
      poly(ctx, bl); ctx.fillStyle = '#4a4268'; ctx.fill();
      poly(ctx, [2.5, -13, 8.5, -12, 8, -92, 0, -112, 2.5, -90]); ctx.fillStyle = '#6c6294'; ctx.fill();
      poly(ctx, bl); stroke(ctx, OUT, LB);
      ctx.beginPath(); ctx.moveTo(-1.5, -18); ctx.lineTo(-1.5, -90); stroke(ctx, '#c9a0ff', 2);
      poly(ctx, [-22, -17, -14, -8.5, 14, -8.5, 22, -17, 16, -5, 0, -2, -16, -5]); fs(ctx, metal, 2.4);
      ell(ctx, 0, -9, 3.6); fs(ctx, seam, 1.6);
      ctx.restore();
    };
    leg(-14, lxF, liftF, true); leg(14, lxN, liftN, false);
    arm(shF, hFx, hFy, true, hFy < shF[1] - 20 ? -1 : 1); orb(hFx - 2, hFy - 18, orbF);
    ctx.save(); ctx.translate(0, dy); ctx.translate(0, HP); ctx.rotate(lean); ctx.translate(0, -HP);
    // far pauldron
    poly(ctx, [-40, -160, -50, -176, -30, -164]); fs(ctx, arD, 2.4); ell(ctx, -31, -152, 17, 11.5); fs(ctx, ar, LB);
    // waist skirt
    poly(ctx, [-24, -95, 24, -95, 29, -66, 14, -58, 0, -65, -14, -58, -29, -66]); fs(ctx, arD, LB);
    ctx.beginPath(); ctx.moveTo(-26.5, -68.5); ctx.lineTo(-14, -61.5); ctx.lineTo(0, -68.5); ctx.lineTo(14, -61.5); ctx.lineTo(26.5, -68.5); stroke(ctx, metal, 2);
    ctx.beginPath(); ctx.moveTo(-14, -90); ctx.lineTo(-14, -66); ctx.moveTo(14, -90); ctx.lineTo(14, -66); stroke(ctx, rgba('#c58aff', 0.85), 1.8);
    // torso
    rpoly(ctx, [-30, -153, 32, -153, 24, -90, -22, -90], 9); fs(ctx, ar, LB);
    rpoly(ctx, [-24, -150, 27, -150, 19, -115, -16, -115], 8); fs(ctx, arL, 2.4);
    glow(ctx, 3, -122, 28, seam, rage ? 0.6 : 0.36);
    ctx.beginPath(); ctx.moveTo(-18, -146); ctx.lineTo(3, -124); ctx.lineTo(24, -146); ctx.moveTo(3, -112); ctx.lineTo(3, -98); stroke(ctx, '#e3c4ff', 2);
    poly(ctx, [3, -131, 9.5, -122, 3, -112, -3.5, -122]); fs(ctx, seam, 2);
    ctx.fillStyle = bootD; ctx.fillRect(-21.5, -99, 44, 6.4); rr(ctx, -1, -100.4, 9, 9, 2); fs(ctx, metal, 1.8);
    // dead belt lantern
    ctx.save(); ctx.translate(19, -93); ctx.rotate(sin(t * 2.4) * 0.14 - lean + ws * 0.1);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 7); stroke(ctx, OUT, 2.2);
    if (rage) glow(ctx, 0, 18, 15 + sin(t * 17) * 3, '#b06aff', 0.65 + sin(t * 23) * 0.2);
    rr(ctx, -5.8, 10.4, 11.6, 14.4, 2.6); fs(ctx, rage ? '#2a1848' : '#3a344c', 2.2);
    if (rage) { ctx.save(); ctx.translate(0, 22.5); flameP(ctx, 3, 9 + sin(t * 19) * 1.5, sin(t * 14) * 1); ctx.fillStyle = '#c58aff'; ctx.fill(); flameP(ctx, 1.4, 5, 0); ctx.fillStyle = '#1a0f2e'; ctx.fill(); ctx.restore(); }
    ctx.beginPath(); ctx.moveTo(-2, 12.6); ctx.lineTo(1.2, 16.6); ctx.lineTo(-1.6, 19.4); ctx.lineTo(1.8, 23.4); stroke(ctx, '#a39db3', 1.3);
    rr(ctx, -6.8, 7, 13.6, 4, 1.6); fs(ctx, '#6a6478', 2); rr(ctx, -6.8, 24, 13.6, 3.6, 1.4); fs(ctx, '#6a6478', 2);
    ctx.restore();
    // head
    ctx.save(); ctx.translate(4, -170); ctx.rotate(headTilt);
    ctx.beginPath(); ctx.moveTo(-15, 4); ctx.quadraticCurveTo(-31, 12, -31, 34); ctx.lineTo(-9, 24); ctx.closePath(); fs(ctx, arD, 2.4);
    ell(ctx, 0, 0, 22, 23); fs(ctx, arD, LB);
    ctx.beginPath(); ctx.arc(0, 0, 17.5, PI * 1.02, PI * 1.36); stroke(ctx, arL, 2.4);
    ctx.beginPath(); ctx.ellipse(6.5, 3.5, 15.2, 16.2, 0, PI * 0.9, PI * 2.1); stroke(ctx, ar, 2.2);
    ell(ctx, 6.5, 3.5, 13.5, 14.5); ctx.fillStyle = '#0d0916'; ctx.fill();
    glow(ctx, 2, 2, rage ? 19 : 12, eyeG, 0.9); glow(ctx, 13.5, 2, rage ? 18 : 11, eyeG, 0.9);
    poly(ctx, [-3, -1.4, 5.4, 1.6, 4.6, 4.4, -2.6, 3]); ctx.fillStyle = eyeC; ctx.fill(); poly(ctx, [17.6, -1.2, 9.8, 1.6, 10.4, 4.4, 17, 3]); ctx.fill();
    if (rage) for (let i = 0; i < 2; i++) { ctx.save(); ctx.translate(i ? 16.5 : -2.5, 0); ctx.rotate(i ? 0.5 : -0.5); flameP(ctx, 2.6, 11 + sin(t * 16 + i) * 2.5, sin(t * 12 + i) * 1.4); ctx.fillStyle = rgba('#ff7af4', 0.85); ctx.fill(); ctx.restore(); }
    ctx.beginPath(); ctx.moveTo(-20, -8.5); ctx.quadraticCurveTo(2, -19, 22, -8); stroke(ctx, OUT, 8.8); stroke(ctx, metal, 4.4);
    lant(-11, -14.5, 0.8, -0.28, rage); lant(3, -17.5, 1.12, 0, rage); lant(16.5, -13.5, 0.8, 0.3, rage);
    ctx.restore();
    // near pauldron
    poly(ctx, [27, -160, 40, -178, 44, -158]); fs(ctx, ar, 2.4); ell(ctx, 34, -150, 18.5, 12.5); fs(ctx, arL, LB);
    ctx.beginPath(); ctx.arc(34, -150, 12, PI * 1.1, PI * 1.6); stroke(ctx, metal, 2);
    ctx.restore();
    sword(); orb(hNx + sin(sa) * 112, hNy - cos(sa) * 112, orbN);
    arm(shN, hNx, hNy, false, hNy < shN[1] - 20 ? 1 : -1);
    ctx.restore();
  };
  AN.nox = { muzzle: [70, -90], hand: [-10, -230], tip: [121, -21] };
})();
