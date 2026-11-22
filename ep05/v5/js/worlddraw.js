/* 어스름 전선 — worlddraw: 월드 안의 것들 그리기 (유닛·상태 이상·투사체·장판·예고·조준 표시·머리 위 정보)
   D.water · D.ground 는 땅 좌표(세로로 눌려 찍힌다), 그 밖은 '선 좌표'(x, y·K - 높이)로 그린다 → world.js 머리말 참고 */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map, X = TW.X, FX = TW.FX, Art = TW.Art, W = TW.World, TAU = Math.PI * 2;
  const D = W.Draw = {};
  const DANGER = '#ff5a6e', K = W.K;         // 위험 표시 색 · 땅의 세로 압축
  const HS = 1.55, ST = 1.2, MS = 1.1;       // 그림 배율: 영웅 · 구조물 · 몬스터
  W.HS = HS; W.ST = ST; W.MS = MS;
  const _p = { x: 0, y: 0 };

  /* 유닛별 화면 상태(보간·깜빡임·애니메이션 시각) */
  function vs(u) {
    let s = W.vis.get(u.id);
    if (!s) {
      s = { f: u.facing, flash: 0, punch: 0, kx: 0, ky: 0, hpLag: u.hp, atkT0: -9, atkW: 0.3, atkN: 0, castT0: -9, castSlot: 0, castDur: 0.4, dash: null, a: 0, x: u.x, y: u.y, shotT: -9, rip: 0, tr: 0, used: 0,
        // 타격의 무게(worldfx.js impact): 멈칫 남은 시간 · 그 길이 · 굳은 시각/걸음 · 자세를 굳힘 · 때린 자세로 버팀 · 떨림 폭/방향 · 쌓인 밀림 · 번쩍 · 젖힘
        hold: 0, holdL: 0, ht: 0, wp: 0, frz: false, hAtk: false, hAtkT0: 0, shk: 0, hdx: 0, hdy: 0, kbx: 0, kby: 0, tint: 0, tintT: 0, tintCol: '#ffffff', fl: 0, imp: false, u: null };
      W.vis.set(u.id, s);
    }
    s.used = W.frame;
    return s;
  }
  W.vs = vs;
  const isEnemy = (u) => W.team >= 0 && u.team !== W.team;
  const shown = (u) => W.team < 0 || u.team === W.team || u.seen[W.team] || u.isStruct;
  function teamCol(u) { return u.team === 2 ? '#ffd9a0' : C.TEAM_COL[u.team]; }

  /* ---------- 물결 ---------- */
  let glints = null;
  D.water = function (ctx) {
    if (!glints) { glints = []; for (let y = 0; y < C.H; y++) for (let x = 0; x < C.W; x++) if (M.water[y * C.W + x] && U.hash2(x, y, 77) < 0.075) glints.push(x + U.hash2(x, y, 78), y + U.hash2(x, y, 79), U.hash2(x, y, 80) * TAU); }
    const v = W.view, t = W.time;
    ctx.fillStyle = '#e8fff8';
    for (let i = 0; i < glints.length; i += 3) {
      const x = glints[i], y = glints[i + 1];
      if (x < v.x0 - 1 || x > v.x1 + 1 || y < v.y0 - 1 || y > v.y1 + 1) continue;
      const a = Math.sin(t * 1.3 + glints[i + 2]); if (a < 0.2) continue;
      ctx.globalAlpha = (a - 0.2) * 0.5; X.ell(ctx, x + Math.sin(t * 0.7 + glints[i + 2]) * 0.3, y, 0.55 * a, 0.12 * a); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  /* ---------- 장판 ---------- */
  function zoneGround(ctx, z, t) {
    const enemy = isEnemy(z) && !z.friendly, col = z.vis.color || '#ffffff', kind = z.vis.kind;
    if (!z.active) {
      if (kind === 'orb') return;
      const k = U.clamp(z.t / Math.max(0.01, z.delay), 0, 1), oc = enemy || z.vis.danger || z.team === 2 ? DANGER : col;
      ctx.globalAlpha = 0.16; X.circle(ctx, z.x, z.y, z.radius); X.fill(ctx, oc);
      ctx.globalAlpha = 0.34; X.circle(ctx, z.x, z.y, Math.max(0.05, z.radius * k)); X.fill(ctx, oc);
      ctx.globalAlpha = 0.95; X.circle(ctx, z.x, z.y, z.radius); X.stroke(ctx, oc, 0.14 + 0.08 * Math.sin(t * 18));
      ctx.globalAlpha = 1;
      return;
    }
    const life = z.dur > 0 ? U.clamp((z.dur - z.t) / 0.4, 0, 1) * U.clamp(z.t / 0.2, 0, 1) : 1;
    if (kind === 'frost' || kind === 'blizzard') {
      ctx.globalAlpha = 0.24 * life; X.circle(ctx, z.x, z.y, z.radius); X.fill(ctx, '#bfeaff');      // 밝은 돌바닥 위에서 하얗게 뜨지 않게 속은 옅게 (테두리와 얼음 금이 범위를 알려 준다)
      ctx.globalAlpha = 0.6 * life; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.07;
      const n = z.vis.small ? 3 : 7;
      for (let i = 0; i < n; i++) { const a = i * 2.4 + z.id, r = z.radius * (0.25 + (i % 3) * 0.22); ctx.beginPath(); ctx.moveTo(z.x + Math.cos(a) * r * 0.2, z.y + Math.sin(a) * r * 0.2); ctx.lineTo(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r); ctx.lineTo(z.x + Math.cos(a + 0.5) * r * 1.25, z.y + Math.sin(a + 0.5) * r * 1.25); ctx.stroke(); }
      ctx.globalAlpha = 0.85 * life; X.circle(ctx, z.x, z.y, z.radius); X.stroke(ctx, enemy ? DANGER : '#dff5ff', 0.1);
    } else if (kind === 'sticky') {
      ctx.globalAlpha = 0.42 * life; ctx.fillStyle = '#b8d84a';
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + z.id; X.circle(ctx, z.x + Math.cos(a) * z.radius * 0.45, z.y + Math.sin(a) * z.radius * 0.45, z.radius * 0.56); ctx.fill(); }
      ctx.globalAlpha = 0.8 * life; X.circle(ctx, z.x, z.y, z.radius); X.stroke(ctx, enemy ? DANGER : '#e6ff8a', 0.08);
    } else if (kind === 'whirl') {
      ctx.globalAlpha = 0.3 * life; X.circle(ctx, z.x, z.y, z.radius); X.fill(ctx, '#1f6f7c');
      ctx.strokeStyle = '#b8ffe9'; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) { const a0 = t * 3.2 + i * TAU / 4; ctx.globalAlpha = 0.6 * life; ctx.lineWidth = 0.2; ctx.beginPath(); for (let k = 0; k <= 14; k++) { const a = a0 + k * 0.2, r = z.radius * (1 - k / 16); if (k) ctx.lineTo(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r); else ctx.moveTo(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r); } ctx.stroke(); }
      ctx.globalAlpha = 0.9 * life; X.circle(ctx, z.x, z.y, z.radius); X.stroke(ctx, enemy ? DANGER : '#7dffd9', 0.13);
      const endK = U.clamp((z.t - (z.dur - 0.7)) / 0.7, 0, 1); if (endK > 0) { ctx.globalAlpha = 0.5 * endK; X.circle(ctx, z.x, z.y, 4); X.fill(ctx, enemy ? DANGER : '#b8ffe9'); }
    } else if (kind === 'orb') {
      ctx.globalAlpha = 0.3; X.ell(ctx, z.x, z.y, 0.7, 0.35); X.fill(ctx, '#05060f');
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 5 + z.id); ctx.setLineDash([0.5, 0.4]); X.circle(ctx, z.x, z.y, 4); X.stroke(ctx, enemy ? DANGER : '#ffd27a', 0.07); ctx.setLineDash([]);
    } else if (kind === 'moon') {
      ctx.globalAlpha = 0.28; X.ell(ctx, z.x, z.y, 2.6, 1.2); X.fill(ctx, '#05060f');
      ctx.globalAlpha = 0.75; X.circle(ctx, z.x, z.y, z.radius); X.stroke(ctx, enemy ? DANGER : '#fff2c4', 0.12);
      ctx.globalAlpha = 0.35; ctx.setLineDash([0.7, 0.5]); X.circle(ctx, z.x, z.y, 7.5); X.stroke(ctx, enemy ? DANGER : '#ffd27a', 0.08); ctx.setLineDash([]);
    } else if (kind === 'spin') {
      ctx.strokeStyle = col; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const a = t * 17 + i * TAU / 3; ctx.globalAlpha = 0.75; ctx.lineWidth = 0.26; ctx.beginPath(); ctx.arc(z.x, z.y - 0.6, z.radius * 0.9, a, a + 1.2); ctx.stroke(); }
      ctx.globalAlpha = 0.25; X.circle(ctx, z.x, z.y, z.radius); X.stroke(ctx, col, 0.08);
    } else if (kind === 'dark') {
      ctx.globalAlpha = 0.5 * life; X.circle(ctx, z.x, z.y, z.radius); X.stroke(ctx, '#b7a8ff', 0.16);
    }
    ctx.globalAlpha = 1;
  }
  function strikeGround(ctx, s, t) {
    const k = U.clamp(s.t / Math.max(0.01, s.delay), 0, 1), col = s.team === 2 || isEnemy(s) ? DANGER : (s.vis && s.vis.color) || '#ffffff', pulse = 0.12 + 0.07 * Math.sin(t * 18);
    if (s.shape === 'line') {
      const dx = s.x2 - s.x, dy = s.y2 - s.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d * s.hw, ny = dx / d * s.hw;
      const quad = (kk) => { ctx.beginPath(); ctx.moveTo(s.x + nx, s.y + ny); ctx.lineTo(s.x + dx * kk + nx, s.y + dy * kk + ny); ctx.lineTo(s.x + dx * kk - nx, s.y + dy * kk - ny); ctx.lineTo(s.x - nx, s.y - ny); ctx.closePath(); };
      ctx.globalAlpha = 0.16; quad(1); X.fill(ctx, col); ctx.globalAlpha = 0.34; quad(k); X.fill(ctx, col); ctx.globalAlpha = 0.95; quad(1); X.stroke(ctx, col, pulse);
    } else if (s.shape === 'cone') {
      ctx.globalAlpha = 0.16; X.pie(ctx, s.x, s.y, s.r, s.ang - s.half, s.ang + s.half); X.fill(ctx, col);
      ctx.globalAlpha = 0.34; X.pie(ctx, s.x, s.y, Math.max(0.05, s.r * k), s.ang - s.half, s.ang + s.half); X.fill(ctx, col);
      ctx.globalAlpha = 0.95; X.pie(ctx, s.x, s.y, s.r, s.ang - s.half, s.ang + s.half); X.stroke(ctx, col, pulse);
    } else {
      ctx.globalAlpha = 0.16; X.circle(ctx, s.x, s.y, s.r); X.fill(ctx, col); ctx.globalAlpha = 0.34; X.circle(ctx, s.x, s.y, Math.max(0.05, s.r * k)); X.fill(ctx, col); ctx.globalAlpha = 0.95; X.circle(ctx, s.x, s.y, s.r); X.stroke(ctx, col, pulse);
    }
    ctx.globalAlpha = 1;
  }
  /* 직선 표시(조준·시전 예고) */
  function lineInd(ctx, x, y, dx, dy, len, w, col, a, tipFrom, t) {
    const nx = -dy * w / 2, ny = dx * w / 2, ex = x + dx * len, ey = y + dy * len;
    ctx.globalAlpha = a * 0.2; ctx.beginPath(); ctx.moveTo(x + nx, y + ny); ctx.lineTo(ex + nx, ey + ny); ctx.lineTo(ex - nx, ey - ny); ctx.lineTo(x - nx, y - ny); ctx.closePath(); X.fill(ctx, col);
    if (tipFrom) { const bx = x + dx * tipFrom, by = y + dy * tipFrom; ctx.globalAlpha = a * 0.4; ctx.beginPath(); ctx.moveTo(bx + nx, by + ny); ctx.lineTo(ex + nx, ey + ny); ctx.lineTo(ex - nx, ey - ny); ctx.lineTo(bx - nx, by - ny); ctx.closePath(); X.fill(ctx, '#ffffff'); }
    ctx.globalAlpha = a * 0.9; ctx.strokeStyle = col; ctx.lineWidth = 0.1; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x + nx, y + ny); ctx.lineTo(ex + nx, ey + ny); ctx.moveTo(x - nx, y - ny); ctx.lineTo(ex - nx, ey - ny); ctx.stroke();
    // 흐르는 갈매기 무늬
    ctx.lineWidth = 0.12; ctx.globalAlpha = a * 0.7;
    const off = ((t || 0) * 9) % 2.2;
    for (let d = off; d < len - 0.3; d += 2.2) { const cx = x + dx * d, cy = y + dy * d; ctx.beginPath(); ctx.moveTo(cx + nx * 0.7 - dx * 0.45, cy + ny * 0.7 - dy * 0.45); ctx.lineTo(cx, cy); ctx.lineTo(cx - nx * 0.7 - dx * 0.45, cy - ny * 0.7 - dy * 0.45); ctx.stroke(); }
    ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(ex + nx, ey + ny); ctx.lineTo(ex + dx * w * 0.5, ey + dy * w * 0.5); ctx.lineTo(ex - nx, ey - ny); ctx.closePath(); X.fill(ctx, col);
    ctx.globalAlpha = 1;
  }
  /* 플레이어의 조준 표시 */
  function aimInd(ctx, t) {
    const a = W.aim, me = W.me; if (!a || !me || me.dead) return;
    const ab = a.ab, col = a.ok ? me.hd.glow : '#8a8fa8', mx = a.x, my = a.y;
    let dx = mx - me.x, dy = my - me.y, d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const ring = (r, al) => { ctx.globalAlpha = al; ctx.setLineDash([0.6, 0.45]); ctx.lineDashOffset = -t * 2; X.circle(ctx, me.x, me.y, r); X.stroke(ctx, col, 0.08); ctx.setLineDash([]); ctx.lineDashOffset = 0; };
    const ind = ab.ind;
    if (ab.type === 'charge') {
      const k = a.k || 0, len = ab.minRange + (ab.range - ab.minRange) * k;
      lineInd(ctx, me.x, me.y, dx, dy, ab.range, ab.width, '#6a6f8a', 0.35, 0, 0);
      lineInd(ctx, me.x, me.y, dx, dy, len, ab.width * (0.7 + 0.5 * k), k > 0.85 ? '#ffffff' : col, 0.95, 0, t);
      // 꿰어질 구슬 표시
      for (const z of W.G.zones) if (z.orb && z.src === me && !z.done && U.segDist(z.x, z.y, me.x, me.y, me.x + dx * len, me.y + dy * len) <= z.radius + 1.1 + (z.orb === 'moon' ? 1.6 : 0)) { ctx.globalAlpha = 0.9; X.circle(ctx, z.x, z.y, z.orb === 'moon' ? 7.5 : 4); X.stroke(ctx, '#ffffff', 0.14); ctx.globalAlpha = 0.15; ctx.fill(); }
    } else if (ind === 'line') lineInd(ctx, me.x, me.y, dx, dy, ab.range, ab.width, col, 0.95, ab.tip || 0, t);
    else if (ind === 'dash') {
      const p = M.rayWalk(me.x, me.y, me.x + dx * ab.range, me.y + dy * ab.range), len = Math.hypot(p.x - me.x, p.y - me.y);
      lineInd(ctx, me.x, me.y, dx, dy, Math.max(0.5, len), ab.width, col, 0.9, 0, t);
      ctx.globalAlpha = 0.85; X.circle(ctx, p.x, p.y, 1.0); X.stroke(ctx, col, 0.12);
      if (p.hit && ab.icon === 'ram') { ctx.globalAlpha = 0.9; X.circle(ctx, p.x + dx * 1.2, p.y + dy * 1.2, 0.5); X.fill(ctx, '#ffe0a8'); }
    } else if (ind === 'circle' || ind === 'blink') {
      ring(ab.range, 0.5);
      let tx = mx, ty = my; if (d > ab.range) { tx = me.x + dx * ab.range; ty = me.y + dy * ab.range; }
      if (ind === 'blink') { const p = M.nearestWalkable(tx, ty, 8); tx = p.x; ty = p.y; ctx.globalAlpha = 0.9; X.circle(ctx, tx, ty, 1.0); X.stroke(ctx, col, 0.14); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(tx, ty); X.stroke(ctx, col, 0.08); }
      else { ctx.globalAlpha = 0.2; X.circle(ctx, tx, ty, ab.radius); X.fill(ctx, col); ctx.globalAlpha = 0.95; X.stroke(ctx, col, 0.13); ctx.globalAlpha = 0.9; X.circle(ctx, tx, ty, 0.22); X.fill(ctx, '#ffffff'); }
    } else if (ind === 'cone') {
      const an = Math.atan2(dy, dx);
      ctx.globalAlpha = 0.22; X.pie(ctx, me.x, me.y, ab.range, an - ab.angle, an + ab.angle); X.fill(ctx, col); ctx.globalAlpha = 0.95; X.stroke(ctx, col, 0.12);
    } else if (ind === 'self') { ctx.globalAlpha = 0.16; X.circle(ctx, me.x, me.y, ab.radius || 3); X.fill(ctx, col); ring(ab.radius || 3, 0.95); }
    else if (ind === 'ally') {
      ring(ab.range, 0.5);
      const u = a.unit || me; ctx.globalAlpha = 0.95; X.circle(ctx, u.x, u.y, 1.5 + 0.12 * Math.sin(t * 9)); X.stroke(ctx, col, 0.16);
      if (u !== me) { ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(u.x, u.y); X.stroke(ctx, col, 0.08); }
    } else if (ind === 'fling') {
      ring(ab.grab, 0.8);
      const p = M.rayWalk(me.x, me.y, me.x + dx * ab.range, me.y + dy * ab.range);
      ctx.globalAlpha = 0.8; ctx.setLineDash([0.5, 0.4]); ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.quadraticCurveTo((me.x + p.x) / 2, (me.y + p.y) / 2 - 3, p.x, p.y); X.stroke(ctx, col, 0.12); ctx.setLineDash([]);
      ctx.globalAlpha = 0.25; X.circle(ctx, p.x, p.y, 2.6); X.fill(ctx, col); ctx.globalAlpha = 0.95; X.stroke(ctx, col, 0.12);
    }
    ctx.globalAlpha = 1;
  }

  D.ground = function (ctx) {
    const G = W.G, t = W.time, me = W.me;
    // 길잡이 등불
    for (const w of G.wards) {
      if (W.team >= 0 && w.team !== W.team && !W.visibleAt(w.x, w.y)) continue;
      const left = w.until - G.t, a = Math.min(1, left / 1.5);
      ctx.globalAlpha = 0.35 * a; ctx.setLineDash([0.7, 0.6]); X.circle(ctx, w.x, w.y, w.reveal); X.stroke(ctx, '#fff0b0', 0.08); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      W.light(w.x, w.y * K, 9, '#fff0b0', 0.6 * a);
    }
    for (const z of G.zones) { if (z.done || !W.onScreen(z.x, z.y, z.radius + 8)) continue; if (isEnemy(z) && !W.visibleAt(z.x, z.y) && !(me && U.dist(me.x, me.y, z.x, z.y) < z.radius + 3)) continue; zoneGround(ctx, z, t); }
    for (const s of G.strikes) if (!s.done) strikeGround(ctx, s, t);
    // 시전 예고선
    for (const e of W.teles) { const a = 1 - e.t / e.life; lineInd(ctx, e.x, e.y, e.dx, e.dy, e.len, e.w, e.col, 0.35 + 0.55 * a, 0, 0); }
    // 모으는 중인 빛줄기(누구든 보인다)
    for (const h of G.heroes) {
      if (!h.charge || h.dead || h === me || !shown(h)) continue;
      const ab = h.hd.abilities[h.charge.slot], k = h.chargeK(), len = ab.minRange + (ab.range - ab.minRange) * k;
      lineInd(ctx, h.x, h.y, Math.cos(h.facing), Math.sin(h.facing), len, ab.width * (0.7 + 0.5 * k), isEnemy(h) ? DANGER : h.hd.glow, 0.5 + 0.4 * k, 0, 0);
    }
    if (TW.Feel) TW.Feel.ground(ctx, t);       // 막타 고리 · 잔상 조준선 · 평타 박자 고리
    aimInd(ctx, t);
    // 이동/공격 지점 표시 (누른 그 프레임부터 또렷하게: 눌렀다는 것이 바로 보인다). 공격 표시는 대상을 따라간다
    const cm = W.click;
    if (cm && t - cm.t < 0.5 && t >= cm.t - 0.05) {
      const k = U.clamp((t - cm.t) / 0.5, 0, 1), cu = cm.unit && !cm.unit.dead ? cm.unit : null, cx = cu ? cu.x : cm.x, cy = cu ? cu.y : cm.y, col = cm.attack ? DANGER : '#eafff0';
      ctx.globalAlpha = (1 - k) * 0.25; X.circle(ctx, cx, cy, 0.55); X.fill(ctx, col);
      ctx.globalAlpha = 1 - k; X.circle(ctx, cx, cy, (cu ? cu.r * 1.5 : 0.35) + 1.0 * (1 - U.easeOut3(k))); X.stroke(ctx, col, 0.16);
      ctx.globalAlpha = 1;
    }
    // 신호(핑)
    for (const p of W.pings) { const k = (p.t % 1), a = Math.min(1, (p.life - p.t) / 0.5); ctx.globalAlpha = (1 - k) * a; X.circle(ctx, p.x, p.y, 0.6 + k * 3.2); X.stroke(ctx, p.color, 0.18); ctx.globalAlpha = a * 0.9; X.circle(ctx, p.x, p.y, 0.5); X.fill(ctx, p.color); ctx.globalAlpha = 1; }
    // 적 등불탑 사거리: 가까이 가면 보인다
    if (me && !me.dead) for (const s of G.structs) {
      if (s.team === me.team || s.dead) continue;
      const d = U.du(s, me); if (d > s.range + 7) continue;
      const hot = s.target === me, a = hot ? 0.9 : U.clamp((s.range + 7 - d) / 6, 0, 1) * 0.5;
      ctx.globalAlpha = a; ctx.setLineDash([0.8, 0.6]); ctx.lineDashOffset = -t * (hot ? 5 : 1.2); X.circle(ctx, s.x, s.y, s.range); X.stroke(ctx, hot ? DANGER : C.TEAM_LIGHT[s.team], hot ? 0.16 : 0.09); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      if (hot) { ctx.globalAlpha = 0.08; ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  };

  /* ---------- 유닛 (여기부터는 '선 좌표': x, y·K - 높이) ---------- */
  const list = [];
  /* t = 그릴 시각 (멈칫 중이면 굳은 시각). 때린 자세로 버티는 중(hAtk)이면 무기가 끝까지 뻗은 '닿은 순간'(0.3)에 머문다 */
  function heroPose(h, s, t) {
    const aw = s.atkW / 0.3, a = s.hAtk && s.hold > 0 ? 0.3 : (t - s.atkT0) / Math.max(0.2, aw);
    const cd = Math.max(0.3, s.castDur + 0.22), c = (t - s.castT0) / cd;
    return {
      f: s.f, t: t + h.id, walk: s.frz ? s.wp : h.walkPhase, mv: h.moving ? 1 : 0, atk: a >= 0 && a < 1 ? a : -1, atkW: 0.3, atkN: s.atkN,
      cast: (c >= 0 && c < 1) || h.channel ? (h.channel ? 0.5 : c) : -1, slot: s.castSlot, dash: h.dash ? (h.dash.o.kind || 'dash') : null,
      charge: h.charge ? h.chargeK() : -1, team: h.team, seed: h.id,
      st: { ambush: !!h.st.ambush, heat: h.heroId === 'bulti' ? ((h.getBuff('heat') || {}).stacks || 0) : 0 },
      chanSpin: h.deflect > 0 ? t * 26 : 0,
    };
  }
  /* 상태 표시. (x, y) = 발밑, q = 몸집 배율 */
  function statusFx(ctx, u, x, y, t, s, a, q) {
    const bs = u.buffs; if (!bs.length && !u.recall) return;
    let shield = null;
    for (let i = 0; i < bs.length; i++) { const b = bs[i]; if (b.shield > 0) shield = b; if (b.camp) campAura(ctx, u, x, y, t, b, q); }
    if (shield) {
      const col = shield.color || '#dff5ff', pk = 0.75 + 0.25 * Math.sin(t * 6);
      ctx.globalAlpha = 0.1 * a; X.ell(ctx, x, y - 1.25 * q, 1.6 * q, 1.8 * q); X.fill(ctx, col);
      ctx.globalAlpha = 0.8 * a * pk; X.stroke(ctx, col, 0.1);
      ctx.globalAlpha = 1; W.glow(x, y - 1.25 * q, 2.5 * q, col, 0.22 * a);
    }
    if (u.frozen) {
      ctx.globalAlpha = 0.6 * a; ctx.fillStyle = '#cdefff';
      X.poly(ctx, [x - 1.2 * q, y + 0.1, x - 1.4 * q, y - 1.6 * q, x - 0.55 * q, y - 2.9 * q, x + 0.45 * q, y - 3.05 * q, x + 1.35 * q, y - 1.8 * q, x + 1.15 * q, y + 0.1]); ctx.fill();
      ctx.globalAlpha = 0.9 * a; X.stroke(ctx, '#ffffff', 0.08);
      ctx.beginPath(); ctx.moveTo(x - 0.55 * q, y - 2.9 * q); ctx.lineTo(x - 0.2 * q, y - 1.4 * q); ctx.lineTo(x + 0.45 * q, y - 3.05 * q); ctx.stroke();
      ctx.globalAlpha = 1; W.glow(x, y - 1.2 * q, 2.2 * q, '#9fdcff', 0.4 * a);
    } else if (u.stunned && !u.airborne) {
      for (let i = 0; i < 3; i++) { const an = t * 5.5 + i * TAU / 3, sx = x + Math.cos(an) * 0.75 * q, sy = y - 3.2 * q + Math.sin(an) * 0.24; X.star(ctx, sx, sy, 0.26, 4, 0.4, t * 3); ctx.fillStyle = '#ffe680'; ctx.globalAlpha = a; ctx.fill(); W.glow(sx, sy, 0.6, '#ffe680', 0.6 * a); }
      ctx.globalAlpha = 1;
    }
    if (u.rooted && !u.stunned) { ctx.strokeStyle = '#7fc86a'; ctx.lineWidth = 0.13; ctx.lineCap = 'round'; ctx.globalAlpha = a; for (let i = 0; i < 4; i++) { const an = i * TAU / 4 + 0.4; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * 1.0 * q, y + Math.sin(an) * 0.6 * q); ctx.quadraticCurveTo(x + Math.cos(an) * 0.2, y - 0.9 * q, x + Math.cos(an + 1) * 0.5 * q, y - 0.5 * q + Math.sin(an) * 0.2); ctx.stroke(); } ctx.globalAlpha = 1; }
    if (u.taunter) { ctx.strokeStyle = '#7dffd9'; ctx.lineWidth = 0.1; ctx.globalAlpha = a; ctx.beginPath(); for (let k = 0; k <= 12; k++) { const an = t * 8 + k * 0.5, r = 0.1 + k * 0.035; if (k) ctx.lineTo(x + Math.cos(an) * r, y - 3.3 * q + Math.sin(an) * r); else ctx.moveTo(x + Math.cos(an) * r, y - 3.3 * q + Math.sin(an) * r); } ctx.stroke(); ctx.globalAlpha = 1; W.glow(x, y - 3.3 * q, 0.8, '#7dffd9', 0.5 * a); }
    if (u.slowPct > 0.05 && !u.frozen) { ctx.strokeStyle = '#9fdcff'; ctx.lineWidth = 0.09; ctx.globalAlpha = 0.75 * a; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * 0.55 - 0.2, y + 0.18); ctx.lineTo(x + i * 0.55, y + 0.36); ctx.lineTo(x + i * 0.55 + 0.2, y + 0.18); ctx.stroke(); } ctx.globalAlpha = 1; }
    if (u.recall) {
      const k = u.recall.t / C.RECALL_TIME, col = C.TEAM_LIGHT[u.team];
      ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(x, y, 1.7, 1.7 * K, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k); X.stroke(ctx, col, 0.16);
      ctx.globalAlpha = 0.3; X.ell(ctx, x, y, 1.7, 1.7 * K); X.stroke(ctx, col, 0.06); ctx.globalAlpha = 1;
      W.glow(x, y - 1 - k * 1.5, 1.6 + k * 1.5, col, 0.25 + 0.4 * k);
    }
  }
  function campAura(ctx, u, x, y, t, b, q) {
    const col = b.color, n = b.camp === 'boss' ? 5 : 3, sp = b.camp === 'boss' ? 1.6 : 2.6;
    for (let i = 0; i < n; i++) {
      const an = t * sp + i * TAU / n, up = b.camp === 'fire' ? ((t * 1.4 + i * 0.37) % 1) * 1.4 : 0.3 + Math.sin(t * 3 + i) * 0.15;
      W.glow(x + Math.cos(an) * 1.3 * q, y + Math.sin(an) * 1.3 * q * K - up * q, 0.44, col, 0.75);
    }
    ctx.globalAlpha = 0.5; X.ell(ctx, x, y, 1.4 * q, 1.4 * q * K); X.stroke(ctx, col, 0.07); ctx.globalAlpha = 1;
  }
  D.units = function (ctx) {
    const G = W.G, al = W.alpha;
    list.length = 0;
    const us = G.units;
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (u.dead) continue;                  // 꺼진 구조물은 아래에서 G.structs 로 따로 넣는다
      const x = u.px + (u.x - u.px) * al, y = u.py + (u.y - u.py) * al;
      if (!W.onScreen(x, y, u.isStruct ? 9 : u.isMonster ? 8 : 5)) continue;
      const s = vs(u), vis = shown(u);
      s.a += ((vis ? 1 : 0) - s.a) * 0.3;
      if (s.a < 0.03) continue;
      s.x = x; s.y = y;
      list.push(u);
    }
    // 꺼진 등불탑은 유닛 목록에서 빠지므로 따로 넣는다 (부서진 모습으로 남는다)
    for (const st of G.towers) if (st.dead && W.onScreen(st.x, st.y, 9)) { const s = vs(st); s.a = 1; s.x = st.x; s.y = st.y; list.push(st); }
    for (const st of G.cores) if (st.dead && W.onScreen(st.x, st.y, 9)) { const s = vs(st); s.a = 1; s.x = st.x; s.y = st.y; list.push(st); }
    // 내가 쓰러뜨린 것: 터지기 직전 0.1초쯤 굳은 채 하얗게 번쩍이며 남아 있다 (worldfx.js corpses)
    const cps = W.corpses || [];
    for (let i = 0; i < cps.length; i++) { const u = cps[i].u; if (!u.dead || u.isStruct) continue; const s = W.vis.get(u.id); if (!s || s.a < 0.03 || !W.onScreen(s.x, s.y, 5)) continue; s.used = W.frame; list.push(u); }
    for (const l of M.lamps) if (W.onScreen(l.x, l.y, 8)) list.push({ lamp: true, x: l.x, y: l.y, id: 0 });
    for (const h of G.heroes) if (h.dead && h.deathX !== undefined && W.onScreen(h.deathX, h.deathY, 3) && shown(h) && !(W.corpseOf && W.corpseOf(h))) list.push({ tomb: h, x: h.deathX, y: h.deathY });
    list.sort((a, b) => (a.lamp || a.tomb ? a.y : W.vis.get(a.id).y) - (b.lamp || b.tomb ? b.y : W.vis.get(b.id).y));
    drawUnits(ctx, false);
  };

  /* 영웅은 종이 인형처럼 짙은 테두리를 둘러 그린다 (배경·미니언·빛무리와 섞이지 않게).
     임시 캔버스에 한 번 그리고 → 실루엣을 사방으로 조금씩 밀어 찍은 뒤 → 그 위에 본 그림을 얹는다. */
  const BX = 3.4, BT = 3.9, BB = 0.9, OUTLINE = '#070b1e', EDGE = C.TEAM_COL;      // 테두리: 진영 색 (같은 영웅이 양쪽에 있어도 한눈에 가린다). 내 영웅은 흰색
  const RING = [1, 0, -1, 0, 0, 1, 0, -1, 0.7, 0.7, -0.7, 0.7, 0.7, -0.7, -0.7, -0.7];
  let sprA = null, sprB = null;
  /* tn = 맞은 순간의 번쩍 세기(0~1) · tcol = 그 빛깔: 그림 모양 그대로 덮어 찍는다 (테두리 실루엣은 그대로) */
  function drawHero(ctx, u, pose, glow, a, edge, thick, tn, tcol) {
    if (W.quality < 0.55 || pose.dash === 'roll') { ctx.globalAlpha = a; Art.hero(ctx, u.heroId, pose, glow); ctx.globalAlpha = 1; return; }
    const ps = Math.max(8, Math.ceil(W.S * W.cam.zoom * HS)), w = Math.ceil(BX * 2 * ps) + 6, h = Math.ceil((BT + BB) * ps) + 6;
    if (!sprA || sprA.width !== w || sprA.height !== h) { sprA = X.canvas(w, h); sprB = X.canvas(w, h); sprA.scratch = sprB.scratch = true; }      // scratch: 매 프레임 다시 그리는 임시 캔버스라는 표시
    const ca = sprA.getContext('2d');
    ca.setTransform(1, 0, 0, 1, 0, 0); ca.globalAlpha = 1; ca.globalCompositeOperation = 'source-over'; ca.clearRect(0, 0, w, h);
    ca.setTransform(ps, 0, 0, ps, 3 + BX * ps, 3 + BT * ps);
    Art.hero(ca, u.heroId, pose, glow);
    if (tn > 0.02) { ca.setTransform(1, 0, 0, 1, 0, 0); ca.globalCompositeOperation = 'source-atop'; ca.globalAlpha = Math.min(1, tn); ca.fillStyle = tcol || '#ffffff'; ca.fillRect(0, 0, w, h); ca.globalCompositeOperation = 'source-over'; ca.globalAlpha = 1; }
    const cb = sprB.getContext('2d');
    cb.setTransform(1, 0, 0, 1, 0, 0); cb.globalAlpha = 1; cb.globalCompositeOperation = 'source-over'; cb.clearRect(0, 0, w, h);
    cb.drawImage(sprA, 0, 0);
    cb.globalCompositeOperation = 'source-atop'; cb.fillStyle = edge; cb.fillRect(0, 0, w, h); cb.globalCompositeOperation = 'source-over';
    const x0 = -BX - 3 / ps, y0 = -BT - 3 / ps, dw = w / ps, dh = h / ps, o = Math.max(1.6, ps * 0.045) / ps * (thick ? 1.5 : 1);
    ctx.globalAlpha = a * 0.92;
    for (let i = 0; i < RING.length; i += 2) ctx.drawImage(sprB, x0 + RING[i] * o, y0 + RING[i + 1] * o, dw, dh);
    ctx.globalAlpha = a;
    ctx.drawImage(sprA, x0, y0, dw, dh);
    ctx.globalAlpha = 1;
  }

  /* 미니언·몬스터의 번쩍: 그림을 임시 캔버스에 한 번 그리고 그 모양 그대로(source-atop) 빛깔을 덮어 찍는다. 맞은 직후 몇 프레임만 이 길로 그린다.
     ctx 는 지금 유닛의 발밑 기준(로컬 좌표). (hw, top, bot) = 로컬 단위의 그림 상자 · ps = 로컬 1 단위의 화면 화소 수 · k = 세기 */
  let tcv = null;
  function tinted(ctx, hw, top, bot, ps, k, col, draw) {
    ps = U.clamp(ps, 4, 90);
    const w = Math.ceil(hw * 2 * ps) + 4, h = Math.ceil((top + bot) * ps) + 4;
    if (!tcv || tcv.width < w || tcv.height < h) { tcv = X.canvas(Math.max(w, tcv ? tcv.width : 0), Math.max(h, tcv ? tcv.height : 0)); tcv.scratch = true; }
    const c = tcv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, w, h);
    c.setTransform(ps, 0, 0, ps, 2 + hw * ps, 2 + top * ps);
    draw(c);
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = Math.min(1, k); c.fillStyle = col; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    ctx.drawImage(tcv, 0, 0, w, h, -hw - 2 / ps, -top - 2 / ps, w / ps, h / ps);
  }

  /* 구조물은 키가 커서 나무보다 나중에(위에) 그린다 */
  function drawUnits(ctx, structPass) {
    const G = W.G, t = W.time, me = W.me, dtF = 1 / 60;
    if (!structPass) {
      // 그림자·발밑 고리 (땅에 누운 원 → 화면에서는 가로 r, 세로 r·K 타원)
      for (let i = 0; i < list.length; i++) {
        const u = list[i]; if (u.lamp || u.tomb || u.isStruct) continue;
        const s = W.vis.get(u.id), z = u.z || (u.airborne ? Math.sin(Math.min(1, ((u.getBuff('air') || { t: 0, dur: 1 }).t / (u.getBuff('air') || { dur: 1 }).dur)) * Math.PI) * 1.5 : 0);
        s.z = z;
        const gy = s.y * K, r = u.r * (u.isHero ? 1.2 : 1) * (1 - Math.min(0.5, z * 0.12));
        ctx.globalAlpha = 0.38 * s.a; X.ell(ctx, s.x + 0.12, gy + 0.05, r * 1.05, r * 0.62); X.fill(ctx, '#03040c');
        if (u.isHero) {
          const col = teamCol(u), isMe = u === me, R = 1.3;
          ctx.globalAlpha = 0.2 * s.a; X.ell(ctx, s.x, gy, R, R * K); X.fill(ctx, col);                     // 발밑에 고인 진영 빛
          ctx.globalAlpha = (isMe ? 0.95 : 0.8) * s.a; X.stroke(ctx, isMe ? '#ffffff' : col, isMe ? 0.13 : 0.11);
          if (isMe) {
            const fx = Math.cos(s.f), fy = Math.sin(s.f);
            ctx.globalAlpha = 0.85; X.ell(ctx, s.x, gy, R + 0.24, (R + 0.24) * K); X.stroke(ctx, col, 0.07);
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(s.x + fx * 2.05, gy + fy * 2.05 * K); ctx.lineTo(s.x + fx * 1.56 - fy * 0.3, gy + (fy * 1.56 + fx * 0.3) * K); ctx.lineTo(s.x + fx * 1.56 + fy * 0.3, gy + (fy * 1.56 - fx * 0.3) * K); ctx.closePath(); ctx.fill();
          }
        }
        if (u === W.hover && u !== me && !u.isHero) { ctx.globalAlpha = 0.9; X.ell(ctx, s.x, gy, u.r * 1.45 + 0.2, (u.r * 1.45 + 0.2) * K); X.stroke(ctx, isEnemy(u) || u.team === 2 ? DANGER : '#9dffb0', 0.11); }
      }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (!!u.isStruct !== structPass) continue;
      if (u.lamp) {
        const col = W.tint('lamp'), f = W.fogAt(u.x, u.y), ly = u.y * K;
        ctx.save(); ctx.translate(u.x, ly); ctx.scale(1.2, 1.2); Art.lamp(ctx, col, t + u.x, (lx, yy, r, c, a) => W.glow(u.x + lx * 1.2, ly + yy * 1.2, r * 1.2, c, a * (0.45 + 0.55 * f))); ctx.restore();
        W.light(u.x + 0.4, ly - 0.9, 7.5, col, 0.42 + 0.3 * f);
        continue;
      }
      if (u.tomb) {       // 쓰러진 자리: 꺼진 등
        const h = u.tomb, col = C.TEAM_COL[h.team], ty = u.y * K;
        ctx.globalAlpha = 0.85; X.ell(ctx, u.x, ty, 0.8, 0.8 * K * 0.7); X.fill(ctx, 'rgba(5,6,15,0.5)');
        X.rr(ctx, u.x - 0.34, ty - 1.02, 0.68, 0.96, 0.16); X.fill(ctx, '#3a3c52'); X.rr(ctx, u.x - 0.22, ty - 0.86, 0.44, 0.6, 0.12); X.fill(ctx, U.rgba(col, 0.35 + 0.25 * Math.sin(t * 2)));
        ctx.globalAlpha = 1; W.glow(u.x, ty - 0.6, 1.0, col, 0.25);
        continue;
      }
      const s = W.vis.get(u.id), x = s.x, y = s.y * K, z = s.z || 0, a = s.a * (u.bush && u.team === W.team && !u.isStruct ? 0.72 : 1);
      // 화면용 값 갱신 (멈칫 중에는 바라보는 방향도 굳힌다)
      if (!s.frz) s.f = U.angLerp(s.f, u.facing, 0.3);
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dtF * 5); if (s.punch > 0) s.punch = Math.max(0, s.punch - dtF * 6);
      s.kx *= 0.8; s.ky *= 0.8;
      if (u.hp < s.hpLag) s.hpLag = Math.max(u.hp, s.hpLag - Math.max(u.maxHp * 0.5, (s.hpLag - u.hp) * 3) * dtF); else s.hpLag = u.hp;
      // 멈칫 중의 떨림: 맞은 방향으로 약 28Hz, 멈칫이 끝나 갈수록 잦아든다
      let jx = 0, jy = 0;
      if (s.hold > 0 && s.shk > 0) { const el = s.holdL - s.hold, k = U.clamp(s.hold / Math.max(0.001, s.holdL), 0, 1), sg = Math.cos(el * 176); jx = s.hdx * s.shk * k * sg; jy = s.hdy * s.shk * k * sg * K; }
      const ox = x + s.kx + jx, oy = y + s.ky + jy - z, tt = s.frz ? s.ht : t, tn = s.tint > 0 ? W.tintOf(s) : 0;      // tt: 그릴 시각(굳었으면 굳은 시각) · tn: 번쩍 세기
      const glow = (S) => (lx, ly, r, c, ga) => W.glow(ox + lx * S, oy + ly * S, r * S, c, ga * a);
      let q = 1;
      ctx.save();
      ctx.translate(ox, oy);
      if (s.fl) ctx.rotate(s.fl);           // 맞은 반대쪽으로 젖혀진다 (발밑을 축으로)
      if (s.punch > 0.01) ctx.scale(1 + s.punch * 0.22, 1 - s.punch * 0.18);
      ctx.globalAlpha = a;
      if (u.isHero) {
        q = HS / 1.3;
        ctx.scale(HS, HS);
        { const hot = u === W.hover && u !== me, hit = s.flash > 0.4; drawHero(ctx, u, heroPose(u, s, tt), glow(HS), a, hit ? '#ffffff' : hot ? (isEnemy(u) ? DANGER : '#9dffb0') : u === me ? '#ffffff' : EDGE[u.team] || OUTLINE, hot || hit, tn, s.tintCol); }
        W.light(x, y - 1.3, 8.5, C.TEAM_LIGHT[u.team], 0.6 * a);
        if (u.moving && M.isWater(s.x, s.y) && t - s.rip > 0.22) { s.rip = t; FX.ring(s.x, s.y, 0.3, 1.3, 0.5, '#d6fff2', 0.08, 'ground'); }
      } else if (u.isMinion) {
        const aw = s.atkW / 0.3, ak = s.hAtk && s.hold > 0 ? 0.3 : (tt - s.atkT0) / Math.max(0.2, aw);
        const ms = u.emp ? 1.22 : 1.02; q = 0.6; ctx.scale(ms, ms);
        const mp = { f: s.f, t: tt + u.id, walk: s.frz ? s.wp : u.walkPhase, mv: u.moving ? 1 : 0, atk: ak >= 0 && ak < 1 ? ak : -1, emp: u.emp }, mg = (lx, ly, r, c, ga) => W.glow(ox + lx * ms, oy + ly * ms, r * ms, c, ga * a * 0.6);
        if (tn > 0.02 && W.quality >= 0.55) tinted(ctx, 2.0, 3.3, 0.8, W.scale() * ms, tn, s.tintCol, (c) => Art.minion(c, u.kind, u.team, mp, mg));
        else Art.minion(ctx, u.kind, u.team, mp, mg);
        W.light(x, y - 0.6, u.kind === 'siege' ? 3.4 : 2.2, C.TEAM_LIGHT[u.team], 0.16 * a);
      } else if (u.isMonster) {
        const aw = s.atkW / 0.3, ak = s.hAtk && s.hold > 0 ? 0.3 : (tt - s.atkT0) / Math.max(0.2, aw);
        q = U.clamp(u.r, 0.7, 1.7); ctx.scale(MS, MS);
        const mp = { f: s.f, t: tt + u.id * 0.37, walk: s.frz ? s.wp : u.walkPhase, mv: u.moving ? 1 : 0, atk: ak >= 0 && ak < 1 ? ak : -1, seed: u.id, rage: u.kind === 'boss' && u.hp < u.maxHp * 0.5 };
        if (tn > 0.02 && W.quality >= 0.55) tinted(ctx, 1.4 + u.r * 1.9, 1.6 + u.r * 3.0, 0.7 + u.r * 0.6, W.scale() * MS, tn, s.tintCol, (c) => Art.monster(c, u.kind, mp, glow(MS)));
        else Art.monster(ctx, u.kind, mp, glow(MS));
        if (u.kind === 'boss') W.light(x, y - 1, 12, '#7dffd9', 0.5 * a); else if (u.buffKind) W.light(x, y - 1, 5.5, u.buffKind === 'fire' ? '#ff9a50' : '#6fd8ff', 0.5 * a); else if (u.kind === 'elder') W.light(x, y - 2, 6, '#9fe07a', 0.4 * a);
      } else if (u.isStruct) {
        const shot = Math.max(0, 1 - (t - s.shotT) / 0.3), fa = u.team === W.team ? 1 : (0.5 + 0.5 * W.fogAt(u.x, u.y));
        const sg = (lx, ly, r, c, ga) => W.glow(x + lx * ST, y + ly * ST, r * ST, c, ga * fa);
        ctx.scale(ST, ST);
        if (u.kind === 'core') { Art.core(ctx, u.team, { t, hp: u.hp / u.maxHp, dead: u.dead }, sg); if (!u.dead) W.light(x, y - 2.4, 15, C.TEAM_LIGHT[u.team], 0.9 * fa); }
        else { Art.tower(ctx, u.tier, u.team, { t: t + u.id, hp: u.hp / u.maxHp, dead: u.dead, shot }, sg); if (!u.dead) W.light(x, y - 1.8, 11.5, C.TEAM_LIGHT[u.team], 0.85 * fa); }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      if (!u.isStruct) statusFx(ctx, u, ox, oy, t, s, a, q);
      if (s.flash > 0.02 && !u.isHero) W.glow(x, y - (u.isStruct ? 2.4 : 0.7) - z, (u.isStruct ? 2.6 : u.r * 1.5), '#ffffff', s.flash * (u.isStruct ? 0.3 : 0.24) * a);      // 맞는 순간의 번쩍임. 영웅은 흰 빛 대신 테두리가 굵고 하얗게 번쩍인다 (몸이 뭉개지지 않게)
      // 끌려가는 사슬
      if (u.disp && u.disp.chain && u.disp.src) { const src = u.disp.src; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(src.x, src.y * K - 1.0); ctx.lineTo(x, y - 1.0); X.stroke(ctx, '#8fb8b0', 0.12); ctx.globalAlpha = 1; W.glow(x, y - 1.0, 1.0, '#7dffd9', 0.5); }
    }
    ctx.globalAlpha = 1;
    // 오래된 화면 상태 정리
    if (structPass && W.frame % 180 === 0) for (const [id, s] of W.vis) if (s.used < W.frame - 240) W.vis.delete(id);
  }

  /* ---------- 유닛 위를 덮는 것: 구조물 · 연막 · 어둠 ---------- */
  D.above = function (ctx) {
    const G = W.G, t = W.time;
    drawUnits(ctx, true);
    for (const z of G.zones) {
      if (z.done || !z.active || !W.onScreen(z.x, z.y, z.radius + 4)) continue;
      const life = U.clamp((z.dur - z.t) / 0.5, 0, 1) * U.clamp(z.t / 0.25, 0, 1), zy = z.y * K;
      if (z.vis.kind === 'smoke') {
        for (let i = 0; i < 9; i++) { const a = i * 0.7 + z.id + t * 0.25 * (i % 2 ? 1 : -1), r = z.radius * (i === 0 ? 0 : 0.55), pr = z.radius * (0.62 + 0.12 * Math.sin(t * 1.3 + i)); X.soft(ctx, z.x + Math.cos(a) * r, zy + Math.sin(a) * r * K - 0.8, pr, i % 2 ? '#3a3260' : '#57508a', 0.6 * life); }
        ctx.globalAlpha = 1;
      } else if (z.vis.kind === 'dark') {
        ctx.globalAlpha = 0.42 * life; X.ell(ctx, z.x, zy, z.radius, z.radius * K); X.fill(ctx, '#0a0620'); ctx.globalAlpha = 1;
      } else if (z.vis.kind === 'blizzard' || (z.vis.kind === 'frost' && !z.vis.small)) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 10; i++) { const h = U.hash2(i, z.id, 3), a = t * (0.8 + h) + i * 1.9, r = z.radius * (0.2 + 0.75 * U.hash2(i, z.id, 4)); ctx.globalAlpha = 0.7 * life; X.circle(ctx, z.x + Math.cos(a) * r, zy + Math.sin(a) * r * K - 0.5 - ((t * 1.5 + h * 3) % 1.5), 0.09); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
  };

  /* ---------- 빛으로 그리는 것: 투사체·구슬·조준선 ---------- */
  function proj(ctx, p, t) {
    const v = p.vis, kind = v.kind, col = v.color || '#ffffff', sz = v.size || 1, c = Math.cos(p.ang), sn = Math.sin(p.ang), s = sn * K;      // (c, s) = 땅 위의 진행 방향을 화면에 눕힌 것, (-sn, c·K) = 그 옆 방향
    const up = kind === 'wave' ? 0 : 1.0, x = p.x, y = p.y * K - up, by = p.y - up;      // by: 효과(FX)에 넘기는 땅 좌표
    const enemy = p.skill && (isEnemy(p) || p.team === 2);
    if (enemy) { ctx.globalAlpha = 0.85; X.ell(ctx, p.x, p.y * K, p.radius + 0.25, (p.radius + 0.25) * K); X.stroke(ctx, DANGER, 0.1); ctx.globalAlpha = 1; }
    const streak = (len, w) => { ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.globalAlpha = 0.9; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x - c * len, y - s * len); ctx.lineTo(x, y); ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w * 0.45; ctx.beginPath(); ctx.moveTo(x - c * len * 0.5, y - s * len * 0.5); ctx.lineTo(x, y); ctx.stroke(); };
    switch (kind) {
      case 'bolt': streak(1.3 * sz, 0.16 * sz); X.glow(ctx, x, y, 0.75 * sz, col, 0.8); break;
      case 'firebolt': streak(2.4, 0.3); X.glow(ctx, x, y, 1.5, col, 0.9); if ((W.frame & 1) === 0) FX.spark(x - c, by - sn, -c * 3 + (FX.rnd() - 0.5) * 3, -sn * 3 + (FX.rnd() - 0.5) * 3, 0.25, col, 0.1, 2); break;
      case 'mbolt': X.glow(ctx, x, y, 0.5, col, 0.9); break;
      case 'siege': X.glow(ctx, x, y, 1.0, '#ffb060', 0.9); X.glow(ctx, x, y, 0.45, '#ffffff', 0.9); break;
      case 'tower': streak(1.6, 0.26); X.glow(ctx, x, y, 1.35, col, 0.95); X.glow(ctx, x, y, 0.5, '#ffffff', 0.9); break;
      case 'wisp': { const w = Math.sin(t * 14 + p.id) * 0.25; X.glow(ctx, x - sn * w, y + c * w * K, 0.85, col, 0.9); X.glow(ctx, x - sn * w, y + c * w * K, 0.32, '#ffffff', 0.9); break; }
      case 'shard': case 'icicle': {
        const l = kind === 'icicle' ? 1.3 : 0.7, wd = kind === 'icicle' ? 0.3 : 0.2;
        ctx.globalAlpha = 0.95; ctx.fillStyle = '#eaf8ff'; ctx.beginPath(); ctx.moveTo(x + c * l, y + s * l); ctx.lineTo(x - sn * wd, y + c * wd * K); ctx.lineTo(x - c * l * 0.7, y - s * l * 0.7); ctx.lineTo(x + sn * wd, y - c * wd * K); ctx.closePath(); ctx.fill();
        X.glow(ctx, x, y, kind === 'icicle' ? 1.2 : 0.7, col, 0.7); break;
      }
      case 'mote': ctx.globalAlpha = 1; X.star(ctx, x, y, 0.34, 4, 0.35, t * 6); X.fill(ctx, '#ffffff'); X.glow(ctx, x, y, 0.8, col, 0.8); break;
      case 'dust': for (let i = 0; i < 5; i++) { const o = (i - 2) * 0.5, w = Math.sin(t * 9 + i * 1.7) * 0.25; X.glow(ctx, x - sn * o - c * Math.abs(o) * 0.5 + w * c, y + c * o * K - s * Math.abs(o) * 0.5, 0.75, col, 0.75); } if ((W.frame & 1) === 0) FX.spark(x + (FX.rnd() - 0.5) * 2, by + (FX.rnd() - 0.5) * 2, 0, -1, 0.4, '#fff8dc', 0.09, 1); break;
      case 'crescent': {
        const rot = t * 20 * (p.returning ? -1 : 1);
        ctx.save(); ctx.translate(x, y); ctx.scale(1, K); ctx.rotate(rot); ctx.globalAlpha = 0.95; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(0, 0, 0.95, -1.9, 1.9); ctx.arc(-0.42, 0, 0.8, 1.25, -1.25, true); ctx.closePath(); ctx.fill(); ctx.restore();
        X.glow(ctx, x, y, 1.6, col, 0.75); if (W.frame % 3 === 0) FX.glow(x, by, 0.7, 0.2, 0.22, col, 0.5); break;
      }
      case 'wave': {
        const a0 = p.ang - 1.0, a1 = p.ang + 1.0;
        ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.globalAlpha = 0.9; ctx.lineWidth = 0.42; ctx.beginPath(); ctx.ellipse(x - c * 1.2, y - s * 1.2, 1.9, 1.9 * K, 0, a0, a1); ctx.stroke();
        ctx.globalAlpha = 0.5; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.ellipse(x - c * 2.1, y - s * 2.1, 1.7, 1.7 * K, 0, a0 + 0.2, a1 - 0.2); ctx.stroke();
        X.glow(ctx, x, y, 2.2, col, 0.5); if ((W.frame & 1) === 0) FX.shards(x, p.y, 1, '#b9a88a', 4); break;
      }
      case 'hook': {
        const src = p.src;
        ctx.globalAlpha = 0.9; ctx.strokeStyle = '#a8d8cc'; ctx.lineWidth = 0.1; ctx.setLineDash([0.3, 0.2]); ctx.beginPath(); ctx.moveTo(src.x, src.y * K - 1.0); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(s, c)); ctx.strokeStyle = '#eafff6'; ctx.lineWidth = 0.18; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-0.5, 0); ctx.lineTo(0.45, 0); ctx.arc(0.2, 0, 0.45, 0, 2.4); ctx.stroke(); ctx.restore();
        X.glow(ctx, x, y, 1.2, col, 0.7); break;
      }
      case 'ember': X.glow(ctx, x, y, 1.1, '#ff8a3c', 0.9); X.glow(ctx, x, y, 0.45, '#fff0c0', 0.9); if (W.frame % 3 === 0) FX.spark(x, by, (FX.rnd() - 0.5) * 2, -1.5, 0.35, '#ffb347', 0.1, 1); break;
      case 'spit': streak(1.4, 0.3); X.glow(ctx, x, y, 1.3, col, 0.9); break;
      default: X.glow(ctx, x, y, 0.7 * sz, col, 0.9);
    }
    ctx.globalAlpha = 1;
  }
  D.addPass = function (ctx) {
    const G = W.G, t = W.time, me = W.me;
    for (const p of G.projs) {
      if (p.done || !W.onScreen(p.x, p.y, 4)) continue;
      if (W.team >= 0 && p.team !== W.team && !W.visibleAt(p.x, p.y)) continue;
      X.glowK = W.lumK(p.x, p.y * K - 1, 1.1, 0.7);        // 빛이 몰린 자리에서는 투사체의 빛무리도 줄인다 (알맹이는 그대로 보인다)
      proj(ctx, p, t);
      W.lights.push(p.x, p.y * K, p.skill ? 3.2 : 1.6, p.vis.color || '#ffffff', p.skill ? 0.4 : 0.2);
    }
    for (const z of G.zones) {
      if (z.done || !W.onScreen(z.x, z.y, z.radius + 6)) continue;
      if (isEnemy(z) && !W.visibleAt(z.x, z.y)) continue;
      const k = z.vis.kind, zy = z.y * K;
      X.glowK = W.lumK(z.x, zy - 1, 2, 0.5);
      if (z.lob && !z.active) {          // 던져서 날아가는 중
        const kk = U.clamp(z.t / Math.max(0.01, z.delay), 0, 1), x = U.lerp(z.lob.x, z.x, kk), y = U.lerp(z.lob.y, z.y, kk) * K - 1.0 - Math.sin(kk * Math.PI) * 3.4;
        X.glow(ctx, x, y, k === 'smoke' ? 0.6 : 0.85, z.vis.color, 0.9); X.glow(ctx, x, y, 0.3, '#ffffff', 0.9);
        continue;
      }
      if (!z.active) continue;
      if (k === 'orb') {
        const bob = Math.sin(t * 3 + z.id) * 0.15, left = z.dur - z.t, a = left < 0.8 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 16)) : 1;
        X.glow(ctx, z.x, zy - 1.2 + bob, 1.7, '#ffd27a', 0.65 * a); X.glow(ctx, z.x, zy - 1.2 + bob, 0.6, '#ffffff', 0.8 * a);
        ctx.globalAlpha = 0.9 * a; X.ell(ctx, z.x, zy - 1.2 + bob, 0.36, 0.44); X.fill(ctx, '#fff3c8'); ctx.globalAlpha = 1;
        W.lights.push(z.x, zy, 5, '#ffd27a', 0.5);
      } else if (k === 'moon') {
        // 달은 '더하는 빛'이 아니라 제 빛깔(누런 달빛)로 그린다. 더하기로 그리면 싸움 한복판에 지름 110px 의 순백 원반이 생겼다. 빛무리만 살짝 더한다
        const my = zy - 1.8;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.96; X.circle(ctx, z.x, my, 1.9); X.fill(ctx, '#e6cd84');
        ctx.globalAlpha = 0.55; X.circle(ctx, z.x - 0.28, my - 0.26, 1.5); X.fill(ctx, '#f2e2aa');
        ctx.globalAlpha = 0.6; X.circle(ctx, z.x - 0.5, my - 0.4, 0.42); X.fill(ctx, '#c4a75a'); X.circle(ctx, z.x + 0.6, my + 0.4, 0.3); ctx.fill(); X.circle(ctx, z.x + 0.2, my - 0.95, 0.2); ctx.fill();
        ctx.globalAlpha = 0.9; X.circle(ctx, z.x, my, 1.9); X.stroke(ctx, '#9c7c34', 0.09);
        ctx.globalCompositeOperation = W.addMode; ctx.globalAlpha = 1;
        X.glow(ctx, z.x, my, 3.6, '#ffe9a8', 0.28); W.lights.push(z.x, zy, 12, '#ffe9a8', 0.8);
      } else if (k === 'frost' || k === 'blizzard') { for (let i = 0; i < 4; i++) { const a = i * 1.7 + z.id, r = z.radius * 0.55, tw = Math.max(0, Math.sin(t * 5 + i * 2)); X.glow(ctx, z.x + Math.cos(a) * r, zy + Math.sin(a) * r * K, 0.5, '#ffffff', 0.6 * tw); } }
      else if (k === 'whirl') { X.glow(ctx, z.x, zy, z.radius * 0.7, '#7dffd9', 0.22); W.lights.push(z.x, zy, z.radius + 2, '#7dffd9', 0.4); }
    }
    X.glowK = 1;
    // 길잡이 등불
    for (const w of G.wards) { if (W.team >= 0 && w.team !== W.team && !W.visibleAt(w.x, w.y)) continue; const bob = Math.sin(t * 2.4 + w.id) * 0.18, a = Math.min(1, (w.until - G.t) / 1.5), wy = w.y * K - 1.8 + bob; X.glow(ctx, w.x, wy, 1.9, '#fff0b0', 0.8 * a); ctx.globalAlpha = a; X.ell(ctx, w.x, wy, 0.3, 0.38); X.fill(ctx, '#ffffff'); ctx.globalAlpha = 1; }
    // 등불탑의 조준선
    for (const s of G.structs) {
      if (s.dead || !s.target || !s.target.isHero || s.lockT <= 0 || !W.onScreen(s.x, s.y, 14)) continue;
      const tg = s.target, h = D.muzzle(s), k = 1 - s.lockT / s.lockMax, ty = tg.y * K - 1.2;
      ctx.globalAlpha = 0.5 + 0.5 * k; ctx.beginPath(); ctx.moveTo(s.x, s.y * K - h); ctx.lineTo(tg.x, ty); X.stroke(ctx, DANGER, 0.07 + 0.12 * k); ctx.globalAlpha = 1;
      X.glow(ctx, tg.x, ty, 0.9 + k, DANGER, 0.6);
    }
    // 본진 샘
    for (let i = 0; i < 2; i++) { const f = M.bases[i].fountain; if (!W.onScreen(f.x, f.y, 6)) continue; const pl = 0.7 + 0.3 * Math.sin(t * 2); ctx.save(); ctx.translate(f.x, f.y * K); ctx.scale(1, K); X.glow(ctx, 0, 0, 4.6, C.TEAM_COL[i], 0.22 * pl); ctx.restore(); W.lights.push(f.x, f.y * K, 9, C.TEAM_LIGHT[i], 0.6); }
    // 내 조준 표시를 한 번 더(빛으로)
    if (W.aim && me && !me.dead && W.aim.ok) X.glow(ctx, me.x, me.y * K - 1.1, 2.4, me.hd.glow, 0.18);
    ctx.globalAlpha = 1;
  };
  /* 구조물이 빛줄기를 쏘는 높이 */
  D.muzzle = function (s) { return (s.kind === 'core' ? 3.2 : Art.TOWER_H[s.tier] - 0.45) * ST; };

  /* ---------- 머리 위 정보(화면 좌표) ---------- */
  /* 체력 막대: 앞으로 기운 띠. (x, y) = 왼쪽 위, sl = 기울기(세로 1 에 가로로 밀리는 양) */
  function bar(ctx, x, y, w, h, frac, lag, shield, col, sl) {
    sl = sl === undefined ? 0.45 : sl;
    const yc = y + h / 2, q = (x0, x1, y0, y1) => { ctx.beginPath(); ctx.moveTo(x0 - (y0 - yc) * sl, y0); ctx.lineTo(x1 - (y0 - yc) * sl, y0); ctx.lineTo(x1 - (y1 - yc) * sl, y1); ctx.lineTo(x0 - (y1 - yc) * sl, y1); ctx.closePath(); };
    const f = U.clamp(frac, 0, 1);
    q(x - 1.5, x + w + 1.5, y - 1.5, y + h + 1.5); ctx.fillStyle = 'rgba(5,8,22,0.62)'; ctx.fill();
    if (lag > frac) { q(x, x + w * U.clamp(lag, 0, 1), y, y + h); ctx.fillStyle = 'rgba(255,196,150,0.9)'; ctx.fill(); }      // 방금 깎인 만큼(살구빛)
    if (f > 0) { q(x, x + w * f, y, y + h); ctx.fillStyle = col; ctx.fill(); q(x, x + w * f, y, y + Math.max(1, h * 0.38)); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill(); }
    if (shield > 0) { const sw = w * Math.min(1, shield), sx = Math.min(x + w * f, x + w - sw); q(sx, sx + sw, y, y + h); ctx.fillStyle = '#eaf6ff'; ctx.fill(); }
  }
  const BAR_ME = '#7dffb2', BAR_COL = ['#ffc65a', '#c592ff'];
  D.overlay = function (ctx) {
    const me = W.me, ui = W.ui;
    const myHit = me && !me.dead ? me.ad : 0;
    for (let i = 0; i < list.length; i++) {
      const u = list[i]; if (u.lamp) continue;
      if (u.tomb) { const h = u.tomb; W.toScreen(u.x, u.y, _p, 1.7); X.text(ctx, String(Math.ceil(h.respawnT)), _p.x, _p.y, 15 * ui, '#e8ecff', 'center', 800, 'rgba(6,8,22,0.9)'); continue; }
      const s = W.vis.get(u.id); if (!s || s.a < 0.5) continue;
      const top = u.isStruct ? (u.kind === 'core' ? 5.6 : Art.TOWER_H[u.tier] + 1.7) * ST : u.isHero ? 2.72 * HS : u.isMonster ? (u.kind === 'boss' ? 5.2 : u.kind === 'elder' ? 4.6 : u.r * 1.5 + 1.0) * MS : u.kind === 'super' ? 2.9 : 1.85;
      W.toScreen(s.x, s.y, _p, top + (s.z || 0));
      const sx = _p.x, sy = _p.y, frac = u.hp / u.maxHp, lag = s.hpLag / u.maxHp;
      if (u.isHero) {
        const w = 84 * ui, h = 9 * ui, x = sx - w / 2, y = sy - h, isMe = u === me, col = isMe ? BAR_ME : BAR_COL[u.team] || '#ffd9a0';
        bar(ctx, x, y, w, h, frac, lag, u.shield / u.maxHp, col);
        ctx.strokeStyle = 'rgba(5,8,22,0.6)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let hp = 250; hp < u.maxHp; hp += 250) { const tx = x + w * hp / u.maxHp, th = h * (hp % 1000 === 0 ? 1 : 0.5); ctx.moveTo(tx + h * 0.225, y); ctx.lineTo(tx + h * 0.225 - th * 0.45, y + th); }
        ctx.stroke();
        // 레벨: 막대 왼쪽 끝의 마름모
        const lx = x - 10 * ui, ly = y + h / 2, lr = 9.5 * ui;
        ctx.beginPath(); ctx.moveTo(lx, ly - lr); ctx.lineTo(lx + lr, ly); ctx.lineTo(lx, ly + lr); ctx.lineTo(lx - lr, ly); ctx.closePath(); ctx.fillStyle = 'rgba(5,8,22,0.92)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.5 * ui; ctx.stroke();
        X.text(ctx, String(u.level), lx, ly + 0.5, 11 * ui, '#ffffff', 'center', 800);
        if (!isMe) X.text(ctx, u.name, sx + 4 * ui, y - 9 * ui, 11.5 * ui, isEnemy(u) ? '#ead8ff' : '#ffeccc', 'center', 700, 'rgba(5,8,22,0.85)', 3 * ui);
        // 상태 이상: 남은 시간
        let cc = null; for (const b of u.buffs) if (b.stun || b.freeze || b.airborne || b.root || b.taunt) { if (!cc || b.dur - b.t > cc.dur - cc.t) cc = b; }
        if (cc) { const k = 1 - cc.t / cc.dur; ctx.fillStyle = 'rgba(5,8,22,0.8)'; ctx.fillRect(x, y + h + 3 * ui, w, 3 * ui); ctx.fillStyle = '#ff9ad8'; ctx.fillRect(x, y + h + 3 * ui, w * k, 3 * ui); }
        const fr = u.getBuff('frost'); if (fr) for (let k = 0; k < fr.stacks; k++) { X.star(ctx, sx - 8 * ui + k * 16 * ui, y - (isMe ? 11 : 23) * ui, 6 * ui, 6, 0.4, 0); ctx.fillStyle = '#bfeaff'; ctx.fill(); }
        if (u.getBuff('bait')) Art.icon(ctx, 'hook', sx + w / 2 + 13 * ui, y + h / 2, 7 * ui, '#7dffd9');
        if (u.sightCap && isMe) X.text(ctx, '어둠', sx, y - 11 * ui, 12 * ui, '#b7a8ff', 'center', 800, 'rgba(5,8,22,0.85)');
      } else if (u.isMinion) {
        const en = isEnemy(u), lh = en && TW.Feel ? TW.Feel.lastHit(u) : null;      // lh: 내 가까이의 적 미니언 → 막타 정보
        if (frac >= 1 && !lh) continue;                    // 멀쩡한 미니언의 막대는 숨긴다 (화면이 덜 어지럽게)
        const kill = !!(lh && lh.kill), soon = !!(lh && lh.soon);
        const w = (u.kind === 'super' ? 46 : u.kind === 'siege' ? 40 : kill ? 38 : 30) * ui, h = (kill ? 7 : lh ? 5 : 4) * ui, x = sx - w / 2, y = sy - h;
        bar(ctx, x, y, w, h, frac, lag, 0, kill ? '#ffd84a' : soon ? '#ffb86a' : BAR_COL[u.team] || '#ffd9a0', 0);
        if (lh) {
          // '한 대' 눈금: 체력이 이 금 아래로 내려오면 내 평타 한 대에 쓰러진다 → 막타 타이밍이 다가오는 것이 보인다
          const nx = x + w * lh.frac;
          ctx.fillStyle = 'rgba(5,8,22,0.92)'; ctx.fillRect(nx - 1.6 * ui, y - 2.5 * ui, 3.2 * ui, h + 5 * ui);
          ctx.fillStyle = kill ? '#ffffff' : '#ffe9a0'; ctx.fillRect(nx - 0.7 * ui, y - 2 * ui, 1.4 * ui, h + 4 * ui);
          if (kill) { ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 2 * ui; ctx.strokeRect(x - 3 * ui, y - 3 * ui, w + 6 * ui, h + 6 * ui); TW.Feel.killArrow(ctx, sx, y - 3 * ui, ui, W.time, u.kind === 'siege' || u.kind === 'super'); }
        }
        // 서리 표식: 미니언에게도 보인다 (세 개가 차면 얼어붙는다)
        { const fr = u.getBuff('frost'); if (fr) for (let k = 0; k < fr.stacks; k++) { X.star(ctx, sx - 7 * ui + k * 14 * ui, y + h + 8 * ui, 4.5 * ui, 6, 0.4, 0); ctx.fillStyle = '#bfeaff'; ctx.fill(); } }
      } else if (u.isMonster) {
        if (u.kind === 'boss') continue;       // 이무기 체력은 화면 위 큰 막대로
        if (u.hp >= u.maxHp && !u.target && u.kind !== 'elder' && !u.buffKind) continue;
        const w = (u.kind === 'elder' ? 96 : u.buffKind ? 70 : 38) * ui, h = (u.buffKind || u.kind === 'elder' ? 7 : 4) * ui, x = sx - w / 2, y = sy - h;
        bar(ctx, x, y, w, h, frac, lag, 0, u.buffKind === 'fire' ? '#ff9a50' : u.buffKind === 'water' ? '#6fd8ff' : u.kind === 'elder' ? '#9fe07a' : '#ffd9a0');
        if (u.buffKind || u.kind === 'elder') X.text(ctx, u.name, sx, y - 9 * ui, 12 * ui, '#f3f0e0', 'center', 700, 'rgba(5,8,22,0.85)', 3 * ui);
      } else if (u.isStruct && !u.dead) {
        const w = (u.kind === 'core' ? 150 : 104) * ui, h = 9 * ui, x = sx - w / 2, y = sy - h;
        bar(ctx, x, y, w, h, frac, lag, 0, BAR_COL[u.team] || '#ffd9a0');
        if (!u.vulnerable) { Art.icon(ctx, 'lock', sx, y - 11 * ui, 7 * ui, '#c9cde0'); }
      }
    }
    // 피해 숫자·상태 글자 (숫자는 몸통에서 옆으로 튀고, 이름표는 머리 위로 뜬다)
    const tx = FX.text;
    for (let i = 0; i < tx.length; i++) {
      const p = tx[i], k = p.t / p.life, st = p.style;
      W.toScreen(p.x, p.y, _p, st === 'label' ? 1.9 : st === 'gold' ? 0.7 : 0);
      const base = st === 'big' ? 30 : st === 'skill' ? 22 : st === 'label' ? 19 : st === 'hurt' ? 19 : st === 'gold' ? 18 : st === 'heal' ? 17 : st === 'miss' ? 18 : st === 'dot' ? 13 : 16;
      // 튀어나옴: 멈칫하는 동안(hold)은 가장 크게 박혀 있다가, 그 뒤 0.14초에 걸쳐 제 크기로 줄며 튀어 나간다
      const ht = Math.max(0, p.t - (p.hold || 0)), P = st === 'big' ? 1.15 : st === 'basic' ? 0.5 : st === 'dot' ? 0.25 : st === 'hurt' ? 0.6 : st === 'skill' ? 0.8 : 0.55;
      const pop = 1 + P * (1 - U.easeOut3(Math.min(1, ht / 0.14)));
      const px = base * ui * pop * (p.sz || 1), a = k > 0.7 ? (1 - k) / 0.3 : 1;
      ctx.globalAlpha = a;
      const col = st === 'basic' ? '#ffffff' : st === 'hurt' ? '#ff6a7c' : st === 'heal' ? '#8dffb4' : st === 'gold' ? '#ffd84a' : st === 'dot' ? '#ffb36b' : (p.color || '#ffffff');
      X.text(ctx, p.str, _p.x, _p.y, px, col, 'center', st === 'basic' || st === 'dot' ? 800 : 900, 'rgba(5,8,22,0.92)', Math.max(3, px * 0.22));
      if (st === 'big') { ctx.globalAlpha = a * Math.max(0, 1 - p.t / 0.2); X.text(ctx, p.str, _p.x, _p.y, px, '#ffffff', 'center', 900); }
    }
    ctx.globalAlpha = 1;
    // 신호 글자
    for (const p of W.pings) if (p.label) { W.toScreen(p.x, p.y, _p, 2.4); ctx.globalAlpha = Math.min(1, (p.life - p.t) / 0.5); X.text(ctx, p.label, _p.x, _p.y, 14 * ui, p.color, 'center', 800, 'rgba(5,8,22,0.9)'); ctx.globalAlpha = 1; }
    if (TW.Feel) TW.Feel.overlay(ctx);       // 명중 표식 · 목표 화살표
  };
  W.clickMark = function (x, y, attack, unit) { W.click = { x, y, attack: !!attack, unit: unit || null, t: W.time }; };
  D.lineInd = lineInd;
  /* 내 명령에 몸이 바로 반응하게: 그림의 방향을 그 자리에서 돌리고(부드럽게 돌지 않는다), 평타 동작이 남아 있으면 끊는다 */
  W.snapFace = function (u, ang) { const s = vs(u); s.f = ang; };
  W.cutAttack = function (u) { const s = vs(u); s.atkT0 = -9; if (s.hold > 0 && W.releaseHold) W.releaseHold(s); };      // 때린 자세의 버팀(멈칫)도 그 자리에서 풀린다

})();
