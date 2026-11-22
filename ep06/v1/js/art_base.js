'use strict';
/* 등불지기 — art base: style constants, drawing helpers, hero / NPC / wisp renderers.
   STYLE: chunky "sticker" look — flat fills, dark plum outline (A.OUT, A.LW), round joins,
   one shade tone + small highlight, big expressive eyes. Additive glows via A.glow only (never shadowBlur). */
(function () {
  const G = window.G, U = G.U;
  const A = (G.Art = {});
  const TAU = Math.PI * 2, lerp = U.lerp, sat = U.sat;
  A.OUT = '#2b2136';
  A.LW = 2.6;
  A.FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Segoe UI",sans-serif';

  // ------------------------------------------------------------ color utils (memoized)
  const cc = new Map();
  const parse = (hex) => {
    let h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  A.mix = (a, b, t) => {
    const k = a + b + (t * 100 | 0);
    let v = cc.get(k);
    if (v) return v;
    const p = parse(a), q = parse(b);
    t = sat(t);
    v = '#' + ((1 << 24) | (Math.round(lerp(p[0], q[0], t)) << 16) | (Math.round(lerp(p[1], q[1], t)) << 8) | Math.round(lerp(p[2], q[2], t))).toString(16).slice(1);
    cc.set(k, v);
    return v;
  };
  // f<0 → darker (toward deep plum, keeps shadows colorful), f>0 → lighter
  A.shade = (hex, f) => (f < 0 ? A.mix(hex, '#1d1430', -f) : A.mix(hex, '#ffffff', f));
  A.rgba = (hex, a) => {
    const k = hex + '@' + (a * 100 | 0);
    let v = cc.get(k);
    if (v) return v;
    const p = parse(hex);
    v = 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + (a * 100 | 0) / 100 + ')';
    cc.set(k, v);
    return v;
  };

  // ------------------------------------------------------------ canvas helpers
  // offscreen canvas in logical units, backed at render scale. returns [canvas, ctx]
  A.makeCanvas = (w, h, scale) => {
    const s = scale || G.RS || 1;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * s)); c.height = Math.max(1, Math.ceil(h * s));
    const x = c.getContext('2d');
    x.scale(s, s);
    x.lineJoin = 'round'; x.lineCap = 'round';
    c._w = w; c._h = h; c._s = s;
    return [c, x];
  };
  A.blit = (ctx, c, x, y) => ctx.drawImage(c, x, y, c._w, c._h);

  // path helpers (each begins a new path)
  A.ell = (ctx, x, y, rx, ry, rot) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry === undefined ? rx : ry, rot || 0, 0, TAU); };
  A.rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  A.poly = (ctx, pts, open) => {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    if (!open) ctx.closePath();
  };
  A.capsule = (ctx, len, w) => { ctx.beginPath(); ctx.roundRect(-w / 2, -w / 2, w, len + w, w / 2); };
  A.star = (ctx, x, y, r, r2, n, rot) => {
    n = n || 5; rot = rot === undefined ? -Math.PI / 2 : rot;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const rr = i % 2 ? r2 : r, a = rot + (i * Math.PI) / n;
      ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  };
  // fill + outline the current path. lw=0 → no outline
  A.fs = (ctx, fill, lw, stroke) => {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw !== 0) { ctx.lineWidth = lw || A.LW; ctx.strokeStyle = stroke || A.OUT; ctx.stroke(); }
  };
  // additive soft glow sprite (cached per color)
  const glows = {};
  A.glow = (ctx, x, y, r, color, alpha) => {
    let c = glows[color];
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, A.rgba(color, 1)); gr.addColorStop(0.3, A.rgba(color, 0.55)); gr.addColorStop(0.65, A.rgba(color, 0.16)); gr.addColorStop(1, A.rgba(color, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      glows[color] = c;
    }
    const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
    ctx.globalAlpha = pa * (alpha === undefined ? 1 : alpha); ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = pa; ctx.globalCompositeOperation = pc;
  };
  // outlined text (canvas). opts: size, color, stroke, sw, align, weight, base
  A.text = (ctx, str, x, y, o) => {
    o = o || {};
    ctx.font = (o.weight || 800) + ' ' + (o.size || 14) + 'px ' + A.FONT;
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
    if (o.stroke !== null) { ctx.lineWidth = o.sw || 3.5; ctx.strokeStyle = o.stroke || A.OUT; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = o.color || '#fff'; ctx.fillText(str, x, y);
  };
  // generic cute eye: dark oval + highlight. look: 0 open, 1 closed(arc), 2 angry(slanted lid)
  A.eye = (ctx, x, y, rx, ry, look, color) => {
    if (look === 1) {
      ctx.beginPath(); ctx.arc(x, y - ry * 0.2, rx * 1.05, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = 2; ctx.strokeStyle = color || A.OUT; ctx.stroke();
      return;
    }
    A.ell(ctx, x, y, rx, ry); ctx.fillStyle = color || A.OUT; ctx.fill();
    A.ell(ctx, x - rx * 0.28, y - ry * 0.38, rx * 0.36, ry * 0.3); ctx.fillStyle = '#fff'; ctx.fill();
    if (look === 2) {
      ctx.beginPath(); ctx.moveTo(x - rx * 1.6, y - ry * 1.25); ctx.lineTo(x + rx * 1.5, y - ry * 0.45);
      ctx.lineWidth = 2.2; ctx.strokeStyle = A.OUT; ctx.stroke();
    }
  };

  // ------------------------------------------------------------ hero look tables
  A.LOOKS = {
    HAIR: ['#3b2a24', '#6d4428', '#c98c3d', '#f3d370', '#e2573f', '#f291b3', '#5f81e2', '#45b6a0', '#e9e9f2', '#8b60d2'],
    SKIN: ['#ffe2c6', '#f7cba3', '#d9a475', '#a9754c'],
    EYE: ['#2b2136', '#2f62c9', '#23895a', '#a8501f', '#7d45c9', '#c93356'],
    STYLES: ['삐죽머리', '단발', '포니테일', '긴 머리', '몽실머리', '똥머리'],
  };
  const OUTFITS = {
    novice: [{ top: '#4fb0a5', trim: '#f6e7b8', pants: '#585c88', boots: '#7b5335', scarf: '#f6a43c' }],
    blade: [
      { top: '#c8503f', trim: '#f3c95c', pants: '#4a4560', boots: '#5b3a2e', scarf: '#f8b83a', metal: '#d9dde8' },
      { top: '#a8323a', trim: '#ffd76a', pants: '#3c3850', boots: '#472a26', scarf: '#ff8a3c', metal: '#eceff6' },
      { top: '#f4efe2', trim: '#ffcf4a', pants: '#8a3038', boots: '#6a2a2a', scarf: '#ff6a3c', metal: '#ffe9a8' },
    ],
    star: [
      { top: '#5a5fd4', trim: '#f7da6e', pants: '#3e3f78', boots: '#3a2f5c', scarf: '#9fe4ff' },
      { top: '#4a3fa8', trim: '#ffe28a', pants: '#2f2f66', boots: '#2c2450', scarf: '#c7a6ff' },
      { top: '#2c2a6a', trim: '#fff0a8', pants: '#232258', boots: '#1f1c44', scarf: '#8ff5ff' },
    ],
    gale: [
      { top: '#3f9a5c', trim: '#f6e7b8', pants: '#6b5a40', boots: '#5b3a2e', scarf: '#e6f08a' },
      { top: '#2e7f6a', trim: '#ffe9a0', pants: '#544a38', boots: '#46302a', scarf: '#9ff0c0' },
      { top: '#e9f4ef', trim: '#8ff0d0', pants: '#2e6a66', boots: '#2a4a4a', scarf: '#5fe0ff' },
    ],
  };
  // equipment tier colors (index = tier 1..7), used by weapons here and by item icons
  A.TIER = ['#b98a5a', '#b98a5a', '#cfd6e2', '#a9d9b4', '#9fdcff', '#ffd27a', '#d8f1ff', '#fff0a8'];
  A.TIER_GLOW = [null, null, null, null, '#6fc8ff', '#ffb040', '#9fe4ff', '#ffe070'];
  A.outfit = (L) => L.outfit || (OUTFITS[L.job] || OUTFITS.novice)[Math.min(L.tier || 0, (OUTFITS[L.job] || OUTFITS.novice).length - 1)] || OUTFITS.novice[0];

  // ------------------------------------------------------------ hero pose
  // an: { state, t, p, speed, seed }  states: idle run jump fall climb atk1 atk2 atk3 cast shoot hurt dead dash spin slam cheer
  function pose(L, an) {
    const t = (an.t || 0) + (an.seed || 0), p = an.p || 0, st = an.state || 'idle';
    const wk = L.weapon ? L.weapon.kind : 'none';
    const rest = wk === 'staff' ? [0.55, 0.15] : wk === 'bow' ? [0.4, 0.3] : wk === 'rod' ? [0.75, 0.4] : wk === 'sword' ? [0.3, 0.55] : [0.1, 0];
    const P = { bob: 0, lean: 0, legF: 0, legB: 0, armF: rest[0], armB: -0.15, wAng: rest[1], pull: 0, headRot: 0, eyes: 'open', mouth: 'smile', sx: 1, sy: 1, rot: 0, back: false, dx: 0 };
    const br = Math.sin(t * 2.4);
    let e, r;
    switch (st) {
      case 'run': {
        const ph = t * 13, s = Math.sin(ph);
        P.legF = s * 0.78; P.legB = -s * 0.78; P.armB = s * 0.75; P.armF = rest[0] + 0.25 - s * 0.18; P.wAng = rest[1] + 0.3;
        P.bob = -Math.abs(Math.cos(ph)) * 2.4; P.lean = 0.13;
        break;
      }
      case 'jump': P.legF = 0.6; P.legB = -0.3; P.armB = -0.75; P.armF = rest[0] + 0.55; P.lean = -0.06; P.mouth = 'open'; break;
      case 'fall': P.legF = 0.2; P.legB = -0.55; P.armB = 2.2; P.armF = rest[0] + 0.95; P.wAng = rest[1] - 0.25; P.lean = 0.08; break;
      case 'climb': {
        const s = Math.sin(t * 9);
        P.back = true; P.armF = 2.7 + s * 0.32; P.armB = 2.7 - s * 0.32; P.legF = s * 0.45; P.legB = -s * 0.45; P.bob = -Math.abs(s) * 1.2;
        break;
      }
      case 'atk1': // downward slash
        e = U.ease.outCubic(sat(p / 0.42)); r = sat((p - 0.6) / 0.4);
        P.armF = lerp(3.0, 0.4, e) + r * 0.2; P.wAng = lerp(-1.0, 2.2, e) - r * 0.5; P.lean = lerp(-0.12, 0.22, e) - r * 0.1;
        P.armB = lerp(0.4, -0.7, e); P.legF = 0.35 * e; P.legB = -0.3 * e; P.dx = 3 * e; P.eyes = 'fierce';
        break;
      case 'atk2': // upward slash
        e = U.ease.outCubic(sat(p / 0.42)); r = sat((p - 0.6) / 0.4);
        P.armF = lerp(0.2, 2.75, e) - r * 0.3; P.wAng = lerp(2.5, -0.35, e) + r * 0.3; P.lean = lerp(0.2, -0.1, e);
        P.armB = lerp(-0.6, 0.35, e); P.legF = 0.3; P.legB = -0.3; P.dx = 2 * e; P.eyes = 'fierce';
        break;
      case 'atk3': // thrust
        if (p < 0.22) { e = p / 0.22; P.armF = lerp(rest[0], 0.95, e); P.wAng = lerp(rest[1], 1.5, e); P.dx = -3 * e; P.lean = -0.06 * e; }
        else { e = U.ease.outCubic(sat((p - 0.22) / 0.26)); r = sat((p - 0.65) / 0.35); P.armF = lerp(0.95, 1.6, e); P.wAng = 1.57; P.dx = lerp(-3, 8, e) - r * 5; P.lean = 0.28 * e - r * 0.15; }
        P.legF = 0.55 * sat(p * 4); P.legB = -0.45 * sat(p * 4); P.armB = -0.5; P.eyes = 'fierce';
        break;
      case 'cast':
        e = U.ease.outCubic(sat(p / 0.35)); r = sat((p - 0.65) / 0.35);
        P.armF = lerp(rest[0], 1.9, e) - r * 0.7; P.wAng = lerp(rest[1], 1.0, e) - r * 0.5; P.armB = lerp(-0.1, 1.25, e) - r * 0.9;
        P.lean = -0.09 * e + r * 0.05; P.mouth = 'open'; P.eyes = 'fierce';
        break;
      case 'shoot':
        e = sat(p / 0.3);
        P.armF = 1.52; P.wAng = 0; P.pull = p < 0.3 ? e * 9 : 0; P.armB = p < 0.3 ? lerp(1.5, 1.15, e) : 0.85; P.lean = -0.05; P.eyes = 'fierce';
        P.legF = 0.25; P.legB = -0.25;
        break;
      case 'hurt': P.lean = -0.3; P.armF = 1.2; P.armB = -1.3; P.legF = 0.45; P.legB = -0.15; P.eyes = 'hurt'; P.mouth = 'open'; P.wAng = rest[1] + 0.6; break;
      case 'dead': P.rot = -1.5; P.eyes = 'dead'; P.mouth = 'flat'; P.armF = 0.9; P.armB = -0.6; P.legF = 0.15; P.legB = -0.1; P.wAng = 2.0; break;
      case 'dash': P.lean = 0.5; P.armF = 1.45; P.wAng = 1.57; P.legF = -0.45; P.legB = -0.95; P.armB = -1.0; P.eyes = 'fierce'; P.dx = 4; break;
      case 'spin': {
        const c = Math.cos(t * 24);
        P.sx = (c < 0 ? -1 : 1) * Math.max(0.28, Math.abs(c)); P.armF = 1.57; P.wAng = 1.57; P.armB = -1.57; P.legF = 0.3; P.legB = -0.3; P.eyes = 'fierce';
        break;
      }
      case 'slam':
        if (p < 0.38) { e = sat(p / 0.3); P.armF = lerp(rest[0], 3.05, e); P.wAng = lerp(rest[1], -0.5, e); P.lean = -0.16 * e; P.legF = 0.5 * e; P.legB = -0.2 * e; P.armB = lerp(-0.15, 2.6, e); }
        else { e = U.ease.outCubic(sat((p - 0.38) / 0.2)); P.armF = lerp(3.05, 0.35, e); P.wAng = lerp(-0.5, 2.4, e); P.lean = lerp(-0.16, 0.34, e); P.legF = 0.5; P.legB = -0.4; P.armB = lerp(2.6, 0.2, e); P.sy = 1 - 0.06 * e; }
        P.eyes = 'fierce'; P.mouth = 'open';
        break;
      case 'cheer': {
        const j = Math.abs(Math.sin(t * 8));
        P.armF = 2.75 + Math.sin(t * 16) * 0.15; P.armB = 2.75 - Math.sin(t * 16) * 0.15; P.bob = -j * 5; P.eyes = 'happy'; P.mouth = 'open'; P.wAng = -0.2; P.legF = 0.2 * j; P.legB = -0.2 * j;
        break;
      }
      default: // idle
        P.bob = br * 0.9; P.armF += br * 0.04; P.armB = -0.12 + br * 0.04;
    }
    if (P.eyes === 'open' && (t % 3.7) > 3.58) P.eyes = 'closed';
    return P;
  }

  // ------------------------------------------------------------ hero parts
  function leg(ctx, hx, hy, ang, o, dark) {
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-ang);
    A.capsule(ctx, 10, 8.6); A.fs(ctx, dark ? A.shade(o.pants, -0.2) : o.pants);
    A.rr(ctx, -5, 7.4, 12.5, 8.6, [3.5, 5, 3.5, 3.5]); A.fs(ctx, dark ? A.shade(o.boots, -0.2) : o.boots);
    ctx.restore();
  }
  function arm(ctx, sx, sy, ang, sleeve, skin) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(-ang);
    A.capsule(ctx, 10.5, 7.6); A.fs(ctx, sleeve);
    A.ell(ctx, 0, 12.5, 4.3); A.fs(ctx, skin, 2.2);
    ctx.restore();
  }
  const handAt = (sx, sy, ang) => [sx + Math.sin(ang) * 12.5, sy + Math.cos(ang) * 12.5];

  function weapon(ctx, w, P, t) {
    const tier = U.clamp(w.tier || 1, 1, 7), col = A.TIER[tier], gl = (w.enh || 0) >= 7 ? '#fff2b0' : A.TIER_GLOW[tier] || ((w.enh || 0) >= 4 ? '#ffd98a' : null);
    if (w.kind === 'sword') {
      const bl = 30 + tier * 1.5;
      A.rr(ctx, -1.9, -4, 3.8, 10.5, 1.5); A.fs(ctx, '#6a4630', 2);
      A.ell(ctx, 0, 7.4, 2.7); A.fs(ctx, tier >= 2 ? '#f0c35a' : '#8a6040', 2);
      A.poly(ctx, [-3.5, -5, -3.5, -bl + 1, 0, -5 - bl, 3.5, -bl + 1, 3.5, -5]); A.fs(ctx, col);
      ctx.beginPath(); ctx.moveTo(-1, -8.5); ctx.lineTo(-1, -bl); ctx.strokeStyle = A.shade(col, 0.55); ctx.lineWidth = 1.4; ctx.stroke();
      A.rr(ctx, -7, -7.4, 14, 4.4, 2); A.fs(ctx, tier >= 2 ? '#f0c35a' : '#8a6040', 2);
      if (tier >= 5) { A.ell(ctx, 0, -5.2, 1.7); ctx.fillStyle = tier === 5 ? '#ff7a4a' : tier === 6 ? '#5fd0ff' : '#ff5a8a'; ctx.fill(); }
      if (gl) { A.glow(ctx, 0, -bl * 0.45, 15, gl, 0.5); A.glow(ctx, 0, -bl * 0.85, 12, gl, 0.5); }
    } else if (w.kind === 'staff') {
      A.rr(ctx, -1.9, -33, 3.8, 49, 1.9); A.fs(ctx, tier >= 5 ? '#efe6d2' : '#8a5a3a', 2);
      ctx.beginPath(); ctx.arc(0, -40.5, 8, 0.2 * Math.PI, 0.8 * Math.PI, true); ctx.lineWidth = 6.2; ctx.strokeStyle = A.OUT; ctx.stroke();
      ctx.lineWidth = 2.8; ctx.strokeStyle = tier >= 2 ? '#f0c35a' : '#a87a52'; ctx.stroke();
      const oc = tier <= 1 ? '#8fd6ff' : col;
      A.ell(ctx, 0, -40.5, 5.3); A.fs(ctx, oc, 2);
      A.ell(ctx, -1.6, -42.3, 1.7); ctx.fillStyle = '#fff'; ctx.fill();
      A.glow(ctx, 0, -40.5, 13 + Math.sin(t * 5) * 1.5, gl || oc, 0.55);
    } else if (w.kind === 'bow') {
      const hg = 21 + tier * 0.6, pull = P.pull || 0;
      ctx.beginPath(); ctx.moveTo(-3, -hg); ctx.lineTo(-3 - pull, 0); ctx.lineTo(-3, hg); ctx.strokeStyle = '#f6f1e2'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3.5, -hg); ctx.quadraticCurveTo(9, -hg * 0.55, 2.5, 0); ctx.quadraticCurveTo(9, hg * 0.55, -3.5, hg);
      ctx.lineWidth = 6.4; ctx.strokeStyle = A.OUT; ctx.stroke();
      ctx.lineWidth = 3.2; ctx.strokeStyle = tier <= 1 ? '#b98a5a' : col; ctx.stroke();
      A.rr(ctx, 0.2, -3.6, 4.6, 7.2, 2); A.fs(ctx, '#6a4630', 1.8);
      if (pull > 0.5) {
        ctx.beginPath(); ctx.moveTo(-3 - pull, 0); ctx.lineTo(19 - pull, 0); ctx.lineWidth = 3.6; ctx.strokeStyle = A.OUT; ctx.stroke();
        ctx.lineWidth = 1.6; ctx.strokeStyle = '#f1e2b8'; ctx.stroke();
        A.poly(ctx, [19 - pull, -3, 25 - pull, 0, 19 - pull, 3]); A.fs(ctx, '#dfe6ee', 1.6);
      }
      if (gl) A.glow(ctx, 3, 0, 16, gl, 0.4);
    } else if (w.kind === 'rod') {
      // novice lantern rod: shaft + hook + hanging lantern (always hangs straight down)
      A.rr(ctx, -1.8, -30, 3.6, 39, 1.8); A.fs(ctx, '#8a5a3a', 2);
      ctx.beginPath(); ctx.moveTo(0, -29); ctx.quadraticCurveTo(0.5, -37, 7, -35.5); ctx.lineWidth = 5.6; ctx.strokeStyle = A.OUT; ctx.stroke();
      ctx.lineWidth = 2.4; ctx.strokeStyle = '#8a5a3a'; ctx.stroke();
      ctx.save(); ctx.translate(7, -35); ctx.rotate(-P.wAng - (P.lean || 0) + Math.sin(t * 3.1) * 0.12);
      A.glow(ctx, 0, 8, 17 + Math.sin(t * 6) * 1.5, '#ffc95a', 0.6);
      A.rr(ctx, -4.4, 2.5, 8.8, 10.5, 2.4); A.fs(ctx, '#ffe9a0', 2);
      A.rr(ctx, -5.2, 1, 10.4, 3, 1.4); A.fs(ctx, '#6a4630', 1.8);
      A.ell(ctx, 0, 8.2, 2.1, 3); ctx.fillStyle = '#ff9a2e'; ctx.fill();
      ctx.restore();
    }
  }

  function scarf(ctx, o, t, k) {
    const fl = Math.sin(t * 7.5) * 2.4, c = A.shade(o.scarf, -0.16);
    const ex = lerp(-15, -32, k), ey = lerp(-25, -41, k) + fl * (0.4 + k);
    ctx.beginPath();
    ctx.moveTo(-8, -43.5);
    ctx.quadraticCurveTo(lerp(-17, -20, k), lerp(-41, -47, k) + fl * 0.5, ex, ey - 3.6);
    ctx.lineTo(ex - 1.5, ey + 3.8);
    ctx.quadraticCurveTo(lerp(-12, -18, k), lerp(-33, -40, k) + fl * 0.5, -8, -37.5);
    ctx.closePath(); A.fs(ctx, c, 2.2);
  }

  function body(ctx, L, o) {
    const job = L.job;
    if (job === 'gale') { // quiver behind
      ctx.save(); ctx.translate(-10.5, -30); ctx.rotate(-0.42);
      A.poly(ctx, [-2, -15, 0, -19.5, 2, -15]); A.fs(ctx, '#f6f1e2', 1.6);
      A.poly(ctx, [1.5, -14, 3.8, -18, 5.4, -13.5]); A.fs(ctx, o.scarf, 1.6);
      A.rr(ctx, -4, -13, 8.6, 20, 3); A.fs(ctx, '#7a5236', 2.2);
      ctx.restore();
    }
    if (job === 'star') {
      ctx.beginPath(); ctx.moveTo(-9.5, -41.5); ctx.lineTo(9.5, -41.5); ctx.quadraticCurveTo(12, -30, 14.5, -9.5); ctx.quadraticCurveTo(0, -5.5, -14.5, -9.5); ctx.quadraticCurveTo(-12, -30, -9.5, -41.5); ctx.closePath();
      A.fs(ctx, o.top);
      ctx.beginPath(); ctx.moveTo(-13.6, -13); ctx.quadraticCurveTo(0, -9.2, 13.6, -13); ctx.lineWidth = 2.4; ctx.strokeStyle = o.trim; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -38); ctx.lineTo(1.6, -12); ctx.lineWidth = 1.6; ctx.strokeStyle = A.shade(o.top, -0.25); ctx.stroke();
      A.star(ctx, 1.2, -29, 4.6, 2, 4, 0); A.fs(ctx, o.trim, 1.6);
      return;
    }
    A.rr(ctx, -11, -41.5, 22, 28, [8, 8, 6.5, 6.5]); A.fs(ctx, o.top);
    ctx.fillStyle = A.shade(o.top, -0.16); ctx.beginPath(); ctx.roundRect(-9.7, -19.6, 19.4, 4.8, [0, 0, 5, 5]); ctx.fill();
    ctx.fillStyle = job === 'blade' ? '#5b3a2e' : A.shade(o.pants, -0.15); ctx.fillRect(-9.7, -23.4, 19.4, 3.8);
    A.rr(ctx, -0.4, -24.2, 5.2, 5.2, 1.4); A.fs(ctx, o.trim, 1.5);
    if (job === 'blade') {
      A.rr(ctx, -9.4, -40.2, 18.8, 14.6, [6.5, 6.5, 4, 4]); A.fs(ctx, o.metal, 2.1);
      ctx.beginPath(); ctx.moveTo(-5.5, -36.5); ctx.lineTo(-5.5, -30); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.stroke();
      A.ell(ctx, 2, -32.5, 2.6); A.fs(ctx, o.top, 1.5);
    } else if (job === 'gale') {
      ctx.beginPath(); ctx.moveTo(-9, -39); ctx.lineTo(9.4, -25.5); ctx.lineWidth = 3.4; ctx.strokeStyle = '#7a5236'; ctx.stroke();
    } else {
      A.poly(ctx, [-3.5, -41, 1.5, -34.5, 6.5, -41], true); ctx.lineWidth = 2; ctx.strokeStyle = o.trim; ctx.stroke();
    }
  }

  function hairBack(ctx, L, t, k) {
    const c = A.shade(L.hair, -0.2), sw = Math.sin(t * 4.2) * 1.8 - k * 5;
    switch (L.style | 0) {
      case 1: A.rr(ctx, -23.5, -13, 29, 33.5, [10, 6, 9, 13]); A.fs(ctx, c); break;
      case 2:
        ctx.beginPath(); ctx.moveTo(-15, -12);
        ctx.bezierCurveTo(-31 + sw, -17, -42 + sw * 1.4, 2, -33 + sw * 2, 21); ctx.bezierCurveTo(-29 + sw, 9, -24, 3, -16, 0);
        ctx.closePath(); A.fs(ctx, c);
        break;
      case 3:
        ctx.beginPath(); ctx.moveTo(-20, -8);
        ctx.bezierCurveTo(-28, 10, -25 + sw, 28, -21 + sw * 1.6, 41); ctx.lineTo(-3 + sw * 0.8, 38); ctx.bezierCurveTo(-3, 22, 3, 8, 3, -6);
        ctx.closePath(); A.fs(ctx, c);
        break;
      case 5: A.ell(ctx, -7, -25.5, 8.2); A.fs(ctx, c); break;
    }
  }
  function capTop(ctx) { ctx.moveTo(-20.8, 6); ctx.bezierCurveTo(-25.5, -16, -9, -26, 3, -24); ctx.bezierCurveTo(14, -23, 21.4, -14, 20.7, -4); }
  function hairFront(ctx, L, back) {
    const c = L.hair, st = L.style | 0;
    if (back) { // back of the head (climbing)
      A.ell(ctx, 0, -1, 21.2, 19.6); A.fs(ctx, c);
      ctx.beginPath(); ctx.moveTo(-9, 6); ctx.quadraticCurveTo(0, 10, 9, 6); ctx.lineWidth = 1.8; ctx.strokeStyle = A.shade(c, -0.25); ctx.stroke();
      return;
    }
    if (st === 0) { A.poly(ctx, [-17, -13, -27, -21, -11, -21]); A.fs(ctx, c); A.poly(ctx, [-10, -20, -15, -31, -2, -24]); A.fs(ctx, c); A.poly(ctx, [0, -23, 0.5, -31, 8, -22]); A.fs(ctx, c); }
    if (st === 4) {
      const bl = [-17, -9, 7.5, -10, -19, 8.5, 0.5, -24, 8.8, 11, -20.5, 8, 18, -12, 6.6];
      for (let i = 0; i < bl.length; i += 3) { A.ell(ctx, bl[i], bl[i + 1], bl[i + 2]); ctx.lineWidth = A.LW * 2; ctx.strokeStyle = A.OUT; ctx.stroke(); }
      for (let i = 0; i < bl.length; i += 3) { A.ell(ctx, bl[i], bl[i + 1], bl[i + 2]); ctx.fillStyle = c; ctx.fill(); }
    }
    ctx.beginPath(); capTop(ctx);
    switch (st) {
      case 0: A_line(ctx, [16, -9, 13.5, -2, 9, -10, 5.5, -1.5, 0.5, -10, -3.5, -2, -8, -9]); ctx.quadraticCurveTo(-12, -2, -12.5, 6); A_line(ctx, [-16, 3.5, -17.5, 10]); break;
      case 1: ctx.quadraticCurveTo(19, -6, 12, -5.5); ctx.quadraticCurveTo(6, -4, 0, -7.5); ctx.quadraticCurveTo(-7.5, -5, -9.5, 3); ctx.lineTo(-10.5, 14.5); ctx.quadraticCurveTo(-18, 14.5, -20.8, 6); break;
      case 2: ctx.quadraticCurveTo(15, -3, 7, -7); ctx.quadraticCurveTo(-2, -9.5, -9, -3); ctx.quadraticCurveTo(-12.5, 2, -13, 8); break;
      case 3: ctx.quadraticCurveTo(20.5, 3, 17, 9); ctx.quadraticCurveTo(14.5, -2, 7, -8.5); ctx.quadraticCurveTo(0, -3, -9, -1.5); ctx.lineTo(-11, 13); break;
      case 4: ctx.quadraticCurveTo(17, -7, 12.5, -6); ctx.quadraticCurveTo(9, -2.5, 5, -6.5); ctx.quadraticCurveTo(1.5, -2.5, -3, -6.5); ctx.quadraticCurveTo(-8, -3, -11, 5); ctx.lineTo(-13, 10); break;
      default: ctx.quadraticCurveTo(16, -5, 9, -7.5); ctx.quadraticCurveTo(0, -10, -8, -4); ctx.quadraticCurveTo(-12, 1, -12.5, 8);
    }
    ctx.closePath(); A.fs(ctx, c);
    // sheen
    ctx.beginPath(); ctx.moveTo(-10, -17.5); ctx.quadraticCurveTo(-2, -21.5, 7, -19.5); ctx.lineWidth = 2.2; ctx.strokeStyle = A.shade(c, 0.32); ctx.stroke();
    if (st === 2) { A.ell(ctx, -16.5, -8, 3, 4.2, 0.4); A.fs(ctx, A.outfit(L).scarf, 1.8); }
  }
  function A_line(ctx, pts) { for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); }

  function face(ctx, L, P) {
    const ec = A.mix(L.eye || '#2b2136', '#1d1430', 0.35);
    A.ell(ctx, 3.2, 8.8, 3.6, 2.1); ctx.fillStyle = 'rgba(255,120,110,0.42)'; ctx.fill();
    A.ell(ctx, 16, 8.2, 2.6, 1.9); ctx.fill();
    const E = P.eyes;
    if (E === 'closed' || E === 'happy') {
      ctx.lineWidth = 2.1; ctx.strokeStyle = A.OUT;
      const up = E === 'happy';
      ctx.beginPath(); ctx.arc(5.5, up ? 3.5 : 1.5, 3.2, up ? 1.15 * Math.PI : 0.15 * Math.PI, up ? 1.85 * Math.PI : 0.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(14.6, up ? 3.5 : 1.5, 2.7, up ? 1.15 * Math.PI : 0.15 * Math.PI, up ? 1.85 * Math.PI : 0.85 * Math.PI); ctx.stroke();
    } else if (E === 'hurt') {
      ctx.lineWidth = 2.2; ctx.strokeStyle = A.OUT;
      A.poly(ctx, [2.5, -1.5, 7.5, 1.5, 2.5, 4.5], true); ctx.stroke();
      A.poly(ctx, [17, -1.5, 12.5, 1.5, 17, 4.5], true); ctx.stroke();
    } else if (E === 'dead') {
      ctx.lineWidth = 2.1; ctx.strokeStyle = A.OUT; ctx.beginPath();
      ctx.moveTo(3, -1.5); ctx.lineTo(8, 4); ctx.moveTo(8, -1.5); ctx.lineTo(3, 4);
      ctx.moveTo(12.5, -1.5); ctx.lineTo(17, 4); ctx.moveTo(17, -1.5); ctx.lineTo(12.5, 4); ctx.stroke();
    } else {
      A.ell(ctx, 5.5, 1.6, 3.2, 4.8); ctx.fillStyle = ec; ctx.fill();
      A.ell(ctx, 14.7, 1.6, 2.7, 4.6); ctx.fill();
      ctx.fillStyle = L.eye && L.eye !== '#2b2136' ? A.shade(L.eye, 0.25) : '#6a5a7a';
      A.ell(ctx, 5.6, 3.6, 2, 2.1); ctx.fill(); A.ell(ctx, 14.8, 3.6, 1.7, 2); ctx.fill();
      ctx.fillStyle = '#fff'; A.ell(ctx, 4.5, -0.6, 1.4, 1.6); ctx.fill(); A.ell(ctx, 13.9, -0.6, 1.2, 1.5); ctx.fill();
      if (E === 'fierce') {
        ctx.lineWidth = 2.2; ctx.strokeStyle = A.OUT; ctx.beginPath();
        ctx.moveTo(1.5, -5.6); ctx.lineTo(8.6, -3.4); ctx.moveTo(17.6, -5.2); ctx.lineTo(11.8, -3.4); ctx.stroke();
      }
    }
    if (P.mouth === 'open') { A.ell(ctx, 10.4, 10.6, 2.5, 2.9); A.fs(ctx, '#b8433f', 1.6); }
    else if (P.mouth === 'flat') { ctx.beginPath(); ctx.moveTo(8, 10.5); ctx.lineTo(13, 10.5); ctx.lineWidth = 1.9; ctx.strokeStyle = A.OUT; ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(10.4, 8.6, 3, 0.18 * Math.PI, 0.82 * Math.PI); ctx.lineWidth = 1.9; ctx.strokeStyle = A.OUT; ctx.stroke(); }
  }

  function headgear(ctx, L, o, t, k, back) {
    const job = L.job, tier = L.tier || 0;
    if (job === 'blade') {
      const fl = Math.sin(t * 8) * 2.5;
      // headband tails
      ctx.beginPath(); ctx.moveTo(-19, -8); ctx.quadraticCurveTo(-27, -9 + fl * 0.4, lerp(-31, -39, k), lerp(-1, -11, k) + fl); ctx.lineTo(lerp(-33, -40, k), lerp(4, -6, k) + fl); ctx.quadraticCurveTo(-26, -3 + fl * 0.4, -19, -3.5); ctx.closePath(); A.fs(ctx, A.shade(o.scarf, -0.12), 2);
      if (back) { ctx.beginPath(); ctx.moveTo(-21, -7); ctx.quadraticCurveTo(0, -11, 21, -7); ctx.lineWidth = 7.6; ctx.strokeStyle = A.OUT; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = o.scarf; ctx.stroke(); return; }
      ctx.beginPath(); ctx.moveTo(-21, -5.5); ctx.quadraticCurveTo(0, -13.5, 20.6, -8); ctx.lineWidth = 7.6; ctx.strokeStyle = A.OUT; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = o.scarf; ctx.stroke();
      if (tier >= 1) { A.poly(ctx, [7.5, -15.5, 16.5, -13.5, 17, -6, 12.5, -3.2, 7.5, -7.5]); A.fs(ctx, o.metal, 2); }
      if (tier >= 2) { A.ell(ctx, 12.4, -9.4, 2.2); A.fs(ctx, '#ff6a4a', 1.4); A.glow(ctx, 12.4, -9.4, 9, '#ffb040', 0.6); }
    } else if (job === 'star') {
      const hc = o.top, tip = Math.sin(t * 3) * 1.5;
      // cone
      ctx.beginPath(); ctx.moveTo(-21, -12); ctx.quadraticCurveTo(-13, -34, -3, -43); ctx.quadraticCurveTo(-12 + tip, -52, -24 + tip, -49 - tip * 0.5);
      ctx.quadraticCurveTo(-8 + tip, -61, 8, -41); ctx.quadraticCurveTo(17, -28, 21.5, -13); ctx.closePath(); A.fs(ctx, hc);
      // band
      ctx.beginPath(); ctx.moveTo(-18.5, -18.5); ctx.quadraticCurveTo(0, -24.5, 19, -19.5); ctx.lineWidth = 4.4; ctx.strokeStyle = o.trim; ctx.stroke();
      // brim
      ctx.save(); ctx.translate(0.5, -12.5); ctx.rotate(-0.05);
      A.ell(ctx, 0, 0, 29, 6.4); A.fs(ctx, A.shade(hc, -0.14));
      ctx.restore();
      // charm
      A.star(ctx, -24 + tip, -43 - tip * 0.5, 4.6 + tier, 2 + tier * 0.4, 5); A.fs(ctx, o.trim, 1.6);
      A.glow(ctx, -24 + tip, -43, 10 + tier * 2, o.scarf, 0.55);
      if (tier >= 1) { A.star(ctx, 4, -30, 3.4, 1.4, 4, 0); ctx.fillStyle = o.trim; ctx.fill(); }
    } else if (job === 'gale') {
      // feather
      ctx.save(); ctx.translate(-5, -22); ctx.rotate(-0.85 + Math.sin(t * 5) * 0.06 - k * 0.2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-9, -12, -2, -27); ctx.quadraticCurveTo(7, -13, 0, 0); ctx.closePath(); A.fs(ctx, tier >= 2 ? '#8ff0d0' : '#f6f1e2', 2);
      ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(-1.2, -22); ctx.lineWidth = 1.3; ctx.strokeStyle = A.shade(o.top, -0.1); ctx.stroke();
      ctx.restore();
      // cap
      ctx.beginPath(); ctx.moveTo(-21.5, -8.5); ctx.quadraticCurveTo(-19, -27, 1, -27.5); ctx.quadraticCurveTo(17, -25, 30, -9.5); ctx.quadraticCurveTo(12, -13.5, -21.5, -8.5); ctx.closePath(); A.fs(ctx, o.top);
      ctx.beginPath(); ctx.moveTo(-20.5, -10.5); ctx.quadraticCurveTo(8, -16.5, 27.5, -11.2); ctx.lineWidth = 2.6; ctx.strokeStyle = o.trim; ctx.stroke();
      if (tier >= 1) { A.ell(ctx, -3, -17, 2.6); A.fs(ctx, o.scarf, 1.5); }
    }
    // npc accessories
    const acc = L.acc;
    if (acc) {
      if (acc.includes('strawhat')) {
        A.ell(ctx, 1, -13, 31, 6.5); A.fs(ctx, '#e8c873');
        ctx.beginPath(); ctx.moveTo(-17, -14); ctx.quadraticCurveTo(-14, -30, 1, -30.5); ctx.quadraticCurveTo(16, -30, 19, -14.5); ctx.closePath(); A.fs(ctx, '#f0d488');
        ctx.beginPath(); ctx.moveTo(-16.5, -17.5); ctx.quadraticCurveTo(1, -21, 18.5, -17.5); ctx.lineWidth = 3.4; ctx.strokeStyle = '#c8503f'; ctx.stroke();
      }
      if (acc.includes('bandana')) {
        ctx.beginPath(); capTop(ctx); ctx.quadraticCurveTo(10, -9, -4, -9); ctx.quadraticCurveTo(-16, -6, -20.8, 6); ctx.closePath(); A.fs(ctx, L.accColor || '#c8503f');
        A.poly(ctx, [-19, -2, -29, 2, -26, -6]); A.fs(ctx, A.shade(L.accColor || '#c8503f', -0.15), 2);
      }
      if (acc.includes('hood')) {
        ctx.beginPath(); ctx.moveTo(-22, 12); ctx.bezierCurveTo(-30, -18, -8, -31, 4, -28); ctx.bezierCurveTo(16, -27, 22, -16, 20, -6); ctx.quadraticCurveTo(8, -13, -5, -8); ctx.quadraticCurveTo(-13, 0, -13, 13); ctx.closePath(); A.fs(ctx, L.accColor || '#5a4a7a');
      }
      if (acc.includes('turban')) {
        A.ell(ctx, 0, -15, 21.5, 11); A.fs(ctx, L.accColor || '#f1e6cf');
        ctx.beginPath(); ctx.moveTo(-18, -12); ctx.quadraticCurveTo(0, -22, 19, -14); ctx.moveTo(-14, -20); ctx.quadraticCurveTo(2, -27, 16, -20); ctx.lineWidth = 1.8; ctx.strokeStyle = A.shade(L.accColor || '#f1e6cf', -0.22); ctx.stroke();
        A.ell(ctx, 9, -15.5, 3.2); A.fs(ctx, '#3fb6c9', 1.6);
      }
      if (acc.includes('glasses')) {
        ctx.lineWidth = 1.8; ctx.strokeStyle = A.OUT; A.ell(ctx, 5.5, 2, 5, 5); ctx.stroke(); A.ell(ctx, 15.2, 2, 4.2, 4.8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10.5, 1.5); ctx.lineTo(11, 1.5); ctx.moveTo(0.5, 1); ctx.lineTo(-14, -2); ctx.stroke();
      }
      if (acc.includes('beard')) {
        ctx.beginPath(); ctx.moveTo(-4, 9); ctx.quadraticCurveTo(-3, 27, 9, 29); ctx.quadraticCurveTo(21, 26, 20, 7); ctx.quadraticCurveTo(15, 13, 10.5, 12); ctx.quadraticCurveTo(4, 13, -4, 9); ctx.closePath(); A.fs(ctx, L.beard || '#eeeef4');
      }
      if (acc.includes('mustache')) {
        ctx.beginPath(); ctx.moveTo(10.5, 8); ctx.quadraticCurveTo(4, 7, 1, 12.5); ctx.quadraticCurveTo(7, 13.5, 10.5, 11); ctx.quadraticCurveTo(14, 13.5, 19.5, 12); ctx.quadraticCurveTo(17, 7, 10.5, 8); ctx.closePath(); A.fs(ctx, L.beard || L.hair, 1.8);
      }
    }
  }

  // ------------------------------------------------------------ hero (origin: feet center, facing right)
  // L: { skin, hair, style, eye, job:'novice'|'blade'|'star'|'gale'|'npc', tier:0..2, weapon:{kind,tier,enh}|null, outfit?, acc?, scale? }
  A.hero = function (ctx, L, an) {
    const o = A.outfit(L), P = pose(L, an), t = (an.t || 0) + (an.seed || 0);
    const k = sat((an.speed || 0) / 260);
    const skin = L.skin || A.LOOKS.SKIN[0];
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (L.scale) ctx.scale(L.scale, L.scale);
    if (P.rot) { ctx.translate(-6, -11); ctx.rotate(P.rot); }
    if (P.sx !== 1 || P.sy !== 1) ctx.scale(P.sx, P.sy);
    ctx.translate(P.dx, 0);
    const hipY = -16 + P.bob * 0.5;
    leg(ctx, -4.5, hipY, P.legB, o, true);
    leg(ctx, 4.5, hipY, P.legF, o, false);
    // torso space (leans about the hips)
    ctx.translate(0, hipY + 16 + P.bob * 0.5); ctx.translate(0, -16); ctx.rotate(P.lean); ctx.translate(0, 16);
    const wpn = L.weapon && L.weapon.kind !== 'none' ? L.weapon : null;
    const hb = handAt(-7.5, -37, P.armB), hf = handAt(7.5, -37, P.armF);
    if (P.back && wpn) { // weapon slung on the back while climbing
      const wa = wpn.kind === 'bow' ? 0.5 : wpn.kind === 'sword' ? 2.65 : -0.38;
      ctx.save();
      if (wpn.kind === 'sword') ctx.translate(7, -44); else if (wpn.kind === 'bow') ctx.translate(0, -30); else ctx.translate(-3, -20);
      ctx.rotate(wa); weapon(ctx, wpn, { pull: 0, wAng: wa, lean: P.lean }, t); ctx.restore();
    }
    arm(ctx, -7.5, -37, P.armB, A.shade(o.top, -0.2), A.shade(skin, -0.12));
    scarf(ctx, o, t, k);
    body(ctx, L, o);
    A.rr(ctx, -11.8, -46, 23.6, 8.6, 4.3); A.fs(ctx, o.scarf, 2.3);
    // head
    ctx.save(); ctx.translate(1.5, -57.5); ctx.rotate(P.headRot);
    hairBack(ctx, L, t, k);
    if (!P.back) { A.ell(ctx, 0, 0, 20, 18.6); A.fs(ctx, skin); face(ctx, L, P); }
    hairFront(ctx, L, P.back);
    headgear(ctx, L, o, t, k, P.back);
    ctx.restore();
    // weapon + front arm
    if (wpn && !P.back) {
      ctx.save(); ctx.translate(hf[0], hf[1]); ctx.rotate(P.wAng); weapon(ctx, wpn, P, t); ctx.restore();
    }
    arm(ctx, 7.5, -37, P.armF, o.top, skin);
    if (L.job === 'blade') { A.ell(ctx, 8, -37.5, 6, 5.2); A.fs(ctx, o.metal, 2); }
    ctx.restore();
    return P;
  };
  // world-space offset (facing right) of the weapon tip / hand for fx anchoring
  A.heroHand = (P) => { const h = handAt(7.5, -37, P.armF); return [h[0] + P.dx, h[1] + P.bob]; };

  // head-only portrait (for HUD / dialogs). origin = head center
  A.heroHead = function (ctx, L, t, mood) {
    const o = A.outfit(L), P = { eyes: mood || 'open', mouth: 'smile', headRot: 0, back: false };
    if (P.eyes === 'open' && ((t || 0) % 3.7) > 3.58) P.eyes = 'closed';
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    hairBack(ctx, L, t || 0, 0);
    A.ell(ctx, 0, 0, 20, 18.6); A.fs(ctx, L.skin || A.LOOKS.SKIN[0]); face(ctx, L, P);
    hairFront(ctx, L, false); headgear(ctx, L, o, t || 0, 0, false);
    ctx.restore();
  };

  // ------------------------------------------------------------ wisp companion "초롱이" (origin: center)
  A.wisp = function (ctx, t, mood) {
    const fl = Math.sin(t * 9) * 1.3, fl2 = Math.sin(t * 13 + 1) * 0.9;
    A.glow(ctx, 0, 0, 30 + fl, '#ffcf6a', 0.55);
    ctx.save(); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(fl2, -14.5 - fl); ctx.bezierCurveTo(7.5, -6, 9.5, -1, 9, 3.2); ctx.bezierCurveTo(8.4, 10.2, -8.4, 10.2, -9, 3.2); ctx.bezierCurveTo(-9.5, -1, -4.5, -6.5, fl2, -14.5 - fl); ctx.closePath();
    A.fs(ctx, '#fff1bd', 2.2, '#e8962a');
    ctx.beginPath(); ctx.moveTo(fl2 * 0.5, -6.5 - fl * 0.5); ctx.bezierCurveTo(4, -1.5, 5.4, 2, 5, 4); ctx.bezierCurveTo(4.6, 7.4, -4.6, 7.4, -5, 4); ctx.bezierCurveTo(-5.4, 2, -2.5, -2, fl2 * 0.5, -6.5 - fl * 0.5); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    const blink = (t % 3.1) > 2.98 || mood === 'happy';
    if (blink) { ctx.lineWidth = 1.6; ctx.strokeStyle = '#7a4a1a'; ctx.beginPath(); ctx.arc(-2.6, 3.6, 1.5, Math.PI, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(3, 3.6, 1.5, Math.PI, TAU); ctx.stroke(); }
    else { ctx.fillStyle = '#7a4a1a'; A.ell(ctx, -2.6, 3, 1.25, 1.9); ctx.fill(); A.ell(ctx, 3, 3, 1.25, 1.9); ctx.fill(); }
    ctx.restore();
  };

  // ------------------------------------------------------------ theme palettes (shared by backgrounds, terrain, props)
  // sky: [top, bottom] gradient · far/mid: distant silhouettes · top: walkable surface cap · body/body2: terrain fill + its shade
  // edge: terrain accent/strata · accent: flowers/details · glow: light color of the theme · dark: 0..1 darkness for the light pass
  A.PAL = {
    town:    { sky: ['#6fb2e6', '#ffe3b4'], far: '#b9d2c4', mid: '#8fbf8e', top: '#7cc35a', body: '#a8734a', body2: '#8a5a3c', edge: '#c99466', accent: '#f6a43c', glow: '#ffc95a', wood: '#a06a3c', dark: 0 },
    meadow:  { sky: ['#5fbaf0', '#c9f0ff'], far: '#a9dcc0', mid: '#86cf8a', top: '#8ad05a', body: '#b07a4a', body2: '#8f5f3c', edge: '#cf9a66', accent: '#ffd84a', glow: '#fff3b0', wood: '#a06a3c', dark: 0 },
    forest:  { sky: ['#2f7f73', '#a8e0a0'], far: '#5fae84', mid: '#3c8f62', top: '#4fa85a', body: '#7a5a3c', body2: '#5f442e', edge: '#96744e', accent: '#ffb3c8', glow: '#d8ffb0', wood: '#5a4030', dark: 0.12 },
    marsh:   { sky: ['#252f5e', '#4f7a86'], far: '#3a5a72', mid: '#2f4f5e', top: '#4a9a7a', body: '#5a4a44', body2: '#463a38', edge: '#746058', accent: '#d8ff7a', glow: '#d8ff7a', wood: '#6a5a48', dark: 0.3 },
    cave:    { sky: ['#15122a', '#2a2346'], far: '#262043', mid: '#2e2a4c', top: '#5a5480', body: '#4a4466', body2: '#35304f', edge: '#6a6490', accent: '#7fe0ff', glow: '#7fe0ff', wood: '#6a5040', dark: 0.72 },
    oasis:   { sky: ['#ff8f5a', '#ffe2a6'], far: '#e9a878', mid: '#dca066', top: '#f0d49a', body: '#d9aa6c', body2: '#b98850', edge: '#f4dfae', accent: '#3fb6c9', glow: '#ffd27a', wood: '#9a6a44', dark: 0 },
    canyon:  { sky: ['#f2a85e', '#ffe9b8'], far: '#e39a6a', mid: '#c9744a', top: '#e8b46e', body: '#c8663c', body2: '#9a4530', edge: '#e08a56', accent: '#7fd070', glow: '#ffd27a', wood: '#8a5a3a', dark: 0 },
    snow:    { sky: ['#6f9ade', '#e9f5ff'], far: '#b9d2f0', mid: '#93b4dc', top: '#f6fbff', body: '#8fa3c4', body2: '#6f82a6', edge: '#c6e6fa', accent: '#a8dcf6', glow: '#c9f0ff', wood: '#6a5a50', dark: 0.08 },
    citadel: { sky: ['#231a38', '#6c3f5c'], far: '#3a2c4e', mid: '#4a3a5c', top: '#7a7088', body: '#5a5266', body2: '#3f384c', edge: '#8a8098', accent: '#ff7a3a', glow: '#b06aff', wood: '#4a3a3a', dark: 0.38 },
    throne:  { sky: ['#140f20', '#2a1c3c'], far: '#231a34', mid: '#30244a', top: '#6a5f80', body: '#453c5a', body2: '#2f2842', edge: '#7a2a4a', accent: '#ffcf4a', glow: '#b06aff', wood: '#3a2a3a', dark: 0.5 },
  };

  // soft ground shadow under an entity
  A.shadow = (ctx, x, y, rx, a) => { A.ell(ctx, x, y, rx, rx * 0.26); ctx.fillStyle = 'rgba(20,12,35,' + (a === undefined ? 0.26 : a) + ')'; ctx.fill(); };
})();
