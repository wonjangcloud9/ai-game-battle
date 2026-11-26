/* 어스름 전선 — data: 영웅 8명(스킬·패시브), 아이템, 미니언, 중립 몬스터
   스킬 코드는 sim.js 의 Game(G) API 만 쓴다:
     G.damage / heal / addBuff / slow / stun / root / freeze / knockup / knockback / pullTo / toss
     G.dash / blink / skillshot / zone / strike / after / fx / enemiesIn / alliesIn / enemiesInLine / enemiesInCone
   수치 규칙: val(h, 기본, 레벨당, 공격력계수, 주문력계수, 최대체력계수) */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U;

  const val = TW.val = (h, base, per, adR, apR, hpR) =>
    Math.round(base + per * (h.level - 1) + (adR || 0) * h.ad + (apR || 0) * h.ap + (hpR || 0) * h.maxHp);
  const SK = [{ skill: 0 }, { skill: 1 }, { skill: 2 }, { skill: 3 }];   // 피해 출처 표시(스킬 슬롯)
  const PAS = { skill: 4 };                                               // 패시브

  /* ---------- 아이템: 17종 × 3단계 (살 때마다 한 단계씩 오른다 · 팔면 한 단계 내려가고 그 단계 값의 70%를 돌려받는다) ----------
     stat · v = 으뜸 수치(단계별) · x = 딸린 수치 { ad · def · hp · ap · asPct } · pas · ptext = 3단계에 열리는 효과
     cat = 상점의 갈래 (첫 번째가 으뜸 갈래): atk 공격 · mag 주문 · def 방어 · hp 체력 · spd 속도 · spc 특수
     19차: 뒤의 여덟 가지(무쇠 메 ~ 도깨비 방망이)가 새로 생겼다. 봇의 추천 순서(build)는 예전 아홉 가지 그대로 — 새 영웅만 새 아이템을 쓴다 */
  TW.ITEM_COST = [450, 800, 1250];
  TW.SELL_BACK = 0.7;
  TW.Items = {
    blade:   { name: '초승 낫',     icon: 'blade',   color: '#ffb36b', cat: ['atk'],        stat: 'ad',     v: [14, 32, 55],       pas: 'pierce',    ptext: '기본 공격과 스킬이 방어력의 30%를 무시합니다.' },
    feather: { name: '바람개비',    icon: 'feather', color: '#a8f0c8', cat: ['atk', 'spd'], stat: 'asPct',  v: [0.15, 0.32, 0.52], pas: 'chain',     ptext: '네 번째 기본 공격마다 번개가 적 셋에게 튑니다.' },
    orb:     { name: '별빛 호롱',   icon: 'orb',     color: '#c9a2ff', cat: ['mag'],        stat: 'ap',     v: [28, 60, 100],      pas: 'echo',      ptext: '스킬 피해가 12% 늘어납니다.' },
    heart:   { name: '든든 경단',   icon: 'heart',   color: '#ff8fa3', cat: ['hp'],         stat: 'hp',     v: [180, 420, 760],    pas: 'regen',     ptext: '5초 동안 맞지 않으면 초당 최대 체력의 2%를 회복합니다.' },
    bark:    { name: '거북 등딱지', icon: 'bark',    color: '#9fe0a0', cat: ['def'],        stat: 'def',    v: [18, 40, 68],       pas: 'thorns',    ptext: '기본 공격을 맞으면 20 + 방어력의 20%를 되돌려 줍니다.' },
    fang:    { name: '핏빛 호리병', icon: 'fang',    color: '#ff6b81', cat: ['atk'],        stat: 'ls',     v: [0.07, 0.13, 0.2],  pas: 'feast',     ptext: '처치에 관여하면 잃은 체력의 20%를 회복합니다.', x: { ad: [8, 16, 26] } },
    boots:   { name: '날랜 짚신',   icon: 'boots',   color: '#7fd0ff', cat: ['spd'],        stat: 'ms',     v: [0.5, 0.9, 1.3],    pas: 'swift',     ptext: '5초 동안 싸우지 않으면 이동 속도가 12% 빨라집니다.' },
    glass:   { name: '재촉 방울',   icon: 'glass',   color: '#ffe680', cat: ['mag', 'spd'], stat: 'cdr',    v: [0.1, 0.2, 0.3],    pas: 'tumble',    ptext: '구르기 재사용 대기시간이 35% 줄어듭니다.' },
    charm:   { name: '등불 부적',   icon: 'charm',   color: '#ffd9a0', cat: ['def', 'hp'],  stat: 'hp',     v: [100, 220, 360],    pas: 'laststand', ptext: '체력이 30% 아래로 떨어지면 최대 체력의 20%만큼 보호막을 얻습니다. (60초마다)', x: { def: [8, 16, 26] } },
    // ── 19차에 새로 생긴 여덟 가지
    hammer:  { name: '무쇠 메',     icon: 'hammer',  color: '#e8a078', cat: ['atk', 'hp'],  stat: 'ad',     v: [10, 22, 38],       pas: 'cleave',    ptext: '기본 공격이 대상 둘레의 다른 적에게도 30%의 피해를 줍니다.', x: { hp: [90, 200, 340] }, fresh: true },
    bolt:    { name: '벼락 살',     icon: 'bolt',    color: '#ffe36a', cat: ['atk', 'spd'], stat: 'asPct',  v: [0.1, 0.22, 0.36],  pas: 'execute',   ptext: '체력이 35% 아래인 적에게 주는 기본 공격 피해가 25% 늘어납니다.', x: { ad: [6, 12, 20] }, fresh: true },
    fan:     { name: '서릿발 부채', icon: 'fan',     color: '#9fdcff', cat: ['mag', 'hp'],  stat: 'ap',     v: [20, 45, 75],       pas: 'chill',     ptext: '스킬 피해를 입은 적이 1초 동안 20% 느려집니다.', x: { hp: [80, 170, 280] }, fresh: true },
    flint:   { name: '부싯돌 가락지', icon: 'flint', color: '#ffb46a', cat: ['mag', 'atk'], stat: 'ap',     v: [16, 34, 58],       pas: 'spark',     ptext: '스킬을 쓰면 다음 기본 공격이 40 + 주문력의 35%만큼 더 아픕니다. (2초마다)', x: { ad: [6, 13, 22] }, fresh: true },
    halo:    { name: '달무리 갑옷', icon: 'halo',    color: '#b8c6ff', cat: ['def', 'hp'],  stat: 'def',    v: [12, 26, 44],       pas: 'ward',      ptext: '스킬로 받는 피해가 15% 줄어듭니다.', x: { hp: [90, 200, 340] }, fresh: true },
    brazier: { name: '약쑥 화로',   icon: 'brazier', color: '#9fe8b0', cat: ['hp', 'spc'],  stat: 'hp',     v: [120, 270, 460],    pas: 'balm',      ptext: '나와 가까운(9칸) 아군 영웅이 1초마다 최대 체력의 0.6%를 회복합니다.', fresh: true },
    rein:    { name: '바람 고삐',   icon: 'rein',    color: '#8fe8f0', cat: ['spd', 'atk'], stat: 'ms',     v: [0.3, 0.55, 0.8],   pas: 'gale',      ptext: '기본 공격을 맞힐 때마다 2초 동안 이동 속도 +4% (다섯 번까지 쌓임).', x: { asPct: [0.08, 0.16, 0.26] }, fresh: true },
    club:    { name: '도깨비 방망이', icon: 'club',  color: '#ffd84a', cat: ['spc'],        stat: 'gps',    v: [1, 2, 3],          pas: 'lucky',     ptext: '미니언 막타 골드 +30% · 영웅 처치·도움 골드 +20%.', fresh: true },
  };
  TW.ItemOrder = ['blade', 'feather', 'fang', 'hammer', 'bolt', 'orb', 'glass', 'fan', 'flint', 'heart', 'brazier', 'bark', 'charm', 'halo', 'boots', 'rein', 'club'];
  TW.ITEM_CATS = [['all', '전체'], ['atk', '공격'], ['mag', '주문'], ['def', '방어'], ['hp', '체력'], ['spd', '속도'], ['spc', '특수']];
  const STAT_NAME = TW.STAT_NAME = { ad: '공격력', asPct: '공격 속도', ap: '주문력', hp: '체력', def: '방어력', ls: '흡혈', ms: '이동 속도', cdr: '재사용 감소', gps: '1초마다 골드' };
  const PCT = { asPct: 1, ls: 1, cdr: 1 };
  const statStr = (k, v) => STAT_NAME[k] + ' +' + (PCT[k] ? Math.round(v * 100) + '%' : v);
  for (const id of TW.ItemOrder) {
    const it = TW.Items[id]; it.id = id;
    it.descAt = (tier) => {       // tier: 1..3
      const p = [statStr(it.stat, it.v[tier - 1])];
      if (it.x) for (const k in it.x) p.push(statStr(k, it.x[k][tier - 1]));
      return p.join(' · ');
    };
  }
  /* 다음에 살 것: 추천 순서(build)에서 아직 덜 올린 첫 항목. { id, tier(살 단계 1..3), cost } 또는 null */
  TW.nextBuy = function (h) {
    const cnt = {};
    for (const id of h.hd.build) {
      cnt[id] = (cnt[id] || 0) + 1;
      if ((h.items[id] || 0) < cnt[id]) return { id, tier: cnt[id], cost: TW.ITEM_COST[cnt[id] - 1] };
    }
    for (const id of TW.ItemOrder) { const t = h.items[id] || 0; if (t < 3) return { id, tier: t + 1, cost: TW.ITEM_COST[t] }; }
    return null;
  };
  /* 추천 3단계: 앞으로 살 것 n개 (맨 앞 = 지금 살 것) [{ id, tier, cost }] */
  TW.buildPlan = function (h, n) {
    const fake = { hd: h.hd, items: Object.assign({}, h.items) }, out = [];
    for (let k = 0; k < (n || 3); k++) { const nb = TW.nextBuy(fake); if (!nb) break; out.push(nb); fake.items[nb.id] = nb.tier; }
    return out;
  };
  /* 지금 골드로 추천 순서대로 한 번에 살 수 있는 것 → { list, cost } (순서를 건너뛰지 않는다) */
  TW.affordPlan = function (h) {
    const fake = { hd: h.hd, items: Object.assign({}, h.items) }, list = []; let gold = h.gold, cost = 0;
    for (let k = 0; k < 60; k++) { const nb = TW.nextBuy(fake); if (!nb || nb.cost > gold) break; list.push(nb); gold -= nb.cost; cost += nb.cost; fake.items[nb.id] = nb.tier; }
    return { list, cost };
  };
  /* 영웅별 추천의 까닭 (상점 맨 위 한 줄) */
  TW.BUILD_WHY = {
    moru: '앞에서 버티며 싸움을 여는 선봉 — 체력·방어부터',
    hanui: '파고들어 오래 싸우는 창술사 — 공격력·흡혈부터',
    geumeum: '숨었다 덮치는 사냥꾼 — 공격력으로 한 번에',
    bulti: '멀리서 쏘는 포수 — 공격력·공격 속도로 평타를 키운다',
    chorong: '스킬로 싸우는 술사 — 주문력·재사용 감소부터',
    seori: '얼려 묶는 무녀 — 주문력·재사용 감소부터',
    narae: '아군을 돕는 나비 — 재사용 감소로 스킬을 자주',
    agwi: '끌어오는 낚시꾼 — 체력과 재사용 감소로 자주 낚는다',
  };
  /* 아이템이 주는 힘 (잠깐 걸린 버프는 뺀다). items 를 주면 그 아이템 구성으로 셈 — 산 뒤 '얼마나 세졌나'를 숫자로 보여 주려고 */
  TW.powerOf = function (h, items) {
    const b = h.hd.base, L = h.level - 1; items = items || h.items;
    let hp = b.hp + b.hpG * L, ad = b.ad + b.adG * L, ap = 0, def = b.def + b.defG * L, asPct = b.asG * L / b.as, ms = b.ms, cdr = 0, ls = 0, gps = 0;
    for (const id in items) {
      const tier = items[id]; if (!tier) continue;
      const it = TW.Items[id], v = it.v[tier - 1];
      if (it.stat === 'ad') ad += v; else if (it.stat === 'asPct') asPct += v; else if (it.stat === 'ap') ap += v; else if (it.stat === 'hp') hp += v;
      else if (it.stat === 'def') def += v; else if (it.stat === 'ls') ls += v; else if (it.stat === 'ms') ms += v; else if (it.stat === 'cdr') cdr += v; else if (it.stat === 'gps') gps += v;
      const x = it.x;
      if (x) { if (x.ad) ad += x.ad[tier - 1]; if (x.def) def += x.def[tier - 1]; if (x.hp) hp += x.hp[tier - 1]; if (x.ap) ap += x.ap[tier - 1]; if (x.asPct) asPct += x.asPct[tier - 1]; }
    }
    // 별조각(별비 난전)으로 오른 수치도 같은 셈으로 (산 뒤 '얼마나 세졌나'가 화면의 실제 수치와 맞게)
    const bs = h.boons && h.boons.length && TW.boonSum ? TW.boonSum(h) : null;
    if (bs) { hp = (hp + bs.hp) * (1 + bs.hpPct); ad = (ad + bs.ad) * (1 + bs.adPct); ap += bs.ap; def += bs.def; asPct += bs.asPct; ms *= 1 + bs.msPct; ls += bs.ls; gps += bs.gps; }
    const as = Math.min(2.6, b.as * (1 + asPct));
    return { hp, ad, ap, def, as, ms, cdr: Math.min(0.4, cdr), ls, gps, dps: ad * as, ehp: hp * (1 + Math.max(0, def) / 100) };
  };
  /* 스킬 설명 속 숫자 가운데 아이템으로 바뀐 것 (설명 글은 같고 숫자만 다르다) → [{ key, name, from, to }] 많이 오른 것부터 */
  TW.skillGain = function (h, pre, post) {
    const mk = (p) => { const o = Object.create(h); o.ad = p.ad; o.ap = p.ap; o.maxHp = p.hp; o.def = p.def; return o; };
    const A = mk(pre), B = mk(post), out = [];
    for (const ab of h.hd.abilities || []) {
      if (!ab.desc) continue;
      let sa, sb; try { sa = ab.desc(A); sb = ab.desc(B); } catch (e) { continue; }
      const na = sa.match(/\d+(?:\.\d+)?/g) || [], nb = sb.match(/\d+(?:\.\d+)?/g) || [];
      if (na.length !== nb.length) continue;
      for (let i = 0; i < na.length; i++) if (na[i] !== nb[i]) { out.push({ key: ab.key, name: ab.name, from: +na[i], to: +nb[i] }); break; }
    }
    out.sort((p, q) => q.to / Math.max(1, q.from) - p.to / Math.max(1, p.from));
    return out;
  };

  /* ---------- 미니언 ---------- */
  TW.MINION = {
    melee:  { name: '등불병',     hp: 430,  ad: 14, as: 0.8,  range: 1.5,  ms: 5.4, def: 0,  gold: 20, xp: 30, r: 0.62, ranged: false },
    ranged: { name: '불씨 사수',  hp: 265,  ad: 22, as: 0.7,  range: 8.0,  ms: 5.4, def: 0,  gold: 15, xp: 22, r: 0.56, ranged: true, proj: { kind: 'mbolt', speed: 26 } },
    siege:  { name: '화톳불 수레', hp: 820,  ad: 38, as: 0.5,  range: 10.5, ms: 5.4, def: 20, gold: 42, xp: 60, r: 1.0,  ranged: true, proj: { kind: 'siege', speed: 21 } },
    super:  { name: '정예 등불거인', hp: 2000, ad: 76, as: 0.8,  range: 2.1,  ms: 5.6, def: 35, gold: 35, xp: 70, r: 1.2,  ranged: false },
  };

  /* ---------- 중립 몬스터 ---------- */
  TW.MONSTER = {
    shroom: { name: '깜빡버섯',     hp: 290,  ad: 15,  as: 0.8,  range: 1.6, ms: 5.5, def: 0,  gold: 14, xp: 20,  r: 0.7 },
    boar:   { name: '가시 멧돼지',  hp: 860,  ad: 34,  as: 0.7,  range: 2.0, ms: 6.0, def: 10, gold: 46, xp: 62,  r: 1.15, skill: 'charge' },
    piglet: { name: '새끼 멧돼지',  hp: 250,  ad: 13,  as: 0.9,  range: 1.5, ms: 6.0, def: 0,  gold: 10, xp: 16,  r: 0.6 },
    crab:   { name: '돌등 게',      hp: 540,  ad: 25,  as: 0.75, range: 1.8, ms: 5.0, def: 40, gold: 27, xp: 35,  r: 0.95 },
    water:  { name: '샘지기',       hp: 1550, ad: 42,  as: 0.65, range: 2.6, ms: 5.6, def: 15, gold: 72, xp: 115, r: 1.5,  skill: 'spouts', buff: 'water' },
    fire:   { name: '잉걸 두꺼비',  hp: 1700, ad: 46,  as: 0.6,  range: 2.4, ms: 5.2, def: 15, gold: 72, xp: 115, r: 1.6,  skill: 'embers', buff: 'fire' },
    elder:  { name: '고목 정령',    hp: 3300, ad: 72,  as: 0.55, range: 3.4, ms: 4.6, def: 30, gold: 0,  xp: 0,   r: 2.3,  skill: 'roots', heavy: true },
    boss:   { name: '이무기',       hp: 6800, ad: 105, as: 0.6,  range: 4.6, ms: 0,   def: 45, gold: 0,  xp: 0,   r: 2.8,  skill: 'boss', heavy: true },
    sala:   { name: '노을 도롱뇽',  hp: 3600, ad: 78,  as: 0.65, range: 3.2, ms: 0,   def: 30, gold: 0,  xp: 0,   r: 2.0,  skill: 'sala', heavy: true },
  };
  /* 캠프 구성 */
  TW.CAMPS = {
    shrooms: ['shroom', 'shroom', 'shroom'],
    boar: ['boar', 'piglet'],
    crabs: ['crab', 'crab'],
    water: ['water'],
    fire: ['fire'],
    elder: ['elder'],
    boss: ['boss'],
    sala: ['sala'],
  };
  TW.CAMP_NAME = { shrooms: '깜빡버섯 무리', boar: '가시 멧돼지', crabs: '돌등 게', water: '샘지기', fire: '잉걸 두꺼비', elder: '고목 정령', boss: '이무기', sala: '노을 도롱뇽' };
  /* 큰 몬스터 쟁탈전의 화면 글: 예고 · 등장 이름 카드 · 기운(잡은 편 모두) — 어스름 전선 = 이무기, 한 줄 난전 = 노을 도롱뇽 */
  TW.BIG = {
    boss: { name: '이무기', eul: '이무기를', epithet: '어스름 강 밑바닥의 오래된 뱀', where: '아래쪽 강', buff: '이무기의 기운', col: '#7dffd9', deep: '#0f5a52', glow: '#b8ffe9',
      reward: '잡은 편 모두 100초 동안 — 주는 피해 +12% · 구조물 피해 +60% · 곁의 미니언 강화 · 골드 +160',
      short: ['피해 +12%', '구조물 +60%', '미니언 강화'], gold: 160 },
    sala: { name: '노을 도롱뇽', eul: '노을 도롱뇽을', epithet: '불씨 강에서 기어오른 도롱뇽', where: '다리 가운데 돌 마루', buff: '도롱뇽의 불씨', col: '#ffab4a', deep: '#7a2c0e', glow: '#ffe0a0',
      reward: '잡은 편 모두 60초 동안 — 주는 피해 +10% · 구조물 피해 +40% · 곁의 미니언 강화 · 골드 +80',
      short: ['피해 +10%', '구조물 +40%', '미니언 강화'], gold: 80 },
  };
  /* 버프: 캠프의 우두머리를 잡은 영웅이 잠깐 강해진다 */
  TW.BUFFS = {
    fire:  { name: '잉걸불', color: '#ff8a3c', text: '주는 피해 +8%. 공격과 스킬이 적을 3초간 불태웁니다.' },
    water: { name: '샘물', color: '#5fd4ff', text: '재사용 대기시간이 25% 빨리 돌고, 이동 속도 +8%, 체력이 서서히 회복됩니다.' },
    elder: { name: '고목의 힘', color: '#9fe07a', text: '구조물에 주는 피해 +50%. (75초, 팀 전체)' },
    boss:  { name: '이무기의 기운', color: '#7dffd9', text: '주는 피해 +12%, 구조물 피해 +60%. 주변 아군 미니언이 강해집니다.' },
    sala:  { name: '도롱뇽의 불씨', color: '#ffab4a', text: '주는 피해 +10%, 구조물 피해 +40%. 주변 아군 미니언이 강해집니다.' },
  };

  /* 도깨비불 (어스름 전선): 강 위에 뜨는 네 가지 불 — 무엇이 뜰지는 뜨는 순간에 안다. 먼저 밟는 영웅이 C.WISP_DUR초 동안 얻는다 */
  /* 수치는 tools/dopa_sweep.js 로 봇 대전을 견주어 보았다: 더 약한 안(30초 · 피해 +12%)도 300판씩 재 보았지만 판이 덜 기운다는 증거가 없어서 처음 안(35초 · +15%)을 그대로 둔다 */
  TW.WISP = {
    might: { name: '매운불', color: '#ff6a4a', glow: '#ffc0a0', deep: '#7a1c10', icon: 'fire',   dmg: 0.15 },
    swift: { name: '바람불', color: '#6fd8ff', glow: '#d0f4ff', deep: '#12506e', icon: 'boots',  ms: 0.18, cd: 0.25 },
    mend:  { name: '약불',   color: '#7dffa0', glow: '#d8ffe0', deep: '#14603a', icon: 'heart',  heal: 0.2, regen: 0.008 },
    gold:  { name: '복불',   color: '#ffd84a', glow: '#fff4c0', deep: '#7a5a10', icon: 'gold',   gold: 140, share: 70 },
  };
  TW.WISP_ORDER = ['might', 'swift', 'mend', 'gold'];
  /* 화면에 적는 글은 수치에서 만든다 (수치를 바꿔도 글이 어긋나지 않게) */
  TW.wispText = function () {
    const W = TW.WISP, p = (v) => Math.round(v * 100), d = C.WISP_DUR;
    W.might.short = '주는 피해 +' + p(W.might.dmg) + '%'; W.might.text = d + '초 동안 주는 피해 +' + p(W.might.dmg) + '%';
    W.swift.short = '이동 +' + p(W.swift.ms) + '% · 스킬이 ' + p(W.swift.cd) + '% 빨리 돈다'; W.swift.text = d + '초 동안 이동 속도 +' + p(W.swift.ms) + '%, 스킬 재사용이 ' + p(W.swift.cd) + '% 빨리 돈다';
    W.mend.short = '체력 +' + p(W.mend.heal) + '% · 서서히 회복'; W.mend.text = '바로 체력 +' + p(W.mend.heal) + '%, ' + d + '초 동안 서서히 회복';
    W.gold.short = '골드 +' + W.gold.gold + ' · 우리 편 모두 +' + W.gold.share; W.gold.text = '밟은 영웅 골드 +' + W.gold.gold + ', 우리 편 다른 영웅 +' + W.gold.share;
  };
  TW.wispText();

  /* ---------- 공용 조각 ---------- */
  const isCC = (u) => u.stunned || u.rooted || u.slowPct > 0.01 || u.airborne;
  TW.isCC = isCC;
  function aoe(G, src, x, y, r, dmg, kind, opts, each) {
    const list = G.enemiesIn(src.team, x, y, r);
    for (const u of list) { G.damage(src, u, dmg, kind, opts); if (each && !u.dead) each(u); }
    return list;
  }

  const H = TW.Heroes = {};

  /* =====================================================================
     1. 모루 — 바위등 선봉 (탱커 · 근접)  "들이받아 벽에 박고, 띄우고, 끌어모은다"
     ===================================================================== */
  H.moru = {
    id: 'moru', name: '모루', title: '바위등 선봉', role: 'tank', roleName: '선봉', pos: { top: 3, sup: 2, jg: 1 }, diff: 1,
    blurb: '적을 들이받아 벽에 처박는 돌거북 거인. 싸움을 여는 건 언제나 모루입니다.',
    feel: '느리고 묵직함 · 세 번째 평타마다 땅이 울린다',
    color: '#9a8f7c', glow: '#ffb347', ranged: false,
    /* 손맛을 다듬은 영웅: 평타 선딜(atk) · 평타 박자 표시(beat) · 첫 판 길잡이(tips) */
    polished: true, atk: { wind: 0.17, min: 0.14, max: 0.26 }, beat: { n: 3, of: (h) => (h.st.n || 0) % 3, label: '내리찍기' },
    tips: ['금빛 ▼ 가 뜬 미니언을 우클릭 — 한 대면 쓰러집니다', '세 번째 평타마다 땅을 찍습니다 (발밑 세 점)', 'Q 로 적을 벽에 박으면 기절 · E 로 띄우고 · R 로 뛰어듭니다'],
    atkBonus: (h) => (((h.st.n || 0) + 1) % 3 === 0 ? val(h, 20, 8, 0.3) : 0),
    base: { hp: 880, hpG: 112, ad: 60, adG: 3.2, as: 0.62, asG: 0.012, def: 34, defG: 3.6, ms: 7.3, range: 2.6, regen: 4 },
    build: ['heart', 'boots', 'bark', 'heart', 'bark', 'charm', 'heart', 'bark', 'charm', 'glass', 'charm', 'boots', 'glass', 'blade', 'glass', 'boots'],
    passive: { name: '묵직한 한 방', icon: 'slam', desc: (h) => `세 번째 기본 공격마다 땅을 내리찍어 주변 적에게 ${val(h, 20, 8, 0.3)}의 추가 피해를 주고 0.6초간 35% 느리게 합니다.` },
    onAttack(G, h, tg) {
      h.st.n = (h.st.n || 0) + 1;
      if (h.st.n % 3 !== 0 || tg.isStruct) return;
      aoe(G, h, tg.x, tg.y, 3.2, val(h, 20, 8, 0.3), 'phys', PAS, (u) => G.slow(h, u, 0.35, 0.6));
      G.fx('shock', { x: tg.x, y: tg.y, r: 3.2, color: '#ffcf8a', dur: 0.35 });
      G.fx('shards', { x: tg.x, y: tg.y, n: 7, color: '#b9a88a', speed: 7 });
      G.fx('shake', { x: tg.x, y: tg.y, amp: 0.28 });
      G.emit('sfx', { name: 'slam', x: tg.x, y: tg.y });
    },
    abilities: [
      {
        key: 'Q', name: '들이받기', icon: 'ram', type: 'dir', range: 9.5, width: 3.6, cd: 10, castTime: 0, ind: 'dash', judge: 0.5,
        desc: (h) => `앞으로 돌진해 처음 부딪힌 적을 끝까지 밀고 갑니다(${val(h, 60, 14, 0.5)} 피해). 밀려가던 적이 벽에 부딪히면 ${val(h, 40, 10)}의 추가 피해와 함께 1.3초간 기절합니다.`,
        cast(G, h, t) {
          const dmg = val(h, 60, 14, 0.5), wallDmg = val(h, 40, 10);
          G.dash(h, h.x + t.dx * 9.5, h.y + t.dy * 9.5, 30, {
            hitR: 1.9, carry: true, trail: '#ffcf8a', kind: 'ram',
            onHit(u) { G.damage(h, u, dmg, 'phys', SK[0]); G.fx('sparks', { x: u.x, y: u.y, ang: Math.atan2(t.dy, t.dx), spread: 1.1, n: 9, color: '#ffe0a8', speed: 12 }); if (!u.isHero) G.slow(h, u, 0.3, 1); },
            onEnd(reason, carried) {
              if (!carried || carried.dead) return;
              if (reason === 'wall') {
                G.damage(h, carried, wallDmg, 'phys', SK[0]); G.stun(h, carried, 1.3);
                G.fx('shock', { x: carried.x, y: carried.y, r: 3, color: '#ffe0a8', dur: 0.4 });
                G.fx('shards', { x: carried.x, y: carried.y, n: 12, color: '#b9a88a', speed: 10 });
                G.fx('text', { x: carried.x, y: carried.y, text: '벽꽝!', color: '#ffe0a8', size: 1.25 });
                G.fx('shake', { x: carried.x, y: carried.y, amp: 0.55 });
                G.emit('sfx', { name: 'wallslam', x: carried.x, y: carried.y });
              } else { G.slow(h, carried, 0.4, 1.5); G.knockback(h, carried, t.dx, t.dy, 1.6, 0.14); }
            },
          });
        },
      },
      {
        key: 'W', name: '바위 껍질', icon: 'shell', type: 'self', radius: 4.2, cd: 14, castTime: 0, ind: 'self',
        desc: (h) => `3초간 ${val(h, 70, 22, 0, 0, 0.1)}의 피해를 막는 껍질을 두릅니다. 껍질이 깨지거나 사라질 때 터지며 주변 적에게 ${val(h, 40, 10)} + 막아 낸 피해의 35%를 주고 1초간 30% 느리게 합니다.`,
        cast(G, h) {
          const amt = val(h, 70, 22, 0, 0, 0.1), base = val(h, 40, 10);
          G.addBuff(h, {
            id: 'moruW', dur: 3, shield: amt, shield0: amt, def: 20, fx: 'shell', color: '#d9c7a0',
            onExpire(u, b) {
              if (u.dead) return;
              const absorbed = b.shield0 - Math.max(0, b.shield);
              aoe(G, h, u.x, u.y, 4.2, base + absorbed * 0.35, 'phys', SK[1], (e) => G.slow(h, e, 0.3, 1));
              G.fx('shock', { x: u.x, y: u.y, r: 4.2, color: '#ffcf8a', dur: 0.4 });
              G.fx('shards', { x: u.x, y: u.y, n: 14, color: '#b9a88a', speed: 11 });
              G.fx('shake', { x: u.x, y: u.y, amp: 0.3 });
              G.emit('sfx', { name: 'shellburst', x: u.x, y: u.y });
            },
          });
          G.fx('ring', { x: h.x, y: h.y, r0: 3.2, r1: 1.2, dur: 0.25, color: '#ffcf8a', w: 0.3 });
        },
      },
      {
        key: 'E', name: '지진파', icon: 'quake', type: 'dir', range: 13, width: 3.2, cd: 9, castTime: 0.22, ind: 'line', judge: 0.75,
        desc: (h) => `땅을 내리쳐 느리게 나아가는 충격파를 보냅니다. 닿은 적 모두에게 ${val(h, 70, 16, 0.4)}의 피해를 주고 0.7초간 띄웁니다.`,
        cast(G, h, t) {
          const dmg = val(h, 70, 16, 0.4);
          G.fx('shake', { x: h.x, y: h.y, amp: 0.3 });
          G.skillshot({
            src: h, x: h.x + t.dx * 1.2, y: h.y + t.dy * 1.2, dx: t.dx, dy: t.dy, speed: 22, range: 11.8, radius: 1.6, pierce: true, slot: 2,
            vis: { kind: 'wave', color: '#ffcf8a', size: 1.6 },
            onHit(u) { G.damage(h, u, dmg, 'phys', SK[2]); G.knockup(h, u, 0.7); },
          });
        },
      },
      {
        key: 'R', name: '산사태', icon: 'landslide', type: 'ground', range: 13, radius: 6, cd: 75, castTime: 0.15, ult: true, ind: 'circle', judge: 0.85,
        desc: (h) => `지정한 곳으로 뛰어올라 내리꽂습니다. ${val(h, 150, 30, 0.6)}의 피해를 주고, 범위 안의 적을 한가운데로 끌어모아 1초간 기절시킵니다.`,
        cast(G, h, t) {
          const dmg = val(h, 150, 30, 0.6);
          G.dash(h, t.x, t.y, 26, {
            leap: true, kind: 'leap', trail: '#ffcf8a',
            onEnd() {
              const list = G.enemiesIn(h.team, h.x, h.y, 6);
              for (const u of list) {
                G.damage(h, u, dmg, 'phys', SK[3]);
                if (u.dead) continue;
                if (!u.heavy) { const d = Math.hypot(u.x - h.x, u.y - h.y) || 1; G.pullTo(h, u, h.x + (u.x - h.x) / d * 1.6, h.y + (u.y - h.y) / d * 1.6, 26); }
                G.stun(h, u, 1.0);
              }
              G.fx('shock', { x: h.x, y: h.y, r: 6, color: '#ffb347', dur: 0.55 });
              G.fx('crack', { x: h.x, y: h.y, r: 5.5, color: '#ffb347' });
              G.fx('shards', { x: h.x, y: h.y, n: 22, color: '#b9a88a', speed: 14 });
              G.fx('ring', { x: h.x, y: h.y, r0: 6, r1: 0.8, dur: 0.3, color: '#ffe0a8', w: 0.35 });
              G.fx('shake', { x: h.x, y: h.y, amp: 0.9 });
              G.emit('sfx', { name: 'landslide', x: h.x, y: h.y });
            },
          });
        },
      },
    ],
  };

  /* =====================================================================
     2. 하늬 — 바람 창술사 (전사 · 긴 근접)  "창끝으로 찌르고, 투사체를 쳐내고, 묶인 적을 파고든다"
     ===================================================================== */
  function gainFlow(G, h, n) {
    const b = h.getBuff('flow'), st = Math.min(5, (b ? b.stacks : 0) + (n || 1));
    G.addBuff(h, { id: 'flow', dur: 4, stacks: st, msPct: 0.03 * st, asPct: 0.06 * st, fx: 'flow', color: '#8fe8f0', quiet: true });
  }
  H.hanui = {
    id: 'hanui', name: '하늬', title: '바람 창술사', role: 'fighter', roleName: '전사', pos: { top: 3, jg: 3 }, diff: 2,
    blurb: '긴 창으로 거리를 재며 싸우는 춤꾼. 아군이 묶어 둔 적을 끝없이 파고듭니다.',
    feel: '빠른 찌르기 · 맞힐수록 빨라진다',
    color: '#e8f1ee', glow: '#5fd4e8', ranged: false,
    base: { hp: 750, hpG: 96, ad: 62, adG: 3.7, as: 0.8, asG: 0.022, def: 28, defG: 3.2, ms: 7.9, range: 3.7, regen: 3 },
    build: ['blade', 'boots', 'fang', 'blade', 'heart', 'blade', 'fang', 'heart', 'feather', 'fang', 'heart', 'feather', 'bark', 'feather', 'boots', 'bark'],
    passive: { name: '바람결', icon: 'flow', desc: () => '공격이나 스킬을 맞힐 때마다 바람결이 쌓입니다(최대 5, 4초). 하나당 이동 속도 +3%, 공격 속도 +6%.' },
    onAttack(G, h) { gainFlow(G, h, 1); },
    abilities: [
      {
        key: 'Q', name: '꿰뚫기', icon: 'thrust', type: 'dir', range: 7.5, width: 1.5, cd: 4.5, castTime: 0.18, ind: 'line', tip: 5.2,
        desc: (h) => `창을 길게 내질러 일직선의 적에게 ${val(h, 50, 11, 0.72)}의 피해를 줍니다. 창끝(먼 쪽)에 맞은 적은 40% 더 아프고 1.2초간 35% 느려집니다.`,
        cast(G, h, t) {
          const dmg = val(h, 50, 11, 0.72), x2 = h.x + t.dx * 7.5, y2 = h.y + t.dy * 7.5;
          let any = false, tip = false;
          for (const u of G.enemiesInLine(h.team, h.x, h.y, x2, y2, 0.75)) {
            const far = Math.hypot(u.x - h.x, u.y - h.y) + u.r >= 5.2;
            G.damage(h, u, dmg * (far ? 1.4 : 1), 'phys', far ? { skill: 0, big: true } : SK[0]);
            if (far && !u.dead) { G.slow(h, u, 0.35, 1.2); if (u.isHero) tip = true; }
            any = true;
          }
          if (any) gainFlow(G, h, 1);
          if (tip) { G.fx('text', { x: x2, y: y2, text: '창끝!', color: '#bff6ff', size: 1.0 }); G.fx('flash', { x: x2, y: y2, r: 2.2, color: '#bff6ff', dur: 0.2 }); }
          G.fx('thrust', { x: h.x, y: h.y, ang: Math.atan2(t.dy, t.dx), len: 7.5, w: 1.1, color: '#bff6ff', dur: 0.22 });
        },
      },
      {
        key: 'W', name: '바람막이', icon: 'deflect', type: 'self', radius: 3.6, cd: 13, castTime: 0, ind: 'self',
        desc: (h) => `0.9초간 창을 돌려 주변으로 날아오는 적의 투사체를 모두 쳐내고, 닿는 적에게 ${val(h, 25, 6, 0.3)}의 피해를 두 번 줍니다. 쳐낼 때마다 바람결을 얻습니다.`,
        cast(G, h) {
          const dmg = val(h, 25, 6, 0.3);
          G.addBuff(h, { id: 'deflect', dur: 0.9, deflect: 3.6, fx: 'spin', color: '#bff6ff', onDeflect() { gainFlow(G, h, 1); } });
          G.zone({
            src: h, x: h.x, y: h.y, radius: 3.6, delay: 0, dur: 0.9, tick: 0.42, follow: h, vis: { kind: 'spin', color: '#bff6ff' },
            onTick(z) { const l = aoe(G, h, z.x, z.y, z.radius, dmg, 'phys', SK[1]); if (l.length) gainFlow(G, h, 1); },
          });
        },
      },
      {
        key: 'E', name: '질풍 찌르기', icon: 'gale', type: 'dir', range: 8, width: 2.4, cd: 8.5, castTime: 0, ind: 'dash',
        desc: (h) => `적을 꿰뚫으며 돌진해 ${val(h, 46, 10, 0.58)}의 피해를 줍니다. 느려졌거나 기절·속박·띄워진 영웅을 맞히면 재사용 대기시간이 1초로 줄어듭니다.`,
        cast(G, h, t) {
          const dmg = val(h, 46, 10, 0.58); let chain = false;
          G.dash(h, h.x + t.dx * 8, h.y + t.dy * 8, 34, {
            hitR: 1.5, through: true, trail: '#bff6ff', kind: 'pierce',
            onHit(u) {
              if (u.isHero && isCC(u)) chain = true;
              G.damage(h, u, dmg, 'phys', SK[2]); gainFlow(G, h, 1);
              G.fx('slash', { x: u.x, y: u.y, ang: Math.atan2(t.dy, t.dx), r: 2.0, arc: 0.9, color: '#bff6ff', dur: 0.2 });
            },
            onEnd() { if (chain && h.cds[2] > 1) { h.cds[2] = 1; G.fx('text', { x: h.x, y: h.y, text: '연계!', color: '#8fe8f0', size: 1.1 }); G.emit('sfx', { name: 'chain', x: h.x, y: h.y }); } },
          });
        },
      },
      {
        key: 'R', name: '천 갈래 창', icon: 'flurry', type: 'dir', range: 7, angle: 0.5, cd: 70, castTime: 0.1, ult: true, ind: 'cone',
        chan: { dur: 1.45, tick: 0.17, canMove: false, turn: 2.6 },
        desc: (h) => `1.4초 동안 앞쪽 부채꼴을 여덟 번 찌릅니다(한 번에 ${val(h, 24, 5, 0.22)}, 맞을 때마다 더 느려짐). 마지막 일격은 ${val(h, 60, 12, 0.5)}의 피해와 함께 0.8초간 띄웁니다. 조준은 커서를 따라갑니다.`,
        cast() { },
        onTick(G, h, ch) {
          if (ch.n >= 8) return;                    // 여덟 번까지만 찌른다
          const last = ch.n === 7, dmg = last ? val(h, 60, 12, 0.5) : val(h, 24, 5, 0.22), ang = h.facing;
          const list = G.enemiesInCone(h.team, h.x, h.y, ang, 0.5, 7);
          for (const u of list) {
            G.damage(h, u, dmg, 'phys', last ? { skill: 3, big: true } : SK[3]);
            if (u.dead) continue;
            if (last) G.knockup(h, u, 0.8);
            else { const b = u.getBuff('flurry'), st = Math.min(4, (b ? b.stacks : 0) + 1); G.addBuff(u, { id: 'flurry', dur: 1.2, stacks: st, slow: 0.12 * st, src: h, quiet: true }); }
          }
          if (list.length) gainFlow(G, h, 1);
          const a = ang + (G.rng() - 0.5) * 0.8;
          G.fx('thrust', { x: h.x, y: h.y, ang: a, len: last ? 7.6 : 6.2 + G.rng() * 1.2, w: last ? 1.8 : 0.8, color: last ? '#ffffff' : '#bff6ff', dur: last ? 0.3 : 0.14 });
          if (last) { G.fx('shock', { x: h.x + Math.cos(ang) * 4, y: h.y + Math.sin(ang) * 4, r: 3.6, color: '#bff6ff', dur: 0.35 }); G.fx('shake', { x: h.x, y: h.y, amp: 0.45 }); }
          G.emit('sfx', { name: last ? 'flurryEnd' : 'flurry', x: h.x, y: h.y, n: ch.n });
        },
      },
    ],
  };

  /* =====================================================================
     3. 그믐 — 그믐달 사냥꾼 (암살자 · 근접)  "안 보이는 곳에서 나타나 한 명을 지운다"
     ===================================================================== */
  function ambushReady(G, h) { if (!h.st.ambush) { h.st.ambush = true; h.st.ambushT = G.t; G.emit('ambushReady', { u: h }); } }
  H.geumeum = {
    id: 'geumeum', name: '그믐', title: '그믐달 사냥꾼', role: 'assassin', roleName: '암살자', pos: { jg: 3, top: 1, mid: 1 }, diff: 3,
    blurb: '수풀과 어둠에 숨어 있다가 한 명만 노려 지우는 사냥꾼. 보이지 않을 때 가장 무섭습니다.',
    feel: '숨었다가 덮친다 · 돌아오는 칼날',
    color: '#3d3270', glow: '#cfd6ff', ranged: false,
    base: { hp: 730, hpG: 92, ad: 66, adG: 3.9, as: 0.9, asG: 0.024, def: 26, defG: 3.0, ms: 8.2, range: 2.5, regen: 3 },
    build: ['blade', 'fang', 'boots', 'blade', 'fang', 'blade', 'glass', 'boots', 'glass', 'fang', 'heart', 'glass', 'heart', 'feather', 'heart', 'boots'],
    passive: { name: '기습', icon: 'ambush', desc: (h) => `적에게 보이지 않는 채로 1.5초가 지나면 기습 준비가 됩니다. 다음 기본 공격이 ${val(h, 35, 9, 0.5)}의 추가 피해를 주고 1.2초간 40% 느리게 하며, 그믐은 2초간 ${val(h, 30, 8)}의 보호막을 얻습니다.` },
    onTick(G, h, dt) {
      const st = h.st;
      if (!h.seen[1 - h.team]) { st.unseenT = (st.unseenT || 0) + dt; if (st.ambush) st.ambushT = G.t; if (st.unseenT >= (st.darkUntil > G.t ? 0.5 : 1.5)) ambushReady(G, h); }      // 숨어 있는 동안은 기습이 식지 않는다 (들킨 뒤 4초 안에 써야 한다)
      else { st.unseenT = 0; if (st.ambush && G.t - st.ambushT > 4 && !(st.forceUntil > G.t)) st.ambush = false; }
      if (st.darkUntil > G.t && !st.ambush && G.t - (st.lastAmbush || -9) > 2.2) ambushReady(G, h);
    },
    atkBonus: (h) => (h.st.ambush ? val(h, 35, 9, 0.5) : 0),
    onAttack(G, h, tg) {
      const st = h.st;
      if (!st.ambush || tg.isStruct) return;
      st.ambush = false; st.unseenT = 0; st.lastAmbush = G.t;
      G.damage(h, tg, val(h, 35, 9, 0.5), 'phys', { skill: 4, big: true });
      if (!tg.dead) G.slow(h, tg, 0.4, 1.2);
      G.fx('slash', { x: tg.x, y: tg.y, ang: h.facing, r: 2.8, arc: 2.4, color: '#ffffff', dur: 0.25 });
      G.addBuff(h, { id: 'ambushGuard', dur: 2, shield: val(h, 30, 8), fx: 'shield', color: '#cfd6ff', quiet: true });
      G.fx('text', { x: tg.x, y: tg.y, text: '기습!', color: '#cfd6ff', size: 1.15 });
      G.emit('sfx', { name: 'ambush', x: tg.x, y: tg.y });
    },
    abilities: [
      {
        key: 'Q', name: '달날', icon: 'crescent', type: 'dir', range: 11.5, width: 1.8, cd: 7, castTime: 0.12, ind: 'line',
        desc: (h) => `초승달 칼날을 던집니다. 지나가는 적 모두에게 ${val(h, 55, 12, 0.6)}의 피해를 주고 끝까지 가면 내게 돌아옵니다. 돌아오는 길에 다시 맞은 적은 50% 더 아프고 1초간 30% 느려집니다.`,
        cast(G, h, t) {
          const dmg = val(h, 55, 12, 0.6), first = new Set();
          h.st.blade = G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 30, range: 11.5, radius: 0.9, pierce: true, slot: 0, boomerang: 36,
            vis: { kind: 'crescent', color: '#cfd6ff', size: 1.5 },
            onHit(u, p) {
              if (!p.returning) { first.add(u); G.damage(h, u, dmg, 'phys', SK[0]); }
              else { const again = first.has(u); G.damage(h, u, dmg * (again ? 1.5 : 1), 'phys', again ? { skill: 0, big: true } : SK[0]); if (again && !u.dead) G.slow(h, u, 0.3, 1); }
            },
            onEnd() { if (h.st.blade && h.st.blade.done) h.st.blade = null; },
          });
        },
      },
      {
        key: 'W', name: '연막', icon: 'smoke', type: 'ground', range: 9, radius: 4.6, cd: 15, castTime: 0, ind: 'circle',
        desc: () => '지정한 곳에 4.5초간 연막을 칩니다. 연막 안은 수풀처럼 밖에서 보이지 않고, 안에 있는 적은 25% 느려집니다.',
        cast(G, h, t) {
          G.zone({
            src: h, x: t.x, y: t.y, radius: 4.6, delay: 0.25, dur: 4.5, tick: 0.25, smoke: true, lob: { x: h.x, y: h.y }, vis: { kind: 'smoke', color: '#8a7fd0' },
            onTick(z) { for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius)) G.addBuff(u, { id: 'smokeSlow', dur: 0.4, slow: 0.25, src: h, quiet: true }); },
          });
        },
      },
      {
        key: 'E', name: '칼날 타기', icon: 'bladeride', type: 'dir', range: 6.5, width: 2, cd: 10, castTime: 0, ind: 'dash',
        desc: () => '달날이 날아가는 중이면 칼날이 있는 곳으로 순간이동합니다. 아니면 짧게 돌진합니다. 어느 쪽이든 곧바로 기습 준비가 됩니다.',
        cast(G, h, t) {
          const p = h.st.blade, ox = h.x, oy = h.y;
          if (p && !p.done) {
            G.blink(h, p.x, p.y); p.done = true; p.caught = true; h.st.blade = null;
            G.fx('line', { x1: ox, y1: oy, x2: h.x, y2: h.y, color: '#cfd6ff', dur: 0.3, w: 0.5 });
            G.fx('flash', { x: h.x, y: h.y, r: 2.6, color: '#cfd6ff', dur: 0.22 });
            G.fx('afterimage', { x: ox, y: oy, u: h, facing: h.facing });
          } else G.dash(h, h.x + t.dx * 6.5, h.y + t.dy * 6.5, 36, { trail: '#cfd6ff', kind: 'step' });
          h.st.forceUntil = G.t + 2.5; ambushReady(G, h); h.atkCd = Math.min(h.atkCd, 0.1);
        },
      },
      {
        key: 'R', name: '그믐밤', icon: 'darkmoon', type: 'self', radius: 13, cd: 80, castTime: 0.2, ult: true, ind: 'self',
        desc: () => '6초 동안 주변을 달 없는 밤으로 덮습니다. 안에 있는 적 영웅은 코앞밖에 보지 못합니다. 그믐은 어둠 속에서 25% 빨라지고 기습이 훨씬 빨리 준비됩니다.',
        cast(G, h) {
          h.st.darkUntil = G.t + 6;
          G.zone({
            src: h, x: h.x, y: h.y, radius: 13, delay: 0, dur: 6, tick: 0.2, dark: true, friendly: true, vis: { kind: 'dark', color: '#2a1f5a' },
            onTick(z) {
              for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius, { minions: false, monsters: false })) G.addBuff(u, { id: 'dark', dur: 0.35, sight: 4.5, src: h, fx: 'dark', quiet: true });
              if (!h.dead && U.dist(h.x, h.y, z.x, z.y) <= z.radius) G.addBuff(h, { id: 'darkRun', dur: 0.35, msPct: 0.25, quiet: true });
            },
          });
          G.fx('ring', { x: h.x, y: h.y, r0: 1, r1: 13, dur: 0.5, color: '#b7a8ff', w: 0.4 });
          G.fx('shake', { x: h.x, y: h.y, amp: 0.3 });
        },
      },
    ],
  };

  /* =====================================================================
     4. 불티 — 반딧불 포수 (원거리 딜러)  "쏠수록 빨라지고, 멈추면 식는다"
     ===================================================================== */
  H.bulti = {
    id: 'bulti', name: '불티', title: '반딧불 포수', role: 'marksman', roleName: '사수', pos: { carry: 3, mid: 1 }, diff: 1,
    blurb: '반딧불 어항을 뒤집어쓰고 놋쇠 대롱으로 빛살을 쏘아 대는 꼬마 발명가. 계속 쏘고 있는 한 누구보다 아픕니다.',
    feel: '연사가 점점 빨라진다 · 치고 빠지기',
    color: '#44559a', glow: '#d6ff5a', ranged: true, proj: { kind: 'bolt', speed: 46, color: '#e6ff8a' },
    polished: true, atk: { wind: 0.13, min: 0.09, max: 0.16 }, beat: { n: 6, of: (h) => ((h.getBuff('heat') || {}).stacks || 0), label: '달아오름' },
    tips: ['쏘고 → 걷고 → 쏘기. 발밑 고리가 다 차면 다음 평타가 나갑니다', '금빛 ▼ 가 뜬 미니언을 우클릭 — 한 대면 쓰러집니다', 'E 로 폴짝 뛰면 다음 평타가 세 발 · Q 는 줄지어 선 적을 꿰뚫습니다'],
    base: { hp: 625, hpG: 84, ad: 58, adG: 3.5, as: 0.78, asG: 0.03, def: 20, defG: 2.8, ms: 7.6, range: 10.5, regen: 2 },
    build: ['blade', 'boots', 'feather', 'blade', 'feather', 'fang', 'blade', 'feather', 'fang', 'boots', 'fang', 'charm', 'glass', 'charm', 'boots', 'charm'],
    passive: { name: '달아오름', icon: 'heat', desc: () => '기본 공격을 할 때마다 열기가 쌓입니다(최대 6, 2.5초). 하나당 공격 속도 +9%. 가득 차면 빛살이 대상 뒤의 적까지 꿰뚫습니다(40% 피해).' },
    onAttack(G, h, tg) {
      const b = h.getBuff('heat'), st = Math.min(6, (b ? b.stacks : 0) + 1);
      G.addBuff(h, { id: 'heat', dur: 2.5, stacks: st, asPct: 0.09 * st, fx: 'heat', color: '#d6ff5a', quiet: true });
      if (h.cds[2] > 0) h.cds[2] = Math.max(0, h.cds[2] - 0.5);
      if (st >= 6 && !tg.isStruct) {
        const d = Math.hypot(tg.x - h.x, tg.y - h.y) || 1, dx = (tg.x - h.x) / d, dy = (tg.y - h.y) / d;
        for (const u of G.enemiesInLine(h.team, tg.x, tg.y, tg.x + dx * 4, tg.y + dy * 4, 0.9)) if (u !== tg) G.damage(h, u, h.ad * 0.4, 'phys', PAS);
        G.fx('thrust', { x: tg.x, y: tg.y, ang: Math.atan2(dy, dx), len: 4, w: 0.6, color: '#e6ff8a', dur: 0.16 });
      }
    },
    abilities: [
      {
        key: 'Q', name: '꿰뚫는 빛살', icon: 'firebolt', type: 'dir', range: 19, width: 1.7, cd: 6.5, castTime: 0.12, ind: 'line', judge: 0.6,
        desc: (h) => `모든 적을 꿰뚫는 굵은 빛살을 쏩니다. ${val(h, 60, 13, 0.85)}의 피해를 주며, 꿰뚫을 때마다 다음 적에게 주는 피해가 12%씩 늘어납니다(최대 +48%).`,
        cast(G, h, t) {
          const dmg = val(h, 60, 13, 0.85); let n = 0;
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 44, range: 19, radius: 0.85, pierce: true, slot: 0,
            vis: { kind: 'firebolt', color: '#e6ff8a', size: 1.5 },
            onHit(u) { G.damage(h, u, dmg * (1 + 0.12 * Math.min(4, n)), 'phys', n >= 2 ? { skill: 0, big: true } : SK[0]); n++; },
          });
        },
      },
      {
        key: 'W', name: '끈끈이 병', icon: 'jar', type: 'ground', range: 12, radius: 3.4, cd: 12, castTime: 0.1, ind: 'circle', judge: 0.65,
        desc: (h) => `끈끈이 병을 던져 ${val(h, 40, 9, 0.3)}의 피해를 주고 2초간 45% 느리게 합니다. 바닥에 2.5초간 끈끈이가 남습니다.`,
        cast(G, h, t) {
          const dmg = val(h, 40, 9, 0.3);
          G.zone({
            src: h, x: t.x, y: t.y, radius: 3.4, delay: 0.45, dur: 2.5, tick: 0.25, lob: { x: h.x, y: h.y }, vis: { kind: 'sticky', color: '#c8e85a' },
            onBlast(z) { aoe(G, h, z.x, z.y, z.radius, dmg, 'phys', SK[1], (u) => G.slow(h, u, 0.45, 2)); G.fx('burst', { x: z.x, y: z.y, n: 14, color: '#d6ff5a', speed: 8, life: 0.4 }); },
            onTick(z) { for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius)) G.addBuff(u, { id: 'sticky', dur: 0.4, slow: 0.3, src: h, quiet: true }); },
          });
        },
      },
      {
        key: 'E', name: '폴짝', icon: 'tumble', type: 'dir', range: 6, width: 2, cd: 10, castTime: 0, ind: 'dash', judge: 0,
        desc: () => '대롱을 터뜨린 반동으로 폴짝 뜁니다. 다음 기본 공격(3초 안)은 빛살 세 발을 한꺼번에 쏩니다(한 발당 60%). 기본 공격을 맞힐 때마다 이 스킬의 대기시간이 0.5초 줄어듭니다.',
        cast(G, h, t) {
          G.dash(h, h.x + t.dx * 6, h.y + t.dy * 6, 32, { trail: '#e6ff8a', kind: 'step' });
          G.addBuff(h, { id: 'triple', dur: 3, triple: true, fx: 'empower', color: '#e6ff8a' });
          h.atkCd = Math.min(h.atkCd, 0.05);
        },
      },
      {
        key: 'R', name: '반딧불 소나기', icon: 'barrage', type: 'dir', range: 16, width: 1.4, cd: 75, castTime: 0.15, ult: true, ind: 'line',
        chan: { dur: 2.4, tick: 0.15, canMove: true, moveMul: 0.6, turn: 3.4 },
        desc: (h) => `2.4초 동안 커서 방향으로 반딧불을 열여섯 발 퍼붓습니다(한 발당 ${val(h, 28, 6, 0.3)}, 처음 닿는 적에게 명중). 쏘는 동안 느리게 움직일 수 있습니다.`,
        cast() { },
        onTick(G, h, ch) {
          const dmg = val(h, 28, 6, 0.3), a = h.facing + (G.rng() - 0.5) * 0.09, dx = Math.cos(a), dy = Math.sin(a);
          G.skillshot({
            src: h, x: h.x + dx * 0.8, y: h.y + dy * 0.8, dx, dy, speed: 46, range: 16, radius: 0.7, slot: 3,
            vis: { kind: 'bolt', color: '#e6ff8a', size: 1.2 },
            onHit(u) { G.damage(h, u, dmg, 'phys', SK[3]); },
          });
          G.emit('sfx', { name: 'barrage', x: h.x, y: h.y, n: ch.n });
        },
      },
    ],
  };

  /* =====================================================================
     5. 초롱 — 등불 술사 (폭발 마법사)  "구슬을 깔고, 빛줄기로 꿰어 터뜨린다"
     ===================================================================== */
  function detonate(G, h, z) {
    if (z.done || !z.orb) return;
    z.done = true;
    const big = z.orb === 'moon';
    if (big) {
      aoe(G, h, z.x, z.y, 7.5, val(h, 220, 45, 0, 1.0), 'magic', { skill: 3, big: true }, (u) => G.knockup(h, u, 1.0));
      G.fx('shock', { x: z.x, y: z.y, r: 7.5, color: '#fff2c4', dur: 0.6 }); G.fx('pillar', { x: z.x, y: z.y, r: 4, color: '#ffe9a8', dur: 0.6 });
      G.fx('burst', { x: z.x, y: z.y, n: 36, color: '#ffd27a', speed: 16, life: 0.7 }); G.fx('shake', { x: z.x, y: z.y, amp: 1.0 });
      G.emit('sfx', { name: 'moonburst', x: z.x, y: z.y });
    } else {
      aoe(G, h, z.x, z.y, 4, val(h, 88, 18, 0, 0.65), 'magic', { skill: 1, big: true }, (u) => G.stun(h, u, z.orb === 'blink' ? 0.6 : 1.0));
      G.fx('shock', { x: z.x, y: z.y, r: 4, color: '#ffe9a8', dur: 0.4 }); G.fx('burst', { x: z.x, y: z.y, n: 18, color: '#ffd27a', speed: 12, life: 0.5 });
      G.fx('shake', { x: z.x, y: z.y, amp: 0.45 });
      G.emit('sfx', { name: 'orbburst', x: z.x, y: z.y });
    }
    for (let i = 0; i < 4; i++) if (h.cds[i] > 0) h.cds[i] = Math.max(0, h.cds[i] - 1.0);       // 패시브: 심지
  }
  function placeOrb(G, h, x, y, kind, dur, lob) {
    const own = G.zones.filter(z => z.orb && z.src === h && z.orb !== 'moon' && !z.done);
    if (own.length >= 3) own[0].done = true;
    const pulse = val(h, 40, 9, 0, 0.3);
    return G.zone({
      src: h, x, y, radius: 1.3, delay: lob ? 0.4 : 0, dur, tick: 9, orb: kind, lob: lob ? { x: h.x, y: h.y } : null, friendly: true, vis: { kind: 'orb', color: '#ffd27a' },
      onBlast(z) { aoe(G, h, z.x, z.y, 2.2, pulse, 'magic', SK[1]); G.fx('ring', { x: z.x, y: z.y, r0: 0.4, r1: 2.2, dur: 0.25, color: '#ffe9a8', w: 0.2 }); if (z.primed) detonate(G, h, z); },
    });
  }
  H.chorong = {
    id: 'chorong', name: '초롱', title: '등불 술사', role: 'mage', roleName: '마법사', pos: { mid: 3, carry: 1, sup: 1 }, diff: 3,
    blurb: '등불 구슬을 여기저기 띄워 두고 빛줄기 한 줄로 꿰어 터뜨리는 술사. 각이 맞으면 한타가 끝납니다.',
    feel: '모아서 쏘는 빛줄기 · 구슬 연쇄 폭발',
    color: '#c64a3e', glow: '#ffd27a', ranged: true, proj: { kind: 'wisp', speed: 26, color: '#ffd27a' },
    base: { hp: 645, hpG: 84, ad: 50, adG: 2.6, as: 0.66, asG: 0.014, def: 20, defG: 2.6, ms: 7.4, range: 9.5, regen: 2 },
    build: ['orb', 'boots', 'orb', 'glass', 'orb', 'glass', 'charm', 'glass', 'boots', 'charm', 'heart', 'charm', 'heart', 'boots', 'heart', 'bark'],
    passive: { name: '심지', icon: 'wick', desc: () => '구슬이 터질 때마다 모든 스킬의 재사용 대기시간이 1초씩 줄어듭니다.' },
    abilities: [
      {
        key: 'Q', name: '빛줄기', icon: 'beam', type: 'charge', range: 19, minRange: 10, width: 1.5, cd: 5, castTime: 0, ind: 'line',
        charge: { min: 0.2, max: 1.1, hold: 2.0, moveMul: 0.65 },
        desc: (h) => `키를 누르고 있으면 빛을 모으고, 떼면 쏩니다. 오래 모을수록 멀리 나가고 아픕니다(${Math.round(val(h, 68, 15, 0, 0.6) * 0.6)}~${Math.round(val(h, 68, 15, 0, 0.6) * 1.3)}). 빛줄기에 닿은 구슬은 터집니다.`,
        release(G, h, t, k) {       // k: 0..1 모은 정도
          const range = 10 + 9 * k, dmg = val(h, 68, 15, 0, 0.6) * (0.6 + 0.7 * k), hw = 0.75;
          const x2 = h.x + t.dx * range, y2 = h.y + t.dy * range;
          for (const u of G.enemiesInLine(h.team, h.x, h.y, x2, y2, hw)) { G.damage(h, u, dmg, 'magic', k > 0.85 ? { skill: 0, big: true } : SK[0]); if (k > 0.85 && !u.dead) G.slow(h, u, 0.3, 0.6); }
          // 닿은 구슬은 터진다. 아직 날아오는 중인 구슬은 떨어지는 순간 터진다
          for (const z of G.zones) if (z.orb && z.src === h && !z.done && U.segDist(z.x, z.y, h.x, h.y, x2, y2) <= z.radius + hw + (z.orb === 'moon' ? 1.6 : 0.4)) { if (z.active) detonate(G, h, z); else z.primed = true; }
          G.fx('beam', { x1: h.x, y1: h.y, x2, y2, w: 0.7 + 0.9 * k, color: '#fff2c4', dur: 0.3 });
          G.fx('shake', { x: h.x, y: h.y, amp: 0.12 + 0.25 * k });
          G.emit('sfx', { name: 'beam', x: h.x, y: h.y, k });
        },
      },
      {
        key: 'W', name: '초롱불', icon: 'lantern', type: 'ground', range: 12, radius: 4, cd: 7.5, castTime: 0.1, ind: 'circle',
        desc: (h) => `지정한 곳에 5초간 떠 있는 등불 구슬을 띄웁니다(${val(h, 40, 9, 0, 0.3)} 피해). 빛줄기가 구슬을 지나가면 크게 터져 ${val(h, 88, 18, 0, 0.65)}의 피해를 주고 1초간 기절시킵니다. (최대 3개)`,
        cast(G, h, t) { placeOrb(G, h, t.x, t.y, 'orb', 5, true); },
      },
      {
        key: 'E', name: '깜빡임', icon: 'blink', type: 'ground', range: 7.5, radius: 0, cd: 14, castTime: 0, ind: 'blink',
        desc: () => '지정한 곳으로 순간이동하고, 떠난 자리에 4초간 등불 구슬을 남깁니다(터지면 0.6초 기절).',
        cast(G, h, t) {
          const ox = h.x, oy = h.y;
          G.blink(h, t.x, t.y);
          placeOrb(G, h, ox, oy, 'blink', 4, false);
          G.fx('line', { x1: ox, y1: oy, x2: h.x, y2: h.y, color: '#ffd27a', dur: 0.3, w: 0.4 });
          G.fx('flash', { x: h.x, y: h.y, r: 2.4, color: '#ffe9a8', dur: 0.25 });
        },
      },
      {
        key: 'R', name: '보름달', icon: 'moon', type: 'dir', range: 26, width: 6, cd: 80, castTime: 0.35, ult: true, ind: 'line',
        desc: (h) => `느리게 떠가는 커다란 달을 띄웁니다. 닿는 적을 태우고(0.4초마다 ${val(h, 50, 10, 0, 0.22)}) 25% 느리게 합니다. 빛줄기로 맞히면 대폭발해 ${val(h, 220, 45, 0, 1.0)}의 피해를 주고 1초간 띄웁니다.`,
        cast(G, h, t) {
          const tick = val(h, 50, 10, 0, 0.22);
          G.zone({
            src: h, x: h.x + t.dx * 2, y: h.y + t.dy * 2, radius: 3, delay: 0, dur: 3.2, tick: 0.4, orb: 'moon', vx: t.dx * 7.5, vy: t.dy * 7.5, vis: { kind: 'moon', color: '#fff2c4' },
            onTick(z) { aoe(G, h, z.x, z.y, z.radius, tick, 'magic', SK[3], (u) => G.addBuff(u, { id: 'moonSlow', dur: 0.6, slow: 0.25, src: h, quiet: true })); },
            onEnd(z) {
              if (z.orb !== 'moon' || z.blown) return; z.blown = true;
              aoe(G, h, z.x, z.y, 6, val(h, 220, 45, 0, 1.0) * 0.6, 'magic', SK[3]);
              G.fx('shock', { x: z.x, y: z.y, r: 6, color: '#fff2c4', dur: 0.5 }); G.fx('burst', { x: z.x, y: z.y, n: 22, color: '#ffd27a', speed: 12, life: 0.6 });
              G.emit('sfx', { name: 'orbburst', x: z.x, y: z.y });
            },
          });
        },
      },
    ],
  };
  TW.detonate = detonate;

  /* =====================================================================
     6. 서리 — 서리 무녀 (제어 마법사)  "얼음 못에 가두고, 세 번 맞히면 얼린다"
     ===================================================================== */
  function frost(G, h, u, n) {
    if (u.dead || u.isStruct || u.st.frostImmune > G.t) return;
    const b = u.getBuff('frost'), st = (b ? b.stacks : 0) + (n || 1);
    if (st >= 3) {
      u.removeBuff('frost'); u.st.frostImmune = G.t + 4.5;
      G.freeze(h, u, u.heavy ? 0.6 : 1.3);
      G.damage(h, u, val(h, 40, 9, 0, 0.25), 'magic', { skill: 4, big: true });
      G.fx('shards', { x: u.x, y: u.y, n: 10, color: '#cfefff', speed: 8 });
      G.fx('text', { x: u.x, y: u.y, text: '빙결!', color: '#bfeaff', size: 1.15 });
      G.emit('sfx', { name: 'freeze', x: u.x, y: u.y });
    } else G.addBuff(u, { id: 'frost', dur: 5, stacks: st, src: h, fx: 'frost', color: '#9fdcff', quiet: true });
  }
  H.seori = {
    id: 'seori', name: '서리', title: '서리 무녀', role: 'mage', roleName: '마법사', pos: { mid: 3, sup: 2 }, diff: 2,
    blurb: '발밑을 얼려 도망칠 길을 지우는 무녀. 서리가 세 번 닿은 적은 그 자리에 얼어붙습니다.',
    feel: '느리게 조여 온다 · 세 번 맞히면 빙결',
    color: '#bfe2f5', glow: '#7fd8ff', ranged: true, proj: { kind: 'shard', speed: 38, color: '#bfeaff' },
    polished: true, atk: { wind: 0.13, min: 0.1, max: 0.18 },
    tips: ['스킬을 세 번 맞히면 얼어붙습니다 (적 머리 위 눈꽃 셋)', '금빛 ▼ 가 뜬 미니언을 우클릭 — 한 대면 쓰러집니다', 'W 얼음 못에 가두고 Q 를 꽂으세요 · E 로 미끄러져 빠집니다'],
    base: { hp: 635, hpG: 82, ad: 50, adG: 2.6, as: 0.66, asG: 0.014, def: 20, defG: 2.7, ms: 7.4, range: 9.5, regen: 2 },
    build: ['orb', 'boots', 'glass', 'orb', 'glass', 'orb', 'heart', 'glass', 'charm', 'heart', 'boots', 'charm', 'heart', 'charm', 'boots', 'bark'],
    passive: { name: '살얼음', icon: 'frost', desc: (h) => `스킬이 닿은 적에게 서리 표식이 남습니다(5초). 세 개가 모이면 1.3초간 얼어붙고 ${val(h, 40, 9, 0, 0.25)}의 피해를 입습니다.` },
    abilities: [
      {
        key: 'Q', name: '고드름', icon: 'icicle', type: 'dir', range: 15, width: 1.7, cd: 5.5, castTime: 0.12, ind: 'line', judge: 0.6,
        desc: (h) => `고드름을 쏘아 처음 맞은 적에게 ${val(h, 66, 14, 0, 0.6)}의 피해를 줍니다. 맞은 자리에서 조각 셋으로 부서져 뒤쪽 적들에게 절반의 피해를 줍니다. (맞을 때마다 서리 표식)`,
        cast(G, h, t) {
          const dmg = val(h, 66, 14, 0, 0.6);
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 34, range: 15, radius: 0.85, slot: 0,
            vis: { kind: 'icicle', color: '#bfeaff', size: 1.5 },
            onHit(u, p) {
              G.damage(h, u, dmg, 'magic', SK[0]); frost(G, h, u, 1);
              const a0 = Math.atan2(p.dy, p.dx);
              for (let i = -1; i <= 1; i++) {
                const a = a0 + i * 0.38;
                G.skillshot({
                  src: h, x: u.x, y: u.y, dx: Math.cos(a), dy: Math.sin(a), speed: 30, range: 6, radius: 0.6, slot: 0, skip: u, sub: true,
                  vis: { kind: 'shard', color: '#cfefff', size: 0.9 },
                  onHit(e) { G.damage(h, e, dmg * 0.5, 'magic', SK[0]); frost(G, h, e, 1); },
                });
              }
              G.fx('shards', { x: u.x, y: u.y, n: 6, color: '#cfefff', speed: 7 });
            },
          });
        },
      },
      {
        key: 'W', name: '얼음 못', icon: 'pond', type: 'ground', range: 12, radius: 4.6, cd: 12, castTime: 0.1, ind: 'circle', judge: 0,
        desc: (h) => `지정한 곳을 3.5초간 얼립니다. 안의 적은 35% 느려지고, 1초마다 ${val(h, 26, 6, 0, 0.16)}의 피해와 서리 표식을 받습니다. 빠져나오지 못하면 얼어붙습니다.`,
        cast(G, h, t) {
          const dmg = val(h, 26, 6, 0, 0.16);
          G.zone({
            src: h, x: t.x, y: t.y, radius: 4.6, delay: 0.3, dur: 3.5, tick: 0.25, vis: { kind: 'frost', color: '#9fdcff' },
            onTick(z) {
              z.n = (z.n || 0) + 1;
              const hit = z.n % 4 === 0;
              for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius)) {
                G.addBuff(u, { id: 'pondSlow', dur: 0.4, slow: 0.35, src: h, fx: 'chill', quiet: true });
                if (hit) { G.damage(h, u, dmg, 'magic', SK[1]); frost(G, h, u, 1); }
              }
              if (hit) G.fx('ring', { x: z.x, y: z.y, r0: 0.6, r1: z.radius, dur: 0.4, color: '#cfefff', w: 0.18 });
            },
          });
        },
      },
      {
        key: 'E', name: '서릿발 걸음', icon: 'slide', type: 'dir', range: 6.5, width: 2, cd: 13, castTime: 0, ind: 'dash', judge: 0,
        desc: (h) => `얼음을 타고 미끄러지며 ${val(h, 40, 10, 0, 0.3)}의 보호막을 2초간 얻습니다. 지나간 자리에는 2.5초간 살얼음이 남아 적을 35% 느리게 합니다.`,
        cast(G, h, t) {
          const ox = h.x, oy = h.y;
          G.addBuff(h, { id: 'seoriE', dur: 2, shield: val(h, 40, 10, 0, 0.3), fx: 'shield', color: '#bfeaff' });
          G.dash(h, h.x + t.dx * 6.5, h.y + t.dy * 6.5, 30, {
            trail: '#bfeaff', kind: 'slide',
            onEnd() {
              const n = 3;
              for (let i = 0; i < n; i++) {
                const k = (i + 0.5) / n;
                G.zone({
                  src: h, x: ox + (h.x - ox) * k, y: oy + (h.y - oy) * k, radius: 1.9, delay: 0, dur: 2.5, tick: 0.25, vis: { kind: 'frost', color: '#9fdcff', small: true },
                  onTick(z) { for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius)) G.addBuff(u, { id: 'pondSlow', dur: 0.4, slow: 0.35, src: h, fx: 'chill', quiet: true }); },
                });
              }
            },
          });
        },
      },
      {
        key: 'R', name: '한파', icon: 'blizzard', type: 'ground', range: 13, radius: 6.5, cd: 80, castTime: 0.2, ult: true, ind: 'circle', judge: 1.15,
        desc: (h) => `0.9초 뒤 지정한 곳에 한파가 몰아쳐 ${val(h, 180, 38, 0, 0.8)}의 피해를 주고 1.5초간 얼립니다. 얼어붙은 땅이 2초간 남아 적을 40% 느리게 합니다.`,
        cast(G, h, t) {
          const dmg = val(h, 180, 38, 0, 0.8);
          G.zone({
            src: h, x: t.x, y: t.y, radius: 6.5, delay: 0.9, dur: 2, tick: 0.25, vis: { kind: 'blizzard', color: '#bfeaff' },
            onBlast(z) {
              aoe(G, h, z.x, z.y, z.radius, dmg, 'magic', { skill: 3, big: true }, (u) => { u.removeBuff('frost'); G.freeze(h, u, u.heavy ? 0.7 : 1.5); });
              G.fx('shock', { x: z.x, y: z.y, r: 6.5, color: '#dff5ff', dur: 0.55 }); G.fx('shards', { x: z.x, y: z.y, n: 26, color: '#cfefff', speed: 13 });
              G.fx('shake', { x: z.x, y: z.y, amp: 0.8 });
              G.emit('sfx', { name: 'blizzard', x: z.x, y: z.y });
            },
            onTick(z) { for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius)) G.addBuff(u, { id: 'pondSlow', dur: 0.4, slow: 0.4, src: h, fx: 'chill', quiet: true }); },
          });
        },
      },
    ],
  };

  /* =====================================================================
     7. 나래 — 새벽 나비 (지원가)  "아군은 살리고 빠르게, 보호막은 터지는 폭탄"
     ===================================================================== */
  function grace(G, u) { G.addBuff(u, { id: 'grace', dur: 2, msPct: 0.15, fx: 'haste', color: '#fff0b0', quiet: true }); }
  H.narae = {
    id: 'narae', name: '나래', title: '새벽 나비', role: 'support', roleName: '지원가', pos: { sup: 3 }, diff: 2,
    blurb: '빛가루로 아군을 치유하고 길을 밝히는 나비 정령. 나래가 씌운 보호막은 사라질 때 터집니다.',
    feel: '아군을 살린다 · 보호막 폭탄 · 길잡이 등불',
    color: '#ffb7c8', glow: '#fff0b0', ranged: true, proj: { kind: 'mote', speed: 30, color: '#fff0b0' },
    base: { hp: 670, hpG: 88, ad: 50, adG: 2.7, as: 0.72, asG: 0.016, def: 20, defG: 2.8, ms: 7.8, range: 10.5, regen: 2 },
    build: ['glass', 'boots', 'orb', 'glass', 'charm', 'glass', 'orb', 'charm', 'heart', 'orb', 'boots', 'charm', 'heart', 'boots', 'heart', 'bark'],
    passive: { name: '빛가루', icon: 'dust', desc: (h) => `나래의 치유나 보호막을 받은 아군은 2초간 15% 빨라집니다. 기본 공격이 적중하면 근처에서 가장 다친 아군 영웅을 ${val(h, 14, 3.5, 0, 0.12)} 치유합니다.` },
    onAttack(G, h) {
      let low = null, lr = 0.999;
      for (const a of G.alliesIn(h.team, h.x, h.y, 11, true)) { const r = a.hp / a.maxHp; if (r < lr) { lr = r; low = a; } }
      if (low) G.heal(h, low, val(h, 14, 3.5, 0, 0.12), { quiet: true });
    },
    abilities: [
      {
        key: 'Q', name: '빛가루 길', icon: 'dustline', type: 'dir', range: 16, width: 2.4, cd: 7, castTime: 0.2, ind: 'line',
        desc: (h) => `빛가루를 날립니다. 지나가는 아군 영웅을 ${val(h, 70, 15.5, 0, 0.4)} 치유하고, 처음 닿은 적에게 ${val(h, 62, 13, 0, 0.55)}의 피해를 주며 1.5초간 30% 느리게 합니다.`,
        cast(G, h, t) {
          const healAmt = val(h, 70, 15.5, 0, 0.4), dmg = val(h, 62, 13, 0, 0.55);
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 30, range: 16, radius: 1.2, slot: 0, allies: true,
            vis: { kind: 'dust', color: '#fff0b0', size: 1.6 },
            onAlly(a) { if (a === h || !a.isHero) return; G.heal(h, a, healAmt); grace(G, a); G.fx('heal', { x: a.x, y: a.y, follow: a }); },
            onHit(u) { G.damage(h, u, dmg, 'magic', SK[0]); G.slow(h, u, 0.3, 1.5); },
          });
        },
      },
      {
        key: 'W', name: '날개 보호막', icon: 'wing', type: 'ally', range: 12, radius: 3.6, cd: 8, castTime: 0, ind: 'ally',
        desc: (h) => `아군 영웅(커서에 가장 가까운 아군, 없으면 자신)에게 3초간 ${val(h, 96, 23, 0, 0.5)}의 보호막을 씌웁니다. 보호막이 깨지거나 사라질 때 터져 주변 적에게 ${val(h, 40, 9, 0, 0.3)}의 피해를 주고 1초간 30% 느리게 합니다.`,
        cast(G, h, t) {
          const u = (t.unit && !t.unit.dead) ? t.unit : h, dmg = val(h, 40, 9, 0, 0.3);
          G.addBuff(u, {
            id: 'naraeW', dur: 3, shield: val(h, 96, 23, 0, 0.5), fx: 'wing', color: '#ffd9e2', src: h,
            onExpire(a) {
              if (a.dead) return;
              aoe(G, h, a.x, a.y, 3.6, dmg, 'magic', SK[1], (e) => G.slow(h, e, 0.3, 1));
              G.fx('shock', { x: a.x, y: a.y, r: 3.6, color: '#ffe3ea', dur: 0.35 }); G.fx('burst', { x: a.x, y: a.y, n: 14, color: '#fff0b0', speed: 10, life: 0.45 });
              G.emit('sfx', { name: 'wingburst', x: a.x, y: a.y });
            },
          });
          grace(G, u);
          if (u !== h) G.fx('line', { x1: h.x, y1: h.y, x2: u.x, y2: u.y, color: '#ffe3ea', dur: 0.3, w: 0.35 });
        },
      },
      {
        key: 'E', name: '길잡이 등불', icon: 'ward', type: 'ground', range: 13, radius: 11, cd: 18, castTime: 0.1, ind: 'circle',
        desc: () => '지정한 곳에 14초간 등불을 띄웁니다. 주변을 밝혀 수풀과 연막 속까지 보여 주고, 근처 아군의 공격 속도를 12% 올립니다. (최대 2개)',
        cast(G, h, t) {
          const mine = G.wards.filter(w => w.src === h);
          if (mine.length >= 2) mine[0].until = G.t;
          G.wards.push({ src: h, team: h.team, x: t.x, y: t.y, r: 11, reveal: 7, until: G.t + 14, born: G.t, id: G.nextId++ });
          G.fx('ring', { x: t.x, y: t.y, r0: 0.5, r1: 7, dur: 0.5, color: '#fff0b0', w: 0.25 });
          G.emit('sfx', { name: 'ward', x: t.x, y: t.y });
        },
      },
      {
        key: 'R', name: '새벽빛', icon: 'dawn', type: 'self', radius: 10, cd: 85, castTime: 0.25, ult: true, ind: 'self',
        desc: (h) => `주변 아군 영웅의 체력을 ${val(h, 146, 31, 0, 0.5)} 회복시키고 걸려 있던 둔화·기절·속박을 풀어 줍니다. 4초간 이동 속도와 공격 속도가 25% 오릅니다. 주변 적은 1.5초간 30% 느려집니다.`,
        cast(G, h) {
          const amt = val(h, 146, 31, 0, 0.5);
          for (const a of G.alliesIn(h.team, h.x, h.y, 10, true)) {
            G.cleanse(a); G.heal(h, a, amt);
            G.addBuff(a, { id: 'dawn', dur: 4, msPct: 0.25, asPct: 0.25, fx: 'dawn', color: '#fff0b0' });
            G.fx('pillar', { x: a.x, y: a.y, r: 1.6, color: '#fff0b0', dur: 0.6, follow: a });
          }
          for (const u of G.enemiesIn(h.team, h.x, h.y, 10)) G.slow(h, u, 0.3, 1.5);
          G.fx('ring', { x: h.x, y: h.y, r0: 1, r1: 10, dur: 0.6, color: '#fff0b0', w: 0.5 });
          G.fx('flash', { x: h.x, y: h.y, r: 10, color: '#fff0b0', dur: 0.5 });
          G.emit('sfx', { name: 'dawn', x: h.x, y: h.y });
        },
      },
    ],
  };

  /* =====================================================================
     8. 아귀 — 심연 낚시꾼 (끌어오는 선봉 · 근접)  "낚아채고, 내던지고, 소용돌이에 가둔다"
     ===================================================================== */
  function bait(G, h, u) { if (!u.dead) G.addBuff(u, { id: 'bait', dur: 2.2, dmgTaken: 0.12, src: h, fx: 'bait', color: '#7dffd9' }); }
  H.agwi = {
    id: 'agwi', name: '아귀', title: '심연 낚시꾼', role: 'catcher', roleName: '낚시꾼', pos: { sup: 3, top: 2, jg: 2 }, diff: 2,
    blurb: '머리에 달린 등불로 적을 홀리고 낚싯바늘로 끌어오는 심연의 낚시꾼. 한 명만 낚으면 싸움이 시작됩니다.',
    feel: '낚싯바늘 한 방 · 적을 집어 던진다',
    color: '#2f5c68', glow: '#7dffd9', ranged: false,
    base: { hp: 840, hpG: 106, ad: 58, adG: 3.0, as: 0.62, asG: 0.012, def: 30, defG: 3.4, ms: 7.3, range: 2.8, regen: 4 },
    build: ['heart', 'boots', 'glass', 'heart', 'bark', 'glass', 'heart', 'bark', 'charm', 'glass', 'bark', 'charm', 'boots', 'charm', 'boots', 'blade'],
    passive: { name: '입질', icon: 'bait', desc: () => '아귀가 끌어오거나 내던진 적은 2.2초간 모든 피해를 12% 더 받습니다.' },
    abilities: [
      {
        key: 'Q', name: '낚싯바늘', icon: 'hook', type: 'dir', range: 15.5, width: 1.6, cd: 12, castTime: 0.25, ind: 'line',
        desc: (h) => `낚싯바늘을 던져 처음 걸린 적에게 ${val(h, 60, 14, 0.4)}의 피해를 주고 내 앞까지 끌어옵니다.`,
        cast(G, h, t) {
          const dmg = val(h, 60, 14, 0.4);
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 28, range: 15.5, radius: 0.8, slot: 0,
            vis: { kind: 'hook', color: '#7dffd9', size: 1.3, chain: true },
            onHit(u) {
              G.damage(h, u, dmg, 'phys', { skill: 0, big: true });
              if (u.dead || u.heavy) return;
              const d = Math.hypot(u.x - h.x, u.y - h.y) || 1;
              G.pullTo(h, u, h.x + (u.x - h.x) / d * (h.r + u.r + 0.5), h.y + (u.y - h.y) / d * (h.r + u.r + 0.5), 30, { stun: 0.4, chain: true });
              bait(G, h, u);
              if (u.isHero) { G.fx('text', { x: u.x, y: u.y, text: '낚았다!', color: '#7dffd9', size: 1.2 }); G.emit('sfx', { name: 'hooked', x: u.x, y: u.y }); }
            },
          });
        },
      },
      {
        key: 'W', name: '미끼등', icon: 'lure', type: 'self', radius: 5.5, cd: 14, castTime: 0.35, ind: 'self',
        desc: (h) => `머리의 등불을 번쩍여 주변 적에게 ${val(h, 40, 10, 0.3)}의 피해를 주고 1.1초간 홀립니다(나를 향해 걸어와 때림). ${val(h, 50, 14, 0, 0, 0.08)}의 보호막을 3초간 얻습니다.`,
        cast(G, h) {
          aoe(G, h, h.x, h.y, 5.5, val(h, 40, 10, 0.3), 'magic', SK[1], (u) => G.taunt(h, u, 1.1));
          G.addBuff(h, { id: 'agwiW', dur: 3, shield: val(h, 50, 14, 0, 0, 0.08), fx: 'shield', color: '#7dffd9' });
          G.fx('flash', { x: h.x, y: h.y, r: 6, color: '#b8ffe9', dur: 0.35 }); G.fx('ring', { x: h.x, y: h.y, r0: 0.6, r1: 5.5, dur: 0.35, color: '#7dffd9', w: 0.35 });
        },
      },
      {
        key: 'E', name: '내던지기', icon: 'fling', type: 'dir', range: 7, width: 2.6, cd: 11, castTime: 0.15, ind: 'fling', grab: 3.8,
        desc: (h) => `가까이 있는 적 하나를 집어 커서 쪽으로 내던집니다. 떨어진 자리에서 ${val(h, 60, 13, 0.5)}의 피해를 주고 1.5초간 40% 느리게 합니다. 떨어진 곳 주변의 적도 절반의 피해를 입습니다.`,
        cast(G, h, t) {
          let best = null, bs = Infinity;
          for (const u of G.enemiesIn(h.team, h.x, h.y, 3.8)) { if (u.heavy) continue; const s = U.du(u, h) - (u.isHero ? 5 : 0); if (s < bs) { bs = s; best = u; } }
          if (!best) { h.cds[2] = Math.min(h.cds[2], 2); G.fx('slash', { x: h.x, y: h.y, ang: h.facing, r: 3.2, arc: 1.6, color: '#7dffd9', dur: 0.2 }); return; }
          const dmg = val(h, 60, 13, 0.5), u = best;
          bait(G, h, u);
          G.toss(h, u, h.x + t.dx * 7, h.y + t.dy * 7, 0.5, () => {
            if (u.dead) return;
            G.damage(h, u, dmg, 'phys', { skill: 2, big: true }); G.slow(h, u, 0.4, 1.5);
            for (const e of G.enemiesIn(h.team, u.x, u.y, 2.6)) if (e !== u) G.damage(h, e, dmg * 0.5, 'phys', SK[2]);
            G.fx('shock', { x: u.x, y: u.y, r: 2.6, color: '#b8ffe9', dur: 0.3 }); G.fx('shards', { x: u.x, y: u.y, n: 8, color: '#8fb8b0', speed: 8 });
            G.fx('shake', { x: u.x, y: u.y, amp: 0.4 });
            G.emit('sfx', { name: 'slam', x: u.x, y: u.y });
          });
          G.emit('sfx', { name: 'fling', x: h.x, y: h.y });
        },
      },
      {
        key: 'R', name: '소용돌이', icon: 'whirl', type: 'ground', range: 12, radius: 7, cd: 85, castTime: 0.3, ult: true, ind: 'circle',
        desc: (h) => `지정한 곳에 2.8초간 소용돌이를 일으킵니다. 적을 한가운데로 빨아들이며 0.4초마다 ${val(h, 22, 5, 0.12)}의 피해를 줍니다. 마지막에 솟구쳐 한가운데의 적에게 ${val(h, 100, 22, 0.3)}의 피해를 주고 0.9초간 띄웁니다.`,
        cast(G, h, t) {
          const tick = val(h, 22, 5, 0.12), end = val(h, 100, 22, 0.3);
          G.zone({
            src: h, x: t.x, y: t.y, radius: 7, delay: 0.3, dur: 2.8, tick: 0.4, pull: 5.2, vis: { kind: 'whirl', color: '#7dffd9' },
            onTick(z) { aoe(G, h, z.x, z.y, z.radius, tick, 'magic', SK[3]); },
            onEnd(z) {
              aoe(G, h, z.x, z.y, 4, end, 'magic', { skill: 3, big: true }, (u) => G.knockup(h, u, 0.9));
              G.fx('pillar', { x: z.x, y: z.y, r: 3.4, color: '#b8ffe9', dur: 0.6 }); G.fx('shock', { x: z.x, y: z.y, r: 4.5, color: '#b8ffe9', dur: 0.45 });
              G.fx('burst', { x: z.x, y: z.y, n: 24, color: '#7dffd9', speed: 13, life: 0.6 }); G.fx('shake', { x: z.x, y: z.y, amp: 0.7 });
              G.emit('sfx', { name: 'geyser', x: z.x, y: z.y });
            },
          });
        },
      },
    ],
  };

  TW.HeroOrder = ['moru', 'hanui', 'geumeum', 'bulti', 'chorong', 'seori', 'narae', 'agwi'];
  TW.MenuOrder = ['moru', 'bulti', 'seori', 'hanui', 'geumeum', 'chorong', 'narae', 'agwi'];      // 고르는 화면의 줄: 손맛을 다듬은 셋이 앞에 선다
  for (const id of TW.HeroOrder) { const hd = H[id]; hd.abilities.forEach((ab, i) => { ab.slot = i; ab.hero = id; }); }

  /* 자리(포지션): 윗길 / 정글 / 가운뎃길 / 아랫길 사수 / 아랫길 지원 */
  TW.POS = ['top', 'jg', 'mid', 'carry', 'sup'];
  TW.POS_NAME = { top: '윗길', jg: '정글', mid: '가운뎃길', carry: '아랫길', sup: '아랫길(지원)' };
  TW.POS_LANE = { top: C.TOP, jg: -1, mid: C.MID, carry: C.BOT, sup: C.BOT };
  TW.bestPos = function (heroId) { const p = H[heroId].pos; let best = 'mid', bs = -1; for (const k of TW.POS) if ((p[k] || 0) > bs) { bs = p[k] || 0; best = k; } return best; };

  /* 난이도(상대 봇): think = 반응 주기, aimErr = 조준 오차, dodge = 스킬 피하는 확률 */
  TW.Difficulty = {
    easy:   { name: '쉬움',   think: 0.4,  aimErr: 0.3,  lead: 0.35, aggro: 0.8,  dodge: 0.15, combo: 0.4, cs: 0.55, dmg: 0.9,  gold: 0.9 },
    normal: { name: '보통',   think: 0.25, aimErr: 0.13, lead: 0.75, aggro: 1.0,  dodge: 0.45, combo: 0.8, cs: 0.8,  dmg: 0.95, gold: 0.95 },   // 12차: 피해·골드 1.0 → 0.95 (상대 팀에만 — 봇 대전은 양쪽 같게)
    hard:   { name: '어려움', think: 0.17, aimErr: 0.05, lead: 1.0,  aggro: 1.08, dodge: 0.75, combo: 1.0, cs: 0.93, dmg: 1.0,  gold: 1.05 },
  };
})();
