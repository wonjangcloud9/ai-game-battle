/* 해돌전쟁 — 그림 공방 (공통 도구, 캐시, 자원, 아이콘)
   모든 그림은 캔버스 도형으로 직접 그린다. 외부 이미지 파일은 쓰지 않는다. */
'use strict';
(function (g) {
  var R = g.RTS;
  var S = R.Sprites = {};
  var SS = 2;                 // 선명도를 위한 확대 배율
  S.SS = SS;
  var OUT = '#17120e';
  S.OUT = OUT;

  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  S.mk = mk;

  function hex2rgb(h) {
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }
  function shade(h, k) {
    var c = hex2rgb(h), t = k > 0 ? 255 : 0, a = Math.abs(k);
    return 'rgb(' + Math.round(c[0] + (t - c[0]) * a) + ',' + Math.round(c[1] + (t - c[1]) * a) + ',' + Math.round(c[2] + (t - c[2]) * a) + ')';
  }
  function rgba(h, a) { var c = hex2rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  var H = S.h = {
    shade: shade, rgba: rgba,
    fs: function (g, fill, stroke, lw) {
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1.2; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
    },
    poly: function (g, pts, fill, stroke, lw) {
      g.beginPath(); g.moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.closePath(); H.fs(g, fill, stroke, lw);
    },
    circ: function (g, x, y, r, fill, stroke, lw) { g.beginPath(); g.arc(x, y, r, 0, 6.2832); H.fs(g, fill, stroke, lw); },
    ell: function (g, x, y, rx, ry, rot, fill, stroke, lw) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832); H.fs(g, fill, stroke, lw); },
    rr: function (g, x, y, w, h, r, fill, stroke, lw) {
      r = Math.min(r, w / 2, h / 2);
      g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
      g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
      H.fs(g, fill, stroke, lw);
    },
    line: function (g, x1, y1, x2, y2, col, lw) {
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
      g.strokeStyle = col; g.lineWidth = lw || 1.2; g.lineCap = 'round'; g.stroke();
    },
    // 잎사귀: (x,y)에서 ang 방향으로 len만큼 뻗는 뾰족한 타원
    leaf: function (g, x, y, len, wid, ang, fill, stroke, lw) {
      var c = Math.cos(ang), s = Math.sin(ang);
      var ex = x + c * len, ey = y + s * len, mx = x + c * len * 0.5, my = y + s * len * 0.5;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(mx - s * wid, my + c * wid, ex, ey);
      g.quadraticCurveTo(mx + s * wid, my - c * wid, x, y);
      g.closePath(); H.fs(g, fill, stroke, lw);
    },
    star: function (g, x, y, n, r1, r2, rot, fill, stroke, lw) {
      g.beginPath();
      for (var i = 0; i < n * 2; i++) {
        var a = rot + i * Math.PI / n, r = (i % 2 === 0) ? r1 : r2;
        if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath(); H.fs(g, fill, stroke, lw);
    },
    ngon: function (g, x, y, n, r, rot, fill, stroke, lw) {
      g.beginPath();
      for (var i = 0; i < n; i++) {
        var a = rot + i * 6.2832 / n;
        if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath(); H.fs(g, fill, stroke, lw);
    },
    gear: function (g, x, y, r, teeth, rot, fill, stroke, lw) {
      g.beginPath();
      var n = teeth * 4;
      for (var i = 0; i < n; i++) {
        var a = rot + i * 6.2832 / n, rr2 = (i % 4 < 2) ? r : r * 0.78;
        if (i === 0) g.moveTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); else g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
      }
      g.closePath(); H.fs(g, fill, stroke, lw);
      H.circ(g, x, y, r * 0.3, shade('#000000', 0), null);
    },
    ring: function (g, x, y, r, col, lw) { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.strokeStyle = col; g.lineWidth = lw; g.stroke(); },
    arc: function (g, x, y, r, a0, a1, col, lw) { g.beginPath(); g.arc(x, y, r, a0, a1); g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.stroke(); },
    dots: function (g, x, y, r, n, rad, col, rot) {
      g.fillStyle = col;
      for (var i = 0; i < n; i++) { var a = (rot || 0) + i * 6.2832 / n; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, rad, 0, 6.2832); g.fill(); }
    },
    lg: function (g, x0, y0, x1, y1, stops) {
      var gr = g.createLinearGradient(x0, y0, x1, y1);
      for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
      return gr;
    },
    rg: function (g, x, y, r0, r1, stops) {
      var gr = g.createRadialGradient(x, y, r0, x, y, r1);
      for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
      return gr;
    },
    // 왼쪽 위에서 빛을 받는 둥근 금속/구슬 느낌
    ball: function (g, x, y, r, base) {
      return H.rg2(g, x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r, [0, shade(base, 0.45), 0.55, base, 1, shade(base, -0.35)]);
    },
    rg2: function (g, x0, y0, r0, x1, y1, r1, stops) {
      var gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1);
      for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
      return gr;
    },
    glow: function (g, x, y, r, col, a) {
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = H.rg(g, x, y, 0, r, [0, rgba(col, a === undefined ? 0.9 : a), 1, rgba(col, 0)]);
      g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); g.restore();
    },
    // 다섯 꽃잎 작은 꽃
    flower: function (g, x, y, r, col, mid) {
      for (var i = 0; i < 5; i++) { var a = i * 1.2566 + 0.3; H.circ(g, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, col, OUT, 0.5); }
      H.circ(g, x, y, r * 0.38, mid || '#ffe27a', null);
    }
  };

  S.teamColors = function (idx) {
    var c = R.TEAM_COLORS[idx % R.TEAM_COLORS.length];
    return { t: c.main, td: c.dark, tl: c.light };
  };

  var cache = new Map();
  S.unitDraw = {};        // type → function(g, C, f)   (f.w: 걷기 위상 0~1, f.a: 공격 자세 0/1)
  S.buildingDraw = {};    // type → function(g, C, s)   (s: 한 변 픽셀)

  // 유닛 스프라이트: +x 방향을 보는 그림
  S.unit = function (type, color, wf, af, part) {
    var key = 'u|' + type + '|' + color + '|' + wf + '|' + af + '|' + (part || '');
    var sp = cache.get(key);
    if (sp) return sp;
    var def = R.UNITS[type], box = Math.ceil(def.r * 3.8 + 10);
    var c = mk(box * SS, box * SS), g2 = c.getContext('2d');
    g2.scale(SS, SS); g2.translate(box / 2, box / 2);
    g2.lineJoin = 'round'; g2.lineCap = 'round';
    var fn = S.unitDraw[part ? type + '_' + part : type];
    if (fn) fn(g2, S.teamColors(color), { w: wf / 4, a: af });
    sp = { c: c, s: box };
    cache.set(key, sp);
    return sp;
  };

  S.building = function (type, color, part) {
    var key = 'b|' + type + '|' + color + '|' + (part || '');
    var sp = cache.get(key);
    if (sp) return sp;
    var def = R.BUILDINGS[type], s = def.size * R.TILE, box = s + 28;
    var c = mk(box * SS, box * SS), g2 = c.getContext('2d');
    g2.scale(SS, SS); g2.translate(box / 2, box / 2);
    g2.lineJoin = 'round'; g2.lineCap = 'round';
    var fn = S.buildingDraw[part ? type + '_' + part : type];
    if (fn) fn(g2, S.teamColors(color), s);
    sp = { c: c, s: box };
    cache.set(key, sp);
    return sp;
  };

  /* ── 자원 노드 ── */
  function crystal(g2, x, y, h, w, ang, base) {
    g2.save(); g2.translate(x, y); g2.rotate(ang);
    H.poly(g2, [0, -h, w, -h * 0.25, w * 0.7, h * 0.45, -w * 0.7, h * 0.45, -w, -h * 0.25], H.lg(g2, -w, -h, w, h * 0.5, [0, shade(base, 0.55), 0.5, base, 1, shade(base, -0.3)]), OUT, 1);
    H.poly(g2, [0, -h, w * 0.2, -h * 0.2, -w * 0.3, h * 0.4, -w, -h * 0.25], rgba('#ffffff', 0.35), null);
    g2.restore();
  }
  S.node = function (kind, variant, level) {
    var key = 'n|' + kind + '|' + variant + '|' + level;
    var sp = cache.get(key);
    if (sp) return sp;
    var def = R.NODES[kind], s = def.size * R.TILE, box = s + 24;
    var c = mk(box * SS, box * SS), g2 = c.getContext('2d');
    g2.scale(SS, SS); g2.translate(box / 2, box / 2);
    var rng = R.makeRng(variant * 131 + 7);
    if (kind === 'dew') {
      // 달이슬 샘: 돌 테두리 안의 빛나는 물
      for (var i = 0; i < 11; i++) {
        var a = i / 11 * 6.2832 + rng.range(-0.1, 0.1), rr = 25 + rng.range(-1.5, 2);
        H.ell(g2, Math.cos(a) * rr, Math.sin(a) * rr, 7 + rng.range(0, 2.5), 5.5 + rng.range(0, 2), a, H.lg(g2, -5, -5, 5, 5, [0, '#8d95a1', 1, '#4d535e']), OUT, 1);
      }
      H.circ(g2, 0, 0, 21.5, H.rg(g2, -4, -5, 2, 23, [0, '#d9fffb', 0.35, '#58e6da', 0.8, '#1f9aa6', 1, '#136a78']), OUT, 1.2);
      var lv = [0.35, 0.65, 1][level];
      H.circ(g2, 0, 0, 21.5 * lv, rgba('#b9fff6', 0.28), null);
      H.arc(g2, -3, -3, 13, 3.4, 4.6, rgba('#ffffff', 0.7), 2);
      H.arc(g2, 4, 5, 9, 0.3, 1.3, rgba('#ffffff', 0.4), 1.5);
    } else {
      var rich = kind === 'sunRich';
      var base = rich ? '#ffb52e' : '#ffd23f';
      H.ell(g2, 0, 6, 15, 8, 0, 'rgba(0,0,0,0.28)', null);
      H.ell(g2, 0, 5, 13, 6.5, 0, '#6b5a3a', OUT, 1);
      var n = [2, 3, 5][level] + (rich ? 1 : 0);
      var spots = [[0, -2, 15, 6, 0], [-7, 2, 11, 5, -0.35], [7, 3, 10, 4.5, 0.4], [-2, 5, 8, 4, 0.1], [4, -4, 9, 4, 0.25], [-9, -3, 7, 3.5, -0.5]];
      for (var k = n - 1; k >= 0; k--) {
        var sp2 = spots[k];
        crystal(g2, sp2[0] + rng.range(-1.5, 1.5), sp2[1] + 4, sp2[2] * (rich ? 1.15 : 1) + rng.range(-1, 1), sp2[3], sp2[4] + rng.range(-0.15, 0.15), base);
      }
      H.glow(g2, 0, -2, 20, rich ? '#ffcf5a' : '#fff0a0', 0.33);
    }
    sp = { c: c, s: box };
    cache.set(key, sp);
    return sp;
  };

  /* ── 부드러운 그림자 ── */
  S.shadow = function () {
    var sp = cache.get('shadow');
    if (sp) return sp;
    var c = mk(64, 64), g2 = c.getContext('2d');
    g2.fillStyle = H.rg(g2, 32, 32, 4, 32, [0, 'rgba(0,0,0,0.55)', 0.6, 'rgba(0,0,0,0.3)', 1, 'rgba(0,0,0,0)']);
    g2.fillRect(0, 0, 64, 64);
    sp = { c: c, s: 64 };
    cache.set('shadow', sp);
    return sp;
  };

  /* ── 아이콘 (명령 버튼, 초상화) ── */
  var glyphs = {
    move: function (g2) { H.poly(g2, [-9, -2, 3, -2, 3, -8, 12, 0, 3, 8, 3, 2, -9, 2], '#9fe870', OUT, 1.5); },
    stop: function (g2) { H.rr(g2, -8, -8, 16, 16, 3, '#ff7a6b', OUT, 1.5); },
    hold: function (g2) { H.poly(g2, [0, -11, 9, -6, 9, 2, 0, 11, -9, 2, -9, -6], '#8ec5ff', OUT, 1.5); H.line(g2, 0, -5, 0, 5, OUT, 2); H.line(g2, -4, 0, 4, 0, OUT, 2); },
    attack: function (g2) {
      g2.save(); g2.rotate(-0.785);
      H.poly(g2, [-1.8, -12, 1.8, -12, 2.4, 4, -2.4, 4], '#e9edf2', OUT, 1.3);
      H.poly(g2, [0, -15, 2.4, -11, -2.4, -11], '#e9edf2', OUT, 1.3);
      H.rr(g2, -6, 4, 12, 3, 1, '#c9973f', OUT, 1.2); H.rr(g2, -1.6, 7, 3.2, 6, 1, '#7a5232', OUT, 1.2);
      g2.restore();
    },
    build: function (g2) {
      g2.save(); g2.rotate(0.6);
      H.rr(g2, -1.6, -4, 3.2, 15, 1, '#a87a4c', OUT, 1.2);
      H.rr(g2, -8, -11, 16, 7, 1.5, '#aab2bd', OUT, 1.3);
      g2.restore();
    },
    cancel: function (g2) { H.line(g2, -8, -8, 8, 8, OUT, 6); H.line(g2, 8, -8, -8, 8, OUT, 6); H.line(g2, -8, -8, 8, 8, '#ff5a4a', 3.4); H.line(g2, 8, -8, -8, 8, '#ff5a4a', 3.4); },
    repair: function (g2) {
      g2.save(); g2.rotate(-0.7);
      H.rr(g2, -1.8, -3, 3.6, 14, 1.5, '#aab2bd', OUT, 1.2);
      g2.beginPath(); g2.arc(0, -7, 6, 0.9, 5.4); H.fs(g2, null, OUT, 5); g2.beginPath(); g2.arc(0, -7, 6, 0.9, 5.4); H.fs(g2, null, '#c9d1dc', 2.8);
      g2.restore();
    },
    rally: function (g2) { H.line(g2, -5, 11, -5, -11, OUT, 3.2); H.line(g2, -5, 11, -5, -11, '#d9c9a0', 1.6); H.poly(g2, [-4, -11, 10, -6, -4, -1], '#ffcf4a', OUT, 1.3); },
    back: function (g2) { H.poly(g2, [9, -2, -3, -2, -3, -8, -12, 0, -3, 8, -3, 2, 9, 2], '#d7dde6', OUT, 1.5); },
    atk: function (g2, col) { glyphs.attack(g2); H.glow(g2, 6, -6, 9, col || '#ffcf4a', 0.8); },
    def: function (g2, col) { H.poly(g2, [0, -12, 10, -8, 10, 1, 0, 12, -10, 1, -10, -8], col || '#8ec5ff', OUT, 1.5); H.poly(g2, [0, -8, 6, -5.5, 6, 0.5, 0, 7.5], 'rgba(255,255,255,0.35)', null); },
    spc: function (g2, col) { H.star(g2, 0, 0, 5, 12, 5.2, -1.57, col || '#ffe66b', OUT, 1.5); H.circ(g2, 0, 0, 2.6, '#ffffff', null); },
    idle: function (g2) { H.circ(g2, 0, 0, 10, '#ffd23f', OUT, 1.5); H.line(g2, 0, -5, 0, 1, OUT, 2.4); H.circ(g2, 0, 5, 1.5, OUT, null); },
    army: function (g2) { g2.save(); g2.translate(-3, 0); glyphs.attack(g2); g2.restore(); g2.save(); g2.translate(5, 2); g2.scale(-1, 1); glyphs.attack(g2); g2.restore(); },
    // 진영 기술
    barrage: function (g2) {
      // 비스듬히 떨어지는 불덩이 셋과 땅의 불꽃
      H.star(g2, -5, 10, 7, 6.5, 2.8, 0.2, '#ffd27a', OUT, 1.2);
      var sh = [[-6, 1, 1], [3, -4, 1.2], [10, 3, 0.85]];
      for (var i = 0; i < sh.length; i++) {
        var x = sh[i][0], y = sh[i][1], k = sh[i][2];
        H.line(g2, x + 7 * k, y - 10 * k, x, y, OUT, 4.6 * k);
        H.line(g2, x + 7 * k, y - 10 * k, x, y, '#ff7a2a', 2.8 * k);
        H.line(g2, x + 4 * k, y - 6 * k, x, y, '#ffe27a', 1.4 * k);
        H.circ(g2, x, y, 3.3 * k, '#ffb347', OUT, 1.2);
        H.circ(g2, x - 0.8 * k, y - 0.8 * k, 1.2 * k, '#fff3c0', null);
      }
    },
    bloom: function (g2) {
      // 빗방울 셋과 돋아나는 새싹
      var drops = [[-8, -6, 1], [1, -10, 1.15], [9, -4, 0.9]];
      for (var i = 0; i < drops.length; i++) {
        var x = drops[i][0], y = drops[i][1], k = drops[i][2];
        g2.beginPath(); g2.moveTo(x, y - 5 * k); g2.bezierCurveTo(x + 4 * k, y - 1 * k, x + 3.6 * k, y + 3.4 * k, x, y + 3.4 * k); g2.bezierCurveTo(x - 3.6 * k, y + 3.4 * k, x - 4 * k, y - 1 * k, x, y - 5 * k); g2.closePath();
        H.fs(g2, H.lg(g2, x - 3, y - 4, x + 3, y + 4, [0, '#e9ffd9', 0.55, '#8dff8a', 1, '#2f9a4a']), OUT, 1.2);
      }
      H.line(g2, 0, 13, 0, 5, OUT, 3.4); H.line(g2, 0, 13, 0, 5, '#5fae3c', 1.8);
      H.leaf(g2, 0, 6, 9, 3.6, -2.5, '#a4dc5c', OUT, 1.1);
      H.leaf(g2, 0, 6, 9, 3.6, -0.64, '#7fcf4a', OUT, 1.1);
      H.glow(g2, 0, 4, 9, '#d9ffb0', 0.5);
    },
    tempest: function (g2) {
      // 먹구름과 벼락
      H.poly(g2, [1, 1, -5, 8, -1, 8, -4, 15, 6, 5, 1.5, 5, 4, 1], '#ffe66b', OUT, 1.3);
      H.circ(g2, -7, -3, 5.6, '#56607a', OUT, 1.3); H.circ(g2, 6, -3, 6.2, '#56607a', OUT, 1.3); H.circ(g2, -1, -7, 6.6, '#6a7590', OUT, 1.3);
      H.rr(g2, -11, -4, 22, 6.5, 3, '#56607a', null);
      H.line(g2, -10.5, 2.6, 10.5, 2.6, OUT, 1.3);
      H.arc(g2, -1, -7, 4.2, 3.6, 5.2, 'rgba(255,255,255,0.45)', 1.4);
    }
  };

  // 버튼용 아이콘 캔버스 (px: CSS 픽셀 크기)
  S.icon = function (kind, id, color, px) {
    var key = 'i|' + kind + '|' + id + '|' + color + '|' + px;
    var sp = cache.get(key);
    if (sp) return sp;
    var dpr = Math.min(3, Math.max(2, Math.ceil(g.devicePixelRatio || 1)));
    var c = mk(px * dpr, px * dpr), g2 = c.getContext('2d');
    c.style.width = px + 'px'; c.style.height = px + 'px';
    g2.scale(dpr, dpr); g2.translate(px / 2, px / 2);
    g2.lineJoin = 'round'; g2.lineCap = 'round';
    var src, k;
    if (kind === 'unit') {
      src = S.unit(id, color, 0, 0);
      k = px / (R.UNITS[id].r * 2.45 + 7);
      g2.save(); g2.rotate(-0.6); g2.drawImage(src.c, -src.s * k / 2, -src.s * k / 2, src.s * k, src.s * k);
      if (S.unitDraw[id + '_turret']) { var tp = S.unit(id, color, 0, 0, 'turret'); g2.drawImage(tp.c, -tp.s * k / 2, -tp.s * k / 2, tp.s * k, tp.s * k); }
      if (S.unitOverlay[id]) { g2.scale(k, k); S.unitOverlay[id](g2, 0.4, S.teamColors(color)); }
      g2.restore();
    } else if (kind === 'building') {
      src = S.building(id, color);
      k = (px * 0.96) / (R.BUILDINGS[id].size * R.TILE + 6);
      g2.drawImage(src.c, -src.s * k / 2, -src.s * k / 2, src.s * k, src.s * k);
      if (S.buildingDraw[id + '_head']) { var hp = S.building(id, color, 'head'); g2.drawImage(hp.c, -hp.s * k / 2, -hp.s * k / 2, hp.s * k, hp.s * k); }
      if (S.buildingOverlay[id]) { g2.save(); g2.scale(k, k); S.buildingOverlay[id](g2, 0.4, S.teamColors(color), {}); g2.restore(); }
    } else if (kind === 'upgrade') {
      var up = R.UPGRADES[id], fc = R.FACTIONS[up.faction].ui.accent;
      g2.scale(px / 34, px / 34);
      if (up.effect.atk) { glyphs.atk(g2, fc); }
      else if (up.effect.def) { glyphs.def(g2, fc); }
      else glyphs.spc(g2, fc);
      if (up.effect.atk === 2 || up.effect.def === 2) { g2.fillStyle = '#fff'; g2.font = 'bold 11px sans-serif'; g2.textAlign = 'right'; g2.strokeStyle = OUT; g2.lineWidth = 3; g2.strokeText('II', 15, 14); g2.fillText('II', 15, 14); }
    } else if (kind === 'res') {
      g2.scale(px / 30, px / 30);
      if (id === 'sun') { crystal(g2, -4, 4, 12, 5, -0.3, '#ffd23f'); crystal(g2, 5, 5, 9, 4, 0.35, '#ffd23f'); H.glow(g2, 0, 0, 13, '#fff0a0', 0.4); }
      else if (id === 'dew') {
        g2.beginPath(); g2.moveTo(0, -12); g2.bezierCurveTo(9, -2, 10, 3, 10, 5); g2.arc(0, 5, 10, 0, Math.PI); g2.bezierCurveTo(-10, 3, -9, -2, 0, -12); g2.closePath();
        H.fs(g2, H.lg(g2, -8, -8, 8, 12, [0, '#d9fffb', 0.5, '#58e6da', 1, '#1f9aa6']), OUT, 1.5);
        H.arc(g2, -1, 4, 6, 2.6, 3.9, 'rgba(255,255,255,0.8)', 2);
      } else {
        // 보급: 작은 집 모양
        H.poly(g2, [-11, -1, 0, -12, 11, -1], '#d98a5a', OUT, 1.5);
        H.rr(g2, -8, -1, 16, 12, 1.5, '#efe6cf', OUT, 1.5);
        H.rr(g2, -2.5, 4, 5, 7, 1, '#7a5232', OUT, 1);
      }
    } else if (kind === 'node') {
      src = S.node(id, 1, 2);
      k = (px * 0.95) / (R.NODES[id].size * R.TILE + 10);
      g2.drawImage(src.c, -src.s * k / 2, -src.s * k / 2, src.s * k, src.s * k);
    } else {
      g2.scale(px / 32, px / 32);
      if (glyphs[id]) glyphs[id](g2);
    }
    sp = { c: c, s: px };
    cache.set(key, sp);
    return sp;
  };

  S.unitOverlay = {};       // type → function(g, time, C, unit)  — 움직이는 부분(회전익 등)
  S.buildingOverlay = {};   // type → function(g, time, C, building)
  S.clearCache = function () { cache.clear(); };
})(typeof globalThis !== 'undefined' ? globalThis : this);
