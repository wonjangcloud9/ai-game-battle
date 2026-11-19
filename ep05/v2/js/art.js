/* 청홍대전 — art: 영웅·미니언·구조물·나무를 코드로 그린다 (원점 = 발밑, 단위 = 월드 유닛, 오른쪽을 바라봄) */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const C = AOS.C, U = AOS.U, X = AOS.Gfx;
  const TAU = Math.PI * 2;
  const OUT = '#171a2c', LW = 0.075;
  const A = AOS.Art = { OUT, LW };

  function limb(ctx, x1, y1, x2, y2, w, color) {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = OUT; ctx.lineWidth = w + LW * 2; ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }
  const fs = (ctx, fill) => X.fs(ctx, fill, OUT, LW);
  const lerp = U.lerp;
  const ease = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - (1 - t) * (1 - t); };

  /* ---------- 영웅 설정 ---------- */
  const CFG = {
    gaon:  { bulk: 1.22, weapon: 'sword',  skin: '#f1c9a5', body: '#b9c4d8', dark: '#8794ad', legs: '#6f7a94', boots: '#474d66', sleeve: '#a7b3c9' },
    lira:  { bulk: 0.92, weapon: 'bow',    skin: '#f7d7b5', body: '#3f9d6b', dark: '#2c7550', legs: '#6a543c', boots: '#3d2f22', sleeve: '#3f9d6b', hair: '#f2d16b' },
    sola:  { bulk: 0.96, weapon: 'staff',  skin: '#f7d2ae', body: '#d24a2e', dark: '#a3351f', legs: '#a3351f', boots: '#5a2416', sleeve: '#d24a2e', hair: '#ff9a3c', robe: true },
    kaz:   { bulk: 0.94, weapon: 'dagger', skin: '#e6c3a3', body: '#3b3566', dark: '#29244a', legs: '#29244a', boots: '#1b1830', sleeve: '#3b3566', hair: '#23203a' },
    brom:  { bulk: 1.34, weapon: 'axe',    skin: '#d9a27a', body: '#d9a27a', dark: '#b98360', legs: '#5d4630', boots: '#3a2a1c', sleeve: '#d9a27a', hair: '#c9532b', tall: 1.06 },
    serin: { bulk: 0.9,  weapon: 'wand',   skin: '#fbe0c8', body: '#f4eedd', dark: '#d6cbb0', legs: '#d6cbb0', boots: '#b9a26a', sleeve: '#f4eedd', hair: '#e7a6d6', robe: true },
    volt:  { bulk: 0.98, weapon: 'orbs',   skin: '#f3cfae', body: '#2c47a0', dark: '#1e3176', legs: '#1f2a55', boots: '#141a36', sleeve: '#2c47a0', hair: '#ffe14a' },
    tara:  { bulk: 0.96, weapon: 'rifle',  skin: '#eec29c', body: '#b98a55', dark: '#8f6638', legs: '#5a4632', boots: '#33261a', sleeve: '#b98a55', hair: '#8a2f2f' },
  };
  A.CFG = CFG;

  /* 자세 계산: 손 위치와 무기 각도 */
  function pose(c, P) {
    const s = Math.sin(P.walk), cs = Math.cos(P.walk), mv = P.moving ? 1 : 0;
    const K = {
      by: mv ? -Math.abs(cs) * 0.07 : Math.sin(P.t * 2.4) * 0.025,
      s, cs, mv, fx: 0.5, fy: -0.95, bx: -0.34, by2: -0.92, wa: -0.9, glow: 0, lean: 0, pull: 0, kick: 0,
    };
    const a = P.atk, w = c.weapon;
    const sw = mv * s * 0.16;
    if (w === 'sword' || w === 'axe') {
      const big = w === 'axe' ? 1.15 : 1;
      K.fx = 0.5 - sw; K.fy = -0.98; K.wa = w === 'axe' ? -1.15 : -0.95;
      K.bx = w === 'axe' ? 0.22 - sw : 0.3; K.by2 = w === 'axe' ? -0.78 : -0.9;
      if (a >= 0) {
        if (a < 0.45) { const k = ease(a / 0.45); K.fx = lerp(0.5, -0.1, k); K.fy = lerp(-0.98, -1.8 * big, k); K.wa = lerp(K.wa, -2.35, k); K.lean = -0.1 * k; }
        else { const k = ease((a - 0.45) / 0.25); K.fx = lerp(-0.1, 0.9, k); K.fy = lerp(-1.8 * big, -0.72, k); K.wa = lerp(-2.35, 0.6, k); K.lean = lerp(-0.1, 0.16, k) * (1 - ease((a - 0.75) / 0.25)); }
        if (w === 'axe') { K.bx = K.fx - 0.26; K.by2 = K.fy + 0.2; }
      }
    } else if (w === 'dagger') {
      K.fx = 0.46 - sw; K.fy = -0.9; K.wa = 0.5; K.bx = -0.3 + sw; K.by2 = -0.88;
      if (a >= 0) {
        const k = a < 0.4 ? -ease(a / 0.4) * 0.3 : ease((a - 0.4) / 0.2) * (1 - ease((a - 0.7) / 0.3));
        K.fx = 0.46 + k * 0.6; K.fy = -0.9 - Math.max(0, k) * 0.2; K.wa = lerp(0.5, -0.12, Math.max(0, k)); K.lean = k * 0.16;
        const k2 = a > 0.55 ? ease((a - 0.55) / 0.2) * (1 - ease((a - 0.8) / 0.2)) : 0;
        K.bx = -0.3 + k2 * 0.9; K.by2 = -0.88 - k2 * 0.15;
      }
    } else if (w === 'bow') {
      K.fx = 0.58; K.fy = -1.02 + sw * 0.3; K.wa = -Math.PI / 2; K.bx = 0.28; K.by2 = -1.0;
      if (a >= 0) {
        K.fy = -1.12;
        if (a < 0.5) { K.pull = ease(a / 0.5); K.bx = lerp(0.3, -0.22, K.pull); K.by2 = -1.12; }
        else { K.pull = 0; K.bx = lerp(-0.22, 0.2, ease((a - 0.5) / 0.3)); K.by2 = -1.1; K.kick = (1 - ease((a - 0.5) / 0.3)); }
      }
    } else if (w === 'staff' || w === 'wand') {
      K.fx = 0.5; K.fy = -1.0 + sw * 0.4; K.wa = w === 'staff' ? -1.48 : -1.05; K.bx = -0.3 + sw; K.by2 = -0.9;
      if (a >= 0) {
        if (a < 0.5) { const k = ease(a / 0.5); K.fx = lerp(0.5, 0.36, k); K.fy = lerp(-1.0, -1.42, k); K.wa = lerp(K.wa, -1.75, k); K.glow = k; }
        else { const k = ease((a - 0.5) / 0.22); K.fx = lerp(0.36, 0.78, k); K.fy = lerp(-1.42, -1.2, k); K.wa = lerp(-1.75, -0.85, k); K.glow = 1 - ease((a - 0.6) / 0.4); K.lean = 0.1 * k * (1 - ease((a - 0.8) / 0.2)); }
      }
    } else if (w === 'orbs') {
      K.fx = 0.48 - sw; K.fy = -0.98; K.bx = -0.34 + sw; K.by2 = -0.94;
      if (a >= 0) {
        if (a < 0.5) { const k = ease(a / 0.5); K.fx = lerp(0.48, 0.2, k); K.fy = lerp(-0.98, -1.3, k); K.glow = k; }
        else { const k = ease((a - 0.5) / 0.2); K.fx = lerp(0.2, 0.92, k); K.fy = lerp(-1.3, -1.18, k); K.glow = 1 - ease((a - 0.6) / 0.4); K.lean = 0.12 * k * (1 - ease((a - 0.8) / 0.2)); }
      }
    } else if (w === 'rifle') {
      K.fx = 0.62; K.fy = -1.04 + sw * 0.2; K.wa = -0.06; K.bx = 0.12; K.by2 = -0.98;
      if (a >= 0) { K.fy = -1.14; K.by2 = -1.08; K.wa = -0.02; if (a >= 0.5) { K.kick = 1 - ease((a - 0.5) / 0.35); K.fx -= K.kick * 0.14; K.bx -= K.kick * 0.14; K.wa -= K.kick * 0.12; } }
    }
    if (P.cast >= 0) {
      const k = Math.sin(Math.min(1, P.cast) * Math.PI);
      K.fx = lerp(K.fx, 0.55, k); K.fy = lerp(K.fy, -1.75, k); K.glow = Math.max(K.glow, k);
      if (w !== 'rifle' && w !== 'bow') K.wa = lerp(K.wa, -1.35, k);
      K.bx = lerp(K.bx, -0.5, k); K.by2 = lerp(K.by2, -1.5, k);
    }
    return K;
  }

  /* ---------- 무기 ---------- */
  function drawWeapon(ctx, c, K, P, tc, id) {
    const w = c.weapon;
    ctx.save(); ctx.translate(K.fx, K.fy + K.by);
    if (w === 'sword') {
      ctx.rotate(K.wa);
      X.poly(ctx, [0.12, -0.085, 1.28, -0.085, 1.5, 0, 1.28, 0.085, 0.12, 0.085]); fs(ctx, '#e8eef8');
      X.line(ctx, 0.2, 0, 1.3, 0, '#aab6cc', 0.035);
      X.rr(ctx, 0.04, -0.26, 0.12, 0.52, 0.04); fs(ctx, '#e0b84a');
      X.rr(ctx, -0.26, -0.065, 0.32, 0.13, 0.05); fs(ctx, '#6b4a2e');
    } else if (w === 'axe') {
      ctx.rotate(K.wa);
      X.rr(ctx, -0.55, -0.07, 2.3, 0.14, 0.05); fs(ctx, '#7a5636');
      X.poly(ctx, [1.3, -0.07, 1.42, -0.72, 1.98, -0.52, 1.9, -0.07]); fs(ctx, '#cfd6e2');
      X.poly(ctx, [1.3, 0.07, 1.42, 0.72, 1.98, 0.52, 1.9, 0.07]); fs(ctx, '#aeb7c6');
      X.line(ctx, 1.5, -0.6, 1.92, -0.45, '#ffffff', 0.05);
      X.circle(ctx, 1.6, 0, 0.13); fs(ctx, tc);
    } else if (w === 'dagger') {
      ctx.rotate(K.wa);
      X.poly(ctx, [0.1, -0.075, 0.68, -0.06, 0.86, 0, 0.68, 0.06, 0.1, 0.075]); fs(ctx, '#d9d2f5');
      X.rr(ctx, 0.02, -0.16, 0.09, 0.32, 0.03); fs(ctx, '#8d6bff');
    } else if (w === 'bow') {
      ctx.rotate(K.kick * -0.12);
      const pull = K.pull * 0.5;
      ctx.beginPath(); ctx.moveTo(-0.02, -0.92); ctx.quadraticCurveTo(0.5, 0, -0.02, 0.92);
      ctx.strokeStyle = OUT; ctx.lineWidth = 0.13 + LW * 2; ctx.stroke(); ctx.strokeStyle = '#9a6a3a'; ctx.lineWidth = 0.13; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.02, -0.92); ctx.lineTo(-0.02 - pull, 0); ctx.lineTo(-0.02, 0.92); ctx.strokeStyle = '#f4f0e0'; ctx.lineWidth = 0.035; ctx.stroke();
      if (K.pull > 0.05) {
        X.line(ctx, -0.02 - pull, 0, 0.72 - pull, 0, '#f2e6c0', 0.06);
        X.poly(ctx, [0.72 - pull, -0.1, 0.95 - pull, 0, 0.72 - pull, 0.1]); fs(ctx, '#dfe6f0');
      }
    } else if (w === 'staff') {
      ctx.rotate(K.wa);
      X.rr(ctx, -1.0, -0.06, 2.1, 0.12, 0.05); fs(ctx, '#6b4a2e');
      X.poly(ctx, [1.02, -0.2, 1.3, -0.34, 1.22, 0, 1.3, 0.34, 1.02, 0.2]); fs(ctx, '#e0b84a');
      X.circle(ctx, 1.42, 0, 0.26 + K.glow * 0.06); fs(ctx, '#ff8a3c');
      X.circle(ctx, 1.36, -0.06, 0.11); ctx.fillStyle = '#ffe9b0'; ctx.fill();
      X.glowAdd(ctx, 1.42, 0, 0.75 + K.glow * 0.7, '#ff8a3c', 0.5 + K.glow * 0.5);
    } else if (w === 'wand') {
      ctx.rotate(K.wa);
      X.rr(ctx, -0.25, -0.045, 1.0, 0.09, 0.04); fs(ctx, '#f0c24a');
      ctx.save(); ctx.translate(0.92, 0); ctx.rotate(P.t * 1.5);
      const st = []; for (let i = 0; i < 8; i++) { const r = i % 2 ? 0.12 : 0.3, a = i / 8 * TAU; st.push(Math.cos(a) * r, Math.sin(a) * r); }
      X.poly(ctx, st); fs(ctx, '#fff3a8'); ctx.restore();
      X.glowAdd(ctx, 0.92, 0, 0.6 + K.glow * 0.7, '#ffe680', 0.45 + K.glow * 0.5);
    } else if (w === 'orbs') {
      const o1x = 0.28 + Math.cos(P.t * 3) * 0.06, o1y = -0.18 + Math.sin(P.t * 3) * 0.08;
      X.circle(ctx, o1x, o1y, 0.2 + K.glow * 0.08); fs(ctx, '#7fe4ff');
      X.circle(ctx, o1x - 0.05, o1y - 0.06, 0.07); ctx.fillStyle = '#ffffff'; ctx.fill();
      X.glowAdd(ctx, o1x, o1y, 0.6 + K.glow * 0.8, '#4fd8ff', 0.5 + K.glow * 0.5);
    } else if (w === 'rifle') {
      ctx.rotate(K.wa);
      X.poly(ctx, [-0.85, -0.02, -0.4, -0.1, -0.4, 0.1, -0.8, 0.26]); fs(ctx, '#6b4526');
      X.rr(ctx, -0.42, -0.1, 0.9, 0.2, 0.04); fs(ctx, '#7a5636');
      X.rr(ctx, 0.4, -0.065, 1.25, 0.13, 0.03); fs(ctx, '#5b6170');
      X.rr(ctx, 0.0, -0.22, 0.42, 0.1, 0.04); fs(ctx, '#3a3f4d');
      X.rr(ctx, 1.5, -0.085, 0.18, 0.17, 0.03); fs(ctx, tc);
      if (K.kick > 0.55) { X.glowAdd(ctx, 1.85, 0, 0.9 * K.kick, '#ffd27a', 0.9); X.poly(ctx, [1.68, -0.1, 2.2, 0, 1.68, 0.1]); ctx.fillStyle = '#fff3c4'; ctx.fill(); }
    }
    ctx.restore();
  }

  /* ---------- 머리 장식 ---------- */
  function drawHead(ctx, c, id, hx, hy, P, tc, tcd, K) {
    const sway = K.mv ? K.s * 0.08 : Math.sin(P.t * 1.6) * 0.03;
    // 뒤쪽 머리카락/장식 (얼굴보다 먼저)
    if (id === 'serin') {
      ctx.beginPath(); ctx.moveTo(hx + 0.1, hy - 0.52); ctx.quadraticCurveTo(hx - 0.75, hy - 0.5, hx - 0.62 + sway, hy + 0.5);
      ctx.quadraticCurveTo(hx - 0.7 + sway * 2, hy + 1.1, hx - 0.38 + sway * 2, hy + 1.35); ctx.quadraticCurveTo(hx - 0.1, hy + 0.7, hx - 0.05, hy + 0.2); ctx.closePath(); fs(ctx, c.hair);
    } else if (id === 'tara') {
      ctx.beginPath(); ctx.moveTo(hx - 0.3, hy + 0.1); ctx.quadraticCurveTo(hx - 0.9 + sway, hy + 0.3, hx - 0.75 + sway * 2, hy + 0.95); ctx.quadraticCurveTo(hx - 0.45 + sway, hy + 0.6, hx - 0.2, hy + 0.35); ctx.closePath(); fs(ctx, c.hair);
    } else if (id === 'kaz') {
      X.poly(ctx, [hx - 0.35, hy - 0.2, hx - 1.15 + sway * 2, hy - 0.05 + sway, hx - 0.95 + sway * 2, hy + 0.12, hx - 0.4, hy + 0.05]); fs(ctx, tc);
      X.poly(ctx, [hx - 0.35, hy - 0.05, hx - 1.0 + sway * 2, hy + 0.32 - sway, hx - 0.82 + sway * 2, hy + 0.44, hx - 0.38, hy + 0.14]); fs(ctx, tcd);
    } else if (id === 'sola') {
      X.circle(ctx, hx - 0.3, hy + 0.12, 0.3); fs(ctx, c.hair);
    }
    // 얼굴
    X.circle(ctx, hx, hy, 0.5); fs(ctx, c.skin);
    const blink = ((P.t * 0.37 + (id.charCodeAt(0) % 7) * 0.13) % 1) > 0.965;
    const ey = hy - 0.02, ry = blink ? 0.015 : 0.09;
    ctx.fillStyle = OUT;
    if (P.stun) {
      ctx.lineWidth = 0.05; ctx.strokeStyle = OUT;
      for (const ex of [hx + 0.14, hx + 0.36]) { X.line(ctx, ex - 0.07, ey - 0.07, ex + 0.07, ey + 0.07, OUT, 0.05); X.line(ctx, ex - 0.07, ey + 0.07, ex + 0.07, ey - 0.07, OUT, 0.05); }
    } else {
      X.ell(ctx, hx + 0.13, ey, 0.055, ry); ctx.fill();
      X.ell(ctx, hx + 0.36, ey, 0.05, ry); ctx.fill();
    }
    if (id === 'gaon') {
      ctx.beginPath(); ctx.arc(hx, hy, 0.55, Math.PI * 0.9, Math.PI * 2.03);
      ctx.lineTo(hx + 0.56, hy + 0.14); ctx.lineTo(hx + 0.3, hy + 0.14); ctx.lineTo(hx + 0.3, hy - 0.16); ctx.lineTo(hx - 0.02, hy - 0.16);
      ctx.lineTo(hx - 0.02, hy + 0.52); ctx.lineTo(hx - 0.45, hy + 0.42); ctx.closePath(); fs(ctx, '#c9d2e3');
      X.line(ctx, hx - 0.02, hy - 0.16, hx + 0.52, hy - 0.16, '#8794ad', 0.05);
      ctx.beginPath(); ctx.moveTo(hx - 0.05, hy - 0.52); ctx.quadraticCurveTo(hx - 0.2, hy - 1.05, hx - 0.75 + sway, hy - 0.8);
      ctx.quadraticCurveTo(hx - 1.0 + sway * 2, hy - 0.45, hx - 0.85 + sway * 2, hy - 0.05); ctx.quadraticCurveTo(hx - 0.6, hy - 0.45, hx - 0.28, hy - 0.5); ctx.closePath(); fs(ctx, tc);
    } else if (id === 'lira') {
      ctx.beginPath(); ctx.arc(hx, hy, 0.56, Math.PI * 0.62, Math.PI * 1.82);
      ctx.quadraticCurveTo(hx + 0.2, hy - 0.42, hx + 0.02, hy - 0.2); ctx.quadraticCurveTo(hx - 0.2, hy + 0.1, hx - 0.12, hy + 0.5); ctx.closePath(); fs(ctx, c.body);
      X.poly(ctx, [hx - 0.5, hy - 0.2, hx - 0.92 + sway, hy + 0.05, hx - 0.5, hy + 0.2]); fs(ctx, c.dark);
      ctx.beginPath(); ctx.moveTo(hx + 0.05, hy - 0.36); ctx.quadraticCurveTo(hx + 0.4, hy - 0.42, hx + 0.48, hy - 0.12); ctx.quadraticCurveTo(hx + 0.28, hy - 0.26, hx + 0.02, hy - 0.2); ctx.closePath(); fs(ctx, c.hair);
    } else if (id === 'sola') {
      ctx.beginPath(); ctx.moveTo(hx + 0.06, hy - 0.36); ctx.quadraticCurveTo(hx + 0.42, hy - 0.4, hx + 0.5, hy - 0.08); ctx.quadraticCurveTo(hx + 0.26, hy - 0.26, hx - 0.05, hy - 0.2); ctx.closePath(); fs(ctx, c.hair);
      X.ell(ctx, hx - 0.02, hy - 0.36, 0.95, 0.2, -0.1); fs(ctx, '#b73a24');
      ctx.beginPath(); ctx.moveTo(hx - 0.5, hy - 0.42); ctx.quadraticCurveTo(hx - 0.3, hy - 1.15, hx - 0.62 + sway, hy - 1.45);
      ctx.quadraticCurveTo(hx + 0.1, hy - 1.2, hx + 0.46, hy - 0.46); ctx.closePath(); fs(ctx, '#c9432a');
      ctx.beginPath(); ctx.moveTo(hx - 0.5, hy - 0.44); ctx.quadraticCurveTo(hx, hy - 0.28, hx + 0.46, hy - 0.47); ctx.lineTo(hx + 0.4, hy - 0.62); ctx.quadraticCurveTo(hx, hy - 0.45, hx - 0.46, hy - 0.6); ctx.closePath(); fs(ctx, tc);
    } else if (id === 'kaz') {
      ctx.beginPath(); ctx.arc(hx, hy, 0.53, Math.PI * 0.75, Math.PI * 1.9); ctx.lineTo(hx + 0.3, hy - 0.28); ctx.lineTo(hx + 0.08, hy - 0.2); ctx.lineTo(hx - 0.2, hy - 0.05); ctx.closePath(); fs(ctx, c.hair);
      X.poly(ctx, [hx - 0.3, hy - 0.5, hx - 0.52, hy - 0.86, hx - 0.05, hy - 0.56]); fs(ctx, c.hair);
      ctx.beginPath(); ctx.arc(hx, hy, 0.5, Math.PI * 0.05, Math.PI * 0.8); ctx.lineTo(hx - 0.2, hy + 0.12); ctx.lineTo(hx + 0.5, hy + 0.1); ctx.closePath(); fs(ctx, '#1b1830');
      X.rr(ctx, hx - 0.38, hy - 0.26, 0.9, 0.12, 0.04); fs(ctx, tc);
    } else if (id === 'brom') {
      ctx.beginPath(); ctx.moveTo(hx - 0.4, hy + 0.14); ctx.quadraticCurveTo(hx - 0.28, hy + 0.92, hx + 0.16, hy + 1.02);
      ctx.quadraticCurveTo(hx + 0.6, hy + 0.84, hx + 0.52, hy + 0.12); ctx.quadraticCurveTo(hx + 0.24, hy + 0.36, hx - 0.4, hy + 0.14); ctx.closePath(); fs(ctx, c.hair);
      ctx.beginPath(); ctx.arc(hx, hy, 0.55, Math.PI * 1.0, Math.PI * 2.0); ctx.lineTo(hx + 0.55, hy - 0.1); ctx.lineTo(hx - 0.55, hy - 0.1); ctx.closePath(); fs(ctx, '#8f9299');
      X.rr(ctx, hx - 0.58, hy - 0.2, 1.16, 0.14, 0.05); fs(ctx, '#6d7078');
      for (const sgn of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(hx + sgn * 0.4, hy - 0.3); ctx.quadraticCurveTo(hx + sgn * 0.95, hy - 0.35, hx + sgn * 0.82, hy - 0.98);
        ctx.quadraticCurveTo(hx + sgn * 0.62, hy - 0.6, hx + sgn * 0.3, hy - 0.52); ctx.closePath(); fs(ctx, '#efe6cf');
      }
    } else if (id === 'serin') {
      ctx.beginPath(); ctx.arc(hx, hy, 0.54, Math.PI * 0.85, Math.PI * 1.95); ctx.quadraticCurveTo(hx + 0.3, hy - 0.3, hx + 0.02, hy - 0.22); ctx.quadraticCurveTo(hx - 0.3, hy - 0.1, hx - 0.4, hy + 0.35); ctx.closePath(); fs(ctx, c.hair);
      X.circle(ctx, hx + 0.02, hy - 0.42, 0.08); fs(ctx, '#f0c24a');
      const hb = Math.sin(P.t * 2) * 0.03;
      ctx.beginPath(); ctx.ellipse(hx, hy - 0.86 + hb, 0.44, 0.13, 0, 0, TAU); ctx.strokeStyle = OUT; ctx.lineWidth = 0.17; ctx.stroke(); ctx.strokeStyle = '#ffe680'; ctx.lineWidth = 0.09; ctx.stroke();
      X.glowAdd(ctx, hx, hy - 0.86 + hb, 0.7, '#ffe680', 0.35);
    } else if (id === 'volt') {
      const sp = [[-0.5, -0.2, -0.95, -0.5], [-0.42, -0.36, -0.7, -0.98], [-0.14, -0.5, -0.2, -1.12], [0.14, -0.5, 0.32, -1.02], [0.36, -0.38, 0.72, -0.72]];
      for (const q of sp) { X.poly(ctx, [hx + q[0] - 0.14, hy + q[1] + 0.12, hx + q[2], hy + q[3], hx + q[0] + 0.2, hy + q[1] + 0.06]); fs(ctx, c.hair); }
      ctx.beginPath(); ctx.arc(hx, hy, 0.52, Math.PI * 1.0, Math.PI * 1.95); ctx.quadraticCurveTo(hx + 0.1, hy - 0.3, hx - 0.5, hy - 0.02); ctx.closePath(); fs(ctx, c.hair);
      X.rr(ctx, hx - 0.46, hy - 0.38, 0.98, 0.14, 0.05); fs(ctx, '#3a3f4d');
      X.circle(ctx, hx + 0.14, hy - 0.32, 0.13); fs(ctx, '#4fd8ff'); X.circle(ctx, hx + 0.4, hy - 0.32, 0.11); fs(ctx, '#4fd8ff');
    } else if (id === 'tara') {
      ctx.beginPath(); ctx.arc(hx, hy, 0.53, Math.PI * 0.9, Math.PI * 1.9); ctx.quadraticCurveTo(hx + 0.2, hy - 0.26, hx - 0.08, hy - 0.18); ctx.quadraticCurveTo(hx - 0.3, hy, hx - 0.45, hy + 0.25); ctx.closePath(); fs(ctx, c.hair);
      X.ell(ctx, hx + 0.02, hy - 0.34, 1.0, 0.2, -0.06); fs(ctx, '#6b4526');
      ctx.beginPath(); ctx.moveTo(hx - 0.46, hy - 0.4); ctx.quadraticCurveTo(hx - 0.42, hy - 0.98, hx, hy - 0.94); ctx.quadraticCurveTo(hx + 0.44, hy - 0.98, hx + 0.48, hy - 0.42); ctx.closePath(); fs(ctx, '#7d5230');
      ctx.beginPath(); ctx.moveTo(hx - 0.46, hy - 0.42); ctx.quadraticCurveTo(hx, hy - 0.3, hx + 0.48, hy - 0.44); ctx.lineTo(hx + 0.47, hy - 0.56); ctx.quadraticCurveTo(hx, hy - 0.44, hx - 0.47, hy - 0.54); ctx.closePath(); fs(ctx, '#e8d2a0');
    }
  }

  /* ---------- 영웅 본체 ---------- */
  A.hero = function (ctx, id, team, P) {
    const c = CFG[id];
    const tc = C.TEAM_COLORS[team], tcd = C.TEAM_DARK[team], tcl = C.TEAM_LIGHT[team];
    const K = pose(c, P);
    const B = c.bulk, T = c.tall || 1, by = K.by;
    const sh = -1.42 * T + by, hx = 0.06, hy = -1.98 * T + by;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (K.lean) ctx.rotate(K.lean);
    const sway = K.mv ? K.s * 0.12 : Math.sin(P.t * 1.5) * 0.04;
    // 망토
    if (id === 'gaon' || id === 'volt' || id === 'lira') {
      const col = id === 'lira' ? c.dark : tc, len = id === 'lira' ? -0.55 : -0.2;
      ctx.beginPath(); ctx.moveTo(-0.34 * B, sh + 0.02); ctx.lineTo(0.1, sh);
      ctx.quadraticCurveTo(-0.2, sh + 0.7, -0.5 - sway, len + by); ctx.lineTo(-0.95 - sway * 1.6, len - 0.08 + by);
      ctx.quadraticCurveTo(-0.72, sh + 0.6, -0.34 * B, sh + 0.02); ctx.closePath(); fs(ctx, col);
    }
    // 등 뒤 화살통
    if (id === 'lira') { ctx.save(); ctx.translate(-0.36, sh + 0.42); ctx.rotate(-0.5); X.rr(ctx, -0.13, -0.5, 0.26, 0.8, 0.06); fs(ctx, '#7a5636'); X.line(ctx, -0.05, -0.5, -0.08, -0.72, '#f2e6c0', 0.05); X.line(ctx, 0.06, -0.5, 0.09, -0.7, '#f2e6c0', 0.05); ctx.restore(); }
    // 뒤쪽 팔
    limb(ctx, -0.14 * B, sh + 0.1, K.bx, K.by2 + by, 0.25, X.shade(c.sleeve, -0.18));
    X.circle(ctx, K.bx, K.by2 + by, 0.13); fs(ctx, X.shade(c.skin, -0.1));
    if (c.weapon === 'dagger') {
      ctx.save(); ctx.translate(K.bx, K.by2 + by); ctx.rotate(0.35);
      X.poly(ctx, [0.1, -0.07, 0.62, -0.055, 0.78, 0, 0.62, 0.055, 0.1, 0.07]); fs(ctx, '#bdb5e0'); ctx.restore();
    }
    if (c.weapon === 'orbs') {
      const ox = -0.55 + Math.cos(P.t * 2.2) * 0.12, oy = sh - 0.1 + Math.sin(P.t * 2.6) * 0.12;
      X.circle(ctx, ox, oy, 0.17); fs(ctx, '#7fe4ff'); X.glowAdd(ctx, ox, oy, 0.5, '#4fd8ff', 0.45);
    }
    // 다리
    if (!c.robe) {
      const sw = K.mv * 0.28;
      const legs = [[-0.17 * B, -K.s * sw, Math.max(0, -K.cs) * 0.15 * K.mv, X.shade(c.legs, -0.15)], [0.17 * B, K.s * sw, Math.max(0, K.cs) * 0.15 * K.mv, c.legs]];
      for (const L of legs) {
        limb(ctx, L[0], -0.62 + by, L[0] + L[1], -0.16 - L[2], 0.29, L[3]);
        X.ell(ctx, L[0] + L[1] + 0.07, -0.09 - L[2], 0.23, 0.13); fs(ctx, c.boots);
      }
    }
    // 몸통
    if (c.robe) {
      ctx.beginPath(); ctx.moveTo(-0.4 * B, sh - 0.04); ctx.lineTo(0.4 * B, sh - 0.04);
      ctx.quadraticCurveTo(0.5, -0.8, 0.66 + sway * 0.5, -0.03); ctx.lineTo(-0.66 + sway * 0.5, -0.03); ctx.quadraticCurveTo(-0.5, -0.8, -0.4 * B, sh - 0.04); ctx.closePath(); fs(ctx, c.body);
      ctx.beginPath(); ctx.moveTo(-0.6 + sway * 0.5, -0.24); ctx.quadraticCurveTo(0, -0.12, 0.6 + sway * 0.5, -0.24); ctx.lineTo(0.66 + sway * 0.5, -0.03); ctx.lineTo(-0.66 + sway * 0.5, -0.03); ctx.closePath(); fs(ctx, id === 'sola' ? '#ffd76a' : '#f0c24a');
      X.poly(ctx, [-0.12, sh, 0.2, sh, 0.3, -0.26, -0.02, -0.26]); fs(ctx, id === 'sola' ? tc : tc);
      const fy = -0.07, st = K.mv * K.s * 0.14;
      X.ell(ctx, 0.22 + st, fy, 0.2, 0.1); fs(ctx, c.boots); X.ell(ctx, -0.2 - st, fy, 0.2, 0.1); fs(ctx, c.boots);
    } else {
      X.rr(ctx, -0.45 * B, sh - 0.06, 0.9 * B, 0.94 * T, 0.24); fs(ctx, c.body);
      // 음영
      ctx.beginPath(); ctx.moveTo(-0.45 * B + 0.04, sh + 0.3); ctx.quadraticCurveTo(-0.1, sh + 0.75, 0.45 * B - 0.04, sh + 0.62);
      ctx.lineTo(0.45 * B - 0.05, sh + 0.82 * T); ctx.lineTo(-0.45 * B + 0.05, sh + 0.82 * T); ctx.closePath(); ctx.fillStyle = X.rgba(c.dark, 0.75); ctx.fill();
      X.rr(ctx, -0.46 * B, sh + 0.68 * T, 0.92 * B, 0.15, 0.05); fs(ctx, id === 'brom' ? '#6b4a2e' : X.shade(c.dark, -0.2));
      if (id === 'gaon') { X.poly(ctx, [-0.18, sh + 0.06, 0.26, sh + 0.06, 0.2, sh + 0.66, 0.04, sh + 0.78, -0.12, sh + 0.66]); fs(ctx, tc); X.circle(ctx, 0.04, sh + 0.36, 0.1); fs(ctx, '#ffe08a'); }
      else if (id === 'brom') {
        X.line(ctx, -0.4 * B, sh + 0.02, 0.35 * B, sh + 0.66 * T, '#6b4a2e', 0.13);
        ctx.beginPath(); ctx.moveTo(-0.5 * B, sh - 0.1); ctx.quadraticCurveTo(-0.1, sh - 0.34, 0.5 * B, sh - 0.1); ctx.quadraticCurveTo(0.4, sh + 0.26, 0.05, sh + 0.14); ctx.quadraticCurveTo(-0.3, sh + 0.3, -0.5 * B, sh - 0.1); ctx.closePath(); fs(ctx, '#8b6b4a');
        X.poly(ctx, [-0.2, sh + 0.82 * T, 0.3, sh + 0.82 * T, 0.2, sh + 1.3, -0.1, sh + 1.3]); fs(ctx, tc);
      } else if (id === 'kaz') { X.poly(ctx, [-0.3, sh + 0.0, 0.34, sh + 0.0, 0.1, sh + 0.34]); fs(ctx, '#4c4585'); X.line(ctx, -0.3, sh + 0.5, 0.36, sh + 0.34, '#8d6bff', 0.07); }
      else if (id === 'volt') { X.poly(ctx, [0.0, sh - 0.02, 0.2, sh - 0.02, 0.06, sh + 0.34, 0.24, sh + 0.3, -0.04, sh + 0.76, 0.02, sh + 0.42, -0.14, sh + 0.46]); fs(ctx, '#ffd84a'); }
      else if (id === 'tara') { X.line(ctx, 0.08, sh, 0.08, sh + 0.66, X.shade(c.dark, -0.15), 0.06); X.line(ctx, -0.36, sh + 0.02, 0.38, sh + 0.62, '#5a3d22', 0.11); }
      else if (id === 'lira') { X.line(ctx, -0.36, sh + 0.04, 0.34, sh + 0.6, '#7a5636', 0.1); }
    }
    // 목도리·스카프 (팀 색)
    if (id === 'lira' || id === 'tara' || id === 'kaz' || id === 'volt') {
      X.rr(ctx, -0.36, sh - 0.14, 0.78, 0.25, 0.11); fs(ctx, tc);
      if (id !== 'volt') { X.poly(ctx, [-0.3, sh - 0.04, -0.8 - sway * 1.6, sh + 0.3 + sway, -0.62 - sway * 1.6, sh + 0.48, -0.2, sh + 0.1]); fs(ctx, tcd); }
    }
    if (id === 'serin') { X.poly(ctx, [-0.42, sh - 0.06, -0.2, sh - 0.06, -0.16, sh + 0.9, -0.42, sh + 0.9]); fs(ctx, tc); X.poly(ctx, [0.24, sh - 0.06, 0.42, sh - 0.06, 0.46, sh + 0.9, 0.3, sh + 0.9]); fs(ctx, tc); }
    // 방패 (가온)
    if (id === 'gaon') {
      const sx = 0.36, sy = -0.88 + by;
      ctx.beginPath(); ctx.moveTo(sx - 0.42, sy - 0.5); ctx.lineTo(sx + 0.42, sy - 0.5); ctx.lineTo(sx + 0.42, sy + 0.05); ctx.quadraticCurveTo(sx + 0.38, sy + 0.52, sx, sy + 0.68); ctx.quadraticCurveTo(sx - 0.38, sy + 0.52, sx - 0.42, sy + 0.05); ctx.closePath(); fs(ctx, '#dfe6f2');
      ctx.beginPath(); ctx.moveTo(sx - 0.28, sy - 0.36); ctx.lineTo(sx + 0.28, sy - 0.36); ctx.lineTo(sx + 0.28, sy + 0.03); ctx.quadraticCurveTo(sx + 0.24, sy + 0.38, sx, sy + 0.5); ctx.quadraticCurveTo(sx - 0.24, sy + 0.38, sx - 0.28, sy + 0.03); ctx.closePath(); ctx.fillStyle = tc; ctx.fill();
      X.circle(ctx, sx, sy - 0.02, 0.12); ctx.fillStyle = '#ffe08a'; ctx.fill();
    }
    // 머리
    drawHead(ctx, c, id, hx, hy, P, tc, tcd, K);
    // 앞쪽 팔 + 무기
    if (c.weapon === 'bow' || c.weapon === 'rifle') { drawWeapon(ctx, c, K, P, tc, id); limb(ctx, 0.18 * B, sh + 0.1, K.fx, K.fy + by, 0.26, c.sleeve); }
    else { limb(ctx, 0.18 * B, sh + 0.1, K.fx, K.fy + by, 0.26, c.sleeve); drawWeapon(ctx, c, K, P, tc, id); }
    X.circle(ctx, K.fx, K.fy + by, 0.14); fs(ctx, c.skin);
    if (id === 'gaon') { X.circle(ctx, 0.2 * B, sh + 0.06, 0.24); fs(ctx, '#dfe6f2'); }
  };
  A.heroHeight = (id) => 2.6 * ((CFG[id] && CFG[id].tall) || 1) + (id === 'sola' ? 0.7 : id === 'serin' ? 0.45 : id === 'brom' ? 0.35 : 0.2);

  /* ---------- 미니언 ---------- */
  A.minion = function (ctx, kind, team, P) {
    const tc = C.TEAM_COLORS[team], tcd = C.TEAM_DARK[team], tcl = C.TEAM_LIGHT[team];
    const mv = P.moving ? 1 : 0, s = Math.sin(P.walk), cs = Math.cos(P.walk);
    const hop = mv ? -Math.abs(cs) * 0.1 : Math.sin(P.t * 3 + P.walk) * 0.02;
    const a = P.atk;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (kind === 'melee' || kind === 'super') {
      const big = kind === 'super';
      const k = a < 0 ? 0 : a < 0.45 ? -ease(a / 0.45) : ease((a - 0.45) / 0.2) * (1 - ease((a - 0.7) / 0.3)) * 1.3 - (1 - ease((a - 0.45) / 0.2));
      if (big) ctx.scale(1.75, 1.75);
      ctx.translate(Math.max(0, k) * 0.18, hop);
      X.ell(ctx, -0.16 - s * 0.12 * mv, -0.07, 0.17, 0.1); fs(ctx, OUT); X.ell(ctx, 0.2 + s * 0.12 * mv, -0.07, 0.17, 0.1); fs(ctx, OUT);
      X.ell(ctx, 0, -0.58, 0.47, 0.52); fs(ctx, tc);
      ctx.beginPath(); ctx.ellipse(0, -0.5, 0.42, 0.42, 0, 0.15, Math.PI - 0.15); ctx.fillStyle = X.rgba(tcd, 0.55); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -0.72, 0.47, Math.PI, TAU); ctx.lineTo(0.5, -0.66); ctx.lineTo(-0.5, -0.66); ctx.closePath(); fs(ctx, big ? '#e0b84a' : '#c9d2e3');
      if (big) { X.poly(ctx, [-0.3, -1.05, -0.5, -1.5, -0.12, -1.14]); fs(ctx, '#efe6cf'); X.poly(ctx, [0.3, -1.05, 0.5, -1.5, 0.12, -1.14]); fs(ctx, '#efe6cf'); }
      else { X.poly(ctx, [-0.08, -1.18, 0, -1.42, 0.08, -1.18]); fs(ctx, tcl); }
      ctx.fillStyle = '#ffffff'; X.ell(ctx, 0.14, -0.56, 0.085, 0.11); ctx.fill(); X.ell(ctx, 0.35, -0.56, 0.07, 0.1); ctx.fill();
      ctx.fillStyle = big ? '#ff5a3c' : OUT; X.circle(ctx, 0.17, -0.55, 0.045); ctx.fill(); X.circle(ctx, 0.37, -0.55, 0.04); ctx.fill();
      ctx.save(); ctx.translate(0.44, -0.5); ctx.rotate(-1.0 + k * 1.5);
      X.poly(ctx, [0.05, -0.06, 0.62, -0.06, 0.78, 0, 0.62, 0.06, 0.05, 0.06]); fs(ctx, '#e8eef8'); X.rr(ctx, -0.02, -0.14, 0.08, 0.28, 0.03); fs(ctx, '#6b4a2e'); ctx.restore();
      X.circle(ctx, -0.34, -0.46, 0.24); fs(ctx, X.shade(tc, -0.3)); X.circle(ctx, -0.34, -0.46, 0.09); ctx.fillStyle = tcl; ctx.fill();
    } else if (kind === 'ranged') {
      const k = a < 0 ? 0 : a < 0.5 ? ease(a / 0.5) : 1 - ease((a - 0.5) / 0.4);
      ctx.translate(0, hop);
      X.ell(ctx, -0.14 - s * 0.1 * mv, -0.06, 0.15, 0.09); fs(ctx, OUT); X.ell(ctx, 0.16 + s * 0.1 * mv, -0.06, 0.15, 0.09); fs(ctx, OUT);
      ctx.beginPath(); ctx.moveTo(0, -1.3); ctx.quadraticCurveTo(0.52, -0.9, 0.46, -0.1); ctx.lineTo(-0.46, -0.1); ctx.quadraticCurveTo(-0.52, -0.9, 0, -1.3); ctx.closePath(); fs(ctx, tcd);
      ctx.beginPath(); ctx.moveTo(0, -1.3); ctx.quadraticCurveTo(-0.5, -1.2, -0.62, -0.9); ctx.quadraticCurveTo(-0.3, -0.98, 0, -1.3); ctx.closePath(); fs(ctx, tcd);
      X.ell(ctx, 0.1, -0.8, 0.27, 0.25); fs(ctx, '#151829');
      ctx.fillStyle = tcl; X.circle(ctx, 0.05, -0.8, 0.05); ctx.fill(); X.circle(ctx, 0.23, -0.8, 0.045); ctx.fill();
      X.line(ctx, -0.42, -0.4, 0.42, -0.5, tc, 0.09);
      ctx.save(); ctx.translate(0.5 + k * 0.12, -0.55); ctx.rotate(-1.35 + k * 0.4);
      X.rr(ctx, -0.35, -0.04, 1.0, 0.08, 0.03); fs(ctx, '#7a5636'); X.circle(ctx, 0.72, 0, 0.15 + k * 0.05); fs(ctx, tcl);
      X.glowAdd(ctx, 0.72, 0, 0.42 + k * 0.4, tc, 0.5 + k * 0.4); ctx.restore();
    } else { // siege
      const k = a < 0 ? 0 : a < 0.5 ? 0 : 1 - ease((a - 0.5) / 0.4);
      ctx.translate(-k * 0.16, 0);
      const wr = P.walk * 1.2;
      X.rr(ctx, -0.95, -0.82, 1.7, 0.56, 0.12); fs(ctx, '#7a5636');
      X.rr(ctx, -0.95, -0.82, 1.7, 0.18, 0.08); fs(ctx, '#95704a');
      X.rr(ctx, -0.7, -1.02, 0.5, 0.26, 0.08); fs(ctx, tc);
      ctx.save(); ctx.translate(0.1, -0.92); ctx.rotate(-0.32);
      X.rr(ctx, -0.25, -0.2, 1.35, 0.4, 0.1); fs(ctx, '#5b6170'); X.rr(ctx, 0.95, -0.25, 0.22, 0.5, 0.08); fs(ctx, '#3a3f4d');
      X.rr(ctx, 0.2, -0.22, 0.2, 0.44, 0.04); fs(ctx, tc);
      if (k > 0.5) { X.glowAdd(ctx, 1.4, 0, 1.0 * k, '#ffd27a', 0.9); }
      ctx.restore();
      for (const wx of [-0.55, 0.45]) {
        X.circle(ctx, wx, -0.3, 0.32); fs(ctx, '#4a3626'); X.circle(ctx, wx, -0.3, 0.11); fs(ctx, '#c9a26a');
        for (let i = 0; i < 4; i++) { const an = wr + i * Math.PI / 2; X.line(ctx, wx + Math.cos(an) * 0.11, -0.3 + Math.sin(an) * 0.11, wx + Math.cos(an) * 0.28, -0.3 + Math.sin(an) * 0.28, '#c9a26a', 0.05); }
      }
      X.line(ctx, -0.85, -1.0, -0.85, -1.7, OUT, 0.07); X.poly(ctx, [-0.85, -1.7, -0.3, -1.55, -0.85, -1.36]); fs(ctx, tc);
    }
  };
  A.minionHeight = (kind) => (kind === 'super' ? 2.7 : kind === 'siege' ? 1.9 : 1.6);

  /* ---------- 구조물 ---------- */
  A.tower = function (ctx, team, P) {
    const tc = C.TEAM_COLORS[team], tcd = C.TEAM_DARK[team], tcl = C.TEAM_LIGHT[team];
    const tier2 = P.tier === 2;
    ctx.lineJoin = 'round';
    X.ell(ctx, 0, 0.1, 2.5, 1.15); fs(ctx, '#6d7385');
    X.ell(ctx, 0, -0.12, 2.15, 0.95); fs(ctx, '#8a90a3');
    // 몸체
    ctx.beginPath(); ctx.moveTo(-1.5, -0.25); ctx.lineTo(-1.12, -4.3); ctx.lineTo(1.12, -4.3); ctx.lineTo(1.5, -0.25); ctx.quadraticCurveTo(0, 0.45, -1.5, -0.25); ctx.closePath(); fs(ctx, '#a7adbd');
    ctx.beginPath(); ctx.moveTo(0.25, 0.12); ctx.lineTo(0.2, -4.3); ctx.lineTo(1.12, -4.3); ctx.lineTo(1.5, -0.25); ctx.quadraticCurveTo(0.9, 0.08, 0.25, 0.12); ctx.closePath(); ctx.fillStyle = 'rgba(70,76,100,0.4)'; ctx.fill();
    ctx.strokeStyle = 'rgba(60,66,90,0.55)'; ctx.lineWidth = 0.06;
    for (let i = 1; i <= 4; i++) { const y = -0.25 - i * 0.82, hw = 1.5 - i * 0.076; ctx.beginPath(); ctx.moveTo(-hw, y); ctx.quadraticCurveTo(0, y + 0.3, hw, y); ctx.stroke(); }
    for (let i = 0; i < 5; i++) { const y = -0.4 - i * 0.82, x = (i % 2 ? -0.55 : 0.35); X.line(ctx, x, y, x, y - 0.5, 'rgba(60,66,90,0.45)', 0.05); }
    // 깃발
    X.poly(ctx, [-0.62, -3.5, 0.62, -3.5, 0.62, -1.75, 0, -1.35, -0.62, -1.75]); fs(ctx, tc);
    X.poly(ctx, [0, -3.1, 0.3, -2.6, 0, -2.1, -0.3, -2.6]); ctx.fillStyle = tcl; ctx.fill();
    if (tier2) { X.line(ctx, -0.62, -3.22, 0.62, -3.22, '#ffe08a', 0.1); X.line(ctx, -0.62, -1.95, 0.62, -1.95, '#ffe08a', 0.07); }
    // 흉벽
    X.rr(ctx, -1.5, -4.95, 3.0, 0.82, 0.14); fs(ctx, '#bcc2d0');
    for (const x of [-1.5, -0.42, 0.66]) { X.rr(ctx, x, -5.45, 0.84, 0.62, 0.1); fs(ctx, '#c9cfdb'); }
    X.rr(ctx, -1.5, -4.36, 3.0, 0.22, 0.08); fs(ctx, '#8a90a3');
    // 수정
    const bob = Math.sin(P.t * 2 + P.seed) * 0.12, cy = -6.75 + bob, fl = P.flash || 0;
    X.glowAdd(ctx, 0, cy, 2.3 + fl * 1.6, tc, 0.5 + fl * 0.5);
    X.poly(ctx, [0, cy - 0.95, 0.6, cy, 0, cy + 0.95, -0.6, cy]); fs(ctx, fl > 0.3 ? '#ffffff' : tcl);
    X.poly(ctx, [0, cy - 0.95, 0.6, cy, 0, cy + 0.15]); ctx.fillStyle = X.rgba(tc, 0.7); ctx.fill();
    X.line(ctx, -0.22, cy - 0.35, -0.05, cy - 0.65, '#ffffff', 0.07);
    if (P.hpP < 0.5) { ctx.strokeStyle = 'rgba(30,32,48,0.75)'; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(-0.7, -4.3); ctx.lineTo(-0.35, -3.2); ctx.lineTo(-0.75, -2.3); ctx.lineTo(-0.4, -1.2); ctx.stroke(); }
    if (P.hpP < 0.25) { ctx.beginPath(); ctx.moveTo(0.85, -3.9); ctx.lineTo(0.5, -2.9); ctx.lineTo(0.95, -1.9); ctx.stroke(); }
  };
  A.TOWER_H = 7.9;
  A.rubble = function (ctx, team) {
    X.ell(ctx, 0, 0.1, 2.5, 1.15); fs(ctx, '#5f6577');
    const st = [[-1.2, -0.2, 0.7], [0.2, -0.45, 0.95], [1.15, -0.1, 0.6], [-0.3, 0.25, 0.55], [0.75, 0.35, 0.45]];
    for (const q of st) { X.poly(ctx, [q[0] - q[2], q[1] + 0.2, q[0] - q[2] * 0.5, q[1] - q[2] * 0.8, q[0] + q[2] * 0.6, q[1] - q[2] * 0.6, q[0] + q[2], q[1] + 0.2]); fs(ctx, '#8a90a3'); }
    X.poly(ctx, [-0.2, -0.75, 0.25, -1.3, 0.5, -0.7]); fs(ctx, X.shade(C.TEAM_COLORS[team], -0.45));
  };
  A.core = function (ctx, team, P) {
    const tc = C.TEAM_COLORS[team], tcd = C.TEAM_DARK[team], tcl = C.TEAM_LIGHT[team];
    ctx.lineJoin = 'round';
    X.ell(ctx, 0, 0.3, 4.9, 2.3); fs(ctx, '#646a7d');
    X.ell(ctx, 0, -0.1, 4.2, 1.95); fs(ctx, '#868ca0');
    X.ell(ctx, 0, -0.5, 3.3, 1.5); fs(ctx, '#a7adbd');
    ctx.beginPath(); ctx.ellipse(0, -0.5, 2.6, 1.15, 0, 0, TAU); ctx.strokeStyle = X.rgba(tc, 0.8); ctx.lineWidth = 0.14; ctx.stroke();
    // 기둥 4개
    for (const px of [-3.5, 3.5]) {
      X.rr(ctx, px - 0.42, -2.6, 0.84, 2.7, 0.14); fs(ctx, '#9aa0b2'); X.rr(ctx, px - 0.55, -2.95, 1.1, 0.5, 0.12); fs(ctx, '#bcc2d0');
      X.poly(ctx, [px, -4.1, px + 0.36, -3.5, px, -2.95, px - 0.36, -3.5]); fs(ctx, tcl); X.glowAdd(ctx, px, -3.5, 1.1, tc, 0.45);
    }
    const bob = Math.sin(P.t * 1.4) * 0.22, cy = -5.2 + bob, fl = P.flash || 0;
    // 회전 고리 (뒤)
    const ra = P.t * 0.9;
    ctx.beginPath(); ctx.ellipse(0, cy + 0.3, 2.7, 0.75, Math.sin(ra) * 0.18, Math.PI, TAU); ctx.strokeStyle = X.rgba(tcl, 0.85); ctx.lineWidth = 0.16; ctx.stroke();
    X.glowAdd(ctx, 0, cy, 5.2 + fl * 2, tc, 0.42 + fl * 0.4);
    // 거대 수정
    X.poly(ctx, [0, cy - 3.0, 1.25, cy - 1.3, 1.25, cy + 1.2, 0, cy + 2.9, -1.25, cy + 1.2, -1.25, cy - 1.3]); fs(ctx, fl > 0.3 ? '#ffffff' : tcl);
    X.poly(ctx, [0, cy - 3.0, 1.25, cy - 1.3, 1.25, cy + 1.2, 0, cy + 2.9, 0.1, cy + 0.2]); ctx.fillStyle = X.rgba(tc, 0.72); ctx.fill();
    X.poly(ctx, [0, cy - 3.0, 0.1, cy + 0.2, -1.25, cy - 1.3]); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    X.line(ctx, 0, cy - 3.0, 0.1, cy + 0.2, X.rgba(tcd, 0.6), 0.06); X.line(ctx, 0.1, cy + 0.2, 0, cy + 2.9, X.rgba(tcd, 0.6), 0.06);
    X.line(ctx, -1.25, cy - 1.3, 0.1, cy + 0.2, X.rgba(tcd, 0.45), 0.05); X.line(ctx, 1.25, cy - 1.3, 0.1, cy + 0.2, X.rgba(tcd, 0.45), 0.05);
    X.line(ctx, -0.7, cy - 1.6, -0.25, cy - 2.4, '#ffffff', 0.11);
    if (P.hpP < 0.6) { ctx.strokeStyle = 'rgba(20,22,40,0.8)'; ctx.lineWidth = 0.09; ctx.beginPath(); ctx.moveTo(-0.9, cy - 0.9); ctx.lineTo(-0.3, cy - 0.2); ctx.lineTo(-0.8, cy + 0.7); ctx.lineTo(-0.2, cy + 1.5); ctx.stroke(); }
    if (P.hpP < 0.3) { ctx.beginPath(); ctx.moveTo(0.9, cy - 1.2); ctx.lineTo(0.4, cy - 0.3); ctx.lineTo(0.95, cy + 0.6); ctx.stroke(); }
    // 회전 고리 (앞)
    ctx.beginPath(); ctx.ellipse(0, cy + 0.3, 2.7, 0.75, Math.sin(ra) * 0.18, 0, Math.PI); ctx.strokeStyle = OUT; ctx.lineWidth = 0.3; ctx.stroke(); ctx.strokeStyle = tcl; ctx.lineWidth = 0.17; ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const an = ra * 1.7 + i * TAU / 3, ox = Math.cos(an) * 2.7, oy = cy + 0.3 + Math.sin(an) * 0.75;
      if (Math.sin(an) > 0) { X.poly(ctx, [ox, oy - 0.42, ox + 0.26, oy, ox, oy + 0.42, ox - 0.26, oy]); fs(ctx, '#ffffff'); }
    }
  };
  A.CORE_H = 9.2;

  /* ---------- 나무·바위 (스프라이트용) ---------- */
  A.PAL = {
    cool: [['#17573f', '#1f7352', '#2f9468', '#57c08a'], ['#1b5f52', '#24806d', '#35a58a', '#63cfb0'], ['#205a34', '#2c7a45', '#42a05a', '#74c97f']],
    warm: [['#7a2f18', '#a44420', '#cf6a2c', '#f0a04a'], ['#8a5a12', '#b47d1c', '#dba733', '#f6d268'], ['#6e2333', '#96334a', '#c24d63', '#ec8a94']],
    mid:  [['#2a5f2a', '#3a7d35', '#55a04a', '#8fc96a'], ['#3c6a22', '#55892c', '#78ad3c', '#b3d66a'], ['#1f5a4a', '#2b7a62', '#3f9f80', '#74c9a6']],
  };
  /* 나무: 발밑 원점, 높이 약 4.6 */
  A.tree = function (ctx, kind, pal) {
    ctx.lineJoin = 'round';
    X.ell(ctx, 0.25, 0.05, 1.5, 0.55); ctx.fillStyle = 'rgba(8,16,22,0.3)'; ctx.fill();
    if (kind === 0) {           // 활엽수
      X.rr(ctx, -0.26, -1.7, 0.52, 1.8, 0.14); X.fs(ctx, '#5a3d26', '#2a1c14', 0.09);
      const blobs = [[-0.95, -2.3, 1.05], [0.95, -2.25, 1.0], [0, -1.95, 1.1], [-0.5, -3.2, 1.05], [0.6, -3.15, 1.0], [0.05, -3.9, 0.92]];
      ctx.fillStyle = pal[0]; for (const b of blobs) { X.circle(ctx, b[0], b[1], b[2] + 0.1); ctx.fill(); }
      ctx.fillStyle = pal[1]; for (const b of blobs) { X.circle(ctx, b[0], b[1], b[2]); ctx.fill(); }
      ctx.fillStyle = pal[2]; for (const b of blobs) { X.circle(ctx, b[0] - 0.18, b[1] - 0.22, b[2] * 0.72); ctx.fill(); }
      ctx.fillStyle = pal[3]; for (const b of [[-0.75, -3.55, 0.36], [0.2, -4.2, 0.34], [-1.2, -2.6, 0.3], [0.7, -3.45, 0.28]]) { X.circle(ctx, b[0], b[1], b[2]); ctx.fill(); }
    } else if (kind === 1) {    // 침엽수
      X.rr(ctx, -0.2, -1.2, 0.4, 1.3, 0.1); X.fs(ctx, '#4f3522', '#2a1c14', 0.09);
      const tiers = [[-0.9, 1.5], [-2.0, 1.25], [-3.05, 1.0], [-3.95, 0.72]];
      for (let i = 0; i < tiers.length; i++) {
        const y = tiers[i][0], w = tiers[i][1];
        X.poly(ctx, [-w, y, 0, y - 1.7, w, y]); X.fs(ctx, pal[1], pal[0], 0.12);
        X.poly(ctx, [-w * 0.75, y - 0.12, 0, y - 1.6, 0.05, y - 0.12]); ctx.fillStyle = pal[2]; ctx.fill();
        X.poly(ctx, [-w * 0.45, y - 0.5, -0.08, y - 1.5, -0.1, y - 0.5]); ctx.fillStyle = X.rgba(pal[3], 0.7); ctx.fill();
      }
    } else if (kind === 2) {    // 덤불
      const blobs = [[-0.7, -0.45, 0.62], [0.65, -0.42, 0.6], [0, -0.75, 0.72]];
      ctx.fillStyle = pal[0]; for (const b of blobs) { X.circle(ctx, b[0], b[1], b[2] + 0.09); ctx.fill(); }
      ctx.fillStyle = pal[1]; for (const b of blobs) { X.circle(ctx, b[0], b[1], b[2]); ctx.fill(); }
      ctx.fillStyle = pal[2]; for (const b of blobs) { X.circle(ctx, b[0] - 0.12, b[1] - 0.14, b[2] * 0.68); ctx.fill(); }
      ctx.fillStyle = pal[3]; X.circle(ctx, -0.25, -1.05, 0.2); ctx.fill(); X.circle(ctx, 0.5, -0.7, 0.14); ctx.fill();
    } else {                    // 바위
      X.poly(ctx, [-1.1, 0.1, -0.9, -0.85, -0.2, -1.35, 0.7, -1.05, 1.15, -0.2, 0.9, 0.2]); X.fs(ctx, '#7c8496', '#2c3040', 0.1);
      X.poly(ctx, [-0.9, -0.85, -0.2, -1.35, 0.7, -1.05, 0.1, -0.6]); ctx.fillStyle = '#a3abbb'; ctx.fill();
      X.poly(ctx, [0.1, -0.6, 0.7, -1.05, 1.15, -0.2, 0.9, 0.2, 0.2, 0.15]); ctx.fillStyle = '#626a7c'; ctx.fill();
    }
  };
  A.TREE_BOX = [{ w: 4.8, h: 5.6, ox: 2.3, oy: 5.0 }, { w: 3.8, h: 6.6, ox: 1.8, oy: 5.95 }, { w: 3.2, h: 2.4, ox: 1.6, oy: 1.75 }, { w: 3.0, h: 2.2, ox: 1.45, oy: 1.6 }];
})();
