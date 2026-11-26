/* 어스름 전선 — uimenu: 영웅 선택(달빛 무대) · 상점 · 점수판 · 조작법 · 멈춤 메뉴 · 결과 화면 */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, X = TW.X, Art = TW.Art, W = TW.World, UI = TW.UI, COL = UI.COL, TAU = Math.PI * 2;
  const Mn = TW.UIMenu = {};
  const KEYS = ['Q', 'W', 'E', 'R'];
  const POS_SHORT = { top: '윗길', jg: '정글', mid: '가운뎃길', carry: '아랫길', sup: '지원' };
  const dim = (ctx, a) => { ctx.fillStyle = 'rgba(4,5,16,' + (Math.round(a * 1000) / 1000) + ')'; ctx.fillRect(0, 0, UI.W, UI.H); };

  /* ---------- 배경: 등불 축제의 밤 — 큰 달, 늘어진 등불 줄, 나무 무대 ---------- */
  function backdrop(ctx, L) {
    const w = UI.W, h = UI.H, t = UI.t;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#081024'); g.addColorStop(0.5, '#10263a'); g.addColorStop(0.72, '#1b4648'); g.addColorStop(1, '#0b1820');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // 달 (고른 영웅의 뒤)
    const mx = L.show.x, my = L.oy + 318, mr = 196;
    ctx.globalCompositeOperation = 'lighter'; X.glow(ctx, mx, my, mr * 3.2, '#8fc8ff', 0.2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    X.circle(ctx, mx, my, mr); ctx.fillStyle = '#e6eeff'; ctx.fill();
    ctx.fillStyle = 'rgba(160,178,220,0.5)'; for (const c of [[-0.42, -0.3, 0.2], [0.3, -0.5, 0.12], [0.46, 0.22, 0.17], [-0.2, 0.42, 0.1], [0.05, 0.02, 0.07]]) { X.circle(ctx, mx + c[0] * mr, my + c[1] * mr, c[2] * mr); ctx.fill(); }
    // 먼 산
    for (let k = 0; k < 2; k++) {
      ctx.fillStyle = k ? '#0d2530' : '#153744';
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w + 40; x += 40) ctx.lineTo(x, L.oy + (k ? 560 : 500) - U.noise2(x * 0.004 + k * 9, k, 3) * (k ? 90 : 150));
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    }
    // 양옆의 버들잎나무
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1, hx = U.hash2(i, 3, 8), x = side < 0 ? hx * 150 - 30 : w - hx * 150 + 30, base = L.oy + 640 + U.hash2(i, 4, 8) * 60, th = 300 + U.hash2(i, 5, 8) * 260, tw = 46 + U.hash2(i, 6, 8) * 40;
      ctx.fillStyle = i % 3 ? '#0a1c26' : '#0e2a32';
      ctx.beginPath(); ctx.moveTo(x, base); ctx.bezierCurveTo(x + tw * 1.3, base - th * 0.12, x + tw * 0.75, base - th * 0.74, x, base - th); ctx.bezierCurveTo(x - tw * 0.75, base - th * 0.74, x - tw * 1.3, base - th * 0.12, x, base); ctx.fill();
    }
    // 무대 마루
    const fy = L.oy + 596;
    const fg = ctx.createLinearGradient(0, fy, 0, h); fg.addColorStop(0, '#5a4334'); fg.addColorStop(0.2, '#44332a'); fg.addColorStop(1, '#1c1418');
    ctx.fillStyle = fg; ctx.fillRect(0, fy, w, h - fy);
    ctx.fillStyle = '#8a6a52'; ctx.fillRect(0, fy, w, 5);
    ctx.strokeStyle = 'rgba(16,10,18,0.42)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = -400; x <= w + 400; x += 92) { ctx.moveTo(w / 2 + (x - w / 2) * 0.84, fy + 5); ctx.lineTo(w / 2 + (x - w / 2) * 1.5, h); }
    ctx.stroke();
    // 등불 줄 두 가닥
    ctx.globalAlpha = 1;
    for (let k = 0; k < 2; k++) {
      const y0 = 4 + k * 22, sag = 20 + k * 14, n = 13 - k * 2;
      ctx.strokeStyle = 'rgba(20,24,44,0.9)'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x <= w; x += 20) { const u = x / w, y = y0 + Math.sin(u * Math.PI) * sag; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5 + k * 0.3) / n, x = u * w + Math.sin(t * 0.9 + i * 1.7 + k) * 3, y = y0 + Math.sin(u * Math.PI) * sag + 6, col = (i + k) % 3 === 0 ? '#ffb86a' : (i + k) % 3 === 1 ? '#ffd9a0' : '#ff9a7a';
        X.rr(ctx, x - 9, y, 18, 24, 7); ctx.fillStyle = col; ctx.fill(); ctx.fillStyle = 'rgba(40,20,20,0.7)'; ctx.fillRect(x - 6, y - 2, 12, 3); ctx.fillRect(x - 6, y + 23, 12, 3);
        ctx.globalCompositeOperation = 'lighter'; X.glow(ctx, x, y + 12, 46, col, 0.34 + 0.08 * Math.sin(t * 2.2 + i)); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    }
    // 떠오르는 등불
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 34; i++) {
      const hx = U.hash2(i, 1, 5), sp = 0.012 + U.hash2(i, 2, 5) * 0.03, ph = (U.hash2(i, 3, 5) + t * sp) % 1;
      const x = w * (hx + Math.sin(t * 0.3 + i) * 0.012), y = h * (0.78 - ph * 0.8), r = 2.5 + U.hash2(i, 4, 5) * 5;
      const a = Math.sin(ph * Math.PI) * (0.3 + 0.4 * U.hash2(i, 6, 5));
      X.glow(ctx, x, y, r * 4.5, '#ffc878', a * 0.5); X.glow(ctx, x, y, r * 1.2, '#ffffff', a * 0.7);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  /* 영웅 한 명을 세운다 (살아 움직이는 시연 또는 가만히 선 모습) */
  function figure(ctx, heroId, x, y, s, t, live, alpha) {
    const hd = TW.Heroes[heroId], glows = [];
    let pose;
    if (live) {
      const cyc = t % 5, atk = cyc > 1.2 && cyc < 1.9 ? (cyc - 1.2) / 0.7 : cyc > 2.1 && cyc < 2.8 ? (cyc - 2.1) / 0.7 : -1, cast = cyc > 3.4 && cyc < 4.1 ? (cyc - 3.4) / 0.7 : -1;
      pose = { f: Math.PI / 2 + Math.sin(t * 0.55) * 0.75, t, walk: t * 5, mv: cyc < 0.9 ? 1 : 0, atk, atkW: 0.3, atkN: Math.floor(t / 5) * 2 + (cyc > 2 ? 1 : 0), cast, slot: 0, charge: heroId === 'chorong' && cast >= 0 ? cast : -1, team: -1, teamCol: hd.glow, st: { ambush: cyc > 2, heat: Math.min(6, Math.floor(cyc * 1.5)) }, seed: 3 };
    } else pose = { f: Math.PI / 2 + Math.sin(t * 0.7 + x * 0.01) * 0.25, t: t + x * 0.01, walk: 0, mv: 0, atk: -1, cast: -1, charge: -1, team: -1, teamCol: hd.glow, st: {}, atkN: 0, seed: 1 };
    ctx.globalAlpha = 0.5 * alpha; X.ell(ctx, x, y + s * 0.04, s * 0.8, s * 0.24); ctx.fillStyle = '#04060e'; ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    Art.hero(ctx, heroId, pose, (lx, ly, r, c, a) => glows.push(lx, ly, r, c, a));
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < glows.length; i += 5) X.glow(ctx, x + glows[i] * s, y + glows[i + 1] * s, glows[i + 2] * s, glows[i + 3], glows[i + 4] * alpha);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  /* 화면 배치 (시험 도구도 쓴다). 1600×900 을 가운데 두고 넓은 화면에서는 여백이 생긴다 */
  Mn.layout = function () {
    const order = TW.MenuOrder || TW.HeroOrder;
    const ox = (UI.W - 1600) / 2, oy = Math.max(0, (UI.H - 900) / 2), n = order.length;
    const L = { ox, oy, heroes: [], show: { x: ox + 410, y: oy + 560 }, info: { x: ox + 700, y: oy + 96, w: 500 }, skills: [], diff: [], foot: [] };
    // 발 위치: 무대 앞줄에 한 줄로 (여덟이면 161 간격 그대로, 더 많으면 같은 너비 안에서 촘촘히). L.heroStep = 한 사람의 자리 너비
    L.heroStep = n <= 8 ? 161 : (1392 - 206) / (n - 1);
    for (let i = 0; i < n; i++) L.heroes.push({ id: order[i], x: ox + (n <= 8 ? 236 : 206) + i * L.heroStep, y: oy + 778 });
    for (let i = 0; i < 5; i++) L.skills.push({ x: L.info.x + 34 + i * 88, y: oy + 400, r: 31 });
    const mx = ox + 1248, my = oy + 120;
    L.map = { x: mx, y: my, w: 300, h: 190 };
    L.pos = { top: { x: mx + 92, y: my + 10 }, mid: { x: mx + 86, y: my + 95 }, jg: { x: mx + 112, y: my + 60 }, carry: { x: mx + 124, y: my + 181 }, sup: { x: mx + 40, y: my + 150 } };       // 길을 가리지 않게: 윗길은 활 위, 아랫길은 활 아래
    for (let i = 0; i < 3; i++) L.diff.push({ x: mx + i * 100, y: oy + 372, w: 100, h: 46 });
    L.start = { x: mx + 150, y: oy + 510, r: 72 };
    // 놀이 방식 세 칸 (지도 위) · 한 줄 난전·별비 난전의 인원 두 칸 (지도 판 안)
    L.modes = [{ mode: 'classic', x: mx - 14, y: oy + 22, w: 108, h: 56 }, { mode: 'brawl', x: mx + 98, y: oy + 22, w: 108, h: 56 }, { mode: 'star', x: mx + 210, y: oy + 22, w: 108, h: 56 }];
    L.sizes = [{ size: 3, x: mx + 34, y: my + 108, w: 108, h: 34 }, { size: 5, x: mx + 158, y: my + 108, w: 108, h: 34 }];
    L.friends = { x: mx + 150 - 104, y: oy + 590, w: 208, h: 34 };       // 친구 방 (출전 도장 아래 · 영웅 줄 위)
    for (let i = 0; i < 3; i++) L.foot.push({ x: ox + 40 + i * 180, y: oy + 852, w: 170, h: 32 });
    L.cast = { x: ox + 40 + 3 * 180, y: oy + 852, w: 300, h: 32 };       // 스킬 발사 방식 (누르면 바로 / 조준 후 떼기)
    return L;
  };
  const POS_W = { top: 48, mid: 70, jg: 48, carry: 56, sup: 44 };
  Mn.drawMenu = function (ctx) {
    const sel = UI.sel, L = Mn.layout(), ox = L.ox, oy = L.oy, t = UI.t;
    if (!TW.Heroes[sel.hero]) sel.hero = TW.HeroOrder[0];
    const hd = TW.Heroes[sel.hero];
    if (!sel.pos) sel.pos = TW.bestPos(sel.hero);
    if (sel.skill === undefined) sel.skill = 0;
    // 조작법 창이 떠 있으면 그 아래 메뉴는 눌리지 않는다
    const held = UI.clicks, hmx = UI.mx;
    if (UI.helpOpen) { UI.clicks = []; UI.mx = -9999; }
    backdrop(ctx, L);
    const pick = (id) => { sel.hero = id; sel.pos = TW.bestPos(id); sel.skill = 0; UI.showT = UI.t; if (UI.on.select) UI.on.select(); };
    // 세로 현판: 놀이 이름
    const bx = ox + 40, bw = 92, bh = 372;
    ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + bw, 0); ctx.lineTo(bx + bw, oy + bh); ctx.lineTo(bx + bw / 2, oy + bh - 34); ctx.lineTo(bx, oy + bh); ctx.closePath();
    ctx.fillStyle = 'rgba(8,10,26,0.9)'; ctx.fill(); ctx.strokeStyle = '#ffd98a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,217,138,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 8, -4, bw - 16, oy + bh - 40);
    const title = ['어', '스', '름', '전', '선'];
    for (let i = 0; i < 5; i++) X.text(ctx, title[i], bx + bw / 2, oy + 64 + i * 56 + (i > 2 ? 12 : 0), 46, i > 2 ? '#d9c2ff' : '#ffd98a', 'center', 900);
    X.circle(ctx, bx + bw / 2, oy + 64 + 3 * 56 - 22, 3.5); ctx.fillStyle = '#ffffff'; ctx.fill();
    // 무대 한가운데: 고른 영웅
    const sh = L.show;
    ctx.globalCompositeOperation = 'lighter'; X.glow(ctx, sh.x, sh.y - 20, 250, hd.glow, 0.16); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // 단상: 낮은 나무 평상
    ctx.fillStyle = '#3a2a26'; ctx.beginPath(); ctx.moveTo(sh.x - 214, sh.y + 34); ctx.lineTo(sh.x + 214, sh.y + 34); ctx.lineTo(sh.x + 184, sh.y - 14); ctx.lineTo(sh.x - 184, sh.y - 14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(16,10,18,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = -3; k <= 3; k++) { ctx.moveTo(sh.x + k * 52, sh.y - 14); ctx.lineTo(sh.x + k * 60, sh.y + 34); } ctx.stroke();
    ctx.fillStyle = '#7a5e4a'; ctx.fillRect(sh.x - 214, sh.y + 34, 428, 9); ctx.fillStyle = '#463529'; ctx.fillRect(sh.x - 214, sh.y + 43, 428, 9);
    figure(ctx, sel.hero, sh.x, sh.y, 112, t - (UI.showT || 0) + 0.2, true, 1);
    // 오른쪽: 이름과 설명
    const ix = L.info.x, iy = L.info.y, iw = L.info.w, best = TW.bestPos(sel.hero);
    X.text(ctx, hd.title + '  ·  ' + hd.roleName, ix + 2, iy + 6, 18, hd.glow, 'left', 800);
    X.text(ctx, hd.name, ix, iy + 56, 68, '#ffffff', 'left', 900, 'rgba(6,8,22,0.8)', 6);
    X.text(ctx, '다루기 ' + (hd.diff <= 1 ? '쉬움' : hd.diff === 2 ? '보통' : '어려움') + '   ·   어울리는 자리 ' + TW.POS_NAME[best], ix + 2, iy + 116, 14, '#cfd6ee', 'left', 600);
    X.text(ctx, '“ ' + hd.feel + ' ”', ix + 2, iy + 160, 19, hd.glow, 'left', 800);
    const bl = X.wrap(ctx, hd.blurb, iw, 15, 500).slice(0, 3);
    for (let i = 0; i < bl.length; i++) X.text(ctx, bl[i], ix + 2, iy + 196 + i * 24, 15, '#d8dcf4', 'left', 500);
    // 기술 다섯: 그림을 가리키면 아래 한 칸에 설명이 나온다
    const fake = { level: 1, ad: hd.base.ad, ap: 0, maxHp: hd.base.hp };
    const rows = [{ key: '패시브', name: hd.passive.name, icon: hd.passive.icon, desc: hd.passive.desc(fake), cd: '늘 켜져 있음' }].concat(hd.abilities.map((ab, i) => ({ key: KEYS[i], name: ab.name, icon: ab.icon, desc: ab.desc(fake), cd: '재사용 ' + ab.cd + '초' + (ab.ult ? ' · ' + C.ULT_LEVEL + '레벨부터' : '') })));
    for (let i = 0; i < 5; i++) {
      const p = L.skills[i], on = sel.skill === i, hot = Math.hypot(UI.mx - p.x, UI.my - p.y) < p.r + 6;
      if (hot) { sel.skill = i; UI.cursor = 'pointer'; }
      Art.iconButton(ctx, rows[i].icon, p.x, p.y - (on ? 5 : 0), p.r, on ? hd.glow : U.mix(hd.glow, '#4a4f72', 0.3), 1);
      UI.ring(ctx, p.x, p.y - (on ? 5 : 0), p.r + 3, on ? 3.5 : 1.5, 1, on ? '#ffffff' : 'rgba(255,255,255,0.25)');
      X.text(ctx, i ? rows[i].key : '◆', p.x, p.y + p.r + 16, i ? 15 : 11, on ? '#ffffff' : COL.dim, 'center', 900);
    }
    const r = rows[sel.skill], dy = oy + 460, dh = 128;
    X.rr(ctx, ix - 4, dy, iw + 8, dh, 14); ctx.fillStyle = 'rgba(8,10,26,0.72)'; ctx.fill(); ctx.strokeStyle = U.rgba(hd.glow, 0.4); ctx.lineWidth = 1; ctx.stroke();
    const ax = L.skills[sel.skill].x; ctx.beginPath(); ctx.moveTo(ax - 10, dy + 1); ctx.lineTo(ax, dy - 10); ctx.lineTo(ax + 10, dy + 1); ctx.closePath(); ctx.fillStyle = 'rgba(8,10,26,0.72)'; ctx.fill();
    X.text(ctx, r.name, ix + 14, dy + 26, 19, '#ffffff', 'left', 900);
    X.text(ctx, r.cd, ix + iw - 10, dy + 26, 12.5, COL.dim, 'right', 600);
    const dl = X.wrap(ctx, r.desc, iw - 24, 14.5, 500).slice(0, 4);
    for (let i = 0; i < dl.length; i++) X.text(ctx, dl[i], ix + 14, dy + 54 + i * 21, 14.5, '#d8dcf4', 'left', 500);
    // 놀이 방식: 어스름 전선 / 한 줄 난전
    if (!sel.mode) sel.mode = 'classic'; if (sel.size !== 3 && sel.size !== 5) sel.size = 5;
    if (sel.mode !== 'classic' && sel.mode !== 'brawl' && sel.mode !== 'star') sel.mode = 'classic';
    for (const md of L.modes) {
      const on = sel.mode === md.mode, hot = UI.over(md.x, md.y, md.w, md.h), br = md.mode === 'brawl', st = md.mode === 'star', acc = br ? '#ff9a5a' : st ? '#c9b6ff' : '#9fd8ff';
      X.rr(ctx, md.x, md.y, md.w, md.h, 16);
      if (on && br) { const g = ctx.createLinearGradient(md.x, md.y, md.x + md.w, md.y + md.h); g.addColorStop(0, '#7a2a2a'); g.addColorStop(1, '#c8642e'); ctx.fillStyle = g; }
      else if (on && st) { const g = ctx.createLinearGradient(md.x, md.y, md.x + md.w, md.y + md.h); g.addColorStop(0, '#2a2a86'); g.addColorStop(1, '#7a52c8'); ctx.fillStyle = g; }
      else ctx.fillStyle = on ? 'rgba(40,70,110,0.95)' : hot ? 'rgba(56,58,110,0.9)' : 'rgba(14,16,40,0.88)';
      ctx.fill(); ctx.strokeStyle = on ? '#ffffff' : U.rgba(acc, hot ? 0.9 : 0.45); ctx.lineWidth = on ? 2.5 : 1.2; ctx.stroke();
      X.text(ctx, C.MODE_NAME[md.mode], md.x + md.w / 2, md.y + 21, 15.5, on ? '#ffffff' : acc, 'center', 900);
      X.text(ctx, br ? '다리 하나 · 무작위' : st ? '별조각 고르기' : '5대5 · 세 갈래 길', md.x + md.w / 2, md.y + 42, 11, on ? '#ffe9d0' : COL.dim, 'center', 700);
      if (st) UI.chip(ctx, '새로', md.x + md.w - 22, md.y + 2, 10.5, '#0b0d22', '#ffd36a', 6);
      if (hot) UI.cursor = 'pointer';
      if (UI.hit(md.x, md.y, md.w, md.h, 0) && !on) { sel.mode = md.mode; if (UI.on.select) UI.on.select(); if (UI.on.prefs) UI.on.prefs(); }
    }
    const brawl = sel.mode === 'brawl', star = sel.mode === 'star';
    // 어디로 갈까: 작은 지도 위의 다섯 자리 (한 줄 난전이면 노을 협곡 그림과 인원 고르기 · 별비 난전이면 별내 여울 그림과 인원 고르기)
    const M0 = L.map, cxm = M0.x + M0.w / 2, cym = M0.y + 95;
    if (brawl) drawBrawlPanel(ctx, L, sel, t);
    else if (star) drawStarPanel(ctx, L, sel, t);
    else {
    X.text(ctx, '어디로 갈까요', M0.x, M0.y - 22, 14, COL.dim, 'left', 700);
    X.rr(ctx, M0.x - 10, M0.y - 6, M0.w + 20, M0.h + 12, 18); ctx.fillStyle = 'rgba(8,10,26,0.66)'; ctx.fill();
    ctx.strokeStyle = '#2c9a9c'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cxm, M0.y + 26); ctx.lineTo(cxm, M0.y + 164); ctx.stroke();
    ctx.strokeStyle = '#7f86a4'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(M0.x + 22, cym); ctx.quadraticCurveTo(cxm, M0.y - 58, M0.x + M0.w - 22, cym); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(M0.x + 22, cym); ctx.quadraticCurveTo(cxm, M0.y + 248, M0.x + M0.w - 22, cym); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(M0.x + 22, cym); ctx.lineTo(M0.x + M0.w - 22, cym); ctx.stroke(); ctx.lineCap = 'butt';
    X.circle(ctx, M0.x + 22, cym, 11); ctx.fillStyle = C.TEAM_COL[0]; ctx.fill(); X.circle(ctx, M0.x + M0.w - 22, cym, 11); ctx.fillStyle = C.TEAM_COL[1]; ctx.fill();
    for (const p of TW.POS) {
      const q = L.pos[p], pw = POS_W[p] + (p === best ? 14 : 0), on = sel.pos === p, hot = UI.over(q.x - pw / 2, q.y - 15, pw, 30);
      X.rr(ctx, q.x - pw / 2, q.y - 13, pw, 26, 13); ctx.fillStyle = on ? hd.glow : hot ? 'rgba(86,86,150,0.95)' : 'rgba(22,26,58,0.95)'; ctx.fill(); ctx.strokeStyle = on ? '#ffffff' : 'rgba(200,206,255,0.4)'; ctx.lineWidth = on ? 2 : 1; ctx.stroke();
      X.text(ctx, (p === best ? '★ ' : '') + POS_SHORT[p], q.x, q.y + 1, 12, on ? '#0b0d22' : COL.text, 'center', 800);
      if (hot) UI.cursor = 'pointer';
      if (UI.hit(q.x - pw / 2, q.y - 15, pw, 30, 0)) { sel.pos = p; if (UI.on.select) UI.on.select(); }
    }
    X.text(ctx, sel.pos === 'jg' ? '정글: 숲의 몬스터를 잡으며 크고, 수풀에서 기습합니다' : sel.pos === best ? '★ 이 영웅에게 어울리는 자리입니다' : '남은 자리는 봇이 알아서 채웁니다', M0.x, M0.y + M0.h + 26, 12.5, sel.pos === 'jg' ? '#cfd6ff' : COL.dim, 'left', 500);
    }
    // 상대 수준: 이어 붙인 세 칸
    const ds = ['easy', 'normal', 'hard'], d0 = L.diff[0];
    X.text(ctx, '상대 수준', d0.x, d0.y - 16, 14, COL.dim, 'left', 700);
    // 이 놀이 방식에서 받아 본 가장 높은 등급 (실버 · 골드 · 프리즘 — 결과 화면에서 매긴다)
    if (TW.Grades && TW.BOON_TIERS) {
      const bt = TW.Grades.best(sel.mode), gx = d0.x + 300;
      if (bt >= 0) { const T = TW.BOON_TIERS[bt], str = '내 최고 등급 ' + T.name; X.text(ctx, str, gx, d0.y - 16, 12.5, T.glow, 'right', 800); X.star(ctx, gx - X.textW(ctx, str, 12.5, 800) - 10, d0.y - 16, 6, 5, 0.48, -Math.PI / 2); ctx.fillStyle = T.rainbow ? '#d3b0ff' : T.col; ctx.fill(); }
      else X.text(ctx, '등급: 아직 없음 (한 판을 끝내면 받습니다)', gx, d0.y - 16, 11.5, COL.dim, 'right', 600);
    }
    // 미닫이 눈금: 줄 위의 손잡이를 옮긴다
    const ty0 = d0.y + 13;
    ctx.strokeStyle = 'rgba(200,206,255,0.35)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(d0.x + 50, ty0); ctx.lineTo(d0.x + 250, ty0); ctx.stroke(); ctx.lineCap = 'butt';
    for (let i = 0; i < 3; i++) {
      const d = L.diff[i], on = sel.diff === ds[i], hot = UI.over(d.x, d.y, d.w, d.h), kx = d.x + d.w / 2;
      X.circle(ctx, kx, ty0, on ? 11 : 5); ctx.fillStyle = on ? '#fff6dc' : hot ? '#ffffff' : '#8a90b4'; ctx.fill();
      if (on) { X.circle(ctx, kx, ty0, 16); ctx.strokeStyle = 'rgba(255,246,220,0.5)'; ctx.lineWidth = 2; ctx.stroke(); }
      X.text(ctx, TW.Difficulty[ds[i]].name, kx, d.y + 37, 14, on ? '#ffffff' : hot ? '#e8ecff' : COL.dim, 'center', on ? 900 : 700);
      if (hot) UI.cursor = 'pointer';
      if (UI.hit(d.x, d.y, d.w, d.h, 0)) { sel.diff = ds[i]; if (UI.on.select) UI.on.select(); }
    }
    // 출전: 둥근 도장
    const S0 = L.start, shot = Math.hypot(UI.mx - S0.x, UI.my - S0.y) < S0.r, pr = S0.r + (shot ? 4 : 0);
    ctx.globalCompositeOperation = 'lighter'; X.glow(ctx, S0.x, S0.y, pr * 2.2, hd.glow, 0.3 + 0.1 * Math.sin(t * 3)); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    X.circle(ctx, S0.x, S0.y, pr); ctx.fillStyle = shot ? hd.glow : '#f4efe2'; ctx.fill();        // 한지 빛 도장 (가리키면 영웅의 빛깔로)
    X.circle(ctx, S0.x, S0.y, pr - 8); ctx.strokeStyle = 'rgba(11,13,34,0.75)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.translate(S0.x, S0.y); ctx.rotate(t * 0.5); ctx.setLineDash([10, 9]); X.circle(ctx, 0, 0, pr + 9); ctx.strokeStyle = U.rgba(hd.glow, 0.8); ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    X.text(ctx, brawl ? '난전' : star ? '별비' : '출전', S0.x, S0.y - 4, 38, '#0b0d22', 'center', 900);
    X.text(ctx, brawl ? '영웅 무작위 · ' + sel.size + '대' + sel.size : star ? hd.name + ' · ' + sel.size + '대' + sel.size : hd.name + ' · ' + POS_SHORT[sel.pos], S0.x, S0.y + 30, 12.5, 'rgba(11,13,34,0.85)', 'center', 800);
    if (shot) { UI.cursor = 'pointer'; UI.captured = true; for (const c of UI.clicks) if (!c.used && c.b === 0 && Math.hypot(c.x - S0.x, c.y - S0.y) < S0.r) { c.used = true; if (UI.on.start) UI.on.start(sel.hero, sel.pos, sel.diff, sel.mode, sel.size); } }
    // 친구 방: 방을 만들거나 코드로 들어가 친구와 함께 (빈자리는 봇)
    const FR = L.friends;
    if (UI.button(ctx, '친구 방 — 같이 하기', FR.x, FR.y, FR.w, FR.h, { px: 14, r: 19 })) { if (UI.on.friends) UI.on.friends(); }
    // 무대 앞줄: 영웅 열하나 (앞의 셋은 손맛을 다듬은 영웅 · 뒤의 셋은 19차에 새로 온 영웅)
    const hw = Math.min(70, L.heroStep / 2 - 1), tight = L.heroStep < 140;
    for (let i = 0; i < L.heroes.length; i++) {
      const p = L.heroes[i], h = TW.Heroes[p.id], on = p.id === sel.hero, hot = UI.over(p.x - hw, p.y - 128, hw * 2, 180), s = (on ? 50 : hot ? 46 : 40) * (tight ? 0.9 : 1);
      if (on) {
        ctx.globalCompositeOperation = 'lighter';
        const lg = ctx.createLinearGradient(0, p.y - 190, 0, p.y); lg.addColorStop(0, 'rgba(223,232,255,0)'); lg.addColorStop(1, 'rgba(223,232,255,0.3)');
        ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(p.x - 30, p.y - 190); ctx.lineTo(p.x + 30, p.y - 190); ctx.lineTo(p.x + hw - 4, p.y); ctx.lineTo(p.x - hw + 4, p.y); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        X.ell(ctx, p.x, p.y + 2, hw - 8, 15); ctx.strokeStyle = '#eef2ff'; ctx.lineWidth = 3; ctx.stroke();
      }
      figure(ctx, p.id, p.x, p.y - (hot && !on ? 5 : 0), s, t, false, on || hot ? 1 : 0.78);
      { const lw = tight ? 84 : 92; X.rr(ctx, p.x - lw / 2, p.y + 15, lw, 50, 12); ctx.fillStyle = 'rgba(6,8,22,0.6)'; ctx.fill(); }
      X.text(ctx, h.name, p.x, p.y + 30, on ? 21 : 17, on ? '#ffffff' : COL.text, 'center', 900, 'rgba(6,8,22,0.85)', 4);
      X.text(ctx, h.roleName, p.x, p.y + 52, 12, on ? h.glow : COL.dim, 'center', 700, 'rgba(6,8,22,0.85)', 3);
      if (h.polished) UI.chip(ctx, tight ? '★ 손맛' : '★ 손맛 다듬음', p.x, p.y - (tight ? 134 : 150), 10.5, '#0b0d22', on ? '#ffffff' : '#ffd98a', 7);
      else if (h.fresh) UI.chip(ctx, '새 영웅', p.x, p.y - (tight ? 134 : 150), 10.5, '#0b0d22', on ? '#ffffff' : '#8dffb4', 7);
      if (hot) UI.cursor = 'pointer';
      if (UI.hit(p.x - hw, p.y - 128, hw * 2, 180, 0) && !on) pick(p.id);
    }
    // 맨 아래: 작은 설정 단추
    const F = L.foot;
    if (UI.button(ctx, UI.autoBuy ? '아이템 자동 구매 켬' : '아이템 자동 구매 끔', F[0].x, F[0].y, F[0].w, F[0].h, { px: 12.5, r: 16, on: UI.autoBuy })) { UI.autoBuy = !UI.autoBuy; if (UI.on.prefs) UI.on.prefs(); }
    if (UI.button(ctx, UI.muted ? '소리 끔' : '소리 켬', F[1].x, F[1].y, F[1].w, F[1].h, { px: 12.5, r: 16, on: !UI.muted })) { if (UI.on.mute) UI.on.mute(); }
    if (UI.button(ctx, '조작법 (F1)', F[2].x, F[2].y, F[2].w, F[2].h, { px: 12.5, r: 16 })) UI.helpOpen = !UI.helpOpen;
    if (UI.button(ctx, UI.castMode === 'quick' ? '스킬 발사: 누르는 순간 바로 (바꾸기)' : '스킬 발사: 누른 채 조준 → 떼면 발사 (바꾸기)', L.cast.x, L.cast.y, L.cast.w, L.cast.h, { px: 12.5, r: 16, on: UI.castMode === 'quick' })) { if (UI.on.castMode) UI.on.castMode(); }
    if (UI.clicks !== held) { UI.clicks = held; UI.mx = hmx; UI.cursor = 'default'; }
    if (UI.helpOpen) drawHelp(ctx);
  };

  /* 한 줄 난전 판: 노을 협곡 그림(붉은 언덕 둘 · 나무다리 하나 · 초록 회복 꾸러미 셋) + 인원 고르기 + 규칙 세 줄 */
  function drawBrawlPanel(ctx, L, sel, t) {
    const M0 = L.map, cym = M0.y + 52;
    X.text(ctx, '한 줄 난전 — 노을 협곡', M0.x, M0.y - 22, 14, '#ffb88a', 'left', 800);
    X.rr(ctx, M0.x - 10, M0.y - 6, M0.w + 20, M0.h + 12, 18);
    const g = ctx.createLinearGradient(0, M0.y, 0, M0.y + M0.h); g.addColorStop(0, '#3a1430'); g.addColorStop(1, '#5a2026'); ctx.fillStyle = g; ctx.fill();
    // 협곡 바닥의 불씨 강
    ctx.strokeStyle = 'rgba(255,128,58,0.75)'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath();
    for (let k = 0; k <= 20; k++) { const yy = M0.y + 4 + k * (M0.h - 8) / 20, xx = M0.x + M0.w / 2 + Math.sin(k * 0.55 + t * 0.6) * 10; if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke();
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineCap = 'butt';
    // 언덕 둘
    for (const sx of [M0.x + 44, M0.x + M0.w - 44]) { X.ell(ctx, sx, cym, 50, 32); ctx.fillStyle = '#5a2a2c'; ctx.fill(); X.ell(ctx, sx, cym - 3, 44, 26); ctx.fillStyle = '#9a5844'; ctx.fill(); }
    // 다리 하나
    ctx.fillStyle = '#3c2220'; ctx.fillRect(M0.x + 84, cym - 9, M0.w - 168, 18); ctx.fillStyle = '#b4825a'; ctx.fillRect(M0.x + 84, cym - 7, M0.w - 168, 14);
    ctx.strokeStyle = 'rgba(60,30,20,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); for (let x = M0.x + 88; x < M0.x + M0.w - 84; x += 6) { ctx.moveTo(x, cym - 7); ctx.lineTo(x, cym + 7); } ctx.stroke();
    ctx.fillStyle = '#c8a088'; X.rr(ctx, M0.x + M0.w / 2 - 14, cym - 15, 28, 30, 8); ctx.fill();
    // 두 본진 · 회복 꾸러미
    X.circle(ctx, M0.x + 26, cym, 11); ctx.fillStyle = C.TEAM_COL[0]; ctx.fill(); X.circle(ctx, M0.x + M0.w - 26, cym, 11); ctx.fillStyle = C.TEAM_COL[1]; ctx.fill();
    const pulse = 0.6 + 0.4 * Math.sin(t * 3);
    for (const px of [M0.x + M0.w * 0.36, M0.x + M0.w / 2, M0.x + M0.w * 0.64]) { ctx.globalCompositeOperation = 'lighter'; X.glow(ctx, px, cym, 16, '#7dffb0', 0.45 * pulse); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; X.circle(ctx, px, cym, 5); ctx.fillStyle = '#3fbf74'; ctx.fill(); ctx.strokeStyle = '#e8ffd8'; ctx.lineWidth = 1.4; ctx.stroke(); }
    // 인원: 3대3 / 5대5
    for (const z of L.sizes) {
      const on = sel.size === z.size, hot = UI.over(z.x, z.y, z.w, z.h);
      X.rr(ctx, z.x, z.y, z.w, z.h, 18); ctx.fillStyle = on ? '#ffd98a' : hot ? 'rgba(86,86,150,0.95)' : 'rgba(22,26,58,0.95)'; ctx.fill(); ctx.strokeStyle = on ? '#ffffff' : 'rgba(255,200,160,0.5)'; ctx.lineWidth = on ? 2 : 1; ctx.stroke();
      X.text(ctx, z.size + ' 대 ' + z.size, z.x + z.w / 2, z.y + z.h / 2 + 1, 16, on ? '#0b0d22' : '#ffe2c8', 'center', 900);
      if (hot) UI.cursor = 'pointer';
      if (UI.hit(z.x, z.y, z.w, z.h, 0) && !on) { sel.size = z.size; if (UI.on.select) UI.on.select(); if (UI.on.prefs) UI.on.prefs(); }
    }
    X.rr(ctx, M0.x - 4, M0.y + 148, M0.w + 8, 42, 10); ctx.fillStyle = 'rgba(22,6,18,0.78)'; ctx.fill();
    X.text(ctx, '본진 회복·귀환 없음 — 다리 위 초록 꾸러미로 회복', M0.x + M0.w / 2, M0.y + 160, 12, '#e8d8d0', 'center', 600);
    X.text(ctx, '10분 안에 승부 · 마지막 2분은 탑이 잘 부서집니다', M0.x + M0.w / 2, M0.y + 179, 12, '#e8d8d0', 'center', 600);
    X.text(ctx, '★ 영웅은 출전할 때 무작위로 정해집니다 (두 편 모두)', M0.x, M0.y + M0.h + 26, 12.5, '#ffd9b0', 'left', 600);
  }

  /* 별비 난전 판: 별내 여울 그림(초승달처럼 휜 길 · 한가운데를 건너는 내 · 남쪽의 별못 · 떨어지는 별) + 인원 고르기 + 규칙 두 줄 + 등급 셋 */
  function drawStarPanel(ctx, L, sel, t) {
    const M0 = L.map, cx = M0.x + M0.w / 2, by = M0.y + 64, TT = TW.BOON_TIERS || [];
    X.text(ctx, '별비 난전 — 별내 여울', M0.x, M0.y - 22, 14, '#c9b6ff', 'left', 800);
    X.rr(ctx, M0.x - 10, M0.y - 6, M0.w + 20, M0.h + 12, 18);
    const g = ctx.createLinearGradient(0, M0.y, 0, M0.y + M0.h); g.addColorStop(0, '#15123e'); g.addColorStop(1, '#2a2470'); ctx.fillStyle = g; ctx.fill();
    ctx.save(); X.rr(ctx, M0.x - 10, M0.y - 6, M0.w + 20, M0.h + 12, 18); ctx.clip();
    // 밤하늘의 잔별과 떨어지는 별 셋 (별비)
    for (let i = 0; i < 22; i++) { const sx = M0.x + U.hash2(i, 3, 71) * M0.w, sy = M0.y + U.hash2(i, 5, 71) * 100, tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.6 + i * 1.9)); ctx.globalAlpha = 0.25 + 0.5 * tw; X.circle(ctx, sx, sy, 0.8 + U.hash2(i, 9, 71) * 1.1); ctx.fillStyle = '#eef0ff'; ctx.fill(); }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.42 + i * 0.37) % 1, sx = M0.x + 50 + i * 96 + ph * 26, sy = M0.y - 4 + ph * 62, T = TT[i] || { col: '#ffffff' };
      ctx.globalAlpha = Math.sin(ph * Math.PI); ctx.strokeStyle = T.col; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - 13, sy - 30); ctx.lineTo(sx, sy); ctx.stroke(); ctx.lineCap = 'butt';
      X.star(ctx, sx, sy, 5.5, 5, 0.45, t * 2 + i); ctx.fillStyle = T.col; ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 내(별내)와 별못
    ctx.strokeStyle = '#4f93ea'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, by - 46); ctx.lineTo(cx, by + 22); ctx.stroke(); ctx.lineCap = 'butt';
    X.ell(ctx, cx, by + 26, 20, 13); ctx.fillStyle = '#4f93ea'; ctx.fill(); X.ell(ctx, cx, by + 26, 12, 7); ctx.fillStyle = '#2a52b2'; ctx.fill();
    // 초승달처럼 휜 길 하나 (여울에서는 물 아래로)
    ctx.strokeStyle = '#3a3878'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(M0.x + 26, by + 14); ctx.quadraticCurveTo(cx, by - 62, M0.x + M0.w - 26, by + 14); ctx.stroke();
    ctx.strokeStyle = '#959ed2'; ctx.lineWidth = 8; ctx.stroke(); ctx.lineCap = 'butt';
    ctx.globalAlpha = 0.7; X.ell(ctx, cx, by - 24, 15, 10); ctx.fillStyle = '#58a4f6'; ctx.fill(); ctx.globalAlpha = 1;
    // 두 본진 · 회복 꾸러미 셋
    X.circle(ctx, M0.x + 26, by + 14, 11); ctx.fillStyle = C.TEAM_COL[0]; ctx.fill(); X.circle(ctx, M0.x + M0.w - 26, by + 14, 11); ctx.fillStyle = C.TEAM_COL[1]; ctx.fill();
    const pulse = 0.6 + 0.4 * Math.sin(t * 3);
    for (const p of [[M0.x + M0.w * 0.3, by - 4], [cx, by + 26], [M0.x + M0.w * 0.7, by - 4]]) { ctx.globalCompositeOperation = 'lighter'; X.glow(ctx, p[0], p[1], 14, '#7dffb0', 0.4 * pulse); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; X.circle(ctx, p[0], p[1], 4.5); ctx.fillStyle = '#3fbf74'; ctx.fill(); ctx.strokeStyle = '#e8ffd8'; ctx.lineWidth = 1.3; ctx.stroke(); }
    ctx.restore();
    // 인원: 3대3 / 5대5
    for (const z of L.sizes) {
      const on = sel.size === z.size, hot = UI.over(z.x, z.y, z.w, z.h);
      X.rr(ctx, z.x, z.y, z.w, z.h, 18); ctx.fillStyle = on ? '#e2d4ff' : hot ? 'rgba(86,86,150,0.95)' : 'rgba(22,26,58,0.95)'; ctx.fill(); ctx.strokeStyle = on ? '#ffffff' : 'rgba(200,180,255,0.5)'; ctx.lineWidth = on ? 2 : 1; ctx.stroke();
      X.text(ctx, z.size + ' 대 ' + z.size, z.x + z.w / 2, z.y + z.h / 2 + 1, 16, on ? '#0b0d22' : '#e8dcff', 'center', 900);
      if (hot) UI.cursor = 'pointer';
      if (UI.hit(z.x, z.y, z.w, z.h, 0) && !on) { sel.size = z.size; if (UI.on.select) UI.on.select(); if (UI.on.prefs) UI.on.prefs(); }
    }
    X.rr(ctx, M0.x - 4, M0.y + 148, M0.w + 8, 42, 10); ctx.fillStyle = 'rgba(10,8,30,0.82)'; ctx.fill();
    X.text(ctx, '2분마다 별비 — 별조각 셋 가운데 하나를 골라 판을 바꿉니다', M0.x + M0.w / 2, M0.y + 160, 11.5, '#e8e2ff', 'center', 600);
    // 등급 셋: 실버 · 골드 · 프리즘 (높을수록 크게 바뀐다)
    let tx = M0.x + 6;
    for (let i = 0; i < TT.length; i++) { const T = TT[i]; X.star(ctx, tx + 5, M0.y + 179, 5, 5, 0.45, -Math.PI / 2); ctx.fillStyle = T.col; ctx.fill(); X.text(ctx, T.name, tx + 13, M0.y + 180, 11.5, T.col, 'left', 900); tx += X.textW(ctx, T.name, 11.5, 900) + 24; }
    X.text(ctx, '— 높은 등급일수록 크게 바뀝니다', tx - 6, M0.y + 180, 11, '#cfc6f0', 'left', 600);
    X.text(ctx, '★ 내 영웅은 아래에서 고릅니다 (나머지는 무작위)', M0.x, M0.y + M0.h + 26, 12.5, '#d9ccff', 'left', 600);
  }

  /* ---------- 상점 (오른쪽 위: 가운데의 내 영웅은 가리지 않는다) ----------
     19차 개편 — "아이템 살 때 불편하다"는 말에 맞춰 한 화면에서 고르고 · 견주고 · 사고 · 팔게 했다:
       ① 맨 위 = 이 영웅의 추천 3단계와 '한 번에 사기'(예전 그대로 — 뭘 살지 모르면 여기만 누르면 된다)
       ② 갈래 단추(전체 · 공격 · 주문 · 방어 · 체력 · 속도 · 특수)로 추려 본다
       ③ 아이템 칸 = 그림 · 이름 · 단계 점 셋 · 값. 지금 살 수 있으면 금빛 테, 모자라면 흐리게, 다 올렸으면 '완성'. 좌클릭 = 한 단계 사기 · 우클릭 = 한 단계 팔기
       ④ 오른쪽 칸 = 가리킨 아이템의 모든 것: 다음 단계가 주는 수치 · 사면 내 수치가 얼마에서 얼마로 바뀌는지 · 3단계 효과 전문 · 사기/팔기 단추
       ⑤ 맨 아래 = 내가 가진 아이템 줄 (우클릭으로 판다) */
  Mn.shopRect = () => ({ x: UI.W - 716 - 24, y: 112, w: 716, h: 468 });
  /* 상점 맨 위 '추천 3단계' 카드들의 자리 (시험에서도 쓴다): [지금 살 것, 다음, 그다음] */
  Mn.planRects = () => { const R = Mn.shopRect(), y = R.y + 52; return [{ x: R.x + 18, y, w: 236, h: 88 }, { x: R.x + 18 + 236 + 22, y, w: 152, h: 88 }, { x: R.x + 18 + 236 + 22 + 152 + 22, y, w: 152, h: 88 }]; };
  Mn.buyAllRect = () => { const R = Mn.shopRect(); return { x: R.x + 614, y: R.y + 52, w: 84, h: 88 }; };
  Mn.shopTabRects = () => { const R = Mn.shopRect(), cats = TW.ITEM_CATS; return cats.map((c, i) => ({ id: c[0], name: c[1], x: R.x + 18 + i * 60, y: R.y + 150, w: 56, h: 26 })); };
  const shopItems = () => { const tab = UI.shopTab || 'all'; return TW.ItemOrder.filter(id => tab === 'all' || TW.Items[id].cat.indexOf(tab) >= 0); };
  Mn.shopCellRects = () => { const R = Mn.shopRect(); return shopItems().map((id, i) => ({ id, x: R.x + 18 + (i % 4) * 110, y: R.y + 184 + Math.floor(i / 4) * 48, w: 106, h: 44 })); };
  Mn.shopDetailRect = () => { const R = Mn.shopRect(); return { x: R.x + 464, y: R.y + 184, w: 234, h: 236 }; };
  Mn.shopBuyRect = () => { const D = Mn.shopDetailRect(); return { x: D.x + 10, y: D.y + D.h - 38, w: 124, h: 30 }; };
  Mn.shopSellRect = () => { const D = Mn.shopDetailRect(); return { x: D.x + 140, y: D.y + D.h - 38, w: 84, h: 30 }; };
  Mn.shopOwnedRects = (me) => { const R = Mn.shopRect(); let k = 0; const out = []; for (const id of TW.ItemOrder) if (me.items[id]) out.push({ id, x: R.x + 96 + (k++) * 34, y: R.y + R.h - 23, r: 14 }); return out; };
  const STEP = ['지금 살 것', '다음', '그다음'];
  const CAT_NAME = { atk: '공격', mag: '주문', def: '방어', hp: '체력', spd: '속도', spc: '특수' };
  /* 사면(또는 팔면) 내 수치가 어떻게 바뀌나 → [{ k, a, z, up }] 달라진 것만 */
  const POW_KEYS = [['ad', '공격력', 0], ['ap', '주문력', 0], ['hp', '체력', 0], ['def', '방어력', 0], ['as', '공격 속도', 2], ['ms', '이동 속도', 1], ['cdr', '재사용 감소', -1], ['ls', '흡혈', -1], ['gps', '1초마다 골드', 0]];
  Mn.shopDelta = function (me, id, dir) {
    const cur = me.items[id] || 0, to = cur + dir; if (to < 0 || to > 3) return [];
    const items = Object.assign({}, me.items); if (to) items[id] = to; else delete items[id];
    const A = TW.powerOf(me), Z = TW.powerOf(me, items), out = [];
    for (const [k, name, dg] of POW_KEYS) {
      if (Math.abs(A[k] - Z[k]) < 1e-6) continue;
      const f = (v) => dg < 0 ? Math.round(v * 100) + '%' : dg ? v.toFixed(dg) : String(Math.round(v));
      out.push({ k: name, a: f(A[k]), z: f(Z[k]), up: Z[k] > A[k] });
    }
    return out;
  };
  function pips(ctx, x, y, tier, col, r) { for (let k = 0; k < 3; k++) { X.circle(ctx, x + k * (r * 2 + 3), y, r); if (k < tier) { ctx.fillStyle = col; ctx.fill(); } else { ctx.strokeStyle = 'rgba(200,206,255,0.4)'; ctx.lineWidth = 1; ctx.stroke(); } } }
  function drawShop(ctx, G, me) {
    const R = Mn.shopRect(), w = R.w, h = R.h, x = R.x, y = R.y;
    UI.panel(ctx, x, y, w, h, 22, 'rgba(8,10,28,0.96)'); UI.block(x, y, w, h);
    // ── 머리: 이름 · 추천의 까닭 · 가진 골드 · 닫기
    X.text(ctx, '상점', x + 22, y + 28, 22, '#ffffff', 'left', 900);
    const debt = me.gold < 0;
    { const gs = String(debt ? Math.ceil(-me.gold) : Math.floor(me.gold)), gw = X.textW(ctx, gs, 21, 900), gx = x + w - 96 - gw;
      X.rr(ctx, gx - 34, y + 12, gw + 46, 32, 16); ctx.fillStyle = 'rgba(52,44,18,0.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,216,74,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      Art.icon(ctx, 'gold', gx - 16, y + 28, 10, debt ? COL.bad : COL.gold); X.text(ctx, (debt ? '빚 ' : '') + gs, gx + (debt ? -2 : 0), y + 29, debt ? 16 : 21, debt ? COL.bad : COL.gold, 'left', 900); }
    if (UI.button(ctx, '닫기 P', x + w - 80, y + 13, 62, 30, { px: 12.5, r: 15 })) UI.shopOpen = false;
    const plan = TW.buildPlan(me, 3), ap = TW.affordPlan(me), step = {};
    plan.forEach((p, i) => { step[p.id] = step[p.id] || i + 1; });
    X.text(ctx, me.name + ' 추천 3단계', x + 84, y + 21, 14.5, '#ffe9a0', 'left', 900);
    X.text(ctx, TW.BUILD_WHY[me.heroId] || '', x + 84, y + 39, 11.5, COL.dim, 'left', 600);
    let hoverId = null;
    // ── ① 추천 3단계: 맨 앞(지금 살 것) 하나만 크게 금빛으로
    const PR = Mn.planRects(), pulse = 0.5 + 0.5 * Math.sin(UI.t * 5);
    if (!plan.length) X.text(ctx, '아이템을 모두 갖췄습니다', x + 300, PR[0].y + 46, 16, COL.dim, 'center', 700);
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i], it = TW.Items[p.id], r = PR[i], now = i === 0, can = me.gold >= p.cost, hot = UI.over(r.x, r.y, r.w, r.h);
      if (i > 0) { const ax = r.x - 11, ay = r.y + r.h / 2; ctx.beginPath(); ctx.moveTo(ax - 4, ay - 7); ctx.lineTo(ax + 5, ay); ctx.lineTo(ax - 4, ay + 7); ctx.closePath(); ctx.fillStyle = COL.dim; ctx.fill(); }
      X.rr(ctx, r.x, r.y, r.w, r.h, 14);
      ctx.fillStyle = now ? (hot ? 'rgba(86,70,22,0.95)' : 'rgba(52,44,18,0.92)') : hot ? 'rgba(56,58,110,0.85)' : 'rgba(20,22,52,0.85)'; ctx.fill();
      ctx.strokeStyle = now ? COL.gold : COL.line; ctx.lineWidth = now ? 2.2 + pulse * 1.3 : 1; ctx.stroke();
      UI.chip(ctx, (i + 1) + ' ' + STEP[i], r.x + (now ? 52 : 38), r.y + 13, now ? 12 : 10.5, '#0b0d22', now ? COL.gold : '#aeb3d6', 7);
      const ir = now ? 20 : 15, icx = r.x + (now ? 31 : 24), icy = r.y + (now ? 43 : 41);
      Art.iconButton(ctx, it.icon, icx, icy, ir, it.color, 1);
      X.text(ctx, it.name + ' ' + p.tier + '단계', icx + ir + 9, icy - 8, now ? 16 : 12.5, '#ffffff', 'left', 900);
      X.text(ctx, it.descAt(p.tier), icx + ir + 9, icy + 10, now ? 12.5 : 10.5, now ? '#ffe9a0' : '#c9cdea', 'left', 700);
      if (now) {
        const bx = r.x + 14, bw = r.w - 28, by = r.y + 64;
        X.rr(ctx, bx, by, bw, 7, 3.5); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
        X.rr(ctx, bx, by, bw * U.clamp(me.gold / p.cost, 0.03, 1), 7, 3.5); ctx.fillStyle = can ? COL.gold : '#a48a3a'; ctx.fill();
        X.text(ctx, can ? '누르거나 V — ' + p.cost + ' 골드' : p.cost + ' 골드 · ' + Math.ceil(p.cost - me.gold) + ' 더 모으면', r.x + r.w / 2, by + 15, 11.5, can ? COL.gold : COL.dim, 'center', 800);
      } else X.text(ctx, p.cost + ' 골드', r.x + 14, r.y + 74, 12, me.gold >= p.cost ? COL.gold : '#9aa0c4', 'left', 800);
      if (hot) { hoverId = p.id; UI.cursor = can ? 'pointer' : 'default'; if (UI.hit(r.x, r.y, r.w, r.h, 0)) { UI.shopSel = p.id; if (can) { if (UI.on.buy) UI.on.buy(p.id); } else if (UI.on.deny) UI.on.deny('골드가 부족합니다 — ' + Math.ceil(p.cost - me.gold) + ' 골드 더 필요'); } }
    }
    // 한 번에 사기 (V): 추천 순서대로 지금 골드로 살 수 있는 만큼
    { const B = Mn.buyAllRect(), n = ap.list.length, hot = UI.over(B.x, B.y, B.w, B.h) && n > 0;
      X.rr(ctx, B.x, B.y, B.w, B.h, 14);
      if (n) { const g = ctx.createLinearGradient(0, B.y, 0, B.y + B.h); g.addColorStop(0, hot ? '#ffffff' : '#f6f1e4'); g.addColorStop(1, hot ? '#f1ead8' : '#d9d1bc'); ctx.fillStyle = g; } else ctx.fillStyle = 'rgba(28,30,64,0.8)';
      ctx.fill(); ctx.strokeStyle = n ? '#ffffff' : COL.line; ctx.lineWidth = 1; ctx.stroke();
      const fc = n ? '#141024' : '#6a6f90';
      X.text(ctx, '한 번에', B.x + B.w / 2, B.y + 19, 14, fc, 'center', 900); X.text(ctx, '사기 (V)', B.x + B.w / 2, B.y + 37, 14, fc, 'center', 900);
      X.text(ctx, n ? n + '개' : plan.length ? '골드 부족' : '모두 갖춤', B.x + B.w / 2, B.y + 58, 12, fc, 'center', 800);
      if (n) X.text(ctx, ap.cost + ' 골드', B.x + B.w / 2, B.y + 74, 11.5, '#6a5210', 'center', 800);
      if (hot) UI.cursor = 'pointer';
      if (UI.hit(B.x, B.y, B.w, B.h, 0)) { if (UI.on.buyAll) UI.on.buyAll(); } }
    // ── ② 갈래
    const tab = UI.shopTab || 'all';
    for (const t of Mn.shopTabRects()) {
      const on = tab === t.id, hot = UI.over(t.x, t.y, t.w, t.h);
      X.rr(ctx, t.x, t.y, t.w, t.h, 13); ctx.fillStyle = on ? '#e8ecff' : hot ? 'rgba(70,66,130,0.85)' : 'rgba(24,26,58,0.9)'; ctx.fill(); ctx.strokeStyle = on ? '#ffffff' : COL.line; ctx.lineWidth = 1; ctx.stroke();
      X.text(ctx, t.name, t.x + t.w / 2, t.y + t.h / 2 + 1, 13, on ? '#0b0d22' : COL.text, 'center', 800);
      if (hot) UI.cursor = 'pointer';
      if (UI.hit(t.x, t.y, t.w, t.h, 0) && !on) { UI.shopTab = t.id; if (UI.on.click) UI.on.click(); }
    }
    X.text(ctx, '좌클릭 = 사기 · 우클릭 = 팔기', x + w - 20, y + 164, 11.5, '#9aa0c4', 'right', 700);
    // ── ③ 아이템 칸
    const cells = Mn.shopCellRects();
    for (const c of cells) {
      const id = c.id, it = TW.Items[id], tier = me.items[id] || 0, maxed = tier >= 3, cost = maxed ? 0 : TW.ITEM_COST[tier], can = !maxed && me.gold >= cost, hot = UI.over(c.x, c.y, c.w, c.h), sn = step[id], sel = (UI.shopSel === id);
      X.rr(ctx, c.x, c.y, c.w, c.h, 10);
      ctx.fillStyle = hot ? (can ? 'rgba(78,72,140,0.92)' : 'rgba(46,46,84,0.92)') : tier ? 'rgba(30,32,70,0.92)' : 'rgba(18,20,48,0.9)'; ctx.fill();
      ctx.strokeStyle = can ? (sn === 1 ? COL.gold : 'rgba(255,216,74,0.6)') : sel ? 'rgba(232,236,255,0.6)' : COL.line; ctx.lineWidth = sn === 1 && can ? 2 : sel ? 1.5 : 1; ctx.stroke();
      if (tier) { ctx.fillStyle = it.color; ctx.fillRect(c.x + 1.5, c.y + 9, 3, c.h - 18); }
      ctx.globalAlpha = maxed || can || tier ? 1 : 0.62;
      Art.iconButton(ctx, it.icon, c.x + 21, c.y + 22, 14, it.color, ctx.globalAlpha);
      ctx.globalAlpha = maxed || can || tier ? 1 : 0.7;
      X.text(ctx, it.name, c.x + 39, c.y + 15, it.name.length > 6 ? 10.5 : it.name.length > 5 ? 11.5 : 12.5, '#ffffff', 'left', 800);
      pips(ctx, c.x + 42, c.y + 31, tier, it.color, 3);
      if (maxed) X.text(ctx, '완성', c.x + c.w - 7, c.y + 31, 11.5, it.color, 'right', 900);
      else X.text(ctx, String(cost), c.x + c.w - 7, c.y + 31, 12.5, can ? COL.gold : '#aab0d0', 'right', 900);
      ctx.globalAlpha = 1;
      // 그림 왼쪽 위의 작은 딱지: 추천 순서(1 · 2 · 3) 또는 '새'(19차에 생긴 아이템) — 이름을 가리지 않게 그림 쪽에 붙인다
      if (sn) UI.chip(ctx, String(sn), c.x + 10, c.y + 9, 9.5, '#0b0d22', sn === 1 ? COL.gold : '#cfc7a0', 4);
      else if (it.fresh) UI.chip(ctx, '새', c.x + 10, c.y + 9, 9, '#0b0d22', '#8dffb4', 3.5);
      if (hot) {
        hoverId = id; UI.cursor = can || tier ? 'pointer' : 'default';
        if (UI.hit(c.x, c.y, c.w, c.h, 0)) { UI.shopSel = id; if (can) { if (UI.on.buy) UI.on.buy(id); } else if (UI.on.deny) UI.on.deny(maxed ? '이미 완성한 아이템입니다' : '골드가 부족합니다 — ' + Math.ceil(cost - me.gold) + ' 골드 더 필요'); }
        else if (UI.hit(c.x, c.y, c.w, c.h, 2)) { UI.shopSel = id; if (tier) { if (UI.on.sell) UI.on.sell(id); } else if (UI.on.deny) UI.on.deny('가지고 있지 않은 아이템입니다'); }
      }
    }
    // ── ⑤ 내 아이템 줄 (우클릭 = 팔기)
    { const by = y + h - 23, own = Mn.shopOwnedRects(me);
      X.text(ctx, '내 아이템', x + 22, by + 1, 12.5, '#cfd6ee', 'left', 800);
      if (!own.length) X.text(ctx, '아직 없음', x + 96, by + 1, 12, COL.dim, 'left', 600);
      let spent = 0;
      for (const o of own) {
        const it = TW.Items[o.id], tier = me.items[o.id], hot = Math.hypot(UI.mx - o.x, UI.my - o.y) < o.r + 2;
        for (let k = 0; k < tier; k++) spent += TW.ITEM_COST[k];
        Art.iconButton(ctx, it.icon, o.x, o.y, o.r, it.color, 1);
        if (hot) { X.circle(ctx, o.x, o.y, o.r + 2); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke(); hoverId = o.id; UI.cursor = 'pointer'; }
        X.text(ctx, String(tier), o.x + 10, o.y + 9, 10.5, '#ffffff', 'center', 900, 'rgba(4,6,18,0.95)', 3);
        if (UI.hit(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2, 2)) { UI.shopSel = o.id; if (UI.on.sell) UI.on.sell(o.id); }
        else if (UI.hit(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2, 0)) UI.shopSel = o.id;
      }
      // 자동 구매: 딸깍 스위치
      const sx = x + w - 236, sy = y + h - 39, hot = UI.over(sx, sy, 220, 32), kx = sx + 26 + (UI.autoBuy ? 11 : -11);
      X.rr(ctx, sx + 4, sy + 5, 44, 22, 11); ctx.fillStyle = UI.autoBuy ? '#7dffb2' : 'rgba(255,255,255,0.18)'; ctx.fill();
      X.circle(ctx, kx, sy + 16, 8.5); ctx.fillStyle = UI.autoBuy ? '#0b0d22' : '#c9cdf0'; ctx.fill();
      X.text(ctx, '추천 순서대로 알아서 사기', sx + 58, sy + 17, 12.5, hot ? '#ffffff' : COL.text, 'left', 700);
      if (hot) UI.cursor = 'pointer';
      if (UI.hit(sx, sy, 220, 32, 0)) { UI.autoBuy = !UI.autoBuy; if (UI.on.prefs) UI.on.prefs(); }
      if (own.length && own.length <= 9) X.text(ctx, '쓴 골드 ' + spent, sx - 12, by + 1, 11, COL.dim, 'right', 600); }
    // ── ④ 오른쪽 칸: 가리킨(없으면 마지막으로 누른 · 그것도 없으면 지금 살 것) 아이템의 모든 것
    if (hoverId) UI.shopSel = hoverId;
    const D = Mn.shopDetailRect(), did = (UI.shopSel && TW.Items[UI.shopSel]) ? UI.shopSel : plan.length ? plan[0].id : TW.ItemOrder[0];
    { const it = TW.Items[did], tier = me.items[did] || 0, maxed = tier >= 3, cost = maxed ? 0 : TW.ITEM_COST[tier], can = !maxed && me.gold >= cost;
      X.rr(ctx, D.x, D.y, D.w, D.h, 14); ctx.fillStyle = 'rgba(16,18,46,0.95)'; ctx.fill(); ctx.strokeStyle = U.rgba(it.color, 0.55); ctx.lineWidth = 1.2; ctx.stroke();
      Art.iconButton(ctx, it.icon, D.x + 30, D.y + 30, 20, it.color, 1);
      X.text(ctx, it.name, D.x + 58, D.y + 21, 16.5, '#ffffff', 'left', 900);
      pips(ctx, D.x + 62, D.y + 41, tier, it.color, 4);
      X.text(ctx, (maxed ? '완성' : tier + ' / 3 단계') + ' · ' + it.cat.map(c => CAT_NAME[c]).join('·'), D.x + 98, D.y + 42, 11, tier ? it.color : COL.dim, 'left', 700);
      if (it.fresh) UI.chip(ctx, '새 아이템', D.x + D.w - 38, D.y + 16, 9.5, '#0b0d22', '#8dffb4', 6);
      let ty = D.y + 68;
      // 다음 단계가 주는 것 · 사면 내 수치가 어떻게 바뀌나
      X.text(ctx, maxed ? '3단계 (완성)' : '사면 ' + (tier + 1) + '단계', D.x + 12, ty, 11.5, COL.dim, 'left', 700);
      X.text(ctx, it.descAt(maxed ? 3 : tier + 1), D.x + 84, ty, 12.5, it.color, 'left', 800); ty += 19;
      const dl = maxed ? [] : Mn.shopDelta(me, did, 1);
      for (let i = 0; i < dl.length && i < 3; i++) {
        const d = dl[i];
        X.text(ctx, d.k, D.x + 12, ty, 12, '#d8dcf4', 'left', 600);
        const zw = X.textW(ctx, d.z, 13.5, 900);
        X.text(ctx, d.z, D.x + D.w - 12, ty, 13.5, COL.good, 'right', 900);
        X.text(ctx, d.a + '  →', D.x + D.w - 18 - zw, ty, 12, '#aab0d0', 'right', 700);
        ty += 17;
      }
      if (!maxed && tier + 1 === 3) { UI.chip(ctx, '이번에 3단계 효과가 열립니다', D.x + D.w / 2, ty + 3, 10.5, '#0b0d22', it.color, 8); ty += 20; }
      // 3단계 효과 (줄이지 않고 다 적는다)
      ty += 4;
      X.text(ctx, tier >= 3 ? '3단계 효과 (켜짐)' : '3단계 효과', D.x + 12, ty, 11.5, tier >= 3 ? it.color : COL.dim, 'left', 800); ty += 16;
      const pl = X.wrap(ctx, it.ptext, D.w - 24, 11.5, 600);
      for (let i = 0; i < pl.length && i < 4; i++) { X.text(ctx, pl[i], D.x + 12, ty, 11.5, tier >= 3 ? '#ffffff' : '#c9cdea', 'left', 600); ty += 15.5; }
      // 사기 · 팔기
      const BR = Mn.shopBuyRect(), SR = Mn.shopSellRect(), back = G.sellGold ? G.sellGold(me, did) : 0;
      if (UI.button(ctx, maxed ? '완성했습니다' : can ? '사기 · ' + cost + ' 골드' : Math.ceil(cost - me.gold) + ' 골드 부족', BR.x, BR.y, BR.w, BR.h, { px: 12.5, r: 15, primary: can, disabled: !can })) { if (UI.on.buy) UI.on.buy(did); }
      if (UI.button(ctx, tier ? '팔기 +' + back : '팔 것 없음', SR.x, SR.y, SR.w, SR.h, { px: 12, r: 15, disabled: !tier })) { if (UI.on.sell) UI.on.sell(did); }
    }
  }

  /* ---------- 전적판: 두 진영이 좌우에서 마주 본다 (점수판·결과 화면 공용) ---------- */
  function versus(ctx, G, me, y0, showDmg, mvp) {
    const cx = UI.W / 2, gap = 104, colW = 640, rowH = 92;
    let maxDmg = 1; for (const h of G.heroes) maxDmg = Math.max(maxDmg, h.stats.dmg);
    for (let tm = 0; tm < 2; tm++) {
      const sg = tm === 0 ? -1 : 1, col = C.TEAM_COL[tm], al = tm === 0 ? 'left' : 'right';
      const at = (d) => cx + sg * d, left = tm === 0 ? cx - gap - colW : cx + gap;        // at(d): 가운데에서 d 만큼 떨어진 곳
      X.text(ctx, C.TEAM_NAMES[tm], at(gap + colW), y0, 34, col, al, 900, 'rgba(4,6,18,0.9)', 5);
      X.text(ctx, '처치 ' + G.teams[tm].kills + '  ·  등불탑 ' + G.teams[tm].towers + '/' + (G.teams[tm].towersMax || 6) + '  ·  ' + (G.brawl ? '회복 꾸러미 ' + G.stat.packs[tm] : '이무기 ' + G.teams[tm].bossKills), at(gap + colW - 92), y0 + 4, 13.5, C.TEAM_LIGHT[tm], al, 700, 'rgba(4,6,18,0.9)', 3);
      ctx.fillStyle = col; ctx.fillRect(left, y0 + 24, colW, 2);
      let ry = y0 + 38;
      for (const h of G.heroes) {
        if (h.team !== tm) continue;
        const mine = h === me, best = h === mvp, py = ry + (rowH - 8) / 2;
        const g = ctx.createLinearGradient(at(gap + colW), 0, at(gap), 0); g.addColorStop(0, mine ? 'rgba(74,78,140,0.94)' : 'rgba(10,14,36,0.92)'); g.addColorStop(1, mine ? 'rgba(74,78,140,0.5)' : 'rgba(10,14,36,0.5)');
        X.rr(ctx, left, ry, colW, rowH - 8, 14); ctx.fillStyle = g; ctx.fill();
        if (best) { ctx.strokeStyle = COL.gold; ctx.lineWidth = 2; ctx.stroke(); }
        UI.portrait(ctx, h.heroId, at(gap + colW - 46), py, 31, best ? COL.gold : col, h.dead && !UI.ended);
        const tx = at(gap + colW - 92);
        X.text(ctx, h.name, tx, py - 21, 18, '#ffffff', al, 900);
        const nmW = X.textW(ctx, h.name, 18, 900);
        if (mine) UI.chip(ctx, '나', tx - sg * (nmW + 20), py - 21, 11.5, '#0b0d22', '#e8ecff', 7);
        if (best) UI.chip(ctx, '가장 빛난 영웅', tx - sg * (nmW + (mine ? 96 : 60)), py - 21, 11, '#0b0d22', COL.gold, 7);
        X.text(ctx, h.hd.title + ' · ' + POS_SHORT[h.pos] + ' · ' + h.level + '레벨', tx, py + 1, 12, COL.dim, al, 500);
        // 셋째 줄: 준 피해(결과 화면) 또는 가진 아이템(점수판)
        if (showDmg) {
          const bw = 166, bx = tm === 0 ? tx : tx - bw, fw = Math.max(4, bw * h.stats.dmg / maxDmg);
          X.rr(ctx, bx, py + 18, bw, 9, 4.5); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
          X.rr(ctx, tm === 0 ? bx : bx + bw - fw, py + 18, fw, 9, 4.5); ctx.fillStyle = h.hd.glow; ctx.fill();
          X.text(ctx, '피해 ' + U.fmtNum(h.stats.dmg), at(gap + colW - 92 - bw - 10), py + 23, 12, '#e8ecff', al, 700);
        } else {
          let k = 0;
          for (const id of TW.ItemOrder) { const t = h.items[id] || 0; if (!t) continue; const it = TW.Items[id], ix = tx - sg * (12 + k * 30); Art.iconButton(ctx, it.icon, ix, py + 22, 11, it.color, 1); X.text(ctx, String(t), ix + 9, py + 30, 10, '#ffffff', 'center', 900, 'rgba(4,6,18,0.9)', 2.5); k++; }
          if (!k) X.text(ctx, '아이템 없음', tx, py + 23, 11.5, 'rgba(154,160,196,0.6)', al, 500);
          // 별비 난전: 가진 별조각 (안쪽 전적 숫자 아래)
          if (G.star && TW.UIStar && h.boons) for (let q = 0; q < h.boons.length; q++) TW.UIStar.chip(ctx, h.boons[q], at(gap + 132 + q * 26), py + 34, 10, 1);
        }
        // 안쪽: 전적
        X.text(ctx, h.kills + ' / ' + h.deaths + ' / ' + h.assists, at(gap + 172), py - 10, 23, '#ffffff', 'center', 900);
        X.text(ctx, '처치 / 죽음 / 도움', at(gap + 172), py + 16, 10.5, COL.dim, 'center', 600);
        X.text(ctx, String(h.cs), at(gap + 66), py - 10, 17, '#e8ecff', 'center', 800); X.text(ctx, '막타', at(gap + 66), py + 16, 10.5, COL.dim, 'center', 600);
        X.text(ctx, U.fmtNum(h.stats.gold), at(gap + 268), py - 10, 17, COL.gold, 'center', 800); X.text(ctx, '골드', at(gap + 268), py + 16, 10.5, COL.dim, 'center', 600);
        ry += rowH;
      }
    }
  }
  /* 가운데에 드리운 세로 현판 */
  function hangBanner(ctx, chars, col, h, px) {
    const cx = UI.W / 2, w = px + 42;
    ctx.beginPath(); ctx.moveTo(cx - w / 2, 0); ctx.lineTo(cx + w / 2, 0); ctx.lineTo(cx + w / 2, h); ctx.lineTo(cx, h - 30); ctx.lineTo(cx - w / 2, h); ctx.closePath();
    ctx.fillStyle = 'rgba(8,10,26,0.94)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = U.rgba(col, 0.35); ctx.lineWidth = 1; ctx.strokeRect(cx - w / 2 + 8, -4, w - 16, h - 38);
    for (let i = 0; i < chars.length; i++) X.text(ctx, chars[i], cx, 26 + px * 0.62 + i * (px + 10), px, col, 'center', 900);
  }
  function drawScore(ctx, G, me) {
    dim(ctx, 0.84);
    const cx = UI.W / 2, y0 = Math.max(96, UI.H / 2 - 290);
    hangBanner(ctx, ['전', '적'], '#e8ecff', y0 + 150, 40);
    X.text(ctx, U.fmtTime(G.t), cx, y0 + 186, 22, COL.text, 'center', 900, 'rgba(4,6,18,0.9)', 4);
    X.text(ctx, String(G.teams[0].kills), cx - 34, y0 + 232, 36, C.TEAM_COL[0], 'center', 900, 'rgba(4,6,18,0.9)', 5); X.text(ctx, ':', cx, y0 + 230, 26, COL.dim, 'center', 900); X.text(ctx, String(G.teams[1].kills), cx + 34, y0 + 232, 36, C.TEAM_COL[1], 'center', 900, 'rgba(4,6,18,0.9)', 5);
    versus(ctx, G, me, y0, false, null);
  }

  function drawHelp(ctx) {
    dim(ctx, 0.55);
    const w = 1000, h = 756, x = UI.W / 2 - w / 2, y = UI.H / 2 - h / 2;
    UI.panel(ctx, x, y, w, h, 22, 'rgba(8,10,28,0.97)'); UI.block(0, 0, UI.W, UI.H);
    X.text(ctx, '조작법', x + 28, y + 36, 24, '#ffffff', 'left', 900);
    const quick = UI.castMode === 'quick';
    const keys = [['우클릭', '땅 = 이동 · 적 = 공격 (좌클릭도 같습니다). 평타가 맞은 뒤에는 언제든 이동으로 끊깁니다 — 때리고 빠지세요'], ['Q W E R', quick ? '누르는 순간 커서 쪽으로 나갑니다 (ESC 메뉴에서 "조준 후 떼기"로 바꿀 수 있습니다)' : '키를 누르고 있으면 조준선이 보이고, 떼면 그쪽으로 나갑니다 (ESC 메뉴에서 "누르면 바로"로 바꿀 수 있습니다)'], ['SPACE', '구르기 — 커서 쪽으로 몸을 날려 날아오는 스킬을 피합니다'], ['A', '커서 근처의 적 공격 (한 대면 쓰러지는 미니언 먼저). 근처에 없으면 공격하며 이동. 누르고 있으면 사거리 표시'], ['S', '멈춤 (알아서 치지 않고 기다립니다 — 막타를 노릴 때)'], ['B · V', '귀환 (본진에서 체력 회복) · 추천 아이템 바로 사기'], ['T', '바로 일어서기 — 쓰러졌을 때 골드를 내고(모자라면 빚) 본진에서 곧장 일어섭니다. 한 번 쓰면 3분 동안 못 씁니다 (어스름 전선)'], ['P', '상점 (어디서든) — 갈래 단추로 추려 보고, 좌클릭 = 한 단계 사기 · 우클릭 = 한 단계 팔기(값의 70%)'], ['1 · 2 · 3 · 4', '별비 난전 — 별조각 카드 고르기(1·2·3) · 다시 뽑기(4, 한 판에 한 번). 고르는 동안에도 경기는 흐릅니다'], ['G', '집결 신호 — 아군 봇이 커서 위치로 모입니다'], ['TAB · F3', '점수판 · 프레임 표시'], ['Y · 휠', '화면 고정 풀기/잠그기 · 확대/축소'], ['M · ESC', '소리 켬/끔 · 멈춤']];
    for (let i = 0; i < keys.length; i++) { const yy = y + 76 + i * 26; UI.chip(ctx, keys[i][0], x + 86, yy, 12.5, '#0b0d22', '#ffe2a6', 8); X.text(ctx, keys[i][1], x + 160, yy + 1, 12.5, '#d8dcf4', 'left', 500); }
    const tips = ['별비 난전: 길 하나(별내 여울)에서 바로 싸웁니다. 2분마다 별비가 내려 별조각 셋 가운데 하나를 고릅니다 — 실버(수치) · 골드(싸우는 방식) · 프리즘(판을 바꿈). 내 영웅은 고르고 나머지는 무작위입니다. 한 판이 끝나면 어느 놀이든 내 등급(실버 · 골드 · 프리즘)이 매겨집니다.', '한 줄 난전: 길이 다리 하나뿐입니다. 귀환과 본진 회복이 없으니 다리 위 초록 회복 꾸러미를 밟으세요. 10분이 되면 큰등불이 더 남은 편이 이깁니다.', '막타: 적 미니언의 체력 막대에 있는 흰 눈금이 "내 평타 한 대"입니다. 체력이 눈금 아래로 내려오면 금빛 ▼ 가 뜹니다 — 그때 치면 골드가 들어옵니다.', '발밑 고리가 다 차면 다음 평타를 칠 수 있습니다. 스킬이 맞으면 네 갈래 표식과 맑은 소리가, 빗나가면 "빗나감"이 뜹니다.', '지도 아래 "목표"가 지금 할 일입니다. 수풀·갈대밭에 들어가면 밖에서 보이지 않습니다.', '숲의 잉걸 두꺼비·샘지기를 잡으면 80초, 아래쪽 강의 이무기를 잡으면 팀 전체가 100초 동안 강해집니다.', '적의 안쪽 등불탑을 부수면 그 길에 우리 정예병이 합류합니다. 쓰러질수록 부활은 길어집니다.', '도깨비불: 강 위 두 자리 가운데 한 곳에 ' + TW.C.WISP_EVERY + '초마다 뜹니다(' + TW.C.WISP_WARN + '초 전에 자리를 알려 줍니다). 먼저 밟는 영웅이 ' + TW.C.WISP_DUR + '초 동안 강해집니다 — 무슨 불일지는 뜰 때 압니다. 쓰러지지 않고 ' + TW.C.PRICE_FROM + '명째를 잡은 영웅부터는 머리 위에 현상금이 붙습니다.'];
    let ty = y + 76 + keys.length * 26 + 12;
    for (const tp of tips) { const ls = X.wrap(ctx, '· ' + tp, w - 60, 13, 500); for (const l of ls) { X.text(ctx, l, x + 30, ty, 13, '#bfeaff', 'left', 500); ty += 19; } }
    if (UI.button(ctx, '닫기', x + w - 120, y + 18, 96, 34, { px: 14 })) UI.helpOpen = false;
  }
  function drawPause(ctx, G, me) {
    dim(ctx, 0.6);
    const w = 400, h = 418, x = UI.W / 2 - w / 2, y = UI.H / 2 - h / 2;
    UI.panel(ctx, x, y, w, h, 24, 'rgba(8,10,28,0.97)'); UI.block(0, 0, UI.W, UI.H);
    if (UI.button(ctx, UI.castMode === 'quick' ? '스킬 발사: 누르는 순간 바로' : '스킬 발사: 누른 채 조준 → 떼면 발사', x + 40, y + 354, w - 80, 38, { px: 13, on: UI.castMode === 'quick' })) UI.on.castMode && UI.on.castMode();
    X.text(ctx, '잠시 멈춤', UI.W / 2, y + 46, 28, '#ffffff', 'center', 900);
    if (UI.button(ctx, '계속하기', x + 40, y + 88, w - 80, 50, { primary: true, px: 19 })) UI.on.pause && UI.on.pause();
    if (UI.button(ctx, '처음부터 다시', x + 40, y + 150, w - 80, 42, { px: 15 })) UI.on.restart && UI.on.restart();
    if (UI.button(ctx, '영웅 선택으로', x + 40, y + 200, w - 80, 42, { px: 15 })) UI.on.menu && UI.on.menu();
    if (UI.button(ctx, UI.muted ? '소리: 끔' : '소리: 켬', x + 40, y + 258, (w - 90) / 2, 38, { px: 13, on: !UI.muted })) UI.on.mute && UI.on.mute();
    if (UI.button(ctx, UI.musicOn ? '음악: 켬' : '음악: 끔', x + 50 + (w - 90) / 2, y + 258, (w - 90) / 2, 38, { px: 13, on: UI.musicOn })) UI.on.music && UI.on.music();
    if (UI.button(ctx, '조작법 보기', x + 40, y + 306, w - 80, 38, { px: 13 })) { UI.helpOpen = true; }
  }
  function drawEnd(ctx, G, me) {
    if (TW.Recap && TW.Recap.drawEnd && TW.Recap.drawEnd(ctx, G, me)) return;       // 새 결과 화면 (recap.js: MVP · 다시 보기 · 그래프 · 칭찬). 기록이 없으면 아래의 예전 화면
    const e = UI.ended; e.t += UI.dt;
    const a = U.clamp((e.t - 1.2) / 0.8, 0, 1); if (a <= 0) return;
    dim(ctx, 0.94 * a); ctx.globalAlpha = a; UI.block(0, 0, UI.W, UI.H);
    const win = e.win, col = win ? COL.gold : '#b9a6e8', cx = UI.W / 2, y0 = Math.max(110, UI.H / 2 - 300);
    ctx.globalCompositeOperation = 'lighter'; X.glow(ctx, cx, 150, 460, win ? '#ffb84a' : '#6a4ab8', 0.3 * a); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
    // 가운데: 승패 현판이 위에서 내려온다
    const drop = U.easeOut3(Math.min(1, (e.t - 1.2) / 0.6));
    ctx.save(); ctx.translate(0, (drop - 1) * 320);
    hangBanner(ctx, win ? ['승', '리'] : ['패', '배'], col, y0 + 170, 78);
    ctx.restore();
    const tu = G.stat.timeUp;
    X.text(ctx, tu ? '시간 종료 · 큰등불 ' + Math.round(tu.frac[0] * 100) + '% : ' + Math.round(tu.frac[1] * 100) + '%' : win ? '적의 큰등불을 껐습니다' : '우리 큰등불이 꺼졌습니다', cx, y0 + 198, tu ? 12 : 13, '#e8ecff', 'center', 700, 'rgba(4,6,18,0.9)', 3);    X.text(ctx, U.fmtTime(G.stat.endT || G.t), cx, y0 + 232, 22, COL.text, 'center', 900, 'rgba(4,6,18,0.9)', 4);
    X.text(ctx, String(G.teams[0].kills), cx - 36, y0 + 282, 40, C.TEAM_COL[0], 'center', 900, 'rgba(4,6,18,0.9)', 5); X.text(ctx, ':', cx, y0 + 280, 28, COL.dim, 'center', 900); X.text(ctx, String(G.teams[1].kills), cx + 36, y0 + 282, 40, C.TEAM_COL[1], 'center', 900, 'rgba(4,6,18,0.9)', 5);
    // 가장 빛난 영웅
    let mvp = null, ms = -1; for (const h of G.heroes) { const s = h.kills * 3 + h.assists * 1.5 - h.deaths * 1.5 + h.stats.dmg / 1500 + h.stats.struct / 800; if (h.team === G.winner && s > ms) { ms = s; mvp = h; } }
    versus(ctx, G, me, y0, true, mvp);
    // 한 판 더: 둥근 도장 · 영웅 선택으로: 작은 단추
    const sx = cx, sy = y0 + 392, r = 60, hot = Math.hypot(UI.mx - sx, UI.my - sy) < r, pr = r + (hot ? 4 : 0), gc = me ? me.hd.glow : COL.gold;
    X.circle(ctx, sx, sy, pr); ctx.fillStyle = hot ? gc : '#f4efe2'; ctx.fill();
    X.circle(ctx, sx, sy, pr - 7); ctx.strokeStyle = 'rgba(11,13,34,0.75)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(UI.t * 0.5); ctx.setLineDash([10, 9]); X.circle(ctx, 0, 0, pr + 8); ctx.strokeStyle = U.rgba(gc, 0.8); ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    X.text(ctx, '한 판', sx, sy - 13, 25, '#0b0d22', 'center', 900); X.text(ctx, '더', sx, sy + 17, 25, '#0b0d22', 'center', 900);
    if (hot) { UI.cursor = 'pointer'; for (const c of UI.clicks) if (!c.used && c.b === 0 && Math.hypot(c.x - sx, c.y - sy) < r) { c.used = true; if (UI.on.restart) UI.on.restart(); } }
    if (UI.button(ctx, '영웅 선택으로', cx - 84, y0 + 478, 168, 38, { px: 14, r: 19 })) UI.on.menu && UI.on.menu();
    ctx.globalAlpha = 1;
  }
  Mn.endBtn = () => (TW.Recap && TW.Recap.rep && UI.ended && TW.App && TW.Recap.rep.G === TW.App.G ? TW.Recap.endBtn() : { x: UI.W / 2, y: Math.max(110, UI.H / 2 - 300) + 392 });      // '한 판 더'의 가운데 (시험 도구가 누른다)

  Mn.overlays = function (ctx, G, me) {
    if (UI.ended) { drawEnd(ctx, G, me); return; }
    if (UI.shopOpen && me) drawShop(ctx, G, me);
    if (UI.scoreOpen) drawScore(ctx, G, me);
    if (UI.paused) drawPause(ctx, G, me);
    if (UI.helpOpen) drawHelp(ctx);
  };
})();
