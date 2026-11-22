'use strict';
/* 등불지기 — world art: terrain blocks, platforms, ladders, props/buildings, portal, beacon.
   Everything here draws in WORLD coordinates. A.solid / A.plat / A.ladder and all non-anim props are
   static + deterministic (seeded from position / seed) because the engine bakes them into chunk caches. */
(function () {
  const G = window.G, U = G.U, A = G.Art;
  const TAU = Math.PI * 2, PI = Math.PI;
  const OUT = A.OUT, LW = A.LW, fs = A.fs, rr = A.rr, ell = A.ell, poly = A.poly, shade = A.shade, mix = A.mix, rgba = A.rgba, glow = A.glow;
  const pal = (th) => A.PAL[th] || A.PAL.meadow;

  // ------------------------------------------------------------ deterministic helpers
  const hash2 = (x, y, s) => {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul((s | 0) + 1, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  };
  const cellRng = (i, j, s) => U.rng(hash2(i, j, s));
  const TS = {};
  const ts = (th) => TS[th] || (TS[th] = U.hash(th) & 0xffff);
  // world-space cell iterator: fn(rng, cellX, cellY, i, j) for every cw×ch cell touching the rect
  function cells(x, y, w, h, cw, ch, s, fn) {
    const i0 = Math.floor(x / cw), i1 = Math.floor((x + w) / cw), j0 = Math.floor(y / ch), j1 = Math.floor((y + h) / ch);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(cellRng(i, j, s), i * cw, j * ch, i, j);
  }
  const ln = (ctx, col, lw, pts) => {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  };
  // outlined stroke (dark casing + colored core), e.g. ropes, stems, poles
  const tube = (ctx, col, lw, build) => {
    build(); ctx.strokeStyle = OUT; ctx.lineWidth = lw + (lw < 3.2 ? 3.2 : LW * 2); ctx.stroke();
    build(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  };

  // ------------------------------------------------------------ caps
  // organic cap (grass / moss / sand / snow). o: {col, dark, hi, over, top, base, dep, sw}
  function cap(ctx, r, x, y, w, o) {
    const x0 = x - o.over, x1 = x + w + o.over, yt = y - o.top, yb = y + o.base, lb = [];
    let px = x1;
    while (px > x0 + 1) {
      let wv = o.sw * (0.7 + r() * 0.7);
      if (px - wv < x0 + o.sw * 0.6) wv = px - x0;
      lb.push(px - wv / 2, yb + o.dep * (0.5 + r() * 0.8) * 2, px - wv);
      px -= wv;
    }
    const path = () => {
      ctx.beginPath(); ctx.moveTo(x0, yb); ctx.quadraticCurveTo(x0 - 1.5, yt, x0 + 7, yt); ctx.lineTo(x1 - 7, yt); ctx.quadraticCurveTo(x1 + 1.5, yt, x1, yb);
      for (let i = 0; i < lb.length; i += 3) ctx.quadraticCurveTo(lb[i], lb[i + 1], lb[i + 2], yb);
      ctx.closePath();
    };
    path(); ctx.fillStyle = o.dark; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.beginPath(); ctx.moveTo(x0 - 3, yt - 3); ctx.lineTo(x1 + 3, yt - 3);
    for (let xx = x1 + 3; xx >= x0 - 12; xx -= 9) ctx.lineTo(xx, yb + 1 + Math.sin(xx * 0.13) * 1.6);
    ctx.closePath(); ctx.fillStyle = o.col; ctx.fill();
    let sx = x0 + 9;
    while (sx < x1 - 14) { const len = 22 + r() * 64, ex = Math.min(sx + len, x1 - 9); ln(ctx, o.hi, 2.2, [sx, yt + 3.4, ex, yt + 3.4]); sx += len + 7 + r() * 16; }
    ctx.restore();
    path(); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
  }
  const capO = (col, o) => Object.assign({ col, dark: shade(col, -0.2), hi: shade(col, 0.3), over: 4, top: 2.6, base: 7, dep: 8, sw: 20 }, o);
  // grass blades poking above the cap (world-tiled)
  function blades(ctx, col, x, y, w, s, top) {
    const i0 = Math.floor((x + 6) / 31), i1 = Math.floor((x + w - 6) / 31);
    for (let i = i0; i <= i1; i++) {
      const r = cellRng(i, 0, s + 77);
      if (r() > 0.42) continue;
      const bx = i * 31 + r() * 22;
      if (bx < x + 12 || bx > x + w - 12) continue;
      const hh = 6.5 + r() * 4, l1 = (r() - 0.5) * 4, yb = y - top + 3;
      ctx.beginPath(); ctx.moveTo(bx - 7, yb);
      ctx.lineTo(bx - 6.5 + l1, yb - hh * 0.72); ctx.lineTo(bx - 2.6, yb - 3.2);
      ctx.lineTo(bx + l1 * 0.6, yb - hh - 3); ctx.lineTo(bx + 2.6, yb - 3.2);
      ctx.lineTo(bx + 6.5 + l1, yb - hh * 0.8); ctx.lineTo(bx + 7, yb);
      ctx.closePath(); fs(ctx, shade(col, 0.1), 1.7);
    }
  }
  // angular rock ledge cap
  function capRock(ctx, r, x, y, w, col, hi, over, base, dep, seg) {
    const x0 = x - over, x1 = x + w + over;
    ctx.beginPath(); ctx.moveTo(x0, y - 1); ctx.lineTo(x1, y - 1); ctx.lineTo(x1 - 1, y + base);
    let px = x1 - 1;
    while (px > x0 + 2) {
      let wv = seg * (0.6 + r() * 0.9);
      if (px - wv < x0 + seg * 0.6) wv = px - x0 - 1;
      px -= wv;
      ctx.lineTo(px + wv * 0.4, y + base + dep * (0.3 + r() * 0.7)); ctx.lineTo(px, y + base + dep * r() * 0.5);
    }
    ctx.lineTo(x0, y + base * 0.8); ctx.closePath(); fs(ctx, col);
    ln(ctx, hi, 2.2, [x0 + 5, y + 2.7, x1 - 5, y + 2.7]);
  }

  // ------------------------------------------------------------ interior textures (all tile by world position)
  function dEarth(ctx, P, x, y, w, h, th) {
    cells(x, y, w, h, 104, 62, ts(th), (r, cx, cy) => {
      if (r() < 0.7) { const lx = cx + r() * 60, ly = cy + 8 + r() * 46, len = 14 + r() * 36; ln(ctx, rgba(P.body2, 0.55), 3, [lx, ly, lx + len, ly]); }
      const k = r();
      if (k < 0.5) {
        const px = cx + 12 + r() * 80, py = cy + 10 + r() * 42, rx = 5 + r() * 6, ry = rx * (0.62 + r() * 0.22);
        ell(ctx, px, py, rx, ry); ctx.fillStyle = P.edge; ctx.fill();
        ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0.12 * PI, 0.88 * PI); ctx.strokeStyle = rgba(P.body2, 0.85); ctx.lineWidth = 2; ctx.stroke();
      } else if (k < 0.85) { ell(ctx, cx + 10 + r() * 84, cy + 8 + r() * 46, 3 + r() * 3.5, 2.4 + r() * 2.4); ctx.fillStyle = P.body2; ctx.fill(); }
      ctx.fillStyle = rgba(P.body2, 0.7);
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(cx + r() * 104, cy + r() * 62, 1.4, 0, TAU); ctx.fill(); }
    });
  }
  function dSoil(ctx, P, x, y, w, h, th) { // forest: dark soil with roots
    cells(x, y, w, h, 150, 78, ts(th), (r, cx, cy) => {
      if (r() < 0.55) {
        const x0 = cx + r() * 90, y0 = cy + r() * 30, x1 = x0 + 44 + r() * 30, y1 = y0 + 26 + r() * 20;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + 14, y0 + 18, x0 + 30, y0 + 4, x1, y1);
        ctx.strokeStyle = rgba(P.edge, 0.8); ctx.lineWidth = 3.4; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x0 + 22, y0 + 10); ctx.quadraticCurveTo(x0 + 30, y0 + 24, x0 + 22 + r() * 14, y0 + 34);
        ctx.lineWidth = 2.2; ctx.stroke();
      }
      if (r() < 0.6) { ell(ctx, cx + 10 + r() * 130, cy + 8 + r() * 60, 4 + r() * 5, 3 + r() * 3); ctx.fillStyle = P.body2; ctx.fill(); }
      if (r() < 0.35) { const px = cx + 10 + r() * 120, py = cy + 10 + r() * 56, rx = 5 + r() * 5; ell(ctx, px, py, rx, rx * 0.7); ctx.fillStyle = rgba(P.edge, 0.8); ctx.fill(); }
      ctx.fillStyle = rgba(P.body2, 0.8);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx + r() * 150, cy + r() * 78, 1.5, 0, TAU); ctx.fill(); }
    });
  }
  function dMud(ctx, P, x, y, w, h, th) {
    cells(x, y, w, h, 112, 60, ts(th), (r, cx, cy) => {
      if (r() < 0.75) { const lx = cx + r() * 60, ly = cy + 8 + r() * 44, len = 18 + r() * 40; ln(ctx, rgba(P.edge, 0.6), 2.6, [lx, ly, lx + len, ly]); }
      if (r() < 0.5) { const lx = cx + r() * 70, ly = cy + 6 + r() * 48, len = 12 + r() * 30; ln(ctx, rgba(P.body2, 0.8), 3.2, [lx, ly, lx + len, ly]); }
      if (r() < 0.45) { const bx = cx + 10 + r() * 90, by = cy + 10 + r() * 40, br = 2.5 + r() * 3.5; ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.strokeStyle = rgba(P.edge, 0.85); ctx.lineWidth = 1.7; ctx.stroke(); }
      if (r() < 0.4) { ell(ctx, cx + r() * 100, cy + r() * 56, 5 + r() * 6, 3 + r() * 3); ctx.fillStyle = rgba(P.body2, 0.85); ctx.fill(); }
    });
  }
  function dRock(ctx, P, x, y, w, h, th) {
    cells(x, y, w, h, 120, 84, ts(th), (r, cx, cy) => {
      if (r() < 0.55) { const fx = cx + 10 + r() * 70, fy = cy + 8 + r() * 44, a = 14 + r() * 18; poly(ctx, [fx, fy, fx + a, fy - 5 - r() * 6, fx + a * 1.5, fy + 8 + r() * 6, fx + a * 0.5, fy + 14 + r() * 8]); ctx.fillStyle = rgba(P.edge, 0.3); ctx.fill(); }
      if (r() < 0.5) { const fx = cx + r() * 100, fy = cy + r() * 70, a = 10 + r() * 14; poly(ctx, [fx, fy, fx + a, fy + 3, fx + a * 0.8, fy + a * 0.6, fx + a * 0.1, fy + a * 0.5]); ctx.fillStyle = rgba(P.body2, 0.6); ctx.fill(); }
      if (r() < 0.45) { const fx = cx + r() * 90, fy = cy + r() * 50; ln(ctx, rgba(P.body2, 0.95), 2, [fx, fy, fx + 8 + r() * 8, fy + 10 + r() * 8, fx + 4 + r() * 6, fy + 22 + r() * 10, fx + 14 + r() * 8, fy + 32 + r() * 8]); }
      if (r() < 0.2) {
        const fx = cx + 12 + r() * 96, fy = cy + 10 + r() * 60, a = 4 + r() * 3.5, col = r() < 0.7 ? P.accent : '#c79bff';
        glow(ctx, fx, fy, a * 4.5, col, 0.35);
        poly(ctx, [fx, fy - a * 1.5, fx + a, fy, fx, fy + a * 1.5, fx - a, fy]); fs(ctx, col, 1.6, shade(col, -0.5));
        ln(ctx, '#ffffff', 1.2, [fx - a * 0.3, fy - a * 0.6, fx - a * 0.3, fy + a * 0.2]);
      }
    });
  }
  function dSandBlocks(ctx, P, x, y, w, h, th) {
    const bh = 46, bw = 92, s = ts(th), j0 = Math.floor(y / bh), j1 = Math.floor((y + h) / bh);
    for (let j = j0; j <= j1; j++) {
      const yy = j * bh, off = (j & 1) * (bw / 2), i0 = Math.floor((x - off) / bw), i1 = Math.floor((x + w - off) / bw);
      for (let i = i0; i <= i1; i++) {
        const bx = i * bw + off, r = cellRng(i, j, s), k = r();
        if (k < 0.2) { ctx.fillStyle = rgba(P.edge, 0.3); ctx.fillRect(bx + 1, yy + 1, bw - 2, bh - 2); }
        else if (k < 0.36) { ctx.fillStyle = rgba(P.body2, 0.28); ctx.fillRect(bx + 1, yy + 1, bw - 2, bh - 2); }
        if (r() < 0.09) { const mx = bx + bw / 2, my = yy + bh / 2; poly(ctx, [mx, my - 11, mx + 11, my, mx, my + 11, mx - 11, my]); ctx.strokeStyle = rgba(P.body2, 0.75); ctx.lineWidth = 2; ctx.stroke(); poly(ctx, [mx, my - 4.5, mx + 4.5, my, mx, my + 4.5, mx - 4.5, my]); ctx.fillStyle = rgba(P.body2, 0.6); ctx.fill(); }
        if (r() < 0.5) { const lx = bx + 8 + r() * 50, ly = yy + 9 + r() * 28; ln(ctx, rgba(P.body2, 0.45), 2.2, [lx, ly, lx + 10 + r() * 18, ly]); }
        ln(ctx, rgba(P.body2, 0.8), 2.2, [bx, yy, bx, yy + bh]);
      }
      ln(ctx, rgba(P.body2, 0.8), 2.2, [x, yy, x + w, yy]);
    }
  }
  function dStrata(ctx, P, x, y, w, h, th) {
    const s = ts(th), bandH = 30, j0 = Math.floor(y / bandH) - 1, j1 = Math.floor((y + h) / bandH) + 1;
    for (let j = j0; j <= j1; j++) {
      const r = cellRng(j, 7, s), k = r();
      const col = k < 0.32 ? rgba(P.body2, 0.42) : k < 0.58 ? rgba(P.edge, 0.42) : k < 0.72 ? rgba(P.top, 0.26) : null;
      const y0 = j * bandH + r() * 10, tk = 7 + r() * 15, ph = r() * 6, amp = 2 + r() * 3, fq = 0.011 + r() * 0.012;
      if (!col) continue;
      ctx.beginPath(); ctx.moveTo(x - 4, y0 + Math.sin((x - 4) * fq + ph) * amp);
      for (let xx = x - 4; xx <= x + w + 14; xx += 12) ctx.lineTo(xx, y0 + Math.sin(xx * fq + ph) * amp);
      for (let xx = x + w + 14; xx >= x - 16; xx -= 12) ctx.lineTo(xx, y0 + tk + Math.sin(xx * fq * 1.3 + ph + 1) * amp);
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    }
    cells(x, y, w, h, 130, 70, s, (r, cx, cy) => {
      if (r() < 0.5) { const fx = cx + r() * 110, fy = cy + r() * 40; ln(ctx, rgba(P.body2, 0.85), 2, [fx, fy, fx + 3 - r() * 6, fy + 10 + r() * 8, fx + 2 + r() * 5, fy + 20 + r() * 12]); }
      if (r() < 0.4) { ell(ctx, cx + r() * 120, cy + r() * 64, 3 + r() * 4, 2 + r() * 2); ctx.fillStyle = rgba(P.body2, 0.7); ctx.fill(); }
    });
  }
  function dIce(ctx, P, x, y, w, h, th) {
    cells(x, y, w, h, 110, 76, ts(th), (r, cx, cy) => {
      if (r() < 0.62) { const fx = cx + 6 + r() * 70, fy = cy + 6 + r() * 40, a = 16 + r() * 22; poly(ctx, [fx, fy + a * 0.9, fx + a * 0.5, fy, fx + a * 1.2, fy + a * 0.6]); ctx.fillStyle = rgba(P.edge, 0.38); ctx.fill(); }
      if (r() < 0.5) { const fx = cx + r() * 80, fy = cy + r() * 46, a = 14 + r() * 18; poly(ctx, [fx, fy, fx + a, fy + a * 0.25, fx + a * 0.35, fy + a * 0.9]); ctx.fillStyle = rgba(P.body2, 0.42); ctx.fill(); }
      if (r() < 0.4) { const fx = cx + r() * 90, fy = cy + r() * 50; ln(ctx, 'rgba(255,255,255,0.55)', 1.8, [fx, fy, fx + 9 + r() * 8, fy + 9 + r() * 8, fx + 5 + r() * 8, fy + 20 + r() * 10]); }
      if (r() < 0.18) { const fx = cx + 10 + r() * 90, fy = cy + 10 + r() * 56; A.star(ctx, fx, fy, 4.5, 1.4, 4, 0); ctx.fillStyle = '#ffffff'; ctx.fill(); }
    });
  }
  function dBricks(ctx, P, x, y, w, h, th) {
    const bh = 26, bw = 58, s = ts(th), j0 = Math.floor(y / bh), j1 = Math.floor((y + h) / bh);
    for (let j = j0; j <= j1; j++) {
      const yy = j * bh, off = (j & 1) * (bw / 2), i0 = Math.floor((x - off) / bw), i1 = Math.floor((x + w - off) / bw);
      for (let i = i0; i <= i1; i++) {
        const bx = i * bw + off, r = cellRng(i, j, s), k = r();
        if (k < 0.16) { ctx.fillStyle = rgba(P.edge, 0.22); ctx.fillRect(bx + 1, yy + 1, bw - 2, bh - 2); }
        else if (k < 0.36) { ctx.fillStyle = rgba(P.body2, 0.42); ctx.fillRect(bx + 1, yy + 1, bw - 2, bh - 2); }
        if (r() < 0.12) ln(ctx, rgba(P.body2, 0.95), 1.8, [bx + 14 + r() * 20, yy + 3, bx + 20 + r() * 16, yy + 12, bx + 15 + r() * 20, yy + 23]);
        if (r() < 0.05) glow(ctx, bx + bw / 2, yy + bh / 2, 16, P.glow, 0.16);
        ln(ctx, P.body2, 2.2, [bx, yy, bx, yy + bh]);
      }
      ln(ctx, P.body2, 2.2, [x, yy, x + w, yy]);
    }
  }
  function dMarble(ctx, P, x, y, w, h, th) {
    const T = 84;
    cells(x, y, w, h, T, T, ts(th), (r, cx, cy, i, j) => {
      if ((i + j) & 1) { ctx.fillStyle = rgba(P.body2, 0.45); ctx.fillRect(cx, cy, T, T); }
      ln(ctx, 'rgba(255,255,255,0.06)', 9, [cx + 12 + r() * 18, cy + T - 6, cx + 44 + r() * 18, cy + 6]);
      if (r() < 0.6) { const vx = cx + 8 + r() * 44, vy = cy + 14 + r() * 50; ln(ctx, rgba(shade(P.body, 0.32), 0.6), 1.6, [vx, vy, vx + 10 + r() * 8, vy + 6 - r() * 14, vx + 24 + r() * 10, vy + 2 - r() * 10]); }
      ctx.strokeStyle = P.body2; ctx.lineWidth = 2; ctx.strokeRect(cx, cy, T, T);
    });
  }

  // ------------------------------------------------------------ solids
  // soft (outdoor) block: body + world-tiled detail + organic cap. The body runs a little below its bottom edge
  // (no bottom outline) so a block resting on another one merges into it and hides the lower block's cap.
  // Which stretches of a block's bottom edge rest on another solid of its map? Looked up by geometry in G.MAPS
  // (stateless, so chunked redraws agree). Returns merged [x0,x1] spans, or null when the block is not map data.
  let SOL = null;
  function restSpans(x, y, w, h) {
    if (!SOL) { SOL = []; const M = G.MAPS || {}; for (const id in M) { const s = M[id] && M[id].solids; if (s && s.length) SOL.push({ s, h: M[id].h || 1e9 }); } }
    const yb = y + h, spans = [];
    let found = false;
    for (const m of SOL) {
      let has = false;
      for (const b of m.s) if (b[0] === x && b[1] === y && b[2] === w && b[3] === h) { has = true; break; }
      if (!has) continue;
      found = true;
      if (yb >= m.h - 0.5) { spans.push([x, x + w]); continue; } // runs off the bottom of the map
      for (const b of m.s) if (Math.abs(b[1] - yb) <= 1.5 && b[0] < x + w && b[0] + b[2] > x) spans.push([Math.max(x, b[0]), Math.min(x + w, b[0] + b[2])]);
    }
    if (!found) return null;
    spans.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const s of spans) { if (out.length && s[0] <= out[out.length - 1][1] + 0.5) out[out.length - 1][1] = Math.max(out[out.length - 1][1], s[1]); else out.push(s); }
    return out;
  }
  function softSolid(ctx, P, th, x, y, w, h, c, detail, pre, post) {
    const ext = c.base + c.dep + 6, yb = y + h, sp = restSpans(x, y, w, h);
    const spans = sp === null ? [[x, x + w]] : sp; // unknown block → assume it stands on something
    const round = spans.length === 0 && h < 50;    // thin free-floating slab
    const body = () => {
      ctx.beginPath();
      if (round) ctx.roundRect(x, y + 1, w, h - 1, [0, 0, 12, 12]); else ctx.rect(x, y + 1, w, h - 1);
      for (const s of spans) { const a = s[0] > x + 0.5 ? s[0] + 1.3 : s[0], b = s[1] < x + w - 0.5 ? s[1] - 1.3 : s[1]; if (b > a) ctx.rect(a, yb - 1, b - a, ext + 1); }
    };
    body(); ctx.fillStyle = P.body; ctx.fill();
    ctx.save(); ctx.clip();
    detail(ctx, P, x, y, w, h + ext, th);
    ctx.fillStyle = rgba(P.edge, 0.28); ctx.fillRect(x + 1.3, y, 5, h);
    ctx.fillStyle = rgba(P.body2, 0.5); ctx.fillRect(x + w - 8.3, y, 7, h);
    ctx.fillStyle = rgba(P.body2, 0.4); ctx.fillRect(x, y, w, c.base + c.dep + 5);
    ctx.restore();
    ctx.lineWidth = LW; ctx.strokeStyle = OUT;
    if (round) { ctx.beginPath(); ctx.roundRect(x, y + 1, w, h - 1, [0, 0, 12, 12]); ctx.stroke(); }
    else {
      const restL = spans.length > 0 && spans[0][0] <= x + 0.5, restR = spans.length > 0 && spans[spans.length - 1][1] >= x + w - 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y + 3); ctx.lineTo(x, restL ? yb + c.base + 2 : yb);
      ctx.moveTo(x + w, y + 3); ctx.lineTo(x + w, restR ? yb + c.base + 2 : yb);
      let fx = x;
      for (const s of spans) { if (s[0] > fx + 0.5) { ctx.moveTo(fx, yb); ctx.lineTo(s[0], yb); } fx = s[1]; }
      if (fx < x + w - 0.5) { ctx.moveTo(fx, yb); ctx.lineTo(x + w, yb); }
      ctx.stroke();
    }
    if (pre) pre(ctx, P, x, y, w, th);
    cap(ctx, U.rng(th + ':' + x + ':' + y + ':' + w), x, y, w, c);
    if (post) post(ctx, P, x, y, w, th);
  }
  // hard (rock / masonry) block: fully outlined, hard cap
  function hardSolid(ctx, P, th, x, y, w, h, detail, capFn) {
    ctx.beginPath(); ctx.rect(x, y + 1, w, h - 1); ctx.fillStyle = P.body; ctx.fill();
    ctx.save(); ctx.clip();
    detail(ctx, P, x, y, w, h, th);
    ctx.fillStyle = rgba(P.edge, 0.2); ctx.fillRect(x + 1.3, y, 5, h);
    ctx.fillStyle = rgba(P.body2, 0.5); ctx.fillRect(x + w - 8.3, y, 7, h);
    ctx.restore();
    ctx.beginPath(); ctx.rect(x, y + 1, w, h - 1); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    capFn(ctx, P, x, y, w, h, th);
  }
  const CAPS = {};
  const capFor = (th) => {
    if (CAPS[th]) return CAPS[th];
    const P = pal(th);
    let c;
    if (th === 'forest') c = capO(P.top, { base: 8, dep: 9, sw: 19 });
    else if (th === 'marsh') c = capO(P.top, { base: 7, dep: 9, sw: 15 });
    else if (th === 'oasis') c = capO(P.top, { base: 6, dep: 4.5, sw: 36, top: 2, dark: mix(P.top, P.body2, 0.4), hi: shade(P.top, 0.45) });
    else if (th === 'canyon') c = capO(P.top, { base: 6, dep: 5.5, sw: 30, top: 2, dark: mix(P.top, P.body2, 0.45), hi: shade(P.top, 0.4) });
    else if (th === 'snow') c = capO(P.top, { base: 9, dep: 9, sw: 26, top: 3.4, over: 5, dark: '#c2daf4', hi: '#ffffff' });
    else c = capO(P.top, {});
    return (CAPS[th] = c);
  };
  const SOLID = {
    meadow(ctx, P, th, x, y, w, h) {
      softSolid(ctx, P, th, x, y, w, h, capFor(th), dEarth, (c, p, bx, by, bw) => blades(c, p.top, bx, by, bw, ts(th), 2.6));
    },
    town(ctx, P, th, x, y, w, h) {
      softSolid(ctx, P, th, x, y, w, h, capFor(th), dEarth, (c, p, bx, by, bw) => blades(c, p.top, bx, by, bw, ts(th), 2.6), (c, p, bx, by, bw) => {
        const i0 = Math.floor((bx + 10) / 44), i1 = Math.floor((bx + bw - 10) / 44);
        for (let i = i0; i <= i1; i++) {
          const r = cellRng(i, 1, ts(th) + 99);
          if (r() > 0.62) continue;
          const sx = i * 44 + r() * 16, sw = 13 + r() * 11;
          if (sx < bx + 8 || sx + sw > bx + bw - 8) continue;
          rr(c, sx, by - 2.4, sw, 6.6, 3); fs(c, r() < 0.5 ? '#d9d2c5' : '#c4bcae', 1.8);
        }
      });
    },
    forest(ctx, P, th, x, y, w, h) {
      softSolid(ctx, P, th, x, y, w, h, capFor(th), dSoil, (c, p, bx, by, bw) => blades(c, p.top, bx, by, bw, ts(th), 2.6), (c, p, bx, by, bw) => {
        // hanging moss strands under the cap
        const i0 = Math.floor((bx + 8) / 58), i1 = Math.floor((bx + bw - 8) / 58);
        for (let i = i0; i <= i1; i++) {
          const r = cellRng(i, 2, ts(th) + 5);
          if (r() > 0.5) continue;
          const sx = i * 58 + r() * 40, len = 10 + r() * 16;
          if (sx < bx + 8 || sx > bx + bw - 8) continue;
          tube(c, shade(p.top, -0.1), 2.6, () => { c.beginPath(); c.moveTo(sx, by + 12); c.quadraticCurveTo(sx + 3, by + 12 + len * 0.6, sx - 1, by + 12 + len); });
          ell(c, sx - 1, by + 13 + len, 3, 3.6); fs(c, shade(p.top, 0.12), 1.6);
        }
      });
    },
    marsh(ctx, P, th, x, y, w, h) { softSolid(ctx, P, th, x, y, w, h, capFor(th), dMud, (c, p, bx, by, bw) => blades(c, p.top, bx, by, bw, ts(th), 2.6)); },
    oasis(ctx, P, th, x, y, w, h) { softSolid(ctx, P, th, x, y, w, h, capFor(th), dSandBlocks); },
    canyon(ctx, P, th, x, y, w, h) { softSolid(ctx, P, th, x, y, w, h, capFor(th), dStrata); },
    snow(ctx, P, th, x, y, w, h) { softSolid(ctx, P, th, x, y, w, h, capFor(th), dIce); },
    cave(ctx, P, th, x, y, w, h) {
      hardSolid(ctx, P, th, x, y, w, h, dRock, (c, p, bx, by, bw, bh) => {
        const r = U.rng(th + ':' + bx + ':' + by + ':' + bw);
        if (by <= 0) { // ceiling block: stalactites under the bottom edge
          let sx = bx + 14 + r() * 30;
          const yb = by + bh;
          while (sx < bx + bw - 24) {
            const sw = 12 + r() * 12, len = 14 + r() * 34;
            poly(c, [sx, yb - 1, sx + sw, yb - 1, sx + sw * (0.35 + r() * 0.3), yb + len]); fs(c, p.body);
            ln(c, rgba(p.edge, 0.7), 2, [sx + 3.5, yb + 2, sx + sw * 0.42, yb + len * 0.6]);
            sx += sw + 16 + r() * 70;
          }
          return;
        }
        c.fillStyle = rgba(p.edge, 0.22); c.fillRect(bx + 1.3, by + 6, bw - 2.6, 20);
        capRock(c, r, bx, by, bw, p.top, shade(p.top, 0.3), 3, 8, 7, 28);
      });
    },
    citadel(ctx, P, th, x, y, w, h) {
      hardSolid(ctx, P, th, x, y, w, h, dBricks, (c, p, bx, by, bw) => {
        const i0 = Math.floor(bx / 18), i1 = Math.floor((bx + bw) / 18);
        for (let i = i0; i <= i1; i++) { const dx = i * 18 + 4; if (dx < bx + 2 || dx + 9 > bx + bw - 2) continue; rr(c, dx, by + 8, 9, 7.5, 1.5); fs(c, shade(p.top, -0.22), 1.8); }
        rr(c, bx - 5, by - 1, bw + 10, 10.5, 2.5); fs(c, p.top);
        ln(c, shade(p.top, 0.25), 2.2, [bx - 1, by + 2.7, bx + bw + 1, by + 2.7]);
        const k0 = Math.floor(bx / 66), k1 = Math.floor((bx + bw) / 66);
        for (let k = k0; k <= k1; k++) { const jx = k * 66 + 20; if (jx > bx + 4 && jx < bx + bw - 4) ln(c, rgba(p.body2, 0.85), 1.8, [jx, by + 0.8, jx, by + 8.4]); }
      });
    },
    throne(ctx, P, th, x, y, w, h) {
      hardSolid(ctx, P, th, x, y, w, h, dMarble, (c, p, bx, by, bw) => {
        rr(c, bx - 4, by + 8.5, bw + 8, 10.5, 2); fs(c, p.edge, 2.2);
        c.fillStyle = p.accent; c.fillRect(bx - 2.6, by + 12.4, bw + 5.2, 2.6);
        rr(c, bx - 6, by - 1, bw + 12, 10.5, 3); fs(c, p.top);
        ln(c, shade(p.top, 0.3), 2.2, [bx, by + 2.7, bx + bw, by + 2.7]);
      });
    },
  };
  A.solid = function (ctx, theme, x, y, w, h) {
    const th = SOLID[theme] ? theme : 'meadow';
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    SOLID[th](ctx, pal(th), th, x, y, w, h);
    ctx.restore();
  };

  // ------------------------------------------------------------ platforms (top exactly at y)
  function pebbleRow(ctx, P, r, x, y, w, n) {
    for (let i = 0; i < n; i++) { const px = x + 14 + r() * (w - 28), py = y + 13 + r() * 9, rx = 3 + r() * 4; ell(ctx, px, py, rx, rx * 0.7); ctx.fillStyle = r() < 0.5 ? P.edge : P.body2; ctx.fill(); }
  }
  const PLAT = {
    meadow(ctx, P, th, r, x, y, w) {
      const n = Math.max(2, Math.round(w / 66)), lb = [];
      for (let i = 0; i < n; i++) {
        const xb = x + 2 + ((w - 4) * (i + 1)) / n, xa = x + 2 + ((w - 4) * i) / n, c = 1 - Math.abs((i + 0.5) / n - 0.5) * 1.3;
        const d = (21 + r() * 9) * (0.52 + c * 0.6);
        lb.push((xa + xb) / 2 + (r() - 0.5) * 8, y + 9 + d, xb, y + 9 + (i === n - 1 ? -4 : r() * 5));
      }
      const clod = () => { ctx.beginPath(); ctx.moveTo(x + 2, y + 5); for (let i = 0; i < lb.length; i += 4) ctx.quadraticCurveTo(lb[i], lb[i + 1] * 2 - (y + 9), lb[i + 2], lb[i + 3]); ctx.closePath(); };
      for (let i = 0; i < lb.length; i += 4) if (r() < 0.55) { // dangling roots (behind the clod)
        const rx = lb[i] + (r() - 0.5) * 6, ry = lb[i + 1] - 5, len = 9 + r() * 8;
        tube(ctx, P.body2, 2, () => { ctx.beginPath(); ctx.moveTo(rx, ry); ctx.quadraticCurveTo(rx + 4, ry + len * 0.6, rx - 2, ry + len); });
      }
      clod(); fs(ctx, P.body);
      ctx.save(); ctx.clip();
      ctx.fillStyle = rgba(P.body2, 0.4); ctx.fillRect(x, y + 26, w, 30);
      pebbleRow(ctx, P, r, x, y, w, Math.round(w / 50));
      ctx.restore();
      clod(); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
      blades(ctx, P.top, x, y, w, ts(th), 2.6);
      cap(ctx, r, x, y, w, capO(P.top, { base: 6, dep: 7, sw: 17 }));
    },
    town(ctx, P, th, r, x, y, w) {
      const wd = P.wood, dk = shade(wd, -0.28);
      poly(ctx, [x + 12, y + 16, x + 12, y + 36, x + 34, y + 16]); fs(ctx, dk);
      poly(ctx, [x + w - 12, y + 16, x + w - 12, y + 36, x + w - 34, y + 16]); fs(ctx, dk);
      rr(ctx, x + 8, y + 9, w - 16, 8.5, 2.5); fs(ctx, shade(wd, -0.16));
      rr(ctx, x - 4, y, w + 8, 11, 3); fs(ctx, wd);
      ln(ctx, shade(wd, 0.3), 2, [x, y + 3.2, x + w, y + 3.2]);
      const n = Math.max(2, Math.round(w / 42));
      for (let i = 1; i < n; i++) { const px = x - 4 + ((w + 8) * i) / n; ln(ctx, dk, 2, [px, y + 1.4, px, y + 9.6]); ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(px - 6, y + 6.6, 1.3, 0, TAU); ctx.arc(px + 6, y + 6.6, 1.3, 0, TAU); ctx.fill(); }
    },
    forest(ctx, P, th, r, x, y, w) {
      const wd = P.wood, lt = shade(wd, 0.2);
      // twig with leaves at the right end
      tube(ctx, wd, 4, () => { ctx.beginPath(); ctx.moveTo(x + w - 4, y + 12); ctx.quadraticCurveTo(x + w + 12, y + 8, x + w + 20, y - 8); });
      ell(ctx, x + w + 24, y - 12, 9, 5.2, -0.7); fs(ctx, P.top, 2);
      ell(ctx, x + w + 13, y - 3, 7.5, 4.4, 0.5); fs(ctx, shade(P.top, 0.14), 2);
      // hanging vines
      for (let i = 0, k = 1 + ((r() * 3) | 0); i < k; i++) {
        const vx = x + 20 + r() * (w - 40), len = 14 + r() * 20;
        tube(ctx, shade(P.top, -0.12), 2.4, () => { ctx.beginPath(); ctx.moveTo(vx, y + 24); ctx.quadraticCurveTo(vx + 4, y + 24 + len * 0.6, vx - 1, y + 24 + len); });
        ell(ctx, vx - 1, y + 25 + len, 3.2, 4); fs(ctx, shade(P.top, 0.12), 1.6);
      }
      rr(ctx, x - 6, y + 2, w + 12, 27, 13); fs(ctx, wd);
      for (let i = 0, k = Math.round(w / 34); i < k; i++) { const bx = x + 8 + r() * (w - 30), by = y + 12 + r() * 13; ln(ctx, i % 3 ? lt : shade(wd, -0.25), 2.2, [bx, by, bx + 8 + r() * 18, by + (r() - 0.5) * 2]); }
      if (w > 150) { const kx = x + w * (0.35 + r() * 0.3); ell(ctx, kx, y + 18, 5, 3.6); fs(ctx, shade(wd, -0.25), 1.8); }
      ell(ctx, x - 1, y + 15.5, 7.5, 12.5); fs(ctx, '#d2a877');
      ell(ctx, x - 1, y + 15.5, 3.8, 7); ctx.strokeStyle = '#a57a4e'; ctx.lineWidth = 1.8; ctx.stroke();
      cap(ctx, r, x + 6, y, w - 8, capO(P.top, { base: 5, dep: 6, sw: 15, over: 2 }));
    },
    marsh(ctx, P, th, r, x, y, w) {
      const wd = P.wood, dk = shade(wd, -0.26), posts = w > 300 ? [x + 18, x + w / 2, x + w - 18] : [x + 18, x + w - 18];
      for (const px of posts) {
        rr(ctx, px - 5.5, y + 6, 11, 35, 3); fs(ctx, dk);
        ln(ctx, '#d8c49a', 2, [px - 5, y + 15, px + 5, y + 16.5]); ln(ctx, '#d8c49a', 2, [px - 5, y + 19.5, px + 5, y + 21]);
      }
      rr(ctx, x + 4, y + 9, w - 8, 7.5, 2.5); fs(ctx, shade(wd, -0.14));
      for (let i = 0, k = 1 + ((r() * 2) | 0); i < k; i++) { // hanging moss
        const mx = x + 30 + r() * (w - 60), len = 9 + r() * 12;
        ctx.beginPath(); ctx.moveTo(mx - 9, y + 16); ctx.quadraticCurveTo(mx - 5, y + 16 + len * 1.6, mx, y + 17); ctx.quadraticCurveTo(mx + 5, y + 16 + len, mx + 9, y + 16); ctx.closePath(); fs(ctx, shade(P.top, -0.1), 2);
      }
      const n = Math.max(3, Math.round((w + 8) / 27)), bw = (w + 8) / n;
      for (let i = 0; i < n; i++) {
        const bx = x - 4 + i * bw, jy = r() * 1.4;
        rr(ctx, bx + 0.6, y + jy, bw - 1.2, 10.5, 2.6); fs(ctx, i % 2 ? shade(wd, 0.08) : wd, 2.2);
        ln(ctx, shade(wd, 0.3), 1.8, [bx + 4, y + jy + 3.2, bx + bw - 4, y + jy + 3.2]);
        ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(bx + bw / 2, y + jy + 7, 1.2, 0, TAU); ctx.fill();
      }
    },
    cave(ctx, P, th, r, x, y, w) {
      const pts = [x - 3, y, x + w + 3, y, x + w - 1, y + 11 + r() * 5], n = Math.max(2, Math.round(w / 44));
      for (let i = n - 1; i >= 1; i--) { const c = 1 - Math.abs(i / n - 0.5) * 1.4; pts.push(x + (w * i) / n + (r() - 0.5) * 14, y + 13 + (8 + r() * 9) * (0.45 + c * 0.7)); }
      pts.push(x + 1, y + 11 + r() * 5);
      if (r() < 0.8) { const sx = x + w * (0.3 + r() * 0.4), len = 9 + r() * 12; poly(ctx, [sx - 6, y + 20, sx + 6, y + 20, sx + (r() - 0.5) * 4, y + 26 + len]); fs(ctx, P.body); }
      poly(ctx, pts); fs(ctx, P.body);
      ctx.save(); poly(ctx, pts); ctx.clip();
      ctx.fillStyle = P.top; ctx.fillRect(x - 6, y, w + 12, 7);
      ctx.fillStyle = rgba(P.body2, 0.5); ctx.fillRect(x + w - 16, y, 22, 40);
      for (let i = 0, k = Math.round(w / 70); i < k; i++) { const fx = x + 14 + r() * (w - 40), fy = y + 9; ln(ctx, rgba(P.body2, 0.95), 2, [fx, fy, fx + 5 + r() * 6, fy + 6 + r() * 4, fx + 2 + r() * 5, fy + 13 + r() * 5]); }
      ctx.restore();
      ln(ctx, shade(P.top, 0.28), 2.2, [x + 4, y + 2.7, x + w - 4, y + 2.7]);
      poly(ctx, pts); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
      if (r() < 0.6) { const fx = x + 20 + r() * (w - 40), fy = y + 14, a = 3.6, col = r() < 0.7 ? P.accent : '#c79bff'; glow(ctx, fx, fy, 15, col, 0.4); poly(ctx, [fx, fy - a * 1.5, fx + a, fy, fx, fy + a * 1.5, fx - a, fy]); fs(ctx, col, 1.5, shade(col, -0.5)); }
    },
    oasis(ctx, P, th, r, x, y, w) {
      const cols = [P.accent, '#f6ead0', '#e2674a', '#f6ead0', '#f3c95c', '#f6ead0'], bam = '#d9b36a';
      rr(ctx, x - 14, y + 1.5, 16, 7, 3.5); fs(ctx, bam, 2.2); rr(ctx, x + w - 2, y + 1.5, 16, 7, 3.5); fs(ctx, bam, 2.2);
      const n = Math.max(3, Math.round(w / 23)), sw = w / n;
      for (let i = 0; i < n; i++) { // valance lobes
        const sx = x + i * sw, c = cols[i % cols.length];
        ctx.beginPath(); ctx.moveTo(sx, y + 7); ctx.lineTo(sx, y + 15); ctx.quadraticCurveTo(sx + sw / 2, y + 27, sx + sw, y + 15); ctx.lineTo(sx + sw, y + 7); ctx.closePath(); fs(ctx, shade(c, -0.12), 2.2);
        ctx.fillStyle = '#f3c95c'; ctx.beginPath(); ctx.arc(sx + sw / 2, y + 22.5, 1.9, 0, TAU); ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = OUT; ctx.stroke();
      }
      ctx.save(); rr(ctx, x - 3, y, w + 6, 9.5, 2.5); ctx.clip();
      for (let i = 0; i < n; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(x + i * sw - (i ? 0 : 3), y - 1, sw + (i === n - 1 || !i ? 3 : 0.5), 12); }
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - 3, y + 1.6, w + 6, 2.2);
      ctx.restore();
      rr(ctx, x - 3, y, w + 6, 9.5, 2.5); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
      ln(ctx, '#8a6a44', 2, [x - 8, y + 1.5, x - 5, y + 8.5]); ln(ctx, '#8a6a44', 2, [x + w + 5, y + 1.5, x + w + 8, y + 8.5]);
    },
    canyon(ctx, P, th, r, x, y, w) {
      const pts = [x - 4, y, x + w + 4, y, x + w + 2, y + 8, x + w - 3 - r() * 4, y + 17 + r() * 5], n = Math.max(2, Math.round(w / 56));
      for (let i = n - 1; i >= 1; i--) pts.push(x + (w * i) / n + (r() - 0.5) * 12, y + 19 + r() * 6);
      pts.push(x + 3 + r() * 4, y + 17 + r() * 5, x - 2, y + 8);
      poly(ctx, pts); fs(ctx, P.body);
      ctx.save(); poly(ctx, pts); ctx.clip();
      ctx.fillStyle = rgba(P.body2, 0.5); ctx.fillRect(x - 6, y + 15, w + 12, 16);
      ctx.fillStyle = rgba(P.edge, 0.55); ctx.fillRect(x - 6, y + 6, w + 12, 4.5);
      ctx.fillStyle = P.top; ctx.fillRect(x - 6, y, w + 12, 6);
      for (let i = 0, k = Math.round(w / 80); i < k; i++) { const fx = x + 14 + r() * (w - 30); ln(ctx, rgba(P.body2, 0.9), 2, [fx, y + 8, fx + 3 - r() * 6, y + 15 + r() * 6]); }
      ctx.restore();
      ln(ctx, shade(P.top, 0.4), 2.2, [x + 3, y + 2.7, x + w - 3, y + 2.7]);
      poly(ctx, pts); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    },
    snow(ctx, P, th, r, x, y, w) {
      const ice = P.accent, n = Math.max(2, Math.round(w / 40));
      for (let i = 0, k = Math.max(2, Math.round(w / 46)); i < k; i++) { // icicles
        const ix = x + 12 + ((w - 24) * (i + r() * 0.7)) / k, len = 9 + r() * 19, iw = 4 + r() * 2.5;
        poly(ctx, [ix - iw, y + 15, ix + iw, y + 15, ix + (r() - 0.5) * 2, y + 17 + len]); fs(ctx, P.edge, 2);
        ln(ctx, '#ffffff', 1.4, [ix - iw * 0.35, y + 17, ix - iw * 0.1, y + 15 + len * 0.55]);
      }
      const pts = [x - 2, y + 3, x + w + 2, y + 3, x + w - 2, y + 12 + r() * 4];
      for (let i = n - 1; i >= 1; i--) pts.push(x + (w * i) / n + (r() - 0.5) * 12, y + 15 + r() * 7);
      pts.push(x + 2, y + 12 + r() * 4);
      poly(ctx, pts); fs(ctx, ice);
      ctx.save(); poly(ctx, pts); ctx.clip();
      for (let i = 0, k = Math.round(w / 34); i < k; i++) { const fx = x + r() * w, a = 9 + r() * 10; poly(ctx, [fx, y + 22, fx + a * 0.6, y + 8, fx + a * 1.3, y + 22]); ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.5)' : rgba(P.body2, 0.35); ctx.fill(); }
      ctx.restore();
      poly(ctx, pts); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
      cap(ctx, r, x, y, w, capO(P.top, { base: 6, dep: 6.5, sw: 21, top: 3.4, over: 5, dark: '#c2daf4', hi: '#ffffff' }));
    },
    citadel(ctx, P, th, r, x, y, w) {
      const n = Math.max(1, Math.round(w / 120)), aw = w / n;
      ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x + w, y + 6); ctx.lineTo(x + w, y + 31);
      for (let i = n - 1; i >= 0; i--) { const xa = x + i * aw; ctx.lineTo(xa + aw - 9, y + 31); ctx.quadraticCurveTo(xa + aw / 2, y + 5 + 6, xa + 9, y + 31); ctx.lineTo(xa, y + 31); }
      ctx.closePath(); fs(ctx, P.body);
      ctx.save(); ctx.clip();
      ctx.fillStyle = rgba(P.body2, 0.45); ctx.fillRect(x, y + 22, w, 12);
      for (let bx = Math.floor(x / 34) * 34 + 17; bx < x + w; bx += 34) if (bx > x + 3) ln(ctx, P.body2, 2, [bx, y + 10, bx, y + 21]);
      ln(ctx, P.body2, 2, [x, y + 21, x + w, y + 21]);
      ctx.restore();
      for (let i = 0; i < n; i++) { const kx = x + i * aw + aw / 2; poly(ctx, [kx - 6, y + 10, kx + 6, y + 10, kx + 4.4, y + 19.5, kx - 4.4, y + 19.5]); fs(ctx, shade(P.top, 0.06), 2); }
      rr(ctx, x - 5, y, w + 10, 10.5, 2.5); fs(ctx, P.top);
      ln(ctx, shade(P.top, 0.25), 2.2, [x - 1, y + 2.7, x + w + 1, y + 2.7]);
      for (let jx = Math.floor(x / 66) * 66 + 20; jx < x + w - 4; jx += 66) if (jx > x + 4) ln(ctx, rgba(P.body2, 0.85), 1.8, [jx, y + 0.8, jx, y + 8.6]);
    },
    throne(ctx, P, th, r, x, y, w) {
      // crimson drape with swags
      const n = Math.max(1, Math.round(w / 90)), x0 = x + 10, x1 = x + w - 10, sw = (x1 - x0) / n;
      ctx.beginPath(); ctx.moveTo(x0, y + 12); ctx.lineTo(x1, y + 12); ctx.lineTo(x1, y + 30); ctx.lineTo(x1 - 6, y + 24); ctx.lineTo(x1 - 12, y + 30);
      for (let i = n - 1; i >= 0; i--) { const xa = x0 + i * sw + (i ? 0 : 12), xb = x0 + (i + 1) * sw - (i === n - 1 ? 12 : 0); ctx.lineTo(xb, y + 18); ctx.quadraticCurveTo((xa + xb) / 2, y + 34, xa, y + 18); }
      ctx.lineTo(x0 + 12, y + 30); ctx.lineTo(x0 + 6, y + 24); ctx.lineTo(x0, y + 30); ctx.closePath(); fs(ctx, P.edge);
      for (let i = 0; i < n; i++) { const xa = x0 + i * sw + (i ? 0 : 12), xb = x0 + (i + 1) * sw - (i === n - 1 ? 12 : 0); ctx.beginPath(); ctx.moveTo(xa + 3, y + 17.5); ctx.quadraticCurveTo((xa + xb) / 2, y + 29.5, xb - 3, y + 17.5); ctx.strokeStyle = P.accent; ctx.lineWidth = 1.8; ctx.stroke(); }
      rr(ctx, x - 5, y, w + 10, 14.5, 3); fs(ctx, P.top);
      ctx.fillStyle = P.accent; ctx.fillRect(x - 3.6, y + 9.4, w + 7.2, 2.8);
      ln(ctx, shade(P.top, 0.3), 2.2, [x, y + 3, x + w, y + 3]);
    },
  };
  A.plat = function (ctx, theme, x, y, w) {
    const th = PLAT[theme] ? theme : 'meadow';
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    PLAT[th](ctx, pal(th), th, U.rng('p:' + th + ':' + x + ':' + y + ':' + w), x, y, w);
    ctx.restore();
  };

  // ------------------------------------------------------------ ladders
  function ladRope(ctx, x, y1, y2, col, knot, icy) {
    rr(ctx, x - 8, y1 - 6, 16, 7.5, 3); fs(ctx, '#8a5a3c', 2.2);
    tube(ctx, col, 4.6, () => { ctx.beginPath(); ctx.moveTo(x, y1 + 1); ctx.lineTo(x, y2 - 9); });
    for (let yy = y1 + 5; yy < y2 - 12; yy += 8) ln(ctx, shade(col, -0.3), 1.5, [x - 2.2, yy, x + 2.2, yy + 3.6]);
    for (let yy = y1 + 30; yy < y2 - 20; yy += 46) { ell(ctx, x, yy, 6.2, 4.6); fs(ctx, knot, 2.2); ln(ctx, shade(knot, -0.3), 1.4, [x - 3, yy - 1, x + 3, yy + 1.6]); if (icy) { poly(ctx, [x - 3, yy + 4, x + 3, yy + 4, x, yy + 13]); fs(ctx, '#d8f1ff', 1.6); } }
    ell(ctx, x, y2 - 9, 5.4, 4.2); fs(ctx, knot, 2.2);
    ln(ctx, OUT, 4.4, [x - 2.5, y2 - 6, x - 4.5, y2 - 0.5]); ln(ctx, OUT, 4.4, [x + 2.5, y2 - 6, x + 4.5, y2 - 0.5]); ln(ctx, OUT, 4.4, [x, y2 - 6, x, y2]);
    ln(ctx, col, 2, [x - 2.5, y2 - 6, x - 4.5, y2 - 0.5]); ln(ctx, col, 2, [x + 2.5, y2 - 6, x + 4.5, y2 - 0.5]); ln(ctx, col, 2, [x, y2 - 6, x, y2]);
  }
  function ladWood(ctx, x, y1, y2, col, snow, lash) {
    const lt = shade(col, 0.2);
    for (let yy = y1 + 12; yy < y2 - 5; yy += 20) {
      tube(ctx, lt, 3.4, () => { ctx.beginPath(); ctx.moveTo(x - 9, yy); ctx.lineTo(x + 9, yy); });
      if (snow) { ell(ctx, x + ((yy / 20) & 1 ? 2 : -2), yy - 2.6, 6, 2.6); fs(ctx, '#f6fbff', 1.5); }
    }
    for (const sx of [x - 9.5, x + 9.5]) {
      tube(ctx, col, 4.2, () => { ctx.beginPath(); ctx.moveTo(sx, y1 - 8); ctx.lineTo(sx, y2); });
      if (lash) for (let yy = y1 + 12; yy < y2 - 5; yy += 20) { ln(ctx, '#8a6a44', 1.6, [sx - 2.6, yy - 3, sx + 2.6, yy + 3]); ln(ctx, '#8a6a44', 1.6, [sx - 2.6, yy + 3, sx + 2.6, yy - 3]); }
      if (lash) for (let yy = y1 + 2; yy < y2 - 4; yy += 30) ln(ctx, shade(col, -0.28), 1.6, [sx - 2.2, yy, sx + 2.2, yy]);
      if (snow) { ell(ctx, sx, y1 - 9, 4, 2.8); fs(ctx, '#f6fbff', 1.5); }
    }
  }
  function ladVine(ctx, x, y1, y2, col) {
    const f = (yy) => x + Math.sin((yy - y1) * 0.07) * 3.6;
    tube(ctx, shade(col, -0.12), 4.4, () => { ctx.beginPath(); ctx.moveTo(x, y1 - 3); for (let yy = y1 + 4; yy <= y2 - 4; yy += 6) ctx.lineTo(f(yy), yy); });
    let k = 0;
    for (let yy = y1 + 14; yy < y2 - 10; yy += 24) {
      const s = k++ & 1 ? 1 : -1, lx = f(yy);
      ctx.save(); ctx.translate(lx + s * 3, yy); ctx.rotate(s * 0.55);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 6, -6.5, s * 13, -1); ctx.quadraticCurveTo(s * 6, 5.5, 0, 0); ctx.closePath(); fs(ctx, k % 3 ? col : shade(col, 0.18), 1.8);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(f(y2 - 4) + 3.2, y2 - 4, 3.2, PI, PI * 2.6); ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = shade(col, -0.12); ctx.lineWidth = 2.2; ctx.stroke();
  }
  function ladRopeLadder(ctx, x, y1, y2, wood) {
    for (const sx of [x - 9, x + 9]) tube(ctx, '#d9b57c', 2.8, () => { ctx.beginPath(); ctx.moveTo(sx, y1 - 4); ctx.lineTo(sx, y2 - 2); });
    for (let yy = y1 + 12; yy < y2 - 6; yy += 22) { rr(ctx, x - 12.5, yy - 3.2, 25, 6.6, 2.2); fs(ctx, wood, 2.2); ln(ctx, shade(wood, 0.3), 1.5, [x - 9, yy - 1.2, x + 9, yy - 1.2]); }
    for (const sx of [x - 9, x + 9]) { rr(ctx, sx - 4, y1 - 7, 8, 6.5, 2.5); fs(ctx, shade(wood, -0.2), 2); }
  }
  function ladChain(ctx, x, y1, y2, col) {
    const dk = shade(col, -0.32);
    rr(ctx, x - 6, y1 - 6, 12, 7, 2.5); fs(ctx, dk, 2.2);
    let k = 0;
    for (let yy = y1 + 7; yy < y2 - 5; yy += 12.5, k++) {
      if (k & 1) { ln(ctx, OUT, 6.6, [x, yy - 5, x, yy + 5]); ln(ctx, dk, 3, [x, yy - 5, x, yy + 5]); }
      else { ctx.beginPath(); ctx.ellipse(x, yy, 4.6, 7.4, 0, 0, TAU); ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 2.8; ctx.stroke(); }
    }
  }
  A.ladder = function (ctx, theme, x, y1, y2) {
    const P = pal(theme);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (theme) {
      case 'town': ladWood(ctx, x, y1, y2, P.wood, false, false); break;
      case 'forest': ladVine(ctx, x, y1, y2, '#5fb85a'); break;
      case 'oasis': ladWood(ctx, x, y1, y2, '#d9b36a', false, true); break;
      case 'canyon': ladRopeLadder(ctx, x, y1, y2, P.wood); break;
      case 'snow': ladWood(ctx, x, y1, y2, '#8a6a58', true, false); break;
      case 'citadel': ladChain(ctx, x, y1, y2, '#9a93aa'); break;
      case 'throne': ladChain(ctx, x, y1, y2, '#e8c05a'); break;
      case 'cave': ladRope(ctx, x, y1, y2, '#d9b57c', '#f0d39a', false); break;
      default: ladRope(ctx, x, y1, y2, '#d9b57c', '#ecd09a', false);
    }
    ctx.restore();
  };

  // ------------------------------------------------------------ props
  const PR = (A.prop = {});
  A.decor = {};
  // register a prop; every draw runs in its own save/restore with round joins, so callers need no canvas setup
  const P_ = (name, w, h, fn, o) => {
    const draw = (ctx, t, seed) => { ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; fn(ctx, t || 0, seed | 0); ctx.restore(); };
    PR[name] = Object.assign({ w, h, layer: 'back', anim: false, draw }, o || {});
  };
  const sr = (seed) => U.rng(((seed | 0) ^ 0x5bd1e995) >>> 0);

  // ---- shared bits
  // flickering flame, bottom-center at (x,y)
  function flame(ctx, x, y, w, h, t, ph, c0, c1, c2) {
    const f1 = Math.sin(t * 9 + ph), f2 = Math.sin(t * 13.7 + ph * 2.3), f3 = Math.sin(t * 5.3 + ph * 0.7);
    const hh = h * (1 + f1 * 0.08 + f2 * 0.05), sw = w * (0.16 * f3 + 0.07 * f2);
    const shape = (k, dy) => {
      const ww = (w * k) / 2, ht = hh * k, yy = y - dy;
      ctx.beginPath(); ctx.moveTo(x - ww, yy);
      ctx.bezierCurveTo(x - ww * 1.25, yy - ht * 0.45, x - ww * 0.2 + sw * k, yy - ht * 0.62, x + sw * 1.6 * k, yy - ht);
      ctx.bezierCurveTo(x + ww * 0.45 + sw * k, yy - ht * 0.6, x + ww * 1.25, yy - ht * 0.4, x + ww, yy);
      ctx.quadraticCurveTo(x, yy + ww * 0.7, x - ww, yy);
      ctx.closePath();
    };
    shape(1, 0); fs(ctx, c0, 2, shade(c0, -0.32));
    shape(0.66, 1); ctx.fillStyle = c1; ctx.fill();
    shape(0.36, 2); ctx.fillStyle = c2; ctx.fill();
  }
  function sparks(ctx, x, y, t, n, spread, rise, col) {
    for (let i = 0; i < n; i++) {
      const u = (t * 0.55 + i * 0.37) % 1, sx = x + Math.sin(i * 12.9 + u * 5) * spread * (0.3 + u), sy = y - u * rise;
      glow(ctx, sx, sy, 6 * (1 - u * 0.5), col, (1 - u) * 0.9);
      ctx.fillStyle = 'rgba(255,246,208,' + (1 - u).toFixed(2) + ')'; ctx.fillRect(sx - 1.1, sy - 1.1, 2.2, 2.2);
    }
  }
  function scales(ctx, x0, x1, y0, y1, rad, col, lw) { // fish-scale shingles (caller clips)
    ctx.strokeStyle = col; ctx.lineWidth = lw || 2;
    let k = 0;
    for (let yy = y0; yy < y1 + rad; yy += rad * 1.4, k++)
      for (let xx = x0 + (k & 1 ? rad : 0); xx < x1 + rad; xx += rad * 2) { ctx.beginPath(); ctx.arc(xx, yy, rad, 0.08 * PI, 0.92 * PI); ctx.stroke(); }
  }
  function blocks(ctx, x, y, w, h, bw, bh, col, lw) { // masonry joints (caller clips)
    let k = 0;
    for (let yy = y; yy < y + h; yy += bh, k++) {
      if (k) ln(ctx, col, lw, [x, yy, x + w, yy]);
      for (let xx = x + (k & 1 ? bw / 2 : bw); xx < x + w - 4; xx += bw) ln(ctx, col, lw, [xx, yy, xx, Math.min(yy + bh, y + h)]);
    }
  }
  function winWarm(ctx, x, y, w, h, rad, frame, arch) { // warm lit window, (x,y) = top-left
    const path = (ix) => {
      ctx.beginPath();
      if (arch) { ctx.moveTo(x + ix, y + h - ix); ctx.lineTo(x + ix, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2 - ix, PI, 0); ctx.lineTo(x + w - ix, y + h - ix); ctx.closePath(); }
      else ctx.roundRect(x + ix, y + ix, w - ix * 2, h - ix * 2, Math.max(1, rad - ix));
    };
    path(0); fs(ctx, frame);
    path(4.2); ctx.fillStyle = '#ffd98a'; ctx.fill();
    ctx.save(); path(4.2); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; poly(ctx, [x + w * 0.12, y + h, x + w * 0.5, y, x + w * 0.74, y, x + w * 0.36, y + h]); ctx.fill();
    ctx.restore();
    ln(ctx, frame, 2.6, [x + w / 2, y + 4, x + w / 2, y + h - 4]); ln(ctx, frame, 2.6, [x + 4, y + h * 0.56, x + w - 4, y + h * 0.56]);
  }
  function emblem(ctx, x, y, s, lit) { // lantern emblem of the keepers
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.arc(0, -13, 5.5, PI, 0); ctx.strokeStyle = OUT; ctx.lineWidth = 2.4; ctx.stroke();
    rr(ctx, -8.5, -13, 17, 5, 2); fs(ctx, '#6a4630', 2);
    rr(ctx, -10, -8.5, 20, 20, 5); fs(ctx, lit === false ? '#cfc8d8' : '#fff3c4', 2.2);
    if (lit !== false) { ctx.beginPath(); ctx.moveTo(0, -5); ctx.bezierCurveTo(5, 0, 5, 8, 0, 8.5); ctx.bezierCurveTo(-5, 8, -5, 0, 0, -5); ctx.fillStyle = '#ff9a2e'; ctx.fill(); }
    rr(ctx, -7.5, 11, 15, 4.2, 2); fs(ctx, '#6a4630', 2);
    ctx.restore();
  }
  function iconPotion(ctx, x, y) {
    rr(ctx, x - 2.6, y - 11, 5.2, 7, 1.5); fs(ctx, '#e9f4ff', 1.6);
    ell(ctx, x, y + 1.5, 7.2, 7); fs(ctx, '#e2574a', 1.8);
    ell(ctx, x - 2.4, y - 0.5, 1.8, 2.4); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    rr(ctx, x - 3.4, y - 13.6, 6.8, 3.4, 1.2); fs(ctx, '#b98a5a', 1.5);
  }
  function iconHammer(ctx, x, y) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.6);
    rr(ctx, -1.8, -6, 3.6, 17, 1.5); fs(ctx, '#8a5a3c', 1.6); rr(ctx, -8, -11, 16, 8, 2); fs(ctx, '#8f8a98', 1.8);
    ctx.restore();
  }
  function hangSign(ctx, x, y, kind) { // round hanging board centered at (x,y); hangs from y-26
    ln(ctx, OUT, 1.8, [x - 8, y - 27, x - 8, y - 16]); ln(ctx, OUT, 1.8, [x + 8, y - 27, x + 8, y - 16]);
    ell(ctx, x, y, 19.5); fs(ctx, '#a06a3c'); ell(ctx, x, y, 15.5); fs(ctx, '#fbefd2', 1.8);
    if (kind === 'potion') iconPotion(ctx, x, y + 2); else if (kind === 'hammer') iconHammer(ctx, x, y + 1); else emblem(ctx, x, y + 1, 0.62);
  }
  function anvil(ctx, x, y) { // (x,y) = bottom-center of its wooden block
    rr(ctx, x - 17, y - 24, 34, 26, 4); fs(ctx, '#8a5a3c');
    ln(ctx, shade('#8a5a3c', -0.28), 1.8, [x - 7, y - 20, x - 7, y - 2]); ln(ctx, shade('#8a5a3c', -0.28), 1.8, [x + 6, y - 20, x + 6, y - 2]);
    poly(ctx, [x - 24, y - 44, x + 22, y - 44, x + 40, y - 39.5, x + 22, y - 35, x + 9, y - 35, x + 6, y - 29, x + 13, y - 24, x - 14, y - 24, x - 8, y - 29, x - 11, y - 35, x - 24, y - 35]); fs(ctx, '#5f5d70');
    ln(ctx, '#a9a6b8', 2, [x - 20, y - 41.3, x + 20, y - 41.3]);
  }
  function lantern(ctx, x, y, s) { // small hanging lantern, top-center at (x,y)
    glow(ctx, x, y + 11 * s, 26 * s, '#ffc95a', 0.6);
    rr(ctx, x - 6 * s, y, 12 * s, 4.5 * s, 1.5); fs(ctx, '#6a4630', 1.8);
    rr(ctx, x - 5 * s, y + 4.5 * s, 10 * s, 14 * s, 2.5); fs(ctx, '#ffe9a0', 1.8);
    ell(ctx, x, y + 12.5 * s, 2 * s, 3.3 * s); ctx.fillStyle = '#ff9a2e'; ctx.fill();
  }
  const STONE = '#b9b2a6';
  function foundation(ctx, x0, x1, top, col) {
    rr(ctx, x0, top, x1 - x0, 4 - top, 4); fs(ctx, col);
    const r = U.rng('f' + x0 + ':' + x1);
    for (let jx = x0 + 22 + r() * 16; jx < x1 - 14; jx += 30 + r() * 18) ln(ctx, shade(col, -0.3), 2, [jx, top + 2, jx, 2]);
    ln(ctx, shade(col, 0.35), 2, [x0 + 6, top + 4.5, x1 - 6, top + 4.5]);
  }

  // ---- town
  P_('house_elder', 340, 286, (ctx) => {
    const wall = '#f6e7c8', tim = '#8a5a3c', roof = '#c8553f', brick = '#b8704a';
    rr(ctx, 64, -274, 34, 76, 3); fs(ctx, brick);
    ln(ctx, shade(brick, -0.25), 2, [64, -256, 98, -256]); ln(ctx, shade(brick, -0.25), 2, [64, -240, 98, -240]); ln(ctx, shade(brick, -0.25), 2, [81, -256, 81, -240]);
    rr(ctx, 59, -282, 44, 11, 3); fs(ctx, shade(brick, -0.14));
    rr(ctx, -132, -130, 264, 116, 4); fs(ctx, wall);
    ctx.fillStyle = rgba('#b98a5a', 0.35); ctx.fillRect(-130.7, -128.7, 261.4, 22);
    for (const tx of [-132, -6, 123]) { rr(ctx, tx, -130, 9, 116, 2); fs(ctx, tim, 2.2); }
    // round door
    ell(ctx, -70, -62, 42, 46); fs(ctx, tim);
    ell(ctx, -70, -62, 35.5, 39.5); fs(ctx, '#b0723e', 2.2);
    ctx.save(); ell(ctx, -70, -62, 34, 38); ctx.clip();
    for (const px of [-92, -80, -68, -56, -44]) ln(ctx, shade('#b0723e', -0.25), 2, [px, -104, px, -20]);
    ctx.restore();
    rr(ctx, -105, -84, 30, 5.5, 2); fs(ctx, '#5f5d70', 1.8); rr(ctx, -105, -46, 30, 5.5, 2); fs(ctx, '#5f5d70', 1.8);
    ell(ctx, -47, -60, 4.2); fs(ctx, '#f0c35a', 1.8);
    // round window + flower box
    ell(ctx, 64, -82, 26); fs(ctx, tim);
    ell(ctx, 64, -82, 20); ctx.fillStyle = '#ffd98a'; ctx.fill();
    ctx.save(); ell(ctx, 64, -82, 20); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,0.4)'; poly(ctx, [48, -62, 62, -104, 72, -104, 58, -62]); ctx.fill(); ctx.restore();
    ell(ctx, 64, -82, 20); ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
    ln(ctx, tim, 3, [64, -101, 64, -63]); ln(ctx, tim, 3, [45, -82, 83, -82]);
    for (const [fx, c] of [[46, '#e2574a'], [58, '#ffd84a'], [70, '#f291b3'], [82, '#e2574a']]) { ell(ctx, fx - 3, -57, 4.5, 2.6, -0.5); ctx.fillStyle = '#5fb85a'; ctx.fill(); ell(ctx, fx, -60, 4.2); fs(ctx, c, 1.6); }
    rr(ctx, 36, -55, 56, 12, 3); fs(ctx, '#a06a3c', 2.2);
    foundation(ctx, -140, 140, -20, STONE);
    rr(ctx, -102, -25, 64, 9, 3); fs(ctx, '#d6cfc2', 2.2);
    // roof
    const rp = () => {
      ctx.beginPath(); ctx.moveTo(-168, -120); ctx.bezierCurveTo(-152, -206, -82, -254, 0, -254); ctx.bezierCurveTo(82, -254, 152, -206, 168, -120);
      for (let i = 0; i < 12; i++) { const xa = 168 - i * 28; ctx.quadraticCurveTo(xa - 14, -103, xa - 28, -120); }
      ctx.closePath();
    };
    rp(); ctx.fillStyle = roof; ctx.fill();
    ctx.save(); ctx.clip();
    scales(ctx, -170, 170, -246, -126, 14, shade(roof, -0.22), 2.2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.ellipse(-62, -214, 84, 24, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
    rp(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    ln(ctx, OUT, 2.4, [-4, -109, -18, -109]); lantern(ctx, -18, -108, 1);
  });
  P_('shop_sundries', 320, 266, (ctx) => {
    const wall = '#f8dcc0', tim = '#8a5a3c', roof = '#3f8f9a', stripe = ['#e2574a', '#fff3dc'];
    rr(ctx, -116, -196, 232, 182, 4); fs(ctx, wall);
    ctx.fillStyle = rgba('#b98a5a', 0.3); ctx.fillRect(-114.7, -186, 229.4, 18);
    for (const tx of [-116, 107]) { rr(ctx, tx, -196, 9, 182, 2); fs(ctx, tim, 2.2); }
    rr(ctx, -58, -183, 116, 27, 5); fs(ctx, '#fbefd2', 2.4);
    A.text(ctx, '잡화점', 0, -169, { size: 16, color: '#8a4a2c', stroke: null, weight: 900 });
    // awning
    const aw = () => poly(ctx, [-106, -136, 106, -136, 114, -104, -114, -104]);
    ctx.save(); aw(); ctx.clip();
    for (let i = 0; i < 9; i++) { ctx.fillStyle = stripe[i & 1]; ctx.fillRect(-114 + i * 25.33, -138, 26, 36); }
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-117, -136, 234, 5);
    ctx.restore();
    for (let i = 0; i < 9; i++) { const xa = -114 + i * 25.33; ctx.beginPath(); ctx.moveTo(xa, -105); ctx.lineTo(xa, -100); ctx.quadraticCurveTo(xa + 12.7, -85, xa + 25.33, -100); ctx.lineTo(xa + 25.33, -105); ctx.closePath(); fs(ctx, shade(stripe[i & 1], -0.1), 2.2); }
    aw(); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, -110, -142, 220, 7.5, 3); fs(ctx, tim, 2.2);
    // display window
    rr(ctx, -96, -90, 104, 54, 4); fs(ctx, tim);
    rr(ctx, -91, -85, 94, 44, 3); ctx.fillStyle = '#ffe3a0'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; poly(ctx, [-82, -41, -62, -85, -48, -85, -68, -41]); ctx.fill();
    ln(ctx, tim, 2.6, [-91, -55, 3, -55]);
    for (const [bx, c] of [[-76, '#e2574a'], [-56, '#5f9df0'], [-36, '#6fdc6f'], [-14, '#c77dff']]) { rr(ctx, bx - 2.2, -74, 4.4, 6, 1.2); fs(ctx, '#f6f1e2', 1.4); ell(ctx, bx, -63.5, 6, 6.5); fs(ctx, c, 1.6); ell(ctx, bx - 2, -65.5, 1.5, 2); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill(); }
    rr(ctx, -91, -85, 94, 44, 3); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, -102, -38, 116, 8.5, 3); fs(ctx, '#a06a3c', 2.2);
    // door
    rr(ctx, 34, -106, 60, 96, [9, 9, 0, 0]); fs(ctx, tim);
    rr(ctx, 40, -100, 48, 90, [6, 6, 0, 0]); fs(ctx, '#b0723e', 2.2);
    rr(ctx, 50, -90, 28, 24, 4); fs(ctx, '#ffe3a0', 2); ln(ctx, tim, 2, [64, -90, 64, -66]);
    ell(ctx, 80, -52, 3.6); fs(ctx, '#f0c35a', 1.8);
    foundation(ctx, -124, 124, -18, STONE);
    // roof
    const rp = () => poly(ctx, [-142, -190, -100, -256, 100, -256, 142, -190]);
    rp(); ctx.fillStyle = roof; ctx.fill();
    ctx.save(); ctx.clip(); scales(ctx, -144, 144, -252, -192, 13, shade(roof, -0.26), 2.2); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-144, -256, 288, 13); ctx.restore();
    rp(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, -146, -196, 292, 9, 3); fs(ctx, shade(roof, -0.22), 2.4);
    rr(ctx, -106, -262, 212, 9, 4); fs(ctx, shade(roof, -0.3), 2.4);
    // hanging sign
    ln(ctx, OUT, 5, [112, -178, 154, -178]); ln(ctx, tim, 2.4, [112, -178, 154, -178]);
    hangSign(ctx, 140, -151, 'potion');
    // goods out front
    ell(ctx, -139, -19, 9.5); fs(ctx, '#e2574a', 2); ell(ctx, -124, -21, 9); fs(ctx, '#f0a03a', 2); ell(ctx, -131, -28, 8.5); fs(ctx, '#e2574a', 2);
    poly(ctx, [-153, -16, -111, -16, -116, 3, -148, 3]); fs(ctx, '#d2a55e');
    ln(ctx, shade('#d2a55e', -0.28), 1.8, [-151, -9.5, -113, -9.5]); ln(ctx, shade('#d2a55e', -0.28), 1.8, [-149, -3.5, -115, -3.5]);
    ctx.beginPath(); ctx.moveTo(123, 3); ctx.bezierCurveTo(112, -14, 118, -30, 132, -32); ctx.bezierCurveTo(147, -30, 153, -14, 145, 3); ctx.closePath(); fs(ctx, '#e3d2a8');
    poly(ctx, [126, -31, 133, -43, 140, -31]); fs(ctx, '#e3d2a8', 2); ln(ctx, '#8a5a3c', 2.2, [126, -31, 140, -31]);
  });
  P_('smithy', 330, 280, (ctx) => {
    const st = '#a9a4ad', st2 = shade(st, -0.28), tim = '#7a5236', chim = '#8f8a98';
    rr(ctx, -142, -6, 290, 10, 3); fs(ctx, chim);
    // chimney
    rr(ctx, -132, -262, 60, 266, 4); fs(ctx, chim);
    ctx.save(); rr(ctx, -132, -262, 60, 266, 4); ctx.clip(); blocks(ctx, -132, -262, 60, 266, 30, 22, shade(chim, -0.28), 2); ctx.fillStyle = 'rgba(29,20,48,0.14)'; ctx.fillRect(-84, -262, 12, 266); ctx.restore();
    rr(ctx, -132, -262, 60, 266, 4); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, -138, -272, 72, 13, 3); fs(ctx, shade(chim, -0.12));
    glow(ctx, -102, -277, 30, '#ff8a3a', 0.55); ell(ctx, -102, -273, 17, 4); ctx.fillStyle = '#ff9a3a'; ctx.fill();
    // back wall
    rr(ctx, -76, -152, 200, 156, 4); fs(ctx, st);
    ctx.save(); rr(ctx, -76, -152, 200, 156, 4); ctx.clip(); blocks(ctx, -76, -152, 200, 156, 44, 26, st2, 2); ctx.restore();
    rr(ctx, -76, -152, 200, 156, 4); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    // interior + tools
    rr(ctx, -58, -120, 124, 124, [12, 12, 0, 0]); fs(ctx, '#3a2c38');
    ln(ctx, '#8f8a98', 2.6, [-32, -104, -32, -78]); rr(ctx, -38, -108, 12, 7, 2); fs(ctx, '#8f8a98', 1.6);
    ln(ctx, '#8f8a98', 2.2, [-10, -106, -14, -76]); ln(ctx, '#8f8a98', 2.2, [-6, -106, -2, -76]);
    ctx.beginPath(); ctx.arc(38, -92, 9, 0.75 * PI, 2.25 * PI); ctx.strokeStyle = '#8f8a98'; ctx.lineWidth = 3; ctx.stroke();
    // forge hearth
    glow(ctx, -12, -58, 60, '#ff9a3a', 0.6);
    rr(ctx, -46, -50, 68, 54, 4); fs(ctx, '#6a6474');
    ctx.save(); rr(ctx, -46, -50, 68, 54, 4); ctx.clip(); blocks(ctx, -46, -50, 68, 54, 24, 18, '#4a4458', 2); ctx.restore();
    ell(ctx, -12, -50, 28, 8); fs(ctx, '#ff8a3a', 2, '#a8401e');
    ell(ctx, -14, -51, 15, 4); ctx.fillStyle = '#ffd98a'; ctx.fill();
    ctx.fillStyle = '#ffd27a'; for (const [ex, ey] of [[-26, -66], [-4, -76], [8, -63]]) ctx.fillRect(ex, ey, 2.4, 2.4);
    // canopy
    rr(ctx, 112, -152, 12, 156, 3); fs(ctx, tim);
    const cp = () => poly(ctx, [-104, -160, -80, -214, 126, -198, 144, -160]);
    cp(); ctx.fillStyle = '#5f6478'; ctx.fill();
    ctx.save(); ctx.clip();
    for (let px = -80; px < 150; px += 30) ln(ctx, shade('#5f6478', -0.3), 2, [px, -216, px + 8, -158]);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(-110, -216, 260, 13);
    ctx.restore();
    cp(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, -100, -164, 264, 12, 3); fs(ctx, tim);
    rr(ctx, -28, -202, 96, 27, 5); fs(ctx, '#fbefd2', 2.4);
    A.text(ctx, '대장간', 20, -188, { size: 16, color: '#5a3a2e', stroke: null, weight: 900 });
    hangSign(ctx, 150, -125, 'hammer');
    anvil(ctx, 76, 3);
    // quench bucket
    poly(ctx, [-126, -25, -86, -25, -91, 3, -121, 3]); fs(ctx, '#8a5a3c');
    ln(ctx, '#5f5d70', 3, [-124, -12, -88, -12]);
    ell(ctx, -106, -25, 20, 5); fs(ctx, '#6fc8e8', 2.2);
  }, { light: { r: 130, color: '#ff9a3a', dy: -56 } });
  P_('guild_hall', 340, 426, (ctx) => {
    const st = '#cfc8bc', st2 = shade(st, -0.26), wall = '#f6e7c8', tim = '#7a5236', roof = '#4a4f8a', gold = '#f0c35a';
    // upper floor
    rr(ctx, -126, -302, 252, 124, 4); fs(ctx, wall);
    ctx.fillStyle = rgba('#b98a5a', 0.32); ctx.fillRect(-124.7, -296, 249.4, 18);
    for (const tx of [-126, -46, 37, 117]) { rr(ctx, tx, -302, 9, 124, 2); fs(ctx, tim, 2.2); }
    winWarm(ctx, -100, -272, 36, 56, 4, tim, true); winWarm(ctx, 64, -272, 36, 56, 4, tim, true);
    rr(ctx, -36, -290, 72, 7, 3); fs(ctx, gold, 2.2);
    poly(ctx, [-29, -285, 29, -285, 29, -216, 0, -200, -29, -216]); fs(ctx, '#f6a43c');
    poly(ctx, [-23, -280, 23, -280, 23, -220, 0, -208, -23, -220]); ctx.lineWidth = 1.8; ctx.strokeStyle = '#fff3c4'; ctx.stroke();
    emblem(ctx, 0, -248, 1.25);
    // balcony railing + floor
    for (let bx = -138; bx <= 138; bx += 23) { rr(ctx, bx - 2.6, -206, 5.2, 26, 2); fs(ctx, shade(tim, 0.14), 2); }
    rr(ctx, -146, -211, 292, 7, 3); fs(ctx, tim, 2.2);
    rr(ctx, -150, -184, 300, 11, 3); fs(ctx, tim);
    // ground floor
    rr(ctx, -140, -174, 280, 178, 4); fs(ctx, st);
    ctx.save(); rr(ctx, -140, -174, 280, 178, 4); ctx.clip(); blocks(ctx, -140, -174, 280, 178, 52, 30, st2, 2); ctx.fillStyle = 'rgba(29,20,48,0.12)'; ctx.fillRect(-140, -174, 280, 14); ctx.restore();
    rr(ctx, -140, -174, 280, 178, 4); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    const door = (ix) => { ctx.beginPath(); ctx.moveTo(-40 + ix, 4); ctx.lineTo(-40 + ix, -84); ctx.quadraticCurveTo(-40 + ix, -128 + ix, 0, -128 + ix); ctx.quadraticCurveTo(40 - ix, -128 + ix, 40 - ix, -84); ctx.lineTo(40 - ix, 4); ctx.closePath(); };
    door(-7); fs(ctx, tim);
    door(0); fs(ctx, '#9a6238', 2.2);
    ln(ctx, OUT, 2.2, [0, -127, 0, 2]);
    rr(ctx, -39, -92, 78, 6, 2); fs(ctx, '#5f5d70', 1.8); rr(ctx, -39, -42, 78, 6, 2); fs(ctx, '#5f5d70', 1.8);
    for (const kx of [-9, 9]) { ctx.beginPath(); ctx.arc(kx, -64, 4.4, 0, TAU); ctx.strokeStyle = OUT; ctx.lineWidth = 4.8; ctx.stroke(); ctx.strokeStyle = gold; ctx.lineWidth = 2.2; ctx.stroke(); }
    rr(ctx, -34, -165, 68, 25, 5); fs(ctx, '#fbefd2', 2.4);
    A.text(ctx, '길드', 0, -152, { size: 15, color: '#4a4f8a', stroke: null, weight: 900 });
    winWarm(ctx, -119, -114, 34, 56, 4, tim, true); winWarm(ctx, 85, -114, 34, 56, 4, tim, true);
    lantern(ctx, -62, -110, 1); lantern(ctx, 62, -110, 1);
    rr(ctx, -150, -12, 300, 16, 4); fs(ctx, shade(st, -0.12));
    rr(ctx, -58, -9, 116, 13, 3); fs(ctx, shade(st, 0.25), 2.2);
    // roof
    const rp = () => poly(ctx, [-156, -296, 0, -398, 156, -296]);
    rp(); ctx.fillStyle = roof; ctx.fill();
    ctx.save(); ctx.clip(); scales(ctx, -158, 158, -392, -298, 13, shade(roof, -0.3), 2.2); ctx.fillStyle = 'rgba(255,255,255,0.1)'; poly(ctx, [-156, -296, 0, -398, -34, -398, -190, -296]); ctx.fill(); ctx.restore();
    rp(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, -160, -302, 320, 9, 3); fs(ctx, shade(roof, -0.25), 2.4);
    ln(ctx, OUT, 4.6, [0, -398, 0, -407]);
    glow(ctx, 0, -414, 28, '#ffc95a', 0.6);
    rr(ctx, -6, -420, 12, 14, 3); fs(ctx, '#ffe9a0', 2); rr(ctx, -7.5, -424, 15, 5, 2); fs(ctx, gold, 1.8);
  });
  P_('campfire', 150, 140, (ctx, t) => {
    glow(ctx, 0, -42, 108 + Math.sin(t * 7.3) * 6, '#ff9a3a', 0.42);
    for (const [sx, sy, rd] of [[-36, -8, 11], [-13, -12, 12], [12, -12, 12], [36, -8, 11]]) { ell(ctx, sx, sy, rd, rd * 0.74); fs(ctx, '#8f8a98'); }
    for (const [ox, rot] of [[-5, -0.42], [5, 0.42]]) {
      ctx.save(); ctx.translate(ox, -9); ctx.rotate(rot);
      rr(ctx, -31, -7, 62, 14, 6); fs(ctx, '#8a5a3c'); ln(ctx, shade('#8a5a3c', -0.3), 1.8, [-18, -1, 6, -1]);
      ell(ctx, rot < 0 ? 29 : -29, 0, 4.6, 6.2); fs(ctx, '#d2a877', 1.8);
      ctx.restore();
    }
    flame(ctx, -21, -9, 30, 50, t, 2.1, '#ff7a2e', '#ffb02e', '#fff1a8');
    flame(ctx, 22, -9, 28, 44, t, 4.2, '#ff7a2e', '#ffb02e', '#fff1a8');
    flame(ctx, 0, -11, 60, 96, t, 0, '#ff7a2e', '#ffb02e', '#fff1a8');
    sparks(ctx, 0, -74, t, 7, 22, 96, '#ffd27a');
    for (const [sx, sy, rd] of [[-50, -3, 12], [-25, -1, 13], [0, 0, 13.5], [25, -1, 13], [50, -3, 12]]) {
      ell(ctx, sx, sy - 5, rd, rd * 0.76); fs(ctx, '#a9a4ad');
      ctx.beginPath(); ctx.ellipse(sx, sy - 5, rd * 0.62, rd * 0.42, 0, 1.1 * PI, 1.7 * PI); ctx.strokeStyle = '#d6d2dc'; ctx.lineWidth = 2; ctx.stroke();
    }
  }, { anim: true, light: { r: 230, color: '#ffb04a', dy: -46 } });
  P_('lamp_post', 46, 182, (ctx, t) => {
    const f = Math.sin(t * 6.3) * 0.5 + Math.sin(t * 9.7 + 1) * 0.5, ir = '#5a4a58';
    rr(ctx, -9, -9, 18, 13, 3); fs(ctx, ir);
    rr(ctx, -3.7, -140, 7.4, 134, 3); fs(ctx, shade(ir, 0.14));
    rr(ctx, -6.5, -100, 13, 5.5, 2); fs(ctx, ir, 2);
    glow(ctx, 0, -154, 42 + f * 3, '#ffc95a', 0.6);
    rr(ctx, -12.5, -144, 25, 6.5, 2.5); fs(ctx, ir, 2.2);
    poly(ctx, [-9.5, -144, -12, -166, 12, -166, 9.5, -144]); fs(ctx, '#ffe9a0', 2.2);
    ell(ctx, 0, -152.5, 3.6 + f * 0.4, 6); ctx.fillStyle = '#ff9a2e'; ctx.fill();
    ell(ctx, 0, -151, 1.6, 3); ctx.fillStyle = '#fff3c4'; ctx.fill();
    poly(ctx, [-16, -165.5, 0, -178, 16, -165.5]); fs(ctx, ir, 2.2);
    ell(ctx, 0, -180, 2.8); fs(ctx, '#f0c35a', 1.6);
  }, { anim: true, light: { r: 150, color: '#ffc95a', dy: -154 } });
  P_('well', 116, 134, (ctx) => {
    const wd = '#8a5a3c';
    rr(ctx, -42, -116, 8, 86, 2); fs(ctx, wd); rr(ctx, 34, -116, 8, 86, 2); fs(ctx, wd);
    ln(ctx, OUT, 5, [-40, -92, 48, -92]); ln(ctx, '#b98a5a', 2.4, [-40, -92, 48, -92]);
    ln(ctx, OUT, 4.4, [48, -92, 48, -80]); ln(ctx, OUT, 4.4, [48, -80, 56, -80]);
    ln(ctx, '#d9c49a', 2, [0, -92, 0, -66]);
    poly(ctx, [-9, -66, 9, -66, 7, -50, -7, -50]); fs(ctx, '#a06a3c', 2.2); ln(ctx, '#5f5d70', 2, [-8.5, -60, 8.5, -60]);
    poly(ctx, [-58, -106, 0, -136, 58, -106]); fs(ctx, '#c8553f');
    ln(ctx, shade('#c8553f', -0.25), 2, [-30, -108, -6, -128]); ln(ctx, shade('#c8553f', -0.25), 2, [8, -108, 28, -119]);
    rr(ctx, -42, -40, 84, 44, 6); fs(ctx, STONE);
    ctx.save(); rr(ctx, -42, -40, 84, 44, 6); ctx.clip(); blocks(ctx, -42, -34, 84, 40, 28, 14, shade(STONE, -0.3), 2); ctx.restore();
    rr(ctx, -47, -47, 94, 11, 4); fs(ctx, shade(STONE, 0.18));
  });
  P_('bench', 100, 48, (ctx) => {
    const wd = '#a06a3c', dk = shade(wd, -0.25);
    rr(ctx, -40, -40, 6, 26, 2); fs(ctx, dk, 2.2); rr(ctx, 34, -40, 6, 26, 2); fs(ctx, dk, 2.2);
    rr(ctx, -46, -46, 92, 8, 3); fs(ctx, wd); rr(ctx, -46, -35, 92, 7, 3); fs(ctx, wd);
    rr(ctx, -40, -17, 7, 20, 2); fs(ctx, dk, 2.2); rr(ctx, 33, -17, 7, 20, 2); fs(ctx, dk, 2.2);
    rr(ctx, -48, -23, 96, 9, 3); fs(ctx, shade(wd, 0.12));
    ln(ctx, shade(wd, 0.4), 1.8, [-42, -20, 42, -20]);
  });
  P_('barrel', 48, 60, (ctx) => {
    const wd = '#a06a3c';
    ctx.beginPath(); ctx.moveTo(-16, -55); ctx.quadraticCurveTo(-25, -27, -16, 3); ctx.lineTo(16, 3); ctx.quadraticCurveTo(25, -27, 16, -55); ctx.closePath(); fs(ctx, wd);
    for (const sx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(sx, -54); ctx.quadraticCurveTo(sx * 1.45, -27, sx, 2); ctx.strokeStyle = shade(wd, -0.25); ctx.lineWidth = 1.8; ctx.stroke(); }
    for (const by of [-42, -12]) { ctx.beginPath(); ctx.moveTo(-19.5, by); ctx.quadraticCurveTo(0, by + 5, 19.5, by); ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = '#6f6c80'; ctx.lineWidth = 3.8; ctx.stroke(); }
    ell(ctx, 0, -55, 16, 5); fs(ctx, shade(wd, 0.22), 2.2);
  });
  P_('crate', 52, 50, (ctx) => {
    const wd = '#c99a5e', dk = shade(wd, -0.22);
    rr(ctx, -23, -44, 46, 47, 3); fs(ctx, wd);
    ln(ctx, dk, 5, [-15, -36, 15, -5]); ln(ctx, dk, 5, [15, -36, -15, -5]);
    rr(ctx, -23, -44, 46, 9, 2); fs(ctx, dk, 2.2); rr(ctx, -23, -6, 46, 9, 2); fs(ctx, dk, 2.2);
    rr(ctx, -23, -44, 8, 47, 2); fs(ctx, dk, 2.2); rr(ctx, 15, -44, 8, 47, 2); fs(ctx, dk, 2.2);
    ctx.fillStyle = OUT; for (const [nx, ny] of [[-19, -39.5], [19, -39.5], [-19, -1.5], [19, -1.5]]) { ctx.beginPath(); ctx.arc(nx, ny, 1.4, 0, TAU); ctx.fill(); }
  });
  P_('signpost', 76, 100, (ctx, t, seed) => {
    const wd = '#b98a5a', dk = '#8a5a3c';
    rr(ctx, -4.5, -92, 9, 96, 3); fs(ctx, dk);
    poly(ctx, [-8, -90, 24, -90, 36, -79, 24, -68, -8, -68]); fs(ctx, wd);
    ln(ctx, shade(wd, -0.3), 2, [-1, -82.5, 20, -82.5]); ln(ctx, shade(wd, -0.3), 2, [-1, -75.5, 14, -75.5]);
    poly(ctx, [8, -62, -22, -62, -34, -52, -22, -42, 8, -42]); fs(ctx, shade(wd, 0.12));
    ln(ctx, shade(wd, -0.3), 2, [-18, -52, 2, -52]);
    ell(ctx, 0, -79, 1.8); ctx.fillStyle = OUT; ctx.fill(); ell(ctx, 0, -52, 1.8); ctx.fill();
    poly(ctx, [-12, 3, -9, -9, -5, 3]); fs(ctx, '#7cc35a', 1.8); poly(ctx, [5, 3, 9, -7, 12, 3]); fs(ctx, '#7cc35a', 1.8);
  });
  P_('fence', 112, 52, (ctx) => {
    const wd = '#e3cfa6', dk = shade(wd, -0.2);
    rr(ctx, -56, -36, 112, 6.5, 2); fs(ctx, dk, 2.2); rr(ctx, -56, -18, 112, 6.5, 2); fs(ctx, dk, 2.2);
    for (const px of [-42, -14, 14, 42]) { ctx.beginPath(); ctx.moveTo(px - 5.5, 3); ctx.lineTo(px - 5.5, -41); ctx.lineTo(px, -49); ctx.lineTo(px + 5.5, -41); ctx.lineTo(px + 5.5, 3); ctx.closePath(); fs(ctx, wd); }
  });
  P_('windmill', 210, 266, (ctx, t) => {
    const wall = '#f1e3c6', tim = '#8a5a3c';
    const tw = () => poly(ctx, [-42, 3, -28, -152, 28, -152, 42, 3]);
    tw(); ctx.fillStyle = wall; ctx.fill();
    ctx.save(); ctx.clip();
    for (let yy = -128; yy < 0; yy += 26) ln(ctx, shade(wall, -0.2), 2, [-44, yy, 44, yy]);
    ctx.fillStyle = 'rgba(138,90,60,0.22)'; ctx.fillRect(18, -156, 30, 164);
    ctx.restore();
    tw(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-13, 3); ctx.lineTo(-13, -30); ctx.quadraticCurveTo(0, -46, 13, -30); ctx.lineTo(13, 3); ctx.closePath(); fs(ctx, '#9a6238');
    ell(ctx, 7, -18, 2.4); fs(ctx, '#f0c35a', 1.5);
    ell(ctx, 0, -94, 9, 11); fs(ctx, '#ffd98a', 2.4, tim); ln(ctx, tim, 2, [0, -105, 0, -83]); ln(ctx, tim, 2, [-9, -94, 9, -94]);
    rr(ctx, -39, -68, 78, 7.5, 3); fs(ctx, tim, 2.2);
    ctx.beginPath(); ctx.moveTo(-36, -150); ctx.quadraticCurveTo(-32, -192, 0, -200); ctx.quadraticCurveTo(32, -192, 36, -150); ctx.closePath(); fs(ctx, '#c8553f', 3);
    ln(ctx, shade('#c8553f', -0.25), 2, [-20, -152, -14, -188]); ln(ctx, shade('#c8553f', -0.25), 2, [14, -152, 12, -190]);
    ctx.save(); ctx.translate(0, -160); ctx.rotate(t * 0.55);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(PI / 2);
      rr(ctx, 3, -100, 25, 68, 2); fs(ctx, '#fff3dc', 2.2);
      ctx.strokeStyle = '#c9a678'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (const yy of [-83, -66, -49]) { ctx.moveTo(3, yy); ctx.lineTo(28, yy); }
      ctx.moveTo(15.5, -100); ctx.lineTo(15.5, -32); ctx.stroke();
      rr(ctx, -3, -102, 6.5, 102, 2); fs(ctx, tim, 2.2);
    }
    ctx.restore();
    ell(ctx, 0, -160, 8.5); fs(ctx, '#f0c35a');
  }, { anim: true });

  // ---- oasis
  const CREAM = '#f6ead0', TEAL = '#3fb6c9', CORAL = '#e2674a', GOLD = '#f3c95c', BAMBOO = '#d9b36a';
  function tentDoor(ctx, x, hw, h, flap) { // dark entrance with drawn-back flaps; bottom-center at (x, 3)
    ctx.beginPath(); ctx.moveTo(x - hw, 3); ctx.quadraticCurveTo(x - hw * 0.92, -h * 0.9, x, -h); ctx.quadraticCurveTo(x + hw * 0.92, -h * 0.9, x + hw, 3); ctx.closePath(); fs(ctx, '#3a2c38');
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + s * hw, 3); ctx.quadraticCurveTo(x + s * hw * 0.92, -h * 0.9, x, -h); ctx.quadraticCurveTo(x + s * hw * 0.2, -h * 0.45, x + s * hw * 0.6, 3); ctx.closePath(); fs(ctx, flap, 2.2); }
  }
  function potShape(ctx, x, y, s, col) { // clay amphora, bottom-center at (x,y)
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    for (const sg of [-1, 1]) { ctx.beginPath(); ctx.arc(sg * 13, -38, 7, 0, TAU); ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 2.8; ctx.stroke(); }
    const body = () => { ctx.beginPath(); ctx.moveTo(-9, -50); ctx.lineTo(9, -50); ctx.lineTo(7.5, -43); ctx.bezierCurveTo(26, -36, 24, -8, 10, 3); ctx.lineTo(-10, 3); ctx.bezierCurveTo(-24, -8, -26, -36, -7.5, -43); ctx.closePath(); };
    body(); ctx.fillStyle = col; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = shade(col, -0.2); ctx.fillRect(8, -52, 20, 58);
    ctx.beginPath(); for (let zx = -24; zx <= 24; zx += 8) { ctx.lineTo(zx, -22); ctx.lineTo(zx + 4, -28); } ctx.strokeStyle = CREAM; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.fillStyle = CREAM; ctx.fillRect(-26, -16, 52, 2.4);
    ctx.restore();
    body(); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, -11.5, -55, 23, 6.5, 3); fs(ctx, shade(col, 0.15), 2.2);
    ctx.restore();
  }
  P_('tent_chief', 360, 290, (ctx) => {
    ln(ctx, '#8a6a44', 2.2, [-140, -104, -176, 2]); ln(ctx, '#8a6a44', 2.2, [140, -104, 176, 2]);
    rr(ctx, -181, -8, 10, 11, 2); fs(ctx, '#8a5a3c', 2); rr(ctx, 171, -8, 10, 11, 2); fs(ctx, '#8a5a3c', 2);
    const wp = () => poly(ctx, [-148, 3, -138, -106, 138, -106, 148, 3]);
    wp(); ctx.fillStyle = CREAM; ctx.fill();
    ctx.save(); ctx.clip();
    for (const sx of [-98, -52, 52, 98]) ln(ctx, shade(CREAM, -0.18), 2, [sx, -106, sx * 1.06, 3]);
    ctx.fillStyle = TEAL; ctx.fillRect(-150, -36, 300, 9); ctx.fillStyle = CORAL; ctx.fillRect(-150, -23, 300, 4);
    ctx.fillStyle = 'rgba(138,90,60,0.2)'; ctx.fillRect(96, -110, 60, 116);
    ctx.restore();
    wp(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    tentDoor(ctx, 0, 38, 92, shade(CREAM, -0.1));
    const rp = () => { ctx.beginPath(); ctx.moveTo(-162, -100); ctx.bezierCurveTo(-92, -130, -32, -190, 0, -254); ctx.bezierCurveTo(32, -190, 92, -130, 162, -100); ctx.closePath(); };
    rp(); ctx.fillStyle = CREAM; ctx.fill();
    ctx.save(); ctx.clip();
    for (let i = 0; i < 8; i += 2) { const xa = -164 + i * 41; poly(ctx, [0, -262, xa, -96, xa + 41, -96]); ctx.fillStyle = TEAL; ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; poly(ctx, [0, -262, -164, -96, -116, -96]); ctx.fill();
    ctx.restore();
    rp(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    for (let i = 0; i < 12; i++) { const xa = -162 + i * 27; ctx.beginPath(); ctx.moveTo(xa, -104); ctx.lineTo(xa, -96); ctx.quadraticCurveTo(xa + 13.5, -80, xa + 27, -96); ctx.lineTo(xa + 27, -104); ctx.closePath(); fs(ctx, i & 1 ? GOLD : CORAL, 2.2); }
    rr(ctx, -166, -110, 332, 9, 3); fs(ctx, CORAL, 2.4);
    ctx.fillStyle = GOLD; for (let dx = -150; dx <= 150; dx += 30) { poly(ctx, [dx, -109, dx + 4, -105.5, dx, -102, dx - 4, -105.5]); ctx.fill(); }
    ln(ctx, OUT, 4.8, [0, -254, 0, -284]); ln(ctx, '#8a5a3c', 2.2, [0, -254, 0, -284]);
    poly(ctx, [1, -285, 30, -277, 1, -269]); fs(ctx, CORAL, 2.2);
    ell(ctx, 0, -256, 6.5); fs(ctx, GOLD);
    rr(ctx, -60, -4, 120, 8, 2.5); fs(ctx, CORAL, 2.2); ln(ctx, GOLD, 1.8, [-54, 0, 54, 0]);
  });
  P_('tent_shop', 300, 226, (ctx) => {
    const cv = ['#f0a03a', CREAM], back = '#9a5f48';
    rr(ctx, -104, -150, 208, 153, 4); fs(ctx, back);
    for (let sx = -70; sx < 100; sx += 36) ln(ctx, shade(back, -0.22), 2, [sx, -148, sx, 0]);
    lantern(ctx, -70, -128, 1.1);
    hangSign(ctx, 14, -100, 'potion');
    ln(ctx, '#8a6a44', 2, [72, -128, 72, -112]); ell(ctx, 68, -104, 5, 9, 0.3); fs(ctx, '#6fae5a', 1.8); ell(ctx, 76, -104, 5, 9, -0.3); fs(ctx, '#5a9a4a', 1.8);
    for (const px of [-113, 104]) { rr(ctx, px, -170, 9, 173, 3); fs(ctx, BAMBOO); for (let yy = -140; yy < 0; yy += 34) ln(ctx, shade(BAMBOO, -0.3), 1.8, [px + 1, yy, px + 8, yy]); }
    // counter with patterned cloth
    const ct = () => rr(ctx, -100, -58, 200, 61, [0, 0, 4, 4]);
    ct(); ctx.fillStyle = TEAL; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.beginPath(); ctx.moveTo(-104, -30); for (let zx = -100; zx <= 100; zx += 20) { ctx.lineTo(zx, -30); ctx.lineTo(zx + 10, -41); } ctx.strokeStyle = GOLD; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.fillStyle = shade(TEAL, -0.18); ctx.fillRect(-100, -15, 200, 20);
    ctx.restore();
    ct(); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    // goods
    potShape(ctx, -78, -70, 0.56, '#c9783f');
    for (const [bx, c] of [[-46, '#e2574a'], [-28, '#5f9df0'], [-10, '#6fdc6f']]) { rr(ctx, bx - 2.4, -92, 4.8, 7, 1.2); fs(ctx, '#f6f1e2', 1.5); ell(ctx, bx, -79, 7, 7.6); fs(ctx, c, 1.8); ell(ctx, bx - 2.4, -81.5, 1.7, 2.3); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill(); }
    ell(ctx, 34, -78, 8.5); fs(ctx, '#f0a03a', 2); ell(ctx, 50, -77, 8); fs(ctx, '#e2574a', 2); ell(ctx, 42, -88, 8); fs(ctx, '#f0a03a', 2);
    rr(ctx, 66, -88, 26, 19, 3); fs(ctx, '#c99a5e', 2.2); ln(ctx, shade('#c99a5e', -0.28), 1.8, [66, -79, 92, -79]);
    rr(ctx, -108, -71, 216, 13, 3); fs(ctx, '#a06a3c');
    // canopy
    const cp = () => { ctx.beginPath(); ctx.moveTo(-132, -152); ctx.quadraticCurveTo(0, -206, 132, -152); ctx.lineTo(126, -128); ctx.lineTo(-126, -128); ctx.closePath(); };
    cp(); ctx.fillStyle = cv[1]; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = cv[0]; for (let i = 0; i < 11; i += 2) ctx.fillRect(-132 + i * 24, -208, 24, 82);
    ctx.beginPath(); ctx.moveTo(-126, -148); ctx.quadraticCurveTo(0, -198, 126, -148); ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 11; i++) { const xa = -126 + i * 22.9; ctx.beginPath(); ctx.moveTo(xa, -129); ctx.lineTo(xa, -124); ctx.quadraticCurveTo(xa + 11.45, -109, xa + 22.9, -124); ctx.lineTo(xa + 22.9, -129); ctx.closePath(); fs(ctx, shade(cv[i & 1], -0.1), 2.2); }
    cp(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, 118, -31, 34, 34, 3); fs(ctx, '#c99a5e'); ln(ctx, shade('#c99a5e', -0.25), 4, [124, -25, 146, -4]);
  });
  P_('tent_smith', 320, 240, (ctx) => {
    const cvs = '#a8463a';
    rr(ctx, -152, -160, 8, 163, 3); fs(ctx, BAMBOO);
    ln(ctx, OUT, 5.2, [-148, -156, -116, -156]); ln(ctx, '#8a5a3c', 2.4, [-148, -156, -116, -156]);
    hangSign(ctx, -126, -127, 'hammer');
    const tp = () => poly(ctx, [-116, 3, -30, -196, 100, -196, 152, 3]);
    tp(); ctx.fillStyle = cvs; ctx.fill();
    ctx.save(); ctx.clip();
    ln(ctx, shade(cvs, -0.22), 2, [-30, -196, -56, 3]); ln(ctx, shade(cvs, -0.22), 2, [100, -196, 116, 3]);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; poly(ctx, [-116, 3, -30, -196, -6, -196, -84, 3]); ctx.fill();
    rr(ctx, 108, -96, 20, 18, 2); ctx.fillStyle = shade(cvs, 0.2); ctx.fill(); ctx.setLineDash([3, 3]); ctx.strokeStyle = CREAM; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    tp(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    poly(ctx, [-76, 3, -18, -152, 80, -152, 106, 3]); fs(ctx, '#3a2c38');
    // clay furnace
    glow(ctx, -12, -34, 58, '#ff9a3a', 0.6);
    ctx.beginPath(); ctx.moveTo(-50, 3); ctx.bezierCurveTo(-54, -50, -34, -76, -12, -76); ctx.bezierCurveTo(10, -76, 30, -50, 26, 3); ctx.closePath(); fs(ctx, '#b9785a');
    ell(ctx, -12, -78, 9, 4.6); fs(ctx, '#5a3a34', 2);
    ctx.beginPath(); ctx.moveTo(-28, 3); ctx.quadraticCurveTo(-28, -40, -12, -40); ctx.quadraticCurveTo(4, -40, 4, 3); ctx.closePath(); fs(ctx, '#ff8a3a', 2.2, '#8a3a1e');
    ctx.beginPath(); ctx.moveTo(-21, 3); ctx.quadraticCurveTo(-21, -26, -12, -26); ctx.quadraticCurveTo(-3, -26, -3, 3); ctx.closePath(); ctx.fillStyle = '#ffd98a'; ctx.fill();
    rr(ctx, -42, -203, 154, 9, 4); fs(ctx, BAMBOO, 2.4);
    anvil(ctx, 70, 3);
  }, { light: { r: 120, color: '#ff9a3a', dy: -36 } });
  P_('tent_guild', 330, 340, (ctx) => {
    const ind = '#4a4f8a';
    rr(ctx, 138, -262, 8, 265, 3); fs(ctx, BAMBOO);
    ln(ctx, OUT, 5.6, [104, -250, 152, -250]); ln(ctx, '#8a5a3c', 2.6, [104, -250, 152, -250]);
    poly(ctx, [108, -247, 136, -247, 136, -180, 122, -168, 108, -180]); fs(ctx, '#f6a43c');
    emblem(ctx, 122, -213, 0.85);
    const tp = () => { ctx.beginPath(); ctx.moveTo(-128, 3); ctx.lineTo(-114, -122); ctx.bezierCurveTo(-70, -150, -24, -220, 0, -292); ctx.bezierCurveTo(24, -220, 70, -150, 114, -122); ctx.lineTo(128, 3); ctx.closePath(); };
    tp(); ctx.fillStyle = ind; ctx.fill();
    ctx.save(); ctx.clip();
    for (const sx of [-76, -38, 38, 76]) { ctx.beginPath(); ctx.moveTo(0, -292); ctx.quadraticCurveTo(sx * 0.9, -180, sx * 1.5, -118); ctx.lineTo(sx * 1.62, 3); ctx.strokeStyle = GOLD; ctx.lineWidth = 2.2; ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.moveTo(0, -292); ctx.quadraticCurveTo(-60, -190, -128, -110); ctx.lineTo(-90, -110); ctx.quadraticCurveTo(-40, -190, 0, -292); ctx.fill();
    ctx.fillStyle = 'rgba(29,20,48,0.2)'; ctx.fillRect(84, -130, 50, 136);
    ctx.restore();
    tp(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    for (let i = 0; i < 10; i++) { const xa = -116 + i * 23.2; ctx.beginPath(); ctx.moveTo(xa, -124); ctx.lineTo(xa, -116); ctx.quadraticCurveTo(xa + 11.6, -101, xa + 23.2, -116); ctx.lineTo(xa + 23.2, -124); ctx.closePath(); fs(ctx, GOLD, 2.2); }
    rr(ctx, -120, -130, 240, 8.5, 3); fs(ctx, shade(GOLD, -0.14), 2.2);
    tentDoor(ctx, 0, 36, 92, shade(ind, 0.16));
    ell(ctx, 0, -158, 19); fs(ctx, '#fbefd2', 2.4); emblem(ctx, 0, -157, 0.72);
    ln(ctx, OUT, 4.8, [0, -292, 0, -303]); lantern(ctx, 0, -322, 1);
  });
  P_('pinwheel', 110, 280, (ctx, t) => {
    for (const [sx, rd] of [[-13, 8], [12, 9], [0, 7]]) { ell(ctx, sx, -3, rd, rd * 0.72); fs(ctx, '#d9c49a'); }
    rr(ctx, -3.6, -228, 7.2, 226, 3); fs(ctx, BAMBOO);
    for (let yy = -200; yy < -10; yy += 38) ln(ctx, shade(BAMBOO, -0.3), 1.8, [-3, yy, 3, yy]);
    for (const [c, ph, len] of [[CORAL, 0, 42], [TEAL, 1.4, 30]]) {
      const w1 = Math.sin(t * 5 + ph) * 5, w2 = Math.sin(t * 6.3 + ph + 1) * 6;
      ctx.beginPath(); ctx.moveTo(-2, -186); ctx.quadraticCurveTo(-len * 0.5, -192 + w1, -len, -182 + w2); ctx.lineTo(-len + 2, -173 + w2); ctx.quadraticCurveTo(-len * 0.5, -182 + w1, -2, -177); ctx.closePath(); fs(ctx, c, 2);
    }
    ctx.save(); ctx.translate(0, -228); ctx.rotate(t * 2.6);
    const cols = [TEAL, CORAL, GOLD, CREAM];
    for (let i = 0; i < 4; i++) {
      ctx.rotate(PI / 2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-3, -47); ctx.quadraticCurveTo(26, -47, 32, -20); ctx.closePath(); fs(ctx, cols[i]);
      poly(ctx, [0, 0, 32, -20, 13, -8]); ctx.fillStyle = 'rgba(29,20,48,0.18)'; ctx.fill();
    }
    ctx.restore();
    ell(ctx, 0, -228, 5.6); fs(ctx, GOLD);
  }, { anim: true });
  function mkPalm(H, s) {
    return (ctx, t, seed) => {
      const r = sr(seed), bend = (14 + r() * 22) * (r() < 0.5 ? -1 : 1) * s, c1x = bend * 1.4, c1y = -H * 0.5, tx = bend * 0.9, ty = -H, tr = '#b98a5a';
      const g1 = '#3f9a6a', g2 = '#57b27c', g3 = '#2f7f58';
      const frond = (ang, L, col, droop) => {
        ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -L * 0.34, L, droop); ctx.quadraticCurveTo(L * 0.52, -L * 0.04, 0, 6 * s); ctx.closePath(); fs(ctx, col, 2.4);
        ctx.beginPath(); ctx.moveTo(4, 2); ctx.quadraticCurveTo(L * 0.5, -L * 0.2, L * 0.94, droop); ctx.strokeStyle = shade(col, -0.25); ctx.lineWidth = 1.6; ctx.stroke();
        ctx.restore();
      };
      frond(-2.5, 78 * s, g3, 26 * s); frond(-0.65, 80 * s, g3, 26 * s); frond(-1.57, 62 * s, g3, 4 * s);
      const trunk = () => { ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(c1x, c1y, tx, ty); };
      ctx.lineCap = 'butt';
      trunk(); ctx.strokeStyle = OUT; ctx.lineWidth = 20 * s + LW * 2; ctx.stroke();
      trunk(); ctx.strokeStyle = tr; ctx.lineWidth = 20 * s; ctx.stroke();
      ctx.lineCap = 'round';
      for (let u = 0.1; u < 0.95; u += 0.105) {
        const a = 1 - u, px = 2 * a * u * c1x + u * u * tx, py = a * a * 4 + 2 * a * u * c1y + u * u * ty;
        const dx = 2 * a * c1x + 2 * u * (tx - c1x), dy = 2 * a * (c1y - 4) + 2 * u * (ty - c1y), dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl, hw = 9 * s;
        ctx.beginPath(); ctx.moveTo(px - nx * hw, py - ny * hw); ctx.quadraticCurveTo(px + (dx / dl) * 4.5, py + (dy / dl) * 4.5, px + nx * hw, py + ny * hw); ctx.strokeStyle = shade(tr, -0.3); ctx.lineWidth = 2; ctx.stroke();
      }
      for (const [cx, cy] of [[-7, 6], [6, 8], [0, 12]]) { ell(ctx, tx + cx * s, ty + cy * s, 6.5 * s); fs(ctx, '#7a5236', 2); }
      frond(-2.95, 88 * s, g1, 40 * s); frond(-0.2, 90 * s, g1, 40 * s); frond(-2.1, 84 * s, g2, 12 * s); frond(-1.05, 86 * s, g2, 12 * s);
      frond(-1.78, 66 * s, g1, 2 * s); frond(-1.36, 64 * s, g2, 2 * s);
    };
  }
  P_('palm', 190, 304, mkPalm(238, 1));
  P_('palm_small', 136, 200, mkPalm(152, 0.72));
  P_('pot', 50, 58, (ctx, t, seed) => potShape(ctx, 0, 0, 1, sr(seed)() < 0.5 ? '#c9783f' : '#b8603a'));
  P_('rug_stall', 146, 108, (ctx) => {
    rr(ctx, -64, -98, 8, 101, 3); fs(ctx, BAMBOO); rr(ctx, 56, -98, 8, 101, 3); fs(ctx, BAMBOO);
    const rug = (x, w, len, c1, c2, c3) => {
      const b = () => rr(ctx, x, -94, w, len, 2);
      b(); ctx.fillStyle = c1; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = c2; ctx.fillRect(x, -86, w, 6); ctx.fillRect(x, -94 + len - 14, w, 6);
      const my = -94 + len / 2; poly(ctx, [x + w / 2, my - 12, x + w - 5, my, x + w / 2, my + 12, x + 5, my]); ctx.fillStyle = c3; ctx.fill();
      ctx.restore();
      b(); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
      for (let fx = x + 3; fx < x + w; fx += 5) ln(ctx, OUT, 1.5, [fx, -94 + len, fx, -94 + len + 5]);
    };
    rug(-52, 32, 76, CORAL, GOLD, CREAM); rug(-16, 32, 64, TEAL, CREAM, CORAL); rug(20, 32, 80, '#8a5fd0', GOLD, CREAM);
    rr(ctx, -70, -102, 140, 8, 3); fs(ctx, shade(BAMBOO, -0.1), 2.4);
  });
  P_('oasis_lamp', 50, 154, (ctx, t) => {
    const f = Math.sin(t * 5.7) * 0.5 + Math.sin(t * 8.9 + 2) * 0.5, br = '#c99a3a';
    poly(ctx, [-11, 3, 0, -10, 11, 3]); fs(ctx, shade(br, -0.2));
    rr(ctx, -3, -106, 6, 102, 3); fs(ctx, br);
    ell(ctx, 0, -60, 5, 4); fs(ctx, shade(br, 0.2), 2);
    glow(ctx, 0, -124, 44 + f * 3, '#ffd27a', 0.6);
    ctx.beginPath(); ctx.moveTo(0, -148); ctx.bezierCurveTo(4, -140, 14, -136, 14, -124); ctx.bezierCurveTo(14, -113, 7, -108, 0, -104); ctx.bezierCurveTo(-7, -108, -14, -113, -14, -124); ctx.bezierCurveTo(-14, -136, -4, -140, 0, -148); ctx.closePath(); fs(ctx, '#7fd8d0');
    ell(ctx, 0, -123, 7 + f * 0.5, 9.5); ctx.fillStyle = '#ffe9a0'; ctx.fill(); ell(ctx, 0, -121, 3, 5.4); ctx.fillStyle = '#ff9a2e'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, -139); ctx.quadraticCurveTo(-9, -124, -5, -108); ctx.moveTo(6, -139); ctx.quadraticCurveTo(9, -124, 5, -108); ctx.strokeStyle = br; ctx.lineWidth = 2; ctx.stroke();
    rr(ctx, -8, -109, 16, 5, 2); fs(ctx, br, 2); ell(ctx, 0, -150, 3); fs(ctx, br, 1.8);
  }, { anim: true, light: { r: 140, color: '#ffd27a', dy: -124 } });

  // ---- dungeon / wilderness landmarks
  const CY = '#7fe0ff', VI = '#c79bff';
  function crystal(ctx, x, y, len, wd, rot, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const body = () => poly(ctx, [-wd, 2, -wd, -len * 0.72, 0, -len, wd, -len * 0.72, wd, 2]);
    body(); ctx.fillStyle = col; ctx.fill();
    poly(ctx, [0, 2, 0, -len, wd, -len * 0.72, wd, 2]); ctx.fillStyle = shade(col, -0.2); ctx.fill();
    poly(ctx, [-wd * 0.64, -2, -wd * 0.64, -len * 0.7, -wd * 0.28, -len * 0.82, -wd * 0.28, -2]); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
    body(); ctx.lineWidth = 2.4; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.restore();
  }
  function snowLobe(ctx, x0, x1, h, r) { // lobed snow mound sitting on the ground
    const n = Math.max(2, Math.round((x1 - x0) / 34)), sw = (x1 - x0) / n;
    ctx.beginPath(); ctx.moveTo(x0, 3);
    for (let i = 0; i < n; i++) { const hh = h * (0.6 + (r ? r() : ((i * 37) % 10) / 10) * 0.6) * (1 - Math.abs((i + 0.5) / n - 0.5) * 0.9); ctx.quadraticCurveTo(x0 + (i + 0.5) * sw, 3 - hh * 2, x0 + (i + 1) * sw, 3 - (i === n - 1 ? 0 : hh * 0.35)); }
    ctx.closePath(); fs(ctx, '#f6fbff');
  }
  function iceSpike(ctx, x, w, h, lean, col) {
    const tip = x + lean, body = () => poly(ctx, [x - w, 3, tip, -h, x + w, 3]);
    body(); ctx.fillStyle = col; ctx.fill();
    poly(ctx, [x + w * 0.1, 3, tip, -h, x + w, 3]); ctx.fillStyle = shade(col, -0.16); ctx.fill();
    poly(ctx, [x - w * 0.55, 0, tip - w * 0.1, -h * 0.82, x - w * 0.2, 0]); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    body(); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
  }
  P_('torch', 36, 116, (ctx, t) => {
    rr(ctx, -3.6, -76, 7.2, 79, 3); fs(ctx, '#7a5236');
    ln(ctx, '#d8c49a', 2, [-3.5, -52, 3.5, -49.5]); ln(ctx, '#d8c49a', 2, [-3.5, -47, 3.5, -44.5]);
    glow(ctx, 0, -96, 48 + Math.sin(t * 8.1) * 3, '#ffb04a', 0.5);
    flame(ctx, 0, -84, 21, 36, t, 1.3, '#ff7a2e', '#ffb02e', '#fff1a8');
    poly(ctx, [-10, -88, 10, -88, 6.5, -73, -6.5, -73]); fs(ctx, '#5f5d70');
    sparks(ctx, 0, -110, t, 3, 8, 40, '#ffd27a');
  }, { anim: true, light: { r: 160, color: '#ffb04a', dy: -94 } });
  P_('crystal_big', 136, 142, (ctx, t, seed) => {
    const r = sr(seed), a = r() < 0.5 ? CY : VI, b = a === CY ? VI : CY;
    glow(ctx, 0, -58, 96, a, 0.34);
    ell(ctx, -30, -4, 26, 10); fs(ctx, '#4a4466'); ell(ctx, 26, -3, 28, 11); fs(ctx, '#4a4466');
    crystal(ctx, -46, -2, 36, 8, -0.85, b); crystal(ctx, 50, -2, 42, 9, 0.8, a);
    crystal(ctx, -32, 0, 62, 11, -0.45, a); crystal(ctx, 30, 0, 72, 12, 0.4, b);
    crystal(ctx, 12, 0, 88, 13, 0.16, shade(a, 0.2)); crystal(ctx, -12, 0, 108, 15, -0.1, a);
    crystal(ctx, 2, 2, 34, 9, 0.04, shade(b, 0.3));
    ell(ctx, 0, 1, 44, 8); fs(ctx, '#5a5480');
    ctx.fillStyle = '#ffffff'; for (const [sx, sy] of [[-24, -84], [26, -70], [4, -118]]) { A.star(ctx, sx, sy, 5, 1.6, 4, 0); ctx.fill(); }
  }, { light: { r: 170, color: CY, dy: -60 } });
  P_('crystal_small', 50, 56, (ctx, t, seed) => {
    const r = sr(seed), a = r() < 0.6 ? CY : VI;
    glow(ctx, 0, -22, 40, a, 0.36);
    crystal(ctx, -11, 1, 26, 6, -0.5, shade(a, -0.05)); crystal(ctx, 12, 1, 30, 6.5, 0.45, a); crystal(ctx, 0, 2, 44, 8, -0.04, shade(a, 0.15));
    ell(ctx, 0, 1.5, 20, 5); fs(ctx, '#4a4466');
  }, { light: { r: 80, color: CY, dy: -24 } });
  P_('gloom_crystal', 72, 86, (ctx) => {
    const a = '#b06aff', b = '#7a3fd0';
    glow(ctx, 0, -36, 58, a, 0.4);
    crystal(ctx, -17, 1, 38, 8, -0.5, b); crystal(ctx, 18, 1, 44, 8.5, 0.48, b); crystal(ctx, 0, 2, 70, 11, 0.03, a); crystal(ctx, 6, 2, 26, 7, 0.3, '#d8b0ff');
    ell(ctx, 0, 1.5, 26, 6); fs(ctx, '#3a3050');
  }, { light: { r: 110, color: '#b06aff', dy: -38 } });
  P_('brazier', 80, 128, (ctx, t) => {
    const ir = '#4a4458';
    for (const [x0, x1] of [[-18, -27], [18, 27], [0, 0]]) tube(ctx, ir, 4, () => { ctx.beginPath(); ctx.moveTo(x0, -56); ctx.lineTo(x1, 2); });
    tube(ctx, shade(ir, 0.2), 2.6, () => { ctx.beginPath(); ctx.moveTo(-22, -26); ctx.lineTo(22, -26); });
    glow(ctx, 0, -96, 64 + Math.sin(t * 7.7) * 4, '#b06aff', 0.5);
    flame(ctx, -12, -76, 20, 30, t, 2.2, '#7a3fd0', '#b06aff', '#f0d8ff');
    flame(ctx, 12, -76, 18, 26, t, 4.1, '#7a3fd0', '#b06aff', '#f0d8ff');
    flame(ctx, 0, -78, 34, 54, t, 0, '#7a3fd0', '#b06aff', '#f0d8ff');
    ctx.beginPath(); ctx.moveTo(-31, -76); ctx.quadraticCurveTo(-28, -50, 0, -50); ctx.quadraticCurveTo(28, -50, 31, -76); ctx.closePath(); fs(ctx, ir);
    rr(ctx, -34, -81, 68, 8, 3.5); fs(ctx, shade(ir, 0.2));
    sparks(ctx, 0, -118, t, 4, 14, 50, '#d8b0ff');
  }, { anim: true, light: { r: 170, color: '#b06aff', dy: -92 } });
  P_('banner_torn', 74, 208, (ctx, t, seed) => {
    const r = sr(seed), col = r() < 0.5 ? '#6a2a4a' : '#4a3a6a', pole = '#4a3a3a';
    rr(ctx, -4, -192, 8, 195, 3); fs(ctx, pole);
    poly(ctx, [-5.5, -190, 0, -206, 5.5, -190]); fs(ctx, '#8a8098', 2.2);
    const cl = () => poly(ctx, [4, -174, 42, -174, 42, -98, 35, -110, 29, -84, 22, -102, 15, -76, 9, -98, 4, -88]);
    cl(); ctx.fillStyle = col; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = shade(col, -0.25); ctx.fillRect(4, -174, 5, 100); ctx.fillRect(37, -174, 5, 100);
    ctx.globalAlpha = 0.5; emblem(ctx, 23, -138, 0.8, false); ctx.globalAlpha = 1;
    ctx.restore();
    cl(); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, -6, -181, 54, 7, 3); fs(ctx, pole, 2.4);
  });
  P_('pillar_broken', 100, 188, (ctx, t, seed) => {
    const r = sr(seed), c = '#8a8098', d = shade(c, -0.28), hgt = 120 + r() * 40;
    poly(ctx, [36, 3, 32, -13, 46, -22, 60, -11, 58, 3]); fs(ctx, shade(c, -0.1));
    ell(ctx, -46, -2, 8, 5.5); fs(ctx, shade(c, -0.1), 2.2);
    const sh = () => poly(ctx, [-24, -26, -22, -hgt, -13, -hgt - 12, -5, -hgt + 4, 5, -hgt - 20, 13, -hgt, 22, -hgt - 8, 24, -26]);
    sh(); ctx.fillStyle = c; ctx.fill();
    ctx.save(); ctx.clip();
    for (const fx of [-14, -4, 6, 15]) ln(ctx, d, 2, [fx, -hgt - 24, fx, -26]);
    ctx.fillStyle = 'rgba(29,20,48,0.18)'; ctx.fillRect(12, -hgt - 30, 14, hgt + 10);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(-24, -hgt - 30, 7, hgt + 10);
    ctx.restore();
    sh(); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    ln(ctx, OUT, 1.8, [-8, -hgt * 0.62, -2, -hgt * 0.5, -9, -hgt * 0.4]);
    rr(ctx, -30, -29, 60, 15, 3); fs(ctx, shade(c, 0.1)); rr(ctx, -37, -15, 74, 18, 3); fs(ctx, c);
    ln(ctx, shade(c, 0.35), 2, [-31, -10.5, 31, -10.5]);
  });
  P_('statue_keeper', 124, 232, (ctx) => {
    const c = '#a39db0', d = shade(c, -0.24), hl = shade(c, 0.22), moss = '#6fae5a';
    rr(ctx, -46, -12, 92, 15, 3); fs(ctx, d);
    rr(ctx, -38, -54, 76, 44, 3); fs(ctx, c);
    rr(ctx, -18, -44, 36, 22, 3); fs(ctx, d, 2); ln(ctx, hl, 1.8, [-11, -36, 11, -36]); ln(ctx, hl, 1.8, [-11, -30, 6, -30]);
    rr(ctx, -44, -64, 88, 12, 3); fs(ctx, hl);
    // lantern rod
    tube(ctx, c, 4.4, () => { ctx.beginPath(); ctx.moveTo(32, -64); ctx.lineTo(32, -198); ctx.quadraticCurveTo(33, -210, 44, -208); });
    rr(ctx, 37, -206, 15, 5, 2); fs(ctx, d, 2); rr(ctx, 38, -201, 13, 17, 3); fs(ctx, hl, 2.2);
    // robe
    ctx.beginPath(); ctx.moveTo(-17, -124); ctx.lineTo(17, -124); ctx.quadraticCurveTo(22, -92, 27, -64); ctx.lineTo(-27, -64); ctx.quadraticCurveTo(-22, -92, -17, -124); ctx.closePath(); fs(ctx, c);
    ln(ctx, d, 2, [-6, -116, -9, -68]); ln(ctx, d, 2, [7, -116, 11, -68]);
    ctx.save(); ctx.translate(-15, -114); ctx.rotate(0.12); A.capsule(ctx, 20, 10); fs(ctx, d, 2.4); ctx.restore();
    ctx.save(); ctx.translate(14, -114); ctx.rotate(-0.95); A.capsule(ctx, 17, 10); fs(ctx, c, 2.4); ctx.restore();
    ell(ctx, 31, -103, 6.2); fs(ctx, hl, 2.2);
    rr(ctx, -18, -132, 36, 11, 5); fs(ctx, d);
    // head + hood
    ell(ctx, 1, -150, 25, 23); fs(ctx, hl);
    ctx.beginPath(); ctx.moveTo(-26, -140); ctx.bezierCurveTo(-34, -174, -10, -182, 4, -178); ctx.bezierCurveTo(20, -176, 28, -162, 26, -152); ctx.quadraticCurveTo(12, -162, -4, -156); ctx.quadraticCurveTo(-14, -148, -15, -130); ctx.closePath(); fs(ctx, c);
    ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.beginPath(); ctx.arc(6, -148, 3.4, 0.15 * PI, 0.85 * PI); ctx.stroke(); ctx.beginPath(); ctx.arc(17, -148, 3, 0.15 * PI, 0.85 * PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(11.5, -141, 2.6, 0.2 * PI, 0.8 * PI); ctx.stroke();
    ell(ctx, -19, -171, 9, 5, -0.5); fs(ctx, moss, 1.8); ell(ctx, -33, -65, 12, 5); fs(ctx, moss, 1.8); ell(ctx, 30, -12, 10, 4.5); fs(ctx, moss, 1.8);
    ln(ctx, OUT, 1.6, [-8, -102, -3, -92, -9, -82]); ln(ctx, OUT, 1.6, [22, -42, 27, -32, 23, -22]);
  });
  P_('throne_seat', 244, 316, (ctx) => {
    const c = '#3a3050', c2 = '#453c5a', hi = '#5f547c', cr = '#7a2a4a', gd = '#ffcf4a', gm = '#b06aff';
    for (const sg of [-1, 1]) {
      ln(ctx, OUT, 1.8, [sg * 68, -222, sg * 86, -196]);
      rr(ctx, sg * 86 - 7, -196, 14, 5, 2); fs(ctx, '#2a2238', 1.8); rr(ctx, sg * 86 - 6, -191, 12, 16, 3); fs(ctx, '#4a4066', 2);
      glow(ctx, sg * 86, -183, 12, gm, 0.3);
    }
    poly(ctx, [-60, -30, -60, -190, -72, -228, -49, -208, -35, -250, -17, -262, 0, -306, 17, -262, 35, -250, 49, -208, 72, -228, 60, -190, 60, -30]); fs(ctx, c, 3);
    ln(ctx, hi, 2.2, [-54, -40, -54, -186]);
    poly(ctx, [-41, -40, -41, -190, -25, -234, 0, -256, 25, -234, 41, -190, 41, -40]); fs(ctx, cr, 2.2);
    poly(ctx, [-34, -46, -34, -188, -20, -228, 0, -246, 20, -228, 34, -188, 34, -46]); ctx.lineWidth = 1.8; ctx.strokeStyle = gd; ctx.stroke();
    ctx.fillStyle = gd; for (const [bx, by] of [[0, -200], [-17, -172], [17, -172], [0, -144], [-17, -116], [17, -116]]) { poly(ctx, [bx, by - 5, bx + 4, by, bx, by + 5, bx - 4, by]); ctx.fill(); }
    glow(ctx, 0, -273, 30, gm, 0.6);
    poly(ctx, [0, -287, 9, -273, 0, -259, -9, -273]); fs(ctx, gm, 2.2); ln(ctx, '#f0d8ff', 1.6, [-3, -276, 0, -282]);
    for (const sg of [-1, 1]) { rr(ctx, sg * 67 - 12, -120, 24, 68, 7); fs(ctx, c); ell(ctx, sg * 67, -123, 11.5); fs(ctx, c2); ell(ctx, sg * 67 - 3, -126, 3.4); ctx.fillStyle = hi; ctx.fill(); }
    rr(ctx, -62, -94, 124, 40, 6); fs(ctx, c2);
    rr(ctx, -54, -104, 108, 20, 9); fs(ctx, '#9a3a5a');
    ln(ctx, 'rgba(255,255,255,0.25)', 2.2, [-44, -99, 30, -99]);
    rr(ctx, -58, -62, 116, 34, 3); fs(ctx, c); ln(ctx, gd, 2, [-50, -54, 50, -54]);
    rr(ctx, -100, -32, 200, 19, 4); fs(ctx, c2); ln(ctx, gd, 2, [-92, -22, 92, -22]);
    rr(ctx, -120, -15, 240, 19, 4); fs(ctx, c); ln(ctx, hi, 2, [-112, -10, 112, -10]);
  }, { light: { r: 130, color: '#b06aff', dy: -272 } });
  P_('ice_spire', 116, 208, (ctx, t, seed) => {
    const r = sr(seed), k = 0.8 + r() * 0.25, ice = '#a8dcf6';
    iceSpike(ctx, -34, 11, 104 * k, -8, shade(ice, -0.08)); iceSpike(ctx, 30, 13, 134 * k, 8, ice);
    iceSpike(ctx, -4, 16, 196 * k, 2, '#c6ecff');
    iceSpike(ctx, -48, 8, 46, -4, ice); iceSpike(ctx, 48, 8, 60, 5, shade(ice, -0.08)); iceSpike(ctx, 14, 9, 54, 3, '#dff4ff');
    snowLobe(ctx, -60, 60, 12);
    A.star(ctx, -13, -150 * k, 6, 1.8, 4, 0); ctx.fillStyle = '#ffffff'; ctx.fill();
  });
  function mkPine(s, col) {
    return (ctx, t, seed) => {
      const r = sr(seed), sc = s * (0.92 + r() * 0.16), lw = LW / sc;
      ctx.save(); ctx.scale(sc, sc);
      rr(ctx, -9, -44, 18, 48, 3); fs(ctx, '#6a4a3a', lw);
      for (const [hw, yb, yt] of [[86, -30, -140], [70, -92, -196], [53, -150, -246], [36, -204, -288]]) {
        const ym = yt + (yb - yt) * 0.55, sx = hw * 0.6, sy = yt + (yb - yt) * 0.6;
        const tp = () => { ctx.beginPath(); ctx.moveTo(0, yt); ctx.quadraticCurveTo(-hw * 0.3, ym, -hw, yb); ctx.lineTo(-hw * 0.62, yb - 11); ctx.lineTo(-hw * 0.3, yb + 3); ctx.lineTo(0, yb - 10); ctx.lineTo(hw * 0.3, yb + 3); ctx.lineTo(hw * 0.62, yb - 11); ctx.lineTo(hw, yb); ctx.quadraticCurveTo(hw * 0.3, ym, 0, yt); ctx.closePath(); };
        tp(); ctx.fillStyle = col; ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(29,20,48,0.2)'; ctx.fillRect(hw * 0.18, yt, hw, yb - yt + 6); ctx.restore();
        tp(); ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, yt - 3); ctx.quadraticCurveTo(-hw * 0.22, ym - 8, -sx, sy);
        ctx.quadraticCurveTo(-sx * 0.7, sy + 13, -sx * 0.4, sy - 2); ctx.quadraticCurveTo(-sx * 0.05, sy + 15, sx * 0.3, sy - 3); ctx.quadraticCurveTo(sx * 0.62, sy + 12, sx, sy);
        ctx.quadraticCurveTo(hw * 0.22, ym - 8, 0, yt - 3); ctx.closePath(); fs(ctx, '#f6fbff', lw * 0.85);
      }
      ctx.restore();
    };
  }
  P_('snow_pine', 184, 308, mkPine(1, '#3a7a6e'));
  P_('snow_pine_small', 118, 200, mkPine(0.62, '#3f8474'));
  P_('rock_arch', 336, 224, (ctx, t, seed) => {
    const P = A.PAL.canyon, r = sr(seed);
    const ap = () => { ctx.beginPath(); ctx.moveTo(-162, 3); ctx.lineTo(-152, -120); ctx.quadraticCurveTo(-142, -200, -62, -214); ctx.lineTo(72, -208); ctx.quadraticCurveTo(152, -192, 158, -110); ctx.lineTo(164, 3); ctx.lineTo(98, 3); ctx.lineTo(94, -90); ctx.quadraticCurveTo(86, -142, 10, -148); ctx.quadraticCurveTo(-70, -142, -80, -80); ctx.lineTo(-88, 3); ctx.closePath(); };
    ap(); ctx.fillStyle = P.body; ctx.fill();
    ctx.save(); ctx.clip();
    for (let yy = -204; yy < 0; yy += 24) {
      const ph = r() * 6, c = r() < 0.5 ? rgba(P.body2, 0.42) : rgba(P.edge, 0.45), tk = 6 + r() * 9;
      ctx.beginPath(); ctx.moveTo(-170, yy); for (let xx = -170; xx <= 170; xx += 14) ctx.lineTo(xx, yy + Math.sin(xx * 0.03 + ph) * 3); for (let xx = 170; xx >= -170; xx -= 14) ctx.lineTo(xx, yy + tk + Math.sin(xx * 0.04 + ph) * 3);
      ctx.closePath(); ctx.fillStyle = c; ctx.fill();
    }
    ctx.fillStyle = rgba(P.top, 0.55); ctx.fillRect(-170, -218, 340, 13);
    ctx.fillStyle = 'rgba(29,20,48,0.16)'; ctx.fillRect(126, -218, 44, 224); ctx.fillRect(-96, -150, 14, 156);
    ctx.restore();
    ap(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
  });
  P_('cactus_tall', 92, 168, (ctx, t, seed) => {
    const r = sr(seed), g = '#5fae6a', gl = shade(g, 0.22), fl = r() < 0.5 ? '#f291b3' : '#ffd84a', ah = 96 + r() * 26, bh = 70 + r() * 30;
    tube(ctx, g, 15, () => { ctx.beginPath(); ctx.moveTo(-10, -64); ctx.lineTo(-28, -64); ctx.quadraticCurveTo(-38, -64, -38, -76); ctx.lineTo(-38, -ah); });
    tube(ctx, g, 14, () => { ctx.beginPath(); ctx.moveTo(10, -46); ctx.lineTo(27, -46); ctx.quadraticCurveTo(36, -46, 36, -58); ctx.lineTo(36, -bh); });
    ln(ctx, gl, 2, [-40, -78, -40, -ah + 4]); ln(ctx, gl, 2, [34, -60, 34, -bh + 4]);
    rr(ctx, -14, -152, 28, 156, 14); fs(ctx, g);
    ln(ctx, gl, 2.2, [-5, -142, -5, -2]); ln(ctx, shade(g, -0.2), 2.2, [5, -142, 5, -2]);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let yy = -136; yy < -8; yy += 20) { ctx.moveTo(-14, yy); ctx.lineTo(-19, yy - 3); ctx.moveTo(14, yy + 9); ctx.lineTo(19, yy + 6); }
    ctx.stroke();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; ell(ctx, Math.cos(a) * 5, -154 + Math.sin(a) * 4, 4.4, 3.6); fs(ctx, fl, 1.6); }
    ell(ctx, 0, -154, 2.6); fs(ctx, '#ffd84a', 1.4);
  });
  P_('cactus_small', 46, 62, (ctx, t, seed) => {
    const r = sr(seed), g = '#6fba6a', fl = r() < 0.5 ? '#f291b3' : '#ff8a4a';
    if (r() < 0.5) {
      ell(ctx, 0, -20, 19, 23); fs(ctx, g);
      for (const sx of [-10, 0, 10]) { ctx.beginPath(); ctx.moveTo(sx * 0.4, -42); ctx.quadraticCurveTo(sx * 1.4, -20, sx * 0.5, 2); ctx.strokeStyle = shade(g, -0.22); ctx.lineWidth = 2; ctx.stroke(); }
      ell(ctx, 0, -44, 7, 4.6); fs(ctx, fl, 1.8); ell(ctx, 0, -45, 2.6, 2); ctx.fillStyle = '#ffd84a'; ctx.fill();
    } else {
      ell(ctx, -10, -30, 10, 13, -0.35); fs(ctx, shade(g, -0.08)); ell(ctx, 12, -40, 9, 12, 0.4); fs(ctx, shade(g, 0.1));
      ell(ctx, 0, -17, 13, 20); fs(ctx, g);
      ell(ctx, 15, -53, 4.4, 3.6); fs(ctx, fl, 1.6);
      ctx.fillStyle = OUT; for (const [dx, dy] of [[-4, -24], [5, -14], [-2, -6], [-11, -32], [12, -40]]) { ctx.beginPath(); ctx.arc(dx, dy, 1.1, 0, TAU); ctx.fill(); }
    }
  });

  // ---- scatter decor (factories)
  function blobs(ctx, list, fill, lw) { // merged round blobs [x, y, r, ...] with one shared outline
    for (let i = 0; i < list.length; i += 3) { ell(ctx, list[i], list[i + 1], list[i + 2]); ctx.lineWidth = (lw || LW) * 2; ctx.strokeStyle = OUT; ctx.stroke(); }
    ctx.fillStyle = fill; for (let i = 0; i < list.length; i += 3) { ell(ctx, list[i], list[i + 1], list[i + 2]); ctx.fill(); }
  }
  function canopy(ctx, list, cols, r, arcs, lw) { // leafy mass: base + top-left light + leaf scallops
    blobs(ctx, list, cols[0], lw);
    ctx.save(); ctx.beginPath();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < list.length; i += 3) {
      ctx.moveTo(list[i] + list[i + 2], list[i + 1]); ctx.arc(list[i], list[i + 1], list[i + 2], 0, TAU);
      x0 = Math.min(x0, list[i] - list[i + 2]); x1 = Math.max(x1, list[i] + list[i + 2]); y0 = Math.min(y0, list[i + 1] - list[i + 2]); y1 = Math.max(y1, list[i + 1] + list[i + 2]);
    }
    ctx.clip();
    ctx.fillStyle = cols[1];
    for (let i = 0; i < list.length; i += 3) { ell(ctx, list[i] - list[i + 2] * 0.16, list[i + 1] - list[i + 2] * 0.22, list[i + 2] * 0.74); ctx.fill(); }
    ctx.strokeStyle = cols[2]; ctx.lineWidth = 2.2;
    for (let i = 0; i < arcs; i++) { const ax = x0 + r() * (x1 - x0), ay = y0 + (0.25 + r() * 0.75) * (y1 - y0); ctx.beginPath(); ctx.arc(ax, ay, 8 + r() * 6, 0.15 * PI, 0.85 * PI); ctx.stroke(); }
    ctx.restore();
  }
  function mkTree(H, R, cols, trunkCol, o) {
    o = o || {};
    return (ctx, t, seed) => {
      const r = sr(seed), k = 0.9 + r() * 0.2, hh = H * k, rd = R * k, lean = (r() - 0.5) * 16, tw = (o.tw || 11) * k;
      ctx.beginPath(); ctx.moveTo(-tw - 3, 4); ctx.quadraticCurveTo(-tw * 0.6, -hh * 0.3, lean - tw * 0.6, -hh * 0.6); ctx.lineTo(lean + tw * 0.6, -hh * 0.6); ctx.quadraticCurveTo(tw * 0.6, -hh * 0.3, tw + 4, 4); ctx.closePath(); fs(ctx, trunkCol);
      ln(ctx, shade(trunkCol, -0.28), 2, [-2, -hh * 0.08, lean * 0.3 - 1, -hh * 0.28]); ln(ctx, shade(trunkCol, -0.28), 2, [3, -hh * 0.3, lean * 0.6 + 3, -hh * 0.46]);
      ln(ctx, shade(trunkCol, 0.25), 2, [-tw * 0.5, -hh * 0.12, lean * 0.4 - tw * 0.4, -hh * 0.4]);
      const cx = lean, cy = -hh * 0.74;
      canopy(ctx, [cx, cy, rd, cx - rd * 0.78, cy + rd * 0.3, rd * 0.7, cx + rd * 0.8, cy + rd * 0.26, rd * 0.68, cx - rd * 0.36, cy - rd * 0.6, rd * 0.64, cx + rd * 0.42, cy - rd * 0.56, rd * 0.6], cols, r, 8);
      if (o.fruit && r() < 0.5) for (let i = 0; i < 5; i++) { ell(ctx, cx + (r() - 0.5) * rd * 1.7, cy + (r() - 0.3) * rd, 4.6); fs(ctx, o.fruit, 1.8); }
    };
  }
  P_('tree_round', 200, 280, mkTree(250, 64, ['#5fb85a', '#86d46e', '#3f9a4f'], '#8a5a3c', { fruit: '#e2574a' }));
  P_('tree_small', 128, 180, mkTree(158, 42, ['#6cc060', '#93dc74', '#479f52'], '#8a5a3c', { tw: 8 }));
  function mkTreeForest(H, R, tw) {
    return (ctx, t, seed) => {
      const r = sr(seed), k = 0.9 + r() * 0.2, hh = H * k, rd = R * k, lean = (r() - 0.5) * 20, tr = '#4f3a2c', g = ['#2f7a4a', '#44995c', '#215c3a'];
      const by = -hh * (0.42 + r() * 0.1), sg = r() < 0.5 ? -1 : 1;
      tube(ctx, tr, 7, () => { ctx.beginPath(); ctx.moveTo(sg * tw * 0.4, by); ctx.quadraticCurveTo(sg * (tw + 20), by - 6, sg * (tw + 44), by - 26); });
      ctx.beginPath(); ctx.moveTo(-tw * 2.1, 4); ctx.quadraticCurveTo(-tw * 0.9, -14, -tw * 0.8, -60); ctx.lineTo(lean - tw * 0.62, -hh * 0.72); ctx.lineTo(lean + tw * 0.62, -hh * 0.72); ctx.lineTo(tw * 0.8, -60); ctx.quadraticCurveTo(tw * 0.9, -14, tw * 2.2, 4); ctx.closePath(); fs(ctx, tr);
      for (let i = 0; i < 5; i++) { const u = 0.12 + i * 0.13, bx = lean * u + (r() - 0.5) * tw, byy = -hh * 0.72 * u - 30; ln(ctx, i & 1 ? '#6a5040' : shade(tr, -0.3), 2, [bx, byy, bx + (r() - 0.5) * 3, byy - 16 - r() * 14]); }
      canopy(ctx, [sg * (tw + 50), by - 34, 24, sg * (tw + 30), by - 44, 19, sg * (tw + 68), by - 24, 16], g, r, 2);
      const cx = lean, cy = -hh * 0.8;
      for (let i = 0; i < 3; i++) { const vx = cx + (r() - 0.5) * rd * 1.9, len = 40 + r() * 60, vy = cy + rd * 0.5; tube(ctx, g[2], 2.4, () => { ctx.beginPath(); ctx.moveTo(vx, vy); ctx.quadraticCurveTo(vx + 5, vy + len * 0.6, vx - 2, vy + len); }); ell(ctx, vx - 2, vy + len + 1, 3.4, 4.4); fs(ctx, g[1], 1.6); }
      canopy(ctx, [cx, cy, rd, cx - rd * 0.85, cy + rd * 0.34, rd * 0.72, cx + rd * 0.88, cy + rd * 0.3, rd * 0.7, cx - rd * 0.4, cy - rd * 0.5, rd * 0.66, cx + rd * 0.46, cy - rd * 0.46, rd * 0.62, cx - rd * 1.4, cy + rd * 0.62, rd * 0.42, cx + rd * 1.42, cy + rd * 0.6, rd * 0.4], g, r, 12);
    };
  }
  P_('tree_forest', 260, 450, mkTreeForest(400, 84, 17));
  P_('tree_forest_thin', 170, 390, mkTreeForest(350, 56, 11));
  P_('tree_mangrove', 240, 340, (ctx, t, seed) => {
    const r = sr(seed), tr = '#5a4a40', g = ['#2f6a5e', '#44907a', '#1f4a44'], lean = (r() - 0.5) * 30;
    for (const [x0, cx_] of [[-64, -50], [70, 52], [-30, -22], [34, 26], [0, 2]]) tube(ctx, tr, 7, () => { ctx.beginPath(); ctx.moveTo(x0, 4); ctx.quadraticCurveTo(cx_, -70, x0 * 0.12, -104); });
    ctx.beginPath(); ctx.moveTo(-15, -92); ctx.quadraticCurveTo(-20 + lean * 0.5, -150, lean - 10, -218); ctx.lineTo(lean + 10, -218); ctx.quadraticCurveTo(14 + lean * 0.5, -150, 16, -92); ctx.closePath(); fs(ctx, tr);
    ln(ctx, shade(tr, -0.3), 2, [-3 + lean * 0.3, -120, -2 + lean * 0.5, -160]); ln(ctx, shade(tr, 0.2), 2, [5 + lean * 0.4, -140, 5 + lean * 0.7, -190]);
    const cx = lean, cy = -264;
    for (let i = 0; i < 5; i++) { const mx = cx + (i - 2) * 40 + (r() - 0.5) * 14, len = 40 + r() * 46, my = cy + 24 + Math.abs(i - 2) * 12; ctx.beginPath(); ctx.moveTo(mx - 7, my); ctx.quadraticCurveTo(mx - 4, my + len * 1.5, mx, my + len * 0.3); ctx.quadraticCurveTo(mx + 5, my + len * 1.1, mx + 8, my); ctx.closePath(); fs(ctx, g[2], 2); }
    canopy(ctx, [cx, cy, 52, cx - 56, cy + 18, 42, cx + 58, cy + 16, 40, cx - 96, cy + 34, 26, cx + 96, cy + 32, 24, cx - 24, cy - 22, 38, cx + 28, cy - 20, 36], g, r, 10);
  });
  P_('dead_tree_snow', 130, 210, (ctx, t, seed) => {
    const r = sr(seed), tr = '#6a5a58', sg = r() < 0.5 ? -1 : 1;
    for (const [x0, y0, x1, y1, lw] of [[0, -80, sg * 44, -128, 5], [0, -112, -sg * 38, -160, 4.4], [0, -140, sg * 26, -186, 3.6], [sg * 26, -110, sg * 54, -108, 3]]) {
      tube(ctx, tr, lw, () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 - 6, x1, y1); });
      ell(ctx, x1 * 0.8 + x0 * 0.2, y1 * 0.8 + y0 * 0.2 - lw - 1.5, 9, 3.6); fs(ctx, '#f6fbff', 1.6);
    }
    ctx.beginPath(); ctx.moveTo(-11, 4); ctx.quadraticCurveTo(-6, -60, -3, -196); ctx.lineTo(3, -196); ctx.quadraticCurveTo(7, -60, 12, 4); ctx.closePath(); fs(ctx, tr);
    ln(ctx, shade(tr, -0.3), 1.8, [-2, -30, -1, -70]); ell(ctx, 0, -197, 6, 3.4); fs(ctx, '#f6fbff', 1.6);
    snowLobe(ctx, -26, 26, 9);
  });
  function mkBush(w, h, cols, berry) {
    return (ctx, t, seed) => {
      const r = sr(seed), k = 0.88 + r() * 0.24, hw = (w / 2) * k, hh = h * k;
      canopy(ctx, [0, -hh * 0.5, hh * 0.5, -hw * 0.56, -hh * 0.34, hh * 0.36, hw * 0.58, -hh * 0.32, hh * 0.34, hw * 0.1, -hh * 0.26, hh * 0.28], cols, r, 3, 2.3);
      if (berry) for (let i = 0; i < 6; i++) { ell(ctx, (r() - 0.5) * hw * 1.5, -hh * (0.2 + r() * 0.6), 3.4); fs(ctx, berry, 1.6); }
    };
  }
  P_('bush_round', 84, 52, mkBush(80, 48, ['#5fb85a', '#86d46e', '#3f9a4f']));
  P_('berry_bush', 74, 48, mkBush(70, 44, ['#4fa85a', '#74c670', '#2f7f48'], '#e2574a'));
  P_('bush_dark', 94, 58, mkBush(90, 54, ['#2f7a4a', '#44995c', '#215c3a']));
  P_('swamp_shrub', 76, 50, mkBush(72, 46, ['#2f6a5e', '#44907a', '#1f4a44'], '#d8ff7a'));
  function mkFlower(kind, cols, hgt, o) {
    o = o || {};
    return (ctx, t, seed) => {
      const r = sr(seed), n = 1 + ((r() * 2.6) | 0), stem = o.stem || '#4f9a4a';
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 10 + (r() - 0.5) * 4, hh = hgt * (0.7 + r() * 0.4), lean = (r() - 0.5) * 8, c = cols[(r() * cols.length) | 0], fx = x + lean, fy = -hh;
        tube(ctx, stem, 2, () => { ctx.beginPath(); ctx.moveTo(x, 3); ctx.quadraticCurveTo(x + lean * 0.3, -hh * 0.5, fx, fy); });
        ell(ctx, x + lean * 0.4 + 4, -hh * 0.4, 5, 2.6, -0.5); fs(ctx, shade(stem, 0.2), 1.6);
        if (o.glow) glow(ctx, fx, fy, 15, o.glow, 0.55);
        if (kind === 'daisy') { for (let p = 0; p < 6; p++) { const a = (p / 6) * TAU + 0.3; ell(ctx, fx + Math.cos(a) * 4.6, fy + Math.sin(a) * 4.6, 3.6); fs(ctx, c, 1.5); } ell(ctx, fx, fy, 3); fs(ctx, o.center || '#ffd84a', 1.5); }
        else if (kind === 'bell') { ctx.beginPath(); ctx.moveTo(fx - 5.5, fy + 5); ctx.quadraticCurveTo(fx - 6, fy - 6, fx, fy - 6); ctx.quadraticCurveTo(fx + 6, fy - 6, fx + 5.5, fy + 5); ctx.quadraticCurveTo(fx, fy + 2, fx - 5.5, fy + 5); ctx.closePath(); fs(ctx, c, 1.7); ell(ctx, fx, fy + 4.5, 1.6); ctx.fillStyle = '#fff3c4'; ctx.fill(); }
        else if (kind === 'star') { A.star(ctx, fx, fy, 7.5, 3.2, 6, 0); fs(ctx, c, 1.6); ell(ctx, fx, fy, 2); ctx.fillStyle = '#ffffff'; ctx.fill(); }
        else { for (const a of [-0.7, 0.7, 0]) { ctx.save(); ctx.translate(fx, fy + 5); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-5, -7, 0, -13); ctx.quadraticCurveTo(5, -7, 0, 0); ctx.closePath(); fs(ctx, a ? c : shade(c, 0.22), 1.6); ctx.restore(); } }
      }
    };
  }
  P_('flower_yellow', 30, 32, mkFlower('daisy', ['#ffd84a', '#ffbe3a'], 24, { center: '#f0862e' }));
  P_('flower_white', 30, 28, mkFlower('daisy', ['#ffffff', '#fff3dc'], 20));
  P_('flower_pinkbell', 28, 38, mkFlower('bell', ['#f291b3', '#c77dff'], 29));
  P_('flower_glow', 30, 40, mkFlower('bell', ['#ffb3c8', '#ffd0dc'], 30, { glow: '#ffb3c8', stem: '#3f8f62' }), { light: { r: 46, color: '#ffb3c8', dy: -28 } });
  P_('frost_flower', 30, 34, mkFlower('star', ['#c9f0ff', '#eaf8ff'], 23, { stem: '#7fa8b8' }));
  P_('desert_flower', 32, 34, mkFlower('bud', ['#ff7a4a', '#f291b3', '#ffd84a'], 22, { stem: '#7fa86a' }));
  function mkGrass(col, hgt, n) {
    return (ctx, t, seed) => {
      const r = sr(seed);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 5.4 + (r() - 0.5) * 3, hh = hgt * (0.55 + r() * 0.5), lean = (i - (n - 1) / 2) * 2.6 + (r() - 0.5) * 5;
        ctx.beginPath(); ctx.moveTo(x - 2.8, 3); ctx.quadraticCurveTo(x - 1 + lean * 0.3, -hh * 0.5, x + lean, -hh); ctx.quadraticCurveTo(x + 2 + lean * 0.4, -hh * 0.45, x + 2.8, 3); ctx.closePath();
        fs(ctx, i & 1 ? col : shade(col, 0.14), 1.7);
      }
    };
  }
  P_('grass_meadow', 36, 18, mkGrass('#8ad05a', 16, 6), { layer: 'front' });
  P_('grass_forest', 38, 20, mkGrass('#4fa85a', 18, 6), { layer: 'front' });
  P_('grass_marsh', 38, 22, mkGrass('#4a9a7a', 20, 6), { layer: 'front' });
  P_('grass_dry', 36, 18, mkGrass('#d9b36a', 16, 5), { layer: 'front' });
  P_('weeds_dead', 36, 20, mkGrass('#6a5f74', 18, 5), { layer: 'front' });
  P_('snow_tuft', 36, 14, (ctx, t, seed) => {
    const r = sr(seed);
    for (let i = 0; i < 3; i++) { const x = (i - 1) * 6 + (r() - 0.5) * 3, hh = 8 + r() * 6; poly(ctx, [x - 2.2, 3, x + (r() - 0.5) * 4, -hh, x + 2.2, 3]); fs(ctx, '#c6e6fa', 1.6); }
    ell(ctx, -9, 0, 8, 4.4); fs(ctx, '#f6fbff', 1.7); ell(ctx, 8, 0.5, 7, 3.8); fs(ctx, '#f6fbff', 1.7);
  }, { layer: 'front' });
  function mkRock(w, h, col, o) {
    o = o || {};
    return (ctx, t, seed) => {
      const r = sr(seed), k = 0.85 + r() * 0.3, hw = (w / 2) * k, hh = h * k;
      const pts = [-hw, 3, -hw * (0.8 + r() * 0.15), -hh * (0.5 + r() * 0.2), -hw * (0.3 + r() * 0.2), -hh * (0.9 + r() * 0.1), hw * (0.25 + r() * 0.2), -hh, hw * (0.78 + r() * 0.15), -hh * (0.5 + r() * 0.25), hw, 3];
      const body = () => poly(ctx, pts);
      body(); ctx.fillStyle = col; ctx.fill();
      ctx.save(); ctx.clip();
      poly(ctx, [pts[4], pts[5], pts[6], pts[7], pts[8], pts[9], hw * 0.2, -hh * 0.45, -hw * 0.25, -hh * 0.5]); ctx.fillStyle = shade(col, 0.2); ctx.fill();
      poly(ctx, [hw * 0.2, -hh * 0.45, pts[8], pts[9], hw + 2, 4, hw * 0.3, 4]); ctx.fillStyle = shade(col, -0.18); ctx.fill();
      const top = o.moss || o.snow;
      if (top) { ctx.fillStyle = top; ctx.beginPath(); ctx.ellipse(-hw * 0.05, -hh * 1.02, hw * 0.8, hh * 0.34, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
      body(); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
      if (o.crystal && r() < 0.6) { glow(ctx, hw * 0.3, -hh * 0.9, 16, o.crystal, 0.4); crystal(ctx, hw * 0.3, -hh * 0.72, 17, 4.6, 0.4, o.crystal); }
    };
  }
  P_('rock_small', 50, 30, mkRock(46, 26, '#a9a4ad'));
  P_('rock_mossy', 64, 40, mkRock(60, 36, '#8a8794', { moss: '#4fa85a' }));
  P_('rock_mud', 60, 30, mkRock(56, 26, '#6a5a52', { moss: '#4a9a7a' }));
  P_('rock_cave', 64, 38, mkRock(60, 34, '#5a5480', { crystal: CY }));
  P_('rock_sand', 58, 32, mkRock(54, 28, '#d9aa6c'));
  P_('rock_red', 74, 46, mkRock(70, 42, '#c8663c'));
  P_('rock_snowy', 66, 42, mkRock(62, 38, '#7f92b4', { snow: '#f6fbff' }));
  function mkFern(size, col) {
    return (ctx, t, seed) => {
      const r = sr(seed), n = 5, d = shade(col, -0.3);
      for (const i of [0, 4, 1, 3, 2]) {
        const a = (i - (n - 1) / 2) * 0.52 + (r() - 0.5) * 0.2, L = size * (0.75 + r() * 0.4) * (1 - Math.abs(i - 2) * 0.1);
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0, 3); ctx.quadraticCurveTo(-L * 0.27, -L * 0.5, 0, -L); ctx.quadraticCurveTo(L * 0.27, -L * 0.5, 0, 3); ctx.closePath(); fs(ctx, i & 1 ? col : shade(col, 0.14), 1.8);
        ln(ctx, d, 1.4, [0, 0, 0, -L * 0.9]);
        for (let u = 0.25; u < 0.9; u += 0.2) { ln(ctx, d, 1.2, [0, -L * u, -L * 0.1 * (1.1 - u), -L * u - 4]); ln(ctx, d, 1.2, [0, -L * u, L * 0.1 * (1.1 - u), -L * u - 4]); }
        ctx.restore();
      }
    };
  }
  P_('fern', 48, 34, mkFern(30, '#6cc060'));
  P_('fern_big', 64, 46, mkFern(42, '#44995c'));
  function mkLog(len, col, moss) {
    return (ctx, t, seed) => {
      const r = sr(seed), L = len * (0.85 + r() * 0.3), hw = L / 2;
      ctx.save(); ctx.scale(r() < 0.5 ? -1 : 1, 1);
      tube(ctx, col, 3, () => { ctx.beginPath(); ctx.moveTo(-hw * 0.3, -22); ctx.lineTo(-hw * 0.3 - 6, -38); });
      ell(ctx, -hw * 0.3 - 9, -42, 5.5, 3.4, 0.6); fs(ctx, '#6cc060', 1.6);
      rr(ctx, -hw, -25, L, 28, 13); fs(ctx, col);
      for (let i = 0; i < 4; i++) { const bx = -hw + 14 + r() * (L - 46), by = -19 + r() * 16; ln(ctx, shade(col, i & 1 ? 0.2 : -0.25), 2, [bx, by, bx + 8 + r() * 14, by]); }
      ell(ctx, hw - 4, -11, 7.5, 12.6); fs(ctx, '#d2a877'); ell(ctx, hw - 4, -11, 3.6, 6.6); ctx.strokeStyle = '#a57a4e'; ctx.lineWidth = 1.6; ctx.stroke();
      if (moss) cap(ctx, r, -hw + 10, -26.5, L - 30, capO(moss, { base: 4, dep: 5, sw: 14, over: 0 }));
      ctx.restore();
    };
  }
  P_('log_fallen', 108, 46, mkLog(100, '#8a5a3c'));
  P_('log_mossy', 126, 46, mkLog(118, '#5a4030', '#4fa85a'));
  // marsh
  P_('reeds', 56, 86, (ctx, t, seed) => {
    const r = sr(seed), col = '#5fae8a';
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 7 + (r() - 0.5) * 4, hh = 44 + r() * 38, lean = (i - 2.5) * 3 + (r() - 0.5) * 8, bend = r() < 0.25;
      ctx.beginPath(); ctx.moveTo(x - 3.8, 3); ctx.quadraticCurveTo(x - 1.5 + lean * 0.2, -hh * 0.6, x + lean + (bend ? 12 : 0), -hh + (bend ? 14 : 0)); ctx.quadraticCurveTo(x + lean * 0.4 + 3.5, -hh * 0.5, x + 3.8, 3); ctx.closePath();
      fs(ctx, i & 1 ? col : shade(col, 0.16), 1.6);
    }
  });
  P_('cattail', 46, 98, (ctx, t, seed) => {
    const r = sr(seed), st = '#5a9a6a';
    ctx.beginPath(); ctx.moveTo(-12, 3); ctx.quadraticCurveTo(-18, -30, -25, -52); ctx.quadraticCurveTo(-12, -28, -7, 3); ctx.closePath(); fs(ctx, '#5fae8a', 1.8);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 9 + (r() - 0.5) * 4, hh = 58 + r() * 34, lean = (i - 1) * 5 + (r() - 0.5) * 6;
      tube(ctx, st, 2.2, () => { ctx.beginPath(); ctx.moveTo(x, 3); ctx.quadraticCurveTo(x + lean * 0.3, -hh * 0.5, x + lean, -hh - 7); });
      ctx.save(); ctx.translate(x + lean * 0.9, -hh + 12); ctx.rotate(lean * 0.02); rr(ctx, -3.9, -11, 7.8, 22, 3.9); fs(ctx, '#7a4a30', 2); ctx.restore();
    }
  });
  P_('glow_bulb', 46, 68, (ctx, t, seed) => {
    const r = sr(seed), st = '#3f8a72', gl = '#d8ff7a';
    ctx.save(); ctx.scale(r() < 0.5 ? -1 : 1, 1);
    for (const [a, L] of [[-0.9, 22], [0.8, 20], [-0.3, 16]]) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 3); ctx.quadraticCurveTo(-7, -L * 0.5, 0, -L); ctx.quadraticCurveTo(7, -L * 0.5, 0, 3); ctx.closePath(); fs(ctx, st, 1.8); ctx.restore(); }
    tube(ctx, st, 2.6, () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-4, -30, 2, -58, 14, -56); ctx.quadraticCurveTo(20, -54, 18, -46); });
    glow(ctx, 18, -36, 28, gl, 0.6);
    ctx.beginPath(); ctx.moveTo(18, -46); ctx.bezierCurveTo(27, -42, 27, -27, 18, -25); ctx.bezierCurveTo(9, -27, 9, -42, 18, -46); ctx.closePath(); fs(ctx, gl, 2, '#5a8a2a');
    ell(ctx, 15.5, -38, 2.2, 3.4); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }, { light: { r: 90, color: '#d8ff7a', dy: -36 } });
  P_('lily_bloom', 52, 30, (ctx, t, seed) => {
    const r = sr(seed), pk = r() < 0.6 ? '#f291b3' : '#fff3dc';
    ell(ctx, -12, -1, 14, 5); fs(ctx, '#3f8a72', 2); ell(ctx, 13, -0.5, 12, 4.4); fs(ctx, '#4a9a7a', 2);
    for (const a of [-0.95, 0.95, -0.48, 0.48, 0]) { ctx.save(); ctx.translate(0, -4); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(-6, -9, 0, -19); ctx.quadraticCurveTo(6, -9, 0, 2); ctx.closePath(); fs(ctx, a === 0 ? shade(pk, 0.3) : pk, 1.7); ctx.restore(); }
  });
  P_('swamp_post', 36, 78, (ctx) => {
    const wd = '#6a5a48';
    rr(ctx, -6, -66, 12, 69, 3); fs(ctx, wd);
    poly(ctx, [-6, -64, -6, -68, -2, -75, 2, -68, 6, -73, 6, -64]); fs(ctx, wd, 2.2);
    ln(ctx, shade(wd, -0.3), 1.8, [-1, -56, -1, -8]);
    for (const yy of [-46, -41]) ln(ctx, '#d8c49a', 2.2, [-6, yy, 6, yy + 1.5]);
    tube(ctx, '#d8c49a', 2, () => { ctx.beginPath(); ctx.moveTo(6, -43); ctx.quadraticCurveTo(16, -30, 10, -16); });
    ell(ctx, -3, -63, 7, 3); fs(ctx, '#4a9a7a', 1.6);
  });
  // cave
  function mkStalag(w, h, col) {
    return (ctx, t, seed) => {
      const r = sr(seed), k = 0.8 + r() * 0.4, hw = (w / 2) * (0.9 + r() * 0.2), hh = h * k, lean = (r() - 0.5) * w * 0.3;
      const body = () => poly(ctx, [-hw, 3, -hw * 0.55, -hh * 0.42, -hw * 0.2 + lean * 0.5, -hh * 0.75, lean, -hh, hw * 0.3 + lean * 0.5, -hh * 0.7, hw * 0.62, -hh * 0.36, hw, 3]);
      body(); ctx.fillStyle = col; ctx.fill();
      ctx.save(); ctx.clip();
      poly(ctx, [lean, -hh, hw * 0.3 + lean * 0.5, -hh * 0.7, hw * 0.62, -hh * 0.36, hw + 2, 4, hw * 0.1, 4]); ctx.fillStyle = shade(col, -0.2); ctx.fill();
      poly(ctx, [-hw * 0.5, 3, -hw * 0.3, -hh * 0.4, lean - 1, -hh * 0.94, -hw * 0.05, -hh * 0.4, -hw * 0.1, 3]); ctx.fillStyle = shade(col, 0.22); ctx.fill();
      for (const u of [0.3, 0.55]) ln(ctx, shade(col, -0.3), 1.8, [-hw * (1 - u) * 0.8, -hh * u, hw * (1 - u) * 0.8, -hh * u + 3]);
      ctx.restore();
      body(); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    };
  }
  P_('stalagmite', 54, 98, mkStalag(50, 84, '#5a5480'));
  P_('stalagmite_small', 32, 48, mkStalag(30, 40, '#5a5480'));
  P_('bones', 62, 28, (ctx) => {
    const c = '#e9e2d0';
    const bone = (x, y, len, rot) => { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); for (const sx of [-len / 2, len / 2]) { ell(ctx, sx, -2.4, 3.1); fs(ctx, c, 1.8); ell(ctx, sx, 2.4, 3.1); fs(ctx, c, 1.8); } rr(ctx, -len / 2, -2.3, len, 4.6, 2.3); fs(ctx, c, 1.8); ctx.fillStyle = c; ctx.fillRect(-len / 2 - 1, -1.3, len + 2, 2.6); ctx.restore(); };
    bone(10, -4, 30, 0.2); bone(-4, -5, 26, -0.5);
    ell(ctx, -17, -11, 11, 10); fs(ctx, c); rr(ctx, -23, -5, 12, 7, 2); fs(ctx, c, 2);
    ctx.fillStyle = c; ctx.fillRect(-22, -8, 10, 5);
    ell(ctx, -20.5, -12, 2.6, 3.2); ctx.fillStyle = OUT; ctx.fill(); ell(ctx, -13, -12, 2.6, 3.2); ctx.fill();
    ln(ctx, OUT, 1.4, [-20, -4, -20, 0]); ln(ctx, OUT, 1.4, [-16.5, -4, -16.5, 0]);
  });
  P_('glow_moss', 48, 16, (ctx, t, seed) => {
    const r = sr(seed), c = '#6fe0c0';
    glow(ctx, 0, -4, 30, c, 0.3);
    for (let i = 0; i < 5; i++) { const x = (i - 2) * 8 + (r() - 0.5) * 4, rd = 4 + r() * 3.5; ell(ctx, x, -rd * 0.5 + 2, rd, rd * 0.7); fs(ctx, i & 1 ? c : shade(c, -0.18), 1.6, '#1f6a5a'); }
    ctx.fillStyle = '#eafff6'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc((r() - 0.5) * 30, -6 - r() * 8, 1.3, 0, TAU); ctx.fill(); }
  }, { light: { r: 50, color: '#6fe0c0', dy: -6 } });
  P_('rubble_cave', 42, 14, (ctx, t, seed) => {
    const r = sr(seed);
    for (let i = 0; i < 4; i++) { const x = (i - 1.5) * 9 + (r() - 0.5) * 5, rd = 3 + r() * 3.6; poly(ctx, [x - rd, 2, x - rd * 0.5, -rd * 1.1, x + rd * 0.6, -rd * 1.2, x + rd, 2]); fs(ctx, i & 1 ? '#5a5480' : '#6a6490', 1.7); }
  }, { layer: 'front' });
  P_('minecart', 98, 68, (ctx) => {
    const wd = '#7a5236', ir = '#5f5d70';
    tube(ctx, '#8f8a98', 3, () => { ctx.beginPath(); ctx.moveTo(-46, 1); ctx.lineTo(46, 1); });
    for (const [ox, oy, rd, c] of [[-14, -46, 11, '#5a5480'], [8, -50, 12, '#6a6490'], [22, -44, 9, '#5a5480']]) { poly(ctx, [ox - rd, oy + rd * 0.6, ox - rd * 0.5, oy - rd * 0.7, ox + rd * 0.5, oy - rd * 0.8, ox + rd, oy + rd * 0.6]); fs(ctx, c, 2.2); }
    glow(ctx, -3, -58, 20, CY, 0.45); crystal(ctx, -2, -46, 21, 5, -0.2, CY);
    poly(ctx, [-36, -44, 36, -44, 30, -12, -30, -12]); fs(ctx, wd);
    ln(ctx, shade(wd, -0.28), 2, [-12, -43, -10, -13]); ln(ctx, shade(wd, -0.28), 2, [12, -43, 10, -13]);
    rr(ctx, -39, -48, 78, 7.5, 3); fs(ctx, ir, 2.2);
    for (const wx of [-19, 19]) { ell(ctx, wx, -8, 9); fs(ctx, ir); ell(ctx, wx, -8, 3); fs(ctx, '#a9a6b8', 1.6); }
  });
  // canyon
  P_('skull_bones', 66, 36, (ctx) => {
    const c = '#efe6d2';
    for (let i = 0; i < 3; i++) tube(ctx, c, 2.4, () => { ctx.beginPath(); ctx.arc(22 + i * 7, 4, 10 - i * 1.6, PI, PI * 1.92); });
    for (const sx of [-1, 1]) tube(ctx, c, 3.4, () => { ctx.beginPath(); ctx.moveTo(sx * 8, -19); ctx.quadraticCurveTo(sx * 24, -26, sx * 26, -10); });
    ctx.beginPath(); ctx.moveTo(-11, -23); ctx.quadraticCurveTo(0, -28, 11, -23); ctx.lineTo(7, -6); ctx.quadraticCurveTo(0, 6, -7, -6); ctx.closePath(); fs(ctx, c);
    ell(ctx, -5, -16, 2.6, 3.6); ctx.fillStyle = OUT; ctx.fill(); ell(ctx, 5, -16, 2.6, 3.6); ctx.fill();
    ln(ctx, OUT, 1.5, [0, -8, 0, -2]);
  });
  P_('rock_spire', 96, 216, (ctx, t, seed) => {
    const P = A.PAL.canyon, r = sr(seed), k = 0.8 + r() * 0.3, hh = 150 * k, sg = r() < 0.5 ? -1 : 1;
    // stepped sandstone stack with a tilted table rock on top, plus a shorter companion
    const stack = (x, h, w) => {
      const pts = [x - w, 3], n = 5;
      for (let i = 1; i <= n; i++) { const u = i / n, ww = w * (1 - u * 0.5) * (i & 1 ? 0.82 : 1.06); pts.push(x - ww, -h * (u - 0.07), x - ww * 0.92, -h * u); }
      for (let i = n; i >= 1; i--) { const u = i / n, ww = w * (1 - u * 0.5) * (i & 1 ? 1.04 : 0.84); pts.push(x + ww * 0.92, -h * u, x + ww, -h * (u - 0.07)); }
      pts.push(x + w, 3);
      const body = () => poly(ctx, pts);
      body(); ctx.fillStyle = P.body; ctx.fill();
      ctx.save(); ctx.clip();
      for (let yy = -h; yy < 0; yy += 20) { ctx.fillStyle = r() < 0.5 ? rgba(P.body2, 0.42) : rgba(P.edge, 0.45); ctx.fillRect(x - w - 4, yy + r() * 8, w * 2 + 8, 5 + r() * 8); }
      ctx.fillStyle = 'rgba(29,20,48,0.16)'; ctx.fillRect(x + w * 0.15, -h - 4, w, h + 8);
      ctx.restore();
      body(); ctx.lineWidth = LW; ctx.strokeStyle = OUT; ctx.stroke();
    };
    stack(sg * 26, hh * 0.52, 20);
    stack(-sg * 6, hh, 30);
    ctx.save(); ctx.translate(-sg * 6, -hh); ctx.rotate(sg * 0.1);
    poly(ctx, [-34, 2, -38, -9, -26, -19, 20, -21, 37, -11, 33, 2]); fs(ctx, shade(P.body, -0.1));
    ln(ctx, rgba(P.edge, 0.85), 2.2, [-24, -13, 14, -15]); ln(ctx, rgba(P.body2, 0.7), 2, [-28, -5, 28, -6]);
    ctx.restore();
  });
  P_('tumbleweed', 46, 42, (ctx, t, seed) => {
    ell(ctx, 0, -18, 19, 18); ctx.fillStyle = 'rgba(217,184,138,0.5)'; ctx.fill();
    for (let pass = 0; pass < 2; pass++) {
      const r = sr(seed); ctx.strokeStyle = pass ? '#b98a5a' : OUT; ctx.lineWidth = pass ? 1.8 : 4.6;
      for (let i = 0; i < 9; i++) { const a = r() * TAU, rad = 8 + r() * 11; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 3, -18 + Math.sin(a) * 3, rad, rad * (0.5 + r() * 0.5), a, 0, TAU); ctx.stroke(); }
    }
  });
  P_('dead_shrub', 74, 56, (ctx, t, seed) => {
    const r = sr(seed), c = '#8a6a4a', seg = [];
    const twig = (x0, y0, a, L, lw, d) => { const x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L; seg.push(x0, y0, x1, y1, lw); if (d > 0) { twig(x1, y1, a - 0.5 - r() * 0.3, L * 0.64, lw * 0.76, d - 1); twig(x1, y1, a + 0.45 + r() * 0.3, L * 0.6, lw * 0.76, d - 1); } };
    twig(-4, 3, -PI / 2 - 0.5, 20, 3.4, 2); twig(3, 3, -PI / 2 + 0.35, 22, 3.4, 2); twig(0, 3, -PI / 2 - 0.05, 16, 3, 1);
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < seg.length; i += 5) ln(ctx, pass ? c : OUT, seg[i + 4] + (pass ? 0 : LW * 1.7), [seg[i], seg[i + 1], seg[i + 2], seg[i + 3]]);
  });
  // snow
  P_('snow_mound', 86, 30, (ctx, t, seed) => {
    const r = sr(seed); snowLobe(ctx, -40, 40, 15 + r() * 6, r);
    ctx.beginPath(); ctx.arc(-8, -1, 16, 1.15 * PI, 1.6 * PI); ctx.strokeStyle = '#c2daf4'; ctx.lineWidth = 2.2; ctx.stroke();
  });
  P_('ice_shard', 36, 32, (ctx, t, seed) => { const r = sr(seed); iceSpike(ctx, -8, 5, 16 + r() * 8, -3, '#a8dcf6'); iceSpike(ctx, 7, 5.5, 20 + r() * 8, 3, '#c6ecff'); iceSpike(ctx, 0, 4, 12, 0, '#dff4ff'); });
  // citadel / throne
  P_('rubble', 66, 28, (ctx, t, seed) => {
    const r = sr(seed), c = '#7a7088';
    for (let i = 0; i < 5; i++) { const x = (i - 2) * 11 + (r() - 0.5) * 6, w = 12 + r() * 10, h = 8 + r() * 8, rot = (r() - 0.5) * 0.7; ctx.save(); ctx.translate(x, -h / 2 + 2 - (i === 2 ? 8 : 0)); ctx.rotate(rot); rr(ctx, -w / 2, -h / 2, w, h, 2); fs(ctx, i & 1 ? c : shade(c, -0.18), 2.2); ctx.restore(); }
  });
  P_('candles', 36, 40, (ctx, t, seed) => {
    const r = sr(seed);
    glow(ctx, 0, -26, 36, '#ffb04a', 0.45);
    ell(ctx, 0, 1, 16, 3.6); fs(ctx, '#d9d0bc', 1.8);
    for (const [x, h] of [[-9, 14 + r() * 6], [9, 10 + r() * 6], [0, 22 + r() * 6]]) {
      rr(ctx, x - 4, -h, 8, h + 2, 2); fs(ctx, '#efe6d2', 2);
      ctx.beginPath(); ctx.moveTo(x, -h - 9.5); ctx.quadraticCurveTo(x + 3.8, -h - 3, x, -h - 0.5); ctx.quadraticCurveTo(x - 3.8, -h - 3, x, -h - 9.5); ctx.closePath(); fs(ctx, '#ffb02e', 1.5, '#c8501e');
    }
  }, { light: { r: 70, color: '#ffb04a', dy: -24 } });
  P_('chain_pile', 58, 24, (ctx) => {
    const c = '#9a93aa';
    for (const [x, y, rx, ry, rot] of [[-14, -4, 9, 5, 0.2], [0, -6, 9, 5.4, -0.3], [13, -4, 8.5, 5, 0.4], [-4, -12, 7, 4.4, 0.6]]) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.strokeStyle = OUT; ctx.lineWidth = 6.2; ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 2.8; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(23, -5, 6, PI, 0); ctx.strokeStyle = OUT; ctx.lineWidth = 6.6; ctx.stroke(); ctx.strokeStyle = shade(c, -0.25); ctx.lineWidth = 3; ctx.stroke();
  });
  P_('iron_fence', 106, 68, (ctx, t, seed) => {
    const r = sr(seed), c = '#4a4458';
    tube(ctx, c, 3, () => { ctx.beginPath(); ctx.moveTo(-50, -14); ctx.lineTo(50, -14); }); tube(ctx, c, 3, () => { ctx.beginPath(); ctx.moveTo(-50, -44); ctx.lineTo(50, -44); });
    for (let i = 0; i < 6; i++) {
      const x = -44 + i * 17.6, bx = r() < 0.25 ? 9 : 0, top = -56 - r() * 6;
      tube(ctx, c, 3, () => { ctx.beginPath(); ctx.moveTo(x, 3); ctx.lineTo(x, -40); ctx.lineTo(x + bx, top); });
      poly(ctx, [x + bx - 4, top + 2, x + bx * 1.3, top - 9, x + bx + 4, top + 2]); fs(ctx, shade(c, 0.2), 2);
    }
  });
  P_('pillar_tall', 100, 344, (ctx) => {
    const c = '#4f4666', d = shade(c, -0.3);
    rr(ctx, -38, -18, 76, 21, 3); fs(ctx, c); rr(ctx, -31, -32, 62, 15, 3); fs(ctx, shade(c, 0.1));
    rr(ctx, -24, -306, 48, 276, 2); fs(ctx, c);
    for (const fx of [-13, -3, 7, 16]) ln(ctx, d, 2, [fx, -302, fx, -34]);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(-22.7, -304, 6, 272);
    rr(ctx, -31, -320, 62, 15, 3); fs(ctx, shade(c, 0.1)); rr(ctx, -40, -340, 80, 21, 3); fs(ctx, c);
    ln(ctx, '#ffcf4a', 2, [-32, -330, 32, -330]); ln(ctx, '#ffcf4a', 2, [-24, -24.5, 24, -24.5]);
  });
  P_('candle_stand', 56, 128, (ctx) => {
    const ir = '#4a4458';
    glow(ctx, 0, -112, 46, '#ffb04a', 0.45);
    poly(ctx, [-16, 3, 0, -12, 16, 3]); fs(ctx, ir);
    rr(ctx, -3, -92, 6, 84, 3); fs(ctx, shade(ir, 0.15));
    tube(ctx, ir, 3, () => { ctx.beginPath(); ctx.moveTo(-20, -96); ctx.quadraticCurveTo(-20, -82, 0, -82); ctx.quadraticCurveTo(20, -82, 20, -96); });
    for (const [x, y] of [[-20, -96], [20, -96], [0, -100]]) {
      rr(ctx, x - 3.4, y - 14, 6.8, 13, 2); fs(ctx, '#efe6d2', 1.8);
      rr(ctx, x - 6, y - 2, 12, 4, 2); fs(ctx, ir, 1.8);
      ctx.beginPath(); ctx.moveTo(x, y - 24); ctx.quadraticCurveTo(x + 3.8, y - 17, x, y - 14.5); ctx.quadraticCurveTo(x - 3.8, y - 17, x, y - 24); ctx.closePath(); fs(ctx, '#ffb02e', 1.5, '#c8501e');
    }
  }, { light: { r: 110, color: '#ffb04a', dy: -110 } });

  // ---- scatter lists: n = average count per 1000px of surface
  A.decor = {
    town: [
      { p: 'flower_yellow', n: 1.2, on: 'ground' }, { p: 'flower_white', n: 1, on: 'ground' }, { p: 'flower_pinkbell', n: 0.6, on: 'ground' },
      { p: 'grass_meadow', n: 2.5, on: 'ground' }, { p: 'bush_round', n: 0.35, on: 'ground' }, { p: 'rock_small', n: 0.2, on: 'ground' },
    ],
    meadow: [
      { p: 'tree_round', n: 0.6, on: 'ground' }, { p: 'tree_small', n: 0.6, on: 'ground' }, { p: 'bush_round', n: 1.2, on: 'ground' }, { p: 'berry_bush', n: 0.45, on: 'ground' },
      { p: 'flower_yellow', n: 2.6, on: 'any' }, { p: 'flower_white', n: 2.2, on: 'any' }, { p: 'flower_pinkbell', n: 1.2, on: 'any' }, { p: 'grass_meadow', n: 5, on: 'any' },
      { p: 'rock_small', n: 0.7, on: 'ground' }, { p: 'fern', n: 0.8, on: 'any' }, { p: 'log_fallen', n: 0.22, on: 'ground' },
    ],
    forest: [
      { p: 'tree_forest', n: 0.85, on: 'ground' }, { p: 'tree_forest_thin', n: 0.8, on: 'ground' }, { p: 'bush_dark', n: 1.3, on: 'ground' }, { p: 'fern_big', n: 1.8, on: 'any' },
      { p: 'flower_glow', n: 1.5, on: 'any' }, { p: 'rock_mossy', n: 0.6, on: 'ground' }, { p: 'log_mossy', n: 0.28, on: 'ground' }, { p: 'grass_forest', n: 4.5, on: 'any' },
      { p: 'berry_bush', n: 0.4, on: 'ground' }, { p: 'fern', n: 0.8, on: 'any' },
    ],
    marsh: [
      { p: 'tree_mangrove', n: 0.6, on: 'ground' }, { p: 'reeds', n: 2.4, on: 'any' }, { p: 'cattail', n: 1.8, on: 'ground' }, { p: 'glow_bulb', n: 0.8, on: 'any' },
      { p: 'lily_bloom', n: 0.7, on: 'ground' }, { p: 'swamp_shrub', n: 0.8, on: 'ground' }, { p: 'rock_mud', n: 0.5, on: 'ground' }, { p: 'grass_marsh', n: 4, on: 'any' },
      { p: 'swamp_post', n: 0.35, on: 'ground' },
    ],
    cave: [
      { p: 'stalagmite', n: 1.3, on: 'ground' }, { p: 'stalagmite_small', n: 1.6, on: 'any' }, { p: 'crystal_small', n: 1.1, on: 'any' }, { p: 'crystal_big', n: 0.3, on: 'ground' },
      { p: 'rock_cave', n: 0.7, on: 'ground' }, { p: 'bones', n: 0.35, on: 'ground' }, { p: 'glow_moss', n: 1.2, on: 'any' }, { p: 'rubble_cave', n: 2.2, on: 'any' },
      { p: 'minecart', n: 0.12, on: 'ground' },
    ],
    oasis: [
      { p: 'palm', n: 0.55, on: 'ground' }, { p: 'palm_small', n: 0.5, on: 'ground' }, { p: 'pot', n: 0.45, on: 'ground' }, { p: 'desert_flower', n: 1.2, on: 'ground' },
      { p: 'grass_dry', n: 2.5, on: 'any' }, { p: 'rock_sand', n: 0.35, on: 'ground' }, { p: 'cactus_small', n: 0.35, on: 'ground' },
    ],
    canyon: [
      { p: 'cactus_tall', n: 0.7, on: 'ground' }, { p: 'cactus_small', n: 1.1, on: 'any' }, { p: 'dead_shrub', n: 1.1, on: 'ground' }, { p: 'skull_bones', n: 0.35, on: 'ground' },
      { p: 'rock_red', n: 0.9, on: 'ground' }, { p: 'rock_spire', n: 0.35, on: 'ground' }, { p: 'rock_arch', n: 0.1, on: 'ground' }, { p: 'grass_dry', n: 3, on: 'any' },
      { p: 'desert_flower', n: 1, on: 'any' }, { p: 'tumbleweed', n: 0.35, on: 'ground' },
    ],
    snow: [
      { p: 'snow_pine', n: 0.8, on: 'ground' }, { p: 'snow_pine_small', n: 0.8, on: 'ground' }, { p: 'ice_spire', n: 0.45, on: 'ground' }, { p: 'snow_mound', n: 1.4, on: 'any' },
      { p: 'ice_shard', n: 1.4, on: 'any' }, { p: 'rock_snowy', n: 0.7, on: 'ground' }, { p: 'dead_tree_snow', n: 0.35, on: 'ground' }, { p: 'frost_flower', n: 1.4, on: 'any' },
      { p: 'snow_tuft', n: 3, on: 'any' },
    ],
    citadel: [
      { p: 'pillar_broken', n: 0.45, on: 'ground' }, { p: 'banner_torn', n: 0.45, on: 'ground' }, { p: 'rubble', n: 1.3, on: 'any' }, { p: 'candles', n: 0.7, on: 'any' },
      { p: 'chain_pile', n: 0.4, on: 'ground' }, { p: 'statue_keeper', n: 0.12, on: 'ground' }, { p: 'weeds_dead', n: 2.5, on: 'any' }, { p: 'skull_bones', n: 0.35, on: 'ground' },
      { p: 'iron_fence', n: 0.4, on: 'ground' }, { p: 'brazier', n: 0.25, on: 'ground' },
    ],
    throne: [
      { p: 'pillar_tall', n: 0.55, on: 'ground' }, { p: 'candle_stand', n: 0.7, on: 'ground' }, { p: 'banner_torn', n: 0.5, on: 'ground' }, { p: 'rubble', n: 0.6, on: 'ground' },
      { p: 'candles', n: 1, on: 'ground' }, { p: 'gloom_crystal', n: 0.35, on: 'ground' }, { p: 'chain_pile', n: 0.3, on: 'ground' },
    ],
  };

  // ------------------------------------------------------------ portal & beacon
  // swirling gate of light. origin bottom-center, ~76w × 116h (+ sparkles)
  A.portal = function (ctx, t) {
    const cy = -58, rx = 27, ry = 46, pu = Math.sin(t * 2.4) * 0.5 + 0.5;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.save(); ctx.translate(0, -2); ctx.scale(1, 0.26); glow(ctx, 0, 0, 64, '#ffd27a', 0.85); ctx.restore();
    glow(ctx, 0, cy, 78 + pu * 8, '#ffcf6a', 0.42);
    ell(ctx, 0, cy, rx + 7, ry + 7); fs(ctx, '#f6a43c', 3);
    ell(ctx, 0, cy, rx + 3.4, ry + 3.4); ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2; ctx.stroke();
    const g = ctx.createRadialGradient(0, cy, 2, 0, cy, ry);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#fff3c4'); g.addColorStop(1, '#ffc95a');
    ell(ctx, 0, cy, rx, ry); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.save(); ell(ctx, 0, cy, rx - 1.5, ry - 1.5); ctx.clip();
    ctx.translate(0, cy); ctx.scale(rx / ry, 1);
    for (let i = 0; i < 5; i++) {
      const rad = ry * (0.92 - i * 0.17), a0 = t * (1.6 + i * 0.5) + i * 1.9;
      ctx.beginPath(); ctx.arc(0, 0, rad, a0, a0 + 2.1);
      ctx.strokeStyle = i & 1 ? 'rgba(255,255,255,0.9)' : 'rgba(255,170,60,0.72)'; ctx.lineWidth = 4.6 - i * 0.5; ctx.stroke();
    }
    ctx.restore();
    for (let i = 0; i < 6; i++) {
      const a = t * 1.3 + (i * TAU) / 6, sx = Math.cos(a) * (rx + 17), sy = cy + Math.sin(a) * (ry + 15), tw = 0.6 + 0.4 * Math.sin(t * 6 + i * 2.1);
      glow(ctx, sx, sy, 9 * tw, '#ffe9a0', 0.8);
      A.star(ctx, sx, sy, 5.2 * tw, 1.7 * tw, 4, a); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = '#e8962a'; ctx.stroke();
    }
    for (let i = 0; i < 5; i++) { const u = (t * 0.5 + i * 0.2) % 1, mx = Math.sin(i * 2.4 + u * 3) * rx * 0.9, my = -6 - u * 112; glow(ctx, mx, my, 7 * (1 - u), '#fff3c4', (1 - u) * 0.9); }
    ctx.restore();
  };

  // region lighthouse. origin bottom-center, ~170w × 336h. lit=false: cold & wrapped in gloom; lit=true: blazing.
  // flare (0..1): ignition burst progress (0 = none).
  A.beacon = function (ctx, t, lit, flare) {
    const st = lit ? '#d2c9b8' : '#8d88a0', st2 = shade(st, -0.26), roofC = lit ? '#c8553f' : '#4f4a6c', gold = lit ? '#f0c35a' : '#77718c', LY = -256;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const wisps = (front) => {
      for (let i = 0; i < 6; i++) {
        if ((i & 1) !== (front ? 1 : 0)) continue;
        const a = t * (0.5 + i * 0.07) + i * 1.7, x = Math.sin(a) * (58 - i * 3), y = -44 - i * 46 + Math.sin(t * 0.9 + i) * 9, s = 0.75 + 0.25 * Math.sin(t * 1.3 + i * 2);
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(a) * 0.3);
        ell(ctx, 0, 0, 36 * s, 11 * s); ctx.fillStyle = 'rgba(112,58,190,0.34)'; ctx.fill();
        ell(ctx, 7, -3, 21 * s, 6 * s); ctx.fillStyle = 'rgba(176,106,255,0.26)'; ctx.fill();
        ctx.restore();
      }
    };
    if (!lit) wisps(false);
    else glow(ctx, 0, LY, 170 + Math.sin(t * 3) * 10, '#ffd27a', 0.42);
    // base + tower
    rr(ctx, -84, -10, 168, 14, 4); fs(ctx, st2);
    rr(ctx, -72, -28, 144, 20, 5); fs(ctx, st);
    const tw = () => poly(ctx, [-54, -26, -38, -222, 38, -222, 54, -26]);
    tw(); ctx.fillStyle = st; ctx.fill();
    ctx.save(); ctx.clip();
    let k = 0;
    for (let yy = -222; yy < -26; yy += 22, k++) { ln(ctx, st2, 2, [-60, yy, 60, yy]); for (let xx = -66 + (k & 1 ? 15 : 0); xx < 60; xx += 30) ln(ctx, st2, 2, [xx, yy, xx, yy + 22]); }
    ctx.fillStyle = lit ? 'rgba(200,85,63,0.92)' : 'rgba(96,76,120,0.8)'; ctx.fillRect(-60, -156, 120, 22);
    ctx.fillStyle = 'rgba(29,20,48,0.2)'; poly(ctx, [20, -222, 60, -222, 60, -26, 34, -26]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; poly(ctx, [-60, -222, -30, -222, -44, -26, -60, -26]); ctx.fill();
    ctx.restore();
    tw(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-16, -27); ctx.lineTo(-16, -62); ctx.quadraticCurveTo(-16, -80, 0, -80); ctx.quadraticCurveTo(16, -80, 16, -62); ctx.lineTo(16, -27); ctx.closePath(); fs(ctx, lit ? '#9a6238' : '#5a4a5c');
    ln(ctx, OUT, 1.8, [0, -79, 0, -28]); ell(ctx, 6, -52, 2.4); fs(ctx, gold, 1.5);
    for (const [wx, wy] of [[-9, -108], [8, -190]]) {
      if (lit) glow(ctx, wx, wy + 3, 18, '#ffc95a', 0.5);
      ctx.beginPath(); ctx.moveTo(wx - 7, wy + 12); ctx.lineTo(wx - 7, wy); ctx.arc(wx, wy, 7, PI, 0); ctx.lineTo(wx + 7, wy + 12); ctx.closePath(); fs(ctx, lit ? '#ffd98a' : '#2f2946', 2.2);
    }
    // lantern room
    if (lit) glow(ctx, 0, LY, 72, '#ffffff', 0.7);
    rr(ctx, -30, -286, 60, 56, 4); fs(ctx, lit ? '#fff3b8' : '#2a2440', 3);
    if (lit) flame(ctx, 0, -238, 24, 38, t, 0.7, '#ffb02e', '#ffe9a0', '#ffffff');
    else { glow(ctx, 0, -252, 16 + Math.sin(t * 2.2) * 3, '#8a4fd0', 0.4); ell(ctx, 0, -250, 3.2, 4.4); ctx.fillStyle = 'rgba(176,106,255,0.6)'; ctx.fill(); }
    for (const bx of [-10, 10]) ln(ctx, OUT, 2.4, [bx, -285, bx, -231]);
    ctx.fillStyle = lit ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)'; poly(ctx, [-26, -234, -18, -282, -13, -282, -21, -234]); ctx.fill();
    // gallery
    for (let bx = -44; bx <= 44; bx += 14.67) ln(ctx, OUT, 2.4, [bx, -234, bx, -247]);
    ln(ctx, OUT, 5.8, [-50, -248, 50, -248]); ln(ctx, gold, 2.6, [-50, -248, 50, -248]);
    rr(ctx, -56, -235, 112, 14, 4); fs(ctx, st2);
    // roof
    ctx.beginPath(); ctx.moveTo(-42, -284); ctx.quadraticCurveTo(-22, -298, 0, -324); ctx.quadraticCurveTo(22, -298, 42, -284); ctx.closePath(); fs(ctx, roofC, 3);
    ln(ctx, shade(roofC, 0.3), 2.2, [-20, -289, -5, -310]);
    ln(ctx, OUT, 4.6, [0, -324, 0, -333]); ell(ctx, 0, -336, 4.8); fs(ctx, gold, 2.2);
    if (lit) {
      const pc = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) { // sweeping beams (rotation about the vertical axis, projected)
        const th = t * 0.8 + i * PI, c = Math.cos(th), s = Math.sin(th), L = 340 * c, wd = 34 + 30 * Math.abs(s);
        if (Math.abs(L) < 14) continue;
        const g = ctx.createLinearGradient(0, LY, L, LY);
        g.addColorStop(0, 'rgba(255,232,160,' + (0.24 + 0.16 * Math.max(0, s)).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,232,160,0)');
        ctx.beginPath(); ctx.moveTo(0, LY - 8); ctx.lineTo(L, LY - wd); ctx.lineTo(L, LY + wd); ctx.lineTo(0, LY + 8); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      }
      ctx.save(); ctx.translate(0, LY); ctx.rotate(t * 0.25); ctx.fillStyle = 'rgba(255,240,190,0.22)';
      for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); const len = 62 + 16 * Math.sin(t * 2 + i * 1.7); ctx.beginPath(); ctx.moveTo(-3.5, -32); ctx.lineTo(0, -32 - len); ctx.lineTo(3.5, -32); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.globalCompositeOperation = pc;
    } else wisps(true);
    if (flare > 0) {
      const e = U.ease.outCubic(U.sat(flare)), a = 1 - U.sat(flare), pc = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, LY, 120 + e * 440, '#fff3c4', a * 0.95);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, LY, e * (340 - i * 90) + 10, 0, TAU); ctx.strokeStyle = 'rgba(255,232,160,' + (a * (0.8 - i * 0.2)).toFixed(2) + ')'; ctx.lineWidth = 10 * a + 2; ctx.stroke(); }
      const pw = 48 * (1 - e * 0.5), g = ctx.createLinearGradient(0, LY, 0, LY - 540);
      g.addColorStop(0, 'rgba(255,240,190,' + (a * 0.85).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = g; ctx.fillRect(-pw / 2, LY - 540, pw, 540);
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
      for (let i = 0; i < 10; i++) { const an = i * 0.628 + 0.3, d = e * (150 + (i % 3) * 60); A.star(ctx, Math.cos(an) * d, LY + Math.sin(an) * d, 7 * a + 1, 2.2 * a + 0.4, 4, an); ctx.fill(); }
      ctx.globalCompositeOperation = pc;
    }
    ctx.restore();
  };
})();
