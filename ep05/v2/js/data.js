/* 청홍대전 — data: 영웅 8명, 스킬(단계별 성장), 아이템(조합 트리) */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const C = AOS.C;

  /* 스킬 단계: 아직 배우지 않은 스킬은 1단계 수치로 설명을 보여 준다 */
  const rk = (h, i) => Math.max(1, (h.ranks && h.ranks[i]) || 1);
  AOS.rankOf = rk;
  /* 수치 계산: 1단계 기본값 + 단계당 증가 + 공격력/주문력/최대체력 계수 */
  const v = (h, i, base, per, adR, apR, hpR) =>
    Math.round(base + per * (rk(h, i) - 1) + (adR || 0) * h.ad + (apR || 0) * h.ap + (hpR || 0) * h.maxHp);
  AOS.val = v;
  /* 단계별 재사용 대기시간 (숫자 또는 배열) */
  AOS.abCd = (ab, rank) => (Array.isArray(ab.cd) ? ab.cd[Math.max(0, Math.min(ab.cd.length - 1, (rank || 1) - 1))] : ab.cd);
  /* 치유·보호막 증폭(아이템) 반영 */
  const amp = (h, x) => Math.round(x * (1 + (h.healAmp || 0)));

  /* ---------- 아이템 ----------
     tier 1(기초) → 2(중급) → 3(완성). from = 재료. 재료를 갖고 있으면 그만큼 싸게 사고 재료는 사라진다. */
  AOS.Items = {
    // 이동
    boots:    { name: '가죽 장화',     cat: 'move', tier: 1, cost: 350,  icon: 'boot',   color: '#7fd0ff', msFlat: 0.6 },
    striders: { name: '질풍 장화',     cat: 'move', tier: 2, from: 'boots', cost: 850, icon: 'boot', color: '#8ff0d0', msFlat: 1.1,
                pas: 'ooc', pname: '가벼운 발걸음', ptext: '5초 동안 싸우지 않으면 이동 속도가 12% 더 빨라집니다.' },
    treads:   { name: '수호 군화',     cat: 'move', tier: 2, from: 'boots', cost: 850, icon: 'boot', color: '#c7d3e8', msFlat: 0.9, def: 20,
                pas: 'tenacity', pname: '굳건함', ptext: '둔화·속박·기절의 지속 시간이 25% 줄어듭니다.' },
    // 공격력
    blade:    { name: '수련생의 검',   cat: 'ad', tier: 1, cost: 400,  icon: 'sword',  color: '#ffb36b', ad: 12 },
    saber:    { name: '강철 세이버',   cat: 'ad', tier: 2, from: 'blade', cost: 1100, icon: 'sword', color: '#ff9d5c', ad: 35 },
    sickle:   { name: '붉은 낫',       cat: 'ad', tier: 2, from: 'blade', cost: 1150, icon: 'scythe', color: '#ff6b81', ad: 22, lifesteal: 0.10 },
    breaker:  { name: '성문 파쇄검',   cat: 'ad', tier: 3, from: 'saber', cost: 2450, icon: 'fang',  color: '#ff7d4d', ad: 70, pen: 0.3,
                pas: 'pierce', pname: '파쇄', ptext: '기본 공격과 물리 스킬이 대상 방어력의 30%를 무시합니다.' },
    judge:    { name: '단죄의 대검',   cat: 'ad', tier: 3, from: 'saber', cost: 2500, icon: 'gsword', color: '#ffd24d', ad: 75,
                pas: 'execute', pname: '단죄', ptext: '체력이 40% 이하인 적에게 주는 모든 피해가 18% 증가합니다.' },
    reaver:   { name: '핏빛 수확자',   cat: 'ad', tier: 3, from: 'sickle', cost: 2400, icon: 'scythe', color: '#ff4d6a', ad: 55, lifesteal: 0.18,
                pas: 'thirst', pname: '갈증', ptext: '내 체력이 50% 이하일 때 생명력 흡수가 2배가 됩니다.' },
    // 공격 속도
    gloves:   { name: '날랜 장갑',     cat: 'as', tier: 1, cost: 400,  icon: 'glove',  color: '#b6f2c4', asPct: 0.15 },
    hatchet:  { name: '쌍날 손도끼',   cat: 'as', tier: 2, from: 'gloves', cost: 1100, icon: 'axe', color: '#ffc27a', asPct: 0.30, ad: 15 },
    trigale:  { name: '삼연풍 활',     cat: 'as', tier: 3, from: 'hatchet', cost: 2400, icon: 'bow', color: '#9dffc0', asPct: 0.50, ad: 25,
                pas: 'third', pname: '삼연격', ptext: '세 번째 기본 공격마다 30 + 공격력의 35%만큼 추가 마법 피해를 줍니다.' },
    plume:    { name: '질풍의 깃',     cat: 'as', tier: 3, from: 'hatchet', cost: 2300, icon: 'wing', color: '#b6f2c4', asPct: 0.55, ad: 15, msPct: 0.06,
                pas: 'hitrun', pname: '치고 빠지기', ptext: '기본 공격이 적중하면 2초간 이동 속도가 12% 증가합니다.' },
    // 주문력
    shard:    { name: '마력 조각',     cat: 'ap', tier: 1, cost: 400,  icon: 'gem',    color: '#b59bff', ap: 22 },
    codex:    { name: '비전 고서',     cat: 'ap', tier: 2, from: 'shard', cost: 1100, icon: 'book', color: '#c9a2ff', ap: 50, mp: 150 },
    prism:    { name: '공명 프리즘',   cat: 'ap', tier: 2, from: 'shard', cost: 1100, icon: 'prism', color: '#8fd3ff', ap: 35, cdr: 0.15 },
    orb:      { name: '태초의 보주',   cat: 'ap', tier: 3, from: 'codex', cost: 2550, icon: 'orb',   color: '#e08bff', ap: 125,
                pas: 'amp', pname: '증폭', ptext: '스킬로 주는 피해가 10% 증가합니다.' },
    cinder:   { name: '잿불 왕관',     cat: 'ap', tier: 3, from: 'codex', cost: 2400, icon: 'crown', color: '#ff9340', ap: 85, mp: 200,
                pas: 'burn', pname: '잔불', ptext: '스킬에 맞은 적은 3초에 걸쳐 30 + 주문력의 20%만큼 추가 마법 피해를 입습니다.' },
    chrono:   { name: '태엽 장치',     cat: 'ap', tier: 3, from: 'prism', cost: 2300, icon: 'gear',  color: '#7fd0ff', ap: 70, cdr: 0.25, mp: 250, mpRegen: 3 },
    grail:    { name: '새벽 성배',     cat: 'ap', tier: 3, from: 'prism', cost: 2150, icon: 'cup',   color: '#ffe680', ap: 55, cdr: 0.20, mpRegen: 4,
                pas: 'mend', pname: '은총', ptext: '내가 주는 치유와 보호막이 25% 증가합니다.' },
    // 방어
    charm:    { name: '생명 부적',     cat: 'def', tier: 1, cost: 400,  icon: 'charm',  color: '#ff8fa3', hp: 130 },
    heart:    { name: '바위 심장',     cat: 'def', tier: 2, from: 'charm', cost: 1100, icon: 'heart', color: '#ff8fa3', hp: 380, hpRegen: 5 },
    plate:    { name: '판금 흉갑',     cat: 'def', tier: 2, from: 'charm', cost: 1100, icon: 'armor', color: '#c7d3e8', def: 40, hp: 150 },
    colossus: { name: '거암의 심장',   cat: 'def', tier: 3, from: 'heart', cost: 2400, icon: 'heart', color: '#ff5f7e', hp: 850, hpRegen: 10,
                pas: 'regen', pname: '재생', ptext: '6초 동안 피해를 받지 않으면 매초 최대 체력의 1.5%를 추가로 회복합니다.' },
    bulwark:  { name: '고슴도치 갑주', cat: 'def', tier: 3, from: 'plate', cost: 2350, icon: 'thorn', color: '#9fe0a0', def: 80, hp: 350,
                pas: 'thorns', pname: '되갚기', ptext: '나를 기본 공격한 적에게 15 + 방어력의 15%만큼 마법 피해를 돌려줍니다.' },
    aegis:    { name: '여명의 방패',   cat: 'def', tier: 3, from: 'plate', cost: 2400, icon: 'shield', color: '#ffe08a', hp: 500, def: 45,
                pas: 'laststand', pname: '버티기', ptext: '체력이 30% 아래로 떨어지면 4초간 최대 체력의 18%만큼 보호막을 얻습니다. (재사용 60초)' },
  };
  /* 상점 배치: 줄(분류) → 가지(중급 아이템 하나와 그 완성품들) */
  AOS.ShopRows = [
    { cat: 'ad',   name: '공격력',    root: 'blade',  branches: [['saber', 'breaker', 'judge'], ['sickle', 'reaver']] },
    { cat: 'as',   name: '공격 속도', root: 'gloves', branches: [['hatchet', 'trigale', 'plume']] },
    { cat: 'ap',   name: '주문력',    root: 'shard',  branches: [['codex', 'orb', 'cinder'], ['prism', 'chrono', 'grail']] },
    { cat: 'def',  name: '방어',      root: 'charm',  branches: [['heart', 'colossus'], ['plate', 'bulwark', 'aegis']] },
    { cat: 'move', name: '이동',      root: 'boots',  branches: [['striders'], ['treads']] },
  ];
  AOS.ItemOrder = [];
  for (const row of AOS.ShopRows) { AOS.ItemOrder.push(row.root); for (const b of row.branches) for (const id of b) AOS.ItemOrder.push(id); }
  const STAT_TEXT = [
    ['ad', '공격력', 1], ['ap', '주문력', 1], ['hp', '체력', 1], ['def', '방어력', 1], ['mp', '마나', 1],
    ['asPct', '공격 속도', 100, '%'], ['msFlat', '이동 속도', 1], ['msPct', '이동 속도', 100, '%'], ['cdr', '재사용 대기시간 감소', 100, '%'],
    ['lifesteal', '생명력 흡수', 100, '%'], ['pen', '방어 관통', 100, '%'], ['hpRegen', '초당 체력 재생', 1], ['mpRegen', '초당 마나 재생', 1],
  ];
  for (const id of AOS.ItemOrder) {
    const it = AOS.Items[id]; it.id = id;
    const parts = [];
    for (const s of STAT_TEXT) if (it[s[0]]) parts.push(s[1] + ' +' + (Math.round(it[s[0]] * s[2] * 10) / 10) + (s[3] || ''));
    it.desc = parts.join(' · ');
    it.tierName = it.tier === 1 ? '기초' : it.tier === 2 ? '중급' : '완성';
  }
  /* 아이템 도우미 */
  const owns = (h, id) => h.items.indexOf(id) >= 0;
  /* id가 이미 있거나, 가진 아이템이 id에서 조합된 것이면 true */
  AOS.itemCovered = function (h, id) {
    for (const own of h.items) { let cur = own; while (cur) { if (cur === id) return true; cur = AOS.Items[cur].from; } }
    return false;
  };
  /* 실제 지불 금액과 소모되는 재료 */
  AOS.itemPrice = function (h, id) {
    const it = AOS.Items[id]; let cost = it.cost, use = null, cur = it.from;
    while (cur) { if (owns(h, cur)) { cost -= AOS.Items[cur].cost; use = cur; break; } cur = AOS.Items[cur].from; }
    return { cost, use };
  };
  /* 추천 빌드에서 다음에 살 것: { id: 지금 노릴 단계, goal: 최종 목표 } */
  AOS.nextBuy = function (h) {
    const hasBoots = h.items.some(x => AOS.Items[x].cat === 'move');
    for (const goal of h.hd.build) {
      if (AOS.itemCovered(h, goal)) continue;
      const gi = AOS.Items[goal];
      if (gi.cat === 'move' && hasBoots && !AOS.itemPrice(h, goal).use) continue;
      const pr = AOS.itemPrice(h, goal);
      if (!pr.use && h.items.length >= 6) continue;          // 빈 칸이 없으면 조합만 가능
      // 목표를 바로 살 수 없으면 아직 없는 재료 중 가장 아래 단계부터
      let step = goal, cur = gi.from;
      while (cur && !owns(h, cur)) { step = cur; cur = AOS.Items[cur].from; }
      return { id: step, goal, price: AOS.itemPrice(h, step).cost, goalPrice: pr.cost };
    }
    return null;
  };

  /* ---------- 공용 스킬 조각 ---------- */
  function aoeDamage(G, src, x, y, r, dmg, kind, each) {
    const list = G.enemiesIn(src.team, x, y, r);
    for (const u of list) { G.damage(src, u, dmg, kind); if (each) each(u); }
    return list;
  }
  const slow = (G, u, src, pct, dur) => G.addBuff(u, { id: 'slow', slow: pct, dur, src, fx: 'slow' });
  const stun = (G, u, src, dur) => G.addBuff(u, { id: 'stun', stun: true, dur, src, fx: 'stun' });
  const root = (G, u, src, dur) => G.addBuff(u, { id: 'root', root: true, dur, src, fx: 'root' });
  const pct = (h, i, base, per) => base + per * (rk(h, i) - 1);

  /* ---------- 영웅 ----------
     open: 처음 세 번 찍는 순서, prio: 그 뒤 우선순위(먼저 끝까지 올릴 스킬부터). 봇과 '추천' 표시가 함께 쓴다. */
  const H = AOS.Heroes = {};

  /* 1. 가온 — 수호 기사 (탱커) */
  H.gaon = {
    id: 'gaon', name: '가온', title: '수호 기사', role: 'tank', roleName: '탱커', lane: C.TOP, diff: 1,
    blurb: '방패로 돌진해 적을 기절시키고, 아군 앞에서 전선을 지키는 든든한 선봉장.',
    color: '#9fb4d8', ranged: false,
    base: { hp: 780, hpG: 105, mp: 300, mpG: 28, ad: 58, adG: 3.2, as: 0.66, asG: 0.02, def: 36, defG: 3.8, ms: 7.5, range: 2.7, hpRegen: 3.0, mpRegen: 3.2 },
    build: ['charm', 'boots', 'bulwark', 'treads', 'colossus', 'aegis', 'judge', 'reaver'],
    open: [0, 2, 1], prio: [3, 2, 0, 1],
    abilities: [
      {
        key: 'Q', name: '방패 돌진', icon: 'dash', type: 'dir', range: 9, width: 1.6, cd: 9, cost: 45, castTime: 0,
        desc: (h) => `방패를 앞세워 돌진합니다. 부딪힌 적에게 ${v(h, 0, 70, 50, 0.5)}의 피해를 주고, 처음 부딪힌 영웅을 1초간 기절시키며 멈춥니다.`,
        ai: { use: 'gapclose', range: 8.5 },
        cast(G, h, t) {
          const dmg = v(h, 0, 70, 50, 0.5);
          G.dash(h, h.x + t.dx * 9, h.y + t.dy * 9, 30, {
            hitR: 1.7, stopOnHero: true, trail: '#cfe3ff',
            onHit(u) {
              G.damage(h, u, dmg, 'phys'); stun(G, u, h, 1.0);
              G.fx('ring', { x: u.x, y: u.y, r0: 0.5, r1: 3.2, dur: 0.3, color: '#ffe9a8' });
              G.fx('burst', { x: u.x, y: u.y, n: 10, color: '#fff2c4', speed: 9, life: 0.35 });
            },
          });
        },
      },
      {
        key: 'W', name: '철벽 태세', icon: 'shield', type: 'self', cd: 14, cost: 50, castTime: 0,
        desc: (h) => `4초간 ${amp(h, v(h, 1, 90, 75, 0, 0, 0.08))}의 피해를 흡수하는 보호막을 두르고 방어력이 ${pct(h, 1, 25, 8)} 증가합니다.`,
        ai: { use: 'defensive' },
        cast(G, h) {
          G.addBuff(h, { id: 'gaonW', dur: 4, shield: amp(h, v(h, 1, 90, 75, 0, 0, 0.08)), def: pct(h, 1, 25, 8), fx: 'shield', color: '#bfe0ff' });
          G.fx('ring', { x: h.x, y: h.y, r0: 0.5, r1: 2.6, dur: 0.35, color: '#bfe0ff' });
        },
      },
      {
        key: 'E', name: '대지 강타', icon: 'quake', type: 'self', radius: 5, cd: 8, cost: 40, castTime: 0.15,
        desc: (h) => `땅을 내리쳐 주변 적에게 ${v(h, 2, 60, 46, 0.4, 0, 0.03)}의 피해를 주고 2초간 40% 둔화시킵니다.`,
        ai: { use: 'selfAoe', radius: 4.4, farm: true },
        cast(G, h) {
          aoeDamage(G, h, h.x, h.y, 5, v(h, 2, 60, 46, 0.4, 0, 0.03), 'phys', (u) => slow(G, u, h, 0.4, 2));
          G.fx('quake', { x: h.x, y: h.y, r: 5, color: '#d9b66a' });
          G.fx('shake', { x: h.x, y: h.y, amp: 0.25 });
        },
      },
      {
        key: 'R', name: '수호자의 포효', icon: 'roar', type: 'self', radius: 7.5, cd: [70, 62, 54], cost: 100, castTime: 0.35, ult: true,
        desc: (h) => `포효하여 주변 적에게 ${v(h, 3, 270, 120, 0.6)}의 피해를 주고 1.5초간 기절시킵니다. 주변 아군 영웅은 ${amp(h, v(h, 3, 200, 100))}의 보호막을 얻습니다.`,
        ai: { use: 'selfAoe', radius: 6.4, ult: true },
        cast(G, h) {
          aoeDamage(G, h, h.x, h.y, 7.5, v(h, 3, 270, 120, 0.6), 'phys', (u) => stun(G, u, h, 1.5));
          for (const a of G.alliesIn(h.team, h.x, h.y, 7.5, true)) {
            G.addBuff(a, { id: 'gaonR', dur: 4, shield: amp(h, v(h, 3, 200, 100)), fx: 'shield', color: '#ffe08a' });
          }
          G.fx('nova', { x: h.x, y: h.y, r: 7.5, color: '#ffd76a' });
          G.fx('shake', { x: h.x, y: h.y, amp: 0.5 });
        },
      },
    ],
  };

  /* 2. 리라 — 바람 궁수 (원거리 딜러) */
  H.lira = {
    id: 'lira', name: '리라', title: '바람 궁수', role: 'marksman', roleName: '원거리 딜러', lane: C.BOT, diff: 1,
    blurb: '긴 사거리와 빠른 연사로 꾸준히 피해를 넣는 궁수. 후반으로 갈수록 강해집니다.',
    color: '#59c98a', ranged: true, proj: { kind: 'arrow', speed: 36, color: '#d8ffe4' },
    base: { hp: 600, hpG: 82, mp: 320, mpG: 32, ad: 60, adG: 3.6, as: 0.72, asG: 0.032, def: 22, defG: 3.0, ms: 7.7, range: 10.5, hpRegen: 1.8, mpRegen: 3.4 },
    build: ['blade', 'boots', 'hatchet', 'striders', 'trigale', 'reaver', 'breaker', 'plume'],
    open: [0, 1, 2], prio: [3, 0, 1, 2],
    abilities: [
      {
        key: 'Q', name: '관통 화살', icon: 'arrow', type: 'dir', range: 20, width: 0.9, cd: 7, cost: 45, castTime: 0.15,
        desc: (h) => `일직선으로 날아가 모든 적을 관통하는 화살을 쏩니다. ${v(h, 0, 65, 54, 0.9)}의 피해를 주며, 적을 관통할 때마다 피해가 15%씩 줄어듭니다.`,
        ai: { use: 'skillshot', range: 18.5, speed: 42, pierce: true, farm: true },
        cast(G, h, t) {
          const dmg = v(h, 0, 65, 54, 0.9); let n = 0;
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 42, range: 20, radius: 0.85, pierce: true,
            vis: { kind: 'arrow', color: '#9dffc0', size: 1.5 },
            onHit(u) { G.damage(h, u, dmg * Math.max(0.55, 1 - 0.15 * n), 'phys'); n++; },
          });
        },
      },
      {
        key: 'W', name: '질풍 속사', icon: 'haste', type: 'self', cd: 14, cost: 40, castTime: 0,
        desc: (h) => `4.5초간 공격 속도가 ${pct(h, 1, 35, 10)}% 증가합니다.`,
        ai: { use: 'steroid' },
        cast(G, h) {
          G.addBuff(h, { id: 'liraW', dur: 4.5, asPct: pct(h, 1, 35, 10) / 100, fx: 'haste', color: '#9dffc0' });
          G.fx('ring', { x: h.x, y: h.y, r0: 0.4, r1: 2.4, dur: 0.3, color: '#9dffc0' });
        },
      },
      {
        key: 'E', name: '바람 걸음', icon: 'step', type: 'dir', range: 7, width: 1.2, cd: [11, 10, 9, 8], cost: 35, castTime: 0,
        desc: (h) => `바람을 타고 짧게 도약합니다. 다음 기본 공격이 ${v(h, 2, 30, 30, 0.4)}의 추가 피해를 줍니다.`,
        ai: { use: 'mobility', range: 7 },
        cast(G, h, t) {
          G.dash(h, h.x + t.dx * 7, h.y + t.dy * 7, 34, { trail: '#9dffc0' });
          G.addBuff(h, { id: 'liraE', dur: 4, empower: v(h, 2, 30, 30, 0.4), fx: 'empower', color: '#9dffc0' });
        },
      },
      {
        key: 'R', name: '화살 폭풍', icon: 'rain', type: 'ground', range: 18, radius: 6.5, cd: [75, 66, 57], cost: 100, castTime: 0.25, ult: true,
        desc: (h) => `지정한 지역에 3초간 화살비를 퍼붓습니다. 0.5초마다 ${v(h, 3, 70, 32, 0.28)}의 피해를 주고 적을 30% 둔화시킵니다.`,
        ai: { use: 'ground', range: 18, radius: 6.5, delay: 0.3, ult: true },
        cast(G, h, t) {
          const dmg = v(h, 3, 70, 32, 0.28);
          G.zone({
            src: h, x: t.x, y: t.y, radius: 6.5, delay: 0.3, dur: 3, tick: 0.5, vis: { kind: 'arrows', color: '#9dffc0' },
            onTick(z) { for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius)) { G.damage(h, u, dmg, 'phys'); slow(G, u, h, 0.3, 0.8); } },
          });
        },
      },
    ],
  };

  /* 3. 솔라 — 화염 술사 (마법사) */
  H.sola = {
    id: 'sola', name: '솔라', title: '화염 술사', role: 'mage', roleName: '마법사', lane: C.MID, diff: 2,
    blurb: '폭발하는 화염구와 불기둥으로 넓은 범위를 불태우는 마법사. 유성 한 방이 전세를 뒤집습니다.',
    color: '#ff7a45', ranged: true, proj: { kind: 'fire', speed: 30, color: '#ffb066' },
    base: { hp: 590, hpG: 80, mp: 400, mpG: 40, ad: 50, adG: 2.6, as: 0.66, asG: 0.018, def: 20, defG: 2.8, ms: 7.5, range: 9.5, hpRegen: 1.7, mpRegen: 4.6 },
    build: ['shard', 'boots', 'codex', 'striders', 'cinder', 'orb', 'chrono', 'aegis'],
    open: [0, 1, 2], prio: [3, 0, 1, 2],
    abilities: [
      {
        key: 'Q', name: '화염구', icon: 'fire', type: 'dir', range: 17, width: 1.0, cd: 5.5, cost: 45, castTime: 0.15,
        desc: (h) => `화염구를 던집니다. 처음 닿은 적 주변에서 폭발해 ${v(h, 0, 80, 60, 0, 0.7)}의 마법 피해를 줍니다.`,
        ai: { use: 'skillshot', range: 15.5, speed: 30, farm: true },
        cast(G, h, t) {
          const dmg = v(h, 0, 80, 60, 0, 0.7);
          const boom = (p) => {
            aoeDamage(G, h, p.x, p.y, 3.2, dmg, 'magic');
            G.fx('explode', { x: p.x, y: p.y, r: 3.2, color: '#ff9340' });
          };
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 30, range: 17, radius: 0.9,
            vis: { kind: 'fire', color: '#ff9340', size: 1.5 },
            onHit(u, p) { boom(p); }, onEnd(p) { boom(p); }, noDirectHit: true,
          });
        },
      },
      {
        key: 'W', name: '불기둥', icon: 'pillar', type: 'ground', range: 14, radius: 4, cd: 12, cost: 65, castTime: 0.15,
        desc: (h) => `0.75초 뒤 지정한 곳에 불기둥이 솟아 ${v(h, 1, 90, 68, 0, 0.75)}의 마법 피해를 주고 0.8초간 기절시킵니다.`,
        ai: { use: 'ground', range: 14, radius: 4, delay: 0.75, farm: true },
        cast(G, h, t) {
          const dmg = v(h, 1, 90, 68, 0, 0.75);
          G.zone({
            src: h, x: t.x, y: t.y, radius: 4, delay: 0.75, vis: { kind: 'pillar', color: '#ff8a3c' },
            onBlast(z) { aoeDamage(G, h, z.x, z.y, z.radius, dmg, 'magic', (u) => stun(G, u, h, 0.8)); },
          });
        },
      },
      {
        key: 'E', name: '잔불 도약', icon: 'blink', type: 'ground', range: 8, radius: 0, cd: [16, 14.5, 13, 11.5], cost: 50, castTime: 0,
        desc: (h) => `지정한 곳으로 순간이동합니다. 떠난 자리에 불꽃이 터져 ${v(h, 2, 40, 32, 0, 0.3)}의 마법 피해를 줍니다.`,
        ai: { use: 'mobility', range: 8, escapeOnly: true },
        cast(G, h, t) {
          const ox = h.x, oy = h.y;
          aoeDamage(G, h, ox, oy, 3.5, v(h, 2, 40, 32, 0, 0.3), 'magic');
          G.fx('explode', { x: ox, y: oy, r: 3.5, color: '#ffb066' });
          G.blink(h, t.x, t.y);
          G.fx('ring', { x: h.x, y: h.y, r0: 2.5, r1: 0.3, dur: 0.3, color: '#ffb066' });
        },
      },
      {
        key: 'R', name: '유성 낙하', icon: 'meteor', type: 'ground', range: 18, radius: 7, cd: [80, 70, 60], cost: 110, castTime: 0.25, ult: true,
        desc: (h) => `1.3초 뒤 거대한 유성이 떨어져 ${v(h, 3, 440, 180, 0, 1.1)}의 마법 피해를 줍니다. 불타는 대지가 3초간 남아 0.5초마다 ${v(h, 3, 28, 13, 0, 0.08)}의 피해를 줍니다.`,
        ai: { use: 'ground', range: 18, radius: 7, delay: 1.3, ult: true },
        cast(G, h, t) {
          const dmg = v(h, 3, 440, 180, 0, 1.1), burn = v(h, 3, 28, 13, 0, 0.08);
          G.zone({
            src: h, x: t.x, y: t.y, radius: 7, delay: 1.3, vis: { kind: 'meteor', color: '#ff6a2a' },
            onBlast(z) {
              aoeDamage(G, h, z.x, z.y, z.radius, dmg, 'magic');
              G.fx('shake', { x: z.x, y: z.y, amp: 0.8 });
              G.zone({
                src: h, x: z.x, y: z.y, radius: 7, delay: 0, dur: 3, tick: 0.5, vis: { kind: 'burn', color: '#ff6a2a' },
                onTick(z2) { aoeDamage(G, h, z2.x, z2.y, z2.radius, burn, 'magic'); },
              });
            },
          });
        },
      },
    ],
  };

  /* 4. 카즈 — 그림자 칼날 (암살자) */
  H.kaz = {
    id: 'kaz', name: '카즈', title: '그림자 칼날', role: 'assassin', roleName: '암살자', lane: C.TOP, diff: 3,
    blurb: '은신으로 접근해 약한 적을 순식간에 처치하는 암살자. 치고 빠지는 타이밍이 생명입니다.',
    color: '#8d6bff', ranged: false,
    base: { hp: 675, hpG: 92, mp: 300, mpG: 26, ad: 68, adG: 3.9, as: 0.74, asG: 0.028, def: 28, defG: 3.3, ms: 8.0, range: 2.6, hpRegen: 2.8, mpRegen: 3.2 },
    build: ['blade', 'boots', 'saber', 'striders', 'judge', 'reaver', 'breaker', 'aegis'],
    open: [0, 2, 1], prio: [3, 0, 2, 1],
    abilities: [
      {
        key: 'Q', name: '그림자 표창', icon: 'shuriken', type: 'dir', range: 14, width: 0.8, cd: 5.5, cost: 35, castTime: 0.1,
        desc: (h) => `표창을 던져 처음 맞은 적에게 ${v(h, 0, 72, 56, 0.8)}의 피해를 주고 1.5초간 30% 둔화시킵니다.`,
        ai: { use: 'skillshot', range: 13, speed: 44, farm: true },
        cast(G, h, t) {
          const dmg = v(h, 0, 72, 56, 0.8);
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 44, range: 14, radius: 0.75,
            vis: { kind: 'shuriken', color: '#b79cff', size: 1.2 },
            onHit(u) { G.damage(h, u, dmg, 'phys'); slow(G, u, h, 0.3, 1.5); },
          });
        },
      },
      {
        key: 'W', name: '그림자 장막', icon: 'smoke', type: 'self', cd: [16, 15, 14, 13], cost: 45, castTime: 0,
        desc: (h) => `2.5초간 은신하며 이동 속도가 35% 증가합니다. 은신 중에는 적이 대상으로 지정할 수 없습니다. 다음 기본 공격이 ${v(h, 1, 40, 38, 0.5)}의 추가 피해를 줍니다.`,
        ai: { use: 'stealth' },
        cast(G, h) {
          G.fx('smoke', { x: h.x, y: h.y, r: 2.5 });
          G.addBuff(h, { id: 'kazW', dur: 2.5, stealth: true, msPct: 0.35, fx: 'stealth' });
          G.addBuff(h, { id: 'kazW2', dur: 5.5, empower: v(h, 1, 40, 38, 0.5), fx: 'empower', color: '#b79cff' });
        },
      },
      {
        key: 'E', name: '그림자 습격', icon: 'strike', type: 'unit', range: 9.5, cd: 10, cost: 40, castTime: 0,
        desc: (h) => `대상의 등 뒤로 순간이동해 ${v(h, 2, 70, 54, 0.7)}의 피해를 줍니다.`,
        ai: { use: 'unit', range: 9.5, gap: true },
        cast(G, h, t) {
          const u = t.unit; if (!u || u.dead) return;
          const d = Math.hypot(u.x - h.x, u.y - h.y) || 1;
          const ox = h.x, oy = h.y;
          G.blink(h, u.x + (u.x - h.x) / d * (u.r + 1.1), u.y + (u.y - h.y) / d * (u.r + 1.1));
          G.fx('line', { x1: ox, y1: oy, x2: h.x, y2: h.y, color: '#8d6bff', dur: 0.3, w: 0.5 });
          G.damage(h, u, v(h, 2, 70, 54, 0.7), 'phys');
          G.fx('slash', { x: u.x, y: u.y, ang: Math.atan2(u.y - h.y, u.x - h.x), color: '#d2c2ff', r: 2.2 });
          h.cmdAttack(u);
        },
      },
      {
        key: 'R', name: '종막', icon: 'skull', type: 'unit', heroOnly: true, range: 10, cd: [65, 57, 49], cost: 80, castTime: 0, ult: true,
        desc: (h) => `적 영웅에게 돌진해 ${v(h, 3, 330, 140, 1.0)}에 더해 대상이 잃은 체력의 25%만큼 피해를 줍니다. 대상이 쓰러지면 재사용 대기시간이 절반으로 줄어듭니다.`,
        ai: { use: 'unit', range: 10, ult: true, execute: 0.55 },
        cast(G, h, t) {
          const u = t.unit; if (!u || u.dead) return;
          const base = v(h, 3, 330, 140, 1.0);
          G.dash(h, u.x, u.y, 44, {
            follow: u, trail: '#8d6bff', stopDist: u.r + 1.0,
            onEnd() {
              if (u.dead || Math.hypot(u.x - h.x, u.y - h.y) > 4.5) return;
              G.fx('slash', { x: u.x, y: u.y, ang: Math.atan2(u.y - h.y, u.x - h.x), color: '#ffffff', r: 3.2 });
              G.fx('burst', { x: u.x, y: u.y, n: 16, color: '#b79cff', speed: 11, life: 0.45 });
              G.damage(h, u, base + 0.25 * (u.maxHp - u.hp), 'phys');
              if (u.dead) h.cds[3] *= 0.5;
              else h.cmdAttack(u);
            },
          });
        },
      },
    ],
  };

  /* 5. 브롬 — 광전사 (전사) */
  H.brom = {
    id: 'brom', name: '브롬', title: '광전사', role: 'fighter', roleName: '전사', lane: C.TOP, diff: 1,
    blurb: '거대한 도끼를 휘두르며 싸울수록 강해지는 전사. 죽음조차 잠시 미뤄 둡니다.',
    color: '#e0623a', ranged: false,
    base: { hp: 720, hpG: 98, mp: 280, mpG: 24, ad: 64, adG: 3.9, as: 0.70, asG: 0.025, def: 30, defG: 3.5, ms: 7.7, range: 2.8, hpRegen: 2.8, mpRegen: 3.0 },
    build: ['blade', 'boots', 'sickle', 'treads', 'reaver', 'hatchet', 'colossus', 'judge', 'trigale'],
    open: [0, 2, 1], prio: [3, 0, 2, 1],
    abilities: [
      {
        key: 'Q', name: '회전 베기', icon: 'spin', type: 'self', radius: 4.5, cd: 6, cost: 35, castTime: 0.12,
        desc: (h) => `도끼를 크게 휘둘러 주변 적에게 ${v(h, 0, 65, 50, 0.75)}의 피해를 주고, 맞힌 적 하나당 체력을 ${amp(h, v(h, 0, 10, 7))} 회복합니다(영웅은 3배).`,
        ai: { use: 'selfAoe', radius: 4.1, farm: true },
        cast(G, h) {
          const list = aoeDamage(G, h, h.x, h.y, 4.5, v(h, 0, 65, 50, 0.75), 'phys');
          let heal = 0, k = 0;
          for (const u of list) { if (k++ >= 6) break; heal += v(h, 0, 10, 7) * (u.isHero ? 3 : 1); }
          if (heal > 0) G.heal(h, h, heal);
          G.fx('spin', { x: h.x, y: h.y, r: 4.5, color: '#ffc9a8', follow: h });
        },
      },
      {
        key: 'W', name: '피의 격노', icon: 'rage', type: 'self', cd: 15, cost: 40, castTime: 0,
        desc: (h) => `5초간 공격 속도가 ${pct(h, 1, 35, 10)}% 증가하고 생명력 흡수 15%를 얻습니다.`,
        ai: { use: 'steroid' },
        cast(G, h) {
          G.addBuff(h, { id: 'bromW', dur: 5, asPct: pct(h, 1, 35, 10) / 100, lifesteal: 0.15, fx: 'rage', color: '#ff5a3c' });
          G.fx('ring', { x: h.x, y: h.y, r0: 0.4, r1: 2.6, dur: 0.3, color: '#ff5a3c' });
        },
      },
      {
        key: 'E', name: '도약 강타', icon: 'leap', type: 'ground', range: 9, radius: 3.8, cd: 11, cost: 45, castTime: 0,
        desc: (h) => `지정한 곳으로 뛰어올라 착지 지점의 적에게 ${v(h, 2, 70, 54, 0.6)}의 피해를 주고 1.5초간 35% 둔화시킵니다.`,
        ai: { use: 'ground', range: 9, radius: 3.4, delay: 0.3, gap: true },
        cast(G, h, t) {
          const dmg = v(h, 2, 70, 54, 0.6);
          G.dash(h, t.x, t.y, 27, {
            leap: true, trail: '#ffc9a8',
            onEnd() {
              aoeDamage(G, h, h.x, h.y, 3.8, dmg, 'phys', (u) => slow(G, u, h, 0.35, 1.5));
              G.fx('quake', { x: h.x, y: h.y, r: 3.8, color: '#e0a060' });
              G.fx('shake', { x: h.x, y: h.y, amp: 0.3 });
            },
          });
        },
      },
      {
        key: 'R', name: '불굴의 의지', icon: 'undying', type: 'self', cd: [80, 70, 60], cost: 80, castTime: 0, ult: true,
        desc: (h) => `5초간 어떤 피해를 입어도 쓰러지지 않으며, 공격력이 ${v(h, 3, 40, 15)} 증가하고 이동 속도가 20% 빨라집니다. 효과가 끝나면 최대 체력의 15%를 회복합니다.`,
        ai: { use: 'lowHp', hp: 0.35 },
        cast(G, h) {
          G.addBuff(h, {
            id: 'bromR', dur: 5, undying: true, ad: v(h, 3, 40, 15), msPct: 0.2, fx: 'undying', color: '#ffb23c',
            onExpire(u) { if (!u.dead) G.heal(u, u, u.maxHp * 0.15); },
          });
          G.fx('nova', { x: h.x, y: h.y, r: 4, color: '#ffb23c' });
        },
      },
    ],
  };

  /* 6. 세린 — 빛의 사제 (서포터) */
  H.serin = {
    id: 'serin', name: '세린', title: '빛의 사제', role: 'support', roleName: '서포터', lane: C.BOT, diff: 2,
    blurb: '아군을 치유하고 적의 발을 묶는 사제. 한타에서 성역을 펼치면 팀 전체가 버팁니다.',
    color: '#ffd76a', ranged: true, proj: { kind: 'light', speed: 32, color: '#fff0a8' },
    base: { hp: 625, hpG: 84, mp: 420, mpG: 42, ad: 56, adG: 2.8, as: 0.68, asG: 0.018, def: 24, defG: 3.0, ms: 7.7, range: 10, hpRegen: 2.2, mpRegen: 5.2 },
    build: ['shard', 'boots', 'prism', 'treads', 'grail', 'chrono', 'colossus', 'orb'],
    open: [0, 1, 2], prio: [3, 0, 1, 2],
    abilities: [
      {
        key: 'Q', name: '빛의 창', icon: 'spear', type: 'dir', range: 17, width: 0.9, cd: 6, cost: 40, castTime: 0.15,
        desc: (h) => `빛의 창을 던져 처음 맞은 적에게 ${v(h, 0, 76, 56, 0, 0.6)}의 마법 피해를 주고 1.5초간 35% 둔화시킵니다.`,
        ai: { use: 'skillshot', range: 15.5, speed: 34, farm: true },
        cast(G, h, t) {
          const dmg = v(h, 0, 76, 56, 0, 0.6);
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 34, range: 17, radius: 0.85,
            vis: { kind: 'light', color: '#ffe680', size: 1.5 },
            onHit(u) { G.damage(h, u, dmg, 'magic'); slow(G, u, h, 0.35, 1.5); },
          });
        },
      },
      {
        key: 'W', name: '치유의 빛', icon: 'heal', type: 'ally', range: 12, cd: 8, cost: 60, castTime: 0.1,
        desc: (h) => `아군 영웅 하나의 체력을 ${amp(h, v(h, 1, 85, 62, 0, 0.55))} 회복시킵니다. 다른 아군에게 쓰면 자신도 절반만큼 회복합니다. (커서에 가장 가까운 아군, 없으면 자신)`,
        ai: { use: 'heal', range: 12 },
        cast(G, h, t) {
          const u = (t.unit && !t.unit.dead) ? t.unit : h;
          const amt = v(h, 1, 85, 62, 0, 0.55);
          G.heal(h, u, amt);
          if (u !== h) { G.heal(h, h, amt * 0.5); G.fx('line', { x1: h.x, y1: h.y, x2: u.x, y2: u.y, color: '#a8ffb0', dur: 0.35, w: 0.4 }); }
          G.fx('healfx', { x: u.x, y: u.y, follow: u });
        },
      },
      {
        key: 'E', name: '속박의 고리', icon: 'ring', type: 'ground', range: 14, radius: 3.6, cd: 13, cost: 55, castTime: 0.12,
        desc: (h) => `0.65초 뒤 지정한 곳에 빛의 고리가 닫혀 ${v(h, 2, 62, 46, 0, 0.4)}의 마법 피해를 주고 ${pct(h, 2, 1.2, 0.15).toFixed(2)}초간 속박합니다.`,
        ai: { use: 'ground', range: 14, radius: 3.6, delay: 0.65 },
        cast(G, h, t) {
          const dmg = v(h, 2, 62, 46, 0, 0.4), dur = pct(h, 2, 1.2, 0.15);
          G.zone({
            src: h, x: t.x, y: t.y, radius: 3.6, delay: 0.65, vis: { kind: 'bind', color: '#ffe680' },
            onBlast(z) { aoeDamage(G, h, z.x, z.y, z.radius, dmg, 'magic', (u) => root(G, u, h, dur)); },
          });
        },
      },
      {
        key: 'R', name: '빛의 성역', icon: 'sanct', type: 'self', radius: 9, cd: [85, 75, 65], cost: 110, castTime: 0.2, ult: true,
        desc: (h) => `4초간 성역을 펼칩니다. 안에 있는 아군 영웅은 ${amp(h, v(h, 3, 180, 80, 0, 0.4))}의 보호막을 얻고 0.5초마다 체력을 ${amp(h, v(h, 3, 46, 20, 0, 0.12))} 회복하며, 적은 20% 둔화됩니다.`,
        ai: { use: 'teamHeal', radius: 9 },
        cast(G, h) {
          const sh = amp(h, v(h, 3, 180, 80, 0, 0.4)), hl = v(h, 3, 46, 20, 0, 0.12);
          for (const a of G.alliesIn(h.team, h.x, h.y, 9, true)) G.addBuff(a, { id: 'serinR', dur: 4, shield: sh, fx: 'shield', color: '#fff0a8' });
          G.zone({
            src: h, x: h.x, y: h.y, radius: 9, delay: 0, dur: 4, tick: 0.5, friendly: true, vis: { kind: 'sanct', color: '#ffe680' },
            onTick(z) {
              for (const a of G.alliesIn(h.team, z.x, z.y, z.radius, true)) G.heal(h, a, hl);
              for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius)) slow(G, u, h, 0.2, 0.8);
            },
          });
        },
      },
    ],
  };

  /* 7. 볼트 — 폭풍 술사 (마법사) */
  H.volt = {
    id: 'volt', name: '볼트', title: '폭풍 술사', role: 'mage', roleName: '마법사', lane: C.MID, diff: 2,
    blurb: '번개를 연쇄시켜 여러 적을 동시에 태우는 마법사. 뇌우는 근처의 모든 적 영웅을 기절시킵니다.',
    color: '#4fd8ff', ranged: true, proj: { kind: 'bolt', speed: 34, color: '#a8f0ff' },
    base: { hp: 585, hpG: 80, mp: 410, mpG: 40, ad: 50, adG: 2.6, as: 0.67, asG: 0.018, def: 20, defG: 2.8, ms: 7.6, range: 9.5, hpRegen: 1.7, mpRegen: 4.6 },
    build: ['shard', 'boots', 'prism', 'striders', 'chrono', 'orb', 'cinder', 'aegis'],
    open: [0, 1, 2], prio: [3, 0, 1, 2],
    abilities: [
      {
        key: 'Q', name: '연쇄 번개', icon: 'chain', type: 'unit', range: 10.5, cd: 6.5, cost: 55, castTime: 0.12,
        desc: (h) => `대상에게 번개를 쏘아 ${v(h, 0, 70, 52, 0, 0.6)}의 마법 피해를 줍니다. 번개는 근처의 적 3명에게 튕기며 튕길 때마다 피해가 20% 줄어듭니다.`,
        ai: { use: 'unit', range: 10.5, farm: true },
        cast(G, h, t) {
          let u = t.unit; if (!u || u.dead) return;
          let dmg = v(h, 0, 70, 52, 0, 0.6), px = h.x, py = h.y;
          const hit = new Set();
          for (let i = 0; i < 4 && u; i++) {
            hit.add(u);
            G.fx('lightning', { x1: px, y1: py, x2: u.x, y2: u.y, color: '#7fe4ff' });
            px = u.x; py = u.y;
            G.damage(h, u, dmg, 'magic'); dmg *= 0.8;
            let next = null, nd = 6.5;
            for (const e of G.enemiesIn(h.team, px, py, 6.5)) {
              if (hit.has(e) || e.dead) continue;
              const d = Math.hypot(e.x - px, e.y - py); if (d < nd) { nd = d; next = e; }
            }
            u = next;
          }
        },
      },
      {
        key: 'W', name: '전류 지대', icon: 'field', type: 'ground', range: 13, radius: 4.5, cd: 12, cost: 60, castTime: 0.12,
        desc: (h) => `지정한 곳에 3초간 전류 지대를 만듭니다. 0.5초마다 ${v(h, 1, 16, 12, 0, 0.12)}의 마법 피해를 주고 30% 둔화시킵니다.`,
        ai: { use: 'ground', range: 13, radius: 4.5, delay: 0.1, farm: true },
        cast(G, h, t) {
          const dmg = v(h, 1, 16, 12, 0, 0.12);
          G.zone({
            src: h, x: t.x, y: t.y, radius: 4.5, delay: 0.1, dur: 3, tick: 0.5, vis: { kind: 'storm', color: '#4fd8ff' },
            onTick(z) { for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius)) { G.damage(h, u, dmg, 'magic'); slow(G, u, h, 0.3, 0.8); } },
          });
        },
      },
      {
        key: 'E', name: '과충전', icon: 'charge', type: 'self', cd: 15, cost: 40, castTime: 0,
        desc: (h) => `2.5초간 이동 속도가 40% 증가하고 ${amp(h, v(h, 2, 50, 40, 0, 0.3))}의 보호막을 얻습니다.`,
        ai: { use: 'defensive' },
        cast(G, h) {
          G.addBuff(h, { id: 'voltE', dur: 2.5, msPct: 0.4, shield: amp(h, v(h, 2, 50, 40, 0, 0.3)), fx: 'shield', color: '#7fe4ff' });
          G.fx('ring', { x: h.x, y: h.y, r0: 0.4, r1: 2.6, dur: 0.3, color: '#7fe4ff' });
        },
      },
      {
        key: 'R', name: '뇌우', icon: 'storm', type: 'self', radius: 16, cd: [85, 75, 65], cost: 110, castTime: 0.3, ult: true,
        desc: (h) => `먹구름을 불러 0.9초 뒤 주변의 모든 적 영웅에게 벼락을 내리꽂습니다. ${v(h, 3, 330, 150, 0, 0.8)}의 마법 피해를 주고 1초간 기절시킵니다.`,
        ai: { use: 'selfAoe', radius: 14, ult: true, heroOnly: true },
        cast(G, h) {
          const dmg = v(h, 3, 330, 150, 0, 0.8);
          G.fx('nova', { x: h.x, y: h.y, r: 16, color: '#4fd8ff' });
          for (const u of G.enemiesIn(h.team, h.x, h.y, 16, { heroes: true, minions: false })) {
            G.fx('mark', { follow: u, dur: 0.9, color: '#7fe4ff' });
            G.after(0.9, () => {
              if (u.dead) return;
              G.fx('thunder', { x: u.x, y: u.y, color: '#bff4ff' });
              G.damage(h, u, dmg, 'magic'); stun(G, u, h, 1.0);
            });
          }
        },
      },
    ],
  };

  /* 8. 타라 — 황야의 저격수 (원거리 딜러) */
  H.tara = {
    id: 'tara', name: '타라', title: '황야의 저격수', role: 'marksman', roleName: '원거리 딜러', lane: C.BOT, diff: 2,
    blurb: '가장 긴 사거리를 가진 저격수. 멀리서 한 발씩 꽂아 넣고, 관통 포화로 전장을 가릅니다.',
    color: '#d9a05a', ranged: true, proj: { kind: 'bullet', speed: 46, color: '#ffe2a8' },
    base: { hp: 590, hpG: 80, mp: 320, mpG: 30, ad: 64, adG: 3.9, as: 0.66, asG: 0.027, def: 21, defG: 2.9, ms: 7.6, range: 11.5, hpRegen: 1.8, mpRegen: 3.4 },
    build: ['blade', 'boots', 'saber', 'striders', 'breaker', 'hatchet', 'judge', 'reaver'],
    open: [0, 1, 2], prio: [3, 0, 1, 2],
    abilities: [
      {
        key: 'Q', name: '정조준', icon: 'snipe', type: 'dir', range: 26, width: 0.8, cd: 6, cost: 45, castTime: 0.35,
        desc: (h) => `잠시 조준한 뒤 아주 멀리 날아가는 탄환을 쏩니다. 처음 맞은 적에게 ${v(h, 0, 90, 68, 1.0)}의 피해를 줍니다.`,
        ai: { use: 'skillshot', range: 23, speed: 60 },
        cast(G, h, t) {
          const dmg = v(h, 0, 90, 68, 1.0);
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 60, range: 26, radius: 0.7,
            vis: { kind: 'bullet', color: '#ffd27a', size: 1.6 },
            onHit(u) { G.damage(h, u, dmg, 'phys'); G.fx('burst', { x: u.x, y: u.y, n: 8, color: '#ffe2a8', speed: 9, life: 0.3 }); },
          });
        },
      },
      {
        key: 'W', name: '올가미 탄', icon: 'net', type: 'dir', range: 14, width: 1.0, cd: 13, cost: 50, castTime: 0.12,
        desc: (h) => `올가미 탄을 쏘아 처음 맞은 적에게 ${v(h, 1, 40, 32, 0.4)}의 피해를 주고 ${pct(h, 1, 1.1, 0.15).toFixed(2)}초간 속박합니다.`,
        ai: { use: 'skillshot', range: 13, speed: 32 },
        cast(G, h, t) {
          const dmg = v(h, 1, 40, 32, 0.4), dur = pct(h, 1, 1.1, 0.15);
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 32, range: 14, radius: 0.95,
            vis: { kind: 'net', color: '#e8d2a0', size: 1.4 },
            onHit(u) { G.damage(h, u, dmg, 'phys'); root(G, u, h, dur); },
          });
        },
      },
      {
        key: 'E', name: '긴급 회피', icon: 'roll', type: 'dir', range: 7.5, width: 1.2, cd: [12, 10.5, 9, 7.5], cost: 35, castTime: 0,
        desc: (h) => `지정한 방향으로 재빨리 구르고 1.5초간 이동 속도가 ${pct(h, 2, 30, 5)}% 증가합니다.`,
        ai: { use: 'mobility', range: 7.5, escapeOnly: true },
        cast(G, h, t) {
          G.dash(h, h.x + t.dx * 7.5, h.y + t.dy * 7.5, 36, { trail: '#ffe2a8' });
          G.addBuff(h, { id: 'taraE', dur: 1.5, msPct: pct(h, 2, 30, 5) / 100, fx: 'haste', color: '#ffe2a8' });
        },
      },
      {
        key: 'R', name: '관통 포화', icon: 'beam', type: 'dir', range: 48, width: 1.6, cd: [80, 70, 60], cost: 100, castTime: 0.9, ult: true,
        desc: (h) => `0.9초간 조준한 뒤 전장을 가로지르는 포화를 쏩니다. 직선상의 모든 적에게 ${v(h, 3, 410, 180, 1.2)}의 피해를 주며, 영웅에게는 잃은 체력의 15%만큼 추가 피해를 줍니다.`,
        ai: { use: 'skillshot', range: 40, speed: 999, ult: true, execute: 0.6, pierce: true },
        onStart(G, h, t) {
          G.fx('aimline', { x1: h.x, y1: h.y, x2: h.x + t.dx * 48, y2: h.y + t.dy * 48, dur: 0.9, color: '#ff6a4a', w: 1.6 });
        },
        cast(G, h, t) {
          const dmg = v(h, 3, 410, 180, 1.2);
          const x2 = h.x + t.dx * 48, y2 = h.y + t.dy * 48;
          for (const u of G.enemiesInLine(h.team, h.x, h.y, x2, y2, 1.3)) {
            G.damage(h, u, dmg + (u.isHero ? 0.15 * (u.maxHp - u.hp) : 0), 'phys');
          }
          G.fx('beam', { x1: h.x, y1: h.y, x2, y2, color: '#ffd27a', w: 1.6, dur: 0.45 });
          G.fx('shake', { x: h.x, y: h.y, amp: 0.45 });
        },
      },
    ],
  };

  AOS.HeroOrder = ['gaon', 'brom', 'kaz', 'sola', 'volt', 'lira', 'tara', 'serin'];

  /* 다음에 찍기 좋은 스킬 (봇 + 플레이어 추천). 없으면 -1 */
  AOS.nextSkill = function (h) {
    if (!h.sp) return -1;
    const hd = h.hd, learned = h.ranks[0] + h.ranks[1] + h.ranks[2];
    if (h.canLearn(3)) return 3;
    if (learned < 3) { for (const s of hd.open) if (h.ranks[s] === 0 && h.canLearn(s)) return s; }
    for (const s of hd.prio) if (h.canLearn(s)) return s;
    for (let s = 0; s < 4; s++) if (h.canLearn(s)) return s;
    return -1;
  };
  /* 특정 단계의 스킬 설명 (다음 단계 미리보기용) */
  AOS.descAt = function (h, slot, rank) {
    const o = Object.create(h); o.ranks = (h.ranks || [0, 0, 0, 0]).slice(); o.ranks[slot] = rank;
    return h.hd.abilities[slot].desc(o);
  };

  /* 난이도 (적 봇): cs = 막타 정확도, harass = 라인전에서 먼저 거는 정도 */
  AOS.Difficulty = {
    easy:   { name: '쉬움',   think: 0.42, aimErr: 0.34, lead: 0.3, aggro: 0.8,  skillUse: 0.5, dodge: 0.15, retreat: 0.36, gold: 0.92, dmg: 0.9,  cs: 0.5,  harass: 0.5 },
    normal: { name: '보통',   think: 0.26, aimErr: 0.14, lead: 0.7, aggro: 1.0,  skillUse: 0.8, dodge: 0.45, retreat: 0.32, gold: 1.0,  dmg: 1.0,  cs: 0.8,  harass: 1.0 },
    hard:   { name: '어려움', think: 0.2,  aimErr: 0.07, lead: 1.0, aggro: 1.05, skillUse: 0.95, dodge: 0.7, retreat: 0.31, gold: 1.03, dmg: 1.0,  cs: 0.92, harass: 1.15 },
  };
})();
