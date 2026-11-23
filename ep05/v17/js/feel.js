/* 어스름 전선 — feel: 손맛(조작감)을 눈과 귀로 돌려주는 층. 규칙은 건드리지 않고, 사건(G.events)과 유닛 상태를 읽어 알려 주기만 한다.
   ① 막타: 지금 치면 쓰러지는 미니언(금빛 ▼ · 금빛 고리 · 막대의 '한 대' 눈금) · 놓친 막타
   ② 평타 박자: 발밑 고리(다음 평타까지) + 영웅별 박자 점
   ③ 스킬 판정: 맞았다(명중 표식 · 맑은 두 음) / 빗나갔다('빗나감' · 힘 빠지는 소리) · 스킬 단추에도 불이 들어온다
   ④ 바로 쏘기(누르는 순간 발사)의 잔상 조준선: 어디로 나갔는지 잠깐 남는다
   ⑤ 지금 할 일: 다음 목표를 한 줄로 알려 주고 그쪽을 가리킨다
   ⑥ 다음 목표(8차): 시간대에 따라 바뀌는 목표 하나(라인 지키기 → 정글 몬스터 → 큰 몬스터 → 탑 부수기) — 이루면 그 자리에서 보상 */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map, X = TW.X, FX = TW.FX, W = TW.World, TAU = Math.PI * 2;
  const GOLD = '#ffd84a', MISS = '#d6daec', INK = 'rgba(5,8,22,0.9)';
  const F = TW.Feel = { casts: [], marks: [], ghosts: [], lh: new Map(), btn: [null, null, null, null], readyT: -9, lhReadyT: -9, obj: null, objT: -9, landT: -9, moved: 0, st: null };
  const _p = { x: 0, y: 0 };
  F.reset = function () {
    F.casts.length = 0; F.marks.length = 0; F.ghosts.length = 0; F.lh.clear(); F.btn = [null, null, null, null];
    F.readyT = -9; F.lhReadyT = -9; F.obj = null; F.objT = -9; F.landT = -9; F.moved = 0;
    F.gl = { cur: null, n: 0, log: [], flash: null };       // ⑥ 다음 목표
    // 시험 도구와 결과 화면이 읽는 손맛 통계
    F.st = { cast: [0, 0, 0, 0], hit: [0, 0, 0, 0], heroHit: [0, 0, 0, 0], miss: [0, 0, 0, 0], lhMarked: 0, lhGot: 0, lhLost: 0, atk: 0, atkLand: 0, atkCancel: 0, kite: 0 };
  };
  F.reset();
  F.stats = () => F.st;
  F.sfx = function (name, vol, delay) { const Au = TW.Audio; if (Au && Au.ok && !Au.muted) Au.cue(name, vol === undefined ? 1 : vol, delay || 0); };

  /* =====================================================================
     ① 막타
     ===================================================================== */
  function scanMinions() {
    const G = W.G, me = W.me, lh = F.lh;
    if (!me || me.dead) { lh.clear(); return; }
    for (const v of lh.values()) v.live = false;
    const ms = G.minions;
    for (let i = 0; i < ms.length; i++) {
      const u = ms[i];
      if (u.dead || u.team === me.team || !u.seen[me.team]) continue;
      const d = U.du(me, u); if (d > 17) continue;
      const dmg = TW.atkPreview(me, u), kill = u.hp <= dmg;
      let e = lh.get(u.id);
      if (!e) { e = { u, kill: false, killT: -1 }; lh.set(u.id, e); }
      e.live = true; e.dmg = dmg; e.frac = U.clamp(dmg / u.maxHp, 0, 1); e.soon = !kill && u.hp <= dmg * 1.9; e.reach = d - u.r <= me.range + 2.5;
      if (kill && !e.kill) {
        e.killT = G.t;
        if (e.reach) { F.st.lhMarked++; if (G.t - F.lhReadyT > 0.3) { F.lhReadyT = G.t; F.sfx('lh_ready', 0.55); } }
      }
      e.kill = kill;
    }
    for (const [id, v] of lh) if (!v.live) lh.delete(id);
  }
  /* 미니언 u 의 막타 정보: { kill(지금 한 대면 쓰러짐), soon(거의 다 옴), frac(내 한 대 / 최대 체력), reach } 또는 null */
  F.lastHit = (u) => F.lh.get(u.id) || null;

  /* =====================================================================
     ③ 스킬 판정
     ===================================================================== */
  function judgeOf(ab) {
    if (ab.judge !== undefined) return ab.judge;            // 0 = 빗나감을 따지지 않는 스킬
    if (ab.chan || ab.type === 'self' || ab.type === 'ally' || ab.icon === 'smoke' || ab.icon === 'ward' || ab.icon === 'blink') return 0;
    if (ab.icon === 'crescent') return 1.0;
    if (ab.ind === 'line' || ab.ind === 'cone') return ab.range / 26 + 0.25;
    if (ab.ind === 'dash' || ab.ind === 'fling') return ab.range / 28 + 0.35;
    if (ab.ind === 'circle') return 0.9;
    return 0;
  }
  function lastCast(slot) { for (let i = F.casts.length - 1; i >= 0; i--) if (F.casts[i].slot === slot) return F.casts[i]; return null; }
  function missed(c, x, y) {
    c.done = true; F.st.miss[c.slot]++;
    F.btn[c.slot] = { t: TW.UI ? TW.UI.t : 0, ok: false };
    FX.num(x, y - 1.2, '빗나감', 'miss', MISS);
    F.sfx('whiff', 0.8);
  }
  function castOpen(e) {
    const ab = e.ab, me = e.u, tg = e.tg || {}, j = judgeOf(ab), G = W.G;
    F.st.cast[e.slot]++;
    let ex, ey;
    if (ab.type === 'ground') { ex = tg.x; ey = tg.y; }
    else { const L = (ab.type === 'charge' ? ab.minRange + (ab.range - ab.minRange) * (e.k || 0) : ab.range || 3) * 0.86; ex = me.x + (tg.dx || 0) * L; ey = me.y + (tg.dy || 0) * L; }
    F.casts.push({ slot: e.slot, ab, t: G.t, dl: j > 0 ? G.t + j : 0, hit: 0, hero: 0, ex, ey, done: false });
    if (F.casts.length > 14) F.casts.shift();
  }
  function skillHit(e) {
    const tg = e.tgt, me = e.src, c = lastCast(e.slot);
    const first = !c || c.hit === 0, heroFirst = tg.isHero && (!c || c.hero === 0);
    if (c) { c.hit++; if (tg.isHero) c.hero++; }
    if (first) { F.st.hit[e.slot]++; F.btn[e.slot] = { t: TW.UI ? TW.UI.t : 0, ok: true }; }
    if (heroFirst) F.st.heroHit[e.slot]++;
    if (first || heroFirst) {
      F.marks.push({ u: tg, x: tg.x, y: tg.y, t: 0, hero: tg.isHero, col: me.hd.glow });
      if (F.marks.length > 10) F.marks.shift();
      F.sfx(tg.isHero ? 'hitmark_hero' : 'hitmark', tg.isHero ? 1 : 0.9, 0.05);      // 타격음 바로 뒤에 얹는다 (묻히지 않게)
      if (heroFirst) FX.num(tg.x, tg.y - 4.2, '명중!', 'label', me.hd.glow);
    }
  }

  /* =====================================================================
     사건
     ===================================================================== */
  F.onEvent = function (e, G, me) {
    if (!me) return;
    if (!F.mp) goalEvent(e, G, me);          // 친구 방에서는 목표를 F.simGoals 가 시뮬레이션 틱 안에서 센다
    switch (e.type) {
      case 'castFire': if (e.u === me) castOpen(e); break;
      case 'hit': if (e.src === me && e.slot !== undefined && e.slot < 4) skillHit(e); break;
      case 'projEnd': {
        const p = e.p; if (p.src !== me || !p.skill || p.sub || p.slot === undefined) break;
        const c = lastCast(p.slot); if (!c || c.done || c.ab.chan) break;
        c.done = true; if (!c.hit) missed(c, p.x, p.y);
        break;
      }
      case 'attackStart': if (e.u === me) { F.st.atk++; if (F.moved > 1.2 && G.t - F.landT < 3.5) F.st.kite++; F.moved = 0; } break;
      case 'melee': case 'shoot': if (e.u === me) { F.st.atkLand++; F.landT = G.t; F.moved = 0; } break;
      case 'atkCancel': if (e.u === me) F.st.atkCancel++; break;
      case 'atkReady': if (e.u === me) { F.readyT = G.t; if (G.t - me.atkT < 4 && !(me.order && me.order.type === 'attack')) F.sfx('atk_ready', 0.7); } break;      // 걷는 중(때리고 빠지는 중)일 때만 '다시 칠 수 있다'를 귀로 알려 준다
      case 'lastHit': if (e.u === me) { F.st.lhGot++; F.lh.delete(e.tgt.id); } break;
      case 'death': {
        const u = e.u; if (!u.isMinion) break;
        const m = F.lh.get(u.id); if (!m) break;
        F.lh.delete(u.id);
        if (e.killer !== me && m.kill && m.reach && !me.dead && G.t - m.killT >= 0.3) { F.st.lhLost++; FX.num(u.x, u.y - 1.7, '놓침', 'miss', MISS); F.sfx('lh_miss', 0.6); }
        break;
      }
      default: break;
    }
  };
  /* 누르는 순간 나간 스킬의 잔상 조준선 */
  F.castGhost = function (slot, x, y) {
    const me = W.me; if (!me) return;
    const ab = me.hd.abilities[slot]; let dx = x - me.x, dy = y - me.y; const d = Math.hypot(dx, dy) || 1;
    F.ghosts.push({ ab, ox: me.x, oy: me.y, dx: dx / d, dy: dy / d, d, t: 0, col: me.hd.glow });
    if (F.ghosts.length > 6) F.ghosts.shift();
  };

  F.update = function (dt) {
    const G = W.G, me = W.me; if (!G) return;
    scanMinions();
    for (const c of F.casts) if (!c.done && c.dl && G.t >= c.dl) { if (!c.hit) missed(c, c.ex, c.ey); else c.done = true; }
    for (let i = F.marks.length - 1; i >= 0; i--) { const m = F.marks[i]; m.t += dt; if (m.u && !m.u.dead) { m.x = m.u.x; m.y = m.u.y; } if (m.t > 0.3) F.marks.splice(i, 1); }
    for (let i = F.ghosts.length - 1; i >= 0; i--) { F.ghosts[i].t += dt; if (F.ghosts[i].t > 0.28) F.ghosts.splice(i, 1); }
    if (me && !me.dead && me.moving && !me.dash) F.moved += me.ms * dt;      // 마지막 평타 뒤로 걸은 거리 (때리고 빠지기 세기)
    if (!F.mp && me && !G.over) goalTick(G, me);
  };
  /* 친구 방: 목표 보상(골드·경험치)은 게임 상태를 바꾼다 → 화면 프레임이 아니라 시뮬레이션 틱마다, 사람이 모는 영웅 모두에게 같은 순서로 센다.
     그래야 두 화면의 골드가 끝까지 같다. 내 화면에 그리는 목표는 내 영웅의 것(F.gl). */
  F.mpStart = function (heroes, me) {
    F.mp = heroes.slice();
    for (const h of F.mp) h._gl = { cur: null, n: 0, log: [], flash: null };
    F.gl = (me && me._gl) || F.gl;
  };
  F.mpEnd = function () { F.mp = null; };
  F.simGoals = function (G, ev) {
    const hs = F.mp; if (!hs) return;
    const view = F.gl;
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i];
      if (!h.isPlayer) continue;          // 봇이 이어받은 자리는 목표가 없다 (봇처럼 돈다)
      F.gl = h._gl;
      for (let k = 0; k < ev.length; k++) goalEvent(ev[k], G, h);
      if (!G.over) goalTick(G, h);
    }
    F.gl = view;
  };

  /* =====================================================================
     그리기 — 땅 (땅 좌표)
     ===================================================================== */
  F.ground = function (ctx, t) {
    const G = W.G, me = W.me; if (!G || !me || me.dead) return;
    // ① 막타 고리: 금빛 = 지금 · 옅은 호박빛 = 곧
    for (const e of F.lh.values()) {
      if (!e.kill && !e.soon) continue;
      const u = e.u, s = W.vis.get(u.id), x = s ? s.x : u.x, y = s ? s.y : u.y;
      if (e.kill) {
        const pk = 0.5 + 0.5 * Math.sin(t * 11);
        ctx.globalAlpha = 0.22 + 0.12 * pk; X.circle(ctx, x, y, u.r * 1.5 + 0.35); X.fill(ctx, GOLD);
        ctx.globalAlpha = 1; X.circle(ctx, x, y, u.r * 1.5 + 0.35 + 0.16 * pk); X.stroke(ctx, GOLD, 0.2);
        ctx.globalAlpha = 0.9; X.circle(ctx, x, y, u.r * 1.5 + 0.12); X.stroke(ctx, '#fff6c8', 0.07);
      } else { ctx.globalAlpha = 0.5; X.circle(ctx, x, y, u.r * 1.5 + 0.2); X.stroke(ctx, '#c9a23a', 0.09); }
    }
    ctx.globalAlpha = 1;
    // ④ 잔상 조준선
    const D = W.Draw;
    for (const g of F.ghosts) {
      const a = 1 - g.t / 0.28, ab = g.ab, ind = ab.ind;
      if (ind === 'line') D.lineInd(ctx, g.ox, g.oy, g.dx, g.dy, ab.range, ab.width, g.col, 0.85 * a, ab.tip || 0, 0);
      else if (ind === 'dash' || ind === 'fling') { const p = M.rayWalk(g.ox, g.oy, g.ox + g.dx * ab.range, g.oy + g.dy * ab.range); D.lineInd(ctx, g.ox, g.oy, g.dx, g.dy, Math.max(0.5, Math.hypot(p.x - g.ox, p.y - g.oy)), ab.width, g.col, 0.8 * a, 0, 0); }
      else if (ind === 'circle' || ind === 'blink') { const L = Math.min(g.d, ab.range), tx = g.ox + g.dx * L, ty = g.oy + g.dy * L; ctx.globalAlpha = 0.9 * a; X.circle(ctx, tx, ty, ab.radius || 1); X.stroke(ctx, g.col, 0.14); ctx.globalAlpha = 0.16 * a; ctx.fill(); ctx.globalAlpha = 0.5 * a; ctx.beginPath(); ctx.moveTo(g.ox, g.oy); ctx.lineTo(tx, ty); X.stroke(ctx, g.col, 0.07); }
      else if (ind === 'cone') { const an = Math.atan2(g.dy, g.dx); ctx.globalAlpha = 0.3 * a; X.pie(ctx, g.ox, g.oy, ab.range, an - ab.angle, an + ab.angle); X.fill(ctx, g.col); }
      else if (ind === 'self') { ctx.globalAlpha = 0.8 * a; X.circle(ctx, g.ox, g.oy, ab.radius || 3); X.stroke(ctx, g.col, 0.12); }
    }
    ctx.globalAlpha = 1;
    // ② 평타 박자 고리 (싸우는 동안만)
    const s = W.vis.get(me.id); if (!s) return;
    // A 를 누르고 있는 동안에는 내 평타 사거리가 보인다 (얼마나 다가가야 닿는지)
    if (TW.App && TW.App.keys && TW.App.keys.KeyA) { ctx.globalAlpha = 0.6; ctx.setLineDash([0.7, 0.5]); ctx.lineDashOffset = -t * 2; X.circle(ctx, s.x, s.y, me.range + 0.7); X.stroke(ctx, '#ffffff', 0.09); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1; }
    if (!(G.t - me.atkT < 6 || F.lh.size > 0 || G.t - me.lastHurt < 4)) return;
    const x = s.x, y = s.y, R = 1.86, period = 1 / me.as, k = me.atkCd > 0 ? 1 - U.clamp(me.atkCd / period, 0, 1) : 1, col = me.hd.glow;
    ctx.globalAlpha = 0.6; X.circle(ctx, x, y, R); X.stroke(ctx, '#080c20', 0.32);
    if (k < 1) { ctx.globalAlpha = 1; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * k); X.stroke(ctx, col, 0.2); }
    else { const fl = Math.max(0, 1 - (G.t - F.readyT) / 0.3); ctx.globalAlpha = 0.7 + 0.3 * fl; X.circle(ctx, x, y, R + fl * 0.3); X.stroke(ctx, fl > 0.05 ? '#ffffff' : col, 0.17 + 0.14 * fl); }
    const bt = me.hd.beat;
    if (bt) {        // 영웅별 박자 점: 모루 = 세 번째 내리찍기까지 · 불티 = 달아오름
      const n = bt.n, cur = bt.of(me), full = cur >= n - (bt.n === 3 ? 1 : 0), step = Math.min(0.3, 1.5 / n);
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 - (i - (n - 1) / 2) * step, px = x + Math.cos(a) * (R + 0.5), py = y + Math.sin(a) * (R + 0.5), on = i < cur || (bt.n === 3 && i === cur && full);
        ctx.globalAlpha = 0.95; X.circle(ctx, px, py, 0.2); X.fill(ctx, '#080c20');
        X.circle(ctx, px, py, 0.14); X.fill(ctx, i < cur ? col : full && i === cur ? '#ffffff' : 'rgba(120,128,170,0.55)');
        if (on && full) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 12); X.circle(ctx, px, py, 0.26); X.stroke(ctx, '#ffffff', 0.05); }
      }
    }
    ctx.globalAlpha = 1;
  };

  /* =====================================================================
     그리기 — 화면 (화면 좌표)
     ===================================================================== */
  /* 금빛 ▼ : 지금 치면 쓰러지는 미니언 머리 위에서 까딱인다. (sx, sy) = 체력 막대 위 가운데 */
  F.killArrow = function (ctx, sx, sy, ui, t, big) {
    const b = Math.abs(Math.sin(t * 7)) * 7 * ui, w = (big ? 16 : 13.5) * ui, h = (big ? 19 : 16) * ui, y = sy - 7 * ui - b;
    ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(sx, y - h * 0.55, h * 1.05, 0, TAU); ctx.fillStyle = INK; ctx.fill(); ctx.globalAlpha = 1;      // 어두운 받침: 싸움 한복판에서도 묻히지 않게
    ctx.beginPath(); ctx.moveTo(sx - w, y - h); ctx.lineTo(sx + w, y - h); ctx.lineTo(sx, y); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 4 * ui; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = GOLD; ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx - w * 0.5, y - h * 0.82); ctx.lineTo(sx + w * 0.5, y - h * 0.82); ctx.lineTo(sx, y - h * 0.36); ctx.closePath(); ctx.fillStyle = '#fff6c8'; ctx.fill();
  };
  F.overlay = function (ctx) {
    const G = W.G, me = W.me, ui = W.ui; if (!G) return;
    // ③ 명중 표식: 네 갈래가 안으로 모인다
    ctx.lineCap = 'round';
    for (const m of F.marks) {
      W.toScreen(m.x, m.y, _p, m.hero ? 1.5 : 0.8);
      const k = m.t / 0.3, r0 = (m.hero ? 30 : 20) * ui * (1.25 - 0.55 * U.easeOut3(Math.min(1, k * 2.2))), len = (m.hero ? 17 : 11) * ui;
      ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { const an = Math.PI / 4 + i * Math.PI / 2, c = Math.cos(an), sn = Math.sin(an); ctx.moveTo(_p.x + c * r0, _p.y + sn * r0); ctx.lineTo(_p.x + c * (r0 + len), _p.y + sn * (r0 + len)); }
        ctx.strokeStyle = pass ? (m.hero ? '#ffffff' : m.col) : INK; ctx.lineWidth = (pass ? (m.hero ? 4.5 : 3.2) : (m.hero ? 9 : 7)) * ui; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // ⑤ 목표가 화면 밖이면 가장자리에서 그쪽을 가리킨다 (가는 길에 지도·스킬 단추 같은 HUD 가 있으면 그 앞에서 멈춘다 — 단추 뒤에 가리지 않게)
    //    8차: 귀환·본진 막기가 아니면 화면 위 '다음 목표'의 자리를 가리킨다
    const o = me && !me.dead ? F.pointer() : null;
    if (o && !W.onScreen(o.x, o.y, -3)) {
      W.toScreen(o.x, o.y, _p, 0);
      const cx = W.vw / 2, cy = W.vh / 2, dx = _p.x - cx, dy = _p.y - cy, mx = W.vw / 2 - 150 * ui, my = W.vh / 2 - 130 * ui;
      const k = F.clearOfHud(cx, cy, dx, dy, Math.min(mx / Math.max(1, Math.abs(dx)), my / Math.max(1, Math.abs(dy)))), ax = cx + dx * k, ay = cy + dy * k, an = Math.atan2(dy, dx), pl = 0.5 + 0.5 * Math.sin(W.time * 5);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(an);
      ctx.beginPath(); ctx.moveTo((18 + pl * 5) * ui, 0); ctx.lineTo(-8 * ui, -12 * ui); ctx.lineTo(-2 * ui, 0); ctx.lineTo(-8 * ui, 12 * ui); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = 4 * ui; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = o.col; ctx.fill(); ctx.restore();
      X.text(ctx, o.short + ' ' + o.dist, ax - Math.cos(an) * 26 * ui, ay - Math.sin(an) * 26 * ui - 16 * ui, 12.5 * ui, o.col, 'center', 800, INK, 3 * ui);
    }
  };

  /* 화면 가운데(cx,cy)에서 (dx,dy) 쪽으로 k 만큼 간 자리가 HUD 뒤에 가리면, HUD 에 닿기 직전까지로 k 를 줄여 돌려준다 (화면 화소 좌표).
     HUD 자리: 고정된 다섯 군데(지도·목표 칸 / 점수판·길잡이 / 골드·상점 / 스킬 단추 / 내 초상·체력) + 지금 떠 있는 눌리는 칸들(UI.zones) */
  const _hud = [];
  F.clearOfHud = function (cx, cy, dx, dy, k) {
    const UIx = TW.UI; if (!UIx || !(UIx.W > 0) || !(UIx.H > 0)) return k;
    const Wd = UIx.W, Hd = UIx.H, s = W.vw / Wd, pad = 34, R = _hud, k0 = k;       // s = 화면 화소 / HUD 단위
    R.length = 0;
    R.push(0, 0, 318, 300, Wd / 2 - 385, 0, 770, 142, Wd - 395, 0, 395, 138, Wd - 340, Hd - 335, 340, 335, 0, Hd - 160, 540, 160);      // 가운데 위: 점수판 + 8차 '다음 목표' 줄과 네 칸 길 (예전 126)
    const z = UIx.zones || [];
    for (let i = 0; i < z.length; i += 4) {
      if (z[i] <= Wd / 2 && z[i] + z[i + 2] >= Wd / 2 && z[i + 1] <= Hd / 2 && z[i + 1] + z[i + 3] >= Hd / 2) return k;       // 화면 가운데를 덮는 창(멈춤·도움말)이 떠 있으면 그대로 둔다
      R.push(z[i], z[i + 1], z[i + 2], z[i + 3]);
    }
    for (let i = 0; i < R.length; i += 4) {
      const x0 = (R[i] - pad) * s, y0 = (R[i + 1] - pad) * s, x1 = (R[i] + R[i + 2] + pad) * s, y1 = (R[i + 1] + R[i + 3] + pad) * s;
      let t0 = 0, t1 = k, a, b;          // 반직선이 이 네모 안에 있는 구간 [t0, t1]
      if (Math.abs(dx) < 1e-6) { if (cx < x0 || cx > x1) continue; } else { a = (x0 - cx) / dx; b = (x1 - cx) / dx; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
      if (Math.abs(dy) < 1e-6) { if (cy < y0 || cy > y1) continue; } else { a = (y0 - cy) / dy; b = (y1 - cy) / dy; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
      if (t0 <= t1 && t0 > 0 && t0 < k) k = t0;
    }
    return Math.max(k, k0 * 0.3);
  };

  /* =====================================================================
     ⑤ 지금 할 일
     ===================================================================== */
  F.objective = function () {
    const G = W.G, me = W.me; if (!G || !me || G.over || me.dead) return null;
    if (G.t - F.objT < 0.5) return F.obj;
    F.objT = G.t;
    const lane = G.brawl ? 0 : TW.POS_LANE[me.pos]; let o = null;
    if (G.brawl && me.hp / me.maxHp < 0.3) {
      // 한 줄 난전: 귀환이 없다 → 나와 있는 회복 꾸러미(가장 가까운 것), 없으면 우리 등불탑 뒤
      const p = F.nearPack(G, me, true);
      if (p && p.cb) o = { kind: 'recall', x: p.x, y: p.y, text: '체력이 낮습니다 — 우리 언덕의 금빛 역전 꾸러미로!', sub: '역전 기회 동안 우리 두 등불탑 사이에 생깁니다 · 체력 +' + Math.round(C.BRAWL.CB_PACK_HEAL * 100) + '% · 보호막', short: '역전 꾸러미', col: '#ffe08a', frac: -1 };
      else if (p) o = { kind: 'recall', x: p.x, y: p.y, text: '체력이 낮습니다 — 초록 회복 꾸러미를 밟으세요', sub: '다리 위 보따리를 지나가면 체력 +' + Math.round(C.BRAWL.PACK_HEAL * 100) + '% · 본진에서는 회복되지 않습니다', short: '꾸러미', col: '#9dffc0', frac: -1 };
      else { const s = F.homeTower(G, me), q = F.nearPack(G, me, false); o = { kind: 'recall', x: s.x, y: s.y, text: '체력이 낮습니다 — 우리 등불탑 뒤로 물러나세요', sub: q ? '다음 회복 꾸러미 ' + Math.ceil(Math.max(0, q.nextT - G.t)) + '초 뒤 · 본진에서는 회복되지 않습니다' : '본진에서는 회복되지 않습니다', short: '물러나기', col: '#ff9aa8', frac: -1 }; }
    } else if (!G.brawl && me.hp / me.maxHp < 0.28 && !me.atFountain) {
      const f = M.bases[me.team].fountain;
      o = { kind: 'recall', x: f.x, y: f.y, text: '체력이 낮습니다 — 물러나서 B 로 귀환', short: '귀환', col: '#ff9aa8', frac: -1 };
    } else {
      const core = G.cores[me.team];
      if (!core.dead && G.t - core.lastHurt < 5 && U.du(core, me) > 16) o = { kind: 'defend', unit: core, x: core.x, y: core.y, text: '우리 큰등불이 맞고 있습니다 — 막으러 가세요!', short: '본진', col: '#ff9aa8', frac: core.hp / core.maxHp };
      else {
        let best = null, bs = 1e9;
        for (const s of G.structs) { if (s.team === me.team || s.dead || !s.vulnerable) continue; let d = U.du(s, me); if (lane >= 0 && s.lane === lane) d -= 45; if (s.kind === 'core') d -= 12; if (d < bs) { bs = d; best = s; } }
        if (best) {
          o = { kind: 'push', unit: best, x: best.x, y: best.y, text: best.kind === 'core' ? '적 큰등불을 부수면 승리!' : M.laneName(best.lane) + ' · 적 ' + best.name + ' 부수기', short: best.kind === 'core' ? '큰등불' : '등불탑', col: GOLD, frac: best.hp / best.maxHp };
          const d = U.du(best, me);
          let mine = 0; if (d < best.range + 10) for (const u of G.hash.query(best.x, best.y, best.range)) if (u.isMinion && u.team === me.team) mine++;
          if (d < best.range + 10 && !mine) o.sub = '미니언과 함께 들어가세요 — 혼자 가면 등불탑이 나를 쏩니다';
          else if (G.t < 180 && me.cs < 10) o.sub = lane >= 0 ? '금빛 ▼ 가 뜬 미니언을 쳐서 골드를 모으며 밀어 가세요' : '숲의 몬스터를 잡아 크고, 길 싸움에 끼어드세요';
          else if (d < best.range + 10) o.sub = '미니언이 맞아 주는 동안 등불탑을 치세요';
          else o.sub = '길을 따라 미니언과 함께 밀어 가세요';
        }
      }
    }
    if (o) o.dist = Math.round(U.dist(me.x, me.y, o.x, o.y));
    F.obj = o;
    return o;
  };

  /* =====================================================================
     ⑥ 다음 목표 (8차: "목표가 없는 것 같은데")
        화면 위 한 줄. 시간대에 따라 바뀐다: ① 라인 지키기(막타) → ② 정글 몬스터(숲 몬스터 한 무리) → ③ 큰 몬스터(고목 정령·이무기, 아군과 함께) → ④ 탑 부수기.
        일찍 이루면 다음 목표가 바로 오고, 그 시간대가 지나도록 못 이루면 다음으로 넘어간다. 이루면 그 자리에서 골드·경험치를 준다.
        ④ 뒤로는 큰 몬스터(나와 있거나 곧 나올 때)와 탑을 번갈아, 적 큰등불이 열리면 마지막 목표. 정글 자리는 ①을 건너뛰고 ②가 두 무리.
     ===================================================================== */
  const GOAL = F.GOAL = {
    lane:  { name: '라인 지키기', col: '#ffd84a', gold: 90,  xp: 60 },
    camp:  { name: '정글 몬스터', col: '#ffa45c', gold: 80,  xp: 80 },
    big:   { name: '큰 몬스터',   col: '#7dffd9', gold: 150, xp: 120 },
    tower: { name: '탑 부수기',   col: '#ffe2a6', gold: 120, xp: 100 },
    core:  { name: '큰등불',      col: '#ffd84a', gold: 0,   xp: 0 },
    brawl: { name: '첫 싸움',     col: '#ff9a6a', gold: 90,  xp: 70 },       // 한 줄 난전
    pack:  { name: '회복 꾸러미', col: '#9dffc0', gold: 60,  xp: 40 },
  };
  F.ROUTE = ['lane', 'camp', 'big', 'tower'];
  F.BRAWL_ROUTE = ['brawl', 'pack', 'tower'];          // 한 줄 난전: 첫 싸움 › 회복 꾸러미 › 탑 부수기 (그 뒤로는 탑 → 큰등불)
  F.routeFor = (G, me) => (G && G.brawl ? F.BRAWL_ROUTE : F.ROUTE.filter(k => !(k === 'lane' && me.pos === 'jg')));
  /* 한 줄 난전: 가장 가까운 회복 꾸러미 (up = 나와 있는 것만, 아니면 곧 나올 것) · 우리 쪽 물러날 등불탑 */
  F.nearPack = function (G, me, up) {
    let best = null, bs = 1e9;
    for (const p of G.packs || []) { if ((up && !p.up) || (p.team >= 0 && p.team !== me.team) || p.nextT > 1e8) continue; const s = U.dist(me.x, me.y, p.x, p.y) + (p.up ? 0 : Math.max(0, p.nextT - G.t) * 6) - (p.cb && p.up ? 12 : 0); if (s < bs) { bs = s; best = p; } }
    return best;
  };
  F.homeTower = function (G, me) {
    let best = null; for (const s of G.structs) if (s.team === me.team && !s.dead && (!best || (s.kind !== 'core' && (best.kind === 'core' || s.tier < best.tier)))) best = s;
    const f = M.bases[me.team].fountain; if (!best) return f;
    const dx = f.x - best.x, dy = f.y - best.y, d = Math.hypot(dx, dy) || 1;
    return { x: best.x + dx / d * 6, y: best.y + dy / d * 6 };
  };
  const LANE_UNTIL = 120, CAMP_UNTIL = 225, BIG_UNTIL = 450;       // 시간대의 끝: 2:00 · 3:45 · 7:30
  const isBig = (c) => c.kind === 'boss' || c.kind === 'elder';
  function enemyCoreOpen(G, me) { for (const s of G.structs) if (s.kind === 'core' && s.team !== me.team && !s.dead && s.vulnerable) return true; return false; }
  function goalStart(G, me, kind) {
    const gl = F.gl; gl.n++;
    let until = 0;
    if (kind === 'lane') until = LANE_UNTIL;
    else if (kind === 'camp') until = Math.max(CAMP_UNTIL, G.t + 60);
    else if (kind === 'big') until = gl.n <= 3 ? Math.max(BIG_UNTIL, G.t + 90) : G.t + 150;
    else if (kind === 'brawl') until = Math.max(150, G.t + 60);
    else if (kind === 'pack') until = G.t + 120;
    gl.cur = { kind, n: gl.n, t0: G.t, have: 0, need: kind === 'lane' ? 5 : kind === 'camp' && me.pos === 'jg' && gl.n === 1 ? 2 : 1, until };
    gl.view = null;
  }
  function goalNext(G, me) {
    const gl = F.gl, prev = gl.cur ? gl.cur.kind : null;
    let kind;
    if (enemyCoreOpen(G, me)) kind = 'core';
    else if (G.brawl) kind = !prev ? 'brawl' : prev === 'brawl' ? 'pack' : 'tower';
    else if (!prev) kind = me.pos === 'jg' ? 'camp' : 'lane';
    else if (prev === 'lane') kind = 'camp';
    else if (prev === 'camp') kind = 'big';
    else if (prev === 'big') kind = 'tower';
    else {        // ④ 뒤: 큰 몬스터가 나와 있거나 40초 안에 나오면 큰 몬스터, 아니면 다음 탑
      let soon = false; for (const c of G.camps) if (isBig(c) && (c.alive.length || c.nextT - G.t < 40)) soon = true;
      kind = soon ? 'big' : 'tower';
    }
    goalStart(G, me, kind);
  }
  /* ok = 이룸(보상) · 못 이룸(why: 'time' 시간대가 지남 / 'enemy' 적이 먼저 잡음) */
  function goalDone(G, me, ok, why) {
    const gl = F.gl, c = gl.cur, def = GOAL[c.kind];
    let gold = 0, xp = 0;
    if (ok && def.gold > 0) { gold = me.addGold(def.gold); xp = def.xp; me.addXp(xp); G.emit('gold', { u: me, amt: gold, x: me.x, y: me.y, reason: 'goal' }); }
    gl.log.push({ kind: c.kind, n: c.n, ok, t0: +c.t0.toFixed(1), t: +G.t.toFixed(1), gold, why: why || '' });
    gl.flash = { kind: c.kind, n: c.n, ok, gold, xp, why: why || '', at: TW.UI ? TW.UI.t : 0 };
    if (ok) G.emit('goalDone', { u: me, kind: c.kind, n: c.n, gold, xp });
    goalNext(G, me);
  }
  function goalTick(G, me) {
    const c = F.gl.cur;
    if (!c) { goalNext(G, me); return; }
    if (c.until && G.t >= c.until) goalDone(G, me, false, 'time');
  }
  function goalEvent(e, G, me) {
    const c = F.gl.cur; if (!c || G.over) return;
    let add = 0;
    switch (e.type) {
      case 'lastHit': if (c.kind === 'lane' && e.u === me && e.tgt && e.tgt.isMinion) add = 1; break;
      case 'campClear': { const k = e.killer, cp = e.camp; if (c.kind === 'camp' && !isBig(cp) && k && (k === me || (k.team === me.team && !me.dead && U.dist(me.x, me.y, cp.x, cp.y) < 16))) add = 1; break; }
      case 'elderDown': case 'bossDown': if (c.kind === 'big') { if (e.team === me.team) add = 1; else { goalDone(G, me, false, 'enemy'); return; } } break;
      case 'towerDown': if (c.kind === 'tower' && e.team === me.team) add = 1; break;
      case 'kill': if (c.kind === 'brawl' && e.killer && e.killer.team === me.team && (e.killer === me || (e.assists && e.assists.indexOf(me) >= 0))) add = 1; break;
      case 'packTake': if (c.kind === 'pack' && e.u === me) add = 1; break;
      default: return;
    }
    if (add) { c.have += add; F.gl.pop = TW.UI ? TW.UI.t : 0; if (c.have >= c.need) goalDone(G, me, true); }
  }
  /* 지금 목표를 화면에 그릴 꼴로: { kind, n, name, col, text(무엇을), sub(어떻게), have/need, gold, left(남은 초, 없으면 -1), x/y(가리킬 곳), short, dist, frac } */
  F.goal = function () {
    const G = W.G, me = W.me, gl = F.gl; if (!G || !me || G.over || !gl.cur) return null;
    const c = gl.cur;
    if (gl.view && gl.view.n === c.n && gl.view.have === c.have && G.t - gl.viewT < 0.25) return gl.view;
    const def = GOAL[c.kind], v = { kind: c.kind, n: c.n, name: def.name, col: def.col, have: c.have, need: c.need, gold: def.gold, xp: def.xp, left: c.until ? Math.max(0, c.until - G.t) : -1, text: '', sub: '', short: def.name, frac: -1 };
    if (c.kind === 'lane') {
      v.text = '막타 ' + c.need + '개 — 금빛 ▼ 미니언을 치세요'; v.short = '라인';
      v.sub = '우리 미니언 뒤에서 버티며 골드를 모으세요';
      const lane = TW.POS_LANE[me.pos]; let best = null;
      for (const s of G.structs) if (s.team === me.team && !s.dead && s.kind !== 'core' && s.lane === lane && (!best || s.tier < best.tier)) best = s;
      if (best) { v.x = best.x; v.y = best.y; }
    } else if (c.kind === 'camp') {
      let best = null, bd = 1e9;
      for (const cp of G.camps) { if (isBig(cp)) continue; const d = U.dist(me.x, me.y, cp.x, cp.y) + (cp.alive.length ? 0 : 60 + Math.max(0, cp.nextT - G.t) * 2) + (cp.side === me.team ? 0 : 25); if (d < bd) { bd = d; best = cp; } }
      v.text = c.need > 1 ? '숲 몬스터 두 무리 잡기' : '숲 몬스터 한 무리 잡기'; v.short = '숲 몬스터';
      if (best) { v.x = best.x; v.y = best.y; const nm = TW.CAMP_NAME[best.kind] || '숲 몬스터'; v.sub = best.alive.length ? '가까운 무리: ' + nm + ' — 우클릭으로 치고, 다 잡으면 달성' : nm + ' ' + U.fmtTime(Math.max(0, best.nextT - G.t)) + ' 뒤에 다시 나옴'; if (best.alive.length) { let hp = 0, mx = 0; for (const m of best.alive) { hp += m.hp; mx += m.maxHp; } v.frac = mx > 0 ? hp / mx : -1; } }
    } else if (c.kind === 'big') {
      let best = null, bd = 1e9;
      for (const cp of G.camps) { if (!isBig(cp)) continue; const d = cp.alive.length ? U.dist(me.x, me.y, cp.x, cp.y) : 1e4 + cp.nextT; if (d < bd) { bd = d; best = cp; } }
      if (best) {
        const nm = TW.CAMP_NAME[best.kind]; v.x = best.x; v.y = best.y; v.short = nm;
        v.text = nm + ' 잡기 — 아군과 함께';
        if (best.alive.length) { const m = best.alive[0]; v.frac = m.hp / m.maxHp; v.sub = 'G 로 아군을 부르고 함께 치세요 · 잡으면 팀 전체가 강해집니다'; }
        else v.sub = nm + ' ' + U.fmtTime(Math.max(0, best.nextT - G.t)) + ' 뒤에 나타남 — 그동안 막타를 모으세요';
      }
    } else if (c.kind === 'brawl') {
      let best = null, bd = 1e9;
      for (const e of G.heroes) { if (e.team === me.team || e.dead || !e.seen[me.team]) continue; const d = U.du(e, me); if (d < bd) { bd = d; best = e; } }
      v.text = '적 영웅 처치 또는 도움 1번'; v.short = '첫 싸움';
      v.sub = best ? '보이는 적: ' + best.name + ' — 아군 곁에서 스킬을 맞히고 평타로 마무리하세요' : '다리 한가운데로 — 적은 이 길 하나로만 옵니다';
      if (best) { v.x = best.x; v.y = best.y; v.frac = best.hp / best.maxHp; } else { v.x = M.CX; v.y = M.CY; }
    } else if (c.kind === 'pack') {
      const p = F.nearPack(G, me, false);
      v.text = '회복 꾸러미 줍기 — 초록 보따리를 밟으세요'; v.short = '꾸러미';
      if (p) { v.x = p.x; v.y = p.y; v.sub = p.up ? '체력이 깎였을 때 밟으면 체력 +' + Math.round(C.BRAWL.PACK_HEAL * 100) + '% · 잠깐 빨라집니다 (다 찬 체력이면 줍지 않습니다)' : '가장 가까운 꾸러미 ' + Math.ceil(Math.max(0, p.nextT - G.t)) + '초 뒤에 생김 — 지도 위 초록 점'; }
    } else if (c.kind === 'tower' || c.kind === 'core') {
      const lane = G.brawl ? 0 : TW.POS_LANE[me.pos]; let best = c.tgt && !c.tgt.dead && c.tgt.vulnerable ? c.tgt : null, bs = 1e9;      // 한 번 고른 탑은 무너질 때까지 그대로 (걸어 다니는 동안 글이 이 탑 저 탑으로 바뀌지 않게)
      if (!best) for (const s of G.structs) { if (s.team === me.team || s.dead || !s.vulnerable) continue; if (c.kind === 'core' && s.kind !== 'core') continue; let d = U.du(s, me); if (lane >= 0 && s.lane === lane) d -= 45; if (s.kind === 'core') d -= 12; if (d < bs) { bs = d; best = s; } }
      c.tgt = best;
      if (best) {
        v.x = best.x; v.y = best.y; v.frac = best.hp / best.maxHp;
        v.text = best.kind === 'core' ? '적 큰등불을 부수면 승리!' : M.laneName(best.lane) + ' 적 ' + best.name + ' 부수기'; v.short = best.kind === 'core' ? '큰등불' : '등불탑';
        const d = U.du(best, me); let mine = 0;
        if (d < best.range + 10) for (const u of G.hash.query(best.x, best.y, best.range)) if (u.isMinion && u.team === me.team) mine++;
        v.sub = d < best.range + 10 && !mine ? '미니언과 함께 들어가세요 — 혼자 가면 등불탑이 나를 쏩니다' : d < best.range + 10 ? '미니언이 맞아 주는 동안 등불탑을 치세요' : '길을 따라 미니언과 함께 밀어 가세요';
      }
    }
    if (v.x !== undefined) v.dist = Math.round(U.dist(me.x, me.y, v.x, v.y));
    gl.view = v; gl.viewT = G.t;
    return v;
  };
  /* 화면 가장자리 화살표·지도 마름모가 가리킬 곳: 귀환·본진 막기가 먼저, 아니면 다음 목표의 자리 */
  F.pointer = function () {
    const o = F.objective(); if (!o) return null;
    if (o.kind === 'recall' || o.kind === 'defend') return o;
    const g = F.goal();
    return g && g.x !== undefined ? g : o;
  };
})();
