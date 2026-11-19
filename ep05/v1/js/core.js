/* 청홍대전 — core: 네임스페이스, 상수, 유틸리티 */
(function () {
  'use strict';
  const AOS = globalThis.AOS = globalThis.AOS || {};

  /* ---------- 상수 ---------- */
  const C = AOS.C = {
    W: 260, H: 160,
    BLUE: 0, RED: 1,
    TOP: 0, MID: 1, BOT: 2,
    LANE_NAMES: ['탑', '미드', '바텀'],
    TEAM_NAMES: ['청람', '홍염'],
    TEAM_COLORS: ['#3aa0ff', '#ff5247'],
    TEAM_DARK: ['#1b4f9c', '#9c2a22'],
    TEAM_LIGHT: ['#9bd4ff', '#ffb0a8'],

    MAX_LEVEL: 15,
    ULT_LEVEL: 5,
    START_GOLD: 600,
    PASSIVE_GOLD: 2.6,          // 초당
    FIRST_WAVE: 12,             // 첫 미니언 웨이브(초)
    WAVE_INTERVAL: 25,
    SIEGE_EVERY: 3,             // n번째 웨이브마다 공성 미니언
    XP_RANGE: 22,
    KILL_GOLD: 260,
    ASSIST_GOLD: 110,
    FIRST_BLOOD: 120,
    TOWER_GOLD_GLOBAL: 110,
    TOWER_GOLD_LOCAL: 160,
    TOWER_RANGE: 13,
    CORE_RANGE: 13.5,
    FOUNTAIN_R: 8,
    SHOP_R: 15,
    RECALL_TIME: 4.5,
    SIGHT_HERO: 23, SIGHT_MINION: 13, SIGHT_TOWER: 19, SIGHT_CORE: 22,
    ASSIST_WINDOW: 10,
  };

  /* ---------- 수학 유틸 ---------- */
  const U = AOS.U = {};
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  U.du = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  U.smooth = (t) => { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  U.easeOut = (t) => { t = U.clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); };
  U.easeOut3 = (t) => { t = U.clamp(t, 0, 1); const u = 1 - t; return 1 - u * u * u; };
  U.angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
  U.approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

  /* 시드 고정 난수 (재현 가능한 시뮬레이션) */
  U.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /* 좌표 해시 → [0,1) (장식 배치 등 결정적 난수) */
  U.hash2 = function (x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s | 0) + 1, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  U.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };
  U.fmtNum = function (n) {
    n = Math.round(n);
    return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  };

  /* 선분-점 최근접: 반환 {t, d2} */
  U.segPoint = function (px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t, cy = ay + dy * t;
    return { t, d2: (px - cx) * (px - cx) + (py - cy) * (py - cy), x: cx, y: cy };
  };
  U.segDist = function (px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  };
})();
