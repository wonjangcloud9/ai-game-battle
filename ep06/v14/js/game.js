'use strict';
/* 등불지기 — game logic: inventory, quests, job advancement, beacons, save/load, per-frame orchestration */
(function () {
  const G = window.G, U = G.U, D = G.D, P = G.P, Fx = G.Fx, I = G.Input;
  const sfx = (n, o) => { if (G.Audio) G.Audio.sfx(n, o); };
  const msg = (t, k) => G.emit('msg', t, k);
  G.S = { scene: 'boot', lock: 0, trans: null, combo: 0, comboT: 0, cine: null, focus: null };
  G.hitStop = 0; G.slowmo = 0;

  // ============================================================ inventory
  const Inv = (G.Inv = {});
  // kinds of gear ever owned (P.seen): a dropped or rewarded piece of a kind not in it is NEW. Taking gear into the bag (a drop, a
  // reward, a purchase) or being handed it (the job weapon) marks its kind; a loaded game also counts everything it holds.
  Inv.isNew = (item) => { const b = item && D.ITEMS[item.b]; return !!b && D.isEquip(b) && !(P.seen && P.seen[item.b]); };
  Inv.see = (item) => { const b = item && D.ITEMS[item.b]; if (b && D.isEquip(b)) (P.seen || (P.seen = {}))[item.b] = 1; };
  Inv.seeOwned = () => { for (const it of P.inv || []) Inv.see(it); for (const k in P.eq || {}) Inv.see(P.eq[k]); };
  Inv.free = () => P.inv.filter((x) => !x).length;
  Inv.count = (b) => { let n = 0; for (const it of P.inv) if (it && it.b === b) n += it.n || 1; return n; };
  Inv.addItem = function (item) {
    const base = D.ITEMS[item.b];
    if (!base) return true;
    if (!D.isEquip(base)) {
      let n = item.n || 1;
      for (const it of P.inv) if (it && it.b === item.b && it.n < 999) { const k = Math.min(n, 999 - it.n); it.n += k; n -= k; if (!n) break; }
      if (n) {
        const i = P.inv.indexOf(null);
        if (i < 0) { item.n = n; G.emit('inv'); return false; }
        P.inv[i] = { b: item.b, n };
      }
      G.emit('inv'); Q.check();
      return true;
    }
    const i = P.inv.indexOf(null);
    if (i < 0) return false;
    P.inv[i] = item; Inv.see(item); G.emit('inv');
    return true;
  };
  Inv.add = (b, n) => Inv.addItem(D.isEquip(D.ITEMS[b]) ? D.makeItem(b, 0) : { b, n: n || 1 });
  Inv.remove = function (b, n) {
    for (let i = 0; i < P.inv.length && n > 0; i++) {
      const it = P.inv[i];
      if (!it || it.b !== b) continue;
      const k = Math.min(n, it.n || 1);
      n -= k;
      if (it.n) { it.n -= k; if (it.n <= 0) P.inv[i] = null; } else P.inv[i] = null;
    }
    G.emit('inv');
  };
  Inv.cantEquip = function (item) {
    const b = D.ITEMS[item.b];
    if (b.lv > P.lv) return '레벨 ' + b.lv + ' 이상만 착용할 수 있습니다.';
    if (b.type === 'weapon' && b.line !== P.line) return D.LINES[b.line].names[b.line === 'novice' ? 0 : 1] + ' 계열 전용 무기입니다.';
    return null;
  };
  Inv.equip = function (i) {
    const item = P.inv[i];
    if (!item) return false;
    const b = D.ITEMS[item.b], why = Inv.cantEquip(item);
    if (why) { msg(why, 'warn'); sfx('error'); return false; }
    const old = P.eq[b.type];
    P.eq[b.type] = item; P.inv[i] = old || null;
    P.recalc(); sfx('equip'); G.emit('inv'); G.emit('equip');
    return true;
  };
  Inv.unequip = function (slot) {
    const item = P.eq[slot];
    if (!item) return;
    if (slot === 'weapon') { msg('무기는 다른 무기로 교체만 할 수 있습니다.', 'warn'); sfx('error'); return; }
    const i = P.inv.indexOf(null);
    if (i < 0) { msg('가방이 가득 찼습니다.', 'warn'); sfx('error'); return; }
    P.inv[i] = item; P.eq[slot] = null;
    P.recalc(); sfx('equip'); G.emit('inv'); G.emit('equip');
  };
  function useBase(b, slot) {
    if (P.dead) return false;
    const cdk = b.use === 'return' ? null : slot || (b.use === 'mp' ? 'mp' : 'hp');
    if (cdk && P.potT[cdk] > 0) return false;
    if (b.use === 'hp') {
      if (P.hp >= P.d.maxHp) { msg('HP가 이미 가득합니다.', 'warn'); return false; }
      P.heal(b.val); Fx.burst(P.x, P.y - 40, 10, ['#b8ffb0', '#3fcf6a'], { s0: 30, s1: 140, g: -200, add: true }); sfx('potion');
    } else if (b.use === 'mp') {
      if (P.mp >= P.d.maxMp) { msg('MP가 이미 가득합니다.', 'warn'); return false; }
      P.gainMp(b.val); Fx.burst(P.x, P.y - 40, 10, ['#b0d8ff', '#4a8aff'], { s0: 30, s1: 140, g: -200, add: true }); sfx('potion');
    } else if (b.use === 'full') {
      if (P.hp >= P.d.maxHp && P.mp >= P.d.maxMp) { msg('HP와 MP가 이미 가득합니다.', 'warn'); return false; }
      P.heal(P.d.maxHp); P.gainMp(P.d.maxMp); Fx.pillar(P.x, P.y, '#ffe07a', 260, 0.6, 60); sfx('heal');
    } else if (b.use === 'return') {
      if (G.map.town) { msg('이미 마을에 있습니다.', 'warn'); return false; }
      if (G.map.boss) { msg('수호자와 싸우는 중에는 사용할 수 없습니다.', 'warn'); return false; }
      G.World.travel(P.town || 'town');
    }
    if (cdk) { P.potT[cdk] = cdk === 'hp' ? 3 : 1.5; G.emit('pot'); }
    return true;
  }
  Inv.use = function (i, slot) {
    const item = P.inv[i];
    if (!item) return false;
    const b = D.ITEMS[item.b];
    if (D.isEquip(b)) return Inv.equip(i);
    if (b.type !== 'use') return false;
    if (!useBase(b, slot)) return false;
    item.n--;
    if (item.n <= 0) P.inv[i] = null;
    G.emit('inv');
    return true;
  };
  // ---- potion quick slots (1 · 2)
  // potions a quick slot can hold: { id: count } — HP slot: HP potions + elixir, MP slot: MP potions + elixir
  Inv.potOwned = function (type) {
    const own = {};
    for (const it of P.inv) if (it) { const u = D.ITEMS[it.b].use; if (u === type || u === 'full') own[it.b] = (own[it.b] || 0) + it.n; }
    return own;
  };
  Inv.potChoices = function (type) {
    const own = Inv.potOwned(type);
    return Object.keys(own).sort((a, b) => (D.ITEMS[a].use === 'full') - (D.ITEMS[b].use === 'full') || D.ITEMS[a].val - D.ITEMS[b].val).map((id) => ({ b: id, n: own[id] }));
  };
  // which potion the quick key uses: { b, n, reg } or null.
  // the registered potion (P.pot) always wins; otherwise the strongest potion owned (elixirs only when registered).
  // (fixes: the slot used to fall back to the weakest potion at full HP, so 생명 물약 owners saw 작은 생명 물약 registered)
  Inv.quickInfo = function (type) {
    const own = Inv.potOwned(type), reg = P.pot && P.pot[type];
    if (reg && own[reg]) return { b: reg, n: own[reg], reg: true };
    const ids = Object.keys(own).filter((id) => D.ITEMS[id].use === type).sort((a, b) => D.ITEMS[b].val - D.ITEMS[a].val);
    return ids.length ? { b: ids[0], n: own[ids[0]], reg: false } : null;
  };
  Inv.setPot = function (type, id, quiet) {
    if (id && !D.ITEMS[id]) return;
    P.pot[type] = id || null;
    if (!quiet) { sfx('equip'); msg((type === 'hp' ? 'HP' : 'MP') + ' 물약 단축키: ' + (id ? D.ITEMS[id].name : '자동 (가장 좋은 물약)'), 'sys'); }
    G.emit('inv');
  };
  Inv.cyclePot = function (type, dir) {
    const list = Inv.potChoices(type);
    if (!list.length) return;
    const cur = Inv.quickInfo(type), i = cur ? list.findIndex((o) => o.b === cur.b) : -1;
    Inv.setPot(type, list[(i + (dir || 1) + list.length) % list.length].b, true);
    sfx('tab');
  };
  Inv.quick = function (type, auto) {
    if (P.potCd > 0 || P.dead || P.potT[type] > 0) return false;
    const q = Inv.quickInfo(type);
    if (!q) {
      if (!auto) { msg((type === 'hp' ? '생명' : '마나') + ' 물약이 없습니다.', 'warn'); sfx('error'); }
      else if (P.noPotT <= 0) { P.noPotT = 30; P.say((type === 'hp' ? '생명' : '마나') + ' 물약이 다 떨어졌어! 마을 잡화상에서 사 오자.'); }
      return false;
    }
    const i = P.inv.findIndex((it) => it && it.b === q.b);
    if (!Inv.use(i, type)) return false;
    P.potCd = 0.35;
    if (auto) { P.wisp.mood = 'happy'; P.wisp.moodT = 0.8; }
    if (!Inv.count(q.b)) {
      const nx = Inv.quickInfo(type), nm = D.ITEMS[q.b].name;
      msg(U.josa(nm, '을/를') + ' 모두 사용했습니다.' + (nx ? ' 이제 ' + U.josa(D.ITEMS[nx.b].name, '을/를') + ' 사용합니다.' : ''), 'warn');
    }
    G.emit('potUse', type);
    return true;
  };
  Inv.sort = function () {
    const ord = { weapon: 0, helm: 1, armor: 2, gloves: 3, boots: 4, charm: 5, use: 6, etc: 7 };
    const items = P.inv.filter(Boolean);
    items.sort((a, b) => {
      const A1 = D.ITEMS[a.b], B1 = D.ITEMS[b.b];
      return ord[A1.type] - ord[B1.type] || (B1.tier || 0) - (A1.tier || 0) || (b.rar || 0) - (a.rar || 0) || (A1.id < B1.id ? -1 : 1);
    });
    for (let i = 0; i < P.inv.length; i++) P.inv[i] = items[i] || null;
    sfx('tab'); G.emit('inv');
  };
  Inv.sell = function (i, all) {
    const item = P.inv[i];
    if (!item) return 0;
    const n = item.n ? (all ? item.n : 1) : 1, gold = D.sellPrice(item) * n;
    if (item.n) { item.n -= n; if (item.n <= 0) P.inv[i] = null; } else P.inv[i] = null;
    P.gold += gold; sfx('sell'); G.emit('inv'); G.emit('gold');
    return gold;
  };
  Inv.buy = function (b, n) {
    const base = D.ITEMS[b];
    n = n || 1;
    const cost = base.price * n;
    if (P.gold < cost) { msg('골드가 부족합니다.', 'warn'); sfx('error'); return false; }
    const item = D.isEquip(base) ? D.makeItem(b, 0, 0) : { b, n };
    if (!Inv.addItem(item)) { msg('가방이 가득 찼습니다.', 'warn'); sfx('error'); return false; }
    P.gold -= cost; sfx('buy'); G.emit('gold');
    return true;
  };
  Inv.discard = function (i) { if (P.inv[i]) { P.inv[i] = null; sfx('close'); G.emit('inv'); } };
  // enhancement at the blacksmith. returns 'ok' | 'fail' | 'down' | null
  Inv.enhance = function (item) {
    if (!item || (item.enh || 0) >= D.ENH_MAX) return null;
    const c = D.enhCost(item);
    if (P.gold < c.gold) { msg('골드가 부족합니다.', 'warn'); sfx('error'); return null; }
    if (Inv.count('dust') < c.dust) { msg('빛가루가 부족합니다.', 'warn'); sfx('error'); return null; }
    P.gold -= c.gold; Inv.remove('dust', c.dust);
    const e = item.enh || 0;
    let res = 'fail';
    if (U.chance(D.ENH_RATE[e] / 100)) { item.enh = e + 1; res = 'ok'; sfx('enh_ok'); }
    else { if (e >= 7 && U.chance(0.5)) { item.enh = e - 1; res = 'down'; } sfx('enh_fail'); }
    P.recalc(); G.emit('inv'); G.emit('gold'); G.emit('equip');
    return res;
  };

  // ============================================================ quests
  const Q = (G.Quest = {});
  Q.st = function (id) {
    const q = D.QUESTS[id], s = P.quests[id];
    if (s) return s.st === 'done' ? 'done' : Q.ready(id) ? 'ready' : 'active';
    const r = q.req || {};
    if ((r.lv && P.lv < r.lv) || (r.q && (!P.quests[r.q] || P.quests[r.q].st !== 'done'))) return 'locked';
    return 'avail';
  };
  Q.prog = function (id, gi) {
    const g = D.QUESTS[id].goals[gi], s = P.quests[id];
    switch (g.t) {
      case 'kill': return [Math.min(g.n, (s && s.c[gi]) || 0), g.n];
      case 'item': return [Math.min(g.n, Inv.count(g.it)), g.n];
      case 'lv': return [Math.min(P.lv, g.n), g.n];
      case 'job': return [P.tier >= g.tier ? 1 : 0, 1];
      case 'beacon': return [P.beacons[g.map] ? 1 : 0, 1];
      case 'talk': return [s && s.c[gi] ? 1 : 0, 1];
    }
    return [0, 1];
  };
  Q.ready = (id) => D.QUESTS[id].goals.every((g, i) => { const p = Q.prog(id, i); return p[0] >= p[1]; });
  Q.goalText = function (g) {
    switch (g.t) {
      case 'kill': return D.MON[g.m].name + ' 처치';
      case 'item': return D.ITEMS[g.it].name + ' 수집';
      case 'lv': return '레벨 ' + g.n + ' 달성';
      case 'job': return g.tier + '차 전직하기';
      case 'beacon': return D.BEACONS[g.map].name + ' 점화 (' + D.MON[D.BEACONS[g.map].boss].name + ' 처치)';
      case 'talk': return D.NPCS[g.npc].name + '에게 말 걸기';
    }
    return '';
  };
  Q.accept = function (id) {
    P.quests[id] = { st: 'active', c: D.QUESTS[id].goals.map(() => 0) };
    sfx('quest_accept'); msg('퀘스트 수락: ' + D.QUESTS[id].name, 'quest'); G.emit('quest'); G.Game.save();
  };
  Q.complete = function (id) {
    const q = D.QUESTS[id];
    if (!P.quests[id] || P.quests[id].st === 'done' || !Q.ready(id)) return false;
    for (const g of q.goals) if (g.t === 'item') Inv.remove(g.it, g.n);
    P.quests[id].st = 'done';
    const r = q.rew || {};
    sfx('quest_done'); G.emit('questDone', q); // the quest line (with its EXP · gold) first, then one 획득 line per reward item
    if (r.gold) { P.gold += r.gold; G.emit('gold'); }
    for (const [b, n] of r.items || []) {
      const item = D.isEquip(D.ITEMS[b]) ? D.makeItem(b, 1) : { b, n }, isNew = Inv.isNew(item);
      if (Inv.addItem(item)) G.emit('loot', item, isNew); // equipment rewards roll their rarity here — show what actually came out
      else { G.Drops.item(P.x, P.y - 40, item, P.y); msg('가방이 가득 차서 ' + U.josa(D.ITEMS[b].name, '이/가') + ' 발밑에 떨어졌습니다.', 'warn'); }
    }
    G.emit('quest');
    if (r.exp) P.gainExp(r.exp);
    G.Game.save();
    return true;
  };
  function notifyReady() {
    for (const id in P.quests) {
      const s = P.quests[id];
      if (s.st !== 'active') continue;
      const rd = Q.ready(id);
      if (rd && !s.ntf) { s.ntf = 1; const q = D.QUESTS[id]; msg('퀘스트 목표 달성: ' + q.name + ' — ' + D.NPCS[q.to].name + '에게 돌아가세요.', 'quest'); sfx('skill_up'); }
      else if (!rd && s.ntf) s.ntf = 0;
    }
  }
  Q.onKill = function (mid) {
    let ch = false;
    for (const id in P.quests) {
      const s = P.quests[id];
      if (s.st !== 'active') continue;
      D.QUESTS[id].goals.forEach((g, i) => { if (g.t === 'kill' && g.m === mid && s.c[i] < g.n) { s.c[i]++; ch = true; } });
    }
    if (ch) { notifyReady(); G.emit('quest'); }
  };
  Q.onTalk = function (npc) {
    let ch = false;
    for (const id in P.quests) {
      const s = P.quests[id];
      if (s.st !== 'active') continue;
      D.QUESTS[id].goals.forEach((g, i) => { if (g.t === 'talk' && g.npc === npc && !s.c[i]) { s.c[i] = 1; ch = true; } });
    }
    if (ch) G.emit('quest');
  };
  Q.check = function () { notifyReady(); G.emit('quest'); };
  Q.forNpc = function (npc) {
    const out = { ready: [], avail: [], active: [] };
    for (const id in D.QUESTS) {
      const q = D.QUESTS[id], st = Q.st(id);
      if (st === 'ready' && q.to === npc) out.ready.push(id);
      else if (st === 'avail' && q.giver === npc) out.avail.push(id);
      else if (st === 'active' && (q.giver === npc || q.to === npc)) out.active.push(id);
    }
    return out;
  };
  Q.marker = function (npc) {
    const f = Q.forNpc(npc);
    if (f.ready.length) return '?';
    for (const id of f.active) if (D.QUESTS[id].to === npc && D.QUESTS[id].goals.some((g, i) => g.t === 'talk' && g.npc === npc && !P.quests[id].c[i])) return '?';
    if (f.avail.length) return '!';
    return null;
  };
  Q.tracked = function () {
    const out = [];
    for (const id in P.quests) if (P.quests[id].st === 'active') out.push(id);
    out.sort((a, b) => (D.QUESTS[b].main ? 1 : 0) - (D.QUESTS[a].main ? 1 : 0));
    return out;
  };

  // ============================================================ game flow
  const Game = (G.Game = {});
  let fight = null; // the guardian fight in progress (record below)
  function macHint() { if (G.Input.isMac && G.Input.uses('Ctrl')) G.after(16, () => P.hint('mac')); }
  Game.newGame = function (name, look) {
    P.newChar(name, look);
    Game.fall = Game.won = null; fight = null; G.Mon.forget();
    G.S.scene = 'play'; G.S.lock = 0; G.S.trans = null; G.S.combo = 0;
    G.World.load('town');
    G.World.prewarm();
    P.cpLive = true;
    P.hint('start');
    G.after(7, () => P.hint('npc'));
    macHint();
    Game.save();
  };
  Game.continue = function () {
    const d = G.Save.load();
    if (!d || !d.name) return false;
    try { P.deserialize(d); } catch (e) { console.error(e); return false; }
    Game.fall = Game.won = null; fight = null; G.Mon.forget();
    G.S.scene = 'play'; G.S.lock = 0; G.S.trans = null; G.S.combo = 0;
    G.World.load(G.MAPS[P.mapId] ? P.mapId : 'town');
    G.World.prewarm();
    P.cpLive = true;
    P.hint('keys');
    if (P.migrated) G.after(2.5, () => { msg('업데이트 선물: 무료 능력치 초기화 1회가 지급되었습니다. (C 캐릭터 창 / 교관)', 'quest'); P.hint('freeReset'); });
    if (Object.keys(P.beacons).length) G.after(9, () => P.hint('travel'));
    macHint();
    return true;
  };
  // (not while you're down — except force: a guardian's fall, which must survive closing the game before you get up)
  Game.save = function (force) { if (G.S.scene === 'play' && (force || !P.dead) && P.name) { G.Save.store(P.serialize()); G.emit('saved'); } };

  Game.canAdvance = () => (P.tier < 3 && P.lv >= D.JOB_LV[P.tier + 1] ? P.tier + 1 : 0);
  Game.advance = function (line) {
    const next = Game.canAdvance();
    if (!next) return false;
    let refund = 0;
    P.cpLive = false; // the job change itself isn't shown as a 전투력 jump; the re-distribution afterwards is
    if (next === 1) {
      P.line = line;
      const nl = P.skills.n_smash || 0;
      if (nl > 1) P.sp += nl - 1;
      delete P.skills.n_smash;
      P.hot = P.hot.map((h) => (h === 'n_smash' ? null : h));
      const old = P.eq.weapon, w = D.makeItem(D.LINES[line].weapon + (P.lv >= 10 ? 2 : 1), 0, 1);
      P.eq.weapon = w; Inv.see(w);
      if (old) { const i = P.inv.indexOf(null); if (i >= 0) P.inv[i] = old; }
      // novice points (usually STR from 추천 분배) don't fit the new job: hand them all back once
      refund = P.resetStats();
    }
    P.tier = next;
    for (const s of D.skillsOf(P.line, next)) {
      if (s.kind === 'passive') continue;
      P.skills[s.id] = 1;
      const i = P.hot.indexOf(null);
      if (i >= 0 && !P.hot.includes(s.id)) P.hot[i] = s.id;
    }
    P.sp += 1;
    P.buffs.length = 0;
    P.recalc(); P.hp = P.d.maxHp; P.mp = P.d.maxMp; P.cheerT = 2;
    P.cpLive = true;
    const col = D.LINES[P.line].color;
    Fx.rays(P, col, 2.2, 260);
    Fx.sigil({ follow: P, r: 150, dur: 2.0, col, col2: '#ffffff', n: 8, rise: true });
    Fx.pillar(P.x, P.y, col, 560, 1.4, 150); Fx.flash(col, 0.45, 0.5);
    Fx.ring(P.x, P.y - 10, 10, 260, '#ffffff', 0.8, 12, { flat: 0.3 });
    Fx.burst(P.x, P.y - 40, 50, [col, '#ffffff', '#ffe9a0'], { type: 'star', s0: 100, s1: 520, g: -100, l0: 0.6, l1: 1.4, z0: 5, z1: 12, add: true });
    G.shake(8, 0.5); sfx('jobup');
    G.emit('job', next); G.emit('skills'); G.emit('inv'); G.emit('equip'); G.emit('hp'); G.emit('stats');
    Q.check(); P.hint('sp');
    if (refund) G.after(1.7, () => { if (G.UI.statReset) G.UI.statReset(refund); });
    Game.save();
    return true;
  };
  // re-distribution of stat points at the trainer (first one free for updated saves)
  Game.statResetCost = () => (P.freeReset > 0 ? 0 : Math.round(100 + P.lv * P.lv * 3));
  Game.statReset = function () {
    if (!Object.keys(P.stats).some((k) => P.stats[k] > 5)) { msg('되돌릴 능력치가 없습니다.', 'warn'); sfx('error'); return 0; }
    const cost = Game.statResetCost();
    if (P.gold < cost) { msg('골드가 부족합니다. (' + U.fmt(cost) + ' G)', 'warn'); sfx('error'); return 0; }
    if (cost) { P.gold -= cost; G.emit('gold'); } else P.freeReset = Math.max(0, P.freeReset - 1);
    const n = P.resetStats();
    Fx.sigil({ follow: P, r: 90, dur: 1.0, col: '#ffd27a', col2: '#ffffff', n: 8 });
    Fx.burst(P.x, P.y - 40, 18, ['#fff3c4', '#ffd27a'], { type: 'star', s0: 60, s1: 240, g: -150, add: true });
    sfx('skill_up'); msg('능력치를 초기화했습니다. 포인트 ' + n + '을(를) 돌려받았습니다.', 'quest');
    G.emit('stats'); Game.save();
    return n;
  };

  // how risky a guardian is for this character. gap = its level − yours → tier 2 위험 (4+), 1 주의 (2–3), 0 fine.
  // hits ≈ how many of its big blows (돌진 · 내려찍기 …, ×1.4) your full HP takes — the same armor curve as P.hurt
  Game.bossRisk = function (id) {
    const def = D.MON[id], gap = def.lv - P.lv, K = 100 + 4 * ((G.map && G.map.lvRef) || def.lv);
    const big = (D.monStat(def).atk * 1.4 * K) / (K + P.d.def);
    return { lv: def.lv, gap, tier: gap >= 4 ? 2 : gap >= 2 ? 1 : 0, hits: Math.max(1, Math.ceil(P.d.maxHp / big)), rec: def.lv - 1 };
  };
  Game.beaconInteract = function () {
    const b = G.map.beacon;
    if (!b || G.map.boss) return;
    const boss = D.MON[b.info.boss];
    if (b.lit) { G.UI.beaconMenu(b); return; } // lit beacon: lantern network travel + guardian rematch
    const risk = Game.bossRisk(b.info.boss), rec = P.bossRec[G.map.id];
    const text = '어스름이 <b>' + b.info.name + '</b>' + U.josa(b.info.name, '을/를').slice(b.info.name.length) + ' 뒤덮고 있습니다.<br>불씨를 지피면 수호자 <b>「' + boss.name + '」</b>(Lv.' + boss.lv + ')' + U.josa(boss.name, '이/가').slice(boss.name.length) + ' 나타납니다.' +
      G.UI.riskBox(risk) + (rec ? G.UI.lastTry(b.info.boss, rec) : '') + '<span class="mtip">싸우는 동안 바닥이 <b>빨갛게</b> 물들면 곧 센 공격이 옵니다 — 빨간 곳을 벗어나세요!</span>불씨를 지피시겠습니까?';
    G.UI.confirm(text, () => G.Mon.summonBoss(b), { yes: risk.tier === 2 ? '그래도 지핀다' : rec ? '다시 도전한다' : '불씨를 지핀다', no: '아직은…' });
  };

  // ------------------------------------------------------------ guardian fights: what happened, and what would win it next time
  // While a guardian is awake: the damage taken per attack (G.src, combat.js), the HP potions drunk, the time. Falling to it keeps the
  // attempt in P.bossRec[map] (tries · the least HP it ever had left · the attack that hurt most) and Game.fall describes it for the
  // defeat window (ui2.js), which offers to get up right at the beacon instead of walking back from town.
  Game.fall = null;
  Game.won = null; // you went down together with a guardian that fell (the same instant, or while its beacon lit): { map, boss }
  const hpPots = () => { const o = Inv.potOwned('hp'); let n = 0; for (const k in o) n += o[k]; return n; };
  G.on('boss', (m) => { fight = { m, map: G.map.id, t0: G.time, dmg: {}, n: {}, hurt: 0, last: null, pots: hpPots() }; });
  G.on('hurt', (dmg) => {
    if (!fight || G.map.boss !== fight.m) return;
    const k = G.src || '?';
    fight.dmg[k] = (fight.dmg[k] || 0) + dmg; fight.n[k] = (fight.n[k] || 0) + 1; fight.hurt += dmg; fight.last = k;
  });
  G.on('death', () => {
    const f = fight, m = G.map && G.map.boss;
    Game.fall = Game.won = null;
    if (m && m.dead) { Game.won = { map: G.map.id, boss: m.id, fresh: !!(G.map.beacon && !G.map.beacon.lit) }; return; } // it fell first (its beacon is lighting): the window says the win stands
    if (!f || !m || m !== f.m) return; // (an ordinary death: the usual window)
    fight = null;
    let top = null;
    for (const k in f.dmg) if (D.bossAtk(m.id, k) && (!top || f.dmg[k] > f.dmg[top])) top = k;
    const left = U.sat(m.hp / m.maxHp), rec = P.bossRec[f.map] || (P.bossRec[f.map] = { n: 0, best: 1 }), prev = rec.best;
    Object.assign(rec, { n: rec.n + 1, last: left, best: Math.min(prev, left), top, topN: top ? f.n[top] : 0, share: top && f.hurt ? Math.round((f.dmg[top] / f.hurt) * 100) / 100 : 0,
      used: Math.max(0, f.pots - hpPots()), t: Math.round(G.time - f.t0) });
    Game.fall = { map: f.map, boss: m.id, left, rage: !!m.rage, rec, newBest: rec.n > 1 && left < prev - 0.005 };
  });
  // the guardian fell (monsters.js bossDeath, which saves right after): the try is won at that moment. Its attempt record goes (lit
  // now: the lantern network takes it from here), and a fall in that very instant — your last hit landed as you went down — turns
  // into a win: no "다시 도전" window for a guardian that is gone. wonTry: which try it was (ui.js adds "— 3번째 도전 만에 성공!" to
  // its 수호자를 물리쳤습니다 when the beacon lights)
  Game.wonTry = 0;
  G.on('bossDown', (m, id, fresh) => {
    const rec = P.bossRec[id], same = !!(Game.fall && Game.fall.map === id); // (that fall already counted this try)
    Game.wonTry = rec ? rec.n + (same ? 0 : 1) : 0;
    delete P.bossRec[id];
    fight = null;
    if (P.dead) { Game.fall = null; Game.won = { map: id, boss: m.id, fresh }; }
  });
  G.on('bossEnd', (won) => { fight = null; if (!won) Game.wonTry = 0; });
  // an HP fraction as a whole percent: never 0 while it still stands, never 100 once it has been hurt
  Game.pct = (k) => (k <= 0 ? 0 : k >= 1 ? 100 : U.clamp(Math.round(k * 100), 1, 99));
  // one line for the defeat window: what would help most next time, most important first —
  // 레벨 (far below the guardian) · 물약 (none left / never drunk) · 장비 (a weapon far behind) · 피할 공격 (one attack did most of the
  // damage, or it was nearly down) · 강화 · 레벨 (a little below) · 피할 공격. → { k: chip, text, why: the evidence, say: 초롱이's version }
  // o.noLv: leave the level out (the beacon's confirm already shows its red / amber level warning right above)
  Game.bossTip = function (id, rec, o) {
    const def = D.MON[id], r = Object.assign({}, Game.bossRisk(id)), nm = D.shortName(def.name), pots = hpPots();
    if (o && o.noLv) r.tier = 0;
    const atk = rec && rec.top ? D.bossAtk(id, rec.top) : null;
    const w = P.eq.weapon, wb = w && D.ITEMS[w.b], want = D.tierFor(def.lv), enhWant = U.clamp(Math.round(def.lv / 7), 1, 7);
    const shopT = P.town === 'oasis' ? 6 : 3, newT = Math.min(want - 1, shopT), nw = D.ITEMS[D.LINES[P.line].weapon + newT];
    const potB = D.ITEMS[P.town === 'oasis' ? 'hp3' : P.lv >= 10 ? 'hp2' : 'hp1'];
    const dodge = () => ({ k: '피할 공격', text: atk[1], why: atk[0] + '에 ' + rec.topN + '번 맞음' + (rec.share >= 0.3 ? ' · 받은 피해의 ' + Math.round(rec.share * 100) + '%' : ''), say: '이번엔 ' + U.josa(atk[0], '을/를') + ' 꼭 피하자!' });
    if (r.tier === 2) return { k: '레벨', text: '레벨이 많이 모자라요 — Lv.' + r.rec + '쯤까지 올리고 오면 훨씬 쉬워져요', why: nm + ' Lv.' + r.lv + ' · 나 Lv.' + P.lv, say: '지금은 좀 벅차… 근처에서 레벨을 올리고 와도 돼!' };
    if (!pots) return { k: '물약', text: (rec && rec.used ? '물약이 바닥났어요' : '물약 없이 싸웠어요') + ' — ' + U.josa(potB.name, '을/를') + ' 10개 넘게 챙겨 와요', why: '남은 생명 물약 0개', say: '물약부터 넉넉히 챙기자!' };
    if (rec && !rec.used && rec.t >= 12) return { k: '물약', text: '물약을 한 번도 안 마셨어요 — HP가 절반 밑이면 ' + I.key('hp') + ' 키!' + (P.auto.hp ? '' : ' 물약 칸을 눌러 자동 물약도 켜 둬요'), why: '생명 물약 ' + pots + '개 남김', say: 'HP가 절반 밑이면 ' + I.key('hp') + ' 키로 물약을 마시자!' };
    if (wb && nw && nw.lv <= P.lv && wb.tier < newT && wb.tier <= want - 2) return { k: '장비', text: '무기가 많이 낡았어요 — 대장장이에게서 「' + nw.name + '」 이상으로 바꿔요', why: '지금 무기 「' + D.itemName(w) + '」', say: '새 무기로 바꾸면 훨씬 세질 거야!' };
    if (atk && (rec.share >= 0.4 || rec.last < 0.3)) return dodge();
    if (w && (w.enh || 0) < enhWant) return { k: '강화', text: '대장장이에게 무기를 +' + enhWant + '까지 강화하면 훨씬 빨리 쓰러뜨려요', why: '지금 무기 +' + (w.enh || 0) + (Inv.count('dust') ? ' · 빛가루 ' + Inv.count('dust') + '개 있음' : ''), say: '무기를 강화하고 다시 오자!' };
    if (r.tier === 1) return { k: '레벨', text: '레벨을 ' + (def.lv - 1) + '쯤까지 올리면 한결 버티기 쉬워요', why: nm + ' Lv.' + r.lv + ' · 나 Lv.' + P.lv, say: '조금만 더 강해지면 이길 수 있어!' };
    if (atk) return dodge();
    return { k: '한 걸음 더', text: '거의 다 왔어요! 빨간 바닥만 피하면 이길 수 있어요', why: '', say: '거의 다 왔어! 빨간 바닥만 조심하자!' };
  };
  // 초롱이, once you're up again: at the beacon (↑ to try again, and the tip in short) or in town (who sends you back)
  Game.fallSay = function (where, f) {
    if (where === 'beacon') { P.say('등대 앞이야! 준비되면 ' + (G.touch ? '조이스틱을 위로 밀어' : '↑ 키로') + ' 불씨를 다시 지피자. ' + Game.bossTip(f.boss, f.rec).say, 6.5); return; }
    const tm = G.MAPS[P.town], npc = tm && (tm.npcs || []).map((n) => D.NPCS[n[0]]).find((d) => d && d.travel);
    P.say('푹 쉬고 준비가 되면 ' + (npc ? npc.name + '에게 말을 걸어 봐' : G.touch ? '세계 지도를 열어 봐' : '세계 지도(M)를 열어 봐') + '. ' + D.BEACONS[f.map].name + ' 앞으로 바로 보내 줄 거야!', 6.5);
  };
  Game.rematch = function () { const b = G.map.beacon; if (b && b.lit && !G.map.boss) G.Mon.summonBoss(b); };
  Game.lightBeacon = function () {
    const map = G.map, b = map.beacon;
    if (!b || b.lit) return;
    b.lit = true; b.flareT = 2.6; P.beacons[map.id] = 1;
    map.lights.push({ x: b.x, y: b.y - 250, r: 620, color: '#ffd27a' });
    Fx.pillar(b.x, b.y - 240, '#ffe07a', 700, 2.0, 220); Fx.flash('#fff3c4', 0.6, 0.8);
    for (let i = 0; i < 3; i++) G.after(i * 0.3, () => Fx.ring(b.x, b.y - 250, 30, 520 + i * 120, '#ffe9a0', 1.0, 12));
    G.shake(10, 0.8); sfx('beacon');
    G.emit('beacon', map.id);
    Q.check();
    Game.save();
    if (map.id === 'throne' && !P.ended) G.after(4.5, () => G.UI.ending());
    else G.after(5.5, () => P.hint('travel'));
  };
  // if the player left the throne room before the ceremony finished, still show the ending once
  G.on('map', () => { if (P.beacons && P.beacons.throne && !P.ended) G.after(2.5, () => G.UI.ending()); });
  // lantern network: every visited town and every lit beacon — and the beacon whose guardian you are still trying to beat
  // (tried: you fell to it there; arrive right at its ↑ prompt). Travel is free from a beacon or a town guide NPC,
  // and costs a little gold from the world map (anywhere).
  Game.tried = (id) => !!(D.BEACONS[id] && !P.beacons[id] && P.bossRec && P.bossRec[id]);
  Game.travelList = function () {
    const out = [];
    for (const id in G.MAPS) {
      const m = G.MAPS[id], tried = !m.town && Game.tried(id);
      if (m.town ? !P.visited[id] : !((P.beacons[id] && D.BEACONS[id]) || tried)) continue;
      out.push({ id, name: m.town ? m.name : D.BEACONS[id].name, map: m.name, town: !!m.town, lv: m.lv, cur: !!(G.map && G.map.id === id), tried, rec: tried ? P.bossRec[id] : null });
    }
    return out;
  };
  Game.fastTravel = function (id, o) {
    o = o || {};
    const def = G.MAPS[id];
    if (!def || id === G.map.id || P.dead || G.S.trans) return false;
    if (G.map.boss) { msg('수호자와 싸우는 중에는 이동할 수 없습니다.', 'warn'); sfx('error'); return false; }
    const tried = !def.town && Game.tried(id);
    if (!(def.town ? P.visited[id] : P.beacons[id] || tried)) return false;
    const cost = o.free ? 0 : Game.travelCost();
    if (P.gold < cost) { msg('골드가 부족합니다. (이동 비용 ' + U.fmt(cost) + ' G)', 'warn'); sfx('error'); return false; }
    if (cost) { P.gold -= cost; G.emit('gold'); }
    const pos = def.beacon ? { x: def.beacon.x - (tried ? 64 : 150), y: def.beacon.y } : null; // (a guardian to beat: right at the ↑ prompt)
    // warp out: the hero dissolves into lantern light, and re-forms on arrival
    Fx.pillar(P.x, P.y, '#ffe07a', 420, 0.5, 80);
    Fx.ring(P.x, P.y - 6, 10, 90, '#fff3c4', 0.4, 6, { flat: 0.3 });
    Fx.burst(P.x, P.y - 40, 18, ['#fff3c4', '#ffd27a', '#ffffff'], { type: 'star', s0: 60, s1: 260, g: -220, l0: 0.4, l1: 0.8, z0: 3, z1: 7, add: true });
    G.S.warpIn = true;
    G.World.travel(id, null, pos);
    return true;
  };
  G.on('map', () => {
    if (!G.S.warpIn) return;
    G.S.warpIn = false;
    Fx.pillar(P.x, P.y, '#ffe07a', 460, 0.8, 90);
    Fx.sigil({ follow: P, r: 80, dur: 0.9, col: '#ffd27a', col2: '#fff3c4', n: 8 });
    Fx.burst(P.x, P.y - 40, 14, ['#fff3c4', '#ffd27a'], { type: 'star', s0: 60, s1: 220, g: -120, add: true });
  });
  Game.travelCost = () => (P.lv < 8 ? 0 : P.lv * 12);

  // ------------------------------------------------------------ per-frame
  let saveT = 0, hintT = 0;
  Game.update = function (dt) {
    const S = G.S, map = G.map;
    G.World.updateTrans(dt);
    if (S.trans && S.trans.phase === 0) { Fx.update(dt); return; }
    P.update(dt);
    G.Mon.update(dt);
    G.Proj.update(dt);
    G.Haz.update(dt);
    G.Drops.update(dt);
    Fx.update(dt);
    if (map.beacon && map.beacon.flareT > 0) { map.beacon.flareT -= dt; map.beacon.flare = U.sat(1 - map.beacon.flareT / 2.6); if (map.beacon.flareT <= 0) map.beacon.flare = 0; }
    if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
    saveT += dt;
    if (saveT > 30) { saveT = 0; Game.save(); }
    hintT -= dt;
    if (hintT <= 0 && !P.dead) {
      hintT = 0.6;
      if (!map.boss) for (const p of map.portals) if (Math.abs(p.x - P.x) < 150 && Math.abs(p.y - P.y) < 80) P.hint('portal'); // (sealed during a guardian fight)
      if (map.beacon && Math.abs(map.beacon.x - P.x) < 260 && !map.beacon.lit) P.hint('beacon');
      if (map.pal.dark > 0.5) P.hint('dark');
      if (!map.town) {
        for (const m of G.mons) if (!m.dead && Math.abs(m.x - P.x) < 330 && Math.abs(m.y - P.y) < 140) { P.hint('attack'); if (P.hints.attack && P.kills >= 2) P.hint('skill'); break; }
        if (P.kills >= 6) P.hint('djump');
        if (P.kills >= 12 && P.ground && P.ground.h === undefined) P.hint('drop');
      }
    }
    G.World.updateCam(dt);
  };
})();
