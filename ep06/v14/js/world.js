'use strict';
/* 등불지기 — world: map runtime, surfaces, terrain chunk cache, decor scatter, camera, world rendering */
(function () {
  const G = window.G, U = G.U, A = G.Art, D = G.D;
  const W = (G.World = {});
  const CW = 640, MAX_CHUNKS = 7;
  const cam = (G.cam = { x: 0, y: 0, look: 0, sa: 0, st: 0, sd: 1, ox: 0, oy: 0 });
  let map = null, frame = 0;

  G.shake = (amp, dur) => {
    if (G.opt && G.opt.noShake) return;
    if (amp >= cam.sa * (cam.st / cam.sd || 0)) { cam.sa = amp; cam.st = dur || 0.25; cam.sd = cam.st; }
  };

  // ------------------------------------------------------------ surfaces
  function subtract(segs, a, b) {
    const out = [];
    for (const [s, e] of segs) {
      if (b <= s || a >= e) { out.push([s, e]); continue; }
      if (a > s) out.push([s, a]);
      if (b < e) out.push([b, e]);
    }
    return out;
  }
  function buildSurfaces(m) {
    const out = [];
    m.solids.forEach((s, i) => {
      let segs = [[s.x, s.x + s.w]];
      m.solids.forEach((o, j) => { if (i !== j && o.y < s.y && o.y + o.h > s.y) segs = subtract(segs, o.x, o.x + o.w); });
      for (const [a, b] of segs) if (b - a > 24) out.push({ x1: a, x2: b, y: s.y, solid: true });
    });
    m.plats.forEach((p) => out.push({ x1: p.x, x2: p.x + p.w, y: p.y, solid: false }));
    return out;
  }
  // nearest walkable surface for a point (prefers the surface at/below the hint)
  W.surfaceAt = function (x, y, m) {
    m = m || map;
    let best = null, bd = 1e9;
    for (const s of m.surfaces) {
      if (x < s.x1 - 1 || x > s.x2 + 1) continue;
      const d = s.y >= y - 30 ? s.y - y + 30 : (y - s.y) * 3 + 60;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  };
  // surface directly below a point (first one going down)
  W.groundBelow = function (x, y) {
    let best = null;
    for (const s of map.surfaces) if (x >= s.x1 && x <= s.x2 && s.y >= y - 2 && (!best || s.y < best.y)) best = s;
    return best;
  };
  W.solidAt = function (x, y) {
    for (const s of map.solids) if (x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) return true;
    return false;
  };

  // ------------------------------------------------------------ load
  W.load = function (id, portalId, pos) {
    const def = G.MAPS[id], P = G.P;
    map = G.map = {
      id, def, name: def.name, theme: def.theme, w: def.w, h: def.h, town: !!def.town, pal: A.PAL[def.theme] || A.PAL.meadow,
      solids: def.solids.map(([x, y, w, h]) => ({ x, y, w, h })),
      plats: def.plats.map(([x, y, w]) => ({ x, y, w })),
      ladders: (def.ladders || []).map(([x, y1, y2]) => ({ x, y1, y2 })),
      portals: [], npcs: [], props: [], front: [], anim: [], lights: [], spawns: [], beacon: null, chunks: {}, boss: null, lvRef: def.lv ? def.lv[1] : 1,
    };
    map.surfaces = buildSurfaces(map);
    const snap = (x, y) => { const s = W.surfaceAt(x, y); return s ? s.y : y; };
    for (const p of def.portals) map.portals.push({ id: p.id, x: p.x, y: snap(p.x, p.y), to: p.to, tp: p.tp, name: G.MAPS[p.to].name });
    for (const [nid, x, y] of def.npcs || []) map.npcs.push({ id: nid, def: D.NPCS[nid], x, y: snap(x, y), dir: 1, t: U.rand(0, 5) });
    if (def.beacon) map.beacon = { x: def.beacon.x, y: snap(def.beacon.x, def.beacon.y), arena: def.beacon.arena, lit: !!P.beacons[id], flare: 0, info: D.BEACONS[id] };

    // props: explicit, then scatter
    const addProp = (name, x, y, seed) => {
      const pr = A.prop && A.prop[name];
      if (!pr) return;
      const o = { p: pr, name, x, y, seed, w: pr.w || 40, h: pr.h || 40 };
      if (pr.light) map.lights.push({ x, y: y + (pr.light.dy || -pr.h * 0.6), r: pr.light.r || 120, color: pr.light.color });
      if (pr.anim) map.anim.push(o); else if (pr.layer === 'front') map.front.push(o); else map.props.push(o);
    };
    const rng = U.rng('decor:' + id);
    for (const [name, x, y] of def.props || []) addProp(name, x, snap(x, y), (rng() * 1e9) | 0);
    const keep = [];
    for (const p of map.portals) keep.push([p.x, 70]);
    for (const n of map.npcs) keep.push([n.x, 50]);
    if (map.beacon) keep.push([map.beacon.x, 130]);
    for (const o of map.props.concat(map.anim)) if (o.w > 80) keep.push([o.x, o.w * 0.4]);
    const blocked = (x, half) => keep.some(([kx, kr]) => Math.abs(x - kx) < kr + half);
    const scattered = [];
    const decor = (A.decor && A.decor[def.theme]) || [];
    for (const s of map.surfaces) {
      const len = s.x2 - s.x1;
      for (const d of decor) {
        if ((d.on === 'ground' && !s.solid) || (d.on === 'plat' && s.solid)) continue;
        const pr = A.prop && A.prop[d.p];
        if (!pr || (pr.w || 40) > len * 0.9) continue;
        const n = (d.n * len) / 1000 * (def.town ? 0.5 : 1);
        let k = Math.floor(n);
        if (rng() < n - k) k++;
        for (let i = 0; i < k; i++) {
          const x = s.x1 + pr.w * 0.35 + rng() * Math.max(1, len - pr.w * 0.7), seed = (rng() * 1e9) | 0;
          if ((pr.w || 40) > 46 && blocked(x, pr.w * 0.3)) continue;
          scattered.push([d.p, x, s.y, seed, pr.h || 40]);
        }
      }
    }
    scattered.sort((a, b) => b[4] - a[4]);
    for (const [name, x, y, seed] of scattered) addProp(name, x, y, seed);

    // monster spawn slots
    for (const [mid, x1, x2, y, n] of def.spawns || []) {
      const mx = (x1 + x2) / 2, s = W.surfaceAt(mx, y);
      const a = Math.max(x1, s ? s.x1 + 16 : x1), b = Math.min(x2, s ? s.x2 - 16 : x2);
      for (let i = 0; i < n; i++) map.spawns.push({ m: mid, x1: a, x2: Math.max(a + 10, b), y: s ? s.y : y, ent: null, timer: 0 });
    }

    // clear dynamic state, place player
    G.mons.length = 0; G.projs.length = 0; G.drops.length = 0;
    G.Fx.clear(); G.Haz.clear();
    let px, py;
    if (pos) { px = pos.x; py = pos.y; }
    else {
      const pt = map.portals.find((p) => p.id === portalId);
      if (pt) { px = pt.x; py = pt.y; }
      else if (def.start) { px = def.start.x; py = snap(def.start.x, def.start.y); }
      else { px = map.portals[0].x; py = map.portals[0].y; }
    }
    P.place(px, py);
    P.mapId = id; P.visited[id] = true;
    if (map.town) P.town = id;
    G.Mon.fillSpawns();
    W.updateCam(0, true);
    if (A.bgPrepare) { try { A.bgPrepare(def.theme); } catch (e) {} }
    if (G.Audio) G.Audio.bgm(def.bgm);
    G.emit('map', map);
  };

  // ------------------------------------------------------------ quest guidance: which portal of this map leads toward the current objective
  function mapOfMonster(mid) { for (const id in G.MAPS) if ((G.MAPS[id].spawns || []).some((s) => s[0] === mid)) return id; return null; }
  function mapOfNpc(nid) { for (const id in G.MAPS) if ((G.MAPS[id].npcs || []).some((n) => n[0] === nid)) return id; return null; }
  W.questTarget = function () {
    const P = G.P, Q = G.Quest;
    const ids = Q.tracked();
    for (const id of ids) {
      const q = D.QUESTS[id];
      if (Q.ready(id)) return { map: mapOfNpc(q.to), npc: q.to };
      for (let i = 0; i < q.goals.length; i++) {
        const g = q.goals[i], p = Q.prog(id, i);
        if (p[0] >= p[1]) continue;
        if (g.t === 'kill') return { map: mapOfMonster(g.m) };
        if (g.t === 'item') return { map: mapOfMonster(g.it.slice(2)) };
        if (g.t === 'beacon') return { map: g.map, beacon: true };
        if (g.t === 'talk') return { map: mapOfNpc(g.npc), npc: g.npc };
        if (g.t === 'job') return { map: P.town === 'oasis' ? 'oasis' : 'town', npc: P.town === 'oasis' ? 'trainer2' : 'trainer' };
      }
    }
    // nothing active: point at an NPC offering a quest
    for (const id in D.QUESTS) if (D.QUESTS[id].main && Q.st(id) === 'avail') return { map: mapOfNpc(D.QUESTS[id].giver), npc: D.QUESTS[id].giver };
    return null;
  };
  W.updateGuide = function () {
    if (!map) return;
    map.guide = null;
    const tg = W.questTarget();
    if (!tg || !tg.map) return;
    if (tg.map === map.id) {
      if (tg.npc) { const n = map.npcs.find((o) => o.id === tg.npc); if (n) map.guide = { x: n.x, y: n.y - 150, here: true, npc: true }; }
      else if (tg.beacon && map.beacon) map.guide = { x: map.beacon.x, y: map.beacon.y - 392, here: true };
      return;
    }
    // BFS over portals
    const prev = {}, queue = [map.id];
    prev[map.id] = null;
    while (queue.length) {
      const cur = queue.shift();
      if (cur === tg.map) break;
      for (const p of G.MAPS[cur].portals) if (!(p.to in prev)) { prev[p.to] = [cur, p.id]; queue.push(p.to); }
    }
    if (!(tg.map in prev)) return;
    let at = tg.map, step = null;
    while (prev[at]) { step = prev[at]; at = step[0]; }
    if (!step) return;
    const pt = map.portals.find((p) => p.id === step[1]);
    if (pt) map.guide = { x: pt.x, y: pt.y - 170, to: G.MAPS[tg.map].name, pname: pt.name };
  };
  G.on('quest', () => W.updateGuide());
  G.on('map', () => W.updateGuide());
  G.on('job', () => W.updateGuide());
  function drawGuide(ctx, vx, vy) {
    const g = map.guide, P = G.P, t = G.time;
    if (!g || G.map.boss || P.dead) return;
    const sx = g.x - vx, bob = Math.sin(t * 5) * 5;
    if (sx > 40 && sx < G.W - 40) {
      if (g.npc) return; // the NPC's own ! / ? marker is enough
      const y = g.y + bob;
      A.glow(ctx, g.x, y, 30, '#ffe070', 0.6);
      A.poly(ctx, [g.x - 13, y - 12, g.x + 13, y - 12, g.x, y + 10]); A.fs(ctx, '#ffd84a', 2.6);
    } else {
      const left = sx <= 40, d = left ? -1 : 1, top = left && G.UI.sayBottom ? Math.max(190, G.UI.sayBottom() + 34) : 190; // (left edge: below 초롱이's speech box)
      let y = U.clamp(P.y - 150, vy + top, vy + G.H - 190);
      // the target portal half in view at this edge shows its own name tag there (world y g.y + 42 — slid inward to stay whole,
      // W.tagX): lift the arrow and its label above that tag instead of laying one label over the other
      if (g.pname) {
        ctx.font = '800 13px ' + A.FONT;
        const tw = ctx.measureText(g.pname).width + 14, tx = W.tagX(g.x, tw) - vx, ty = g.y + 42;
        if ((left ? tx + tw / 2 > 0 : tx - tw / 2 < G.W) && y + 44 > ty - 10 && y - 19 < ty + 10) y = Math.max(vy + top, ty - 56);
      }
      const x = vx + (left ? 54 : G.W - 54) + (left ? -1 : 1) * Math.abs(bob);
      A.glow(ctx, x, y, 36, '#ffe070', 0.55);
      A.poly(ctx, [x - d * 12, y - 15, x + d * 13, y, x - d * 12, y + 15]); A.fs(ctx, '#ffd84a', 2.6);
      tag(ctx, x - d * 6, y + 30, g.to ? g.to : '퀘스트', '#2b2136', 'rgba(255,224,122,0.95)');
    }
  }

  // ------------------------------------------------------------ guardian fight: portals sealed
  // From the summon until the guardian falls (or the fight resets) map.boss is set: the portals stop swirling, a violet seal bars them,
  // ↑ on one only explains why (player.js), and no travel can start. They open again — with a flourish — when the guardian falls.
  G.on('boss', () => {
    if (!map) return;
    map.sealT = G.time; // the swirl freezes at this moment
    for (const p of map.portals) G.Fx.ring(p.x, p.y - 58, 78, 30, '#b06aff', 0.55, 8);
    G.emit('msg', '수호자가 깨어나 포탈이 봉인되었습니다! 수호자를 물리치면 다시 열립니다.', 'boss');
  });
  G.on('bossEnd', (won) => {
    if (!map || !won) return;
    const m0 = map;
    G.after(0.5, () => {
      if (map !== m0 || map.boss) return;
      for (const p of map.portals) {
        G.Fx.ring(p.x, p.y - 58, 24, 120, '#fff3c4', 0.6, 8);
        G.Fx.burst(p.x, p.y - 58, 16, ['#fff3c4', '#ffd27a', '#c79bff'], { type: 'star', s0: 60, s1: 240, g: -80, l0: 0.4, l1: 0.9, z0: 3, z1: 7, add: true });
      }
      G.emit('msg', '포탈의 봉인이 풀렸습니다.', 'sys');
    });
  });
  // sealed portal (origin bottom-center like A.portal): the gate frozen at t0 and dimmed, a violet ward over it, crossed bars, a padlock
  function sealedPortal(ctx, t0, t) {
    const cy = -58;
    ctx.save(); ctx.globalAlpha = 0.4;
    if (A.portal) { try { A.portal(ctx, t0); } catch (e) {} }
    ctx.restore();
    A.glow(ctx, 0, cy, 64 + Math.sin(t * 3) * 5, '#8a4fd0', 0.32);
    A.ell(ctx, 0, cy, 33, 52); ctx.fillStyle = 'rgba(34,18,60,0.5)'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#a77ae6'; ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(-27 * s, cy - 41); ctx.lineTo(27 * s, cy + 41);
      ctx.lineWidth = 10; ctx.strokeStyle = A.OUT; ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = '#7d45c9'; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(232,214,255,0.85)'; ctx.stroke();
    }
    const ly = cy + 4;
    ctx.beginPath(); ctx.arc(0, ly - 9, 7.5, Math.PI, 0); ctx.lineWidth = 7; ctx.strokeStyle = A.OUT; ctx.stroke(); ctx.lineWidth = 3.4; ctx.strokeStyle = '#ffd27a'; ctx.stroke();
    A.rr(ctx, -12, ly - 9, 24, 19, 5); A.fs(ctx, '#ffcf5a', 2.6);
    A.ell(ctx, 0, ly - 1, 3, 3); ctx.fillStyle = A.OUT; ctx.fill(); ctx.fillRect(-1.2, ly, 2.4, 5);
  }
  // portal being entered (↑ held, player.js portalHold): light rises inside the gate from the bottom, the rim lights up
  // from both sides (meeting at the top when full) and the glow swells. k = fill 0..1. Origin bottom-center like A.portal.
  function portalFill(ctx, k, t) {
    const cy = -58, rx = 27, ry = 46, e = k, lvl = cy + ry - e * (ry * 2 + 8); // linear: in step with the prompt's bar
    const wave = (x) => lvl + Math.sin(x * 0.28 + t * 11) * 2.4 * (1 - 0.5 * e);
    A.glow(ctx, 0, cy, 70 + 56 * e, '#ffe7a0', 0.12 + 0.42 * e);
    ctx.save();
    A.ell(ctx, 0, cy, rx - 1.2, ry - 1.2); ctx.clip();
    // the still-empty part of the gate deepens a little, so the rising level reads like a gauge
    ctx.fillStyle = 'rgba(206,104,28,' + (0.4 * Math.min(1, k * 5)).toFixed(3) + ')';
    ctx.fillRect(-rx - 3, cy - ry - 3, rx * 2 + 6, ry * 2 + 6);
    ctx.beginPath(); ctx.moveTo(-rx - 3, cy + ry + 3);
    for (let x = -rx - 3; x <= rx + 3; x += 3) ctx.lineTo(x, wave(x));
    ctx.lineTo(rx + 3, cy + ry + 3); ctx.closePath();
    const g = ctx.createLinearGradient(0, cy + ry, 0, lvl);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#fff3c8');
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath();
    for (let x = -rx - 3; x <= rx + 3; x += 3) { if (x === -rx - 3) ctx.moveTo(x, wave(x)); else ctx.lineTo(x, wave(x)); }
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,214,110,0.75)'; ctx.stroke();
    ctx.lineWidth = 2.6; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.lineCap = 'round';
    for (const [lw, col] of [[8, 'rgba(255,196,84,0.6)'], [3.4, '#ffffff']]) {
      ctx.lineWidth = lw; ctx.strokeStyle = col;
      ctx.beginPath(); ctx.ellipse(0, cy, rx + 5, ry + 5, 0, Math.PI / 2, Math.PI / 2 + Math.PI * e); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, cy, rx + 5, ry + 5, 0, Math.PI / 2 - Math.PI * e, Math.PI / 2); ctx.stroke();
    }
    ctx.restore();
  }

  // travel with fade
  W.travel = function (to, tp, pos) {
    if (G.S.trans || G.P.dead) return;
    if (map && map.boss) return; // sealed during a guardian fight (the portal / return scroll / fast travel each also say why)
    G.S.trans = { t: 0, dur: 0.28, phase: 0, to, tp, pos };
    if (G.Audio) G.Audio.sfx('portal');
  };
  W.updateTrans = function (dt) {
    const tr = G.S.trans;
    if (!tr) return;
    tr.t += dt;
    if (tr.phase === 0 && tr.t >= tr.dur) { tr.phase = 1; tr.t = 0; W.load(tr.to, tr.tp, tr.pos); G.Game.save(); }
    else if (tr.phase === 1 && tr.t >= tr.dur + 0.1) G.S.trans = null;
  };

  // ------------------------------------------------------------ camera
  // At its lowest the camera shows the bottom floor at G.FLOOR_Y, above the hotbar (maps.js). Standing (or climbing), the hero's
  // feet sit at screen y STAND: the floor below a low platform stays above the hotbar, and tall things over the hero (a lighthouse's
  // prompt with its danger warning, its name tag) stay below the top HUD. In the air the camera only rises once the hero climbs above
  // screen y AIR — 146 px over the floor line, as before the floor was lifted — so a plain jump from the bottom floor doesn't move it.
  const STAND = 432, AIR = (G.FLOOR_Y || 540) - 146;
  W.updateCam = function (dt, snap) {
    const P = G.P, vw = G.W, vh = G.H;
    const lookT = P.dir * 64;
    cam.look += (lookT - cam.look) * Math.min(1, dt * 2.2);
    // the ground the hero last stood on (followed down at once when they drop below it)
    cam.gy = snap || P.onGround || P.ladder || cam.gy === undefined ? P.y : Math.max(cam.gy, P.y);
    let tx = P.x - vw / 2 + cam.look, ty = Math.min(cam.gy - STAND, P.y - AIR);
    if (G.S.focus) { tx = G.S.focus.x - vw / 2; ty = G.S.focus.y - STAND; }
    tx = U.clamp(tx, 0, Math.max(0, map.w - vw)); ty = U.clamp(ty, 0, Math.max(0, map.h - vh));
    if (snap) { cam.x = tx; cam.y = ty; cam.look = lookT; }
    else { cam.x += (tx - cam.x) * Math.min(1, dt * 7); cam.y += (ty - cam.y) * Math.min(1, dt * 5); }
    if (cam.st > 0) {
      cam.st -= dt;
      const k = Math.max(0, cam.st / cam.sd) * cam.sa;
      cam.ox = (Math.random() * 2 - 1) * k; cam.oy = (Math.random() * 2 - 1) * k;
      if (cam.st <= 0) { cam.sa = 0; cam.ox = cam.oy = 0; }
    }
  };

  // ------------------------------------------------------------ terrain chunk cache
  function fallbackSolid(c, pal, s) {
    c.fillStyle = pal.body; c.fillRect(s.x, s.y, s.w, s.h);
    c.fillStyle = pal.top; c.fillRect(s.x - 2, s.y, s.w + 4, 14);
    c.strokeStyle = A.OUT; c.lineWidth = A.LW; c.strokeRect(s.x, s.y, s.w, s.h);
  }
  function fallbackPlat(c, pal, p) {
    A.rr(c, p.x, p.y, p.w, 22, 8); A.fs(c, pal.body);
    A.rr(c, p.x - 2, p.y, p.w + 4, 10, 5); A.fs(c, pal.top);
  }
  function fallbackLadder(c, l) {
    c.strokeStyle = A.OUT; c.lineWidth = 7; c.beginPath(); c.moveTo(l.x, l.y1); c.lineTo(l.x, l.y2); c.stroke();
    c.strokeStyle = '#c9a066'; c.lineWidth = 3.5; c.stroke();
  }
  function buildChunk(ci) {
    const [cv, c] = A.makeCanvas(CW, map.h);
    const x0 = ci * CW, x1 = x0 + CW, th = map.theme, pal = map.pal;
    c.translate(-x0, 0);
    c.save(); c.beginPath(); c.rect(x0, 0, CW, map.h); c.clip();
    for (const o of map.props) {
      if (o.x + o.w < x0 - 40 || o.x - o.w > x1 + 40) continue;
      c.save(); c.translate(o.x, o.y);
      try { o.p.draw(c, 0, o.seed); } catch (e) { if (!o.err) { o.err = 1; console.error('prop ' + o.name, e); } }
      c.restore();
    }
    const M = 60;
    for (const s of map.solids) {
      if (s.x + s.w < x0 - M || s.x > x1 + M) continue;
      c.save();
      try { if (A.solid) A.solid(c, th, s.x, s.y, s.w, s.h); else fallbackSolid(c, pal, s); } catch (e) { fallbackSolid(c, pal, s); if (!W._e1) { W._e1 = 1; console.error('A.solid', e); } }
      c.restore();
    }
    for (const p of map.plats) {
      if (p.x + p.w < x0 - M || p.x > x1 + M) continue;
      c.save();
      try { if (A.plat) A.plat(c, th, p.x, p.y, p.w); else fallbackPlat(c, pal, p); } catch (e) { fallbackPlat(c, pal, p); if (!W._e2) { W._e2 = 1; console.error('A.plat', e); } }
      c.restore();
    }
    for (const l of map.ladders) {
      if (l.x < x0 - M || l.x > x1 + M) continue;
      c.save();
      try { if (A.ladder) A.ladder(c, th, l.x, l.y1, l.y2); else fallbackLadder(c, l); } catch (e) { fallbackLadder(c, l); }
      c.restore();
    }
    c.restore();
    return cv;
  }
  function chunk(ci) {
    let ch = map.chunks[ci];
    if (!ch) {
      const keys = Object.keys(map.chunks);
      if (keys.length >= MAX_CHUNKS) {
        let old = null;
        for (const k of keys) if (!old || map.chunks[k].used < map.chunks[old].used) old = k;
        const oc = map.chunks[old].c; oc.width = oc.height = 1;
        delete map.chunks[old];
      }
      ch = map.chunks[ci] = { c: buildChunk(ci), used: frame };
    }
    ch.used = frame;
    return ch.c;
  }
  W.prewarm = function () {
    const c0 = Math.max(0, Math.floor(cam.x / CW)), c1 = Math.min(Math.floor((map.w - 1) / CW), Math.floor((cam.x + G.W) / CW));
    for (let ci = c0; ci <= c1; ci++) chunk(ci);
  };

  // ------------------------------------------------------------ lighting (dark maps)
  let lightCv = null, lightCtx = null, holeCv = null;
  const LS = 0.5;
  function lighting(ctx, vx, vy) {
    const dark = map.pal.dark || 0;
    if (dark < 0.05) return;
    if (!lightCv) {
      lightCv = document.createElement('canvas'); lightCv.width = G.W * LS; lightCv.height = G.H * LS; lightCtx = lightCv.getContext('2d');
      holeCv = document.createElement('canvas'); holeCv.width = holeCv.height = 128;
      const h = holeCv.getContext('2d'), gr = h.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.8)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      h.fillStyle = gr; h.fillRect(0, 0, 128, 128);
    }
    const l = lightCtx, P = G.P, t = G.time;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, lightCv.width, lightCv.height);
    l.fillStyle = 'rgba(10,6,26,' + dark + ')'; l.fillRect(0, 0, lightCv.width, lightCv.height);
    l.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => {
      const sx = (x - vx) * LS, sy = (y - vy) * LS, rr = r * LS;
      if (sx < -rr || sy < -rr || sx > lightCv.width + rr || sy > lightCv.height + rr) return;
      l.globalAlpha = a === undefined ? 1 : a;
      l.drawImage(holeCv, sx - rr, sy - rr, rr * 2, rr * 2);
    };
    const fl = 1 + Math.sin(t * 7) * 0.02;
    hole(P.x, P.y - 40, 230 * fl);
    hole(P.wisp.x, P.wisp.y, 190 * fl);
    for (const L of map.lights) hole(L.x, L.y, L.r * (1 + Math.sin(t * 9 + L.x) * 0.03));
    for (const p of map.portals) if (map.boss) hole(p.x, p.y - 55, 100, 0.6); else hole(p.x, p.y - 55, 150 + (P.portO === p ? 110 * P.portK() : 0));
    if (map.beacon) hole(map.beacon.x, map.beacon.y - 250, map.beacon.lit ? 620 : 120, map.beacon.lit ? 1 : 0.5);
    for (const pr of G.projs) hole(pr.x, pr.y, pr.light || 70, 0.8);
    for (const m of G.mons) if (m.def.glow || m.boss) hole(m.x, m.y - m.h / 2, m.def.glow || 200, 0.7);
    G.Fx.lights(hole);
    G.Haz.lights(hole);
    G.Drops.lights(hole); // dropped gear and its light column
    l.globalAlpha = 1;
    ctx.drawImage(lightCv, 0, 0, G.W, G.H);
  }

  // ------------------------------------------------------------ draw
  const promptO = { size: 13, weight: 800 };
  // A name tag / prompt is kept whole on screen: near the left or right edge (a portal at the end of a map, the hero walking up to
  // it) the pill slides inward instead of being cut off — but never off its anchor, so it still sits over what it names and leaves
  // the screen together with it. x: the anchor's world x, w: the pill's width → the pill's centre.
  let viewX = 0;
  const EDGE = 6;
  W.tagX = function (x, w) {
    const lo = viewX + EDGE + w / 2, hi = viewX + G.W - EDGE - w / 2;
    return U.clamp(lo <= hi ? U.clamp(x, lo, hi) : x, x - w / 2 + 14, x + w / 2 - 14);
  };
  function tag(ctx, x, y, str, color, bg) {
    ctx.font = '800 13px ' + A.FONT;
    const w = ctx.measureText(str).width + 14;
    x = W.tagX(x, w);
    A.rr(ctx, x - w / 2, y - 10, w, 20, 10); ctx.fillStyle = bg || 'rgba(28,20,44,0.78)'; ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color || '#fff'; ctx.fillText(str, x, y + 1);
  }
  W.tag = tag;
  W.draw = function (ctx) {
    frame++;
    const t = G.time, P = G.P;
    const RS = G.RS, vx = Math.round((cam.x + cam.ox) * RS) / RS, vy = Math.round((cam.y + cam.oy) * RS) / RS;
    viewX = vx;
    const view = { x: vx, y: vy, w: G.W, h: G.H, mw: map.w, mh: map.h };
    // background
    const bg = A.bg && A.bg[map.theme];
    let ok = false;
    if (bg) { ctx.save(); try { bg(ctx, view, t); ok = true; } catch (e) { if (!W._e3) { W._e3 = 1; console.error('A.bg', e); } } ctx.restore(); }
    if (!ok) {
      const g = ctx.createLinearGradient(0, 0, 0, G.H); g.addColorStop(0, map.pal.sky[0]); g.addColorStop(1, map.pal.sky[1]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, G.W, G.H);
    }
    ctx.save();
    ctx.translate(-vx, -vy);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // terrain chunks
    const c0 = Math.max(0, Math.floor(vx / CW)), c1 = Math.min(Math.floor((map.w - 1) / CW), Math.floor((vx + G.W) / CW));
    for (let ci = c0; ci <= c1; ci++) A.blit(ctx, chunk(ci), ci * CW, 0);
    // animated props
    const inView = (o) => o.x + o.w > vx - 60 && o.x - o.w < vx + G.W + 60;
    for (const o of map.anim) {
      if (o.p.layer === 'front' || !inView(o)) continue;
      ctx.save(); ctx.translate(o.x, o.y);
      try { o.p.draw(ctx, t, o.seed); } catch (e) { if (!o.err) { o.err = 1; console.error('prop ' + o.name, e); } }
      ctx.restore();
    }
    // beacon
    const B = map.beacon;
    if (B) {
      ctx.save(); ctx.translate(B.x, B.y);
      if (A.beacon) { try { A.beacon(ctx, t, B.lit, B.flare); } catch (e) { if (!W._e4) { W._e4 = 1; console.error('A.beacon', e); } } }
      else { A.rr(ctx, -30, -260, 60, 260, 8); A.fs(ctx, '#8a8098'); if (B.lit) A.glow(ctx, 0, -250, 160, '#ffd27a', 0.9); }
      ctx.restore();
    }
    // portals (sealed while a guardian is awake)
    const sealed = !!map.boss;
    for (const p of map.portals) {
      if (p.x < vx - 100 || p.x > vx + G.W + 100) continue;
      ctx.save(); ctx.translate(p.x, p.y);
      if (sealed) sealedPortal(ctx, map.sealT === undefined ? t : map.sealT, t);
      else if (A.portal) { try { A.portal(ctx, t); } catch (e) { if (!W._e5) { W._e5 = 1; console.error('A.portal', e); } } }
      else { A.glow(ctx, 0, -55, 70, '#ffe9a0', 0.8); A.ell(ctx, 0, -55, 26, 50); ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 4; ctx.stroke(); }
      if (!sealed && P.portO === p && P.portT > 0) portalFill(ctx, P.portK(), t);
      ctx.restore();
    }
    // NPCs
    for (const n of map.npcs) {
      if (n.x < vx - 80 || n.x > vx + G.W + 80) continue;
      const near = Math.abs(P.x - n.x) < 200;
      if (near) n.dir = P.x < n.x ? -1 : 1;
      A.shadow(ctx, n.x, n.y, 17);
      ctx.save(); ctx.translate(n.x, n.y); ctx.scale(n.dir, 1);
      A.hero(ctx, n.def.look, { state: 'idle', t: t + n.t });
      ctx.restore();
    }
    G.Fx.drawBack(ctx);
    G.Haz.drawBack(ctx); // red floor telegraphs of the guardians' big attacks
    G.Drops.draw(ctx);
    G.Mon.draw(ctx, vx, vy);
    P.draw(ctx);
    G.Proj.draw(ctx);
    G.Haz.draw(ctx);
    G.Fx.draw(ctx);
    for (const o of map.front) {
      if (!inView(o)) continue;
      ctx.save(); ctx.translate(o.x, o.y);
      try { o.p.draw(ctx, t, o.seed); } catch (e) { if (!o.err) { o.err = 1; console.error('prop ' + o.name, e); } }
      ctx.restore();
    }
    for (const o of map.anim) {
      if (o.p.layer !== 'front' || !inView(o)) continue;
      ctx.save(); ctx.translate(o.x, o.y); try { o.p.draw(ctx, t, o.seed); } catch (e) {} ctx.restore();
    }
    ctx.restore();

    lighting(ctx, vx, vy);
    const amb = A.ambient && A.ambient[map.theme];
    if (amb) { ctx.save(); try { amb(ctx, view, t); } catch (e) { if (!W._e6) { W._e6 = 1; console.error('A.ambient', e); } } ctx.restore(); }

    // world-space overlays (always bright): labels, bars, numbers, prompts
    ctx.save();
    ctx.translate(-vx, -vy);
    for (const p of map.portals) {
      if (p.x < vx - 100 || p.x > vx + G.W + 100) continue;
      if (sealed) tag(ctx, p.x, p.y - 128, p.name + ' · 봉인됨', '#e6d6ff', 'rgba(48,26,84,0.88)');
      else tag(ctx, p.x, p.y - 128, p.name, '#ffe9a8');
    }
    for (const n of map.npcs) {
      if (n.x < vx - 80 || n.x > vx + G.W + 80) continue;
      const sc = n.def.look.scale || 1, top = n.y - 86 * sc;
      tag(ctx, n.x, top - 6, n.def.name, '#fff3d0');
      const mk = G.Quest.marker(n.id);
      if (mk) {
        const by = top - 42 + Math.sin(t * 4 + n.x) * 3;
        A.glow(ctx, n.x, by, 22, mk === '?' ? '#ffe070' : mk === '!' ? '#ffd27a' : '#9a9ab0', 0.7);
        A.text(ctx, mk, n.x, by, { size: 26, weight: 900, color: mk === '…' ? '#c8c8d8' : '#ffd84a', sw: 5 });
      }
    }
    if (B) tag(ctx, B.x, B.y - 338, B.info.name + (B.lit ? ' · 점화됨' : ' · 꺼짐'), B.lit ? '#ffe9a8' : '#c9b6ff');
    G.Drops.drawOverlay(ctx); // NEW · ▲ over dropped gear
    G.Mon.drawOverlay(ctx);
    drawGuide(ctx, vx, vy);
    P.drawOverlay(ctx);
    G.Fx.drawNums(ctx);
    ctx.restore();
    G.Fx.drawScreen(ctx);
    G.Fx.drawCombo(ctx);
    // map transition fade
    const tr = G.S.trans;
    if (tr) {
      const a = tr.phase === 0 ? U.sat(tr.t / tr.dur) : 1 - U.sat((tr.t - 0.1) / tr.dur);
      ctx.fillStyle = 'rgba(12,8,24,' + a + ')'; ctx.fillRect(0, 0, G.W, G.H);
    }
  };

  // minimap: draws the map layout into a small canvas context
  W.drawMini = function (c, w, h) {
    const P = G.P, s = Math.min(w / map.w, h / map.h), ox = (w - map.w * s) / 2, oy = (h - map.h * s) / 2;
    c.clearRect(0, 0, w, h);
    c.save(); c.translate(ox, oy); c.scale(s, s);
    c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(0, 0, map.w, map.h);
    c.fillStyle = A.rgba(map.pal.top, 0.85);
    for (const sd of map.solids) c.fillRect(sd.x, sd.y, sd.w, sd.h);
    for (const p of map.plats) c.fillRect(p.x, p.y, p.w, 14 / (s * 4));
    c.fillStyle = 'rgba(230,200,150,0.7)';
    for (const l of map.ladders) c.fillRect(l.x - 1 / s, l.y1, 2 / s, l.y2 - l.y1);
    const dot = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r / s, 0, 6.3); c.fill(); };
    for (const p of map.portals) dot(p.x, p.y - 30, 3.2, map.boss ? '#9a7ac8' : '#7fe0ff');
    for (const n of map.npcs) dot(n.x, n.y - 30, 2.6, '#ffe070');
    if (map.beacon) dot(map.beacon.x, map.beacon.y - 60, 3.6, map.beacon.lit ? '#ffd27a' : '#b06aff');
    for (const m of G.mons) if (!m.dead && m.def.ai !== 'dummy') dot(m.x, m.y - m.h / 2, m.boss ? 4 : 1.9, m.boss ? '#ff4a6a' : '#ff8a7a');
    dot(P.x, P.y - 34, 3.4, '#ffffff');
    c.restore();
  };
})();
