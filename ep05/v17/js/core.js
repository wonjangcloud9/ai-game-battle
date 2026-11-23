/* 어스름 전선 — core: 네임스페이스, 상수, 수학·색 유틸리티
   파일 구성(로드 순서): core → map → data → sim → ai → synth → audio → gfx → art → world → ui → main
   sim/ai/map/data 는 DOM 없이도 돈다(node 로 봇 대전 검증). */
(function () {
  'use strict';
  const TW = globalThis.TW = globalThis.TW || {};

  /* ---------- 상수 ---------- */
  const C = TW.C = {
    W: 228, H: 160,
    DAWN: 0, DUSK: 1, NEUTRAL: 2,
    TOP: 0, MID: 1, BOT: 2,
    LANE_NAMES: ['윗길', '가운뎃길', '아랫길'],
    TEAM_NAMES: ['새벽', '황혼'],
    /* 팀 색: 새벽 = 따뜻한 금빛, 황혼 = 차가운 보랏빛 */
    TEAM_COL: ['#ffb84a', '#b57bff'],
    TEAM_LIGHT: ['#ffe2a6', '#e2c8ff'],
    TEAM_DEEP: ['#b0641a', '#5b2fb0'],

    DT: 1 / 30,                 // 시뮬레이션 고정 틱
    MAX_LEVEL: 15,
    ULT_LEVEL: 5,               // 궁극기가 열리는 레벨
    START_GOLD: 500,
    GOLD_PER_SEC: 1.6,
    FIRST_WAVE: 1.0,            // 시작하자마자 첫 미니언이 길 위에 있다
    WAVE_INTERVAL: 22,
    SIEGE_EVERY: 3,
    XP_RANGE: 20,
    KILL_GOLD: 220, ASSIST_GOLD: 95,
    /* 첫 1분: 출전 바람(처음 맞닿을 때까지 빨리 달린다) · 첫 만남(처음 90초는 AI도 견제를 주고받는다) · 첫 처치 보상 */
    DEPLOY_DUR: 12, DEPLOY_MS: 0.7,
    OPEN_SKIRMISH: 90,
    FIRST_BLOOD_GOLD: 150, FIRST_BLOOD_XP: 80, FIRST_BLOOD_DUR: 30, FIRST_BLOOD_DMG: 0.1, FIRST_BLOOD_MS: 0.1,
    TOWER_GOLD_TEAM: 110, TOWER_GOLD_NEAR: 160,
    TOWER_RANGE: 12.5, CORE_RANGE: 13,
    FOUNTAIN_R: 9,
    RECALL_TIME: 3.5,
    SIGHT_HERO: 19, SIGHT_MINION: 9, SIGHT_TOWER: 17.5, SIGHT_CORE: 19, SIGHT_WARD: 13,
    BUSH_REVEAL_R: 2.4,         // 수풀 속 적도 이만큼 가까우면 보인다
    REVEAL_ON_ACT: 1.2,         // 수풀에서 공격·시전하면 이 시간 동안 드러난다
    ASSIST_WINDOW: 10,
    ROLL_CD: 14, ROLL_DIST: 6.2, ROLL_TIME: 0.24, ROLL_IFRAME: 0.3,   // 공용 회피(구르기)
    MULTI_WINDOW: 9,            // 연속 처치로 이어지는 시간
    BOSS_FIRST: 270, BOSS_RESPAWN: 200, BOSS_BUFF: 100,
    /* 큰 몬스터 쟁탈전(이무기 · 난전의 노을 도롱뇽): 나오기 BIG_WARN초 전에 예고하고, 그때부터 쓰러질 때까지 몬스터 자리(BIG_LIT칸 안)가
       '물빛/불빛'으로 밝아져 그 안의 영웅은 두 편 모두에게 보인다 (몰래 잡을 수 없다 → 맞붙는다). 막타를 친 편이 가져간다 */
    BIG_WARN: 20, BIG_LIT: 13, BIG_LIT_BRAWL: 9,
    ELDER_FIRST: 150, ELDER_RESPAWN: 150,
    CAMP_FIRST: 8, CAMP_RESPAWN: 75, BUFF_CAMP_RESPAWN: 100, BUFF_DUR: 80,
    /* 놀이 방식: classic = 어스름 전선(세 갈래 · 5대5) · brawl = 한 줄 난전(노을 협곡 다리 하나 · 3대3/5대5 · 영웅 무작위 · 10분) */
    MODE_NAME: { classic: '어스름 전선', brawl: '한 줄 난전' },
    BRAWL: {
      LIMIT: 600,             // 10분이 되면 끝: 큰등불이 더 많이 남은 편이 이긴다
      FINAL: 480,             // 8분부터 '마지막 불꽃': 구조물이 점점 잘 부서지고, 웨이브마다 정예병이 함께 나온다
      FINAL_STRUCT: 1.6,      // 10분에 구조물이 받는 피해 +160% (8분 0% → 10분 최대)
      GOLD: 1300, LEVEL: 3,   // 시작 골드 · 시작 레벨 (첫 싸움부터 스킬 셋에 아이템 두어 개)
      GOLD_PER_SEC: 3.2, XP_MUL: 1.7, MINION_GOLD: 1.25,
      WAVE: 15, SIEGE_EVERY: 2, FIRST_WAVE_PROG: 46,
      STRUCT_HP: { 1: 0.7, 2: 0.72, core: 0.5 },
      RESP_BASE: 4, RESP_LEVEL: 0.95, RESP_LATE: 0.6, RESP_MAX: 26,
      PACK_R: 1.9,            // 회복 꾸러미를 줍는 거리
      PACK_HEAL: 0.26, PACK_FLAT: 90, PACK_MS: 0.25, PACK_MS_DUR: 2.2,
      /* 역전 기회: 처치 차이가 벌어지면 지는 편에 따라잡을 장치가 켜진다 (단계 1~3 — 더 뒤질수록 세다)
         ① 앞선 편의 부활이 늦어진다(이긴 싸움 뒤에 밀고 들어갈 틈) ② 우리 언덕(두 등불탑 사이)의 금빛 역전 꾸러미 — 우리 편만 줍는다
         ③ 앞선 편에서 연달아 잡은 영웅에게 현상금 — 쓰러지면 우리 편 모두가 받는다.
         수치는 tools/comeback.js · comeback_sweep.js 로 봇 대전 수백 판씩 견주어 골랐다 (뒤진 편 부활을 줄이는 쪽은 판을 10:00까지 끌기만 하고 처치 차이는 거의 그대로여서 뺐다) */
      CB_ON: { 3: 4, 5: 6 },          // 이만큼 뒤지면 켜진다 (3대3 · 5대5)
      CB_STEP: { 3: 3, 5: 4 },        // 한 단계 더 = 이만큼 더 뒤짐
      CB_OFF: 2,                      // 켜진 뒤에는 (켜지는 차이 − 2)보다 좁혀져야 꺼진다 (깜빡이지 않게)
      CB_RESP: [0, 0, 0, 0],          // 단계별 부활 단축 (뒤진 편) — 재 보니 해로워서 0
      CB_LEAD_RESP: [0, 0.2, 0.3, 0.4],     // 단계별 부활 늘어남 (앞선 편)
      CB_RISE_DUR: 0, CB_RISE_DMG: 0, CB_RISE_MS: 0,      // 뒤진 편이 부활할 때 받는 '역전의 불씨' (초 · 피해 · 이동) — 지금은 끔
      CB_PACK_X: 55,                  // 역전 꾸러미 자리: 본진 쪽 끝에서 이만큼 (55 = 두 등불탑 사이)
      CB_PACK_EVERY: [0, 26, 20, 15], CB_PACK_HEAL: 0.28, CB_PACK_FLAT: 110, CB_PACK_SHIELD: 0.1, CB_PACK_DUR: 3,
      BOUNTY_STREAK: 2, BOUNTY_BASE: 100, BOUNTY_PER: 50, BOUNTY_MAX: 320, BOUNTY_XP: 90,
      /* 작은 큰 몬스터 '노을 도롱뇽': 다리 가운데 돌 마루에 기어오른다. 잡은 편 모두 SALA_BUFF초 동안 강해진다 */
      SALA_FIRST: 150, SALA_RESPAWN: 120, SALA_BUFF: 60, SALA_GOLD: 80, SALA_XP: 110,
      SALA_LEAD: 0.5, SALA_BEHIND: 1.5,      // 앞선 편이 잡으면 불씨 시간 × 0.5 · 역전 기회를 받은 편이 잡으면 × 1.5
    },
  };

  /* ---------- 수학 ---------- */
  const U = TW.U = {};
  U.TAU = Math.PI * 2;
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  U.du = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  U.smooth = (t) => { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  U.easeOut = (t) => { t = U.clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); };
  U.easeOut3 = (t) => { t = U.clamp(t, 0, 1); const u = 1 - t; return 1 - u * u * u; };
  U.easeIn = (t) => { t = U.clamp(t, 0, 1); return t * t; };
  U.easeBack = (t) => { t = U.clamp(t, 0, 1); const c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
  U.angDiff = (a, b) => { let d = (b - a) % U.TAU; if (d > Math.PI) d -= U.TAU; if (d < -Math.PI) d += U.TAU; return d; };
  U.angLerp = (a, b, t) => a + U.angDiff(a, b) * t;
  U.approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
  U.sign = (v) => (v < 0 ? -1 : 1);

  /* 시드 고정 난수 (같은 시드 = 같은 경기) */
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
  /* 좌표 해시 → [0,1) : 장식 배치처럼 '항상 같은' 난수가 필요할 때 */
  U.hash2 = function (x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s | 0) + 1, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  /* 부드러운 2D 값 잡음 [0,1] */
  U.noise2 = function (x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = U.hash2(xi, yi, s), b = U.hash2(xi + 1, yi, s), c = U.hash2(xi, yi + 1, s), d = U.hash2(xi + 1, yi + 1, s);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };

  U.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };
  U.fmtNum = function (n) { n = Math.round(n); return n >= 10000 ? (n / 10000).toFixed(1) + '만' : String(n); };

  /* 선분-점 */
  U.segPoint = function (px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = ax + dx * t, cy = ay + dy * t;
    return { t, d2: (px - cx) * (px - cx) + (py - cy) * (py - cy), x: cx, y: cy };
  };
  U.segDist = function (px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  };

  /* ---------- 색 ---------- */
  const rgbCache = new Map();
  U.rgb = function (hex) {
    let c = rgbCache.get(hex);
    if (c) return c;
    let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbCache.set(hex, c);
    return c;
  };
  U.rgba = function (hex, a) { const c = U.rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a < 0 ? 0 : a > 1 ? 1 : Math.round(a * 1000) / 1000) + ')'; };
  const h2 = (v) => { v = Math.round(v < 0 ? 0 : v > 255 ? 255 : v); return (v < 16 ? '0' : '') + v.toString(16); };
  U.hex = (r, g, b) => '#' + h2(r) + h2(g) + h2(b);
  /* 두 색 섞기 (t=0 → a, t=1 → b) */
  U.mix = function (a, b, t) { const p = U.rgb(a), q = U.rgb(b); return U.hex(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t); };
  U.shade = (hex, k) => { const c = U.rgb(hex); return k >= 0 ? U.hex(c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k) : U.hex(c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)); };
})();
