/* 입력(키보드·마우스)과 1인칭 카메라(걷기 / 앉아서 고개 돌리기 / 장면 전환) */
(function (GX) {
  'use strict';
  var M4 = GX.M4, W = GX.W;

  /* ───────── 입력 ───────── */
  var Input = {
    keys: {}, pressed: {}, mx: 0, my: 0, wheel: 0, clicked: false, rdown: false, rhit: false,
    locked: false, mode: 'lock', sens: 1, active: false, onLock: null, onFallback: null, onRetry: null,
    everLocked: false, clickX: 0, clickY: 0,
    _drag: false, _moved: 0, _lx: 0, _ly: 0, canvas: null
  };
  var GAME_KEYS = { Space: 1, Tab: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, KeyF: 1, KeyE: 1 };

  Input.init = function (canvas) {
    Input.canvas = canvas;
    if (typeof canvas.requestPointerLock !== 'function') Input.mode = 'drag';
    window.addEventListener('keydown', function (e) {
      if (Input.active && GAME_KEYS[e.code]) e.preventDefault();
      if (!e.repeat) Input.pressed[e.code] = true;
      Input.keys[e.code] = true;
    });
    window.addEventListener('keyup', function (e) { Input.keys[e.code] = false; });
    window.addEventListener('blur', function () { Input.keys = {}; Input.rdown = false; Input._drag = false; });
    document.addEventListener('mousemove', function (e) {
      if (Input.locked) {
        /* 일부 브라우저가 가끔 내는 터무니없이 큰 이동값은 버린다 */
        var mvx = e.movementX || 0, mvy = e.movementY || 0;
        if (Math.abs(mvx) < 500 && Math.abs(mvy) < 500) { Input.mx += mvx; Input.my += mvy; }
      } else if (Input._drag) {
        var dx = e.clientX - Input._lx, dy = e.clientY - Input._ly;
        Input._lx = e.clientX; Input._ly = e.clientY;
        Input._moved += Math.abs(dx) + Math.abs(dy);
        Input.mx += dx * 1.6; Input.my += dy * 1.6;
      }
    });
    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 2) { Input.rdown = true; Input.rhit = true; return; }      /* 오른쪽 버튼 = 안경다리 터치(F 와 같다) */
      if (e.button !== 0) return;
      if (Input.locked) { Input.clicked = true; Input.clickX = 0; Input.clickY = 0; return; }
      Input._drag = true; Input._moved = 0; Input._lx = e.clientX; Input._ly = e.clientY;
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 2) { Input.rdown = false; return; }
      if (e.button !== 0) return;
      if (Input._drag) {
        Input._drag = false;
        if (Input._moved < 6) {
          /* 드래그 모드의 클릭은 커서가 가리키는 곳을 누른 것으로 본다(-1..1 좌표) */
          var w = window.innerWidth || 1, h = window.innerHeight || 1;
          Input.clicked = true;
          Input.clickX = (e.clientX / w) * 2 - 1;
          Input.clickY = 1 - (e.clientY / h) * 2;
        }
      }
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', function (e) { Input.wheel += e.deltaY > 0 ? 1 : (e.deltaY < 0 ? -1 : 0); });
    document.addEventListener('pointerlockchange', function () {
      Input.locked = document.pointerLockElement === canvas;
      if (Input.locked) Input.everLocked = true;
      if (Input.onLock) Input.onLock(Input.locked);
    });
    document.addEventListener('pointerlockerror', function () { Input.fallback(); });
  };
  /* 포인터 잠금을 쓸 수 없으면 '드래그로 둘러보기'로 바꾼다.
   * 한 번이라도 잠겼던 적이 있으면(Esc 직후 너무 빨리 다시 요청한 경우 등) 모드는 그대로 두고 다시 시도하게 한다 */
  Input.fallback = function () {
    if (Input.everLocked) { if (Input.onRetry) Input.onRetry(); return; }
    if (Input.mode === 'drag') return;
    Input.mode = 'drag';
    if (Input.onFallback) Input.onFallback();
  };
  Input.requestLock = function () {
    if (Input.mode !== 'lock' || Input.locked) return;
    try {
      var p = Input.canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(function () { Input.fallback(); });
    } catch (e) { Input.fallback(); }
  };
  Input.releaseLock = function () {
    try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* 무시 */ }
  };
  Input.hit = function (code) { return !!Input.pressed[code]; };
  Input.down = function (code) { return !!Input.keys[code]; };
  Input.endFrame = function () { Input.pressed = {}; Input.mx = 0; Input.my = 0; Input.wheel = 0; Input.clicked = false; Input.rhit = false; };
  GX.Input = Input;

  /* ───────── 플레이어 ───────── */
  function Player() {
    this.cam = { view: M4.create(), proj: M4.create(), pos: [0, 0, 0] };
    this.fwd = [0, 0, -1];
    this.reset();
  }
  Player.prototype.reset = function () {
    this.mode = 'walk';
    this.x = W.SPAWN[0]; this.z = W.SPAWN[1];
    this.yaw = 0; this.pitch = -0.03;
    this.eye = [this.x, 1.62, this.z];
    this.fov = 64;
    this.vx = 0; this.vz = 0; this.bob = 0; this.speed = 0;
    this.seat = null; this.lean = 0; this.leanWant = 0; this.shift = 0;
    this.cut = null; this.assist = null; this.stepped = false;
  };

  function collide(p, rects, r) {
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < rects.length; i++) {
        var b = rects[i];
        var cx = p.x < b[0] ? b[0] : (p.x > b[2] ? b[2] : p.x);
        var cz = p.z < b[1] ? b[1] : (p.z > b[3] ? b[3] : p.z);
        var dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          var d = Math.sqrt(d2);
          p.x = cx + dx / d * r; p.z = cz + dz / d * r;
        } else {
          /* 상자 안에 들어와 버렸으면 가장 가까운 면으로 밀어낸다 */
          var l = p.x - b[0], rr = b[2] - p.x, n = p.z - b[1], f = b[3] - p.z, m = Math.min(l, rr, n, f);
          if (m === l) p.x = b[0] - r; else if (m === rr) p.x = b[2] + r; else if (m === n) p.z = b[1] - r; else p.z = b[3] + r;
        }
      }
    }
  }

  /* opts: { colliders, extra(추가 상자), circles([[x,z,r]]), canMove, canLook } */
  Player.prototype.update = function (dt, input, opts) {
    var k, sens = 0.0022 * input.sens;
    this.stepped = false;
    if (this.cut) {
      var c = this.cut;
      c.t += dt;
      k = GX.smooth(c.t / c.dur);
      for (var i = 0; i < 3; i++) this.eye[i] = GX.lerp(c.from.eye[i], c.to.eye[i], k);
      this.yaw = c.from.yaw + GX.wrapAngle(c.to.yaw - c.from.yaw) * k;
      this.pitch = GX.lerp(c.from.pitch, c.to.pitch, k);
      this.fov = GX.lerp(c.from.fov, c.to.fov, k);
      if (c.t >= c.dur) { this.cut = null; if (c.then) c.then(); }
      return;
    }
    if (opts.canLook !== false) {
      if (this.assist) {
        var a = this.assist;
        a.t -= dt;
        if (Math.abs(input.mx) + Math.abs(input.my) > 3 && !a.hard) a.t = 0;
        this.yaw = GX.dampAngle(this.yaw, a.yaw, a.rate, dt);
        this.pitch = GX.damp(this.pitch, a.pitch, a.rate, dt);
        if (a.t <= 0) this.assist = null;
      }
      if (!this.assist || !this.assist.hard) {
        this.yaw -= input.mx * sens;
        this.pitch -= input.my * sens;
      }
    }
    if (this.mode === 'walk') {
      this.pitch = GX.clamp(this.pitch, -1.35, 1.2);
      this.yaw = GX.wrapAngle(this.yaw);
      var f = 0, s = 0;
      if (opts.canMove !== false) {
        f = ((input.down('KeyW') || input.down('ArrowUp')) ? 1 : 0) - ((input.down('KeyS') || input.down('ArrowDown')) ? 1 : 0);
        s = ((input.down('KeyD') || input.down('ArrowRight')) ? 1 : 0) - ((input.down('KeyA') || input.down('ArrowLeft')) ? 1 : 0);
      }
      var sp = (input.down('ShiftLeft') || input.down('ShiftRight')) ? 3.2 : 2.05;
      var sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      var wx = -sy * f + cy * s, wz = -cy * f - sy * s, wl = Math.sqrt(wx * wx + wz * wz);
      if (wl > 1) { wx /= wl; wz /= wl; }
      this.vx = GX.damp(this.vx, wx * sp, 11, dt);
      this.vz = GX.damp(this.vz, wz * sp, 11, dt);
      this.x += this.vx * dt; this.z += this.vz * dt;
      collide(this, opts.colliders, 0.24);
      if (opts.extra) collide(this, opts.extra, 0.24);
      if (opts.circles) {
        for (k = 0; k < opts.circles.length; k++) {
          var cc = opts.circles[k], dx = this.x - cc[0], dz = this.z - cc[1], d = Math.sqrt(dx * dx + dz * dz), rr = cc[2] + 0.24;
          if (d < rr && d > 1e-5) { this.x = cc[0] + dx / d * rr; this.z = cc[1] + dz / d * rr; }
        }
      }
      this.speed = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
      var before = Math.floor(this.bob);
      this.bob += dt * this.speed * 0.9;
      if (Math.floor(this.bob) !== before && this.speed > 0.6) this.stepped = true;
      var amp = Math.min(1, this.speed / 2);
      this.eye[0] = this.x; this.eye[2] = this.z;
      this.eye[1] = 1.62 + Math.sin(this.bob * Math.PI * 2) * 0.02 * amp;
      this.fov = GX.damp(this.fov, 64, 6, dt);
    } else if (this.mode === 'seat') {
      this.yaw = GX.clamp(this.yaw, -2.15, 2.15);
      this.pitch = GX.clamp(this.pitch, -1.42, 0.75);
      if (this.pitch < -0.6) this.leanWant = 1; else if (this.pitch > -0.44) this.leanWant = 0;
      this.lean = GX.damp(this.lean, this.leanWant, 7, dt);
      this.shift = GX.damp(this.shift, GX.clamp(-this.yaw * 0.42, -0.115, 0.07), 6, dt);
      var st = this.seat, L = this.lean;
      this.eye[0] = st.x + this.shift * L;
      this.eye[1] = GX.lerp(1.22, 1.125, L);
      this.eye[2] = st.z + GX.lerp(0.42, 0.265, L);
      this.fov = GX.lerp(64, 47, L);
      this.x = this.eye[0]; this.z = this.eye[2];
    }
  };

  /* 장면 전환(부드럽게 이동). to: { eye, yaw, pitch, fov } */
  Player.prototype.cutTo = function (to, dur, then) {
    this.cut = {
      t: 0, dur: dur, then: then,
      from: { eye: this.eye.slice(), yaw: this.yaw, pitch: this.pitch, fov: this.fov },
      to: { eye: to.eye.slice(), yaw: to.yaw, pitch: to.pitch, fov: to.fov === undefined ? this.fov : to.fov }
    };
    this.vx = this.vz = 0;
  };
  Player.prototype.sit = function (seat, then) {
    var self = this;
    this.seat = seat; this.lean = 0; this.leanWant = 0; this.shift = 0;
    this.cutTo({ eye: [seat.x, 1.22, seat.z + 0.42], yaw: 0, pitch: -0.06, fov: 64 }, 1.25, function () {
      self.mode = 'seat'; self.yaw = 0; self.pitch = -0.06;
      if (then) then();
    });
  };
  /* 잠깐 시선을 어떤 점으로 끌어 준다(마우스를 움직이면 풀림. hard 면 고정) */
  Player.prototype.lookAt = function (x, y, z, dur, hard, rate) {
    var dx = x - this.eye[0], dy = y - this.eye[1], dz = z - this.eye[2];
    this.assist = { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)), t: dur, hard: !!hard, rate: rate || 5 };
  };
  Player.prototype.lookDir = function (yaw, pitch, dur, rate) {
    this.assist = { yaw: yaw, pitch: pitch, t: dur, hard: false, rate: rate || 7 };
  };

  /* 세로 시야 절반의 탄젠트. 창이 세로로 길면(가로:세로가 1.6 보다 좁으면) 세로 시야를 넓혀서,
     가로로 보이는 범위가 16:10 창에서보다 좁아지지 않게 한다. 그러지 않으면 좁은 창에서는 책상 위의 답안지가 화면 밖으로 잘린다
     (세로 시야는 100도까지만 넓힌다) */
  var WIDE_ASPECT = 1.6, MAX_TAN = Math.tan(50 * Math.PI / 180);
  Player.prototype.tanHalfFov = function (aspect) {
    var t = Math.tan(this.fov * Math.PI / 360);
    if (aspect > 0 && aspect < WIDE_ASPECT) t = Math.min(t * WIDE_ASPECT / aspect, Math.max(t, MAX_TAN));
    return t;
  };

  /* 화면의 (nx,ny)(-1..1) 지점을 지나는 시선 방향. 가운데면 fwd 와 같다 */
  Player.prototype.rayAt = function (nx, ny, aspect) {
    var f = this.fwd;
    if (!nx && !ny) return f;
    var rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    var ux = -f[1] * rz, uy = f[0] * rz - f[2] * rx, uz = f[1] * rx;      /* up = right × fwd 의 반대 부호 정리 */
    var t = this.tanHalfFov(aspect);
    var dx = f[0] + rx * nx * t * aspect + ux * ny * t;
    var dy = f[1] + uy * ny * t;
    var dz = f[2] + rz * nx * t * aspect + uz * ny * t;
    var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return [dx / l, dy / l, dz / l];
  };

  Player.prototype.updateCamera = function (aspect) {
    var cp = Math.cos(this.pitch), f = this.fwd, e = this.eye, c = this.cam;
    f[0] = -Math.sin(this.yaw) * cp; f[1] = Math.sin(this.pitch); f[2] = -Math.cos(this.yaw) * cp;
    c.pos[0] = e[0]; c.pos[1] = e[1]; c.pos[2] = e[2];
    M4.lookAt(c.view, e[0], e[1], e[2], e[0] + f[0], e[1] + f[1], e[2] + f[2], 0, 1, 0);
    /* 보통 창(16:10 보다 넓은 창)에서는 세로 시야 그대로, 좁은 창에서는 넓힌 시야로 */
    var fovY = aspect < WIDE_ASPECT ? 2 * Math.atan(this.tanHalfFov(aspect)) : this.fov * Math.PI / 180;
    M4.perspective(c.proj, fovY, aspect, 0.05, 1200);   /* 창밖 먼 풍경까지 */
    return c;
  };

  GX.Player = Player;
})(window.GX = window.GX || {});
