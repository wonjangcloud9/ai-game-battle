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
  const I = (G.Input = { down: {}, pressed: {}, enabled: true });
  I.map = {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    jump: ['Space', 'KeyX'], attack: ['KeyZ'],
    s0: ['KeyA'], s1: ['KeyS'], s2: ['KeyD'], s3: ['KeyF'], s4: ['KeyQ'], s5: ['KeyW'],
    hp: ['Digit1'], mp: ['Digit2'],
  };
  I.SLOT_KEYS = ['A', 'S', 'D', 'F', 'Q', 'W'];
  // keys the game owns (default browser actions such as scrolling or type-ahead find are suppressed for these)
  const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyQ', 'KeyW', 'KeyZ', 'KeyX', 'KeyC', 'KeyI', 'KeyK', 'KeyJ', 'KeyM', 'Digit1', 'Digit2', 'Slash', 'Quote']);
  const isTyping = (e) => {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!I.down[e.code]) { I.pressed[e.code] = true; G.emit('key', e.code, e); }
    I.down[e.code] = true;
  });
  window.addEventListener('keyup', (e) => { I.down[e.code] = false; });
  window.addEventListener('blur', () => { I.down = {}; I.pressed = {}; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { I.down = {}; I.pressed = {}; } });
  I.isDown = (act) => {
    if (!I.enabled) return false;
    const ks = I.map[act];
    for (let i = 0; i < ks.length; i++) if (I.down[ks[i]]) return true;
    return false;
  };
  I.hit = (act) => {
    if (!I.enabled) return false;
    const ks = I.map[act];
    for (let i = 0; i < ks.length; i++) if (I.pressed[ks[i]]) return true;
    return false;
  };
  I.endFrame = () => { I.pressed = {}; };
  // virtual press/release (touch buttons, tests)
  I.vdown = (code) => { if (!I.down[code]) I.pressed[code] = true; I.down[code] = true; };
  I.vup = (code) => { I.down[code] = false; };

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
