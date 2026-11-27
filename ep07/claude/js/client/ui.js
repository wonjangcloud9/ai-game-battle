/* 해돌전쟁 — 화면 UI: 메뉴, 상단 바, 선택 패널, 명령 카드, 도움말, 결과 */
'use strict';
(function (g0) {
  var R = g0.RTS, S = R.Sprites;
  var UI = R.UI = {};
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }

  UI.opt = { faction: 'forge', enemy: 'random', count: 1, level: 1, size: 'medium' };
  try {
    var saved = JSON.parse(localStorage.getItem('haedol.opt') || 'null');
    if (saved && R.FACTIONS[saved.faction]) for (var k0 in UI.opt) if (saved[k0] !== undefined) UI.opt[k0] = saved[k0];
  } catch (e) { /* 무시 */ }

  // 캐시된 아이콘을 DOM에 넣을 수 있는 새 캔버스로 복사
  function iconEl(kind, id, color, px) {
    var src = S.icon(kind, id, color || 0, px), c = document.createElement('canvas');
    c.width = src.c.width; c.height = src.c.height; c.style.width = px + 'px'; c.style.height = px + 'px';
    c.getContext('2d').drawImage(src.c, 0, 0);
    return c;
  }
  UI.iconEl = iconEl;

  function setAccent(fid) {
    document.documentElement.style.setProperty('--accent', R.FACTIONS[fid] ? R.FACTIONS[fid].ui.accent : '#ffd23f');
  }

  /* ═════════ 메인 메뉴 ═════════ */
  function drawPreview(cv, fid) {
    var f = R.FACTIONS[fid], dpr = Math.min(2, g0.devicePixelRatio || 1), w = 340, h = 150;
    cv.width = w * dpr; cv.height = h * dpr;
    var g = cv.getContext('2d');
    g.scale(dpr, dpr);
    var bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#3a5a3a'); bg.addColorStop(1, '#27402b');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (var i = 0; i < 26; i++) { g.beginPath(); g.arc((i * 71) % w, (i * 37) % h, 10 + (i % 5) * 6, 0, 6.3); g.fill(); }
    var sh = S.shadow();
    function bld(type, x, y, k) {
      var sp = S.building(type, 0), s = R.BUILDINGS[type].size * R.TILE * k;
      g.globalAlpha = 0.5; g.drawImage(sh.c, x - s * 0.62 + 4, y - s * 0.45 + 6, s * 1.24, s); g.globalAlpha = 1;
      g.drawImage(sp.c, x - sp.s * k / 2, y - sp.s * k / 2, sp.s * k, sp.s * k);
      if (S.buildingOverlay[type]) { g.save(); g.translate(x, y); g.scale(k, k); S.buildingOverlay[type](g, 0.6, S.teamColors(0), {}); g.restore(); }
      if (S.buildingDraw[type + '_head']) { var hp = S.building(type, 0, 'head'); g.save(); g.translate(x, y); g.rotate(0.5); g.drawImage(hp.c, -hp.s * k / 2, -hp.s * k / 2, hp.s * k, hp.s * k); g.restore(); }
    }
    function unit(type, x, y, k, ang) {
      var sp = S.unit(type, 0, 0, 0), r = R.UNITS[type].r * k;
      g.globalAlpha = 0.6; g.drawImage(sh.c, x - r * 1.3 + 2, y - r * 0.7 + 3, r * 2.6, r * 1.5); g.globalAlpha = 1;
      g.save(); g.translate(x, y); g.rotate(ang); g.scale(k, k);
      g.drawImage(sp.c, -sp.s / 2, -sp.s / 2, sp.s, sp.s);
      if (S.unitOverlay[type]) S.unitOverlay[type](g, 0.3);
      g.restore();
      if (S.unitDraw[type + '_turret']) { var tp = S.unit(type, 0, 0, 0, 'turret'); g.save(); g.translate(x, y); g.rotate(ang + 0.3); g.scale(k, k); g.drawImage(tp.c, -tp.s / 2, -tp.s / 2, tp.s, tp.s); g.restore(); }
    }
    bld(f.hq, 66, 74, 0.92);
    bld(f.tower, 150, 36, 0.8);
    var us = [f.worker].concat(Object.keys(f.army));
    var pos = [[144, 104], [190, 70], [196, 118], [240, 92], [286, 54], [296, 116]];
    for (i = 0; i < us.length && i < pos.length; i++) unit(us[i], pos[i][0], pos[i][1], 1.5, 0.35);
  }

  function seg(parent, label, key, items) {
    var box = el('div', 'opt'), sg = el('div', 'seg');
    box.appendChild(el('span', '', label));
    items.forEach(function (it) {
      var b = el('button', UI.opt[key] === it[0] ? 'on' : '', it[1]);
      if (it[2]) b.title = it[2];
      b.onclick = function () {
        UI.opt[key] = it[0];
        Array.prototype.forEach.call(sg.children, function (c) { c.className = ''; });
        b.className = 'on';
        R.Audio.resume(); R.Audio.play('click');
        saveOpt();
      };
      sg.appendChild(b);
    });
    box.appendChild(sg); parent.appendChild(box);
  }
  function saveOpt() { try { localStorage.setItem('haedol.opt', JSON.stringify(UI.opt)); } catch (e) { /* 무시 */ } }

  UI.initMenu = function () {
    var wrap = $('factions');
    wrap.innerHTML = '';
    R.FACTION_IDS.forEach(function (fid) {
      var f = R.FACTIONS[fid], card = el('div', 'fcard' + (UI.opt.faction === fid ? ' sel' : ''));
      card.style.setProperty('--fc', f.ui.accent);
      var cv = document.createElement('canvas');
      card.appendChild(cv);
      drawPreview(cv, fid);
      card.appendChild(el('h2', '', f.name + '<span class="en">' + f.en + '</span>'));
      card.appendChild(el('p', 'motto', '“' + f.motto + '” — ' + f.style));
      var st = el('div', 'stars');
      for (var key in f.stars) st.appendChild(el('span', '', key + ' <b>' + '●'.repeat(f.stars[key]) + '<span style="opacity:.25">' + '●'.repeat(5 - f.stars[key]) + '</span></b>'));
      card.appendChild(st);
      var ul = el('ul');
      f.traits.forEach(function (t) { ul.appendChild(el('li', '', t)); });
      card.appendChild(ul);
      card.onclick = function () {
        UI.opt.faction = fid; setAccent(fid); saveOpt();
        Array.prototype.forEach.call(wrap.children, function (c) { c.classList.remove('sel'); });
        card.classList.add('sel');
        R.Audio.resume(); R.Audio.play('sel_' + fid); R.Audio.music('menu');
      };
      wrap.appendChild(card);
    });
    setAccent(UI.opt.faction);
    var o = $('options');
    o.innerHTML = '';
    seg(o, '상대 진영', 'enemy', [['random', '무작위'], ['forge', '무쇠 공방'], ['sprout', '새순 일족'], ['storm', '번개 유랑단']]);
    seg(o, '상대 수', 'count', [[1, '1', '1 대 1'], [2, '2', '셋이 서로 싸우는 난투'], [3, '3', '넷이 서로 싸우는 난투']]);
    seg(o, '난이도', 'level', R.DIFFICULTY.map(function (d) { return [d.id, d.name, d.desc]; }));
    seg(o, '맵 크기', 'size', [['small', '작게', '빠른 한 판'], ['medium', '보통'], ['large', '크게', '확장과 긴 싸움']]);
    $('btn-start').onclick = function () { R.Audio.resume(); R.Audio.play('click'); R.Main.startFromMenu(false); };
    $('btn-watch').onclick = function () { R.Audio.resume(); R.Audio.play('click'); R.Main.startFromMenu(true); };
    $('btn-help').onclick = function () { R.Audio.resume(); R.Audio.play('click'); UI.showHelp(); };
    // 상단 바 아이콘
    Array.prototype.forEach.call(document.querySelectorAll('.ico[data-ico]'), function (sp) {
      var id = sp.getAttribute('data-ico');
      sp.innerHTML = '';
      sp.appendChild(iconEl(id === 'idle' || id === 'army' ? 'cmd' : 'res', id, 0, 24));
    });
    $('btn-menu').onclick = function () { R.Audio.play('click'); R.Main.togglePause(); };
    $('btn-idle').onclick = function () { R.Input.idleWorker(R.game, false); };
    $('btn-army').onclick = function () { R.Input.selectArmy(R.game); };
    $('btn-speed').onclick = function () { R.Main.cycleSpeed(); };
    // 진영 기술 버튼
    var pe = $('power');
    pe.onmousedown = function (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.button === 0 && R.game) R.Input.powerMode(R.game); };
    pe.onmouseenter = function () { tipBtn = powerTip; showTip(powerTip); };
    pe.onmouseleave = function () { if (tipBtn === powerTip) { tipBtn = null; $('tooltip').classList.add('hidden'); } };
  };

  UI.showMenu = function (show) { $('menu').classList.toggle('hidden', !show); if (show) setAccent(UI.opt.faction); };
  UI.showHud = function (show) { $('hud').classList.toggle('hidden', !show); };

  /* ═════════ 도움말 ═════════ */
  UI.showHelp = function () {
    var h = $('help-inner');
    h.innerHTML = '<h2>조작법</h2>' +
      '<div class="helpgrid">' +
      '<h4>고르기</h4>' +
      '<div><span>유닛·건물 고르기</span><span>왼쪽 클릭</span></div><div><span>여럿 고르기</span><span>왼쪽 드래그</span></div>' +
      '<div><span>같은 종류 모두 고르기</span><span>더블 클릭</span></div><div><span>골라 더하기 / 빼기</span><span><kbd>Shift</kbd> + 클릭</span></div>' +
      '<div><span>쉬는 일꾼</span><span><kbd>`</kbd> 또는 <kbd>F1</kbd></span></div><div><span>전투 유닛 전부</span><span><kbd>F2</kbd> 또는 <kbd>Ctrl</kbd>+<kbd>A</kbd></span></div>' +
      '<div><span>부대 지정 / 부르기</span><span><kbd>Ctrl</kbd>+<kbd>1~9</kbd> / <kbd>1~9</kbd></span></div><div><span>부대로 화면 이동</span><span>숫자 두 번 (화면의 번호표도 됨)</span></div>' +
      '<h4>명령</h4>' +
      '<div><span>이동 · 공격 · 채집 · 수리</span><span>오른쪽 클릭</span></div><div><span>공격 이동</span><span><kbd>A</kbd> 누르고 왼쪽 클릭</span></div>' +
      '<div><span>정지 / 자리 지키기</span><span><kbd>S</kbd> / <kbd>H</kbd></span></div><div><span>명령 이어 붙이기</span><span><kbd>Shift</kbd> (또는 <kbd>Alt</kbd>) + 명령</span></div>' +
      '<div><span>건설 메뉴 (일꾼)</span><span><kbd>B</kbd> → <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd><kbd>A</kbd><kbd>S</kbd></span></div><div><span>생산 · 연구 (건물)</span><span><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd><kbd>T</kbd></span></div>' +
      '<div><span>집결 지점 (건물 고른 뒤)</span><span>오른쪽 클릭</span></div><div><span>취소 · 선택 해제</span><span><kbd>X</kbd> 또는 <kbd>Esc</kbd></span></div>' +
      '<div><span>진영 기술 (연구 건물 필요)</span><span><kbd>F</kbd> 누르고 왼쪽 클릭</span></div><div><span>가까운 일꾼으로 바로 건설</span><span>아무 때나 <kbd>B</kbd></span></div>' +
      '<h4>화면</h4>' +
      '<div><span>화면 이동</span><span>방향키 · 화면 가장자리 · 휠 버튼 드래그</span></div><div><span>확대 / 축소</span><span>마우스 휠</span></div>' +
      '<div><span>미니맵</span><span>왼쪽: 화면 이동 · 오른쪽: 명령</span></div><div><span>마지막 경보 지점으로</span><span><kbd>Space</kbd></span></div>' +
      '<div><span>본진으로</span><span><kbd>Home</kbd> 또는 <kbd>Backspace</kbd></span></div><div><span>일시 정지 / 메뉴</span><span><kbd>P</kbd> / <kbd>Esc</kbd></span></div>' +
      '<h4>이기는 법</h4>' +
      '<div style="grid-column:1/-1;display:block;color:#c3cad6">일꾼으로 <b style="color:#ffd23f">해돌</b>과 <b style="color:#58e6da">달이슬</b>을 모으고, 보급 건물로 인구 한도를 늘리고, 생산 건물에서 군대를 뽑아 상대의 <b>모든 건물</b>을 부수면 승리합니다. 내 건물이 전부 부서지면 패배합니다.<br>연구 건물을 지으면 <b>진영 기술</b>(<kbd>F</kbd>)이 열리고, 적을 여럿 잡은 유닛은 <b style="color:#ffd84a">진급</b>해 더 세고 단단해집니다. 미니맵의 <b>?</b> 는 아직 찾지 못한 상대 본진입니다.</div>' +
      '</div><div class="row"><button class="big primary" id="help-close">알겠어요</button></div>';
    $('help').classList.remove('hidden');
    $('help-close').onclick = function () { R.Audio.play('click'); $('help').classList.add('hidden'); };
  };

  /* ═════════ 일시 정지 / 설정 ═════════ */
  UI.showPause = function (G, show) {
    $('pause').classList.toggle('hidden', !show);
    if (!show) return;
    var p = $('pause-inner'), A = R.Audio;
    p.innerHTML = '<h2>잠시 멈춤</h2><div class="col">' +
      '<button class="big primary" id="p-resume">계속하기</button>' +
      '<button class="big" id="p-help">조작법</button>' +
      '<label class="slider"><span>효과음</span><input type="range" id="p-sfx" min="0" max="100" value="' + Math.round(A.sfxVol * 100) + '"></label>' +
      '<label class="slider"><span>배경 음악</span><input type="range" id="p-mus" min="0" max="100" value="' + Math.round(A.musicVol * 100) + '"></label>' +
      '<label class="check"><input type="checkbox" id="p-edge"' + (R.Input.edgeScroll ? ' checked' : '') + '><span>마우스를 화면 가장자리에 대면 화면 이동</span></label>' +
      '<button class="big" id="p-full">전체 화면 켜기/끄기</button>' +
      '<button class="big" id="p-restart">같은 설정으로 다시 시작</button>' +
      '<button class="big" id="p-quit">메인 메뉴로</button></div>';
    $('p-resume').onclick = function () { A.play('click'); R.Main.togglePause(); };
    $('p-help').onclick = function () { A.play('click'); UI.showHelp(); };
    $('p-sfx').oninput = function () { A.setVolumes(this.value / 100, undefined); A.play('click'); };
    $('p-mus').oninput = function () { A.setVolumes(undefined, this.value / 100); };
    $('p-edge').onchange = function () { R.Input.setEdgeScroll(this.checked); };
    $('p-full').onclick = function () {
      var d = document, de = d.documentElement;
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else (de.requestFullscreen || de.webkitRequestFullscreen || function () {}).call(de);
    };
    $('p-restart').onclick = function () { A.play('click'); R.Main.restart(); };
    $('p-quit').onclick = function () { A.play('click'); R.Main.toMenu(); };
  };

  /* ═════════ 결과 ═════════ */
  UI.showResult = function (G, kind) {
    var W = G.world, r = $('result-inner');
    var title = kind === 'win' ? '<h2 class="win">승리!</h2><p class="sub">상대의 기지를 모두 무너뜨렸습니다.</p>'
      : (kind === 'lose' ? '<h2 class="lose">패배…</h2><p class="sub">아군 건물이 모두 파괴되었습니다.</p>'
        : '<h2 class="win">경기 종료</h2><p class="sub">' + (W.winner >= 0 ? W.teams[W.winner].name + ' 승리' : '무승부') + '</p>');
    var rows = W.teams.map(function (t) {
      var c = R.TEAM_COLORS[t.color].main;
      return '<tr class="' + (t.id === G.human ? 'me' : '') + '"><td><span class="sw" style="background:' + c + '"></span>' + t.name + (t.isAI ? ' <small style="color:#97a1b3">(' + t.fdef.name + ' · ' + R.DIFFICULTY[t.level].name + ')</small>' : ' <small style="color:#97a1b3">(' + t.fdef.name + ')</small>') + '</td>' +
        '<td>' + Math.floor(t.stats.sun + t.stats.dew) + '</td><td>' + t.stats.produced + '</td><td>' + t.stats.kills + '</td><td>' + t.stats.lostUnits + '</td><td>' + t.stats.razed + '</td><td>' + t.stats.lostBuildings + '</td><td>' + (t.stats.powers || 0) + '</td></tr>';
    }).join('');
    r.innerHTML = title + '<p class="sub">경기 시간 ' + R.fmtTime(W.time) + '</p>' +
      '<table class="stats"><tr><th>세력</th><th>모은 자원</th><th>생산</th><th>처치</th><th>잃은 유닛</th><th>부순 건물</th><th>잃은 건물</th><th>진영 기술</th></tr>' + rows + '</table>' +
      '<div class="row"><button class="big primary" id="r-again">다시 하기</button><button class="big" id="r-menu">메인 메뉴</button>' + (W.over ? '' : '<button class="big" id="r-watch">남은 싸움 지켜보기</button>') + '</div>';
    $('result').classList.remove('hidden');
    $('r-again').onclick = function () { R.Audio.play('click'); $('result').classList.add('hidden'); R.Main.restart(); };
    $('r-menu').onclick = function () { R.Audio.play('click'); $('result').classList.add('hidden'); R.Main.toMenu(); };
    if ($('r-watch')) $('r-watch').onclick = function () { R.Audio.play('click'); $('result').classList.add('hidden'); R.Main.spectateRest(); };
  };
  UI.hideOverlays = function () { ['pause', 'help', 'result', 'loading'].forEach(function (id) { $(id).classList.add('hidden'); }); };

  /* ═════════ 알림 글 ═════════ */
  var lastMsg = '', lastMsgT = 0;
  UI.msg = function (text, cls) {
    var now = Date.now();
    if (text === lastMsg && now - lastMsgT < 1800) return;
    lastMsg = text; lastMsgT = now;
    var box = $('msgs'), m = el('div', 'msg ' + (cls || ''), text);
    box.appendChild(m);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { m.classList.add('fade'); }, 2600);
    setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 3300);
  };
  UI.flashRes = function (code) {
    var id = code === 'sun' ? 'res-sun' : (code === 'dew' ? 'res-dew' : 'res-sup'), e = $(id);
    e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash');
  };
  UI.error = function (G, err) {
    UI.msg(R.errText(err, G.world.teams[G.human]), 'err');
    if (err.code === 'sun' || err.code === 'dew' || err.code === 'supply' || err.code === 'maxsupply') UI.flashRes(err.code === 'maxsupply' ? 'supply' : err.code);
    R.Audio.play('error');
  };

  /* ═════════ 명령 카드 ═════════ */
  function costHtml(team, cost, supply, time) {
    var h = '<div class="cost">';
    h += '<span class="' + (team.res.sun < cost.sun ? 'lack' : '') + '"><i class="ico" data-r="sun"></i>' + cost.sun + '</span>';
    if (cost.dew) h += '<span class="' + (team.res.dew < cost.dew ? 'lack' : '') + '"><i class="ico" data-r="dew"></i>' + cost.dew + '</span>';
    if (supply) h += '<span class="' + (team.supplyUsed + supply > team.supplyCap ? 'lack' : '') + '"><i class="ico" data-r="supply"></i>' + supply + '</span>';
    if (time) h += '<span>⏱ ' + time + '초</span>';
    return h + '</div>';
  }
  function weaponText(w) {
    if (!w) return '';
    var s = '공격 ' + w.dmg + (w.chain ? ' (연쇄 ' + w.chain + ')' : '') + ' · 간격 ' + w.cd + '초 · 사거리 ' + (w.kind === 'melee' ? '근접' : w.range) + (w.min ? ' (최소 ' + w.min + ')' : '');
    s += ' · ' + (w.ground && w.air ? '지상·공중' : (w.air ? '공중' : '지상만'));
    if (w.splash) s += ' · 범위 피해';
    if (w.bonus) for (var k in w.bonus) s += ' · ' + ({ structure: '건물', heavy: '중장갑', light: '경장갑' })[k] + ' ×' + w.bonus[k];
    return s;
  }
  function unitTip(G, def, key) {
    var team = G.world.teams[G.human], req = G.world.hasReq(team, def);
    return '<h4><span>' + def.name + ' <span class="role">' + def.role + '</span></span><kbd>' + key + '</kbd></h4>' + costHtml(team, def.cost, def.supply, def.time) +
      '<div>' + def.desc + '</div><div class="stat">체력 ' + def.hp + ' · 장갑 ' + def.armor + (def.atype === 'heavy' ? ' (중장갑)' : '') + ' · 속도 ' + def.speed + (def.layer === 'air' ? ' · 비행' : (def.layer === 'hover' ? ' · 물 위 이동' : '')) + (def.regen ? ' · 재생' : '') + (def.charge ? ' · 축전 ×' + def.charge.mult : '') + '</div>' +
      '<div class="stat">' + weaponText(def.weapon) + '</div>' + (req ? '<div class="req">먼저 ' + R.josa(R.BUILDINGS[req].name, '이', '가') + ' 필요합니다</div>' : '');
  }
  function bldTip(G, def, key) {
    var team = G.world.teams[G.human], req = G.world.hasReq(team, def);
    var extra = '';
    if (def.provides) extra += '<div class="stat">보급 한도 +' + def.provides + '</div>';
    if (def.produces) extra += '<div class="stat">생산: ' + def.produces.map(function (u) { return R.UNITS[u].name; }).join(', ') + '</div>';
    if (def.weapon) extra += '<div class="stat">' + weaponText(def.weapon) + '</div>';
    return '<h4><span>' + def.name + ' <span class="role">' + def.role + '</span></span><kbd>' + key + '</kbd></h4>' + costHtml(team, def.cost, 0, def.time) +
      '<div>' + def.desc + '</div><div class="stat">체력 ' + def.hp + ' · 장갑 ' + def.armor + ' · 크기 ' + def.size + '×' + def.size + '</div>' + extra +
      (req ? '<div class="req">먼저 ' + R.josa(R.BUILDINGS[req].name, '이', '가') + ' 필요합니다</div>' : '');
  }
  function simpleTip(title, key, desc) { return '<h4><span>' + title + '</span><kbd>' + key + '</kbd></h4><div>' + desc + '</div>'; }

  var BUILD_KEYS = ['Q', 'W', 'E', 'R', 'A', 'S'];
  var ROW_KEYS = ['Q', 'W', 'E', 'R', 'T'];

  UI.getCard = function (G) {
    var out = [];
    if (!G || G.human < 0 || G.ended) return out;
    var W = G.world, team = W.teams[G.human], sel = [], i;
    for (i = 0; i < G.selection.length; i++) { var e = W.byId.get(G.selection[i]); if (e && !e.dead) sel.push(e); }
    if (!sel.length || sel[0].team !== G.human) return out;
    var first = sel[0], ids = G.selection;
    if (first.kind === 'unit') {
      var anyWorker = false, forgeWorker = false;
      for (i = 0; i < sel.length; i++) if (sel[i].def.worker) { anyWorker = true; if (sel[i].def.worker.repair) forgeWorker = true; }
      if (G.card === 'build' && anyWorker) {
        team.fdef.buildings.forEach(function (bid, n) {
          var def = R.BUILDINGS[bid];
          out.push({
            slot: n, key: BUILD_KEYS[n], code: 'Key' + BUILD_KEYS[n], icon: ['building', bid],
            tip: function () { return bldTip(G, def, BUILD_KEYS[n]); },
            off: function () { return !!W.hasReq(team, def) || !!W.canAfford(team, def.cost); },
            on: function () { return G.mode && G.mode.type === 'place' && G.mode.btype === bid; },
            action: function () {
              var req = W.hasReq(team, def);
              if (req) return UI.error(G, { code: 'req', what: req });
              var lack = W.canAfford(team, def.cost);
              if (lack) return UI.error(G, { code: lack });
              R.Input.setMode(G, { type: 'place', btype: bid });
              R.Audio.play('click');
            }
          });
        });
        out.push({ slot: 11, key: 'Esc', code: 'Escape', icon: ['cmd', 'back'], tip: function () { return simpleTip('뒤로', 'Esc', '기본 명령으로 돌아갑니다.'); }, action: function () { G.card = 'main'; R.Input.setMode(G, null); R.Audio.play('click'); } });
        return out;
      }
      out.push({ slot: 0, key: 'A', code: 'KeyA', icon: ['cmd', 'attack'], tip: function () { return simpleTip('공격', 'A', '땅을 찍으면 가는 길의 적과 싸우며 이동하고, 적을 찍으면 그 적을 공격합니다.'); }, on: function () { return G.mode && G.mode.type === 'target' && G.mode.cmd === 'attack'; }, action: function () { R.Input.setMode(G, { type: 'target', cmd: 'attack' }); R.Audio.play('click'); } });
      out.push({ slot: 1, key: 'S', code: 'KeyS', icon: ['cmd', 'stop'], tip: function () { return simpleTip('정지', 'S', '하던 일을 멈춥니다.'); }, action: function () { R.Cmd.stop(W, G.human, ids); R.Audio.play('click'); } });
      out.push({ slot: 2, key: 'H', code: 'KeyH', icon: ['cmd', 'hold'], tip: function () { return simpleTip('자리 지키기', 'H', '움직이지 않고 사거리 안의 적만 공격합니다.'); }, action: function () { R.Cmd.hold(W, G.human, ids); R.Audio.play('click'); } });
      if (anyWorker) out.push({ slot: 4, key: 'B', code: 'KeyB', icon: ['cmd', 'build'], tip: function () { return simpleTip('건설', 'B', '지을 건물을 고릅니다. ' + ({ stay: '땜장이가 붙어 있어야 지어지고, 여럿이 붙으면 빨라집니다.', seed: '씨앗만 심으면 저절로 자랍니다.', remote: '멀리서 내려 세울 수 있고 저절로 완성됩니다.' })[team.fdef.buildStyle]); }, action: function () { G.card = 'build'; R.Audio.play('click'); } });
      if (forgeWorker) out.push({ slot: 5, key: 'R', code: 'KeyR', icon: ['cmd', 'repair'], tip: function () { return simpleTip('수리', 'R', '상한 건물이나 기계 유닛을 찍으면 고칩니다. (오른쪽 클릭으로도 됩니다)'); }, on: function () { return G.mode && G.mode.type === 'target' && G.mode.cmd === 'repair'; }, action: function () { R.Input.setMode(G, { type: 'target', cmd: 'repair' }); R.Audio.play('click'); } });
      return out;
    }
    if (first.kind === 'building') {
      var same = sel.filter(function (b) { return b.kind === 'building' && b.type === first.type && b.built; });
      if (!first.built) {
        out.push({ slot: 11, key: 'X', code: 'KeyX', icon: ['cmd', 'cancel'], tip: function () { return simpleTip('건설 취소', 'X', '공사를 그만두고 비용의 75%를 돌려받습니다.'); }, action: function () { if (R.Cmd.cancelBuilding(W, G.human, first.id)) { R.Audio.play('click'); R.Input.prune(G); } } });
        return out;
      }
      (first.def.produces || []).forEach(function (uid, n) {
        var def = R.UNITS[uid];
        out.push({
          slot: n, key: ROW_KEYS[n], code: 'Key' + ROW_KEYS[n], icon: ['unit', uid],
          tip: function () { return unitTip(G, def, ROW_KEYS[n]); },
          off: function () { return !!W.hasReq(team, def) || !!W.canAfford(team, def.cost) || team.supplyUsed + def.supply > team.supplyCap; },
          action: function () {
            // 같은 건물을 여럿 골랐으면 대기열이 가장 짧은 곳에 넣는다
            var best = null;
            same.forEach(function (b) { if (!b.dead && (!best || b.queue.length < best.queue.length)) best = b; });
            if (!best) return;
            var r = R.Cmd.train(W, G.human, best.id, uid);
            if (r.err) UI.error(G, r.err); else R.Audio.play('click');
          }
        });
      });
      (first.def.researches || []).forEach(function (rid, n) {
        var up = R.UPGRADES[rid];
        out.push({
          slot: n, key: ROW_KEYS[n], code: 'Key' + ROW_KEYS[n], icon: ['upgrade', rid],
          tip: function () {
            var st = team.done[rid] ? '<div class="stat" style="color:#7dff6a">연구 완료</div>' : (team.researching[rid] ? '<div class="stat" style="color:#ffd23f">연구 중…</div>' : '');
            var rq = (up.requiresUpg && !team.done[up.requiresUpg]) ? '<div class="req">먼저 ' + R.josa(R.UPGRADES[up.requiresUpg].name, '을', '를') + ' 연구해야 합니다</div>' : '';
            return '<h4><span>' + up.name + ' <span class="role">연구</span></span><kbd>' + ROW_KEYS[n] + '</kbd></h4>' + costHtml(team, up.cost, 0, up.time) + '<div>' + up.desc + '</div>' + st + rq;
          },
          off: function () { return !!team.done[rid] || !!team.researching[rid] || (up.requiresUpg && !team.done[up.requiresUpg]) || !!W.canAfford(team, up.cost); },
          cnt: function () { return team.done[rid] ? '✔' : (team.researching[rid] ? '…' : ''); },
          action: function () {
            var r = R.Cmd.research(W, G.human, first.id, rid);
            if (r.err) UI.error(G, r.err); else R.Audio.play('click');
          }
        });
      });
      if (first.def.produces || first.def.researches) {
        out.push({
          slot: 11, key: 'X', code: 'KeyX', icon: ['cmd', 'cancel'], tip: function () { return simpleTip('생산 취소', 'X', '맨 뒤 대기 항목을 취소하고 비용을 모두 돌려받습니다.'); },
          off: function () { return !same.some(function (b) { return b.queue.length > 0; }); },
          action: function () {
            var best = null;
            same.forEach(function (b) { if (b.queue.length && (!best || b.queue.length > best.queue.length)) best = b; });
            if (best && R.Cmd.cancelQueue(W, G.human, best.id)) R.Audio.play('click');
          }
        });
      }
    }
    return out;
  };

  var cardSig = '', cardBtns = [], tipBtn = null;
  function rebuildCard(G, defs) {
    var card = $('card');
    card.innerHTML = '';
    cardBtns = [];
    var bySlot = {};
    defs.forEach(function (d) { bySlot[d.slot] = d; });
    for (var s = 0; s < 12; s++) {
      var d = bySlot[s];
      if (!d) { card.appendChild(el('div', 'cbtn empty')); continue; }
      var b = el('button', 'cbtn');
      b.appendChild(iconEl(d.icon[0], d.icon[1], G.world.teams[G.human].color, 44));
      b.appendChild(el('span', 'key', d.key));
      var cnt = el('span', 'cnt', ''); b.appendChild(cnt);
      (function (d2, b2) {
        b2.onmousedown = function (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.button === 0) d2.action(ev.shiftKey); };
        b2.onmouseenter = function () { tipBtn = d2; showTip(d2); };
        b2.onmouseleave = function () { if (tipBtn === d2) { tipBtn = null; $('tooltip').classList.add('hidden'); } };
      })(d, b);
      card.appendChild(b);
      cardBtns.push({ def: d, el: b, cnt: cnt });
    }
    tipBtn = null; $('tooltip').classList.add('hidden');
  }
  function showTip(d) {
    var t = $('tooltip');
    t.innerHTML = d.tip();
    Array.prototype.forEach.call(t.querySelectorAll('i.ico[data-r]'), function (i) { i.appendChild(iconEl('res', i.getAttribute('data-r'), 0, 18)); });
    t.classList.remove('hidden');
  }
  UI.hotkey = function (G, code, shift) {
    var defs = UI.getCard(G);
    for (var i = 0; i < defs.length; i++) if (defs[i].code === code) { defs[i].action(shift); return true; }
    return false;
  };

  /* ═════════ 선택 패널 ═════════ */
  var selSig = '', live = [];
  function statsLine(pairs) { return '<div class="stats">' + pairs.map(function (p) { return '<span>' + p[0] + ' <b>' + p[1] + '</b></span>'; }).join('') + '</div>'; }

  function rebuildSel(G, sel) {
    var W = G.world, p = $('selpanel');
    p.innerHTML = ''; live = [];
    if (!sel.length) {
      if (G.human >= 0) p.appendChild(el('div', 'hint', '유닛이나 건물을 <b>왼쪽 클릭</b>으로 고르고, <b>오른쪽 클릭</b>으로 명령을 내리세요.<br><kbd style="background:#2a3242;padding:0 5px;border-radius:4px">B</kbd> 를 누르면 가까운 일꾼으로 건물을 지을 수 있습니다.'));
      else p.appendChild(el('div', 'hint', '관전 중입니다. 방향키나 미니맵으로 화면을 옮기고, 유닛을 클릭해 살펴보세요.'));
      return;
    }
    if (sel.length === 1) {
      var e = sel[0], def = e.def, team = e.team >= 0 ? W.teams[e.team] : null;
      var por = el('div', 'portrait'), frame = el('div', 'frame');
      frame.appendChild(iconEl(e.kind === 'node' ? 'node' : e.kind, e.type, team ? team.color : 0, 72));
      por.appendChild(frame);
      var info = el('div', 'info');
      if (e.kind === 'node') {
        info.appendChild(el('h3', '', def.name));
        info.appendChild(el('div', 'desc', R.RES[def.res].desc));
        var amt = el('div', 'stats'); info.appendChild(amt);
        live.push(function () { amt.innerHTML = '<span>남은 양 <b>' + Math.max(0, Math.ceil(e.amount)) + '</b></span><span>캐는 중 <b>' + e.miners.length + '</b></span>'; });
        p.appendChild(por); p.appendChild(info);
        return;
      }
      var hb = el('div', 'hpbar'), hf = el('i'); hb.appendChild(hf); por.appendChild(hb);
      var ht = el('div', 'hptxt'); por.appendChild(ht);
      live.push(function () {
        // 안개 속의 적 건물은 지금 상태를 알 수 없다
        if (e.team !== G.human && G.human >= 0 && !W.isVisible(G.human, e)) { hf.style.width = '100%'; hf.style.background = '#4a566c'; ht.textContent = '시야 밖'; return; }
        var k = Math.max(0, e.hp / e.maxHp);
        hf.style.width = (k * 100) + '%'; hf.style.background = k > 0.6 ? '#5fe05a' : (k > 0.3 ? '#ffd23f' : '#ff4a3a');
        ht.textContent = Math.ceil(Math.max(0, e.hp)) + ' / ' + Math.round(e.maxHp);
      });
      info.appendChild(el('h3', '', def.name + ' <small>' + def.role + '</small>'));
      info.appendChild(el('div', 'owner', '<span style="color:' + R.TEAM_COLORS[team.color].main + '">■</span> ' + team.name + ' · ' + team.fdef.name));
      var mine = e.team === G.human;
      if (e.kind === 'unit') {
        var w = def.weapon, st = el('div'); info.appendChild(st);
        live.push(function () {
          var pairs = [];
          var bonus = Math.round(((1 + 0.15 * team.upg.atk) * (1 + R.RANKS.bonus * (e.rank || 0)) - 1) * 100);
          if (w) pairs.push(['공격', Math.round(w.dmg * (1 + bonus / 100) * 10) / 10 + (bonus ? ' (+' + bonus + '%)' : '')]);
          pairs.push(['장갑', def.armor + team.upg.def]);
          if (w) pairs.push(['사거리', w.kind === 'melee' ? '근접' : w.range]);
          pairs.push(['속도', Math.round(R.Units.speedOf(W, e) * 10) / 10]);
          if (e.kills) pairs.push(['처치', e.kills]);
          if (e.rank) pairs.push(['계급', '<span style="color:#ffd84a">' + '★'.repeat(e.rank) + '</span>']);
          else if (!def.worker && w) pairs.push(['진급까지', Math.max(0, R.RANKS.kills[0] - (e.kills || 0)) + '기']);
          if (def.charge) pairs.push(['축전', e.charge >= def.charge.time * (team.upg.spc ? 0.5 : 1) ? '준비됨' : '충전 중']);
          st.innerHTML = statsLine(pairs);
        });
        info.appendChild(el('div', 'desc', def.desc));
        if (mine) {
          var act = el('div', 'stats'); info.appendChild(act);
          live.push(function () {
            var o = e.order, txt = { idle: '대기', move: '이동', amove: '공격 이동', attack: '공격', guard: '교전', hold: '자리 지키기', gather: (o.rtype === 'dew' ? '달이슬' : '해돌') + ' 채집', build: '건설하러 가는 중', construct: '조립 중', repair: '수리 중' }[o.type] || '';
            if (e.carry) txt += ' · ' + R.RES[e.carry.res].name + ' ' + e.carry.n + ' 운반';
            if (e.queue.length) txt += ' · 예약 ' + e.queue.length;
            act.innerHTML = '<span>상태 <b>' + txt + '</b></span>';
          });
        }
      } else {
        if (!e.built) {
          var cw = el('div', 'queue'), qb = el('div', 'qbar build'), qf = el('i'), qt = el('span', 'hptxt');
          qb.appendChild(qf); cw.appendChild(el('span', '', '짓는 중')); cw.appendChild(qb); cw.appendChild(qt); info.appendChild(cw);
          live.push(function () {
            if (!mine && G.human >= 0 && !W.isVisible(G.human, e)) { qt.textContent = '시야 밖'; return; }
            qf.style.width = (e.progress * 100) + '%';
            qt.textContent = Math.floor(e.progress * 100) + '%' + (team.fdef.buildStyle === 'stay' ? (e.builders ? ' · 일꾼 ' + e.builders : (mine ? ' · 일꾼이 필요합니다!' : '')) : '');
          });
          info.appendChild(el('div', 'desc', def.desc));
        } else {
          info.appendChild(el('div', 'desc', def.desc));
          if (mine && (def.produces || def.researches)) {
            var qw = el('div', 'queue'), slots = [], bar = el('div', 'qbar'), bf = el('i'), warn = el('div', 'warn');
            for (var q = 0; q < 5; q++) { var qi = el('div', 'qitem empty'); slots.push(qi); qw.appendChild(qi); (function (idx) { qi.onmousedown = function (ev) { ev.preventDefault(); ev.stopPropagation(); if (e.queue[idx] && R.Cmd.cancelQueue(W, G.human, e.id, idx)) R.Audio.play('click'); }; })(q); }
            bar.appendChild(bf); qw.appendChild(bar);
            info.appendChild(qw); info.appendChild(warn);
            var qsig = '';
            live.push(function () {
              var sig = e.queue.map(function (it) { return it.id; }).join(',');
              if (sig !== qsig) {
                qsig = sig;
                for (var n = 0; n < 5; n++) {
                  slots[n].innerHTML = '';
                  var it = e.queue[n];
                  slots[n].className = 'qitem' + (it ? '' : ' empty');
                  if (it) { slots[n].appendChild(iconEl(it.kind, it.id, team.color, 36)); slots[n].title = '클릭하면 취소'; } else slots[n].title = '';
                }
              }
              bf.style.width = (e.queue.length ? e.queue[0].t / e.queue[0].total * 100 : 0) + '%';
              warn.textContent = e.blocked ? '보급이 부족해 생산이 멈췄습니다 — ' + R.josa(R.BUILDINGS[team.fdef.supply].name, '을', '를') + ' 지으세요' : (def.produces && !e.queue.length ? '' : '');
            });
            if (def.produces) info.appendChild(el('div', 'hptxt', '땅을 오른쪽 클릭하면 새 유닛이 모일 곳을 정합니다.'));
          } else if (def.weapon) {
            info.appendChild(el('div', 'stats', '<span>' + weaponText(def.weapon) + '</span>'));
          } else if (def.provides) info.appendChild(el('div', 'stats', '<span>보급 한도 <b>+' + def.provides + '</b></span>'));
        }
      }
      p.appendChild(por); p.appendChild(info);
      return;
    }
    // 여럿
    var box = el('div', 'multi'), max = 30;
    sel.slice(0, max).forEach(function (e2) {
      var it = el('div', 'mitem'), mh = el('div', 'mh'), mf = el('i');
      it.appendChild(iconEl(e2.kind === 'node' ? 'node' : e2.kind, e2.type, e2.team >= 0 ? W.teams[e2.team].color : 0, 38));
      mh.appendChild(mf); it.appendChild(mh);
      it.title = e2.def.name;
      it.onmousedown = function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (ev.shiftKey) R.Input.select(G, G.selection.filter(function (id) { return id !== e2.id; }));
        else R.Input.select(G, [e2.id]);
      };
      live.push(function () { var k = Math.max(0, e2.hp / e2.maxHp); mf.style.width = (k * 100) + '%'; mf.style.background = k > 0.6 ? '#5fe05a' : (k > 0.3 ? '#ffd23f' : '#ff4a3a'); });
      box.appendChild(it);
    });
    p.appendChild(box);
    if (sel.length > max) p.appendChild(el('div', 'more', '외 ' + (sel.length - max)));
  }

  /* ═════════ 길잡이 ═════════ */
  var guideSig = '';
  function updateGuide(G) {
    var gd = $('guide');
    if (G.human < 0 || G.guideOff) { gd.classList.add('hidden'); return; }
    var W = G.world, t = W.teams[G.human], f = t.fdef, workers = 0, army = 0;
    for (var i = 0; i < W.units.length; i++) { var u = W.units[i]; if (u.team === G.human && !u.dead) { if (u.def.worker) workers++; else army++; } }
    var steps = [
      [workers >= 9, '<b>' + R.BUILDINGS[f.hq].name + '</b>' + R.josa(R.BUILDINGS[f.hq].name, '을', '를').slice(-1) + ' 골라 <kbd>Q</kbd> 로 ' + f.fdefWorker + ' 더 뽑기 (9기)'],
      [(t.counts[f.supply] || 0) >= 1, '일꾼을 골라 <kbd>B</kbd> → <kbd>Q</kbd> : <b>' + R.BUILDINGS[f.supply].name + '</b> 짓기'],
      [(t.counts[f.prod1] || 0) >= 1, '<kbd>B</kbd> → <kbd>W</kbd> : <b>' + R.BUILDINGS[f.prod1].name + '</b> 짓기'],
      [army >= 6 || t.stats.razed > 0, R.BUILDINGS[f.prod1].name + '에서 병력 6기 모으기'],
      [t.stats.razed > 0, '<kbd>A</kbd> + 클릭으로 적 기지 공격! (미니맵의 <b>?</b> 쪽)'],
      [t.stats.powers > 0, '<kbd>B</kbd> → <kbd>A</kbd> : <b>' + R.BUILDINGS[f.tech].name + '</b> 짓고 진영 기술 <kbd>F</kbd> 써 보기']
    ];
    var sig = steps.map(function (s) { return s[0] ? 1 : 0; }).join('');
    if (sig === guideSig && !gd.classList.contains('hidden')) return;
    guideSig = sig;
    if (sig.indexOf('0') < 0) { G.guideOff = true; gd.classList.add('hidden'); return; }
    var now = sig.indexOf('0');
    gd.innerHTML = '<h3><span>길잡이</span><button id="guide-x" title="닫기">✕</button></h3><ol>' + steps.map(function (s, n) { return '<li class="' + (s[0] ? 'done' : (n === now ? 'now' : '')) + '">' + s[1] + '</li>'; }).join('') + '</ol>';
    gd.classList.remove('hidden');
    $('guide-x').onclick = function () { G.guideOff = true; gd.classList.add('hidden'); };
  }

  function updateScore(G) {
    var sb = $('scoreboard');
    if (G.human >= 0 && !G.showScore) { sb.classList.add('hidden'); return; }
    var W = G.world, h = '';
    W.teams.forEach(function (t) {
      var army = 0, workers = 0;
      for (var i = 0; i < W.units.length; i++) { var u = W.units[i]; if (u.team === t.id && !u.dead) { if (u.def.worker) workers++; else army++; } }
      h += '<div class="row' + (t.alive ? '' : ' out') + '"><span class="sw" style="background:' + R.TEAM_COLORS[t.color].main + '"></span><span class="nm">' + t.name + '</span><span>일꾼 ' + workers + '</span><span>군 ' + army + '</span><span>' + t.supplyUsed + '/' + t.supplyCap + '</span></div>';
    });
    sb.innerHTML = h;
    sb.classList.remove('hidden');
  }

  /* ═════════ 부대 번호 표시줄 ═════════ */
  var grpSig = '';
  function updateGroups(G) {
    var W = G.world, box = $('groups'), list = [], sig = '';
    for (var n = 1; n <= 9; n++) {
      var ids = G.groups[n];
      if (!ids || !ids.length) continue;
      var alive = 0, first = null;
      for (var i = 0; i < ids.length; i++) { var e = W.byId.get(ids[i]); if (e && !e.dead) { alive++; if (!first) first = e; } }
      if (!alive) continue;
      // 지금 고른 것이 이 부대와 같으면 강조한다
      var on = alive === G.selection.length && ids.every(function (id) { var x = W.byId.get(id); return !x || x.dead || G.selSet.has(id); });
      list.push({ n: n, count: alive, first: first, on: on });
      sig += n + ':' + alive + ':' + first.type + (on ? '*' : '') + ',';
    }
    if (sig === grpSig) return;
    grpSig = sig;
    box.innerHTML = '';
    list.forEach(function (g) {
      var b = el('button', 'grp' + (g.on ? ' on' : ''), '<b>' + g.n + '</b>');
      b.appendChild(iconEl(g.first.kind, g.first.type, W.teams[G.human].color, 22));
      b.appendChild(el('span', '', String(g.count)));
      b.title = g.n + '번 부대 (' + g.n + ' 키) — 두 번 누르면 화면 이동';
      b.onmousedown = function (ev) { ev.preventDefault(); ev.stopPropagation(); if (ev.button === 0) R.Input.pickGroup(G, g.n, ev.shiftKey); };
      box.appendChild(b);
    });
  }

  /* ═════════ 진영 기술 버튼 ═════════ */
  var pwSig = '', pwPrev = '';
  var powerTip = {
    tip: function () {
      var G = R.game;
      if (!G || G.human < 0) return '';
      var team = G.world.teams[G.human], p = R.Powers.of(team), err = R.Powers.check(G.world, team), rb = R.BUILDINGS[p.requires].name;
      return '<h4><span>' + p.name + ' <span class="role">진영 기술</span></span><kbd>F</kbd></h4><div>' + p.desc + '</div>' +
        '<div class="stat">범위 반지름 ' + p.radius + '칸 · 재사용 대기 ' + p.cooldown + '초 · 비용 없음</div>' +
        '<div class="stat">지금 보이는 곳에만 쓸 수 있습니다. ' + R.josa(rb, '이', '가') + ' 한 채라도 있어야 합니다.</div>' +
        (err && err.code === 'req' ? '<div class="req">먼저 ' + R.josa(rb, '을', '를') + ' 지으세요</div>' : '');
    }
  };
  function updatePower(G) {
    var pe = $('power');
    if (G.human < 0 || G.demo) { if (pwSig !== 'x') { pwSig = 'x'; pe.classList.add('hidden'); } return; }
    var W = G.world, team = W.teams[G.human], p = R.Powers.of(team), err = R.Powers.check(W, team);
    var state = !err ? 'ready' : (err.code === 'req' ? 'locked' : 'cool'), on = !!(G.mode && G.mode.cmd === 'power');
    var sig = team.faction + '|' + state + '|' + (on ? 1 : 0) + '|' + (err && err.left || 0);
    if (sig !== pwSig) {
      if (pwSig.split('|')[0] !== team.faction) {
        var pic = pe.querySelector('.pico');
        pic.innerHTML = ''; pic.appendChild(iconEl('cmd', p.id, 0, 30));
        $('pw-name').textContent = p.name;
      }
      pwSig = sig;
      pe.className = state + (on ? ' on' : '');
      $('pw-state').textContent = state === 'ready' ? (on ? '쓸 곳을 찍으세요 (취소: Esc)' : '준비됨') : (state === 'locked' ? R.BUILDINGS[p.requires].name + ' 필요' : '다시 쓰기까지 ' + err.left + '초');
    }
    $('pw-fill').style.width = state === 'cool' ? Math.max(0, Math.min(100, (1 - (team.powerAt - W.time) / p.cooldown) * 100)) + '%' : '0';
    // 쓸 수 있게 된 순간 알린다
    if (state === 'ready' && pwPrev && pwPrev !== 'ready' && !G.ended) { UI.msg('진영 기술 준비 완료 — ' + p.name + ' <kbd>F</kbd>', 'good'); R.Audio.play('pw_ready'); }
    pwPrev = state;
  }

  /* ═════════ 매 프레임 갱신 ═════════ */
  var lastTop = {}, frameNo = 0;
  function setText(id, v) { if (lastTop[id] !== v) { lastTop[id] = v; $(id).textContent = v; } }

  UI.update = function (G) {
    var W = G.world;
    frameNo++;
    setText('v-clock', R.fmtTime(W.time));
    var showRes = G.human >= 0;
    $('res-sun').style.visibility = $('res-dew').style.visibility = $('res-sup').style.visibility = showRes ? 'visible' : 'hidden';
    $('btn-idle').style.display = $('btn-army').style.display = showRes ? '' : 'none';
    if (showRes) {
      var team = W.teams[G.human];
      setText('v-sun', Math.floor(team.res.sun));
      setText('v-dew', Math.floor(team.res.dew));
      setText('v-sup', team.supplyUsed + '/' + team.supplyCap);
      var blocked = team.supplyCap < R.MAX_SUPPLY && team.supplyCap - team.supplyUsed <= 0;
      $('res-sup').classList.toggle('block', blocked);
      if (frameNo % 10 === 0) {
        var idle = 0;
        for (var i = 0; i < W.units.length; i++) { var u = W.units[i]; if (u.team === G.human && u.def.worker && u.order.type === 'idle' && !u.dead) idle++; }
        setText('v-idle', idle);
        $('btn-idle').classList.toggle('alert', idle > 0);
        updateGuide(G);
        updateGroups(G);
      }
    }
    if (frameNo % 20 === 0) updateScore(G);
    updatePower(G);

    // 선택 패널
    var sel = [], sig = '';
    for (var s = 0; s < G.selection.length; s++) { var e = W.byId.get(G.selection[s]); if (e && !e.dead) { sel.push(e); sig += e.id + ','; } }
    if (sel.length === 1 && sel[0].kind === 'building') sig += sel[0].built ? 'B' : 'U';
    if (sig !== selSig) { selSig = sig; rebuildSel(G, sel); }
    for (var l = 0; l < live.length; l++) live[l]();

    // 명령 카드
    var defs = UI.getCard(G), csig = G.card + '|' + defs.map(function (d) { return d.slot + d.icon[1]; }).join(',') + '|' + sig;
    if (csig !== cardSig) { cardSig = csig; rebuildCard(G, defs); }
    if (frameNo % 6 === 0) {
      for (var c = 0; c < cardBtns.length; c++) {
        var cb = cardBtns[c];
        cb.el.classList.toggle('off', !!(cb.def.off && cb.def.off()));
        cb.el.classList.toggle('on', !!(cb.def.on && cb.def.on()));
        if (cb.def.cnt) { var ct = cb.def.cnt(); if (cb.cnt.textContent !== ct) cb.cnt.textContent = ct; }
      }
      if (tipBtn && frameNo % 30 === 0) showTip(tipBtn);
    }
  };

  // 선택 패널과 명령 카드를 다음 프레임에 새로 그리게 한다
  UI.invalidate = function () { selSig = '~'; cardSig = '~'; };

  UI.reset = function () {
    selSig = '~'; cardSig = '~'; guideSig = ''; lastTop = {}; live = []; tipBtn = null; pwSig = ''; pwPrev = ''; grpSig = '~'; $('groups').innerHTML = '';
    $('msgs').innerHTML = ''; $('tooltip').classList.add('hidden');
    $('guide').classList.add('hidden'); $('scoreboard').classList.add('hidden');
  };

  // 길잡이 문구용: 일꾼 이름을 진영 정보에 붙여 둔다
  R.FACTION_IDS.forEach(function (fid) { var f = R.FACTIONS[fid]; f.fdefWorker = R.UNITS[f.worker].name; });
})(typeof globalThis !== 'undefined' ? globalThis : this);
