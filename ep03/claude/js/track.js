/* SUNDRIFT GP — track: builds a closed circuit from straights + arcs, then answers spatial queries.
   Pure logic (no DOM / WebGL) so it can be exercised headlessly. */
(function (root) {
  'use strict';
  var SD = root.SD;
  var DEG = Math.PI / 180;

  /* Circuit blueprint. 'S' = straight (metres), 'A' = arc (degrees, + is a left turn, radius in metres).
     The two straights flagged `free` are solved so the loop closes exactly. */
  SD.TRACK_SPEC = {
    name: 'Sunny Cape',
    halfWidth: 7.5,
    runoff: 3.6,
    startAt: 118,
    segs: [
      { t: 'S', len: 190, id: 'main' },
      { t: 'A', ang: 96, r: 60, id: 't1' },
      { t: 'S', len: 46, id: 's2' },
      { t: 'A', ang: 162, r: 25, id: 't2' },
      { t: 'S', len: 45, id: 's3' },
      { t: 'A', ang: -112, r: 31, id: 't3' },
      { t: 'S', len: 40, id: 's4a' },
      { t: 'A', ang: 55, r: 40, id: 'c1' },
      { t: 'S', len: 28, id: 's4b' },
      { t: 'A', ang: -60, r: 40, id: 'c2' },
      { t: 'S', len: 40, id: 's4c', free: true },
      { t: 'A', ang: 103, r: 36, id: 't4' },
      { t: 'S', len: 140, id: 's5', free: true },
      { t: 'A', ang: 168, r: 47, id: 't5' },
      { t: 'S', len: 26, id: 's6' },
      { t: 'A', ang: -52, r: 42, id: 't6' }
    ],
    /* Elevation profile: [segment id, fraction along that segment, height in metres]. */
    elev: [
      ['main', 0.0, 4.0], ['main', 0.6, 4.0], ['main', 1.0, 4.2],
      ['t1', 0.6, 5.5], ['s2', 0.5, 7.5], ['t2', 0.5, 10.0], ['s3', 0.5, 12.5],
      ['t3', 0.5, 15.0], ['s4a', 0.5, 16.5], ['c1', 0.5, 17.6], ['c2', 0.5, 18.4], ['t4', 0.4, 18.8], ['t4', 1.0, 18.0],
      ['s5', 0.45, 13.0], ['s5', 1.0, 8.0], ['t5', 0.35, 6.0], ['t5', 0.8, 5.0],
      ['s6', 0.5, 4.4], ['t6', 0.6, 4.0]
    ],
    /* Boost pads: [segment id, fraction, lateral offset (+left), length]. */
    pads: [
      ['main', 0.93, -3.2, 9], ['s3', 0.3, 3.0, 9], ['s5', 0.22, 0.0, 10], ['s5', 0.62, -3.4, 9], ['s6', 0.2, 3.2, 8]
    ]
  };

  function Track(spec) {
    this.spec = spec || SD.TRACK_SPEC;
    this.build();
  }

  Track.prototype.build = function () {
    var spec = this.spec, segs = spec.segs, i, k;

    // ---- 1. closure: solve the two free straights
    function endOf(lenA, lenB) {
      var x = 0, y = 0, a = 0, freeIdx = 0;
      for (var j = 0; j < segs.length; j++) {
        var s = segs[j];
        if (s.t === 'S') {
          var L = s.free ? (freeIdx++ === 0 ? lenA : lenB) : s.len;
          x += Math.cos(a) * L; y += Math.sin(a) * L;
        } else {
          var th = s.ang * DEG, sg = th >= 0 ? 1 : -1;
          var cx = x - Math.sin(a) * s.r * sg, cy = y + Math.cos(a) * s.r * sg;
          a += th;
          x = cx + Math.sin(a) * s.r * sg; y = cy - Math.cos(a) * s.r * sg;
        }
      }
      return [x, y, a];
    }
    var e0 = endOf(0, 0), ea = endOf(1, 0), eb = endOf(0, 1);
    var dax = ea[0] - e0[0], day = ea[1] - e0[1], dbx = eb[0] - e0[0], dby = eb[1] - e0[1];
    var det = dax * dby - day * dbx;
    var lenA = (-e0[0] * dby + e0[1] * dbx) / det;
    var lenB = (-dax * e0[1] + day * e0[0]) / det;
    this.freeLens = [lenA, lenB];
    this.turnTotal = e0[2] / DEG;

    // ---- 2. dense polyline in the design plane (u right, v up), remembering where each segment starts
    var STEP = 0.5, pts = [], segStart = {}, segLen = {}, run = 0;
    var x = 0, y = 0, a = 0, fi = 0;
    for (i = 0; i < segs.length; i++) {
      var s = segs[i], L, n;
      segStart[s.id] = run;
      if (s.t === 'S') {
        L = s.free ? (fi++ === 0 ? lenA : lenB) : s.len;
        n = Math.max(1, Math.round(L / STEP));
        for (k = 0; k < n; k++) pts.push([x + Math.cos(a) * L * k / n, y + Math.sin(a) * L * k / n]);
        x += Math.cos(a) * L; y += Math.sin(a) * L;
      } else {
        var th = s.ang * DEG, sg = th >= 0 ? 1 : -1;
        var cx = x - Math.sin(a) * s.r * sg, cy = y + Math.cos(a) * s.r * sg;
        L = Math.abs(th) * s.r;
        n = Math.max(1, Math.round(L / STEP));
        for (k = 0; k < n; k++) {
          var aa = a + th * k / n;
          pts.push([cx + Math.sin(aa) * s.r * sg, cy - Math.cos(aa) * s.r * sg]);
        }
        a += th;
        x = cx + Math.sin(a) * s.r * sg; y = cy - Math.cos(a) * s.r * sg;
      }
      segLen[s.id] = L;
      run += L;
    }
    var designLen = run;
    this.closureError = Math.hypot(x, y);

    // ---- 3. soften the straight/arc joints (Laplacian smoothing keeps the loop closed)
    var P = pts.length, bufx = new Float64Array(P), bufy = new Float64Array(P), tx2 = new Float64Array(P), ty2 = new Float64Array(P);
    for (i = 0; i < P; i++) { bufx[i] = pts[i][0]; bufy[i] = pts[i][1]; }
    for (k = 0; k < 220; k++) {
      for (i = 0; i < P; i++) {
        var im = i === 0 ? P - 1 : i - 1, ip = i === P - 1 ? 0 : i + 1;
        tx2[i] = bufx[i] * 0.5 + (bufx[im] + bufx[ip]) * 0.25;
        ty2[i] = bufy[i] * 0.5 + (bufy[im] + bufy[ip]) * 0.25;
      }
      var sw = bufx; bufx = tx2; tx2 = sw; sw = bufy; bufy = ty2; ty2 = sw;
    }

    // ---- 4. resample at uniform arc length, rotated so that s = 0 sits on the start line
    var cum = new Float64Array(P + 1);
    for (i = 0; i < P; i++) {
      var j = (i + 1) % P;
      cum[i + 1] = cum[i] + Math.hypot(bufx[j] - bufx[i], bufy[j] - bufy[i]);
    }
    var total = cum[P];
    var N = Math.round(total / 1.0);
    var ds = total / N;
    var scale = total / designLen;
    var startDist = spec.startAt * scale;
    this.N = N; this.ds = ds; this.length = total;
    this.halfWidth = spec.halfWidth;
    this.wallOffset = spec.halfWidth + spec.runoff;
    var px = this.px = new Float64Array(N), pz = this.pz = new Float64Array(N), py = this.py = new Float64Array(N);
    var seg = 0;
    for (i = 0; i < N; i++) {
      var d = (startDist + i * ds) % total;
      if (i === 0 || d < cum[seg]) seg = 0;
      while (seg < P - 1 && cum[seg + 1] < d) seg++;
      var f = (d - cum[seg]) / Math.max(1e-9, cum[seg + 1] - cum[seg]);
      var q = (seg + 1) % P;
      px[i] = bufx[seg] + (bufx[q] - bufx[seg]) * f;      // world x = u
      pz[i] = -(bufy[seg] + (bufy[q] - bufy[seg]) * f);   // world z = -v
    }
    // centre the circuit around the origin
    var minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (i = 0; i < N; i++) { minx = Math.min(minx, px[i]); maxx = Math.max(maxx, px[i]); minz = Math.min(minz, pz[i]); maxz = Math.max(maxz, pz[i]); }
    var ox = (minx + maxx) / 2, oz = (minz + maxz) / 2;
    for (i = 0; i < N; i++) { px[i] -= ox; pz[i] -= oz; }
    this.bounds = { minx: minx - ox, maxx: maxx - ox, minz: minz - oz, maxz: maxz - oz };

    // design distance -> s
    var self = this;
    this.sOf = function (id, frac) {
      var dd = (segStart[id] + segLen[id] * (frac || 0)) * scale - startDist;
      return SD.mod(dd, total);
    };
    this.segLen = segLen;

    // ---- 5. elevation: periodic piecewise-cubic through the control heights, then smoothed
    var ctl = spec.elev.map(function (e) { return [self.sOf(e[0], e[1]), e[2]]; }).sort(function (p, q2) { return p[0] - q2[0]; });
    var C = ctl.length;
    for (i = 0; i < N; i++) {
      var sv = i * ds, c1 = 0;
      for (k = 0; k < C; k++) if (ctl[k][0] <= sv) c1 = k + 1;
      var i1 = SD.mod(c1 - 1, C), i2 = c1 % C;
      var s1 = ctl[i1][0], s2 = ctl[i2][0];
      if (c1 === 0) s1 -= total;
      if (c1 === C) s2 += total;
      var u = (sv - s1) / Math.max(1e-6, s2 - s1);
      u = u * u * (3 - 2 * u);
      py[i] = ctl[i1][1] + (ctl[i2][1] - ctl[i1][1]) * u;
    }
    var tmp = new Float64Array(N);
    for (k = 0; k < 260; k++) {
      for (i = 0; i < N; i++) tmp[i] = py[i] * 0.5 + (py[i === 0 ? N - 1 : i - 1] + py[i === N - 1 ? 0 : i + 1]) * 0.25;
      py.set(tmp);
    }

    // ---- 6. frames: tangent, left normal, heading, curvature, slope
    var tx = this.tx = new Float64Array(N), tz = this.tz = new Float64Array(N);
    var nx = this.nx = new Float64Array(N), nz = this.nz = new Float64Array(N);
    var hd = this.hd = new Float64Array(N), kap = this.kap = new Float64Array(N), slope = this.slope = new Float64Array(N);
    for (i = 0; i < N; i++) {
      var a0 = (i + N - 1) % N, a1 = (i + 1) % N;
      var dx = px[a1] - px[a0], dz = pz[a1] - pz[a0], l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l; tz[i] = dz / l;
      hd[i] = Math.atan2(tx[i], tz[i]);
      nx[i] = Math.cos(hd[i]); nz[i] = -Math.sin(hd[i]);   // left of travel
      slope[i] = (py[a1] - py[a0]) / (2 * ds);
    }
    for (i = 0; i < N; i++) kap[i] = SD.wrapAngle(hd[(i + 1) % N] - hd[(i + N - 1) % N]) / (2 * ds);
    // smoothed curvature variants used by the AI
    this.kapS = this._smooth(kap, 8);
    this.kapL = this._smooth(kap, 26);

    // ---- 7. racing line (lateral offset per sample, + = left): outside - apex - outside
    var line = this.line = new Float64Array(N), maxOff = spec.halfWidth - 2.3;
    for (i = 0; i < N; i++) {
      var near = this.kapS[i];
      var wide = (this.kapL[(i + 34) % N] + this.kapL[(i + N - 34) % N]) * 0.5;
      var v = (near * 1.55 - wide * 1.0) * 135;
      line[i] = maxOff * Math.tanh(v / maxOff);
    }
    this.line = this._smooth(line, 6);

    // ---- 8. boost pads
    this.pads = spec.pads.map(function (p) {
      return { s: self.sOf(p[0], p[1]), d: p[2], len: p[3], halfW: 2.1 };
    });
  };

  Track.prototype._smooth = function (arr, radius) {
    var N = arr.length, out = new Float64Array(N), i, k;
    for (i = 0; i < N; i++) {
      var sum = 0, wsum = 0;
      for (k = -radius; k <= radius; k++) {
        var w = 1 - Math.abs(k) / (radius + 1);
        sum += arr[(i + k + N) % N] * w; wsum += w;
      }
      out[i] = sum / wsum;
    }
    return out;
  };

  /** Nearest centre-line sample, searching `win` samples either side of `hint` (or everything when hint < 0). */
  Track.prototype.nearest = function (x, z, hint, win) {
    var N = this.N, px = this.px, pz = this.pz, best = 0, bd = Infinity, i, dx, dz, d2;
    if (hint === undefined || hint < 0) {
      for (i = 0; i < N; i += 3) { dx = x - px[i]; dz = z - pz[i]; d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } }
      hint = best; win = 4; bd = Infinity;
    }
    win = win || 12;
    for (var k = -win; k <= win; k++) {
      i = hint + k;
      if (i < 0) i += N; else if (i >= N) i -= N;
      dx = x - px[i]; dz = z - pz[i]; d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = i; }
    }
    return best;
  };

  /** Project a world position onto the circuit. out = { i, s, d, y } (d: lateral offset, + = left). */
  Track.prototype.locate = function (x, z, hint, out) {
    var i = this.nearest(x, z, hint, 14);
    var dx = x - this.px[i], dz = z - this.pz[i];
    var along = dx * this.tx[i] + dz * this.tz[i];
    out.i = i;
    out.d = dx * this.nx[i] + dz * this.nz[i];
    var s = i * this.ds + along;
    if (s < 0) s += this.length; else if (s >= this.length) s -= this.length;
    out.s = s;
    out.y = this.heightAt(s);
    return out;
  };

  Track.prototype.heightAt = function (s) {
    var f = s / this.ds, i = Math.floor(f), N = this.N;
    f -= i;
    i = ((i % N) + N) % N;
    var j = i + 1 === N ? 0 : i + 1;
    return this.py[i] + (this.py[j] - this.py[i]) * f;
  };

  /** Interpolated sample of any per-sample array at distance s. */
  Track.prototype.sample = function (arr, s) {
    var f = s / this.ds, i = Math.floor(f), N = this.N;
    f -= i;
    i = ((i % N) + N) % N;
    var j = i + 1 === N ? 0 : i + 1;
    return arr[i] + (arr[j] - arr[i]) * f;
  };

  /** World position at distance s with lateral offset d. out = [x, y, z]. */
  Track.prototype.pointAt = function (s, d, out) {
    var f = s / this.ds, i = Math.floor(f), N = this.N;
    f -= i;
    i = ((i % N) + N) % N;
    var j = i + 1 === N ? 0 : i + 1;
    var nx = this.nx[i] + (this.nx[j] - this.nx[i]) * f, nz = this.nz[i] + (this.nz[j] - this.nz[i]) * f;
    out[0] = this.px[i] + (this.px[j] - this.px[i]) * f + nx * d;
    out[1] = this.py[i] + (this.py[j] - this.py[i]) * f;
    out[2] = this.pz[i] + (this.pz[j] - this.pz[i]) * f + nz * d;
    return out;
  };

  Track.prototype.headingAt = function (s) {
    var i = SD.mod(Math.round(s / this.ds), this.N);
    return this.hd[i];
  };

  /** Signed distance from s0 forward to s1 along the lap, in (-L/2, L/2]. */
  Track.prototype.delta = function (s1, s0) {
    var d = s1 - s0, L = this.length;
    if (d > L / 2) d -= L; else if (d < -L / 2) d += L;
    return d;
  };

  /** Distance from (x,z) to the centre line anywhere on the circuit (slow path, used at build time). */
  Track.prototype.distanceTo = function (x, z, out) {
    var i = this.nearest(x, z, -1);
    var dx = x - this.px[i], dz = z - this.pz[i];
    if (out) { out.i = i; out.d = dx * this.nx[i] + dz * this.nz[i]; }
    return Math.hypot(dx, dz);
  };

  SD.Track = Track;
})(typeof window !== 'undefined' ? window : globalThis);
