'use strict';
/* 등불지기 — main: boot, scaling, game loop, title scene */
(function () {
  const G = window.G, U = G.U, A = G.Art;
  let canvas, ctx, last = 0, errN = 0;
  const saved = G.Save.loadOpt();
  // volume sliders v2 (audio.js hears a slider as v^1.66 now, it was v): a saved old default (50 % · 70 %) becomes the new default 80 %,
  // any other saved level is converted so it keeps the loudness it had (a muted slider stays muted)
  if (saved.av !== 2) {
    for (const [k, d] of [['bgm', 0.5], ['sfx', 0.7]]) if (typeof saved[k] === 'number') saved[k] = saved[k] === d ? 0.8 : Math.round(Math.pow(U.clamp(saved[k], 0, 1), 0.6) * 100) / 100;
    saved.av = 2;
  }
  G.opt = Object.assign({ bgm: 0.8, sfx: 0.8, noShake: false, noFlash: false, rs: 0 }, saved);
  G.Input.setMap(G.opt.keys); // saved key bindings (default: Alt jump · Ctrl attack · Q W E R / A S D F skills)

  function fit() {
    const st = document.getElementById('stage'), k = Math.min(window.innerWidth / G.W, window.innerHeight / G.H);
    const ox = Math.round((window.innerWidth - G.W * k) / 2), oy = Math.round((window.innerHeight - G.H * k) / 2);
    st.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + k + ')';
    G.UI.setScale(k);
    if (G.Touch) G.Touch.layout(k, ox, oy); // touch controls around the stage (touch.js)
  }
  G.refit = fit;

  // returns false while the world is held by a hit-stop: key presses made in those frames are kept for the first frame after it
  // (otherwise an Alt jump / skill / potion tapped right at the moment of impact would be dropped)
  function step(dt) {
    const S = G.S;
    if (S.scene !== 'play' || S.paused || (G.Touch && G.Touch.blocked)) return true; // (blocked: a phone held upright — touch.js)
    if (G.hitStop > 0) { G.hitStop -= dt; G.World.updateCam(dt); return false; }
    if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.35; }
    G.Game.update(dt);
    return true;
  }

  // title backdrop: village sky, a hill, the hero and the wisp
  const titleLook = { skin: A.LOOKS.SKIN[0], hair: A.LOOKS.HAIR[1], style: 2, eye: A.LOOKS.EYE[1], job: 'novice', tier: 0, weapon: { kind: 'rod', tier: 1 } };
  function drawTitle(c) {
    const t = G.time, view = { x: 500 + Math.sin(t * 0.05) * 420, y: 20, w: G.W, h: G.H, mw: 2600, mh: 760 };
    let ok = false;
    if (A.bg && A.bg.town) { c.save(); try { A.bg.town(c, view, t); ok = true; } catch (e) {} c.restore(); }
    if (!ok) { const g = c.createLinearGradient(0, 0, 0, G.H); g.addColorStop(0, '#3a2a5c'); g.addColorStop(1, '#ffb070'); c.fillStyle = g; c.fillRect(0, 0, G.W, G.H); }
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    A.ell(c, 250, 860, 620, 250); c.fillStyle = '#3d2f52'; c.fill();
    A.ell(c, 1120, 900, 560, 250); c.fillStyle = '#33284a'; c.fill();
    A.glow(c, 262, 560, 190 + Math.sin(t * 3) * 8, '#ffc95a', 0.5);
    c.save(); c.translate(250, 616); A.shadow(c, 0, 0, 44, 0.3); c.scale(2.6, 2.6); A.hero(c, titleLook, { state: 'idle', t }); c.restore();
    c.save(); c.translate(360 + Math.sin(t * 0.9) * 14, 470 + Math.sin(t * 1.7) * 12); c.scale(1.7, 1.7); A.wisp(c, t); c.restore();
    for (let i = 0; i < 26; i++) {
      const px = (i * 173.3 + t * (12 + (i % 5) * 5)) % (G.W + 80) - 40, py = G.H - ((i * 97.7 + t * (18 + (i % 7) * 6)) % (G.H + 60));
      A.glow(c, px, py, 7 + (i % 4) * 4, i % 3 ? '#ffd98a' : '#fff3c4', 0.35 + 0.25 * Math.sin(t * 2 + i));
    }
    c.restore();
    if (A.ambient && A.ambient.town) { c.save(); try { A.ambient.town(c, view, t); } catch (e) {} c.restore(); }
  }

  // render scale (backing pixels per logical pixel). All caches key off G.RS, so changing it only needs the map chunks dropped.
  G.setRS = function (rs) {
    rs = U.clamp(rs, 1, 2);
    if (rs === G.RS && canvas.width === G.W * rs) return;
    G.RS = rs;
    canvas.width = G.W * rs; canvas.height = G.H * rs;
    if (G.map) { for (const k in G.map.chunks) { const c = G.map.chunks[k].c; c.width = c.height = 1; } G.map.chunks = {}; }
  };
  G.autoRS = function () {
    // (the game is played sideways: a phone's screen size is taken in landscape — iOS reports it upright)
    const sw = Math.max(screen.width, screen.height), sh = Math.min(screen.width, screen.height);
    const want = Math.min(sw / G.W, sh / G.H) * (window.devicePixelRatio || 1);
    return want >= 1.75 ? 2 : want >= 1.2 ? 1.5 : 1;
  };
  let slowT = 0, perfT = 0;
  function watchPerf(raw) {
    // automatic quality: if the game cannot hold ~40 fps for a while, drop the render scale one step (only in "auto" mode)
    if (G.opt.rs || G.rsFixed || G.S.scene !== 'play' || G.S.paused || document.hidden) return;
    perfT += raw;
    if (raw > 0.025) slowT += raw; else slowT = Math.max(0, slowT - raw * 0.5);
    if (perfT > 4 && slowT > 2.5 && G.RS > 1) { G.setRS(G.RS > 1.5 ? 1.5 : 1); slowT = 0; perfT = 0; }
    if (perfT > 8) { perfT = 0; slowT = 0; }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0) || dt > 0.25) dt = 1 / 60;
    else watchPerf(dt);
    dt = Math.min(dt, 1 / 30);
    G.time += dt;
    let held = false;
    try {
      if (!G.dbg.manual) held = step(dt) === false;
      ctx.setTransform(G.RS, 0, 0, G.RS, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (G.S.scene === 'play' && G.map) G.World.draw(ctx); else drawTitle(ctx);
      G.UI.frame(dt);
      errN = 0;
    } catch (e) {
      if (errN++ < 3) console.error(e);
    }
    if (!G.dbg.manual && !held) G.Input.endFrame();
  }

  function boot() {
    G.RS = G.opt.rs || G.autoRS();
    const q = /[?&]rs=([\d.]+)/.exec(location.search);
    if (q) { G.RS = U.clamp(parseFloat(q[1]) || 1, 1, 2); G.rsFixed = true; }
    canvas = document.getElementById('game');
    canvas.width = G.W * G.RS; canvas.height = G.H * G.RS;
    ctx = canvas.getContext('2d', { alpha: false });
    G.UI.init();
    if (G.Touch) G.Touch.init();
    fit();
    window.addEventListener('resize', fit);
    if (G.Audio) {
      try { G.Audio.setVol('bgm', G.opt.bgm); G.Audio.setVol('sfx', G.opt.sfx); } catch (e) {}
      const kick = () => { try { G.Audio.init(); } catch (e) {} };
      window.addEventListener('pointerdown', kick); window.addEventListener('keydown', kick);
    }
    window.addEventListener('beforeunload', (e) => {
      G.Game.save();
      // Ctrl is the attack key, and the browser reserves Ctrl+W (close tab): ask once instead of losing the session
      if (G.S.scene === 'play' && !G.Input.isMac && !G.touch && !G.opt.noGuard && G.Input.uses('Ctrl')) { e.preventDefault(); e.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) G.Game.save(); });
    G.UI.showTitle();
    last = performance.now();
    requestAnimationFrame(loop);
  }

  // test / debug helpers (console): G.dbg.lv(20), G.dbg.tp('cave1'), G.dbg.give('dust', 10) ...
  G.dbg = {
    tp: (map, portal) => G.World.load(map, portal),
    lv: (n) => { const P = G.P; while (P.lv < n && P.lv < G.D.MAX_LV) P.gainExp(G.D.expNeed(P.lv) - P.exp); },
    give: (id, n) => G.Inv.add(id, n),
    gold: (n) => { G.P.gold += n; G.emit('gold'); },
    step: (n, dt) => { for (let i = 0; i < n; i++) { G.time += dt || 1 / 60; if (step(dt || 1 / 60) !== false) G.Input.endFrame(); } },
    draw: () => { ctx.setTransform(G.RS, 0, 0, G.RS, 0, 0); if (G.S.scene === 'play' && G.map) G.World.draw(ctx); else drawTitle(ctx); G.UI.frame(0); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
