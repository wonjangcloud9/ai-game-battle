'use strict';
/* 등불지기 — UI part 2: NPC dialog, shop, enhancement, job advancement, modals (confirm / menu / settings / death / ending), title & character creation */
(function () {
  const G = window.G, U = G.U, A = G.Art, D = G.D, P = G.P, I = G.Input, Inv = G.Inv, Q = G.Quest, UI = G.UI, X = UI._;
  const { $, el, esc, sfx, fmt, ic, dirty, ACT } = X;
  let root;

  // ------------------------------------------------------------ modal helpers
  // touch: no keyboard, so no "(Esc)" on the buttons
  const noEsc = (s) => (G.touch ? String(s).replace(/ \(Esc\)/g, '') : s);
  function modal(html, cls) {
    const m = el('div', 'modal', '<div class="mbox pnl ' + (cls || '') + '">' + noEsc(html) + '</div>');
    root.appendChild(m);
    X.syncLock(); I.pressed = {}; X.tipHide();
    return m;
  }
  function closeModal(m) {
    if (!m || !m.parentNode) return;
    if (shop && shop.m === m) shop = null;
    if (enh && enh.m === m) enh = null;
    if (kcap && kcap.m === m) { kcap = null; I.capture = null; }
    m.remove(); X.syncLock(); I.pressed = {}; X.tipHide();
  }
  const topModal = () => { const ms = root.querySelectorAll('.modal'); return ms.length ? ms[ms.length - 1] : null; };
  function closeAllModals() { root.querySelectorAll('.modal').forEach((m) => m.remove()); shop = enh = null; kcap = null; I.capture = null; X.syncLock(); }
  UI.confirm = function (html, onYes, o) {
    o = o || {};
    const m = modal('<p>' + html + '</p><div class="acts"><button class="btn" data-primary>' + (o.yes || '확인') + '</button><button class="btn sub" data-esc>' + (o.no || '취소') + '</button></div>');
    $('[data-primary]', m).onclick = (ev) => { ev.stopPropagation(); closeModal(m); sfx('click'); onYes(); };
    $('[data-esc]', m).onclick = (ev) => { ev.stopPropagation(); closeModal(m); sfx('close'); if (o.onNo) o.onNo(); };
    sfx('open');
  };
  ACT.mclose = (a, e) => { closeModal(e.closest('.modal')); sfx('close'); };

  // ------------------------------------------------------------ NPC dialog
  // The whole exchange is laid out when it opens: every line sits (invisible) in the text cell, the rewards row is shown, and the
  // option buttons are placed but hidden until the last line has finished typing — so the box never grows or jumps mid-talk.
  let dlg = null;
  const PORT = 92; // portrait size (logical px; the head is framed as it was in the old 132px portrait)
  function showDlg(npc, lines, opts, foot) {
    const d = $('#dlg');
    dlg = { npc, lines, li: 0, n: 0, k: -1, full: false, opts, foot };
    d.innerHTML = '<div class="pt"><canvas></canvas></div><div class="tx"><div class="nm"><b>' + esc(npc.def.name) + '</b><small>' + esc(npc.def.title) + '</small></div>' +
      '<div class="say" data-act="dnext">' + lines.map((l) => '<span class="sz">' + esc(l) + '</span>').join('') + '<span><span class="ty"></span><span class="gh"></span></span></div>' +
      (foot ? '<div class="rw ft">' + foot + '</div>' : '') +
      '<div class="opt wait">' + opts.map((o, i) => '<button class="btn ' + (o.cls || '') + '" data-act="dopt:' + i + '">' + o.t + '</button>').join('') + '</div></div><div class="nx hidden">▼ ' + (G.touch ? '터치' : 'Space') + '</div>';
    const k = PORT / 132;
    X.addLive($('canvas', d), PORT, PORT, (c, t) => { c.translate(60 * k, 86 * k); c.scale(2.5 * k, 2.5 * k); A.heroHead(c, npc.def.look, t); });
    d.classList.remove('hidden');
    X.syncLock(); X.tipHide();
  }
  // the options can be picked only once the last line is fully shown
  const dlgReady = () => !!dlg && dlg.full && dlg.li >= dlg.lines.length - 1;
  function closeDlg(silent) {
    if (!dlg && $('#dlg').classList.contains('hidden')) return;
    dlg = null; $('#dlg').classList.add('hidden'); $('#dlg').innerHTML = '';
    X.syncLock(); I.pressed = {};
    if (!silent) sfx('close');
  }
  function lineDone() {
    const d = $('#dlg'), last = dlg.li >= dlg.lines.length - 1;
    $('.nx', d).classList.toggle('hidden', last);
    if (last) $('.opt', d).classList.remove('wait');
  }
  function dnext() {
    if (!dlg) return;
    if (!dlg.full) { dlg.n = dlg.lines[dlg.li].length; return; }
    if (dlg.li < dlg.lines.length - 1) { dlg.li++; dlg.n = 0; dlg.k = -1; dlg.full = false; $('.nx', $('#dlg')).classList.add('hidden'); sfx('click'); }
  }
  ACT.dnext = dnext;
  ACT.dopt = (a) => { if (dlgReady() && dlg.opts[a]) { sfx('click'); dlg.opts[a].fn(); } };
  const rewHTML = (r) => (r.exp ? '<span>EXP ' + fmt(r.exp) + '</span>' : '') + (r.gold ? '<span class="gold">' + fmt(r.gold) + ' G</span>' : '') + (r.items || []).map(([b, n]) => X.slot({ b, n, rar: 1 }, 'base:' + b)).join('');
  function dlgMenu(npc, text) {
    const def = npc.def, f = Q.forNpc(npc.id), opts = [];
    // quest buttons use class "dq" (green) — never a bare "q", which is the quest window's 380px-tall layout class
    for (const id of f.ready) opts.push({ t: '✔ ' + D.QUESTS[id].name + ' (완료)', cls: 'dq', fn: () => {
      const q = D.QUESTS[id];
      showDlg(npc, q.done, [{ t: '보상 받기', cls: 'dq', fn: () => { Q.complete(id); const f2 = Q.forNpc(npc.id); if (f2.ready.length || f2.avail.length) dlgMenu(npc); else closeDlg(); } }], '<span class="dim">보상</span>' + rewHTML(q.rew || {}));
    } });
    for (const id of f.avail) opts.push({ t: '! ' + D.QUESTS[id].name, cls: 'dq', fn: () => {
      const q = D.QUESTS[id];
      showDlg(npc, q.offer, [{ t: '수락한다', cls: 'dq', fn: () => { Q.accept(id); closeDlg(true); } }, { t: '다음에', cls: 'sub', fn: () => dlgMenu(npc) }], '<span class="dim">보상</span>' + rewHTML(q.rew || {}));
    } });
    for (const id of f.active) opts.push({ t: '… ' + D.QUESTS[id].name, cls: 'sub', fn: () => showDlg(npc, D.QUESTS[id].giver === npc.id ? D.QUESTS[id].prog : ['아직 준비가 덜 된 것 같군요.'], [{ t: '알겠습니다', cls: 'sub', fn: () => dlgMenu(npc) }]) });
    if (def.travel) opts.push({ t: '✦ 등대로 이동', fn: () => {
      const tl = G.Game.travelList();
      if (tl.filter((o) => !o.cur).length) { closeDlg(true); UI.travel({ title: def.name + '의 등불 이동', free: true, sub: tl.some((o) => o.tried) ? '불을 밝힌 등대와 들렀던 마을, 도전 중인 등대 앞까지 무료로 보내 드립니다.' : '불을 밝힌 등대와 들렀던 마을로 무료로 보내 드립니다.' }); }
      else showDlg(npc, ['아직 불을 밝힌 등대가 없구나. 등대에 불을 붙이면, 그 빛을 따라 언제든 보내 줄 수 있단다.'], [{ t: '알겠습니다', cls: 'sub', fn: () => dlgMenu(npc) }]);
    } });
    if (def.shop) opts.push({ t: def.enhance ? '장비 상점' : '상점', fn: () => { closeDlg(true); UI.shop(npc); } });
    if (def.enhance) opts.push({ t: '장비 강화', fn: () => { closeDlg(true); UI.enhance(npc); } });
    if (def.job && P.tier < 3) {
      const nx = G.Game.canAdvance();
      opts.push({ t: '전직하기', cls: nx ? '' : 'sub', fn: () => {
        if (nx) { closeDlg(true); UI.jobSelect(nx); }
        else showDlg(npc, [(P.tier + 1) + '차 전직은 레벨 ' + D.JOB_LV[P.tier + 1] + '부터 가능해. 지금은 레벨 ' + P.lv + '이니 조금 더 수련하고 와.'], [{ t: '알겠습니다', cls: 'sub', fn: () => dlgMenu(npc) }]);
      } });
    }
    if (def.job && P.tier >= 1) {
      const cost = G.Game.statResetCost();
      opts.push({ t: '능력치 초기화' + (cost ? ' (' + fmt(cost) + ' G)' : ' (무료)'), cls: 'sub', fn: () => {
        const lack = cost - P.gold; // the fee next to what you own, so a short purse shows before you click
        const foot = cost ? '<span class="dim">수업료</span><span class="gold">' + fmt(cost) + ' G</span><span class="dim">· 보유</span><span class="' + (lack > 0 ? 'bad' : 'gold') + '">' + fmt(P.gold) + ' G</span>' + (lack > 0 ? '<span class="bad">(' + fmt(lack) + ' G 부족)</span>' : '') : '';
        showDlg(npc, [cost ? '찍어 둔 능력치를 전부 되돌려 줄 수 있어. 수업료는 ' + fmt(cost) + ' 골드야. 할래?' : '이번 한 번은 공짜로 능력치를 전부 되돌려 줄게. 새 직업에 맞게 다시 찍어 봐.'],
          [{ t: '초기화한다', cls: lack > 0 ? 'sub' : '', fn: () => {
            if (P.gold < cost) { showDlg(npc, ['수업료가 모자라. ' + fmt(cost) + ' 골드가 필요한데 지금은 ' + fmt(P.gold) + ' 골드뿐이야. ' + fmt(cost - P.gold) + ' 골드 더 모아서 와.'], [{ t: '알겠습니다', cls: 'sub', fn: () => dlgMenu(npc) }]); return; }
            closeDlg(true); if (G.Game.statReset()) UI.statReset(0);
          } }, { t: '그만둔다', cls: 'sub', fn: () => dlgMenu(npc) }], foot);
      } });
    }
    opts.push({ t: '이야기 듣기', cls: 'sub', fn: () => dlgMenu(npc, U.pick(def.talk)) });
    opts.push({ t: '떠나기', cls: 'sub', fn: () => closeDlg() });
    showDlg(npc, [text || def.talk[0]], opts);
  }
  UI.talk = function (npc) {
    if (G.S.lock) return;
    Q.onTalk(npc.id);
    dlgMenu(npc);
    sfx('open');
  };

  // ------------------------------------------------------------ 보유 row: what you own (gold · 빛가루) + what the last purchase / sale did
  // shared by the shop and the blacksmith. While one of them is open, the HUD gold and log sit under the dark backdrop.
  const DUST = 'dust';
  const sells = (npc, id) => !!(npc.def.shop && D.SHOPS[npc.def.shop].includes(id));
  function walletHTML(dust, note) {
    let s = '<div class="wallet"><span class="wl">보유</span><span class="wv" data-tip="txt:가지고 있는 골드">' + ic('gold') + '<b>' + fmt(P.gold) + '</b> G</span>';
    if (dust) s += '<span class="wv" data-tip="base:' + DUST + '">' + ic(D.ITEMS[DUST].icon) + '빛가루 <b>' + fmt(Inv.count(DUST)) + '</b>개</span>';
    if (note) { s += '<span class="wn ' + note.cls + (note.fresh ? ' pop' : '') + '">' + note.html + '</span>'; note.fresh = false; }
    return s + '</div>';
  }
  const setNote = (o, cls, html) => { o.note = { cls, html, fresh: true }; dirty.ext = 1; };

  // ------------------------------------------------------------ shop
  let shop = null;
  UI.shop = function (npc) { shop = { npc, m: modal('', ''), note: null }; renderShop(); sfx('open'); };
  function renderShop() {
    const def = shop.npc.def, box = $('.mbox', shop.m), old = $('.shop-l', box), sc = old ? old.scrollTop : 0;
    let rows = '';
    for (const id of D.SHOPS[def.shop]) {
      const b = D.ITEMS[id], eq = D.isEquip(b), no = P.gold < b.price;
      if (b.type === 'weapon' && P.line !== 'novice' && b.line !== P.line) continue;
      let cp = '';
      if (eq) {
        const inst = { b: id, rar: 0, enh: 0, opts: [] }, why = Inv.cantEquip(inst), g = why ? 0 : P.cpWithItem(inst) - P.cp;
        cp = why ? '<em class="cpt no">' + (b.lv > P.lv ? 'Lv.' + b.lv : '착용 불가') + '</em>' : '<em class="cpt ' + (g > 0 ? 'up' : g < 0 ? 'dn' : '') + '">' + (g ? X.cpTxt(g) : '±0') + '</em>';
      }
      const sub = eq ? (b.atk ? '공격력 +' + b.atk : b.def ? '방어력 +' + b.def : 'HP +' + b.hp) + ' · 요구 Lv.' + b.lv + (b.type === 'weapon' && b.line !== P.line ? ' · ' + D.LINES[b.line].names[1] : '') : '<b class="own">보유 ' + fmt(Inv.count(id)) + '</b> · ' + (b.desc || '');
      const tip = '1개 <b>' + fmt(b.price) + ' G</b>' + (eq ? '' : ' · 10개 <b>' + fmt(b.price * 10) + ' G</b>') + '<br>보유 ' + fmt(P.gold) + ' G' + (no ? ' · <b class=bad>' + fmt(b.price - P.gold) + ' G 부족</b>' : '');
      rows += '<div class="si-r' + (no ? ' no' : '') + '">' + X.slot(eq ? { b: id, rar: 0 } : { b: id, n: 1 }, 'shop:' + id) + '<div class="nm">' + b.name + cp + '<small>' + sub + '</small></div>' +
        '<span class="' + (no ? 'bad' : 'gold') + '" data-tip="txt:' + tip + '">' + fmt(b.price) + ' G</span>' +
        '<button class="btn sm' + (no ? ' off' : '') + '" data-act="buy:' + id + '">구매</button>' + (!eq ? '<button class="btn sub sm' + (P.gold < b.price * 10 ? ' off' : '') + '" data-act="buy10:' + id + '">×10</button>' : '') + '</div>';
    }
    box.innerHTML = noEsc('<h2>' + def.name + '의 ' + (def.enhance ? '대장간' : '잡화점') + '</h2>' + walletHTML(!!def.enhance, shop.note) + '<div class="shop"><div class="shop-l">' + rows + '</div><div><div class="grid">' +
      P.inv.map((it, i) => X.slot(it, 'sinv:' + i, ' data-act="sell:' + i + '"')).join('') + '</div><div class="row" style="margin-top:10px"><span class="dim" style="font-size:12px">가방 <b>' + (36 - Inv.free()) + ' / 36</b></span><span class="sp"></span>' +
      '<span class="dim" style="font-size:12px">' + (G.touch ? '가방의 아이템을 누르면 판매' : '가방의 아이템 클릭: 판매 (Shift: 묶음 전체)') + '</span></div></div></div><div class="acts"><button class="btn sub" data-act="mclose">닫기 (Esc)</button></div>');
    $('.shop-l', box).scrollTop = sc;
  }
  function bought(id, n) {
    const b = D.ITEMS[id];
    UI.log('구매: ' + b.name + (n > 1 ? ' ×' + n : ''));
    if (!shop) return;
    let html = '✔ ' + b.name + (n > 1 ? ' ×' + n : '') + ' 구매 <b>−' + fmt(b.price * n) + ' G</b>';
    if (D.isEquip(b)) { const g = P.cpGain({ b: id, rar: 0, enh: 0, opts: [] }); if (g > 0) html += ' · 가방에서 장착하면 전투력 ' + X.cpTxt(g); }
    setNote(shop, 'ok', html);
  }
  ACT.buy = (a) => { if (Inv.buy(a, 1)) bought(a, 1); };
  ACT.buy10 = (a) => { if (Inv.buy(a, 10)) bought(a, 10); };
  ACT.sell = (a, e, ev) => {
    const it = P.inv[a];
    if (!it) return;
    const b = D.ITEMS[it.b], all = ev.shiftKey;
    const go = () => {
      const nm = esc(D.itemName(it)) + (it.n && all && it.n > 1 ? ' ×' + it.n : ''), g = Inv.sell(+a, all);
      UI.log('판매: ' + nm + ' (+' + fmt(g) + ' G)');
      if (shop) setNote(shop, 'ok', '✔ ' + nm + ' 판매 <b>+' + fmt(g) + ' G</b>');
      X.tipHide();
    };
    if (D.isEquip(b) && ((it.rar || 0) >= 2 || (it.enh || 0) >= 3)) UI.confirm('<b style="color:' + D.RAR[it.rar || 0].color + '">' + esc(D.itemName(it)) + '</b>' + U.josa(b.name, '을/를').slice(b.name.length) + ' ' + fmt(D.sellPrice(it)) + ' G에 판매하시겠습니까?', go, { yes: '판매' });
    else go();
  };
  ACT.sellall = (a, e) => ACT.sell(a, e, { shiftKey: true }); // (touch: the item card's "모두 판매" — the mouse's Shift+click)
  X.tipExt = (k, a) => {
    if (k === 'sinv') return P.inv[a] ? X.itemTip(P.inv[a], { cmp: true, hint: '클릭: 판매' }) : '';
    if (k === 'enhi') { // blacksmith list: 'eq:<slot>' | 'inv:<index>'
      const i = a.indexOf(':'), worn = a.slice(0, i) === 'eq', it = worn ? P.eq[a.slice(i + 1)] : P.inv[a.slice(i + 1)];
      return it ? X.itemTip(it, { hint: (worn ? '착용 중 · ' : '') + '클릭: 강화할 장비로 고르기' }) : '';
    }
    return '';
  };

  // ------------------------------------------------------------ enhancement
  // shows: stats now → after, how much 전투력 a success adds, the cost next to what you own (with what is missing),
  // a button to buy the missing 빛가루 right here, and what the last attempt did (and spent).
  // 강화하기 plays the smith's show over the right panel (forge.js · enh.fx); the roll happens at its third strike. While it runs,
  // every click / key in this window skips ahead instead, and the panel isn't rebuilt (only the 보유 row follows the payment).
  let enh = null;
  UI.enhance = function (npc) {
    enh = { npc, m: modal('', 'enhbox'), sel: null, last: null, note: null, fx: null, hl: null };
    enh.m.addEventListener('click', (ev) => { if (enh && enh.fx && enh.m === ev.currentTarget) { ev.stopPropagation(); ev.preventDefault(); enh.fx.skip(); } }, true);
    renderEnh(); sfx('open');
  };
  function enhItems() {
    const out = [];
    for (const s of D.SLOTS) if (P.eq[s.k]) out.push(['eq:' + s.k, P.eq[s.k]]);
    P.inv.forEach((it, i) => { if (it && D.isEquip(D.ITEMS[it.b])) out.push(['inv:' + i, it]); });
    return out;
  }
  const ESN = { atk: '공격력', def: '방어력', hp: '최대 HP' };
  const baseStats = (it, e) => D.itemStats({ b: it.b, rar: it.rar, enh: e, opts: [] });
  // 전투력 with this item at enhancement level e: the real 전투력 if it is worn, "if worn" otherwise (null: it can't be worn)
  function enhCp(it, e) {
    if (P.eq[D.ITEMS[it.b].type] !== it && Inv.cantEquip(it)) return null;
    return P.cpWithEnh(it, e);
  }
  function enhLast(it) {
    const L = enh.last;
    return L && L.it === it ? '<div class="elast ' + L.cls + '"><b>' + (L.cls === 'ok' ? '✔ ' : '✘ ') + L.big + '</b> ' + L.sub + '<small>' + L.spent + '</small></div>' : '';
  }
  function enhPanel(it, shopDust, hl) {
    const b = D.ITEMS[it.b], e = it.enh || 0, max = e >= D.ENH_MAX, worn = P.eq[b.type] === it, rar = D.RAR[it.rar || 0];
    const now = baseStats(it, e), keys = Object.keys(ESN).filter((k) => now[k]);
    let s = '<div class="eh"><div class="big' + X.egCls(it) + (hl || '') + '">' + ic(b.icon) + '</div><div><h3 style="color:' + rar.color + '">' + esc(b.name) + ' <span class="gd">+' + e + (max ? '' : ' → +' + (e + 1)) + '</span></h3>' +
      '<small>' + (worn ? '<b class="ok">착용 중</b>' : '가방에 있는 장비') + ' · ' + rar.name + ' ' + D.SLOTS.find((x) => x.k === b.type).name + ' · 강화 ' + e + ' / ' + D.ENH_MAX + '</small></div></div>';
    if (max) return s + '<table class="est">' + keys.map((k) => '<tr><td>' + ESN[k] + '</td><td>' + fmt(now[k]) + '</td></tr>').join('') + '</table><p class="emax">최대 강화 단계입니다!</p>' + enhLast(it);
    const nx = baseStats(it, e + 1), c = D.enhCost(it), dust = Inv.count(DUST), rate = D.ENH_RATE[e];
    s += '<table class="est">' + keys.map((k) => '<tr><td>' + ESN[k] + '</td><td>' + fmt(now[k]) + '</td><td class="ar">→</td><td class="ok">' + fmt(nx[k]) + '</td><td class="dv">▲ ' + fmt(nx[k] - now[k]) + '</td></tr>').join('') + '</table>';
    const c0 = enhCp(it, e);
    if (c0 === null) s += '<div class="ecp no"><span>전투력</span><b>착용할 수 없는 장비라 반영되지 않아요</b></div><div class="ecn bad">' + esc(Inv.cantEquip(it)) + '</div>';
    else {
      const c1 = enhCp(it, e + 1), g = c1 - c0;
      s += '<div class="ecp' + (g > 0 ? ' up' : '') + '"><span>' + (worn ? '성공하면 전투력' : '착용하면 전투력') + '</span><b>' + fmt(c0) + ' → ' + fmt(c1) + '</b><em>' + (g ? X.cpTxt(g) : '±0') + '</em></div>' +
        (worn ? '' : '<div class="ecn dim">지금은 가방에 있어요 · 착용해야 전투력에 반영돼요</div>');
    }
    s += '<div class="erate">성공 확률 <b class="' + (rate >= 70 ? 'ok' : rate >= 40 ? 'gd' : 'bad') + '">' + rate + '%</b><small class="' + (e >= 7 ? 'bad' : 'dim') + '">' + (e >= 7 ? '실패하면 50% 확률로 강화 단계가 1 내려가요' : '실패해도 장비는 그대로예요') + '</small></div>';
    const lackG = Math.max(0, c.gold - P.gold), lackD = Math.max(0, c.dust - dust);
    const row = (icon, name, need, own, lack) => '<tr' + (lack ? ' class="no"' : '') + '><td>' + ic(icon) + name + '</td><td>' + need + '</td><td>' + own + '</td><td>' + (lack ? '<b class="bad">' + lack + ' 부족</b>' : '<b class="ok">✔</b>') + '</td></tr>';
    s += '<table class="ecost"><tr class="hd"><td>강화 비용</td><td>필요</td><td>보유</td><td></td></tr>' +
      row('gold', '골드', fmt(c.gold) + ' G', fmt(P.gold) + ' G', lackG ? fmt(lackG) + ' G' : '') +
      row(D.ITEMS[DUST].icon, '빛가루', c.dust + '개', fmt(dust) + '개', lackD ? lackD + '개' : '') + '</table>';
    const ok = !lackG && !lackD;
    let after = '';
    s += '<div class="ego"><button class="btn' + (ok ? '' : ' off') + '" data-act="enhgo" data-primary>' + (ok ? '강화하기' : lackD ? '빛가루가 ' + lackD + '개 부족해요' : '골드가 ' + fmt(lackG) + ' G 부족해요') + '</button>';
    if (lackD && shopDust) {
      const price = D.ITEMS[DUST].price * lackD, can = P.gold >= price, left = P.gold - price;
      s += '<button class="btn sub' + (can ? '' : ' off') + '" data-act="enhdust:' + lackD + '">빛가루 ' + lackD + '개 사기<small' + (can ? '' : ' class="bad"') + '>' + fmt(price) + ' G</small></button>';
      if (!can) after = '빛가루를 살 골드가 ' + fmt(price - P.gold) + ' G 부족해요. 몬스터를 잡으면 골드와 빛가루가 떨어져요.';
      else if (left < c.gold) after = '빛가루를 사면 ' + fmt(left) + ' G가 남아서 강화 비용에 ' + fmt(c.gold - left) + ' G 모자라요.';
    }
    return s + '</div>' + (after ? '<div class="ecn bad">' + after + '</div>' : '') + enhLast(it);
  }
  function renderEnh() {
    const box = $('.mbox', enh.m), list = enhItems(), shopDust = sells(enh.npc, DUST);
    if (!list.some(([, it]) => it === enh.sel)) enh.sel = list.length ? list[0][1] : null;
    // right after a show: the piece's icons flare up once (success) or grey out for a moment (failure)
    const it = enh.sel, H = enh.hl && enh.hl.it === it && performance.now() < enh.hl.until ? enh.hl : null, hl = H ? (H.r === 'ok' ? ' eok' : ' efail') : '';
    box.innerHTML = '<h2>' + enh.npc.def.name + '의 장비 강화</h2>' + walletHTML(true, enh.note) +
      '<div class="enh"><div class="enh-l"><div class="grid">' + list.map(([k, o]) => X.slot(o, 'enhi:' + k, ' data-act="enhsel:' + k + '"', o === it ? ' sel' + hl : '', k.startsWith('eq:') ? '<span class="eqm">착용</span>' : '')).join('') + '</div></div>' +
      '<div class="enh-r">' + (it ? enhPanel(it, shopDust, hl) : '<p class="dim" style="margin-top:150px;text-align:center">강화할 장비가 없습니다.</p>') + '</div></div>' +
      '<div class="hint" style="text-align:center">빛가루 얻는 곳: 몬스터 사냥 (가끔) · 수호자 · 퀘스트 보상' + (shopDust ? ' · 이 대장간 (' + fmt(D.ITEMS[DUST].price) + ' G)' : '') + '</div><div class="acts"><button class="btn sub" data-act="mclose">' + (G.touch ? '닫기' : '닫기 (Esc)') + '</button></div>';
  }
  // only the 보유 row (gold · 빛가루 move at the roll, while the show still covers the panel)
  function enhWallet() { const w = $('.wallet', enh.m); if (w) w.outerHTML = walletHTML(true, enh.note); }
  ACT.enhsel = (a) => { const i = a.indexOf(':'), k = a.slice(0, i), v = a.slice(i + 1); enh.sel = k === 'eq' ? P.eq[v] : P.inv[v]; enh.hl = null; renderEnh(); sfx('click'); };
  ACT.enhdust = (a) => {
    const n = Math.max(1, +a || 1);
    if (!Inv.buy(DUST, n)) return; // why not (골드 · 가방) arrives as a warning note
    UI.log('구매: ' + D.ITEMS[DUST].name + ' ×' + n);
    setNote(enh, 'ok', '✔ 빛가루 ' + n + '개 구매 <b>−' + fmt(D.ITEMS[DUST].price * n) + ' G</b>');
  };
  ACT.enhgo = () => {
    if (!enh || enh.fx) return;
    const it = enh.sel;
    if (!it || (it.enh || 0) >= D.ENH_MAX) return;
    const c = D.enhCost(it);
    if (P.gold < c.gold || Inv.count(DUST) < c.dust) { Inv.enhance(it); return; } // (says why: warning note + sound)
    const host = $('.enh-r', enh.m);
    const done = (res) => {
      if (!enh) return;
      enh.fx = null;
      if (res) enh.hl = { it, r: res.r, until: performance.now() + 1000 };
      renderEnh();
    };
    X.tipHide();
    if (!G.Forge || !host) { done(enhRoll(it)); return; }
    // what is at stake, shown above the smith while he works
    const b = D.ITEMS[it.b], e0 = it.enh || 0, rate = D.ENH_RATE[e0];
    const head = '<span style="color:' + D.RAR[it.rar || 0].color + '">' + esc(b.name) + '</span> <span class="gd">+' + e0 + ' → +' + (e0 + 1) + '</span>' +
      '<small>성공 확률 <b class="' + (rate >= 70 ? 'ok' : rate >= 40 ? 'gd' : 'bad') + '">' + rate + '%</b>' + (e0 >= 7 ? ' · <span class="bad">실패하면 50% 확률로 단계 하락</span>' : '') + '</small>';
    enh.fx = G.Forge.start(host, { look: enh.npc.def.look, icon: b.icon, head, roll: () => enhRoll(it), done });
  };
  // the roll itself (at the show's third strike): pay, roll, and note what happened for the panel (enh.last) and the show
  function enhRoll(it) {
    const e0 = it.enh || 0, c = D.enhCost(it), s0 = baseStats(it, e0), cp0 = enhCp(it, e0);
    const r = Inv.enhance(it);
    if (!r) return null;
    const e1 = it.enh || 0, s1 = baseStats(it, e1), cp1 = enhCp(it, e1), g = cp0 === null || cp1 === null ? 0 : cp1 - cp0;
    const stat = Object.keys(ESN).filter((k) => s0[k] && s1[k] !== s0[k]).map((k) => ESN[k] + ' ' + fmt(s0[k]) + ' → ' + fmt(s1[k])).join(', ');
    const sub = r === 'fail' ? '장비는 그대로예요' : [stat, g ? '전투력 ' + X.cpTxt(g) : ''].filter(Boolean).join(' · ');
    enh.last = {
      it, cls: r === 'ok' ? 'ok' : 'bad',
      big: r === 'ok' ? '+' + e1 + ' 강화 성공!' : r === 'down' ? '실패… +' + e0 + ' → +' + e1 : '강화 실패…',
      sub, spent: '사용: ' + fmt(c.gold) + ' G · 빛가루 ' + c.dust + '개',
    };
    enh.note = null;
    if (r === 'ok') UI.log('강화 성공: ' + esc(D.itemName(it)) + (g ? ' (전투력 ' + X.cpTxt(g) + ')' : ''), 'quest');
    return { r, e0, e1, sub };
  }

  // ------------------------------------------------------------ job advancement
  function jobPreview(cv, ln, tier, w, h) {
    const L = D.LINES[ln], look = Object.assign({}, P.look, { job: ln, tier: tier - 1, weapon: { kind: L.weapon, tier: [0, 2, 4, 7][tier], enh: tier === 3 ? 7 : 0 } });
    const seq = L.weapon === 'sword' ? [['atk1', 0.34], ['atk2', 0.34], ['atk3', 0.44]] : L.weapon === 'staff' ? [['cast', 0.5], ['cast', 0.5]] : [['shoot', 0.36], ['shoot', 0.36], ['shoot', 0.36]];
    const total = 1.5 + seq.reduce((s, x) => s + x[1], 0) + 0.3;
    X.addLive(cv, w, h, (c, t) => {
      let T = t % total, state = 'idle', p = 0;
      if (T > 1.5) { T -= 1.5; for (const [st, d] of seq) { if (T < d) { state = st; p = T / d; break; } T -= d; } }
      const sc = h / 104;
      c.translate(w / 2 - 12, h - 20); A.shadow(c, 0, 0, 17 * sc); c.scale(sc, sc);
      A.hero(c, look, { state, p, t });
    });
  }
  UI.jobSelect = function (tier) {
    const lines = tier === 1 ? ['blade', 'star', 'gale'] : [P.line];
    const cards = lines.map((ln) => {
      const L = D.LINES[ln];
      return '<div class="job' + (tier > 1 ? ' one' : '') + '" style="--jc:' + L.color + '"><canvas data-line="' + ln + '"></canvas><h3>' + L.names[tier] + '</h3><div class="tg">' + (tier === 1 ? L.tag : tier + '차 전직') + '</div>' +
        '<p>' + (tier === 1 ? L.desc : '더 높은 불꽃이 깨어납니다. 아래의 새로운 스킬을 배우고, 모습도 한층 달라집니다.') + '</p><div class="jsk">' + D.skillsOf(ln, tier).map((s) => '<div data-tip="skill:' + s.id + '">' + ic(s.icon) + '</div>').join('') + '</div>' +
        '<button class="btn" data-act="jobpick:' + ln + '">' + (tier === 1 ? '이 길을 걷는다' : '전직한다') + '</button></div>';
    }).join('');
    const m = modal('<h2>' + (tier === 1 ? '등불지기의 길을 선택하세요' : tier + '차 전직 — ' + D.LINES[P.line].names[tier]) + '</h2><div class="jobs">' + cards + '</div><div class="acts"><button class="btn sub" data-act="mclose">나중에</button></div>');
    m.querySelectorAll('canvas').forEach((cv) => jobPreview(cv, cv.dataset.line, tier, tier > 1 ? 528 : 268, tier > 1 ? 210 : 170));
    sfx('open');
  };
  ACT.jobpick = (ln) => {
    const tier = G.Game.canAdvance();
    if (!tier) return;
    const go = () => { closeAllModals(); G.Game.advance(ln); };
    if (tier === 1) UI.confirm('<b style="color:' + D.LINES[ln].color + '">' + D.LINES[ln].names[1] + '</b>의 길을 선택합니다.<br><span class="dim">한번 선택하면 되돌릴 수 없습니다. 지금까지 올린 능력치는 전부 돌려받아 새 직업에 맞게 다시 분배합니다.</span>', go, { yes: '선택한다' });
    else go();
  };
  // after a stat reset (job advancement / trainer): pick recommended or manual distribution
  UI.statReset = function (refund) {
    if (G.S.scene !== 'play' || P.dead || !P.ap || topModal() || dlg) { if (P.ap) P.hint('reset'); return; }
    const L = D.LINES[P.line], main = D.STATS.find((s) => s.k === L.main);
    const before = P.cp, rec = (() => { const st = Object.assign({}, P.stats); let ap = P.ap; while (ap > 0) { st[ap % 3 === 0 ? 'vit' : L.main]++; ap--; } return P.cpWith({ stats: st }); })();
    const m = modal('<h2>능력치 재분배</h2><p>' + (refund ? '전직을 축하합니다! 견습 시절 올린 능력치 <b class="gd">' + refund + '</b>포인트를 모두 돌려받았습니다.<br>' : '') +
      '<b style="color:' + L.color + '">' + P.jobName() + '</b>의 주 능력치는 <b class="gd">★ ' + main.name + '</b>입니다. 분배할 포인트 <b class="gd">' + P.ap + '</b></p>' +
      '<div class="rsel"><button class="btn" data-primary data-act="rsauto"><b>추천 분배</b><small>' + main.name + ' 위주 + 체력 · 전투력 ' + fmt(before) + ' → <span class="up">' + fmt(rec) + '</span></small></button>' +
      '<button class="btn sub" data-esc data-act="rsman"><b>직접 분배</b><small>캐릭터 창(C)에서 하나씩 올리기</small></button></div>');
    sfx('open');
    return m;
  };
  ACT.rsauto = (a, e) => { closeModal(e.closest('.modal')); P.autoStat(); UI.log('추천 분배를 마쳤습니다.', 'quest'); };
  ACT.rsman = (a, e) => { closeModal(e.closest('.modal')); UI.open('char'); P.hint('reset'); };

  // ------------------------------------------------------------ lantern network travel (beacon · town guide · menu)
  UI.travel = function (o) {
    o = o || {};
    if (topModal()) return;
    const list = G.Game.travelList(), cost = o.free ? 0 : G.Game.travelCost();
    // (tried: a beacon whose guardian felled you — "도전 중", with how much HP it had left; you arrive right at its ↑ prompt)
    const card = (d) => '<div class="tv-i' + (d.cur ? ' cur' : '') + (d.tried ? ' tried' : '') + '"' + (d.cur ? '' : ' data-act="tvgo:' + d.id + '"') + '>' + ic(d.town ? 'ui_map' : 'ui_travel') +
      '<div><b>' + d.name + '</b><small>' + (d.cur ? '현재 위치' : d.town ? '마을 · 안전 지대' : d.tried ? '도전 중 · ' + esc(D.shortName(D.MON[D.BEACONS[d.id].boss].name)) + ' 체력 ' + G.Game.pct(d.rec.last) + '% 남김' : d.map + (d.lv ? ' · Lv.' + d.lv[0] + '~' + d.lv[1] : '')) + '</small></div></div>';
    const towns = list.filter((d) => d.town), tried = list.filter((d) => d.tried), beacons = list.filter((d) => !d.town && !d.tried);
    const m = modal('<h2>' + (o.title || '등불 이동') + '</h2><p class="dim" style="margin-bottom:10px">' + (o.sub || '') + (cost ? ' 이동 비용 <b class="gold">' + fmt(cost) + ' G</b> · 보유 <b class="' + (P.gold < cost ? 'bad' : 'gold') + '">' + fmt(P.gold) + ' G</b>' : ' <b class="ok">무료</b>') + '</p>' +
      '<div class="tv"><div class="tv-g">마을</div>' + towns.map(card).join('') +
      (tried.length ? '<div class="tv-g tried">도전 중인 등대 <span class="dim">수호자를 다시 만나러 등대 바로 앞으로</span></div>' + tried.map(card).join('') : '') +
      '<div class="tv-g">밝힌 등대 <span class="dim">' + beacons.length + ' / ' + Object.keys(D.BEACONS).length + '</span></div>' +
      (beacons.length ? beacons.map(card).join('') : '<div class="dim" style="grid-column:1/-1;padding:6px">아직 불을 밝힌 등대가 없습니다. 수호자를 물리치고 등대에 불을 붙여 보세요.</div>') + '</div>' +
      '<div class="acts">' + (o.extra || '') + '<button class="btn sub" data-esc data-act="mclose">닫기 (Esc)</button></div>', 'tvbox');
    m.dataset.free = o.free ? '1' : '';
    sfx('open');
  };
  ACT.tvgo = (id, e) => { const m = e.closest('.modal'), free = !!(m && m.dataset.free); closeAllModals(); G.Game.fastTravel(id, { free }); };
  UI.beaconMenu = function (b) {
    const boss = D.MON[b.info.boss], r = G.Game.bossRisk(b.info.boss);
    UI.travel({ title: b.info.name, free: true, sub: '등대의 불빛을 따라 다른 등대나 마을로 순식간에 이동합니다.',
      extra: '<button class="btn sub" data-act="rematch">수호자 「' + boss.name + '」 재도전' + (r.tier ? ' <span class="rkt r' + r.tier + '">' + (r.tier === 2 ? '위험' : '주의') + ' Lv.' + r.lv + '</span>' : '') + '</button>' });
  };
  // level-gap warning in the beacon's "불씨를 지피시겠습니까?" (G.Game.bossRisk): red ⚠ 위험 · amber 주의 · nothing when the levels are close
  UI.riskBox = function (r) {
    if (!r.tier) return '';
    return '<span class="risk r' + r.tier + '"><span class="rk">' + (r.tier === 2 ? '⚠ 위험' : '주의') + '</span>수호자가 나보다 <b>' + r.gap + '레벨</b> 높아요 <span class="lv">(수호자 Lv.' + r.lv + ' · 나 Lv.' + P.lv + ')</span>' +
      '<small>센 공격 <b>' + r.hits + '번</b>이면 쓰러질 수 있어요. ' + (r.tier === 2 ? '레벨 <b>' + r.rec + '</b> 이상에서 도전하기를 권해요.' : '물약을 넉넉히 챙기세요.') + '</small></span>';
  };
  ACT.rematch = () => { closeAllModals(); G.Game.rematch(); };

  // ------------------------------------------------------------ menu / help / settings / key settings
  const kb = (act) => (I.map[act] || []).map((c) => '<kbd>' + I.label(c) + '</kbd>').join(' ') || '<kbd>—</kbd>';
  const ROWKEYS = (acts) => acts.map((a) => I.key(a)).join(' ');
  const macNote = () => (I.isMac && I.uses('Ctrl') ? '<p class="note">Mac: <b>Ctrl + 방향키</b>는 macOS의 데스크탑 전환 단축키와 겹쳐서 가끔 먹히지 않습니다. 공격은 <kbd>Z</kbd> 로도 할 수 있고, 시스템 설정 › 키보드 › 키보드 단축키 › Mission Control 에서 끌 수도 있어요.</p>' : '') +
    (!I.isMac && I.uses('Ctrl') ? '<p class="note"><b>Ctrl + W</b>는 브라우저가 탭 닫기로 쓰는 키라 막을 수 없어요. 실수로 닫히지 않도록 확인 창이 뜨며, <b>전체 화면</b>에서는 브라우저 단축키가 잠겨 마음껏 쓸 수 있어요.</p>' : '');
  // touch controls (touch.js): what each part of the screen does
  function touchHelpHTML() {
    return '<div class="keysx tch"><span class="kk"><kbd>왼쪽 조이스틱</kbd></span><span>이동 · <b>위로 밀기</b>: NPC 대화 · 사다리 · 등대 · 포탈은 <b>위로 꾹 밀고 있기</b></span>' +
      '<span class="kk"><kbd>아래 + 점프</kbd></span><span>조이스틱을 아래로 민 채 점프: 발판 아래로 내려가기</span>' +
      '<span class="kk"><kbd>공격</kbd></span><span>오른쪽 아래 큰 버튼 · 누르고 있으면 연속 공격</span>' +
      '<span class="kk"><kbd>점프</kbd></span><span>공중에서 한 번 더 누르면 2단 점프</span>' +
      '<span class="kk"><kbd>스킬 1 ~ 4</kbd></span><span>공격 버튼 위 · 스킬이 5개 넘으면 <b>⇄</b> 로 5 ~ 8 · 자리는 스킬 창의 [버튼]으로</span>' +
      '<span class="kk"><kbd>물약</kbd></span><span>누르면 마시기 · <b>꾹 누르면</b> 물약 고르기 · 초롱이 자동 물약</span>' +
      '<span class="kk"><kbd>위쪽 아이콘</kbd></span><span>캐릭터 · 가방 · 스킬 · 퀘스트 · 세계 지도 · 메뉴</span>' +
      '<span class="kk"><kbd>아이템</kbd></span><span>가방 · 상점에서 아이템을 누르면 정보와 장착 · 사용 · 판매 버튼</span></div>' +
      '<p class="note">휴대폰은 <b>가로</b>로 눕혀 주세요. 안드로이드는 <b>전체 화면</b>에서 더 넓게 즐길 수 있어요.</p>';
  }
  function helpHTML() {
    if (G.touch) return touchHelpHTML();
    return '<div class="keysx"><span class="kk">' + kb('left') + ' ' + kb('right') + '</span><span>이동</span>' +
      '<span class="kk">' + kb('jump') + '</span><span>점프 · 공중에서 한 번 더 누르면 2단 점프</span>' +
      '<span class="kk">' + kb('attack') + '</span><span>기본 공격 (누르고 있으면 연속 공격)</span>' +
      '<span class="kk"><kbd>' + ROWKEYS(['s4', 's5', 's6', 's7']) + '</kbd> <kbd>' + ROWKEYS(['s0', 's1', 's2', 's3']) + '</kbd></span><span>스킬 (윗줄 · 아랫줄) — 스킬 창에서 끌어다 놓아 배치</span>' +
      '<span class="kk">' + kb('up') + '</span><span>NPC 대화 · 사다리 오르기 · 등대 (불씨 / 순간이동) · 포탈은 꾹 누르고 있으면 이동</span>' +
      '<span class="kk">' + kb('down') + ' + ' + kb('jump') + '</span><span>발판 아래로 내려가기</span>' +
      '<span class="kk">' + kb('hp') + ' ' + kb('mp') + '</span><span>HP · MP 물약 (물약 칸 클릭: 물약 고르기 · 자동 물약)</span>' +
      '<span class="kk"><kbd>C</kbd> <kbd>I</kbd> <kbd>K</kbd></span><span>캐릭터 · 가방 · 스킬</span><span class="kk"><kbd>J</kbd> <kbd>M</kbd></span><span>퀘스트 · 세계 지도 (순간이동)</span><span class="kk"><kbd>Esc</kbd></span><span>창 닫기 · 메뉴</span></div>' + macNote();
  }
  UI.menu = function () {
    if (topModal() || G.S.scene !== 'play' || dlg) return;
    modal('<h2>메뉴</h2><div class="menu-l"><button class="btn" data-act="mclose" data-primary>계속하기</button><button class="btn sub" data-act="help">조작법</button><button class="btn sub" data-act="keys">키 설정</button><button class="btn sub" data-act="settings">설정</button><button class="btn sub" data-act="savenow">저장하기</button><button class="btn sub" data-act="totitle">타이틀로</button></div>');
    sfx('open');
  };
  ACT.help = () => { modal('<h2>조작법</h2>' + helpHTML() + '<div class="acts"><button class="btn sub" data-act="keys">키 설정</button><button class="btn" data-act="mclose" data-primary>확인</button></div>'); sfx('open'); };
  // a touch screen gets two more rows: touch controls auto / on / off, and their size
  const hasTouch = () => G.touch || navigator.maxTouchPoints > 0;
  ACT.settings = () => {
    const o = G.opt, au = G.Audio ? G.Audio.vol : { bgm: 0.8, sfx: 0.8 };
    // the two volumes, each with its number (50 % is heard about half as loud — audio.js curve)
    const vol = (k, name) => '<label><span>' + name + '</span><input type="range" min="0" max="100" value="' + Math.round(au[k] * 100) + '" data-k="' + k + '"><b class="pv" data-pv="' + k + '">' + Math.round(au[k] * 100) + '%</b></label>';
    const m = modal('<h2>설정</h2><div class="set">' + vol('bgm', '배경 음악') + vol('sfx', '효과음') +
      '<label><span>화면 흔들림</span><input type="checkbox" data-k="shake"' + (o.noShake ? '' : ' checked') + '></label><label><span>화면 번쩍임</span><input type="checkbox" data-k="flash"' + (o.noFlash ? '' : ' checked') + '></label>' +
      (I.isMac || G.touch ? '' : '<label><span>닫기 확인</span><input type="checkbox" data-k="guard"' + (o.noGuard ? '' : ' checked') + '><small class="dim">플레이 중 탭을 닫으면 한 번 물어보기 (Ctrl+W 실수 방지)</small></label>') +
      (hasTouch() ? '<label><span>터치 버튼</span><select data-k="touch">' + [[0, '자동'], [1, '항상 켜기'], [2, '끄기 (키보드)']].map(([v, n]) => '<option value="' + v + '"' + ((o.touch || 0) === v ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
        '<label><span>버튼 크기</span><select data-k="tsize">' + [[1, '작게'], [0, '보통'], [2, '크게']].map(([v, n]) => '<option value="' + v + '"' + ((o.tsize || 0) === v ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' : '') +
      '<label><span>화질</span><select data-k="rs">' + [[0, '자동'], [2, '높음'], [1.5, '보통'], [1, '낮음 (빠름)']].map(([v, n]) => '<option value="' + v + '"' + ((o.rs || 0) === v ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
      (G.touch ? '' : '<label><span>조작 키</span><button class="btn sub sm" data-act="keys">키 설정</button></label>') +
      '<label><span>전체 화면</span><button class="btn sub sm" data-act="fullscreen">전환</button></label></div><div class="acts"><button class="btn" data-act="mclose" data-primary>확인</button></div>');
    m.querySelectorAll('input,select').forEach((inp) => {
      inp.style.pointerEvents = 'auto';
      inp.addEventListener('input', () => {
        const k = inp.dataset.k;
        if (k === 'bgm' || k === 'sfx') {
          const v = inp.value / 100, pv = m.querySelector('[data-pv="' + k + '"]');
          o[k] = v; if (pv) pv.textContent = inp.value + '%';
          if (G.Audio) {
            G.Audio.setVol(k, v);
            // effects: a sample (a coin — one of the most heard sounds) at most every 0.35 s while dragging, so it can be judged
            const now = performance.now();
            if (k === 'sfx' && now - (m._pvT || 0) > 350) { m._pvT = now; G.Audio.sfx('coin'); }
          }
        }
        else if (k === 'shake') o.noShake = !inp.checked; else if (k === 'flash') o.noFlash = !inp.checked; else if (k === 'guard') o.noGuard = !inp.checked;
        else if (k === 'rs') { o.rs = parseFloat(inp.value) || 0; G.setRS(o.rs || G.autoRS()); inp.blur(); }
        else if (k === 'touch') { o.touch = +inp.value || 0; inp.blur(); G.Save.storeOpt(o); closeAllModals(); if (G.Touch) G.Touch.apply(); return; }
        else if (k === 'tsize') { o.tsize = +inp.value || 0; inp.blur(); if (G.refit) G.refit(); }
        G.Save.storeOpt(o);
      });
    });
    sfx('open');
  };
  // ---- key settings: two keys per action, click a key chip and press the new key
  let kcap = null; // { act, slot, m }
  function saveKeys() { G.opt.keys = I.map; G.Save.storeOpt(G.opt); I.rebuild(); G.emit('keys'); }
  function renderKeys(m) {
    const box = $('.mbox', m);
    const chip = (act, s) => { const c = (I.map[act] || [])[s], w = kcap && kcap.act === act && kcap.slot === s; return '<button class="kc' + (w ? ' wait' : '') + (c ? '' : ' none') + '" data-act="kset:' + act + ':' + s + '">' + (w ? '키를 누르세요…' : c ? I.label(c) : '+') + '</button>'; };
    const rows = I.ACTS.map(([act, name]) => '<div class="kr' + (act[0] === 's' ? ' sk' : '') + '"><span>' + name + (act[0] === 's' && P.hot && P.hot[+act.slice(1)] ? ' <small class="dim">' + D.SKILLS[P.hot[+act.slice(1)]].name + '</small>' : '') + '</span>' + chip(act, 0) + chip(act, 1) + '</div>').join('');
    box.innerHTML = '<h2>키 설정</h2><div class="kp">' + I.PRESETS.map((p) => '<button class="btn sub sm" data-act="kpre:' + p.id + '"><b>' + p.name + '</b> · ' + p.desc + '</button>').join('') + '</div>' +
      '<div class="kl">' + rows + '</div><p class="dim" style="font-size:12.5px;margin:8px 0 0">키 버튼을 누른 뒤 원하는 키를 누르세요 · <kbd>Esc</kbd> 취소 · <kbd>Backspace</kbd> 지우기 · C I K J M Esc Enter Tab 은 창 단축키라 쓸 수 없어요</p>' + macNote() +
      '<div class="acts"><button class="btn sub" data-act="kdef">기본값 (PC 기본)</button><button class="btn" data-act="mclose" data-primary>확인</button></div>';
  }
  ACT.keys = () => {
    const m = modal('', 'keysbox');
    renderKeys(m); sfx('open');
  };
  ACT.kset = (a, e) => {
    const [act, s] = a.split(':'), m = e.closest('.modal');
    kcap = { act, slot: +s, m };
    renderKeys(m); sfx('click');
    I.capture = (code) => {
      I.capture = null;
      const k = kcap; kcap = null;
      if (!k) return;
      if (code === 'Escape') { renderKeys(k.m); sfx('close'); return; }
      const arr = (I.map[k.act] || []).slice();
      if (code === 'Backspace' || code === 'Delete') { arr.splice(k.slot, 1); I.map[k.act] = arr; saveKeys(); renderKeys(k.m); sfx('close'); return; }
      if (I.RESERVED[code] || !code) { UI.log(I.label(code) + ' 키는 지정할 수 없습니다.', 'warn'); sfx('error'); renderKeys(k.m); return; }
      for (const o in I.map) if (o !== k.act) { const i = I.map[o].indexOf(code); if (i >= 0) { I.map[o].splice(i, 1); UI.log(I.label(code) + ' 키를 ' + I.ACTS.find((x) => x[0] === o)[1] + '에서 옮겼습니다.', 'sys'); } }
      const j = arr.indexOf(code);
      if (j >= 0) arr.splice(j, 1);
      arr.splice(Math.min(k.slot, arr.length), 0, code);
      I.map[k.act] = arr.slice(0, 2);
      saveKeys(); renderKeys(k.m); sfx('equip');
    };
  };
  ACT.kpre = (id, e) => { const p = I.PRESETS.find((x) => x.id === id); if (!p) return; I.setMap(Object.assign({}, I.map, p.map)); saveKeys(); renderKeys(e.closest('.modal')); sfx('equip'); UI.log('키 설정: ' + p.name + ' (' + p.desc + ')', 'sys'); };
  ACT.kdef = (a, e) => { I.setMap(null); saveKeys(); renderKeys(e.closest('.modal')); sfx('equip'); };
  ACT.fullscreen = () => {
    try {
      const d = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else if (G.touch && G.Touch) G.Touch.full(); // (touch: also holds the screen sideways where the browser allows it)
      else {
        const r = (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
        // in fullscreen, browser shortcuts (Ctrl+W / Ctrl+R / Alt+← …) can be handed to the game
        const lock = () => { try { if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().catch(() => {}); } catch (e) {} };
        if (r && r.then) r.then(lock).catch(() => {}); else lock();
      }
    } catch (e) {}
  };
  ACT.savenow = () => { G.Game.save(); UI.log('게임을 저장했습니다.', 'sys'); sfx('save'); };
  ACT.totitle = () => UI.confirm('타이틀 화면으로 돌아갑니다.<br><span class="dim">진행 상황은 자동으로 저장됩니다.</span>', () => { G.Game.save(); closeAllModals(); UI.showTitle(); }, { yes: '타이틀로' });

  // ------------------------------------------------------------ death / ending
  function deathModal() {
    if (!P.dead || G.S.scene !== 'play') return;
    closeDlg(true); closeAllModals(); UI.closeAll();
    const lose = P.deathLoss(), pct = Math.round((lose / D.expNeed(P.lv)) * 1000) / 10; // say exactly what getting up costs
    const note = P.lv < 10 ? '레벨 10 전까지는 경험치를 잃지 않습니다.' : P.lv >= D.MAX_LV ? '최고 레벨이라 경험치를 잃지 않습니다.' : lose ? '경험치를 <b class="bad">' + fmt(lose) + '</b> 잃습니다. (이번 레벨 경험치의 ' + pct + '%)' : '잃을 경험치가 없습니다.';
    if (G.Game.fall) { fallModal(G.Game.fall, note); return; }
    // went down together with a guardian that fell (the same instant, or while its beacon lit): the win stands — and is already saved
    const w = G.Game.won, wn = w && D.MON[w.boss].name;
    const won = w ? '<span class="wonbox"><b>✔ ' + esc(wn) + '</b>' + U.josa(wn, '은/는').slice(wn.length) + ' 물리쳤어요!<small>' + (w.fresh ? D.BEACONS[w.map].name + '에 불이 켜졌어요. ' : '') + '쓰러져도 이 승리는 그대로 남아요.</small></span>' : '';
    const m = modal('<h2 style="color:#ff9aa8">쓰러졌습니다…</h2><p>' + won + '초롱이가 당신을 가까운 마을로 데려갑니다.<br><span class="dim">' + note + (w && P.deathLoss() ? ' <span class="ok">수호자전에서는 조금만 잃어요.</span>' : '') + '</span></p><div class="acts"><button class="btn" data-primary>마을에서 일어나기</button></div>');
    $('[data-primary]', m).onclick = (ev) => { ev.stopPropagation(); closeModal(m); const lost = P.respawn(); if (lost) UI.log('경험치 ' + fmt(lost) + '을(를) 잃었습니다.', 'warn'); };
  }
  // fell to a guardian: how far you got (its HP left, as on its bar), one tip for next time, and where to get up — right at the
  // beacon (HP · MP full, ↑ to try again) or in town to get ready (the town's guide then sends you straight back to the beacon)
  const travelNpc = () => { const tm = G.MAPS[P.town]; return tm && (tm.npcs || []).map((n) => D.NPCS[n[0]]).find((d) => d && d.travel); };
  function fallModal(f, note) {
    const def = D.MON[f.boss], rec = f.rec, nm = esc(D.shortName(def.name)), left = G.Game.pct(f.left), best = G.Game.pct(rec.best);
    const tip = G.Game.bossTip(f.boss, rec), npc = travelNpc(), bn = D.BEACONS[f.map].name;
    const sub = (rec.n > 1 ? rec.n + '번째 도전' : '첫 도전') + (f.newBest ? '' : rec.n > 1 && best < left ? ' · 최고 기록 ' + best + '% 남김' : '');
    const cheer = f.newBest ? '<span class="fl-nb">최고 기록!</span>' : left <= 15 ? '<span class="fl-nb">정말 아까웠어요!</span>' : f.rage ? '<span class="fl-nb">절반 넘게 깎았어요!</span>' : '';
    const m = modal('<h2 style="color:#ff9aa8">쓰러졌습니다…</h2>' +
      '<div class="fall"><div class="fl-hd"><b>' + esc(def.name) + '</b><span>Lv.' + def.lv + ' · ' + sub + '</span></div>' +
      '<div class="fl-bar"><i style="width:' + left + '%"></i>' + (rec.n > 1 && best < left ? '<u style="left:' + best + '%"></u>' : '') + '<em>' + left + '%</em></div>' +
      '<div class="fl-r"><b>' + nm + '</b> 체력 <b class="fl-p">' + left + '%</b> 남기고 쓰러짐' + cheer + '</div>' +
      '<div class="fl-tip"><span class="fl-k">다음엔 · ' + tip.k + '</span><span class="fl-t">' + tip.text + '</span>' + (tip.why ? '<small>' + tip.why + '</small>' : '') + '</div></div>' +
      '<p class="fl-x dim">' + note + (P.deathLoss() ? ' <span class="ok">수호자전에서는 조금만 잃어요.</span>' : '') + '</p>' +
      '<div class="acts fl-acts"><button class="btn" data-primary><b>등대 앞에서 다시 도전</b><small>HP · MP 가득 · ' + bn + ' 바로 앞</small></button>' +
      '<button class="btn sub" data-esc><b>마을에서 쉬기</b><small>물약 · 강화 준비 → ' + (npc ? U.josa(npc.name, '이/가') + ' 등대로 보내 줘요' : '지도(M)로 등대까지') + '</small></button></div>', 'fallbox');
    const t0 = performance.now(), armed = () => performance.now() - t0 > 450; // (a jump / attack key still being mashed doesn't pick for you)
    const go = (where) => (ev) => {
      ev.stopPropagation();
      if (!armed()) return;
      closeModal(m); sfx('click');
      const lost = P.respawn(where);
      if (lost) UI.log('경험치 ' + fmt(lost) + '을(를) 잃었습니다.', 'warn');
    };
    $('[data-primary]', m).onclick = go('beacon');
    $('[data-esc]', m).onclick = go('town');
  }
  // the last attempt, in the beacon's "불씨를 지피시겠습니까?" (spans: the confirm text sits inside a <p>)
  UI.lastTry = function (id, rec) {
    const tip = G.Game.bossTip(id, rec, { noLv: G.Game.bossRisk(id).tier > 0 }); // (a level warning is already right above it)
    return '<span class="lastry"><span class="lt-h">지난 도전</span><b>' + esc(D.shortName(D.MON[id].name)) + '</b> 체력 <b class="fl-p">' + G.Game.pct(rec.last) + '%</b> 남기고 쓰러짐' +
      (rec.n > 1 ? ' <span class="dim">· ' + rec.n + '번 도전 · 최고 ' + G.Game.pct(rec.best) + '%</span>' : '') + '<small><b>' + tip.k + '</b> ' + tip.text + '</small></span>';
  };
  UI.ending = function () {
    if (G.S.scene !== 'play' || P.ended) return;
    P.ended = true; G.Game.save();
    closeDlg(true);
    const mm = Math.floor(P.playtime / 60);
    modal('<div class="end"><h2>✦ 일곱 등대가 모두 밝혀졌습니다 ✦</h2><p>어스름의 군주 녹스가 쓰러지고, 큰등불에 다시 불이 붙었습니다.<br>노을 대륙을 뒤덮었던 어스름이 걷히고, 사람들은 더 이상 밤을 두려워하지 않게 되었습니다.<br><br>그리고 한 등불지기와 작은 불씨 초롱이의 이야기는<br>등대의 불빛처럼 오래도록 전해졌답니다.</p>' +
      '<div class="stats"><span>' + esc(P.name) + '<small>Lv.' + P.lv + ' ' + P.jobName() + '</small></span><span>' + (mm >= 60 ? Math.floor(mm / 60) + '시간 ' : '') + (mm % 60) + '분<small>플레이 시간</small></span><span>' + fmt(P.kills) + '<small>처치한 몬스터</small></span></div>' +
      '<p class="gd" style="font-weight:900">플레이해 주셔서 감사합니다!</p><div class="acts"><button class="btn" data-act="mclose" data-primary>모험 계속하기</button></div></div>');
    sfx('jobup');
  };

  // ------------------------------------------------------------ title / character creation
  function startPlay() { $('#title').classList.add('hidden'); $('#title').innerHTML = ''; UI.showHud(true); X.syncLock(); I.pressed = {}; }
  UI.showTitle = function () {
    G.S.scene = 'title';
    UI.closeAll(); closeDlg(true); closeAllModals(); UI.showHud(false);
    const t = $('#title'), sv = G.Save.load();
    t.classList.remove('hidden');
    t.innerHTML = '<div class="logo"><h1>' + D.TITLE + '</h1><p>' + D.SUB + '</p></div><div class="t-menu">' +
      (sv && sv.name ? '<button class="btn" data-act="tcont">이어하기<small>Lv.' + sv.lv + ' ' + D.jobName(sv.line, sv.tier) + ' · ' + esc(sv.name) + '</small></button>' : '') +
      '<button class="btn' + (sv && sv.name ? ' sub' : '') + '" data-act="tnew">새로 시작</button><div style="display:flex;gap:10px"><button class="btn sub" style="flex:1;font-size:15px" data-act="help">조작법</button><button class="btn sub" style="flex:1;font-size:15px" data-act="fullscreen">전체 화면</button></div></div>' +
      '<div class="t-foot">' + titleFoot() + '</div>';
    X.syncLock();
    if (G.Audio) G.Audio.bgm('town');
  };
  const titleFoot = () => (G.touch ? '왼쪽 조이스틱 이동 · 오른쪽 버튼 공격 · 점프 · 스킬 · 물약 · 조이스틱 ↑ 대화 · ↑ 꾹 포탈'
    : '방향키 이동 · ' + I.keys('jump') + ' 점프 · ' + I.keys('attack') + ' 공격 · 스킬 Q W E R / A S D F · ↑ 대화 · ↑ 꾹 포탈') + ' &nbsp;—&nbsp; 진행 상황은 이 브라우저에 자동 저장됩니다';
  G.on('touchmode', () => { const f = $('#title .t-foot'); if (f) f.innerHTML = titleFoot(); });
  // touch: starting to play also asks for the full screen (Android — the address bar takes a good slice of a sideways phone)
  const goFull = () => { if (G.touch && G.Touch) G.Touch.full(); };
  ACT.tcont = () => { if (G.Audio) G.Audio.init(); goFull(); if (G.Game.continue()) startPlay(); else UI.log('저장 데이터를 불러오지 못했습니다.', 'warn'); };
  ACT.tnew = () => {
    if (G.Audio) G.Audio.init();
    if (G.Save.has()) UI.confirm('저장된 모험이 있습니다.<br>새로 시작하면 <b>기존 기록이 지워집니다.</b> 계속할까요?', showCreate, { yes: '새로 시작' });
    else showCreate();
  };
  let cr = null;
  function showCreate() {
    const L = A.LOOKS, t = $('#title');
    cr = { skin: L.SKIN[0], hair: U.pick(L.HAIR), style: U.randInt(0, 5), eye: U.pick(L.EYE) };
    const sw = (key, list, txt) => '<div class="sw" data-g="' + key + '">' + list.map((v, i) => '<button class="' + (txt ? 'tx' : '') + ((txt ? cr.style === i : cr[key] === v) ? ' on' : '') + '" data-act="crs:' + key + ':' + i + '"' + (txt ? '' : ' style="background:' + v + '"') + '>' + (txt ? v : '') + '</button>').join('') + '</div>';
    t.innerHTML = '<div class="pnl cr"><div><canvas></canvas></div><div class="cr-r"><h2>새로운 등불지기</h2><label>이름</label><input type="text" id="cr-name" maxlength="8" placeholder="이름 (최대 8자)" autocomplete="off" spellcheck="false">' +
      '<label>머리 모양</label>' + sw('style', L.STYLES, true) + '<label>머리 색</label>' + sw('hair', L.HAIR) + '<label>피부</label>' + sw('skin', L.SKIN) + '<label>눈동자</label>' + sw('eye', L.EYE) +
      '<div class="acts" style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px"><button class="btn sub" data-act="crback">뒤로</button><button class="btn" data-act="crgo">모험 시작!</button></div></div></div>';
    X.addLive($('canvas', t), 250, 300, (c, tt) => {
      const T = tt % 7, st = T < 3 ? 'idle' : T < 5 ? 'run' : T < 6 ? 'atk1' : 'cheer';
      c.translate(118, 236); A.shadow(c, 0, 0, 52); c.scale(3.1, 3.1);
      A.hero(c, Object.assign({ job: 'novice', tier: 0, weapon: { kind: 'rod', tier: 1 } }, cr), { state: st, t: tt, p: st === 'atk1' ? U.sat((T - 5) * 2.2) : 0, speed: st === 'run' ? 250 : 0 });
      c.setTransform(2, 0, 0, 2, 0, 0); c.translate(196, 96); A.wisp(c, tt);
    });
    const inp = $('#cr-name');
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) ACT.crgo(); });
    // (touch: no focus on its own — a phone's keyboard would cover the screen before you even see it; tap the name to type it.
    //  iOS can leave the page scrolled after its keyboard closes: put it back)
    if (!G.touch) setTimeout(() => inp.focus(), 50);
    else inp.addEventListener('blur', () => { setTimeout(() => window.scrollTo(0, 0), 60); });
    sfx('open');
  }
  ACT.crs = (a, e) => {
    const [key, i] = a.split(':'), L = A.LOOKS;
    cr[key] = key === 'style' ? +i : (key === 'hair' ? L.HAIR : key === 'skin' ? L.SKIN : L.EYE)[i];
    e.parentNode.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    e.classList.add('on'); sfx('click');
  };
  ACT.crback = () => UI.showTitle();
  ACT.crgo = () => {
    goFull();
    const name = ($('#cr-name').value || '').trim().slice(0, 8) || '등불지기';
    G.Save.clear();
    G.Game.newGame(name, { skin: cr.skin, hair: cr.hair, style: cr.style, eye: cr.eye });
    startPlay();
    sfx('quest_accept');
  };

  // ------------------------------------------------------------ hooks into ui.js
  X.init2 = function (r) {
    root = r;
    G.on('death', () => setTimeout(deathModal, 1500));
    // warnings raised while the shop / blacksmith is open (골드 부족 · 가방이 가득 참 …) also show inside that window
    G.on('msg', (t, k) => { if (k !== 'warn') return; if (enh) setNote(enh, 'bad', '✘ ' + t); else if (shop) setNote(shop, 'bad', '✘ ' + t); });
  };
  X.frame2 = function (dt) {
    if (dlg) {
      const line = dlg.lines[dlg.li];
      if (!dlg.full) { dlg.n += dt * 52; if (dlg.n >= line.length) dlg.n = line.length; }
      const k = Math.floor(dlg.n);
      if (k !== dlg.k) {
        const d = $('#dlg');
        dlg.k = k; $('.ty', d).textContent = line.slice(0, k); $('.gh', d).textContent = line.slice(k); // the untyped rest holds its place
        if (k % 3 === 1 && k < line.length) sfx('talk', { vol: 0.5 });
        if (k >= line.length && !dlg.full) { dlg.full = true; lineDone(); }
      }
    }
    if (enh && enh.fx) enh.fx.frame();
    if (dirty.ext) { dirty.ext = 0; if (shop) renderShop(); if (enh) { if (enh.fx) enhWallet(); else renderEnh(); } }
  };
  // returns true when the key was consumed by a dialog / modal
  X.key2 = function (code) {
    const m = topModal();
    if (m) {
      if (enh && enh.fx && enh.m === m) enh.fx.skip(); // any key skips the smith's show (never closes the window or presses 강화하기 again)
      else if (code === 'Escape') { const b = $('[data-esc]', m) || $('[data-act="mclose"]', m); if (b) b.click(); }
      else if (code === 'Enter' || code === 'Space') { const b = $('[data-primary]', m); if (b && !b.classList.contains('off')) b.click(); }
      return true;
    }
    if (dlg) {
      const d = $('#dlg'), btns = d.querySelectorAll('.opt .btn');
      if (code === 'Escape') closeDlg();
      else if (code === 'Space' || code === 'Enter' || code === 'KeyZ') { if (dlgReady()) { if (btns.length) btns[0].click(); } else dnext(); }
      else if (/^Digit[1-9]$/.test(code)) { const b = btns[+code[5] - 1]; if (b && dlgReady()) b.click(); }
      return true;
    }
    return false;
  };
})();
