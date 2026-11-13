// AURORA FALL — keyboard / mouse / pointer-lock input
'use strict';

const Input = {
  keys: {}, pressed: {}, buttons: [false, false, false], clicked: [false, false, false],
  dx: 0, dy: 0, wheel: 0, locked: false, canvas: null, enabled: true,
  onLockChange: null,

  init(canvas) {
    this.canvas = canvas;
    const GAME_KEYS = { Space: 1, Tab: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, KeyF: 1, Slash: 1, Quote: 1 };
    window.addEventListener('keydown', e => {
      const t = e.target;
      // typing in a menu field must not drive the game (but never ignore keys while playing)
      if (!this.locked && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      // while playing swallow everything except the function keys; in menus only the keys the game uses
      if (this.locked ? !/^F\d+$/.test(e.code) : GAME_KEYS[e.code]) e.preventDefault();
      if (!e.repeat) { this.keys[e.code] = true; this.pressed[e.code] = true; }
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.buttons = [false, false, false]; });
    canvas.addEventListener('mousedown', e => {
      if (e.button < 3) { this.buttons[e.button] = true; this.clicked[e.button] = true; }
      if (this.locked) e.preventDefault();
    });
    window.addEventListener('mouseup', e => { if (e.button < 3) this.buttons[e.button] = false; });
    window.addEventListener('mousemove', e => {
      if (!this.locked) return;
      // some browsers report huge spikes when the pointer is (re)locked
      const mx = e.movementX || 0, my = e.movementY || 0;
      if (Math.abs(mx) > 600 || Math.abs(my) > 600) return;
      this.dx += mx; this.dy += my;
    });
    window.addEventListener('wheel', e => { if (this.locked) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
    window.addEventListener('contextmenu', e => { if (this.locked || e.target === canvas) e.preventDefault(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys = {}; this.buttons = [false, false, false]; }
      this.dx = 0; this.dy = 0;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; if (this.onLockChange) this.onLockChange(false); });
  },
  requestLock() {
    if (this.locked || !this.canvas || !this.canvas.requestPointerLock) return;
    // a focused text field / slider would keep swallowing the keyboard
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae.blur) ae.blur();
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { /* the user can click again */ });
    } catch (e) { /* ignore */ }
  },
  exitLock() { if (document.exitPointerLock && this.locked) document.exitPointerLock(); },
  down(code) { return !!this.keys[code]; },
  hit(code) { return !!this.pressed[code]; },
  endFrame() { this.pressed = {}; this.clicked[0] = this.clicked[1] = this.clicked[2] = false; this.dx = 0; this.dy = 0; this.wheel = 0; },
};
