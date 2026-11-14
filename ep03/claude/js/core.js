/* SUNDRIFT GP — core: namespace, math helpers, RNG, noise, colours, mat4.
   Everything hangs off one global (SD) so the game runs from file:// with plain <script> tags. */
(function (root) {
  'use strict';
  var SD = root.SD = root.SD || {};

  var PI = Math.PI, TAU = PI * 2;
  SD.PI = PI;
  SD.TAU = TAU;

  SD.clamp = function (x, a, b) { return x < a ? a : (x > b ? b : x); };
  SD.clamp01 = function (x) { return x < 0 ? 0 : (x > 1 ? 1 : x); };
  SD.lerp = function (a, b, t) { return a + (b - a) * t; };
  SD.smoothstep = function (a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  };
  /** Frame-rate independent exponential approach of a towards b. */
  SD.damp = function (a, b, k, dt) { return b + (a - b) * Math.exp(-k * dt); };
  SD.wrapAngle = function (a) {
    a = (a + PI) % TAU;
    if (a < 0) a += TAU;
    return a - PI;
  };
  /** Shortest signed angle that takes `from` to `to`. */
  SD.angDiff = function (to, from) { return SD.wrapAngle(to - from); };
  SD.dampAngle = function (a, b, k, dt) { return a + SD.wrapAngle(b - a) * (1 - Math.exp(-k * dt)); };
  SD.approach = function (a, b, maxDelta) {
    if (a < b) return Math.min(a + maxDelta, b);
    return Math.max(a - maxDelta, b);
  };
  SD.sign = function (x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); };
  SD.mod = function (a, n) { return ((a % n) + n) % n; };

  // ---------------------------------------------------------------- RNG
  function RNG(seed) { this.s = (seed >>> 0) || 1; }
  RNG.prototype.next = function () {
    var t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.int = function (a, b) { return a + Math.floor(this.next() * (b - a + 1)); };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  SD.RNG = RNG;

  // ---------------------------------------------------------------- value noise
  function hash2(ix, iy, seed) {
    var h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  SD.hash2 = hash2;
  SD.noise2 = function (x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    var uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    var a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
    var c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  SD.fbm2 = function (x, y, octaves, seed) {
    var sum = 0, amp = 0.5, norm = 0;
    for (var i = 0; i < octaves; i++) {
      sum += amp * SD.noise2(x, y, seed + i * 17);
      norm += amp;
      x *= 2.03; y *= 2.03; amp *= 0.5;
    }
    return sum / norm;
  };

  // ---------------------------------------------------------------- colours ([r,g,b] 0..1, sRGB)
  SD.hex = function (h) { return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]; };
  SD.mixc = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  SD.shade = function (c, f) { return [SD.clamp01(c[0] * f), SD.clamp01(c[1] * f), SD.clamp01(c[2] * f)]; };
  SD.css = function (c, a) {
    var r = Math.round(SD.clamp01(c[0]) * 255), g = Math.round(SD.clamp01(c[1]) * 255), b = Math.round(SD.clamp01(c[2]) * 255);
    return a === undefined ? 'rgb(' + r + ',' + g + ',' + b + ')' : 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  };
  /** sRGB -> linear, for values handed straight to shaders as uniforms. */
  SD.lin = function (c) { return [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)]; };

  // ---------------------------------------------------------------- mat4 (column-major)
  var M = {};
  M.create = function () { var o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; };
  M.identity = function (o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; };
  M.copy = function (o, a) { o.set(a); return o; };
  M.mul = function (o, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (var i = 0; i < 4; i++) {
      var b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  };
  M.translate = function (o, a, x, y, z) {
    if (o !== a) o.set(a);
    o[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    o[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    o[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    o[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    return o;
  };
  M.scale = function (o, a, x, y, z) {
    for (var i = 0; i < 4; i++) { o[i] = a[i] * x; o[4 + i] = a[4 + i] * y; o[8 + i] = a[8 + i] * z; o[12 + i] = a[12 + i]; }
    return o;
  };
  M.rotateX = function (o, a, r) {
    var s = Math.sin(r), c = Math.cos(r);
    var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (o !== a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; }
    o[4] = a10 * c + a20 * s; o[5] = a11 * c + a21 * s; o[6] = a12 * c + a22 * s; o[7] = a13 * c + a23 * s;
    o[8] = a20 * c - a10 * s; o[9] = a21 * c - a11 * s; o[10] = a22 * c - a12 * s; o[11] = a23 * c - a13 * s;
    return o;
  };
  M.rotateY = function (o, a, r) {
    var s = Math.sin(r), c = Math.cos(r);
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (o !== a) { o[4] = a[4]; o[5] = a[5]; o[6] = a[6]; o[7] = a[7]; o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; }
    o[0] = a00 * c - a20 * s; o[1] = a01 * c - a21 * s; o[2] = a02 * c - a22 * s; o[3] = a03 * c - a23 * s;
    o[8] = a00 * s + a20 * c; o[9] = a01 * s + a21 * c; o[10] = a02 * s + a22 * c; o[11] = a03 * s + a23 * c;
    return o;
  };
  M.rotateZ = function (o, a, r) {
    var s = Math.sin(r), c = Math.cos(r);
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    if (o !== a) { o[8] = a[8]; o[9] = a[9]; o[10] = a[10]; o[11] = a[11]; o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; }
    o[0] = a00 * c + a10 * s; o[1] = a01 * c + a11 * s; o[2] = a02 * c + a12 * s; o[3] = a03 * c + a13 * s;
    o[4] = a10 * c - a00 * s; o[5] = a11 * c - a01 * s; o[6] = a12 * c - a02 * s; o[7] = a13 * c - a03 * s;
    return o;
  };
  M.perspective = function (o, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
    return o;
  };
  M.ortho = function (o, l, r, b, t, n, f) {
    var lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    o.fill(0);
    o[0] = -2 * lr; o[5] = -2 * bt; o[10] = 2 * nf;
    o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = (f + n) * nf; o[15] = 1;
    return o;
  };
  M.lookAt = function (o, ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    var z0 = ex - cx, z1 = ey - cy, z2 = ez - cz;
    var len = Math.hypot(z0, z1, z2) || 1;
    z0 /= len; z1 /= len; z2 /= len;
    var x0 = uy * z2 - uz * z1, x1 = uz * z0 - ux * z2, x2 = ux * z1 - uy * z0;
    len = Math.hypot(x0, x1, x2) || 1;
    x0 /= len; x1 /= len; x2 /= len;
    var y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
    o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
    o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
    o[12] = -(x0 * ex + x1 * ey + x2 * ez);
    o[13] = -(y0 * ex + y1 * ey + y2 * ez);
    o[14] = -(z0 * ex + z1 * ey + z2 * ez);
    o[15] = 1;
    return o;
  };
  M.invert = function (o, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    var b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    var b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    var b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  };
  /** Transform a point (w = 1); returns [x, y, z]. */
  M.point = function (m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  };
  /** Translation * yaw (Y) * pitch (X) * roll (Z), built in place. */
  M.fromPose = function (o, x, y, z, yaw, pitch, roll) {
    M.identity(o);
    o[12] = x; o[13] = y; o[14] = z;
    if (yaw) M.rotateY(o, o, yaw);
    if (pitch) M.rotateX(o, o, pitch);
    if (roll) M.rotateZ(o, o, roll);
    return o;
  };
  SD.M = M;

  // ---------------------------------------------------------------- tiny event bus
  function Emitter() { this.h = {}; }
  Emitter.prototype.on = function (name, fn) { (this.h[name] = this.h[name] || []).push(fn); };
  Emitter.prototype.emit = function (name, a, b, c) {
    var l = this.h[name];
    if (!l) return;
    for (var i = 0; i < l.length; i++) l[i](a, b, c);
  };
  SD.Emitter = Emitter;
  SD.events = new Emitter();

  SD.fmtTime = function (t) {
    if (!(t >= 0) || !isFinite(t)) return '--:--.--';
    var m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100);
    return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c;
  };
})(typeof window !== 'undefined' ? window : globalThis);
