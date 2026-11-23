'use strict';
/* 등불지기 — player: character data, derived stats, movement/physics, basic attacks, damage, growth, wisp companion */
(function () {
  const G = window.G, U = G.U, A = G.Art, D = G.D, I = G.Input, Fx = G.Fx;
  const P = (G.P = { w: 30, h: 68 });
  const GRAV = 2500, JUMP = 860, DJUMP = 740, MAXFALL = 1500;
  // portals take a short hold of ↑: the gate fills with light and takes you when full. A tap never travels.
  const PORTAL_HOLD = 0.4, UP_GRACE = 0.12, TICK_RATE = [1, 1.26, 1.5];
  const sfx = (n, o) => { if (G.Audio) G.Audio.sfx(n, o); };
  const SAVED = ['name', 'look', 'line', 'tier', 'lv', 'exp', 'gold', 'stats', 'ap', 'sp', 'skills', 'hot', 'inv', 'eq', 'quests', 'beacons', 'hints', 'visited', 'town', 'pot', 'auto', 'freeReset', 'playtime', 'kills', 'deaths', 'ended', 'mapId', 'hp', 'mp', 'bossRec', 'seen'];
  const SAVE_V = 2;
  const NOBUFF = [];

  P.resetRuntime = function () {
    Object.assign(P, {
      x: 0, y: 0, vx: 0, vy: 0, dir: 1, onGround: false, ground: null, coyote: 0, jbuf: 0, jumps: 0, cut: false,
      ladder: null, ladderCd: 0, climbT: 0, dropPlat: null, dropT: 0, act: null, iv: 0, hurtT: 0, flinchT: 0, dead: false, deadT: 0,
      cd: {}, buffs: [], combo: 0, comboT: 0, animT: 0, cheerT: 0, sinceHurt: 99, potCd: 0, potT: { hp: 0, mp: 0 }, stepT: 0, slowT: 0, hpF: 0, mpF: 0,
      qSk: null, sqX: 1, sqY: 1, autoT: 0, noPotT: 0, portT: 0, portO: null, portStep: 0, upArm: false, upT: 9,
      wisp: { x: 0, y: 0, say: null, sayT: 0, sayN: 0, queue: [], mood: null, moodT: 0 }, _look: null, pose: null,
    });
  };
  P.newChar = function (name, look) {
    Object.assign(P, {
      name: name || '등불지기', look, line: 'novice', tier: 0, lv: 1, exp: 0, gold: 80,
      stats: { str: 5, dex: 5, int: 5, vit: 5 }, ap: 0, sp: 0, skills: { n_smash: 1 }, hot: ['n_smash', null, null, null, null, null, null, null],
      inv: new Array(36).fill(null), eq: { weapon: D.makeItem('rod1', 0, 0), helm: null, armor: D.makeItem('armor1', 0, 0), gloves: null, boots: null, charm: null },
      quests: {}, beacons: {}, hints: {}, visited: {}, town: 'town', pot: { hp: null, mp: null }, auto: { hp: 0, mp: 0 }, freeReset: 0,
      playtime: 0, kills: 0, deaths: 0, ended: false, mapId: 'town', migrated: false,
      bossRec: {}, // guardian attempts by beacon map: { n tries, best / last = HP fraction it had left, top attack that hurt most … } (game.js)
      seen: {},    // kinds of gear ever owned (item base id → 1): a dropped piece of a kind not in here shows NEW (combat.js · ui.js)
    });
    G.Inv.seeOwned();
    P.cpLive = false;
    P.resetRuntime();
    G.Inv.add('hp1', 5); G.Inv.add('mp1', 3);
    P.recalc(); P.hp = P.d.maxHp; P.mp = P.d.maxMp;
  };
  P.serialize = function () { const o = { v: SAVE_V }; for (const k of SAVED) o[k] = P[k]; return JSON.parse(JSON.stringify(o)); };
  P.deserialize = function (o) {
    for (const k of SAVED) if (o[k] !== undefined) P[k] = o[k];
    while (P.inv.length < 36) P.inv.push(null);
    if (!Array.isArray(P.hot)) P.hot = [];
    while (P.hot.length < I.SLOTS) P.hot.push(null); // v1 saves had 6 slots (A S D F Q W) — the same keys keep the same indices
    P.hot.length = I.SLOTS;
    if (!P.pot) P.pot = { hp: null, mp: null };
    if (!P.auto) P.auto = { hp: 0, mp: 0 };
    P.bossRec = o.bossRec && typeof o.bossRec === 'object' ? o.bossRec : {}; // (saves from before the attempt records have none)
    P.seen = o.seen && typeof o.seen === 'object' ? o.seen : {}; // (saves from before NEW start from what the bag and the hero hold)
    G.Inv.seeOwned();
    if (!P.beacons || typeof P.beacons !== 'object') P.beacons = {};
    // quest progress from an older version: one counter per goal (a counter missing for a goal added later was undefined, and
    // undefined < n never counted up — that goal could never be finished); a quest this version no longer has is dropped
    if (!P.quests || typeof P.quests !== 'object') P.quests = {};
    for (const id in P.quests) {
      const q = D.QUESTS[id], s = P.quests[id];
      if (!q || !s || typeof s !== 'object') { delete P.quests[id]; continue; }
      if (!Array.isArray(s.c)) s.c = [];
      for (let i = 0; i < q.goals.length; i++) s.c[i] = s.c[i] || 0;
    }
    P.freeReset = P.freeReset || 0;
    // v1 characters may have advanced with novice (STR) points: give them one free stat reset
    P.migrated = (o.v || 1) < 2 && P.tier >= 1;
    if (P.migrated) P.freeReset = Math.max(P.freeReset, 1);
    P.cpLive = false;
    P.resetRuntime(); P.recalc();
    P.hp = U.clamp(o.hp || P.d.maxHp, 1, P.d.maxHp); P.mp = U.clamp(o.mp === undefined ? P.d.maxMp : o.mp, 0, P.d.maxMp);
  };
  P.place = function (x, y) {
    P.x = x; P.y = y; P.vx = P.vy = 0; P.ladder = null; P.act = null; P.onGround = true; P.dropPlat = null;
    // arriving on a portal with ↑ still held must not send you straight back: the hold starts over from a fresh press
    P.portT = 0; P.portO = null; P.portStep = 0; P.upArm = false; P.upT = 9;
    P.wisp.x = x - 30; P.wisp.y = y - 84;
  };
  P.PORTAL_HOLD = PORTAL_HOLD;
  P.portK = () => U.sat(P.portT / PORTAL_HOLD); // portal fill 0..1 (drawn by the gate, the prompt and the hero)
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
  // pure: o = { line, stats, eq, skills, lv, buffs } → derived numbers (used live, for 전투력 and for equip / stat previews)
  function derive(o) {
    const L = D.LINES[o.line], s = Object.assign({}, o.stats);
    const b = { atk: 0, def: 0, hp: 0, mp: 0, crit: 0, atkp: 0, spd: 0, expp: 0, goldp: 0 };
    for (const k in o.eq) {
      const item = o.eq[k];
      if (!item) continue;
      const st = D.itemStats(item);
      for (const kk in st) { if (kk in s) s[kk] += st[kk]; else b[kk] = (b[kk] || 0) + st[kk]; }
    }
    const pv = (id) => { const l = o.skills[id]; return l ? D.SKILLS[id].v(l) : null; };
    let hpp = 0, mpp = 0, defp = 0, atkp = b.atkp, crit = 5 + b.crit, critDmg = 150, leech = 0, ward = 0, cdr = 0, range = 0, twin = 0, mpRegen = 0, aspd = 0, spd = b.spd, v, sklv = 0;
    if ((v = pv('b_body'))) { hpp += v.hpp; defp += v.defp; }
    if ((v = pv('b_mastery'))) { atkp += v.atkp; crit += v.crit; }
    if ((v = pv('b_ember'))) { leech += v.leech; critDmg += v.critDmg; }
    if ((v = pv('s_mind'))) { mpp += v.mpp; mpRegen += v.regen; }
    if ((v = pv('s_wisdom'))) { atkp += v.atkp; cdr += v.cdr; }
    if ((v = pv('s_ward'))) ward += v.ward;
    if ((v = pv('g_eye'))) { crit += v.crit; range += v.range; }
    if ((v = pv('g_mastery'))) { atkp += v.atkp; critDmg += v.critDmg; }
    if ((v = pv('g_twin'))) twin += v.twin;
    for (const id in o.skills) { const sk = D.SKILLS[id]; if (sk && sk.kind !== 'passive') sklv += o.skills[id]; }
    for (const bf of o.buffs) { if (bf.atkp) atkp += bf.atkp; if (bf.aspd) aspd += bf.aspd; if (bf.spd) spd += bf.spd; }
    const main = s[L.main], wAtk = b.atk || 3, d = {};
    d.s = s;
    d.atk = Math.round((wAtk * (1 + main * 0.012) + main * 0.5 + o.lv * 1.2) * (1 + atkp / 100));
    d.def = Math.round((b.def + s.vit * 0.4 + o.lv * 0.5) * (1 + defp / 100));
    d.maxHp = Math.round(((60 + o.lv * 16 + s.vit * 9 + s.str * 2) * L.hp + b.hp) * (1 + hpp / 100));
    d.maxMp = Math.round(((30 + o.lv * 7 + s.int * 3) * L.mp + b.mp) * (1 + mpp / 100));
    d.crit = Math.min(80, Math.round((crit + s.dex * 0.12) * 10) / 10); d.critDmg = critDmg;
    d.spd = 250 * (1 + Math.min(60, spd) / 100); d.spdp = spd; d.aspd = 1 + aspd / 100;
    d.expp = b.expp; d.goldp = b.goldp; d.leech = leech; d.ward = Math.min(60, ward); d.cdr = cdr; d.range = range; d.twin = twin; d.mpRegen = mpRegen; d.atkp = atkp; d.sklv = sklv;
    return d;
  }
  P.derive = derive;
  // 전투력: one number that sums up how strong the character is (attack-weighted, temporary buffs excluded)
  P.cpOf = function (d) {
    const cm = 1 + (Math.min(100, d.crit) / 100) * (d.critDmg / 100 - 1);
    const off = d.atk * cm * d.aspd * (1 + d.cdr / 200) * (1 + d.leech / 100) * (1 + (d.sklv || 0) * 0.005);
    return Math.round(off * 40 + d.maxHp * 0.5 + d.def * 10 + d.maxMp * 0.2);
  };
  const srcOf = (o) => Object.assign({ line: P.line, stats: P.stats, eq: P.eq, skills: P.skills, lv: P.lv, buffs: NOBUFF }, o);
  P.recalc = function () {
    const src = srcOf({ buffs: P.buffs }), d = (P.d = derive(src));
    const base = P.buffs.length ? derive(srcOf()) : d, old = P.cp;
    P.cp = P.cpOf(base);
    if (P.hp > d.maxHp) P.hp = d.maxHp;
    if (P.mp > d.maxMp) P.mp = d.maxMp;
    P._look = null;
    G.emit('stats');
    if (P.cpLive && old !== undefined && old !== P.cp) G.emit('cp', old, P.cp);
  };
  P.cpWith = (o) => P.cpOf(derive(srcOf(o)));
  // combat power if `item` replaced whatever is worn in its slot
  P.cpWithItem = function (item) { const eq = Object.assign({}, P.eq); eq[D.ITEMS[item.b].type] = item; return P.cpWith({ eq }); };
  P.cpWithStat = function (k, n) { const st = Object.assign({}, P.stats); st[k] += n; return P.cpWith({ stats: st }); };
  // 전투력 with `item` worn at enhancement level `enh` (for the blacksmith preview)
  P.cpWithEnh = function (item, enh) { return P.cpWithItem(Object.assign({}, item, { enh })); };
  // 전투력 after putting one more point into a skill
  P.cpWithSkill = function (id) { const sk = Object.assign({}, P.skills); sk[id] = (sk[id] || 0) + 1; return P.cpWith({ skills: sk }); };
  // gain from wearing an inventory item (null if it can't be worn)
  P.cpGain = function (item) {
    const b = item && D.ITEMS[item.b];
    if (!b || !D.isEquip(b) || G.Inv.cantEquip(item) || P.eq[b.type] === item) return null;
    return P.cpWithItem(item) - P.cp;
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
    Fx.rays(P, '#ffe07a', 1.5, 190);
    Fx.sigil({ follow: P, r: 96, dur: 1.3, col: '#ffd27a', col2: '#fff3c4', n: 8 });
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
  // give every spent point back (base 5 each). returns the refunded amount
  P.resetStats = function () {
    let n = 0;
    for (const k in P.stats) { n += Math.max(0, P.stats[k] - 5); P.stats[k] = Math.min(P.stats[k], 5); }
    P.ap += n; P.recalc(); G.emit('stats');
    return n;
  };
  P.skillUp = function (id) {
    const sk = D.SKILLS[id], lv = P.skills[id] || 0;
    if (!sk || P.sp <= 0 || lv >= sk.max || sk.line !== P.line || sk.tier > P.tier) return false;
    P.skills[id] = lv + 1; P.sp--; P.recalc(); sfx('skill_up'); G.emit('skills');
    return true;
  };

  // ------------------------------------------------------------ wisp speech / hints
  P.say = function (text, dur) { P.wisp.queue.push([I.fmt(text), dur || 4.5]); };
  P.hint = function (id) {
    if (P.hints[id] || !D.HINTS[id]) return;
    if (G.touch && id === 'mac') return; // (a phone has no Ctrl key to warn about)
    P.hints[id] = 1;
    const slot = P.hot.findIndex(Boolean), text = (G.touch && D.HINTS_T[id]) || D.HINTS[id]; // touch: the touch controls' wording
    P.say(text.replace('{skill}', I.slotKey(slot >= 0 ? slot : 0)), 5.5);
  };

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
    G.Combat.hitBox(box, mult, { max: wk === 'sword' ? 4 : 3, dir: P.dir, kind: P.line === 'blade' ? 'fire' : 'slash', kb: n === 3 ? 1.7 : 1, melee: true, heavy: n === 3 });
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
    if (b && Math.abs(b.x - P.x) < 84 && Math.abs(b.y - P.y) < 50 && !m.boss) {
      if (b.lit) return { type: 'beacon', o: b, x: b.x, y: b.y - 368, label: '↑ 등대 (순간이동 · 재도전)' };
      const r = G.Game.bossRisk(b.info.boss); // a guardian well above your level: the prompt itself warns (red 위험 · amber 주의)
      return { type: 'beacon', o: b, x: b.x, y: b.y - 368, label: (P.bossRec[m.id] ? '↑ 다시 도전' : '↑ 불씨 지피기') + (r.tier === 2 ? ' · 위험! 수호자 Lv.' + r.lv : r.tier === 1 ? ' · 주의 (수호자 Lv.' + r.lv + ')' : ''),
        fg: r.tier === 2 ? '#ffffff' : undefined, bg: r.tier === 2 ? 'rgba(214,30,56,0.96)' : r.tier === 1 ? 'rgba(255,176,72,0.96)' : undefined };
    }
    for (const p of m.portals) {
      if (Math.abs(p.x - P.x) >= 44 || Math.abs(p.y - P.y) >= 50) continue;
      if (ladderUp()) return null; // a ladder in reach wins: ↑ climbs it (NPCs and the beacon already came first)
      // while a guardian is awake every portal of the map is sealed (several arenas sit right next to the exit portal)
      if (m.boss) return { type: 'portal', o: p, sealed: true, x: p.x, y: p.y - 156, label: '봉인됨 · 수호자를 물리치면 열려요', fg: '#f3e8ff', bg: 'rgba(72,40,120,0.95)' };
      return { type: 'portal', o: p, x: p.x, y: p.y - 156, label: '↑ 꾹 눌러 이동' };
    }
    return null;
  }
  // the ladder ↑ would grab from here (same reach as tryGrab)
  function ladderUp() {
    for (const l of G.map.ladders) if (Math.abs(P.x - l.x) <= 20 && P.y > l.y1 + 6 && P.y <= l.y2 + 3) return l;
    return null;
  }
  P.near = null;
  let sealMsgT = -9;
  function sealedPortal(p) {
    sfx('error');
    Fx.ring(p.x, p.y - 58, 22, 64, '#b06aff', 0.32, 5);
    if (G.time - sealMsgT < 2.5) return;
    sealMsgT = G.time;
    G.emit('msg', '수호자와 싸우는 동안에는 포탈이 봉인되어 있습니다. 수호자를 물리치면 다시 열려요.', 'warn');
  }
  function interact() {
    const it = P.near;
    if (!it) return false;
    if (it.type === 'npc') G.UI.talk(it.o);
    else if (it.type === 'beacon') G.Game.beaconInteract();
    else if (it.type === 'portal') {
      // sealed: ↑ only explains why — and returns false so the key doesn't stop the hero in the middle of the fight
      if (it.sealed) { sealedPortal(it.o); return false; }
      return false; // open portal: a press only starts filling the gate — holding ↑ does the rest (portalHold)
    }
    return true;
  }
  // ------------------------------------------------------------ portal: hold ↑ on it
  // While ↑ is held (standing still on the gate) its light rises; when full it takes you. Let go or step off and it drains away.
  // Only a press made on the ground counts (upArm), so ↑ carried over from a jump, a ladder or the map you just arrived on never travels.
  function portalHold(dt, mv, blocked) {
    const it = P.near, p = it && it.type === 'portal' && !it.sealed ? it.o : null;
    if (p && P.upArm && !blocked && !mv && I.isDown('up')) {
      if (P.portO !== p) { P.portO = p; P.portT = 0; P.portStep = 0; }
      P.portT += dt;
      const k = P.portK(), cy = p.y - 58;
      // three rising chimes as the light climbs — they stop the moment ↑ is let go
      while (P.portStep < 3 && k >= P.portStep / 3) { sfx('portal_tick', { rate: TICK_RATE[P.portStep] }); P.portStep++; }
      // motes of light drawn into the gate
      if (Math.random() < dt * (24 + 48 * k)) {
        const an = Math.random() * U.TAU, r = U.rand(62, 92), dx = Math.cos(an) * r, dy = Math.sin(an) * r * 1.15;
        Fx.p({ x: p.x + dx, y: cy + dy, vx: -dx * 3, vy: -dy * 3, life: 0.3, size: U.rand(2.2, 4.6), color: U.pick(['#ffffff', '#fff3c4', '#ffd27a']), add: true });
      }
      if (P.portT < PORTAL_HOLD) return false;
      // full: through the gate
      Fx.ring(p.x, cy, 18, 120, '#fff3c4', 0.4, 7);
      Fx.burst(p.x, cy, 16, ['#ffffff', '#fff3c4', '#ffd27a'], { type: 'star', s0: 60, s1: 260, g: -60, l0: 0.3, l1: 0.6, z0: 3, z1: 7, add: true });
      P.vx = 0; P.upArm = false;
      G.World.travel(p.to, p.tp);
      return true;
    }
    if (P.portT > 0) {
      if (P.portO && !I.isDown('up')) P.hint('portalHold'); // a tap (old habit): explain once
      P.portT = Math.max(0, P.portT - dt * 2.5);
      P.portStep = Math.min(P.portStep, Math.ceil(P.portK() * 3));
      if (!P.portT) P.portO = null;
    }
    return false;
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
    else if (!locked && I.hit('jump')) { P.ladder = null; P.ladderCd = 0.3; P.vy = I.isDown('down') ? 0 : -520; P.vx = mv * 230; P.jumps = 1; P.sqX = 0.88; P.sqY = 1.12; sfx('jump'); }
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
  // skill keys: held keys repeat; a key tapped while busy is remembered for a moment and fires as soon as it can
  function skillInput(dt) {
    for (let i = 0; i < I.SLOTS; i++) {
      const id = P.hot[i];
      if (!id) continue;
      const hit = I.hit('s' + i);
      if (!hit && !I.isDown('s' + i)) continue;
      const r = G.Skills.use(id, hit);
      if (r === true) { P.qSk = null; return true; }
      if (hit) {
        if (r === 'busy') P.qSk = { id, t: 0.45 };
        else if (r === 'cd' || r === 'mp') G.emit('skillDeny', i, r);
      }
    }
    if (P.qSk) {
      P.qSk.t -= dt;
      if (P.qSk.t <= 0 || !P.hot.includes(P.qSk.id)) P.qSk = null;
      else if (G.Skills.use(P.qSk.id, false) === true) { P.qSk = null; return true; }
    }
    return false;
  }
  function control(dt) {
    const a = P.act, ui = !!G.S.lock, stun = P.hurtT > 0; // stun = short knock-back: blocks walking only, never attacks / skills / potions
    let mv = 0;
    if (!ui && !stun) { if (I.isDown('left')) mv -= 1; if (I.isDown('right')) mv += 1; }
    P.near = P.onGround && !a ? findInteract() : null;
    // ↑ counts for a portal only if it went down on the ground (or a moment before landing) and has stayed down there since
    // (a window that paused the game in between also cancels it; hit-stops are far shorter than the 0.25 s gap)
    const gap = G.time - (P.ctlT || 0);
    P.ctlT = G.time;
    P.upT = I.hit('up') ? 0 : P.upT + dt;
    if (!I.isDown('up') || ui || P.ladder || !P.onGround || gap > 0.25) P.upArm = false;
    else if (P.upT < UP_GRACE) P.upArm = true;
    if (!ui && !stun && !a && I.hit('up') && interact()) { P.ladderCd = 0.35; P.vx = 0; P.upArm = false; return; }
    if (portalHold(dt, mv, ui || stun)) return;
    if (P.ladder) { ladderMove(dt, mv, ui || stun); return; }
    if (!ui && !stun && !a && P.ladderCd <= 0) { tryGrab(); if (P.ladder) return; }
    if (mv && (!a || a.turn)) P.dir = mv;
    if (a && a.vx !== undefined) P.vx = a.vx;
    else {
      const spd = P.d.spd * (a ? a.lock : 1) * (P.slowT > 0 ? 0.55 : 1);
      if (mv) {
        if (P.onGround && Math.abs(P.vx) > 180 && Math.sign(P.vx) !== mv) Fx.dust(P.x + mv * 6, P.y, 2); // skid puff on a quick turn
        P.vx = U.approach(P.vx, mv * spd, (P.onGround ? 3400 : 2200) * dt);
      } else P.vx = U.approach(P.vx, 0, (P.onGround ? 3600 : 700) * dt);
    }
    if (!ui && I.hit('jump')) P.jbuf = 0.14;
    if (P.jbuf > 0) P.jbuf -= dt;
    if (P.onGround) { P.coyote = 0.09; P.jumps = 0; } else if (P.coyote > 0) P.coyote -= dt;
    if (P.jbuf > 0 && (!a || a.jump)) {
      if (P.coyote > 0) {
        if (I.isDown('down') && P.ground && P.ground.h === undefined) { P.dropPlat = P.ground; P.dropT = 0.28; P.y += 3; P.onGround = false; P.coyote = 0; P.jbuf = 0; P.jumps = 1; }
        else { P.vy = -JUMP; P.jumps = 1; P.coyote = 0; P.jbuf = 0; P.onGround = false; P.cut = true; P.sqX = 0.84; P.sqY = 1.16; sfx('jump'); Fx.dust(P.x, P.y, 3); }
      } else if (P.jumps < 2) {
        P.vy = -DJUMP; P.jumps = 2; P.jbuf = 0; P.cut = false; P.sqX = 0.9; P.sqY = 1.1;
        if (mv) P.vx = mv * Math.max(Math.abs(P.vx), P.d.spd * 1.25);
        sfx('djump'); Fx.ring(P.x, P.y - 4, 8, 36, '#ffffff', 0.3, 4, { flat: 0.35 });
        Fx.ring(P.x, P.y - 30, 6, 54, '#ffffff', 0.25, 3, { flat: 0.5, back: true });
        Fx.after(P.artLook(), { state: 'jump', t: P.animT }, P.x, P.y, P.dir);
        Fx.burst(P.x, P.y, 5, '#ffffff', { s0: 30, s1: 120, g: 200, z0: 2, z1: 4, l0: 0.2, l1: 0.4 });
      }
    }
    if (!(a && a.float)) P.vy = Math.min(MAXFALL, P.vy + GRAV * dt);
    if (ui) return;
    // actions (allowed while staggered)
    if (I.hit('hp')) G.Inv.quick('hp');
    if (I.hit('mp')) G.Inv.quick('mp');
    if (skillInput(dt)) return;
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
    if (P.onGround && !wasGround) {
      const k = U.sat((P.landV - 300) / 1100);
      if (k > 0) { P.sqX = 1 + 0.2 * k; P.sqY = 1 - 0.18 * k; } // landing squash
      if (P.landV > 500) { sfx('land'); Fx.dust(P.x, P.y, 4 + Math.round(k * 4)); if (k > 0.6) Fx.ring(P.x, P.y - 2, 8, 56, '#ffffff', 0.3, 3, { flat: 0.3 }); }
    }
    P.landV = P.onGround ? 0 : P.vy;
    if (P.onGround && Math.abs(P.vx) > 120) { P.stepT -= dt; if (P.stepT <= 0) { P.stepT = 0.27; sfx('step', { vol: 0.5 }); if (Math.abs(P.vx) > 200) Fx.dust(P.x - P.dir * 10, P.y, 1); } }
  }
  function updateWisp(dt) {
    const w = P.wisp, t = G.time;
    let tx = P.x - P.dir * 36, ty = P.y - 88 + Math.sin(t * 2.3) * 6, k = 4.5;
    // fetch nearby loot
    let nd = null, bd = 320;
    for (const d of G.drops) { if (d.state !== 'rest' || d.t < Math.max(0.7, G.Drops.wait(d)) || d.full) continue; const dd = U.dist(P.x, P.y - 30, d.x, d.y); if (dd < bd) { bd = dd; nd = d; } } // (rare gear: after its column has been seen)
    if (nd) { tx = nd.x; ty = nd.y - 14; k = 9; if (U.dist(w.x, w.y, nd.x, nd.y - 14) < 26) nd.state = 'magnet'; }
    w.x += (tx - w.x) * Math.min(1, dt * k); w.y += (ty - w.y) * Math.min(1, dt * k);
    if (Math.random() < dt * 9) Fx.p({ x: w.x + U.rand(-5, 5), y: w.y + 4, vx: U.rand(-12, 12), vy: U.rand(10, 40), life: U.rand(0.4, 0.8), size: U.rand(2, 4), color: '#ffd98a', add: true });
    if (w.moodT > 0) { w.moodT -= dt; if (w.moodT <= 0) w.mood = null; }
    if (w.say) { w.sayT -= dt; if (w.sayT <= 0) w.say = null; }
    else if (w.queue.length && !G.S.lock) { const [txt, dur] = w.queue.shift(); w.say = txt; w.sayT = dur; w.sayN++; w.mood = 'happy'; w.moodT = 0.8; sfx('talk'); }
  }
  P.update = function (dt) {
    const m = G.map;
    P.playtime += dt; P.animT += dt;
    if (P.iv > 0) P.iv -= dt;
    if (P.hurtT > 0) P.hurtT -= dt;
    if (P.flinchT > 0) P.flinchT -= dt;
    if (P.noPotT > 0) P.noPotT -= dt;
    const sk = Math.min(1, dt * 13); P.sqX += (1 - P.sqX) * sk; P.sqY += (1 - P.sqY) * sk;
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
    // 초롱이 자동 물약 (threshold % per type, 0 = off)
    if (P.autoT > 0) P.autoT -= dt;
    else if (!G.S.lock && P.auto && (P.auto.hp || P.auto.mp)) {
      P.autoT = 0.2;
      if (P.auto.hp && P.hp < (P.d.maxHp * P.auto.hp) / 100 && P.potT.hp <= 0) G.Inv.quick('hp', true);
      else if (P.auto.mp && P.mp < (P.d.maxMp * P.auto.mp) / 100 && P.potT.mp <= 0) G.Inv.quick('mp', true);
    }
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
    P.hp -= dmg; P.iv = 1.0; P.sinceHurt = 0; P.flinchT = 0.3;
    const kd = fromX === undefined ? -P.dir : P.x < fromX ? -1 : 1, a = P.act;
    // a hit never cancels what you are doing: skills keep super armor (no knock-back at all),
    // basic attacks keep going with a light shove, and the stagger only blocks walking for a moment
    if (a && (a.armor || a.skill)) { if (P.onGround && a.vx === undefined) P.vx += kd * 70; }
    else if (a) { P.hurtT = 0.1; P.vx = kd * 120 * (o.kb || 1); }
    else {
      P.hurtT = 0.2;
      P.vx = kd * 250 * (o.kb || 1); P.vy = Math.min(P.vy, -(o.up || 330));
      P.ladder = null; P.onGround = false;
    }
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
    P.portT = 0; P.portO = null; // a portal hold dies with you
    sfx('death'); G.shake(10, 0.4);
    Fx.burst(P.x, P.y - 40, 18, ['#ffd98a', '#ffffff'], { type: 'star', s0: 60, s1: 260, g: 100, l0: 0.5, l1: 1, z0: 4, z1: 8, add: true });
    G.emit('death');
  };
  // experience lost when getting up (none before Lv.10 or at max level) — also shown in the defeat window beforehand.
  // Falling to a guardian (G.Game.fall) costs only 1% of this level's EXP — a hard fight you keep trying shouldn't feel like a
  // punishment; other deaths keep 4%. Never more than the EXP you have: no level is ever lost.
  // (G.Game.won: you went down together with a guardian that fell — that's a guardian fight too)
  P.deathLoss = () => (P.lv >= 10 && P.lv < D.MAX_LV ? Math.min(P.exp, Math.round(D.expNeed(P.lv) * (G.Game.fall || G.Game.won ? 0.01 : 0.04))) : 0);
  // where: 'beacon' — get up in front of the beacon whose guardian felled you, HP · MP full, ↑ there tries again (fade, the arena
  // reloaded as before the fight, saved on arrival). Otherwise the town, as before.
  P.respawn = function (where) {
    const lost = P.deathLoss(), f = G.Game.fall, won = G.Game.won, b = where === 'beacon' && f && f.map === G.map.id && G.map.beacon;
    P.exp -= lost;
    P.dead = false; P.iv = 2;
    G.S.trans = null; G.Game.fall = G.Game.won = null;
    if (b) {
      P.hp = P.d.maxHp; P.mp = P.d.maxMp; P.iv = 2.5;
      G.Mon.resetBoss(); // (no-op: the fight already reset the moment you fell)
      G.S.warpIn = true; // re-forms in lantern light (game.js)
      G.World.travel(G.map.id, null, { x: b.x - 64, y: b.y }); // right at the beacon's ↑ prompt
    } else {
      P.hp = Math.round(P.d.maxHp * 0.6); P.mp = Math.round(P.d.maxMp * 0.6);
      G.Mon.settle(); // a guardian that fell as you went down: its beacon lights (and says so) before you're carried off the map
      G.World.load(P.town || 'town');
      G.Game.save();
    }
    G.emit('hp'); G.emit('exp', 0);
    if (f) G.Game.fallSay(b ? 'beacon' : 'town', f);
    else if (won) P.say('그래도 ' + U.josa(D.shortName(D.MON[won.boss].name), '은/는') + ' 물리쳤어!' + (won.fresh ? ' ' + D.BEACONS[won.map].name + '에 불이 켜졌어.' : ''), 6);
    else P.hint('dead');
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
    if (P.portT > 0 && !P.dead) { const k = P.portK(); A.glow(ctx, P.x, P.y - 38, 44 + 26 * k, '#fff3c4', 0.45 * k); } // bathed in the gate's light
    ctx.save(); ctx.translate(P.x, P.y); ctx.scale(P.dir * P.sqX, P.sqY);
    if (P.iv > 0 && !P.dead && !(a && a.inv) && ((P.iv * 14) | 0) % 2 === 0) ctx.globalAlpha = 0.45;
    if (a && a.drawPre) a.drawPre(ctx, p);
    P.pose = A.hero(ctx, P.artLook(), AN);
    ctx.restore();
    if (P.flinchT > 0 && !P.dead) A.glow(ctx, P.x, P.y - 38, 44, '#ff4a6a', P.flinchT * 1.6); // hit flash (also visible under super armor)
    if (P.buffs.length && !P.dead) {
      for (const b of P.buffs) if (Math.random() < 0.25) Fx.p({ x: P.x + U.rand(-16, 16), y: P.y - U.rand(0, 20), vy: U.rand(-90, -40), life: 0.6, size: U.rand(2, 5), color: b.col || '#ffd27a', add: true });
    }
    const w = P.wisp;
    ctx.save(); ctx.translate(w.x, w.y); A.wisp(ctx, G.time, w.mood); ctx.restore();
  };
  P.drawOverlay = function (ctx) {
    if (!P.dead) W_tag(ctx, P.x, P.y + 16, P.name, '#ffffff', 'rgba(28,20,44,0.55)');
    const it = P.near;
    if (it && !G.S.lock) {
      const by = it.y + Math.sin(G.time * 5) * 3;
      if (it.type === 'portal' && !it.sealed) holdTag(ctx, it.x, by, it.label, P.portO === it.o ? P.portK() : 0);
      else W_tag(ctx, it.x, by, it.label, it.fg || '#2b2136', it.bg || 'rgba(255,224,122,0.96)');
    }
    // (초롱이's lines are not drawn here, over the fight: the HUD shows them in a fixed speech box at the top left — ui.js frameSay)
  };
  function W_tag(ctx, x, y, s, c, bg) { G.World.tag(ctx, x, y, s, c, bg); }
  // portal prompt: the same gold pill, filling with light (left → right) while ↑ is held
  function holdTag(ctx, x, y, s, k) {
    ctx.font = '800 13px ' + A.FONT;
    const w = ctx.measureText(s).width + 14;
    x = G.World.tagX(x, w); // (kept whole on screen at a map's end, like every name tag)
    const x0 = x - w / 2;
    A.rr(ctx, x0, y - 10, w, 20, 10); ctx.fillStyle = 'rgba(255,224,122,0.96)'; ctx.fill();
    if (k > 0) {
      ctx.save(); ctx.clip(); ctx.fillStyle = '#fffbea'; ctx.fillRect(x0, y - 10, w * k, 20); ctx.restore();
      A.rr(ctx, x0, y - 10, w, 20, 10); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 + 0.6 * k).toFixed(2) + ')'; ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2b2136'; ctx.fillText(s, x, y + 1);
  }
})();
