/* 어스름 전선 — aiskills: 봇의 손 (영웅별 스킬 사용, 조준, 날아오는 스킬 피하기, 도주)
   ai.js 의 Brain 이 부른다: AI.micro(매 틱) · AI.skills(교전) · AI.farm(파밍) · AI.escape(도주) · AI.support(지원) */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, M = TW.Map, AI = TW.AI;

  const ready = (h, s) => h.castBlock(s) === null;
  function cast(b, slot, x, y, unit) { return b.h.cmdCast(slot, x, y, unit) === 'ok'; }
  /* 예측 조준: 날아가는 시간만큼 앞을 겨냥 + 난이도별 오차 */
  function lead(b, tg, speed, delay) {
    const h = b.h, d = U.du(h, tg), tt = (delay || 0) + (speed > 0 ? d / speed : 0);
    const k = tg.cc || tg.rooted ? 0 : b.diff.lead;
    let x = tg.x + (tg.vx || 0) * tt * k, y = tg.y + (tg.vy || 0) * tt * k;
    const a = Math.atan2(y - h.y, x - h.x) + (b.G.rng() - 0.5) * b.diff.aimErr, dd = Math.hypot(x - h.x, y - h.y);
    x = h.x + Math.cos(a) * dd; y = h.y + Math.sin(a) * dd;
    return { x, y };
  }
  /* 직선 스킬이 중간에 미니언·몬스터에 막히는가 */
  function blocked(b, x2, y2, hw, tg) {
    const h = b.h, G = b.G, dT = Math.hypot(x2 - h.x, y2 - h.y);
    const list = G.hash.query((h.x + x2) / 2, (h.y + y2) / 2, dT / 2 + 1);
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      if (u === tg || u.team === h.team || u.dead || u.isStruct || u.isHero) continue;
      if (U.du(u, h) < dT - 0.5 && U.segDist(u.x, u.y, h.x, h.y, x2, y2) <= hw + u.r) return true;
    }
    return false;
  }
  function countEns(b, x, y, r) { let n = 0; for (const e of b.ens) if (U.dist(e.x, e.y, x, y) <= r) n++; return n; }
  function centroid(b, tg, r) { let n = 0, cx = 0, cy = 0; for (const e of b.ens) if (U.du(e, tg) <= r) { n++; cx += e.x; cy += e.y; } return n ? { n, x: cx / n, y: cy / n } : { n: 1, x: tg.x, y: tg.y }; }
  function meleeThreat(b, r) { const h = b.h; let best = null, bd = r; for (const e of b.ens) { if (e.ranged) continue; const d = U.du(e, h); if (d < bd) { bd = d; best = e; } } return best; }

  /* =====================================================================
     영웅별 교전 스킬
     ===================================================================== */
  const S = {};
  S.moru = function (b, tg, mode) {
    const h = b.h, d = U.du(h, tg), allin = mode === 'allin';
    if (ready(h, 3) && d < 13.5 && d > 2.5) {
      const c = centroid(b, tg, 5.5);
      if (c.n >= 2 || (allin && tg.hp / tg.maxHp < 0.7 && b.als.length >= 1)) { if (cast(b, 3, c.x, c.y)) return; }
    }
    if (ready(h, 0) && d < 8.8 && d > 1.6) {
      const dx = (tg.x - h.x) / d, dy = (tg.y - h.y) / d, rem = 9.5 - d + 2.2;
      const wall = M.rayWalk(tg.x, tg.y, tg.x + dx * rem, tg.y + dy * rem).hit;
      if (wall || allin) { const p = lead(b, tg, 30, 0); if (cast(b, 0, p.x, p.y)) return; }
    }
    if (ready(h, 2) && d < 11.5) { const p = lead(b, tg, 22, 0.3); if (cast(b, 2, p.x, p.y)) return; }
    if (ready(h, 1) && (b.dmgRate > 22 || (allin && d < 4.8))) cast(b, 1, h.x, h.y);
  };
  S.hanui = function (b, tg, mode) {
    const h = b.h, d = U.du(h, tg), allin = mode === 'allin';
    if (ready(h, 3) && allin && d < 5.6 && (TW.isCC(tg) || tg.hp / tg.maxHp < 0.6 || countEns(b, h.x, h.y, 6.5) >= 2)) { h.aimUnit = tg; if (cast(b, 3, tg.x, tg.y)) return; }
    if (ready(h, 2) && ((allin && d > 4 && d < 8.8) || (TW.isCC(tg) && d < 8.5 && allin))) { const k = Math.min(8, d + 2) / d; if (cast(b, 2, h.x + (tg.x - h.x) * k, h.y + (tg.y - h.y) * k)) return; }
    if (ready(h, 0) && d > 2.5 && d < 7.9) { const p = lead(b, tg, 0, 0.18); if (cast(b, 0, p.x, p.y)) return; }
    if (ready(h, 1) && allin && countEns(b, h.x, h.y, 3.6) >= 2) cast(b, 1, h.x, h.y);
  };
  S.geumeum = function (b, tg, mode) {
    const h = b.h, d = U.du(h, tg), allin = mode === 'allin', bl = h.st.blade;
    if (ready(h, 3) && allin && d < 11) { if (cast(b, 3, h.x, h.y)) return; }
    if (ready(h, 2)) {
      if (bl && !bl.done && U.dist(bl.x, bl.y, tg.x, tg.y) < 3.2 && d > 3.5 && allin) { if (cast(b, 2, tg.x, tg.y)) return; }
      else if (allin && (!bl || bl.done) && d > 3.4 && d < 7.6 && !ready(h, 0)) { if (cast(b, 2, tg.x, tg.y)) return; }
    }
    if (ready(h, 0) && d < 11) { const p = lead(b, tg, 30, 0.12); if (cast(b, 0, p.x, p.y)) return; }
    if (ready(h, 1) && allin && d < 9 && d > 2) { const p = lead(b, tg, 0, 0.4); cast(b, 1, p.x, p.y); }
  };
  S.bulti = function (b, tg, mode) {
    const h = b.h, d = U.du(h, tg), allin = mode === 'allin', mt = meleeThreat(b, 7);
    if (ready(h, 3) && allin && d < 14 && (tg.hp / tg.maxHp < 0.62 || countEns(b, tg.x, tg.y, 9) >= 2)) { h.aimUnit = tg; if (cast(b, 3, tg.x, tg.y)) return; }
    if (ready(h, 0) && d < 17.5) { const p = lead(b, tg, 44, 0.2); if (cast(b, 0, p.x, p.y)) return; }
    if (ready(h, 1) && d < 12.5 && (allin || mt)) { const p = lead(b, mt || tg, 0, 0.5); if (cast(b, 1, p.x, p.y)) return; }
    if (ready(h, 2)) {
      if (mt && U.du(mt, h) < 3.6) { const dx = h.x - mt.x, dy = h.y - mt.y, dd = Math.hypot(dx, dy) || 1; cast(b, 2, h.x + dx / dd * 6, h.y + dy / dd * 6); }
      else if (allin && d > h.range + 0.8 && d < h.range + 5.5 && tg.hp / tg.maxHp < 0.45) cast(b, 2, tg.x, tg.y);
    }
  };
  S.chorong = function (b, tg, mode) {
    const h = b.h, d = U.du(h, tg), allin = mode === 'allin';
    if (ready(h, 3) && allin && d < 20 && d > 4 && (countEns(b, tg.x, tg.y, 6) >= 2 || tg.hp / tg.maxHp < 0.6)) { if (cast(b, 3, tg.x, tg.y)) return; }
    if (ready(h, 1) && d < 12.5) { const p = lead(b, tg, 0, 0.45); if (cast(b, 1, p.x, p.y)) { b.orbT = b.G.t; return; } }
    if (ready(h, 0) && d < 18) { b.chargeTg = tg; cast(b, 0, tg.x, tg.y); }
  };
  S.seori = function (b, tg, mode) {
    const h = b.h, d = U.du(h, tg), allin = mode === 'allin';
    if (ready(h, 3) && d < 13.5) {
      const c = centroid(b, tg, 6);
      if (c.n >= 2 || (allin && (TW.isCC(tg) || tg.hp / tg.maxHp < 0.5))) { const p = c.n >= 2 ? c : lead(b, tg, 0, tg.cc ? 0 : 0.7); if (cast(b, 3, p.x, p.y)) return; }
    }
    if (ready(h, 1) && d < 12.5 && (allin || TW.isCC(tg) || b.G.rng() < 0.3)) { const p = lead(b, tg, 0, 0.4); if (cast(b, 1, p.x, p.y)) return; }
    if (ready(h, 0) && d < 14.5) { const p = lead(b, tg, 34, 0.18); cast(b, 0, p.x, p.y); }
  };
  S.narae = function (b, tg, mode) {
    const h = b.h, G = b.G, d = U.du(h, tg), t = G.t;
    const team = b.als.concat([h]);
    if (ready(h, 3)) {
      let n = 0, need = false;
      for (const a of team) if (U.du(a, h) < 10) { n++; if (a.hp / a.maxHp < 0.45 || a.stunned || a.rooted) need = true; }
      if (n >= 2 && need && b.ens.length) { if (cast(b, 3, h.x, h.y)) return; }
    }
    if (ready(h, 1)) {
      let best = null, bs = 0;
      for (const a of team) {
        if (U.du(a, h) > 12) continue;
        let s = (t - a.lastHeroHurt < 1.2 ? 2 : 0) + (1 - a.hp / a.maxHp) * 2 + (a.dash ? 1.5 : 0);
        for (const e of b.ens) if (U.du(e, a) < 5) s += 1;
        if (s > bs) { bs = s; best = a; }
      }
      if (best && bs >= 2) { if (cast(b, 1, best.x, best.y, best)) return; }
    }
    if (ready(h, 0) && d < 15.5 && !blocked(b, tg.x, tg.y, 1.2, tg)) { const p = lead(b, tg, 30, 0.2); cast(b, 0, p.x, p.y); }
  };
  S.agwi = function (b, tg, mode) {
    const h = b.h, d = U.du(h, tg), allin = mode === 'allin';
    if (ready(h, 2)) {
      let near = null, nd = 3.7; for (const e of b.ens) { const dd = U.du(e, h); if (dd < nd) { nd = dd; near = e; } }
      if (near) {
        // 아군(없으면 본진) 쪽으로 던진다
        let ax = M.bases[h.team].fountain.x, ay = M.bases[h.team].fountain.y, ad = 16;
        for (const a of b.als) { const dd = U.du(a, h); if (dd < ad) { ad = dd; ax = a.x; ay = a.y; } }
        const dx = ax - h.x, dy = ay - h.y, dd = Math.hypot(dx, dy) || 1;
        if (cast(b, 2, h.x + dx / dd * 7, h.y + dy / dd * 7)) return;
      }
    }
    if (ready(h, 3) && d < 12.5) { const c = centroid(b, tg, 6.5); if (c.n >= 2 || (allin && b.als.length >= 1 && tg.hp / tg.maxHp < 0.75)) { if (cast(b, 3, c.x, c.y)) return; } }
    if (ready(h, 0) && d < 14.5 && d > 3.6) {
      const p = lead(b, tg, 28, 0.25);
      if (!blocked(b, p.x, p.y, 0.9, tg) && (allin || b.als.length >= 1 || tg.hp / tg.maxHp < 0.5 || b.aTowerD < 14)) { if (cast(b, 0, p.x, p.y)) return; }
    }
    if (ready(h, 1) && countEns(b, h.x, h.y, 5.2) >= 1 && (allin || b.dmgRate > 14)) cast(b, 1, h.x, h.y);
  };
  AI.skills = function (b, tg, mode) {
    if (b.G.rng() > b.diff.combo && mode !== 'allin') return;
    const f = S[b.h.heroId]; if (f) f(b, tg, mode);
  };

  /* =====================================================================
     파밍 스킬 (미니언 무리·정글 몬스터)
     ===================================================================== */
  const FARM = {
    moru:    [{ s: 2, k: 'line', n: 3, len: 11 }, { s: 1, k: 'self', n: 3, r: 4, big: true }],
    hanui:   [{ s: 0, k: 'line', n: 2, len: 7 }, { s: 1, k: 'self', n: 3, r: 3.4, big: true }],
    geumeum: [{ s: 0, k: 'line', n: 2, len: 11 }],
    bulti:   [{ s: 0, k: 'line', n: 3, len: 17 }, { s: 1, k: 'ground', n: 4, r: 3.4, range: 12 }],
    chorong: [{ s: 1, k: 'ground', n: 3, r: 2.6, range: 12 }, { s: 0, k: 'charge', n: 3, len: 12 }],
    seori:   [{ s: 1, k: 'ground', n: 4, r: 4.6, range: 12 }, { s: 0, k: 'line', n: 1, len: 14 }],
    narae:   [{ s: 0, k: 'line', n: 2, len: 15 }],
    agwi:    [{ s: 1, k: 'self', n: 3, r: 5, big: true }],
  };
  AI.farm = function (b, units, main) {
    const h = b.h, G = b.G, tbl = FARM[h.heroId]; if (!tbl) return;
    if (h.cast || h.channel || h.charge) return;
    const foes = [];
    for (let i = 0; i < units.length; i++) { const u = units[i]; if (u.dead || u.team === h.team || u.isHero || u.isStruct || !(u.isMonster || u.seen[h.team])) continue; foes.push(u); }
    if (!foes.length) return;
    if (!main) { main = foes[0]; for (const u of foes) if (U.du(u, h) < U.du(main, h)) main = u; }
    const bigOne = main.isMonster && main.maxHp >= 500;
    // 적 영웅이 가까우면 스킬을 아낀다
    if (!main.isMonster && b.ens.length && U.du(b.ens[0], h) < 15 && G.rng() < 0.6) return;
    for (const f of tbl) {
      if (!ready(h, f.s)) continue;
      const d = U.du(main, h);
      if (f.k === 'self') {
        let n = 0; for (const u of foes) if (U.du(u, h) <= f.r) n++;
        if (n >= f.n || (bigOne && f.big && d <= f.r && main.target === h)) { if (cast(b, f.s, h.x, h.y)) return; }
      } else if (f.k === 'line' || f.k === 'charge') {
        if (d > f.len) continue;
        const k = f.len / Math.max(0.1, d), x2 = h.x + (main.x - h.x) * k, y2 = h.y + (main.y - h.y) * k;
        let n = 0; for (const u of foes) if (U.segDist(u.x, u.y, h.x, h.y, x2, y2) <= 1 + u.r) n++;
        if (n >= f.n || bigOne) { if (f.k === 'charge') { b.chargeTg = main; if (cast(b, f.s, main.x, main.y)) return; } else if (cast(b, f.s, main.x, main.y)) return; }
      } else if (f.k === 'ground') {
        if (d > f.range) continue;
        let n = 0; for (const u of foes) if (U.du(u, main) <= f.r) n++;
        if (n >= f.n || bigOne) { if (cast(b, f.s, main.x, main.y)) return; }
      }
    }
  };

  /* ---------- 도주: 이동기·보호막·구르기 ---------- */
  const ESC = { moru: [0, 1], hanui: [2], geumeum: [2, 1], bulti: [2], chorong: [2], seori: [2], narae: [1], agwi: [1] };
  AI.escape = function (b, near) {
    const h = b.h, G = b.G;
    if (!near.length || h.cast || h.channel || h.dash) return;
    let nd = 1e9; for (const e of near) nd = Math.min(nd, U.du(e, h));
    if (nd > 8 && b.dmgRate < 20) return;
    const s = M.bases[h.team].fountain, path = M.findPath(h.x, h.y, s.x, s.y), p = path[0] || s;
    const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    for (const slot of ESC[h.heroId] || []) {
      if (!ready(h, slot)) continue;
      const ab = h.hd.abilities[slot];
      if (ab.type === 'self') { if (cast(b, slot, h.x, h.y)) return; }
      else if (ab.type === 'ally') { if (cast(b, slot, h.x, h.y, h)) return; }
      else if (h.heroId === 'geumeum' && slot === 1) { if (cast(b, slot, h.x, h.y)) return; }
      else { const r = ab.range || 6; if (cast(b, slot, h.x + ux * r, h.y + uy * r)) return; }
    }
    if (h.rollCd <= 0 && nd < 6 && G.rng() < 0.5 + b.diff.dodge * 0.5) h.cmdRoll(h.x + ux * 6, h.y + uy * 6);
  };

  /* ---------- 지원가: 싸움이 아니어도 다친 아군을 돌본다 ---------- */
  AI.care = function (b) {
    const h = b.h, G = b.G, t = G.t;
    if (h.heroId !== 'narae' || h.cast || h.channel || h.cc) return;
    const team = b.als.concat([h]);
    if (ready(h, 1)) {
      let best = null, bs = 0.9;
      for (const a of team) { if (U.du(a, h) > 12) continue; const s = (t - a.lastHurt < 1.5 ? 1 : 0) + (1 - a.hp / a.maxHp) * 1.5 + (t - a.lastHeroHurt < 1.5 ? 0.8 : 0); if (s > bs) { bs = s; best = a; } }
      if (best && cast(b, 1, best.x, best.y, best)) return;
    }
    if (ready(h, 0)) {
      let best = null, br = 0.72;
      for (const a of b.als) { const r = a.hp / a.maxHp; if (r < br && U.du(a, h) < 15 && U.du(a, h) > 1.5) { br = r; best = a; } }
      if (best && cast(b, 0, best.x, best.y)) return;
    }
    if (ready(h, 3) && b.ens.length) {
      let n = 0, need = false;
      for (const a of team) if (U.du(a, h) < 10) { n++; if (a.hp / a.maxHp < 0.4) need = true; }
      if (n >= 2 && need) cast(b, 3, h.x, h.y);
    }
  };

  /* ---------- 지원가: 길잡이 등불 ---------- */
  AI.support = function (b, around) {
    const h = b.h, G = b.G, t = G.t;
    if (h.heroId !== 'narae' || t < b.wardT || !ready(h, 2)) return;
    b.wardT = t + 5;
    let spot = null;
    if (around) spot = { x: around.x, y: around.y };
    else {
      let bd = 13.5;
      const ex = M.bases[1 - h.team].core.x;
      for (const bu of M.bushes) {
        const d = U.dist(bu.x, bu.y, h.x, h.y); if (d > bd) continue;
        if (Math.abs(bu.x - ex) > Math.abs(h.x - ex) + 3) continue;        // 적 쪽 수풀만
        let has = false; for (const w of G.wards) if (w.team === h.team && U.dist(w.x, w.y, bu.x, bu.y) < 9) has = true;
        if (!has) { bd = d; spot = bu; }
      }
    }
    if (spot) cast(b, 2, spot.x, spot.y);
  };

  /* =====================================================================
     매 틱: 조준 유지 · 모아 쏘기 · 피하기
     ===================================================================== */
  function chorongCharge(b) {
    const h = b.h, G = b.G, ch = h.charge, ab = h.hd.abilities[ch.slot], c = ab.charge;
    const tg = b.chargeTg && !b.chargeTg.dead && (b.chargeTg.isMonster || b.chargeTg.seen[h.team]) ? b.chargeTg : null;
    if (!tg) { if (ch.t > 0.45) h.cmdRelease(h.aimX, h.aimY); return; }
    let ax = tg.x + (tg.vx || 0) * 0.12 * b.diff.lead, ay = tg.y + (tg.vy || 0) * 0.12 * b.diff.lead, via = null;
    for (const z of G.zones) {
      if (!z.orb || z.src !== h || z.done) continue;
      const R = z.orb === 'moon' ? 6.8 : 3.5;
      if (U.dist(z.x, z.y, tg.x, tg.y) < R && U.dist(z.x, z.y, h.x, h.y) < 18.3) { via = z; break; }
    }
    if (via) { ax = via.x; ay = via.y; }
    h.aimX = ax; h.aimY = ay;
    const dAim = Math.hypot(ax - h.x, ay - h.y) + (via ? 0.6 : 1.2);
    const kReq = U.clamp((dAim - 10) / 9, 0, 1);
    const want = c.min + (c.max - c.min) * Math.min(1, kReq + 0.12);
    if ((ch.t >= want && (!via || via.active)) || ch.t > 1.55) {
      const a = Math.atan2(ay - h.y, ax - h.x) + (via ? 0 : (G.rng() - 0.5) * b.diff.aimErr), d = Math.hypot(ax - h.x, ay - h.y);
      h.cmdRelease(h.x + Math.cos(a) * d, h.y + Math.sin(a) * d);
    }
  }
  function decide(b, id, tti) {
    let e = b.seenProj.get(id);
    if (!e) {
      if (b.seenProj.size > 80) b.seenProj.clear();
      e = { dodge: b.G.rng() < b.diff.dodge, at: b.G.t + 0.08 + (1 - b.diff.dodge) * 0.22 * b.G.rng(), done: false };
      b.seenProj.set(id, e);
    }
    return e;
  }
  /* (ox,oy) 방향으로 need 만큼 비켜야 한다. 시간이 모자라면 구른다 */
  function evade(b, ox, oy, need, tti, e) {
    const h = b.h, G = b.G;
    const d = Math.hypot(ox, oy) || 1; ox /= d; oy /= d;
    let tx = h.x + ox * (need + 1.6), ty = h.y + oy * (need + 1.6);
    if (!M.isWalkable(tx, ty)) { tx = h.x - ox * (need + 2.4); ty = h.y - oy * (need + 2.4); if (!M.isWalkable(tx, ty)) return false; need += 1.5; }
    e.done = true;
    const tNeed = need / Math.max(1, h.ms);
    if (tNeed > tti - 0.04) {
      if (h.heroId === 'hanui' && h.castBlock(1) === null && tti < 0.4) { h.cmdCast(1, h.x, h.y); return true; }
      if (h.rollCd <= 0 && !h.channel && !h.cast && G.rng() < 0.35 + b.diff.dodge * 0.6) { h.cmdRoll(tx, ty); b.dodge = { until: G.t + 0.3 }; return true; }
    }
    if (h.channel && !h.channel.ab.chan.canMove) return false;
    if (h.cast) return false;
    b.goal = null; h.cmdMove(tx, ty);
    b.dodge = { until: G.t + Math.min(0.55, Math.max(0.2, tNeed + 0.1)) };
    return true;
  }
  AI.micro = function (b, dt) {
    const h = b.h, G = b.G, t = G.t;
    if (h.channel && b.target && !b.target.dead && (b.target.isMonster || b.target.seen[h.team])) h.aimUnit = b.target;
    if (h.charge) chorongCharge(b);
    if (h.cc || h.dash || h.rooted) return;
    // 날아오는 스킬
    const ps = G.projs;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.homing || p.team === h.team || p.done || p.hit.has(h)) continue;
      const rx = h.x - p.x, ry = h.y - p.y, along = rx * p.dx + ry * p.dy;
      if (along < -0.5 || along > Math.min(p.left, 17) + 1) continue;
      const cross = rx * p.dy - ry * p.dx, perp = Math.abs(cross), hitR = p.radius + h.r + 0.3;
      if (perp > hitR) continue;
      const tti = along / Math.max(1, p.returning ? p.boomerang : p.speed);
      if (tti > 0.9) continue;
      const e = decide(b, p.id, tti);
      if (!e.dodge || e.done || t < e.at) continue;
      const s = cross >= 0 ? 1 : -1;            // 내가 선의 어느 쪽에 있나
      if (evade(b, p.dy * s, -p.dx * s, hitR - perp + 0.2, tti, e)) return;
    }
    // 예고된 장판(원)
    const zs = G.zones;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (z.team === h.team || z.done || z.friendly) continue;
      const dx = h.x - z.x, dy = h.y - z.y, d = Math.hypot(dx, dy), R = z.radius + h.r * 0.6;
      if (d > R) continue;
      let left;
      if (!z.active) { left = z.delay - z.t; if (left > 0.95) continue; }
      else { if (!z.onTick || z.dur - z.t < 0.4 || (b.mode === 'allin' && h.hp / h.maxHp > 0.5 && !z.pull) || z.vis.kind === 'smoke') continue; left = 0.35; }
      const e = decide(b, z.id + (z.active ? 0.5 : 0), left);
      if (!e.dodge || e.done || t < e.at) continue;
      const f = M.bases[h.team].fountain;
      if (evade(b, d > 0.3 ? dx : f.x - h.x, d > 0.3 ? dy : f.y - h.y, R - d + 0.3, left, e)) return;
    }
    // 예고된 일격(직선·부채꼴·원)
    const ss = G.strikes;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i];
      if (s.team === h.team || s.done) continue;
      const left = s.delay - s.t; if (left > 1.05) continue;
      let ox = 0, oy = 0, need = 0;
      if (s.shape === 'line') {
        const sp = U.segPoint(h.x, h.y, s.x, s.y, s.x2, s.y2), dd = Math.sqrt(sp.d2), R = s.hw + h.r + 0.3;
        if (dd > R) continue;
        ox = h.x - sp.x; oy = h.y - sp.y; if (dd < 0.2) { ox = -(s.y2 - s.y); oy = s.x2 - s.x; }
        need = R - dd;
      } else if (s.shape === 'cone') {
        const dx = h.x - s.x, dy = h.y - s.y, dd = Math.hypot(dx, dy);
        if (dd > s.r + h.r) continue;
        const da = U.angDiff(s.ang, Math.atan2(dy, dx));
        if (Math.abs(da) > s.half + 0.15) continue;
        const arc = (s.half + 0.2 - Math.abs(da)) * dd, rad = s.r + h.r - dd;
        if (arc < rad) { const sg = da >= 0 ? 1 : -1; ox = -dy * sg; oy = dx * sg; need = arc; } else { ox = dx; oy = dy; need = rad; }
      } else {
        const dx = h.x - s.x, dy = h.y - s.y, dd = Math.hypot(dx, dy), R = s.r + h.r * 0.6;
        if (dd > R) continue; ox = dx; oy = dy; need = R - dd;
      }
      const e = decide(b, s.id, left);
      if (!e.dodge || e.done || t < e.at) continue;
      if (evade(b, ox, oy, need + 0.3, left, e)) return;
    }
  };
})();
