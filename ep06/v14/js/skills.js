'use strict';
/* 등불지기 — skills: active skill execution (hit timing, movement, effects) */
(function () {
  const G = window.G, U = G.U, A = G.Art, D = G.D, Fx = G.Fx, P = G.P, C = G.Combat, Pr = G.Proj;
  const Sk = (G.Skills = {});
  const EX = {};
  const TAU = Math.PI * 2, lerp = U.lerp, clamp = U.clamp;
  const sfx = (n, o) => { if (G.Audio) G.Audio.sfx(n, o); };
  const FIRE = ['#fff1c4', '#ffd27a', '#ff8a3c', '#ff5a2e'], STAR = ['#ffffff', '#ffe9a0', '#bfd0ff', '#8fa8ff'], WIND = ['#ffffff', '#c8ffe0', '#8ff0c0', '#fff7a8'];
  P.cdMax = {};

  // once every hit of a skill has fired, its recovery can be cut short by the next skill (a.cancel = explicit time)
  function cancellable(a) {
    if (!a.skill || a.noCancel) return false;
    if (a.cancel !== undefined) return a.t >= a.cancel;
    return a.ev.length > 0 && a.i >= a.ev.length && a.t >= a.ev[a.ev.length - 1][0] + 0.06;
  }
  // returns true on success, otherwise the reason: 'no' | 'busy' | 'cd' | 'mp'
  Sk.use = function (id, fresh) {
    const sk = D.SKILLS[id], lv = P.skills[id];
    if (!sk || !lv || sk.kind === 'passive' || !EX[id]) return 'no';
    if (P.dead || P.ladder) return 'no';
    const a = P.act;
    if (a && !(a.basic && a.t > a.dur * 0.3) && !cancellable(a)) return 'busy';
    if (P.cd[id] > 0) return 'cd';
    const v = sk.v(lv);
    if (P.mp < v.mp) { if (fresh) { G.emit('msg', 'MP가 부족합니다.', 'warn'); sfx('error'); } return 'mp'; }
    P.act = null;
    EX[id](v, sk);
    if (P.act) { P.act.skill = id; P.act.armor = true; } // super armor: getting hit never interrupts a cast
    P.mp -= v.mp;
    P.cd[id] = P.cdMax[id] = Math.max(0.3, v.cd * (1 - P.d.cdr / 100));
    castFx(sk);
    G.emit('hp'); G.emit('skill', id);
    return true;
  };
  // magic circle under the caster
  const SIG = { novice: ['#ffd98a', '#fff3c4'], blade: ['#ff8a3c', '#ffe0a0'], star: ['#8fa8ff', '#efe8ff'], gale: ['#6fe0a0', '#e6fff2'] };
  const NO_SIG = { s_blink: 1, b_rush: 1, g_back: 1, n_smash: 1, b_cleave: 1 };
  function castFx(sk) {
    if (NO_SIG[sk.id]) return;
    const c = SIG[sk.line] || SIG.novice, big = sk.tier >= 3 || sk.id === 's_meteor' || sk.id === 'g_rain' || sk.id === 'b_whirl';
    if (sk.kind === 'buff') { Fx.sigil({ follow: P, r: 100, dur: 1.0, col: c[0], col2: c[1], n: 8 }); return; }
    if (sk.line !== 'star' && !big) return;
    Fx.sigil({ follow: P, r: big ? 118 : 74, dur: big ? 0.95 : 0.55, col: c[0], col2: c[1], n: sk.line === 'star' ? 5 : 6, rise: big });
  }
  const fireP = (x, y, n, cols, o) => Fx.burst(x, y, n, cols || FIRE, Object.assign({ s0: 40, s1: 220, g: -260, l0: 0.25, l1: 0.6, z0: 4, z1: 9, add: true }, o));
  function boxInSolid(x, y) {
    for (const s of G.map.solids) if (x - 15 < s.x + s.w && x + 15 > s.x && y - 68 < s.y + s.h && y > s.y + 1) return true;
    return false;
  }
  // travelling ground wave that hits monsters once
  function pwave(x, y, d, dist, mult, once, cols) {
    Fx.add({ x, y, d, dur: dist / 560 + 0.05, light: 100, cols: cols || FIRE,
      upd(dt, e) {
        e.x += e.d * 560 * dt;
        C.hitBox({ x: e.x - 32, y: e.y - 76, w: 64, h: 86 }, mult, { once, dir: e.d, kind: 'fire', kb: 1.1, up: 480 });
        if (Math.random() < dt * 70) fireP(e.x, e.y - U.rand(0, 40), 1, e.cols);
      },
      draw(c, p, e) {
        c.translate(e.x, e.y); c.scale(e.d, 1); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - p * p;
        c.beginPath(); c.moveTo(-46, 0); c.quadraticCurveTo(-10, -18, 8, -78); c.quadraticCurveTo(20, -26, 34, 0); c.closePath();
        c.fillStyle = e.cols[2]; c.fill();
        c.beginPath(); c.moveTo(-26, 0); c.quadraticCurveTo(-4, -14, 8, -54); c.quadraticCurveTo(14, -18, 22, 0); c.closePath();
        c.fillStyle = e.cols[0]; c.fill();
      } });
  }

  // ============================================================ novice
  EX.n_smash = (v) => {
    P.startAct({ anim: 'slam', dur: 0.5, lock: 0.2, ev: [[0.26, () => {
      const x = P.x + P.dir * 34, y = P.y;
      Fx.ring(x, y - 8, 14, 112, '#ffd98a', 0.4, 9, { flat: 0.32 });
      Fx.burst(x, y - 14, 14, ['#ffd98a', '#fff3c4', '#ff9a2e'], { a0: -Math.PI, a1: 0, s0: 120, s1: 380, add: true, type: 'star', z0: 4, z1: 8 });
      Fx.dust(x, y, 6); G.shake(6, 0.2); sfx('quake', { vol: 0.55, rate: 1.4 });
      C.hitBox({ x: x - 102, y: y - 112, w: 204, h: 126 }, v.dmg, { dir: P.dir, kind: 'fire', kb: 1.3, melee: true });
    }]] });
    sfx('swing2');
  };

  // ============================================================ blade (불꽃검사)
  EX.b_cleave = (v) => {
    P.startAct({ anim: 'atk1', dur: 0.4, lock: 0.25, jump: true, ev: [[0.11, () => {
      Fx.slash(P.x + P.dir * 8, P.y - 40, P.dir, { r: 152, a0: -2.0, a1: 1.3, col: '#fff1c4', col2: '#ff7a2e', dur: 0.3, w: 0.56, light: 170 });
      for (let i = 0; i < 12; i++) { const a = lerp(-1.7, 1.1, i / 11); fireP(P.x + P.dir * Math.cos(a) * 132, P.y - 40 + Math.sin(a) * 132, 1); }
      G.shake(5, 0.18);
      C.hitBox({ x: P.dir > 0 ? P.x - 42 : P.x - 188, y: P.y - 156, w: 230, h: 176 }, v.dmg, { max: v.n, dir: P.dir, kind: 'fire', kb: 1.4, melee: true });
    }]] });
    if (P.onGround) P.vx = P.dir * 240;
    sfx('fire'); sfx('swing2');
  };
  EX.b_rush = (v) => {
    const once = new Set(), d = P.dir;
    P.startAct({ anim: 'dash', dur: 0.3, vx: d * 930, inv: true, float: true, armor: true,
      upd(dt, p, a) {
        P.vy = 0;
        C.hitBox({ x: P.x - 52, y: P.y - 82, w: 104, h: 92 }, v.dmg, { once, dir: d, kind: 'fire', kb: 1.6, melee: true });
        a.gt = (a.gt || 0) - dt;
        if (a.gt <= 0) { a.gt = 0.045; Fx.after(P.artLook(), { state: 'dash', t: 0 }, P.x, P.y, d); }
        fireP(P.x - d * 20, P.y - U.rand(10, 60), 1);
      },
      end() { P.vx = d * 220; } });
    sfx('dash'); sfx('fire', { vol: 0.6 });
  };
  EX.b_quake = (v) => {
    const once = new Set();
    const boom = () => {
      const x = P.x, y = P.y;
      G.shake(11, 0.35); sfx('quake'); Fx.dust(x, y, 12);
      Fx.ring(x, y - 6, 20, 165, '#ffb060', 0.45, 10, { flat: 0.3 });
      fireP(x, y - 10, 16, FIRE, { a0: -Math.PI, a1: 0, s0: 120, s1: 420 });
      C.hitBox({ x: x - 124, y: y - 134, w: 248, h: 150 }, v.dmg, { dir: P.dir, kind: 'fire', kb: 1.2, up: 520, melee: true, once });
      pwave(x, y, 1, 330, v.dmg, once); pwave(x, y, -1, 330, v.dmg, once);
    };
    if (P.onGround) P.startAct({ anim: 'slam', dur: 0.62, lock: 0, armor: true, ev: [[0.3, boom]] });
    else P.startAct({ anim: 'slam', dur: 0.62, lock: 0.3, armor: true,
      upd(dt, p, a) {
        if (a.fired) return;
        a.hold = (a.hold || 0) + dt;
        if (P.onGround || a.hold > 1.6) { a.fired = true; a.t = 0.3; if (P.onGround) boom(); }
        else { a.t = Math.min(a.t, 0.2); P.vy = Math.max(P.vy, 1200); }
      } });
    sfx('swing2');
  };
  EX.b_whirl = (v) => {
    const dur = 1.5, int = dur / v.hits;
    P.startAct({ anim: 'spin', dur, lock: 0.9, armor: true, jump: true, next: 0.05,
      upd(dt, p, a) {
        if (a.t >= a.next) { a.next += int; C.hitCircle(P.x, P.y - 36, 128, v.dmg, { kind: 'fire', kb: 0.5, melee: true }); sfx('swing', { rate: 1.25, vol: 0.7 }); }
        const an = a.t * 16;
        for (let k = 0; k < 2; k++) fireP(P.x + Math.cos(an + k * Math.PI) * 104, P.y - 36 + Math.sin(an + k * Math.PI) * 30, 1);
      } });
    Fx.add({ dur, x: P.x, y: P.y, light: 170,
      upd(dt, e) { e.x = P.x; e.y = P.y - 36; },
      draw(c, p, e) {
        c.translate(e.x, e.y); c.scale(1, 0.34); c.globalCompositeOperation = 'lighter';
        const a = Math.min(1, p * 8, (1 - p) * 6), r = e.t * 16;
        for (let k = 0; k < 2; k++) {
          c.globalAlpha = a * 0.85; c.beginPath(); c.arc(0, 0, 112, r + k * Math.PI, r + k * Math.PI + 2.3); c.lineWidth = 34; c.strokeStyle = '#ff7a2e'; c.stroke();
          c.beginPath(); c.arc(0, 0, 112, r + k * Math.PI + 0.9, r + k * Math.PI + 2.3); c.lineWidth = 14; c.strokeStyle = '#fff1c4'; c.stroke();
        }
      } });
    sfx('whirl'); sfx('fire');
  };
  EX.b_roar = (v, sk) => {
    P.addBuff('b_roar', v.dur, { atkp: v.atkp, col: '#ff8a3c', icon: sk.icon, name: sk.name });
    P.cheerT = 0.7;
    Fx.pillar(P.x, P.y, '#ff8a3c', 300, 0.7, 80); Fx.ring(P.x, P.y - 8, 10, 130, '#ffb060', 0.5, 8, { flat: 0.3 });
    fireP(P.x, P.y - 30, 18, FIRE, { s0: 60, s1: 260 }); sfx('buff');
  };
  EX.b_sun = (v) => {
    P.vy = -1050; P.onGround = false; P.jumps = 2;
    P.startAct({ anim: 'slam', dur: 2, lock: 0.7, inv: true, armor: true,
      upd(dt, p, a) {
        a.hold = (a.hold || 0) + dt;
        if (a.done) return;
        fireP(P.x, P.y - 40, 2, FIRE, { s0: 20, s1: 120 });
        if (!a.fall) { a.t = Math.min(a.t, 0.4); if (P.vy > -120 || a.hold > 0.6) a.fall = true; return; }
        a.t = Math.min(a.t, 0.5); P.vy = 1900; P.vx *= 0.9;
        if (P.onGround || a.hold > 2.4) {
          a.done = true; a.t = 1.3; a.dur = 1.65;
          const x = P.x, y = P.y;
          Fx.pillar(x, y, '#ff9a3c', 620, 0.9, 240); Fx.flash('#ffe0a0', 0.5, 0.35); G.shake(18, 0.6); sfx('quake');
          Fx.ring(x, y - 10, 30, 300, '#ffd27a', 0.6, 16, { flat: 0.34 }); Fx.ring(x, y - 40, 20, 260, '#ffffff', 0.45, 8);
          fireP(x, y - 20, 46, FIRE, { a0: -Math.PI, a1: 0, s0: 160, s1: 720, l0: 0.4, l1: 1.0, z0: 5, z1: 14 });
          Fx.dust(x, y, 16);
          C.hitCircle(x, y - 30, 275, v.dmg, { kind: 'fire', kb: 2, up: 620, melee: true });
        }
      } });
    Fx.ring(P.x, P.y - 6, 10, 90, '#ffb060', 0.3, 6, { flat: 0.3 }); sfx('jump', { rate: 0.7 }); sfx('fire');
    G.after(0.27, () => sfx('sun')); // the sound has a ~0.25s lead-in before its impact
  };

  // ============================================================ star (별빛술사)
  EX.s_bolt = (v) => {
    const ev = [];
    for (let i = 0; i < v.n; i++) ev.push([0.11 + i * 0.07, () => {
      const a = (i - (v.n - 1) / 2) * 0.3;
      Pr.spawn({ own: 'p', kind: 'star', x: P.x + P.dir * 28, y: P.y - 50, vx: P.dir * Math.cos(a) * 610, vy: Math.sin(a) * 610 - 50, dmg: v.dmg, range: 640, r: 13, hitKind: 'magic', homing: 1.3, light: 90 });
      sfx('star', { rate: 1 + i * 0.1 });
    }]);
    P.startAct({ anim: 'cast', dur: 0.45, lock: 0.5, jump: true, ev });
  };
  EX.s_blink = (v) => {
    const x0 = P.x, y0 = P.y, d = P.dir, hw = 15;
    let x = x0;
    for (let s = 0; s < v.dist; s += 12) { const nx = x + d * 12; if (nx < hw + 6 || nx > G.map.w - hw - 6 || boxInSolid(nx, P.y)) break; x = nx; }
    Fx.after(P.artLook(), { state: 'cast', t: 0, p: 0.4 }, x0, y0, d);
    Fx.burst(x0, y0 - 40, 12, STAR, { type: 'star', s0: 40, s1: 240, g: 0, z0: 4, z1: 9, add: true });
    Fx.add({ x: x0, y: y0 - 40, x1: x, dur: 0.25, light: 90, draw(c, p, e) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - p; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.x1, e.y); c.lineWidth = 26 * (1 - p); c.strokeStyle = '#8fa8ff'; c.lineCap = 'round'; c.stroke(); c.lineWidth = 8 * (1 - p); c.strokeStyle = '#ffffff'; c.stroke(); } });
    C.hitBox({ x: Math.min(x0, x) - 24, y: y0 - 96, w: Math.abs(x - x0) + 48, h: 108 }, v.dmg, { dir: d, kind: 'magic', kb: 0.6 });
    P.x = x; P.vy = Math.min(P.vy, 0) * 0.3; P.vx = d * 120;
    P.startAct({ anim: 'cast', dur: 0.2, lock: 1, jump: true, turn: true, inv: true, cancel: 0.09 });
    Fx.burst(x, y0 - 40, 14, STAR, { type: 'star', s0: 40, s1: 260, g: 0, z0: 4, z1: 9, add: true });
    Fx.ring(x, y0 - 40, 8, 60, '#bfd0ff', 0.3, 6);
    sfx('blink');
  };
  EX.s_nova = (v) => {
    P.startAct({ anim: 'cast', dur: 0.45, lock: 0.3, jump: true, ev: [[0.14, () => {
      const x = P.x, y = P.y - 36;
      Fx.ring(x, y, 20, 188, '#bfeaff', 0.45, 14); Fx.ring(x, y, 10, 150, '#ffffff', 0.35, 6);
      Fx.burst(x, y, 26, ['#dff4ff', '#9fdcff', '#ffffff'], { type: 'shard', s0: 200, s1: 520, g: 300, l0: 0.3, l1: 0.6, z0: 4, z1: 9 });
      Fx.flash('#cfeaff', 0.14, 0.15); G.shake(6, 0.2); sfx('ice');
      C.hitCircle(x, y, 184, v.dmg, { kind: 'ice', slow: v.dur, kb: 1.2 });
    }]] });
  };
  function meteor(tx, ty, d, mult) {
    Fx.add({ x: tx, y: ty, sx: tx - d * 250, sy: ty - 540, dur: 0.42, light: 150,
      upd(dt, e) { const p = e.t / e.dur; fireP(lerp(e.sx, e.x, p), lerp(e.sy, e.y, p), 2, FIRE, { s0: 10, s1: 80, g: 0 }); },
      draw(c, p, e) {
        const x = lerp(e.sx, e.x, p), y = lerp(e.sy, e.y, p);
        c.globalAlpha = 0.5; A.ell(c, e.x, e.y, 60 * p, 14 * p); c.fillStyle = '#ff7a2e'; c.fill(); c.globalAlpha = 1;
        A.glow(c, x, y, 70, '#ff9a3c', 0.9);
        A.ell(c, x, y, 19, 19); A.fs(c, '#fff1c4', 3, '#ff7a2e');
      } });
    G.after(0.42, () => {
      Fx.ring(tx, ty - 10, 16, 104, '#ffb060', 0.4, 12); fireP(tx, ty - 10, 16, FIRE, { a0: -Math.PI, a1: 0, s0: 120, s1: 460 });
      Fx.add({ x: tx, y: ty - 20, dur: 0.25, light: 200, draw(c, p, e) { A.glow(c, e.x, e.y, 110 * (1 + p * 0.4), '#ffb060', 1 - p); } });
      G.shake(7, 0.22);
      C.hitCircle(tx, ty - 24, 96, mult, { kind: 'fire', kb: 1.2 });
    });
    G.after(0.2, () => sfx('meteor'));
  }
  EX.s_meteor = (v) => {
    const d = P.dir, x0 = P.x, y0 = P.y;
    P.startAct({ anim: 'cast', dur: 0.55, lock: 0.3, ev: [[0.18, () => {
      for (let i = 0; i < v.n; i++) G.after(i * 0.15, () => {
        const tx = clamp(x0 + d * (110 + i * 62 + U.rand(-24, 24)), 30, G.map.w - 30), s = G.World.groundBelow(tx, y0 - 70);
        meteor(tx, s ? s.y : y0, d, v.dmg);
      });
    }]] });
    sfx('cast'); Fx.ring(P.x, P.y - 40, 60, 10, '#ffb060', 0.3, 5);
  };
  EX.s_chain = (v) => {
    P.startAct({ anim: 'cast', dur: 0.42, lock: 0.4, jump: true, ev: [[0.13, () => {
      const hit = new Set(), from = [P.x + P.dir * 30, P.y - 50], pts = [from];
      let tg = C.nearest(P.x, P.y - 40, 470, P.dir) || C.nearest(P.x, P.y - 40, 300), i = 0;
      sfx('thunder'); Fx.flash('#cfeaff', 0.12, 0.12);
      if (!tg) { Fx.lightning([from, [from[0] + P.dir * 240, from[1] + U.rand(-40, 40)]], '#a8e8ff', 0.25, 5); return; }
      while (tg && i < v.n) {
        hit.add(tg); pts.push([tg.x, tg.y - tg.h / 2]);
        const t0 = tg;
        G.after(i * 0.06, () => C.hitMon(t0, v.dmg, { kind: 'bolt', kb: 0.6 }));
        i++; tg = C.nearest(t0.x, t0.y - t0.h / 2, 290, 0, hit);
      }
      Fx.lightning(pts, '#a8e8ff', 0.3, 5); Fx.lightning(pts, '#ffffff', 0.18, 2.5);
      G.shake(5, 0.15);
    }]] });
  };
  EX.s_galaxy = (v) => {
    P.startAct({ anim: 'cast', dur: 0.6, lock: 0.2, ev: [[0.22, () => {
      const x = clamp(P.x + P.dir * 215, 70, G.map.w - 70), y = P.y - 74;
      let ticks = 0;
      sfx('galaxy');
      Fx.add({ x, y, dur: 2.0, light: 240, next: 0.15,
        upd(dt, e) {
          for (const m of G.mons) {
            if (m.dead || m.boss || m.hidden || m.def.ai === 'dummy' || m.def.ai === 'still') continue;
            const dx = e.x - m.x;
            if (Math.abs(dx) < 340 && Math.abs(m.y - m.h / 2 - e.y) < 280) m.x = clamp(m.x + Math.sign(dx) * Math.min(Math.abs(dx), 270 * dt), m.home.x1 - 50, m.home.x2 + 50);
          }
          if (e.t >= e.next && ticks < 8) { e.next += 0.22; ticks++; C.hitCircle(e.x, e.y, 210, v.tick, { kind: 'magic', kb: 0 }); }
          for (let k = 0; k < 2; k++) { const a = Math.random() * TAU, r = U.rand(120, 260); Fx.p({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r * 0.7, vx: -Math.cos(a) * r * 1.6, vy: -Math.sin(a) * r * 1.1, life: 0.55, size: U.rand(3, 6), color: U.pick(STAR), type: 'star', add: true }); }
        },
        draw(c, p, e) {
          const s = Math.min(1, p * 6) * (1 + Math.sin(e.t * 20) * 0.04), rot = e.t * 5;
          c.translate(e.x, e.y); c.globalCompositeOperation = 'lighter';
          A.glow(c, 0, 0, 190 * s, '#8a6aff', 0.8);
          c.scale(s, s * 0.72);
          for (let k = 0; k < 3; k++) {
            c.beginPath();
            for (let i = 0; i <= 26; i++) { const a = rot + (k * TAU) / 3 + i * 0.2, r = 8 + i * 5.4; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
            c.lineWidth = 16; c.strokeStyle = 'rgba(140,120,255,0.55)'; c.lineCap = 'round'; c.stroke();
            c.lineWidth = 5; c.strokeStyle = '#e8e0ff'; c.stroke();
          }
          c.globalCompositeOperation = 'source-over'; A.ell(c, 0, 0, 22, 22); c.fillStyle = '#140a2a'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#c79bff'; c.stroke();
        } });
      G.after(2.0, () => {
        Fx.flash('#d8c8ff', 0.45, 0.35); G.shake(16, 0.5); sfx('quake', { rate: 0.8 });
        Fx.ring(x, y, 30, 300, '#c79bff', 0.6, 18); Fx.ring(x, y, 20, 220, '#ffffff', 0.4, 8);
        Fx.burst(x, y, 44, STAR, { type: 'star', s0: 160, s1: 700, g: 0, l0: 0.4, l1: 1.0, z0: 5, z1: 13, add: true });
        Fx.add({ x, y, dur: 0.3, light: 380, draw(c, p, e) { A.glow(c, e.x, e.y, 260 * (1 + p * 0.5), '#c79bff', 1 - p); } });
        C.hitCircle(x, y, 270, v.dmg, { kind: 'magic', kb: 2, up: 500 });
      });
    }]] });
    sfx('cast');
  };

  // ============================================================ gale (바람사수)
  EX.g_multi = (v) => {
    const ev = [];
    for (let i = 0; i < v.n; i++) ev.push([0.08 + i * 0.09, () => { P.fireArrow(v.dmg, { y: P.y - 40 + (i - 1) * 7 }); sfx('bow', { rate: 1.1 + i * 0.08 }); }]);
    P.startAct({ anim: 'shoot', dur: 0.42, lock: 0.4, jump: true, ev });
  };
  EX.g_back = (v) => {
    const d = P.dir;
    P.vy = -520; P.onGround = false; P.jumps = Math.max(P.jumps, 1);
    P.startAct({ anim: 'shoot', dur: 0.36, vx: -d * 570, inv: true, armor: true, noCancel: true,
      ev: [[0.07, () => { P.fireArrow(v.dmg, { kind: 'bigarrow', pierce: 2, r: 16, kb: 1.5 }); sfx('bow'); }]],
      end() { P.vx = -d * 180; } });
    Fx.dust(P.x, P.y, 6); Fx.ring(P.x, P.y - 30, 10, 60, '#c8ffe0', 0.3, 5); sfx('dash');
  };
  EX.g_pierce = (v) => {
    P.startAct({ anim: 'shoot', dur: 0.55, lock: 0.15, jump: true,
      upd(dt, p) { if (p < 0.36) Fx.p({ x: P.x + P.dir * 30 + U.rand(-30, 30), y: P.y - 40 + U.rand(-30, 30), vx: U.rand(-40, 40), vy: U.rand(-40, 40), life: 0.2, size: 4, color: U.pick(WIND), add: true }); },
      ev: [[0.2, () => {
        const ad = P.aim(700, 0.3);
        Pr.spawn({ own: 'p', kind: 'windarrow', x: P.x + P.dir * 28, y: P.y - 40, vx: ad[0] * 1260, vy: ad[1] * 1260, dmg: v.dmg, range: 780 * (1 + P.d.range / 100), r: 26, pierce: 99, hitKind: 'arrow', kb: 1.4, ghost: true, light: 110 });
        Fx.ring(P.x + P.dir * 34, P.y - 40, 8, 70, '#c8ffe0', 0.3, 7); G.shake(4, 0.15); sfx('pierce');
        P.vx -= P.dir * 170;
      }]] });
  };
  EX.g_rain = (v) => {
    const d = P.dir, w = 350, cx = clamp(P.x + d * 245, 30, G.map.w - 30), s = G.World.groundBelow(cx, P.y - 50), gy = s ? s.y : P.y;
    P.startAct({ anim: 'shoot', dur: 0.5, lock: 0.3, ev: [[0.16, () => {
      let n = 0;
      sfx('rain');
      Fx.add({ x: cx, y: gy - 100, dur: v.hits * 0.2 + 0.25, next: 0.12, light: 120,
        upd(dt, e) {
          if (e.t >= e.next && n < v.hits) { e.next += 0.2; n++; C.hitBox({ x: cx - w / 2, y: gy - 310, w, h: 320 }, v.dmg, { kind: 'arrow', kb: 0.25 }); }
          if (n < v.hits) for (let k = 0; k < 3; k++) Fx.p({ x: cx + U.rand(-w / 2, w / 2) - d * 60, y: gy - U.rand(400, 470), vx: d * 200, vy: 1500, life: 0.29, size: 2.6, color: U.pick(WIND), type: 'spark', add: true });
          if (Math.random() < dt * 30 && n < v.hits) Fx.p({ x: cx + U.rand(-w / 2, w / 2), y: gy - 4, vy: -60, life: 0.25, size: 6, color: '#ffffff', add: true });
        },
        draw(c, p, e) { c.globalAlpha = 0.22 * Math.min(1, p * 8, (1 - p) * 5); A.ell(c, cx, gy, w / 2, 16); c.fillStyle = '#8ff0c0'; c.fill(); } });
    }]] });
  };
  EX.g_gale = (v, sk) => {
    P.addBuff('g_gale', v.dur, { aspd: v.aspd, spd: v.spd, col: '#8ff0c0', icon: sk.icon, name: sk.name });
    P.cheerT = 0.7;
    Fx.pillar(P.x, P.y, '#8ff0c0', 300, 0.7, 80); Fx.ring(P.x, P.y - 8, 10, 130, '#c8ffe0', 0.5, 8, { flat: 0.3 });
    Fx.burst(P.x, P.y - 30, 18, WIND, { s0: 60, s1: 260, g: -200, add: true }); sfx('buff', { rate: 1.2 });
  };
  EX.g_sky = (v) => {
    P.startAct({ anim: 'shoot', dur: 0.95, lock: 0, armor: true, ap: (a) => (a.t < 0.43 ? (a.t / 0.43) * 0.29 : 0.3 + ((a.t - 0.43) / 0.52) * 0.7),
      upd(dt, p, a) {
        if (a.t > 0.43) return;
        const an = Math.random() * TAU, r = U.rand(60, 130), bx = P.x + P.dir * 26, by = P.y - 40;
        Fx.p({ x: bx + Math.cos(an) * r, y: by + Math.sin(an) * r, vx: -Math.cos(an) * r * 3.4, vy: -Math.sin(an) * r * 3.4, life: 0.28, size: U.rand(3, 6), color: U.pick(['#fff7a8', '#a8e8ff', '#ffffff']), add: true });
        if (Math.random() < dt * 14) Fx.lightning([[bx + U.rand(-70, 70), by + U.rand(-70, 70)], [bx, by]], '#fff7a8', 0.12, 2);
      },
      ev: [[0.43, () => {
        const d = P.dir, x0 = P.x + d * 30, y = P.y - 42, x1 = d > 0 ? G.cam.x + G.W + 80 : G.cam.x - 80;
        C.hitBox({ x: Math.min(x0, x1), y: y - 58, w: Math.abs(x1 - x0), h: 116 }, v.dmg, { dir: d, kind: 'bolt', kb: 2 });
        Fx.add({ x: x0, y, x1, dur: 0.42, light: 260,
          draw(c, p, e) {
            const k = 1 - U.ease.inQuad(p), jit = 1 + Math.sin(e.t * 90) * 0.1;
            c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
            c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(e.x1, e.y);
            c.lineWidth = 110 * k * jit; c.strokeStyle = 'rgba(120,220,255,0.3)'; c.stroke();
            c.lineWidth = 60 * k * jit; c.strokeStyle = '#fff7a8'; c.stroke();
            c.lineWidth = 22 * k; c.strokeStyle = '#ffffff'; c.stroke();
            A.glow(c, e.x, e.y, 120 * k, '#fff7a8', 1);
          } });
        Fx.lightning([[x0, y], [(x0 + x1) / 2, y + U.rand(-30, 30)], [x1, y]], '#a8e8ff', 0.35, 6);
        Fx.lightning([[x0, y], [(x0 + x1) / 2, y + U.rand(-30, 30)], [x1, y]], '#fff7a8', 0.28, 4);
        Fx.flash('#fffbe0', 0.5, 0.3); G.shake(15, 0.45);
        P.vx = -d * 400;
      }]] });
    sfx('cast', { rate: 0.6 });
    G.after(0.2, () => sfx('sky')); // lead-in lands on the release at 0.43s
  };
})();
