/* 소리 — 파일 없이 WebAudio 로 전부 합성한다.
 *  · 학교 종(딩동댕동, 방송 스피커 음색), 감독관 발소리(구두 / 실내화), 내 발소리
 *  · 수험생 소리: 펜 사각거림·사인펜 마킹·종이 넘김·한숨·기침·헛기침·훌쩍임·의자 삐걱·펜 톡톡
 *  · 교실 바탕 소리: 공기 소리, 형광등 험, 벽시계 째깍, 창밖 새소리·차 소리, 복도 발소리
 *  · AI 안경: 안경다리를 톡 치는 소리, 진동(지잉), 일하는 동안의 가는 코일 소리, 효과음 / 전자기기 탐지기
 *  · 긴장: 심장 박동(쿵-쿵), 떨리는 숨, 긴장할수록 교실 소리가 먹먹하게 멀어진다
 * 소리가 나가는 길은 둘이다. 교실에서 나는 소리(dry·wet)는 긴장하면 먹먹해지는 거름막(muffle)을 거치고,
 * 내 몸에서 나는 소리(inner: 심장·숨·안경 진동)는 거치지 않는다.
 * 어떤 호출이 실패해도 게임이 멈추지 않도록 바깥쪽 함수는 모두 safe() 로 감싼다.
 */
(function (GX) {
  'use strict';

  var A = { ctx: null, ok: false, muted: false, volume: 0.8 };
  var master, dry, wet, inner, muffle, comp, noiseBuf, pinkBuf, crinkleBuf, clip;
  var lensNodes = null, ambNodes = null, tickNext = 0, tickN = 0, roomNext = 0, lastTension = -1;
  var busy = [], lp = [0, 1.2, 0];
  var MAX_VOICES = 22;

  function safe(fn) {
    return function () {
      if (!A.ok) return undefined;
      try { return fn.apply(null, arguments); } catch (e) { A.lastError = e; return undefined; }
    };
  }
  function now() { return A.ctx.currentTime; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  A.init = function () {
    if (A.ctx) return A.ok;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      var ctx = A.ctx = new AC(), sr = ctx.sampleRate, i, ch, d;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
      master = ctx.createGain();
      master.gain.value = A.muted ? 0 : A.volume;
      master.connect(comp); comp.connect(ctx.destination);
      muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.5;
      muffle.connect(master);
      dry = ctx.createGain(); dry.gain.value = 1; dry.connect(muffle);
      inner = ctx.createGain(); inner.gain.value = 1; inner.connect(master);
      /* 교실 울림: 처음 몇 번의 또렷한 반사 + 높은 소리부터 사그라지는 꼬리 */
      var len = Math.floor(sr * 0.95), ir = ctx.createBuffer(2, len, sr);
      for (ch = 0; ch < 2; ch++) {
        d = ir.getChannelData(ch);
        var lpv = 0;
        for (i = 0; i < len; i++) {
          var t = i / len, w = Math.random() * 2 - 1;
          lpv += (w - lpv) * (0.75 - 0.6 * t);
          d[i] = lpv * Math.pow(1 - t, 3.4) * (i < 400 ? i / 400 : 1);
        }
        for (i = 0; i < 6; i++) {
          var at = Math.floor(sr * (0.006 + Math.random() * 0.034));
          d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - i * 0.06);
        }
      }
      var conv = ctx.createConvolver(); conv.buffer = ir;
      wet = ctx.createGain(); wet.gain.value = 0.2;
      wet.connect(conv); conv.connect(muffle);
      /* 잡음 세 가지: 흰 잡음, 낮은 쪽이 두터운 잡음, 종이 구겨지는 듯한 자잘한 튐 */
      var nl = sr * 2;
      noiseBuf = ctx.createBuffer(1, nl, sr); d = noiseBuf.getChannelData(0);
      for (i = 0; i < nl; i++) d[i] = Math.random() * 2 - 1;
      pinkBuf = ctx.createBuffer(1, nl, sr); d = pinkBuf.getChannelData(0);
      var b0 = 0, b1 = 0, b2 = 0;
      for (i = 0; i < nl; i++) {
        var wn = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + wn * 0.0990460; b1 = 0.96300 * b1 + wn * 0.2965164; b2 = 0.57000 * b2 + wn * 1.0526913;
        d[i] = (b0 + b1 + b2 + wn * 0.1848) * 0.22;
      }
      crinkleBuf = ctx.createBuffer(1, nl, sr); d = crinkleBuf.getChannelData(0);
      var amp = 0;
      for (i = 0; i < nl; i++) {
        if (Math.random() < 0.0035) amp = 0.4 + Math.random() * 0.6;
        amp *= 0.9;
        d[i] = (Math.random() * 2 - 1) * amp;
      }
      clip = new Float32Array(257);
      for (i = 0; i < 257; i++) { var x = i / 128 - 1; clip[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
      A.ok = true;
    } catch (e) { A.ok = false; A.lastError = e; }
    return A.ok;
  };

  A.resume = function () {
    if (!A.ctx) return;
    try { if (A.ctx.state !== 'running') { var p = A.ctx.resume(); if (p && p.catch) p.catch(function () {}); } } catch (e) { /* 무시 */ }
  };
  A.suspend = function () {
    if (!A.ctx) return;
    try { var p = A.ctx.suspend(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* 무시 */ }
  };
  A.setVolume = safe(function (v) {
    A.volume = v;
    master.gain.setTargetAtTime(A.muted ? 0 : v, now(), 0.03);
  });
  A.setMuted = function (m) {
    A.muted = !!m;
    if (A.ok) { try { master.gain.setTargetAtTime(A.muted ? 0 : A.volume, now(), 0.03); } catch (e) { /* 무시 */ } }
  };

  /* 듣는 위치·방향 = 카메라 */
  A.listener = safe(function (x, y, z, fx, fy, fz) {
    var L = A.ctx.listener, t = now();
    lp[0] = x; lp[1] = y; lp[2] = z;
    if (L.positionX) {
      L.positionX.setValueAtTime(x, t); L.positionY.setValueAtTime(y, t); L.positionZ.setValueAtTime(z, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(fy, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition(x, y, z); L.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  });
  function distTo(x, y, z) { var dx = x - lp[0], dy = y - lp[1], dz = z - lp[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  /* 동시에 울리는 자잘한 소리의 수를 제한한다. 자리가 있으면 true */
  function slot(dur) {
    var t = now(), i;
    for (i = busy.length - 1; i >= 0; i--) if (busy[i] <= t) busy.splice(i, 1);
    if (busy.length >= MAX_VOICES) return false;
    busy.push(t + dur);
    return true;
  }

  /* 출력 노드: pos 가 있으면 공간 음향(hrtf 면 머리 전달 함수, 아니면 가벼운 좌우 패닝), 없으면 그대로. rev = 울림 보내는 양 */
  function out(pos, rev, hrtf) {
    var ctx = A.ctx, g = ctx.createGain(), head = g;
    if (pos) {
      var p = ctx.createPanner();
      p.panningModel = hrtf === false ? 'equalpower' : 'HRTF';
      p.distanceModel = 'inverse'; p.refDistance = 1.4; p.rolloffFactor = 1.1; p.maxDistance = 40;
      if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; }
      else p.setPosition(pos[0], pos[1], pos[2]);
      g.connect(p); head = p;
    }
    head.connect(dry);
    if (rev) { var s = ctx.createGain(); s.gain.value = rev; head.connect(s); s.connect(wet); }
    return g;
  }
  /* 내 몸에서 나는 소리용 출력(심장·숨·안경 진동). pan: -1 왼쪽 … 1 오른쪽 */
  function outIn(pan) {
    var ctx = A.ctx, g = ctx.createGain();
    if (pan && typeof ctx.createStereoPanner === 'function') {
      var p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(inner);
    } else g.connect(inner);
    return g;
  }
  function bq(type, freq, q, gain) {
    var f = A.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    if (gain) f.gain.value = gain;
    return f;
  }
  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  /* 잡음 한 덩이. buf: 잡음 종류(기본 흰 잡음). 필터 노드를 돌려준다(주파수를 움직일 때 씀) */
  function noise(dest, t, dur, type, freq, q, peak, attack, buf) {
    var ctx = A.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf || noiseBuf; src.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    env(g, t, peak, attack || 0.004, dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + (attack || 0.004) + 0.05);
    return f;
  }
  function tone(dest, t, freq, dur, peak, type, attack, endFreq) {
    var ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    env(g, t, peak, attack || 0.004, dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + (attack || 0.004) + 0.05);
  }

  var SPK = [-1.25, 2.56, -4.7];     /* 칠판 위 스피커 */

  /* 학교 종 한 음: 전자 차임(배음이 조금 어긋난 맑은 소리) */
  function bellNote(dest, t, f, dur) {
    var P = [[1, 1, 1], [2, 0.4, 0.6], [3, 0.15, 0.42], [4.2, 0.07, 0.3], [5.4, 0.035, 0.2]];
    for (var i = 0; i < P.length; i++) tone(dest, t, f * P[i][0], dur * P[i][2], 0.42 * P[i][1], 'sine', 0.004);
    tone(dest, t, f * 1.004, dur * 0.8, 0.12, 'sine', 0.006);
    noise(dest, t, 0.012, 'bandpass', 2200, 1.2, 0.1, 0.001);
  }
  /* 종소리: 준비령(prep)은 앞 소절만, 본령(start)·종료령(end)은 끝까지. 교실 스피커와 복도 스피커에서 함께 울린다. 길이(초)를 돌려준다 */
  A.chime = safe(function (kind) {
    var ctx = A.ctx, t = now() + 0.06, step = 0.62, i;
    var bus = ctx.createGain(); bus.gain.value = 0.9;
    var hp = bq('highpass', 380, 0.7), pk = bq('peaking', 1500, 1.1, 5), ws = ctx.createWaveShaper(), lpf = bq('lowpass', 3600, 0.7);
    ws.curve = clip;
    bus.connect(hp); hp.connect(pk); pk.connect(ws); ws.connect(lpf);
    var room = out(SPK, 0.7); room.gain.value = 0.42; lpf.connect(room);
    var dl = ctx.createDelay(); dl.delayTime.value = 0.12;
    var far = bq('lowpass', 850, 0.7), hall = out([5.25, 2.6, 0], 0.8, false);
    hall.gain.value = 0.3; lpf.connect(dl); dl.connect(far); far.connect(hall);
    var notes = [659.25, 523.25, 587.33, 392.0, 392.0, 587.33, 659.25, 523.25], n = kind === 'prep' ? 4 : 8, tt = t;
    for (i = 0; i < n; i++) {
      var last = i === 3 || i === 7;
      bellNote(bus, tt, notes[i], last ? 2.6 : 1.5);
      tt += step + (i === 3 ? 0.62 : 0);
    }
    return tt - t + 1.6;
  });
  A.bell = A.chime;

  /* 감독관 발소리. kind 0 = 구두(또각), 1 = 실내화(착) */
  A.step = safe(function (x, z, strength, kind) {
    var g = out([x, 0.05, z], 0.34), t = now(), s = strength === undefined ? 1 : strength;
    if (kind === 1) {
      g.gain.value = 0.7 * s;
      noise(g, t, 0.045, 'lowpass', 950 + Math.random() * 200, 0.7, 0.5, 0.002);
      noise(g, t + 0.03, 0.11, 'bandpass', 1300, 0.8, 0.13, 0.03, pinkBuf);
      tone(g, t, 105, 0.06, 0.28, 'sine', 0.003, 60);
    } else {
      g.gain.value = 0.9 * s;
      noise(g, t, 0.014, 'bandpass', 2000 + Math.random() * 500, 1.5, 0.55, 0.001);
      tone(g, t, 145 + Math.random() * 20, 0.085, 0.5, 'sine', 0.002, 66);
      noise(g, t + 0.012, 0.06, 'lowpass', 400, 0.7, 0.32, 0.002);
      noise(g, t + 0.075, 0.022, 'bandpass', 1450, 1.2, 0.2, 0.002);
    }
    if (Math.random() < 0.07) {        /* 마루가 삐걱 */
      var f = noise(g, t + 0.03, 0.2, 'bandpass', 330, 9, 0.5, 0.03);
      f.frequency.linearRampToValueAtTime(470 + Math.random() * 80, t + 0.22);
    }
  });
  /* 내 발소리(실내화) */
  A.ownStep = safe(function () {
    var g = out(null, 0.15), t = now();
    g.gain.value = 0.3;
    noise(g, t, 0.06, 'lowpass', 700 + Math.random() * 200, 0.7, 0.5, 0.003);
    tone(g, t, 95, 0.07, 0.3, 'sine', 0.003, 55);
  });

  /* 종이 한 장이 스치며 놓이는 소리 */
  A.paper = safe(function (x, y, z, loud) {
    var g = out(x === undefined ? null : [x, y, z], 0.25, false), t = now();
    g.gain.value = loud || 0.5;
    var f = noise(g, t, 0.22, 'bandpass', 2600, 0.8, 0.5, 0.02);
    f.frequency.exponentialRampToValueAtTime(5200, t + 0.2);
    noise(g, t + 0.1, 0.12, 'highpass', 4200, 0.7, 0.25, 0.01);
    noise(g, t, 0.16, 'highpass', 2500, 0.7, 0.3, 0.004, crinkleBuf);
  });
  /* 책장 넘기는 소리: 집는 바스락 → 넘어가는 바람 소리 → 내려앉는 소리 */
  function pageSound(g, t, v) {
    noise(g, t, 0.09, 'highpass', 3000, 0.7, 0.55 * v, 0.004, crinkleBuf);
    var f = noise(g, t + 0.05, 0.24, 'bandpass', 900, 0.7, 0.42 * v, 0.07, pinkBuf);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.26);
    noise(g, t + 0.09, 0.2, 'highpass', 4500, 0.7, 0.2 * v, 0.05);
    noise(g, t + 0.3, 0.05, 'lowpass', 1500, 0.7, 0.5 * v, 0.002);
    noise(g, t + 0.31, 0.12, 'highpass', 2600, 0.7, 0.3 * v, 0.004, crinkleBuf);
  }
  A.pageTurn = safe(function (v) {
    var g = out(null, 0.2);
    g.gain.value = 0.55;
    pageSound(g, now(), v === undefined ? 1 : v);
  });
  /* 사인펜으로 칸을 칠하는 소리(쓱쓱쓱) */
  function markSound(g, t, v) {
    for (var i = 0; i < 5; i++) {
      var f = noise(g, t + i * 0.062, 0.05, 'bandpass', i % 2 ? 2300 : 2900, 1.4, 0.5 * v, 0.008, pinkBuf);
      f.frequency.linearRampToValueAtTime(i % 2 ? 2800 : 2400, t + i * 0.062 + 0.05);
    }
    tone(g, t, 2900, 0.3, 0.012 * v, 'sine', 0.02, 2500);
    noise(g, t, 0.02, 'lowpass', 500, 0.7, 0.25 * v, 0.002);
  }
  A.penMark = safe(function () {
    var g = out(null, 0.08);
    g.gain.value = 0.5;
    markSound(g, now() + 0.16, 1);
  });

  /* ── 사람이 내는 소리 ── */
  /* 숨 섞인 목소리 통로: 모음 느낌을 내는 대역 두 개. k 는 목소리 높이(여자 > 남자) */
  function breathy(dest, t, dur, peak, f1, f2, k, attack, glide) {
    var a = noise(dest, t, dur, 'bandpass', f1 * k, 2.4, peak, attack, pinkBuf);
    var b = noise(dest, t, dur, 'bandpass', f2 * k, 3, peak * 0.6, attack, pinkBuf);
    if (glide) {
      a.frequency.exponentialRampToValueAtTime(f1 * k * glide, t + attack + dur);
      b.frequency.exponentialRampToValueAtTime(f2 * k * glide, t + attack + dur);
    }
    noise(dest, t, dur * 0.8, 'highpass', 3200, 0.7, peak * 0.12, attack);
  }
  /* 목청 소리(짧은 떨림)를 모음 대역에 통과시킨다 */
  function voiced(dest, t, dur, peak, pitch, f1, k) {
    var ctx = A.ctx, o = ctx.createOscillator(), f = bq('bandpass', f1 * k, 2.2), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch * k * 1.08, t);
    o.frequency.exponentialRampToValueAtTime(pitch * k * 0.8, t + dur);
    env(g, t, peak, 0.012, dur);
    o.connect(f); f.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.08);
  }
  function sighSound(g, t, k) {
    breathy(g, t, 0.45, 0.1, 1700, 2600, k, 0.25, 1.25);                /* 들이쉼 */
    breathy(g, t + 0.85, 1.1 + Math.random() * 0.4, 0.34, 680, 1350, k, 0.09, 0.78);   /* 길게 내쉼 */
    voiced(g, t + 0.86, 0.3, 0.05, 125, 600, k);
  }
  function coughSound(g, t, k, weak) {
    var v = weak ? 0.65 : 1;
    noise(g, t, 0.03, 'highpass', 500, 0.7, 0.9 * v, 0.002);            /* 터지는 순간 */
    breathy(g, t + 0.012, 0.16, 0.6 * v, 850, 1900, k, 0.004, 0.8);
    voiced(g, t + 0.03, 0.11, 0.2 * v, 135, 780, k);
    tone(g, t, 105, 0.07, 0.4 * v, 'sine', 0.003, 70);                  /* 가슴 울림 */
  }
  function throatSound(g, t, k) {
    for (var i = 0; i < 2; i++) {
      var tt = t + i * 0.2;
      voiced(g, tt, 0.13, 0.3, 112, 460, k);
      noise(g, tt, 0.11, 'lowpass', 900, 1, 0.3, 0.01, pinkBuf);
    }
  }
  function sniffSound(g, t) {
    var f = noise(g, t, 0.17, 'bandpass', 1300, 1.6, 0.4, 0.03, pinkBuf);
    f.frequency.exponentialRampToValueAtTime(3800, t + 0.19);
    if (Math.random() < 0.45) {
      var f2 = noise(g, t + 0.27, 0.13, 'bandpass', 1500, 1.6, 0.3, 0.03, pinkBuf);
      f2.frequency.exponentialRampToValueAtTime(3600, t + 0.4);
    }
  }
  /* 다른 수험생이 내는 소리. type: scribble · mark · page · tap · creak · sigh · cough · sniff · throat
   * voice: 목소리 높이(0.85~1.4). 멀거나 한꺼번에 너무 많으면 조용한 소리부터 건너뛴다 */
  A.npc = safe(function (type, x, y, z, voice, o) {
    var d = distTo(x, y, z), t = now(), k = voice || 1, small = type === 'scribble' || type === 'mark' || type === 'tap', g, i;
    if (d > 10) return;
    if (small && d > 3.5 && Math.random() < (d - 3.5) / 5) return;
    if (type === 'scribble') {
      var dur = (o && o.dur) || 0.5;
      if (!slot(dur)) return;
      g = out([x, y, z], 0.18, false); g.gain.value = 0.27;
      var n = Math.max(2, Math.round(dur / 0.105));
      for (i = 0; i < n; i++) {
        var tt = t + i * (dur / n) + Math.random() * 0.02;
        noise(g, tt, rnd(0.04, 0.075), 'bandpass', rnd(2700, 4600), 1.9, rnd(0.28, 0.5), 0.006, pinkBuf);
      }
      noise(g, t, dur, 'bandpass', 520, 1.2, 0.05, 0.02);
    } else if (type === 'mark') {
      if (!slot(0.4)) return;
      g = out([x, y, z], 0.15, false); g.gain.value = 0.34;
      markSound(g, t, 0.8);
    } else if (type === 'tap') {
      if (!slot(0.1)) return;
      g = out([x, y, z], 0.2, false); g.gain.value = 0.3;
      noise(g, t, 0.006, 'highpass', 1800, 0.7, 0.7, 0.001);
      tone(g, t, 900, 0.025, 0.25, 'sine', 0.001, 500);
      tone(g, t, 190, 0.04, 0.2, 'sine', 0.002, 150);
    } else if (type === 'page') {
      if (!slot(0.5)) return;
      g = out([x, y, z], 0.25, false); g.gain.value = 0.42;
      pageSound(g, t, rnd(0.7, 1));
    } else if (type === 'creak') {
      g = out([x, y, z], 0.3, false); g.gain.value = 0.3;
      var f = noise(g, t, 0.22, 'bandpass', rnd(520, 760), 8, 0.6, 0.03);
      f.frequency.linearRampToValueAtTime(rnd(380, 520), t + 0.24);
      tone(g, t + 0.02, rnd(360, 420), 0.14, 0.05, 'triangle', 0.02, 300);
      noise(g, t + 0.2, 0.05, 'lowpass', 300, 0.7, 0.25, 0.004);
    } else if (type === 'sigh') {
      g = out([x, y, z], 0.4, false); g.gain.value = 0.34;
      sighSound(g, t, k);
    } else if (type === 'cough') {
      g = out([x, y, z], 0.5); g.gain.value = 0.62;
      coughSound(g, t, k, o && o.n > 0);
    } else if (type === 'throat') {
      g = out([x, y, z], 0.4, false); g.gain.value = 0.4;
      throatSound(g, t, k);
    } else if (type === 'sniff') {
      g = out([x, y, z], 0.3, false); g.gain.value = 0.3;
      sniffSound(g, t);
    }
  });
  /* 예전 이름으로 부르는 곳을 위한 얇은 연결 */
  A.scribble = function (x, z) { A.npc('scribble', x, 0.76, z, 1, { dur: 0.5 }); };
  A.creak = function (x, z) { A.npc('creak', x, 0.4, z, 1); };

  A.door = safe(function (x, z) {
    var g = out([x, 1, z], 0.45), t = now();
    g.gain.value = 0.8;
    var f = noise(g, t, 0.75, 'bandpass', 380, 0.9, 0.5, 0.08);
    f.frequency.linearRampToValueAtTime(240, t + 0.7);
    noise(g, t, 0.7, 'bandpass', 1900, 3, 0.06, 0.1);
    noise(g, t + 0.78, 0.09, 'lowpass', 600, 0.7, 0.9, 0.002);
    tone(g, t + 0.78, 85, 0.14, 0.7, 'sine', 0.002, 48);
  });
  A.clunk = safe(function (x, y, z) {
    var g = out(x === undefined ? null : [x, y, z], 0.2, false), t = now();
    g.gain.value = 0.6;
    noise(g, t, 0.05, 'bandpass', 1500, 1.5, 0.6, 0.001);
    tone(g, t, 240, 0.06, 0.4, 'triangle', 0.001, 150);
  });
  A.sit = safe(function () {
    var g = out(null, 0.25), t = now();
    g.gain.value = 0.5;
    noise(g, t, 0.18, 'lowpass', 500, 0.7, 0.6, 0.02);
    var f = noise(g, t + 0.04, 0.2, 'bandpass', 620, 7, 0.4, 0.03);
    f.frequency.linearRampToValueAtTime(430, t + 0.24);
    tone(g, t + 0.16, 80, 0.12, 0.5, 'sine', 0.004, 50);
  });

  /* 말소리 흉내: 글자 수만큼 짧은 음을 이어 낸다. kind: 'proctor'(정감독) | 'proctor2'(부감독) | 'pa' | 'me' */
  A.voice = safe(function (text, kind, pos) {
    var ctx = A.ctx, pa = kind === 'pa';
    var g = out(pa ? SPK : (pos || null), pa ? 0.55 : 0.3), t = now() + 0.03;
    g.gain.value = pa ? 0.3 : 0.36;
    var base = pa ? 215 : (kind === 'me' ? 165 : (kind === 'proctor2' ? 208 : 122));
    var dest = g;
    if (pa) {
      var hp = ctx.createBiquadFilter(), lpf = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 520; lpf.type = 'lowpass'; lpf.frequency.value = 2900;
      hp.connect(lpf); lpf.connect(g); dest = hp;
    }
    var chars = Array.from(String(text)), n = 0;
    for (var i = 0; i < chars.length && n < 70; i++) {
      var ch = chars[i];
      if (ch === ' ') { t += 0.045; continue; }
      if (/[.,!?…·~—\-()]/.test(ch)) { t += 0.12; continue; }
      var code = ch.charCodeAt(0);
      var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), eg = ctx.createGain();
      var pitch = base * (0.9 + ((code * 7) % 23) / 110);
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(pitch * 1.04, t);
      o.frequency.linearRampToValueAtTime(pitch * 0.96, t + 0.06);
      f.type = 'bandpass'; f.frequency.value = (480 + ((code * 13) % 9) * 130) * (kind === 'proctor2' ? 1.15 : 1); f.Q.value = 2.2;
      env(eg, t, 0.5, 0.008, 0.06);
      o.connect(f); f.connect(eg); eg.connect(dest);
      o.start(t); o.stop(t + 0.1);
      t += 0.072; n++;
    }
  });

  /* 렌즈 효과음(뼈로 전해져 내 귀에만 들리는 작은 소리) */
  A.ui = safe(function (name) {
    var g = outIn(0), t = now();
    g.gain.value = 0.22;
    if (name === 'boot') { tone(g, t, 660, 0.12, 0.4, 'sine', 0.01); tone(g, t + 0.1, 990, 0.2, 0.35, 'sine', 0.01); }
    else if (name === 'found') { tone(g, t, 880, 0.09, 0.4, 'sine', 0.005); tone(g, t + 0.085, 1320, 0.22, 0.4, 'sine', 0.005); }
    else if (name === 'shaky') { tone(g, t, 700, 0.1, 0.35, 'triangle', 0.005); tone(g, t + 0.1, 620, 0.2, 0.35, 'triangle', 0.005); }
    else if (name === 'deny') { tone(g, t, 220, 0.12, 0.4, 'square', 0.005); tone(g, t + 0.13, 180, 0.16, 0.4, 'square', 0.005); }
    else if (name === 'select') { tone(g, t, 520, 0.06, 0.35, 'sine', 0.004); }
    else if (name === 'off') { tone(g, t, 700, 0.3, 0.35, 'sine', 0.005, 180); }
    else if (name === 'warn') { tone(g, t, 300, 0.18, 0.4, 'triangle', 0.01); tone(g, t + 0.22, 300, 0.18, 0.4, 'triangle', 0.01); }
    else if (name === 'lock') { tone(g, t, 1400, 0.03, 0.22, 'sine', 0.002); tone(g, t + 0.07, 1750, 0.04, 0.22, 'sine', 0.002); }      /* 문항을 붙잡음 */
    else if (name === 'read') { for (var i = 0; i < 4; i++) tone(g, t + i * 0.045, 2100 + i * 140, 0.018, 0.12, 'sine', 0.002); }       /* 글자를 훑는 소리 */
    else if (name === 'retry') { tone(g, t, 520, 0.07, 0.3, 'triangle', 0.004); tone(g, t + 0.09, 520, 0.07, 0.3, 'triangle', 0.004); }
    else if (name === 'lost') { tone(g, t, 620, 0.12, 0.3, 'triangle', 0.005, 380); }
    else if (name === 'low') { tone(g, t, 520, 0.09, 0.35, 'square', 0.004); tone(g, t + 0.13, 390, 0.14, 0.35, 'square', 0.004); }     /* 배터리 부족 */
    else if (name === 'hot') { tone(g, t, 440, 0.07, 0.3, 'sawtooth', 0.004); tone(g, t + 0.1, 440, 0.07, 0.3, 'sawtooth', 0.004); tone(g, t + 0.2, 440, 0.07, 0.3, 'sawtooth', 0.004); }
    else { tone(g, t, 760, 0.05, 0.3, 'sine', 0.004); }
  });

  /* 진동 모터 한 번: 낮게 떠는 소리 + 안경테가 달달 떠는 잔소리 */
  function buzz(dest, t, dur, peak, f0, f1) {
    var ctx = A.ctx, o = ctx.createOscillator(), lpf = bq('lowpass', 560, 0.9), g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.linearRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.012);
    g.gain.setValueAtTime(peak, t + Math.max(0.014, dur - 0.02));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lpf); lpf.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    noise(dest, t, dur, 'bandpass', 2600, 3, peak * 0.1, 0.01);
  }
  /* 안경이 내는 진동과 손끝 소리(왼쪽 안경다리에서 난다).
   * kind: tap(손끝이 닿음) · boot(켜짐, 지잉) · ready(답이 나옴, 지-징) · low(배터리 부족) · thermal(과열로 꺼짐) · dead(방전) */
  A.haptic = safe(function (kind) {
    var g = outIn(-0.55), t = now() + 0.005, i;
    if (kind === 'tap') {
      g.gain.value = 0.5;
      noise(g, t, 0.007, 'highpass', 1800, 0.7, 0.3, 0.001);
      tone(g, t, 1100, 0.022, 0.16, 'sine', 0.001, 700);
      tone(g, t, 260, 0.03, 0.18, 'sine', 0.002, 180);
      return;
    }
    /* 작은 소리여야 한다: 옆자리 기침이나 종보다 뚜렷하게 작고, 교실 바탕 소리 위로는 들릴 만큼(tools/wk/audio.js 로 잰다) */
    g.gain.value = 0.22;
    if (kind === 'boot') buzz(g, t, 0.11, 0.3, 172);
    else if (kind === 'ready') { buzz(g, t, 0.07, 0.36, 176); buzz(g, t + 0.14, 0.09, 0.4, 176); }
    else if (kind === 'low') { for (i = 0; i < 3; i++) buzz(g, t + i * 0.12, 0.065, 0.46, 160); }
    else if (kind === 'thermal') buzz(g, t, 0.42, 0.42, 176, 118);
    else if (kind === 'dead') buzz(g, t, 0.26, 0.36, 150, 96);
  });

  /* 안경이 일하는 동안 관자놀이에서 들리는 가는 코일 소리. level 0(꺼짐) … 1(답을 만드는 중) */
  A.lens = safe(function (level) {
    var ctx = A.ctx, t = now(), n = lensNodes;
    if (level > 0.01 && !n) {
      var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = outIn(-0.4), src = ctx.createBufferSource(), nf = bq('bandpass', 5200, 3), ng = ctx.createGain();
      o.type = 'sine'; o2.type = 'sine';
      o.frequency.value = 2080; o2.frequency.value = 2760;
      g.gain.value = 0.0001;
      src.buffer = pinkBuf; src.loop = true; ng.gain.value = 0.35;
      o.connect(g); o2.connect(g); src.connect(nf); nf.connect(ng); ng.connect(g);
      o.start(t); o2.start(t); src.start(t, Math.random());
      n = lensNodes = { o: o, o2: o2, src: src, g: g, level: 0 };
    }
    if (!n) return;
    if (Math.abs(level - n.level) > 0.02 || (level <= 0.01 && n.level > 0)) {
      n.level = level;
      n.g.gain.setTargetAtTime(Math.max(0.0001, 0.008 * level), t, 0.06);
      n.o.frequency.setTargetAtTime(2080 + 380 * level, t, 0.1);
      n.o2.frequency.setTargetAtTime(2760 + 520 * level, t, 0.1);
    }
    if (level <= 0.01) {
      lensNodes = null;
      n.o.stop(t + 0.4); n.o2.stop(t + 0.4); n.src.stop(t + 0.4);
    }
  });
  A.scan = function (on) { A.lens(on ? 1 : 0); };      /* 예전 이름 */

  /* 전자기기 탐지기. kind: tick(쇠붙이에 스친 약한 반응) · beep(전원이 들어온 기기를 찾았을 때의 경보) */
  A.wand = safe(function (kind, x, y, z) {
    var g = out(x === undefined ? null : [x, y, z], 0.3), t = now() + 0.01, i;
    if (kind === 'beep') {
      g.gain.value = 0.42;
      for (i = 0; i < 3; i++) { tone(g, t + i * 0.16, 2640, 0.085, 0.5, 'square', 0.003); tone(g, t + i * 0.16, 3960, 0.085, 0.14, 'sine', 0.003); }
    } else {
      g.gain.value = 0.3;
      noise(g, t, 0.005, 'highpass', 2400, 0.7, 0.5, 0.001);
      tone(g, t, 1900, 0.03, 0.22, 'sine', 0.002);
    }
  });

  /* 심장 박동 한 번(쿵-쿵). level 0..1: 세기, quick 0..1: 빨리 뛸수록 두 소리 사이가 좁다.
   * 낮은 울림(60Hz 언저리)만으로는 노트북 스피커에서 들리지 않는다. 가슴이 울리는 중간 낮은 소리(150~400Hz)를 겹쳐서
   * 작은 스피커에서도 '쿵' 하고 들리게 한다(tools/wk/audio.js 로 잰다) */
  A.thump = safe(function (level, quick) {
    var g = outIn(0), t = now(), gap = 0.27 - 0.1 * (quick || 0);
    g.gain.value = 0.55 * level;
    tone(g, t, 60, 0.11, 0.5, 'sine', 0.008, 38);
    tone(g, t, 210, 0.09, 0.6, 'sine', 0.007, 95);
    noise(g, t, 0.065, 'lowpass', 420, 0.7, 0.8, 0.006, pinkBuf);
    tone(g, t + gap, 70, 0.085, 0.36, 'sine', 0.006, 44);
    tone(g, t + gap, 250, 0.06, 0.44, 'sine', 0.005, 120);
    noise(g, t + gap, 0.045, 'lowpass', 500, 0.7, 0.5, 0.005, pinkBuf);
  });
  /* 긴장해서 떨리는 숨(짧게 들이쉬고 끊어 가며 내쉰다) */
  A.breath = safe(function (level) {
    var g = outIn(0), t = now();
    g.gain.value = 0.1 + 0.14 * level;
    breathy(g, t, 0.36, 0.16, 1700, 2700, 1, 0.2, 1.2);
    breathy(g, t + 0.7, 0.22, 0.2, 720, 1400, 1, 0.05, 0.9);
    breathy(g, t + 0.98, 0.5, 0.17, 680, 1300, 1, 0.06, 0.8);
  });
  /* 긴장도 0..1: 높을수록 교실 소리가 먹먹하게 멀어진다(내 몸의 소리는 그대로) */
  A.tension = safe(function (v) {
    v = v < 0 ? 0 : (v > 1 ? 1 : v);
    if (Math.abs(v - lastTension) < 0.02) return;
    lastTension = v;
    var t = now(), k = v * v;
    muffle.frequency.setTargetAtTime(20000 * Math.pow(0.075, k), t, 0.15);       /* 20kHz → 1.5kHz */
    dry.gain.setTargetAtTime(1 - 0.3 * k, t, 0.15);
  });
  A.sting = safe(function (kind) {
    var g = out(null, 0.5), t = now() + 0.02;
    g.gain.value = 0.5;
    if (kind === 'caught') {
      tone(g, t, 110, 1.6, 0.6, 'sawtooth', 0.02, 55);
      tone(g, t, 116.5, 1.6, 0.5, 'sawtooth', 0.02, 58);
      noise(g, t, 0.4, 'lowpass', 300, 0.7, 0.6, 0.005);
    } else if (kind === 'good') {
      var n1 = [523.25, 659.25, 783.99];
      for (var i = 0; i < 3; i++) tone(g, t + i * 0.13, n1[i], 0.9, 0.35, 'triangle', 0.01);
    } else {
      tone(g, t, 392, 1.0, 0.35, 'triangle', 0.02); tone(g, t + 0.02, 466.16, 1.0, 0.3, 'triangle', 0.02);
    }
  });

  /* 형광등이 깜빡일 때: 스타터가 튀는 소리와 짧은 웅 소리 */
  A.tubeFlick = safe(function (x, y, z) {
    var g = out([x, y, z], 0.2, false), t = now(), n = 2 + Math.floor(Math.random() * 3), i;
    g.gain.value = 0.5;
    for (i = 0; i < n; i++) noise(g, t + i * rnd(0.06, 0.16), 0.004, 'highpass', 3200, 0.7, 0.5, 0.001);
    var ctx = A.ctx, o = ctx.createOscillator(), f = bq('bandpass', 2400, 2), eg = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 120;
    env(eg, t, 0.08, 0.02, 0.5);
    o.connect(f); f.connect(eg); eg.connect(g);
    o.start(t); o.stop(t + 0.6);
  });

  /* 교실 바탕 소리(낮은 공기 소리 + 환풍 소리 + 형광등 험과 안정기 떠는 소리) */
  A.ambience = safe(function (on) {
    var ctx = A.ctx, t = now();
    if (on && !ambNodes) {
      var src = ctx.createBufferSource(), f = bq('lowpass', 240, 0.5), g = ctx.createGain();
      src.buffer = pinkBuf; src.loop = true;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 1.5);
      src.connect(f); f.connect(g); g.connect(dry);
      var fan = ctx.createBufferSource(), ff = bq('bandpass', 720, 0.6), fg = ctx.createGain();
      fan.buffer = noiseBuf; fan.loop = true;
      fg.gain.setValueAtTime(0.0001, t); fg.gain.linearRampToValueAtTime(0.011, t + 2);
      fan.connect(ff); ff.connect(fg); fg.connect(dry);
      var h = ctx.createOscillator(), h2 = ctx.createOscillator(), hg = ctx.createGain(), h2g = ctx.createGain();
      h.type = 'sine'; h.frequency.value = 120; hg.gain.value = 0.0055;
      h2.type = 'sawtooth'; h2.frequency.value = 120; h2g.gain.value = 0.0011;
      var hf = bq('highpass', 1900, 0.7);
      h.connect(hg); hg.connect(dry); h2.connect(hf); hf.connect(h2g); h2g.connect(dry);
      src.start(t, Math.random()); fan.start(t, Math.random()); h.start(t); h2.start(t);
      ambNodes = { list: [src, fan, h, h2], gains: [g, fg, hg, h2g] };
    } else if (!on && ambNodes) {
      var a = ambNodes, i; ambNodes = null;
      for (i = 0; i < a.gains.length; i++) a.gains[i].gain.setTargetAtTime(0.0001, t, 0.2);
      for (i = 0; i < a.list.length; i++) a.list[i].stop(t + 1.2);
    }
  });

  /* 가끔 들리는 바깥·복도 소리 */
  function roomEvent(inside) {
    var t = now(), k = Math.random(), g, i, f, zz = rnd(-4, 4);
    if (k < 0.3) {                    /* 참새 */
      g = out([-4.6, 1.9, zz], 0.3, false); g.gain.value = inside ? 0.09 : 0.03;
      var lpf = bq('lowpass', 3400, 0.7); lpf.connect(g);
      var n = 2 + Math.floor(Math.random() * 5), tt = t;
      for (i = 0; i < n; i++) {
        tone(lpf, tt, rnd(3800, 4600), 0.05, 0.5, 'sine', 0.008, rnd(2600, 3200));
        tt += rnd(0.09, 0.24);
      }
    } else if (k < 0.42) {            /* 까치 */
      g = out([-4.6, 2.2, zz], 0.3, false); g.gain.value = inside ? 0.08 : 0.03;
      for (i = 0; i < 3; i++) noise(g, t + i * 0.16, 0.09, 'bandpass', rnd(1900, 2400), 4, 0.6, 0.01);
    } else if (k < 0.66) {            /* 멀리 지나가는 차 */
      g = out([-6, 0.5, zz], 0.2, false); g.gain.value = inside ? 0.5 : 0.2;
      f = noise(g, t, 3.4, 'lowpass', 130, 0.6, 0.5, 2.4, pinkBuf);
      f.frequency.linearRampToValueAtTime(220, t + 2.4); f.frequency.linearRampToValueAtTime(110, t + 5.5);
    } else if (k < 0.82) {            /* 복도를 지나가는 발소리 */
      var z0 = rnd(-7, 2), dir = Math.random() < 0.5 ? 1 : -1, steps = 4 + Math.floor(Math.random() * 4);
      for (i = 0; i < steps; i++) {
        g = out([5.2, 0.05, z0 + dir * i * 0.7], 0.5, false); g.gain.value = inside ? 0.16 : 0.45;
        noise(g, t + i * 0.52, 0.05, 'lowpass', inside ? 420 : 1100, 0.7, 0.6, 0.003);
        tone(g, t + i * 0.52, 110, 0.06, 0.3, 'sine', 0.003, 70);
      }
    } else if (k < 0.9) {             /* 에어컨·건물이 내는 딱 소리 */
      g = out([0, 2.9, 1.5], 0.4, false); g.gain.value = 0.16;
      noise(g, t, 0.01, 'bandpass', 1700, 3, 0.8, 0.001);
      tone(g, t, 320, 0.05, 0.2, 'triangle', 0.002, 220);
    } else {                          /* 옷 스치는 소리 */
      g = out([rnd(-3, 3), 0.9, rnd(-3, 3)], 0.2, false); g.gain.value = 0.1;
      f = noise(g, t, 0.3, 'bandpass', 2600, 0.6, 0.5, 0.12, pinkBuf);
      f.frequency.linearRampToValueAtTime(3600, t + 0.4);
    }
  }

  /* 프레임마다: 시계 초침, 긴장에 따른 먹먹함, 가끔 들리는 바깥 소리(심장 박동은 진행 쪽에서 박자를 맞춰 부른다) */
  A.tick = safe(function (dt, st) {
    var t = now();
    if (st.clock && t >= tickNext) {
      tickNext = t + 1; tickN++;
      var g = out([GX.W.CLOCK[0], GX.W.CLOCK[1], -4.7], 0.3, false);
      g.gain.value = 0.17;
      noise(g, t, 0.01, 'bandpass', tickN % 2 ? 2700 : 2050, 5, 0.8, 0.001);
      tone(g, t, tickN % 2 ? 1500 : 1150, 0.012, 0.12, 'sine', 0.001);
    }
    if (st.tension !== undefined) A.tension(st.tension);
    if (st.room && t >= roomNext) {
      roomNext = t + 5 + Math.random() * 11;
      roomEvent(st.inside !== false);
    }
  });

  GX.Audio = A;
})(window.GX = window.GX || {});
