/* 해돌전쟁 — 화면 그리기: 지형, 건물, 유닛, 투사체, 안개, 미니맵 */
'use strict';
(function (g0) {
  var R = g0.RTS, TILE = R.TILE, S = R.Sprites, H = S.h, TAU = 6.2832;
  var Rn = R.Render = {};
  var ALT = 18;                 // 비행 유닛이 떠 있는 높이(화면상)
  Rn.ALT = ALT;
  var fogCv, fogCtx, fogImg, fogA, mmBase, sortBuf = [], airBuf = [], FROZEN = {};

  Rn.init = function (G) {
    var W = G.world;
    fogCv = S.mk(W.w, W.h); fogCtx = fogCv.getContext('2d');
    fogImg = fogCtx.createImageData(W.w, W.h);
    fogA = new Float32Array(W.w * W.h);
    var d = fogImg.data, vt = W.teams[G.viewTeam];
    for (var i = 0; i < fogA.length; i++) {
      fogA[i] = vt.visible[i] ? 0 : (vt.explored[i] ? 0.5 : 1);
      d[i * 4] = 5; d[i * 4 + 1] = 7; d[i * 4 + 2] = 12;
    }
    mmBase = G.terrain.minimapBase(220);
  };

  Rn.s2w = function (G, sx, sy) {
    return { x: G.cam.x + (sx - G.vw / 2) / G.cam.zoom, y: G.cam.y + (sy - G.vh / 2) / G.cam.zoom };
  };
  Rn.w2s = function (G, wx, wy) {
    return { x: (wx - G.cam.x) * G.cam.zoom + G.vw / 2, y: (wy - G.cam.y) * G.cam.zoom + G.vh / 2 };
  };

  function hpColor(k) { return k > 0.6 ? '#5fe05a' : (k > 0.3 ? '#ffd23f' : '#ff4a3a'); }
  function bar(ctx, x, y, w, h, k, col) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x, y, Math.max(0, w * k), h);
  }

  function unitFrame(G, u, x, y, t) {
    var def = u.def;
    var lx = u._lx === undefined ? x : u._lx, ly = u._ly === undefined ? y : u._ly;
    var mv = Math.sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly));
    u._lx = x; u._ly = y;
    u._walk = ((u._walk || 0) + Math.min(mv, 12) / (def.r * 2.4)) % 1;
    var wf = Math.floor(u._walk * 4) % 4;
    if (u.layer === 2) wf = Math.floor(t * 10 + u.id) % 4;
    var af = (G.world.tick - u.atkTick < 5) ? 1 : 0;
    if (u.working) af = Math.floor(t * 4 + u.id) % 2;
    u._wf = wf; u._af = af;
  }

  function drawUnit(ctx, G, u, alpha, t) {
    var W = G.world, def = u.def, team = W.teams[u.team], air = u.layer === 2;
    var x = u.px + (u.x - u.px) * alpha, y = u.py + (u.y - u.py) * alpha;
    unitFrame(G, u, x, y, t);
    var alt = air ? ALT + Math.sin(t * 2 + u.id) * 2 : (u.layer === 1 ? 1.5 + Math.sin(t * 3 + u.id) * 1.2 : 0);
    u._sx = x; u._sy = y - alt;
    var sh = S.shadow(), sr = def.r * (air ? 1.05 : 1.35);
    ctx.globalAlpha = air ? 0.4 : 0.85;
    ctx.drawImage(sh.c, x - sr + (air ? 6 : 1.5), y - sr * 0.62 + (air ? 5 : 2.5), sr * 2, sr * 1.24);
    // 발밑의 팀 색 원: 어느 편인지 한눈에 보이게
    var tcol = R.TEAM_COLORS[team.color].main;
    ctx.globalAlpha = 0.2; ctx.fillStyle = tcol;
    ctx.beginPath(); ctx.ellipse(x, y - alt + 1, def.r + 1.6, (def.r + 1.6) * 0.82, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.7; ctx.strokeStyle = tcol; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.globalAlpha = 1;
    if (G.selSet.has(u.id)) {
      ctx.strokeStyle = u.team === G.human ? '#7dff6a' : '#ff5a4a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(x, y - alt + 1, def.r + 4, (def.r + 4) * 0.82, 0, 0, TAU); ctx.stroke();
    } else if (G.hoverId === u.id) {
      ctx.strokeStyle = u.team === G.human ? 'rgba(200,255,190,0.75)' : 'rgba(255,170,160,0.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(x, y - alt + 1, def.r + 4, (def.r + 4) * 0.82, 0, 0, TAU); ctx.stroke();
    }
    // 번개 유랑단 일꾼: 자원과 이어진 가느다란 전송 빛줄기
    if (u.working && def.worker && def.worker.style === 'beam' && u.order.type === 'gather') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.strokeStyle = (u.order.rtype === 'dew' ? 'rgba(140,240,230,' : 'rgba(255,232,140,') + (0.22 + 0.16 * Math.sin(t * 18 + u.id)) + ')';
      ctx.lineWidth = 1.4;
      var mx = (x + u.order.nx) / 2 + Math.sin(t * 9 + u.id) * 3, my = (y - alt + u.order.ny) / 2 + Math.cos(t * 11 + u.id) * 3;
      ctx.beginPath(); ctx.moveTo(x, y - alt); ctx.quadraticCurveTo(mx, my, u.order.nx, u.order.ny); ctx.stroke();
      ctx.restore();
    }
    var sp = S.unit(u.type, team.color, u._wf, u._af);
    ctx.save(); ctx.translate(x, y - alt); ctx.rotate(u.angle);
    ctx.drawImage(sp.c, -sp.s / 2, -sp.s / 2, sp.s, sp.s);
    if (u.carry) {
      if (u.carry.res === 'sun') { H.poly(ctx, [-def.r - 3, -3.5, -def.r + 2.5, -1.5, -def.r + 1.5, 3.5, -def.r - 3.5, 2.5], '#ffd23f', S.OUT, 0.9); H.poly(ctx, [-def.r - 2, -2.5, -def.r + 1, -1, -def.r - 1, 1], 'rgba(255,255,255,0.6)', null); }
      else H.circ(ctx, -def.r - 0.5, 0, 3.2, H.rg2(ctx, -def.r - 1.5, -1, 0.3, -def.r - 0.5, 0, 3.2, [0, '#ffffff', 0.5, '#58e6da', 1, '#1f9aa6']), S.OUT, 0.9);
    }
    var ov = S.unitOverlay[u.type];
    if (ov) ov(ctx, t, null, u);
    if (W.tick - u.hitTick < 3) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55;
      ctx.drawImage(sp.c, -sp.s / 2, -sp.s / 2, sp.s, sp.s);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (def.weapon && def.weapon.turret) {
      var tp = S.unit(u.type, team.color, 0, u._af, 'turret');
      ctx.save(); ctx.translate(x, y - alt); ctx.rotate(u.aim);
      ctx.drawImage(tp.c, -tp.s / 2, -tp.s / 2, tp.s, tp.s);
      ctx.restore();
    }
    // 축전 완료 표시
    if (def.charge && u.charge >= def.charge.time * (team.upg.spc ? 0.5 : 1)) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var a = t * 5 + u.id;
      ctx.strokeStyle = 'rgba(255,236,120,' + (0.5 + 0.3 * Math.sin(t * 8 + u.id)) + ')'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(x, y - alt, def.r + 2, a, a + 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - alt, def.r + 2, a + 3.14, a + 4.54); ctx.stroke();
      ctx.restore();
    }
  }

  function drawBuildingBody(ctx, G, type, color, x, y, b, t) {
    var sp = S.building(type, color);
    ctx.drawImage(sp.c, x - sp.s / 2, y - sp.s / 2, sp.s, sp.s);
    var ov = S.buildingOverlay[type];
    b = b || FROZEN;      // 기억 속 건물·배치 미리보기: 움직이는 부분은 그리되 실제 상태(생산 중, 조준 방향)는 드러내지 않는다
    if (ov) { ctx.save(); ctx.translate(x, y); ov(ctx, t, S.teamColors(color), b); ctx.restore(); }
    if (S.buildingDraw[type + '_head']) {
      var hp = S.building(type, color, 'head');
      ctx.save(); ctx.translate(x, y); ctx.rotate(b.aim !== undefined ? b.aim : -1.5708);
      ctx.drawImage(hp.c, -hp.s / 2, -hp.s / 2, hp.s, hp.s);
      ctx.restore();
    }
  }

  function drawBuilding(ctx, G, b, t) {
    var W = G.world, team = W.teams[b.team], s = b.w * TILE, sh = S.shadow();
    ctx.globalAlpha = 0.6;
    ctx.drawImage(sh.c, b.x - s * 0.66 + 5, b.y - s * 0.52 + 9, s * 1.32, s * 1.12);
    ctx.globalAlpha = 1;
    if (G.selSet.has(b.id)) H.rr(ctx, b.x - s / 2 - 3, b.y - s / 2 - 3, s + 6, s + 6, 10, null, b.team === G.human ? '#7dff6a' : '#ff5a4a', 2);
    else if (G.hoverId === b.id) H.rr(ctx, b.x - s / 2 - 3, b.y - s / 2 - 3, s + 6, s + 6, 10, null, b.team === G.human ? 'rgba(200,255,190,0.7)' : 'rgba(255,170,160,0.75)', 1.3);
    // 지금 안 보이는 적 건물은 마지막으로 본 모습(완성 여부·공사 진행)으로 그린다
    var live = b._vis !== false, built = live ? b.built : b._sb, prog = live ? b.progress : b._sp;
    if (built) {
      drawBuildingBody(ctx, G, b.type, team.color, b.x, b.y, live ? b : null, t);
      if (live && W.tick - b.hitTick < 3) {
        var sp0 = S.building(b.type, team.color);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
        ctx.drawImage(sp0.c, b.x - sp0.s / 2, b.y - sp0.s / 2, sp0.s, sp0.s);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
      return;
    }
    // ── 짓는 중: 진영마다 다른 모습 ──
    var p = prog, style = team.fdef.buildStyle, sp = S.building(b.type, team.color), C = S.teamColors(team.color);
    if (style === 'stay') {
      H.rr(ctx, b.x - s / 2 + 3, b.y - s / 2 + 3, s - 6, s - 6, 6, '#3a3d44', S.OUT, 1.6);
      ctx.save(); ctx.setLineDash([7, 5]); H.rr(ctx, b.x - s / 2 + 7, b.y - s / 2 + 7, s - 14, s - 14, 4, null, '#ffcf3a', 1.6); ctx.restore();
      var top = b.y + s / 2 - p * s;
      ctx.save(); ctx.beginPath(); ctx.rect(b.x - sp.s / 2, top, sp.s, b.y + sp.s / 2 - top); ctx.clip();
      ctx.drawImage(sp.c, b.x - sp.s / 2, b.y - sp.s / 2, sp.s, sp.s);
      ctx.restore();
      // 비계
      ctx.save(); ctx.beginPath(); ctx.rect(b.x - s / 2 + 5, b.y - s / 2 + 5, s - 10, Math.max(0, top - (b.y - s / 2 + 5))); ctx.clip();
      ctx.strokeStyle = 'rgba(200,160,90,0.8)'; ctx.lineWidth = 1.4;
      for (var gx = -s / 2 + 5; gx <= s / 2 - 5; gx += 13) { ctx.beginPath(); ctx.moveTo(b.x + gx, b.y - s / 2); ctx.lineTo(b.x + gx, b.y + s / 2); ctx.stroke(); }
      for (var gy = -s / 2 + 5; gy <= s / 2 - 5; gy += 13) { ctx.beginPath(); ctx.moveTo(b.x - s / 2, b.y + gy); ctx.lineTo(b.x + s / 2, b.y + gy); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(b.x - s / 2 + 5, top); ctx.lineTo(b.x + s / 2 - 5, top); ctx.stroke();
    } else if (style === 'seed') {
      H.ell(ctx, b.x, b.y + 2, s * 0.42, s * 0.36, 0, H.rg(ctx, b.x, b.y, 2, s * 0.42, [0, '#7a5a34', 1, '#4a341e']), S.OUT, 1.4);
      var k = (0.18 + 0.82 * p) * (1 + 0.025 * Math.sin(t * 7 + b.id));
      ctx.save(); ctx.translate(b.x, b.y); ctx.scale(k, k);
      ctx.drawImage(sp.c, -sp.s / 2, -sp.s / 2, sp.s, sp.s);
      ctx.restore();
      if (p < 0.35) {
        H.leaf(ctx, b.x, b.y, 12, 4.5, -2.2 + Math.sin(t * 3) * 0.1, S.P.leafL, S.OUT, 1);
        H.leaf(ctx, b.x, b.y, 12, 4.5, -0.9 - Math.sin(t * 3) * 0.1, S.P.leaf, S.OUT, 1);
      }
    } else {
      // 하늘에서 내려오는 건물
      ctx.save(); ctx.translate(b.x, b.y);
      ctx.strokeStyle = C.t; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
      ctx.setLineDash([9, 7]); ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.5, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.36, s * 0.36, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
      var lift = (1 - p) * 54, sc = 1 + (1 - p) * 0.1;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var gr = ctx.createLinearGradient(0, b.y - lift - s, 0, b.y);
      gr.addColorStop(0, 'rgba(255,240,150,0)'); gr.addColorStop(1, 'rgba(255,240,150,' + (0.34 * (1 - p)) + ')');
      ctx.fillStyle = gr; ctx.fillRect(b.x - s * 0.36, b.y - lift - s, s * 0.72, lift + s);
      ctx.restore();
      ctx.save(); ctx.translate(b.x, b.y - lift); ctx.scale(sc, sc); ctx.globalAlpha = 0.3 + 0.7 * p;
      ctx.drawImage(sp.c, -sp.s / 2, -sp.s / 2, sp.s, sp.s);
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }

  function drawProjectiles(ctx, G, alpha, vis, x0, y0, x1, y1) {
    var W = G.world, list = W.projectiles, i, p;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (p.kind === 'homing') {
        var x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha;
        if (x < x0 || x > x1 || y < y0 || y > y1 || !vis[W.cellAt(x, y)]) continue;
        if (p.high) y -= ALT * 0.8;
        var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1; dx /= d; dy /= d;
        switch (p.fx) {
          case 'nail': case 'gyro':
            ctx.strokeStyle = 'rgba(40,30,10,0.6)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * 8, y - dy * 8); ctx.stroke();
            ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * 8, y - dy * 8); ctx.stroke();
            break;
          case 'cannon':
            H.glow(ctx, x - dx * 4, y - dy * 4, 9, '#ffb347', 0.7);
            H.circ(ctx, x, y, 3, '#2a2420', '#000', 0.8);
            break;
          case 'seed': H.ell(ctx, x, y, 3.2, 2.2, Math.atan2(dy, dx), '#e3cf8f', S.OUT, 0.9); break;
          case 'thorn': H.poly(ctx, [x + dx * 6, y + dy * 6, x - dx * 4 - dy * 2, y - dy * 4 + dx * 2, x - dx * 4 + dy * 2, y - dy * 4 - dx * 2], '#f0e8b8', S.OUT, 0.9); break;
          case 'pollen': H.glow(ctx, x, y, 6, '#e8ff9a', 0.6); H.circ(ctx, x, y, 2, '#f4ffb0', S.OUT, 0.6); break;
          default:
            // 번개 화살
            var len = p.charged ? 20 : 13;
            ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(255,230,107,0.5)'; ctx.lineWidth = p.charged ? 6 : 4;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * len, y - dy * len); ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = p.charged ? 2.4 : 1.6;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * len * 0.5 + dy * 2.5, y - dy * len * 0.5 - dx * 2.5); ctx.lineTo(x - dx * len, y - dy * len); ctx.stroke();
            ctx.restore();
        }
      } else if (p.kind === 'lob') {
        var k = Math.min(1, (p.t + alpha * R.DT) / p.dur);
        var gx2 = p.sx + (p.tx - p.sx) * k, gy2 = p.sy + (p.ty - p.sy) * k;
        if (gx2 < x0 || gx2 > x1 || gy2 < y0 - 200 || gy2 > y1 || !vis[W.cellAt(gx2, gy2)]) continue;
        var hgt = Math.sin(Math.PI * k) * (46 + R.dist(p.sx, p.sy, p.tx, p.ty) * 0.22);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(gx2, gy2, 5, 3, 0, 0, TAU); ctx.fill();
        if (p.fx === 'mortar') {
          H.glow(ctx, gx2, gy2 - hgt, 13, '#ff9a3a', 0.8);
          H.circ(ctx, gx2, gy2 - hgt, 3.6, '#2a1c10', '#000', 0.8);
          if (!G.paused && Math.random() < 0.5) G.fx.add(R.FX.SMOKE, gx2, gy2 - hgt, 0, 0, 0.4, 2.5, '#5a5048', { grow: 5, a: 0.45, high: true });
        } else {
          ctx.save(); ctx.translate(gx2, gy2 - hgt); ctx.rotate(k * 9);
          H.circ(ctx, 0, 0, 5, H.rg(ctx, -1.5, -1.5, 0.5, 5, [0, '#ffc266', 1, '#c06a18']), S.OUT, 1);
          H.ell(ctx, 0, 0, 1.8, 5, 0, null, 'rgba(120,60,10,0.6)', 0.8);
          H.circ(ctx, 0, -4.4, 1.4, '#3f8a35', S.OUT, 0.6);
          ctx.restore();
        }
      }
    }
  }

  function updateFog(G) {
    var W = G.world, vt = W.teams[G.viewTeam], vis = vt.visible, exp = vt.explored, d = fogImg.data, n = fogA.length;
    for (var i = 0; i < n; i++) {
      var target = vis[i] ? 0 : (exp[i] ? 0.5 : 1), a = fogA[i];
      if (a !== target) {
        a += (target - a) * 0.16;
        if (Math.abs(a - target) < 0.01) a = target;
        fogA[i] = a;
      }
      d[i * 4 + 3] = a * 255;
    }
    fogCtx.putImageData(fogImg, 0, 0);
  }

  Rn.draw = function (G, alpha) {
    var ctx = G.ctx, W = G.world, cam = G.cam, z = cam.zoom, dpr = G.dpr, vw = G.vw, vh = G.vh, t = G.time;
    var vt = W.teams[G.viewTeam], vis = vt.visible, exp = vt.explored, all = !!vt.revealAll;
    var i, u, b, sel = G.selSet;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, vw, vh);
    var shx = 0, shy = 0;
    if (G.fx.shake > 0.1 && !G.paused) { shx = (Math.random() - 0.5) * G.fx.shake * 2; shy = (Math.random() - 0.5) * G.fx.shake * 2; }
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * z + shx), dpr * (vh / 2 - cam.y * z + shy));
    var x0 = cam.x - vw / 2 / z - 8, x1 = cam.x + vw / 2 / z + 8, y0 = cam.y - vh / 2 / z - 8, y1 = cam.y + vh / 2 / z + 8;
    ctx.imageSmoothingEnabled = true;
    G.terrain.draw(ctx, x0, y0, x1, y1);

    // 물결 반짝임
    var tx0 = Math.max(0, Math.floor(x0 / TILE)), tx1 = Math.min(W.w - 1, Math.floor(x1 / TILE));
    var ty0 = Math.max(0, Math.floor(y0 / TILE)), ty1 = Math.min(W.h - 1, Math.floor(y1 / TILE));
    var ter = W.map.terrain;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    for (var ty = ty0; ty <= ty1; ty++) for (var tx = tx0; tx <= tx1; tx++) {
      var ci = ty * W.w + tx;
      if (ter[ci] !== R.T_WATER || ((tx * 7 + ty * 13) % 3) !== 0) continue;
      var ph = t * 0.9 + tx * 1.7 + ty * 2.3, a2 = Math.sin(ph) * 0.5 + 0.5;
      if (a2 < 0.25) continue;
      ctx.globalAlpha = (a2 - 0.25) * 0.4;
      var wx = tx * TILE + 16 + Math.sin(ph * 0.5) * 6, wy = ty * TILE + 16 + Math.cos(tx + ty) * 7;
      ctx.beginPath(); ctx.moveTo(wx - 6, wy); ctx.quadraticCurveTo(wx, wy - 2.5, wx + 6, wy); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    G.fx.drawDecals(ctx, x0, y0, x1, y1);

    // 자원
    for (i = 0; i < W.nodes.length; i++) {
      var n = W.nodes[i];
      if (n.x < x0 - 48 || n.x > x1 + 48 || n.y < y0 - 48 || n.y > y1 + 48) continue;
      if (!all && !exp[W.cellAt(n.x, n.y)]) continue;
      var lv = n.amount / n.max > 0.66 ? 2 : (n.amount / n.max > 0.33 ? 1 : 0);
      var ns = S.node(n.type, n.variant, lv);
      ctx.drawImage(ns.c, n.x - ns.s / 2, n.y - ns.s / 2, ns.s, ns.s);
      if (n.type === 'dew') H.glow(ctx, n.x, n.y, 26 + Math.sin(t * 2 + n.id) * 3, '#7ff0e6', 0.16 + 0.06 * Math.sin(t * 2 + n.id));
      else if (((n.id * 7 + Math.floor(t * 1.5)) % 5) === 0) {
        var sa = (t * 1.5) % 1, sxp = n.x + ((n.id * 13) % 14) - 7, syp = n.y - 6 + ((n.id * 5) % 8) - 4;
        ctx.globalAlpha = Math.sin(sa * Math.PI); H.star(ctx, sxp, syp, 4, 4.5, 1, 0, '#ffffff', null); ctx.globalAlpha = 1;
      }
      if (sel.has(n.id) || G.hoverId === n.id) { ctx.strokeStyle = sel.has(n.id) ? '#ffd23f' : 'rgba(255,230,140,0.7)'; ctx.lineWidth = sel.has(n.id) ? 1.6 : 1.2; ctx.beginPath(); ctx.ellipse(n.x, n.y + 2, n.r + 5, (n.r + 5) * 0.8, 0, 0, TAU); ctx.stroke(); }
    }

    // 기억 속의 건물 → 실제 건물
    for (i = 0; i < vt.ghosts.length; i++) {
      var gh = vt.ghosts[i];
      if (gh.x < x0 - 90 || gh.x > x1 + 90 || gh.y < y0 - 90 || gh.y > y1 + 90) continue;
      drawBuildingBody(ctx, G, gh.type, W.teams[gh.team].color, gh.x, gh.y, null, t);
    }
    var blds = W.buildings;
    sortBuf.length = 0;
    for (i = 0; i < blds.length; i++) {
      b = blds[i];
      if (b.dead) continue;
      // 보이는 동안의 상태를 기억해 둔다 (화면 밖이어도)
      b._vis = all || b.team === G.viewTeam || W.rectVisible(vt, b);
      if (b._vis || b._sb === undefined) { b._sb = b.built; b._sp = b.progress; }
      if (b.x < x0 - 90 || b.x > x1 + 90 || b.y < y0 - 90 || b.y > y1 + 90) continue;
      if (!all && b.team !== G.viewTeam && !(b.seen & (1 << G.viewTeam))) continue;
      sortBuf.push(b);
    }
    sortBuf.sort(function (p, q) { return p.y - q.y; });
    for (i = 0; i < sortBuf.length; i++) drawBuilding(ctx, G, sortBuf[i], t);

    // 선택한 생산 건물의 집결 지점
    for (i = 0; i < G.selection.length; i++) {
      b = W.byId.get(G.selection[i]);
      if (!b || b.kind !== 'building' || b.team !== G.human || !b.rally) continue;
      ctx.strokeStyle = 'rgba(255,220,90,0.8)'; ctx.lineWidth = 1.4; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.rally.x, b.rally.y); ctx.stroke(); ctx.setLineDash([]);
      H.line(ctx, b.rally.x, b.rally.y, b.rally.x, b.rally.y - 16, '#3a2a10', 2.6); H.line(ctx, b.rally.x, b.rally.y, b.rally.x, b.rally.y - 16, '#d9c9a0', 1.2);
      H.poly(ctx, [b.rally.x + 0.5, b.rally.y - 16, b.rally.x + 11, b.rally.y - 12, b.rally.x + 0.5, b.rally.y - 8], '#ffcf4a', S.OUT, 1);
    }

    G.fx.drawGround(ctx);
    drawZones(ctx, G, t, alpha, all ? ALLVIS(W) : vis, false);

    // 유닛 (지상은 y순, 공중은 그 위에)
    var units = W.units;
    sortBuf.length = 0; airBuf.length = 0;
    for (i = 0; i < units.length; i++) {
      u = units[i];
      if (u.dead || u.x < x0 - 40 || u.x > x1 + 40 || u.y < y0 - 40 || u.y > y1 + 60) continue;
      if (!all && u.team !== G.viewTeam && !vis[W.cellAt(u.x, u.y)]) { u._sx = undefined; continue; }
      (u.layer === 2 ? airBuf : sortBuf).push(u);
    }
    sortBuf.sort(function (p, q) { return p.y - q.y; });
    for (i = 0; i < sortBuf.length; i++) drawUnit(ctx, G, sortBuf[i], alpha, t);
    G.fx.drawParts(ctx, false, x0, y0, x1, y1);
    drawProjectiles(ctx, G, alpha, all ? ALLVIS(W) : vis, x0, y0, x1, y1);
    for (i = 0; i < airBuf.length; i++) drawUnit(ctx, G, airBuf[i], alpha, t);
    G.fx.drawParts(ctx, true, x0, y0, x1, y1);
    drawZones(ctx, G, t, alpha, all ? ALLVIS(W) : vis, true);
    G.fx.drawBolts(ctx);

    // 전장의 안개
    if (!all) {
      updateFog(G);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(fogCv, 0, 0, W.w, W.h, 0, 0, W.pw, W.ph);
    }
    // 맵 바깥 가장자리 어둡게
    ctx.fillStyle = '#05070b';
    ctx.fillRect(x0 - 50, y0 - 50, x1 - x0 + 100, -y0 + 50); ctx.fillRect(x0 - 50, W.ph, x1 - x0 + 100, y1 - W.ph + 50);
    ctx.fillRect(x0 - 50, 0, -x0 + 50, W.ph); ctx.fillRect(W.pw, 0, x1 - W.pw + 50, W.ph);

    // 체력 막대
    for (i = 0; i < sortBuf.length + airBuf.length; i++) {
      u = i < sortBuf.length ? sortBuf[i] : airBuf[i - sortBuf.length];
      if (u._sx === undefined) continue;
      var selU = sel.has(u.id), bw = u.def.r * 2.3;
      if (u.rank) {
        // 계급장: 금빛 갈매기 무늬
        var rx = u._sx + bw / 2 + 4, ry = u._sy - u.def.r - 6;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (var rk = 0; rk < u.rank; rk++) {
          ctx.beginPath(); ctx.moveTo(rx - 3, ry - rk * 3.2 + 1.6); ctx.lineTo(rx, ry - rk * 3.2 - 1); ctx.lineTo(rx + 3, ry - rk * 3.2 + 1.6);
          ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3; ctx.stroke();
          ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
      if (!selU && u.hp >= u.maxHp) continue;
      bar(ctx, u._sx - bw / 2, u._sy - u.def.r - 9, bw, 3, u.hp / u.maxHp, u.team === G.human ? hpColor(u.hp / u.maxHp) : R.TEAM_COLORS[W.teams[u.team].color].main);
    }
    for (i = 0; i < blds.length; i++) {
      b = blds[i];
      if (b.dead || b.x < x0 - 90 || b.x > x1 + 90 || b.y < y0 - 90 || b.y > y1 + 90) continue;
      var mine = b.team === G.viewTeam;
      if (!all && !mine && !W.rectVisible(vt, b)) continue;
      var s = b.w * TILE, selB = sel.has(b.id), w2 = s * 0.8;
      if (selB || b.hp < b.maxHp || !b.built) bar(ctx, b.x - w2 / 2, b.y - s / 2 - 10, w2, 4, b.hp / b.maxHp, b.team === G.human ? hpColor(b.hp / b.maxHp) : R.TEAM_COLORS[W.teams[b.team].color].main);
      if (!b.built && (mine || all)) bar(ctx, b.x - w2 / 2, b.y - s / 2 - 4, w2, 3, b.progress, '#6ab8ff');
      else if (b.built && (mine || all) && b.queue.length) {
        bar(ctx, b.x - w2 / 2, b.y - s / 2 - 4, w2, 3, b.queue[0].t / b.queue[0].total, b.blocked ? '#ff8a3a' : '#ffd86a');
      }
      // 선택한 탑의 사거리
      if (selB && b.def.weapon && b.built) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.def.weapon.range * TILE, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // 건물 배치 미리보기
    var m = G.mode;
    if (m && m.type === 'place' && G.mouse.inside) {
      var def = R.BUILDINGS[m.btype], sz = def.size, wpos = Rn.s2w(G, G.mouse.x, G.mouse.y);
      var ptx = Math.round(wpos.x / TILE - sz / 2), pty = Math.round(wpos.y / TILE - sz / 2);
      m.tx = ptx; m.ty = pty;
      var ok = true;
      for (var yy = 0; yy < sz; yy++) for (var xx = 0; xx < sz; xx++) {
        var cx = ptx + xx, cy = pty + yy, good = cx >= 0 && cy >= 0 && cx < W.w && cy < W.h;
        if (good) good = R.cellBuildable(W, G.human, cy * W.w + cx, false);
        if (!good) ok = false;
        ctx.fillStyle = good ? 'rgba(90,255,120,0.3)' : 'rgba(255,70,60,0.42)';
        ctx.fillRect(cx * TILE + 1, cy * TILE + 1, TILE - 2, TILE - 2);
      }
      m.ok = ok;
      ctx.globalAlpha = 0.6;
      drawBuildingBody(ctx, G, m.btype, W.teams[G.human].color, (ptx + sz / 2) * TILE, (pty + sz / 2) * TILE, null, t);
      ctx.globalAlpha = 1;
      if (def.weapon) {
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc((ptx + sz / 2) * TILE, (pty + sz / 2) * TILE, def.weapon.range * TILE, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    // 진영 기술 조준: 마우스 자리에 범위 원 (안 보이는 곳이면 빨갛게)
    if (m && m.type === 'target' && m.cmd === 'power' && G.mouse.inside && G.human >= 0) {
      var pw = R.Powers.of(W.teams[G.human]), mp = Rn.s2w(G, G.mouse.x, G.mouse.y), prad = pw.radius * TILE;
      var okv = mp.x >= 0 && mp.y >= 0 && mp.x < W.pw && mp.y < W.ph && vis[W.cellAt(mp.x, mp.y)] === 1;
      var pc = !okv ? '255,80,70' : ZCOL[pw.id];
      ctx.fillStyle = 'rgba(' + pc + ',0.13)'; ctx.beginPath(); ctx.arc(mp.x, mp.y, prad, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(' + pc + ',0.95)'; ctx.lineWidth = 2; ctx.setLineDash([9, 6]); ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.arc(mp.x, mp.y, prad, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      H.line(ctx, mp.x - 8, mp.y, mp.x + 8, mp.y, 'rgba(' + pc + ',0.95)', 1.6); H.line(ctx, mp.x, mp.y - 8, mp.x, mp.y + 8, 'rgba(' + pc + ',0.95)', 1.6);
    }

    // 화면 좌표 요소: 드래그 상자
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G.drag && G.drag.active) {
      var dx0 = Math.min(G.drag.x0, G.drag.x1), dy0 = Math.min(G.drag.y0, G.drag.y1);
      var dw = Math.abs(G.drag.x1 - G.drag.x0), dh = Math.abs(G.drag.y1 - G.drag.y0);
      ctx.fillStyle = 'rgba(120,255,110,0.12)'; ctx.fillRect(dx0, dy0, dw, dh);
      ctx.strokeStyle = '#7dff6a'; ctx.lineWidth = 1.2; ctx.strokeRect(dx0 + 0.5, dy0 + 0.5, dw, dh);
    }
  };

  /* ── 진영 기술이 걸린 자리 ──
     high=false: 땅에 깔리는 표시 (유닛 아래), high=true: 하늘에서 내려오는 것 (유닛 위) */
  var ZCOL = { barrage: '255,140,60', bloom: '140,255,130', tempest: '255,236,110' };
  function drawZones(ctx, G, t, alpha, vis, high) {
    var W = G.world, zs = W.zones;
    for (var i = 0; i < zs.length; i++) {
      var z = zs[i], d = z.def, zt = z.t + (G.paused ? 0 : alpha * R.DT), k, j;
      if (z.team !== G.viewTeam && !vis[W.cellAt(z.x, z.y)]) continue;
      if (!high) {
        if (z.id === 'barrage') {
          // 표적 원이 조여 들고, 떨어질 자리마다 작은 원이 뜬다
          k = Math.min(1, zt / d.delay);
          ctx.fillStyle = 'rgba(255,70,30,' + (0.06 + 0.07 * k) + ')'; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,110,60,' + (0.6 + 0.3 * Math.sin(t * 16)) + ')'; ctx.lineWidth = 2.2;
          ctx.setLineDash([10, 7]); ctx.lineDashOffset = -t * 44;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          if (k < 1) { ctx.strokeStyle = 'rgba(255,200,120,' + (0.8 * (1 - k)) + ')'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (1.7 - 0.7 * k), 0, TAU); ctx.stroke(); }
          for (j = z.n; j < z.pts.length; j++) {
            var left = z.pts[j].at - zt;
            if (left > 0.8) continue;
            var f = 1 - Math.max(0, left) / 0.8, sr = d.splash * TILE;
            ctx.strokeStyle = 'rgba(255,230,150,' + (0.25 + 0.6 * f) + ')'; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.arc(z.pts[j].x, z.pts[j].y, sr * (1.25 - 0.45 * f), 0, TAU); ctx.stroke();
            ctx.fillStyle = 'rgba(255,120,50,' + (0.22 * f) + ')'; ctx.beginPath(); ctx.arc(z.pts[j].x, z.pts[j].y, sr * 0.8 * f, 0, TAU); ctx.fill();
          }
        } else if (z.id === 'bloom') {
          k = Math.max(0, Math.min(1, zt * 3, (d.dur - zt) * 1.6));
          var gr = ctx.createRadialGradient(z.x, z.y, z.r * 0.1, z.x, z.y, z.r);
          gr.addColorStop(0, 'rgba(150,255,130,' + (0.26 * k) + ')'); gr.addColorStop(0.75, 'rgba(110,235,110,' + (0.15 * k) + ')'); gr.addColorStop(1, 'rgba(110,235,110,' + (0.03 * k) + ')');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(190,255,160,' + (0.75 * k) + ')'; ctx.lineWidth = 2; ctx.setLineDash([4, 9]); ctx.lineDashOffset = t * 26;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          // 안에서 번져 나가는 물결
          var wv = (zt * 0.7) % 1;
          ctx.strokeStyle = 'rgba(220,255,200,' + (0.5 * (1 - wv) * k) + ')'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r * wv, 0, TAU); ctx.stroke();
        } else {
          // 폭풍: 어두워진 땅과 번쩍이는 테두리
          k = Math.max(0, Math.min(1, zt * 3, (d.dur - zt) * 1.6));
          ctx.fillStyle = 'rgba(8,12,34,' + (0.36 * k) + ')'; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,236,110,' + ((0.55 + 0.35 * Math.sin(t * 22 + i)) * k) + ')'; ctx.lineWidth = 2;
          ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t * 60;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
      } else if (z.id === 'barrage') {
        // 오른쪽 위 하늘에서 비스듬히 떨어지는 불덩이
        for (j = z.n; j < z.pts.length; j++) {
          var lf = z.pts[j].at - zt;
          if (lf > 0.6 || lf < 0) continue;
          var q = lf / 0.6, bx = z.pts[j].x + q * 190, by = z.pts[j].y - q * 520;
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(255,120,40,0.55)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 26, by - 71); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,226,140,0.9)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 15, by - 41); ctx.stroke();
          ctx.restore();
          H.glow(ctx, bx, by, 16, '#ffb347', 0.85);
          H.circ(ctx, bx, by, 4, '#2a1c10', '#000', 0.8);
        }
      } else if (z.id === 'tempest') {
        // 머리 위에 몰려든 먹구름
        k = Math.max(0, Math.min(1, zt * 2.5, (d.dur - zt) * 1.6));
        for (j = 0; j < 9; j++) {
          var ca = j * 0.7 + t * 0.25 * (j % 2 ? 1 : -1), cr = z.r * (j === 0 ? 0 : 0.34 + (j % 3) * 0.2);
          var cx2 = z.x + Math.cos(ca) * cr, cy2 = z.y - 26 + Math.sin(ca) * cr * 0.7;
          ctx.fillStyle = 'rgba(' + (j % 2 ? '44,50,74,' : '30,34,54,') + (0.34 * k) + ')';
          ctx.beginPath(); ctx.arc(cx2, cy2, z.r * (0.34 + (j % 4) * 0.06), 0, TAU); ctx.fill();
        }
      }
    }
  }

  var allVis = null;
  function ALLVIS(W) { if (!allVis || allVis.length !== W.w * W.h) { allVis = new Uint8Array(W.w * W.h); allVis.fill(1); } return allVis; }

  /* ── 미니맵 ── */
  Rn.drawMinimap = function (G) {
    var cv = G.mm, ctx = G.mmCtx, W = G.world, sz = G.mmSize, k = sz / W.pw, dpr = G.dpr, i;
    var vt = W.teams[G.viewTeam], vis = vt.visible, exp = vt.explored, all = !!vt.revealAll;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mmBase, 0, 0, sz, sz);
    for (i = 0; i < W.nodes.length; i++) {
      var n = W.nodes[i];
      if (!all && !exp[W.cellAt(n.x, n.y)]) continue;
      ctx.fillStyle = n.def.res === 'sun' ? '#ffd23f' : '#58e6da';
      ctx.fillRect(n.x * k - 1.2, n.y * k - 1.2, 2.4 + (n.w - 1), 2.4 + (n.w - 1));
    }
    for (i = 0; i < vt.ghosts.length; i++) {
      var gh = vt.ghosts[i];
      ctx.fillStyle = R.TEAM_COLORS[W.teams[gh.team].color].dark;
      ctx.fillRect(gh.tx * TILE * k, gh.ty * TILE * k, gh.w * TILE * k, gh.h * TILE * k);
    }
    for (i = 0; i < W.buildings.length; i++) {
      var b = W.buildings[i];
      if (b.dead) continue;
      if (!all && b.team !== G.viewTeam && !(b.seen & (1 << G.viewTeam))) continue;
      ctx.fillStyle = '#000'; ctx.fillRect(b.tx * TILE * k - 0.6, b.ty * TILE * k - 0.6, b.w * TILE * k + 1.2, b.h * TILE * k + 1.2);
      ctx.fillStyle = R.TEAM_COLORS[W.teams[b.team].color].main;
      ctx.fillRect(b.tx * TILE * k, b.ty * TILE * k, b.w * TILE * k, b.h * TILE * k);
    }
    for (i = 0; i < W.units.length; i++) {
      var u = W.units[i];
      if (u.dead) continue;
      if (!all && u.team !== G.viewTeam && !vis[W.cellAt(u.x, u.y)]) continue;
      ctx.fillStyle = G.selSet.has(u.id) ? '#ffffff' : R.TEAM_COLORS[W.teams[u.team].color].light;
      ctx.fillRect(u.x * k - 1.3, u.y * k - 1.3, 2.6, 2.6);
    }
    if (!all) { ctx.globalAlpha = 0.92; ctx.drawImage(fogCv, 0, 0, sz, sz); ctx.globalAlpha = 1; }
    // 아직 찾지 못한 상대의 본진 자리: 물음표로 알려 준다
    if (G.human >= 0) {
      ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (i = 0; i < W.teams.length; i++) {
        var et = W.teams[i];
        if (i === G.human || !et.alive || exp[W.cellAt(et.startX, et.startY)]) continue;
        ctx.globalAlpha = 0.65 + 0.35 * Math.sin(G.time * 3 + i);
        ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText('?', et.startX * k, et.startY * k + 1);
        ctx.fillStyle = R.TEAM_COLORS[et.color].light; ctx.fillText('?', et.startX * k, et.startY * k + 1);
      }
      ctx.globalAlpha = 1;
    }
    // 진영 기술이 걸린 자리
    for (i = 0; i < W.zones.length; i++) {
      var zn = W.zones[i];
      if (!all && zn.team !== G.viewTeam && !vis[W.cellAt(zn.x, zn.y)]) continue;
      ctx.strokeStyle = 'rgba(' + ZCOL[zn.id] + ',0.95)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(zn.x * k, zn.y * k, Math.max(3, zn.r * k), 0, TAU); ctx.stroke();
    }
    // 경보 핑
    for (i = G.pings.length - 1; i >= 0; i--) {
      var p = G.pings[i], tt = (G.time - p.t) / 2.4;
      if (tt >= 1) { G.pings.splice(i, 1); continue; }
      var pr = 3 + ((tt * 3) % 1) * 12;
      ctx.strokeStyle = p.col; ctx.globalAlpha = 1 - ((tt * 3) % 1); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p.x * k, p.y * k, pr, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // 카메라 범위
    var hw = G.vw / 2 / G.cam.zoom, hh = G.vh / 2 / G.cam.zoom;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
    ctx.strokeRect((G.cam.x - hw) * k, (G.cam.y - hh) * k, hw * 2 * k, hh * 2 * k);
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
