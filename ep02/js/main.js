// AURORA FALL — application glue: boot, main loop, camera, player input, presentation, menus
'use strict';

const App = {
  mode: 'loading',          // loading | menu | play
  paused: false, time: 0, last: 0, errors: 0,
  settings: { quality: 'high', sens: 1, volume: 0.8, music: 0.55, difficulty: 'normal', name: '플레이어', color: 4, games: 0, wins: 0, bestPlace: 0, bestKills: 0,
    mode: 'solo', sGames: 0, sWins: 0, sBestPlace: 0, sBestKills: 0,                      // solo or squad; the squad record is kept apart (placements there are out of ten teams)
    guide: true, seenChest: 0, seenWeapon: 0, seenHeal: 0, seenCell: 0, seenRide: 0, seenRevive: 0 },   // beginner guidance: on/off and how often each taught action has been done
  cam: { pos: [0, 60, 0], fwd: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], view: m4.create(), proj: m4.create(), viewProj: m4.create(), invViewProj: m4.create(), yaw: 0, pitch: 0, fov: CFG.FOV },
  env: Env.make(), frustum: makeFrustum(),
  scene: null,
  spec: null, shake: 0, dmgFlash: 0, recoilBack: 0, zoneTint: 0, slowmo: 0,
  camDist: CFG.CAM_DIST, pivotY: CFG.EYE_HEIGHT, crouchToggle: false, scoped: false, enemyAim: false,
  endShown: false, endTimer: -1, won: false, spectating: false,
  fpsAcc: 0, fpsN: 0, fpsText: '', slowT: 0, fastT: 0, scaleUps: 0, tod: 0.95,
  gov: { fullMs: 0, capMs: 0 }, lost: false,
  landed: false, guardFxT: 0, guardSfxT: 0, lookIdle: 0, vehSfxT: 0,
  flashes: [], lights: [], _cand: [],          // short-lived lights (muzzle flashes, explosions) and the four lights sent to the renderer
  el: {},
};

// ------------------------------------------------------------------ helpers
function $id(id) { const e = document.getElementById(id); if (!e) throw new Error('missing element #' + id); return e; }
function fatal(err) {
  const msg = (err && err.message) ? err.message : String(err);
  try {
    $id('fatalText').textContent = msg + (err && err.stack ? '\n\n' + err.stack.split('\n').slice(0, 6).join('\n') : '');
    $id('fatal').classList.remove('hidden'); $id('loading').classList.add('hidden');
  } catch (e) { /* nothing else we can do */ }
  if (typeof console !== 'undefined') console.error(err);
}
function loadSettings() {
  try {
    const raw = window.localStorage.getItem('aurorafall.settings');
    if (raw) { const s = JSON.parse(raw); for (const k in App.settings) if (typeof s[k] === typeof App.settings[k]) App.settings[k] = s[k]; }
  } catch (e) { /* storage may be unavailable on file:// in some browsers */ }
}
function saveSettings() { try { window.localStorage.setItem('aurorafall.settings', JSON.stringify(App.settings)); } catch (e) { /* ignore */ } }
// ---- beginner guidance and the saved settings
function applyGuideSettings() {
  const s = App.settings;
  Guide.enabled = s.guide;
  Guide.seen.chest = s.seenChest; Guide.seen.weapon = s.seenWeapon; Guide.seen.heal = s.seenHeal; Guide.seen.cell = s.seenCell; Guide.seen.ride = s.seenRide; Guide.seen.revive = s.seenRevive;
}
function guideNote(what) {
  Guide.note(what);
  const s = App.settings, g = Guide.seen;
  s.seenChest = g.chest; s.seenWeapon = g.weapon; s.seenHeal = g.heal; s.seenCell = g.cell; s.seenRide = g.ride; s.seenRevive = g.revive;
  saveSettings();
}
function showGuideSwitch() {
  for (const id of ['btnGuide', 'pGuide']) { const b = App.el[id]; b.textContent = '게임 중 안내: ' + (App.settings.guide ? '켬' : '끔'); b.classList.toggle('off', !App.settings.guide); }
}
function toggleGuide() {
  const s = App.settings;
  s.guide = !s.guide;
  if (s.guide) { s.seenChest = s.seenWeapon = s.seenHeal = s.seenCell = s.seenRide = s.seenRevive = 0; }      // switching it back on replays every hint
  applyGuideSettings(); saveSettings(); showGuideSwitch();
}
// What to do differently next time (shown on the result panel after a loss).
function deathTip(p) {
  if (Game.squad && p.downs > 0) {      // went down first: what would have got them back up
    let near = 1e9;
    for (const m of p.squad.members) if (m !== p) near = Math.min(near, Math.hypot(m.x - p.deathPos[0], m.z - p.deathPos[2]));
    if (near > 45) return '팀원과 ' + Math.round(near) + 'm 떨어진 곳에서 쓰러졌습니다. 팀원 곁에서 싸우면 기절해도 금방 일으켜 줍니다.';
    if (Zone.outside(p.deathPos[0], p.deathPos[2])) return '오로라 장벽 밖에서 쓰러지면 팀원도 구하러 오기 어렵습니다. 장벽이 닫히기 전에 팀과 함께 안쪽으로 이동하세요.';
    return '기절하면 W A S D로 엄폐물 뒤로 기어가세요. 팀원이 5초 동안 곁에 있어야 다시 일어납니다.';
  }
  if (p.killWeapon === 'blast') return '불이 붙은 탈것은 몇 초 뒤 폭발합니다. 연기와 불꽃이 보이면 F로 바로 내려서 멀리 떨어지세요.';
  if (p.killWeapon === 'vehicle') return '달려오는 탈것은 엔진 소리로 먼저 알 수 있습니다. 탁 트인 길 한가운데를 피하고 나무나 건물 옆으로 비키세요.';
  if (p.killer === p) return '수류탄은 던지고 ' + GRENADE.fuse + '초 뒤에 터집니다. 벽에 튕겨 돌아오지 않게 거리를 두고 던지세요.';
  if (!p.killer) return '오로라 장벽 밖에서는 계속 피해를 받습니다. 미니맵의 흰 점선 원(다음 안전 구역) 안으로 미리 이동하세요.';
  if (!p.hasGun()) return '무기 없이 쓰러졌습니다. 착지 보호가 끝나기 전에 화살표가 가리키는 상자를 F로 열어 무기부터 챙기세요.';
  const meds = p.heals.bandage + p.heals.medkit;
  if (meds > 0) return '회복 아이템이 ' + meds + '개 남아 있었습니다. 체력이 줄면 엄폐물 뒤에서 4(붕대) · 5(구급상자)로 회복하세요.';
  if (p.heals.cell > 0) return '실드 셀이 ' + p.heals.cell + '개 남아 있었습니다. 교전 전에 6으로 실드를 채워 두면 훨씬 오래 버팁니다.';
  return '불리한 교전은 건물이나 바위 뒤로 피해 끊으세요. 상자에서 붕대와 실드 셀을 챙겨 두면 다시 싸울 수 있습니다.';
}

// ------------------------------------------------------------------ camera
function buildCamera(fovDeg) {
  const c = App.cam, cp = Math.cos(c.pitch);
  c.fwd[0] = Math.sin(c.yaw) * cp; c.fwd[1] = Math.sin(c.pitch); c.fwd[2] = Math.cos(c.yaw) * cp;
  c.fov = fovDeg;
  m4.lookAt(c.view, c.pos[0], c.pos[1], c.pos[2], c.pos[0] + c.fwd[0], c.pos[1] + c.fwd[1], c.pos[2] + c.fwd[2], 0, 1, 0);
  const cv = Renderer.canvas;
  m4.perspective(c.proj, fovDeg * DEG, cv.width / Math.max(1, cv.height), 0.2, 1900);
  m4.multiply(c.viewProj, c.proj, c.view);
  m4.invert(c.invViewProj, c.viewProj);
  c.right[0] = c.view[0]; c.right[1] = c.view[4]; c.right[2] = c.view[8];
  c.up[0] = c.view[1]; c.up[1] = c.view[5]; c.up[2] = c.view[9];
  App.frustum.set(c.viewProj);
}
function lookAtPoint(px, py, pz, tx, ty, tz) {
  const c = App.cam;
  c.pos[0] = px; c.pos[1] = py; c.pos[2] = pz;
  const dx = tx - px, dy = ty - py, dz = tz - pz;
  c.yaw = Math.atan2(dx, dz); c.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}
// Third-person camera behind `ch`. yaw/pitch come from App.cam.
function chaseCamera(ch, dist, shoulder, lift, dt, snap) {
  const c = App.cam;
  const eye = ch.mode === 'ground' ? (ch.swimming ? 1.3 : ch.crouch ? CFG.CROUCH_EYE : CFG.EYE_HEIGHT) : ch.mode === 'down' && !ch.swimming ? 0.65 : 1.3;
  App.pivotY = snap ? eye : dampTo(App.pivotY, eye, 12, dt);
  App.camDist = snap ? dist : dampTo(App.camDist, dist, 10, dt);
  const cp = Math.cos(c.pitch), fx = Math.sin(c.yaw) * cp, fy = Math.sin(c.pitch), fz = Math.cos(c.yaw) * cp;
  const rx = -Math.cos(c.yaw), rz = Math.sin(c.yaw);
  const px = ch.x, py = ch.y + App.pivotY + 0.12, pz = ch.z;
  let tx = px + rx * shoulder - fx * App.camDist, ty = py + lift - fy * App.camDist, tz = pz + rz * shoulder - fz * App.camDist;
  // keep the camera out of walls and terrain
  let dx = tx - px, dy = ty - py, dz = tz - pz;
  const len = Math.hypot(dx, dy, dz);
  if (len > 0.05) {
    dx /= len; dy /= len; dz /= len;
    const t = Phys.raycast(px, py, pz, dx, dy, dz, len + 0.3, F_BULLET);
    if (Phys.hit.kind) { const k = Math.max(0.25, t - 0.3); tx = px + dx * k; ty = py + dy * k; tz = pz + dz * k; }
  }
  const floor = Math.max(Terrain.height(tx, tz), 0) + 0.3;
  if (ty < floor) ty = floor;
  c.pos[0] = tx; c.pos[1] = ty; c.pos[2] = tz;
}
function fovForZoom(zoom) { return 2 * Math.atan(Math.tan(CFG.FOV * DEG / 2) / zoom) / DEG; }

function updateCamera(dt, snap) {
  const c = App.cam, p = Game.player;
  let fov = CFG.FOV;
  App.scoped = false;
  if (App.mode === 'menu') {
    const q = Terrain.pois[0], a = App.time * 0.045 + 0.6;
    lookAtPoint(q.x + Math.cos(a) * 165, q.y + 34, q.z + Math.sin(a) * 165, q.x, q.y + 30, q.z);
    buildCamera(58);
    return;
  }
  const target = App.spectating ? App.spec : p;
  if (!target) { buildCamera(fov); return; }
  if (App.won || (App.spectating && Game.state === 'ended')) {
    const w = Game.winner || target;
    c.yaw = App.time * 0.4; c.pitch = -0.18;
    chaseCamera(w, 5.2, 0, 0.2, dt, snap);
    buildCamera(58);
    return;
  }
  if (App.spectating) {
    c.yaw = dampAngle(c.yaw, target.aimYaw, 5, dt); c.pitch = dampTo(c.pitch, clamp(target.aimPitch * 0.6 - 0.12, -0.9, 0.5), 5, dt);
    chaseCamera(target, target.mode === 'ground' || target.mode === 'down' ? 4.2 : 7, 0.5, 0.3, dt, snap);
    buildCamera(fov);
    return;
  }
  if (p.mode === 'plane') {
    const pl = Game.plane;
    const cp = Math.cos(c.pitch), fx = Math.sin(c.yaw) * cp, fy = Math.sin(c.pitch), fz = Math.cos(c.yaw) * cp;
    c.pos[0] = pl.x - fx * 46; c.pos[1] = pl.y + 7 - fy * 46; c.pos[2] = pl.z - fz * 46;
    buildCamera(62);
    return;
  }
  if (p.mode === 'fall' || p.mode === 'glide') {
    chaseCamera(p, p.mode === 'fall' ? 7.5 : 6.5, 0, 0.9, dt, snap);
    buildCamera(p.mode === 'fall' ? 74 : 68);
    return;
  }
  if (!p.alive) { // brief death cam before the result screen
    c.pitch = dampTo(c.pitch, -0.5, 3, dt);
    chaseCamera(p, 5.5, 0, 0.4, dt, snap);
    buildCamera(fov);
    return;
  }
  if (p.mode === 'down') { // knocked down (squad mode): from above and behind, free to look round for the team-mates
    chaseCamera(p, 4.0, 0, 0.7, dt, snap);
    buildCamera(fov);
    return;
  }
  if (p.mode === 'drive' && p.vehicle) { // behind and above the vehicle, further back and wider the faster it goes
    const v = p.vehicle, sp = Math.abs(v.speed);
    const want = CFG.FOV + 9 * clamp01(sp / v.def.maxSpeed);
    App.fovCur = snap || !App.fovCur ? want : dampTo(App.fovCur, want, 4, dt);
    chaseCamera(p, v.def.cam + sp * 0.07, 0, 0.7, dt, snap);
    buildCamera(App.fovCur);
    return;
  }
  const def = p.def(), ads = p.in.ads && def.kind === 'gun' && p.reloadT <= 0;
  if (ads && def.scope) {
    App.scoped = true;
    const ey = p.eyeY();
    c.pos[0] = p.x + Math.sin(c.yaw) * 0.25; c.pos[1] = ey + 0.02; c.pos[2] = p.z + Math.cos(c.yaw) * 0.25;
    App.fovCur = fovForZoom(def.zoom);
    buildCamera(App.fovCur);
    return;
  }
  const want = ads ? fovForZoom(def.zoom) : (p.sprinting ? CFG.FOV + 6 : CFG.FOV);
  App.fovCur = snap || !App.fovCur ? want : dampTo(App.fovCur, want, 14, dt);
  chaseCamera(p, ads ? 1.65 : CFG.CAM_DIST, ads ? 0.5 : CFG.CAM_SHOULDER, CFG.CAM_HEIGHT, dt, snap);
  buildCamera(App.fovCur);
}

// World point under the crosshair (what the player's shots converge on).
function computeAim() {
  const p = Game.player, c = App.cam;
  App.enemyAim = false;
  if (!p || !p.alive || p.mode !== 'ground') { if (p) p.aimPoint = null; return; }
  const ox = c.pos[0], oy = c.pos[1], oz = c.pos[2], dx = c.fwd[0], dy = c.fwd[1], dz = c.fwd[2];
  const t0 = Math.max(0, (p.x - ox) * dx + (p.eyeY() - oy) * dy + (p.z - oz) * dz) + 0.35;
  let t = t0 + Phys.raycast(ox + dx * t0, oy + dy * t0, oz + dz * t0, dx, dy, dz, 480, F_BULLET);
  const tv = Vehicles.rayHit(ox + dx * t0, oy + dy * t0, oz + dz * t0, dx, dy, dz, t - t0, null);      // a hull is as solid as a wall
  if (tv >= 0 && t0 + tv < t) t = t0 + tv;
  const tc = Combat.rayChars(ox, oy, oz, dx, dy, dz, t, p, t0);
  if (tc >= 0) { t = tc; App.enemyAim = tc - t0 < (p.def().range || 3); }
  if (!p.aimPoint) p.aimPoint = [0, 0, 0];
  p.aimPoint[0] = ox + dx * t; p.aimPoint[1] = oy + dy * t; p.aimPoint[2] = oz + dz * t;
}

// ------------------------------------------------------------------ player input
function updatePlayerInput(dt) {
  const p = Game.player, c = App.cam, inp = p.in;
  const active = Input.locked && !App.paused;
  if (active) {
    const sens = 0.0022 * App.settings.sens * (App.scoped ? 0.32 : (inp.ads ? 0.7 : 1));
    c.yaw = wrapAngle(c.yaw - Input.dx * sens);
    c.pitch = clamp(c.pitch - Input.dy * sens, -1.45, 1.45);
  }
  // weapon recoil kicks the view, then settles back most of the way
  if (p.recoilP || p.recoilY) {
    c.pitch = clamp(c.pitch + p.recoilP, -1.45, 1.45); c.yaw = wrapAngle(c.yaw + p.recoilY);
    App.recoilBack += p.recoilP * 0.55;
    p.recoilP = 0; p.recoilY = 0;
  }
  if (App.recoilBack > 0) { const r = Math.min(App.recoilBack, dt * 0.5 + App.recoilBack * dt * 5); c.pitch -= r; App.recoilBack -= r; }
  // At the wheel the mouse looks around freely; left alone for a moment while moving, the view swings back behind the vehicle.
  if (active && (Input.dx || Input.dy)) App.lookIdle = 0; else App.lookIdle += dt;
  if (p.mode === 'drive' && p.vehicle && p.alive && App.lookIdle > 1.1 && Math.abs(p.vehicle.speed) > 2.5) {
    c.yaw = dampAngle(c.yaw, p.vehicle.yaw, 2.4, dt); c.pitch = dampTo(c.pitch, -0.16, 1.6, dt);
  }
  inp.aimYaw = c.yaw; inp.aimPitch = c.pitch;
  inp.mx = 0; inp.mz = 0; inp.sprint = false; inp.jump = false; inp.fire = false; inp.firePressed = false; inp.ads = false;
  inp.reload = false; inp.use = null; inp.nade = false; inp.slot = -1; inp.drive = 0; inp.steer = 0; inp.brake = false;
  if (!active || !p.alive) return;
  const f = (Input.down('KeyW') || Input.down('ArrowUp') ? 1 : 0) - (Input.down('KeyS') || Input.down('ArrowDown') ? 1 : 0);
  const s = (Input.down('KeyD') || Input.down('ArrowRight') ? 1 : 0) - (Input.down('KeyA') || Input.down('ArrowLeft') ? 1 : 0);
  if (p.mode === 'drive') {                          // W S: throttle / brake and reverse, A D: steer, Space: handbrake, F: get out
    inp.drive = f; inp.steer = s; inp.brake = Input.down('Space');
    App.crouchToggle = false;
    inp.reload = Input.hit('KeyR');
    if (Input.hit('Digit1')) inp.slot = 0; else if (Input.hit('Digit2')) inp.slot = 1; else if (Input.hit('Digit3')) inp.slot = 2;
    if (Input.hit('KeyF') || Input.hit('KeyE')) Game.wantInteract = true;
    return;
  }
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = -fz, rz = fx;
  inp.mx = fx * f + rx * s; inp.mz = fz * f + rz * s;
  if (p.mode === 'down') { App.crouchToggle = false; inp.crouch = false; return; }      // knocked down (squad mode): crawling is all there is
  inp.sprint = Input.down('ShiftLeft') || Input.down('ShiftRight');
  if (Input.hit('KeyC')) App.crouchToggle = !App.crouchToggle;
  if (inp.sprint || p.mode !== 'ground') App.crouchToggle = false;
  inp.crouch = App.crouchToggle;
  if (p.mode === 'plane') { if (Input.hit('Space') || Input.hit('KeyF')) Game.wantJump = true; }
  else if (p.mode === 'fall') inp.jump = Input.hit('Space');
  else {
    inp.jump = Input.hit('Space');
    if (inp.jump) App.crouchToggle = false;
    inp.fire = Input.buttons[0]; inp.firePressed = Input.clicked[0];
    inp.ads = Input.buttons[2];
    inp.reload = Input.hit('KeyR');
    if (Input.hit('Digit1')) inp.slot = 0; else if (Input.hit('Digit2')) inp.slot = 1; else if (Input.hit('Digit3')) inp.slot = 2;
    else if (Input.wheel) {
      // cycle through occupied slots
      for (let k = 1; k <= 3; k++) { const sIdx = ((p.slot + Math.sign(Input.wheel) * k) % 3 + 3) % 3; if (p.weapons[sIdx]) { inp.slot = sIdx; break; } }
    }
    if (Input.hit('Digit4')) inp.use = 'bandage'; else if (Input.hit('Digit5')) inp.use = 'medkit'; else if (Input.hit('Digit6')) inp.use = 'cell';
    if (Input.hit('KeyQ')) inp.use = Guide.bestHeal(p, true) || null;      // the same choice the highlighted slot shows
    inp.nade = Input.hit('KeyG');
    if (Input.hit('KeyF') || Input.hit('KeyE')) Game.wantInteract = true;
  }
}

// ------------------------------------------------------------------ presentation (models + effects for this frame)
const _sp = [0, 0, 0];
function present(dt) {
  const c = App.cam, cx = c.pos[0], cy = c.pos[1], cz = c.pos[2], time = App.time, env = App.env, fr = App.frustum;
  resetBatches();
  FX.beginFrame();
  FX.light = Math.min(1.6, (env.ambSky[0] + env.ambSky[1] + env.ambSky[2]) * 0.5 + (env.sunColor[0] + env.sunColor[1] + env.sunColor[2]) * 0.14);
  FX.update(dt);
  const night = env.night;
  // ---- props
  for (const w of World.props.windmills) if (dist2D(w.x, w.z, cx, cz) < 420) CharModel.drawWindmill(w, time);
  const lh = World.props.lighthouse;
  if (lh) {
    const a = time * 0.5, k = 0.25 + night * 0.75;
    for (const s of [1, -1]) FX.beam(lh.x + Math.cos(a) * 150 * s, lh.y - 4, lh.z + Math.sin(a) * 150 * s, lh.x, lh.y, lh.z, 3.2, 1.2 * k, 1.0 * k, 0.55 * k, 0.5, 1.4);
    FX.sprite(lh.x, lh.y, lh.z, 5, 2.4 * k, 2.0 * k, 1.1 * k, 1, 0);
  }
  for (const f of World.props.campfires) {
    const d = dist2D(f.x, f.z, cx, cz);
    if (d < 90) FX.fire(f.x, f.y, f.z, dt);
    if (d < 260) FX.sprite(f.x, f.y + 0.3, f.z, 1.6 + Math.sin(time * 9 + f.x) * 0.2, 2.2, 1.1, 0.3, 0.8, 0);
  }
  for (const b of World.props.beacons) {
    if (dist2D(b.x, b.z, cx, cz) > 420) continue;
    const col = b.color === 0xff4030 ? [3.2, 0.5, 0.3] : [0.5, 3.0, 2.4];
    const pulse = b.color === 0xff4030 ? (Math.sin(time * 3 + b.x) > 0.2 ? 1 : 0.15) : 0.8 + 0.2 * Math.sin(time * 2 + b.x);
    FX.sprite(b.x, b.y, b.z, b.color === 0xff4030 ? 1.4 : 2.6, col[0] * pulse, col[1] * pulse, col[2] * pulse, 0.9, 0);
  }
  if (App.mode !== 'play' || Game.state === 'idle') { FX.ambient(cx, cy, cz, dt, night, false); return; }
  // ---- plane
  if (Game.plane && Game.plane.active) CharModel.drawPlane(Game.plane, time);
  // ---- characters
  const hideSelf = App.scoped && !App.spectating, reach = Renderer.shadowReach(1.9, env);      // (someone just outside the view still casts a shadow into it)
  for (const ch of Game.chars) {
    if (ch.mode === 'plane') continue;
    if (hideSelf && ch === Game.player) continue;
    const d = dist3D(ch.x, ch.y, ch.z, cx, cy, cz);
    if (d > 460 || !fr.sphere(ch.x, ch.y + 1.2, ch.z, 3.2 + (d < 70 ? reach : 0))) continue;
    CharModel.drawCharacter(ch, time, dt, d > 42);
    if (ch.reviver && d < 70 && FX.rng() < dt * 7) FX.sparkle(ch.x, ch.y + 0.4, ch.z, 0.35, 1, 0.8, 1);      // (being helped up)
  }
  // squad mode: a team-mate who is down stands out by a red column of light, teal while somebody is at work on them
  if (Game.squad && Game.player) {
    const view = App.spectating ? App.spec : Game.player;
    for (const m of Game.player.squad.members) {
      if (m === view || !m.alive || m.mode !== 'down') continue;
      // (faint from close by, where the body itself is plain to see; wide and bright from afar)
      const d = dist2D(m.x, m.z, cx, cz), k = clamp01((d - 5) / 30), help = !!m.reviver, pulse = 0.75 + 0.25 * Math.sin(time * 6);
      const r = help ? 0.5 : 3.4, g = help ? 2.6 : 0.7, b = help ? 1.9 : 0.4;
      FX.beam(m.x, m.y + 26 + d * 0.25, m.z, m.x, m.y + 0.6, m.z, 0.16 + k * 0.5, r, g, b, (0.1 + 0.48 * k) * pulse, 0.55);
      if (k > 0.05) FX.sprite(m.x, m.y + 0.5, m.z, 1.3, r, g, b, 0.5 * k * pulse, 0);
    }
  }
  // ---- vehicles (lamps on while somebody drives, brighter as it gets dark)
  for (const v of Vehicles.list) {
    const d = dist3D(v.x, v.y, v.z, cx, cy, cz);
    if (d < 420 && fr.sphere(v.x, v.y + 1, v.z, 3.6 + (d < 70 ? reach : 0))) VehModel.draw(v, time, v.driver ? 0.5 + 0.5 * env.lamp : 0, d > 48);
    if (d < 170) vehicleFx(v, dt, night);
  }
  // ---- loot
  Items.forNear(cx, cz, 78, (it, d) => {
    if (!fr.sphere(it.x, it.y + 0.5, it.z, 1.5)) return;
    const col = CharModel.drawItem(it, time);
    if (!it.rest) return;
    const hi = it.kind === 'weapon' ? 1.6 + it.rarity * 1.1 : 0.9;
    const a = clamp01(1.4 - d / 60) * (it.kind === 'weapon' ? 0.55 : 0.3);
    FX.beam(it.x, it.y + hi, it.z, it.x, it.y + 0.02, it.z, it.kind === 'weapon' ? 0.2 : 0.13, col[0] * 2.2, col[1] * 2.2, col[2] * 2.2, a, 1.6);
    FX.sprite(it.x, it.y + 0.08, it.z, 0.5, col[0] * 1.5, col[1] * 1.5, col[2] * 1.5, a, 0);
  });
  for (const ch of Items.chests) {
    const d = dist2D(ch.x, ch.z, cx, cz);
    if (d > (ch.airdrop ? 600 : 170)) continue;
    if (d < 170 && fr.sphere(ch.x, ch.y + 0.5, ch.z, 2)) CharModel.drawChest(ch, time);
    if (ch.opened) continue;
    if (ch.airdrop) { const far = clamp(d / 60, 0.35, 1); FX.beam(ch.x, ch.y + 120, ch.z, ch.x, ch.y + 0.5, ch.z, 0.5 + far * 0.5, 0.3, 2.0, 1.6, 0.5 * far, 0.5); FX.sprite(ch.x, ch.y + 1.2, ch.z, 1.8, 0.3, 1.8, 1.4, 0.6 * far, 0); }
    else if (d < 90) { FX.beam(ch.x, ch.y + 3.2, ch.z, ch.x, ch.y + 0.4, ch.z, 0.3, 3.0, 2.2, 0.7, clamp01(1.3 - d / 80) * 0.5, 1.5); FX.sprite(ch.x, ch.y + 0.5, ch.z, 0.9, 3, 2.2, 0.7, 0.5, 0); }
  }
  for (const d of Game.airdrops) {
    if (d.landed) continue;
    CharModel.drawAirdropFalling(d, time);
    FX.beam(d.x, d.y, d.z, d.x, d.ground, d.z, 0.5, 0.5, 3.0, 2.4, 0.35, 0.3);
    FX.sprite(d.x, d.y + 0.7, d.z, 2.2, 0.6, 3.5, 2.8, 0.9, 0);
  }
  for (const n of Combat.nades) { CharModel.drawNade(n); if (Math.sin(n.fuse * 22) > 0) FX.sprite(n.x, n.y + 0.14, n.z, 0.3, 4, 0.4, 0.2, 1, 0); }
  FX.ambient(cx, cy, cz, dt, night, cy > 66);
}

// ---- what a vehicle throws up and gives off: dust behind the wheels, spray in the water, smoke and flames when it is
//      badly hit, the beam of its lamps at night
const _vf = [0, 0, 0];
function vehicleFx(v, dt, night) {
  const S = VehModel.SPOTS[v.type], rng = FX.rng, sp = Math.hypot(v.vx, v.vz);
  if (v.sunk) return;
  if (!v.alive) {                                   // wreck: burns for a while, smokes a good deal longer
    if (v.deadT < 40) {
      Vehicles.toWorld(v, S.engine[0], S.engine[1] - 0.2, S.engine[2] * 0.4, _vf);
      if (v.deadT < 14) FX.fire(_vf[0], _vf[1], _vf[2], dt * 1.6);
      if (rng() < dt * (v.deadT < 14 ? 9 : 4)) FX.spawn(_vf[0] + (rng() - 0.5) * 0.8, _vf[1] + 0.3, _vf[2] + (rng() - 0.5) * 0.8, 0.5 + (rng() - 0.5) * 0.4, 1.3 + rng(), (rng() - 0.5) * 0.4, 2.6 + rng() * 1.6, 0.5, 2.6, 0.09, 0.085, 0.08, 0.55, 1, false, -0.3, 0.3);
    }
    return;
  }
  if (sp > 3.5 && !v.air) {
    Vehicles.toWorld(v, 0, S.rear[1], S.rear[2], _vf);
    if (v.wet > 0.12) { if (rng() < dt * sp * 1.6) FX.splash(_vf[0] + (rng() - 0.5) * 1.2, _vf[2] + (rng() - 0.5) * 1.2, 3); }
    else if (rng() < dt * sp * (v.skid ? 1.8 : 0.55) * (1.25 - v.bare * 0.6)) FX.dust(_vf[0] + (rng() - 0.5) * 0.9, v.y, _vf[2] + (rng() - 0.5) * 0.9, 1, 0.5 + sp * 0.05);
  }
  const hurt = 1 - v.hp / v.def.hp;
  if (hurt > 0.5) {
    Vehicles.toWorld(v, S.engine[0], S.engine[1], S.engine[2], _vf);
    const dark = v.burning ? 0.1 : 0.42;
    if (rng() < dt * (v.burning ? 14 : 5 * (hurt - 0.3))) FX.spawn(_vf[0] + (rng() - 0.5) * 0.3, _vf[1], _vf[2] + (rng() - 0.5) * 0.3, v.vx * 0.3 + (rng() - 0.5) * 0.4, 1.1 + rng() * 0.8, v.vz * 0.3 + (rng() - 0.5) * 0.4, 1.4 + rng(), 0.3, 1.7, dark, dark, dark, 0.5, 1, false, -0.3, 0.5);
    if (v.burning) FX.fire(_vf[0], _vf[1], _vf[2], dt * 1.4);
  }
  if (v.driver && night > 0.15) {                   // lamps: a soft cone ahead and a glow at the glass
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw), k = night;
    Vehicles.toWorld(v, S.lamp[0], S.lamp[1], S.lamp[2], _vf);
    FX.beam(_vf[0] + s * 15, _vf[1] - 0.5, _vf[2] + c * 15, _vf[0], _vf[1], _vf[2], 2.6, 1.6 * k, 1.45 * k, 1.05 * k, 0.16, 1.7);
    FX.sprite(_vf[0] + s * 0.1, _vf[1], _vf[2] + c * 0.1, 0.9, 3.2 * k, 2.9 * k, 2.0 * k, 0.8, 0);
  }
}

// ---- lights: lamp posts and campfires near the camera plus brief flashes; the renderer takes the four strongest
function addFlash(x, y, z, r, cr, cg, cb, life) {
  if (App.flashes.length > 24) App.flashes.shift();
  App.flashes.push({ x, y, z, r, cr, cg, cb, t: life, life });
}
function gatherLights(dt) {
  const c = App.cam.pos, env = App.env, cand = App._cand, out = App.lights;
  cand.length = 0;
  const score = (x, y, z, k) => k / (1 + dist3D(x, y, z, c[0], c[1], c[2]) * 0.06);
  if (env.lamp > 0.02) {
    for (const l of World.lamps) {
      const d = dist2D(l.x, l.z, c[0], c[2]);
      if (d > 70) continue;
      const k = 2.4 * env.lamp * (1 - smoothstep(48, 70, d));
      cand.push({ x: l.x, y: l.y, z: l.z, r: l.r, cr: l.col[0] * k, cg: l.col[1] * k, cb: l.col[2] * k, baked: l.baked, s: score(l.x, l.y, l.z, k) });
    }
  }
  for (const f of World.props.campfires) {
    const d = dist2D(f.x, f.z, c[0], c[2]);
    if (d > 80) continue;
    const k = (1.4 + env.night * 2.2) * (0.82 + 0.18 * Math.sin(App.time * 11 + f.x) * Math.sin(App.time * 7.3 + f.z)) * (1 - smoothstep(55, 80, d));
    cand.push({ x: f.x, y: f.y + 0.5, z: f.z, r: 13, cr: 1.0 * k, cg: 0.5 * k, cb: 0.18 * k, baked: false, s: score(f.x, f.y, f.z, k * 1.5) });
  }
  // vehicles: the lamps of one that is being driven light the road ahead; a burning one flickers
  if (App.mode === 'play' && Game.state !== 'idle') for (const v of Vehicles.list) {
    const d = dist2D(v.x, v.z, c[0], c[2]);
    if (d > 90) continue;
    if (v.alive && v.driver && env.lamp > 0.05) {
      const k = 2.2 * env.lamp * (1 - smoothstep(60, 90, d)), ahead = VehModel.SPOTS[v.type].lamp[2] + 5;
      cand.push({ x: v.x + Math.sin(v.yaw) * ahead, y: v.y + 1.4, z: v.z + Math.cos(v.yaw) * ahead, r: 13, cr: k, cg: 0.92 * k, cb: 0.7 * k, baked: false, s: score(v.x, v.y, v.z, k * 1.4) });
    }
    if (v.burning || (!v.alive && !v.sunk && v.deadT < 14)) {
      const k = (1.6 + env.night * 1.6) * (0.75 + 0.25 * Math.sin(App.time * 13 + v.id)) * (1 - smoothstep(60, 90, d));
      cand.push({ x: v.x, y: v.y + 1.3, z: v.z, r: 12, cr: k, cg: 0.45 * k, cb: 0.14 * k, baked: false, s: score(v.x, v.y, v.z, k * 1.5) });
    }
  }
  for (let i = App.flashes.length - 1; i >= 0; i--) {
    const f = App.flashes[i];
    f.t -= dt;
    if (f.t <= 0) { App.flashes.splice(i, 1); continue; }
    const k = f.t / f.life * (0.45 + 0.55 * env.night);          // a flash stands out far less in daylight
    cand.push({ x: f.x, y: f.y, z: f.z, r: f.r, cr: f.cr * k, cg: f.cg * k, cb: f.cb * k, baked: false, s: score(f.x, f.y, f.z, (f.cr + f.cg + f.cb) * k) });
  }
  cand.sort((a, b) => b.s - a.s);
  out.length = 0;
  for (let i = 0; i < cand.length && i < 4; i++) out.push(cand[i]);
}

// ------------------------------------------------------------------ match flow
function startMatch() {
  const s = App.settings;
  SFX.init(); SFX.resume(); SFX.setVolume(s.volume); SFX.setMusicVolume(s.music);
  HUD.reset(); FX.clear(); Guide.reset();
  leaveMatch();
  const squad = s.mode === 'squad';
  Game.start({ name: s.name || '플레이어', color: s.color, difficulty: s.difficulty, squad });
  App.mode = 'play'; App.paused = false; App.spectating = false; App.spec = null; App.endShown = false; App.endTimer = -1; App.won = false; App.recorded = false;
  App.shake = 0; App.dmgFlash = 0; App.recoilBack = 0; App.crouchToggle = false; App.zoneTint = 0; App.slowmo = 0;
  App.landed = false; App.guardFxT = 0; App.guardSfxT = 0;
  App.cam.yaw = Game.plane.yaw; App.cam.pitch = -0.35;
  App.el.menu.classList.add('hidden'); App.el.end.classList.add('hidden'); App.el.pause.classList.add('hidden'); App.el.hud.classList.remove('hidden');
  SFX.setMusic('game');
  if (squad) HUD.announce('스쿼드 — 수송기 탑승', '팀원 3명이 내가 뛰어내릴 때 함께 강하합니다', '');
  else HUD.announce('수송기 탑승', '지도(M)에서 비행 경로를 확인하세요', '');
  Input.requestLock();
}
function toMenu() {
  leaveMatch();
  App.mode = 'menu'; App.paused = false; App.spectating = false; Game.state = 'idle';
  Input.exitLock();
  App.el.menu.classList.remove('hidden'); App.el.end.classList.add('hidden'); App.el.pause.classList.add('hidden'); App.el.hud.classList.add('hidden');
  HUD.toggleBigMap(false);
  SFX.setMusic('menu'); SFX.setLoop('wind', 0); SFX.setLoop('plane', 0); SFX.setLoop('zone', 0); SFX.setEngine(0, 0);
}
// the record of the mode chosen in the menu (squad placements are out of ten teams, so the two are kept apart)
function showRecord() {
  const s = App.settings, el = App.el.record, sq = s.mode === 'squad';
  const games = sq ? s.sGames : s.games, wins = sq ? s.sWins : s.wins, place = sq ? s.sBestPlace : s.bestPlace, kills = sq ? s.sBestKills : s.bestKills;
  el.classList.toggle('hidden', !games);
  if (games) el.textContent = (sq ? '스쿼드 전적' : '전적') + '  ·  ' + games + '판  ·  우승 ' + wins + '회  ·  최고 #' + place + '  ·  최다 ' + kills + '킬';
}
// count a match once (the result panel can come up again after spectating)
function recordMatch(win, place) {
  if (App.recorded) return;
  App.recorded = true;
  const s = App.settings, p = Game.player;
  if (Game.squad) { s.sGames++; if (win) s.sWins++; s.sBestPlace = s.sBestPlace ? Math.min(s.sBestPlace, place) : place; s.sBestKills = Math.max(s.sBestKills, p.kills); }
  else { s.games++; if (win) s.wins++; s.bestPlace = s.bestPlace ? Math.min(s.bestPlace, place) : place; s.bestKills = Math.max(s.bestKills, p.kills); }
  saveSettings(); showRecord();
}
// Leaving a match for the menu or the next one. Squad mode: a player who is out while the team fights on has no placement
// yet; the match still counts, at the place the team would get if it fell now.
// (when the team's result is in already - leaving in the seconds before the panel comes up - that result counts)
function leaveMatch() {
  const p = Game.player;
  if (App.mode !== 'play' || !Game.squad || !p || !Game.playerDead || App.recorded || Game.state === 'idle') return;
  const won = Game.winTeam === p.squad;
  recordMatch(won, won || p.squad.out ? p.placement || 1 : Math.max(1, Game.teamsAlive));
}
function showEnd(win) {
  const p = Game.player, e = App.el, sq = Game.squad;
  const pending = sq && !win && !p.squad.out && Game.state !== 'ended';      // squad mode: the player is dead, the team fights on
  if (!pending) recordMatch(win, p.placement || 1);
  App.endShown = true;
  e.endTitle.textContent = win ? (sq ? '최후의 팀!' : '최후의 생존자!') : pending ? '쓰러졌습니다' : '탈락';
  e.endTitle.classList.toggle('win', win);
  const wname = p.killWeapon === 'fists' ? '주먹' : p.killWeapon === 'grenade' ? GRENADE.name : p.killWeapon === 'vehicle' ? '탈것' : p.killWeapon === 'blast' ? '차량 폭발' : (WEAPONS[p.killWeapon] ? WEAPONS[p.killWeapon].name : '');
  const how = p.killer && p.killer !== p ? p.killer.name + (wname ? '의 ' + wname + '에 쓰러졌습니다' : '에게 처치당했습니다') : p.killWeapon === 'grenade' ? '자신의 수류탄에 쓰러졌습니다' : p.killWeapon === 'blast' ? '차량 폭발에 휘말렸습니다' : p.killWeapon === 'vehicle' ? '굴러온 탈것에 치였습니다' : '오로라 장벽에 삼켜졌습니다';
  const killer = !win ? how : !sq ? '오로라 아래 마지막까지 살아남았습니다' : p.alive ? '팀이 오로라 아래 마지막까지 살아남았습니다' : '팀원들이 끝까지 살아남아 우승했습니다';
  const tip = !win && Guide.enabled ? deathTip(p) : '';
  e.endTip.textContent = tip ? '다음에는 · ' + tip : '';
  e.endTip.classList.toggle('hidden', !tip);
  if (pending) e.endPlace.textContent = '팀원 ' + p.squad.members.filter(m => m.alive).length + '명이 아직 싸우고 있습니다  ·  ' + killer;
  else e.endPlace.textContent = '#' + (p.placement || 1) + ' / ' + (sq ? Game.teams.length + '팀' : Game.chars.length) + '  ·  ' + killer;
  e.endStats.innerHTML = '';
  const stat = (v, label) => { const d = document.createElement('div'); d.className = 'stat'; const b = document.createElement('b'); b.textContent = v; const s = document.createElement('span'); s.textContent = label; d.appendChild(b); d.appendChild(s); e.endStats.appendChild(d); };
  stat(String(p.kills), '처치'); stat(String(Math.round(p.damageDealt)), '입힌 피해'); stat(fmtTime(Game.playerDead ? App.deathTime : Game.time), '생존 시간');
  if (sq) { stat(String(p.knocks), '기절시킴'); stat(String(p.revives), '살린 팀원'); stat(String(p.downs), '기절한 횟수'); }
  e.btnSpectate.classList.toggle('hidden', win || Game.state === 'ended');
  e.btnSpectate.textContent = pending ? '팀원 관전' : '관전';
  e.end.classList.remove('hidden');
  Input.exitLock();
}
function pickSpectate(next) {
  const p = Game.player;
  let alive = Game.chars.filter(ch => ch.alive), mates = false;
  if (Game.squad && p) {            // squad mode: the player's own team for as long as any of it is left
    const mine = alive.filter(ch => ch.team === p.team);
    if (mine.length) { alive = mine; mates = true; }
  }
  if (!alive.length) { App.spec = Game.winner || Game.player; return; }
  if (next && App.spec) { const i = alive.indexOf(App.spec); App.spec = alive[(i + 1) % alive.length]; }
  else if (mates) App.spec = alive.find(ch => ch.mode !== 'down') || alive[0];
  else {
    const k = Game.player.killer;
    App.spec = k && k.alive ? k : alive[0];
  }
}

function wireEvents() {
  const ev = Game.events, near = (x, z, r) => dist2D(x, z, App.cam.pos[0], App.cam.pos[2]) < r;
  // squad mode: is the player the only one of the team still on their feet? (the next knock-down ends it for all of them)
  const lastStanding = p => Game.standing(p) && !p.squad.members.some(m => m !== p && Game.standing(m));
  ev.on('shot', (ch, def, mx, my, mz, dx, dy, dz) => {
    if (near(mx, mz, 260)) FX.muzzle(mx, my, mz, dx, dy, dz, def);
    if (near(mx, mz, 90)) { if (def.beam) addFlash(mx, my, mz, 9, 0.5, 2.6, 2.0, 0.07); else addFlash(mx, my, mz, 8, 2.8, 1.9, 0.9, 0.06); }
    const own = ch === Game.player && !App.spectating;
    SFX.shot(def, mx, my, mz, own);
    if (own) App.shake = Math.max(App.shake, def.recoilV * 0.12);
    else if (Game.player && dist2D(mx, mz, Game.player.x, Game.player.z) < def.loud * 0.9) HUD.ping(ch.x, ch.z, 0);
  });
  ev.on('tracer', (def, ax, ay, az, bx, by, bz) => { if (near(ax, az, 420) || near(bx, bz, 420)) FX.tracer(def, ax, ay, az, bx, by, bz); });
  ev.on('impact', (x, y, z, nx, ny, nz, kind) => { if (near(x, z, 150)) { FX.impact(x, y, z, nx, ny, nz, kind); if (y < 0.1 && Terrain.height(x, z) < -0.2) FX.splash(x, z, 5); SFX.play('impact', x, y, z); } });
  ev.on('hitChar', (v, a, x, y, z, head) => {
    if (!near(x, z, 200)) return;
    const own = v === (App.spectating ? App.spec : Game.player);
    FX.hit(x, y, z, head, v.shield > 0, own);
    if (!own) SFX.play(v.shield > 0 ? 'hitShield' : 'hitBody', x, y, z);
  });
  ev.on('damage', (v, a, dealt, head, shieldDmg, weaponId) => {
    const p = Game.player;
    if (!p) return;
    if (a === p && v !== p) {
      HUD.hitMarker(head, !v.alive || v.hp <= 0);
      HUD.damageNumber(v.x, v.y + 1.5, v.z, dealt, head, shieldDmg > 0 && shieldDmg >= dealt - 0.01);
      SFX.ui(head ? 'headshot' : 'hit');
    }
    if (v === p && weaponId !== 'zone') {
      if (a) HUD.damageFrom(a.x, a.z);
      SFX.ui(shieldDmg >= dealt - 0.01 ? 'shieldHurt' : 'hurt');
      App.dmgFlash = Math.min(1, App.dmgFlash + 0.35 + dealt / 60); App.shake = Math.max(App.shake, 0.5 + dealt / 40);
    }
  });
  // a hit soaked up by the landing protection
  ev.on('guard', (v, a, x, y, z) => {
    const own = v === Game.player && !App.spectating;
    if (near(x, z, 150)) FX.hit(x, y, z, false, true, own);
    if (own && App.time - App.guardSfxT > 0.3) { App.guardSfxT = App.time; SFX.ui('shieldHurt'); }
  });
  ev.on('shieldBreak', ch => { if (near(ch.x, ch.z, 120)) { FX.shieldBreak(ch.x, ch.y + 1.1, ch.z); SFX.play('shieldBreak', ch.x, ch.y + 1, ch.z); } });
  ev.on('death', (v, a, weaponId) => {
    HUD.killFeed(v, a, weaponId);
    const p = Game.player;
    if (near(v.x, v.z, 150)) { FX.sparkle(v.x, v.y + 1, v.z, 1, 0.9, 0.6, 14); FX.ring(v.x, v.y + 0.2, v.z, 1, 0.8, 0.5, 3); }
    if (a === p && p && v !== p) { SFX.ui('kill'); HUD.announce('처치', v.name + '  ·  ' + p.kills + '킬', 'kill'); }
    if (!Game.squad && (Game.aliveCount === 10 || Game.aliveCount === 5 || Game.aliveCount === 2)) { if (p && p.alive) HUD.announce(Game.aliveCount === 2 ? '1 대 1' : '최후의 ' + Game.aliveCount + '인', '', 'gold'); }
    if (Game.squad && p && !p.alive && v !== p && v.team === p.team && App.endShown && !App.spectating && !p.squad.out) showEnd(false);      // (the "team fights on" panel counts the team-mates left)
    if (Game.squad && p && p.alive && v !== p && v.team === p.team) { SFX.ui('mateDown'); HUD.announce('팀원 사망', v.name + (lastStanding(p) ? ' · 혼자 남았습니다 — 쓰러지면 팀이 탈락합니다' : ' · 남은 팀원 ' + (p.squad.members.filter(m => m.alive).length - 1) + '명'), 'warn'); }
  });
  ev.on('playerDeath', (v, a) => { SFX.ui('death'); App.deathTime = Game.time; App.endTimer = 1.8; App.shake = 2; SFX.setLoop('wind', 0); });
  ev.on('end', w => {
    const p = Game.player;
    if (Game.squad && p && Game.winTeam === p.squad) {      // the player's team has won (the player may be down, dead and watching, or looking at the result panel)
      App.won = true; App.endTimer = 2.6; App.endShown = false; App.slowmo = 1.3; SFX.ui('victory'); HUD.announce('팀 승리!', '', 'gold'); FX.sparkle(w.x, w.y + 1.5, w.z, 0.4, 1, 0.8, 60);
      App.el.end.classList.add('hidden');
    }
    else if (w === p) { App.won = true; App.endTimer = 2.6; App.slowmo = 1.3; SFX.ui('victory'); HUD.announce('승리!', '', 'gold'); FX.sparkle(p.x, p.y + 1.5, p.z, 0.4, 1, 0.8, 60); }
    else {
      HUD.announce(w.name + (Game.squad ? ' 팀 우승' : ' 우승'), '매치 종료', 'gold');
      if (App.spectating) { App.spec = w; App.endTimer = 3.0; App.endShown = false; }
      else if (Game.squad && App.endShown) showEnd(false);      // (the panel is up: nothing left to watch now)
    }
  });
  // ---- squad mode
  ev.on('knock', (v, a, weaponId) => {
    const p = Game.player;
    HUD.killFeed(v, a, weaponId, 'knock');
    if (near(v.x, v.z, 150)) { FX.sparkle(v.x, v.y + 0.8, v.z, 1, 0.5, 0.3, 10); FX.ring(v.x, v.y + 0.2, v.z, 1, 0.45, 0.3, 2.4); SFX.play('knock', v.x, v.y + 0.5, v.z); }
    if (!p) return;
    if (v === p) { SFX.ui('down'); App.shake = Math.max(App.shake, 2); App.crouchToggle = false; HUD.announce('기절', '팀원이 살리러 올 때까지 버티세요', 'warn'); }
    else if (v.team === p.team) {
      SFX.ui('mateDown');
      if (!Game.standing(p)) HUD.announce('팀원 기절', v.name, 'warn');      // (down or dead oneself: nothing to be done about it)
      else if (lastStanding(p)) HUD.announce('혼자 남았습니다', v.name + ' 기절 — 내가 쓰러지면 팀이 탈락합니다 · F로 살리세요', 'warn');
      else HUD.announce('팀원 기절', v.name + ' — 붉은 빛기둥으로 가서 F로 살리세요', 'warn');
    }
    else if (a === p) { SFX.ui('kill'); HUD.announce('기절시킴', v.name, 'kill'); }
  });
  ev.on('reviveStart', (by, v) => { if (by === Game.player || v === Game.player) SFX.ui('useStart'); });
  ev.on('revive', (by, v) => {
    const p = Game.player;
    if (near(v.x, v.z, 120)) { FX.sparkle(v.x, v.y + 0.9, v.z, 0.4, 1, 0.8, 16); FX.ring(v.x, v.y + 0.2, v.z, 0.4, 1, 0.8, 2.6); }
    if (!p || v.team !== p.team) { if (near(v.x, v.z, 60)) SFX.play('heal', v.x, v.y + 1, v.z); return; }
    HUD.killFeed(v, by, '', 'revive');
    SFX.ui('healDone');
    if (v === p) HUD.announce('다시 일어났습니다', by.name + ' 덕분입니다 · 체력 ' + SQUAD.reviveHp + ' — 먼저 회복하세요', '');
    else if (by === p) { HUD.toast(v.name + ' 소생'); guideNote('revive'); }
    else HUD.toast(by.name + ' → ' + v.name + ' 소생');
  });
  ev.on('teamOut', T => {
    const p = Game.player, n = Game.teamsAlive;
    if (!p) return;
    if (T !== p.squad) { if (!p.squad.out && (n === 5 || n === 3 || n === 2)) HUD.announce(n === 2 ? '마지막 두 팀' : '남은 팀 ' + n, '', 'gold'); return; }
    // the player's own team is out: bring the result up to date (the player may have died earlier and be watching a team-mate,
    // or be looking at the "team fights on" panel; when they fell with the team, the timer of their own death shows it)
    if (App.spectating) { App.endTimer = 2.2; App.endShown = false; }
    else if (App.endShown) showEnd(false);
  });
  ev.on('step', (ch, sp) => {
    const p = Game.player, own = ch === p;
    if (!near(ch.x, ch.z, 34)) return;
    if (ch.swimming) { SFX.play('stepWater', ch.x, ch.y, ch.z); if (Math.random() < 0.5) FX.splash(ch.x, ch.z, 2); return; }
    if (own || !ch.crouch) SFX.play('step', ch.x, ch.y, ch.z);
    if (ch.sprinting && ch.grounded && Math.abs(ch.y - Terrain.height(ch.x, ch.z)) < 0.3) FX.dust(ch.x, ch.y, ch.z, 1, 0.6);
  });
  ev.on('jump', ch => { if (near(ch.x, ch.z, 30)) SFX.play('jump', ch.x, ch.y, ch.z); });
  ev.on('land', ch => {
    if (ch !== Game.player || App.landed) return;
    App.landed = true;                                 // first touchdown: say what the protection is for
    HUD.announce('착지', '착지 보호 ' + Game.diff.grace + '초 — 그동안 무기부터 구하세요', '');
  });
  ev.on('land', (ch, hard) => { if (near(ch.x, ch.z, 60)) { SFX.play('land', ch.x, ch.y, ch.z); if (ch.swimming || Terrain.height(ch.x, ch.z) < -0.3) FX.splash(ch.x, ch.z, 10); else FX.dust(ch.x, ch.y, ch.z, hard ? 8 : 4, hard ? 2 : 1); } if (ch === Game.player) { App.shake = Math.max(App.shake, hard ? 1.2 : 0.4); SFX.setLoop('wind', 0); } });
  ev.on('reload', (ch, def) => { if (near(ch.x, ch.z, 28)) SFX.play('reload', ch.x, ch.y + 1.2, ch.z); });
  ev.on('empty', ch => { if (ch === Game.player) SFX.play('empty', ch.x, ch.y + 1.2, ch.z); });
  ev.on('switch', ch => { if (ch === Game.player) SFX.play('switch', ch.x, ch.y + 1.2, ch.z); });
  ev.on('pickup', (ch, it, n) => {
    if (ch !== Game.player) return;
    if (it.kind === 'weapon') { SFX.ui('pickupWeapon'); HUD.toast(RARITY[it.rarity].name + ' ' + WEAPONS[it.type].name, RARITY[it.rarity].css); guideNote('weapon'); }
    else if (it.kind === 'ammo') { SFX.ui('pickupAmmo'); HUD.toast('+' + n + ' ' + AMMO[it.type].name); }
    else if (it.kind === 'heal') { SFX.ui('pickup'); HUD.toast('+' + n + ' ' + HEALS[it.type].name); }
    else { SFX.ui('pickup'); HUD.toast('+' + n + ' ' + GRENADE.name); }
    FX.sparkle(it.x, it.y + 0.4, it.z, 0.6, 1, 0.9, 5);
  });
  ev.on('chest', (c, opener) => { if (opener === Game.player) guideNote('chest'); });
  ev.on('chest', (c, opener) => { if (near(c.x, c.z, 80)) { SFX.play('chest', c.x, c.y + 0.5, c.z); FX.sparkle(c.x, c.y + 0.6, c.z, 1, 0.8, 0.3, 16); FX.ring(c.x, c.y + 0.3, c.z, 1, 0.8, 0.3, 2.5); } });
  ev.on('useStart', ch => { if (ch === Game.player) SFX.ui('useStart'); });
  ev.on('heal', (ch, type) => {
    if (near(ch.x, ch.z, 60)) { const cell = type === 'cell'; FX.sparkle(ch.x, ch.y + 0.9, ch.z, cell ? 0.3 : 0.4, 1, cell ? 1 : 0.5, 12); FX.ring(ch.x, ch.y + 0.2, ch.z, cell ? 0.3 : 0.4, 1, cell ? 1 : 0.5, 2.2); }
    if (ch === Game.player) { SFX.ui('healDone'); guideNote(type === 'cell' ? 'cell' : 'heal'); } else SFX.play('heal', ch.x, ch.y + 1, ch.z);
  });
  ev.on('melee', (ch, hit) => { if (near(ch.x, ch.z, 40)) SFX.play(hit ? 'punch' : 'melee', ch.x, ch.y + 1.2, ch.z); });
  ev.on('throw', ch => { if (near(ch.x, ch.z, 40)) SFX.play('throw', ch.x, ch.y + 1.4, ch.z); });
  ev.on('bounce', (x, y, z) => SFX.play('bounce', x, y, z));
  ev.on('explosion', (x, y, z) => {
    FX.explosion(x, y, z); SFX.play('explosion', x, y, z);
    addFlash(x, y + 1, z, 26, 7, 4.2, 1.6, 0.4);
    const d = dist3D(x, y, z, App.cam.pos[0], App.cam.pos[1], App.cam.pos[2]);
    if (d < 60) App.shake = Math.max(App.shake, 3.5 * (1 - d / 60));
    HUD.ping(x, z, 0);
  });
  ev.on('glider', ch => { if (near(ch.x, ch.z, 90)) SFX.play('glider', ch.x, ch.y, ch.z); });
  ev.on('jumpPlane', ch => { if (ch === Game.player) { App.cam.pitch = -0.9; App.cam.yaw = Game.plane.yaw; } });
  ev.on('dropOpen', () => { HUD.announce('강하 가능!', 'SPACE 또는 F', ''); SFX.ui('go'); });
  ev.on('zone', (kind, phase) => {
    if (kind === 'shrink') { HUD.announce(TEXT.zoneName + ' 수축 시작', (phase + 1) + '단계 — 안전 구역으로 이동하세요', 'warn'); SFX.ui('zoneMove'); }
    else if (kind === 'wait') { HUD.announce('안전 구역 갱신', '지도에서 다음 구역을 확인하세요', ''); SFX.ui('zoneWarn'); }
    else HUD.announce(TEXT.zoneName + ' 완전 폐쇄', '', 'warn');
  });
  ev.on('zoneHurt', () => { SFX.ui('zoneHurt'); App.dmgFlash = Math.min(1, App.dmgFlash + 0.25); });
  ev.on('airdrop', (d, kind) => {
    if (kind === 'incoming') { HUD.announce('보급 투하!', '전설 등급 무기가 내려옵니다', 'gold'); SFX.ui('airdrop'); HUD.ping(d.x, d.z, 1); }
    else { SFX.play('airdropLand', d.x, d.ground, d.z); if (near(d.x, d.z, 200)) FX.dust(d.x, d.ground, d.z, 16, 3); }
  });
  // ---- vehicles
  ev.on('vehEnter', (ch, v) => {
    if (near(v.x, v.z, 50)) SFX.play('vehDoor', v.x, v.y + 1, v.z);
    if (ch === Game.player) { App.lookIdle = 2; HUD.toast(v.def.name + ' 탑승'); guideNote(ch.seat < 0 ? 'ride' : 'lift'); }      // (riding along does not count as having learned to drive)
    else if (Game.squad && Game.player && Game.player.alive && v === Game.player.vehicle) HUD.toast(ch.name + ' 탑승 · ' + ((v.driver ? 1 : 0) + v.riders) + '/' + (1 + v.def.pass.length));      // a team-mate gets in with the player
  });
  ev.on('vehExit', (ch, v) => { if (near(v.x, v.z, 50)) SFX.play('vehDoor', v.x, v.y + 1, v.z); });
  ev.on('vehHit', (v, x, y, z, nx, ny, nz) => { if (near(x, z, 160)) { FX.impact(x, y, z, nx, ny, nz, 2); SFX.play('vehHit', x, y, z); } });
  ev.on('vehDamage', (v, by, amount) => {
    const p = Game.player;
    if (!p || App.spectating) return;
    if (by === p) { HUD.hitMarker(false, false); HUD.damageNumber(v.x, v.y + v.def.top + 0.3, v.z, amount, false, true); SFX.ui('hit'); }
    else if (v.driver === p) {                       // somebody is shooting up the vehicle the player sits in
      if (by) HUD.damageFrom(by.x, by.z);
      if (App.time - App.vehSfxT > 0.12) { App.vehSfxT = App.time; SFX.ui('vehHurt'); }
      App.shake = Math.max(App.shake, 0.45);
    }
  });
  ev.on('vehBurn', v => {
    if (near(v.x, v.z, 120)) { FX.sparkle(v.x, v.y + 1, v.z, 1, 0.5, 0.15, 14); SFX.play('vehFire', v.x, v.y + 1, v.z); }
    if (Game.player && Game.player.vehicle === v && !App.spectating) { HUD.announce('차량에 불이 붙었습니다', 'F — 지금 내리세요! 곧 폭발합니다', 'warn'); SFX.ui('zoneWarn'); }      // (at the wheel, or riding along)
  });
  ev.on('vehExplode', (v, x, y, z) => {
    FX.explosion(x, y, z); SFX.play('explosion', x, y, z);
    addFlash(x, y + 1, z, 28, 7, 4.2, 1.6, 0.45);
    const d = dist3D(x, y, z, App.cam.pos[0], App.cam.pos[1], App.cam.pos[2]);
    if (d < 70) App.shake = Math.max(App.shake, 3.8 * (1 - d / 70));
    HUD.ping(x, z, 0);
  });
  ev.on('vehSink', v => {
    if (near(v.x, v.z, 120)) { FX.splash(v.x, v.z, 26); SFX.play('vehSplash', v.x, 0, v.z); }
    if (v.lastDriver === Game.player && Game.time - v.leftT < 0.5 && !App.spectating) HUD.announce('차량 침수', '깊은 물에서는 탈것이 가라앉습니다', 'warn');
  });
  ev.on('vehCrash', (v, impact) => {
    if (!near(v.x, v.z, 70) || App.time - (v.sfxT || 0) < 0.22) return;
    v.sfxT = App.time;
    SFX.crash(v.x, v.y + 0.6, v.z, impact);
    if (impact > 6) FX.dust(v.x, v.y, v.z, 5, 1.5);
    if (v.driver === Game.player && !App.spectating) App.shake = Math.max(App.shake, Math.min(2.2, impact * 0.14));
  });
  ev.on('vehRam', (v, c) => { if (near(c.x, c.z, 60)) SFX.play('punch', c.x, c.y + 1, c.z); });
}

// ------------------------------------------------------------------ frame
// Frame-rate governor. `ms` is the mean frame time over the last half second (`span` seconds of it).
//  - slow for a while: give something up, least noticeable first (easeLoad)
//  - everything given up and the frame time has not moved: the limit is not ours (a display or browser that runs at
//    30-40 Hz, a busy CPU). Put the quality back and leave it alone unless things get clearly worse than that.
//  - fast again for a while: carefully take a little resolution back (a few times at most)
function loadState() { return Renderer.scale.toFixed(2) + (Renderer.auto.ao ? 'a' : '-') + Renderer.auto.grass; }
function restoreLoad() { Renderer.scale = 1; Renderer._sized = null; Renderer.auto.ao = true; Renderer.auto.grass = 1; App.scaleUps = 0; App.slowT = 0; App.fastT = 0; }
function govern(ms, span) {
  if (App.time < 6) return;
  const G = App.gov, limit = G.capMs ? G.capMs * 1.35 : 24;
  if (ms > limit) { App.slowT += span; App.fastT = 0; } else if (ms < 17.6) { App.fastT += span; App.slowT = 0; } else { App.slowT = 0; App.fastT = 0; }
  const urgent = ms > Math.max(34, limit);                       // under 30 fps: sooner, and two steps at once
  if (App.slowT > (urgent ? 1.5 : 3)) {
    App.slowT = 0;
    const before = loadState();
    if (before === '1.00a1') G.fullMs = ms;                        // the frame time with nothing given up
    easeLoad(); if (urgent) easeLoad();
    if (loadState() === before && before !== '1.00a1' && G.fullMs && !G.capMs) {
      if (ms > G.fullMs * 0.9) { restoreLoad(); G.capMs = ms; }    // nothing left to give up, and none of it made a difference
      G.fullMs = 0;                                                // judged once
    }
  }
  if (App.fastT > 10 && Renderer.scale < 1 && App.scaleUps < 3) { Renderer.scale = Math.min(1, Renderer.scale + 0.05); Renderer._sized = null; App.fastT = 0; App.scaleUps++; }
}
// give something up, least noticeable first: a little resolution, contact shadows, half the grass, more resolution, the rest of the grass
function easeLoad() {
  const R = Renderer, a = R.auto;
  if (R.scale > 0.85) { R.scale = Math.max(0.8, R.scale - 0.1); R._sized = null; }
  else if (a.ao && R.Q.ao) a.ao = false;
  else if (a.grass > 0.6 && R.Q.grass) a.grass = 0.55;
  else if (R.scale > 0.61) { R.scale = Math.max(0.6, R.scale - 0.1); R._sized = null; }
  else if (a.grass > 0 && R.Q.grass) a.grass = 0;
}
function updatePlay(dt) {
  const p = Game.player;
  if (Input.hit('KeyM') || Input.hit('Tab')) HUD.toggleBigMap();
  if (!App.paused) {
    // first pass: aim from where the camera currently is, then simulate, then place the camera for rendering
    if (!App.spectating && p.alive) { updatePlayerInput(dt); updateCamera(dt, false); computeAim(); }
    else if (p) { const i = p.in; i.mx = i.mz = 0; i.fire = i.firePressed = i.jump = false; }
    if (App.slowmo > 0) App.slowmo -= dt;
    Game.update(App.slowmo > 0 ? dt * 0.3 : dt);
    Guide.update(dt);
    if (p && p.alive && (p.mode === 'ground' || p.mode === 'drive') && !App.spectating) {
      // landing protection: a soft ring at the feet while it lasts, a shield-break when it runs out
      App.guardFxT -= dt;
      if (Game.playerShielded() && App.guardFxT <= 0 && p.mode === 'ground') { App.guardFxT = 1.5; FX.ring(p.x, p.y + 0.12, p.z, 0.3, 1, 0.8, 1.8); }
      if (Guide.guardEnded) { FX.shieldBreak(p.x, p.y + 1.1, p.z); SFX.play('shieldBreak', p.x, p.y + 1, p.z); HUD.announce('착지 보호 종료', '이제 봇이 먼저 공격할 수 있습니다', 'warn'); }
    }
    if (App.spectating) {
      if (!App.spec || (!App.spec.alive && Game.state !== 'ended')) pickSpectate(false);
      if (Input.clicked[0] && Game.state !== 'ended') pickSpectate(true);
    }
    updateCamera(dt, false);
  }
  // camera shake
  if (App.shake > 0.01) {
    // jitter only the rendered view; the aim angles themselves stay untouched
    const s = App.shake * 0.006, c = App.cam, yaw0 = c.yaw, pitch0 = c.pitch;
    c.yaw += (Math.random() - 0.5) * s; c.pitch += (Math.random() - 0.5) * s;
    buildCamera(c.fov);
    c.yaw = yaw0; c.pitch = pitch0;
    App.shake *= Math.exp(-7 * dt);
  }
  App.dmgFlash = Math.max(0, App.dmgFlash - dt * 1.6);
  // result screens
  if (App.endTimer > 0) { App.endTimer -= dt; if (App.endTimer <= 0 && !App.endShown) showEnd(App.won); }
  if ((App.endShown || App.spectating) && Input.hit('Enter')) startMatch();
  // audio layers
  const cam = App.cam;
  SFX.setListener(cam.pos[0], cam.pos[1], cam.pos[2], cam.yaw);
  if (p && p.alive && !App.spectating) {
    const falling = p.mode === 'fall' ? clamp01(-p.vy / 55) * 0.5 + 0.12 : p.mode === 'glide' ? 0.22 : 0;
    SFX.setLoop('wind', falling); if (falling > 0) SFX.setWindPitch(400 + (-p.vy) * 16);
    SFX.setLoop('plane', p.mode === 'plane' ? 0.16 : (Game.plane.active ? 0.2 * clamp01(1 - dist3D(Game.plane.x, Game.plane.y, Game.plane.z, cam.pos[0], cam.pos[1], cam.pos[2]) / 500) : 0));
  } else { SFX.setLoop('plane', 0); }
  { // engine: the vehicle the viewer sits in, otherwise the nearest one that somebody is driving
    const view = App.spectating ? App.spec : p, revs = v => 0.12 + Math.abs(v.speed) / v.def.maxSpeed * 0.72 + Math.abs(v.throttle) * 0.16;
    let lvl = 0, rpm = 0;
    if (!App.paused && view && view.alive && view.mode === 'drive' && view.vehicle) { lvl = 0.2; rpm = revs(view.vehicle); }
    else if (!App.paused) for (const v of Vehicles.list) {
      if (!v.driver || !v.alive) continue;
      const d = dist3D(v.x, v.y, v.z, cam.pos[0], cam.pos[1], cam.pos[2]);
      if (d > 130) continue;
      const k = 0.2 * (1 - d / 130) * (1 - d / 130);
      if (k > lvl) { lvl = k; rpm = revs(v); }
    }
    SFX.setEngine(lvl, rpm);
  }
  const wallD = Game.state === 'playing' ? Math.abs(Math.hypot(cam.pos[0] - Zone.x, cam.pos[2] - Zone.z) - Zone.r) : 999;
  SFX.setLoop('zone', wallD < 45 ? (1 - wallD / 45) * 0.14 : 0);
  SFX.setLoop('ambient', 0.035);
  SFX.setMusic(Game.state === 'ended' ? 'menu' : (Zone.phase >= 3 || Game.aliveCount <= 5 || (Game.squad && Game.teamsAlive <= 2)) && Game.state === 'playing' ? 'tense' : 'game');
}

function frame(tms) {
  if (App.lost) return;
  window.requestAnimationFrame(frame);
  try {
    const now = tms / 1000;
    let dt = now - App.last;
    App.last = now;
    if (!(dt > 0)) dt = 1 / 60;
    const rawDt = dt;
    if (dt > 0.05) dt = 0.05;
    App.time += dt;
    if (Renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)) { /* targets rebuilt */ }
    if (App.mode === 'play') updatePlay(dt);
    else { updateCamera(dt, true); SFX.setListener(App.cam.pos[0], App.cam.pos[1], App.cam.pos[2], App.cam.yaw); }
    // environment
    const playing = App.mode === 'play' && Game.state !== 'idle';
    const want = playing ? (Game.state === 'plane' ? 0 : Math.pow(Zone.progress(), 0.9)) : 0.95;
    App.tod = playing ? want : dampTo(App.tod, want, 1.5, dt);
    const env = Env.compute(App.tod, App.env);
    env.fogDensity *= 1 / (1 + Math.max(0, App.cam.pos[1] - 40) / 170);
    const p = Game.player, viewer = App.spectating ? App.spec : p;
    const outside = playing && Game.state === 'playing' && viewer && Zone.outside(App.cam.pos[0], App.cam.pos[2]);
    App.zoneTint = dampTo(App.zoneTint, outside ? 1 : 0, 4, dt);
    present(App.paused ? 0 : dt);
    gatherLights(App.paused ? 0 : dt);
    const sc = App.scene;
    sc.time = App.time; sc.focusY = viewer && playing ? viewer.y + 1 : App.cam.pos[1] - 40;
    sc.zone.x = Zone.x; sc.zone.z = Zone.z; sc.zone.r = Zone.r; sc.zone.enabled = playing && Zone.r < 590;
    sc.fx.zoneTint = App.zoneTint * 0.55; sc.fx.damage = App.dmgFlash; sc.fx.desat = playing && p && !p.alive && !App.spectating ? 0.55 : playing && p && p.mode === 'down' && !App.spectating ? Math.max(0.4, env.night * 0.25) : env.night * 0.25; sc.fx.vignette = App.scoped ? 0.2 : 0.85;
    sc.particles.data = FX.pData; sc.particles.count = FX.pCount; sc.beams.data = FX.bData; sc.beams.count = FX.bCount;
    Renderer.render(sc);
    if (playing && viewer) {
      const spread = Combat.spreadOf(viewer, viewer.def());
      HUD.update(dt, { player: viewer, cam: App.cam, spectating: App.spectating, spread, scoped: App.scoped, enemyUnderCrosshair: App.enemyAim, fps: App.fpsText });
    }
    SFX.update();
    Input.endFrame();
    // frame-time statistics + adaptive quality
    if (rawDt > 0.25) { App.fpsAcc = 0; App.fpsN = 0; App.slowT = 0; App.fastT = 0; }      // the tab was hidden or the page stalled: not a measurement
    else { App.fpsAcc += rawDt; App.fpsN++; }
    if (App.fpsAcc >= 0.5) {
      const ms = App.fpsAcc / App.fpsN * 1000;
      App.fpsText = Math.round(1000 / ms) + ' FPS';
      govern(ms, App.fpsAcc);
      App.fpsAcc = 0; App.fpsN = 0;
    }
  } catch (err) {
    if (++App.errors > 4) fatal(err);
    else if (typeof console !== 'undefined') console.error(err);
  }
}

// ------------------------------------------------------------------ UI wiring + boot
function bindUI() {
  const e = App.el, s = App.settings;
  for (const id of ['menu', 'pause', 'end', 'hud', 'loading', 'loadBar', 'loadText', 'btnStart', 'btnResume', 'btnRestart', 'btnQuit', 'btnAgain', 'btnSpectate', 'btnMenu',
    'nameInput', 'colorRow', 'diffSeg', 'qualitySel', 'sensRange', 'volRange', 'musicRange', 'pSens', 'pVol', 'endTitle', 'endPlace', 'endStats', 'btnFull', 'record',
    'btnGuide', 'pGuide', 'endTip', 'btnSquad']) e[id] = $id(id);
  if (s.mode !== 'squad') s.mode = 'solo';      // the mode last played: what 다시 하기 / 새 게임 start again, and whose record the menu shows
  applyGuideSettings(); showGuideSwitch();
  for (const id of ['btnGuide', 'pGuide']) e[id].addEventListener('click', () => { SFX.init(); SFX.resume(); SFX.ui('click'); toggleGuide(); });
  showRecord();
  e.nameInput.value = s.name;
  e.nameInput.addEventListener('input', () => { s.name = e.nameInput.value.trim().slice(0, 12) || '플레이어'; saveSettings(); });
  SUIT_COLORS.forEach((hex, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch' + (i === s.color ? ' on' : ''); b.style.background = hexCss(hex);
    b.addEventListener('click', () => { s.color = i; saveSettings(); for (const c of e.colorRow.children) c.classList.remove('on'); b.classList.add('on'); SFX.init(); SFX.resume(); SFX.ui('click'); });
    e.colorRow.appendChild(b);
  });
  for (const b of e.diffSeg.children) {
    b.classList.toggle('on', b.dataset.v === s.difficulty);
    b.addEventListener('click', () => { s.difficulty = b.dataset.v; saveSettings(); for (const c of e.diffSeg.children) c.classList.toggle('on', c === b); SFX.init(); SFX.resume(); SFX.ui('click'); });
  }
  e.qualitySel.value = s.quality;
  e.qualitySel.addEventListener('change', () => { s.quality = e.qualitySel.value; Renderer.setQuality(s.quality); restoreLoad(); App.gov.fullMs = 0; saveSettings(); });
  const range = (el, key, fn) => { el.value = String(s[key]); el.addEventListener('input', () => { s[key] = parseFloat(el.value); if (fn) fn(s[key]); saveSettings(); }); };
  range(e.sensRange, 'sens', v => { e.pSens.value = String(v); });
  range(e.pSens, 'sens', v => { e.sensRange.value = String(v); });
  range(e.volRange, 'volume', v => { SFX.setVolume(v); e.pVol.value = String(v); });
  range(e.pVol, 'volume', v => { SFX.setVolume(v); e.volRange.value = String(v); });
  range(e.musicRange, 'music', v => SFX.setMusicVolume(v));
  // two ways to start: alone (as ever), or as a team of four
  const begin = mode => { s.mode = mode; saveSettings(); showRecord(); SFX.init(); SFX.resume(); SFX.ui('click'); startMatch(); };
  e.btnStart.addEventListener('click', () => begin('solo'));
  e.btnSquad.addEventListener('click', () => begin('squad'));
  e.btnFull.addEventListener('click', () => {
    SFX.ui('click');
    try {
      const d = document, root = d.documentElement;
      if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); }
      else { const req = root.requestFullscreen || root.webkitRequestFullscreen; if (req) { const r = req.call(root); if (r && r.catch) r.catch(() => {}); } }
    } catch (err) { /* fullscreen is optional */ }
  });
  e.btnResume.addEventListener('click', () => { SFX.ui('click'); Input.requestLock(); });
  e.btnRestart.addEventListener('click', () => { SFX.ui('click'); startMatch(); });
  e.btnQuit.addEventListener('click', () => { SFX.ui('click'); toMenu(); });
  e.btnAgain.addEventListener('click', () => { SFX.ui('click'); startMatch(); });
  e.btnMenu.addEventListener('click', () => { SFX.ui('click'); toMenu(); });
  e.btnSpectate.addEventListener('click', () => {
    SFX.ui('click');
    App.spectating = true; pickSpectate(false);
    e.end.classList.add('hidden');
    Input.requestLock();
  });
  // first interaction anywhere unlocks audio (browser autoplay policy)
  const unlock = () => { SFX.init(); SFX.resume(); SFX.setVolume(s.volume); SFX.setMusicVolume(s.music); if (App.mode === 'menu') SFX.setMusic('menu'); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  Input.onLockChange = locked => {
    if (App.mode !== 'play') return;
    if (locked) { App.paused = false; e.pause.classList.add('hidden'); }
    else if (App.spectating) { if (Game.squad) showEnd(App.won); else e.end.classList.remove('hidden'); }      // leaving spectate view brings the result panel back (squad mode: as things stand now)
    else if (!App.endShown && !Game.playerDead && !App.won) { App.paused = true; e.pause.classList.remove('hidden'); HUD.toggleBigMap(false); }
  };
  Renderer.canvas.addEventListener('click', () => { if (App.mode === 'play' && !Input.locked && !App.endShown && !App.paused) Input.requestLock(); });
  // the graphics device was reset (driver update, sleep, too many tabs): nothing can be drawn any more
  Renderer.canvas.addEventListener('webglcontextlost', ev => {
    ev.preventDefault(); App.lost = true; Input.exitLock();
    $id('fatalText').textContent = '그래픽 장치와의 연결이 끊겼습니다.\n페이지를 새로 고침(F5)하면 다시 시작할 수 있습니다.';
    $id('fatal').classList.remove('hidden');
  });
}

function boot() {
  const bar = $id('loadBar'), text = $id('loadText');
  const steps = [
    ['그래픽을 준비하는 중…', () => { loadSettings(); Renderer.init($id('gl'), App.settings.quality, true); }],
    ['지형을 빚는 중…', () => Terrain.generate(CFG.WORLD_SEED)],
    ['마을과 숲을 세우는 중…', () => WorldGen.build()],
    ['길을 탐색하는 중…', () => Nav.build()],
    ['빛과 그림자를 준비하는 중…', () => { Renderer.finish(); Renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1); Renderer.buildWorld(); }],
    ['지도를 그리는 중…', () => { FX.init(); HUD.init(); HUD.buildMap(); Input.init(Renderer.canvas); bindUI(); wireEvents(); }],
  ];
  let i = 0;
  const next = () => {
    try {
      if (i < steps.length) {
        text.textContent = steps[i][0];
        bar.style.width = Math.round((i + 0.5) / steps.length * 100) + '%';
        const fn = steps[i][1]; i++;
        window.setTimeout(() => { try { fn(); next(); } catch (err) { fatal(err); } }, 30);
        return;
      }
      bar.style.width = '100%';
      App.scene = { time: 0, focusY: 0, cam: App.cam, env: App.env, lights: App.lights, zone: { x: 0, z: 0, r: 600, enabled: false }, fx: { vignette: 0.85, zoneTint: 0, damage: 0, desat: 0 }, particles: { data: FX.pData, count: 0 }, beams: { data: FX.bData, count: 0 } };
      App.mode = 'menu';
      $id('loading').classList.add('hidden'); App.el.menu.classList.remove('hidden');
      App.last = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
      window.requestAnimationFrame(frame);
    } catch (err) { fatal(err); }
  };
  next();
}
window.addEventListener('error', ev => { if (App.mode === 'loading') fatal(ev.error || ev.message); });
boot();
