'use strict';
/* 등불지기 — fx: particles, timed effects, hit impacts / kill pops, damage numbers, combo counter, screen flash, scheduler */
(function () {
  const G = window.G, U = G.U, A = G.Art;
  const Fx = (G.Fx = {});
  const parts = [], effs = [], nums = [], timers = [];
  let flash = null;
  const TAU = Math.PI * 2, MAXP = 700;

  Fx.clear = () => { parts.length = 0; effs.length = 0; nums.length = 0; timers.length = 0; flash = null; };
  // game-time scheduler (cleared on map change)
  // (a callback keeps the guardian attack it was scheduled in — G.src, combat.js — so a late orb or boulder still counts as that attack)
  G.after = (delay, fn) => { timers.push({ t: delay, fn, src: G.src || null }); };

  // ------------------------------------------------------------ particles
  // o: x,y,vx,vy,g,drag,life,size,size2,color,type('dot'|'spark'|'star'|'smoke'|'shard'|'leaf'),add,rot,vr
  Fx.p = (o) => {
    if (parts.length >= MAXP) parts.shift();
    o.max = o.life = o.life || 0.5; o.g = o.g || 0; o.drag = o.drag || 0; o.size = o.size || 4;
    if (o.size2 === undefined) o.size2 = 0;
    o.rot = o.rot || 0; o.vr = o.vr || 0; o.vx = o.vx || 0; o.vy = o.vy || 0;
    parts.push(o);
  };
  Fx.burst = (x, y, n, color, o) => {
    o = o || {};
    const s0 = o.s0 === undefined ? 60 : o.s0, s1 = o.s1 || 260;
    for (let i = 0; i < n; i++) {
      const a = o.a0 !== undefined ? U.rand(o.a0, o.a1) : Math.random() * TAU, s = U.rand(s0, s1);
      Fx.p({ x: x + U.rand(-1, 1) * (o.spread || 4), y: y + U.rand(-1, 1) * (o.spread || 4), vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up || 0), g: o.g === undefined ? 500 : o.g, drag: o.drag === undefined ? 2 : o.drag,
        life: U.rand(o.l0 || 0.3, o.l1 || 0.7), size: U.rand(o.z0 || 3, o.z1 || 7), color: Array.isArray(color) ? U.pick(color) : color, type: o.type || 'dot', add: o.add, ol: o.ol, rot: Math.random() * TAU, vr: U.rand(-8, 8) });
    }
  };
  Fx.dust = (x, y, n, color) => {
    for (let i = 0; i < n; i++) Fx.p({ x: x + U.rand(-10, 10), y: y - U.rand(0, 6), vx: U.rand(-70, 70), vy: U.rand(-60, -10), drag: 3, life: U.rand(0.3, 0.6), size: U.rand(5, 10), size2: 14, color: color || '#e8dcc8', type: 'smoke' });
  };
  // ------------------------------------------------------------ hit impact (monster struck)
  // An outlined "comic" burst: it reads on the bright meadow sky as well as in dark caves (additive glows alone wash out on bright maps).
  // It appears at full size on the hit frame — so the hit-stop freeze holds it — then collapses; speed lines fan out in the hit direction.
  // o: crit, heavy, kind ('slash'|'fire'|'magic'|'ice'|'bolt'|'arrow'), boss
  const E = U.ease;
  const IMP = { slash: ['#ffffff', '#ffe7a0'], fire: ['#fff6d8', '#ffa04a'], magic: ['#ffffff', '#b4c4ff'], ice: ['#ffffff', '#a8e2ff'], bolt: ['#ffffff', '#fff27a'], arrow: ['#ffffff', '#c8ffe0'] };
  function burstPath(c, R, n, lens, inner) {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 0.5) / n) * TAU, r0 = R * lens[i];
      c.lineTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      c.lineTo(Math.cos(a1) * R * inner, Math.sin(a1) * R * inner);
    }
    c.closePath();
  }
  Fx.impact = (x, y, dir, o) => {
    o = o || {};
    const cols = IMP[o.kind] || IMP.slash, pw = o.crit ? 1.5 : o.heavy ? 1.22 : 1, n = o.crit ? 12 : 9, lens = [];
    for (let i = 0; i < n; i++) lens.push(i % 2 ? U.rand(0.5, 0.72) : U.rand(0.86, 1.14));
    Fx.add({ x, y, dur: o.crit ? 0.2 : 0.15, r: (o.boss ? 26 : 21) * pw, n, lens, rot: U.rand(0, TAU), c0: cols[0], c1: o.crit ? '#ffc93a' : cols[1], light: 70,
      draw(c, p, e) {
        const k = p < 0.3 ? 1 + 0.18 * Math.sin((p / 0.3) * Math.PI) : 1 - E.inQuad((p - 0.3) / 0.7), R = e.r * k;
        if (R < 0.6) return;
        A.glow(c, e.x, e.y, R * 2.2, e.c1, 0.55 * (1 - p));
        c.translate(e.x, e.y); c.rotate(e.rot + p * 0.5);
        burstPath(c, R, e.n, e.lens, 0.36);
        c.lineJoin = 'miter'; c.miterLimit = 6; c.fillStyle = e.c1; c.fill();
        c.lineWidth = 2.6 * Math.min(1, k + 0.3); c.strokeStyle = A.OUT; c.stroke();
        burstPath(c, R * 0.62, e.n, e.lens, 0.4); c.fillStyle = e.c0; c.fill();
      } });
    // speed lines: a fan of tapered strokes flying away from the hit, in the direction of the blow
    const ln = [], m = o.crit ? 7 : 5;
    for (let i = 0; i < m; i++) ln.push([(dir > 0 ? 0 : Math.PI) + U.rand(-0.95, 0.95), U.rand(0.7, 1.25)]);
    Fx.add({ x, y, dur: o.crit ? 0.2 : 0.15, ln, pw, col: o.crit ? '#ffe07a' : cols[1],
      draw(c, p, e) {
        const k = E.outCubic(p), r0 = (12 + 34 * k) * e.pw, w = 3.4 * (1 - p) * e.pw;
        if (w < 0.3) return;
        c.translate(e.x, e.y); c.lineCap = 'round';
        for (const [a, l] of e.ln) {
          const r1 = r0 + 30 * l * (1 - p * 0.7) * e.pw, ca = Math.cos(a), sa = Math.sin(a);
          c.beginPath(); c.moveTo(ca * r0, sa * r0); c.lineTo(ca * r1, sa * r1);
          c.lineWidth = w + 2.6; c.strokeStyle = A.OUT; c.stroke();
          c.lineWidth = w; c.strokeStyle = e.col; c.stroke();
        }
      } });
    const sc = o.kind === 'fire' ? ['#fff1c4', '#ffb060', '#ff7a2e'] : [cols[0], cols[1], '#ffffff'];
    Fx.burst(x, y, o.crit ? 12 : 6, sc, { type: 'spark', s0: 160, s1: o.crit ? 520 : 340, a0: dir > 0 ? -1.1 : Math.PI - 1.1, a1: dir > 0 ? 1.1 : Math.PI + 1.1, g: 380, l0: 0.14, l1: 0.32, z0: 2, z1: 4.5, add: true });
    if (o.crit) Fx.burst(x, y, 5, ['#ffe07a', '#ffffff'], { type: 'star', s0: 90, s1: 260, g: 260, l0: 0.3, l1: 0.55, z0: 4, z1: 7, ol: 1.4 });
  };
  // ------------------------------------------------------------ kill "pop"
  // white flash disc → outlined shock ring → cartoon smoke cloud in the monster's colour → flying outlined chunks and stars.
  // o: dir, crit, leaf (sprout colour flying off, e.g. 솜뭉치)
  Fx.poof = (x, y, R, col, o) => {
    o = o || {};
    const tint = A.mix(col, '#ffffff', 0.45), pw = o.crit ? 1.25 : 1;
    R *= pw;
    Fx.add({ x, y, R, dur: 0.34, light: R * 2.4,
      draw(c, p, e) {
        if (p < 0.32) { const k = p / 0.32; c.globalAlpha = 1 - k; A.ell(c, e.x, e.y, e.R * (0.85 + 0.55 * k)); c.fillStyle = '#ffffff'; c.fill(); c.globalAlpha = 1; }
        const rr = e.R * (0.55 + 1.35 * E.outCubic(p)), lw = 7.5 * (1 - p);
        if (lw > 0.3) { A.ell(c, e.x, e.y, rr, rr * 0.9); c.lineWidth = lw + 3; c.strokeStyle = A.OUT; c.stroke(); c.lineWidth = lw; c.strokeStyle = '#fff3c4'; c.stroke(); }
        A.glow(c, e.x, e.y, e.R * 2.2 * (1 - p * 0.4), '#fff3c4', 0.85 * (1 - p));
      } });
    // cloud puffs spread sideways and up (the ground is right below, so they barely go down)
    const puffs = [], n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + U.rand(-0.3, 0.3), d = R * U.rand(0.5, 1.05), s = Math.sin(a);
      puffs.push({ dx: Math.cos(a) * d, dy: s * d * (s > 0 ? 0.3 : 0.85), r: R * U.rand(0.3, 0.46), up: U.rand(8, 26) });
    }
    puffs.push({ dx: 0, dy: -R * 0.1, r: R * 0.52, up: 12 });
    Fx.add({ x, y, dur: 0.52, puffs, col: tint,
      draw(c, p, e) {
        const k = E.outBack(Math.min(1, p / 0.22)) * (1 - E.inQuad(U.sat((p - 0.3) / 0.7)));
        if (k <= 0.02) return;
        const pos = E.outCubic(Math.min(1, p / 0.55));
        // outline pass, then fill pass → one merged sticker-style cloud (like the monster art's blobs)
        c.lineWidth = A.LW * 2; c.strokeStyle = A.OUT;
        for (const q of e.puffs) { A.ell(c, e.x + q.dx * pos, e.y + q.dy * pos - q.up * p, q.r * k); c.stroke(); }
        c.fillStyle = e.col;
        for (const q of e.puffs) { A.ell(c, e.x + q.dx * pos, e.y + q.dy * pos - q.up * p, q.r * k); c.fill(); }
        c.fillStyle = 'rgba(255,255,255,0.8)';
        for (const q of e.puffs) { const r = q.r * k; A.ell(c, e.x + q.dx * pos - r * 0.32, e.y + q.dy * pos - q.up * p - r * 0.34, r * 0.3, r * 0.22); c.fill(); }
      } });
    for (let i = 0; i < (o.crit ? 9 : 6); i++) {
      const a = U.rand(-Math.PI * 0.92, -Math.PI * 0.08), s = U.rand(170, 400);
      Fx.p({ x: x + U.rand(-6, 6), y: y + U.rand(-6, 6), vx: Math.cos(a) * s + (o.dir || 0) * 70, vy: Math.sin(a) * s, g: 1000, drag: 0.5, life: U.rand(0.45, 0.75), size: U.rand(6, 10), size2: 2, color: U.pick([col, tint]), type: 'chunk', ol: 1.8 });
    }
    if (o.leaf) Fx.p({ x, y: y - R * 0.6, vx: (o.dir || 1) * U.rand(40, 120), vy: -U.rand(380, 480), g: 900, drag: 0.4, life: 0.9, size: 9, size2: 6, color: o.leaf, type: 'leaf', rot: 0, vr: (o.dir || 1) * 14, ol: 1.6 });
    Fx.burst(x, y, o.crit ? 10 : 6, ['#fff3a0', '#ffffff', '#ffd27a'], { type: 'star', s0: 130, s1: 340, g: 160, drag: 2.4, l0: 0.35, l1: 0.65, z0: 4, z1: 8, ol: 1.4 });
  };
  Fx.ring = (x, y, r0, r1, color, dur, lw, o) => Fx.add(Object.assign({ x, y, r0, r1, col: color, dur: dur || 0.4, lw: lw || 6,
    draw(c, p, e) {
      const k = U.ease.outCubic(p);
      c.globalCompositeOperation = e.solid ? 'source-over' : 'lighter'; c.globalAlpha = (1 - p) * (e.a || 1);
      c.beginPath(); c.ellipse(e.x, e.y, U.lerp(e.r0, e.r1, k), U.lerp(e.r0, e.r1, k) * (e.flat || 1), 0, 0, TAU);
      c.lineWidth = e.lw * (1 - p * 0.6); c.strokeStyle = e.col; c.stroke();
    } }, o));
  // crescent slash. o: r, a0, a1 (radians, for facing right), col, dur, w (thickness 0..1)
  Fx.slash = (x, y, dir, o) => Fx.add(Object.assign({ x, y, dir, r: 60, a0: -1.9, a1: 1.1, col: '#ffffff', col2: '#ffd98a', dur: 0.2, w: 0.42, light: 70,
    draw(c, p, e) {
      const k = U.ease.outQuart(U.sat(p * 2.2)), a1 = U.lerp(e.a0, e.a1, k), fade = 1 - U.sat((p - 0.35) / 0.65);
      c.translate(e.x, e.y); c.scale(e.dir, 1);
      c.globalCompositeOperation = 'lighter';
      const R = e.r, ccw = e.a1 < e.a0, tail = ccw ? Math.min(e.a0, a1 + 2.4) : Math.max(e.a0, a1 - 2.4);
      for (let pass = 0; pass < 2; pass++) {
        c.globalAlpha = fade * (pass ? 0.95 : 0.55);
        const w = pass ? e.w * 0.5 : e.w;
        c.beginPath();
        c.arc(0, 0, R, tail, a1, ccw);
        c.quadraticCurveTo(Math.cos((tail + a1) / 2) * R * (1 - w * 1.5), Math.sin((tail + a1) / 2) * R * (1 - w * 1.5), Math.cos(tail) * R, Math.sin(tail) * R);
        c.closePath(); c.fillStyle = pass ? e.col : e.col2; c.fill();
      }
    } }, o));
  Fx.pillar = (x, y, color, h, dur, w) => Fx.add({ x, y, col: color, h: h || 420, dur: dur || 0.7, w: w || 70, light: 260,
    draw(c, p, e) {
      const a = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85, ww = e.w * (1 - p * 0.6);
      c.globalCompositeOperation = 'lighter';
      const g = c.createLinearGradient(0, e.y, 0, e.y - e.h);
      g.addColorStop(0, A.rgba(e.col, 0.85 * a)); g.addColorStop(1, A.rgba(e.col, 0));
      c.fillStyle = g; c.fillRect(e.x - ww / 2, e.y - e.h, ww, e.h);
      c.fillStyle = A.rgba('#ffffff', 0.7 * a); c.fillRect(e.x - ww * 0.18, e.y - e.h * 0.8, ww * 0.36, e.h * 0.8);
      A.glow(c, e.x, e.y - 10, ww * 1.6, e.col, a);
    } });
  // jagged lightning through points [[x,y],...]
  Fx.lightning = (pts, color, dur, lw) => {
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(d / 26));
      segs.push([x0, y0]);
      for (let k = 1; k < n; k++) { const t = k / n, off = (Math.random() - 0.5) * Math.min(34, d * 0.25); segs.push([U.lerp(x0, x1, t) - ((y1 - y0) / d) * off, U.lerp(y0, y1, t) + ((x1 - x0) / d) * off]); }
    }
    segs.push(pts[pts.length - 1]);
    Fx.add({ segs, col: color || '#a8e8ff', dur: dur || 0.22, lw: lw || 5, x: pts[0][0], y: pts[0][1], light: 120,
      draw(c, p, e) {
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - p; c.lineJoin = 'round';
        c.beginPath(); e.segs.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.lineWidth = e.lw * 2.6; c.strokeStyle = A.rgba(e.col, 0.45); c.stroke();
        c.lineWidth = e.lw; c.strokeStyle = e.col; c.stroke();
        c.lineWidth = e.lw * 0.4; c.strokeStyle = '#ffffff'; c.stroke();
      } });
  };
  Fx.text = (x, y, str, color, size) => nums.push({ x, y, str, col: color || '#fff', size: size || 15, born: G.time, dur: 1.1, text: true });
  Fx.flash = (color, a, dur) => { if (!(G.opt && G.opt.noFlash)) flash = { col: color || '#ffffff', a: a || 0.5, t: 0, dur: dur || 0.25 }; };
  // generic effect: { dur, draw(ctx, p, self), upd?(dt, self), light?, x, y, behind? }
  Fx.add = (o) => { o.t = 0; effs.push(o); return o; };
  // hero afterimage (dash / blink)
  Fx.after = (look, an, x, y, dir, color) => Fx.add({ x, y, dir, look, an: Object.assign({}, an), dur: 0.28, col: color,
    draw(c, p, e) {
      c.globalAlpha = 0.42 * (1 - p);
      c.translate(e.x, e.y); c.scale(e.dir, 1);
      A.hero(c, e.look, e.an);
    } });
  // rotating magic circle on the ground (drawn behind characters). o: follow (entity with x,y), x, y, r, dur, col, col2, n (star points), rise
  Fx.sigil = (o) => Fx.add(Object.assign({ x: o.follow ? o.follow.x : 0, y: o.follow ? o.follow.y : 0, r: 70, dur: 0.6, col: '#8fa8ff', col2: '#ffffff', n: 6, light: 110, back: true }, o, {
    upd(dt, e) {
      if (e.follow) { e.x = e.follow.x; e.y = e.follow.y; }
      if (Math.random() < dt * (e.rise ? 46 : 22) * (1 - e.t / e.dur)) {
        const a = Math.random() * TAU, rr = e.r * U.rand(0.3, 1);
        Fx.p({ x: e.x + Math.cos(a) * rr, y: e.y + Math.sin(a) * rr * 0.3 - 2, vy: -U.rand(60, e.rise ? 260 : 150), life: U.rand(0.4, 0.8), size: U.rand(2, 4.5), color: Math.random() < 0.5 ? e.col : e.col2, type: Math.random() < 0.4 ? 'star' : 'dot', add: true });
      }
    },
    draw(c, p, e) {
      const a = Math.min(1, p * 7) * (1 - U.sat((p - 0.7) / 0.3)), s = U.ease.outBack(Math.min(1, p * 3.5)), r = e.r * s, rot = e.t * 2.4;
      c.translate(e.x, e.y - 2); c.scale(1, 0.3); c.globalCompositeOperation = 'lighter';
      c.globalAlpha = a * 0.55; A.glow(c, 0, 0, r * 1.3, e.col, 1);
      c.globalAlpha = a;
      c.lineWidth = 4; c.strokeStyle = e.col; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
      c.lineWidth = 2; c.strokeStyle = e.col2; c.beginPath(); c.arc(0, 0, r * 0.8, 0, TAU); c.stroke();
      c.save(); c.rotate(rot); A.star(c, 0, 0, r * 0.78, r * 0.32, e.n, 0); c.lineWidth = 2.4; c.strokeStyle = e.col2; c.stroke(); c.restore();
      c.save(); c.rotate(-rot * 0.6); c.fillStyle = e.col;
      for (let i = 0; i < 16; i++) { c.rotate(TAU / 16); c.fillRect(r * 0.84, -2, i % 2 ? 6 : 11, 4); }
      c.restore();
      c.globalAlpha = a * 0.8; c.beginPath(); c.arc(0, 0, r * 0.22, 0, TAU); c.fillStyle = e.col2; c.fill();
    } }));
  // rotating light rays behind an entity (level up / job advancement)
  Fx.rays = (follow, col, dur, r) => Fx.add({ x: follow.x, y: follow.y - 40, follow, col, dur: dur || 1.4, r: r || 180, light: 200, back: true,
    upd(dt, e) { e.x = e.follow.x; e.y = e.follow.y - 40; },
    draw(c, p, e) {
      const a = Math.min(1, p * 5) * (1 - U.sat((p - 0.55) / 0.45));
      c.translate(e.x, e.y); c.rotate(e.t * 0.7); c.globalCompositeOperation = 'lighter';
      A.glow(c, 0, 0, e.r * 0.7, e.col, a * 0.6);
      c.fillStyle = A.rgba(e.col, 0.42 * a);
      for (let i = 0; i < 14; i++) {
        c.rotate(TAU / 14);
        const len = e.r * (0.65 + 0.35 * Math.sin(e.t * 4 + i * 1.7)) * U.ease.outCubic(Math.min(1, p * 3));
        c.beginPath(); c.moveTo(-7, -18); c.lineTo(0, -18 - len); c.lineTo(7, -18); c.closePath(); c.fill();
      }
    } });
  // little soul / EXP orbs: burst out of a defeated monster, then home in on the player
  Fx.soul = (x, y, n, col) => {
    for (let i = 0; i < n; i++) {
      const a = U.rand(-Math.PI * 0.95, -Math.PI * 0.05), s = U.rand(140, 300);
      Fx.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, dur: 3, col: col || '#c79bff', light: 30, wait: 0.28 + i * 0.05,
        upd(dt, e) {
          const P = G.P;
          if (e.t < e.wait) { const k = Math.max(0, 1 - 3.5 * dt); e.vx *= k; e.vy *= k; }
          else {
            const dx = P.x - e.x, dy = P.y - 42 - e.y, d = Math.hypot(dx, dy) || 1, sp = Math.min(1100, 240 + (e.t - e.wait) * 1500), k = Math.min(1, dt * 9);
            e.vx += ((dx / d) * sp - e.vx) * k; e.vy += ((dy / d) * sp - e.vy) * k;
            if (d < 22 || P.dead) { e.t = e.dur; if (!P.dead) Fx.p({ x: P.x + U.rand(-8, 8), y: P.y - 42, vy: -40, life: 0.3, size: 7, size2: 1, color: '#ffffff', type: 'star', add: true }); }
          }
          e.x += e.vx * dt; e.y += e.vy * dt;
          if (Math.random() < dt * 30) Fx.p({ x: e.x, y: e.y, vx: U.rand(-10, 10), vy: U.rand(-10, 10), life: 0.25, size: 3, color: e.col, add: true });
        },
        draw(c, p, e) { A.glow(c, e.x, e.y, 15, e.col, 0.95); c.globalCompositeOperation = 'lighter'; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(e.x, e.y, 2.6, 0, TAU); c.fill(); } });
    }
  };

  // ------------------------------------------------------------ damage numbers (digit atlases)
  // Every style is pre-rendered once as two glyph rows — outline (+ halo) and fill. A number draws all its outlines first and
  // then all its fills, so neighbouring digits merge into one clean sticker-style number.
  // Numbers animate on the real clock (G.time), so a number that lands during a hit-stop still pops in while the world is frozen.
  const STY = {
    dmg: { c: ['#ffffff', '#fff6dc', '#ffd98a'], fs: 28 },
    crit: { c: ['#fffbe0', '#ffd23a', '#ff4a1e'], fs: 44, out: '#3a0a14', halo: 'rgba(255,110,40,0.5)' },
    hurt: { c: ['#ffb0c0', '#e02a55'], fs: 28 }, heal: { c: ['#d0ffc8', '#3fcf6a'], fs: 24 }, mp: { c: ['#c8e0ff', '#4a8aff'], fs: 24 },
    gold: { c: ['#fff6b0', '#f0b030'], fs: 22 }, exp: { c: ['#e8d8ff', '#b06aff'], fs: 20 },
  };
  const atl = {};
  const CH = '0123456789+-!';
  function atlas(kind) {
    let a = atl[kind];
    if (a) return a;
    const st = STY[kind] || STY.dmg, fs = st.fs, pad = Math.ceil(fs * (st.halo ? 0.3 : 0.16));
    const cw = Math.ceil(fs * 0.74) + pad * 2, ch = Math.ceil(fs * 1.3) + pad * 2;
    const [cv, c] = A.makeCanvas(cw * CH.length, ch * 2, 2);
    c.font = '900 ' + fs + 'px "Arial Black","Arial Rounded MT Bold",Impact,' + A.FONT;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const g = c.createLinearGradient(0, ch * 1.5 - fs * 0.42, 0, ch * 1.5 + fs * 0.38);
    st.c.forEach((col, i) => g.addColorStop(i / (st.c.length - 1), col));
    for (let i = 0; i < CH.length; i++) {
      const x = i * cw + cw / 2;
      if (st.halo) { c.lineWidth = fs * 0.56; c.strokeStyle = st.halo; c.strokeText(CH[i], x, ch / 2); }
      c.lineWidth = fs * 0.27; c.strokeStyle = st.out || A.OUT; c.strokeText(CH[i], x, ch / 2);
      c.fillStyle = g; c.fillText(CH[i], x, ch * 1.5);
    }
    return (atl[kind] = { cv, cw, ch, fs, adv: fs * 0.63 });
  }
  function digits(ctx, s, sc, at) {
    const adv = at.adv * sc, w0 = (adv * (s.length - 1)) / 2, dw = at.cw * sc, dh = at.ch * sc;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < s.length; i++) {
        const idx = CH.indexOf(s[i]);
        if (idx >= 0) ctx.drawImage(at.cv, idx * at.cw * 2, row * at.ch * 2, at.cw * 2, at.ch * 2, -w0 + i * adv - dw / 2, -dh / 2, dw, dh);
      }
    }
  }
  const CRIT_LENS = [1, 0.62, 0.9, 0.7, 1.08, 0.6, 0.86, 0.74, 1.02, 0.58, 0.94, 0.68, 1.1, 0.64];
  // comic starburst behind a critical number
  function critBack(ctx, age) {
    const f = 1 - U.sat((age - 0.12) / 0.32);
    if (f <= 0) return;
    const k = age < 0.08 ? E.outBack(age / 0.08) : 1, R = 42 * k * (0.7 + 0.3 * f);
    ctx.save(); ctx.globalAlpha *= f; ctx.rotate(age * 1.4 - 0.2);
    burstPath(ctx, R, CRIT_LENS.length, CRIT_LENS, 0.52);
    ctx.lineJoin = 'miter'; ctx.miterLimit = 6; ctx.fillStyle = '#ffb02a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#3a0a14'; ctx.stroke();
    burstPath(ctx, R * 0.66, CRIT_LENS.length, CRIT_LENS, 0.55); ctx.fillStyle = '#fff2a8'; ctx.fill();
    ctx.restore();
  }
  function critLabel(ctx, age, sc, fs) {
    const k = U.sat((age - 0.04) / 0.12);
    if (k <= 0) return;
    const y = -fs * 0.56 * Math.min(sc, 1.25) - 10 - 10 * (1 - E.outBack(k));
    ctx.save(); ctx.globalAlpha *= k;
    ctx.font = 'italic 900 15px "Arial Black",Impact,' + A.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 5; ctx.strokeStyle = '#3a0a14'; ctx.strokeText('CRITICAL', 0, y);
    ctx.fillStyle = '#fff1a0'; ctx.fillText('CRITICAL', 0, y);
    ctx.restore();
  }
  // kind: dmg | crit | hurt | heal | mp | gold | exp.   stack: vertical offset index.   o: dir (drift away from the attacker), heavy, kill
  Fx.num = (x, y, n, kind, stack, o) => {
    o = o || {};
    kind = kind || 'dmg';
    let s = String(Math.round(n));
    if (kind === 'heal' || kind === 'mp' || kind === 'gold' || kind === 'exp') s = '+' + s;
    const crit = kind === 'crit', dir = o.dir || (Math.random() < 0.5 ? -1 : 1);
    nums.push({ x: x + U.rand(-6, 6), y: y - (stack || 0) * (crit ? 26 : 21), s, kind, born: G.time, dur: crit ? 1.15 : kind === 'dmg' ? 0.9 : 0.85,
      dir, drift: crit ? U.rand(4, 10) : U.rand(10, 24), rot0: dir * (crit ? U.rand(0.1, 0.18) : U.rand(0.05, 0.13)), big: o.kill ? 1.12 : o.heavy ? 1.08 : 1 });
    if (nums.length > 80) nums.shift();
  };
  Fx.drawNums = (ctx) => {
    const now = G.time;
    for (const n of nums) {
      const age = Math.max(0, now - n.born), p = Math.min(1, age / n.dur);
      if (n.text) { ctx.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1; A.text(ctx, n.str, n.x, n.y - E.outCubic(p) * 46, { size: n.size, color: n.col, weight: 900 }); continue; }
      let sc, dx = 0, dy, rot = 0, a = 1;
      if (n.kind === 'dmg' || n.kind === 'crit') {
        const crit = n.kind === 'crit', left = n.dur - age, fo = crit ? 0.26 : 0.22;
        // spring pop: starts big (visible on the hit-stop frame), undershoots a touch, settles
        sc = (crit ? 1 + 0.85 * Math.exp(-age * 12) * Math.cos(age * 21) : 1 + 0.5 * Math.exp(-age * 15) * Math.cos(age * 25)) * n.big;
        dy = -(crit ? 26 : 40) * E.outCubic(Math.min(1, age / 0.55)) - age * (crit ? 6 : 12);
        dx = n.dir * n.drift * E.outCubic(Math.min(1, age / 0.5));
        rot = n.rot0 * Math.exp(-age * 9);
        if (left < fo) { const k = Math.max(0, left / fo); a = k; sc *= crit ? 1 + (1 - k) * 0.18 : 0.8 + 0.2 * k; }
        if (crit && age < 0.2) { const j = 1 - age / 0.2; dx += (Math.random() - 0.5) * 7 * j; dy += (Math.random() - 0.5) * 5 * j; }
      } else {
        sc = p < 0.12 ? U.lerp(1.8, 1, p / 0.12) : 1; dy = -E.outCubic(p) * 46; a = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      }
      const at = atlas(n.kind);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(n.x + dx, n.y + dy);
      if (rot) ctx.rotate(rot);
      if (n.kind === 'crit') critBack(ctx, age);
      digits(ctx, n.s, sc, at);
      if (n.kind === 'crit') critLabel(ctx, age, sc, at.fs);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  // ------------------------------------------------------------ update / draw
  Fx.update = (dt) => {
    for (let i = timers.length - 1; i >= 0; i--) { const tm = timers[i]; tm.t -= dt; if (tm.t <= 0) { timers.splice(i, 1); G.src = tm.src; try { tm.fn(); } catch (e) { console.error(e); } G.src = null; } }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.vy += p.g * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (let i = effs.length - 1; i >= 0; i--) {
      const e = effs[i];
      e.t += dt;
      if (e.upd) e.upd(dt, e);
      if (e.t >= e.dur) effs.splice(i, 1);
    }
    for (let i = nums.length - 1; i >= 0; i--) if (G.time - nums[i].born >= nums[i].dur) nums.splice(i, 1);
    if (flash) { flash.t += dt; if (flash.t >= flash.dur) flash = null; }
  };
  const drawEff = (ctx, e) => {
    ctx.save();
    try { e.draw(ctx, U.sat(e.t / e.dur), e); } catch (err) { if (!e.err) { e.err = 1; console.error('fx', err); } }
    ctx.restore();
  };
  // effects flagged `back` (ground circles, rays) are drawn before the characters
  Fx.drawBack = (ctx) => { for (const e of effs) if (e.back) drawEff(ctx, e); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; };
  Fx.draw = (ctx) => {
    for (const e of effs) if (!e.back) drawEff(ctx, e);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    let add = false;
    for (const p of parts) {
      const k = p.life / p.max, sz = U.lerp(p.size2, p.size, k);
      if (!!p.add !== add) { add = !!p.add; ctx.globalCompositeOperation = add ? 'lighter' : 'source-over'; }
      ctx.globalAlpha = p.type === 'smoke' ? k * 0.55 : Math.min(1, k * 2.2);
      ctx.fillStyle = p.color;
      switch (p.type) {
        case 'spark': {
          const sp = Math.hypot(p.vx, p.vy) || 1, l = Math.min(26, sp * 0.05) + sz;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - (p.vx / sp) * l, p.y - (p.vy / sp) * l);
          ctx.lineWidth = sz; ctx.strokeStyle = p.color; ctx.lineCap = 'round'; ctx.stroke();
          break;
        }
        case 'star': A.star(ctx, p.x, p.y, sz, sz * 0.4, 4, p.rot); ctx.fill(); break;
        case 'shard': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(-sz, sz * 0.6); ctx.lineTo(0, -sz); ctx.lineTo(sz, sz * 0.6); ctx.closePath(); ctx.fill(); ctx.restore(); break;
        case 'leaf': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.ellipse(0, 0, sz, sz * 0.45, 0, 0, TAU); ctx.fill(); ctx.restore(); break;
        case 'chunk': { // outlined blob, stretched along its flight
          const sp = Math.hypot(p.vx, p.vy), st = Math.min(0.45, sp / 1400), r = Math.max(0.5, sz / 2);
          ctx.beginPath(); ctx.ellipse(p.x, p.y, r * (1 + st), r * (1 - st * 0.6), Math.atan2(p.vy, p.vx), 0, TAU); ctx.fill();
          break;
        }
        default: ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.3, sz / 2), 0, TAU); ctx.fill();
      }
      if (p.ol && p.type !== 'spark') { ctx.lineWidth = p.ol; ctx.strokeStyle = A.OUT; ctx.stroke(); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
  Fx.lights = (hole) => { for (const e of effs) if (e.light) hole(e.x, e.y, e.light * (1.2 - e.t / e.dur * 0.5), 0.75); };
  // red screen-edge warning while HP is low (pre-rendered once, faded in/out)
  let vig = null, vigA = 0;
  function vignette() {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180;
    const g = c.getContext('2d'), gr = g.createRadialGradient(160, 90, 60, 160, 90, 200);
    gr.addColorStop(0, 'rgba(255,30,60,0)'); gr.addColorStop(0.55, 'rgba(255,30,60,0.12)'); gr.addColorStop(1, 'rgba(200,0,40,0.75)');
    g.fillStyle = gr; g.fillRect(0, 0, 320, 180);
    return c;
  }
  Fx.drawScreen = (ctx, dt) => {
    const P = G.P, low = P.d && !P.dead && G.S.scene === 'play' && P.hp < P.d.maxHp * 0.3;
    vigA = U.approach(vigA, low ? 1 : 0, (dt || 1 / 60) * 2.5);
    if (vigA > 0.01) {
      if (!vig) vig = vignette();
      const k = P.d ? 1 - U.sat(P.hp / (P.d.maxHp * 0.3)) : 0;
      ctx.globalAlpha = vigA * (0.45 + 0.35 * k) * (0.75 + 0.25 * Math.sin(G.time * (5 + k * 4)));
      ctx.drawImage(vig, 0, 0, G.W, G.H); ctx.globalAlpha = 1;
    }
    if (flash) { ctx.globalAlpha = flash.a * (1 - flash.t / flash.dur); ctx.fillStyle = flash.col; ctx.fillRect(0, 0, G.W, G.H); ctx.globalAlpha = 1; }
  };
  // ------------------------------------------------------------ combo counter (screen space, right side, under the quest tracker)
  // G.S.combo counts every hit landed; it resets when no hit lands for Fx.COMBO_WIN seconds (monsters.js refreshes G.S.comboT).
  // Each new hit punches the number; tiers recolour it; milestones shout a word; the drain bar shows the time left to keep it going.
  Fx.COMBO_WIN = 3;
  const CB = { shown: 0, popAt: -9, endAt: -9, last: 0, mile: null, mileAt: -9, mileT: 0, y: 360, f: 0, hud: null, qt: null };
  const MILES = [[10, 'GOOD!'], [30, 'GREAT!'], [50, 'EXCELLENT!'], [100, 'AMAZING!']];
  const TCOL = [['#ffffff', '#fff2c0', '#ffc24a'], ['#fffbd0', '#ffd23a', '#ff8a1e'], ['#fff0d0', '#ff9a3c', '#ff3a3a'], ['#ffe8ff', '#ff7ad8', '#a54aff']];
  const tierOf = (n) => (n >= 100 ? 4 : n >= 50 ? 3 : n >= 30 ? 2 : n >= 10 ? 1 : 0);
  const tierCol = (t, now) => {
    if (t < 4) return TCOL[t];
    const h = (now * 140) % 360;
    return ['hsl(' + h + ',100%,92%)', 'hsl(' + ((h + 40) % 360) + ',100%,66%)', 'hsl(' + ((h + 90) % 360) + ',95%,55%)'];
  };
  const CFONT = '"Arial Black","Arial Rounded MT Bold",Impact,' + A.FONT;
  Fx.drawCombo = (ctx) => {
    const S = G.S, now = G.time, n = S.combo || 0;
    if (n > CB.shown) {
      let mile = null;
      for (const [m, w] of MILES) if (CB.shown < m && n >= m) mile = [m, w];
      if (!mile && n >= 200 && Math.floor(n / 100) > Math.floor(CB.shown / 100)) mile = [n, 'LEGENDARY!'];
      if (mile) { CB.mile = mile[1]; CB.mileAt = now; CB.mileT = tierOf(mile[0]); if (G.Audio) G.Audio.sfx('combo', { rate: 1 + CB.mileT * 0.1 }); }
      CB.shown = n; CB.popAt = now;
    } else if (n < CB.shown) { CB.last = CB.shown; CB.endAt = now; CB.shown = n; }
    if (!CB.hud) { CB.hud = document.getElementById('hud'); CB.qt = document.getElementById('qt'); }
    if (CB.hud && CB.hud.classList.contains('hidden')) return;
    // keep clear of the quest tracker (it grows with the number of quests); toasts start at y 456
    if (--CB.f <= 0) { CB.f = 20; const q = CB.qt; CB.y = U.clamp((q && q.offsetHeight ? q.offsetTop + q.offsetHeight : 0) + 78, 350, 436); }
    let val = CB.shown, fade = 1, slide = 0;
    if (val < 2) {
      const e = now - CB.endAt;
      if (CB.last < 2 || e > 0.5) return;
      val = CB.last; fade = 1 - e / 0.5; slide = E.inQuad(e / 0.5) * 46;
    }
    const tier = tierOf(val), cols = tierCol(tier, now), str = String(val);
    const age = now - CB.popAt, punch = CB.shown ? Math.exp(-age * 13) * Math.cos(age * 24) : 0;
    const x0 = G.W - 40 + slide, y0 = G.touch && G.Touch && G.Touch.comboY ? Math.min(CB.y, G.Touch.comboY) : CB.y; // (touch: right above the skill buttons)
    ctx.save();
    ctx.globalAlpha = fade; ctx.lineJoin = 'round';
    ctx.font = 'italic 900 54px ' + CFONT; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    const tw = ctx.measureText(str).width, cx = x0 - tw / 2, cy = y0 - 19;
    A.glow(ctx, cx, cy, 64 + tier * 12, cols[2], (0.3 + 0.35 * Math.max(0, punch)) * fade);
    // milestone ring behind the number
    const ma = now - CB.mileAt;
    if (CB.mile && ma < 0.45) {
      const k = E.outCubic(ma / 0.45), r = 30 + 70 * k, lw = 9 * (1 - k);
      A.ell(ctx, cx, cy, r, r * 0.8); ctx.lineWidth = lw + 3; ctx.strokeStyle = A.OUT; ctx.stroke(); ctx.lineWidth = lw; ctx.strokeStyle = tierCol(CB.mileT, now)[1]; ctx.stroke();
    }
    ctx.save();
    const sc = 1 + (0.5 + tier * 0.1) * punch, jit = tier >= 2 ? (tier - 1) * 1.3 * Math.max(0, punch) : 0;
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.rotate(-0.05 * punch); ctx.translate(-cx, -cy);
    const jx = jit ? (Math.random() - 0.5) * 2 * jit : 0, jy = jit ? (Math.random() - 0.5) * 2 * jit : 0;
    ctx.fillStyle = 'rgba(20,10,34,0.42)'; ctx.fillText(str, x0 + 3 + jx, y0 + 4 + jy);
    ctx.lineWidth = 9; ctx.strokeStyle = A.OUT; ctx.strokeText(str, x0 + jx, y0 + jy);
    const g = ctx.createLinearGradient(0, y0 - 42, 0, y0 + 2); g.addColorStop(0, cols[0]); g.addColorStop(0.5, cols[1]); g.addColorStop(1, cols[2]);
    ctx.fillStyle = g; ctx.fillText(str, x0 + jx, y0 + jy);
    ctx.restore();
    // label + drain bar
    ctx.font = 'italic 900 18px ' + CFONT;
    ctx.lineWidth = 5; ctx.strokeStyle = A.OUT; ctx.strokeText('COMBO', x0 - 2, y0 + 23);
    ctx.fillStyle = cols[1]; ctx.fillText('COMBO', x0 - 2, y0 + 23);
    const live = CB.shown >= 2, tk = live ? U.sat((S.comboT || 0) / Fx.COMBO_WIN) : 0, bw = 112, bx = x0 - bw - 4, by = y0 + 31;
    A.rr(ctx, bx - 2, by - 2, bw + 4, 9, 4.5); ctx.fillStyle = 'rgba(22,14,36,0.78)'; ctx.fill();
    if (tk > 0) {
      ctx.globalAlpha = fade * (tk < 0.3 ? 0.55 + 0.45 * Math.abs(Math.sin(now * 14)) : 1);
      A.rr(ctx, bx + bw * (1 - tk), by, Math.max(4, bw * tk), 5, 2.5); ctx.fillStyle = cols[1]; ctx.fill();
      ctx.globalAlpha = fade;
    }
    // milestone word: pops in above the number, floats up and fades
    if (CB.mile && ma < 1.2) {
      const k = ma < 0.14 ? E.outBack(ma / 0.14) : 1, f = ma > 0.85 ? 1 - (ma - 0.85) / 0.35 : 1, mc = tierCol(CB.mileT, now);
      ctx.save();
      ctx.globalAlpha = fade * f;
      ctx.translate(x0 - 2, y0 - 62 - E.outCubic(Math.min(1, ma / 1.2)) * 16); ctx.scale(k, k); ctx.rotate(-0.06);
      ctx.font = 'italic 900 27px ' + CFONT;
      ctx.lineWidth = 7; ctx.strokeStyle = A.OUT; ctx.strokeText(CB.mile, 0, 0);
      const g2 = ctx.createLinearGradient(0, -24, 0, 2); g2.addColorStop(0, mc[0]); g2.addColorStop(1, mc[2]);
      ctx.fillStyle = g2; ctx.fillText(CB.mile, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  };
  Fx.count = () => parts.length + effs.length;
})();
