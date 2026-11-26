/* 어스름 전선 — uistar: 별비 난전의 화면 (19차)
   ① 시계 아래 칩 = 다음 별비까지 남은 시간 · 몇 번째 별비인지   ② 별조각 고르기 = 화면 아래 가운데의 카드 석 장 (1 · 2 · 3 또는 누르기, 4 = 다시 뽑기)
   ③ 내 별조각 줄 = 체력 띠 위 (가리키면 설명)   ④ 위쪽 얼굴 줄 아래의 작은 점 = 그 영웅이 가진 별조각의 등급
   경기는 멈추지 않는다 (친구 방과 같은 규칙) — 카드는 싸움터 한가운데와 스킬 단추를 가리지 않는 자리에 뜬다. 시간이 다 되면 '추천' 카드가 골라진다 */
(function () {
  'use strict';
  const TW = globalThis.TW;
  const C = TW.C, U = TW.U, X = TW.X, Art = TW.Art, UI = TW.UI, TAU = Math.PI * 2;
  const S = TW.UIStar = { shownAt: -9, pickAt: -9, picked: null, fallAt: -9, warnTick: -1, rects: null, rerollRect: null, told: 0 };
  const INK = 'rgba(4,6,18,0.92)';
  const RAINBOW = ['#ff9ab0', '#ffd24a', '#8dffb4', '#7fd0ff', '#c9a2ff', '#ff9ab0'];
  const tierOf = (t) => TW.BOON_TIERS[t] || TW.BOON_TIERS[0];
  /* 등급 테두리: 실버 = 은빛 · 골드 = 금빛 · 프리즘 = 천천히 도는 무지갯빛 */
  function tierStroke(ctx, T, x, w, t, y, h) {
    if (!T.rainbow) return T.col;
    // 무지갯빛이 비스듬히 흐른다 (y · h 를 주면 대각선으로 — 카드의 네 변이 저마다 다른 빛이 된다)
    const sh = ((t * 0.18) % 1) * w, g = h ? ctx.createLinearGradient(x - w + sh, y, x + w + sh, y + h) : ctx.createLinearGradient(x - w + sh, 0, x + w + sh, 0);
    for (let k = 0; k < 2; k++) for (let i = 0; i < 5; i++) g.addColorStop((k * 5 + i) / 10, RAINBOW[i]);
    g.addColorStop(1, RAINBOW[0]);
    return g;
  }
  S.tierStroke = tierStroke;
  /* 작은 별조각 칩 (가진 것 표시): 등급 빛 테두리의 둥근 네모 + 그림 */
  S.chip = function (ctx, id, x, y, r, a) {
    const b = TW.Boons[id]; if (!b) return;
    const T = tierOf(b.tier);
    ctx.globalAlpha = a === undefined ? 1 : a;
    X.rr(ctx, x - r, y - r, r * 2, r * 2, r * 0.42); ctx.fillStyle = U.mix(T.deep, '#070916', 0.35); ctx.fill();
    ctx.strokeStyle = tierStroke(ctx, T, x - r, r * 2, UI.t); ctx.lineWidth = Math.max(1.4, r * 0.16); ctx.stroke();
    ctx.drawImage(Art.iconSprite(b.icon, 56, T.glow), x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);       // 스프라이트로 찍는다 (도려내는 아이콘이 바탕을 파먹지 않게 · 크기는 하나로 — 커졌다 줄어드는 동안 새로 만들지 않게)
    ctx.globalAlpha = 1;
  };
  S.tip = function (h, id, x, y) {
    const b = TW.Boons[id], T = tierOf(b.tier);
    return { x, y, title: b.name, right: T.name + ' 별조각', body: [b.text(h)], color: T.col, w: 340 };
  };

  S.reset = function () { S.shownAt = -9; S.pickAt = -9; S.picked = null; S.fallAt = -9; S.warnTick = -1; S.rects = null; S.rerollRect = null; S.told = 0; };

  /* ---------- 사건 ---------- */
  S.onEvent = function (e, G, me) {
    const Au = TW.Audio;
    switch (e.type) {
      case 'starWarn':
        UI.toast('곧 별비가 내립니다 — ' + C.STAR.WARN + '초 뒤 (' + e.n + '번째)', '#fff1b8');
        if (Au && Au.cue) Au.cue('star_warn', 0.6);
        break;
      case 'starFall': {
        const T = tierOf(e.tier);
        S.fallAt = UI.t;
        UI.announce('별비가 내린다!', T.col, e.n + '번째 별비 · 이번에는 ' + T.name + ' 별조각 (' + T.say + ') — 셋 가운데 하나를 고르세요', 3.2, { small: e.n > 1 });
        if (Au && Au.cue) Au.cue('star_fall', 0.85);
        break;
      }
      case 'boonOffer': if (e.u === me) { S.shownAt = UI.t; S.picked = null; } break;
      case 'boonReroll': if (e.u === me) { S.shownAt = UI.t; if (Au && Au.play) Au.play('click'); } break;
      case 'boon': {
        if (e.u !== me) break;
        const b = TW.Boons[e.id], T = tierOf(e.tier);
        S.pickAt = UI.t; S.picked = { id: e.id, auto: e.auto };
        UI.toast((e.auto ? '시간이 다 되어 추천 카드로 — ' : '별조각을 얻었다 — ') + b.name + ' · ' + b.text(me), T.glow);
        if (Au && Au.cue) Au.cue('boon_pick', 0.9);
        break;
      }
      case 'boonProc':
        if (e.u !== me) break;
        if (e.id === 'ember') UI.announce('꺼지지 않는 별!', '#ffe9a0', '쓰러질 뻔했지만 버텼다 — 1.5초 동안 피해를 받지 않습니다', 2.2, { small: true });
        else if (e.id === 'hunt') UI.toast('별 사냥꾼 ' + e.n + '번째 — 공격력·주문력·체력이 올랐습니다', '#f3e8ff');
        break;
      default: break;
    }
  };

  /* ---------- 카드 한 장 ---------- */
  function drawCard(ctx, G, me, id, i, x, y, w, h, hot, rec, a) {
    const b = TW.Boons[id], T = tierOf(b.tier), t = UI.t;
    ctx.save(); ctx.globalAlpha = a;
    if (hot) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(1.045, 1.045); ctx.translate(-(x + w / 2), -(y + h / 2)); }
    // 바탕: 등급 빛이 위에서 내려오는 어두운 카드
    X.rr(ctx, x, y, w, h, 16);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, U.mix(T.deep, '#0a0c22', 0.2)); g.addColorStop(0.55, 'rgba(10,12,34,0.97)'); g.addColorStop(1, 'rgba(8,10,28,0.97)');
    ctx.fillStyle = g; ctx.fill();
    // 등급이 테두리로 바로 읽히게: 실버 = 가는 은빛 한 줄 · 골드 = 굵은 금빛 + 안쪽 금줄 · 프리즘 = 굵은 무지갯빛 + 번지는 빛 + 반짝이
    if (T.rainbow) {
      ctx.globalAlpha = a * (0.16 + 0.05 * Math.sin(t * 3 + i)); ctx.fillStyle = tierStroke(ctx, T, x, w, t + 1.3, y, h); ctx.fill(); ctx.globalAlpha = a;
      ctx.save(); ctx.shadowColor = '#d3b0ff'; ctx.shadowBlur = 16; X.rr(ctx, x, y, w, h, 16); ctx.strokeStyle = tierStroke(ctx, T, x, w, t, y, h); ctx.lineWidth = hot ? 5 : 4; ctx.stroke(); ctx.restore(); ctx.globalAlpha = a;
      for (let k = 0; k < 5; k++) { const ph = (t * 0.5 + k * 0.23 + i * 0.4) % 1, sx = x + 14 + U.hash2(k, i, 5) * (w - 28), sy = y + h - 8 - ph * (h - 16); ctx.globalAlpha = a * Math.sin(ph * Math.PI) * 0.9; X.star(ctx, sx, sy, 3.2, 4, 0.3, t + k); ctx.fillStyle = RAINBOW[k % 5]; ctx.fill(); }
      ctx.globalAlpha = a;
    } else if (b.tier === 1) {
      ctx.save(); ctx.shadowColor = '#ffd24a'; ctx.shadowBlur = 10; ctx.strokeStyle = T.col; ctx.lineWidth = hot ? 4 : 3; ctx.stroke(); ctx.restore(); ctx.globalAlpha = a;
      X.rr(ctx, x + 5, y + 5, w - 10, h - 10, 12); ctx.strokeStyle = 'rgba(255,210,74,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    } else { ctx.strokeStyle = T.col; ctx.lineWidth = hot ? 2.6 : 1.6; ctx.stroke(); }
    // 등급 띠
    const tw = X.textW(ctx, T.name, 12.5, 900) + 26;
    X.rr(ctx, x + w / 2 - tw / 2, y - 11, tw, 22, 11); ctx.fillStyle = T.rainbow ? tierStroke(ctx, T, x + w / 2 - tw / 2, tw, t) : T.col; ctx.fill();
    X.text(ctx, T.name, x + w / 2, y + 0.5, 12.5, '#0b0d22', 'center', 900);
    // 그림 + 이름
    Art.iconButton(ctx, b.icon, x + 38, y + 50, 23, T.col, 1);
    X.text(ctx, b.name, x + 70, y + 43, b.name.length > 6 ? 17 : 19, '#ffffff', 'left', 900, INK, 3);
    X.text(ctx, T.say, x + 70, y + 64, 11, T.col, 'left', 700);
    // 설명 (모두 적는다 — 줄여 쓰지 않는다)
    const ls = X.wrap(ctx, b.text(me), w - 28, 12.5, 600);
    for (let k = 0; k < ls.length && k < 5; k++) X.text(ctx, ls[k], x + 14, y + 92 + k * 17.5, 12.5, '#e2e6fa', 'left', 600);
    // 아래: 누를 키 · 추천
    const ky = y + h - 20;
    X.rr(ctx, x + 12, ky - 12, 26, 24, 7); ctx.fillStyle = hot ? '#fff6dc' : 'rgba(255,255,255,0.14)'; ctx.fill();
    X.text(ctx, String(i + 1), x + 25, ky + 1, 15, hot ? '#0b0d22' : '#ffffff', 'center', 900);
    X.text(ctx, hot ? '누르면 고릅니다' : '키 ' + (i + 1) + ' 또는 누르기', x + 46, ky + 1, 11.5, hot ? '#ffffff' : '#9aa0c4', 'left', 700);
    if (rec) UI.chip(ctx, '추천', x + w - 32, ky, 11, '#0b0d22', '#8dffb4', 8);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  S.cardRects = function () {
    const n = 3, w = 222, h = 204, gap = 14, total = n * w + (n - 1) * gap, x0 = UI.W / 2 + 26 - total / 2, y0 = UI.H - 352;
    const out = []; for (let i = 0; i < n; i++) out.push({ x: x0 + i * (w + gap), y: y0, w, h });
    return out;
  };

  /* ---------- 별조각 고르기 (내 카드 석 장) ---------- */
  function drawPick(ctx, G, me) {
    const o = me.offer; S.rects = null; S.rerollRect = null;
    if (!o || UI.ended) return;
    const T = tierOf(o.tier), R = S.cardRects(), age = UI.t - S.shownAt, left = Math.max(0, o.until - G.t), rec = TW.boonBest(me, o.ids, null);
    const x0 = R[0].x, x1 = R[R.length - 1].x + R[0].w, y0 = R[0].y, hh = R[0].h;
    // 뒤를 살짝 어둡게 (글이 읽히게)
    const bg = ctx.createLinearGradient(0, y0 - 70, 0, y0 + hh + 40); bg.addColorStop(0, 'rgba(6,8,22,0)'); bg.addColorStop(0.25, 'rgba(6,8,22,0.62)'); bg.addColorStop(0.85, 'rgba(6,8,22,0.62)'); bg.addColorStop(1, 'rgba(6,8,22,0)');
    ctx.fillStyle = bg; ctx.fillRect(x0 - 40, y0 - 70, x1 - x0 + 80, hh + 110);
    // 제목 줄 + 남은 시간
    const title = '별비 ' + o.n + '/' + C.STAR.TIMES.length + ' — ' + T.name + ' 별조각을 하나 고르세요';
    X.star(ctx, x0 + 10, y0 - 34, 9, 5, 0.45, -Math.PI / 2 + UI.t); ctx.fillStyle = T.col; ctx.fill();
    X.text(ctx, title, x0 + 26, y0 - 33, 18, T.glow, 'left', 900, INK, 4);
    const hot10 = left <= 5 && Math.sin(UI.t * 10) > 0;
    X.text(ctx, '남은 ' + Math.ceil(left) + '초 · 넘기면 추천 카드', x1, y0 - 33, 13, hot10 ? '#ff97a2' : '#cfd6ee', 'right', 800, INK, 3);
    X.rr(ctx, x0, y0 - 20, x1 - x0, 4, 2); ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();
    X.rr(ctx, x0, y0 - 20, Math.max(4, (x1 - x0) * U.clamp(left / C.STAR.PICK_SEC, 0, 1)), 4, 2); ctx.fillStyle = left <= 5 ? '#ff97a2' : T.col; ctx.fill();
    // 카드: 왼쪽부터 차례로 떠오른다
    S.rects = R;
    for (let i = 0; i < o.ids.length && i < R.length; i++) {
      const r = R[i], k = U.easeOut3(U.clamp((age - i * 0.07) / 0.22, 0, 1)), hot = k >= 1 && UI.over(r.x, r.y, r.w, r.h);
      drawCard(ctx, G, me, o.ids[i], i, r.x, r.y + (1 - k) * 36, r.w, r.h, hot, i === rec, k);
      if (hot) UI.cursor = 'pointer';
      if (UI.hit(r.x, r.y, r.w, r.h, 0) && k >= 1) { if (UI.on.boon) UI.on.boon(i); }
    }
    // 다시 뽑기
    const bw = 214, bx = x1 - bw, by = y0 + hh + 10, can = me.rerolls > 0;
    S.rerollRect = { x: bx, y: by, w: bw, h: 28 };
    if (UI.button(ctx, can ? '4 · 다시 뽑기 (' + me.rerolls + '번 남음)' : '다시 뽑기를 모두 썼습니다', bx, by, bw, 28, { px: 12.5, r: 14, disabled: !can })) { if (UI.on.reroll) UI.on.reroll(); }
    X.text(ctx, '고르는 동안에도 경기는 흐릅니다', x0 + 4, by + 15, 12, '#9aa0c4', 'left', 600, INK, 3);
  }

  /* ---------- 시계 아래 칩: 다음 별비 ---------- */
  function drawChip(ctx, G) {
    const sf = G.sf; if (!sf) return;
    const n = C.STAR.TIMES.length, cx = UI.W / 2, left = sf.nextT - G.t, done = sf.n >= n;
    const soon = !done && left <= C.STAR.WARN, T = sf.tier >= 0 ? tierOf(sf.tier) : null;
    const str = done ? '별비 ' + n + '/' + n + ' — 모두 내렸습니다' : '별비 ' + (sf.n + 1) + '/' + n + ' · ' + (soon ? Math.max(0, Math.ceil(left)) + '초' : U.fmtTime(Math.ceil(Math.max(0, left))));
    const col = soon ? '#fff1b8' : done ? '#9aa0c4' : '#cdb990';
    const tw = X.textW(ctx, str, 11, 800) + 32, x = cx - tw / 2, y = 63;
    X.rr(ctx, x, y, tw, 18, 9); ctx.fillStyle = 'rgba(8,11,30,0.9)'; ctx.fill();
    if (soon) { ctx.strokeStyle = col; ctx.lineWidth = 1.2 + 0.8 * (0.5 + 0.5 * Math.sin(UI.t * 6)); ctx.stroke(); }
    X.star(ctx, x + 12, y + 9, 5.5, 5, 0.45, -Math.PI / 2); ctx.fillStyle = col; ctx.fill();
    X.text(ctx, str, x + 22, y + 9.5, 11, col, 'left', 800);
    // 지금까지 내린 별비의 등급 (작은 점)
    for (let i = 0; i < sf.tiers.length; i++) { const Ti = tierOf(sf.tiers[i]); X.circle(ctx, cx - (n - 1) * 5 + i * 10, y + 26, 3.2); ctx.fillStyle = Ti.rainbow ? RAINBOW[(i + Math.floor(UI.t * 2)) % 5] : Ti.col; ctx.fill(); }
    for (let i = sf.tiers.length; i < n; i++) { X.circle(ctx, cx - (n - 1) * 5 + i * 10, y + 26, 2.6); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke(); }
    if (soon) { const k = Math.ceil(left); if (k !== S.warnTick && k >= 1 && k <= 3) { S.warnTick = k; if (TW.Audio && TW.Audio.play) TW.Audio.play('big_tick', 0.4, 1.6); } }
  }
  /* 위쪽 얼굴 줄 아래: 영웅마다 가진 별조각의 등급 점 (누가 무엇을 얼마나 골랐는지 한눈에) */
  function drawPips(ctx, G, me) {
    const cx = UI.W / 2;
    for (let tm = 0; tm < 2; tm++) {
      const sx = tm === 0 ? -1 : 1, hs = G.heroes.filter(h => h.team === tm);
      for (let i = 0; i < hs.length; i++) {
        const h = hs[i], x = cx + sx * (172 + i * 45), y = 63, n = h.boons.length;
        for (let k = 0; k < n; k++) { const T = tierOf(TW.Boons[h.boons[k]].tier); ctx.fillStyle = T.rainbow ? RAINBOW[(k + Math.floor(UI.t * 2)) % 5] : T.col; ctx.fillRect(x - n * 4 + k * 8 + 1, y, 6, 6); }
        if (n && Math.hypot(UI.mx - x, UI.my - 32) < 20) UI.hoverTip = { x, y: 250, title: h.name + '의 별조각', body: h.boons.map(id => '[' + tierOf(TW.Boons[id].tier).name + '] ' + TW.Boons[id].name + ' — ' + TW.Boons[id].text(h)), color: C.TEAM_COL[tm], w: 420 };
      }
    }
  }
  /* 내 별조각 줄 (체력 띠 위 · 버프 줄 위) */
  function drawMine(ctx, G, me) {
    const n = me.boons.length, x0 = 172, y = UI.H - 172;
    X.text(ctx, '별조각', x0 - 2, y + 1, 11.5, '#cdb990', 'left', 800, INK, 3);
    if (!n) { X.text(ctx, '아직 없음 — 별비가 내리면 고릅니다', x0 + 44, y + 1, 11.5, '#9aa0c4', 'left', 600, INK, 3); return; }
    for (let i = 0; i < n; i++) {
      const id = me.boons[i], x = x0 + 62 + i * 40, fresh = S.picked && S.picked.id === id ? UI.t - S.pickAt : 9, pop = fresh < 0.5 ? 1 + 0.6 * (1 - fresh / 0.5) : 1;
      S.chip(ctx, id, x, y, 15 * pop, 1);
      UI.zoneC(x, y, 17);
      if (Math.hypot(UI.mx - x, UI.my - y) < 17) { UI.captured = true; UI.hoverTip = S.tip(me, id, x + 60, y - 22); }
    }
    if (me.hunt > 0 && me.bf.hunt) X.text(ctx, '사냥 ' + me.hunt, x0 + 62 + n * 40 - 8, y + 1, 11.5, '#f3e8ff', 'left', 800, INK, 3);
  }

  S.draw = function (ctx, G, me) {
    if (!G || !G.star) return;
    drawChip(ctx, G);
    drawPips(ctx, G, me);
    if (!me) return;
    drawMine(ctx, G, me);
    drawPick(ctx, G, me);
  };
  /* 키: 1 · 2 · 3 = 고르기, 4 = 다시 뽑기. 받았으면 true */
  S.key = function (code, me) {
    if (!me || !me.offer) return false;
    const i = code === 'Digit1' || code === 'Numpad1' ? 0 : code === 'Digit2' || code === 'Numpad2' ? 1 : code === 'Digit3' || code === 'Numpad3' ? 2 : -1;
    if (i >= 0) { if (i < me.offer.ids.length && UI.on.boon) UI.on.boon(i); return true; }
    if (code === 'Digit4' || code === 'Numpad4') { if (UI.on.reroll) UI.on.reroll(); return true; }
    return false;
  };
})();
