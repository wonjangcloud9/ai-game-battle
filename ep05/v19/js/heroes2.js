/* 어스름 전선 — heroes2: 19차에 새로 온 영웅 셋 (data.js 바로 뒤에 불러온다)
   "영웅 수가 적다"는 말에 맞춰, 예전 여덟에게 없던 구실 셋을 더했다 — 이름·생김새·스킬은 모두 이 게임에서 새로 지었다:
     9.  우레  천둥 북잡이   (싸움꾼 · 근접)  박자를 쌓아 네 박자째에 천둥을 떨어뜨리고, 싸움 한복판에서 버티며 친다
     10. 솔개  솔개 궁사     (저격수 · 원거리) 멀수록 아프다. 화면 끝에서 화살 한 대, 덫으로 길목을 막는다
     11. 풀무  불가마 대장장이 (설치가 · 원거리) 화로를 놓아 자리를 만든다. 화로 곁에 있을수록 세다
   스킬 코드는 data.js 의 영웅들과 같은 Game(G) API 만 쓴다. 봇의 손은 aiskills.js, 그림은 art.js, 장판 그림은 worlddraw.js */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, H = TW.Heroes, val = TW.val;
  const SK = [{ skill: 0 }, { skill: 1 }, { skill: 2 }, { skill: 3 }], PAS = { skill: 4 };
  function aoe(G, src, x, y, r, dmg, kind, opts, each) {
    const list = G.enemiesIn(src.team, x, y, r);
    for (const u of list) { G.damage(src, u, dmg, kind, opts); if (each && !u.dead) each(u); }
    return list;
  }

  /* =====================================================================
     9. 우레 — 천둥 북잡이 (싸움꾼 · 근접)  "칠수록 박자가 쌓이고, 네 박자째에 천둥이 떨어진다"
     ===================================================================== */
  const beatOf = (h) => ((h.getBuff('beat') || {}).stacks || 0);
  function gainBeat(G, h, n) {
    const st = Math.min(4, beatOf(h) + (n || 1));
    G.addBuff(h, { id: 'beat', dur: 6, stacks: st, fx: st >= 4 ? 'empower' : null, color: '#ffd24a', quiet: true });
    if (st >= 4 && !h.st.beatFull) { h.st.beatFull = true; G.fx('text', { x: h.x, y: h.y, text: '네 박자!', color: '#ffe680', size: 0.95 }); }
  }
  const thunderDmg = (h) => val(h, 40, 12, 0.45);
  H.ure = {
    id: 'ure', name: '우레', title: '천둥 북잡이', role: 'bruiser', roleName: '싸움꾼', pos: { top: 3, jg: 2, sup: 1 }, diff: 1, scale: 'ad', fresh: true,
    blurb: '배에 큰북을 멘 반달곰. 북을 칠 때마다 박자가 쌓이고, 네 박자째 주먹에는 천둥이 실립니다. 맞으면서 치는 싸움꾼입니다.',
    feel: '둥 · 둥 · 둥 · 쾅! · 싸움 한복판에서 버틴다',
    color: '#5c3d2e', glow: '#ffd24a', ranged: false,
    base: { hp: 830, hpG: 106, ad: 63, adG: 3.5, as: 0.7, asG: 0.018, def: 30, defG: 3.3, ms: 7.5, range: 2.7, regen: 4 },
    build: ['hammer', 'boots', 'heart', 'hammer', 'bark', 'hammer', 'heart', 'fang', 'bark', 'heart', 'fang', 'halo', 'bark', 'fang', 'halo', 'boots'],
    passive: { name: '북장단', icon: 'drum', desc: (h) => `기본 공격이나 스킬을 맞힐 때마다 박자가 쌓입니다(최대 4, 6초). 네 박자가 차면 다음 기본 공격이 천둥을 불러 주변 적에게 ${thunderDmg(h)}의 피해를 주고, 우레는 ${val(h, 30, 9, 0, 0, 0.04)}의 체력을 회복합니다.` },
    atkBonus: (h) => (beatOf(h) >= 4 ? thunderDmg(h) : 0),
    onAttack(G, h, tg) {
      if (tg.isStruct) return;
      if (beatOf(h) >= 4) {
        h.removeBuff('beat', true); h.st.beatFull = false;
        aoe(G, h, tg.x, tg.y, 3.6, thunderDmg(h), 'magic', { skill: 4, big: true });
        G.heal(h, h, val(h, 30, 9, 0, 0, 0.04));
        G.fx('pillar', { x: tg.x, y: tg.y, r: 1.6, color: '#fff2a8', dur: 0.4 }); G.fx('shock', { x: tg.x, y: tg.y, r: 3.6, color: '#ffd24a', dur: 0.35 });
        G.fx('shake', { x: tg.x, y: tg.y, amp: 0.4 }); G.fx('text', { x: tg.x, y: tg.y, text: '쾅!', color: '#ffe680', size: 1.2 });
        G.emit('sfx', { name: 'slam', x: tg.x, y: tg.y });
      } else gainBeat(G, h, 1);
    },
    abilities: [
      {
        key: 'Q', name: '북채 내려치기', icon: 'drumhit', type: 'dir', range: 6.2, angle: 0.62, cd: 6, castTime: 0.18, ind: 'cone',
        desc: (h) => `앞쪽 부채꼴을 북채로 내려쳐 ${val(h, 55, 13, 0.6)}의 피해를 주고 1초간 30% 느리게 합니다. 맞히면 박자 +1 (영웅을 맞히면 +2).`,
        cast(G, h, t) {
          const dmg = val(h, 55, 13, 0.6), ang = Math.atan2(t.dy, t.dx); let hero = false, any = false;
          for (const u of G.enemiesInCone(h.team, h.x, h.y, ang, 0.62, 6.2)) { G.damage(h, u, dmg, 'phys', SK[0]); if (!u.dead) G.slow(h, u, 0.3, 1); any = true; if (u.isHero) hero = true; }
          if (any) gainBeat(G, h, hero ? 2 : 1);
          G.fx('slash', { x: h.x, y: h.y, ang, r: 5.6, arc: 1.3, color: '#ffe0a0', dur: 0.22 });
          G.fx('shake', { x: h.x, y: h.y, amp: 0.25 });
          G.emit('sfx', { name: 'slam', x: h.x + t.dx * 3, y: h.y + t.dy * 3 });
        },
      },
      {
        key: 'W', name: '울림막', icon: 'drumwall', type: 'self', radius: 4.4, cd: 13, castTime: 0, ind: 'self',
        desc: (h) => `북을 울려 2.6초 동안 받는 피해를 25% 줄이고, 0.5초마다 주변 적에게 ${val(h, 14, 4, 0.1)}의 피해를 줍니다. 박자 +1.`,
        cast(G, h) {
          const dmg = val(h, 14, 4, 0.1);
          G.addBuff(h, { id: 'ureW', dur: 2.6, dmgTaken: -0.25, fx: 'shell', color: '#ffd24a' });
          G.zone({ src: h, x: h.x, y: h.y, radius: 4.4, delay: 0, dur: 2.6, tick: 0.5, follow: h, vis: { kind: 'spin', color: '#ffd24a' }, onTick(z) { aoe(G, h, z.x, z.y, z.radius, dmg, 'magic', SK[1]); G.fx('ring', { x: z.x, y: z.y, r0: 1, r1: z.radius, dur: 0.3, color: '#ffe680', w: 0.18 }); } });
          gainBeat(G, h, 1);
        },
      },
      {
        key: 'E', name: '뜀박질', icon: 'drumdash', type: 'dir', range: 7.5, width: 2.6, cd: 11, castTime: 0, ind: 'dash',
        desc: (h) => `앞으로 내달리며 부딪힌 적 모두에게 ${val(h, 45, 11, 0.5)}의 피해를 주고 0.5초간 띄웁니다. 영웅과 부딪히면 박자 +1.`,
        cast(G, h, t) {
          const dmg = val(h, 45, 11, 0.5);
          G.dash(h, h.x + t.dx * 7.5, h.y + t.dy * 7.5, 30, {
            hitR: 1.7, through: true, trail: '#ffd24a', kind: 'ram',
            onHit(u) { G.damage(h, u, dmg, 'phys', SK[2]); if (!u.dead) G.knockup(h, u, 0.5); if (u.isHero) gainBeat(G, h, 1); G.fx('sparks', { x: u.x, y: u.y, ang: Math.atan2(t.dy, t.dx), spread: 1.2, n: 8, color: '#ffe680', speed: 11 }); },
          });
        },
      },
      {
        key: 'R', name: '천둥 장단', icon: 'thunder', type: 'self', radius: 6, cd: 80, castTime: 0.15, ult: true, ind: 'self',
        chan: { dur: 3.0, tick: 0.5, canMove: true, moveMul: 0.85, turn: 8 },
        desc: (h) => `3초 동안 걸으면서 북을 여섯 번 칩니다. 칠 때마다 주변 적에게 ${val(h, 34, 8, 0.24)}의 피해를 주고 20% 느리게 하며, 마지막 여섯 번째에는 천둥이 떨어져 ${val(h, 110, 24, 0.5)}의 피해와 함께 1초간 기절시킵니다.`,
        cast() { },
        onTick(G, h, ch) {
          if (ch.n >= 6) return;
          const last = ch.n === 5, dmg = last ? val(h, 110, 24, 0.5) : val(h, 34, 8, 0.24);
          for (const u of G.enemiesIn(h.team, h.x, h.y, 6)) { G.damage(h, u, dmg, 'magic', last ? { skill: 3, big: true } : SK[3]); if (u.dead) continue; if (last) G.stun(h, u, 1.0); else G.addBuff(u, { id: 'ureR', dur: 0.8, slow: 0.2, src: h, quiet: true }); }
          G.fx('ring', { x: h.x, y: h.y, r0: 0.8, r1: 6, dur: last ? 0.45 : 0.3, color: last ? '#ffffff' : '#ffd24a', w: last ? 0.5 : 0.25 });
          if (last) { G.fx('pillar', { x: h.x, y: h.y, r: 3, color: '#fff2a8', dur: 0.5 }); G.fx('shock', { x: h.x, y: h.y, r: 6, color: '#ffd24a', dur: 0.5 }); G.fx('shake', { x: h.x, y: h.y, amp: 0.8 }); G.fx('text', { x: h.x, y: h.y, text: '쾅!!', color: '#ffe680', size: 1.4 }); }
          else G.fx('shake', { x: h.x, y: h.y, amp: 0.16 });
          G.emit('sfx', { name: last ? 'landslide' : 'slam', x: h.x, y: h.y, n: ch.n });
        },
      },
    ],
  };

  /* =====================================================================
     10. 솔개 — 솔개 궁사 (저격수 · 원거리)  "멀수록 아프다. 화면 끝에서 한 대"
     ===================================================================== */
  /* 먼눈: 6칸부터 14칸까지 멀수록 최대 +30% */
  const farK = (h, u) => U.clamp((Math.hypot(u.x - h.x, u.y - h.y) - 6) / 8, 0, 1) * 0.3;
  function snareCount(G, h) { let n = 0, first = null; for (const z of G.zones) if (z.snare && z.src === h && !z.done) { n++; if (!first) first = z; } return { n, first }; }
  H.solgae = {
    id: 'solgae', name: '솔개', title: '솔개 궁사', role: 'sniper', roleName: '저격수', pos: { carry: 3, mid: 2 }, diff: 2, scale: 'ad', fresh: true,
    blurb: '솔개 깃 도롱이를 두른 활잡이. 멀리 있을수록 화살이 아픕니다. 덫으로 길목을 막고, 화면 끝에서 한 대로 끝냅니다.',
    feel: '멀수록 아프다 · 긴 화살 한 대 · 덫',
    color: '#7a5c3a', glow: '#ff9a5a', ranged: true, proj: { kind: 'bolt', speed: 54, color: '#ffd9a0' },
    base: { hp: 625, hpG: 82, ad: 64, adG: 4.0, as: 0.66, asG: 0.018, def: 20, defG: 2.7, ms: 7.5, range: 12.5, regen: 2 },
    build: ['blade', 'boots', 'bolt', 'blade', 'bolt', 'blade', 'glass', 'bolt', 'rein', 'glass', 'fang', 'rein', 'glass', 'fang', 'rein', 'charm'],
    passive: { name: '먼눈', icon: 'eye', desc: () => '멀리 있는 적일수록 아프게 맞힙니다. 6칸부터 14칸까지, 기본 공격과 스킬의 피해가 최대 30% 늘어납니다.' },
    atkBonus: (h, u) => (u ? h.ad * farK(h, u) : 0),
    onAttack(G, h, tg) { if (tg.isStruct) return; const k = farK(h, tg); if (k > 0.01 && !tg.dead) G.damage(h, tg, h.ad * k, 'phys', PAS); },
    abilities: [
      {
        key: 'Q', name: '꿰는 살', icon: 'longshot', type: 'dir', range: 23, width: 1.5, cd: 7, castTime: 0.28, ind: 'line', judge: 0.6,
        desc: (h) => `멀리 날아가는 화살을 쏘아 처음 맞은 적에게 ${val(h, 78, 17, 0.95)}의 피해를 줍니다. 멀리서 맞힐수록 아픕니다(최대 +30%).`,
        cast(G, h, t) {
          const dmg = val(h, 78, 17, 0.95);
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 62, range: 23, radius: 0.75, slot: 0,
            vis: { kind: 'firebolt', color: '#ffd9a0', size: 1.3 },
            onHit(u) { const k = farK(h, u); G.damage(h, u, dmg * (1 + k), 'phys', k > 0.2 ? { skill: 0, big: true } : SK[0]); if (k > 0.2 && u.isHero) G.fx('text', { x: u.x, y: u.y, text: '먼 화살!', color: '#ffd9a0', size: 1.0 }); },
          });
        },
      },
      {
        key: 'W', name: '올무', icon: 'snare', type: 'ground', range: 11, radius: 1.9, cd: 14, castTime: 0.1, ind: 'circle', judge: 0,
        desc: (h) => `지정한 곳에 올무를 놓습니다(25초 · 최대 2개). 0.8초 뒤부터 적 영웅이 밟으면 ${val(h, 50, 12, 0.4)}의 피해를 주고 1.3초간 묶으며, 3초 동안 모습을 드러냅니다.`,
        cast(G, h, t) {
          const dmg = val(h, 50, 12, 0.4), c = snareCount(G, h);
          if (c.n >= 2 && c.first) c.first.done = true;
          const trap = G.zone({
            src: h, x: t.x, y: t.y, radius: 1.9, delay: 0.8, dur: 25, tick: 0.12, lob: { x: h.x, y: h.y }, vis: { kind: 'snare', color: '#ffb46a' },
            onTick(z) {
              for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius - 0.5, { minions: false, monsters: false })) {
                G.damage(h, u, dmg, 'phys', { skill: 1, big: true }); if (!u.dead) { G.root(h, u, 1.3); G.reveal(u, 3); }
                G.fx('ring', { x: z.x, y: z.y, r0: z.radius, r1: 0.3, dur: 0.25, color: '#ffb46a', w: 0.3 }); G.fx('text', { x: u.x, y: u.y, text: '걸렸다!', color: '#ffd9a0', size: 1.1 });
                G.emit('sfx', { name: 'hooked', x: z.x, y: z.y });
                z.done = true; break;
              }
            },
          });
          trap.snare = true;
        },
      },
      {
        key: 'E', name: '깃털 걸음', icon: 'backstep', type: 'dir', range: 6.5, width: 2, cd: 12, castTime: 0, ind: 'dash', judge: 0,
        desc: () => '커서 쪽으로 가볍게 몸을 날립니다. 떠난 자리에는 2.5초 동안 깃털 먼지가 남아 적을 40% 느리게 합니다. 다음 기본 공격이 바로 나갑니다.',
        cast(G, h, t) {
          const ox = h.x, oy = h.y;
          G.zone({ src: h, x: ox, y: oy, radius: 3.2, delay: 0, dur: 2.5, tick: 0.25, vis: { kind: 'sticky', color: '#ffd9a0' }, onTick(z) { for (const u of G.enemiesIn(h.team, z.x, z.y, z.radius)) G.addBuff(u, { id: 'featherSlow', dur: 0.4, slow: 0.4, src: h, quiet: true }); } });
          G.dash(h, h.x + t.dx * 6.5, h.y + t.dy * 6.5, 34, { trail: '#ffd9a0', kind: 'step' });
          h.atkCd = Math.min(h.atkCd, 0.05);
        },
      },
      {
        key: 'R', name: '해 가르는 살', icon: 'sunshot', type: 'dir', range: 60, width: 3, cd: 90, castTime: 0.85, ult: true, ind: 'line',
        desc: (h) => `0.85초 동안 시위를 당겼다가 전장을 가로지르는 화살을 쏩니다. 지나가는 모든 적에게 ${val(h, 190, 40, 1.1)}의 피해를 주고(꿰뚫을 때마다 15%씩 줄어 최소 55%), 맞은 영웅은 1.5초간 40% 느려집니다.`,
        cast(G, h, t) {
          const dmg = val(h, 190, 40, 1.1); let n = 0;
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 72, range: 60, radius: 1.5, pierce: true, slot: 3,
            vis: { kind: 'firebolt', color: '#ffb46a', size: 2.2 },
            onHit(u) { G.damage(h, u, dmg * Math.max(0.55, 1 - 0.15 * n), 'phys', { skill: 3, big: true }); n++; if (u.isHero && !u.dead) G.slow(h, u, 0.4, 1.5); G.fx('sparks', { x: u.x, y: u.y, ang: Math.atan2(t.dy, t.dx), spread: 0.9, n: 8, color: '#ffe0b0', speed: 13 }); },
          });
          G.fx('beam', { x1: h.x, y1: h.y, x2: h.x + t.dx * 9, y2: h.y + t.dy * 9, w: 1.1, color: '#ffe0b0', dur: 0.25 });
          G.fx('shake', { x: h.x, y: h.y, amp: 0.4 });
          G.emit('sfx', { name: 'beam', x: h.x, y: h.y, k: 1 });
        },
      },
    ],
  };

  /* =====================================================================
     11. 풀무 — 불가마 대장장이 (설치가 · 원거리)  "화로를 놓아 자리를 만든다"
     ===================================================================== */
  const forges = (G, h) => G.zones.filter(z => z.forge && z.src === h && !z.done);
  H.pulmu = {
    id: 'pulmu', name: '풀무', title: '불가마 대장장이', role: 'engineer', roleName: '설치가', pos: { mid: 3, sup: 2, carry: 1 }, diff: 2, scale: 'ap', fresh: true,
    blurb: '등에 작은 가마를 진 너구리 대장장이. 화로를 놓아 자리를 만들고, 그 곁에서 메를 던집니다. 자리를 잡은 풀무는 밀어내기 어렵습니다.',
    feel: '화로를 놓고 버틴다 · 달군 메 던지기',
    color: '#6e4b3a', glow: '#ff8a3c', ranged: true, proj: { kind: 'ember', speed: 30, color: '#ffb46a' },
    base: { hp: 705, hpG: 90, ad: 52, adG: 2.7, as: 0.68, asG: 0.015, def: 24, defG: 3.0, ms: 7.4, range: 9.5, regen: 3 },
    build: ['orb', 'boots', 'flint', 'orb', 'glass', 'orb', 'flint', 'glass', 'fan', 'flint', 'glass', 'fan', 'charm', 'fan', 'charm', 'boots'],
    passive: { name: '달군 쇠', icon: 'anvil', desc: () => '내 화로 곁(7칸)에 있으면 방어력 +20, 스킬 재사용이 15% 빨리 돕니다.' },
    onTick(G, h, dt) {
      h.st.forgeT = (h.st.forgeT || 0) - dt; if (h.st.forgeT > 0) return; h.st.forgeT = 0.3;
      for (const z of G.zones) if (z.forge && z.src === h && !z.done && z.active && U.dist2(z.x, z.y, h.x, h.y) <= 49) { G.addBuff(h, { id: 'forgeNear', dur: 0.5, def: 20, cdRate: 0.15, quiet: true }); break; }
    },
    abilities: [
      {
        key: 'Q', name: '불똥 메', icon: 'sparkhammer', type: 'dir', range: 14, width: 1.7, cd: 6, castTime: 0.14, ind: 'line', judge: 0.6,
        desc: (h) => `달군 메를 던져 처음 맞은 적에게 ${val(h, 70, 15, 0, 0.62)}의 피해를 주고 1초간 25% 느리게 합니다. 맞은 자리에서 불똥이 튀어 둘레의 다른 적에게 절반의 피해를 줍니다.`,
        cast(G, h, t) {
          const dmg = val(h, 70, 15, 0, 0.62);
          G.skillshot({
            src: h, x: h.x, y: h.y, dx: t.dx, dy: t.dy, speed: 34, range: 14, radius: 0.85, slot: 0,
            vis: { kind: 'ember', color: '#ff8a3c', size: 1.4 },
            onHit(u) {
              G.damage(h, u, dmg, 'magic', SK[0]); if (!u.dead) G.slow(h, u, 0.25, 1);
              for (const e of G.enemiesIn(h.team, u.x, u.y, 2.8)) if (e !== u) G.damage(h, e, dmg * 0.5, 'magic', SK[0]);
              G.fx('burst', { x: u.x, y: u.y, n: 12, color: '#ffb46a', speed: 9, life: 0.4 }); G.fx('ring', { x: u.x, y: u.y, r0: 0.4, r1: 2.8, dur: 0.25, color: '#ff8a3c', w: 0.2 });
            },
          });
        },
      },
      {
        key: 'W', name: '화로 놓기', icon: 'turret', type: 'ground', range: 9, radius: 1.5, cd: 13, castTime: 0.15, ind: 'circle', judge: 0,
        desc: (h) => `지정한 곳에 화로를 놓습니다(14초 · 최대 2개). 화로는 0.85초마다 9칸 안의 가장 가까운 적(영웅 먼저)에게 불씨를 쏘아 ${val(h, 27, 6, 0, 0.24)}의 피해를 줍니다. 불씨는 피할 수 있습니다.`,
        cast(G, h, t) {
          const dmg = val(h, 27, 6, 0, 0.24), mine = forges(G, h);
          if (mine.length >= 2) mine[0].done = true;
          const fz = G.zone({
            src: h, x: t.x, y: t.y, radius: 1.5, delay: 0.45, dur: 14, tick: 0.85, friendly: true, lob: { x: h.x, y: h.y }, vis: { kind: 'forge', color: '#ff8a3c' },
            onBlast(z) { G.fx('ring', { x: z.x, y: z.y, r0: 0.4, r1: 2.4, dur: 0.3, color: '#ffb46a', w: 0.22 }); G.emit('sfx', { name: 'ward', x: z.x, y: z.y }); },
            onTick(z) {
              let best = null, bs = 1e9;
              for (const u of G.enemiesIn(h.team, z.x, z.y, 9)) { if (!u.seen[h.team]) continue; const s = Math.hypot(u.x - z.x, u.y - z.y) - (u.isHero ? 20 : 0); if (s < bs) { bs = s; best = u; } }
              if (!best) return;
              const d = Math.hypot(best.x - z.x, best.y - z.y) || 1;
              G.skillshot({ src: h, x: z.x, y: z.y, dx: (best.x - z.x) / d, dy: (best.y - z.y) / d, speed: 30, range: 10.5, radius: 0.6, slot: 1, sub: true, vis: { kind: 'ember', color: '#ffb46a', size: 0.9 }, onHit(u) { G.damage(h, u, dmg, 'magic', SK[1]); } });
              z.shotT = G.t;
            },
          });
          fz.forge = true;
        },
      },
      {
        key: 'E', name: '풀무 바람', icon: 'bellows', type: 'dir', range: 6.6, angle: 0.62, cd: 11, castTime: 0.12, ind: 'cone', judge: 0,
        desc: (h) => `풀무질한 뜨거운 바람으로 앞쪽 부채꼴의 적을 뒤로 밀쳐 내고 ${val(h, 50, 12, 0, 0.4)}의 피해를 줍니다. 1.2초간 30% 느려집니다.`,
        cast(G, h, t) {
          const dmg = val(h, 50, 12, 0, 0.4), ang = Math.atan2(t.dy, t.dx);
          for (const u of G.enemiesInCone(h.team, h.x, h.y, ang, 0.62, 6.6)) {
            G.damage(h, u, dmg, 'magic', SK[2]); if (u.dead) continue;
            const d = Math.hypot(u.x - h.x, u.y - h.y) || 1; G.knockback(h, u, (u.x - h.x) / d, (u.y - h.y) / d, 3.2, 0.2); G.slow(h, u, 0.3, 1.2);
          }
          G.fx('slash', { x: h.x, y: h.y, ang, r: 6, arc: 1.3, color: '#ffb46a', dur: 0.25 });
          G.fx('sparks', { x: h.x + t.dx * 1.5, y: h.y + t.dy * 1.5, ang, spread: 1.1, n: 12, color: '#ffd0a0', speed: 14 });
        },
      },
      {
        key: 'R', name: '쇳물 붓기', icon: 'molten', type: 'ground', range: 12, radius: 6, cd: 85, castTime: 0.3, ult: true, ind: 'circle', judge: 1.0,
        desc: (h) => `0.8초 뒤 지정한 곳에 쇳물을 쏟아 ${val(h, 150, 32, 0, 0.7)}의 피해를 줍니다. 쇳물은 4초 동안 남아 0.5초마다 ${val(h, 24, 6, 0, 0.12)}의 피해를 주고 35% 느리게 합니다.`,
        cast(G, h, t) {
          const dmg = val(h, 150, 32, 0, 0.7), tick = val(h, 24, 6, 0, 0.12);
          G.zone({
            src: h, x: t.x, y: t.y, radius: 6, delay: 0.8, dur: 4, tick: 0.5, vis: { kind: 'molten', color: '#ff8a3c' },
            onBlast(z) {
              aoe(G, h, z.x, z.y, z.radius, dmg, 'magic', { skill: 3, big: true });
              G.fx('shock', { x: z.x, y: z.y, r: 6, color: '#ffb46a', dur: 0.5 }); G.fx('burst', { x: z.x, y: z.y, n: 26, color: '#ff8a3c', speed: 13, life: 0.6 });
              G.fx('shake', { x: z.x, y: z.y, amp: 0.75 }); G.emit('sfx', { name: 'orbburst', x: z.x, y: z.y });
            },
            onTick(z) { aoe(G, h, z.x, z.y, z.radius, tick, 'magic', SK[3], (u) => G.addBuff(u, { id: 'moltenSlow', dur: 0.7, slow: 0.35, src: h, quiet: true })); },
          });
        },
      },
    ],
  };

  /* 줄 세우기: 예전 여덟 뒤에 새 셋 */
  const NEW = ['ure', 'solgae', 'pulmu'];
  for (const id of NEW) { if (TW.HeroOrder.indexOf(id) < 0) TW.HeroOrder.push(id); if (TW.MenuOrder.indexOf(id) < 0) TW.MenuOrder.push(id); H[id].abilities.forEach((ab, i) => { ab.slot = i; ab.hero = id; }); }
  Object.assign(TW.BUILD_WHY, {
    ure: '맞으면서 치는 싸움꾼 — 공격력과 체력을 함께',
    solgae: '멀리서 한 대씩 — 공격력과 공격 속도, 다음은 재사용 감소',
    pulmu: '화로 곁에서 버티는 설치가 — 주문력·재사용 감소부터',
  });
})();
