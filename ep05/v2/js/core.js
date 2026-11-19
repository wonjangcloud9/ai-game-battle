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
    ULT_LEVEL: 6,               // 궁극기를 배울 수 있는 레벨
    ULT_LEVELS: [6, 10, 14],    // 궁극기 1·2·3단계를 찍을 수 있는 레벨
    RANK_MAX: 4, ULT_RANK_MAX: 3,
    START_GOLD: 600,
    FIRST_WAVE: 12,             // 첫 미니언 웨이브(초)
    WAVE_INTERVAL: 25,
    SIEGE_EVERY: 3,             // n번째 웨이브마다 공성 미니언
    XP_RANGE: 22,
    KILL_GOLD: 240,
    ASSIST_GOLD: 130,
    FIRST_BLOOD: 100,
    TOWER_GOLD_GLOBAL: 90,
    TOWER_GOLD_LOCAL: 180,
    TOWER_RANGE: 13,
    CORE_RANGE: 13.5,
    TOWER_LOCK: 1.0,            // 포탑이 영웅을 새로 조준할 때의 경고 시간(초)
    TOWER_LOCK_DEFEND: 0.35,    // 아군 영웅을 때린 적에게는 훨씬 빨리 반응
    FOUNTAIN_R: 8,
    SHOP_R: 15,
    RECALL_TIME: 4.5,
    SIGHT_HERO: 23, SIGHT_MINION: 13, SIGHT_TOWER: 19, SIGHT_CORE: 22,
    ASSIST_WINDOW: 10,
    /* 경기 흐름: 초반에는 구조물이 단단하고(방비), 후반에는 점점 무너지기 쉬워진다(결전) */
    LANE_PHASE: 330,            // 이 시간까지 봇은 막타 위주로 라인전을 한다
    /* 방비: [가득 유지되는 시각, 완전히 사라지는 시각, 최대 피해 감소율] */
    FORT: { tower1: [150, 420, 0.6], tower2: [420, 690, 0.6], core: [870, 915, 0.95] },
    SHOWDOWN: 900,              // 결전(15분~): 이후 구조물이 받는 피해가 계속 늘어나고 대형 미니언이 합류한다
    SHOWDOWN_RATE: 0.012,       // 초당 증가율
    SHOWDOWN_STEP: 80,          // 이 간격(초)마다 웨이브에 합류하는 대형 미니언이 하나씩 늘어난다
    BURN_START: 1140,           // 최후의 불길(19분~): 양 팀 코어가 스스로 무너지기 시작한다 → 20분 전에 반드시 끝난다
    BURN_RATE: 0.02,            // 초당 최대 체력 대비 (잃은 포탑 하나당 25%씩 더 빨리 탄다)
    GRACE_END: 120,             // 개전 보호: 이 시간 전에는 영웅이 쓰러지는 대신 본진으로 긴급 귀환한다
    MERCY_END: 150,             // 이 시간 전에는 봇이 빈사 상태의 영웅을 끝까지 쫓아 마무리하지 않는다
    CALM_END: 90, CALM_RAMP: 210,   // 개전 직후(90초)에는 봇이 먼저 영웅을 공격하지 않고, 3분 30초까지 서서히 평소대로 돌아온다
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
