'use strict';
/* 등불지기 — UI part 1: HUD (status · 전투력 · hotbar), tooltips, windows (character / bag / skills / quests / world map),
   drag & drop, popovers (potion slot, bag context menu), 전투력 change popup, upgrade notice, banners, log */
(function () {
  const G = window.G, U = G.U, A = G.Art, D = G.D, P = G.P, I = G.Input, Inv = G.Inv, Q = G.Quest;
  const UI = (G.UI = {});
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sfx = (n, o) => { if (G.Audio) G.Audio.sfx(n, o); };
  const fmt = U.fmt;
  const ic = (key) => (A.iconURL ? '<img class="ic" src="' + A.iconURL(key) + '" draggable="false" alt="">' : '<span class="ic ph"></span>');
  const dirty = {};
  const live = []; // canvases redrawn every frame: { cv, draw(ctx, t) }
  let root, scaleK = 1;
  const X = (UI._ = { $, el, esc, sfx, fmt, ic, dirty, live }); // shared with ui2.js
  const pulse = (e, cls) => { if (!e) return; e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls); };
  X.pulse = pulse;
  // logical (1280×720) coordinates of a client point / element
  const toLogical = (cx, cy) => { const st = root.getBoundingClientRect(); return [(cx - st.left) / scaleK, (cy - st.top) / scaleK]; };
  X.toLogical = toLogical;

  X.addLive = (cv, w, h, draw) => {
    const s = 2; cv.width = w * s; cv.height = h * s;
    const c = cv.getContext('2d');
    live.push({ cv, c, w, h, s, draw });
  };
  UI.setScale = (k) => { scaleK = k; };
  X.syncLock = () => {
    const modal = !!$('#ui > .modal');
    G.S.lock = !$('#dlg').classList.contains('hidden') || modal || G.S.scene !== 'play' ? 1 : 0;
    G.S.paused = modal && !G.P.dead;
    if (G.S.lock) closePops();
  };

  // ------------------------------------------------------------ slots & tooltips
  // well-enhanced gear shines wherever its icon is shown (bag · character · blacksmith): +5 ~ +7 a soft glow, +8 ~ +10 brighter with a light sweep
  X.egCls = (item) => { const e = (item && item.enh) || 0; return e >= 8 ? ' eg8' : e >= 5 ? ' eg5' : ''; };
  X.slot = function (item, tip, attrs, cls, extra) {
    if (!item) return '<div class="slot empty' + (cls || '') + '"' + (attrs || '') + '></div>';
    const b = D.ITEMS[item.b], eq = D.isEquip(b);
    return '<div class="slot r' + (eq ? item.rar || 0 : 0) + (eq ? X.egCls(item) : '') + (cls || '') + '"' + (tip ? ' data-tip="' + tip + '"' : '') + (attrs || '') + '>' + ic(b.icon) +
      (item.n > 1 ? '<span class="n">' + item.n + '</span>' : '') + (item.enh ? '<span class="e">+' + item.enh + '</span>' : '') + (extra || '') + '</div>';
  };
  const SN = { atk: '공격력', def: '방어력', hp: '최대 HP', mp: '최대 MP', crit: '치명타 확률', atkp: '공격력', spd: '이동 속도', str: '힘', dex: '민첩', int: '지능', vit: '체력', expp: '경험치 획득', goldp: '골드 획득' };
  const PCT = { crit: 1, atkp: 1, spd: 1, expp: 1, goldp: 1 };
  const sv = (k, v) => (v > 0 ? '+' : '') + v + (PCT[k] ? '%' : '');
  const cpTxt = (g) => (g > 0 ? '▲ ' : g < 0 ? '▼ ' : '') + fmt(Math.abs(g));
  X.cpTxt = cpTxt;
  // one line telling how 전투력 would change by wearing this item
  X.cpLine = function (item) {
    const b = D.ITEMS[item.b];
    if (!D.isEquip(b) || P.eq[b.type] === item) return '';
    const why = Inv.cantEquip(item);
    if (why) return '<div class="cpl no">착용 불가 · ' + why + '</div>';
    const g = P.cpWithItem(item) - P.cp;
    return '<div class="cpl ' + (g > 0 ? 'up' : g < 0 ? 'dn' : '') + '"><span>장착 시 전투력</span><b>' + (g ? cpTxt(g) : '변화 없음') + '</b></div>';
  };
  X.itemTip = function (item, o) {
    o = o || {};
    const b = D.ITEMS[item.b], eq = D.isEquip(b), rar = D.RAR[item.rar || 0];
    let s = '<h4 style="color:' + (eq ? rar.color : '#fff') + '">' + esc(D.itemName(item)) + '</h4>';
    if (eq) {
      const slotName = D.SLOTS.find((x) => x.k === b.type).name;
      s += '<div class="ty">' + rar.name + ' ' + slotName + ' · 요구 레벨 <span class="' + (b.lv > P.lv ? 'bad' : '') + '">' + b.lv + '</span>';
      if (b.type === 'weapon') s += ' · <span class="' + (b.line !== P.line ? 'bad' : '') + '">' + (b.line === 'novice' ? '견습 등불지기' : D.LINES[b.line].names[1]) + ' 계열</span>';
      s += '</div>';
      if (o.cmp) s += X.cpLine(item);
      const base = D.itemStats({ b: item.b, rar: item.rar, enh: item.enh, opts: [] });
      for (const k in base) s += '<div class="ln"><span>' + SN[k] + '</span><b>' + sv(k, base[k]) + '</b></div>';
      for (const [k, v] of item.opts || []) s += '<div class="ln op"><span>' + SN[k] + '</span><b>' + sv(k, v) + '</b></div>';
      const cur = o.cmp && P.eq[b.type] && P.eq[b.type] !== item ? D.itemStats(P.eq[b.type]) : null;
      if (cur) {
        const st = D.itemStats(item), keys = new Set(Object.keys(st).concat(Object.keys(cur)));
        let c = '';
        for (const k of keys) { const dv = (st[k] || 0) - (cur[k] || 0); if (dv) c += '<div class="ln ' + (dv > 0 ? 'up' : 'dn') + '"><span>' + SN[k] + '</span><b>' + (dv > 0 ? '▲ ' : '▼ ') + Math.abs(dv) + (PCT[k] ? '%' : '') + '</b></div>'; }
        if (c) s += '<hr><div class="ty" style="margin:0 0 2px">장착 중인 장비와 비교</div>' + c;
      }
      if ((item.enh || 0) < D.ENH_MAX && o.enh) s += '<hr><div class="ty" style="margin:0">강화 +' + (item.enh || 0) + ' / ' + D.ENH_MAX + '</div>';
    } else s += '<div class="ty">' + (b.type === 'use' ? '소비 아이템' : '재료') + (item.n > 1 ? ' · ' + item.n + '개' : '') + '</div>';
    if (b.desc) s += '<div class="ds">' + b.desc + '</div>';
    s += o.price ? '<div class="pr">구매가 ' + fmt(b.price) + ' G</div>' : '<div class="pr">판매가 ' + fmt(D.sellPrice(item)) + ' G</div>';
    if (o.hint) s += '<div class="ds dim">' + o.hint + '</div>';
    return s;
  };
  X.skillTip = function (id) {
    const sk = D.SKILLS[id], lv = P.skills[id] || 0, v = sk.v(Math.max(1, lv)), slot = P.hot.indexOf(id);
    let s = '<h4 style="color:' + D.LINES[sk.line].color + '">' + sk.name + '</h4><div class="ty">' + (sk.kind === 'passive' ? '패시브' : sk.kind === 'buff' ? '버프' : '액티브') + ' · Lv.' + lv + ' / ' + sk.max + (slot >= 0 ? ' · ' + (G.touch ? '버튼' : '단축키') + ' <b class="gd">' + I.slotKey(slot) + '</b>' : '') + '</div>';
    if (sk.kind !== 'passive') s += '<div class="ln"><span>MP 소모</span><b>' + v.mp + '</b></div><div class="ln"><span>재사용 대기</span><b>' + v.cd + '초</b></div>';
    s += '<div class="ds">' + sk.desc(v) + '</div>';
    if (lv > 0 && lv < sk.max) s += '<hr><div class="ty" style="margin:0 0 2px">다음 레벨</div><div class="ds dim" style="margin:0">' + sk.desc(sk.v(lv + 1)) + '</div>';
    return s;
  };
  function tipHTML(key) {
    const i = key.indexOf(':'), k = key.slice(0, i), a = key.slice(i + 1);
    switch (k) {
      case 'inv': return P.inv[a] ? X.itemTip(P.inv[a], { cmp: true, hint: X.invHint }) : '';
      case 'eq': return P.eq[a] ? X.itemTip(P.eq[a], { hint: '더블클릭: 해제' }) : '<div class="ty" style="margin:0">' + D.SLOTS.find((s) => s.k === a).name + ' 슬롯 (비어 있음)</div>';
      case 'shop': { const b = D.ITEMS[a]; return X.itemTip(D.isEquip(b) ? { b: a, rar: 0, enh: 0, opts: [] } : { b: a, n: 1 }, { price: true, cmp: true }); }
      case 'base': { const b = D.ITEMS[a]; return X.itemTip(D.isEquip(b) ? { b: a, rar: 0, enh: 0, opts: [] } : { b: a, n: 1 }); }
      case 'upg': return upg.item ? X.itemTip(upg.item, { cmp: true }) : '';
      case 'skill': return X.skillTip(a);
      case 'pot': {
        const q = Inv.quickInfo(a), reg = P.pot[a], nm = a === 'hp' ? 'HP' : 'MP';
        return '<h4>' + nm + ' 물약 단축키 <span class="gd">(' + I.keys(a) + ')</span></h4><div class="ds">' +
          (q ? '<b>' + D.ITEMS[q.b].name + '</b> · ' + q.n + '개' + (q.reg ? '' : ' <span class="dim">(자동: 가장 좋은 물약)</span>') : '물약이 없습니다. 잡화상에서 구입하세요.') +
          (reg && (!q || q.b !== reg) ? '<br><span class="bad">등록한 ' + D.ITEMS[reg].name + ' 없음 → 다른 물약 사용</span>' : '') +
          (P.auto[a] ? '<br><span class="ok">초롱이 자동 물약 · ' + nm + ' ' + P.auto[a] + '% 이하</span>' : '') +
          '</div><div class="ds dim">클릭: 물약 고르기 · 자동 물약<br>휠: 바로 바꾸기 · 가방에서 끌어다 놓기</div>';
      }
      case 'buff': { const b = P.buffs[a]; return b ? '<h4>' + b.name + '</h4><div class="ds">남은 시간 ' + Math.ceil(b.t) + '초</div>' : ''; }
      case 'cp': return '<h4><span class="gd">전투력</span> ' + fmt(P.cp) + '</h4><div class="ds">공격력 · 치명타 · 공격 속도 · 스킬 레벨과 HP · 방어력을 합친 캐릭터의 강함입니다. 장비를 바꾸거나 능력치를 올리면 바로 바뀌어요.<br><span class="dim">버프 효과는 포함되지 않습니다.</span></div>';
      case 'stat': {
        const st = D.STATS.find((s) => s.k === a), g = P.cpWithStat(a, 1) - P.cp;
        return '<h4>' + st.name + (a === D.LINES[P.line].main ? ' <span class="gd">★ 주 능력치</span>' : '') + '</h4><div class="ds">' + st.desc + '</div><div class="cpl ' + (g > 0 ? 'up' : '') + '"><span>+1 올리면 전투력</span><b>' + cpTxt(g) + '</b></div>';
      }
      case 'txt': return '<div class="ds" style="margin:0">' + a + '</div>';
    }
    return X.tipExt ? X.tipExt(k, a) : '';
  }
  let tipEl = null, tipKey = null;
  function tipMove(e) {
    const [x, y] = toLogical(e.clientX, e.clientY);
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let tx = x + 16, ty = y + 14;
    if (tx + w > G.W - 6) tx = x - w - 12;
    if (ty + h > G.H - 6) ty = Math.max(6, G.H - h - 6);
    tipEl.style.left = Math.max(6, tx) + 'px'; tipEl.style.top = ty + 'px';
  }
  function tipHide() { if (tipKey) { tipKey = null; tipEl.classList.add('hidden'); } }
  X.tipHide = tipHide;

  // ------------------------------------------------------------ HUD
  function buildHud() {
    const hud = $('#hud');
    hud.innerHTML =
      '<div id="st" class="pnl" data-act="win:char"><div class="pf"><canvas id="pfc"></canvas></div><div id="st-lv"></div>' +
      '<div class="st-r"><div class="st-n"><b id="st-name"></b><span id="st-job"></span></div>' +
      '<div class="bar hp"><i class="tr" id="b-hp2"></i><i id="b-hp"></i><em id="t-hp"></em></div><div class="bar mp"><i class="tr" id="b-mp2"></i><i id="b-mp"></i><em id="t-mp"></em></div><div class="bar xp"><i id="b-xp"></i><em id="t-xp"></em></div></div></div>' +
      '<div id="cp" data-act="win:char" data-tip="cp:">' + ic('ui_cp') + '<span>전투력</span><b id="cp-v">0</b></div>' +
      '<div id="buffs"></div>' +
      '<div id="say" class="hidden"><div class="sy-p"><canvas id="syc"></canvas></div><div class="sy-b"><b>초롱이</b><span id="say-t"></span></div></div>' +
      '<div id="mm" class="pnl" data-act="win:map"><div id="mm-n"></div><canvas id="mmc" width="400" height="172"></canvas><div id="mm-f"><span id="gold"></span><span id="mm-lv"></span></div></div>' +
      '<div id="qt" data-act="win:quest"></div><div id="hot"></div><div id="menu"></div><div id="log"></div>' +
      '<div id="boss" class="hidden"><div id="boss-n"></div><div class="bar bs"><i id="b-bs2"></i><i id="b-bs"></i></div></div>' +
      '<div id="banner"></div><div id="loot" class="hidden"></div><div id="combo"></div><div id="xpline"><i></i></div><div id="cpfx" class="hidden"></div><div id="upg" class="pnl hidden"></div>';
    const mb = [['char', 'ui_char', 'C', '캐릭터'], ['bag', 'ui_bag', 'I', '가방'], ['skill', 'ui_skill', 'K', '스킬'], ['quest', 'ui_quest', 'J', '퀘스트'], ['map', 'ui_map', 'M', '세계 지도 · 순간이동'], ['menu', 'ui_menu', 'Esc', '메뉴 · 설정 · 키 설정']];
    $('#menu').innerHTML = mb.map((m) => '<div class="mb" id="mb-' + m[0] + '" data-act="win:' + m[0] + '" data-tip="txt:' + m[3] + ' (' + m[2] + ')">' + ic(m[1]) + '<kbd>' + m[2] + '</kbd></div>').join('');
    X.addLive($('#pfc'), 68, 68, (c, t) => { if (!P.eq || G.S.scene !== 'play') return; c.translate(31, 41); c.scale(1.25, 1.25); A.heroHead(c, P.artLook(), t); });
    X.addLive($('#syc'), 41, 41, (c, t) => { if (!say.on) return; c.translate(20.5, 23); c.scale(1.3, 1.3); A.wisp(c, t, P.wisp.mood); });
  }
  // ------------------------------------------------------------ 초롱이's lines (P.say) — a fixed speech box at the top left, under the status panel
  // (they used to float over the hero's head, i.e. right over the fight: the boss, the damage numbers and the portal / NPC name tags)
  const say = { w: null, n: -1, on: false, a: -1, el: null, tx: null, bot: 0 };
  function frameSay() {
    const w = P.wisp, on = !!(w && w.say);
    if (!say.el) { say.el = $('#say'); say.tx = $('#say-t'); }
    if (on && (w !== say.w || w.sayN !== say.n)) { say.w = w; say.n = w.sayN; say.tx.textContent = w.say; pulse(say.el, 'pop'); say.bot = -1; }
    if (on !== say.on) { say.on = on; say.el.classList.toggle('hidden', !on); say.bot = -1; }
    if (on) { const a = Math.min(1, w.sayT * 3); if (a !== say.a) { say.a = a; say.el.style.opacity = a; } }
    if (say.bot < 0) say.bot = on ? say.el.offsetTop + say.el.offsetHeight * (G.touch && G.Touch ? G.Touch.hs : 1) : 0; // (touch: the box is scaled up)
  }
  G.on('touchmode', () => { say.bot = -1; });
  UI.sayBottom = () => say.bot; // lower edge of the speech box (0 = not shown): world.js keeps the quest arrow below it
  function updStatus() {
    const d = P.d;
    $('#st-name').textContent = P.name; $('#st-job').textContent = P.jobName(); $('#st-lv').textContent = P.lv;
    const hk = U.sat(P.hp / d.maxHp) * 100 + '%', mk = U.sat(P.mp / d.maxMp) * 100 + '%';
    $('#b-hp').style.width = hk; $('#b-hp2').style.width = hk; $('#t-hp').textContent = Math.max(0, Math.ceil(P.hp)) + ' / ' + d.maxHp;
    $('#b-mp').style.width = mk; $('#b-mp2').style.width = mk; $('#t-mp').textContent = Math.floor(P.mp) + ' / ' + d.maxMp;
    $('#st').classList.toggle('low', P.hp < d.maxHp * 0.3 && !P.dead);
    const need = D.expNeed(P.lv), k = P.lv >= D.MAX_LV ? 1 : U.sat(P.exp / need);
    $('#b-xp').style.width = k * 100 + '%'; $('#t-xp').textContent = P.lv >= D.MAX_LV ? 'MAX' : (k * 100).toFixed(1) + '%';
    $('#xpline i').style.width = k * 100 + '%';
    $('#gold').textContent = fmt(P.gold) + ' G';
    $('#cp-v').textContent = fmt(P.cp || 0);
    $('#mb-char').classList.toggle('dot', P.ap > 0 || P.freeReset > 0);
    $('#mb-skill').classList.toggle('dot', P.sp > 0 && Object.values(D.SKILLS).some((s) => s.line === P.line && s.tier <= P.tier && (P.skills[s.id] || 0) < s.max));
    $('#mb-quest').classList.toggle('dot', Object.keys(P.quests).some((id) => P.quests[id].st === 'active' && Q.ready(id)));
  }
  // hotbar: [attack · jump] [Q W E R / A S D F] [HP · MP] — the rows follow the keyboard
  const ROWS = [[4, 5, 6, 7], [0, 1, 2, 3]];
  const JUMP_IC = '<svg class="ic" viewBox="0 0 48 48"><path d="M12 25 L24 13 L36 25" fill="none" stroke="#2b2136" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 25 L24 13 L36 25" fill="none" stroke="#bfe8ff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 37 L24 25 L36 37" fill="none" stroke="#2b2136" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 37 L24 25 L36 37" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function buildHot() {
    const w = P.eq.weapon;
    let s = '<div class="hc">' +
      '<div class="hs atk" data-tip="txt:<b>기본 공격</b> (' + I.keys('attack') + ')<br>누르고 있으면 연속 공격"><span class="k">' + I.key('attack') + '</span>' + ic(w ? D.ITEMS[w.b].icon : 'rod_1') + '</div>' +
      '<div class="hs jmp" data-tip="txt:<b>점프</b> (' + I.keys('jump') + ')<br>공중에서 한 번 더: 2단 점프<br>' + I.key('down') + ' + ' + I.key('jump') + ': 발판 아래로"><span class="k">' + I.key('jump') + '</span>' + JUMP_IC + '</div></div><div class="hsep"></div><div class="hg">';
    for (const row of ROWS) {
      s += '<div class="hr">';
      for (const i of row) {
        const id = P.hot[i];
        s += '<div class="hs' + (id ? '' : ' empty') + '" id="hs' + i + '" data-drop="hot:' + i + '"' + (id ? ' data-drag="hot:' + i + '" data-tip="skill:' + id + '"' : ' data-tip="txt:빈 칸 (' + I.key('s' + i) + ')<br>스킬 창(K)에서 스킬 아이콘을 끌어다 놓으세요"') + '><span class="k">' + I.key('s' + i) + '</span>' + (id ? ic('sk_' + id) : '') + '<div class="cd"></div></div>';
      }
      s += '</div>';
    }
    s += '</div><div class="hsep"></div><div class="hc">';
    for (const t of ['hp', 'mp']) {
      const q = Inv.quickInfo(t), au = P.auto && P.auto[t];
      s += '<div class="hs pot' + (q ? '' : ' empty') + (q && q.n < 5 ? ' low' : '') + (au ? ' auto' : '') + '" id="hp-' + t + '" data-tip="pot:' + t + '" data-act="potsel:' + t + '" data-drop="pot:' + t + '"><span class="k">' + I.key(t) + '</span>' + ic(q ? D.ITEMS[q.b].icon : 'pot_' + t + '_1') + '<span class="n">' + (q ? q.n : 0) + '</span><span class="sel">▾</span>' + (au ? '<span class="au">AUTO</span>' : '') + '<div class="cd"></div></div>';
    }
    s += '</div>';
    $('#hot').innerHTML = s;
    hotState.length = 0; potState.hp = potState.mp = null;
  }
  const hotState = [];
  function frameHot() {
    for (let i = 0; i < I.SLOTS; i++) {
      const id = P.hot[i];
      if (!id) continue;
      const e = document.getElementById('hs' + i);
      if (!e) continue;
      const st = hotState[i] || (hotState[i] = { on: false, txt: '', nomp: false, q: false });
      const cd = P.cd[id] || 0, mx = P.cdMax[id] || 1, on = cd > 0.02;
      if (on !== st.on) { st.on = on; e.classList.toggle('oncd', on); if (!on) pulse(e, 'rdy'); }
      if (on) {
        const c = e.lastElementChild, txt = cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1);
        c.style.background = 'conic-gradient(rgba(10,6,20,0.8) ' + (cd / mx) * 100 + '%, rgba(10,6,20,0.25) 0)';
        if (txt !== st.txt) { st.txt = txt; c.textContent = txt; }
      }
      const sk = D.SKILLS[id], nomp = P.mp < sk.v(P.skills[id] || 1).mp;
      if (nomp !== st.nomp) { st.nomp = nomp; e.classList.toggle('nomp', nomp); }
      const qd = !!(P.qSk && P.qSk.id === id);
      if (qd !== st.q) { st.q = qd; e.classList.toggle('queued', qd); }
    }
  }
  const potState = { hp: null, mp: null };
  function framePots() {
    for (const t of ['hp', 'mp']) {
      const e = document.getElementById('hp-' + t);
      if (!e) continue;
      const cd = P.potT[t] || 0, on = cd > 0.02;
      if (on !== potState[t]) { potState[t] = on; e.classList.toggle('oncd', on); }
      if (on) { const c = e.lastElementChild; c.style.background = 'conic-gradient(rgba(10,6,20,0.8) ' + (cd / (t === 'hp' ? 3 : 1.5)) * 100 + '%, rgba(10,6,20,0.25) 0)'; c.textContent = cd.toFixed(1); }
    }
  }
  function updQuestTrack() {
    const ids = Q.tracked().slice(0, 3);
    $('#qt').innerHTML = ids.map((id) => {
      const q = D.QUESTS[id], rd = Q.ready(id);
      return '<div class="qt-i' + (rd ? ' rd' : '') + '"><b>' + (q.main ? '<small>메인</small>' : '') + q.name + '</b>' +
        (rd ? '<span class="ok">✔ ' + D.NPCS[q.to].name + '에게 돌아가기</span>' : q.goals.map((g, i) => { const p = Q.prog(id, i); return '<span class="' + (p[0] >= p[1] ? 'ok' : '') + '">' + Q.goalText(g) + (p[1] > 1 ? ' ' + p[0] + '/' + p[1] : p[0] >= p[1] ? ' ✔' : '') + '</span>'; }).join('')) + '</div>';
    }).join('');
  }
  function updBuffs() {
    $('#buffs').innerHTML = P.buffs.map((b, i) => '<div class="buff" data-tip="buff:' + i + '">' + ic(b.icon) + '<em>' + Math.ceil(b.t) + '</em></div>').join('');
  }
  let bannerAt = -1e9; // performance.now() of the last banner (a loot notice shares its spot and waits for it — frameLoot)
  UI.banner = function (title, sub, cls) {
    $('#banner').innerHTML = '<div class="bn ' + (cls || '') + '"><h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>';
    bannerAt = performance.now();
  };
  UI.log = function (text, cls) {
    const lg = $('#log'), e = el('div', 'lg ' + (cls || ''), text);
    lg.appendChild(e);
    while (lg.children.length > 7) lg.removeChild(lg.firstChild);
    setTimeout(() => { if (e.parentNode) e.parentNode.removeChild(e); }, 6000);
  };
  UI.toast = function (html) {
    const t = $('#toast'), e = el('div', 'ts', html);
    t.appendChild(e);
    trimToasts();
    setTimeout(() => { if (e.parentNode) e.parentNode.removeChild(e); }, 2600);
  };
  // while the better-gear notice is up (earth band, right of the hotbar) keep at most 2 toasts: a 3rd would reach down onto it
  function trimToasts() { const t = $('#toast'), max = upg.item ? 2 : 4; while (t.children.length > max) t.removeChild(t.firstChild); }

  // ------------------------------------------------------------ 전투력 popup (counts up from the old value) + upgrade notice
  const cpA = { from: 0, to: 0, t: 0, show: 0, txt: '' };
  function cpChanged(old, nw) {
    if (G.S.scene !== 'play') return;
    if (cpA.show <= 0) cpA.from = old;
    cpA.to = nw; cpA.t = 0; cpA.show = 2.6; cpA.txt = '';
    const e = $('#cpfx');
    if (cpA.to === cpA.from) { e.classList.add('hidden'); cpA.show = 0; return; }
    e.classList.remove('hidden'); e.classList.toggle('dn', cpA.to < cpA.from); pulse(e, 'pop'); pulse($('#cp'), 'bump');
  }
  function frameCp(dt) {
    if (cpA.show <= 0) return;
    cpA.show -= dt; cpA.t += dt;
    const e = $('#cpfx'), k = U.ease.outCubic(U.sat(cpA.t / 0.7)), cur = Math.round(U.lerp(cpA.from, cpA.to, k)), d = cpA.to - cpA.from;
    const txt = '<span>전투력</span><b>' + fmt(cur) + '</b><em>' + cpTxt(d) + '</em>';
    if (txt !== cpA.txt) { cpA.txt = txt; e.innerHTML = txt; }
    e.style.opacity = U.sat(cpA.show / 0.5);
    if (cpA.show <= 0) e.classList.add('hidden');
  }
  const upg = { item: null, t: 0 };
  function showUpgrade(item) {
    const g = P.cpGain(item);
    if (!(g > 0)) return;
    upg.item = item; upg.t = 10;
    const b = D.ITEMS[item.b], col = D.RAR[item.rar || 0].color, e = $('#upg');
    e.innerHTML = X.slot(item, 'upg:') + '<div class="uw"><small>더 좋은 장비를 얻었어요!</small><b style="color:' + col + '">' + esc(D.itemName(item)) + '</b><span>전투력 <em>' + cpTxt(g) + '</em></span></div>' +
      '<button class="btn sm" data-act="upgeq">장착</button><button class="x" data-act="upgx">✕</button>';
    e.classList.remove('hidden'); pulse(e, 'pop'); trimToasts();
    sfx('quest_accept', { vol: 0.5, rate: 1.3 });
  }
  function hideUpgrade() { upg.item = null; upg.t = 0; $('#upg').classList.add('hidden'); }
  function frameUpg(dt) {
    if (!upg.item) return;
    upg.t -= dt;
    const i = P.inv.indexOf(upg.item);
    if (upg.t <= 0 || i < 0 || !(P.cpGain(upg.item) > 0)) hideUpgrade();
  }

  // ------------------------------------------------------------ 희귀 · 영웅 · 전설 장비 획득! — a big notice in the headline spot
  // (고급 and 일반 gear: a toast on the right). It shows the piece, NEW for a kind never owned before, and ▲ with the 전투력 it would add,
  // right away. Several at once (a guardian's loot) queue up rarest first and step aside sooner while others wait. It shares the
  // banner's spot (레벨 업 · 등대 점화 · a map's name): it waits while a banner shows, and when one arrives it steps aside — and comes
  // back after it, without its jingle, if it had barely been seen. Real clock.
  const LN = { q: [], cur: null, t: 0, age: 0, at: 0, out: false };
  const LN_T = [0, 0, 2.4, 2.8, 3.6]; // seconds on screen
  const BN_HOLD = 2700; // ms a banner keeps the spot (its fade-out starts at 2.5 s)
  function lootNote(item, isNew) {
    LN.q.push({ item, isNew });
    LN.q.sort((a, b) => (b.item.rar || 0) - (a.item.rar || 0));
  }
  function showLoot(n) {
    const it = n.item, b = D.ITEMS[it.b], r = U.clamp(it.rar || 0, 2, 4), rar = D.RAR[r], sl = D.SLOTS.find((s) => s.k === b.type);
    const up = P.cpGain(it), e = $('#loot'); // (asked now: a piece already put on in the meantime shows no ▲)
    LN.cur = n; LN.age = 0; LN.t = LN_T[r]; LN.out = false; LN.at = performance.now();
    e.innerHTML = '<div class="lt r' + r + '"><div class="lt-h">' + rar.name + ' 장비 획득!</div>' +
      '<div class="lt-b"><div class="lt-ic">' + (r >= 3 ? '<i class="lt-ray"></i>' : '') + X.slot(it, '', '', ' lt-sl') + '</div>' +
      '<div class="lt-t"><div class="lt-n"><b style="color:' + rar.color + '">' + esc(D.itemName(it)) + '</b>' + (n.isNew ? '<span class="nw">NEW</span>' : '') + '</div>' +
      '<small>' + rar.name + ' ' + (sl ? sl.name : '장비') + (up > 0 ? ' · <em>전투력 ▲ ' + fmt(up) + '</em>' : '') + '</small></div></div></div>';
    e.classList.remove('hidden');
    if (!n.again) sfx(r >= 4 ? 'loot_get4' : 'loot_get', r === 3 ? { rate: 1.12 } : undefined);
  }
  function hideLoot() { LN.q.length = 0; LN.cur = null; const e = $('#loot'); e.classList.add('hidden'); e.innerHTML = ''; }
  function frameLoot(dt) {
    if (LN.cur) {
      LN.age += dt; LN.t -= dt;
      if (bannerAt > LN.at && !LN.out) { // a banner took the spot: step aside now (back after it if it was barely seen)
        if (LN.age < 1.2) { LN.cur.again = true; LN.q.unshift(LN.cur); }
        LN.t = Math.min(LN.t, 0.25);
      }
      if (LN.q.length && LN.age > 1.2) LN.t = Math.min(LN.t, 0.3); // more waiting: step aside sooner
      if (LN.t <= 0.3 && !LN.out) { LN.out = true; const l = $('#loot .lt'); if (l) l.classList.add('out'); }
      if (LN.t <= 0) { LN.cur = null; $('#loot').classList.add('hidden'); }
    }
    if (!LN.cur && LN.q.length && performance.now() - bannerAt > BN_HOLD) showLoot(LN.q.shift());
  }

  // ------------------------------------------------------------ windows
  const open = {};
  let zTop = 10;
  const WIN = {
    char: { title: '캐릭터', key: 'C', w: 500, x: 44, y: 120, render: renderChar },
    bag: { title: '가방', key: 'I', w: 352, x: 890, y: 176, render: renderBag },
    skill: { title: '스킬', key: 'K', w: 520, x: 380, y: 60, render: renderSkill },
    quest: { title: '퀘스트', key: 'J', w: 600, x: 340, y: 130, render: renderQuest },
    map: { title: '세계 지도', key: 'M', w: 916, x: 182, y: 150, render: renderMap },
  };
  UI.isOpen = (id) => !!open[id];
  UI.open = function (id) {
    if (G.S.scene !== 'play' || G.S.lock) return;
    if (id === 'menu') { UI.menu(); return; }
    if (open[id]) { open[id].style.zIndex = ++zTop; return; }
    if (G.touch) { for (const o in open) { open[o].remove(); delete open[o]; } closePops(); } // touch: one window at a time (centered, scaled up — touch.js)
    const w = WIN[id], e = el('div', 'win w-' + id);
    e.style.left = (w.px === undefined ? w.x : w.px) + 'px'; e.style.top = (w.py === undefined ? w.y : w.py) + 'px'; e.style.width = w.w + 'px'; e.style.zIndex = ++zTop;
    e.innerHTML = '<div class="wh"><span>' + w.title + '</span><kbd>' + w.key + '</kbd><button class="x" data-act="close:' + id + '">✕</button></div><div class="wb"></div>';
    $('#wins').appendChild(e);
    open[id] = e;
    e.addEventListener('mousedown', () => { e.style.zIndex = ++zTop; });
    $('.wh', e).addEventListener('mousedown', (ev) => {
      if (ev.target.closest('.x')) return;
      const sx = ev.clientX, sy = ev.clientY, ox = e.offsetLeft, oy = e.offsetTop;
      const mv = (m) => { w.px = U.clamp(ox + (m.clientX - sx) / scaleK, -w.w + 80, G.W - 80); w.py = U.clamp(oy + (m.clientY - sy) / scaleK, 0, G.H - 40); e.style.left = w.px + 'px'; e.style.top = w.py + 'px'; };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      ev.preventDefault();
    });
    w.render($('.wb', e));
    sfx('open');
  };
  UI.close = function (id) { if (open[id]) { open[id].remove(); delete open[id]; tipHide(); sfx('close'); } };
  UI.toggle = (id) => (open[id] ? UI.close(id) : UI.open(id));
  UI.closeAll = function () { for (const id in open) { open[id].remove(); delete open[id]; } tipHide(); closePops(); };
  function refresh(id) { if (open[id]) { const b = $('.wb', open[id]), sc = $('.sk-l,.q-l', b), st = sc ? sc.scrollTop : 0; WIN[id].render(b); const s2 = $('.sk-l,.q-l', b); if (s2) s2.scrollTop = st; } }
  X.refresh = refresh;

  function renderChar(body) {
    const L = D.LINES[P.line], d = P.d;
    const eqSlot = (s) => { const it = P.eq[s.k]; return it ? X.slot(it, 'eq:' + s.k, ' data-dbl="uneq:' + s.k + '"') : '<div class="slot empty" data-tip="eq:' + s.k + '"><i>' + s.name + '</i></div>'; };
    const row = (n, v, tip) => '<tr' + (tip ? ' data-tip="txt:' + tip + '"' : '') + '><td>' + n + '</td><td>' + v + '</td><td></td></tr>';
    const statRow = (s) => {
      const g = P.ap > 0 ? P.cpWithStat(s.k, 1) - P.cp : 0;
      return '<tr data-tip="stat:' + s.k + '"><td>' + s.name + (s.k === L.main ? ' <span class="gd">★</span>' : '') + '</td><td>' + P.stats[s.k] + (d.s[s.k] > P.stats[s.k] ? ' <span class="ok">+' + (d.s[s.k] - P.stats[s.k]) + '</span>' : '') + '</td><td>' +
        (P.ap > 0 ? '<button class="pl" data-act="stat:' + s.k + '">+</button>' : '') + '</td><td class="cpg">' + (P.ap > 0 && g > 0 ? '▲' + fmt(g) : '') + '</td></tr>';
    };
    const left = '<div class="ch-l"><div class="ch-pv"><canvas></canvas></div><div class="ch-eq">' + D.SLOTS.map(eqSlot).join('') + '</div></div>';
    const head = '<div class="ch-t">' + esc(P.name) + '<small>Lv.' + P.lv + ' ' + P.jobName() + '</small></div>' +
      '<div class="ch-cp" data-tip="cp:">' + ic('ui_cp') + '<span>전투력</span><b>' + fmt(P.cp) + '</b></div>' +
      (P.ap > 0 ? '<div class="ap"><span>능력치 포인트 <b class="gd">' + P.ap + '</b></span><span class="sp"></span><button class="btn sm" data-act="autostat" data-tip="txt:주 능력치(★) 위주로 자동 분배합니다">추천 분배</button></div>' : '') +
      (P.freeReset > 0 ? '<div class="ap fr"><span>무료 능력치 초기화 <b class="gd">' + P.freeReset + '회</b></span><span class="sp"></span><button class="btn sub sm" data-act="freereset">초기화</button></div>' : '');
    const derived = (sep) => '<tr' + (sep ? ' class="sep"' : '') + '><td>공격력</td><td>' + fmt(d.atk) + '</td><td></td><td></td></tr>' + row('방어력', fmt(d.def)) + row('최대 HP', fmt(d.maxHp)) + row('최대 MP', fmt(d.maxMp)) +
      row('치명타 확률', d.crit + '%') + row('치명타 피해', d.critDmg + '%') + row('이동 속도', Math.round(d.spd / 2.5) + '%') + row('공격 속도', Math.round(d.aspd * 100) + '%') +
      (d.expp ? row('경험치 획득', '+' + d.expp + '%') : '') + (d.goldp ? row('골드 획득', '+' + d.goldp + '%') : '');
    const hint = '<div class="hint">' + (P.line === 'novice' ? '★ 주 능력치 · 1차 전직 때 능력치가 한 번 초기화되어 새 직업에 맞게 다시 분배할 수 있어요.<br>' : '★ 주 능력치 · 능력치 초기화는 교관에게서도 할 수 있어요.<br>') +
      (G.touch ? '' : 'Shift+클릭: 10씩 올리기 · ') + '처치 ' + fmt(P.kills) + ' · 플레이 ' + Math.floor(P.playtime / 60) + '분</div>';
    // touch: three columns (look · stats with their + · the rest), short enough to scale up to a finger's size
    if (G.touch) body.innerHTML = '<div class="ch ch3">' + left + '<div class="ch-r">' + head + '<table class="stt">' + D.STATS.map(statRow).join('') + '</table></div><div class="ch-d"><table class="stt">' + derived(false) + '</table>' + hint + '</div></div>';
    else body.innerHTML = '<div class="ch">' + left + '<div class="ch-r">' + head + '<table class="stt">' + D.STATS.map(statRow).join('') + derived(true) + '</table>' + hint + '</div></div>';
    X.addLive($('canvas', body), 192, 186, (c, t) => { c.translate(90, 174); A.shadow(c, 0, 0, 32); c.scale(1.85, 1.85); A.hero(c, P.artLook(), { state: P.cheerT > 0 ? 'cheer' : 'idle', t }); });
  }
  const UPG_MARK = '<span class="upm">▲</span>';
  function renderBag(body) {
    body.innerHTML = '<div class="grid">' + P.inv.map((it, i) => {
      if (!it) return X.slot(null);
      const b = D.ITEMS[it.b], eq = D.isEquip(b), g = eq ? P.cpGain(it) : null, pot = b.type === 'use' && b.use !== 'return';
      return X.slot(it, 'inv:' + i, ' data-dbl="use:' + i + '" data-ctx="ictx:' + i + '"' + (pot ? ' data-drag="inv:' + i + '"' : ''), eq && Inv.cantEquip(it) ? ' no' : '', g > 0 ? UPG_MARK : '');
    }).join('') + '</div>' +
      '<div class="row" style="margin-top:10px"><span class="gold">' + fmt(P.gold) + ' G</span><span class="sp"></span><span class="dim" style="font-size:12px">' + (36 - Inv.free()) + ' / 36</span><button class="btn sub sm" data-act="sort">정리</button></div>' +
      (G.touch ? '<div class="hint">아이템을 누르면: 정보 · 장착 · 사용 · 물약 버튼에 등록 · 버리기<br><span class="upm in">▲</span> 장착하면 전투력이 오르는 장비</div>'
        : '<div class="hint">더블클릭: 장착 · 사용 &nbsp;|&nbsp; 우클릭: 메뉴 (단축키 등록 · 버리기)<br><span class="upm in">▲</span> 장착하면 전투력이 오르는 장비 &nbsp;|&nbsp; 물약은 단축키 칸으로 끌어다 놓기</div>');
  }
  X.invHint = '더블클릭: 장착 · 사용 · 우클릭: 메뉴';
  // what one more skill point would do to 전투력 (shown next to its + button, like the stat rows in the character window)
  const skGain = (id) => { const g = P.cpWithSkill(id) - P.cp; return g > 0 ? '<em data-tip="txt:+1 올리면 전투력 ▲ ' + fmt(g) + '">▲' + fmt(g) + '</em>' : ''; };
  function renderSkill(body) {
    const groups = P.line === 'novice' ? [['novice', 0]] : [[P.line, 1], [P.line, 2], [P.line, 3]];
    let s = '<div class="sk-h"><span>스킬 포인트 <b class="gd">' + P.sp + '</b></span><span class="sp"></span><span class="dim" style="font-size:12px">' +
      (G.touch ? '[버튼]을 눌러 오른쪽 스킬 버튼 1 ~ 8 중 자리를 고르세요' : '아이콘을 아래 단축키 칸으로 끌어다 놓거나 키 버튼을 누르세요') + '</span></div><div class="sk-l">';
    const order = G.touch ? [0, 1, 2, 3, 4, 5, 6, 7] : ROWS[0].concat(ROWS[1]); // (touch: buttons 1 ~ 4, then 5 ~ 8 on the second page)
    for (const [line, tier] of groups) {
      const lock = tier > P.tier, name = line === 'novice' ? '견습 등불지기' : tier + '차 · ' + D.LINES[line].names[tier];
      s += '<div class="sk-g' + (lock ? ' lock' : '') + '">' + name + (lock ? ' — Lv.' + D.JOB_LV[tier] + ' 전직 필요' : '') + '</div>';
      for (const sk of D.skillsOf(line, tier)) {
        const lv = P.skills[sk.id] || 0, v = sk.v(Math.max(1, lv)), can = !lock && P.sp > 0 && lv < sk.max, slot = P.hot.indexOf(sk.id), act = sk.kind !== 'passive' && lv > 0;
        s += '<div class="sk' + (lock ? ' lock' : '') + '"><div class="si' + (act ? ' dg' : '') + '" data-tip="skill:' + sk.id + '"' + (act ? ' data-drag="sk:' + sk.id + '"' : '') + '>' + ic(sk.icon) + (slot >= 0 ? '<span class="kb">' + I.slotKey(slot) + '</span>' : '') + '</div><div class="sm"><div class="sn">' + sk.name +
          '<em class="' + (sk.kind === 'passive' ? 'p' : sk.kind === 'buff' ? 'b' : '') + '">' + (sk.kind === 'passive' ? '패시브' : sk.kind === 'buff' ? '버프' : '액티브') + '</em></div>' +
          '<div class="sd">' + sk.desc(v) + '</div>' + (sk.kind !== 'passive' ? '<div class="sx">MP ' + v.mp + ' · 재사용 ' + v.cd + '초</div>' : '') +
          (UI.assign === sk.id ? '<div class="keys" style="margin-top:5px">' + order.map((i) => '<button class="keyb' + (P.hot[i] ? ' used' : '') + '" data-act="bind:' + i + '" data-tip="txt:' + (P.hot[i] ? D.SKILLS[P.hot[i]].name + ' 자리' : '빈 칸') + '">' + I.slotKey(i) + '</button>').join('') + '<button class="keyb" data-act="bind:-1">해제</button></div>' : '') +
          '</div><div class="sr"><span class="lv">Lv.' + lv + '<span class="dim"> / ' + sk.max + '</span></span>' +
          (can ? '<span class="skup">' + skGain(sk.id) + '<button class="pl" data-act="skup:' + sk.id + '">+</button></span>' : '') +
          (act ? '<button class="keyb" data-act="assign:' + sk.id + '">' + (slot >= 0 ? I.slotKey(slot) : G.touch ? '버튼' : '키') + '</button>' : '') + '</div></div>';
      }
    }
    if (P.line === 'novice') s += '<div class="hint" style="padding:6px 2px">레벨 ' + D.JOB_LV[1] + '이 되면 마을의 교관에게서 전직하여 새로운 스킬을 배울 수 있습니다.</div>';
    body.innerHTML = s + '</div>';
  }
  function renderQuest(body) {
    const act = [], av = [], dn = [];
    for (const id in D.QUESTS) { const st = Q.st(id); if (st === 'active' || st === 'ready') act.push(id); else if (st === 'avail') av.push(id); else if (st === 'done') dn.push(id); }
    const all = act.concat(av, dn);
    if (!UI.qsel || !all.includes(UI.qsel)) UI.qsel = all[0];
    const item = (id) => { const q = D.QUESTS[id], st = Q.st(id); return '<div class="q-i' + (id === UI.qsel ? ' sel' : '') + (st === 'done' ? ' done' : st === 'ready' ? ' rd' : '') + '" data-act="qsel:' + id + '">' + q.name + '<small>' + (q.main ? '메인 · ' : '') + (st === 'ready' ? '완료 가능' : st === 'active' ? '진행 중' : st === 'avail' ? D.NPCS[q.giver].name + '에게서 수락' : '완료') + '</small></div>'; };
    let s = '<div class="qw"><div class="q-l">' + (all.length ? all.map(item).join('') : '<div class="dim">아직 퀘스트가 없습니다.</div>') + '</div><div class="q-d">';
    const id = UI.qsel;
    if (id) {
      const q = D.QUESTS[id], st = Q.st(id), r = q.rew || {};
      // a finished goal says so (✔ · 완료) — a goal that only turned green, still listed as "…(몽실대왕 처치)", read as not done yet —
      // and once every goal is met, who to report to and where (until then the quest stays 진행 중)
      const to = D.NPCS[q.to].name, home = Object.values(G.MAPS).find((m) => (m.npcs || []).some((n) => n[0] === q.to));
      s += '<h3>' + q.name + '</h3><p class="dim">의뢰: ' + D.NPCS[q.giver].name + (q.to !== q.giver ? ' → 보고: ' + to : '') + '</p><p>' + q.offer.join(' ') + '</p><h4>목표</h4>' +
        (st === 'ready' ? '<p class="q-next">✔ 목표를 모두 이뤘어요! <b>' + to + '</b>' + (home ? '(' + home.name + ')' : '') + '에게 돌아가 보고하면 완료돼요.</p>' : '') + '<ul>' +
        q.goals.map((g, i) => { const p = st === 'done' ? [g.n || 1, g.n || 1] : Q.prog(id, i), ok = p[0] >= p[1]; return '<li class="' + (ok ? 'ok' : '') + '">' + (ok ? '✔ ' : '') + Q.goalText(g) + (p[1] > 1 ? ' (' + p[0] + ' / ' + p[1] + ')' : ok ? ' — 완료' : '') + '</li>'; }).join('') + '</ul><h4>보상</h4><div class="rw">' +
        (r.exp ? '<span>EXP ' + fmt(r.exp) + '</span>' : '') + (r.gold ? '<span class="gold">' + fmt(r.gold) + ' G</span>' : '') + (r.items || []).map(([b, n]) => X.slot({ b, n, rar: 1 }, 'base:' + b)).join('') + '</div>';
    }
    body.innerHTML = s + '</div></div>';
  }
  function renderMap(body) {
    const cur = G.map.id, cost = G.Game.travelCost(), poor = cost > P.gold;
    const goTip = poor ? '<b class=bad>골드가 부족해요</b><br>이동 비용 ' + fmt(cost) + ' G · 보유 ' + fmt(P.gold) + ' G' : '클릭하여 이동' + (cost ? ' (' + fmt(cost) + ' G · 보유 ' + fmt(P.gold) + ' G)' : '');
    let lines = '', nodes = '';
    for (const [a, b] of G.MAP_LINKS) { const A1 = G.MAPS[a].wm, B1 = G.MAPS[b].wm, seen = P.visited[a] || P.visited[b]; lines += '<line x1="' + A1[0] + '" y1="' + A1[1] + '" x2="' + B1[0] + '" y2="' + B1[1] + '" stroke="' + (seen ? '#8a76b8' : '#3c2f5e') + '" stroke-width="5" stroke-dasharray="1 11" stroke-linecap="round"/>'; }
    for (const id in G.MAPS) {
      const m = G.MAPS[id], vis = !!P.visited[id], lit = !!P.beacons[id], tried = !m.town && G.Game.tried(id), go = id !== cur && (m.town ? vis : lit || tried); // (tried: a guardian that felled you — straight back to its beacon)
      const known = vis || G.MAP_LINKS.some(([a, b]) => (a === id && P.visited[b]) || (b === id && P.visited[a]));
      nodes += '<div class="wm-n' + (m.town ? ' town' : '') + (lit ? ' lit' : '') + (tried ? ' tried' : '') + (vis ? '' : ' unk') + (id === cur ? ' cur' : '') + (go ? ' go' : '') + '" style="left:' + m.wm[0] + 'px;top:' + m.wm[1] + 'px"' + (go ? ' data-act="travel:' + id + '" data-tip="txt:' + goTip + '"' : '') + '><i></i><b>' + (known ? m.name : '???') + '</b><small>' + (m.town ? '마을' : known && m.lv ? 'Lv.' + m.lv[0] + (m.lv[1] !== m.lv[0] ? '~' + m.lv[1] : '') : '') + (D.BEACONS[id] ? (lit ? ' · 등대 ✦' : tried ? ' · 도전 중' : known ? ' · 등대 ✧' : '') : '') + '</small></div>';
    }
    const litN = Object.keys(D.BEACONS).filter((k) => P.beacons[k]).length;
    body.innerHTML = '<div class="wm"><svg width="892" height="310">' + lines + '</svg>' + nodes + '</div>' +
      '<div class="row"><span>밝힌 등대 <b class="gd">' + litN + ' / 7</b></span><span class="sp"></span><span class="dim" style="font-size:12.5px">마을 · 밝힌 등대를 클릭하면 어디서든 이동' + (cost ? ' (' + fmt(cost) + ' G)' : '') + ' · 등대 앞 ↑ / 반디 할멈 · 모래눈에게선 <b class="ok">무료</b></span>' +
      (cost ? '<span class="wm-w">보유 <b class="' + (poor ? 'bad' : 'gold') + '">' + fmt(P.gold) + ' G</b></span>' : '') + '</div>';
  }

  // ------------------------------------------------------------ popovers: potion slot chooser · bag context menu
  const pop = { kind: null, t: null };
  function closePops() {
    if (!root) return;
    if (pop.kind) { pop.kind = null; $('#pp').classList.add('hidden'); $('#cm').classList.add('hidden'); $('#cm').classList.remove('card'); }
  }
  X.closePops = closePops;
  function place(e, x, y, above) {
    const w = e.offsetWidth, h = e.offsetHeight;
    e.style.left = U.clamp(x - (above ? w / 2 : 0), 8, G.W - w - 8) + 'px';
    e.style.top = U.clamp(above ? y - h - 10 : y, 8, G.H - h - 8) + 'px';
  }
  function renderPotSel(t) {
    const list = Inv.potChoices(t), reg = P.pot[t], nm = t === 'hp' ? 'HP' : 'MP', cur = Inv.quickInfo(t);
    let s = '<h4>' + nm + (G.touch ? ' 물약 버튼' : ' 물약 단축키 <kbd>' + I.keys(t) + '</kbd>') + '</h4><div class="pp-l">' +
      '<div class="pp-i' + (!reg ? ' on' : '') + '" data-act="potset:' + t + ':"><div class="pp-a">AUTO</div><div><b>자동 선택</b><small>가지고 있는 가장 좋은 물약' + (!reg && cur ? ' · 지금: ' + D.ITEMS[cur.b].name : '') + '</small></div></div>';
    for (const o of list) {
      const b = D.ITEMS[o.b];
      s += '<div class="pp-i' + (reg === o.b ? ' on' : '') + '" data-act="potset:' + t + ':' + o.b + '"><div class="slot">' + ic(b.icon) + '</div><div><b>' + b.name + '</b><small>' + (b.use === 'full' ? 'HP · MP 모두 회복' : nm + ' +' + fmt(b.val)) + ' · ' + o.n + '개</small></div></div>';
    }
    if (!list.length) s += '<div class="dim" style="padding:6px 4px">가진 물약이 없습니다. 잡화상에서 구입하세요.</div>';
    s += '</div><div class="pp-au"><span>초롱이 자동 물약</span>' + [0, 30, 50, 70].map((v) => '<button class="keyb' + ((P.auto[t] || 0) === v ? ' on' : '') + '" data-act="potauto:' + t + ':' + v + '">' + (v ? v + '%' : '끄기') + '</button>').join('') + '</div>' +
      '<div class="hint" style="margin-top:5px">' + nm + '가 정한 % 아래로 떨어지면 초롱이가 알아서 먹여 줘요.</div>';
    $('#pp').innerHTML = s;
  }
  function openPotSel(t, anchor) {
    if (pop.kind === 'pot' && pop.t === t) { closePops(); return; }
    closePops(); tipHide();
    pop.kind = 'pot'; pop.t = t; pop.anchor = anchor;
    const e = $('#pp');
    renderPotSel(t); e.classList.remove('hidden');
    const r = anchor.getBoundingClientRect(), [x, y] = toLogical(r.left + r.width / 2, r.top);
    place(e, x, y, true);
    sfx('open');
  }
  function openCtx(i, ev) {
    const it = P.inv[i];
    if (!it) return;
    closePops(); tipHide();
    const b = D.ITEMS[it.b], opts = [];
    if (D.isEquip(b)) opts.push([Inv.cantEquip(it) ? '장착 불가' : '장착하기', 'use:' + i, Inv.cantEquip(it) ? 'off' : '']);
    else if (b.type === 'use') {
      opts.push(['사용하기', 'use:' + i]);
      if (b.use === 'hp' || b.use === 'full') opts.push(['HP 물약 단축키(' + I.key('hp') + ')에 등록', 'potset:hp:' + it.b, P.pot.hp === it.b ? 'on' : '']);
      if (b.use === 'mp' || b.use === 'full') opts.push(['MP 물약 단축키(' + I.key('mp') + ')에 등록', 'potset:mp:' + it.b, P.pot.mp === it.b ? 'on' : '']);
    }
    opts.push(['버리기', 'drop:' + i, 'bad']);
    const e = $('#cm');
    e.innerHTML = '<div class="cm-h">' + esc(D.itemName(it)) + '</div>' + opts.map(([t, a, c]) => '<button class="cm-i ' + (c || '') + '" data-act="' + a + '">' + t + '</button>').join('');
    pop.kind = 'ctx';
    e.classList.remove('hidden');
    const [x, y] = toLogical(ev.clientX, ev.clientY);
    place(e, x + 4, y + 4, false);
  }
  X.openPotSel = openPotSel;
  // touch: a tap on an item opens its card — what the tooltip says, and what the mouse would do with a double-click / right-click.
  // kind: 'inv' (bag) · 'eq' (worn, character window) · 'sell' (bag inside a shop). touch.js centers and scales it.
  function openCard(kind, a) {
    const it = kind === 'eq' ? P.eq[a] : P.inv[a];
    if (!it) return;
    closePops(); tipHide();
    const b = D.ITEMS[it.b], opts = [];
    if (kind === 'eq') opts.push(['해제하기', 'uneq:' + a]);
    else if (kind === 'sell') {
      opts.push(['판매하기 · ' + fmt(D.sellPrice(it)) + ' G', 'sell:' + a]);
      if (it.n > 1) opts.push(['모두 판매 (' + it.n + '개) · ' + fmt(D.sellPrice(it) * it.n) + ' G', 'sellall:' + a]);
    } else if (D.isEquip(b)) opts.push([Inv.cantEquip(it) ? '장착할 수 없어요' : '장착하기', 'use:' + a, Inv.cantEquip(it) ? 'off' : 'pri']);
    else if (b.type === 'use') {
      opts.push(['사용하기', 'use:' + a, 'pri']);
      if (b.use === 'hp' || b.use === 'full') opts.push(['HP 물약 버튼에 등록', 'potset:hp:' + it.b, P.pot.hp === it.b ? 'on' : '']);
      if (b.use === 'mp' || b.use === 'full') opts.push(['MP 물약 버튼에 등록', 'potset:mp:' + it.b, P.pot.mp === it.b ? 'on' : '']);
    }
    if (kind === 'inv') opts.push(['버리기', 'drop:' + a, 'bad']);
    opts.push(['닫기', 'cmx', 'sub']);
    const e = $('#cm');
    e.innerHTML = '<div class="cm-tip">' + X.itemTip(it, { cmp: kind !== 'eq' }) + '</div>' + opts.map(([t, x, c]) => '<button class="cm-i ' + (c || '') + '" data-act="' + x + '">' + t + '</button>').join('');
    pop.kind = 'ctx';
    e.classList.add('card'); e.classList.remove('hidden');
    place(e, G.W / 2, G.H / 2, false);
    if (G.Touch) G.Touch.fitNow();
    sfx('open');
  }
  X.openCard = openCard;

  // ------------------------------------------------------------ drag & drop (skills → hotbar, hotbar ↔ hotbar, potions → potion slots)
  let drag = null, justDragged = 0;
  function dropOn(src, dst) {
    const [sk, sa] = [src.slice(0, src.indexOf(':')), src.slice(src.indexOf(':') + 1)];
    const dk = dst ? dst.slice(0, dst.indexOf(':')) : null, da = dst ? dst.slice(dst.indexOf(':') + 1) : null;
    if (sk === 'sk' && dk === 'hot') { bindSkill(sa, +da); return; }
    if (sk === 'hot') {
      const i = +sa, id = P.hot[i];
      if (!id) return;
      if (dk === 'hot') { const j = +da; if (i === j) return; P.hot[i] = P.hot[j]; P.hot[j] = id; sfx('equip'); G.emit('skills'); return; }
      if (!dst) { P.hot[i] = null; sfx('close'); G.emit('skills'); UI.log(D.SKILLS[id].name + ' 단축키를 해제했습니다.', 'sys'); }
      return;
    }
    if (sk === 'inv' && dk === 'pot') {
      const it = P.inv[+sa], b = it && D.ITEMS[it.b];
      if (!b) return;
      if (b.use === da || b.use === 'full') Inv.setPot(da, it.b);
      else { UI.log((da === 'hp' ? 'HP' : 'MP') + ' 물약 칸에는 ' + (da === 'hp' ? '생명' : '마나') + ' 물약만 놓을 수 있습니다.', 'warn'); sfx('error'); }
    }
  }
  function bindSkill(id, i) {
    if (!id || !(P.skills[id] > 0)) return;
    const old = P.hot.indexOf(id);
    if (i >= 0) {
      if (old >= 0) P.hot[old] = P.hot[i] && old !== i ? P.hot[i] : null; // dropping onto a used slot swaps the two skills
      P.hot[i] = id;
    } else if (old >= 0) P.hot[old] = null;
    UI.assign = null; sfx('equip'); G.emit('skills');
  }
  X.bindSkill = bindSkill;
  function initDrag() {
    root.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return;
      const t = ev.target.closest('[data-drag]');
      if (!t || !root.contains(t)) return;
      const img = t.querySelector('img.ic');
      drag = { src: t.getAttribute('data-drag'), x: ev.clientX, y: ev.clientY, on: false, ghost: null, img: img ? img.getAttribute('src') : '', from: t, over: null };
    });
    window.addEventListener('mousemove', (ev) => {
      if (!drag) return;
      if (!drag.on) {
        if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 6) return;
        drag.on = true; tipHide(); closePops();
        drag.ghost = el('div', 'dragg', drag.img ? '<img src="' + drag.img + '" alt="">' : '');
        root.appendChild(drag.ghost); root.classList.add('dragging'); drag.from.classList.add('dsrc');
      }
      const [x, y] = toLogical(ev.clientX, ev.clientY);
      drag.ghost.style.left = x - 24 + 'px'; drag.ghost.style.top = y - 24 + 'px';
      const tg = document.elementFromPoint(ev.clientX, ev.clientY), dz = tg && tg.closest ? tg.closest('[data-drop]') : null;
      if (dz !== drag.over) { if (drag.over) drag.over.classList.remove('dover'); drag.over = dz; if (dz) dz.classList.add('dover'); }
    });
    window.addEventListener('mouseup', (ev) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (!d.on) return;
      d.ghost.remove(); root.classList.remove('dragging'); d.from.classList.remove('dsrc');
      if (d.over) d.over.classList.remove('dover');
      justDragged = performance.now();
      const tg = document.elementFromPoint(ev.clientX, ev.clientY), dz = tg && tg.closest ? tg.closest('[data-drop]') : null;
      dropOn(d.src, dz && root.contains(dz) ? dz.getAttribute('data-drop') : null);
    });
  }
  X.cancelDrag = () => { if (drag && drag.on) { drag.ghost.remove(); root.classList.remove('dragging'); drag.from.classList.remove('dsrc'); if (drag.over) drag.over.classList.remove('dover'); } drag = null; };

  // ------------------------------------------------------------ actions (event delegation)
  const ACT = (X.ACT = {
    win: (a) => { if (a === 'menu') UI.menu(); else UI.toggle(a); },
    close: (a) => UI.close(a),
    stat: (a, e, ev) => { P.addStat(a, ev.shiftKey ? 10 : 1); },
    autostat: () => P.autoStat(),
    freereset: () => UI.confirm('능력치를 모두 되돌려 받습니다.<br><span class="dim">무료 초기화 ' + P.freeReset + '회 중 1회를 사용합니다.</span>', () => { if (G.Game.statReset() && UI.statReset) UI.statReset(0); }, { yes: '초기화' }),
    sort: () => Inv.sort(),
    use: (a) => { Inv.use(+a); tipHide(); },
    uneq: (a) => { Inv.unequip(a); tipHide(); },
    ictx: () => {},
    drop: (a) => {
      const it = P.inv[a];
      if (!it) return;
      UI.confirm('<b>' + esc(D.itemName(it)) + '</b>' + (it.n > 1 ? ' ' + it.n + '개' : '') + '를 버리시겠습니까?<br><span class="dim">버린 아이템은 되찾을 수 없습니다.</span>', () => Inv.discard(+a), { yes: '버린다', no: '취소' });
    },
    potsel: (a, e) => openPotSel(a, e),
    potset: (a) => { const [t, id] = a.split(':'); Inv.setPot(t, id || null); if (pop.kind === 'pot') renderPotSel(t); },
    potauto: (a) => {
      const [t, v] = a.split(':');
      P.auto[t] = +v || 0; sfx('click'); dirty.hot = 1;
      UI.log('초롱이 자동 ' + (t === 'hp' ? 'HP' : 'MP') + ' 물약: ' + (P.auto[t] ? P.auto[t] + '% 이하에서 사용' : '끔'), 'sys');
      if (pop.kind === 'pot') renderPotSel(t);
    },
    skup: (a) => { P.skillUp(a); },
    assign: (a) => { UI.assign = UI.assign === a ? null : a; refresh('skill'); sfx('click'); },
    bind: (a) => bindSkill(UI.assign, +a),
    qsel: (a) => { UI.qsel = a; refresh('quest'); sfx('click'); },
    travel: (a) => { if (G.Game.fastTravel(a)) UI.close('map'); },
    upgeq: () => { const i = P.inv.indexOf(upg.item); if (i >= 0) Inv.equip(i); hideUpgrade(); tipHide(); },
    upgx: () => { hideUpgrade(); tipHide(); },
    cmx: () => { closePops(); sfx('close'); }, // (touch item card: 닫기)
  });
  function onAct(attr, ev) {
    const t = ev.target.closest('[' + attr + ']');
    if (!t || !root.contains(t)) return false;
    const v = t.getAttribute(attr), i = v.indexOf(':'), k = i < 0 ? v : v.slice(0, i), a = i < 0 ? '' : v.slice(i + 1);
    if (ACT[k]) { ACT[k](a, t, ev); return true; }
    return false;
  }

  // ------------------------------------------------------------ init / events / frame
  UI.init = function () {
    root = $('#ui');
    root.innerHTML = '<div id="hud" class="hidden"></div><div id="wins"></div><div id="dlg" class="pnl hidden"></div><div id="toast"></div><div id="pp" class="pnl hidden"></div><div id="cm" class="pnl hidden"></div><div id="title" class="hidden"></div><div id="tip" class="hidden"></div>';
    tipEl = $('#tip');
    buildHud();
    initDrag();
    root.addEventListener('click', (ev) => {
      if (performance.now() - justDragged < 80) { ev.stopPropagation(); return; }
      // touch: an item in the bag / worn in the character window / in the bag inside a shop opens its card (info + actions)
      // instead of the mouse's tooltip, double-click and right-click — and a tap in a shop never sells straight away
      if (G.touch) {
        const c = ev.target.closest('[data-ctx^="ictx:"], .ch-eq [data-dbl^="uneq:"], [data-act^="sell:"]');
        if (c && root.contains(c) && !c.closest('#cm')) {
          const ctx = c.getAttribute('data-ctx'), dbl = c.getAttribute('data-dbl'), act = c.getAttribute('data-act');
          if (ctx) openCard('inv', +ctx.slice(5)); else if (dbl) openCard('eq', dbl.slice(5)); else openCard('sell', +act.slice(5));
          ev.stopPropagation();
          return;
        }
      }
      const inPop = ev.target.closest('#pp,#cm');
      const hit = onAct('data-act', ev);
      if (hit) ev.stopPropagation();
      // clicks outside a popover close it (a click inside the bag menu closes it after its action)
      if (pop.kind && (!inPop || (pop.kind === 'ctx' && hit)) && !(hit && ev.target.closest('[data-act^="potsel"]'))) closePops();
      // never leave keyboard focus on a button: Space / Enter are game keys
      const ae = document.activeElement;
      if (ae && ae !== document.body && ae.tagName !== 'INPUT') ae.blur();
    });
    root.addEventListener('dblclick', (ev) => { onAct('data-dbl', ev); });
    root.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      const t = ev.target.closest('[data-ctx]');
      if (t && root.contains(t) && /^ictx:/.test(t.getAttribute('data-ctx'))) { openCtx(+t.getAttribute('data-ctx').slice(5), ev); return; }
      onAct('data-ctx', ev);
    });
    document.addEventListener('contextmenu', (ev) => ev.preventDefault());
    document.addEventListener('mousedown', (ev) => { if (pop.kind && !(ev.target.closest && ev.target.closest('#pp,#cm,[data-act^="potsel"]'))) closePops(); }, true);
    // tooltips follow a mouse only: a finger's tap also sends mouseover, and on iPhone a tooltip appearing at that moment swallows
    // the tap's click (touch shows the same things in item cards — openCard)
    let ptrTouch = false;
    const ptr = (e) => { ptrTouch = e.pointerType !== 'mouse'; };
    window.addEventListener('pointerdown', ptr, true); window.addEventListener('pointerover', ptr, true);
    root.addEventListener('mouseover', (ev) => {
      if (drag && drag.on) return;
      if (ptrTouch || G.touch) { tipHide(); return; }
      const t = ev.target.closest('[data-tip]');
      if (!t) { tipHide(); return; }
      const key = t.getAttribute('data-tip');
      if (key !== tipKey) { const html = tipHTML(key); if (!html) { tipHide(); return; } tipKey = key; tipEl.innerHTML = html; tipEl.classList.remove('hidden'); }
      tipMove(ev);
    });
    root.addEventListener('mousemove', (ev) => { if (tipKey) tipMove(ev); });
    root.addEventListener('mouseleave', tipHide);
    root.addEventListener('mousedown', (ev) => { if (ev.target.closest('button,.mb,.slot,.btn')) { if (G.Audio) G.Audio.init(); } });
    // mouse wheel over a potion slot: switch potion without opening anything
    root.addEventListener('wheel', (ev) => {
      const t = ev.target.closest('.hs.pot');
      if (!t) return;
      ev.preventDefault();
      Inv.cyclePot(t.id === 'hp-hp' ? 'hp' : 'mp', ev.deltaY > 0 ? 1 : -1);
      tipKey = null; // refresh the tooltip
    }, { passive: false });

    const mark = (...ks) => () => { for (const k of ks) dirty[k] = 1; };
    G.on('hp', mark('st')); G.on('exp', mark('st')); G.on('gold', mark('st', 'bag', 'map', 'ext'));
    G.on('stats', mark('st', 'char', 'bag')); G.on('equip', mark('hot', 'char', 'bag'));
    G.on('inv', mark('bag', 'pots', 'quest', 'char', 'ext', 'pp')); G.on('skills', mark('hot', 'skill', 'st'));
    G.on('quest', mark('quest', 'st'));
    G.on('cp', cpChanged);
    G.on('skill', (id) => { const i = P.hot.indexOf(id); if (i >= 0) pulse(document.getElementById('hs' + i), 'use'); });
    G.on('skillDeny', (i) => pulse(document.getElementById('hs' + i), 'deny'));
    G.on('potUse', (t) => pulse(document.getElementById('hp-' + t), 'use'));
    G.on('job', () => { dirty.hot = dirty.skill = dirty.char = dirty.st = 1; UI.banner(P.jobName(), P.tier + '차 전직 완료!', 'lv'); UI.log('전직: ' + P.jobName(), 'quest'); });
    G.on('levelup', (lv) => { dirty.st = dirty.char = dirty.skill = dirty.bag = dirty.map = 1; UI.banner('LEVEL UP!', '레벨 ' + lv + ' 달성', 'lv'); UI.log('레벨 ' + lv + ' 달성! 능력치 포인트 +' + D.STAT_PER_LV, 'quest'); });
    G.on('map', (m) => {
      dirty.st = dirty.quest = dirty.map = 1;
      $('#mm-n').textContent = m.name; $('#mm-lv').textContent = m.town ? '안전 지대' : m.def.lv ? 'Lv.' + m.def.lv[0] + (m.def.lv[1] !== m.def.lv[0] ? ' ~ ' + m.def.lv[1] : '') : '';
      $('#boss').classList.add('hidden');
      UI.banner(m.name, m.town ? '마을 · 안전 지대' : m.def.lv ? '권장 레벨 ' + m.def.lv[0] + (m.def.lv[1] !== m.def.lv[0] ? ' ~ ' + m.def.lv[1] : '') : '');
    });
    G.on('msg', (t, k) => UI.log(t, k || 'sys'));
    // isNew: a kind of gear never owned before (combat.js / game.js ask Inv.isNew before the bag takes it)
    G.on('loot', (item, isNew) => {
      const b = D.ITEMS[item.b], eq = D.isEquip(b), r = eq ? item.rar || 0 : 0, col = eq ? D.RAR[r].color : '#fff', nw = isNew ? '<span class="nw">NEW</span>' : '';
      UI.log('획득: <span style="color:' + col + '">' + esc(D.itemName(item)) + '</span>' + (item.n > 1 ? ' ×' + item.n : '') + (nw ? ' ' + nw : ''));
      if (eq && r >= 2) lootNote(item, isNew); // 희귀 · 영웅 · 전설: the big notice
      else if (eq && (r >= 1 || isNew)) {
        const up = P.cpGain(item);
        UI.toast(X.slot(item) + nw + '<span style="color:' + col + '">' + esc(b.name) + '</span><span class="dim">' + D.RAR[r].name + '</span>' + (up > 0 ? '<em class="up">▲ ' + fmt(up) + '</em>' : ''));
      }
      if (eq) showUpgrade(item);
    });
    G.on('questDone', (q) => {
      const r = q.rew || {}, rw = [r.exp ? 'EXP ' + fmt(r.exp) : '', r.gold ? fmt(r.gold) + ' G' : ''].filter(Boolean).join(' · '); // reward items follow as 획득 lines
      UI.toast('<span class="gd">✔ 퀘스트 완료</span><span>' + q.name + '</span>' + (rw ? '<span class="dim">' + rw + '</span>' : ''));
      UI.log('퀘스트 완료: ' + q.name + (rw ? ' — 보상 ' + rw : ''), 'quest');
    });
    G.on('boss', (m) => { $('#boss').classList.remove('hidden'); $('#boss-n').textContent = 'Lv.' + m.lv + ' ' + m.name; UI.banner(m.name, '어스름의 수호자', 'boss'); });
    G.on('bossEnd', (win) => { $('#boss').classList.add('hidden'); if (win) UI.log('수호자를 물리쳤습니다!' + (G.Game.wonTry > 1 ? ' — ' + G.Game.wonTry + '번째 도전 만에 성공!' : ''), 'quest'); });
    G.on('beacon', (id) => { dirty.map = 1; UI.banner('등대 점화!', D.BEACONS[id].name + '에 다시 불이 켜졌습니다', 'lit'); UI.log(D.BEACONS[id].name + '에 불을 밝혔습니다. 이제 이곳으로 순간이동할 수 있습니다.', 'quest'); });
    G.on('keys', () => { dirty.hot = dirty.skill = 1; });
    G.on('saved', () => {});
    if (X.init2) X.init2(root);
  };
  UI.showHud = function (on) {
    $('#hud').classList.toggle('hidden', !on);
    if (on) { buildHot(); updStatus(); updQuestTrack(); updBuffs(); hideUpgrade(); hideLoot(); cpA.show = 0; $('#cpfx').classList.add('hidden'); }
    else closePops();
  };
  let frameN = 0, buffSig = '';
  UI.frame = function (dt) {
    frameN++;
    const t = G.time;
    // live canvases
    for (let i = live.length - 1; i >= 0; i--) {
      const L = live[i];
      if (!L.cv.isConnected) { live.splice(i, 1); continue; }
      const c = L.c;
      c.setTransform(L.s, 0, 0, L.s, 0, 0); c.clearRect(0, 0, L.w, L.h);
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.save();
      try { L.draw(c, t, dt); } catch (e) { if (!L.err) { L.err = 1; console.error('live canvas', e); } }
      c.restore();
    }
    if (X.frame2) X.frame2(dt);
    if (G.S.scene !== 'play') return;
    if (dirty.st) { dirty.st = 0; updStatus(); }
    if (dirty.hot) { dirty.hot = dirty.pots = 0; buildHot(); }
    if (dirty.pots) { dirty.pots = 0; buildHot(); }
    if (dirty.pp) { dirty.pp = 0; if (pop.kind === 'pot') renderPotSel(pop.t); }
    if (dirty.quest) { dirty.quest = 0; updQuestTrack(); refresh('quest'); }
    if (dirty.bag) { dirty.bag = 0; refresh('bag'); }
    if (dirty.char) { dirty.char = 0; refresh('char'); }
    if (dirty.skill) { dirty.skill = 0; refresh('skill'); }
    if (dirty.map) { dirty.map = 0; refresh('map'); }
    frameHot(); framePots(); frameCp(dt); frameUpg(dt); frameLoot(dt); frameSay();
    // buffs
    const sig = P.buffs.map((b) => b.id + Math.ceil(b.t)).join(',');
    if (sig !== buffSig) { buffSig = sig; updBuffs(); }
    // minimap
    if (frameN % 4 === 0) { const c = $('#mmc').getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); G.World.drawMini(c, 200, 86); }
    // boss bar
    const bs = G.map && G.map.boss;
    if (bs) { const k = U.sat(bs.hp / bs.maxHp) * 100 + '%'; $('#b-bs').style.width = k; $('#b-bs2').style.width = k; }
    // (the combo counter is drawn on the canvas — Fx.drawCombo)
    frameThru();
  };
  // The bottom floor of every map now sits above the hotbar (maps.js G.FLOOR_Y), but from a high platform the floor below can still
  // sink behind it: while a monster is being hit (or bursting) behind the hotbar it turns see-through, and comes back a second after
  // the fight (hovering it with the mouse brings it back at once).
  let thruUntil = 0, thruOn = false, hotR = null;
  function frameThru() {
    const h = $('#hot');
    if (!h) return;
    if (!hotR || frameN % 30 === 0) hotR = { x0: G.W / 2 - h.offsetWidth / 2 - 6, x1: G.W / 2 + h.offsetWidth / 2 + 6, y0: h.offsetTop - 4 };
    const cx = G.cam.x, cy = G.cam.y, now = G.time;
    for (const m of G.mons) {
      if (m.popped || m.hidden || !(m.dead || now - m.hitAt < 0.2)) continue;
      const sx = m.x - cx, sy = m.y + m.popY - cy;
      if (sx + m.w / 2 > hotR.x0 && sx - m.w / 2 < hotR.x1 && sy > hotR.y0) { thruUntil = now + 1.0; break; }
    }
    // a guardian's red floor telegraph under the bar must be seen: see through it while one is live there
    if (G.Haz.warnUnder && G.Haz.warnUnder(cx + hotR.x0, cx + hotR.x1, cy + hotR.y0)) thruUntil = Math.max(thruUntil, now + 0.35);
    const on = now < thruUntil && !G.S.lock;
    if (on !== thruOn) { thruOn = on; h.classList.toggle('thru', on); }
  }

  // ------------------------------------------------------------ hotkeys
  G.on('key', (code) => {
    if (G.S.scene !== 'play') return;
    if (code === 'Escape' && (pop.kind || drag)) { closePops(); X.cancelDrag(); return; }
    if (X.key2 && X.key2(code)) return;
    if (G.S.lock) return;
    if (code === 'Escape') {
      const ids = Object.keys(open);
      if (ids.length) { let top = ids[0]; for (const id of ids) if (+open[id].style.zIndex > +open[top].style.zIndex) top = id; UI.close(top); }
      else UI.menu();
      return;
    }
    const map = { KeyC: 'char', KeyI: 'bag', KeyK: 'skill', KeyJ: 'quest', KeyM: 'map' };
    if (map[code] && !P.dead) UI.toggle(map[code]);
  });
})();
