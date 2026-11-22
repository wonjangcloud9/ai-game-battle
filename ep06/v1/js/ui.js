'use strict';
/* 등불지기 — UI part 1: HUD, tooltips, windows (character / bag / skills / quests / world map), banners, log */
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
  };

  // ------------------------------------------------------------ slots & tooltips
  X.slot = function (item, tip, attrs, cls) {
    if (!item) return '<div class="slot empty' + (cls || '') + '"' + (attrs || '') + '></div>';
    const b = D.ITEMS[item.b], eq = D.isEquip(b);
    return '<div class="slot r' + (eq ? item.rar || 0 : 0) + (cls || '') + '"' + (tip ? ' data-tip="' + tip + '"' : '') + (attrs || '') + '>' + ic(b.icon) +
      (item.n > 1 ? '<span class="n">' + item.n + '</span>' : '') + (item.enh ? '<span class="e">+' + item.enh + '</span>' : '') + '</div>';
  };
  const SN = { atk: '공격력', def: '방어력', hp: '최대 HP', mp: '최대 MP', crit: '치명타 확률', atkp: '공격력', spd: '이동 속도', str: '힘', dex: '민첩', int: '지능', vit: '체력', expp: '경험치 획득', goldp: '골드 획득' };
  const PCT = { crit: 1, atkp: 1, spd: 1, expp: 1, goldp: 1 };
  const sv = (k, v) => (v > 0 ? '+' : '') + v + (PCT[k] ? '%' : '');
  X.itemTip = function (item, o) {
    o = o || {};
    const b = D.ITEMS[item.b], eq = D.isEquip(b), rar = D.RAR[item.rar || 0];
    let s = '<h4 style="color:' + (eq ? rar.color : '#fff') + '">' + esc(D.itemName(item)) + '</h4>';
    if (eq) {
      const slotName = D.SLOTS.find((x) => x.k === b.type).name;
      s += '<div class="ty">' + rar.name + ' ' + slotName + ' · 요구 레벨 <span class="' + (b.lv > P.lv ? 'bad' : '') + '">' + b.lv + '</span>';
      if (b.type === 'weapon') s += ' · <span class="' + (b.line !== P.line ? 'bad' : '') + '">' + (b.line === 'novice' ? '견습 등불지기' : D.LINES[b.line].names[1]) + ' 계열</span>';
      s += '</div>';
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
    const sk = D.SKILLS[id], lv = P.skills[id] || 0, v = sk.v(Math.max(1, lv));
    let s = '<h4 style="color:' + D.LINES[sk.line].color + '">' + sk.name + '</h4><div class="ty">' + (sk.kind === 'passive' ? '패시브' : sk.kind === 'buff' ? '버프' : '액티브') + ' · Lv.' + lv + ' / ' + sk.max + '</div>';
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
      case 'skill': return X.skillTip(a);
      case 'pot': { const q = Inv.quickInfo(a); return '<h4>' + (a === 'hp' ? '생명' : '마나') + ' 물약 단축키 (' + (a === 'hp' ? '1' : '2') + ')</h4><div class="ds">' + (q ? D.ITEMS[q.b].name + ' · ' + q.n + '개 보유' : '물약이 없습니다. 잡화상에서 구입하세요.') + '</div>'; }
      case 'buff': { const b = P.buffs[a]; return b ? '<h4>' + b.name + '</h4><div class="ds">남은 시간 ' + Math.ceil(b.t) + '초</div>' : ''; }
      case 'txt': return '<div class="ds" style="margin:0">' + a + '</div>';
    }
    return X.tipExt ? X.tipExt(k, a) : '';
  }
  let tipEl = null, tipKey = null;
  function tipMove(e) {
    const st = root.getBoundingClientRect(), x = (e.clientX - st.left) / scaleK, y = (e.clientY - st.top) / scaleK;
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
      '<div class="bar hp"><i id="b-hp"></i><em id="t-hp"></em></div><div class="bar mp"><i id="b-mp"></i><em id="t-mp"></em></div><div class="bar xp"><i id="b-xp"></i><em id="t-xp"></em></div></div></div>' +
      '<div id="buffs"></div>' +
      '<div id="mm" class="pnl" data-act="win:map"><div id="mm-n"></div><canvas id="mmc" width="400" height="172"></canvas><div id="mm-f"><span id="gold"></span><span id="mm-lv"></span></div></div>' +
      '<div id="qt"></div><div id="hot"></div><div id="menu"></div><div id="log"></div>' +
      '<div id="boss" class="hidden"><div id="boss-n"></div><div class="bar bs"><i id="b-bs2"></i><i id="b-bs"></i></div></div>' +
      '<div id="banner"></div><div id="combo"></div><div id="xpline"><i></i></div>';
    const mb = [['char', 'ui_char', 'C', '캐릭터'], ['bag', 'ui_bag', 'I', '가방'], ['skill', 'ui_skill', 'K', '스킬'], ['quest', 'ui_quest', 'J', '퀘스트'], ['map', 'ui_map', 'M', '세계 지도'], ['menu', 'ui_menu', 'Esc', '메뉴']];
    $('#menu').innerHTML = mb.map((m) => '<div class="mb" id="mb-' + m[0] + '" data-act="win:' + m[0] + '" data-tip="txt:' + m[3] + ' (' + m[2] + ')">' + ic(m[1]) + '<kbd>' + m[2] + '</kbd></div>').join('');
    X.addLive($('#pfc'), 68, 68, (c, t) => { if (!P.eq || G.S.scene !== 'play') return; c.translate(31, 41); c.scale(1.25, 1.25); A.heroHead(c, P.artLook(), t); });
  }
  function updStatus() {
    const d = P.d;
    $('#st-name').textContent = P.name; $('#st-job').textContent = P.jobName(); $('#st-lv').textContent = P.lv;
    $('#b-hp').style.width = U.sat(P.hp / d.maxHp) * 100 + '%'; $('#t-hp').textContent = Math.max(0, Math.ceil(P.hp)) + ' / ' + d.maxHp;
    $('#b-mp').style.width = U.sat(P.mp / d.maxMp) * 100 + '%'; $('#t-mp').textContent = Math.floor(P.mp) + ' / ' + d.maxMp;
    const need = D.expNeed(P.lv), k = P.lv >= D.MAX_LV ? 1 : U.sat(P.exp / need);
    $('#b-xp').style.width = k * 100 + '%'; $('#t-xp').textContent = P.lv >= D.MAX_LV ? 'MAX' : (k * 100).toFixed(1) + '%';
    $('#xpline i').style.width = k * 100 + '%';
    $('#gold').textContent = fmt(P.gold) + ' G';
    $('#mb-char').classList.toggle('dot', P.ap > 0);
    $('#mb-skill').classList.toggle('dot', P.sp > 0 && Object.values(D.SKILLS).some((s) => s.line === P.line && s.tier <= P.tier && (P.skills[s.id] || 0) < s.max));
    $('#mb-quest').classList.toggle('dot', Object.keys(P.quests).some((id) => P.quests[id].st === 'active' && Q.ready(id)));
  }
  function buildHot() {
    const w = P.eq.weapon;
    let s = '<div class="hs atk" data-tip="txt:기본 공격 (Z) — 누르고 있으면 연속 공격"><span class="k">Z</span>' + ic(w ? D.ITEMS[w.b].icon : 'rod_1') + '</div><div class="hsep"></div>';
    for (let i = 0; i < 6; i++) {
      const id = P.hot[i];
      s += '<div class="hs' + (id ? '' : ' empty') + '" id="hs' + i + '"' + (id ? ' data-tip="skill:' + id + '"' : ' data-tip="txt:빈 슬롯 — 스킬 창(K)에서 단축키를 지정하세요"') + '><span class="k">' + I.SLOT_KEYS[i] + '</span>' + (id ? ic('sk_' + id) : '') + '<div class="cd"></div></div>';
    }
    s += '<div class="hsep"></div>';
    for (const [t, k] of [['hp', '1'], ['mp', '2']]) {
      const q = Inv.quickInfo(t);
      s += '<div class="hs pot' + (q ? '' : ' empty') + '" id="hp-' + t + '" data-tip="pot:' + t + '" data-act="pot:' + t + '"><span class="k">' + k + '</span>' + ic(q ? D.ITEMS[q.b].icon : 'pot_' + t + '_1') + '<span class="n">' + (q ? q.n : 0) + '</span><div class="cd"></div></div>';
    }
    $('#hot').innerHTML = s;
    hotState.length = 0;
  }
  const hotState = [];
  function frameHot() {
    for (let i = 0; i < 6; i++) {
      const id = P.hot[i];
      if (!id) continue;
      const e = document.getElementById('hs' + i);
      if (!e) continue;
      const st = hotState[i] || (hotState[i] = { on: false, txt: '', nomp: false });
      const cd = P.cd[id] || 0, mx = P.cdMax[id] || 1, on = cd > 0.02;
      if (on !== st.on) { st.on = on; e.classList.toggle('oncd', on); if (!on) { e.classList.add('rdy'); setTimeout(() => e.classList.remove('rdy'), 420); } }
      if (on) {
        const c = e.lastElementChild, txt = cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1);
        c.style.background = 'conic-gradient(rgba(10,6,20,0.8) ' + (cd / mx) * 100 + '%, rgba(10,6,20,0.25) 0)';
        if (txt !== st.txt) { st.txt = txt; c.textContent = txt; }
      }
      const sk = D.SKILLS[id], nomp = P.mp < sk.v(P.skills[id] || 1).mp;
      if (nomp !== st.nomp) { st.nomp = nomp; e.classList.toggle('nomp', nomp); }
    }
  }
  const potState = { hp: false, mp: false };
  function framePots() {
    for (const t of ['hp', 'mp']) {
      const e = document.getElementById('hp-' + t);
      if (!e) continue;
      const cd = P.potT[t] || 0, on = cd > 0.02;
      if (on !== potState[t] || on !== e.classList.contains('oncd')) { potState[t] = on; e.classList.toggle('oncd', on); }
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
  UI.banner = function (title, sub, cls) {
    $('#banner').innerHTML = '<div class="bn ' + (cls || '') + '"><h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>';
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
    while (t.children.length > 4) t.removeChild(t.firstChild);
    setTimeout(() => { if (e.parentNode) e.parentNode.removeChild(e); }, 2600);
  };

  // ------------------------------------------------------------ windows
  const open = {};
  let zTop = 10;
  const WIN = {
    char: { title: '캐릭터', key: 'C', w: 486, x: 44, y: 126, render: renderChar },
    bag: { title: '가방', key: 'I', w: 352, x: 890, y: 176, render: renderBag },
    skill: { title: '스킬', key: 'K', w: 500, x: 390, y: 70, render: renderSkill },
    quest: { title: '퀘스트', key: 'J', w: 600, x: 340, y: 130, render: renderQuest },
    map: { title: '세계 지도', key: 'M', w: 916, x: 182, y: 150, render: renderMap },
  };
  UI.isOpen = (id) => !!open[id];
  UI.open = function (id) {
    if (G.S.scene !== 'play' || G.S.lock) return;
    if (id === 'menu') { UI.menu(); return; }
    if (open[id]) { open[id].style.zIndex = ++zTop; return; }
    const w = WIN[id], e = el('div', 'win');
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
  UI.closeAll = function () { for (const id in open) { open[id].remove(); delete open[id]; } tipHide(); };
  function refresh(id) { if (open[id]) { const b = $('.wb', open[id]), sc = $('.sk-l,.q-l', b), st = sc ? sc.scrollTop : 0; WIN[id].render(b); const s2 = $('.sk-l,.q-l', b); if (s2) s2.scrollTop = st; } }
  X.refresh = refresh;

  function renderChar(body) {
    const L = D.LINES[P.line], d = P.d;
    const eqSlot = (s) => { const it = P.eq[s.k]; return it ? X.slot(it, 'eq:' + s.k, ' data-dbl="uneq:' + s.k + '"') : '<div class="slot empty" data-tip="eq:' + s.k + '"><i>' + s.name + '</i></div>'; };
    const row = (n, v, tip) => '<tr' + (tip ? ' data-tip="txt:' + tip + '"' : '') + '><td>' + n + '</td><td>' + v + '</td><td></td></tr>';
    body.innerHTML = '<div class="ch"><div class="ch-l"><div class="ch-pv"><canvas></canvas></div><div class="ch-eq">' + D.SLOTS.map(eqSlot).join('') + '</div></div>' +
      '<div class="ch-r"><div class="ch-t">' + esc(P.name) + '<small>Lv.' + P.lv + ' ' + P.jobName() + '</small></div>' +
      (P.ap > 0 ? '<div class="ap"><span>능력치 포인트 <b class="gd">' + P.ap + '</b></span><span class="sp"></span><button class="btn sm" data-act="autostat">추천 분배</button></div>' : '') +
      '<table class="stt">' + D.STATS.map((s) => '<tr data-tip="txt:' + s.desc + '"><td>' + s.name + (s.k === L.main ? ' <span class="gd">★</span>' : '') + '</td><td>' + P.stats[s.k] + (d.s[s.k] > P.stats[s.k] ? ' <span class="ok">+' + (d.s[s.k] - P.stats[s.k]) + '</span>' : '') + '</td><td>' + (P.ap > 0 ? '<button class="pl" data-act="stat:' + s.k + '">+</button>' : '') + '</td></tr>').join('') +
      '<tr class="sep"><td>공격력</td><td>' + fmt(d.atk) + '</td><td></td></tr>' + row('방어력', fmt(d.def)) + row('최대 HP', fmt(d.maxHp)) + row('최대 MP', fmt(d.maxMp)) +
      row('치명타 확률', d.crit + '%') + row('치명타 피해', d.critDmg + '%') + row('이동 속도', Math.round(d.spd / 2.5) + '%') + row('공격 속도', Math.round(d.aspd * 100) + '%') +
      (d.expp ? row('경험치 획득', '+' + d.expp + '%') : '') + (d.goldp ? row('골드 획득', '+' + d.goldp + '%') : '') +
      '</table><div class="hint">★ 주 능력치 · 처치 ' + fmt(P.kills) + ' · 플레이 ' + Math.floor(P.playtime / 60) + '분</div></div></div>';
    X.addLive($('canvas', body), 192, 186, (c, t) => { c.translate(90, 174); A.shadow(c, 0, 0, 32); c.scale(1.85, 1.85); A.hero(c, P.artLook(), { state: P.cheerT > 0 ? 'cheer' : 'idle', t }); });
  }
  function renderBag(body) {
    body.innerHTML = '<div class="grid">' + P.inv.map((it, i) => X.slot(it, 'inv:' + i, ' data-dbl="use:' + i + '" data-ctx="drop:' + i + '"', it && D.isEquip(D.ITEMS[it.b]) && Inv.cantEquip(it) ? ' no' : '')).join('') + '</div>' +
      '<div class="row" style="margin-top:10px"><span class="gold">' + fmt(P.gold) + ' G</span><span class="sp"></span><span class="dim" style="font-size:12px">' + (36 - Inv.free()) + ' / 36</span><button class="btn sub sm" data-act="sort">정리</button></div>' +
      '<div class="hint">더블클릭: 장착 · 사용 &nbsp;|&nbsp; 우클릭: 버리기</div>';
  }
  X.invHint = '더블클릭: 장착 · 사용';
  function renderSkill(body) {
    const groups = P.line === 'novice' ? [['novice', 0]] : [[P.line, 1], [P.line, 2], [P.line, 3]];
    let s = '<div class="sk-h"><span>스킬 포인트 <b class="gd">' + P.sp + '</b></span><span class="sp"></span><span class="dim" style="font-size:12px">키 버튼으로 단축키 지정</span></div><div class="sk-l">';
    for (const [line, tier] of groups) {
      const lock = tier > P.tier, name = line === 'novice' ? '견습 등불지기' : tier + '차 · ' + D.LINES[line].names[tier];
      s += '<div class="sk-g' + (lock ? ' lock' : '') + '">' + name + (lock ? ' — Lv.' + D.JOB_LV[tier] + ' 전직 필요' : '') + '</div>';
      for (const sk of D.skillsOf(line, tier)) {
        const lv = P.skills[sk.id] || 0, v = sk.v(Math.max(1, lv)), can = !lock && P.sp > 0 && lv < sk.max, slot = P.hot.indexOf(sk.id);
        s += '<div class="sk' + (lock ? ' lock' : '') + '"><div class="si" data-tip="skill:' + sk.id + '">' + ic(sk.icon) + '</div><div class="sm"><div class="sn">' + sk.name +
          '<em class="' + (sk.kind === 'passive' ? 'p' : sk.kind === 'buff' ? 'b' : '') + '">' + (sk.kind === 'passive' ? '패시브' : sk.kind === 'buff' ? '버프' : '액티브') + '</em></div>' +
          '<div class="sd">' + sk.desc(v) + '</div>' + (sk.kind !== 'passive' ? '<div class="sx">MP ' + v.mp + ' · 재사용 ' + v.cd + '초</div>' : '') +
          (UI.assign === sk.id ? '<div class="keys" style="margin-top:5px">' + I.SLOT_KEYS.map((k, i) => '<button class="keyb" data-act="bind:' + i + '">' + k + '</button>').join('') + '<button class="keyb" data-act="bind:-1">해제</button></div>' : '') +
          '</div><div class="sr"><span class="lv">Lv.' + lv + '<span class="dim"> / ' + sk.max + '</span></span>' +
          (can ? '<button class="pl" data-act="skup:' + sk.id + '">+</button>' : '') +
          (sk.kind !== 'passive' && lv > 0 ? '<button class="keyb" data-act="assign:' + sk.id + '">' + (slot >= 0 ? I.SLOT_KEYS[slot] : '키') + '</button>' : '') + '</div></div>';
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
    let s = '<div class="q"><div class="q-l">' + (all.length ? all.map(item).join('') : '<div class="dim">아직 퀘스트가 없습니다.</div>') + '</div><div class="q-d">';
    const id = UI.qsel;
    if (id) {
      const q = D.QUESTS[id], st = Q.st(id), r = q.rew || {};
      s += '<h3>' + q.name + '</h3><p class="dim">의뢰: ' + D.NPCS[q.giver].name + (q.to !== q.giver ? ' → 보고: ' + D.NPCS[q.to].name : '') + '</p><p>' + q.offer.join(' ') + '</p><h4>목표</h4><ul>' +
        q.goals.map((g, i) => { const p = st === 'done' ? [g.n || 1, g.n || 1] : Q.prog(id, i); return '<li class="' + (p[0] >= p[1] ? 'ok' : '') + '">' + Q.goalText(g) + (p[1] > 1 ? ' (' + p[0] + ' / ' + p[1] + ')' : '') + '</li>'; }).join('') + '</ul><h4>보상</h4><div class="rw">' +
        (r.exp ? '<span>EXP ' + fmt(r.exp) + '</span>' : '') + (r.gold ? '<span class="gold">' + fmt(r.gold) + ' G</span>' : '') + (r.items || []).map(([b, n]) => X.slot({ b, n, rar: 1 }, 'base:' + b)).join('') + '</div>';
    }
    body.innerHTML = s + '</div></div>';
  }
  function renderMap(body) {
    const cur = G.map.id, cost = G.Game.travelCost();
    let lines = '', nodes = '';
    for (const [a, b] of G.MAP_LINKS) { const A1 = G.MAPS[a].wm, B1 = G.MAPS[b].wm, seen = P.visited[a] || P.visited[b]; lines += '<line x1="' + A1[0] + '" y1="' + A1[1] + '" x2="' + B1[0] + '" y2="' + B1[1] + '" stroke="' + (seen ? '#8a76b8' : '#3c2f5e') + '" stroke-width="5" stroke-dasharray="1 11" stroke-linecap="round"/>'; }
    for (const id in G.MAPS) {
      const m = G.MAPS[id], vis = !!P.visited[id], lit = !!P.beacons[id], go = id !== cur && (m.town ? vis : lit);
      const known = vis || G.MAP_LINKS.some(([a, b]) => (a === id && P.visited[b]) || (b === id && P.visited[a]));
      nodes += '<div class="wm-n' + (m.town ? ' town' : '') + (lit ? ' lit' : '') + (vis ? '' : ' unk') + (id === cur ? ' cur' : '') + (go ? ' go' : '') + '" style="left:' + m.wm[0] + 'px;top:' + m.wm[1] + 'px"' + (go ? ' data-act="travel:' + id + '" data-tip="txt:클릭하여 이동' + (cost ? ' (' + fmt(cost) + ' G)' : '') + '"' : '') + '><i></i><b>' + (known ? m.name : '???') + '</b><small>' + (m.town ? '마을' : known && m.lv ? 'Lv.' + m.lv[0] + (m.lv[1] !== m.lv[0] ? '~' + m.lv[1] : '') : '') + (D.BEACONS[id] ? (lit ? ' · 등대 ✦' : known ? ' · 등대 ✧' : '') : '') + '</small></div>';
    }
    const litN = Object.keys(D.BEACONS).filter((k) => P.beacons[k]).length;
    body.innerHTML = '<div class="wm"><svg width="892" height="310">' + lines + '</svg>' + nodes + '</div>' +
      '<div class="row"><span>밝힌 등대 <b class="gd">' + litN + ' / 7</b></span><span class="sp"></span><span class="dim" style="font-size:12.5px">방문한 마을과 불을 밝힌 등대는 클릭하면 바로 이동합니다' + (cost ? ' · 비용 ' + fmt(cost) + ' G' : '') + '</span></div>';
  }

  // ------------------------------------------------------------ actions (event delegation)
  const ACT = (X.ACT = {
    win: (a) => { if (a === 'menu') UI.menu(); else UI.toggle(a); },
    close: (a) => UI.close(a),
    stat: (a, e, ev) => { P.addStat(a, ev.shiftKey ? 10 : 1); },
    autostat: () => P.autoStat(),
    sort: () => Inv.sort(),
    use: (a) => { Inv.use(+a); tipHide(); },
    uneq: (a) => { Inv.unequip(a); tipHide(); },
    drop: (a) => {
      const it = P.inv[a];
      if (!it) return;
      UI.confirm('<b>' + esc(D.itemName(it)) + '</b>' + (it.n > 1 ? ' ' + it.n + '개' : '') + '를 버리시겠습니까?<br><span class="dim">버린 아이템은 되찾을 수 없습니다.</span>', () => Inv.discard(+a), { yes: '버린다', no: '취소' });
    },
    pot: (a) => Inv.quick(a),
    skup: (a) => { P.skillUp(a); },
    assign: (a) => { UI.assign = UI.assign === a ? null : a; refresh('skill'); sfx('click'); },
    bind: (a) => {
      const id = UI.assign, i = +a;
      if (!id) return;
      const old = P.hot.indexOf(id);
      if (old >= 0) P.hot[old] = null;
      if (i >= 0) P.hot[i] = id;
      UI.assign = null; sfx('equip'); G.emit('skills');
    },
    qsel: (a) => { UI.qsel = a; refresh('quest'); sfx('click'); },
    travel: (a) => { if (G.Game.fastTravel(a)) UI.close('map'); },
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
    root.innerHTML = '<div id="hud" class="hidden"></div><div id="wins"></div><div id="dlg" class="pnl hidden"></div><div id="toast"></div><div id="title" class="hidden"></div><div id="tip" class="hidden"></div>';
    tipEl = $('#tip');
    buildHud();
    root.addEventListener('click', (ev) => {
      if (onAct('data-act', ev)) ev.stopPropagation();
      // never leave keyboard focus on a button: Space / Enter are game keys
      const ae = document.activeElement;
      if (ae && ae !== document.body && ae.tagName !== 'INPUT') ae.blur();
    });
    root.addEventListener('dblclick', (ev) => { onAct('data-dbl', ev); });
    root.addEventListener('contextmenu', (ev) => { ev.preventDefault(); onAct('data-ctx', ev); });
    document.addEventListener('contextmenu', (ev) => ev.preventDefault());
    root.addEventListener('mouseover', (ev) => {
      const t = ev.target.closest('[data-tip]');
      if (!t) { tipHide(); return; }
      const key = t.getAttribute('data-tip');
      if (key !== tipKey) { const html = tipHTML(key); if (!html) { tipHide(); return; } tipKey = key; tipEl.innerHTML = html; tipEl.classList.remove('hidden'); }
      tipMove(ev);
    });
    root.addEventListener('mousemove', (ev) => { if (tipKey) tipMove(ev); });
    root.addEventListener('mouseleave', tipHide);
    root.addEventListener('mousedown', (ev) => { if (ev.target.closest('button,.mb,.slot,.btn')) { if (G.Audio) G.Audio.init(); } });

    const mark = (...ks) => () => { for (const k of ks) dirty[k] = 1; };
    G.on('hp', mark('st')); G.on('exp', mark('st')); G.on('gold', mark('st', 'bag'));
    G.on('stats', mark('st', 'char')); G.on('equip', mark('hot', 'char', 'bag'));
    G.on('inv', mark('bag', 'pots', 'quest', 'char', 'ext')); G.on('skills', mark('hot', 'skill', 'st'));
    G.on('quest', mark('quest', 'st'));
    G.on('job', () => { dirty.hot = dirty.skill = dirty.char = dirty.st = 1; UI.banner(P.jobName(), P.tier + '차 전직 완료!', 'lv'); UI.log('전직: ' + P.jobName(), 'quest'); });
    G.on('levelup', (lv) => { dirty.st = dirty.char = dirty.skill = dirty.bag = dirty.map = 1; UI.banner('LEVEL UP!', '레벨 ' + lv + ' 달성', 'lv'); UI.log('레벨 ' + lv + ' 달성! 능력치 포인트 +' + D.STAT_PER_LV, 'quest'); });
    G.on('map', (m) => {
      dirty.st = dirty.quest = dirty.map = 1;
      $('#mm-n').textContent = m.name; $('#mm-lv').textContent = m.town ? '안전 지대' : m.def.lv ? 'Lv.' + m.def.lv[0] + (m.def.lv[1] !== m.def.lv[0] ? ' ~ ' + m.def.lv[1] : '') : '';
      $('#boss').classList.add('hidden');
      UI.banner(m.name, m.town ? '마을 · 안전 지대' : m.def.lv ? '권장 레벨 ' + m.def.lv[0] + (m.def.lv[1] !== m.def.lv[0] ? ' ~ ' + m.def.lv[1] : '') : '');
    });
    G.on('msg', (t, k) => UI.log(t, k || 'sys'));
    G.on('loot', (item) => {
      const b = D.ITEMS[item.b], eq = D.isEquip(b), col = eq ? D.RAR[item.rar || 0].color : '#fff';
      UI.log('획득: <span style="color:' + col + '">' + esc(D.itemName(item)) + '</span>' + (item.n > 1 ? ' ×' + item.n : ''));
      if (eq && (item.rar || 0) >= 1) UI.toast(X.slot(item) + '<span style="color:' + col + '">' + esc(b.name) + '</span><span class="dim">' + D.RAR[item.rar].name + '</span>');
    });
    G.on('questDone', (q) => { UI.toast('<span class="gd">✔ 퀘스트 완료</span><span>' + q.name + '</span>'); UI.log('퀘스트 완료: ' + q.name, 'quest'); });
    G.on('boss', (m) => { $('#boss').classList.remove('hidden'); $('#boss-n').textContent = 'Lv.' + m.lv + ' ' + m.name; UI.banner(m.name, '어스름의 수호자', 'boss'); });
    G.on('bossEnd', (win) => { $('#boss').classList.add('hidden'); if (win) UI.log('수호자를 물리쳤습니다!', 'quest'); });
    G.on('beacon', (id) => { dirty.map = 1; UI.banner('등대 점화!', D.BEACONS[id].name + '에 다시 불이 켜졌습니다', 'lit'); UI.log(D.BEACONS[id].name + '에 불을 밝혔습니다.', 'quest'); });
    G.on('saved', () => {});
    if (X.init2) X.init2(root);
  };
  UI.showHud = function (on) {
    $('#hud').classList.toggle('hidden', !on);
    if (on) { buildHot(); updStatus(); updQuestTrack(); updBuffs(); }
  };
  let frameN = 0, comboShown = 0, buffSig = '';
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
    if (dirty.quest) { dirty.quest = 0; updQuestTrack(); refresh('quest'); }
    if (dirty.bag) { dirty.bag = 0; refresh('bag'); }
    if (dirty.char) { dirty.char = 0; refresh('char'); }
    if (dirty.skill) { dirty.skill = 0; refresh('skill'); }
    if (dirty.map) { dirty.map = 0; refresh('map'); }
    frameHot(); framePots();
    // buffs
    const sig = P.buffs.map((b) => b.id + Math.ceil(b.t)).join(',');
    if (sig !== buffSig) { buffSig = sig; updBuffs(); }
    // minimap
    if (frameN % 4 === 0) { const c = $('#mmc').getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); G.World.drawMini(c, 200, 86); }
    // boss bar
    const bs = G.map && G.map.boss;
    if (bs) { const k = U.sat(bs.hp / bs.maxHp) * 100 + '%'; $('#b-bs').style.width = k; $('#b-bs2').style.width = k; }
    // combo
    const cb = G.S.combo >= 3 ? G.S.combo : 0;
    if (cb !== comboShown) {
      const e = $('#combo');
      if (cb) { e.innerHTML = '<b>' + cb + '</b><span>COMBO</span>'; if (cb > comboShown) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); } } else e.innerHTML = '';
      comboShown = cb;
    }
  };

  // ------------------------------------------------------------ hotkeys
  G.on('key', (code) => {
    if (G.S.scene !== 'play') return;
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
