/* SUNDRIFT GP — world: island terrain, road ribbons, barriers and all trackside scenery.
   Everything static is baked into one big mesh (one draw call); a few props animate separately. */
(function (root) {
  'use strict';
  var SD = root.SD, MAT = SD.MAT, hex = SD.hex, TAU = SD.TAU;

  var C = {
    grass: [hex(0x7fd154), hex(0x6ec649), hex(0x8ddb62), hex(0x62b945)],
    verge: hex(0x69c048), verge2: hex(0x5fb443),
    sand: hex(0xf4e2aa), sandB: hex(0xecd697), sandWet: hex(0xd9c48a), trap: hex(0xeed9a0),
    rock: hex(0xa39b93), rockB: hex(0x847c75), rockC: hex(0xb9b1a8),
    red: hex(0xe9453f), white: hex(0xf6f6f1), blue: hex(0x2f86e8), yellow: hex(0xffc928), dark: hex(0x2a2e37),
    concrete: hex(0xd5d7da), concreteB: hex(0xc3c6cb),
    trunk: hex(0x8b6239), palmTrunk: hex(0xa98456),
    leaf: [hex(0x3fae4b), hex(0x52c455), hex(0x33a046), hex(0x6ad05c)],
    palmLeaf: [hex(0x2fa85a), hex(0x44bb5f), hex(0x279a52)],
    pine: [hex(0x2e8f57), hex(0x257e4c)],
    crowd: [0xff5d5d, 0xffc93c, 0x4dd0ff, 0x7be07b, 0xff8fd0, 0xffffff, 0xff9a3c, 0x9b8cff, 0x40e0c0].map(hex)
  };

  /** Starting grid slot k (0 = pole). Two staggered columns; the last slot sits in the middle with a clear
      lane ahead, so a well-timed launch can thread through the pack. */
  SD.gridSlot = function (track, k) {
    if (k === 7) return { s: track.length - 7 - k * 5.2 - 1.2, d: 0 };
    return { s: track.length - 7 - k * 5.2, d: (k % 2 === 0 ? 1 : -1) * 2.8 };
  };

  function World(track) {
    this.track = track;
    this.rng = new SD.RNG(90210);
    var p = [0, 0, 0];
    track.pointAt(track.sOf('t5', 0.55), -(track.wallOffset + 30), p);
    this.lighthouse = { x: p[0], z: p[2] };
    this._field();
    var mb = new SD.MeshBuilder(1 << 19);
    this._terrain(mb);
    this._road(mb);
    this._props(mb);
    this.staticMesh = mb.build();
    this.seaMesh = this._sea();
    this.dynamic = [];
    this._dynamicProps();
  }
  var W = World.prototype;

  // ================================================================ height field
  W._field = function () {
    var t = this.track, CELL = 4, b = t.bounds, MARGIN = 152;
    var x0 = Math.floor((b.minx - MARGIN) / CELL) * CELL, z0 = Math.floor((b.minz - MARGIN) / CELL) * CELL;
    var nx = Math.ceil((b.maxx + MARGIN - x0) / CELL) + 1, nz = Math.ceil((b.maxz + MARGIN - z0) / CELL) + 1;
    this.cell = CELL; this.x0 = x0; this.z0 = z0; this.nx = nx; this.nz = nz;
    var H = this.H = new Float32Array(nx * nz), D = this.D = new Float32Array(nx * nz), E = this.E = new Float32Array(nx * nz);
    var px = t.px, pz = t.pz, py = t.py, N = t.N, WO = t.wallOffset, lh = this.lighthouse;
    for (var j = 0; j < nz; j++) {
      for (var i = 0; i < nx; i++) {
        var x = x0 + i * CELL, z = z0 + j * CELL;
        var sw = 0, sh = 0, d2min = 1e18, kmin = 0;
        for (var k = 0; k < N; k += 2) {
          var dx = x - px[k], dz = z - pz[k], d2 = dx * dx + dz * dz;
          if (d2 < d2min) { d2min = d2; kmin = k; }
          var w = 1 / (d2 * d2 + 16);
          sw += w; sh += w * py[k];
        }
        var d = Math.sqrt(d2min), idw = sh / sw, hproj = py[kmin];
        // coastline: land reaches a noisy distance out from the circuit
        var rl = 82 + (SD.fbm2(x / 120 + 3.1, z / 120 + 7.7, 3, 11) - 0.5) * 60;
        var dl = Math.hypot(x - lh.x, z - lh.z);
        rl += 26 * Math.exp(-(dl * dl) / (34 * 34));
        var e = rl - d;
        var hills = (SD.fbm2(x / 60 + 11.3, z / 60 + 5.9, 4, 23) - 0.36) * 17 * SD.smoothstep(15, 70, d);
        var land = idw + hills + 3.5 * Math.exp(-(dl * dl) / (16 * 16));
        var shore = e >= 0 ? 0.12 + e * 0.085 : Math.max(-14, e * 0.16);
        var h = e >= 0 ? SD.lerp(shore, land, SD.smoothstep(2, 50, e)) : shore;
        // corridor: follow the road exactly, sunk a little so the ribbons sit on top without z-fighting
        var nearT = 1 - SD.smoothstep(WO + 1, WO + 9, d);
        h = SD.lerp(h, hproj, nearT) - 0.6 * (1 - SD.smoothstep(WO + 0.5, WO + 5.5, d));
        var o = j * nx + i;
        H[o] = h; D[o] = d; E[o] = e;
      }
    }
  };

  W._cellOf = function (x, z, out) {
    var fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell;
    var i = Math.floor(fx), j = Math.floor(fz);
    i = SD.clamp(i, 0, this.nx - 2); j = SD.clamp(j, 0, this.nz - 2);
    out.i = i; out.j = j; out.fx = SD.clamp01(fx - i); out.fz = SD.clamp01(fz - j);
    return out;
  };
  var cellTmp = {};
  /** Terrain height, matching the rendered triangulation exactly. */
  W.heightAt = function (x, z) {
    var c = this._cellOf(x, z, cellTmp), nx = this.nx, H = this.H, o = c.j * nx + c.i;
    var a = H[o], d = H[o + 1], b = H[o + nx], cc = H[o + nx + 1];   // a(x0,z0) d(x1,z0) b(x0,z1) cc(x1,z1)
    if (c.fz >= c.fx) return a + (cc - b) * c.fx + (b - a) * c.fz;
    return a + (d - a) * c.fx + (cc - d) * c.fz;
  };
  W._bilerp = function (arr, x, z) {
    var c = this._cellOf(x, z, cellTmp), nx = this.nx, o = c.j * nx + c.i;
    var top = arr[o] + (arr[o + 1] - arr[o]) * c.fx, bot = arr[o + nx] + (arr[o + nx + 1] - arr[o + nx]) * c.fx;
    return top + (bot - top) * c.fz;
  };
  W.trackDist = function (x, z) { return this._bilerp(this.D, x, z); };
  W.shoreDist = function (x, z) { return this._bilerp(this.E, x, z); };

  // ================================================================ terrain mesh
  W._terrain = function (mb) {
    var nx = this.nx, nz = this.nz, H = this.H, CELL = this.cell, x0 = this.x0, z0 = this.z0, self = this;
    function shadeTri(pa, pb, pc) {
      var hc = (pa[1] + pb[1] + pc[1]) / 3, cx = (pa[0] + pb[0] + pc[0]) / 3, cz = (pa[2] + pb[2] + pc[2]) / 3;
      var ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2], vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
      var nxx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
      var ny = nyy / (Math.hypot(nxx, nyy, nzz) || 1);
      var n = SD.hash2(Math.round(cx * 3), Math.round(cz * 3), 5), big = SD.fbm2(cx / 26, cz / 26, 2, 41);
      var col;
      if (hc < 0.7) col = SD.mixc(C.sandWet, C.sand, SD.smoothstep(0.1, 0.7, hc));
      else if (hc < 2.3 + big * 1.6) col = SD.mixc(C.sand, C.sandB, n);
      else if (ny < 0.83) col = SD.mixc(n > 0.5 ? C.rock : C.rockB, C.rockC, big * 0.6);
      else {
        col = C.grass[Math.min(3, Math.floor(big * 4.6))];
        col = SD.shade(col, 0.94 + n * 0.12);
        if (self.trackDist(cx, cz) < self.track.wallOffset + 14) col = SD.mixc(col, C.verge, 0.5);
      }
      mb.color(col, MAT.MATTE);
    }
    for (var j = 0; j < nz - 1; j++) {
      for (var i = 0; i < nx - 1; i++) {
        var o = j * nx + i, ha = H[o], hd = H[o + 1], hb = H[o + nx], hc = H[o + nx + 1];
        if (ha < -0.5 && hb < -0.5 && hc < -0.5 && hd < -0.5) continue;
        var xa = x0 + i * CELL, za = z0 + j * CELL;
        var A = [xa, ha, za], B = [xa, hb, za + CELL], Cc = [xa + CELL, hc, za + CELL], Dd = [xa + CELL, hd, za];
        shadeTri(A, B, Cc); mb.tri(A, B, Cc);
        shadeTri(A, Cc, Dd); mb.tri(A, Cc, Dd);
      }
    }
  };

  // ================================================================ sea
  W._sea = function () {
    var mb = new SD.MeshBuilder(1 << 15), nx = this.nx, nz = this.nz, H = this.H, CELL = this.cell, x0 = this.x0, z0 = this.z0;
    var up = [0, 1, 0];
    mb.color(0xffffff, 0);
    for (var j = 0; j < nz - 1; j++) {
      for (var i = 0; i < nx - 1; i++) {
        var o = j * nx + i, ha = H[o], hd = H[o + 1], hb = H[o + nx], hc = H[o + nx + 1];
        if (Math.min(ha, hb, hc, hd) > 1.0) continue;
        var xa = x0 + i * CELL, za = z0 + j * CELL;
        mb.quadN([xa, 0, za], up, [xa, 0, za + CELL], up, [xa + CELL, 0, za + CELL], up, [xa + CELL, 0, za], up,
          [ha, 0], [hb, 0], [hc, 0], [hd, 0]);
      }
    }
    // open ocean out to the horizon
    var x1 = x0 + (nx - 1) * CELL, z1 = z0 + (nz - 1) * CELL, F = 6000, deep = [-14, 0];
    function q(ax, az, bx, bz) {
      mb.quadN([ax, 0, az], up, [ax, 0, bz], up, [bx, 0, bz], up, [bx, 0, az], up, deep, deep, deep, deep);
    }
    q(-F, -F, F, z0); q(-F, z1, F, F); q(-F, z0, x0, z1); q(x1, z0, F, z1);
    return mb.build();
  };

  // ================================================================ road, kerbs, barriers
  W._road = function (mb) {
    var t = this.track, N = t.N, ds = t.ds, HW = t.halfWidth, WO = t.wallOffset, i, side;
    var CW = 1.1, BH = 1.05, BT = 0.7;
    function P(k, o, dy) { return [t.px[k] + t.nx[k] * o, t.py[k] + dy, t.pz[k] + t.nz[k] * o]; }
    function Nn(k) { var s = t.slope[k], l = Math.hypot(s, 1); return [-t.tx[k] * s / l, 1 / l, -t.tz[k] * s / l]; }
    for (i = 0; i < N; i++) {
      var j = (i + 1) % N, s0 = i * ds, s1 = (i + 1) * ds, n0 = Nn(i), n1 = Nn(j);
      mb.color(0xffffff, MAT.ROAD);
      mb.quadN(P(i, -HW, 0), n0, P(i, HW, 0), n0, P(j, HW, 0), n1, P(j, -HW, 0), n1, [-HW, s0], [HW, s0], [HW, s1], [-HW, s1]);
      var k = t.kapS[i], corner = Math.abs(k) > 0.0075;
      var stripe = (Math.floor(i / 2) % 2) === 0, blk = (Math.floor(i / 4) % 2) === 0;
      for (side = -1; side <= 1; side += 2) {
        // kerb
        mb.color(corner ? (stripe ? C.red : C.white) : (stripe ? C.concreteB : C.concrete), MAT.PAINT);
        mb.quadN(P(i, side * HW, 0), n0, P(i, side * (HW + CW), 0.13), n0, P(j, side * (HW + CW), 0.13), n1, P(j, side * HW, 0), n1);
        // run-off: sand trap on the outside of corners, grass elsewhere
        var outside = corner && (k * side < 0);
        mb.color(outside ? C.trap : C.verge, outside ? MAT.SAND : MAT.GRASS);
        mb.quadN(P(i, side * (HW + CW), 0.13), n0, P(i, side * WO, 0.03), n0, P(j, side * WO, 0.03), n1, P(j, side * (HW + CW), 0.13), n1);
        // barrier blocks
        var main = corner ? C.red : C.blue, bc = blk ? main : C.white;
        var inN = [-side * t.nx[i], 0, -side * t.nz[i]], inN1 = [-side * t.nx[j], 0, -side * t.nz[j]];
        var outN = [side * t.nx[i], 0, side * t.nz[i]], outN1 = [side * t.nx[j], 0, side * t.nz[j]];
        mb.color(bc, MAT.PAINT);
        mb.quadN(P(i, side * WO, 0), inN, P(i, side * WO, BH), inN, P(j, side * WO, BH), inN1, P(j, side * WO, 0), inN1);
        mb.quadN(P(i, side * (WO + BT), BH), outN, P(i, side * (WO + BT), -1.8), outN, P(j, side * (WO + BT), -1.8), outN1, P(j, side * (WO + BT), BH), outN1);
        mb.color(SD.shade(bc, 0.86), MAT.PAINT);
        mb.quadN(P(i, side * WO, BH), n0, P(i, side * (WO + BT), BH), n0, P(j, side * (WO + BT), BH), n1, P(j, side * WO, BH), n1);
        // skirt hiding the seam between corridor and open terrain
        mb.color(C.verge2, MAT.GRASS);
        mb.quadN(P(i, side * (WO + BT), 0.05), n0, P(i, side * (WO + 7.5), -1.9), n0, P(j, side * (WO + 7.5), -1.9), n1, P(j, side * (WO + BT), 0.05), n1);
      }
    }

    // boost pads
    t.pads.forEach(function (pad) {
      var i0 = Math.round(pad.s / ds), n = Math.round(pad.len / ds);
      pad.s = i0 * ds; pad.len = n * ds;
      mb.color(0x39e6ff, MAT.PAD);
      for (var q = 0; q < n; q++) {
        var a = (i0 + q) % N, b = (i0 + q + 1) % N;
        mb.quadN(P(a, pad.d - pad.halfW, 0.045), Nn(a), P(a, pad.d + pad.halfW, 0.045), Nn(a), P(b, pad.d + pad.halfW, 0.045), Nn(b), P(b, pad.d - pad.halfW, 0.045), Nn(b),
          [-1, q], [1, q], [1, q + 1], [-1, q + 1]);
      }
    });

    // starting grid brackets
    var up = [0, 1, 0], pa = [0, 0, 0], pb = [0, 0, 0], pc = [0, 0, 0], pd = [0, 0, 0];
    function strip(sA, dA, sB, dB) {     // painted rectangle between two (s,d) corners
      t.pointAt(sA, dA, pa); t.pointAt(sA, dB, pb); t.pointAt(sB, dB, pc); t.pointAt(sB, dA, pd);
      pa[1] += 0.03; pb[1] += 0.03; pc[1] += 0.03; pd[1] += 0.03;
      mb.quadN(pa.slice(), up, pb.slice(), up, pc.slice(), up, pd.slice(), up);
    }
    mb.color(C.white, MAT.PAINT);
    for (var g = 0; g < 8; g++) {
      var slot = SD.gridSlot(t, g), f = slot.s + 1.75;
      strip(f, slot.d - 1.35, f + 0.22, slot.d + 1.35);
      strip(f - 2.2, slot.d - 1.35, f, slot.d - 1.13);
      strip(f - 2.2, slot.d + 1.13, f, slot.d + 1.35);
    }
  };

  // ================================================================ scenery
  W._props = function (mb) {
    var t = this.track, rng = this.rng, self = this, WO = t.wallOffset, HW = t.halfWidth, N = t.N;
    var tmp = [0, 0, 0], i, k;

    function frame(s, d, yaw) {
      t.pointAt(SD.mod(s, t.length), d, tmp);
      mb.push();
      mb.translate(tmp[0], tmp[1], tmp[2]);
      mb.rotY(t.headingAt(SD.mod(s, t.length)) + (yaw || 0));
    }
    /** Textured sign facing local -Z, centred on x, spanning y0..y1. flipU mirrors the art. */
    function sign(name, cx, y0, y1, halfW, z, flipU) {
      var uv = SD.atlasUV(name), uL = flipU ? uv[2] : uv[0], uR = flipU ? uv[0] : uv[2];
      mb.color(0xffffff, MAT.ATLAS);
      mb.quad([cx + halfW, y0, z], [cx - halfW, y0, z], [cx - halfW, y1, z], [cx + halfW, y1, z], [uL, uv[3]], [uR, uv[3]], [uR, uv[1]], [uL, uv[1]]);
    }
    function signBack(name, cx, y0, y1, halfW, z) {
      var uv = SD.atlasUV(name);
      mb.color(0xffffff, MAT.ATLAS);
      mb.quad([cx - halfW, y0, z], [cx + halfW, y0, z], [cx + halfW, y1, z], [cx - halfW, y1, z], [uv[0], uv[3]], [uv[2], uv[3]], [uv[2], uv[1]], [uv[0], uv[1]]);
    }

    // ---------- start gantry + lights
    frame(1.25, 0, 0);
    var gw = WO + 1.7;
    for (k = -1; k <= 1; k += 2) {
      mb.color(C.dark, MAT.MATTE); mb.box(k * gw, 4.3, 0, 1.0, 8.8, 1.0);
      mb.color(C.yellow, MAT.PAINT); mb.box(k * gw, 1.2, 0, 1.08, 0.5, 1.08); mb.box(k * gw, 2.4, 0, 1.08, 0.5, 1.08);
    }
    mb.color(C.dark, MAT.MATTE); mb.box(0, 8.7, 0, gw * 2 + 1.0, 2.0, 0.9);
    sign('banner', 0, 7.8, 9.6, gw - 0.1, -0.47);
    signBack('banner', 0, 7.8, 9.6, gw - 0.1, 0.47);
    for (k = 0; k < 3; k++) {
      var lx = 2.7 - k * 2.7;
      mb.color(0x15171c, MAT.MATTE); mb.box(lx, 6.9, -0.05, 1.7, 1.5, 0.7);
      mb.color(0x0, MAT.MATTE); mb.box(lx, 7.72, 0, 0.16, 0.4, 0.16);
      mb.push(); mb.translate(lx, 6.9, -0.42);
      mb.color(0xffffff, MAT.LIGHT); mb.uvc(k, 0);
      mb.sphere(0.5, 12, 8, { sz: 0.45 });
      mb.uvc(0, 0);
      mb.pop();
    }
    mb.pop();

    // ---------- grandstands along the main straight
    function grandstand(s, side, len, roofA, roofB) {
      frame(s, side * (WO + 3.2), side > 0 ? 0 : Math.PI);     // local +X now points away from the track
      var tiers = 5, zi;
      for (k = 0; k < tiers; k++) {
        var yk = 1.1 + k * 0.82, xk = k * 1.55;
        mb.color(k % 2 ? C.concrete : C.concreteB, MAT.MATTE);
        mb.box(xk + 0.775, (yk - 5) / 2, 0, 1.55, yk + 5, len);
        mb.mat(MAT.CROWD);
        for (zi = -len / 2 + 0.6; zi < len / 2 - 0.4; zi += 0.86) {
          if (rng.next() < 0.14) continue;
          var cc = rng.pick(C.crowd), ph = rng.next() * TAU, hh = rng.range(0.52, 0.68);
          mb.uvc(ph, 1);
          mb.color(cc); mb.box(xk + 0.85, yk + hh / 2, zi + rng.range(-0.08, 0.08), 0.46, hh, 0.5);
          mb.color(rng.pick([hex(0xf2c9a0), hex(0xe0ac7e), hex(0xc98d5e), hex(0xf7d9b8)]));
          mb.box(xk + 0.85, yk + hh + 0.17, zi, 0.3, 0.3, 0.3);
        }
        mb.uvc(0, 0);
      }
      var bx = tiers * 1.55;
      mb.color(C.concreteB, MAT.MATTE); mb.box(bx + 0.2, 2.2, 0, 0.4, 14, len);
      mb.color(C.dark, MAT.MATTE);
      for (zi = -len / 2 + 0.3; zi <= len / 2 - 0.2; zi += (len - 0.6) / 4) { mb.box(-0.2, 4.6, zi, 0.22, 9.2, 0.22); }
      var panels = Math.round(len / 5), pw = len / panels;
      for (k = 0; k < panels; k++) {
        mb.push(); mb.translate(bx / 2 - 0.3, 9.6, -len / 2 + pw * (k + 0.5)); mb.rotZ(0.13);
        mb.color(k % 2 ? roofA : roofB, MAT.PAINT); mb.box(0, 0, 0, bx + 2.2, 0.28, pw);
        mb.pop();
      }
      // flags along the back edge
      for (zi = -len / 2 + 2; zi <= len / 2 - 1; zi += 8) {
        mb.color(0xe9ebee, MAT.METAL); mb.push(); mb.translate(bx + 0.2, 9.2, zi); mb.cyl(0.07, 0.05, 4.6, 6); mb.pop();
        mb.color(rng.pick([C.red, C.yellow, C.blue, hex(0xff7ad1), hex(0x34d399)]), MAT.FLAG);
        mb.two = true;
        var fy = 12.3, ph2 = rng.next() * TAU, sg;
        for (sg = 0; sg < 4; sg++) {
          var u0 = sg / 4, u1 = (sg + 1) / 4;
          mb.quad([bx + 0.2, fy, zi + u0 * 2.4], [bx + 0.2, fy, zi + u1 * 2.4], [bx + 0.2, fy + 1.4, zi + u1 * 2.4], [bx + 0.2, fy + 1.4, zi + u0 * 2.4],
            [u0, ph2], [u1, ph2], [u1, ph2], [u0, ph2]);
        }
        mb.two = false;
      }
      mb.pop();
    }
    var mainLen = t.segLen.main;
    grandstand(t.sOf('main', 0.5) + 6, -1, 64, C.red, C.white);
    grandstand(t.sOf('main', 0.5) - 18, 1, 40, C.blue, C.white);
    grandstand(t.sOf('s5', 0.5), -1, 30, C.yellow, C.white);

    // ---------- bunting across the main straight
    function bunting(s) {
      frame(s, 0, 0);
      var bw = WO + 1.2, top = 7.4;
      mb.color(0xe9ebee, MAT.METAL);
      mb.push(); mb.translate(bw, -0.5, 0); mb.cyl(0.1, 0.07, top + 0.7, 6); mb.pop();
      mb.push(); mb.translate(-bw, -0.5, 0); mb.cyl(0.1, 0.07, top + 0.7, 6); mb.pop();
      var cnt = 26, ph = rng.next() * TAU;
      mb.two = true; mb.mat(MAT.FLAG);
      for (k = 0; k < cnt; k++) {
        var xa = -bw + (2 * bw) * k / cnt, xb = -bw + (2 * bw) * (k + 1) / cnt;
        var ya = top - 1.5 * (1 - Math.pow(2 * k / cnt - 1, 2)), yb = top - 1.5 * (1 - Math.pow(2 * (k + 1) / cnt - 1, 2));
        mb.color(C.crowd[k % 5]);
        mb.tri([xa, ya, 0], [xb, yb, 0], [(xa + xb) / 2, (ya + yb) / 2 - 0.75, 0], [0, ph + k], [0, ph + k], [0.5, ph + k]);
      }
      mb.two = false;
      mb.pop();
    }
    bunting(t.sOf('main', 0.5) - 44); bunting(t.sOf('main', 0.5) + 44); bunting(t.sOf('main', 0.5) + 74);

    // ---------- advertising boards
    function board(s, side, name) {
      frame(s, side * (WO + 4.6), side * 0.55);
      mb.color(C.dark, MAT.MATTE);
      mb.box(1.9, 1.4, 0.12, 0.26, 5.8, 0.26); mb.box(-1.9, 1.4, 0.12, 0.26, 5.8, 0.26);
      mb.box(0, 4.3, 0, 5.5, 2.5, 0.22);
      sign(name, 0, 3.2, 5.4, 2.62, -0.13);
      mb.pop();
    }
    board(t.sOf('main', 0.12), 1, 'ad0'); board(t.sOf('main', 0.92), 1, 'boost');
    board(t.sOf('s2', 0.3), -1, 'ad1'); board(t.sOf('s3', 0.1), 1, 'drift');
    board(t.sOf('s4a', 0.3), -1, 'ad2'); board(t.sOf('s4c', 0.2), 1, 'ad3');
    board(t.sOf('s5', 0.08), 1, 'boost'); board(t.sOf('s5', 0.85), 1, 'ad4');
    board(t.sOf('s6', 0.1), -1, 'ad5'); board(t.sOf('t1', 0.02), -1, 'drift');

    // ---------- corner chevrons on the outside of tight bends
    for (i = 0; i < N; i += 7) {
      var kc = t.kapS[i];
      if (Math.abs(kc) < 0.017) continue;
      var out = kc > 0 ? -1 : 1;
      frame(i * t.ds, out * (WO + 0.35), -out * 0.25);
      mb.color(C.dark, MAT.MATTE); mb.box(0, 1.2, 0.06, 0.16, 1.0, 0.16); mb.box(0, 2.15, 0.05, 2.9, 1.5, 0.1);
      sign('chevron', 0, 1.47, 2.83, 1.38, -0.01, kc > 0);
      mb.pop();
    }

    // ---------- vegetation helpers
    function palm(x, y, z, sc) {
      mb.push(); mb.translate(x, y - 0.3, z); mb.rotY(rng.next() * TAU); mb.scale(sc);
      var segs = 6, hgt = rng.range(6.2, 8.4), lean = rng.range(0.12, 0.5), cx = 0, cy = 0, ph = rng.next() * TAU;
      mb.uvc(0, 0);
      for (var q = 0; q < segs; q++) {
        var a1 = lean * ((q + 1) / segs), len = hgt / segs, nx2 = cx + Math.sin(a1) * len, ny2 = cy + Math.cos(a1) * len;
        mb.color(q % 2 ? C.palmTrunk : SD.shade(C.palmTrunk, 0.9), MAT.MATTE);
        mb.push(); var L = mb.alignY(cx, cy, 0, nx2, ny2, 0);
        mb.cyl(0.3 - q * 0.025, 0.27 - q * 0.025, L * 1.04, 6, { caps: false, flat: true }); mb.pop();
        cx = nx2; cy = ny2;
      }
      mb.translate(cx, cy, 0);
      mb.color(0x6b4a2a, MAT.MATTE);
      mb.push(); mb.translate(0.22, -0.2, 0.1); mb.ico(0.22); mb.pop();
      mb.push(); mb.translate(-0.18, -0.24, -0.12); mb.ico(0.2); mb.pop();
      var fr = 7, zs = [0, 0.9, 1.9, 2.9, 3.6], ys = [0, 0.42, 0.42, -0.12, -1.0], ws = [0.14, 0.5, 0.58, 0.42, 0.04];
      mb.two = true;
      for (var f = 0; f < fr; f++) {
        mb.push(); mb.rotY(f / fr * TAU + rng.range(-0.2, 0.2)); mb.rotX(rng.range(-0.25, 0.12));
        mb.color(C.palmLeaf[f % 3], MAT.FOLIAGE);
        for (var q2 = 0; q2 < 4; q2++) {
          var sw0 = 0.1 * q2, sw1 = 0.1 * (q2 + 1);
          var ridge0 = [0, ys[q2] + 0.14, zs[q2]], ridge1 = [0, ys[q2 + 1] + 0.14, zs[q2 + 1]];
          mb.quad([-ws[q2], ys[q2], zs[q2]], ridge0, ridge1, [-ws[q2 + 1], ys[q2 + 1], zs[q2 + 1]], [sw0, ph], [sw0, ph], [sw1, ph], [sw1, ph]);
          mb.quad(ridge0, [ws[q2], ys[q2], zs[q2]], [ws[q2 + 1], ys[q2 + 1], zs[q2 + 1]], ridge1, [sw0, ph], [sw0, ph], [sw1, ph], [sw1, ph]);
        }
        mb.pop();
      }
      mb.two = false; mb.uvc(0, 0);
      mb.pop();
    }
    function roundTree(x, y, z, sc) {
      mb.push(); mb.translate(x, y - 0.3, z); mb.rotY(rng.next() * TAU); mb.scale(sc);
      var th = rng.range(1.8, 2.8), ph = rng.next() * TAU;
      mb.uvc(0, 0); mb.color(C.trunk, MAT.MATTE); mb.cyl(0.32, 0.22, th + 0.6, 6, { caps: false, flat: true });
      var c0 = rng.pick(C.leaf);
      mb.uvc(0.07, ph);
      mb.color(c0, MAT.FOLIAGE); mb.push(); mb.translate(0, th + 1.5, 0); mb.ico(2.1, { detail: 1, jitter: 0.16, rng: rng, sy: 0.92 }); mb.pop();
      mb.color(SD.shade(c0, 0.9), MAT.FOLIAGE); mb.push(); mb.translate(1.25, th + 0.7, 0.35); mb.ico(1.25, { jitter: 0.14, rng: rng }); mb.pop();
      mb.color(SD.shade(c0, 1.07), MAT.FOLIAGE); mb.push(); mb.translate(-0.95, th + 1.0, -0.75); mb.ico(1.3, { jitter: 0.14, rng: rng }); mb.pop();
      mb.uvc(0, 0);
      mb.pop();
    }
    function pine(x, y, z, sc) {
      mb.push(); mb.translate(x, y - 0.3, z); mb.rotY(rng.next() * TAU); mb.scale(sc);
      var ph = rng.next() * TAU;
      mb.uvc(0, 0); mb.color(C.trunk, MAT.MATTE); mb.cyl(0.26, 0.2, 1.8, 6, { caps: false, flat: true });
      mb.uvc(0.05, ph);
      for (var q = 0; q < 3; q++) {
        mb.color(C.pine[q % 2], MAT.FOLIAGE);
        mb.push(); mb.translate(0, 1.3 + q * 1.5, 0); mb.cyl(1.9 - q * 0.45, 0, 2.6, 7, { flat: true }); mb.pop();
      }
      mb.uvc(0, 0);
      mb.pop();
    }
    function bush(x, y, z, sc) {
      mb.push(); mb.translate(x, y + 0.2 * sc, z); mb.rotY(rng.next() * TAU);
      mb.uvc(0.03, rng.next() * TAU);
      mb.color(rng.pick(C.leaf), MAT.FOLIAGE); mb.ico(0.9 * sc, { jitter: 0.2, rng: rng, sy: 0.72 });
      if (rng.next() < 0.35) {
        mb.color(rng.pick([hex(0xff6fae), hex(0xffe45e), hex(0xffffff), hex(0xff8a3d)]), MAT.MATTE);
        for (var q = 0; q < 4; q++) { mb.push(); mb.translate(rng.range(-0.6, 0.6) * sc, rng.range(0.25, 0.6) * sc, rng.range(-0.6, 0.6) * sc); mb.ico(0.14 * sc); mb.pop(); }
      }
      mb.uvc(0, 0);
      mb.pop();
    }
    function rock(x, y, z, sc, tall) {
      mb.push(); mb.translate(x, y, z); mb.rotY(rng.next() * TAU); mb.rotZ(rng.range(-0.2, 0.2));
      mb.color(rng.pick([C.rock, C.rockB, C.rockC]), MAT.ROCK);
      mb.ico(sc, { detail: sc > 2.2 ? 1 : 0, jitter: 0.24, rng: rng, sy: tall || rng.range(0.6, 0.95), sx: rng.range(0.8, 1.2) });
      mb.pop();
    }

    // ---------- scatter vegetation over the island
    var b = t.bounds, placed = [], tries = 0;
    function free(x, z, r) {
      for (var q = 0; q < placed.length; q++) { var p = placed[q]; if (Math.abs(p[0] - x) < p[2] + r && Math.abs(p[1] - z) < p[2] + r) return false; }
      return true;
    }
    // keep big structures clear of trees
    var keep = [];
    function reserve(s, d, r) { t.pointAt(SD.mod(s, t.length), d, tmp); keep.push([tmp[0], tmp[2], r]); }
    reserve(t.sOf('main', 0.5) + 6, -(WO + 8), 36); reserve(t.sOf('main', 0.5) - 18, WO + 8, 24); reserve(t.sOf('s5', 0.5), -(WO + 8), 20);
    keep.push([this.lighthouse.x, this.lighthouse.z, 9]);
    function clearOf(x, z) {
      for (var q = 0; q < keep.length; q++) if (Math.hypot(keep[q][0] - x, keep[q][1] - z) < keep[q][2]) return false;
      return true;
    }
    var counts = { palm: 0, tree: 0, pine: 0, bush: 0, rock: 0 };
    while (tries++ < 9000) {
      var x = rng.range(b.minx - 110, b.maxx + 110), z = rng.range(b.minz - 110, b.maxz + 110);
      var d = this.trackDist(x, z), e = this.shoreDist(x, z);
      if (e < 2.5 || d < WO + 2.2) continue;
      var y = this.heightAt(x, z);
      if (y < 0.7) continue;
      var slopeOk = Math.abs(this.heightAt(x + 2, z) - y) < 1.5 && Math.abs(this.heightAt(x, z + 2) - y) < 1.5;
      var r = rng.next();
      if (d < WO + 6) {                       // just behind the barrier: low bushes only
        if (r < 0.5 && counts.bush < 240 && clearOf(x, z)) { bush(x, y, z, rng.range(0.7, 1.3)); counts.bush++; }
        continue;
      }
      if (!clearOf(x, z)) continue;
      if (y < 3.4 && e < 30) {                // beach
        if (r < 0.55 && counts.palm < 120 && free(x, z, 2.6)) { palm(x, y, z, rng.range(0.85, 1.25)); placed.push([x, z, 2.6]); counts.palm++; }
        else if (r > 0.9 && counts.rock < 110) { rock(x, y, z, rng.range(0.5, 1.6)); counts.rock++; }
      } else if (!slopeOk) {
        if (r < 0.5 && counts.rock < 110) { rock(x, y - 0.2, z, rng.range(0.9, 2.8)); counts.rock++; }
      } else if (y > 11 && r < 0.42) {
        if (counts.pine < 110 && free(x, z, 2.2)) { pine(x, y, z, rng.range(0.9, 1.5)); placed.push([x, z, 2.2]); counts.pine++; }
      } else if (r < 0.5) {
        if (counts.tree < 230 && free(x, z, 3.2)) { roundTree(x, y, z, rng.range(0.8, 1.35)); placed.push([x, z, 3.2]); counts.tree++; }
      } else if (r < 0.62) {
        if (counts.palm < 120 && y < 9 && free(x, z, 2.6)) { palm(x, y, z, rng.range(0.9, 1.3)); placed.push([x, z, 2.6]); counts.palm++; }
      } else if (r < 0.8) {
        if (counts.bush < 240) { bush(x, y, z, rng.range(0.8, 1.6)); counts.bush++; }
      }
    }
    this.propCounts = counts;

    // palms lining the main straight, evenly spaced
    for (k = 0; k < 9; k++) {
      var sp = t.sOf('main', 0.03) + k * (mainLen * 0.94 / 9);
      for (var sd2 = -1; sd2 <= 1; sd2 += 2) {
        t.pointAt(SD.mod(sp, t.length), sd2 * (WO + 2.4), tmp);
        if (!clearOf(tmp[0], tmp[2])) continue;
        palm(tmp[0], this.heightAt(tmp[0], tmp[2]) + 0.3, tmp[2], 1.15);
      }
    }

    // ---------- sea stacks and distant islets
    var stacks = [[-270, 150, 9, 1.9], [-246, 168, 5, 1.5], [250, -150, 11, 2.1], [276, -128, 6, 1.4], [40, 205, 7, 1.7], [-60, -212, 8, 2.0], [300, 120, 6, 1.6]];
    for (i = 0; i < stacks.length; i++) {
      var st = stacks[i];
      if (this.shoreDist(st[0], st[1]) > -6) continue;
      rock(st[0], st[2] * 0.3, st[1], st[2], st[3]);
      rock(st[0] + st[2] * 0.9, 0.2, st[1] + st[2] * 0.4, st[2] * 0.45, 1.1);
    }
    var islets = [[-520, -330, 60], [560, 300, 75], [180, -560, 52], [-420, 470, 48]];
    for (i = 0; i < islets.length; i++) {
      var il = islets[i];
      mb.push(); mb.translate(il[0], -il[2] * 0.12, il[1]); mb.rotY(rng.next() * TAU);
      mb.color(C.grass[1], MAT.MATTE); mb.ico(il[2], { detail: 1, jitter: 0.2, rng: rng, sy: 0.5, sx: 1.5 });
      mb.color(C.rockB, MAT.ROCK); mb.push(); mb.translate(il[2] * 0.5, il[2] * 0.2, 0); mb.ico(il[2] * 0.5, { detail: 1, jitter: 0.25, rng: rng, sy: 1.3 }); mb.pop();
      mb.color(C.sand, MAT.MATTE); mb.push(); mb.translate(0, -il[2] * 0.33, 0); mb.cyl(il[2] * 1.75, il[2] * 1.3, il[2] * 0.5, 14, { flat: true }); mb.pop();
      mb.pop();
      for (k = 0; k < 6; k++) { var ang = rng.next() * TAU, rr = il[2] * rng.range(0.2, 0.9); palm(il[0] + Math.cos(ang) * rr, il[2] * 0.3, il[1] + Math.sin(ang) * rr * 0.7, 2.2); }
    }

    // ---------- lighthouse on the cape
    var lh = this.lighthouse, ly = this.heightAt(lh.x, lh.z);
    mb.push(); mb.translate(lh.x, ly - 0.6, lh.z);
    mb.color(C.rockC, MAT.ROCK); mb.cyl(4.6, 3.8, 1.8, 10, { flat: true });
    mb.translate(0, 1.7, 0);
    var bands = 5;
    for (k = 0; k < bands; k++) {
      mb.color(k % 2 ? C.red : C.white, MAT.PAINT);
      mb.push(); mb.translate(0, k * 3.0, 0); mb.cyl(2.5 - k * 0.24, 2.5 - (k + 1) * 0.24, 3.0, 14); mb.pop();
    }
    mb.translate(0, bands * 3.0, 0);
    mb.color(C.dark, MAT.MATTE); mb.cyl(2.2, 2.2, 0.35, 14);
    mb.color(0xfff3b0, MAT.EMISSIVE); mb.push(); mb.translate(0, 0.35, 0); mb.cyl(1.05, 1.05, 1.7, 10); mb.pop();
    mb.color(0xbfe9ff, MAT.GLASS); mb.push(); mb.translate(0, 0.35, 0); mb.cyl(1.3, 1.3, 1.7, 8, { caps: false, flat: true }); mb.pop();
    mb.color(C.red, MAT.PAINT); mb.push(); mb.translate(0, 2.05, 0); mb.cyl(1.75, 0, 1.6, 12); mb.pop();
    mb.pop();

    // ---------- rock arch over the track after the hairpin
    var as = t.sOf('s3', 0.72);
    frame(as, 0, 0);
    for (k = -1; k <= 1; k += 2) {
      mb.color(C.rock, MAT.ROCK); mb.push(); mb.translate(k * (WO + 4.4), 3.0, 0); mb.ico(5.2, { detail: 1, jitter: 0.2, rng: rng, sy: 1.6 }); mb.pop();
      mb.color(C.rockB, MAT.ROCK); mb.push(); mb.translate(k * (WO + 3.2), 8.6, 0.6); mb.ico(4.0, { detail: 1, jitter: 0.2, rng: rng, sy: 1.1 }); mb.pop();
      mb.color(C.rockC, MAT.ROCK); mb.push(); mb.translate(k * (WO - 2.0), 11.6, -0.3); mb.ico(4.3, { detail: 1, jitter: 0.2, rng: rng, sy: 0.72 }); mb.pop();
    }
    mb.color(C.rock, MAT.ROCK); mb.push(); mb.translate(0, 12.6, 0.2); mb.ico(5.4, { detail: 1, jitter: 0.18, rng: rng, sy: 0.55, sx: 1.5 }); mb.pop();
    mb.color(C.grass[0], MAT.MATTE); mb.push(); mb.translate(0.5, 14.6, 0); mb.ico(4.6, { detail: 1, jitter: 0.15, rng: rng, sy: 0.3, sx: 1.6 }); mb.pop();
    mb.pop();

    // ---------- beach parasols by the main straight
    var ps = t.sOf('main', 0.5);
    for (k = 0; k < 12; k++) {
      t.pointAt(SD.mod(ps + rng.range(-90, 90), t.length), -(WO + rng.range(24, 52)), tmp);
      var by = this.heightAt(tmp[0], tmp[2]);
      if (by < 0.6 || by > 3.6 || this.shoreDist(tmp[0], tmp[2]) < 3) continue;
      mb.push(); mb.translate(tmp[0], by, tmp[2]); mb.rotY(rng.next() * TAU);
      mb.color(0xf2f2f2, MAT.MATTE); mb.cyl(0.05, 0.05, 2.3, 5);
      var ca = rng.pick([C.red, C.blue, C.yellow, hex(0xff7ad1)]);
      mb.push(); mb.translate(0, 2.0, 0);
      mb.lathe([[1.7, 0], [0, 0.65]], 10, { flat: true, segColor: function (q) { return q % 2 ? ca : C.white; } });
      mb.pop();
      mb.color(rng.pick([hex(0x4dd0ff), hex(0xffa64d), hex(0xff6fae)]), MAT.MATTE); mb.box(1.2, 0.06, 0.2, 0.9, 0.06, 1.9);
      mb.pop();
    }

    // ---------- windmill tower (blades are animated separately)
    t.pointAt(t.sOf('c1', 0.2), WO + 19, tmp);
    var wy = this.heightAt(tmp[0], tmp[2]);
    this.windmill = { x: tmp[0], y: wy, z: tmp[2], yaw: t.headingAt(t.sOf('c1', 0.2)) - 1.9 };
    mb.push(); mb.translate(tmp[0], wy - 0.5, tmp[2]); mb.rotY(this.windmill.yaw);
    mb.color(0xf3efe6, MAT.MATTE); mb.cyl(2.5, 1.5, 11, 8, { flat: true });
    mb.color(C.red, MAT.PAINT); mb.push(); mb.translate(0, 11, 0); mb.cyl(2.0, 0, 2.6, 8, { flat: true }); mb.pop();
    mb.color(0x6b4a2a, MAT.MATTE); mb.box(0, 1.2, 2.3, 1.1, 2.2, 0.3);
    mb.color(0x8fd3ff, MAT.GLASS); mb.box(0, 6.5, 1.75, 0.8, 0.9, 0.3);
    mb.color(C.dark, MAT.MATTE); mb.push(); mb.translate(0, 10.2, 1.2); mb.rotX(Math.PI / 2); mb.cyl(0.22, 0.22, 1.4, 6); mb.pop();
    mb.pop();
  };

  // ================================================================ animated props
  W._dynamicProps = function () {
    var self = this, t = this.track, rng = this.rng, M = SD.M, k;

    // windmill sails
    var mb = new SD.MeshBuilder(2048);
    mb.color(0x8b6239, MAT.MATTE); mb.push(); mb.rotX(Math.PI / 2); mb.cyl(0.45, 0.45, 0.5, 8); mb.pop();
    for (k = 0; k < 4; k++) {
      mb.push(); mb.rotZ(k * Math.PI / 2);
      mb.color(0x8b6239, MAT.MATTE); mb.box(0, 3.9, 0.3, 0.2, 7.2, 0.14);
      mb.color(0xfaf6ea, MAT.MATTE); mb.two = true;
      mb.quad([0.1, 1.2, 0.34], [1.6, 1.4, 0.2], [1.5, 7.2, 0.2], [0.1, 7.4, 0.34]);
      mb.two = false;
      mb.pop();
    }
    var wm = this.windmill;
    this.dynamic.push({
      built: mb.build(),
      update: function (m, time) {
        M.fromPose(m, wm.x, wm.y + 9.7, wm.z, wm.yaw, 0, 0);
        M.translate(m, m, 0, 0, 2.6);
        M.rotateZ(m, m, time * 0.55);
      }
    });

    // hot-air balloons
    var schemes = [[0xff5d5d, 0xffe066], [0x4dabf7, 0xffffff], [0x9b5de5, 0xfee440], [0x34d399, 0xfef3c7]];
    var spots = [[-130, 52, -210], [150, 70, 40], [30, 86, -40], [-250, 60, 120]];
    spots.forEach(function (sp, idx) {
      var b = new SD.MeshBuilder(2048), sc = schemes[idx % schemes.length], ca = SD.hex(sc[0]), cb = SD.hex(sc[1]);
      b.mat(MAT.GLOSS);
      b.lathe([[0.9, 0], [1.9, 1.7], [3.3, 3.9], [4.2, 6.1], [4.4, 7.9], [3.9, 9.7], [2.6, 11.1], [0, 11.9]], 12,
        { segColor: function (i) { return i % 2 ? ca : cb; }, crease: -2 });
      b.color(0x7a5230, MAT.MATTE); b.box(0, -1.7, 0, 1.4, 1.1, 1.4);
      b.color(0x3a2a1a, MAT.MATTE);
      [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]].forEach(function (c) {
        b.push(); b.alignY(c[0], -1.2, c[1], c[0] * 1.3, 0.1, c[1] * 1.3); b.cyl(0.03, 0.03, 1.5, 4); b.pop();
      });
      b.color(0xffb347, MAT.EMISSIVE); b.push(); b.translate(0, -0.55, 0); b.ico(0.28); b.pop();
      var ph = rng.next() * TAU, scale = 1.5 + idx * 0.2;
      self.dynamic.push({
        noShadow: true,          // a balloon shadow sweeping the road reads as a glitch
        built: b.build(),
        update: function (m, time) {
          M.fromPose(m, sp[0] + Math.sin(time * 0.07 + ph) * 14, sp[1] + Math.sin(time * 0.33 + ph) * 2.4, sp[2] + Math.cos(time * 0.05 + ph) * 14, time * 0.05 + ph, 0, 0);
          M.scale(m, m, scale, scale, scale);
        }
      });
    });

    // sailing boats
    var boats = [[-40, 196, 0.4, 0xff5d5d], [228, 96, 2.2, 0xffe066], [-236, -128, 4.0, 0x4dabf7], [120, -182, 5.1, 0xffffff], [-150, 178, 1.2, 0xff8fd0]];
    boats.forEach(function (bt) {
      if (self.shoreDist(bt[0], bt[1]) > -10) return;
      var b = new SD.MeshBuilder(512);
      b.color(0xf7f3ea, MAT.GLOSS); b.box(0, 0.25, 0, 1.2, 1.0, 4.4, 1.9, 1.25);
      b.color(0x8b6239, MAT.MATTE); b.box(0, 0.78, 0, 2.0, 0.08, 4.9);
      b.color(0xdfe3e8, MAT.METAL); b.push(); b.translate(0, 0.7, 0.3); b.cyl(0.07, 0.05, 6.4, 5); b.pop();
      b.two = true;
      b.color(bt[3], MAT.MATTE); b.tri([0, 1.5, 0.2], [0, 6.9, 0.3], [0, 1.5, -2.5]);
      b.color(0xffffff, MAT.MATTE); b.tri([0, 1.4, 0.5], [0, 5.6, 0.4], [0, 1.4, 2.5]);
      b.two = false;
      var ph = rng.next() * TAU;
      self.dynamic.push({
        built: b.build(),
        update: function (m, time) {
          var a = bt[2] + time * 0.012;
          M.fromPose(m, bt[0] + Math.sin(a) * 26, Math.sin(time * 1.1 + ph) * 0.18 - 0.1, bt[1] + Math.cos(a) * 26, a + Math.PI / 2, Math.sin(time * 0.9 + ph) * 0.05, Math.sin(time * 0.7 + ph) * 0.07);
          M.scale(m, m, 1.6, 1.6, 1.6);
        }
      });
    });
  };

  SD.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
