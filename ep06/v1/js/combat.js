'use strict';
/* 등불지기 — combat: damage helpers, projectiles, hazards (boss patterns), loot drops */
(function () {
  const G = window.G, U = G.U, A = G.Art, D = G.D, Fx = G.Fx;
  const TAU = Math.PI * 2;
  const sfx = (n, o) => { if (G.Audio) G.Audio.sfx(n, o); };
  G.mons = []; G.projs = []; G.drops = [];

  // ------------------------------------------------------------ player → monster damage
  const C = (G.Combat = {});
  const circRect = (cx, cy, r, m) => {
    const x = U.clamp(cx, m.x - m.w / 2, m.x + m.w / 2), y = U.clamp(cy, m.y - m.h, m.y);
    return (cx - x) * (cx - x) + (cy - y) * (cy - y) <= r * r;
  };
  C.circRect = circRect;
  // mult: skill % of attack. o: dir, kind, kb, up, slow, melee, noCrit
  C.hitMon = function (m, mult, o) {
    if (m.dead || m.hidden || m.invul) return 0;
    o = o || {};
    const P = G.P;
    let dmg = (P.d.atk * mult) / 100 * U.rand(0.9, 1.1);
    const crit = !o.noCrit && U.chance(P.d.crit / 100);
    if (crit) dmg *= P.d.critDmg / 100;
    dmg = Math.max(1, Math.round((dmg * 100) / (100 + m.dfn)));
    G.Mon.damage(m, dmg, { crit, dir: o.dir || (m.x >= P.x ? 1 : -1), kb: o.kb, kind: o.kind, up: o.up, slow: o.slow, melee: o.melee });
    if (P.d.leech > 0 && !P.dead) { P.leechF = (P.leechF || 0) + (dmg * P.d.leech) / 100; if (P.leechF >= 1) { const n = Math.floor(P.leechF); P.leechF -= n; P.heal(n, true); } }
    return dmg;
  };
  // o.max: limit targets (nearest first) · o.once: Set of already-hit monsters
  C.hitBox = function (box, mult, o) {
    o = o || {};
    const P = G.P, list = [];
    for (const m of G.mons) {
      if (m.dead || m.hidden || (o.once && o.once.has(m))) continue;
      if (box.x < m.x + m.w / 2 && box.x + box.w > m.x - m.w / 2 && box.y < m.y && box.y + box.h > m.y - m.h) list.push(m);
    }
    if (o.max && list.length > o.max) { list.sort((a, b) => Math.abs(a.x - P.x) - Math.abs(b.x - P.x)); list.length = o.max; }
    for (const m of list) { if (o.once) o.once.add(m); C.hitMon(m, mult, o); }
    return list.length;
  };
  C.hitCircle = function (x, y, r, mult, o) {
    o = o || {};
    let n = 0;
    for (const m of G.mons) {
      if (m.dead || m.hidden || (o.once && o.once.has(m)) || !circRect(x, y, r, m)) continue;
      if (o.once) o.once.add(m);
      C.hitMon(m, mult, Object.assign({}, o, { dir: m.x >= x ? 1 : -1 })); n++;
    }
    return n;
  };
  // nearest living monster to a point (optionally only in a direction)
  C.nearest = function (x, y, range, dir, skip) {
    let best = null, bd = range;
    for (const m of G.mons) {
      if (m.dead || m.hidden || m.def.ai === 'dummy' && false || (skip && skip.has(m))) continue;
      if (dir && (m.x - x) * dir < -20) continue;
      const d = Math.hypot(m.x - x, (m.y - m.h / 2 - y) * 1.4);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  };

  // ------------------------------------------------------------ projectiles
  const Pr = (G.Proj = {});
  Pr.spawn = function (o) { o.t = 0; o.dist = 0; o.hit = new Set(); o.pierce = o.pierce || 0; o.r = o.r || 10; G.projs.push(o); return o; };
  function endProj(o, impact) {
    if (o.onEnd) o.onEnd(o, impact);
    else if (impact) {
      const col = o.own === 'p' ? (o.kind === 'bolt' || o.kind === 'star' ? '#bfd0ff' : '#fff1c4') : o.col || '#d8c8ff';
      Fx.burst(o.x, o.y, 5, col, { s0: 40, s1: 180, l0: 0.15, l1: 0.35, z0: 2, z1: 5, add: o.own === 'p' });
    }
  }
  Pr.update = function (dt) {
    const P = G.P, map = G.map;
    for (let i = G.projs.length - 1; i >= 0; i--) {
      const o = G.projs[i];
      if (!o) continue;
      if (o.gone) { G.projs.splice(i, 1); continue; }
      let dead = false, impact = false;
      o.t += dt;
      const sp = Math.hypot(o.vx, o.vy) || 1;
      if (o.homing) {
        let tx, ty, ok = false;
        if (o.own === 'p') {
          if (!o.tg || o.tg.dead || o.tg.hidden) o.tg = C.nearest(o.x, o.y, 480, Math.sign(o.vx) || 1, o.hit);
          if (o.tg) { tx = o.tg.x; ty = o.tg.y - o.tg.h / 2; ok = true; }
        } else if (!P.dead) { tx = P.x; ty = P.y - 36; ok = o.t < (o.homeT || 1.6); }
        if (ok) {
          const cur = Math.atan2(o.vy, o.vx);
          let da = Math.atan2(ty - o.y, tx - o.x) - cur;
          while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
          const mx = o.homing * 7 * dt, na = cur + U.clamp(da, -mx, mx);
          o.vx = Math.cos(na) * sp; o.vy = Math.sin(na) * sp;
        }
      }
      if (o.g) o.vy += o.g * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.dist += sp * dt;
      // trails
      if (o.kind === 'star' || o.kind === 'bolt') { if (Math.random() < dt * 40) Fx.p({ x: o.x, y: o.y, vx: U.rand(-20, 20), vy: U.rand(-20, 20), life: 0.3, size: U.rand(2, 5), color: o.kind === 'star' ? '#ffe9a0' : '#a8c0ff', type: 'star', add: true, rot: Math.random() * 6 }); }
      else if (o.kind === 'windarrow' || o.kind === 'bigarrow') { if (Math.random() < dt * 50) Fx.p({ x: o.x - o.vx * 0.02, y: o.y + U.rand(-8, 8), vx: -o.vx * 0.1, vy: U.rand(-20, 20), life: 0.25, size: U.rand(2, 5), color: '#c8ffe0', add: true }); }
      else if (o.kind === 'darkorb' || o.kind === 'meteor') { if (Math.random() < dt * 30) Fx.p({ x: o.x, y: o.y, vx: U.rand(-25, 25), vy: U.rand(-25, 25), life: 0.4, size: U.rand(3, 7), color: o.col || '#b06aff', add: true }); }
      if ((o.range && o.dist >= o.range) || (o.life && o.t >= o.life)) dead = true;
      if (o.x < -60 || o.x > map.w + 60 || o.y < -400 || o.y > map.h + 60) dead = true;
      if (!dead && !o.ghost && G.World.solidAt(o.x, o.y)) { dead = true; impact = true; }
      if (!dead && o.gy !== undefined && o.vy > 0 && o.y >= o.gy) { dead = true; impact = true; o.y = o.gy; }
      if (!dead) {
        if (o.own === 'p') {
          for (const m of G.mons) {
            if (m.dead || m.hidden || o.hit.has(m) || !circRect(o.x, o.y, o.r, m)) continue;
            o.hit.add(m);
            C.hitMon(m, o.dmg, { dir: Math.sign(o.vx) || 1, kind: o.hitKind, kb: o.kb });
            if (o.onHit) o.onHit(o, m);
            if (o.pierce-- <= 0) { dead = true; break; }
            o.tg = null;
          }
        } else if (!P.invul()) {
          const x = U.clamp(o.x, P.x - 13, P.x + 13), y = U.clamp(o.y, P.y - 64, P.y);
          if ((o.x - x) * (o.x - x) + (o.y - y) * (o.y - y) <= o.r * o.r) { if (P.hurt(o.dmg, o.x - o.vx * 0.05, { slow: o.slow, kb: o.kb })) { dead = !o.pierce; impact = true; } }
        }
      }
      if (dead) { endProj(o, impact); const j = G.projs.indexOf(o); if (j >= 0) G.projs.splice(j, 1); }
    }
  };
  Pr.draw = function (ctx) {
    const t = G.time;
    for (const o of G.projs) {
      if (o.gone) continue;
      ctx.save(); ctx.translate(o.x, o.y);
      const ang = Math.atan2(o.vy, o.vx);
      switch (o.kind) {
        case 'arrow': case 'bigarrow': case 'windarrow': {
          const big = o.kind !== 'arrow', s = o.kind === 'windarrow' ? 1.7 : big ? 1.35 : 1;
          ctx.rotate(ang); ctx.scale(s, s);
          if (big) A.glow(ctx, 0, 0, 26, o.kind === 'windarrow' ? '#8ff0c0' : '#ffe9a0', 0.7);
          ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(10, 0); ctx.lineWidth = 4.2; ctx.strokeStyle = A.OUT; ctx.stroke();
          ctx.lineWidth = 2; ctx.strokeStyle = '#f3e3b8'; ctx.stroke();
          A.poly(ctx, [9, -4.2, 18, 0, 9, 4.2]); A.fs(ctx, big ? '#c8ffe0' : '#e3e9f2', 1.8);
          A.poly(ctx, [-22, 0, -27, -4.5, -18, -1]); A.fs(ctx, '#ffffff', 1.4);
          A.poly(ctx, [-22, 0, -27, 4.5, -18, 1]); A.fs(ctx, '#ffffff', 1.4);
          if (o.kind === 'windarrow') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(180,255,220,0.7)'; ctx.lineWidth = 2; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(-14 - k * 12, 0, 9 + k * 2, -1.1, 1.1); ctx.stroke(); } }
          break;
        }
        case 'star':
          A.glow(ctx, 0, 0, 24, '#ffe070', 0.8);
          A.star(ctx, 0, 0, 11, 4.6, 5, t * 9); A.fs(ctx, '#fff6c0', 2, '#e8962a');
          break;
        case 'bolt':
          A.glow(ctx, 0, 0, 22, '#8fa8ff', 0.85);
          ctx.rotate(ang);
          ctx.beginPath(); ctx.moveTo(9, 0); ctx.quadraticCurveTo(0, -7, -18, 0); ctx.quadraticCurveTo(0, 7, 9, 0); ctx.closePath(); A.fs(ctx, '#e8eeff', 2, '#5a5fd4');
          break;
        case 'thorn': ctx.rotate(ang); A.poly(ctx, [-10, -4, 12, 0, -10, 4]); A.fs(ctx, '#3f7a3a', 2); break;
        case 'seed': ctx.rotate(t * 5); A.ell(ctx, 0, 0, 8, 8); A.fs(ctx, '#fffbe8', 2); A.ell(ctx, 0, 0, 3, 3); ctx.fillStyle = '#b98a5a'; ctx.fill(); break;
        case 'bubble': {
          const r = o.r + Math.sin(t * 9 + o.x * 0.05) * 1.2;
          A.ell(ctx, 0, 0, r, r); ctx.fillStyle = 'rgba(140,235,225,0.5)'; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = '#2f8a80'; ctx.stroke();
          A.ell(ctx, -r * 0.35, -r * 0.35, r * 0.22, r * 0.16, -0.6); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
          break;
        }
        case 'darkorb':
          A.glow(ctx, 0, 0, o.r * 2.6, o.col || '#b06aff', 0.8);
          A.ell(ctx, 0, 0, o.r, o.r); A.fs(ctx, '#2a1840', 2.2, o.col || '#c79bff');
          A.ell(ctx, -o.r * 0.25, -o.r * 0.25, o.r * 0.3); ctx.fillStyle = o.col || '#c79bff'; ctx.fill();
          break;
        case 'snowball': A.ell(ctx, 0, 0, o.r, o.r); A.fs(ctx, '#f6fbff', 2.2); A.ell(ctx, -o.r * 0.3, -o.r * 0.3, o.r * 0.3); ctx.fillStyle = '#ffffff'; ctx.fill(); break;
        case 'boulder': ctx.rotate(t * 4); A.ell(ctx, 0, 0, o.r, o.r * 0.94); A.fs(ctx, '#eef6ff', 3); A.ell(ctx, -o.r * 0.3, -o.r * 0.3, o.r * 0.35, o.r * 0.25); ctx.fillStyle = '#ffffff'; ctx.fill(); A.ell(ctx, o.r * 0.3, o.r * 0.25, o.r * 0.22); ctx.fillStyle = '#c6dcf2'; ctx.fill(); break;
        case 'ice': ctx.rotate(ang); A.glow(ctx, 0, 0, 20, '#9fdcff', 0.6); A.poly(ctx, [-12, -5, 14, 0, -12, 5, -6, 0]); A.fs(ctx, '#dff4ff', 2, '#4a8ab8'); break;
        case 'spit': A.glow(ctx, 0, 0, o.r * 2, '#9fe060', 0.5); A.ell(ctx, 0, 0, o.r, o.r * 0.9); A.fs(ctx, '#8fd84a', 2.2, '#3a6a20'); break;
        case 'wave': {
          ctx.scale(Math.sign(o.vx) || 1, 1);
          A.glow(ctx, 0, -50, 80, '#b06aff', 0.6);
          ctx.beginPath(); ctx.moveTo(-8, 6); ctx.quadraticCurveTo(44, -50, -8, -112); ctx.quadraticCurveTo(14, -50, -8, 6); ctx.closePath();
          ctx.fillStyle = '#e6d0ff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#7a3ad0'; ctx.stroke();
          break;
        }
        case 'meteor':
          A.glow(ctx, 0, 0, o.r * 3, o.col || '#ff9a3c', 0.85);
          A.ell(ctx, 0, 0, o.r, o.r); A.fs(ctx, o.core || '#fff1c4', 2.4, o.col || '#ff7a2e');
          break;
        default: A.ell(ctx, 0, 0, o.r, o.r); A.fs(ctx, o.col || '#ffffff', 2);
      }
      ctx.restore();
    }
  };

  // ------------------------------------------------------------ hazards (hurt the player)
  const Hz = (G.Haz = {});
  const hz = [];
  Hz.clear = () => { hz.length = 0; };
  Hz.add = (o) => { o.t = 0; hz.push(o); return o; };
  Hz.count = () => hz.length;
  const pHit = (x, y, w, h) => { const P = G.P; return x < P.x + 13 && x + w > P.x - 13 && y < P.y && y + h > P.y - 64; };
  // instant explosion around a point
  Hz.blast = function (x, y, r, dmg, col, o) {
    const P = G.P;
    Fx.ring(x, y, r * 0.3, r, col || '#ffb060', 0.35, 10);
    Fx.burst(x, y, 14, [col || '#ffb060', '#ffffff'], { s0: 80, s1: 380, l0: 0.25, l1: 0.6, z0: 4, z1: 9, add: true });
    Fx.add({ x, y, r, col: col || '#ffb060', dur: 0.22, light: r * 1.6, draw(c, p, e) { A.glow(c, e.x, e.y, e.r * (1 + p * 0.5), e.col, 1 - p); } });
    const cx = U.clamp(x, P.x - 13, P.x + 13), cy = U.clamp(y, P.y - 64, P.y);
    if (Math.hypot(x - cx, y - cy) <= r) P.hurt(dmg, x, o);
  };
  Hz.shock = (x, y, dir, dmg, o) => Hz.add(Object.assign({ type: 'shock', x, y, dir, dmg, spd: 400, left: 460, col: '#e8dcc8' }, o));
  Hz.fall = (x, y, delay, dmg, o) => Hz.add(Object.assign({ type: 'fall', x, y, delay, dmg, r: 46, kind: 'rock', fallT: 0.3 }, o));
  Hz.spike = (x, y, delay, dmg, o) => Hz.add(Object.assign({ type: 'spike', x, y, delay, dmg, w: 60, h: 120, kind: 'crystal', hold: 0.45 }, o));
  Hz.beam = (x, y, tx, ty, delay, dmg, o) => Hz.add(Object.assign({ type: 'beam', x, y, tx, ty, delay, dmg, dur: 0.3, wd: 34, col: '#7fe0ff' }, o));
  Hz.zone = (x, y, w, h, dur, dmg, o) => Hz.add(Object.assign({ type: 'zone', x, y, w, h, dur, dmg, tick: 0.3, next: 0, kind: 'frost', dir: 1 }, o));
  Hz.update = function (dt) {
    const P = G.P, map = G.map;
    for (let i = hz.length - 1; i >= 0; i--) {
      const o = hz[i];
      let dead = false;
      o.t += dt;
      if (o.type === 'shock') {
        o.x += o.dir * o.spd * dt; o.left -= o.spd * dt;
        if (Math.random() < dt * 30) Fx.p({ x: o.x - o.dir * 12, y: o.y - U.rand(0, 14), vx: -o.dir * U.rand(20, 80), vy: U.rand(-80, -20), life: 0.4, size: U.rand(4, 9), size2: 12, color: o.col, type: 'smoke' });
        if (pHit(o.x - 20, o.y - 46, 40, 46)) P.hurt(o.dmg, o.x - o.dir * 20, { up: 430 });
        if (o.left <= 0 || o.x < 10 || o.x > map.w - 10 || G.World.solidAt(o.x + o.dir * 16, o.y - 12)) dead = true;
        if (o.lim && (o.x < o.lim[0] || o.x > o.lim[1])) dead = true;
      } else if (o.type === 'fall') {
        if (o.t >= o.delay + o.fallT) {
          dead = true;
          const col = o.kind === 'icicle' ? '#a8dcf6' : o.kind === 'poison' ? '#9fe060' : o.kind === 'dark' ? '#b06aff' : o.kind === 'leaf' ? '#c9a066' : '#c8b8a8';
          Fx.ring(o.x, o.y - 6, o.r * 0.3, o.r * 1.15, col, 0.3, 8, { flat: 0.4 });
          Fx.burst(o.x, o.y - 8, 10, [col, '#ffffff'], { s0: 80, s1: 320, a0: -Math.PI, a1: 0, l0: 0.25, l1: 0.55, z0: 3, z1: 8, type: o.kind === 'icicle' ? 'shard' : 'dot' });
          G.shake(o.r > 60 ? 7 : 3, 0.18); sfx(o.kind === 'dark' || o.r > 60 ? 'boss_slam' : 'hit', { vol: 0.6 });
          if (Math.abs(P.x - o.x) < o.r + 12 && P.y > o.y - o.r * 1.3 - 30 && P.y < o.y + 46) P.hurt(o.dmg, o.x, { slow: o.slow });
        }
      } else if (o.type === 'spike') {
        if (!o.fired && o.t >= o.delay) { o.fired = true; G.shake(4, 0.15); sfx('ice', { vol: 0.6, rate: 0.8 }); Fx.burst(o.x, o.y, 8, o.kind === 'crystal' ? '#9fe8ff' : '#d8c0a0', { a0: -Math.PI, a1: 0, s0: 100, s1: 300, type: 'shard', z0: 3, z1: 7 }); }
        if (o.fired && o.t < o.delay + o.hold) { const gk = U.sat((o.t - o.delay) / 0.1); if (pHit(o.x - o.w / 2, o.y - o.h * gk, o.w, o.h * gk)) P.hurt(o.dmg, o.x, { up: 520 }); }
        if (o.t >= o.delay + o.hold + 0.18) dead = true;
      } else if (o.type === 'beam') {
        if (!o.fired && o.t >= o.delay) { o.fired = true; sfx('laser', { vol: 0.8 }); G.shake(5, 0.25); }
        if (o.fired && o.t < o.delay + o.dur && !P.invul()) {
          const px = P.x, py = P.y - 34, dx = o.tx - o.x, dy = o.ty - o.y, l2 = dx * dx + dy * dy || 1;
          const k = U.sat(((px - o.x) * dx + (py - o.y) * dy) / l2), d = Math.hypot(px - (o.x + dx * k), py - (o.y + dy * k));
          if (d < o.wd / 2 + 20) P.hurt(o.dmg, o.x);
        }
        if (o.t >= o.delay + o.dur + 0.12) dead = true;
      } else if (o.type === 'zone') {
        if (o.follow) { o.x = o.follow.x + (o.dir > 0 ? o.ox : -o.ox - o.w); }
        if (o.t >= o.next) { o.next += o.tick; if (pHit(o.x, o.y, o.w, o.h)) P.hurt(o.dmg, o.dir > 0 ? o.x : o.x + o.w, { slow: o.slow, kb: 0.5, up: 120 }); }
        if (o.kind === 'frost') for (let k = 0; k < 3; k++) Fx.p({ x: o.dir > 0 ? o.x : o.x + o.w, y: o.y + o.h * U.rand(0.25, 0.75), vx: o.dir * U.rand(300, 620), vy: U.rand(-90, 90), life: U.rand(0.3, 0.55), size: U.rand(5, 12), size2: 22, color: U.pick(['#dff4ff', '#a8dcf6', '#ffffff']), type: 'smoke' });
        if (o.t >= o.dur) dead = true;
      }
      if (dead) hz.splice(i, 1);
    }
  };
  Hz.draw = function (ctx) {
    const t = G.time;
    for (const o of hz) {
      ctx.save();
      if (o.type === 'shock') {
        ctx.translate(o.x, o.y); ctx.scale(o.dir, 1); ctx.globalAlpha = U.sat(o.left / 90);
        ctx.beginPath(); ctx.moveTo(-34, 0); ctx.quadraticCurveTo(-8, -12, 6, -54); ctx.quadraticCurveTo(14, -18, 28, 0); ctx.closePath();
        A.fs(ctx, o.col, 2.6);
        ctx.beginPath(); ctx.moveTo(-14, -4); ctx.quadraticCurveTo(0, -12, 5, -34); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
      } else if (o.type === 'fall') {
        const k = U.sat(o.t / o.delay), red = o.kind === 'poison' ? '#9fe060' : o.kind === 'dark' ? '#c79bff' : '#ff6a5a';
        ctx.globalAlpha = 0.25 + k * 0.35;
        A.ell(ctx, o.x, o.y, o.r, o.r * 0.26); ctx.fillStyle = red; ctx.fill();
        ctx.globalAlpha = 0.9; A.ell(ctx, o.x, o.y, o.r * k, o.r * 0.26 * k); ctx.lineWidth = 2.5; ctx.strokeStyle = red; ctx.stroke();
        A.ell(ctx, o.x, o.y, o.r, o.r * 0.26); ctx.stroke();
        ctx.globalAlpha = 1;
        if (o.t >= o.delay) {
          const f = U.sat((o.t - o.delay) / o.fallT), y = o.y - 720 * (1 - f * f) - 20;
          ctx.translate(o.x, y);
          if (o.kind === 'icicle') { A.poly(ctx, [-12, -40, 12, -40, 0, 26]); A.fs(ctx, '#dff4ff', 2.6, '#4a8ab8'); }
          else if (o.kind === 'poison') { A.glow(ctx, 0, 0, 30, '#9fe060', 0.6); ctx.beginPath(); ctx.moveTo(0, -26); ctx.quadraticCurveTo(15, 0, 0, 14); ctx.quadraticCurveTo(-15, 0, 0, -26); A.fs(ctx, '#a8e860', 2.4, '#3a6a20'); }
          else if (o.kind === 'dark') { A.glow(ctx, 0, 0, o.r, '#b06aff', 0.9); A.ell(ctx, 0, 0, o.r * 0.42); A.fs(ctx, '#2a1840', 3, '#c79bff'); ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(0, -80); ctx.lineTo(8, -10); ctx.fillStyle = 'rgba(176,106,255,0.5)'; ctx.fill(); }
          else if (o.kind === 'leaf') { ctx.rotate(t * 6); A.ell(ctx, 0, 0, 16, 13); A.fs(ctx, '#b9783c'); A.rr(ctx, -15, -15, 30, 11, 5); A.fs(ctx, '#7a5236'); }
          else { ctx.rotate(t * 3 + o.x); A.poly(ctx, [-20, -8, -8, -22, 14, -18, 22, 2, 8, 20, -14, 16]); A.fs(ctx, o.kind === 'crystal' ? '#8fd8f0' : '#9a8f98', 3); }
        }
      } else if (o.type === 'spike') {
        ctx.translate(o.x, o.y);
        if (!o.fired) {
          const k = o.t / o.delay;
          ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 30);
          A.ell(ctx, 0, 0, o.w * 0.6, 8); ctx.fillStyle = o.kind === 'crystal' ? '#7fe0ff' : o.kind === 'dark' ? '#c79bff' : '#ff8a5a'; ctx.fill();
          ctx.globalAlpha = 1;
          for (let i = -1; i <= 1; i++) { A.poly(ctx, [i * 16 - 5, 0, i * 16 + U.rand(-2, 2), -8 - k * 12, i * 16 + 5, 0]); A.fs(ctx, o.kind === 'crystal' ? '#9fe8ff' : '#b8a090', 1.8); }
        } else {
          const up = U.sat((o.t - o.delay) / 0.1), dn = 1 - U.sat((o.t - o.delay - o.hold) / 0.18), k = up * dn, h = o.h * k, w = o.w / 2;
          if (o.kind === 'crystal' || o.kind === 'dark') {
            const c1 = o.kind === 'dark' ? '#c79bff' : '#9fe8ff', c2 = o.kind === 'dark' ? '#6a3ab8' : '#4ab0d8';
            A.glow(ctx, 0, -h * 0.5, o.w, c1, 0.5 * k);
            A.poly(ctx, [-w, 0, -w * 0.55, -h * 0.62, -w * 0.15, 0]); A.fs(ctx, c2, 2.6);
            A.poly(ctx, [w * 0.2, 0, w * 0.6, -h * 0.7, w, 0]); A.fs(ctx, c2, 2.6);
            A.poly(ctx, [-w * 0.5, 0, 0, -h, w * 0.5, 0]); A.fs(ctx, c1, 2.8);
            ctx.beginPath(); ctx.moveTo(-w * 0.12, -h * 0.2); ctx.lineTo(0, -h * 0.84); ctx.lineWidth = 2.4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
          } else { A.poly(ctx, [-w, 0, -w * 0.3, -h * 0.5, 0, -h, w * 0.3, -h * 0.5, w, 0]); A.fs(ctx, '#d8b890', 2.8); }
        }
      } else if (o.type === 'beam') {
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.tx, o.ty);
        if (!o.fired) { ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 40); ctx.lineWidth = 3; ctx.strokeStyle = o.col; ctx.setLineDash([14, 10]); ctx.stroke(); ctx.setLineDash([]); A.glow(ctx, o.x, o.y, 30 + (o.t / o.delay) * 40, o.col, 0.8); }
        else {
          const k = 1 - U.sat((o.t - o.delay - o.dur) / 0.12), jit = 1 + Math.sin(t * 60) * 0.12;
          ctx.globalAlpha = k;
          ctx.lineWidth = o.wd * 1.7 * jit; ctx.strokeStyle = A.rgba(o.col, 0.35); ctx.stroke();
          ctx.lineWidth = o.wd * jit; ctx.strokeStyle = o.col; ctx.stroke();
          ctx.lineWidth = o.wd * 0.4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
          A.glow(ctx, o.x, o.y, 70, o.col, 1); A.glow(ctx, o.tx, o.ty, 60, o.col, 1);
        }
      } else if (o.type === 'zone') {
        const k = Math.min(1, o.t * 6, (o.dur - o.t) * 6);
        ctx.globalAlpha = 0.28 * k; ctx.globalCompositeOperation = 'lighter';
        const x0 = o.dir > 0 ? o.x : o.x + o.w, x1 = o.dir > 0 ? o.x + o.w : o.x, my = o.y + o.h / 2;
        ctx.beginPath(); ctx.moveTo(x0, my - 14); ctx.quadraticCurveTo((x0 + x1) / 2, o.y - 10, x1, o.y); ctx.lineTo(x1, o.y + o.h); ctx.quadraticCurveTo((x0 + x1) / 2, o.y + o.h + 10, x0, my + 14); ctx.closePath();
        ctx.fillStyle = '#c9f0ff'; ctx.fill();
      }
      ctx.restore();
    }
  };

  // ------------------------------------------------------------ loot drops
  const Dr = (G.Drops = {});
  Dr.gold = (x, y, amt, gy) => G.drops.push({ kind: 'gold', amt, x, y, vx: U.rand(-130, 130), vy: U.rand(-520, -380), gy, t: 0, state: 'fly' });
  Dr.item = (x, y, item, gy) => G.drops.push({ kind: 'item', item, x, y, vx: U.rand(-150, 150), vy: U.rand(-560, -400), gy, t: 0, state: 'fly' });
  let fullMsgT = 0;
  Dr.update = function (dt) {
    const P = G.P;
    if (fullMsgT > 0) fullMsgT -= dt;
    for (let i = G.drops.length - 1; i >= 0; i--) {
      const d = G.drops[i];
      d.t += dt;
      if (d.state === 'fly') {
        d.vy += 1700 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        d.x = U.clamp(d.x, 20, G.map.w - 20);
        if (d.y >= d.gy - 12 && d.vy > 0) { d.y = d.gy - 12; if (d.vy > 260) { d.vy *= -0.35; d.vx *= 0.5; } else { d.state = 'rest'; d.t = 0; } }
      } else if (d.state === 'rest') {
        if (d.full) { d.fullT -= dt; if (d.fullT <= 0) d.full = false; }
        if (!P.dead && !d.full && d.t > 0.25 && Math.abs(d.x - P.x) < 74 && Math.abs(d.y - (P.y - 30)) < 80) d.state = 'magnet';
        if (d.t > 90) { G.drops.splice(i, 1); continue; }
      } else if (d.state === 'magnet') {
        const tx = P.x, ty = P.y - 36, dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy) || 1;
        d.ms = (d.ms || 320) + 2200 * dt;
        d.x += (dx / dist) * d.ms * dt; d.y += (dy / dist) * d.ms * dt;
        if (dist < 26 || P.dead) {
          if (P.dead) { d.state = 'rest'; d.ms = 0; continue; }
          if (d.kind === 'gold') {
            const amt = Math.max(1, Math.round(d.amt * (1 + P.d.goldp / 100)));
            P.gold += amt; Fx.num(P.x, P.y - 96, amt, 'gold'); sfx('coin'); G.emit('gold');
            G.drops.splice(i, 1);
          } else if (G.Inv.addItem(d.item)) {
            const b = D.ITEMS[d.item.b];
            sfx('pickup');
            G.emit('loot', d.item);
            if (D.isEquip(b)) P.hint('equip');
            G.drops.splice(i, 1);
          } else {
            d.state = 'rest'; d.ms = 0; d.full = true; d.fullT = 4; d.y = d.gy - 12;
            if (fullMsgT <= 0) { fullMsgT = 3; G.emit('msg', '가방이 가득 찼습니다.', 'warn'); sfx('error'); }
          }
        }
      }
    }
  };
  Dr.draw = function (ctx) {
    const t = G.time;
    for (const d of G.drops) {
      const bob = d.state === 'rest' ? Math.sin(t * 3 + d.x * 0.1) * 3 : 0, y = d.y + bob;
      if (d.state === 'rest' && d.t > 80 && ((t * 8) | 0) % 2) continue;
      if (d.state !== 'fly') A.shadow(ctx, d.x, d.gy, 9, 0.2);
      let key = 'gold', glow = '#ffd84a', sz = 26;
      if (d.kind === 'gold') { key = d.amt >= 80 ? 'gold_pile' : 'gold'; sz = d.amt >= 80 ? 30 : 22; }
      else {
        const b = D.ITEMS[d.item.b];
        key = b.icon; sz = 30;
        glow = D.isEquip(b) ? D.RAR[d.item.rar || 0].color : null;
        if (glow && (d.item.rar || 0) === 0) glow = null;
      }
      if (glow) A.glow(ctx, d.x, y, d.kind === 'gold' ? 16 : 26 + Math.sin(t * 5) * 3, glow, d.kind === 'gold' ? 0.35 : 0.7);
      if (A.drawIcon) A.drawIcon(ctx, key, d.x, y, sz);
      else { A.ell(ctx, d.x, y, sz * 0.36); A.fs(ctx, d.kind === 'gold' ? '#ffd84a' : '#c8b8ff', 2); }
    }
  };
})();
