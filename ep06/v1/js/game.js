'use strict';
/* 등불지기 — game logic: inventory, quests, job advancement, beacons, save/load, per-frame orchestration */
(function () {
  const G = window.G, U = G.U, D = G.D, P = G.P, Fx = G.Fx;
  const sfx = (n, o) => { if (G.Audio) G.Audio.sfx(n, o); };
  const msg = (t, k) => G.emit('msg', t, k);
  G.S = { scene: 'boot', lock: 0, trans: null, combo: 0, comboT: 0, cine: null, focus: null };
  G.hitStop = 0; G.slowmo = 0;

  // ============================================================ inventory
  const Inv = (G.Inv = {});
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
    P.inv[i] = item; G.emit('inv');
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
  function useBase(b) {
    if (P.dead) return false;
    const cdk = b.use === 'mp' ? 'mp' : b.use === 'return' ? null : 'hp';
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
  Inv.use = function (i) {
    const item = P.inv[i];
    if (!item) return false;
    const b = D.ITEMS[item.b];
    if (D.isEquip(b)) return Inv.equip(i);
    if (b.type !== 'use') return false;
    if (!useBase(b)) return false;
    item.n--;
    if (item.n <= 0) P.inv[i] = null;
    G.emit('inv');
    return true;
  };
  // which potion the quick key would use: { b, n(total of that id) } or null
  Inv.quickInfo = function (type) {
    const own = {};
    for (const it of P.inv) if (it && D.ITEMS[it.b].use === type) own[it.b] = (own[it.b] || 0) + it.n;
    const ids = Object.keys(own).sort((a, b) => D.ITEMS[a].val - D.ITEMS[b].val);
    if (!ids.length) return null;
    let pick = P.pot[type] && own[P.pot[type]] ? P.pot[type] : null;
    if (!pick) {
      const miss = type === 'hp' ? P.d.maxHp - P.hp : P.d.maxMp - P.mp;
      pick = ids.find((id) => D.ITEMS[id].val >= miss * 0.7) || ids[ids.length - 1];
    }
    return { b: pick, n: own[pick] };
  };
  Inv.quick = function (type) {
    if (P.potCd > 0 || P.dead || P.potT[type] > 0) return;
    const q = Inv.quickInfo(type);
    if (!q) { msg((type === 'hp' ? '생명' : '마나') + ' 물약이 없습니다.', 'warn'); sfx('error'); return; }
    const i = P.inv.findIndex((it) => it && it.b === q.b);
    if (Inv.use(i)) P.potCd = 0.35;
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
    if (r.gold) { P.gold += r.gold; G.emit('gold'); }
    for (const [b, n] of r.items || []) {
      const item = D.isEquip(D.ITEMS[b]) ? D.makeItem(b, 1) : { b, n };
      if (!Inv.addItem(item)) G.Drops.item(P.x, P.y - 40, item, P.y);
    }
    sfx('quest_done'); G.emit('quest'); G.emit('questDone', q);
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
  Game.newGame = function (name, look) {
    P.newChar(name, look);
    G.S.scene = 'play'; G.S.lock = 0; G.S.trans = null; G.S.combo = 0;
    G.World.load('town');
    G.World.prewarm();
    P.hint('start');
    G.after(7, () => P.hint('npc'));
    Game.save();
  };
  Game.continue = function () {
    const d = G.Save.load();
    if (!d || !d.name) return false;
    try { P.deserialize(d); } catch (e) { console.error(e); return false; }
    G.S.scene = 'play'; G.S.lock = 0; G.S.trans = null; G.S.combo = 0;
    G.World.load(G.MAPS[P.mapId] ? P.mapId : 'town');
    G.World.prewarm();
    return true;
  };
  Game.save = function () { if (G.S.scene === 'play' && !P.dead && P.name) { G.Save.store(P.serialize()); G.emit('saved'); } };

  Game.canAdvance = () => (P.tier < 3 && P.lv >= D.JOB_LV[P.tier + 1] ? P.tier + 1 : 0);
  Game.advance = function (line) {
    const next = Game.canAdvance();
    if (!next) return false;
    if (next === 1) {
      P.line = line;
      const nl = P.skills.n_smash || 0;
      if (nl > 1) P.sp += nl - 1;
      delete P.skills.n_smash;
      P.hot = P.hot.map((h) => (h === 'n_smash' ? null : h));
      const old = P.eq.weapon, w = D.makeItem(D.LINES[line].weapon + (P.lv >= 10 ? 2 : 1), 0, 1);
      P.eq.weapon = w;
      if (old) { const i = P.inv.indexOf(null); if (i >= 0) P.inv[i] = old; }
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
    const col = D.LINES[P.line].color;
    Fx.pillar(P.x, P.y, col, 560, 1.4, 150); Fx.flash(col, 0.45, 0.5);
    Fx.ring(P.x, P.y - 10, 10, 260, '#ffffff', 0.8, 12, { flat: 0.3 });
    Fx.burst(P.x, P.y - 40, 50, [col, '#ffffff', '#ffe9a0'], { type: 'star', s0: 100, s1: 520, g: -100, l0: 0.6, l1: 1.4, z0: 5, z1: 12, add: true });
    G.shake(8, 0.5); sfx('jobup');
    G.emit('job', next); G.emit('skills'); G.emit('inv'); G.emit('equip'); G.emit('hp'); G.emit('stats');
    Q.check(); P.hint('sp');
    Game.save();
    return true;
  };

  Game.beaconInteract = function () {
    const b = G.map.beacon;
    if (!b || G.map.boss) return;
    const boss = D.MON[b.info.boss];
    const text = b.lit
      ? '<b>' + b.info.name + '</b>' + U.josa(b.info.name, '은/는').slice(b.info.name.length) + ' 이미 밝게 타오르고 있습니다.<br>수호자 <b>「' + boss.name + '」</b>에게 다시 도전하시겠습니까?'
      : '어스름이 <b>' + b.info.name + '</b>' + U.josa(b.info.name, '을/를').slice(b.info.name.length) + ' 뒤덮고 있습니다.<br>불씨를 지피면 수호자 <b>「' + boss.name + '」</b>(Lv.' + boss.lv + ')' + U.josa(boss.name, '이/가').slice(boss.name.length) + ' 나타납니다.<br>불씨를 지피시겠습니까?';
    G.UI.confirm(text, () => G.Mon.summonBoss(b), { yes: b.lit ? '도전한다' : '불씨를 지핀다', no: '아직은…' });
  };
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
  };
  // if the player left the throne room before the ceremony finished, still show the ending once
  G.on('map', () => { if (P.beacons && P.beacons.throne && !P.ended) G.after(2.5, () => G.UI.ending()); });
  Game.fastTravel = function (id) {
    const def = G.MAPS[id];
    if (!def || id === G.map.id || P.dead) return false;
    if (G.map.boss) { msg('수호자와 싸우는 중에는 이동할 수 없습니다.', 'warn'); sfx('error'); return false; }
    if (!(def.town ? P.visited[id] : P.beacons[id])) return false;
    const cost = Game.travelCost();
    if (P.gold < cost) { msg('골드가 부족합니다. (이동 비용 ' + U.fmt(cost) + ' G)', 'warn'); sfx('error'); return false; }
    P.gold -= cost; G.emit('gold');
    const pos = def.beacon ? { x: def.beacon.x - 150, y: def.beacon.y } : null;
    G.World.travel(id, null, pos);
    return true;
  };
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
      for (const p of map.portals) if (Math.abs(p.x - P.x) < 150 && Math.abs(p.y - P.y) < 80) P.hint('portal');
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
