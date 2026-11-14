/* 수학 도우미 — 4x4 행렬(열 우선, WebGL 규약)과 자잘한 보간 함수 */
(function (GX) {
  'use strict';

  var M4 = {};

  M4.create = function () {
    var m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  };

  M4.identity = function (o) {
    o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
    o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
    return o;
  };

  M4.copy = function (o, a) { o.set(a); return o; };

  /* o = a · b  (o 가 a 나 b 와 같아도 안전) */
  M4.multiply = function (o, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (var i = 0; i < 16; i += 4) {
      var b0 = b[i], b1 = b[i + 1], b2 = b[i + 2], b3 = b[i + 3];
      o[i] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  };

  M4.perspective = function (o, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
    return o;
  };

  M4.ortho = function (o, l, r, b, t, n, f) {
    o[0] = 2 / (r - l); o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 2 / (t - b); o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = -2 / (f - n); o[11] = 0;
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
    return o;
  };

  M4.lookAt = function (o, ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    var zx = ex - cx, zy = ey - cy, zz = ez - cz;
    var l = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
    zx /= l; zy /= l; zz /= l;
    var xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    l = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
    xx /= l; xy /= l; xz /= l;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * ex + xy * ey + xz * ez);
    o[13] = -(yx * ex + yy * ey + yz * ez);
    o[14] = -(zx * ex + zy * ey + zz * ez);
    o[15] = 1;
    return o;
  };

  var T = new Float32Array(16);

  /* o = a · T(x,y,z) */
  M4.translate = function (o, a, x, y, z) {
    M4.identity(T); T[12] = x; T[13] = y; T[14] = z;
    return M4.multiply(o, a, T);
  };
  M4.scale = function (o, a, x, y, z) {
    M4.identity(T); T[0] = x; T[5] = y; T[10] = z;
    return M4.multiply(o, a, T);
  };
  M4.rotateX = function (o, a, r) {
    var c = Math.cos(r), s = Math.sin(r);
    M4.identity(T); T[5] = c; T[6] = s; T[9] = -s; T[10] = c;
    return M4.multiply(o, a, T);
  };
  M4.rotateY = function (o, a, r) {
    var c = Math.cos(r), s = Math.sin(r);
    M4.identity(T); T[0] = c; T[2] = -s; T[8] = s; T[10] = c;
    return M4.multiply(o, a, T);
  };
  M4.rotateZ = function (o, a, r) {
    var c = Math.cos(r), s = Math.sin(r);
    M4.identity(T); T[0] = c; T[1] = s; T[4] = -s; T[5] = c;
    return M4.multiply(o, a, T);
  };

  /* 위치 + 요(Y)·피치(X)·롤(Z) 순 회전으로 모델 행렬 만들기 */
  M4.fromPose = function (o, x, y, z, yaw, pitch, roll) {
    M4.identity(o);
    o[12] = x; o[13] = y; o[14] = z;
    if (yaw) M4.rotateY(o, o, yaw);
    if (pitch) M4.rotateX(o, o, pitch);
    if (roll) M4.rotateZ(o, o, roll);
    return o;
  };

  /* 점 변환: out = m · (x,y,z,1) */
  M4.point = function (m, x, y, z, out) {
    out = out || [0, 0, 0];
    out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return out;
  };

  /* 동차 좌표 변환 후 w 로 나눈 값(화면 투영용). w<=0 이면 null */
  M4.project = function (m, x, y, z) {
    var w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 1e-5) return null;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
    ];
  };

  /* 원점이 (fx,fy,fz)에 오고 모델의 -Y 축이 (tx,ty,tz)를 향하는 행렬 — 팔뚝처럼 두 점 사이에 놓는 막대용.
   * 모델의 +Z 축은 (ux,uy,uz) 쪽으로 눕힌다. stretch 는 길이 방향 배율 */
  M4.aim = function (o, fx, fy, fz, tx, ty, tz, ux, uy, uz, stretch) {
    var yx = fx - tx, yy = fy - ty, yz = fz - tz, l = Math.sqrt(yx * yx + yy * yy + yz * yz) || 1;
    yx /= l; yy /= l; yz /= l;
    var d = ux * yx + uy * yy + uz * yz;
    var zx = ux - d * yx, zy = uy - d * yy, zz = uz - d * yz, zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
    if (zl < 1e-5) { zx = 1 - yx * yx; zy = -yx * yy; zz = -yx * yz; zl = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1; }
    zx /= zl; zy /= zl; zz /= zl;
    var xx = yy * zz - yz * zy, xy = yz * zx - yx * zz, xz = yx * zy - yy * zx;
    var s = stretch || 1;
    o[0] = xx; o[1] = xy; o[2] = xz; o[3] = 0;
    o[4] = yx * s; o[5] = yy * s; o[6] = yz * s; o[7] = 0;
    o[8] = zx; o[9] = zy; o[10] = zz; o[11] = 0;
    o[12] = fx; o[13] = fy; o[14] = fz; o[15] = 1;
    return o;
  };

  GX.M4 = M4;

  /* 두 마디 팔의 팔꿈치 위치. S 어깨, T 손목, l1·l2 마디 길이, pole 팔꿈치가 굽는 쪽. out 에 [x,y,z] */
  GX.elbow = function (S, T, l1, l2, pole, out) {
    var dx = T[0] - S[0], dy = T[1] - S[1], dz = T[2] - S[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    dx /= d; dy /= d; dz /= d;
    var dd = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
    var a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    var k = pole[0] * dx + pole[1] * dy + pole[2] * dz;
    var px = pole[0] - k * dx, py = pole[1] - k * dy, pz = pole[2] - k * dz, pl = Math.sqrt(px * px + py * py + pz * pz);
    if (pl < 1e-5) { px = 0; py = -1; pz = 0; pl = 1; }
    out[0] = S[0] + dx * a + px / pl * h;
    out[1] = S[1] + dy * a + py / pl * h;
    out[2] = S[2] + dz * a + pz / pl * h;
    return out;
  };

  GX.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  GX.lerp = function (a, b, t) { return a + (b - a) * t; };
  GX.smooth = function (t) { t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); };
  GX.smoothstep = function (a, b, v) { return GX.smooth((v - a) / (b - a)); };
  /* 프레임 속도와 무관한 지수 감쇠 보간 */
  GX.damp = function (cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); };
  GX.wrapAngle = function (a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  GX.dampAngle = function (cur, target, rate, dt) {
    return cur + GX.wrapAngle(target - cur) * (1 - Math.exp(-rate * dt));
  };

  /* 시드 고정 난수(mulberry32) — 교실 소품 배치처럼 매번 같아야 하는 곳에 사용 */
  GX.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
})(window.GX = window.GX || {});
