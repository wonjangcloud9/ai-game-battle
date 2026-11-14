/* 고사장(학교 교실 한 칸 + 복도 + 창밖)을 만든다.
 * 좌표: x 오른쪽(+가 복도 쪽), y 위, z 뒤(-z 가 칠판 쪽). 단위 m.
 * 창문은 왼쪽(-x), 복도와 출입문은 오른쪽(+x) — 한국 교실의 흔한 배치. 교실은 3층이라 창밖 땅은 한참 아래다.
 */
(function (GX) {
  'use strict';
  var M4 = GX.M4, Geo = GX.Geo;

  var W = GX.W = {
    RX: 3.8, RZ: 4.8, H: 3.0,
    CX0: 4.0, CX1: 6.5, CZ: 9.5,
    COLS: [-2.55, -0.85, 0.85, 2.55],
    ROWS: [-2.4, -1.15, 0.1, 1.35, 2.6],
    DESK_Y: 0.74,
    DOOR_Z0: 3.35, DOOR_Z1: 4.3,
    AISLES: [-3.35, -1.7, 0, 1.7, 3.35],
    LANE_FRONT: -2.98, LANE_BACK: 3.84,
    SPAWN: [5.3, 7.3],
    CLOCK: [2.95, 2.5],
    WIN: [[-4.55, -2.65], [-2.15, -0.25], [0.25, 2.15], [2.65, 4.55]],
    SILL: 0.9, HEAD: 2.5,
    SUN: [-0.74, 0.60, -0.30],
    GROUND: -7.2,
    LAMP_X: [-2.5, 0, 2.5], LAMP_Z: [-3.0, 0, 3.0],
    CLAMP_Z: [-7.6, -3.8, 0, 3.8, 7.6]
  };

  var C = {
    wallHi: 0xefede5, wallLo: 0xa6c3b0, ceil: 0xf2f1ed, base: 0x56463a, slab: 0xd9d6cc, trim: 0x8fae9b,
    frame: 0xe9ebed, sash: 0xdfe2e5, sill: 0xd8d6cd, curtain: 0xe6dbc3, rail: 0x8d8f92,
    deskTop: 0xe5cda6, deskEdge: 0xc9ab7d, steel: 0x77838a, tray: 0x5c666d, chair: 0xd8b680, chairEdge: 0xb9955f, glide: 0x1d1e21,
    locker: 0xe4dac4, lockerDoorA: 0xdcc9a3, lockerDoorB: 0xd3bd92, door: 0xa9b8c2, doorDark: 0x7f909b, doorGlass: 0xdfeaef,
    boardFrame: 0xb9bdc1, lectern: 0xb98b5a, lecternTop: 0xa67a4c, cabinet: 0x9ba79c, white: 0xf5f5f1,
    dark: 0x2a2d31, black: 0x17181a, red: 0xc0392b
  };

  /* 벽 정면에서 봤을 때 왼쪽 위가 (u0,v0)이 되도록 세운 사각형. (nx,nz)는 벽면이 향하는 방향 */
  function vquad(g, nx, nz, cx, cz, half, y0, y1, color, uv) {
    var rx = nz, rz = -nx;
    g.quad([cx - rx * half, y1, cz - rz * half], [cx + rx * half, y1, cz + rz * half],
      [cx + rx * half, y0, cz + rz * half], [cx - rx * half, y0, cz - rz * half], color, uv || [0, 0, 1, 1], [nx, 0, nz]);
  }
  /* 책상 위에 눕힌 종이(앉은 사람이 보는 방향 기준). 먼 쪽(-z)이 종이의 위 */
  function dquad(g, x0, x1, zFar, zNear, y, color, uv) {
    g.quad([x0, y, zFar], [x1, y, zFar], [x1, y, zNear], [x0, y, zNear], color, uv || [0, 0, 1, 1], [0, 1, 0]);
  }
  GX.vquad = vquad; GX.dquad = dquad;

  function span(a, b) { return [(a + b) / 2, b - a]; }
  /* 벽 조각(높이 1m 에서 아래는 연두색 유광 페인트, 위는 미색으로 나눠 칠함) */
  function wall(g, x0, x1, y0, y1, z0, z1, lo, hi) {
    var sx = span(x0, x1), sz = span(z0, z1), sy, keep = g.gloss;
    lo = lo === undefined ? C.wallLo : lo; hi = hi === undefined ? C.wallHi : hi;
    if (y0 < 1.0) {
      sy = span(y0, Math.min(y1, 1.0));
      g.gloss = 0.24;
      g.box(sx[0], sy[0], sz[0], sx[1], sy[1], sz[1], lo, { uv: 0.5 });
    }
    if (y1 > 1.0) {
      sy = span(Math.max(y0, 1.0), y1);
      g.gloss = 0;
      g.box(sx[0], sy[0], sz[0], sx[1], sy[1], sz[1], hi, { uv: 0.5 });
    }
    g.gloss = keep;
  }

  /* 미닫이 창 한 틀: 바깥 틀 + 위 고정창 + 아래 두 짝. x 는 벽 가운데, inS 는 실내 쪽(+1 이면 +x 가 실내) */
  function windowUnit(gs, gg, x, z0, z1, sill, head, inS) {
    var zc = (z0 + z1) / 2, zw = z1 - z0, D = 0.1, f = 0.05, tr = head - 0.45, k;
    var ym = (sill + head) / 2, yh = head - sill;
    gs.box(x, sill + f / 2, zc, D, f, zw, C.frame);
    gs.box(x, head - f / 2, zc, D, f, zw, C.frame);
    gs.box(x, ym, z0 + f / 2, D, yh, f, C.frame);
    gs.box(x, ym, z1 - f / 2, D, yh, f, C.frame);
    gs.box(x, tr, zc, D, 0.05, zw, C.frame);
    gs.box(x, (tr + head) / 2, zc, D * 0.6, head - tr, 0.04, C.frame);
    var s = 0.036, y0 = sill + f, y1 = tr - 0.025, yc = (y0 + y1) / 2, hh = y1 - y0;
    for (k = 0; k < 2; k++) {
      var xa = x + inS * (k ? 0.022 : -0.022);
      var a = k ? zc - 0.03 : z0 + f, b = k ? z1 - f : zc + 0.03, m = (a + b) / 2, w = b - a;
      gs.box(xa, y0 + s / 2, m, 0.03, s, w, C.sash);
      gs.box(xa, y1 - s / 2, m, 0.03, s, w, C.sash);
      gs.box(xa, yc, a + s / 2, 0.03, hh, s, C.sash);
      gs.box(xa, yc, b - s / 2, 0.03, hh, s, C.sash);
      vquad(gg, inS, 0, xa, m, w / 2 - s, y0 + s, y1 - s, 0xcfe6f2);
      gs.box(xa + inS * 0.02, sill + 0.74, k ? a + 0.018 : b - 0.018, 0.012, 0.12, 0.016, 0x858b91);
    }
    gs.box(x + inS * 0.04, sill + 0.86, zc, 0.02, 0.03, 0.05, 0x9aa0a6);       /* 잠금쇠 */
    vquad(gg, inS, 0, x, zc, zw / 2 - f, tr + 0.025, head - f, 0xcfe6f2);
  }

  /* 기둥 앞에 묶어 둔 커튼 한 다발 */
  function curtain(g, x, z, w) {
    g.loft([
      { p: [x, 2.62, z], rx: w, rz: 0.04 },
      { p: [x, 2.36, z], rx: w * 0.96, rz: 0.05 },
      { p: [x, 1.86, z], rx: w * 0.66, rz: 0.055 },
      { p: [x, 1.56, z], rx: w * 0.36, rz: 0.048 },
      { p: [x, 1.36, z], rx: w * 0.52, rz: 0.056 },
      { p: [x, 1.08, z], rx: w * 0.64, rz: 0.06 },
      { p: [x, 0.98, z], rx: w * 0.62, rz: 0.055 }
    ], 16, C.curtain, { side: [0, 0, 1], uv: [0, 0, 2, 1.3], cap1: true });
  }

  /* 천장에 붙은 2등용 형광등(관은 z 방향). 빛나는 관은 ge 에 따로 */
  function fixture(gs, ge, x, z, y) {
    var s;
    gs.box(x, y - 0.02, z, 0.2, 0.04, 1.27, C.white);
    for (s = -1; s <= 1; s += 2) {
      gs.push().translate(x + s * 0.118, y - 0.058, z).rotZ(s * 0.52);
      gs.box(0, 0, 0, 0.1, 0.006, 1.25, 0xf7f7f3);
      gs.pop();
      ge.tube([x + s * 0.055, y - 0.082, z - 0.6], [x + s * 0.055, y - 0.082, z + 0.6], 0.0165, 0.0165, 8, 0xffffff);
      gs.box(x + s * 0.055, y - 0.066, z - 0.612, 0.042, 0.052, 0.022, 0xe6e6e1);
      gs.box(x + s * 0.055, y - 0.066, z + 0.612, 0.042, 0.052, 0.022, 0xe6e6e1);
    }
  }

  function doorPanel(g) {
    /* 원점: 문짝 바닥 중앙. 두께는 x, 폭은 z */
    g.box(0, 1.03, 0, 0.036, 2.06, 0.95, C.door);
    g.box(0, 0.14, 0, 0.04, 0.26, 0.95, C.doorDark);
    g.box(0, 1.4, 0, 0.042, 0.5, 0.5, C.doorGlass);
    g.box(0, 1.4, 0, 0.046, 0.54, 0.03, C.doorDark);
    g.box(0, 1.14, 0, 0.046, 0.03, 0.56, C.doorDark); g.box(0, 1.66, 0, 0.046, 0.03, 0.56, C.doorDark);
    g.box(0.024, 1.02, 0.4, 0.02, 0.16, 0.03, C.dark);
    g.box(-0.024, 1.02, 0.4, 0.02, 0.16, 0.03, C.dark);
  }

  /* 학생용 책상 + 의자 한 벌. gs 쇠·플라스틱, gw 나무 무늬, gd 바닥 그림자 */
  function desk(gs, gw, gd, x, z, r) {
    var off = [r() * 3, r() * 3], i, sx, sgn;
    /* 상판(멜라민, 둥근 모서리) */
    gw.gloss = 0.5;
    gw.slab(x, 0.729, z, 0.65, 0.022, 0.45, C.deskTop, { r: 0.03, seg: 3, uv: 1.3, uvOff: off, side: C.deskEdge, sideMul: 0.9 });
    /* 서랍(앞이 트인 철판 상자) */
    gs.gloss = 0.22;
    gs.box(x, 0.603, z + 0.012, 0.52, 0.006, 0.37, C.tray);
    gs.box(x - 0.26, 0.66, z + 0.012, 0.006, 0.118, 0.37, C.tray, { shade: [0.75, 1] });
    gs.box(x + 0.26, 0.66, z + 0.012, 0.006, 0.118, 0.37, C.tray, { shade: [0.75, 1] });
    gs.box(x, 0.66, z - 0.172, 0.52, 0.118, 0.006, C.tray, { shade: [0.75, 1] });
    gs.box(x, 0.612, z + 0.195, 0.52, 0.022, 0.006, C.tray);
    /* 다리(쇠 파이프) */
    gs.gloss = 0.32;
    for (sgn = -1; sgn <= 1; sgn += 2) {
      sx = x + sgn * 0.288;
      gs.tube([sx, 0.02, z - 0.17], [sx, 0.716, z - 0.17], 0.0125, 0.0125, 8, C.steel, { caps: false });
      gs.tube([sx, 0.02, z + 0.17], [sx, 0.716, z + 0.17], 0.0125, 0.0125, 8, C.steel, { caps: false });
      gs.tube([sx, 0.105, z - 0.17], [sx, 0.105, z + 0.17], 0.011, 0.011, 6, C.steel, { caps: false });
      gs.box(sx, 0.706, z, 0.03, 0.02, 0.38, C.steel);
    }
    gs.tube([x - 0.288, 0.3, z - 0.17], [x + 0.288, 0.3, z - 0.17], 0.011, 0.011, 6, C.steel, { caps: false });
    gs.gloss = 0.1;
    for (i = 0; i < 4; i++) gs.cyl(x + (i & 1 ? 0.288 : -0.288), 0, z + (i & 2 ? 0.17 : -0.17), 0.017, 0.015, 0.022, 8, C.glide);
    gs.box(x + 0.312, 0.62, z + 0.06, 0.012, 0.012, 0.03, C.steel);                /* 가방걸이 */
    gs.box(x + 0.322, 0.6, z + 0.06, 0.008, 0.05, 0.012, C.steel);
    /* 의자 */
    var cz = z + 0.5;
    gw.gloss = 0.4;
    gw.slab(x, 0.432, cz, 0.39, 0.018, 0.39, C.chair, { r: 0.05, seg: 3, uv: 1.3, uvOff: [off[1], off[0]], side: C.chairEdge, sideMul: 0.85 });
    gw.push().translate(x, 0.8, cz + 0.205).rotX(0.1);
    gw.box(0, 0, 0, 0.16, 0.19, 0.013, C.chair, { uv: 1.3, uvOff: off });
    for (sgn = -1; sgn <= 1; sgn += 2) {
      gw.push().translate(sgn * 0.078, 0, 0).rotY(-sgn * 0.26).translate(sgn * 0.055, 0, 0);
      gw.box(0, 0, 0, 0.115, 0.19, 0.013, C.chair, { uv: 1.3, uvOff: off });
      gw.pop();
    }
    gw.pop();
    gs.gloss = 0.32;
    for (sgn = -1; sgn <= 1; sgn += 2) {
      sx = x + sgn * 0.172;
      gs.tube([sx, 0.02, cz - 0.165], [sx, 0.424, cz - 0.165], 0.011, 0.011, 8, C.steel, { caps: false });
      gs.pipe([[sx, 0.02, cz + 0.2], [sx, 0.424, cz + 0.178], [sx - sgn * 0.004, 0.89, cz + 0.224]], 0.011, 8, C.steel);
      gs.tube([sx, 0.418, cz - 0.165], [sx, 0.418, cz + 0.178], 0.011, 0.011, 6, C.steel, { caps: false });
      gs.tube([sx, 0.16, cz - 0.165], [sx, 0.16, cz + 0.192], 0.009, 0.009, 6, C.steel, { caps: false });
    }
    gs.tube([x - 0.172, 0.418, cz + 0.178], [x + 0.172, 0.418, cz + 0.178], 0.011, 0.011, 6, C.steel, { caps: false });
    gs.gloss = 0.1;
    for (i = 0; i < 4; i++) gs.cyl(x + (i & 1 ? 0.172 : -0.172), 0, cz + (i & 2 ? 0.2 : -0.165), 0.015, 0.013, 0.022, 8, C.glide);
    gs.gloss = 0; gw.gloss = 0.35;
    gd.floorQuad(x - 0.48, z - 0.36, x + 0.48, z + 0.86, 0.004, 0xffffff, [0, 0, 1, 1]);
  }

  /* 책가방(둥근 상자 모양) */
  function bag(gs, x, y, z, s, colr, yaw) {
    gs.push().translate(x, y, z).rotY(yaw || 0);
    gs.loft([
      { p: [0, 0.0, 0], rx: 0.13 * s, rz: 0.075 * s },
      { p: [0, 0.03 * s, 0], rx: 0.15 * s, rz: 0.088 * s },
      { p: [0, 0.3 * s, 0], rx: 0.148 * s, rz: 0.086 * s },
      { p: [0, 0.38 * s, 0], rx: 0.11 * s, rz: 0.07 * s },
      { p: [0, 0.4 * s, 0], rx: 0.04 * s, rz: 0.03 * s }
    ], 12, colr, { side: [1, 0, 0], sq: 3.2, cap0: true, cap1: true });
    gs.loft([
      { p: [0, 0.04 * s, -0.085 * s], rx: 0.1 * s, rz: 0.02 * s },
      { p: [0, 0.12 * s, -0.1 * s], rx: 0.105 * s, rz: 0.03 * s },
      { p: [0, 0.2 * s, -0.09 * s], rx: 0.1 * s, rz: 0.02 * s }
    ], 10, GX.mixHex(colr, 0x000000, 0.18), { side: [1, 0, 0], sq: 3, cap0: true, cap1: true });
    gs.box(0, 0.415 * s, 0, 0.09 * s, 0.014 * s, 0.022 * s, 0x1c1d20);
    gs.pop();
  }

  /* 나무 한 그루(바깥). 줄기 + 잎 뭉치 */
  function tree(g, x, z, h, cr, seed, n) {
    var r = GX.rng(seed), G = W.GROUND, i, cy = G + h - cr * 0.8, from = g.count, d = g.data;
    g.tube([x, G, z], [x + (r() - 0.5) * 0.3, cy - cr * 0.1, z + (r() - 0.5) * 0.3], 0.2, 0.1, 6, 0x4b3d2e, { caps: false });
    for (i = 0; i < 3; i++) {
      var ba = r() * 6.28;
      g.tube([x, cy - cr * 0.5, z], [x + Math.cos(ba) * cr * 0.5, cy + cr * 0.1, z + Math.sin(ba) * cr * 0.5], 0.07, 0.035, 5, 0x4b3d2e, { caps: false });
    }
    var greens = [0x2f4d27, 0x3a5c2e, 0x466b35, 0x557a3e, 0x35562b, 0x628545];
    n = n || 16;
    /* 잎 뭉치 여러 개를 타원 모양 부피 안에 흩어 놓는다 */
    for (i = 0; i < n; i++) {
      var a = r() * 6.283, u = r() * 2 - 1, rad = Math.pow(r(), 0.34) * 0.84, s = Math.sqrt(1 - u * u);
      var br = cr * (0.27 + r() * 0.2);
      g.ellipsoid(x + Math.cos(a) * s * rad * cr, cy + u * rad * cr * 0.74, z + Math.sin(a) * s * rad * cr,
        br, br * (0.66 + r() * 0.25), br, greens[Math.floor(r() * greens.length)], { seg: 7, rings: 5 });
    }
    /* 위쪽·바깥쪽은 밝고 아래·안쪽은 어둡게 */
    for (var v = from; v < g.count; v++) {
      var o = v * 12, k = 0.5 + 0.62 * GX.clamp((d[o + 1] - (cy - cr * 0.75)) / (cr * 1.5), 0, 1) + 0.16 * d[o + 4];
      d[o + 6] *= k; d[o + 7] *= k; d[o + 8] *= k;
    }
  }
  /* 무광으로 그릴 바깥 물체에 햇빛 방향의 밝기를 미리 입힌다(from 번째 정점부터) */
  function bakeSun(g, from, amb, sunK) {
    var d = g.data, s = W.SUN, sl = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
    for (var v = from; v < g.count; v++) {
      var o = v * 12;
      var k = amb + sunK * Math.max(0, (d[o + 3] * s[0] + d[o + 4] * s[1] + d[o + 5] * s[2]) / sl) + 0.18 * Math.max(0, d[o + 4]);
      d[o + 6] *= k; d[o + 7] *= k; d[o + 8] *= k;
    }
  }

  GX.buildClassroom = function (eng, tx) {
    var gs = new Geo(), gw = new Geo(), gp = new Geo(), gf = new Geo(), gc = new Geo(), gt = new Geo();
    var gd = new Geo(), gg = new Geo(), ge = new Geo(), ge2 = new Geo(), gcu = new Geo(), ggl = new Geo();
    var r = GX.rng(20301), i, k;
    var RX = W.RX, RZ = W.RZ, H = W.H;
    var world = { seats: [], colliders: [], items: {}, tx: tx, eng: eng };
    attachMethods(world);
    gf.gloss = 0.62; gt.gloss = 0.8; gg.gloss = 1;

    /* ───── 바닥·천장 ───── */
    gf.quad([-RX, 0, -RZ], [RX, 0, -RZ], [RX, 0, RZ], [-RX, 0, RZ], 0xffffff, [-RX / 2, -RZ / 2, RX / 2, RZ / 2], [0, 1, 0]);
    gt.quad([W.CX0 - 0.2, 0, -W.CZ], [W.CX1, 0, -W.CZ], [W.CX1, 0, W.CZ], [W.CX0 - 0.2, 0, W.CZ], 0xc6cdc4,
      [0, -W.CZ / 1.4, 2.7 / 1.4, W.CZ / 1.4], [0, 1, 0]);
    gc.quad([-RX, H, RZ], [RX, H, RZ], [RX, H, -RZ], [-RX, H, -RZ], C.ceil, [-RX / 0.6, RZ / 0.6, RX / 0.6, -RZ / 0.6], [0, -1, 0]);
    gc.quad([W.CX0, H, W.CZ], [W.CX1, H, W.CZ], [W.CX1, H, -W.CZ], [W.CX0, H, -W.CZ], C.ceil,
      [0, W.CZ / 0.6, 2.5 / 0.6, -W.CZ / 0.6], [0, -1, 0]);
    gp.box(1.35, H + 0.11, 0, 10.9, 0.2, 19.6, C.slab);            /* 지붕 슬래브(햇빛 가림) */

    /* ───── 교실 벽 ───── */
    wall(gp, -4.0, 4.0, 0, H, -5.0, -4.8);                          /* 앞 */
    wall(gp, -4.0, 4.0, 0, H, 4.8, 5.0);                            /* 뒤 */
    wall(gp, -4.0, -3.8, 0, W.SILL, -RZ, RZ);                       /* 창 아래 */
    wall(gp, -4.0, -3.8, W.HEAD, H, -RZ, RZ);                       /* 창 위 */
    var piers = [[-RZ, W.WIN[0][0]], [W.WIN[0][1], W.WIN[1][0]], [W.WIN[1][1], W.WIN[2][0]], [W.WIN[2][1], W.WIN[3][0]], [W.WIN[3][1], RZ]];
    for (i = 0; i < piers.length; i++) wall(gp, -4.0, -3.8, W.SILL, W.HEAD, piers[i][0], piers[i][1]);
    for (i = 0; i < 4; i++) {
      var wz = W.WIN[i], zc = (wz[0] + wz[1]) / 2, zw = wz[1] - wz[0];
      windowUnit(gs, gg, -3.9, wz[0], wz[1], W.SILL, W.HEAD, 1);
      gs.gloss = 0.35;
      gs.box(-3.83, W.SILL - 0.006, zc, 0.38, 0.036, zw + 0.1, C.sill);
      /* 창밖 추락 방지 난간(스테인리스 봉 두 줄) */
      gs.gloss = 0.6;
      gs.tube([-4.13, 1.07, wz[0] - 0.06], [-4.13, 1.07, wz[1] + 0.06], 0.016, 0.016, 6, 0xb9bec2, { caps: false });
      gs.tube([-4.13, 1.34, wz[0] - 0.06], [-4.13, 1.34, wz[1] + 0.06], 0.016, 0.016, 6, 0xb9bec2, { caps: false });
      gs.tube([-4.13, 0.9, wz[0] - 0.03], [-4.13, 1.4, wz[0] - 0.03], 0.014, 0.014, 6, 0xb9bec2);
      gs.tube([-4.13, 0.9, wz[1] + 0.03], [-4.13, 1.4, wz[1] + 0.03], 0.014, 0.014, 6, 0xb9bec2);
      gs.gloss = 0;
    }
    /* 커튼(창 사이 기둥마다 묶어 둠) */
    gs.box(-3.74, 2.66, 0, 0.03, 0.035, 9.5, C.rail);
    for (i = 0; i < piers.length; i++) {
      var pc = (piers[i][0] + piers[i][1]) / 2;
      pc = Math.max(-RZ + 0.2, Math.min(RZ - 0.2, pc));
      curtain(gcu, -3.71, pc, i === 0 || i === piers.length - 1 ? 0.15 : 0.2);
      gs.box(-3.71, 1.56, pc, 0.115, 0.045, 0.16, 0xbfae8a);
      gs.box(-3.785, 1.56, pc + 0.09, 0.03, 0.02, 0.02, C.rail);
    }

    /* 복도 쪽 벽(문 2개 + 높은 채광창) */
    wall(gp, 3.8, 4.0, 0, H, -RZ, -4.3);
    wall(gp, 3.8, 4.0, 2.1, H, -4.3, -2.4);
    wall(gp, 3.8, 4.0, 0, 2.15, -2.4, 2.4);
    wall(gp, 3.8, 4.0, 2.75, H, -2.4, 2.4);
    wall(gp, 3.8, 4.0, 2.15, 2.75, -2.4, -2.0);
    wall(gp, 3.8, 4.0, 2.15, 2.75, 2.0, 2.4);
    wall(gp, 3.8, 4.0, 2.1, H, 2.4, 4.3);
    wall(gp, 3.8, 4.0, 0, H, 4.3, RZ);
    for (i = 0; i < 4; i++) gs.box(3.9, 2.45, -2.0 + i * 1.3333, 0.08, 0.6, 0.05, C.frame);
    gs.box(3.9, 2.17, 0, 0.08, 0.04, 4.0, C.frame);
    gs.box(3.9, 2.73, 0, 0.08, 0.04, 4.0, C.frame);
    vquad(gg, -1, 0, 3.9, 0, 2.0, 2.19, 2.71, 0xdfeaf0);
    /* 문틀 */
    var doors = [[-4.3, -2.4], [2.4, 4.3]];
    for (i = 0; i < 2; i++) {
      var d0 = doors[i][0], d1 = doors[i][1];
      gs.box(3.9, 1.05, d0 + 0.02, 0.22, 2.1, 0.04, C.doorDark);
      gs.box(3.9, 1.05, d1 - 0.02, 0.22, 2.1, 0.04, C.doorDark);
      gs.box(3.9, 2.08, (d0 + d1) / 2, 0.22, 0.04, d1 - d0, C.doorDark);
      gs.box(3.9, 0.006, (d0 + d1) / 2, 0.2, 0.012, d1 - d0, 0x8a8f94);
    }
    /* 앞문(닫힘) 두 짝 + 뒷문 고정 짝 */
    gs.push().translate(3.93, 0, -3.825); doorPanel(gs); gs.pop();
    gs.push().translate(3.87, 0, -2.875); doorPanel(gs); gs.pop();
    gs.push().translate(3.93, 0, 2.875); doorPanel(gs); gs.pop();

    /* 걸레받이 · 허리 몰딩 */
    gs.box(0, 0.05, -RZ + 0.008, 7.6, 0.1, 0.016, C.base);
    gs.box(0, 0.05, RZ - 0.008, 7.6, 0.1, 0.016, C.base);
    gs.box(-RX + 0.008, 0.05, 0, 0.016, 0.1, 9.6, C.base);
    gs.box(RX - 0.008, 0.05, 0, 0.016, 0.1, 4.8, C.base);
    gs.box(0, 1.0, -RZ + 0.005, 7.6, 0.022, 0.01, C.trim);
    gs.box(0, 1.0, RZ - 0.005, 7.6, 0.022, 0.01, C.trim);
    gs.box(RX - 0.005, 1.0, 0, 0.01, 0.022, 4.8, C.trim);
    gs.box(RX - 0.005, 1.0, -4.55, 0.01, 0.022, 0.5, C.trim);
    gs.box(RX - 0.005, 1.0, 4.55, 0.01, 0.022, 0.5, C.trim);

    /* ───── 복도 ───── */
    wall(gp, 3.8, 4.0, 0, H, -W.CZ, -5.0);
    wall(gp, 3.8, 4.0, 0, H, 5.0, W.CZ);
    wall(gp, 3.8, 6.7, 0, H, -W.CZ - 0.2, -W.CZ);
    wall(gp, 3.8, 6.7, 0, H, W.CZ, W.CZ + 0.2);
    wall(gp, 6.5, 6.7, 0, 1.0, -W.CZ, W.CZ);
    wall(gp, 6.5, 6.7, 2.4, H, -W.CZ, W.CZ);
    var cw = [-7.2, -4.8, -2.4, 0, 2.4, 4.8, 7.2], prev = -W.CZ;
    for (i = 0; i < cw.length; i++) {
      wall(gp, 6.5, 6.7, 1.0, 2.4, prev, cw[i] - 0.85);
      prev = cw[i] + 0.85;
      windowUnit(gs, gg, 6.6, cw[i] - 0.85, cw[i] + 0.85, 1.0, 2.4, -1);
      gs.gloss = 0.35;
      gs.box(6.55, 0.994, cw[i], 0.32, 0.036, 1.8, C.sill);
      gs.gloss = 0;
    }
    wall(gp, 6.5, 6.7, 1.0, 2.4, prev, W.CZ);
    gs.box(4.008, 0.05, 0, 0.016, 0.1, 19, C.base);
    gs.box(6.492, 0.05, 0, 0.016, 0.1, 19, C.base);
    gs.box(4.005, 1.0, 0, 0.01, 0.022, 19, C.trim);
    /* 옆 고사실 문(닫힘) */
    var other = [[-8.6, 'room2'], [5.75, 'room4']];
    for (i = 0; i < 2; i++) {
      var oz = other[i][0];
      gs.box(4.0, 1.05, oz + 0.95, 0.06, 2.14, 1.98, C.doorDark);
      gs.push().translate(4.03, 0, oz + 0.475); doorPanel(gs); gs.pop();
      gs.push().translate(4.03, 0, oz + 1.425); doorPanel(gs); gs.pop();
    }
    /* 신발장 */
    gw.gloss = 0.3;
    gw.box(6.31, 0.44, 0, 0.38, 0.88, 6.0, 0xd9c7a2, { uv: 1.1 });
    for (i = 0; i < 15; i++) for (k = 0; k < 2; k++) {
      gs.box(6.125, 0.24 + k * 0.4, -2.8 + i * 0.4, 0.02, 0.32, 0.34, 0x3d342a);
      if (r() > 0.4) {
        var shoe = [0xf2f2ee, 0x2f3338, 0x4a6fa5, 0xb9b9b4, 0x8a5a3c][Math.floor(r() * 5)], sz0 = -2.8 + i * 0.4 + (r() - 0.5) * 0.08;
        gs.ellipsoid(6.15, 0.125 + k * 0.4, sz0 - 0.05, 0.045, 0.035, 0.1, shoe, { seg: 8, rings: 5 });
        gs.ellipsoid(6.15, 0.125 + k * 0.4, sz0 + 0.07, 0.045, 0.035, 0.1, shoe, { seg: 8, rings: 5 });
      }
    }
    /* 소화기 */
    gs.gloss = 0.5;
    gs.lathe(4.14, 0.04, -1.4, [[0.062, 0], [0.066, 0.02], [0.066, 0.34], [0.05, 0.41], [0.024, 0.43], [0.024, 0.47]], 14, C.red, { cap0: true, cap1: true });
    gs.gloss = 0.2;
    gs.box(4.14, 0.53, -1.4, 0.03, 0.03, 0.09, C.black);
    gs.tube([4.14, 0.5, -1.36], [4.2, 0.3, -1.33], 0.008, 0.008, 6, C.black);
    gs.box(4.03, 0.25, -1.4, 0.05, 0.5, 0.2, 0x8f2a20);
    gs.gloss = 0;
    /* 복도 끝 문 */
    gs.box(5.25, 1.1, -W.CZ + 0.03, 1.8, 2.2, 0.06, C.doorDark);
    gs.box(4.82, 1.1, -W.CZ + 0.07, 0.84, 2.1, 0.03, C.door);
    gs.box(5.68, 1.1, -W.CZ + 0.07, 0.84, 2.1, 0.03, C.door);
    gs.box(4.82, 1.55, -W.CZ + 0.09, 0.4, 0.6, 0.02, C.doorGlass);
    gs.box(5.68, 1.55, -W.CZ + 0.09, 0.4, 0.6, 0.02, C.doorGlass);
    /* 복도로 튀어나온 반 표지판 */
    gs.box(4.14, 2.5, 3.2, 0.3, 0.2, 0.02, 0x2b4a6b);
    gs.box(4.02, 2.5, 3.2, 0.06, 0.03, 0.03, C.rail);

    /* ───── 조명 기구 ───── */
    var n = 0;
    for (i = 0; i < W.LAMP_X.length; i++) for (k = 0; k < W.LAMP_Z.length; k++) {
      var fl = n === 5;                                   /* 한 대는 가끔 깜빡인다 */
      fixture(gs, fl ? ge2 : ge, W.LAMP_X[i], W.LAMP_Z[k], H);
      ggl.quad([W.LAMP_X[i] - 0.75, H - 0.1, W.LAMP_Z[k] + 1.1], [W.LAMP_X[i] + 0.75, H - 0.1, W.LAMP_Z[k] + 1.1],
        [W.LAMP_X[i] + 0.75, H - 0.1, W.LAMP_Z[k] - 1.1], [W.LAMP_X[i] - 0.75, H - 0.1, W.LAMP_Z[k] - 1.1], 0xffffff, [0, 0, 1, 1], [0, -1, 0]);
      if (fl) world.flickPos = [W.LAMP_X[i], H - 0.08, W.LAMP_Z[k]];
      n++;
    }
    for (i = 0; i < W.CLAMP_Z.length; i++) {
      fixture(gs, ge, 5.25, W.CLAMP_Z[i], H);
      ggl.quad([4.5, H - 0.1, W.CLAMP_Z[i] + 1.1], [6.0, H - 0.1, W.CLAMP_Z[i] + 1.1], [6.0, H - 0.1, W.CLAMP_Z[i] - 1.1], [4.5, H - 0.1, W.CLAMP_Z[i] - 1.1],
        0xffffff, [0, 0, 1, 1], [0, -1, 0]);
    }
    /* 햇빛·바탕빛·면광원. 바탕빛은 낮추고 창과 형광등의 방향 있는 빛을 살려 창가에서 복도 쪽으로 어두워지게 한다 */
    eng.setSun(W.SUN, [4.6, 4.0, 3.1], [-4.3, -0.2, -5.3, 4.2, 3.4, 5.3]);
    eng.split = 3.9; eng.ceilY = H - 0.08;
    world.lampBase = [0.82, 0.86, 0.845];
    eng.setZone(0, {
      ambSky: [0.105, 0.11, 0.12], ambGround: [0.27, 0.255, 0.232], box: [-RX, 0, -RZ, RX, H, RZ],
      win: { x: -4.06, y0: W.SILL, y1: W.HEAD, z0: -4.55, z1: 4.55, sign: -1, color: [3.2, 3.6, 4.25] },
      winRef: { z0: -3.6, period: 2.4, half: 0.9, count: 4 },
      lamp: { y: H + 0.04, x0: -RX, x1: RX, z0: -RZ, z1: RZ, color: world.lampBase },
      tube: { x0: W.LAMP_X[0], z0: W.LAMP_Z[0], px: 2.5, pz: 3.0, hx: 0.075, hz: 0.6, nx: 3, nz: 3, color: [26, 27, 26] }
    });
    eng.setZone(1, {
      ambSky: [0.105, 0.11, 0.12], ambGround: [0.25, 0.25, 0.235], box: [W.CX0, 0, -W.CZ, W.CX1, H, W.CZ],
      win: { x: 6.76, y0: 1.0, y1: 2.4, z0: -8.05, z1: 8.05, sign: 1, color: [2.3, 2.55, 2.95] },
      winRef: { z0: -7.2, period: 2.4, half: 0.8, count: 7 },
      lamp: { y: H + 0.04, x0: W.CX0, x1: W.CX1, z0: -W.CZ, z1: W.CZ, color: [0.56, 0.585, 0.575] },
      tube: { x0: 5.25, z0: W.CLAMP_Z[0], px: 1, pz: 3.8, hx: 0.075, hz: 0.6, nx: 1, nz: 5, color: [26, 27, 26] }
    });
    eng.fog = [0.80, 0.82, 0.80, 0.004];
    eng.exposure = 0.86;
    eng.clear = [0.62, 0.78, 0.93];

    /* 천장형 에어컨 · 화재 감지기 */
    gs.box(0, H - 0.03, 1.5, 0.86, 0.06, 0.86, C.white);
    gs.box(0, H - 0.062, 1.5, 0.5, 0.006, 0.5, 0xd9dcdf);
    for (i = 0; i < 9; i++) gs.box(0, H - 0.066, 1.5 - 0.2 + i * 0.05, 0.46, 0.004, 0.012, 0xb9bdc1);
    for (i = 0; i < 4; i++) gs.box(i < 2 ? (i ? 0.36 : -0.36) : 0, H - 0.062, 1.5 + (i < 2 ? 0 : (i === 2 ? 0.36 : -0.36)), i < 2 ? 0.05 : 0.6, 0.006, i < 2 ? 0.6 : 0.05, 0x3a3d41);
    for (i = 0; i < 2; i++) {
      gs.push().translate(i ? 1.25 : -1.25, H, i ? -1.5 : 1.6).rotX(Math.PI);
      gs.lathe(0, 0, 0, [[0.055, 0], [0.055, 0.012], [0.04, 0.03], [0.015, 0.036]], 12, C.white, { cap1: true });
      gs.pop();
    }

    /* ───── 칠판 주변 ───── */
    var BZ = -RZ + 0.03;
    gs.gloss = 0.5;
    gs.box(0, 2.12, -RZ + 0.02, 4.5, 0.04, 0.04, C.boardFrame);
    gs.box(0, 0.88, -RZ + 0.02, 4.5, 0.04, 0.04, C.boardFrame);
    gs.box(-2.23, 1.5, -RZ + 0.02, 0.04, 1.28, 0.04, C.boardFrame);
    gs.box(2.23, 1.5, -RZ + 0.02, 0.04, 1.28, 0.04, C.boardFrame);
    gs.box(0, 0.855, -RZ + 0.055, 4.4, 0.014, 0.09, C.boardFrame);         /* 분필받이 */
    gs.box(0, 0.872, -RZ + 0.098, 4.4, 0.022, 0.006, C.boardFrame);
    gs.gloss = 0;
    gs.box(0, 0.8635, -RZ + 0.05, 4.2, 0.002, 0.07, 0xd9d8d0);             /* 분필 가루 */
    /* 칠판지우개 2개 · 분필 */
    for (i = 0; i < 2; i++) {
      var ex = i ? 1.62 : -1.3;
      gs.box(ex, 0.874, -RZ + 0.052, 0.14, 0.018, 0.055, 0xcfcabb);
      gs.box(ex, 0.892, -RZ + 0.052, 0.145, 0.02, 0.058, i ? 0x7a3b32 : 0x2c3d57);
    }
    var chalks = [[0.35, 0xfbfaf5, 0.2], [0.47, 0xf5e089, -0.3], [0.6, 0xf3b3b3, 0.1], [-0.4, 0xfbfaf5, 1.2], [-0.52, 0xbfdcf5, 0.4], [1.1, 0xfbfaf5, -0.15]];
    for (i = 0; i < chalks.length; i++) {
      gs.push().translate(chalks[i][0], 0.869, -RZ + 0.045 + (i % 3) * 0.012).rotY(chalks[i][2]);
      gs.tube([-0.03, 0, 0], [0.03, 0, 0], 0.0055, 0.005, 6, chalks[i][1]);
      gs.pop();
    }
    /* 태극기 · 급훈 액자, 스피커, 시계 테, TV */
    function frame(cx, cy, w, h, colr) {
      gs.box(cx, cy + h / 2, -RZ + 0.016, w + 0.04, 0.03, 0.032, colr);
      gs.box(cx, cy - h / 2, -RZ + 0.016, w + 0.04, 0.03, 0.032, colr);
      gs.box(cx - w / 2, cy, -RZ + 0.016, 0.03, h, 0.032, colr);
      gs.box(cx + w / 2, cy, -RZ + 0.016, 0.03, h, 0.032, colr);
      gs.box(cx, cy, -RZ + 0.006, w, h, 0.012, 0x4a3a2a);
    }
    frame(0, 2.55, 0.6, 0.41, 0x6b5138);
    frame(1.2, 2.55, 0.72, 0.33, 0x5a4330);
    gs.box(-1.25, 2.56, -RZ + 0.075, 0.3, 0.21, 0.15, 0x33373c);
    gs.box(-1.25, 2.56, -RZ + 0.152, 0.26, 0.17, 0.004, 0x1f2226);
    for (i = 0; i < 6; i++) gs.box(-1.25, 2.5 + i * 0.024, -RZ + 0.155, 0.24, 0.006, 0.002, 0x4a4e54);
    gs.gloss = 0.5;
    gs.push().translate(W.CLOCK[0], W.CLOCK[1], -RZ).rotX(Math.PI / 2);
    gs.lathe(0, 0, 0, [[0.198, 0], [0.206, 0.014], [0.204, 0.036], [0.192, 0.046], [0.181, 0.04], [0.178, 0.03]], 32, 0x1d2025, {});
    gs.pop();
    gs.gloss = 0.9;
    gs.push().translate(-3.25, 2.3, -4.42).rotY(0.62);
    gs.box(0, 0, 0.0285, 1.06, 0.6, 0.002, 0x08090a);
    gs.gloss = 0.3;
    gs.box(0, 0, 0, 1.12, 0.66, 0.05, 0x1b1d20);
    gs.box(0, 0.1, -0.1, 0.1, 0.1, 0.18, 0x44484d);
    gs.box(0, -0.345, 0.02, 0.14, 0.03, 0.02, 0x2a2c30);
    gs.pop();
    gs.gloss = 0;
    /* 전등 스위치 옆 손 소독제 */
    gs.box(3.2, 1.3, -RZ + 0.03, 0.09, 0.2, 0.06, 0xf1f1ee);
    gs.cyl(3.2, 1.4, -RZ + 0.05, 0.022, 0.016, 0.05, 8, 0x5d8fd0);
    gs.box(3.2, 1.2, -RZ + 0.07, 0.11, 0.02, 0.1, 0xdadbd6);

    /* ───── 교탁 · 감독관 책상 ───── */
    gw.gloss = 0.3;
    gw.box(0.95, 0.5, -3.55, 0.62, 1.0, 0.44, C.lectern, { uv: 1.1, shade: [0.8, 1] });
    gw.slab(0.95, 1.015, -3.55, 0.72, 0.03, 0.52, C.lecternTop, { r: 0.02, uv: 1.1, side: 0x8f6a41 });
    gw.box(0.95, 0.5, -3.325, 0.5, 0.86, 0.012, 0xa97c4d, { uv: 1.1 });
    gw.gloss = 0.5;
    gw.slab(-2.75, 0.725, -3.85, 1.3, 0.03, 0.64, C.deskTop, { r: 0.02, uv: 1.2, side: C.deskEdge });
    gs.gloss = 0.3;
    gs.box(-3.37, 0.355, -3.85, 0.03, 0.71, 0.6, 0x8a9197);
    gs.box(-2.13, 0.355, -3.85, 0.03, 0.71, 0.6, 0x8a9197);
    gs.box(-2.75, 0.45, -4.14, 1.22, 0.5, 0.02, 0x8a9197);
    gs.box(-2.36, 0.43, -3.85, 0.4, 0.54, 0.56, 0x858c92, { shade: [0.85, 1] });        /* 서랍 */
    for (i = 0; i < 3; i++) {
      gs.box(-2.36, 0.26 + i * 0.17, -3.566, 0.37, 0.15, 0.008, 0x92999f);
      gs.box(-2.36, 0.29 + i * 0.17, -3.558, 0.12, 0.014, 0.01, 0x4a4f55);
    }
    gs.gloss = 0;
    world.teacherDesk = { x: -2.75, y: 0.74, z: -3.85 };
    /* 봉투 더미 · 여분 사인펜 통 · 물티슈 */
    gs.box(-3.12, 0.79, -3.9, 0.36, 0.1, 0.26, 0xc9a471, { shade: [0.85, 1] });
    gs.box(-3.1, 0.855, -3.88, 0.36, 0.03, 0.26, 0xbf9a66);
    gs.cyl(-2.62, 0.74, -4.02, 0.04, 0.045, 0.1, 10, 0x3d4a5c);
    for (i = 0; i < 5; i++) gs.tube([-2.62 + (i - 2) * 0.012, 0.76, -4.02 + (i % 2) * 0.014], [-2.62 + (i - 2) * 0.03, 0.9, -4.02 + (i % 2 ? 0.03 : -0.02)], 0.0045, 0.0045, 5, C.black);
    gs.box(-2.2, 0.78, -4.0, 0.22, 0.07, 0.12, 0xe8eef2);
    gs.box(-2.2, 0.817, -4.0, 0.08, 0.004, 0.04, 0x5aa0d8);

    /* ───── 뒤쪽: 사물함 · 청소도구함 · 가방 ───── */
    gw.gloss = 0.28;
    gw.box(-0.85, 0.5, 4.59, 4.8, 1.0, 0.42, C.locker, { uv: 0.9, shade: [0.82, 1] });
    gw.box(-0.85, 1.008, 4.585, 4.84, 0.016, 0.44, 0xcdbf9f, { uv: 0.9 });
    for (i = 0; i < 12; i++) for (k = 0; k < 2; k++) {
      var lx = -3.05 + i * 0.4, ly = 0.3 + k * 0.45;
      gw.box(lx, ly, 4.374, 0.37, 0.42, 0.012, (i + k) % 2 ? C.lockerDoorA : C.lockerDoorB, { uv: 1.1, uvOff: [i, k] });
      gs.box(lx + 0.13, ly, 4.366, 0.02, 0.07, 0.01, 0x6f6455);
      gs.box(lx - 0.1, ly + 0.14, 4.3675, 0.09, 0.05, 0.002, 0xf7f5ee);
      for (var v = 0; v < 3; v++) gs.box(lx, ly - 0.13 - v * 0.018, 4.3675, 0.12, 0.006, 0.002, 0x7a6c56);
    }
    gs.gloss = 0.25;
    gs.box(-3.54, 0.9, 4.54, 0.48, 1.8, 0.5, C.cabinet, { shade: [0.82, 1] });
    gs.box(-3.54, 0.9, 4.288, 0.012, 1.74, 0.006, 0x5d665f);
    gs.box(-3.46, 1.0, 4.284, 0.02, 0.12, 0.012, 0x44484d);
    gs.gloss = 0.05;
    var bagCols = [0x24272c, 0x2b3a55, 0x6b6f76, 0x7a2d34, 0x39523f, 0x8a7a5c, 0x1f2f3f, 0x55402f];
    for (i = 0; i < 9; i++) bag(gs, -2.95 + i * 0.5 + (r() - 0.5) * 0.1, 1.016, 4.56 + (r() - 0.5) * 0.06, 0.9 + r() * 0.2, bagCols[i % bagCols.length], Math.PI + (r() - 0.5) * 0.5);
    for (i = 0; i < 5; i++) bag(gs, 1.9 + i * 0.36, 0, 4.63, 0.95 + r() * 0.15, bagCols[(i + 3) % bagCols.length], Math.PI + (r() - 0.5) * 0.3);
    gs.gloss = 0;
    gs.box(-0.9, 1.78, RZ - 0.012, 4.3, 1.1, 0.024, 0x8b6a45);
    /* 벽걸이 선풍기(문 위) */
    for (i = 0; i < 2; i++) {
      gs.push().translate(3.78, 2.56, i ? 3.35 : -3.35).rotZ(Math.PI / 2 + 0.25);
      gs.gloss = 0.3;
      gs.cyl(0, -0.02, 0, 0.05, 0.06, 0.14, 10, 0xe9e9e5);
      gs.lathe(0, 0.2, 0, [[0.2, -0.05], [0.215, -0.03], [0.215, 0.0], [0.2, 0.03]], 20, 0xd9dadb, {});
      for (k = 0; k < 16; k++) {
        gs.push().translate(0, 0.2, 0).rotY(k / 16 * Math.PI * 2);
        gs.box(0.1, 0.03, 0, 0.2, 0.003, 0.004, 0xcfd0d1); gs.box(0.1, -0.05, 0, 0.2, 0.003, 0.004, 0xcfd0d1);
        gs.pop();
      }
      for (k = 0; k < 3; k++) {
        gs.push().translate(0, 0.185, 0).rotY(k / 3 * Math.PI * 2 + 0.4).rotX(0.35);
        gs.ellipsoid(0.1, 0, 0, 0.085, 0.004, 0.05, 0x8fb7d8, { seg: 8, rings: 4 });
        gs.pop();
      }
      gs.gloss = 0;
      gs.pop();
    }
    /* 분리수거함 */
    gs.gloss = 0.3;
    gs.box(3.52, 0.3, 4.52, 0.34, 0.6, 0.34, 0x4b7fb8, { shade: [0.8, 1] });
    gs.box(3.52, 0.61, 4.52, 0.36, 0.03, 0.36, 0x3b679a);
    gs.gloss = 0;

    /* ───── 책상 20개 ───── */
    for (var col = 0; col < 4; col++) {
      for (var row = 0; row < 5; row++) {
        var sx = W.COLS[col], sz = W.ROWS[row], s = col * 5 + row;
        desk(gs, gw, gd, sx, sz, r);
        world.seats.push({
          i: s, col: col, row: row, x: sx, z: sz, no: GX.examNo(s),
          chair: [sx, sz + 0.5], eye: [sx, 1.17, sz + 0.4]
        });
        world.colliders.push([sx - 0.34, sz - 0.25, sx + 0.34, sz + 0.76]);
      }
    }
    gd.floorQuad(0.5, -3.95, 1.4, -3.15, 0.004, 0xffffff, [0, 0, 1, 1]);
    gd.floorQuad(-3.6, -4.4, -1.9, -3.35, 0.004, 0xffffff, [0, 0, 1, 1]);
    gd.floorQuad(-3.6, 4.05, 1.8, 4.95, 0.004, 0xffffff, [0, 0, 1, 1]);
    gd.floorQuad(-3.95, 4.1, -3.2, 4.95, 0.004, 0xffffff, [0, 0, 1, 1]);
    gd.floorQuad(1.6, 4.3, 3.75, 4.95, 0.004, 0xffffff, [0, 0, 1, 1]);
    gd.floorQuad(5.85, -3.3, 6.6, 3.3, 0.004, 0xffffff, [0, 0, 1, 1]);

    /* ───── 메시 등록 ───── */
    var I = world.items;
    I.solid = eng.add(eng.createMesh(gs), {});
    I.wood = eng.add(eng.createMesh(gw), { tex: tx.wood });
    I.wall = eng.add(eng.createMesh(gp), { tex: tx.plaster });
    I.floor = eng.add(eng.createMesh(gf), { tex: tx.planks, cast: false, glossLum: 1 });
    I.corr = eng.add(eng.createMesh(gt), { tex: tx.terrazzo, cast: false, glossLum: 0.5 });
    I.ceil = eng.add(eng.createMesh(gc), { tex: tx.ceiling, cast: false });
    I.curtain = eng.add(eng.createMesh(gcu), { tex: tx.curtain, rim: 0.5 });
    I.emis = eng.add(eng.createMesh(ge), { unlit: 1, tint: [5.5, 5.6, 5.4, 1], cast: false });
    I.emis2 = eng.add(eng.createMesh(ge2), { unlit: 1, tint: [5.5, 5.6, 5.4, 1], cast: false });
    I.blob = eng.add(eng.createMesh(gd), { tex: tx.blob, blend: 1, tint: [1, 1, 1, 0.62], order: -10 });
    I.glass = eng.add(eng.createMesh(gg), { blend: 1, tint: [0.75, 0.9, 1.0, 0.07], order: 4 });
    I.glow = eng.add(eng.createMesh(ggl), { tex: tx.glow, blend: 2, unlit: 1, tint: [0.075, 0.08, 0.08, 1], order: 6 });

    /* ───── 글씨·그림이 있는 판들 ───── */
    function one(tex, build, opt) {
      var g = new Geo(); build(g);
      var o = opt || {}; o.tex = tex; if (o.cast === undefined) o.cast = false;
      return eng.add(eng.createMesh(g), o);
    }
    I.board = one(tx.board, function (g) { g.gloss = 0.34; vquad(g, 0, 1, 0, BZ, 2.21, 0.9, 2.1, 0xffffff); });
    I.flag = one(tx.flag, function (g) { vquad(g, 0, 1, 0, -RZ + 0.0135, 0.29, 2.355, 2.745, 0xffffff); });
    I.motto = one(tx.motto, function (g) { vquad(g, 0, 1, 1.2, -RZ + 0.0135, 0.35, 2.393, 2.707, 0xffffff); });
    /* 시계 문자판과 유리는 둥근 판(+z 를 향함) */
    function disc(g, z, rad) {
      var cen = g.vert(W.CLOCK[0], W.CLOCK[1], z, 0, 0, 1, [1, 1, 1], 1, 0.5, 0.5), first = g.count, n = 28, a;
      for (var q = 0; q <= n; q++) {
        a = q / n * Math.PI * 2;
        g.vert(W.CLOCK[0] + Math.cos(a) * rad, W.CLOCK[1] + Math.sin(a) * rad, z, 0, 0, 1, [1, 1, 1], 1, 0.5 + Math.cos(a) * 0.485, 0.5 - Math.sin(a) * 0.485);
      }
      for (q = 0; q < n; q++) g.tri(cen, first + q, first + q + 1);
    }
    I.clock = one(tx.clock, function (g) { disc(g, -RZ + 0.03, 0.184); });
    I.clockGlass = one(null, function (g) { g.gloss = 1; disc(g, -RZ + 0.045, 0.184); }, { blend: 1, tint: [0.9, 0.95, 1, 0.06], order: 5 });
    I.notice = one(tx.notice, function (g) {
      vquad(g, -1, 0, 3.775, 0, 2.0, 1.02, 1.871, 0xffffff);
    });
    I.noticeFrame = one(tx.wood, function (g) { g.box(3.79, 1.445, 0, 0.02, 0.93, 4.1, 0x8b6a45, { uv: 1 }); }, {});
    I.backBoard = one(tx.backBoard, function (g) { vquad(g, 0, -1, -0.9, RZ - 0.026, 2.1, 1.255, 2.305, 0xffffff); });
    I.stickers = one(tx.stickers, function (g) {
      for (var s2 = 0; s2 < 20; s2++) {
        var st = world.seats[s2], u = (s2 % 4) * 0.25, v2 = Math.floor(s2 / 4) * (204 / 1024);
        dquad(g, st.x + 0.125, st.x + 0.305, st.z - 0.2075, st.z - 0.1325, W.DESK_Y + 0.0012, 0xffffff, [u, v2, u + 0.25, v2 + 204 / 1024]);
      }
    });
    /* 벽의 허리 몰딩(x 4.0~4.01, 높이 1.0)을 덮고 걸리도록 몰딩보다 살짝 앞에 붙인다(뒤에 있으면 몰딩이 종이 아랫부분을 가로지른다) */
    I.chart = one(tx.chart, function (g) { vquad(g, 1, 0, 4.012, 1.8, 0.36, 0.96, 1.902, 0xffffff); });
    I.doorSign = one(tx.doorSign, function (g) { vquad(g, 1, 0, 3.951, 2.875, 0.215, 1.72, 2.024, 0xffffff); });
    I.signs = one(tx.signs, function (g) {
      var U = GX.SIGN_UV;
      vquad(g, 0, 1, 4.14, 3.2101, 0.14, 2.41, 2.59, 0xffffff, U.room3);
      vquad(g, 0, -1, 4.14, 3.1899, 0.14, 2.41, 2.59, 0xffffff, U.room3);
      vquad(g, 1, 0, 4.004, 0.2, 0.3, 1.45, 1.75, 0xffffff, U.quiet);
      vquad(g, 1, 0, 4.052, -8.125, 0.2, 1.75, 1.95, 0xffffff, U.room2);
      vquad(g, 1, 0, 4.052, 6.225, 0.2, 1.75, 1.95, 0xffffff, U.room4);
      vquad(g, 1, 0, 4.056, -1.4, 0.09, 0.56, 0.62, 0xffffff, U.extg);
      vquad(g, 0, 1, 3.45, -RZ + 0.004, 0.06, 1.24, 1.42, 0xffffff, U.switches);
      dquad(g, -3.28, -2.96, -3.99, -3.77, 0.873, 0xffffff, U.envQ);
    });
    I.exit = one(tx.signs, function (g) { vquad(g, 0, 1, 5.25, -W.CZ + 0.012, 0.3, 2.42, 2.72, 0xffffff, GX.SIGN_UV.exit); }, { unlit: 1, tint: [1.5, 1.5, 1.5, 1] });

    buildOutside(eng, tx, world);

    /* ───── 움직이는 것: 뒷문 · 시곗바늘 ───── */
    var gdoor = new Geo(); doorPanel(gdoor);
    world.door = { item: eng.add(eng.createMesh(gdoor), {}), open: 1, target: 1 };
    function hand(len, wd, tip, colr, back) {
      var g = new Geo();
      g.quad([-wd / 2, -back, 0], [wd / 2, -back, 0], [tip / 2, len, 0], [-tip / 2, len, 0], colr, null, [0, 0, 1]);
      return eng.add(eng.createMesh(g), { cast: false });
    }
    world.clock = { h: hand(0.095, 0.016, 0.009, 0x15171a, 0.022), m: hand(0.145, 0.011, 0.006, 0x15171a, 0.028), s: hand(0.152, 0.004, 0.002, 0xc0392b, 0.04) };
    var gcap = new Geo();
    gcap.push().translate(W.CLOCK[0], W.CLOCK[1], -RZ + 0.041).rotX(Math.PI / 2);
    gcap.cyl(0, 0, 0, 0.011, 0.011, 0.003, 10, 0x8a1f17);
    gcap.pop();
    I.clockCap = eng.add(eng.createMesh(gcap), { cast: false });
    world.clockTime = 8 * 3600 + 52 * 60;   /* 초 단위 */
    world.flick = { t: 18 + r() * 20, left: 0, k: 1, rnd: GX.rng(4411) };
    world.updateDoor(0);
    world.updateClock();

    /* ───── 충돌 상자 [x0,z0,x1,z1] ───── */
    var col2 = world.colliders;
    col2.push([-4.2, -5.2, 4.0, -4.8], [-4.2, 4.8, 4.0, 5.2], [-4.2, -5.2, -3.8, 5.2]);
    col2.push([3.8, -W.CZ - 0.2, 4.0, W.DOOR_Z0], [3.8, W.DOOR_Z1, 4.0, W.CZ + 0.2]);
    col2.push([6.5, -W.CZ - 0.2, 6.9, W.CZ + 0.2], [3.8, -W.CZ - 0.4, 6.9, -W.CZ], [3.8, W.CZ, 6.9, W.CZ + 0.4]);
    col2.push([6.1, -3.02, 6.5, 3.02], [0.6, -3.8, 1.3, -3.3], [-3.42, -4.2, -2.08, -3.5]);
    col2.push([-3.3, 4.36, 1.56, 4.8], [-3.8, 4.28, -3.28, 4.8], [1.72, 4.5, 3.76, 4.8]);
    world.doorCollider = [3.8, W.DOOR_Z0, 4.0, W.DOOR_Z1];
    return world;
  };

  /* 창밖: 하늘·산, 아파트, 운동장과 나무, 국기 게양대 / 복도 쪽은 맞은편 교사동. 전부 무광(빛을 미리 입힘) */
  function buildOutside(eng, tx, world) {
    var G = W.GROUND, I = world.items, i, from;
    var gx = new Geo(), ga = new Geo(), gsc = new Geo(), gsk = new Geo(), ggr = new Geo(), gfl = new Geo();
    var r = GX.rng(808);
    /* 먼 하늘(양쪽) */
    vquad(gsk, 1, 0, -430, 0, 780, -190, 330, 0xffffff);
    vquad(gsk, -1, 0, 430, 0, 780, -190, 330, 0xffffff, [1, 0, 0, 1]);
    /* 먼 땅 */
    gx.quad([-430, G - 0.2, -780], [-4.3, G - 0.2, -780], [-4.3, G - 0.2, 780], [-430, G - 0.2, 780], 0xb7bbac, null, [0, 1, 0]);
    gx.quad([6.8, G - 0.2, -780], [430, G - 0.2, -780], [430, G - 0.2, 780], [6.8, G - 0.2, 780], 0xb9b8ae, null, [0, 1, 0]);
    /* 운동장 */
    ggr.quad([-96, G, -66], [-9, G, -66], [-9, G, 66], [-96, G, 66], 0xffffff, [0, 0, 1, 1], [0, 1, 0]);
    gx.quad([-9, G, -80], [-4.3, G, -80], [-4.3, G, 80], [-9, G, 80], 0xa9aaa2, null, [0, 1, 0]);      /* 건물 앞 보도 */
    gx.quad([-116, G - 0.05, -200], [-100, G - 0.05, -200], [-100, G - 0.05, 200], [-116, G - 0.05, 200], 0x6f7378, null, [0, 1, 0]);   /* 도로 */
    from = gx.count;
    /* 축구 골대 · 국기 게양대 · 담장 */
    for (i = -1; i <= 1; i += 2) {
      gx.pipe([[-56, G, i * 47 - 3.6], [-56, G + 2.4, i * 47 - 3.6], [-56, G + 2.4, i * 47 + 3.6], [-56, G, i * 47 + 3.6]], 0.07, 6, 0xf4f4f0);
    }
    var FX = -34;                                              /* 국기 게양대(운동장 가장자리) */
    for (i = 0; i < 3; i++) {
      var pz = 9.4 + i * 1.8, ph = i === 1 ? 10.6 : 9.6;
      gx.tube([FX, G, pz], [FX, G + ph, pz], 0.07, 0.04, 6, 0xd9dcdf);
      gx.ellipsoid(FX, G + ph + 0.07, pz, 0.08, 0.08, 0.08, 0xd8b84a, { seg: 6, rings: 4 });
      if (i !== 1) gx.quad([FX, G + ph - 0.1, pz + 0.04], [FX, G + ph - 0.1, pz + 1.5], [FX, G + ph - 1.1, pz + 1.5], [FX, G + ph - 1.1, pz + 0.04],
        i ? 0x2f6f4e : 0x2b4a8b, null, [1, 0, 0]);
    }
    gx.box(-98, G + 0.6, 0, 0.3, 1.2, 150, 0xcfc8b8);
    gx.box(-12, G + 0.35, 0, 1.6, 0.7, 60, 0x8f8a7c);          /* 화단 턱 */
    /* 길 건너 낮은 건물들 */
    var lows = [0xd9d2c2, 0xc8ccd0, 0xdccfb8, 0xb9c0c4, 0xe1dbd0, 0xc9b9a6];
    for (i = 0; i < 16; i++) {
      var bz = -150 + i * 20 + (r() - 0.5) * 6, bh = 10 + r() * 14, bw = 12 + r() * 6;
      gx.box(-128 - r() * 14, G + bh / 2, bz, 14 + r() * 8, bh, bw, lows[i % lows.length]);
    }
    bakeSun(gx, from, 0.62, 0.5);
    /* 나무: 창 가까이 몇 그루 + 운동장 둘레(음영은 나무마다 따로 입힌다) */
    tree(gx, -12.5, -6.2, 9.6, 2.5, 11, 20); tree(gx, -13.4, 1.4, 8.9, 2.3, 12, 20); tree(gx, -12.2, 8.4, 9.9, 2.6, 13, 20);
    tree(gx, -13.8, -13.5, 8.6, 2.3, 14, 18); tree(gx, -13.0, 15.5, 9.2, 2.5, 15, 18);
    for (i = 0; i < 19; i++) tree(gx, -96 + (r() - 0.5) * 3, -81 + i * 9 + (r() - 0.5) * 3, 9 + r() * 4, 3 + r() * 1.4, 40 + i, 10);
    for (i = 0; i < 9; i++) { tree(gx, -90 + i * 10, -70 + (r() - 0.5) * 3, 8 + r() * 3, 2.8 + r(), 70 + i, 9); tree(gx, -90 + i * 10, 70 + (r() - 0.5) * 3, 8 + r() * 3, 2.8 + r(), 90 + i, 9); }
    /* 아파트 단지 */
    var apts = [[-190, -150, 62, 44], [-205, -92, 74, 40], [-182, -34, 58, 46], [-230, 22, 80, 42], [-196, 78, 66, 44], [-215, 138, 72, 40],
      [-270, -196, 84, 44], [-285, -64, 90, 44], [-300, 60, 86, 46], [-262, 190, 78, 42], [-340, -130, 92, 46], [-350, 130, 94, 46]];
    for (i = 0; i < apts.length; i++) {
      var A = apts[i], ax = A[0], az = A[1], ah = A[2], aw = A[3], dp = 13;
      var haze = Math.min(0.55, (-ax - 160) / 380), tint = GX.mixHex(0xdcd8cc, 0xb9cbdc, haze);
      vquad(ga, 1, 0, ax, az, aw / 2, G, G + ah, tint, [0, 0, aw / 9, ah / 2.9]);
      from = gx.count;
      gx.box(ax - dp / 2 - 0.01, G + ah / 2, az, dp, ah, aw, tint, { skip: '+x' });
      gx.box(ax - dp / 2, G + ah + 1.6, az + (r() - 0.5) * 10, 6, 3.2, 8, tint);
      gx.box(ax + 0.05, G + ah / 2, az - aw / 2 + 1.2, 0.12, ah, 2.4, GX.mixHex([0x8b5a4a, 0x4f6f8f, 0x6b7f5b, 0x8a6f4a][i % 4], 0xb9cbdc, haze));
      bakeSun(gx, from, 0.7, 0.45);
    }
    /* 복도 쪽: 맞은편 교사동과 안뜰 */
    vquad(gsc, -1, 0, 26, 0, 38, G, 5.4, 0xffffff, [0, 0, 76 / 2.4, (5.4 - G) / 3.4]);
    from = gx.count;
    gx.box(31, (G + 5.4) / 2, 0, 9.98, 5.4 - G, 76, 0xd8d2c4, { skip: '-x' });
    gx.box(31, 5.55, 0, 10.6, 0.3, 76.6, 0xbcb6a8);
    gx.quad([6.8, G, -50], [26, G, -50], [26, G, 50], [6.8, G, 50], 0xa7a79f, null, [0, 1, 0]);
    gx.box(16, G + 0.25, 0, 5, 0.5, 44, 0x7f8f6a);
    bakeSun(gx, from, 0.78, 0.3);
    for (i = 0; i < 6; i++) tree(gx, 16 + (r() - 0.5) * 2, -19 + i * 7.6, 6.2 + r() * 1.6, 1.9 + r() * 0.5, 120 + i, 12);
    /* 태극기(가운데 게양대) */
    gfl.quad([FX, G + 10.5, 11.24], [FX, G + 10.5, 12.86], [FX, G + 9.42, 12.86], [FX, G + 9.42, 11.24], 0xffffff, [0, 0, 1, 1], [1, 0, 0]);

    I.sky = eng.add(eng.createMesh(gsk), { tex: tx.sky, unlit: 1, tint: [1.4, 1.4, 1.4, 1], cast: false, receive: false });
    I.outer = eng.add(eng.createMesh(gx), { unlit: 1, tint: [1.2, 1.2, 1.2, 1], cast: false, receive: false });
    I.apts = eng.add(eng.createMesh(ga), { tex: tx.apt, unlit: 1, tint: [1.15, 1.17, 1.2, 1], cast: false, receive: false });
    I.school = eng.add(eng.createMesh(gsc), { tex: tx.school, unlit: 1, tint: [1.12, 1.12, 1.12, 1], cast: false, receive: false });
    I.ground = eng.add(eng.createMesh(ggr), { tex: tx.ground, unlit: 1, tint: [1.25, 1.25, 1.25, 1], cast: false, receive: false });
    I.outFlag = eng.add(eng.createMesh(gfl), { tex: tx.flag, unlit: 1, tint: [1.3, 1.3, 1.3, 1], cast: false, receive: false });
  }

  /* 다른 수험생 책상 위 소품: 신분증·수험표·펜(고정), 휴대폰·문제지(상황에 따라 보이기) */
  GX.buildDeskProps = function (eng, world, seats) {
    var tx = world.tx, U = GX.PAPER_UV, Y = W.DESK_Y;
    var gi = new Geo(), gpn = new Geo(), r = GX.rng(99);
    gpn.gloss = 0.4;
    seats.forEach(function (st) {
      var x = st.x, z = st.z;
      dquad(gi, x + 0.17, x + 0.256, z - 0.122, z - 0.067, Y + 0.0016, 0xffffff, U.card);
      dquad(gi, x + 0.19, x + 0.3, z - 0.052, z + 0.036, Y + 0.0014, 0xffffff, U.ticket);
      /* 여분 펜 · 수정테이프 */
      gpn.push().translate(x + 0.2, Y + 0.0065, z + 0.14).rotY(0.3 + r() * 0.8);
      gpn.tube([-0.065, 0, 0], [0.05, 0, 0], 0.0055, 0.0055, 6, 0x1b1b1e);
      gpn.tube([0.05, 0, 0], [0.076, 0, 0], 0.0062, 0.0062, 6, 0xf2f2ee);
      gpn.tube([-0.065, 0, 0], [-0.078, 0, 0], 0.004, 0.001, 6, 0x3a3a3e);
      gpn.pop();
      if (r() < 0.6) {
        gpn.push().translate(x + 0.27, Y + 0.009, z + 0.09).rotY(r() * 3);
        gpn.loft([{ p: [-0.03, 0, 0], rx: 0.014, rz: 0.009 }, { p: [-0.01, 0, 0], rx: 0.022, rz: 0.009 }, { p: [0.025, 0, 0], rx: 0.017, rz: 0.009 }, { p: [0.04, 0, 0], rx: 0.006, rz: 0.006 }],
          8, [0x4f9bd6, 0xe98a9b, 0x7dc38a, 0xe9c35a][Math.floor(r() * 4)], { side: [0, 0, 1], cap0: true, cap1: true });
        gpn.pop();
      }
      var gph = new Geo();
      gph.gloss = 0.7;
      gph.push().translate(x - 0.17, Y + 0.005, z - 0.07).rotY((r() - 0.5) * 0.5);
      gph.slab(0, 0, 0, 0.072, 0.009, 0.15, 0x16171a, { r: 0.012, seg: 3 });
      gph.box(0, 0.0048, 0, 0.066, 0.0006, 0.143, 0x0b0c0e);
      gph.pop();
      st.phone = eng.add(eng.createMesh(gph), { cast: false });
      var gc = new Geo();
      dquad(gc, x - 0.305, x - 0.055, z - 0.19, z + 0.164, Y + 0.002, 0xffffff, U.cover);
      dquad(gc, x - 0.03, x + 0.13, z - 0.1, z + 0.135, Y + 0.0018, 0xffffff, U.omr);
      st.cover = eng.add(eng.createMesh(gc), { tex: tx.papers, cast: false, visible: false });
      st.pages = [];
      for (var k = 0; k < 2; k++) {
        var go = new Geo();
        dquad(go, x - 0.305, x - 0.055, z - 0.19, z + 0.164, Y + 0.002, 0xffffff, k ? U.open2 : U.open);
        dquad(go, x - 0.03, x + 0.13, z - 0.1, z + 0.135, Y + 0.0018, 0xffffff, U.omr);
        st.pages.push(eng.createMesh(go));
      }
      st.open = eng.add(st.pages[0], { tex: tx.papers, cast: false, visible: false });
    });
    world.items.idcards = eng.add(eng.createMesh(gi), { tex: tx.papers, cast: false });
    world.items.pens = eng.add(eng.createMesh(gpn), { cast: false });
  };
  GX.disposeDeskProps = function (eng, world, seats) {
    function kill(it) { if (it) { eng.remove(it); eng.destroyMesh(it.mesh); } }
    seats.forEach(function (st) {
      kill(st.phone); kill(st.cover);
      if (st.open) eng.remove(st.open);
      if (st.pages) { eng.destroyMesh(st.pages[0]); eng.destroyMesh(st.pages[1]); }
      st.phone = st.cover = st.open = st.pages = null;
    });
    kill(world.items.idcards); kill(world.items.pens);
    world.items.idcards = world.items.pens = null;
  };

  function attachMethods(world) {
    /* 뒷문 미닫이(1 = 열림). 프레임마다 호출 */
    world.updateDoor = function (dt) {
      var d = world.door;
      d.open = GX.damp(d.open, d.target, 5, dt || 0);
      if (!dt) d.open = d.target;
      var z = GX.lerp(3.825, 2.875, d.open);
      M4.fromPose(d.item.model, 3.87, 0, z, 0, 0, 0);
    };
    world.updateClock = function () {
      var t = world.clockTime, c = world.clock;
      var cx = W.CLOCK[0], cy = W.CLOCK[1], cz = -W.RZ + 0.034;
      var hs = (t / 43200) * Math.PI * 2, ms = (t / 3600) * Math.PI * 2, ss = (Math.floor(t) / 60) * Math.PI * 2;
      M4.fromPose(c.h.model, cx, cy, cz, 0, 0, -hs);
      M4.fromPose(c.m.model, cx, cy, cz + 0.003, 0, 0, -ms);
      M4.fromPose(c.s.model, cx, cy, cz + 0.006, 0, 0, -ss);
    };
    world.doorBlocked = function () { return world.door.target < 0.5; };
    /* 형광등 한 대가 가끔 깜빡인다. 깜빡이기 시작한 프레임에 true 를 돌려준다 */
    world.updateLights = function (dt) {
      var f = world.flick, eng = world.eng, it = world.items.emis2, started = false, k = 1;
      if (!f || !it) return false;
      if (f.left > 0) {
        f.left -= dt;
        f.k -= dt;
        if (f.k <= 0) { f.on = !f.on; f.k = 0.03 + f.rnd() * 0.09; }
        k = f.on ? 1 : 0.3;
        if (f.left <= 0) k = 1;
      } else {
        f.t -= dt;
        if (f.t <= 0) { f.t = 26 + f.rnd() * 44; f.left = 0.35 + f.rnd() * 0.7; f.on = false; f.k = 0.04; started = true; }
      }
      if (k !== f.last) {
        f.last = k;
        it.tint[0] = 5.5 * k; it.tint[1] = 5.6 * k; it.tint[2] = 5.4 * k;
        var b = world.lampBase, z = eng.z.lampColor, m = 1 - (1 - k) * 0.06;
        z[0] = b[0] * m; z[1] = b[1] * m; z[2] = b[2] * m;
      }
      return started;
    };
  }
})(window.GX = window.GX || {});
