/* SUNDRIFT GP — input: keyboard, gamepad and touch folded into one driving state. */
(function (root) {
  'use strict';
  var SD = root.SD;

  var MAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'drift', KeyZ: 'drift',
    ShiftLeft: 'boost', ShiftRight: 'boost', KeyX: 'boost'
  };
  var MENU = { Enter: 'confirm', NumpadEnter: 'confirm', Escape: 'pause', KeyP: 'pause', KeyR: 'restart', KeyM: 'mute', KeyF: 'fullscreen' };

  var held = { up: false, down: false, left: false, right: false, drift: false, boost: false };
  var touch = { left: false, right: false, drift: false, boost: false, brake: false, active: false };
  var pad = { throttle: 0, brake: 0, turn: 0, drift: false, boost: false, boostPrev: false, startPrev: false, confirmPrev: false };

  var Input = {
    state: { throttle: 0, brake: 0, turn: 0, drift: false, boost: false },
    boostQueued: false,
    throttleDownAt: -1e9,       // performance.now() of the last throttle press (for the rocket start)
    throttleHeld: false,
    listeners: [],
    touchActive: false,
    enabled: true
  };

  Input.on = function (fn) { Input.listeners.push(fn); };
  function fire(action) { for (var i = 0; i < Input.listeners.length; i++) Input.listeners[i](action); }

  function now() { return (root.performance && performance.now) ? performance.now() : Date.now(); }

  function keydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;            // leave browser / OS shortcuts alone
    var a = MAP[e.code], m = MENU[e.code];
    if (a) {
      if (touch.active) {                                     // a real keyboard takes over from the touch pad (and its auto-throttle)
        touch.active = false; Input.touchActive = false; touch.left = touch.right = touch.drift = touch.boost = touch.brake = false;
        var tb = document.getElementById('touch');
        if (tb) tb.classList.add('hidden');
      }
      if (!held[a]) {
        if (a === 'boost') Input.boostQueued = true;
        if (a === 'up') Input.throttleDownAt = now();
        if (a === 'left') fire('left');
        if (a === 'right') fire('right');
        if (a === 'drift') fire('confirm-soft');
      }
      held[a] = true;
      e.preventDefault();
    }
    if (m && !e.repeat) { fire(m); if (e.code !== 'Escape') e.preventDefault(); }
  }
  function keyup(e) {
    var a = MAP[e.code];
    if (a) { held[a] = false; e.preventDefault(); }
  }
  function clearAll() {
    for (var k in held) held[k] = false;
    touch.left = touch.right = touch.drift = touch.boost = touch.brake = false;
  }

  Input.attach = function () {
    root.addEventListener('keydown', keydown, { passive: false });
    root.addEventListener('keyup', keyup, { passive: false });
    root.addEventListener('blur', clearAll);
    document.addEventListener('visibilitychange', function () { if (document.hidden) clearAll(); });
    // touch buttons (shown on first touch)
    var box = document.getElementById('touch');
    if (box) {
      var btns = box.querySelectorAll('[data-act]');
      Array.prototype.forEach.call(btns, function (b) {
        var act = b.getAttribute('data-act');
        var down = function (ev) {
          ev.preventDefault();
          if (act === 'boost' && !touch.boost) Input.boostQueued = true;
          touch[act] = true; b.classList.add('on');
        };
        var up = function (ev) { ev.preventDefault(); touch[act] = false; b.classList.remove('on'); };
        b.addEventListener('touchstart', down, { passive: false });
        b.addEventListener('touchend', up, { passive: false });
        b.addEventListener('touchcancel', up, { passive: false });
      });
      root.addEventListener('touchstart', function () {
        if (!Input.touchActive) { Input.touchActive = true; touch.active = true; box.classList.remove('hidden'); Input.throttleDownAt = now(); }
      }, { passive: true });
    }
  };

  function pollPad() {
    pad.throttle = 0; pad.brake = 0; pad.turn = 0; pad.drift = false; pad.boost = false;
    if (!navigator.getGamepads) return;
    var list;
    try { list = navigator.getGamepads(); } catch (e) { return; }
    for (var i = 0; list && i < list.length; i++) {
      var g = list[i];
      if (!g || !g.connected || !g.buttons || g.buttons.length < 4) continue;
      var b = g.buttons, v = function (n) { return b[n] ? (b[n].value || (b[n].pressed ? 1 : 0)) : 0; };
      var x = g.axes && g.axes.length ? g.axes[0] : 0;
      if (Math.abs(x) < 0.16) x = 0;
      if (v(14) > 0.5) x = -1; else if (v(15) > 0.5) x = 1;
      pad.turn = -x;                                       // stick right = turn right = negative
      var th = Math.max(v(7), v(0));
      if (th > 0.05 && pad.throttle <= 0.05 && !Input.throttleHeld) Input.throttleDownAt = now();
      pad.throttle = th;
      pad.brake = Math.max(v(6), v(1));
      pad.drift = v(5) > 0.5 || v(2) > 0.5;
      pad.boost = v(4) > 0.5 || v(3) > 0.5;
      if (pad.boost && !pad.boostPrev) Input.boostQueued = true;
      pad.boostPrev = pad.boost;
      var start = v(9) > 0.5;
      if (start && !pad.startPrev) fire('pause');
      pad.startPrev = start;
      var conf = v(0) > 0.5;
      if (conf && !pad.confirmPrev) fire('confirm-soft');
      pad.confirmPrev = conf;
      break;
    }
  }

  /** Call once per frame; returns the merged driving state. `boost` is true for one poll per press. */
  Input.poll = function () {
    pollPad();
    var s = Input.state;
    var kTurn = (held.left ? 1 : 0) - (held.right ? 1 : 0);
    var tTurn = (touch.left ? 1 : 0) - (touch.right ? 1 : 0);
    s.turn = SD.clamp(kTurn + tTurn + pad.turn, -1, 1);
    s.throttle = Math.max(held.up ? 1 : 0, pad.throttle, (touch.active && !touch.brake) ? 1 : 0);
    s.brake = Math.max(held.down ? 1 : 0, pad.brake, touch.brake ? 1 : 0);
    s.drift = held.drift || pad.drift || touch.drift;
    s.boost = Input.boostQueued;
    Input.boostQueued = false;
    Input.throttleHeld = s.throttle > 0.05;
    return s;
  };

  Input.held = held;
  /** Test helper: press / release logical controls programmatically. */
  Input.set = function (o) { for (var k in o) { if (k === 'boost' && o[k] && !held.boost) Input.boostQueued = true; held[k] = !!o[k]; } };

  SD.input = Input;
})(typeof window !== 'undefined' ? window : globalThis);
