/* 어스름 전선 — gfx: 캔버스 도우미(도형·빛 스프라이트·글자)와 입자 효과(FX)
   FX 는 월드 좌표로 살고, world.js 가 층별로 그린다:
     ground(땅 위 자국) → mid(파편·연기, 조명을 받는다) → add(불꽃·빛줄기, 조명 뒤에 더해진다) → text(화면 글자) */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const U = TW.U, TAU = Math.PI * 2;
  const X = TW.X = {};

  X.canvas = function (w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  X.FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Segoe UI", system-ui, sans-serif';
  X.font = (px, weight) => (weight || 700) + ' ' + (Math.round(px * 10) / 10) + 'px ' + X.FONT;

  /* 둥근 사각형 경로 */
  X.rr = function (ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };
  X.circle = function (ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); };
  X.ell = function (ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); };
  X.poly = function (ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); };
  X.fill = function (ctx, color) { ctx.fillStyle = color; ctx.fill(); };
  X.stroke = function (ctx, color, w) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); };
  /* 초승달/부채꼴 */
  X.pie = function (ctx, x, y, r, a0, a1) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a0, a1); ctx.closePath(); };
  X.star = function (ctx, x, y, r, n, inner, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = (rot || 0) + i * Math.PI / n, rr = i % 2 ? r * (inner || 0.45) : r; if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  };

  /* ---------- 빛 스프라이트 (그라디언트를 매번 만들지 않는다) ---------- */
  const glowCache = new Map();
  X.glowSprite = function (color) {
    let s = glowCache.get(color);
    if (s) return s;
    const N = 64; s = X.canvas(N, N);
    const g = s.getContext('2d'), c = U.rgb(color);
    const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    const col = (a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    gr.addColorStop(0, col(1)); gr.addColorStop(0.22, col(0.62)); gr.addColorStop(0.5, col(0.22)); gr.addColorStop(0.78, col(0.06)); gr.addColorStop(1, col(0));
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    glowCache.set(color, s);
    return s;
  };
  /* 빛 덩어리 하나 (합성 모드는 부르는 쪽에서 정한다) */
  X.glowK = 1;       // 빛 예산(world.js 의 W.lumK)이 정해 주는 배율: 빛이 몰린 자리에서는 1 보다 작아진다
  X.glow = function (ctx, x, y, r, color, alpha) {
    alpha *= X.glowK;
    if (!(r > 0) || !(alpha > 0.004)) return;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.drawImage(X.glowSprite(color), x - r, y - r, r * 2, r * 2);
  };
  /* 가장자리가 부드러운 원 (연기·그림자용) */
  const softCache = new Map();
  X.softSprite = function (color) {
    let s = softCache.get(color);
    if (s) return s;
    const N = 48; s = X.canvas(N, N);
    const g = s.getContext('2d'), c = U.rgb(color);
    const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    const col = (a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    gr.addColorStop(0, col(0.85)); gr.addColorStop(0.55, col(0.6)); gr.addColorStop(1, col(0));
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    softCache.set(color, s);
    return s;
  };
  X.soft = function (ctx, x, y, r, color, alpha) {
    if (!(r > 0) || !(alpha > 0.004)) return;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.drawImage(X.softSprite(color), x - r, y - r, r * 2, r * 2);
  };

  /* 글자: 테두리 → 속 */
  X.text = function (ctx, str, x, y, px, color, align, weight, outline, outW) {
    ctx.font = X.font(px, weight || 700); ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    if (outline) { ctx.lineJoin = 'round'; ctx.lineWidth = outW || Math.max(2, px * 0.22); ctx.strokeStyle = outline; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  };
  X.textW = function (ctx, str, px, weight) { ctx.font = X.font(px, weight || 700); return ctx.measureText(str).width; };
  /* 긴 글을 너비에 맞춰 줄바꿈 (한글은 글자 단위로도 끊는다) */
  X.wrap = function (ctx, str, maxW, px, weight) {
    ctx.font = X.font(px, weight || 500);
    const out = []; let line = '';
    const words = String(str).split(' ');
    for (let w = 0; w < words.length; w++) {
      const word = words[w], test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) out.push(line);
      if (ctx.measureText(word).width <= maxW) { line = word; continue; }
      line = '';
      for (const ch of word) { if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
    }
    if (line) out.push(line);
    return out;
  };

  /* =====================================================================
     입자 효과
     ===================================================================== */
  const FX = TW.FX = { ground: [], mid: [], add: [], text: [], lights: [], count: 0, quality: 1, K: 1, LIFT: 0 };
  const CAP = { ground: 90, mid: 220, add: 520, text: 60, lights: 40 };
  function push(layer, p) {
    const a = FX[layer];
    if (a.length >= CAP[layer] * FX.quality) { if (p.must) a.shift(); else return null; }
    p.t = 0; a.push(p);
    return p;
  }
  FX.clear = function () { FX.ground.length = FX.mid.length = FX.add.length = FX.text.length = FX.lights.length = 0; };
  let seed = 9871;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  FX.rnd = rnd;

  /* --- 만들기 --- */
  FX.spark = function (x, y, vx, vy, life, color, size, drag, z, vz) { return push('add', { k: 'spark', x, y, vx, vy, life, color, size: size || 0.12, drag: drag === undefined ? 3 : drag, z: z || 0, vz: vz || 0 }); };
  FX.burst = function (x, y, n, color, speed, life, size, z) {
    n = Math.round(n * (0.5 + 0.5 * FX.quality));
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = speed * (0.35 + rnd() * 0.75); FX.spark(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + rnd() * 0.6), color, size, 3.2, z || 0.6, rnd() * 3); }
  };
  FX.sparks = function (x, y, ang, spread, n, color, speed, life, size) {
    n = Math.round(n * (0.5 + 0.5 * FX.quality));
    for (let i = 0; i < n; i++) { const a = ang + (rnd() - 0.5) * spread, s = speed * (0.4 + rnd() * 0.8); FX.spark(x, y, Math.cos(a) * s, Math.sin(a) * s, (life || 0.3) * (0.6 + rnd() * 0.7), color, size, 3.5, 0.8, rnd() * 2.5); }
  };
  FX.glow = function (x, y, r0, r1, life, color, a, z) { return push('add', { k: 'glow', x, y, r0, r1, life, color, a: a === undefined ? 0.8 : a, z: z || 0 }); };
  FX.light = function (x, y, r, life, color, a) { return push('lights', { x, y, r, life, color, a: a === undefined ? 1 : a }); };
  FX.ring = function (x, y, r0, r1, life, color, w, layer) { return push(layer || 'add', { k: 'ring', x, y, r0, r1, life, color, w: w || 0.2 }); };
  /* 땅에 깔리는 원판: 넓을수록, 빛깔이 밝을수록 속을 옅게 채운다(테두리 고리는 그대로).
     밝은 돌바닥 위에 지름 400px 짜리 밝은 원판이 반투명으로 깔리면 그 위의 빛들과 겹쳐 싸움 한복판이 하얗게 뭉쳤다 */
  const _lum = new Map();
  function lightness(c) { let v = _lum.get(c); if (v === undefined) { v = 0.5; if (typeof c === 'string' && c[0] === '#' && c.length === 7) { const n = parseInt(c.slice(1), 16); v = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; } _lum.set(c, v); } return v; }
  FX.disc = function (x, y, r, life, color, a) { a = a === undefined ? 0.5 : a; return push('ground', { k: 'disc', x, y, r, life, color, a: a * Math.min(1, 2.6 / Math.max(0.1, r)) * (lightness(color) > 0.8 ? 0.7 : 1), sa: a }); };
  FX.crack = function (x, y, r, color, life) { const rays = []; const n = 7 + ((rnd() * 4) | 0); for (let i = 0; i < n; i++) rays.push(i / n * TAU + rnd() * 0.5, 0.45 + rnd() * 0.55, (rnd() - 0.5) * 0.7); return push('ground', { k: 'crack', x, y, r, life: life || 2.6, color, rays }); };
  FX.smoke = function (x, y, r, life, color, a, vx, vy) { return push('mid', { k: 'smoke', x, y, r, life, color, a: a === undefined ? 0.45 : a, vx: vx || 0, vy: vy || 0 }); };
  FX.shards = function (x, y, n, color, speed) {
    n = Math.round(n * (0.5 + 0.5 * FX.quality));
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = speed * (0.3 + rnd() * 0.8); push('mid', { k: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, z: 0.3, vz: 5 + rnd() * 7, life: 0.7 + rnd() * 0.5, color, size: 0.14 + rnd() * 0.2, rot: rnd() * TAU, vr: (rnd() - 0.5) * 16 }); }
  };
  FX.slash = function (x, y, ang, r, arc, life, color, w) { return push('add', { k: 'slash', x, y, ang, r, arc, life, color, w: w || 0.5 }); };
  FX.thrust = function (x, y, ang, len, w, life, color) { return push('add', { k: 'thrust', x, y, ang, len, w, life, color }); };
  FX.beam = function (x1, y1, x2, y2, w, life, color) { return push('add', { k: 'beam', x: x1, y: y1, x2, y2, w, life, color, must: true }); };
  FX.line = function (x1, y1, x2, y2, w, life, color) { return push('add', { k: 'line', x: x1, y: y1, x2, y2, w, life, color }); };
  FX.bolt = function (x1, y1, x2, y2, life, color, w) {
    const pts = [x1, y1], d = Math.hypot(x2 - x1, y2 - y1), n = Math.max(2, Math.round(d / 1.4)), nx = -(y2 - y1) / (d || 1), ny = (x2 - x1) / (d || 1);
    for (let i = 1; i < n; i++) { const k = i / n, o = (rnd() - 0.5) * 1.3; pts.push(x1 + (x2 - x1) * k + nx * o, y1 + (y2 - y1) * k + ny * o); }
    pts.push(x2, y2);
    return push('add', { k: 'bolt', x: x1, y: y1, pts, life, color, w: w || 0.22 });
  };
  FX.pillar = function (x, y, r, life, color, follow) { return push('add', { k: 'pillar', x, y, r, life, color, follow: follow || null }); };
  FX.coin = function (x, y, target, delay) { const a = rnd() * TAU, s = 4 + rnd() * 5; return push('add', { k: 'coin', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 1.1, target, delay: delay || 0, must: true }); };
  FX.ghost = function (draw, x, y, life, a) { return push('mid', { k: 'ghost', x, y, life, draw, a: a === undefined ? 0.5 : a }); };
  /* 맞은 자리의 별 모양 불꽃: 닿는 순간 두 프레임 또렷하게 터졌다가 줄어들며 사그라든다.
     ang = 맞은 방향(땅 위) — 가장 긴 가시가 그쪽으로 뻗는다 · r = 크기(땅 단위) · color = 때린 쪽 빛깔 */
  FX.impact = function (x, y, ang, r, color, life) { return push('add', { k: 'impact', x, y, ang, r, color, life: life || 0.13, n: rnd() < 0.5 ? 4 : 5, spin: (rnd() - 0.5) * 0.5, must: true }); };
  /* 화면 글자(피해 숫자·상태 이름). style: 'basic'|'skill'|'big'|'dot'|'hurt'|'heal'|'gold'|'label' */
  let numSide = 1;
  FX.num = function (x, y, str, style, color, follow) {
    // 피해 숫자는 몸통에서 좌우로 번갈아 튀어 오른다 (체력 막대를 가리지 않게). 이름표·골드·회복은 곧게 뜬다
    const side = style === 'label' || style === 'gold' || style === 'heal' || style === 'miss' ? 0 : (numSide = -numSide);
    // 피해 숫자는 맞은 자리에서 잠깐(멈칫하는 동안) 크게 박혀 있다가 튀어 나간다 → 숫자도 한 대의 박자를 탄다
    const hold = style === 'big' ? 0.09 : style === 'skill' ? 0.06 : style === 'basic' || style === 'hurt' ? 0.045 : 0;
    return push('text', { k: 'num', x: x + side * 0.5, y, str, style, color, follow: follow || null, ox: (rnd() - 0.5) * 1.2, vy: side ? -3.2 - rnd() : -2.6 - rnd() * 0.8, vx: side ? side * (2.8 + rnd() * 1.6) : (rnd() - 0.5) * 2.0, life: (style === 'big' || style === 'label' ? 1.15 : style === 'dot' ? 0.6 : 0.85) + hold, hold, sz: 1, must: style !== 'dot' && style !== 'basic' });
  };

  /* --- 갱신 --- */
  FX.update = function (dt) {
    for (const key of ['ground', 'mid', 'add', 'text', 'lights']) {
      const a = FX[key]; let w = 0;
      for (let i = 0; i < a.length; i++) {
        const p = a[i]; p.t += dt;
        if (p.t >= p.life) continue;
        switch (p.k) {
          case 'spark': { const dr = Math.max(0, 1 - p.drag * dt); p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= dr; p.vy *= dr; if (p.z > 0 || p.vz > 0) { p.z += p.vz * dt; p.vz -= 14 * dt; if (p.z < 0) { p.z = 0; p.vz = 0; } } break; }
          case 'shard': p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 26 * dt; p.rot += p.vr * dt; if (p.z < 0) { p.z = 0; p.vz = -p.vz * 0.35; p.vx *= 0.5; p.vy *= 0.5; p.vr *= 0.5; } break;
          case 'smoke': p.x += p.vx * dt; p.y += p.vy * dt; break;
          case 'coin': {
            if (p.t < 0.22 + p.delay) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
            else if (p.target) { const tx = p.target.x, ty = p.target.y - 1, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), sp = 26 + (p.t - 0.22) * 60; if (d < sp * dt + 0.4) { p.life = p.t; if (p.done) p.done(); } else { p.x += dx / d * sp * dt; p.y += dy / d * sp * dt; } }
            break;
          }
          case 'num': if (p.t > (p.hold || 0)) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; } break;
          default: break;
        }
        a[w++] = p;
      }
      a.length = w;
    }
    FX.count = FX.ground.length + FX.mid.length + FX.add.length + FX.text.length;
  };

  /* --- 그리기 (ctx 는 이미 월드 변환이 걸려 있다. ground 층은 땅 좌표 그대로) --- */
  FX.drawGround = function (ctx) {
    const a = FX.ground;
    for (let i = 0; i < a.length; i++) {
      const p = a[i], k = p.t / p.life;
      if (p.k === 'disc') {
        ctx.globalAlpha = p.a * (1 - k) * (1 - k);
        X.circle(ctx, p.x, p.y, p.r * (0.55 + 0.45 * U.easeOut3(k))); X.fill(ctx, p.color);
        ctx.globalAlpha = Math.min(1, (p.sa || p.a) * 1.6) * (1 - k);
        X.circle(ctx, p.x, p.y, p.r * U.easeOut3(k)); X.stroke(ctx, p.color, 0.16 + 0.3 * (1 - k));
      } else if (p.k === 'crack') {
        ctx.globalAlpha = (k < 0.7 ? 1 : (1 - k) / 0.3) * 0.75;
        ctx.strokeStyle = p.color; ctx.lineCap = 'round';
        const grow = U.easeOut3(Math.min(1, p.t / 0.18));
        for (let j = 0; j < p.rays.length; j += 3) {
          const an = p.rays[j], len = p.rays[j + 1] * p.r * grow, bend = p.rays[j + 2];
          ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + Math.cos(an) * len * 0.55, p.y + Math.sin(an) * len * 0.55);
          ctx.lineTo(p.x + Math.cos(an + bend) * len, p.y + Math.sin(an + bend) * len); ctx.stroke();
        }
        ctx.globalAlpha *= 0.5; ctx.strokeStyle = '#0b0d1a'; ctx.lineWidth = 0.42;
        for (let j = 0; j < p.rays.length; j += 3) { const an = p.rays[j], len = p.rays[j + 1] * p.r * grow * 0.55; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(an) * len, p.y + Math.sin(an) * len); ctx.stroke(); }
      } else if (p.k === 'ring') {
        ctx.globalAlpha = 1 - k; X.circle(ctx, p.x, p.y, Math.max(0.01, U.lerp(p.r0, p.r1, U.easeOut3(k)))); X.stroke(ctx, p.color, Math.max(0.02, p.w * (1 - k * 0.6)));
      }
    }
    ctx.globalAlpha = 1;
  };
  /* mid · add 층은 '선 좌표'로 그린다: 입자의 땅 y 에 FX.K 를 곱하고(비스듬한 시점), 몸통 높이의 효과는 FX.LIFT 만큼 올린다.
     땅에 눕는 모양(고리·베기·찌르기)은 세로로 K 만큼 눌러 그린다. */
  FX.drawMid = function (ctx) {
    const a = FX.mid, K = FX.K, L = FX.LIFT;
    for (let i = 0; i < a.length; i++) {
      const p = a[i], k = p.t / p.life, gy = p.y * K;
      if (p.k === 'shard') {
        ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; X.ell(ctx, p.x, gy, p.size * 0.9, p.size * 0.6); ctx.fill();
        const c = Math.cos(p.rot) * p.size, s = Math.sin(p.rot) * p.size, y = gy - p.z;
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(p.x + c, y + s); ctx.lineTo(p.x - s * 0.7, y + c * 0.7); ctx.lineTo(p.x - c * 0.8, y - s * 0.8); ctx.lineTo(p.x + s * 0.5, y - c * 0.6); ctx.closePath(); ctx.fill();
      } else if (p.k === 'smoke') {
        X.soft(ctx, p.x, gy - L, p.r * (0.6 + 0.7 * k), p.color, p.a * (1 - k) * Math.min(1, p.t / 0.08));
      } else if (p.k === 'ghost') {
        ctx.globalAlpha = p.a * (1 - k);
        p.draw(ctx, p.x, gy);
      }
    }
    ctx.globalAlpha = 1;
  };
  FX.drawAdd = function (ctx) {
    const a = FX.add, K = FX.K, L = FX.LIFT;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < a.length; i++) {
      const p = a[i], k = p.t / p.life, f = 1 - k, py = p.y * K - L;
      switch (p.k) {
        case 'spark': {
          const y = py - p.z, vy = p.vy * K, sp = Math.hypot(p.vx, vy), l = Math.min(1.6, sp * 0.05) + p.size;
          ctx.globalAlpha = f * (FX.lumK ? FX.lumK(p.x, y, 0.5, 0.05) : 1); ctx.strokeStyle = p.color; ctx.lineWidth = p.size * (0.5 + 0.5 * f);      // 8차: 불꽃도 빛 예산을 따른다 (혼자일 때는 그대로)
          ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x - (sp > 0.01 ? p.vx / sp : 0) * l, y - (sp > 0.01 ? vy / sp : 0) * l); ctx.stroke();
          break;
        }
        case 'glow': { const r = U.lerp(p.r0, p.r1, U.easeOut(k)); X.glow(ctx, p.x, py - p.z, r, p.color, p.a * f * (FX.lumK ? FX.lumK(p.x, py - p.z, r, p.a * f) : 1) * (r > 2.4 ? 2.4 / r : 1)); break; }
        // 고리·베기·찌르기도 빛 예산을 따른다: 한자리에 여럿이 겹치면 그 자리의 것만 옅어진다(혼자일 때는 그대로)
        // 8차: 베기·찌르기·빛줄기·번개의 '흰 심'도 따른다 (예전에는 심만 예산 밖이라, 난전 한복판을 가로지르는 하늬 궁극기의 흰 찌르기가 흰 띠로 남았다)
        case 'ring': { const r = Math.max(0.01, U.lerp(p.r0, p.r1, U.easeOut3(k))); ctx.globalAlpha = f * (FX.lumK ? FX.lumK(p.x, py, 1.5, 0.5 * f) : 1); X.ell(ctx, p.x, py, r, r * K); X.stroke(ctx, p.color, Math.max(0.02, p.w * (1 - k * 0.7))); break; }
        case 'slash': {
          const a0 = p.ang - p.arc / 2 + p.arc * Math.min(1, k * 2.2) * 0.25, a1 = p.ang - p.arc / 2 + p.arc * Math.min(1, k * 2.6 + 0.35);
          ctx.globalAlpha = f * f * (FX.lumK ? FX.lumK(p.x, py, 1, 0.1) : 1); ctx.strokeStyle = p.color; ctx.lineWidth = p.w * (0.4 + 0.6 * f);      // 8차: 베기의 빛깔 부분도 빛 예산을 따른다
          ctx.beginPath(); ctx.ellipse(p.x, py, p.r, p.r * K, 0, a0, a1); ctx.stroke();
          ctx.globalAlpha = f * 0.9 * (FX.lumK ? FX.lumK(p.x, py, 1.2, 0.4 * f) : 1); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = p.w * 0.25 * f + 0.03;
          ctx.beginPath(); ctx.ellipse(p.x, py, p.r, p.r * K, 0, a0 + (a1 - a0) * 0.3, a1); ctx.stroke();
          break;
        }
        case 'thrust': {
          const c = Math.cos(p.ang), s = Math.sin(p.ang), grow = U.easeOut3(Math.min(1, k * 3)), l = p.len * grow, w = p.w * f;
          // 굵은 찌르기일수록 속을 옅게 채우고(길이 450px 의 순백 창이 싸움 한복판을 덮지 않게), 방향은 가운데의 가는 흰 심으로 또렷하게 보인다
          // 8차: 빛 예산을 길이의 세 곳(20·50·80%)에서 재어 가장 작은 배율 (빛줄기와 같게 — 난전을 뚫고 길게 뻗는 찌르기가 한가운데 한 점만 보고 제 밝기로 그려졌다)
          const lk = FX.lumK ? Math.min(FX.lumK(p.x + c * l * 0.2, py + s * l * 0.2 * K, 1.5, 0.3 * f), FX.lumK(p.x + c * l * 0.5, py + s * l * 0.5 * K, 1.5, 0.3 * f), FX.lumK(p.x + c * l * 0.8, py + s * l * 0.8 * K, 1.5, 0.3 * f)) : 1;
          ctx.globalAlpha = f * Math.min(0.62, 0.9 / (p.w + 0.3)) * lk; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.moveTo(p.x - s * w * 0.4, py + c * w * 0.4 * K); ctx.lineTo(p.x + c * l * 0.82 - s * w * 0.5, py + (s * l * 0.82 + c * w * 0.5) * K); ctx.lineTo(p.x + c * l, py + s * l * K);
          ctx.lineTo(p.x + c * l * 0.82 + s * w * 0.5, py + (s * l * 0.82 - c * w * 0.5) * K); ctx.lineTo(p.x + s * w * 0.4, py - c * w * 0.4 * K); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = f * lk; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.min(0.12, Math.max(0.05, w * 0.13)); ctx.beginPath(); ctx.moveTo(p.x, py); ctx.lineTo(p.x + c * l, py + s * l * K); ctx.stroke();      // 흰 심은 '가는' 심 그대로 (굵은 찌르기에서 심까지 굵어지지 않게 — 8차)
          break;
        }
        case 'beam': {
          const w = p.w * (k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 * f + 0.05), y2 = p.y2 * K - L;
          // 빛줄기: 바깥 빛은 옅게(굵은 흰 띠가 되지 않게), 가운데 심만 또렷하게
          // 8차: 빛줄기 전체가 빛 예산을 따른다 — 길이의 세 곳(20·50·80%)에서 재어 가장 작은 배율. 난전을 가로지르는 초롱의 빛줄기가 굵은 흰 띠가 되었다 (혼자 쏠 때는 그대로)
          const bk = FX.lumK ? Math.min(FX.lumK(p.x + (p.x2 - p.x) * 0.2, py + (y2 - py) * 0.2, 1.5, 0.2 * f), FX.lumK((p.x + p.x2) / 2, (py + y2) / 2, 1.5, 0.2 * f), FX.lumK(p.x + (p.x2 - p.x) * 0.8, py + (y2 - py) * 0.8, 1.5, 0.2 * f)) : 1;
          ctx.globalAlpha = Math.min(1, f * 1.4) * 0.3 * bk; ctx.strokeStyle = p.color; ctx.lineWidth = w * 2.2; ctx.beginPath(); ctx.moveTo(p.x, py); ctx.lineTo(p.x2, y2); ctx.stroke();
          ctx.globalAlpha = Math.min(1, f * 1.6) * 0.7 * bk; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p.x, py); ctx.lineTo(p.x2, y2); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w * 0.4; ctx.beginPath(); ctx.moveTo(p.x, py); ctx.lineTo(p.x2, y2); ctx.stroke();
          break;
        }
        case 'line': ctx.globalAlpha = f * (FX.lumK ? FX.lumK((p.x + p.x2) / 2, (py + p.y2 * K - L) / 2, 1, 0.1) : 1); ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.03, p.w * f); ctx.beginPath(); ctx.moveTo(p.x, py); ctx.lineTo(p.x2, p.y2 * K - L); ctx.stroke(); break;
        case 'bolt': {
          ctx.globalAlpha = f * (FX.lumK ? FX.lumK(p.x, p.y * K - L, 1, 0.1) : 1); ctx.strokeStyle = p.color; ctx.lineWidth = p.w * 2.4;
          ctx.beginPath(); ctx.moveTo(p.pts[0], p.pts[1] * K - L); for (let j = 2; j < p.pts.length; j += 2) ctx.lineTo(p.pts[j], p.pts[j + 1] * K - L); ctx.stroke();
          if (FX.lumK) ctx.globalAlpha *= FX.lumK(p.x, p.y * K - L, 1.2, 0.4 * f);
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = p.w * 0.8; ctx.stroke();
          break;
        }
        case 'pillar': {
          const x = p.follow ? p.follow.x : p.x, y = (p.follow ? p.follow.y : p.y) * K, h = 9 * (0.4 + 0.6 * U.easeOut3(Math.min(1, k * 4))), w = p.r * (1 - k * 0.5);
          // 아래에서 위로 사그라지는 빛기둥 (네모난 판처럼 보이지 않게 위쪽은 투명하게)
          const lk = (FX.lumK ? FX.lumK(x, y - 1, p.r * 1.6, f) : 1) * Math.min(1, 1.7 / p.r);       // 굵은 기둥일수록 옅게
          const g1 = ctx.createLinearGradient(0, y - h, 0, y); g1.addColorStop(0, U.rgba(p.color, 0)); g1.addColorStop(0.55, U.rgba(p.color, 0.13 * f * lk)); g1.addColorStop(1, U.rgba(p.color, 0.34 * f * lk));
          ctx.globalAlpha = 1; ctx.fillStyle = g1; ctx.fillRect(x - w, y - h, w * 2, h);
          const g2 = ctx.createLinearGradient(0, y - h * 0.8, 0, y); g2.addColorStop(0, U.rgba(p.color, 0)); g2.addColorStop(1, U.rgba(p.color, 0.46 * f * lk));
          ctx.fillStyle = g2; ctx.fillRect(x - w * 0.4, y - h * 0.8, w * 0.8, h * 0.8);
          X.glow(ctx, x, y, p.r * 2.2, p.color, f * 0.6 * lk);
          break;
        }
        case 'coin': {
          ctx.globalAlpha = Math.min(1, f * 4);
          X.circle(ctx, p.x, py, 0.2); X.fill(ctx, '#ffd84a');
          X.glow(ctx, p.x, py, 0.7, '#ffcf4a', 0.7);
          break;
        }
        case 'impact': {
          // 첫 0.03초는 크게 또렷하게, 그 뒤 줄어들며 사그라든다. 넓은 흰 면이 생기지 않게 가시는 가늘게 · 흰 심은 작게 (큰 싸움의 하얗게 뭉침을 다시 만들지 않는다)
          const t = p.t, pop = t < 0.03 ? 1.15 : 1.15 - 0.65 * U.easeOut((t - 0.03) / Math.max(0.01, p.life - 0.03)), R = p.r * pop;
          const al = (t < 0.05 ? 1 : Math.max(0, (p.life - t) / (p.life - 0.05))) * (FX.lumK ? FX.lumK(p.x, py, 1.2, 0.6 * f) : 1);
          if (al < 0.01) break;
          const fa = Math.atan2(Math.sin(p.ang) * K, Math.cos(p.ang)) + p.spin;      // 땅 위의 방향 → 화면 위의 방향
          ctx.fillStyle = p.color; ctx.globalAlpha = Math.min(1, al);
          for (let j = 0; j < p.n; j++) {
            const an = fa + j * TAU / p.n, c = Math.cos(an), s = Math.sin(an);
            const len = R * (j === 0 ? 1.4 : j === (p.n >> 1) ? 0.85 : 0.62), w = R * (j === 0 ? 0.15 : 0.11), b = R * 0.12;
            ctx.beginPath(); ctx.moveTo(p.x - c * b * 0.3, py - s * b * 0.3); ctx.lineTo(p.x + c * b - s * w, py + s * b + c * w); ctx.lineTo(p.x + c * len, py + s * len); ctx.lineTo(p.x + c * b + s * w, py + s * b - c * w); ctx.closePath(); ctx.fill();
          }
          // 심은 순백 대신 뜨거운 금빛: 이 층은 'screen' 으로 얹혀서 크림빛도 바닥 위에서는 순백이 된다. 파랑이 낮은 금빛은 겹쳐도 흰 덩어리로 세지 않는다
          ctx.strokeStyle = '#ffe6a0'; ctx.lineWidth = R * 0.05; ctx.globalAlpha = Math.min(1, al);
          ctx.beginPath(); ctx.moveTo(p.x, py); ctx.lineTo(p.x + Math.cos(fa) * R * 1.05, py + Math.sin(fa) * R * 1.05); ctx.stroke();
          X.circle(ctx, p.x, py, R * 0.15); X.fill(ctx, '#ffe6a0');
          break;
        }
        default: break;
      }
    }
    ctx.globalAlpha = 1;
  };

})();
