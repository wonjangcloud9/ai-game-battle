/* 해돌전쟁 — 지형 그리기
   타일 격자를 그대로 찍지 않고, 픽셀마다 색을 계산해 물가·바위 경계를 자연스럽게 만든다. */
'use strict';
(function (g0) {
  var R = g0.RTS, TILE = R.TILE, S = R.Sprites, H = S.h;
  var CHUNK = 16;                 // 청크 한 변(타일)
  var CPX = CHUNK * TILE;         // 512px
  var HALF = CPX / 2;             // 절반 해상도로 계산한 뒤 늘린다

  function Terrain(map) {
    this.map = map; this.w = map.w; this.h = map.h;
    this.cw = Math.ceil(map.w / CHUNK); this.ch = Math.ceil(map.h / CHUNK);
    this.chunks = new Array(this.cw * this.ch);
    this.noise = R.makeNoise(map.seed ^ 0x51ed27);
    this.noise2 = R.makeNoise(map.seed ^ 0x1b873593);
    this.pending = [];
    for (var i = 0; i < this.chunks.length; i++) this.pending.push(i);
  }

  // 타일 중심값을 이중선형 보간한 지형 마스크 (type: 1 물, 2 바위, 3 숲)
  Terrain.prototype.mask = function (type, fx, fy) {
    var t = this.map.terrain, w = this.w, h = this.h;
    var gx = fx - 0.5, gy = fy - 0.5;
    var x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
    var xa = x0 < 0 ? 0 : (x0 >= w ? w - 1 : x0), xb = x0 + 1 < 0 ? 0 : (x0 + 1 >= w ? w - 1 : x0 + 1);
    var ya = y0 < 0 ? 0 : (y0 >= h ? h - 1 : y0), yb = y0 + 1 < 0 ? 0 : (y0 + 1 >= h ? h - 1 : y0 + 1);
    var a = t[ya * w + xa] === type ? 1 : 0, b = t[ya * w + xb] === type ? 1 : 0;
    var c = t[yb * w + xa] === type ? 1 : 0, d = t[yb * w + xb] === type ? 1 : 0;
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };

  function mix(a, b, t) { return a + (b - a) * t; }

  Terrain.prototype.renderChunk = function (ci) {
    var cx = ci % this.cw, cy = (ci / this.cw) | 0;
    var cv = S.mk(CPX, CPX), g = cv.getContext('2d');
    // 청크마다 임시 캔버스를 새로 만든다. 하나를 돌려 쓰면 그리기를 미루는 브라우저(사파리)에서
    // 앞 청크가 뒤 청크의 픽셀로 덮여 지형이 뒤섞인다.
    var tmp = S.mk(HALF, HALF), tctx = tmp.getContext('2d'), img = tctx.createImageData(HALF, HALF);
    var data = img.data, noise = this.noise, noise2 = this.noise2;
    var ox = cx * CHUNK, oy = cy * CHUNK, px, py, p = 0;
    for (py = 0; py < HALF; py++) {
      for (px = 0; px < HALF; px++) {
        var fx = ox + (px + 0.5) / HALF * CHUNK, fy = oy + (py + 0.5) / HALF * CHUNK;
        // 경계를 살짝 일그러뜨려 자연스럽게
        var wx = fx + (noise(fx * 1.1, fy * 1.1) - 0.5) * 0.7, wy = fy + (noise(fx * 1.1 + 31, fy * 1.1 + 17) - 0.5) * 0.7;
        var mw = this.mask(1, wx, wy), mr = this.mask(2, wx, wy), mt = this.mask(3, wx, wy);
        var n1 = noise.fbm(fx * 0.16, fy * 0.16, 3), n2 = noise2(fx * 0.55, fy * 0.55), fine = noise2.hash(px + cx * 977, py + cy * 613);
        // 풀밭: 두 가지 초록 + 마른 흙 얼룩
        var r = mix(66, 98, n1), gg = mix(104, 138, n1), b = mix(62, 72, n1);
        var dirt = (noise2.fbm(fx * 0.11 + 9, fy * 0.11 + 4, 3) - 0.56) * 6;
        if (dirt > 0) { if (dirt > 1) dirt = 1; r = mix(r, 128, dirt * 0.75); gg = mix(gg, 110, dirt * 0.75); b = mix(b, 76, dirt * 0.75); }
        r += (n2 - 0.5) * 12; gg += (n2 - 0.5) * 14; b += (n2 - 0.5) * 8;
        // 숲 바닥
        if (mt > 0.25) { var ft = Math.min(1, (mt - 0.25) * 2.4); r = mix(r, 38, ft); gg = mix(gg, 66, ft); b = mix(b, 40, ft); }
        // 물가 모래 → 물
        if (mw > 0.22) {
          var sh = Math.min(1, (mw - 0.22) / 0.2);
          r = mix(r, 196, sh * 0.85); gg = mix(gg, 180, sh * 0.85); b = mix(b, 128, sh * 0.85);
          if (mw > 0.46) {
            var dp = Math.min(1, (mw - 0.46) / 0.42), wv = noise(fx * 2.2, fy * 2.2 + 50);
            var wr = mix(96, 30, dp), wg = mix(196, 112, dp), wb = mix(190, 150, dp);
            wr += (wv - 0.5) * 16; wg += (wv - 0.5) * 18; wb += (wv - 0.5) * 12;
            var edge = Math.min(1, (mw - 0.46) / 0.05);
            r = mix(r, wr, edge); gg = mix(gg, wg, edge); b = mix(b, wb, edge);
            if (mw < 0.53) { r += 38; gg += 38; b += 34; }      // 물가의 흰 잔물결
          }
        }
        // 바위: 마스크의 기울기로 왼쪽 위에서 빛이 드는 느낌
        if (mr > 0.38) {
          var k = Math.min(1, (mr - 0.38) / 0.1);
          var gxr = this.mask(2, wx + 0.22, wy) - this.mask(2, wx - 0.22, wy), gyr = this.mask(2, wx, wy + 0.22) - this.mask(2, wx, wy - 0.22);
          var lit = 0.5 + (gxr + gyr) * 1.5 + (noise(fx * 1.7 + 5, fy * 1.7) - 0.5) * 0.35;
          var crack = noise2(fx * 3.1, fy * 3.1);
          var base = 96 + lit * 70 - (crack > 0.78 ? 26 : 0);
          var rim = mr < 0.5 ? 0.62 : 1;
          r = mix(r, base * rim, k); gg = mix(gg, (base + 3) * rim, k); b = mix(b, (base + 12) * rim, k);
        }
        var f = (fine - 0.5) * 9;
        data[p++] = r + f; data[p++] = gg + f; data[p++] = b + f; data[p++] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(tmp, 0, 0, HALF, HALF, 0, 0, CPX, CPX);
    this.decorate(g, cx, cy);
    return cv;
  };

  // 풀포기, 조약돌, 꽃, 나무 — 타일마다 정해진 씨앗으로 그려 청크 경계에서도 이어진다
  Terrain.prototype.decorate = function (g, cx, cy) {
    var map = this.map, t = map.terrain, w = this.w, h = this.h, ox = cx * CHUNK, oy = cy * CHUNK;
    var trees = [], tx, ty;
    g.save(); g.translate(-ox * TILE, -oy * TILE);
    for (ty = oy - 1; ty <= oy + CHUNK; ty++) {
      for (tx = ox - 1; tx <= ox + CHUNK; tx++) {
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        var type = t[ty * w + tx];
        var rng = R.makeRng((Math.imul(ty * w + tx + 1, 2654435761) ^ map.seed) >>> 0);
        var bx = tx * TILE, by = ty * TILE, x, y, i;
        if (type === R.T_GROUND) {
          var roll = rng.next();
          if (roll < 0.16) {
            x = bx + rng.range(4, 28); y = by + rng.range(8, 28);
            g.strokeStyle = 'rgba(150,196,104,0.75)'; g.lineWidth = 1.2; g.lineCap = 'round';
            for (i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * 2, y); g.lineTo(x + i * 3.6 + rng.range(-1, 1), y - 5 - rng.range(0, 3)); g.stroke(); }
          } else if (roll < 0.2) {
            x = bx + rng.range(5, 27); y = by + rng.range(5, 27);
            H.ell(g, x, y + 1, 4.2, 2.6, 0, 'rgba(0,0,0,0.25)', null);
            H.ell(g, x, y, 3.8, 2.8, rng.range(0, 3), '#8e929a', '#3a3d44', 0.8);
            H.ell(g, x - 1, y - 0.8, 1.5, 1, 0, 'rgba(255,255,255,0.35)', null);
          } else if (roll < 0.235) {
            var fc = rng.pick(['#fff4c2', '#ffffff', '#ffd0e8', '#d8e6ff']);
            for (i = 0; i < 3; i++) { x = bx + rng.range(5, 27); y = by + rng.range(5, 27); H.circ(g, x, y, 1.5, fc, 'rgba(0,0,0,0.3)', 0.5); H.circ(g, x, y, 0.6, '#f0b030', null); }
          }
        } else if (type === R.T_TREE) {
          var n = 2 + rng.int(2);
          for (i = 0; i < n; i++) trees.push([bx + rng.range(4, 28), by + rng.range(4, 28), rng.range(10, 15), rng.next(), rng.next()]);
        } else if (type === R.T_ROCK) {
          if (rng.next() < 0.55) {
            x = bx + rng.range(8, 24); y = by + rng.range(8, 24);
            var rr = rng.range(5, 9), a0 = rng.range(0, 6);
            var pts = [];
            for (i = 0; i < 6; i++) { var a = a0 + i * 1.047, r2 = rr * rng.range(0.7, 1.1); pts.push(x + Math.cos(a) * r2, y + Math.sin(a) * r2 * 0.8); }
            H.poly(g, pts, 'rgba(255,255,255,0.13)', 'rgba(20,22,28,0.45)', 0.9);
          }
        } else if (type === R.T_WATER) {
          if (rng.next() < 0.3) {
            x = bx + rng.range(6, 26); y = by + rng.range(6, 26);
            g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1.1; g.lineCap = 'round';
            g.beginPath(); g.moveTo(x - 5, y); g.quadraticCurveTo(x, y - 2.4, x + 5, y); g.stroke();
          }
        }
      }
    }
    trees.sort(function (a, b) { return a[1] - b[1]; });
    for (var k = 0; k < trees.length; k++) {
      var tr = trees[k], tr0 = tr[0], tr1 = tr[1], rad = tr[2];
      H.ell(g, tr0 + 3, tr1 + 4, rad, rad * 0.8, 0, 'rgba(0,0,0,0.28)', null);
      var cols = tr[3] < 0.33 ? ['#7cc552', '#3f8a35', '#245a26'] : (tr[3] < 0.66 ? ['#6ab04a', '#34782f', '#1f4f22'] : ['#8fbf4e', '#4c8a34', '#2c5a24']);
      H.circ(g, tr0, tr1, rad, H.rg2(g, tr0 - rad * 0.35, tr1 - rad * 0.4, rad * 0.1, tr0, tr1, rad, [0, cols[0], 0.6, cols[1], 1, cols[2]]), 'rgba(16,30,14,0.85)', 1.1);
      for (var q = 0; q < 3; q++) {
        var qa = tr[4] * 6.28 + q * 2.1;
        H.circ(g, tr0 + Math.cos(qa) * rad * 0.45, tr1 + Math.sin(qa) * rad * 0.45, rad * 0.32, 'rgba(255,255,255,0.07)', null);
      }
    }
    g.restore();
  };

  // 프레임마다 조금씩 미리 만들어 둔다. budget: 한 번에 만들 청크 수
  Terrain.prototype.warm = function (budget, nearX, nearY) {
    if (!this.pending.length) return false;
    if (nearX !== undefined) {
      var cw = this.cw;
      this.pending.sort(function (a, b) {
        var ax = (a % cw + 0.5) * CPX - nearX, ay = (((a / cw) | 0) + 0.5) * CPX - nearY;
        var bx = (b % cw + 0.5) * CPX - nearX, by = (((b / cw) | 0) + 0.5) * CPX - nearY;
        return (ax * ax + ay * ay) - (bx * bx + by * by);
      });
    }
    while (budget-- > 0 && this.pending.length) {
      var ci = this.pending.shift();
      if (!this.chunks[ci]) this.chunks[ci] = this.renderChunk(ci);
    }
    return this.pending.length > 0;
  };

  Terrain.prototype.draw = function (ctx, x0, y0, x1, y1) {
    var c0 = Math.max(0, Math.floor(x0 / CPX)), c1 = Math.min(this.cw - 1, Math.floor(x1 / CPX));
    var r0 = Math.max(0, Math.floor(y0 / CPX)), r1 = Math.min(this.ch - 1, Math.floor(y1 / CPX));
    for (var cy = r0; cy <= r1; cy++) for (var cx = c0; cx <= c1; cx++) {
      var ci = cy * this.cw + cx;
      var cv = this.chunks[ci];
      if (!cv) {
        cv = this.chunks[ci] = this.renderChunk(ci);
        var k = this.pending.indexOf(ci);
        if (k >= 0) this.pending.splice(k, 1);
      }
      ctx.drawImage(cv, cx * CPX, cy * CPX, CPX + 0.5, CPX + 0.5);
    }
  };

  // 미니맵 바탕 (타일당 scale 픽셀)
  Terrain.prototype.minimapBase = function (size) {
    var cv = S.mk(size, size), g = cv.getContext('2d');
    var img = g.createImageData(size, size), d = img.data, t = this.map.terrain, w = this.w, h = this.h, n = this.noise;
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var tx = Math.min(w - 1, Math.floor(x / size * w)), ty = Math.min(h - 1, Math.floor(y / size * h));
      var type = t[ty * w + tx], v = (n(tx * 0.3, ty * 0.3) - 0.5) * 22, p = (y * size + x) * 4;
      var r, gg, b;
      if (type === R.T_WATER) { r = 52; gg = 130; b = 160; }
      else if (type === R.T_ROCK) { r = 118; gg = 120; b = 130; }
      else if (type === R.T_TREE) { r = 36; gg = 76; b = 40; }
      else { r = 78; gg = 116; b = 66; }
      d[p] = r + v; d[p + 1] = gg + v; d[p + 2] = b + v; d[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  };

  R.Terrain = Terrain;
})(typeof globalThis !== 'undefined' ? globalThis : this);
