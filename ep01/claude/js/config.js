// AURORA FALL — gameplay constants and data tables
'use strict';

const CFG = {
  TITLE: 'AURORA FALL',
  WORLD_SIZE: 1024,          // metres, terrain spans [-512, 512]
  WORLD_SEED: 20261,
  TOTAL_PLAYERS: 40,
  GRAVITY: 22,
  // character movement
  WALK_SPEED: 3.3, RUN_SPEED: 5.7, SPRINT_SPEED: 7.9, CROUCH_SPEED: 2.7, SWIM_SPEED: 3.4,
  JUMP_SPEED: 7.2, STEP_HEIGHT: 0.55, CHAR_RADIUS: 0.42, CHAR_HEIGHT: 1.8, CROUCH_HEIGHT: 1.25,
  EYE_HEIGHT: 1.6, CROUCH_EYE: 1.08, SWIM_DEPTH: 1.25,
  MAX_HP: 100, MAX_SHIELD: 100,
  // drop phase
  PLANE_ALT: 235, PLANE_SPEED: 52, DROP_GLIDE_ALT: 46, FREEFALL_SPEED: 46, DIVE_SPEED: 68, GLIDE_FALL: 7.5, GLIDE_SPEED: 15,
  // camera
  FOV: 68, CAM_DIST: 3.4, CAM_SHOULDER: 0.62, CAM_HEIGHT: 0.32,
  PICKUP_RANGE: 2.3,
  BOT_VS_BOT: 0.55,          // damage scale between bots: keeps more of the lobby alive into the late game
};

const RARITY = [
  { id: 0, name: '일반', color: 0xb9c2cf, css: '#c3ccd8', dmg: 1.0, reload: 1.0 },
  { id: 1, name: '희귀', color: 0x3fa2ff, css: '#4dabff', dmg: 1.07, reload: 0.95 },
  { id: 2, name: '영웅', color: 0xb565ff, css: '#be7bff', dmg: 1.14, reload: 0.9 },
  { id: 3, name: '전설', color: 0xffb42e, css: '#ffc04a', dmg: 1.22, reload: 0.85 },
];

// spread values are half-angles in degrees
const WEAPONS = {
  fists: {
    id: 'fists', name: '맨손', kind: 'melee', dmg: 17, rate: 0.42, range: 2.3, loud: 0,
  },
  pistol: {
    id: 'pistol', name: '권총', kind: 'gun', ammo: 'light', mag: 12, dmg: 22, head: 1.8, interval: 0.17, auto: false, reload: 1.25,
    spreadMin: 0.35, spreadMax: 2.8, bloom: 0.6, recover: 6.5, moveSpread: 0.9, adsMul: 0.55,
    falloff0: 22, falloff1: 60, minMul: 0.55, recoilV: 1.1, recoilH: 0.45, zoom: 1.25, pellets: 1,
    loud: 75, range: 120, botMin: 3, botMax: 30, tracer: 0xffe9a8, model: 'pistol',
  },
  smg: {
    id: 'smg', name: '기관단총', kind: 'gun', ammo: 'light', mag: 30, dmg: 15, head: 1.6, interval: 0.075, auto: true, reload: 1.9,
    spreadMin: 0.6, spreadMax: 3.6, bloom: 0.3, recover: 7.5, moveSpread: 0.6, adsMul: 0.6,
    falloff0: 16, falloff1: 46, minMul: 0.5, recoilV: 0.62, recoilH: 0.5, zoom: 1.25, pellets: 1,
    loud: 85, range: 110, botMin: 2, botMax: 28, tracer: 0xffe9a8, model: 'smg',
  },
  ar: {
    id: 'ar', name: '돌격소총', kind: 'gun', ammo: 'medium', mag: 30, dmg: 23, head: 1.75, interval: 0.11, auto: true, reload: 2.2,
    spreadMin: 0.22, spreadMax: 2.8, bloom: 0.33, recover: 6.0, moveSpread: 1.1, adsMul: 0.45,
    falloff0: 48, falloff1: 120, minMul: 0.65, recoilV: 0.85, recoilH: 0.4, zoom: 1.55, pellets: 1,
    loud: 115, range: 220, botMin: 8, botMax: 85, tracer: 0xffd58a, model: 'ar',
  },
  shotgun: {
    id: 'shotgun', name: '산탄총', kind: 'gun', ammo: 'shell', mag: 5, dmg: 11, head: 1.4, interval: 0.85, auto: false, reload: 0.5, shellReload: true,
    spreadMin: 3.1, spreadMax: 3.9, bloom: 0.4, recover: 4, moveSpread: 0.4, adsMul: 0.85,
    falloff0: 7, falloff1: 28, minMul: 0.18, recoilV: 4.2, recoilH: 1.2, zoom: 1.15, pellets: 9,
    loud: 105, range: 60, botMin: 1, botMax: 14, tracer: 0xffc070, model: 'shotgun',
  },
  sniper: {
    id: 'sniper', name: '저격소총', kind: 'gun', ammo: 'heavy', mag: 5, dmg: 92, head: 2.3, interval: 1.35, auto: false, reload: 2.9,
    spreadMin: 0.03, spreadMax: 4.5, bloom: 3.5, recover: 3.2, moveSpread: 2.6, adsMul: 0.04, hipMin: 2.4,
    falloff0: 400, falloff1: 500, minMul: 1, recoilV: 5.5, recoilH: 0.8, zoom: 5.5, pellets: 1, scope: true,
    loud: 170, range: 420, botMin: 35, botMax: 170, tracer: 0xfff2c8, model: 'sniper',
  },
  aurora: {
    id: 'aurora', name: '오로라 캐논', kind: 'gun', ammo: 'heavy', mag: 6, dmg: 58, head: 1.7, interval: 0.5, auto: false, reload: 2.4,
    spreadMin: 0.1, spreadMax: 2.2, bloom: 0.9, recover: 4.5, moveSpread: 1.0, adsMul: 0.3,
    falloff0: 400, falloff1: 500, minMul: 1, recoilV: 2.4, recoilH: 0.5, zoom: 2.2, pellets: 1, beam: true,
    loud: 140, range: 320, botMin: 10, botMax: 120, tracer: 0x66ffd9, model: 'aurora',
  },
};
const GUN_IDS = ['pistol', 'smg', 'ar', 'shotgun', 'sniper', 'aurora'];

const AMMO = {
  light: { name: '경량탄', pack: 30, max: 240, color: 0xf2c14e },
  medium: { name: '중형탄', pack: 30, max: 240, color: 0x5fb0ff },
  shell: { name: '산탄', pack: 8, max: 48, color: 0xe5593f },
  heavy: { name: '대구경탄', pack: 8, max: 48, color: 0x9a7bff },
};
const HEALS = {
  bandage: { name: '붕대', hp: 25, shield: 0, time: 2.3, max: 10, color: 0xf3efe6, key: '4' },
  medkit: { name: '구급상자', hp: 100, shield: 0, time: 5.0, max: 3, color: 0xe2483d, key: '5' },
  cell: { name: '실드 셀', hp: 0, shield: 50, time: 3.0, max: 6, color: 0x49d6ff, key: '6' },
};
const GRENADE = { name: '수류탄', max: 4, fuse: 2.6, radius: 8.5, dmg: 115, throwSpeed: 19, color: 0x5d6b3c };

// Loot tables. Tier 0 = scattered ground loot, 1 = towns, 2 = high value sites.
const LOOT = {
  kindWeights: [ // weapon, ammo, heal, grenade
    [34, 28, 28, 10],
    [40, 24, 26, 10],
    [46, 20, 24, 10],
  ],
  weaponWeights: [
    { pistol: 30, smg: 24, ar: 20, shotgun: 20, sniper: 6 },
    { pistol: 20, smg: 24, ar: 26, shotgun: 20, sniper: 10 },
    { pistol: 8, smg: 20, ar: 34, shotgun: 18, sniper: 20 },
  ],
  rarityWeights: [
    [62, 29, 8, 1],
    [44, 37, 15, 4],
    [20, 40, 30, 10],
  ],
  healWeights: { bandage: 52, cell: 32, medkit: 16 },
};

// Safe-zone timeline (seconds). The first wait includes the drop.
const ZONE_CFG = {
  startRadius: 600,
  phases: [
    { wait: 66, shrink: 40, radius: 300, dps: 1.5 },
    { wait: 34, shrink: 32, radius: 170, dps: 2.5 },
    { wait: 28, shrink: 27, radius: 92, dps: 4 },
    { wait: 22, shrink: 22, radius: 46, dps: 7 },
    { wait: 18, shrink: 18, radius: 18, dps: 10 },
    { wait: 14, shrink: 22, radius: 0, dps: 16 },
  ],
};

const DIFFICULTY = {
  easy: { label: '쉬움', aim: 1.9, react: 1.6, dmgToPlayer: 0.4, aggro: 0.7 },
  normal: { label: '보통', aim: 1.3, react: 1.05, dmgToPlayer: 0.62, aggro: 1.0 },
  hard: { label: '어려움', aim: 0.85, react: 0.75, dmgToPlayer: 0.92, aggro: 1.25 },
};

// jacket colours (sRGB hex)
const SUIT_COLORS = [0xe8503c, 0xf29a2e, 0xf2d03c, 0x58c468, 0x33b9c0, 0x4a80e8, 0x8d68ec, 0xea68b6, 0xeef0f2, 0x3b424f, 0x9bd247, 0xff7f58, 0x2f9e8f, 0xc2a36b, 0x7a4fd0, 0xd13f6a];

const BOT_NAMES = [
  '설원늑대', 'Frostbyte', '북극여우', 'NorthPine', '눈보라', 'Glacier_K', '솔방울', 'Tundra7', '얼음도끼', 'PolarMoth',
  '새벽서리', 'Krait_04', '순록기사', 'Borealis', '겨울왕곰', 'SnowOwl', '고드름', 'Vargr', '자작나무', 'IceLantern',
  '백야', 'Skald', '눈사람킬러', 'Fjordling', '밤안개', 'Rime', '도토리폭격', 'Wolverine9', '극광', 'Hailstone',
  '서릿발', 'Mossback', '은여우', 'Cairn', '산토끼', 'DriftAsh', '빙하수', 'Lynx_22', '북풍', 'Embergrey',
  '눈꽃', 'Sleet', '바위게', 'Ptarmigan', '잿빛매', 'Nordlys', '설표', 'Kestrel', '등대지기', 'Tarn',
  '솔이끼', 'Hoarfrost', '곰발바닥', 'Ravn', '첫눈', 'Bramble', '한파주의보', 'Ulfr', '물안개', 'Sedge',
];

const TEXT = {
  zoneName: '오로라 장벽',
};
