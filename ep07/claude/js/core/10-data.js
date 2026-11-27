/* 해돌전쟁 — 진영 / 유닛 / 건물 / 연구 데이터
   모든 이름과 설정은 이 게임을 위해 새로 지은 것입니다. */
'use strict';
(function (g) {
  var R = g.RTS;

  R.RES = {
    sun: { id: 'sun', name: '해돌', desc: '햇빛이 굳어 생긴 금빛 결정. 모든 것의 재료.' },
    dew: { id: 'dew', name: '달이슬', desc: '달빛 샘에서 솟는 푸른 이슬. 고급 유닛과 연구에 필요.' }
  };

  // 자원 노드 설정
  R.NODES = {
    sun: { res: 'sun', name: '해돌 무더기', size: 1, amount: 1300, carrySlots: 1, beamSlots: 2 },
    sunRich: { res: 'sun', name: '큰 해돌 무더기', size: 1, amount: 2200, carrySlots: 1, beamSlots: 2 },
    dew: { res: 'dew', name: '달이슬 샘', size: 2, amount: 3200, carrySlots: 2, beamSlots: 3 }
  };

  /* ───────────── 진영 ───────────── */
  R.FACTIONS = {
    forge: {
      id: 'forge', name: '무쇠 공방', en: 'FORGE', motto: '두드리고, 조이고, 고친다',
      style: '수비 · 화력', stars: { 공격: 3, 방어: 5, 기동: 2 },
      summary: '두꺼운 장갑과 포화로 밀어붙이는 기계 장인 조합.',
      traits: [
        '모든 유닛과 건물이 두꺼운 장갑을 둘렀습니다',
        '땜장이가 건물을 직접 조립합니다 — 여럿이 붙으면 더 빨리 완성',
        '땜장이가 부서진 건물과 기계를 수리합니다',
        '느리지만 사거리가 가장 긴 포격을 가졌습니다',
        '진영 기술 〈불비 포격〉 — 찍은 곳에 불덩이를 퍼붓습니다'
      ],
      worker: 'tinker', hq: 'furnace', supply: 'boiler', prod1: 'assembly', prod2: 'foundry', tech: 'draft', tower: 'turret',
      buildings: ['boiler', 'assembly', 'foundry', 'turret', 'draft', 'furnace'],
      buildStyle: 'stay',
      army: { hammerer: 3, nailer: 4, turtle: 2.2, mortar: 1.2, dragonfly: 1.2 },
      upgrades: ['f_atk1', 'f_atk2', 'f_def1', 'f_def2', 'f_spc'],
      ui: { accent: '#f0a04b', deep: '#3a2a1c' }
    },
    sprout: {
      id: 'sprout', name: '새순 일족', en: 'SPROUT', motto: '심으면 자라고, 베여도 다시 돋는다',
      style: '물량 · 재생', stars: { 공격: 3, 방어: 3, 기동: 3 },
      summary: '끝없이 돋아나 숲으로 뒤덮는 살아 있는 풀과 나무의 무리.',
      traits: [
        '모든 유닛과 건물이 스스로 체력을 회복합니다',
        '씨앗만 심으면 건물이 저절로 자랍니다 — 일꾼은 바로 다음 일로',
        '값싸고 빨리 자라는 물량으로 에워쌉니다',
        '하나하나는 여린 편입니다',
        '진영 기술 〈생명의 비〉 — 넓은 범위의 아군을 치유합니다'
      ],
      worker: 'sprig', hq: 'mothertree', supply: 'dewbloom', prod1: 'seedbed', prod2: 'hollow', tech: 'elder', tower: 'thornvine',
      buildings: ['dewbloom', 'seedbed', 'hollow', 'thornvine', 'elder', 'mothertree'],
      buildStyle: 'seed',
      army: { burr: 4.5, spitter: 4, stumpling: 2, gourd: 1.1, moth: 1.2 },
      upgrades: ['s_atk1', 's_atk2', 's_def1', 's_def2', 's_spc'],
      ui: { accent: '#8fd65a', deep: '#1f3320' }
    },
    storm: {
      id: 'storm', name: '번개 유랑단', en: 'STORM', motto: '바람처럼 달려, 벼락처럼 친다',
      style: '기동 · 기습', stars: { 공격: 5, 방어: 2, 기동: 5 },
      summary: '폭풍을 타고 떠도는 유랑민. 빠르고 날카롭지만 맷집은 약하다.',
      traits: [
        '가장 빠르고, 지상 유닛도 물 위를 미끄러져 건넙니다',
        '축전 — 잠시 쉬었다 날리는 첫 일격이 훨씬 강합니다',
        '소금쟁이는 자원을 들고 오가지 않고 제자리에서 전송합니다',
        '건물을 멀리서 하늘로부터 내려 세웁니다',
        '체력과 장갑이 약합니다',
        '진영 기술 〈천둥 폭풍〉 — 벼락이 잇달아 내리치는 폭풍을 부릅니다'
      ],
      worker: 'strider', hq: 'pavilion', supply: 'pinwheel', prod1: 'whirltent', prod2: 'altar', tech: 'weather', tower: 'rod',
      buildings: ['pinwheel', 'whirltent', 'altar', 'rod', 'weather', 'pavilion'],
      buildStyle: 'remote', remoteRange: 6,
      army: { gale: 3.2, bolter: 4.2, chariot: 2.2, drum: 1.1, hawk: 1.4 },
      upgrades: ['t_atk1', 't_atk2', 't_def1', 't_def2', 't_spc'],
      ui: { accent: '#7fd4ff', deep: '#1c2440' }
    }
  };
  R.FACTION_IDS = ['forge', 'sprout', 'storm'];

  /* ───────────── 유닛 ─────────────
     speed: 타일/초, range: 타일, r: 픽셀 반지름, time: 생산 시간(초) */
  var U = R.UNITS = {
    /* ── 무쇠 공방 ── */
    tinker: {
      faction: 'forge', name: '땜장이', role: '일꾼',
      desc: '해돌과 달이슬을 캐고, 건물을 조립하고 수리합니다.',
      cost: { sun: 50, dew: 0 }, supply: 1, time: 12,
      hp: 50, armor: 0, atype: 'light', speed: 2.5, r: 9, sight: 7, layer: 'ground',
      weapon: { kind: 'melee', dmg: 5, cd: 1.2, range: 0.3, ground: true, air: false, fx: 'wrench' },
      worker: { carry: 5, mineTime: 2.4, style: 'carry', build: 'stay', repair: true }
    },
    hammerer: {
      faction: 'forge', name: '망치꾼', role: '근접 돌격',
      desc: '큼직한 망치를 휘두르는 태엽 병사. 단단한 장갑으로 앞줄을 맡습니다.',
      cost: { sun: 70, dew: 0 }, supply: 1, time: 15,
      hp: 132, armor: 2, atype: 'heavy', speed: 2.5, r: 10, sight: 7, layer: 'ground',
      weapon: { kind: 'melee', dmg: 13, cd: 1.0, range: 0.35, ground: true, air: false, fx: 'hammer' }
    },
    nailer: {
      faction: 'forge', name: '못총수', role: '원거리 · 대공',
      desc: '못을 쉴 새 없이 쏘아 대는 사수. 하늘의 적도 맞힙니다.',
      cost: { sun: 85, dew: 0 }, supply: 1, time: 17,
      hp: 70, armor: 1, atype: 'light', speed: 2.5, r: 9, sight: 8, layer: 'ground',
      weapon: { kind: 'proj', dmg: 6.8, cd: 0.5, range: 5, speed: 17, ground: true, air: true, fx: 'nail' }
    },
    turtle: {
      faction: 'forge', name: '무쇠거북', role: '중장갑 전차',
      desc: '등딱지 포탑을 얹은 육중한 전차. 건물과 중장갑에 강합니다.',
      cost: { sun: 160, dew: 60 }, supply: 3, time: 30,
      hp: 335, armor: 3, atype: 'heavy', speed: 2.0, r: 14, sight: 8, layer: 'ground',
      weapon: { kind: 'proj', dmg: 32, cd: 1.7, range: 5, speed: 15, ground: true, air: false, fx: 'cannon', bonus: { structure: 1.3, heavy: 1.25 }, turret: true }
    },
    mortar: {
      faction: 'forge', name: '불절구', role: '공성 포격',
      desc: '불덩이를 멀리 쏘아 올리는 절구포. 넓게 터지지만 코앞은 못 쏩니다.',
      cost: { sun: 140, dew: 110 }, supply: 3, time: 34, requires: ['draft'],
      hp: 120, armor: 1, atype: 'heavy', speed: 1.7, r: 12, sight: 9, layer: 'ground',
      weapon: { kind: 'lob', dmg: 48, cd: 3.3, range: 9.5, min: 2.5, speed: 8, splash: 1.3, ground: true, air: false, fx: 'mortar', bonus: { structure: 1.8 } }
    },
    dragonfly: {
      faction: 'forge', name: '쇠잠자리', role: '비행 포함',
      desc: '쌍날개 회전익으로 나는 기관포함. 지형을 무시하고 날아갑니다.',
      cost: { sun: 120, dew: 90 }, supply: 2, time: 28, requires: ['draft'],
      hp: 135, armor: 1, atype: 'light', speed: 3.6, r: 12, sight: 9, layer: 'air',
      weapon: { kind: 'proj', dmg: 9, cd: 0.6, range: 4.5, speed: 17, ground: true, air: true, fx: 'gyro' }
    },

    /* ── 새순 일족 ── */
    sprig: {
      faction: 'sprout', name: '싹둥이', role: '일꾼',
      desc: '부지런한 새싹. 자원을 나르고 건물 씨앗을 심습니다.',
      cost: { sun: 50, dew: 0 }, supply: 1, time: 12,
      hp: 42, armor: 0, atype: 'light', speed: 2.7, r: 9, sight: 7, layer: 'ground', regen: 0.5,
      weapon: { kind: 'melee', dmg: 4, cd: 1.1, range: 0.3, ground: true, air: false, fx: 'slap' },
      worker: { carry: 5, mineTime: 2.4, style: 'carry', build: 'seed' }
    },
    burr: {
      faction: 'sprout', name: '밤송이', role: '근접 물량',
      desc: '데굴데굴 굴러가 가시로 들이받습니다. 싸고 빠르게 자랍니다.',
      cost: { sun: 45, dew: 0 }, supply: 1, time: 12,
      hp: 68, armor: 0, atype: 'light', speed: 3.3, r: 9, sight: 7, layer: 'ground', regen: 0.8,
      weapon: { kind: 'melee', dmg: 8, cd: 0.8, range: 0.3, ground: true, air: false, fx: 'burr' }
    },
    spitter: {
      faction: 'sprout', name: '씨뿜이', role: '원거리 · 대공',
      desc: '단단한 씨앗을 뱉어 멀리 있는 적과 하늘의 적을 맞힙니다. 중장갑에 더 아프게 박힙니다.',
      cost: { sun: 75, dew: 0 }, supply: 1, time: 15,
      hp: 54, armor: 0, atype: 'light', speed: 2.7, r: 9, sight: 8, layer: 'ground', regen: 0.7,
      weapon: { kind: 'proj', dmg: 9, cd: 0.9, range: 5.5, speed: 13, ground: true, air: true, fx: 'seed', bonus: { heavy: 1.25 } }
    },
    stumpling: {
      faction: 'sprout', name: '둥치장사', role: '거대 근접',
      desc: '걸어 다니는 고목 그루터기. 건물을 주먹으로 부수고 금세 아뭅니다.',
      cost: { sun: 170, dew: 70 }, supply: 3, time: 30,
      hp: 390, armor: 1, atype: 'heavy', speed: 2.0, r: 14, sight: 7, layer: 'ground', regen: 2.2,
      weapon: { kind: 'melee', dmg: 30, cd: 1.5, range: 0.4, cleave: 1.0, ground: true, air: false, fx: 'smash', bonus: { structure: 1.5 } }
    },
    gourd: {
      faction: 'sprout', name: '호박포', role: '공성 포격',
      desc: '잘 익은 호박을 멀리 던져 터뜨립니다. 건물과 뭉친 적에게 강합니다.',
      cost: { sun: 130, dew: 100 }, supply: 3, time: 32, requires: ['elder'],
      hp: 105, armor: 0, atype: 'heavy', speed: 1.9, r: 12, sight: 9, layer: 'ground', regen: 0.8,
      weapon: { kind: 'lob', dmg: 40, cd: 3.2, range: 9, min: 2.5, speed: 7.5, splash: 1.5, ground: true, air: false, fx: 'gourd', bonus: { structure: 1.7 } }
    },
    moth: {
      faction: 'sprout', name: '홀씨나비', role: '비행 유격',
      desc: '잎 날개로 나는 나비. 가시 홀씨를 흩뿌려 공격합니다.',
      cost: { sun: 100, dew: 80 }, supply: 2, time: 24, requires: ['elder'],
      hp: 92, armor: 0, atype: 'light', speed: 3.8, r: 11, sight: 9, layer: 'air', regen: 0.8,
      weapon: { kind: 'proj', dmg: 8, cd: 0.6, range: 4, speed: 12, ground: true, air: true, fx: 'pollen' }
    },

    /* ── 번개 유랑단 ── */
    strider: {
      faction: 'storm', name: '소금쟁이', role: '일꾼',
      desc: '물 위를 스치듯 달리는 일꾼. 자원을 제자리에서 번개로 전송합니다.',
      cost: { sun: 55, dew: 0 }, supply: 1, time: 12,
      hp: 38, armor: 0, atype: 'light', speed: 3.0, r: 9, sight: 7, layer: 'hover',
      weapon: { kind: 'melee', dmg: 4, cd: 1.1, range: 0.3, ground: true, air: false, fx: 'slap' },
      worker: { carry: 5, mineTime: 5.4, style: 'beam', build: 'remote' }
    },
    gale: {
      faction: 'storm', name: '바람칼', role: '고속 근접',
      desc: '바람판을 타고 달려드는 쌍칼잡이. 축전된 첫 칼질이 매섭습니다.',
      cost: { sun: 70, dew: 0 }, supply: 1, time: 15,
      hp: 83, armor: 0, atype: 'light', speed: 3.9, r: 9, sight: 8, layer: 'hover',
      weapon: { kind: 'melee', dmg: 10, cd: 0.75, range: 0.35, ground: true, air: false, fx: 'blade' },
      charge: { time: 4, mult: 2.5 }
    },
    bolter: {
      faction: 'storm', name: '번개살잡이', role: '원거리 · 대공',
      desc: '번개 화살을 쏘는 궁수. 사거리가 길고 첫 화살이 강합니다.',
      cost: { sun: 90, dew: 0 }, supply: 1, time: 17,
      hp: 57, armor: 0, atype: 'light', speed: 3.0, r: 9, sight: 9, layer: 'hover',
      weapon: { kind: 'proj', dmg: 13.5, cd: 1.25, range: 6, speed: 22, ground: true, air: true, fx: 'arrow' },
      charge: { time: 4, mult: 2.0 }
    },
    chariot: {
      faction: 'storm', name: '우레수레', role: '연쇄 번개 전차',
      desc: '쌍둥이 번개북을 실은 수레. 번개가 가까운 적에게 차례로 튑니다.',
      cost: { sun: 160, dew: 80 }, supply: 3, time: 30,
      hp: 240, armor: 1, atype: 'heavy', speed: 3.1, r: 14, sight: 8, layer: 'hover',
      weapon: { kind: 'zap', dmg: 17, cd: 1.15, range: 4.5, chain: 4, ground: true, air: true, fx: 'chain' },
      charge: { time: 4, mult: 1.6 }
    },
    drum: {
      faction: 'storm', name: '구름북', role: '공성 낙뢰',
      desc: '큰북을 울려 먼 곳에 벼락을 떨어뜨립니다. 건물에 특히 강합니다.',
      cost: { sun: 150, dew: 130 }, supply: 3, time: 34, requires: ['weather'],
      hp: 96, armor: 0, atype: 'heavy', speed: 2.0, r: 12, sight: 9, layer: 'hover',
      weapon: { kind: 'strike', dmg: 52, cd: 3.6, range: 10, min: 2, delay: 0.55, splash: 1.0, ground: true, air: false, fx: 'strike', bonus: { structure: 1.6 } }
    },
    hawk: {
      faction: 'storm', name: '번개매', role: '비행 강습',
      desc: '벼락을 품고 내리꽂는 매. 가장 빠른 비행 유닛입니다.',
      cost: { sun: 130, dew: 100 }, supply: 2, time: 28, requires: ['weather'],
      hp: 100, armor: 0, atype: 'light', speed: 4.3, r: 12, sight: 10, layer: 'air',
      weapon: { kind: 'proj', dmg: 15, cd: 1.05, range: 4.5, speed: 20, ground: true, air: true, fx: 'talon' },
      charge: { time: 4, mult: 2.0 }
    }
  };

  /* ───────────── 건물 ─────────────
     size: 한 변의 타일 수, time: 건설 시간(초) */
  var B = R.BUILDINGS = {
    /* ── 무쇠 공방 ── */
    furnace: {
      faction: 'forge', name: '큰화로', role: '본진',
      desc: '공방의 심장. 땜장이를 만들고 자원을 받아 둡니다.',
      cost: { sun: 400, dew: 0 }, time: 68, hp: 1500, armor: 2, size: 4, sight: 10,
      provides: 10, hq: true, dropoff: true, produces: ['tinker']
    },
    boiler: {
      faction: 'forge', name: '증기통', role: '보급',
      desc: '증기를 모아 보급 한도를 8 늘립니다.',
      cost: { sun: 100, dew: 0 }, time: 19, hp: 360, armor: 1, size: 2, sight: 6, provides: 8
    },
    assembly: {
      faction: 'forge', name: '조립장', role: '기본 병력 생산',
      desc: '망치꾼과 못총수를 조립합니다.',
      cost: { sun: 150, dew: 0 }, time: 30, hp: 820, armor: 2, size: 3, sight: 7,
      produces: ['hammerer', 'nailer']
    },
    foundry: {
      faction: 'forge', name: '주물 공장', role: '중장비 생산',
      desc: '무쇠거북, 불절구, 쇠잠자리를 찍어 냅니다.',
      cost: { sun: 200, dew: 100 }, time: 40, hp: 920, armor: 2, size: 3, sight: 7,
      requires: ['assembly'], produces: ['turtle', 'mortar', 'dragonfly']
    },
    draft: {
      faction: 'forge', name: '설계실', role: '연구',
      desc: '무기와 장갑을 연구합니다. 불절구와 쇠잠자리 생산에 필요합니다.',
      cost: { sun: 150, dew: 100 }, time: 34, hp: 660, armor: 1, size: 3, sight: 7,
      requires: ['assembly'], researches: ['f_atk1', 'f_atk2', 'f_def1', 'f_def2', 'f_spc']
    },
    turret: {
      faction: 'forge', name: '못포탑', role: '방어 탑',
      desc: '다가오는 지상·공중의 적에게 못을 퍼붓습니다.',
      cost: { sun: 125, dew: 0 }, time: 22, hp: 330, armor: 2, size: 2, sight: 8,
      requires: ['assembly'],
      weapon: { kind: 'proj', dmg: 10, cd: 0.6, range: 6.5, speed: 17, ground: true, air: true, fx: 'nail', turret: true }
    },

    /* ── 새순 일족 ── */
    mothertree: {
      faction: 'sprout', name: '어미나무', role: '본진',
      desc: '일족의 뿌리. 싹둥이를 틔우고 자원을 받아 둡니다.',
      cost: { sun: 400, dew: 0 }, time: 76, hp: 1400, armor: 1, size: 4, sight: 10, regen: 3,
      provides: 10, hq: true, dropoff: true, produces: ['sprig']
    },
    dewbloom: {
      faction: 'sprout', name: '이슬꽃', role: '보급',
      desc: '이슬을 머금은 큰 꽃. 보급 한도를 8 늘립니다.',
      cost: { sun: 100, dew: 0 }, time: 23, hp: 300, armor: 0, size: 2, sight: 6, regen: 1.5, provides: 8
    },
    seedbed: {
      faction: 'sprout', name: '새순 못자리', role: '기본 병력 생산',
      desc: '밤송이와 씨뿜이를 길러 냅니다.',
      cost: { sun: 140, dew: 0 }, time: 38, hp: 720, armor: 1, size: 3, sight: 7, regen: 2,
      produces: ['burr', 'spitter']
    },
    hollow: {
      faction: 'sprout', name: '옹이굴', role: '큰 병력 생산',
      desc: '둥치장사, 호박포, 홀씨나비가 깨어나는 고목 굴.',
      cost: { sun: 190, dew: 90 }, time: 44, hp: 820, armor: 1, size: 3, sight: 7, regen: 2,
      requires: ['seedbed'], produces: ['stumpling', 'gourd', 'moth']
    },
    elder: {
      faction: 'sprout', name: '지혜의 고목', role: '연구',
      desc: '오래된 나무의 지혜로 일족을 강하게 합니다. 호박포와 홀씨나비에 필요합니다.',
      cost: { sun: 150, dew: 100 }, time: 38, hp: 620, armor: 1, size: 3, sight: 7, regen: 2,
      requires: ['seedbed'], researches: ['s_atk1', 's_atk2', 's_def1', 's_def2', 's_spc']
    },
    thornvine: {
      faction: 'sprout', name: '가시덩굴', role: '방어 탑',
      desc: '가시를 쏘아 지상·공중의 적을 막는 덩굴.',
      cost: { sun: 100, dew: 0 }, time: 25, hp: 270, armor: 0, size: 2, sight: 8, regen: 1.5,
      requires: ['seedbed'],
      weapon: { kind: 'proj', dmg: 14, cd: 1.0, range: 6, speed: 14, ground: true, air: true, fx: 'thorn', turret: true }
    },

    /* ── 번개 유랑단 ── */
    pavilion: {
      faction: 'storm', name: '벼락 장막', role: '본진',
      desc: '유랑단의 큰 천막. 소금쟁이를 부르고 전송된 자원을 받습니다.',
      cost: { sun: 400, dew: 0 }, time: 72, hp: 1260, armor: 1, size: 4, sight: 11,
      provides: 10, hq: true, dropoff: true, produces: ['strider']
    },
    pinwheel: {
      faction: 'storm', name: '바람개비', role: '보급',
      desc: '바람을 모아 보급 한도를 8 늘립니다.',
      cost: { sun: 100, dew: 0 }, time: 21, hp: 260, armor: 0, size: 2, sight: 7, provides: 8
    },
    whirltent: {
      faction: 'storm', name: '돌개 천막', role: '기본 병력 생산',
      desc: '바람칼과 번개살잡이가 모이는 천막.',
      cost: { sun: 150, dew: 0 }, time: 34, hp: 660, armor: 1, size: 3, sight: 7,
      produces: ['gale', 'bolter']
    },
    altar: {
      faction: 'storm', name: '폭풍 제단', role: '큰 병력 생산',
      desc: '우레수레, 구름북, 번개매를 불러내는 제단.',
      cost: { sun: 200, dew: 110 }, time: 42, hp: 760, armor: 1, size: 3, sight: 7,
      requires: ['whirltent'], produces: ['chariot', 'drum', 'hawk']
    },
    weather: {
      faction: 'storm', name: '기상탑', role: '연구',
      desc: '하늘을 읽어 번개를 벼립니다. 구름북과 번개매에 필요합니다.',
      cost: { sun: 150, dew: 110 }, time: 36, hp: 570, armor: 1, size: 3, sight: 8,
      requires: ['whirltent'], researches: ['t_atk1', 't_atk2', 't_def1', 't_def2', 't_spc']
    },
    rod: {
      faction: 'storm', name: '피뢰침', role: '방어 탑',
      desc: '모아 둔 벼락을 적에게 쏘아 냅니다. 번개가 옆의 적에게도 튑니다.',
      cost: { sun: 130, dew: 0 }, time: 23, hp: 240, armor: 1, size: 2, sight: 8,
      requires: ['whirltent'],
      weapon: { kind: 'zap', dmg: 20, cd: 1.3, range: 7, chain: 2, ground: true, air: true, fx: 'rodzap' }
    }
  };

  /* ───────────── 연구 ───────────── */
  function upg(faction, id, name, desc, sun, dew, time, effect, requires) {
    R.UPGRADES[id] = { id: id, faction: faction, name: name, desc: desc, cost: { sun: sun, dew: dew }, time: time, effect: effect, requiresUpg: requires || null };
  }
  R.UPGRADES = {};
  upg('forge', 'f_atk1', '단조 탄두 I', '모든 유닛과 탑의 공격력 +15%', 100, 100, 40, { atk: 1 });
  upg('forge', 'f_atk2', '단조 탄두 II', '모든 유닛과 탑의 공격력 +30%', 175, 175, 55, { atk: 2 }, 'f_atk1');
  upg('forge', 'f_def1', '겹판 장갑 I', '모든 유닛과 건물의 장갑 +1', 100, 100, 40, { def: 1 });
  upg('forge', 'f_def2', '겹판 장갑 II', '모든 유닛과 건물의 장갑 +2', 175, 175, 55, { def: 2 }, 'f_def1');
  upg('forge', 'f_spc', '증기 과급기', '모든 유닛의 이동 속도 +15%', 150, 150, 50, { spc: true });
  upg('sprout', 's_atk1', '날 선 가시 I', '모든 유닛과 탑의 공격력 +15%', 100, 100, 40, { atk: 1 });
  upg('sprout', 's_atk2', '날 선 가시 II', '모든 유닛과 탑의 공격력 +30%', 175, 175, 55, { atk: 2 }, 's_atk1');
  upg('sprout', 's_def1', '단단한 껍질 I', '모든 유닛과 건물의 장갑 +1', 100, 100, 40, { def: 1 });
  upg('sprout', 's_def2', '단단한 껍질 II', '모든 유닛과 건물의 장갑 +2', 175, 175, 55, { def: 2 }, 's_def1');
  upg('sprout', 's_spc', '깊은 뿌리', '체력 회복 속도 2배', 150, 150, 50, { spc: true });
  upg('storm', 't_atk1', '벼린 번개 I', '모든 유닛과 탑의 공격력 +15%', 100, 100, 40, { atk: 1 });
  upg('storm', 't_atk2', '벼린 번개 II', '모든 유닛과 탑의 공격력 +30%', 175, 175, 55, { atk: 2 }, 't_atk1');
  upg('storm', 't_def1', '바람막이 I', '모든 유닛과 건물의 장갑 +1', 100, 100, 40, { def: 1 });
  upg('storm', 't_def2', '바람막이 II', '모든 유닛과 건물의 장갑 +2', 175, 175, 55, { def: 2 }, 't_def1');
  upg('storm', 't_spc', '폭풍의 눈', '축전에 걸리는 시간이 절반으로', 150, 150, 50, { spc: true });

  // id 채우기 + 어디서 생산되는지 역참조
  var k;
  for (k in U) { U[k].id = k; U[k].isUnit = true; }
  for (k in B) {
    B[k].id = k; B[k].isBuilding = true;
    (B[k].produces || []).forEach(function (uid) { U[uid].madeAt = k; });
    (B[k].researches || []).forEach(function (rid) { R.UPGRADES[rid].madeAt = k; });
  }

  R.defOf = function (type) { return U[type] || B[type] || null; };

  // 난이도 설정
  R.DIFFICULTY = [
    { id: 0, name: '쉬움', desc: '느긋하게 배우기 좋은 상대 (자원 채집 -25%)', gather: 0.75, think: 30, maxWorkers: 12, firstAttack: 480, waveBase: 7, waveGrow: 3, waveGap: 170, upgrades: false, expand: false, expandAt: 0, towers: 1, prodCap: 2, powers: false, powerAt: 0, probeAt: 0 },
    { id: 1, name: '보통', desc: '제법 싸울 줄 아는 상대 (자원 채집 -10%)', gather: 0.9, think: 20, maxWorkers: 20, firstAttack: 330, waveBase: 10, waveGrow: 5, waveGap: 110, upgrades: true, expand: true, expandAt: 480, towers: 2, prodCap: 3, powers: true, powerAt: 420, probeAt: 175 },
    { id: 2, name: '어려움', desc: '쉴 틈 없이 몰아치는 상대 (자원 채집 +15%)', gather: 1.15, think: 10, maxWorkers: 30, firstAttack: 210, waveBase: 13, waveGrow: 7, waveGap: 70, upgrades: true, expand: true, expandAt: 300, towers: 3, prodCap: 6, powers: true, powerAt: 0, probeAt: 135 }
  ];


  // 계급: 처치 수가 kills[n]에 이르면 n+1계급. 계급마다 공격력과 최대 체력이 bonus만큼 오른다
  R.RANKS = { kills: [3, 7, 14], bonus: 0.1 };

  R.TEAM_COLORS = [
    { name: '파랑', main: '#3d9bff', dark: '#1b4f96', light: '#a8d4ff' },
    { name: '빨강', main: '#ff5040', dark: '#96231b', light: '#ffb0a6' },
    { name: '보라', main: '#b978ff', dark: '#5b2d96', light: '#e0c4ff' },
    { name: '주황', main: '#ffa62b', dark: '#96560f', light: '#ffd9a0' }
  ];
})(typeof globalThis !== 'undefined' ? globalThis : this);
