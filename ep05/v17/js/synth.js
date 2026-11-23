/* 어스름 전선 — synth: 효과음·악기 소리를 수식으로 직접 만든다 (녹음 파일 없음, 전부 새로 합성)
   순수 계산이라 브라우저 없이도 돌아간다: TW.Synth.make(이름, 표본율) → { data: Float32Array, gain }
   소리의 '무게'가 단계별로 다르다: 평타(짧고 마른 타격) < 스킬(밝은 울림) < 큰 한 방(저음 + 잔향) · 막타(동전) · 처치(쿵 + 화음) */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const S = TW.Synth = {};
  const TAU = Math.PI * 2;
  let seed = 22222;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const nz = () => rnd() * 2 - 1;
  const buf = (sr, dur) => new Float32Array(Math.max(1, Math.round(sr * dur)));
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  S.midi = midi;

  /* ---------- 조각들 ---------- */
  /* 음높이가 f0→f1 로 미끄러지는 파형. type: sine|tri|saw|square, 감쇠 시간상수 tau(초) */
  function tone(out, sr, o) {
    const n = Math.min(out.length, Math.round((o.dur || out.length / sr) * sr)), st = Math.round((o.at || 0) * sr);
    const f0 = o.f0, f1 = o.f1 === undefined ? f0 : o.f1, k = o.curve || 1, a = Math.max(1, (o.a || 0.002) * sr), tau = (o.tau || 0.1) * sr, amp = o.amp === undefined ? 1 : o.amp;
    const vib = o.vib || 0, vr = o.vibRate || 6, type = o.type || 'sine', hold = (o.hold || 0) * sr;
    let ph = o.ph || 0;
    for (let i = 0; i < n && st + i < out.length; i++) {
      const t = i / n, f = (f1 < f0 ? f0 * Math.pow(f1 / f0, Math.pow(t, k)) : f0 + (f1 - f0) * Math.pow(t, k)) * (1 + vib * Math.sin(TAU * vr * i / sr));
      ph += f / sr; if (ph > 1) ph -= 1;
      let s;
      if (type === 'sine') s = Math.sin(TAU * ph); else if (type === 'tri') s = 1 - 4 * Math.abs(ph - 0.5); else if (type === 'saw') s = 2 * ph - 1; else s = ph < 0.5 ? 1 : -1;
      const e = (i < a ? i / a : 1) * (i < hold ? 1 : Math.exp(-(i - hold) / tau)) * (i > n - 64 ? (n - i) / 64 : 1);
      out[st + i] += s * e * amp;
    }
  }
  /* 걸러 낸 잡음. 상태변수 필터로 중심 주파수가 fc0→fc1 로 움직인다. mode: lp|bp|hp */
  function noise(out, sr, o) {
    const n = Math.min(out.length, Math.round((o.dur || out.length / sr) * sr)), st = Math.round((o.at || 0) * sr);
    const fc0 = o.fc0, fc1 = o.fc1 === undefined ? fc0 : o.fc1, q = 1 / (o.q || 0.8), mode = o.mode || 'bp', amp = o.amp === undefined ? 1 : o.amp;
    const a = Math.max(1, (o.a || 0.001) * sr), tau = (o.tau || 0.05) * sr, bell = !!o.bell, hold = (o.hold || 0) * sr;
    let low = 0, band = 0;
    for (let i = 0; i < n && st + i < out.length; i++) {
      const t = i / n, fc = Math.min(sr * 0.16, fc0 * Math.pow(fc1 / fc0, t)), f = 2 * Math.sin(Math.PI * fc / sr);
      const x = nz();
      low += f * band; const high = x - low - q * band; band += f * high;
      const s = mode === 'lp' ? low : mode === 'hp' ? high : band;
      const e = bell ? Math.pow(Math.sin(Math.PI * t), o.pow || 1.5) : (i < a ? i / a : 1) * (i < hold ? 1 : Math.exp(-(i - hold) / tau)) * (i > n - 64 ? (n - i) / 64 : 1);
      out[st + i] += s * e * amp;
    }
  }
  /* 종/쇠 소리: 어긋난 배음들의 합 */
  function bell(out, sr, o) {
    const parts = o.parts || [[1, 1], [2.76, 0.4], [5.4, 0.2]];
    for (const p of parts) tone(out, sr, { at: o.at, f0: o.f * p[0], dur: o.dur, tau: (o.tau || 0.2) / Math.sqrt(p[0]), amp: (o.amp || 1) * p[1], a: o.a || 0.001 });
  }
  /* 뜯는 현 (가야금 비슷한 음색) */
  function pluck(out, sr, o) {
    const st = Math.round((o.at || 0) * sr), N = Math.max(2, Math.round(sr / o.f)), line = new Float32Array(N), n = Math.min(out.length - st, Math.round((o.dur || 1) * sr));
    const bright = o.bright === undefined ? 0.5 : o.bright; let prev = 0;
    for (let i = 0; i < N; i++) { const x = nz(); prev = prev + (x - prev) * (0.25 + 0.75 * bright); line[i] = prev; }
    const damp = o.damp === undefined ? 0.996 : o.damp, amp = o.amp === undefined ? 1 : o.amp; let idx = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx], nx = line[(idx + 1) % N], y = (cur + nx) * 0.5 * damp;
      line[idx] = y; idx = (idx + 1) % N;
      last = cur; out[st + i] += cur * amp * (i > n - 200 ? (n - i) / 200 : 1);
    }
  }
  function drive(out, g) { for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * g); }
  function lowpass(out, sr, fc) { const a = 1 - Math.exp(-TAU * fc / sr); let y = 0; for (let i = 0; i < out.length; i++) { y += (out[i] - y) * a; out[i] = y; } }
  function highpass(out, sr, fc) { const a = 1 - Math.exp(-TAU * fc / sr); let y = 0; for (let i = 0; i < out.length; i++) { y += (out[i] - y) * a; out[i] -= y; } }
  /* 짧은 잔향 */
  function reverb(out, sr, wet, size) {
    const src = out.slice(), n = out.length, combs = [0.0297, 0.0371, 0.0411, 0.0437].map(t => Math.round(t * sr * (size || 1))), fb = 0.78;
    const acc = new Float32Array(n);
    for (const d of combs) { const line = new Float32Array(d); let k = 0, lp = 0; for (let i = 0; i < n; i++) { const y = line[k]; lp += (y - lp) * 0.45; line[k] = src[i] + lp * fb; k = (k + 1) % d; acc[i] += y * 0.25; } }
    for (const d0 of [0.005, 0.0017]) { const d = Math.round(d0 * sr), line = new Float32Array(d); let k = 0; for (let i = 0; i < n; i++) { const b = line[k], x = acc[i] + b * 0.5; line[k] = x; acc[i] = b - x * 0.5; k = (k + 1) % d; } }
    for (let i = 0; i < n; i++) out[i] = src[i] + acc[i] * wet;
  }
  function fade(out, sr, tail) { const n = Math.min(out.length, Math.round(tail * sr)); for (let i = 0; i < n; i++) out[out.length - 1 - i] *= i / n; }
  function norm(out, peak) { let m = 0; for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > m) m = a; } if (m > 1e-6) { const g = (peak || 0.9) / m; for (let i = 0; i < out.length; i++) out[i] *= g; } return out; }
  /* 놋쇠 같은 화음 한 방 (알림용) */
  function stab(out, sr, o) {
    const tmp = buf(sr, o.dur + 0.05);
    for (const n of o.notes) { const f = midi(n); tone(tmp, sr, { f0: f, dur: o.dur, type: 'saw', tau: o.tau || 0.25, amp: 0.3, a: 0.008 }); tone(tmp, sr, { f0: f * 1.006, dur: o.dur, type: 'saw', tau: o.tau || 0.25, amp: 0.22, a: 0.008 }); tone(tmp, sr, { f0: f * 0.5, dur: o.dur, type: 'tri', tau: o.tau || 0.25, amp: 0.25, a: 0.01 }); }
    // 밝게 열렸다 닫히는 필터
    const n = tmp.length; let y = 0;
    for (let i = 0; i < n; i++) { const t = i / sr, fc = 500 + (o.bright || 3600) * Math.exp(-t / (o.ftau || 0.16)), a = 1 - Math.exp(-TAU * fc / sr); y += (tmp[i] - y) * a; tmp[i] = y; }
    const st = Math.round((o.at || 0) * sr); for (let i = 0; i < n && st + i < out.length; i++) out[st + i] += tmp[i] * (o.amp || 1);
  }
  /* 물방울/물결 */
  function bubbles(out, sr, o) { const n = o.n || 8; for (let i = 0; i < n; i++) { const at = (o.at || 0) + rnd() * (o.spread || 0.3), f = (o.f || 500) * (0.6 + rnd() * 1.4); tone(out, sr, { at, f0: f, f1: f * (1.5 + rnd()), dur: 0.05 + rnd() * 0.05, tau: 0.03, amp: (o.amp || 0.3) * (0.5 + rnd() * 0.5) }); } }
  function crackle(out, sr, o) { const n = o.n || 12; for (let i = 0; i < n; i++) noise(out, sr, { at: (o.at || 0) + rnd() * (o.spread || 0.3), dur: 0.02, fc0: (o.fc || 3000) * (0.6 + rnd()), mode: 'hp', tau: 0.004 + rnd() * 0.006, amp: (o.amp || 0.4) * (0.4 + rnd() * 0.6) }); }

  /* 자주 쓰는 틀 */
  function thud(sr, o) {            // 타격: 딱(고음 순간) + 퍽(저음 몸통) + 칙(잡음 꼬리)
    const b = buf(sr, o.dur || 0.16);
    noise(b, sr, { dur: 0.012, fc0: o.click || 4200, mode: 'hp', tau: 0.0025, amp: o.clickAmp === undefined ? 0.7 : o.clickAmp });
    tone(b, sr, { f0: o.f0 || 190, f1: o.f1 || 70, dur: o.body || 0.09, tau: o.tau || 0.028, amp: o.bodyAmp === undefined ? 0.95 : o.bodyAmp, curve: 0.6 });
    noise(b, sr, { dur: o.nDur || 0.06, fc0: o.nf || 1300, fc1: (o.nf || 1300) * 0.5, mode: o.nMode || 'bp', q: 0.9, tau: o.nTau || 0.018, amp: o.nAmp === undefined ? 0.5 : o.nAmp });
    return b;
  }
  function whoosh(sr, o) { const b = buf(sr, o.dur); noise(b, sr, { dur: o.dur, fc0: o.f0, fc1: o.f1, q: o.q || 1.6, bell: true, pow: o.pow || 1.6, amp: 1 }); if (o.low) noise(b, sr, { dur: o.dur, fc0: o.low, fc1: o.low * 0.6, mode: 'lp', bell: true, amp: 0.6 }); return b; }
  const mix = (a, b, g, at, sr) => { const st = Math.round((at || 0) * (sr || 1)); for (let i = 0; i < b.length && st + i < a.length; i++) a[st + i] += b[i] * (g === undefined ? 1 : g); return a; };

  /* ---------- 소리 목록 ---------- */
  const R = {};
  // 인터페이스
  R.click = (sr) => { const b = buf(sr, 0.05); tone(b, sr, { f0: 1500, f1: 900, dur: 0.03, tau: 0.008, amp: 0.8 }); noise(b, sr, { dur: 0.008, fc0: 5000, mode: 'hp', tau: 0.002, amp: 0.4 }); return [b, 0.35]; };
  R.move = (sr) => { const b = buf(sr, 0.05); tone(b, sr, { f0: 700, f1: 420, dur: 0.035, tau: 0.01, amp: 0.8 }); return [b, 0.13]; };
  R.deny = (sr) => { const b = buf(sr, 0.16); tone(b, sr, { f0: 150, dur: 0.06, type: 'square', tau: 0.04, amp: 0.5 }); tone(b, sr, { at: 0.07, f0: 118, dur: 0.07, type: 'square', tau: 0.04, amp: 0.5 }); lowpass(b, sr, 1200); return [b, 0.3]; };
  /* 큰 몬스터 쟁탈전 (이 게임에서 새로 짠 소리): 예고 = 낮은 뿔피리 두 번이 부풀며 물/불씨가 끓는 소리 · 마지막 5초 = 나무 북 · 등장 = 땅울림 + 울부짖음 + 솟구침 */
  R.big_warn = (sr) => {
    const b = buf(sr, 2.6);
    for (const [at, f] of [[0, 55], [0.9, 65.4]]) { tone(b, sr, { at, f0: f, f1: f * 1.02, dur: 1.3, type: 'saw', a: 0.35, tau: 0.6, hold: 0.5, amp: 0.42, vib: 0.012, vibRate: 4.5 }); tone(b, sr, { at, f0: f * 1.5, dur: 1.2, type: 'tri', a: 0.4, tau: 0.5, hold: 0.4, amp: 0.25 }); }
    lowpass(b, sr, 700);
    noise(b, sr, { at: 0.2, dur: 2.2, fc0: 180, fc1: 520, q: 1.1, bell: true, amp: 0.35 }); bubbles(b, sr, { at: 0.4, n: 18, spread: 1.8, f: 260, amp: 0.2 });
    bell(b, sr, { at: 1.7, f: 196, dur: 0.9, tau: 0.35, amp: 0.25 });
    reverb(b, sr, 0.55, 1.7); fade(b, sr, 0.5); return [b, 0.8];
  };
  R.big_tick = (sr) => { const b = buf(sr, 0.4); tone(b, sr, { f0: 120, f1: 70, dur: 0.22, tau: 0.07, amp: 1.0, curve: 0.6 }); noise(b, sr, { dur: 0.05, fc0: 900, mode: 'bp', q: 1.2, tau: 0.02, amp: 0.5 }); bell(b, sr, { at: 0.01, f: 392, dur: 0.3, tau: 0.08, amp: 0.18 }); reverb(b, sr, 0.3); return [b, 0.6]; };
  R.big_rise = (sr) => {
    const b = buf(sr, 3.2);
    tone(b, sr, { f0: 38, f1: 30, dur: 2.2, tau: 1.2, amp: 1.1, a: 0.02 }); noise(b, sr, { dur: 1.6, fc0: 200, fc1: 60, mode: 'lp', tau: 0.6, amp: 1.0 });       // 땅울림
    noise(b, sr, { at: 0.15, dur: 1.1, fc0: 900, fc1: 3500, q: 1.4, bell: true, amp: 0.55 }); bubbles(b, sr, { at: 0.1, n: 28, spread: 1.0, f: 420, amp: 0.3 });       // 솟구침
    const roar = buf(sr, 2.0);
    tone(roar, sr, { f0: 92, f1: 70, dur: 1.7, type: 'saw', a: 0.12, tau: 0.8, hold: 0.5, amp: 0.55, vib: 0.05, vibRate: 7 }); tone(roar, sr, { f0: 139, f1: 104, dur: 1.6, type: 'saw', a: 0.15, tau: 0.7, hold: 0.4, amp: 0.4, vib: 0.06, vibRate: 9 });
    noise(roar, sr, { dur: 1.6, fc0: 700, fc1: 350, q: 2.2, bell: true, amp: 0.6 }); drive(roar, 2.2); lowpass(roar, sr, 1600);
    mix(b, roar, 0.9, 0.35, sr);
    stab(b, sr, { at: 1.15, notes: [50, 57, 62, 65], dur: 1.5, tau: 0.6, amp: 0.45, bright: 2600 });
    reverb(b, sr, 0.5, 1.6); fade(b, sr, 0.6); return [b, 0.95];
  };
  R.ping = (sr) => { const b = buf(sr, 0.7); bell(b, sr, { f: 880, dur: 0.6, tau: 0.22, amp: 0.7 }); bell(b, sr, { at: 0.11, f: 1320, dur: 0.5, tau: 0.2, amp: 0.6 }); return [b, 0.45]; };
  R.buy = (sr) => { const b = buf(sr, 0.5); noise(b, sr, { dur: 0.03, fc0: 600, mode: 'lp', tau: 0.012, amp: 0.8 }); bell(b, sr, { at: 0.02, f: 1568, dur: 0.2, tau: 0.07, amp: 0.6 }); bell(b, sr, { at: 0.1, f: 2349, dur: 0.38, tau: 0.13, amp: 0.7 }); return [b, 0.5]; };
  R.levelup = (sr) => { const b = buf(sr, 1.1); [62, 65, 69, 74].forEach((n, i) => { pluck(b, sr, { at: i * 0.075, f: midi(n + 12), dur: 0.8, amp: 0.55, bright: 0.8 }); bell(b, sr, { at: i * 0.075, f: midi(n + 24), dur: 0.5, tau: 0.16, amp: 0.2 }); }); noise(b, sr, { dur: 0.5, fc0: 2500, fc1: 9000, q: 2, bell: true, amp: 0.12 }); reverb(b, sr, 0.3); return [b, 0.6]; };
  R.ult_ready = (sr) => { const b = buf(sr, 0.9); stab(b, sr, { notes: [62, 69, 74], dur: 0.6, tau: 0.3, amp: 0.8 }); bell(b, sr, { at: 0.05, f: midi(86), dur: 0.7, tau: 0.25, amp: 0.3 }); reverb(b, sr, 0.35); return [b, 0.5]; };
  R.cd_ready = (sr) => { const b = buf(sr, 0.18); bell(b, sr, { f: 1760, dur: 0.15, tau: 0.045, amp: 0.7, parts: [[1, 1], [2, 0.3]] }); return [b, 0.16]; };
  // 기본 공격: 휘두름/발사
  R.swing = (sr) => [whoosh(sr, { dur: 0.15, f0: 600, f1: 2600, q: 1.4 }), 0.28];
  R.swing_heavy = (sr) => [whoosh(sr, { dur: 0.24, f0: 260, f1: 1300, q: 1.2, low: 300 }), 0.42];
  R.thrustS = (sr) => [whoosh(sr, { dur: 0.1, f0: 1400, f1: 5200, q: 2.2 }), 0.3];
  R.bow = (sr) => { const b = buf(sr, 0.2); pluck(b, sr, { f: 196, dur: 0.14, damp: 0.985, amp: 0.8, bright: 0.9 }); noise(b, sr, { dur: 0.09, fc0: 2200, fc1: 5200, q: 2, bell: true, amp: 0.4 }); noise(b, sr, { dur: 0.008, fc0: 3500, mode: 'hp', tau: 0.002, amp: 0.5 }); return [b, 0.36]; };
  R.wisp = (sr) => { const b = buf(sr, 0.2); tone(b, sr, { f0: 620, f1: 1150, dur: 0.11, tau: 0.05, amp: 0.7 }); noise(b, sr, { dur: 0.14, fc0: 1800, fc1: 4200, q: 2.5, bell: true, amp: 0.3 }); return [b, 0.3]; };
  R.iceS = (sr) => { const b = buf(sr, 0.22); bell(b, sr, { f: 2100, dur: 0.18, tau: 0.045, amp: 0.5, parts: [[1, 1], [1.57, 0.6], [2.24, 0.4]] }); noise(b, sr, { dur: 0.01, fc0: 6000, mode: 'hp', tau: 0.002, amp: 0.5 }); return [b, 0.28]; };
  R.mote = (sr) => { const b = buf(sr, 0.22); bell(b, sr, { f: 1400, dur: 0.14, tau: 0.04, amp: 0.6, parts: [[1, 1], [2, 0.3]] }); bell(b, sr, { at: 0.045, f: 2100, dur: 0.15, tau: 0.045, amp: 0.5, parts: [[1, 1], [2, 0.3]] }); return [b, 0.26]; };
  R.towerShot = (sr) => { const b = buf(sr, 0.3); tone(b, sr, { f0: 520, f1: 150, dur: 0.16, tau: 0.06, amp: 0.8 }); tone(b, sr, { f0: 1040, f1: 300, dur: 0.12, tau: 0.04, amp: 0.3, type: 'tri' }); noise(b, sr, { dur: 0.02, fc0: 2500, mode: 'hp', tau: 0.006, amp: 0.5 }); reverb(b, sr, 0.25); return [b, 0.42]; };
  R.minionShot = (sr) => { const b = buf(sr, 0.1); tone(b, sr, { f0: 900, f1: 500, dur: 0.05, tau: 0.02, amp: 0.7 }); return [b, 0.1]; };
  // 타격
  R.hit_blade = (sr) => { const b = thud(sr, { f0: 210, f1: 66, nf: 1700, tau: 0.034 }); tone(b, sr, { f0: 2900, dur: 0.07, tau: 0.02, amp: 0.16 }); tone(b, sr, { f0: 4300, dur: 0.05, tau: 0.014, amp: 0.1 }); return [b, 0.55]; };
  R.hit_blunt = (sr) => { const b = thud(sr, { dur: 0.22, f0: 130, f1: 44, body: 0.14, tau: 0.05, nf: 520, nMode: 'lp', nTau: 0.03, clickAmp: 0.35 }); drive(b, 1.6); return [b, 0.62]; };
  /* 화살이 몸에 박힘: 딱(촉) + 퉁(나무 자루가 떨리는 짧은 음) + 퍽(낮게 꺼지는 몸통) — 예전 것은 0.04초짜리 '틱'이라 손맛이 없었다 */
  R.hit_arrow = (sr) => { const b = buf(sr, 0.18); noise(b, sr, { dur: 0.01, fc0: 4200, mode: 'hp', tau: 0.0018, amp: 0.85 }); tone(b, sr, { f0: 640, f1: 390, dur: 0.05, tau: 0.012, amp: 0.42 }); tone(b, sr, { f0: 220, f1: 68, dur: 0.13, tau: 0.036, amp: 1.0, curve: 0.6 }); noise(b, sr, { dur: 0.05, fc0: 2300, fc1: 1100, q: 0.9, tau: 0.014, amp: 0.42 }); drive(b, 1.5); return [b, 0.52]; };
  R.hit_magic = (sr) => { const b = thud(sr, { f0: 230, f1: 90, nf: 2400, nAmp: 0.35, tau: 0.034 }); bell(b, sr, { f: 990, dur: 0.14, tau: 0.04, amp: 0.3 }); return [b, 0.5]; };
  /* 얼음 조각이 부딪힘: 쩍(금 가는 소리) + 낮은 몸통 + 짧은 유리 울림 */
  R.hit_ice = (sr) => { const b = buf(sr, 0.18); noise(b, sr, { dur: 0.01, fc0: 6000, mode: 'hp', tau: 0.0016, amp: 0.8 }); tone(b, sr, { f0: 240, f1: 78, dur: 0.12, tau: 0.032, amp: 0.95, curve: 0.6 }); crackle(b, sr, { n: 5, spread: 0.035, fc: 5200, amp: 0.4 }); bell(b, sr, { f: 2300, dur: 0.12, tau: 0.03, amp: 0.25, parts: [[1, 1], [1.57, 0.5]] }); drive(b, 1.4); return [b, 0.5]; };
  /* 내 한 대가 영웅·몬스터의 몸에 닿았다: 낮게 꺼지는 쿵 + 눌린 퍽. 무기 소리 위에 얹는 '살' 층 — 무엇을 맞혔는지 몸으로 느껴지게 */
  R.hit_flesh = (sr) => { const b = buf(sr, 0.22); noise(b, sr, { dur: 0.006, fc0: 2500, mode: 'hp', tau: 0.0015, amp: 0.4 }); tone(b, sr, { f0: 125, f1: 48, dur: 0.19, tau: 0.055, amp: 1.2, curve: 0.5 }); noise(b, sr, { dur: 0.07, fc0: 900, fc1: 300, mode: 'lp', tau: 0.018, amp: 0.9 }); drive(b, 1.8); fade(b, sr, 0.03); return [b, 0.5]; };
  /* 내가 맞았다: 귀가 먹먹한 듯 높은 소리를 깎은 쿵 + 짧게 꺾이는 낮은 음 — 내가 때릴 때와 다르게 들리게 */
  R.hurt_me = (sr) => { const b = buf(sr, 0.3); tone(b, sr, { f0: 100, f1: 36, dur: 0.26, tau: 0.07, amp: 1.25, curve: 0.5 }); noise(b, sr, { dur: 0.14, fc0: 700, fc1: 200, mode: 'lp', tau: 0.03, amp: 1.0 }); tone(b, sr, { f0: 330, f1: 200, dur: 0.09, tau: 0.03, amp: 0.3, type: 'tri' }); noise(b, sr, { dur: 0.008, fc0: 1800, mode: 'hp', tau: 0.002, amp: 0.35 }); drive(b, 2); lowpass(b, sr, 1600); fade(b, sr, 0.04); return [b, 0.55]; };
  R.hit_small = (sr) => { const b = thud(sr, { dur: 0.09, f0: 240, f1: 120, body: 0.04, tau: 0.014, nf: 1500, nTau: 0.01, clickAmp: 0.4 }); return [b, 0.2]; };
  R.hit_struct = (sr) => { const b = thud(sr, { dur: 0.2, f0: 150, f1: 60, body: 0.1, tau: 0.035, nf: 700, nMode: 'lp', nTau: 0.03 }); crackle(b, sr, { at: 0.02, n: 5, spread: 0.1, fc: 2200, amp: 0.3 }); return [b, 0.5]; };
  /* 스킬 적중: 밝은 '쩍' + 짧은 울림 */
  R.skill_hit = (sr) => { const b = buf(sr, 0.32); noise(b, sr, { dur: 0.02, fc0: 5200, mode: 'hp', tau: 0.004, amp: 0.9 }); tone(b, sr, { f0: 250, f1: 85, dur: 0.12, tau: 0.045, amp: 1, curve: 0.6 }); noise(b, sr, { dur: 0.1, fc0: 2200, fc1: 900, q: 0.8, tau: 0.03, amp: 0.6 }); bell(b, sr, { f: 1250, dur: 0.22, tau: 0.07, amp: 0.25 }); drive(b, 1.3); reverb(b, sr, 0.22, 0.8); return [b, 0.62]; };
  /* 큰 한 방: 저음이 떨어지고, 부서지고, 울린다 */
  R.big_hit = (sr) => { const b = buf(sr, 0.75); noise(b, sr, { dur: 0.025, fc0: 4500, mode: 'hp', tau: 0.005, amp: 1 }); tone(b, sr, { f0: 110, f1: 36, dur: 0.4, tau: 0.16, amp: 1.2, curve: 0.5 }); tone(b, sr, { f0: 320, f1: 80, dur: 0.12, tau: 0.04, amp: 0.7, curve: 0.6 }); noise(b, sr, { dur: 0.25, fc0: 1900, fc1: 400, mode: 'lp', tau: 0.08, amp: 0.8 }); crackle(b, sr, { at: 0.03, n: 8, spread: 0.18, fc: 2600, amp: 0.3 }); drive(b, 1.8); reverb(b, sr, 0.35, 1.2); fade(b, sr, 0.1); return [b, 0.8]; };
  R.dot = (sr) => { const b = buf(sr, 0.08); noise(b, sr, { dur: 0.05, fc0: 3000, fc1: 1500, q: 1.5, tau: 0.015, amp: 0.8 }); return [b, 0.1]; };
  /* 막타: 동전. 연속으로 치면 음이 올라간다(재생 속도로) */
  R.lasthit = (sr) => { const b = buf(sr, 0.5); noise(b, sr, { dur: 0.01, fc0: 6000, mode: 'hp', tau: 0.002, amp: 0.5 }); bell(b, sr, { f: 1318.5, dur: 0.1, tau: 0.03, amp: 0.7, parts: [[1, 1], [2.76, 0.25]] }); bell(b, sr, { at: 0.055, f: 1975.5, dur: 0.42, tau: 0.13, amp: 0.8, parts: [[1, 1], [2.76, 0.2], [4.1, 0.08]] }); reverb(b, sr, 0.15, 0.7); return [b, 0.55]; };
  R.gold = (sr) => { const b = buf(sr, 0.9); [1318.5, 1568, 1975.5, 2637].forEach((f, i) => bell(b, sr, { at: i * 0.06, f, dur: 0.5, tau: 0.14, amp: 0.55, parts: [[1, 1], [2.76, 0.2]] })); for (let i = 0; i < 9; i++) bell(b, sr, { at: 0.1 + rnd() * 0.45, f: 2600 + rnd() * 2600, dur: 0.08, tau: 0.02, amp: 0.16, parts: [[1, 1]] }); reverb(b, sr, 0.25); return [b, 0.55]; };
  // 상태
  R.shield_on = (sr) => { const b = buf(sr, 0.4); tone(b, sr, { f0: 380, f1: 920, dur: 0.2, tau: 0.12, amp: 0.5, type: 'tri' }); noise(b, sr, { dur: 0.3, fc0: 1500, fc1: 5200, q: 3, bell: true, amp: 0.35 }); bell(b, sr, { at: 0.12, f: 1480, dur: 0.25, tau: 0.08, amp: 0.3 }); return [b, 0.4]; };
  R.shield_break = (sr) => { const b = buf(sr, 0.4); noise(b, sr, { dur: 0.12, fc0: 5000, fc1: 2000, mode: 'hp', tau: 0.03, amp: 0.8 }); crackle(b, sr, { n: 10, spread: 0.15, fc: 4000, amp: 0.5 }); tone(b, sr, { f0: 1500, f1: 500, dur: 0.2, tau: 0.06, amp: 0.3 }); reverb(b, sr, 0.25); return [b, 0.45]; };
  R.heal = (sr) => { const b = buf(sr, 0.7); [76, 80, 83].forEach((n, i) => bell(b, sr, { at: i * 0.07, f: midi(n), dur: 0.45, tau: 0.15, amp: 0.45, parts: [[1, 1], [2, 0.25]] })); reverb(b, sr, 0.3); return [b, 0.36]; };
  R.stun = (sr) => { const b = buf(sr, 0.45); tone(b, sr, { f0: 880, f1: 560, dur: 0.3, tau: 0.12, amp: 0.7, vib: 0.06, vibRate: 22 }); bell(b, sr, { f: 1760, dur: 0.3, tau: 0.1, amp: 0.3 }); noise(b, sr, { dur: 0.02, fc0: 3000, mode: 'hp', tau: 0.005, amp: 0.6 }); return [b, 0.48]; };
  R.freeze = (sr) => { const b = buf(sr, 0.6); crackle(b, sr, { n: 22, spread: 0.3, fc: 5200, amp: 0.6 }); bell(b, sr, { f: 2400, dur: 0.4, tau: 0.12, amp: 0.4, parts: [[1, 1], [1.57, 0.6], [2.24, 0.4], [3.3, 0.2]] }); tone(b, sr, { f0: 500, f1: 160, dur: 0.12, tau: 0.04, amp: 0.5 }); reverb(b, sr, 0.3); return [b, 0.52]; };
  R.root = (sr) => { const b = buf(sr, 0.35); noise(b, sr, { dur: 0.25, fc0: 400, fc1: 1400, q: 2, bell: true, amp: 0.8 }); crackle(b, sr, { n: 8, spread: 0.2, fc: 1800, amp: 0.4 }); return [b, 0.4]; };
  R.air = (sr) => [whoosh(sr, { dur: 0.3, f0: 300, f1: 2400, q: 1.5, low: 260 }), 0.42];
  R.taunt = (sr) => { const b = buf(sr, 0.45); tone(b, sr, { f0: 300, f1: 620, dur: 0.35, tau: 0.2, amp: 0.6, vib: 0.08, vibRate: 12 }); bell(b, sr, { f: 660, dur: 0.4, tau: 0.14, amp: 0.4 }); return [b, 0.42]; };
  // 이동기
  R.dash = (sr) => [whoosh(sr, { dur: 0.22, f0: 320, f1: 2100, q: 1.3, low: 240 }), 0.4];
  R.roll = (sr) => { const b = whoosh(sr, { dur: 0.2, f0: 500, f1: 1600, q: 1.2 }); tone(b, sr, { at: 0.02, f0: 130, f1: 60, dur: 0.08, tau: 0.03, amp: 0.6 }); return [b, 0.4]; };
  R.blink = (sr) => { const b = buf(sr, 0.3); tone(b, sr, { f0: 2200, f1: 500, dur: 0.09, tau: 0.04, amp: 0.6 }); bell(b, sr, { at: 0.07, f: 1700, dur: 0.2, tau: 0.06, amp: 0.4 }); noise(b, sr, { dur: 0.16, fc0: 6000, fc1: 2000, q: 2.5, bell: true, amp: 0.3 }); return [b, 0.4]; };
  R.dodge = (sr) => { const b = whoosh(sr, { dur: 0.14, f0: 2400, f1: 6000, q: 3 }); bell(b, sr, { at: 0.03, f: 1568, dur: 0.1, tau: 0.03, amp: 0.4 }); return [b, 0.38]; };
  R.deflect = (sr) => { const b = buf(sr, 0.3); noise(b, sr, { dur: 0.012, fc0: 6000, mode: 'hp', tau: 0.003, amp: 1 }); bell(b, sr, { f: 3100, dur: 0.25, tau: 0.06, amp: 0.6, parts: [[1, 1], [1.41, 0.7], [2.3, 0.4]] }); return [b, 0.42]; };
  // 구조물·처치
  R.tower_lock = (sr) => { const b = buf(sr, 0.4); for (let i = 0; i < 2; i++) { tone(b, sr, { at: i * 0.15, f0: 880, dur: 0.09, type: 'square', tau: 0.06, amp: 0.4 }); tone(b, sr, { at: i * 0.15, f0: 1320, dur: 0.09, tau: 0.06, amp: 0.3 }); } lowpass(b, sr, 3500); return [b, 0.4]; };
  R.tower_down = (sr) => { const b = buf(sr, 2.0); tone(b, sr, { f0: 95, f1: 28, dur: 1.2, tau: 0.5, amp: 1.2, curve: 0.5 }); noise(b, sr, { dur: 1.6, fc0: 900, fc1: 120, mode: 'lp', tau: 0.5, amp: 1 }); crackle(b, sr, { n: 40, spread: 1.1, fc: 1800, amp: 0.5 }); noise(b, sr, { dur: 0.03, fc0: 3000, mode: 'hp', tau: 0.008, amp: 1 }); drive(b, 1.7); reverb(b, sr, 0.4, 1.4); fade(b, sr, 0.3); return [b, 0.85]; };
  R.minion_die = (sr) => { const b = buf(sr, 0.16); tone(b, sr, { f0: 430, f1: 150, dur: 0.07, tau: 0.03, amp: 0.7 }); noise(b, sr, { dur: 0.1, fc0: 1600, fc1: 500, q: 1, tau: 0.03, amp: 0.5 }); return [b, 0.2]; };
  R.monster_die = (sr) => { const b = buf(sr, 0.6); tone(b, sr, { f0: 150, f1: 55, dur: 0.4, type: 'saw', tau: 0.16, amp: 0.6 }); lowpass(b, sr, 700); tone(b, sr, { f0: 120, f1: 40, dur: 0.2, tau: 0.08, amp: 0.9 }); noise(b, sr, { dur: 0.3, fc0: 700, fc1: 200, mode: 'lp', tau: 0.1, amp: 0.6 }); return [b, 0.5]; };
  R.hero_die = (sr) => { const b = buf(sr, 1.1); tone(b, sr, { f0: 90, f1: 32, dur: 0.6, tau: 0.25, amp: 1.2, curve: 0.5 }); tone(b, sr, { f0: 330, f1: 82, dur: 0.6, tau: 0.3, amp: 0.4, type: 'tri' }); noise(b, sr, { dur: 0.5, fc0: 1200, fc1: 200, mode: 'lp', tau: 0.15, amp: 0.7 }); drive(b, 1.5); reverb(b, sr, 0.4, 1.3); fade(b, sr, 0.2); return [b, 0.7]; };
  /* 처치 알림: 쿵 + 솟는 화음. n 이 커질수록(연속 처치) 음이 하나씩 더 쌓인다 */
  function killStinger(sr, notes, big) {
    const b = buf(sr, 1.5 + notes.length * 0.05);
    tone(b, sr, { f0: 80, f1: 34, dur: 0.5, tau: 0.2, amp: 1.1, curve: 0.5 }); noise(b, sr, { dur: 0.3, fc0: 1500, fc1: 300, mode: 'lp', tau: 0.09, amp: 0.6 });
    notes.forEach((n, i) => { stab(b, sr, { at: 0.03 + i * 0.085, notes: [n, n + 7], dur: 0.7, tau: 0.3, amp: 0.55, bright: 4200 }); bell(b, sr, { at: 0.03 + i * 0.085, f: midi(n + 24), dur: 0.5, tau: 0.16, amp: 0.2 }); });
    if (big) noise(b, sr, { at: 0.02, dur: 1.0, fc0: 7000, fc1: 3000, mode: 'hp', tau: 0.35, amp: 0.3 });
    drive(b, 1.2); reverb(b, sr, 0.35, 1.2); fade(b, sr, 0.2);
    return b;
  }
  R.kill_ally = (sr) => [killStinger(sr, [62]), 0.5];
  /* 내 처치 (7차: "킬 순간이 짜릿하게"): 처치한 수만큼 북이 '둥' 울린다 — 소리만 듣고도 몇 연속인지 셀 수 있게.
     북이 끝나면 화음이 터지고, 연속이 길수록 화음이 한 음씩 높아지고 두꺼워진다. 다섯이면 마지막에 징 */
  function drumHit(out, sr, at, amp, f) {
    tone(out, sr, { at, f0: f * 1.25, f1: f * 0.5, dur: 0.22, tau: 0.045, amp: 1.15 * amp, curve: 0.5 });
    noise(out, sr, { at, dur: 0.05, fc0: 1100, mode: 'lp', tau: 0.012, amp: 0.8 * amp });
    noise(out, sr, { at, dur: 0.008, fc0: 3200, mode: 'hp', tau: 0.002, amp: 0.45 * amp });
  }
  function killCount(sr, n) {
    const gap = 0.115, hit0 = 0.0, chordAt = hit0 + gap * n + 0.02, up = 2 * (n - 1);
    const b = buf(sr, chordAt + 1.5 + (n >= 5 ? 1.2 : 0));
    for (let i = 0; i < n; i++) drumHit(b, sr, hit0 + i * gap, i === n - 1 ? 1 : 0.82, 118 + i * 9);
    const notes = [62, 69, 74, 77, 81].slice(0, Math.min(5, 1 + n)).map(v => v + up);
    stab(b, sr, { at: chordAt, notes, dur: 0.9 + 0.1 * n, tau: 0.32 + 0.05 * n, amp: 0.5, bright: 3600 + 400 * n });
    bell(b, sr, { at: chordAt, f: midi(86 + up), dur: 0.6, tau: 0.18, amp: 0.18 });
    tone(b, sr, { at: chordAt, f0: midi(38 + up), f1: midi(38 + up) * 0.98, dur: 0.8, tau: 0.3, amp: 0.55 });
    if (n >= 3) noise(b, sr, { at: chordAt, dur: 0.8, fc0: 7000, fc1: 3000, mode: 'hp', tau: 0.3, amp: 0.22 });
    if (n >= 5) bell(b, sr, { at: chordAt + 0.05, f: 98, dur: 2.2, tau: 0.9, amp: 0.8, parts: [[1, 1], [2.02, 0.6], [2.4, 0.45], [3.9, 0.3], [5.3, 0.2]] });
    drive(b, 1.25); reverb(b, sr, 0.33, 1.2); fade(b, sr, 0.25);
    return b;
  }
  R.kill = (sr) => [killCount(sr, 1), 0.72];
  R.multi2 = (sr) => [killCount(sr, 2), 0.76];
  R.multi3 = (sr) => [killCount(sr, 3), 0.8];
  R.multi4 = (sr) => [killCount(sr, 4), 0.84];
  R.multi5 = (sr) => [killCount(sr, 5), 0.88];
  R.firstblood = (sr) => { const b = killCount(sr, 1); bell(b, sr, { at: 0.14, f: 147, dur: 1.2, tau: 0.5, amp: 0.5, parts: [[1, 1], [2.4, 0.5], [3.9, 0.3], [5.1, 0.2]] }); return [b, 0.76]; };
  /* 마지막 한 방 (내가 영웅을 쓰러뜨린 그 순간, 느려짐과 함께): 깊게 꺼지는 쿵 + 아래로 빨려 드는 바람 + 시간이 멎는 듯한 맑은 울림 */
  R.kill_blow = (sr) => {
    const b = buf(sr, 1.1);
    noise(b, sr, { dur: 0.02, fc0: 5000, mode: 'hp', tau: 0.004, amp: 0.9 });
    tone(b, sr, { f0: 96, f1: 26, dur: 0.75, tau: 0.3, amp: 1.3, curve: 0.45 });
    noise(b, sr, { dur: 0.6, fc0: 3200, fc1: 180, q: 1.1, bell: true, pow: 0.8, amp: 0.55 });
    bell(b, sr, { at: 0.03, f: 2093, dur: 0.9, tau: 0.32, amp: 0.2, parts: [[1, 1], [1.005, 0.8], [2.76, 0.15]] });
    drive(b, 1.6); reverb(b, sr, 0.3, 1.2); fade(b, sr, 0.2);
    return [b, 0.78];
  };
  R.enemy_kill = (sr) => { const b = buf(sr, 1.2); tone(b, sr, { f0: 80, f1: 34, dur: 0.5, tau: 0.2, amp: 1 }); stab(b, sr, { at: 0.03, notes: [62, 65], dur: 0.6, tau: 0.3, amp: 0.5, bright: 1800 }); stab(b, sr, { at: 0.2, notes: [61, 64], dur: 0.7, tau: 0.35, amp: 0.5, bright: 1500 }); reverb(b, sr, 0.35, 1.2); fade(b, sr, 0.2); return [b, 0.55]; };
  R.my_death = (sr) => { const b = buf(sr, 1.8); tone(b, sr, { f0: 70, f1: 28, dur: 0.9, tau: 0.4, amp: 1.2 }); [69, 65, 62].forEach((n, i) => stab(b, sr, { at: 0.08 + i * 0.22, notes: [n - 12, n - 5], dur: 0.8, tau: 0.4, amp: 0.5, bright: 1200 })); lowpass(b, sr, 2600); reverb(b, sr, 0.45, 1.5); fade(b, sr, 0.3); return [b, 0.7]; };
  R.shutdown = (sr) => { const b = buf(sr, 1.2); noise(b, sr, { dur: 0.5, fc0: 2000, fc1: 8000, mode: 'hp', bell: true, pow: 3, amp: 0.4 }); mix(b, killStinger(sr, [65, 62]), 0.9, 0.3, sr); return [b, 0.7]; };
  R.ace = (sr) => { const b = buf(sr, 2.4); mix(b, killStinger(sr, [62, 65, 69, 74], true), 1); stab(b, sr, { at: 0.5, notes: [50, 62, 69, 74, 77], dur: 1.6, tau: 0.8, amp: 0.7, bright: 5000, ftau: 0.5 }); reverb(b, sr, 0.4, 1.4); fade(b, sr, 0.3); return [b, 0.85]; };
  // 중립·버프
  R.boss_spawn = (sr) => { const b = buf(sr, 2.4); tone(b, sr, { f0: 52, f1: 66, dur: 1.8, type: 'saw', tau: 1.0, amp: 0.6, a: 0.3, vib: 0.02, vibRate: 5 }); tone(b, sr, { f0: 78, f1: 99, dur: 1.8, type: 'saw', tau: 1.0, amp: 0.4, a: 0.4 }); lowpass(b, sr, 520); noise(b, sr, { dur: 2.0, fc0: 300, fc1: 900, q: 1.2, bell: true, amp: 0.5 }); bubbles(b, sr, { n: 16, spread: 1.6, f: 300, amp: 0.25 }); reverb(b, sr, 0.5, 1.6); fade(b, sr, 0.4); return [b, 0.7]; };
  R.boss_down = (sr) => { const b = buf(sr, 2.4); tone(b, sr, { f0: 160, f1: 40, dur: 1.4, type: 'saw', tau: 0.6, amp: 0.6 }); lowpass(b, sr, 600); tone(b, sr, { f0: 90, f1: 28, dur: 1.0, tau: 0.4, amp: 1.2 }); noise(b, sr, { dur: 1.6, fc0: 2500, fc1: 300, mode: 'lp', tau: 0.5, amp: 0.9 }); bubbles(b, sr, { n: 24, spread: 1.2, f: 500, amp: 0.3 }); stab(b, sr, { at: 0.5, notes: [62, 69, 74, 77], dur: 1.4, tau: 0.7, amp: 0.6 }); drive(b, 1.4); reverb(b, sr, 0.45, 1.5); fade(b, sr, 0.4); return [b, 0.85]; };
  /* 8차: 목표 달성 — 위로 오르는 세 음(뜯는 소리) + 금빛 종 화음 + 동전이 쏟아지는 반짝임. 레벨 업보다 밝고 짧게, 처치 소리와는 다른 장조 */
  R.goal_done = (sr) => {
    const b = buf(sr, 1.5);
    [67, 71, 74].forEach((n, i) => pluck(b, sr, { at: i * 0.085, f: midi(n + 12), dur: 0.5, amp: 0.5, bright: 0.85 }));
    stab(b, sr, { at: 0.26, notes: [67, 74, 79, 83], dur: 1.1, tau: 0.45, amp: 0.55, bright: 4200 });
    bell(b, sr, { at: 0.26, f: midi(91), dur: 0.9, tau: 0.3, amp: 0.22, parts: [[1, 1], [2.01, 0.35]] });
    for (let i = 0; i < 7; i++) bell(b, sr, { at: 0.3 + i * 0.045 + rnd() * 0.02, f: 2400 + rnd() * 2600, dur: 0.18, tau: 0.05, amp: 0.12 });
    reverb(b, sr, 0.35, 1.2); fade(b, sr, 0.25);
    return [b, 0.62];
  };
  R.buff_gain = (sr) => { const b = buf(sr, 0.9); [74, 77, 81, 86].forEach((n, i) => bell(b, sr, { at: i * 0.05, f: midi(n), dur: 0.6, tau: 0.2, amp: 0.4, parts: [[1, 1], [2, 0.3]] })); noise(b, sr, { dur: 0.6, fc0: 1800, fc1: 8000, q: 2, bell: true, amp: 0.25 }); reverb(b, sr, 0.35); return [b, 0.5]; };
  R.respawn = (sr) => { const b = buf(sr, 0.9); stab(b, sr, { notes: [62, 69, 74], dur: 0.7, tau: 0.4, amp: 0.6 }); noise(b, sr, { dur: 0.5, fc0: 800, fc1: 6000, q: 2, bell: true, amp: 0.25 }); reverb(b, sr, 0.35); return [b, 0.45]; };
  R.recall = (sr) => { const b = buf(sr, 1.2); tone(b, sr, { f0: 260, f1: 620, dur: 1.1, tau: 2, amp: 0.4, a: 0.3, type: 'tri' }); tone(b, sr, { f0: 390, f1: 930, dur: 1.1, tau: 2, amp: 0.25, a: 0.4 }); noise(b, sr, { dur: 1.1, fc0: 900, fc1: 5000, q: 3, bell: true, amp: 0.2 }); fade(b, sr, 0.15); return [b, 0.36]; };
  R.victory = (sr) => { const b = buf(sr, 3.6); [[62, 0], [65, 0.16], [69, 0.32], [74, 0.48]].forEach(([n, at]) => { stab(b, sr, { at, notes: [n, n + 12], dur: 0.6, tau: 0.3, amp: 0.6 }); pluck(b, sr, { at, f: midi(n + 12), dur: 0.8, amp: 0.4 }); }); stab(b, sr, { at: 0.72, notes: [50, 62, 66, 69, 74, 78], dur: 2.6, tau: 1.3, amp: 0.8, bright: 5200, ftau: 0.8 }); bell(b, sr, { at: 0.72, f: midi(86), dur: 2, tau: 0.7, amp: 0.3 }); tone(b, sr, { at: 0.72, f0: 73.4, dur: 2.4, tau: 1.0, amp: 0.6 }); reverb(b, sr, 0.45, 1.5); fade(b, sr, 0.5); return [b, 0.8]; };
  R.defeat = (sr) => { const b = buf(sr, 3.6); [[74, 0], [72, 0.32], [69, 0.64], [65, 0.96]].forEach(([n, at]) => stab(b, sr, { at, notes: [n - 12, n - 5], dur: 0.8, tau: 0.5, amp: 0.55, bright: 1500 })); stab(b, sr, { at: 1.3, notes: [38, 50, 57, 62, 65], dur: 2.2, tau: 1.2, amp: 0.7, bright: 1300, ftau: 0.7 }); tone(b, sr, { at: 1.3, f0: 55, f1: 36, dur: 2.0, tau: 0.9, amp: 0.8 }); lowpass(b, sr, 3000); reverb(b, sr, 0.5, 1.6); fade(b, sr, 0.5); return [b, 0.75]; };
  // 영웅 스킬 (아이콘 이름 = 소리 이름)
  R.ram = (sr) => { const b = whoosh(sr, { dur: 0.36, f0: 180, f1: 900, q: 1.1, low: 220 }); tone(b, sr, { f0: 70, f1: 110, dur: 0.3, type: 'saw', tau: 0.3, amp: 0.4, a: 0.05 }); lowpass(b, sr, 1800); return [b, 0.6]; };
  R.shell = (sr) => { const b = buf(sr, 0.4); noise(b, sr, { dur: 0.25, fc0: 300, fc1: 700, mode: 'lp', bell: true, amp: 0.9 }); tone(b, sr, { at: 0.12, f0: 180, f1: 90, dur: 0.1, tau: 0.04, amp: 0.8 }); crackle(b, sr, { n: 6, spread: 0.2, fc: 1500, amp: 0.3 }); return [b, 0.5]; };
  R.quake = (sr) => { const b = buf(sr, 0.9); tone(b, sr, { f0: 100, f1: 34, dur: 0.5, tau: 0.2, amp: 1.2 }); noise(b, sr, { dur: 0.8, fc0: 500, fc1: 120, mode: 'lp', tau: 0.3, amp: 0.9 }); crackle(b, sr, { n: 14, spread: 0.5, fc: 1400, amp: 0.4 }); drive(b, 1.6); reverb(b, sr, 0.3, 1.2); fade(b, sr, 0.15); return [b, 0.72]; };
  R.landslideCast = (sr) => [whoosh(sr, { dur: 0.5, f0: 200, f1: 1500, q: 1.1, low: 260, pow: 1.2 }), 0.6];
  R.slam = (sr) => { const b = buf(sr, 0.5); tone(b, sr, { f0: 120, f1: 38, dur: 0.3, tau: 0.11, amp: 1.2 }); noise(b, sr, { dur: 0.25, fc0: 900, fc1: 200, mode: 'lp', tau: 0.07, amp: 0.8 }); noise(b, sr, { dur: 0.015, fc0: 3500, mode: 'hp', tau: 0.004, amp: 0.8 }); drive(b, 1.6); return [b, 0.6]; };
  R.wallslam = (sr) => { const b = buf(sr, 0.8); noise(b, sr, { dur: 0.02, fc0: 5000, mode: 'hp', tau: 0.004, amp: 1 }); tone(b, sr, { f0: 150, f1: 34, dur: 0.45, tau: 0.16, amp: 1.3 }); noise(b, sr, { dur: 0.4, fc0: 2200, fc1: 300, mode: 'lp', tau: 0.1, amp: 1 }); crackle(b, sr, { at: 0.03, n: 18, spread: 0.35, fc: 2400, amp: 0.5 }); drive(b, 2); reverb(b, sr, 0.35, 1.2); fade(b, sr, 0.12); return [b, 0.85]; };
  R.shellburst = (sr) => { const b = buf(sr, 0.6); tone(b, sr, { f0: 140, f1: 44, dur: 0.3, tau: 0.1, amp: 1 }); noise(b, sr, { dur: 0.3, fc0: 1800, fc1: 400, q: 0.8, tau: 0.08, amp: 0.9 }); crackle(b, sr, { n: 16, spread: 0.3, fc: 2000, amp: 0.5 }); drive(b, 1.5); reverb(b, sr, 0.25); return [b, 0.66]; };
  R.landslide = (sr) => { const b = buf(sr, 1.3); noise(b, sr, { dur: 0.03, fc0: 4000, mode: 'hp', tau: 0.006, amp: 1 }); tone(b, sr, { f0: 120, f1: 26, dur: 0.9, tau: 0.3, amp: 1.4, curve: 0.5 }); noise(b, sr, { dur: 1.0, fc0: 1600, fc1: 120, mode: 'lp', tau: 0.3, amp: 1 }); crackle(b, sr, { n: 30, spread: 0.7, fc: 1800, amp: 0.5 }); drive(b, 2); reverb(b, sr, 0.4, 1.4); fade(b, sr, 0.2); return [b, 0.95]; };
  R.thrust = (sr) => { const b = whoosh(sr, { dur: 0.16, f0: 1200, f1: 5600, q: 2 }); bell(b, sr, { at: 0.05, f: 2600, dur: 0.1, tau: 0.025, amp: 0.35, parts: [[1, 1], [1.5, 0.5]] }); return [b, 0.48]; };
  R.spin = (sr) => { const b = buf(sr, 0.95); for (let i = 0; i < 6; i++) mix(b, whoosh(sr, { dur: 0.15, f0: 700 + i * 60, f1: 3000, q: 1.6 }), 0.9, i * 0.15, sr); return [b, 0.42]; };
  R.gale = (sr) => [whoosh(sr, { dur: 0.26, f0: 500, f1: 4200, q: 1.5, low: 200 }), 0.5];
  R.flurry = (sr) => { const b = whoosh(sr, { dur: 0.1, f0: 1600, f1: 5200, q: 2.2 }); noise(b, sr, { at: 0.05, dur: 0.01, fc0: 5000, mode: 'hp', tau: 0.003, amp: 0.5 }); return [b, 0.4]; };
  R.flurryEnd = (sr) => { const b = buf(sr, 0.7); mix(b, whoosh(sr, { dur: 0.2, f0: 800, f1: 5000, q: 1.6 }), 1); tone(b, sr, { at: 0.1, f0: 140, f1: 40, dur: 0.35, tau: 0.13, amp: 1.2 }); noise(b, sr, { at: 0.1, dur: 0.25, fc0: 2500, fc1: 500, q: 0.8, tau: 0.07, amp: 0.8 }); bell(b, sr, { at: 0.1, f: 2400, dur: 0.3, tau: 0.08, amp: 0.3, parts: [[1, 1], [1.5, 0.5]] }); drive(b, 1.5); reverb(b, sr, 0.3); return [b, 0.78]; };
  R.chain = (sr) => { const b = buf(sr, 0.45); bell(b, sr, { f: 1568, dur: 0.2, tau: 0.06, amp: 0.6 }); bell(b, sr, { at: 0.07, f: 2349, dur: 0.35, tau: 0.1, amp: 0.7 }); return [b, 0.5]; };
  R.crescent = (sr) => { const b = buf(sr, 0.45); for (let i = 0; i < 4; i++) mix(b, whoosh(sr, { dur: 0.1, f0: 1500, f1: 3600, q: 3 }), 0.8 - i * 0.12, i * 0.085, sr); bell(b, sr, { f: 2900, dur: 0.2, tau: 0.05, amp: 0.25, parts: [[1, 1], [1.41, 0.6]] }); return [b, 0.42]; };
  R.smoke = (sr) => { const b = buf(sr, 0.7); noise(b, sr, { dur: 0.6, fc0: 900, fc1: 260, mode: 'lp', tau: 0.2, amp: 1, a: 0.02 }); tone(b, sr, { f0: 110, f1: 60, dur: 0.15, tau: 0.06, amp: 0.6 }); return [b, 0.48]; };
  R.bladeride = (sr) => { const b = buf(sr, 0.3); tone(b, sr, { f0: 500, f1: 2600, dur: 0.09, tau: 0.05, amp: 0.5 }); mix(b, whoosh(sr, { dur: 0.16, f0: 2500, f1: 7000, q: 2.5 }), 0.8); bell(b, sr, { at: 0.08, f: 2093, dur: 0.18, tau: 0.05, amp: 0.4 }); return [b, 0.46]; };
  R.darkmoon = (sr) => { const b = buf(sr, 1.6); tone(b, sr, { f0: 55, f1: 46, dur: 1.5, type: 'saw', tau: 1.2, amp: 0.6, a: 0.2 }); tone(b, sr, { f0: 82.4, f1: 69, dur: 1.5, type: 'saw', tau: 1.2, amp: 0.4, a: 0.3 }); lowpass(b, sr, 420); noise(b, sr, { dur: 0.9, fc0: 6000, fc1: 500, q: 1.5, bell: true, pow: 0.8, amp: 0.5 }); bell(b, sr, { at: 0.5, f: 311, dur: 1.0, tau: 0.4, amp: 0.4, parts: [[1, 1], [2.1, 0.5], [3.4, 0.3]] }); reverb(b, sr, 0.5, 1.6); fade(b, sr, 0.3); return [b, 0.7]; };
  R.ambush = (sr) => { const b = buf(sr, 0.45); mix(b, whoosh(sr, { dur: 0.09, f0: 3000, f1: 8000, q: 2.5 }), 0.9); noise(b, sr, { at: 0.03, dur: 0.02, fc0: 5000, mode: 'hp', tau: 0.004, amp: 1 }); tone(b, sr, { at: 0.03, f0: 220, f1: 60, dur: 0.2, tau: 0.07, amp: 1.1 }); bell(b, sr, { at: 0.03, f: 3300, dur: 0.25, tau: 0.06, amp: 0.4, parts: [[1, 1], [1.41, 0.6]] }); drive(b, 1.4); reverb(b, sr, 0.22); return [b, 0.72]; };
  R.firebolt = (sr) => { const b = buf(sr, 0.5); pluck(b, sr, { f: 147, dur: 0.2, damp: 0.985, amp: 0.9, bright: 1 }); mix(b, whoosh(sr, { dur: 0.3, f0: 900, f1: 4500, q: 1.3 }), 0.9, 0.02, sr); crackle(b, sr, { at: 0.05, n: 12, spread: 0.3, fc: 3200, amp: 0.4 }); tone(b, sr, { f0: 200, f1: 90, dur: 0.1, tau: 0.04, amp: 0.6 }); return [b, 0.6]; };
  R.jar = (sr) => [whoosh(sr, { dur: 0.3, f0: 500, f1: 1600, q: 2, pow: 1.2 }), 0.36];
  R.splat = (sr) => { const b = buf(sr, 0.45); crackle(b, sr, { n: 10, spread: 0.06, fc: 4500, amp: 0.7 }); noise(b, sr, { dur: 0.3, fc0: 1400, fc1: 400, mode: 'lp', tau: 0.08, amp: 0.8 }); bubbles(b, sr, { n: 9, spread: 0.25, f: 420, amp: 0.4 }); return [b, 0.5]; };
  R.tumble = R.roll;
  R.barrage = (sr) => { const b = buf(sr, 0.16); pluck(b, sr, { f: 262, dur: 0.07, damp: 0.975, amp: 0.8, bright: 1 }); noise(b, sr, { dur: 0.06, fc0: 3000, fc1: 6500, q: 2, bell: true, amp: 0.5 }); tone(b, sr, { f0: 300, f1: 130, dur: 0.04, tau: 0.015, amp: 0.5 }); return [b, 0.4]; };
  R.chargeUp = (sr) => { const b = buf(sr, 1.3); tone(b, sr, { f0: 180, f1: 760, dur: 1.2, tau: 3, amp: 0.3, a: 0.2, type: 'tri', curve: 1.5 }); tone(b, sr, { f0: 360, f1: 1520, dur: 1.2, tau: 3, amp: 0.18, a: 0.3, curve: 1.5 }); noise(b, sr, { dur: 1.2, fc0: 1200, fc1: 7000, q: 4, bell: true, pow: 0.7, amp: 0.25 }); fade(b, sr, 0.05); return [b, 0.4]; };
  R.beam = (sr) => { const b = buf(sr, 0.8); noise(b, sr, { dur: 0.02, fc0: 6000, mode: 'hp', tau: 0.004, amp: 1 }); tone(b, sr, { f0: 1900, f1: 420, dur: 0.35, type: 'saw', tau: 0.12, amp: 0.5 }); tone(b, sr, { f0: 950, f1: 210, dur: 0.35, tau: 0.14, amp: 0.6 }); tone(b, sr, { f0: 120, f1: 40, dur: 0.4, tau: 0.15, amp: 0.9 }); noise(b, sr, { dur: 0.4, fc0: 5000, fc1: 1200, q: 1.2, tau: 0.12, amp: 0.6 }); drive(b, 1.5); reverb(b, sr, 0.35, 1.2); fade(b, sr, 0.15); return [b, 0.72]; };
  R.lantern = (sr) => { const b = buf(sr, 0.6); mix(b, whoosh(sr, { dur: 0.25, f0: 600, f1: 2000, q: 2 }), 0.5); bell(b, sr, { at: 0.12, f: 784, dur: 0.45, tau: 0.16, amp: 0.6 }); bell(b, sr, { at: 0.12, f: 1175, dur: 0.4, tau: 0.13, amp: 0.3 }); return [b, 0.46]; };
  R.moon = (sr) => { const b = buf(sr, 1.4); bell(b, sr, { f: 196, dur: 1.3, tau: 0.5, amp: 0.8, parts: [[1, 1], [2.4, 0.5], [3.9, 0.3], [5.1, 0.2]] }); noise(b, sr, { dur: 0.9, fc0: 500, fc1: 3000, q: 2, bell: true, amp: 0.3 }); tone(b, sr, { f0: 98, dur: 1.0, tau: 0.5, amp: 0.5, a: 0.05 }); reverb(b, sr, 0.45, 1.5); fade(b, sr, 0.2); return [b, 0.65]; };
  R.orbburst = (sr) => { const b = buf(sr, 0.8); noise(b, sr, { dur: 0.02, fc0: 5500, mode: 'hp', tau: 0.005, amp: 1 }); tone(b, sr, { f0: 130, f1: 38, dur: 0.4, tau: 0.14, amp: 1.2 }); noise(b, sr, { dur: 0.35, fc0: 3000, fc1: 500, q: 0.8, tau: 0.09, amp: 0.9 }); bell(b, sr, { f: 1568, dur: 0.5, tau: 0.14, amp: 0.4 }); bell(b, sr, { f: 2093, dur: 0.4, tau: 0.11, amp: 0.25 }); drive(b, 1.6); reverb(b, sr, 0.35, 1.2); fade(b, sr, 0.12); return [b, 0.78]; };
  R.moonburst = (sr) => { const b = buf(sr, 1.8); noise(b, sr, { dur: 0.03, fc0: 5000, mode: 'hp', tau: 0.007, amp: 1 }); tone(b, sr, { f0: 110, f1: 24, dur: 1.2, tau: 0.4, amp: 1.5, curve: 0.5 }); noise(b, sr, { dur: 1.2, fc0: 4000, fc1: 200, mode: 'lp', tau: 0.35, amp: 1.1 }); bell(b, sr, { f: 392, dur: 1.5, tau: 0.5, amp: 0.6, parts: [[1, 1], [2.4, 0.5], [3.9, 0.3]] }); stab(b, sr, { at: 0.04, notes: [62, 69, 74], dur: 1.0, tau: 0.5, amp: 0.5 }); drive(b, 2); reverb(b, sr, 0.45, 1.6); fade(b, sr, 0.25); return [b, 1.0]; };
  R.icicle = (sr) => { const b = buf(sr, 0.4); mix(b, whoosh(sr, { dur: 0.2, f0: 2200, f1: 7000, q: 2.5 }), 0.8); bell(b, sr, { f: 1800, dur: 0.3, tau: 0.07, amp: 0.5, parts: [[1, 1], [1.57, 0.6], [2.24, 0.4]] }); tone(b, sr, { f0: 260, f1: 120, dur: 0.06, tau: 0.02, amp: 0.4 }); return [b, 0.48]; };
  R.pond = (sr) => { const b = buf(sr, 0.9); crackle(b, sr, { n: 34, spread: 0.6, fc: 4600, amp: 0.55 }); noise(b, sr, { dur: 0.8, fc0: 5000, fc1: 2000, q: 3, bell: true, amp: 0.25 }); bell(b, sr, { at: 0.2, f: 1320, dur: 0.6, tau: 0.2, amp: 0.3, parts: [[1, 1], [1.57, 0.5], [2.24, 0.3]] }); reverb(b, sr, 0.3); return [b, 0.48]; };
  R.slide = (sr) => { const b = whoosh(sr, { dur: 0.3, f0: 2600, f1: 5800, q: 2.4, pow: 1 }); crackle(b, sr, { n: 8, spread: 0.25, fc: 5000, amp: 0.3 }); return [b, 0.44]; };
  R.blizzardCast = (sr) => { const b = buf(sr, 1.0); noise(b, sr, { dur: 0.95, fc0: 400, fc1: 3600, q: 1.6, bell: true, pow: 0.8, amp: 0.9 }); noise(b, sr, { dur: 0.95, fc0: 3000, fc1: 9000, q: 3, bell: true, amp: 0.3 }); return [b, 0.5]; };
  R.blizzard = (sr) => { const b = buf(sr, 1.3); noise(b, sr, { dur: 0.02, fc0: 6000, mode: 'hp', tau: 0.005, amp: 1 }); tone(b, sr, { f0: 150, f1: 34, dur: 0.6, tau: 0.2, amp: 1.2 }); crackle(b, sr, { n: 50, spread: 0.7, fc: 5200, amp: 0.6 }); bell(b, sr, { f: 2100, dur: 0.9, tau: 0.25, amp: 0.5, parts: [[1, 1], [1.57, 0.6], [2.24, 0.4], [3.3, 0.25]] }); noise(b, sr, { dur: 0.7, fc0: 4000, fc1: 800, q: 1, tau: 0.2, amp: 0.7 }); drive(b, 1.5); reverb(b, sr, 0.4, 1.4); fade(b, sr, 0.2); return [b, 0.9]; };
  R.dustline = (sr) => { const b = buf(sr, 0.55); noise(b, sr, { dur: 0.4, fc0: 3000, fc1: 8000, q: 3, bell: true, amp: 0.4 }); for (let i = 0; i < 7; i++) bell(b, sr, { at: i * 0.045, f: 1500 + rnd() * 2400, dur: 0.14, tau: 0.035, amp: 0.3, parts: [[1, 1], [2, 0.25]] }); return [b, 0.42]; };
  R.wing = (sr) => { const b = buf(sr, 0.55); [79, 83, 86].forEach((n, i) => bell(b, sr, { at: i * 0.04, f: midi(n), dur: 0.4, tau: 0.13, amp: 0.4, parts: [[1, 1], [2, 0.3]] })); noise(b, sr, { dur: 0.35, fc0: 2000, fc1: 6000, q: 3, bell: true, amp: 0.3 }); return [b, 0.42]; };
  R.wingburst = (sr) => { const b = buf(sr, 0.6); tone(b, sr, { f0: 220, f1: 70, dur: 0.2, tau: 0.07, amp: 0.9 }); noise(b, sr, { dur: 0.2, fc0: 4000, fc1: 1200, q: 0.9, tau: 0.05, amp: 0.7 }); for (let i = 0; i < 8; i++) bell(b, sr, { at: 0.02 + rnd() * 0.2, f: 1800 + rnd() * 2600, dur: 0.14, tau: 0.035, amp: 0.25, parts: [[1, 1]] }); reverb(b, sr, 0.28); return [b, 0.6]; };
  R.ward = (sr) => { const b = buf(sr, 0.9); bell(b, sr, { f: 1047, dur: 0.8, tau: 0.28, amp: 0.6, parts: [[1, 1], [2, 0.4], [3, 0.15]] }); bell(b, sr, { at: 0.1, f: 1568, dur: 0.7, tau: 0.24, amp: 0.4, parts: [[1, 1], [2, 0.3]] }); reverb(b, sr, 0.4); return [b, 0.42]; };
  R.dawn = (sr) => { const b = buf(sr, 1.8); [62, 66, 69, 74, 78, 81].forEach((n, i) => { tone(b, sr, { at: i * 0.03, f0: midi(n), dur: 1.5, tau: 0.9, amp: 0.2, a: 0.12 }); tone(b, sr, { at: i * 0.03, f0: midi(n) * 2.003, dur: 1.5, tau: 0.7, amp: 0.08, a: 0.15 }); }); noise(b, sr, { dur: 1.2, fc0: 1500, fc1: 9000, q: 2, bell: true, pow: 0.7, amp: 0.25 }); bell(b, sr, { at: 0.1, f: midi(86), dur: 1.2, tau: 0.4, amp: 0.3 }); reverb(b, sr, 0.5, 1.5); fade(b, sr, 0.3); return [b, 0.75]; };
  R.hook = (sr) => { const b = buf(sr, 0.5); mix(b, whoosh(sr, { dur: 0.3, f0: 700, f1: 2600, q: 1.6 }), 0.9); for (let i = 0; i < 9; i++) bell(b, sr, { at: 0.02 + i * 0.03, f: 2200 + rnd() * 900, dur: 0.05, tau: 0.012, amp: 0.25, parts: [[1, 1], [1.41, 0.6]] }); return [b, 0.5]; };
  R.hooked = (sr) => { const b = buf(sr, 0.6); noise(b, sr, { dur: 0.015, fc0: 5000, mode: 'hp', tau: 0.004, amp: 1 }); bell(b, sr, { f: 620, dur: 0.4, tau: 0.1, amp: 0.7, parts: [[1, 1], [1.41, 0.7], [2.3, 0.4], [3.1, 0.25]] }); tone(b, sr, { f0: 200, f1: 60, dur: 0.2, tau: 0.07, amp: 1 }); for (let i = 0; i < 8; i++) bell(b, sr, { at: 0.1 + i * 0.04, f: 2400 + rnd() * 800, dur: 0.05, tau: 0.012, amp: 0.2, parts: [[1, 1]] }); drive(b, 1.4); reverb(b, sr, 0.25); return [b, 0.78]; };
  R.lure = (sr) => { const b = buf(sr, 1.0); bell(b, sr, { f: 233, dur: 0.9, tau: 0.3, amp: 0.8, parts: [[1, 1], [2.4, 0.5], [3.9, 0.3], [5.1, 0.2]] }); noise(b, sr, { dur: 0.5, fc0: 1200, fc1: 7000, q: 2, bell: true, amp: 0.35 }); tone(b, sr, { f0: 466, f1: 932, dur: 0.3, tau: 0.15, amp: 0.25, vib: 0.05, vibRate: 14 }); reverb(b, sr, 0.4, 1.3); return [b, 0.62]; };
  R.fling = (sr) => { const b = whoosh(sr, { dur: 0.34, f0: 240, f1: 2000, q: 1.2, low: 240 }); tone(b, sr, { f0: 110, f1: 190, dur: 0.2, type: 'saw', tau: 0.2, amp: 0.3 }); lowpass(b, sr, 2500); return [b, 0.58]; };
  R.whirl = (sr) => { const b = buf(sr, 1.4); for (let i = 0; i < 5; i++) noise(b, sr, { at: i * 0.24, dur: 0.4, fc0: 300 + i * 50, fc1: 1300, q: 1.6, bell: true, amp: 0.8 }); bubbles(b, sr, { n: 30, spread: 1.2, f: 420, amp: 0.3 }); tone(b, sr, { f0: 60, f1: 48, dur: 1.2, tau: 1, amp: 0.4, a: 0.1 }); reverb(b, sr, 0.3); fade(b, sr, 0.2); return [b, 0.66]; };
  R.geyser = (sr) => { const b = buf(sr, 1.0); tone(b, sr, { f0: 90, f1: 34, dur: 0.5, tau: 0.18, amp: 1.2 }); noise(b, sr, { dur: 0.7, fc0: 500, fc1: 5000, q: 1, bell: true, pow: 0.6, amp: 1 }); bubbles(b, sr, { n: 22, spread: 0.6, f: 600, amp: 0.35 }); drive(b, 1.5); reverb(b, sr, 0.35, 1.3); fade(b, sr, 0.15); return [b, 0.85]; };
  R.spout = (sr) => { const b = buf(sr, 0.55); noise(b, sr, { dur: 0.4, fc0: 600, fc1: 4500, q: 1.1, bell: true, pow: 0.7, amp: 1 }); tone(b, sr, { f0: 120, f1: 50, dur: 0.2, tau: 0.08, amp: 0.8 }); bubbles(b, sr, { n: 10, spread: 0.3, f: 600, amp: 0.3 }); return [b, 0.5]; };
  R.sweep = (sr) => { const b = whoosh(sr, { dur: 0.5, f0: 160, f1: 1800, q: 1, low: 240, pow: 1.1 }); tone(b, sr, { at: 0.18, f0: 110, f1: 36, dur: 0.3, tau: 0.11, amp: 1 }); drive(b, 1.4); return [b, 0.8]; };
  R.breath = (sr) => { const b = buf(sr, 0.9); noise(b, sr, { dur: 0.8, fc0: 900, fc1: 3600, q: 0.9, bell: true, pow: 0.6, amp: 1 }); tone(b, sr, { f0: 70, f1: 50, dur: 0.7, type: 'saw', tau: 0.5, amp: 0.4 }); lowpass(b, sr, 5000); bubbles(b, sr, { n: 16, spread: 0.7, f: 700, amp: 0.25 }); reverb(b, sr, 0.3); return [b, 0.8]; };

  /* ---------- 손맛 알림: 맞았다 / 빗나갔다 / 평타 준비 / 막타 놓침 ---------- */
  /* 스킬 명중 확인음: 짧고 맑은 두 음 (타격음과 겹쳐도 또렷이 들리게 높은 자리) */
  R.hitmark = (sr) => { const b = buf(sr, 0.22); noise(b, sr, { dur: 0.006, fc0: 7000, mode: 'hp', tau: 0.0015, amp: 0.6 }); bell(b, sr, { f: 2637, dur: 0.09, tau: 0.022, amp: 0.8, parts: [[1, 1], [2, 0.25]] }); bell(b, sr, { at: 0.045, f: 3520, dur: 0.16, tau: 0.04, amp: 0.7, parts: [[1, 1], [2, 0.2]] }); return [b, 0.5]; };
  /* 영웅을 맞혔을 때: 한 음 더 높이 치고 올라간다 */
  R.hitmark_hero = (sr) => { const b = buf(sr, 0.34); noise(b, sr, { dur: 0.008, fc0: 7000, mode: 'hp', tau: 0.002, amp: 0.7 }); [2637, 3520, 4186].forEach((f, i) => bell(b, sr, { at: i * 0.04, f, dur: 0.2, tau: 0.045, amp: 0.75, parts: [[1, 1], [2, 0.22]] })); reverb(b, sr, 0.12, 0.6); return [b, 0.56]; };
  /* 빗나감: 힘 빠지는 바람 소리 + 가라앉는 낮은 음 */
  R.whiff = (sr) => { const b = whoosh(sr, { dur: 0.22, f0: 1500, f1: 380, q: 1.3, pow: 1.1 }); tone(b, sr, { at: 0.03, f0: 330, f1: 196, dur: 0.16, tau: 0.07, amp: 0.45, type: 'tri' }); lowpass(b, sr, 2600); return [b, 0.32]; };
  /* 평타 준비 완료: 아주 작은 딱 소리 */
  R.atk_ready = (sr) => { const b = buf(sr, 0.06); tone(b, sr, { f0: 1245, dur: 0.04, tau: 0.01, amp: 0.8 }); noise(b, sr, { dur: 0.004, fc0: 5000, mode: 'hp', tau: 0.001, amp: 0.4 }); return [b, 0.1]; };
  /* 막타를 놓쳤다: 둔하게 떨어지는 동전 */
  R.lh_miss = (sr) => { const b = buf(sr, 0.2); tone(b, sr, { f0: 520, f1: 240, dur: 0.12, tau: 0.04, amp: 0.7, type: 'tri' }); noise(b, sr, { dur: 0.03, fc0: 900, mode: 'lp', tau: 0.01, amp: 0.4 }); lowpass(b, sr, 1800); return [b, 0.2]; };
  /* 지금 치면 쓰러진다: 금빛 표식이 켜질 때의 작은 종 */
  R.lh_ready = (sr) => { const b = buf(sr, 0.16); bell(b, sr, { f: 1568, dur: 0.13, tau: 0.035, amp: 0.7, parts: [[1, 1], [2.76, 0.2]] }); return [b, 0.13]; };

  /* ---------- 악기 (배경 음악용) ---------- */
  R.i_pluck = (sr) => { const b = buf(sr, 1.6); pluck(b, sr, { f: midi(62), dur: 1.5, damp: 0.9965, amp: 1, bright: 0.65 }); tone(b, sr, { f0: midi(62), dur: 0.5, tau: 0.12, amp: 0.25 }); highpass(b, sr, 90); fade(b, sr, 0.3); return [b, 0.5]; };
  R.i_pad = (sr) => { const b = buf(sr, 4.6); for (const d of [0.996, 1, 1.005]) { tone(b, sr, { f0: midi(50) * d, dur: 4.5, type: 'saw', tau: 9, amp: 0.18, a: 0.9, ph: rnd() }); tone(b, sr, { f0: midi(62) * d, dur: 4.5, type: 'tri', tau: 9, amp: 0.16, a: 1.1, ph: rnd() }); } lowpass(b, sr, 900); lowpass(b, sr, 1400); fade(b, sr, 1.4); return [b, 0.5]; };
  R.i_bass = (sr) => { const b = buf(sr, 1.0); tone(b, sr, { f0: midi(38), dur: 0.9, tau: 0.3, amp: 1 }); tone(b, sr, { f0: midi(38), dur: 0.6, type: 'tri', tau: 0.15, amp: 0.35 }); tone(b, sr, { f0: midi(38) * 2.5, f1: midi(38), dur: 0.03, tau: 0.01, amp: 0.4 }); fade(b, sr, 0.1); return [b, 0.6]; };
  R.i_buk = (sr) => { const b = buf(sr, 0.7); tone(b, sr, { f0: 120, f1: 55, dur: 0.5, tau: 0.16, amp: 1.1, curve: 0.5 }); noise(b, sr, { dur: 0.06, fc0: 900, mode: 'lp', tau: 0.02, amp: 0.7 }); noise(b, sr, { dur: 0.01, fc0: 2500, mode: 'hp', tau: 0.003, amp: 0.4 }); drive(b, 1.4); reverb(b, sr, 0.2); return [b, 0.6]; };
  R.i_slap = (sr) => { const b = buf(sr, 0.3); noise(b, sr, { dur: 0.08, fc0: 1900, q: 2.2, tau: 0.02, amp: 1 }); tone(b, sr, { f0: 420, f1: 300, dur: 0.07, tau: 0.02, amp: 0.5 }); noise(b, sr, { dur: 0.008, fc0: 5000, mode: 'hp', tau: 0.002, amp: 0.6 }); reverb(b, sr, 0.15, 0.6); return [b, 0.4]; };
  R.i_tick = (sr) => { const b = buf(sr, 0.08); noise(b, sr, { dur: 0.04, fc0: 6500, mode: 'hp', tau: 0.008, amp: 1 }); return [b, 0.14]; };
  R.i_wood = (sr) => { const b = buf(sr, 0.14); tone(b, sr, { f0: 1100, dur: 0.06, tau: 0.012, amp: 0.8 }); tone(b, sr, { f0: 1780, dur: 0.04, tau: 0.008, amp: 0.4 }); noise(b, sr, { dur: 0.006, fc0: 4000, mode: 'hp', tau: 0.002, amp: 0.5 }); return [b, 0.26]; };
  R.i_gong = (sr) => { const b = buf(sr, 3.6); bell(b, sr, { f: 98, dur: 3.5, tau: 1.3, amp: 0.9, parts: [[1, 1], [2.02, 0.6], [2.4, 0.45], [3.9, 0.3], [5.3, 0.2], [6.8, 0.1]] }); noise(b, sr, { dur: 0.6, fc0: 2500, fc1: 400, q: 1, tau: 0.2, amp: 0.3 }); reverb(b, sr, 0.4, 1.6); fade(b, sr, 0.8); return [b, 0.5]; };
  R.i_flute = (sr) => { const b = buf(sr, 2.2); tone(b, sr, { f0: midi(74), dur: 2.0, tau: 4, amp: 0.6, a: 0.12, vib: 0.012, vibRate: 5.2 }); tone(b, sr, { f0: midi(74) * 2, dur: 2.0, tau: 3, amp: 0.12, a: 0.15, vib: 0.012, vibRate: 5.2 }); noise(b, sr, { dur: 2.0, fc0: midi(74) * 2, q: 6, bell: true, pow: 0.4, amp: 0.2 }); noise(b, sr, { dur: 0.1, fc0: 3000, q: 1.5, tau: 0.04, amp: 0.25 }); reverb(b, sr, 0.4, 1.4); fade(b, sr, 0.5); return [b, 0.4]; };

  S.names = Object.keys(R);
  const cache = new Map();
  /* 반환: { data, gain } (같은 표본율이면 캐시) */
  S.make = function (name, sr) {
    const key = name + '@' + sr; let e = cache.get(key);
    if (e) return e;
    const fn = R[name]; if (!fn) return null;
    seed = 1000 + name.length * 7919 + name.charCodeAt(0) * 104729;
    const r = fn(sr);
    norm(r[0], 0.92);
    e = { data: r[0], gain: r[1] };
    cache.set(key, e);
    return e;
  };
})();
