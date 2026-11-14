/* SUNDRIFT GP — sign atlas: every bit of trackside text / signage is drawn into one canvas at start-up.
   Regions are [x, y, w, h] in pixels of a 1024 x 1024 sheet. */
(function (root) {
  'use strict';
  var SD = root.SD;
  var SIZE = 1024;
  SD.ATLAS_SIZE = SIZE;
  SD.ATLAS = {
    banner: [0, 0, 1024, 176],
    chevron: [0, 180, 256, 128],
    boost: [260, 180, 380, 128],
    drift: [644, 180, 380, 128],
    ad0: [0, 312, 340, 136], ad1: [342, 312, 340, 136], ad2: [684, 312, 340, 136],
    ad3: [0, 452, 340, 136], ad4: [342, 452, 340, 136], ad5: [684, 452, 340, 136],
    n1: [0, 592, 128, 128], n2: [128, 592, 128, 128], n3: [256, 592, 128, 128], n4: [384, 592, 128, 128],
    n5: [512, 592, 128, 128], n6: [640, 592, 128, 128], n7: [768, 592, 128, 128], n8: [896, 592, 128, 128],
    checker: [0, 724, 256, 64],
    white: [1000, 1000, 16, 16]
  };
  /** [u0, v0, u1, v1]; v0 is the TOP edge of the region (canvas rows are uploaded unflipped). */
  SD.atlasUV = function (name) {
    var r = SD.ATLAS[name], p = 1.0;
    return [(r[0] + p) / SIZE, (r[1] + p) / SIZE, (r[0] + r[2] - p) / SIZE, (r[1] + r[3] - p) / SIZE];
  };

  var FONT = '"Arial Black", "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", Arial, sans-serif';

  function fitText(ctx, text, x, y, maxW, px, weight, italic) {
    var size = px;
    do {
      ctx.font = (italic ? 'italic ' : '') + (weight || 900) + ' ' + size + 'px ' + FONT;
      size -= 2;
    } while (ctx.measureText(text).width > maxW && size > 10);
    ctx.fillText(text, x, y);
  }

  function ad(ctx, r, bg1, bg2, fg, title, sub, accent) {
    var x = r[0], y = r[1], w = r[2], h = r[3];
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, bg1); g.addColorStop(1, bg2);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.22, y + h); ctx.lineTo(x + w * 0.34, y); ctx.lineTo(x + w * 0.12, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    fitText(ctx, title, x + w * 0.56, y + h * (sub ? 0.42 : 0.52), w * 0.8, sub ? 58 : 70, 900, true);
    if (sub) {
      ctx.globalAlpha = 0.9;
      fitText(ctx, sub, x + w * 0.56, y + h * 0.8, w * 0.8, 26, 800, false);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 6; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  }

  /** Paint the whole sheet. Returns the canvas (caller uploads it as a texture). */
  SD.drawAtlas = function (canvas) {
    canvas.width = canvas.height = SIZE;
    var ctx = canvas.getContext('2d'), A = SD.ATLAS, r, i, j;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE);

    // --- start banner
    r = A.banner;
    var g = ctx.createLinearGradient(0, r[1], 0, r[1] + r[3]);
    g.addColorStop(0, '#ff7a1a'); g.addColorStop(0.55, '#ff3d6e'); g.addColorStop(1, '#c2247e');
    ctx.fillStyle = g; ctx.fillRect(r[0], r[1], r[2], r[3]);
    var cs = r[3] / 4;
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111318' : '#ffffff';
      ctx.fillRect(r[0] + j * cs, r[1] + i * cs, cs, cs);
      ctx.fillRect(r[0] + r[2] - (j + 1) * cs, r[1] + i * cs, cs, cs);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = 'italic 900 118px ' + FONT;
    ctx.strokeStyle = '#3a0d3f'; ctx.lineWidth = 16; ctx.strokeText('SUNDRIFT GP', 512, r[1] + r[3] / 2 + 4);
    ctx.fillStyle = '#fff6c9'; ctx.fillText('SUNDRIFT GP', 512, r[1] + r[3] / 2 + 4);

    // --- corner chevrons (pointing right)
    r = A.chevron;
    ctx.fillStyle = '#ffd21f'; ctx.fillRect(r[0], r[1], r[2], r[3]);
    ctx.fillStyle = '#16181d';
    for (i = 0; i < 3; i++) {
      var cx = r[0] + 22 + i * 82, cy = r[1] + r[3] / 2, hh = r[3] / 2 - 10;
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + 36, cy - hh); ctx.lineTo(cx + 78, cy); ctx.lineTo(cx + 36, cy + hh); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx + 42, cy);
      ctx.closePath(); ctx.fill();
    }

    ad(ctx, A.boost, '#0b1d4d', '#1456d8', '#7df9ff', 'BOOST ZONE', 'FULL THROTTLE', '#ffd21f');
    ad(ctx, A.drift, '#3d0b52', '#b0178f', '#ffe45e', 'DRIFT!', '미끄러지면 채워진다', '#ff7a1a');
    ad(ctx, A.ad0, '#ff8a00', '#ffcf3f', '#402000', 'KOKO TIRES', 'GRIP · SLIDE · SMILE', '#ffffff');
    ad(ctx, A.ad1, '#0aa37f', '#3fe0b0', '#06302a', 'SUNNY COLA', '청량함 한 모금', '#fff36b');
    ad(ctx, A.ad2, '#1b2a6b', '#3b6cf0', '#ffffff', '부릉부릉 오일', 'ENGINE OIL', '#ff4d6d');
    ad(ctx, A.ad3, '#f03a5f', '#ff8fa3', '#ffffff', 'TURBO MILK', '한 잔에 부스터 충전', '#2b1055');
    ad(ctx, A.ad4, '#242830', '#4b5566', '#ffd21f', '번개택배', 'LIGHTNING EXPRESS', '#ff7a1a');
    ad(ctx, A.ad5, '#7b2ff7', '#f107a3', '#ffffff', 'ISLE AIR', 'FLY · DRIFT · REPEAT', '#7df9ff');

    // --- kart numbers
    for (i = 1; i <= 8; i++) {
      r = A['n' + i];
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(r[0] + 64, r[1] + 64, 60, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#15171c'; ctx.font = 'italic 900 88px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i), r[0] + 60, r[1] + 70);
    }

    // --- checker strip
    r = A.checker;
    for (i = 0; i < 2; i++) for (j = 0; j < 8; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111318' : '#ffffff';
      ctx.fillRect(r[0] + j * 32, r[1] + i * 32, 32, 32);
    }
    r = A.white;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(r[0] - 8, r[1] - 8, r[2] + 16, r[3] + 16);
    return canvas;
  };
})(typeof window !== 'undefined' ? window : globalThis);
