'use strict';
/* 등불지기 — combat: damage helpers, projectiles, hazards (boss patterns), loot drops */
(function () {
  const G = window.G, U = G.U, A = G.Art, D = G.D, Fx = G.Fx;
  const TAU = Math.PI * 2;
  const sfx = (n, o) => { if (G.Audio) G.Audio.sfx(n, o); };
  G.mons = []; G.projs = []; G.drops = [];
  // G.src: the guardian attack (BOSS pattern name · 'touch' · 'minion') behind whatever is hurting the hero right now. Projectiles and
  // hazards keep the attack that spawned them, so a shockwave still counts as 발구르기 after the stomp is over (game.js fight record)
  G.src = null;

  // ------------------------------------------------------------ player → monster damage
  const C = (G.Combat = {});
  const circRect = (cx, cy, r, m) => {
    const x = U.clamp(cx, m.x - m.w / 2, m.x + m.w / 2), y = U.clamp(cy, m.y - m.h, m.y);
    return (cx - x) * (cx - x) + (cy - y) * (cy - y) <= r * r;
  };
  C.circRect = circRect;
  // mult: skill % of attack. o: dir, kind, kb, up, slow, melee, noCrit, heavy (finisher — big strikes of 150%+ count as heavy too)
  C.hitMon = function (m, mult, o) {
    if (m.dead || m.gone || m.hidden || m.invul) return 0; // (gone: a guardian whose fight was reset — a late hit can't fell it)
    o = o || {};
    const P = G.P;
    let dmg = (P.d.atk * mult) / 100 * U.rand(0.9, 1.1);
    const crit = !o.noCrit && U.chance(P.d.crit / 100);
    if (crit) dmg *= P.d.critDmg / 100;
    dmg = Math.max(1, Math.round((dmg * 100) / (100 + m.dfn)));
    G.Mon.damage(m, dmg, { crit, dir: o.dir || (m.x >= P.x ? 1 : -1), kb: o.kb, kind: o.kind, up: o.up, slow: o.slow, melee: o.melee, heavy: !!o.heavy || mult >= 150 });
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
  Pr.spawn = function (o) { o.t = 0; o.dist = 0; o.hit = new Set(); o.pierce = o.pierce || 0; o.r = o.r || 10; if (o.src === undefined) o.src = G.src; G.projs.push(o); return o; };
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
      G.src = o.src || null; // (its hit — or the blast it bursts into — counts as the attack that threw it)
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
    G.src = null;
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
  Hz.add = (o) => { o.t = 0; if (o.src === undefined) o.src = G.src; hz.push(o); return o; };
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
  // ---- danger telegraph: a red patch on the floor laid over the exact hit box of a guardian's big attack, shown a moment before it
  // lands (visual only — the attack itself does the hitting). Its fill grows from the boss outward; when it is full, the hit comes.
  // Thin lanes with chevrons (lane) mark where a shockwave / wave / charge will run.
  // o: x1, x2 (world x), y (floor), h (how high the hit reaches), dur (s until the hit), keep (s it stays live after), hold (fade-out),
  //    from ('l' | 'r' | 'c': where the fill starts), dir (±1: chevrons), lane (thin style), near(o) (after the hit: the near end follows
  //    the wave / the charging boss), m (owner: before the hit the zone keeps the boss's pace, also when it is slowed), grp (dodge group)
  Hz.warn = (o) => { o = Hz.add(Object.assign({ type: 'warn', h: 120, keep: 0, hold: 0.22, from: 'c' }, o)); if (o.grp) o.grp.n++; return o; };
  // dodge check: all the zones of one attack share a group. If the hero stood in one of them while it was live and nothing has hurt
  // them by the time the last one is over, they dodged it — a small "회피!" pops up (the fight should feel winnable when you move).
  let hurtAt = -9, dodgeAt = -9;
  G.on('hurt', () => { hurtAt = G.time; });
  Hz.group = () => ({ born: G.time, n: 0, in: false });
  function warnSpan(o) {
    if (!o.near || o.t < o.dur) return [o.x1, o.x2];
    const p = o.near(o);
    return o.dir > 0 ? [Math.max(o.x1, p), o.x2] : [o.x1, Math.min(o.x2, p)];
  }
  const inWarn = (o, a, b) => { const P = G.P; return P.x + 13 > a && P.x - 13 < b && P.y > o.y - o.h && P.y - 64 < o.y + 8; };
  function judge(g) {
    const P = G.P;
    // (a hit up to 1 s before it began counts too: its invulnerability could have carried the hero through, which is no dodge)
    if (!g.in || hurtAt >= g.born - 1 || P.dead || G.S.trans || G.time - dodgeAt < 0.6) return;
    dodgeAt = G.time;
    Fx.text(P.x, P.y - 98, '회피!', '#b4ffdc', 19);
    Fx.burst(P.x, P.y - 44, 8, ['#d8fff0', '#ffffff', '#8ff0c0'], { type: 'star', s0: 60, s1: 200, g: -140, l0: 0.3, l1: 0.6, z0: 3, z1: 6, add: true });
    sfx('star', { vol: 0.6, rate: 1.3 });
  }
  Hz.update = function (dt) {
    const P = G.P, map = G.map;
    for (let i = hz.length - 1; i >= 0; i--) {
      const o = hz[i];
      let dead = false;
      G.src = o.src || null;
      o.t += o.m && o.m.slowT > 0 && o.t < o.dur ? dt * 0.55 : dt; // (a telegraph runs at its boss's pace until the hit)
      if (o.type === 'warn') {
        const [a, b] = warnSpan(o);
        if (o.grp && !P.dead && o.t < o.dur + o.keep + 0.05 && b > a && inWarn(o, a, b)) o.grp.in = true;
        if (o.t >= o.dur + o.keep + o.hold) dead = true;
      } else if (o.type === 'shock') {
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
      if (dead) { hz.splice(i, 1); if (o.grp && --o.grp.n <= 0) judge(o.grp); }
    }
    G.src = null;
  };
  // telegraphs lie on the floor, under the characters (world.js draws them before the monsters and the hero)
  const WR = '#ff3a4c';
  function drawWarn(ctx, o, now) {
    const [a, b] = warnSpan(o), w = b - a;
    if (w < 2) return;
    const k = U.sat(o.t / o.dur), live = o.t >= o.dur, end = o.dur + o.keep;
    let al = Math.min(1, o.t / 0.08);
    if (o.t > end) al *= 1 - U.sat((o.t - end) / o.hold);
    if (al <= 0.01) return;
    const y = o.y, hh = o.lane ? 6 : 12, r = hh, pulse = 0.5 + 0.5 * Math.sin(now * (12 + 22 * k));
    ctx.save();
    ctx.globalAlpha = al;
    if (!o.lane) { // the danger rising from the floor up to the height the hit reaches, with bright side edges (where safety starts)
      const H = o.h, g = ctx.createLinearGradient(0, y, 0, y - H);
      g.addColorStop(0, A.rgba(WR, live ? 0.55 : 0.3 + 0.25 * k)); g.addColorStop(0.55, A.rgba(WR, live ? 0.24 : 0.12 + 0.12 * k)); g.addColorStop(1, A.rgba(WR, 0));
      ctx.fillStyle = g; ctx.fillRect(a, y - H, w, H);
      const gd = ctx.createLinearGradient(0, y, 0, y - H), ge = ctx.createLinearGradient(0, y, 0, y - H);
      gd.addColorStop(0, A.rgba(A.OUT, 0.55)); gd.addColorStop(1, A.rgba(A.OUT, 0));
      ge.addColorStop(0, A.rgba('#ff8a96', 0.75 + 0.25 * pulse)); ge.addColorStop(1, A.rgba('#ff8a96', 0));
      ctx.fillStyle = gd; ctx.fillRect(a - 1.5, y - H, 6, H); ctx.fillRect(b - 4.5, y - H, 6, H); // dark rim (reads on red canyons too)
      ctx.fillStyle = ge; ctx.fillRect(a, y - H, 3, H); ctx.fillRect(b - 3, y - H, 3, H);
      // its ceiling: how high the hit reaches (a low zone can be hopped)
      ctx.save(); ctx.setLineDash([10, 7]); ctx.lineDashOffset = -now * 30; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(a + 2, y - H); ctx.lineTo(b - 2, y - H);
      ctx.lineWidth = 4.4; ctx.strokeStyle = A.rgba(A.OUT, 0.35); ctx.stroke();
      ctx.lineWidth = 2.2; ctx.strokeStyle = A.rgba('#ff9aa4', 0.5 + 0.35 * pulse); ctx.stroke();
      ctx.restore();
    }
    A.rr(ctx, a, y - hh, w, hh * 2, r); ctx.fillStyle = A.rgba(WR, o.lane ? 0.24 : 0.3); ctx.fill();
    // the fill: grows from the origin with a bright front — full = the hit lands
    let f0 = a, f1 = b;
    if (!live) { if (o.from === 'l') f1 = a + w * k; else if (o.from === 'r') f0 = b - w * k; else { const c = (a + b) / 2; f0 = c - (w / 2) * k; f1 = c + (w / 2) * k; } }
    if (f1 - f0 > 1) {
      A.rr(ctx, f0, y - hh, f1 - f0, hh * 2, Math.min(r, (f1 - f0) / 2)); ctx.fillStyle = A.rgba('#ff2e44', 0.92); ctx.fill();
      if (!live) { ctx.fillStyle = 'rgba(255,236,238,0.95)'; if (o.from !== 'r') ctx.fillRect(f1 - 2, y - hh, 3, hh * 2); if (o.from !== 'l') ctx.fillRect(f0 - 1, y - hh, 3, hh * 2); }
    }
    A.rr(ctx, a, y - hh, w, hh * 2, r); ctx.lineWidth = o.lane ? 4.6 : 6; ctx.strokeStyle = A.rgba(A.OUT, 0.7); ctx.stroke(); // sticker outline like the art
    ctx.lineWidth = o.lane ? 2.2 : 3; ctx.strokeStyle = A.rgba('#ffb0b8', 0.55 + 0.45 * pulse); ctx.stroke();
    if (o.dir === 1 || o.dir === -1) { // chevrons: which way the wave / charge runs
      ctx.save(); ctx.beginPath(); ctx.rect(a, y - 20, w, 40); ctx.clip();
      const sp = 44, s = hh + 1, ph = (now * 120) % sp;
      ctx.beginPath();
      for (let x = o.dir > 0 ? a + ph - sp : b - ph + sp; o.dir > 0 ? x < b + s : x > a - s; x += o.dir * sp) { ctx.moveTo(x - o.dir * s * 0.75, y - s); ctx.lineTo(x, y); ctx.lineTo(x - o.dir * s * 0.75, y + s); }
      ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,232,236,0.8)'; ctx.stroke();
      ctx.restore();
    }
    if (live && o.t - o.dur < 0.16) { // the moment it lands: a white-hot flash
      const f = 1 - (o.t - o.dur) / 0.16;
      ctx.globalCompositeOperation = 'lighter';
      A.rr(ctx, a, y - hh - 2, w, hh * 2 + 4, r + 2); ctx.fillStyle = A.rgba('#ffd6da', 0.75 * f); ctx.fill();
      if (!o.lane) { const g2 = ctx.createLinearGradient(0, y, 0, y - o.h); g2.addColorStop(0, A.rgba('#ff8a94', 0.5 * f)); g2.addColorStop(1, A.rgba('#ff8a94', 0)); ctx.fillStyle = g2; ctx.fillRect(a, y - o.h, w, o.h); }
    }
    ctx.restore();
  }
  Hz.drawBack = function (ctx) { const now = G.time; for (const o of hz) if (o.type === 'warn') drawWarn(ctx, o, now); };
  // is a live telegraph lying under this world-space box? (ui.js: the hotbar turns see-through over one — the floor sits above the
  // hotbar, but seen from a high platform an arena floor can sink behind it)
  Hz.warnUnder = function (x0, x1, y0) {
    for (const o of hz) {
      if (o.type !== 'warn' || o.t > o.dur + o.keep) continue;
      const [a, b] = warnSpan(o);
      if (b > x0 && a < x1 && o.y + 12 > y0) return true;
    }
    return false;
  };
  // dark maps: a telegraph glows through the darkness (world.js lighting)
  Hz.lights = function (hole) {
    for (const o of hz) {
      if (o.type !== 'warn' || o.t > o.dur + o.keep + o.hold * 0.5) continue;
      const [a, b] = warnSpan(o), n = Math.max(1, Math.ceil((b - a) / 110));
      for (let i = 0; i < n; i++) hole(a + ((b - a) * (i + 0.5)) / n, o.y - 26, o.lane ? 80 : 100, o.lane ? 0.45 : 0.65);
    }
  };
  Hz.draw = function (ctx) {
    const t = G.time;
    for (const o of hz) {
      if (o.type === 'warn') continue; // (drawn under the characters: Hz.drawBack)
      ctx.save();
      if (o.type === 'shock') {
        ctx.translate(o.x, o.y); ctx.scale(o.dir, 1); ctx.globalAlpha = U.sat(o.left / 90);
        ctx.beginPath(); ctx.moveTo(-34, 0); ctx.quadraticCurveTo(-8, -12, 6, -54); ctx.quadraticCurveTo(14, -18, 28, 0); ctx.closePath();
        A.fs(ctx, o.col, 2.6);
        ctx.beginPath(); ctx.moveTo(-14, -4); ctx.quadraticCurveTo(0, -12, 5, -34); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
      } else if (o.type === 'fall') {
        const k = U.sat(o.t / o.delay), red = '#ff6a5a'; // (every floor warning is red — poison and dark ones too)
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
          A.ell(ctx, 0, 0, o.w * 0.6, 8); ctx.fillStyle = '#ff5a5a'; ctx.fill(); // red like every floor warning
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
  // A piece of gear shows its grade the moment it lands: a light column in its rarity colour shoots up — taller, wider and brighter
  // with every grade (일반 a short pale glint · 고급 · 희귀 · 영웅 · 전설 a golden column up past the top of the screen) — and each grade
  // has a landing sound of its own (audio.js loot0 ~ loot4). 전설 holds the world still for a beat (hit-stop, then a moment of slow
  // motion) while its column erupts — that part is drawn on the real clock so it moves through the freeze.
  // Over a resting piece: NEW (a kind of gear never owned before — P.seen, game.js Inv.see) and ▲ with the 전투력 it would add if worn.
  // The rarer the piece, the longer it waits before flying to the hero, so its column is seen even when it lands right at your feet.
  const Dr = (G.Drops = {});
  // h: column height · w: half width · band: the column's colour (a vivid take on the rarity colour, so it reads on a bright sky)
  // a: its alpha · core: white core alpha · rise: seconds to full height · sp: sparkles / s · ring: landing ring radius
  // light: light radius on dark maps · wait: seconds before it flies to the hero
  const LOOT = [
    { h: 80, w: 9, band: '#9ea3bb', a: 0.6, core: 0.3, rise: 0.16, sp: 0, ring: 0, light: 60, wait: 0.25 },
    { h: 150, w: 13, band: '#3cc95a', a: 0.7, core: 0.36, rise: 0.2, sp: 2, ring: 44, light: 90, wait: 0.3 },
    { h: 260, w: 16, band: '#3d8bff', a: 0.72, core: 0.45, rise: 0.26, sp: 5, ring: 68, light: 130, wait: 0.6 },
    { h: 400, w: 19, band: '#a855ff', a: 0.74, core: 0.55, rise: 0.32, sp: 9, ring: 100, light: 170, wait: 1.0 },
    { h: 720, w: 25, band: '#ff9f1c', a: 0.78, core: 0.68, rise: 0.4, sp: 18, ring: 150, light: 240, wait: 2.0 },
  ];
  Dr.LOOT = LOOT;
  Dr.wait = (d) => (d.eq ? LOOT[d.r].wait : 0.25); // seconds a resting piece stays put before it can be picked up (hero or 초롱이)
  Dr.gold = (x, y, amt, gy) => G.drops.push({ kind: 'gold', amt, x, y, vx: U.rand(-130, 130), vy: U.rand(-520, -380), gy, t: 0, state: 'fly' });
  Dr.item = (x, y, item, gy) => {
    const b = D.ITEMS[item.b], eq = !!b && D.isEquip(b);
    return G.drops.push({ kind: 'item', item, eq, r: eq ? U.clamp(item.rar || 0, 0, 4) : 0, x, y, vx: U.rand(-150, 150), vy: U.rand(-560, -400), gy, t: 0, state: 'fly' });
  };
  let fullMsgT = 0;
  // the moment a piece of gear touches down
  function land(d) {
    d.chimed = true; d.landAt = G.time;
    if (!d.eq) return;
    const r = d.r, L = LOOT[r], col = D.RAR[r].color;
    sfx('loot' + r);
    if (r >= 1) {
      Fx.ring(d.x, d.gy - 4, 6, L.ring, col, 0.4 + r * 0.06, 3 + r, { flat: 0.3 });
      Fx.burst(d.x, d.gy - 18, 2 + r * 4, [col, '#ffffff'], { type: 'star', s0: 40, s1: 80 + r * 50, g: -60, l0: 0.4, l1: 0.7 + r * 0.12, z0: 3, z1: 4 + r * 1.5, add: true });
    } else Fx.burst(d.x, d.gy - 14, 3, ['#ffffff', col], { type: 'star', s0: 20, s1: 60, g: -40, l0: 0.3, l1: 0.5, z0: 2, z1: 3.5, add: true });
    if (r === 3) { G.shake(3, 0.2); Fx.ring(d.x, d.y, 8, 110, '#f0dcff', 0.4, 4); }
    if (r === 4) {
      G.hitStop = Math.max(G.hitStop || 0, 0.22); // the world holds still for a beat while the column erupts…
      G.slowmo = Math.max(G.slowmo || 0, 0.55);   // …and comes back in slow motion
      G.shake(8, 0.5); Fx.flash('#fff1c8', 0.3, 0.5);
      Fx.rays({ x: d.x, y: d.y + 40 }, '#ffcf6a', 1.8, 220);
      Fx.burst(d.x, d.gy - 30, 30, ['#ffb347', '#fff3c4', '#ffffff'], { type: 'star', s0: 120, s1: 520, g: -30, drag: 1.6, l0: 0.7, l1: 1.4, z0: 4, z1: 10, add: true });
    }
  }
  // 전투력 gained by wearing the piece (0: not an upgrade / can't be worn) — worked out again only when 전투력 or the level changes
  function upGain(d) {
    const P = G.P;
    if (d.upCp !== P.cp || d.upLv !== P.lv || d.upLine !== P.line) { d.upCp = P.cp; d.upLv = P.lv; d.upLine = P.line; const g = P.cpGain(d.item); d.up = g > 0 ? g : 0; }
    return d.up;
  }
  Dr.update = function (dt) {
    const P = G.P;
    if (fullMsgT > 0) fullMsgT -= dt;
    for (let i = G.drops.length - 1; i >= 0; i--) {
      const d = G.drops[i];
      d.t += dt;
      if (d.state === 'fly') {
        d.vy += 1700 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        d.x = U.clamp(d.x, 20, G.map.w - 20);
        // gear of 고급 and up leaves a trail of its colour on the way down
        if (d.eq && d.r >= 1 && Math.random() < dt * (6 + d.r * 7)) {
          Fx.p({ x: d.x + U.rand(-4, 4), y: d.y + U.rand(-4, 4), vx: U.rand(-20, 20), vy: U.rand(-30, 10), life: U.rand(0.25, 0.5), size: U.rand(2, 3 + d.r), color: d.r >= 2 && Math.random() < 0.4 ? '#ffffff' : D.RAR[d.r].color, type: d.r >= 2 ? 'star' : 'dot', add: true });
        }
        if (d.y >= d.gy - 12 && d.vy > 0) {
          d.y = d.gy - 12;
          if (d.vy > 260) { d.vy *= -0.35; d.vx *= 0.5; }
          else {
            d.state = 'rest'; d.t = 0;
            if (!d.chimed) land(d);
          }
        }
      } else if (d.state === 'rest') {
        if (d.full) { d.fullT -= dt; if (d.fullT <= 0) d.full = false; }
        const L = d.eq ? LOOT[d.r] : null;
        if (!P.dead && !d.full && d.t > Dr.wait(d) && Math.abs(d.x - P.x) < 74 && Math.abs(d.y - (P.y - 30)) < 80) d.state = 'magnet';
        if (d.t > 90) { G.drops.splice(i, 1); continue; }
        if (L && L.sp && Math.random() < dt * L.sp) { // sparkles rising along the column
          Fx.p({ x: d.x + U.rand(-L.w, L.w) * 0.6, y: d.gy - U.rand(0, L.h * 0.5), vy: -U.rand(50, 130), life: U.rand(0.5, 1.1), size: U.rand(2, 3.5 + d.r * 0.5), color: Math.random() < 0.35 ? '#ffffff' : D.RAR[d.r].color, type: 'star', add: true });
        }
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
            continue;
          }
          const isNew = G.Inv.isNew(d.item); // (asked before the bag takes it: taking it marks the kind as seen)
          if (G.Inv.addItem(d.item)) {
            sfx('pickup');
            if (d.eq && d.r >= 2) { // 희귀+: a burst of its colour on the hero (the 획득 notice and its jingle: ui.js)
              const col = D.RAR[d.r].color;
              Fx.burst(P.x, P.y - 44, 4 + d.r * 4, [col, '#ffffff'], { type: 'star', s0: 60, s1: 140 + d.r * 45, g: -120, l0: 0.4, l1: 0.9, z0: 3, z1: 5 + d.r, add: true });
              if (d.r === 4) Fx.rays(P, '#ffcf6a', 1.4, 170);
            }
            G.emit('loot', d.item, isNew);
            if (d.eq) P.hint('equip');
            G.drops.splice(i, 1);
          } else {
            d.state = 'rest'; d.ms = 0; d.full = true; d.fullT = 4; d.y = d.gy - 12;
            if (fullMsgT <= 0) { fullMsgT = 3; G.emit('msg', '가방이 가득 찼습니다.', 'warn'); sfx('error'); }
          }
        }
      }
    }
  };
  // a soft-edged column of light in one colour (bright at the foot, gone at the top), drawn once per colour and stretched
  const beams = {};
  function beam(col) {
    let c = beams[col];
    if (c) return c;
    c = document.createElement('canvas'); c.width = 32; c.height = 128;
    const g = c.getContext('2d'), im = g.createImageData(32, 128), n = parseInt(col.slice(1), 16);
    for (let y = 0; y < 128; y++) {
      const v = Math.pow(y / 127, 0.85);
      for (let x = 0; x < 32; x++) {
        const u = (x - 15.5) / 16, e = Math.max(0, 1 - u * u), i = (y * 32 + x) * 4;
        im.data[i] = (n >> 16) & 255; im.data[i + 1] = (n >> 8) & 255; im.data[i + 2] = n & 255; im.data[i + 3] = Math.round(Math.pow(e, 1.5) * v * 255);
      }
    }
    g.putImageData(im, 0, 0);
    return (beams[col] = c);
  }
  // spokes of light turning behind 영웅 · 전설 gear
  function spokes(ctx, x, y, col, n, R, rot, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = A.rgba(col, a);
    for (let i = 0; i < n; i++) { ctx.rotate(TAU / n); ctx.beginPath(); ctx.moveTo(-3.2, -9); ctx.lineTo(0, -R); ctx.lineTo(3.2, -9); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  // the column (rises from the ground when the piece lands)
  function column(ctx, d, t) {
    const r = d.r, L = LOOT[r], col = D.RAR[r].color, k = U.ease.outCubic(U.sat((t - d.landAt) / L.rise));
    if (k <= 0) return;
    const pulse = 0.86 + 0.14 * Math.sin(t * 4 + d.x), h = L.h * k, w = L.w * (1 + 0.7 * (1 - k)), gy = d.gy;
    ctx.save();
    ctx.save(); ctx.translate(d.x, gy - 2); ctx.scale(1, 0.3); A.glow(ctx, 0, 0, L.w * 3.4 + 12, col, 0.6 * pulse); ctx.restore(); // pool of light on the ground
    // a haze and a translucent band in a vivid take on the rarity colour (they read on a bright sky) with a thin white core added on
    // top (it reads in the dark)
    ctx.globalAlpha = 0.24 * pulse; ctx.drawImage(beam(col), d.x - w * 2.4, gy - h * 0.8, w * 4.8, h * 0.8);
    ctx.globalAlpha = L.a * pulse; ctx.drawImage(beam(L.band), d.x - w, gy - h, w * 2, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = L.core * pulse; ctx.drawImage(beam('#ffffff'), d.x - w * 0.25, gy - h * 0.94, w * 0.5, h * 0.94);
    ctx.globalAlpha = 1;
    if (r >= 2) { // 희귀+: a glint running up the column, again and again
      const s = (t * (0.5 + r * 0.12) + (d.x % 97) / 97) % 1;
      A.glow(ctx, d.x, gy - h * s, w * (1.6 + r * 0.2), '#ffffff', (1 - s) * 0.55 * k);
    }
    if (r === 4) { // 전설: the eruption — a burst of light up the column and shock rings, on the real clock (they move through the freeze)
      const e = (t - d.landAt) / 0.9;
      if (e < 1) {
        const q = U.ease.outCubic(e), a = 1 - e, R = 30 + 300 * q;
        ctx.globalAlpha = a * 0.85; ctx.drawImage(beam('#ffe9a8'), d.x - 70 * (1 - q * 0.6), gy - 760, 140 * (1 - q * 0.6), 760);
        ctx.globalAlpha = a; ctx.lineWidth = 2 + 10 * a; ctx.strokeStyle = '#ffd27a';
        ctx.beginPath(); ctx.ellipse(d.x, gy, R, R * 0.28, 0, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1 + 6 * a; ctx.strokeStyle = '#fff3c4';
        ctx.beginPath(); ctx.arc(d.x, d.y, 20 + 170 * q, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1; A.glow(ctx, d.x, d.y, 170 * (1 - e * 0.5), '#ffcf6a', a);
      }
    }
    ctx.restore();
  }
  Dr.draw = function (ctx) {
    const t = G.time;
    for (const d of G.drops) {
      const bob = d.state === 'rest' ? Math.sin(t * 3 + d.x * 0.1) * 3 : 0, y = d.y + bob;
      if (d.state === 'rest' && d.t > 80 && ((t * 8) | 0) % 2) continue;
      if (d.state !== 'fly') A.shadow(ctx, d.x, d.gy, 9, 0.2);
      let key = 'gold', glow = '#ffd84a', sz = 26;
      if (d.kind === 'gold') { key = d.amt >= 80 ? 'gold_pile' : 'gold'; sz = d.amt >= 80 ? 30 : 22; }
      else {
        key = D.ITEMS[d.item.b].icon; sz = 30;
        glow = d.eq ? D.RAR[d.r].color : null;
        if (d.state === 'rest' && d.eq) column(ctx, d, t);
        if (d.eq && d.r >= 3 && d.state !== 'fly') spokes(ctx, d.x, y, glow, d.r === 4 ? 14 : 10, d.r === 4 ? 46 : 34, t * (d.r === 4 ? 1.1 : 0.8), d.r === 4 ? 0.5 : 0.36);
      }
      if (glow) A.glow(ctx, d.x, y, d.kind === 'gold' ? 16 : (d.r === 4 ? 36 : 22 + d.r * 2) + Math.sin(t * 5) * 3, glow, d.kind === 'gold' ? 0.35 : d.r ? 0.7 : 0.4);
      if (A.drawIcon) A.drawIcon(ctx, key, d.x, y, sz);
      else { A.ell(ctx, d.x, y, sz * 0.36); A.fs(ctx, d.kind === 'gold' ? '#ffd84a' : '#c8b8ff', 2); }
    }
  };
  // NEW · ▲ 전투력 over resting gear — drawn with the world's labels (after the dark maps' shade, so they always read)
  function pill(ctx, x, y, str, bg, fg) { // x: left edge · returns the width
    const w = ctx.measureText(str).width + 11;
    A.rr(ctx, x, y - 8.5, w, 17, 8.5); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = A.OUT; ctx.stroke();
    ctx.fillStyle = fg; ctx.fillText(str, x + 5.5, y + 0.5);
    return w;
  }
  Dr.drawOverlay = function (ctx) {
    const t = G.time, P = G.P, placed = [];
    ctx.save(); // (font · alignment stay ours)
    for (const d of G.drops) {
      if (!d.eq || d.state !== 'rest' || (d.t > 80 && ((t * 8) | 0) % 2)) continue;
      const isNew = !(P.seen && P.seen[d.item.b]), up = upGain(d);
      if (!isNew && !up) continue;
      const a = isNew ? 'NEW' : '', b = up ? '▲ ' + U.fmt(up) : '';
      ctx.font = '900 11px ' + A.FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const wa = a ? ctx.measureText(a).width + 11 : 0, wb = b ? ctx.measureText(b).width + 11 : 0, W = wa + wb + (a && b ? 3 : 0);
      const pop = U.sat((t - d.landAt) / 0.22), sc = pop < 1 ? 1 + 0.5 * (1 - U.ease.outBack(pop)) : 1;
      let y = d.y + Math.sin(t * 3 + d.x * 0.1) * 3 - 30;
      // pieces lying close together: each row of pills steps up over the one it would cover
      for (let k = 0; k < 6 && placed.some((q) => d.x - W / 2 < q[1] + 3 && d.x + W / 2 > q[0] - 3 && Math.abs(y - q[2]) < 18); k++) y -= 20;
      placed.push([d.x - W / 2, d.x + W / 2, y]);
      ctx.save(); ctx.translate(d.x, y); ctx.scale(sc, sc); ctx.globalAlpha = Math.min(1, pop * 2);
      let x = -W / 2;
      if (a) x += pill(ctx, x, 0, a, '#ff3d6e', '#ffffff') + 3;
      if (b) pill(ctx, x, 0, b, '#2c9e46', '#eaffdf');
      ctx.restore();
    }
    ctx.restore();
  };
  // dark maps: gear lights up the dark around it, and a tall column lights its way up
  Dr.lights = function (hole) {
    const t = G.time;
    for (const d of G.drops) {
      if (!d.eq || d.state === 'magnet') continue;
      const L = LOOT[d.r];
      hole(d.x, d.y, L.light * (d.state === 'fly' ? 0.6 : 1), 0.8);
      if (d.state !== 'rest' || d.r < 2) continue;
      const h = L.h * U.ease.outCubic(U.sat((t - d.landAt) / L.rise));
      for (let yy = 110; yy < h * 0.85; yy += 110) hole(d.x, d.gy - yy, L.w * 5, 0.5);
    }
  };
})();
