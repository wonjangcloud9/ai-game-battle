'use strict';
/* 등불지기 — fx: particles, timed effects, damage numbers, screen flash, scheduler */
(function () {
  const G = window.G, U = G.U, A = G.Art;
  const Fx = (G.Fx = {});
  const parts = [], effs = [], nums = [], timers = [];
  let flash = null;
  const TAU = Math.PI * 2, MAXP = 700;

  Fx.clear = () => { parts.length = 0; effs.length = 0; nums.length = 0; timers.length = 0; flash = null; };
  // game-time scheduler (cleared on map change)
  G.after = (delay, fn) => { timers.push({ t: delay, fn }); };

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
        life: U.rand(o.l0 || 0.3, o.l1 || 0.7), size: U.rand(o.z0 || 3, o.z1 || 7), color: Array.isArray(color) ? U.pick(color) : color, type: o.type || 'dot', add: o.add, rot: Math.random() * TAU, vr: U.rand(-8, 8) });
    }
  };
  Fx.dust = (x, y, n, color) => {
    for (let i = 0; i < n; i++) Fx.p({ x: x + U.rand(-10, 10), y: y - U.rand(0, 6), vx: U.rand(-70, 70), vy: U.rand(-60, -10), drag: 3, life: U.rand(0.3, 0.6), size: U.rand(5, 10), size2: 14, color: color || '#e8dcc8', type: 'smoke' });
  };
  // impact spark. kind: 'slash' | 'arrow' | 'magic' | 'fire' | 'ice' | 'bolt'
  Fx.hit = (x, y, dir, kind, crit) => {
    const col = kind === 'magic' ? ['#bfd0ff', '#ffffff', '#8fa8ff'] : kind === 'fire' ? ['#ffd27a', '#ff8a3c', '#fff3c4'] : kind === 'ice' ? ['#dff4ff', '#9fdcff', '#ffffff'] : kind === 'bolt' ? ['#fff7a8', '#ffffff', '#a8e8ff'] : ['#ffffff', '#ffe9a8', '#ffd27a'];
    Fx.add({ x, y, dur: crit ? 0.2 : 0.14, r: crit ? 46 : 30, col: col[0], light: 80,
      draw(c, p, o) {
        const r = o.r * (0.5 + p * 0.7), a = 1 - p;
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = a;
        A.star(c, o.x, o.y, r, r * 0.22, 4, 0.5); c.fillStyle = o.col; c.fill();
        A.glow(c, o.x, o.y, r * 1.5, o.col, 0.7);
      } });
    Fx.burst(x, y, crit ? 12 : 6, col, { type: 'spark', s0: 140, s1: crit ? 460 : 320, a0: dir > 0 ? -1.2 : Math.PI - 1.2, a1: dir > 0 ? 1.2 : Math.PI + 1.2, g: 300, l0: 0.15, l1: 0.35, z0: 2, z1: 4, add: true });
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
  Fx.text = (x, y, str, color, size) => nums.push({ x, y, str, col: color || '#fff', size: size || 15, t: 0, dur: 1.1, text: true });
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

  // ------------------------------------------------------------ damage numbers (digit atlases)
  const STY = {
    dmg: ['#ffffff', '#ffe2a0', 26], crit: ['#fff8a0', '#ff7a2e', 34], hurt: ['#ffb0c0', '#e02a55', 28],
    heal: ['#d0ffc8', '#3fcf6a', 24], mp: ['#c8e0ff', '#4a8aff', 24], gold: ['#fff6b0', '#f0b030', 22], exp: ['#e8d8ff', '#b06aff', 20],
  };
  const atl = {};
  const CH = '0123456789+-!';
  function atlas(kind) {
    let a = atl[kind];
    if (a) return a;
    const st = STY[kind] || STY.dmg, fs = st[2], cw = Math.ceil(fs * 0.72), ch = Math.ceil(fs * 1.4);
    const [cv, c] = A.makeCanvas(cw * CH.length, ch, 2);
    c.font = '900 ' + fs + 'px "Arial Black","Arial Rounded MT Bold",Impact,' + A.FONT;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const g = c.createLinearGradient(0, ch * 0.2, 0, ch * 0.85); g.addColorStop(0, st[0]); g.addColorStop(1, st[1]);
    for (let i = 0; i < CH.length; i++) {
      const x = i * cw + cw / 2;
      c.lineWidth = fs * 0.26; c.strokeStyle = A.OUT; c.strokeText(CH[i], x, ch / 2);
      c.fillStyle = g; c.fillText(CH[i], x, ch / 2);
    }
    return (atl[kind] = { cv, cw, ch });
  }
  // kind: dmg | crit | hurt | heal | mp | gold | exp.   stack: vertical offset index
  Fx.num = (x, y, n, kind, stack) => {
    let s = String(Math.round(n));
    if (kind === 'heal' || kind === 'mp' || kind === 'gold' || kind === 'exp') s = '+' + s;
    if (kind === 'crit') s += '!';
    nums.push({ x: x + U.rand(-8, 8), y: y - (stack || 0) * 20, s, kind: kind || 'dmg', t: 0, dur: kind === 'crit' ? 1.0 : 0.85 });
    if (nums.length > 80) nums.shift();
  };
  Fx.drawNums = (ctx) => {
    for (const n of nums) {
      const p = n.t / n.dur, rise = U.ease.outCubic(p) * 46, a = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      ctx.globalAlpha = a;
      if (n.text) { A.text(ctx, n.str, n.x, n.y - rise, { size: n.size, color: n.col, weight: 900 }); continue; }
      const at = atlas(n.kind), sc = p < 0.12 ? U.lerp(1.8, 1, p / 0.12) : 1, cw = at.cw * 0.78 * sc, tw = cw * n.s.length;
      for (let i = 0; i < n.s.length; i++) {
        const idx = CH.indexOf(n.s[i]);
        if (idx < 0) continue;
        ctx.drawImage(at.cv, idx * at.cw * 2, 0, at.cw * 2, at.ch * 2, n.x - tw / 2 + i * cw - (at.cw * sc - cw) / 2, n.y - rise - (at.ch * sc) / 2, at.cw * sc, at.ch * sc);
      }
    }
    ctx.globalAlpha = 1;
  };

  // ------------------------------------------------------------ update / draw
  Fx.update = (dt) => {
    for (let i = timers.length - 1; i >= 0; i--) { const tm = timers[i]; tm.t -= dt; if (tm.t <= 0) { timers.splice(i, 1); try { tm.fn(); } catch (e) { console.error(e); } } }
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
    for (let i = nums.length - 1; i >= 0; i--) { nums[i].t += dt; if (nums[i].t >= nums[i].dur) nums.splice(i, 1); }
    if (flash) { flash.t += dt; if (flash.t >= flash.dur) flash = null; }
  };
  Fx.draw = (ctx) => {
    for (const e of effs) {
      ctx.save();
      try { e.draw(ctx, U.sat(e.t / e.dur), e); } catch (err) { if (!e.err) { e.err = 1; console.error('fx', err); } }
      ctx.restore();
    }
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
        default: ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.3, sz / 2), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
  Fx.lights = (hole) => { for (const e of effs) if (e.light) hole(e.x, e.y, e.light * (1.2 - e.t / e.dur * 0.5), 0.75); };
  Fx.drawScreen = (ctx) => {
    if (flash) { ctx.globalAlpha = flash.a * (1 - flash.t / flash.dur); ctx.fillStyle = flash.col; ctx.fillRect(0, 0, G.W, G.H); ctx.globalAlpha = 1; }
  };
  Fx.count = () => parts.length + effs.length;
})();
