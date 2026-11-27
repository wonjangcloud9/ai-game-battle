/* 해돌전쟁 — 공용 상수와 도구 함수 (브라우저/Node 공용) */
'use strict';
(function (g) {
  var R = g.RTS = g.RTS || {};

  R.TILE = 32;            // 타일 한 칸의 픽셀 크기
  R.TICK_RATE = 30;       // 초당 시뮬레이션 횟수
  R.DT = 1 / R.TICK_RATE;
  R.MAX_SUPPLY = 100;

  // 이동 계층
  R.L_GROUND = 0; R.L_HOVER = 1; R.L_AIR = 2;
  // 지형
  R.T_GROUND = 0; R.T_WATER = 1; R.T_ROCK = 2; R.T_TREE = 3;

  R.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  R.lerp = function (a, b, t) { return a + (b - a) * t; };
  R.dist = function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); };
  R.dist2 = function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
  R.wrapAngle = function (a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  };
  R.turnToward = function (cur, target, maxStep) {
    var d = R.wrapAngle(target - cur);
    if (Math.abs(d) <= maxStep) return target;
    return cur + (d > 0 ? maxStep : -maxStep);
  };

  // 씨앗 기반 난수 (mulberry32)
  R.makeRng = function (seed) {
    var s = (seed >>> 0) || 1;
    function next() {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      range: function (a, b) { return a + (b - a) * next(); },
      int: function (n) { return Math.floor(next() * n); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      chance: function (p) { return next() < p; }
    };
  };

  // 2차원 값 노이즈
  R.makeNoise = function (seed) {
    seed = seed | 0;
    function hash(x, y) {
      var h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h = h ^ (h >>> 16);
      return (h >>> 0) / 4294967296;
    }
    function smooth(t) { return t * t * (3 - 2 * t); }
    function noise(x, y) {
      var x0 = Math.floor(x), y0 = Math.floor(y);
      var fx = smooth(x - x0), fy = smooth(y - y0);
      var a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
    noise.fbm = function (x, y, oct) {
      var s = 0, amp = 0.5, f = 1, norm = 0;
      oct = oct || 4;
      for (var i = 0; i < oct; i++) { s += amp * noise(x * f, y * f); norm += amp; amp *= 0.5; f *= 2; }
      return s / norm;
    };
    noise.hash = hash;
    return noise;
  };

  // 한국어 조사 처리: 받침 유무에 따라 을/를, 이/가 등을 고른다
  R.josa = function (word, withBatchim, without) {
    if (!word) return word;
    var code = word.charCodeAt(word.length - 1);
    var has = false;
    if (code >= 0xAC00 && code <= 0xD7A3) has = ((code - 0xAC00) % 28) !== 0;
    return word + (has ? withBatchim : without);
  };

  R.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
