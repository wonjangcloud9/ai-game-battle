/* 어스름 전선 — art: 영웅 8명 그리기 (절차적 2.5D 리그)
   좌표: 원점 = 발밑(땅), 단위 = 월드 단위, 위쪽 = -y. 몸의 부품은 바라보는 방향(f)에 따라 자리와 앞뒤 순서가 바뀐다.
   pose: { f, t, walk, mv(0~1), atk(-1 또는 0~1), atkW, atkN, cast(-1|0~1), slot, dash(종류|null), charge(-1|0~1), chan, team, st, ult }
   glow(lx, ly, r, color, a): 스스로 빛나는 부분(눈·등불·칼날)을 조명 뒤에 덧그리도록 알려 준다. */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, X = TW.X, TAU = Math.PI * 2;
  const Art = TW.Art = {};
  const K = 0.6;                         // 땅 위 앞뒤 거리가 화면에서 눌려 보이는 비율

  function grad(ctx, y0, y1, c0, c1) { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function ball(ctx, x, y, rx, ry, cTop, cBot) { X.ell(ctx, x, y, rx, ry); ctx.fillStyle = grad(ctx, y - ry, y + ry, cTop, cBot); ctx.fill(); }
  function dot(ctx, x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = c; ctx.fill(); }
  function seg(ctx, x1, y1, x2, y2, w, c) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  /* 자세 계산 */
  function mk(pose) {
    const f = pose.f, P = { f, fx: Math.cos(f), fy: Math.sin(f), t: pose.t || 0, mv: pose.mv || 0, walk: pose.walk || 0, pose, parts: [] };
    P.px = -P.fy; P.py = P.fx;
    P.bob = Math.sin(P.walk * 2) * 0.07 * P.mv + Math.sin(P.t * 2.4 + (pose.seed || 0)) * 0.03;
    let sw = 0, ext = 0, lunge = 0;
    if (pose.atk >= 0) {
      // 타격감: 내려치기가 '맞는 순간(a = w)'에 끝까지 뻗는다 → 불꽃·소리·멈칫이 무기가 닿는 바로 그 프레임과 겹친다.
      // (예전에는 맞는 순간에 무기가 아직 뒤로 젖혀져 있었고, 내려치기는 그 뒤에 이어져 불꽃이 먼저 튀었다)
      // 젖힘(예비 동작) → 빠르게 가속하는 내려치기 → 닿은 자세로 잠깐 버팀 → 거둠
      const a = pose.atk, w = pose.atkW || 0.3, s0 = Math.max(0.12, w - 0.11);
      if (a < s0) { const k = U.easeOut(a / s0); sw = -k; ext = -0.35 * k; }
      else if (a < w) { const k = U.easeIn((a - s0) / (w - s0)); sw = -1 + 2.1 * k; ext = -0.35 + 1.55 * k; lunge = k; }
      else if (a < w + 0.07) { sw = 1.1; ext = 1.2; lunge = 1; }
      else { const k = U.smooth((a - w - 0.07) / Math.max(0.05, 1 - w - 0.07)); sw = 1.1 * (1 - k); ext = 1.2 * (1 - k); lunge = 1 - k; }
    }
    P.sw = sw; P.ext = ext; P.lunge = lunge;
    P.castK = pose.cast >= 0 ? Math.sin(Math.min(1, pose.cast) * Math.PI) : 0;
    P.dashK = pose.dash ? 1 : 0;
    P.lean = 0.1 * P.mv + 0.22 * lunge + 0.3 * P.dashK;
    P.team = pose.teamCol || C.TEAM_COL[pose.team] || '#ffffff'; P.teamL = pose.teamCol ? U.shade(pose.teamCol, 0.5) : (C.TEAM_LIGHT[pose.team] || '#ffffff');
    return P;
  }
  /* 땅 위 (앞으로 fwd, 오른쪽으로 side) → 화면 오프셋 */
  const gx = (P, fwd, side) => P.fx * fwd + P.px * side;
  const gy = (P, fwd, side) => (P.fy * fwd + P.py * side) * K;
  const gd = (P, fwd, side) => P.fy * fwd + P.py * side;                 // 앞뒤 순서(클수록 화면 앞)
  /* 머리 둘레의 한 점 (a = 바라보는 방향에서 벗어난 각) */
  function around(P, a, rad) { const an = P.f + a; return { x: Math.cos(an) * rad, y: Math.sin(an) * rad * K, d: Math.sin(an) * rad }; }
  function part(P, d, fn) { P.parts.push({ d, fn }); }
  function flush(ctx, P) { const ps = P.parts; ps.sort((a, b) => a.d - b.d); for (let i = 0; i < ps.length; i++) ps[i].fn(ctx); }

  function feet(ctx, P, color, spread, size, lift) {
    const st = Math.sin(P.walk) * 0.34 * P.mv;
    for (let s = -1; s <= 1; s += 2) {
      const fwd = st * s + P.lean * 0.5, x = gx(P, fwd, s * spread), y = gy(P, fwd, s * spread) - Math.max(0, Math.sin(P.walk + (s > 0 ? 0 : Math.PI))) * 0.14 * P.mv - (lift || 0);
      X.ell(ctx, x, y - 0.06, size, size * 0.62); ctx.fillStyle = color; ctx.fill();
    }
  }
  /* 빛나는 눈 */
  function eyes(ctx, P, hx, hy, R, color, glow, sz, delta, shape) {
    for (let s = -1; s <= 1; s += 2) {
      const a = P.f + s * (delta || 0.45), sn = Math.sin(a), v = U.clamp((sn + 0.3) / 0.3, 0, 1);
      if (v <= 0) continue;
      const ex = hx + Math.cos(a) * R * 0.78, ey = hy + sn * R * 0.44 + R * 0.1;
      ctx.globalAlpha = v;
      if (shape === 'slit') { X.ell(ctx, ex, ey, sz * 0.55, sz * 1.25); } else X.ell(ctx, ex, ey, sz, sz * 1.15);
      ctx.fillStyle = color; ctx.fill();
      ctx.globalAlpha = 1;
      if (glow) glow(ex, ey, sz * 3.4, color, 0.55 * v);
    }
  }
  /* 팀 표시: 허리에 두른 띠와 작은 등 */
  function sash(ctx, P, y, rx, ry, glow) {
    ctx.strokeStyle = P.team; ctx.lineWidth = 0.13; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.ellipse(0 + gx(P, P.lean, 0), y, rx, ry, 0, 0.15, Math.PI - 0.15); ctx.stroke();
    const p = around(P, 1.1, rx * 0.95);
    if (p.d > -rx * 0.5) { dot(ctx, p.x + gx(P, P.lean, 0), y + p.y * 0.7 + ry * 0.55, 0.13, P.teamL); if (glow) glow(p.x, y + p.y * 0.7 + ry * 0.55, 0.5, P.team, 0.7); }
  }
  /* 휘날리는 띠/망토 자락: 등 뒤로 흐른다 */
  function ribbon(ctx, P, ax, ay, len, w, color, phase, wave) {
    const back = -1, n = 5, sp = 1 + P.mv * 0.5 + P.dashK * 1.2;
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay);
    for (let i = 1; i <= n; i++) {
      const k = i / n, wob = Math.sin(P.t * 5 * sp + phase + k * 3.2) * (wave || 0.22) * k;
      const fwd = back * len * k * (0.55 + 0.45 * Math.min(1, P.mv + P.dashK)), drop = len * k * 0.42 * (1 - Math.min(1, P.mv + P.dashK) * 0.7);
      ctx.lineTo(ax + gx(P, fwd, wob), ay + gy(P, fwd, wob) + drop);
    }
    ctx.lineWidth = w; ctx.stroke();
  }

  const H = {};

  /* ---------- 1. 모루: 이끼 낀 등껍질, 돌 주먹, 호박빛 금 ---------- */
  H.moru = function (ctx, P, glow) {
    const lx = gx(P, P.lean, 0), ly = gy(P, P.lean, 0), b = P.bob * 0.6;
    feet(ctx, P, '#5d564c', 0.52, 0.3);
    // 등껍질(뒤쪽)
    part(P, gd(P, -0.42, 0), (c) => {
      const sx = lx + gx(P, -0.42, 0), sy = ly + gy(P, -0.42, 0) - 1.12 + b;
      ball(c, sx, sy, 1.0, 0.92, '#7fae62', '#35543a');
      c.strokeStyle = '#2a4030'; c.lineWidth = 0.07;
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.4; c.beginPath(); c.moveTo(sx, sy - 0.1); c.lineTo(sx + Math.cos(a) * 0.95, sy - 0.1 + Math.sin(a) * 0.85); c.stroke(); }
      const pulse = 0.55 + 0.45 * Math.sin(P.t * 3) + P.castK * 0.6;
      c.strokeStyle = '#ffb347'; c.lineWidth = 0.09; c.globalAlpha = Math.min(1, 0.5 + 0.4 * pulse);
      c.beginPath(); c.moveTo(sx - 0.45, sy - 0.5); c.lineTo(sx - 0.1, sy - 0.15); c.lineTo(sx - 0.3, sy + 0.25); c.moveTo(sx + 0.2, sy - 0.6); c.lineTo(sx + 0.42, sy - 0.1); c.lineTo(sx + 0.15, sy + 0.2); c.stroke();
      c.globalAlpha = 1;
      if (glow) glow(sx, sy - 0.15, 1.5, '#ffb347', 0.22 + 0.2 * pulse);
    });
    // 몸통
    part(P, 0, (c) => { ball(c, lx, ly - 0.86 + b, 0.84, 0.74, '#b4a892', '#5f574c'); X.ell(c, lx + gx(P, 0.25, 0), ly - 0.74 + b + gy(P, 0.25, 0), 0.5, 0.42); c.fillStyle = 'rgba(240,226,190,0.2)'; c.fill(); sash(c, P, ly - 0.72 + b, 0.84, 0.3, glow); });
    // 머리(작고 낮다)
    const hd = gd(P, 0.42, 0);
    part(P, hd, (c) => {
      const hx = lx + gx(P, 0.42, 0), hy = ly + gy(P, 0.42, 0) - 1.42 + b;
      ball(c, hx, hy, 0.46, 0.4, '#c2b6a0', '#6a6156');
      const br = around(P, 0, 0.3); if (br.d > -0.1) { c.strokeStyle = '#4d463d'; c.lineWidth = 0.13; c.lineCap = 'round'; c.beginPath(); c.moveTo(hx + br.x - P.px * 0.3, hy + br.y * 0.5 - 0.1 - P.py * 0.1); c.lineTo(hx + br.x + P.px * 0.3, hy + br.y * 0.5 - 0.1 + P.py * 0.1); c.stroke(); }
      eyes(c, P, hx, hy, 0.44, '#ffc96a', glow, 0.075, 0.42);
    });
    // 돌 주먹: 오른손이 친다 (세 번째는 두 손)
    const both = P.pose.atkN % 3 === 2;
    for (let s = -1; s <= 1; s += 2) {
      const hit = (s > 0 || both) ? 1 : 0, fwd = 0.35 + (hit ? P.ext * 0.85 : 0) + Math.sin(P.walk + (s > 0 ? Math.PI : 0)) * 0.2 * P.mv + P.castK * (P.pose.slot === 2 ? -0.2 : 0.3), side = s * (0.82 - (hit ? Math.max(0, P.ext) * 0.25 : 0));
      const up = hit ? Math.max(0, -P.sw) * 0.7 : 0;
      part(P, gd(P, fwd, side) + 0.02, (c) => { const x = lx + gx(P, fwd, side), y = ly + gy(P, fwd, side) - 0.72 + b - up - P.castK * 0.5; ball(c, x, y, 0.36, 0.34, '#cfc3ad', '#6e6558'); c.strokeStyle = 'rgba(60,52,44,0.6)'; c.lineWidth = 0.05; c.beginPath(); c.arc(x, y, 0.2, 0.3, 2.6); c.stroke(); });
    }
  };

  /* ---------- 2. 하늬: 두루미 탈, 긴 창, 흩날리는 깃 띠 ---------- */
  H.hanui = function (ctx, P, glow) {
    const lx = gx(P, P.lean, 0), ly = gy(P, P.lean, 0), b = P.bob;
    feet(ctx, P, '#2c4750', 0.3, 0.2);
    part(P, gd(P, -0.4, 0), (c) => {       // 깃 띠 두 가닥
      const ax = lx + gx(P, -0.3, 0), ay = ly + gy(P, -0.3, 0) - 1.25 + b;
      ribbon(c, P, ax + P.px * 0.15, ay, 1.7, 0.2, '#f4fbf9', 0, 0.3); ribbon(c, P, ax - P.px * 0.15, ay + 0.05, 1.4, 0.16, '#5fd4e8', 1.7, 0.3);
    });
    part(P, 0, (c) => {
      // 옷자락(아래가 퍼지는 종 모양)
      c.beginPath(); c.moveTo(lx - 0.36, ly - 1.35 + b); c.quadraticCurveTo(lx - 0.7, ly - 0.5 + b, lx - 0.52, ly - 0.2); c.quadraticCurveTo(lx, ly - 0.02, lx + 0.52, ly - 0.2); c.quadraticCurveTo(lx + 0.7, ly - 0.5 + b, lx + 0.36, ly - 1.35 + b); c.closePath();
      c.fillStyle = grad(c, ly - 1.4, ly - 0.1, '#f6fbfa', '#8fb4b8'); c.fill();
      c.strokeStyle = '#2f7f90'; c.lineWidth = 0.07; c.beginPath(); c.moveTo(lx - 0.05 + P.px * 0.1, ly - 1.3 + b); c.lineTo(lx + P.px * 0.2, ly - 0.25); c.stroke();
      sash(c, P, ly - 0.82 + b, 0.5, 0.2, glow);
    });
    part(P, gd(P, 0.1, 0) + 0.01, (c) => {
      const hx = lx + gx(P, 0.1, 0), hy = ly + gy(P, 0.1, 0) - 1.78 + b;
      ball(c, hx, hy, 0.44, 0.44, '#ffffff', '#b9d2d4');
      // 붉은 정수리 + 검은 눈가
      dot(c, hx - P.fx * 0.08, hy - 0.3, 0.14, '#e8504a');
      const bk = around(P, 0, 0.5);      // 부리
      if (bk.d > -0.25) { c.fillStyle = '#39505a'; c.beginPath(); c.moveTo(hx + bk.x * 0.7 - P.px * 0.1, hy + bk.y * 0.7 + 0.05 - P.py * 0.06); c.lineTo(hx + bk.x * 1.55, hy + bk.y * 1.2 + 0.18); c.lineTo(hx + bk.x * 0.7 + P.px * 0.1, hy + bk.y * 0.7 + 0.12 + P.py * 0.06); c.closePath(); c.fill(); }
      eyes(c, P, hx, hy, 0.42, '#5fd4e8', glow, 0.06, 0.5);
    });
    // 창: 두 손으로 쥐고, 공격 때 길게 내지른다
    const reach = 0.5 + P.ext * 1.1 + P.castK * (P.pose.slot === 0 ? 1.3 : 0.2), spin = P.pose.chanSpin || 0;
    part(P, gd(P, reach + 0.6, 0.25), (c) => {
      const ang = spin, cs = Math.cos(ang), sn = Math.sin(ang);
      const dir = (fwd, side) => [lx + gx(P, fwd * cs - side * sn, fwd * sn + side * cs), ly + gy(P, fwd * cs - side * sn, fwd * sn + side * cs) - 1.0 + b];
      const a = dir(reach - 1.5, 0.32), z = dir(reach + 2.2, 0.32), tip = dir(reach + 2.95, 0.32);
      seg(c, a[0], a[1], z[0], z[1], 0.09, '#7a5a3c');
      const nx = -(tip[1] - z[1]), ny = tip[0] - z[0], nl = Math.hypot(nx, ny) || 1;
      c.fillStyle = '#dff8ff'; c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(z[0] + nx / nl * 0.16, z[1] + ny / nl * 0.16); c.lineTo(z[0] - nx / nl * 0.16, z[1] - ny / nl * 0.16); c.closePath(); c.fill();
      seg(c, z[0], z[1], z[0] - (tip[0] - z[0]) * 0.3 + nx / nl * 0.3, z[1] - (tip[1] - z[1]) * 0.3 + ny / nl * 0.3 + 0.25, 0.08, '#e8504a');
      if (glow) glow(tip[0], tip[1], 0.5 + P.lunge * 0.6, '#bff6ff', 0.35 + P.lunge * 0.5);
      const h1 = dir(reach - 0.2, 0.32), h2 = dir(reach + 0.75, 0.32);
      dot(c, h1[0], h1[1], 0.15, '#f1f7f6'); dot(c, h2[0], h2[1], 0.15, '#f1f7f6');
    });
  };

  /* ---------- 3. 그믐: 올빼미 탈, 남빛 망토, 초승달 칼날 둘 ---------- */
  H.geumeum = function (ctx, P, glow) {
    const lx = gx(P, P.lean, 0), ly = gy(P, P.lean, 0), b = P.bob, ready = P.pose.st && P.pose.st.ambush;
    feet(ctx, P, '#1b1638', 0.3, 0.2);
    part(P, gd(P, -0.35, 0), (c) => {      // 망토
      const ax = lx + gx(P, -0.2, 0), ay = ly + gy(P, -0.2, 0) - 1.3 + b, sp = Math.min(1, P.mv + P.dashK), w = Math.sin(P.t * 4.2) * 0.1;
      const ex = ax + gx(P, -1.0 - sp * 0.7, 0), ey = ay + gy(P, -1.0 - sp * 0.7, 0) + 1.05 - sp * 0.55;
      c.beginPath(); c.moveTo(ax - P.px * 0.45, ay - P.py * 0.45 * K); c.quadraticCurveTo(ex - P.px * 0.9 + w, ey - 0.3, ex - P.px * 0.55, ey);
      c.lineTo(ex - P.px * 0.2, ey - 0.16); c.lineTo(ex + P.px * 0.1, ey + 0.05); c.lineTo(ex + P.px * 0.4, ey - 0.14); c.lineTo(ex + P.px * 0.62, ey);
      c.quadraticCurveTo(ex + P.px * 0.9 + w, ey - 0.3, ax + P.px * 0.45, ay + P.py * 0.45 * K); c.closePath();
      c.fillStyle = grad(c, ay, ey, '#4a3d8a', '#1c1640'); c.fill();
    });
    part(P, 0, (c) => { ball(c, lx, ly - 0.88 + b, 0.5, 0.7, '#443a7c', '#1e1842'); sash(c, P, ly - 0.74 + b, 0.5, 0.2, glow); });
    part(P, gd(P, 0.12, 0) + 0.01, (c) => {
      const hx = lx + gx(P, 0.12, 0), hy = ly + gy(P, 0.12, 0) - 1.74 + b;
      ball(c, hx, hy, 0.48, 0.46, '#4d4190', '#211a48');
      for (let s = -1; s <= 1; s += 2) { const e = around(P, s * 1.15, 0.36); c.fillStyle = '#3a2f70'; c.beginPath(); c.moveTo(hx + e.x * 0.7, hy - 0.3); c.lineTo(hx + e.x * 1.35, hy - 0.78); c.lineTo(hx + e.x * 1.25 + 0.14 * s * P.py, hy - 0.26); c.closePath(); c.fill(); }
      // 달빛 얼굴판 + 큰 눈
      const fc = around(P, 0, 0.2), v = U.clamp((P.fy + 0.55) / 0.5, 0, 1);
      if (v > 0) {
        c.globalAlpha = v; X.ell(c, hx + fc.x, hy + fc.y * 0.5 + 0.06, 0.36 * (0.55 + 0.45 * Math.abs(P.fy)), 0.33); c.fillStyle = '#e6eaff'; c.fill(); c.globalAlpha = 1;
        for (let s = -1; s <= 1; s += 2) {
          const a = P.f + s * 0.42, sn = Math.sin(a), vv = U.clamp((sn + 0.3) / 0.3, 0, 1); if (vv <= 0) continue;
          const ex = hx + Math.cos(a) * 0.36, ey = hy + sn * 0.2 + 0.07;
          c.globalAlpha = vv; dot(c, ex, ey, 0.125, '#1b1638'); dot(c, ex, ey, 0.055, ready ? '#ffffff' : '#b7a8ff'); c.globalAlpha = 1;
          if (glow && ready) glow(ex, ey, 0.4, '#cfd6ff', 0.8 * vv);
        }
      }
    });
    // 초승달 칼날: 번갈아 벤다
    const alt = P.pose.atkN % 2 ? 1 : -1;
    for (let s = -1; s <= 1; s += 2) {
      const act = s === alt, sw = act ? P.sw : 0, fwd = 0.45 + (act ? P.ext * 0.5 : 0) + P.castK * 0.3, side = s * (0.72 - (act ? sw * 0.5 * s * alt : 0));
      part(P, gd(P, fwd, side) + 0.03, (c) => {
        const x = lx + gx(P, fwd, side), y = ly + gy(P, fwd, side) - 0.95 + b - (act ? Math.max(0, -sw) * 0.3 : 0);
        const ang = P.f + s * 0.9 - (act ? sw * 1.5 * s : 0);
        c.save(); c.translate(x, y); c.scale(1, 0.8); c.rotate(ang);
        c.fillStyle = ready ? '#ffffff' : '#cfd6ff'; c.beginPath(); c.arc(0.25, 0, 0.5, -1.25, 1.25); c.arc(0.02, 0, 0.42, 1.0, -1.0, true); c.closePath(); c.fill();
        c.restore();
        dot(c, x, y, 0.12, '#2a2258');
        if (glow) glow(x + Math.cos(ang) * 0.3, y + Math.sin(ang) * 0.24, ready ? 0.9 : 0.5, '#cfd6ff', ready ? 0.75 + 0.2 * Math.sin(P.t * 9) : 0.3);
      });
    }
  };

  /* ---------- 4. 불티: 반딧불이 든 유리 어항을 머리에 쓴 꼬마, 남색 멜빵바지, 겨자색 목도리, 놋쇠 대롱 ---------- */
  H.bulti = function (ctx, P, glow) {
    const lx = gx(P, P.lean, 0), ly = gy(P, P.lean, 0), b = P.bob, heat = (P.pose.st && P.pose.st.heat) || 0, hk = heat / 6;
    feet(ctx, P, '#2a2438', 0.27, 0.2);
    part(P, gd(P, -0.42, 0), (c) => {      // 등에 진 놋쇠 통
      const x = lx + gx(P, -0.42, 0), y = ly + gy(P, -0.42, 0) - 0.82 + b;
      X.rr(c, x - 0.24, y - 0.34, 0.48, 0.62, 0.14); c.fillStyle = '#b98a3c'; c.fill();
      c.fillStyle = '#e8c06a'; c.fillRect(x - 0.24, y - 0.16, 0.48, 0.07);
      dot(c, x, y - 0.4, 0.09, '#6b4c22');
    });
    part(P, gd(P, -0.3, 0.1) - 0.01, (c) => { ribbon(c, P, lx + gx(P, -0.25, 0.1), ly - 1.05 + b, 0.75, 0.16, '#e0b04a', 1.3, 0.2); });      // 목도리 자락
    part(P, 0, (c) => {
      ball(c, lx, ly - 0.7 + b, 0.46, 0.54, '#44559a', '#232a52');
      sash(c, P, ly - 0.58 + b, 0.46, 0.18, glow);
      X.ell(c, lx + gx(P, 0.04, 0), ly - 1.1 + b, 0.4, 0.15); c.fillStyle = '#e0b04a'; c.fill();
    });
    part(P, gd(P, 0.08, 0) + 0.01, (c) => {      // 머리: 유리 어항 (안에서 반딧불이 맴돈다)
      const hx = lx + gx(P, 0.08, 0), hy = ly + gy(P, 0.08, 0) - 1.62 + b;
      ball(c, hx, hy + 0.1, 0.34, 0.33, '#f2d9b5', '#b98f68');
      for (let s = -1; s <= 1; s += 2) { const a = P.f + s * 0.42, sn = Math.sin(a), v = U.clamp((sn + 0.3) / 0.3, 0, 1); if (v <= 0) continue; c.globalAlpha = v; dot(c, hx + Math.cos(a) * 0.26, hy + 0.13 + sn * 0.12, 0.06, '#2a2030'); c.globalAlpha = 1; }
      X.circle(c, hx, hy, 0.6); c.fillStyle = 'rgba(190,255,170,' + (0.2 + hk * 0.14) + ')'; c.fill(); c.strokeStyle = '#e8ffd8'; c.lineWidth = 0.06; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.07; c.lineCap = 'round'; c.beginPath(); c.arc(hx, hy, 0.46, -2.5, -1.7); c.stroke();
      X.ell(c, hx, hy + 0.54, 0.36, 0.12); c.fillStyle = '#c99a44'; c.fill();
      const n = 3 + Math.round(hk * 3);
      for (let i = 0; i < n; i++) { const a = P.t * (2.2 + i * 0.6 + hk * 2) + i * 2.1, fx = hx + Math.cos(a) * 0.4, fy = hy - 0.05 + Math.sin(a * 1.3) * 0.36; dot(c, fx, fy, 0.055, '#f6ffb0'); if (glow && i < 3) glow(fx, fy, 0.3, '#d6ff5a', 0.5); }
      if (glow) glow(hx, hy, 1.0 + hk * 0.5, '#d6ff5a', 0.36 + 0.14 * Math.sin(P.t * 4) + hk * 0.3);
    });
    // 놋쇠 대롱: 두 손으로 앞에 든다 (쏠 때 뒤로 튄다)
    const kick = P.pose.atk >= 0 ? Math.max(0, P.lunge) * -0.22 : 0, fw = 0.7 + kick + P.castK * 0.1;
    part(P, gd(P, fw, 0.12) + 0.04, (c) => {
      const x = lx + gx(P, fw, 0.12), y = ly + gy(P, fw, 0.12) - 0.8 + b;
      c.save(); c.translate(x, y); c.scale(1, 0.72); c.rotate(P.f);
      X.rr(c, -0.5, -0.11, 1.0, 0.22, 0.08); c.fillStyle = '#b98a3c'; c.fill();
      c.fillStyle = '#e8c06a'; c.fillRect(-0.2, -0.13, 0.1, 0.26); c.fillRect(0.2, -0.13, 0.1, 0.26);
      c.beginPath(); c.moveTo(0.48, -0.12); c.lineTo(0.78, -0.26); c.lineTo(0.78, 0.26); c.lineTo(0.48, 0.12); c.closePath(); c.fillStyle = '#d9aa50'; c.fill();
      X.ell(c, 0.78, 0, 0.06, 0.26); c.fillStyle = hk > 0.5 ? '#ffffff' : '#e6ff8a'; c.fill();
      dot(c, -0.5, 0, 0.16, '#8a6a30');
      c.restore();
      if (glow) glow(x + P.fx * 0.62, y + P.fy * 0.44, 0.4 + hk * 0.7, hk > 0.95 ? '#ffffff' : '#e6ff8a', 0.3 + hk * 0.6);
      dot(c, lx + gx(P, fw - 0.3, 0.3), ly + gy(P, fw - 0.3, 0.3) - 0.78 + b, 0.13, '#f2d9b5');
    });
  };

  /* ---------- 5. 초롱: 종이 등불 머리, 갓, 붉은 도포, 등불 지팡이 ---------- */
  H.chorong = function (ctx, P, glow) {
    const lx = gx(P, P.lean, 0), ly = gy(P, P.lean, 0), b = P.bob * 1.6 - 0.12, ch = P.pose.charge >= 0 ? P.pose.charge : 0;
    const lit = 0.75 + 0.2 * Math.sin(P.t * 3.3) + ch * 0.6 + P.castK * 0.4;
    part(P, 0, (c) => {         // 도포 (발이 없고 살짝 떠 있다)
      const sway = Math.sin(P.t * 2.6) * 0.06;
      c.beginPath(); c.moveTo(lx - 0.34, ly - 1.4 + b); c.quadraticCurveTo(lx - 0.82, ly - 0.7 + b, lx - 0.62 + sway, ly - 0.16 + b);
      c.quadraticCurveTo(lx - 0.3, ly - 0.02 + b, lx, ly - 0.14 + b); c.quadraticCurveTo(lx + 0.3, ly - 0.02 + b, lx + 0.62 + sway, ly - 0.16 + b);
      c.quadraticCurveTo(lx + 0.82, ly - 0.7 + b, lx + 0.34, ly - 1.4 + b); c.closePath();
      c.fillStyle = grad(c, ly - 1.4, ly, '#e2584a', '#6e1f24'); c.fill();
      c.strokeStyle = '#ffd27a'; c.lineWidth = 0.06; c.beginPath(); c.moveTo(lx - 0.6 + sway, ly - 0.2 + b); c.quadraticCurveTo(lx - 0.3, ly - 0.07 + b, lx, ly - 0.19 + b); c.quadraticCurveTo(lx + 0.3, ly - 0.07 + b, lx + 0.6 + sway, ly - 0.2 + b); c.stroke();
      sash(c, P, ly - 0.86 + b, 0.56, 0.2, glow);
    });
    part(P, gd(P, 0.08, 0) + 0.01, (c) => {
      const hx = lx + gx(P, 0.08, 0), hy = ly + gy(P, 0.08, 0) - 1.84 + b;
      // 종이 등불(머리)
      ball(c, hx, hy, 0.46, 0.5, '#fff3c8', '#ffb347');
      c.strokeStyle = 'rgba(150,80,30,0.45)'; c.lineWidth = 0.035;
      for (let i = -2; i <= 2; i++) { const a = around(P, i * 0.62, 0.46); if (a.d < -0.2) continue; c.beginPath(); c.ellipse(hx + a.x * 0.5, hy, Math.max(0.02, Math.abs(a.x) * 0.5 + 0.02), 0.5, 0, 0, TAU); c.stroke(); }
      X.rr(c, hx - 0.2, hy + 0.44, 0.4, 0.1, 0.03); c.fillStyle = '#5a2a1c'; c.fill();
      eyes(c, P, hx, hy, 0.44, '#5a2a1c', null, 0.07, 0.42, 'slit');
      if (glow) glow(hx, hy, 1.5 + ch * 1.2, '#ffd27a', Math.min(1, 0.5 * lit));
      // 갓: 넓은 챙 + 원통
      X.ell(c, hx, hy - 0.42, 0.86, 0.24); c.fillStyle = 'rgba(18,14,22,0.82)'; c.fill();
      X.rr(c, hx - 0.3, hy - 0.86, 0.6, 0.46, 0.1); c.fillStyle = 'rgba(24,18,28,0.92)'; c.fill();
      X.ell(c, hx, hy - 0.86, 0.3, 0.09); c.fillStyle = 'rgba(60,50,70,0.9)'; c.fill();
      seg(c, hx - 0.3, hy - 0.46, hx + 0.3, hy - 0.46, 0.05, '#ffd27a');
    });
    // 지팡이 끝에 매달린 작은 등
    const fw = 0.55 + P.castK * 0.35 + ch * 0.25, sd = 0.62;
    part(P, gd(P, fw, sd) + 0.03, (c) => {
      const x = lx + gx(P, fw, sd), y = ly + gy(P, fw, sd) - 0.9 + b, top = y - 1.25 - ch * 0.2;
      seg(c, x, y + 0.5, x, top, 0.07, '#3a2a22');
      seg(c, x, top, x + P.fx * 0.3, top - 0.05 + P.fy * 0.1, 0.06, '#3a2a22');
      const ox = x + P.fx * 0.3 + Math.sin(P.t * 3) * 0.05, oy = top + 0.3 + P.fy * 0.1;
      seg(c, x + P.fx * 0.3, top - 0.05 + P.fy * 0.1, ox, oy - 0.16, 0.03, '#ffd27a');
      ball(c, ox, oy, 0.17 + ch * 0.1, 0.2 + ch * 0.1, '#fff8dc', '#ffb347');
      if (glow) glow(ox, oy, 0.8 + ch * 1.6, ch > 0.85 ? '#ffffff' : '#ffd27a', 0.6 + ch * 0.4);
      dot(c, x, y, 0.13, '#f1d8c0');
    });
  };

  /* ---------- 6. 서리: 얼음 뿔관, 넓은 치마, 떠 있는 얼음 결정 ---------- */
  H.seori = function (ctx, P, glow) {
    const lx = gx(P, P.lean, 0), ly = gy(P, P.lean, 0), b = P.bob;
    part(P, gd(P, -0.35, 0), (c) => { const ax = lx + gx(P, -0.25, 0), ay = ly + gy(P, -0.25, 0) - 1.5 + b; ribbon(c, P, ax, ay, 1.5, 0.24, 'rgba(210,240,255,0.75)', 0.6, 0.25); });
    part(P, 0, (c) => {
      const sway = Math.sin(P.walk) * 0.08 * P.mv;
      c.beginPath(); c.moveTo(lx - 0.3, ly - 1.0 + b); c.quadraticCurveTo(lx - 1.0, ly - 0.55, lx - 0.85 + sway, ly - 0.08); c.quadraticCurveTo(lx, ly + 0.14, lx + 0.85 + sway, ly - 0.08); c.quadraticCurveTo(lx + 1.0, ly - 0.55, lx + 0.3, ly - 1.0 + b); c.closePath();
      c.fillStyle = grad(c, ly - 1.0, ly, '#eaf6ff', '#6fa9d6'); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 0.04; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(lx + i * 0.15, ly - 0.95 + b); c.quadraticCurveTo(lx + i * 0.5, ly - 0.5, lx + i * 0.55 + sway, ly - 0.03); c.stroke(); }
      ball(c, lx, ly - 1.18 + b, 0.38, 0.36, '#f6fbff', '#9cc6e6');                       // 저고리
      sash(c, P, ly - 1.0 + b, 0.4, 0.14, glow);
    });
    part(P, gd(P, 0.08, 0) + 0.01, (c) => {
      const hx = lx + gx(P, 0.08, 0), hy = ly + gy(P, 0.08, 0) - 1.86 + b;
      ball(c, hx - P.fx * 0.1, hy - 0.08, 0.47, 0.44, '#3f4f78', '#232c4a');       // 머리카락
      ball(c, hx + P.fx * 0.05, hy + 0.03, 0.4, 0.4, '#f7ecea', '#cbb9c6');           // 얼굴
      const v = U.clamp((-P.fy + 0.2) / 0.5, 0, 1); if (v > 0) { c.globalAlpha = v; ball(c, hx, hy, 0.46, 0.44, '#3f4f78', '#232c4a'); c.globalAlpha = 1; }
      eyes(c, P, hx, hy, 0.4, '#7fd8ff', glow, 0.06, 0.45);
      // 얼음 뿔관
      for (let s = -1; s <= 1; s += 2) {
        const e = around(P, s * 1.2, 0.34), x0 = hx + e.x, y0 = hy - 0.32;
        c.strokeStyle = '#d8f4ff'; c.lineWidth = 0.08; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + e.x * 0.7, y0 - 0.55); c.moveTo(x0 + e.x * 0.35, y0 - 0.28); c.lineTo(x0 + e.x * 1.3, y0 - 0.4); c.moveTo(x0 + e.x * 0.5, y0 - 0.4); c.lineTo(x0 + e.x * 0.35, y0 - 0.8); c.stroke();
        if (glow) glow(x0 + e.x * 0.7, y0 - 0.5, 0.5, '#7fd8ff', 0.35);
      }
    });
    // 떠 있는 얼음 결정
    const fw = 0.55 + P.castK * 0.5 + P.ext * 0.2, sd = 0.75;
    part(P, gd(P, fw, sd) + 0.03, (c) => {
      const x = lx + gx(P, fw, sd), y = ly + gy(P, fw, sd) - 1.25 + b + Math.sin(P.t * 3.1) * 0.08, r = 0.26 + P.castK * 0.12, rot = P.t * 1.5;
      c.fillStyle = '#dff5ff'; c.beginPath(); for (let i = 0; i < 4; i++) { const a = rot + i * Math.PI / 2, rr = i % 2 ? r * 0.55 : r * 1.25; if (i) c.lineTo(x + Math.cos(a) * rr * 0.8, y + Math.sin(a) * rr); else c.moveTo(x + Math.cos(a) * rr * 0.8, y + Math.sin(a) * rr); } c.closePath(); c.fill();
      c.fillStyle = '#8fd4ff'; c.beginPath(); c.moveTo(x, y - r * 1.2); c.lineTo(x + r * 0.42, y); c.lineTo(x, y + r * 1.2); c.closePath(); c.fill();
      if (glow) glow(x, y, 0.75 + P.castK * 0.8, '#7fd8ff', 0.55 + P.castK * 0.4);
    });
    part(P, gd(P, 0.3, -0.5) + 0.02, (c) => { dot(c, lx + gx(P, 0.3, -0.5), ly + gy(P, 0.3, -0.5) - 1.05 + b, 0.15, '#eaf6ff'); });
  };

  /* ---------- 7. 나래: 빛나는 나비 날개, 더듬이, 방울 등불 ---------- */
  H.narae = function (ctx, P, glow) {
    const lx = gx(P, P.lean, 0), ly = gy(P, P.lean, 0), b = P.bob * 1.8 - 0.22 + Math.sin(P.t * 3) * 0.04;
    const flap = 0.72 + 0.28 * Math.sin(P.t * (7 + 6 * P.mv)) + P.castK * 0.3;
    part(P, gd(P, -0.3, 0), (c) => {      // 날개 넷
      const ax = lx + gx(P, -0.22, 0), ay = ly + gy(P, -0.22, 0) - 1.2 + b;
      for (let s = -1; s <= 1; s += 2) {
        const wx = P.px * s, wy = P.py * s * K, spread = Math.max(0.3, Math.abs(P.fy) * 0.6 + 0.4) * flap;
        c.save(); c.translate(ax, ay); c.transform(1, 0, 0, 1, 0, 0);
        const ux = (wx !== 0 || wy !== 0) ? wx : s, uy = wy;
        c.fillStyle = 'rgba(255,190,205,0.78)'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(ux * 0.5 * spread + 0.1 * s, -1.45, ux * 1.55 * spread, -0.95 + uy * 0.8); c.quadraticCurveTo(ux * 1.75 * spread, -0.2 + uy, ux * 0.35 * spread, 0.1 + uy * 0.3); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,225,170,0.72)'; c.beginPath(); c.moveTo(0, 0.05); c.quadraticCurveTo(ux * 1.3 * spread, 0.15 + uy, ux * 1.05 * spread, 0.85 + uy * 0.6); c.quadraticCurveTo(ux * 0.4 * spread, 0.95, 0, 0.3); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.035; c.beginPath(); c.moveTo(0, 0); c.lineTo(ux * 1.3 * spread, -0.85 + uy * 0.7); c.moveTo(0, 0.05); c.lineTo(ux * 0.9 * spread, 0.6 + uy * 0.5); c.stroke();
        c.restore();
        if (glow) glow(ax + ux * 1.1 * spread, ay - 0.7 + uy, 0.8, '#ffd9a0', 0.25);
      }
    });
    part(P, 0, (c) => { ball(c, lx, ly - 0.95 + b, 0.36, 0.56, '#ffd0da', '#c97a92'); c.fillStyle = grad(c, ly - 0.7 + b, ly - 0.2 + b, '#f3a8ba', 'rgba(243,168,186,0)'); c.beginPath(); c.moveTo(lx - 0.3, ly - 0.75 + b); c.lineTo(lx + 0.3, ly - 0.75 + b); c.lineTo(lx + 0.1, ly - 0.15 + b); c.lineTo(lx - 0.1, ly - 0.15 + b); c.closePath(); c.fill(); sash(c, P, ly - 0.86 + b, 0.38, 0.14, glow); });
    part(P, gd(P, 0.08, 0) + 0.01, (c) => {
      const hx = lx + gx(P, 0.08, 0), hy = ly + gy(P, 0.08, 0) - 1.72 + b;
      ball(c, hx, hy, 0.42, 0.42, '#fff3ee', '#e9b8c0');
      ball(c, hx - P.fx * 0.14, hy - 0.16, 0.42, 0.32, '#ff9db5', '#d86a8c');     // 머리칼
      eyes(c, P, hx, hy, 0.4, '#7a3a5a', null, 0.065, 0.45);
      for (let s = -1; s <= 1; s += 2) {
        const e = around(P, s * 0.7, 0.3), tx = hx + e.x * 1.9 + Math.sin(P.t * 4 + s) * 0.04, ty = hy - 0.82 + e.y * 0.3;
        c.strokeStyle = '#d86a8c'; c.lineWidth = 0.045; c.lineCap = 'round'; c.beginPath(); c.moveTo(hx + e.x * 0.7, hy - 0.36); c.quadraticCurveTo(hx + e.x * 1.2, hy - 0.8, tx, ty); c.stroke();
        dot(c, tx, ty, 0.075, '#fff0b0'); if (glow) glow(tx, ty, 0.36, '#fff0b0', 0.75);
      }
    });
    const fw = 0.5 + P.castK * 0.3 + P.ext * 0.15, sd = 0.55;
    part(P, gd(P, fw, sd) + 0.03, (c) => {      // 방울 등불 지팡이
      const x = lx + gx(P, fw, sd), y = ly + gy(P, fw, sd) - 0.95 + b, top = y - 0.95;
      seg(c, x, y + 0.45, x, top, 0.055, '#c9a26a');
      c.strokeStyle = '#ffe9a8'; c.lineWidth = 0.05; c.beginPath(); c.arc(x, top - 0.16, 0.17, 0, TAU); c.stroke();
      const sw = Math.sin(P.t * 4) * 0.06; dot(c, x + sw, top - 0.16, 0.1, '#fff8dc');
      if (glow) glow(x + sw, top - 0.16, 0.7 + P.castK * 0.8, '#fff0b0', 0.6 + P.castK * 0.4);
      dot(c, x, y, 0.12, '#fff3ee');
    });
  };

  /* ---------- 8. 아귀: 삿갓, 도롱이, 이마의 미끼등, 닻 ---------- */
  H.agwi = function (ctx, P, glow) {
    const lx = gx(P, P.lean, 0), ly = gy(P, P.lean, 0), b = P.bob * 0.6;
    feet(ctx, P, '#1d3a44', 0.5, 0.3);
    part(P, gd(P, -0.32, 0), (c) => {     // 도롱이(짚 망토)
      const x = lx + gx(P, -0.3, 0), y = ly + gy(P, -0.3, 0) - 0.95 + b;
      c.fillStyle = '#b79a52'; c.beginPath(); c.moveTo(x - 0.7, y - 0.45);
      for (let i = 0; i <= 8; i++) { const k = i / 8, xx = x - 1.0 + k * 2.0; c.lineTo(xx, y + 0.5 + (i % 2 ? 0.2 : 0) + Math.sin(P.t * 3 + i) * 0.03); }
      c.lineTo(x + 0.7, y - 0.45); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(90,70,30,0.5)'; c.lineWidth = 0.04; for (let i = 0; i < 7; i++) { const xx = x - 0.75 + i * 0.25; c.beginPath(); c.moveTo(xx * 0.6 + x * 0.4, y - 0.4); c.lineTo(xx, y + 0.5); c.stroke(); }
    });
    part(P, 0, (c) => {
      ball(c, lx, ly - 0.82 + b, 0.88, 0.72, '#3f7482', '#16323c');
      X.ell(c, lx + gx(P, 0.3, 0), ly - 0.7 + b + gy(P, 0.3, 0), 0.5, 0.4); c.fillStyle = 'rgba(190,230,220,0.28)'; c.fill();
      sash(c, P, ly - 0.7 + b, 0.88, 0.28, glow);
    });
    part(P, gd(P, 0.3, 0) + 0.01, (c) => {
      const hx = lx + gx(P, 0.3, 0), hy = ly + gy(P, 0.3, 0) - 1.4 + b;
      ball(c, hx, hy, 0.62, 0.46, '#4a8494', '#1c3d48');
      // 큰 입과 이빨
      const m = around(P, 0, 0.46), v = U.clamp((P.fy + 0.6) / 0.5, 0, 1);
      if (v > 0) {
        c.globalAlpha = v; const mx = hx + m.x * 0.75, my = hy + m.y * 0.55 + 0.17, mw = 0.42 * (0.45 + 0.55 * Math.abs(P.fy));
        X.ell(c, mx, my, mw, 0.13); c.fillStyle = '#0d1a20'; c.fill();
        c.fillStyle = '#eafff6'; for (let i = -2; i <= 2; i++) { const tx = mx + i * mw * 0.36; c.beginPath(); c.moveTo(tx - 0.06, my - 0.1); c.lineTo(tx, my + 0.06); c.lineTo(tx + 0.06, my - 0.1); c.closePath(); c.fill(); }
        c.globalAlpha = 1;
      }
      eyes(c, P, hx, hy - 0.1, 0.52, '#eafff6', glow, 0.05, 0.75);
      // 삿갓
      c.fillStyle = grad(c, hy - 1.0, hy - 0.2, '#e2c880', '#8a6f34'); c.beginPath(); c.moveTo(hx - 1.0, hy - 0.22); c.quadraticCurveTo(hx - 0.3, hy - 0.5, hx - P.fx * 0.1, hy - 1.0); c.quadraticCurveTo(hx + 0.3, hy - 0.5, hx + 1.0, hy - 0.22); c.quadraticCurveTo(hx, hy + 0.02, hx - 1.0, hy - 0.22); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(90,70,30,0.45)'; c.lineWidth = 0.035; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(hx - P.fx * 0.1, hy - 1.0); c.lineTo(hx + i * 0.42, hy - 0.16 - Math.abs(i) * 0.03); c.stroke(); }
      // 미끼등: 이마에서 앞으로 휘어 늘어진다
      const l = around(P, 0, 1.1), bx = hx + l.x + Math.sin(P.t * 2.6) * 0.07, by = hy - 0.55 + l.y * 0.6 + Math.cos(P.t * 2.6) * 0.04 + 0.35;
      c.strokeStyle = '#2f5c68'; c.lineWidth = 0.06; c.lineCap = 'round'; c.beginPath(); c.moveTo(hx + l.x * 0.25, hy - 0.72); c.quadraticCurveTo(hx + l.x * 0.9, hy - 1.25, bx, by - 0.14); c.stroke();
      const pl = 0.7 + 0.3 * Math.sin(P.t * 4) + P.castK * 0.8;
      dot(c, bx, by, 0.15 + P.castK * 0.08, '#d6fff2');
      if (glow) glow(bx, by, 1.1 + P.castK * 2.2, '#7dffd9', Math.min(1, 0.55 * pl));
    });
    // 닻: 크게 휘두른다
    const fwd = 0.5 + P.ext * 0.6 + P.castK * 0.4, side = 0.95 - P.sw * 0.5;
    part(P, gd(P, fwd, side) + 0.03, (c) => {
      const x = lx + gx(P, fwd, side), y = ly + gy(P, fwd, side) - 0.72 + b - Math.max(0, -P.sw) * 0.5;
      const ang = P.f + 0.5 - P.sw * 1.4;
      c.save(); c.translate(x, y); c.scale(1, 0.8); c.rotate(ang);
      seg(c, -0.25, 0, 0.95, 0, 0.1, '#8d9aa0');
      c.strokeStyle = '#c3ced2'; c.lineWidth = 0.13; c.lineCap = 'round'; c.beginPath(); c.arc(0.7, 0, 0.5, -1.25, 1.25); c.stroke();
      c.strokeStyle = '#8d9aa0'; c.lineWidth = 0.07; c.beginPath(); c.arc(-0.36, 0, 0.12, 0, TAU); c.stroke();
      c.restore();
      dot(c, x, y, 0.26, '#3f7482');
    });
    part(P, gd(P, 0.35, -0.9) + 0.02, (c) => { dot(c, lx + gx(P, 0.35, -0.9), ly + gy(P, 0.35, -0.9) - 0.7 + b, 0.26, '#3f7482'); });
  };

  /* ---------- 공용: 영웅 한 명 ---------- */
  Art.hero = function (ctx, heroId, pose, glow) {
    const P = mk(pose), fn = H[heroId];
    if (pose.dash === 'roll') {           // 구르기: 둥글게 말려 돈다
      const hd = TW.Heroes[heroId], a = pose.t * 22;
      ball(ctx, 0, -0.62, 0.66, 0.6, U.shade(hd.color, 0.25), U.shade(hd.color, -0.5));
      ctx.strokeStyle = hd.glow; ctx.lineWidth = 0.12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, -0.62, 0.42, a, a + 2.2); ctx.stroke();
      ctx.strokeStyle = P.team; ctx.beginPath(); ctx.arc(0, -0.62, 0.42, a + 3.14, a + 4.6); ctx.stroke();
      if (glow) glow(0, -0.62, 1.1, hd.glow, 0.35);
      return;
    }
    fn(ctx, P, glow);
    flush(ctx, P);
  };
  Art.H = H; Art.mk = mk; Art.ball = ball; Art.dot = dot; Art.seg = seg; Art.grad = grad; Art.K = K;

  /* 초상화: 영웅을 살짝 비스듬히 세워 머리 쪽을 크게 잡는다 (캐시) */
  const portraits = new Map();
  Art.portrait = function (heroId, px) {
    px = Math.max(16, Math.round(px));
    const key = heroId + '|' + px;
    let cv = portraits.get(key);
    if (cv) return cv;
    cv = X.canvas(px, px);
    const c = cv.getContext('2d'), hd = TW.Heroes[heroId];
    const g = c.createRadialGradient(px * 0.5, px * 0.42, px * 0.05, px * 0.5, px * 0.5, px * 0.75);
    g.addColorStop(0, U.shade(hd.glow, -0.35)); g.addColorStop(0.6, U.mix(hd.color, '#0d1024', 0.72)); g.addColorStop(1, '#070916');
    c.fillStyle = g; c.fillRect(0, 0, px, px);
    const s = px / 2.25, glows = [];
    c.save(); c.translate(px * 0.5, px * 1.28); c.scale(s, s);
    Art.hero(c, heroId, { f: Math.PI / 2 - 0.42, t: 1.3, walk: 0, mv: 0, atk: -1, cast: -1, charge: -1, team: -1, teamCol: hd.glow, st: {}, atkN: 0, seed: 1 }, (x, y, r, col, a) => glows.push(x, y, r, col, a));
    c.restore();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < glows.length; i += 5) X.glow(c, px * 0.5 + glows[i] * s, px * 1.28 + glows[i + 1] * s, glows[i + 2] * s, glows[i + 3], glows[i + 4] * 0.8);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    portraits.set(key, cv);
    return cv;
  };
})();
