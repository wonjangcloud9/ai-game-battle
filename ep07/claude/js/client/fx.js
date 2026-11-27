/* 해돌전쟁 — 이펙트: 불꽃, 연기, 파편, 번개, 폭발, 바닥 자국 */
'use strict';
(function (g0) {
  var R = g0.RTS, S = R.Sprites, H = S.h, TAU = 6.2832;
  var SPARK = 0, SMOKE = 1, DEBRIS = 2, LEAF = 3, RING = 4, FLASH = 5, TEXT = 6;
  var MAXP = 900;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function FX() {
    this.parts = []; this.bolts = []; this.marks = []; this.decals = []; this.warns = [];
    this.shake = 0;
  }

  FX.prototype.add = function (k, x, y, vx, vy, life, size, col, o) {
    if (this.parts.length >= MAXP) this.parts.shift();
    var p = { k: k, x: x, y: y, vx: vx, vy: vy, life: life, max: life, size: size, col: col, grow: 0, rot: 0, vr: 0, a: 1, drag: 0, lw: 2, txt: null, high: false };
    if (o) for (var key in o) p[key] = o[key];
    this.parts.push(p);
    return p;
  };

  FX.prototype.sparks = function (x, y, n, speed, col, life, high) {
    for (var i = 0; i < n; i++) {
      var a = rnd(0, TAU), s = rnd(speed * 0.35, speed);
      this.add(SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(life * 0.5, life), rnd(1.2, 2.2), col, { drag: 3, high: !!high });
    }
  };
  FX.prototype.smoke = function (x, y, n, size, col, life, high) {
    for (var i = 0; i < n; i++) {
      this.add(SMOKE, x + rnd(-size, size) * 0.5, y + rnd(-size, size) * 0.5, rnd(-12, 12), rnd(-30, -10), rnd(life * 0.6, life), rnd(size * 0.5, size), col || '#55504a', { grow: size * 1.3, a: 0.55, high: !!high });
    }
  };
  FX.prototype.debris = function (x, y, n, speed, cols, kind) {
    for (var i = 0; i < n; i++) {
      var a = rnd(0, TAU), s = rnd(speed * 0.3, speed);
      this.add(kind || DEBRIS, x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.5, 1.1), rnd(2, 4.5), cols[(Math.random() * cols.length) | 0], { drag: 2.6, rot: rnd(0, TAU), vr: rnd(-9, 9) });
    }
  };
  FX.prototype.ring = function (x, y, r0, grow, col, life, lw, high) { this.add(RING, x, y, 0, 0, life, r0, col, { grow: grow, lw: lw || 2, high: !!high }); };
  FX.prototype.flash = function (x, y, r, col, life, high) { this.add(FLASH, x, y, 0, 0, life, r, col, { high: !!high }); };
  FX.prototype.text = function (x, y, txt, col) { this.add(TEXT, x, y, 0, -26, 1.1, 13, col, { txt: txt, high: true }); };

  FX.prototype.bolt = function (pts, col, life, w) { this.bolts.push({ pts: pts, col: col || '#fff7b0', life: life || 0.16, max: life || 0.16, w: w || 2, seed: Math.random() * 1000 }); };
  FX.prototype.mark = function (x, y, col) { this.marks.push({ x: x, y: y, col: col, life: 0.5, max: 0.5 }); };
  FX.prototype.warn = function (x, y, r, life) { this.warns.push({ x: x, y: y, r: r, life: life, max: life }); };
  FX.prototype.decal = function (x, y, r, kind) {
    if (this.decals.length > 140) this.decals.shift();
    this.decals.push({ x: x, y: y, r: r, kind: kind, life: 70, rot: rnd(0, TAU) });
  };

  FX.prototype.explosion = function (x, y, size, hot, high) {
    this.flash(x, y, size * 2.4, hot || '#ffd27a', 0.22, high);
    this.ring(x, y, size * 0.4, size * 5, 'rgba(255,240,200,0.8)', 0.32, 2.5, high);
    this.sparks(x, y, Math.round(6 + size * 0.5), 150 + size * 5, '#ffcf6b', 0.5, high);
    this.smoke(x, y, Math.round(3 + size * 0.2), size * 0.7, '#4a443e', 1.1, high);
    this.shake = Math.max(this.shake, Math.min(7, size * 0.16));
  };

  FX.prototype.update = function (dt) {
    var i, p;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      if (p.drag) { var k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (i = this.bolts.length - 1; i >= 0; i--) { this.bolts[i].life -= dt; if (this.bolts[i].life <= 0) this.bolts.splice(i, 1); }
    for (i = this.marks.length - 1; i >= 0; i--) { this.marks[i].life -= dt; if (this.marks[i].life <= 0) this.marks.splice(i, 1); }
    for (i = this.warns.length - 1; i >= 0; i--) { this.warns[i].life -= dt; if (this.warns[i].life <= 0) this.warns.splice(i, 1); }
    for (i = this.decals.length - 1; i >= 0; i--) { this.decals[i].life -= dt; if (this.decals[i].life <= 0) this.decals.splice(i, 1); }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);
  };

  FX.prototype.drawDecals = function (ctx, x0, y0, x1, y1) {
    for (var i = 0; i < this.decals.length; i++) {
      var d = this.decals[i];
      if (d.x < x0 - d.r || d.x > x1 + d.r || d.y < y0 - d.r || d.y > y1 + d.r) continue;
      var a = Math.min(1, d.life / 12);
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.globalAlpha = a;
      if (d.kind === 'sap') {
        ctx.fillStyle = 'rgba(70,110,40,0.5)';
        ctx.beginPath(); ctx.ellipse(0, 0, d.r, d.r * 0.7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(120,160,60,0.4)';
        ctx.beginPath(); ctx.ellipse(d.r * 0.3, -d.r * 0.1, d.r * 0.4, d.r * 0.3, 0, 0, TAU); ctx.fill();
      } else {
        var gr = ctx.createRadialGradient(0, 0, d.r * 0.1, 0, 0, d.r);
        gr.addColorStop(0, 'rgba(18,14,10,0.5)'); gr.addColorStop(0.6, 'rgba(24,18,12,0.26)'); gr.addColorStop(1, 'rgba(24,18,12,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.ellipse(0, 0, d.r, d.r * 0.82, 0, 0, TAU); ctx.fill();
        if (d.kind === 'rubble') {
          ctx.fillStyle = 'rgba(70,66,60,0.85)';
          for (var k = 0; k < 7; k++) { var aa = k * 0.9, rr = d.r * (0.2 + (k % 3) * 0.2); ctx.fillRect(Math.cos(aa) * rr - 3, Math.sin(aa) * rr * 0.8 - 2, 6 + (k % 2) * 3, 4); }
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  // 지면 표식: 명령 표시, 낙뢰 예고
  FX.prototype.drawGround = function (ctx) {
    var i;
    for (i = 0; i < this.marks.length; i++) {
      var m = this.marks[i], t = m.life / m.max;
      ctx.strokeStyle = m.col; ctx.globalAlpha = t; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(m.x, m.y, 5 + t * 16, (5 + t * 16) * 0.6, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(m.x, m.y, 3, 1.8, 0, 0, TAU); ctx.fillStyle = m.col; ctx.fill();
    }
    for (i = 0; i < this.warns.length; i++) {
      var w = this.warns[i], k = 1 - w.life / w.max;
      ctx.globalAlpha = 0.25 + k * 0.5;
      ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.ellipse(w.x, w.y, w.r, w.r * 0.8, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,240,150,0.18)';
      ctx.beginPath(); ctx.ellipse(w.x, w.y, w.r * k, w.r * 0.8 * k, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  FX.prototype.drawParts = function (ctx, high, x0, y0, x1, y1) {
    var parts = this.parts, i, p, t;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (p.high !== high) continue;
      if (p.x < x0 - 60 || p.x > x1 + 60 || p.y < y0 - 60 || p.y > y1 + 60) continue;
      t = p.life / p.max;
      switch (p.k) {
        case SPARK:
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t;
          ctx.strokeStyle = p.col; ctx.lineWidth = p.size; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          break;
        case SMOKE:
          ctx.globalAlpha = t * p.a; ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size + p.grow * (1 - t), 0, TAU); ctx.fill();
          break;
        case DEBRIS:
          ctx.globalAlpha = Math.min(1, t * 3);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
          ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.6; ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
          ctx.restore();
          break;
        case LEAF:
          ctx.globalAlpha = Math.min(1, t * 3);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          H.leaf(ctx, -p.size, 0, p.size * 2.2, p.size * 0.8, 0, p.col, 'rgba(0,0,0,0.45)', 0.6);
          ctx.restore();
          break;
        case RING:
          ctx.globalAlpha = t; ctx.strokeStyle = p.col; ctx.lineWidth = p.lw * (0.4 + t * 0.6);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size + p.grow * (1 - t), 0, TAU); ctx.stroke();
          break;
        case FLASH:
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t;
          var gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, p.col); gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          break;
        case TEXT:
          ctx.globalAlpha = Math.min(1, t * 2.5);
          ctx.font = 'bold ' + p.size + 'px sans-serif'; ctx.textAlign = 'center';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(p.txt, p.x, p.y);
          ctx.fillStyle = p.col; ctx.fillText(p.txt, p.x, p.y);
          break;
      }
    }
    ctx.globalAlpha = 1;
  };

  FX.prototype.drawBolts = function (ctx) {
    if (!this.bolts.length) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < this.bolts.length; i++) {
      var b = this.bolts[i], t = b.life / b.max, pts = b.pts;
      var jig = Math.floor(b.life * 40);
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (var k = 2; k < pts.length; k += 2) {
          var x0 = pts[k - 2], y0 = pts[k - 1], x1 = pts[k], y1 = pts[k + 1];
          var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1, n = Math.max(2, Math.round(len / 16));
          for (var s = 1; s < n; s++) {
            var f = s / n, h = Math.sin((b.seed + k * 13.7 + s * 7.3 + jig * 3.1) * 12.9898) * 43758.5453;
            h = (h - Math.floor(h) - 0.5) * Math.min(14, len * 0.22);
            ctx.lineTo(x0 + dx * f - dy / len * h, y0 + dy * f + dx / len * h);
          }
          ctx.lineTo(x1, y1);
        }
        ctx.globalAlpha = pass === 0 ? t * 0.45 : t;
        ctx.strokeStyle = pass === 0 ? b.col : '#ffffff';
        ctx.lineWidth = pass === 0 ? b.w * 3.2 : b.w;
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  /* 시뮬레이션 이벤트 → 이펙트. vis: 보는 팀에게 그 자리가 보이는가 */
  FX.prototype.onEvent = function (ev, W) {
    var x = ev.x, y = ev.y;
    switch (ev.t) {
      case 'shot':
        switch (ev.fx) {
          case 'hammer': this.sparks(ev.tx, ev.ty, 5, 120, '#ffd98a', 0.25); this.ring(ev.tx, ev.ty, 3, 26, 'rgba(255,255,255,0.6)', 0.18, 2); break;
          case 'smash': this.ring(ev.tx, ev.ty, 5, 60, 'rgba(255,255,255,0.6)', 0.25, 3); this.smoke(ev.tx, ev.ty, 3, 6, '#7a6a50', 0.6); this.debris(ev.tx, ev.ty, 4, 90, ['#6a4526', '#8a6238']); this.shake = Math.max(this.shake, 1.5); break;
          case 'wrench': case 'slap': this.sparks(ev.tx, ev.ty, 2, 70, '#fff3a8', 0.18); break;
          case 'burr': this.sparks(ev.tx, ev.ty, 3, 80, '#d9ff8a', 0.2); break;
          case 'blade':
            this.add(RING, ev.tx, ev.ty, 0, 0, 0.14, 4, 'rgba(255,255,255,0.9)', { grow: 16, lw: 2 });
            if (ev.charged) { this.flash(ev.tx, ev.ty, 22, '#ffe66b', 0.2); this.bolt([x, y, ev.tx, ev.ty], '#ffe66b', 0.12, 1.6); }
            break;
          // 쏜 자리의 연기·섬광은 그 자리가 보일 때만 (ev.sv)
          case 'cannon': if (ev.sv !== false) { this.smoke(x, y, 2, 5, '#8a8580', 0.5); this.flash(x, y, 14, '#ffd27a', 0.1); } break;
          case 'mortar': if (ev.sv !== false) { this.smoke(x, y, 4, 7, '#6a6560', 0.8); this.flash(x, y, 18, '#ffb347', 0.12); } break;
          case 'gourd': if (ev.sv !== false) this.debris(x, y, 3, 60, ['#5fae3c', '#a4dc5c'], LEAF); break;
          case 'chain': case 'rodzap':
            var pts = [x, y].concat(ev.pts || [ev.tx, ev.ty]);
            this.bolt(pts, ev.charged ? '#fff09a' : '#ffe66b', 0.18, ev.charged ? 2.6 : 1.9);
            for (var i = 2; i < pts.length; i += 2) { this.flash(pts[i], pts[i + 1], ev.charged ? 20 : 14, '#ffe66b', 0.16, ev.air); this.sparks(pts[i], pts[i + 1], 3, 110, '#fff7b0', 0.22); }
            break;
          case 'strike': this.warn(ev.tx, ev.ty, 30, 0.55); if (ev.sv !== false) this.ring(x, y, 6, 30, 'rgba(255,230,107,0.7)', 0.3, 2); break;
        }
        break;
      case 'hit':
        switch (ev.fx) {
          case 'nail': case 'gyro': this.sparks(x, y, 2, 90, '#ffe9a8', 0.15); break;
          case 'cannon': this.explosion(x, y, 9, '#ffc45a'); break;
          case 'seed': case 'thorn': this.sparks(x, y, 2, 70, '#e3cf8f', 0.18); this.debris(x, y, 1, 50, ['#a4dc5c'], LEAF); break;
          case 'pollen': this.add(SMOKE, x, y, 0, -8, 0.35, 3, '#f4ffb0', { grow: 7, a: 0.6 }); break;
          case 'arrow': case 'talon':
            this.sparks(x, y, ev.charged ? 7 : 3, 130, '#fff7b0', 0.22); this.flash(x, y, ev.charged ? 22 : 11, '#ffe66b', 0.14);
            break;
        }
        break;
      case 'boom':
        if (ev.fx === 'mortar') { this.explosion(x, y, 20, '#ff9a3a'); this.debris(x, y, 6, 150, ['#4a443e', '#7a6a50', '#ff9a3a']); this.decal(x, y, ev.r * 0.9, 'scorch'); }
        else if (ev.fx === 'gourd') {
          this.flash(x, y, 34, '#ffb347', 0.16); this.ring(x, y, 6, ev.r * 2.4, 'rgba(255,190,90,0.8)', 0.3, 3);
          this.debris(x, y, 10, 170, ['#e08a2c', '#ffc266', '#a85a18', '#e3cf8f']); this.smoke(x, y, 3, 9, '#b0702a', 0.7);
          this.decal(x, y, ev.r * 0.8, 'sap'); this.shake = Math.max(this.shake, 2.5);
        } else {
          // 낙뢰
          this.bolt([x + rnd(-40, 40), y - 420, x + rnd(-14, 14), y - 200, x, y], '#fff09a', 0.28, 3.2);
          this.flash(x, y, 60, '#ffe66b', 0.26, true); this.ring(x, y, 6, ev.r * 2.6, 'rgba(255,250,200,0.9)', 0.3, 3);
          this.sparks(x, y, 12, 220, '#fff7b0', 0.45); this.decal(x, y, ev.r * 0.8, 'scorch'); this.shake = Math.max(this.shake, 4);
        }
        break;
      case 'death':
        if (ev.kind === 'unit') {
          var fac = R.UNITS[ev.type].faction, hi = ev.layer === 2, yy = hi ? y - 16 : y;
          if (fac === 'forge') { this.explosion(x, yy, ev.r, '#ffb347', hi); this.debris(x, yy, 6, 140, ['#6b7078', '#c9973f', '#3d4148']); this.decal(x, y, ev.r * 1.3, 'scorch'); }
          else if (fac === 'sprout') { this.debris(x, yy, 9, 130, ['#5fae3c', '#a4dc5c', '#2f6b2a'], LEAF); this.ring(x, yy, 3, ev.r * 3.4, 'rgba(190,255,130,0.7)', 0.3, 2, hi); this.smoke(x, yy, 2, ev.r * 0.6, '#6a8a4a', 0.6, hi); this.decal(x, y, ev.r * 1.2, 'sap'); }
          else { this.flash(x, yy, ev.r * 2.6, '#ffe66b', 0.2, hi); this.sparks(x, yy, 9, 190, '#fff7b0', 0.4, hi); this.debris(x, yy, 5, 120, ['#efe6cf', '#33407a', '#c9bc9a']); this.decal(x, y, ev.r * 1.1, 'scorch'); }
        } else {
          var sz = ev.size * R.TILE, n = ev.size * 2;
          for (var k = 0; k < n; k++) this.explosion(x + rnd(-sz, sz) * 0.4, y + rnd(-sz, sz) * 0.4, sz * rnd(0.18, 0.34), '#ff9a3a');
          var bf = R.BUILDINGS[ev.type].faction;
          this.debris(x, y, 14 + ev.size * 4, 200, bf === 'forge' ? ['#6b7078', '#c9973f', '#3d4148'] : (bf === 'sprout' ? ['#7a5232', '#5fae3c', '#4a2f1c'] : ['#efe6cf', '#33407a', '#8a6a48']), bf === 'sprout' ? LEAF : DEBRIS);
          this.smoke(x, y, 6 + ev.size * 2, sz * 0.3, '#3a3632', 1.8);
          this.decal(x, y, sz * 0.62, 'rubble');
          this.shake = Math.max(this.shake, 4 + ev.size);
        }
        break;
      case 'built':
        this.ring(x, y, 8, R.BUILDINGS[ev.type].size * 26, 'rgba(255,255,255,0.75)', 0.5, 3);
        this.sparks(x, y, 10, 150, '#fff3a8', 0.5);
        break;
      case 'buildStart': this.smoke(x, y, 5, 9, '#8a7a60', 0.7); break;
      case 'unitReady': this.ring(x, y, 4, 34, 'rgba(255,255,255,0.6)', 0.35, 2); break;
      case 'beam':
        this.bolt([ev.nx, ev.ny, x, y], ev.res === 'sun' ? '#ffe27a' : '#8af0e6', 0.2, 1.4);
        this.flash(x, y, 9, ev.res === 'sun' ? '#ffe27a' : '#8af0e6', 0.18);
        break;
      case 'deposit': this.add(RING, x, y, 0, 0, 0.25, 2, ev.res === 'sun' ? 'rgba(255,220,100,0.8)' : 'rgba(130,240,230,0.8)', { grow: 12, lw: 1.5 }); break;
      case 'depleted': this.smoke(x, y, 4, 8, '#8a8060', 0.8); break;
      case 'cancelled': this.smoke(x, y, 5, 10, '#8a7a60', 0.7); break;
      case 'researched': this.ring(x, y, 10, 90, 'rgba(160,220,255,0.8)', 0.6, 3); break;
      case 'power':
        if (ev.id === 'barrage') { this.ring(x, y, ev.r * 1.5, -ev.r * 0.5, 'rgba(255,150,80,0.95)', 0.9, 3); this.flash(x, y, 46, '#ff9a3a', 0.3); }
        else if (ev.id === 'bloom') {
          this.ring(x, y, 8, ev.r, 'rgba(180,255,150,0.95)', 0.7, 3); this.flash(x, y, ev.r * 0.9, '#9dff8a', 0.45);
          this.debris(x, y, 16, 170, ['#9dff8a', '#d9ffb0', '#5fae3c'], LEAF);
        } else { this.ring(x, y, 8, ev.r, 'rgba(255,240,150,0.95)', 0.5, 3); this.flash(x, y, ev.r, '#aab8ff', 0.35, true); this.shake = Math.max(this.shake, 3); }
        break;
      case 'rankup':
        this.ring(x, y, 4, 30, 'rgba(255,220,110,0.95)', 0.55, 2.5, true); this.sparks(x, y, 9, 120, '#ffe27a', 0.55, true);
        break;
    }
  };

  FX.SPARK = SPARK; FX.SMOKE = SMOKE; FX.DEBRIS = DEBRIS; FX.LEAF = LEAF; FX.RING = RING; FX.FLASH = FLASH;
  R.FX = FX;
})(typeof globalThis !== 'undefined' ? globalThis : this);
