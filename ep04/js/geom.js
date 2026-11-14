/* 지오메트리 빌더 — 상자·원기둥·타원체·사각형·회전체·둥근 판·늘인 관을 한 버퍼에 이어 붙인다.
 * 정점 형식(12 float): 위치3, 법선3, 색3(선형) + 광택1, UV2
 */
(function (GX) {
  'use strict';
  var M4 = GX.M4;

  var hexCache = {};
  /* 0xRRGGBB(sRGB) → 선형 [r,g,b] */
  GX.hex = function (hex) {
    var c = hexCache[hex];
    if (!c) {
      c = hexCache[hex] = [
        Math.pow(((hex >> 16) & 255) / 255, 2.2),
        Math.pow(((hex >> 8) & 255) / 255, 2.2),
        Math.pow((hex & 255) / 255, 2.2)
      ];
    }
    return c;
  };
  function col(c) { return typeof c === 'number' ? GX.hex(c) : c; }
  /* 두 색(0xRRGGBB)을 선형 공간에서 섞는다 */
  GX.mixHex = function (a, b, t) {
    var x = GX.hex(a), y = GX.hex(b);
    return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  };

  function Geo() {
    this.data = [];
    this.idx = [];
    this.count = 0;
    this.m = null;
    this.stack = [];
    this.gloss = 0;
  }

  /* ── 변환 스택 ── */
  Geo.prototype.push = function () {
    this.stack.push(this.m ? new Float32Array(this.m) : null);
    return this;
  };
  Geo.prototype.pop = function () { this.m = this.stack.pop() || null; return this; };
  Geo.prototype._m = function () { if (!this.m) this.m = M4.create(); return this.m; };
  Geo.prototype.translate = function (x, y, z) { M4.translate(this._m(), this.m, x, y, z); return this; };
  Geo.prototype.rotX = function (r) { M4.rotateX(this._m(), this.m, r); return this; };
  Geo.prototype.rotY = function (r) { M4.rotateY(this._m(), this.m, r); return this; };
  Geo.prototype.rotZ = function (r) { M4.rotateZ(this._m(), this.m, r); return this; };
  Geo.prototype.scale = function (x, y, z) { M4.scale(this._m(), this.m, x, y, z); return this; };
  /* 광택(0..1)을 바꿔 가며 이어 붙일 때 */
  Geo.prototype.setGloss = function (g) { this.gloss = g; return this; };

  Geo.prototype.vert = function (x, y, z, nx, ny, nz, c, mul, u, v) {
    var m = this.m;
    if (m) {
      var tx = m[0] * x + m[4] * y + m[8] * z + m[12];
      var ty = m[1] * x + m[5] * y + m[9] * z + m[13];
      var tz = m[2] * x + m[6] * y + m[10] * z + m[14];
      var tnx = m[0] * nx + m[4] * ny + m[8] * nz;
      var tny = m[1] * nx + m[5] * ny + m[9] * nz;
      var tnz = m[2] * nx + m[6] * ny + m[10] * nz;
      var l = Math.sqrt(tnx * tnx + tny * tny + tnz * tnz) || 1;
      x = tx; y = ty; z = tz; nx = tnx / l; ny = tny / l; nz = tnz / l;
    }
    this.data.push(x, y, z, nx, ny, nz, c[0] * mul, c[1] * mul, c[2] * mul, this.gloss, u, v);
    return this.count++;
  };

  Geo.prototype.tri = function (a, b, c) { this.idx.push(a, b, c); };

  /* 네 꼭짓점(둘레 순서)으로 사각형. uv = [u0,v0,u1,v1] 이면 p0=(u0,v0) p1=(u1,v0) p2=(u1,v1) p3=(u0,v1) */
  Geo.prototype.quad = function (p0, p1, p2, p3, color, uv, normal) {
    var c = col(color);
    var n = normal;
    if (!n) {
      var ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
      var bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
      n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
      var l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
      n[0] /= l; n[1] /= l; n[2] /= l;
    }
    var u0 = 0, v0 = 0, u1 = 0, v1 = 0;
    if (uv) { u0 = uv[0]; v0 = uv[1]; u1 = uv[2]; v1 = uv[3]; }
    var a = this.vert(p0[0], p0[1], p0[2], n[0], n[1], n[2], c, 1, u0, v0);
    var b = this.vert(p1[0], p1[1], p1[2], n[0], n[1], n[2], c, 1, u1, v0);
    var d = this.vert(p2[0], p2[1], p2[2], n[0], n[1], n[2], c, 1, u1, v1);
    var e = this.vert(p3[0], p3[1], p3[2], n[0], n[1], n[2], c, 1, u0, v1);
    this.idx.push(a, b, d, a, d, e);
    return this;
  };

  /* 바닥에 눕힌 사각형(위를 향함). (x0,z0)-(x1,z1), 높이 y. uv 는 [u0,v0,u1,v1] */
  Geo.prototype.floorQuad = function (x0, z0, x1, z1, y, color, uv) {
    return this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], color, uv, [0, 1, 0]);
  };

  /* 축에 정렬된 상자. opts: { shade:[아래,위] 밝기 배수, uv:미터당 반복 수, uvOff:[u,v], skip:'+y-y..' } */
  var FACES = [
    /* 법선,            꼭짓점 4개(부호),                                   uv 축(0=x,1=y,2=z) */
    [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], 2, 1, '+x'],
    [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], 2, 1, '-x'],
    [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], 0, 2, '+y'],
    [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], 0, 2, '-y'],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], 0, 1, '+z'],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], 0, 1, '-z']
  ];
  Geo.prototype.box = function (cx, cy, cz, sx, sy, sz, color, opts) {
    var c = col(color);
    var hx = sx / 2, hy = sy / 2, hz = sz / 2;
    var shade = opts && opts.shade, uvs = opts && opts.uv, off = (opts && opts.uvOff) || [0, 0];
    var skip = (opts && opts.skip) || '';
    var h = [hx, hy, hz], ctr = [cx, cy, cz];
    for (var f = 0; f < 6; f++) {
      var F = FACES[f];
      if (skip && skip.indexOf(F[4]) >= 0) continue;
      var n = F[0], ids = [];
      for (var k = 0; k < 4; k++) {
        var s = F[1][k];
        var lx = s[0] * hx, ly = s[1] * hy, lz = s[2] * hz;
        var mul = 1;
        if (shade) mul = s[1] < 0 ? shade[0] : shade[1];
        var u = 0, v = 0;
        if (uvs) {
          u = (ctr[F[2]] + s[F[2]] * h[F[2]] + off[0]) * uvs;
          v = (ctr[F[3]] + s[F[3]] * h[F[3]] + off[1]) * uvs;
        }
        ids.push(this.vert(cx + lx, cy + ly, cz + lz, n[0], n[1], n[2], c, mul, u, v));
      }
      this.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    }
    return this;
  };

  /* 두 점을 잇는 원통(끝 반지름이 달라도 됨). 팔다리·다리 파이프·펜 등에 사용.
   * opts: { caps:false, uv:[u0,v0,u1,v1] (u 는 길이 방향, v 는 둘레 방향) } */
  Geo.prototype.tube = function (p0, p1, r0, r1, seg, color, opts) {
    var c = col(color);
    var ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    var len = Math.sqrt(ax * ax + ay * ay + az * az) || 1e-6;
    ax /= len; ay /= len; az /= len;
    /* 축에 수직인 기저 u, v */
    var ux, uy, uz;
    if (Math.abs(ay) < 0.9) { ux = az; uy = 0; uz = -ax; } else { ux = 0; uy = -az; uz = ay; }
    var ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    var vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;
    var slope = (r0 - r1) / len;
    var base = this.count, i, a, ca, sa, nx, ny, nz, nl;
    var tuv = opts && opts.uv, tu0 = 0, tu1 = 0, tv = 0;
    if (tuv) { tu0 = tuv[0]; tu1 = tuv[2]; }
    for (i = 0; i <= seg; i++) {
      a = (i / seg) * Math.PI * 2; ca = Math.cos(a); sa = Math.sin(a);
      var dx = ux * ca + vx * sa, dy = uy * ca + vy * sa, dz = uz * ca + vz * sa;
      nx = dx + ax * slope; ny = dy + ay * slope; nz = dz + az * slope;
      nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      if (tuv) tv = tuv[1] + (tuv[3] - tuv[1]) * (i / seg);
      this.vert(p0[0] + dx * r0, p0[1] + dy * r0, p0[2] + dz * r0, nx, ny, nz, c, 1, tu0, tv);
      this.vert(p1[0] + dx * r1, p1[1] + dy * r1, p1[2] + dz * r1, nx, ny, nz, c, 1, tu1, tv);
    }
    for (i = 0; i < seg; i++) {
      var b = base + i * 2;
      this.idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
    }
    if (!opts || opts.caps !== false) {
      var ends = [[p0, r0, -1], [p1, r1, 1]];
      for (var e = 0; e < 2; e++) {
        var P = ends[e][0], R = ends[e][1], sgn = ends[e][2];
        if (R <= 0) continue;
        var cen = this.vert(P[0], P[1], P[2], ax * sgn, ay * sgn, az * sgn, c, 1, 0, 0);
        var ring = this.count;
        for (i = 0; i <= seg; i++) {
          a = (i / seg) * Math.PI * 2; ca = Math.cos(a); sa = Math.sin(a);
          this.vert(P[0] + (ux * ca + vx * sa) * R, P[1] + (uy * ca + vy * sa) * R, P[2] + (uz * ca + vz * sa) * R,
            ax * sgn, ay * sgn, az * sgn, c, 1, 0, 0);
        }
        for (i = 0; i < seg; i++) this.idx.push(cen, ring + i, ring + i + 1);
      }
    }
    return this;
  };

  /* 세로 원기둥(바닥 중심 기준) */
  Geo.prototype.cyl = function (cx, y0, cz, r0, r1, h, seg, color, opts) {
    return this.tube([cx, y0, cz], [cx, y0 + h, cz], r0, r1, seg, color, opts);
  };

  /* 여러 점을 잇는 굽은 파이프(책상 다리처럼 꺾인 쇠 파이프). 마디마다 공으로 이음매를 메운다 */
  Geo.prototype.pipe = function (pts, r, seg, color) {
    for (var i = 0; i < pts.length - 1; i++) {
      this.tube(pts[i], pts[i + 1], r, r, seg, color, { caps: i === 0 || i === pts.length - 2 });
      if (i > 0) this.ellipsoid(pts[i][0], pts[i][1], pts[i][2], r, r, r, color, { seg: seg, rings: 4 });
    }
    return this;
  };

  /* 타원체. opts: { seg, rings, lat0, lat1 (위도 범위, 라디안), uv:[u0,v0,u1,v1] (u 는 경도, v 는 위에서 아래로) } */
  Geo.prototype.ellipsoid = function (cx, cy, cz, rx, ry, rz, color, opts) {
    var c = col(color);
    var seg = (opts && opts.seg) || 12, rings = (opts && opts.rings) || 8;
    var lat0 = opts && opts.lat0 !== undefined ? opts.lat0 : -Math.PI / 2;
    var lat1 = opts && opts.lat1 !== undefined ? opts.lat1 : Math.PI / 2;
    var base = this.count, i, j;
    var euv = opts && opts.uv, eu = 0, ev = 0;
    for (j = 0; j <= rings; j++) {
      var ph = lat0 + (lat1 - lat0) * (j / rings);
      var cp = Math.cos(ph), sp = Math.sin(ph);
      if (euv) ev = euv[3] + (euv[1] - euv[3]) * (j / rings);
      for (i = 0; i <= seg; i++) {
        var th = (i / seg) * Math.PI * 2;
        var ct = Math.cos(th), st = Math.sin(th);
        var nx = cp * ct / rx, ny = sp / ry, nz = cp * st / rz;
        var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        if (euv) eu = euv[0] + (euv[2] - euv[0]) * (i / seg);
        this.vert(cx + rx * cp * ct, cy + ry * sp, cz + rz * cp * st, nx / nl, ny / nl, nz / nl, c, 1, eu, ev);
      }
    }
    var row = seg + 1;
    for (j = 0; j < rings; j++) {
      for (i = 0; i < seg; i++) {
        var a = base + j * row + i, b = a + row;
        this.idx.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    return this;
  };

  /* 단면이 (초)타원인 관을 고리 여러 개로 이어 만든다 — 몸통·팔다리·손가락·커튼 주름 같은 부드러운 형태.
   * rings: [{ p:[x,y,z], rx, rz, c(색, 선택), sq(2=타원, 클수록 네모), tw(단면 비틀기, 라디안) }]
   *   고리 평면은 앞뒤 고리로 정한 진행 방향에 수직이고, rx 는 side 방향, rz 는 그와 수직인 방향의 반지름.
   * opts: { side:[x,y,z] (기본 [1,0,0]), cap0, cap1 (끝 막기), uv:[u0,v0,u1,v1] (u 는 둘레, v 는 길이), sq } */
  Geo.prototype.loft = function (rings, seg, color, opts) {
    opts = opts || {};
    var cdef = col(color), n = rings.length, base = this.count, i, j, k;
    var side = opts.side || [1, 0, 0], uv = opts.uv, sqAll = opts.sq || 2;
    var P = [], T = [], U = [], V = [], lens = [0], total = 0;
    for (i = 0; i < n; i++) {
      var a = rings[Math.max(0, i - 1)].p, b = rings[Math.min(n - 1, i + 1)].p;
      var tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2], tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      var d = side[0] * tx + side[1] * ty + side[2] * tz;
      var ux = side[0] - d * tx, uy = side[1] - d * ty, uz = side[2] - d * tz, ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
      if (ul < 1e-4) { ux = ty; uy = -tx; uz = 0; ul = Math.sqrt(ux * ux + uy * uy) || 1; }
      ux /= ul; uy /= ul; uz /= ul;
      var vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
      var tw = rings[i].tw || 0;
      if (tw) {
        var ct = Math.cos(tw), st = Math.sin(tw);
        var ax = ux * ct + vx * st, ay = uy * ct + vy * st, az = uz * ct + vz * st;
        vx = vx * ct - ux * st; vy = vy * ct - uy * st; vz = vz * ct - uz * st; ux = ax; uy = ay; uz = az;
      }
      T.push([tx, ty, tz]); U.push([ux, uy, uz]); V.push([vx, vy, vz]);
      if (i > 0) {
        var q = rings[i - 1].p, r = rings[i].p;
        total += Math.sqrt(Math.pow(r[0] - q[0], 2) + Math.pow(r[1] - q[1], 2) + Math.pow(r[2] - q[2], 2));
        lens.push(total);
      }
    }
    var row = seg + 1;
    for (i = 0; i < n; i++) {
      var R = rings[i], e = 2 / (R.sq || sqAll), line = [];
      for (j = 0; j <= seg; j++) {
        var th = (j / seg) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
        var ex = (cs < 0 ? -1 : 1) * Math.pow(Math.abs(cs), e) * R.rx, ez = (sn < 0 ? -1 : 1) * Math.pow(Math.abs(sn), e) * R.rz;
        line.push([R.p[0] + U[i][0] * ex + V[i][0] * ez, R.p[1] + U[i][1] * ex + V[i][1] * ez, R.p[2] + U[i][2] * ex + V[i][2] * ez]);
      }
      P.push(line);
    }
    /* 법선: 둘레 방향 × 길이 방향(이웃 점의 차이). 바깥을 향하도록 부호를 맞춘다 */
    for (i = 0; i < n; i++) {
      var cc = rings[i].c !== undefined ? col(rings[i].c) : cdef;
      var i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      for (j = 0; j <= seg; j++) {
        var jp = (j + 1) % seg, jm = (j + seg - 1) % seg, pt = P[i][j % seg === 0 ? 0 : j];
        var ax2 = P[i][jp][0] - P[i][jm][0], ay2 = P[i][jp][1] - P[i][jm][1], az2 = P[i][jp][2] - P[i][jm][2];
        var bx = P[i1][j][0] - P[i0][j][0], by = P[i1][j][1] - P[i0][j][1], bz = P[i1][j][2] - P[i0][j][2];
        var nx = ay2 * bz - az2 * by, ny = az2 * bx - ax2 * bz, nz = ax2 * by - ay2 * bx;
        var ox = pt[0] - rings[i].p[0], oy = pt[1] - rings[i].p[1], oz = pt[2] - rings[i].p[2];
        var nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nl < 1e-9) { nx = ox; ny = oy; nz = oz; nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; }
        if (nx * ox + ny * oy + nz * oz < 0) nl = -nl;
        var tu = 0, tv = 0;
        if (uv) { tu = uv[0] + (uv[2] - uv[0]) * (j / seg); tv = uv[1] + (uv[3] - uv[1]) * (total > 0 ? lens[i] / total : 0); }
        this.vert(pt[0], pt[1], pt[2], nx / nl, ny / nl, nz / nl, cc, 1, tu, tv);
      }
    }
    for (i = 0; i < n - 1; i++) {
      for (j = 0; j < seg; j++) {
        var p0 = base + i * row + j, p1 = p0 + row;
        this.idx.push(p0, p1, p1 + 1, p0, p1 + 1, p0 + 1);
      }
    }
    var ends = [[opts.cap0, 0, -1], [opts.cap1, n - 1, 1]];
    for (k = 0; k < 2; k++) {
      if (!ends[k][0]) continue;
      var ei = ends[k][1], sg = ends[k][2], ec = rings[ei].c !== undefined ? col(rings[ei].c) : cdef, ep = rings[ei].p;
      var cen = this.vert(ep[0], ep[1], ep[2], T[ei][0] * sg, T[ei][1] * sg, T[ei][2] * sg, ec, 1, 0, 0), ring0 = this.count;
      for (j = 0; j <= seg; j++) this.vert(P[ei][j][0], P[ei][j][1], P[ei][j][2], T[ei][0] * sg, T[ei][1] * sg, T[ei][2] * sg, ec, 1, 0, 0);
      for (j = 0; j < seg; j++) this.idx.push(cen, ring0 + j, ring0 + j + 1);
    }
    return this;
  };

  /* y 축 둘레로 돌린 회전체. prof: [[반지름, 높이], ...] (아래에서 위로). opts: { cap0, cap1, uv } */
  Geo.prototype.lathe = function (cx, cy, cz, prof, seg, color, opts) {
    var c = col(color), n = prof.length, base = this.count, i, j, row = seg + 1, uv = opts && opts.uv;
    for (i = 0; i < n; i++) {
      var a = prof[Math.max(0, i - 1)], b = prof[Math.min(n - 1, i + 1)];
      var dr = b[0] - a[0], dy = b[1] - a[1], dl = Math.sqrt(dr * dr + dy * dy) || 1;
      var nr = dy / dl, ny = -dr / dl;
      for (j = 0; j <= seg; j++) {
        var th = (j / seg) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
        this.vert(cx + prof[i][0] * cs, cy + prof[i][1], cz + prof[i][0] * sn, nr * cs, ny, nr * sn, c, 1,
          uv ? uv[0] + (uv[2] - uv[0]) * (j / seg) : 0, uv ? uv[3] + (uv[1] - uv[3]) * (i / (n - 1)) : 0);
      }
    }
    for (i = 0; i < n - 1; i++) {
      for (j = 0; j < seg; j++) {
        var p0 = base + i * row + j, p1 = p0 + row;
        this.idx.push(p0, p1, p1 + 1, p0, p1 + 1, p0 + 1);
      }
    }
    var ends = [[opts && opts.cap0, 0, -1], [opts && opts.cap1, n - 1, 1]];
    for (var k = 0; k < 2; k++) {
      if (!ends[k][0] || prof[ends[k][1]][0] <= 0) continue;
      var pr = prof[ends[k][1]], sg = ends[k][2];
      var cen = this.vert(cx, cy + pr[1], cz, 0, sg, 0, c, 1, 0, 0), r0 = this.count;
      for (j = 0; j <= seg; j++) {
        var t2 = (j / seg) * Math.PI * 2;
        this.vert(cx + pr[0] * Math.cos(t2), cy + pr[1], cz + pr[0] * Math.sin(t2), 0, sg, 0, c, 1, 0, 0);
      }
      for (j = 0; j < seg; j++) this.idx.push(cen, r0 + j, r0 + j + 1);
    }
    return this;
  };

  /* 모서리가 둥근 판(위에서 보면 둥근 사각형). 책상 상판·의자 좌판 등.
   * opts: { r 모서리 반지름, seg 모서리 분할, uv 미터당 반복 수, uvOff:[u,v], side 옆면 색, sideMul 옆면 밝기, bottom:false } */
  Geo.prototype.slab = function (cx, cy, cz, sx, sy, sz, color, opts) {
    opts = opts || {};
    var c = col(color), cs = opts.side !== undefined ? col(opts.side) : c, sm = opts.sideMul === undefined ? 1 : opts.sideMul;
    var r = Math.min(opts.r === undefined ? 0.02 : opts.r, sx / 2, sz / 2), seg = opts.seg || 4;
    var uvs = opts.uv || 0, off = opts.uvOff || [0, 0], hx = sx / 2, hz = sz / 2, hy = sy / 2, pts = [], i, k;
    var corners = [[hx - r, hz - r, 0], [-(hx - r), hz - r, 1], [-(hx - r), -(hz - r), 2], [hx - r, -(hz - r), 3]];
    for (k = 0; k < 4; k++) {
      for (i = 0; i <= seg; i++) {
        var a = (corners[k][2] + i / seg) * Math.PI / 2;
        pts.push([corners[k][0] + Math.cos(a) * r, corners[k][1] + Math.sin(a) * r, Math.cos(a), Math.sin(a)]);
      }
    }
    var n = pts.length, y;
    for (k = 0; k < 2; k++) {
      if (k === 1 && opts.bottom === false) break;
      y = cy + (k ? -hy : hy);
      var sgn = k ? -1 : 1;
      var cen = this.vert(cx, y, cz, 0, sgn, 0, c, 1, (cx + off[0]) * uvs, (cz + off[1]) * uvs), r0 = this.count;
      for (i = 0; i < n; i++) this.vert(cx + pts[i][0], y, cz + pts[i][1], 0, sgn, 0, c, 1, (cx + pts[i][0] + off[0]) * uvs, (cz + pts[i][1] + off[1]) * uvs);
      for (i = 0; i < n; i++) this.idx.push(cen, r0 + i, r0 + (i + 1) % n);
    }
    var s0 = this.count;
    for (i = 0; i <= n; i++) {
      var p = pts[i % n], u = (i / n) * (sx + sz) * 2 * uvs;
      this.vert(cx + p[0], cy + hy, cz + p[1], p[2], 0, p[3], cs, sm, u, (cy + hy) * uvs);
      this.vert(cx + p[0], cy - hy, cz + p[1], p[2], 0, p[3], cs, sm, u, (cy - hy) * uvs);
    }
    for (i = 0; i < n; i++) { var q = s0 + i * 2; this.idx.push(q, q + 1, q + 3, q, q + 3, q + 2); }
    return this;
  };

  Geo.prototype.build = function () {
    return {
      vertices: new Float32Array(this.data),
      indices: new Uint32Array(this.idx),
      vertexCount: this.count
    };
  };

  GX.Geo = Geo;
})(window.GX = window.GX || {});
