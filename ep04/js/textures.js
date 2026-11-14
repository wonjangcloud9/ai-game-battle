/* 텍스처 — 이미지 파일 없이 전부 코드로 그린다.
 *  · 절차적 픽셀 텍스처(나무결·마루·벽·테라조·천장 텍스·천·커튼…)
 *  · 캔버스 텍스처(칠판·시계·좌석표·안내문·태극기·급훈·창밖 풍경…)
 */
(function (GX) {
  'use strict';
  var MM = Math;      /* 픽셀 수백만 개를 계산하는 동안 전역 조회를 줄이려고 지역 변수로 잡아 둔다 */

  var FONT = GX.FONT = {
    sans: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif',
    serif: 'AppleMyungjo, "Nanum Myeongjo", Batang, serif',
    chalk: '"Nanum Pen Script", "Nanum Brush Script", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
    brush: '"Nanum Brush Script", "Nanum Pen Script", AppleMyungjo, Batang, serif',
    mono: 'Menlo, Consolas, monospace'
  };

  /* ───────── 글 줄바꿈 도우미 ───────── */
  var T = GX.Text = {};
  /* 띄어쓰기 단위로 줄을 나누고, 한 어절이 너무 길면 글자 단위로 자른다 */
  T.wrap = function (ctx, text, maxW) {
    var words = String(text).split(' '), lines = [], cur = '', curW = 0;
    var spaceW = ctx.measureText(' ').width;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (w === '') continue;
      var ww = ctx.measureText(w).width;
      if (cur === '') {
        if (ww <= maxW) { cur = w; curW = ww; continue; }
        var chars = Array.from(w), part = '', pw = 0;
        for (var k = 0; k < chars.length; k++) {
          var cw = ctx.measureText(chars[k]).width;
          if (part && pw + cw > maxW) { lines.push(part); part = chars[k]; pw = cw; } else { part += chars[k]; pw += cw; }
        }
        cur = part; curW = pw;
      } else if (curW + spaceW + ww <= maxW) {
        cur += ' ' + w; curW += spaceW + ww;
      } else {
        lines.push(cur); cur = ''; curW = 0; i--;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };
  /* 여러 줄 그리기. 그린 뒤의 y 를 돌려준다 */
  T.block = function (ctx, text, x, y, maxW, lineH) {
    var lines = T.wrap(ctx, text, maxW);
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lineH);
    return y + lines.length * lineH;
  };
  T.font = function (ctx, px, family, bold) {
    ctx.font = (bold ? 'bold ' : '') + px + 'px ' + family;
  };
  /* 글자 크기 맞추기: 그 글꼴·크기로 썼을 때 폭이 maxW 를 넘으면, 넘지 않는 크기를 돌려준다.
     자리를 좁은 글꼴(손글씨)에 맞춰 잡아 둔 글이, 그 글꼴이 없는 환경에서 넓은 글꼴로 바뀌어도 넘치지 않게 한다
     (사파리는 따로 설치한 글꼴을 웹 페이지에 내주지 않고, 윈도우에는 그 글꼴이 아예 없다) */
  T.fitPx = function (ctx, text, px, family, maxW, bold) {
    if (!maxW) return px;
    T.font(ctx, px, family, bold);
    var w = ctx.measureText(String(text)).width;
    return w > maxW ? MM.max(6, MM.floor(px * maxW / w)) : px;
  };
  T.roundRect = function (ctx, x, y, w, h, r) {
    r = MM.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };
  /* 타원 경로(캔버스의 ellipse 대신: 낡은 브라우저·점검 도구에서도 같은 결과) */
  T.oval = function (ctx, x, y, rx, ry) {
    ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, MM.PI * 2);
    ctx.restore();
  };
  /* 종이 결: 아주 옅은 얼룩과 섬유를 흩뿌린다 */
  T.paperGrain = function (ctx, x, y, w, h, seed, amount) {
    var r = GX.rng(seed), n = MM.round(w * h / 5200 * (amount || 1));
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(96,84,60,0.03)';
      ctx.fillRect(x + r() * w, y + r() * h, 3 + r() * 28, 1 + r() * 2.5);
    }
  };
  /* 손글씨 흉내: 글자마다 크기·기울기·높낮이를 조금씩 흔든다. 그린 폭을 돌려준다 */
  T.hand = function (ctx, r, text, x, y, px, family, color, align, wob) {
    T.font(ctx, px, family);
    var chars = Array.from(String(text)), ws = [], w = 0, i;
    wob = wob === undefined ? 1 : wob;
    for (i = 0; i < chars.length; i++) { var cw = ctx.measureText(chars[i]).width; ws.push(cw); w += cw; }
    var cx = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x);
    ctx.textAlign = 'left'; ctx.fillStyle = color;
    for (i = 0; i < chars.length; i++) {
      if (chars[i] !== ' ') {
        ctx.save();
        ctx.translate(cx + ws[i] / 2, y + (r() - 0.5) * px * 0.08 * wob);
        ctx.rotate((r() - 0.5) * 0.1 * wob);
        var s = 1 + (r() - 0.5) * 0.09 * wob;
        ctx.scale(s, s);
        ctx.fillText(chars[i], -ws[i] / 2, 0);
        ctx.restore();
      }
      cx += ws[i] * (1 + (r() - 0.5) * 0.05 * wob);
    }
    return w;
  };
  function newCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  GX.newCanvas = newCanvas;

  /* ───────── 절차적 픽셀 텍스처 ───────── */
  /* 정수 격자 해시(32비트 정수 연산만 쓴다) */
  function hash2(x, y, seed) {
    var h = MM.imul(x, 374761393) ^ MM.imul(y, 668265263) ^ MM.imul(seed, 1442695041);
    h = MM.imul(h ^ (h >>> 13), 1274126177);
    h = MM.imul(h ^ (h >>> 15), 2246822519);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  /* 주기 per 로 이어지는 값 노이즈 */
  function vnoise(x, y, per, seed) {
    var xi = MM.floor(x), yi = MM.floor(y), xf = x - xi, yf = y - yi;
    var x0 = ((xi % per) + per) % per, y0 = ((yi % per) + per) % per;
    var x1 = (x0 + 1) % per, y1 = (y0 + 1) % per;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, per, seed, oct) {
    var s = 0, amp = 0.5, f = 1;
    for (var i = 0; i < oct; i++) {
      s += vnoise(x * f, y * f, per * f, seed + i * 17) * amp;
      amp *= 0.5; f *= 2;
    }
    return s;
  }
  function pixels(w, h, fn) {
    var d = new Uint8Array(w * h * 4), o = [0, 0, 0, 255];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        fn(x, y, o);
        var i = (y * w + x) * 4;
        d[i] = o[0] < 0 ? 0 : (o[0] > 255 ? 255 : o[0]);
        d[i + 1] = o[1] < 0 ? 0 : (o[1] > 255 ? 255 : o[1]);
        d[i + 2] = o[2] < 0 ? 0 : (o[2] > 255 ? 255 : o[2]);
        d[i + 3] = o[3];
      }
    }
    return { width: w, height: h, data: d };
  }

  /* 정점색을 곱해 쓰는 밝은 나무결(멜라민 상판·합판) */
  function texWood() {
    var S = 256;
    return pixels(S, S, function (x, y, o) {
      var warp = fbm(x / 64, y / 64, 4, 3, 3) * 2.2;
      var g = fbm((x + warp * 6) / 4, y / 110, 64, 11, 3);
      var ring = 0.5 + 0.5 * MM.sin((x + warp * 16) * 0.3 + g * 9);
      var pore = hash2(x, MM.floor(y / 5), 5) > 0.93 ? 0.04 : 0;
      var v = 0.88 + g * 0.14 - ring * 0.055 - pore + (hash2(x, y, 5) - 0.5) * 0.02;
      o[0] = v * 255; o[1] = v * 249; o[2] = v * 238; o[3] = 255;
    });
  }
  /* 교실 마루(2m x 2m 가 한 장). 좁고 긴 널이 앞뒤(z) 방향으로 깔린다. 틈은 어둡게 → 반사도 덜 한다 */
  function texPlanks() {
    var S = 1024, N = 24, PW = S / N, PL = S / 2;
    return pixels(S, S, function (x, y, o) {
      var col = MM.floor(x / PW);
      var off = MM.floor(hash2(col, 0, 71) * 7) * (PL / 7);
      var yy = y + off, row = MM.floor(yy / PL) % 2;
      var id = col * 2 + row;
      var tone = 0.83 + hash2(id, 3, 9) * 0.27;
      var warm = (hash2(id, 5, 9) - 0.5) * 0.09;
      var lx = x - col * PW, ly = yy - MM.floor(yy / PL) * PL;
      var grain = vnoise(x / 2.6 + id * 13.1, yy / 150, 512, 21 + col);
      var streak = vnoise(x / 9 + id * 7.7, yy / 420, 256, 5);
      var v = tone * (0.86 + grain * 0.17 + streak * 0.1);
      if (hash2(x, MM.floor(yy / 9), 3 + col) > 0.955) v *= 0.93;
      var gap = (lx < 1.3 || ly < 1.6) ? 0.36 : ((lx < 2.6 || ly < 3) ? 0.82 : 1);
      v *= gap;
      /* 의자가 끌린 자국 */
      var sc = vnoise(x / 60, y / 3, 16, 77);
      if (sc > 0.9 && gap === 1) v *= 1.07;
      o[0] = 205 * v * (1 + warm); o[1] = 152 * v; o[2] = 92 * v * (1 - warm); o[3] = 255;
    });
  }
  /* 페인트 벽(롤러 자국이 살짝 남은 면) */
  function texPlaster() {
    var S = 256;
    return pixels(S, S, function (x, y, o) {
      var n = fbm(x / 16, y / 16, 16, 2, 4), f = hash2(x, y, 31);
      var peel = vnoise(x / 3, y / 3, 85, 9);
      var v = 0.945 + n * 0.06 + (f - 0.5) * 0.02 + (peel - 0.5) * 0.03;
      o[0] = o[1] = o[2] = v * 255; o[3] = 255;
    });
  }
  /* 복도 바닥(인조석 물갈기 + 황동 줄눈) */
  function texTerrazzo() {
    var S = 512;
    return pixels(S, S, function (x, y, o) {
      var n = fbm(x / 40, y / 40, 12, 7, 3);
      var r = 0.80 + n * 0.12, g = r * 1.01, b = r * 0.985;
      var cx = MM.floor(x / 5), cy = MM.floor(y / 5);
      var cell = hash2(cx, cy, 13);
      if (cell > 0.72) {
        var k = hash2(cx, cy, 29);
        var jx = (hash2(cx, cy, 3) - 0.5) * 3, jy = (hash2(cx, cy, 4) - 0.5) * 3;
        var dx = x - (cx * 5 + 2.5 + jx), dy = y - (cy * 5 + 2.5 + jy);
        if (dx * dx + dy * dy < 1.5 + k * 5.5) {
          var d = k < 0.35 ? 0.62 : (k < 0.7 ? 1.14 : (k < 0.85 ? 0.82 : 1.05));
          r *= d; g *= d * (k > 0.85 ? 0.95 : 1); b *= d * (k > 0.85 ? 0.8 : (k < 0.35 ? 0.97 : 1));
        }
      }
      var jl = (x < 3 || y < 3);
      if (jl) { r = 0.62; g = 0.52; b = 0.3; }
      o[0] = 255 * r; o[1] = 255 * g; o[2] = 255 * b; o[3] = 255;
    });
  }
  /* 천장 텍스(한 장 = 0.6m 정사각 안에 300x600 판 두 장). 벌레 먹은 듯한 무늬가 있는 흡음판 */
  function texCeiling() {
    var S = 256;
    return pixels(S, S, function (x, y, o) {
      var v = 0.965 + (hash2(x, y, 3) - 0.5) * 0.02;
      var lx = x % 128;
      /* 길쭉한 홈(가로·세로 섞임)과 작은 구멍 */
      if (hash2(MM.floor(x / 9), MM.floor(y / 3), 8) > 0.92 && hash2(MM.floor(x / 3), MM.floor(y / 3), 5) > 0.25) v -= 0.05;
      if (hash2(MM.floor(x / 3), MM.floor(y / 11), 18) > 0.94 && hash2(MM.floor(x / 3), MM.floor(y / 3), 6) > 0.3) v -= 0.045;
      if (hash2(MM.floor(x / 2), MM.floor(y / 2), 28) > 0.975) v -= 0.06;
      if (lx < 2 || y < 2) v = 0.83;
      else if (lx < 4 || y < 4) v *= 0.96;
      o[0] = o[1] = o[2] = v * 255; o[3] = 255;
    });
  }
  /* 책상·사람 밑의 부드러운 접지 그림자(검정 + 알파) */
  function texBlob() {
    var S = 64;
    return pixels(S, S, function (x, y, o) {
      var dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
      var d = MM.sqrt(MM.pow(MM.abs(dx), 2.6) + MM.pow(MM.abs(dy), 2.6));
      var a = 1 - GX.smoothstep(0.25, 1.0, d);
      o[0] = o[1] = o[2] = 0; o[3] = MM.round(a * 255);
    });
  }
  /* 한쪽 끝에서 옅어지는 띠(스캔 줄·벽 아래 때). 알파를 미리 곱한 흰색 */
  function texShaft() {
    var S = 64;
    return pixels(S, S, function (x, y, o) {
      var u = (x + 0.5) / S, v = (y + 0.5) / S;
      var side = MM.sin(u * MM.PI);
      var a = MM.pow(side, 0.7) * (1 - v * 0.75) * GX.smoothstep(0, 0.12, v);
      var c = MM.round(a * 255);
      o[0] = c; o[1] = c; o[2] = c; o[3] = c;
    });
  }
  /* 둥글게 번지는 빛(형광등 주변, 창가). 가산 블렌딩용 */
  function texGlow() {
    var S = 64;
    return pixels(S, S, function (x, y, o) {
      var dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
      var d = MM.sqrt(dx * dx + dy * dy);
      var a = MM.pow(MM.max(0, 1 - d), 2.2);
      var c = MM.round(a * 255);
      o[0] = c; o[1] = c; o[2] = c; o[3] = c;
    });
  }
  /* 옷감(니트·기모). 정점색을 곱해 쓴다 */
  function texFabric() {
    var S = 128;
    return pixels(S, S, function (x, y, o) {
      var rib = 0.5 + 0.5 * MM.sin(x * MM.PI / 2);
      var n = fbm(x / 10, y / 10, 12, 41, 3);
      var v = 0.86 + rib * 0.05 + n * 0.12 + (hash2(x, y, 7) - 0.5) * 0.07;
      o[0] = o[1] = o[2] = v * 255; o[3] = 255;
    });
  }
  /* 커튼: 세로 주름의 밝고 어두움 */
  function texCurtain() {
    var S = 128;
    return pixels(S, S, function (x, y, o) {
      var w = vnoise(y / 40, 3, 4, 12) * 2.2;
      var f = MM.sin((x / S) * MM.PI * 2 * 5 + w), f2 = MM.sin((x / S) * MM.PI * 2 * 11 + 1.3);
      var v = 0.8 + f * 0.13 + f2 * 0.035 + (hash2(x, y, 9) - 0.5) * 0.04;
      o[0] = o[1] = o[2] = v * 255; o[3] = 255;
    });
  }
  /* 운동장 흙(마사토) + 잔디 가장자리. 위에서 내려다본 평면 */
  function texGround() {
    var S = 512;
    return pixels(S, S, function (x, y, o) {
      var n = fbm(x / 30, y / 30, 17, 61, 4), f = hash2(x, y, 23);
      var v = 0.86 + n * 0.2 + (f - 0.5) * 0.05;
      var r = 205 * v, g = 181 * v, b = 140 * v;
      var u = x / S, w = y / S;
      /* 트랙·축구장 흰 줄 */
      var ex = (u - 0.5) / 0.36, ey = (w - 0.5) / 0.26;
      var ring = MM.abs(MM.sqrt(ex * ex + ey * ey) - 1);
      var line = ring < 0.012 || (MM.abs(u - 0.5) < 0.003 && MM.abs(w - 0.5) < 0.19) ||
        ((MM.abs(MM.abs(u - 0.5) - 0.25) < 0.003) && MM.abs(w - 0.5) < 0.19) || (MM.abs(MM.abs(w - 0.5) - 0.19) < 0.003 && MM.abs(u - 0.5) < 0.25);
      var cd = MM.sqrt(MM.pow((u - 0.5) * 1.0, 2) + MM.pow((w - 0.5) * 1.0, 2));
      if (MM.abs(cd - 0.06) < 0.003) line = true;
      if (line) { r = r * 0.35 + 160; g = g * 0.35 + 158; b = b * 0.35 + 150; }
      /* 가장자리는 잔디·화단 */
      var edge = MM.min(u, 1 - u, w, 1 - w);
      if (edge < 0.05 + n * 0.02) { var gv = 0.75 + n * 0.5; r = 88 * gv; g = 128 * gv; b = 66 * gv; }
      o[0] = r; o[1] = g; o[2] = b; o[3] = 255;
    });
  }

  /* ───────── 캔버스 텍스처 ───────── */
  /* 분필 글씨: 손글씨처럼 흔들어 쓰고, 가루가 덜 묻은 자리를 칠판색 점으로 낸다 */
  function chalk(c, r, text, x, y, px, color, align, maxW) {
    var col = color || 'rgba(244,242,232,0.93)';
    /* 글자를 조금씩 흔들어 쓰느라 잰 폭보다 살짝 넓어질 수 있어, 그만큼 여유를 두고 맞춘다 */
    px = T.fitPx(c, text, px, FONT.chalk, maxW ? maxW * 0.97 : 0);
    var w = T.hand(c, r, text, x, y, px, FONT.chalk, col, align, 1);
    c.globalAlpha = 0.28;
    T.hand(c, GX.rng(MM.floor(x * 7 + y * 13)), text, x + 1.4, y + 1.0, px, FONT.chalk, col, align, 1);
    c.globalAlpha = 1;
    var x0 = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x), n = MM.round(w * px / 40);
    for (var i = 0; i < n; i++) {
      c.fillStyle = 'rgba(41,86,67,' + (0.3 + r() * 0.5).toFixed(2) + ')';
      c.fillRect(x0 + r() * w, y - px * 0.86 + r() * px * 1.06, 1 + r() * 2.4, 1 + r() * 1.5);
    }
    return w;
  }
  /* 손으로 그은 분필 선 */
  function chalkLine(c, r, x0, y0, x1, y1, color, width) {
    var len = MM.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)), n = MM.max(2, MM.round(len / 46));
    c.strokeStyle = color || 'rgba(244,242,232,0.8)'; c.lineWidth = width || 3.5; c.lineCap = 'round'; c.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) {
      c.globalAlpha = pass ? 0.3 : 0.85;
      c.beginPath();
      for (var i = 0; i <= n; i++) {
        var t = i / n, px = x0 + (x1 - x0) * t + (r() - 0.5) * 2.4, py = y0 + (y1 - y0) * t + (r() - 0.5) * 2.4 + pass * 1.2;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  function drawBoard() {
    var Wd = 2048, Hd = 560, cv = newCanvas(Wd, Hd), c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, Hd);
    g.addColorStop(0, '#2c5a46'); g.addColorStop(0.5, '#295542'); g.addColorStop(1, '#234a39');
    c.fillStyle = g; c.fillRect(0, 0, Wd, Hd);
    var r = GX.rng(77), i;
    /* 지우개 자국·가루 얼룩 */
    c.lineCap = 'round';
    for (i = 0; i < 70; i++) {
      c.strokeStyle = 'rgba(255,255,255,' + (0.010 + r() * 0.024).toFixed(3) + ')';
      c.lineWidth = 46 + r() * 96;
      var sx = r() * Wd, sy = r() * Hd;
      c.beginPath(); c.moveTo(sx, sy);
      c.quadraticCurveTo(sx + 150 + r() * 200, sy + (r() - 0.5) * 80, sx + 320 + r() * 380, sy + (r() - 0.5) * 60);
      c.stroke();
    }
    for (i = 0; i < 26; i++) {
      c.fillStyle = 'rgba(255,255,255,' + (0.02 + r() * 0.03).toFixed(3) + ')';
      c.fillRect(r() * Wd, Hd - 14 - r() * 40, 60 + r() * 220, 10 + r() * 34);
    }
    for (i = 0; i < 1500; i++) {
      c.fillStyle = r() > 0.4 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      c.fillRect(r() * Wd, r() * Hd, 1 + r() * 3, 1 + r() * 2);
    }
    c.textBaseline = 'alphabetic';
    var white = 'rgba(244,242,232,0.94)', yel = 'rgba(255,233,140,0.95)', pink = 'rgba(255,186,186,0.95)', blue = 'rgba(176,220,255,0.92)';

    /* 글마다 차지해도 되는 폭을 함께 준다: 손글씨 글꼴이 없는 환경에서는 넓은 글꼴로 바뀌므로, 그때는 그 폭에 맞게 줄여 쓴다
       (그러지 않으면 시험명이 양옆의 시간표·유의사항을 덮고, 유의사항은 칠판 밖으로 잘린다) */
    /* 가운데: 시험명 · 고사실(왼쪽 시간표 590 과 오른쪽 유의사항 1452 사이) */
    chalk(c, r, '세무사 제1차 시험', 1010, 176, 142, white, 'center', 780);
    chalkLine(c, r, 690, 208, 1340, 204, 'rgba(244,242,232,0.75)', 4);
    chalk(c, r, '제 3 고사실', 1010, 318, 106, yel, 'center', 760);
    chalk(c, r, '세법학개론 · 회계학개론', 1010, 410, 60, white, 'center', 780);
    chalk(c, r, '응시 20명   수험번호 2030 0301 ~ 0320', 1010, 486, 42, blue, 'center', 780);

    /* 왼쪽: 시험 시간표(칸 하나의 폭 260) */
    chalk(c, r, '2030. 5. 4. (토)', 74, 62, 40, 'rgba(244,242,232,0.8)', 'left', 500);
    chalk(c, r, '시험 시간표', 74, 142, 72, yel, 'left', 500);
    chalkLine(c, r, 70, 160, 352, 156, 'rgba(255,233,140,0.75)', 3.5);
    chalkLine(c, r, 70, 184, 590, 184); chalkLine(c, r, 70, 258, 590, 258); chalkLine(c, r, 70, 520, 590, 520);
    chalkLine(c, r, 70, 184, 70, 520); chalkLine(c, r, 590, 184, 590, 520); chalkLine(c, r, 330, 184, 330, 520);
    chalk(c, r, '구 분', 200, 240, 50, white, 'center', 230); chalk(c, r, '시 각', 460, 240, 50, white, 'center', 230);
    var rows = [['입실 완료', '09:00'], ['준비령', '09:20'], ['본령 (시작)', '09:30'], ['종료령', '10:50']];
    for (i = 0; i < rows.length; i++) {
      chalk(c, r, rows[i][0], 200, 312 + i * 62, 52, i === 2 ? yel : white, 'center', 230);
      chalk(c, r, rows[i][1], 460, 312 + i * 62, 54, i === 2 ? yel : white, 'center', 230);
      if (i < 3) chalkLine(c, r, 70, 330 + i * 62, 590, 330 + i * 62, 'rgba(244,242,232,0.4)', 2);
    }

    /* 오른쪽: 유의사항(칠판 오른쪽 끝 2048 까지). 다섯 줄은 가장 긴 줄에 맞춘 한 가지 크기로 쓴다 */
    var noteW = Wd - 1452 - 30;
    chalk(c, r, '수험자 유의사항', 1452, 110, 70, pink, 'left', noteW);
    chalkLine(c, r, 1448, 128, 1846, 124, 'rgba(255,186,186,0.75)', 3.5);
    var notes = ['① 본령 전 문제지 넘기지 않기', '② 전자기기는 전원 끄고 제출', '③ 답안은 컴퓨터용 사인펜으로', '④ 종료령 후 답안 작성 금지', '⑤ 부정행위 시 즉시 퇴실 · 무효'];
    var notePx = 51;
    for (i = 0; i < notes.length; i++) notePx = MM.min(notePx, T.fitPx(c, notes[i], 51, FONT.chalk, noteW * 0.97));
    for (i = 0; i < notes.length; i++) chalk(c, r, notes[i], 1452, 208 + i * 72, notePx, white, 'left');
    return cv;
  }

  function drawClock() {
    var S = 512, cv = newCanvas(S, S), c = cv.getContext('2d'), h = S / 2;
    c.fillStyle = '#1b1e23'; c.fillRect(0, 0, S, S);
    var g = c.createRadialGradient(h, h * 0.9, 20, h, h, h);
    g.addColorStop(0, '#fdfcf8'); g.addColorStop(0.85, '#f6f4ec'); g.addColorStop(1, '#dedbd0');
    c.beginPath(); c.arc(h, h, h - 10, 0, MM.PI * 2); c.fillStyle = g; c.fill();
    c.fillStyle = '#17191d';
    for (var i = 0; i < 60; i++) {
      var a = i / 60 * MM.PI * 2, big = i % 5 === 0;
      c.save(); c.translate(h, h); c.rotate(a);
      c.fillRect(big ? -5 : -1.6, -(h - 20), big ? 10 : 3.2, big ? 28 : 13);
      c.restore();
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    T.font(c, 58, FONT.sans, true);
    for (i = 1; i <= 12; i++) {
      var b = i / 12 * MM.PI * 2;
      c.fillText(String(i), h + MM.sin(b) * 172, h + 3 - MM.cos(b) * 172);
    }
    c.fillStyle = '#6b7078'; T.font(c, 17, FONT.sans, true); c.fillText('QUARTZ', h, h + 78);
    return cv;
  }

  function drawFlag() {
    var Wf = 540, Hf = 360, cv = newCanvas(Wf, Hf), c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, Wf, Hf);
    var cx = Wf / 2, cy = Hf / 2, R = Hf / 4;
    var th = MM.atan2(2, 3), dx = MM.cos(th), dy = MM.sin(th);
    c.beginPath(); c.arc(cx, cy, R, th - MM.PI, th); c.closePath(); c.fillStyle = '#cd2e3a'; c.fill();
    c.beginPath(); c.arc(cx, cy, R, th, th + MM.PI); c.closePath(); c.fillStyle = '#0047a0'; c.fill();
    c.beginPath(); c.arc(cx - dx * R / 2, cy - dy * R / 2, R / 2, 0, MM.PI * 2); c.fillStyle = '#cd2e3a'; c.fill();
    c.beginPath(); c.arc(cx + dx * R / 2, cy + dy * R / 2, R / 2, 0, MM.PI * 2); c.fillStyle = '#0047a0'; c.fill();
    /* 4괘: [방향 각도, 바깥→안쪽 막대의 끊김 여부] */
    var dist = R * (1 + 0.5 + 1 / 3);
    var gwae = [
      [th + MM.PI, [0, 0, 0]],        /* 건: 왼쪽 위 */
      [th, [1, 1, 1]],                  /* 곤: 오른쪽 아래 */
      [-th, [1, 0, 1]],                 /* 감: 오른쪽 위 */
      [MM.PI - th, [0, 1, 0]]         /* 리: 왼쪽 아래 */
    ];
    c.fillStyle = '#000000';
    var bar = R / 6, gap = R / 12;
    for (var i = 0; i < 4; i++) {
      var ang = gwae[i][0];
      c.save();
      c.translate(cx + MM.cos(ang) * dist, cy + MM.sin(ang) * dist);
      c.rotate(ang - MM.PI / 2);
      for (var k = 0; k < 3; k++) {
        var yy = (k - 1) * (bar + gap) - bar / 2;
        if (gwae[i][1][2 - k]) {
          c.fillRect(-R / 2, yy, R / 2 - gap / 2, bar);
          c.fillRect(gap / 2, yy, R / 2 - gap / 2, bar);
        } else {
          c.fillRect(-R / 2, yy, R, bar);
        }
      }
      c.restore();
    }
    return cv;
  }

  function drawMotto() {
    var Wm = 768, Hm = 340, cv = newCanvas(Wm, Hm), c = cv.getContext('2d');
    c.fillStyle = '#f4efe0'; c.fillRect(0, 0, Wm, Hm);
    T.paperGrain(c, 0, 0, Wm, Hm, 4, 1.5);
    c.strokeStyle = '#b9ad90'; c.lineWidth = 6; c.strokeRect(14, 14, Wm - 28, Hm - 28);
    c.fillStyle = '#9b2c22'; c.fillRect(44, 44, 70, 130);
    c.fillStyle = '#f4efe0'; c.textAlign = 'center'; c.textBaseline = 'middle';
    T.font(c, 48, FONT.serif, true);
    c.fillText('급', 79, 82); c.fillText('훈', 79, 138);
    c.fillStyle = '#17150f';
    T.font(c, 230, FONT.brush, true);
    c.fillText('정', 300, 178); c.fillText('직', 560, 178);
    return cv;
  }

  GX.examNo = function (seat) { return '2030 03' + (seat + 1 < 10 ? '0' : '') + (seat + 1); };

  /* 책상 수험번호 스티커 20장을 한 장에 (4열 x 5행, 칸 512x204) */
  function drawStickers() {
    var cv = newCanvas(2048, 1024), c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 2048, 1024);
    for (var s = 0; s < 20; s++) {
      var x = (s % 4) * 512, y = MM.floor(s / 4) * 204;
      c.fillStyle = '#fffdf6'; c.fillRect(x, y, 512, 204);
      c.strokeStyle = '#27405f'; c.lineWidth = 8; c.strokeRect(x + 8, y + 8, 496, 188);
      c.fillStyle = '#27405f'; c.fillRect(x + 8, y + 8, 496, 50);
      c.fillStyle = '#ffffff'; c.textAlign = 'left'; c.textBaseline = 'middle';
      T.font(c, 30, FONT.sans, true);
      c.fillText('세무사 1차 · 제3고사실', x + 26, y + 34);
      c.textAlign = 'right';
      c.fillText('좌석 ' + (s + 1), x + 486, y + 34);
      c.fillStyle = '#10151c'; c.textAlign = 'center';
      T.font(c, 104, FONT.sans, true);
      c.fillText(GX.examNo(s), x + 256, y + 128);
    }
    return cv;
  }

  function drawSeatChart() {
    var Wc = 1024, Hc = 1340, cv = newCanvas(Wc, Hc), c = cv.getContext('2d');
    c.fillStyle = '#fdfcf7'; c.fillRect(0, 0, Wc, Hc);
    c.strokeStyle = '#1c2530'; c.lineWidth = 6; c.strokeRect(22, 22, Wc - 44, Hc - 44);
    c.fillStyle = '#1c2530'; c.textAlign = 'center'; c.textBaseline = 'middle';
    T.font(c, 70, FONT.sans, true); c.fillText('제3고사실 좌석 배치도', Wc / 2, 104);
    T.font(c, 36, FONT.sans); c.fillText('세무사 제1차 시험', Wc / 2, 172);
    c.fillStyle = '#2f5d4a'; c.fillRect(212, 222, 600, 60);
    c.fillStyle = '#ffffff'; T.font(c, 36, FONT.sans, true); c.fillText('칠  판', Wc / 2, 253);
    var gx = 132, gy = 330, cw = 190, ch = 150;
    for (var col = 0; col < 4; col++) {
      for (var row = 0; row < 5; row++) {
        var s = col * 5 + row, x = gx + col * cw, y = gy + row * ch;
        c.fillStyle = '#f1ede0'; c.fillRect(x + 12, y + 10, cw - 24, ch - 26);
        c.strokeStyle = '#3a4654'; c.lineWidth = 3; c.strokeRect(x + 12, y + 10, cw - 24, ch - 26);
        c.fillStyle = '#1c2530';
        T.font(c, 50, FONT.sans, true); c.fillText(GX.examNo(s).slice(5), x + cw / 2, y + 58);
        T.font(c, 22, FONT.sans); c.fillText(GX.examNo(s), x + cw / 2, y + 102);
      }
    }
    c.save(); c.translate(76, gy + 2.5 * ch); c.rotate(-MM.PI / 2);
    T.font(c, 34, FONT.sans, true); c.fillStyle = '#4b6b8c'; c.fillText('창  측', 0, 0); c.restore();
    c.save(); c.translate(Wc - 76, gy + 2.5 * ch); c.rotate(MM.PI / 2);
    c.fillStyle = '#8c5b4b'; T.font(c, 34, FONT.sans, true); c.fillText('복 도 측', 0, 0); c.restore();
    c.fillStyle = '#8c5b4b'; T.font(c, 30, FONT.sans, true);
    c.fillText('출입문(뒷문) ▶', Wc - 190, gy + 5 * ch + 26);
    c.fillStyle = '#1c2530'; T.font(c, 32, FONT.sans);
    c.fillText('※ 본인 수험번호가 붙은 자리에 앉아 주십시오.', Wc / 2, Hc - 150);
    c.fillText('※ 번호는 수험번호 끝 네 자리입니다.', Wc / 2, Hc - 100);
    return cv;
  }

  function drawDoorSign() {
    var Wc = 1024, Hc = 724, cv = newCanvas(Wc, Hc), c = cv.getContext('2d');
    c.fillStyle = '#fefefb'; c.fillRect(0, 0, Wc, Hc);
    c.strokeStyle = '#111111'; c.lineWidth = 10; c.strokeRect(26, 26, Wc - 52, Hc - 52);
    c.fillStyle = '#111111'; c.textAlign = 'center'; c.textBaseline = 'middle';
    T.font(c, 54, FONT.sans, true); c.fillText('세무사 제1차 시험', Wc / 2, 122);
    T.font(c, 190, FONT.sans, true); c.fillText('제3고사실', Wc / 2, 312);
    c.fillRect(120, 440, Wc - 240, 4);
    T.font(c, 50, FONT.sans, true); c.fillText('수험번호  ' + GX.examNo(0) + ' ~ ' + GX.examNo(19), Wc / 2, 520);
    c.fillStyle = '#b3261e'; T.font(c, 44, FONT.sans, true); c.fillText('수험자 외 출입 금지', Wc / 2, 620);
    /* 네 귀퉁이 테이프 */
    c.fillStyle = 'rgba(214,202,160,0.75)';
    c.fillRect(0, 0, 90, 36); c.fillRect(Wc - 90, 0, 90, 36); c.fillRect(0, Hc - 36, 90, 36); c.fillRect(Wc - 90, Hc - 36, 90, 36);
    return cv;
  }

  function paper(c, x, y, w, h, title, tint) {
    c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x + 5, y + 6, w, h);
    c.fillStyle = tint || '#fdfcf6'; c.fillRect(x, y, w, h);
    c.fillStyle = '#c9423a';
    c.beginPath(); c.arc(x + w / 2, y + 16, 8, 0, MM.PI * 2); c.fill();
    if (title) {
      c.fillStyle = '#1b2430'; c.textAlign = 'center'; c.textBaseline = 'middle';
      T.font(c, 34, FONT.sans, true); c.fillText(title, x + w / 2, y + 62);
      c.fillRect(x + 40, y + 92, w - 80, 3);
    }
  }
  function felt(c, w, h) {
    c.fillStyle = '#4c8257'; c.fillRect(0, 0, w, h);
    var r = GX.rng(5);
    for (var i = 0; i < 900; i++) {
      c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
      c.fillRect(r() * w, r() * h, 2 + r() * 5, 2 + r() * 3);
    }
  }

  /* 교실 옆벽 게시판: 유의사항 · 진행 순서 · 부정행위 안내 */
  function drawNotice() {
    var Wc = 2048, Hc = 436, cv = newCanvas(Wc, Hc), c = cv.getContext('2d');
    felt(c, Wc, Hc);
    paper(c, 60, 28, 620, 380, '수험자 유의사항');
    c.fillStyle = '#1b2430'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; T.font(c, 24, FONT.sans);
    var y = 150, items = [
      '1. 신분증과 수험표를 책상 위에 올려 둡니다.',
      '2. 휴대전화 등 전자기기는 전원을 끄고 제출합니다.',
      '3. 본령이 울리기 전에는 문제지를 넘기지 않습니다.',
      '4. 답안지는 컴퓨터용 사인펜으로 표기합니다.',
      '5. 종료령이 울리면 즉시 필기도구를 내려놓습니다.'
    ];
    for (var i = 0; i < items.length; i++) y = T.block(c, items[i], 96, y, 548, 34) + 12;
    paper(c, 714, 28, 620, 380, '시험 진행 순서');
    var steps = ['입실 · 자리 확인', '신분 확인 · 전자기기 제출', '준비령 → 문제지·답안지 배부', '본령 → 시험 시작', '종료령 → 답안지 제출'];
    T.font(c, 26, FONT.sans, true);
    for (i = 0; i < steps.length; i++) {
      c.fillStyle = '#2f5d7a'; T.roundRect(c, 760, 138 + i * 52, 528, 40, 8); c.fill();
      c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(steps[i], 1024, 159 + i * 52);
    }
    paper(c, 1368, 28, 620, 380, '부정행위 안내', '#fff6f3');
    c.fillStyle = '#7a1f17'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; T.font(c, 24, FONT.sans, true);
    c.fillText('다음 행위는 부정행위로 처리될 수 있습니다.', 1404, 150);
    c.fillStyle = '#1b2430'; T.font(c, 24, FONT.sans);
    y = 196;
    var bad = ['· 전자·통신기기를 지니거나 사용하는 행위', '· 다른 수험자의 답안을 보거나 보여 주는 행위', '· 본령 전 또는 종료령 후에 답안을 쓰는 행위', '· 감독관의 지시에 따르지 않는 행위'];
    for (i = 0; i < bad.length; i++) y = T.block(c, bad[i], 1404, y, 548, 34) + 14;
    return cv;
  }

  /* 뒤 게시판: 시험이라 종이로 가려 둠 */
  function drawBackBoard() {
    var Wc = 1536, Hc = 384, cv = newCanvas(Wc, Hc), c = cv.getContext('2d');
    felt(c, Wc, Hc);
    var cols = ['#f6c453', '#ef8a6b', '#8ec7e8', '#a5d58a', '#f3a7c0', '#c7b2ea'];
    c.textAlign = 'center'; c.textBaseline = 'middle';
    var title = '우리반게시판';
    for (var i = 0; i < title.length; i++) {
      c.fillStyle = cols[i % cols.length];
      c.beginPath(); c.arc(86 + i * 62, 50, 27, 0, MM.PI * 2); c.fill();
      c.fillStyle = '#30343a'; T.font(c, 32, FONT.sans, true); c.fillText(title[i], 86 + i * 62, 52);
    }
    function sheet(x, y, w, h) {
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(x + 6, y + 7, w, h);
      c.fillStyle = '#fbfaf4'; c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(196,182,140,0.85)';
      c.fillRect(x - 14, y - 8, 54, 22); c.fillRect(x + w - 40, y - 8, 54, 22);
      c.fillRect(x - 14, y + h - 14, 54, 22); c.fillRect(x + w - 40, y + h - 14, 54, 22);
    }
    sheet(60, 104, 650, 250); sheet(760, 92, 720, 262);
    c.fillStyle = '#5a5f66'; T.font(c, 30, FONT.sans, true);
    c.fillText('시험 관계로 게시물을 가렸습니다.', 1120, 226);
    return cv;
  }

  /* 여러 안내판을 한 장에. GX.SIGN_UV[name] = [u0,v0,u1,v1] */
  var SIGNS = {
    room2: [0, 0, 512, 256], room4: [512, 0, 512, 256], quiet: [0, 256, 512, 256], basket: [512, 256, 512, 256],
    envQ: [0, 512, 512, 256], envA: [512, 512, 512, 256], exit: [0, 768, 384, 192], plate: [512, 768, 512, 256],
    switches: [384, 768, 128, 192], extg: [0, 960, 192, 64], room3: [192, 960, 192, 64]
  };
  GX.SIGN_UV = {};
  Object.keys(SIGNS).forEach(function (k) {
    var r = SIGNS[k];
    GX.SIGN_UV[k] = [r[0] / 1024, r[1] / 1024, (r[0] + r[2]) / 1024, (r[1] + r[3]) / 1024];
  });
  function drawSigns() {
    var cv = newCanvas(1024, 1024), c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1024, 1024);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    function plate(r, text, sub) {
      c.fillStyle = '#fefefb'; c.fillRect(r[0], r[1], r[2], r[3]);
      c.strokeStyle = '#111111'; c.lineWidth = 8; c.strokeRect(r[0] + 12, r[1] + 12, r[2] - 24, r[3] - 24);
      c.fillStyle = '#111111'; T.font(c, 96, FONT.sans, true); c.fillText(text, r[0] + r[2] / 2, r[1] + (sub ? 104 : r[3] / 2));
      if (sub) { T.font(c, 36, FONT.sans); c.fillText(sub, r[0] + r[2] / 2, r[1] + 190); }
    }
    plate(SIGNS.room2, '제2고사실', '세무사 제1차 시험');
    plate(SIGNS.room4, '제4고사실', '세무사 제1차 시험');
    var q = SIGNS.quiet;
    c.fillStyle = '#fff7d6'; c.fillRect(q[0], q[1], q[2], q[3]);
    c.strokeStyle = '#b3261e'; c.lineWidth = 10; c.strokeRect(q[0] + 14, q[1] + 14, q[2] - 28, q[3] - 28);
    c.fillStyle = '#b3261e'; T.font(c, 120, FONT.sans, true); c.fillText('정  숙', q[0] + 256, q[1] + 104);
    c.fillStyle = '#30343a'; T.font(c, 40, FONT.sans, true); c.fillText('시험 중입니다', q[0] + 256, q[1] + 196);
    var b = SIGNS.basket;
    c.fillStyle = '#ffffff'; c.fillRect(b[0], b[1], b[2], b[3]);
    c.fillStyle = '#1f4e8c'; c.fillRect(b[0], b[1], b[2], 86);
    c.fillStyle = '#ffffff'; T.font(c, 46, FONT.sans, true); c.fillText('제3고사실', b[0] + 256, b[1] + 44);
    c.fillStyle = '#10151c'; T.font(c, 70, FONT.sans, true); c.fillText('전자기기 수거함', b[0] + 256, b[1] + 164);
    function env(r, text) {
      c.fillStyle = '#c9a471'; c.fillRect(r[0], r[1], r[2], r[3]);
      c.fillStyle = '#fdfcf6'; c.fillRect(r[0] + 60, r[1] + 44, r[2] - 120, r[3] - 88);
      c.strokeStyle = '#30343a'; c.lineWidth = 4; c.strokeRect(r[0] + 60, r[1] + 44, r[2] - 120, r[3] - 88);
      c.fillStyle = '#10151c'; T.font(c, 76, FONT.sans, true); c.fillText(text, r[0] + r[2] / 2, r[1] + 108);
      T.font(c, 30, FONT.sans); c.fillText('제3고사실 · 봉인', r[0] + r[2] / 2, r[1] + 176);
    }
    env(SIGNS.envQ, '문 제 지'); env(SIGNS.envA, '답 안 지');
    var e = SIGNS.exit;
    c.fillStyle = '#1d8a4e'; c.fillRect(e[0], e[1], e[2], e[3]);
    c.fillStyle = '#ffffff'; T.font(c, 92, FONT.sans, true); c.fillText('비상구', e[0] + 192, e[1] + 98);
    var p = SIGNS.plate;
    c.fillStyle = '#2b4a6b'; c.fillRect(p[0], p[1], p[2], p[3]);
    c.fillStyle = '#ffffff'; T.font(c, 150, FONT.sans, true); c.fillText('3 - 2', p[0] + 256, p[1] + 132);
    /* 전등 스위치 판 */
    var s = SIGNS.switches;
    c.fillStyle = '#f3f2ec'; c.fillRect(s[0], s[1], s[2], s[3]);
    c.strokeStyle = '#c9c7bd'; c.lineWidth = 3; c.strokeRect(s[0] + 4, s[1] + 4, s[2] - 8, s[3] - 8);
    for (var i = 0; i < 3; i++) {
      c.fillStyle = '#e4e2da'; c.fillRect(s[0] + 26, s[1] + 20 + i * 56, 76, 44);
      c.strokeStyle = '#b9b7ad'; c.lineWidth = 2; c.strokeRect(s[0] + 26, s[1] + 20 + i * 56, 76, 44);
      c.fillStyle = '#d2603a'; c.fillRect(s[0] + 60, s[1] + 24 + i * 56, 8, 5);
    }
    var x = SIGNS.extg;
    c.fillStyle = '#c0281e'; c.fillRect(x[0], x[1], x[2], x[3]);
    c.fillStyle = '#ffffff'; T.font(c, 40, FONT.sans, true); c.fillText('소 화 기', x[0] + 96, x[1] + 33);
    var r3 = SIGNS.room3;
    c.fillStyle = '#2b4a6b'; c.fillRect(r3[0], r3[1], r3[2], r3[3]);
    c.fillStyle = '#ffffff'; T.font(c, 38, FONT.sans, true); c.fillText('제3고사실', r3[0] + 96, r3[1] + 33);
    return cv;
  }

  /* 다른 수험생 책상에 놓이는 종이와 소품을 한 장에(2048x1024). GX.PAPER_UV[name] = [u0,v0,u1,v1] */
  var PAPERS = {
    cover: [0, 0, 512, 724], open: [512, 0, 512, 724], open2: [1024, 0, 512, 724], omr: [1536, 0, 348, 512],
    card: [1536, 512, 256, 164], ticket: [1792, 512, 256, 205], back: [0, 724, 512, 300], white: [1900, 20, 8, 8],
    watch: [1536, 724, 128, 128], tape: [1664, 724, 128, 128], penLabel: [512, 724, 512, 64], stack: [512, 800, 256, 32]
  };
  GX.PAPER_UV = {};
  Object.keys(PAPERS).forEach(function (k) {
    var r = PAPERS[k];
    GX.PAPER_UV[k] = [r[0] / 2048, r[1] / 1024, (r[0] + r[2]) / 2048, (r[1] + r[3]) / 1024];
  });
  /* 문제지 한 쪽을 글줄 흉내로 채운다(멀리서 보는 남의 책상용) */
  function fakePage(c, px, seed, title) {
    var rr = GX.rng(seed);
    c.fillStyle = '#f9f8f2'; c.fillRect(px, 0, 512, 724);
    c.fillStyle = '#222222'; c.fillRect(px + 36, 58, 440, 3); c.fillRect(px + 36, 64, 440, 1);
    T.font(c, 20, FONT.serif, true); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(title, px + 38, 40);
    c.textAlign = 'right'; T.font(c, 15, FONT.serif); c.fillText('A형', px + 474, 40); c.textAlign = 'left';
    var ly = 92;
    for (var qn = 0; qn < 4; qn++) {
      c.fillStyle = '#222222'; T.font(c, 20, FONT.serif, true); c.fillText(String(qn + 1 + MM.floor(seed % 3) * 4) + '.', px + 38, ly + 6);
      c.globalAlpha = 0.6;
      for (var l = 0; l < 2; l++) { c.fillRect(px + 70, ly + l * 20, 300 + rr() * 100, 5); }
      for (l = 0; l < 5; l++) { c.fillRect(px + 84, ly + 50 + l * 18, 180 + rr() * 180, 4); }
      c.globalAlpha = 1;
      if (rr() > 0.45) {
        /* 연필로 친 동그라미·밑줄 */
        c.strokeStyle = 'rgba(40,44,52,0.7)'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(px + 76, ly + 50 + MM.floor(rr() * 5) * 18 + 2, 9, 0, MM.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(px + 90 + rr() * 60, ly + 28); c.lineTo(px + 240 + rr() * 90, ly + 29); c.stroke();
      }
      ly += 158;
    }
    T.paperGrain(c, px, 0, 512, 724, seed + 40, 1);
  }
  function drawPapers() {
    var cv = newCanvas(2048, 1024), c = cv.getContext('2d'), i, k;
    c.fillStyle = '#fbfaf5'; c.fillRect(0, 0, 2048, 1024);
    /* 표지 512x724 */
    c.fillStyle = '#f9f8f2'; c.fillRect(0, 0, 512, 724);
    c.strokeStyle = '#222222'; c.lineWidth = 4; c.strokeRect(30, 30, 452, 664);
    c.fillStyle = '#111111'; c.textAlign = 'center'; c.textBaseline = 'middle';
    T.font(c, 34, FONT.serif, true); c.fillText('세무사 제1차 시험', 256, 120);
    T.font(c, 70, FONT.serif, true); c.fillText('문 제 지', 256, 220);
    c.strokeRect(196, 286, 120, 90); T.font(c, 54, FONT.serif, true); c.fillText('A형', 256, 333);
    T.font(c, 24, FONT.serif); c.fillText('세법학개론 · 회계학개론', 256, 430);
    c.fillStyle = '#b3261e'; T.font(c, 26, FONT.sans, true);
    c.fillText('본령이 울리기 전에는', 256, 560); c.fillText('문제지를 넘기지 마십시오.', 256, 598);
    T.paperGrain(c, 0, 0, 512, 724, 12, 1);
    /* 펼친 면 두 가지 */
    fakePage(c, 512, 9, '세법학개론'); fakePage(c, 1024, 31, '회계학개론');
    /* 답안지 348x512 */
    var ox = 1536;
    c.fillStyle = '#fff8f6'; c.fillRect(ox, 0, 348, 512);
    c.strokeStyle = '#d8605a'; c.lineWidth = 3; c.strokeRect(ox + 22, 12, 314, 488);
    c.fillStyle = '#111111';
    for (i = 0; i < 22; i++) c.fillRect(ox + 4, 22 + i * 22, 11, 6);
    c.fillStyle = '#c2413b'; c.textAlign = 'center'; T.font(c, 24, FONT.sans, true); c.fillText('답 안 지', ox + 180, 40);
    c.fillRect(ox + 22, 62, 314, 2); c.fillRect(ox + 22, 118, 314, 2);
    c.fillStyle = '#f3c5c0'; c.fillRect(ox + 34, 72, 120, 38); c.fillRect(ox + 170, 72, 154, 38);
    c.lineWidth = 2;
    for (var r = 0; r < 10; r++) {
      for (k = 0; k < 5; k++) { T.oval(c, ox + 104 + k * 46, 150 + r * 35, 9, 12); c.stroke(); }
      c.fillStyle = '#c2413b'; T.font(c, 19, FONT.sans, true); c.fillText(String(r + 1), ox + 52, 151 + r * 35);
    }
    /* 신분증 256x164 */
    var cx = 1536, cy = 512;
    c.fillStyle = '#dfe9f3'; c.fillRect(cx, cy, 256, 164);
    c.fillStyle = '#3b6ea5'; c.fillRect(cx, cy, 256, 34);
    c.fillStyle = '#ffffff'; T.font(c, 20, FONT.sans, true); c.fillText('신 분 증', cx + 128, cy + 18);
    c.fillStyle = '#b9c4cf'; c.fillRect(cx + 18, cy + 50, 76, 96);
    c.fillStyle = '#8894a1'; c.beginPath(); c.arc(cx + 56, cy + 82, 20, 0, MM.PI * 2); c.fill(); c.fillRect(cx + 30, cy + 108, 52, 38);
    c.fillStyle = '#66707c'; c.fillRect(cx + 112, cy + 60, 120, 9); c.fillRect(cx + 112, cy + 84, 96, 9); c.fillRect(cx + 112, cy + 108, 110, 9);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(cx + 170, cy + 118, 66, 30);
    /* 수험표 256x205 */
    var tx = 1792;
    c.fillStyle = '#fffef8'; c.fillRect(tx, 512, 256, 205);
    c.strokeStyle = '#333333'; c.lineWidth = 3; c.strokeRect(tx + 8, 520, 240, 189);
    c.fillStyle = '#111111'; T.font(c, 26, FONT.sans, true); c.fillText('수 험 표', tx + 128, 548);
    c.fillStyle = '#c3ccd6'; c.fillRect(tx + 22, 574, 58, 74);
    c.fillStyle = '#555555'; c.fillRect(tx + 94, 580, 132, 6); c.fillRect(tx + 94, 604, 100, 6); c.fillRect(tx + 94, 628, 118, 6);
    c.fillRect(tx + 22, 664, 200, 5); c.fillRect(tx + 22, 682, 150, 5);
    /* 문제지 뒷면(넘길 때 비쳐 보이는 옅은 글줄) 512x300 */
    c.fillStyle = '#f6f5ee'; c.fillRect(0, 724, 512, 300);
    var rb = GX.rng(3);
    c.fillStyle = 'rgba(60,60,66,0.2)';
    for (i = 0; i < 13; i++) c.fillRect(40 + (i % 4 === 0 ? 0 : 26), 748 + i * 20, 250 + rb() * 180, 5);
    /* 컴퓨터용 사인펜 몸통에 찍힌 글씨 512x64 (검은 바탕에 흰 글씨) */
    c.fillStyle = '#17181a'; c.fillRect(512, 724, 512, 64);
    c.fillStyle = '#f2f1ea'; c.textAlign = 'left'; T.font(c, 27, FONT.sans, true); c.fillText('컴퓨터용 사인펜', 512 + 150, 757);
    c.fillStyle = '#d9b74a'; c.fillRect(512 + 96, 724, 10, 64); c.fillRect(512 + 112, 724, 4, 64);
    c.fillStyle = '#f2f1ea'; T.font(c, 17, FONT.sans, true); c.fillText('OMR · 0.7', 512 + 390, 758);
    /* 종이 뭉치 옆면 256x32 */
    c.fillStyle = '#efeee6'; c.fillRect(512, 800, 256, 32);
    c.fillStyle = 'rgba(120,118,108,0.5)';
    for (i = 0; i < 8; i++) c.fillRect(512, 802 + i * 4, 256, 1);
    /* 손목시계 문자판 128x128 */
    var wx = 1536 + 64, wy = 724 + 64;
    c.fillStyle = '#2a2c30'; c.fillRect(1536, 724, 128, 128);
    c.beginPath(); c.arc(wx, wy, 58, 0, MM.PI * 2); c.fillStyle = '#f7f6f0'; c.fill();
    c.fillStyle = '#1c1d20';
    for (i = 0; i < 12; i++) {
      c.save(); c.translate(wx, wy); c.rotate(i / 12 * MM.PI * 2); c.fillRect(-2, -54, 4, i % 3 === 0 ? 13 : 7); c.restore();
    }
    /* 수정테이프 윗면 128x128 */
    c.fillStyle = '#e9eef2'; c.fillRect(1664, 724, 128, 128);
    c.fillStyle = '#4f9bd6'; T.roundRect(c, 1672, 748, 112, 80, 30); c.fill();
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; T.font(c, 20, FONT.sans, true); c.fillText('수정테이프', 1728, 789);
    /* 순백 조각 */
    c.fillStyle = '#ffffff'; c.fillRect(1896, 16, 16, 16);
    return cv;
  }

  /* 먼 하늘·구름·산 능선(창밖 맨 뒤 배경). 가로로 아주 넓게 펼쳐 쓴다 */
  function drawSky() {
    var Wc = 2048, Hc = 1024, cv = newCanvas(Wc, Hc), c = cv.getContext('2d');
    var hz = MM.round(Hc * 0.66), r = GX.rng(1234), i, k;
    var g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#5f9fe0'); g.addColorStop(0.45, '#8fc0ea'); g.addColorStop(0.8, '#c4def2'); g.addColorStop(1, '#e3eff7');
    c.fillStyle = g; c.fillRect(0, 0, Wc, hz);
    /* 구름: 뭉게구름 몇 덩이 + 엷은 새털구름 */
    for (i = 0; i < 22; i++) {
      var cx = r() * Wc, cy = hz * (0.18 + r() * 0.62), s = 34 + r() * 86;
      for (k = 0; k < 9; k++) {
        c.fillStyle = 'rgba(255,255,255,' + (0.1 + r() * 0.13).toFixed(2) + ')';
        c.beginPath(); c.arc(cx + (r() - 0.5) * s * 3.4, cy + (r() - 0.5) * s * 0.5, s * (0.36 + r() * 0.5), 0, MM.PI * 2); c.fill();
      }
      c.fillStyle = 'rgba(210,222,234,0.12)';
      c.beginPath(); c.arc(cx, cy + s * 0.34, s * 1.1, 0, MM.PI * 2); c.fill();
    }
    for (i = 0; i < 14; i++) {
      c.strokeStyle = 'rgba(255,255,255,' + (0.06 + r() * 0.08).toFixed(2) + ')'; c.lineWidth = 6 + r() * 16; c.lineCap = 'round';
      var sx = r() * Wc, sy = r() * hz * 0.5;
      c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx + 160, sy - 20 + r() * 40, sx + 300 + r() * 260, sy + (r() - 0.5) * 50); c.stroke();
    }
    /* 산 능선 두 겹 */
    function ridge(base, amp, colr, seed) {
      var rr = GX.rng(seed), ph = rr() * 6, ph2 = rr() * 6;
      c.fillStyle = colr; c.beginPath(); c.moveTo(0, hz + 4);
      for (var j = 0; j <= 128; j++) {
        var u = j / 128;
        c.lineTo(u * Wc, hz - base - amp * (0.5 + 0.5 * MM.sin(u * 19 + ph)) * (0.55 + 0.45 * MM.sin(u * 7.3 + ph2)) - rr() * 3);
      }
      c.lineTo(Wc, hz + 4); c.closePath(); c.fill();
    }
    ridge(16, 46, '#a9bfd4', 5); ridge(8, 30, '#8fab9d', 9); ridge(2, 16, '#7d9b83', 13);
    /* 지평선 아래: 뿌연 시가지 */
    var gg = c.createLinearGradient(0, hz, 0, Hc);
    gg.addColorStop(0, '#c9d2cf'); gg.addColorStop(0.3, '#b9c0b6'); gg.addColorStop(1, '#a8ad9c');
    c.fillStyle = gg; c.fillRect(0, hz, Wc, Hc - hz);
    for (i = 0; i < 260; i++) {
      var bw = 8 + r() * 26, bh = 4 + r() * 16, bx = r() * Wc, by = hz + 2 + r() * 60;
      c.fillStyle = ['rgba(226,224,214,0.7)', 'rgba(200,205,208,0.7)', 'rgba(176,184,186,0.7)', 'rgba(214,196,176,0.6)'][MM.floor(r() * 4)];
      c.fillRect(bx, by - bh, bw, bh);
    }
    return cv;
  }

  /* 아파트 외벽 한 칸(가로 한 세대 폭 x 세로 한 층). 반복해서 쓴다 */
  function drawApt() {
    var Wc = 256, Hc = 128, cv = newCanvas(Wc, Hc), c = cv.getContext('2d');
    c.fillStyle = '#e7e3d8'; c.fillRect(0, 0, Wc, Hc);
    c.fillStyle = '#cfcabd'; c.fillRect(0, 0, Wc, 10);
    function win(x, w) {
      var g = c.createLinearGradient(0, 30, 0, 104);
      g.addColorStop(0, '#93a9bd'); g.addColorStop(1, '#5d7186');
      c.fillStyle = g; c.fillRect(x, 30, w, 74);
      c.fillStyle = '#f2f1ec'; c.fillRect(x + w / 2 - 2, 30, 4, 74); c.fillRect(x, 30, w, 3);
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x + 4, 34, w / 2 - 10, 20);
      c.fillStyle = '#b9b4a6'; c.fillRect(x - 4, 104, w + 8, 8);
      c.fillStyle = 'rgba(40,46,54,0.5)';
      for (var i = 0; i < 6; i++) c.fillRect(x + 2 + i * (w - 4) / 5, 86, 1.5, 18);
      c.fillRect(x, 86, w, 2);
    }
    win(14, 104); win(138, 104);
    c.fillStyle = 'rgba(0,0,0,0.06)'; c.fillRect(124, 10, 8, 118);
    return cv;
  }

  /* 맞은편 교사동 외벽 한 칸(교실 창 하나 x 한 층) */
  function drawSchool() {
    var Wc = 256, Hc = 256, cv = newCanvas(Wc, Hc), c = cv.getContext('2d');
    c.fillStyle = '#e2ddcf'; c.fillRect(0, 0, Wc, Hc);
    c.fillStyle = '#cfc9ba'; c.fillRect(0, 0, Wc, 14);
    c.fillStyle = '#d8d2c3'; c.fillRect(0, 196, Wc, 60);
    var g = c.createLinearGradient(0, 60, 0, 190);
    g.addColorStop(0, '#9fb6c9'); g.addColorStop(1, '#6f879b');
    c.fillStyle = g; c.fillRect(22, 58, 212, 132);
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(28, 64, 90, 34);
    c.fillStyle = '#f3f2ec';
    c.fillRect(22, 58, 212, 5); c.fillRect(22, 185, 212, 5); c.fillRect(22, 58, 5, 132); c.fillRect(229, 58, 5, 132);
    c.fillRect(126, 58, 5, 132); c.fillRect(22, 96, 212, 4);
    c.fillStyle = '#c4beae'; c.fillRect(14, 190, 228, 9);
    c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(0, 14, 8, 242); c.fillRect(248, 14, 8, 242);
    return cv;
  }

  /* 감독관 얼굴(눈·눈썹·입·그늘)을 머리 앞면에 입힌다. kind 0 = 정감독, 1 = 부감독 */
  function drawFace(kind) {
    var S = 256, cv = newCanvas(S, S), c = cv.getContext('2d');
    var skin = kind ? '#edc7ab' : '#e3b594', dark = kind ? '#c99b82' : '#bd8d6e', lip = kind ? '#b65c58' : '#9c5a4c';
    c.fillStyle = skin; c.fillRect(0, 0, S, S);
    /* 뺨·눈두덩의 옅은 그늘 */
    var g = c.createRadialGradient(128, 118, 30, 128, 128, 150);
    g.addColorStop(0, 'rgba(255,236,220,0.35)'); g.addColorStop(1, 'rgba(120,70,50,0.25)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    function eye(x) {
      c.fillStyle = 'rgba(120,80,62,0.28)'; T.oval(c, x, 109, 27, 14); c.fill();
      c.fillStyle = '#f7f4ee'; T.oval(c, x, 112, 19, 8.5); c.fill();
      c.fillStyle = '#3a2a22'; c.beginPath(); c.arc(x, 112, 8.2, 0, MM.PI * 2); c.fill();
      c.fillStyle = '#0d0b0a'; c.beginPath(); c.arc(x, 112, 4.2, 0, MM.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(x + 2.6, 109.6, 1.8, 0, MM.PI * 2); c.fill();
      /* 윗눈꺼풀 */
      c.strokeStyle = '#2a1e1a'; c.lineWidth = kind ? 3.6 : 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - 20, 112); c.quadraticCurveTo(x, 99.5, x + 20, 111); c.stroke();
      c.strokeStyle = 'rgba(120,80,62,0.5)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x - 17, 118); c.quadraticCurveTo(x, 123, x + 17, 118); c.stroke();
    }
    eye(84); eye(172);
    /* 눈썹(정감독은 굵고 곧게) */
    c.strokeStyle = kind ? '#3a2b24' : '#1f1a18'; c.lineWidth = kind ? 5 : 7.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(60, kind ? 91 : 93); c.quadraticCurveTo(84, kind ? 82 : 86, 108, kind ? 90 : 95); c.stroke();
    c.beginPath(); c.moveTo(196, kind ? 91 : 93); c.quadraticCurveTo(172, kind ? 82 : 86, 148, kind ? 90 : 95); c.stroke();
    /* 코 그늘 · 인중 · 입 */
    c.strokeStyle = 'rgba(130,84,64,0.4)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(119, 118); c.quadraticCurveTo(113, 150, 116, 160); c.stroke();
    c.fillStyle = 'rgba(120,70,54,0.35)'; T.oval(c, 119, 163, 5, 3); c.fill(); T.oval(c, 137, 163, 5, 3); c.fill();
    c.strokeStyle = lip; c.lineWidth = kind ? 5 : 4.2;
    c.beginPath(); c.moveTo(104, 193); c.quadraticCurveTo(128, kind ? 197 : 190, 152, 193); c.stroke();
    c.strokeStyle = 'rgba(140,84,70,0.35)'; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(112, 204); c.quadraticCurveTo(128, 208, 144, 204); c.stroke();
    if (!kind) {
      /* 팔자 주름 살짝 */
      c.strokeStyle = 'rgba(130,84,64,0.3)'; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(96, 160); c.quadraticCurveTo(88, 178, 94, 196); c.stroke();
      c.beginPath(); c.moveTo(160, 160); c.quadraticCurveTo(168, 178, 162, 196); c.stroke();
    }
    c.fillStyle = dark; c.globalAlpha = 0.22; c.fillRect(0, 222, S, 34); c.globalAlpha = 1;
    return cv;
  }

  /* 엔진에 올린 텍스처 묶음을 만든다 */
  GX.buildTextures = function (eng) {
    var tx = {}, cv = {};
    tx.wood = eng.createTexture(texWood(), { repeat: true });
    tx.planks = eng.createTexture(texPlanks(), { repeat: true });
    tx.plaster = eng.createTexture(texPlaster(), { repeat: true });
    tx.terrazzo = eng.createTexture(texTerrazzo(), { repeat: true });
    tx.ceiling = eng.createTexture(texCeiling(), { repeat: true });
    tx.fabric = eng.createTexture(texFabric(), { repeat: true });
    tx.curtain = eng.createTexture(texCurtain(), { repeat: true });
    tx.ground = eng.createTexture(texGround(), {});
    tx.blob = eng.createTexture(texBlob(), { mip: false });
    tx.shaft = eng.createTexture(texShaft(), { mip: false });
    tx.glow = eng.createTexture(texGlow(), { mip: false });
    var list = {
      board: drawBoard, clock: drawClock, flag: drawFlag, motto: drawMotto, stickers: drawStickers,
      chart: drawSeatChart, doorSign: drawDoorSign, notice: drawNotice, backBoard: drawBackBoard,
      signs: drawSigns, papers: drawPapers, sky: drawSky
    };
    Object.keys(list).forEach(function (k) {
      cv[k] = list[k]();
      tx[k] = eng.createTexture(cv[k], {});
    });
    cv.apt = drawApt(); tx.apt = eng.createTexture(cv.apt, { repeat: true });
    cv.school = drawSchool(); tx.school = eng.createTexture(cv.school, { repeat: true });
    cv.face0 = drawFace(0); tx.face0 = eng.createTexture(cv.face0, {});
    cv.face1 = drawFace(1); tx.face1 = eng.createTexture(cv.face1, {});
    tx._canvas = cv;
    return tx;
  };
})(window.GX = window.GX || {});
