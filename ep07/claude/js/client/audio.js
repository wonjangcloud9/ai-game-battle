/* 해돌전쟁 — 소리
   효과음과 배경 음악을 모두 Web Audio로 그 자리에서 합성한다. 녹음된 음원 파일은 없다. */
'use strict';
(function (g0) {
  var R = g0.RTS;
  var A = R.Audio = { ctx: null, sfxVol: 0.7, musicVol: 0.45 };
  var ctx = null, sfxGain, musicGain, comp, noiseBuf, last = {}, recent = [];

  try {
    var sv = localStorage.getItem('haedol.sfx'), mv = localStorage.getItem('haedol.music');
    if (sv !== null && !isNaN(+sv)) A.sfxVol = +sv;
    if (mv !== null && !isNaN(+mv)) A.musicVol = +mv;
  } catch (e) { /* 저장소를 못 써도 게임은 된다 */ }

  A.init = function () {
    if (ctx) return true;
    var AC = g0.AudioContext || g0.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = A.ctx = new AC();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
      comp.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = A.sfxVol; sfxGain.connect(comp);
      musicGain = ctx.createGain(); musicGain.gain.value = A.musicVol * 0.85; musicGain.connect(comp);
      var len = ctx.sampleRate * 1.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = A.ctx = null; return false; }
    return true;
  };
  A.resume = function () { if (A.init() && ctx.state === 'suspended') ctx.resume(); };
  A.setVolumes = function (s, m) {
    if (s !== undefined) A.sfxVol = s;
    if (m !== undefined) A.musicVol = m;
    if (ctx) { sfxGain.gain.value = A.sfxVol; musicGain.gain.value = A.musicVol * 0.85; }
    try { localStorage.setItem('haedol.sfx', A.sfxVol); localStorage.setItem('haedol.music', A.musicVol); } catch (e) { /* 무시 */ }
  };

  /* ── 합성 부품 ── */
  function tone(o) {
    var t0 = ctx.currentTime + (o.t || 0), a = o.a || 0.004, d = o.d;
    var osc = ctx.createOscillator(), gn = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + a + d);
    if (o.vib) { var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = o.vib; lg.gain.value = o.vibAmt || 20; lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t0); lfo.stop(t0 + a + d + 0.05); }
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.linearRampToValueAtTime(o.vol, t0 + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    var node = osc;
    if (o.lp) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(gn); gn.connect(o.dest);
    osc.start(t0); osc.stop(t0 + a + d + 0.06);
  }
  function noise(o) {
    var t0 = ctx.currentTime + (o.t || 0), a = o.a || 0.003, d = o.d;
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), gn = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.ft || 'lowpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t0 + a + d);
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.linearRampToValueAtTime(o.vol, t0 + a);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    src.connect(f); f.connect(gn); gn.connect(o.dest);
    src.start(t0, Math.random()); src.stop(t0 + a + d + 0.06);
  }
  function notes(o, type, list, step, d, vol, lp) {
    for (var i = 0; i < list.length; i++) tone({ type: type, f0: list[i], d: d, vol: vol, dest: o, t: i * step, lp: lp });
  }

  /* ── 효과음 조리법 ── */
  var SFX = {
    click: function (o) { tone({ f0: 900, f1: 640, d: 0.05, vol: 0.22, dest: o }); },
    error: function (o) { tone({ type: 'square', f0: 150, d: 0.09, vol: 0.16, dest: o, lp: 900 }); tone({ type: 'square', f0: 118, d: 0.13, vol: 0.16, dest: o, t: 0.1, lp: 900 }); },
    place: function (o) { tone({ f0: 140, f1: 60, d: 0.14, vol: 0.4, dest: o }); noise({ f0: 900, d: 0.05, vol: 0.2, dest: o }); },
    sel_forge: function (o) { tone({ type: 'square', f0: 520, d: 0.06, vol: 0.1, dest: o, lp: 2400 }); tone({ type: 'square', f0: 392, d: 0.1, vol: 0.1, dest: o, t: 0.07, lp: 2400 }); noise({ ft: 'highpass', f0: 3500, d: 0.03, vol: 0.08, dest: o }); },
    sel_sprout: function (o) { tone({ f0: 720, f1: 380, d: 0.07, vol: 0.2, dest: o }); tone({ f0: 930, f1: 500, d: 0.07, vol: 0.18, dest: o, t: 0.08 }); },
    sel_storm: function (o) { noise({ ft: 'bandpass', f0: 800, f1: 3400, q: 3, d: 0.12, vol: 0.14, dest: o }); tone({ type: 'triangle', f0: 620, f1: 1320, d: 0.1, vol: 0.13, dest: o, t: 0.02 }); },
    ack_forge: function (o) { tone({ type: 'square', f0: 330, d: 0.05, vol: 0.1, dest: o, lp: 2000 }); tone({ type: 'square', f0: 440, d: 0.08, vol: 0.1, dest: o, t: 0.06, lp: 2000 }); noise({ ft: 'bandpass', f0: 2200, q: 4, d: 0.06, vol: 0.07, dest: o, t: 0.06 }); },
    ack_sprout: function (o) { tone({ f0: 520, f1: 780, d: 0.06, vol: 0.18, dest: o }); tone({ f0: 660, f1: 990, d: 0.07, vol: 0.16, dest: o, t: 0.07 }); noise({ ft: 'highpass', f0: 5000, d: 0.05, vol: 0.04, dest: o }); },
    ack_storm: function (o) { tone({ type: 'triangle', f0: 880, f1: 1320, d: 0.06, vol: 0.14, dest: o }); noise({ ft: 'bandpass', f0: 1500, f1: 5000, q: 2, d: 0.1, vol: 0.1, dest: o }); },
    atk: function (o) { tone({ type: 'sawtooth', f0: 196, d: 0.07, vol: 0.13, dest: o, lp: 1600 }); tone({ type: 'sawtooth', f0: 262, d: 0.1, vol: 0.13, dest: o, t: 0.08, lp: 1600 }); },
    // 무기
    w_wrench: function (o) { tone({ type: 'square', f0: 1400, d: 0.03, vol: 0.06, dest: o }); noise({ ft: 'highpass', f0: 4000, d: 0.02, vol: 0.06, dest: o }); },
    w_slap: function (o) { noise({ ft: 'bandpass', f0: 1200, q: 2, d: 0.04, vol: 0.12, dest: o }); },
    w_hammer: function (o) { tone({ type: 'triangle', f0: 1240, f1: 900, d: 0.16, vol: 0.14, dest: o }); tone({ type: 'square', f0: 2100, d: 0.05, vol: 0.05, dest: o }); noise({ ft: 'bandpass', f0: 2600, q: 5, d: 0.06, vol: 0.22, dest: o }); tone({ f0: 170, f1: 70, d: 0.09, vol: 0.25, dest: o }); },
    w_nail: function (o) { noise({ ft: 'highpass', f0: 2500, d: 0.03, vol: 0.14, dest: o }); tone({ type: 'square', f0: 700, f1: 300, d: 0.03, vol: 0.07, dest: o }); },
    w_gyro: function (o) { noise({ ft: 'bandpass', f0: 1800, q: 1.5, d: 0.035, vol: 0.13, dest: o }); tone({ type: 'square', f0: 480, f1: 240, d: 0.03, vol: 0.06, dest: o }); },
    w_cannon: function (o) { tone({ f0: 130, f1: 38, d: 0.3, vol: 0.5, dest: o }); noise({ f0: 2200, f1: 180, d: 0.22, vol: 0.34, dest: o }); },
    w_mortar: function (o) { tone({ f0: 95, f1: 45, d: 0.22, vol: 0.45, dest: o }); noise({ f0: 700, f1: 120, d: 0.2, vol: 0.3, dest: o }); noise({ ft: 'bandpass', f0: 1400, f1: 3200, q: 6, d: 0.5, vol: 0.05, dest: o, t: 0.08 }); },
    w_burr: function (o) { tone({ type: 'triangle', f0: 320, f1: 150, d: 0.06, vol: 0.16, dest: o }); noise({ ft: 'bandpass', f0: 3200, q: 3, d: 0.03, vol: 0.1, dest: o }); },
    w_seed: function (o) { tone({ f0: 950, f1: 280, d: 0.05, vol: 0.2, dest: o }); noise({ ft: 'highpass', f0: 3000, d: 0.02, vol: 0.05, dest: o }); },
    w_thorn: function (o) { noise({ ft: 'bandpass', f0: 5000, f1: 1500, q: 3, d: 0.09, vol: 0.16, dest: o }); tone({ f0: 600, f1: 240, d: 0.05, vol: 0.1, dest: o }); },
    w_pollen: function (o) { noise({ ft: 'bandpass', f0: 3000, q: 1.2, d: 0.07, vol: 0.09, dest: o }); },
    w_smash: function (o) { tone({ f0: 100, f1: 40, d: 0.24, vol: 0.5, dest: o }); noise({ f0: 500, f1: 90, d: 0.2, vol: 0.34, dest: o }); tone({ type: 'triangle', f0: 240, f1: 120, d: 0.08, vol: 0.14, dest: o }); },
    w_gourd: function (o) { tone({ f0: 180, f1: 520, d: 0.1, vol: 0.2, dest: o }); tone({ f0: 520, f1: 140, d: 0.16, vol: 0.16, dest: o, t: 0.1 }); },
    w_blade: function (o) { noise({ ft: 'bandpass', f0: 3500, f1: 9000, q: 4, d: 0.09, vol: 0.14, dest: o }); tone({ type: 'triangle', f0: 2200, f1: 3200, d: 0.05, vol: 0.05, dest: o }); },
    w_arrow: function (o) { tone({ type: 'sawtooth', f0: 1500, f1: 320, d: 0.12, vol: 0.1, dest: o, lp: 4000 }); noise({ ft: 'highpass', f0: 5000, d: 0.05, vol: 0.07, dest: o }); },
    w_talon: function (o) { tone({ type: 'sawtooth', f0: 2000, f1: 500, d: 0.1, vol: 0.09, dest: o, lp: 5000 }); noise({ ft: 'highpass', f0: 6000, d: 0.04, vol: 0.07, dest: o }); },
    w_chain: function (o) { tone({ type: 'sawtooth', f0: 140, d: 0.2, vol: 0.14, dest: o, vib: 62, vibAmt: 90, lp: 3200 }); noise({ ft: 'highpass', f0: 3800, d: 0.16, vol: 0.14, dest: o }); tone({ type: 'square', f0: 1900, f1: 500, d: 0.07, vol: 0.05, dest: o }); },
    w_rodzap: function (o) { tone({ type: 'sawtooth', f0: 180, d: 0.24, vol: 0.14, dest: o, vib: 74, vibAmt: 120, lp: 3600 }); noise({ ft: 'highpass', f0: 4200, d: 0.2, vol: 0.14, dest: o }); },
    w_strike: function (o) { tone({ f0: 70, f1: 110, d: 0.3, vol: 0.3, dest: o }); noise({ ft: 'bandpass', f0: 300, f1: 1400, q: 2, d: 0.4, vol: 0.12, dest: o }); },
    // 폭발 / 파괴
    boom_mortar: function (o) { noise({ f0: 1800, f1: 90, d: 0.55, vol: 0.55, dest: o }); tone({ f0: 80, f1: 32, d: 0.5, vol: 0.55, dest: o }); },
    boom_gourd: function (o) { noise({ f0: 1200, f1: 200, d: 0.3, vol: 0.4, dest: o }); tone({ f0: 240, f1: 70, d: 0.2, vol: 0.3, dest: o, vib: 28, vibAmt: 50 }); noise({ ft: 'bandpass', f0: 700, q: 3, d: 0.16, vol: 0.2, dest: o, t: 0.05 }); },
    boom_strike: function (o) { noise({ ft: 'highpass', f0: 1800, d: 0.09, vol: 0.5, dest: o }); noise({ f0: 2600, f1: 70, d: 1.0, vol: 0.5, dest: o, t: 0.03 }); tone({ f0: 62, f1: 30, d: 0.8, vol: 0.45, dest: o, t: 0.03 }); },
    die_forge: function (o) { noise({ f0: 1400, f1: 120, d: 0.32, vol: 0.38, dest: o }); tone({ type: 'square', f0: 420, f1: 90, d: 0.2, vol: 0.09, dest: o, lp: 1800 }); tone({ type: 'triangle', f0: 1700, f1: 1100, d: 0.2, vol: 0.06, dest: o, t: 0.05 }); },
    die_sprout: function (o) { noise({ ft: 'bandpass', f0: 2600, f1: 600, q: 1, d: 0.3, vol: 0.24, dest: o }); tone({ f0: 300, f1: 90, d: 0.16, vol: 0.2, dest: o }); },
    die_storm: function (o) { tone({ type: 'sawtooth', f0: 900, f1: 80, d: 0.3, vol: 0.12, dest: o, vib: 45, vibAmt: 120, lp: 3500 }); noise({ ft: 'highpass', f0: 3000, d: 0.2, vol: 0.14, dest: o }); },
    die_building: function (o) {
      noise({ f0: 2400, f1: 60, d: 1.3, vol: 0.7, dest: o }); tone({ f0: 70, f1: 26, d: 1.1, vol: 0.6, dest: o });
      noise({ ft: 'bandpass', f0: 900, q: 2, d: 0.18, vol: 0.3, dest: o, t: 0.22 }); noise({ ft: 'bandpass', f0: 600, q: 2, d: 0.22, vol: 0.28, dest: o, t: 0.5 });
    },
    // 알림
    built_forge: function (o) { notes(o, 'square', [262, 392, 523], 0.09, 0.2, 0.1, 2200); noise({ ft: 'bandpass', f0: 2800, q: 6, d: 0.1, vol: 0.12, dest: o }); },
    built_sprout: function (o) { notes(o, 'sine', [659, 784, 988], 0.09, 0.22, 0.2); },
    built_storm: function (o) { notes(o, 'triangle', [587, 880, 1175], 0.08, 0.24, 0.16); noise({ ft: 'bandpass', f0: 1200, f1: 4200, q: 2, d: 0.3, vol: 0.06, dest: o }); },
    ready: function (o) { notes(o, 'triangle', [523, 784], 0.07, 0.12, 0.14); },
    research: function (o) { notes(o, 'triangle', [523, 659, 784, 1047], 0.08, 0.26, 0.15); },
    alert: function (o) { notes(o, 'square', [660, 440, 660, 440], 0.13, 0.11, 0.11, 2000); },
    deposit: function (o) { tone({ f0: 1568, d: 0.07, vol: 0.05, dest: o }); tone({ f0: 2093, d: 0.09, vol: 0.04, dest: o, t: 0.04 }); },
    beam: function (o) { tone({ type: 'sawtooth', f0: 1200, f1: 2400, d: 0.06, vol: 0.03, dest: o, lp: 5000 }); },
    buildstart: function (o) { tone({ f0: 180, f1: 80, d: 0.12, vol: 0.3, dest: o }); noise({ f0: 1200, f1: 300, d: 0.12, vol: 0.16, dest: o }); },
    // 진영 기술
    pw_barrage: function (o) {
      tone({ type: 'sawtooth', f0: 1900, f1: 300, d: 0.95, vol: 0.11, dest: o, lp: 3800 }); tone({ type: 'sawtooth', f0: 1500, f1: 240, d: 0.95, vol: 0.08, dest: o, lp: 3200, t: 0.14 });
      noise({ ft: 'bandpass', f0: 2600, f1: 500, q: 3, d: 0.9, vol: 0.1, dest: o }); tone({ f0: 110, f1: 52, d: 0.3, vol: 0.4, dest: o });
    },
    pw_bloom: function (o) { notes(o, 'sine', [523, 659, 784, 1047, 1319], 0.085, 0.5, 0.15); tone({ f0: 262, d: 0.9, vol: 0.14, dest: o, a: 0.15 }); noise({ ft: 'highpass', f0: 6000, d: 0.7, vol: 0.035, dest: o, a: 0.2 }); },
    pw_tempest: function (o) { noise({ f0: 420, f1: 60, d: 1.6, vol: 0.5, dest: o, a: 0.15 }); tone({ f0: 56, f1: 38, d: 1.4, vol: 0.4, dest: o, a: 0.1 }); noise({ ft: 'bandpass', f0: 900, f1: 2800, q: 1.5, d: 0.8, vol: 0.1, dest: o, a: 0.3 }); },
    pw_ready: function (o) { notes(o, 'triangle', [784, 1047, 1568], 0.075, 0.32, 0.14); },
    rank: function (o) { notes(o, 'triangle', [880, 1175, 1760], 0.06, 0.2, 0.1); },
    supply: function (o) { notes(o, 'square', [330, 262], 0.15, 0.18, 0.1, 1600); },
    victory: function (o) { notes(o, 'triangle', [523, 659, 784, 1047, 784, 1047, 1319], 0.16, 0.5, 0.2); notes(o, 'sawtooth', [131, 131, 196, 262, 196, 262, 330], 0.16, 0.5, 0.08, 900); },
    defeat: function (o) { notes(o, 'triangle', [392, 349, 311, 262, 196], 0.24, 0.6, 0.2); notes(o, 'sawtooth', [98, 87, 78, 65, 49], 0.24, 0.7, 0.1, 700); }
  };
  var GAP = { w_nail: 0.045, w_gyro: 0.05, w_pollen: 0.06, deposit: 0.3, beam: 0.25, w_wrench: 0.1, w_slap: 0.1, alert: 3, die_building: 0.2, rank: 0.6, supply: 3, pw_ready: 2 };

  // 소리 내기. pan: -1(왼쪽)~1(오른쪽)
  A.play = function (name, vol, pan) {
    if (!ctx || ctx.state !== 'running' || A.sfxVol <= 0) return;
    var fn = SFX[name];
    if (!fn) return;
    var now = ctx.currentTime, gap = GAP[name] === undefined ? 0.06 : GAP[name];
    if (last[name] !== undefined && now - last[name] < gap) return;
    while (recent.length && now - recent[0] > 0.12) recent.shift();
    if (recent.length > 9) return;
    last[name] = now; recent.push(now);
    var out = ctx.createGain();
    out.gain.value = vol === undefined ? 1 : vol;
    if (pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = R.clamp(pan, -1, 1); out.connect(p); p.connect(sfxGain); }
    else out.connect(sfxGain);
    try { fn(out); } catch (e) { /* 소리 하나가 실패해도 계속 */ }
  };

  // 월드 좌표의 소리: 화면에서 멀수록 작게
  A.at = function (name, x, y, G, vol) {
    if (!ctx) return;
    var cam = G.cam, hw = G.vw / 2 / cam.zoom, hh = G.vh / 2 / cam.zoom;
    var dx = x - cam.x, dy = y - cam.y;
    var k = Math.max(Math.abs(dx) / (hw * 1.7), Math.abs(dy) / (hh * 1.7));
    if (k >= 1) return;
    A.play(name, (vol === undefined ? 1 : vol) * (1 - k * k) * R.clamp(cam.zoom, 0.6, 1.2), R.clamp(dx / hw, -1, 1) * 0.75);
  };

  A.onEvent = function (ev, G) {
    switch (ev.t) {
      case 'shot': A.at('w_' + ev.fx, ev.x, ev.y, G, ev.charged ? 1.25 : 1); break;
      case 'boom': A.at('boom_' + ev.fx, ev.x, ev.y, G); break;
      case 'hit': if (ev.fx === 'cannon') A.at('boom_gourd', ev.x, ev.y, G, 0.5); break;
      case 'death':
        if (ev.kind === 'building') A.at('die_building', ev.x, ev.y, G, 1.2);
        else A.at('die_' + R.UNITS[ev.type].faction, ev.x, ev.y, G, 0.9);
        break;
      case 'buildStart': A.at('buildstart', ev.x, ev.y, G); break;
      case 'deposit': A.at('deposit', ev.x, ev.y, G); break;
      case 'beam': A.at('beam', ev.x, ev.y, G); break;
    }
  };

  /* ══════════ 배경 음악: 16분음표 단위 순차 연주기 ══════════ */
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  var THEMES = {
    menu: {
      bpm: 80, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], bass: [38, 34, 41, 36],
      bassPat: [0, 8], arpPat: [0, 4, 8, 10, 12], kick: [0], snare: [], hat: [4, 12], lead: 'triangle', leadLp: 1800, padLp: 650,
      mel: [[0, 69, 6], [8, 65, 4], [12, 67, 4], [16, 70, 8], [28, 69, 4], [32, 72, 6], [40, 69, 4], [44, 65, 4], [48, 67, 10]]
    },
    forge: {
      bpm: 96, chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], bass: [40, 36, 38, 35],
      bassPat: [0, 4, 8, 10, 12], arpPat: [0, 6, 8, 14], kick: [0, 8, 10], snare: [4, 12, 15], hat: [2, 6, 10, 14], lead: 'sawtooth', leadLp: 1500, padLp: 600, anvil: [4, 12],
      mel: [[0, 64, 6], [6, 67, 2], [8, 71, 6], [16, 72, 4], [20, 71, 4], [24, 67, 8], [32, 66, 6], [38, 69, 2], [40, 74, 6], [48, 71, 4], [52, 69, 4], [56, 66, 8]]
    },
    sprout: {
      bpm: 104, chords: [[55, 59, 62], [52, 55, 59], [48, 52, 55], [50, 54, 57]], bass: [43, 40, 36, 38],
      bassPat: [0, 6, 8, 14], arpPat: [0, 3, 6, 8, 11, 14], kick: [0, 8], snare: [12], hat: [2, 4, 6, 10, 12, 14], lead: 'sine', leadLp: 3000, padLp: 800,
      mel: [[0, 74, 3], [3, 76, 3], [6, 79, 4], [12, 76, 4], [16, 71, 3], [19, 74, 3], [22, 76, 6], [32, 72, 3], [35, 76, 3], [38, 79, 4], [44, 76, 4], [48, 74, 3], [51, 78, 3], [54, 81, 8]]
    },
    storm: {
      bpm: 120, chords: [[50, 53, 57], [55, 59, 62], [57, 60, 64], [48, 52, 55]], bass: [38, 43, 45, 36],
      bassPat: [0, 3, 6, 8, 11, 14], arpPat: [0, 2, 4, 6, 8, 10, 12, 14], kick: [0, 6, 8], snare: [4, 12], hat: [1, 3, 5, 7, 9, 11, 13, 15], lead: 'square', leadLp: 1700, padLp: 700, tom: [13, 14, 15],
      mel: [[0, 74, 2], [2, 77, 2], [4, 81, 4], [10, 79, 2], [12, 77, 4], [16, 74, 2], [18, 79, 2], [20, 83, 6], [32, 76, 2], [34, 81, 2], [36, 84, 4], [42, 81, 2], [44, 79, 4], [48, 76, 2], [50, 79, 2], [52, 72, 8]]
    }
  };
  var M = { th: null, name: '', step: 0, next: 0, timer: null, intensity: 0, target: 0, delay: null };

  function mtone(type, f, t, d, vol, lp, a) {
    var osc = ctx.createOscillator(), gn = ctx.createGain(), fl = ctx.createBiquadFilter();
    osc.type = type; osc.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.value = lp || 2000;
    a = a || 0.01;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol, t + a); gn.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    osc.connect(fl); fl.connect(gn); gn.connect(musicGain);
    if (M.delay && type !== 'sawtooth') gn.connect(M.delay);
    osc.start(t); osc.stop(t + a + d + 0.05);
  }
  function mnoise(t, d, vol, ft, f0, f1) {
    var src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), gn = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; fl.type = ft; fl.frequency.setValueAtTime(f0, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + d);
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(fl); fl.connect(gn); gn.connect(musicGain);
    src.start(t, Math.random()); src.stop(t + d + 0.05);
  }
  function mkick(t, vol) {
    var osc = ctx.createOscillator(), gn = ctx.createGain();
    osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gn); gn.connect(musicGain); osc.start(t); osc.stop(t + 0.26);
  }

  function schedule(th, step, t) {
    var sd = 60 / th.bpm / 4, bar = Math.floor(step / 16) % 4, s = step % 16, I = M.intensity;
    var ch = th.chords[bar], i;
    // 패드
    if (s === 0) for (i = 0; i < 3; i++) { mtone('sawtooth', hz(ch[i]), t, sd * 15, 0.045, th.padLp, sd * 3); mtone('sawtooth', hz(ch[i]) * 1.006, t, sd * 15, 0.035, th.padLp, sd * 3); }
    // 베이스
    if (th.bassPat.indexOf(s) >= 0) mtone('triangle', hz(th.bass[bar]), t, sd * 2.2, 0.2 + I * 0.06, 500);
    // 분산화음
    var ai = th.arpPat.indexOf(s);
    if (ai >= 0) {
      var note = ch[(ai + bar) % 3] + 12 + ((ai % 4 === 3) ? 12 : 0);
      mtone(th.lead === 'sine' ? 'sine' : 'triangle', hz(note), t, sd * 1.6, 0.07 + I * 0.03, th.leadLp + 600);
    }
    // 가락 (4마디 = 64스텝 한 바퀴, 두 번에 한 번은 쉰다)
    var loop = Math.floor(step / 64), ms = step % 64;
    if (loop % 2 === 1 || I > 0.5) {
      for (i = 0; i < th.mel.length; i++) if (th.mel[i][0] === ms) mtone(th.lead, hz(th.mel[i][1]), t, sd * th.mel[i][2], th.lead === 'sine' ? 0.13 : 0.075, th.leadLp, 0.015);
    }
    // 타악
    if (th.kick.indexOf(s) >= 0 && (I > 0.2 || s === 0 || th === THEMES.forge)) mkick(t, 0.32 + I * 0.16);
    if (th.snare.indexOf(s) >= 0 && I > 0.35) mnoise(t, 0.12, 0.14 + I * 0.1, 'bandpass', 1800);
    if (th.hat.indexOf(s) >= 0) mnoise(t, 0.035, 0.035 + I * 0.035, 'highpass', 7000);
    if (th.anvil && th.anvil.indexOf(s) >= 0 && I > 0.2) { mtone('triangle', 1760, t, 0.14, 0.035, 5000, 0.002); mtone('square', 2640, t, 0.05, 0.012, 6000, 0.002); }
    if (th.tom && th.tom.indexOf(s) >= 0 && bar === 3 && I > 0.3) {
      var osc = ctx.createOscillator(), gn = ctx.createGain(), f0 = 200 - (s - 13) * 35;
      osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.14);
      gn.gain.setValueAtTime(0.2, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gn); gn.connect(musicGain); osc.start(t); osc.stop(t + 0.2);
    }
  }

  function pump() {
    if (!ctx || !M.th || ctx.state !== 'running') return;
    if (M.next < ctx.currentTime - 0.5) M.next = ctx.currentTime + 0.05;   // 탭이 쉬다 돌아왔을 때
    M.intensity += (M.target - M.intensity) * 0.06;
    var sd = 60 / M.th.bpm / 4;
    while (M.next < ctx.currentTime + 0.3) {
      try { schedule(M.th, M.step, M.next); } catch (e) { /* 무시 */ }
      M.step++; M.next += sd;
    }
  }

  A.music = function (name) {
    if (!A.init()) return;
    if (M.name === name && M.timer) return;
    M.name = name; M.th = THEMES[name] || null; M.step = 0; M.next = ctx.currentTime + 0.12; M.intensity = 0; M.target = 0;
    if (!M.delay) {
      try {
        M.delay = ctx.createDelay(1.0); M.delay.delayTime.value = 0.33;
        var fb = ctx.createGain(); fb.gain.value = 0.3;
        var wet = ctx.createGain(); wet.gain.value = 0.3;
        M.delay.connect(fb); fb.connect(M.delay); M.delay.connect(wet); wet.connect(musicGain);
      } catch (e) { M.delay = null; }
    }
    if (!M.timer) M.timer = setInterval(pump, 70);
  };
  A.stopMusic = function () { M.th = null; M.name = ''; };
  A.setIntensity = function (v) { M.target = R.clamp(v, 0, 1); };
  A.names = function () { return Object.keys(SFX); };

  // 진단용: 지금 스피커로 나가는 신호의 최대 진폭(0~1). 소리가 실제로 나는지, 찢어지지 않는지 확인할 때 쓴다
  var meterNode = null, meterBuf = null;
  A.meter = function () {
    if (!ctx) return 0;
    if (!meterNode) { meterNode = ctx.createAnalyser(); meterNode.fftSize = 2048; comp.connect(meterNode); meterBuf = new Float32Array(2048); }
    meterNode.getFloatTimeDomainData(meterBuf);
    var p = 0;
    for (var i = 0; i < meterBuf.length; i++) { var v = Math.abs(meterBuf[i]); if (v > p) p = v; }
    return p;
  };

  // 자가 점검: 모든 효과음과 음악 한 마디를 실제로 합성해 보고, 실패한 이름을 돌려준다
  A.selfTest = function () {
    var fails = [];
    if (!A.init()) return ['AudioContext 없음'];
    Object.keys(SFX).forEach(function (name) {
      try { var out = ctx.createGain(); out.gain.value = 0.0001; out.connect(sfxGain); SFX[name](out); } catch (e) { fails.push(name + ': ' + e.message); }
    });
    Object.keys(THEMES).forEach(function (name) {
      try { for (var s = 0; s < 64; s++) schedule(THEMES[name], s, ctx.currentTime + 0.05 + s * 0.01); } catch (e) { fails.push('music ' + name + ': ' + e.message); }
    });
    return fails;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
