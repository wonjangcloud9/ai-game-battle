/* 청홍대전 — world: 전장 렌더러 (카메라, 지형, 유닛, 이펙트, 전장의 안개) */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const C = AOS.C, U = AOS.U, M = AOS.Map, X = AOS.Gfx, A = AOS.Art;
  const TAU = Math.PI * 2;
  const MW = C.W, MH = C.H, N = MW * MH;
  const W = AOS.World = {
    cam: { x: 40, y: 80, zoom: 1, locked: true, shake: 0, sx: 0, sy: 0 },
    S: 30, vw: 1600, vh: 900, k: 1, clock: 0,
    G: null, me: null, viewTeam: 0, fogOn: false,
    fx: [], parts: [], texts: [], corpses: [], rubble: [], hover: null, aim: null,
    mouse: { x: 0, y: 0 }, hurt: 0, towerWarn: 0, ready: false, mini: null, csHelp: false,
  };
  const rnd = Math.random;
  const FOREST = '#15301f';

  /* ---------- 정적 데이터 (한 번만) ---------- */
  let gtype = null, trees = [], groups = [];
  const DECOR = new Uint8Array(N);
  function stampT(x, y, r, val, onlyWalk) {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(MW - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(MH - 1, Math.ceil(y + r)), r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const dx = cx + 0.5 - x, dy = cy + 0.5 - y, i = cy * MW + cx;
      if (dx * dx + dy * dy <= r2 && (!onlyWalk || M.baseWalk[i])) gtype[i] = val;
    }
  }
  function stampPath(p, r, val) {
    const pts = p.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 0.5));
      for (let k = 0; k <= n; k++) stampT(a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, r, val, true);
    }
  }
  function initStatic() {
    if (W.ready) return;
    W.ready = true;
    gtype = new Uint8Array(N);
    for (let i = 0; i < N; i++) gtype[i] = M.baseWalk[i] ? 1 : 0;
    stampPath(M.river, 4.9, 3);
    for (const l of M.lanes) stampPath(l, 4.9, 2);
    for (const b of M.bases) stampT(b.core.x, b.core.y, 22.6, 4, true);
    stampT(130, 80, 7.6, 4, true);
    for (let i = 0; i < N; i++) {
      const g = gtype[i]; if (!g || g === 4) continue;
      const h = U.hash2(i % MW, (i / MW) | 0, 7);
      let d = 0;
      if (g === 1) d = h < 0.1 ? 1 : h < 0.13 ? 2 : h < 0.155 ? 3 : h < 0.18 ? 4 : h < 0.27 ? 5 : h < 0.36 ? 6 : 0;
      else if (g === 2) d = h < 0.06 ? 4 : h < 0.1 ? 7 : h < 0.2 ? 5 : h < 0.29 ? 6 : 0;
      else if (g === 3) d = h < 0.07 ? 8 : 0;
      DECOR[i] = d;
    }
    // 경로를 폭별로 묶기
    const byHw = new Map();
    for (const j of M.jungle) { const k = j.hw; if (!byHw.has(k)) byHw.set(k, []); byHw.get(k).push(j); }
    groups = [{ hw: M.LANE_HW, paths: M.lanes }, { hw: M.river.hw, paths: [M.river] }];
    for (const [hw, paths] of byHw) groups.push({ hw, paths });
    // 나무 배치
    const isG = M.isGround, SP = 2.35;
    trees = [];
    for (let gy = -6; gy * SP < MH + 14; gy++) for (let gx = -7; gx * SP < MW + 16; gx++) {
      const h1 = U.hash2(gx, gy, 11), h2 = U.hash2(gx, gy, 23), h3 = U.hash2(gx, gy, 37), h4 = U.hash2(gx, gy, 51);
      const x = gx * SP + (h1 - 0.5) * 1.5, y = gy * SP + (h2 - 0.5) * 1.5;
      if (isG(x, y)) continue;
      let near = false, above = false;
      for (let a = 0; a < 8; a++) if (isG(x + Math.cos(a * 0.785) * 1.5, y + Math.sin(a * 0.785) * 1.5)) { near = true; break; }
      for (let k = 1.5; k <= 4.6; k += 1) if (isG(x, y - k) || isG(x - 1.3, y - k) || isG(x + 1.3, y - k)) { above = true; break; }
      if (near && h3 < 0.22) continue;
      let kind, s;
      if (near) { kind = h3 < 0.78 ? 2 : 3; s = 0.8 + h2 * 0.45; }
      else if (above) { kind = h3 < 0.55 ? 2 : h3 < 0.72 ? 3 : (h4 < 0.5 ? 0 : 1); s = kind < 2 ? 0.72 + h2 * 0.2 : 0.9 + h2 * 0.5; }
      else { kind = h4 < 0.56 ? 0 : 1; s = 0.88 + h2 * 0.42; }
      const px = U.clamp((x - 92) / 76, 0, 1) + (h4 - 0.5) * 0.4;
      const grp = px < 0.34 ? 'cool' : px < 0.66 ? 'mid' : 'warm', pi = Math.min(2, Math.floor(h1 * 3));
      trees.push({ x, y, kind, s, key: grp + pi + '_' + kind, pal: A.PAL[grp][pi] });
    }
    trees.sort((a, b) => a.y - b.y);
    buildMini();
  }
  function treeSprite(t) {
    const ppu = Math.max(8, Math.ceil(W.S));
    const box = A.TREE_BOX[t.kind];
    return X.sprite('tree_' + t.key + '_' + ppu, box.w * ppu, box.h * ppu, (g) => {
      g.setTransform(ppu, 0, 0, ppu, box.ox * ppu, box.oy * ppu);
      A.tree(g, t.kind, t.pal);
    });
  }

  /* 화면에 걸친 구간만 경로에 넣는다 (CV가 없으면 전체: 미니맵 배경용) */
  let CV = null;
  function trace(ctx, pts, m) {
    if (!CV) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      return;
    }
    const L = CV.left - m, R = CV.right + m, T = CV.top - m, B = CV.bottom + m;
    let pen = false;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.x >= L && p.x <= R && p.y >= T && p.y <= B) {
        if (!pen) { pen = true; if (i > 0) { ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(p.x, p.y); } else ctx.moveTo(p.x, p.y); }
        else ctx.lineTo(p.x, p.y);
      } else if (pen) { ctx.lineTo(p.x, p.y); pen = false; }
    }
  }
  function strokePaths(ctx, paths, lw, color) {
    ctx.beginPath();
    const m = lw / 2 + 2.5;
    for (const p of paths) trace(ctx, p.pts, m);
    ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.stroke();
  }
  function allGround(ctx, pad, color) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const g of groups) strokePaths(ctx, g.paths, g.hw * 2 + pad, color);
    ctx.fillStyle = color; ctx.beginPath();
    for (const c of M.clearings) { ctx.moveTo(c.x + c.r + pad / 2, c.y); ctx.arc(c.x, c.y, c.r + pad / 2, 0, TAU); }
    for (const b of M.bases) { ctx.moveTo(b.core.x + M.PLAZA_R + pad / 2, b.core.y); ctx.arc(b.core.x, b.core.y, M.PLAZA_R + pad / 2, 0, TAU); }
    ctx.fill();
  }

  /* 미니맵 배경 (한 번만 그림) */
  function buildMini() {
    const sc = 2, c = X.makeCanvas(MW * sc, MH * sc), g = c.getContext('2d');
    g.fillStyle = '#10241a'; g.fillRect(0, 0, c.width, c.height);
    g.setTransform(sc, 0, 0, sc, 0, 0);
    allGround(g, 1.2, '#1f4a2c'); allGround(g, 0, '#3a7a3a');
    g.lineCap = 'round'; g.lineJoin = 'round';
    strokePaths(g, [M.river], 9, '#2f7fb8');
    strokePaths(g, M.lanes, 9.5, '#c2aa72');
    for (let t = 0; t < 2; t++) {
      const b = M.bases[t];
      X.circle(g, b.core.x, b.core.y, 21); g.fillStyle = '#7d8498'; g.fill();
      X.circle(g, b.core.x, b.core.y, 17); g.strokeStyle = X.rgba(C.TEAM_COLORS[t], 0.9); g.lineWidth = 2.5; g.stroke();
      X.circle(g, b.fountain.x, b.fountain.y, 6); g.fillStyle = X.rgba(C.TEAM_COLORS[t], 0.6); g.fill();
    }
    X.circle(g, 130, 80, 7); g.fillStyle = '#8a90a3'; g.fill();
    const gr = g.createLinearGradient(0, 0, MW, 0);
    gr.addColorStop(0, 'rgba(60,140,255,0.16)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(255,110,60,0.16)');
    g.fillStyle = gr; g.fillRect(0, 0, MW, MH);
    W.mini = c;
  }

  /* ---------- 전장의 안개 ---------- */
  const FOGM = 7, FW = MW / 2 + FOGM * 2, FH = MH / 2 + FOGM * 2;   // 맵 바깥으로 여유를 둔 안개 격자(칸당 2유닛)
  const fogTarget = new Uint8Array(FW * FH), fogCur = new Float32Array(FW * FH), fogTmp = new Float32Array(FW * FH);
  let fogCanvas = null, fogImg = null, fogT = 0;
  function fogUpdate(G, dt) {
    fogT -= dt;
    if (fogT <= 0) {
      fogT = 0.1;
      fogTarget.fill(0);
      const team = W.viewTeam;
      for (const u of G.units) {
        if (u.team !== team || u.dead) continue;
        const r = u.sight / 2, cx = u.x / 2 + FOGM, cy = u.y / 2 + FOGM, r2 = r * r;
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(FW - 1, Math.ceil(cx + r));
        const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(FH - 1, Math.ceil(cy + r));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r2) fogTarget[y * FW + x] = 1;
        }
      }
    }
    if (!fogCanvas) { fogCanvas = X.makeCanvas(FW, FH); fogImg = fogCanvas.getContext('2d').createImageData(FW, FH); }
    const d = fogImg.data, kf = Math.min(1, dt * 7);
    for (let i = 0; i < FW * FH; i++) fogCur[i] += (fogTarget[i] - fogCur[i]) * kf;
    // 가장자리를 부드럽게: 가로·세로 [1 2 1] 블러
    for (let y = 0; y < FH; y++) {
      const o = y * FW;
      for (let x = 0; x < FW; x++) fogTmp[o + x] = (fogCur[o + (x > 0 ? x - 1 : 0)] + 2 * fogCur[o + x] + fogCur[o + (x < FW - 1 ? x + 1 : x)]) * 0.25;
    }
    for (let y = 0; y < FH; y++) {
      const o = y * FW, up = (y > 0 ? y - 1 : 0) * FW, dn = (y < FH - 1 ? y + 1 : y) * FW;
      for (let x = 0; x < FW; x++) {
        const cur = (fogTmp[up + x] + 2 * fogTmp[o + x] + fogTmp[dn + x]) * 0.25, j = (o + x) * 4;
        d[j] = 6; d[j + 1] = 12; d[j + 2] = 26; d[j + 3] = (1 - cur) * 132;
      }
    }
    fogCanvas.getContext('2d').putImageData(fogImg, 0, 0);
  }
  W.fogCanvas = () => (W.fogOn ? fogCanvas : null);
  W.fogRect = { x: FOGM, y: FOGM, w: FW - FOGM * 2, h: FH - FOGM * 2 };
  function visAt(x, y) {
    if (!W.fogOn) return true;
    const fx = Math.floor(x / 2) + FOGM, fy = Math.floor(y / 2) + FOGM;
    if (fx < 0 || fy < 0 || fx >= FW || fy >= FH) return false;
    return fogTarget[fy * FW + fx] === 1;
  }
  function visU(u) { return !W.fogOn || u.team === W.viewTeam || (u.seen[W.viewTeam] && !u.stealth); }
  W.visU = visU; W.visAt = visAt;

  /* ---------- 파티클 / 이펙트 ---------- */
  function part(x, y, z, vx, vy, vz, life, size, color, add, grav) {
    if (W.parts.length > 850) return;
    W.parts.push({ x, y, z, vx, vy, vz, life, max: life, size, color, add: !!add, grav: grav === undefined ? -14 : grav });
  }
  function burst(x, y, z, n, color, speed, life, size, add) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = speed * (0.35 + rnd() * 0.65);
      part(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, rnd() * speed * 0.6, life * (0.6 + rnd() * 0.6), size * (0.7 + rnd() * 0.6), color, add);
    }
  }
  W.burst = burst;
  function addText(x, y, z, str, color, size, dur) {
    if (W.texts.length > 60) W.texts.shift();
    W.texts.push({ x: x + (rnd() - 0.5) * 0.8, y, z, str: String(str), color, size: size || 15, t: 0, dur: dur || 0.9 });
  }
  W.addText = addText;
  function addFx(o) { o.t = 0; if (W.fx.length > 320) W.fx.splice(0, 60); W.fx.push(o); return o; }
  W.addFx = addFx;
  const unitH = (u) => (u.isHero ? A.heroHeight(u.heroId) : u.isMinion ? A.minionHeight(u.kind) : u.kind === 'core' ? A.CORE_H : A.TOWER_H);
  W.unitH = unitH;

  W.attach = function (G, me) {
    initStatic();
    W.G = G; W.me = me || null; W.fogOn = !!me; W.viewTeam = me ? me.team : 0;
    W.fx.length = 0; W.parts.length = 0; W.texts.length = 0; W.corpses.length = 0; W.rubble.length = 0;
    W.hover = null; W.aim = null; W.hurt = 0; W.towerWarn = 0; W.csHelp = false;
    fogCur.fill(0); fogTarget.fill(0); fogT = 0;
    if (me) { W.cam.x = me.x; W.cam.y = me.y; W.cam.locked = true; }
    W.cam.shake = 0;
  };

  W.onEvent = function (e, G) {
    const me = W.me;
    switch (e.type) {
      case 'hit': {
        const tg = e.tgt;
        if (!visU(tg)) break;
        if (tg._v) tg._v.flash = 1;
        const col = e.kind === 'magic' ? '#c9a2ff' : e.kind === 'true' ? '#ffffff' : '#ffe9b0';
        if (e.amt > 6 && (tg.isHero || rnd() < 0.45)) burst(tg.x, tg.y, tg.isStruct ? 3 : 1.1, tg.isHero ? 4 : 2, col, 5, 0.26, 0.2, true);
        if (me && (e.src === me || tg === me) && e.amt >= 1) {
          const big = e.amt > 150;
          addText(tg.x, tg.y, unitH(tg) * 0.8, Math.round(e.amt), tg === me ? '#ff7466' : e.kind === 'magic' ? '#dcc0ff' : e.kind === 'true' ? '#ffffff' : '#fff6d8', big ? 21 : e.amt > 60 ? 17 : 14, big ? 1.1 : 0.8);
        }
        if (tg === me) W.hurt = Math.min(1, W.hurt + e.amt / me.maxHp * 3.2);
        break;
      }
      case 'melee': {
        const u = e.u, tg = e.target;
        if (!visU(u) && !visU(tg)) break;
        const ang = Math.atan2(tg.y - u.y, tg.x - u.x);
        addFx({ kind: 'slash', x: u.x + Math.cos(ang) * (u.r + 0.5), y: u.y + Math.sin(ang) * (u.r + 0.5), ang, r: u.isHero ? 1.9 : 1.1, color: e.bonus ? '#ffe680' : '#ffffff', dur: 0.2, z: u.isHero ? 1.2 : 0.6 });
        break;
      }
      case 'projHit': {
        const p = e.p; if (!visAt(p.x, p.y)) break;
        const big = p.skill || p.vis.kind === 'tower' || p.vis.kind === 'shell';
        burst(p.x, p.y, 1.0, big ? 9 : 3, p.vis.color, big ? 9 : 5, 0.3, big ? 0.3 : 0.2, true);
        if (big) addFx({ kind: 'ring', x: p.x, y: p.y, r0: 0.3, r1: p.vis.kind === 'tower' ? 2.2 : 1.6, dur: 0.25, color: p.vis.color, g: true });
        break;
      }
      case 'death': {
        const u = e.u;
        if (u.isMinion) {
          if (visU(u)) { W.corpses.push({ type: 'minion', mk: u.kind, team: u.team, x: u.x, y: u.y, dir: u._v ? u._v.dir : 1, t: 0, dur: 0.6 }); burst(u.x, u.y, 0.5, 5, C.TEAM_LIGHT[u.team], 6, 0.4, 0.22, true); }
        } else if (u.isHero) {
          W.corpses.push({ type: 'hero', id: u.heroId, team: u.team, x: u.x, y: u.y, dir: u._v ? u._v.dir : 1, t: 0, dur: 1.5 });
          burst(u.x, u.y, 1.2, 22, C.TEAM_LIGHT[u.team], 11, 0.8, 0.3, true);
          addFx({ kind: 'ring', x: u.x, y: u.y, r0: 0.5, r1: 5, dur: 0.5, color: C.TEAM_LIGHT[u.team], g: true });
          addFx({ kind: 'pillar', x: u.x, y: u.y, color: '#ffffff', dur: 0.7, w: 1.2 });
        } else {
          const core = u.kind === 'core';
          W.rubble.push({ x: u.x, y: u.y, team: u.team, core });
          addFx({ kind: 'explode', x: u.x, y: u.y, r: core ? 12 : 6, color: C.TEAM_LIGHT[u.team], dur: core ? 1.2 : 0.7, z: 3 });
          burst(u.x, u.y, 3, core ? 60 : 30, '#c9cfdb', core ? 20 : 14, 1.1, 0.5, false);
          burst(u.x, u.y, 4, core ? 50 : 24, C.TEAM_LIGHT[u.team], core ? 22 : 15, 1.0, 0.45, true);
          shake(u.x, u.y, core ? 1.6 : 0.9);
          if (core) for (let i = 1; i < 7; i++) addFx({ kind: 'explode', x: u.x + (rnd() - 0.5) * 9, y: u.y + (rnd() - 0.5) * 6, r: 4 + rnd() * 5, color: i % 2 ? '#ffffff' : C.TEAM_LIGHT[u.team], dur: 0.7, z: 1 + rnd() * 5, delay: i * 0.22 });
        }
        break;
      }
      case 'levelup': if (visU(e.u)) { addFx({ kind: 'levelup', follow: e.u, x: e.u.x, y: e.u.y, dur: 1.0 }); if (e.u === me) addText(e.u.x, e.u.y, 3.6, '레벨 ' + e.u.level + '!', '#ffe680', 19, 1.4); } break;
      case 'gold':
        if (e.u === me) {
          addText(e.x, e.y, 1.6, '+' + e.amt + ' 골드', '#ffd84a', e.amt >= 100 ? 20 : 16, 1.1);
          if (e.cs) burst(e.x, e.y, 0.9, 7, '#ffd84a', 6, 0.5, 0.24, true);          // 막타 성공: 동전이 튄다
        }
        break;
      case 'csMiss': {
        // 내가 칠 수 있었던 미니언을 놓쳤을 때 (길잡이가 막타를 가르치는 동안만 표시)
        const u = e.u;
        if (W.csHelp && me && !me.dead && u.team !== me.team && visU(u) && U.du(u, me) - u.r <= me.range + 5) addText(u.x, u.y, 1.4, '놓침', '#aab3cc', 12, 0.8);
        break;
      }
      case 'learn': if (visU(e.u)) { addFx({ kind: 'ring', follow: e.u, x: e.u.x, y: e.u.y, r0: 0.4, r1: 2.8, dur: 0.45, color: '#ffe680', g: true }); if (e.u === me) burst(e.u.x, e.u.y, 1.4, 12, '#ffe680', 7, 0.6, 0.26, true); } break;
      case 'buy': if (visU(e.u)) { addFx({ kind: 'ring', follow: e.u, x: e.u.x, y: e.u.y, r0: 2.6, r1: 0.5, dur: 0.4, color: '#8dffa0', g: true }); burst(e.u.x, e.u.y, 1.6, 10, '#8dffa0', 6, 0.6, 0.24, true); } break;
      case 'itemProc': if (visU(e.u)) burst(e.u.x, e.u.y, 1.4, 14, '#ffe08a', 8, 0.5, 0.28, true); break;
      case 'rescue': {
        const u = e.u;
        addFx({ kind: 'pillar', x: u.x, y: u.y, color: '#9bd4ff', dur: 1.0, w: 1.8 });
        addFx({ kind: 'ring', x: u.x, y: u.y, r0: 0.5, r1: 4.5, dur: 0.6, color: '#9bd4ff', g: true });
        if (u === me) { W.hurt = 0; addText(u.x, u.y, 3.4, '긴급 귀환', '#9bd4ff', 18, 1.6); }
        break;
      }
      case 'burnStart': for (const c of G.cores) { addFx({ kind: 'explode', x: c.x, y: c.y, r: 6, color: '#ff8a3c', dur: 0.8, z: 3 }); shake(c.x, c.y, 0.8); } break;
      case 'heal': {
        const tg = e.tgt; if (!visU(tg)) break;
        if (e.amt > 12) for (let i = 0; i < 3; i++) part(tg.x + (rnd() - 0.5) * 1.2, tg.y, 0.6 + rnd(), 0, 0, 2.2, 0.7, 0.26, '#8dffa0', true, 0);
        if (me && tg === me && e.amt >= 8) addText(tg.x, tg.y, 3.0, '+' + Math.round(e.amt), '#8dffa0', 14, 0.8);
        break;
      }
      case 'cast': if (visU(e.u)) addFx({ kind: 'ring', x: e.u.x, y: e.u.y, r0: 0.4, r1: 1.9, dur: 0.28, color: e.u.hd.color, g: true }); break;
      case 'respawn': addFx({ kind: 'pillar', x: e.u.x, y: e.u.y, color: C.TEAM_LIGHT[e.u.team], dur: 0.9, w: 1.6 }); break;
      case 'recallStart': if (visU(e.u)) addFx({ kind: 'recall', follow: e.u, x: e.u.x, y: e.u.y, dur: C.RECALL_TIME + 0.1 }); break;
      case 'recallDone': addFx({ kind: 'pillar', x: e.u.x, y: e.u.y, color: '#9bd4ff', dur: 0.7, w: 1.5 }); break;
      case 'zoneBlast': {
        const z = e.z; if (!visAt(z.x, z.y)) break;
        const k = z.vis.kind, col = z.vis.color;
        if (k === 'pillar') { addFx({ kind: 'pillar', x: z.x, y: z.y, color: col, dur: 0.55, w: z.radius * 0.9 }); burst(z.x, z.y, 0.5, 22, col, 10, 0.6, 0.4, true); addFx({ kind: 'ring', x: z.x, y: z.y, r0: 1, r1: z.radius, dur: 0.3, color: col, g: true }); }
        else if (k === 'meteor') { addFx({ kind: 'explode', x: z.x, y: z.y, r: z.radius * 1.15, color: col, dur: 0.8, z: 0.5 }); burst(z.x, z.y, 0.5, 46, '#ffb066', 18, 0.9, 0.5, true); burst(z.x, z.y, 0.5, 20, '#4a3a30', 12, 1.0, 0.5, false); addFx({ kind: 'ring', x: z.x, y: z.y, r0: 1, r1: z.radius * 1.3, dur: 0.45, color: '#ffe0a0', g: true }); }
        else if (k === 'bind') { addFx({ kind: 'ring', x: z.x, y: z.y, r0: z.radius * 1.4, r1: 0.4, dur: 0.3, color: col, g: true }); burst(z.x, z.y, 0.3, 14, col, 6, 0.5, 0.3, true); }
        else if (!z.dur) addFx({ kind: 'ring', x: z.x, y: z.y, r0: 0.5, r1: z.radius, dur: 0.3, color: col, g: true });
        break;
      }
      case 'towerAggro': if (e.target === me) W.towerWarn = 1; break;
      case 'fx': {
        const k = e.kind;
        if (k === 'shake') { shake(e.x, e.y, e.amp); break; }
        if (e.x !== undefined && !e.follow && !visAt(e.x, e.y) && k !== 'beam' && k !== 'aimline' && k !== 'line' && k !== 'lightning') break;
        if (k === 'ring') addFx({ kind: 'ring', x: e.x, y: e.y, r0: e.r0, r1: e.r1, dur: e.dur, color: e.color, g: true });
        else if (k === 'burst') burst(e.x, e.y, 1, e.n, e.color, e.speed, e.life, 0.28, true);
        else if (k === 'quake') { addFx({ kind: 'quake', x: e.x, y: e.y, r: e.r, color: e.color, dur: 0.5, g: true, seed: rnd() * 9 }); burst(e.x, e.y, 0.2, 14, e.color, 9, 0.5, 0.32, false); }
        else if (k === 'nova') { addFx({ kind: 'nova', x: e.x, y: e.y, r: e.r, color: e.color, dur: 0.5, g: true }); burst(e.x, e.y, 1, 20, e.color, e.r * 1.6, 0.5, 0.32, true); }
        else if (k === 'explode') { addFx({ kind: 'explode', x: e.x, y: e.y, r: e.r, color: e.color, dur: 0.45, z: 0.8 }); burst(e.x, e.y, 0.8, 12, e.color, e.r * 2.6, 0.45, 0.32, true); }
        else if (k === 'smoke') { for (let i = 0; i < 16; i++) part(e.x + (rnd() - 0.5) * e.r, e.y + (rnd() - 0.5) * e.r * 0.6, rnd() * 1.5, (rnd() - 0.5) * 2, (rnd() - 0.5), 1 + rnd(), 0.9, 0.9, '#3a3560', false, 0); }
        else if (k === 'line' || k === 'beam') addFx({ kind: 'beam', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, color: e.color, w: e.w, dur: e.dur, z: 1.1 });
        else if (k === 'aimline') addFx({ kind: 'aimline', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, color: e.color, w: e.w, dur: e.dur, g: true });
        else if (k === 'slash') addFx({ kind: 'slash', x: e.x, y: e.y, ang: e.ang, r: e.r, color: e.color, dur: 0.22, z: 1.2 });
        else if (k === 'spin') addFx({ kind: 'spin', follow: e.follow, x: e.x, y: e.y, r: e.r, color: e.color, dur: 0.32, z: 1.0 });
        else if (k === 'healfx') { addFx({ kind: 'ring', follow: e.follow, x: e.x, y: e.y, r0: 0.4, r1: 2.2, dur: 0.4, color: '#8dffa0', g: true }); for (let i = 0; i < 8; i++) part(e.x + (rnd() - 0.5) * 1.6, e.y + (rnd() - 0.5) * 0.6, rnd() * 1.5, 0, 0, 2.6, 0.8, 0.3, '#8dffa0', true, 0); }
        else if (k === 'lightning') addFx({ kind: 'lightning', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, color: e.color, dur: 0.24, z: 1.2, seed: rnd() * 99 });
        else if (k === 'thunder') { addFx({ kind: 'thunder', x: e.x, y: e.y, color: e.color, dur: 0.35, seed: rnd() * 99 }); addFx({ kind: 'ring', x: e.x, y: e.y, r0: 0.4, r1: 3.2, dur: 0.3, color: e.color, g: true }); burst(e.x, e.y, 0.5, 14, e.color, 10, 0.4, 0.3, true); shake(e.x, e.y, 0.35); }
        else if (k === 'mark') addFx({ kind: 'mark', follow: e.follow, x: e.follow.x, y: e.follow.y, color: e.color, dur: e.dur, g: true });
        else if (k === 'recallOut') addFx({ kind: 'pillar', x: e.x, y: e.y, color: '#9bd4ff', dur: 0.6, w: 1.4 });
        break;
      }
      default: break;
    }
  };
  function shake(x, y, amp) {
    const d = U.dist(x, y, W.cam.x, W.cam.y);
    if (d > 45) return;
    W.cam.shake = Math.min(1.6, Math.max(W.cam.shake, amp * (1 - d / 50)));
  }
  W.shake = shake;
  /* 클릭 표시 */
  W.clickMark = function (x, y, attack) { addFx({ kind: 'click', x, y, color: attack ? '#ff5a52' : '#7dff8a', dur: 0.45, g: true }); };
  W.ping = function (x, y, color) { addFx({ kind: 'ping', x, y, color: color || '#ffe680', dur: 2.2, g: true }); };

  /* ---------- 좌표 변환 ---------- */
  W.resize = function (wpx, hpx, k) {
    W.vw = wpx; W.vh = hpx; W.k = k || 1;
    const s = Math.max(wpx / 64, hpx / 38);
    if (Math.abs(s - W.S) > 0.01) { W.S = s; X.clearSprites(); }
  };
  W.toWorld = function (sx, sy) {
    const S = W.S * W.cam.zoom;
    return { x: (sx - W.vw / 2) / S + W.cam.x + W.cam.sx, y: (sy - W.vh / 2) / S + W.cam.y + W.cam.sy };
  };
  W.toScreen = function (x, y) {
    const S = W.S * W.cam.zoom;
    return { x: (x - W.cam.x - W.cam.sx) * S + W.vw / 2, y: (y - W.cam.y - W.cam.sy) * S + W.vh / 2 };
  };
  /* 커서 아래 유닛 고르기 (화면 공간, 스프라이트 높이 반영) */
  W.pick = function (sx, sy, pred) {
    const G = W.G; if (!G) return null;
    const S = W.S * W.cam.zoom;
    let best = null, bs = Infinity;
    for (const u of G.units) {
      if (u.dead || !visU(u) || (pred && !pred(u))) continue;
      const p = W.toScreen(u.x, u.y), h = unitH(u) * S;
      const hw = Math.max(u.r * S * 1.25, 15 * W.k) + (u.isHero ? 5 * W.k : 0);
      const dx = Math.abs(sx - p.x) / hw, cyy = p.y - h * 0.45, dy = Math.abs(sy - cyy) / (h * 0.55 + 6 * W.k);
      if (dx > 1 || dy > 1) continue;
      const sc = dx * dx + dy * dy - (u.isHero ? 0.6 : 0) + (u.isStruct ? 0.3 : 0);
      if (sc < bs) { bs = sc; best = u; }
    }
    return best;
  };

  /* ---------- 카메라 ---------- */
  W.updateCam = function (dt, focus, smoothOnly) {
    const cam = W.cam, S = W.S * cam.zoom;
    const hw = W.vw / (2 * S), hh = W.vh / (2 * S);
    // 귀환·부활처럼 멀리 순간이동했을 때는 카메라도 바로 따라간다
    if (focus && !smoothOnly && U.dist(focus.x, focus.y + 1.2, cam.x, cam.y) > 42) { cam.x = focus.x; cam.y = focus.y + 1.2; }
    if (focus) {
      const k = 1 - Math.exp(-dt * 9);
      cam.x += (focus.x - cam.x) * k; cam.y += (focus.y + 1.2 - cam.y) * k;
    }
    cam.x = U.clamp(cam.x, Math.min(MW / 2, hw - 9), Math.max(MW / 2, MW - hw + 9));
    cam.y = U.clamp(cam.y, Math.min(MH / 2, hh - 7), Math.max(MH / 2, MH - hh + 12));
    if (cam.shake > 0.01) {
      cam.sx = (rnd() - 0.5) * cam.shake * 0.9; cam.sy = (rnd() - 0.5) * cam.shake * 0.9;
      cam.shake *= Math.exp(-dt * 7);
    } else { cam.sx = cam.sy = 0; cam.shake = 0; }
  };

  /* ---------- 지형 ---------- */
  function fillBlobs(ctx, arr, color) {
    if (!arr.length) return;
    ctx.beginPath();
    for (let i = 0; i < arr.length; i += 2) {
      const r = 1.3 + U.hash2(arr[i] | 0, arr[i + 1] | 0, 9) * 1.1;
      ctx.moveTo(arr[i] + r, arr[i + 1]); ctx.ellipse(arr[i], arr[i + 1], r, r * 0.6, 0, 0, TAU);
    }
    ctx.fillStyle = color; ctx.fill();
  }
  const dTuft = [], dWh = [], dYe = [], dPeb = [], dCrack = [], dSpark = [], dLG = [], dDG = [], dLD = [], dDD = [];
  function drawGround(ctx, v, t) {
    CV = v;
    allGround(ctx, 1.5, '#234d2c');
    allGround(ctx, 0.15, '#4b8c3d');
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 장식 수집
    dTuft.length = dWh.length = dYe.length = dPeb.length = dCrack.length = dSpark.length = dLG.length = dDG.length = dLD.length = dDD.length = 0;
    const x0 = Math.max(0, Math.floor(v.left) - 3), x1 = Math.min(MW - 1, Math.ceil(v.right) + 3);
    const y0 = Math.max(0, Math.floor(v.top) - 2), y1 = Math.min(MH - 1, Math.ceil(v.bottom) + 2);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const idx = y * MW + x, d = DECOR[idx]; if (!d) continue;
      const ox = x + U.hash2(x, y, 3), oy = y + U.hash2(x, y, 5);
      if (d === 1) dTuft.push(ox, oy); else if (d === 2) dWh.push(ox, oy); else if (d === 3) dYe.push(ox, oy); else if (d === 4) dPeb.push(ox, oy);
      else if (d === 5) (gtype[idx] === 2 ? dLD : dLG).push(ox, oy); else if (d === 6) (gtype[idx] === 2 ? dDD : dDG).push(ox, oy);
      else if (d === 7) dCrack.push(ox, oy); else if (d === 8) dSpark.push(ox, oy);
    }
    fillBlobs(ctx, dLG, 'rgba(255,255,210,0.075)'); fillBlobs(ctx, dDG, 'rgba(10,36,20,0.1)');
    // 정글 오솔길
    for (const g of groups) if (g.hw < 5) strokePaths(ctx, g.paths, 3.4, 'rgba(150,160,90,0.28)');
    // 강
    strokePaths(ctx, [M.river], 11.6, '#d2c48c');
    strokePaths(ctx, [M.river], 10.2, '#2c7ab4');
    strokePaths(ctx, [M.river], 6.4, '#3a8fcb');
    // 라인(흙길)
    strokePaths(ctx, M.lanes, 11.2, '#a58c5a');
    strokePaths(ctx, M.lanes, 10.0, '#c9b078');
    strokePaths(ctx, M.lanes, 4.6, 'rgba(226,206,150,0.5)');
    fillBlobs(ctx, dLD, 'rgba(255,244,205,0.09)'); fillBlobs(ctx, dDD, 'rgba(96,66,26,0.09)');
    // 강을 건너는 돌다리 (탑·바텀)
    for (const by of [13, MH - 13]) {
      if (by < v.top - 12 || by > v.bottom + 12) continue;
      X.rr(ctx, 122.4, by - 5.9, 15.2, 11.8, 1.2); X.fs(ctx, '#9aa0b2', '#4a5068', 0.3);
      ctx.strokeStyle = 'rgba(60,66,90,0.4)'; ctx.lineWidth = 0.14; ctx.beginPath();
      for (let x = 124.4; x < 137; x += 1.9) { ctx.moveTo(x, by - 5.5); ctx.lineTo(x, by + 5.5); }
      ctx.stroke();
      X.rr(ctx, 122.4, by - 6.3, 15.2, 0.9, 0.4); X.fs(ctx, '#bcc2d0', '#4a5068', 0.2);
      X.rr(ctx, 122.4, by + 5.4, 15.2, 0.9, 0.4); X.fs(ctx, '#bcc2d0', '#4a5068', 0.2);
    }
    // 중앙 광장
    if (Math.abs(130 - v.cx) < v.hw + 12 && Math.abs(80 - v.cy) < v.hh + 12) {
      X.circle(ctx, 130, 80, 8.2); X.fs(ctx, '#8d93a6', '#4a5068', 0.3);
      X.circle(ctx, 130, 80, 6.2); ctx.strokeStyle = 'rgba(60,66,90,0.5)'; ctx.lineWidth = 0.2; ctx.stroke();
      X.circle(ctx, 130, 80, 3.4); ctx.fillStyle = '#a7adbd'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.39; ctx.moveTo(130 + Math.cos(a) * 3.4, 80 + Math.sin(a) * 3.4); ctx.lineTo(130 + Math.cos(a) * 8.2, 80 + Math.sin(a) * 8.2); } ctx.stroke();
      X.poly(ctx, [130, 77.6, 131.5, 80, 130, 82.4, 128.5, 80]); ctx.fillStyle = '#d9c890'; ctx.fill();
    }
    // 본진 광장
    for (let team = 0; team < 2; team++) {
      const b = M.bases[team], tc = C.TEAM_COLORS[team];
      if (Math.abs(b.core.x - v.cx) > v.hw + 26) continue;
      X.circle(ctx, b.core.x, b.core.y, 22.8); X.fs(ctx, '#7f8598', '#454b62', 0.4);
      X.circle(ctx, b.core.x, b.core.y, 21.4); ctx.fillStyle = '#8f95a8'; ctx.fill();
      ctx.strokeStyle = 'rgba(60,66,90,0.4)'; ctx.lineWidth = 0.18;
      for (const r of [8, 13, 17.5]) { X.circle(ctx, b.core.x, b.core.y, r); ctx.stroke(); }
      ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i * TAU / 12; ctx.moveTo(b.core.x + Math.cos(a) * 8, b.core.y + Math.sin(a) * 8); ctx.lineTo(b.core.x + Math.cos(a) * 21.4, b.core.y + Math.sin(a) * 21.4); } ctx.stroke();
      X.circle(ctx, b.core.x, b.core.y, 19.6); ctx.strokeStyle = X.rgba(tc, 0.55); ctx.lineWidth = 0.5; ctx.stroke();
      // 우물
      const f = b.fountain, pulse = 0.5 + Math.sin(t * 2.2) * 0.2;
      X.circle(ctx, f.x, f.y, 7.2); X.fs(ctx, '#a7adbd', '#454b62', 0.3);
      X.circle(ctx, f.x, f.y, 6.2); ctx.fillStyle = X.rgba(tc, 0.3 + pulse * 0.2); ctx.fill();
      X.circle(ctx, f.x, f.y, 5.4); ctx.strokeStyle = X.rgba(C.TEAM_LIGHT[team], 0.9); ctx.lineWidth = 0.28; ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = t * 0.5 + i * TAU / 6; ctx.moveTo(f.x + Math.cos(a) * 2, f.y + Math.sin(a) * 2); ctx.lineTo(f.x + Math.cos(a + 0.5) * 5.4, f.y + Math.sin(a + 0.5) * 5.4); } ctx.lineWidth = 0.2; ctx.stroke();
      X.glowAdd(ctx, f.x, f.y, 8 + pulse * 2, tc, 0.3);
    }
    // 작은 장식
    ctx.lineCap = 'round';
    if (dTuft.length) {
      ctx.beginPath();
      for (let i = 0; i < dTuft.length; i += 2) { const ox = dTuft[i], oy = dTuft[i + 1]; ctx.moveTo(ox - 0.18, oy); ctx.lineTo(ox - 0.26, oy - 0.36); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy - 0.48); ctx.moveTo(ox + 0.18, oy); ctx.lineTo(ox + 0.28, oy - 0.34); }
      ctx.strokeStyle = '#2f6b2c'; ctx.lineWidth = 0.1; ctx.stroke();
    }
    if (dPeb.length) { ctx.beginPath(); for (let i = 0; i < dPeb.length; i += 2) { ctx.moveTo(dPeb[i] + 0.2, dPeb[i + 1]); ctx.ellipse(dPeb[i], dPeb[i + 1], 0.2, 0.13, 0, 0, TAU); } ctx.fillStyle = '#8d93a0'; ctx.fill(); ctx.strokeStyle = 'rgba(30,34,48,0.6)'; ctx.lineWidth = 0.05; ctx.stroke(); }
    if (dCrack.length) { ctx.beginPath(); for (let i = 0; i < dCrack.length; i += 2) { ctx.moveTo(dCrack[i] - 0.35, dCrack[i + 1]); ctx.lineTo(dCrack[i], dCrack[i + 1] + 0.1); ctx.lineTo(dCrack[i] + 0.4, dCrack[i + 1] - 0.08); } ctx.strokeStyle = 'rgba(110,90,50,0.5)'; ctx.lineWidth = 0.07; ctx.stroke(); }
    for (let pass = 0; pass < 2; pass++) {
      const arr = pass ? dYe : dWh; if (!arr.length) continue;
      ctx.beginPath(); for (let i = 0; i < arr.length; i += 2) { ctx.moveTo(arr[i] + 0.13, arr[i + 1]); ctx.arc(arr[i], arr[i + 1], 0.13, 0, TAU); } ctx.fillStyle = pass ? '#ffd84a' : '#f4f4ea'; ctx.fill();
      ctx.beginPath(); for (let i = 0; i < arr.length; i += 2) { ctx.moveTo(arr[i] + 0.05, arr[i + 1]); ctx.arc(arr[i], arr[i + 1], 0.05, 0, TAU); } ctx.fillStyle = '#d98a2a'; ctx.fill();
    }
    if (dSpark.length) {     // 물결
      ctx.beginPath();
      for (let i = 0; i < dSpark.length; i += 2) { const ph = (t * 0.6 + U.hash2(dSpark[i] | 0, dSpark[i + 1] | 0, 2)) % 1, wv = 0.5 + ph * 0.9; ctx.moveTo(dSpark[i] - wv, dSpark[i + 1]); ctx.quadraticCurveTo(dSpark[i], dSpark[i + 1] - 0.3, dSpark[i] + wv, dSpark[i + 1]); }
      ctx.strokeStyle = 'rgba(210,240,255,0.42)'; ctx.lineWidth = 0.1; ctx.stroke();
    }
    // 진영 색조
    const gr = ctx.createLinearGradient(0, 0, MW, 0);
    gr.addColorStop(0, 'rgba(40,120,255,0.13)'); gr.addColorStop(0.42, 'rgba(40,120,255,0)'); gr.addColorStop(0.58, 'rgba(255,120,40,0)'); gr.addColorStop(1, 'rgba(255,120,40,0.15)');
    ctx.fillStyle = gr; ctx.fillRect(v.left - 2, v.top - 2, v.hw * 2 + 4, v.hh * 2 + 4);
    CV = null;
  }

  /* ---------- 지면 표시 (장판·사거리·표식) ---------- */
  function zoneColor(z) { return (W.me && z.team !== W.viewTeam && !z.friendly) ? '#ff4a3a' : z.vis.color; }
  function drawZonesGround(ctx, G, t) {
    for (const z of G.zones) {
      if (!visAt(z.x, z.y)) continue;
      const col = zoneColor(z), k = z.vis.kind;
      if (!z.active) {
        const p = z.delay > 0 ? U.clamp(z.t / z.delay, 0, 1) : 1;
        X.circle(ctx, z.x, z.y, z.radius); ctx.fillStyle = X.rgba(col, 0.13); ctx.fill();
        X.circle(ctx, z.x, z.y, z.radius * p); ctx.fillStyle = X.rgba(col, 0.26); ctx.fill();
        X.circle(ctx, z.x, z.y, z.radius); ctx.strokeStyle = X.rgba(col, 0.9); ctx.lineWidth = 0.2; ctx.stroke();
        if (k === 'meteor') { X.circle(ctx, z.x, z.y, z.radius * 0.5 * p); ctx.fillStyle = 'rgba(20,10,10,0.35)'; ctx.fill(); }
        if (k === 'bind') { X.circle(ctx, z.x, z.y, z.radius * (1.6 - 0.6 * p)); ctx.strokeStyle = X.rgba(col, 0.7); ctx.lineWidth = 0.14; ctx.stroke(); }
      } else {
        const life = U.clamp(1 - z.t / z.dur, 0, 1), a = Math.min(1, life * 4);
        X.circle(ctx, z.x, z.y, z.radius); ctx.fillStyle = X.rgba(col, 0.16 * a); ctx.fill();
        ctx.strokeStyle = X.rgba(col, 0.7 * a); ctx.lineWidth = 0.18; ctx.stroke();
        if (k === 'sanct') {
          ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(t * 0.5);
          X.circle(ctx, 0, 0, z.radius * 0.72); ctx.strokeStyle = X.rgba(col, 0.55 * a); ctx.lineWidth = 0.14; ctx.stroke();
          ctx.beginPath(); for (let i = 0; i < 6; i++) { const an = i * TAU / 6; ctx.moveTo(Math.cos(an) * z.radius * 0.72, Math.sin(an) * z.radius * 0.72); ctx.lineTo(Math.cos(an + TAU / 3) * z.radius * 0.72, Math.sin(an + TAU / 3) * z.radius * 0.72); } ctx.stroke();
          ctx.restore();
          if (rnd() < 0.5) part(z.x + (rnd() - 0.5) * z.radius * 1.5, z.y + (rnd() - 0.5) * z.radius * 1.5, 0, 0, 0, 2.5, 0.9, 0.24, '#fff0a8', true, 0);
        } else if (k === 'burn') {
          if (rnd() < 0.9) { const an = rnd() * TAU, rr = Math.sqrt(rnd()) * z.radius; part(z.x + Math.cos(an) * rr, z.y + Math.sin(an) * rr, 0, 0, 0, 3 + rnd() * 2, 0.6, 0.5, rnd() < 0.5 ? '#ff8a3c' : '#ffd27a', true, 0); }
        } else if (k === 'storm') {
          if (rnd() < 0.3) { const an = rnd() * TAU, rr = rnd() * z.radius, an2 = rnd() * TAU, rr2 = rnd() * z.radius; addFx({ kind: 'lightning', x1: z.x + Math.cos(an) * rr, y1: z.y + Math.sin(an) * rr, x2: z.x + Math.cos(an2) * rr2, y2: z.y + Math.sin(an2) * rr2, color: col, dur: 0.14, z: 0.3, seed: rnd() * 99, thin: true }); }
        } else if (k === 'arrows') {
          for (let i = 0; i < 2; i++) { const an = rnd() * TAU, rr = Math.sqrt(rnd()) * z.radius; addFx({ kind: 'arrowfall', x: z.x + Math.cos(an) * rr, y: z.y + Math.sin(an) * rr, color: col, dur: 0.22 }); }
        }
      }
    }
  }
  function drawIndicators(ctx, G, t) {
    const me = W.me;
    // 타워 사거리 경고
    if (me && !me.dead) {
      for (const s of G.structs) {
        if (s.team === me.team || s.dead) continue;
        const d = U.du(me, s);
        if (d > s.range + 9) continue;
        const aimed = s.target === me, a = aimed ? 0.75 + Math.sin(t * 14) * 0.2 : U.clamp(1 - (d - s.range) / 9, 0.15, 0.55);
        X.circle(ctx, s.x, s.y, s.range); ctx.strokeStyle = X.rgba(aimed ? '#ff3a2a' : '#ffb04a', a); ctx.lineWidth = aimed ? 0.3 : 0.16;
        ctx.setLineDash(aimed ? [] : [1.2, 0.9]); ctx.stroke(); ctx.setLineDash([]);
        if (aimed) { ctx.fillStyle = 'rgba(255,60,40,0.07)'; ctx.fill(); }
      }
      // 아군 포탑의 보호 범위: 적 영웅과 싸우는 중이거나 체력이 낮을 때 보여 준다 (불리하면 이 안으로)
      if (me.hp / me.maxHp < 0.6 || G.t - me.lastHeroHurt < 4) {
        for (const s of G.structs) {
          if (s.team !== me.team || s.dead || U.du(me, s) > s.range + 24) continue;
          X.circle(ctx, s.x, s.y, s.range); ctx.strokeStyle = X.rgba('#6cbcff', 0.55); ctx.lineWidth = 0.16;
          ctx.setLineDash([1.2, 0.9]); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(80,160,255,0.05)'; ctx.fill();
        }
      }
    }
    // 스킬 조준 표시
    const aim = W.aim;
    if (aim && me && !me.dead) {
      const ab = aim.ab, mx = W.mouse.x, my = W.mouse.y;
      let dx = mx - me.x, dy = my - me.y, d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const col = aim.ok ? '#8fd8ff' : '#ff8a80';
      if (ab.range) { X.circle(ctx, me.x, me.y, ab.range + (ab.type === 'unit' ? 0.9 : 0)); ctx.strokeStyle = X.rgba(col, 0.5); ctx.lineWidth = 0.14; ctx.stroke(); ctx.fillStyle = X.rgba(col, 0.04); ctx.fill(); }
      if (ab.type === 'dir') {
        const hw = (ab.width || 1) + 0.25, L = ab.range, nx = -dy, ny = dx;
        const g = ctx.createLinearGradient(me.x, me.y, me.x + dx * L, me.y + dy * L);
        g.addColorStop(0, X.rgba(col, 0.1)); g.addColorStop(1, X.rgba(col, 0.42));
        X.poly(ctx, [me.x + nx * hw, me.y + ny * hw, me.x + dx * (L - 1.4) + nx * hw, me.y + dy * (L - 1.4) + ny * hw, me.x + dx * (L - 1.4) + nx * hw * 1.9, me.y + dy * (L - 1.4) + ny * hw * 1.9, me.x + dx * L, me.y + dy * L,
          me.x + dx * (L - 1.4) - nx * hw * 1.9, me.y + dy * (L - 1.4) - ny * hw * 1.9, me.x + dx * (L - 1.4) - nx * hw, me.y + dy * (L - 1.4) - ny * hw, me.x - nx * hw, me.y - ny * hw]);
        ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = X.rgba(col, 0.75); ctx.lineWidth = 0.12; ctx.stroke();
      } else if (ab.type === 'ground') {
        const dd = Math.min(d, ab.range), tx = me.x + dx * dd, ty = me.y + dy * dd, r = ab.radius || 1.2;
        X.circle(ctx, tx, ty, r); ctx.fillStyle = X.rgba(col, 0.2); ctx.fill(); ctx.strokeStyle = X.rgba(col, 0.9); ctx.lineWidth = 0.16; ctx.stroke();
        X.line(ctx, tx - 0.5, ty, tx + 0.5, ty, X.rgba(col, 0.9), 0.1); X.line(ctx, tx, ty - 0.5, tx, ty + 0.5, X.rgba(col, 0.9), 0.1);
      } else if (ab.type === 'self' && ab.radius) {
        X.circle(ctx, me.x, me.y, ab.radius); ctx.fillStyle = X.rgba(col, 0.14); ctx.fill(); ctx.strokeStyle = X.rgba(col, 0.85); ctx.lineWidth = 0.16; ctx.stroke();
      } else if ((ab.type === 'unit' || ab.type === 'ally') && aim.target) {
        const u = aim.target; X.circle(ctx, u.x, u.y, u.r + 0.7); ctx.strokeStyle = X.rgba(ab.type === 'ally' ? '#8dffa0' : '#ffe680', 0.95); ctx.lineWidth = 0.2; ctx.stroke();
        X.line(ctx, me.x, me.y, u.x, u.y, X.rgba(col, 0.35), 0.12);
      }
    }
    // 커서 아래 유닛 강조
    const hv = W.hover;
    if (hv && !hv.dead) {
      const enemy = me ? hv.team !== me.team : false;
      X.circle(ctx, hv.x, hv.y, hv.r + 0.55); ctx.strokeStyle = X.rgba(enemy ? '#ff4a3a' : '#7dff8a', 0.9); ctx.lineWidth = 0.17; ctx.stroke();
    }
  }
  /* 포탑이 지금 누구를 노리는지 보여 주는 조준선 (나를 노리면 굵고 붉게, 조준 경고 중에는 깜박인다) */
  function drawTowerAim(ctx, G, t) {
    const me = W.me;
    for (const s of G.structs) {
      if (s.dead) continue;
      const tg = s.target; if (!tg || tg.dead) continue;
      if (tg !== me && !visU(tg)) continue;
      const mine = tg === me, hero = !!tg.isHero;
      if (!hero && !(me && !me.dead && U.du(me, s) < s.range + 12)) continue;        // 미니언을 쏘는 포탑은 내가 근처에 있을 때만
      const locking = s.lockT > 0, top = s.kind === 'core' ? A.CORE_H * 0.8 : A.TOWER_H * 0.84;
      const x1 = s.x, y1 = s.y - top, x2 = tg.x, y2 = tg.y - unitH(tg) * 0.45;
      const col = mine ? '#ff3a2a' : hero ? (me && tg.team === me.team ? '#ff8a5c' : '#8fd0ff') : (me && s.team !== me.team ? '#ffd27a' : '#9bd4ff');
      const a = locking ? 0.35 + 0.65 * Math.abs(Math.sin(t * 16)) : mine ? 0.85 : hero ? 0.6 : 0.3;
      ctx.lineCap = 'round';
      X.line(ctx, x1, y1, x2, y2, X.rgba(col, a * 0.35), mine ? 0.5 : 0.28);
      X.line(ctx, x1, y1, x2, y2, X.rgba(col, a), mine ? 0.16 : 0.08);
      X.circle(ctx, tg.x, tg.y, tg.r + 0.5); ctx.strokeStyle = X.rgba(col, a); ctx.lineWidth = mine ? 0.2 : 0.12; ctx.stroke();
      if (locking && hero) {                 // 조준이 끝나면 쏜다: 진행 고리
        const f = 1 - s.lockT / Math.max(0.01, s.lockMax);
        ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r + 0.95, -Math.PI / 2, -Math.PI / 2 + TAU * f);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.16; ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }
  /* 지면에서 솟는 빛기둥 (가산 혼합 상태에서 호출) */
  function column(ctx, x, y, w, h, color, a) {
    if (!(a > 0) || !(w > 0)) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(X.glowSprite(color), 0, 0, 64, 32, x - w, y - h, w * 2, h);
    ctx.globalAlpha = a * 0.85 > 1 ? 1 : a * 0.85;
    ctx.drawImage(X.glowSprite('#ffffff'), 0, 0, 64, 32, x - w * 0.42, y - h * 0.9, w * 0.84, h * 0.9);
    ctx.globalAlpha = 1;
  }
  function drawFxList(ctx, t, ground) {
    const list = W.fx;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (!!f.g !== ground) continue;
      if (f.delay > 0) continue;
      if (f.follow && !f.follow.dead) { f.x = f.follow.x; f.y = f.follow.y; }
      const p = U.clamp(f.t / f.dur, 0, 1), a = 1 - p;
      switch (f.kind) {
        case 'ring': { const r = U.lerp(f.r0, f.r1, U.easeOut(p)); X.circle(ctx, f.x, f.y, r); ctx.strokeStyle = X.rgba(f.color, a * 0.9); ctx.lineWidth = 0.1 + 0.26 * a; ctx.stroke(); break; }
        case 'nova': { const r = f.r * U.easeOut(p); X.circle(ctx, f.x, f.y, r); ctx.fillStyle = X.rgba(f.color, 0.3 * a); ctx.fill(); ctx.strokeStyle = X.rgba(f.color, a); ctx.lineWidth = 0.15 + 0.4 * a; ctx.stroke(); break; }
        case 'quake': {
          const r = f.r * U.easeOut(p);
          X.circle(ctx, f.x, f.y, r); ctx.fillStyle = X.rgba(f.color, 0.22 * a); ctx.fill(); ctx.strokeStyle = X.rgba(f.color, a); ctx.lineWidth = 0.3 * a + 0.08; ctx.stroke();
          ctx.beginPath(); for (let j = 0; j < 7; j++) { const an = f.seed + j * 0.9; ctx.moveTo(f.x + Math.cos(an) * r * 0.25, f.y + Math.sin(an) * r * 0.25); ctx.lineTo(f.x + Math.cos(an + 0.15) * r * 0.62, f.y + Math.sin(an + 0.15) * r * 0.62); ctx.lineTo(f.x + Math.cos(an - 0.05) * r * 0.95, f.y + Math.sin(an - 0.05) * r * 0.95); }
          ctx.strokeStyle = X.rgba('#3a2a1a', 0.6 * a); ctx.lineWidth = 0.14; ctx.stroke(); break;
        }
        case 'click': { const r = 1.5 * (1 - p) + 0.3; X.circle(ctx, f.x, f.y, r); ctx.strokeStyle = X.rgba(f.color, a); ctx.lineWidth = 0.18; ctx.stroke(); X.circle(ctx, f.x, f.y, 0.22); ctx.fillStyle = X.rgba(f.color, a); ctx.fill(); break; }
        case 'ping': { for (let j = 0; j < 3; j++) { const q = (f.t * 1.3 + j / 3) % 1; X.circle(ctx, f.x, f.y, 1 + q * 6); ctx.strokeStyle = X.rgba(f.color, (1 - q) * Math.min(1, a * 3)); ctx.lineWidth = 0.25; ctx.stroke(); } X.circle(ctx, f.x, f.y, 0.6); ctx.fillStyle = X.rgba(f.color, Math.min(1, a * 3)); ctx.fill(); break; }
        case 'mark': { const r = 3.2 - 2.1 * p; X.circle(ctx, f.x, f.y, r); ctx.strokeStyle = X.rgba(f.color, 0.5 + p * 0.5); ctx.lineWidth = 0.2; ctx.stroke(); X.line(ctx, f.x - r, f.y, f.x + r, f.y, X.rgba(f.color, 0.4), 0.1); X.line(ctx, f.x, f.y - r, f.x, f.y + r, X.rgba(f.color, 0.4), 0.1); break; }
        case 'aimline': { X.line(ctx, f.x1, f.y1, f.x2, f.y2, X.rgba(f.color, 0.12 + p * 0.3), f.w * 2); X.line(ctx, f.x1, f.y1, f.x2, f.y2, X.rgba(f.color, 0.5 + p * 0.5), 0.12 + p * 0.2); break; }
        case 'slash': {
          ctx.save(); ctx.translate(f.x, f.y - f.z); ctx.rotate(f.ang);
          const sw = -1.1 + p * 2.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(-f.r * 0.5, 0, f.r, sw - 0.9, sw + 0.3); ctx.strokeStyle = X.rgba(f.color, a * 0.9); ctx.lineWidth = 0.42 * a + 0.08; ctx.stroke();
          ctx.restore(); break;
        }
        case 'spin': {
          ctx.save(); ctx.translate(f.x, f.y - f.z); ctx.lineCap = 'round';
          const an = p * TAU * 1.2;
          ctx.beginPath(); ctx.ellipse(0, 0, f.r, f.r * 0.82, 0, an - 2.4, an); ctx.strokeStyle = X.rgba(f.color, a * 0.85); ctx.lineWidth = 0.5 * a + 0.1; ctx.stroke();
          ctx.beginPath(); ctx.ellipse(0, 0, f.r * 0.7, f.r * 0.57, 0, an - 1.6, an); ctx.strokeStyle = X.rgba('#ffffff', a * 0.7); ctx.lineWidth = 0.22; ctx.stroke();
          ctx.restore(); break;
        }
        case 'beam': {
          ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
          X.line(ctx, f.x1, f.y1 - f.z, f.x2, f.y2 - f.z, X.rgba(f.color, a * 0.42), f.w * (1.2 + 0.9 * a));
          X.line(ctx, f.x1, f.y1 - f.z, f.x2, f.y2 - f.z, X.rgba('#ffffff', a), Math.max(0.06, f.w * 0.5 * a));
          ctx.globalCompositeOperation = 'source-over'; break;
        }
        case 'lightning': {
          const n = 6, dx = f.x2 - f.x1, dy = f.y2 - f.y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
          const fl = Math.floor(f.t * 30);
          ctx.beginPath(); ctx.moveTo(f.x1, f.y1 - f.z);
          for (let j = 1; j < n; j++) { const o = (U.hash2(j, fl, f.seed | 0) - 0.5) * Math.min(2.2, len * 0.22); ctx.lineTo(f.x1 + dx * j / n + nx * o, f.y1 + dy * j / n + ny * o - f.z); }
          ctx.lineTo(f.x2, f.y2 - f.z);
          ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = X.rgba(f.color, a * 0.6); ctx.lineWidth = f.thin ? 0.22 : 0.55; ctx.stroke();
          ctx.strokeStyle = X.rgba('#ffffff', a); ctx.lineWidth = f.thin ? 0.07 : 0.16; ctx.stroke();
          ctx.globalCompositeOperation = 'source-over'; break;
        }
        case 'thunder': {
          const fl = Math.floor(f.t * 28);
          ctx.beginPath(); ctx.moveTo(f.x + 3, f.y - 30);
          for (let j = 1; j < 8; j++) ctx.lineTo(f.x + 3 * (1 - j / 8) + (U.hash2(j, fl, f.seed | 0) - 0.5) * 2.4, f.y - 30 * (1 - j / 8));
          ctx.lineTo(f.x, f.y);
          ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = X.rgba(f.color, a * 0.7); ctx.lineWidth = 0.9; ctx.stroke(); ctx.strokeStyle = X.rgba('#ffffff', a); ctx.lineWidth = 0.28; ctx.stroke();
          X.glow(ctx, f.x, f.y - 0.5, 4.5 * a + 1, f.color, a);
          ctx.globalCompositeOperation = 'source-over'; break;
        }
        case 'explode': {
          const r = f.r * U.easeOut3(p);
          ctx.globalCompositeOperation = 'lighter';
          X.glow(ctx, f.x, f.y - f.z, r * 1.5, f.color, a);
          X.glow(ctx, f.x, f.y - f.z, r * 0.8, '#ffffff', a * 0.8);
          ctx.globalCompositeOperation = 'source-over';
          X.circle(ctx, f.x, f.y - f.z * 0.4, r); ctx.strokeStyle = X.rgba(f.color, a * 0.8); ctx.lineWidth = 0.35 * a + 0.05; ctx.stroke(); break;
        }
        case 'pillar': {
          ctx.globalCompositeOperation = 'lighter';
          column(ctx, f.x, f.y, f.w * (1.25 - p * 0.45), 15, f.color, a);
          X.glow(ctx, f.x, f.y, f.w * 2.6, f.color, a * 0.8);
          ctx.globalCompositeOperation = 'source-over'; break;
        }
        case 'levelup': {
          const r = 1 + p * 2.6;
          X.circle(ctx, f.x, f.y, r); ctx.strokeStyle = X.rgba('#ffe680', a); ctx.lineWidth = 0.3 * a + 0.05; ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          column(ctx, f.x, f.y, 1.7, 9, '#ffe680', a * 0.8);
          ctx.globalCompositeOperation = 'source-over';
          if (rnd() < 0.6) part(f.x + (rnd() - 0.5) * 2.2, f.y + (rnd() - 0.5), 0, 0, 0, 5, 0.6, 0.26, '#ffe680', true, 0);
          break;
        }
        case 'recall': {
          const u = f.follow;
          if (!u || u.dead || !u.recall) { f.t = f.dur; break; }
          const q = u.recall.t / C.RECALL_TIME;
          ctx.globalCompositeOperation = 'lighter';
          column(ctx, f.x, f.y, 1.8, 10, '#7fc8ff', 0.3 + q * 0.55);
          ctx.globalCompositeOperation = 'source-over';
          for (let j = 0; j < 3; j++) { const rr = ((t * 0.9 + j / 3) % 1); X.circle(ctx, f.x, f.y, 2.4 * (1 - rr) + 0.3); ctx.strokeStyle = X.rgba('#9bd4ff', rr * 0.8); ctx.lineWidth = 0.14; ctx.stroke(); }
          if (rnd() < 0.5) part(f.x + (rnd() - 0.5) * 2.4, f.y + (rnd() - 0.5) * 1.2, 0, 0, 0, 4, 0.7, 0.22, '#9bd4ff', true, 0);
          break;
        }
        case 'arrowfall': {
          const zz = 14 * (1 - p);
          X.line(ctx, f.x + zz * 0.25, f.y - zz - 1.6, f.x + zz * 0.25 - 0.4, f.y - zz, X.rgba('#f2e6c0', 0.95), 0.12);
          if (p > 0.92) { X.circle(ctx, f.x, f.y, 0.35); ctx.fillStyle = X.rgba(f.color, 0.6); ctx.fill(); }
          break;
        }
        default: break;
      }
    }
  }

  /* ---------- 유닛 ---------- */
  const POSE = { t: 0, walk: 0, moving: false, atk: -1, cast: -1, stun: false };
  const SP = { t: 0, seed: 0, tier: 1, hpP: 1, flash: 0 };
  function vstate(u) {
    let v = u._v;
    if (!v) v = u._v = { alpha: W.fogOn && u.team !== W.viewTeam ? 0 : 1, flash: 0, dir: Math.cos(u.facing) >= 0 ? 1 : -1, hpLag: u.hp, trailT: 0 };
    return v;
  }
  function drawUnit(ctx, u, G, dt) {
    const v = vstate(u), t = G.t;
    if (u.isStruct) {
      SP.t = W.clock; SP.seed = u.id; SP.tier = u.tier; SP.hpP = u.hp / u.maxHp; SP.flash = Math.max(0, 1 - (G.t - u.lastShotT) / 0.25);
      ctx.save(); ctx.translate(u.x, u.y);
      if (u.kind === 'core') A.core(ctx, u.team, SP); else A.tower(ctx, u.team, SP);
      ctx.restore();
      if (SP.hpP < 0.5 && rnd() < 0.12) part(u.x + (rnd() - 0.5) * 1.6, u.y, 3 + rnd() * 3, (rnd() - 0.5), 0, 1.6, 1.2, 0.8, '#3c3f4a', false, 0);
      if (G.burning && u.kind === 'core' && !u.dead) { for (let i = 0; i < 2; i++) part(u.x + (rnd() - 0.5) * 5, u.y - rnd() * 1.5, 1 + rnd() * 6, (rnd() - 0.5) * 1.5, 0, 3 + rnd() * 3, 0.7, 0.7, rnd() < 0.5 ? '#ff6a2a' : '#ffd27a', true, 0); }
      return;
    }
    const cf = Math.cos(u.facing);
    if (cf > 0.2) v.dir = 1; else if (cf < -0.2) v.dir = -1;
    let alpha = v.alpha;
    if (u.stealth) alpha *= 0.42;
    if (alpha <= 0.02) return;
    POSE.t = W.clock + u.id * 0.37; POSE.walk = u.walkPhase || 0; POSE.moving = !!u.moving && !u.dash; POSE.stun = u.stunned;
    if (u.wind) POSE.atk = 0.5 * u.wind.t / u.wind.dur; else { const d = t - u.lastAtkT; POSE.atk = d < 0.3 ? 0.5 + 0.5 * d / 0.3 : -1; }
    POSE.cast = -1;
    if (u.isHero) { if (u.cast) POSE.cast = 0.5 * u.cast.t / u.cast.dur; else { const d = t - u.lastCastT; if (d < 0.32) POSE.cast = 0.5 + 0.5 * d / 0.32; } if (u.recall) POSE.cast = 0.5; }
    ctx.save();
    ctx.translate(u.x, u.y);
    if (alpha < 0.99) ctx.globalAlpha = alpha;
    if (u.dash) { ctx.translate(0, -(u.dash.o.leap ? Math.sin(U.clamp(u.dash.t / Math.max(0.05, u.dash.dist / u.dash.speed), 0, 1) * Math.PI) * 2.6 : 0.25)); ctx.rotate(v.dir * 0.22); }
    const spawn = t - u.spawnT;
    if (spawn < 0.35 && spawn >= 0) { const s = 0.4 + 0.6 * U.easeOut(spawn / 0.35); ctx.scale(s, s); }
    ctx.scale(v.dir, 1);
    if (u.isHero) A.hero(ctx, u.heroId, u.team, POSE); else A.minion(ctx, u.kind, u.team, POSE);
    ctx.restore();
    // 피격 섬광
    if (v.flash > 0.05) { X.glowAdd(ctx, u.x, u.y - (u.isHero ? 1.3 : 0.6), (u.isHero ? 1.6 : 1.0), '#ffffff', v.flash * 0.55 * alpha); }
    v.flash *= Math.exp(-dt * 14);
    // 대시 잔상
    if (u.dash && u.dash.o.trail) { v.trailT -= dt; if (v.trailT <= 0) { v.trailT = 0.02; part(u.x, u.y, 1.0, 0, 0, 0, 0.3, 1.3, u.dash.o.trail, true, 0); } }
  }
  function drawBuffs(ctx, u, t) {
    if (!u.buffs.length) return;
    const h = unitH(u);
    for (const b of u.buffs) {
      const life = Math.min(1, (b.dur - b.t) * 3);
      switch (b.fx) {
        case 'shield': if (b.shield > 0) { X.circle(ctx, u.x, u.y - h * 0.45, h * 0.62); ctx.fillStyle = X.rgba(b.color || '#bfe0ff', 0.16 * life); ctx.fill(); ctx.strokeStyle = X.rgba(b.color || '#bfe0ff', 0.75 * life); ctx.lineWidth = 0.12; ctx.stroke(); } break;
        case 'stun': for (let i = 0; i < 3; i++) { const a = t * 5 + i * TAU / 3, sx = u.x + Math.cos(a) * 0.75, sy = u.y - h - 0.25 + Math.sin(a) * 0.24; X.poly(ctx, [sx, sy - 0.24, sx + 0.09, sy - 0.08, sx + 0.25, sy - 0.07, sx + 0.12, sy + 0.05, sx + 0.16, sy + 0.22, sx, sy + 0.12, sx - 0.16, sy + 0.22, sx - 0.12, sy + 0.05, sx - 0.25, sy - 0.07, sx - 0.09, sy - 0.08]); X.fs(ctx, '#ffe680', '#171a2c', 0.05); } break;
        case 'rage': X.glowAdd(ctx, u.x, u.y - 1.1, 2.2 + Math.sin(t * 12) * 0.2, b.color, 0.42 * life); break;
        case 'undying': X.glowAdd(ctx, u.x, u.y - 1.2, 2.8 + Math.sin(t * 10) * 0.3, b.color, 0.6 * life); if (rnd() < 0.5) part(u.x + (rnd() - 0.5) * 1.4, u.y, rnd(), 0, 0, 4, 0.5, 0.3, b.color, true, 0); break;
        case 'haste': if (rnd() < 0.5 && u.moving) part(u.x + (rnd() - 0.5), u.y, 0.3 + rnd() * 1.4, -u.vx * 0.2, -u.vy * 0.2, 0, 0.3, 0.22, b.color, true, 0); break;
        case 'empower': X.glowAdd(ctx, u.x + (u._v ? u._v.dir : 1) * 0.5, u.y - 1.0, 0.9 + Math.sin(t * 9) * 0.12, b.color, 0.7 * life); break;
        case 'burn': if (rnd() < 0.45) part(u.x + (rnd() - 0.5) * 0.9, u.y, 0.4 + rnd() * h * 0.6, 0, 0, 2.6 + rnd(), 0.45, 0.3, rnd() < 0.5 ? '#ff8a3c' : '#ffd27a', true, 0); break;
        default: break;
      }
    }
  }
  function drawUnitGround(ctx, u, t) {
    const v = vstate(u), a = v.alpha * (u.stealth ? 0.42 : 1);
    if (a <= 0.02) return;
    if (u.isHero) {
      const me = u === W.me;
      const col = me ? '#7dff8a' : C.TEAM_COLORS[u.team];
      X.circle(ctx, u.x, u.y, 1.2); ctx.strokeStyle = X.rgba(col, 0.85 * a); ctx.lineWidth = me ? 0.2 : 0.15; ctx.stroke();
      ctx.fillStyle = X.rgba(col, 0.13 * a); ctx.fill();
      if (me) { ctx.beginPath(); for (let i = 0; i < 4; i++) { const an = t * 1.5 + i * TAU / 4; ctx.moveTo(u.x + Math.cos(an) * 1.42, u.y + Math.sin(an) * 1.42); ctx.arc(u.x, u.y, 1.42, an, an + 0.5); } ctx.strokeStyle = X.rgba('#ffffff', 0.7 * a); ctx.lineWidth = 0.09; ctx.stroke(); }
    }
    for (const b of u.buffs) {
      if (b.fx === 'slow') { X.circle(ctx, u.x, u.y, u.r + 0.45); ctx.strokeStyle = X.rgba('#8fd3ff', 0.7 * a); ctx.lineWidth = 0.14; ctx.stroke(); }
      else if (b.fx === 'root') { ctx.beginPath(); for (let i = 0; i < 8; i++) { const an = i * TAU / 8 + 0.2; ctx.moveTo(u.x + Math.cos(an) * (u.r + 0.2), u.y + Math.sin(an) * (u.r + 0.2)); ctx.lineTo(u.x + Math.cos(an + 0.3) * (u.r + 0.9), u.y + Math.sin(an + 0.3) * (u.r + 0.9)); } ctx.strokeStyle = X.rgba('#ffe680', 0.9 * a); ctx.lineWidth = 0.16; ctx.stroke(); X.circle(ctx, u.x, u.y, u.r + 0.3); ctx.stroke(); }
    }
    // 그림자
    const sr = u.isHero ? 0.9 : u.r * 1.1;
    X.ell(ctx, u.x, u.y + 0.05, sr, sr * 0.45); ctx.fillStyle = X.rgba('#060a12', 0.3 * a); ctx.fill();
  }
  function drawCorpse(ctx, c) {
    const p = c.t / c.dur, fall = U.easeOut(Math.min(1, c.t / 0.28));
    ctx.save(); ctx.translate(c.x, c.y + fall * 0.2);
    ctx.globalAlpha = U.clamp(1 - (p - 0.45) / 0.55, 0, 1);
    ctx.rotate(-c.dir * fall * 1.45); ctx.scale(c.dir, 1);
    POSE.t = 0; POSE.walk = 0; POSE.moving = false; POSE.atk = -1; POSE.cast = -1; POSE.stun = true;
    if (c.type === 'hero') A.hero(ctx, c.id, c.team, POSE); else A.minion(ctx, c.mk, c.team, POSE);
    ctx.restore();
  }
  function drawProj(ctx, p, t, dt) {
    const k = p.vis.kind, col = p.vis.color, sz = p.vis.size || 1, z = 1.15;
    const x = p.x, y = p.y - z;
    X.ell(ctx, p.x, p.y, 0.3 * sz, 0.14 * sz); ctx.fillStyle = 'rgba(6,10,18,0.25)'; ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.ang);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (k === 'arrow') {
      if (sz > 1.2) X.glowAdd(ctx, 0, 0, 1.3, col, 0.7);
      X.line(ctx, -1.1 * sz, 0, 0.5 * sz, 0, '#171a2c', 0.2 * sz); X.line(ctx, -1.1 * sz, 0, 0.5 * sz, 0, sz > 1.2 ? col : '#f2e6c0', 0.1 * sz);
      X.poly(ctx, [0.4 * sz, -0.2 * sz, 0.95 * sz, 0, 0.4 * sz, 0.2 * sz]); X.fs(ctx, '#e8eef8', '#171a2c', 0.05);
      X.poly(ctx, [-1.1 * sz, 0, -1.4 * sz, -0.2 * sz, -1.0 * sz, 0, -1.4 * sz, 0.2 * sz]); ctx.fillStyle = col; ctx.fill();
    } else if (k === 'fire') {
      X.glowAdd(ctx, 0, 0, 1.5 * sz, col, 0.95); X.circle(ctx, 0, 0, 0.38 * sz); ctx.fillStyle = '#fff3c4'; ctx.fill();
      X.poly(ctx, [-0.3 * sz, -0.3 * sz, -1.5 * sz, 0, -0.3 * sz, 0.3 * sz]); ctx.fillStyle = X.rgba(col, 0.8); ctx.fill();
    } else if (k === 'shuriken') {
      ctx.rotate(t * 22);
      const s = 0.55 * sz; X.poly(ctx, [0, -s, s * 0.25, -s * 0.25, s, 0, s * 0.25, s * 0.25, 0, s, -s * 0.25, s * 0.25, -s, 0, -s * 0.25, -s * 0.25]); X.fs(ctx, '#e6defc', '#171a2c', 0.06);
      X.glowAdd(ctx, 0, 0, 0.9 * sz, col, 0.6);
    } else if (k === 'light') {
      X.glowAdd(ctx, 0, 0, 1.4 * sz, col, 0.9);
      X.poly(ctx, [-1.0 * sz, 0, 0.1 * sz, -0.22 * sz, 0.95 * sz, 0, 0.1 * sz, 0.22 * sz]); X.fs(ctx, '#fffbe0', X.rgba(col, 0.9), 0.07);
    } else if (k === 'bullet') {
      X.line(ctx, -1.6 * sz, 0, 0.3 * sz, 0, X.rgba(col, 0.5), 0.16 * sz); X.line(ctx, -0.5 * sz, 0, 0.4 * sz, 0, '#fff8dc', 0.16 * sz);
      X.glowAdd(ctx, 0.2, 0, 0.7 * sz, col, 0.7);
    } else if (k === 'net') {
      ctx.rotate(t * 6);
      X.circle(ctx, 0, 0, 0.6 * sz); ctx.strokeStyle = '#171a2c'; ctx.lineWidth = 0.2; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 0.1; ctx.stroke();
      X.line(ctx, -0.6 * sz, 0, 0.6 * sz, 0, col, 0.07); X.line(ctx, 0, -0.6 * sz, 0, 0.6 * sz, col, 0.07);
    } else if (k === 'bolt') {
      X.glowAdd(ctx, 0, 0, 1.1 * sz, col, 0.9); X.circle(ctx, 0, 0, 0.26 * sz); ctx.fillStyle = '#ffffff'; ctx.fill();
      X.line(ctx, -0.9 * sz, 0.15, -0.3 * sz, -0.1, X.rgba(col, 0.9), 0.09);
    } else if (k === 'tower') {
      X.glowAdd(ctx, 0, 0, 1.9, col, 1); X.circle(ctx, 0, 0, 0.42); ctx.fillStyle = '#ffffff'; ctx.fill();
      X.poly(ctx, [-0.3, -0.34, -2.0, 0, -0.3, 0.34]); ctx.fillStyle = X.rgba(col, 0.75); ctx.fill();
    } else if (k === 'shell') {
      X.circle(ctx, 0, 0, 0.3); X.fs(ctx, '#2c3040', '#171a2c', 0.06); X.glowAdd(ctx, -0.3, 0, 0.6, '#ffb066', 0.6);
    } else {
      X.glowAdd(ctx, 0, 0, 0.8, col, 0.85); X.circle(ctx, 0, 0, 0.2); ctx.fillStyle = '#ffffff'; ctx.fill();
    }
    ctx.restore();
    if ((k === 'fire' || k === 'tower' || (p.skill && k !== 'bullet')) && rnd() < 0.7) part(p.x - Math.cos(p.ang) * 0.6, p.y - Math.sin(p.ang) * 0.6, z, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2, rnd(), 0.3, 0.3 * sz, col, true, 0);
  }
  /* 유성(지연 장판 위 하늘에서 떨어지는 연출) */
  function drawZonesAir(ctx, G) {
    for (const z of G.zones) {
      if (z.active || z.vis.kind !== 'meteor' || !visAt(z.x, z.y)) continue;
      const p = U.clamp(z.t / z.delay, 0, 1), hgt = (1 - p) * (1 - p) * 34 + 0.5, mx = z.x + hgt * 0.45, my = z.y - hgt;
      ctx.globalCompositeOperation = 'lighter';
      X.line(ctx, mx + 2.2, my - 4.6, mx, my, X.rgba('#ff8a3c', 0.5), 1.6);
      X.glow(ctx, mx, my, 4.2, '#ff6a2a', 1); X.glow(ctx, mx, my, 2.2, '#ffe9b0', 1);
      ctx.globalCompositeOperation = 'source-over';
      X.circle(ctx, mx, my, 1.25); X.fs(ctx, '#5a2a1a', '#171a2c', 0.1);
      X.circle(ctx, mx - 0.3, my + 0.3, 0.7); ctx.fillStyle = '#ff9340'; ctx.fill();
      if (rnd() < 0.8) part(mx + 1, my - 2, 0, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3, 0, 0.5, 0.7, '#ff8a3c', true, 0);
    }
  }
  function drawParts(ctx, dt) {
    const ps = W.parts;
    let w = 0;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz += p.grav * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.35; p.vx *= 0.6; p.vy *= 0.6; }
      const k = Math.exp(-dt * 2.5); p.vx *= k; p.vy *= k;
      ps[w++] = p;
      if (!p.add) continue;
      const a = p.life / p.max;
      X.glow(ctx, p.x, p.y - p.z, p.size * (0.6 + a * 0.8), p.color, a);
    }
    ps.length = w;
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]; if (p.add) continue;
      const a = p.life / p.max;
      X.circle(ctx, p.x, p.y - p.z, p.size * (1.3 - a * 0.5)); ctx.fillStyle = X.rgba(p.color, a * 0.7); ctx.fill();
    }
  }

  /* ---------- 머리 위 정보 (화면 좌표) ---------- */
  function barColor(u) { const me = W.me; if (!me) return C.TEAM_COLORS[u.team]; return u === me ? '#62dd62' : u.team === me.team ? '#4aa8ff' : '#ff5a52'; }
  function drawBars(ctx, G, v, dt) {
    const k = W.k, S = v.S;
    for (const u of G.units) {
      if (u.dead || u.x < v.left - 3 || u.x > v.right + 3 || u.y < v.top - 2 || u.y > v.bottom + 10) continue;
      const vs = u._v; if (!vs) continue;
      const alpha = u.isStruct ? 1 : vs.alpha * (u.stealth ? 0.5 : 1);
      if (alpha < 0.3) continue;
      const sx = (u.x - v.cx) * S + W.vw / 2, sy = (u.y - v.cy) * S + W.vh / 2 - unitH(u) * S;
      vs.hpLag = Math.max(u.hp, vs.hpLag - u.maxHp * dt * 0.7);
      const col = barColor(u);
      if (u.isMinion) {
        const bw = (u.kind === 'super' || u.kind === 'siege' ? 44 : 32) * k, bh = 4.5 * k, x = sx - bw / 2, y = sy - 7 * k;
        // 막타 표시 — 흰 눈금: 내 기본 공격 한 방의 피해 기준선.
        //   금색(지금!): 체력이 그 아래로 내려왔다 → 지금 치면 내 한 방에 쓰러진다
        //   연노랑 테두리(준비): 내 공격이 닿을 즈음이면 그 아래로 내려올 것 같다 (투사체가 느린 영웅은 이때 미리 눌러도 된다)
        const me = W.me; let thr = 0, killable = false, soon = false;
        if (me && !me.dead && u.team !== me.team) {
          thr = AOS.hitDamage(me, u); killable = u.hp <= thr;
          if (!killable && U.du(me, u) - u.r <= me.range + 4) soon = AOS.lastHit(G, me, u).now;
        }
        if (killable) {
          const q = 0.5 + 0.5 * Math.sin(W.clock * 12);
          ctx.fillStyle = X.rgba('#ffd84a', 0.55 + q * 0.45); ctx.fillRect(x - 3 * k, y - 3 * k, bw + 6 * k, bh + 6 * k);
        } else if (soon) { ctx.fillStyle = 'rgba(255,240,170,0.85)'; ctx.fillRect(x - 2.2 * k, y - 2.2 * k, bw + 4.4 * k, bh + 4.4 * k); }
        ctx.fillStyle = 'rgba(8,12,22,0.8)'; ctx.fillRect(x - k, y - k, bw + 2 * k, bh + 2 * k);
        ctx.fillStyle = killable ? '#ffe680' : col; ctx.fillRect(x, y, bw * U.clamp(u.hp / u.maxHp, 0, 1), bh);
        if (thr > 0 && !killable && thr < u.maxHp) { ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(x + bw * thr / u.maxHp - 0.75 * k, y - 1.5 * k, 1.5 * k, bh + 3 * k); }
        if (killable) {
          const cy0 = y - 9 * k - Math.abs(Math.sin(W.clock * 6)) * 3 * k;
          X.circle(ctx, sx, cy0, 5.5 * k); ctx.fillStyle = '#ffd84a'; ctx.fill(); ctx.strokeStyle = '#7a5a12'; ctx.lineWidth = 1.5 * k; ctx.stroke();
          X.circle(ctx, sx, cy0, 2.4 * k); ctx.fillStyle = '#fff3c4'; ctx.fill();
          if (W.csHelp) X.textO(ctx, '지금 우클릭!', sx, cy0 - 10 * k, 13 * k, '#ffe680', 'center', 800, 'rgba(8,12,22,0.95)', 3.5 * k);
        }
        continue;
      }
      const hero = u.isHero;
      const bw = (hero ? 92 : u.kind === 'core' ? 150 : 110) * k, bh = (hero ? 11 : 9) * k, x = sx - bw / 2, y = sy - (hero ? 20 : 14) * k;
      const total = Math.max(u.maxHp, u.hp + u.shield);
      X.rr(ctx, x - 2 * k, y - 2 * k, bw + 4 * k, bh + (hero ? 8 : 4) * k, 3 * k); ctx.fillStyle = 'rgba(8,12,22,0.86)'; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(x, y, bw * U.clamp(vs.hpLag / total, 0, 1), bh);
      ctx.fillStyle = (u.isStruct && !u.vulnerable) ? '#8a90a3' : col; ctx.fillRect(x, y, bw * U.clamp(u.hp / total, 0, 1), bh);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y, bw * U.clamp(u.hp / total, 0, 1), bh * 0.38);
      if (u.shield > 0) { ctx.fillStyle = '#eef6ff'; ctx.fillRect(x + bw * u.hp / total, y, bw * Math.min(u.shield, total - u.hp) / total, bh); }
      if (hero) {
        const step = total > 3000 ? 500 : 250; ctx.fillStyle = 'rgba(8,12,22,0.55)';
        for (let hpv = step; hpv < total; hpv += step) ctx.fillRect(x + bw * hpv / total - 0.5 * k, y, k, bh * 0.6);
        ctx.fillStyle = '#3f8cff'; ctx.fillRect(x, y + bh + k, bw * U.clamp(u.mp / Math.max(1, u.maxMp), 0, 1), 3 * k);
        X.circle(ctx, x - 9 * k, y + bh * 0.5 + k, 9.5 * k); ctx.fillStyle = 'rgba(8,12,22,0.92)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.5 * k; ctx.stroke();
        X.text(ctx, String(u.level), x - 9 * k, y + bh * 0.5 + k + 0.5 * k, 11 * k, '#ffffff', 'center', 700, 'middle');
        X.textO(ctx, u === W.me ? u.name + ' (나)' : u.name, sx, y - 5 * k, 12 * k, u === W.me ? '#b8ffb0' : col === '#ff5a52' ? '#ffc0ba' : '#cfe6ff', 'center', 700, 'rgba(8,12,22,0.9)', 3 * k);
      } else if (!u.vulnerable) X.textO(ctx, '보호 중', sx, y - 4 * k, 11 * k, '#c9cfdb', 'center', 700, 'rgba(8,12,22,0.9)', 3 * k);
      else {
        // 초반 방비(받는 피해 감소) · 후반 결전(받는 피해 증가)
        const fort = G.fortOf(u);
        if (G.burning && u.kind === 'core') X.textO(ctx, '무너지는 중!', sx, y - 4 * k, 12 * k, '#ff7466', 'center', 800, 'rgba(8,12,22,0.9)', 3 * k);
        else if (fort > 0.02) X.textO(ctx, '방비 −' + Math.round(fort * 100) + '%', sx, y - 4 * k, 11 * k, '#bcd2ff', 'center', 700, 'rgba(8,12,22,0.9)', 3 * k);
        else if (G.t > C.SHOWDOWN) X.textO(ctx, '약화 +' + Math.round(C.SHOWDOWN_RATE * (G.t - C.SHOWDOWN) * 100) + '%', sx, y - 4 * k, 11 * k, '#ffb38a', 'center', 700, 'rgba(8,12,22,0.9)', 3 * k);
      }
    }
  }
  function drawTexts(ctx, v, dt) {
    const k = W.k, S = v.S; let w = 0;
    for (let i = 0; i < W.texts.length; i++) {
      const f = W.texts[i]; f.t += dt;
      if (f.t >= f.dur) continue;
      W.texts[w++] = f;
      const p = f.t / f.dur;
      const sx = (f.x - v.cx) * S + W.vw / 2, sy = (f.y - v.cy) * S + W.vh / 2 - (f.z + p * 1.8) * S;
      const sc = p < 0.15 ? 0.7 + p / 0.15 * 0.5 : 1.2 - Math.min(0.2, (p - 0.15) * 0.6);
      ctx.globalAlpha = U.clamp((1 - p) * 2.2, 0, 1);
      X.textO(ctx, f.str, sx, sy, f.size * k * sc, f.color, 'center', 800, 'rgba(8,12,22,0.95)', 3.5 * k);
    }
    W.texts.length = w; ctx.globalAlpha = 1;
  }

  /* ---------- 메인 렌더 ---------- */
  const view = { left: 0, right: 0, top: 0, bottom: 0, cx: 0, cy: 0, hw: 0, hh: 0, S: 1 };
  const drawList = [];
  W.render = function (ctx, G, dt) {
    initStatic();
    W.clock += dt;
    const cam = W.cam, S = W.S * cam.zoom, vw = W.vw, vh = W.vh, t = W.clock;
    const cx = cam.x + cam.sx, cy = cam.y + cam.sy;
    const v = view; v.S = S; v.cx = cx; v.cy = cy; v.hw = vw / (2 * S); v.hh = vh / (2 * S);
    v.left = cx - v.hw; v.right = cx + v.hw; v.top = cy - v.hh; v.bottom = cy + v.hh;
    if (W.fogOn) fogUpdate(G, dt);
    // 적 유닛 시야 페이드
    for (const u of G.units) {
      const vs = vstate(u);
      const target = (u.dead && !u.isStruct) ? 0 : (visU(u) || u.isStruct ? 1 : 0);
      vs.alpha = U.approach(vs.alpha, target, dt * 6);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = FOREST; ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(S, 0, 0, S, vw / 2 - cx * S, vh / 2 - cy * S);
    drawGround(ctx, v, t);
    drawZonesGround(ctx, G, t);
    drawFxList(ctx, t, true);
    drawIndicators(ctx, G, t);
    // 정렬 대상 수집
    drawList.length = 0;
    const L = v.left - 3.5, R = v.right + 3.5, T = v.top - 2, B = v.bottom + 9.5;
    let lo = 0, hi = trees.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (trees[m].y < T) lo = m + 1; else hi = m; }
    for (let i = lo; i < trees.length; i++) { const tr = trees[i]; if (tr.y > B) break; if (tr.x < L || tr.x > R) continue; drawList.push({ y: tr.y, o: tr, k: 0 }); }
    for (const u of G.units) {
      if (u.dead || u.x < L || u.x > R || u.y < T || u.y > B + 3) continue;
      if (!u.isStruct) drawUnitGround(ctx, u, t);
      drawList.push({ y: u.y + (u.isStruct ? 0.6 : 0), o: u, k: 1 });
    }
    for (const c of W.corpses) drawList.push({ y: c.y, o: c, k: 2 });
    for (const r of W.rubble) { if (r.x < L - 6 || r.x > R + 6) continue; ctx.save(); ctx.translate(r.x, r.y); if (r.core) ctx.scale(1.9, 1.9); A.rubble(ctx, r.team); ctx.restore(); }
    drawList.sort((a, b) => a.y - b.y);
    for (let i = 0; i < drawList.length; i++) {
      const d = drawList[i];
      if (d.k === 0) {
        const tr = d.o, box = A.TREE_BOX[tr.kind];
        ctx.drawImage(treeSprite(tr), tr.x - box.ox * tr.s, tr.y - box.oy * tr.s, box.w * tr.s, box.h * tr.s);
      } else if (d.k === 1) { drawUnit(ctx, d.o, G, dt); if (!d.o.isStruct && d.o._v.alpha > 0.5) drawBuffs(ctx, d.o, t); }
      else drawCorpse(ctx, d.o);
    }
    ctx.globalAlpha = 1;
    // 공중 요소
    for (const p of G.projs) { if (visAt(p.x, p.y)) drawProj(ctx, p, t, dt); }
    drawTowerAim(ctx, G, t);
    drawZonesAir(ctx, G);
    drawFxList(ctx, t, false);
    drawParts(ctx, dt);
    // 안개
    if (W.fogOn && fogCanvas) {
      ctx.imageSmoothingEnabled = true; ctx.drawImage(fogCanvas, -FOGM * 2, -FOGM * 2, FW * 2, FH * 2);
    } else {
    // 맵 바깥은 서서히 어두워지게
    const EDGE = 7, DARK = 'rgba(6,12,20,0.62)', CLEAR = 'rgba(6,12,20,0)';
    const edgeFade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, CLEAR); g.addColorStop(1, DARK);
      ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
    };
    if (v.left < 2) { edgeFade(2, 0, 2 - EDGE, 0, 2 - EDGE, v.top - 1, EDGE, v.hh * 2 + 2); if (v.left < 2 - EDGE) { ctx.fillStyle = DARK; ctx.fillRect(v.left - 1, v.top - 1, 2 - EDGE - v.left + 1, v.hh * 2 + 2); } }
    if (v.right > MW - 2) { edgeFade(MW - 2, 0, MW - 2 + EDGE, 0, MW - 2, v.top - 1, EDGE, v.hh * 2 + 2); if (v.right > MW - 2 + EDGE) { ctx.fillStyle = DARK; ctx.fillRect(MW - 2 + EDGE, v.top - 1, v.right - (MW - 2 + EDGE) + 1, v.hh * 2 + 2); } }
    if (v.top < 2) { edgeFade(0, 2, 0, 2 - EDGE, v.left - 1, 2 - EDGE, v.hw * 2 + 2, EDGE); if (v.top < 2 - EDGE) { ctx.fillStyle = DARK; ctx.fillRect(v.left - 1, v.top - 1, v.hw * 2 + 2, 2 - EDGE - v.top + 1); } }
    if (v.bottom > MH - 2) { edgeFade(0, MH - 2, 0, MH - 2 + EDGE, v.left - 1, MH - 2, v.hw * 2 + 2, EDGE); if (v.bottom > MH - 2 + EDGE) { ctx.fillStyle = DARK; ctx.fillRect(v.left - 1, MH - 2 + EDGE, v.hw * 2 + 2, v.bottom - (MH - 2 + EDGE) + 1); } }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBars(ctx, G, v, dt);
    drawTexts(ctx, v, dt);
    // 화면 효과
    // 체력이 낮으면 화면 가장자리가 붉게 맥동
    const meU = W.me;
    if (meU && !meU.dead && meU.hp / meU.maxHp < 0.28) W.hurt = Math.max(W.hurt, 0.3 + Math.sin(t * 6) * 0.12);
    if (W.hurt > 0.01) {
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.48, vw / 2, vh / 2, Math.max(vw, vh) * 0.74);
      g.addColorStop(0, 'rgba(255,40,30,0)'); g.addColorStop(1, 'rgba(255,40,30,' + (0.42 * Math.min(1, W.hurt)).toFixed(3) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
      W.hurt *= Math.exp(-dt * 2.6);
    }
    W.towerWarn = Math.max(0, W.towerWarn - dt * 1.5);
    // 이펙트 수명 관리
    let w = 0;
    for (let i = 0; i < W.fx.length; i++) { const f = W.fx[i]; if (f.delay > 0) { f.delay -= dt; W.fx[w++] = f; continue; } f.t += dt; if (f.t < f.dur) W.fx[w++] = f; }
    W.fx.length = w;
    w = 0;
    for (let i = 0; i < W.corpses.length; i++) { const c = W.corpses[i]; c.t += dt; if (c.t < c.dur) W.corpses[w++] = c; }
    W.corpses.length = w;
  };
  W.treeCount = () => trees.length;
  W.initStatic = initStatic;
})();
