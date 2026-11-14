/* SUNDRIFT GP — AI drivers. They use exactly the same kart physics as the player: they chase a point
   on the racing line (pure pursuit), hold a drift through tight corners (which fills their gauge) and
   fire boosters on the straights. Pure logic. */
(function (root) {
  'use strict';
  var SD = root.SD, C = SD.CFG;

  var P = [0, 0, 0];

  /* skill 0..1 shapes cornering confidence, drift usage and reactions */
  function AIDriver(kart, skill, rng) {
    this.kart = kart;
    this.track = kart.track;
    this.skill = skill;
    this.rng = rng;
    this.bias = rng.range(-1.2, 1.2);          // personal line offset (m)
    this.lineGain = rng.range(0.7, 1.0);
    this.avoid = 0;
    this.wander = rng.next() * 10;
    this.stuckT = 0;
    this.boostHold = 0;
    this.launchDelay = rng.range(0.02, 0.26) * (1.4 - skill * 0.6);
    this.noDrift = false;                      // balance testing: a driver who never slides / never boosts
    this.noBoost = false;
    this.input = { throttle: 0, brake: 0, turn: 0, drift: false, boost: false };
  }
  var A = AIDriver.prototype;

  /** others: array of karts (for traffic). raceTime: seconds since GO (negative before). */
  A.think = function (dt, others, raceTime) {
    var k = this.kart, t = this.track, L = t.length, inp = this.input, HW = t.halfWidth;
    inp.boost = false;
    if (raceTime < this.launchDelay) { inp.throttle = 0; inp.brake = 0; inp.turn = 0; inp.drift = false; return inp; }
    var sp = Math.max(k.speed, 3);

    // ---- traffic: slide sideways around a kart that sits just ahead
    var want = 0, i;
    for (i = 0; i < others.length; i++) {
      var o = others[i];
      if (o === k) continue;
      var ahead = t.delta(o.s, k.s);
      if (ahead > 0.5 && ahead < 9 + sp * 0.22 && Math.abs(o.d - k.d) < 2.5 && o.speed < sp + 2) {
        var side = (k.d - o.d) >= 0 ? 1 : -1;
        if (Math.abs(o.d + side * 2.9) > HW - 1.6) side = -side;
        want = side * 2.9;
        break;
      }
    }
    this.avoid = SD.damp(this.avoid, want, want ? 4 : 1.5, dt);
    this.wander += dt;

    // ---- aim at a point on the racing line ahead (pure pursuit -> desired yaw rate)
    var look = 6 + sp * 0.34;
    var sT = SD.mod(k.s + look, L);
    var off = t.sample(t.line, sT) * this.lineGain + this.bias + this.avoid + Math.sin(this.wander * 0.37) * 0.4;
    off = SD.clamp(off, -(HW - 2.4), HW - 2.4);
    if (raceTime < 3.6 && k.gridD !== undefined) off = SD.lerp(k.gridD, off, SD.smoothstep(1.2, 3.6, raceTime));   // hold your lane off the line
    t.pointAt(sT, off, P);
    var err = SD.angDiff(Math.atan2(P[0] - k.x, P[2] - k.z), k.course);
    var wDes = 2 * sp * Math.sin(SD.clamp(err, -1.3, 1.3)) / look;
    // stay off the kerbs
    var edge = HW - 1.4;
    if (k.d > edge) wDes -= (k.d - edge) * 0.55; else if (k.d < -edge) wDes -= (k.d + edge) * 0.55;

    // ---- how fast may we go? brake for whatever tightens ahead
    var grip = this.noDrift ? 21 : SD.lerp(28, 44, this.skill);   // lateral m/s^2 the driver trusts
    var target = 99, dd;
    for (dd = 0; dd <= 70; dd += 5) {
      var kap = Math.abs(t.sample(t.kapS, SD.mod(k.s + dd, L)));
      var vc = Math.sqrt(grip / Math.max(kap, 1e-4));
      var allowed = Math.sqrt(vc * vc + 2 * C.brake * 0.6 * dd);
      if (allowed < target) target = allowed;
    }
    inp.throttle = 1; inp.brake = 0;
    if (k.speed > target + 1.5) { inp.throttle = 0; inp.brake = SD.clamp01((k.speed - target) / 6); }
    else if (k.speed > target) inp.throttle = 0.4;

    // ---- steering + drifting (invert the kart's own steering maps)
    var scale = SD.clamp(sp / 22, 0.62, 1.04);
    var cap = SD.lerp(C.turnLow, C.turnHigh, SD.clamp01((sp - 6) / (C.topSpeed - 6)));
    if (sp > C.topSpeed) cap *= Math.max(0.78, C.topSpeed / sp);
    var minDrift = C.driftWide * scale, turn;
    if (!k.drifting) {
      turn = SD.clamp(wDes / cap, -1, 1);
      inp.drift = false;
      var kapNear = t.sample(t.kapS, SD.mod(k.s + sp * 0.16, L));
      var kapFar = t.sample(t.kapS, SD.mod(k.s + sp * 0.62, L));
      var dir = kapNear > 0 ? 1 : -1;
      var need = Math.abs(kapNear) * sp;                 // yaw rate the bend asks for
      var startAt = SD.lerp(0.95, 0.66, this.skill);
      if (!this.noDrift && sp > C.driftMinSpeed + 1 && need > Math.max(startAt, minDrift * 1.06) && wDes * dir > minDrift * 0.85 &&
          kapNear * kapFar > 0 && Math.abs(kapFar) * sp > minDrift) {
        inp.drift = true;
        turn = dir * 0.4;
      }
    } else {
      var d2 = k.driftDir, wd = wDes * d2 / scale;       // wanted rate, measured in the slide's direction
      var inward = wd >= C.driftMid ? (wd - C.driftMid) / (C.driftTight - C.driftMid) : -(C.driftMid - wd) / (C.driftMid - C.driftWide);
      turn = SD.clamp(inward, -1, 1) * d2;
      var kapNow = t.sample(t.kapS, SD.mod(k.s + sp * 0.12, L));
      inp.drift = kapNow * d2 * sp > minDrift * 0.72 && wd > C.driftWide * 0.5;
    }
    inp.turn = turn;

    // ---- boosters: spend them where the road is straight enough
    if (!this.noBoost && k.stock > 0 && k.boostT <= 0 && !k.drifting && raceTime > 1.2) {
      var straight = true;
      for (dd = 0; dd <= 64; dd += 8) if (Math.abs(t.sample(t.kapS, SD.mod(k.s + dd, L))) > 0.011) { straight = false; break; }
      if (straight && Math.abs(err) < 0.12) {
        this.boostHold += dt;
        if (this.boostHold > 0.15 + (1 - this.skill) * 0.5) { inp.boost = true; this.boostHold = 0; }
      } else this.boostHold = 0;
    }

    // ---- unstick
    if (raceTime > 2 && Math.abs(k.speed) < 2.5) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 1.6) {
      var keepDist = k.dist, keepStock = k.stock, keepGauge = k.gauge;
      var fin = k.finished, ft = k.finishTime, laps = k.lapTimes.slice(), ls = k.lapStart, bl = k.bestLap, fx = k.fx;
      k.reset(k.s, SD.clamp(k.d, -4, 4));
      k.dist = keepDist; k.stock = keepStock; k.gauge = keepGauge;
      k.finished = fin; k.finishTime = ft; k.lapTimes = laps; k.lapStart = ls; k.bestLap = bl; k.fx = fx;
      k.speed = 10;
      this.stuckT = 0;
    }
    return inp;
  };

  SD.AIDriver = AIDriver;
})(typeof window !== 'undefined' ? window : globalThis);
