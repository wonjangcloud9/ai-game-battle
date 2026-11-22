'use strict';
/* 등불지기 — UI part 2: NPC dialog, shop, enhancement, job advancement, modals (confirm / menu / settings / death / ending), title & character creation */
(function () {
  const G = window.G, U = G.U, A = G.Art, D = G.D, P = G.P, I = G.Input, Inv = G.Inv, Q = G.Quest, UI = G.UI, X = UI._;
  const { $, el, esc, sfx, fmt, ic, dirty, ACT } = X;
  let root;

  // ------------------------------------------------------------ modal helpers
  function modal(html, cls) {
    const m = el('div', 'modal', '<div class="mbox pnl ' + (cls || '') + '">' + html + '</div>');
    root.appendChild(m);
    X.syncLock(); I.pressed = {}; X.tipHide();
    return m;
  }
  function closeModal(m) {
    if (!m || !m.parentNode) return;
    if (shop && shop.m === m) shop = null;
    if (enh && enh.m === m) enh = null;
    m.remove(); X.syncLock(); I.pressed = {}; X.tipHide();
  }
  const topModal = () => { const ms = root.querySelectorAll('.modal'); return ms.length ? ms[ms.length - 1] : null; };
  function closeAllModals() { root.querySelectorAll('.modal').forEach((m) => m.remove()); shop = enh = null; X.syncLock(); }
  UI.confirm = function (html, onYes, o) {
    o = o || {};
    const m = modal('<p>' + html + '</p><div class="acts"><button class="btn" data-primary>' + (o.yes || '확인') + '</button><button class="btn sub" data-esc>' + (o.no || '취소') + '</button></div>');
    $('[data-primary]', m).onclick = (ev) => { ev.stopPropagation(); closeModal(m); sfx('click'); onYes(); };
    $('[data-esc]', m).onclick = (ev) => { ev.stopPropagation(); closeModal(m); sfx('close'); if (o.onNo) o.onNo(); };
    sfx('open');
  };
  ACT.mclose = (a, e) => { closeModal(e.closest('.modal')); sfx('close'); };

  // ------------------------------------------------------------ NPC dialog
  let dlg = null;
  function showDlg(npc, lines, opts, foot) {
    const d = $('#dlg');
    dlg = { npc, lines, li: 0, n: 0, k: -1, full: false, opts, foot };
    d.innerHTML = '<div class="pt"><canvas></canvas><b>' + npc.def.name + '</b><small>' + npc.def.title + '</small></div><div class="tx"><div class="say" data-act="dnext"></div><div class="opt"></div></div><div class="nx hidden">▼ Space</div>';
    X.addLive($('canvas', d), 132, 132, (c, t) => { c.translate(60, 86); c.scale(2.5, 2.5); A.heroHead(c, npc.def.look, t); });
    d.classList.remove('hidden');
    X.syncLock(); X.tipHide();
  }
  function closeDlg(silent) {
    if (!dlg && $('#dlg').classList.contains('hidden')) return;
    dlg = null; $('#dlg').classList.add('hidden'); $('#dlg').innerHTML = '';
    X.syncLock(); I.pressed = {};
    if (!silent) sfx('close');
  }
  function lineDone() {
    const d = $('#dlg');
    if (dlg.li < dlg.lines.length - 1) { $('.nx', d).classList.remove('hidden'); return; }
    $('.nx', d).classList.add('hidden');
    $('.opt', d).innerHTML = (dlg.foot ? '<div class="rw" style="width:100%;margin-bottom:4px">' + dlg.foot + '</div>' : '') +
      dlg.opts.map((o, i) => '<button class="btn ' + (o.cls || '') + '" data-act="dopt:' + i + '">' + o.t + '</button>').join('');
  }
  function dnext() {
    if (!dlg) return;
    if (!dlg.full) { dlg.n = dlg.lines[dlg.li].length; return; }
    if (dlg.li < dlg.lines.length - 1) { dlg.li++; dlg.n = 0; dlg.k = -1; dlg.full = false; $('.nx', $('#dlg')).classList.add('hidden'); sfx('click'); }
  }
  ACT.dnext = dnext;
  ACT.dopt = (a) => { if (dlg && dlg.opts[a]) { sfx('click'); dlg.opts[a].fn(); } };
  const rewHTML = (r) => (r.exp ? '<span>EXP ' + fmt(r.exp) + '</span>' : '') + (r.gold ? '<span class="gold">' + fmt(r.gold) + ' G</span>' : '') + (r.items || []).map(([b, n]) => X.slot({ b, n, rar: 1 }, 'base:' + b)).join('');
  function dlgMenu(npc, text) {
    const def = npc.def, f = Q.forNpc(npc.id), opts = [];
    for (const id of f.ready) opts.push({ t: '✔ ' + D.QUESTS[id].name + ' (완료)', cls: 'q', fn: () => {
      const q = D.QUESTS[id];
      showDlg(npc, q.done, [{ t: '보상 받기', cls: 'q', fn: () => { Q.complete(id); const f2 = Q.forNpc(npc.id); if (f2.ready.length || f2.avail.length) dlgMenu(npc); else closeDlg(); } }], rewHTML(q.rew || {}));
    } });
    for (const id of f.avail) opts.push({ t: '! ' + D.QUESTS[id].name, cls: 'q', fn: () => {
      const q = D.QUESTS[id];
      showDlg(npc, q.offer, [{ t: '수락한다', cls: 'q', fn: () => { Q.accept(id); closeDlg(true); } }, { t: '다음에', cls: 'sub', fn: () => dlgMenu(npc) }], '<span class="dim">보상</span>' + rewHTML(q.rew || {}));
    } });
    for (const id of f.active) opts.push({ t: '… ' + D.QUESTS[id].name, cls: 'sub', fn: () => showDlg(npc, D.QUESTS[id].giver === npc.id ? D.QUESTS[id].prog : ['아직 준비가 덜 된 것 같군요.'], [{ t: '알겠습니다', cls: 'sub', fn: () => dlgMenu(npc) }]) });
    if (def.shop) opts.push({ t: def.enhance ? '장비 상점' : '상점', fn: () => { closeDlg(true); UI.shop(npc); } });
    if (def.enhance) opts.push({ t: '장비 강화', fn: () => { closeDlg(true); UI.enhance(npc); } });
    if (def.job && P.tier < 3) {
      const nx = G.Game.canAdvance();
      opts.push({ t: '전직하기', cls: nx ? '' : 'sub', fn: () => {
        if (nx) { closeDlg(true); UI.jobSelect(nx); }
        else showDlg(npc, [(P.tier + 1) + '차 전직은 레벨 ' + D.JOB_LV[P.tier + 1] + '부터 가능해. 지금은 레벨 ' + P.lv + '이니 조금 더 수련하고 와.'], [{ t: '알겠습니다', cls: 'sub', fn: () => dlgMenu(npc) }]);
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

  // ------------------------------------------------------------ shop
  let shop = null;
  UI.shop = function (npc) { shop = { npc, m: modal('', '') }; renderShop(); sfx('open'); };
  function renderShop() {
    const def = shop.npc.def, box = $('.mbox', shop.m), old = $('.shop-l', box), sc = old ? old.scrollTop : 0;
    let rows = '';
    for (const id of D.SHOPS[def.shop]) {
      const b = D.ITEMS[id], eq = D.isEquip(b), no = P.gold < b.price;
      if (b.type === 'weapon' && P.line !== 'novice' && b.line !== P.line) continue;
      const sub = eq ? (b.atk ? '공격력 +' + b.atk : b.def ? '방어력 +' + b.def : 'HP +' + b.hp) + ' · 요구 Lv.' + b.lv + (b.type === 'weapon' && b.line !== P.line ? ' · ' + D.LINES[b.line].names[1] : '') : b.desc || '';
      rows += '<div class="si-r' + (no ? ' no' : '') + '">' + X.slot(eq ? { b: id, rar: 0 } : { b: id, n: 1 }, 'shop:' + id) + '<div class="nm">' + b.name + '<small>' + sub + '</small></div><span class="' + (no ? 'bad' : 'gold') + '">' + fmt(b.price) + ' G</span>' +
        '<button class="btn sm' + (no ? ' off' : '') + '" data-act="buy:' + id + '">구매</button>' + (!eq ? '<button class="btn sub sm' + (P.gold < b.price * 10 ? ' off' : '') + '" data-act="buy10:' + id + '">×10</button>' : '') + '</div>';
    }
    box.innerHTML = '<h2>' + def.name + '의 ' + (def.enhance ? '대장간' : '잡화점') + '</h2><div class="shop"><div class="shop-l">' + rows + '</div><div><div class="grid">' +
      P.inv.map((it, i) => X.slot(it, 'sinv:' + i, ' data-act="sell:' + i + '"')).join('') + '</div><div class="row" style="margin-top:10px"><span class="gold">' + fmt(P.gold) + ' G</span><span class="sp"></span>' +
      '<span class="dim" style="font-size:12px">가방의 아이템 클릭: 판매 (Shift: 묶음 전체)</span></div></div></div><div class="acts"><button class="btn sub" data-act="mclose">닫기 (Esc)</button></div>';
    $('.shop-l', box).scrollTop = sc;
  }
  ACT.buy = (a) => { if (Inv.buy(a, 1)) UI.log('구매: ' + D.ITEMS[a].name); };
  ACT.buy10 = (a) => { if (Inv.buy(a, 10)) UI.log('구매: ' + D.ITEMS[a].name + ' ×10'); };
  ACT.sell = (a, e, ev) => {
    const it = P.inv[a];
    if (!it) return;
    const b = D.ITEMS[it.b], all = ev.shiftKey;
    const go = () => { const nm = D.itemName(it), n = it.n && all ? it.n : 1, g = Inv.sell(+a, all); UI.log('판매: ' + esc(nm) + (n > 1 ? ' ×' + n : '') + ' (+' + fmt(g) + ' G)'); X.tipHide(); };
    if (D.isEquip(b) && ((it.rar || 0) >= 2 || (it.enh || 0) >= 3)) UI.confirm('<b style="color:' + D.RAR[it.rar || 0].color + '">' + esc(D.itemName(it)) + '</b>' + U.josa(b.name, '을/를').slice(b.name.length) + ' ' + fmt(D.sellPrice(it)) + ' G에 판매하시겠습니까?', go, { yes: '판매' });
    else go();
  };
  X.tipExt = (k, a) => (k === 'sinv' && P.inv[a] ? X.itemTip(P.inv[a], { cmp: true, hint: '클릭: 판매' }) : k === 'enh' ? '' : '');

  // ------------------------------------------------------------ enhancement
  let enh = null;
  UI.enhance = function (npc) { enh = { npc, m: modal('', ''), sel: null, res: null, resT: 0 }; renderEnh(); sfx('open'); };
  function enhItems() {
    const out = [];
    for (const s of D.SLOTS) if (P.eq[s.k]) out.push(['eq:' + s.k, P.eq[s.k]]);
    P.inv.forEach((it, i) => { if (it && D.isEquip(D.ITEMS[it.b])) out.push(['inv:' + i, it]); });
    return out;
  }
  function renderEnh(res) {
    const box = $('.mbox', enh.m), list = enhItems();
    if (!list.some(([, it]) => it === enh.sel)) enh.sel = list.length ? list[0][1] : null;
    const it = enh.sel;
    let right = '<p class="dim" style="margin-top:120px">강화할 장비가 없습니다.</p>';
    if (it) {
      const b = D.ITEMS[it.b], e = it.enh || 0, max = e >= D.ENH_MAX, c = D.enhCost(it), dust = Inv.count('dust');
      const now = D.itemStats({ b: it.b, rar: it.rar, enh: e, opts: [] }), nx = D.itemStats({ b: it.b, rar: it.rar, enh: e + 1, opts: [] });
      const SN = { atk: '공격력', def: '방어력', hp: '최대 HP' };
      right = '<div class="big">' + ic(b.icon) + '</div><h3 style="color:' + D.RAR[it.rar || 0].color + '">' + esc(b.name) + ' <span class="gd">+' + e + (max ? '' : ' → +' + (e + 1)) + '</span></h3>';
      if (max) right += '<p class="gd" style="margin-top:30px;font-weight:900">최대 강화 단계입니다!</p>';
      else {
        right += '<table>' + Object.keys(SN).filter((k) => now[k]).map((k) => '<tr><td class="dim">' + SN[k] + '</td><td>' + now[k] + '</td><td class="ok">→ ' + nx[k] + '</td></tr>').join('') + '</table>' +
          '<div>성공 확률 <b class="' + (D.ENH_RATE[e] >= 70 ? 'ok' : D.ENH_RATE[e] >= 40 ? 'gd' : 'bad') + '">' + D.ENH_RATE[e] + '%</b></div>' + (e >= 7 ? '<div class="bad" style="font-size:12px">실패 시 50% 확률로 강화 단계가 1 내려갑니다</div>' : '<div class="dim" style="font-size:12px">실패해도 장비는 그대로 유지됩니다</div>') +
          '<div style="margin:10px 0 12px;font-weight:800"><span class="' + (P.gold < c.gold ? 'bad' : 'gold') + '">' + fmt(c.gold) + ' G</span> &nbsp;·&nbsp; 빛가루 <span class="' + (dust < c.dust ? 'bad' : 'ok') + '">' + dust + ' / ' + c.dust + '</span></div>' +
          '<button class="btn' + (P.gold < c.gold || dust < c.dust ? ' off' : '') + '" data-act="enhgo" data-primary>강화하기</button>';
      }
    }
    box.innerHTML = '<h2>' + enh.npc.def.name + '의 장비 강화</h2><div class="enh"><div class="enh-l"><div class="grid">' + list.map(([k, o]) => X.slot(o, k, ' data-act="enhsel:' + k + '"', o === it ? ' sel' : '')).join('') + '</div></div>' +
      '<div class="enh-r' + (res === 'ok' ? ' flash' : res ? ' shake' : '') + '">' + right + (res ? '<div class="enh-res ' + (res === 'ok' ? 'ok' : 'fail') + '">' + (res === 'ok' ? '강화 성공!' : res === 'down' ? '실패… 단계 하락' : '강화 실패…') + '</div>' : '') + '</div></div>' +
      '<div class="hint" style="text-align:center">빛가루는 몬스터와 수호자에게서 얻거나 대장간에서 살 수 있습니다.</div><div class="acts"><button class="btn sub" data-act="mclose">닫기 (Esc)</button></div>';
  }
  ACT.enhsel = (a) => { const i = a.indexOf(':'), k = a.slice(0, i), v = a.slice(i + 1); enh.sel = k === 'eq' ? P.eq[v] : P.inv[v]; enh.res = null; renderEnh(); sfx('click'); };
  ACT.enhgo = () => { const r = Inv.enhance(enh.sel); if (r) { enh.res = r; enh.resT = 1.2; dirty.ext = 0; renderEnh(r); if (r === 'ok') UI.log('강화 성공: ' + esc(D.itemName(enh.sel)), 'quest'); } };

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
    if (tier === 1) UI.confirm('<b style="color:' + D.LINES[ln].color + '">' + D.LINES[ln].names[1] + '</b>의 길을 선택합니다.<br><span class="dim">한번 선택하면 되돌릴 수 없습니다.</span>', go, { yes: '선택한다' });
    else go();
  };

  // ------------------------------------------------------------ menu / help / settings
  const HELP = '<div class="keysx"><kbd>← →</kbd><span>이동</span><kbd>Space</kbd><span>점프 · 공중에서 한 번 더 누르면 2단 점프 (X 키도 가능)</span><kbd>↑</kbd><span>포탈 이동 · NPC 대화 · 사다리 오르기 · 등대에 불씨 지피기</span>' +
    '<kbd>↓ + Space</kbd><span>발판 아래로 내려가기</span><kbd>Z</kbd><span>기본 공격 (누르고 있으면 연속 공격)</span><kbd>A S D F Q W</kbd><span>스킬</span><kbd>1 · 2</kbd><span>생명 물약 · 마나 물약</span>' +
    '<kbd>C · I · K</kbd><span>캐릭터 · 가방 · 스킬</span><kbd>J · M</kbd><span>퀘스트 · 세계 지도</span><kbd>Esc</kbd><span>창 닫기 · 메뉴</span></div>';
  UI.menu = function () {
    if (topModal() || G.S.scene !== 'play' || dlg) return;
    modal('<h2>메뉴</h2><div class="menu-l"><button class="btn" data-act="mclose" data-primary>계속하기</button><button class="btn sub" data-act="help">조작법</button><button class="btn sub" data-act="settings">설정</button><button class="btn sub" data-act="savenow">저장하기</button><button class="btn sub" data-act="totitle">타이틀로</button></div>');
    sfx('open');
  };
  ACT.help = () => { modal('<h2>조작법</h2>' + HELP + '<div class="acts"><button class="btn" data-act="mclose" data-primary>확인</button></div>'); sfx('open'); };
  ACT.settings = () => {
    const o = G.opt, au = G.Audio ? G.Audio.vol : { bgm: 0.5, sfx: 0.7 };
    const m = modal('<h2>설정</h2><div class="set"><label><span>배경 음악</span><input type="range" min="0" max="100" value="' + Math.round(au.bgm * 100) + '" data-k="bgm"></label><label><span>효과음</span><input type="range" min="0" max="100" value="' + Math.round(au.sfx * 100) + '" data-k="sfx"></label>' +
      '<label><span>화면 흔들림</span><input type="checkbox" data-k="shake"' + (o.noShake ? '' : ' checked') + '></label><label><span>화면 번쩍임</span><input type="checkbox" data-k="flash"' + (o.noFlash ? '' : ' checked') + '></label>' +
      '<label><span>화질</span><select data-k="rs">' + [[0, '자동'], [2, '높음'], [1.5, '보통'], [1, '낮음 (빠름)']].map(([v, n]) => '<option value="' + v + '"' + ((o.rs || 0) === v ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>' +
      '<label><span>전체 화면</span><button class="btn sub sm" data-act="fullscreen">전환</button></label></div><div class="acts"><button class="btn" data-act="mclose" data-primary>확인</button></div>');
    m.querySelectorAll('input,select').forEach((inp) => {
      inp.style.pointerEvents = 'auto';
      inp.addEventListener('input', () => {
        const k = inp.dataset.k;
        if (k === 'bgm' || k === 'sfx') { const v = inp.value / 100; o[k] = v; if (G.Audio) { G.Audio.setVol(k, v); if (k === 'sfx') G.Audio.sfx('click'); } }
        else if (k === 'shake') o.noShake = !inp.checked; else if (k === 'flash') o.noFlash = !inp.checked;
        else if (k === 'rs') { o.rs = parseFloat(inp.value) || 0; G.setRS(o.rs || G.autoRS()); inp.blur(); }
        G.Save.storeOpt(o);
      });
    });
    sfx('open');
  };
  ACT.fullscreen = () => {
    try {
      const d = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { const r = (d.requestFullscreen || d.webkitRequestFullscreen).call(d); if (r && r.catch) r.catch(() => {}); }
    } catch (e) {}
  };
  ACT.savenow = () => { G.Game.save(); UI.log('게임을 저장했습니다.', 'sys'); sfx('save'); };
  ACT.totitle = () => UI.confirm('타이틀 화면으로 돌아갑니다.<br><span class="dim">진행 상황은 자동으로 저장됩니다.</span>', () => { G.Game.save(); closeAllModals(); UI.showTitle(); }, { yes: '타이틀로' });

  // ------------------------------------------------------------ death / ending
  function deathModal() {
    if (!P.dead || G.S.scene !== 'play') return;
    closeDlg(true); closeAllModals(); UI.closeAll();
    const m = modal('<h2 style="color:#ff9aa8">쓰러졌습니다…</h2><p>초롱이가 당신을 가까운 마을로 데려갑니다.' + (P.lv >= 10 ? '<br><span class="dim">경험치를 조금 잃습니다.</span>' : '<br><span class="dim">레벨 10 전까지는 경험치를 잃지 않습니다.</span>') + '</p><div class="acts"><button class="btn" data-primary>마을에서 일어나기</button></div>');
    $('[data-primary]', m).onclick = (ev) => { ev.stopPropagation(); closeModal(m); const lost = P.respawn(); if (lost) UI.log('경험치 ' + fmt(lost) + '을(를) 잃었습니다.', 'warn'); };
  }
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
      '<div class="t-foot">방향키 이동 · Space 점프 · Z 공격 · ↑ 대화/포탈 &nbsp;—&nbsp; 진행 상황은 이 브라우저에 자동 저장됩니다</div>';
    X.syncLock();
    if (G.Audio) G.Audio.bgm('town');
  };
  ACT.tcont = () => { if (G.Audio) G.Audio.init(); if (G.Game.continue()) startPlay(); else UI.log('저장 데이터를 불러오지 못했습니다.', 'warn'); };
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
    setTimeout(() => inp.focus(), 50);
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
  };
  X.frame2 = function (dt) {
    if (dlg) {
      const line = dlg.lines[dlg.li];
      if (!dlg.full) { dlg.n += dt * 52; if (dlg.n >= line.length) dlg.n = line.length; }
      const k = Math.floor(dlg.n);
      if (k !== dlg.k) {
        dlg.k = k; $('.say', $('#dlg')).textContent = line.slice(0, k);
        if (k % 3 === 1 && k < line.length) sfx('talk', { vol: 0.5 });
        if (k >= line.length && !dlg.full) { dlg.full = true; lineDone(); }
      }
    }
    if (enh && enh.resT > 0) enh.resT -= dt;
    if (dirty.ext) { dirty.ext = 0; if (shop) renderShop(); if (enh) renderEnh(enh.resT > 0 ? enh.res : null); }
  };
  // returns true when the key was consumed by a dialog / modal
  X.key2 = function (code) {
    const m = topModal();
    if (m) {
      if (code === 'Escape') { const b = $('[data-esc]', m) || $('[data-act="mclose"]', m); if (b) b.click(); }
      else if (code === 'Enter' || code === 'Space') { const b = $('[data-primary]', m); if (b && !b.classList.contains('off')) b.click(); }
      return true;
    }
    if (dlg) {
      const d = $('#dlg'), btns = d.querySelectorAll('.opt .btn');
      if (code === 'Escape') closeDlg();
      else if (code === 'Space' || code === 'Enter' || code === 'KeyZ') { if (dlg.full && dlg.li >= dlg.lines.length - 1) { if (btns.length) btns[0].click(); } else dnext(); }
      else if (/^Digit[1-9]$/.test(code)) { const b = btns[+code[5] - 1]; if (b && dlg.full) b.click(); }
      return true;
    }
    return false;
  };
})();
