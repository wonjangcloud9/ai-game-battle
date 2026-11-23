'use strict';
/* 등불지기 — touch: controls and layout for phones / tablets (html.touch)
   · a thumb joystick at the bottom left: walk · push up = talk / ladder / beacon / portal (keep it pushed) · down + jump = drop through a ledge
   · big attack and jump buttons at the bottom right, 4 skill buttons above them (two pages: 1~4 · 5~8) and the two potions
     (tap: drink · hold: choose the potion and 초롱이's auto potion)
   · a "turn your phone sideways" notice in portrait (the game waits)
   Touch mode turns on with a touch screen (coarse pointer) or the first touch, and off again with a game key or a mouse click
   (설정 › 터치 조작 can pin it), so a keyboard player never sees any of it. In touch mode the HUD makes room for the controls, windows
   open one at a time, centered and scaled up for fingers, the game waits while a window / card is open, and a tap on an item opens a
   card (its info + what you can do with it) instead of the mouse's tooltip / double-click / right-click. */
(function () {
  const G = window.G, U = G.U, D = G.D, P = G.P, I = G.Input, Inv = G.Inv, UI = G.UI, X = UI._;
  const { $, el, ic, sfx } = X;
  const html = document.documentElement;
  const T = (G.Touch = { on: false, auto: false, blocked: false, portrait: false, shown: false, page: 0, k: 1, ox: 0, oy: 0, hs: 1, ts: 1, gen: 0, comboY: 0 });
  G.touch = false;
  const mq = (q) => { try { return !!(window.matchMedia && matchMedia(q).matches); } catch (e) { return false; } };
  T.auto = mq('(pointer: coarse)');

  const JUMP_SVG = '<svg viewBox="0 0 48 48"><path d="M12 25 L24 13 L36 25" fill="none" stroke="#2b2136" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 25 L24 13 L36 25" fill="none" stroke="#bfe8ff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 37 L24 25 L36 37" fill="none" stroke="#2b2136" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 37 L24 25 L36 37" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let tc = null, rot = null, joyEl, jbEl, jkEl, jlEl, probe = null, canvas, stage, wins, dlg, pp, cm;
  const B = {}; // buttons: atk · jmp · sk[0..3] · hp · mp · pg
  const geo = { R: 60, rest: [0, 0], zone: { x1: 0, y0: 0 } };

  // ------------------------------------------------------------ mode
  function want() { const o = (G.opt && G.opt.touch) || 0; return o === 1 ? true : o === 2 ? false : T.auto; }
  function apply() { setMode(want()); }
  T.apply = apply;
  function setMode(on) {
    if (on === T.on) return;
    T.on = G.touch = on;
    html.classList.toggle('touch', on);
    releaseAll();
    T.gen++; T.shown = false;
    if (tc) tc.classList.add('off');
    if (on && UI.closeAll) UI.closeAll(); // windows reopen in the touch layout (centered, one at a time)
    if (X.syncLock && G.S) X.syncLock();
    G.emit('keys'); // labels: key names ↔ button numbers
    G.emit('touchmode', on);
    if (T.k) T.layout(T.k, T.ox, T.oy);
  }
  // a touch (or a pen) brings the touch controls; a game key or a mouse click puts the keyboard layout back
  const UI_KEYS = { Escape: 1, Enter: 1, Tab: 1, KeyC: 1, KeyI: 1, KeyK: 1, KeyJ: 1, KeyM: 1 };
  window.addEventListener('pointerdown', (e) => {
    const t = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (t !== T.auto && (t || e.pointerType === 'mouse')) { T.auto = t; apply(); }
  }, true);
  window.addEventListener('keydown', (e) => {
    if (!T.auto || I.capture) return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    const code = I.norm(e.code || '');
    if (!code || !(I.uses(code) || UI_KEYS[code])) return; // (volume keys and the like never count)
    T.auto = false; apply();
  }, true);
  // iOS only lets sound start on a finished tap — the touch buttons themselves never produce a click
  window.addEventListener('touchend', () => { if (G.Audio && G.Audio.ready) G.Audio.init(); }, { capture: true, passive: true });

  // ------------------------------------------------------------ DOM
  function build() {
    tc = el('div', 'off'); tc.id = 'tc';
    tc.innerHTML =
      '<div id="tc-joy"><div class="jl"></div><div class="jb"><i class="jd u"></i><i class="jd d"></i><i class="jd l"></i><i class="jd r"></i></div><div class="jk"></div></div>' +
      '<div class="tb atk" data-t="attack"><span class="tw"></span></div>' +
      '<div class="tb jmp" data-t="jump"><span class="tw">' + JUMP_SVG + '</span></div>' +
      [0, 1, 2, 3].map((j) => '<div class="tb sk" data-t="sk" data-j="' + j + '"><span class="tw"></span><em></em><div class="cd"></div></div>').join('') +
      ['hp', 'mp'].map((t) => '<div class="tb pot ' + t + '" data-t="' + t + '"><span class="tw"></span><b></b><u>AUTO</u><div class="cd"></div><i class="lp"></i></div>').join('') +
      '<div class="tb pg" data-t="page"><span>⇄</span><small>1~4</small></div>';
    document.body.appendChild(tc);
    rot = el('div', 'hidden', '<div class="rt-ph"><i></i></div><b>가로로 돌려 주세요</b><small>등불지기는 휴대폰을 옆으로 눕혀서 즐기는 게임이에요.<br>화면 자동 회전이 꺼져 있다면 켜 주세요.</small>');
    rot.id = 'rot';
    document.body.appendChild(rot);
    joyEl = $('#tc-joy'); jbEl = $('.jb', joyEl); jkEl = $('.jk', joyEl); jlEl = $('.jl', joyEl);
    B.atk = $('.tb.atk', tc); B.jmp = $('.tb.jmp', tc); B.pg = $('.tb.pg', tc); B.hp = $('.tb.pot.hp', tc); B.mp = $('.tb.pot.mp', tc);
    B.sk = Array.from(tc.querySelectorAll('.tb.sk'));
    canvas = $('#game'); stage = $('#stage'); wins = $('#wins'); dlg = $('#dlg'); pp = $('#pp'); cm = $('#cm');
    // a dim backdrop behind a touch window: tapping it closes the window
    wins.addEventListener('click', (ev) => { if (G.touch && ev.target === wins) { UI.closeAll(); sfx('close'); X.syncLock(); } });
    bindButtons(); bindJoy();
  }

  // ------------------------------------------------------------ layout (screen px; u = control scale)
  function safeArea() {
    if (!probe) {
      probe = el('div'); probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.appendChild(probe);
    }
    const cs = getComputedStyle(probe), f = (v) => parseFloat(v) || 0;
    return { t: f(cs.paddingTop), r: f(cs.paddingRight), b: f(cs.paddingBottom), l: f(cs.paddingLeft) };
  }
  const SIZE = [1, 0.88, 1.14]; // 설정 › 버튼 크기: 보통 · 작게 · 크게
  // the right cluster, from the bottom-right corner (u px): [dx, dy, diameter]
  // (attack in the corner, jump beside it, the skills in a curve above them, the potions above the curve's left end — the top right
  //  of the stage stays free for the minimap and the quest tracker)
  const CL = { atk: [-68, -66, 94], jmp: [-170, -46, 74], sk: [[-240, -104, 56], [-180, -134, 56], [-117, -151, 56], [-52, -157, 56]],
    hp: [-240, -166, 46], mp: [-180, -198, 46], pg: [-292, -84, 36] };
  T.layout = function (k, ox, oy) {
    T.k = k; T.ox = ox; T.oy = oy;
    const vw = window.innerWidth, vh = window.innerHeight;
    T.portrait = vh > vw;
    T.blocked = T.on && T.portrait;
    if (!tc) return;
    rot.classList.toggle('hidden', !T.blocked);
    T.gen++;
    const st = stage.style;
    // HUD / window scales inside the 1280×720 stage, so things keep a finger's size on a small screen
    T.hs = U.clamp(0.66 / k, 1, 1.35);   // status · 초롱이 · log
    T.ts = U.clamp(0.86 / k, 1, 2);      // windows · dialogs · cards (each is fitted to the screen)
    const ms = U.clamp(0.9 / k, 1, 2);   // menu buttons (≈ 40 px)
    st.setProperty('--hs', T.hs.toFixed(3)); st.setProperty('--ms', ms.toFixed(3));
    st.setProperty('--us', U.clamp(0.8 / k, 1, 1.8).toFixed(3)); st.setProperty('--tm', U.clamp(0.7 / k, 1, 1.6).toFixed(3));
    st.setProperty('--boss-t', Math.round(12 + 44 * ms + 10) + 'px');
    if (!T.on) return;
    const sa = safeArea(), u = U.clamp(Math.min(vh / 390, vw / 700), 0.74, 1.3) * (SIZE[(G.opt && G.opt.tsize) || 0] || 1);
    const R = vw - Math.max(sa.r, 4), Bm = vh - Math.max(sa.b, 2), L = Math.max(sa.l, 4);
    // a long phone (19.5:9 …) leaves a dark strip beside the stage: the potions stand in it, above the last skill, off the playfield
    const strip = vw - (ox + G.W * k) - Math.max(sa.r, 4) >= 50 * u;
    geo.hp = strip ? [-40, -222, 46] : CL.hp; geo.mp = strip ? [-40, -278, 46] : CL.mp;
    const put = (e, c) => { const d = c[2] * u; e.style.width = e.style.height = d + 'px'; e.style.left = R + c[0] * u - d / 2 + 'px'; e.style.top = Bm + c[1] * u - d / 2 + 'px'; };
    put(B.atk, CL.atk); put(B.jmp, CL.jmp); put(B.hp, geo.hp); put(B.mp, geo.mp); put(B.pg, CL.pg);
    B.sk.forEach((e, j) => put(e, CL.sk[j]));
    // joystick: rests at the bottom left; a thumb anywhere in the lower left part of the screen picks it up there
    geo.R = 60 * u; geo.knob = 56 * u;
    geo.rest = [L + 30 * u + geo.R, Bm - 24 * u - geo.R];
    jbEl.style.width = jbEl.style.height = geo.R * 2 + 'px'; jbEl.style.left = jbEl.style.top = -geo.R + 'px';
    jkEl.style.width = jkEl.style.height = geo.knob + 'px'; jkEl.style.left = jkEl.style.top = -geo.knob / 2 + 'px';
    jlEl.style.top = -geo.R - geo.knob / 2 - 30 * u + 'px'; // (clear of the knob pushed all the way up)
    tc.style.setProperty('--u', u.toFixed(3));
    if (joy.id === null) joyAt(geo.rest[0], geo.rest[1], 0, 0);
    const lx = (sx) => (sx - ox) / k, ly = (sy) => (sy - oy) / k; // screen → stage (logical)
    const clusterL = R + (CL.pg[0] - CL.pg[2] / 2) * u;           // leftmost edge of the right cluster
    geo.zone = { x1: Math.min(vw * 0.5, clusterL - 24 * u), y0: Math.max(vh * 0.3, oy + 150 * k) };
    // the HUD inside the stage makes room: log + better-gear notice between the stick and the buttons, toasts above the stick,
    // the quest tracker stops above the skill buttons, the combo counter sits right above them
    const joyR = lx(geo.rest[0] + geo.R + 14 * u), botL = lx(R + (CL.jmp[0] - CL.jmp[2] / 2) * u - 12 * u);
    const logL = Math.round(U.clamp(joyR, 14, 600));
    st.setProperty('--log-l', logL + 'px');
    st.setProperty('--log-w', Math.round(U.clamp((Math.min(botL, G.W - 14) - logL) / T.hs, 160, 380)) + 'px');
    st.setProperty('--toast-b', Math.round(G.H - ly(geo.rest[1] - geo.R - 10 * u)) + 'px');
    // the top of the buttons under the tracker's column (x 1030 ~ 1266)
    let top = G.H;
    const cols = [CL.sk[0], CL.sk[1], CL.sk[2], CL.sk[3], geo.hp, geo.mp, CL.pg];
    for (const c of cols) {
      const x0 = lx(R + (c[0] - c[2] / 2) * u), x1 = lx(R + (c[0] + c[2] / 2) * u), y0 = ly(Bm + (c[1] - c[2] / 2) * u);
      if (x1 > 1030 && x0 < G.W) top = Math.min(top, y0);
    }
    T.comboY = Math.round(Math.min(436, top - 12));
    st.setProperty('--qt-max', Math.max(64, Math.round(T.comboY - 70 - 166)) + 'px');
    // where the controls cover the stage (logical): a guardian's red floor telegraph under them must stay visible (frame: .thru)
    let cx0 = G.W, cy0 = G.H;
    for (const c of cols.concat([CL.atk, CL.jmp])) { cx0 = Math.min(cx0, lx(R + (c[0] - c[2] / 2) * u)); cy0 = Math.min(cy0, ly(Bm + (c[1] - c[2] / 2) * u)); }
    geo.cover = [[cx0, G.W, cy0], [0, lx(geo.rest[0] + geo.R), ly(geo.rest[1] - geo.R)]];
  };

  // ------------------------------------------------------------ buttons
  const held = new Map(); // pointerId → { e, code, pot, timer, long }
  const codeHeld = (code, but) => { for (const [id, h] of held) if (id !== but && h.code === code) return true; return false; };
  function bindButtons() {
    tc.addEventListener('pointerdown', (ev) => {
      const b = ev.target.closest('.tb');
      if (!b || !T.shown) return;
      ev.preventDefault(); ev.stopPropagation();
      try { b.setPointerCapture(ev.pointerId); } catch (e) {}
      const k = b.dataset.t, h = { e: b, code: null };
      b.classList.add('on');
      if (k === 'page') { T.page ^= 1; sfx('tab'); skSig.length = 0; }
      else if (k === 'hp' || k === 'mp') { h.pot = k; h.timer = setTimeout(() => potHold(ev.pointerId), 480); b.classList.add('hold'); }
      else {
        h.code = k === 'sk' ? '@s' + (T.page * 4 + +b.dataset.j) : '@' + k;
        I.vdown(h.code);
      }
      held.set(ev.pointerId, h);
    });
    const up = (ev) => {
      const h = held.get(ev.pointerId);
      if (!h) return;
      held.delete(ev.pointerId);
      h.e.classList.remove('on', 'hold');
      if (h.code && !codeHeld(h.code)) I.vup(h.code);
      if (h.pot) {
        clearTimeout(h.timer);
        if (!h.long && ev.type === 'pointerup' && T.shown) { I.vdown('@' + h.pot); I.vup('@' + h.pot); } // a tap drinks
      }
    };
    tc.addEventListener('pointerup', up); tc.addEventListener('pointercancel', up); tc.addEventListener('lostpointercapture', up);
  }
  // holding a potion button: the potion chooser (which potion · 초롱이 auto potion)
  function potHold(id) {
    const h = held.get(id);
    if (!h || !T.shown) return;
    h.long = true; h.e.classList.remove('hold');
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
    if (X.openPotSel) X.openPotSel(h.pot, h.e);
  }
  function releaseAll() {
    for (const h of held.values()) { h.e.classList.remove('on', 'hold'); if (h.code) I.vup(h.code); if (h.timer) clearTimeout(h.timer); }
    held.clear();
    joyEnd();
  }
  T.releaseAll = releaseAll;

  // ------------------------------------------------------------ joystick
  const joy = { id: null, cx: 0, cy: 0, d: { left: 0, right: 0, up: 0, down: 0 } };
  function joyAt(cx, cy, dx, dy) {
    joyEl.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
    jkEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  function setDir(k, on) {
    if (joy.d[k] === on) return;
    joy.d[k] = on;
    if (on) I.vdown('@' + k); else I.vup('@' + k);
    jbEl.classList.toggle('o' + k[0], on);
  }
  // 8 ways: sideways within 60° of level (a thumb drifting while it walks stays a walk), up / down only past 40° and pushed
  // half way — a pure ↑ (no sideways at all: a portal needs that) spans 60° around straight up. 5° of hysteresis against flicker.
  function joyDirs(dx, dy) {
    const R = geo.R, m = Math.hypot(dx, dy) / R, d = joy.d, any = d.left || d.right || d.up || d.down;
    if (m < (any ? 0.22 : 0.3)) { setDir('left', 0); setDir('right', 0); setDir('up', 0); setDir('down', 0); return; }
    const a = Math.abs(Math.atan2(-dy, dx) * 180 / Math.PI), fromH = a > 90 ? 180 - a : a; // 0 = level · 90 = straight up / down
    const h = fromH < (d.left || d.right ? 65 : 60), v = fromH > (d.up || d.down ? 35 : 40) && Math.abs(dy) / R > (d.up || d.down ? 0.36 : 0.42);
    setDir('right', h && dx > 0); setDir('left', h && dx < 0); setDir('up', v && dy < 0); setDir('down', v && dy > 0);
  }
  function joyMove(x, y) {
    let dx = x - joy.cx, dy = y - joy.cy;
    const R = geo.R, lim = R * 1.3, dist = Math.hypot(dx, dy);
    if (dist > lim) { const f = (dist - lim) / dist; joy.cx += dx * f; joy.cy += dy * f; dx = x - joy.cx; dy = y - joy.cy; } // the base follows a thumb that runs off
    const kk = Math.min(1, R / Math.max(1, Math.hypot(dx, dy)));
    joyAt(joy.cx, joy.cy, dx * kk, dy * kk);
    joyDirs(dx, dy);
  }
  function joyEnd() {
    if (!joyEl) return;
    setDir('left', 0); setDir('right', 0); setDir('up', 0); setDir('down', 0);
    joy.id = null;
    joyEl.classList.remove('act'); joyEl.classList.add('back');
    joyAt(geo.rest[0], geo.rest[1], 0, 0);
  }
  function bindJoy() {
    window.addEventListener('pointerdown', (ev) => {
      const t = ev.target;
      // a tap on the dark strips beside the stage closes a touch window / card, like a tap on its dim backdrop
      if (T.on && (t === document.body || t === html) && G.S.scene === 'play') {
        if (popOpen()) { X.closePops(); return; }
        if (hasWin()) { UI.closeAll(); sfx('close'); return; }
      }
      if (!T.on || !T.shown || joy.id !== null || (ev.pointerType === 'mouse' && !(G.opt && G.opt.touch === 1))) return;
      if (!(t === canvas || t === stage || t === document.body || t === html)) return; // never over a HUD button, a window or a touch button
      if (ev.clientX > geo.zone.x1 || ev.clientY < geo.zone.y0) return;
      ev.preventDefault();
      joy.id = ev.pointerId;
      // near its resting place the stick stays put; elsewhere it comes to the thumb
      const [rx, ry] = geo.rest, R = geo.R;
      if (Math.hypot(ev.clientX - rx, ev.clientY - ry) <= R * 1.15) { joy.cx = rx; joy.cy = ry; }
      else { joy.cx = U.clamp(ev.clientX, R + 4, window.innerWidth - R - 4); joy.cy = U.clamp(ev.clientY, R + 4, window.innerHeight - R - 4); }
      joyEl.classList.remove('back'); joyEl.classList.add('act');
      joyMove(ev.clientX, ev.clientY);
    }, { capture: true, passive: false });
    window.addEventListener('pointermove', (ev) => { if (ev.pointerId === joy.id) { ev.preventDefault(); joyMove(ev.clientX, ev.clientY); } }, { capture: true, passive: false });
    const end = (ev) => { if (ev.pointerId === joy.id) joyEnd(); };
    window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  }

  // ------------------------------------------------------------ per frame (touch mode)
  const skSig = [], skSt = [{}, {}, {}, {}], potSt = { hp: {}, mp: {} };
  let atkSig = '', potSig = '', fN = 0, nearSig = '';
  const hasWin = () => !!(wins && wins.firstElementChild);
  const popOpen = () => !!((pp && !pp.classList.contains('hidden')) || (cm && !cm.classList.contains('hidden')));
  function frame() {
    if (!T.on || !tc) return;
    fN++;
    const play = G.S.scene === 'play' && !!G.map, ui = play && (hasWin() || popOpen());
    const show = play && !T.blocked && !G.S.lock && !ui;
    if (show !== T.shown) { T.shown = show; tc.classList.toggle('off', !show); if (!show) releaseAll(); }
    wins.classList.toggle('has', hasWin());
    // the game waits while a window, a card or the "turn your phone" notice is up (the controls are tucked away meanwhile)
    if (play) { const w = (!!$('#ui > .modal') || ui || T.blocked) && !P.dead; if (G.S.paused !== w) G.S.paused = w; }
    fitAll();
    if (show) { updButtons(); updThru(); }
  }
  // a guardian's red floor telegraph lying under the buttons or the stick: they turn see-through while it is live (like the hotbar)
  let thruUntil = 0, thruOn = false;
  function updThru() {
    const now = G.time, Hz = G.Haz, cam = G.cam;
    if (Hz && Hz.warnUnder && geo.cover && (fN & 1)) {
      for (const [x0, x1, y0] of geo.cover) if (Hz.warnUnder(cam.x + x0, cam.x + x1, cam.y + y0)) { thruUntil = now + 0.35; break; }
    }
    const on = now < thruUntil;
    if (on !== thruOn) { thruOn = on; tc.classList.toggle('thru', on); }
  }
  function updButtons() {
    // attack: the weapon in hand
    const w = P.eq.weapon, ai = w ? D.ITEMS[w.b].icon : 'rod_1';
    if (ai !== atkSig) { atkSig = ai; $('.tw', B.atk).innerHTML = ic(ai); }
    // skill buttons: page 1 = slots 0 ~ 3 (the keyboard's A S D F), page 2 = slots 4 ~ 7 (Q W E R)
    const more = P.hot.slice(4).some(Boolean);
    if (!more && T.page) { T.page = 0; skSig.length = 0; }
    B.pg.classList.toggle('hid', !more);
    for (let j = 0; j < 4; j++) {
      const e = B.sk[j], i = T.page * 4 + j, id = P.hot[i], s = skSt[j];
      if (skSig[j] !== (id || '') + i) {
        skSig[j] = (id || '') + i;
        $('.tw', e).innerHTML = id ? ic('sk_' + id) : '';
        $('em', e).textContent = i + 1;
        e.classList.toggle('empty', !id);
        s.on = s.nomp = s.q = null; s.txt = '';
      }
      if (!id) continue;
      const cd = P.cd[id] || 0, mx = P.cdMax[id] || 1, on = cd > 0.02, was = s.on;
      if (on !== was) { s.on = on; e.classList.toggle('oncd', on); if (!on && was) X.pulse(e, 'rdy'); }
      if (on) {
        const c = e.lastElementChild, txt = cd >= 1 ? String(Math.ceil(cd)) : cd.toFixed(1);
        c.style.background = 'conic-gradient(rgba(10,6,20,0.78) ' + (cd / mx) * 100 + '%, rgba(10,6,20,0.2) 0)';
        if (txt !== s.txt) { s.txt = txt; c.textContent = txt; }
      }
      const sk = D.SKILLS[id], nomp = !!sk && P.mp < sk.v(P.skills[id] || 1).mp;
      if (nomp !== s.nomp) { s.nomp = nomp; e.classList.toggle('nomp', nomp); }
      const q = !!(P.qSk && P.qSk.id === id);
      if (q !== s.q) { s.q = q; e.classList.toggle('queued', q); }
    }
    B.pg.lastElementChild.textContent = T.page ? '5~8' : '1~4';
    // potions: the one the quick slot uses, how many are left, the cooldown, AUTO
    if (fN % 15 === 1 || potSig === '') {
      let sig = '';
      for (const t of ['hp', 'mp']) {
        const q = Inv.quickInfo(t), au = P.auto && P.auto[t], e = B[t];
        const s = (q ? q.b + ':' + q.n : '-') + (au ? 'A' : '');
        sig += s;
        if (potSt[t].sig === s) continue;
        potSt[t].sig = s;
        $('.tw', e).innerHTML = ic(q ? D.ITEMS[q.b].icon : 'pot_' + t + '_1');
        $('b', e).textContent = q ? q.n : 0;
        e.classList.toggle('empty', !q); e.classList.toggle('low', !!q && q.n < 5); e.classList.toggle('auto', !!au);
      }
      potSig = sig;
    }
    for (const t of ['hp', 'mp']) {
      const e = B[t], cd = P.potT[t] || 0, on = cd > 0.02, s = potSt[t];
      if (on !== s.on) { s.on = on; e.classList.toggle('oncd', on); }
      if (on) { const c = $('.cd', e); c.style.background = 'conic-gradient(rgba(10,6,20,0.78) ' + (cd / (t === 'hp' ? 3 : 1.5)) * 100 + '%, rgba(10,6,20,0.2) 0)'; c.textContent = cd.toFixed(1); }
    }
    // something to do with ↑ right here (talk · portal · beacon): the stick's ↑ lights up with what it does
    const it = P.near, ns = it && !it.sealed ? it.label.replace(/^↑\s*/, '') : '';
    if (ns !== nearSig) { nearSig = ns; jlEl.textContent = ns ? '▲ ' + ns : ''; joyEl.classList.toggle('near', !!ns); }
  }
  G.on('skill', (id) => { if (!T.on) return; const i = P.hot.indexOf(id); if (i >= 0 && ((i / 4) | 0) === T.page) X.pulse(B.sk[i % 4], 'use'); });
  G.on('skillDeny', (i) => { if (T.on && ((i / 4) | 0) === T.page) X.pulse(B.sk[i % 4], 'deny'); });
  G.on('potUse', (t) => { if (T.on && B[t]) X.pulse(B[t], 'use'); });
  G.on('inv', () => { potSig = ''; });
  G.on('equip', () => { atkSig = ''; });

  // ------------------------------------------------------------ fitting windows / dialogs / cards to the screen
  // each is scaled up toward T.ts (a finger's size) but never past the 1280×720 stage; windows and cards are centered
  function fit(e, kind) {
    const w = e.offsetWidth, h = e.offsetHeight;
    if (!w || !h) return;
    if (e._fw === w && e._fh === h && e._fg === T.gen) return;
    e._fw = w; e._fh = h; e._fg = T.gen;
    const m = kind === 'd' ? 14 : 10, s = Math.max(0.5, Math.min(T.ts, (G.W - 2 * m) / w, (G.H - 2 * m) / h));
    e.style.setProperty('--fs', s.toFixed(4));
    if (kind === 'c') { e.style.setProperty('--fl', Math.round((G.W - w * s) / 2) + 'px'); e.style.setProperty('--ft', Math.round((G.H - h * s) / 2) + 'px'); }
  }
  function fitAll() {
    if (wins) for (const w of wins.children) fit(w, 'c');
    for (const m of document.querySelectorAll('#ui > .modal > .mbox, #title > .cr')) fit(m, 'm');
    if (dlg && !dlg.classList.contains('hidden')) fit(dlg, 'd');
    if (pp && !pp.classList.contains('hidden')) fit(pp, 'c');
    if (cm && !cm.classList.contains('hidden')) fit(cm, 'c');
  }
  T.fitNow = fitAll;

  // ------------------------------------------------------------ fullscreen (Android: also hold the screen sideways)
  T.full = function () {
    const d = document.documentElement;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
      const f = d.requestFullscreen || d.webkitRequestFullscreen;
      if (!f) return;
      const r = f.call(d), lock = () => { try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} };
      if (r && r.then) r.then(lock).catch(() => {}); else lock();
    } catch (e) {}
  };

  // ------------------------------------------------------------ init (main.js boot, after UI.init)
  T.init = function () {
    build();
    const f0 = UI.frame;
    UI.frame = function (dt) { f0(dt); frame(dt); };
    apply();
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (G.refit) G.refit(); });
    window.addEventListener('orientationchange', () => { setTimeout(() => { if (G.refit) G.refit(); }, 250); });
  };
})();
