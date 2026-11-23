'use strict';
/* 등불지기 — monsters: entities, AI archetypes, boss patterns, spawns, kills & drops */
(function () {
  const G = window.G, U = G.U, A = G.Art, D = G.D, Fx = G.Fx, Hz = G.Haz, Pr = G.Proj, Dr = G.Drops, P = G.P;
  const Mn = (G.Mon = {});
  const TAU = Math.PI * 2, clamp = U.clamp;
  const sfx = (n, o) => { if (G.Audio) G.Audio.sfx(n, o); };

  Mn.make = function (id, x, y, home, opts) {
    const def = D.MON[id], st = D.monStat(def);
    const m = {
      id, def, name: def.name, lv: def.lv, x, y, w: def.w, h: def.h, hp: st.hp, maxHp: st.hp, atk: st.atk, dfn: st.def, exp: st.exp, gold: st.gold,
      dir: U.chance(0.5) ? 1 : -1, state: 'idle', st: 0, p: 0, t: U.rand(0, 10), seed: (Math.random() * 1e6) | 0, home, vx: 0, vy: 0, air: false, kbx: 0, popY: 0, popV: 0,
      aggro: false, aggroT: 0, atkCd: U.rand(0.6, 1.6), atkDur: 1, atkName: 'atk', wander: U.rand(0.5, 2), moving: false, hopCd: U.rand(0.2, 1.5),
      flash: 0, slowT: 0, hpShow: 0, numStack: 0, numT: 0, dead: false, deadT: 0, spawnT: 0.5, boss: !!def.boss, fly: def.ai === 'fly' || def.ai === 'float' || !!def.fly, alt: 0, av: {},
      hitAt: -9, hitDir: 1, hitPow: 1, hitCrit: false, stopT: 0, popped: false, lagFrom: st.hp, lagAt: -9,
    };
    Object.assign(m, opts);
    G.mons.push(m);
    return m;
  };

  // ------------------------------------------------------------ spawns
  function spawnSlot(s, instant) {
    const def = D.MON[s.m];
    let x = U.rand(s.x1, s.x2);
    if (!instant) for (let i = 0; i < 4; i++) { const c = U.rand(s.x1, s.x2); if (Math.abs(c - P.x) > Math.abs(x - P.x)) x = c; }
    const alt = def.ai === 'fly' ? U.rand(64, 118) : def.ai === 'float' ? U.rand(44, 78) : 0;
    const m = Mn.make(s.m, x, s.y - alt, { x1: s.x1, x2: s.x2, y: s.y }, { slot: s, alt, spawnT: instant ? 0 : 0.5 });
    s.ent = m;
    if (!instant) Fx.burst(x, m.y - def.h / 2, 7, '#ffffff', { type: 'smoke', s0: 20, s1: 90, g: -40, z0: 8, z1: 16, l0: 0.3, l1: 0.6 });
  }
  Mn.fillSpawns = function () { for (const s of G.map.spawns) spawnSlot(s, true); };
  function updateSpawns(dt) {
    for (const s of G.map.spawns) if (!s.ent) { s.timer -= dt; if (s.timer <= 0) spawnSlot(s, false); }
  }

  // ------------------------------------------------------------ helpers
  const step = (m, d, spd, dt) => {
    const h = m.home;
    m.x += d * spd * dt;
    if (m.x < h.x1) { m.x = h.x1; return false; }
    if (m.x > h.x2) { m.x = h.x2; return false; }
    return true;
  };
  function wanderWalk(m, dt, spd) {
    m.wander -= dt;
    if (m.wander <= 0) { m.wander = U.rand(1.2, 3.6); m.moving = U.chance(0.62); if (U.chance(0.4)) m.dir *= -1; }
    if (m.moving) { m.state = 'move'; if (!step(m, m.dir, spd, dt)) m.dir *= -1; } else m.state = 'idle';
  }
  function startAttack(m, dur, name) { m.state = 'attack'; m.st = 0; m.p = 0; m.atkDur = dur; m.atkName = name || 'atk'; m.av = {}; }
  const pBox = (x, y, w, h) => x < P.x + 13 && x + w > P.x - 13 && y < P.y && y + h > P.y - 64;
  const frontHit = (m, reach, hgt, mul, o) => {
    const x = m.dir > 0 ? m.x : m.x - reach;
    if (pBox(x, m.y - hgt, reach, hgt + 6)) return P.hurt(m.atk * mul, m.x, o);
    return false;
  };
  function muzzle(m) {
    const an = A.MANCHOR && A.MANCHOR[m.id] && A.MANCHOR[m.id].muzzle;
    return an ? [m.x + an[0] * m.dir, m.y + an[1]] : [m.x + m.dir * m.w * 0.4, m.y - m.h * 0.62];
  }
  const gyAt = (m, x) => { const s = G.World.groundBelow(x, Math.min(P.y, m.home.y) - 24); return s ? s.y : m.home.y; };
  function ballistic(x, y, tx, ty, T, g) { return [(tx - x) / T, (ty - y) / T - (g * T) / 2]; }
  function fire(m) {
    const [x, y] = muzzle(m), kind = m.def.proj, dmg = m.atk, tx = P.x, ty = P.y - 36;
    const ang = Math.atan2(ty - y, tx - x), cs = Math.cos(ang), sn = Math.sin(ang);
    switch (kind) {
      case 'thorn': Pr.spawn({ own: 'm', kind, x, y, vx: cs * 430, vy: sn * 430, dmg, r: 8, life: 1.7, col: '#4f9a4a' }); break;
      case 'bubble': Pr.spawn({ own: 'm', kind, x, y, vx: cs * 215, vy: sn * 215, dmg, r: 14, life: 3, ghost: true, col: '#8cebe1' }); break;
      case 'darkorb': Pr.spawn({ own: 'm', kind, x, y, vx: cs * 250, vy: sn * 250, dmg, r: 12, life: 3.2, homing: 0.25, homeT: 1.5, ghost: true, light: 60 }); break;
      case 'ice': Pr.spawn({ own: 'm', kind, x, y, vx: cs * 500, vy: sn * 500, dmg, r: 10, life: 1.8, slow: 1.5, col: '#a8dcf6' }); break;
      case 'snowball': { const T = clamp(Math.abs(tx - x) / 430, 0.45, 1.1), v = ballistic(x, y, tx, ty, T, 950); Pr.spawn({ own: 'm', kind, x, y, vx: v[0], vy: v[1], g: 950, dmg, r: 11, life: 3, gy: m.home.y, col: '#f6fbff' }); break; }
      default: Pr.spawn({ own: 'm', kind: 'seed', x, y, vx: cs * 300, vy: sn * 300, dmg, r: 9, life: 2 });
    }
    sfx('mon_shoot', { vol: 0.7 });
  }
  function shootAttack(m, dt) {
    m.st += dt;
    const p0 = m.p; m.p = m.st / m.atkDur;
    if (p0 < 0.5 && m.p >= 0.5) fire(m);
    if (m.p >= 1) { m.state = 'idle'; m.p = 0; m.atkCd = U.rand(1.7, 2.9); }
  }

  // ------------------------------------------------------------ AI archetypes
  const AI = {};
  AI.dummy = function (m) { m.state = m.flash > 0 ? 'hit' : 'idle'; m.p = 1 - m.flash / 0.12; };
  AI.walk = function (m, dt) {
    if (m.aggro) {
      const dx = P.x - m.x;
      if (Math.abs(dx) > 14) { m.dir = Math.sign(dx); m.state = 'move'; step(m, m.dir, m.def.spd * 1.25, dt); } else m.state = 'idle';
    } else wanderWalk(m, dt, m.def.spd);
  };
  AI.hop = function (m, dt) {
    const h = m.home, def = m.def;
    if (m.state === 'attack') return shootAttack(m, dt);
    if (m.air) {
      m.vy += 1500 * dt; m.y += m.vy * dt; m.x = clamp(m.x + m.vx * dt, h.x1, h.x2);
      if (m.y >= h.y && m.vy > 0) { m.y = h.y; m.air = false; m.vy = 0; m.hopCd = U.rand(0.35, 0.9) * (m.aggro ? 0.6 : 1.5); }
      m.state = 'move';
      return;
    }
    m.hopCd -= dt;
    if (def.proj && m.aggro && m.atkCd <= 0 && Math.abs(P.x - m.x) < 430 && Math.abs(P.y - m.y) < 130) { m.dir = Math.sign(P.x - m.x) || 1; startAttack(m, 0.85); return; }
    if (m.hopCd <= 0) {
      if (m.aggro) m.dir = Math.sign(P.x - m.x) || 1;
      else {
        if (U.chance(0.3)) m.dir *= -1;
        if (U.chance(0.35)) { m.hopCd = U.rand(0.8, 2); m.state = 'idle'; return; }
        if ((m.dir < 0 && m.x <= h.x1 + 6) || (m.dir > 0 && m.x >= h.x2 - 6)) m.dir *= -1;
      }
      m.air = true; m.vy = -U.rand(330, 430); m.vx = m.dir * def.spd * 2.4;
    }
    m.state = m.hopCd < 0.22 ? 'move' : 'idle';
  };
  AI.lunge = function (m, dt) {
    if (m.state === 'attack') {
      m.st += dt;
      const p0 = m.p; m.p = m.st / m.atkDur;
      if (p0 < 0.5 && m.p >= 0.5) { step(m, m.dir, 26, 1); frontHit(m, m.w * 0.5 + 62, m.h + 12, 1.15); sfx('swing2', { vol: 0.45, rate: 0.9 }); }
      if (m.p >= 1) { m.state = 'idle'; m.p = 0; m.atkCd = U.rand(1.2, 2.2); }
      return;
    }
    if (m.aggro) {
      const dx = P.x - m.x, adx = Math.abs(dx);
      if (adx < m.w * 0.5 + 54 && Math.abs(P.y - m.y) < 76 && m.atkCd <= 0) { m.dir = Math.sign(dx) || 1; startAttack(m, 0.78); return; }
      if (adx > m.w * 0.5 + 30) { m.dir = Math.sign(dx); m.state = 'move'; step(m, m.dir, m.def.spd * 1.3, dt); } else { m.state = 'idle'; if (adx > 6) m.dir = Math.sign(dx); }
    } else wanderWalk(m, dt, m.def.spd);
  };
  AI.shoot = function (m, dt) {
    if (m.state === 'attack') return shootAttack(m, dt);
    if (m.aggro) {
      const dx = P.x - m.x, adx = Math.abs(dx), sg = Math.sign(dx) || 1;
      m.dir = sg;
      if (adx < 480 && Math.abs(P.y - m.y) < 210 && m.atkCd <= 0) { startAttack(m, 0.9); return; }
      if (adx < 170) { m.state = 'move'; step(m, -sg, m.def.spd, dt); }
      else if (adx > 390) { m.state = 'move'; step(m, sg, m.def.spd, dt); }
      else m.state = 'idle';
    } else wanderWalk(m, dt, m.def.spd);
  };
  AI.still = function (m, dt) {
    if (m.state === 'attack') return shootAttack(m, dt);
    m.state = 'idle';
    if (m.aggro) {
      const dx = P.x - m.x;
      m.dir = Math.sign(dx) || 1;
      if (Math.abs(dx) < 500 && Math.abs(P.y - m.y) < 240 && m.atkCd <= 0) startAttack(m, 0.95);
    }
  };
  AI.fly = function (m, dt) {
    const h = m.home, def = m.def, baseY = h.y - m.alt;
    if (m.state === 'attack') {
      m.st += dt; m.p = m.st / m.atkDur;
      if (m.p < 0.35) m.y += (baseY - 30 - m.y) * Math.min(1, dt * 6);
      else {
        if (!m.av.sw) {
          const x2 = clamp(P.x + m.dir * 130, h.x1 - 80, h.x2 + 80);
          m.av.sw = { x0: m.x, y0: m.y, x2, y1: Math.min(h.y - 6, P.y - 8) };
          m.touchMul = 1.1; sfx('swing', { vol: 0.4, rate: 1.4 });
        }
        const k = U.sat((m.p - 0.35) / 0.65), s = m.av.sw;
        m.x = U.lerp(s.x0, s.x2, U.ease.inOutQuad(k)); m.y = s.y0 + (s.y1 - s.y0) * Math.sin(k * Math.PI);
      }
      if (m.p >= 1) { m.state = 'move'; m.p = 0; m.atkCd = U.rand(2, 3.6); m.touchMul = 0; }
      return;
    }
    m.state = 'move';
    const bob = Math.sin(m.t * 2.4) * 10;
    if (m.id === 'glowmoth') m.x += Math.sin(m.t * 5.2) * 46 * dt;
    if (m.aggro) {
      const dx = P.x - m.x;
      m.dir = Math.sign(dx) || 1;
      if (Math.abs(dx) > 150) m.x += m.dir * def.spd * dt;
      m.x = clamp(m.x, h.x1 - 60, h.x2 + 60);
      const wantY = clamp(P.y - 84, h.y - 280, h.y - 56);
      m.y += (wantY + bob - m.y) * Math.min(1, dt * 2);
      if (m.atkCd <= 0 && Math.abs(dx) < 340 && Math.abs(P.y - m.y) < 280) { m.dir = Math.sign(dx) || 1; startAttack(m, 1.25); }
    } else {
      m.wander -= dt;
      if (m.wander <= 0) { m.wander = U.rand(1.5, 4); if (U.chance(0.5)) m.dir *= -1; }
      m.x += m.dir * def.spd * 0.45 * dt;
      if (m.x < h.x1) { m.x = h.x1; m.dir = 1; } else if (m.x > h.x2) { m.x = h.x2; m.dir = -1; }
      m.y += (baseY + bob - m.y) * Math.min(1, dt * 3);
    }
  };
  AI.float = function (m, dt) {
    const h = m.home, def = m.def;
    if (m.state === 'attack') return shootAttack(m, dt);
    m.y += (h.y - m.alt + Math.sin(m.t * 2) * 8 - m.y) * Math.min(1, dt * 3);
    m.state = 'move';
    if (m.aggro) {
      const dx = P.x - m.x, adx = Math.abs(dx), sg = Math.sign(dx) || 1;
      m.dir = sg;
      if (adx < 480 && Math.abs(P.y - m.y) < 240 && m.atkCd <= 0) { startAttack(m, 1.0); return; }
      if (adx < 200) step(m, -sg, def.spd, dt); else if (adx > 370) step(m, sg, def.spd, dt);
    } else {
      m.wander -= dt;
      if (m.wander <= 0) { m.wander = U.rand(1.5, 4); if (U.chance(0.5)) m.dir *= -1; }
      if (!step(m, m.dir, def.spd * 0.4, dt)) m.dir *= -1;
    }
  };
  AI.charge = function (m, dt) {
    if (m.state === 'attack') {
      m.st += dt; m.p = m.st / m.atkDur;
      if (m.p >= 0.5) {
        m.touchMul = 1.3;
        if (!step(m, m.dir, 440, dt)) m.st = Math.max(m.st, m.atkDur * 0.93);
        if (Math.random() < dt * 30) Fx.dust(m.x - m.dir * m.w * 0.4, m.y, 1);
      }
      if (m.p >= 1) { m.state = 'idle'; m.p = 0; m.atkCd = U.rand(1.6, 2.6); m.touchMul = 0; }
      return;
    }
    if (m.aggro) {
      const dx = P.x - m.x, adx = Math.abs(dx);
      if (adx < 450 && Math.abs(P.y - m.y) < 64 && m.atkCd <= 0) { m.dir = Math.sign(dx) || 1; startAttack(m, 1.5); return; }
      if (adx > 70) { m.dir = Math.sign(dx); m.state = 'move'; step(m, m.dir, m.def.spd, dt); } else m.state = 'idle';
    } else wanderWalk(m, dt, m.def.spd);
  };

  // ------------------------------------------------------------ bosses
  const cross = (a, b, th) => a < th && b >= th;
  const minions = () => G.mons.filter((o) => o.minion && !o.dead).length;
  function summon(m, id, n, max) {
    for (let i = 0; i < n && minions() < max; i++) {
      const def = D.MON[id], h = m.home, x = clamp(m.x + U.rand(-220, 220), h.x1 - m.w / 2 + 30, h.x2 + m.w / 2 - 30);
      const alt = def.ai === 'fly' ? U.rand(70, 120) : def.ai === 'float' ? 60 : 0;
      Mn.make(id, x, h.y - alt, { x1: h.x1 - m.w / 2 + 20, x2: h.x2 + m.w / 2 - 20, y: h.y }, { minion: true, aggro: true, alt, spawnT: 0.5, exp: 0 });
      Fx.burst(x, h.y - alt - 20, 10, ['#b06aff', '#ffffff'], { s0: 40, s1: 200, l0: 0.3, l1: 0.6, add: true });
    }
    sfx('buff', { rate: 0.7 });
  }
  function shocks(m, mul, o) {
    const lim = [m.home.x1 - m.w / 2, m.home.x2 + m.w / 2];
    Hz.shock(m.x + 30, m.home.y, 1, m.atk * mul, Object.assign({ lim }, o));
    Hz.shock(m.x - 30, m.home.y, -1, m.atk * mul, Object.assign({ lim }, o));
  }
  function slamFx(m, big) {
    G.shake(big ? 14 : 9, big ? 0.4 : 0.3); sfx('boss_slam');
    Fx.dust(m.x, m.home.y, 12); Fx.ring(m.x, m.home.y - 4, 20, m.w * 1.1, '#fff3d0', 0.4, 8, { flat: 0.28 });
  }
  // ---- red floor telegraphs (combat.js Hz.warn) for the big hits. Each zone lies exactly over that attack's hit box and shows up
  // early enough to get out of it: when its fill is full, the hit lands. One dodge group per strike.
  const lead = (m, th) => Math.max(0.05, (th - m.p) * m.atkDur); // s until the attack reaches progress th
  function strike(m) { sfx('warning', { vol: 0.75, rate: 0.85 }); P.hint('tele'); const g = Hz.group(); if (m) m.av.g = g; return g; }
  // in front of the boss, from its centre out to `reach` (the box frontHit tests)
  function warnFront(m, th, reach, hgt, g) {
    const x1 = m.dir > 0 ? m.x : m.x - reach;
    Hz.warn({ x1, x2: x1 + reach, y: m.home.y, h: hgt + 6, dur: lead(m, th), from: m.dir > 0 ? 'l' : 'r', m, grp: g });
  }
  // a patch centred on x: a landing spot, a blast (no owner `m` for projectiles — they fly on the real clock)
  function warnAt(x, y, r, hgt, dur, g, m) { Hz.warn({ x1: x - r, x2: x + r, y, h: hgt, dur, from: 'c', m, grp: g }); }
  // the two lanes shocks() sends out from x: `left` px each way or up to the arena wall. Jump them; the near end follows the wave
  function warnShocks(m, x, dur, spd, left, g) {
    const lo = m.home.x1 - m.w / 2, hi = m.home.x2 + m.w / 2;
    for (const d of [1, -1]) {
      const x0 = x + d * 30, far = clamp(x0 + d * left, lo, hi), back = x0 - d * 20;
      if ((far - back) * d < 30) continue;
      Hz.warn({ x1: Math.min(back, far), x2: Math.max(back, far), y: m.home.y, h: 46, dur, keep: Math.abs(far - x0) / spd, hold: 0.12, lane: true, dir: d, from: d > 0 ? 'l' : 'r',
        near: (o) => back + d * spd * (o.t - o.dur), m, grp: g });
    }
  }
  // a charge / roll: from the boss's back to where it stops (the arena wall, or as far as it gets in `run` s); shrinks behind it
  function warnRun(m, d, th, spd, run, g, dur) {
    const end = clamp(m.x + d * spd * run, m.home.x1, m.home.x2), back = m.x - (d * m.w) / 2, front = end + (d * m.w) / 2;
    Hz.warn({ x1: Math.min(back, front), x2: Math.max(back, front), y: m.home.y, h: m.h, dur: dur === undefined ? lead(m, th) : dur, keep: Math.abs(end - m.x) / spd, hold: 0.16,
      dir: d, from: d > 0 ? 'l' : 'r', near: () => m.x - (d * m.w) / 2, m, grp: g });
  }
  // 녹스 slash: the blade in front of him, and the crescent wave it sends along the floor (r 54, 620 px/s for 1.7 s — jump it)
  function slashWarn(m) {
    const g = strike(), d = m.dir, x0 = m.x + d * 80, back = x0 - d * 54, far = clamp(x0 + d * (620 * 1.7 + 54), 0, G.map.w);
    warnFront(m, 0.5, m.w * 0.5 + 130, 190, g);
    if ((far - back) * d > 30) Hz.warn({ x1: Math.min(back, far), x2: Math.max(back, far), y: m.home.y, h: 108, dur: lead(m, 0.5), keep: Math.min(1.7, Math.abs(far - x0) / 620), hold: 0.12,
      lane: true, dir: d, from: d > 0 ? 'l' : 'r', near: (o) => back + d * 620 * (o.t - o.dur), m, grp: g });
  }
  // generic leap: crouch until p=th, then jump onto the player's x; calls land() once. sh: [speed, reach] of the landing shockwaves
  function leap(m, dt, p0, p, th, land, sh) {
    const h = m.home, g = 2400;
    if (cross(p0, p, th)) {
      const v0 = 900, T = (2 * v0) / g, tx = clamp(P.x, h.x1, h.x2);
      m.air = true; m.vy = -v0; m.av.vx = (tx - m.x) / T;
      sfx('jump', { rate: 0.5 });
      // where it comes down (its body), and the two shockwaves that run out from there
      const gr = strike();
      warnAt(tx, h.y, m.w / 2, m.h, T, gr, m);
      if (sh) warnShocks(m, tx, T, sh[0], sh[1], gr);
    }
    if (m.air) {
      m.vy += g * dt; m.y += m.vy * dt; m.x = clamp(m.x + m.av.vx * dt, h.x1, h.x2);
      if (m.y >= h.y - m.alt && m.vy > 0) { m.y = h.y - m.alt; m.air = false; m.vy = 0; land(); }
    }
  }
  // g: the attack's dodge group (combat.js) — "회피!" only once these have landed too
  function fallsNear(m, n, kind, mul, o, g) {
    const h = m.home;
    for (let i = 0; i < n; i++) {
      const x = clamp(P.x + (i === 0 ? 0 : U.rand(-430, 430)), h.x1 - m.w / 2 + 30, h.x2 + m.w / 2 - 30);
      const f = Hz.fall(x, gyAt(m, x), 0.75 + i * 0.14, m.atk * mul, Object.assign({ kind }, o));
      if (g) { f.grp = g; g.n++; }
    }
  }
  // big hits whose red telegraph is timed by the attack's own pace: not sped up when the guardian is enraged (AI.boss)
  const FAIR = { roll: 1, charge: 1, toss: 1, stomp: 1, slam: 1, stab: 1, sweep: 1, burrow: 1, pound: 1, breath: 1, slash: 1, warp: 1 };
  // [duration, update(m, dt, p0, p), telegraph(m) at the start — the red floor zones of the big hits]
  const BOSS = {
    bosspuff: {
      hop: [1.5, (m, dt, p0, p) => leap(m, dt, p0, p, 0.25, () => {
        slamFx(m); shocks(m, 1.0);
        if (m.rage && !m.av.again) { m.av.again = true; m.st = m.atkDur * 0.2; m.p = 0.2; }
      }, [400, 460])],
      roll: [2.4, (m, dt, p0, p) => {
        if (p < 0.3) { m.av.d = m.dir; return; }
        if (p < 0.9) {
          m.touchMul = 1.3;
          if (!step(m, m.av.d, m.rage ? 620 : 520, dt)) {
            if (m.av.b) m.st = Math.max(m.st, m.atkDur * 0.9);
            else { m.av.b = true; m.av.d *= -1; m.dir = m.av.d; G.shake(6, 0.2); sfx('boss_slam', { vol: 0.6 }); warnRun(m, m.av.d, 0, m.rage ? 620 : 520, (0.9 - p) * m.atkDur, strike(), 0.2); } // (and back again)
          }
          if (Math.random() < dt * 40) Fx.dust(m.x - m.av.d * 40, m.home.y, 1);
        } else m.touchMul = 0;
      }, (m) => warnRun(m, m.dir, 0.3, m.rage ? 620 : 520, 0.6 * m.atkDur, strike())],
      puff: [1.7, (m, dt, p0, p) => {
        if (!cross(p0, p, 0.5)) return;
        const n = m.rage ? 7 : 5;
        for (let i = 0; i < n; i++) { const a = -Math.PI * (0.15 + (0.7 * i) / (n - 1)); Pr.spawn({ own: 'm', kind: 'seed', x: m.x, y: m.y - m.h * 0.6, vx: Math.cos(a) * 430, vy: Math.sin(a) * 520, g: 800, dmg: m.atk * 0.9, r: 12, life: 4, gy: m.home.y }); }
        Fx.burst(m.x, m.y - m.h * 0.5, 20, '#fffbe8', { s0: 100, s1: 400, type: 'smoke', z0: 8, z1: 18 });
        summon(m, 'puff', 2, m.rage ? 5 : 3); sfx('mon_shoot');
      }],
    },
    stag: {
      charge: [2.1, (m, dt, p0, p) => {
        if (p < 0.35) { m.av.d = m.dir; return; }
        if (p < 0.85) { m.touchMul = 1.4; if (!step(m, m.av.d, m.rage ? 760 : 640, dt)) { m.st = Math.max(m.st, m.atkDur * 0.86); G.shake(8, 0.25); sfx('boss_slam', { vol: 0.7 }); } if (Math.random() < dt * 40) Fx.dust(m.x - m.av.d * 60, m.home.y, 1); }
        else m.touchMul = 0;
      }, (m) => warnRun(m, m.dir, 0.35, m.rage ? 760 : 640, 0.5 * m.atkDur, strike())],
      // (1.0 → 1.6 s: the horn toss came 0.5 s after the wind-up started — too quick to step out of; now 0.8 s. The art is keyed to
      // the attack's progress, so it simply plays heavier)
      toss: [1.6, (m, dt, p0, p) => {
        if (!cross(p0, p, 0.5)) return;
        Fx.slash(m.x + m.dir * 60, m.y - 50, m.dir, { r: 120, a0: 1.2, a1: -1.6, col: '#ffffff', col2: '#c9b6ff', dur: 0.28, w: 0.5 });
        sfx('swing2', { rate: 0.7 });
        frontHit(m, m.w * 0.5 + 110, 170, 1.3, { up: 760, kb: 1.3 });
      }, (m) => warnFront(m, 0.5, m.w * 0.5 + 110, 170, strike())],
      stomp: [1.5, (m, dt, p0, p) => {
        if (!cross(p0, p, 0.5)) return;
        slamFx(m, true); shocks(m, 1.0, { spd: 430, left: 540 });
        fallsNear(m, m.rage ? 7 : 4, 'leaf', 0.9, { r: 40 }, m.av.g);
      }, (m) => warnShocks(m, m.x, lead(m, 0.5), 430, 540, strike(m))],
    },
    lotus: {
      bubbles: [2.4, (m, dt, p0, p) => {
        if (p < 0.2 || p > 0.9) return;
        m.av.t = (m.av.t || 0) - dt;
        if (m.av.t > 0) return;
        m.av.t = m.rage ? 0.16 : 0.24;
        const [x, y] = muzzle(m), a = Math.atan2(P.y - 36 - y, P.x - x) + U.rand(-0.28, 0.28);
        Pr.spawn({ own: 'm', kind: 'bubble', x, y, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, dmg: m.atk * 0.85, r: 15, life: 3.6, ghost: true });
        sfx('mon_shoot', { vol: 0.5, rate: 1.3 });
      }],
      rain: [2.6, (m, dt, p0, p) => {
        if (!cross(p0, p, 0.4)) return;
        const n = m.rage ? 12 : 8, h = m.home;
        for (let i = 0; i < n; i++) { const x = clamp(P.x + (i - n / 2) * 74 + U.rand(-30, 30), h.x1 - 50, h.x2 + 50); Hz.fall(x, gyAt(m, x), 0.7 + i * 0.13, m.atk, { kind: 'poison', r: 44 }); }
        sfx('rain');
      }],
      blink: [1.0, (m, dt, p0, p) => {
        if (!cross(p0, p, 0.5)) return;
        const h = m.home;
        Fx.burst(m.x, m.y - 70, 16, ['#f08fc0', '#ffffff'], { type: 'leaf', s0: 60, s1: 260, l0: 0.4, l1: 0.8 });
        let x = m.x;
        for (let i = 0; i < 8; i++) { x = U.rand(h.x1, h.x2); if (Math.abs(x - P.x) > 280) break; }
        m.x = x; sfx('blink');
        Fx.burst(m.x, m.y - 70, 16, ['#f08fc0', '#ffffff'], { type: 'leaf', s0: 60, s1: 260, l0: 0.4, l1: 0.8 });
      }],
      summon: [1.2, (m, dt, p0, p) => { if (cross(p0, p, 0.5)) summon(m, 'glowmoth', m.rage ? 3 : 2, 5); }],
    },
    golem: {
      slam: [1.9, (m, dt, p0, p) => { // (1.6 → 1.9 s: 0.95 s to get out of its 240 px reach even from right against it)
        if (!cross(p0, p, 0.5)) return;
        slamFx(m, true); frontHit(m, 240, 180, 1.4, { kb: 1.5 }); shocks(m, 1.0, { spd: 460, left: 640, col: '#9fd8f0' });
      }, (m) => { const g = strike(); warnFront(m, 0.5, 240, 180, g); warnShocks(m, m.x, lead(m, 0.5), 460, 640, g); }],
      spikes: [2.3, (m, dt, p0, p) => {
        if (p < 0.5) return;
        if (cross(p0, p, 0.5)) { m.av.n = 0; m.av.t = 0; G.shake(6, 0.2); sfx('boss_slam', { vol: 0.7 }); }
        m.av.t -= dt;
        if (m.av.t <= 0 && m.av.n < (m.rage ? 6 : 4)) { m.av.n++; m.av.t = 0.27; const x = P.x + U.rand(-24, 24); Hz.spike(x, gyAt(m, x), 0.55, m.atk * 1.1, { kind: 'crystal', w: 66, h: 130 }); sfx('warning', { vol: 0.5 }); }
      }],
      laser: [2.8, (m, dt, p0, p) => {
        for (const th of [0.22, 0.47, 0.72]) {
          if (!cross(p0, p, th)) continue;
          const [x, y] = muzzle(m), a = Math.atan2(P.y - 34 - y, P.x - x);
          Hz.beam(x, y, x + Math.cos(a) * 1500, y + Math.sin(a) * 1500, m.rage ? 0.42 : 0.55, m.atk * 1.2, { dur: 0.26, wd: 38, col: m.rage ? '#ff6ad0' : '#7fe0ff' });
          sfx('warning');
        }
      }],
      rockfall: [1.8, (m, dt, p0, p) => { if (cross(p0, p, 0.5)) { slamFx(m, true); sfx('boss_roar', { vol: 0.6 }); fallsNear(m, m.rage ? 10 : 7, 'crystal', 1.0, { r: 48 }); } }],
    },
    scorpion: {
      // (1.1 → 1.9 s: the 270 px stinger lunge struck 0.55 s after the wind-up began — now 0.95 s: time to back out of the red from mid
      // range; right against its claws, hop it — it reaches only 110 px high, and the zone's ceiling line shows that)
      stab: [1.9, (m, dt, p0, p) => {
        if (!cross(p0, p, 0.5)) return;
        const x = m.dir > 0 ? m.x + 40 : m.x - 310;
        sfx('swing2', { rate: 0.8 }); Fx.dust(m.x + m.dir * 250, m.home.y, 8); G.shake(7, 0.2);
        if (pBox(x, m.home.y - 110, 270, 116)) P.hurt(m.atk * 1.5, m.x, { kb: 1.4 });
      }, (m) => { const x1 = m.dir > 0 ? m.x + 40 : m.x - 310; Hz.warn({ x1, x2: x1 + 270, y: m.home.y, h: 110, dur: lead(m, 0.5), from: m.dir > 0 ? 'l' : 'r', m, grp: strike() }); }],
      sweep: [1.6, (m, dt, p0, p) => { // (1.0 → 1.6 s, same reason: 0.8 s to step out)
        if (!cross(p0, p, 0.5)) return;
        Fx.slash(m.x + m.dir * 70, m.y - 44, m.dir, { r: 120, a0: -1.2, a1: 1.0, col: '#ffffff', col2: '#ffb090', dur: 0.24, w: 0.5 });
        sfx('swing2'); frontHit(m, m.w * 0.5 + 110, 120, 1.2, { kb: 1.9 });
      }, (m) => warnFront(m, 0.5, m.w * 0.5 + 110, 120, strike())],
      spit: [1.3, (m, dt, p0, p) => {
        if (!cross(p0, p, 0.5)) return;
        const n = m.rage ? 5 : 3, [x, y] = muzzle(m), g = strike();
        for (let i = 0; i < n; i++) {
          const tx = P.x + (i - (n - 1) / 2) * 120, ty = gyAt(m, tx), v = ballistic(x, y, tx, ty, 0.9, 1100);
          Pr.spawn({ own: 'm', kind: 'spit', x, y, vx: v[0], vy: v[1], g: 1100, dmg: 0, r: 14, life: 4, gy: ty, ghost: true, onEnd: (o) => Hz.blast(o.x, o.y - 10, 58, m.atk * 0.95, '#9fe060') });
          warnAt(tx, ty, 58, 68, 0.9, g); // where each glob bursts
        }
        sfx('mon_shoot', { rate: 0.7 });
      }],
      // it comes up where you stood while it was sinking (it used to keep following you until the very moment it burst out, which could
      // not be dodged): the spot is picked mid-dive and the red patch marks it — ~1 s to get off it (or jump very high)
      burrow: [2.6, (m, dt, p0, p) => {
        const h = m.home;
        if (cross(p0, p, 0.25)) {
          m.av.tx = clamp(P.x, h.x1, h.x2);
          Hz.warn({ x1: m.av.tx - 125, x2: m.av.tx + 125, y: h.y, h: 180, dur: lead(m, 0.62), from: 'c', m, grp: strike() });
        }
        if (cross(p0, p, 0.35)) { m.hidden = true; m.noTouch = true; if (m.av.tx === undefined) m.av.tx = clamp(P.x, h.x1, h.x2); Fx.dust(m.x, h.y, 16); sfx('quake', { vol: 0.6 }); }
        if (p >= 0.35 && p < 0.62) {
          if (Math.random() < dt * 50) Fx.p({ x: m.av.tx + U.rand(-50, 50), y: h.y, vx: U.rand(-60, 60), vy: U.rand(-220, -80), g: 600, life: 0.5, size: U.rand(4, 9), color: '#d8a878' });
          G.shake(2, 0.1);
        }
        if (cross(p0, p, 0.62)) {
          m.x = clamp(m.av.tx, h.x1, h.x2); m.hidden = false;
          G.shake(14, 0.4); sfx('boss_slam'); Fx.dust(m.x, h.y, 20);
          Fx.burst(m.x, h.y - 20, 24, ['#d8a878', '#b8503c'], { a0: -Math.PI, a1: 0, s0: 200, s1: 600, l0: 0.4, l1: 0.8, z0: 5, z1: 11 });
          if (pBox(m.x - 125, h.y - 180, 250, 186)) P.hurt(m.atk * 1.5, m.x, { up: 800 });
        }
        if (p >= 0.75) m.noTouch = false;
      }],
    },
    yeti: {
      pound: [1.8, (m, dt, p0, p) => { // (1.5 → 1.8 s: 0.9 s to step out of the red, even from right against it)
        if (!cross(p0, p, 0.5)) return;
        slamFx(m, true); frontHit(m, 230, 190, 1.3, { kb: 1.4 }); shocks(m, 1.0, { spd: 520, left: 780, col: '#dff4ff' });
        fallsNear(m, m.rage ? 8 : 5, 'icicle', 1.0, { r: 40, slow: 1.5 }, m.av.g);
      }, (m) => { const g = strike(m); warnFront(m, 0.5, 230, 190, g); warnShocks(m, m.x, lead(m, 0.5), 520, 780, g); }],
      throw: [1.4, (m, dt, p0, p) => {
        if (!cross(p0, p, 0.5)) return;
        const hold = (A.MANCHOR && A.MANCHOR.yeti && A.MANCHOR.yeti.hold) || [40, -230];
        const x = m.x + m.dir * hold[0], y = m.y + hold[1], ty = gyAt(m, P.x), T = clamp(Math.abs(P.x - x) / 520, 0.6, 1.1), v = ballistic(x, y, P.x, ty, T, 1100);
        Pr.spawn({ own: 'm', kind: 'boulder', x, y, vx: v[0], vy: v[1], g: 1100, dmg: 0, r: 34, life: 4, gy: ty, ghost: true, onEnd: (o) => { Hz.blast(o.x, o.y - 10, 104, m.atk * 1.2, '#dff4ff', { slow: 1.5 }); G.shake(8, 0.25); sfx('ice'); } });
        warnAt(P.x, ty, 104, 114, T, strike()); // where the boulder bursts
        if (m.rage) G.after(0.35, () => {
          if (m.dead) return;
          const tx = P.x, ty2 = gyAt(m, tx), v2 = ballistic(x, y, tx, ty2, 0.8, 1100);
          Pr.spawn({ own: 'm', kind: 'boulder', x, y, vx: v2[0], vy: v2[1], g: 1100, dmg: 0, r: 26, life: 4, gy: ty2, ghost: true, onEnd: (o) => Hz.blast(o.x, o.y - 10, 84, m.atk, '#dff4ff', { slow: 1.5 }) });
          warnAt(tx, ty2, 84, 94, 0.8, strike());
        });
        sfx('swing2', { rate: 0.6 });
      }],
      breath: [2.5, (m, dt, p0, p) => {
        if (!cross(p0, p, 0.35)) return;
        const w = 380;
        Hz.zone(m.dir > 0 ? m.x + 60 : m.x - 60 - w, m.home.y - 160, w, 160, m.atkDur * 0.55, m.atk * 0.5, { dir: m.dir, slow: 1.2, kind: 'frost' });
        sfx('whirl', { rate: 0.6 });
      }, (m) => { const w = 380, x1 = m.dir > 0 ? m.x + 60 : m.x - 60 - w; Hz.warn({ x1, x2: x1 + w, y: m.home.y, h: 160, dur: lead(m, 0.35), keep: m.atkDur * 0.55, from: m.dir > 0 ? 'l' : 'r', m, grp: strike() }); }],
      leap: [1.6, (m, dt, p0, p) => leap(m, dt, p0, p, 0.3, () => { slamFx(m, true); shocks(m, 1.1, { spd: 500, left: 620, col: '#dff4ff' }); }, [500, 620])],
    },
    nox: {
      // (1.2 → 1.75 s: the blade fell 0.6 s after the wind-up began — now 0.875 s. Enraged, the second slash re-winds from 0.05
      // instead of 0.3, so it too gets a fair warning)
      slash: [1.75, (m, dt, p0, p) => {
        if (cross(p0, p, 0.5)) {
          Fx.slash(m.x + m.dir * 60, m.y - 90, m.dir, { r: 150, a0: -1.7, a1: 1.1, col: '#f0e0ff', col2: '#8a4fd0', dur: 0.3, w: 0.5 });
          sfx('swing2', { rate: 0.75 }); frontHit(m, m.w * 0.5 + 130, 190, 1.3, { kb: 1.4 });
          Pr.spawn({ own: 'm', kind: 'wave', x: m.x + m.dir * 80, y: m.home.y - 54, vx: m.dir * 620, vy: 0, dmg: m.atk * 1.1, r: 54, life: 1.7, ghost: true, light: 120, pierce: 1 });
        }
        if (m.rage && !m.av.again && p >= 0.92) { m.av.again = true; m.st = m.atkDur * 0.05; m.p = 0.05; m.dir = Math.sign(P.x - m.x) || m.dir; slashWarn(m); }
      }, (m) => slashWarn(m)],
      orbs: [2.8, (m, dt, p0, p) => {
        const n = m.rage ? 13 : 9;
        if (p < 0.12 || p > 0.75) return;
        m.av.t = (m.av.t || 0) - dt;
        if (m.av.t > 0 || (m.av.n || 0) >= n) return;
        m.av.t = (m.atkDur * 0.6) / n; const i = (m.av.n = (m.av.n || 0) + 1);
        const a = (i / n) * TAU, ox = m.x + Math.cos(a) * 120, oy = m.y - m.h * 0.55 + Math.sin(a) * 120;
        Fx.add({ x: ox, y: oy, dur: 0.55, light: 60, draw(c, pp, e) { A.glow(c, e.x, e.y, 10 + pp * 22, '#b06aff', 0.9); A.ell(c, e.x, e.y, 4 + pp * 8); c.fillStyle = '#2a1840'; c.fill(); } });
        G.after(0.55, () => {
          if (m.dead || P.dead) return;
          const an = Math.atan2(P.y - 36 - oy, P.x - ox);
          Pr.spawn({ own: 'm', kind: 'darkorb', x: ox, y: oy, vx: Math.cos(an) * 540, vy: Math.sin(an) * 540, dmg: m.atk * 0.95, r: 13, life: 2.4, ghost: true, light: 70 });
          sfx('mon_shoot', { vol: 0.5, rate: 0.8 });
        });
      }],
      warp: [1.7, (m, dt, p0, p) => {
        const h = m.home;
        // it picks its spot beside you while it fades out (it used to choose it at 0.5 — only 0.34 s before the slam; now 0.77 s): the
        // red patch and the shock lanes show where it will come down
        if (cross(p0, p, 0.25)) {
          m.av.wx = clamp(P.x + (U.chance(0.5) ? -80 : 80), h.x1, h.x2);
          const g = strike();
          warnAt(m.av.wx, h.y, 135, 190, lead(m, 0.7), g, m);
          warnShocks(m, m.av.wx, lead(m, 0.7), 500, 560, g);
        }
        if (cross(p0, p, 0.4)) { m.hidden = true; m.noTouch = true; Fx.burst(m.x, m.y - 100, 26, ['#8a4fd0', '#2a1840'], { s0: 60, s1: 320, l0: 0.3, l1: 0.7, z0: 5, z1: 12 }); sfx('blink', { rate: 0.6 }); }
        if (cross(p0, p, 0.5)) {
          m.x = m.av.wx !== undefined ? m.av.wx : clamp(P.x + (U.chance(0.5) ? -80 : 80), h.x1, h.x2); m.dir = Math.sign(P.x - m.x) || 1; m.hidden = false;
          Fx.burst(m.x, m.y - 100, 26, ['#8a4fd0', '#c79bff'], { s0: 60, s1: 320, l0: 0.3, l1: 0.7, z0: 5, z1: 12, add: true });
          Fx.ring(m.x, h.y - 4, 150, 30, '#c79bff', 0.34, 6, { flat: 0.28 }); sfx('warning');
        }
        if (cross(p0, p, 0.7)) {
          slamFx(m, true); shocks(m, 1.0, { spd: 500, left: 560, col: '#c79bff' });
          if (pBox(m.x - 135, h.y - 190, 270, 196)) P.hurt(m.atk * 1.6, m.x, { kb: 1.5, up: 500 });
          m.noTouch = false;
        }
      }],
      meteor: [2.4, (m, dt, p0, p) => { if (cross(p0, p, 0.5)) { fallsNear(m, m.rage ? 13 : 8, 'dark', 1.15, { r: 54, fallT: 0.36 }); sfx('boss_roar', { vol: 0.6, rate: 1.2 }); } }],
      summon: [1.4, (m, dt, p0, p) => {
        if (!cross(p0, p, 0.5)) return;
        Fx.ring(m.x, m.home.y - 4, 20, 260, '#b06aff', 0.6, 8, { flat: 0.28 });
        summon(m, 'gsoldier', 2, 4); if (m.rage) summon(m, 'ghexer', 1, 4);
      }],
    },
  };
  AI.boss = function (m, dt) {
    const h = m.home, def = m.def;
    if (m.state === 'intro') { m.st += dt; m.p = U.sat(m.st / 1.6); if (m.st > 1.6) { m.state = 'idle'; m.invul = false; } return; }
    if (!m.rage && m.hp < m.maxHp * 0.5) {
      m.rage = true; m.atkCd = Math.min(m.atkCd, 0.7);
      G.shake(12, 0.6); sfx('boss_roar'); Fx.flash(def.col, 0.3, 0.4);
      Fx.ring(m.x, m.y - m.h / 2, 30, 420, '#ff5a6a', 0.7, 12);
      G.emit('msg', U.josa(def.name, '이/가') + ' 분노합니다!', 'boss');
    }
    if (m.state === 'attack') {
      m.st += dt;
      const p0 = m.p; m.p = Math.min(1, m.st / m.atkDur);
      G.src = m.atkName; // what hurts the hero from here (also the hazards / projectiles it spawns) counts as this attack
      BOSS[m.id][m.atkName][1](m, dt, p0, m.p);
      G.src = null;
      if (m.st >= m.atkDur && !m.air) { m.state = 'idle'; m.p = 0; m.atkCd = U.rand(0.9, 1.5) * (m.rage ? 0.6 : 1); m.noTouch = false; m.hidden = false; m.touchMul = 0; }
      return;
    }
    if (P.dead) { m.state = 'idle'; return; }
    const dx = P.x - m.x, adx = Math.abs(dx);
    m.dir = Math.sign(dx) || 1;
    const want = def.fly ? 300 : m.w * 0.5 + 110;
    if (adx > want) { m.state = 'move'; m.x = clamp(m.x + m.dir * def.spd * dt, h.x1, h.x2); } else m.state = 'idle';
    if (def.fly) m.y += (h.y - m.alt + Math.sin(m.t * 1.8) * 12 - m.y) * Math.min(1, dt * 3);
    if (m.atkCd <= 0) {
      const opts = def.atks.filter((a) => a !== m.lastAtk && !(a === 'summon' && minions() >= 3));
      const name = U.pick(opts.length ? opts : def.atks), a = BOSS[m.id][name];
      m.lastAtk = name;
      // enraged, a guardian attacks sooner and harder — but a big hit with a red telegraph keeps its full wind-up, so it stays dodgeable
      startAttack(m, a[0] * (m.rage && !FAIR[name] ? 0.86 : 1), name);
      G.src = name;
      if (a[2]) a[2](m); // the red floor telegraph of a big hit
      G.src = null;
    }
  };
  Mn.summonBoss = function (b) {
    const map = G.map, id = b.info.boss, def = D.MON[id];
    if (map.boss) return;
    const home = { x1: b.arena[0] + def.w / 2, x2: b.arena[1] - def.w / 2, y: b.y }, alt = def.fly ? def.alt || 44 : 0;
    const x = clamp(P.x + (P.x < (b.arena[0] + b.arena[1]) / 2 ? 340 : -340), home.x1, home.x2);
    const m = Mn.make(id, x, b.y - alt, home, { alt, spawnT: 0, invul: true, state: 'intro', st: 0, atkCd: 1.0, aggro: true, lastAtk: null, dir: P.x < x ? -1 : 1 });
    map.boss = m;
    Fx.pillar(x, b.y, '#b06aff', 520, 1.2, 150); Fx.flash('#3a1a5a', 0.5, 0.6);
    Fx.burst(x, b.y - def.h / 2, 40, ['#b06aff', '#2a1840', '#ffffff'], { s0: 100, s1: 520, l0: 0.5, l1: 1.1, z0: 5, z1: 13 });
    G.shake(14, 0.8); sfx('boss_roar');
    if (G.Audio) G.Audio.bgm('boss');
    G.emit('boss', m);
  };
  Mn.resetBoss = function () {
    const map = G.map;
    if (!map || !map.boss || map.boss.dead) return; // (a guardian that already fell stays fallen — going down after it never undoes the win)
    for (const m of G.mons) if (m.boss || m.minion) m.gone = true;
    map.boss = null; Hz.clear();
    for (const o of G.projs) if (o.own === 'm') o.gone = true;
    if (G.Audio) G.Audio.bgm(map.def.bgm);
    G.emit('bossEnd', false);
  };
  function bossDeath(m) {
    const map = G.map, b = map.beacon;
    Hz.clear();
    for (const o of G.projs) if (o.own === 'm') o.gone = true;
    for (const o of G.mons) if (o.minion && !o.dead) { o.dead = true; o.deadT = 0; Fx.burst(o.x, o.y - o.h / 2, 10, o.def.col, {}); }
    // the win is recorded and saved the moment the guardian falls — even when the hero went down in that same instant (the game
    // isn't saved while you're down, so a fall that only lived in memory came back unlit after reopening). The lighting ceremony
    // below is only visual: leaving the map, closing the game or getting up in town loses nothing (bossDown → game.js)
    const fresh = !!b && !P.beacons[map.id]; // (this fall lights it — not a rematch at a lit beacon)
    if (fresh) P.beacons[map.id] = 1;
    G.emit('bossDown', m, map.id, fresh);
    G.Quest.check(); G.Game.save(true);
    G.slowmo = 1.3; sfx('boss_die'); G.shake(16, 1.2); Fx.flash('#ffffff', 0.7, 0.5);
    for (let i = 0; i < 7; i++) G.after(i * 0.16, () => {
      const x = m.x + U.rand(-m.w / 2, m.w / 2), y = m.y - U.rand(0, m.h);
      Fx.ring(x, y, 10, 90, '#ffffff', 0.4, 8); Fx.burst(x, y, 12, [m.def.col, '#ffffff', '#b06aff'], { s0: 100, s1: 460, l0: 0.4, l1: 0.9, z0: 4, z1: 11, add: true });
    });
    downs = map;
    G.after(1.5, settle);
  }
  // the fallen guardian's win is settled: the seal lifts, the music returns, the beacon lights ("수호자를 물리쳤습니다!" · "등대 점화!").
  // Normally 1.5 s after the fall (bossDeath's timer); right away if the hero is carried off the map first — getting up in town after
  // going down with it (P.respawn) — since a map load drops pending timers, and with them this announcement. Game.newGame / continue
  // drop an unsettled one together with the old map (Mn.forget)
  let downs = null;
  function settle() {
    const map = downs;
    if (!map) return;
    downs = null; map.boss = null;
    if (G.map !== map) return;
    if (G.Audio) G.Audio.bgm(map.def.bgm);
    G.emit('bossEnd', true);
    if (map.beacon && !map.beacon.lit) G.Game.lightBeacon();
  }
  Mn.settle = settle;
  Mn.forget = () => { downs = null; };

  // ------------------------------------------------------------ damage / kill / drops
  // Hit feel: the struck monster flashes white (silhouette), shivers, tilts away and springs back (drawn on the real clock, so it
  // keeps moving through the hit-stop), holds still for a beat (stopT) and only then slides back. Crits and finishers hit harder.
  // Whole-game hit-stop (melee only): short; longer for crits / finishers / the killing blow. Hits that come in quick succession
  // (spins, dashes) add only a little each so multi-hit skills don't stutter. Keys pressed during it are kept (main.js).
  let pauseAt = -9, critFlashAt = -9;
  function hitPause(d) {
    if (G.time !== pauseAt && G.time - pauseAt < 0.14) d *= 0.4;
    pauseAt = G.time;
    G.hitStop = Math.max(G.hitStop || 0, d);
  }
  // HP bar: the chunk just lost lingers as a light segment, then drains away
  const lagHp = (m) => U.lerp(m.lagFrom, m.hp, U.ease.inOutQuad(U.sat((G.time - m.lagAt - 0.18) / 0.32)));
  Mn.damage = function (m, dmg, o) {
    const def = m.def, crit = !!o.crit, heavy = !!o.heavy;
    if (def.ai !== 'dummy') { m.lagFrom = Math.max(m.hp, lagHp(m)); m.lagAt = G.time; m.hp -= dmg; }
    const dies = m.hp <= 0 && def.ai !== 'dummy';
    m.flash = 0.12; m.hpShow = 4; m.aggro = true; m.aggroT = 0;
    m.hitAt = G.time; m.hitDir = o.dir || 1; m.hitPow = crit ? 1.5 : heavy ? 1.22 : 1; m.hitCrit = crit;
    Fx.num(m.x, m.y - m.h - 12 + m.popY, dmg, crit ? 'crit' : 'dmg', m.numStack, { dir: m.hitDir, heavy, kill: dies });
    m.numStack = Math.min(7, m.numStack + 1); m.numT = 0.45;
    const hx = m.x - m.hitDir * m.w * 0.2 + U.rand(-8, 8), hy = m.y + m.popY - m.h * 0.55 + U.rand(-12, 12);
    Fx.impact(hx, hy, m.hitDir, { crit, heavy, kind: o.kind, boss: m.boss });
    sfx(crit ? 'crit' : o.kind === 'arrow' ? 'hit_arrow' : o.kind === 'magic' || o.kind === 'ice' || o.kind === 'bolt' ? 'hit_magic' : 'hit', heavy && !crit ? { rate: 0.84 } : undefined);
    if (o.melee) { hitPause(dies ? 0.085 : crit ? 0.075 : heavy ? 0.06 : 0.045); G.shake(crit ? 6 : heavy ? 4 : 2.5, crit ? 0.18 : 0.12); }
    else if (crit) G.shake(3.5, 0.12); else if (heavy) G.shake(2, 0.1);
    if (crit && G.time - critFlashAt > 0.7) { critFlashAt = G.time; Fx.flash('#fff6d8', 0.1, 0.1); }
    if (o.slow) m.slowT = Math.max(m.slowT, o.slow);
    G.S.combo = (G.S.combo || 0) + 1; G.S.comboT = Fx.COMBO_WIN;
    G.emit('hit', m, dmg);
    if (dies) { Mn.kill(m, o); return; }
    if (m.boss || def.ai === 'dummy') return;
    m.stopT = Math.max(m.stopT, crit ? 0.1 : heavy ? 0.08 : 0.06);
    if (def.ai !== 'still') m.kbx = o.dir * 230 * (o.kb || 1) * (crit ? 1.35 : 1);
    if (o.up && !m.fly) m.popV = -o.up;
    else if ((crit || heavy) && !m.fly && def.ai !== 'still' && !m.popY) m.popV = crit ? -250 : -170; // a little bounce on big hits
    if (!(m.state === 'attack' && def.ai === 'charge' && m.p >= 0.5)) {
      if (m.state === 'attack') m.atkCd = Math.max(m.atkCd, 0.7);
      m.state = 'hit'; m.st = 0; m.p = 0; m.touchMul = 0;
    }
  };
  // killing blow: the monster swells for POP_T (real clock — it plays during the hit-stop freeze), then bursts (Mn.update → popMon)
  const POP_T = 0.085;
  function popMon(m) {
    m.popped = true;
    const x = m.x, y = m.y + m.popY - m.h * 0.5, R = clamp(Math.max(m.w, m.h) * 0.62, 22, 74);
    Fx.poof(x, y, R, m.def.col, { dir: m.killDir, crit: m.killCrit, leaf: m.id === 'puff' ? '#8ad05a' : null });
    if (!m.minion && m.def.ai !== 'dummy') Fx.soul(x, y, 3, '#c79bff');
    G.shake(m.killCrit ? 5 : 3.5, 0.16);
    sfx('mon_pop', { rate: clamp(1.22 - m.w / 240, 0.8, 1.15) });
  }
  function potionFor(type, lv) { return type + (lv >= 28 ? 3 : lv >= 12 ? 2 : 1); }
  function randomEquip(tier, wantWeapon) {
    if (wantWeapon || Math.random() < 0.3) return (P.line !== 'novice' && U.chance(0.7) ? D.LINES[P.line].weapon : U.pick(['sword', 'staff', 'bow'])) + tier;
    return U.pick(['helm', 'armor', 'gloves', 'boots', 'charm']) + tier;
  }
  function drops(m) {
    const gy = m.home ? m.home.y : m.y, x = m.x, y = m.y - m.h * 0.5, def = m.def;
    if (m.minion) return;
    if (m.boss) {
      const tier = D.tierFor(m.lv);
      for (let i = 0; i < 9; i++) Dr.gold(x, y, Math.round(m.gold * U.rand(1.2, 2.2) / 3), gy);
      for (let i = 0; i < 3; i++) Dr.item(x, y, D.makeItem(randomEquip(tier, i === 0), 2), gy);
      Dr.item(x, y, { b: 'dust', n: 3 + Math.floor(m.lv / 10) }, gy);
      Dr.item(x, y, { b: 'elixir', n: 2 }, gy);
      Dr.item(x, y, { b: potionFor('hp', m.lv), n: 5 }, gy);
      if (def.mat) Dr.item(x, y, { b: 'm_' + m.id, n: 1 }, gy);
      return;
    }
    if (U.chance(0.62)) Dr.gold(x, y, Math.max(1, Math.round(m.gold * U.rand(0.7, 1.4))), gy);
    if (def.mat && U.chance(0.42)) Dr.item(x, y, { b: 'm_' + m.id, n: 1 }, gy);
    if (U.chance(0.07)) Dr.item(x, y, { b: potionFor('hp', m.lv), n: 1 }, gy);
    if (U.chance(0.045)) Dr.item(x, y, { b: potionFor('mp', m.lv), n: 1 }, gy);
    if (U.chance(0.06)) Dr.item(x, y, D.makeItem(randomEquip(D.tierFor(m.lv)), 0), gy);
    if (U.chance(0.03 + m.lv * 0.0006)) Dr.item(x, y, { b: 'dust', n: 1 }, gy);
  }
  Mn.kill = function (m, o) {
    if (m.dead) return;
    o = o || {};
    m.dead = true; m.deadT = 0; m.hp = 0; m.state = 'hit';
    m.dieAt = G.time; m.killDir = o.dir || m.hitDir || 1; m.killCrit = !!o.crit; m.popped = false;
    P.kills++;
    if (!m.minion) {
      let exp = m.exp;
      const diff = P.lv - m.lv;
      if (diff > 5) exp *= Math.max(0.1, 1 - (diff - 5) * 0.12);
      exp = Math.max(1, Math.round(exp));
      if (P.lv < D.MAX_LV) Fx.num(m.x, m.y - m.h - 40, Math.round(exp * (1 + P.d.expp / 100)), 'exp');
      P.gainExp(exp);
      G.Quest.onKill(m.id);
    }
    drops(m);
    if (m.boss) { // (other monsters swell and burst a moment later — popMon)
      Fx.burst(m.x, m.y - m.h / 2, 40, [m.def.col, '#ffffff'], { s0: 80, s1: 520, l0: 0.3, l1: 0.7, z0: 4, z1: 9 });
      Fx.ring(m.x, m.y - m.h / 2, 6, Math.min(120, m.w * 0.9), '#ffffff', 0.28, 4);
      Fx.soul(m.x, m.y - m.h / 2, 16, '#ffd27a');
      sfx('mon_die');
    }
    if (m.slot) { m.slot.ent = null; m.slot.timer = U.rand(6, 10); }
    if (m.boss) bossDeath(m);
    G.emit('kill', m);
    P.hint('loot');
  };

  // ------------------------------------------------------------ update / draw
  Mn.update = function (dt) {
    updateSpawns(dt);
    for (let i = G.mons.length - 1; i >= 0; i--) {
      const m = G.mons[i], def = m.def;
      if (m.gone) { if (m.slot) { m.slot.ent = null; m.slot.timer = 5; } G.mons.splice(i, 1); continue; }
      if (m.flash > 0) m.flash -= dt;
      if (m.hpShow > 0) m.hpShow -= dt;
      if (m.slowT > 0) m.slowT -= dt;
      if (m.numT > 0) { m.numT -= dt; if (m.numT <= 0) m.numStack = 0; }
      if (m.dead) {
        m.deadT += dt;
        if (!m.boss && !m.popped) { if (m.dieAt === undefined) m.dieAt = G.time; if (G.time - m.dieAt >= POP_T) popMon(m); }
        if (m.deadT > (m.boss ? 1.6 : 0.45)) G.mons.splice(i, 1);
        continue;
      }
      if (m.stopT > 0) { m.stopT -= dt; continue; } // hit freeze: holds its pose for a beat (AI, animation and knock-back resume after)
      const sdt = dt * (m.slowT > 0 ? 0.55 : 1);
      m.t += sdt;
      if (m.spawnT > 0) { m.spawnT -= dt; continue; }
      if (m.atkCd > 0 && m.state !== 'intro') m.atkCd -= sdt; // a boss gets its first-attack delay after the intro, not during it
      if (m.kbx) { m.x = clamp(m.x + m.kbx * dt, m.home.x1 - (m.fly ? 60 : 0), m.home.x2 + (m.fly ? 60 : 0)); m.kbx *= Math.pow(0.0006, dt); if (Math.abs(m.kbx) < 8) m.kbx = 0; }
      if (m.popV || m.popY < 0) { m.popV += 2200 * dt; m.popY += m.popV * dt; if (m.popY >= 0) { m.popY = 0; m.popV = 0; } }
      // aggro
      const dx = P.x - m.x, dy = P.y - 30 - (m.y - m.h / 2);
      if (!m.aggro && !def.passive && !P.dead && Math.abs(dx) < (def.sight || 340) && Math.abs(dy) < 160) m.aggro = true;
      if (m.aggro && !m.boss) {
        if (P.dead || Math.abs(dx) > 780 || Math.abs(dy) > 440) { m.aggroT += dt; if (m.aggroT > 3 || P.dead) { m.aggro = false; m.aggroT = 0; } } else m.aggroT = 0;
      }
      if (m.state === 'hit') { m.st += dt; m.p = U.sat(m.st / 0.22); if (m.st >= 0.22) { m.state = 'idle'; m.p = 0; } }
      else { G.src = m.minion ? 'minion' : null; AI[def.ai](m, sdt); } // (AI.boss names its own attacks)
      // contact damage
      if (def.ai !== 'dummy' && !m.noTouch && !m.hidden && !P.invul() && m.state !== 'intro') {
        G.src = m.boss ? (m.state === 'attack' ? m.atkName : 'touch') : m.minion ? 'minion' : null;
        if (P.x + 11 > m.x - m.w / 2 + 5 && P.x - 11 < m.x + m.w / 2 - 5 && P.y > m.y - m.h + 6 && P.y - 60 < m.y - 4) P.hurt(m.atk * (m.touchMul || (m.boss ? 0.8 : 0.7)), m.x);
      }
      G.src = null;
    }
    if (G.map.boss && P.dead) Mn.resetBoss();
  };
  const S = { t: 0, state: 'idle', p: 0, atk: 'atk', air: false, vy: 0, rage: false, w: 0, h: 0, seed: 0 };
  function fallback(ctx, s, m) {
    const sq = 1 + Math.sin(s.t * 6) * 0.04;
    A.ell(ctx, 0, -s.h / 2, (s.w / 2) * sq, (s.h / 2) / sq); A.fs(ctx, m.def.col);
    A.eye(ctx, s.w * 0.12, -s.h * 0.6, 3.4, 5); A.eye(ctx, s.w * 0.3, -s.h * 0.6, 3, 4.6);
  }
  // hit flash: the monster as a solid silhouette (white reads on every monster, even the white 솜뭉치, where an additive flash
  // vanished). Rendered off-screen in the monster's local space and drawn back in that same space, so flip / tilt / squash match.
  // rim: the same shape in a warm colour nudged out in four directions first — a glowing edge that also shows on the bright sky.
  let silCv = null, silCx = null;
  const RIM = [[-2.5, 0], [2.5, 0], [0, -2.5], [0, 2.5]];
  function silhouette(ctx, draw, s, m, col, a, rim) {
    const RS = G.RS, pad = 34, bw = Math.ceil(Math.max(m.w, 30) * 2 + pad * 2), bh = Math.ceil(Math.max(m.h, 30) * 2.1 + pad * 2), oy = bh - pad;
    const W = Math.ceil(bw * RS), H = Math.ceil(bh * RS);
    if (!silCv) { silCv = document.createElement('canvas'); silCx = silCv.getContext('2d'); }
    if (silCv.width < W || silCv.height < H) { silCv.width = Math.max(silCv.width, W); silCv.height = Math.max(silCv.height, H); }
    const c = silCx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, W, H);
    c.setTransform(RS, 0, 0, RS, (bw / 2) * RS, oy * RS); c.lineJoin = 'round'; c.lineCap = 'round';
    c.save(); draw(c, s); c.restore();
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-in';
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * a;
    if (rim) {
      c.fillStyle = rim; c.fillRect(0, 0, W, H);
      for (const [dx, dy] of RIM) ctx.drawImage(silCv, 0, 0, W, H, -bw / 2 + dx, -oy + dy, bw, bh);
    }
    c.fillStyle = col; c.fillRect(0, 0, W, H); // source-in again: same pixels, new colour
    c.globalCompositeOperation = 'source-over';
    ctx.drawImage(silCv, 0, 0, W, H, -bw / 2, -oy, bw, bh);
    ctx.globalAlpha = pa;
  }
  Mn.draw = function (ctx, vx) {
    const now = G.time;
    for (const m of G.mons) {
      if (m.hidden || m.popped || m.x + m.w * 1.5 < vx - 80 || m.x - m.w * 1.5 > vx + G.W + 80) continue;
      const fn = A.M && A.M[m.id], gy = m.home ? m.home.y : m.y, draw = fn || ((c, s) => fallback(c, s, m));
      if (!m.dead) A.shadow(ctx, m.x, gy, m.w * 0.42 * (m.fly || m.air ? 0.7 : 1), m.fly ? 0.14 : 0.24);
      ctx.save();
      let ox = 0, alpha = 1, sx = 1, sy = 1, rot = 0, fl = 0, rim = null, flCol = '#ffffff', piv = 0;
      const ht = now - m.hitAt, pw = m.hitPow || 1;
      if (ht >= 0 && ht < 0.5) {
        if (ht < 0.16) ox = Math.sin(now * 110) * (m.boss ? 1.6 : 3.2) * pw * (1 - ht / 0.16); // impact shiver
        rot = m.hitDir * (m.boss ? 0.03 : 0.2) * pw * Math.exp(-ht * 8) * Math.sin(ht * 24); // knocked over, springs back upright
        const hold = m.boss ? 0.03 : 0.05, fade = m.boss ? 0.06 : m.hitCrit ? 0.16 : 0.1;
        fl = ht < hold ? 1 : 1 - (ht - hold) / fade;
        if (m.boss) fl *= 0.7; else rim = m.hitCrit ? '#ff7a3a' : '#ffd25a';
        if (m.hitCrit) flCol = '#fff4c8';
      }
      if (m.spawnT > 0) alpha = 1 - m.spawnT / 0.5;
      if (m.dead) {
        if (m.boss) { const k = U.sat(m.deadT / 1.6); ox = Math.sin(m.deadT * 70) * 6; alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; }
        else { // swell (around the middle), shivering and glowing, until it bursts
          const q = U.sat((now - (m.dieAt === undefined ? now : m.dieAt)) / POP_T), s = 1 + 0.32 * U.ease.outQuad(q), w = Math.sin(now * 80);
          sx = s * (1 + 0.05 * w); sy = s * (1 - 0.04 * w); piv = -m.h / 2;
          ox += Math.sin(now * 130) * 2.2;
          fl = Math.max(fl, 0.5 + 0.5 * q); rim = '#ffd25a';
        }
      }
      ctx.translate(m.x + ox, m.y + m.popY);
      if (rot) { const py = m.fly ? -m.h / 2 : 0; ctx.translate(0, py); ctx.rotate(rot); ctx.translate(0, -py); }
      ctx.globalAlpha = alpha;
      if (piv) ctx.translate(0, piv);
      ctx.scale(m.dir * sx, sy);
      if (piv) ctx.translate(0, -piv);
      S.t = m.t; S.state = m.state === 'intro' ? 'idle' : m.state; S.p = m.p; S.atk = m.atkName; S.air = m.air; S.vy = m.vy; S.rage = !!m.rage; S.w = m.w; S.h = m.h; S.seed = m.seed;
      try {
        draw(ctx, S);
        if (m.dead && m.boss) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * 0.6; draw(ctx, S); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha; }
        if (fl > 0.01) silhouette(ctx, draw, S, m, flCol, Math.min(1, fl), rim);
      } catch (e) { if (!m.err) { m.err = 1; console.error('monster art ' + m.id, e); } }
      ctx.restore();
      if (m.slowT > 0 && !m.dead && Math.random() < 0.2) Fx.p({ x: m.x + U.rand(-m.w / 2, m.w / 2), y: m.y - U.rand(0, m.h), vy: 30, life: 0.5, size: 4, color: '#c9f0ff', type: 'star', add: true });
    }
  };
  Mn.drawOverlay = function (ctx) {
    for (const m of G.mons) {
      if (m.dead || m.hidden || m.boss || m.hpShow <= 0) continue;
      const w = U.clamp(m.w, 44, 80), x = m.x - w / 2, y = m.y - m.h - 12 + m.popY, k = U.sat(m.hp / m.maxHp);
      ctx.globalAlpha = Math.min(1, m.hpShow * 2);
      if (m.def.ai !== 'dummy') {
        A.rr(ctx, x - 1.5, y - 1.5, w + 3, 9, 4.5); ctx.fillStyle = 'rgba(28,20,44,0.85)'; ctx.fill();
        const lk = U.sat(lagHp(m) / m.maxHp);
        if (lk > k + 0.004) { A.rr(ctx, x, y, Math.max(5, w * lk), 6, 3); ctx.fillStyle = '#fff3c4'; ctx.fill(); }
        if (k > 0) { A.rr(ctx, x, y, Math.max(5, w * k), 6, 3); ctx.fillStyle = k > 0.5 ? '#7fe06a' : k > 0.25 ? '#ffd24a' : '#ff5a5a'; ctx.fill(); }
      }
      A.text(ctx, 'Lv.' + m.lv + ' ' + m.name, m.x, y - 11, { size: 11.5, weight: 800, color: m.lv > P.lv + 4 ? '#ff9a8a' : '#ffffff', sw: 3 });
      ctx.globalAlpha = 1;
    }
  };
})();
