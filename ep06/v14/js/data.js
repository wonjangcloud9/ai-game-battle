'use strict';
/* 등불지기 — game data: jobs, skills, items, monsters, NPCs, shops, quests, formulas */
(function () {
  const G = window.G, U = G.U;
  const D = (G.D = {});

  D.TITLE = '등불지기';
  D.SUB = '어스름을 밝히는 모험';
  D.MAX_LV = 50;
  D.JOB_LV = [0, 5, 20, 35]; // level needed for job tier 1/2/3

  // ------------------------------------------------------------ job lines
  D.LINES = {
    novice: { names: ['견습 등불지기'], weapon: 'rod', main: 'str', hp: 1, mp: 1, color: '#f6a43c' },
    blade: {
      names: ['견습 등불지기', '불꽃검사', '홍염기사', '태양검성'], weapon: 'sword', main: 'str', hp: 1.3, mp: 0.8, color: '#ff7a3c',
      tag: '근접 · 튼튼함', desc: '불씨를 칼날에 실어 싸우는 근접 전사. 높은 체력과 넓은 베기로 적 무리를 정면에서 쓸어버립니다.',
    },
    star: {
      names: ['견습 등불지기', '별빛술사', '성좌현자', '은하대현자'], weapon: 'staff', main: 'int', hp: 0.92, mp: 1.5, color: '#8fa8ff',
      tag: '원거리 · 광역 마법', desc: '별빛을 엮어 마법을 부리는 술사. 몸은 약하지만 순간이동과 강력한 광역 마법으로 전장을 지배합니다.',
    },
    gale: {
      names: ['견습 등불지기', '바람사수', '질풍명궁', '천공신궁'], weapon: 'bow', main: 'dex', hp: 1.08, mp: 1, color: '#6fe0a0',
      tag: '원거리 · 치명타', desc: '바람을 읽는 명사수. 먼 거리에서 빠른 연사와 높은 치명타로 적을 꿰뚫고, 날렵하게 빠져나갑니다.',
    },
  };
  D.jobName = (line, tier) => (line === 'novice' ? D.LINES.novice.names[0] : D.LINES[line].names[tier]);
  D.STATS = [
    { k: 'str', name: '힘', desc: '검·등불 막대 공격력 증가, 최대 HP 소폭 증가' },
    { k: 'dex', name: '민첩', desc: '활 공격력 증가, 치명타 확률 증가' },
    { k: 'int', name: '지능', desc: '지팡이 공격력 증가, 최대 MP 증가' },
    { k: 'vit', name: '체력', desc: '최대 HP와 방어력 증가' },
  ];
  D.STAT_PER_LV = 3;
  D.SP_PER_LV = 2;

  // ------------------------------------------------------------ formulas
  D.expNeed = (lv) => Math.round(3 * lv * lv + 35 * lv - 5);
  D.monStat = (m) => {
    const L = m.lv;
    return {
      hp: Math.round((20 + L * 9 + L * L * 1.1) * (m.hp || 1)),
      atk: Math.round((8 + L * 3 + L * L * 0.08) * (m.atk || 1)),
      def: Math.round(L * 1.5 * (m.def || 1)),
      exp: Math.round((6 + L * 3.2 + L * L * 0.12) * (m.exp || 1)),
      gold: Math.round((4 + L * 1.3) * (m.gold || 1)),
    };
  };

  // ------------------------------------------------------------ skills
  // kind: active | buff | passive.  v(l) → numbers at skill level l.  desc(v) → text
  const S = (D.SKILLS = {});
  const sk = (id, o) => { o.id = id; o.icon = 'sk_' + id; S[id] = o; };
  const r1 = (n) => Math.round(n * 10) / 10;
  sk('n_smash', { name: '등불 내려치기', line: 'novice', tier: 0, kind: 'active', max: 5,
    v: (l) => ({ dmg: 150 + 15 * l, mp: 4, cd: 3 }),
    desc: (v) => `등불 막대를 힘껏 내려쳐 주변의 적 모두에게 ${v.dmg}% 피해를 줍니다.` });
  // --- blade
  sk('b_cleave', { name: '화염 가르기', line: 'blade', tier: 1, kind: 'active', max: 10,
    v: (l) => ({ dmg: 170 + 13 * l, n: 6, mp: 6 + Math.round(l * 0.6), cd: 2.2 }),
    desc: (v) => `불꽃을 두른 칼로 전방을 크게 베어 최대 ${v.n}마리에게 ${v.dmg}% 피해를 줍니다.` });
  sk('b_rush', { name: '불꽃 돌진', line: 'blade', tier: 1, kind: 'active', max: 10,
    v: (l) => ({ dmg: 150 + 12 * l, mp: 10, cd: r1(5 - 0.15 * l) }),
    desc: (v) => `전방으로 빠르게 돌진하며 경로의 적에게 ${v.dmg}% 피해를 줍니다. 돌진 중에는 피해를 받지 않습니다.` });
  sk('b_quake', { name: '대지 강타', line: 'blade', tier: 1, kind: 'active', max: 10,
    v: (l) => ({ dmg: 230 + 18 * l, mp: 16 + l, cd: r1(8 - 0.2 * l) }),
    desc: (v) => `땅을 내리쳐 양쪽으로 퍼지는 충격파를 일으킵니다. ${v.dmg}% 피해를 주고 적을 띄워 올립니다.` });
  sk('b_body', { name: '단련된 육체', line: 'blade', tier: 1, kind: 'passive', max: 10,
    v: (l) => ({ hpp: 4 * l, defp: 3 * l }),
    desc: (v) => `최대 HP가 ${v.hpp}%, 방어력이 ${v.defp}% 증가합니다.` });
  sk('b_whirl', { name: '홍염 선풍', line: 'blade', tier: 2, kind: 'active', max: 10,
    v: (l) => ({ dmg: 80 + 7 * l, hits: 6, mp: 26, cd: r1(10 - 0.2 * l) }),
    desc: (v) => `불꽃 회오리가 되어 회전하며 주변의 적에게 ${v.dmg}% 피해를 ${v.hits}번 줍니다. 회전 중 이동할 수 있습니다.` });
  sk('b_roar', { name: '투지의 불꽃', line: 'blade', tier: 2, kind: 'buff', max: 10,
    v: (l) => ({ atkp: 12 + 2 * l, dur: 40, mp: 30, cd: 60 }),
    desc: (v) => `${v.dur}초 동안 공격력이 ${v.atkp}% 증가합니다.` });
  sk('b_mastery', { name: '검술 숙련', line: 'blade', tier: 2, kind: 'passive', max: 10,
    v: (l) => ({ atkp: 2 * l, crit: l }),
    desc: (v) => `공격력이 ${v.atkp}%, 치명타 확률이 ${v.crit}% 증가합니다.` });
  sk('b_sun', { name: '태양 낙하', line: 'blade', tier: 3, kind: 'active', max: 10,
    v: (l) => ({ dmg: 650 + 55 * l, mp: 55, cd: r1(24 - 0.4 * l) }),
    desc: (v) => `하늘로 뛰어올랐다가 태양처럼 내리꽂혀 넓은 범위에 ${v.dmg}% 피해를 줍니다.` });
  sk('b_ember', { name: '꺼지지 않는 불씨', line: 'blade', tier: 3, kind: 'passive', max: 10,
    v: (l) => ({ leech: r1(0.4 * l), critDmg: 4 * l }),
    desc: (v) => `준 피해의 ${v.leech}%만큼 HP를 회복하고, 치명타 피해가 ${v.critDmg}% 증가합니다.` });
  // --- star
  sk('s_bolt', { name: '별똥 화살', line: 'star', tier: 1, kind: 'active', max: 10,
    v: (l) => ({ dmg: 85 + 7 * l, n: 3, mp: 9, cd: 2.2 }),
    desc: (v) => `적을 쫓아가는 별똥별 ${v.n}개를 쏘아 각각 ${v.dmg}% 피해를 줍니다.` });
  sk('s_blink', { name: '별빛 도약', line: 'star', tier: 1, kind: 'active', max: 10,
    v: (l) => ({ dmg: 120 + 10 * l, dist: 230 + 6 * l, mp: 12, cd: r1(4.5 - 0.15 * l) }),
    desc: (v) => `전방으로 순간이동하고, 지나간 자리의 적에게 ${v.dmg}% 피해를 줍니다.` });
  sk('s_nova', { name: '서리 고리', line: 'star', tier: 1, kind: 'active', max: 10,
    v: (l) => ({ dmg: 210 + 16 * l, slow: 40, dur: 3, mp: 18 + l, cd: r1(7 - 0.15 * l) }),
    desc: (v) => `서리의 고리를 터뜨려 주변의 적에게 ${v.dmg}% 피해를 주고 ${v.dur}초 동안 ${v.slow}% 느리게 만듭니다.` });
  sk('s_mind', { name: '마력 순환', line: 'star', tier: 1, kind: 'passive', max: 10,
    v: (l) => ({ mpp: 5 * l, regen: r1(0.4 * l) }),
    desc: (v) => `최대 MP가 ${v.mpp}% 증가하고, 초당 MP를 ${v.regen} 더 회복합니다.` });
  sk('s_meteor', { name: '유성우', line: 'star', tier: 2, kind: 'active', max: 10,
    v: (l) => ({ dmg: 150 + 12 * l, n: 6, mp: 42, cd: r1(12 - 0.25 * l) }),
    desc: (v) => `전방에 유성 ${v.n}개를 떨어뜨립니다. 유성 하나마다 ${v.dmg}% 범위 피해를 줍니다.` });
  sk('s_chain', { name: '번개 사슬', line: 'star', tier: 2, kind: 'active', max: 10,
    v: (l) => ({ dmg: 230 + 16 * l, n: 5, mp: 24, cd: r1(6 - 0.1 * l) }),
    desc: (v) => `번개가 적 사이를 튀어 다니며 최대 ${v.n}마리에게 ${v.dmg}% 피해를 줍니다.` });
  sk('s_wisdom', { name: '별의 지혜', line: 'star', tier: 2, kind: 'passive', max: 10,
    v: (l) => ({ atkp: r1(2.5 * l), cdr: l }),
    desc: (v) => `공격력이 ${v.atkp}% 증가하고, 스킬 재사용 대기시간이 ${v.cdr}% 줄어듭니다.` });
  sk('s_galaxy', { name: '은하 붕괴', line: 'star', tier: 3, kind: 'active', max: 10,
    v: (l) => ({ dmg: 560 + 48 * l, tick: 40 + 4 * l, mp: 80, cd: r1(30 - 0.5 * l) }),
    desc: (v) => `작은 은하를 만들어 적을 끌어당기며 ${v.tick}% 피해를 8번 주고, 폭발하며 ${v.dmg}% 피해를 줍니다.` });
  sk('s_ward', { name: '마나 방벽', line: 'star', tier: 3, kind: 'passive', max: 10,
    v: (l) => ({ ward: 3 * l }),
    desc: (v) => `받는 피해의 ${v.ward}%를 HP 대신 MP로 받습니다.` });
  // --- gale
  sk('g_multi', { name: '연속 사격', line: 'gale', tier: 1, kind: 'active', max: 10,
    v: (l) => ({ dmg: 75 + 6 * l, n: 3, mp: 8, cd: 2 }),
    desc: (v) => `화살 ${v.n}발을 연달아 쏘아 각각 ${v.dmg}% 피해를 줍니다.` });
  sk('g_back', { name: '후방 도약', line: 'gale', tier: 1, kind: 'active', max: 10,
    v: (l) => ({ dmg: 170 + 12 * l, mp: 10, cd: r1(4.5 - 0.15 * l) }),
    desc: (v) => `뒤로 훌쩍 뛰어 물러나며 전방에 ${v.dmg}% 피해의 화살을 쏩니다. 도약 중에는 피해를 받지 않습니다.` });
  sk('g_pierce', { name: '관통 바람살', line: 'gale', tier: 1, kind: 'active', max: 10,
    v: (l) => ({ dmg: 250 + 18 * l, mp: 16 + l, cd: r1(7 - 0.15 * l) }),
    desc: (v) => `바람을 실은 화살이 일직선상의 모든 적을 꿰뚫어 ${v.dmg}% 피해를 줍니다.` });
  sk('g_eye', { name: '매의 눈', line: 'gale', tier: 1, kind: 'passive', max: 10,
    v: (l) => ({ crit: 2 * l, range: 3 * l }),
    desc: (v) => `치명타 확률이 ${v.crit}%, 사거리가 ${v.range}% 증가합니다.` });
  sk('g_rain', { name: '화살비', line: 'gale', tier: 2, kind: 'active', max: 10,
    v: (l) => ({ dmg: 60 + 5 * l, hits: 8, mp: 36, cd: r1(12 - 0.25 * l) }),
    desc: (v) => `전방 넓은 범위에 화살비를 내려 ${v.dmg}% 피해를 ${v.hits}번 줍니다.` });
  sk('g_gale', { name: '질풍의 가호', line: 'gale', tier: 2, kind: 'buff', max: 10,
    v: (l) => ({ aspd: 15 + Math.round(1.5 * l), spd: 10 + l, dur: 40, mp: 28, cd: 60 }),
    desc: (v) => `${v.dur}초 동안 공격 속도가 ${v.aspd}%, 이동 속도가 ${v.spd}% 증가합니다.` });
  sk('g_mastery', { name: '활 숙련', line: 'gale', tier: 2, kind: 'passive', max: 10,
    v: (l) => ({ atkp: 2 * l, critDmg: 3 * l }),
    desc: (v) => `공격력이 ${v.atkp}%, 치명타 피해가 ${v.critDmg}% 증가합니다.` });
  sk('g_sky', { name: '천공의 일격', line: 'gale', tier: 3, kind: 'active', max: 10,
    v: (l) => ({ dmg: 600 + 50 * l, mp: 60, cd: r1(24 - 0.4 * l) }),
    desc: (v) => `번개를 실은 거대한 화살을 쏘아 화면 끝까지 모든 적을 꿰뚫고 ${v.dmg}% 피해를 줍니다.` });
  sk('g_twin', { name: '쌍둥이 화살', line: 'gale', tier: 3, kind: 'passive', max: 10,
    v: (l) => ({ twin: 5 * l }),
    desc: (v) => `기본 공격 시 ${v.twin}% 확률로 화살을 한 발 더 쏩니다.` });
  D.skillsOf = (line, tier) => Object.values(S).filter((s) => s.line === line && s.tier === tier);

  // ------------------------------------------------------------ items
  D.RAR = [
    { name: '일반', color: '#d9d9e3', mul: 1 },
    { name: '고급', color: '#6fdc6f', mul: 1.1 },
    { name: '희귀', color: '#5fa8ff', mul: 1.22 },
    { name: '영웅', color: '#c77dff', mul: 1.36 },
    { name: '전설', color: '#ffb347', mul: 1.55 },
  ];
  D.SLOTS = [
    { k: 'weapon', name: '무기' }, { k: 'helm', name: '투구' }, { k: 'armor', name: '갑옷' },
    { k: 'gloves', name: '장갑' }, { k: 'boots', name: '장화' }, { k: 'charm', name: '부적' },
  ];
  D.TIER_LV = [0, 1, 8, 15, 22, 30, 38, 45];
  const TKEY = ['', '견습생의', '이슬', '숲그늘', '수정', '모래바람', '서리', '여명'];
  const WATK = [0, 8, 20, 38, 62, 95, 135, 185];
  const UDEF = [0, 2, 5, 9, 14, 21, 29, 38];
  const PRICE = [0, 60, 400, 1500, 4500, 12000, 28000, 60000];
  const IT = (D.ITEMS = {});
  const it = (id, o) => { o.id = id; IT[id] = o; return o; };
  it('rod1', { name: '낡은 등불 막대', type: 'weapon', kind: 'rod', line: 'novice', tier: 1, lv: 1, atk: 6, price: 20, icon: 'rod_1', desc: '견습 등불지기에게 주어지는 등불 달린 막대.' });
  const WK = [['sword', '검', 'blade'], ['staff', '지팡이', 'star'], ['bow', '활', 'gale']];
  for (let t = 1; t <= 7; t++) {
    for (const [kind, nm, line] of WK) it(kind + t, { name: TKEY[t] + ' ' + nm, type: 'weapon', kind, line, tier: t, lv: D.TIER_LV[t], atk: WATK[t], price: PRICE[t], icon: kind + '_' + t });
    it('helm' + t, { name: TKEY[t] + ' ' + (t === 1 ? '두건' : '투구'), type: 'helm', tier: t, lv: D.TIER_LV[t], def: UDEF[t], price: Math.round(PRICE[t] * 0.5), icon: 'helm_' + t });
    it('armor' + t, { name: TKEY[t] + ' ' + (t === 1 ? '옷' : '갑옷'), type: 'armor', tier: t, lv: D.TIER_LV[t], def: UDEF[t] * 2, hp: t * 20, price: Math.round(PRICE[t] * 0.8), icon: 'armor_' + t });
    it('gloves' + t, { name: TKEY[t] + ' 장갑', type: 'gloves', tier: t, lv: D.TIER_LV[t], def: Math.round(UDEF[t] * 0.6), atkp: t, price: Math.round(PRICE[t] * 0.4), icon: 'gloves_' + t });
    it('boots' + t, { name: TKEY[t] + ' 장화', type: 'boots', tier: t, lv: D.TIER_LV[t], def: Math.round(UDEF[t] * 0.6), spd: 1 + t, price: Math.round(PRICE[t] * 0.4), icon: 'boots_' + t });
    it('charm' + t, { name: TKEY[t] + ' 부적', type: 'charm', tier: t, lv: D.TIER_LV[t], hp: t * 25, crit: 1 + Math.floor(t / 2), price: Math.round(PRICE[t] * 0.6), icon: 'charm_' + t });
  }
  // consumables
  it('hp1', { name: '작은 생명 물약', type: 'use', use: 'hp', val: 100, price: 30, icon: 'pot_hp_1', desc: 'HP를 100 회복합니다.' });
  it('hp2', { name: '생명 물약', type: 'use', use: 'hp', val: 350, price: 110, icon: 'pot_hp_2', desc: 'HP를 350 회복합니다.' });
  it('hp3', { name: '큰 생명 물약', type: 'use', use: 'hp', val: 1000, price: 320, icon: 'pot_hp_3', desc: 'HP를 1000 회복합니다.' });
  it('mp1', { name: '작은 마나 물약', type: 'use', use: 'mp', val: 60, price: 40, icon: 'pot_mp_1', desc: 'MP를 60 회복합니다.' });
  it('mp2', { name: '마나 물약', type: 'use', use: 'mp', val: 200, price: 140, icon: 'pot_mp_2', desc: 'MP를 200 회복합니다.' });
  it('mp3', { name: '큰 마나 물약', type: 'use', use: 'mp', val: 600, price: 400, icon: 'pot_mp_3', desc: 'MP를 600 회복합니다.' });
  it('elixir', { name: '등불 영약', type: 'use', use: 'full', price: 1500, icon: 'elixir', desc: 'HP와 MP를 모두 회복합니다. 어스름의 수호자들이 지니고 있습니다.' });
  it('scroll', { name: '귀환 주문서', type: 'use', use: 'return', price: 80, icon: 'scroll', desc: '마지막으로 들른 마을로 즉시 돌아갑니다.' });
  it('dust', { name: '빛가루', type: 'etc', price: 200, icon: 'dust', desc: '등대의 빛이 굳어 생긴 가루. 대장장이가 장비 강화에 사용합니다.' });

  // ------------------------------------------------------------ monsters
  // ai: hop | walk | lunge | shoot | fly | float | charge | still | boss | dummy
  // w,h: hitbox (art should roughly fill it; origin bottom-center, facing right)
  // hp/atk/def/exp/gold: multipliers on the level formula · col: main color (death particles) · mat: drop material name
  D.MON = {
    dummy:    { name: '허수아비', lv: 1, w: 46, h: 78, ai: 'dummy', col: '#e8c873' },
    // 이슬풀 들판 · 바람언덕
    puff:     { name: '솜뭉치', lv: 1, w: 44, h: 40, ai: 'hop', spd: 55, passive: true, col: '#f6f6ee', mat: '솜털 뭉치' },
    leafling: { name: '잎새귀', lv: 3, w: 46, h: 44, ai: 'walk', spd: 60, passive: true, col: '#8ad05a', mat: '싱싱한 잎사귀' },
    acorn:    { name: '도토리 병정', lv: 5, w: 42, h: 52, ai: 'lunge', spd: 75, col: '#b9783c', mat: '단단한 도토리' },
    bosspuff: { name: '몽실대왕', lv: 8, w: 130, h: 120, ai: 'boss', boss: true, hp: 14, atk: 1.8, exp: 12, gold: 30, spd: 90, col: '#fff6d8', atks: ['hop', 'roll', 'puff'], mat: '몽실대왕의 왕관잎' },
    // 속삭임 숲
    mossback: { name: '이끼등껍질', lv: 8, w: 64, h: 46, ai: 'walk', spd: 38, hp: 1.5, def: 2, exp: 1.2, col: '#6fae5a', mat: '이끼 등껍질 조각' },
    hootling: { name: '수풀부엉', lv: 10, w: 48, h: 46, ai: 'fly', spd: 110, hp: 0.85, col: '#b98a5a', mat: '부엉 깃털' },
    bramble:  { name: '가시덩굴', lv: 12, w: 46, h: 64, ai: 'still', proj: 'thorn', hp: 1.1, col: '#4f9a4a', mat: '뾰족 가시' },
    stag:     { name: '뿔갑대장 톨록', lv: 14, w: 170, h: 120, ai: 'boss', boss: true, hp: 21, atk: 1.9, def: 1.6, exp: 13, gold: 30, spd: 120, col: '#5a4a7a', atks: ['charge', 'toss', 'stomp'], mat: '톨록의 뿔 조각' },
    // 반딧불 늪
    toad:     { name: '늪방울 두꺼비', lv: 15, w: 56, h: 44, ai: 'hop', spd: 70, proj: 'bubble', col: '#3fa89a', mat: '끈적한 방울' },
    glowmoth: { name: '반디나방', lv: 17, w: 44, h: 40, ai: 'fly', spd: 130, hp: 0.8, col: '#d8ff7a', mat: '반딧불 가루' },
    mudling:  { name: '진흙덩이', lv: 19, w: 56, h: 58, ai: 'lunge', spd: 55, hp: 1.4, col: '#7a5f4c', mat: '말랑한 진흙' },
    lotus:    { name: '연꽃마녀 로타', lv: 21, w: 120, h: 150, ai: 'boss', boss: true, fly: true, hp: 26, atk: 1.9, exp: 14, gold: 30, spd: 80, col: '#f08fc0', atks: ['bubbles', 'rain', 'blink', 'summon'], mat: '로타의 연꽃잎' },
    // 메아리 동굴
    crybat:   { name: '수정박쥐', lv: 22, w: 50, h: 38, ai: 'fly', spd: 150, hp: 0.8, col: '#8f7fe0', mat: '수정 날개막' },
    orecrab:  { name: '광석게', lv: 24, w: 62, h: 44, ai: 'lunge', spd: 60, hp: 1.5, def: 2, exp: 1.2, col: '#7f8fb0', mat: '반짝 광석' },
    shade:    { name: '메아리 그림자', lv: 26, w: 46, h: 58, ai: 'float', spd: 70, proj: 'darkorb', hp: 0.9, col: '#6a5aa8', mat: '메아리 조각' },
    golem:    { name: '수정거인 크리스타', lv: 28, w: 180, h: 190, ai: 'boss', boss: true, hp: 30, atk: 2.0, def: 1.8, exp: 15, gold: 30, spd: 60, col: '#7fe0ff', atks: ['slam', 'spikes', 'laser', 'rockfall'], mat: '크리스타의 핵 조각' },
    // 붉은모래 협곡
    skink:    { name: '모래도마뱀', lv: 29, w: 62, h: 34, ai: 'walk', spd: 150, hp: 0.9, col: '#e0a868', mat: '모래 비늘' },
    cactus:   { name: '선인장 권투사', lv: 31, w: 48, h: 66, ai: 'lunge', spd: 70, hp: 1.3, col: '#5fb06a', mat: '선인장 꽃' },
    dustdevil:{ name: '회오리 정령', lv: 33, w: 50, h: 70, ai: 'charge', spd: 90, col: '#e8cf9a', mat: '회오리 구슬' },
    scorpion: { name: '전갈왕 스카브', lv: 35, w: 200, h: 140, ai: 'boss', boss: true, hp: 33, atk: 2.0, def: 1.6, exp: 16, gold: 30, spd: 110, col: '#b8503c', atks: ['stab', 'sweep', 'spit', 'burrow'], mat: '스카브의 독침' },
    // 서리송곳 설원
    snowimp:  { name: '눈뭉치 도깨비', lv: 36, w: 44, h: 50, ai: 'shoot', spd: 70, proj: 'snowball', col: '#eaf6ff', mat: '눈꽃 결정' },
    ram:      { name: '얼음뿔 산양', lv: 38, w: 66, h: 54, ai: 'charge', spd: 80, hp: 1.3, col: '#c8d8ea', mat: '얼음 뿔 조각' },
    wraith:   { name: '서리 망령', lv: 40, w: 50, h: 66, ai: 'float', spd: 80, proj: 'ice', hp: 0.9, col: '#a8dcf6', mat: '서리 망토 조각' },
    yeti:     { name: '설원군주 보르칸', lv: 42, w: 190, h: 200, ai: 'boss', boss: true, hp: 37, atk: 2.05, def: 1.5, exp: 17, gold: 30, spd: 100, col: '#eef6ff', atks: ['pound', 'throw', 'breath', 'leap'], mat: '보르칸의 얼음 발톱' },
    // 잿빛 성채
    gsoldier: { name: '어스름 병사', lv: 43, w: 50, h: 70, ai: 'lunge', spd: 85, hp: 1.3, def: 1.5, col: '#5a4a7a', mat: '어스름 갑옷 파편' },
    ghexer:   { name: '어스름 주술사', lv: 45, w: 48, h: 70, ai: 'shoot', spd: 55, proj: 'darkorb', col: '#8a4fd0', mat: '꺼진 등불 심지' },
    gargoyle: { name: '잿빛 가고일', lv: 47, w: 64, h: 60, ai: 'fly', spd: 160, hp: 1.1, def: 1.5, col: '#8a8098', mat: '잿빛 돌날개' },
    nox:      { name: '어스름 군주 녹스', lv: 50, w: 150, h: 200, ai: 'boss', boss: true, hp: 60, atk: 2.1, def: 1.6, exp: 25, gold: 60, spd: 130, col: '#8a4fd0', atks: ['slash', 'orbs', 'warp', 'meteor', 'summon'], mat: '녹스의 부서진 왕관' },
  };
  for (const id in D.MON) {
    const m = D.MON[id];
    m.id = id;
    if (m.mat) it('m_' + id, { name: m.mat, type: 'etc', price: m.boss ? 400 + m.lv * 60 : 3 + Math.round(m.lv * 1.4), icon: 'm_' + id, desc: m.boss ? m.name + '에게서 얻은 전리품. 상인들이 비싸게 사 줍니다.' : m.name + '에게서 얻은 재료.' });
  }

  // ------------------------------------------------------------ item instances
  D.OPTS = [
    { k: 'str', name: '힘', v: (t) => [1 + t, 2 + t * 2] },
    { k: 'dex', name: '민첩', v: (t) => [1 + t, 2 + t * 2] },
    { k: 'int', name: '지능', v: (t) => [1 + t, 2 + t * 2] },
    { k: 'vit', name: '체력', v: (t) => [1 + t, 2 + t * 2] },
    { k: 'hp', name: '최대 HP', v: (t) => [10 * t, 25 * t] },
    { k: 'mp', name: '최대 MP', v: (t) => [6 * t, 15 * t] },
    { k: 'crit', name: '치명타 확률', pct: 1, v: (t) => [1, 2 + (t >> 1)] },
    { k: 'atkp', name: '공격력', pct: 1, v: (t) => [1, 3 + (t >> 1)] },
    { k: 'def', name: '방어력', v: (t) => [t, 3 * t] },
    { k: 'spd', name: '이동 속도', pct: 1, v: () => [1, 4] },
    { k: 'expp', name: '경험치 획득', pct: 1, v: () => [2, 6] },
    { k: 'goldp', name: '골드 획득', pct: 1, v: () => [3, 10] },
  ];
  D.optName = (k) => (D.OPTS.find((o) => o.k === k) || {}).name || k;
  D.isEquip = (b) => b.type !== 'use' && b.type !== 'etc';
  // create an item instance. bias: rarity luck (0 normal, 1 elite, 2 boss)
  D.makeItem = (baseId, bias, forceRar) => {
    const b = IT[baseId];
    if (!b) return null;
    if (!D.isEquip(b)) return { b: baseId, n: 1 };
    let rar = 0;
    if (forceRar !== undefined) rar = forceRar;
    else {
      const r = Math.random(), k = bias || 0;
      const th = k >= 2 ? [0.1, 0.45, 0.82, 0.96] : k === 1 ? [0.4, 0.75, 0.93, 0.99] : [0.62, 0.89, 0.975, 0.996];
      rar = r < th[0] ? 0 : r < th[1] ? 1 : r < th[2] ? 2 : r < th[3] ? 3 : 4;
    }
    const opts = [], pool = D.OPTS.slice();
    for (let i = 0; i < rar; i++) {
      const o = pool.splice((Math.random() * pool.length) | 0, 1)[0], rg = o.v(b.tier);
      opts.push([o.k, U.randInt(rg[0], rg[1])]);
    }
    return { b: baseId, uid: U.uid(), rar, enh: 0, opts };
  };
  D.ENH_MAX = 10;
  D.ENH_RATE = [100, 95, 90, 80, 70, 60, 50, 40, 30, 20];
  D.enhCost = (item) => { const b = IT[item.b], e = item.enh || 0; return { gold: Math.round((40 + b.price * 0.08) * Math.pow(e + 1, 1.2)), dust: 1 + Math.floor(e / 3) }; };
  // final stats of an equipment instance (base × rarity × enhance + options)
  // every enhancement level adds 7% of the base, but never less than +1 per level
  // (low-tier gear used to round the bonus away: 견습생의 지팡이 공격력 9 → +1 → 9)
  D.itemStats = (item) => {
    const b = IT[item.b], r = D.RAR[item.rar || 0].mul, e = item.enh || 0, s = {};
    const up = (v) => Math.max(Math.round(v * r * (1 + e * 0.07)), Math.round(v * r) + e);
    if (b.atk) s.atk = up(b.atk);
    if (b.def) s.def = up(b.def);
    if (b.hp) s.hp = up(b.hp);
    if (b.atkp) s.atkp = b.atkp;
    if (b.spd) s.spd = b.spd;
    if (b.crit) s.crit = b.crit;
    if (item.opts) for (const [k, v] of item.opts) s[k] = (s[k] || 0) + v;
    return s;
  };
  D.sellPrice = (item) => { const b = IT[item.b]; return Math.max(1, Math.round(b.price * 0.25 * (D.isEquip(b) ? D.RAR[item.rar || 0].mul * (1 + (item.enh || 0) * 0.15) * (1 + (item.rar || 0) * 0.5) : 1))); };
  D.itemName = (item) => { const b = IT[item.b]; return b.name + (item.enh ? ' +' + item.enh : ''); };
  D.tierFor = (lv) => { let t = 1; for (let i = 1; i <= 7; i++) if (D.TIER_LV[i] <= lv + 2) t = i; return t; };

  // ------------------------------------------------------------ NPCs
  const look = (o) => Object.assign({ job: 'npc', weapon: null, style: 0 }, o);
  D.NPCS = {
    elder: { name: '도롱', title: '모닥마을 촌장', look: look({ skin: '#f7cba3', hair: '#e9e9f2', style: 5, eye: '#2b2136', acc: ['beard', 'glasses'], outfit: { top: '#8a6a4a', trim: '#f1e2b8', pants: '#5a4a3a', boots: '#4a3428', scarf: '#c8503f' } }),
      talk: ['모닥불이 꺼지지 않는 한, 이 마을은 안전하다네.', '젊은 등불지기를 보니 옛 생각이 나는구먼. 허허.', '일곱 등대가 모두 밝혀지는 날을 내 눈으로 볼 수 있을까…'] },
    sundry: { name: '미루', title: '잡화상', shop: 'sundry1', look: look({ skin: '#ffe2c6', hair: '#f291b3', style: 1, eye: '#2f62c9', acc: ['strawhat'], outfit: { top: '#e8a04a', trim: '#ffffff', pants: '#6a5a8a', boots: '#5b3a2e', scarf: '#fff3d0' } }),
      talk: ['물약은 넉넉히 챙겼어? 사냥터에선 물약이 생명줄이야!', '솜뭉치 솜털은 베개 속으로 최고라니까~', '필요한 게 있으면 언제든 들러!'] },
    smith: { name: '무쇠', title: '대장장이', shop: 'smith1', enhance: true, look: look({ skin: '#d9a475', hair: '#3b2a24', style: 0, eye: '#2b2136', acc: ['bandana', 'mustache'], scale: 1.12, outfit: { top: '#5a5a66', trim: '#f0c35a', pants: '#3a3a44', boots: '#2a2a30', scarf: '#8a5a3a' } }),
      talk: ['좋은 장비는 좋은 재료에서 나오지. 빛가루를 가져오면 강화해 주마.', '쇠는 두드릴수록 강해진다. 사람도 마찬가지야.', '무기가 낡았군. 새 걸 보고 가라.'] },
    trainer: { name: '새벽', title: '등불지기 교관', job: true, look: look({ skin: '#f7cba3', hair: '#5f81e2', style: 2, eye: '#2f62c9', job: 'blade', tier: 1, weapon: { kind: 'sword', tier: 4 } }),
      talk: ['등불지기의 길은 셋. 칼날, 별빛, 그리고 바람이지.', '레벨이 오르면 날 찾아와. 더 높은 불꽃을 보여 주지.', '기본기를 게을리하지 마. 스킬은 쓸수록 손에 익는 법이야.'] },
    keeper: { name: '반디 할멈', title: '등대지기', travel: true, look: look({ skin: '#f7cba3', hair: '#e9e9f2', style: 3, eye: '#7d45c9', acc: ['hood'], accColor: '#5a4a7a', outfit: { top: '#5a4a7a', trim: '#f7da6e', pants: '#3e3f78', boots: '#3a2f5c', scarf: '#f7da6e' } }),
      talk: ['등대의 불은 어스름을 밀어내는 유일한 빛이란다.', '어스름의 수호자를 쓰러뜨려야 등대에 불을 붙일 수 있지.', '초롱이가 널 잘 따르는구나. 좋은 등불지기가 되겠어.'] },
    kid: { name: '콩이', title: '마을 꼬마', look: look({ skin: '#ffe2c6', hair: '#c98c3d', style: 4, eye: '#23895a', scale: 0.8, outfit: { top: '#f2c84a', trim: '#ffffff', pants: '#5a7ab8', boots: '#7b5335', scarf: '#6fd0c0' } }),
      talk: ['나도 크면 등불지기가 될 거야!', '초롱이 만져 봐도 돼? 따뜻해?', '도토리 병정은 콕콕 찔러서 싫어…'] },
    chief: { name: '모래눈', title: '오아시스 족장', travel: true, look: look({ skin: '#a9754c', hair: '#3b2a24', style: 2, eye: '#a8501f', acc: ['turban'], outfit: { top: '#f1e6cf', trim: '#3fb6c9', pants: '#8a6a4a', boots: '#5b3a2e', scarf: '#3fb6c9' } }),
      talk: ['바람개비가 도는 한, 오아시스에는 물이 마르지 않는다네.', '협곡 너머 설원, 그 끝에 잿빛 성채가 있지.', '어스름의 군주… 그 이름만으로도 모래가 식는군.'] },
    merchant: { name: '대추', title: '대상 상인', shop: 'sundry2', look: look({ skin: '#d9a475', hair: '#6d4428', style: 4, eye: '#2b2136', acc: ['mustache'], outfit: { top: '#c8503f', trim: '#f3c95c', pants: '#f1e6cf', boots: '#7b5335', scarf: '#f3c95c' } }),
      talk: ['사막을 건너온 최고급 물약이라오!', '선인장 꽃차 한 잔이면 더위가 싹 가시지.', '싸게 사서 비싸게… 아니, 좋은 물건을 제값에 판다오.'] },
    smith2: { name: '불티', title: '대장장이', shop: 'smith2', enhance: true, look: look({ skin: '#a9754c', hair: '#e2573f', style: 5, eye: '#a8501f', acc: ['bandana'], accColor: '#3fb6c9', scale: 1.06, outfit: { top: '#7a4a3a', trim: '#f0c35a', pants: '#4a3a34', boots: '#2a2a30', scarf: '#f0c35a' } }),
      talk: ['수정이든 서리든, 내 화덕에선 다 녹는다고!', '강화는 +7부터가 진짜지. 운도 실력이야.', '무쇠 영감은 잘 지내나? 내 스승이거든.'] },
    trainer2: { name: '바람결', title: '등불지기 교관', job: true, look: look({ skin: '#ffe2c6', hair: '#45b6a0', style: 3, eye: '#23895a', job: 'gale', tier: 1, weapon: { kind: 'bow', tier: 5 } }),
      talk: ['바람은 준비된 자의 등을 밀어 주지.', '전직할 때가 되면 언제든 말해.', '새벽 선배가 널 칭찬하더라. 기대해도 되겠지?'] },
  };
  D.SHOPS = {
    sundry1: ['hp1', 'mp1', 'hp2', 'mp2', 'scroll'],
    smith1: ['sword2', 'staff2', 'bow2', 'helm1', 'armor1', 'gloves1', 'boots1', 'helm2', 'armor2', 'gloves2', 'boots2', 'charm2', 'sword3', 'staff3', 'bow3', 'helm3', 'armor3', 'gloves3', 'boots3', 'dust'],
    sundry2: ['hp2', 'mp2', 'hp3', 'mp3', 'scroll'],
    smith2: ['sword4', 'staff4', 'bow4', 'helm4', 'armor4', 'gloves4', 'boots4', 'charm4', 'sword5', 'staff5', 'bow5', 'helm5', 'armor5', 'gloves5', 'boots5', 'sword6', 'staff6', 'bow6', 'helm6', 'armor6', 'gloves6', 'boots6', 'charm6', 'dust'],
  };

  // ------------------------------------------------------------ quests
  // goals: {t:'kill', m, n} | {t:'item', it, n} | {t:'lv', n} | {t:'job', tier} | {t:'beacon', map} | {t:'talk', npc}
  // main: true → story chain (shown first).  req: {lv, q} prerequisites.
  const Q = (D.QUESTS = {});
  const q = (id, o) => { o.id = id; Q[id] = o; };
  q('m1', { main: true, name: '첫 등불', giver: 'elder', to: 'elder', goals: [{ t: 'kill', m: 'puff', n: 5 }],
    rew: { exp: 60, gold: 60, items: [['hp1', 5]] },
    offer: ['어서 오게, 새내기 등불지기. 자네의 등불 막대가 제법 잘 어울리는구먼.', '요즘 어스름 탓에 들판의 솜뭉치들이 사나워졌다네. 마을 동쪽 포탈로 나가 솜뭉치 다섯 마리만 혼내 주게.'],
    prog: ['동쪽 포탈(↑ 키를 꾹)로 나가면 이슬풀 들판일세. 솜뭉치 다섯 마리, 잊지 말게.'],
    done: ['허허, 벌써 해냈는가! 자네 등불이 한결 밝아졌구먼. 이건 내 작은 성의일세.'] });
  q('m2', { main: true, name: '잎새귀 소동', giver: 'elder', to: 'elder', req: { q: 'm1' }, goals: [{ t: 'kill', m: 'leafling', n: 6 }],
    rew: { exp: 160, gold: 100, items: [['helm1', 1], ['mp1', 5]] },
    offer: ['들판 깊은 곳에는 잎새귀라는 녀석들이 있다네. 큰 귀로 밭을 헤집어 놓아서 골치야.', '여섯 마리만 쫓아내 주겠나? 레벨이 5가 되면 교관 새벽을 꼭 찾아가 보고.'],
    prog: ['잎새귀는 이슬풀 들판 동쪽에 많다네.'],
    done: ['고맙네! 이 두건은 내가 젊을 적 쓰던 것일세. 잘 쓰게나.'] });
  q('m3', { main: true, name: '등불지기의 길', giver: 'trainer', to: 'trainer', req: { q: 'm1', lv: 5 }, goals: [{ t: 'job', tier: 1 }],
    rew: { exp: 100, gold: 400, items: [['hp1', 10], ['mp1', 10]] },
    offer: ['레벨 5, 이제 견습 딱지를 뗄 때가 됐군.', '등불지기의 길은 셋이야. 불꽃검사, 별빛술사, 바람사수. 나에게 말을 걸어 [전직]을 고르면 돼. 한번 고르면 되돌릴 수 없으니 신중하게.'],
    prog: ['나에게 다시 말을 걸고 [전직하기]를 골라.'],
    done: ['좋아, 눈빛이 달라졌군. 새 스킬은 K 키로 확인하고, 스킬 포인트로 강화해. 네 불꽃을 키워 봐.'] });
  q('m4', { main: true, name: '바람언덕의 등대', giver: 'keeper', to: 'keeper', req: { q: 'm3' }, goals: [{ t: 'kill', m: 'acorn', n: 8 }, { t: 'beacon', map: 'hills' }],
    rew: { exp: 500, gold: 400, items: [['charm2', 1], ['dust', 2]] },
    offer: ['전직을 마쳤구나. 이제 네게 진짜 일을 맡길 수 있겠어.', '들판 너머 바람언덕 꼭대기에 첫 번째 등대가 있단다. 어스름의 수호자 「몽실대왕」이 그 불을 삼켜 버렸지.', '도토리 병정들을 물리치며 올라가서, 등대에 불씨를 지피렴. 수호자가 나타날 테니 단단히 준비하고.'],
    prog: ['바람언덕 꼭대기의 등대 앞에서 ↑ 키를 누르면 불씨를 지필 수 있단다.'],
    done: ['저 멀리 언덕 위가 환해졌구나! 장하다. 이 부적이 널 지켜 줄 거야.'] });
  q('m5', { main: true, name: '속삭이는 숲', giver: 'keeper', to: 'keeper', req: { q: 'm4' }, goals: [{ t: 'kill', m: 'mossback', n: 10 }, { t: 'kill', m: 'hootling', n: 10 }],
    rew: { exp: 700, gold: 500, items: [['hp2', 8]] },
    offer: ['바람언덕 동쪽은 속삭임 숲이란다. 나무들이 어스름에 물들어 길을 잃게 만들지.', '이끼등껍질과 수풀부엉을 열 마리씩 물리쳐 숲길을 열어 다오.'],
    prog: ['이끼등껍질은 단단하니 스킬을 아끼지 말렴.'],
    done: ['숲의 속삭임이 조금 잦아들었구나. 하지만 깊은 곳엔 더 큰 것이 있단다.'] });
  q('m6', { main: true, name: '고목의 등대', giver: 'keeper', to: 'keeper', req: { q: 'm5' }, goals: [{ t: 'kill', m: 'bramble', n: 10 }, { t: 'beacon', map: 'forest2' }],
    rew: { exp: 1200, gold: 900, items: [['dust', 4], ['elixir', 1]] },
    offer: ['숲 깊은 곳, 고목의 품에 두 번째 등대가 있단다.', '수호자는 「뿔갑대장 톨록」. 돌진을 조심하고, 발을 구를 땐 뛰어올라 충격파를 피하렴.'],
    prog: ['톨록이 뒷걸음질 치면 곧 돌진한다는 신호란다.'],
    done: ['두 번째 불빛이 돌아왔어! 숲이 다시 숨을 쉬는구나.'] });
  q('m7', { main: true, name: '늪의 불빛', giver: 'keeper', to: 'keeper', req: { q: 'm6' }, goals: [{ t: 'kill', m: 'toad', n: 12 }, { t: 'kill', m: 'mudling', n: 12 }, { t: 'beacon', map: 'marsh' }],
    rew: { exp: 2400, gold: 1500, items: [['dust', 5], ['hp2', 10], ['mp2', 10]] },
    offer: ['고목의 품에서 아래로 내려가면 반딧불 늪이 나온단다. 세 번째 등대는 그 늪 끝에 있지.', '「연꽃마녀 로타」는 물방울과 독비를 부린단다. 한자리에 오래 서 있지 말렴.'],
    prog: ['늪의 두꺼비는 방울을 뱉으니 거리를 재며 싸우렴.'],
    done: ['세 등대가 밝혀졌구나. 레벨 20이 되었다면 교관을 찾아가 보렴. 더 높은 불꽃이 기다린단다.'] });
  q('m8', { main: true, name: '더 높은 불꽃', giver: 'trainer', to: 'trainer', req: { q: 'm3', lv: 20 }, goals: [{ t: 'job', tier: 2 }],
    rew: { exp: 1500, gold: 1500, items: [['elixir', 2]] },
    offer: ['레벨 20. 등대 셋을 밝힌 등불지기라… 2차 전직을 받을 자격이 충분하군.', '나에게 [전직하기]를 말하면 새로운 힘을 열어 주지.'],
    prog: ['[전직하기]를 골라. 망설일 것 없어.'],
    done: ['훌륭해. 새 스킬을 단축키에 올리는 것, 잊지 마.'] });
  q('m9', { main: true, name: '메아리 속으로', giver: 'keeper', to: 'keeper', req: { q: 'm7' }, goals: [{ t: 'kill', m: 'crybat', n: 14 }, { t: 'kill', m: 'orecrab', n: 14 }, { t: 'kill', m: 'shade', n: 10 }, { t: 'beacon', map: 'cave2' }],
    rew: { exp: 4500, gold: 3000, items: [['dust', 6], ['elixir', 2]] },
    offer: ['고목의 품 동쪽 끝에 메아리 동굴 입구가 있단다. 빛이 닿지 않는 곳이니 초롱이 곁을 떠나지 말렴.', '동굴 가장 깊은 수정 심층에 네 번째 등대와 「수정거인 크리스타」가 있단다.'],
    prog: ['크리스타의 가슴이 빛나면 광선이 나온단다. 뛰어서 피하렴.'],
    done: ['네 번째 등대까지! 동굴 너머에는 사막의 오아시스가 있단다. 그곳의 족장 모래눈을 찾아가렴.'] });
  q('m10', { main: true, name: '사막의 바람개비', giver: 'keeper', to: 'chief', req: { q: 'm9' }, goals: [{ t: 'talk', npc: 'chief' }],
    rew: { exp: 1500, gold: 1500, items: [['hp3', 5]] },
    offer: ['이 편지를 바람개비 오아시스의 족장 모래눈에게 전해 다오. 수정 심층 동쪽 끝이 오아시스로 통한단다.'],
    prog: ['수정 심층의 동쪽 포탈이 오아시스로 이어진단다.'],
    done: ['반디 할멈의 편지로군. …그래, 자네가 그 등불지기인가. 오아시스에 온 것을 환영하네.'] });
  q('m11', { main: true, name: '붉은 모래의 폭군', giver: 'chief', to: 'chief', req: { q: 'm10' }, goals: [{ t: 'kill', m: 'skink', n: 15 }, { t: 'kill', m: 'cactus', n: 15 }, { t: 'kill', m: 'dustdevil', n: 8 }, { t: 'beacon', map: 'canyon' }],
    rew: { exp: 7000, gold: 6000, items: [['dust', 8], ['elixir', 2]] },
    offer: ['오아시스 동쪽 붉은모래 협곡에 다섯 번째 등대가 있네.', '수호자 「전갈왕 스카브」는 모래 속으로 숨었다가 발밑에서 솟구치지. 땅이 흔들리면 바로 자리를 뜨게.'],
    prog: ['스카브의 꼬리가 번쩍이면 독침이 날아온다네.'],
    done: ['협곡의 모래바람이 걷혔군! 자네 덕에 대상들이 다시 길을 나설 수 있겠어.'] });
  q('m12', { main: true, name: '궁극의 빛', giver: 'trainer2', to: 'trainer2', req: { q: 'm8', lv: 35 }, goals: [{ t: 'job', tier: 3 }],
    rew: { exp: 4000, gold: 5000, items: [['elixir', 3]] },
    offer: ['레벨 35. 드디어 왔구나. 등불지기의 마지막 단계, 3차 전직이야.', '[전직하기]를 고르면 궁극의 스킬을 전해 줄게.'],
    prog: ['[전직하기]를 골라 줘.'],
    done: ['이제 넌 누구보다 밝은 불꽃이야. 그 힘으로 어스름을 끝내 줘.'] });
  q('m13', { main: true, name: '서리송곳의 군주', giver: 'chief', to: 'chief', req: { q: 'm11' }, goals: [{ t: 'kill', m: 'snowimp', n: 10 }, { t: 'kill', m: 'ram', n: 15 }, { t: 'kill', m: 'wraith', n: 15 }, { t: 'beacon', map: 'snow' }],
    rew: { exp: 10000, gold: 10000, items: [['dust', 10], ['elixir', 3]] },
    offer: ['협곡을 넘으면 서리송곳 설원일세. 여섯 번째 등대가 눈보라 속에 잠들어 있지.', '「설원군주 보르칸」의 숨결에 닿으면 몸이 얼어붙네. 등 뒤로 돌아가 싸우게.'],
    prog: ['보르칸이 가슴을 부풀리면 숨결이 나온다네.'],
    done: ['여섯 등대가 모두 밝혀졌군. 이제 남은 건 하나… 잿빛 성채의 큰등불뿐일세.'] });
  q('m14', { main: true, name: '어스름의 군주', giver: 'chief', to: 'chief', req: { q: 'm13' }, goals: [{ t: 'kill', m: 'gsoldier', n: 18 }, { t: 'kill', m: 'ghexer', n: 14 }, { t: 'kill', m: 'gargoyle', n: 10 }, { t: 'beacon', map: 'throne' }],
    rew: { exp: 16000, gold: 30000, items: [['elixir', 5]] },
    offer: ['설원 끝 잿빛 성채, 그 옥좌에 어스름의 군주 「녹스」가 있네.', '그는 한때 가장 위대한 등불지기였다고 하지. 큰등불을 지키다 어스름에 삼켜졌다네.', '녹스를 쓰러뜨리고 큰등불에 불을 붙여 주게. 노을 대륙의 운명이 자네 등불에 달렸네.'],
    prog: ['성채 꼭대기의 문이 옥좌로 통한다네. 물약을 넉넉히 챙기게.'],
    done: ['해냈군…! 온 대륙의 등대가 빛나고 있어. 자네야말로 진정한 등불지기일세. 고맙네, 정말 고맙네.'] });
  // side quests
  q('s1', { name: '폭신한 베개', giver: 'sundry', to: 'sundry', goals: [{ t: 'item', it: 'm_puff', n: 8 }],
    rew: { exp: 60, gold: 150, items: [['hp1', 8]] },
    offer: ['있잖아, 솜뭉치 솜털로 베개를 만들면 꿀잠을 잔대! 솜털 뭉치 8개만 구해다 줄래?'],
    prog: ['솜털 뭉치 8개! 솜뭉치를 잡으면 가끔 떨어뜨려.'],
    done: ['우와, 폭신폭신해! 고마워, 이건 서비스~'] });
  q('s2', { name: '콩이의 구슬치기', giver: 'kid', to: 'kid', req: { lv: 4 }, goals: [{ t: 'item', it: 'm_acorn', n: 6 }],
    rew: { exp: 200, gold: 120, items: [['charm1', 1]] },
    offer: ['언니오빠 등불지기지? 나 구슬치기 할 도토리가 필요해! 단단한 도토리 6개만… 응?'],
    prog: ['도토리 병정이 단단한 도토리를 갖고 있대!'],
    done: ['와아! 최고야! 이건 내 보물 1호인데… 특별히 줄게!'] });
  q('s3', { name: '무쇠의 부탁', giver: 'smith', to: 'smith', req: { lv: 7 }, goals: [{ t: 'item', it: 'm_mossback', n: 8 }],
    rew: { exp: 500, gold: 300, items: [['dust', 3]] },
    offer: ['이끼등껍질의 껍질은 숫돌로 그만이지. 조각 8개만 구해 와라. 대신 빛가루를 주마. 그걸로 장비를 강화할 수 있어.'],
    prog: ['이끼 등껍질 조각 8개다. 속삭임 숲에 가면 있을 거다.'],
    done: ['쓸 만하군. 약속한 빛가루다. 강화하고 싶으면 나에게 말해라.'] });
  q('s4', { name: '반딧불 등', giver: 'sundry', to: 'sundry', req: { lv: 13 }, goals: [{ t: 'item', it: 'm_glowmoth', n: 10 }],
    rew: { exp: 1500, gold: 800, items: [['mp2', 10]] },
    offer: ['가게에 걸어 둘 예쁜 등이 갖고 싶어. 반딧불 가루 10개면 만들 수 있대!'],
    prog: ['반디나방은 반딧불 늪에 날아다닌대.'],
    done: ['반짝반짝! 밤에도 장사할 수 있겠다. 고마워!'] });
  q('s5', { name: '수정 세공', giver: 'smith2', to: 'smith2', req: { lv: 22 }, goals: [{ t: 'item', it: 'm_orecrab', n: 12 }],
    rew: { exp: 3500, gold: 2500, items: [['dust', 6]] },
    offer: ['광석게 등딱지에 붙은 반짝 광석! 그거 12개만 있으면 끝내주는 걸 만들 수 있는데 말이지.'],
    prog: ['반짝 광석 12개. 메아리 동굴의 광석게를 노려.'],
    done: ['이거야! 역시 등불지기는 다르네. 빛가루 넉넉히 챙겨 가!'] });
  q('s6', { name: '선인장 꽃차', giver: 'merchant', to: 'merchant', req: { lv: 28 }, goals: [{ t: 'item', it: 'm_cactus', n: 10 }],
    rew: { exp: 5000, gold: 4000, items: [['hp3', 10], ['mp3', 5]] },
    offer: ['선인장 권투사 머리에 핀 꽃, 그게 차로 우리면 일품이라오. 10송이만 부탁하오!'],
    prog: ['선인장 꽃 10송이요. 주먹을 조심하시오!'],
    done: ['향이 기가 막히는군! 약속한 물약이오.'] });
  q('s7', { name: '얼음 뿔 장식', giver: 'smith2', to: 'smith2', req: { lv: 35 }, goals: [{ t: 'item', it: 'm_ram', n: 12 }],
    rew: { exp: 8000, gold: 8000, items: [['dust', 10]] },
    offer: ['얼음뿔 산양의 뿔은 녹지 않는 얼음이야. 조각 12개만 가져오면 빛가루를 왕창 줄게!'],
    prog: ['얼음 뿔 조각 12개. 설원의 산양이 돌진할 땐 뛰어넘어!'],
    done: ['캬, 차갑다! 좋아, 약속대로 빛가루야.'] });

  // ------------------------------------------------------------ beacons (one per region; boss guards it)
  D.BEACONS = {
    hills: { boss: 'bosspuff', name: '바람언덕 등대' },
    forest2: { boss: 'stag', name: '고목의 등대' },
    marsh: { boss: 'lotus', name: '늪의 등대' },
    cave2: { boss: 'golem', name: '수정 등대' },
    canyon: { boss: 'scorpion', name: '협곡의 등대' },
    snow: { boss: 'yeti', name: '설원의 등대' },
    throne: { boss: 'nox', name: '큰등불' },
  };
  // guardians' attacks: [name, how to get out of it]. When the hero falls to a guardian, the defeat window names the attack that
  // hurt the most and how to avoid it (game.js Game.bossTip). Keys = the boss pattern names in monsters.js (BOSS)
  D.BOSS_ATK = {
    bosspuff: {
      hop: ['점프 내려찍기', '높이 뛰면 내려앉을 빨간 곳을 벗어나고, 퍼지는 충격파는 점프로 넘어요'],
      roll: ['구르기', '빨간 줄이 깔리면 굴러와요 — 2단 점프로 넘고, 벽에 튕겨 돌아올 때도 조심!'],
      puff: ['솜털 폭탄', '솜털 씨앗이 흩뿌려지면 떨어지는 자리 사이로 옆걸음질해요'],
    },
    stag: {
      charge: ['돌진', '톨록이 뒷걸음질 치면 돌진! 빨간 줄 밖으로 비켜서거나 2단 점프로 넘어요'],
      toss: ['뿔 올려치기', '머리를 숙이면 뿔 올려치기 — 앞쪽 빨간 곳에서 한 발 물러나요'],
      stomp: ['발구르기', '발을 구르면 충격파가 바닥을 타고 와요 — 화살표 줄은 점프로 넘어요'],
    },
    lotus: {
      bubbles: ['물방울', '물방울은 느려요 — 위아래로 움직이며 사이로 빠져나가요'],
      rain: ['독비', '독비는 내 주변에 쏟아져요 — 한자리에 서 있지 말고 계속 움직여요'],
      blink: ['순간이동', '꽃잎이 흩날리면 자리를 옮겨요 — 나타난 곳을 보고 다시 거리를 재요'],
      summon: ['반디나방 부르기', '반디나방이 나오면 먼저 정리하고 로타를 쳐요'],
    },
    golem: {
      slam: ['내려찍기', '팔을 들면 앞쪽 빨간 곳을 벗어나고, 충격파는 점프로 넘어요'],
      spikes: ['수정 가시', '발밑이 빨개지면 가시가 연달아 솟아요 — 멈추지 말고 한쪽으로 쭉 달려요'],
      laser: ['광선', '점선이 보이면 곧 광선이 와요 — 그 줄에서 벗어나거나 점프해요'],
      rockfall: ['낙석', '바닥의 빨간 동그라미에 돌이 떨어져요 — 동그라미 밖으로 피해요'],
    },
    scorpion: {
      stab: ['독침 찌르기', '꼬리가 번쩍이면 독침 — 빨간 곳 밖으로 물러나고, 바로 앞이면 점프!'],
      sweep: ['집게 휩쓸기', '집게 앞이 빨개지면 뒤로 물러나요'],
      spit: ['독 뱉기', '독덩이가 떨어질 빨간 자리 사이로 피해요'],
      burrow: ['땅속 기습', '땅이 흔들리면 서 있던 자리에서 솟구쳐요 — 바로 자리를 떠요'],
    },
    yeti: {
      pound: ['내려치기', '주먹을 들면 앞쪽 빨간 곳을 벗어나고, 충격파는 점프로 넘어요'],
      throw: ['얼음 바위', '바위가 떨어질 빨간 자리를 피해요 — 화나면 두 개를 던져요'],
      breath: ['서리 숨결', '가슴을 부풀리면 숨결 — 보르칸의 등 뒤로 돌아가요'],
      leap: ['도약', '뛰어오르면 내려앉을 곳을 벗어나고, 충격파는 점프로 넘어요'],
    },
    nox: {
      slash: ['어스름 베기', '칼을 들면 앞쪽 베기와 초승달 파동 — 파동은 점프로 넘어요'],
      orbs: ['어둠 구슬', '구슬이 나를 노리고 날아와요 — 날아오는 순간 옆으로 크게 움직여요'],
      warp: ['순간이동 강타', '녹스가 사라지면 내 옆에 내려찍어요 — 빨간 곳에서 바로 벗어나요'],
      meteor: ['유성', '바닥의 빨간 동그라미에 유성이 떨어져요 — 멈추지 말고 계속 움직여요'],
      summon: ['병사 부르기', '병사가 나오면 먼저 정리하고 녹스를 쳐요'],
    },
  };
  D.BOSS_ATK_ANY = {
    touch: ['몸통 박치기', '공격을 마친 틈에만 붙어서 치고, 다시 한 발 물러나요'],
    minion: ['졸개', '불려 나온 졸개를 먼저 정리하고 수호자를 쳐요'],
  };
  D.bossAtk = (boss, k) => (D.BOSS_ATK[boss] && D.BOSS_ATK[boss][k]) || D.BOSS_ATK_ANY[k] || null;
  // '뿔갑대장 톨록' → '톨록' (the name the defeat window uses: "톨록 체력 38% 남기고 쓰러짐")
  D.shortName = (name) => String(name).split(' ').pop();

  // wisp companion hints (shown once each). {action} → the key currently bound to it, {skill} → first filled skill slot
  D.HINTS = {
    start: '안녕! 난 초롱이야. {left} {right} 로 걷고, {jump} 키로 뛰어 봐!',
    keys: '조작 안내! 점프 {jump}, 공격 {attack}, 스킬은 Q W E R · A S D F 줄이야. 메뉴(Esc) › 설정에서 키를 바꿀 수 있어.',
    npc: '느낌표(!)가 뜬 사람 앞에서 ↑ 키를 누르면 말을 걸 수 있어.',
    portal: '빛나는 포탈 위에서 ↑ 키를 꾹 누르고 있으면 빛이 차올라서 다른 곳으로 갈 수 있어!',
    portalHold: '포탈은 ↑ 키를 꾹 누르고 있어야 넘어가! 살짝 누르면 안 넘어가니까 안심해.',
    attack: '{attack} 키로 공격! 누르고 있으면 계속 휘둘러. 몬스터를 잡으면 경험치를 얻어.',
    skill: '{skill} 키로 스킬을 쓸 수 있어. MP가 필요해! 스킬 창(K)에서 끌어다 놓으면 단축키를 바꿀 수 있어.',
    loot: '떨어진 물건은 가까이 가면 내가 주워 줄게.',
    potion: '아프면 {hp} 키로 HP 물약, {mp} 키로 MP 물약! 물약 칸을 클릭하면 쓸 물약을 고를 수 있어.',
    levelup: '레벨 업! C 키를 눌러 능력치를 올려 봐. 전투력이 쑥쑥 오를 거야!',
    job: '레벨 5야! 마을의 교관 새벽에게 가서 전직하자! 전직하면 능력치를 새로 분배할 수 있어.',
    job2: '레벨 20! 교관에게 가면 2차 전직을 할 수 있어!',
    job3: '레벨 35! 드디어 3차 전직이야. 교관을 찾아가자!',
    sp: 'K 키로 스킬 창을 열어 스킬 포인트를 써 봐!',
    equip: '새 장비다! 초록 ▲ 표시가 있으면 전투력이 오르는 장비야. 가방(I)에서 더블클릭해서 입어 봐.',
    beacon: '등대야! 앞에서 ↑ 키를 누르면 불씨를 지필 수 있어. 수호자가 나올 테니 조심해!',
    tele: '바닥이 빨개지면 곧 센 공격이 와! 빨간 곳에서 얼른 빠져나와. 화살표 줄은 충격파니까 점프로 넘으면 돼!',
    travel: '불 밝힌 등대 앞에서 ↑ 키를 누르면 다른 등대나 마을로 순간이동할 수 있어! 마을에선 반디 할멈이 보내 줄 거야.',
    freeReset: '능력치를 다시 나누고 싶으면 C 창의 [무료 초기화]를 눌러 봐. 한 번은 공짜야!',
    reset: '전직 기념으로 능력치를 전부 돌려받았어! 새 직업의 주 능력치(★)에 맞춰 다시 올려 보자.',
    mac: 'Mac에선 Ctrl + 방향키가 데스크탑 전환 단축키라 잘 안 먹힐 수 있어. 그럴 땐 Z 키로 공격해!',
    dark: '여긴 너무 어두워… 내 곁에 꼭 붙어 있어!',
    djump: '공중에서 {jump} 키를 한 번 더 누르면 2단 점프!',
    drop: '{down} + {jump} 로 발판 아래로 내려갈 수 있어.',
    dead: '괜찮아? 물약을 넉넉히 챙기고, 장비도 강화해 보자. 물약 칸을 클릭하면 자동 물약도 켤 수 있어!',
  };
  // the same hints on the touch controls (touch.js) — the ones that name a key. {skill} → the first filled skill button's number
  D.HINTS_T = {
    start: '안녕! 난 초롱이야. 왼쪽 아래 조이스틱으로 걷고, 오른쪽 아래 점프 버튼으로 뛰어 봐!',
    keys: '조작 안내! 왼쪽 조이스틱으로 이동, 오른쪽 아래 큰 버튼이 공격 · 점프, 그 위가 스킬 · 물약 버튼이야.',
    npc: '느낌표(!)가 뜬 사람 앞에서 조이스틱을 위로 밀면 말을 걸 수 있어.',
    portal: '빛나는 포탈 위에서 조이스틱을 위로 꾹 밀고 있으면 빛이 차올라서 다른 곳으로 갈 수 있어!',
    portalHold: '포탈은 조이스틱을 위로 꾹 밀고 있어야 넘어가! 살짝 밀면 안 넘어가니까 안심해.',
    attack: '오른쪽 아래 큰 공격 버튼을 눌러 봐! 누르고 있으면 계속 휘둘러. 몬스터를 잡으면 경험치를 얻어.',
    skill: '공격 버튼 위의 {skill}번 버튼이 스킬이야. MP가 필요해! 스킬 창에서 [버튼]을 누르면 자리를 바꿀 수 있어.',
    potion: '아프면 빨간 물약 버튼, MP가 모자라면 파란 물약 버튼! 물약 버튼을 꾹 누르면 쓸 물약을 고를 수 있어.',
    levelup: '레벨 업! 위쪽의 캐릭터 버튼을 눌러 능력치를 올려 봐. 전투력이 쑥쑥 오를 거야!',
    sp: '위쪽의 스킬 버튼을 눌러 스킬 포인트를 써 봐!',
    equip: '새 장비다! 초록 ▲ 표시가 있으면 전투력이 오르는 장비야. 가방에서 눌러서 입어 봐.',
    beacon: '등대야! 앞에서 조이스틱을 위로 밀면 불씨를 지필 수 있어. 수호자가 나올 테니 조심해!',
    travel: '불 밝힌 등대 앞에서 조이스틱을 위로 밀면 다른 등대나 마을로 순간이동할 수 있어! 마을에선 반디 할멈이 보내 줄 거야.',
    freeReset: '능력치를 다시 나누고 싶으면 캐릭터 창의 [무료 초기화]를 눌러 봐. 한 번은 공짜야!',
    djump: '공중에서 점프 버튼을 한 번 더 누르면 2단 점프!',
    drop: '조이스틱을 아래로 민 채 점프 버튼을 누르면 발판 아래로 내려갈 수 있어.',
    dead: '괜찮아? 물약을 넉넉히 챙기고, 장비도 강화해 보자. 물약 버튼을 꾹 누르면 자동 물약도 켤 수 있어!',
  };
})();
