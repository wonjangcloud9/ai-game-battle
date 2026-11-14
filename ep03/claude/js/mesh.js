/* SUNDRIFT GP — procedural mesh builder. Every model in the game is generated here from primitives.
   Vertex layout (36 bytes): position f32x3 | normal f32x3 | colour u8x3 + material id u8 | uv f32x2 */
(function (root) {
  'use strict';
  var SD = root.SD, M = SD.M;

  /* Material ids travel in the colour alpha byte; the lit shader branches on them. */
  SD.MAT = {
    MATTE: 0, GLOSS: 1, EMISSIVE: 2, ROAD: 3, ATLAS: 4, GLASS: 5, RUBBER: 6, FOLIAGE: 7, METAL: 8,
    PAINT: 9, SAND: 10, PAD: 11, CHECKER: 12, CROWD: 13, FLAG: 14, LIGHT: 15, GRASS: 16, ROCK: 17, CLOUD: 18
  };
  SD.VERTEX_STRIDE = 36;

  function MeshBuilder(capacity) {
    this.cap = capacity || 8192;
    this.n = 0;
    this.pos = new Float32Array(this.cap * 3);
    this.nrm = new Float32Array(this.cap * 3);
    this.col = new Uint8Array(this.cap * 4);
    this.uv = new Float32Array(this.cap * 2);
    this.m = M.create();
    this.stack = [];
    this.cr = 255; this.cg = 255; this.cb = 255; this.cm = 0;
    this._nm = new Float32Array(9);
    this._flip = false;
    this._dirty = true;
    this.two = false;   // when true, flat triangles are emitted double-sided
    this.duv = [0, 0];  // uv written when a primitive supplies none (per-material parameters)
  }
  var P = MeshBuilder.prototype;

  P._grow = function () {
    var cap = this.cap * 2;
    var pos = new Float32Array(cap * 3); pos.set(this.pos); this.pos = pos;
    var nrm = new Float32Array(cap * 3); nrm.set(this.nrm); this.nrm = nrm;
    var col = new Uint8Array(cap * 4); col.set(this.col); this.col = col;
    var uv = new Float32Array(cap * 2); uv.set(this.uv); this.uv = uv;
    this.cap = cap;
  };

  // ------------------------------------------------------------ state
  /** Set the current colour ([r,g,b] floats or 0xRRGGBB) and, optionally, the material id. */
  P.color = function (c, mat) {
    if (typeof c === 'number') c = SD.hex(c);
    this.cr = Math.round(SD.clamp01(c[0]) * 255);
    this.cg = Math.round(SD.clamp01(c[1]) * 255);
    this.cb = Math.round(SD.clamp01(c[2]) * 255);
    if (mat !== undefined) this.cm = mat;
    return this;
  };
  P.mat = function (id) { this.cm = id; return this; };
  /** Default uv for primitives without their own (used as per-vertex shader parameters). */
  P.uvc = function (u, v) { this.duv = [u || 0, v || 0]; return this; };
  P.reset = function () { M.identity(this.m); this._dirty = true; return this; };
  P.push = function () { this.stack.push(new Float32Array(this.m)); return this; };
  P.pop = function () { this.m = this.stack.pop(); this._dirty = true; return this; };
  P.translate = function (x, y, z) { M.translate(this.m, this.m, x, y, z); this._dirty = true; return this; };
  P.rotX = function (r) { M.rotateX(this.m, this.m, r); this._dirty = true; return this; };
  P.rotY = function (r) { M.rotateY(this.m, this.m, r); this._dirty = true; return this; };
  P.rotZ = function (r) { M.rotateZ(this.m, this.m, r); this._dirty = true; return this; };
  P.scale = function (x, y, z) { M.scale(this.m, this.m, x, y === undefined ? x : y, z === undefined ? x : z); this._dirty = true; return this; };
  P.setMatrix = function (m) { this.m.set(m); this._dirty = true; return this; };
  /** Point the local +Y axis from a to b (used for struts, arms, pipes). Returns the distance. */
  P.alignY = function (ax, ay, az, bx, by, bz) {
    var dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz) || 1e-6;
    this.translate(ax, ay, az);
    var yaw = Math.atan2(dx, dz), pitch = Math.acos(SD.clamp(dy / len, -1, 1));
    this.rotY(yaw); this.rotX(pitch);
    return len;
  };

  P._update = function () {
    var m = this.m, n = this._nm;
    var a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    // cofactor matrix = det * inverse-transpose
    n[0] = e * i - f * h; n[1] = f * g - d * i; n[2] = d * h - e * g;
    n[3] = c * h - b * i; n[4] = a * i - c * g; n[5] = b * g - a * h;
    n[6] = b * f - c * e; n[7] = c * d - a * f; n[8] = a * e - b * d;
    var det = a * n[0] + b * n[1] + c * n[2];
    this._flip = det < 0;
    if (this._flip) for (var k = 0; k < 9; k++) n[k] = -n[k];
    this._dirty = false;
  };

  P._put = function (x, y, z, nx, ny, nz, u, v) {
    if (this.n >= this.cap) this._grow();
    var i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.nrm[i * 3] = nx; this.nrm[i * 3 + 1] = ny; this.nrm[i * 3 + 2] = nz;
    this.col[i * 4] = this.cr; this.col[i * 4 + 1] = this.cg; this.col[i * 4 + 2] = this.cb; this.col[i * 4 + 3] = this.cm;
    this.uv[i * 2] = u || 0; this.uv[i * 2 + 1] = v || 0;
  };

  var ta = [0, 0, 0], tb = [0, 0, 0], tc = [0, 0, 0], na = [0, 0, 0], nb = [0, 0, 0], nc = [0, 0, 0];
  function xf(m, p, o) {
    var x = p[0], y = p[1], z = p[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  function xn(n, p, o) {
    var x = p[0], y = p[1], z = p[2];
    var a = n[0] * x + n[3] * y + n[6] * z, b = n[1] * x + n[4] * y + n[7] * z, c = n[2] * x + n[5] * y + n[8] * z;
    var l = Math.hypot(a, b, c) || 1;
    o[0] = a / l; o[1] = b / l; o[2] = c / l;
  }
  var ZERO2 = [0, 0];

  /** Flat triangle; winding a->b->c counter-clockwise seen from outside. */
  P.tri = function (a, b, c, ua, ub, uc) {
    if (this._dirty) this._update();
    xf(this.m, a, ta); xf(this.m, b, tb); xf(this.m, c, tc);
    var B = tb, C = tc;
    ua = ua || this.duv; ub = ub || this.duv; uc = uc || this.duv;
    if (this._flip) { B = tc; C = tb; var t = ub; ub = uc; uc = t; }
    var ux = B[0] - ta[0], uy = B[1] - ta[1], uz = B[2] - ta[2], vx = C[0] - ta[0], vy = C[1] - ta[1], vz = C[2] - ta[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) return this;
    nx /= l; ny /= l; nz /= l;
    this._put(ta[0], ta[1], ta[2], nx, ny, nz, ua[0], ua[1]);
    this._put(B[0], B[1], B[2], nx, ny, nz, ub[0], ub[1]);
    this._put(C[0], C[1], C[2], nx, ny, nz, uc[0], uc[1]);
    if (this.two) {   // back face for thin geometry (leaves, flags, banners)
      this._put(ta[0], ta[1], ta[2], -nx, -ny, -nz, ua[0], ua[1]);
      this._put(C[0], C[1], C[2], -nx, -ny, -nz, uc[0], uc[1]);
      this._put(B[0], B[1], B[2], -nx, -ny, -nz, ub[0], ub[1]);
    }
    return this;
  };
  P.quad = function (a, b, c, d, ua, ub, uc, ud) {
    this.tri(a, b, c, ua, ub, uc);
    this.tri(a, c, d, ua, uc, ud);
    return this;
  };

  /** Triangle with explicit normals. Winding is corrected automatically to agree with the normals.
      flat = true replaces the supplied normals with the face normal (they then only orient the face). */
  P.triN = function (a, n1, b, n2, c, n3, ua, ub, uc, flat) {
    if (this._dirty) this._update();
    xf(this.m, a, ta); xf(this.m, b, tb); xf(this.m, c, tc);
    xn(this._nm, n1, na); xn(this._nm, n2, nb); xn(this._nm, n3, nc);
    ua = ua || this.duv; ub = ub || this.duv; uc = uc || this.duv;
    var ux = tb[0] - ta[0], uy = tb[1] - ta[1], uz = tb[2] - ta[2], vx = tc[0] - ta[0], vy = tc[1] - ta[1], vz = tc[2] - ta[2];
    var gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx, l = Math.hypot(gx, gy, gz);
    if (l < 1e-12) return this;
    gx /= l; gy /= l; gz /= l;
    var dot = gx * (na[0] + nb[0] + nc[0]) + gy * (na[1] + nb[1] + nc[1]) + gz * (na[2] + nb[2] + nc[2]);
    var swap = dot < 0;
    if (swap) { gx = -gx; gy = -gy; gz = -gz; }
    if (flat) { na[0] = nb[0] = nc[0] = gx; na[1] = nb[1] = nc[1] = gy; na[2] = nb[2] = nc[2] = gz; }
    this._put(ta[0], ta[1], ta[2], na[0], na[1], na[2], ua[0], ua[1]);
    if (swap) {
      this._put(tc[0], tc[1], tc[2], nc[0], nc[1], nc[2], uc[0], uc[1]);
      this._put(tb[0], tb[1], tb[2], nb[0], nb[1], nb[2], ub[0], ub[1]);
    } else {
      this._put(tb[0], tb[1], tb[2], nb[0], nb[1], nb[2], ub[0], ub[1]);
      this._put(tc[0], tc[1], tc[2], nc[0], nc[1], nc[2], uc[0], uc[1]);
    }
    return this;
  };
  P.quadN = function (a, n1, b, n2, c, n3, d, n4, ua, ub, uc, ud, flat) {
    this.triN(a, n1, b, n2, c, n3, ua, ub, uc, flat);
    this.triN(a, n1, c, n3, d, n4, ua, uc, ud, flat);
    return this;
  };

  // ------------------------------------------------------------ primitives
  /** Axis-aligned box centred on (cx,cy,cz). topX/topZ taper the top face (1 = straight sides). */
  P.box = function (cx, cy, cz, sx, sy, sz, topX, topZ) {
    var hx = sx / 2, hy = sy / 2, hz = sz / 2;
    var tx = hx * (topX === undefined ? 1 : topX), tz = hz * (topZ === undefined ? 1 : topZ);
    var y0 = cy - hy, y1 = cy + hy;
    var a = [cx - hx, y0, cz - hz], b = [cx + hx, y0, cz - hz], c = [cx + hx, y0, cz + hz], d = [cx - hx, y0, cz + hz];
    var e = [cx - tx, y1, cz - tz], f = [cx + tx, y1, cz - tz], g = [cx + tx, y1, cz + tz], h = [cx - tx, y1, cz + tz];
    this.quad(b, f, g, c);   // +X
    this.quad(a, d, h, e);   // -X
    this.quad(e, h, g, f);   // +Y
    this.quad(a, b, c, d);   // -Y
    this.quad(d, c, g, h);   // +Z
    this.quad(a, e, f, b);   // -Z
    return this;
  };

  /** Box with rounded edges and smooth normals (toy-like bodywork). r = edge radius, k = bevel subdivisions. */
  P.rbox = function (cx, cy, cz, sx, sy, sz, r, k) {
    var h = [sx / 2, sy / 2, sz / 2];
    r = Math.min(r, h[0], h[1], h[2]);
    k = k || 2;
    function coords(half) {
      var out = [], j;
      for (j = 0; j <= k; j++) out.push(-half + r * (1 - Math.cos((j / k) * Math.PI / 2)));
      for (j = k; j >= 0; j--) out.push(half - r * (1 - Math.cos((j / k) * Math.PI / 2)));
      if (half - r < 1e-6) out.splice(k, 1);
      return out;
    }
    var self = this, c0 = [cx, cy, cz];
    function vert(q) {
      var p = [0, 0, 0], n = [0, 0, 0], l = 0, i;
      for (i = 0; i < 3; i++) {
        var inner = SD.clamp(q[i], -(h[i] - r), h[i] - r);
        n[i] = q[i] - inner; l += n[i] * n[i]; p[i] = inner;
      }
      l = Math.sqrt(l) || 1;
      for (i = 0; i < 3; i++) { n[i] /= l; p[i] = c0[i] + p[i] + n[i] * r; }
      return [p, n];
    }
    for (var axis = 0; axis < 3; axis++) {
      var u = (axis + 1) % 3, v = (axis + 2) % 3, cu = coords(h[u]), cv = coords(h[v]);
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        for (var i = 0; i < cu.length - 1; i++) {
          for (var j = 0; j < cv.length - 1; j++) {
            var qs = [[cu[i], cv[j]], [cu[i + 1], cv[j]], [cu[i + 1], cv[j + 1]], [cu[i], cv[j + 1]]].map(function (uvp) {
              var q = [0, 0, 0];
              q[axis] = sgn * h[axis]; q[u] = uvp[0]; q[v] = uvp[1];
              return vert(q);
            });
            self.quadN(qs[0][0], qs[0][1], qs[1][0], qs[1][1], qs[2][0], qs[2][1], qs[3][0], qs[3][1]);
          }
        }
      }
    }
    return this;
  };

  /** Cylinder / cone / frustum along +Y, base at y = 0. opts: {flat, caps (default true), y0} */
  P.cyl = function (r0, r1, h, seg, opts) {
    opts = opts || {};
    var caps = opts.caps !== false, flat = !!opts.flat, y0 = opts.y0 || 0, i;
    for (i = 0; i < seg; i++) {
      var a0 = (i / seg) * SD.TAU, a1 = ((i + 1) / seg) * SD.TAU;
      var c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      var b0 = [r0 * c0, y0, r0 * s0], b1 = [r0 * c1, y0, r0 * s1], t0 = [r1 * c0, y0 + h, r1 * s0], t1 = [r1 * c1, y0 + h, r1 * s1];
      var n0 = [c0 * h, r0 - r1, s0 * h], n1 = [c1 * h, r0 - r1, s1 * h];
      if (r1 > 1e-6) this.quadN(b0, n0, b1, n1, t1, n1, t0, n0, null, null, null, null, flat);
      else this.triN(b0, n0, b1, n1, t0, [(c0 + c1) * h, 2 * (r0 - r1), (s0 + s1) * h], null, null, null, flat);
      if (caps && r1 > 1e-6) this.triN([0, y0 + h, 0], [0, 1, 0], t0, [0, 1, 0], t1, [0, 1, 0]);
      if (caps && r0 > 1e-6) this.triN([0, y0, 0], [0, -1, 0], b0, [0, -1, 0], b1, [0, -1, 0]);
    }
    return this;
  };

  /** Ellipsoid (or a patch of one). opts: {sx,sy,sz, flat, th0,th1 (polar, 0 = +Y), ph0,ph1} */
  P.sphere = function (r, seg, rings, opts) {
    opts = opts || {};
    var sx = opts.sx || 1, sy = opts.sy || 1, sz = opts.sz || 1, flat = !!opts.flat;
    var th0 = opts.th0 || 0, th1 = opts.th1 === undefined ? Math.PI : opts.th1;
    var ph0 = opts.ph0 || 0, ph1 = opts.ph1 === undefined ? SD.TAU : opts.ph1;
    function pt(i, j) {
      var th = th0 + (th1 - th0) * j / rings, ph = ph0 + (ph1 - ph0) * i / seg;
      var x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      return [[x * r * sx, y * r * sy, z * r * sz], [x / sx, y / sy, z / sz]];
    }
    for (var j = 0; j < rings; j++) {
      for (var i = 0; i < seg; i++) {
        var a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
        this.triN(a[0], a[1], b[0], b[1], c[0], c[1], null, null, null, flat);
        this.triN(a[0], a[1], c[0], c[1], d[0], d[1], null, null, null, flat);
      }
    }
    return this;
  };

  /** Surface of revolution around +Y. profile = [[radius, y], ...] listed so that the outside is on the
      right-hand side while walking the list (bottom -> top for a simple outward-facing shape). */
  P.lathe = function (profile, seg, opts) {
    opts = opts || {};
    var n = profile.length, k, i;
    var segN = [];
    for (k = 0; k < n - 1; k++) {
      var dr = profile[k + 1][0] - profile[k][0], dy = profile[k + 1][1] - profile[k][1], l = Math.hypot(dr, dy) || 1;
      segN.push([dy / l, -dr / l]);
    }
    // per-vertex normals for each segment end, creased when the profile bends sharply
    function vn(k2, side) {   // side 0: start of segment k2, 1: end of segment k2
      var other = side === 0 ? k2 - 1 : k2 + 1;
      if (other < 0 || other >= n - 1) return segN[k2];
      var a = segN[k2], b = segN[other];
      if (a[0] * b[0] + a[1] * b[1] < (opts.crease === undefined ? 0.75 : opts.crease)) return a;
      var x = a[0] + b[0], y = a[1] + b[1], l2 = Math.hypot(x, y) || 1;
      return [x / l2, y / l2];
    }
    for (k = 0; k < n - 1; k++) {
      var p0 = profile[k], p1 = profile[k + 1], m0 = vn(k, 0), m1 = vn(k, 1);
      for (i = 0; i < seg; i++) {
        if (opts.segColor) this.color(opts.segColor(i, k));
        var a0 = (i / seg) * SD.TAU, a1 = ((i + 1) / seg) * SD.TAU;
        var c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        var A = [p0[0] * c0, p0[1], p0[0] * s0], B = [p0[0] * c1, p0[1], p0[0] * s1];
        var C = [p1[0] * c1, p1[1], p1[0] * s1], D = [p1[0] * c0, p1[1], p1[0] * s0];
        var nA = [m0[0] * c0, m0[1], m0[0] * s0], nB = [m0[0] * c1, m0[1], m0[0] * s1];
        var nC = [m1[0] * c1, m1[1], m1[0] * s1], nD = [m1[0] * c0, m1[1], m1[0] * s0];
        if (p0[0] > 1e-6 && p1[0] > 1e-6) this.quadN(A, nA, B, nB, C, nC, D, nD, null, null, null, null, opts.flat);
        else if (p0[0] > 1e-6) this.triN(A, nA, B, nB, C, nC, null, null, null, opts.flat);
        else if (p1[0] > 1e-6) this.triN(A, nA, C, nC, D, nD, null, null, null, opts.flat);
      }
    }
    return this;
  };

  /** Torus around +Y (ring in the XZ plane). */
  P.torus = function (R, r, seg, tube) {
    var prof = [], k;
    for (k = 0; k <= tube; k++) {
      var a = -Math.PI + (k / tube) * SD.TAU;
      prof.push([R + Math.cos(a) * r, Math.sin(a) * r]);
    }
    return this.lathe(prof, seg, { crease: -2 });
  };

  var ICO_V = null, ICO_F = null;
  function icoData() {
    if (ICO_V) return;
    var t = (1 + Math.sqrt(5)) / 2;
    ICO_V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    ICO_V = ICO_V.map(function (v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
    ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  }
  /** Faceted blob (rocks, bushes, clouds, tree crowns). opts: {detail 0|1, jitter, rng, sx,sy,sz} */
  P.ico = function (r, opts) {
    icoData();
    opts = opts || {};
    var verts = ICO_V.map(function (v) { return v.slice(); }), faces = ICO_F, i;
    if (opts.detail) {
      var cache = {}, nf = [];
      var mid = function (a, b) {
        var key = a < b ? a + '_' + b : b + '_' + a;
        if (cache[key] !== undefined) return cache[key];
        var x = verts[a][0] + verts[b][0], y = verts[a][1] + verts[b][1], z = verts[a][2] + verts[b][2], l = Math.hypot(x, y, z);
        verts.push([x / l, y / l, z / l]);
        return (cache[key] = verts.length - 1);
      };
      for (i = 0; i < faces.length; i++) {
        var f = faces[i], ab = mid(f[0], f[1]), bc = mid(f[1], f[2]), ca = mid(f[2], f[0]);
        nf.push([f[0], ab, ca], [f[1], bc, ab], [f[2], ca, bc], [ab, bc, ca]);
      }
      faces = nf;
    }
    var sx = opts.sx || 1, sy = opts.sy || 1, sz = opts.sz || 1, jit = opts.jitter || 0, rng = opts.rng;
    var pts = verts.map(function (v) {
      var s = r * (1 + (jit && rng ? (rng.next() * 2 - 1) * jit : 0));
      return [v[0] * s * sx, v[1] * s * sy, v[2] * s * sz];
    });
    for (i = 0; i < faces.length; i++) {
      var F = faces[i];
      this.triN(pts[F[0]], verts[F[0]], pts[F[1]], verts[F[1]], pts[F[2]], verts[F[2]], null, null, null, !opts.smooth);
    }
    return this;
  };

  /** Extrude a convex polygon (points in the XY plane, counter-clockwise) from z0 to z1. */
  P.extrude = function (poly, z0, z1) {
    var n = poly.length, i;
    for (i = 1; i < n - 1; i++) {
      this.tri([poly[0][0], poly[0][1], z1], [poly[i][0], poly[i][1], z1], [poly[i + 1][0], poly[i + 1][1], z1]);
      this.tri([poly[0][0], poly[0][1], z0], [poly[i + 1][0], poly[i + 1][1], z0], [poly[i][0], poly[i][1], z0]);
    }
    for (i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n];
      this.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]);
    }
    return this;
  };

  /** Append another builder's triangles, transformed by the current matrix (colours are kept). */
  P.append = function (other) {
    if (this._dirty) this._update();
    var p = [0, 0, 0], q = [0, 0, 0];
    for (var i = 0; i < other.n; i++) {
      p[0] = other.pos[i * 3]; p[1] = other.pos[i * 3 + 1]; p[2] = other.pos[i * 3 + 2];
      xf(this.m, p, ta);
      q[0] = other.nrm[i * 3]; q[1] = other.nrm[i * 3 + 1]; q[2] = other.nrm[i * 3 + 2];
      xn(this._nm, q, na);
      if (this.n >= this.cap) this._grow();
      var k = this.n++;
      this.pos[k * 3] = ta[0]; this.pos[k * 3 + 1] = ta[1]; this.pos[k * 3 + 2] = ta[2];
      this.nrm[k * 3] = na[0]; this.nrm[k * 3 + 1] = na[1]; this.nrm[k * 3 + 2] = na[2];
      this.col[k * 4] = other.col[i * 4]; this.col[k * 4 + 1] = other.col[i * 4 + 1];
      this.col[k * 4 + 2] = other.col[i * 4 + 2]; this.col[k * 4 + 3] = other.col[i * 4 + 3];
      this.uv[k * 2] = other.uv[i * 2]; this.uv[k * 2 + 1] = other.uv[i * 2 + 1];
    }
    return this;
  };

  /** Interleave into one ArrayBuffer ready for a single vertex buffer. */
  P.build = function () {
    var n = this.n, buf = new ArrayBuffer(n * 36), f = new Float32Array(buf), u8 = new Uint8Array(buf);
    for (var i = 0; i < n; i++) {
      var o = i * 9, b = i * 36 + 24;
      f[o] = this.pos[i * 3]; f[o + 1] = this.pos[i * 3 + 1]; f[o + 2] = this.pos[i * 3 + 2];
      f[o + 3] = this.nrm[i * 3]; f[o + 4] = this.nrm[i * 3 + 1]; f[o + 5] = this.nrm[i * 3 + 2];
      u8[b] = this.col[i * 4]; u8[b + 1] = this.col[i * 4 + 1]; u8[b + 2] = this.col[i * 4 + 2]; u8[b + 3] = this.col[i * 4 + 3];
      f[o + 7] = this.uv[i * 2]; f[o + 8] = this.uv[i * 2 + 1];
    }
    return { buffer: buf, count: n };
  };

  SD.MeshBuilder = MeshBuilder;
})(typeof window !== 'undefined' ? window : globalThis);
