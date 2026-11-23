'use strict';
/* 등불지기 — maps.
   Geometry (logical px, y grows downward):
     solids : [x, y, w, h]   solid terrain block (top surface at y; collides on all sides)
     plats  : [x, y, w]      thin one-way platform (land from above, drop with ↓+jump)
     ladders: [x, y1, y2]    climbable rope/ladder centered on x from y1 (top) to y2 (bottom)
     portals: { id, x, y, to, tp }   stand on it and hold ↑ (~0.4 s) → map `to`, portal `tp`
     spawns : [monsterId, x1, x2, y, n]   n monsters living on the surface at y between x1..x2 (flyers hover above it)
     npcs   : [npcId, x, y]
     props  : [propName, x, y]   explicit decoration / buildings (origin bottom-center, y = surface)
     beacon : { x, y, arena:[x1,x2] }   the region's lighthouse (its guardian boss is summoned here)
     wm     : [x, y] node position on the world map window
   y of spawns/npcs/props/portals snaps to the nearest surface at load, so small mistakes are harmless. */
(function () {
  const G = window.G;
  const M = (G.MAPS = {});

  M.town = {
    name: '모닥마을', theme: 'town', w: 2600, h: 760, town: true, bgm: 'town', wm: [60, 175],
    solids: [[0, 620, 2600, 140]],
    plats: [[770, 472, 190], [1610, 462, 210], [2075, 440, 250]],
    ladders: [],
    portals: [{ id: 'e', x: 2520, y: 620, to: 'meadow1', tp: 'w' }],
    spawns: [['dummy', 130, 300, 620, 2]],
    npcs: [['elder', 440, 620], ['sundry', 905, 620], ['kid', 1075, 620], ['keeper', 1345, 620], ['smith', 1745, 620], ['trainer', 2190, 620]],
    props: [
      ['house_elder', 330, 620], ['shop_sundries', 860, 620], ['campfire', 1240, 620], ['smithy', 1700, 620], ['guild_hall', 2200, 620],
      ['lamp_post', 600, 620], ['lamp_post', 1090, 620], ['lamp_post', 1480, 620], ['lamp_post', 1950, 620], ['lamp_post', 2440, 620],
      ['well', 1010, 620], ['bench', 1400, 620], ['barrel', 975, 620], ['crate', 730, 620], ['signpost', 2400, 620], ['fence', 90, 620], ['fence', 200, 620],
    ],
    start: { x: 620, y: 620 },
  };

  M.meadow1 = {
    name: '이슬풀 들판', theme: 'meadow', w: 3600, h: 900, lv: [1, 4], bgm: 'field', wm: [148, 175],
    solids: [[0, 780, 3600, 120], [1300, 700, 620, 80], [2650, 720, 420, 60]],
    plats: [[330, 655, 240], [660, 560, 220], [960, 650, 200], [1480, 570, 280], [1990, 650, 220], [2270, 545, 260], [2640, 590, 240], [3050, 650, 220]],
    ladders: [[450, 655, 780], [1620, 570, 700]],
    portals: [{ id: 'w', x: 80, y: 780, to: 'town', tp: 'e' }, { id: 'e', x: 3520, y: 780, to: 'hills', tp: 'w' }],
    spawns: [
      ['puff', 200, 1250, 780, 5], ['puff', 330, 570, 655, 1], ['puff', 660, 880, 560, 1], ['puff', 1320, 1900, 700, 2], ['puff', 1480, 1760, 570, 1],
      ['leafling', 1960, 2620, 780, 3], ['leafling', 2270, 2530, 545, 1], ['leafling', 2660, 3060, 720, 2], ['leafling', 3100, 3480, 780, 2],
    ],
    npcs: [], props: [['signpost', 200, 780], ['signpost', 3400, 780]],
  };

  M.hills = {
    name: '바람언덕', theme: 'meadow', w: 4000, h: 1000, lv: [4, 8], bgm: 'field', wm: [236, 112],
    solids: [[0, 880, 4000, 120], [1400, 790, 2600, 90], [2300, 690, 1700, 100], [3050, 580, 950, 110]],
    plats: [[280, 760, 240], [620, 660, 220], [960, 750, 220], [1650, 670, 220], [1960, 580, 200], [2520, 570, 220], [2800, 470, 200]],
    ladders: [[730, 660, 880], [1760, 670, 790]],
    portals: [{ id: 'w', x: 80, y: 880, to: 'meadow1', tp: 'e' }, { id: 'e', x: 3930, y: 580, to: 'forest1', tp: 'w' }],
    spawns: [
      ['leafling', 200, 1300, 880, 4], ['puff', 280, 520, 760, 1], ['leafling', 620, 840, 660, 1],
      ['acorn', 1450, 2250, 790, 4], ['acorn', 1650, 1870, 670, 1], ['acorn', 1960, 2160, 580, 1],
      ['acorn', 2350, 3000, 690, 3], ['leafling', 2520, 2740, 570, 1],
    ],
    npcs: [], props: [['windmill', 1150, 880], ['signpost', 2950, 690]],
    beacon: { x: 3560, y: 580, arena: [3090, 3880] },
  };

  M.forest1 = {
    name: '속삭임 숲', theme: 'forest', w: 3800, h: 1100, lv: [7, 12], bgm: 'forest', wm: [324, 175],
    solids: [[0, 980, 3800, 120], [1000, 900, 460, 80], [2300, 880, 640, 100]],
    plats: [
      [240, 860, 240], [520, 750, 240], [260, 640, 240], [560, 530, 220],
      [1120, 780, 220], [1420, 670, 240], [1140, 560, 220], [1700, 780, 220],
      [2360, 760, 240], [2680, 650, 240], [2380, 540, 240], [3000, 760, 220], [3300, 860, 240], [3480, 740, 220],
    ],
    ladders: [[600, 750, 980], [1810, 780, 980], [2800, 650, 880]],
    portals: [{ id: 'w', x: 80, y: 980, to: 'hills', tp: 'e' }, { id: 'e', x: 3720, y: 980, to: 'forest2', tp: 'w' }],
    spawns: [
      ['mossback', 150, 950, 980, 3], ['mossback', 1500, 2250, 980, 3], ['mossback', 2980, 3640, 980, 2], ['mossback', 1020, 1440, 900, 1], ['mossback', 2320, 2920, 880, 2],
      ['hootling', 240, 800, 750, 2], ['hootling', 1100, 1700, 670, 2], ['hootling', 2360, 3000, 650, 2], ['hootling', 3200, 3700, 860, 1],
    ],
    npcs: [], props: [['signpost', 210, 980]],
  };

  M.forest2 = {
    name: '고목의 품', theme: 'forest', w: 3600, h: 1000, lv: [10, 14], bgm: 'forest', wm: [412, 112],
    solids: [[0, 880, 3600, 120], [700, 790, 500, 90], [1500, 800, 420, 80]],
    plats: [[220, 760, 240], [500, 650, 220], [800, 670, 240], [1080, 560, 220], [1560, 680, 240], [1900, 580, 220], [2150, 700, 220]],
    ladders: [[2260, 700, 880]],
    portals: [{ id: 'w', x: 80, y: 880, to: 'forest1', tp: 'e' }, { id: 'm', x: 2440, y: 880, to: 'marsh', tp: 'w' }, { id: 'e', x: 3530, y: 880, to: 'cave1', tp: 'w' }],
    spawns: [
      ['hootling', 200, 900, 760, 2], ['hootling', 1000, 1900, 680, 3],
      ['bramble', 500, 720, 650, 1], ['bramble', 800, 1040, 670, 1], ['bramble', 1080, 1300, 560, 1], ['bramble', 1560, 1800, 680, 1], ['bramble', 1900, 2120, 580, 1],
      ['bramble', 150, 650, 880, 2], ['bramble', 1250, 1480, 880, 1], ['bramble', 1960, 2380, 880, 2],
      ['mossback', 720, 1180, 790, 2], ['mossback', 1520, 1900, 800, 1],
    ],
    npcs: [], props: [['signpost', 2360, 880], ['statue_keeper', 2620, 880]],
    beacon: { x: 3160, y: 880, arena: [2560, 3480] },
  };

  M.marsh = {
    name: '반딧불 늪', theme: 'marsh', w: 4200, h: 900, lv: [13, 20], bgm: 'forest', wm: [412, 246],
    solids: [[0, 790, 4200, 110], [600, 720, 380, 70], [1900, 700, 460, 90]],
    plats: [[180, 670, 260], [460, 560, 240], [1050, 680, 240], [1350, 570, 260], [1680, 670, 200], [2000, 580, 260], [2420, 660, 240], [2700, 550, 240], [3000, 670, 220]],
    ladders: [[1480, 570, 790]],
    portals: [{ id: 'w', x: 80, y: 790, to: 'forest2', tp: 'm' }],
    spawns: [
      ['toad', 150, 580, 790, 2], ['toad', 1000, 1880, 790, 4], ['toad', 620, 960, 720, 1], ['toad', 2420, 2660, 660, 1],
      ['glowmoth', 200, 700, 670, 2], ['glowmoth', 1050, 1600, 570, 2], ['glowmoth', 2000, 2900, 580, 3],
      ['mudling', 2380, 3150, 790, 4], ['mudling', 1920, 2340, 700, 2], ['mudling', 2700, 2940, 550, 1],
    ],
    npcs: [], props: [['signpost', 210, 790], ['torch', 3220, 790]],
    beacon: { x: 3780, y: 790, arena: [3250, 4130] },
  };

  M.cave1 = {
    name: '메아리 동굴', theme: 'cave', w: 3400, h: 1300, lv: [20, 24], bgm: 'cave', wm: [500, 175],
    solids: [[0, 1180, 3400, 120], [0, 420, 700, 760], [700, 640, 700, 540], [1400, 860, 700, 320]],
    plats: [
      [300, 300, 220], [780, 530, 180], [1000, 520, 220], [1480, 750, 180], [1700, 740, 200],
      [2150, 1070, 170], [2130, 960, 150], [2500, 1060, 220], [2800, 950, 220], [3100, 1060, 200],
    ],
    ladders: [[716, 420, 640], [1416, 640, 860], [2116, 860, 1180]],
    portals: [{ id: 'w', x: 80, y: 420, to: 'forest2', tp: 'e' }, { id: 'e', x: 3320, y: 1180, to: 'cave2', tp: 'w' }],
    spawns: [
      ['crybat', 100, 650, 420, 2], ['crybat', 750, 1350, 640, 2], ['crybat', 1450, 2050, 860, 2], ['crybat', 2250, 3300, 1180, 3], ['crybat', 2500, 3000, 950, 1],
      ['orecrab', 180, 640, 420, 2], ['orecrab', 760, 1360, 640, 2], ['orecrab', 1460, 2060, 860, 2], ['orecrab', 2300, 3250, 1180, 3],
    ],
    npcs: [],
    props: [['torch', 200, 420], ['torch', 560, 420], ['torch', 1050, 640], ['torch', 1750, 860], ['torch', 2400, 1180], ['torch', 2950, 1180], ['crystal_big', 1250, 640], ['crystal_big', 3150, 1180]],
  };

  M.cave2 = {
    name: '수정 심층', theme: 'cave', w: 3800, h: 1000, lv: [23, 28], bgm: 'cave', wm: [580, 242],
    solids: [[0, 880, 3800, 120], [500, 780, 420, 100], [1300, 760, 500, 120]],
    plats: [[150, 760, 220], [560, 660, 240], [880, 550, 220], [1020, 770, 200], [1360, 640, 240], [1700, 530, 220], [1900, 660, 220], [2200, 770, 220]],
    ladders: [[1816, 760, 880]],
    portals: [{ id: 'w', x: 80, y: 880, to: 'cave1', tp: 'e' }, { id: 'e', x: 3730, y: 880, to: 'oasis', tp: 'w' }],
    spawns: [
      ['orecrab', 150, 480, 880, 1], ['orecrab', 520, 900, 780, 2], ['orecrab', 950, 1280, 880, 2], ['orecrab', 1320, 1780, 760, 2], ['orecrab', 1850, 2600, 880, 2],
      ['shade', 560, 1100, 660, 3], ['shade', 1360, 2100, 640, 3], ['shade', 1850, 2600, 880, 2], ['crybat', 200, 1200, 760, 2],
    ],
    npcs: [],
    props: [['torch', 300, 880], ['crystal_big', 720, 780], ['torch', 1150, 880], ['crystal_big', 1560, 760], ['torch', 2050, 880], ['crystal_big', 2480, 880], ['torch', 2760, 880], ['crystal_big', 3620, 880]],
    beacon: { x: 3320, y: 880, arena: [2700, 3660] },
  };

  M.oasis = {
    name: '바람개비 오아시스', theme: 'oasis', w: 2600, h: 760, town: true, bgm: 'desert', wm: [664, 175],
    solids: [[0, 620, 2600, 140]],
    plats: [[640, 480, 200], [1500, 470, 220], [1990, 450, 230]],
    ladders: [],
    portals: [{ id: 'w', x: 80, y: 620, to: 'cave2', tp: 'e' }, { id: 'e', x: 2520, y: 620, to: 'canyon', tp: 'w' }],
    spawns: [],
    npcs: [['chief', 520, 620], ['merchant', 985, 620], ['smith2', 1650, 620], ['trainer2', 2100, 620]],
    props: [
      ['tent_chief', 400, 620], ['tent_shop', 900, 620], ['pinwheel', 1270, 620], ['tent_smith', 1590, 620], ['tent_guild', 2110, 620],
      ['palm', 170, 620], ['palm', 730, 620], ['palm', 1400, 620], ['palm', 1860, 620], ['palm', 2380, 620],
      ['oasis_lamp', 640, 620], ['oasis_lamp', 1130, 620], ['oasis_lamp', 1790, 620], ['oasis_lamp', 2300, 620],
      ['pot', 1060, 620], ['pot', 1095, 620], ['rug_stall', 1160, 620], ['signpost', 2420, 620],
    ],
    start: { x: 200, y: 620 },
  };

  M.canyon = {
    name: '붉은모래 협곡', theme: 'canyon', w: 4400, h: 1100, lv: [27, 34], bgm: 'desert', wm: [742, 108],
    solids: [[0, 980, 4400, 120], [600, 880, 500, 100], [1100, 770, 400, 210], [2000, 870, 600, 110], [2600, 760, 300, 220]],
    plats: [[200, 860, 220], [1380, 650, 220], [1560, 860, 200], [1700, 740, 200], [2080, 750, 220], [2380, 640, 200], [2950, 870, 220], [3000, 650, 220]],
    ladders: [[1516, 770, 980], [2916, 760, 980]],
    portals: [{ id: 'w', x: 80, y: 980, to: 'oasis', tp: 'e' }, { id: 'e', x: 4330, y: 980, to: 'snow', tp: 'w' }],
    spawns: [
      ['skink', 150, 580, 980, 2], ['skink', 620, 1080, 880, 2], ['skink', 1540, 1980, 980, 3], ['skink', 2940, 3400, 980, 2], ['skink', 2080, 2300, 750, 1],
      ['cactus', 1120, 1480, 770, 2], ['cactus', 2020, 2580, 870, 3], ['cactus', 2620, 2880, 760, 1], ['cactus', 1380, 1600, 650, 1],
      ['dustdevil', 2940, 3400, 980, 2], ['dustdevil', 2020, 2580, 870, 1], ['dustdevil', 1540, 1980, 980, 1],
    ],
    npcs: [], props: [['rock_arch', 420, 980], ['cactus_tall', 1820, 980], ['rock_arch', 3180, 980], ['signpost', 210, 980]],
    beacon: { x: 3980, y: 980, arena: [3480, 4250] },
  };

  M.snow = {
    name: '서리송곳 설원', theme: 'snow', w: 4400, h: 1000, lv: [34, 41], bgm: 'snow', wm: [822, 168],
    solids: [[0, 880, 4400, 120], [800, 790, 600, 90], [1400, 690, 500, 190], [2500, 780, 700, 100]],
    plats: [[250, 760, 220], [520, 650, 220], [860, 670, 220], [1150, 560, 220], [1460, 570, 220], [1960, 770, 220], [2200, 660, 220], [2560, 660, 240], [2900, 550, 220]],
    ladders: [[1916, 690, 880]],
    portals: [{ id: 'w', x: 80, y: 880, to: 'canyon', tp: 'e' }, { id: 'e', x: 4330, y: 880, to: 'citadel', tp: 'w' }],
    spawns: [
      ['snowimp', 150, 780, 880, 3], ['snowimp', 820, 1380, 790, 2], ['snowimp', 520, 740, 650, 1], ['snowimp', 2200, 2420, 660, 1],
      ['ram', 1420, 1880, 690, 2], ['ram', 1920, 2480, 880, 3], ['ram', 2520, 3180, 780, 3],
      ['wraith', 250, 1100, 650, 3], ['wraith', 1460, 2400, 570, 3], ['wraith', 2560, 3150, 660, 2],
    ],
    npcs: [], props: [['ice_spire', 640, 880], ['snow_pine', 1080, 790], ['ice_spire', 2300, 880], ['snow_pine', 2860, 780], ['signpost', 210, 880]],
    beacon: { x: 3900, y: 880, arena: [3320, 4250] },
  };

  M.citadel = {
    name: '잿빛 성채', theme: 'citadel', w: 4200, h: 1200, lv: [41, 47], bgm: 'citadel', wm: [742, 250],
    solids: [[0, 1080, 4200, 120], [900, 970, 700, 110], [1600, 860, 700, 220], [2300, 750, 800, 330], [3100, 640, 1100, 440]],
    plats: [[200, 960, 220], [480, 850, 220], [1000, 850, 220], [1300, 740, 220], [1700, 740, 220], [2000, 630, 220], [2400, 630, 220], [2750, 520, 220], [3200, 520, 220], [3500, 410, 220]],
    ladders: [[884, 970, 1080], [1584, 860, 970], [2284, 750, 860], [3084, 640, 750]],
    portals: [{ id: 'w', x: 80, y: 1080, to: 'snow', tp: 'e' }, { id: 'e', x: 4100, y: 640, to: 'throne', tp: 'w' }],
    spawns: [
      ['gsoldier', 150, 860, 1080, 3], ['gsoldier', 920, 1580, 970, 3], ['gsoldier', 1620, 2280, 860, 3], ['gsoldier', 2320, 3080, 750, 3], ['gsoldier', 3150, 3900, 640, 2],
      ['ghexer', 480, 700, 850, 1], ['ghexer', 1000, 1500, 850, 2], ['ghexer', 1700, 2200, 740, 2], ['ghexer', 2400, 2950, 630, 2], ['ghexer', 3200, 3420, 520, 1],
      ['gargoyle', 300, 1500, 850, 3], ['gargoyle', 1700, 3000, 630, 3], ['gargoyle', 3200, 4000, 520, 2],
    ],
    npcs: [],
    props: [
      ['brazier', 330, 1080], ['banner_torn', 700, 1080], ['brazier', 1250, 970], ['pillar_broken', 1450, 970], ['brazier', 1950, 860], ['banner_torn', 2150, 860],
      ['brazier', 2700, 750], ['statue_keeper', 2950, 750], ['brazier', 3450, 640], ['banner_torn', 3750, 640], ['brazier', 3990, 640],
    ],
  };

  M.throne = {
    name: '군주의 옥좌', theme: 'throne', w: 2000, h: 760, lv: [50, 50], bgm: 'citadel', wm: [838, 252],
    solids: [[0, 620, 2000, 140]],
    plats: [[300, 490, 200], [640, 500, 180], [1180, 500, 180], [1500, 490, 200]],
    ladders: [],
    portals: [{ id: 'w', x: 80, y: 620, to: 'citadel', tp: 'e' }],
    spawns: [],
    npcs: [],
    props: [['throne_seat', 1780, 620], ['brazier', 240, 620], ['brazier', 760, 620], ['brazier', 1240, 620], ['brazier', 1560, 620], ['banner_torn', 520, 620], ['banner_torn', 1420, 620]],
    beacon: { x: 1000, y: 620, arena: [70, 1930] },
  };

  for (const id in M) M[id].id = id;

  // ---- the bottom floor of every map sits above the hotbar
  // The camera never looks below a map, so the depth of the ground block that runs off the map's bottom decides where the bottom
  // floor lands on screen when the camera is as low as it goes. That block (and the map) is deepened here so the floor line lands
  // at G.FLOOR_Y — above the hotbar (top edge y 582), with room for the name tag under the feet — and the band below it, where the
  // hotbar · log · menu live, shows only earth. The map data above keeps its original numbers; art_world.js reads the deepened
  // blocks from G.MAPS, so they are drawn as one block running off the bottom like before.
  G.FLOOR_Y = 540;
  for (const id in M) {
    const m = M[id];
    let base = null; // the lowest floor: the block running off the bottom with the lowest top
    for (const s of m.solids) if (s[1] + s[3] >= m.h && (!base || s[1] > base[1])) base = s;
    const pad = base ? Math.max(0, G.H - G.FLOOR_Y - (m.h - base[1])) : 0;
    if (!pad) continue;
    for (const s of m.solids) if (s[1] + s[3] >= m.h) s[3] += pad;
    m.h += pad;
  }
  // world map links (for drawing lines)
  G.MAP_LINKS = [['town', 'meadow1'], ['meadow1', 'hills'], ['hills', 'forest1'], ['forest1', 'forest2'], ['forest2', 'marsh'], ['forest2', 'cave1'], ['cave1', 'cave2'], ['cave2', 'oasis'], ['oasis', 'canyon'], ['canyon', 'snow'], ['snow', 'citadel'], ['citadel', 'throne']];
})();
