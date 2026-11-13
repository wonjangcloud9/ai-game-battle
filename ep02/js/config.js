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
  CHEST_RANGE: 3.2,          // how close the player must be to open a chest (generous: in third person the chest sits well ahead of the camera)
  // Damage scale between bots (solo; Game.botScale): BOT_BASE with the lobby full, rising by BOT_VS_BOT x thin ^ BOT_POW as
  // it thins out (thin: 0 = everybody alive, 1 = the last four), at least BOT_LATE from the fifth zone phase on. It sets
  // the pace at which the lobby empties (about 27 left after 90 s, 13 after 150 s, over after some 260 s).
  // BOT_AMMO: the least a bot pays for a reload, as a share of the rounds (Character._spend). With every bot armed and
  // supplied, these numbers are lower than they were when most of the lobby had run dry or was boxing: see DEVLOG.
  // Tuned with dev/sim-test.js (the pace) and dev/early-test.js (what it does to the player).
  BOT_BASE: 0.055, BOT_VS_BOT: 0.3, BOT_POW: 1.5, BOT_LATE: 0.5, BOT_AMMO: 0.15,
  ONE_SHOT: 50,              // a single bullet from a bot does not kill a player who has this much health and shield left (Combat.hitscan)
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

// grace: seconds of landing protection (see OPENING)
// mates: squad mode, the player's own team-mates against the other bots: [what they deal, what they take], on top of Game.botScale
const DIFFICULTY = {
  easy: { label: '쉬움', aim: 1.9, react: 1.6, dmgToPlayer: 0.4, aggro: 0.7, grace: 30, mates: [1.7, 0.8] },
  normal: { label: '보통', aim: 1.3, react: 1.05, dmgToPlayer: 0.62, aggro: 1.0, grace: 25, mates: [1.5, 0.9] },
  hard: { label: '어려움', aim: 0.85, react: 0.75, dmgToPlayer: 0.92, aggro: 1.25, grace: 20, mates: [1.2, 1] },
};
// The opening, counted from the moment the player touches the ground (not from the start of the match).
// 1. Landing protection: for `grace` seconds bots neither target nor hurt the player. A player who has not found a gun
//    yet keeps it until `armedGrace` seconds after picking one up, at most `unarmedMul` x grace.
// 2. Easing in: over the next `ramp` seconds bot damage / reaction time / aim against the player go from the multipliers
//    below to full strength, and only a few bots may hunt the player at once (Game.maxHunters). `settle` stretches the
//    time a bot needs to walk its fire onto the player, so the first bursts of a fight mostly miss: tracers and noise
//    warn the player before the damage does.
// A bot the player has hurt is exempt from all of this: it fights back at once, at no less than `provoked` of the way
// through the ramp.
// 3. First pick: while the protection lasts, bots leave alone any gun or chest within `dibs` metres of the player that
//    the player is closer to than they are.
// 4. Wheels: until the easing in is over, a bot at the wheel, or one that got out of a vehicle less than `rideCalm` seconds
//    ago, does not start on the player (bots cover ground far faster now; without this they turn up around a newcomer
//    in numbers the limits above were not made for).
// Tuned with dev/early-test.js.
const OPENING = { armedGrace: 6, unarmedMul: 2, ramp: 100, dmg: 0.1, react: 2.2, aim: 1.6, settle: 3, provoked: 0.25, dibs: 30, rideCalm: 30 };

// Squad mode (Game.squad): the lobby is split into teams of `size`; the player's team is the player and three bots, and the
// last team with somebody on their feet wins. Nobody can hurt a team-mate.
//   Knocked down: a character that runs out of hit points while a team-mate is still standing is not killed but goes down
//     with `downHp`, which drains at bleed[n] per second (n: how often it has been down before) and is taken off by what
//     hits it: blasts by `downBlast` of their damage, the zone in full, bullets only when the player fires them (bots do
//     not shoot at people on the ground: see Combat.hitscan). It can crawl, at `crawl` m/s, and nothing else. When the last
//     member on their feet goes down, the whole team is out.
//   Helping up: a team-mate within `reviveRange` metres needs `reviveTime` seconds (the bleeding stops meanwhile; shooting,
//     or moving more than `reviveLeash` away, breaks it off); the one helped up has `reviveHp`.
//   dibs / fresh: the player's team-mates leave the player the guns and chests within `dibs` metres that the player is
//     nearer to (and in the first `keepT` seconds after landing, while the player has no gun at all, the nearest gun and chest whoever is nearer, and a team-mate that has a gun leaves all of them within `dibsBare` metres), and for `freshT` seconds everything that drops within `fresh` metres of the player (what a chest the
//     player opened throws out).
//   bots: a follower keeps within `leash` metres of its leader (the first member on their feet: in the player's team the
//     player) and stops `near` metres short; with a team-mate down, the nearest bot goes to help and the others stay
//     within `cover` metres. A team of bots lands `spread` metres apart, each on loot of its own.
//     medicClose / medicHp: a bot goes to help also under fire, unless an enemy is in view within medicClose metres or it
//     is being hit with less than medicHp of health and shield left, or has less than medicLow left with an enemy in view at all. Once more than medicStay of the way through helping somebody up, it finishes.
//   botBase / botGain: damage scale between bots, from a full lobby to the last two teams (Game.botScale: higher than in
//     solo, where a lost fight is a death; here it takes four knock-downs faster than they can be undone). What the
//     player's own team-mates give and take on top of that goes by the difficulty (DIFFICULTY.mates).
// Tuned with dev/sim-test.js --squad=1 (how fast the teams go out) and dev/early-test.js --squad=1 (the player's side of it).
const SQUAD = {
  size: 4, downHp: 100, bleed: [2.2, 3.4, 5], downBlast: 0.5, crawl: 1.15, reviveTime: 5, reviveRange: 2.5, reviveLeash: 3.6, reviveHp: 30,
  dibs: 14, dibsBare: 45, keepT: 35, fresh: 6, freshT: 7, leash: 30, near: 8, cover: 12, spread: 12, medicClose: 9, medicHp: 45, medicLow: 25, medicStay: 0.5, botBase: 0.17, botGain: 0.38, botLate: 0.5,
};
// marker colours of the player's three team-mates (rows of the team panel, name tags, dots on the maps)
const SQUAD_TINTS = ['#ffd24a', '#6fb7ff', '#ff8fc7'];

// Ground vehicles (js/vehicle.js). Vehicle space: origin on the ground between the axles, +z forward, +x left (as for characters).
//   speeds in m/s, accel / brake in m/s2, grip: how fast sideways sliding is scrubbed off (1/s),
//   steer: wheel angle (rad) at a standstill -> steerHi at top speed
//   offroad: share of the top speed that is left on grass (roads and yards allow all of it)
//   hull: box that stops bullets and people, cz - len/2 .. cz + len/2 long, wid wide, from `clear` up to `top` above the ground.
//         The driver can be hit wherever the body shows above it, so a taller hull is better cover.
//   high: overall height with somebody in the seat (what it takes to pass underneath something)
//   circles: centres (along z) of the discs of radius `rad` that keep the vehicle out of walls, trees and other vehicles
//   axF / axR: axles, track: distance between the left and right wheels (0 = two wheels in line), wheelR / wheelW: tyre size
//   seat: the driver's hip joint; sit: 'bike' (leaning over the bars) or 'car'; hands: where the hands hold on (centre of the
//         steering wheel / middle of the handlebar) with `handW` = half the distance between them; feet: the ankles (x is mirrored)
//   mass: relative weight (pushing other vehicles), ram: damage per m/s to someone run over, cam: chase camera distance
//   pass: passenger seats (squad mode: team-mates of the driver ride along). seat: the hip joint, yaw: which way they face
//         relative to the vehicle, sit: 'pillion' (behind the rider, holding on), 'car' (hands in the lap) or 'bench' (on the
//         side of the load bed, facing inwards), feet: [half the distance between the ankles, height, how far in front of the hips]
const VEHICLES = {
  bike: {
    id: 'bike', name: '오토바이', hp: 300, maxSpeed: 24, reverse: 3.5, accel: 10.5, brake: 15, grip: 8.5, steer: 0.6, steerHi: 0.085, offroad: 0.9,
    len: 2.05, wid: 0.4, clear: 0.2, top: 1.0, high: 1.6, cz: 0.02, rad: 0.42, circles: [-0.56, 0.6],
    axF: 0.72, axR: -0.68, track: 0, wheelR: 0.33, wheelW: 0.13,
    seat: [0, 0.98, -0.18], sit: 'bike', hands: [0, 1.1, 0.46], handW: 0.33, feet: [0.24, 0.45, -0.12],
    mass: 0.35, ram: 2.4, cam: 4.4, exitSide: 0.95,
    pass: [{ seat: [0, 0.97, -0.56], yaw: 0, sit: 'pillion', feet: [0.21, 0.52, 0.08] }],
  },
  buggy: {
    id: 'buggy', name: '버기', hp: 520, maxSpeed: 21, reverse: 5, accel: 8.5, brake: 14, grip: 7.5, steer: 0.56, steerHi: 0.1, offroad: 0.93,
    len: 3.0, wid: 1.72, clear: 0.26, top: 0.8, high: 1.6, cz: 0.08, rad: 0.8, circles: [-0.72, 0.04, 0.8],
    axF: 1.15, axR: -1.05, track: 1.5, wheelR: 0.38, wheelW: 0.3,
    seat: [0.34, 0.58, -0.25], sit: 'car', hands: [0.34, 0.9, 0.14], handW: 0.16, feet: [0.11, 0.42, 0.5],
    mass: 1.0, ram: 4.6, cam: 5.4, exitSide: 1.65,
    pass: [{ seat: [-0.34, 0.58, -0.25], yaw: 0, sit: 'car', feet: [0.11, 0.42, 0.75] }],
  },
  truck: {
    id: 'truck', name: '픽업트럭', hp: 820, maxSpeed: 17.5, reverse: 5, accel: 6.2, brake: 12.5, grip: 8, steer: 0.54, steerHi: 0.11, offroad: 0.86,
    len: 4.86, wid: 1.88, clear: 0.34, top: 1.3, high: 1.98, cz: 0.05, rad: 0.92, circles: [-1.42, 0.05, 1.52],
    axF: 1.5, axR: -1.4, track: 1.6, wheelR: 0.42, wheelW: 0.27,
    seat: [0.42, 0.95, 0.05], sit: 'car', hands: [0.42, 1.3, 0.46], handW: 0.17, feet: [0.11, 0.66, 0.78],
    mass: 1.7, ram: 6.2, cam: 6.3, exitSide: 1.75,
    pass: [{ seat: [-0.42, 0.95, 0.05], yaw: 0, sit: 'car', feet: [0.11, 0.66, 0.73] },
      { seat: [0.8, 1.27, -1.85], yaw: -Math.PI / 2, sit: 'bench', feet: [0.12, 0.89, 0.42] }, { seat: [-0.8, 1.27, -1.2], yaw: Math.PI / 2, sit: 'bench', feet: [0.12, 1.12, 0.42] }],
  },
};
const VEHICLE_IDS = ['bike', 'buggy', 'truck'];
// Common vehicle rules.
//   burnAt: share of the hit points below which a vehicle catches fire; it then loses `burnRate` of its full hit points
//           per second and explodes at zero (a crash alone never sets one alight: only gunfire and explosions do)
//   blast*: the explosion (radius in metres, damage at the centre, damage to whoever is still in the seat)
//   wade: water deeper than this floods the engine for good; between `wet` and that the vehicle just bogs down
//   enter: how close (to the hull) one must be to get in; mount: seconds before the engine pulls away after getting in
//   spawn: chance that a parking spot holds a vehicle in a given match (the first spot of every landmark always does)
const VEHICLE_CFG = {
  burnAt: 0.25, burnRate: 0.05, blastR: 6.5, blastDmg: 85, blastDriver: 75, blastVeh: 170, nadeDmg: 260,
  crashFrom: 9, crashDmg: 4, ramFrom: 5, wet: 0.3, wade: 1.25, enter: 1.7, mount: 0.4, spawn: 0.6,
  // bots: take a vehicle for trips longer than rideMin metres when one stands within rideSeek, drive at botSpeed x top speed
  rideMin: 105, rideSeek: 48, botSpeed: 0.78,
};
// paint jobs (sRGB hex): the body panels take one of these
const VEHICLE_PAINTS = [0xc8452f, 0xe0a52e, 0x2f8f8a, 0x3a6fb0, 0xe9e6df, 0x6a6f45, 0xd9722b, 0x4f5660, 0x8a3fb0, 0x58a04a];

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
