'use strict';
/* 등불지기 — player: character data, derived stats, movement/physics, basic attacks, damage, growth, wisp companion */
(function () {
  const G = window.G, U = G.U, A = G.Art, D = G.D, I = G.Input, Fx = G.Fx;
  const P = (G.P = { w: 30, h: 68 });
  const GRAV = 2500, JUMP = 860, DJUMP = 740, MAXFALL = 1500;
  const sfx = (n, o) => { if (G.Audio) G.Audio.sfx(n, o); };
  const SAVED = ['name', 'look', 'line', 'tier', 'lv', 'exp', 'gold', 'stats', 'ap', 'sp', 'skills', 'hot', 'inv', 'eq', 'quests', 'beacons', 'hints', 'visited', 'town', 'pot', 'playtime', 'kills', 'deaths', 'ended', 'mapId', 'hp', 'mp'];

  P.resetRuntime = function () {
    Object.assign(P, {
      x: 0, y: 0, vx: 0, vy: 0, dir: 1, onGround: false, ground: null, coyote: 0, jbuf: 0, jumps: 0, cut: false,
      ladder: null, ladderCd: 0, climbT: 0, dropPlat: null, dropT: 0, act: null, iv: 0, hurtT: 0, dead: false, deadT: 0,
      cd: {}, buffs: [], combo: 0, comboT: 0, animT: 0, cheerT: 0, sinceHurt: 99, potCd: 0, potT: { hp: 0, mp: 0 }, stepT: 0, slowT: 0, hpF: 0, mpF: 0,
      wisp: { x: 0, y: 0, say: null, lines: null, sayT: 0, queue: [], mood: null, moodT: 0 }, _look: null, pose: null,
    });
  };
  P.newChar = function (name, look) {
    Object.assign(P, {
      name: name || '등불지기', look, line: 'novice', tier: 0, lv: 1, exp: 0, gold: 80,
      stats: { str: 5, dex: 5, int: 5, vit: 5 }, ap: 0, sp: 0, skills: { n_smash: 1 }, hot: ['n_smash', null, null, null, null, null],
      inv: new Array(36).fill(null), eq: { weapon: D.makeItem('rod1', 0, 0), helm: null, armor: D.makeItem('armor1', 0, 0), gloves: null, boots: null, charm: null },
      quests: {}, beacons: {}, hints: {}, visited: {}, town: 'town', pot: { hp: null, mp: null }, playtime: 0, kills: 0, deaths: 0, ended: false, mapId: 'town',
    });
    P.resetRuntime();
    G.Inv.add('hp1', 5); G.Inv.add('mp1', 3);
    P.recalc(); P.hp = P.d.maxHp; P.mp = P.d.maxMp;
  };
  P.serialize = function () { const o = { v: 1 }; for (const k of SAVED) o[k] = P[k]; return JSON.parse(JSON.stringify(o)); };
  P.deserialize = function (o) {
    for (const k of SAVED) if (o[k] !== undefined) P[k] = o[k];
    while (P.inv.length < 36) P.inv.push(null);
    P.resetRuntime(); P.recalc();
    P.hp = U.clamp(o.hp || P.d.maxHp, 1, P.d.maxHp); P.mp = U.clamp(o.mp === undefined ? P.d.maxMp : o.mp, 0, P.d.maxMp);
  };
  P.place = function (x, y) {
    P.x = x; P.y = y; P.vx = P.vy = 0; P.ladder = null; P.act = null; P.onGround = true; P.dropPlat = null;
    P.wisp.x = x - 30; P.wisp.y = y - 84;
  };
  P.jobName = () => D.jobName(P.line, P.tier);
  P.weaponKind = () => { const w = P.eq.weapon; return w ? D.ITEMS[w.b].kind : 'none'; };
  P.artLook = function () {
    if (!P._look) {
      const w = P.eq.weapon, b = w && D.ITEMS[w.b];
      P._look = Object.assign({}, P.look, { job: P.line, tier: Math.max(0, P.tier - 1), weapon: b ? { kind: b.kind, tier: b.tier, enh: w.enh || 0 } : null });
    }
    return P._look;
  };

  // ------------------------------------------------------------ derived stats
  P.recalc = function () {
    const L = D.LINES[P.line], s = Object.assign({}, P.stats);
    const b = { atk: 0, def: 0, hp: 0, mp: 0, crit: 0, atkp: 0, spd: 0, expp: 0, goldp: 0 };
    for (const k in P.eq) {
      const item = P.eq[k];
      if (!item) continue;
      const st = D.itemStats(item);
      for (const kk in st) { if (kk in s) s[kk] += st[kk]; else b[kk] = (b[kk] || 0) + st[kk]; }
    }
    const pv = (id) => { const l = P.skills[id]; return l ? D.SKILLS[id].v(l) : null; };
    let hpp = 0, mpp = 0, defp = 0, atkp = b.atkp, crit = 5 + b.crit, critDmg = 150, leech = 0, ward = 0, cdr = 0, range = 0, twin = 0, mpRegen = 0, aspd = 0, spd = b.spd, v;
    if ((v = pv('b_body'))) { hpp += v.hpp; defp += v.defp; }
    if ((v = pv('b_mastery'))) { atkp += v.atkp; crit += v.crit; }
    if ((v = pv('b_ember'))) { leech += v.leech; critDmg += v.critDmg; }
    if ((v = pv('s_mind'))) { mpp += v.mpp; mpRegen += v.regen; }
    if ((v = pv('s_wisdom'))) { atkp += v.atkp; cdr += v.cdr; }
    if ((v = pv('s_ward'))) ward += v.ward;
    if ((v = pv('g_eye'))) { crit += v.crit; range += v.range; }
    if ((v = pv('g_mastery'))) { atkp += v.atkp; critDmg += v.critDmg; }
    if ((v = pv('g_twin'))) twin += v.twin;
    for (const bf of P.buffs) { if (bf.atkp) atkp += bf.atkp; if (bf.aspd) aspd += bf.aspd; if (bf.spd) spd += bf.spd; }
    const main = s[L.main], wAtk = b.atk || 3, d = (P.d = {});
    d.s = s;
    d.atk = Math.round((wAtk * (1 + main * 0.012) + main * 0.5 + P.lv * 1.2) * (1 + atkp / 100));
    d.def = Math.round((b.def + s.vit * 0.4 + P.lv * 0.5) * (1 + defp / 100));
    d.maxHp = Math.round(((60 + P.lv * 16 + s.vit * 9 + s.str * 2) * L.hp + b.hp) * (1 + hpp / 100));
    d.maxMp = Math.round(((30 + P.lv * 7 + s.int * 3) * L.mp + b.mp) * (1 + mpp / 100));
    d.crit = Math.min(80, Math.round((crit + s.dex * 0.12) * 10) / 10); d.critDmg = critDmg;
    d.spd = 250 * (1 + Math.min(60, spd) / 100); d.spdp = spd; d.aspd = 1 + aspd / 100;
    d.expp = b.expp; d.goldp = b.goldp; d.leech = leech; d.ward = Math.min(60, ward); d.cdr = cdr; d.range = range; d.twin = twin; d.mpRegen = mpRegen; d.atkp = atkp;
    if (P.hp > d.maxHp) P.hp = d.maxHp;
    if (P.mp > d.maxMp) P.mp = d.maxMp;
    P._look = null;
    G.emit('stats');
  };
  P.addBuff = function (id, dur, eff) {
    const i = P.buffs.findIndex((b) => b.id === id);
    if (i >= 0) P.buffs.splice(i, 1);
    P.buffs.push(Object.assign({ id, t: dur, dur }, eff));
    P.recalc();
  };
  P.heal = function (n, silent) {
    n = Math.min(n, P.d.maxHp - P.hp);
    if (n <= 0) return;
    P.hp += n; if (!silent && n >= 1) Fx.num(P.x, P.y - 84, n, 'heal');
    G.emit('hp');
  };
  P.gainMp = function (n, silent) {
    n = Math.min(n, P.d.maxMp - P.mp);
    if (n <= 0) return;
    P.mp += n; if (!silent && n >= 1) Fx.num(P.x, P.y - 104, n, 'mp');
    G.emit('hp');
  };

  // ------------------------------------------------------------ growth
  P.gainExp = function (n) {
    if (P.lv >= D.MAX_LV) return;
    n = Math.max(1, Math.round(n * (1 + P.d.expp / 100)));
    P.exp += n;
    let up = false;
    while (P.lv < D.MAX_LV && P.exp >= D.expNeed(P.lv)) { P.exp -= D.expNeed(P.lv); P.lv++; up = true; P.ap += D.STAT_PER_LV; P.sp += P.line === 'novice' ? (P.lv <= 5 ? 1 : 0) : D.SP_PER_LV; }
    if (P.lv >= D.MAX_LV) P.exp = 0;
    if (up) P.levelUp();
    G.emit('exp', n);
  };
  P.levelUp = function () {
    P.recalc(); P.hp = P.d.maxHp; P.mp = P.d.maxMp; P.cheerT = 1.3;
    Fx.pillar(P.x, P.y, '#ffe07a', 460, 1.0, 90);
    Fx.ring(P.x, P.y - 6, 10, 150, '#fff3b0', 0.7, 8, { flat: 0.3 });
    Fx.burst(P.x, P.y - 40, 26, ['#fff3b0', '#ffd27a', '#ffffff'], { type: 'star', s0: 80, s1: 320, g: -120, l0: 0.6, l1: 1.2, z0: 4, z1: 9, add: true });
    sfx('levelup');
    G.emit('levelup', P.lv); G.emit('hp');
    G.Quest.check();
    P.hint('levelup');
    if (P.tier === 0 && P.lv >= D.JOB_LV[1]) P.hint('job');
    else if (P.tier === 1 && P.lv >= D.JOB_LV[2]) P.hint('job2');
    else if (P.tier === 2 && P.lv >= D.JOB_LV[3]) P.hint('job3');
    G.Game.save();
  };
  P.addStat = function (k, n) {
    n = Math.min(n || 1, P.ap);
    if (n <= 0) return;
    P.stats[k] += n; P.ap -= n; P.recalc(); sfx('skill_up');
  };
  P.autoStat = function () {
    const main = D.LINES[P.line].main;
    while (P.ap > 0) { const k = P.ap % 3 === 0 ? 'vit' : main; P.stats[k]++; P.ap--; }
    P.recalc(); sfx('skill_up');
  };
  P.skillUp = function (id) {
    const sk = D.SKILLS[id], lv = P.skills[id] || 0;
    if (!sk || P.sp <= 0 || lv >= sk.max || sk.line !== P.line || sk.tier > P.tier) return false;
    P.skills[id] = lv + 1; P.sp--; P.recalc(); sfx('skill_up'); G.emit('skills');
    return true;
  };

  // ------------------------------------------------------------ wisp speech / hints
  P.say = function (text, dur) { P.wisp.queue.push([text, dur || 4.5]); };
  P.hint = function (id) { if (P.hints[id] || !D.HINTS[id]) return; P.hints[id] = 1; P.say(D.HINTS[id], 5.5); };

  // ------------------------------------------------------------ acts (timed action with events)
  // o: anim, dur, lock (move speed factor), ev: [[time, fn]], upd(dt, p), end(), inv, float, vx, turn, jump, basic
  P.startAct = function (o) { P.act = Object.assign({ t: 0, dur: 0.4, lock: 0.35, ev: [], i: 0 }, o); return P.act; };
  function updateAct(dt) {
    const a = P.act;
    if (!a) return;
    a.t += dt;
    while (P.act === a && a.i < a.ev.length && a.t >= a.ev[a.i][0]) { const f = a.ev[a.i][1]; a.i++; f(a); }
    if (P.act !== a) return;
    if (a.upd) a.upd(dt, U.sat(a.t / a.dur), a);
    if (P.act === a && a.t >= a.dur) { P.act = null; if (a.end) a.end(a); }
  }

  // ------------------------------------------------------------ basic attacks
  P.slashColor = () => (P.line === 'blade' ? ['#fff1c4', '#ff8a3c'] : P.line === 'star' ? ['#ffffff', '#8fa8ff'] : P.line === 'gale' ? ['#ffffff', '#8ff0c0'] : ['#ffffff', '#ffd98a']);
  function meleeHit(n) {
    const wk = P.weaponKind(), reach = wk === 'sword' ? 88 : 76, mult = [0, 100, 108, 135][n], col = P.slashColor();
    const box = { x: P.dir > 0 ? P.x - 16 : P.x - reach, y: P.y - 96, w: reach + 16, h: 108 };
    if (n === 3) Fx.slash(P.x + P.dir * 12, P.y - 36, P.dir, { r: reach + 8, a0: -0.42, a1: 0.42, col: col[0], col2: col[1], dur: 0.2, w: 0.5 });
    else Fx.slash(P.x + P.dir * 14, P.y - 38, P.dir, { r: reach - 6, a0: n === 2 ? 1.3 : -1.9, a1: n === 2 ? -1.8 : 1.2, col: col[0], col2: col[1] });
    G.Combat.hitBox(box, mult, { max: wk === 'sword' ? 4 : 3, dir: P.dir, kind: P.line === 'blade' ? 'fire' : 'slash', kb: n === 3 ? 1.7 : 1, melee: true });
  }
  // aim assist: unit direction toward the nearest target in front, limited to ±lim radians from horizontal
  P.aim = function (range, lim, y) {
    const py = y === undefined ? P.y - 40 : y, tg = G.Combat.nearest(P.x, py, range, P.dir);
    if (!tg) return [P.dir, 0];
    const a = U.clamp(Math.atan2(tg.y - tg.h / 2 - py, Math.max(30, (tg.x - P.x) * P.dir)), -lim, lim);
    return [P.dir * Math.cos(a), Math.sin(a)];
  };
  P.fireArrow = function (mult, o) {
    const range = 540 * (1 + P.d.range / 100), d = P.aim(range, 0.62), sp = 1000;
    return G.Proj.spawn(Object.assign({ own: 'p', kind: 'arrow', x: P.x + P.dir * 26, y: P.y - 40, vx: d[0] * sp, vy: d[1] * sp, dmg: mult, range, r: 11, hitKind: 'arrow', pierce: 1 }, o));
  };
  P.fireBolt = function (mult, o) {
    const d = P.aim(450, 0.62, P.y - 46), sp = 660;
    return G.Proj.spawn(Object.assign({ own: 'p', kind: 'bolt', x: P.x + P.dir * 30, y: P.y - 46, vx: d[0] * sp, vy: d[1] * sp, dmg: mult, range: 450, r: 12, hitKind: 'magic', light: 80, homing: 0.6 }, o));
  };
  function startBasic(n) {
    const wk = P.weaponKind(), as = P.d.aspd;
    if (wk === 'staff') {
      P.startAct({ anim: 'cast', dur: 0.4 / as, lock: 0.5, basic: true, jump: true, ev: [[0.13 / as, () => { P.fireBolt(100); sfx('cast'); }]], end: basicEnd });
      return;
    }
    if (wk === 'bow') {
      P.startAct({ anim: 'shoot', dur: 0.38 / as, lock: 0.5, basic: true, jump: true, end: basicEnd,
        ev: [[0.12 / as, () => { P.fireArrow(100); sfx('bow'); if (P.d.twin && U.chance(P.d.twin / 100)) G.after(0.07, () => { if (!P.dead) P.fireArrow(100, { y: P.y - 48 }); }); }]] });
      return;
    }
    const dur = (n === 3 ? 0.42 : 0.32) / as;
    P.combo = n;
    P.startAct({ anim: 'atk' + n, dur, lock: 0.35, basic: true, jump: true, ev: [[dur * 0.28, () => meleeHit(n)]], end: basicEnd });
    if (P.onGround) P.vx += P.dir * (n === 3 ? 170 : 80);
    sfx(n === 3 ? 'swing2' : 'swing', { rate: 1 + (n - 1) * 0.08 });
  }
  function basicEnd(a) {
    P.comboT = 0.5;
    if (!P.dead && !G.S.lock && I.isDown('attack')) startBasic(a.anim.startsWith('atk') ? (P.combo % 3) + 1 : 1);
  }

  // ------------------------------------------------------------ interaction
  function findInteract() {
    const m = G.map;
    let best = null, bd = 62;
    for (const n of m.npcs) { const d = Math.abs(n.x - P.x); if (d < bd && Math.abs(n.y - P.y) < 50) { bd = d; best = { type: 'npc', o: n, x: n.x, y: n.y - 86 * (n.def.look.scale || 1) - 62, label: '↑ 대화' }; } }
    if (best) return best;
    const b = m.beacon;
    if (b && Math.abs(b.x - P.x) < 84 && Math.abs(b.y - P.y) < 50 && !m.boss) return { type: 'beacon', o: b, x: b.x, y: b.y - 368, label: b.lit ? '↑ 수호자 재도전' : '↑ 불씨 지피기' };
    for (const p of m.portals) if (Math.abs(p.x - P.x) < 44 && Math.abs(p.y - P.y) < 50) return { type: 'portal', o: p, x: p.x, y: p.y - 156, label: '↑ 이동' };
    return null;
  }
  P.near = null;
  function interact() {
    const it = P.near;
    if (!it) return false;
    if (it.type === 'npc') G.UI.talk(it.o);
    else if (it.type === 'beacon') G.Game.beaconInteract();
    else if (it.type === 'portal') G.World.travel(it.o.to, it.o.tp);
    return true;
  }

  // ------------------------------------------------------------ control + physics
  function ladderMove(dt, mv, locked) {
    const l = P.ladder;
    P.vx = 0; P.vy = 0; P.x = l.x;
    let cy = 0;
    if (!locked) { if (I.isDown('up')) cy -= 1; if (I.isDown('down')) cy += 1; }
    P.y += cy * 185 * dt;
    if (cy) P.climbT += dt;
    if (mv) P.dir = mv;
    if (P.y <= l.y1) { // top: step onto the surface
      P.y = l.y1; P.ladder = null; P.ladderCd = 0.25;
      let s = null;
      for (const sf of G.map.surfaces) if (Math.abs(sf.y - l.y1) < 4 && l.x > sf.x1 - 34 && l.x < sf.x2 + 34) s = sf;
      if (s) P.x = U.clamp(P.x, s.x1 - P.w / 2 + 8, s.x2 + P.w / 2 - 8);
      P.onGround = true;
    } else if (P.y >= l.y2) { P.y = l.y2; P.ladder = null; P.ladderCd = 0.2; }
    else if (!locked && I.hit('jump')) { P.ladder = null; P.ladderCd = 0.3; P.vy = I.isDown('down') ? 0 : -520; P.vx = mv * 230; P.jumps = 1; sfx('jump'); }
  }
  function tryGrab() {
    const up = I.isDown('up'), down = I.isDown('down');
    if (!up && !down) return;
    for (const l of G.map.ladders) {
      if (Math.abs(P.x - l.x) > 20) continue;
      if (up && P.y > l.y1 + 6 && P.y <= l.y2 + 3) { P.ladder = l; P.x = l.x; P.vx = P.vy = 0; P.y = Math.min(P.y, l.y2 - 2); return; }
      if (down && P.onGround && Math.abs(P.y - l.y1) < 4) { P.ladder = l; P.x = l.x; P.vx = P.vy = 0; P.y = l.y1 + 8; P.onGround = false; return; }
    }
  }
  function control(dt) {
    const a = P.act, locked = !!G.S.lock || P.hurtT > 0;
    let mv = 0;
    if (!locked) { if (I.isDown('left')) mv -= 1; if (I.isDown('right')) mv += 1; }
    P.near = P.onGround && !a ? findInteract() : null;
    if (!locked && !a && I.hit('up') && interact()) { P.ladderCd = 0.35; P.vx = 0; return; }
    if (P.ladder) { ladderMove(dt, mv, locked); return; }
    if (!locked && !a && P.ladderCd <= 0) { tryGrab(); if (P.ladder) return; }
    if (mv && (!a || a.turn)) P.dir = mv;
    if (a && a.vx !== undefined) P.vx = a.vx;
    else {
      const spd = P.d.spd * (a ? a.lock : 1) * (P.slowT > 0 ? 0.55 : 1);
      if (mv) P.vx = U.approach(P.vx, mv * spd, (P.onGround ? 3400 : 2200) * dt);
      else P.vx = U.approach(P.vx, 0, (P.onGround ? 3600 : 700) * dt);
    }
    if (!locked && I.hit('jump')) P.jbuf = 0.12;
    if (P.jbuf > 0) P.jbuf -= dt;
    if (P.onGround) { P.coyote = 0.09; P.jumps = 0; } else if (P.coyote > 0) P.coyote -= dt;
    if (P.jbuf > 0 && (!a || a.jump)) {
      if (P.coyote > 0) {
        if (I.isDown('down') && P.ground && P.ground.h === undefined) { P.dropPlat = P.ground; P.dropT = 0.28; P.y += 3; P.onGround = false; P.coyote = 0; P.jbuf = 0; P.jumps = 1; }
        else { P.vy = -JUMP; P.jumps = 1; P.coyote = 0; P.jbuf = 0; P.onGround = false; P.cut = true; sfx('jump'); Fx.dust(P.x, P.y, 3); }
      } else if (P.jumps < 2) {
        P.vy = -DJUMP; P.jumps = 2; P.jbuf = 0; P.cut = false;
        if (mv) P.vx = mv * Math.max(Math.abs(P.vx), P.d.spd * 1.25);
        sfx('djump'); Fx.ring(P.x, P.y - 4, 8, 36, '#ffffff', 0.3, 4, { flat: 0.35 });
        Fx.burst(P.x, P.y, 5, '#ffffff', { s0: 30, s1: 120, g: 200, z0: 2, z1: 4, l0: 0.2, l1: 0.4 });
      }
    }
    if (!(a && a.float)) P.vy = Math.min(MAXFALL, P.vy + GRAV * dt);
    if (locked) return;
    // actions
    if (I.hit('hp')) G.Inv.quick('hp');
    if (I.hit('mp')) G.Inv.quick('mp');
    for (let i = 0; i < 6; i++) { const id = P.hot[i]; if (id && I.isDown('s' + i) && G.Skills.use(id, I.hit('s' + i))) return; }
    if (I.isDown('attack') && !P.act) startBasic(P.comboT > 0 ? (P.combo % 3) + 1 : 1);
  }
  function physics(dt) {
    const m = G.map, hw = P.w / 2;
    if (P.ladder) return;
    P.x += P.vx * dt;
    let bx = P.x - hw, by = P.y - P.h;
    for (const s of m.solids) {
      if (bx < s.x + s.w && bx + P.w > s.x && by < s.y + s.h && by + P.h > s.y) {
        if (P.vx > 0 || (P.vx === 0 && P.x < s.x + s.w / 2)) P.x = s.x - hw - 0.01; else P.x = s.x + s.w + hw + 0.01;
        P.vx = 0; bx = P.x - hw;
      }
    }
    P.x = U.clamp(P.x, hw + 4, m.w - hw - 4);
    bx = P.x - hw;
    const prevY = P.y, wasGround = P.onGround;
    P.y += P.vy * dt;
    P.onGround = false;
    by = P.y - P.h;
    for (const s of m.solids) {
      if (bx < s.x + s.w && bx + P.w > s.x && by < s.y + s.h && by + P.h > s.y) {
        if (P.vy >= 0 && prevY <= s.y + 2) { P.y = s.y; P.vy = 0; P.onGround = true; P.ground = s; }
        else if (P.vy < 0 && prevY - P.h >= s.y + s.h - 2) { P.y = s.y + s.h + P.h + 0.01; P.vy = 0; }
        by = P.y - P.h;
      }
    }
    if (!P.onGround && P.vy >= 0) {
      for (const p of m.plats) {
        if (p === P.dropPlat) continue;
        if (P.x + hw > p.x && P.x - hw < p.x + p.w && prevY <= p.y + 2 && P.y >= p.y) { P.y = p.y; P.vy = 0; P.onGround = true; P.ground = p; break; }
      }
    }
    if (P.y > m.h + 300) { const pt = m.portals[0]; P.place(pt.x, pt.y); }
    if (P.onGround && !wasGround && P.landV > 500) { sfx('land'); Fx.dust(P.x, P.y, 4); }
    P.landV = P.onGround ? 0 : P.vy;
    if (P.onGround && Math.abs(P.vx) > 120) { P.stepT -= dt; if (P.stepT <= 0) { P.stepT = 0.27; sfx('step', { vol: 0.5 }); } }
  }
  function updateWisp(dt) {
    const w = P.wisp, t = G.time;
    let tx = P.x - P.dir * 36, ty = P.y - 88 + Math.sin(t * 2.3) * 6, k = 4.5;
    // fetch nearby loot
    let nd = null, bd = 320;
    for (const d of G.drops) { if (d.state !== 'rest' || d.t < 0.7 || d.full) continue; const dd = U.dist(P.x, P.y - 30, d.x, d.y); if (dd < bd) { bd = dd; nd = d; } }
    if (nd) { tx = nd.x; ty = nd.y - 14; k = 9; if (U.dist(w.x, w.y, nd.x, nd.y - 14) < 26) nd.state = 'magnet'; }
    w.x += (tx - w.x) * Math.min(1, dt * k); w.y += (ty - w.y) * Math.min(1, dt * k);
    if (Math.random() < dt * 9) Fx.p({ x: w.x + U.rand(-5, 5), y: w.y + 4, vx: U.rand(-12, 12), vy: U.rand(10, 40), life: U.rand(0.4, 0.8), size: U.rand(2, 4), color: '#ffd98a', add: true });
    if (w.moodT > 0) { w.moodT -= dt; if (w.moodT <= 0) w.mood = null; }
    if (w.say) { w.sayT -= dt; if (w.sayT <= 0) { w.say = null; w.lines = null; } }
    else if (w.queue.length && !G.S.lock) { const [txt, dur] = w.queue.shift(); w.say = txt; w.sayT = dur; w.lines = null; w.mood = 'happy'; w.moodT = 0.8; sfx('talk'); }
  }
  P.update = function (dt) {
    const m = G.map;
    P.playtime += dt; P.animT += dt;
    if (P.iv > 0) P.iv -= dt;
    if (P.hurtT > 0) P.hurtT -= dt;
    if (P.ladderCd > 0) P.ladderCd -= dt;
    if (P.dropT > 0) { P.dropT -= dt; if (P.dropT <= 0) P.dropPlat = null; }
    if (P.cheerT > 0) P.cheerT -= dt;
    if (P.potCd > 0) P.potCd -= dt;
    if (P.potT.hp > 0) P.potT.hp -= dt;
    if (P.potT.mp > 0) P.potT.mp -= dt;
    if (P.comboT > 0) P.comboT -= dt;
    if (P.slowT > 0) P.slowT -= dt;
    P.sinceHurt += dt;
    for (const k in P.cd) if (P.cd[k] > 0) P.cd[k] = Math.max(0, P.cd[k] - dt);
    let ch = false;
    for (let i = P.buffs.length - 1; i >= 0; i--) { P.buffs[i].t -= dt; if (P.buffs[i].t <= 0) { P.buffs.splice(i, 1); ch = true; } }
    if (ch) P.recalc();
    if (P.dead) {
      P.deadT += dt; P.vx = U.approach(P.vx, 0, 900 * dt); P.vy = Math.min(MAXFALL, P.vy + GRAV * dt);
      physics(dt); updateWisp(dt);
      return;
    }
    // regeneration
    const hr = m.town ? 0.07 : P.sinceHurt > 6 ? 0.012 : 0.002, mr = (m.town ? 0.09 : 0.012) * P.d.maxMp + P.d.mpRegen;
    P.hpF += P.d.maxHp * hr * dt; P.mpF += mr * dt;
    if (P.hpF >= 1) { const n = Math.floor(P.hpF); P.hpF -= n; if (P.hp < P.d.maxHp) { P.hp = Math.min(P.d.maxHp, P.hp + n); G.emit('hp'); } }
    if (P.mpF >= 1) { const n = Math.floor(P.mpF); P.mpF -= n; if (P.mp < P.d.maxMp) { P.mp = Math.min(P.d.maxMp, P.mp + n); G.emit('hp'); } }
    control(dt);
    updateAct(dt);
    physics(dt);
    updateWisp(dt);
  };

  // ------------------------------------------------------------ damage / death
  P.invul = () => P.dead || P.iv > 0 || !!(P.act && P.act.inv) || !!G.S.trans || !!G.S.cine;
  P.hurt = function (raw, fromX, o) {
    if (P.invul()) return false;
    o = o || {};
    const K = 100 + 4 * (o.lv || G.map.lvRef || 1); // armor matters less against higher-level attackers
    let dmg = Math.max(1, Math.round((raw * U.rand(0.88, 1.12) * K) / (K + P.d.def)));
    if (P.d.ward > 0 && P.mp > 0) { const wd = Math.min(P.mp, Math.round((dmg * P.d.ward) / 100)); P.mp -= wd; dmg -= wd; }
    dmg = Math.max(1, dmg);
    P.hp -= dmg; P.iv = 1.0; P.hurtT = 0.26; P.sinceHurt = 0;
    const kd = fromX === undefined ? -P.dir : P.x < fromX ? -1 : 1;
    P.vx = kd * 250 * (o.kb || 1); P.vy = Math.min(P.vy, -(o.up || 330));
    P.ladder = null; P.onGround = false;
    if (P.act && !P.act.armor) P.act = null;
    if (o.slow) P.slowT = o.slow;
    Fx.num(P.x, P.y - 80, dmg, 'hurt');
    Fx.burst(P.x, P.y - 40, 8, ['#ff9aa8', '#ffffff'], { s0: 80, s1: 260, l0: 0.2, l1: 0.45, z0: 3, z1: 6 });
    G.shake(6, 0.2); sfx('hurt');
    G.emit('hp'); G.emit('hurt', dmg);
    if (P.hp <= 0) P.die();
    else if (P.hp < P.d.maxHp * 0.35) P.hint('potion');
    return true;
  };
  P.die = function () {
    P.hp = 0; P.dead = true; P.deadT = 0; P.act = null; P.deaths++; P.buffs.length = 0; P.recalc();
    sfx('death'); G.shake(10, 0.4);
    Fx.burst(P.x, P.y - 40, 18, ['#ffd98a', '#ffffff'], { type: 'star', s0: 60, s1: 260, g: 100, l0: 0.5, l1: 1, z0: 4, z1: 8, add: true });
    G.emit('death');
  };
  P.respawn = function () {
    let lost = 0;
    if (P.lv >= 10 && P.lv < D.MAX_LV) { lost = Math.min(P.exp, Math.round(D.expNeed(P.lv) * 0.04)); P.exp -= lost; }
    P.dead = false; P.hp = Math.round(P.d.maxHp * 0.6); P.mp = Math.round(P.d.maxMp * 0.6); P.iv = 2;
    G.S.trans = null;
    G.World.load(P.town || 'town');
    G.emit('hp'); G.emit('exp', 0);
    P.hint('dead');
    return lost;
  };

  // ------------------------------------------------------------ draw
  const AN = { state: 'idle', t: 0, p: 0, speed: 0 };
  P.draw = function (ctx) {
    const a = P.act;
    let st = 'idle', p = 0, t = P.animT;
    if (P.dead) st = 'dead';
    else if (a) { st = a.anim; p = a.ap ? a.ap(a) : U.sat(a.t / a.dur); }
    else if (P.hurtT > 0) st = 'hurt';
    else if (P.ladder) { st = 'climb'; t = P.climbT; }
    else if (!P.onGround) st = P.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(P.vx) > 40) st = 'run';
    else if (P.cheerT > 0) st = 'cheer';
    AN.state = st; AN.t = t; AN.p = p; AN.speed = Math.abs(P.vx);
    const gb = G.World.groundBelow(P.x, P.y);
    if (gb && !P.ladder) { const h = gb.y - P.y; if (h < 320) A.shadow(ctx, P.x, gb.y, 17 * (1 - h / 420), 0.26 * (1 - h / 340)); }
    ctx.save(); ctx.translate(P.x, P.y); ctx.scale(P.dir, 1);
    if (P.iv > 0 && !P.dead && !(a && a.inv) && ((P.iv * 14) | 0) % 2 === 0) ctx.globalAlpha = 0.45;
    if (a && a.drawPre) a.drawPre(ctx, p);
    P.pose = A.hero(ctx, P.artLook(), AN);
    ctx.restore();
    if (P.buffs.length && !P.dead) {
      for (const b of P.buffs) if (Math.random() < 0.25) Fx.p({ x: P.x + U.rand(-16, 16), y: P.y - U.rand(0, 20), vy: U.rand(-90, -40), life: 0.6, size: U.rand(2, 5), color: b.col || '#ffd27a', add: true });
    }
    const w = P.wisp;
    ctx.save(); ctx.translate(w.x, w.y); A.wisp(ctx, G.time, w.mood); ctx.restore();
  };
  function wrap(ctx, text, maxW) {
    const lines = []; let cur = '';
    for (const ch of text) { if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch === ' ' ? '' : ch; } else cur += ch; }
    if (cur) lines.push(cur);
    return lines;
  }
  P.drawOverlay = function (ctx) {
    if (!P.dead) W_tag(ctx, P.x, P.y + 16, P.name, '#ffffff', 'rgba(28,20,44,0.55)');
    const it = P.near;
    if (it && !G.S.lock) {
      const by = it.y + Math.sin(G.time * 5) * 3;
      W_tag(ctx, it.x, by, it.label, '#2b2136', 'rgba(255,224,122,0.96)');
    }
    const w = P.wisp;
    if (w.say) {
      ctx.font = '700 14px ' + A.FONT;
      if (!w.lines) w.lines = wrap(ctx, w.say, 230);
      let mw = 0;
      for (const l of w.lines) mw = Math.max(mw, ctx.measureText(l).width);
      const bw = mw + 24, bh = w.lines.length * 20 + 14, a = Math.min(1, w.sayT * 3, (w.lines ? 1 : 0));
      let bx = U.clamp(w.x - bw / 2, G.cam.x + 8, G.cam.x + G.W - bw - 8), by = w.y - 30 - bh;
      ctx.globalAlpha = a;
      A.rr(ctx, bx, by, bw, bh, 12); ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = '#e8962a'; ctx.stroke();
      A.poly(ctx, [w.x - 7, by + bh - 1, w.x + 7, by + bh - 1, w.x, by + bh + 9]); ctx.fillStyle = '#fffaf0'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(w.x - 7, by + bh); ctx.lineTo(w.x, by + bh + 9); ctx.lineTo(w.x + 7, by + bh); ctx.stroke();
      ctx.fillStyle = '#4a3320'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      w.lines.forEach((l, i) => ctx.fillText(l, bx + 12, by + 17 + i * 20));
      ctx.globalAlpha = 1;
    }
  };
  function W_tag(ctx, x, y, s, c, bg) { G.World.tag(ctx, x, y, s, c, bg); }
})();
