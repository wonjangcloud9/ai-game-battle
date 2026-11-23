/* 어스름 전선 — art2: 미니언·중립 몬스터·등불탑·큰등불·길가 등불 그리기 + 아이콘
   좌표 규칙은 art.js 와 같다 (원점 = 발밑, 위쪽 = -y). */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, X = TW.X, Art = TW.Art, TAU = Math.PI * 2;
  const ball = Art.ball, dot = Art.dot, seg = Art.seg, grad = Art.grad, K = Art.K;

  function atkCurve(a, w) {            // 공격 진행도 → 내지르는 정도(-0.35 ~ 1.2). 맞는 순간(a = w)에 끝까지 뻗는다 (art.js 의 영웅과 같은 박자)
    if (!(a >= 0)) return 0; w = w || 0.3;
    const s0 = Math.max(0.12, w - 0.11);
    if (a < s0) return -0.35 * U.easeOut(a / s0);
    if (a < w) return -0.35 + 1.55 * U.easeIn((a - s0) / (w - s0));
    if (a < w + 0.07) return 1.2;
    return 1.2 * (1 - U.smooth((a - w - 0.07) / Math.max(0.05, 1 - w - 0.07)));
  }

  /* ---------- 미니언: 팀 색 불씨를 인 작은 등불병 ---------- */
  Art.minion = function (ctx, kind, team, pose, glow) {
    const f = pose.f, fx = Math.cos(f), fy = Math.sin(f), px = -fy, py = fx, t = pose.t || 0;
    const col = C.TEAM_COL[team], light = C.TEAM_LIGHT[team], deep = C.TEAM_DEEP[team];
    const dark = U.mix(deep, '#14162a', 0.55), mid = U.mix(deep, '#3a3550', 0.35);
    const bob = Math.sin((pose.walk || 0) * 2) * 0.05 * (pose.mv || 0), ext = atkCurve(pose.atk, 0.3);
    const gx = (a, s) => fx * a + px * s, gy = (a, s) => (fy * a + py * s) * K;
    if (kind === 'siege') {              // 화톳불 수레: 위에서 본 네모 수레
      ctx.save(); ctx.translate(0, -0.25); ctx.scale(1, 0.72); ctx.rotate(f);
      for (const s of [-1, 1]) { X.rr(ctx, -0.5, s * 0.72 - 0.14, 1.0, 0.28, 0.1); ctx.fillStyle = '#2b2430'; ctx.fill(); }
      X.rr(ctx, -0.95, -0.6, 1.9, 1.2, 0.18); ctx.fillStyle = '#5a4634'; ctx.fill();
      X.rr(ctx, -0.8, -0.45, 1.6, 0.9, 0.12); ctx.fillStyle = dark; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 0.09; ctx.strokeRect(-0.8, -0.45, 1.6, 0.9);
      ctx.restore();
      const fl = 0.85 + 0.15 * Math.sin(t * 11), kx = -fx * Math.max(0, ext) * 0.15, ky = -fy * Math.max(0, ext) * 0.1;
      ball(ctx, kx, -0.75 + ky, 0.55, 0.36, '#6a5a50', '#2b2430');
      ball(ctx, kx, -0.95 + ky, 0.36 * fl, 0.45 * fl, '#ffffff', col);
      if (glow) glow(kx, -0.95 + ky, 1.5, col, 0.75 * fl);
      return;
    }
    const big = kind === 'super', S = big ? 1.75 : 1;
    ctx.save(); if (big) ctx.scale(S, S);
    const st = Math.sin(pose.walk || 0) * 0.2 * (pose.mv || 0);
    for (const s of [-1, 1]) { X.ell(ctx, gx(st * s, s * 0.2), gy(st * s, s * 0.2) - 0.04, 0.13, 0.08); ctx.fillStyle = '#17142a'; ctx.fill(); }
    const back = fy < 0;
    const weapon = () => {
      if (kind === 'ranged') {
        const x = gx(0.3 + ext * 0.12, 0.34), y = gy(0.3, 0.34) - 0.55 + bob;
        seg(ctx, x, y + 0.35, x, y - 0.55, 0.05, '#4a3a30');
        dot(ctx, x, y - 0.62, 0.11 + Math.max(0, ext) * 0.05, light); if (glow) glow(x, y - 0.62, 0.5 + Math.max(0, ext) * 0.4, col, 0.7);
      } else {
        const r = 0.35 + ext * 0.4, x = gx(r, 0.3), y = gy(r, 0.3) - 0.5 + bob;
        const tx = x + fx * (big ? 0.5 : 0.75), ty = y + fy * (big ? 0.5 : 0.75) * K;
        seg(ctx, x - fx * 0.3, y - fy * 0.3 * K, tx, ty, big ? 0.1 : 0.05, '#6a5a50');
        if (big) { dot(ctx, tx, ty, 0.2, '#8d8794'); dot(ctx, tx, ty, 0.1, light); } else dot(ctx, tx, ty, 0.07, light);
        const sx = gx(0.3, -0.3), sy = gy(0.3, -0.3) - 0.48 + bob;
        X.ell(ctx, sx, sy, 0.2, 0.25); ctx.fillStyle = mid; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 0.05; ctx.stroke();
      }
    };
    if (back) weapon();
    ball(ctx, 0, -0.46 + bob, kind === 'ranged' ? 0.3 : 0.36, 0.4, mid, dark);
    ctx.strokeStyle = col; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.ellipse(0, -0.42 + bob, kind === 'ranged' ? 0.3 : 0.36, 0.13, 0, 0.2, Math.PI - 0.2); ctx.stroke();
    const hx = fx * 0.05, hy = -0.98 + bob;
    ball(ctx, hx, hy, 0.27, 0.26, U.mix(deep, '#8a84a0', 0.5), dark);
    for (const s of [-1, 1]) { const a = f + s * 0.5, sn = Math.sin(a); if (sn < -0.25) continue; dot(ctx, hx + Math.cos(a) * 0.2, hy + sn * 0.1 + 0.03, 0.045, light); }
    // 머리 위 불씨
    const fl = 0.8 + 0.2 * Math.sin(t * 9 + team * 2), fyy = hy - 0.36;
    ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(hx - 0.1, fyy + 0.08); ctx.quadraticCurveTo(hx - 0.14, fyy - 0.1, hx + Math.sin(t * 7) * 0.04, fyy - 0.3 * fl); ctx.quadraticCurveTo(hx + 0.14, fyy - 0.1, hx + 0.1, fyy + 0.08); ctx.closePath(); ctx.fill();
    if (glow) glow(hx * S, (fyy - 0.08) * S, (big ? 1.2 : 0.62) * (pose.emp ? 1.5 : 1), pose.emp ? '#7dffd9' : col, 0.6 * fl);
    if (big) { for (const s of [-1, 1]) { const x = gx(0, s * 0.42), y = gy(0, s * 0.42) - 0.66 + bob; ball(ctx, x, y, 0.2, 0.17, '#8d8794', '#3a3550'); } dot(ctx, fx * 0.2, -0.5 + bob + fy * 0.08, 0.1, light); }
    if (!back) weapon();
    ctx.restore();
  };

  /* ---------- 중립 몬스터 ---------- */
  function beast(ctx, f, len, wid, y0, top, bot) {       // 위에서 본 네발짐승 몸통
    ctx.save(); ctx.translate(0, y0); ctx.scale(1, 0.72); ctx.rotate(f);
    X.ell(ctx, 0, 0, len, wid); ctx.fillStyle = grad(ctx, -wid, wid, top, bot); ctx.fill();
    return ctx;
  }
  const M = {};
  M.shroom = function (ctx, p, glow) {
    const hop = Math.abs(Math.sin(p.t * 3.2 + (p.seed || 0))) * 0.16 * (p.mv ? 1.4 : 0.6), fx = Math.cos(p.f), fy = Math.sin(p.f);
    ball(ctx, 0, -0.3 - hop, 0.26, 0.3, '#f1e6d6', '#a8977f');
    for (const s of [-1, 1]) { const a = p.f + s * 0.5, sn = Math.sin(a); if (sn > -0.25) dot(ctx, Math.cos(a) * 0.2, -0.32 - hop + sn * 0.08, 0.04, '#2a2238'); }
    ball(ctx, fx * 0.03, -0.68 - hop, 0.56, 0.36, '#c86ad8', '#5a2a7a');
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.4, x = Math.cos(a) * 0.3, y = -0.74 - hop + Math.sin(a) * 0.13; dot(ctx, x, y, 0.07, '#f4d8ff'); }
    if (glow) glow(0, -0.72 - hop, 0.9, '#d88cff', 0.4 + 0.2 * Math.sin(p.t * 4 + (p.seed || 0)));
  };
  function boarLike(ctx, p, glow, s) {
    const f = p.f, fx = Math.cos(f), fy = Math.sin(f), st = Math.sin(p.walk || 0) * 0.15 * (p.mv || 0), lunge = Math.max(0, atkCurve(p.atk, 0.3)) * 0.3;
    for (const a of [-1, 1]) for (const b of [-1, 1]) { const x = fx * (a * 0.5 * s + st * a * b) - fy * b * 0.36 * s, y = (fy * (a * 0.5 * s + st * a * b) + fx * b * 0.36 * s) * K; X.ell(ctx, x, y - 0.05, 0.14 * s, 0.1 * s); ctx.fillStyle = '#2a2018'; ctx.fill(); }
    const c = beast(ctx, f, 0.95 * s, 0.6 * s, -0.5 * s, '#8a6e56', '#3d2d22');
    c.fillStyle = '#d8c8b0'; for (let i = -3; i <= 2; i++) { c.beginPath(); c.moveTo(i * 0.22 * s - 0.08 * s, -0.12 * s); c.lineTo(i * 0.22 * s - 0.2 * s, -0.75 * s); c.lineTo(i * 0.22 * s + 0.08 * s, -0.12 * s); c.closePath(); c.fill(); }
    c.restore();
    const hx = fx * (0.85 * s + lunge), hy = fy * (0.85 * s + lunge) * K - 0.5 * s;
    ball(ctx, hx, hy, 0.38 * s, 0.34 * s, '#9a7c62', '#4a372a');
    for (const b of [-1, 1]) {
      const tx = hx + fx * 0.3 * s - fy * b * 0.26 * s, ty = hy + (fy * 0.3 * s + fx * b * 0.26 * s) * K;
      seg(ctx, tx, ty, tx + fx * 0.22 * s - fy * b * 0.1 * s, ty - 0.2 * s, 0.07 * s, '#f4ead8');
      const a = f + b * 0.55; if (Math.sin(a) > -0.3) { dot(ctx, hx + Math.cos(a) * 0.26 * s, hy + Math.sin(a) * 0.12 * s - 0.03, 0.05 * s, '#ff6a4a'); if (glow) glow(hx + Math.cos(a) * 0.26 * s, hy + Math.sin(a) * 0.12 * s - 0.03, 0.3 * s, '#ff6a4a', 0.6); }
    }
  }
  M.boar = (ctx, p, glow) => boarLike(ctx, p, glow, 1.15);
  M.piglet = (ctx, p, glow) => boarLike(ctx, p, glow, 0.6);
  M.crab = function (ctx, p, glow) {
    const f = p.f, fx = Math.cos(f), fy = Math.sin(f), w = Math.sin((p.walk || 0) * 1.5 + p.t * 2) * 0.06, snap = Math.max(0, atkCurve(p.atk, 0.3)) * 0.3;
    ctx.strokeStyle = '#5a6470'; ctx.lineWidth = 0.09; ctx.lineCap = 'round';
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.5, bx = -fy * s * 0.6 + fx * a * 0.5, by = (fx * s * 0.6 + fy * a * 0.5) * K - 0.25; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - fy * s * 0.5, by + fx * s * 0.5 * K + 0.2 + (i % 2 ? w : -w)); ctx.stroke(); }
    const c = beast(ctx, f + Math.PI / 2, 0.92, 0.66, -0.42, '#a8b4b8', '#4a5560');
    c.fillStyle = 'rgba(120,180,110,0.55)'; X.ell(c, -0.2, -0.1, 0.4, 0.26); c.fill(); X.ell(c, 0.36, 0.14, 0.22, 0.16); c.fill();
    c.restore();
    for (const s of [-1, 1]) {
      const cx = fx * (0.55 + snap) - fy * s * 0.75, cy = (fy * (0.55 + snap) + fx * s * 0.75) * K - 0.5;
      ball(ctx, cx, cy, 0.3, 0.24, '#c3ced2', '#5a6470');
      seg(ctx, cx, cy, cx + fx * 0.3, cy + fy * 0.3 * K, 0.08, '#2c343c');
      const ex = fx * 0.4 - fy * s * 0.22, ey = (fy * 0.4 + fx * s * 0.22) * K - 0.78;
      seg(ctx, ex, ey + 0.26, ex, ey, 0.05, '#5a6470'); dot(ctx, ex, ey, 0.07, '#ffe680'); if (glow) glow(ex, ey, 0.28, '#ffe680', 0.5);
    }
  };
  M.water = function (ctx, p, glow) {        // 샘지기: 뿔에 물방울이 맺힌 사슴 정령
    const f = p.f, fx = Math.cos(f), fy = Math.sin(f), px = -fy, py = fx, st = Math.sin(p.walk || 0) * 0.2 * (p.mv || 0), nod = Math.max(0, atkCurve(p.atk, 0.3)) * 0.35;
    for (const a of [-1, 1]) for (const b of [-1, 1]) { const x = fx * (a * 0.6 + st * a * b) + px * b * 0.34, y = (fy * (a * 0.6 + st * a * b) + py * b * 0.34) * K; seg(ctx, x, y - 0.75, x, y - 0.05, 0.13, '#2f6f8c'); }
    const c = beast(ctx, f, 1.1, 0.6, -0.95, '#9fe4ff', '#2f7fa8'); c.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 4; i++) { X.ell(c, -0.5 + i * 0.36, -0.12 + (i % 2) * 0.2, 0.1, 0.08); c.fill(); } c.restore();
    const hx = fx * (1.15 + nod), hy = fy * (1.15 + nod) * K - 1.55 + nod * 0.5;
    seg(ctx, fx * 0.8, fy * 0.8 * K - 1.05, hx, hy, 0.32, '#6fc4e8');
    ball(ctx, hx, hy, 0.36, 0.3, '#c8f2ff', '#4f9fc8');
    eyesSimple(ctx, f, hx, hy, 0.3, '#ffffff', glow, '#9fe8ff');
    ctx.strokeStyle = '#e4faff'; ctx.lineWidth = 0.09; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const bx = hx + px * s * 0.2, by = hy - 0.22 + py * s * 0.1;
      const pts = [[0.45, -0.6], [0.95, -0.75], [0.6, -1.15]];
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + px * s * 0.45 - fx * 0.1, by - 0.6); ctx.lineTo(bx + px * s * 0.95, by - 0.75); ctx.moveTo(bx + px * s * 0.45 - fx * 0.1, by - 0.6); ctx.lineTo(bx + px * s * 0.6 - fx * 0.2, by - 1.15); ctx.stroke();
      for (const q of [pts[1], pts[2]]) { const dx = bx + px * s * q[0], dy = by + q[1] + Math.sin(p.t * 3 + q[0] * 5) * 0.04; dot(ctx, dx, dy + 0.1, 0.09, '#dff8ff'); if (glow) glow(dx, dy + 0.1, 0.5, '#5fd4ff', 0.7); }
    }
    if (glow) glow(0, -0.95, 1.9, '#5fd4ff', 0.28);
  };
  function eyesSimple(ctx, f, hx, hy, R, color, glow, gcol) {
    for (const s of [-1, 1]) { const a = f + s * 0.5, sn = Math.sin(a); if (sn < -0.3) continue; const ex = hx + Math.cos(a) * R * 0.8, ey = hy + sn * R * 0.4 + R * 0.05; dot(ctx, ex, ey, R * 0.17, color); if (glow) glow(ex, ey, R * 0.9, gcol || color, 0.6); }
  }
  M.fire = function (ctx, p, glow) {         // 잉걸 두꺼비: 등에 불씨 혹이 난 두꺼비
    const f = p.f, fx = Math.cos(f), fy = Math.sin(f), px = -fy, py = fx, br = 1 + Math.sin(p.t * 2.2) * 0.04, puff = Math.max(0, atkCurve(p.atk, 0.3)) * 0.2;
    for (const a of [-1, 1]) for (const b of [-1, 1]) { const x = fx * a * 0.75 + px * b * 0.95, y = (fy * a * 0.75 + py * b * 0.95) * K; X.ell(ctx, x, y - 0.1, 0.36, 0.22); ctx.fillStyle = '#4a3528'; ctx.fill(); }
    const c = beast(ctx, f, 1.25 * br, 1.1 * br, -0.7, '#b0623a', '#4a2418'); c.restore();
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.3, r = 0.3 + (i % 3) * 0.26, lx = Math.cos(a) * r - 0.1, ly = Math.sin(a) * r, x = fx * lx + px * ly, y = (fy * lx + py * ly) * K * 0.9 - 0.95;
      const pl = 0.6 + 0.4 * Math.sin(p.t * 3 + i * 1.7); dot(ctx, x, y, 0.13 + (i % 2) * 0.05, pl > 0.75 ? '#fff0c0' : '#ffb347'); if (glow) glow(x, y, 0.5, '#ff8a3c', 0.5 * pl);
    }
    const hx = fx * 1.0, hy = fy * 1.0 * K - 0.8;
    ball(ctx, hx, hy, 0.62, 0.42, '#c47848', '#5a2e1e');
    ball(ctx, hx + fx * 0.1, hy + 0.2 + fy * 0.05, 0.4 + puff, 0.24 + puff, '#f0d0a0', '#b08858');
    for (const s of [-1, 1]) { const ex = hx + px * s * 0.36 - fx * 0.05, ey = hy - 0.32 + py * s * 0.36 * K; ball(ctx, ex, ey, 0.17, 0.17, '#d89868', '#6a3a26'); dot(ctx, ex + fx * 0.05, ey + fy * 0.03, 0.08, '#ffe680'); if (glow) glow(ex, ey, 0.4, '#ffb347', 0.6); }
    if (glow) glow(0, -0.9, 2.2, '#ff8a3c', 0.3);
  };
  M.elder = function (ctx, p, glow) {        // 고목 정령: 걷는 그루터기
    const f = p.f, fx = Math.cos(f), fy = Math.sin(f), px = -fy, py = fx, sw = atkCurve(p.atk, 0.3), b = Math.sin(p.t * 1.6) * 0.05;
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const a = s * (0.5 + i * 0.55), x = Math.cos(f + a + Math.PI) * 1.5, y = Math.sin(f + a + Math.PI) * 1.5 * K; seg(ctx, x * 0.5, y * 0.5 - 0.3, x, y - 0.05, 0.3 - i * 0.05, '#4a3a2a'); }
    ctx.beginPath(); ctx.moveTo(-1.35, -0.2); ctx.quadraticCurveTo(-1.6, -1.8 + b, -1.05, -3.1 + b); ctx.lineTo(-0.5, -3.5 + b); ctx.lineTo(0.2, -3.2 + b); ctx.lineTo(0.9, -3.6 + b); ctx.quadraticCurveTo(1.65, -1.9 + b, 1.35, -0.2); ctx.quadraticCurveTo(0, 0.25, -1.35, -0.2); ctx.closePath();
    ctx.fillStyle = grad(ctx, -3.5, 0, '#7a6248', '#352a20'); ctx.fill();
    ctx.strokeStyle = 'rgba(30,22,16,0.55)'; ctx.lineWidth = 0.08; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 0.45, -3.0 + b + Math.abs(i) * 0.2); ctx.quadraticCurveTo(i * 0.55 + 0.1, -1.6, i * 0.5, -0.15); ctx.stroke(); }
    ball(ctx, -0.6, -3.5 + b, 0.9, 0.5, '#5fa85a', '#2a5a34'); ball(ctx, 0.75, -3.65 + b, 0.75, 0.42, '#6ab862', '#2f6238'); ball(ctx, 0.05, -3.9 + b, 0.7, 0.4, '#7ac870', '#356a3c');
    const v = U.clamp((fy + 0.5) / 0.5, 0, 1);
    if (v > 0) {
      ctx.globalAlpha = v;
      for (const s of [-1, 1]) { const ex = fx * 0.55 + px * s * 0.42, ey = -2.25 + b + py * s * 0.2; X.ell(ctx, ex, ey, 0.17, 0.24); ctx.fillStyle = '#c8ff9a'; ctx.fill(); if (glow) glow(ex, ey, 0.85, '#9fe07a', 0.8 * v); }
      X.ell(ctx, fx * 0.55, -1.6 + b, 0.32 * (0.4 + 0.6 * Math.abs(fy)), 0.2 + Math.max(0, sw) * 0.14); ctx.fillStyle = '#17130e'; ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const s of [-1, 1]) {       // 가지 팔
      const act = s > 0 ? sw : 0, ax = px * s * 1.3 + fx * (0.3 + act * 0.8), ay = (py * s * 1.3 + fy * (0.3 + act * 0.8)) * K - 1.9 - Math.max(0, -act) * 1.6 + b;
      seg(ctx, px * s * 1.1, py * s * 1.1 * K - 2.3 + b, ax, ay, 0.34, '#5a4632');
      seg(ctx, ax, ay, ax + fx * 0.8 + px * s * 0.3, ay + 0.55 + fy * 0.4, 0.26, '#4a3a2a');
      for (let i = -1; i <= 1; i++) seg(ctx, ax + fx * 0.8 + px * s * 0.3, ay + 0.55 + fy * 0.4, ax + fx * 1.1 + px * s * (0.3 + i * 0.3), ay + 0.95 + fy * 0.5, 0.1, '#4a3a2a');
    }
    if (glow) glow(0, -2.0, 2.6, '#9fe07a', 0.16);
  };
  M.boss = function (ctx, p, glow) {         // 이무기: 물에서 솟은 거대한 뱀. 몸은 똬리, 머리는 대상을 본다
    const t = p.t, f = p.f, fx = Math.cos(f), fy = Math.sin(f), rage = p.rage ? 1 : 0, strike = Math.max(0, atkCurve(p.atk, 0.3));
    const N = 22, pts = [];
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1), a = k * 5.2 + t * 0.5 + 1.2, r = 3.0 - k * 1.5 + Math.sin(t * 1.4 + k * 6) * 0.14;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * K, h: Math.max(0, k - 0.45) * 5.2 + Math.sin(t * 2 + k * 5) * 0.12 * k, k });
    }
    // 머리 쪽 끝은 바라보는 방향으로 숙인다
    const head = pts[N - 1], hx = head.x * 0.25 + fx * (1.5 + strike * 1.6), hy = head.y * 0.25 + fy * (1.5 + strike * 1.6) * K, hh = 3.4 - strike * 1.4 + Math.sin(t * 1.7) * 0.15;
    for (let i = N - 5; i < N; i++) { const k = (i - (N - 5)) / 4, q = pts[i]; q.x = U.lerp(q.x, hx, k * k); q.y = U.lerp(q.y, hy, k * k); q.h = U.lerp(q.h, hh, k); }
    const order = pts.map((q, i) => i).sort((a, b) => (pts[a].y - pts[a].h * 0.02) - (pts[b].y - pts[b].h * 0.02));
    for (const i of order) {
      const q = pts[i], r = 1.0 - q.k * 0.3 + (i === N - 1 ? 0.25 : 0), y = q.y - q.h - 0.5;
      if (q.h < 0.4) { X.ell(ctx, q.x, q.y - 0.2, r * 1.35, r * 0.55); ctx.fillStyle = 'rgba(190,255,240,0.22)'; ctx.fill(); }
      ball(ctx, q.x, y, r, r * 0.9, i % 2 ? '#4fb8a4' : '#3a9a90', '#123c44');
      if (i % 3 === 0) { dot(ctx, q.x, y - r * 0.35, r * 0.2, '#b8ffe9'); if (glow) glow(q.x, y - r * 0.35, r * 0.9, '#7dffd9', 0.4 + rage * 0.3); }
    }
    const y = hy - hh - 0.5;
    ball(ctx, hx + fx * 0.6, y + fy * 0.25 + 0.15, 0.95, 0.7, '#5fc8b4', '#17484e');       // 주둥이
    for (const s of [-1, 1]) {
      const ex = hx - fy * s * 0.6 + fx * 0.25, ey = y - 0.35 + fx * s * 0.25;
      X.ell(ctx, ex, ey, 0.2, 0.26); ctx.fillStyle = rage ? '#ffb0a0' : '#eafff6'; ctx.fill(); if (glow) glow(ex, ey, 1.0, rage ? '#ff7a5a' : '#7dffd9', 0.9);
      ctx.strokeStyle = '#d6fff2'; ctx.lineWidth = 0.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx - fy * s * 0.5 - fx * 0.3, y - 0.6); ctx.quadraticCurveTo(hx - fy * s * 1.1 - fx * 0.9, y - 1.4, hx - fy * s * 0.8 - fx * 1.6, y - 1.9 + Math.sin(t * 2 + s) * 0.1); ctx.stroke();
      ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(hx + fx * 1.2 - fy * s * 0.4, y + 0.2); ctx.quadraticCurveTo(hx + fx * 2.0 - fy * s * 1.2, y + 0.5 + Math.sin(t * 3 + s) * 0.2, hx + fx * 1.6 - fy * s * 1.9, y + 1.1); ctx.stroke();
    }
    if (glow) { glow(0, -1.2, 5.5, '#7dffd9', 0.22 + rage * 0.1); glow(hx, y, 2.0, rage ? '#ff7a5a' : '#7dffd9', 0.3); }
  };
  M.sala = function (ctx, p, glow) {         // 노을 도롱뇽: 불씨 강에서 기어오른 붉은 도롱뇽. 등에 불씨 점, 머리에 불꽃 볏, 꼬리는 천천히 흔들린다
    const t = p.t, f = p.f, fx = Math.cos(f), fy = Math.sin(f), rage = p.rage ? 1 : 0, strike = Math.max(0, atkCurve(p.atk, 0.3));
    const N = 11, L = 5.4, pts = [];
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1), s = (k - 0.42) * L + strike * k * k * 1.1, w = Math.sin(t * 2.6 - k * 4.2) * 0.42 * (1 - k * 0.85);
      const r = k < 0.12 ? 0.3 + k * 2.5 : k > 0.86 ? 0.82 : 0.62 + Math.sin(k * Math.PI) * 0.42;
      pts.push({ x: fx * s - fy * w, y: (fy * s + fx * w) * K, h: 0.55 + Math.max(0, k - 0.7) * 2.2 + strike * k * 0.8, r, k });
    }
    // 다리 넷 (몸통 둘째 · 여섯째 마디)
    for (const [i, ph] of [[3, 0], [7, Math.PI]]) {
      const q = pts[i];
      for (const sd of [-1, 1]) {
        const lift = Math.max(0, Math.sin(t * 2.6 + ph + sd)) * 0.25, ex = q.x - fy * sd * 1.25 + fx * 0.25, ey = (q.y / K + fx * sd * 1.25 + fy * 0.25) * K;
        seg(ctx, q.x, q.y - q.h + 0.1, ex, ey - 0.1 - lift, 0.3, '#7a2414'); dot(ctx, ex, ey - lift, 0.2, '#5a1a10');
      }
    }
    const order = pts.map((q, i) => i).sort((a, b) => pts[a].y - pts[b].y);
    for (const i of order) {
      const q = pts[i], y = q.y - q.h;
      X.ell(ctx, q.x, q.y - 0.05, q.r * 1.15, q.r * 0.45); ctx.fillStyle = 'rgba(40,10,6,0.35)'; ctx.fill();
      ball(ctx, q.x, y, q.r, q.r * 0.86, i % 2 ? '#e0603a' : '#c94a2a', '#5a1a10');
      if (i > 1 && i < N - 1 && i % 2 === 0) { dot(ctx, q.x, y - q.r * 0.4, q.r * 0.22, '#ffe0a0'); if (glow) glow(q.x, y - q.r * 0.4, q.r * 1.1, '#ffab4a', 0.55 + rage * 0.3); }
    }
    // 머리: 넓적한 주둥이 · 빛나는 눈 · 불꽃 볏 셋
    const hd = pts[N - 1], hx = hd.x + fx * 0.55, hy = hd.y - hd.h + fy * 0.3 * K;
    ball(ctx, hx, hy, 0.95, 0.66, '#ea6a40', '#6a1c10');
    for (const sd of [-1, 1]) { const ex = hx - fy * sd * 0.5 + fx * 0.1, ey = hy - 0.28 + fx * sd * 0.2; X.ell(ctx, ex, ey, 0.17, 0.21); ctx.fillStyle = rage ? '#fff3c0' : '#ffd36a'; ctx.fill(); if (glow) glow(ex, ey, 0.8, rage ? '#ffffff' : '#ffab4a', 0.9); }
    for (let c = -1; c <= 1; c++) {
      const bx = hd.x - fx * 0.3 * (c + 1) + c * -fy * 0.2, by = hd.y - hd.h - 0.6 - (c + 1) * 0.05, fl = 0.75 + Math.sin(t * 9 + c * 2) * 0.18;
      ctx.beginPath(); ctx.moveTo(bx - 0.22, by + 0.15); ctx.quadraticCurveTo(bx - 0.1, by - fl * 0.8, bx + Math.sin(t * 6 + c) * 0.12, by - fl); ctx.quadraticCurveTo(bx + 0.12, by - fl * 0.5, bx + 0.22, by + 0.15); ctx.closePath();
      ctx.fillStyle = c === 0 ? '#ffd36a' : '#ff8a3c'; ctx.fill(); if (glow) glow(bx, by - fl * 0.5, 0.7, '#ffab4a', 0.6);
    }
    if (strike > 0.2) { dot(ctx, hx + fx * 0.7, hy + 0.15, 0.32 * strike, '#ffe0a0'); if (glow) glow(hx + fx * 0.9, hy, 1.3 * strike, '#ffd08a', 0.7); }
    if (glow) { glow(0, -0.9, 4.2, '#ff8a3c', 0.2 + rage * 0.12); }
  };
  Art.monster = function (ctx, kind, pose, glow) { const fn = M[kind]; if (fn) fn(ctx, pose, glow); };

  /* ---------- 등불탑: 돌기둥 위의 석등 ---------- */
  Art.tower = function (ctx, tier, team, pose, glow) {
    const col = C.TEAM_COL[team], light = C.TEAM_LIGHT[team], t = pose.t || 0, hp = pose.hp === undefined ? 1 : pose.hp, dead = !!pose.dead;
    const h = tier === 2 ? 3.9 : 3.2, w = tier === 2 ? 1.0 : 0.82;
    X.ell(ctx, 0, 0, 2.0, 1.15); ctx.fillStyle = '#4b4d60'; ctx.fill();
    X.ell(ctx, 0, -0.18, 1.7, 0.98); ctx.fillStyle = '#6c6f84'; ctx.fill();
    ctx.strokeStyle = U.rgba(col, 0.7); ctx.lineWidth = 0.08; ctx.beginPath(); ctx.ellipse(0, -0.18, 1.45, 0.82, 0, 0, TAU); ctx.stroke();
    if (dead) {        // 무너진 잔해
      for (let i = 0; i < 6; i++) { const a = i * 1.1, r = 0.4 + (i % 3) * 0.35; ball(ctx, Math.cos(a) * r, -0.3 + Math.sin(a) * r * 0.5, 0.36 - (i % 2) * 0.1, 0.26, '#7c7f94', '#3a3c4c'); }
      return;
    }
    ctx.beginPath(); ctx.moveTo(-w * 0.72, -0.3); ctx.lineTo(-w * 0.5, -h + 1.0); ctx.lineTo(w * 0.5, -h + 1.0); ctx.lineTo(w * 0.72, -0.3); ctx.closePath(); ctx.fillStyle = grad(ctx, -h, 0, '#a3a6ba', '#55586c'); ctx.fill();
    ctx.fillStyle = 'rgba(30,32,48,0.35)'; ctx.fillRect(0.12, -h + 1.0, w * 0.5, h - 1.3);
    if (hp < 0.6) { ctx.strokeStyle = '#2a2c3a'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(-0.2, -h + 1.2); ctx.lineTo(0.1, -h + 1.9); ctx.lineTo(-0.15, -h + 2.5); if (hp < 0.3) { ctx.moveTo(0.3, -1.6); ctx.lineTo(0, -1.0); ctx.lineTo(0.25, -0.5); } ctx.stroke(); }
    // 화사석(불 켜는 칸)
    const fl = 0.8 + 0.2 * Math.sin(t * 8.5) + (pose.shot || 0) * 0.6, ly = -h + 0.45;
    X.rr(ctx, -w * 0.95, ly - 0.6, w * 1.9, 1.2, 0.16); ctx.fillStyle = '#3d3f52'; ctx.fill();
    X.rr(ctx, -w * 0.62, ly - 0.42, w * 1.24, 0.84, 0.3); ctx.fillStyle = grad(ctx, ly - 0.42, ly + 0.42, '#ffffff', col); ctx.fill();
    ctx.fillStyle = '#3d3f52'; ctx.fillRect(-0.06, ly - 0.45, 0.12, 0.9);
    if (glow) { glow(0, ly, 2.4 + (pose.shot || 0) * 1.5, col, Math.min(1, 0.6 * fl)); glow(0, ly, 1.0, light, 0.6 * fl); }
    // 지붕(옥개석): 처마 끝이 들린다
    const ry = ly - 0.62, rw = w * 1.75;
    ctx.beginPath(); ctx.moveTo(-rw - 0.25, ry + 0.08); ctx.quadraticCurveTo(-rw * 0.6, ry - 0.05, -0.2, ry - 0.82); ctx.lineTo(0.2, ry - 0.82); ctx.quadraticCurveTo(rw * 0.6, ry - 0.05, rw + 0.25, ry + 0.08); ctx.quadraticCurveTo(0, ry + 0.34, -rw - 0.25, ry + 0.08); ctx.closePath();
    ctx.fillStyle = grad(ctx, ry - 0.85, ry + 0.3, '#5a5d78', '#25273a'); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(-rw - 0.25, ry + 0.08); ctx.quadraticCurveTo(0, ry + 0.34, rw + 0.25, ry + 0.08); ctx.stroke();
    dot(ctx, 0, ry - 0.98, 0.17, light); if (glow) glow(0, ry - 0.98, 0.6, col, 0.8);
    if (tier === 2) { ctx.beginPath(); ctx.moveTo(-rw * 0.62, ry - 0.82); ctx.quadraticCurveTo(0, ry - 1.25, rw * 0.62, ry - 0.82); ctx.quadraticCurveTo(0, ry - 0.68, -rw * 0.62, ry - 0.82); ctx.closePath(); ctx.fillStyle = '#3a3c52'; ctx.fill(); }
  };
  Art.TOWER_H = [0, 3.2, 3.9];

  /* ---------- 큰등불: 진영의 심장 ---------- */
  Art.core = function (ctx, team, pose, glow) {
    const col = C.TEAM_COL[team], light = C.TEAM_LIGHT[team], deep = C.TEAM_DEEP[team], t = pose.t || 0, hp = pose.hp === undefined ? 1 : pose.hp;
    X.ell(ctx, 0, 0, 3.9, 2.3); ctx.fillStyle = '#3d3f52'; ctx.fill();
    X.ell(ctx, 0, -0.25, 3.5, 2.05); ctx.fillStyle = '#62657a'; ctx.fill();
    X.ell(ctx, 0, -0.45, 2.9, 1.7); ctx.fillStyle = '#74778c'; ctx.fill();
    ctx.strokeStyle = U.rgba(col, 0.85); ctx.lineWidth = 0.1; ctx.setLineDash([0.5, 0.35]); ctx.lineDashOffset = -t * 0.6;
    ctx.beginPath(); ctx.ellipse(0, -0.45, 2.45, 1.42, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    if (pose.dead) { for (let i = 0; i < 9; i++) { const a = i * 0.72, r = 0.5 + (i % 3) * 0.6; ball(ctx, Math.cos(a) * r, -0.6 + Math.sin(a) * r * 0.5, 0.5 - (i % 2) * 0.14, 0.34, '#8a8da2', '#3a3c4c'); } return; }
    for (const s of [-1, 1]) for (const b of [-1, 1]) { const x = s * 2.3, y = b * 0.95 - 0.5; ctx.fillStyle = grad(ctx, y - 1.9, y, '#9a9db2', '#4a4d62'); ctx.fillRect(x - 0.22, y - 1.9, 0.44, 1.9); dot(ctx, x, y - 2.0, 0.24, light); if (glow) glow(x, y - 2.0, 0.8, col, 0.6); }
    const flick = hp < 0.35 ? 0.7 + 0.3 * Math.sin(t * 23) : 1, bob = Math.sin(t * 1.8) * 0.15, oy = -3.2 + bob, R = 1.5;
    X.ell(ctx, 0, -0.5, 1.3, 0.5); ctx.fillStyle = U.rgba(col, 0.25 * flick); ctx.fill();
    ball(ctx, 0, oy, R, R * 1.08, '#ffffff', col);
    ctx.strokeStyle = U.rgba(deep, 0.5); ctx.lineWidth = 0.07;
    for (let i = -2; i <= 2; i++) { const k = Math.sin(t * 0.5 + i * 0.6); ctx.beginPath(); ctx.ellipse(0, oy, Math.abs(k) * R + 0.02, R * 1.08, 0, 0, TAU); ctx.stroke(); }
    X.rr(ctx, -0.6, oy - R * 1.08 - 0.22, 1.2, 0.3, 0.1); ctx.fillStyle = '#25273a'; ctx.fill();
    X.rr(ctx, -0.6, oy + R * 1.08 - 0.08, 1.2, 0.3, 0.1); ctx.fillStyle = '#25273a'; ctx.fill();
    if (hp < 0.6) { ctx.strokeStyle = '#25273a'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(-0.5, oy - 1.0); ctx.lineTo(-0.1, oy - 0.3); ctx.lineTo(-0.6, oy + 0.4); if (hp < 0.3) { ctx.moveTo(0.7, oy - 0.5); ctx.lineTo(0.3, oy + 0.2); ctx.lineTo(0.8, oy + 0.9); } ctx.stroke(); }
    if (glow) { glow(0, oy, 5.5, col, 0.55 * flick); glow(0, oy, 2.4, light, 0.6 * flick); }
  };

  /* 길가 등불 */
  Art.lamp = function (ctx, col, t, glow) {
    seg(ctx, 0, 0, 0, -1.7, 0.1, '#2f3044'); seg(ctx, 0, -1.7, 0.42, -1.82, 0.08, '#2f3044');
    const sw = Math.sin(t * 1.7) * 0.04, fl = 0.85 + 0.15 * Math.sin(t * 7.3);
    X.rr(ctx, 0.26 + sw, -1.72, 0.32, 0.44, 0.1); ctx.fillStyle = '#fff6dc'; ctx.fill();
    X.rr(ctx, 0.22 + sw, -1.78, 0.4, 0.1, 0.04); ctx.fillStyle = '#2f3044'; ctx.fill();
    if (glow) glow(0.42 + sw, -1.5, 1.3, col, 0.75 * fl);
  };

  /* =====================================================================
     아이콘 (-1..1 상자 안에 그린다)
     ===================================================================== */
  const I = {};
  const L = (c, pts, w) => { c.lineWidth = w || 0.16; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke(); };
  const Pg = (c, pts) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); };
  const Ci = (c, x, y, r, fill) => { c.beginPath(); c.arc(x, y, r, 0, TAU); if (fill) c.fill(); else c.stroke(); };
  const Ar = (c, x, y, r, a0, a1, w) => { c.lineWidth = w || 0.16; c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke(); };
  // 모루
  I.slam = (c) => { Pg(c, [-0.5, -0.7, 0.5, -0.7, 0.6, 0.0, -0.6, 0.0]); L(c, [-0.8, 0.5, -0.3, 0.3, 0, 0.6, 0.3, 0.3, 0.8, 0.5], 0.14); };
  I.ram = (c) => { Ci(c, -0.25, 0, 0.42, true); L(c, [0.25, 0, 0.85, 0], 0.2); Pg(c, [0.55, -0.35, 0.95, 0, 0.55, 0.35]); L(c, [-0.95, -0.35, -0.75, -0.35], 0.1); L(c, [-0.95, 0.35, -0.75, 0.35], 0.1); };
  I.shell = (c) => { Ar(c, 0, 0.2, 0.75, Math.PI, 0, 0.2); L(c, [-0.75, 0.2, 0.75, 0.2], 0.2); L(c, [0, -0.5, 0, 0.2], 0.1); L(c, [-0.4, -0.38, -0.3, 0.2], 0.1); L(c, [0.4, -0.38, 0.3, 0.2], 0.1); };
  I.quake = (c) => { for (let i = 0; i < 3; i++) Ar(c, -0.8, 0, 0.5 + i * 0.45, -0.6, 0.6, 0.15); };
  I.landslide = (c) => { Pg(c, [0, -0.85, 0.4, -0.2, -0.4, -0.2]); L(c, [0, -0.2, 0, 0.2], 0.2); Ar(c, 0, 0.55, 0.7, Math.PI * 1.1, Math.PI * 1.9, 0.15); L(c, [-0.9, 0.6, 0.9, 0.6], 0.15); };
  // 하늬
  I.flow = (c) => { L(c, [-0.8, -0.4, 0.3, -0.4], 0.14); Ar(c, 0.3, -0.15, 0.25, -Math.PI / 2, Math.PI / 2, 0.14); L(c, [-0.6, 0.1, 0.5, 0.1], 0.14); L(c, [-0.8, 0.55, 0.1, 0.55], 0.14); };
  I.thrust = (c) => { L(c, [-0.85, 0.6, 0.3, -0.25], 0.14); Pg(c, [0.9, -0.75, 0.55, -0.1, 0.15, -0.45]); };
  I.deflect = (c) => { Ar(c, 0, 0, 0.7, 0.3, Math.PI * 1.7, 0.16); Pg(c, [0.72, -0.05, 0.35, -0.15, 0.6, 0.35]); L(c, [-0.3, 0.3, 0.3, -0.3], 0.14); };
  I.gale = (c) => { L(c, [-0.9, 0, 0.5, 0], 0.18); Pg(c, [0.95, 0, 0.4, -0.38, 0.4, 0.38]); L(c, [-0.7, -0.45, -0.1, -0.45], 0.1); L(c, [-0.7, 0.45, -0.1, 0.45], 0.1); };
  I.flurry = (c) => { for (let i = -2; i <= 2; i++) { const a = i * 0.3; L(c, [-0.75, 0, -0.75 + Math.cos(a) * 1.55, Math.sin(a) * 1.55], 0.1); } Ci(c, -0.75, 0, 0.16, true); };
  // 그믐
  const moon = (c, x, y, r, rot) => { c.save(); c.translate(x, y); c.rotate(rot || 0); c.beginPath(); c.arc(0, 0, r, -1.9, 1.9); c.arc(-r * 0.45, 0, r * 0.82, 1.25, -1.25, true); c.closePath(); c.fill(); c.restore(); };
  I.ambush = (c) => { moon(c, 0.1, 0, 0.75, 0.3); Ci(c, -0.2, 0, 0.14, true); };
  I.crescent = (c) => { moon(c, 0, 0, 0.7, -0.5); Ar(c, 0, 0, 0.95, 2.2, 3.6, 0.08); };
  I.smoke = (c) => { Ci(c, -0.35, 0.15, 0.4, true); Ci(c, 0.3, 0.2, 0.36, true); Ci(c, 0, -0.25, 0.42, true); };
  I.bladeride = (c) => { moon(c, 0.3, -0.2, 0.5, -0.6); L(c, [-0.85, 0.6, -0.1, 0.1], 0.14); L(c, [-0.5, 0.75, -0.2, 0.5], 0.1); };
  I.darkmoon = (c) => { Ci(c, 0, 0, 0.72, true); c.globalCompositeOperation = 'destination-out'; Ci(c, 0.28, -0.12, 0.56, true); c.globalCompositeOperation = 'source-over'; for (let i = 0; i < 3; i++) Ci(c, 0.45 + i * 0.18, 0.5 - i * 0.5, 0.06, true); };
  // 불티
  I.heat = (c) => { c.beginPath(); c.moveTo(0, -0.85); c.quadraticCurveTo(0.75, -0.1, 0.5, 0.45); c.quadraticCurveTo(0.3, 0.85, 0, 0.85); c.quadraticCurveTo(-0.3, 0.85, -0.5, 0.45); c.quadraticCurveTo(-0.75, -0.1, 0, -0.85); c.closePath(); c.fill(); };
  I.firebolt = (c) => { Ci(c, 0.45, 0, 0.36, true); L(c, [-0.9, 0, -0.05, 0], 0.2); L(c, [-0.75, -0.42, -0.1, -0.3], 0.11); L(c, [-0.75, 0.42, -0.1, 0.3], 0.11); };      // 꼬리를 끄는 빛덩이
  I.jar = (c) => { X.rr(c, -0.45, -0.3, 0.9, 1.05, 0.25); c.fill(); c.fillRect(-0.3, -0.62, 0.6, 0.22); Ci(c, 0.6, -0.65, 0.09, true); Ci(c, -0.7, -0.5, 0.07, true); };
  I.tumble = (c) => { c.setLineDash([0.22, 0.16]); Ar(c, -0.05, 0.45, 0.75, Math.PI * 1.08, Math.PI * 1.92, 0.13); c.setLineDash([]); Ci(c, 0.68, 0.3, 0.2, true); L(c, [-0.95, 0.72, -0.5, 0.72], 0.12); L(c, [0.4, 0.72, 0.95, 0.72], 0.12); };      // 폴짝 뛰는 궤적
  I.barrage = (c) => { Pg(c, [-0.95, -0.2, -0.5, -0.34, -0.5, 0.34, -0.95, 0.2]); for (const p of [[-0.2, 0, 0.13], [0.2, -0.3, 0.12], [0.2, 0.3, 0.12], [0.62, -0.6, 0.11], [0.66, 0, 0.11], [0.62, 0.6, 0.11]]) Ci(c, p[0], p[1], p[2], true); };      // 대롱에서 쏟아지는 불똥
  // 초롱
  I.wick = (c) => { L(c, [0, 0.85, 0, 0.1], 0.12); I.heat(c); };
  I.beam = (c) => { L(c, [-0.9, 0, 0.9, 0], 0.3); Ci(c, -0.72, 0, 0.26, true); L(c, [0.2, -0.5, 0.75, -0.35], 0.08); L(c, [0.2, 0.5, 0.75, 0.35], 0.08); };
  I.lantern = (c) => { X.ell(c, 0, 0.08, 0.5, 0.6); c.fill(); c.fillRect(-0.28, -0.75, 0.56, 0.16); c.fillRect(-0.28, 0.68, 0.56, 0.14); L(c, [0, -0.95, 0, -0.75], 0.08); };
  I.blink = (c) => { Ci(c, -0.5, 0.35, 0.22); L(c, [-0.3, 0.2, 0.35, -0.3], 0.1); X.star(c, 0.5, -0.4, 0.42, 4, 0.35, 0); c.fill(); };
  I.moon = (c) => { Ci(c, 0, 0, 0.7, true); c.globalCompositeOperation = 'destination-out'; Ci(c, -0.22, -0.2, 0.14, true); Ci(c, 0.25, 0.15, 0.1, true); Ci(c, -0.1, 0.34, 0.07, true); c.globalCompositeOperation = 'source-over'; Ar(c, 0, 0, 0.92, 0, TAU, 0.06); };
  // 서리
  const flake = (c, x, y, r) => { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; L(c, [x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.cos(a) * r, y + Math.sin(a) * r], r * 0.2); } };
  I.frost = (c) => flake(c, 0, 0, 0.8);
  I.icicle = (c) => { Pg(c, [0.9, -0.7, 0.2, -0.05, -0.2, -0.4]); Pg(c, [-0.05, 0.05, -0.85, 0.35, -0.3, -0.25]); Pg(c, [0.1, 0.15, -0.3, 0.85, -0.2, 0.2]); };
  I.pond = (c) => { X.ell(c, 0, 0.25, 0.85, 0.42); c.stroke(); flake(c, 0, -0.3, 0.42); };
  I.slide = (c) => { L(c, [-0.85, 0.45, 0.2, 0.45], 0.16); Pg(c, [0.85, 0.45, 0.2, 0.1, 0.2, 0.8]); flake(c, -0.3, -0.35, 0.34); };
  I.blizzard = (c) => { flake(c, -0.4, -0.35, 0.36); flake(c, 0.45, -0.1, 0.42); flake(c, -0.15, 0.5, 0.3); };
  // 나래
  I.dust = (c) => { X.star(c, 0, 0, 0.6, 4, 0.35, 0); c.fill(); X.star(c, 0.6, -0.55, 0.26, 4, 0.35, 0); c.fill(); X.star(c, -0.6, 0.5, 0.22, 4, 0.35, 0); c.fill(); };
  I.dustline = (c) => { L(c, [-0.9, 0.5, 0.2, -0.15], 0.1); X.star(c, 0.5, -0.35, 0.48, 4, 0.35, 0.3); c.fill(); Ci(c, -0.5, 0.05, 0.08, true); Ci(c, -0.1, 0.4, 0.07, true); };
  I.wing = (c) => { for (const s of [-1, 1]) { c.beginPath(); c.moveTo(0, 0.1); c.quadraticCurveTo(s * 0.3, -0.95, s * 0.9, -0.55); c.quadraticCurveTo(s * 0.95, 0.1, 0, 0.1); c.closePath(); c.fill(); c.beginPath(); c.moveTo(0, 0.15); c.quadraticCurveTo(s * 0.8, 0.2, s * 0.55, 0.75); c.quadraticCurveTo(s * 0.15, 0.7, 0, 0.15); c.closePath(); c.fill(); } };
  I.ward = (c) => { L(c, [0, 0.85, 0, -0.1], 0.12); Ci(c, 0, -0.4, 0.34, true); for (let i = 0; i < 5; i++) { const a = -Math.PI + i * Math.PI / 4; L(c, [Math.cos(a) * 0.55, -0.4 + Math.sin(a) * 0.55, Math.cos(a) * 0.8, -0.4 + Math.sin(a) * 0.8], 0.08); } };
  I.dawn = (c) => { c.beginPath(); c.arc(0, 0.3, 0.5, Math.PI, 0); c.closePath(); c.fill(); L(c, [-0.9, 0.3, 0.9, 0.3], 0.12); for (let i = 0; i < 5; i++) { const a = -Math.PI + (i + 0.5) * Math.PI / 5; L(c, [Math.cos(a) * 0.65, 0.3 + Math.sin(a) * 0.65, Math.cos(a) * 0.92, 0.3 + Math.sin(a) * 0.92], 0.1); } };
  // 아귀
  I.bait = (c) => { Ar(c, 0, -0.1, 0.5, 0.2, Math.PI * 1.2, 0.14); L(c, [0.5, 0, 0.5, -0.85], 0.12); Pg(c, [-0.55, -0.35, -0.25, -0.05, -0.6, 0.1]); Ci(c, 0, 0.62, 0.16, true); };
  I.hook = (c) => { L(c, [0.25, -0.9, 0.25, 0.2], 0.16); Ar(c, -0.1, 0.2, 0.35, 0, Math.PI, 0.16); Pg(c, [-0.45, 0.2, -0.75, -0.25, -0.2, -0.05]); Ci(c, 0.25, -0.78, 0.14); };
  I.lure = (c) => { Ci(c, 0, 0.05, 0.34, true); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; L(c, [Math.cos(a) * 0.55, 0.05 + Math.sin(a) * 0.55, Math.cos(a) * 0.88, 0.05 + Math.sin(a) * 0.88], 0.1); } };
  I.fling = (c) => { Ar(c, -0.1, 0.5, 0.75, Math.PI * 1.05, Math.PI * 1.95, 0.14); Pg(c, [0.9, 0.35, 0.4, 0.3, 0.75, -0.15]); Ci(c, -0.75, 0.3, 0.2, true); };
  I.whirl = (c) => { c.lineWidth = 0.15; c.beginPath(); for (let i = 0; i <= 40; i++) { const a = i * 0.36, r = 0.08 + i * 0.021; if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r); else c.moveTo(Math.cos(a) * r, Math.sin(a) * r); } c.stroke(); };
  // 아이템
  I.blade = (c) => { c.beginPath(); c.arc(0.05, -0.12, 0.74, -2.6, 0.3); c.arc(0.34, 0.1, 0.62, -0.1, -2.25, true); c.closePath(); c.fill(); L(c, [-0.5, 0.1, -0.82, 0.86], 0.2); };      // 초승 낫
  I.feather = (c) => { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.3; c.beginPath(); c.moveTo(0, -0.12); c.lineTo(Math.cos(a) * 0.8, -0.12 + Math.sin(a) * 0.8); c.lineTo(Math.cos(a + 1.15) * 0.5, -0.12 + Math.sin(a + 1.15) * 0.5); c.closePath(); c.fill(); } L(c, [0, -0.12, 0, 0.94], 0.1); };      // 바람개비
  I.fang = (c) => { Ci(c, 0, 0.38, 0.5, true); Ci(c, 0, -0.28, 0.3, true); c.fillRect(-0.1, -0.76, 0.2, 0.3); L(c, [-0.22, -0.82, 0.22, -0.82], 0.12); };      // 호리병
  I.orb = (c) => { c.beginPath(); c.moveTo(0, -0.92); c.quadraticCurveTo(0.52, -0.3, 0.27, 0.04); c.quadraticCurveTo(0, 0.26, -0.27, 0.04); c.quadraticCurveTo(-0.52, -0.3, 0, -0.92); c.closePath(); c.fill(); Pg(c, [-0.72, 0.32, 0.72, 0.32, 0.42, 0.8, -0.42, 0.8]); };      // 호롱불: 불꽃과 접시
  I.glass = (c) => { c.beginPath(); c.moveTo(-0.62, 0.45); c.quadraticCurveTo(-0.52, -0.76, 0, -0.76); c.quadraticCurveTo(0.52, -0.76, 0.62, 0.45); c.closePath(); c.fill(); L(c, [-0.8, 0.5, 0.8, 0.5], 0.14); Ci(c, 0, 0.78, 0.14, true); Ar(c, 0, -0.84, 0.11, 0, TAU, 0.08); };      // 방울
  I.boots = (c) => { c.beginPath(); c.ellipse(0, 0.04, 0.44, 0.86, 0.36, 0, TAU); c.fill(); c.globalCompositeOperation = 'destination-out'; L(c, [-0.34, 0.0, 0.1, -0.5, 0.42, 0.12], 0.1); c.globalCompositeOperation = 'source-over'; };      // 짚신: 끈이 V 자로
  I.heart = (c) => { L(c, [0.74, -0.74, -0.86, 0.86], 0.09); Ci(c, 0.44, -0.44, 0.3, true); Ci(c, 0.02, -0.02, 0.3, true); Ci(c, -0.4, 0.4, 0.3, true); };      // 경단 꼬치
  I.bark = (c) => { Pg(c, [0, -0.86, 0.74, -0.43, 0.74, 0.43, 0, 0.86, -0.74, 0.43, -0.74, -0.43]); c.globalCompositeOperation = 'destination-out'; L(c, [0, -0.42, 0.37, -0.21, 0.37, 0.21, 0, 0.42, -0.37, 0.21, -0.37, -0.21, 0, -0.42], 0.08); L(c, [0, -0.86, 0, -0.42], 0.08); L(c, [0, 0.42, 0, 0.86], 0.08); L(c, [0.37, -0.21, 0.74, -0.43], 0.08); L(c, [-0.37, -0.21, -0.74, -0.43], 0.08); L(c, [0.37, 0.21, 0.74, 0.43], 0.08); L(c, [-0.37, 0.21, -0.74, 0.43], 0.08); c.globalCompositeOperation = 'source-over'; };      // 거북 등딱지
  I.charm = (c) => { X.rr(c, -0.4, -0.5, 0.8, 1.2, 0.12); c.fill(); L(c, [0, -0.9, 0, -0.5], 0.09); Ci(c, 0, -0.9, 0.1); c.globalCompositeOperation = 'destination-out'; Ci(c, 0, 0.1, 0.22, true); c.globalCompositeOperation = 'source-over'; };
  // 기타
  I.roll = (c) => { Ar(c, 0, 0, 0.62, 0.5, Math.PI * 1.8, 0.18); Pg(c, [0.9, -0.2, 0.42, -0.42, 0.6, 0.12]); };
  I.recall = (c) => { Pg(c, [0, -0.85, 0.8, -0.1, -0.8, -0.1]); c.fillRect(-0.55, -0.1, 1.1, 0.85); c.globalCompositeOperation = 'destination-out'; c.fillRect(-0.16, 0.25, 0.32, 0.5); c.globalCompositeOperation = 'source-over'; };
  I.fire = I.heat;
  I.water = (c) => { c.beginPath(); c.moveTo(0, -0.9); c.quadraticCurveTo(0.8, 0.1, 0.5, 0.5); c.quadraticCurveTo(0, 1.05, -0.5, 0.5); c.quadraticCurveTo(-0.8, 0.1, 0, -0.9); c.closePath(); c.fill(); };
  I.boss = (c) => { c.lineWidth = 0.2; c.beginPath(); c.moveTo(-0.7, 0.75); c.quadraticCurveTo(0.9, 0.6, 0.1, 0.05); c.quadraticCurveTo(-0.7, -0.45, 0.35, -0.7); c.stroke(); Ci(c, 0.5, -0.72, 0.24, true); };
  I.elder = (c) => { c.fillRect(-0.14, 0.1, 0.28, 0.8); Ci(c, 0, -0.3, 0.5, true); Ci(c, -0.42, 0.0, 0.34, true); Ci(c, 0.42, 0.0, 0.34, true); };
  I.gold = (c) => { Ci(c, 0, 0, 0.72, true); c.globalCompositeOperation = 'destination-out'; Ar(c, 0, 0, 0.42, 0, TAU, 0.1); c.globalCompositeOperation = 'source-over'; };
  I.sword = (c) => { L(c, [-0.6, 0.6, 0.7, -0.7], 0.2); L(c, [-0.75, 0.05, -0.05, 0.75], 0.14); };
  I.skull = (c) => { Ci(c, 0, -0.15, 0.65, true); c.fillRect(-0.36, 0.3, 0.72, 0.42); c.globalCompositeOperation = 'destination-out'; Ci(c, -0.26, -0.15, 0.17, true); Ci(c, 0.26, -0.15, 0.17, true); c.globalCompositeOperation = 'source-over'; };
  I.tower = (c) => { Pg(c, [-0.3, 0.85, -0.2, -0.2, 0.2, -0.2, 0.3, 0.85]); Pg(c, [-0.75, -0.2, 0, -0.9, 0.75, -0.2]); };
  I.eye = (c) => { c.beginPath(); c.moveTo(-0.9, 0); c.quadraticCurveTo(0, -0.75, 0.9, 0); c.quadraticCurveTo(0, 0.75, -0.9, 0); c.closePath(); c.lineWidth = 0.13; c.stroke(); Ci(c, 0, 0, 0.26, true); };
  I.shop = (c) => { Pg(c, [-0.75, -0.2, 0.75, -0.2, 0.55, 0.75, -0.55, 0.75]); Ar(c, 0, -0.2, 0.42, Math.PI, 0, 0.13); };
  I.sound = (c) => { Pg(c, [-0.8, -0.25, -0.4, -0.25, 0.05, -0.65, 0.05, 0.65, -0.4, 0.25, -0.8, 0.25]); Ar(c, 0.1, 0, 0.4, -0.8, 0.8, 0.12); Ar(c, 0.1, 0, 0.72, -0.8, 0.8, 0.12); };
  I.mute = (c) => { Pg(c, [-0.8, -0.25, -0.4, -0.25, 0.05, -0.65, 0.05, 0.65, -0.4, 0.25, -0.8, 0.25]); L(c, [0.3, -0.3, 0.85, 0.3], 0.13); L(c, [0.85, -0.3, 0.3, 0.3], 0.13); };
  I.pause = (c) => { c.fillRect(-0.5, -0.6, 0.32, 1.2); c.fillRect(0.18, -0.6, 0.32, 1.2); };
  I.help = (c) => { Ar(c, 0, -0.3, 0.42, Math.PI * 1.05, Math.PI * 2.45, 0.17); L(c, [0.12, 0.05, 0, 0.3], 0.17); Ci(c, 0, 0.7, 0.12, true); };
  I.lock = (c) => { X.rr(c, -0.5, -0.1, 1.0, 0.85, 0.12); c.fill(); Ar(c, 0, -0.15, 0.32, Math.PI, 0, 0.15); };
  I.star = (c) => { X.star(c, 0, 0, 0.85, 5, 0.45, -Math.PI / 2); c.fill(); };
  I.ping = (c) => { Ci(c, 0, 0, 0.25, true); Ar(c, 0, 0, 0.58, 0, TAU, 0.1); Ar(c, 0, 0, 0.9, 0, TAU, 0.07); };

  /* 아이콘 하나 (x,y 중심, s = 반지름) */
  Art.icon = function (ctx, id, x, y, s, color) {
    const fn = I[id]; if (!fn) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 0.16;
    fn(ctx);
    ctx.restore();
  };
  /* 아이콘 스프라이트 캐시 (destination-out 을 쓰는 아이콘이 배경을 파먹지 않도록 따로 그려 둔다) */
  const iconCache = new Map();
  Art.iconSprite = function (id, px, color) {
    px = Math.max(8, Math.round(px));
    const key = id + '|' + px + '|' + color;
    let cv = iconCache.get(key);
    if (cv) return cv;
    cv = X.canvas(px, px);
    Art.icon(cv.getContext('2d'), id, px / 2, px / 2, px * 0.42, color);
    if (iconCache.size > 400) iconCache.clear();
    iconCache.set(key, cv);
    return cv;
  };
  /* 둥근 단추 위의 아이콘 */
  Art.iconButton = function (ctx, id, x, y, r, color, alpha) {
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, U.mix(color, '#141a33', 0.72)); g.addColorStop(1, '#0c1024');
    X.circle(ctx, x, y, r); ctx.fillStyle = g; ctx.fill();
    ctx.drawImage(Art.iconSprite(id, r * 1.5, color), x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
    ctx.globalAlpha = 1;
  };
  Art.hasIcon = (id) => !!I[id];
})();
