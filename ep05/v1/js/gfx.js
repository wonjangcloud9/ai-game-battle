/* 청홍대전 — gfx: 캔버스 그리기 도우미, 색상 유틸, 스프라이트 캐시 */
(function () {
  'use strict';
  const AOS = globalThis.AOS;
  const X = AOS.Gfx = {};
  const TAU = Math.PI * 2;
  X.TAU = TAU;
  X.FAMILY = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Segoe UI",system-ui,sans-serif';
  const fontCache = new Map();
  X.font = function (size, weight) {
    const k = (weight || 600) * 1000 + Math.round(size * 10) / 10;
    let f = fontCache.get(k);
    if (!f) { f = (weight || 600) + ' ' + (Math.round(size * 10) / 10) + 'px ' + X.FAMILY; fontCache.set(k, f); }
    return f;
  };

  /* ---------- 색상 ---------- */
  const rgbCache = new Map();
  function rgb(hex) {
    let c = rgbCache.get(hex);
    if (!c) {
      let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      c = [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
      rgbCache.set(hex, c);
    }
    return c;
  }
  X.rgb = rgb;
  const hex2 = (v) => { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); };
  const shadeCache = new Map();
  /* amt<0: 어둡게, amt>0: 밝게 (-1..1) */
  X.shade = function (hex, amt) {
    const k = hex + '|' + Math.round(amt * 100);
    let s = shadeCache.get(k);
    if (!s) {
      const c = rgb(hex), t = amt < 0 ? 0 : 255, a = Math.abs(amt);
      s = '#' + hex2(c[0] + (t - c[0]) * a) + hex2(c[1] + (t - c[1]) * a) + hex2(c[2] + (t - c[2]) * a);
      shadeCache.set(k, s);
    }
    return s;
  };
  const rgbaCache = new Map();
  X.rgba = function (hex, a) {
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    const q = Math.round(a * 50);
    const k = hex + '|' + q;
    let s = rgbaCache.get(k);
    if (!s) { const c = rgb(hex); s = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (q / 50) + ')'; rgbaCache.set(k, s); }
    return s;
  };
  X.mix = function (h1, h2, t) {
    const a = rgb(h1), b = rgb(h2);
    return '#' + hex2(a[0] + (b[0] - a[0]) * t) + hex2(a[1] + (b[1] - a[1]) * t) + hex2(a[2] + (b[2] - a[2]) * t);
  };

  /* ---------- 경로 ---------- */
  X.circle = function (ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r > 0 ? r : 0, 0, TAU); };
  X.ell = function (ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx > 0 ? rx : 0, ry > 0 ? ry : 0, rot || 0, 0, TAU); };
  X.rr = function (ctx, x, y, w, h, r) {
    if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    ctx.beginPath();
    if (r <= 0.01) { ctx.rect(x, y, w, h); return; }
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - r); ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  };
  X.poly = function (ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  };
  X.fs = function (ctx, fill, stroke, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke && lw > 0) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  };
  X.line = function (ctx, x1, y1, x2, y2, color, lw) {
    if (!(lw > 0)) return;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  };
  X.alpha = function (ctx, a) { ctx.globalAlpha = a < 0 ? 0 : a > 1 ? 1 : (a === a ? a : 0); };

  /* ---------- 텍스트 ---------- */
  X.text = function (ctx, str, x, y, size, color, align, weight, baseline) {
    ctx.font = X.font(size, weight); ctx.fillStyle = color || '#ffffff';
    ctx.textAlign = align || 'left'; ctx.textBaseline = baseline || 'alphabetic';
    ctx.fillText(str, x, y);
  };
  /* 외곽선이 있는 텍스트 */
  X.textO = function (ctx, str, x, y, size, color, align, weight, outline, ow, baseline) {
    ctx.font = X.font(size, weight); ctx.textAlign = align || 'left'; ctx.textBaseline = baseline || 'alphabetic';
    ctx.lineJoin = 'round'; ctx.lineWidth = ow || Math.max(2, size * 0.22); ctx.strokeStyle = outline || 'rgba(10,14,28,0.9)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color || '#ffffff'; ctx.fillText(str, x, y);
  };
  const wrapCache = new Map();
  /* 한글 포함 줄바꿈: 공백 우선, 넘치면 글자 단위 */
  X.wrap = function (ctx, str, maxW, size, weight) {
    const key = size + '|' + (weight || 600) + '|' + Math.round(maxW) + '|' + str;
    let lines = wrapCache.get(key);
    if (lines) return lines;
    ctx.font = X.font(size, weight);
    lines = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      const words = para.split(' ');
      for (let wi = 0; wi < words.length; wi++) {
        const word = words[wi];
        const cand = line ? line + ' ' + word : word;
        if (ctx.measureText(cand).width <= maxW) { line = cand; continue; }
        if (line) { lines.push(line); line = ''; }
        if (ctx.measureText(word).width <= maxW) { line = word; continue; }
        let part = '';
        for (const ch of word) {
          if (ctx.measureText(part + ch).width > maxW && part) { lines.push(part); part = ch; } else part += ch;
        }
        line = part;
      }
      lines.push(line);
    }
    if (wrapCache.size > 600) wrapCache.clear();
    wrapCache.set(key, lines);
    return lines;
  };

  /* ---------- 오프스크린 캔버스 / 스프라이트 ---------- */
  X.makeCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  };
  const glowCache = new Map();
  X.glowSprite = function (color) {
    let c = glowCache.get(color);
    if (!c) {
      c = X.makeCanvas(64, 64);
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, X.rgba(color, 1)); gr.addColorStop(0.25, X.rgba(color, 0.62)); gr.addColorStop(0.6, X.rgba(color, 0.18)); gr.addColorStop(1, X.rgba(color, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      glowCache.set(color, c);
    }
    return c;
  };
  /* 가산 혼합 광원 (호출 전후로 합성 모드를 바꾸지 않음: 호출자가 'lighter' 설정) */
  X.glow = function (ctx, x, y, r, color, a) {
    if (!(r > 0) || !(a > 0)) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(X.glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  };
  X.glowAdd = function (ctx, x, y, r, color, a) {
    if (!(r > 0) || !(a > 0)) return;
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    X.glow(ctx, x, y, r, color, a);
    ctx.globalCompositeOperation = op;
  };
  const sprites = new Map();
  X.sprite = function (key, w, h, draw) {
    let c = sprites.get(key);
    if (!c) { c = X.makeCanvas(w, h); draw(c.getContext('2d'), c); sprites.set(key, c); }
    return c;
  };
  X.clearSprites = function () { sprites.clear(); };
})();
