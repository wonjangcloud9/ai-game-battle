/* SUNDRIFT GP — audio. Everything is synthesised with Web Audio: engine, tyres, boosters, UI and the
   soundtrack (a small step sequencer). No audio files, so the game stays a plain folder of text. */
(function (root) {
  'use strict';
  var SD = root.SD;
  var AC = root.AudioContext || root.webkitAudioContext;

  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function note(n) {                       // 'A4' / 'F#5' -> midi
    var sharp = n.charAt(1) === '#', oct = parseInt(n.slice(sharp ? 2 : 1), 10);
    return 12 * (oct + 1) + NOTE[n.charAt(0)] + (sharp ? 1 : 0);
  }

  var A = { ctx: null, ready: false, muted: false, noise: null, eng: null };

  // ------------------------------------------------------------------ voices (work on any audio context)
  function env(g, t, peak, attack, hold, release) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }
  function tone(ctx, dest, t, type, f0, f1, dur, vol, attack) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env(g, t, vol, attack || 0.005, dur * 0.25, dur * 0.75);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(ctx, dest, noiseBuf, t, dur, vol, ftype, f0, f1, q) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = ftype; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, vol, 0.004, dur * 0.2, dur * 0.8);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * (noiseBuf.duration - dur - 0.05), dur + 0.05);
  }
  function makeNoise(ctx, seconds) {
    var len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    var seed = 22222;
    for (var i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
    return buf;
  }

  // ------------------------------------------------------------------ soundtrack
  var CH = {
    F: { root: 41, tri: [53, 57, 60] }, G: { root: 43, tri: [55, 59, 62] }, Em: { root: 40, tri: [52, 55, 59] },
    Am: { root: 45, tri: [57, 60, 64] }, C: { root: 48, tri: [55, 60, 64] }
  };
  var BARS = [
    ['F', '0:A4:2 2:C5:2 4:F5:3 7:E5:1 8:C5:2 10:A4:2 12:C5:4'],
    ['G', '0:B4:2 2:D5:2 4:G5:3 7:F5:1 8:D5:2 10:B4:2 12:D5:4'],
    ['Em', '0:G4:2 2:B4:2 4:E5:3 7:D5:1 8:B4:2 10:G4:2 12:B4:2 14:D5:2'],
    ['Am', '0:C5:3 3:E5:3 6:A5:4 10:G5:2 12:E5:4'],
    ['F', '0:F5:2 2:A5:2 4:C6:3 7:A5:1 8:F5:2 10:A5:2 12:G5:2 14:F5:2'],
    ['G', '0:G5:2 2:B5:2 4:D6:3 7:B5:1 8:G5:2 10:D5:2 12:G5:4'],
    ['C', '0:E5:3 3:G5:3 6:C6:6 12:G5:2 14:E5:2'],
    ['C', '0:C5:4 4:D5:2 6:E5:2 8:G5:4 12:B4:2 14:D5:2'],
    ['Am', '0:A5:3 3:G5:1 4:E5:2 6:C5:2 8:E5:3 11:G5:1 12:A5:4'],
    ['F', '0:A5:3 3:G5:1 4:F5:2 6:C5:2 8:F5:3 11:G5:1 12:A5:4'],
    ['C', '0:G5:3 3:E5:1 4:C5:2 6:E5:2 8:G5:3 11:C6:1 12:G5:4'],
    ['G', '0:D5:2 2:G5:2 4:B5:2 6:D6:2 8:B5:2 10:G5:2 12:D5:4'],
    ['Am', '0:E5:2 2:A5:2 4:C6:4 8:B5:2 10:A5:2 12:E5:4'],
    ['F', '0:F5:2 2:A5:2 4:C6:4 8:A5:2 10:F5:2 12:C5:4'],
    ['G', '0:D5:2 2:G5:2 4:B5:2 6:D6:6 12:B5:2 14:G5:2'],
    ['G', '0:D6:4 4:B5:4 8:G5:2 10:A5:2 12:B5:2 14:D6:2']
  ];
  var SONG = BARS.map(function (b) {
    var lead = {};
    b[1].split(' ').forEach(function (tok) { var p = tok.split(':'); lead[+p[0]] = [note(p[1]), +p[2]]; });
    return { chord: CH[b[0]], lead: lead };
  });
  var BASS = [0, 0, 12, 0, 0, 12, 0, 7];
  var STAB = { 0: 1, 3: 0.7, 6: 0.85, 10: 0.7, 12: 0.9 };
  A.BPM = 150;
  A.songSteps = SONG.length * 16;

  /** Schedule every voice that starts on `step` at time t. sd = seconds per 16th note. level: 0 calm, 1 full, 2 final lap. */
  A.scheduleStep = function (ctx, dest, noiseBuf, step, t, sd, level) {
    var bar = SONG[Math.floor(step / 16) % SONG.length], s = step % 16, ch = bar.chord, o, g, f, i;
    // drums
    if (level >= 1) {
      if (s % 4 === 0) {
        o = ctx.createOscillator(); g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.1);
        g.gain.setValueAtTime(0.36, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.2);
      }
      if (s === 4 || s === 12) {
        burst(ctx, dest, noiseBuf, t, 0.13, 0.13, 'bandpass', 1900, 1500, 0.7);
        tone(ctx, dest, t, 'triangle', 200, 150, 0.07, 0.09);
      }
      if (s % 2 === 0) burst(ctx, dest, noiseBuf, t, s === 14 ? 0.14 : 0.035, s % 4 === 2 ? 0.05 : 0.028, 'highpass', 7200, 7200, 0.7);
      else if (level >= 2) burst(ctx, dest, noiseBuf, t, 0.025, 0.018, 'highpass', 8500, 8500, 0.7);
    }
    // bass (8th notes)
    if (s % 2 === 0) {
      var bn = ch.root + BASS[s / 2];
      o = ctx.createOscillator(); g = ctx.createGain(); f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = hz(bn);
      f.type = 'lowpass'; f.Q.value = 2.5;
      f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(260, t + sd * 1.7);
      env(g, t, level >= 1 ? 0.13 : 0.08, 0.006, sd * 0.9, sd * 0.8);
      o.connect(f); f.connect(g); g.connect(dest); o.start(t); o.stop(t + sd * 2 + 0.05);
    }
    // chord stabs
    if (STAB[s]) {
      f = ctx.createBiquadFilter(); g = ctx.createGain();
      f.type = 'lowpass'; f.Q.value = 0.9;
      f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.22);
      env(g, t, 0.034 * STAB[s], 0.006, 0.05, 0.2);
      for (i = 0; i < 3; i++) {
        o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(ch.tri[i]) * (1 + (i - 1) * 0.004);
        o.connect(f); o.start(t); o.stop(t + 0.32);
      }
      f.connect(g); g.connect(dest);
    }
    // lead
    var L = bar.lead[s];
    if (L && level >= 1) {
      var dur = L[1] * sd * 0.94, o2 = ctx.createOscillator();
      o = ctx.createOscillator(); g = ctx.createGain(); f = ctx.createBiquadFilter();
      o.type = 'square'; o.frequency.value = hz(L[0]);
      o2.type = 'sawtooth'; o2.frequency.value = hz(L[0]) * 1.007;
      f.type = 'lowpass'; f.frequency.value = 3400; f.Q.value = 0.7;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.052, t + 0.012);
      g.gain.setTargetAtTime(0.034, t + 0.03, 0.09);
      g.gain.setTargetAtTime(0.0001, t + dur - 0.03, 0.025);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(dest);
      o.start(t); o2.start(t); o.stop(t + dur + 0.15); o2.stop(t + dur + 0.15);
    }
    // sparkle arpeggio on the final lap
    if (level >= 2) {
      var an = ch.tri[s % 3] + 24;
      tone(ctx, dest, t, 'triangle', hz(an), hz(an), sd * 0.9, 0.022, 0.004);
    }
  };

  var music = { on: false, step: 0, next: 0, timer: null, level: 1, tempo: 1 };
  function tick() {
    var ctx = A.ctx;
    if (!ctx || !music.on) return;
    if (ctx.state !== 'running') return;
    if (music.next < ctx.currentTime) music.next = ctx.currentTime + 0.05;     // catch up after a stall
    while (music.next < ctx.currentTime + 0.16) {
      var sd = 60 / A.BPM / 4 / music.tempo;
      A.scheduleStep(ctx, A.musicBus, A.noise, music.step, music.next, sd, music.level);
      music.next += sd;
      music.step = (music.step + 1) % A.songSteps;
    }
  }
  A.musicStart = function (level) {
    if (!A.ready) return;
    music.level = level === undefined ? 1 : level;
    music.tempo = 1;
    music.step = 0;
    music.next = A.ctx.currentTime + 0.06;
    A.musicBus.gain.cancelScheduledValues(A.ctx.currentTime);
    A.musicBus.gain.setValueAtTime(0.62, A.ctx.currentTime);
    if (!music.on) { music.on = true; music.timer = setInterval(tick, 25); }
  };
  A.musicStop = function (fade) {
    if (!A.ready || !music.on) return;
    music.on = false;
    clearInterval(music.timer);
    var t = A.ctx.currentTime;
    A.musicBus.gain.cancelScheduledValues(t);
    A.musicBus.gain.setValueAtTime(A.musicBus.gain.value, t);
    A.musicBus.gain.linearRampToValueAtTime(0.0001, t + (fade || 0.4));
  };
  A.musicLevel = function (level, tempo) { music.level = level; if (tempo) music.tempo = tempo; };
  A.musicPause = function (p) {
    if (!A.ready) return;
    if (p) { if (music.on) { clearInterval(music.timer); music.timer = null; } }
    else if (music.on && !music.timer) { music.next = A.ctx.currentTime + 0.05; music.timer = setInterval(tick, 25); }
  };

  // ------------------------------------------------------------------ set-up
  /** Builds the audio graph. ctxOverride lets tests render through an OfflineAudioContext. */
  A.init = function (ctxOverride) {
    if (A.ctx || (!AC && !ctxOverride)) return;
    try {
      var ctx = A.ctx = ctxOverride || new AC();
      A.offline = !!ctxOverride;
      A.comp = ctx.createDynamicsCompressor();
      A.comp.threshold.value = -16; A.comp.knee.value = 12; A.comp.ratio.value = 5; A.comp.attack.value = 0.004; A.comp.release.value = 0.22;
      A.master = ctx.createGain(); A.master.gain.value = A.muted ? 0 : 0.95;
      A.master.connect(A.comp); A.comp.connect(ctx.destination);
      A.sfx = ctx.createGain(); A.sfx.gain.value = 1; A.sfx.connect(A.master);
      A.musicBus = ctx.createGain(); A.musicBus.gain.value = 0.62; A.musicBus.connect(A.master);
      A.noise = makeNoise(ctx, 2);
      buildEngine(ctx);
      A.ready = true;
    } catch (e) {
      A.ctx = null; A.ready = false;
    }
  };
  A.resume = function () {
    if (A.ctx && A.ctx.state === 'suspended' && A.ctx.resume) { try { A.ctx.resume(); } catch (e) { /* ignore */ } }
  };
  A.suspend = function () {
    if (A.ctx && A.ctx.state === 'running' && A.ctx.suspend) { try { A.ctx.suspend(); } catch (e) { /* ignore */ } }
  };
  A.setMuted = function (m) {
    A.muted = m;
    if (A.ready) A.master.gain.setTargetAtTime(m ? 0 : 0.95, A.ctx.currentTime, 0.02);
    try { root.localStorage.setItem('sundrift.muted', m ? '1' : '0'); } catch (e) { /* storage unavailable */ }
  };
  try { A.muted = root.localStorage.getItem('sundrift.muted') === '1'; } catch (e) { A.muted = false; }

  function buildEngine(ctx) {
    var e = A.eng = {}, i;
    function osc(type, gain, dest) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = 60; g.gain.value = gain;
      o.connect(g); g.connect(dest); o.start();
      return o;
    }
    e.out = ctx.createGain(); e.out.gain.value = 0; e.out.connect(A.sfx);
    e.filter = ctx.createBiquadFilter(); e.filter.type = 'lowpass'; e.filter.frequency.value = 500; e.filter.Q.value = 1.4;
    e.trem = ctx.createGain(); e.trem.gain.value = 0.8;
    var curve = new Float32Array(257);
    for (i = 0; i < 257; i++) { var x = i / 128 - 1; curve[i] = Math.tanh(x * 2.2); }
    e.shaper = ctx.createWaveShaper(); e.shaper.curve = curve;
    e.o1 = osc('sawtooth', 0.5, e.shaper);
    e.o2 = osc('square', 0.3, e.shaper);
    e.o3 = osc('sawtooth', 0.16, e.shaper);
    e.shaper.connect(e.filter); e.filter.connect(e.trem); e.trem.connect(e.out);
    e.lfo = ctx.createOscillator(); e.lfo.type = 'sine'; e.lfo.frequency.value = 24;
    e.lfoG = ctx.createGain(); e.lfoG.gain.value = 0.2;
    e.lfo.connect(e.lfoG); e.lfoG.connect(e.trem.gain); e.lfo.start();
    // shared looping noise feeding three coloured layers
    var n = ctx.createBufferSource(); n.buffer = A.noise; n.loop = true; n.start();
    function layer(type, freq, q) {
      var f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
      n.connect(f); f.connect(g); g.connect(A.sfx);
      return { f: f, g: g };
    }
    e.screech = layer('bandpass', 1250, 2.4);
    e.roar = layer('lowpass', 700, 0.8);
    e.wind = layer('bandpass', 2600, 0.5);
    // rising "charging" tone that follows the booster gauge while sliding
    e.chg = ctx.createOscillator(); e.chg.type = 'triangle'; e.chg.frequency.value = 300;
    e.chgG = ctx.createGain(); e.chgG.gain.value = 0;
    e.chg.connect(e.chgG); e.chgG.connect(A.sfx); e.chg.start();
    e.gear = 0;
  }

  /** Continuous layers. p: { on, speed (0..1.5 of top), throttle, boost 0..1, drift 0..1, offroad, charge (-1 or 0..1) } */
  A.update = function (p) {
    if (!A.ready) return;
    var e = A.eng, t = A.ctx.currentTime, sf = SD.clamp(p.speed, 0, 1.6);
    // four pretend gears make the pitch climb and drop instead of droning
    var g = Math.min(3, Math.floor(sf * 3.4)), gp = sf * 3.4 - g;
    if (g > 2.5) gp = Math.min(1.6, gp);
    var rpm = sf < 0.03 ? 0.1 + p.throttle * 0.45 : 0.3 + gp * 0.5 + g * 0.09;
    var f = 44 + rpm * 128 + p.boost * 22;
    e.o1.frequency.setTargetAtTime(f, t, 0.05);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.o3.frequency.setTargetAtTime(f * 2.01, t, 0.05);
    e.lfo.frequency.setTargetAtTime(14 + rpm * 22, t, 0.1);
    e.filter.frequency.setTargetAtTime(320 + rpm * 1300 + p.throttle * 650 + p.boost * 900, t, 0.06);
    e.out.gain.setTargetAtTime(p.on ? 0.018 + p.throttle * 0.016 + rpm * 0.008 : 0, t, 0.09);
    e.screech.g.gain.setTargetAtTime(p.on ? p.drift * 0.2 : 0, t, 0.05);
    e.screech.f.frequency.setTargetAtTime(1050 + sf * 500, t, 0.1);
    e.roar.g.gain.setTargetAtTime(p.on ? p.boost * 0.15 + (p.offroad ? 0.05 * sf : 0) : 0, t, 0.07);
    e.roar.f.frequency.setTargetAtTime(520 + p.boost * 1100, t, 0.1);
    e.wind.g.gain.setTargetAtTime(p.on ? sf * sf * 0.03 : 0, t, 0.15);
    var ch = p.on && p.charge >= 0 ? p.charge : -1;
    e.chgG.gain.setTargetAtTime(ch >= 0 ? 0.02 : 0, t, 0.04);
    if (ch >= 0) e.chg.frequency.setTargetAtTime(280 * Math.pow(2, ch * 1.5), t, 0.06);
  };

  // ------------------------------------------------------------------ one-shots
  A.play = function (name, v, at) {
    if (!A.ready || (A.ctx.state !== 'running' && !A.offline)) return;
    var c = A.ctx, d = A.sfx, n = A.noise, t = c.currentTime + 0.005 + (at || 0), i;
    v = v === undefined ? 1 : v;
    switch (name) {
      case 'beep': tone(c, d, t, 'square', 440, 440, 0.17, 0.1); tone(c, d, t, 'sine', 880, 880, 0.17, 0.06); break;
      case 'go': tone(c, d, t, 'square', 880, 880, 0.6, 0.11); tone(c, d, t, 'sine', 1320, 1320, 0.6, 0.07); tone(c, d, t, 'triangle', 1760, 1760, 0.5, 0.04); break;
      case 'boost':
        burst(c, d, n, t, 0.75, 0.3, 'bandpass', 380, 3400, 1.2);
        tone(c, d, t, 'sawtooth', 150, 640, 0.42, 0.11); tone(c, d, t, 'sine', 70, 36, 0.32, 0.4);
        break;
      case 'rocket':
        burst(c, d, n, t, 0.9, 0.3, 'bandpass', 300, 4200, 1.2); tone(c, d, t, 'sawtooth', 180, 900, 0.5, 0.1);
        for (i = 0; i < 4; i++) tone(c, d, t + 0.05 + i * 0.06, 'triangle', hz(84 + i * 4), hz(84 + i * 4), 0.18, 0.08);
        break;
      case 'stock':
        for (i = 0; i < 4; i++) tone(c, d, t + i * 0.065, 'triangle', hz([88, 92, 95, 100][i]), hz([88, 92, 95, 100][i]), 0.26, 0.1);
        tone(c, d, t, 'sine', hz(76), hz(76), 0.4, 0.06);
        break;
      case 'kick': burst(c, d, n, t, 0.24, 0.17, 'bandpass', 1700, 520, 1.5); tone(c, d, t, 'sine', 230, 110, 0.16, 0.14); break;
      case 'pad': tone(c, d, t, 'sawtooth', 300, 1500, 0.3, 0.09); burst(c, d, n, t, 0.32, 0.12, 'highpass', 1800, 6500, 0.8); break;
      case 'wall': tone(c, d, t, 'sine', 120, 38, 0.26, 0.5 * v + 0.2); burst(c, d, n, t, 0.2, 0.26 * v + 0.1, 'lowpass', 1900, 280, 0.8); break;
      case 'bump': tone(c, d, t, 'sine', 170, 62, 0.14, 0.3); burst(c, d, n, t, 0.09, 0.14, 'lowpass', 2600, 600, 0.8); break;
      case 'driftStart': burst(c, d, n, t, 0.13, 0.1, 'bandpass', 2300, 1300, 5); break;
      case 'lap': tone(c, d, t, 'triangle', hz(79), hz(79), 0.2, 0.12); tone(c, d, t + 0.12, 'triangle', hz(84), hz(84), 0.34, 0.12); break;
      case 'final':
        for (i = 0; i < 6; i++) tone(c, d, t + i * 0.09, 'square', hz(i % 2 ? 88 : 83), hz(i % 2 ? 88 : 83), 0.08, 0.07);
        break;
      case 'finish':
        [72, 76, 79, 84].forEach(function (m, k) { tone(c, d, t + k * 0.12, 'square', hz(m), hz(m), 0.2, 0.09); tone(c, d, t + k * 0.12, 'triangle', hz(m + 12), hz(m + 12), 0.2, 0.06); });
        [72, 76, 79, 84, 88].forEach(function (m) { tone(c, d, t + 0.5, 'triangle', hz(m), hz(m), 1.3, 0.07, 0.01); });
        burst(c, d, n, t + 0.5, 0.9, 0.08, 'highpass', 5000, 9000, 0.7);
        break;
      case 'click': tone(c, d, t, 'square', 700, 700, 0.05, 0.06); break;
      case 'select': tone(c, d, t, 'triangle', 620, 930, 0.1, 0.09); break;
      case 'wrong': tone(c, d, t, 'sawtooth', 130, 110, 0.25, 0.1); break;
      case 'land': tone(c, d, t, 'sine', 100, 50, 0.12, 0.25); break;
      default: break;
    }
  };

  SD.audio = A;
})(typeof window !== 'undefined' ? window : globalThis);
