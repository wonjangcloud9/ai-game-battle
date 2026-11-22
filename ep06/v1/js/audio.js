'use strict';
/* 등불지기 — audio: synthesized WebAudio SFX + BGM (optional MP3 files via HTMLAudio, procedural music otherwise).
   Works from file:// (no fetch / decodeAudioData). Every public call is safe before init() and never throws. */
(function () {
  const G = window.G;
  const A = (G.Audio = {
    vol: { master: 1, bgm: 0.5, sfx: 0.7 },
    ready: false,
    base: 'assets/bgm/',
    // Real music files, if any: { town: true } → base + 'town.mp3', or { town: 'name.ogg' }. Tracks not listed use the built-in procedural music.
    files: {},
  });
  let ctx = null, master = null, comp = null, sfxBus = null, musBus = null, reverb = null, noiseBuf = null;
  let want = null, curId = null, cur = null; // requested bgm id · playing id · current sfx call context
  let track = null;                          // current music track object { stop(fade), tick(now), setHidden(h) }
  const dying = [];                          // tracks fading out
  let duckMul = 1, duckUntil = 0, timer = null;
  const last = {};
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  // audio must never break the game: every entry point swallows errors (A.onError is a test hook)
  const safe = (fn) => function () { try { return fn.apply(this, arguments); } catch (e) { if (A.onError) { try { A.onError(e); } catch (e2) {} } } };

  // ------------------------------------------------------------ context / graph
  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = A.vol.master;
    // final soft clipper: transparent below 0.6, saturates smoothly toward 1 (never hard-clips when sfx + music stack up)
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(2049);
    for (let i = 0; i < 2049; i++) { const x = (i - 1024) / 1024 * 2, ax = Math.abs(x); curve[i] = (x < 0 ? -1 : 1) * (ax < 0.6 ? ax : 0.6 + 0.4 * Math.tanh((ax - 0.6) / 0.4)); }
    const pre = ctx.createGain(); pre.gain.value = 0.5; // map ±2 input range onto the curve table
    const post = ctx.createGain(); post.gain.value = 1;
    shaper.curve = curve; shaper.oversample = '2x';
    master.connect(pre); pre.connect(shaper); shaper.connect(post); post.connect(ctx.destination);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.16;
    const sfxOut = ctx.createGain(); sfxOut.gain.value = 0.78; // headroom after the compressor's automatic make-up gain
    comp.connect(sfxOut); sfxOut.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = A.vol.sfx; sfxBus.connect(comp);
    musBus = ctx.createGain(); musBus.gain.value = A.vol.bgm; musBus.connect(master);
    // shared noise (2 s white) and a small generated reverb impulse
    const sr = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const len = Math.floor(sr * 1.9), ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) { const k = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.6) * (i < 400 ? i / 400 : 1); }
    }
    reverb = ctx.createConvolver(); reverb.buffer = ir;
    const rvOut = ctx.createGain(); rvOut.gain.value = 0.55;
    reverb.connect(rvOut); rvOut.connect(master);
    return true;
  }
  const unlock = safe(() => { if (ctx && ctx.state === 'suspended' && !document.hidden) ctx.resume(); if (track && track.kick) track.kick(); });

  A.init = safe(function () {
    if (!ctx) {
      if (!build()) return;
      A.ready = true;
      timer = setInterval(safe(tick), 50);
      window.addEventListener('pointerdown', unlock, true);
      window.addEventListener('keydown', unlock, true);
      document.addEventListener('visibilitychange', safe(onVis));
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
    if (want !== curId) startBgm(want);
  });

  A.setVol = safe(function (kind, v) {
    if (!(kind in A.vol)) return;
    A.vol[kind] = clamp01(+v || 0);
    if (!ctx) return;
    const t = ctx.currentTime;
    if (kind === 'master') master.gain.setTargetAtTime(A.vol.master, t, 0.02);
    else if (kind === 'sfx') sfxBus.gain.setTargetAtTime(A.vol.sfx, t, 0.02);
    else musBus.gain.setTargetAtTime(A.vol.bgm * duckMul, t, 0.03);
    if (track && track.applyVol) track.applyVol();
  });

  A.duck = safe(function (amount, seconds) {
    if (!ctx) return;
    duckMul = clamp01(1 - (amount === undefined ? 0.6 : amount));
    duckUntil = ctx.currentTime + (seconds || 1);
    musBus.gain.setTargetAtTime(A.vol.bgm * duckMul, ctx.currentTime, 0.06);
  });

  function onVis() {
    if (!ctx) return;
    if (document.hidden) { ctx.suspend(); if (track && track.setHidden) track.setHidden(true); }
    else { ctx.resume(); if (track && track.setHidden) track.setHidden(false); }
  }

  function tick() {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (duckMul < 1 && now > duckUntil) { duckMul = 1; musBus.gain.setTargetAtTime(A.vol.bgm, now, 0.25); }
    if (track) track.tick(now);
    for (let i = dying.length - 1; i >= 0; i--) if (dying[i].tick(now) === false) dying.splice(i, 1);
  }

  // ------------------------------------------------------------ sfx engine
  // cur = { t, rate, out } for the sound being built.  T = tone voice, N = filtered-noise voice.
  // (type, f, f2, t, d, v, a, h): start freq → end freq (exp glide), offset t, duration d, peak v, attack a, hold fraction h
  function env(g, t0, d, v, a, h) {
    a = Math.min(a || 0.004, d * 0.9);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + a);
    if (h) g.gain.linearRampToValueAtTime(v, t0 + Math.max(a, d * h));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  }
  function T(type, f, f2, t, d, v, a, h) {
    const o = ctx.createOscillator(), g = ctx.createGain(), t0 = cur.t + t;
    const fa = Math.max(20, f * cur.rate), fb = Math.max(20, (f2 || f) * cur.rate);
    o.type = type;
    o.frequency.setValueAtTime(fa, t0);
    if (fb !== fa) o.frequency.exponentialRampToValueAtTime(fb, t0 + d);
    env(g, t0, d, v, a, h);
    o.connect(g); g.connect(cur.out);
    o.start(t0); o.stop(t0 + d + 0.04);
    return g;
  }
  function N(ftype, f, f2, q, t, d, v, a, h) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = cur.t + t;
    s.buffer = noiseBuf; s.loop = true;
    fl.type = ftype; fl.Q.value = q || 0.8;
    fl.frequency.setValueAtTime(Math.max(30, f), t0);
    if (f2 && f2 !== f) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + d);
    env(g, t0, d, v, a, h);
    s.connect(fl); fl.connect(g); g.connect(cur.out);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + d + 0.04);
    return g;
  }
  // brass-ish: two detuned saws through a moving lowpass (fanfares, roars)
  function B(f, f2, t, d, v, a, c1, c2, h) {
    const fl = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = cur.t + t;
    fl.type = 'lowpass'; fl.Q.value = 1.2;
    fl.frequency.setValueAtTime(c1 || 700, t0);
    fl.frequency.exponentialRampToValueAtTime(c2 || 2200, t0 + Math.min(d, 0.12));
    fl.frequency.exponentialRampToValueAtTime(Math.max(200, (c1 || 700) * 0.9), t0 + d);
    env(g, t0, d, v, a || 0.02, h === undefined ? 0.6 : h);
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.detune.value = i ? 9 : -9;
      o.frequency.setValueAtTime(f * cur.rate, t0);
      if (f2 && f2 !== f) o.frequency.exponentialRampToValueAtTime(f2 * cur.rate, t0 + d);
      o.connect(fl); o.start(t0); o.stop(t0 + d + 0.04);
    }
    fl.connect(g); g.connect(cur.out);
    return g;
  }
  // amplitude wobble on a voice gain (growl / buzz)
  function wob(g, hz, depth, t, d) {
    const l = ctx.createOscillator(), lg = ctx.createGain(), t0 = cur.t + t;
    l.type = 'sine'; l.frequency.value = hz; lg.gain.value = depth;
    l.connect(lg); lg.connect(g.gain); l.start(t0); l.stop(t0 + d + 0.04);
  }
  const SFX = {};
  const def = (name, fn, rev, gain) => { SFX[name] = { fn, rev: rev || 0, gain: gain === undefined ? 1 : gain }; };

  A.sfx = safe(function (name, opts) {
    const s = SFX[name];
    if (!s || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (last[name] !== undefined && now - last[name] < 0.04) return;
    last[name] = now;
    opts = opts || {};
    const out = ctx.createGain();
    out.gain.value = clamp01(opts.vol === undefined ? 1 : opts.vol) * s.gain;
    let tail = out;
    if (opts.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); out.connect(p); tail = p; }
    tail.connect(sfxBus);
    if (s.rev) { const rs = ctx.createGain(); rs.gain.value = s.rev; tail.connect(rs); rs.connect(reverb); }
    cur = { t: now + 0.005, rate: (opts.rate || 1) * (1 + (Math.random() * 2 - 1) * 0.04), out };
    s.fn();
    cur = null;
  });

  // ------------------------------------------------------------ sfx: UI
  const R = Math.random;
  const seq = (type, notes, t, step, d, v) => notes.forEach((f, i) => T(type, f, 0, t + i * step, d, v));
  def('click', () => { T('square', 1400, 900, 0, 0.05, 0.1); T('sine', 2200, 1800, 0, 0.04, 0.12); }, 0, 0.7);
  def('open', () => { T('sine', 520, 880, 0, 0.12, 0.22); T('triangle', 780, 1320, 0.02, 0.1, 0.08); N('highpass', 3000, 6000, 0.7, 0, 0.1, 0.05); }, 0.1, 0.8);
  def('close', () => { T('sine', 820, 440, 0, 0.11, 0.2); T('triangle', 1230, 660, 0, 0.08, 0.07); }, 0.1, 0.8);
  def('tab', () => { T('triangle', 900, 1150, 0, 0.06, 0.18); }, 0, 0.7);
  def('error', () => { T('square', 196, 185, 0, 0.1, 0.12); T('square', 165, 150, 0.11, 0.15, 0.12); T('sine', 98, 82, 0, 0.26, 0.2); }, 0, 0.8);
  def('equip', () => { N('bandpass', 2600, 1200, 2, 0, 0.09, 0.32, 0.002); T('triangle', 480, 720, 0.03, 0.1, 0.2); T('sine', 1568, 0, 0.05, 0.2, 0.08); T('sine', 2349, 0, 0.05, 0.14, 0.04); }, 0.15);
  def('buy', () => { seq('square', [988, 1319], 0, 0.07, 0.16, 0.08); seq('sine', [1976, 2637], 0, 0.07, 0.22, 0.08); }, 0.15);
  def('sell', () => { seq('square', [1319, 1568, 2093], 0, 0.055, 0.12, 0.07); N('bandpass', 5000, 7000, 3, 0, 0.16, 0.08, 0.01); T('sine', 4186, 0, 0.11, 0.2, 0.04); }, 0.15);
  def('coin', () => { T('square', 1568, 0, 0, 0.05, 0.08); T('square', 2093, 0, 0.05, 0.2, 0.08); T('sine', 4186, 0, 0.05, 0.16, 0.04); }, 0.1, 1.3);
  def('pickup', () => { T('sine', 700, 1400, 0, 0.09, 0.2); T('triangle', 1400, 2100, 0.05, 0.09, 0.1); }, 0.1, 0.8);
  def('potion', () => { T('sine', 300, 700, 0, 0.08, 0.26); T('sine', 400, 900, 0.09, 0.08, 0.22); T('sine', 500, 1250, 0.18, 0.13, 0.2); N('bandpass', 1200, 2400, 4, 0, 0.3, 0.06, 0.05); }, 0.2);
  def('quest_accept', () => { seq('triangle', [523, 784], 0, 0.1, 0.26, 0.2); seq('sine', [1047, 1568], 0, 0.1, 0.3, 0.1); }, 0.25);
  def('quest_done', () => {
    seq('triangle', [523, 659, 784], 0, 0.09, 0.2, 0.2); seq('square', [523, 659, 784], 0, 0.09, 0.14, 0.05);
    T('triangle', 1047, 0, 0.27, 0.6, 0.24, 0.005, 0.35); T('sine', 1319, 0, 0.27, 0.6, 0.12, 0.005, 0.35); T('sine', 1568, 0, 0.27, 0.6, 0.1, 0.005, 0.35);
    N('highpass', 6000, 9000, 0.7, 0.27, 0.45, 0.05, 0.02);
  }, 0.35);
  def('levelup', () => {
    seq('triangle', [523, 659, 784, 1047, 1319, 1568, 2093], 0, 0.07, 0.22, 0.17); seq('sine', [1047, 1319, 1568, 2093, 2637, 3136, 4186], 0, 0.07, 0.2, 0.07);
    [1047, 1319, 1568, 2093].forEach((f) => T('sine', f, 0, 0.5, 0.75, 0.1, 0.03, 0.3));
    T('triangle', 262, 0, 0.5, 0.7, 0.16, 0.02, 0.3);
    for (let i = 0; i < 7; i++) T('sine', 2600 + R() * 3200, 0, 0.5 + i * 0.07 + R() * 0.03, 0.14, 0.035);
    N('highpass', 5000, 9000, 0.7, 0.45, 0.7, 0.06, 0.1);
  }, 0.45);
  def('jobup', () => {
    const ch = [[262, 330, 392], [349, 440, 523], [392, 494, 587]];
    ch.forEach((c, i) => { c.forEach((f) => B(f, 0, i * 0.26, 0.26, 0.11, 0.02, 700, 2600)); T('sine', 110, 55, i * 0.26, 0.22, 0.5, 0.004); N('lowpass', 500, 150, 0.8, i * 0.26, 0.14, 0.25, 0.003); });
    [523, 659, 784, 1047].forEach((f) => { B(f, 0, 0.8, 1.25, 0.1, 0.03, 900, 3200, 0.55); T('sine', f * 2, 0, 0.8, 1.2, 0.04, 0.05, 0.4); });
    T('sine', 131, 65, 0.8, 0.6, 0.7, 0.004); N('highpass', 4000, 8000, 0.7, 0.78, 1.2, 0.14, 0.02); N('lowpass', 900, 200, 0.8, 0.8, 0.5, 0.3, 0.004);
    for (let i = 0; i < 10; i++) T('sine', 2000 + R() * 3500, 0, 0.9 + i * 0.09 + R() * 0.04, 0.16, 0.035);
  }, 0.5);
  def('skill_up', () => { T('sine', 880, 1760, 0, 0.12, 0.18); T('triangle', 1320, 2640, 0.06, 0.15, 0.12); T('sine', 3520, 0, 0.14, 0.2, 0.05); }, 0.25);
  def('enh_ok', () => {
    N('bandpass', 4000, 0, 3, 0, 0.04, 0.4, 0.001); T('sine', 2400, 0, 0, 0.55, 0.2, 0.002); T('sine', 3610, 0, 0, 0.38, 0.1, 0.002); T('sine', 5230, 0, 0, 0.22, 0.06, 0.002); T('sine', 300, 160, 0, 0.07, 0.3, 0.002);
    seq('sine', [1568, 2093, 2637, 3136], 0.16, 0.06, 0.25, 0.09); seq('triangle', [784, 1047, 1319, 1568], 0.16, 0.06, 0.2, 0.08);
  }, 0.4);
  def('enh_fail', () => { T('sine', 180, 70, 0, 0.2, 0.55, 0.003); N('lowpass', 600, 200, 1, 0, 0.13, 0.4, 0.003); N('highpass', 3000, 1500, 0.7, 0.1, 0.5, 0.13, 0.02); T('sawtooth', 300, 110, 0.1, 0.34, 0.05); }, 0.15);
  def('talk', () => { T('square', 620 + R() * 160, 0, 0, 0.035, 0.05, 0.003); T('sine', 1240 + R() * 200, 0, 0, 0.03, 0.04, 0.003); }, 0, 0.9);
  def('portal', () => { N('bandpass', 400, 3200, 1.5, 0, 0.75, 0.3, 0.18); T('sine', 300, 1200, 0, 0.6, 0.12, 0.12); T('sine', 1760, 2640, 0.2, 0.6, 0.06, 0.1); T('sine', 2217, 3322, 0.3, 0.55, 0.05, 0.1); T('triangle', 150, 600, 0, 0.5, 0.1, 0.1); }, 0.5);
  def('beacon', () => {
    T('sine', 95, 40, 0, 0.7, 0.8, 0.008); N('lowpass', 300, 2600, 0.8, 0, 1.0, 0.5, 0.06); N('bandpass', 900, 2400, 1.2, 0.05, 1.3, 0.2, 0.25);
    [440, 554, 659, 880, 1109, 1319].forEach((f, i) => { T('triangle', f, 0, 0.2, 2.3, 0.07, 0.45, 0.5); T('sine', f * 1.004, 0, 0.2 + i * 0.03, 2.3, 0.06, 0.5, 0.5); });
    for (let i = 0; i < 12; i++) T('sine', [1760, 2217, 2637, 3520][i % 4] * (1 + (R() - 0.5) * 0.01), 0, 0.5 + i * 0.14 + R() * 0.05, 0.3, 0.04);
  }, 0.6);
  def('save', () => { seq('sine', [660, 990], 0, 0.08, 0.16, 0.14); }, 0.15, 0.8);

  // ------------------------------------------------------------ sfx: player
  def('jump', () => { T('sine', 320, 640, 0, 0.13, 0.2); T('triangle', 320, 700, 0, 0.1, 0.07); }, 0, 0.8);
  def('djump', () => { T('sine', 520, 1050, 0, 0.12, 0.17); N('highpass', 2000, 5000, 0.7, 0, 0.1, 0.07, 0.01); T('triangle', 1040, 1560, 0.02, 0.08, 0.05); }, 0.1, 0.8);
  def('land', () => { N('lowpass', 500, 150, 0.8, 0, 0.09, 0.32, 0.002); T('sine', 140, 70, 0, 0.08, 0.28, 0.002); }, 0, 0.7);
  def('step', () => { N('lowpass', 900, 400, 0.8, 0, 0.045, 0.2, 0.003); T('sine', 120, 80, 0, 0.04, 0.08, 0.003); }, 0, 1);
  def('swing', () => { N('bandpass', 900, 3400, 1.2, 0, 0.14, 0.42, 0.03); T('sine', 260, 520, 0, 0.09, 0.05, 0.02); });
  def('swing2', () => { N('bandpass', 500, 2400, 1, 0, 0.21, 0.55, 0.045); N('lowpass', 300, 800, 0.8, 0, 0.18, 0.26, 0.04); T('sine', 180, 400, 0, 0.14, 0.07, 0.03); });
  def('bow', () => { T('triangle', 380, 240, 0, 0.13, 0.3, 0.002); T('sawtooth', 760, 480, 0, 0.05, 0.07, 0.002); N('bandpass', 2500, 5200, 2, 0.02, 0.13, 0.22, 0.012); });
  def('cast', () => { T('sine', 880, 1320, 0, 0.18, 0.2); T('triangle', 1760, 2640, 0.02, 0.14, 0.08); N('highpass', 4000, 7000, 0.7, 0, 0.12, 0.05, 0.01); }, 0.3);
  def('hurt', () => { T('sawtooth', 300, 140, 0, 0.16, 0.2, 0.003); N('lowpass', 1200, 400, 0.8, 0, 0.1, 0.32, 0.002); T('square', 180, 90, 0, 0.12, 0.09, 0.003); });
  def('death', () => { T('triangle', 440, 110, 0, 0.75, 0.3, 0.01, 0.2); T('sine', 330, 82, 0.1, 0.85, 0.25, 0.01, 0.2); N('lowpass', 800, 200, 0.8, 0, 0.5, 0.2, 0.01); seq('sine', [659, 523, 392, 262], 0.05, 0.16, 0.3, 0.1); }, 0.45);
  def('dash', () => { N('bandpass', 600, 4200, 1, 0, 0.22, 0.46, 0.02); T('sine', 200, 520, 0, 0.15, 0.1, 0.01); });
  def('heal', () => { seq('sine', [660, 880, 1320], 0, 0.08, 0.32, 0.15); seq('triangle', [1320, 1760, 2640], 0.02, 0.08, 0.26, 0.05); N('highpass', 5000, 8000, 0.7, 0, 0.4, 0.04, 0.05); }, 0.4);
  def('buff', () => { T('triangle', 220, 880, 0, 0.36, 0.22, 0.02, 0.5); T('sine', 440, 1760, 0.05, 0.36, 0.12, 0.02, 0.5); N('bandpass', 1000, 5000, 1.5, 0, 0.42, 0.15, 0.12); T('sine', 1760, 0, 0.36, 0.35, 0.12); T('sine', 2637, 0, 0.4, 0.3, 0.06); }, 0.35);

  // ------------------------------------------------------------ sfx: hits
  def('hit', () => { N('lowpass', 1900, 300, 0.9, 0, 0.09, 0.7, 0.002); T('sine', 180, 60, 0, 0.1, 0.6, 0.002); N('bandpass', 3000, 1500, 1.5, 0, 0.03, 0.3, 0.001); }, 0, 0.8);
  def('hit_arrow', () => { N('bandpass', 2600, 1000, 2, 0, 0.05, 0.5, 0.001); T('triangle', 300, 120, 0, 0.07, 0.36, 0.002); T('sine', 150, 70, 0, 0.08, 0.3, 0.002); }, 0, 0.9);
  def('hit_magic', () => { T('sine', 1200, 400, 0, 0.14, 0.3, 0.002); N('bandpass', 2500, 800, 1.5, 0, 0.1, 0.36, 0.002); T('triangle', 1800, 900, 0, 0.08, 0.12, 0.002); T('sine', 160, 70, 0, 0.09, 0.3, 0.002); }, 0.15, 0.8);
  def('crit', () => { N('highpass', 2500, 1200, 0.8, 0, 0.07, 0.6, 0.001); N('lowpass', 1600, 250, 0.9, 0, 0.1, 0.55, 0.002); T('sine', 220, 60, 0, 0.12, 0.7, 0.002); T('sine', 2637, 0, 0, 0.36, 0.13, 0.002); T('sine', 3951, 0, 0, 0.26, 0.07, 0.002); T('square', 1320, 660, 0, 0.06, 0.1, 0.002); }, 0.2, 0.7);

  // ------------------------------------------------------------ sfx: skills
  def('fire', () => { N('bandpass', 300, 2500, 0.9, 0, 0.36, 0.6, 0.03); N('lowpass', 500, 150, 0.8, 0, 0.3, 0.45, 0.01); T('sawtooth', 160, 60, 0, 0.25, 0.12, 0.01); N('highpass', 3000, 5000, 0.7, 0.05, 0.25, 0.1, 0.04); }, 0.15);
  def('quake', () => { T('sine', 110, 35, 0, 0.55, 0.9, 0.003); N('lowpass', 400, 80, 0.8, 0, 0.75, 0.7, 0.005); T('triangle', 70, 30, 0.05, 0.6, 0.4, 0.01); N('bandpass', 1500, 500, 1, 0, 0.08, 0.4, 0.002); for (let i = 0; i < 5; i++) N('lowpass', 300 + R() * 300, 100, 1, 0.12 + i * 0.1 + R() * 0.04, 0.12, 0.2, 0.004); }, 0.25);
  def('whirl', () => { for (let i = 0; i < 6; i++) N('bandpass', 500, 2700, 1.4, i * 0.17, 0.2, 0.4 - i * 0.03, 0.05); N('lowpass', 400, 420, 0.8, 0, 1.0, 0.18, 0.12, 0.7); T('sine', 180, 240, 0, 1.0, 0.06, 0.1, 0.7); }, 0.15);
  def('sun', () => {
    T('sawtooth', 1400, 220, 0, 0.26, 0.09, 0.02); N('bandpass', 3000, 500, 1.2, 0, 0.26, 0.3, 0.06);
    T('sine', 130, 30, 0.25, 0.9, 1.0, 0.003); N('lowpass', 2600, 100, 0.8, 0.25, 1.1, 0.9, 0.004); N('bandpass', 1200, 300, 0.9, 0.25, 0.5, 0.5, 0.003); T('triangle', 80, 30, 0.28, 0.8, 0.5, 0.005);
    for (let i = 0; i < 6; i++) N('highpass', 2500 + R() * 2500, 1500, 0.8, 0.35 + i * 0.1 + R() * 0.05, 0.12, 0.12, 0.004);
  }, 0.4);
  def('star', () => { T('sine', 1568, 2093, 0, 0.1, 0.16); T('triangle', 2093, 3136, 0.03, 0.12, 0.1); T('sine', 3136, 4186, 0.07, 0.13, 0.06); N('highpass', 5000, 8000, 0.7, 0, 0.08, 0.05, 0.005); }, 0.3);
  def('blink', () => { T('sine', 300, 2400, 0, 0.09, 0.22, 0.005); T('sine', 2400, 400, 0.09, 0.13, 0.18, 0.005); N('bandpass', 1500, 6000, 2, 0, 0.17, 0.2, 0.02); T('sine', 3520, 0, 0.1, 0.22, 0.05); }, 0.35);
  def('ice', () => { N('highpass', 3500, 6000, 0.8, 0, 0.26, 0.4, 0.002); [2637, 3520, 4699, 5588, 3951].forEach((f, i) => T('sine', f, f * 0.97, i * 0.025, 0.22, 0.09, 0.002)); T('sine', 500, 200, 0, 0.12, 0.25, 0.002); N('bandpass', 1800, 900, 1.5, 0, 0.08, 0.3, 0.002); }, 0.4);
  def('meteor', () => { T('sine', 1800, 320, 0, 0.22, 0.12, 0.02); N('bandpass', 2200, 600, 1.5, 0, 0.22, 0.2, 0.05); T('sine', 120, 35, 0.2, 0.55, 0.8, 0.003); N('lowpass', 2300, 150, 0.8, 0.2, 0.65, 0.7, 0.004); N('bandpass', 900, 300, 1, 0.2, 0.3, 0.3, 0.003); }, 0.3);
  def('thunder', () => { N('highpass', 1500, 4200, 0.7, 0, 0.06, 0.8, 0.001); N('bandpass', 2000, 300, 0.8, 0.01, 0.26, 0.6, 0.002); T('sawtooth', 90, 40, 0.02, 0.5, 0.26, 0.004); N('lowpass', 300, 60, 0.8, 0.05, 0.95, 0.5, 0.02); T('square', 1800, 200, 0, 0.07, 0.1, 0.002); }, 0.35);
  def('galaxy', () => {
    T('triangle', 55, 140, 0, 1.65, 0.4, 0.5, 0.9); T('sine', 110, 300, 0, 1.65, 0.2, 0.6, 0.9); N('bandpass', 200, 3200, 2.5, 0, 1.65, 0.3, 0.9, 0.95);
    wob(T('sine', 82, 200, 0, 1.6, 0.22, 0.4, 0.9), 7, 0.1, 0, 1.6);
    T('sine', 900, 40, 1.6, 0.28, 0.7, 0.003); N('lowpass', 4200, 100, 0.8, 1.6, 0.55, 0.9, 0.003); T('sine', 60, 28, 1.62, 0.6, 0.8, 0.004);
    for (let i = 0; i < 6; i++) T('sine', 1800 + R() * 3000, 0, 1.62 + i * 0.05, 0.25, 0.05);
  }, 0.5);
  def('pierce', () => { N('bandpass', 1200, 6200, 2.5, 0, 0.21, 0.55, 0.005); T('sine', 900, 2500, 0, 0.12, 0.12, 0.004); T('triangle', 300, 150, 0, 0.1, 0.26, 0.002); N('highpass', 4000, 7000, 0.7, 0.05, 0.25, 0.1, 0.03); }, 0.2);
  def('rain', () => { for (let i = 0; i < 11; i++) { const t = i * 0.09 + R() * 0.04, f = 2500 + R() * 2500; N('bandpass', f, f * 1.6, 3, t, 0.09, 0.19, 0.01); T('triangle', 260, 130, t + 0.06, 0.05, 0.07, 0.002); } }, 0.2, 1.6);
  def('sky', () => {
    T('sawtooth', 200, 1600, 0, 0.22, 0.07, 0.18, 0.9); N('bandpass', 800, 5000, 3, 0, 0.22, 0.2, 0.18, 0.9);
    N('highpass', 1000, 300, 0.7, 0.2, 0.75, 0.8, 0.003); wob(T('sawtooth', 140, 60, 0.2, 0.75, 0.26, 0.003, 0.4), 38, 0.12, 0.2, 0.75); T('square', 2400, 300, 0.2, 0.26, 0.12, 0.002); T('sine', 100, 30, 0.2, 0.75, 0.8, 0.003);
    for (let i = 0; i < 7; i++) N('highpass', 3000 + R() * 4000, 2000, 1, 0.26 + i * 0.08 + R() * 0.04, 0.05, 0.3, 0.001);
  }, 0.4);

  // ------------------------------------------------------------ sfx: monsters / boss
  def('mon_die', () => { T('sine', 500, 150, 0, 0.12, 0.3, 0.002); N('bandpass', 1500, 600, 1.2, 0, 0.1, 0.3, 0.002); T('triangle', 900, 300, 0, 0.06, 0.12, 0.002); }, 0.1);
  def('mon_shoot', () => { T('square', 500, 250, 0, 0.1, 0.09, 0.003); N('bandpass', 1800, 900, 2, 0, 0.1, 0.2, 0.004); T('sine', 700, 350, 0, 0.09, 0.1, 0.003); }, 0.1, 0.8);
  def('boss_roar', () => {
    wob(B(92, 56, 0, 1.25, 0.34, 0.14, 300, 1100, 0.55), 27, 0.12, 0, 1.25); wob(B(138, 84, 0.03, 1.15, 0.16, 0.14, 400, 1400, 0.5), 31, 0.06, 0, 1.2);
    N('bandpass', 420, 200, 1.2, 0, 1.15, 0.5, 0.2, 0.5); T('triangle', 60, 40, 0, 1.2, 0.4, 0.15, 0.5); N('lowpass', 250, 90, 0.8, 0, 1.2, 0.35, 0.2, 0.5);
  }, 0.45);
  def('boss_slam', () => { T('sine', 100, 30, 0, 0.48, 1.0, 0.003); N('lowpass', 900, 100, 0.8, 0, 0.42, 0.8, 0.003); N('bandpass', 2000, 700, 1, 0, 0.06, 0.3, 0.002); T('triangle', 60, 28, 0.02, 0.5, 0.5, 0.005); }, 0.3);
  def('boss_die', () => {
    T('sine', 140, 28, 0, 1.3, 0.9, 0.004, 0.2); N('lowpass', 3000, 80, 0.8, 0, 1.9, 0.9, 0.005, 0.15); T('sawtooth', 220, 40, 0, 1.7, 0.12, 0.05, 0.3);
    for (let i = 0; i < 10; i++) { const f = 300 + R() * 900, t = 0.2 + i * 0.16 + R() * 0.08; N('bandpass', f, f * 0.5, 1.2, t, 0.16, 0.36, 0.003); T('sine', 90 + R() * 60, 35, t, 0.2, 0.3, 0.003); }
    [523, 659, 784].forEach((f) => T('sine', f, f * 0.5, 0.1, 1.6, 0.05, 0.3, 0.4));
  }, 0.55);
  def('warning', () => { T('square', 880, 0, 0, 0.1, 0.1); T('sine', 880, 0, 0, 0.1, 0.14); T('square', 660, 0, 0.13, 0.15, 0.1); T('sine', 660, 0, 0.13, 0.15, 0.14); }, 0.1);
  def('laser', () => { wob(T('sawtooth', 220, 200, 0, 1.0, 0.14, 0.05, 0.85), 46, 0.05, 0, 1); T('square', 440, 400, 0, 1.0, 0.05, 0.05, 0.85); T('sine', 1760, 1500, 0, 1.0, 0.06, 0.05, 0.85); N('highpass', 3000, 3200, 0.7, 0, 1.0, 0.1, 0.05, 0.85); T('sine', 55, 50, 0, 1.0, 0.3, 0.05, 0.85); }, 0.2);

  // ------------------------------------------------------------ bgm manager
  A.bgm = safe(function (id) {
    want = id || null;
    if (ctx && want !== curId) startBgm(want);
  });
  function startBgm(id) {
    if (track) { track.stop(1.0); dying.push(track); track = null; }
    curId = id;
    if (!id) return;
    const f = A.files && A.files[id];
    track = f ? fileTrack(id, f === true ? id + '.mp3' : f) : TR[id] ? procTrack(id) : null;
  }
  function fallback(id) { if (curId === id) track = TR[id] ? procTrack(id) : null; }
  A._nodes = () => ({ ctx, master, musBus, sfxBus, track, curId, TR });

  // ---- file-based track: two HTMLAudio elements cross-fading into each other for a soft loop (file:// safe)
  const FGAIN = {}; // optional per-track loudness trim, default 0.8
  function fileTrack(id, name) {
    const g = FGAIN[id] === undefined ? 0.8 : FGAIN[id], els = [];
    let active = 0, fade = 0, fadeTo = 1, dead = false, failed = false, blocked = false, lastT = performance.now();
    const fail = safe(() => { if (failed) return; failed = true; kill(); if (!dead) fallback(id); });
    const kill = () => els.forEach((el) => { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {} });
    const play = (el) => {
      el._ft = 1;
      try {
        const p = el.play();
        if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotAllowedError') blocked = true; else if (!e || e.name !== 'AbortError') fail(); });
      } catch (e) { fail(); }
    };
    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.preload = 'auto'; el._f = 0; el._ft = 0; el.volume = 0;
      el.addEventListener('error', fail);
      el.addEventListener('ended', safe(() => { if (!dead && !failed && els[active] === el) { el.currentTime = 0; play(el); } }));
      el.src = A.base + name;
      els.push(el);
    }
    const applyVol = () => els.forEach((el) => { el.volume = clamp01(A.vol.master * A.vol.bgm * duckMul * g * fade * el._f); });
    play(els[0]);
    return {
      applyVol, els,
      kick() { if (blocked && !dead && !failed) { blocked = false; play(els[active]); } },
      setHidden(h) { const el = els[active]; if (failed) return; if (h) els.forEach((e) => e.pause()); else if (!dead) play(el); },
      stop(sec) { dead = true; fadeTo = 0; this._rate = 1 / Math.max(0.05, sec || 1); },
      tick() {
        const t = performance.now(), dt = Math.min(0.2, (t - lastT) / 1000);
        lastT = t;
        if (failed) return false;
        const rate = this._rate || 1;
        fade = fade < fadeTo ? Math.min(fadeTo, fade + dt * rate) : Math.max(fadeTo, fade - dt * rate);
        const el = els[active];
        if (!dead && isFinite(el.duration) && el.duration > 6 && el.currentTime > el.duration - 1.7 && el._ft === 1) {
          const o = els[1 - active];           // hand over to the twin element
          el._ft = 0; o._f = 0;
          try { o.currentTime = 0; } catch (e) {}
          play(o); active = 1 - active;
        }
        els.forEach((e) => {
          e._f = e._f < e._ft ? Math.min(e._ft, e._f + dt / 1.5) : Math.max(e._ft, e._f - dt / 1.5);
          if (e._f === 0 && e._ft === 0 && !e.paused && e !== els[active]) e.pause();
        });
        applyVol();
        if (dead && fade === 0) { kill(); return false; }
        return true;
      },
    };
  }

  // ---- procedural music voices (absolute time t, connect to bus b)
  let musRev = null;
  const revIn = () => {
    if (!musRev) { musRev = ctx.createConvolver(); musRev.buffer = reverb.buffer; const o = ctx.createGain(); o.gain.value = 0.5; musRev.connect(o); o.connect(musBus); }
    return musRev;
  };
  function sus(b, type, f, t, d, v, a, r, det) { // sustained: attack a, hold to t+d, release r
    const o = ctx.createOscillator(), g = ctx.createGain(), e = t + Math.max(a + 0.01, d);
    o.type = type; o.frequency.value = f; if (det) o.detune.value = det;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setValueAtTime(v, e); g.gain.exponentialRampToValueAtTime(0.0001, e + r);
    o.connect(g); g.connect(b); o.start(t); o.stop(e + r + 0.05);
    return o;
  }
  function plk(b, type, f, t, d, v, det) { // plucked: instant attack, exponential decay over d
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; if (det) o.detune.value = det;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(b); o.start(t); o.stop(t + d + 0.05);
    return o;
  }
  function nz(b, ftype, f, q, t, d, v, a) {
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; fl.type = ftype; fl.frequency.value = f; fl.Q.value = q || 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + (a || 0.003)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl); fl.connect(g); g.connect(b); s.start(t, Math.random() * 1.5); s.stop(t + d + 0.05);
  }
  function vib(o, t, cents, hz, delay, len) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = hz; lg.gain.setValueAtTime(0, t + delay); lg.gain.linearRampToValueAtTime(cents, t + delay + 0.18);
    l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(t + len + 0.4);
  }
  function drop(b, f1, f2, t, d, v) { // pitched drum (kick / tom / timpani)
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + d * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(b); o.start(t); o.stop(t + d + 0.05);
  }
  const LEAD = {
    flute: (b, f, t, d, v) => { const e = d * 0.92; vib(sus(b, 'sine', f, t, e, v, 0.045, 0.12), t, 9, 5.2, 0.12, e); sus(b, 'triangle', f, t, e, v * 0.22, 0.05, 0.1); nz(b, 'bandpass', f * 2, 1.5, t, Math.min(e, 0.22), v * 0.1, 0.03); },
    whistle: (b, f, t, d, v) => { const e = d * 0.88; vib(sus(b, 'triangle', f, t, e, v, 0.02, 0.1), t, 12, 6, 0.1, e); sus(b, 'sine', f * 2, t, e, v * 0.16, 0.02, 0.08); },
    reed: (b, f, t, d, v) => { const e = d * 0.85; vib(sus(b, 'triangle', f, t, e, v, 0.03, 0.1), t, 7, 5, 0.15, e); sus(b, 'sine', f * 3, t, e, v * 0.1, 0.03, 0.08); sus(b, 'square', f, t, e, v * 0.05, 0.03, 0.08); },
    bell: (b, f, t, d, v) => { plk(b, 'sine', f, t, 1.9, v); plk(b, 'sine', f * 2.76, t, 0.9, v * 0.26); plk(b, 'sine', f * 5.4, t, 0.35, v * 0.1); plk(b, 'triangle', f * 2, t, 0.5, v * 0.14); },
    brass: (b, f, t, d, v) => { const e = d * 0.9; sus(b, 'sawtooth', f, t, e, v * 0.6, 0.05, 0.14, -8); sus(b, 'sawtooth', f, t, e, v * 0.6, 0.05, 0.14, 8); sus(b, 'triangle', f, t, e, v * 0.5, 0.04, 0.12); },
    marimba: (b, f, t, d, v) => { plk(b, 'sine', f, t, 0.5, v * 1.2); plk(b, 'sine', f * 4, t, 0.07, v * 0.3); plk(b, 'triangle', f, t, 0.2, v * 0.4); },
  };
  const PLK = {
    pluck: (b, f, t, v) => { plk(b, 'triangle', f, t, 0.45, v); plk(b, 'sine', f * 2, t, 0.25, v * 0.3); },
    marimba: (b, f, t, v) => LEAD.marimba(b, f, t, 0, v),
    oud: (b, f, t, v) => { plk(b, 'sawtooth', f, t, 0.32, v * 0.8); plk(b, 'triangle', f, t, 0.4, v * 0.6); },
    piano: (b, f, t, v) => { plk(b, 'triangle', f, t, 0.9, v); plk(b, 'sine', f * 2, t, 0.5, v * 0.25); },
    stac: (b, f, t, v) => { plk(b, 'sawtooth', f, t, 0.17, v, -6); plk(b, 'sawtooth', f, t, 0.17, v, 6); },
  };
  const DRUM = {
    k: (b, t, v) => { drop(b, 130, 45, t, 0.22, v); nz(b, 'lowpass', 900, 0.8, t, 0.03, v * 0.3); },
    s: (b, t, v) => { nz(b, 'bandpass', 1900, 0.8, t, 0.15, v); plk(b, 'triangle', 185, t, 0.08, v * 0.5); },
    h: (b, t, v) => nz(b, 'highpass', 7000, 0.8, t, 0.04, v),
    sh: (b, t, v) => nz(b, 'bandpass', 5200, 1.2, t, 0.08, v, 0.012),
    tm: (b, t, v) => { drop(b, 105, 70, t, 0.5, v); nz(b, 'lowpass', 400, 0.8, t, 0.08, v * 0.4); },
    dm: (b, t, v) => { drop(b, 95, 55, t, 0.3, v); nz(b, 'lowpass', 600, 0.8, t, 0.05, v * 0.35); },
    tk: (b, t, v) => { nz(b, 'bandpass', 2600, 3, t, 0.05, v); plk(b, 'sine', 820, t, 0.04, v * 0.5); },
  };

  // ---- procedural tracks. mel: per bar [degree, length16, ...] (null = rest) · prog: chord root (scale degree) per bar
  //      bass pat: x root, f fifth, o octave · drum lines: [16-step pattern, level] (X = accent)
  const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10], PHD = [0, 1, 4, 5, 7, 8, 10], HMIN = [0, 2, 3, 5, 7, 8, 11], _ = null;
  const TR = {
    town: { bpm: 92, root: 43, scale: MAJ, gain: 1.2, rev: 0.3,
      prog: [0, 4, 5, 3, 0, 3, 4, 0, 5, 3, 0, 4, 5, 3, 4, 0],
      mel: [[4, 4, 2, 2, 4, 2, 7, 8], [8, 4, 7, 2, 6, 2, 4, 8], [5, 4, 7, 2, 9, 2, 7, 6, _, 2], [7, 4, 5, 2, 3, 2, 5, 8], [4, 2, 5, 2, 7, 4, 9, 4, 7, 4], [10, 4, 9, 2, 7, 2, 5, 8], [6, 4, 8, 4, 11, 4, 8, 4], [7, 12, _, 4],
        [9, 6, 7, 2, 5, 4, 7, 4], [5, 6, 7, 2, 10, 8], [9, 4, 7, 4, 4, 4, 7, 4], [8, 6, 6, 2, 4, 8], [9, 6, 7, 2, 5, 4, 9, 4], [10, 4, 12, 4, 10, 4, 7, 4], [8, 4, 11, 4, 13, 6, 11, 2], [14, 8, 11, 4, _, 4]],
      lead: { voice: 'flute', oct: 2, v: 0.12 }, alt: { voice: 'reed', oct: 2, v: 0.1 }, pad: { oct: 1, v: 0.03 },
      arp: { voice: 'pluck', oct: 1, div: 2, pat: [0, 1, 2, 1, 3, 1, 2, 1], v: 0.06 },
      bass: { pat: 'x.......x.....x.', v: 0.15, d: 0.55 }, drums: { sh: ['..x...x...x...x.', 0.028] } },
    field: { bpm: 126, root: 38, scale: MAJ, gain: 1.6, rev: 0.22,
      prog: [0, 3, 0, 4, 5, 3, 4, 0, 3, 4, 2, 5, 3, 4, 0, 0],
      mel: [[7, 3, 9, 3, 11, 2, 9, 4, 7, 4], [10, 3, 9, 3, 7, 2, 5, 8], [7, 3, 9, 3, 11, 2, 14, 4, 11, 4], [13, 3, 11, 3, 8, 2, 11, 8], [12, 3, 11, 3, 9, 2, 7, 4, 9, 4], [10, 3, 12, 3, 14, 2, 12, 8], [11, 2, 13, 2, 15, 4, 13, 2, 11, 2, 8, 4], [7, 8, _, 4, 4, 2, 6, 2],
        [10, 4, 7, 2, 10, 2, 12, 4, 10, 4], [11, 4, 8, 2, 11, 2, 13, 4, 11, 4], [9, 4, 11, 2, 13, 2, 11, 4, 9, 4], [12, 6, 11, 2, 9, 4, 7, 4], [10, 3, 12, 3, 14, 2, 12, 4, 10, 4], [11, 3, 13, 3, 15, 2, 16, 4, 15, 4], [14, 6, 11, 2, 9, 4, 11, 4], [14, 10, _, 6]],
      lead: { voice: 'whistle', oct: 2, v: 0.1 }, alt: { voice: 'flute', oct: 2, v: 0.12 }, pad: { oct: 1, v: 0.024 },
      arp: { voice: 'pluck', oct: 2, div: 2, pat: [0, 2, 1, 2, 0, 2, 3, 2], v: 0.045 },
      bass: { pat: 'x...f...x...f.x.', v: 0.16, d: 0.3 },
      drums: { k: ['x.......x.x.....', 0.3], s: ['....x.......x...', 0.11], h: ['x.x.x.x.x.x.x.x.', 0.03] } },
    forest: { bpm: 100, root: 45, scale: DOR, gain: 1.7, rev: 0.4,
      prog: [0, 6, 0, 3, 0, 6, 4, 0],
      mel: [[7, 2, _, 2, 9, 2, 11, 2, 9, 4, 7, 4], [8, 2, _, 2, 10, 2, 8, 2, 6, 8], [7, 2, 9, 2, 11, 4, 12, 2, 11, 2, 9, 4], [10, 4, 12, 4, 14, 6, _, 2], [11, 2, _, 2, 9, 2, 11, 2, 14, 4, 11, 4], [13, 2, 12, 2, 10, 4, 8, 4, 10, 4], [11, 4, 8, 2, 6, 2, 4, 6, _, 2], [7, 12, _, 4]],
      lead: { voice: 'reed', oct: 1, v: 0.1 }, alt: { voice: 'marimba', oct: 1, v: 0.13 }, pad: { oct: 1, v: 0.028 },
      arp: { voice: 'marimba', oct: 1, div: 2, pat: [0, 2, 3, 2, 1, 2, 3, 2], v: 0.06 },
      bass: { pat: 'x.....x...x.....', v: 0.13, d: 0.4 }, drums: { sh: ['x...x...x...x...', 0.022], tk: ['......x.......x.', 0.05] } },
    cave: { bpm: 66, root: 38, scale: MIN, gain: 1.6, rev: 0.7, drip: 0.3,
      prog: [0, 0, 5, 5, 3, 3, 0, 0],
      mel: [[11, 8, _, 8], [9, 4, 8, 4, 7, 8], [12, 8, _, 8], [10, 4, 9, 4, 7, 8], [10, 8, 12, 8], [11, 6, 9, 2, 8, 8], [7, 8, _, 8], [4, 8, 7, 8]],
      lead: { voice: 'bell', oct: 2, v: 0.09 }, alt: { voice: 'bell', oct: 1, v: 0.11 }, pad: { oct: 1, v: 0.045, tones: [0, 2], lp: 900 },
      arp: { voice: 'piano', oct: 2, div: 8, pat: [0, 2], v: 0.035 },
      bass: { pat: 'x...............', v: 0.2, d: 1.6 } },
    desert: { bpm: 104, root: 40, scale: PHD, gain: 1.35, rev: 0.28,
      prog: [0, 0, 1, 0, 3, 1, 6, 0],
      mel: [[7, 4, 8, 2, 9, 2, 8, 2, 7, 2, 6, 4], [7, 6, 9, 2, 11, 8], [12, 4, 11, 2, 10, 2, 8, 4, 10, 4], [9, 6, 8, 2, 7, 8], [10, 4, 12, 4, 14, 4, 12, 2, 10, 2], [8, 4, 10, 4, 12, 6, _, 2], [13, 4, 12, 2, 10, 2, 8, 4, 6, 4], [7, 2, 8, 2, 9, 2, 8, 2, 7, 8]],
      lead: { voice: 'flute', oct: 2, v: 0.11 }, alt: { voice: 'reed', oct: 1, v: 0.1 }, pad: { oct: 1, v: 0.024 },
      arp: { voice: 'oud', oct: 1, div: 2, pat: [0, 3, 2, 3, 1, 3, 2, 3], v: 0.07, lp: 2200 },
      bass: { pat: 'x.....x.x.......', v: 0.15, d: 0.4 },
      drums: { dm: ['x.......x.......', 0.26], tk: ['..x...x.....x.x.', 0.07], sh: ['x.x.x.x.x.x.x.x.', 0.014] } },
    snow: { bpm: 80, root: 45, scale: MAJ, gain: 1.55, rev: 0.6,
      prog: [0, 2, 3, 0, 5, 3, 4, 0],
      mel: [[9, 6, 11, 2, 14, 8], [13, 6, 11, 2, 9, 8], [10, 4, 12, 4, 14, 4, 12, 4], [11, 12, _, 4], [12, 6, 14, 2, 16, 8], [15, 4, 14, 4, 12, 4, 10, 4], [11, 4, 13, 4, 15, 6, 13, 2], [14, 12, _, 4]],
      lead: { voice: 'bell', oct: 1, v: 0.1 }, alt: { voice: 'flute', oct: 1, v: 0.1 }, pad: { oct: 1, v: 0.04, type: 'sine' },
      arp: { voice: 'piano', oct: 1, div: 2, pat: [0, 1, 2, 3, 2, 1, 2, 1], v: 0.05 },
      bass: { pat: 'x.......x.......', v: 0.12, d: 0.9 }, drums: { sh: ['....x.......x...', 0.012] } },
    citadel: { bpm: 96, root: 36, scale: HMIN, gain: 1.55, rev: 0.35,
      prog: [0, 0, 5, 4, 0, 3, 4, 0],
      mel: [[7, 8, 9, 4, 8, 4], [7, 6, 6, 2, 7, 8], [9, 8, 12, 4, 11, 4], [11, 6, 8, 2, 6, 8], [7, 4, 9, 4, 11, 4, 14, 4], [12, 6, 10, 2, 12, 8], [13, 4, 11, 4, 8, 4, 6, 4], [7, 12, _, 4]],
      lead: { voice: 'brass', oct: 1, v: 0.1, lp: 1500 }, alt: { voice: 'brass', oct: 2, v: 0.085 }, pad: { oct: 1, v: 0.035, lp: 1200 },
      arp: { voice: 'stac', oct: 1, div: 2, pat: [0, 0, 2, 0, 0, 0, 2, 0], v: 0.045, lp: 1300 },
      bass: { pat: 'x...x...x...x...', v: 0.15, d: 0.35, saw: true, lp: 500 },
      drums: { tm: ['x.......x.....x.', 0.3], s: ['....x.xx....x.xx', 0.05] } },
    boss: { bpm: 160, root: 40, scale: HMIN, gain: 1.7, rev: 0.2,
      prog: [0, 5, 3, 4, 0, 5, 4, 4, 3, 3, 0, 0, 5, 5, 4, 4],
      mel: [[7, 3, 7, 1, 9, 4, 11, 4, 9, 4], [12, 3, 12, 1, 11, 4, 9, 8], [10, 3, 10, 1, 12, 4, 14, 4, 12, 4], [11, 4, 13, 4, 15, 8], [14, 3, 14, 1, 11, 4, 9, 4, 11, 4], [12, 4, 14, 4, 16, 6, 14, 2], [15, 3, 13, 3, 11, 2, 13, 4, 15, 4], [18, 8, 15, 4, 13, 4],
        [10, 2, 10, 2, 12, 2, 10, 2, 14, 4, 12, 4], [10, 2, 10, 2, 12, 2, 10, 2, 15, 4, 14, 4], [11, 2, 11, 2, 14, 2, 11, 2, 16, 4, 14, 4], [11, 2, 11, 2, 14, 2, 11, 2, 18, 8], [12, 3, 14, 3, 16, 2, 19, 4, 16, 4], [12, 3, 14, 3, 16, 2, 19, 8], [18, 2, 17, 2, 15, 2, 13, 2, 11, 4, 13, 4], [15, 4, 17, 2, 18, 2, 20, 8]],
      lead: { voice: 'brass', oct: 1, v: 0.11, lp: 2200 }, pad: { oct: 1, v: 0.02, lp: 1500 },
      arp: { voice: 'stac', oct: 2, div: 1, pat: [0, 2, 1, 2], v: 0.035, lp: 2000 },
      bass: { pat: 'x.x.x.x.x.x.x.x.', v: 0.13, d: 0.18, saw: true, lp: 600 },
      drums: { k: ['x...x...x...x.x.', 0.32], s: ['....x.......x...', 0.13], h: ['x.xxx.xxx.xxx.xx', 0.022] } },
  };
  A.tracks = Object.keys(TR);

  function procTrack(id) {
    const d = TR[id], spb = 60 / d.bpm / 4, loopLen = d.prog.length * 16, t0 = ctx.currentTime, nodes = [];
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0); out.gain.linearRampToValueAtTime(d.gain || 1, t0 + 1.0);
    out.connect(musBus); nodes.push(out);
    const bus = (lp, rv) => {
      const g = ctx.createGain();
      let tail = g;
      if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.8; g.connect(f); tail = f; nodes.push(f); }
      tail.connect(out);
      if (rv) { const s = ctx.createGain(); s.gain.value = rv; tail.connect(s); s.connect(revIn()); nodes.push(s); }
      nodes.push(g);
      return g;
    };
    const bLead = bus(d.lead.lp, d.rev * 1.2), bArp = d.arp && bus(d.arp.lp, d.rev), bPad = d.pad && bus(d.pad.lp || 2400, d.rev);
    const bBass = d.bass && bus(d.bass.lp, 0), bDrum = d.drums && bus(0, d.rev * 0.3);
    const hz = (deg, oct) => 440 * Math.pow(2, (d.root + 12 * oct + d.scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7) - 69) / 12);
    const mel = {};
    d.mel.forEach((bar, bi) => { let pos = 0; for (let i = 0; i < bar.length; i += 2) { if (bar[i] !== null) mel[bi * 16 + pos] = [bar[i], bar[i + 1]]; pos += bar[i + 1]; } });
    let seed = 20261122;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let step = 0, nextT = t0 + 0.12, dead = false, endAt = 0;
    function sched(st, t) {
      const s = st % loopLen, cyc = Math.floor(st / loopLen), bar = s >> 4, pos = s & 15;
      const ch = d.prog[bar], low = ch >= 5 ? 7 : 0, ct = [ch, ch + 2, ch + 4, ch + 7], hv = 0.9 + rnd() * 0.2;
      if (pos === 0 && d.pad) {
        for (const i of d.pad.tones || [0, 1, 2]) {
          const f = hz(ct[i] - low, d.pad.oct);
          sus(bPad, d.pad.type || 'triangle', f, t, spb * 15.5, d.pad.v, 0.5, 0.9, -6); sus(bPad, 'sine', f, t, spb * 15.5, d.pad.v, 0.6, 0.9, 6);
        }
      }
      if (d.arp && pos % d.arp.div === 0) PLK[d.arp.voice](bArp, hz(ct[d.arp.pat[(pos / d.arp.div) % d.arp.pat.length]], d.arp.oct), t, d.arp.v * hv);
      if (d.bass && d.bass.pat[pos] !== '.') {
        const c = d.bass.pat[pos], f = hz((c === 'f' ? ch + 4 : c === 'o' ? ch + 7 : ch) - low, 0), bd = d.bass.d || 0.5;
        if (d.bass.saw) { plk(bBass, 'sawtooth', f, t, bd, d.bass.v * 0.7); plk(bBass, 'triangle', f, t, bd, d.bass.v * 0.6); }
        else { plk(bBass, 'triangle', f, t, bd, d.bass.v); plk(bBass, 'sine', f, t, bd * 1.2, d.bass.v * 0.8); }
      }
      if (d.drums) for (const k in d.drums) { const ln = d.drums[k], c = ln[0][pos]; if (c !== '.') DRUM[k](bDrum, t, ln[1] * (c === 'X' ? 1.35 : 1) * hv); }
      const ev = mel[s];
      if (ev) { const L = d.alt && cyc % 2 === 1 ? d.alt : d.lead; LEAD[L.voice](bLead, hz(ev[0], L.oct), t, ev[1] * spb, L.v * hv); }
      if (d.drip && pos % 4 === 2 && rnd() < d.drip) { const f = hz([0, 2, 4, 7, 9][(rnd() * 5) | 0], 3); plk(bLead, 'sine', f * 1.5, t, 0.1, 0.03); plk(bLead, 'sine', f, t + 0.03, 0.5, 0.035); }
    }
    return {
      tick(now) {
        if (dead) {
          if (now > endAt) { nodes.forEach((n) => { try { n.disconnect(); } catch (e) {} }); return false; }
          return true;
        }
        if (nextT < now) { const skip = Math.ceil((now + 0.03 - nextT) / spb); step += skip; nextT += skip * spb; } // keep the grid after a stall
        while (nextT < now + 0.28) { sched(step, nextT); nextT += spb; step++; }
        return true;
      },
      stop(sec) {
        const now = ctx.currentTime, f = Math.max(0.05, sec || 1);
        dead = true; endAt = now + f + 0.15;
        out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(out.gain.value, now); out.gain.linearRampToValueAtTime(0.0001, now + f);
      },
    };
  }
})();
