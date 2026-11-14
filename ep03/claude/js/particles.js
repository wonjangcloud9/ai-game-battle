/* SUNDRIFT GP — particles (CPU simulated, CPU billboarded) and tyre skid marks. */
(function (root) {
  'use strict';
  var SD = root.SD;

  /* kinds: 0 soft puff, 1 velocity-aligned streak, 2 confetti square, 3 glow blob */
  function Particles(max) {
    this.max = max;
    this.n = 0;
    this.px = new Float32Array(max); this.py = new Float32Array(max); this.pz = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.life = new Float32Array(max); this.span = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.r = new Float32Array(max); this.g = new Float32Array(max); this.b = new Float32Array(max); this.a = new Float32Array(max);
    this.kind = new Uint8Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.rot = new Float32Array(max); this.floor = new Float32Array(max);
  }
  var P = Particles.prototype;

  /** o: {x,y,z, vx,vy,vz, life, s0,s1 (size start/end), r,g,b,a, kind, drag, grav, floor} */
  P.spawn = function (x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, kind, drag, grav, floorY) {
    var i;
    if (this.n < this.max) i = this.n++;
    else i = (Math.random() * this.max) | 0;          // recycle a random particle when saturated
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.span[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.r[i] = r; this.g[i] = g; this.b[i] = b; this.a[i] = a;
    this.kind[i] = kind || 0;
    this.drag[i] = drag || 0; this.grav[i] = grav || 0;
    this.rot[i] = Math.random() * 6.283;
    this.floor[i] = floorY === undefined ? -1e9 : floorY;
  };

  P.update = function (dt) {
    var i = 0;
    while (i < this.n) {
      var l = this.life[i] - dt;
      if (l <= 0) {                                   // swap-remove
        var j = --this.n;
        if (i !== j) {
          this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
          this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
          this.life[i] = this.life[j]; this.span[i] = this.span[j];
          this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
          this.r[i] = this.r[j]; this.g[i] = this.g[j]; this.b[i] = this.b[j]; this.a[i] = this.a[j];
          this.kind[i] = this.kind[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
          this.rot[i] = this.rot[j]; this.floor[i] = this.floor[j];
        }
        continue;
      }
      this.life[i] = l;
      var dr = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dr; this.vz[i] *= dr;
      this.vy[i] = this.vy[i] * dr - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < this.floor[i]) { this.py[i] = this.floor[i]; this.vy[i] *= -0.35; this.vx[i] *= 0.6; this.vz[i] *= 0.6; }
      i++;
    }
  };

  /** Write camera-facing quads (6 verts x 10 floats each). Returns the number of vertices. */
  P.fill = function (out, maxVerts, right, up, eye) {
    var n = Math.min(this.n, Math.floor(maxVerts / 6)), o = 0;
    var rx = right[0], ry = right[1], rz = right[2], ux = up[0], uy = up[1], uz = up[2];
    for (var i = 0; i < n; i++) {
      var t = 1 - this.life[i] / this.span[i];
      var size = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      var kind = this.kind[i];
      var alpha = this.a[i];
      if (kind === 0) alpha *= (1 - t) * Math.min(1, t * 8);
      else if (kind === 2) alpha *= Math.min(1, (1 - t) * 4);
      else alpha *= 1 - t * t;
      var x = this.px[i], y = this.py[i], z = this.pz[i];
      var ax, ay, az, bx, by, bz;                  // half-extent vectors of the quad
      if (kind === 1) {
        // stretch along velocity, widen across the view
        var vx = this.vx[i], vy = this.vy[i], vz = this.vz[i], sp = Math.hypot(vx, vy, vz) || 1;
        var len = size * (1.5 + sp * 0.045);
        bx = vx / sp * len; by = vy / sp * len; bz = vz / sp * len;
        var ex = eye[0] - x, ey = eye[1] - y, ez = eye[2] - z;
        var cx = by * ez - bz * ey, cy = bz * ex - bx * ez, cz = bx * ey - by * ex, cl = Math.hypot(cx, cy, cz) || 1;
        var w = size * 0.5 / cl;
        ax = cx * w; ay = cy * w; az = cz * w;
      } else if (kind === 2) {
        var c = Math.cos(this.rot[i] + t * 9), s = Math.sin(this.rot[i] + t * 9), flip = Math.cos(this.rot[i] * 3 + t * 14);
        ax = (rx * c + ux * s) * size; ay = (ry * c + uy * s) * size; az = (rz * c + uz * s) * size;
        bx = (ux * c - rx * s) * size * flip; by = (uy * c - ry * s) * size * flip; bz = (uz * c - rz * s) * size * flip;
      } else {
        ax = rx * size; ay = ry * size; az = rz * size;
        bx = ux * size; by = uy * size; bz = uz * size;
      }
      var r = this.r[i], g = this.g[i], b = this.b[i];
      // corners: (-a-b) (+a-b) (+a+b) (-a+b)
      var x0 = x - ax - bx, y0 = y - ay - by, z0 = z - az - bz;
      var x1 = x + ax - bx, y1 = y + ay - by, z1 = z + az - bz;
      var x2 = x + ax + bx, y2 = y + ay + by, z2 = z + az + bz;
      var x3 = x - ax + bx, y3 = y - ay + by, z3 = z - az + bz;
      out[o++] = x0; out[o++] = y0; out[o++] = z0; out[o++] = -1; out[o++] = -1; out[o++] = r; out[o++] = g; out[o++] = b; out[o++] = alpha; out[o++] = kind;
      out[o++] = x1; out[o++] = y1; out[o++] = z1; out[o++] = 1; out[o++] = -1; out[o++] = r; out[o++] = g; out[o++] = b; out[o++] = alpha; out[o++] = kind;
      out[o++] = x2; out[o++] = y2; out[o++] = z2; out[o++] = 1; out[o++] = 1; out[o++] = r; out[o++] = g; out[o++] = b; out[o++] = alpha; out[o++] = kind;
      out[o++] = x0; out[o++] = y0; out[o++] = z0; out[o++] = -1; out[o++] = -1; out[o++] = r; out[o++] = g; out[o++] = b; out[o++] = alpha; out[o++] = kind;
      out[o++] = x2; out[o++] = y2; out[o++] = z2; out[o++] = 1; out[o++] = 1; out[o++] = r; out[o++] = g; out[o++] = b; out[o++] = alpha; out[o++] = kind;
      out[o++] = x3; out[o++] = y3; out[o++] = z3; out[o++] = -1; out[o++] = 1; out[o++] = r; out[o++] = g; out[o++] = b; out[o++] = alpha; out[o++] = kind;
    }
    return n * 6;
  };
  P.clear = function () { this.n = 0; };
  SD.Particles = Particles;

  // ---------------------------------------------------------------- skid marks (ring buffer of quads)
  function Skid(maxQuads) {
    this.max = maxQuads;
    this.data = new Float32Array(maxQuads * 6 * 4);
    this.head = 0;
    this.used = 0;
    this.count = 0;      // vertices to draw
  }
  /** Append a strip segment between the previous left/right edge points and the new ones. */
  Skid.prototype.add = function (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, alpha0, alpha1) {
    var o = this.head * 24, d = this.data;
    // a,b = previous edge (left,right); c,d = new edge (left,right)
    d[o] = ax; d[o + 1] = ay; d[o + 2] = az; d[o + 3] = alpha0;
    d[o + 4] = bx; d[o + 5] = by; d[o + 6] = bz; d[o + 7] = alpha0;
    d[o + 8] = dx; d[o + 9] = dy; d[o + 10] = dz; d[o + 11] = alpha1;
    d[o + 12] = ax; d[o + 13] = ay; d[o + 14] = az; d[o + 15] = alpha0;
    d[o + 16] = dx; d[o + 17] = dy; d[o + 18] = dz; d[o + 19] = alpha1;
    d[o + 20] = cx; d[o + 21] = cy; d[o + 22] = cz; d[o + 23] = alpha1;
    this.head = (this.head + 1) % this.max;
    if (this.used < this.max) this.used++;
    this.count = this.used * 6;
  };
  Skid.prototype.clear = function () { this.head = 0; this.used = 0; this.count = 0; };
  SD.Skid = Skid;
})(typeof window !== 'undefined' ? window : globalThis);
