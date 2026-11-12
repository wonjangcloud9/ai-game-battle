// AURORA FALL — fully synthesized audio (Web Audio API, no sound files)
'use strict';

const SFX = {
  ctx: null, ok: false, master: null, sfxBus: null, musicBus: null, noiseBuf: null,
  volume: 0.8, musicVolume: 0.55, lx: 0, ly: 0, lz: 0, lyaw: 0, voices: 0, MAX_VOICES: 30,
  loops: {}, music: { mode: 'off', nextChord: 0, nextBell: 0, step: 0, nextPulse: 0 },

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master = ctx.createGain(); this.master.gain.value = this.volume;
      this.master.connect(comp); comp.connect(ctx.destination);
      this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVolume; this.musicBus.connect(this.master);
      // shared delay for music / distant tails
      this.delay = ctx.createDelay(1.5); this.delay.delayTime.value = 0.42;
      this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.38;
      this.delay.connect(this.delayFb); this.delayFb.connect(this.delay); this.delay.connect(this.musicBus);
      const len = Math.floor(ctx.sampleRate * 2), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this._makeLoops();
      this.ok = true;
    } catch (e) { this.ok = false; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) { /* ignore */ } } },
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },
  setMusicVolume(v) { this.musicVolume = v; if (this.musicBus) this.musicBus.gain.value = v; },
  setListener(x, y, z, yaw) { this.lx = x; this.ly = y; this.lz = z; this.lyaw = yaw; },

  // ---- building blocks
  _gainEnv(t0, attack, peak, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    return g;
  },
  _noise(t0, dur, ftype, f0, f1, q, peak, dest, attack) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = ftype; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(Math.max(30, f0), t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = this._gainEnv(t0, attack || 0.003, peak, dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + (attack || 0.003) + 0.03);
    return src;
  },
  _tone(t0, dur, wave, f0, f1, peak, dest, attack) {
    const ctx = this.ctx, o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(Math.max(20, f0), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this._gainEnv(t0, attack || 0.003, peak, dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + (attack || 0.003) + 0.03);
    return o;
  },
  // Output node for a positioned sound, or null when it would be inaudible.
  _at(x, y, z, vol, maxDist, ref) {
    if (!this.ok || this.voices >= this.MAX_VOICES) return null;
    const dx = x - this.lx, dy = y - this.ly, dz = z - this.lz, d = Math.hypot(dx, dy, dz);
    if (d > maxDist) return null;
    ref = ref || 6;
    let g = vol * ref / (ref + Math.max(0, d - ref)) * (1 - smoothstep(maxDist * 0.7, maxDist, d));
    if (g < 0.004) return null;
    const ctx = this.ctx, out = ctx.createGain();
    out.gain.value = g;
    let tail = out;
    if (ctx.createStereoPanner && d > 0.5) {
      // listener right vector = (-cos yaw, 0, sin yaw)
      const pan = clamp((dx * -Math.cos(this.lyaw) + dz * Math.sin(this.lyaw)) / d, -1, 1) * Math.min(1, d / 4) * 0.85;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      out.connect(p); tail = p;
    }
    tail.connect(this.sfxBus);
    this.voices++;
    const self = this;
    setTimeout(() => { self.voices = Math.max(0, self.voices - 1); try { tail.disconnect(); } catch (e) { /* ignore */ } }, 1600);
    out._dist = d;
    return out;
  },
  _ui(vol) {
    if (!this.ok) return null;
    const g = this.ctx.createGain(); g.gain.value = vol;
    g.connect(this.sfxBus);
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* ignore */ } }, 2500);
    return g;
  },

  // ---- weapons
  shot(def, x, y, z, own) {
    if (!this.ok) return;
    const out = own ? this._ui(0.4) : this._at(x, y, z, 0.95, def.loud * 3.2, 12);
    if (!out) return;
    const t = this.ctx.currentTime, far = own ? 0 : clamp01(out._dist / (def.loud * 1.6));
    const lp = lerp(1, 0.22, far);
    switch (def.id) {
      case 'pistol': this._noise(t, 0.14, 'lowpass', 6500 * lp, 900 * lp, 0.7, 0.9, out); this._tone(t, 0.11, 'triangle', 190, 60, 0.8, out); break;
      case 'smg': this._noise(t, 0.1, 'lowpass', 7500 * lp, 1400 * lp, 0.7, 0.75, out); this._tone(t, 0.08, 'triangle', 230, 90, 0.6, out); break;
      case 'ar': this._noise(t, 0.2, 'lowpass', 5200 * lp, 600 * lp, 0.8, 1.0, out); this._tone(t, 0.14, 'triangle', 150, 48, 0.95, out); this._noise(t, 0.03, 'highpass', 3000, 3000, 0.7, 0.35 * (1 - far), out); break;
      case 'shotgun': this._noise(t, 0.36, 'lowpass', 3800 * lp, 300 * lp, 0.8, 1.2, out); this._tone(t, 0.26, 'sine', 115, 38, 1.2, out); break;
      case 'sniper': this._noise(t, 0.7, 'lowpass', 3200 * lp, 220, 0.8, 1.2, out); this._tone(t, 0.4, 'sine', 95, 28, 1.3, out); this._noise(t, 0.05, 'highpass', 2500, 2500, 0.7, 0.6 * (1 - far), out); break;
      default: this._tone(t, 0.24, 'sawtooth', 1900 * lp + 200, 160, 0.5, out); this._tone(t, 0.3, 'sine', 420, 70, 0.8, out); this._noise(t, 0.22, 'bandpass', 2600 * lp, 500, 2, 0.5, out);
    }
  },
  // ---- generic one-shots
  play(name, x, y, z) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    let o;
    switch (name) {
      case 'step': if ((o = this._at(x, y, z, 0.3, 38, 3))) { this._noise(t, 0.07, 'lowpass', 950 + Math.random() * 500, 240, 0.9, 0.9, o); } break;
      case 'stepWater': if ((o = this._at(x, y, z, 0.4, 40, 3))) { this._noise(t, 0.16, 'bandpass', 1500, 600, 1.2, 0.8, o); } break;
      case 'land': if ((o = this._at(x, y, z, 0.7, 45, 4))) { this._tone(t, 0.14, 'sine', 120, 45, 1, o); this._noise(t, 0.12, 'lowpass', 900, 200, 0.8, 0.7, o); } break;
      case 'jump': if ((o = this._at(x, y, z, 0.3, 30, 3))) { this._noise(t, 0.09, 'lowpass', 700, 300, 0.8, 0.7, o); } break;
      case 'reload': if ((o = this._at(x, y, z, 0.5, 30, 3))) { this._noise(t, 0.035, 'highpass', 2200, 2200, 1, 0.8, o); this._noise(t + 0.22, 0.045, 'bandpass', 1500, 1500, 2, 0.9, o); this._tone(t + 0.22, 0.04, 'square', 300, 180, 0.25, o); } break;
      case 'empty': if ((o = this._at(x, y, z, 0.45, 20, 3))) { this._noise(t, 0.025, 'highpass', 3000, 3000, 1, 0.8, o); } break;
      case 'switch': if ((o = this._at(x, y, z, 0.35, 20, 3))) { this._noise(t, 0.05, 'bandpass', 1800, 900, 1.5, 0.8, o); } break;
      case 'melee': if ((o = this._at(x, y, z, 0.6, 30, 3))) { this._noise(t, 0.14, 'bandpass', 500, 1600, 0.9, 0.7, o, 0.04); } break;
      case 'punch': if ((o = this._at(x, y, z, 0.9, 35, 3))) { this._tone(t, 0.09, 'sine', 170, 60, 1, o); this._noise(t, 0.06, 'lowpass', 1400, 300, 0.8, 0.8, o); } break;
      case 'hitBody': if ((o = this._at(x, y, z, 0.6, 50, 4))) { this._noise(t, 0.06, 'lowpass', 1300, 300, 0.8, 0.9, o); this._tone(t, 0.06, 'sine', 210, 90, 0.6, o); } break;
      case 'hitShield': if ((o = this._at(x, y, z, 0.6, 50, 4))) { this._tone(t, 0.09, 'square', 1250, 520, 0.3, o); this._tone(t, 0.12, 'sine', 2100, 900, 0.4, o); } break;
      case 'shieldBreak': if ((o = this._at(x, y, z, 1.0, 60, 5))) { this._noise(t, 0.3, 'highpass', 3600, 1800, 0.8, 0.7, o); this._tone(t, 0.35, 'sawtooth', 1400, 180, 0.45, o); } break;
      case 'impact': if ((o = this._at(x, y, z, 0.35, 34, 3))) { this._noise(t, 0.05, 'bandpass', 2400 + Math.random() * 1600, 900, 1.6, 0.9, o); } break;
      case 'bounce': if ((o = this._at(x, y, z, 0.5, 40, 4))) { this._tone(t, 0.05, 'triangle', 520, 300, 0.7, o); this._noise(t, 0.03, 'highpass', 2500, 2500, 1, 0.5, o); } break;
      case 'throw': if ((o = this._at(x, y, z, 0.5, 30, 3))) { this._noise(t, 0.2, 'bandpass', 500, 1700, 1, 0.6, o, 0.06); } break;
      case 'explosion':
        if ((o = this._at(x, y, z, 2.4, 520, 22))) {
          this._noise(t, 1.3, 'lowpass', 2800, 70, 0.7, 1.4, o); this._tone(t, 0.9, 'sine', 85, 24, 1.6, o); this._noise(t, 0.12, 'highpass', 1800, 900, 0.7, 0.7, o);
        } break;
      case 'chest': if ((o = this._at(x, y, z, 0.9, 50, 5))) { this._noise(t, 0.12, 'bandpass', 900, 500, 1.2, 0.5, o); [523, 659, 784, 1047].forEach((f, i) => this._tone(t + 0.05 + i * 0.07, 0.35, 'sine', f, f, 0.35, o, 0.01)); } break;
      case 'glider': if ((o = this._at(x, y, z, 0.9, 80, 6))) { this._noise(t, 0.5, 'bandpass', 400, 1900, 0.9, 0.9, o, 0.08); this._tone(t, 0.12, 'sine', 140, 70, 0.6, o); } break;
      case 'heal': if ((o = this._at(x, y, z, 0.6, 30, 4))) { [660, 880, 1320].forEach((f, i) => this._tone(t + i * 0.08, 0.3, 'sine', f, f, 0.3, o, 0.01)); } break;
      case 'airdropLand': if ((o = this._at(x, y, z, 1.6, 300, 14))) { this._tone(t, 0.4, 'sine', 90, 35, 1.3, o); this._noise(t, 0.5, 'lowpass', 1500, 150, 0.8, 1, o); } break;
    }
  },
  // non-positional interface sounds
  ui(name) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    let o;
    switch (name) {
      case 'click': if ((o = this._ui(0.3))) this._tone(t, 0.05, 'triangle', 720, 520, 0.6, o); break;
      case 'hover': if ((o = this._ui(0.12))) this._tone(t, 0.03, 'sine', 900, 900, 0.5, o); break;
      case 'pickup': if ((o = this._ui(0.3))) { this._tone(t, 0.07, 'sine', 620, 940, 0.6, o); this._tone(t + 0.05, 0.1, 'sine', 940, 1250, 0.45, o); } break;
      case 'pickupAmmo': if ((o = this._ui(0.26))) { this._noise(t, 0.03, 'highpass', 2500, 2500, 1, 0.7, o); this._noise(t + 0.06, 0.03, 'highpass', 3000, 3000, 1, 0.7, o); } break;
      case 'pickupWeapon': if ((o = this._ui(0.38))) { this._noise(t, 0.05, 'bandpass', 1200, 700, 2, 0.8, o); this._tone(t + 0.04, 0.16, 'triangle', 440, 880, 0.5, o); } break;
      case 'hit': if ((o = this._ui(0.3))) this._tone(t, 0.035, 'square', 1500, 1100, 0.45, o); break;
      case 'headshot': if ((o = this._ui(0.4))) { this._tone(t, 0.18, 'sine', 2100, 1900, 0.6, o); this._tone(t, 0.05, 'square', 1500, 1200, 0.3, o); } break;
      case 'kill': if ((o = this._ui(0.42))) { this._tone(t, 0.16, 'triangle', 660, 660, 0.6, o); this._tone(t + 0.09, 0.3, 'triangle', 990, 990, 0.6, o); this._tone(t + 0.09, 0.3, 'sine', 1320, 1320, 0.3, o); } break;
      case 'hurt': if ((o = this._ui(0.5))) { this._tone(t, 0.12, 'sine', 150, 55, 0.9, o); this._noise(t, 0.08, 'lowpass', 900, 250, 0.8, 0.6, o); } break;
      case 'shieldHurt': if ((o = this._ui(0.4))) { this._tone(t, 0.1, 'square', 900, 380, 0.3, o); this._tone(t, 0.12, 'sine', 1700, 700, 0.35, o); } break;
      case 'zoneHurt': if ((o = this._ui(0.3))) { this._tone(t, 0.18, 'sawtooth', 190, 120, 0.4, o); this._noise(t, 0.16, 'bandpass', 2600, 1200, 3, 0.4, o); } break;
      case 'useStart': if ((o = this._ui(0.25))) this._noise(t, 0.25, 'bandpass', 900, 2200, 1.5, 0.5, o, 0.08); break;
      case 'healDone': if ((o = this._ui(0.34))) [660, 880, 1320].forEach((f, i) => this._tone(t + i * 0.07, 0.3, 'sine', f, f, 0.5, o, 0.01)); break;
      case 'zoneWarn': if ((o = this._ui(0.34))) [0, 0.28, 0.56].forEach(dt => { this._tone(t + dt, 0.2, 'square', 520, 520, 0.3, o, 0.01); this._tone(t + dt, 0.2, 'sine', 780, 780, 0.35, o, 0.01); }); break;
      case 'zoneMove': if ((o = this._ui(0.4))) { this._tone(t, 1.1, 'sawtooth', 110, 220, 0.4, o, 0.25); this._tone(t, 1.1, 'sine', 165, 330, 0.45, o, 0.25); } break;
      case 'airdrop': if ((o = this._ui(0.36))) { this._tone(t, 0.3, 'triangle', 392, 392, 0.5, o, 0.02); this._tone(t + 0.3, 0.5, 'triangle', 587, 587, 0.5, o, 0.02); } break;
      case 'countdown': if ((o = this._ui(0.3))) this._tone(t, 0.1, 'sine', 880, 880, 0.6, o, 0.005); break;
      case 'go': if ((o = this._ui(0.38))) { this._tone(t, 0.4, 'sine', 1320, 1320, 0.6, o, 0.005); this._tone(t, 0.4, 'triangle', 660, 660, 0.4, o, 0.005); } break;
      case 'victory': if ((o = this._ui(0.5))) [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { this._tone(t + i * 0.13, 0.9, 'triangle', f, f, 0.45, o, 0.02); this._tone(t + i * 0.13, 0.9, 'sine', f * 2, f * 2, 0.15, o, 0.02); }); break;
      case 'defeat': if ((o = this._ui(0.45))) [440, 392, 330, 262].forEach((f, i) => this._tone(t + i * 0.24, 0.8, 'triangle', f, f * 0.97, 0.45, o, 0.03)); break;
      case 'death': if ((o = this._ui(0.5))) { this._tone(t, 0.7, 'sine', 220, 50, 0.9, o); this._noise(t, 0.5, 'lowpass', 1200, 120, 0.8, 0.5, o); } break;
    }
  },

  // ---- continuous layers (wind, plane engine, zone hum)
  _makeLoops() {
    const ctx = this.ctx;
    const noiseLoop = (ftype, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start();
      return { gain: g, filter: f };
    };
    this.loops.wind = noiseLoop('bandpass', 520, 0.6);
    this.loops.ambient = noiseLoop('lowpass', 420, 0.5);
    // plane engine: two detuned saws through a low-pass
    { const g = ctx.createGain(); g.gain.value = 0; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 1;
      for (const hz of [58, 87.5, 116.6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.connect(f); o.start(); }
      f.connect(g); g.connect(this.sfxBus); this.loops.plane = { gain: g, filter: f }; }
    // zone hum: beating sines + filtered noise
    { const g = ctx.createGain(); g.gain.value = 0;
      for (const hz of [92, 94.5, 184.7]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz; o.connect(g); o.start(); }
      g.connect(this.sfxBus); this.loops.zone = { gain: g }; }
  },
  setLoop(name, level) {
    const l = this.loops[name];
    if (!l || !this.ok) return;
    l.gain.gain.setTargetAtTime(Math.max(0, level), this.ctx.currentTime, 0.12);
  },
  setWindPitch(f) { const l = this.loops.wind; if (l && this.ok) l.filter.frequency.setTargetAtTime(clamp(f, 150, 3000), this.ctx.currentTime, 0.2); },

  // ---- generative music
  setMusic(mode) { if (this.music.mode !== mode) { this.music.mode = mode; if (this.ok) { this.music.nextChord = this.ctx.currentTime + 0.1; this.music.nextBell = this.ctx.currentTime + 1.5; this.music.nextPulse = this.ctx.currentTime + 0.5; } } },
  _pad(t, freqs, dur, vol) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(1100, t + dur * 0.45); f.frequency.linearRampToValueAtTime(420, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
    f.connect(g); g.connect(this.musicBus);
    for (const hz of freqs) for (const det of [-5, 4]) {
      const o = ctx.createOscillator(); o.type = det < 0 ? 'sawtooth' : 'triangle'; o.frequency.value = hz; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 1.3);
    }
  },
  _bell(t, hz, vol) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = hz; o2.type = 'sine'; o2.frequency.value = hz * 2.01;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    o.start(t); o2.start(t); o.stop(t + 2.5); o2.stop(t + 2.5);
  },
  update() {
    if (!this.ok || this.ctx.state !== 'running') return;
    const m = this.music, now = this.ctx.currentTime;
    if (m.mode === 'off') return;
    // D minor flavoured progression: Dm9, Bbmaj7, Fmaj7, C(add9)
    const CH = [[146.83, 220, 261.63, 329.63], [116.54, 174.61, 220, 293.66], [87.31, 174.61, 220, 329.63], [130.81, 196, 246.94, 293.66]];
    const SCALE = [293.66, 349.23, 392, 440, 523.25, 587.33, 698.46, 783.99, 880];
    const quiet = m.mode === 'game' ? 0.4 : m.mode === 'tense' ? 0.6 : 1;
    if (now >= m.nextChord - 0.2) {
      const ch = CH[m.step % CH.length];
      const dur = 7.2;
      this._pad(Math.max(now, m.nextChord), ch, dur, 0.045 * quiet);
      m.nextChord = Math.max(now, m.nextChord) + dur; m.step++;
    }
    if (now >= m.nextBell - 0.1) {
      const t = Math.max(now, m.nextBell);
      if (m.mode !== 'tense') this._bell(t, SCALE[Math.floor(Math.random() * SCALE.length)], 0.07 * quiet);
      m.nextBell = t + (m.mode === 'menu' ? 0.9 + Math.random() * 1.6 : 2.5 + Math.random() * 4);
    }
    if (m.mode === 'tense' && now >= m.nextPulse - 0.1) {
      const t = Math.max(now, m.nextPulse);
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(73.4, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.3);
      const g = this._gainEnv(t, 0.01, 0.22, 0.4);
      o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.5);
      m.nextPulse = t + 0.75;
    }
  },
};

// Sound must never be able to break the game: if a browser rejects something, audio simply switches off.
for (const name of ['shot', 'play', 'ui', 'setLoop', 'setWindPitch', 'setMusic', 'update', 'resume', 'setVolume', 'setMusicVolume', 'setListener']) {
  const fn = SFX[name];
  SFX[name] = function () {
    try { return fn.apply(SFX, arguments); }
    catch (err) {
      if (typeof window !== 'undefined' && window.__strictAudio) throw err;
      SFX.ok = false;
    }
  };
}
