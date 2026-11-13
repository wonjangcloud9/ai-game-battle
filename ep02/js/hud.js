// AURORA FALL — heads-up display: bars, minimap, compass, kill feed, markers, menus
'use strict';

const HUD = {
  el: {}, cache: {}, map: null, mapCtx: null, mini: null, big: null, comp: null,
  feed: [], announceQ: [], announceT: 0, nums: [], dirs: [], toasts: [],
  hitT: 0, hitHead: false, bigMapOpen: false, pings: [], viewProj: null, vw: 1, vh: 1,
  tags: [], coachFlip: false,
  mates: [], mateTags: [],      // squad mode: rows of the team panel / name tags in the world
  MAP: 512,

  init() {
    const ids = ['hud', 'crosshair', 'chTop', 'chBottom', 'chLeft', 'chRight', 'chDot', 'hitmarker', 'scope', 'compass', 'zoneInfo', 'zoneText', 'zoneTimer', 'minimap',
      'aliveCount', 'killCount', 'killfeed', 'announce', 'announceMain', 'announceSub', 'prompt', 'promptText', 'progress', 'progressBar', 'progressText',
      'hpBar', 'hpText', 'shieldBar', 'shieldText', 'cBandage', 'cMedkit', 'cCell', 'cNade', 'slot0', 'slot1', 'slot2', 'ammoMag', 'ammoReserve', 'ammoType',
      'dmgDir', 'dmgNums', 'poiLabels', 'dropHud', 'dropMain', 'dropSub', 'lowHp', 'spectate', 'specName', 'bigmap', 'bigmapCanvas', 'toasts', 'fps', 'zoneOut', 'warn', 'hint',
      'coach', 'guideMarker', 'guideArrow', 'guideLabel', 'guideDist', 'lootTags', 'guard', 'guardTime', 'guardLabel', 'consBandage', 'consMedkit', 'consCell',
      'veh', 'vehName', 'vehSpeed', 'vehBar', 'vehDriver',
      'squad', 'mateTags', 'down', 'downTitle', 'downBar', 'downText', 'teamCount', 'teamCountBox', 'mapMates'];
    for (const id of ids) { this.el[id] = document.getElementById(id); if (!this.el[id]) throw new Error('HUD element missing: #' + id); }
    this.mini = this.el.minimap.getContext('2d');
    this.big = this.el.bigmapCanvas.getContext('2d');
    this.comp = this.el.compass.getContext('2d');
    for (let i = 0; i < 20; i++) { const d = document.createElement('div'); d.className = 'dmgNum'; this.el.dmgNums.appendChild(d); this.nums.push({ el: d, t: 0, x: 0, y: 0, z: 0, life: 0 }); }
    for (let i = 0; i < 6; i++) { const d = document.createElement('div'); d.className = 'dmgArc'; this.el.dmgDir.appendChild(d); this.dirs.push({ el: d, t: 0, x: 0, z: 0 }); }
    // floating labels over nearby chests (beginner guidance)
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div'); d.className = 'lootTag';
      const k = document.createElement('kbd'); k.textContent = 'F';
      const n = document.createElement('span');
      d.appendChild(k); d.appendChild(n); this.el.lootTags.appendChild(d);
      this.tags.push({ el: d, label: n, shown: false, near: false, last: '' });
    }
    // squad mode: a row per team-mate in the panel on the left, and a name tag for each of them in the world
    const mk = (tag, cls, parent) => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
    for (let i = 0; i < SQUAD.size - 1; i++) {
      const row = mk('div', 'mate', this.el.squad), top = mk('div', 'mateTop', row), tint = SQUAD_TINTS[i % SQUAD_TINTS.length];
      row.style.setProperty('--tint', tint);
      const M = { el: row, name: mk('span', 'mateName', top), info: mk('b', 'mateInfo', top), sh: mk('div', 'fill', mk('div', 'mateBar sh', row)), hp: mk('div', 'fill', mk('div', 'mateBar hp', row)), c: {} };
      this.mates.push(M);
      const tag = mk('div', 'mateTag', this.el.mateTags);
      tag.style.setProperty('--tint', tint);
      this.mateTags.push({ el: tag, arrow: mk('i', 'mateArrow', tag), name: mk('span', 'mateTagName', tag), dist: mk('b', 'mateTagDist', tag), shown: false, c: {} });
    }
    // place-name labels shown during the drop
    this.labels = Terrain.pois.map(q => {
      const d = document.createElement('div'); d.className = 'poiLabel';
      const n = document.createElement('span'); n.textContent = q.name;
      const m = document.createElement('small');
      d.appendChild(n); d.appendChild(m); this.el.poiLabels.appendChild(d);
      return { el: d, dist: m, poi: q, shown: false, last: '' };
    });
  },
  set(id, text) { if (this.cache[id] !== text) { this.cache[id] = text; this.el[id].textContent = text; } },
  cls(id, name, on) { const k = id + '.' + name; if (this.cache[k] !== on) { this.cache[k] = on; this.el[id].classList.toggle(name, !!on); } },
  style(id, prop, val) { const k = id + ':' + prop; if (this.cache[k] !== val) { this.cache[k] = val; this.el[id].style[prop] = val; } },
  show(id, on) { this.cls(id, 'hidden', !on); },

  // ------------------------------------------------------------------ map image (top-down render of the island)
  buildMap() {
    const S = this.MAP, cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
    const c = [0, 0, 0], n = [0, 0, 0], k = Terrain.SIZE / S, Lx = -0.5, Ly = 0.72, Lz = -0.48;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = (x + 0.5) * k - Terrain.HALF, wz = (y + 0.5) * k - Terrain.HALF, h = Terrain.height(wx, wz);
      Terrain.colorAt(wx, wz, c); Terrain.normal(wx, wz, n);
      const sh = Math.max(0, n[0] * Lx + n[1] * Ly + n[2] * Lz) * 0.95 + 0.38;
      let r = c[0] * sh, g = c[1] * sh, b = c[2] * sh;
      if (h < 0) { const dp = 0.45 + Math.min(1, -h / 8) * 0.5; r = lerp(r, 0.02, dp); g = lerp(g, 0.15, dp); b = lerp(b, 0.27, dp); }
      const i = (y * S + x) * 4;
      d[i] = Math.pow(clamp01(r), 0.4545) * 255; d[i + 1] = Math.pow(clamp01(g), 0.4545) * 255; d[i + 2] = Math.pow(clamp01(b), 0.4545) * 255; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // buildings
    const s = S / Terrain.SIZE;
    for (const f of World.footprints) {
      ctx.save();
      ctx.translate((f.x + Terrain.HALF) * s, (f.z + Terrain.HALF) * s);
      ctx.rotate(-f.yaw);
      ctx.fillStyle = f.kind === 2 ? 'rgba(52,60,72,0.9)' : 'rgba(70,58,50,0.9)';
      ctx.fillRect(-f.w * s / 2, -f.d * s / 2, f.w * s, f.d * s);
      ctx.restore();
    }
    // tree speckle
    ctx.fillStyle = 'rgba(30,62,36,0.55)';
    for (let i = 0; i < World.treeCount; i += 2) ctx.fillRect((World.trees[i * 8] + Terrain.HALF) * s - 0.6, (World.trees[i * 8 + 2] + Terrain.HALF) * s - 0.6, 1.3, 1.3);
    this.map = cv;
  },

  // ------------------------------------------------------------------ transient widgets
  announce(main, sub, kind) {
    this.announceQ.push({ main, sub: sub || '', kind: kind || '' });
    if (this.announceQ.length > 3) this.announceQ.shift();
  },
  // how: '' = killed, 'knock' = knocked down (squad mode), 'revive' = helped up by `attacker`
  killFeed(victim, attacker, weaponId, how) {
    const p = Game.player;
    const row = document.createElement('div');
    const team = !!p && Game.squad && victim !== p && attacker !== p && (victim.team === p.team || (!!attacker && attacker.team === p.team));
    row.className = 'feedRow' + (attacker === p && p ? ' mine' : how === 'revive' ? ' team' : victim === p && p ? ' me' : team ? ' team' : '') + (how === 'knock' ? ' knock' : '');
    const crash = weaponId === 'vehicle' || weaponId === 'blast';
    const wn = weaponId === 'zone' ? '오로라 장벽' : weaponId === 'grenade' ? GRENADE.name : weaponId === 'vehicle' ? '탈것' : weaponId === 'blast' ? '차량 폭발' : (WEAPONS[weaponId] ? WEAPONS[weaponId].name : '');
    const a = document.createElement('span'); a.className = 'feedA'; a.textContent = attacker ? attacker.name : crash ? wn : TEXT.zoneName;
    const w = document.createElement('span'); w.className = 'feedW'; w.textContent = how === 'revive' ? '소생' : how === 'knock' ? (attacker && wn ? wn + ' · 기절' : '기절') : attacker ? wn : '▸';
    const v = document.createElement('span'); v.className = 'feedV'; v.textContent = victim.name;
    row.appendChild(a); row.appendChild(w); row.appendChild(v);
    this.el.killfeed.appendChild(row);
    this.feed.push({ el: row, t: 6.5 });
    while (this.feed.length > 5) { const f = this.feed.shift(); f.el.remove(); }
  },
  toast(text, css) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = text;
    if (css) d.style.color = css;
    this.el.toasts.appendChild(d);
    this.toasts.push({ el: d, t: 2.2 });
    while (this.toasts.length > 5) { const f = this.toasts.shift(); f.el.remove(); }
  },
  hitMarker(head, kill) { this.hitT = kill ? 0.45 : 0.22; this.hitHead = head; this.cls('hitmarker', 'head', head); this.cls('hitmarker', 'kill', !!kill); },
  damageNumber(x, y, z, amount, head, shield) {
    let slot = this.nums[0];
    for (const n of this.nums) { if (n.t <= 0) { slot = n; break; } if (n.t < slot.t) slot = n; }
    slot.t = 0.85; slot.life = 0.85; slot.x = x + (Math.random() - 0.5) * 0.5; slot.y = y; slot.z = z + (Math.random() - 0.5) * 0.5;
    slot.el.textContent = String(Math.max(1, Math.round(amount)));
    slot.el.className = 'dmgNum' + (head ? ' head' : shield ? ' shield' : '');
  },
  damageFrom(x, z) {
    let slot = this.dirs[0];
    for (const n of this.dirs) { if (n.t <= 0) { slot = n; break; } if (n.t < slot.t) slot = n; }
    slot.t = 1.4; slot.x = x; slot.z = z;
  },
  ping(x, z, kind) { this.pings.push({ x, z, t: 1.6, kind: kind || 0 }); if (this.pings.length > 40) this.pings.shift(); },
  // world -> screen (css pixels); returns false when behind the camera
  project(x, y, z, out) {
    const m = this.viewProj;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.01) return false;
    out[0] = (cx / cw * 0.5 + 0.5) * this.vw; out[1] = (1 - (cy / cw * 0.5 + 0.5)) * this.vh;
    return true;
  },

  // ------------------------------------------------------------------ per-frame update
  // view: { player (character being shown), cam: {yaw, viewProj, fov}, spectating, spread (deg), scoped, enemyUnderCrosshair, fps }
  update(dt, view) {
    const p = view.player;
    this.viewProj = view.cam.viewProj; this.vw = window.innerWidth; this.vh = window.innerHeight;
    // ---- announcements
    if (this.announceT > 0) { this.announceT -= dt; if (this.announceT <= 0) this.cls('announce', 'show', false); }
    else if (this.announceQ.length) {
      const a = this.announceQ.shift();
      this.el.announceMain.textContent = a.main; this.el.announceSub.textContent = a.sub;
      this.el.announce.className = 'show ' + a.kind; this.cache['announce.show'] = true;
      this.announceT = 2.6;
    }
    for (let i = this.feed.length - 1; i >= 0; i--) { const f = this.feed[i]; f.t -= dt; if (f.t <= 0) { f.el.remove(); this.feed.splice(i, 1); } else if (f.t < 0.6) f.el.style.opacity = String(f.t / 0.6); }
    for (let i = this.toasts.length - 1; i >= 0; i--) { const f = this.toasts[i]; f.t -= dt; if (f.t <= 0) { f.el.remove(); this.toasts.splice(i, 1); } else if (f.t < 0.5) f.el.style.opacity = String(f.t / 0.5); }
    for (let i = this.pings.length - 1; i >= 0; i--) { this.pings[i].t -= dt; if (this.pings[i].t <= 0) this.pings.splice(i, 1); }
    if (this.hitT > 0) { this.hitT -= dt; this.style('hitmarker', 'opacity', String(clamp01(this.hitT / 0.15))); } else this.style('hitmarker', 'opacity', '0');
    const sp = [0, 0];
    for (const n of this.nums) {
      if (n.t <= 0) { if (n.el.style.display !== 'none') n.el.style.display = 'none'; continue; }
      n.t -= dt;
      const k = 1 - n.t / n.life;
      if (this.project(n.x, n.y + 0.4 + k * 0.9, n.z, sp)) {
        n.el.style.display = 'block';
        n.el.style.transform = `translate(${sp[0].toFixed(1)}px, ${sp[1].toFixed(1)}px) translate(-50%, -50%) scale(${(1.25 - k * 0.35).toFixed(2)})`;
        n.el.style.opacity = String(clamp01(n.t / 0.3));
      } else n.el.style.display = 'none';
    }
    if (!p) return;
    // ---- damage direction arcs
    for (const n of this.dirs) {
      if (n.t <= 0) { if (n.el.style.display !== 'none') n.el.style.display = 'none'; continue; }
      n.t -= dt;
      const ang = Math.atan2(n.x - p.x, n.z - p.z) - view.cam.yaw;   // relative bearing, 0 = straight ahead
      n.el.style.display = 'block';
      n.el.style.transform = `translate(-50%, -50%) rotate(${(-ang * 180 / Math.PI).toFixed(1)}deg) translateY(-118px)`;
      n.el.style.opacity = String(clamp01(n.t / 0.5));
    }
    // ---- vitals
    this.style('hpBar', 'width', Math.round(clamp01(p.hp / CFG.MAX_HP) * 100) + '%');
    this.style('shieldBar', 'width', Math.round(clamp01(p.shield / CFG.MAX_SHIELD) * 100) + '%');
    this.set('hpText', String(Math.ceil(p.hp))); this.set('shieldText', String(Math.ceil(p.shield)));
    const down = p.alive && p.mode === 'down';                                     // squad mode: knocked down (the health bar shows what is left to bleed)
    this.cls('hpBar', 'low', p.hp < 35 || down);
    this.cls('lowHp', 'on', p.alive && (p.hp < 35 || down));
    this.set('cBandage', String(p.heals.bandage)); this.set('cMedkit', String(p.heals.medkit)); this.set('cCell', String(p.heals.cell)); this.set('cNade', String(p.grenades));
    for (let s = 0; s < 3; s++) {
      const w = p.weapons[s], id = 'slot' + s;
      const key = w ? w.type + w.rarity + ':' + w.ammo : '-';
      if (this.cache[id + '#'] !== key) {
        this.cache[id + '#'] = key;
        const e = this.el[id];
        e.querySelector('.slotName').textContent = w ? WEAPONS[w.type].name : '비어 있음';
        e.querySelector('.slotAmmo').textContent = w ? String(w.ammo) : '';
        e.style.setProperty('--rar', w ? RARITY[w.rarity].css : 'rgba(255,255,255,0.18)');
        e.classList.toggle('empty', !w);
      }
      this.cls(id, 'active', s === p.slot);
    }
    const cw = p.curWeapon();
    if (cw) { const def = WEAPONS[cw.type]; this.set('ammoMag', String(cw.ammo)); this.set('ammoReserve', '/ ' + p.ammo[def.ammo]); this.set('ammoType', AMMO[def.ammo].name); this.cls('ammoMag', 'low', cw.ammo <= def.mag * 0.25); }
    else { this.set('ammoMag', '—'); this.set('ammoReserve', ''); this.set('ammoType', '맨손'); this.cls('ammoMag', 'low', false); }
    // ---- match info
    this.set('aliveCount', String(Game.aliveCount)); this.set('killCount', String(p.kills));
    this.show('teamCountBox', Game.squad);
    if (Game.squad) this.set('teamCount', String(Game.teamsAlive));
    let zt = '', zl = '';
    if (Game.state === 'plane') { zl = '강하 준비'; zt = fmtTime(Game.planeTimeToDrop()); }
    else if (Zone.done) { zl = '장벽 완전 폐쇄'; zt = ''; }
    else if (Zone.state === 'wait') { zl = (Zone.phase + 1) + '단계 수축까지'; zt = fmtTime(Zone.timer); }
    else { zl = (Zone.phase + 1) + '단계 수축 중'; zt = fmtTime(Zone.timer); }
    this.set('zoneText', zl); this.set('zoneTimer', zt);
    this.cls('zoneInfo', 'moving', Zone.state === 'shrink' && Game.state === 'playing');
    const outside = Game.state === 'playing' && p.alive && p.mode !== 'plane' && Zone.outside(p.x, p.z);
    this.cls('zoneOut', 'on', outside);
    // ---- crosshair
    const ground = p.mode === 'ground' && p.alive && !view.spectating;
    this.show('crosshair', ground && !view.scoped);
    this.show('scope', !!view.scoped);
    if (ground) {
      const gap = Math.round(4 + Math.tan(view.spread * DEG) / Math.tan(view.cam.fov * DEG / 2) * (this.vh / 2));
      if (this.cache.gap !== gap) {
        this.cache.gap = gap;
        this.el.chTop.style.transform = `translate(-50%, ${-gap - 10}px)`; this.el.chBottom.style.transform = `translate(-50%, ${gap}px)`;
        this.el.chLeft.style.transform = `translate(${-gap - 10}px, -50%)`; this.el.chRight.style.transform = `translate(${gap}px, -50%)`;
      }
      this.cls('crosshair', 'enemy', !!view.enemyUnderCrosshair);
    }
    // ---- prompts and progress
    // (at the wheel F means getting out: the vehicle panel says so, no prompt in the middle of the view)
    const it = !view.spectating && Game.interact && Game.interact.type !== 'exit' ? Game.interact : null;
    this.show('prompt', !!it);
    if (it) { this.set('promptText', it.label); this.style('promptText', 'color', it.rarity !== undefined ? RARITY[it.rarity].css : '#fff'); }
    let warn = '';
    if (ground && cw && p.reloadT <= 0 && !it) {
      const def = WEAPONS[cw.type], spare = p.ammo[def.ammo];
      if (cw.ammo === 0) warn = spare > 0 ? 'R — 재장전' : '탄약 없음';
      else if (cw.ammo <= def.mag * 0.25 && spare > 0) warn = '탄약 부족 · R';
    }
    // ---- at the wheel: speed, state of the vehicle, the keys
    const ride = p.alive && p.mode === 'drive' ? p.vehicle : null;
    this.show('veh', !!ride);
    if (ride) {
      const pass = ride.driver !== p;                                                // squad mode: riding along in a team-mate's vehicle
      this.set('vehName', Game.squad ? ride.def.name + ' · ' + ((ride.driver ? 1 : 0) + ride.riders) + '/' + (1 + ride.def.pass.length) + '명' : ride.def.name); this.set('vehSpeed', String(Math.round(Math.abs(ride.speed) * 3.6)));
      this.cls('veh', 'pass', pass);
      if (pass) this.set('vehDriver', ride.driver ? ride.driver.name : '없음');
      this.style('vehBar', 'width', Math.round(clamp01(ride.hp / ride.def.hp) * 100) + '%');
      this.cls('veh', 'burn', ride.burning); this.cls('veh', 'low', !ride.burning && ride.hp < ride.def.hp * 0.5); this.cls('veh', 'watch', !!view.spectating);
      if (!view.spectating) warn = ride.burning ? '불이 붙었습니다 — F 탈출!' : ride.wet > 0.5 && !pass ? '물이 깊습니다 — 후진하세요' : '';
    }
    this.show('warn', !!warn);
    if (warn) this.set('warn', warn);
    // ---- beginner guidance (Guide decides what, this only draws it)
    const guiding = ground && Guide.enabled;
    this.show('hint', guiding && Game.sinceLanding() < 75);
    const tip = guiding || ((ride || down) && !view.spectating && Guide.enabled) ? Guide.tip : null;       // (on foot, the driving keys at the wheel, what to do when down)
    this.show('coach', !!tip);
    if (tip) {
      const key = tip.id + '|' + tip.parts.map(q => (typeof q === 'string' ? q : '[' + q.k + ']')).join('');
      if (this.cache.coachKey !== key) {
        this.cache.coachKey = key;
        const e = this.el.coach;
        e.textContent = '';
        for (const q of tip.parts) { const n = document.createElement(typeof q === 'string' ? 'span' : 'kbd'); n.textContent = typeof q === 'string' ? q : q.k; e.appendChild(n); }
        this.coachFlip = !this.coachFlip; this.cls('coach', 'alt', this.coachFlip);   // switching the animation name replays the entrance
        this.cls('coach', 'urgent', tip.id === 'heal' || tip.id === 'noheal' || tip.id === 'mate' || tip.id === 'down');
      }
    }
    const slot = guiding ? Guide.healSlot : '';
    this.cls('consBandage', 'use', slot === 'bandage'); this.cls('consMedkit', 'use', slot === 'medkit'); this.cls('consCell', 'use', slot === 'cell');
    const guard = ground || (ride && !view.spectating) ? Game.graceShown() : null, guarded = !!guard && guard[0] !== 0;
    this.show('guard', guarded);
    if (guarded) {
      const open = guard[0] < 0;                                                    // open-ended extension: it lasts until a gun is found, so no number
      this.set('guardLabel', guard[1] ? '보호 연장' : '착지 보호');
      this.set('guardTime', open ? '총을 들 때까지' : String(Math.ceil(guard[0])));
      this.cls('guard', 'open', open);
    }
    // marker toward the nearest chest / gun while unarmed: on the object when it is in view, otherwise on the rim pointing the way
    const world = guiding && !this.bigMapOpen;                                        // nothing floats over the full-screen map
    const mk = world && Guide.marker && !(it && it.ref === Guide.marker.ref) ? Guide.marker : null;
    this.show('guideMarker', !!mk);
    if (mk) {
      const dist = Math.round(Math.hypot(mk.x - p.x, mk.z - p.z)) + 'm';
      this.set('guideLabel', mk.label); this.set('guideDist', dist);
      const half = 13 + mk.label.length * 6.5 + dist.length * 4;                     // rough half-width of the pill in px
      let mx, my, th;
      if (this.project(mk.x, mk.y, mk.z, sp) && sp[0] > half + 8 && sp[0] < this.vw - half - 8 && sp[1] > this.vh * 0.17 + 110 && sp[1] < this.vh - 190) {
        mx = sp[0]; my = sp[1] - 34; th = Math.PI;                                    // sits above the object, arrow pointing down at it
      } else {
        const ang = Math.atan2(mk.x - p.x, mk.z - p.z) - view.cam.yaw;                // 0 = straight ahead, positive = to the left
        // the rim is an ellipse, flattened so that it stays below the announcements (top 17%) and above the hint line / health bars
        const up = Math.cos(ang), ry = Math.max(40, Math.min(this.vh * 0.26, up > 0 ? this.vh * 0.33 - 100 : this.vh / 2 - 195));
        mx = this.vw / 2 - Math.sin(ang) * this.vw * 0.36; my = this.vh / 2 - up * ry; th = -ang;
      }
      const reach = 1 / Math.hypot(Math.sin(th) / (half + 12), Math.cos(th) / 24);    // just outside the pill in that direction
      this.el.guideMarker.style.transform = `translate(${mx.toFixed(0)}px, ${my.toFixed(0)}px) translate(-50%, -50%)`;
      this.el.guideArrow.style.transform = `rotate(${(th * 180 / Math.PI).toFixed(0)}deg) translateY(${(-reach).toFixed(0)}px)`;
    }
    for (let i = 0; i < this.tags.length; i++) {
      const T = this.tags[i], t = world && i < Guide.tags.length ? Guide.tags[i] : null;
      const on = !!t && !(mk && mk.ref === t.ref) && this.project(t.x, t.y, t.z, sp) && sp[0] > 40 && sp[0] < this.vw - 40 && sp[1] > 70 && sp[1] < this.vh - 150;
      if (on !== T.shown) { T.shown = on; T.el.style.display = on ? 'flex' : 'none'; }
      if (!on) continue;
      const promptTop = this.vh * 0.59;                                               // keep the tag clear of the F prompt under the crosshair
      if (it && Math.abs(sp[0] - this.vw / 2) < 160 && sp[1] > promptTop - 8 && sp[1] < promptTop + 70) sp[1] = promptTop - 8;
      T.el.style.transform = `translate(${sp[0].toFixed(0)}px, ${sp[1].toFixed(0)}px) translate(-50%, -100%)`;
      if (T.last !== t.label) { T.last = t.label; T.label.textContent = t.label; }
      const near = !!(it && it.ref === t.ref);
      if (near !== T.near) { T.near = near; T.el.classList.toggle('near', near); }
    }
    let prog = 0, ptxt = '';
    if (p.reviving) { prog = Math.max(0.01, 1 - p.reviveT / p.reviveTotal); ptxt = '살리는 중 · ' + p.reviving.name; }
    else if (p.reloadT > 0) { prog = 1 - p.reloadT / p.reloadTotal; ptxt = '재장전'; }
    else if (p.useT > 0) { prog = 1 - p.useT / p.useTotal; ptxt = HEALS[p.useType] ? HEALS[p.useType].name + ' 사용 중' : ''; }
    this.show('progress', prog > 0);
    if (prog > 0) { this.style('progressBar', 'width', Math.round(prog * 100) + '%'); this.set('progressText', ptxt); }
    this.updateSquad(view, sp, down);
    // ---- drop phase
    const dropping = p.alive && (p.mode === 'plane' || p.mode === 'fall' || p.mode === 'glide');
    this.show('dropHud', dropping);
    if (dropping) {
      if (p.mode === 'plane') {
        if (Game.canJump()) { this.set('dropMain', 'SPACE / F — 강하'); this.set('dropSub', '지도(M)를 보고 내릴 곳을 고르세요 · 건물이 모인 곳에 상자가 많습니다'); }
        else if (Game.plane.dist < Game.plane.dropStart) { this.set('dropMain', '강하 지점 접근 중'); this.set('dropSub', fmtTime(Game.planeTimeToDrop())); }
        else { this.set('dropMain', '강제 강하'); this.set('dropSub', ''); }
      } else {
        const alt = Math.max(0, p.y - Math.max(0, Terrain.height(p.x, p.z)));
        this.set('dropMain', '고도 ' + Math.round(alt) + ' m');
        this.set('dropSub', p.mode === 'fall' ? '아래를 보면 급강하 · SPACE 글라이더 전개' : 'WASD로 활공 방향 조종 · 착지하면 잠시 보호받습니다');
      }
    }
    // landing-zone labels while still in the air
    for (const L of this.labels) {
      const q = L.poi;
      let on = dropping && !this.bigMapOpen && this.project(q.x, q.y + 26, q.z, sp);
      const d = on ? Math.hypot(q.x - p.x, q.z - p.z) : 0;
      if (on && (d < 90 || sp[0] < 40 || sp[0] > this.vw - 40 || sp[1] < 60 || sp[1] > this.vh - 60)) on = false;
      if (on !== L.shown) { L.shown = on; L.el.style.display = on ? 'block' : 'none'; }
      if (!on) continue;
      L.el.style.transform = `translate(${sp[0].toFixed(0)}px, ${sp[1].toFixed(0)}px) translate(-50%, -50%)`;
      const txt = Math.round(d / 10) * 10 + 'm';
      if (txt !== L.last) { L.last = txt; L.dist.textContent = txt; }
    }
    this.show('spectate', !!view.spectating);
    if (view.spectating) this.set('specName', p.name);
    if (view.fps !== undefined) this.set('fps', view.fps);
    this.drawCompass(view.cam.yaw);
    this.drawMinimap(p, view.cam.yaw);
    if (this.bigMapOpen) this.drawBigMap(p);
  },

  // ------------------------------------------------------------------ squad mode
  // The player's team: a row each in the panel (how far off, or what has happened to them; shield and health), a name tag
  // over each of them in the world, and - when the character on screen is down - what is being done about it.
  // p = view.player is the character on screen (the player, or whoever is being watched); the team is always the player's.
  _mateState(m) {
    if (!m.alive) return 'dead';
    if (m.mode === 'down') return m.reviver ? 'helped' : 'down';
    return '';
  },
  updateSquad(view, sp, down) {
    const me = Game.player, p = view.player, on = Game.squad && !!me && !!me.squad;
    this.show('squad', on);
    this.show('mapMates', on);
    if (!on) { for (const T of this.mateTags) if (T.shown) { T.shown = false; T.el.style.display = 'none'; } this.show('down', false); return; }
    const team = me.squad.members, world = !this.bigMapOpen && !view.scoped && p.mode !== 'plane';      // (nothing floats over the full map or the scope)
    for (let i = 0, k = 0; i < team.length && k < this.mates.length; i++) {
      const m = team[i];
      if (m === me) continue;
      const R = this.mates[k], T = this.mateTags[k++], st = this._mateState(m);
      const d = Math.hypot(m.x - p.x, m.z - p.z), far = Math.round(d) + 'm';
      // ---- the row
      let info = far;
      if (st === 'dead') info = '사망';
      else if (st === 'helped') info = '소생 중';
      else if (st === 'down') info = '기절 ' + Math.ceil(m.hp / m.bleed) + '초';
      else if (m.reviving) info = '살리는 중';
      else if (m === p) info = '관전 중';
      else if (m.mode === 'plane') info = '수송기';
      else if (m.mode === 'drive') info = '탑승 · ' + far;
      const hp = st === 'dead' ? 0 : st ? m.hp / SQUAD.downHp : m.hp / CFG.MAX_HP;
      const c = R.c, set = (key, val, fn) => { if (c[key] !== val) { c[key] = val; fn(val); } };
      set('name', m.name, v => { R.name.textContent = v; });
      set('info', info, v => { R.info.textContent = v; });
      set('hp', Math.round(clamp01(hp) * 100) + '%', v => { R.hp.style.width = v; });
      set('sh', (st ? 0 : Math.round(clamp01(m.shield / CFG.MAX_SHIELD) * 100)) + '%', v => { R.sh.style.width = v; });
      set('cls', 'mate' + (st ? ' ' + st : m.hp < 35 ? ' low' : ''), v => { R.el.className = v; });
      // ---- the tag in the world: over their head while in view, for somebody who is down also at the rim showing the way
      const lying = st === 'down' || st === 'helped';
      let show = world && st !== 'dead' && m !== p && m.mode !== 'plane', mx = 0, my = 0, th = Math.PI;
      const label = lying ? (st === 'helped' ? '소생 중 · ' : '기절 · ') + m.name : m.name, dist = lying || d > 12 ? far : '';
      const half = 12 + label.length * 6.5 + dist.length * 4;
      if (show) {
        const inView = this.project(m.x, m.y + (lying ? 0.9 : m.mode === 'drive' ? 1.75 : m.crouch ? 1.65 : 2.1), m.z, sp) && sp[0] > half + 6 && sp[0] < this.vw - half - 6 && sp[1] > 70 && sp[1] < this.vh - 150;
        if (inView) { mx = sp[0]; my = sp[1] - 16; }
        else if (lying) {
          const ang = Math.atan2(m.x - p.x, m.z - p.z) - view.cam.yaw, up = Math.cos(ang);
          const ry = Math.max(40, Math.min(this.vh * 0.3, up > 0 ? this.vh * 0.33 - 60 : this.vh / 2 - 215));
          mx = this.vw / 2 - Math.sin(ang) * this.vw * 0.4; my = this.vh / 2 - up * ry; th = -ang;
        } else show = false;
        if (show && !lying && d < 2.5) show = false;                 // (no label in the face of somebody standing right there)
      }
      if (show !== T.shown) { T.shown = show; T.el.style.display = show ? 'flex' : 'none'; }
      if (!show) continue;
      const tc = T.c, tset = (key, val, fn) => { if (tc[key] !== val) { tc[key] = val; fn(val); } };
      tset('name', label, v => { T.name.textContent = v; });
      tset('dist', dist, v => { T.dist.textContent = v; });
      tset('cls', 'mateTag' + (lying ? ' ' + st : ''), v => { T.el.className = v; });
      const reach = 1 / Math.hypot(Math.sin(th) / (half + 10), Math.cos(th) / (lying ? 23 : 19));
      T.el.style.transform = `translate(${mx.toFixed(0)}px, ${my.toFixed(0)}px) translate(-50%, -50%)`;
      T.arrow.style.transform = `rotate(${(th * 180 / Math.PI).toFixed(0)}deg) translateY(${(-reach).toFixed(0)}px)`;
    }
    // ---- down: how long is left, who is nearest, or who is at work
    const mine = down && !view.spectating;
    this.show('down', mine);
    if (!mine) return;
    const by = p.reviver;
    this.cls('down', 'helped', !!by);
    if (by) {
      this.set('downTitle', '소생 중');
      this.style('downBar', 'width', Math.round(clamp01(1 - by.reviveT / by.reviveTotal) * 100) + '%');
      this.set('downText', by.name + ' — 일으켜 세우는 중입니다');
      return;
    }
    let near = null, nd = 1e9;
    for (const m of team) { if (m === p || !m.alive || m.mode === 'down') continue; const d = Math.hypot(m.x - p.x, m.z - p.z); if (d < nd) { nd = d; near = m; } }
    this.set('downTitle', '기절');
    this.style('downBar', 'width', Math.round(clamp01(p.hp / SQUAD.downHp) * 100) + '%');
    // (a team-mate right there in plan but a floor up or down cannot reach: bots find their way on the ground only)
    const floors = near && nd < 8 && Math.abs(near.y - p.y) > 1.8, coming = near && !floors && near.bot && near.bot.state === 'revive';
    this.set('downText', (near ? near.name + ' · ' + Math.round(nd) + 'm' + (floors ? ' — 다른 층에 있습니다. 같은 층으로 기어가세요' : coming ? ' — 살리러 오는 중' : ' — 가장 가까운 팀원') : '') + ' · 남은 시간 ' + Math.ceil(p.hp / p.bleed) + '초');
  },
  // team-mates on a map: a dot in their colour, ringed in red when they are down; kept at the rim when outside the window
  _matesOnMap(c, ox, oy, s, W, rim, r) {
    const me = Game.player;
    if (!Game.squad || !me || !me.squad) return;
    let k = 0;
    for (const m of me.squad.members) {
      if (m === me) continue;
      const tint = SQUAD_TINTS[k++ % SQUAD_TINTS.length];
      if (!m.alive) continue;
      let x = ox + m.x * s, y = oy + m.z * s;
      if (rim > 0) { const dx = x - W / 2, dy = y - W / 2, d = Math.hypot(dx, dy); if (d > rim) { x = W / 2 + dx / d * rim; y = W / 2 + dy / d * rim; } }
      if (m.mode === 'down') { c.strokeStyle = '#ff5a4a'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 3.5, 0, TAU); c.stroke(); }
      c.beginPath(); c.arc(x, y, r, 0, TAU);
      c.lineWidth = 1.5; c.strokeStyle = '#0a1820'; c.stroke();
      c.fillStyle = tint; c.fill();
    }
  },

  drawCompass(yaw) {
    const c = this.comp, W = 520, H = 34;
    c.clearRect(0, 0, W, H);
    const bearing = ((180 - yaw * 180 / Math.PI) % 360 + 360) % 360;
    const pxPerDeg = 3.4;
    c.textAlign = 'center'; c.textBaseline = 'top';
    const NAMES = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let d = Math.floor((bearing - 80) / 5) * 5; d <= bearing + 80; d += 5) {
      const x = W / 2 + (d - bearing) * pxPerDeg;
      const dd = ((d % 360) + 360) % 360;
      const a = 1 - Math.abs(x - W / 2) / (W / 2);
      if (a <= 0) continue;
      c.globalAlpha = Math.min(1, a * 1.6);
      if (dd % 45 === 0) {
        c.fillStyle = dd === 0 ? '#ff6a5a' : '#ffffff'; c.font = '700 14px system-ui, sans-serif';
        c.fillText(NAMES[dd], x, 12);
        c.fillRect(x - 1, 0, 2, 9);
      } else if (dd % 15 === 0) {
        c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '500 10px system-ui, sans-serif';
        c.fillText(String(dd), x, 14); c.fillRect(x - 0.5, 0, 1, 7);
      } else { c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x - 0.5, 0, 1, 4); }
    }
    c.globalAlpha = 1;
    c.fillStyle = '#5ef2c5'; c.beginPath(); c.moveTo(W / 2 - 5, H); c.lineTo(W / 2 + 5, H); c.lineTo(W / 2, H - 7); c.closePath(); c.fill();
  },

  _zoneOnMap(c, ox, oy, s, lw) {
    // ox, oy: canvas position of world (0,0); s: pixels per metre
    if (Game.state === 'idle') return;
    c.lineWidth = lw;
    if (!Zone.done && Zone.toR > 0.5) {
      c.setLineDash([lw * 3, lw * 3]); c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.beginPath(); c.arc(ox + Zone.toX * s, oy + Zone.toZ * s, Math.max(1, Zone.toR * s), 0, TAU); c.stroke();
      c.setLineDash([]);
    }
    if (Zone.r > 0.5) {
      // shade everything outside the current zone
      c.save();
      c.beginPath(); c.rect(0, 0, c.canvas.width, c.canvas.height); c.arc(ox + Zone.x * s, oy + Zone.z * s, Zone.r * s, 0, TAU, true);
      c.fillStyle = 'rgba(70,255,200,0.2)'; c.fill('evenodd');
      c.restore();
      c.strokeStyle = '#5ef2c5'; c.beginPath(); c.arc(ox + Zone.x * s, oy + Zone.z * s, Zone.r * s, 0, TAU); c.stroke();
    }
  },
  drawMinimap(p, yaw) {
    const c = this.mini, W = 220, R = 105;            // shows a 210 m wide window, north up
    const ms = this.MAP / Terrain.SIZE;               // map pixels per metre
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 2, 0, TAU); c.clip();
    c.fillStyle = '#0d3550'; c.fillRect(0, 0, W, W);
    const s = W / (2 * R);
    if (this.map) c.drawImage(this.map, (p.x - R + Terrain.HALF) * ms, (p.z - R + Terrain.HALF) * ms, 2 * R * ms, 2 * R * ms, 0, 0, W, W);
    const ox = W / 2 - p.x * s, oy = W / 2 - p.z * s;
    this._zoneOnMap(c, ox, oy, s, 2);
    // guide line to the next zone when outside it
    if (Game.state === 'playing' && !Zone.done && Zone.nextDist(p.x, p.z) > 0) {
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.5; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(W / 2, W / 2); c.lineTo(ox + Zone.toX * s, oy + Zone.toZ * s); c.stroke(); c.setLineDash([]);
    }
    for (const d of Game.airdrops) {
      if (d.chest && d.chest.opened) continue;
      const x = clamp(ox + d.x * s, 10, W - 10), y = clamp(oy + d.z * s, 10, W - 10);
      c.fillStyle = '#ff9d3c'; c.fillRect(x - 5, y - 5, 10, 10); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(x - 5, y - 5, 10, 10);
    }
    for (const v of Vehicles.list) {                  // vehicles nobody sits in
      if (!v.alive || v.driver) continue;
      const x = ox + v.x * s, y = oy + v.z * s;
      if (x > 6 && y > 6 && x < W - 6 && y < W - 6) this._vehMark(c, x, y, 4.4);
    }
    for (const g of this.pings) {
      const x = ox + g.x * s, y = oy + g.z * s;
      c.globalAlpha = clamp01(g.t / 0.8);
      c.fillStyle = g.kind === 1 ? '#ffd24a' : '#ff5a4a';
      c.beginPath(); c.arc(x, y, g.kind === 1 ? 5 : 3.2, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    this._matesOnMap(c, ox, oy, s, W, W / 2 - 9, 4.6);
    // player arrow (yaw 0 = +z = south = down on the map)
    c.translate(W / 2, W / 2); c.rotate(Math.PI - yaw);
    c.fillStyle = '#ffffff'; c.strokeStyle = '#0a1820'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6.5, 7); c.lineTo(0, 3.5); c.lineTo(-6.5, 7); c.closePath(); c.stroke(); c.fill();
    c.restore();
  },
  // a small diamond: a vehicle on the map
  _vehMark(c, x, y, r) {
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath();
    c.lineWidth = 1.5; c.strokeStyle = '#0a1820'; c.stroke();
    c.fillStyle = '#bfe3ff'; c.fill();
  },
  drawBigMap(p) {
    const c = this.big, W = 760;
    const s = W / Terrain.SIZE;
    c.clearRect(0, 0, W, W);
    if (this.map) c.drawImage(this.map, 0, 0, W, W);
    const ox = W / 2, oy = W / 2;
    this._zoneOnMap(c, ox, oy, s, 2.5);
    // flight path
    const pl = Game.plane;
    if (pl && pl.active) {
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 2; c.setLineDash([10, 8]);
      c.beginPath(); c.moveTo(ox + (pl.sx + pl.dx * pl.dropStart) * s, oy + (pl.sz + pl.dz * pl.dropStart) * s); c.lineTo(ox + (pl.sx + pl.dx * pl.dropEnd) * s, oy + (pl.sz + pl.dz * pl.dropEnd) * s); c.stroke(); c.setLineDash([]);
      c.save(); c.translate(ox + pl.x * s, oy + pl.z * s); c.rotate(Math.PI - pl.yaw);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -11); c.lineTo(9, 9); c.lineTo(0, 4); c.lineTo(-9, 9); c.closePath(); c.fill(); c.restore();
    }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 14px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
    for (const q of Terrain.pois) {
      const x = ox + q.x * s, y = oy + q.z * s - q.r * s * 0.55 - 6;
      c.lineWidth = 4; c.strokeStyle = 'rgba(8,18,26,0.85)'; c.strokeText(q.name, x, y);
      c.fillStyle = '#f3fbff'; c.fillText(q.name, x, y);
    }
    for (const d of Game.airdrops) {
      if (d.chest && d.chest.opened) continue;
      const x = ox + d.x * s, y = oy + d.z * s;
      c.fillStyle = '#ff9d3c'; c.fillRect(x - 6, y - 6, 12, 12); c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(x - 6, y - 6, 12, 12);
    }
    for (const v of Vehicles.list) if (v.alive && !v.driver) this._vehMark(c, ox + v.x * s, oy + v.z * s, 4.6);
    this._matesOnMap(c, ox, oy, s, W, 0, 5.5);
    if (p) {
      c.save(); c.translate(ox + p.x * s, oy + p.z * s); c.rotate(Math.PI - p.aimYaw);
      c.fillStyle = '#5ef2c5'; c.strokeStyle = '#06222a'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4.5); c.lineTo(-8, 9); c.closePath(); c.stroke(); c.fill(); c.restore();
    }
  },
  toggleBigMap(on) {
    this.bigMapOpen = on === undefined ? !this.bigMapOpen : on;
    this.show('bigmap', this.bigMapOpen);
  },
  reset() {
    for (const f of this.feed) f.el.remove();
    for (const f of this.toasts) f.el.remove();
    this.feed = []; this.toasts = []; this.announceQ = []; this.announceT = 0; this.pings = [];
    for (const n of this.nums) n.t = 0;
    for (const n of this.dirs) n.t = 0;
    for (const L of this.labels) { L.shown = false; L.el.style.display = 'none'; }
    for (const T of this.tags) { T.shown = false; T.el.style.display = 'none'; }
    for (const T of this.mateTags) { T.shown = false; T.el.style.display = 'none'; }
    this.cls('announce', 'show', false);
    this.toggleBigMap(false);
  },
};
