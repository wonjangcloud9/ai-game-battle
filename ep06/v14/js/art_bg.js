'use strict';
/* 등불지기 — parallax backgrounds + ambient foreground atmosphere for the 10 themes.
     A.bg[theme](ctx, view, t)       full-screen background, screen space, drawn first every frame
     A.ambient[theme](ctx, view, t)  foreground atmosphere, screen space, drawn after entities
     A.bgPrepare(theme)              optional: build a theme's caches ahead of time (e.g. during a map fade; ~10-40 ms once)
     A.bgInfo(theme)                 debug: { layers, canvases, mb } of a built theme
   view = { x, y, w, h, mw, mh } (camera top-left in world px + map size). Vertical parallax is keyed to how far the
   camera is above its lowest position (mh - 720 - view.y). Apply screen shake through view.x / view.y.
   Every parallax layer is pre-rendered once into a horizontally tiling offscreen strip (lazily; LRU of 2 themes)
   and only blitted per frame, plus a few cheap animated shapes. No outlines: atmospheric perspective only. */
(function () {
  const G = window.G, U = G.U, A = G.Art;
  A.bg = A.bg || {}; A.ambient = A.ambient || {};
  const W = G.W || 1280, H = G.H || 720, TAU = Math.PI * 2, PI = Math.PI;
  const lerp = U.lerp, sat = U.sat, mix = A.mix, rgba = A.rgba;
  const SKY_PAD = 60, MW = W + 120, MH = H + 120;

  // ------------------------------------------------------------------ small helpers
  const mod = (v, m) => ((v % m) + m) % m;
  const hsh = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
  const ss = (u) => { u = sat(u); return u * u * (3 - 2 * u); };
  const circ = (x, cx, cy, r) => { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); };
  const ell = (x, cx, cy, rx, ry) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); x.fill(); };
  const rs = () => G.RS || 1;
  // resolution tier of a layer: 0 far (soft, 1x) · 1 mid (≤1.5x) · 2 near (full render scale)
  const SC = (q) => (q === 0 ? Math.min(rs(), 1) : q === 1 ? Math.min(rs(), 1.5) : rs());
  let CV = [];
  function mk(w, h, q) { const r = A.makeCanvas(w, h, SC(q)); CV.push(r[0]); return r; }
  function tile3(x, Wl, fn) { for (let k = -1; k <= 1; k++) { x.save(); x.translate(k * Wl, 0); fn(k); x.restore(); } }
  // periodic 1D noise (sum of sines with whole cycles per tile) → seamless ridges
  function wave(r, Wl, oct) {
    const ps = oct.map((o) => [o[0], o[1], r() * TAU]);
    return (px) => { let s = 0; for (let i = 0; i < ps.length; i++) s += Math.sin((px / Wl) * TAU * ps[i][0] + ps[i][2]) * ps[i][1]; return s; };
  }
  const OCT = [[2, 1], [3, 0.55], [5, 0.3], [9, 0.13]];
  const OCT_LOW = [[1, 1], [2, 0.6], [3, 0.3], [5, 0.12]];
  function ridge(x, Wl, hh, f, step) {
    x.beginPath(); x.moveTo(-4, hh + 4);
    for (let i = -4; i <= Wl + 4; i += step || 6) x.lineTo(i, f(i));
    x.lineTo(Wl + 4, hh + 4); x.closePath();
  }
  function vgrad(x, y0, y1, c0, c1) { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
  function mkSky(stops) {
    const r = A.makeCanvas(4, H + SKY_PAD, 1); CV.push(r[0]);
    const g = r[1].createLinearGradient(0, 0, 0, H + SKY_PAD);
    for (const s of stops) g.addColorStop(s[0], s[1]);
    r[1].fillStyle = g; r[1].fillRect(0, 0, 4, H + SKY_PAD);
    return r[0];
  }
  // layer record. cv._solid (set by the strip builders) = local y below which the strip is opaque across its whole width
  // lap: flat-silhouette strips overlap their wrap seam by a pixel; translucent ones (wisps, fog, additive, alpha) must not
  const strip = (cv, o) => Object.assign({ cv, W: cv._w, h: cv._h, fx: 0.1, fy: 0.05, y0: 0, solid: o.fill ? cv._solid : undefined, lap: !cv._soft && o.alpha === undefined && !o.comp }, o);

  // strip with a periodic ridge. under(): things standing on the ridge (drawn first, bases get buried) · deco(): drawn on top
  function hillStrip(o) {
    const r0 = mk(o.W, o.h, o.q), x = r0[1], rg = U.rng(o.seed);
    const w0 = wave(rg, o.W, o.oct || OCT), f = o.f ? o.f(rg) : (px) => o.base + w0(px) * o.amp;
    if (o.under) tile3(x, o.W, (k) => o.under(x, f, U.rng(o.seed + '_u'), k));
    x.fillStyle = o.col2 ? vgrad(x, o.gy0 !== undefined ? o.gy0 : o.base - o.amp, o.gy1 || o.h, o.col, o.col2) : o.col;
    ridge(x, o.W, o.h, f, o.step); x.fill();
    if (o.deco) tile3(x, o.W, (k) => o.deco(x, f, U.rng(o.seed + '_d'), k));
    let mx = 0;
    for (let i = 0; i <= o.W; i += 4) { const v = f(i); if (v > mx) mx = v; }
    r0[0]._solid = Math.ceil(mx) + 3;
    return [r0[0], f];
  }
  function cloud(x, cx, cy, s, col, shade, r) {
    const n = 3 + ((r() * 3) | 0), parts = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      parts.push([(u - 0.5) * 112 * s + (r() - 0.5) * 14 * s, -(9 + Math.sin(u * PI) * 25 + r() * 10) * s, (20 + Math.sin(u * PI) * 17 + r() * 8) * s]);
    }
    const body = () => { x.beginPath(); x.roundRect(cx - 84 * s, cy - 15 * s, 168 * s, 30 * s, 15 * s); x.fill(); for (const p of parts) circ(x, cx + p[0], cy + p[1], p[2]); };
    if (shade) {
      x.fillStyle = shade; body();
      x.save(); x.beginPath(); x.rect(cx - 220 * s, cy - 220 * s, 440 * s, 226 * s); x.clip(); x.fillStyle = col; body(); x.restore();
    } else { x.fillStyle = col; body(); }
  }
  function cloudStrip(o) {
    const r0 = mk(o.W, o.h, o.q || 0), x = r0[1];
    tile3(x, o.W, () => {
      const r = U.rng(o.seed);
      for (let i = 0; i < o.n; i++) cloud(x, (i + 0.1 + r() * 0.8) * (o.W / o.n), lerp(o.y[0], o.y[1], r()), lerp(o.s[0], o.s[1], r()), o.col, o.shade, r);
    });
    return r0[0];
  }
  function streakStrip(o) {
    const r0 = mk(o.W, o.h, 0), x = r0[1];
    tile3(x, o.W, () => {
      const r = U.rng(o.seed);
      const wisp = (cx, cy, w, hh, k) => { // union of a few thin ellipses filled once (uniform alpha)
        x.beginPath();
        const e = (ex, ey, rx, ry) => { x.moveTo(ex + rx, ey); x.ellipse(ex, ey, rx, ry, 0, 0, TAU); };
        e(cx, cy, w, hh); e(cx + w * 0.5, cy + hh * 0.75, w * 0.62, hh * 0.72); e(cx - w * 0.52, cy - hh * 0.55 * k, w * 0.5, hh * 0.62); e(cx - w * 0.1, cy - hh * 0.8, w * 0.4, hh * 0.6);
        x.fill();
      };
      for (let i = 0; i < o.n; i++) {
        const cx = (i + r()) * (o.W / o.n), cy = lerp(24, o.h - 24, r()), w = lerp(o.w[0], o.w[1], r()), hh = lerp(o.t[0], o.t[1], r()), k = r() < 0.5 ? 1 : -1;
        x.globalAlpha = lerp(o.a[0], o.a[1], r()); x.fillStyle = o.col; wisp(cx, cy, w, hh, k);
        if (o.col2) { x.fillStyle = o.col2; wisp(cx + w * 0.12, cy + hh * 0.9, w * 0.78, hh * 0.5, k); }
      }
      x.globalAlpha = 1;
    });
    r0[0]._soft = true;
    return r0[0];
  }
  function fogStrip(o) {
    const r0 = mk(o.W, o.h, 0), x = r0[1];
    r0[0]._soft = true;
    tile3(x, o.W, () => {
      const r = U.rng(o.seed);
      for (let i = 0; i < o.n; i++) {
        const cx = (i + r()) * (o.W / o.n), cy = lerp(o.h * 0.38, o.h * 0.62, r()), rx = lerp(170, 330, r()), ry = lerp(o.h * 0.18, o.h * 0.3, r());
        x.save(); x.translate(cx, cy); x.scale(1, ry / rx);
        const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, rgba(o.col, o.a)); g.addColorStop(0.55, rgba(o.col, o.a * 0.42)); g.addColorStop(1, rgba(o.col, 0));
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, rx, 0, TAU); x.fill(); x.restore();
      }
    });
    return r0[0];
  }
  // sun / moon sprite with a soft halo
  function orb(rad, core, glowCol, glowR, a, paint) {
    const S = glowR * 2, r = A.makeCanvas(S, S, Math.min(rs(), 1.5)); CV.push(r[0]);
    const x = r[1], g = x.createRadialGradient(glowR, glowR, rad * 0.7, glowR, glowR, glowR);
    g.addColorStop(0, rgba(glowCol, a)); g.addColorStop(0.3, rgba(glowCol, a * 0.4)); g.addColorStop(0.65, rgba(glowCol, a * 0.11)); g.addColorStop(1, rgba(glowCol, 0));
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    if (core) { x.fillStyle = core; circ(x, glowR, glowR, rad); }
    if (paint) paint(x, glowR, glowR, rad);
    return r[0];
  }
  const orbLayer = (cv, px, py, fx, fy) => ({ fn(ctx, view, t, vy) { A.blit(ctx, cv, Math.round(px - view.x * fx - cv._w / 2), Math.round(py + vy * fy - cv._h / 2)); } });
  function starsLayer(n, seed, ymax, col) {
    return { fn(ctx, view, t, vy) {
      ctx.fillStyle = col;
      for (let i = 0; i < n; i++) {
        const sx = mod(hsh(i, seed) * W - view.x * 0.012, W), sy = hsh(i, seed + 1) * ymax + vy * 0.03;
        const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + hsh(i, seed + 2) * 2) + i * 1.7), s = 1.2 + hsh(i, seed + 3) * 1.3;
        ctx.globalAlpha = 0.2 + 0.65 * tw; ctx.fillRect(sx, sy, s, s);
      }
      ctx.globalAlpha = 1;
    } };
  }

  // ------------------------------------------------------------------ silhouettes (flat, no outlines)
  function tree(x, cx, by, s, col, trunk) {
    x.fillStyle = trunk || col; x.fillRect(cx - 1.6 * s, by - 10 * s, 3.2 * s, 12 * s);
    x.fillStyle = col; circ(x, cx, by - 17 * s, 8.5 * s); circ(x, cx - 6.5 * s, by - 11.5 * s, 6.5 * s); circ(x, cx + 6.5 * s, by - 11.5 * s, 6.5 * s);
  }
  function pine(x, cx, by, s, col, snow) {
    x.fillStyle = col; x.fillRect(cx - 1.5 * s, by - 6 * s, 3 * s, 9 * s);
    for (let i = 0; i < 3; i++) {
      const w = (13 - i * 3) * s, y0 = by - (5 + i * 9) * s;
      x.fillStyle = col; x.beginPath(); x.moveTo(cx - w, y0); x.lineTo(cx, y0 - 15 * s); x.lineTo(cx + w, y0); x.closePath(); x.fill();
      if (snow) { x.fillStyle = snow; x.beginPath(); x.moveTo(cx - w * 0.56, y0 - 6.6 * s); x.lineTo(cx, y0 - 15 * s); x.lineTo(cx + w * 0.56, y0 - 6.6 * s); x.lineTo(cx + w * 0.2, y0 - 8.6 * s); x.lineTo(cx, y0 - 6 * s); x.lineTo(cx - w * 0.26, y0 - 8.8 * s); x.closePath(); x.fill(); }
    }
  }
  function palm(x, cx, by, s, col, lean, r) {
    const tx = cx + lean * 26 * s, ty = by - (50 + r() * 18) * s;
    x.strokeStyle = col; x.lineWidth = 4.2 * s; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx, by + 4 * s); x.quadraticCurveTo(cx + lean * 3 * s, by - 30 * s, tx, ty); x.stroke();
    x.fillStyle = col;
    for (let i = 0; i < 8; i++) { // arching, drooping fronds
      const a = -PI * (0.02 + (i / 7) * 0.96), len = (27 + r() * 11) * s, ca = Math.cos(a), sa = Math.sin(a);
      const mx = tx + ca * len * 0.55, my = ty + sa * len * 0.62 - len * 0.16, th = len * 0.27;
      const ex = tx + ca * len, ey = ty + sa * len * 0.45 + (0.3 + Math.abs(ca) * 0.55) * len * 0.62;
      x.beginPath(); x.moveTo(tx, ty); x.quadraticCurveTo(mx, my - th, ex, ey); x.quadraticCurveTo(mx, my + th, tx, ty); x.closePath(); x.fill();
    }
    circ(x, tx, ty, 3.6 * s);
  }
  function cottage(x, cx, by, s, wall, roof, win, r) {
    const w = (26 + r() * 14) * s, h = (15 + r() * 6) * s, rh = (13 + r() * 6) * s;
    x.fillStyle = wall; x.fillRect(cx - w / 2, by - h, w, h + 8 * s);
    x.fillStyle = roof; x.beginPath(); x.moveTo(cx - w / 2 - 4 * s, by - h + 1); x.lineTo(cx - w * 0.2, by - h - rh); x.lineTo(cx + w * 0.2, by - h - rh); x.lineTo(cx + w / 2 + 4 * s, by - h + 1); x.closePath(); x.fill();
    x.fillRect(cx + w * 0.22, by - h - rh - 5 * s, 4.4 * s, 10 * s);
    if (win) { x.fillStyle = win; x.fillRect(cx - w * 0.3, by - h * 0.74, 4.6 * s, 5.6 * s); if (w > 31 * s) x.fillRect(cx + w * 0.08, by - h * 0.74, 4.6 * s, 5.6 * s); }
    return [cx + w * 0.22 + 2.2 * s, by - h - rh - 5 * s];
  }
  function lighthouse(x, cx, by, s, col, dark) {
    x.fillStyle = col;
    x.beginPath(); x.moveTo(cx - 12 * s, by); x.lineTo(cx - 6.5 * s, by - 80 * s); x.lineTo(cx + 6.5 * s, by - 80 * s); x.lineTo(cx + 12 * s, by); x.closePath(); x.fill();
    x.fillRect(cx - 10.5 * s, by - 84 * s, 21 * s, 4.5 * s);
    x.fillRect(cx - 5.6 * s, by - 96 * s, 11.2 * s, 12 * s);
    x.beginPath(); x.moveTo(cx - 8.5 * s, by - 96 * s); x.lineTo(cx, by - 109 * s); x.lineTo(cx + 8.5 * s, by - 96 * s); x.closePath(); x.fill();
    x.fillRect(cx - 0.8 * s, by - 115 * s, 1.6 * s, 7 * s);
    x.fillStyle = dark; x.fillRect(cx - 3.6 * s, by - 94 * s, 7.2 * s, 8 * s);
    x.beginPath(); x.moveTo(cx - 10.2 * s, by - 28 * s); x.lineTo(cx + 10.2 * s, by - 28 * s); x.lineTo(cx + 9.8 * s, by - 34 * s); x.lineTo(cx - 9.8 * s, by - 34 * s); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(cx - 8.2 * s, by - 56 * s); x.lineTo(cx + 8.2 * s, by - 56 * s); x.lineTo(cx + 7.8 * s, by - 62 * s); x.lineTo(cx - 7.8 * s, by - 62 * s); x.closePath(); x.fill();
  }
  function tent(x, cx, by, s, col, col2, flag) {
    x.fillStyle = col; x.beginPath(); x.moveTo(cx - 20 * s, by + 3 * s); x.quadraticCurveTo(cx - 8 * s, by - 16 * s, cx, by - 27 * s); x.quadraticCurveTo(cx + 8 * s, by - 16 * s, cx + 20 * s, by + 3 * s); x.closePath(); x.fill();
    x.fillStyle = col2; x.beginPath(); x.moveTo(cx - 5 * s, by + 3 * s); x.quadraticCurveTo(cx - 1.5 * s, by - 12 * s, cx, by - 27 * s); x.quadraticCurveTo(cx + 1.5 * s, by - 12 * s, cx + 5 * s, by + 3 * s); x.closePath(); x.fill();
    x.fillStyle = col; x.fillRect(cx - 0.7 * s, by - 37 * s, 1.4 * s, 11 * s);
    if (flag) { x.fillStyle = flag; x.beginPath(); x.moveTo(cx + 0.7 * s, by - 37 * s); x.lineTo(cx + 10 * s, by - 34 * s); x.lineTo(cx + 0.7 * s, by - 31 * s); x.closePath(); x.fill(); }
  }
  function adobe(x, cx, by, s, col, win, r) { // a huddle of flat-roofed desert houses, some domed
    const n = 3 + ((r() * 2) | 0); let px = cx - n * 11 * s;
    for (let i = 0; i < n; i++) {
      const w = (16 + r() * 12) * s, h = (14 + r() * 22) * s;
      x.fillStyle = col; x.beginPath(); x.roundRect(px, by - h, w, h + 8 * s, [3 * s, 3 * s, 0, 0]); x.fill();
      if (r() < 0.4) { x.beginPath(); x.arc(px + w / 2, by - h + 0.5, w * 0.42, PI, TAU); x.fill(); x.fillRect(px + w / 2 - 0.8 * s, by - h - w * 0.42 - 5 * s, 1.6 * s, 6 * s); }
      if (win && r() < 0.7) { x.fillStyle = win; x.fillRect(px + w * 0.36, by - h * 0.62, 3 * s, 4.6 * s); }
      px += w - 2 * s;
    }
  }
  function swampTree(x, cx, by, s, col, r, moss) {
    const hgt = (150 + r() * 110) * s, w = (9 + r() * 6) * s, bend = (r() - 0.5) * 50 * s, sway = (r() - 0.5) * 30 * s;
    x.strokeStyle = col; x.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
      if (!i) continue;
      x.lineWidth = (3.6 - Math.abs(i) * 0.7) * s;
      x.beginPath(); x.moveTo(cx + i * w * 0.2, by - 36 * s); x.quadraticCurveTo(cx + i * w * 0.95, by - 30 * s, cx + i * w * 1.3, by + 8 * s); x.stroke();
    }
    x.fillStyle = col;
    x.beginPath(); x.moveTo(cx - w * 0.8, by - 16 * s); x.quadraticCurveTo(cx - w * 0.25 + sway, by - hgt * 0.5, cx - w * 0.32 + bend, by - hgt);
    x.lineTo(cx + w * 0.32 + bend, by - hgt); x.quadraticCurveTo(cx + w * 0.5 + sway, by - hgt * 0.5, cx + w * 0.8, by - 16 * s); x.closePath(); x.fill();
    const cy = by - hgt, bl = [];
    for (let i = 0; i < 5; i++) bl.push([cx + bend + (r() - 0.5) * 92 * s, cy + (r() - 0.62) * 30 * s, (32 + r() * 26) * s, (12 + r() * 9) * s]);
    for (const b of bl) ell(x, b[0], b[1], b[2], b[3]);
    if (moss) {
      x.strokeStyle = moss; x.lineWidth = 1.7 * s;
      for (let i = 0; i < 10; i++) { const mx = cx + bend + (r() - 0.5) * 124 * s, my = cy + r() * 12 * s; x.beginPath(); x.moveTo(mx, my); x.quadraticCurveTo(mx + 2.5 * s, my + 18 * s, mx - 1 * s, my + (20 + r() * 44) * s); x.stroke(); }
    }
  }
  function reeds(x, cx, by, s, col, r, n) {
    x.strokeStyle = col; x.lineWidth = 1.7 * s; x.lineCap = 'round'; x.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const rx = cx + (r() - 0.5) * 26 * s, hh = (18 + r() * 26) * s, lean = (r() - 0.5) * 9 * s;
      x.beginPath(); x.moveTo(rx, by + 3); x.quadraticCurveTo(rx + lean * 0.2, by - hh * 0.5, rx + lean, by - hh); x.stroke();
      if (r() < 0.55) { x.beginPath(); x.ellipse(rx + lean, by - hh - 3 * s, 2.1 * s, 5.2 * s, lean * 0.02, 0, TAU); x.fill(); }
    }
  }
  function column(x, cx, hh, w, col, hi, r) {
    const ph = r() * TAU, n = 26, lx = [], rx = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, wd = w * (0.36 + 0.64 * Math.pow(Math.abs(2 * u - 1), 1.5)) * (1 + 0.13 * Math.sin(u * 17 + ph)), dx = Math.sin(u * 8 + ph) * w * 0.1;
      lx.push(cx - wd + dx); rx.push(cx + wd + dx);
    }
    x.fillStyle = col; x.beginPath();
    for (let i = 0; i <= n; i++) x[i ? 'lineTo' : 'moveTo'](lx[i], (i / n) * hh);
    for (let i = n; i >= 0; i--) x.lineTo(rx[i], (i / n) * hh);
    x.closePath(); x.fill();
    if (hi) {
      x.fillStyle = hi; x.beginPath();
      for (let i = 0; i <= n; i++) x[i ? 'lineTo' : 'moveTo'](lx[i], (i / n) * hh);
      for (let i = n; i >= 0; i--) x.lineTo(lx[i] + (rx[i] - lx[i]) * 0.2, (i / n) * hh);
      x.closePath(); x.fill();
    }
  }
  function tite(x, cx, y0, len, w, col, hi) { // stalactite (len>0 hangs down) / stalagmite (len<0 rises)
    x.fillStyle = col; x.beginPath(); x.moveTo(cx - w, y0); x.quadraticCurveTo(cx - w * 0.28, y0 + len * 0.45, cx, y0 + len); x.quadraticCurveTo(cx + w * 0.28, y0 + len * 0.45, cx + w, y0); x.closePath(); x.fill();
    if (hi) { x.fillStyle = hi; x.beginPath(); x.moveTo(cx - w, y0); x.quadraticCurveTo(cx - w * 0.28, y0 + len * 0.45, cx, y0 + len); x.quadraticCurveTo(cx - w * 0.2, y0 + len * 0.4, cx - w * 0.45, y0); x.closePath(); x.fill(); }
  }
  function shard(x, bx, by, ang, len, wd, col, hi) {
    const ca = Math.sin(ang), sa = -Math.cos(ang), px = -sa, py = ca;
    x.fillStyle = col; x.beginPath(); x.moveTo(bx - px * wd * 0.6, by - py * wd * 0.6); x.lineTo(bx + ca * len * 0.7 - px * wd, by + sa * len * 0.7 - py * wd); x.lineTo(bx + ca * len, by + sa * len);
    x.lineTo(bx + ca * len * 0.7 + px * wd, by + sa * len * 0.7 + py * wd); x.lineTo(bx + px * wd * 0.6, by + py * wd * 0.6); x.closePath(); x.fill();
    if (hi) { x.fillStyle = hi; x.beginPath(); x.moveTo(bx - px * wd * 0.6, by - py * wd * 0.6); x.lineTo(bx + ca * len * 0.7 - px * wd, by + sa * len * 0.7 - py * wd); x.lineTo(bx + ca * len, by + sa * len); x.lineTo(bx + ca * len * 0.3, by + sa * len * 0.3); x.closePath(); x.fill(); }
  }
  function crystals(x, cx, by, s, col, hi, r) {
    const n = 3 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) shard(x, cx + (i - (n - 1) / 2) * 7 * s, by, (i - (n - 1) / 2) * 0.42 + (r() - 0.5) * 0.3, (20 + r() * 26) * s, (4 + r() * 3) * s, col, hi);
  }

  // ------------------------------------------------------------------ per-frame layer blit
  function drawLayer(ctx, L, view, t, vy) {
    const s = rs(), v = L.vmax !== undefined && vy > L.vmax ? L.vmax : vy;
    const y = Math.round((L.y0 + L.fy * v) * s) / s;
    let off = Math.round(mod(view.x * L.fx + (L.tspd ? t * L.tspd : 0), L.W) * s) / s;
    if (off >= L.W) off -= L.W;
    const cov = L._cov, cv = L.cv, cs = cv._s;
    if (y < cov) {
      // rows hidden behind a nearer, fully opaque layer are skipped (source is cropped to whole pixels)
      let sh = cv.height, dh = L.h;
      if (y + L.h > cov + 1) { sh = Math.min(cv.height, Math.ceil((cov + 1 - y) * cs)); dh = sh / cs; }
      if (L.alpha !== undefined) ctx.globalAlpha = L.af ? L.alpha * L.af(t) : L.alpha;
      if (L.comp) ctx.globalCompositeOperation = L.comp;
      if (L.bands) { // sparse layer: only blit the column bands that hold something
        for (let i = 0; i < L.bands.length; i++) {
          const b = L.bands[i];
          for (let sx = b[0] - off; sx < W; sx += L.W) if (sx + b[1] > 0) ctx.drawImage(cv, b[0] * cs, 0, b[1] * cs, sh, sx, y, b[1], dh);
        }
      } else {
        ctx.drawImage(cv, 0, 0, cv.width, sh, -off, y, L.W, dh);
        // second tile; solid-bodied layers overlap by 1 device px so no seam can open even under a sub-pixel transform
        if (L.W - off < W) ctx.drawImage(cv, 0, 0, cv.width, sh, L.W - off - (L.lap ? 1 / s : 0), y, L.W, dh);
      }
      if (L.alpha !== undefined) ctx.globalAlpha = 1;
      if (L.comp) ctx.globalCompositeOperation = 'source-over';
      if (L.fill && y + L.h < H && y + L.h < cov + 1) { ctx.fillStyle = L.fill; ctx.fillRect(0, y + L.h - 1, W, Math.min(H, cov + 1) - y - L.h + 2); }
    }
    if (L.items) {
      for (let i = 0; i < L.items.length; i++) {
        const it = L.items[i]; let sx = it.x - off;
        if (sx < -it.r) sx += L.W;
        if (sx < W + it.r) L.item(ctx, it, sx, y + it.y, t);
      }
    }
  }

  // ------------------------------------------------------------------ cache (LRU of 2 themes)
  const BUILD = {}, built = {};
  let lru = [];
  function free(b) { if (b) for (const c of b.cvs) { c.width = 0; c.height = 0; } }
  function get(theme) {
    let b = built[theme];
    if (b && b.rs === rs()) {
      if (lru[lru.length - 1] !== theme) { lru = lru.filter((k) => k !== theme); lru.push(theme); }
      return b;
    }
    if (b) free(b);
    CV = [];
    b = BUILD[theme]();
    b.cvs = CV; b.rs = rs(); CV = [];
    built[theme] = b;
    lru = lru.filter((k) => k !== theme); lru.push(theme);
    while (lru.length > 2) { const k = lru.shift(); free(built[k]); delete built[k]; }
    return b;
  }
  A.bgPrepare = (theme) => { if (BUILD[theme]) get(theme); };
  // debug: cache size of a built theme
  A.bgInfo = (theme) => { const b = built[theme]; if (!b) return null; let px = 0; for (const c of b.cvs) px += c.width * c.height; return { layers: b.layers.length, canvases: b.cvs.length, mb: Math.round((px * 4) / 104857.6) / 10 }; };
  function install(theme) {
    const amb = A.ambient[theme];
    if (amb) A.ambient[theme] = function (ctx, view, t) { ctx.save(); amb(ctx, view, t || 0); ctx.restore(); };
    A.bg[theme] = function (ctx, view, t) {
      const B = get(theme), mh = view.mh || H;
      const vy = Math.max(0, mh - H - view.y), Ls = B.layers;
      t = t || 0;
      ctx.save();
      // front-to-back: the screen line below which a nearer strip is fully opaque → farther layers (and the sky) stop there
      let cover = H;
      for (let i = Ls.length - 1; i >= 0; i--) {
        const L = Ls[i];
        if (L.fn) continue;
        L._cov = cover;
        if (L.solid !== undefined) { const sy = L.y0 + L.fy * (L.vmax !== undefined && vy > L.vmax ? L.vmax : vy) + L.solid; if (sy < cover) cover = sy; }
      }
      if (B.sky) {
        const sy = Math.round(-SKY_PAD + Math.min(SKY_PAD, vy * 0.07)), sh = Math.max(1, Math.min(H, Math.ceil(cover) + 1));
        ctx.drawImage(B.sky, 1, -sy, 2, sh, 0, 0, W, sh);
      }
      for (let i = 0; i < Ls.length; i++) { const L = Ls[i]; if (L.fn) L.fn(ctx, view, t, vy); else drawLayer(ctx, L, view, t, vy); }
      ctx.restore();
    };
  }

  // ================================================================== 1. TOWN — golden hour village
  BUILD.town = function () {
    const P = A.PAL.town, hz = P.sky[1];
    const sky = mkSky([[0, mix(P.sky[0], '#8f9fd8', 0.25)], [0.36, mix(P.sky[0], hz, 0.5)], [0.66, hz], [0.86, mix(hz, '#ffc08a', 0.5)], [1, mix(hz, '#ffa87a', 0.6)]]);
    const sun = orb(46, '#fff7dc', '#ffdf96', 260, 0.95);
    const cl = streakStrip({ W: 1600, h: 230, seed: 'town_c', n: 9, w: [70, 190], t: [5, 12], a: [0.4, 0.75], col: '#fff3e0', col2: '#ffd2b0' });
    const c1 = mix(P.far, hz, 0.5), lh = mix('#8394aa', hz, 0.22);
    const [s1] = hillStrip({ W: 1600, h: 320, q: 0, seed: 'town1', base: 184, amp: 20, col: c1, col2: mix(P.far, hz, 0.8),
      under: (x, f, r) => {
        const lx = 1090;
        x.fillStyle = c1; ell(x, lx, f(lx) + 46, 230, 64);
        lighthouse(x, lx, f(lx) - 15, 1.12, lh, mix(lh, '#566a84', 0.5));
        for (let i = 0; i < 16; i++) { const tx = r() * 1600; if (Math.abs(tx - lx) > 70) tree(x, tx, f(tx) + 3, 0.42 + r() * 0.2, mix(c1, '#7fa890', 0.42)); }
      } });
    const c2 = mix(P.far, '#ecd9a6', 0.28), wl2 = mix('#d2ab8c', c2, 0.45), rf2 = mix('#a8644a', c2, 0.4), tr2 = mix(P.mid, c2, 0.4);
    const [s2] = hillStrip({ W: 1920, h: 200, q: 1, seed: 'town2', base: 56, amp: 19, col: c2, col2: mix(c2, hz, 0.55),
      under: (x, f, r) => {
        for (let i = 0; i < 6; i++) {
          const cx = (i + 0.2 + r() * 0.6) * 320, n = 1 + ((r() * 3) | 0);
          for (let k = 0; k < n; k++) { const hx = cx + (k - n / 2) * 30 + r() * 8; cottage(x, hx, f(hx) + 2, 0.58, wl2, rf2, '#ffe6a6', r); }
          for (let k = 0; k < 3; k++) { const tx = cx + (r() - 0.5) * 190; tree(x, tx, f(tx) + 3, 0.6 + r() * 0.25, tr2); }
        }
      } });
    const c3 = mix(P.mid, '#d8c878', 0.24), wl3 = mix('#dbb896', c3, 0.22), rf3 = mix('#b0684c', c3, 0.18), tr3 = mix(P.mid, '#4f8f62', 0.45), smoke = [];
    const [s3] = hillStrip({ W: 1920, h: 210, q: 1, seed: 'town3', base: 54, amp: 17, col: c3, col2: mix(c3, hz, 0.34),
      under: (x, f, r, k) => {
        for (let i = 0; i < 4; i++) {
          const cx = (i + 0.2 + r() * 0.6) * 480, n = 1 + ((r() * 2) | 0);
          for (let j = 0; j < n; j++) {
            const hx = cx + (j - n / 2) * 50 + r() * 10, ch = cottage(x, hx, f(hx) + 2, 0.95, wl3, rf3, '#ffe08a', r);
            if (k === 0 && j === 0) smoke.push({ x: mod(ch[0], 1920), y: ch[1], r: 60, ph: r() });
          }
          for (let j = 0; j < 4; j++) { const tx = cx + (r() - 0.5) * 260; tree(x, tx, f(tx) + 4, 0.9 + r() * 0.4, tr3); }
        }
      } });
    const c4 = mix(P.mid, P.top, 0.5);
    const [s4] = hillStrip({ W: 2048, h: 190, q: 2, seed: 'town4', base: 40, amp: 11, oct: OCT_LOW, col: c4, col2: mix(c4, P.body, 0.14),
      under: (x, f, r) => { x.fillStyle = mix(c4, '#4f9a5a', 0.35); for (let i = 0; i < 22; i++) { const bx = r() * 2048, s = 0.7 + r() * 0.8; ell(x, bx, f(bx) + 3, 20 * s, 10 * s); ell(x, bx + 13 * s, f(bx + 13) + 3, 13 * s, 7 * s); } },
      deco: (x, f, r) => { for (let i = 0; i < 60; i++) { const fx = r() * 2048; x.fillStyle = r() < 0.5 ? '#fff6d8' : '#ffd27a'; circ(x, fx, f(fx) + 8 + r() * 26, 1.3 + r() * 0.8); } } });
    return { sky, layers: [
      orbLayer(sun, 905, 372, 0.012, 0.03),
      strip(cl, { fx: 0.03, fy: 0.02, y0: 96, tspd: 3 }),
      strip(s1, { fx: 0.06, fy: 0.04, y0: 211, fill: mix(P.far, hz, 0.8) }),
      strip(s2, { fx: 0.14, fy: 0.08, y0: 386, fill: mix(c2, hz, 0.55) }),
      strip(s3, { fx: 0.28, fy: 0.14, y0: 440, fill: mix(c3, hz, 0.34), items: smoke, item: (ctx, it, sx, sy, t) => {
        ctx.fillStyle = '#fff6ea';
        for (let k = 0; k < 4; k++) { const ph = mod(t * 0.22 + k / 4 + it.ph, 1); ctx.globalAlpha = (1 - ph) * 0.42; circ(ctx, sx + ph * 16 + Math.sin(ph * 5 + k) * 3, sy - ph * 38, 2.6 + ph * 7.5); }
        ctx.globalAlpha = 1;
      } }),
      strip(s4, { fx: 0.46, fy: 0.22, y0: 512, fill: mix(c4, P.body, 0.14) }),
    ] };
  };
  A.ambient.town = (ctx, view, t) => motes(ctx, view, t, { n: 22, k: 11, col: A.PAL.town.glow, r: [4, 9], a: [0.12, 0.5], vx: 5, vy: -7, par: 0.8, sw: 20 });

  // ================================================================== 2. MEADOW — bright fresh day
  BUILD.meadow = function () {
    const P = A.PAL.meadow, hz = P.sky[1];
    const sky = mkSky([[0, P.sky[0]], [0.58, mix(P.sky[0], hz, 0.72)], [1, mix(hz, '#ffffff', 0.4)]]);
    const sun = orb(30, '#fffce6', '#fff8c8', 200, 0.62);
    const clF = cloudStrip({ W: 1600, h: 210, seed: 'mea_cf', n: 7, y: [60, 170], s: [0.36, 0.62], col: '#f4fbff', shade: mix(hz, P.sky[0], 0.22) });
    const clN = cloudStrip({ W: 2048, h: 290, q: 1, seed: 'mea_cn', n: 6, y: [90, 230], s: [0.85, 1.4], col: '#ffffff', shade: '#d3ebfb' });
    const c1 = mix(P.far, hz, 0.55);
    const [s1] = hillStrip({ W: 1600, h: 230, q: 0, seed: 'mea1', base: 84, amp: 34, oct: [[2, 1], [3, 0.7], [5, 0.45], [8, 0.25], [13, 0.1]], col: c1, col2: mix(P.far, hz, 0.85) });
    const c2 = P.far, mills = [], millCol = mix(c2, '#7f9fb0', 0.45);
    const [s2] = hillStrip({ W: 1920, h: 200, q: 1, seed: 'mea2', base: 58, amp: 21, col: c2, col2: mix(c2, hz, 0.5),
      under: (x, f, r, k) => {
        for (let i = 0; i < 26; i++) { const tx = r() * 1920; tree(x, tx, f(tx) + 3, 0.5 + r() * 0.3, mix(c2, '#6fba8a', 0.5)); }
        for (const mx of [430, 1310]) {
          const by = f(mx) + 4, s = 1.05;
          x.fillStyle = millCol; x.beginPath(); x.moveTo(mx - 9 * s, by); x.lineTo(mx - 5.5 * s, by - 36 * s); x.lineTo(mx + 5.5 * s, by - 36 * s); x.lineTo(mx + 9 * s, by); x.closePath(); x.fill();
          x.beginPath(); x.moveTo(mx - 7 * s, by - 36 * s); x.lineTo(mx, by - 45 * s); x.lineTo(mx + 7 * s, by - 36 * s); x.closePath(); x.fill();
          if (k === 0) mills.push({ x: mx, y: by - 37 * s, r: 50, s, ph: mx });
        }
      } });
    const c3 = P.mid, tr3 = mix(c3, '#3f9a62', 0.42);
    const [s3] = hillStrip({ W: 1920, h: 210, q: 1, seed: 'mea3', base: 54, amp: 19, col: c3, col2: mix(c3, hz, 0.3),
      under: (x, f, r) => { for (let i = 0; i < 9; i++) { const cx = r() * 1920, n = 2 + ((r() * 4) | 0); for (let j = 0; j < n; j++) { const tx = cx + (j - n / 2) * 22 + r() * 8; tree(x, tx, f(tx) + 4, 0.85 + r() * 0.5, tr3); } } },
      deco: (x, f, r) => { x.fillStyle = mix(c3, '#d6f29a', 0.3); for (let i = 0; i < 12; i++) { const px = r() * 1920; ell(x, px, f(px) + 34 + r() * 40, 60 + r() * 80, 7 + r() * 6); } } });
    const c4 = mix(P.mid, P.top, 0.55);
    const [s4] = hillStrip({ W: 2048, h: 190, q: 2, seed: 'mea4', base: 40, amp: 11, oct: OCT_LOW, col: c4, col2: mix(c4, P.body, 0.12),
      under: (x, f, r) => { x.fillStyle = c4; for (let i = 0; i < 90; i++) { const gx = r() * 2048, gh = 5 + r() * 7; x.beginPath(); x.moveTo(gx - 3.5, f(gx) + 2); x.lineTo(gx + (r() - 0.5) * 5, f(gx) - gh); x.lineTo(gx + 3.5, f(gx) + 2); x.closePath(); x.fill(); } },
      deco: (x, f, r) => { for (let i = 0; i < 70; i++) { const fx = r() * 2048; x.fillStyle = r() < 0.6 ? '#ffffff' : P.accent; circ(x, fx, f(fx) + 7 + r() * 30, 1.3 + r() * 0.9); } } });
    return { sky, layers: [
      orbLayer(sun, 250, 112, 0.01, 0.03),
      strip(clF, { fx: 0.02, fy: 0.03, y0: 150, tspd: 2.5 }),
      strip(clN, { fx: 0.05, fy: 0.04, y0: 20, tspd: 6 }),
      { fn: (ctx, view, t) => birds(ctx, view, t, 4, '#5a7fa6') },
      strip(s1, { fx: 0.07, fy: 0.04, y0: 296, fill: mix(P.far, hz, 0.85) }),
      strip(s2, { fx: 0.16, fy: 0.08, y0: 376, fill: mix(c2, hz, 0.5), items: mills, item: (ctx, it, sx, sy, t) => blades(ctx, sx, sy, it.s, t * 0.7 + it.ph, '#f6fcff') }),
      strip(s3, { fx: 0.3, fy: 0.14, y0: 434, fill: mix(c3, hz, 0.3) }),
      strip(s4, { fx: 0.48, fy: 0.22, y0: 516, fill: mix(c4, P.body, 0.12) }),
    ] };
  };
  function blades(ctx, sx, sy, s, ang, col) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang); ctx.fillStyle = col;
    for (let i = 0; i < 4; i++) { ctx.fillRect(-0.9 * s, -25 * s, 1.8 * s, 25 * s); ctx.fillRect(0.9 * s, -24 * s, 5.2 * s, 15 * s); ctx.rotate(PI / 2); }
    ctx.restore();
  }
  function birds(ctx, view, t, n, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = 22 + hsh(i, 9) * 16, x = mod(hsh(i, 7) * 1500 + t * sp - view.x * 0.04, W + 200) - 100;
      const y = 90 + hsh(i, 8) * 150 + Math.sin(t * 0.6 + i * 2) * 12, fl = Math.sin(t * 7 + i * 1.3) * 3.4, s = 0.8 + hsh(i, 5) * 0.6;
      ctx.moveTo(x - 7 * s, y - fl * s); ctx.quadraticCurveTo(x - 3 * s, y - 2.6 * s - fl * 0.3 * s, x, y); ctx.quadraticCurveTo(x + 3 * s, y - 2.6 * s - fl * 0.3 * s, x + 7 * s, y - fl * s);
    }
    ctx.stroke();
  }
  A.ambient.meadow = function (ctx, view, t) {
    // dandelion seeds
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath();
    const n = 18;
    for (let i = 0; i < n; i++) { const d = ppos(i, 20, t, view, 26, 8, 0.9, 16, 10), s = 1.3 + d; BUF[i * 3] = PX; BUF[i * 3 + 1] = PY; BUF[i * 3 + 2] = s; ctx.moveTo(PX + s, PY); ctx.arc(PX, PY, s, 0, TAU); }
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = BUF[i * 3], y = BUF[i * 3 + 1], s = BUF[i * 3 + 2];
      ctx.moveTo(x, y); ctx.lineTo(x - 2, y + s * 3.6); ctx.moveTo(x, y); ctx.lineTo(x - s * 1.6, y - s * 1.5); ctx.moveTo(x, y); ctx.lineTo(x + s * 1.6, y - s * 1.5); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 2.1);
    }
    ctx.stroke();
    // petals
    for (let g = 0; g < 2; g++) {
      ctx.fillStyle = g ? 'rgba(255,214,90,0.85)' : 'rgba(255,170,196,0.85)'; ctx.beginPath();
      for (let i = g; i < 12; i += 2) { ppos(i, 40, t, view, 34, 22, 1.05, 22, 8); const a = t * (1.2 + hsh(i, 41)) + i; ctx.moveTo(PX + 4, PY); ctx.ellipse(PX, PY, 4.2, 2 + Math.abs(Math.sin(a)) * 1.6, a, 0, TAU); }
      ctx.fill();
    }
  };

  // ================================================================== 3. FOREST — deep layered woods
  function trunkStrip(o) {
    const r0 = mk(o.W, o.h, o.q), x = r0[1], sc = o.sc || 1;
    if (o.bg) { const g = x.createLinearGradient(0, 0, 0, o.h); for (const s of o.bg) g.addColorStop(s[0], s[1]); x.fillStyle = g; x.fillRect(0, 0, o.W, o.h); } // opaque: sky baked in
    tile3(x, o.W, () => {
      const r = U.rng(o.seed);
      if (o.canopy) { x.fillStyle = o.canopy; for (let i = 0; i * 64 < o.W; i++) circ(x, i * 64 + r() * 44, -24 + r() * o.canH * 0.5, 56 + r() * 66); }
      for (let i = 0; i < o.n; i++) {
        const cx = (i + 0.15 + r() * 0.7) * (o.W / o.n), w = lerp(o.w[0], o.w[1], r()), bend = (r() - 0.5) * w * 0.9;
        x.fillStyle = o.col; x.beginPath(); x.moveTo(cx - w * 0.44 + bend, -4); x.lineTo(cx + w * 0.44 + bend, -4);
        x.bezierCurveTo(cx + w * 0.4, o.h * 0.4, cx + w * 0.5, o.h * 0.75, cx + w * 0.66, o.h + 4); x.lineTo(cx - w * 0.66, o.h + 4);
        x.bezierCurveTo(cx - w * 0.5, o.h * 0.75, cx - w * 0.4, o.h * 0.4, cx - w * 0.44 + bend, -4); x.closePath(); x.fill();
        if (o.col2) {
          x.fillStyle = o.col2; x.beginPath(); x.moveTo(cx - w * 0.44 + bend, -4); x.bezierCurveTo(cx - w * 0.4, o.h * 0.4, cx - w * 0.5, o.h * 0.75, cx - w * 0.66, o.h + 4); x.lineTo(cx - w * 0.44, o.h + 4);
          x.bezierCurveTo(cx - w * 0.34, o.h * 0.75, cx - w * 0.26, o.h * 0.4, cx - w * 0.28 + bend, -4); x.closePath(); x.fill();
        }
        const nb = o.br ? 1 + ((r() * 3) | 0) : 0;
        for (let b = 0; b < nb; b++) {
          const by = lerp(o.canH * 0.55, o.h * 0.52, r()), dir = r() < 0.5 ? -1 : 1, len = lerp(60, 150, r()) * sc, ex = cx + dir * len, ey = by - len * (0.28 + r() * 0.3);
          x.strokeStyle = o.col; x.lineWidth = Math.max(3, w * 0.2); x.lineCap = 'round';
          x.beginPath(); x.moveTo(cx + dir * w * 0.3, by); x.quadraticCurveTo(cx + dir * len * 0.6, by - 4, ex, ey); x.stroke();
          x.fillStyle = o.leaf; circ(x, ex, ey - 6, (22 + r() * 14) * sc); circ(x, ex - dir * 22 * sc, ey + 2, (16 + r() * 8) * sc); circ(x, ex + dir * 16 * sc, ey + 5, 14 * sc);
        }
        if (o.knots) { // bark hollows + a few bark lines
          x.fillStyle = o.knots; for (let k = 0; k < 2; k++) ell(x, cx + (r() - 0.3) * w * 0.3, lerp(o.canH + 60, o.h - 120, r()), w * 0.06, w * 0.11);
          x.strokeStyle = o.knots; x.lineWidth = 2; x.lineCap = 'round';
          for (let k = 0; k < 5; k++) { const lx = cx + (r() - 0.3) * w * 0.5, ly = r() * (o.h - 140); x.beginPath(); x.moveTo(lx, ly); x.quadraticCurveTo(lx + 3, ly + 30, lx - 1, ly + 50 + r() * 50); x.stroke(); }
        }
      }
      if (o.vines) {
        x.strokeStyle = o.vines; x.fillStyle = o.vines; x.lineWidth = 2 * sc;
        for (let i = 0; i * 120 < o.W; i++) {
          const vx = r() * o.W, len = 70 + r() * (o.canH + 130);
          x.beginPath(); x.moveTo(vx, -4); x.bezierCurveTo(vx + 14, len * 0.35, vx - 12, len * 0.7, vx + 4, len); x.stroke();
          for (let k = 0.3; k < 1; k += 0.2) circ(x, vx + Math.sin(k * 9) * 6, len * k, 3.4 * sc);
        }
      }
    });
    return r0[0];
  }
  function shaftSprite(col) {
    const r0 = A.makeCanvas(120, 400, 1); CV.push(r0[0]);
    const x = r0[1]; let g = x.createLinearGradient(0, 0, 120, 0);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.5, rgba(col, 1)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 120, 400);
    x.globalCompositeOperation = 'destination-in'; g = x.createLinearGradient(0, 0, 0, 400);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 120, 400);
    return r0[0];
  }
  BUILD.forest = function () {
    const P = A.PAL.forest, hz = P.sky[1];
    const cF = mix(P.far, hz, 0.52);
    const tF = trunkStrip({ W: 1600, h: 744, q: 0, seed: 'for_f', n: 13, w: [14, 30], col: cF, canopy: mix(cF, P.far, 0.3), canH: 190,
      bg: [[0, mix(P.sky[0], '#16433f', 0.4)], [0.4, mix(P.sky[0], hz, 0.45)], [0.72, hz], [1, mix(hz, P.far, 0.4)]] });
    const cM = mix(P.far, P.mid, 0.4);
    const tM = trunkStrip({ W: 1920, h: 774, q: 0, seed: 'for_m', n: 8, w: [30, 54], col: cM, col2: mix(cM, hz, 0.22), br: 1, leaf: mix(P.far, P.mid, 0.25), canopy: mix(P.mid, P.far, 0.45), canH: 170, vines: mix(P.mid, P.far, 0.2) });
    const cN = mix(P.mid, '#1f5a4a', 0.4);
    const tN = trunkStrip({ W: 2048, h: 816, q: 1, seed: 'for_n', n: 5, w: [62, 98], col: cN, col2: mix(cN, P.far, 0.26), br: 1, sc: 1.3, leaf: mix(P.mid, '#2a7a52', 0.4), knots: mix(cN, '#123a34', 0.4), canH: 120 });
    const cC = mix(P.mid, '#17443c', 0.5);
    const r0 = mk(2048, 260, 1), x = r0[1];
    tile3(x, 2048, () => {
      const r = U.rng('for_can');
      x.fillStyle = cC; for (let i = 0; i * 52 < 2048; i++) circ(x, i * 52 + r() * 40, 40 + r() * 70, 50 + r() * 50);
      x.fillStyle = mix(cC, P.mid, 0.35); for (let i = 0; i * 90 < 2048; i++) circ(x, i * 90 + r() * 70, 30 + r() * 50, 22 + r() * 26);
      x.strokeStyle = cC; x.fillStyle = cC; x.lineWidth = 2.4;
      for (let i = 0; i < 20; i++) { const vx = r() * 2048, len = 150 + r() * 100; x.beginPath(); x.moveTo(vx, 100); x.bezierCurveTo(vx + 12, 150, vx - 10, len - 30, vx + 3, len); x.stroke(); for (let k = 0.5; k < 1; k += 0.14) ell(x, vx + Math.sin(k * 11) * 5, 100 + (len - 100) * k, 5, 3); }
    });
    const cU = mix(P.mid, '#1f5a4a', 0.5);
    const [sU] = hillStrip({ W: 2048, h: 190, q: 2, seed: 'for_u', base: 50, amp: 9, oct: OCT_LOW, col: cU, col2: mix(cU, '#17443c', 0.4),
      under: (x2, f, r) => {
        x2.fillStyle = cU;
        for (let i = 0; i < 26; i++) { const bx = r() * 2048, s = 0.8 + r() * 0.9; ell(x2, bx, f(bx) + 4, 26 * s, 15 * s); ell(x2, bx + 18 * s, f(bx + 18) + 4, 17 * s, 11 * s); }
        for (let i = 0; i < 34; i++) { // ferns
          const fx = r() * 2048, by = f(fx) + 4;
          for (let k = -2; k <= 2; k++) { x2.beginPath(); x2.moveTo(fx, by); x2.quadraticCurveTo(fx + k * 7, by - 22, fx + k * 15, by - 14 - r() * 10); x2.quadraticCurveTo(fx + k * 5, by - 12, fx, by); x2.closePath(); x2.fill(); }
        }
      },
      deco: (x2, f, r) => { x2.fillStyle = mix(P.accent, cU, 0.45); for (let i = 0; i < 26; i++) { const fx = r() * 2048; circ(x2, fx, f(fx) + 4 + r() * 20, 1.6 + r()); } } });
    const sh = shaftSprite(P.glow);
    return { sky: null, layers: [
      strip(tF, { fx: 0.05, fy: 0.04, y0: -24, vmax: 600 }),
      { fn(ctx, view, t, vy) {
        const pc = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const sx = mod(i * 336 + 90 - view.x * 0.09, W + 400) - 200, w = 130 + hsh(i, 61) * 130;
          ctx.save(); ctx.translate(sx, -70 + vy * 0.05); ctx.rotate(0.34);
          ctx.globalAlpha = 0.26 + 0.12 * Math.sin(t * 0.6 + i * 1.9);
          ctx.drawImage(sh, -w / 2, 0, w, 940); ctx.restore();
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = pc;
      } },
      strip(tM, { fx: 0.14, fy: 0.09, y0: -54, vmax: 600 }),
      strip(tN, { fx: 0.3, fy: 0.16, y0: -96, vmax: 600 }),
      strip(r0[0], { fx: 0.42, fy: 0.18, y0: -175, vmax: 900 }),
      strip(sU, { fx: 0.5, fy: 0.24, y0: 500, fill: mix(cU, '#17443c', 0.4) }),
    ] };
  };
  A.ambient.forest = function (ctx, view, t) {
    const cols = ['rgba(150,214,110,0.9)', 'rgba(232,214,96,0.9)', 'rgba(255,170,196,0.85)'];
    for (let g = 0; g < 3; g++) {
      ctx.fillStyle = cols[g]; ctx.beginPath();
      for (let i = g; i < 18; i += 3) { ppos(i, 60, t, view, -14, 30, 1, 30, 6); const a = Math.sin(t * (1 + hsh(i, 63)) + i) * 1.2 + i; ctx.moveTo(PX + 5, PY); ctx.ellipse(PX, PY, 5.2, 2.2 + Math.abs(Math.sin(a * 1.3)) * 1.2, a, 0, TAU); }
      ctx.fill();
    }
    motes(ctx, view, t, { n: 12, k: 70, col: A.PAL.forest.glow, r: [3, 6], a: [0.1, 0.45], vx: 3, vy: -5, par: 0.8, sw: 22 });
  };

  // ================================================================== 4. MARSH — firefly dusk swamp
  BUILD.marsh = function () {
    const P = A.PAL.marsh, hz = P.sky[1];
    const sky = mkSky([[0, mix(P.sky[0], '#161b40', 0.35)], [0.5, mix(P.sky[0], hz, 0.5)], [1, hz]]);
    const moon = orb(58, '#eef5dc', '#bfe6dc', 230, 0.44, (x, cx, cy, r) => {
      x.fillStyle = 'rgba(150,180,170,0.28)'; circ(x, cx - r * 0.3, cy - r * 0.25, r * 0.2); circ(x, cx + r * 0.32, cy + r * 0.1, r * 0.27); circ(x, cx - r * 0.1, cy + r * 0.45, r * 0.14); circ(x, cx + r * 0.2, cy - r * 0.5, r * 0.1);
    });
    const wisps = streakStrip({ W: 1600, h: 200, seed: 'mar_c', n: 7, w: [90, 220], t: [5, 11], a: [0.25, 0.5], col: mix(P.sky[0], hz, 0.75) });
    const c1 = mix(P.far, hz, 0.42);
    const [s1] = hillStrip({ W: 1600, h: 200, q: 0, seed: 'mar1', base: 70, amp: 6, oct: OCT_LOW, col: c1, col2: mix(c1, hz, 0.5),
      under: (x, f, r) => {
        x.fillStyle = c1;
        for (let i = 0; i < 46; i++) { const tx = r() * 1600, s = 0.5 + r() * 0.7, by = f(tx) + 3; x.fillRect(tx - 1.4 * s, by - 34 * s, 2.8 * s, 36 * s); ell(x, tx + (r() - 0.5) * 6, by - 38 * s, (13 + r() * 12) * s, (8 + r() * 7) * s); ell(x, tx + (r() - 0.5) * 14, by - 30 * s, (9 + r() * 8) * s, 5 * s); }
      } });
    const fog1 = fogStrip({ W: 1600, h: 170, seed: 'mar_f1', n: 7, col: mix(hz, '#cfe8e0', 0.5), a: 0.34 });
    const c2 = P.far, moss2 = mix(c2, hz, 0.28);
    const [s2] = hillStrip({ W: 1920, h: 340, q: 1, seed: 'mar2', base: 262, amp: 6, oct: OCT_LOW, col: c2, col2: mix(c2, hz, 0.4), gy0: 250,
      under: (x, f, r) => { for (let i = 0; i < 9; i++) { const tx = (i + 0.1 + r() * 0.8) * (1920 / 9); swampTree(x, tx, f(tx) + 2, 0.72 + r() * 0.25, c2, r, moss2); } } });
    const c3 = P.mid, moss3 = mix(c3, P.top, 0.3);
    const [s3] = hillStrip({ W: 2048, h: 470, q: 1, seed: 'mar3', base: 392, amp: 7, oct: OCT_LOW, col: c3, col2: mix(c3, '#22394a', 0.5), gy0: 380,
      under: (x, f, r) => {
        for (let i = 0; i < 6; i++) { const tx = (i + 0.1 + r() * 0.8) * (2048 / 6); swampTree(x, tx, f(tx) + 2, 1.28 + r() * 0.3, c3, r, moss3); }
        for (let i = 0; i < 16; i++) { const rx = r() * 2048; reeds(x, rx, f(rx), 1, c3, r, 5); }
      } });
    const fog2 = fogStrip({ W: 2048, h: 190, seed: 'mar_f2', n: 8, col: mix(hz, '#d8f0e0', 0.45), a: 0.3 });
    const c4 = mix(P.mid, '#1c2f3e', 0.42);
    const [s4] = hillStrip({ W: 2048, h: 180, q: 2, seed: 'mar4', base: 52, amp: 6, oct: OCT_LOW, col: c4, col2: mix(c4, '#16242f', 0.4),
      under: (x, f, r) => { for (let i = 0; i < 34; i++) { const rx = r() * 2048; reeds(x, rx, f(rx), 1.25, c4, r, 6); } } });
    return { sky, layers: [
      starsLayer(44, 31, 330, '#f2ffe6'),
      orbLayer(moon, 930, 170, 0.012, 0.03),
      strip(wisps, { fx: 0.03, fy: 0.02, y0: 80, tspd: 4 }),
      strip(s1, { fx: 0.07, fy: 0.04, y0: 366, fill: mix(c1, hz, 0.5) }),
      strip(fog1, { fx: 0.1, fy: 0.06, y0: 360, tspd: 5 }),
      strip(s2, { fx: 0.18, fy: 0.1, y0: 214, fill: mix(c2, hz, 0.4) }),
      strip(s3, { fx: 0.32, fy: 0.16, y0: 132, fill: mix(c3, '#22394a', 0.5) }),
      strip(fog2, { fx: 0.4, fy: 0.2, y0: 430, tspd: -7 }),
      strip(s4, { fx: 0.5, fy: 0.24, y0: 506, fill: mix(c4, '#16242f', 0.4) }),
    ] };
  };
  A.ambient.marsh = function (ctx, view, t) {
    const col = A.PAL.marsh.glow, n = 38;
    for (let i = 0; i < n; i++) {
      const d = 0.55 + hsh(i, 83) * 0.9, sp = 0.25 + hsh(i, 84) * 0.35;
      const x = mod(hsh(i, 81) * MW + Math.sin(t * sp + i * 1.7) * 46 + Math.sin(t * sp * 2.3 + i) * 18 + t * 4 * d - view.x * 0.85 * d, MW) - 60;
      const y = mod(hsh(i, 82) * MH + Math.cos(t * sp * 1.4 + i * 2.3) * 34 - view.y * 0.85 * d, MH) - 60;
      const pulse = Math.max(0, Math.sin(t * (0.9 + hsh(i, 85) * 1.3) + i * 2.1));
      if (pulse < 0.04) continue;
      A.glow(ctx, x, y, (7 + d * 7) * (0.7 + pulse * 0.5), col, 0.2 + pulse * 0.6);
      ctx.globalAlpha = pulse; ctx.fillStyle = '#fbffe0'; ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  };

  // ================================================================== 5. CAVE — echoing cavern
  BUILD.cave = function () {
    const P = A.PAL.cave;
    // opaque far wall (sky baked in)
    const rW = mk(1600, 744, 0), xw = rW[1], glows = [];
    xw.fillStyle = vgrad(xw, 0, 744, P.sky[0], P.sky[1]); xw.fillRect(0, 0, 1600, 744);
    tile3(xw, 1600, (k) => {
      const r = U.rng('cave_w');
      for (let i = 0; i < 28; i++) { // soft light / dark patches of the cavern wall
        const bx = r() * 1600, by = r() * 744, rx = 110 + r() * 190, ry = 50 + r() * 100, col = i % 2 ? '#3f396c' : '#0d0a1c', a = 0.3 + r() * 0.25;
        xw.save(); xw.translate(bx, by); xw.scale(1, ry / rx);
        const g = xw.createRadialGradient(0, 0, rx * 0.15, 0, 0, rx); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
        xw.fillStyle = g; xw.beginPath(); xw.arc(0, 0, rx, 0, TAU); xw.fill(); xw.restore();
      }
      xw.fillStyle = rgba('#0c0a1a', 0.5);
      for (let i = 0; i < 5; i++) { const ax = r() * 1600, ay = 250 + r() * 380, aw = 60 + r() * 70; xw.beginPath(); xw.moveTo(ax - aw, ay + 90); xw.quadraticCurveTo(ax - aw, ay - 60, ax, ay - 70); xw.quadraticCurveTo(ax + aw, ay - 60, ax + aw, ay + 90); xw.closePath(); xw.fill(); }
      xw.strokeStyle = rgba('#4a4478', 0.4); xw.lineWidth = 2;
      for (let i = 0; i < 16; i++) { const lx = r() * 1600, ly = r() * 744; xw.beginPath(); xw.moveTo(lx, ly); xw.quadraticCurveTo(lx + 60, ly + (r() - 0.5) * 40, lx + 120 + r() * 80, ly + (r() - 0.5) * 30); xw.stroke(); }
      for (let i = 0; i < 9; i++) {
        const cx = r() * 1600, cy = 120 + r() * 560, vi = r() < 0.4, col = vi ? '#c79bff' : P.accent, s = 0.5 + r() * 0.4;
        const g = xw.createRadialGradient(cx, cy - 12, 0, cx, cy - 12, 70); g.addColorStop(0, rgba(col, 0.26)); g.addColorStop(1, rgba(col, 0)); xw.fillStyle = g; xw.fillRect(cx - 70, cy - 82, 140, 140);
        crystals(xw, cx, cy, s, mix(col, P.far, 0.45), mix(col, '#ffffff', 0.15), r);
        xw.fillStyle = '#1b1734'; xw.beginPath(); xw.moveTo(cx - 46 * s - 14, cy + 9); xw.quadraticCurveTo(cx - 20, cy - 7, cx, cy - 3); xw.quadraticCurveTo(cx + 24, cy - 8, cx + 46 * s + 14, cy + 9); xw.quadraticCurveTo(cx, cy + 22, cx - 46 * s - 14, cy + 9); xw.closePath(); xw.fill();
        xw.strokeStyle = rgba(col, 0.35); xw.lineWidth = 1.5; xw.beginPath(); xw.moveTo(cx - 30 * s, cy - 1); xw.quadraticCurveTo(cx, cy - 6, cx + 30 * s, cy - 1); xw.stroke();
        if (k === 0) glows.push({ x: cx, y: cy - 12, r: 60, col, ph: r() * TAU, s: 26 });
      }
    });
    const cM = P.mid, hiM = mix(cM, P.edge, 0.3), glowsM = [];
    const rM = mk(1920, 780, 1), xm = rM[1];
    tile3(xm, 1920, (k) => {
      const r = U.rng('cave_m');
      for (let i = 0; i < 6; i++) {
        const cx = (i + 0.15 + r() * 0.7) * 320, w = 34 + r() * 40;
        column(xm, cx, 780, w, cM, hiM, r);
        if (r() < 0.75) {
          const cy = 220 + r() * 420, vi = r() < 0.5, col = vi ? '#c79bff' : P.accent, dir = r() < 0.5 ? -1 : 1, bx = cx + dir * w * 0.42;
          const g = xm.createRadialGradient(bx, cy - 14, 0, bx, cy - 14, 80); g.addColorStop(0, rgba(col, 0.3)); g.addColorStop(1, rgba(col, 0)); xm.fillStyle = g; xm.fillRect(bx - 80, cy - 94, 160, 160);
          for (let j = 0; j < 4; j++) shard(xm, bx, cy + j * 2, dir * (0.5 + j * 0.3) + (r() - 0.5) * 0.2, 24 + r() * 26, 4.5 + r() * 3, mix(col, cM, 0.3), mix(col, '#ffffff', 0.35));
          if (k === 0) glowsM.push({ x: mod(bx, 1920), y: cy - 14, r: 90, col, ph: r() * TAU, s: 40 });
        }
      }
    });
    const cT = mix(P.mid, P.body2, 0.55), hiT = mix(cT, P.edge, 0.28);
    const rT = mk(2048, 240, 1), xt = rT[1];
    tile3(xt, 2048, () => {
      const r = U.rng('cave_t'), f = wave(U.rng('cave_tw'), 2048, OCT);
      xt.fillStyle = cT; xt.beginPath(); xt.moveTo(-4, -4); for (let i = -4; i <= 2052; i += 8) xt.lineTo(i, 74 + f(i) * 18); xt.lineTo(2052, -4); xt.closePath(); xt.fill();
      for (let i = 0; i < 44; i++) { const tx = r() * 2048, len = 40 + r() * r() * 150; tite(xt, tx, 66 + f(tx) * 18, len, 9 + len * 0.12, cT, hiT); }
    });
    const cB = mix(P.body2, P.mid, 0.35), hiB = mix(cB, P.edge, 0.25);
    const [sB] = hillStrip({ W: 2048, h: 190, q: 2, seed: 'cave_b', base: 64, amp: 12, col: cB, col2: mix(cB, P.sky[0], 0.45),
      under: (x, f, r) => { for (let i = 0; i < 36; i++) { const tx = r() * 2048, len = 26 + r() * r() * 90; tite(x, tx, f(tx) + 6, -len, 8 + len * 0.16, cB, hiB); } } });
    const glowItem = (ctx, it, sx, sy, t) => A.glow(ctx, sx, sy, it.s * (1 + 0.14 * Math.sin(t * 1.3 + it.ph)), it.col, 0.2 + 0.16 * Math.sin(t * 0.9 + it.ph * 2));
    return { sky: null, layers: [
      strip(rW[0], { fx: 0.05, fy: 0.04, y0: -24, vmax: 600, items: glows, item: glowItem }),
      strip(rM[0], { fx: 0.14, fy: 0.1, y0: -60, vmax: 600, items: glowsM, item: glowItem }),
      strip(rT[0], { fx: 0.3, fy: 0.2, y0: -150, vmax: 700 }),
      strip(sB, { fx: 0.34, fy: 0.22, y0: 482, fill: mix(cB, P.sky[0], 0.45) }),
    ] };
  };
  A.ambient.cave = function (ctx, view, t) {
    ctx.fillStyle = 'rgba(200,196,240,0.3)'; ctx.beginPath();
    for (let i = 0; i < 30; i++) { const d = ppos(i, 90, t, view, 5, 4, 0.8, 16, 12), s = 0.9 + d * 0.9; ctx.moveTo(PX + s, PY); ctx.arc(PX, PY, s, 0, TAU); }
    ctx.fill();
    for (let i = 0; i < 5; i++) { // rare twinkles
      const cyc = t * 0.28 + i * 0.37, n = Math.floor(cyc), ph = cyc - n, b = Math.sin(ph * PI);
      if (b < 0.3) continue;
      const x = hsh(n, 91 + i) * W, y = hsh(n, 95 + i) * H * 0.85, s = 5 + b * 7, col = (n + i) % 2 ? '#c79bff' : A.PAL.cave.accent;
      A.glow(ctx, x, y, s * 2.2, col, b * 0.5);
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = b * 0.9; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.18, y - s * 0.18); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.18, y + s * 0.18); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.18, y + s * 0.18); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.18, y - s * 0.18); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
  };

  // ================================================================== 6. OASIS — desert town at sunset
  BUILD.oasis = function () {
    const P = A.PAL.oasis, hz = P.sky[1];
    const sky = mkSky([[0, mix(P.sky[0], '#c9628a', 0.26)], [0.3, P.sky[0]], [0.66, mix(P.sky[0], hz, 0.72)], [1, hz]]);
    const sun = orb(68, '#fff8d8', '#ffe9a0', 300, 0.85);
    const cl = streakStrip({ W: 1600, h: 240, seed: 'oas_c', n: 9, w: [80, 230], t: [5, 13], a: [0.4, 0.75], col: '#ffe0b8', col2: '#ffb48c' });
    const c1 = mix(P.far, hz, 0.5);
    const [s1] = hillStrip({ W: 1600, h: 190, q: 0, seed: 'oas1', base: 60, amp: 15, oct: OCT_LOW, col: c1, col2: mix(c1, hz, 0.6) });
    const c2 = P.far, pm2 = mix(c2, '#8a5a4a', 0.4), pins = [];
    const [s2] = hillStrip({ W: 1920, h: 244, q: 1, seed: 'oas2', base: 100, amp: 17, oct: OCT_LOW, col: c2, col2: mix(c2, hz, 0.5),
      under: (x, f, r, k) => {
        for (let i = 0; i < 5; i++) {
          const cx = (i + 0.15 + r() * 0.7) * 384;
          for (let j = 0; j < 3; j++) { const px = cx + (j - 1) * 26 + r() * 10; palm(x, px, f(px) + 2, 0.5 + r() * 0.14, pm2, (r() - 0.5) * 1.2, r); }
          if (i % 2 === 0) { const tx = cx + 70; tent(x, tx, f(tx) + 2, 0.62, mix('#f4e3c4', c2, 0.5), mix('#c8644a', c2, 0.5), null); tent(x, tx + 30, f(tx + 30) + 2, 0.5, mix('#f4e3c4', c2, 0.5), mix(P.accent, c2, 0.55), null); adobe(x, cx - 84, f(cx - 84) + 2, 0.66, mix(c2, '#b8704a', 0.36), '#fff0c0', r); }
          else { const px = cx + 80, by = f(px) + 2; x.fillStyle = pm2; x.fillRect(px - 0.9, by - 34, 1.8, 36); if (k === 0) pins.push({ x: mod(px, 1920), y: by - 34, r: 30, s: 0.62, ph: i }); }
        }
      } });
    const c3 = P.mid, pm3 = mix(c3, '#7a4638', 0.5), pins3 = [];
    const [s3] = hillStrip({ W: 1920, h: 290, q: 1, seed: 'oas3', base: 134, amp: 19, oct: OCT_LOW, col: c3, col2: mix(c3, hz, 0.3),
      under: (x, f, r, k) => {
        for (let i = 0; i < 4; i++) {
          const cx = (i + 0.2 + r() * 0.6) * 480;
          for (let j = 0; j < 2 + ((r() * 2) | 0); j++) { const px = cx + (j - 1) * 40 + r() * 14; palm(x, px, f(px) + 3, 0.92 + r() * 0.25, pm3, (r() - 0.5) * 1.3, r); }
          const tx = cx + 110; tent(x, tx, f(tx) + 3, 1.05, mix('#f6e6c8', c3, 0.3), mix(i % 2 ? P.accent : '#c8503f', c3, 0.35), mix(P.accent, c3, 0.2));
          if (i % 2) { const px = cx - 90, by = f(px) + 3; x.fillStyle = pm3; x.fillRect(px - 1.3, by - 52, 2.6, 55); if (k === 0) pins3.push({ x: mod(px, 1920), y: by - 52, r: 40, s: 1, ph: i * 2 }); }
          else adobe(x, cx - 120, f(cx - 120) + 3, 1.1, mix(c3, '#9a5a3c', 0.42), '#ffe08a', r);
        }
      } });
    const c4 = mix(P.mid, P.top, 0.5);
    const [s4] = hillStrip({ W: 2048, h: 190, q: 2, seed: 'oas4', base: 40, amp: 12, oct: OCT_LOW, col: c4, col2: mix(c4, P.body, 0.3),
      deco: (x, f, r) => {
        x.strokeStyle = mix(c4, '#fff6dc', 0.4); x.lineWidth = 1.6;
        for (let i = 0; i < 26; i++) { const px = r() * 2048, py = f(px) + 12 + r() * 40, w = 30 + r() * 60; x.beginPath(); x.moveTo(px - w, py); x.quadraticCurveTo(px, py - 5, px + w, py); x.stroke(); }
        x.fillStyle = mix(c4, P.body2, 0.35); for (let i = 0; i < 14; i++) { const px = r() * 2048; ell(x, px, f(px) + 3, 6 + r() * 9, 4 + r() * 4); }
      } });
    const pinItem = (ctx, it, sx, sy, t) => {
      const s = it.s * 13, a = t * (2.6 + it.ph * 0.3) + it.ph;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#fff3d6' : A.PAL.oasis.accent; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s); ctx.lineTo(s * 0.62, -s * 0.62); ctx.closePath(); ctx.fill(); ctx.rotate(PI / 2); }
      ctx.restore();
    };
    return { sky, layers: [
      orbLayer(sun, 640, 404, 0.012, 0.03),
      strip(cl, { fx: 0.03, fy: 0.02, y0: 110, tspd: 3 }),
      strip(s1, { fx: 0.06, fy: 0.04, y0: 372, fill: mix(c1, hz, 0.6) }),
      strip(s2, { fx: 0.15, fy: 0.08, y0: 362, fill: mix(c2, hz, 0.5), items: pins, item: pinItem }),
      strip(s3, { fx: 0.3, fy: 0.14, y0: 372, fill: mix(c3, hz, 0.3), items: pins3, item: pinItem }),
      strip(s4, { fx: 0.48, fy: 0.22, y0: 516, fill: mix(c4, P.body, 0.3) }),
    ] };
  };
  A.ambient.oasis = (ctx, view, t) => motes(ctx, view, t, { n: 16, k: 101, col: A.PAL.oasis.glow, r: [3, 8], a: [0.1, 0.45], vx: 10, vy: -4, par: 0.85, sw: 18 });

  // ================================================================== 7. CANYON — red rock by day
  function mesaProfile(r, Wl, base, n, hgt, wid, slope) {
    const ms = [];
    for (let i = 0; i < n; i++) ms.push([(i + 0.15 + r() * 0.7) * (Wl / n), lerp(wid[0], wid[1], r()), lerp(hgt[0], hgt[1], r()), slope * (0.7 + r() * 0.6), 0.25 + r() * 0.25]);
    const nz = wave(r, Wl, [[7, 1], [13, 0.6], [23, 0.35]]);
    return (px) => {
      let top = 0;
      for (const m of ms) {
        const d = Math.abs(mod(px - m[0] + Wl / 2, Wl) - Wl / 2);
        const hh = m[2] * (m[4] * ss((m[1] * 0.64 - d) / m[3]) + (1 - m[4]) * ss((m[1] * 0.46 - d) / m[3]));
        if (hh > top) top = hh;
      }
      return base - top + nz(px) * 2.2 - 3;
    };
  }
  function mesaStrip(o) {
    const r0 = mk(o.W, o.h, o.q), x = r0[1], rg = U.rng(o.seed), f = mesaProfile(rg, o.W, o.base, o.n, o.hgt, o.wid, o.slope || 14);
    if (o.under) tile3(x, o.W, (k) => o.under(x, f, U.rng(o.seed + '_u'), k));
    x.fillStyle = vgrad(x, o.base - o.hgt[1], o.h, o.col, o.col2); ridge(x, o.W, o.h, f, 2); x.fill();
    x.save(); ridge(x, o.W, o.h, f, 2); x.clip();
    const r = U.rng(o.seed + '_s'), wv = wave(r, o.W, [[2, 1], [5, 0.5]]);
    for (let y = o.base - o.hgt[1] - 10; y < o.base - 6; y += 13 + r() * 16) {
      x.fillStyle = rgba(r() < 0.6 ? o.strata : o.light, 0.28 + r() * 0.3); const th = 3 + r() * 6;
      x.beginPath(); x.moveTo(-4, y + wv(-4) * 2); for (let i = -4; i <= o.W + 4; i += 24) x.lineTo(i, y + wv(i) * 2); for (let i = o.W + 4; i >= -4; i -= 24) x.lineTo(i, y + th + wv(i) * 2); x.closePath(); x.fill();
    }
    // sun-side highlight along the top edge
    x.strokeStyle = rgba(o.light, 0.5); x.lineWidth = 3; x.beginPath(); for (let i = -4; i <= o.W + 4; i += 2) x[i === -4 ? 'moveTo' : 'lineTo'](i, f(i) + 1.5); x.stroke();
    x.restore();
    if (o.deco) tile3(x, o.W, (k) => o.deco(x, f, U.rng(o.seed + '_d'), k));
    r0[0]._solid = o.base + 6;
    return r0[0];
  }
  function bandSprite(col) {
    const r0 = A.makeCanvas(8, 24, 1); CV.push(r0[0]);
    const g = r0[1].createLinearGradient(0, 0, 0, 24); g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.5, rgba(col, 1)); g.addColorStop(1, rgba(col, 0));
    r0[1].fillStyle = g; r0[1].fillRect(0, 0, 8, 24);
    return r0[0];
  }
  BUILD.canyon = function () {
    const P = A.PAL.canyon, hz = P.sky[1];
    const sky = mkSky([[0, P.sky[0]], [0.5, mix(P.sky[0], hz, 0.62)], [1, mix(hz, '#ffffff', 0.25)]]);
    const sun = orb(32, '#fffdf2', '#fff3c8', 250, 0.8);
    const cl = streakStrip({ W: 1600, h: 200, seed: 'can_c', n: 6, w: [80, 200], t: [4, 9], a: [0.25, 0.5], col: '#fff6e2' });
    const c1 = mix(P.far, hz, 0.55);
    const m1 = mesaStrip({ W: 1600, h: 260, q: 0, seed: 'can1', base: 156, n: 5, hgt: [50, 112], wid: [150, 320], slope: 12, col: c1, col2: mix(c1, hz, 0.5), strata: mix(c1, P.mid, 0.3), light: mix(c1, '#fff3d8', 0.5),
      under: (x, f, r) => { x.fillStyle = c1; for (let i = 0; i < 5; i++) { const sx = r() * 1600, hh = 50 + r() * 70; x.beginPath(); x.moveTo(sx - 9, 170); x.lineTo(sx - 4, 156 - hh); x.lineTo(sx + 4, 156 - hh); x.lineTo(sx + 9, 170); x.closePath(); x.fill(); } } });
    const c2 = P.far;
    const m2 = mesaStrip({ W: 1920, h: 300, q: 1, seed: 'can2', base: 196, n: 4, hgt: [80, 172], wid: [170, 360], slope: 14, col: c2, col2: mix(c2, hz, 0.42), strata: mix(c2, P.body, 0.45), light: mix(c2, '#ffe6c0', 0.5),
      under: (x, f, r) => {
        // a natural rock arch
        x.fillStyle = c2; x.beginPath(); x.moveTo(894, 216); x.lineTo(904, 150); x.quadraticCurveTo(910, 110, 950, 102); x.lineTo(1042, 94); x.quadraticCurveTo(1100, 96, 1114, 132); x.lineTo(1132, 216); x.closePath(); x.fill();
        x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.moveTo(938, 218); x.quadraticCurveTo(934, 138, 1002, 130); x.quadraticCurveTo(1080, 126, 1094, 218); x.closePath(); x.fill();
        x.globalCompositeOperation = 'source-atop'; x.fillStyle = rgba(mix(c2, P.body, 0.45), 0.4); x.fillRect(880, 108, 270, 5); x.fillRect(880, 121, 270, 4); x.fillRect(880, 146, 270, 6); x.fillRect(880, 172, 270, 5);
        x.globalCompositeOperation = 'source-over'; x.fillStyle = c2;
        for (let i = 0; i < 4; i++) { const sx = 200 + r() * 1600, hh = 70 + r() * 90; x.beginPath(); x.moveTo(sx - 13, 210); x.lineTo(sx - 5, 196 - hh); x.lineTo(sx + 6, 196 - hh + 6); x.lineTo(sx + 13, 210); x.closePath(); x.fill(); }
      } });
    const c3 = P.mid;
    const m3 = mesaStrip({ W: 2048, h: 330, q: 1, seed: 'can3', base: 236, n: 3, hgt: [110, 214], wid: [250, 470], slope: 17, col: c3, col2: mix(c3, hz, 0.24), strata: mix(c3, P.body2, 0.5), light: mix(c3, '#ffd6a8', 0.5) });
    const c4 = mix(P.mid, P.body, 0.5);
    const [s4] = hillStrip({ W: 2048, h: 190, q: 2, seed: 'can4', base: 44, amp: 9, oct: OCT_LOW, col: c4, col2: mix(c4, P.body2, 0.3),
      under: (x, f, r) => {
        x.fillStyle = c4;
        for (let i = 0; i < 20; i++) { const bx = r() * 2048, s = 0.7 + r() * 1.1, by = f(bx) + 5; x.beginPath(); x.moveTo(bx - 20 * s, by); x.lineTo(bx - 13 * s, by - 13 * s); x.lineTo(bx + 4 * s, by - 18 * s); x.lineTo(bx + 17 * s, by - 9 * s); x.lineTo(bx + 22 * s, by); x.closePath(); x.fill(); }
        x.strokeStyle = mix(c4, P.accent, 0.3); x.lineWidth = 1.6;
        for (let i = 0; i < 12; i++) { const bx = r() * 2048, by = f(bx) + 3; for (let k = -3; k <= 3; k++) { x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + k * 3.4, by - 9 - r() * 6); x.stroke(); } }
      } });
    const band = bandSprite('#fff8e4');
    return { sky, layers: [
      orbLayer(sun, 1010, 118, 0.01, 0.03),
      strip(cl, { fx: 0.03, fy: 0.02, y0: 150, tspd: 5 }),
      strip(m1, { fx: 0.06, fy: 0.04, y0: 316, fill: mix(c1, hz, 0.5) }),
      strip(m2, { fx: 0.15, fy: 0.08, y0: 306, fill: mix(c2, hz, 0.42) }),
      { fn(ctx, view, t, vy) { for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.1 + 0.07 * Math.sin(t * 1.4 + i * 2.1); ctx.drawImage(band, 2, 0, 4, 24, 0, 448 + i * 30 + vy * 0.1 + Math.sin(t * 0.9 + i * 1.7) * 4, W, 20); } ctx.globalAlpha = 1; } },
      strip(m3, { fx: 0.3, fy: 0.14, y0: 304, fill: mix(c3, hz, 0.24) }),
      strip(s4, { fx: 0.48, fy: 0.22, y0: 512, fill: mix(c4, P.body2, 0.3) }),
    ] };
  };
  A.ambient.canyon = function (ctx, view, t) {
    ctx.lineCap = 'round';
    for (let g = 0; g < 2; g++) {
      ctx.strokeStyle = g ? 'rgba(255,244,214,0.3)' : 'rgba(255,236,196,0.16)'; ctx.lineWidth = g ? 1.6 : 2.6; ctx.beginPath();
      for (let i = g; i < 26; i += 2) { const d = ppos(i, 110, t, view, -330, 14, 1, 0, 10), len = 30 + hsh(i, 113) * 70 * d; ctx.moveTo(PX, PY); ctx.lineTo(PX + len, PY - len * 0.04); }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,240,206,0.5)'; ctx.beginPath();
    for (let i = 0; i < 14; i++) { ppos(i, 120, t, view, -150, 10, 0.9, 6, 14); ctx.moveTo(PX + 1.4, PY); ctx.arc(PX, PY, 1.4, 0, TAU); }
    ctx.fill();
  };

  // ================================================================== 8. SNOW — frozen highlands
  function peakStrip(o) {
    const r0 = mk(o.W, o.h, o.q), x = r0[1], r = U.rng(o.seed), n = o.n, step = o.W / (n * 2), pts = [];
    for (let i = 0; i < n * 2; i++) pts.push([(i + 0.5 + (r() - 0.5) * 0.5) * step, i % 2 ? o.base - lerp(o.hgt[0], o.hgt[1], r()) : o.base - r() * o.hgt[0] * 0.3]);
    const P = (i) => { const k = mod(i, n * 2), w = Math.floor(i / (n * 2)); return [pts[k][0] + w * o.W, pts[k][1]]; };
    x.fillStyle = vgrad(x, o.base - o.hgt[1], o.h, o.col, o.col2);
    x.beginPath(); x.moveTo(P(-2)[0], o.h + 4); for (let i = -2; i <= n * 2 + 2; i++) { const p = P(i); x.lineTo(p[0], p[1]); } x.lineTo(P(n * 2 + 2)[0], o.h + 4); x.closePath(); x.fill();
    for (let i = -1; i <= n * 2 + 1; i += 2) { // peaks are odd indices
      const pk = P(i), a = P(i - 1), b = P(i + 1), by = Math.max(a[1], b[1]) + 46, mx = pk[0] + (b[0] - a[0]) * 0.06;
      x.fillStyle = o.lit; x.beginPath(); x.moveTo(pk[0], pk[1]); x.lineTo(a[0], a[1]); x.lineTo(a[0] + 10, by); x.lineTo(mx, by); x.lineTo(mx - (pk[1] - by) * 0.06, lerp(pk[1], by, 0.55)); x.closePath(); x.fill();
      x.fillStyle = o.snow; const u = 0.3 + hsh(i, 5) * 0.12; // snow cap
      x.beginPath(); x.moveTo(pk[0], pk[1]); x.lineTo(lerp(pk[0], a[0], u), lerp(pk[1], a[1], u)); x.lineTo(lerp(pk[0], a[0], u * 0.55), lerp(pk[1], a[1], u * 0.55) + 9); x.lineTo(pk[0] - 2, lerp(pk[1], by, 0.2));
      x.lineTo(lerp(pk[0], b[0], u * 0.5), lerp(pk[1], b[1], u * 0.5) + 10); x.lineTo(lerp(pk[0], b[0], u * 0.9), lerp(pk[1], b[1], u * 0.9)); x.closePath(); x.fill();
    }
    x.fillStyle = vgrad(x, o.base - 20, o.h, rgba(o.col2, 0), o.col2); x.fillRect(0, o.base - 20, o.W, o.h - o.base + 20);
    r0[0]._solid = o.base + 3;
    return r0[0];
  }
  BUILD.snow = function () {
    const P = A.PAL.snow, hz = P.sky[1];
    const sky = mkSky([[0, mix(P.sky[0], '#3f62b4', 0.45)], [0.3, P.sky[0]], [0.66, mix(P.sky[0], hz, 0.66)], [1, hz]]);
    const rA = A.makeCanvas(8, 200, 1); CV.push(rA[0]);
    const ga = rA[1].createLinearGradient(0, 0, 0, 200);
    ga.addColorStop(0, 'rgba(176,140,255,0)'); ga.addColorStop(0.35, 'rgba(160,150,255,0.22)'); ga.addColorStop(0.72, 'rgba(120,240,200,0.7)'); ga.addColorStop(0.88, 'rgba(170,255,225,0.95)'); ga.addColorStop(1, 'rgba(120,240,200,0)');
    rA[1].fillStyle = ga; rA[1].fillRect(0, 0, 8, 200);
    const aur = rA[0];
    const aurStrip = (seed) => { // a smooth wavy curtain, built from 2px columns once; two of these drift across each other
      const r0 = A.makeCanvas(1600, 280, 1); CV.push(r0[0]);
      const x = r0[1], r = U.rng(seed), wy = wave(r, 1600, [[1, 1], [2, 0.6], [3, 0.35]]), wh = wave(r, 1600, [[2, 1], [5, 0.5]]), wa = wave(r, 1600, [[3, 1], [7, 0.6], [19, 0.4], [43, 0.3]]);
      for (let px = 0; px < 1600; px += 2) {
        const yb = 226 + wy(px) * 20, h2 = 124 + wh(px) * 32;
        x.globalAlpha = sat(0.55 + wa(px) * 0.2);
        x.drawImage(aur, 2, 0, 4, 200, px, yb - h2, 2, h2 + 12);
      }
      return r0[0];
    };
    const au1 = aurStrip('sno_a1'), au2 = aurStrip('sno_a2');
    const cl = streakStrip({ W: 1600, h: 200, seed: 'sno_c', n: 7, w: [90, 220], t: [5, 11], a: [0.3, 0.6], col: '#f4faff' });
    const c1 = mix(P.far, hz, 0.45);
    const p1 = peakStrip({ W: 1600, h: 300, q: 0, seed: 'sno1', n: 7, base: 226, hgt: [90, 200], col: c1, col2: mix(c1, hz, 0.6), lit: mix(c1, '#ffffff', 0.4), snow: mix(c1, '#ffffff', 0.75) });
    const c2 = mix(P.far, P.mid, 0.3);
    const p2 = peakStrip({ W: 1920, h: 330, q: 1, seed: 'sno2', n: 6, base: 256, hgt: [110, 236], col: c2, col2: mix(c2, hz, 0.5), lit: mix(c2, '#ffffff', 0.45), snow: '#f4f9ff' });
    const c3 = mix(P.mid, P.top, 0.5), pn3 = mix(P.mid, '#3a5a80', 0.55);
    const [s3] = hillStrip({ W: 1920, h: 330, q: 1, seed: 'sno3', base: 170, amp: 20, col: c3, col2: mix(P.mid, hz, 0.35),
      under: (x, f, r) => {
        for (let i = 0; i < 7; i++) { // frost spires (서리송곳)
          const sx = (i + 0.1 + r() * 0.8) * (1920 / 7), n = 2 + ((r() * 3) | 0);
          for (let j = 0; j < n; j++) { const px = sx + (j - (n - 1) / 2) * (16 + r() * 10), len = (j === ((n / 2) | 0) ? 96 : 50) + r() * 44; shard(x, px, f(px) + 8, (j - (n - 1) / 2) * 0.16 + (r() - 0.5) * 0.12, len, 7 + len * 0.06, mix(P.accent, P.mid, 0.3), mix(P.accent, '#ffffff', 0.7)); }
        }
        for (let i = 0; i < 9; i++) { const cx = r() * 1920, n = 2 + ((r() * 4) | 0); for (let j = 0; j < n; j++) { const tx = cx + (j - n / 2) * 20 + r() * 8; pine(x, tx, f(tx) + 4, 0.9 + r() * 0.6, pn3, '#eef6ff'); } }
      },
      deco: (x, f, r) => { x.fillStyle = mix(c3, '#ffffff', 0.45); for (let i = 0; i < 12; i++) { const px = r() * 1920; ell(x, px, f(px) + 30 + r() * 40, 60 + r() * 90, 6 + r() * 6); } } });
    const c4 = mix(P.top, P.mid, 0.18);
    const [s4] = hillStrip({ W: 2048, h: 234, q: 2, seed: 'sno4', base: 84, amp: 12, oct: OCT_LOW, col: c4, col2: mix(c4, P.mid, 0.3),
      under: (x, f, r) => {
        for (let i = 0; i < 12; i++) { const sx = r() * 2048; crystals(x, sx, f(sx) + 5, 0.55 + r() * 0.4, mix(P.accent, c4, 0.35), mix(P.accent, '#ffffff', 0.6), r); }
        for (let i = 0; i < 9; i++) { const tx = r() * 2048; pine(x, tx, f(tx) + 5, 0.75 + r() * 0.5, mix(pn3, c4, 0.25), '#f6fbff'); }
      } });
    return { sky, layers: [
      strip(au1, { fx: 0.01, fy: 0.03, y0: -10, tspd: 10, alpha: 0.46, comp: 'lighter', af: (t) => 0.75 + 0.25 * Math.sin(t * 0.5) }),
      strip(au2, { fx: 0.016, fy: 0.03, y0: 36, tspd: -7, alpha: 0.32, comp: 'lighter', af: (t) => 0.7 + 0.3 * Math.sin(t * 0.37 + 2) }),
      strip(cl, { fx: 0.03, fy: 0.02, y0: 190, tspd: 4 }),
      strip(p1, { fx: 0.06, fy: 0.04, y0: 244, fill: mix(c1, hz, 0.6) }),
      strip(p2, { fx: 0.14, fy: 0.08, y0: 244, fill: mix(c2, hz, 0.5) }),
      strip(s3, { fx: 0.28, fy: 0.14, y0: 324, fill: mix(P.mid, hz, 0.35) }),
      strip(s4, { fx: 0.46, fy: 0.22, y0: 472, fill: mix(c4, P.mid, 0.3) }),
    ] };
  };
  A.ambient.snow = function (ctx, view, t) {
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.beginPath();
    for (let i = 0; i < 46; i++) { ppos(i, 130, t, view, -26, 58, 0.8, 12, 4); ctx.moveTo(PX + 1.6, PY); ctx.arc(PX, PY, 1.6, 0, TAU); }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath();
    for (let i = 0; i < 24; i++) { const d = ppos(i, 140, t, view, -44, 96, 1.15, 18, 5), s = 2.2 + d; ctx.moveTo(PX + s, PY); ctx.arc(PX, PY, s, 0, TAU); }
    ctx.fill();
  };

  // ================================================================== 9. CITADEL — ashen fortress
  function skyline(x, Wl, hh, r, o, wins) {
    let px = 0; x.fillStyle = o.col;
    while (px < Wl) {
      const kind = r(), w = 2 * Math.round((kind < o.towers ? o.tw[0] + r() * (o.tw[1] - o.tw[0]) : 60 + r() * 120) / 2); // even widths → pieces abut on whole pixels
      if (kind < o.towers) {
        const ty = o.base - (o.th[0] + r() * (o.th[1] - o.th[0])), top = r();
        x.fillRect(px, ty, w + 0.5, hh - ty + 4);
        if (top < 0.38) { x.beginPath(); x.moveTo(px - 4, ty + 1); x.lineTo(px + w / 2, ty - w * (0.9 + r() * 0.8)); x.lineTo(px + w + 4, ty + 1); x.closePath(); x.fill(); }
        else if (top < 0.72) { x.fillRect(px - 3, ty - 4, w + 6, 6); const n = Math.max(2, Math.round(w / 12)); for (let m = 0; m < n; m++) x.fillRect(px - 3 + (m * (w + 6)) / n, ty - 11, (w + 6) / n * 0.55, 8); }
        else { x.beginPath(); x.moveTo(px, ty + 1); x.lineTo(px + w * 0.22, ty - 14 - r() * 22); x.lineTo(px + w * 0.5, ty - 4); x.lineTo(px + w * 0.78, ty - 8 - r() * 26); x.lineTo(px + w, ty + 1); x.closePath(); x.fill(); }
        if (wins) for (let k = 0; k < 3; k++) if (r() < 0.5) wins.push(px + w * (0.3 + r() * 0.4), ty + 16 + k * (18 + r() * 14), r());
      } else {
        const wy = o.base + (r() - 0.5) * 16;
        x.fillRect(px, wy, w + 0.5, hh - wy + 4);
        const broken = r() < 0.3;
        for (let m = px; m < px + w - 6; m += 15) if (!broken || r() < 0.5) x.fillRect(m, wy - 7, 8.5, 8);
        if (r() < o.banner) { const bx = px + w * 0.5; x.fillRect(bx - 1, wy - 40, 2, 42); x.beginPath(); x.moveTo(bx + 1, wy - 40); x.lineTo(bx + 15, wy - 37); x.lineTo(bx + 12, wy - 30); x.lineTo(bx + 16, wy - 22); x.lineTo(bx + 9, wy - 25); x.lineTo(bx + 1, wy - 19); x.closePath(); x.fill(); }
      }
      px += w;
    }
  }
  // the sovereign's keep: main block, flanking towers and a tall spire
  function keep(x, cx, by, s, col, wins, r) {
    x.fillStyle = col;
    x.fillRect(cx - 72 * s, by - 96 * s, 144 * s, 112 * s);
    for (let m = -72; m < 66; m += 16) x.fillRect(cx + m * s, by - 104 * s, 9 * s, 9 * s);
    const tower = (tx, w, h, roof) => {
      x.fillRect(tx - w / 2, by - h, w, h + 12 * s); x.fillRect(tx - w / 2 - 3 * s, by - h - 3 * s, w + 6 * s, 6 * s);
      x.beginPath(); x.moveTo(tx - w / 2 - 4 * s, by - h - 2 * s); x.lineTo(tx, by - h - roof); x.lineTo(tx + w / 2 + 4 * s, by - h - 2 * s); x.closePath(); x.fill();
    };
    tower(cx - 84 * s, 30 * s, 128 * s, 44 * s); tower(cx + 84 * s, 30 * s, 146 * s, 48 * s);
    tower(cx - 28 * s, 26 * s, 166 * s, 40 * s); tower(cx + 24 * s, 34 * s, 212 * s, 62 * s);
    if (wins) for (let i = 0; i < 12; i++) wins.push(cx + (r() - 0.5) * 190 * s, by - (16 + r() * 190) * s, r());
  }
  BUILD.citadel = function () {
    const P = A.PAL.citadel, hz = P.sky[1];
    const sky = mkSky([[0, mix(P.sky[0], '#120c22', 0.35)], [0.55, mix(P.sky[0], hz, 0.5)], [1, hz]]);
    const ecl = orb(44, null, '#ff9a6a', 220, 0.62, (x, cx, cy, r) => {
      x.strokeStyle = '#ffd0a0'; x.lineWidth = 3.4; x.beginPath(); x.arc(cx, cy, r + 1, 0, TAU); x.stroke();
      x.fillStyle = mix(P.sky[0], '#0c0818', 0.5); circ(x, cx, cy, r);
      x.strokeStyle = 'rgba(255,238,210,0.9)'; x.lineWidth = 1.6; x.beginPath(); x.arc(cx, cy, r + 0.8, -0.9, 0.5); x.stroke();
    });
    const g1 = cloudStrip({ W: 1600, h: 280, seed: 'cit_g1', n: 8, y: [70, 220], s: [0.8, 1.5], col: mix(P.sky[0], '#4a2f5c', 0.55), shade: mix(P.sky[0], '#1a1230', 0.5) });
    const g2 = cloudStrip({ W: 2048, h: 300, seed: 'cit_g2', n: 7, y: [90, 240], s: [1.1, 1.9], col: mix(P.sky[0], '#5a3660', 0.5), shade: mix(P.sky[0], '#20152e', 0.4) });
    // silhouettes get darker toward the viewer (they stand against the brighter horizon glow)
    const c1 = mix(P.mid, hz, 0.52);
    const r1 = mk(1600, 350, 0), x1 = r1[1];
    tile3(x1, 1600, () => { const r = U.rng('cit1'); skyline(x1, 1600, 350, r, { base: 210, col: c1, towers: 0.36, tw: [18, 36], th: [40, 120], banner: 0 }); keep(x1, 420, 214, 0.62, c1); });
    x1.globalCompositeOperation = 'source-atop'; x1.fillStyle = vgrad(x1, 190, 350, rgba(mix(c1, hz, 0.55), 0), mix(c1, hz, 0.55)); x1.fillRect(0, 190, 1600, 160); x1.globalCompositeOperation = 'source-over';
    r1[0]._solid = 224;
    const c2 = mix(P.mid, P.far, 0.6);
    const r2 = mk(1920, 440, 1), x2 = r2[1], w2 = [];
    tile3(x2, 1920, (k) => {
      const r = U.rng('cit2'), ws = k === 0 ? w2 : [];
      skyline(x2, 1920, 440, r, { base: 300, col: c2, towers: 0.34, tw: [28, 54], th: [70, 172], banner: 0.3 }, ws);
      keep(x2, 1260, 306, 1, c2, ws, r);
      x2.fillStyle = c2; x2.fillRect(500, 244, 380, 200); for (let m = 500; m < 874; m += 15) x2.fillRect(m, 236, 8.5, 9);   // viaduct
    });
    x2.globalCompositeOperation = 'destination-out'; x2.fillStyle = '#000'; // see-through arches
    for (let i = 0; i < 5; i++) { const ax = 542 + i * 74; x2.beginPath(); x2.moveTo(ax - 25, 444); x2.lineTo(ax - 25, 306); x2.quadraticCurveTo(ax - 25, 274, ax, 274); x2.quadraticCurveTo(ax + 25, 274, ax + 25, 306); x2.lineTo(ax + 25, 444); x2.closePath(); x2.fill(); }
    x2.globalCompositeOperation = 'source-atop';
    tile3(x2, 1920, () => { for (let i = 0; i < w2.length; i += 3) { x2.fillStyle = rgba(w2[i + 2] < 0.55 ? '#ffac6c' : '#c79bff', 0.8); x2.fillRect(w2[i] - 1.5, w2[i + 1], 3, 6); } });
    x2.fillStyle = vgrad(x2, 280, 440, rgba(mix(c2, hz, 0.4), 0), mix(c2, hz, 0.4)); x2.fillRect(0, 280, 1920, 160); x2.globalCompositeOperation = 'source-over';
    const c3 = mix(P.far, '#140f20', 0.3), hi3 = mix(c3, hz, 0.4), torches = [];
    const r3 = mk(2048, 410, 1), x3 = r3[1];
    tile3(x3, 2048, (k) => {
      const r = U.rng('cit3'), w3 = [];
      skyline(x3, 2048, 410, r, { base: 290, col: c3, towers: 0.3, tw: [40, 74], th: [60, 150], banner: 0.35 }, w3);
      x3.fillStyle = c3; x3.strokeStyle = c3; x3.lineCap = 'round';
      for (let i = 0; i < 5; i++) { // dead trees
        const tx = r() * 2048, by = 298, hh = 60 + r() * 50;
        x3.lineWidth = 5; x3.beginPath(); x3.moveTo(tx, by); x3.quadraticCurveTo(tx + 6, by - hh * 0.5, tx - 4, by - hh); x3.stroke();
        x3.lineWidth = 2.6; for (let j = 0; j < 4; j++) { const yy = by - hh * (0.45 + j * 0.15), d = j % 2 ? -1 : 1; x3.beginPath(); x3.moveTo(tx + 2, yy); x3.quadraticCurveTo(tx + d * 14, yy - 8, tx + d * (20 + r() * 14), yy - 22 - r() * 10); x3.stroke(); }
      }
      for (let i = 0; i < w3.length; i += 3) { // lit arrow slits; some flicker like torches
        const tor = w3[i + 2] < 0.45;
        x3.fillStyle = rgba(tor ? '#ffa45c' : '#b98aff', 0.9); x3.fillRect(w3[i] - 2, w3[i + 1], 4, 9);
        if (k === 0 && tor) torches.push({ x: mod(w3[i], 2048), y: w3[i + 1] + 4, r: 40, ph: i * 1.3 });
      }
    });
    x3.globalCompositeOperation = 'source-atop'; x3.fillStyle = vgrad(x3, 284, 410, rgba(mix(c3, hz, 0.22), 0), mix(c3, hz, 0.22)); x3.fillRect(0, 284, 2048, 126);
    x3.fillStyle = rgba(hi3, 0.5); { const r = U.rng('cit3h'); for (let i = 0; i < 40; i++) x3.fillRect(r() * 2048, 130 + r() * 150, 2, 12 + r() * 40); }
    x3.globalCompositeOperation = 'source-over';
    r3[0]._solid = 304;
    const c4 = mix(P.far, '#140f20', 0.5);
    const [s4] = hillStrip({ W: 2048, h: 180, q: 2, seed: 'cit4', base: 44, amp: 8, oct: OCT_LOW, col: c4, col2: mix(c4, '#1c1528', 0.4),
      under: (x, f, r) => {
        x.fillStyle = c4;
        for (let i = 0; i < 26; i++) { const bx = r() * 2048, by = f(bx) + 5, w = 14 + r() * 30, hh = 8 + r() * 18; x.save(); x.translate(bx, by); x.rotate((r() - 0.5) * 0.5); x.fillRect(-w / 2, -hh, w, hh + 6); x.restore(); }
        for (let i = 0; i < 10; i++) { const bx = r() * 2048, by = f(bx) + 5, hh = 26 + r() * 30; x.beginPath(); x.moveTo(bx - 5, by); x.lineTo(bx - 1, by - hh); x.lineTo(bx + 5, by); x.closePath(); x.fill(); }
      } });
    return { sky, layers: [
      starsLayer(30, 151, 300, '#e8d8ff'),
      orbLayer(ecl, 420, 206, 0.012, 0.03),
      { fn(ctx, view, t, vy) { A.glow(ctx, 420 - view.x * 0.012, 206 + vy * 0.03, 110 + Math.sin(t * 0.8) * 10, '#ff8a5a', 0.2 + 0.07 * Math.sin(t * 1.1)); } },
      strip(g1, { fx: 0.02, fy: 0.02, y0: 30, tspd: 7, alpha: 0.72 }),
      strip(g2, { fx: 0.04, fy: 0.03, y0: 90, tspd: -5, alpha: 0.6 }),
      strip(r1[0], { fx: 0.06, fy: 0.04, y0: 222, fill: mix(c1, hz, 0.55) }),
      strip(r2[0], { fx: 0.15, fy: 0.08, y0: 170, fill: mix(c2, hz, 0.4) }),
      strip(r3[0], { fx: 0.3, fy: 0.14, y0: 232, fill: mix(c3, hz, 0.22), items: torches, item: (ctx, it, sx, sy, t) => A.glow(ctx, sx, sy, 15 + Math.sin(t * 9 + it.ph) * 2.5, '#ff9a4a', 0.5 + 0.2 * Math.sin(t * 13 + it.ph * 2)) }),
      strip(s4, { fx: 0.46, fy: 0.22, y0: 514, fill: mix(c4, '#1c1528', 0.4) }),
    ] };
  };
  A.ambient.citadel = function (ctx, view, t) {
    ctx.fillStyle = 'rgba(190,180,200,0.45)'; ctx.beginPath();
    for (let i = 0; i < 20; i++) { const d = ppos(i, 160, t, view, -22, 16, 0.9, 20, 10), s = 1 + d; ctx.moveTo(PX + s, PY); ctx.arc(PX, PY, s, 0, TAU); }
    ctx.fill();
    embers(ctx, view, t, 26, 170, A.PAL.citadel.accent);
  };
  function embers(ctx, view, t, n, k, col) {
    for (let i = 0; i < n; i++) {
      const d = 0.55 + hsh(i, k + 3) * 0.9, life = mod(t * (0.1 + hsh(i, k + 4) * 0.08) + hsh(i, k + 5), 1);
      const x = mod(hsh(i, k + 1) * MW + Math.sin(t * 0.9 + i * 1.9) * 16 + life * 60 - view.x * 0.9 * d, MW) - 60;
      const y = mod(H + 60 - life * (H + 140) - view.y * 0.5 * d + hsh(i, k + 2) * 200, MH) - 60;
      const a = Math.sin(life * PI);
      A.glow(ctx, x, y, 5 + d * 5, col, a * 0.55);
      ctx.globalAlpha = a; ctx.fillStyle = '#ffe2b0'; ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // ================================================================== 10. THRONE — the sovereign's hall
  function pillar(x, cx, hh, w, col, hi, lo, capY) {
    x.fillStyle = col; x.fillRect(cx - w / 2, 0, w, hh);
    x.fillStyle = hi; x.fillRect(cx - w / 2, 0, w * 0.15, hh);
    x.fillStyle = lo; x.fillRect(cx + w * 0.28, 0, w * 0.22, hh);
    for (let i = 1; i < 4; i++) x.fillRect(cx - w / 2 + w * (0.15 + i * 0.13) - 0.75, 0, 1.5, hh);
    x.fillStyle = col; x.fillRect(cx - w * 0.74, 0, w * 1.48, capY + 26); x.fillRect(cx - w * 0.62, capY + 26, w * 1.24, 13);
    x.fillRect(cx - w * 0.74, hh - 150, w * 1.48, 150); x.fillRect(cx - w * 0.62, hh - 164, w * 1.24, 14);
    x.fillStyle = hi; x.fillRect(cx - w * 0.74, capY + 22, w * 1.48, 4); x.fillRect(cx - w * 0.74, hh - 150, w * 1.48, 4); x.fillRect(cx - w * 0.74, 0, w * 0.12, capY + 22);
    x.fillStyle = lo; x.fillRect(cx - w * 0.62, capY + 36, w * 1.24, 3);
  }
  function glassWindow(x, cx, ty, w, hh, r, P, wallCol) {
    const path = (ins) => { x.beginPath(); x.moveTo(cx - w / 2 + ins, ty + hh); x.lineTo(cx - w / 2 + ins, ty + w * 0.62); x.quadraticCurveTo(cx - w / 2 + ins, ty + ins + w * 0.12, cx, ty + ins * 1.5); x.quadraticCurveTo(cx + w / 2 - ins, ty + ins + w * 0.12, cx + w / 2 - ins, ty + w * 0.62); x.lineTo(cx + w / 2 - ins, ty + hh); x.closePath(); };
    const g = x.createRadialGradient(cx, ty + hh * 0.45, 10, cx, ty + hh * 0.45, hh * 0.85); g.addColorStop(0, rgba(P.glow, 0.2)); g.addColorStop(1, rgba(P.glow, 0)); x.fillStyle = g; x.fillRect(cx - hh, ty - hh * 0.4, hh * 2, hh * 1.8);
    x.fillStyle = mix(wallCol, '#0a0714', 0.5); path(0); x.fill();
    x.save(); path(7); x.clip();
    const cols = ['#4a3a86', '#34488e', '#6a3470', '#2f6284', '#7a4a96', '#3a2f72'];
    for (let gy = 0; gy * 30 < hh; gy++) for (let gx = -2; gx < 2; gx++) { x.fillStyle = mix(cols[(r() * cols.length) | 0], '#140f20', 0.2 + r() * 0.25); x.fillRect(cx + gx * (w / 4) + 1, ty + gy * 30 + 1, w / 4 - 2, 28); }
    // faded emblem: a lantern
    x.fillStyle = rgba(P.accent, 0.3); x.beginPath(); x.roundRect(cx - w * 0.14, ty + hh * 0.34, w * 0.28, w * 0.36, 6); x.fill(); x.fillRect(cx - w * 0.18, ty + hh * 0.34 - 7, w * 0.36, 7);
    x.fillStyle = rgba('#fff0c0', 0.3); ell(x, cx, ty + hh * 0.34 + w * 0.2, w * 0.06, w * 0.1);
    // missing shards + cracks
    x.fillStyle = mix(wallCol, '#06040c', 0.6);
    for (let i = 0; i < 3; i++) { const sx = cx + (r() - 0.5) * w * 0.7, sy = ty + hh * (0.2 + r() * 0.7), s = 9 + r() * 14; x.beginPath(); x.moveTo(sx, sy - s); x.lineTo(sx + s * 0.8, sy - s * 0.1); x.lineTo(sx + s * 0.2, sy + s); x.lineTo(sx - s * 0.7, sy + s * 0.3); x.closePath(); x.fill(); }
    x.strokeStyle = rgba('#0a0714', 0.85); x.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { let px = cx + (r() - 0.5) * w * 0.6, py = ty + hh * (0.15 + r() * 0.6); x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 26; py += 10 + r() * 20; x.lineTo(px, py); } x.stroke(); }
    x.restore();
    x.strokeStyle = mix(wallCol, '#0a0714', 0.55); x.lineWidth = 3; x.beginPath(); x.moveTo(cx, ty + 12); x.lineTo(cx, ty + hh); x.stroke();
  }
  BUILD.throne = function () {
    const P = A.PAL.throne, wallT = P.sky[0], wallB = P.sky[1];
    // opaque far wall (gradient + masonry + windows + far floor/carpet)
    const WW = 1680, WH = 760, rW = mk(WW, WH, 1), x = rW[1], wins = [];
    x.fillStyle = vgrad(x, 0, WH, wallT, wallB); x.fillRect(0, 0, WW, WH);
    tile3(x, WW, (k) => {
      const r = U.rng('thr_w');
      x.strokeStyle = rgba('#3a2c54', 0.3); x.lineWidth = 1.5;
      for (let row = 0; row < 14; row++) { // masonry: 84px blocks (20 per tile → seamless), every other course shifted
        const yy = 22 + row * 44;
        x.beginPath(); x.moveTo(-4, yy); x.lineTo(WW + 4, yy); x.stroke();
        for (let xx = row % 2 ? 42 : 0; xx < WW; xx += 84) { x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx, yy + 44); x.stroke(); }
      }
      for (let i = 0; i < 22; i++) { const row = Math.floor(r() * 13); x.fillStyle = rgba(i % 2 ? '#3a2c54' : '#0a0714', 0.14 + r() * 0.14); x.fillRect(Math.floor(r() * 20) * 84 + (row % 2 ? 42 : 0), row * 44 + 22, 84, 44); }
      for (let i = 0; i < 4; i++) { const cx = 210 + i * 420; glassWindow(x, cx, 96, 150, 400, r, P, wallB); if (k === 0) wins.push({ x: cx, y: 290, r: 220, ph: i * 1.7 }); }
      // far floor: tiles + the carpet line
      x.fillStyle = mix(wallB, '#0c0816', 0.55); x.fillRect(-4, 592, WW + 8, WH - 592);
      x.fillStyle = mix(wallB, P.top, 0.22); x.fillRect(-4, 592, WW + 8, 3);
      x.fillStyle = mix(P.edge, '#140f20', 0.45); x.fillRect(-4, 606, WW + 8, 20);
      x.fillStyle = rgba(P.accent, 0.4); x.fillRect(-4, 606, WW + 8, 2); x.fillRect(-4, 624, WW + 8, 2);
    });
    const cF = mix(P.mid, wallT, 0.38), hiF = mix(cF, P.glow, 0.16), loF = mix(cF, '#0a0714', 0.4);
    // pillar rows are sparse and periodic → small strips (3 periods / 1 period) drawn as column bands
    const rF = mk(840, 770, 0), xf = rF[1];
    {
      const r = U.rng('thr_f');
      for (let i = 0; i < 3; i++) pillar(xf, 70 + i * 280, 770, 44, cF, hiF, loF, 44);
      // hanging chains with extinguished lantern frames
      for (let i = 0; i < 3; i++) {
        const cx = 210 + i * 280, len = 150 + r() * 130;
        xf.strokeStyle = loF; xf.lineWidth = 2.4; xf.setLineDash([4, 4]); xf.beginPath(); xf.moveTo(cx, 0); xf.lineTo(cx, len); xf.stroke(); xf.setLineDash([]);
        xf.fillStyle = loF; xf.beginPath(); xf.moveTo(cx - 12, len + 6); xf.lineTo(cx, len - 6); xf.lineTo(cx + 12, len + 6); xf.closePath(); xf.fill();
        xf.strokeStyle = loF; xf.lineWidth = 2.6; xf.beginPath(); xf.roundRect(cx - 9, len + 6, 18, 26, 4); xf.stroke(); xf.beginPath(); xf.moveTo(cx, len + 6); xf.lineTo(cx, len + 32); xf.stroke();
        xf.fillStyle = hiF; xf.fillRect(cx - 11, len + 31, 22, 3);
      }
    }
    const cN = P.mid, hiN = mix(cN, '#8a70c0', 0.26), loN = mix(cN, '#140f20', 0.42);
    const rN = mk(510, 800, 1), xn = rN[1];
    pillar(xn, 255, 800, 98, cN, hiN, loN, 84);
    return { sky: null, layers: [
      strip(rW[0], { fx: 0.08, fy: 0.05, y0: -30, vmax: 600, items: wins, item: (ctx, it, sx, sy, t) => A.glow(ctx, sx, sy, 136 + Math.sin(t * 0.7 + it.ph) * 10, P.glow, 0.13 + 0.06 * Math.sin(t * 0.5 + it.ph)) }),
      strip(rF[0], { fx: 0.2, fy: 0.1, y0: -40, vmax: 400, bands: [0, 1, 2].map((i) => [36 + i * 280, 68]).concat([0, 1, 2].map((i) => [196 + i * 280, 28])) }),
      strip(rN[0], { fx: 0.42, fy: 0.15, y0: -70, vmax: 460, bands: [[180, 150]] }),
    ] };
  };
  A.ambient.throne = function (ctx, view, t) {
    motes(ctx, view, t, { n: 22, k: 181, col: A.PAL.throne.glow, r: [4, 9], a: [0.1, 0.42], vx: 3, vy: -5, par: 0.8, sw: 22 });
    embers(ctx, view, t, 6, 190, '#ff8a4a');
  };

  // ------------------------------------------------------------------ stateless ambient particles
  const BUF = new Float32Array(256);
  let PX = 0, PY = 0;
  // looping particle i of family k → sets PX/PY (screen), returns its depth factor (0.55..1.45)
  function ppos(i, k, t, view, vx, vy, par, swx, swy) {
    const d = 0.55 + hsh(i, k + 3) * 0.9;
    PX = mod(hsh(i, k + 1) * MW + t * vx * d + Math.sin(t * (0.5 + hsh(i, k + 4)) + i * 1.3) * swx - view.x * par * d, MW) - 60;
    PY = mod(hsh(i, k + 2) * MH + t * vy * d + Math.cos(t * (0.4 + hsh(i, k + 5) * 0.8) + i * 2.1) * swy - view.y * par * d, MH) - 60;
    return d;
  }
  function motes(ctx, view, t, o) {
    for (let i = 0; i < o.n; i++) {
      const d = ppos(i, o.k, t, view, o.vx, o.vy, o.par, o.sw, o.sw * 0.6);
      const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + hsh(i, o.k + 6) * 1.8) + i * 2.3);
      A.glow(ctx, PX, PY, lerp(o.r[0], o.r[1], (d - 0.55) / 0.9), o.col, lerp(o.a[0], o.a[1], tw));
    }
  }

  ['town', 'meadow', 'forest', 'marsh', 'cave', 'oasis', 'canyon', 'snow', 'citadel', 'throne'].forEach(install);
})();
