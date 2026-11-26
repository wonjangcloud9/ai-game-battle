/* 어스름 전선 — recap: 판 끝 결과 화면
   · 가장 빛난 영웅(MVP)과 그 까닭 한 줄 · 마지막 한타 10초 다시 보기(저절로, 되풀이) · 골드 차이 / 영웅 피해 그래프(시간에 따라)
   · 영웅마다 칭찬 한 줄 · 크게 누르기 쉬운 '한 판 더' (Enter)
   ① 기록 — Game.update 를 감싸 틱마다 '화면에 필요한 것'만 적는다. 게임 상태는 읽기만 한다 (규칙·난수·친구 방 지문은 그대로).
      필름: 유닛의 자리·체력·상태 + 그 틱의 사건(맞음·시전·처치…)을 최근 14초 고리에 둔다.
      한타 찾기: 1초마다 '지난 10초'에 점수를 매긴다(영웅끼리 준 피해 · 쓰러진 영웅 · 맞붙은 영웅 수). 이어진 한타에서 가장 뜨거운 10초를 남긴다.
      그래프: 5초마다 영웅별 번 골드 · 영웅에게 준 피해.
   ② 끝난 뒤 — MVP·칭찬·그래프·다시 볼 구간은 모두 경기 상태에서만 계산한다 → 친구 방의 두 화면이 같은 결과를 본다.
   ③ 다시 보기 — 남긴 10초를 '인형' 유닛에 입혀 진짜 월드 렌더러(W.render)로 그린다. 사건은 같은 틱에 W.onEvent 로 다시 흘려
      불꽃·숫자·처치 연출이 그대로 나온다. 눈은 관전자(안개 없음 · 내 영웅 강조 없음) → 두 화면이 같은 그림이다. */
(function () {
  'use strict';
  const TW = globalThis.TW;
  if (!TW || !TW.Game || !TW.World || !TW.UI) return;
  const C = TW.C, U = TW.U, X = TW.X, W = TW.World, UI = TW.UI, TAU = Math.PI * 2;
  const R = TW.Recap = { ver: 1, rep: null, P: null };
  const DT = C.DT, FPS = Math.round(1 / DT);
  const RING = 14 * FPS, CLIP = 10 * FPS, SAMPLE = 5, START = 2.1;        // 고리 14초 · 다시 보기 10초 · 그래프 5초 간격 · 결과 화면이 다 뜬 뒤 다시 보기 시작
  const NF = 16;            // 유닛 한 명의 칸: id x y z 방향 체력 최대체력 상태 걸음 보호막 덧값 a b c 돌진종류 모으기칸
  const F_DEAD = 1, F_MOVE = 2, F_STUN = 4, F_ROOT = 8, F_AIR = 16, F_FROZE = 32, F_TAUNT = 64, F_SLOW = 128, F_RECALL = 256, F_CHAN = 512,
    F_CHARGE = 1024, F_DASH = 2048, F_DEFL = 4096, F_AMBUSH = 8192, F_EMP = 16384, F_VULN = 32768, F_CHAIN = 65536, F_TGT = 131072;
  // 다시 보기에 다시 흘릴 사건 (그림이 있는 것만. 알림·소리·골드 숫자처럼 '내 것'인 것은 뺀다)
  const VIS_EV = new Set(['attackStart', 'hit', 'melee', 'shoot', 'projHit', 'projEnd', 'cast', 'castFire', 'chargeStart', 'dashStart', 'dashEnd', 'blink', 'roll', 'dodge', 'deflect', 'cc', 'heal', 'lastHit', 'death', 'kill', 'levelup', 'buy', 'buffGain', 'towerDown', 'coreDown', 'bossDown', 'elderDown', 'campSpawn', 'zoneBlast', 'strikeBlast', 'respawn', 'recallDone', 'toss', 'fx']);
  const nowMs = () => (globalThis.performance && performance.now ? performance.now() : Date.now());
  const pop = (m) => { let n = 0; while (m) { n += m & 1; m >>>= 1; } return n; };
  const cm = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function kfmt(v) {       // 축 눈금: 0 · 5천 · 1만 · 1.5만
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    const r1 = (x) => (Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1));
    if (a >= 10000) return s + r1(a / 10000) + '만';
    if (a >= 1000) return s + r1(a / 1000) + '천';
    return s + Math.round(a);
  }
  function niceCeil(v) { if (!(v > 0)) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; }
  const fmtT = (s) => U.fmtTime(Math.max(0, s));
  // 그래프 빛깔: 두 진영의 빛깔(호박빛·보랏빛)을 어두운 바탕에서 읽히는 밝기로 (dataviz 검사기: 밝기 띠·색약 구분·대비 모두 통과, #0c0f26 바탕)
  const CH_COL = ['#c4801a', '#9a62f0'], SURF = '#0c0f26', INK = '#eef0ff', INK2 = '#b9bfdc', INK3 = '#8a90b4', GRID = 'rgba(255,255,255,0.08)';

  /* =====================================================================
     ① 기록
     ===================================================================== */
  function newRec(G) {
    const hidx = new Map(), tmask = [0, 0];
    G.heroes.forEach((h, i) => { hidx.set(h.id, i); tmask[h.team] |= 1 << i; });
    const rec = { ring: [], st: new Map(), ps: new Map(), zs: new Map(), ss: new Map(), ws: new Map(), dk: [], hidx, tmask, k: 0,
      run: null, saved: null, tl: [], nextS: SAMPLE, hs: G.heroes.map(() => ({ cc: 0, heal: 0, dodge: 0, multi: 0, fb: 0 })), ms: 0, msMax: 0, frames: 0, evN: 0, off: false };
    rec.tl.push({ t: 0, g: G.heroes.map(h => h.stats.gold), d: G.heroes.map(() => 0) });
    return rec;
  }
  function statOf(u, rec) {
    if (u.isHero) return { c: 'h', heroId: u.heroId, hd: u.hd, name: u.name, team: u.team, r: u.r, ranged: u.ranged, i: rec.hidx.get(u.id) };
    if (u.isMinion) return { c: 'm', kind: u.kind, team: u.team, r: u.r, name: u.name, ranged: u.ranged };
    if (u.isMonster) return { c: 'n', kind: u.kind, team: u.team, r: u.r, name: u.name, buffKind: u.buffKind || null, ranged: u.ranged };
    return { c: 's', kind: u.kind, tier: u.tier, lane: u.lane, team: u.team, r: u.r, name: u.name };
  }
  function put(rec, d, j, u) {
    const o = j * NF;
    let fl = 0, aux = 0, a = 0, b = 0, c = 0, dk = 0, cs = 0;
    if (u.dead) fl |= F_DEAD; if (u.moving) fl |= F_MOVE; if (u.stunned) fl |= F_STUN; if (u.rooted) fl |= F_ROOT; if (u.airborne) fl |= F_AIR;
    if (u.frozen) fl |= F_FROZE; if (u.taunter) fl |= F_TAUNT; if (u.slowPct > 0.05) fl |= F_SLOW; if (u.deflect > 0) fl |= F_DEFL;
    if (u.dash) { fl |= F_DASH; const kd = (u.dash.o && u.dash.o.kind) || 'dash'; let q = rec.dk.indexOf(kd); if (q < 0) { q = rec.dk.length; rec.dk.push(kd); } dk = q; }
    if (u.disp && u.disp.chain && u.disp.src) { fl |= F_CHAIN; c = u.disp.src.id; }
    if (u.isHero) {
      if (u.recall) { fl |= F_RECALL; aux = u.recall.t; }
      if (u.channel) fl |= F_CHAN;
      if (u.charge) { fl |= F_CHARGE; aux = u.chargeK(); cs = u.charge.slot; }
      if (u.st && u.st.ambush) fl |= F_AMBUSH;
      a = u.level; b = u.respawnT || 0;
    } else if (u.isStruct) { if (u.vulnerable) fl |= F_VULN; a = u.lockT || 0; b = u.lockMax || 1; c = u.target ? u.target.id : 0; }
    else if (u.isMinion) { if (u.emp) fl |= F_EMP; }
    else if (u.isMonster && u.target) fl |= F_TGT;
    let z = u.z || 0;
    if (!z && u.airborne) { const ab = u.getBuff('air'); if (ab && ab.dur > 0) z = Math.sin(Math.min(1, ab.t / ab.dur) * Math.PI) * 1.5; }
    d[o] = u.id; d[o + 1] = u.x; d[o + 2] = u.y; d[o + 3] = z; d[o + 4] = u.facing; d[o + 5] = u.hp; d[o + 6] = u.maxHp; d[o + 7] = fl;
    d[o + 8] = u.walkPhase || 0; d[o + 9] = u.shield || 0; d[o + 10] = aux; d[o + 11] = a; d[o + 12] = b; d[o + 13] = c; d[o + 14] = dk; d[o + 15] = cs;
  }
  // 그림에 쓰이는 버프만 (보호막 · 캠프 기운 · 기절/빙결/띄움/속박/홀림 · 서리 표식 · 미끼 · 불티의 열기 · 띄움 높이)
  const keepB = (b) => b.shield > 0 || !!b.camp || b.stun || b.freeze || b.airborne || b.root || b.taunt || b.id === 'frost' || b.id === 'bait' || b.id === 'heat' || b.id === 'air';
  function buffsOf(u) {
    let out = null; const bs = u.buffs;
    for (let i = 0; i < bs.length; i++) { const b = bs[i]; if (!keepB(b)) continue; (out || (out = [])).push({ id: b.id, t: b.t, dur: b.dur, stacks: b.stacks, shield: b.shield, color: b.color, camp: b.camp, stun: b.stun, freeze: b.freeze, airborne: b.airborne, root: b.root, taunt: b.taunt }); }
    return out;
  }
  // 투사체·장판·일격·캠프는 사건이 난 순간의 얕은 사본으로 (그 뒤에 움직이거나 바뀌어도 그 순간의 자리로 그린다)
  function snapObj(o) {
    const c = { $snap: 1 };
    for (const k in o) { const v = o[k]; if (typeof v === 'function' || v instanceof Set || v instanceof Map) continue; c[k] = v; }
    return c;
  }
  function snapEv(e) { const c = Object.assign({}, e); if (e.p) c.p = snapObj(e.p); if (e.z) c.z = snapObj(e.z); if (e.s) c.s = snapObj(e.s); if (e.camp) c.camp = snapObj(e.camp); return c; }

  function tick(G, e0) {
    const rec = G._rec || (G._rec = newRec(G));
    if (rec.off) return;
    const t0 = nowMs(), us = G.units, st = rec.st, hidx = rec.hidx;
    let n = 0;
    for (let i = 0; i < us.length; i++) { const u = us[i]; if (u.dead && !u.isHero) continue; n++; }
    for (const s of G.towers) if (s.dead) n++;
    for (const s of G.cores) if (s.dead) n++;
    const d = new Float32Array(n * NF); let j = 0, bf = null;
    for (let i = 0; i < us.length; i++) {
      const u = us[i]; if (u.dead && !u.isHero) continue;
      if (!st.has(u.id)) st.set(u.id, statOf(u, rec));
      put(rec, d, j++, u);
      if (u.buffs.length) { const b = buffsOf(u); if (b) (bf || (bf = [])).push(u.id, b); }
    }
    for (const list of [G.towers, G.cores]) for (const s of list) if (s.dead) { if (!st.has(s.id)) st.set(s.id, statOf(s, rec)); put(rec, d, j++, s); }
    const fr = { k: rec.k, t: G.t, n: j, u: d, bf, pj: null, zn: null, sk: null, wd: null, pk: null, ev: null, sd: 0, kc: 0, sm: 0, sc: 0 };
    if (G.projs.length) {
      let a = null;
      for (const p of G.projs) {
        if (p.done) continue;
        if (!rec.ps.has(p.id)) rec.ps.set(p.id, { id: p.id, vis: p.vis, radius: p.radius || 0, skill: !!p.skill, team: p.team, homing: !!p.homing, src: p.src ? p.src.id : 0 });
        (a || (a = [])).push(p.id, p.x, p.y, p.ang, p.returning ? 1 : 0);
      }
      fr.pj = a;
    }
    if (G.zones.length) {
      let a = null;
      for (const z of G.zones) {
        if (z.done) continue;
        if (!rec.zs.has(z.id)) rec.zs.set(z.id, { id: z.id, vis: z.vis, team: z.team, friendly: !!z.friendly, delay: z.delay, dur: z.dur, lob: z.lob ? { x: z.lob.x, y: z.lob.y } : null, orb: z.orb ? 1 : 0, smoke: !!z.smoke });
        (a || (a = [])).push(z.id, z.x, z.y, z.radius, z.t, z.active ? 1 : 0);
      }
      fr.zn = a;
    }
    if (G.strikes.length) {
      let a = null;
      for (const s of G.strikes) {
        if (s.done) continue;
        if (!rec.ss.has(s.id)) rec.ss.set(s.id, { id: s.id, shape: s.shape, x: s.x, y: s.y, x2: s.x2, y2: s.y2, hw: s.hw, r: s.r, ang: s.ang, half: s.half, delay: s.delay, team: s.team, vis: s.vis });
        (a || (a = [])).push(s.id, s.t);
      }
      fr.sk = a;
    }
    if (G.wards.length) { const a = []; for (const w of G.wards) { if (!rec.ws.has(w.id)) rec.ws.set(w.id, { id: w.id, x: w.x, y: w.y, until: w.until, reveal: w.reveal, team: w.team, r: w.r }); a.push(w.id); } fr.wd = a; }
    if (G.packs && G.packs.length) { const a = new Array(G.packs.length * 3); for (let i = 0; i < G.packs.length; i++) { const p = G.packs[i]; a[i * 3] = p.up ? 1 : 0; a[i * 3 + 1] = p.upT; a[i * 3 + 2] = p.nextT; } fr.pk = a; }
    if (G.wisp) { const w = G.wisp; fr.wp = [w.up ? 1 : 0, w.upT, TW.WISP_ORDER.indexOf(w.kind), w.spot, w.warned ? 1 : 0, w.nextSpot, w.nextT, w.n]; }      // 도깨비불: 다시 보기에도 그 자리에 그 불이 뜬다
    // 이 틱의 사건: 한타 점수 · 영웅별 기록 · 다시 볼 사건
    const ev = G.events, bit = (h) => { const i = hidx.get(h.id); return i === undefined ? 0 : 1 << i; };
    for (let i = e0; i < ev.length; i++) {
      const e = ev[i], ty = e.type;
      if (ty === 'hit') { const s = e.src, g = e.tgt; if (s && g && s.isHero && g.isHero && s.team !== g.team) { fr.sd += e.amt; fr.sm |= bit(s) | bit(g); } }
      else if (ty === 'kill') {
        const v = e.victim;
        if (v && v.isHero) {
          fr.kc++; fr.sm |= bit(v);
          const k = e.killer; if (k && k.isHero) { fr.sm |= bit(k); const hs = rec.hs[hidx.get(k.id)]; if (hs) { hs.multi = Math.max(hs.multi, e.multi || 1); if (e.first) hs.fb = 1; } }
          if (e.assists) for (const q of e.assists) fr.sm |= bit(q);
        }
      } else if (ty === 'coreDown') fr.sc = 1;
      else if (ty === 'cc') { const s = e.src, u = e.u; if (s && u && s.isHero && u.isHero && s.team !== u.team) { const hs = rec.hs[hidx.get(s.id)]; if (hs) hs.cc++; } }
      else if (ty === 'heal') { const s = e.src, g = e.tgt; if (s && g && s.isHero && g.isHero && s !== g && s.team === g.team) { const hs = rec.hs[hidx.get(s.id)]; if (hs) hs.heal += e.amt; } }
      else if (ty === 'dodge') { const u = e.u; if (u && u.isHero) { const hs = rec.hs[hidx.get(u.id)]; if (hs) hs.dodge++; } }
      if (!VIS_EV.has(ty)) continue;
      (fr.ev || (fr.ev = [])).push(e.p || e.z || e.s || e.camp ? snapEv(e) : e);
      rec.evN++;
    }
    rec.ring.push(fr); if (rec.ring.length > RING) rec.ring.shift();
    rec.k++;
    if (rec.k % FPS === 0 || G.over) judge(G, rec, G.over);
    if (G.t >= rec.nextS - 1e-6 || G.over) { rec.nextS += SAMPLE; rec.tl.push({ t: G.t, g: G.heroes.map(h => h.stats.gold), d: G.heroes.map(h => h.stats.dmg) }); }
    const ms = nowMs() - t0; rec.ms += (ms - rec.ms) * 0.02; if (ms > rec.msMax) rec.msMax = ms; rec.frames++;
  }
  /* 지난 10초(frames[a..b))의 한타 점수 */
  function scoreWin(G, rec, frames, a, b) {
    let dmg = 0, kills = 0, mask = 0, core = 0, kb = 0;
    const N = b - a, mid = Math.max(1, N * 0.56);
    for (let i = a; i < b; i++) { const f = frames[i]; dmg += f.sd; mask |= f.sm; core |= f.sc; if (f.kc) { kills += f.kc; kb += f.kc * (1 - Math.min(1, Math.abs(i - a - mid) / mid)); } }
    const n = pop(mask), d0 = pop(mask & rec.tmask[0]), d1 = pop(mask & rec.tmask[1]), size = G.size || 5;
    const ok = N >= FPS * 4 && d0 >= 1 && d1 >= 1 && n >= (size <= 3 ? 3 : 4) && kills >= 1;       // 한타 = 두 편이 여럿 맞붙어 누군가 쓰러진 싸움 (처치 없는 견제는 한타로 치지 않는다)
    return { ok, score: kills * 4 + kb * 1.2 + n + dmg / (260 * size) + core * 3, kills, n, dmg, mask, core };
  }
  /* 1초마다: 지금 한타 중인가 → 이어진 한타에서 가장 뜨거운 10초를 고른다. 한타가 2.5초 넘게 식으면 그것이 '마지막 한타'가 된다 */
  function judge(G, rec, final) {
    const ring = rec.ring, b = ring.length, a = Math.max(0, b - CLIP);
    if (!b) return;
    const s = scoreWin(G, rec, ring, a, b);
    if (s.ok) {
      const r = rec.run || (rec.run = { best: null, lastT: 0 });
      r.lastT = G.t;
      if (!r.best || s.score >= r.best.s.score - 1e-9) r.best = { kind: 'fight', frames: ring.slice(a, b), s };
    } else if (rec.run && G.t - rec.run.lastT > 2.5) { rec.saved = rec.run.best; rec.run = null; }
    if (final) {
      if (rec.run) { rec.saved = rec.run.best; rec.run = null; }
      if (!rec.saved) rec.saved = { kind: 'end', frames: ring.slice(a, b), s };       // 한타가 없던 판: 마지막 10초
    }
  }
  /* Game.update 를 감싼다: 이미 끝난 판은 건너뛰고, 이 틱에 새로 난 사건만 읽는다 (사건을 비우지 않는 도구에서도 겹쳐 세지 않게) */
  const origUpdate = TW.Game.prototype.update;
  TW.Game.prototype.update = function (dt) {
    if (this.over || this.noRecap) return origUpdate.call(this, dt);
    const e0 = this.events.length;
    origUpdate.call(this, dt);
    try { tick(this, e0); } catch (err) { if (this._rec) this._rec.off = true; this.noRecap = true; R.lastErr = err; if (globalThis.console) console.warn('recap 기록을 끕니다', err); }      // 기록이 실패해도 경기는 그대로
  };

  /* =====================================================================
     ② 끝난 뒤: 다시 볼 구간 · MVP · 칭찬
     ===================================================================== */
  function buildClip(G, rec) {
    const sv = rec.saved; if (!sv || !sv.frames || sv.frames.length < FPS) return null;
    const fr = sv.frames, N = fr.length, H = G.heroes, all = (1 << H.length) - 1, mask = sv.s.mask || all;
    const ids = new Map(); H.forEach((h, i) => { if (mask & (1 << i)) ids.set(h.id, i); });
    const raw = new Float32Array(N * 2), ok = new Uint8Array(N), spX = [], spY = [], pts = [], CL = 14;
    let px = NaN, py = NaN;
    for (let i = 0; i < N; i++) {
      const f = fr[i], d = f.u; pts.length = 0;
      for (let j = 0; j < f.n; j++) { const o = j * NF; if (!ids.has(d[o]) || (d[o + 7] & F_DEAD)) continue; pts.push(d[o + 1], d[o + 2]); }
      if (!pts.length) continue;
      // 가장 많이 모인 무리를 본다: 영웅마다 둘레 14칸 안의 영웅 수 → 가장 많은 영웅(같으면 앞 틱의 눈에 가까운 쪽) 둘레의 평균.
      // (평균만 내면 멀리 갈라진 두 무리 사이의 빈 다리를 비췄다)
      let bq = 0, bn = -1, bd = 1e9;
      for (let q = 0; q < pts.length; q += 2) {
        let c = 0; for (let r = 0; r < pts.length; r += 2) if (Math.hypot(pts[q] - pts[r], pts[q + 1] - pts[r + 1]) < CL) c++;
        const dd = px === px ? Math.hypot(pts[q] - px, pts[q + 1] - py) : 0;
        if (c > bn || (c === bn && dd < bd)) { bn = c; bd = dd; bq = q; }
      }
      let cx = 0, cy = 0, m = 0; for (let q = 0; q < pts.length; q += 2) if (Math.hypot(pts[q] - pts[bq], pts[q + 1] - pts[bq + 1]) < CL) { cx += pts[q]; cy += pts[q + 1]; m++; }
      cx /= m; cy /= m; px = cx; py = cy;
      raw[i * 2] = cx; raw[i * 2 + 1] = cy; ok[i] = 1;
      let ax = 0, ay = 0; for (let q = 0; q < pts.length; q += 2) { const dx = Math.abs(pts[q] - cx), dy = Math.abs(pts[q + 1] - cy); if (dx < 18 && dy < 18) { if (dx > ax) ax = dx; if (dy > ay) ay = dy; } }
      spX.push(ax); spY.push(ay);
    }
    let first = -1; for (let i = 0; i < N; i++) if (ok[i]) { first = i; break; }
    if (first < 0) { const c = G.cores[G.winner >= 0 ? 1 - G.winner : 1]; for (let i = 0; i < N; i++) { raw[i * 2] = c.x; raw[i * 2 + 1] = c.y; } }
    else for (let i = 0; i < N; i++) if (!ok[i]) { const p = i < first ? first : i - 1; raw[i * 2] = raw[p * 2]; raw[i * 2 + 1] = raw[p * 2 + 1]; }
    // 부드럽게: 앞으로 한 번, 뒤로 한 번 (어느 쪽으로도 늦지 않게)
    const path = new Float32Array(N * 2), fw = new Float32Array(N * 2), k = 1 - Math.exp(-DT / 0.5);
    fw[0] = raw[0]; fw[1] = raw[1];
    for (let i = 1; i < N; i++) { fw[i * 2] = fw[i * 2 - 2] + (raw[i * 2] - fw[i * 2 - 2]) * k; fw[i * 2 + 1] = fw[i * 2 - 1] + (raw[i * 2 + 1] - fw[i * 2 - 1]) * k; }
    path[(N - 1) * 2] = fw[(N - 1) * 2]; path[(N - 1) * 2 + 1] = fw[(N - 1) * 2 + 1];
    for (let i = N - 2; i >= 0; i--) { path[i * 2] = path[i * 2 + 2] + (fw[i * 2] - path[i * 2 + 2]) * k; path[i * 2 + 1] = path[i * 2 + 3] + (fw[i * 2 + 1] - path[i * 2 + 3]) * k; }
    const p80 = (arr) => { if (!arr.length) return 6; const s = arr.slice().sort((x, y) => x - y); return s[Math.floor((s.length - 1) * 0.8)]; };
    const spanX = U.clamp(p80(spX) + 6, 10, 21), spanY = U.clamp(p80(spY) + 5, 7, 15);
    const kills = [];
    for (let i = 0; i < N; i++) {
      const ev = fr[i].ev; if (!ev) continue;
      for (const e of ev) if (e.type === 'kill' && e.victim && e.victim.isHero) {
        const ki = e.killer && e.killer.isHero ? rec.hidx.get(e.killer.id) : -1;
        kills.push({ i, t: fr[i].t, killer: ki === undefined ? -1 : ki, victim: rec.hidx.get(e.victim.id), team: 1 - e.victim.team });
      }
    }
    return { kind: sv.kind || 'fight', frames: fr, N, t0: fr[0].t, t1: fr[N - 1].t, path, spanX, spanY, kills, mask, score: sv.s.score, core: !!sv.s.core };
  }

  /* 칭찬 한 줄: [항목, 무게, 자격, (행, 순위) → [별명, 사실]] · 1위면 더 센 별명 */
  const CATS = [
    ['clipK', 1.15, (r) => r.clipK >= 1, (r, k) => [k === 1 ? '마지막 한타의 주인공' : '한타의 해결사', '다시 보기 속 ' + r.clipK + '명 처치']],
    ['multi', 1.12, (r) => r.multi >= 2, (r) => [r.multi + '연속 처치!', '한 번에 몰아쳤어요']],
    ['dmg', 1.0, (r) => r.dmg >= 300, (r, k) => [k === 1 ? '가장 매운 손' : '매서운 손', '영웅 피해 ' + cm(r.dmg)]],
    ['k', 0.98, (r) => r.k >= 2, (r, k) => [k === 1 ? '최고의 사냥꾼' : '사냥꾼', '처치 ' + r.k]],
    ['heal', 0.96, (r) => r.heal >= 300, (r, k) => [k === 1 ? '팀의 약손' : '손이 따뜻한 영웅', '아군 치유 ' + cm(r.heal)]],
    ['kp', 0.92, (r, tk) => tk[r.team] >= 3 && r.kp >= 0.5, (r, k) => [k === 1 ? '어디에나 있던 영웅' : '싸움마다 함께', '처치 관여 ' + Math.round(r.kp * 100) + '%']],
    ['a', 0.9, (r) => r.a >= 3, (r, k) => [k === 1 ? '가장 든든한 길동무' : '든든한 길동무', '도움 ' + r.a]],
    ['taken', 0.86, (r) => r.taken >= 1500, (r, k) => [k === 1 ? '앞을 막은 방패' : '버팀목', '받아 낸 피해 ' + cm(r.taken)]],
    ['struct', 0.84, (r) => r.struct >= 1000, (r, k) => [k === 1 ? '탑 허무는 망치' : '탑 두드리기', '구조물 피해 ' + cm(r.struct)]],
    ['cc', 0.82, (r) => r.cc >= 3, (r, k) => [k === 1 ? '발을 묶는 손' : '묶기 솜씨', '적 영웅 묶기 ' + r.cc + '번']],
    ['d', 0.8, (r) => r.d <= 2 && r.k + r.a >= 2, (r) => (r.d === 0 ? ['꺼지지 않는 등불', '한 번도 쓰러지지 않았어요'] : ['질긴 생명력', r.d + '번만 쓰러졌어요'])],
    ['acc', 0.78, (r) => r.shots >= 8 && r.acc >= 0.45, (r, k) => [k === 1 ? '백발백중' : '좋은 눈썰미', '스킬 명중 ' + Math.round(r.acc * 100) + '% (' + r.hits + '/' + r.shots + ')']],
    ['fb', 0.74, (r) => !!r.fb, () => ['첫 불꽃', '이 판의 첫 처치']],
    ['cs', 0.72, (r) => r.cs >= 25, (r, k) => [k === 1 ? '알뜰한 살림꾼' : '살림꾼', '막타 ' + r.cs]],
    ['packs', 0.7, (r) => r.packs >= 2, (r, k) => [k === 1 ? '꾸러미 사냥꾼' : '꾸러미 챙기기', '회복 꾸러미 ' + r.packs + '개']],
    ['camps', 0.68, (r) => r.camps >= 6, (r, k) => [k === 1 ? '숲의 주인' : '숲지기', '정글 몬스터 ' + r.camps + '마리']],
    ['dodge', 0.66, (r) => r.dodge >= 2, (r) => ['날랜 몸놀림', '구르기로 ' + r.dodge + '번 피함']],
    ['gold', 0.55, (r) => r.rk.gold <= 3, (r) => ['큰손', '번 골드 ' + cm(r.gold)]],
  ];
  const RANKED = new Set(['dmg', 'k', 'heal', 'a', 'taken', 'struct', 'cc', 'cs', 'camps', 'packs', 'gold', 'kp', 'acc']);
  function assignPraise(rows, tk) {
    const out = rows.map(() => null), used = new Set(), cand = [], max = {};
    for (const c of CATS) { let m = 0; for (const r of rows) m = Math.max(m, +r[c[0]] || 0); max[c[0]] = m; }
    for (const r of rows) for (let ci = 0; ci < CATS.length; ci++) {
      const c = CATS[ci], key = c[0]; if (!c[2](r, tk)) continue;
      const rk = r.rk[key] || 9, rel = key === 'd' ? (r.d === 0 ? 1 : 0.7) : key === 'fb' ? 1 : max[key] > 0 ? (+r[key] || 0) / max[key] : 0;
      cand.push({ i: r.i, ci, rk, s: c[1] * (0.55 + 0.45 * rel) * (rk === 1 ? 1.25 : rk === 2 ? 1.0 : rk === 3 ? 0.88 : 0.75) });
    }
    cand.sort((a, b) => b.s - a.s || a.i - b.i || a.ci - b.ci);
    for (let pass = 0; pass < 2; pass++) for (const c of cand) {
      if (out[c.i]) continue; const key = CATS[c.ci][0]; if (pass === 0 && used.has(key)) continue;
      used.add(key); const tx = CATS[c.ci][3](rows[c.i], c.rk);
      out[c.i] = { key, title: tx[0], detail: tx[1] + (c.rk === 1 && RANKED.has(key) ? ' · 1위' : '') };
    }
    for (const r of rows) if (!out[r.i]) out[r.i] = { key: 'level', title: '끝까지 싸운 영웅', detail: '레벨 ' + r.level + ' · ' + r.k + '/' + r.d + '/' + r.a };
    return out;
  }
  /* MVP 의 까닭 한 줄: 가장 두드러진 사실 둘 */
  function mvpReason(r, tk) {
    const f = [], h = r.h;
    if (tk[r.team] >= 3 && r.kp >= 0.55) f.push({ w: 2 + r.kp, s: '처치 관여 ' + Math.round(r.kp * 100) + '% (' + (r.k + r.a) + '/' + tk[r.team] + ')' });
    if (r.rk.dmg === 1 && r.dmg > 0) f.push({ w: 2.4, s: '영웅 피해 1위 ' + cm(r.dmg) });
    if (r.clipK >= 2) f.push({ w: 2.6 + r.clipK * 0.2, s: '마지막 한타에서 ' + r.clipK + '명 처치' });
    if (r.multi >= 3) f.push({ w: 2.5, s: r.multi + '연속 처치' });
    if (r.rk.k === 1 && r.k >= 3) f.push({ w: 2.2, s: '가장 많은 처치 ' + r.k + '번' });
    if (r.d === 0 && r.k + r.a >= 2) f.push({ w: 2.3, s: '한 번도 쓰러지지 않음' });
    else if (r.d <= 1 && r.k + r.a >= 4) f.push({ w: 1.6, s: r.d + '번만 쓰러짐' });
    if (r.rk.struct === 1 && r.struct > 1500) f.push({ w: 1.8, s: '구조물 피해 1위 ' + cm(r.struct) });
    if (r.rk.heal === 1 && r.heal >= 600) f.push({ w: 1.9, s: '아군 치유 ' + cm(r.heal) });
    if (r.rk.taken === 1 && r.taken > 0) f.push({ w: 1.4, s: '받아 낸 피해 1위 ' + cm(r.taken) });
    if (r.rk.cc === 1 && r.cc >= 4) f.push({ w: 1.5, s: '적 영웅 묶기 ' + r.cc + '번' });
    f.sort((a, b) => b.w - a.w);
    if (!f.length) return h.kills + '처치 ' + h.deaths + '죽음 ' + h.assists + '도움으로 승리를 이끌었어요';
    return f.slice(0, 2).map(x => x.s).join(' · ');
  }
  function analyze(G, rec, clip) {
    const H = G.heroes, n = H.length, tk = [G.teams[0].kills, G.teams[1].kills], clipK = H.map(() => 0);
    if (clip) for (const k of clip.kills) if (k.killer >= 0) clipK[k.killer]++;
    const rows = H.map((h, i) => {
      const hs = rec.hs[i], sh = h.stats.shots.reduce((a, b) => a + b, 0), hi = h.stats.hits.reduce((a, b) => a + b, 0);
      return { i, h, team: h.team, k: h.kills, d: h.deaths, a: h.assists, kp: tk[h.team] ? (h.kills + h.assists) / tk[h.team] : 0, dmg: h.stats.dmg, taken: h.stats.taken, struct: h.stats.struct,
        heal: hs.heal, gold: h.stats.gold, cs: h.cs, camps: h.stats.camps || 0, packs: h.stats.packs || 0, cc: hs.cc, dodge: hs.dodge, multi: hs.multi, fb: hs.fb, shots: sh, hits: hi, acc: sh ? hi / sh : 0, clipK: clipK[i], level: h.level, rk: {} };
    });
    const rank = (key, low) => { for (const r of rows) { let k = 1; for (const q of rows) if (low ? q[key] < r[key] : q[key] > r[key]) k++; r.rk[key] = k; } };
    for (const k of ['dmg', 'k', 'a', 'kp', 'taken', 'struct', 'heal', 'gold', 'cs', 'cc', 'dodge', 'clipK', 'multi', 'camps', 'packs', 'acc']) rank(k);
    rank('d', true);
    const avg = (key) => Math.max(1, rows.reduce((s, r) => s + r[key], 0) / n), aD = avg('dmg'), aS = avg('struct'), aH = avg('heal'), aT = avg('taken');
    for (const r of rows) r.score = r.k * 2.2 + r.a * 1.2 - r.d * 1.4 + r.kp * 4 + (r.dmg / aD) * 2 + (r.struct / aS) * 0.9 + (r.heal > 300 ? (r.heal / aH) * 0.8 : 0) + (r.taken / aT) * 0.5 + r.clipK;
    let mvp = null, ace = null;
    for (const r of rows) { if (r.team === G.winner) { if (!mvp || r.score > mvp.score + 1e-9) mvp = r; } else if (!ace || r.score > ace.score + 1e-9) ace = r; }
    if (!mvp) mvp = rows.reduce((a, b) => (b.score > a.score + 1e-9 ? b : a));
    // 그래프: 골드 차이(새벽 − 황혼) · 분마다 영웅 피해(두 편)
    const tl = rec.tl.slice(), endT = G.stat.endT || G.t, team = (arr, tm) => { let s = 0; for (let i = 0; i < n; i++) if (H[i].team === tm) s += arr[i]; return s; };
    const lead = tl.map(s => ({ t: s.t, v: team(s.g, 0) - team(s.g, 1), a: team(s.g, 0), b: team(s.g, 1) }));
    const at = (tm, t) => {         // t 초까지 tm 편이 영웅에게 준 피해 (5초 표본 사이는 곧게 잇는다)
      let lo = tl[0]; for (const s of tl) { if (s.t <= t + 1e-6) lo = s; else { const k = (t - lo.t) / Math.max(1e-6, s.t - lo.t); return team(lo.d, tm) + (team(s.d, tm) - team(lo.d, tm)) * k; } }
      return team(lo.d, tm);
    };
    const nMin = Math.max(1, Math.ceil(endT / 60 - 1e-6)), dmgMin = [];
    for (let m = 0; m < nMin; m++) { const t0 = m * 60, t1 = Math.min(endT, (m + 1) * 60); dmgMin.push({ m, t0, t1, a: Math.max(0, at(0, t1) - at(0, t0)), b: Math.max(0, at(1, t1) - at(1, t0)) }); }
    const rep = { G, rows, mvp: mvp.i, ace: ace ? ace.i : -1, reason: mvpReason(mvp, tk), praise: assignPraise(rows, tk), tk, lead, dmgMin, endT, clip };
    rep.digest = digest(rep);
    return rep;
  }
  /* 두 화면이 같은 결과인지 견주는 지문 (친구 방 시험) */
  function digest(rep) {
    const G = rep.G, c = rep.clip;
    let ph = 0; if (c) for (let i = 0; i < c.path.length; i += 15) ph = (ph * 31 + Math.round(c.path[i] * 100)) | 0;
    const o = { end: +rep.endT.toFixed(2), w: G.winner, mvp: G.heroes[rep.mvp].heroId + '#' + rep.mvp, reason: rep.reason, praise: rep.praise.map(p => p.title + '|' + p.detail),
      clip: c ? { kind: c.kind, t0: +c.t0.toFixed(2), t1: +c.t1.toFixed(2), n: c.N, kills: c.kills.map(k => k.killer + '>' + k.victim + '@' + k.i), ph } : null,
      lead: rep.lead.map(s => Math.round(s.v)), dmg: rep.dmgMin.map(m => Math.round(m.a) + '/' + Math.round(m.b)) };
    const s = JSON.stringify(o); let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return { hash: h.toString(16), json: s };
  }
  /* 판이 끝난 순간 한 번 (main.js): 결과를 만들어 둔다 */
  R.prepare = function (G) {
    const rec = G && G._rec;
    if (!rec || rec.off) { R.rep = null; return null; }
    if (R.rep && R.rep.G === G) return R.rep;
    if (!rec.saved) judge(G, rec, true);
    let rep = null;
    try { const clip = buildClip(G, rec); rep = analyze(G, rec, clip); } catch (err) { R.lastErr = err; if (globalThis.console) console.warn('recap 결과를 만들지 못했습니다', err); rep = null; }
    R.rep = rep; R.P = null;
    return rep;
  };
  R.stats = function (G) {
    const rec = G && G._rec; if (!rec) return null;
    let bytes = 0; const seen = new Set(); for (const list of [rec.ring, rec.saved ? rec.saved.frames : [], rec.run && rec.run.best ? rec.run.best.frames : []]) for (const f of list) if (!seen.has(f)) { seen.add(f); bytes += f.u.byteLength; }
    return { frames: rec.frames, ms: +rec.ms.toFixed(4), msMax: +rec.msMax.toFixed(3), ring: rec.ring.length, kept: seen.size, mb: +(bytes / 1048576).toFixed(2), saved: rec.saved ? rec.saved.kind : null, samples: rec.tl.length, statics: rec.st.size, off: rec.off };
  };

  /* =====================================================================
     ③ 다시 보기: 인형 유닛 + 진짜 렌더러
     ===================================================================== */
  const PUP = { getBuff(id) { const bs = this.buffs; for (let i = 0; i < bs.length; i++) if (bs[i].id === id) return bs[i]; return null; }, hasBuff(id) { return this.getBuff(id) !== null; }, chargeK() { return this._ck || 0; } };
  const NOB = [], AMB = { ambush: true }, NOAMB = {}, CHAN = { ab: { chan: { canMove: true } } }, TAUNT = { x: 0, y: 0 }, TGT = { x: 0, y: 0 };
  function makePup(st, id) {
    const p = Object.create(PUP);
    p.id = id; p.team = st.team; p.r = st.r || 0.7; p.name = st.name || ''; p.kind = st.kind; p.tier = st.tier; p.lane = st.lane;
    p.isHero = st.c === 'h'; p.isMinion = st.c === 'm'; p.isMonster = st.c === 'n'; p.isStruct = st.c === 's';
    p.heroId = st.heroId; p.hd = st.hd; p.buffKind = st.buffKind || null; p.ranged = !!st.ranged; p.heavy = p.isStruct;
    p.x = p.px = 0; p.y = p.py = 0; p.z = 0; p.facing = 0; p.hp = p.maxHp = 1; p.dead = false; p.moving = false; p.walkPhase = 0; p.shield = 0;
    p.buffs = NOB; p.seen = [true, true]; p.bush = 0; p.sightCap = 0; p.st = NOAMB; p.level = 1; p.respawnT = 0; p.isPlayer = false; p.ad = 0;
    p.dash = null; p.disp = null; p.charge = null; p.channel = null; p.recall = null; p.taunter = null; p.target = null; p.deflect = 0; p.slowPct = 0;
    p.stunned = p.rooted = p.airborne = p.frozen = false; p.emp = false; p.vulnerable = false; p.lockT = 0; p.lockMax = 1; p._f = -9; p._ck = 0;
    return p;
  }
  function pupOf(P, id) {
    let p = P.pup.get(id); if (p) return p;
    const st = P.rec.st.get(id); if (!st) return null;
    p = makePup(st, id); P.pup.set(id, p); return p;
  }
  function applyFrame(P, fi) {
    const f = P.clip.frames[fi], RG = P.RG, d = f.u;
    RG.t = f.t;
    RG.units.length = 0; RG.minions.length = 0; RG.monsters.length = 0; RG.structs.length = 0;
    for (let j = 0; j < f.n; j++) {
      const o = j * NF, p = pupOf(P, d[o]); if (!p) continue;
      const x = d[o + 1], y = d[o + 2], fresh = p._f !== fi - 1;
      p.px = fresh ? x : p.x; p.py = fresh ? y : p.y; p.x = x; p.y = y; p._f = fi;
      p.z = d[o + 3]; p.facing = d[o + 4]; p.hp = d[o + 5]; p.maxHp = Math.max(1, d[o + 6]);
      const fl = d[o + 7];
      p.dead = !!(fl & F_DEAD); p.moving = !!(fl & F_MOVE); p.stunned = !!(fl & F_STUN); p.rooted = !!(fl & F_ROOT); p.airborne = !!(fl & F_AIR); p.frozen = !!(fl & F_FROZE);
      p.taunter = fl & F_TAUNT ? TAUNT : null; p.slowPct = fl & F_SLOW ? 0.3 : 0; p.deflect = fl & F_DEFL ? 1 : 0;
      p.walkPhase = d[o + 8]; p.shield = d[o + 9]; p.buffs = NOB;
      p.dash = fl & F_DASH ? { o: { kind: P.rec.dk[d[o + 14]] || 'dash' } } : null;
      p.disp = fl & F_CHAIN ? { chain: true, src: P.pup.get(d[o + 13]) || null } : null;
      if (p.isHero) {
        p.recall = fl & F_RECALL ? { t: d[o + 10] } : null; p.channel = fl & F_CHAN ? CHAN : null;
        if (fl & F_CHARGE) { p.charge = { slot: d[o + 15] }; p._ck = d[o + 10]; } else { p.charge = null; p._ck = 0; }
        p.st = fl & F_AMBUSH ? AMB : NOAMB; p.level = d[o + 11]; p.respawnT = d[o + 12];
        if (p.dead && fresh && p.deathX === undefined) { p.deathX = x; p.deathY = y; }       // 다시 보기를 시작할 때 이미 쓰러져 있던 영웅: 그 자리에 꺼진 등
        RG.units.push(p);
      } else if (p.isStruct) {
        p.vulnerable = !!(fl & F_VULN); p.lockT = d[o + 11]; p.lockMax = d[o + 12] || 1; p.target = d[o + 13] ? P.pup.get(d[o + 13]) || null : null;
        if (!p.dead) { RG.units.push(p); RG.structs.push(p); }
      } else {
        if (p.isMonster) p.target = fl & F_TGT ? TGT : null; else p.emp = !!(fl & F_EMP);
        if (p.dead) continue;
        RG.units.push(p); if (p.isMinion) RG.minions.push(p); else RG.monsters.push(p);
      }
    }
    if (f.bf) for (let i = 0; i < f.bf.length; i += 2) { const p = P.pup.get(f.bf[i]); if (p) p.buffs = f.bf[i + 1]; }
    RG.projs.length = 0;
    if (f.pj) for (let i = 0; i < f.pj.length; i += 5) {
      const id = f.pj[i]; let q = P.proj.get(id);
      if (!q) { const s = P.rec.ps.get(id) || { vis: { kind: 'mbolt', color: '#ffffff' }, radius: 0, skill: false, team: 0, src: 0 }; q = { id, vis: s.vis, radius: s.radius, skill: s.skill, team: s.team, homing: s.homing, src: P.pup.get(s.src) || TGT, x: 0, y: 0, ang: 0, done: false, returning: false }; P.proj.set(id, q); }
      q.x = f.pj[i + 1]; q.y = f.pj[i + 2]; q.ang = f.pj[i + 3]; q.returning = !!f.pj[i + 4]; RG.projs.push(q);
    }
    RG.zones.length = 0;
    if (f.zn) for (let i = 0; i < f.zn.length; i += 6) {
      const id = f.zn[i]; let z = P.zone.get(id);
      if (!z) { const s = P.rec.zs.get(id); if (!s) continue; z = Object.assign({}, s, { done: false, x: 0, y: 0, radius: 1, t: 0, active: false }); P.zone.set(id, z); }
      z.x = f.zn[i + 1]; z.y = f.zn[i + 2]; z.radius = f.zn[i + 3]; z.t = f.zn[i + 4]; z.active = !!f.zn[i + 5]; RG.zones.push(z);
    }
    RG.strikes.length = 0;
    if (f.sk) for (let i = 0; i < f.sk.length; i += 2) {
      const id = f.sk[i]; let s = P.strk.get(id);
      if (!s) { const q = P.rec.ss.get(id); if (!q) continue; s = Object.assign({}, q, { done: false, t: 0 }); P.strk.set(id, s); }
      s.t = f.sk[i + 1]; RG.strikes.push(s);
    }
    RG.wards.length = 0; if (f.wd) for (const id of f.wd) { const w = P.rec.ws.get(id); if (w) RG.wards.push(w); }
    if (f.pk) for (let i = 0; i < RG.packs.length; i++) { const p = RG.packs[i]; p.up = !!f.pk[i * 3]; p.upT = f.pk[i * 3 + 1]; p.nextT = f.pk[i * 3 + 2]; }
    if (RG.wisp) {
      const w = RG.wisp, a = f.wp;
      if (a) { w.up = !!a[0]; w.upT = a[1]; w.kind = TW.WISP_ORDER[a[2]] || 'might'; w.spot = a[3]; w.warned = !!a[4]; w.nextSpot = a[5]; w.nextT = a[6]; w.n = a[7]; const s = TW.C.WISP_SPOTS[w.spot] || TW.C.WISP_SPOTS[0]; w.x = s.x; w.y = s.y; }
      else { w.up = false; w.warned = false; }
    }
  }
  /* 기록한 사건 → 인형을 가리키는 사건 (유닛은 같은 번호의 인형으로) */
  function res(P, v) {
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof TW.Unit) {
      let p = P.pup.get(v.id);
      if (!p) { p = pupOf(P, v.id); if (p) { p.x = p.px = v.x; p.y = p.py = v.y; p.dead = true; p.maxHp = Math.max(1, v.maxHp || 1); p.hp = 0; } }      // 이 틱에 쓰러져 필름에 없는 것: 쓰러진 자리에
      return p;
    }
    if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) a[i] = res(P, v[i]); return a; }
    if (v.$snap) { const c = {}; for (const k in v) c[k] = (k === 'src' || k === 'target' || k === 'follow') ? res(P, v[k]) : v[k]; return c; }
    return v;
  }
  function emitFrame(P, fi) {
    const ev = P.clip.frames[fi].ev; if (!ev) return;
    for (const e of ev) {
      const o = {};
      for (const k in e) { if (k === 'recap') continue; o[k] = res(P, e[k]); }
      if ((o.type === 'kill' && !o.victim) || ((o.type === 'hit' || o.type === 'heal' || o.type === 'lastHit') && !o.tgt)) continue;
      try { W.onEvent(o); } catch (err) { P.errs++; R.lastErr = err; }        // 연출 하나가 실패해도 다시 보기는 계속
      if (o.type === 'kill' && o.victim && o.victim.isHero) {
        P.slow = P.slowDur = 1.05; P.flash = 1;
        P.feed.unshift({ at: P.rt, killer: o.killer && o.killer.isHero ? o.killer : null, victim: o.victim, team: 1 - o.victim.team });
        if (P.feed.length > 4) P.feed.pop();
        P.kills++;
      }
    }
  }
  function makeRG(G) {
    return { t: 0, units: [], heroes: [], minions: [], monsters: [], structs: [], towers: [], cores: [], projs: [], zones: [], strikes: [], wards: [], timers: [], events: [],
      packs: (G.packs || []).map(p => ({ id: p.id, x: p.x, y: p.y, up: false, upT: -1, nextT: 0, every: p.every || 30, team: p.team === undefined ? -1 : p.team, cb: !!p.cb })),
      wisp: G.wisp ? { id: 0, n: 0, spot: 0, nextSpot: 0, x: TW.C.WISP_SPOTS[0].x, y: TW.C.WISP_SPOTS[0].y, kind: 'might', up: false, upT: -1, nextT: 1e9, warned: false, takes: [0, 0] } : null,
      over: false, winner: -1, brawl: G.brawl, mode: G.mode, size: G.size, teams: G.teams, stat: G.stat, fountains: G.fountains, lastSeen: G.lastSeen,
      bossCamp: { alive: [] }, elderCamp: { alive: [] }, camps: [], player: null, replay: true, hash: { query: () => NOB }, canTarget: () => false };
  }
  function begin(P) {
    P.pup.clear(); P.proj.clear(); P.zone.clear(); P.strk.clear();
    const G = P.rep.G, RG = P.RG;
    RG.heroes = G.heroes.map(h => pupOf(P, h.id)).filter(Boolean);
    RG.towers = G.towers.map(s => pupOf(P, s.id)).filter(Boolean);
    RG.cores = G.cores.map(s => pupOf(P, s.id)).filter(Boolean);
    for (const p of RG.heroes) p.deathX = undefined;
    W.attach(RG, null); W.resetFx();          // 관전자의 눈: 안개 없음 · 내 영웅 없음 → 친구 방의 두 화면이 같은 그림
    if (TW.Feel) { if (TW.Feel.marks) TW.Feel.marks.length = 0; if (TW.Feel.ghosts) TW.Feel.ghosts.length = 0; }
    P.fi = -1; P.rt = 0; P.hold = 0; P.slow = 0; P.feed.length = 0; P.flash = 0.7; P.kills = 0; P.loopT = UI.t;
    applyFrame(P, 0); P.fi = 0; emitFrame(P, 0);
  }
  function startPlay(rep) {
    const P = { rep, clip: rep.clip, rec: rep.G._rec, RG: makeRG(rep.G), pup: new Map(), proj: new Map(), zone: new Map(), strk: new Map(), feed: [], fi: -1, rt: 0, hold: 0, slow: 0, slowDur: 1, flash: 0, loops: 0, kills: 0, errs: 0, frames: 0, began: UI.t };
    begin(P);
    return P;
  }
  /* 결과 화면이 다 뜨면 다시 보기가 화면(구멍 안)을 맡는다 (main.js 가 묻는다) */
  R.live = function () { const rep = R.rep; return !!(rep && rep.clip && UI.ended && UI.ended.t >= START && TW.App && TW.App.G === rep.G); };
  /* 화면 가운데와 다시 보기 구멍 가운데의 차이(땅 단위): 결과 화면이 떠오르는 동안 끝 장면(큰등불)을 구멍 안으로 옮긴다 */
  R.holeShift = function () {
    if (!R.rep || !UI.ended || UI.ended.t < 1.0) return null;
    const L = R.layout(), k = UI.us * ((TW.App && TW.App.dpr) || 1), H = L.hole, s = W.scale();
    return { x: -(((H.x + H.w / 2) * k) - W.vw / 2) / s, y: -(((H.y + H.h / 2) * k) - W.vh / 2) / (s * W.K) };
  };
  function camera(P, rdt, alpha) {
    const c = P.clip, i0 = Math.max(0, P.fi), i1 = Math.min(c.N - 1, i0 + 1), k = P.hold > 0 ? 0 : alpha;
    const fx = U.lerp(c.path[i0 * 2], c.path[i1 * 2], k), fy = U.lerp(c.path[i0 * 2 + 1], c.path[i1 * 2 + 1], k);
    const L = R.layout(), us = UI.us * ((TW.App && TW.App.dpr) || 1), H = L.hole, cam = W.cam;
    const hw = H.w * us, hh = H.h * us;
    cam.zoom = U.clamp(Math.min(hw / W.S / (c.spanX * 2), hh / (W.S * W.K) / (c.spanY * 2)), 0.6, 1.15);
    cam.trauma = Math.max(0, cam.trauma - rdt * 1.9);
    const tr = cam.trauma * cam.trauma, tt = W.time * 31;
    cam.sx = (U.noise2(tt, 1.3, 7) - 0.5) * 1.5 * tr; cam.sy = (U.noise2(3.7, tt, 11) - 0.5) * 1.5 * tr; cam.kx = cam.ky = cam.kvx = cam.kvy = 0; cam.kfresh = false;
    cam.punch += (0 - cam.punch) * Math.min(1, rdt * 7);
    const s = W.scale(), hx0 = H.x * us, hy0 = H.y * us;
    cam.x = fx - (hx0 + hw / 2 - W.vw / 2) / s; cam.y = fy - 1.1 - (hy0 + hh / 2 - W.vh / 2) / (s * W.K);
    // 그릴 범위는 구멍 안만 (밖의 타일은 만들지도 그리지도 않는다)
    const v = W.view, ox = cam.x + cam.sx, oy = cam.y + cam.sy;
    v.x0 = ox + (hx0 - W.vw / 2) / s; v.x1 = ox + (hx0 + hw - W.vw / 2) / s; v.y0 = oy + (hy0 - W.vh / 2) / (s * W.K); v.y1 = oy + (hy0 + hh - W.vh / 2) / (s * W.K);
  }
  /* main.js 의 한 프레임: 다시 보기를 한 걸음 돌리고 구멍 안에 그린다 */
  R.frame = function (ctx, rdt) {
    const rep = R.rep; let P = R.P;
    if (!P || P.rep !== rep) P = R.P = startPlay(rep);
    const c = P.clip;
    let sp = 1;
    if (P.slow > 0) { P.slow = Math.max(0, P.slow - rdt); const k = 1 - P.slow / P.slowDur; sp = 0.25 + 0.75 * k * k * k; }      // 영웅이 쓰러지는 순간: 0.25배에서 부드럽게 제 속도로
    if (P.hold > 0) { P.hold -= rdt; if (P.hold <= 0) { P.loops++; begin(P); } }
    else {
      P.rt += rdt * sp;
      const want = Math.min(c.N - 1, Math.floor(P.rt / DT));
      let g = 0; while (P.fi < want && g++ < 12) { P.fi++; applyFrame(P, P.fi); emitFrame(P, P.fi); }
      if (P.fi >= c.N - 1 && P.rt >= c.N * DT) { P.hold = 1.6; P.lastKills = P.kills; }          // 끝에서 잠깐 멈췄다가 처음부터
    }
    if (P.flash > 0) P.flash = Math.max(0, P.flash - rdt * 2.4);
    const alpha = P.hold > 0 ? 1 : U.clamp(P.rt / DT - P.fi, 0, 1), fdt = rdt * sp;
    W.update(fdt, alpha); W.fxUpdate(fdt); W.impactTick(rdt);
    camera(P, rdt, alpha);
    W.noOverlay = false; W.hover = null; W.aim = null; W.click = null;
    const L = R.layout(), k = UI.us * ((TW.App && TW.App.dpr) || 1), H = L.hole;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(H.x * k, H.y * k, H.w * k, H.h * k); ctx.clip();
    W.render(ctx);
    ctx.restore();
    P.frames++;
  };

  /* =====================================================================
     ④ 결과 화면 그리기 (디자인 단위 1600×900 · 넓은 화면은 가운데)
     ===================================================================== */
  R.layout = function () {
    const ox = (UI.W - 1600) / 2, oy = Math.max(0, (UI.H - 900) / 2);
    return {
      ox, oy,
      hole: { x: ox + 36, y: oy + 96, w: 912, h: 513 },          // 16:9
      gold: { x: ox + 36, y: oy + 626, w: 448, h: 250 }, dmg: { x: ox + 500, y: oy + 626, w: 448, h: 250 },
      mvp: { x: ox + 968, y: oy + 96, w: 596, h: 170 }, list: { x: ox + 968, y: oy + 276, w: 596, h: 508 },
      again: { x: ox + 968, y: oy + 796, w: 380, h: 80 }, menu: { x: ox + 1360, y: oy + 796, w: 204, h: 80 },
    };
  };
  R.endBtn = function () { const A = R.layout().again; return { x: A.x + A.w / 2, y: A.y + A.h / 2 }; };
  const ease = (x) => U.easeOut3(U.clamp(x, 0, 1));
  function backdrop(ctx, L, a) {
    const H = L.hole, w = UI.W, h = UI.H;
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a0d24'); g.addColorStop(0.55, '#0e1430'); g.addColorStop(1, '#090b1c');
    ctx.globalAlpha = a; ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, H.y); ctx.fillRect(0, H.y + H.h, w, h - H.y - H.h); ctx.fillRect(0, H.y, H.x, H.h); ctx.fillRect(H.x + H.w, H.y, w - H.x - H.w, H.h);
    // 위쪽에 늘어진 등불 줄 (메뉴의 등불 축제와 같은 결)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) { const x = (i + 0.5) / 18 * w, y = 10 + Math.sin((i + 0.5) / 18 * Math.PI) * 14 + Math.sin(UI.t * 1.3 + i) * 1.5; X.glow(ctx, x, y, 22, i % 3 ? '#ffb86a' : '#ff9a7a', 0.16 * a); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function panel(ctx, x, y, w, h, line) { X.rr(ctx, x, y, w, h, 14); ctx.fillStyle = 'rgba(12,15,38,0.96)'; ctx.fill(); ctx.strokeStyle = line || 'rgba(190,180,255,0.2)'; ctx.lineWidth = 1; ctx.stroke(); }
  function crown(ctx, x, y, s, col) {
    ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.55); ctx.lineTo(x - s, y - s * 0.35); ctx.lineTo(x - s * 0.5, y + s * 0.05); ctx.lineTo(x, y - s * 0.6); ctx.lineTo(x + s * 0.5, y + s * 0.05); ctx.lineTo(x + s, y - s * 0.35); ctx.lineTo(x + s, y + s * 0.55); ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(40,24,4,0.8)'; ctx.lineWidth = Math.max(1, s * 0.12); ctx.stroke();
  }
  function header(ctx, G, me, L, rep, a) {
    const e = UI.ended, win = e.win, col = win ? '#ffd84a' : '#b9a6e8', x = L.ox + 40, y = L.oy + 46, tu = G.stat.timeUp;
    ctx.globalAlpha = a;
    X.text(ctx, me ? (win ? '승리' : '패배') : (C.TEAM_NAMES[G.winner] + ' 승리'), x, y, 52, col, 'left', 900, 'rgba(4,6,18,0.9)', 6);
    const sub = (tu ? '시간 종료 · 큰등불 ' + Math.round(tu.frac[0] * 100) + '% : ' + Math.round(tu.frac[1] * 100) + '%' : (win ? '적의 큰등불을 껐습니다' : me ? '우리 큰등불이 꺼졌습니다' : '큰등불이 꺼졌습니다')) + '  ·  ' + fmtT(rep.endT) + '  ·  ' + C.MODE_NAME[G.mode || 'classic'] + ' ' + G.size + '대' + G.size;
    const tw = X.textW(ctx, me ? (win ? '승리' : '패배') : '새벽 승리', 52, 900);
    X.text(ctx, sub, x + tw + 22, y + 4, 15, INK2, 'left', 700);
    // 한 줄 난전: 이긴 편이 한때 역전 기회를 받을 만큼(처치 CB_ON 이상) 뒤졌던 판이면 '역전승' 도장
    const cbs = G.brawl && G.stat.cb, wd = cbs && G.winner >= 0 ? cbs.maxDef[G.winner] : 0;
    if (wd >= (C.BRAWL.CB_ON[G.size] || 6)) {
      const won = !me || win, str = won ? '역전승! 한때 처치 ' + wd + ' 뒤졌던 판' : '역전패 — 한때 처치 ' + wd + ' 앞섰던 판', cx0 = x + tw + 22 + X.textW(ctx, sub, 15, 700) + 16, cw = X.textW(ctx, str, 14, 900) + 26;
      X.rr(ctx, cx0, y + 4 - 13, cw, 26, 13); ctx.fillStyle = won ? 'rgba(70,44,6,0.95)' : 'rgba(40,16,30,0.95)'; ctx.fill(); ctx.strokeStyle = won ? '#ffd36a' : '#ff9a8a'; ctx.lineWidth = 2; ctx.stroke();
      X.text(ctx, str, cx0 + 13, y + 4.5, 14, won ? '#ffe9a0' : '#ffc0c8', 'left', 900);
    }
    // 처치 점수: 새벽 14 : 9 황혼
    const sx = L.ox + 948 - 8, k0 = String(G.teams[0].kills), k1 = String(G.teams[1].kills);
    X.text(ctx, k1, sx, y, 34, C.TEAM_COL[1], 'right', 900, 'rgba(4,6,18,0.9)', 5);
    const w1 = X.textW(ctx, k1, 34, 900);
    X.text(ctx, ':', sx - w1 - 12, y - 2, 26, INK3, 'center', 900);
    X.text(ctx, k0, sx - w1 - 24, y, 34, C.TEAM_COL[0], 'right', 900, 'rgba(4,6,18,0.9)', 5);
    const w0 = X.textW(ctx, k0, 34, 900);
    X.text(ctx, '처치', sx - w1 - 32 - w0, y + 2, 13, INK3, 'right', 700);
    ctx.globalAlpha = 1;
  }
  /* 이번 판 내 등급 (실버 · 골드 · 프리즘): 머리줄 오른쪽 — 메달 · 등급 · 점수 · 점수의 속(승패 · 싸움 · 몫 · 밀기) · 다음 등급까지 */
  R.gradeRect = function () { const L = R.layout(); return { x: L.ox + 968, y: L.oy + 18, w: 596, h: 68 }; };
  function gradeCard(ctx, G, me, L, a, t) {
    const e = UI.ended, g = e && e.grade; if (!g || !me || !TW.BOON_TIERS) return;
    const B = R.gradeRect(), T = TW.BOON_TIERS[g.tier], k = ease((t - 1.9) / 0.45); if (k <= 0) return;
    const stroke = TW.UIStar && T.rainbow ? TW.UIStar.tierStroke(ctx, T, B.x, B.w, UI.t, B.y, B.h) : T.col;
    ctx.save(); ctx.globalAlpha = a * k;
    X.rr(ctx, B.x, B.y, B.w, B.h, 16);
    const bg = ctx.createLinearGradient(B.x, 0, B.x + B.w, 0); bg.addColorStop(0, U.mix(T.deep, '#0a0c22', 0.25)); bg.addColorStop(0.5, 'rgba(12,15,38,0.96)'); bg.addColorStop(1, 'rgba(12,15,38,0.96)');
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = g.tier === 2 ? 3 : g.tier === 1 ? 2.4 : 1.6; ctx.stroke();
    // 메달: 등급 빛의 별 (떠오를 때 한 번 커졌다 앉는다)
    const mx = B.x + 40, my = B.y + B.h / 2, pop = 1 + 0.5 * Math.max(0, 1 - (t - 1.9) / 0.5);
    ctx.globalCompositeOperation = 'lighter'; X.glow(ctx, mx, my, 44, T.col, 0.3 * a * k); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * k;
    X.circle(ctx, mx, my, 25 * pop); ctx.fillStyle = 'rgba(6,8,22,0.95)'; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke();
    X.star(ctx, mx, my + 1, 15 * pop, 5, 0.48, -Math.PI / 2); ctx.fillStyle = T.rainbow ? stroke : T.col; ctx.fill();
    X.text(ctx, '이번 판 내 등급', B.x + 78, B.y + 19, 11.5, INK3, 'left', 800);
    X.text(ctx, T.name, B.x + 78, B.y + 45, 28, T.glow, 'left', 900, 'rgba(4,6,18,0.9)', 4);
    const nw = X.textW(ctx, T.name, 28, 900);
    X.text(ctx, g.score + '점', B.x + 88 + nw, B.y + 48, 16, '#ffffff', 'left', 900);
    if (e.gradeUp) UI.chip(ctx, '내 최고 기록!', B.x + 88 + nw + 92, B.y + 47, 10.5, '#0b0d22', '#8dffb4', 7);
    // 점수의 속: 네 칸 막대
    const px = B.x + 322, pw = 58;
    for (let i = 0; i < g.parts.length; i++) {
      const p = g.parts[i], x = px + i * (pw + 8), fr = U.clamp(p[1] / p[2], 0, 1) * ease((t - 2.0 - i * 0.08) / 0.4);
      X.text(ctx, p[0], x, B.y + 18, 11, INK3, 'left', 700); X.text(ctx, p[1] + '/' + p[2], x + pw, B.y + 18, 11, '#ffffff', 'right', 800);
      X.rr(ctx, x, B.y + 27, pw, 6, 3); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
      if (fr > 0.02) { X.rr(ctx, x, B.y + 27, pw * fr, 6, 3); ctx.fillStyle = T.rainbow ? '#d3b0ff' : T.col; ctx.fill(); }
    }
    X.text(ctx, (g.tier >= 2 ? '가장 높은 등급' : TW.BOON_TIERS[g.tier + 1].name + '까지 ' + g.next + '점') + ' · 골드 50점~ · 프리즘 75점~', px, B.y + 52, 11, '#cfd6ee', 'left', 600);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  /* 다시 보기 구멍의 테두리와 그 위의 글자들 (월드는 이미 구멍 안에 그려져 있다) */
  function holeFrame(ctx, G, me, L, rep, a) {
    const H = L.hole, P = R.P, live = R.live() && P, clip = rep.clip, e = UI.ended;
    ctx.globalAlpha = a;
    // 테두리: 이긴 편 빛깔로 은은하게
    X.rr(ctx, H.x - 2, H.y - 2, H.w + 4, H.h + 4, 12); ctx.strokeStyle = U.rgba(C.TEAM_COL[Math.max(0, G.winner)], 0.85); ctx.lineWidth = 2.5; ctx.stroke();
    if (!clip) { X.text(ctx, '다시 볼 장면이 없습니다', H.x + H.w / 2, H.y + H.h / 2, 18, INK2, 'center', 800, 'rgba(4,6,18,0.9)', 4); ctx.globalAlpha = 1; return; }
    if (!live) {
      ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#05060f'; ctx.fillRect(H.x, H.y, H.w, H.h); ctx.globalAlpha = a;
      const k = U.clamp((e.t - 1.2) / 0.9, 0, 1);
      X.text(ctx, '마지막 한타를 다시 봅니다…', H.x + H.w / 2, H.y + H.h / 2, 22, INK, 'center', 900, 'rgba(4,6,18,0.9)', 5);
      X.rr(ctx, H.x + H.w / 2 - 120, H.y + H.h / 2 + 26, 240, 6, 3); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
      X.rr(ctx, H.x + H.w / 2 - 120, H.y + H.h / 2 + 26, 240 * k, 6, 3); ctx.fillStyle = '#ffd98a'; ctx.fill();
      ctx.globalAlpha = 1; return;
    }
    // 위 왼쪽: 무엇을 보고 있나
    const lbl = clip.kind === 'fight' ? '다시 보기 · 마지막 한타' : '다시 보기 · 마지막 10초', tr = fmtT(clip.t0) + ' – ' + fmtT(clip.t1);
    const lw = X.textW(ctx, lbl, 16, 900) + X.textW(ctx, tr, 13, 700) + 64;
    X.rr(ctx, H.x + 12, H.y + 12, lw, 34, 17); ctx.fillStyle = 'rgba(6,8,22,0.78)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(H.x + 28, H.y + 21); ctx.lineTo(H.x + 40, H.y + 29); ctx.lineTo(H.x + 28, H.y + 37); ctx.closePath(); ctx.fillStyle = '#ff6a7c'; ctx.fill();     // ▶
    X.text(ctx, lbl, H.x + 48, H.y + 29.5, 16, INK, 'left', 900);
    X.text(ctx, tr, H.x + 48 + X.textW(ctx, lbl, 16, 900) + 10, H.y + 30, 13, INK2, 'left', 700);
    // 느린 화면 표시
    if (P.slow > 0.05) { const s = 0.25 + 0.75 * Math.pow(1 - P.slow / P.slowDur, 3); X.text(ctx, '느린 화면 ×' + s.toFixed(2), H.x + H.w - 16, H.y + H.h - 46, 14, '#ffd98a', 'right', 900, 'rgba(4,6,18,0.9)', 4); }
    // 위 오른쪽: 이 다시 보기 속 처치
    let fy = H.y + 16;
    for (const f of P.feed) {
      const age = P.rt - f.at, k = U.clamp(1 - (age - 3.2) / 0.5, 0, 1); if (k <= 0) continue;
      const w = 236, x = H.x + H.w - w - 12, slide = (1 - ease(age / 0.25)) * 40;
      ctx.globalAlpha = a * k;
      X.rr(ctx, x + slide, fy, w, 38, 19); ctx.fillStyle = 'rgba(6,8,22,0.82)'; ctx.fill(); ctx.strokeStyle = U.rgba(C.TEAM_COL[f.team], 0.7); ctx.lineWidth = 1.5; ctx.stroke();
      if (f.killer) { UI.portrait(ctx, f.killer.heroId, x + slide + 20, fy + 19, 14, C.TEAM_COL[f.killer.team]); X.text(ctx, f.killer.name, x + slide + 40, fy + 19.5, 13, INK, 'left', 800); }
      else X.text(ctx, '처치', x + slide + 14, fy + 19.5, 13, INK2, 'left', 800);
      ctx.beginPath(); ctx.moveTo(x + slide + 132, fy + 13); ctx.lineTo(x + slide + 144, fy + 19); ctx.lineTo(x + slide + 132, fy + 25); ctx.closePath(); ctx.fillStyle = '#ff6a7c'; ctx.fill();
      UI.portrait(ctx, f.victim.heroId, x + slide + 166, fy + 19, 14, C.TEAM_COL[f.victim.team], true);
      X.text(ctx, f.victim.name, x + slide + 186, fy + 19.5, 13, INK2, 'left', 800);
      fy += 44;
    }
    ctx.globalAlpha = a;
    // 가장 빛난 영웅: 다시 보기 속에서도 머리 위 금빛 표
    const mh = rep.G.heroes[rep.mvp], mp = mh && P.pup.get(mh.id);
    if (mp && !mp.dead && mp._f === P.fi) {
      const al = W.alpha, wx = mp.px + (mp.x - mp.px) * al, wy = mp.py + (mp.y - mp.py) * al, o = W.toScreen(wx, wy, { x: 0, y: 0 }, 2.72 * W.HS + 2.0 + (mp.z || 0)), k = UI.us * ((TW.App && TW.App.dpr) || 1);       // 체력 막대·이름표 바로 위
      const sx = o.x / k, sy = o.y / k;
      if (sx > H.x + 30 && sx < H.x + H.w - 30 && sy > H.y + 24 && sy < H.y + H.h - 10) {
        const bob = Math.sin(UI.t * 4) * 2;
        X.rr(ctx, sx - 30, sy - 14 + bob, 60, 22, 11); ctx.fillStyle = '#ffd84a'; ctx.fill(); ctx.strokeStyle = 'rgba(40,24,4,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
        crown(ctx, sx - 16, sy - 3 + bob, 6, '#fff3c0');
        X.text(ctx, 'MVP', sx + 7, sy - 2.5 + bob, 12.5, '#2a1a04', 'center', 900);
      }
    }
    // 아래: 진행 막대 + 처치 눈금
    const bx = H.x + 16, bw = H.w - 32, by = H.y + H.h - 18, prog = P.hold > 0 ? 1 : U.clamp(P.rt / (clip.N * DT), 0, 1);
    X.rr(ctx, bx, by, bw, 6, 3); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
    X.rr(ctx, bx, by, Math.max(6, bw * prog), 6, 3); ctx.fillStyle = '#ffd98a'; ctx.fill();
    for (const kl of clip.kills) { const x = bx + bw * kl.i / Math.max(1, clip.N - 1); X.circle(ctx, x, by + 3, 5); ctx.fillStyle = SURF; ctx.fill(); X.circle(ctx, x, by + 3, 3.5); ctx.fillStyle = C.TEAM_COL[kl.team]; ctx.fill(); }
    if (P.hold > 0) X.text(ctx, '처음부터 다시…', H.x + H.w / 2, H.y + H.h - 40, 15, INK, 'center', 900, 'rgba(4,6,18,0.9)', 4);
    // 다시 보기가 시작되는 순간 / 처치의 순간: 테두리 안쪽이 번쩍
    if (P.flash > 0) { ctx.globalAlpha = a * P.flash * 0.5; X.rr(ctx, H.x + 2, H.y + 2, H.w - 4, H.h - 4, 10); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  function mvpCard(ctx, G, me, L, rep, a, t) {
    const M = L.mvp, r = rep.rows[rep.mvp], h = r.h, k = ease((t - 1.45) / 0.45); if (k <= 0) return;
    ctx.save(); ctx.globalAlpha = a * k; ctx.translate(M.x + M.w / 2, M.y + M.h / 2); const sc = 0.9 + 0.1 * U.easeBack(Math.min(1, (t - 1.45) / 0.45)); ctx.scale(sc, sc); ctx.translate(-M.x - M.w / 2, -M.y - M.h / 2);
    X.rr(ctx, M.x, M.y, M.w, M.h, 18);
    const g = ctx.createLinearGradient(M.x, M.y, M.x + M.w, M.y + M.h); g.addColorStop(0, 'rgba(62,46,12,0.96)'); g.addColorStop(0.5, 'rgba(24,20,36,0.96)'); g.addColorStop(1, 'rgba(14,16,40,0.96)');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2; ctx.stroke();
    // 금빛이 훑고 지나간다
    { const sw = ((UI.t * 0.35) % 1.6) - 0.3, sx = M.x + sw * M.w; ctx.save(); X.rr(ctx, M.x, M.y, M.w, M.h, 18); ctx.clip(); const sg = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0); sg.addColorStop(0, 'rgba(255,230,140,0)'); sg.addColorStop(0.5, 'rgba(255,230,140,0.10)'); sg.addColorStop(1, 'rgba(255,230,140,0)'); ctx.fillStyle = sg; ctx.fillRect(sx - 60, M.y, 120, M.h); ctx.restore(); }
    const px = M.x + 76, py = M.y + 88;
    ctx.globalCompositeOperation = 'lighter'; X.glow(ctx, px, py, 92, '#ffcf4a', 0.28 * a * k); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * k;
    UI.portrait(ctx, h.heroId, px, py, 52, '#ffd84a');
    crown(ctx, px, py - 62, 15, '#ffd84a');
    UI.chip(ctx, 'MVP', px, py + 56, 13, '#2a1a04', '#ffd84a', 12);
    const tx = M.x + 150;
    X.text(ctx, '가장 빛난 영웅', tx, M.y + 26, 13, '#ffe2a6', 'left', 800);
    X.text(ctx, h.name, tx, M.y + 58, 32, '#ffffff', 'left', 900, 'rgba(4,6,18,0.85)', 5);
    const nw = X.textW(ctx, h.name, 32, 900);
    X.text(ctx, h.hd.title + ' · ' + C.TEAM_NAMES[h.team], tx + nw + 14, M.y + 62, 14, C.TEAM_LIGHT[h.team], 'left', 700);
    if (h === me) UI.chip(ctx, '바로 나!', M.x + M.w - 56, M.y + 26, 12, '#0b0d22', '#ffffff', 9);
    // 까닭 한 줄 (넘치면 글자를 줄인다)
    let fs = 18; while (fs > 13 && X.textW(ctx, rep.reason, fs, 800) > M.w - 168) fs -= 0.5;
    X.text(ctx, rep.reason, tx, M.y + 100, fs, '#fff3d0', 'left', 800);
    X.text(ctx, '처치 ' + r.k + ' · 죽음 ' + r.d + ' · 도움 ' + r.a + '   ·   영웅 피해 ' + cm(r.dmg) + '   ·   번 골드 ' + cm(r.gold), tx, M.y + 136, 13, INK2, 'left', 700);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function heroList(ctx, G, me, L, rep, a, t) {
    const Ls = L.list, n = G.heroes.length, per = n / 2, rowH = per <= 3 ? 70 : 42, gap = per <= 3 ? 4 : 3, headH = 25, tgap = 6;       // 5대5: 2 × 25 + 10 × 45 + 6 = 506 ≤ 508
    let y = Ls.y;
    for (let tm = 0; tm < 2; tm++) {
      const T = G.teams[tm], col = C.TEAM_COL[tm];
      const kh = ease((t - 1.5 - tm * 0.15) / 0.3); if (kh <= 0) { y += headH + per * (rowH + gap) + tgap; continue; }
      ctx.globalAlpha = a * kh;
      X.text(ctx, C.TEAM_NAMES[tm] + (G.winner === tm ? '  ·  승리' : ''), Ls.x + 4, y + 12, 16, col, 'left', 900);
      X.text(ctx, '처치 ' + T.kills + '  ·  등불탑 ' + T.towers + '/' + (T.towersMax || 6) + (G.brawl ? '  ·  회복 꾸러미 ' + G.stat.packs[tm] : '  ·  이무기 ' + T.bossKills), Ls.x + Ls.w - 4, y + 12, 12.5, INK3, 'right', 700);
      ctx.fillStyle = U.rgba(col, 0.6); ctx.fillRect(Ls.x, y + headH - 3, Ls.w, 1.5);
      y += headH;
      for (const r of rep.rows) {
        if (r.team !== tm) continue;
        const h = r.h, i = r.i, kk = ease((t - 1.6 - i * 0.05) / 0.3); if (kk <= 0) { y += rowH + gap; continue; }
        const slide = (1 - kk) * 40, x = Ls.x + slide, mine = h === me, best = i === rep.mvp, ace = i === rep.ace, pr = rep.praise[i];
        ctx.globalAlpha = a * kk;
        X.rr(ctx, x, y, Ls.w, rowH, 10); ctx.fillStyle = mine ? 'rgba(70,74,140,0.6)' : 'rgba(16,19,46,0.92)'; ctx.fill();
        if (best) { ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.6; ctx.stroke(); } else if (mine) { ctx.strokeStyle = 'rgba(232,236,255,0.6)'; ctx.lineWidth = 1.2; ctx.stroke(); }
        const pr0 = rowH <= 46 ? 16 : 24, cy = y + rowH / 2;
        UI.portrait(ctx, h.heroId, x + 8 + pr0, cy, pr0, best ? '#ffd84a' : col);
        const tx = x + 16 + pr0 * 2, l1 = rowH <= 46 ? y + 13 : y + 22, l2 = rowH <= 46 ? y + 30.5 : y + 48;
        X.text(ctx, h.name, tx, l1, 15, '#ffffff', 'left', 900);
        let cx = tx + X.textW(ctx, h.name, 15, 900) + 8;
        if (mine) { const w = UI.chip(ctx, '나', cx + 12, l1, 10.5, '#0b0d22', '#e8ecff', 6); cx += w + 4; }
        if (best) { const w = UI.chip(ctx, 'MVP', cx + 20, l1, 10.5, '#2a1a04', '#ffd84a', 7); cx += w + 4; }
        else if (ace) { const w = UI.chip(ctx, '진 편의 에이스', cx + 42, l1, 10.5, '#0b0d22', '#c9bcff', 7); cx += w + 4; }
        X.text(ctx, h.level + '레벨', cx + 4, l1 + 0.5, 11, INK3, 'left', 700);
        // 판 결과 등급 딱지 (실버 · 골드 · 프리즘) · 별비 난전이면 가진 별조각도
        if (TW.gradeOf && TW.BOON_TIERS) { const gr = (rep.grades = rep.grades || {})[i] || (rep.grades[i] = TW.gradeOf(G, h)), GT = TW.BOON_TIERS[gr.tier]; UI.chip(ctx, GT.name + ' ' + gr.score, x + Ls.w - 236, l1, 10.5, '#0b0d22', GT.rainbow ? '#d3b0ff' : GT.col, 6); }
        if (G.star && TW.UIStar && h.boons) for (let q = 0; q < h.boons.length; q++) TW.UIStar.chip(ctx, h.boons[q], x + Ls.w - 20 - (h.boons.length - 1 - q) * 22, l2 - 0.5, 9, a * kk);
        // 오른쪽: 처치/죽음/도움 · 피해
        X.text(ctx, r.k + ' / ' + r.d + ' / ' + r.a, x + Ls.w - 118, l1, 15, INK, 'right', 900);
        X.text(ctx, '피해 ' + kfmt(r.dmg), x + Ls.w - 12, l1, 12.5, INK2, 'right', 700);
        // 칭찬 한 줄
        X.text(ctx, pr.title, tx, l2, 13, '#ffe2a6', 'left', 900);
        X.text(ctx, '— ' + pr.detail, tx + X.textW(ctx, pr.title, 13, 900) + 8, l2, 12.5, '#cfd6ee', 'left', 600);
        y += rowH + gap;
      }
      y += tgap;
    }
    ctx.globalAlpha = 1;
  }
  /* 그래프 공통: 바탕 판 · 제목 · 범례(색 견본 + 글자는 글자색) */
  function chartFrame(ctx, B, title, sub, legend, a) {
    ctx.globalAlpha = a; panel(ctx, B.x, B.y, B.w, B.h);
    X.text(ctx, title, B.x + 16, B.y + 20, 15, INK, 'left', 900);
    X.text(ctx, sub, B.x + 16 + X.textW(ctx, title, 15, 900) + 10, B.y + 21, 11.5, INK3, 'left', 600);
    let lx = B.x + B.w - 14;
    for (let i = legend.length - 1; i >= 0; i--) { const [lab, col] = legend[i], w = X.textW(ctx, lab, 11.5, 700); X.text(ctx, lab, lx, B.y + 42, 11.5, INK2, 'right', 700); lx -= w + 6; X.rr(ctx, lx - 12, B.y + 37, 12, 10, 3); ctx.fillStyle = col; ctx.fill(); lx -= 24; }
    return { x: B.x + 50, y: B.y + 56, w: B.w - 66, h: B.h - 86 };
  }
  function tipBox(ctx, x, y, lines, P) {
    let w = 0; for (const l of lines) w = Math.max(w, X.textW(ctx, l[0], 12.5, l[2] || 700)); w += 22;
    const h = 12 + lines.length * 19, bx = U.clamp(x + 12, P.x, P.x + P.w - w), by = U.clamp(y - h - 10, P.y - 40, P.y + P.h - h);
    X.rr(ctx, bx, by, w, h, 8); ctx.fillStyle = 'rgba(4,6,18,0.96)'; ctx.fill(); ctx.strokeStyle = 'rgba(190,180,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    for (let i = 0; i < lines.length; i++) X.text(ctx, lines[i][0], bx + 11, by + 16 + i * 19, 12.5, lines[i][1] || INK, 'left', lines[i][2] || 700);
  }
  /* 다시 본 구간의 이름: 그림판 안 위쪽, 띠 옆에 (범례와 겹치지 않게) */
  function bandLabel(ctx, P, xa, xb, sec, low) {
    const right = xb > P.x + P.w * 0.62, lab = '다시 본 ' + sec + '초';
    X.text(ctx, right ? lab + ' ▸' : '◂ ' + lab, right ? xa - 5 : xb + 5, low ? P.y + P.h - 9 : P.y + 9, 10.5, '#ffd98a', right ? 'right' : 'left', 800, 'rgba(12,15,38,0.92)', 3);
  }
  function timeAxis(ctx, P, endT) {
    const step = endT > 1200 ? 300 : endT > 420 ? 120 : 60;
    for (let s = 0; s <= endT + 1e-6; s += step) { const x = P.x + P.w * s / endT; ctx.fillStyle = GRID; ctx.fillRect(x, P.y, 1, P.h); X.text(ctx, fmtT(s), x, P.y + P.h + 13, 10.5, INK3, 'center', 600); }
  }
  function goldChart(ctx, G, L, rep, a, t) {
    const B = L.gold, P = chartFrame(ctx, B, '골드 차이', '새벽 − 황혼 · 팀이 번 골드', [['새벽 앞섬', CH_COL[0]], ['황혼 앞섬', CH_COL[1]]], a);
    const S = rep.lead, endT = Math.max(1, rep.endT); if (S.length < 2) { ctx.globalAlpha = 1; return; }
    let mx = 0; for (const s of S) mx = Math.max(mx, Math.abs(s.v)); const M = niceCeil(Math.max(400, mx * 1.08));
    const X0 = (tt) => P.x + P.w * U.clamp(tt / endT, 0, 1), Y = (v) => P.y + P.h / 2 - (v / M) * (P.h / 2), y0 = Y(0);
    // 눈금(가는 실선) · 0 은 조금 진하게
    for (const v of [M, M / 2, 0, -M / 2, -M]) { const y = Y(v); ctx.fillStyle = v === 0 ? 'rgba(255,255,255,0.24)' : GRID; ctx.fillRect(P.x, Math.round(y), P.w, 1); X.text(ctx, v > 0 ? '+' + kfmt(v) : kfmt(v), P.x - 6, y, 10.5, INK3, 'right', 600); }
    timeAxis(ctx, P, endT);
    // 다시 본 구간
    const c = rep.clip; if (c) { const xa = X0(c.t0), xb = X0(c.t1); ctx.fillStyle = 'rgba(255,217,138,0.10)'; ctx.fillRect(xa, P.y, Math.max(2, xb - xa), P.h); bandLabel(ctx, P, xa, xb, Math.round(c.N / FPS), S[S.length - 1].v >= 0); }      // 끝값이 위에 있으면 이름은 아래에
    // 선을 그려 나간다 (결과 화면이 뜨면 왼쪽에서 오른쪽으로)
    const rv = ease((t - 1.9) / 1.1), tEnd = endT * rv; let n = 0; while (n < S.length && S[n].t <= tEnd + 1e-6) n++;
    if (n >= 2) {
      const path = () => { ctx.beginPath(); for (let i = 0; i < n; i++) { const x = X0(S[i].t), y = Y(S[i].v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } };
      const area = (sign) => { ctx.save(); ctx.beginPath(); if (sign > 0) ctx.rect(P.x, P.y - 2, P.w, y0 - P.y + 2); else ctx.rect(P.x, y0, P.w, P.y + P.h - y0 + 2); ctx.clip(); path(); ctx.lineTo(X0(S[n - 1].t), y0); ctx.lineTo(X0(S[0].t), y0); ctx.closePath(); ctx.fillStyle = U.rgba(CH_COL[sign > 0 ? 0 : 1], 0.22); ctx.fill(); ctx.restore(); };
      area(1); area(-1);
      ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y - 2, P.w, y0 - P.y + 2); ctx.clip(); path(); ctx.strokeStyle = CH_COL[0]; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(P.x, y0, P.w, P.y + P.h - y0 + 2); ctx.clip(); path(); ctx.strokeStyle = CH_COL[1]; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
      // 끝값: 점 + 글자 (글자는 글자색, 빛깔은 점이 맡는다)
      const last = S[n - 1], ex = X0(last.t), ey = Y(last.v), lc = last.v >= 0 ? CH_COL[0] : CH_COL[1];
      X.circle(ctx, ex, ey, 6); ctx.fillStyle = SURF; ctx.fill(); X.circle(ctx, ex, ey, 4); ctx.fillStyle = lc; ctx.fill();
      if (rv >= 1) X.text(ctx, (last.v >= 0 ? '새벽 +' : '황혼 +') + cm(Math.abs(last.v)), Math.min(ex - 8, P.x + P.w - 4), ey + (last.v >= 0 ? -13 : 14), 12, INK, 'right', 800);
    }
    // 가리키면: 세로 실선 + 점 + 그 순간의 값
    if (UI.over(P.x, P.y - 8, P.w, P.h + 16) && rv >= 1) {
      const tt = U.clamp((UI.mx - P.x) / P.w, 0, 1) * endT; let bi = 0; for (let i = 0; i < S.length; i++) if (Math.abs(S[i].t - tt) < Math.abs(S[bi].t - tt)) bi = i;
      const s = S[bi], x = X0(s.t), y = Y(s.v);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x, P.y, 1, P.h);
      X.circle(ctx, x, y, 6); ctx.fillStyle = SURF; ctx.fill(); X.circle(ctx, x, y, 4); ctx.fillStyle = s.v >= 0 ? CH_COL[0] : CH_COL[1]; ctx.fill();
      tipBox(ctx, x, y, [[fmtT(s.t), INK3, 600], [(s.v >= 0 ? '새벽이 ' : '황혼이 ') + cm(Math.abs(s.v)) + ' 골드 앞섬'], ['새벽 ' + cm(s.a) + ' · 황혼 ' + cm(s.b), INK2, 600]], P);
    }
    ctx.globalAlpha = 1;
  }
  function dmgChart(ctx, G, L, rep, a, t) {
    const B = L.dmg, P = chartFrame(ctx, B, '영웅에게 준 피해', '1분마다', [['새벽', CH_COL[0]], ['황혼', CH_COL[1]]], a);
    const D = rep.dmgMin, nM = D.length; let mx = 0; for (const m of D) mx = Math.max(mx, m.a, m.b);
    const M = niceCeil(Math.max(500, mx * 1.05)), Y = (v) => P.y + P.h - (v / M) * P.h;
    for (const v of [M, M / 2, 0]) { const y = Y(v); ctx.fillStyle = v === 0 ? 'rgba(255,255,255,0.24)' : GRID; ctx.fillRect(P.x, Math.round(y), P.w, 1); X.text(ctx, kfmt(v), P.x - 6, y, 10.5, INK3, 'right', 600); }
    const gw = P.w / nM, bw = Math.max(2, Math.min(24, (gw - 6) / 2)), rv = ease((t - 2.0) / 1.0);
    const c = rep.clip;
    for (const m of D) {
      const gx = P.x + gw * m.m, inClip = c && c.t1 > m.t0 && c.t0 < m.t1;
      if (inClip) { ctx.fillStyle = 'rgba(255,217,138,0.10)'; ctx.fillRect(gx, P.y, gw, P.h); }
      const cx = gx + gw / 2;
      for (let s = 0; s < 2; s++) {
        const v = (s ? m.b : m.a) * rv, h = P.h * v / M, x = s ? cx + 1 : cx - 1 - bw;       // 두 막대 사이 2px 틈
        if (h < 0.5) continue;
        const r = Math.min(4, bw / 2, h);
        ctx.beginPath(); ctx.moveTo(x, P.y + P.h); ctx.lineTo(x, P.y + P.h - h + r); ctx.quadraticCurveTo(x, P.y + P.h - h, x + r, P.y + P.h - h); ctx.lineTo(x + bw - r, P.y + P.h - h); ctx.quadraticCurveTo(x + bw, P.y + P.h - h, x + bw, P.y + P.h - h + r); ctx.lineTo(x + bw, P.y + P.h); ctx.closePath();       // 끝만 4px 둥글게, 바닥은 반듯하게
        ctx.fillStyle = CH_COL[s]; ctx.fill();
      }
      const lab = nM <= 12 || m.m % (nM > 30 ? 10 : 5) === 0;
      if (lab) X.text(ctx, String(m.m + 1), cx, P.y + P.h + 13, 10.5, INK3, 'center', 600);
    }
    X.text(ctx, '분', P.x + P.w + 4, P.y + P.h + 13, 10.5, INK3, 'left', 600);
    if (c) { const i0 = Math.floor(c.t0 / 60), i1 = Math.min(nM - 1, Math.floor((c.t1 - 1e-6) / 60)); bandLabel(ctx, P, P.x + gw * i0, P.x + gw * (i1 + 1), Math.round(c.N / FPS)); }
    if (UI.over(P.x, P.y - 8, P.w, P.h + 16) && rv >= 1) {
      const mi = U.clamp(Math.floor((UI.mx - P.x) / gw), 0, nM - 1), m = D[mi], gx = P.x + gw * mi;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(gx, P.y, gw, P.h);
      tipBox(ctx, gx + gw / 2, Y(Math.max(m.a, m.b)), [[(m.m + 1) + '분째 (' + fmtT(m.t0) + '–' + fmtT(m.t1) + ')', INK3, 600], ['새벽 ' + cm(m.a)], ['황혼 ' + cm(m.b)]], P);
    }
    ctx.globalAlpha = 1;
  }
  function buttons(ctx, G, me, L, rep, a, t) {
    const A = L.again, B = L.menu, ready = t > 1.6, net = !!(TW.App && TW.App.netGame), N = TW.Net, host = net && N && N.host, asked = net && N && !N.host && N.askedAgain;
    const k = ease((t - 1.7) / 0.35); if (k <= 0) return;
    ctx.globalAlpha = a * k;
    const hot = ready && UI.over(A.x, A.y, A.w, A.h) && !asked, done = R.P && R.P.loops > 0;
    // 첫 다시 보기가 끝나면 단추가 숨 쉬듯 빛난다 (다음으로 눈이 가게)
    if (done && !asked) { ctx.globalCompositeOperation = 'lighter'; X.glow(ctx, A.x + A.w / 2, A.y + A.h / 2, A.w * 0.62, '#ffd98a', (0.16 + 0.1 * Math.sin(UI.t * 4)) * a * k); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * k; }
    X.rr(ctx, A.x, A.y, A.w, A.h, 18);
    const g = ctx.createLinearGradient(0, A.y, 0, A.y + A.h); g.addColorStop(0, asked ? '#4a4f72' : hot ? '#ffffff' : '#f6f1e4'); g.addColorStop(1, asked ? '#363a5a' : hot ? '#ffe9b8' : '#ded5bd');
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = asked ? 'rgba(200,206,255,0.5)' : '#ffffff'; ctx.lineWidth = hot ? 3 : 1.5; ctx.stroke();
    const want = host && N.againNames ? N.againNames() : [];       // 친구 방: 한 판 더를 누른 친구
    const big = asked ? '기다리는 중…' : '한 판 더', sub = net ? (host ? (want.length ? want.join(', ') + ' — 한 판 더를 원해요!' : '같은 방 · 같은 놀이로 바로 시작') : asked ? '방장이 누르면 바로 시작해요' : '방장에게 알리기') : (G.star ? '같은 영웅 · 새 별비로 바로 시작' : G.brawl ? '새 무작위 영웅으로 바로 시작' : '같은 영웅 · 같은 자리로 바로 시작');
    X.text(ctx, big, A.x + 28, A.y + 32, 30, asked ? '#e8ecff' : '#141024', 'left', 900);
    X.text(ctx, sub, A.x + 28, A.y + 60, want.length ? 13.5 : 12.5, asked ? '#c9cdf0' : want.length ? '#1f7a4a' : '#4a4256', 'left', want.length ? 900 : 700);
    if (!asked) { UI.chip(ctx, 'Enter', A.x + A.w - 48, A.y + A.h / 2, 13, '#f6f1e4', '#141024', 10); }
    if (hot) UI.cursor = 'pointer';
    if (ready && !asked && UI.hit(A.x, A.y, A.w, A.h, 0)) { if (UI.on.again) UI.on.again(); else if (UI.on.restart) UI.on.restart(); }
    if (ready && UI.button(ctx, net ? '대기실로' : '영웅 선택으로', B.x, B.y, B.w, B.h, { px: 15, r: 18 })) { if (net) { if (UI.on.restart) UI.on.restart(); } else if (UI.on.menu) UI.on.menu(); }
    ctx.globalAlpha = 1;
  }
  /* 결과 화면 (uimenu.js 의 drawEnd 가 먼저 묻는다: 그렸으면 true) */
  R.drawEnd = function (ctx, G, me) {
    const rep = R.rep; if (!rep || rep.G !== G) return false;
    const e = UI.ended; e.t += UI.dt;
    const t = e.t, L = R.layout();
    // ① 큰등불이 터지는 동안: 승패 도장이 내려앉는다 (결과 화면은 아직)
    if (t < 1.6) {
      const k = U.clamp((t - 0.2) / 0.35, 0, 1), out = U.clamp((t - 1.15) / 0.4, 0, 1), sc = 1.7 - 0.7 * U.easeOut3(k), col = e.win ? '#ffd84a' : '#c9b6f2';
      if (k > 0 && out < 1) {
        ctx.save(); ctx.globalAlpha = k * (1 - out); ctx.translate(UI.W / 2, UI.H * 0.42); ctx.scale(sc, sc);
        ctx.globalCompositeOperation = 'lighter'; X.glow(ctx, 0, 0, 260, e.win ? '#ffb84a' : '#7a5ad8', 0.35 * k * (1 - out)); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = k * (1 - out);
        X.text(ctx, me ? (e.win ? '승리!' : '패배') : C.TEAM_NAMES[G.winner] + ' 승리', 0, 0, 96, col, 'center', 900, 'rgba(4,6,18,0.92)', 12);
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }
    // 다시 볼 자리의 땅 타일을 미리 만들어 둔다 (다시 보기가 시작되는 프레임이 끊기지 않게)
    if (rep.clip && t > 1.55 && t < START && W.prewarm) W.prewarm(rep.clip.path[0], rep.clip.path[1], 3);
    const a = U.clamp((t - 1.2) / 0.8, 0, 1); if (a <= 0) return true;
    UI.block(0, 0, UI.W, UI.H);
    backdrop(ctx, L, a);
    holeFrame(ctx, G, me, L, rep, a);
    header(ctx, G, me, L, rep, a);
    gradeCard(ctx, G, me, L, a, t);
    mvpCard(ctx, G, me, L, rep, a, t);
    heroList(ctx, G, me, L, rep, a, t);
    goldChart(ctx, G, L, rep, a, t);
    dmgChart(ctx, G, L, rep, a, t);
    buttons(ctx, G, me, L, rep, a, t);
    ctx.globalAlpha = 1;
    return true;
  };
})();
