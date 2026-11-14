/* 감독관 — 통로를 따라 걷고, 둘러보고, 책상을 들여다보고, 수상하면 다가와 지켜본다.
 * 두 명이 같은 규칙으로 움직인다: 정감독(chief)은 교탁 옆이 제자리, 부감독(assist)은 교실 뒤가 제자리.
 * 서로 같은 통로에 들어가지 않도록 상대(other)가 쓰는 통로는 피한다.
 */
(function (GX) {
  'use strict';
  var W = GX.W;

  function Proctor(eng, world, role) {
    this.role = role || 'chief';
    this.chief = this.role === 'chief';
    this.rig = new GX.Rig(eng, { kind: this.chief ? 0 : 1 }, world.tx);
    this.world = world;
    this.other = null;
    this.onStep = null;
    /* 발밑 접지 그림자 */
    var gb = new GX.Geo();
    gb.floorQuad(-0.34, -0.3, 0.34, 0.3, 0, 0xffffff, [0, 0, 1, 1]);
    this.blob = eng.add(eng.createMesh(gb), { tex: world.tx.blob, blend: 1, tint: [1, 1, 1, 0.5], order: -9 });
    this.reset();
  }
  Proctor.prototype.reset = function () {
    var r = this.rig;
    if (this.chief) { r.pos[0] = -0.35; r.pos[2] = -3.6; r.hold = 'clip'; r.gesture = 'none'; }
    else { r.pos[0] = -1.75; r.pos[2] = -3.3; r.hold = 'none'; r.gesture = 'back'; }
    r.pos[1] = 0; r.yaw = Math.PI;
    r.armOverride = false;
    r.tool = null; r.toolPose = null;
    r.pose.lean = 0;
    this.glintAcc = 0;            /* 내 렌즈의 불빛이 이 감독관 눈에 쌓인 정도 */
    this.take = null;             /* 불빛을 눈치채고 멈춰 서서 다시 보는 중이면 { t, grace, seen } */
    this.path = [];
    this.speed = 0.8;
    this.faceYaw = Math.PI;
    this.look = { type: 'rel', yaw: 0, pitch: -0.05 };
    this.moving = false;
    this.leanWant = 0;
    this.autoLook = false; this.idleT = 0;
    this.ai = { state: 'off', t: 0, glance: 0, lastAisle: -1, aisle: -1, watchCool: 0, pause: 0, onPlayer: false };
    r.update();
  };
  Object.defineProperty(Proctor.prototype, 'x', { get: function () { return this.rig.pos[0]; } });
  Object.defineProperty(Proctor.prototype, 'z', { get: function () { return this.rig.pos[2]; } });

  /* 책상 줄 사이 통로와 앞·뒤 가로 통로만 써서 가는 길 */
  Proctor.prototype.route = function (tx, tz) {
    var cx = this.x, cz = this.z, raw = [], i;
    var zf = W.LANE_FRONT, zb = W.LANE_BACK;
    function zone(z) { return z <= zf + 0.02 ? 'F' : (z >= zb - 0.02 ? 'B' : 'A'); }
    var zc = zone(cz), zt = zone(tz), lane;
    if (Math.abs(cx - tx) < 0.12 && (zc === 'A' || zt === 'A' || zc === zt)) return [[tx, tz]];
    if (zc === 'A') {
      if (zt === 'F') lane = zf;
      else if (zt === 'B') lane = zb;
      else lane = (Math.abs(cz - zf) + Math.abs(tz - zf) <= Math.abs(cz - zb) + Math.abs(tz - zb)) ? zf : zb;
      raw.push([cx, lane]);
      zc = lane === zf ? 'F' : 'B';
    } else {
      lane = zc === 'F' ? zf : zb;
      raw.push([cx, lane]);
    }
    if (zt === zc || zt === 'A') {
      raw.push([tx, lane], [tx, tz]);
    } else {
      var other = zt === 'F' ? zf : zb, best = W.AISLES[0], bc = 1e9;
      for (i = 0; i < W.AISLES.length; i++) {
        var c = Math.abs(cx - W.AISLES[i]) + Math.abs(W.AISLES[i] - tx) * 1.01;   /* 비기면 목적지 쪽 통로 */
        if (this.other && this.other.ai.aisle === i) c += 6;                       /* 상대가 있는 통로는 돌아간다 */
        if (c < bc) { bc = c; best = W.AISLES[i]; }
      }
      raw.push([best, lane], [best, other], [tx, other], [tx, tz]);
    }
    var pts = [], px = cx, pz = cz;
    for (i = 0; i < raw.length; i++) {
      if (Math.abs(raw[i][0] - px) + Math.abs(raw[i][1] - pz) < 0.03) continue;
      pts.push(raw[i]); px = raw[i][0]; pz = raw[i][1];
    }
    return pts;
  };
  Proctor.prototype.goTo = function (tx, tz, speed) {
    this.path = this.route(tx, tz);
    if (speed) this.speed = speed;
  };
  Proctor.prototype.goDirect = function (tx, tz, speed) {
    this.path = [[tx, tz]];
    if (speed) this.speed = speed;
  };
  Proctor.prototype.arrived = function () { return this.path.length === 0; };
  Proctor.prototype.lookAtPoint = function (x, y, z) { this.look = { type: 'point', p: [x, y, z] }; };
  Proctor.prototype.lookRel = function (yaw, pitch) { this.look = { type: 'rel', yaw: yaw, pitch: pitch || 0 }; };

  Proctor.prototype.update = function (dt) {
    var r = this.rig, moved = false, ai = this.ai;
    if (ai.pause > 0) ai.pause -= dt;
    if (this.path.length && !(ai.pause > 0)) {
      var p = this.path[0], dx = p[0] - r.pos[0], dz = p[1] - r.pos[2], d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.03) {
        r.pos[0] = p[0]; r.pos[2] = p[1];
        this.path.shift();
      } else {
        var want = Math.atan2(-dx, -dz), err = Math.abs(GX.wrapAngle(want - r.yaw));
        r.yaw = GX.dampAngle(r.yaw, want, 8, dt);
        var k = GX.clamp(1.25 - err / 1.1, 0, 1), step = Math.min(d, this.speed * k * dt);
        r.pos[0] += dx / d * step; r.pos[2] += dz / d * step;
        if (r.walk(dt, this.speed * k) && this.onStep) this.onStep(r.pos[0], r.pos[2], this.speed, this);
        moved = true;
        this.faceYaw = want;
      }
    }
    if (!moved) {
      r.yaw = GX.dampAngle(r.yaw, this.faceYaw, 6, dt);
      r.stand(dt);
    }
    this.moving = moved;
    r.pose.lean = GX.damp(r.pose.lean, moved ? 0 : this.leanWant, 5, dt);
    if (this.autoLook && ai.state === 'off') this._idle(dt);
    var L = this.look;
    if (L.type === 'point') r.lookAt(L.p[0], L.p[1], L.p[2], dt, 6);
    else r.lookRel(L.yaw, L.pitch, dt, 5);
    r.update();
    GX.M4.fromPose(this.blob.model, r.pos[0], 0.006, r.pos[2], r.yaw, 0, 0);
  };

  /* 시험 전: 대본이 시키는 일이 없을 때 교실을 천천히 둘러본다 */
  Proctor.prototype._idle = function (dt) {
    this.idleT -= dt;
    if (this.idleT > 0) return;
    var r = this.idleRnd || (this.idleRnd = GX.rng(this.chief ? 911 : 733)), seats = this.world.seats, k = r();
    this.idleT = 1.6 + r() * 3.2;
    if (k < 0.55) { var s = seats[Math.floor(r() * seats.length)]; this.lookAtPoint(s.x, 1.0, s.z + 0.3); }
    else if (k < 0.7) this.lookAtPoint(3.8, 1.5, 3.8);
    else if (k < 0.82) this.lookAtPoint(W.CLOCK[0], W.CLOCK[1], -4.8);
    else this.lookRel((r() - 0.5) * 0.8, -0.08);
  };

  /* 감독관의 시선이 (px,pz)에 얼마나 쏠려 있는가 0..1 */
  Proctor.prototype.attention = function (px, pz) {
    var dx = px - this.x, dz = pz - this.z, d = Math.sqrt(dx * dx + dz * dz) || 0.001;
    var g = this.rig.gazeDir();
    var facing = (g[0] * dx + g[1] * dz) / d;
    var f = GX.smoothstep(0.86, 0.99, facing);          /* 고개가 내 쪽으로 약 25도 안에 들어와야 '본다' */
    var n = GX.clamp(1 - (d - 1.0) / 6.5, 0.12, 1);
    var a = f * n, L = this.look;
    if (L.type === 'point') {
      /* 다른 자리를 콕 집어 보는 중이면, 그 자리에서 먼 나는 스쳐 갈 뿐이다 */
      var ex = L.p[0] - px, ez = L.p[2] - pz;
      a *= 1 - 0.85 * GX.smoothstep(0.55, 1.5, Math.sqrt(ex * ex + ez * ez));
    }
    var near = GX.smoothstep(1.7, 0.95, d) * 0.55;       /* 바로 옆이면 곁눈으로도 보인다 */
    return Math.max(a, near);
  };
  Proctor.prototype.dist = function (px, pz) {
    var dx = px - this.x, dz = pz - this.z;
    return Math.sqrt(dx * dx + dz * dz);
  };

  /* ───────── 시험 중 순찰 ───────── */
  Proctor.prototype.homeSpot = function () {
    var r = this.rnd;
    if (this.chief) return [-0.35 + (r() - 0.5) * 1.2, -3.55];
    return [[-2.55, -0.85, 0.85, 2.55][Math.floor(r() * 4)], W.LANE_BACK + 0.04];
  };
  Proctor.prototype.startExam = function (seat, rnd) {
    this.seat = seat; this.rnd = rnd;
    this.autoLook = false;
    this.ai = { state: 'toHome', t: this.chief ? 20 + rnd() * 10 : 8 + rnd() * 8, glance: 0, lastAisle: -1, aisle: -1, watchCool: this.chief ? 12 : 16, pause: 0, onPlayer: false };
    this.leanWant = 0;
    if (this.chief) { this.rig.hold = 'clip'; this.rig.gesture = 'none'; }
    else { this.rig.hold = 'none'; this.rig.gesture = 'back'; }
    var h = this.homeSpot();
    if (!this.chief) {
      /* 부감독은 본령과 함께 창가 통로로 걸어 교실 뒤에 선다 */
      var a = this.x > 0 ? 4 : 0;
      if (this.other && this.other.ai.aisle === a) a = 4 - a;
      this.ai.aisle = a;
      this.path = this.route(W.AISLES[a], W.LANE_BACK).concat([[h[0], h[1]]]);
      this.speed = 0.85;
    } else this.goTo(h[0], h[1], 0.9);
    this.faceYaw = this.chief ? Math.PI : 0;
  };
  Proctor.prototype.stopExam = function () { this.ai.state = 'off'; this.ai.aisle = -1; this.ai.pause = 0; this.leanWant = 0; this.take = null; this.glintAcc = 0; };

  /* 순찰하는 중인가(멈춰 세우거나 불러올 수 있는 상태) */
  Proctor.prototype.free = function () {
    var s = this.ai.state;
    return s === 'home' || s === 'walk' || s === 'far' || s === 'toHome';
  };
  /* 뭔가 눈에 걸려 걸음을 멈추고 그쪽을 다시 본다. sec 초 동안 */
  Proctor.prototype.doubleTake = function (x, y, z, sec) {
    var ai = this.ai;
    ai.pause = Math.max(ai.pause, sec); ai.glance = sec; ai.onPlayer = true;
    this.lookAtPoint(x, y, z);
    this.leanWant = -0.07;
  };
  /* 소리나 남의 시선에 이끌려 그쪽을 잠깐 본다. 볼 수 있는 상태였으면 true */
  Proctor.prototype.glanceAt = function (x, y, z, sec) {
    if (!this.free()) return false;
    this.lookAtPoint(x, y, z);
    this.ai.glance = Math.max(this.ai.glance, sec); this.ai.onPlayer = true;
    return true;
  };
  /* 안경 검사: 내 자리 옆으로 곧장 온다(대본이 이어서 지시한다) */
  Proctor.prototype.beginInspect = function () {
    var sp = this.sideSpot(this.seat), i, best = -1, bd = 9, st = this.seat;
    for (i = 0; i < W.AISLES.length; i++) { var d = Math.abs(W.AISLES[i] - sp[0]); if (d < bd) { bd = d; best = i; } }
    this.ai.state = 'inspect'; this.ai.aisle = best; this.ai.pause = 0; this.leanWant = 0; this.take = null;
    this.rig.gesture = 'none';
    this.goTo(sp[0], sp[1], 1.45);
    this.lookAtPoint(st.x, 1.15, st.z + 0.4);
  };
  /* 검사를 마치고 순찰로 돌아간다 */
  Proctor.prototype.endInspect = function () {
    var ai = this.ai;
    this.leanWant = 0;
    this.rig.tool = null; this.rig.toolPose = null;
    if (!this.chief) this.rig.gesture = 'back';
    ai.state = 'walk'; ai.dest = 'home'; ai.glance = 0; ai.pause = 0;
    this.goTo(this.x, this.chief ? W.LANE_FRONT : W.LANE_BACK, 0.75);
    ai.watchCool = 26;
    if (this.other) this.other.ai.watchCool = Math.max(this.other.ai.watchCool, 26);
  };
  Proctor.prototype.isInspecting = function () { return this.ai.state === 'inspect'; };

  Proctor.prototype._pickAisle = function (heat) {
    var w = [], sum = 0, i, px = this.seat.x, oa = this.other ? this.other.ai.aisle : -1;
    for (i = 0; i < W.AISLES.length; i++) {
      var wt = 1;
      if (Math.abs(Math.abs(W.AISLES[i] - px) - 0.85) < 0.1) wt += heat * 3.0;
      if (i === this.ai.lastAisle) wt *= 0.25;
      if (i === oa) wt = 0;
      w.push(wt); sum += wt;
    }
    var r = this.rnd() * sum;
    for (i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return oa === 0 ? 1 : 0;
  };
  /* 제자리에 서서 어디를 볼지 고른다 */
  Proctor.prototype._glance = function (heat, mustPlayer) {
    var ai = this.ai, r = this.rnd, st = this.seat, seats = this.world.seats, rig = this.rig;
    ai.glance = 1.3 + r() * 2.4;
    this.leanWant = 0;
    if (!this.chief) rig.gesture = 'back';
    var pPlayer = (this.chief ? 0.065 : 0.05) + heat * (this.chief ? 0.19 : 0.15);   /* 둘을 합쳐 예전 한 명 몫 */
    if (mustPlayer || r() < pPlayer) { this.lookAtPoint(st.x, 1.05, st.z + 0.35); ai.onPlayer = true; return; }
    ai.onPlayer = false;
    var k = r();
    if (k < 0.6) {
      var s = seats[Math.floor(r() * seats.length)];
      this.lookAtPoint(s.x, 0.95, s.z + 0.3);
    } else if (k < 0.76) {
      this.lookAtPoint(W.CLOCK[0], W.CLOCK[1], -4.8);
      if (!this.chief && r() < 0.5) { rig.gesture = 'watch'; this.lookRel(0.35, -0.7); ai.glance = 1.6; }
    } else if (k < 0.88) {
      if (this.chief) this.lookRel(0.25, -0.75);                 /* 서류판을 내려다본다 */
      else { rig.gesture = 'cross'; this.lookRel((r() - 0.5) * 0.7, -0.1); ai.glance = 3 + r() * 3; }
    } else this.lookAtPoint(-3.9, 1.6, this.z + (this.chief ? 1.5 : -1.5));
  };

  /* heat: 0..1 (의심이 쌓일수록 내 쪽을 자주 본다) */
  Proctor.prototype.examUpdate = function (dt, heat) {
    var ai = this.ai, r = this.rnd, st = this.seat, i;
    if (ai.state === 'off') return;
    ai.watchCool -= dt;
    ai.glance -= dt;
    var homeYaw = this.chief ? Math.PI : 0;
    if (ai.state === 'toHome') {
      if (this.arrived()) {
        /* 제자리에 돌아오면 한동안 서서 지켜본다(정감독은 오래, 부감독은 자주 돈다) */
        ai.state = 'home'; ai.aisle = -1; this.faceYaw = homeYaw; ai.glance = 0;
        if (ai.t <= 0) ai.t = this.chief ? 26 + r() * 26 : 12 + r() * 14;
      }
      else if (ai.glance <= 0) { this.lookRel((r() - 0.5) * 0.5, -0.1); ai.glance = 0.8 + r(); }
    } else if (ai.state === 'home') {
      this.faceYaw = homeYaw;
      ai.t -= dt;
      if (ai.glance <= 0) this._glance(heat);
      if (ai.t <= 0) {
        var a = this._pickAisle(heat);
        ai.lastAisle = a; ai.aisle = a; ai.state = 'walk'; ai.dest = 'far';
        if (!this.chief) this.rig.gesture = 'back';
        this.goTo(W.AISLES[a], this.chief ? W.LANE_BACK - 0.3 : W.LANE_FRONT + 0.3, 0.68 + r() * 0.12);
        ai.glance = 0; ai.peekCool = 1.5;
      }
    } else if (ai.state === 'walk') {
      if (ai.pause > 0) {
        /* 멈춰 서서 책상을 들여다보는 중 */
      } else if (this.leanWant) {
        this.leanWant = 0; ai.glance = 0.4; this.lookRel(0, -0.1); ai.onPlayer = false;
      } else if (ai.glance <= 0) {
        /* 걸으면서 가까운 책상을 흘끗 본다. 가끔은 멈춰서 들여다본다 */
        var best = null, bd = 9, seats = this.world.seats, fx = -Math.sin(this.rig.yaw), fz = -Math.cos(this.rig.yaw);
        for (i = 0; i < seats.length; i++) {
          var dx = seats[i].x - this.x, dz = seats[i].z - this.z, d = Math.sqrt(dx * dx + dz * dz);
          var ahead = (dx * fx + dz * fz);
          if (d < 2.4 && ahead > -0.2 && d < bd && r() < 0.6) { bd = d; best = seats[i]; }
        }
        var dp = this.dist(st.x, st.z);
        if (dp < 4.2 && r() < 0.08 + heat * 0.36) best = st;
        ai.peekCool = (ai.peekCool || 0) - 1;
        if (best && r() < 0.8) {
          this.lookAtPoint(best.x, 0.85, best.z + 0.1); ai.onPlayer = best === st;
          var side = Math.abs(best.x - this.x) < 1.0 && Math.abs(best.z + 0.25 - this.z) < 0.5;
          if (side && ai.peekCool <= 0 && r() < (best === st ? 0.1 + heat * 0.28 : 0.3)) {
            ai.pause = 1.1 + r() * 1.3; this.leanWant = -0.17; ai.peekCool = 3;
            this.lookAtPoint(best.x - 0.08, 0.76, best.z);
          }
        } else { this.lookRel(0, -0.1); ai.onPlayer = false; }
        ai.glance = 0.9 + r() * 1.5;
      }
      if (this.arrived() && !(ai.pause > 0)) {
        if (ai.dest === 'far') { ai.state = 'far'; ai.t = 1.5 + r() * 3.5; this.faceYaw = homeYaw + Math.PI; ai.glance = 0; }
        else { ai.state = 'toHome'; var h = this.homeSpot(); this.goDirect(h[0], h[1], 0.7); ai.aisle = -1; }
      }
    } else if (ai.state === 'far') {
      ai.t -= dt;
      if (ai.glance <= 0) this._glance(heat);
      if (ai.t <= 0) {
        /* 돌아올 때는 다른 통로로: 지금 쪽 가로 통로를 따라 옮겨 간 뒤 그 통로를 타고 제자리 쪽으로 */
        var b = this._pickAisle(heat);
        var nearLane = this.chief ? W.LANE_BACK : W.LANE_FRONT, homeLane = this.chief ? W.LANE_FRONT : W.LANE_BACK;
        ai.lastAisle = b; ai.aisle = b; ai.state = 'walk'; ai.dest = 'home';
        if (!this.chief) this.rig.gesture = 'back';
        this.path = [[this.x, nearLane], [W.AISLES[b], nearLane], [W.AISLES[b], homeLane]];
        this.speed = 0.68 + r() * 0.12;
        ai.glance = 0; ai.peekCool = 1.5;
      }
    } else if (ai.state === 'goWatch') {
      this.lookAtPoint(st.x, 1.05, st.z + 0.35);
      if (this.arrived()) {
        ai.state = 'watch'; ai.t = 6 + r() * 3;
        this.faceYaw = Math.atan2(-(st.x - this.x), -(st.z + 0.3 - this.z));
        if (!this.chief) this.rig.gesture = 'cross';
      }
    } else if (ai.state === 'watch') {
      ai.t -= dt;
      if (ai.glance <= 0) {
        if (r() < 0.6) { this.lookAtPoint(st.x, 1.12, st.z + 0.38); this.leanWant = 0; }
        else { this.lookAtPoint(st.x - 0.1, 0.76, st.z); this.leanWant = -0.13; }
        ai.glance = 1.2 + r() * 1.4;
      }
      if (ai.t <= 0) {
        this.leanWant = 0;
        if (!this.chief) this.rig.gesture = 'back';
        ai.state = 'walk'; ai.dest = 'home';
        this.goTo(this.x, this.chief ? W.LANE_FRONT : W.LANE_BACK, 0.75);
        /* 한 번 지켜본 뒤에는 두 감독관 모두 한동안 다시 오지 않는다(의심이 가라앉을 틈) */
        ai.watchCool = 24; ai.glance = 0;
        if (this.other) this.other.ai.watchCool = Math.max(this.other.ai.watchCool, 24);
      }
    }
  };

  /* 내 자리 옆 통로 중 지금 위치에서 가까운 쪽(상대 감독관이 서 있는 통로는 피한다) */
  Proctor.prototype.sideSpot = function (seat, dz) {
    var a = seat.x - 0.85, b = seat.x + 0.85;
    var ax = Math.abs(this.x - a) <= Math.abs(this.x - b) ? a : b;
    var o = this.other;
    if (o && Math.abs(o.x - ax) < 0.3 && Math.abs(o.z - seat.z) < 1.6) ax = ax === a ? b : a;
    return [ax, seat.z + (dz === undefined ? 0.42 : dz)];
  };
  Proctor.prototype.canWatch = function () {
    var s = this.ai.state;
    return this.ai.watchCool <= 0 && !(this.ai.pause > 0) && (s === 'home' || s === 'walk' || s === 'far' || s === 'toHome');
  };
  Proctor.prototype.watchPlayer = function () {
    var sp = this.sideSpot(this.seat), i, best = -1, bd = 9;
    for (i = 0; i < W.AISLES.length; i++) { var d = Math.abs(W.AISLES[i] - sp[0]); if (d < bd) { bd = d; best = i; } }
    this.ai.state = 'goWatch'; this.ai.aisle = best; this.ai.pause = 0; this.leanWant = 0;
    this.goTo(sp[0], sp[1], 1.15);
  };
  Proctor.prototype.isWatching = function () { return this.ai.state === 'watch' || this.ai.state === 'goWatch'; };

  GX.Proctor = Proctor;
})(window.GX = window.GX || {});
