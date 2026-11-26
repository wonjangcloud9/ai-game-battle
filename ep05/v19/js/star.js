/* 어스름 전선 — star: 별비 난전 (19차)
   길 하나에서 바로 싸우고, 정해진 시각(C.STAR.TIMES)마다 '별비'가 내려 모든 영웅이 별조각 셋 가운데 하나를 고른다.
   · 별조각 = 고르면 그 판 내내 영웅을 바꾸는 카드. 등급은 셋 — 실버(수치가 오른다) · 골드(싸우는 방식이 바뀐다) · 프리즘(판을 바꾼다)
   · 한 번의 별비는 모두에게 같은 등급이다 (뒤로 갈수록 높은 등급이 잘 나온다). 카드 셋은 영웅마다 따로 뽑힌다
   · 사람은 C.STAR.PICK_SEC초 안에 고른다(넘기면 추천 카드). 봇은 잠깐 뒤에 제 구실에 맞는 것을 고른다. 한 판에 C.STAR.REROLLS번 다시 뽑을 수 있다
   이름·목록·수치는 모두 이 게임에서 새로 지었다. 수치는 Hero.recalc 가 TW.boonSum 으로 읽고, 규칙을 바꾸는 것은 깃발(h.bf)로 남겨 game.js 의 피해·처치 자리에서 부른다.
   게임 상태를 바꾸는 것은 모두 시뮬레이션 틱 안이다 (G.rng 만 쓴다) → 같은 씨앗 · 같은 명령이면 같은 판 (친구 방) */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U;

  const AP_HERO = { chorong: 1, seori: 1, narae: 1 };
  const usesAp = (h) => (h.hd.scale ? h.hd.scale === 'ap' : !!AP_HERO[h.heroId]);
  const usesAtk = (h) => !usesAp(h);
  const melee = (h) => !h.hd.ranged;
  const healer = (h) => !!h.hd.heals || h.heroId === 'narae';

  /* 등급 */
  TW.BOON_TIERS = [
    { id: 'silver', name: '실버',   col: '#cfd8ea', deep: '#38425e', glow: '#f2f6ff', say: '수치가 오른다' },
    { id: 'gold',   name: '골드',   col: '#ffd24a', deep: '#6a4a10', glow: '#fff1b8', say: '싸우는 방식이 바뀐다' },
    { id: 'prism',  name: '프리즘', col: '#d3b0ff', deep: '#3c2a78', glow: '#f3e8ff', say: '판을 바꾼다', rainbow: true },
  ];

  /* 별조각이 주는 피해 (화면 글과 실제 피해가 같은 식을 쓴다) */
  const triDmg = (h) => Math.round(40 + 10 * h.level + 0.4 * h.ad + 0.3 * h.ap);
  const kindleDmg = (h) => Math.round(30 + 8 * h.level + 0.25 * h.ad + 0.35 * h.ap);
  const meteorDmg = (h) => Math.round(110 + 20 * h.level + 0.5 * h.ad + 0.5 * h.ap);
  const novaDmg = (h) => Math.round(30 + 7 * h.level + 0.2 * h.ad + 0.22 * h.ap);

  /* ---------- 별조각 목록 ----------
     tier 0 실버 · 1 골드 · 2 프리즘 | st = 수치 | flag = 규칙을 바꾸는 깃발 | fit(h) = 이 영웅에게 뜰 수 있나 | tags = 봇이 고를 때 보는 성격 */
  const B = TW.Boons = {
    // ── 실버: 수치가 오른다
    iron:   { tier: 0, name: '무쇠별',     icon: 'blade',   tags: ['ad'],            st: { adPct: 0.16 }, fit: usesAtk, text: () => '공격력 +16%' },
    ink:    { tier: 0, name: '먹빛별',     icon: 'orb',     tags: ['ap'],            st: { ap: 45 }, fit: usesAp, text: () => '주문력 +45' },
    quilt:  { tier: 0, name: '솜별',       icon: 'heart',   tags: ['hp'],            st: { hpPct: 0.18 }, text: () => '최대 체력 +18%' },
    shell:  { tier: 0, name: '껍질별',     icon: 'bark',    tags: ['def'],           st: { def: 25, ten: 0.25 }, text: () => '방어력 +25 · 기절·빙결·띄움·속박·홀림에 걸리는 시간 −25%' },
    breeze: { tier: 0, name: '바람별',     icon: 'boots',   tags: ['ms'],            st: { msPct: 0.1, rollMul: 0.6 }, text: () => '이동 속도 +10% · 구르기 재사용 −40%' },
    clock:  { tier: 0, name: '재촉별',     icon: 'glass',   tags: ['cd'],            st: { cdRate: 0.2 }, text: () => '스킬 재사용이 20% 빨리 돕니다' },
    dew:    { tier: 0, name: '이슬별',     icon: 'water',   tags: ['sustain', 'hp'], st: { regenPct: 0.008, packMul: 0.5 }, text: () => '1초마다 최대 체력의 0.8% 회복 · 회복 꾸러미 효과 +50%' },
    awl:    { tier: 0, name: '송곳별',     icon: 'feather', tags: ['as'],            st: { asPct: 0.25 }, fit: usesAtk, text: () => '공격 속도 +25%' },
    leech:  { tier: 0, name: '거머리별',   icon: 'fang',    tags: ['sustain'],       st: { vamp: 0.09 }, text: () => '영웅에게 준 피해의 9%만큼 체력 회복 (미니언에게는 3%)' },
    purse:  { tier: 0, name: '복주머니별', icon: 'gold',    tags: ['gold'],          st: { gps: 2 }, gold: 600, text: () => '바로 골드 +600 · 1초마다 골드 +2' },
    // ── 골드: 싸우는 방식이 바뀐다
    tri:    { tier: 1, name: '세 번째 별', icon: 'star',    tags: ['ad', 'as'],      flag: 'tri', fit: usesAtk, text: (h) => '세 번째 기본 공격마다 대상 둘레에 별이 터져 ' + triDmg(h) + '의 피해를 줍니다' },
    kindle: { tier: 1, name: '불씨 잇기',  icon: 'heat',    tags: ['ap', 'ad', 'ms'], flag: 'kindle', text: (h) => '스킬을 맞히면 3초 안의 다음 기본 공격이 ' + kindleDmg(h) + ' 더 아프고, 2초 동안 이동 속도 +20%' },
    rewind: { tier: 1, name: '되감기별',   icon: 'tumble',  tags: ['cd', 'sustain'], flag: 'rewind', text: () => '영웅을 처치하거나 도우면 모든 스킬 재사용 대기시간 −60% · 잃은 체력의 15% 회복' },
    bramble:{ tier: 1, name: '가시별',     icon: 'thorn',   tags: ['def', 'hp'],     st: { def: 15 }, flag: 'bramble', text: () => '받은 피해의 18%를 때린 적에게 되돌려 줍니다 · 방어력 +15' },
    bigstar:{ tier: 1, name: '큰별',       icon: 'landslide', tags: ['hp', 'melee'], st: { hpPct: 0.3, size: 1.25, rangeMelee: 0.8 }, fit: melee, text: () => '몸집 +25% · 최대 체력 +30% · 기본 공격 사거리 +0.8' },
    smallstar: { tier: 1, name: '작은별',  icon: 'dust',    tags: ['ms', 'as', 'ranged'], st: { size: 0.75, msPct: 0.14, asPct: 0.18 }, text: () => '몸집 −25% (맞히기 어려워집니다) · 이동 속도 +14% · 공격 속도 +18%' },
    meteor: { tier: 1, name: '별똥 부르기', icon: 'blizzard', tags: ['ult'],         st: { ultMul: 0.8 }, flag: 'meteor', text: (h) => '궁극기를 쓰면 가까운 적 영웅 셋의 머리 위로 별똥이 떨어져 ' + meteorDmg(h) + '의 피해 · 궁극기 재사용 −20%' },
    guide:  { tier: 1, name: '길잡이별',   icon: 'dawn',    tags: ['sup'],           flag: 'guide', fit: healer, text: () => '내가 아군에게 주는 치유·보호막 +30% · 받은 아군은 4초 동안 주는 피해 +12%' },
    chain:  { tier: 1, name: '사슬별',     icon: 'hook',    tags: ['cc'],            flag: 'chain', text: () => '내가 기절·빙결·띄움·속박·홀림을 건 적은 4초 동안 모든 피해를 15% 더 받습니다' },
    far:    { tier: 1, name: '먼별',       icon: 'firebolt', tags: ['ranged'],       st: { range: 2.2, rangeMelee: 0.8 }, flag: 'far', text: (h) => '기본 공격 사거리 +' + (h.hd.ranged ? '2.2' : '0.8') + ' · 8칸 넘게 떨어진 적에게 주는 피해 +12%' },
    // ── 프리즘: 판을 바꾼다
    twice:  { tier: 2, name: '두 번 뜨는 별', icon: 'moon', tags: ['ult', 'cd'],     st: { ultMul: 0.55 }, flag: 'twice', text: () => '궁극기 재사용 대기시간 −45% · 궁극기를 쓰면 5초 동안 주는 피해 +15%' },
    ember:  { tier: 2, name: '꺼지지 않는 별', icon: 'rise', tags: ['hp', 'def', 'sustain'], flag: 'ember', text: () => '쓰러질 피해를 받으면 쓰러지는 대신 체력 35%로 버티고 1.5초 동안 피해를 받지 않습니다 (90초마다)' },
    nova:   { tier: 2, name: '별폭풍',     icon: 'lure',    tags: ['cd', 'melee', 'ap'], flag: 'nova', text: (h) => '스킬을 쓸 때마다 내 둘레에 별빛이 터져 ' + novaDmg(h) + '의 피해를 주고 1초 동안 20% 느리게 합니다' },
    hunt:   { tier: 2, name: '별 사냥꾼',  icon: 'skull',   tags: ['ad', 'ap', 'hp'], flag: 'hunt', stacks: 2, text: () => '영웅을 처치하거나 도울 때마다 이번 판 내내 공격력 +5 · 주문력 +9 · 최대 체력 +50 (두 번 쌓인 채로 시작)' },
    giant:  { tier: 2, name: '거인별',     icon: 'slam',    tags: ['hp', 'melee', 'def'], st: { hpPct: 0.45, size: 1.4, ten: 0.3 }, flag: 'giant', fit: melee, text: () => '몸집 +40% · 최대 체력 +45% · 기본 공격이 내 최대 체력의 2.5%만큼 더 아픔 · 제어에 걸리는 시간 −30%' },
    twin:   { tier: 2, name: '쌍둥이별',   icon: 'barrage', tags: ['ad', 'as'],      st: { asPct: 0.15 }, flag: 'twin', fit: usesAtk, text: () => '기본 공격이 가까운 다른 적 하나에게도 60% 피해로 튑니다 · 공격 속도 +15%' },
    veil:   { tier: 2, name: '별빛 장막',  icon: 'wing',    tags: ['hp', 'def'],     flag: 'veil', text: () => '6초 동안 맞지 않으면 최대 체력의 18% 보호막이 생깁니다 · 보호막이 있는 동안 주는 피해 +15%' },
    third:  { tier: 2, name: '셋째 박자',  icon: 'flurry',  tags: ['cd', 'ap'],      flag: 'third', text: () => '일반 스킬(Q·W·E)을 세 번째로 쓸 때마다 그 스킬의 재사용 대기시간 −80%' },
  };
  TW.BoonOrder = Object.keys(B);
  for (const id of TW.BoonOrder) B[id].id = id;
  TW.boonText = (h, id) => B[id].text(h);

  /* 가진 별조각의 수치 합 (Hero.recalc · TW.powerOf 가 읽는다). 별조각·사냥 쌓임이 바뀔 때만 다시 센다 */
  const ADD = ['hpPct', 'adPct', 'ap', 'def', 'asPct', 'msPct', 'gps', 'cdRate', 'regenPct', 'vamp', 'packMul'];
  TW.boonSum = function (h) {
    const key = h.boons.length * 1000 + h.hunt;
    if (h._bsKey === key && h._bs) return h._bs;
    const s = { hp: 0, hpPct: 0, ad: 0, adPct: 0, ap: 0, def: 0, asPct: 0, msPct: 0, ls: 0, gps: 0, cdRate: 0, regenPct: 0, range: 0, size: 1, vamp: 0, ten: 0, ultMul: 1, rollMul: 1, packMul: 0, flags: {} };
    const ranged = !!h.hd.ranged;
    for (const id of h.boons) {
      const b = B[id], st = b.st;
      if (st) {
        for (let i = 0; i < ADD.length; i++) { const k = ADD[i]; if (st[k]) s[k] += st[k]; }
        if (st.size) s.size *= st.size; if (st.ultMul) s.ultMul *= st.ultMul; if (st.rollMul) s.rollMul *= st.rollMul;
        if (st.ten) s.ten = 1 - (1 - s.ten) * (1 - st.ten);
        s.range += ranged ? (st.range || 0) : (st.rangeMelee || 0);
      }
      if (b.flag) s.flags[b.flag] = true;
    }
    if (h.hunt > 0) { s.ad += 5 * h.hunt; s.ap += 9 * h.hunt; s.hp += 50 * h.hunt; }
    s.size = U.clamp(s.size, 0.7, 1.8);
    h._bsKey = key; h._bs = s;
    return s;
  };

  /* ---------- 규칙을 바꾸는 별조각 (game.js · units.js 가 부른다) ---------- */
  const STARCOL = '#ffe9a0';
  /* 길잡이별: 내 치유·보호막을 받은 아군은 잠깐 더 아프게 때린다 */
  TW.boonGuided = function (G, src, tg) { if (!tg.dead) G.addBuff(tg, { id: 'guided', dur: 4, dmgOut: 0.12, fx: 'empower', color: '#fff0b0', quiet: true }); };
  /* 꺼지지 않는 별: 쓰러질 피해를 받은 그 순간 (damage 안) */
  TW.boonEmber = function (G, h) {
    h.hp = h.maxHp * 0.35; h.emberT = G.t + 90; h.invulnT = G.t + 1.5;
    G.cleanse(h);
    G.fx('pillar', { x: h.x, y: h.y, r: 1.8, color: STARCOL, dur: 0.7, follow: h });
    G.fx('ring', { x: h.x, y: h.y, r0: 0.6, r1: 5, dur: 0.45, color: STARCOL, w: 0.4 });
    G.fx('text', { x: h.x, y: h.y, text: '버텼다!', color: STARCOL, size: 1.3 });
    G.emit('boonProc', { u: h, id: 'ember', x: h.x, y: h.y });
  };
  /* 불씨 잇기: 스킬을 맞혔다 → 다음 기본 공격이 더 아프고 잠깐 빨라진다 */
  TW.boonKindle = function (G, h) {
    if (h.dead) return;
    G.addBuff(h, { id: 'kindle', dur: 3, fx: 'empower', color: '#ffb46a', quiet: true });
    G.addBuff(h, { id: 'kindleMs', dur: 2, msPct: 0.2, quiet: true });
  };
  /* 기본 공격이 맞았다 (영웅 · 첫 타 · 구조물 아님) */
  TW.boonAttack = function (G, src, tg, dmg) {
    const f = src.bf;
    if (f.kindle && src.getBuff('kindle')) {
      src.removeBuff('kindle', true);
      if (!tg.dead) G.damage(src, tg, kindleDmg(src), 'magic', { proc: true, name: '불씨 잇기' });
      G.fx('flash', { x: tg.x, y: tg.y, r: 2, color: '#ffb46a', dur: 0.2 });
    }
    if (f.tri && ++src.bnAtk % 3 === 0) {
      const d = triDmg(src);
      for (const e of G.enemiesIn(src.team, tg.x, tg.y, 3)) G.damage(src, e, d, 'magic', { proc: true, name: '세 번째 별' });
      G.fx('shock', { x: tg.x, y: tg.y, r: 3, color: STARCOL, dur: 0.32 });
      G.fx('burst', { x: tg.x, y: tg.y, n: 10, color: '#fff6d0', speed: 9, life: 0.4 });
      G.emit('boonProc', { u: src, id: 'tri', x: tg.x, y: tg.y });
    }
  };
  /* 쌍둥이별: 기본 공격이 나가는 순간, 가까운 다른 적 하나에게도 */
  TW.boonTwin = function (G, u, tg) {
    let best = null, bd = 5.5;
    for (const e of G.enemiesIn(u.team, tg.x, tg.y, 5.5)) { if (e === tg || !G.canTarget(u, e)) continue; const d = U.du(e, tg); if (d < bd) { bd = d; best = e; } }
    if (!best) return;
    if (u.ranged) G.launch(u, best, u.ad * 0.6, 'phys', false, 0.4);
    else { G.fx('bolt', { x1: tg.x, y1: tg.y, x2: best.x, y2: best.y, color: '#e8d8ff', dur: 0.18 }); G.attackHit(u, best, u.ad * 0.6, 'phys', false); }
  };
  /* 스킬이 나갔다: 별폭풍 · (궁극기) 두 번 뜨는 별 · 별똥 부르기 */
  TW.boonCast = function (G, h, slot, ab) {
    const f = h.bf;
    if (f.nova) {
      const d = novaDmg(h);
      for (const e of G.enemiesIn(h.team, h.x, h.y, 4.2)) { G.damage(h, e, d, 'magic', { proc: true, name: '별폭풍' }); if (!e.dead) G.slow(h, e, 0.2, 1); }
      G.fx('ring', { x: h.x, y: h.y, r0: 0.6, r1: 4.2, dur: 0.3, color: '#e0c8ff', w: 0.35 });
      G.fx('burst', { x: h.x, y: h.y, n: 10, color: '#f3e8ff', speed: 9, life: 0.4 });
    }
    if (!ab.ult) return;
    if (f.twice) G.addBuff(h, { id: 'twice', dur: 5, dmgOut: 0.15, fx: 'empower', color: '#d3b0ff', quiet: true });
    if (f.meteor) {
      const d = meteorDmg(h), list = [];
      for (const e of G.heroes) if (!e.dead && e.team !== h.team && e.seen[h.team] && U.du(e, h) <= 15) list.push(e);
      list.sort((a, b) => U.du(a, h) - U.du(b, h) || a.id - b.id);
      for (const e of list.slice(0, 3)) G.zone({
        src: h, x: e.x, y: e.y, radius: 2.8, delay: 0.9, vis: { kind: 'spout', color: '#ffe680', danger: true },
        onBlast(z) {
          for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius)) G.damage(h, u, d, 'magic', { proc: true, name: '별똥 부르기' });
          G.fx('pillar', { x: z.x, y: z.y, r: z.radius * 0.8, color: '#fff2a8', dur: 0.45 }); G.fx('shock', { x: z.x, y: z.y, r: z.radius, color: '#ffe680', dur: 0.35 });
          G.fx('shake', { x: z.x, y: z.y, amp: 0.4 }); G.emit('sfx', { name: 'spout', x: z.x, y: z.y });
        },
      });
    }
  };
  /* 영웅을 처치했거나 도왔다: 되감기별 · 별 사냥꾼 */
  TW.boonTakedown = function (G, a, v) {
    const f = a.bf;
    if (f.rewind && !a.dead) {
      for (let i = 0; i < 4; i++) a.cds[i] *= 0.4;
      G.heal(a, a, (a.maxHp - a.hp) * 0.15);
      G.fx('text', { x: a.x, y: a.y, text: '되감기!', color: '#ffd24a', size: 1.05 });
    }
    if (f.hunt) { a.hunt++; a.recalc(); G.emit('boonProc', { u: a, id: 'hunt', n: a.hunt, x: a.x, y: a.y }); }
  };

  /* ---------- 판 결과 등급 (모든 놀이 방식) ----------
     한 판이 끝나면 영웅마다 100점 만점으로 매긴다 → 실버(50점 아래) · 골드(50점부터) · 프리즘(75점부터). 별조각 카드와 같은 세 등급 · 같은 빛깔이다.
       이겼나 35(졌으면 12) · 싸움 30 = (처치 + 도움×0.6) ÷ 죽음 이 4 이상이면 만점 · 몫 20 = 우리 편의 영웅 피해+치유 가운데 내 몫 · 밀기 15 = 우리 편의 구조물 피해 가운데 내 몫
     '몫'은 한 사람의 공평한 몫(1/인원)의 1.5배면 만점이다. 결과 화면(recap.js)이 내 등급과 점수의 속을 보여 주고, 가장 높았던 등급은 놀이 방식마다 브라우저에 남는다 */
  TW.GRADE_AT = [0, 50, 75];
  TW.gradeOf = function (G, h) {
    let dmg = 0, st = 0;
    for (const q of G.heroes) if (q.team === h.team) { dmg += q.stats.dmg + q.stats.heal * 1.2; st += q.stats.struct; }
    const n = G.size || 5, kda = (h.kills + 0.6 * h.assists) / Math.max(1, h.deaths);
    const win = G.winner === h.team ? 35 : 12;
    const fight = Math.round(U.clamp(kda / 4, 0, 1) * 30);
    const share = Math.round(U.clamp((dmg > 0 ? (h.stats.dmg + h.stats.heal * 1.2) / dmg : 0) * n / 1.5, 0, 1) * 20);
    const push = Math.round(U.clamp((st > 0 ? h.stats.struct / st : 0) * n / 1.5, 0, 1) * 15);
    const score = win + fight + share + push, tier = score >= TW.GRADE_AT[2] ? 2 : score >= TW.GRADE_AT[1] ? 1 : 0;
    return { score, tier, parts: [['승패', win, 35], ['싸움', fight, 30], ['몫', share, 20], ['밀기', push, 15]], next: tier < 2 ? TW.GRADE_AT[tier + 1] - score : 0 };
  };
  /* 가장 높았던 등급 (놀이 방식마다) — 브라우저에 남긴다. 저장할 곳이 없으면(시험 도구 등) 기억만 한다 */
  const GKEY = 'eoseureum_grade_v1';
  TW.Grades = {
    data: null,
    load() { if (this.data) return this.data; let d = null; try { d = JSON.parse(globalThis.localStorage.getItem(GKEY) || 'null'); } catch (e) { d = null; } this.data = d && typeof d === 'object' ? d : {}; return this.data; },
    best(mode) { const d = this.load()[mode]; return d && d.best >= 0 ? d.best : -1; },
    count(mode) { const d = this.load()[mode]; return d ? d.n || 0 : 0; },
    save(mode, tier) {
      const D = this.load(), d = D[mode] = D[mode] || { best: -1, n: 0, by: [0, 0, 0] }, up = tier > d.best;
      d.n++; d.by[tier] = (d.by[tier] || 0) + 1; if (up) d.best = tier;
      try { globalThis.localStorage.setItem(GKEY, JSON.stringify(D)); } catch (e) { /* 저장 못 해도 진행 */ }
      return up;
    },
  };

  /* ---------- 봇의 고르기 · 사람에게 붙이는 '추천' ----------
     영웅의 구실마다 별조각 성격(tags)에 매기는 점수. 가장 높은 것을 고른다 (봇은 조금 흔들어서 — 판마다 같은 것만 고르지 않게) */
  const PREF = {
    tank:     { hp: 3, def: 3, cc: 2.5, sustain: 2, melee: 2, ult: 1, cd: 1, ms: 0.5 },
    fighter:  { ad: 3, sustain: 2.5, hp: 2, as: 2, melee: 2, cd: 1.5, ms: 1, ult: 1 },
    bruiser:  { hp: 3, sustain: 2.5, ad: 2.5, melee: 2.5, def: 2, as: 1.5, ult: 1.5 },
    assassin: { ad: 3, cd: 2, ms: 2, ult: 2, sustain: 1.5, as: 1 },
    marksman: { ad: 3, as: 3, ranged: 2.5, ms: 1.5, sustain: 1 },
    sniper:   { ad: 3, ranged: 3, cd: 2.5, ult: 2, ms: 1.5, as: 1 },
    mage:     { ap: 3, cd: 3, ult: 2, ranged: 2, ms: 1 },
    engineer: { ap: 3, cd: 3, ranged: 2, hp: 1.5, ult: 1.5 },
    support:  { sup: 4, cd: 3, ap: 2, hp: 1.5, ms: 1.5, ult: 1 },
    catcher:  { hp: 3, cc: 3, def: 2, cd: 2, melee: 1.5, ult: 1 },
  };
  TW.boonScore = function (h, id) {
    const b = B[id], p = PREF[h.hd.role] || PREF.fighter; let s = 0.5;
    for (const t of b.tags) s += t === 'gold' ? 1.6 : (p[t] || 0);
    return s;
  };
  TW.boonBest = function (h, ids, rng) {
    let bi = 0, bs = -1e9;
    for (let i = 0; i < ids.length; i++) { const s = TW.boonScore(h, ids[i]) + (rng ? rng() * 1.5 : 0); if (s > bs) { bs = s; bi = i; } }
    return bi;
  };

  /* ---------- 별비의 진행 (Game 에 붙인다) ---------- */
  TW.starSetup = function (G) {
    // sf: n = 지금까지 내린 별비 수 · nextT = 다음 별비 시각 · tier = 가장 최근 별비의 등급 · warned = 다음 별비를 알렸나
    G.sf = { n: 0, nextT: C.STAR.TIMES[0], tier: -1, warned: false, lastT: -99, tiers: [] };
    G.stat.star = { falls: [], picks: [], auto: 0, rerolls: 0, byTier: [0, 0, 0], byId: {} };
    for (const h of G.heroes) h.rerolls = C.STAR.REROLLS;
  };
  const GP = TW.Game.prototype;
  GP.updateStar = function () {
    const S = C.STAR, sf = this.sf, t = this.t;
    if (sf.n < S.TIMES.length) {
      if (!sf.warned && sf.n > 0 && t >= sf.nextT - S.WARN) { sf.warned = true; if (sf.nextT - t > 1) this.emit('starWarn', { at: sf.nextT, n: sf.n + 1 }); }      // 예고 (이미 코앞이면 알리지 않는다)
      if (t >= sf.nextT) this.starFall();
    }
    // 고르기: 봇은 잠깐 뒤에 제 구실에 맞는 것을 · 사람은 시간이 다 되면 추천 카드가 골라진다
    const hs = this.heroes;
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i], o = h.offer; if (!o) continue;
      if (h.brain) { if (t >= o.botAt) this.pickBoon(h, TW.boonBest(h, o.ids, this.rng), false); }
      else if (t >= o.until) this.pickBoon(h, TW.boonBest(h, o.ids, null), true);
    }
  };
  /* 별비가 내린다: 등급을 한 번 뽑고(모두 같다), 영웅마다 그 등급의 카드 셋을 낸다 */
  GP.starFall = function () {
    const S = C.STAR, sf = this.sf, w = S.TIER_W[Math.min(sf.n, S.TIER_W.length - 1)];
    let r = this.rng() * (w[0] + w[1] + w[2]), tier = 0;
    if (r >= w[0]) tier = r < w[0] + w[1] ? 1 : 2;
    sf.n++; sf.tier = tier; sf.lastT = this.t; sf.warned = false; sf.tiers.push(tier);
    sf.nextT = sf.n < S.TIMES.length ? S.TIMES[sf.n] : 1e9;
    this.stat.star.falls.push({ t: this.t, n: sf.n, tier });
    this.emit('starFall', { n: sf.n, tier, of: S.TIMES.length });
    for (const h of this.heroes) {
      if (h.offer) this.pickBoon(h, TW.boonBest(h, h.offer.ids, null), true);       // 아직 안 고른 지난 카드는 추천으로 (보통은 일어나지 않는다)
      h.offer = { n: sf.n, tier, ids: this.boonDraw(h, tier, null), at: this.t, until: this.t + S.PICK_SEC, botAt: this.t + 1.2 + this.rng() * 2.6 };
      this.emit('boonOffer', { u: h, n: sf.n, tier });
    }
  };
  /* 카드 셋 뽑기: 그 등급에서 · 아직 안 가진 것 · 이 영웅에게 쓸모 있는 것. avoid = 다시 뽑을 때 방금 본 것은 되도록 피한다 */
  GP.boonDraw = function (h, tier, avoid) {
    const ok = (id) => B[id].tier === tier && h.boons.indexOf(id) < 0 && (!B[id].fit || B[id].fit(h));
    let pool = TW.BoonOrder.filter(id => ok(id) && !(avoid && avoid.indexOf(id) >= 0));
    if (pool.length < 3) pool = TW.BoonOrder.filter(ok);
    const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
    return out;
  };
  /* 못 고르는 까닭: 'none'(받은 카드가 없다) · 'idx' — 고를 수 있으면 null */
  GP.boonWhy = function (h, idx) { const o = h && h.offer; if (!o || this.over) return 'none'; if (!(idx >= 0 && idx < o.ids.length)) return 'idx'; return null; };
  GP.pickBoon = function (h, idx, auto) {
    if (this.boonWhy(h, idx)) return false;
    const o = h.offer, id = o.ids[idx], b = B[id], S = this.stat.star;
    h.offer = null; h.boons.push(id);
    if (b.stacks) h.hunt += b.stacks;
    h.recalc();
    if (b.gold) { const g = h.addGold(b.gold); if (!h.dead) this.emit('gold', { u: h, amt: g, x: h.x, y: h.y, reason: 'boon' }); }
    S.picks.push({ t: this.t, n: o.n, team: h.team, hero: h.heroId, id, tier: b.tier, auto: !!auto, human: !!h.isPlayer, wait: this.t - o.at });
    S.byTier[b.tier]++; S.byId[id] = (S.byId[id] || 0) + 1; if (auto) S.auto++;
    if (!h.dead) {
      const T = TW.BOON_TIERS[b.tier];
      this.fx('pillar', { x: h.x, y: h.y, r: 1.5, color: T.col, dur: 0.6, follow: h });
      this.fx('ring', { x: h.x, y: h.y, r0: 0.5, r1: 3.6, dur: 0.4, color: T.glow, w: 0.3 });
      this.fx('text', { x: h.x, y: h.y, text: '★ ' + b.name, color: T.glow, size: 1.05 });
    }
    this.emit('boon', { u: h, id, tier: b.tier, n: o.n, auto: !!auto, x: h.x, y: h.y });
    return true;
  };
  /* 다시 뽑기: 받은 카드 셋을 같은 등급의 다른 셋으로 (한 판에 C.STAR.REROLLS번) */
  GP.rerollBoon = function (h) {
    const o = h && h.offer; if (!o || this.over || !(h.rerolls > 0)) return false;
    h.rerolls--; o.ids = this.boonDraw(h, o.tier, o.ids); o.rolled = (o.rolled || 0) + 1;
    this.stat.star.rerolls++;
    this.emit('boonReroll', { u: h, n: o.n, tier: o.tier });
    return true;
  };
})();
