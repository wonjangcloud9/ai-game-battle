/* SUNDRIFT GP — race rules: grid, countdown clock, laps, positions, rubber-banding. Pure logic. */
(function (root) {
  'use strict';
  var SD = root.SD, C = SD.CFG;

  SD.DIFFICULTY = [
    { id: 'easy', label: '쉬움', skill: [0.2, 0.55], top: [0.86, 0.92], slow: 0.17, fast: 0.03 },
    { id: 'normal', label: '보통', skill: [0.42, 0.82], top: [0.925, 0.978], slow: 0.15, fast: 0.05 },
    { id: 'hard', label: '어려움', skill: [0.72, 1.0], top: [0.975, 1.025], slow: 0.05, fast: 0.07 }
  ];
  SD.COUNTDOWN = 3.6;        // seconds of lights before GO

  function Race(track, opts) {
    opts = opts || {};
    this.track = track;
    this.laps = opts.laps || 3;
    this.difficulty = opts.difficulty === undefined ? 1 : opts.difficulty;
    this.rng = new SD.RNG(opts.seed || ((Date.now() & 0xffff) + 17));
    this.karts = [];
    this.ai = [];
    this.order = [];
    this.events = [];
    this.time = -SD.COUNTDOWN;
    this.playerFinished = false;
    this.finishedCount = 0;
    this.lastFinish = 0;
    this._setup();
  }
  var R = Race.prototype;

  R._setup = function () {
    var t = this.track, n = SD.RACERS.length, D = SD.DIFFICULTY[this.difficulty], rng = this.rng, i;
    // AI line-up: shuffle who starts where, the player takes the last slot
    var slots = [];
    for (i = 1; i < n; i++) slots.push(i);
    for (i = slots.length - 1; i > 0; i--) { var j = rng.int(0, i), tmp = slots[i]; slots[i] = slots[j]; slots[j] = tmp; }
    slots.push(0);
    for (i = 0; i < n; i++) {
      var k = new SD.Kart(t, i);
      k.racer = SD.RACERS[i];
      k.isPlayer = i === 0;
      this.karts.push(k);
    }
    for (var g = 0; g < n; g++) {
      var kart = this.karts[slots[g]], slot = SD.gridSlot(t, g);
      kart.reset(slot.s, slot.d);
      kart.gridPos = g; kart.gridD = slot.d;
      kart.rank = g + 1;
    }
    // spread skill evenly across the AI field (strongest need not start in front)
    var ranks = [];
    for (i = 0; i < n - 1; i++) ranks.push(i / (n - 2));
    for (i = ranks.length - 1; i > 0; i--) { var j2 = rng.int(0, i), t2 = ranks[i]; ranks[i] = ranks[j2]; ranks[j2] = t2; }
    for (i = 1; i < n; i++) {
      var q = ranks[i - 1];
      var kk = this.karts[i];
      kk.baseTop = SD.lerp(D.top[0], D.top[1], q);
      kk.topMult = kk.baseTop;
      this.ai[i] = new SD.AIDriver(kk, SD.lerp(D.skill[0], D.skill[1], q), rng);
    }
    this.player = this.karts[0];
    this.player.baseTop = 1;
    this.ai[0] = new SD.AIDriver(this.player, 0.7, rng);       // used after the flag (and for demo laps)
    this.ai[0].launchDelay = 0; this.ai[0].bias = 0;
    this.order = this.karts.slice();
    this._rank();
  };

  R.started = function () { return this.time >= 0; };

  /** Advance the race. playerInput: {throttle, brake, turn, drift, boost}. autopilot drives the player too. */
  R.update = function (dt, playerInput, autopilot) {
    var karts = this.karts, n = karts.length, t = this.track, L = t.length, i, j, k;
    this.time += dt;
    if (this.time < 0) return;
    var total = this.laps * L, D = SD.DIFFICULTY[this.difficulty], pdist = this.player.dist;

    for (i = 0; i < n; i++) {
      k = karts[i];
      var inp;
      if (k.isPlayer && !k.finished && !autopilot) inp = playerInput;
      else {
        if (i > 0 && !k.finished) {
          // gentle rubber band: leaders ease off, stragglers find a little extra
          var gap = k.dist - pdist, band = 1;
          if (gap > 20) band = 1 - Math.min(D.slow, (gap - 20) / 650);
          else if (gap < -30) band = 1 + Math.min(D.fast, (-gap - 30) / 600);
          k.topMult = k.baseTop * band;
        }
        inp = this.ai[i].think(dt, karts, this.time);
        if (k.finished) { inp.boost = false; inp.throttle = Math.min(inp.throttle, k.speed > 17 ? 0 : 0.7); inp.drift = false; }
      }
      k.update(dt, inp);
    }

    // kart-to-kart contact
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var hit = SD.collideKarts(karts[i], karts[j]);
      if (hit > 2.5) this.events.push({ type: 'bump', a: karts[i], b: karts[j], v: hit });
    }

    // laps + finish
    for (i = 0; i < n; i++) {
      k = karts[i];
      if (k.finished) continue;
      var done = Math.floor(k.dist / L);
      if (done > k.lapTimes.length && k.dist > 0) {
        var lt = this.time - k.lapStart;
        k.lapTimes.push(lt); k.lapStart = this.time;
        var best = lt < k.bestLap;
        if (best) k.bestLap = lt;
        if (k.lapTimes.length >= this.laps) {
          k.finished = true; k.finishTime = this.time; k.finishPos = ++this.finishedCount; this.lastFinish = this.time;
          if (k.isPlayer) this.playerFinished = true;
          this.events.push({ type: 'finish', kart: k, pos: k.finishPos, time: this.time });
        } else {
          this.events.push({ type: 'lap', kart: k, lap: k.lapTimes.length + 1, time: lt, best: best });
        }
      }
    }
    // everyone else is home and the player is nowhere near: call it so the race always ends
    var pl = this.player;
    if (!pl.finished && this.finishedCount >= n - 1 && this.time - this.lastFinish > 25) {
      pl.finished = true; pl.finishTime = this.time; pl.finishPos = ++this.finishedCount; this.playerFinished = true;
      this.events.push({ type: 'finish', kart: pl, pos: pl.finishPos, time: this.time, timeout: true });
    }
    this._rank();
  };

  R._rank = function () {
    var total = this.laps * this.track.length;
    this.order.sort(function (a, b) {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
    for (var i = 0; i < this.order.length; i++) this.order[i].rank = i + 1;
  };

  /** Lap number to show for a kart (1-based, clamped). */
  R.lapOf = function (k) { return SD.clamp(Math.floor(Math.max(k.dist, 0) / this.track.length) + 1, 1, this.laps); };

  /** Final classification; unfinished karts get a projected time. */
  R.results = function () {
    var total = this.laps * this.track.length, time = this.time;
    return this.order.map(function (k, i) {
      var tt = k.finished ? k.finishTime : time + Math.max(0, total - k.dist) / Math.max(18, C.topSpeed * (k.baseTop || 1) * 0.9);
      return { pos: i + 1, name: k.racer.name, isPlayer: k.isPlayer, time: tt, finished: k.finished, best: k.bestLap, color: k.racer.primary };
    }).sort(function (a, b) { return a.time - b.time; }).map(function (r, i) { r.pos = i + 1; return r; });
  };

  SD.Race = Race;
})(typeof window !== 'undefined' ? window : globalThis);
