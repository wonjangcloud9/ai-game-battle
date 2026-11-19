/* 청홍대전 — audio: WebAudio 합성 효과음 + 잔잔한 배경음 (외부 파일 없음) */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const U = AOS.U;
  const Au = AOS.Audio = { ctx: null, ok: false, muted: false, musicOn: true, master: null, sfx: null, mus: null, last: {}, burst: 0, burstT: 0, noise: null, nextBar: 0, bar: 0, delay: null };

  Au.init = function () {
    if (Au.ctx) { if (Au.ctx.state === 'suspended') { try { Au.ctx.resume(); } catch (e) { /* 무시 */ } } return; }
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      const ctx = Au.ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
      Au.master = ctx.createGain(); Au.master.gain.value = Au.muted ? 0 : 0.7;
      Au.master.connect(comp); comp.connect(ctx.destination);
      Au.sfx = ctx.createGain(); Au.sfx.gain.value = 0.9; Au.sfx.connect(Au.master);
      Au.mus = ctx.createGain(); Au.mus.gain.value = 0.5; Au.mus.connect(Au.master);
      // 잔향용 딜레이 (배경음 전용)
      const d = ctx.createDelay(1.0), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
      d.delayTime.value = 0.42; fb.gain.value = 0.32; lp.type = 'lowpass'; lp.frequency.value = 1800;
      d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(Au.mus);
      Au.delay = d;
      const len = Math.floor(ctx.sampleRate * 1.0), buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
      let seed = 1234567;
      for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; ch[i] = (seed / 4294967296) * 2 - 1; }
      Au.noise = buf;
      Au.ok = true;
      if (ctx.state === 'suspended') ctx.resume();
      Au.nextBar = ctx.currentTime + 0.3;
    } catch (e) { Au.ok = false; }
  };
  Au.setMuted = function (m) {
    Au.muted = m;
    if (Au.ok) { try { Au.master.gain.setTargetAtTime(m ? 0 : 0.7, Au.ctx.currentTime, 0.05); } catch (e) { /* 무시 */ } }
  };

  function tone(type, f0, f1, dur, vol, t, dest, attack) {
    const ctx = Au.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const a = attack || 0.006;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur));
    o.connect(g); g.connect(dest || Au.sfx);
    o.start(t); o.stop(t + dur + 0.05);
    return g;
  }
  function noise(dur, vol, t, ftype, f0, f1, q) {
    const ctx = Au.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = Au.noise; s.loop = true;
    f.type = ftype; f.frequency.setValueAtTime(Math.max(30, f0), t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    f.Q.value = q || 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(0.0002, vol), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(Au.sfx);
    s.start(t); s.stop(t + dur + 0.05);
  }
  const S = {
    hit(t, v) { noise(0.07, 0.5 * v, t, 'lowpass', 1400, 500); tone('sine', 150, 70, 0.09, 0.5 * v, t); },
    slash(t, v) { noise(0.09, 0.4 * v, t, 'bandpass', 3200, 900, 1.2); tone('sine', 170, 80, 0.08, 0.35 * v, t + 0.02); },
    shoot(t, v) { noise(0.1, 0.32 * v, t, 'bandpass', 2400, 700, 1.5); tone('triangle', 620, 300, 0.07, 0.12 * v, t); },
    gun(t, v) { noise(0.12, 0.6 * v, t, 'lowpass', 3000, 400); tone('square', 220, 60, 0.08, 0.2 * v, t); },
    magic(t, v) { tone('triangle', 520, 1040, 0.14, 0.26 * v, t); tone('sine', 1040, 1560, 0.18, 0.12 * v, t + 0.03); },
    fire(t, v) { noise(0.3, 0.45 * v, t, 'lowpass', 1200, 240); tone('sine', 190, 80, 0.25, 0.3 * v, t); },
    boom(t, v) { noise(0.5, 0.8 * v, t, 'lowpass', 700, 90); tone('sine', 110, 36, 0.45, 0.8 * v, t); },
    zap(t, v) { tone('sawtooth', 1500, 180, 0.13, 0.2 * v, t); noise(0.1, 0.25 * v, t, 'highpass', 2500, 5000); },
    heal(t, v) { tone('sine', 660, 660, 0.3, 0.2 * v, t); tone('sine', 990, 990, 0.38, 0.16 * v, t + 0.08); tone('sine', 1320, 1320, 0.4, 0.1 * v, t + 0.16); },
    shield(t, v) { tone('triangle', 300, 900, 0.22, 0.2 * v, t); tone('sine', 1200, 1500, 0.2, 0.08 * v, t + 0.08); },
    dash(t, v) { noise(0.16, 0.36 * v, t, 'bandpass', 500, 2600, 0.9); },
    tower(t, v) { tone('sine', 520, 180, 0.2, 0.34 * v, t); noise(0.06, 0.2 * v, t, 'highpass', 1800, 1800); },
    pop(t, v) { tone('triangle', 420, 140, 0.1, 0.2 * v, t); },
    kill(t, v) { tone('sawtooth', 330, 82, 0.5, 0.2 * v, t); tone('sine', 165, 55, 0.6, 0.35 * v, t); noise(0.3, 0.25 * v, t, 'lowpass', 900, 200); },
    levelup(t, v) { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.26, 0.2 * v, t + i * 0.075)); },
    gold(t, v) { tone('sine', 1320, 1320, 0.09, 0.16 * v, t); tone('sine', 1760, 1760, 0.16, 0.16 * v, t + 0.06); },
    buy(t, v) { tone('sine', 880, 880, 0.08, 0.18 * v, t); tone('sine', 1320, 1320, 0.1, 0.18 * v, t + 0.07); tone('sine', 1760, 1760, 0.2, 0.16 * v, t + 0.14); },
    click(t, v) { tone('sine', 820, 620, 0.045, 0.14 * v, t); },
    deny(t, v) { tone('square', 170, 150, 0.11, 0.1 * v, t); },
    warn(t, v) { tone('square', 880, 880, 0.07, 0.1 * v, t); tone('square', 880, 880, 0.07, 0.1 * v, t + 0.11); },
    recall(t, v) { tone('sine', 300, 900, 0.5, 0.14 * v, t, null, 0.2); },
    announce(t, v) { tone('sine', 784, 784, 0.5, 0.2 * v, t); tone('sine', 1175, 1175, 0.6, 0.14 * v, t + 0.01); },
    towerDown(t, v) { S.boom(t, v); noise(1.1, 0.4 * v, t + 0.1, 'lowpass', 500, 70); tone('sine', 70, 34, 1.0, 0.5 * v, t + 0.05); },
    victory(t, v) { [523, 659, 784, 1047, 1319].forEach((f, i) => { tone('triangle', f, f, 0.55, 0.22 * v, t + i * 0.13); tone('sine', f / 2, f / 2, 0.6, 0.14 * v, t + i * 0.13); }); tone('triangle', 1568, 1568, 1.2, 0.2 * v, t + 0.7); },
    defeat(t, v) { [392, 349, 311, 262].forEach((f, i) => { tone('triangle', f, f, 0.6, 0.2 * v, t + i * 0.22); tone('sine', f / 2, f / 2, 0.7, 0.16 * v, t + i * 0.22); }); },
  };
  const GAP = { hit: 0.05, slash: 0.05, shoot: 0.045, pop: 0.06, tower: 0.08, gold: 0.05, click: 0.03, zap: 0.06, magic: 0.05 };
  Au.play = function (name, vol) {
    if (!Au.ok || Au.muted) return;
    vol = vol === undefined ? 1 : vol;
    if (!(vol > 0.02)) return;
    try {
      const ctx = Au.ctx, t = ctx.currentTime;
      const gap = GAP[name] || 0.02;
      if (Au.last[name] !== undefined && t - Au.last[name] < gap) return;
      if (t - Au.burstT > 0.1) { Au.burstT = t; Au.burst = 0; }
      if (++Au.burst > 9) return;
      Au.last[name] = t;
      S[name](t + 0.003, Math.min(1, vol));
    } catch (e) { /* 소리 오류는 게임에 영향을 주지 않음 */ }
  };

  const CAST = { dash: 'dash', step: 'dash', leap: 'dash', roll: 'dash', strike: 'slash', skull: 'slash', spin: 'slash', quake: 'boom', roar: 'boom', shield: 'shield', undying: 'shield', rage: 'shield', haste: 'shield', charge: 'shield', smoke: 'dash',
    fire: 'fire', pillar: 'fire', meteor: 'fire', blink: 'magic', chain: 'zap', field: 'zap', storm: 'zap', heal: 'heal', sanct: 'heal', ring: 'magic', spear: 'magic', arrow: 'shoot', rain: 'shoot', shuriken: 'shoot', net: 'shoot', snipe: 'gun', beam: 'gun' };
  /* 카메라 중심에서의 거리로 음량 결정 */
  function near(x, y) {
    const W = AOS.World, d = U.dist(x, y, W.cam.x, W.cam.y);
    const k = 1 - d / 44;
    return k <= 0 ? 0 : k * k;
  }
  Au.onEvent = function (e, G, me) {
    if (!Au.ok || Au.muted) return;
    switch (e.type) {
      case 'melee': Au.play(e.u.isHero ? 'slash' : 'hit', near(e.u.x, e.u.y) * (e.u.isHero ? 0.8 : 0.3)); break;
      case 'shoot': {
        const u = e.u, v = near(u.x, u.y);
        if (u.isStruct) Au.play('tower', v * 0.9);
        else if (u.isHero) Au.play(u.heroId === 'tara' ? 'gun' : (u.hd.role === 'mage' || u.hd.role === 'support') ? 'magic' : 'shoot', v * 0.6);
        else Au.play('shoot', v * 0.16);
        break;
      }
      case 'cast': Au.play(CAST[e.ab.icon] || 'magic', (e.u === me ? 1 : near(e.u.x, e.u.y)) * 0.85); break;
      case 'zoneBlast': if (e.z.vis.kind === 'meteor' || e.z.vis.kind === 'pillar') Au.play('boom', near(e.z.x, e.z.y) * (e.z.vis.kind === 'meteor' ? 1 : 0.6)); break;
      case 'death': {
        const u = e.u, v = near(u.x, u.y);
        if (u.isMinion) Au.play('pop', v * 0.4); else if (u.isHero) Au.play('kill', Math.max(v, u === me ? 1 : 0.25)); else Au.play('towerDown', Math.max(0.45, v));
        break;
      }
      case 'kill': if (e.first || e.multi >= 2 || e.killer === me) Au.play('announce', 0.8); break;
      case 'levelup': if (e.u === me) Au.play('levelup', 0.9); break;
      case 'gold': if (e.u === me) Au.play('gold', 0.7); break;
      case 'buy': if (e.u === me) Au.play('buy', 0.9); break;
      case 'towerAggro': if (e.target === me) Au.play('warn', 0.9); break;
      case 'recallStart': if (e.u === me) Au.play('recall', 0.8); break;
      case 'heal': if (e.tgt === me && e.amt > 30) Au.play('heal', 0.5); break;
      case 'coreDown': Au.play(me && e.winner === me.team ? 'victory' : 'defeat', 1); break;
      default: break;
    }
  };

  /* ---------- 배경음: 느린 화음 + 간헐적인 음 ---------- */
  const CHORDS = [[220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [130.81, 196.0, 261.63, 329.63], [196.0, 246.94, 293.66]];
  const SCALE = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];
  let mseed = 77;
  const mr = () => { mseed = (mseed * 1103515245 + 12345) >>> 0; return (mseed & 0xffff) / 65536; };
  Au.tick = function () {
    if (!Au.ok || !Au.musicOn || Au.muted) return;
    try {
      const ctx = Au.ctx, t = ctx.currentTime, BAR = 3.6;
      if (Au.nextBar < t - 1) Au.nextBar = t + 0.1;
      if (t + 0.4 < Au.nextBar) return;
      const t0 = Au.nextBar, ch = CHORDS[Au.bar % CHORDS.length];
      Au.nextBar += BAR; Au.bar++;
      for (const f of ch) {
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'triangle'; o.frequency.setValueAtTime(f, t0); o.detune.setValueAtTime((mr() - 0.5) * 10, t0);
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, t0); lp.Q.value = 0.5;
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.045, t0 + 1.1); g.gain.linearRampToValueAtTime(0.03, t0 + BAR - 0.4); g.gain.linearRampToValueAtTime(0.0001, t0 + BAR + 0.9);
        o.connect(lp); lp.connect(g); g.connect(Au.mus);
        o.start(t0); o.stop(t0 + BAR + 1.0);
      }
      const bass = ctx.createOscillator(), bg = ctx.createGain();
      bass.type = 'sine'; bass.frequency.setValueAtTime(ch[0] / 2, t0);
      bg.gain.setValueAtTime(0.0001, t0); bg.gain.linearRampToValueAtTime(0.09, t0 + 0.3); bg.gain.linearRampToValueAtTime(0.0001, t0 + BAR);
      bass.connect(bg); bg.connect(Au.mus); bass.start(t0); bass.stop(t0 + BAR + 0.1);
      for (let i = 0; i < 8; i++) {
        if (mr() > 0.42) continue;
        const f = SCALE[Math.floor(mr() * SCALE.length)], tt = t0 + i * BAR / 8;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(f, tt);
        g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.04, tt + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.7);
        o.connect(g); g.connect(Au.mus); g.connect(Au.delay);
        o.start(tt); o.stop(tt + 0.8);
      }
    } catch (e) { /* 무시 */ }
  };
})();
