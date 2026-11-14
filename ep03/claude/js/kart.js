/* SUNDRIFT GP — kart physics. Arcade model: the kart steers its travel direction ("course") and carries a
   visible slip angle on top of it. Holding DRIFT in a corner locks in a slide that tightens the line,
   and sliding is what fills the booster gauge. Pure logic: no DOM, no WebGL. */
(function (root) {
  'use strict';
  var SD = root.SD;

  var C = SD.CFG = {
    topSpeed: 30,            // m/s on tarmac
    accel: 20,               // m/s^2 off the line
    brake: 34,
    reverseSpeed: 9,
    coast: 0.5,
    offroadTop: 0.6,
    turnLow: 2.3, turnHigh: 0.78,       // rad/s steering authority at walking pace / top speed
    steerIn: 8.5, steerOut: 11,
    driftMinSpeed: 13, driftEndSpeed: 8.5,
    driftTight: 1.38, driftMid: 0.98, driftWide: 0.5,
    driftSlipMid: 0.46, driftSlipGain: 0.2,
    driftTopMult: 0.955,
    gaugeBase: 0.075, gaugeTurn: 0.195,  // gauge per second = base + turn * |yaw rate|
    maxStock: 2,
    boostTime: 2.5, boostTop: 1.42,
    kickMinDrift: 0.55, kickTop: 1.2,
    padTime: 1.2, padTop: 1.36,
    startBoostTime: 1.5,
    gravity: 26,
    radius: 1.05,
    speedUnit: 4.2           // m/s -> the number shown on the speedometer
  };

  var loc = { i: 0, s: 0, d: 0, y: 0 };

  function Kart(track, index) {
    this.track = track;
    this.index = index;
    this.isPlayer = false;
    this.topMult = 1;          // skill / rubber-band multiplier on top speed
    this.events = [];
    this.reset(0, 0);
  }
  var K = Kart.prototype;

  /** Put the kart on the circuit at distance s / lateral d, facing along the track. */
  K.reset = function (s, d) {
    var t = this.track, p = [0, 0, 0];
    s = SD.mod(s, t.length);
    t.pointAt(s, d, p);
    this.x = p[0]; this.y = p[1]; this.z = p[2];
    this.vy = 0;
    this.ti = SD.mod(Math.round(s / t.ds), t.N);
    this.course = t.hd[this.ti];
    this.slip = 0;
    this.speed = 0;
    this.steer = 0;
    this.s = s; this.d = d;
    this.dist = s > t.length / 2 ? s - t.length : s;      // metres past the start line (negative on the grid)
    this.yawRate = 0;
    this.drifting = false; this.driftDir = 0; this.driftTime = 0; this.driftCharge = 0;
    this.gauge = 0; this.stock = 0;
    this.boostT = 0; this.kickT = 0; this.padT = 0; this.padCool = 0;
    this.grounded = true; this.offroad = false; this.wallCool = 0;
    this.accelVis = 0;
    // visuals
    this.roll = 0; this.pitch = 0; this.hop = 0; this.hopV = 0;
    this.wheelSpin = 0; this.steerVis = 0; this.headYaw = 0;
    this.groundPitch = 0; this.groundRoll = 0;
    this.finished = false; this.finishTime = 0;
    this.lapTimes = []; this.lapStart = 0; this.bestLap = Infinity;
    this.events.length = 0;
  };

  K.heading = function () { return this.course + this.slip; };
  K.boostAmount = function () {       // 0..1 intensity for effects
    if (this.boostT > 0) return 1;
    if (this.padT > 0) return 0.8;
    if (this.kickT > 0) return 0.5;
    return 0;
  };

  K.startDrift = function (dir) {
    this.drifting = true; this.driftDir = dir; this.driftTime = 0; this.driftCharge = 0;
    this.hopV = 2.6;
    this.events.push({ type: 'driftStart' });
  };
  K.endDrift = function (reward) {
    if (!this.drifting) return;
    this.drifting = false;
    if (reward && this.driftTime >= C.kickMinDrift) {
      this.kickT = SD.lerp(0.4, 0.95, SD.clamp01((this.driftTime - C.kickMinDrift) / 1.6));
      this.events.push({ type: 'kick', v: this.kickT });
    }
    this.events.push({ type: 'driftEnd', v: this.driftTime });
  };
  K.useBoost = function () {
    if (this.stock <= 0 || this.boostT > 0.3 || this.finished) return false;
    this.stock--;
    this.boostT = C.boostTime;
    this.events.push({ type: 'boost' });
    return true;
  };

  /** inp: { throttle 0..1, brake 0..1, turn -1..1 (+ = left), drift bool, boost bool (edge) } */
  K.update = function (dt, inp) {
    var t = this.track, sp = this.speed, spBefore = sp;

    // ---- steering feel
    var tgt = SD.clamp(inp.turn, -1, 1);
    var rate = (Math.abs(tgt) < Math.abs(this.steer) && tgt * this.steer >= 0) ? C.steerOut : C.steerIn;
    this.steer = SD.damp(this.steer, tgt, rate, dt);
    if (Math.abs(this.steer) < 0.002 && tgt === 0) this.steer = 0;

    // ---- boosts
    if (inp.boost) this.useBoost();
    var boosting = this.boostT > 0, padding = this.padT > 0, kicking = this.kickT > 0;
    var bm = boosting ? C.boostTop : (padding ? C.padTop : (kicking ? C.kickTop : 1));
    var surf = this.offroad ? ((boosting || padding) ? 0.86 : C.offroadTop) : 1;
    var top = C.topSpeed * this.topMult * bm * surf * (this.drifting ? C.driftTopMult : 1);

    // ---- drift state
    if (!this.drifting) {
      if (inp.drift && this.grounded && sp > C.driftMinSpeed && Math.abs(tgt) > 0.3) this.startDrift(tgt > 0 ? 1 : -1);
    } else {
      this.driftTime += dt;
      if (!inp.drift) this.endDrift(true);
      else if (sp < C.driftEndSpeed) this.endDrift(false);
    }

    // ---- throttle / brake
    if (this.grounded) {
      if (inp.throttle > 0.01 && !(inp.brake > 0.01 && sp > 1)) {
        if (sp < 0) sp = Math.min(0, sp + C.brake * dt);
        else if (sp < top) {
          var r = sp / top, push = C.accel * (boosting ? 2.0 : ((padding || kicking) ? 1.5 : 1)) * inp.throttle;
          sp = Math.min(top, sp + (push * (1 - r * r * r) + 1.6) * dt);
        }
      } else if (inp.brake > 0.01) {
        if (sp > 0.4) sp = Math.max(0, sp - C.brake * inp.brake * dt);
        else sp = Math.max(-C.reverseSpeed, sp - C.accel * 0.55 * dt);
      } else {
        sp -= sp * C.coast * dt;
        sp = SD.approach(sp, 0, 1.2 * dt);
      }
      if (sp > top) sp = Math.max(top, sp - (sp - top) * (this.offroad ? 3.4 : 1.9) * dt - 1.0 * dt);
    }

    // ---- turning
    var asp = Math.abs(sp), yaw, slipT;
    if (this.drifting) {
      var inward = this.steer * this.driftDir;
      var w = inward >= 0 ? SD.lerp(C.driftMid, C.driftTight, inward) : SD.lerp(C.driftMid, C.driftWide, -inward);
      w *= SD.clamp(asp / 22, 0.62, 1.04);
      yaw = this.driftDir * w;
      slipT = this.driftDir * (C.driftSlipMid + C.driftSlipGain * inward);
    } else {
      var cap = SD.lerp(C.turnLow, C.turnHigh, SD.clamp01((asp - 6) / (C.topSpeed - 6)));
      if (asp > C.topSpeed) cap *= Math.max(0.78, C.topSpeed / asp);
      yaw = this.steer * cap * SD.clamp01(asp / 3.5) * (sp < 0 ? -1 : 1);
      slipT = this.steer * 0.11 * SD.clamp01(asp / C.topSpeed);
    }
    if (!this.grounded) yaw *= 0.35;
    this.yawRate = yaw;
    this.course += yaw * dt;
    this.slip = SD.damp(this.slip, slipT, this.drifting ? 7.5 : 5.5, dt);

    // ---- move
    var dx = Math.sin(this.course), dz = Math.cos(this.course);
    this.x += dx * sp * dt; this.z += dz * sp * dt;

    // ---- where are we on the circuit?
    t.locate(this.x, this.z, this.ti, loc);
    var i = loc.i, lim = t.wallOffset - C.radius;
    if (Math.abs(loc.d) > lim) {                                  // barrier
      var sg = loc.d > 0 ? 1 : -1, wx = t.nx[i] * sg, wz = t.nz[i] * sg;
      var pen = Math.abs(loc.d) - lim;
      this.x -= wx * pen; this.z -= wz * pen;
      var vx = dx * sp, vz = dz * sp, vn = vx * wx + vz * wz;
      if (vn > 0) {
        vx -= wx * vn * 1.22; vz -= wz * vn * 1.22;
        var hit = SD.clamp01(vn / 15), ns = Math.hypot(vx, vz) * (1 - 0.34 * hit);
        if (sp < 0) { this.course = Math.atan2(-vx, -vz); sp = -ns; } else { this.course = Math.atan2(vx, vz); sp = ns; }
        this.slip *= 0.55;
        if (vn > 3.2 && this.wallCool <= 0) {
          this.wallCool = 0.3;
          this.events.push({ type: 'wall', v: hit, x: this.x + wx * C.radius, z: this.z + wz * C.radius });
          if (this.drifting && vn > 8) this.endDrift(false);
        }
      }
      loc.d = sg * lim;
    }
    var ds = t.delta(loc.s, this.s);
    this.dist += ds;
    this.s = loc.s; this.d = loc.d; this.ti = i;
    this.offroad = Math.abs(loc.d) > t.halfWidth + 1.0;

    // ---- height: ride the surface, leave it only if it drops away faster than gravity
    var gy = loc.y, slope = t.slope[i];
    var along = Math.cos(this.course - t.hd[i]);
    var gvy = slope * sp * along;
    this.vy -= C.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= gy + 0.03) {
      if (!this.grounded) { this.grounded = true; this.hopV = -Math.min(3, (gvy - this.vy) * 0.25); this.events.push({ type: 'land', v: gvy - this.vy }); }
      this.y = gy; this.vy = gvy;
    } else if (this.y - gy > 0.14) {
      this.grounded = false;
    }
    this.groundPitch = Math.atan(slope) * along;
    this.groundRoll = -Math.atan(slope) * Math.sin(this.course - t.hd[i]);

    // ---- booster gauge
    if (this.drifting && this.grounded) {
      var gain = (C.gaugeBase + C.gaugeTurn * Math.abs(yaw)) * SD.clamp01(asp / 22) * dt;
      this.driftCharge += gain;
      if (this.stock < C.maxStock) {
        this.gauge += gain;
        if (this.gauge >= 1) {
          this.stock++;
          this.gauge = this.stock >= C.maxStock ? Math.min(this.gauge - 1, 0.999) : this.gauge - 1;
          this.events.push({ type: 'stock' });
        }
      } else {
        this.gauge = Math.min(1, this.gauge + gain);
      }
    } else if (this.stock < C.maxStock && this.gauge >= 1) {
      this.stock++; this.gauge = 0; this.events.push({ type: 'stock' });
    }

    // ---- boost pads
    if (this.padCool > 0) this.padCool -= dt;
    if (this.grounded && this.padCool <= 0) {
      for (var p = 0; p < t.pads.length; p++) {
        var pad = t.pads[p], rel = t.delta(this.s, pad.s);
        if (rel >= -0.5 && rel <= pad.len + 0.5 && Math.abs(this.d - pad.d) < pad.halfW + 0.45) {
          this.padT = C.padTime; this.padCool = 1.0;
          this.events.push({ type: 'pad' });
          break;
        }
      }
    }

    // ---- timers
    if (this.boostT > 0) this.boostT -= dt;
    if (this.kickT > 0) this.kickT -= dt;
    if (this.padT > 0) this.padT -= dt;
    if (this.wallCool > 0) this.wallCool -= dt;

    // ---- visuals (springy body, spinning wheels, opposite lock)
    var acc = (sp - spBefore) / Math.max(dt, 1e-4);
    this.accelVis = SD.damp(this.accelVis, SD.clamp(acc, -40, 40), 6, dt);
    this.roll = SD.damp(this.roll, SD.clamp(yaw * asp * 0.0042, -0.2, 0.2), 7, dt);
    this.pitch = SD.damp(this.pitch, SD.clamp(-this.accelVis * 0.0045, -0.12, 0.1) - (boosting ? 0.045 : 0), 8, dt);
    this.hopV += (-this.hop * 190 - this.hopV * 15) * dt;
    this.hop += this.hopV * dt;
    if (this.hop < -0.07) { this.hop = -0.07; this.hopV = Math.abs(this.hopV) * 0.3; }
    this.wheelSpin += sp * dt;
    this.steerVis = SD.damp(this.steerVis, this.drifting ? (-this.slip * 0.85 + this.steer * 0.22) : this.steer * 0.42, 12, dt);
    this.headYaw = SD.damp(this.headYaw, SD.clamp(this.steer * 0.35 - this.slip * 0.5, -0.6, 0.6), 6, dt);

    this.speed = sp;
  };

  /** Resolve overlap between two karts (equal mass discs). Returns the impact speed, or 0. */
  SD.collideKarts = function (a, b) {
    var dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, R = C.radius * 1.9;
    if (d2 >= R * R || d2 < 1e-6) return 0;
    if (Math.abs(a.y - b.y) > 1.5) return 0;
    var d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = (R - d) * 0.5;
    a.x -= nx * pen; a.z -= nz * pen; b.x += nx * pen; b.z += nz * pen;
    var avx = Math.sin(a.course) * a.speed, avz = Math.cos(a.course) * a.speed;
    var bvx = Math.sin(b.course) * b.speed, bvz = Math.cos(b.course) * b.speed;
    var rel = (bvx - avx) * nx + (bvz - avz) * nz;
    if (rel >= 0) return 0;
    var j = -rel * 0.62;
    avx -= nx * j; avz -= nz * j; bvx += nx * j; bvz += nz * j;
    apply(a, avx, avz); apply(b, bvx, bvz);
    return -rel;
  };
  function apply(k, vx, vz) {
    var sp = Math.hypot(vx, vz);
    if (k.speed < 0) return;
    if (sp > 1) {
      var want = Math.atan2(vx, vz), dlt = SD.clamp(SD.angDiff(want, k.course), -0.22, 0.22);
      k.course += dlt;
    }
    k.speed = Math.min(sp, k.speed + 3);
  }

  SD.Kart = Kart;
})(typeof window !== 'undefined' ? window : globalThis);
