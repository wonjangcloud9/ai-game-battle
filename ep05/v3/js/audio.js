/* 어스름 전선 — audio: 소리 내기 (WebAudio)
   효과음은 synth.js 가 만든 파형을 버퍼로 틀고, 배경음은 같은 악기 소리를 박자에 맞춰 직접 연주한다.
   배경음은 상황(mood)에 따라 층이 쌓인다: 0 고요(패드·가야금풍 뜯는 소리) → 1 북 → 2 장단 → 3 징과 빠른 장단 */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const U = TW.U, Sy = TW.Synth;
  const Au = TW.Audio = { ctx: null, ok: false, muted: false, musicOn: true, master: null, sfx: null, mus: null, bufs: new Map(), queue: [], last: {}, voices: 0, mood: 0, cur: 0, step: 0, nextT: 0, bar: 0, chargeSrc: null, prevCd: [0, 0, 0, 0], duck: 0, over: false };
  const GAP = { hit_small: 0.07, minion_die: 0.09, minionShot: 0.12, hit_blade: 0.04, hit_blunt: 0.05, hit_arrow: 0.035, hit_magic: 0.04, hit_ice: 0.04, hit_struct: 0.06, skill_hit: 0.05, big_hit: 0.08, dot: 0.22, heal: 0.3, move: 0.06, swing: 0.05, towerShot: 0.08, shield_on: 0.15, lasthit: 0.03, buff_gain: 0.3, stun: 0.12, freeze: 0.15, deflect: 0.05, spout: 0.1, cd_ready: 0.08 };

  Au.init = function () {
    if (Au.ctx) { if (Au.ctx.state === 'suspended') { try { Au.ctx.resume(); } catch (e) { /* 무시 */ } } return; }
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return;
      const ctx = Au.ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 14; comp.ratio.value = 7; comp.attack.value = 0.003; comp.release.value = 0.18;
      Au.master = ctx.createGain(); Au.master.gain.value = Au.muted ? 0 : 0.85;
      Au.master.connect(comp); comp.connect(ctx.destination);
      Au.sfx = ctx.createGain(); Au.sfx.gain.value = 1; Au.sfx.connect(Au.master);
      Au.mus = ctx.createGain(); Au.mus.gain.value = Au.musicOn ? 0.5 : 0; Au.mus.connect(Au.master);
      Au.queue = Sy.names.filter(n => n.indexOf('i_') === 0).concat(Sy.names.filter(n => n.indexOf('i_') !== 0));      // 악기 소리부터 만든다
      Au.ok = true;
      if (ctx.state === 'suspended') ctx.resume();
      Au.nextT = ctx.currentTime + 0.25;
    } catch (e) { Au.ok = false; }
  };
  function buffer(name) {
    let b = Au.bufs.get(name);
    if (b) return b;
    const s = Sy.make(name, Au.ctx.sampleRate); if (!s) return null;
    const ab = Au.ctx.createBuffer(1, s.data.length, Au.ctx.sampleRate);
    ab.getChannelData(0).set(s.data);
    b = { buf: ab, gain: s.gain };
    Au.bufs.set(name, b);
    return b;
  }
  Au.setMuted = function (m) { Au.muted = m; if (Au.ok) { try { Au.master.gain.setTargetAtTime(m ? 0 : 0.85, Au.ctx.currentTime, 0.04); } catch (e) { /* 무시 */ } } };
  Au.setMusic = function (on) { Au.musicOn = on; if (Au.ok) { try { Au.mus.gain.setTargetAtTime(on ? 0.5 : 0, Au.ctx.currentTime, 0.1); } catch (e) { /* 무시 */ } } };

  /* 한 소리 재생. o: { vol, rate, pan, at(초 뒤), bus, vary(음높이 흔들림) }. 반환: 소스 노드(멈출 때 씀) */
  function emit(name, o) {
    if (!Au.ok) return null;
    o = o || {};
    const vol = o.vol === undefined ? 1 : o.vol;
    if (!(vol > 0.015)) return null;
    try {
      const ctx = Au.ctx, t = ctx.currentTime + (o.at || 0);
      if (!o.music) {
        const gap = GAP[name] === undefined ? 0.025 : GAP[name], lt = Au.last[name];
        if (lt !== undefined && t - lt < gap) return null;
        if (Au.voices > 30 && vol < 0.5) return null;
        Au.last[name] = t;
      }
      const b = buffer(name); if (!b) return null;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = b.buf;
      const vary = o.vary === undefined ? 0.05 : o.vary;
      src.playbackRate.value = Math.max(0.25, (o.rate || 1) * (1 + (Math.random() - 0.5) * 2 * vary));
      g.gain.value = Math.min(1.4, vol * b.gain);
      src.connect(g);
      let tail = g;
      if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = U.clamp(o.pan, -1, 1); g.connect(p); tail = p; }
      tail.connect(o.music ? Au.mus : Au.sfx);
      Au.voices++;
      src.onended = () => { Au.voices--; };
      src.start(t);
      return src;
    } catch (e) { return null; }
  }
  Au.play = function (name, vol, rate) { return emit(name, { vol: vol === undefined ? 1 : vol, rate: rate || 1 }); };
  /* 화면 가운데에서 멀수록 작게, 좌우로 치우치게 */
  const _o = { vol: 0, pan: 0, rate: 1, vary: 0.05 };
  function at(name, x, y, vol, rate, force) {
    const W = TW.World, d = U.dist(x, y, W.cam.x, W.cam.y);
    let k = 1 - d / 44; if (k <= 0) { if (!force) return null; k = 0.12; }
    _o.vol = vol * Math.max(force || 0, k * Math.sqrt(k)); _o.pan = U.clamp((x - W.cam.x) / 30, -1, 1) * 0.7; _o.rate = rate || 1; _o.vary = 0.05;
    return emit(name, _o);
  }

  const SWING = { moru: 'swing_heavy', hanui: 'thrustS', geumeum: 'swing', agwi: 'swing_heavy' };
  const SHOT = { bulti: 'bow', chorong: 'wisp', seori: 'iceS', narae: 'mote' };
  const HIT = { moru: 'hit_blunt', agwi: 'hit_blunt', hanui: 'hit_blade', geumeum: 'hit_blade', bulti: 'hit_arrow', chorong: 'hit_magic', narae: 'hit_magic', seori: 'hit_ice' };
  const CAST = { ram: 'ram', shell: 'shell', quake: 'quake', thrust: 'thrust', deflect: 'spin', gale: 'gale', crescent: 'crescent', smoke: 'smoke', bladeride: 'bladeride', darkmoon: 'darkmoon', firebolt: 'firebolt', jar: 'jar', tumble: 'roll', lantern: 'lantern', blink: 'blink', moon: 'moon', icicle: 'icicle', pond: 'pond', slide: 'slide', dustline: 'dustline', wing: 'wing', hook: 'hook', lure: 'lure', whirl: 'whirl' };
  const WIND = { landslide: 'landslideCast', blizzard: 'blizzardCast', quake: 'swing_heavy', hook: 'swing_heavy', lure: 'shield_on', moon: 'shield_on', dawn: 'shield_on' };
  const CC = { stun: 'stun', freeze: 'freeze', air: 'air', root: 'root', taunt: 'taunt' };

  Au.onEvent = function (e, G, me) {
    if (!Au.ok || Au.muted) return;
    switch (e.type) {
      case 'attackStart': { const u = e.u; if (u.isHero && !u.ranged) at(SWING[u.heroId] || 'swing', u.x, u.y, u === me ? 0.75 : 0.32); break; }
      case 'shoot': {
        const u = e.u;
        if (u.isHero) at(SHOT[u.heroId] || 'bow', u.x, u.y, u === me ? 0.8 : 0.36);
        else if (u.isStruct) at('towerShot', u.x, u.y, 0.7);
        else if (u.isMonster) at('wisp', u.x, u.y, 0.5, 0.6);
        else at('minionShot', u.x, u.y, 0.3);
        break;
      }
      case 'hit': {
        const s = e.src, tg = e.tgt, mine = s === me, onMe = tg === me, tier = e.tier;
        if (tier === 'dot') { if (mine || onMe) emit('dot', { vol: 0.5 }); break; }
        const base = tg.isStruct ? 'hit_struct' : s && s.isHero ? HIT[s.heroId] : s && s.isMinion ? 'hit_small' : 'hit_blunt';
        const k = mine ? 1 : onMe ? 0.9 : (s && s.isHero && tg.isHero) ? 0.5 : (s && s.isMinion && !tg.isHero) ? 0.14 : 0.32;
        if (tier === 'basic') at(base, tg.x, tg.y, 0.95 * k, 1, mine || onMe ? 0.8 : 0);
        else if (tier === 'big') { at('big_hit', tg.x, tg.y, 1.0 * (mine || onMe ? 1 : 0.6), 1, mine || onMe ? 0.9 : 0); Au.duck = 0.5; }
        else { at('skill_hit', tg.x, tg.y, 1.0 * k, tg.isHero ? 1 : 1.15, mine || onMe ? 0.8 : 0); if (mine || onMe) at(base, tg.x, tg.y, 0.5, 0.9, 0.5); }
        break;
      }
      case 'lastHit': if (e.u === me) { const n = Math.min(9, Math.max(0, TW.UI.combo.n - 1)); emit('lasthit', { vol: 0.95, rate: Math.pow(2, n / 12), vary: 0 }); } break;
      case 'gold': if (e.u === me && e.reason !== 'cs' && e.amt >= 60) emit('gold', { vol: 0.8, at: 0.25 }); break;
      case 'kill': {
        const v = e.victim, k = e.killer;
        at('hero_die', v.x, v.y, 0.8, 1, v === me || k === me ? 0.8 : 0);
        if (v === me) { emit('my_death', { vol: 1, vary: 0 }); Au.duck = 1.5; }
        else if (e.first) { emit('firstblood', { vol: 1, vary: 0 }); Au.duck = 1; }
        else if (k === me) { emit(e.multi >= 2 ? 'multi' + Math.min(5, e.multi) : 'kill', { vol: 1, vary: 0 }); Au.duck = 1; }
        else if (k && me && k.team === me.team) emit(e.multi >= 3 ? 'multi' + Math.min(5, e.multi) : 'kill_ally', { vol: e.multi >= 3 ? 0.7 : 0.6, vary: 0 });
        else emit(e.multi >= 3 ? 'shutdown' : 'enemy_kill', { vol: 0.6, vary: 0 });
        if (e.shutdown) emit('shutdown', { vol: 0.7, at: 0.5, vary: 0 });
        break;
      }
      case 'ace': emit('ace', { vol: 0.9, at: 0.4, vary: 0 }); Au.duck = 1.5; break;
      case 'death': { const u = e.u; if (u.isMinion) at('minion_die', u.x, u.y, 0.4); else if (u.isMonster) at('monster_die', u.x, u.y, 0.8, u.kind === 'elder' ? 0.6 : u.r > 1.3 ? 0.8 : 1.2); break; }
      case 'cast': { const w = WIND[e.ab.icon]; if (w && e.ab.castTime >= 0.25) at(w, e.u.x, e.u.y, e.u === me ? 0.8 : 0.5, 1, e.u === me ? 0.7 : 0); break; }
      case 'castFire': { const c = CAST[e.ab.icon]; if (c) at(c, e.u.x, e.u.y, e.u === me ? 0.95 : 0.6, 1, e.u === me ? 0.85 : 0); break; }
      case 'chargeStart': if (e.u === me) { Au.chargeSrc = emit('chargeUp', { vol: 0.8, vary: 0 }); } else at('chargeUp', e.u.x, e.u.y, 0.5); break;
      case 'chargeEnd': if (e.u === me && Au.chargeSrc) { try { Au.chargeSrc.stop(); } catch (er) { /* 이미 끝남 */ } Au.chargeSrc = null; } break;
      case 'sfx': {
        const n = e.name;
        if (n === 'flurry') at('flurry', e.x, e.y, 0.8, 1 + (e.n || 0) * 0.03, 0.3);
        else if (n === 'barrage') at('barrage', e.x, e.y, 0.75, 1 + (e.n || 0) * 0.012, 0.3);
        else if (n === 'beam') at('beam', e.x, e.y, 0.6 + 0.4 * (e.k || 0), 1.25 - 0.3 * (e.k || 0), 0.5);
        else at(n, e.x, e.y, 0.95, 1, 0.35);
        break;
      }
      case 'cc': { const u = e.u, n = CC[e.kind]; if (n && (u.isHero || u.isMonster)) at(n, u.x, u.y, u === me ? 1 : 0.55, 1, u === me ? 0.9 : 0); break; }
      case 'buff': if (e.b.shield > 0) at('shield_on', e.u.x, e.u.y, e.u === me ? 0.8 : 0.45); break;
      case 'heal': if (e.tgt === me || e.src === me) emit('heal', { vol: 0.6 }); break;
      case 'dashStart': if (e.kind === 'roll') at('roll', e.u.x, e.u.y, e.u === me ? 0.9 : 0.45); else if (e.u.isMonster) at('ram', e.u.x, e.u.y, 0.6); break;
      case 'dodge': at('dodge', e.u.x, e.u.y, e.u === me ? 1 : 0.4, 1, e.u === me ? 0.9 : 0); break;
      case 'deflect': at('deflect', e.x, e.y, e.u === me ? 0.9 : 0.5); break;
      case 'towerLock': if (e.target === me) emit('tower_lock', { vol: 0.9, vary: 0 }); break;
      case 'towerDown': at('tower_down', e.tower.x, e.tower.y, 1, 1, 0.5); Au.duck = 1; break;
      case 'coreDown': emit('tower_down', { vol: 1, rate: 0.72, vary: 0 }); break;
      case 'levelup': if (e.u === me) { emit('levelup', { vol: 0.9, vary: 0 }); if (e.ult) emit('ult_ready', { vol: 0.9, at: 0.6, vary: 0 }); } break;
      case 'buy': if (e.u === me) emit('buy', { vol: 0.9, vary: 0 }); break;
      case 'buffGain': if (e.u === me) emit('buff_gain', { vol: 0.9, vary: 0 }); else at('buff_gain', e.u.x, e.u.y, 0.5); break;
      case 'bossSpawn': emit('boss_spawn', { vol: 0.8, vary: 0 }); break;
      case 'bossDown': emit('boss_down', { vol: 1, vary: 0 }); Au.duck = 1.5; break;
      case 'respawn': if (e.u === me) emit('respawn', { vol: 0.8, vary: 0 }); break;
      case 'recallStart': if (e.u === me) emit('recall', { vol: 0.8, vary: 0 }); break;
      case 'say': if (me && e.team === me.team) emit('ping', { vol: 0.45, vary: 0 }); break;
      case 'zoneBlast': { const k = e.z.vis.kind; if (k === 'sticky') at('splat', e.z.x, e.z.y, 0.8); else if (k === 'smoke') at('smoke', e.z.x, e.z.y, 0.5, 1.2); break; }
      default: break;
    }
  };
  /* 큰 알림이 화면에 뜰 때 (이미 사건에서 소리를 냈으므로 여기서는 보조만) */
  Au.banner = function (b) { if (b && b.icon === 'boss') return; };
  Au.startGame = function () { Au.over = false; Au.cur = 1; if (Au.ok) { try { Au.mus.gain.setTargetAtTime(Au.musicOn ? 0.5 : 0, Au.ctx.currentTime, 0.2); } catch (e) { /* 무시 */ } } };
  Au.menu = function () { Au.over = false; Au.mood = 0; if (Au.ok) { try { Au.mus.gain.setTargetAtTime(Au.musicOn ? 0.5 : 0, Au.ctx.currentTime, 0.3); } catch (e) { /* 무시 */ } } };      // 경기 끝에 줄여 둔 음악을 되살린다
  Au.gameOver = function (win) { Au.over = true; emit(win ? 'victory' : 'defeat', { vol: 1, at: 1.3, vary: 0 }); if (Au.ok) { try { Au.mus.gain.setTargetAtTime(0.0001, Au.ctx.currentTime + 0.8, 0.4); } catch (e) { /* 무시 */ } } };

  /* ---------- 배경 음악 ---------- */
  const BPM = 92, STEP = 60 / BPM / 4;
  const PROG = [  // 마디마다: [베이스 음, 화음 구성음...]
    [38, 50, 57, 62, 65], [38, 50, 57, 62, 65], [34, 46, 53, 58, 62], [36, 48, 55, 60, 64],
    [38, 50, 57, 62, 65], [41, 53, 57, 60, 65], [36, 48, 55, 60, 64], [33, 45, 52, 57, 60],
  ];
  const BUK = [[], [0, 10], [0, 6, 10], [0, 3, 6, 8, 11, 14]];
  const SLAP = [[], [], [4, 12], [4, 7, 12, 13, 15]];
  let mseed = 4242;
  const mr = () => { mseed = (mseed * 1103515245 + 12345) >>> 0; return (mseed >>> 8) / 16777216; };
  function note(name, t, midiNote, base, gain) {
    if (!(gain > 0.004)) return;
    try {
      const ctx = Au.ctx, b = buffer(name); if (!b) return;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = b.buf; src.playbackRate.value = Math.pow(2, (midiNote - base) / 12); g.gain.value = gain * b.gain;
      src.connect(g); g.connect(Au.mus); src.start(Math.max(ctx.currentTime, t));
    } catch (e) { /* 무시 */ }
  }
  function scheduleStep(t) {
    const s = Au.step, bar = Au.bar, ch = PROG[bar % PROG.length];
    if (s === 0 || s === 8) { if (Au.cur < Au.mood) Au.cur++; else if (Au.cur > Au.mood && s === 0) Au.cur--; }
    const m = Au.cur;
    if (s === 0) {
      for (let i = 1; i <= 3; i++) note('i_pad', t, ch[i], 50, m === 0 ? 0.36 : 0.28);
      if (m >= 3 && bar % 2 === 0) note('i_gong', t, 31, 31, 0.5);
      if (m <= 1 && mr() < 0.4) { const n = ch[2 + ((mr() * 3) | 0)] + 12; note('i_flute', t + STEP * 2, n, 74, 0.34); if (mr() < 0.5) note('i_flute', t + STEP * 10, n + (mr() < 0.5 ? 3 : -2), 74, 0.26); }
    }
    if (m >= 1) {
      const bassOn = m === 1 ? (s === 0 || s === 8) : m === 2 ? (s === 0 || s === 6 || s === 8 || s === 14) : (s % 2 === 0);
      if (bassOn) note('i_bass', t, ch[0] + (m >= 3 && s % 4 === 2 ? 12 : 0), 38, m >= 3 ? 0.6 : 0.5);
      if (BUK[m].indexOf(s) >= 0) note('i_buk', t, 60, 60, s === 0 ? 0.75 : 0.5);
      if (SLAP[m].indexOf(s) >= 0) note('i_slap', t, 60, 60, 0.5 + mr() * 0.15);
      if (m === 1 ? s % 4 === 2 : m === 2 ? s % 2 === 0 : true) note('i_tick', t, 60, 60, (s % 4 === 0 ? 0.5 : 0.28) * (m >= 3 ? 1.2 : 1));
      if (m >= 2 && (s === 2 || s === 9) && mr() < 0.55) note('i_wood', t, 60 + ((mr() * 3) | 0) * 2, 60, 0.45);
    }
    // 뜯는 가락: 화음 구성음을 오르내린다
    const dens = m === 0 ? 0.3 : m === 1 ? 0.5 : m === 2 ? 0.72 : 0.86, grid = m <= 1 ? 2 : 1;
    if (s % grid === 0 && mr() < dens && (m > 0 || s % 4 !== 2)) {
      const up = [1, 2, 3, 4, 3, 2], k = up[(s / grid + bar) % up.length | 0], oct = (mr() < 0.3 ? 24 : 12);
      note('i_pluck', t + mr() * 0.008, ch[k] + oct, 62, (s % 4 === 0 ? 0.5 : 0.34) * (0.8 + mr() * 0.4) * (m === 0 ? 0.9 : 1));
    }
    Au.step++; if (Au.step >= 16) { Au.step = 0; Au.bar++; }
  }
  /* 매 프레임: 소리 미리 만들기 + 음악 예약 + 재사용 완료 알림 */
  Au.tick = function (dt, mood, G, me) {
    if (!Au.ok) return;
    const ctx = Au.ctx;
    for (let i = 0; i < 2 && Au.queue.length; i++) buffer(Au.queue.shift());
    Au.mood = mood | 0;
    if (Au.duck > 0) { Au.duck -= dt; }
    if (me && !me.dead) {
      for (let i = 0; i < 4; i++) { const cd = me.cds[i]; if (Au.prevCd[i] > 0 && cd <= 0 && !Au.muted) emit('cd_ready', { vol: i === 3 ? 0.9 : 0.6, rate: 1 + i * 0.06, vary: 0 }); Au.prevCd[i] = cd; }
    }
    if (Au.muted || !Au.musicOn || Au.over) { Au.nextT = ctx.currentTime + 0.2; return; }
    if (Au.nextT < ctx.currentTime - 0.5) Au.nextT = ctx.currentTime + 0.1;
    let guard = 0;
    while (Au.nextT < ctx.currentTime + 0.22 && guard++ < 8) { scheduleStep(Au.nextT); Au.nextT += STEP; }
  };
})();
