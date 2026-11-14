/* SUNDRIFT GP — HUD and menus (plain DOM over the canvas) plus the 2D minimap. */
(function (root) {
  'use strict';
  var SD = root.SD;
  function $(id) { return document.getElementById(id); }

  var H = { el: {}, last: {}, rows: [], map: null };

  H.init = function () {
    var ids = ['hud', 'hud-pos', 'pos-num', 'pos-total', 'hud-board', 'lap-num', 'lap-total', 'hud-time', 'hud-best', 'minimap', 'hud-speed', 'speed-num',
      'gauge', 'gauge-fill', 'stock0', 'stock1', 'drift-tag', 'key-boost', 'hud-msg', 'hud-sub', 'hud-wrong', 'count', 'flash', 'title', 'pause', 'results',
      'res-pos', 'res-title', 'res-list', 'res-best', 'loading', 'fatal', 'fatal-text', 'mute', 'diff', 'btn-start', 'btn-resume', 'btn-restart', 'btn-quit',
      'btn-again', 'btn-title', 'touch'];
    for (var i = 0; i < ids.length; i++) H.el[ids[i]] = $(ids[i]);
  };
  /** Call once the HUD is visible so the minimap can size itself from layout. */
  H.setTrack = function (track) { H.track = track; H._mapInit(); };

  H.show = function (id, on) { var e = H.el[id]; if (e) e.classList.toggle('hidden', !on); };

  function setText(key, el, v) { if (H.last[key] !== v) { H.last[key] = v; el.textContent = v; } }
  function setClass(key, el, cls, on) { var k = key + ':' + cls; if (H.last[k] !== on) { H.last[k] = on; el.classList.toggle(cls, on); } }
  function retrigger(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // ---------------------------------------------------------------- standings
  H.buildBoard = function (karts) {
    var box = H.el['hud-board'];
    box.innerHTML = '';
    H.rows = [];
    for (var i = 0; i < karts.length; i++) {
      var k = karts[i], row = document.createElement('div');
      row.className = 'row' + (k.isPlayer ? ' me' : '');
      row.innerHTML = '<span class="n"></span><span class="chip"></span><span class="name"></span>';
      row.children[1].style.background = SD.css(SD.hex(k.racer.primary));
      row.children[2].textContent = k.racer.name;
      box.appendChild(row);
      H.rows.push({ el: row, n: row.children[0], rank: -1, done: false });
    }
    setText('total', H.el['pos-total'], String(karts.length));
    H.last = {};
  };

  // ---------------------------------------------------------------- per-frame
  H.update = function (race, player, dt) {
    var e = H.el, C = SD.CFG, i;
    setText('pos', e['pos-num'], String(player.rank));
    if (H.last.posPrev !== undefined && H.last.posPrev !== player.rank) retrigger(e['hud-pos'], 'pop');
    H.last.posPrev = player.rank;
    setClass('pos', e['hud-pos'], 'p1', player.rank === 1);
    setText('lap', e['lap-num'], String(race.lapOf(player)));
    setText('laps', e['lap-total'], String(race.laps));
    var tt = player.finished ? player.finishTime : Math.max(0, race.time);
    setText('time', e['hud-time'], SD.fmtTime(tt));
    setText('best', e['hud-best'], 'BEST ' + SD.fmtTime(player.bestLap));
    setText('speed', e['speed-num'], String(Math.round(Math.abs(player.speed) * C.speedUnit)));
    setClass('speed', e['hud-speed'], 'boost', player.boostAmount() > 0);
    // gauge
    var g = player.stock >= C.maxStock ? 1 : SD.clamp01(player.gauge);
    var gq = Math.round(g * 200) / 200;
    if (H.last.g !== gq) { H.last.g = gq; e['gauge-fill'].style.transform = 'scaleX(' + gq + ')'; }
    setClass('gauge', e.gauge, 'drifting', player.drifting);
    setClass('gauge', e.gauge, 'full', player.stock >= C.maxStock);
    setClass('s0', e.stock0, 'on', player.stock >= 1);
    setClass('s1', e.stock1, 'on', player.stock >= 2);
    setClass('tag', e['drift-tag'], 'on', player.drifting);
    setClass('kb', e['key-boost'], 'ready', player.stock > 0 && player.boostT <= 0);
    // standings
    for (i = 0; i < race.karts.length; i++) {
      var k = race.karts[i], row = H.rows[i];
      if (!row) continue;
      if (row.rank !== k.rank) {
        row.rank = k.rank;
        row.el.style.transform = 'translateY(' + ((k.rank - 1) * 112) + '%)';
        row.n.textContent = String(k.rank);
      }
      if (row.done !== k.finished) { row.done = k.finished; row.el.classList.toggle('done', k.finished && !k.isPlayer); }
    }
    H._mapDraw(race, player);
  };

  H.message = function (text, cls, sub) {
    var m = H.el['hud-msg'];
    m.textContent = text;
    m.className = cls || '';
    retrigger(m, 'show');
    var s = H.el['hud-sub'];
    s.classList.remove('low');
    if (sub) { s.textContent = sub; retrigger(s, 'show'); } else s.classList.remove('show');
  };
  /** Small hint line low on the screen (kept clear of the countdown digits). */
  H.tip = function (text) {
    var s = H.el['hud-sub'];
    s.textContent = text;
    s.classList.add('low');
    retrigger(s, 'show');
  };
  H.count = function (text, go) {
    var c = H.el.count;
    c.classList.remove('hidden');
    c.textContent = text;
    c.className = '';
    retrigger(c, go ? 'go' : 'tick');
  };
  H.flash = function (gold) {
    var f = H.el.flash;
    f.classList.toggle('gold', !!gold);
    retrigger(f, 'on');
  };
  H.wrongWay = function (on) { setClass('wrong', H.el['hud-wrong'], 'hidden', !on); };
  H.muted = function (on) { H.show('mute', on); };

  H.results = function (list, playerPos, bestLap, record) {
    var e = H.el, html = '';
    e['res-pos'].textContent = playerPos + '위';
    e['res-title'].textContent = playerPos === 1 ? '우승! 완벽한 드리프트!' : (playerPos <= 3 ? '포디움 입성!' : 'FINISH!');
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      html += '<div class="r' + (r.isPlayer ? ' me' : '') + '"><span class="n">' + r.pos + '</span><span class="chip" style="background:' + SD.css(SD.hex(r.color)) +
        '"></span><span class="nm">' + r.name + '</span><span class="t">' + SD.fmtTime(r.time) + '</span></div>';
    }
    e['res-list'].innerHTML = html;
    e['res-best'].textContent = '베스트 랩 ' + SD.fmtTime(bestLap) + (record ? '  ·  신기록!' : '');
    H.show('results', true);
  };

  H.fatal = function (text) {
    H.show('loading', false);
    H.el['fatal-text'].textContent = text;
    H.show('fatal', true);
  };

  // ---------------------------------------------------------------- minimap
  H._mapInit = function () {
    var cv = H.el.minimap, t = H.track, b = t.bounds;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var cssW = cv.clientWidth || 260, cssH = cv.clientHeight || 150;
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    var pad = 14 * dpr, sx = (cv.width - pad * 2) / (b.maxx - b.minx), sz = (cv.height - pad * 2) / (b.maxz - b.minz), s = Math.min(sx, sz);
    var ox = (cv.width - (b.maxx - b.minx) * s) / 2 - b.minx * s, oz = (cv.height - (b.maxz - b.minz) * s) / 2 - b.minz * s;
    var m = H.map = { cv: cv, ctx: cv.getContext('2d'), s: s, ox: ox, oz: oz, dpr: dpr, bg: document.createElement('canvas') };
    m.bg.width = cv.width; m.bg.height = cv.height;
    var c = m.bg.getContext('2d'), i;
    c.lineJoin = 'round'; c.lineCap = 'round';
    function path() {
      c.beginPath();
      for (i = 0; i < t.N; i += 2) { var x = t.px[i] * s + ox, y = t.pz[i] * s + oz; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }
      c.closePath();
    }
    path(); c.strokeStyle = 'rgba(8,14,30,0.6)'; c.lineWidth = 11 * dpr; c.stroke();
    path(); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 6.5 * dpr; c.stroke();
    path(); c.strokeStyle = '#3a4152'; c.lineWidth = 4 * dpr; c.stroke();
    // start line
    var px = t.px[0] * s + ox, py = t.pz[0] * s + oz, nx = t.nx[0], nz = t.nz[0];
    c.strokeStyle = '#ffffff'; c.lineWidth = 2.5 * dpr; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(px - nx * 7 * dpr, py - nz * 7 * dpr); c.lineTo(px + nx * 7 * dpr, py + nz * 7 * dpr); c.stroke();
  };
  H._mapDraw = function (race, player) {
    var m = H.map;
    if (!m) return;
    var c = m.ctx, karts = race.karts, dpr = m.dpr, i, k;
    c.clearRect(0, 0, m.cv.width, m.cv.height);
    c.drawImage(m.bg, 0, 0);
    for (i = karts.length - 1; i >= 0; i--) {
      k = karts[i];
      var x = k.x * m.s + m.ox, y = k.z * m.s + m.oz;
      c.beginPath(); c.arc(x, y, (k.isPlayer ? 5.2 : 3.6) * dpr, 0, 6.2832);
      c.fillStyle = SD.css(SD.hex(k.racer.primary)); c.fill();
      c.lineWidth = (k.isPlayer ? 2.4 : 1.4) * dpr; c.strokeStyle = k.isPlayer ? '#ffffff' : 'rgba(10,16,30,0.9)'; c.stroke();
    }
  };

  SD.hud = H;
})(typeof window !== 'undefined' ? window : globalThis);
