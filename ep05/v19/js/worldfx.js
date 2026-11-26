/* 어스름 전선 — worldfx: 경기 사건(G.events) → 눈에 보이는 손맛 (불꽃·숫자·흔들림·멈칫)
   타격의 네 단계가 서로 다르게 보이도록 한다:
     평타(basic) = 작은 불똥 + 흰 숫자 · 스킬(skill) = 색 숫자 + 빛 + 살짝 흔들림 · 큰 한 방(big) = 큰 숫자 + 충격파 + 멈칫
     막타(lastHit) = 동전이 내게 날아온다 · 처치(kill) = 화면이 번쩍, 느려지고, 크게 흔들린다 */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map, X = TW.X, FX = TW.FX, Art = TW.Art, W = TW.World, TAU = Math.PI * 2;
  const DANGER = '#ff5a6e';
  // 8차: 띄움도 제 빛깔(분홍)로 — 다른 상태(기절·빙결·속박·도발)는 모두 빛깔이 있는데 띄움만 순백이라, 큰 싸움에서 흰 화소로 세어지는 상태 글자는 '띄움!' 하나였다
  const CC_COL = { stun: '#ffe680', freeze: '#bfeaff', air: '#ffb3de', root: '#9fe07a', taunt: '#7dffd9' };
  const merge = new Map(), later = [], trails = [];
  let ambT = 0;

  const isEnemy = (u) => W.team >= 0 && u.team !== W.team;
  const tcol = (u) => (u && u.team < 2 ? C.TEAM_LIGHT[u.team] : '#ffe9c0');
  function see(x, y, pad) { return W.onScreen(x, y, pad === undefined ? 6 : pad) && W.visibleAt(x, y); }
  /* 멈칫: 방금(0.15초 안) 내 명령이 들어갔으면 걸지 않는다 — 손맛 연출이 조작을 늦추면 안 된다 */
  const nowMs = () => (globalThis.performance && performance.now ? performance.now() : 0);
  function stop(sec) { if (nowMs() - (W.cmdAt || -1e9) > 150) W.hitstop = Math.max(W.hitstop, sec); }
  W.later = function (sec, fn) { later.push({ t: sec, fn }); };

  /* 같은 대상에게 연달아 들어간 피해는 숫자 하나로 합친다. sz = 글자 크기 배율 (내가 맞은 피해는 클수록 크게) */
  function number(src, tg, amt, style, color, top, sz) {
    const key = (src ? src.id : 0) + '_' + tg.id + '_' + style;
    const m = merge.get(key);
    if (m && m.p.t < 0.32 && m.p.t < m.p.life) { m.sum += amt; m.p.str = String(Math.round(m.sum)); m.p.t = Math.min(m.p.t, 0.06); m.p.x = tg.x + m.p.ox * 0.4; m.p.y = tg.y - top; if (sz) m.p.sz = Math.max(m.p.sz || 1, sz); return; }
    const p = FX.num(tg.x + (FX.rnd() - 0.5) * 0.8, tg.y - top, String(Math.round(amt)), style, color);
    if (p) { if (sz) p.sz = sz; if (merge.size > 160) merge.clear(); merge.set(key, { p, sum: amt }); }
  }

  /* =====================================================================
     타격의 무게 (5차: "타격감이 밋밋하다")
     한 대가 들어가면 세 박자로 보인다:
       ① 닿는 순간 — 맞은 몸이 번쩍(내가 때리면 흰빛, 내가 맞으면 붉은빛) · 별 모양 불꽃 · 화면이 맞은 쪽으로 '툭'
       ② 멈칫 — 맞은 몸이 제자리에서 바르르 떨며 자세가 굳는다. 때린 쪽(근접)은 무기를 끝까지 뻗은 자세로 잠깐 버틴다
       ③ 풀림 — 맞은 몸이 맞은 방향으로 밀렸다가 돌아온다
     멈칫은 '그림'에만 건다. 시뮬레이션 시간은 그대로 흐르므로 조작(클릭 → 몸이 움직임)은 늦어지지 않는다.
     내 영웅의 자세는 맞아도 굳히지 않는다(떨림·번쩍만). 걷다가 맞을 때 다리가 멈춘 듯 보이면 조작이 늦은 것처럼 느껴진다.
     또 내 영웅이 움직이기 시작하면 때린 자세의 버팀도 그 자리에서 풀린다.
     세기: 누가(내가 때림 · 내가 맞음 · 남끼리) × 무엇으로(평타 · 스킬 · 큰 한 방) × 누구를(미니언 · 몬스터 · 영웅 · 구조물)
     ===================================================================== */
  // 번쩍 빛깔: 따뜻한 금빛. 예전의 크림빛(#ffeed6)은 그것만으로는 순백이 아니었지만, 그 위에 빛무리('screen' 합성)가 얹히면 영웅 하나 크기가 통째로
  // 순백(세 채널 모두 225 이상)이 되어 밝은 돌마당 난전에서 흰 덩어리가 0.03% → 0.49% 로 커졌다. 금빛은 파랑 채널이 낮아 빛무리가 얹혀도 순백에 닿지 않는다 (최악 약 220)
  const TINT_HIT = '#ffe08a', TINT_HURT = '#ff4258';
  const TIER = { basic: 0, skill: 1, proc: 1, big: 2 };
  const KIND = (u) => (u.isStruct ? 3 : u.isHero ? 2 : u.isMonster ? 1 : 0);
  //  내가 때렸을 때 [멈칫(초), 떨림 폭, 밀림, 번쩍, 젖힘(rad), 화면 툭, 불꽃 크기] × 대상 [미니언, 몬스터, 영웅, 구조물]
  const MINE = [
    [[0.045, 0.07, 0.17, 0.62, 0.08, 0.05, 0.8], [0.055, 0.08, 0.13, 0.62, 0.05, 0.07, 1.0], [0.07, 0.1, 0.2, 0.72, 0.13, 0.11, 1.1], [0.04, 0.05, 0, 0, 0, 0.06, 0.95]],
    [[0.06, 0.1, 0.26, 0.7, 0.12, 0.08, 1.1], [0.065, 0.1, 0.2, 0.7, 0.08, 0.1, 1.2], [0.09, 0.13, 0.3, 0.78, 0.17, 0.16, 1.35], [0.05, 0.06, 0, 0, 0, 0.08, 1.1]],
    [[0.1, 0.15, 0.4, 0.78, 0.2, 0.22, 1.55], [0.11, 0.16, 0.3, 0.78, 0.14, 0.24, 1.7], [0.13, 0.18, 0.45, 0.78, 0.24, 0.27, 1.9], [0.08, 0.08, 0, 0, 0, 0.2, 1.6]],
  ];
  //  내가 맞았을 때 [떨리는 시간, 떨림 폭, 붉은 번쩍, 젖힘, 화면 툭, 피해 비율 1당 더하는 툭]
  const HURT = [[0.06, 0.07, 0.5, 0.06, 0.06, 1.1], [0.08, 0.1, 0.62, 0.1, 0.11, 1.2], [0.11, 0.14, 0.72, 0.15, 0.2, 1.2]];
  //  남끼리, 영웅이 맞을 때 [멈칫, 떨림 폭, 밀림, 젖힘]
  const OTHER = [[0.03, 0.05, 0.12, 0.05], [0.045, 0.07, 0.2, 0.09], [0.06, 0.1, 0.28, 0.13]];

  const act = [], corpses = [], hurtT = new Map();       // act: 멈칫·번쩍·젖힘이 진행 중인 화면 상태 · corpses: 내가 쓰러뜨린 것이 터지기 전 굳어 있는 잠깐 · hurtT: 나를 때린 것 → 마지막으로 때린 실제 시각(ms)
  W.tintOf = (s) => (s.tint > 0 ? s.tint * (s.tintT < 0.034 ? 1 : Math.exp(-(s.tintT - 0.034) / 0.035)) : 0);      // 첫 두 프레임은 가득, 그 뒤 0.035초 시간상수로 빠르게 사그라든다 (몸이 하얗게 오래 묻히지 않게)
  /* u 의 화면 상태에 한 대의 무게를 건다. o: { hold, shk, kb, tint, col, fl, dx, dy(맞은 방향), freeze(자세를 굳힘), atk(때린 자세로 버팀) } */
  function impact(u, o) {
    const s = W.vs(u);
    s.u = u;
    if (o.hold > 0) {
      if (!(s.hold > 0)) { s.ht = W.time; s.wp = u.walkPhase || 0; s.holdL = 0; s.shk = 0; s.frz = false; }      // 이미 멈칫 중이면 굳은 자세는 그대로 두고 시간만 늘린다
      if (o.hold > s.hold) s.hold = o.hold;
      if (s.hold > s.holdL) s.holdL = s.hold;
      if (o.freeze) s.frz = true;
      if (o.atk && s.atkT0 > -5) { s.hAtk = true; s.hAtkT0 = s.atkT0; }
    }
    if (o.shk > 0 && o.shk >= s.shk) { s.shk = o.shk; s.hdx = o.dx; s.hdy = o.dy; }
    if (o.kb > 0) {
      s.kbx += o.dx * o.kb; s.kby += o.dy * o.kb;
      const m = Math.hypot(s.kbx, s.kby); if (m > 0.6) { s.kbx *= 0.6 / m; s.kby *= 0.6 / m; }
      if (!(s.hold > 0)) { s.kx += s.kbx; s.ky += s.kby * W.K; s.kbx = s.kby = 0; }
    }
    if (o.tint > 0 && o.tint >= W.tintOf(s)) { s.tint = o.tint; s.tintT = 0; s.tintCol = o.col; }
    if (o.fl > 0) { const m = o.fl * (0.35 + 0.65 * Math.min(1, Math.abs(o.dx) * 1.4)); if (m > Math.abs(s.fl)) s.fl = (o.dx >= 0 ? 1 : -1) * m; }      // 맞은 쪽 반대로 몸이 젖혀진다 (옆에서 맞을수록 크게)
    if (!s.imp) { s.imp = true; act.push(s); }
  }
  /* 멈칫을 푼다: 굳었던 동작은 굳은 자리에서 이어지고, 때린 자세는 '닿은 순간'부터 거두며, 쌓인 밀림이 한꺼번에 나간다. cut = 내 명령으로 끊음 */
  function release(s, cut) {
    if (s.hAtk) { if (!cut && s.atkT0 === s.hAtkT0) s.atkT0 = W.time - 0.3 * Math.max(0.2, s.atkW / 0.3); s.hAtk = false; }
    else if (s.frz) { const d = W.time - s.ht; if (d > 0) { if (s.atkT0 > -5 && s.atkT0 <= s.ht) s.atkT0 += d; if (s.castT0 > -5 && s.castT0 <= s.ht) s.castT0 += d; } }
    s.hold = 0; s.frz = false; s.shk = 0;
    if (s.kbx || s.kby) { s.kx += s.kbx; s.ky += s.kby * W.K; s.kbx = s.kby = 0; }
  }
  W.releaseHold = function (s) { if (s && s.hold > 0) release(s, true); };
  const _o = { hold: 0, shk: 0, kb: 0, tint: 0, col: TINT_HIT, fl: 0, dx: 0, dy: 0, freeze: false, atk: false };
  /* 때린 쪽(근접)이 닿은 자세로 버틴다 */
  function attackerHold(u, hold) {
    if (!u || u.dead || u.isStruct || !(hold > 0)) return;
    const o = _o; o.hold = hold; o.shk = 0; o.kb = 0; o.tint = 0; o.fl = 0; o.freeze = true; o.atk = true;
    impact(u, o);
  }
  W.corpseOf = function (u) { for (const c of corpses) if (c.u === u) return c; return null; };
  W.corpses = corpses;
  /* u 가 굳어 있는 중이면(내가 쓰러뜨린 한 대) 터지는 연출을 굳음이 끝난 뒤로 미룬다 — 실제 시간으로 (멈칫·느려짐에 끌려가지 않게) */
  function afterCorpse(u, fn) { const c = W.corpseOf(u); if (c) c.fns.push(fn); else fn(); }
  function weigh(e, s, tg, src, x, y, ang, ca, sa, col, mine, onMe, melee) {
    const ti = TIER[e.tier]; if (ti === undefined) return;
    const proc = e.tier === 'proc' ? 0.7 : 1, o = _o;
    o.dx = ca; o.dy = sa; o.atk = false; o.col = TINT_HIT;
    if (mine) {
      const r = MINE[ti][KIND(tg)], heavy = melee ? 1.2 : 1, lethal = e.lethal && !tg.isHero && !tg.isStruct;
      o.hold = (r[0] + (melee ? 0.015 : 0) + (lethal ? 0.03 : 0)) * proc; o.shk = r[1] * (melee ? 1.15 : 1); o.kb = r[2] * (lethal ? 1.6 : 1) / Math.max(1, tg.r || 1);
      o.tint = lethal ? 0.78 : r[3]; o.fl = r[4] * (lethal ? 1.4 : 1); o.freeze = true;
      impact(tg, o);
      if (r[5] > 0) W.kick(ca, sa, r[5] * heavy * proc * (lethal ? 1.3 : 1));
      FX.impact(x, y, ang, r[6] * (lethal ? 1.25 : 1) * (proc < 1 ? 0.8 : 1), col, 0.12 + ti * 0.025);
      if (melee) attackerHold(src, o.hold);
      if (lethal && !W.corpseOf(tg)) { corpses.push({ u: tg, t: o.hold + 0.02, fns: [] }); s.punch = 1; }        // 쓰러뜨린 한 대: 굳은 채 하얗게 번쩍했다가 터진다 (터지는 연출은 그 뒤로 미룬다)
    } else if (onMe) {
      // 같은 것에게 0.15초 안에 또 맞으면(본진 등불처럼 틱마다 깎는 것 · 여러 번 때리는 스킬) 작게만: 화면 툭·불꽃·가장자리 번짐은 건너뛴다
      const now = nowMs(), spam = !!src && now - (hurtT.get(src) || -1e9) < 150; if (src) { if (hurtT.size > 40) hurtT.clear(); hurtT.set(src, now); }
      // 미니언에게 조금씩 긁히는 것(체력 3% 아래)은 반쯤만: 길에서 미니언 무리에 둘러싸여도 화면이 쉴 새 없이 붉게 번쩍이지 않게
      const frac = U.clamp(e.amt / Math.max(1, tg.maxHp), 0, 0.3), weak = !!src && !!src.isMinion && frac < 0.03;
      const r = HURT[ti], k = (e.tier === 'proc' ? 0.6 : 1) * (spam ? 0.4 : 1) * (weak ? 0.55 : 1);
      o.hold = r[0]; o.shk = r[1] * k; o.kb = (0.08 + ti * 0.06) * k; o.tint = Math.min(0.8, (r[2] + frac * 2) * k); o.col = TINT_HURT; o.fl = r[3] * k; o.freeze = false;
      impact(tg, o);
      if (spam) return;
      W.kick(ca, sa, Math.min(0.32, r[4] + frac * r[5]) * k);
      if (src && src.x !== undefined && (src.isHero || src.isStruct || src.isMonster || frac >= 0.03)) W.hurtFrom(src.x, src.y, (0.45 + Math.min(0.55, frac * 6) + ti * 0.15) * k);
      if (!weak) FX.impact(x, y, ang, (0.8 + ti * 0.25) * k, '#ff6a7c', 0.11);
      if (melee && (src.isHero || src.isMonster)) attackerHold(src, r[0] * 0.8);
    } else if (tg.isHero) {
      const r = OTHER[ti];
      o.hold = r[0] * proc; o.shk = r[1]; o.kb = r[2]; o.tint = 0; o.fl = r[3]; o.freeze = true;
      impact(tg, o);
      if (melee) attackerHold(src, o.hold);
    } else { s.kx += ca * (ti ? 0.22 : 0.13); s.ky += sa * (ti ? 0.15 : 0.09); }        // 남끼리의 미니언·몬스터: 예전처럼 살짝 밀리기만 (길 싸움이 시끄럽지 않게)
  }
  /* 매 프레임(실제 시간): 멈칫 · 번쩍 · 젖힘 · 굳은 잔해 */
  W.impactTick = function (dt) {
    for (let i = act.length - 1; i >= 0; i--) {
      const s = act[i], u = s.u;
      if (s.hold > 0) {
        if (u && u === W.me && (s.frz || s.hAtk) && (u.moving || u.dash || u.dead)) release(s, true);       // 내 영웅의 자세가 굳어 있는데 움직이기 시작하면 바로 푼다 — 연출이 조작을 붙잡지 않는다 (맞아서 떨리기만 하는 것은 걸으면서도 그대로 보인다)
        else { s.hold -= dt; if (s.hold <= 0) release(s, false); }
      }
      if (s.tint > 0) { s.tintT += dt; if (s.tintT > 0.034 && W.tintOf(s) < 0.02) s.tint = 0; }
      if (s.fl && !(s.hold > 0)) { s.fl *= Math.exp(-dt / 0.06); if (Math.abs(s.fl) < 0.004) s.fl = 0; }
      if (!(s.hold > 0) && !(s.tint > 0) && !s.fl) { s.imp = false; act.splice(i, 1); }
    }
    for (let i = corpses.length - 1; i >= 0; i--) { const c = corpses[i]; c.t -= dt; if (c.t <= 0) { corpses.splice(i, 1); for (const f of c.fns) f(); } }
  };
  function blob(color) { return (c, x, y) => { c.fillStyle = color; X.ell(c, x, y - 1.1, 0.72, 1.0); c.fill(); X.ell(c, x, y - 2.25, 0.5, 0.5); c.fill(); }; }

  function hitFx(e) {
    const src = e.src, tg = e.tgt, me = W.me, mine = !!me && src === me, onMe = !!me && tg === me;
    if (!mine && !onMe && !see(tg.x, tg.y, 3)) return;
    const s = W.vs(tg), top = tg.isStruct ? 3.4 : tg.isHero ? 3.0 : tg.isMonster ? tg.r * 1.5 + 1 : 1.9;
    const x = tg.x, y = tg.y - (tg.isStruct ? 1.8 : tg.isMinion ? 0.5 : 0.9);
    const ang = src && src.x !== undefined ? Math.atan2(tg.y - src.y, tg.x - src.x) : -Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const col = src && src.isHero ? src.hd.glow : tcol(src), tier = e.tier, mineOr = mine || onMe;
    if (mineOr) s.fm = W.time;        // 나와 얽힌 타격: 맞은 몸의 흰 번쩍(테두리)은 이때만 크게 (worlddraw.js)
    const melee = !!src && !src.ranged && !src.isStruct && tier === 'basic';
    if (tier === 'basic') {
      s.flash = Math.max(s.flash, tg.isHero ? 0.55 : 0.75); s.punch = Math.max(s.punch, mine ? 0.65 : 0.5);
      // 내 것·내가 맞는 것은 또렷하게, 남들끼리의 타격은 작게 (큰 싸움에서 빛이 뭉치지 않게)
      FX.sparks(x, y, ang, 1.3, tg.isStruct ? 5 : mine ? 8 : 3, col, mine ? 11 : 9, 0.22, 0.1);
      if (mineOr) FX.glow(x, y, 0.25, mine ? 1.0 : 0.8, 0.12, '#ffffff', 0.5);
      if (tg.isStruct) FX.shards(x, tg.y - 0.6, mine ? 3 : 2, '#9a9db2', 5);
      if (mine) { W.shake(tg.isHero ? 0.1 : tg.isStruct ? 0.07 : 0.045); if (tg.isHero && melee) stop(0.03); }
    } else if (tier === 'skill' || tier === 'proc') {
      s.flash = Math.max(s.flash, 0.9); s.punch = Math.max(s.punch, 0.8);
      FX.sparks(x, y, ang, 1.9, mineOr ? 10 : 5, col, 12, 0.3, 0.12);
      FX.glow(x, y, 0.4, mineOr ? 1.5 : 1.1, 0.18, col, mineOr ? 0.6 : 0.35); FX.light(x, y, 5.5, 0.25, col, 0.6);
      FX.ring(x, y, 0.3, 1.5, 0.2, mineOr ? '#ffffff' : col, 0.12);
      if (mine && tg.isHero) { stop(tier === 'proc' ? 0.03 : 0.045); W.shake(0.17); } else if (mine) W.shake(0.08);
    } else if (tier === 'big') {
      s.flash = 1; s.punch = 1;
      FX.sparks(x, y, ang, 2.6, mineOr ? 16 : 9, col, 15, 0.38, 0.14); if (mineOr) FX.burst(x, y, 8, '#ffffff', 9, 0.3, 0.1);
      FX.glow(x, y, 0.6, mineOr ? 2.1 : 1.5, 0.24, col, mineOr ? 0.6 : 0.36); FX.light(x, y, 8, 0.32, col, 0.85);
      FX.ring(x, y, 0.4, 2.6, 0.28, mineOr ? '#ffffff' : col, 0.2); FX.disc(tg.x, tg.y, 2.0, 0.3, col, 0.35);
      if (mineOr) { stop(mine ? 0.07 : 0.05); W.shake(0.34); } else W.shake(0.12, tg.x, tg.y);
    } else if (tier === 'dot') {
      if ((W.frame & 1) === 0) FX.spark(x + (FX.rnd() - 0.5), y, (FX.rnd() - 0.5) * 2, -3, 0.4, '#ffb347', 0.1, 1);
    }
    if (tier !== 'dot') weigh(e, s, tg, src, x, y, ang, ca, sa, col, mine, onMe, melee);      // 멈칫 · 번쩍 · 젖힘 · 밀림 · 화면 툭 · 별 불꽃
    if (e.absorbed > 0 && tier !== 'dot') { FX.ring(x, y, 0.5, 1.7, 0.22, '#eaf6ff', 0.14); FX.sparks(x, y, ang + Math.PI, 2.4, 5, '#eaf6ff', 8, 0.25, 0.09); }
    if (onMe && tier !== 'dot') { W.hurt = Math.min(1, W.hurt + e.amt / tg.maxHp * 2.4 + 0.1); W.shake(Math.min(0.3, 0.06 + e.amt / tg.maxHp * 1.2)); }
    if (mine) number(src, tg, e.amt, tier === 'basic' ? 'basic' : tier === 'big' ? 'big' : tier === 'dot' ? 'dot' : 'skill', col, top);
    else if (onMe) number(src, tg, e.amt, tier === 'dot' ? 'dot' : 'hurt', null, top, tier === 'dot' ? 0 : 1 + Math.min(0.6, e.amt / Math.max(1, tg.maxHp) * 5));      // 크게 깎일수록 붉은 숫자도 크다
    else if (src && src.isHero && tg.isHero && tier !== 'dot') number(src, tg, e.amt, tier === 'big' ? 'skill' : 'dot', col, top);
  }
  function meleeFx(e) {
    const u = e.u, tg = e.target; if (!see(tg.x, tg.y, 3)) return;
    const ang = Math.atan2(tg.y - u.y, tg.x - u.x), d = U.du(u, tg);
    if (u.isHero) {
      const s = W.vs(u);
      if (u.heroId === 'moru') { FX.disc(tg.x, tg.y, 1.5, 0.22, '#ffcf8a', 0.4); FX.shards(tg.x, tg.y, 2, '#b9a88a', 5); }
      else if (u.heroId === 'hanui') FX.thrust(u.x, u.y - 0.95, ang, d + 1.0, 0.5, 0.14, '#bff6ff');
      else if (u.heroId === 'geumeum') FX.slash(tg.x - Math.cos(ang) * 0.6, tg.y - 0.9 - Math.sin(ang) * 0.4, ang + (s.atkN % 2 ? 0.7 : -0.7), 1.5, 2.3, 0.16, '#cfd6ff', 0.34);
      else if (u.heroId === 'agwi') FX.slash(u.x, u.y - 0.9, ang, 3.0, 2.1, 0.2, '#b8ffe9', 0.5);
      else FX.slash(tg.x, tg.y - 0.9, ang, 1.2, 2, 0.15, u.hd.glow, 0.3);
    } else if (u.isMonster) FX.slash(tg.x - Math.cos(ang) * 0.5, tg.y - 0.9, ang, 1.2 + u.r * 0.4, 2.0, 0.18, '#ffe0c0', 0.36);
    else FX.slash(tg.x - Math.cos(ang) * 0.3, tg.y - 0.55, ang, 0.75, 1.7, 0.12, tcol(u), 0.16);
  }
  function castFx(e) {
    const u = e.u, ab = e.ab, me = W.me; if (!see(u.x, u.y, 4) && u !== me) return;
    const col = u.hd.glow, tg = e.tg;
    // 시전 준비 동작이 있는 직선 스킬은 방향을 미리 보여 준다 (피할 수 있게)
    if (u !== me && ab.castTime >= 0.15 && ab.type === 'dir' && tg) W.teles.push({ x: u.x, y: u.y, dx: tg.dx, dy: tg.dy, len: ab.range, w: ab.width || 1.5, col: isEnemy(u) ? DANGER : col, t: 0, life: ab.castTime + 0.06 });
    FX.light(u.x, u.y, 5, 0.3, col, 0.5);
  }
  function fireFx(e) {
    const u = e.u, ab = e.ab, me = W.me; if (!see(u.x, u.y, 5) && u !== me) return;
    const col = u.hd.glow;
    FX.ring(u.x, u.y, 0.5, ab.ult ? 4.5 : 2.2, ab.ult ? 0.45 : 0.25, col, ab.ult ? 0.3 : 0.14, 'ground');
    if (ab.ult) {
      FX.ring(u.x, u.y - 0.9, 0.4, 3.4, 0.35, '#ffffff', 0.2); FX.light(u.x, u.y, 12, 0.5, col, 0.9); FX.burst(u.x, u.y - 0.9, 14, col, 9, 0.45, 0.12);
      FX.num(u.x, u.y - 3.9, ab.name + '!', 'label', col);
      W.shake(u === me ? 0.25 : 0.12, u.x, u.y);
    }
  }

  const buyK = { t: -1, n: 0 };      // 한 틱에 여러 개를 사면 머리 위 글자를 겹치지 않게 쌓는다
  W.onEvent = function (e) {
    const G = W.G, me = W.me;
    switch (e.type) {
      case 'attackStart': { const s = W.vs(e.u); s.atkT0 = G.t; s.atkW = e.dur || 0.2; s.atkN++; if (e.u.isStruct) s.shotT = G.t; break; }
      case 'hit': hitFx(e); break;
      case 'melee': meleeFx(e); break;
      case 'shoot': {
        const u = e.u; if (!u.isHero && !u.isStruct || !see(u.x, u.y, 3)) break;
        const a = Math.atan2(e.target.y - u.y, e.target.x - u.x), h = u.isStruct ? (W.Draw.muzzle(u) - FX.LIFT) / W.K : 1.0;
        FX.glow(u.x + Math.cos(a) * (u.isStruct ? 0 : 1.0), u.y - h + Math.sin(a) * 0.6, 0.25, u.isStruct ? 1.8 : 0.9, 0.12, u.isHero ? u.hd.glow : tcol(u), 0.85);
        break;
      }
      case 'projHit': {
        const p = e.p; if (!p.skill || !see(p.x, p.y, 3)) break;
        const col = p.vis.color || '#ffffff';
        FX.burst(p.x, p.y - 0.9, 7, col, 8, 0.3, 0.1); FX.glow(p.x, p.y - 0.9, 0.4, 1.6, 0.18, col, 0.8);
        break;
      }
      case 'projEnd': { const p = e.p; if (p.skill && !p.caught && see(p.x, p.y, 2) && p.vis.kind !== 'bolt') FX.glow(p.x, p.y - 0.9, 0.3, 0.9, 0.15, p.vis.color || '#ffffff', 0.5); break; }
      case 'cast': { const s = W.vs(e.u); s.castT0 = G.t; s.castSlot = e.slot; s.castDur = e.ab.castTime || 0.2; castFx(e); break; }
      case 'castFire': fireFx(e); break;
      case 'chargeStart': if (see(e.u.x, e.u.y, 4)) FX.ring(e.u.x, e.u.y - 0.9, 2.4, 0.4, 0.3, e.u.hd.glow, 0.12); break;
      case 'dashStart': {
        const u = e.u; if (!see(u.x, u.y, 6) && u !== me) break;
        const col = e.trail || (u.isHero ? u.hd.glow : '#ffe0c0');
        trails.push({ u, until: G.t + Math.min(0.6, e.dur + 0.05), next: 0, col });
        FX.smoke(u.x, u.y - 0.3, 1.0, 0.4, '#3a3d58', 0.45); FX.ring(u.x, u.y, 0.4, 1.6, 0.25, col, 0.1, 'ground');
        if (e.kind === 'leap') { FX.ring(u.x, u.y, 0.6, 2.6, 0.3, col, 0.2, 'ground'); FX.shards(u.x, u.y, 5, '#b9a88a', 6); }
        break;
      }
      case 'dashEnd': if (e.reason === 'wall' && see(e.u.x, e.u.y, 4)) FX.shards(e.u.x, e.u.y, 4, '#9a9db2', 6); break;
      case 'blink': { const u = e.u; if (see(u.x, u.y, 4) || see(e.x0, e.y0, 4)) { FX.glow(e.x0, e.y0 - 0.9, 1.4, 0.2, 0.25, u.hd.glow, 0.8); FX.burst(e.x0, e.y0 - 0.9, 8, u.hd.glow, 6, 0.35, 0.1); FX.ghost(blob(U.rgba(u.hd.glow, 0.8)), e.x0, e.y0, 0.3, 0.5); } break; }
      case 'roll': if (see(e.u.x, e.u.y, 4)) FX.smoke(e.u.x, e.u.y - 0.2, 0.9, 0.35, '#4a4d68', 0.4); break;
      case 'dodge': if (see(e.u.x, e.u.y, 4)) { FX.num(e.u.x, e.u.y - 3.2, '회피!', 'label', '#eafff0'); FX.ghost(blob('rgba(234,255,240,0.7)'), e.u.x, e.u.y, 0.3, 0.5); } break;
      case 'deflect': if (see(e.x, e.y, 4)) { FX.sparks(e.x, e.y - 0.9, 0, TAU, 9, '#ffffff', 13, 0.28, 0.11); FX.glow(e.x, e.y - 0.9, 0.3, 1.4, 0.14, '#bff6ff', 0.9); if (e.u === me) FX.num(e.x, e.y - 2.4, '쳐냄!', 'label', '#bff6ff'); } break;
      case 'cc': {
        const u = e.u; if (!see(u.x, u.y, 3) || !(u.isHero || u.isMonster)) break;
        const col = CC_COL[e.kind] || '#ffffff';
        if (u.isHero) FX.num(u.x, u.y - 3.5, e.name + '!', 'label', col);
        FX.burst(u.x, u.y - 2.2, 7, col, 6, 0.35, 0.1); FX.ring(u.x, u.y - 0.9, 0.3, 1.6, 0.22, col, 0.12);
        if (u === me) W.shake(0.2);
        break;
      }
      case 'heal': {
        const tg = e.tgt; if (!see(tg.x, tg.y, 3)) break;
        for (let i = 0; i < 4; i++) FX.spark(tg.x + (FX.rnd() - 0.5) * 1.4, tg.y - 0.4 - FX.rnd(), 0, -3 - FX.rnd() * 2, 0.6, '#8dffb4', 0.12, 0.5);
        if ((tg === me || e.src === me) && e.amt >= 8) number(e.src, tg, e.amt, 'heal', null, 3.2);
        break;
      }
      case 'lastHit': {
        const tg = e.tgt;
        if (e.u === me) {
          const n = tg.kind === 'siege' || tg.kind === 'super' ? 6 : 3, x = tg.x, y = tg.y, amt = e.amt;
          afterCorpse(tg, () => {
            for (let i = 0; i < n; i++) FX.coin(x, y - 0.6, me, i * 0.035);
            FX.num(x, y - 2.0, '+' + amt, 'gold');
            FX.burst(x, y - 0.6, 10, '#ffd84a', 9, 0.4, 0.11); FX.glow(x, y - 0.6, 0.4, 1.7, 0.2, '#ffe680', 0.9); FX.ring(x, y, 0.3, 1.5, 0.25, '#ffd84a', 0.12, 'ground');
          });
        } else if (see(tg.x, tg.y, 2)) FX.burst(tg.x, tg.y - 0.6, 3, '#ffd84a', 5, 0.3, 0.09);
        break;
      }
      case 'gold': if (e.u === me && e.reason !== 'cs' && e.amt >= 20) FX.num(me.x, me.y - 3.7, '+' + e.amt, 'gold'); break;
      case 'death': {
        const u = e.u;
        if (u.isHero) { u.deathX = u.x; u.deathY = u.y; break; }
        if (!see(u.x, u.y, 3)) break;
        afterCorpse(u, () => {
          if (u.isMinion) { FX.burst(u.x, u.y - 0.5, e.killer === me ? 11 : 7, tcol(u), 7, 0.35, 0.1); FX.smoke(u.x, u.y - 0.3, 0.9, 0.35, '#2a2c44', 0.4); FX.glow(u.x, u.y - 0.5, 0.3, 1.0, 0.18, tcol(u), 0.7); if (e.killer === me) FX.ring(u.x, u.y - 0.5, 0.3, 1.6, 0.2, '#ffffff', 0.12); }
          else if (u.isMonster) { FX.burst(u.x, u.y - 0.8, 12 + u.r * 6, u.kind === 'boss' ? '#7dffd9' : '#ffe0c0', 9, 0.5, 0.12); FX.smoke(u.x, u.y - 0.5, u.r * 1.4, 0.5, '#2a2c44', 0.5); FX.shards(u.x, u.y, 4 + (u.r * 3 | 0), '#8a7a66', 7); FX.disc(u.x, u.y, u.r * 1.8, 0.35, '#ffe0c0', 0.3); }
        });
        break;
      }
      case 'kill': {
        const v = e.victim, col = tcol(v), mineK = !!me && e.killer === me, onMe = v === me, assist = me && e.assists.indexOf(me) >= 0;
        // 내가 쓰러뜨린 영웅: 하얗게 굳은 채 0.12초 → 터진다 (막타의 '멈칫 → 펑' 박자를 영웅 처치에도)
        if (mineK && v.isHero && v.id !== undefined && !W.corpseOf(v)) { corpses.push({ u: v, t: 0.12, fns: [] }); const o = _o; o.hold = 0.12; o.shk = 0.16; o.kb = 0.4; o.tint = 0.78; o.col = TINT_HIT; o.fl = 0.22; o.freeze = true; o.atk = false; const a = Math.atan2(v.y - me.y, v.x - me.x); o.dx = Math.cos(a); o.dy = Math.sin(a); impact(v, o); W.vs(v).punch = 1; }
        if (see(v.x, v.y, 6) || mineK || onMe) afterCorpse(v, () => {
          FX.disc(v.x, v.y, 3.4, 0.5, col, 0.5); FX.burst(v.x, v.y - 1, 12, '#ffffff', 14, 0.6, 0.13); FX.burst(v.x, v.y - 1, 18, col, 9, 0.8, 0.12);
          FX.ring(v.x, v.y - 1, 0.5, 4.2, 0.4, '#ffffff', 0.3); FX.light(v.x, v.y, 14, 0.55, '#ffffff', 1); FX.crack(v.x, v.y, 2.6, col, 3);
          for (let i = 0; i < 9; i++) FX.spark(v.x + (FX.rnd() - 0.5) * 1.2, v.y - 1 - FX.rnd(), (FX.rnd() - 0.5) * 1.5, -5 - FX.rnd() * 4, 1.0 + FX.rnd() * 0.5, col, 0.16, 0.4);
          FX.ghost(blob(U.rgba(col, 0.9)), v.x, v.y, 0.7, 0.6);
          W.shake(0.35, v.x, v.y);
          if (mineK) W.kick(Math.cos(Math.atan2(v.y - me.y, v.x - me.x)), Math.sin(Math.atan2(v.y - me.y, v.x - me.x)), 0.3);
        });
        // 처치의 무게: 흔들림 + 가장자리 번쩍임 + 짧은 느려짐. (내 명령이 들어오면 느려짐은 바로 풀린다 → main.js acted)
        if (mineK || onMe || assist) { W.shake(mineK || onMe ? 0.6 : 0.4); W.cam.punch = Math.max(W.cam.punch, mineK ? 0.07 : 0.04); W.flash = mineK ? 0.5 : onMe ? 0.45 : 0.22; W.flashCol = onMe ? '#ff3a52' : '#ffffff'; }
        // 마지막 한 방의 느려짐 (7차): 0.2배에서 시작해 부드럽게 돌아온다. 연속 처치가 길수록 길게(0.5초 → 다섯이면 0.9초).
        // 내 명령이 들어오면 시뮬레이션의 느려짐은 그 자리에서 풀린다(조작이 먼저다). 대신 '그 순간'의 렌즈(가장자리가 어두워지며 금빛/붉은빛)는
        // 실제 시간으로 끝까지 남는다 — 그림에만 걸리므로 조작은 늦어지지 않는다 (ui.js drawLens)
        if (mineK && v.isHero) {
          const n = Math.min(5, e.multi || 1), d = 0.5 + 0.1 * (n - 1);
          // 방금(0.15초 안) 내 명령이 들어갔으면 시뮬레이션은 늦추지 않는다 — 멈칫(stop)과 같은 규칙. 클릭과 같은 틱에 처치가 나면 그 클릭의 움직임이 한 프레임 늦어 보였다(67 → 83ms) → 렌즈만 남긴다
          if (nowMs() - (W.cmdAt || -1e9) > 150 && !(W.slowT > d && W.slowMax > 0)) { W.slowT = d; W.slowMax = d; }
          stop(0.06 + 0.01 * n);
          W.lens = { t: 0, dur: 0.6 + 0.12 * (n - 1), col: '#ffcf4a', n, x: v.x, y: v.y };
        } else if (onMe) { W.slowT = W.slowMax = 0.9; stop(0.08); W.lens = { t: 0, dur: 1.1, col: '#ff3a52', n: 1, x: v.x, y: v.y }; }
        break;
      }
      case 'levelup': {
        const u = e.u; if (!see(u.x, u.y, 3) && u !== me) break;
        FX.pillar(u.x, u.y, 1.1, 0.7, '#fff2c0', u); FX.ring(u.x, u.y, 0.4, 2.6, 0.45, '#fff2c0', 0.2, 'ground'); FX.burst(u.x, u.y - 1, 10, '#fff2c0', 7, 0.5, 0.1);
        if (u === me) FX.num(u.x, u.y - 4.0, '레벨 ' + u.level, 'label', '#fff2c0');
        break;
      }
      case 'buy': { const u = e.u; if (u !== me && !see(u.x, u.y, 2)) break; const it = TW.Items[e.item]; FX.ring(u.x, u.y, 0.5, 2.3, 0.4, it.color, 0.16, 'ground'); FX.burst(u.x, u.y - 1, 8, it.color, 6, 0.45, 0.1); if (u === me) { const k = buyK.t === G.t ? ++buyK.n : (buyK.n = 0); buyK.t = G.t; FX.num(u.x, u.y - 4.0 - k * 1.1, it.descAt(e.tier).split(' · ')[0], 'label', it.color); } break; }
      case 'buffGain': { const u = e.u; if (u !== me && !see(u.x, u.y, 3)) break; const b = TW.BUFFS[e.kind]; FX.pillar(u.x, u.y, 1.3, 0.8, b.color, u); FX.ring(u.x, u.y, 0.4, 3.2, 0.5, b.color, 0.22, 'ground'); FX.burst(u.x, u.y - 1, 14, b.color, 8, 0.6, 0.12); if (u.isHero && (u === me || see(u.x, u.y, 0))) FX.num(u.x, u.y - 4.2, b.name + '!', 'label', b.color); break; }
      case 'ambushReady': if (e.u === me) FX.ring(me.x, me.y - 0.9, 1.8, 0.4, 0.25, '#cfd6ff', 0.12); break;
      case 'towerLock': if (e.target === me) { W.hurt = Math.min(1, W.hurt + 0.3); } break;
      case 'towerDown': {
        const s = e.tower;
        if (W.onScreen(s.x, s.y, 12)) {
          const col = tcol(s);
          FX.shards(s.x, s.y - 1.5, 30, '#9a9db2', 12); for (let i = 0; i < 6; i++) FX.smoke(s.x + (FX.rnd() - 0.5) * 3, s.y - 1 - FX.rnd() * 2, 1.8 + FX.rnd(), 0.9 + FX.rnd() * 0.5, '#3a3d58', 0.6, (FX.rnd() - 0.5) * 2, -1.2);
          FX.disc(s.x, s.y, 6.5, 0.7, col, 0.5); FX.light(s.x, s.y, 18, 0.7, col, 1); FX.burst(s.x, s.y - 2, 30, col, 15, 0.8, 0.15); FX.ring(s.x, s.y - 1, 0.6, 7, 0.5, '#ffffff', 0.35); FX.crack(s.x, s.y, 4.5, col, 4);
        }
        W.shake(0.85, s.x, s.y);
        break;
      }
      case 'coreDown': {
        const s = e.core, col = tcol(s);
        for (let i = 0; i < 9; i++) W.later(i * 0.22, () => { const a = FX.rnd() * TAU, r = FX.rnd() * 3.5, x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r * 0.6; FX.burst(x, y - 2 - FX.rnd() * 2, 22, i % 2 ? col : '#ffffff', 16, 0.9, 0.16); FX.shards(x, y, 10, '#9a9db2', 13); FX.light(x, y, 20, 0.6, col, 1); FX.disc(s.x, s.y, 5 + i, 0.6, col, 0.4); FX.smoke(x, y - 2, 2.6, 1.2, '#3a3d58', 0.6, 0, -1); W.shake(0.6); });
        W.flash = 0.6; W.flashCol = '#ffffff';
        break;
      }
      case 'bossDown': { const x = e.x, y = e.y, B = TW.BIG[e.kind] || TW.BIG.boss; FX.burst(x, y - 2, 44, B.col, 17, 1.0, 0.16); FX.pillar(x, y, 3.2, 1.0, B.glow); FX.disc(x, y, 9, 0.8, B.col, 0.5); FX.light(x, y, 24, 0.8, B.col, 1); FX.ring(x, y, 1, 10, 0.7, '#ffffff', 0.4, 'ground'); W.shake(0.9, x, y); break; }
      // 큰 몬스터 등장: 물(불씨)이 솟구치며 땅이 울린다 — 화면 어디에 있든 흔들리고, 가까우면 더 세게
      case 'bigSpawn': { const x = e.x, y = e.y, B = TW.BIG[e.kind] || TW.BIG.boss, sm = e.kind === 'sala' ? 0.75 : 1;
        W.shake(0.5 * sm); W.shake(0.6 * sm, x, y);
        FX.pillar(x, y, 4.2 * sm, 1.2, B.glow); FX.burst(x, y - 1.5, 56 * sm, B.col, 20 * sm, 1.1, 0.2); FX.disc(x, y, 12 * sm, 0.9, B.col, 0.55);
        FX.ring(x, y, 1, 14 * sm, 0.9, '#ffffff', 0.5, 'ground'); FX.ring(x, y, 2, 20 * sm, 1.3, B.col, 0.35, 'ground'); FX.light(x, y, 30 * sm, 1.2, B.col, 1.2);
        FX.smoke(x, y - 0.5, 5 * sm, 1.0, B.deep, 0.5); FX.shards(x, y, 14, B.col, 9);
        if (W.me && U.dist(W.me.x, W.me.y, x, y) < 30) { W.flash = 0.35; W.flashCol = B.glow; }
        break; }
      case 'bigWarn': { const x = e.x, y = e.y, B = TW.BIG[e.kind] || TW.BIG.boss; FX.ring(x, y, 1, 12, 1.0, B.col, 0.45, 'ground'); FX.light(x, y, 16, 1.0, B.col, 0.8); break; }
      case 'elderDown': { const x = e.x, y = e.y; if (W.onScreen(x, y, 8)) { FX.burst(x, y - 2, 30, '#9fe07a', 12, 0.9, 0.14); FX.shards(x, y - 1, 16, '#6a5642', 10); FX.disc(x, y, 6, 0.6, '#9fe07a', 0.4); W.shake(0.5, x, y); } break; }
      case 'campSpawn': { const c = e.camp; if (see(c.x, c.y, 4)) FX.smoke(c.x, c.y - 0.5, 2.2, 0.6, '#4a4d68', 0.4); break; }
      case 'zoneBlast': {
        const z = e.z; if (!W.onScreen(z.x, z.y, 8)) break;
        const k = z.vis.kind;
        if (k === 'smoke') { for (let i = 0; i < 8; i++) FX.smoke(z.x + (FX.rnd() - 0.5) * z.radius, z.y + (FX.rnd() - 0.5) * z.radius * 0.8, 2 + FX.rnd(), 0.7, '#57508a', 0.5); }
        else if (k === 'frost') { FX.ring(z.x, z.y, 0.5, z.radius, 0.35, '#dff5ff', 0.2, 'ground'); FX.burst(z.x, z.y - 0.4, 10, '#cfefff', 7, 0.4, 0.1); }
        else if (k === 'whirl') { FX.ring(z.x, z.y, z.radius, 0.6, 0.4, '#7dffd9', 0.24, 'ground'); FX.burst(z.x, z.y, 12, '#b8ffe9', 8, 0.5, 0.1); }
        else if (k === 'sticky') FX.disc(z.x, z.y, z.radius, 0.3, '#d6ff5a', 0.4);
        break;
      }
      case 'strikeBlast': {
        const s = e.s; if (!W.onScreen(s.x, s.y, 20)) break;
        if (s.shape === 'cone') { FX.slash(s.x, s.y - 0.5, s.ang, s.r * 0.75, s.half * 2, 0.32, '#b8ffe9', 1.6); FX.disc(s.x + Math.cos(s.ang) * s.r * 0.5, s.y + Math.sin(s.ang) * s.r * 0.5, s.r * 0.6, 0.3, '#7dffd9', 0.3); }
        else if (s.shape === 'line' && s.vis && s.vis.kind === 'charge') FX.line(s.x, s.y - 0.5, s.x2, s.y2 - 0.5, 1.2, 0.25, '#ffb090');
        break;
      }
      case 'respawn': { const u = e.u; u.deathX = undefined; if (see(u.x, u.y, 4) || u === me) { FX.pillar(u.x, u.y, 1.4, 0.9, tcol(u), u); FX.ring(u.x, u.y, 0.4, 3, 0.5, tcol(u), 0.2, 'ground'); } break; }
      // 조사 결정표로 넣은 것: 도깨비불(예고 물결 · 불붙으며 뜸 · 주우면 그 영웅에게 빛기둥) · 바로 일어서기(금빛 큰 빛기둥과 땅울림)
      case 'wispWarn': if (W.onScreen(e.x, e.y, 10)) { FX.ring(e.x, e.y, 0.6, 7, 0.9, '#ffd9a0', 0.3, 'ground'); FX.light(e.x, e.y, 12, 0.9, '#ffd9a0', 0.7); } break;
      case 'wispSpawn': { const x = e.x, y = e.y, P = TW.WISP[e.kind]; if (W.onScreen(x, y, 12)) { FX.pillar(x, y, 1.8, 0.8, P.glow); FX.burst(x, y - 1.4, 26, P.color, 12, 0.8, 0.14); FX.ring(x, y, 0.5, 6.5, 0.6, P.color, 0.28, 'ground'); FX.light(x, y, 16, 0.8, P.color, 1); FX.smoke(x, y - 0.6, 2.4, 0.7, P.deep, 0.4); } break; }
      case 'wispTake': {
        const u = e.u, P = TW.WISP[e.kind];
        if (u === me || see(u.x, u.y, 4)) {
          FX.pillar(u.x, u.y, 1.5, 0.9, P.color, u); FX.ring(u.x, u.y, 0.4, 4.4, 0.55, P.color, 0.26, 'ground'); FX.burst(e.x, e.y - 1.4, 30, P.glow, 14, 0.8, 0.14); FX.burst(u.x, u.y - 1, 16, P.color, 9, 0.6, 0.12); FX.light(u.x, u.y, 14, 0.7, P.color, 1);
          FX.num(u.x, u.y - 4.4, P.name + '!', 'label', P.color);
          if (u === me) { W.flash = Math.max(W.flash || 0, 0.25); W.flashCol = P.glow; }
        }
        break;
      }
      case 'wispGone': if (W.onScreen(e.x, e.y, 6)) FX.smoke(e.x, e.y - 1, 2.2, 0.7, '#4a4d68', 0.45); break;
      case 'rise': {
        const u = e.u;
        if (u === me || see(u.x, u.y, 6)) {
          FX.pillar(u.x, u.y, 2.6, 1.3, '#ffe9a0', u); FX.pillar(u.x, u.y, 1.2, 1.0, '#fff6d0', u); FX.ring(u.x, u.y, 0.5, 7.5, 0.7, '#ffe9a0', 0.34, 'ground'); FX.ring(u.x, u.y, 0.5, 4.5, 0.5, tcol(u), 0.24, 'ground');
          FX.burst(u.x, u.y - 1.4, 36, '#ffe9a0', 15, 0.9, 0.15); FX.light(u.x, u.y, 20, 1.0, '#ffe9a0', 1.1); FX.num(u.x, u.y - 4.6, '바로 일어섰다!', 'label', '#ffe9a0');
          W.shake(u === me ? 0.45 : 0.25, u.x, u.y);
        }
        if (u === me) { W.flash = 0.4; W.flashCol = '#ffe9a0'; }
        break;
      }
      case 'recallDone': { const u = e.u; if (see(u.x, u.y, 4) || u === me) FX.pillar(u.x, u.y, 1.2, 0.7, tcol(u), u); break; }
      case 'toss': if (see(e.u.x, e.u.y, 3)) FX.ring(e.u.x, e.u.y, 0.4, 1.8, 0.25, '#7dffd9', 0.14, 'ground'); break;
      case 'say': if (e.team === W.team && e.x !== undefined) W.ping(e.x, e.y, e.kind === 'warn' ? DANGER : e.kind === 'go' ? '#ffe680' : '#bfeaff', e.kind, 3.5); break;
      case 'fx': genericFx(e); break;
      default: break;
    }
  };
  function genericFx(e) {
    const x = e.x !== undefined ? e.x : e.x1, y = e.y !== undefined ? e.y : e.y1;
    if (e.kind === 'shake') { W.shake(e.amp, e.x, e.y); return; }
    if (x === undefined || !W.onScreen(x, y, 14)) return;
    if (!W.visibleAt(x, y) && !(W.me && U.dist(W.me.x, W.me.y, x, y) < 12)) return;
    switch (e.kind) {
      case 'ring': FX.ring(e.x, e.y, e.r0, e.r1, e.dur, e.color, e.w, 'ground'); break;
      case 'burst': FX.burst(e.x, e.y - 0.6, e.n, e.color, e.speed, e.life, e.size); break;
      case 'sparks': FX.sparks(e.x, e.y - 0.9, e.ang, e.spread, e.n, e.color, e.speed); break;
      case 'flash': FX.glow(e.x, e.y - 0.6, e.r * 0.3, e.r * 0.7, e.dur, e.color, 0.32); FX.ring(e.x, e.y, e.r * 0.4, e.r, e.dur, e.color, 0.16, 'ground'); FX.light(e.x, e.y, e.r * 2.2, e.dur, e.color, 0.8); break;      // 번쩍임은 은은하게, 범위는 땅의 고리로 (유닛이 하얗게 묻히지 않게)
      case 'shock': FX.disc(e.x, e.y, e.r, e.dur, e.color, 0.5); FX.ring(e.x, e.y, e.r * 0.3, e.r, e.dur, e.color, 0.3); FX.light(e.x, e.y, e.r * 2.2, e.dur, e.color, 0.75); break;
      case 'crack': FX.crack(e.x, e.y, e.r, e.color); break;
      case 'slash': FX.slash(e.x, e.y - 0.9, e.ang, e.r, e.arc, e.dur, e.color, 0.42); break;
      case 'thrust': FX.thrust(e.x, e.y - 0.95, e.ang, e.len, e.w, e.dur, e.color); break;
      case 'beam': {
        FX.beam(e.x1, e.y1 - 0.9, e.x2, e.y2 - 0.9, e.w, e.dur, e.color);
        const n = Math.max(2, Math.round(Math.hypot(e.x2 - e.x1, e.y2 - e.y1) / 3));
        for (let i = 0; i <= n; i++) { const k = i / n, px = U.lerp(e.x1, e.x2, k), py = U.lerp(e.y1, e.y2, k); FX.light(px, py, 5 + e.w * 2, e.dur, e.color, 0.6); if (i % 2 === 0) FX.burst(px, py - 0.9, 3, e.color, 5, 0.35, 0.09); }
        break;
      }
      case 'bolt': FX.bolt(e.x1, e.y1 - 0.9, e.x2, e.y2 - 0.9, e.dur, e.color); FX.light(e.x2, e.y2, 4, e.dur, e.color, 0.6); break;
      case 'line': FX.line(e.x1, e.y1 - 0.9, e.x2, e.y2 - 0.9, e.w, e.dur, e.color); break;
      case 'pillar': FX.pillar(e.x, e.y, e.r, e.dur, e.color, e.follow); FX.light(e.x, e.y, e.r * 4, e.dur, e.color, 0.8); break;
      case 'shards': FX.shards(e.x, e.y, e.n, e.color, e.speed); break;
      case 'smoke': FX.smoke(e.x, e.y - 0.4, e.r || 1.5, 0.6, e.color || '#4a4d68', 0.5); break;
      case 'text': FX.num(e.x, e.y - 3.4, e.text, 'label', e.color); break;
      case 'afterimage': FX.ghost(blob(U.rgba('#cfd6ff', 0.8)), e.x, e.y, 0.35, 0.5); break;
      case 'heal': for (let i = 0; i < 6; i++) FX.spark(e.x + (FX.rnd() - 0.5) * 1.6, e.y - 0.3 - FX.rnd(), 0, -3 - FX.rnd() * 2, 0.7, '#8dffb4', 0.13, 0.5); break;
      case 'recallOut': FX.pillar(e.x, e.y, 1.2, 0.6, '#ffffff'); break;
      default: break;
    }
  }

  /* 매 프레임: 돌진 잔상 · 예약된 효과 · 숲의 반딧불 */
  W.fxUpdate = function (dt) {
    const G = W.G; if (!G) return;
    for (let i = later.length - 1; i >= 0; i--) { later[i].t -= dt; if (later[i].t <= 0) { const f = later[i].fn; later.splice(i, 1); f(); } }
    for (let i = trails.length - 1; i >= 0; i--) {
      const tr = trails[i], u = tr.u;
      if (G.t > tr.until || u.dead || !u.dash) { trails.splice(i, 1); continue; }
      tr.next -= dt;
      if (tr.next <= 0) { tr.next = 0.032; FX.ghost(blob(U.rgba(tr.col, 0.85)), u.x, u.y - (u.z || 0), 0.26, 0.42); FX.spark(u.x + (FX.rnd() - 0.5), u.y - 0.9 - (u.z || 0), 0, 0, 0.3, tr.col, 0.12, 0); }
    }
    ambT -= dt;
    if (ambT <= 0 && FX.add.length < 260) {
      ambT = 0.09;
      const v = W.view, x = v.x0 + FX.rnd() * (v.x1 - v.x0), y = v.y0 + FX.rnd() * (v.y1 - v.y0);
      if (x > 1 && y > 1 && x < C.W - 1 && y < C.H - 1 && (!M.isGround(x, y) || M.bushAt(x, y)) && W.fogAt(x, y) > 0.2) {
        const p = FX.spark(x, y - 1, (FX.rnd() - 0.5) * 1.2, -0.3 - FX.rnd() * 0.6, 2.2 + FX.rnd() * 1.5, W.tint('lamp', x), 0.13, 0.2);
        if (p) p.firefly = true;
      }
    }
  };
  W.resetFx = function () { later.length = 0; trails.length = 0; merge.clear(); for (const s of act) { s.imp = false; s.hold = 0; s.tint = 0; s.fl = 0; } act.length = 0; corpses.length = 0; };
})();
