'use strict';
/* 등불지기 — core: namespace, utils, events, input, save */
(function () {
  const G = (window.G = {
    VER: '1.0.0',
    W: 1280, H: 720,        // logical view size (all game/UI coordinates use this)
    RS: 1,                  // render scale: backing-store pixels per logical pixel (set at boot)
    time: 0,                // global clock in seconds (runs always, for ambient animation)
  });

  // ---------------------------------------------------------------- utils
  const U = (G.U = {});
  U.TAU = Math.PI * 2;
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a, b) => (b === undefined ? Math.random() * (a === undefined ? 1 : a) : a + Math.random() * (b - a));
  U.randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  U.pick = (arr) => arr[(Math.random() * arr.length) | 0];
  U.chance = (p) => Math.random() < p;
  U.approach = (v, target, d) => (v < target ? Math.min(v + d, target) : Math.max(v - d, target));
  U.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  U.overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  U.fmt = (n) => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  U.sat = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  U.ease = {
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (U.TAU / 3)) + 1),
  };
  // seeded RNG (mulberry32) + string hash, for deterministic decoration / art variation
  U.hash = (s) => {
    let h = 2166136261;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  U.rng = (seed) => {
    let a = (typeof seed === 'string' ? U.hash(seed) : seed) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.weighted = (list, key) => {
    let sum = 0;
    for (const o of list) sum += o[key || 'w'];
    let r = Math.random() * sum;
    for (const o of list) { r -= o[key || 'w']; if (r <= 0) return o; }
    return list[list.length - 1];
  };
  U.uid = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  // Korean particle helper: U.josa('검', '을/를') -> '검을'
  U.josa = (word, pair) => {
    const [a, b] = pair.split('/');
    const c = word.charCodeAt(word.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return word + (/[0136780lmnLMN]$/.test(word) ? a : b);
    const jong = (c - 0xac00) % 28;
    if (pair === '으로/로' && jong === 8) return word + b;
    return word + (jong ? a : b);
  };

  // ---------------------------------------------------------------- events
  const handlers = {};
  G.on = (evt, fn) => { (handlers[evt] || (handlers[evt] = [])).push(fn); };
  G.emit = (evt, a, b, c) => {
    const hs = handlers[evt];
    if (hs) for (let i = 0; i < hs.length; i++) hs[i](a, b, c);
  };

  // ---------------------------------------------------------------- input
  // Codes are KeyboardEvent.code, except that left/right modifier variants are folded into 'Ctrl' / 'Alt' / 'Shift'.
  // Bindings are user-configurable (설정 › 키 설정) and stored in the options save.
  const I = (G.Input = { down: {}, pressed: {}, enabled: true, capture: null });
  I.isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
  I.SLOTS = 8; // skill slot i ↔ action 's'+i · slots 0-3 = lower hotbar row (A S D F), 4-7 = upper row (Q W E R)
  I.DEFAULT = {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: ['Alt', 'Space'], attack: ['Ctrl', 'KeyZ'],
    s0: ['KeyA'], s1: ['KeyS'], s2: ['KeyD'], s3: ['KeyF'], s4: ['KeyQ'], s5: ['KeyW'], s6: ['KeyE'], s7: ['KeyR'],
    hp: ['Digit1'], mp: ['Digit2'],
  };
  I.PRESETS = [
    { id: 'pc', name: 'PC 기본', desc: 'Ctrl 공격 · Alt 점프', map: { jump: ['Alt', 'Space'], attack: ['Ctrl', 'KeyZ'] } },
    { id: 'classic', name: '간편식', desc: 'Z 공격 · Space 점프', map: { jump: ['Space', 'Alt'], attack: ['KeyZ'] } },
  ];
  I.ACTS = [
    ['left', '왼쪽 이동'], ['right', '오른쪽 이동'], ['up', '위 (대화 · 포탈 · 사다리)'], ['down', '아래 (사다리 · 발판 내려가기)'],
    ['jump', '점프'], ['attack', '기본 공격'],
    ['s4', '스킬 · 윗줄 1'], ['s5', '스킬 · 윗줄 2'], ['s6', '스킬 · 윗줄 3'], ['s7', '스킬 · 윗줄 4'],
    ['s0', '스킬 · 아랫줄 1'], ['s1', '스킬 · 아랫줄 2'], ['s2', '스킬 · 아랫줄 3'], ['s3', '스킬 · 아랫줄 4'],
    ['hp', 'HP 물약'], ['mp', 'MP 물약'],
  ];
  // keys that can never be bound (window hotkeys, dialog keys, OS keys)
  I.RESERVED = { Escape: 1, Enter: 1, NumpadEnter: 1, Tab: 1, Meta: 1, CapsLock: 1, KeyC: 1, KeyI: 1, KeyK: 1, KeyJ: 1, KeyM: 1, F5: 1, F11: 1, F12: 1 };
  const NORM = { ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', ShiftLeft: 'Shift', ShiftRight: 'Shift', MetaLeft: 'Meta', MetaRight: 'Meta', OSLeft: 'Meta', OSRight: 'Meta' };
  I.norm = (c) => NORM[c] || c;
  const cloneMap = (m) => { const o = {}; for (const k in m) o[k] = m[k].slice(); return o; };
  I.map = cloneMap(I.DEFAULT);
  // keys the game owns (default browser actions — scrolling, find, history back, reload… — are suppressed for these)
  const UI_KEYS = ['KeyC', 'KeyI', 'KeyK', 'KeyJ', 'KeyM', 'Tab', 'Space', 'Slash', 'Quote', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Alt'];
  let owned = new Set();
  I.rebuild = () => { owned = new Set(UI_KEYS); for (const k in I.map) for (const c of I.map[k]) owned.add(c); };
  I.setMap = (m) => {
    const out = cloneMap(I.DEFAULT);
    if (m && typeof m === 'object') for (const k in out) if (Array.isArray(m[k])) out[k] = m[k].filter((c) => typeof c === 'string' && c && !I.RESERVED[c]).slice(0, 2);
    I.map = out; I.rebuild();
  };
  I.uses = (code) => { for (const k in I.map) if (I.map[k].includes(code)) return true; return false; };
  I.rebuild();
  const LBL = {
    Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', IntlBackslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', Backspace: 'Bksp', ContextMenu: 'Menu', Lang1: '한/영', Lang2: '한자',
  };
  I.label = (c) => {
    if (!c) return '';
    if (LBL[c]) return LBL[c];
    let m = /^Key([A-Z])$/.exec(c) || /^Digit(\d)$/.exec(c);
    if (m) return m[1];
    if ((m = /^Numpad(.+)$/.exec(c))) return 'Num' + ({ Add: '+', Subtract: '-', Multiply: '*', Divide: '/', Decimal: '.' }[m[1]] || m[1]);
    return c;
  };
  I.key = (act) => { const k = I.map[act]; return k && k.length ? I.label(k[0]) : '—'; };          // primary key label
  I.keys = (act, sep) => { const k = I.map[act] || []; return k.length ? k.map(I.label).join(sep || ' / ') : '—'; };
  I.fmt = (s) => String(s).replace(/\{(\w+)\}/g, (m, a) => (I.map[a] ? I.key(a) : m)); // "{jump} 키로 점프" → "Alt 키로 점프"
  const isTyping = (e) => {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  window.addEventListener('keydown', (e) => {
    const code = I.norm(e.code || e.key || '');
    if (I.capture) { e.preventDefault(); e.stopImmediatePropagation(); const f = I.capture; f(code, e); return; }
    if (isTyping(e)) return;
    if (e.metaKey || code === 'Meta') return; // ⌘ / Win shortcuts belong to the OS and browser
    if (e.ctrlKey && e.shiftKey && code !== 'Ctrl' && code !== 'Shift') return; // dev tools etc.
    const play = !!(G.S && G.S.scene === 'play');
    // Alt alone would focus the browser menu; Ctrl/Alt + a game key would fire browser shortcuts (Alt+← back, Ctrl+R reload, Alt+F menu…)
    if (code === 'Alt' || (owned.has(code) && (play || !(e.ctrlKey || e.altKey)))) e.preventDefault();
    if (!I.down[code]) { I.pressed[code] = true; G.emit('key', code, e); }
    I.down[code] = true;
  });
  window.addEventListener('keyup', (e) => {
    const code = I.norm(e.code || e.key || '');
    if (code === 'Alt') e.preventDefault();
    if (code === 'Meta') { I.down = {}; return; } // macOS swallows the keyups of keys released while ⌘ is held
    I.down[code] = false;
  });
  window.addEventListener('blur', () => { I.down = {}; I.pressed = {}; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { I.down = {}; I.pressed = {}; } });
  // an action is down / pressed through its bound keys, or through its touch control ('@' + action — touch.js, via I.vdown / I.vup)
  I.isDown = (act) => {
    if (!I.enabled) return false;
    if (I.down['@' + act]) return true;
    const ks = I.map[act];
    for (let i = 0; i < ks.length; i++) if (I.down[ks[i]]) return true;
    return false;
  };
  I.hit = (act) => {
    if (!I.enabled) return false;
    if (I.pressed['@' + act]) return true;
    const ks = I.map[act];
    for (let i = 0; i < ks.length; i++) if (I.pressed[ks[i]]) return true;
    return false;
  };
  I.endFrame = () => { I.pressed = {}; };
  // virtual press/release (touch buttons, tests)
  I.vdown = (code) => { if (!I.down[code]) I.pressed[code] = true; I.down[code] = true; };
  I.vup = (code) => { I.down[code] = false; };
  // the label of skill slot i: its key on a keyboard, its button number (1 ~ 8) on the touch controls
  I.slotKey = (i) => (G.touch ? String(i + 1) : I.key('s' + i));

  // ---------------------------------------------------------------- save
  const KEY = 'lanternkeeper.save.v1';
  const OPT = 'lanternkeeper.opt.v1';
  G.Save = {
    has() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } },
    load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    store(data) { try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; } },
    clear() { try { localStorage.removeItem(KEY); } catch (e) {} },
    loadOpt() { try { return JSON.parse(localStorage.getItem(OPT) || '{}') || {}; } catch (e) { return {}; } },
    storeOpt(o) { try { localStorage.setItem(OPT, JSON.stringify(o)); } catch (e) {} },
  };

  // roundRect polyfill (older browsers)
  if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      let rr = typeof r === 'number' ? [r, r, r, r] : r && r.length ? (r.length === 1 ? [r[0], r[0], r[0], r[0]] : r.length === 2 ? [r[0], r[1], r[0], r[1]] : r.length === 3 ? [r[0], r[1], r[2], r[1]] : r) : [0, 0, 0, 0];
      const m = Math.min(Math.abs(w), Math.abs(h)) / 2;
      rr = rr.map((v) => Math.min(v, m));
      this.moveTo(x + rr[0], y);
      this.lineTo(x + w - rr[1], y); this.quadraticCurveTo(x + w, y, x + w, y + rr[1]);
      this.lineTo(x + w, y + h - rr[2]); this.quadraticCurveTo(x + w, y + h, x + w - rr[2], y + h);
      this.lineTo(x + rr[3], y + h); this.quadraticCurveTo(x, y + h, x, y + h - rr[3]);
      this.lineTo(x, y + rr[0]); this.quadraticCurveTo(x, y, x + rr[0], y);
      this.closePath();
    };
  }
})();
