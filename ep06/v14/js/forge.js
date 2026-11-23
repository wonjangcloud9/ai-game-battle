'use strict';
/* 등불지기 — the blacksmith's enhancement show (ui2.js · 강화하기), drawn over the right half of the blacksmith window.
   The smith strikes the piece lying on the anvil three times, each harder than the last (깡! 깡! 까앙!!), then the result:
   success — a flash, the piece rises off the anvil in a golden glow, a big "+N 성공!";
   failure — the sparks hiss out ("픽") in a puff of smoke, "강화 실패…".
   About 1.8 s in all; a click or any key skips ahead (to the result, then out of it).
   The roll happens at the third strike (o.roll), so nothing is spent or decided before the show gets there.
   G.Forge.start(host, o) → show { frame(), skip(), on }
     o: { look: the smith's look, icon: the item's icon key, roll() → { r: 'ok'|'fail'|'down', e0, e1, sub } | null, done(res) } */
(function () {
  const G = window.G, U = G.U, A = G.Art;
  const sat = U.sat, lerp = U.lerp, E = U.ease, TAU = Math.PI * 2, DEG = 180 / Math.PI;
  const sfx = (n, o) => { if (G.Audio) G.Audio.sfx(n, o); };
  const F = (G.Forge = { clock: null }); // clock: test hook returning seconds (performance.now() otherwise)
  const now = () => (F.clock ? F.clock() : performance.now() / 1000);
  const opt = () => G.opt || {};

  // ------------------------------------------------------------ timeline (seconds from the press)
  const HIT = [0.27, 0.57, 0.97];                  // the three strikes
  const POW = [0.4, 0.68, 1];                      // how hard each lands (sparks · shake · glow · sound)
  const HOLD = { ok: 0.72, fail: 0.62, down: 0.7 }; // the result stays up this long after the third strike …
  const FADE = 0.14;                                // … then fades out (≈ 1.8 s in all — under 2 s)
  const WORD = ['깡!', '깡!', '까앙!!'];

  // the smith's key poses (A.hero pose values: arm / hammer angles in radians, see art_base.js pose())
  const K = {
    ready: { armF: 1.3, wAng: 1.85, armB: 0.8, lean: 0.08, legF: 0.22, legB: -0.2, headRot: 0.06 },
    hit: { armF: 1.42, wAng: 1.68, armB: 0.9, lean: 0.12, legF: 0.26, legB: -0.24, headRot: 0.1 },
    up0: { armF: 2.15, wAng: 0.75, armB: 0.62, lean: 0.01, legF: 0.23, legB: -0.21, headRot: -0.04 },
    up1: { armF: 2.6, wAng: 0.15, armB: 0.48, lean: -0.06, legF: 0.26, legB: -0.24, headRot: -0.1 },
    up2: { armF: 3.08, wAng: -0.55, armB: 0.3, lean: -0.16, legF: 0.36, legB: -0.3, headRot: -0.16 },
    win: { armF: 2.85, wAng: -0.2, armB: 2.5, lean: -0.06, legF: 0.16, legB: -0.16, headRot: -0.12 },
    sigh: { armF: 0.55, wAng: 2.3, armB: 0.15, lean: 0.2, legF: 0.12, legB: -0.1, headRot: 0.24 },
  };
  // [from, to, pose, pose, ease ('o' out · 'i' in)] — every swing lands exactly on its HIT; the third waits a beat at the top
  const SEG = [
    [0, 0.04, 'ready', 'ready'], [0.04, 0.19, 'ready', 'up0', 'o'], [0.19, HIT[0], 'up0', 'hit', 'i'],
    [HIT[0], 0.49, 'hit', 'up1', 'o'], [0.49, HIT[1], 'up1', 'hit', 'i'],
    [HIT[1], 0.83, 'hit', 'up2', 'o'], [0.83, 0.895, 'up2', 'up2'], [0.895, HIT[2], 'up2', 'hit', 'i'],
  ];
  const SWING = [0.19, 0.49, 0.895];
  const FACE = [11, -24.5], HEAD = [1, -24.5]; // on the hammer (art_base.js weapon 'hammer'): striking face · head center

  function mix(a, b, k) {
    const P = { bob: 0, dx: 0, sx: 1, sy: 1, rot: 0, pull: 0, back: false, eyes: 'open', mouth: 'smile' };
    for (const key in a) P[key] = lerp(a[key], b[key], k);
    return P;
  }
  function poseAt(S, t) {
    if (S.res && t > S.tRes) { // after the result: the hammer goes up with a little hop — or he sags
      const r = S.res.r, u = t - S.tRes, k = E.outCubic(sat(u / 0.24)), P = mix(K.hit, r === 'ok' ? K.win : K.sigh, k);
      if (r === 'ok') { P.bob = -Math.abs(Math.sin(u * 10)) * 5 * k; P.eyes = 'happy'; P.mouth = 'open'; }
      else { P.eyes = r === 'down' ? 'hurt' : 'closed'; P.mouth = 'flat'; }
      return P;
    }
    let s = SEG[SEG.length - 1];
    for (const g of SEG) if (t < g[1]) { s = g; break; }
    const k = sat((t - s[0]) / (s[1] - s[0])), P = mix(K[s[2]], K[s[3]], s[4] === 'o' ? E.outCubic(k) : s[4] === 'i' ? E.inQuad(k) : k);
    if (s[2] === 'up2' && s[3] === 'up2') P.armF += Math.sin(t * 120) * 0.015; // the held breath before the big one
    const near = HIT.some((h) => t > h - 0.03 && t < h + 0.1);
    P.eyes = near || t > 0.3 ? 'fierce' : 'open';
    P.mouth = near ? 'open' : t > 0.83 ? 'flat' : 'smile';
    return P;
  }
  // a point on the hammer (in its own frame) → canvas coordinates. Mirrors A.hero's transforms (pose without bob / dx / squash).
  function hammerPt(S, P, pt) {
    const m = new DOMMatrix().translateSelf(S.fx, S.fy).scaleSelf(S.sc * S.ls, S.sc * S.ls)
      .translateSelf(0, -16).rotateSelf(P.lean * DEG).translateSelf(0, 16)
      .translateSelf(7.5 + Math.sin(P.armF) * 12.5, -37 + Math.cos(P.armF) * 12.5).rotateSelf(P.wAng * DEG);
    const q = m.transformPoint(new DOMPoint(pt[0], pt[1]));
    return [q.x, q.y];
  }

  // ------------------------------------------------------------ start / frame / skip
  const SQ = 0.55; // the piece lying on the anvil is drawn squashed to this height
  F.start = function (host, o) {
    const w = host.clientWidth, h = host.clientHeight, s = 2;
    const el = document.createElement('div');
    el.className = 'forge';
    el.innerHTML = '<canvas></canvas>' + (o.head ? '<div class="fg-hd">' + o.head + '</div>' : '') + '<div class="fg-skip">클릭 · 아무 키: 건너뛰기</div>';
    host.appendChild(el);
    const cv = el.firstChild;
    cv.width = Math.round(w * s); cv.height = Math.round(h * s); cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const look = Object.assign({}, o.look, { weapon: { kind: 'hammer', tier: 1 } });
    const S = { o, el, cv, c: cv.getContext('2d'), s, w, h, look, ls: look.scale || 1, t0: now(), hits: 0, res: null, tRes: 0, sparks: [], words: [], tw: null, snd: 0, on: true };
    S.sc = 1.8 * Math.min(1, h / 384, w / 394);
    S.fx = w * 0.25; S.fy = h - 86;                       // the smith's feet (the anvil stands nearer, in the floor band below)
    [S.ix, S.iy] = hammerPt(S, mix(K.hit, K.hit, 0), FACE); // where the hammer lands
    S.isz = 86 * S.sc / 1.8;                               // the piece lying on the anvil (its width)
    S.px = S.ix + 4; S.py = S.iy + S.isz * SQ * 0.5 - 3;
    S.ax = S.px + 6; S.ay = S.iy + S.isz * SQ - 6;         // the anvil's face
    S.icon = A.iconHD ? A.iconHD(o.icon, 4) : A.icon(o.icon);
    S.tint = document.createElement('canvas'); S.tint.width = S.icon.width; S.tint.height = S.icon.height;
    S.frame = () => frame(S); S.skip = () => skip(S);
    frame(S);
    return S;
  };
  function stop(S) { S.on = false; if (S.el.parentNode) S.el.remove(); }
  function frame(S) {
    if (!S.on) return;
    if (!S.el.isConnected) { S.on = false; return; } // the window went away under us
    const t = now() - S.t0;
    while (S.on && S.hits < 3 && t >= HIT[S.hits]) strike(S, S.hits++);
    if (!S.on) return;
    if (S.res) {
      const u = t - S.tRes, hold = HOLD[S.res.r];
      if (!S.snd && u >= 0.08) {
        S.snd = 1;
        if (S.res.r !== 'ok') sfx('enh_fizz');
        else if (S.res.e1 >= 8) sfx('quest_done', { vol: 0.55 });
        else sfx('skill_up', { vol: 0.55 });
      }
      if (u >= hold + FADE) { stop(S); S.o.done(S.res); return; }
      S.el.style.opacity = u > hold ? String(1 - (u - hold) / FADE) : '';
    } else S.el.style.opacity = t < 0.08 ? String(sat(t / 0.08)) : '';
    try { draw(S, t); } catch (e) { if (!S.err) { S.err = 1; console.error('forge', e); } } // a drawing slip never blocks the window
  }
  // first press: straight to the third strike (the result) · during the result: out
  function skip(S) {
    if (!S.on) return;
    const t = now() - S.t0;
    if (!S.res) { if (t < HIT[2]) { S.hits = Math.max(S.hits, 2); S.t0 = now() - HIT[2]; } }
    else { const end = S.tRes + HOLD[S.res.r]; if (t < end) { S.t0 = now() - end; S.snd = 1; } }
    frame(S);
  }
  function strike(S, k) {
    const t = HIT[k];
    if (k === 2) {
      let res = null;
      try { res = S.o.roll(); } catch (e) { console.error('forge roll', e); }
      if (!res) { stop(S); S.o.done(null); return; } // couldn't pay after all (nothing was spent) — or it broke: never leave the window stuck
      S.res = res; S.tRes = t;
      for (const q of S.el.querySelectorAll('.fg-skip,.fg-hd')) q.remove();
      const ok = res.r === 'ok', box = document.createElement('div');
      box.className = 'fg-res ' + (ok ? 'ok' : 'bad') + (res.r === 'down' ? ' dn' : '') + (ok && res.e1 >= 8 ? ' hi' : '');
      box.innerHTML = ok ? '<div class="fg-big"><b>+' + res.e1 + '</b> 성공!</div>' + (res.sub ? '<small>' + res.sub + '</small>' : '')
        : '<div class="fg-big">강화 실패…</div><small>' + (res.r === 'down' ? '+' + res.e0 + ' → +' + res.e1 + ' · 강화 단계가 1 내려갔어요' : '장비는 그대로예요') + '</small>';
      S.el.appendChild(box);
      if (ok) { S.tw = []; for (let i = 0; i < (res.e1 >= 8 ? 14 : 9); i++) { const a = Math.random() * TAU, r = 44 + Math.random() * 52; S.tw.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8, r: 4 + Math.random() * 5, ph: Math.random() * TAU }); } }
    }
    S.words.push({ t, k });
    const die = !!(S.res && S.res.r !== 'ok'), n = [8, 13, die ? 18 : 28][k];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.8, sp = (140 + Math.random() * 240) * (0.75 + POW[k] * 0.55);
      S.sparks.push({ t, x: S.ix + (Math.random() - 0.5) * 12, y: S.iy + 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: die ? 0.1 + Math.random() * 0.16 : 0.22 + Math.random() * (0.2 + 0.25 * POW[k]), w: 1.3 + Math.random() * (1 + POW[k]), die });
    }
    sfx('enh_hit', { vol: [0.6, 0.8, 1][k], rate: [1.08, 1, 0.9][k] });
  }

  // ------------------------------------------------------------ drawing
  // how hot the piece is: up a step with every strike; on a failure it flickers and goes out ("픽")
  function heat(S, t) {
    let v = 0;
    for (let k = 0; k < S.hits; k++) { const u = t - HIT[k]; if (u >= 0) v = Math.max(v, (0.35 + 0.65 * POW[k]) * (1 - 0.3 * sat(u / 0.5)) * sat(u / 0.03 + 0.2)); }
    if (S.res && S.res.r !== 'ok') { const u = t - S.tRes; v *= u < 0.05 ? 1 : u < 0.08 ? 0.25 : u < 0.12 ? 0.8 : u < 0.14 ? 0.15 : Math.max(0, 0.6 - (u - 0.14) * 5); }
    if (S.res && S.res.r === 'ok') v *= 1 - sat((t - S.tRes) / 0.2);
    return v;
  }
  function draw(S, t) {
    const c = S.c, w = S.w, h = S.h, r = S.res && S.res.r, u = S.res ? t - S.tRes : -1;
    c.setTransform(S.s, 0, 0, S.s, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.lineJoin = 'round'; c.lineCap = 'round';
    // the camera kicks on every strike: a shake (unless 화면 흔들림 is off) and a small punch-in at the anvil
    let ox = 0, oy = 0, zm = 1;
    for (let k = 0; k < S.hits; k++) {
      const v = t - HIT[k];
      if (v < 0 || v > 0.35) continue;
      const d = Math.exp(-v * 16) * POW[k];
      if (!opt().noShake) { ox += Math.sin(v * 95 + k) * 9 * d; oy += Math.cos(v * 83 + k * 2) * 6 * d; }
      zm += 0.035 * d;
    }
    c.save();
    c.translate(S.ix + ox, S.iy + oy); c.scale(zm, zm); c.translate(-S.ix, -S.iy);
    back(S, c, t);
    anvil(S, c, t);
    if (r !== 'ok' || u < 0.04) lying(S, c, t);
    impactGlow(S, c, t);
    trail(S, c, t);
    c.save(); c.translate(S.fx, S.fy); A.shadow(c, 0, 0, 24 * S.sc, 0.4); c.scale(S.sc, S.sc);
    A.hero(c, S.look, { state: 'idle', t, pose: poseAt(S, t) });
    c.restore();
    clang(S, c, t);
    sparks(S, c, t);
    if (r === 'ok') okLayer(S, c, t, u); else if (r) failLayer(S, c, t, u);
    words(S, c, t);
    c.restore();
    if (r === 'ok') { const a = (opt().noFlash ? 0.28 : 0.85) * (1 - sat(u / 0.24)); if (a > 0) { c.fillStyle = 'rgba(255,250,228,' + a.toFixed(3) + ')'; c.fillRect(0, 0, w, h); } }
    if (r === 'down') { const a = 0.32 * (1 - sat(u / 0.32)); if (a > 0) { c.fillStyle = 'rgba(255,60,80,' + a.toFixed(3) + ')'; c.fillRect(0, 0, w, h); } }
  }
  function back(S, c, t) {
    const w = S.w, h = S.h;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d1428'); g.addColorStop(0.72, '#36222f'); g.addColorStop(1, '#2a1a24');
    c.fillStyle = g; c.fillRect(-30, -30, w + 60, h + 60);
    c.fillStyle = 'rgba(255,210,170,0.045)'; // brick wall
    for (let row = 0, y = 6; y < S.fy - 12; row++, y += 26) for (let x = (row % 2) * -23 - 6; x < w + 10; x += 46) { A.rr(c, x + 2, y, 42, 22, 4); c.fill(); }
    const fl = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 31) * 0.05;
    A.glow(c, w * 0.88, S.fy - 64, 200, '#ff7a2a', 0.3 * fl); // the hearth, off to the right
    A.glow(c, S.ax, S.ay, 170, '#ff9a3a', 0.12 + 0.3 * heat(S, t));
    // floor: the smith stands at its back edge; the anvil nearer
    c.fillStyle = '#21151f'; c.fillRect(-30, S.fy - 5, w + 60, h);
    c.fillStyle = 'rgba(255,190,140,0.08)'; c.fillRect(-30, S.fy - 5, w + 60, 2.5);
    c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const y = S.fy + 14 + i * i * 9; c.beginPath(); c.moveTo(-30, y); c.lineTo(w + 30, y); c.stroke(); }
    // embers drifting up from the hearth
    for (let i = 0; i < 14; i++) {
      const x = (i * 97.3 + Math.sin(t * 1.3 + i) * 14 + w * 0.55) % (w + 20) - 10, y = h - ((i * 53.1 + t * (34 + (i % 5) * 11)) % (h + 30));
      A.glow(c, x, y, 3 + (i % 3) * 1.5, '#ffb060', 0.45 + 0.25 * Math.sin(t * 7 + i));
    }
  }
  function anvil(S, c, t) {
    const x = S.ax, y = S.ay, base = S.h - 14, k = S.sc / 1.72;
    A.shadow(c, x + 6 * k, base, 70 * k, 0.45);
    const st = () => A.rr(c, x - 40 * k, y + 34 * k, 80 * k, base - y - 34 * k, 7);
    st(); c.fillStyle = '#7a4c30'; c.fill();
    c.save(); st(); c.clip();
    c.fillStyle = 'rgba(30,14,20,0.25)'; c.fillRect(x + 16 * k, y, 30 * k, base - y);
    c.strokeStyle = 'rgba(40,18,18,0.38)'; c.lineWidth = 2;
    for (const dx of [-22, -4, 14]) { c.beginPath(); c.moveTo(x + dx * k, y + 44 * k); c.lineTo(x + (dx + 3) * k, base); c.stroke(); }
    c.restore();
    st(); c.lineWidth = A.LW; c.strokeStyle = A.OUT; c.stroke();
    const P = (a) => A.poly(c, a.map((v, i) => (i % 2 ? y + v * k : x + v * k)));
    P([-58, 0, 48, 0, 96, 9, 48, 20, 27, 20, 18, 30, 34, 40, -36, 40, -20, 30, -28, 20, -58, 20]); A.fs(c, '#5f5d70', 2.6);
    P([-58, 0, 48, 0, 96, 9, 84, 8.5, 48, 5.5, -58, 5.5]); c.fillStyle = '#86839a'; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(x - 52 * k, y + 1.8 * k, 92 * k, 1.8 * k);
    c.fillStyle = 'rgba(29,20,48,0.22)'; c.fillRect(x + 20 * k, y + 21 * k, 9 * k, 18 * k);
    // the face under the piece glows with the heat
    const hv = heat(S, t);
    if (hv > 0.01) A.glow(c, S.px, y + 2, 42 * k, '#ff8a3a', 0.7 * hv);
  }
  // the piece lying on the anvil — squashed a little more by every strike, glowing hotter
  function lying(S, c, t) {
    let sq = SQ;
    for (let k = 0; k < S.hits; k++) { const v = t - HIT[k]; if (v >= 0 && v < 0.14) sq *= 1 - 0.18 * POW[k] * Math.sin(Math.PI * (v / 0.14)); }
    const hv = heat(S, t);
    if (hv > 0.01) A.glow(c, S.px, S.py, S.isz * 0.95, '#ff7a2a', 0.55 * hv);
    item(S, c, S.px, S.py + (SQ - sq) * S.isz * 0.5, S.isz * (1 + (SQ - sq) * 0.5), sq, -0.04, hv, 0);
    if (S.res && S.res.r === 'down') crack(S, c, t - S.tRes);
  }
  // draw the icon (hot: orange tint · gold: golden tint)
  function item(S, c, x, y, size, sq, rot, hot, gold) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(1, sq);
    c.drawImage(S.icon, -size / 2, -size / 2, size, size);
    const a = Math.max(hot, gold);
    if (a > 0.02) {
      const tc = S.tint.getContext('2d'), n = S.tint.width;
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, n, n); tc.drawImage(S.icon, 0, 0);
      tc.globalCompositeOperation = 'source-atop';
      tc.fillStyle = gold >= hot ? 'rgba(255,238,160,0.85)' : 'rgba(255,112,36,0.85)'; tc.fillRect(0, 0, n, n);
      c.globalAlpha = Math.min(1, a * (gold >= hot ? 0.75 : 0.62)); c.globalCompositeOperation = 'lighter';
      c.drawImage(S.tint, -size / 2, -size / 2, size, size);
    }
    c.restore();
  }
  function crack(S, c, u) {
    const k = sat(u / 0.08), x = S.px, y = S.py, z = S.isz / 60;
    c.save(); c.globalAlpha = sat(1.3 - u * 1.2);
    const pts = [x - 22 * z, y - 6 * z, x - 9 * z, y + 2 * z, x - 2 * z, y - 7 * z, x + 8 * z, y + 3 * z, x + 22 * z, y - 4 * z];
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length * k; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.lineWidth = 4.5; c.strokeStyle = A.OUT; c.stroke(); c.lineWidth = 2; c.strokeStyle = '#ff6a7a'; c.stroke();
    c.restore();
  }
  // a tapered smear behind the hammer head on each swing
  function trail(S, c, t) {
    for (let k = 0; k < 3; k++) {
      const t0 = SWING[k], t1 = HIT[k];
      if (t < t0 + 0.012 || t > t1 + 0.08) continue;
      const a = Math.min(t, t1), from = Math.max(t0, a - 0.075), fade = t > t1 ? 1 - (t - t1) / 0.08 : 1, n = 10, pts = [], L = [], R = [];
      for (let i = 0; i <= n; i++) pts.push(hammerPt(S, poseAt(S, Math.min(lerp(from, a, i / n), t1 - 1e-4)), HEAD));
      for (let i = 0; i <= n; i++) {
        const p = pts[i], q = pts[Math.min(n, i + 1)], o = pts[Math.max(0, i - 1)];
        let dx = q[0] - o[0], dy = q[1] - o[1];
        const d = Math.hypot(dx, dy) || 1, wd = (1 + 13 * (i / n)) * S.sc / 1.8;
        dx /= d; dy /= d;
        L.push([p[0] - dy * wd, p[1] + dx * wd]); R.push([p[0] + dy * wd, p[1] - dx * wd]);
      }
      const g = c.createLinearGradient(pts[0][0], pts[0][1], pts[n][0], pts[n][1]);
      g.addColorStop(0, 'rgba(255,226,170,0)'); g.addColorStop(1, 'rgba(255,244,214,1)');
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.6 * fade * (0.55 + 0.45 * POW[k]); c.fillStyle = g;
      c.beginPath(); c.moveTo(L[0][0], L[0][1]);
      for (const p of L) c.lineTo(p[0], p[1]);
      for (let i = n; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
      c.closePath(); c.fill(); c.restore();
    }
  }
  // light at the point of contact (under the hammer) and a ring running out over the anvil
  function impactGlow(S, c, t) {
    for (let k = 0; k < S.hits; k++) {
      const v = t - HIT[k];
      if (v < 0 || v > 0.3) continue;
      const d = Math.exp(-v * 14);
      A.glow(c, S.ix, S.iy + 4, (26 + 46 * POW[k]) * (0.8 + 0.5 * v), '#fff3c4', 0.85 * d);
      if (k === 2 || v < 0.12) {
        const q = sat(v / (0.16 + 0.1 * POW[k]));
        c.save(); c.globalAlpha = (1 - q) * 0.8; c.lineWidth = 2 + 5 * (1 - q) * POW[k]; c.strokeStyle = '#ffe6a8';
        A.ell(c, S.ix, S.iy + 10, 10 + E.outCubic(q) * (50 + 90 * POW[k]), 4 + E.outCubic(q) * (14 + 26 * POW[k])); c.stroke(); c.restore();
      }
    }
  }
  // the "clang": a white star flashing at the contact for an instant, in front of the hammer
  function clang(S, c, t) {
    for (let k = 0; k < S.hits; k++) {
      const v = t - HIT[k];
      if (v < 0 || v > 0.07) continue;
      const q = v / 0.07, r = (14 + 22 * POW[k]) * (0.7 + 0.5 * q) * S.sc / 1.8;
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - q;
      A.star(c, S.ix + 6, S.iy + 2, r, r * 0.16, 4, 0.2); c.fillStyle = '#fffdf0'; c.fill();
      c.restore();
    }
  }
  function sparks(S, c, t) {
    c.save();
    for (let pass = 0; pass < 2; pass++) { // hot sparks add light; dying ones (a failure) are dull embers that just fall
      c.globalCompositeOperation = pass ? 'source-over' : 'lighter';
      for (const p of S.sparks) {
        if (p.die !== !!pass) continue;
        const v = t - p.t;
        if (v < 0 || v > p.life) continue;
        const k = v / p.life, g = 950, x = p.x + p.vx * v, y = p.y + p.vy * v + 0.5 * g * v * v, vy = p.vy + g * v, tl = 0.03;
        c.globalAlpha = 1 - k * k;
        c.strokeStyle = p.die ? (k < 0.35 ? '#e08a4a' : '#6a5a6e') : k < 0.25 ? '#fffbe0' : k < 0.6 ? '#ffd36a' : '#ff8a3a';
        c.lineWidth = p.w * (1 - 0.5 * k);
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - p.vx * tl, y - vy * tl); c.stroke();
      }
    }
    c.restore();
  }
  function words(S, c, t) {
    for (const wd of S.words) {
      const v = t - wd.t, k = wd.k, life = 0.3; // (gone before the next strike lands)
      if (k === 2 && S.res && S.res.r !== 'ok' && v >= 0.1) { // a failure: the clang dies into "픽…"
        if (v > 0.62) continue;
        c.save(); c.globalAlpha = sat((v - 0.1) / 0.06) * (1 - sat((v - 0.46) / 0.16));
        c.translate(S.px + 44 * S.sc / 1.8, S.py - 44 + (v - 0.1) * 26); c.rotate(0.12);
        A.text(c, '픽…', 0, 0, { size: 26, color: '#c4b8d4', sw: 5, weight: 900 });
        c.restore();
        continue;
      }
      if (v < 0 || v > life) continue;
      const pop = v < 0.07 ? lerp(1.8, 1, E.outCubic(v / 0.07)) : 1;
      c.save(); c.globalAlpha = 1 - sat((v - (life - 0.14)) / 0.14);
      c.translate(S.ix + 58 + k * 22, S.iy - 42 - k * 15 - v * 26); c.rotate(-0.14 + k * 0.06); c.scale(pop, pop);
      A.text(c, WORD[k], 0, 0, { size: [19, 24, 34][k], color: k === 2 ? '#ffe27a' : '#ffffff', sw: 5, weight: 900 });
      c.restore();
    }
  }
  // success: the piece rises off the anvil into a golden burst (light rays, a halo, twinkles)
  function okLayer(S, c, t, u) {
    const hi = S.res.e1 >= 8, k = E.outBack(sat((u - 0.03) / 0.36)), app = sat(u / 0.18);
    const cx = S.w / 2, cy = S.h * 0.47;
    const x = lerp(S.px, cx, k), y = lerp(S.py, cy, k) + Math.sin(u * 5) * 3 * sat(u / 0.4);
    const size = lerp(S.isz, 98 * S.sc / 1.8, k), sq = lerp(SQ, 1, sat(k * 1.15));
    c.save(); c.globalCompositeOperation = 'lighter'; c.translate(x, y); c.rotate(u * 0.9);
    const n = hi ? 18 : 12, R = 190 * app;
    for (let i = 0; i < n; i++) {
      c.rotate(TAU / n);
      c.globalAlpha = (i % 2 ? 0.14 : 0.26) * app; c.fillStyle = hi && i % 3 === 0 ? '#bfefff' : '#ffe9a0';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(R, -R * 0.075); c.lineTo(R, R * 0.075); c.closePath(); c.fill();
    }
    c.restore();
    A.glow(c, x, y, 20 + 120 * app, '#ffcf5a', 0.75);
    A.glow(c, x, y, 64, '#fff6d0', 0.55 * app);
    if (hi) A.glow(c, x, y, 150 * app, '#9fe4ff', 0.25);
    item(S, c, x, y, size, sq, -0.04 * (1 - k), 0, 1 - 0.78 * sat((u - 0.08) / 0.36)); // white-hot at first, then its own colors, still lit
    // twinkles
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const p of S.tw) {
      const s = Math.max(0, Math.sin(u * 7 + p.ph)) * app;
      if (s < 0.05) continue;
      c.globalAlpha = s; A.star(c, x + p.x, y + p.y, p.r * (0.6 + s), p.r * 0.22 * (0.6 + s), 4, u); c.fillStyle = '#fff6c8'; c.fill();
    }
    c.restore();
    // the shockwave
    const q = sat(u / 0.36);
    if (q < 1) { c.save(); c.globalAlpha = 1 - q; c.lineWidth = 10 * (1 - q) + 1.5; c.strokeStyle = '#fff3c4'; c.beginPath(); c.arc(S.ix, S.iy, 16 + E.outCubic(q) * 230, 0, TAU); c.stroke(); c.restore(); }
  }
  // failure: the light goes out — the scene dims, smoke curls up off the piece
  function failLayer(S, c, t, u) {
    c.fillStyle = 'rgba(12,8,22,' + (0.3 * sat(u / 0.22)).toFixed(3) + ')'; c.fillRect(-30, -30, S.w + 60, S.h + 60);
    for (let i = 0; i < 5; i++) { // soft puffs of smoke (radial: thick in the middle, no hard edge)
      const v = u - 0.05 - i * 0.05;
      if (v < 0 || v > 0.75) continue;
      const k = v / 0.75, x = S.px + (i - 2) * 9 + Math.sin(i * 2.1 + v * 4) * 7, y = S.py - 10 - E.outCubic(k) * 74 - i * 3, r = 12 + k * 24;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(176,166,196,' + (0.55 * (1 - k)).toFixed(3) + ')'); g.addColorStop(0.55, 'rgba(150,140,172,' + (0.32 * (1 - k)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(140,130,160,0)');
      c.fillStyle = g; A.ell(c, x, y, r, r * 0.82); c.fill();
    }
  }
})();
