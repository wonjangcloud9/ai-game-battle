/* 어스름 전선 — worldfx: 경기 사건(G.events) → 눈에 보이는 손맛 (불꽃·숫자·흔들림·멈칫)
   타격의 네 단계가 서로 다르게 보이도록 한다:
     평타(basic) = 작은 불똥 + 흰 숫자 · 스킬(skill) = 색 숫자 + 빛 + 살짝 흔들림 · 큰 한 방(big) = 큰 숫자 + 충격파 + 멈칫
     막타(lastHit) = 동전이 내게 날아온다 · 처치(kill) = 화면이 번쩍, 느려지고, 크게 흔들린다 */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map, X = TW.X, FX = TW.FX, Art = TW.Art, W = TW.World, TAU = Math.PI * 2;
  const DANGER = '#ff5a6e';
  const CC_COL = { stun: '#ffe680', freeze: '#bfeaff', air: '#ffffff', root: '#9fe07a', taunt: '#7dffd9' };
  const merge = new Map(), later = [], trails = [];
  let ambT = 0;

  const isEnemy = (u) => W.team >= 0 && u.team !== W.team;
  const tcol = (u) => (u && u.team < 2 ? C.TEAM_LIGHT[u.team] : '#ffe9c0');
  function see(x, y, pad) { return W.onScreen(x, y, pad === undefined ? 6 : pad) && W.visibleAt(x, y); }
  /* 멈칫: 방금(0.15초 안) 내 명령이 들어갔으면 걸지 않는다 — 손맛 연출이 조작을 늦추면 안 된다 */
  const nowMs = () => (globalThis.performance && performance.now ? performance.now() : 0);
  function stop(sec) { if (nowMs() - (W.cmdAt || -1e9) > 150) W.hitstop = Math.max(W.hitstop, sec); }
  W.later = function (sec, fn) { later.push({ t: sec, fn }); };

  /* 같은 대상에게 연달아 들어간 피해는 숫자 하나로 합친다 */
  function number(src, tg, amt, style, color, top) {
    const key = (src ? src.id : 0) + '_' + tg.id + '_' + style;
    const m = merge.get(key);
    if (m && m.p.t < 0.32 && m.p.t < m.p.life) { m.sum += amt; m.p.str = String(Math.round(m.sum)); m.p.t = Math.min(m.p.t, 0.06); m.p.x = tg.x + m.p.ox * 0.4; m.p.y = tg.y - top; return; }
    const p = FX.num(tg.x + (FX.rnd() - 0.5) * 0.8, tg.y - top, String(Math.round(amt)), style, color);
    if (p) { if (merge.size > 160) merge.clear(); merge.set(key, { p, sum: amt }); }
  }
  function blob(color) { return (c, x, y) => { c.fillStyle = color; X.ell(c, x, y - 1.1, 0.72, 1.0); c.fill(); X.ell(c, x, y - 2.25, 0.5, 0.5); c.fill(); }; }

  function hitFx(e) {
    const src = e.src, tg = e.tgt, me = W.me, mine = src === me, onMe = tg === me;
    if (!mine && !onMe && !see(tg.x, tg.y, 3)) return;
    const s = W.vs(tg), top = tg.isStruct ? 3.4 : tg.isHero ? 3.0 : tg.isMonster ? tg.r * 1.5 + 1 : 1.9;
    const x = tg.x, y = tg.y - (tg.isStruct ? 1.8 : tg.isMinion ? 0.5 : 0.9);
    const ang = src && src.x !== undefined ? Math.atan2(tg.y - src.y, tg.x - src.x) : -Math.PI / 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const col = src && src.isHero ? src.hd.glow : tcol(src), tier = e.tier;
    if (tier === 'basic') {
      s.flash = Math.max(s.flash, tg.isHero ? 0.55 : 0.75); s.punch = Math.max(s.punch, 0.5); s.kx += ca * 0.13; s.ky += sa * 0.09;
      // 내 것·내가 맞는 것은 또렷하게, 남들끼리의 타격은 작게 (큰 싸움에서 빛이 뭉치지 않게)
      const mineOr = mine || onMe;
      FX.sparks(x, y, ang, 1.3, tg.isStruct ? 5 : mine ? 6 : 3, col, 9, 0.22, 0.1);
      if (mineOr) FX.glow(x, y, 0.25, mine ? 1.0 : 0.8, 0.12, '#ffffff', 0.5);
      if (tg.isStruct) FX.shards(x, tg.y - 0.6, 2, '#9a9db2', 5);
      if (mine) { W.shake(tg.isHero ? 0.1 : tg.isStruct ? 0.07 : 0.045); if (tg.isHero && !src.ranged) stop(0.02); }
    } else if (tier === 'skill' || tier === 'proc') {
      const mineOr = mine || onMe;
      s.flash = Math.max(s.flash, 0.9); s.punch = Math.max(s.punch, 0.8); s.kx += ca * 0.22; s.ky += sa * 0.15;
      FX.sparks(x, y, ang, 1.9, mineOr ? 9 : 5, col, 12, 0.3, 0.12);
      FX.glow(x, y, 0.4, mineOr ? 1.5 : 1.1, 0.18, col, mineOr ? 0.6 : 0.35); FX.light(x, y, 5.5, 0.25, col, 0.6);
      FX.ring(x, y, 0.3, 1.5, 0.2, mineOr ? '#ffffff' : col, 0.12);
      if (mine && tg.isHero) { stop(0.035); W.shake(0.17); } else if (mine) W.shake(0.08);
    } else if (tier === 'big') {
      const mineOr = mine || onMe;
      s.flash = 1; s.punch = 1; s.kx += ca * 0.35; s.ky += sa * 0.24;
      FX.sparks(x, y, ang, 2.6, mineOr ? 16 : 9, col, 15, 0.38, 0.14); if (mineOr) FX.burst(x, y, 8, '#ffffff', 9, 0.3, 0.1);
      FX.glow(x, y, 0.6, mineOr ? 2.1 : 1.5, 0.24, col, mineOr ? 0.6 : 0.36); FX.light(x, y, 8, 0.32, col, 0.85);
      FX.ring(x, y, 0.4, 2.6, 0.28, mineOr ? '#ffffff' : col, 0.2); FX.disc(tg.x, tg.y, 2.0, 0.3, col, 0.35);
      if (mineOr) { stop(mine ? 0.06 : 0.045); W.shake(0.34); } else W.shake(0.12, tg.x, tg.y);
    } else if (tier === 'dot') {
      if ((W.frame & 1) === 0) FX.spark(x + (FX.rnd() - 0.5), y, (FX.rnd() - 0.5) * 2, -3, 0.4, '#ffb347', 0.1, 1);
    }
    if (e.absorbed > 0 && tier !== 'dot') { FX.ring(x, y, 0.5, 1.7, 0.22, '#eaf6ff', 0.14); FX.sparks(x, y, ang + Math.PI, 2.4, 5, '#eaf6ff', 8, 0.25, 0.09); }
    if (onMe && tier !== 'dot') { W.hurt = Math.min(1, W.hurt + e.amt / tg.maxHp * 2.4 + 0.1); W.shake(Math.min(0.3, 0.06 + e.amt / tg.maxHp * 1.2)); }
    if (mine) number(src, tg, e.amt, tier === 'basic' ? 'basic' : tier === 'big' ? 'big' : tier === 'dot' ? 'dot' : 'skill', col, top);
    else if (onMe) number(src, tg, e.amt, tier === 'dot' ? 'dot' : 'hurt', null, top);
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
          const n = tg.kind === 'siege' || tg.kind === 'super' ? 6 : 3;
          for (let i = 0; i < n; i++) FX.coin(tg.x, tg.y - 0.6, me, i * 0.035);
          FX.num(tg.x, tg.y - 2.0, '+' + e.amt, 'gold');
          FX.burst(tg.x, tg.y - 0.6, 10, '#ffd84a', 9, 0.4, 0.11); FX.glow(tg.x, tg.y - 0.6, 0.4, 1.7, 0.2, '#ffe680', 0.9); FX.ring(tg.x, tg.y, 0.3, 1.5, 0.25, '#ffd84a', 0.12, 'ground');
        } else if (see(tg.x, tg.y, 2)) FX.burst(tg.x, tg.y - 0.6, 3, '#ffd84a', 5, 0.3, 0.09);
        break;
      }
      case 'gold': if (e.u === me && e.reason !== 'cs' && e.amt >= 20) FX.num(me.x, me.y - 3.7, '+' + e.amt, 'gold'); break;
      case 'death': {
        const u = e.u;
        if (u.isHero) { u.deathX = u.x; u.deathY = u.y; break; }
        if (!see(u.x, u.y, 3)) break;
        if (u.isMinion) { FX.burst(u.x, u.y - 0.5, 7, tcol(u), 7, 0.35, 0.1); FX.smoke(u.x, u.y - 0.3, 0.9, 0.35, '#2a2c44', 0.4); FX.glow(u.x, u.y - 0.5, 0.3, 1.0, 0.18, tcol(u), 0.7); }
        else if (u.isMonster) { FX.burst(u.x, u.y - 0.8, 12 + u.r * 6, u.kind === 'boss' ? '#7dffd9' : '#ffe0c0', 9, 0.5, 0.12); FX.smoke(u.x, u.y - 0.5, u.r * 1.4, 0.5, '#2a2c44', 0.5); FX.shards(u.x, u.y, 4 + (u.r * 3 | 0), '#8a7a66', 7); FX.disc(u.x, u.y, u.r * 1.8, 0.35, '#ffe0c0', 0.3); }
        break;
      }
      case 'kill': {
        const v = e.victim, col = tcol(v), mineK = e.killer === me, onMe = v === me, assist = me && e.assists.indexOf(me) >= 0;
        if (see(v.x, v.y, 6) || mineK || onMe) {
          FX.disc(v.x, v.y, 3.4, 0.5, col, 0.5); FX.burst(v.x, v.y - 1, 12, '#ffffff', 14, 0.6, 0.13); FX.burst(v.x, v.y - 1, 18, col, 9, 0.8, 0.12);
          FX.ring(v.x, v.y - 1, 0.5, 4.2, 0.4, '#ffffff', 0.3); FX.light(v.x, v.y, 14, 0.55, '#ffffff', 1); FX.crack(v.x, v.y, 2.6, col, 3);
          for (let i = 0; i < 9; i++) FX.spark(v.x + (FX.rnd() - 0.5) * 1.2, v.y - 1 - FX.rnd(), (FX.rnd() - 0.5) * 1.5, -5 - FX.rnd() * 4, 1.0 + FX.rnd() * 0.5, col, 0.16, 0.4);
          FX.ghost(blob(U.rgba(col, 0.9)), v.x, v.y, 0.7, 0.6);
          W.shake(0.35, v.x, v.y);
        }
        // 처치의 무게: 흔들림 + 가장자리 번쩍임 + 짧은 느려짐. (내 명령이 들어오면 느려짐은 바로 풀린다 → main.js acted)
        if (mineK || onMe || assist) { W.shake(mineK || onMe ? 0.6 : 0.4); W.cam.punch = Math.max(W.cam.punch, mineK ? 0.07 : 0.04); W.flash = mineK ? 0.5 : onMe ? 0.45 : 0.22; W.flashCol = onMe ? '#ff3a52' : '#ffffff'; if (mineK || onMe) { W.slowT = Math.max(W.slowT, onMe ? 0.45 : 0.28); stop(0.07); } }
        break;
      }
      case 'levelup': {
        const u = e.u; if (!see(u.x, u.y, 3) && u !== me) break;
        FX.pillar(u.x, u.y, 1.1, 0.7, '#fff2c0', u); FX.ring(u.x, u.y, 0.4, 2.6, 0.45, '#fff2c0', 0.2, 'ground'); FX.burst(u.x, u.y - 1, 10, '#fff2c0', 7, 0.5, 0.1);
        if (u === me) FX.num(u.x, u.y - 4.0, '레벨 ' + u.level, 'label', '#fff2c0');
        break;
      }
      case 'buy': { const u = e.u; if (u !== me && !see(u.x, u.y, 2)) break; const it = TW.Items[e.item]; FX.ring(u.x, u.y, 0.5, 2.3, 0.4, it.color, 0.16, 'ground'); FX.burst(u.x, u.y - 1, 8, it.color, 6, 0.45, 0.1); if (u === me) FX.num(u.x, u.y - 4.0, it.name + ' ' + e.tier + '단계', 'label', it.color); break; }
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
      case 'bossDown': { const x = e.x, y = e.y; FX.burst(x, y - 2, 44, '#7dffd9', 17, 1.0, 0.16); FX.pillar(x, y, 3.2, 1.0, '#b8ffe9'); FX.disc(x, y, 9, 0.8, '#7dffd9', 0.5); FX.light(x, y, 24, 0.8, '#7dffd9', 1); FX.ring(x, y, 1, 10, 0.7, '#ffffff', 0.4, 'ground'); W.shake(0.9, x, y); break; }
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
  W.resetFx = function () { later.length = 0; trails.length = 0; merge.clear(); };
})();
