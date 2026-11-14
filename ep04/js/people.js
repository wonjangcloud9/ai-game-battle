/* 사람 — 앉아서 시험 보는 수험생들과 걸어 다니는 감독관.
 *  · 몸통·팔다리는 단면이 타원인 관(loft)으로 빚고, 팔은 어깨–팔꿈치–손목 두 마디를 풀어 손을 원하는 자리에 놓는다
 *  · 수험생은 쓰기·읽기·생각·책장 넘기기·시계 보기·한숨·기침 같은 행동을 스스로 고르고, 그때그때 소리를 알린다(onSound)
 */
(function (GX) {
  'use strict';
  var M4 = GX.M4, Geo = GX.Geo, W = GX.W;

  var SKIN = [0xe8bd9c, 0xddae8b, 0xf0cdb0, 0xd9a47e];
  var HAIR = [0x1b1b1e, 0x24201d, 0x33261d, 0x15161a, 0x3d2c20, 0x4a3626];
  var TOPS = [0x2e3a4f, 0x8c8f94, 0xd8d0bd, 0x5b6b4d, 0x7d2f35, 0x232327, 0xc7b18f, 0x4a6a8f, 0xe4e1da, 0x6a5a7a, 0x3d5a52, 0x9a6b4a, 0x3a3d44, 0xb9c4cf];
  var PANTS = [0x23272e, 0x2f3b52, 0x4a4d53, 0x3d4f6b, 0x1c1d20, 0x6b6253, 0x8a8572];
  var SHOES = [0xf0f0ec, 0x1e1f22, 0x4b4f55, 0x7a5a3c, 0xd9d4c6];

  function pick(arr, r) { return arr[Math.floor(r() * arr.length) % arr.length]; }

  /* 머리카락. 머리 중심은 (0, 0.125, 0) 근처, 얼굴은 -z 를 향한다 */
  function hairStyle(g, style, colr, skin) {
    var o14 = { seg: 14, rings: 9 };
    if (style === 5) {                 /* 투블럭: 옆·뒤는 짧게 밀고 위만 길다 */
      var side = GX.mixHex(skin, colr, 0.86);
      g.ellipsoid(0, 0.127, 0.012, 0.0965, 0.1, 0.108, side, { seg: 14, rings: 8, lat0: -0.3 });
      g.ellipsoid(0, 0.098, 0.03, 0.088, 0.07, 0.086, side, o14);
      g.ellipsoid(0, 0.168, -0.002, 0.093, 0.084, 0.107, colr, { seg: 14, rings: 8, lat0: 0.02 });
      g.ellipsoid(0, 0.2, -0.05, 0.08, 0.036, 0.055, colr, { seg: 12, rings: 6 });
      return;
    }
    g.ellipsoid(0, 0.14, 0.012, 0.1, 0.108, 0.11, colr, { seg: 16, rings: 9, lat0: style === 1 || style === 3 ? -0.4 : -0.12 });
    g.ellipsoid(0, 0.098, 0.03, 0.088, 0.07, 0.086, colr, o14);                        /* 뒤통수 아래 */
    if (style === 1) {                 /* 단발: 턱선 뒤로 떨어지는 옆·뒷머리(앞으로 나오면 수염처럼 보인다) */
      g.ellipsoid(0, 0.072, 0.046, 0.108, 0.094, 0.084, colr, o14);
    } else if (style === 2) {          /* 묶은 머리 */
      g.ellipsoid(0, 0.13, 0.118, 0.036, 0.04, 0.04, colr, { seg: 10, rings: 6 });
      g.ellipsoid(0, 0.03, 0.142, 0.032, 0.115, 0.036, colr, { seg: 10, rings: 6 });
    } else if (style === 3) {          /* 긴 머리 */
      g.ellipsoid(0, 0.06, 0.036, 0.108, 0.11, 0.094, colr, o14);
      g.ellipsoid(0, -0.05, 0.078, 0.112, 0.19, 0.06, colr, o14);
    } else if (style === 4) {          /* 앞머리 */
      g.ellipsoid(0, 0.186, -0.058, 0.09, 0.04, 0.058, colr, { seg: 12, rings: 6 });
    } else if (style === 6) {          /* 올림머리 */
      g.ellipsoid(0, 0.215, 0.07, 0.046, 0.042, 0.046, colr, { seg: 10, rings: 6 });
    } else {                           /* 짧은 머리 */
      g.ellipsoid(0, 0.196, -0.05, 0.084, 0.03, 0.052, colr, { seg: 12, rings: 6 });
    }
  }

  /* 수험생 머리(원점 = 목 관절) */
  function headGeo(o) {
    var g = new Geo(), sk = o.skin, s;
    g.ellipsoid(0, 0.128, 0, 0.094, 0.108, 0.104, sk, { seg: 16, rings: 10 });
    g.ellipsoid(0, 0.066, -0.014, 0.074, 0.07, 0.075, sk, { seg: 14, rings: 8 });
    for (s = -1; s <= 1; s += 2) {
      g.ellipsoid(s * 0.094, 0.105, 0.008, 0.014, 0.03, 0.02, sk, { seg: 8, rings: 5 });
      g.ellipsoid(s * 0.036, 0.118, -0.0945, 0.011, 0.0075, 0.006, 0x1a1a1c, { seg: 8, rings: 5 });
      g.push().translate(s * 0.037, 0.141, -0.0955).rotZ(s * 0.06); g.box(0, 0, 0, 0.034, 0.006, 0.006, o.hair); g.pop();
    }
    hairStyle(g, o.hairStyle, o.hair, sk);
    g.ellipsoid(0, 0.092, -0.106, 0.011, 0.02, 0.014, sk, { seg: 8, rings: 5 });
    if (o.mask) {
      g.ellipsoid(0, 0.068, -0.066, 0.074, 0.055, 0.052, 0xf3f4f1, { seg: 12, rings: 7 });
      g.box(0, 0.07, -0.119, 0.004, 0.08, 0.004, 0xdfe1dd);
      for (s = -1; s <= 1; s += 2) g.box(s * 0.086, 0.086, -0.03, 0.004, 0.006, 0.075, 0xf3f4f1);
    } else {
      g.box(0, 0.05, -0.0965, 0.03, 0.005, 0.006, 0x9a5a50);
    }
    if (o.glasses) {
      for (s = -1; s <= 1; s += 2) {
        g.box(s * 0.037, 0.118, -0.104, 0.048, 0.034, 0.003, 0x1d1f23);
        g.box(s * 0.037, 0.118, -0.106, 0.04, 0.026, 0.002, 0xc9d4de);
        g.box(s * 0.078, 0.121, -0.05, 0.003, 0.005, 0.11, 0x1d1f23);
      }
      g.box(0, 0.123, -0.104, 0.028, 0.005, 0.003, 0x1d1f23);
    }
    return g;
  }

  /* 손(원점 = 손목, -Y 가 손끝 쪽, +Z 가 손등). pen 이 있으면 펜을 쥔 모양 */
  function handGeo(g, y0, skin, sgn, pen) {
    if (pen) {
      g.ellipsoid(0, y0 - 0.042, -0.004, 0.036, 0.046, 0.024, skin, { seg: 10, rings: 6 });
      g.ellipsoid(0.002, y0 - 0.078, -0.022, 0.03, 0.026, 0.022, skin, { seg: 8, rings: 5 });
      g.ellipsoid(sgn * 0.026, y0 - 0.058, -0.02, 0.012, 0.03, 0.013, skin, { seg: 6, rings: 4 });
      g.tube([0.0, y0 - 0.108, -0.056], [0.004, y0 - 0.02, 0.05], 0.0048, 0.0048, 6, 0x1b1b1e);
      g.tube([0.004, y0 - 0.02, 0.05], [0.006, y0 + 0.006, 0.076], 0.0056, 0.0056, 6, 0xf0efe8);
    } else {
      g.ellipsoid(0, y0 - 0.045, 0, 0.038, 0.05, 0.017, skin, { seg: 10, rings: 6 });
      g.ellipsoid(0, y0 - 0.108, -0.006, 0.034, 0.042, 0.013, skin, { seg: 10, rings: 5 });
      g.ellipsoid(sgn * 0.04, y0 - 0.062, -0.004, 0.012, 0.034, 0.012, skin, { seg: 6, rings: 4 });
    }
  }

  /* ───────── 앉아 있는 수험생 ─────────
   * 기준: 의자 중심 바닥이 원점, -z 를 보고 앉는다. 책상 중심은 z=-0.5 */
  var DY = W.DESK_Y + 0.052;                 /* 책상 위에 올린 손목 높이 */
  var POSE = {
    restR: [0.17, DY, -0.36], restL: [-0.22, DY - 0.012, -0.34],
    lapR: [0.12, 0.6, -0.2], lapL: [-0.12, 0.6, -0.2],
    book: [-0.105, DY, -0.4], omr: [0.105, DY, -0.375]
  };

  function Examinee(eng, seat, r, world) {
    var tx = world.tx, fem = r() < 0.48, i, sgn;
    var o = {
      skin: pick(SKIN, r), hair: pick(HAIR, r), top: pick(TOPS, r), pants: pick(PANTS, r), shoes: pick(SHOES, r),
      hairStyle: fem ? [1, 2, 3, 3, 6][Math.floor(r() * 5)] : [0, 0, 4, 5][Math.floor(r() * 4)],
      glasses: r() < 0.34, mask: r() < 0.3, hood: r() < 0.42, fem: fem
    };
    this.eng = eng; this.seat = seat; this.o = o;
    var b = (fem ? 0.9 : 1) * (0.94 + r() * 0.14);          /* 몸집 */
    var sw = fem ? 0.158 + r() * 0.012 : 0.178 + r() * 0.016;
    this.sw = sw; this.shY = 0.44;
    this.L1 = fem ? 0.255 : 0.272; this.L2 = fem ? 0.232 : 0.246;
    this.leanBase = 0.26 + r() * 0.2;
    var mat = { tex: tx.fabric, rim: 0.3 };
    var base = M4.create();
    M4.fromPose(base, seat.chair[0], 0, seat.chair[1], 0, 0, 0);
    this.base = base; this.cx = seat.chair[0]; this.cz = seat.chair[1];

    /* 다리·엉덩이(고정) */
    var g = new Geo();
    for (sgn = -1; sgn <= 1; sgn += 2) {
      var kx = sgn * (0.092 + r() * 0.03), fz = -0.3 + (r() - 0.5) * 0.18, ky = 0.5;
      g.loft([{ p: [sgn * 0.085, 0.515, 0.1], rx: 0.08 * b, rz: 0.072 * b }, { p: [sgn * 0.09, 0.51, -0.12], rx: 0.073 * b, rz: 0.066 * b },
        { p: [kx, ky, -0.36], rx: 0.058, rz: 0.056 }], 10, o.pants, { side: [1, 0, 0], cap0: true, uv: [0, 0, 3, 2] });
      g.ellipsoid(kx, ky - 0.004, -0.362, 0.058, 0.058, 0.058, o.pants, { seg: 10, rings: 6 });
      g.loft([{ p: [kx, ky, -0.365], rx: 0.054, rz: 0.054 }, { p: [kx, 0.3, (-0.365 + fz) / 2 - 0.01], rx: 0.05, rz: 0.052 }, { p: [kx, 0.085, fz], rx: 0.04, rz: 0.042 }],
        10, o.pants, { side: [1, 0, 0], uv: [0, 0, 3, 2] });
      g.loft([{ p: [kx, 0.05, fz + 0.075], rx: 0.038, rz: 0.04 }, { p: [kx, 0.052, fz], rx: 0.046, rz: 0.05 }, { p: [kx, 0.042, fz - 0.12], rx: 0.046, rz: 0.038 },
        { p: [kx, 0.03, fz - 0.185], rx: 0.034, rz: 0.026 }], 10, o.shoes, { side: [1, 0, 0], sq: 2.6, cap0: true, cap1: true });
    }
    g.ellipsoid(0, 0.5, 0.072, 0.164 * b, 0.072, 0.112, o.pants, { seg: 12, rings: 6 });
    this.legs = eng.add(eng.createMesh(g), { model: base, tex: tx.fabric, rim: 0.2 });

    /* 몸통(원점 = 골반) */
    var gt = new Geo();
    gt.loft([
      { p: [0, -0.055, 0.004], rx: 0.172 * b, rz: 0.128 * b, sq: 2.5 },
      { p: [0, 0.1, 0], rx: 0.162 * b, rz: 0.114 * b, sq: 2.4 },
      { p: [0, 0.22, 0.004], rx: 0.152 * b, rz: 0.104 * b, sq: 2.3 },
      { p: [0, 0.34, 0.008], rx: sw - 0.016, rz: 0.109 * b, sq: 2.4 },
      { p: [0, 0.425, 0.01], rx: sw + 0.004, rz: 0.104 * b, sq: 2.6 },
      { p: [0, 0.474, 0.008], rx: sw * 0.84, rz: 0.084 * b, sq: 2.3 },
      { p: [0, 0.5, 0.002], rx: 0.074, rz: 0.068 },
      { p: [0, 0.512, 0], rx: 0.054, rz: 0.054 }
    ], 14, o.top, { side: [1, 0, 0], uv: [0, 0, 4, 3], cap0: true });
    gt.tube([0, 0.5, 0], [0, 0.585, -0.012], 0.047, 0.045, 10, o.skin, { caps: false });
    for (sgn = -1; sgn <= 1; sgn += 2) gt.ellipsoid(sgn * sw, 0.438, 0.006, 0.062 * b, 0.058, 0.066 * b, o.top, { seg: 10, rings: 6 });
    if (o.hood) {                       /* 후드티: 등 뒤로 늘어진 모자 */
      gt.loft([{ p: [0, 0.505, 0.03], rx: 0.1, rz: 0.045 }, { p: [0, 0.46, 0.098], rx: 0.125, rz: 0.058 }, { p: [0, 0.37, 0.128], rx: 0.105, rz: 0.046 },
        { p: [0, 0.31, 0.122], rx: 0.05, rz: 0.022 }], 12, GX.mixHex(o.top, 0x000000, 0.1), { side: [1, 0, 0], cap1: true, uv: [0, 0, 3, 1] });
    } else {                            /* 옷깃 */
      gt.loft([{ p: [0, 0.492, 0.004], rx: 0.08, rz: 0.074 }, { p: [0, 0.525, 0.002], rx: 0.062, rz: 0.06 }], 12, GX.mixHex(o.top, 0xffffff, 0.12), { side: [1, 0, 0] });
    }
    this.torso = eng.add(eng.createMesh(gt), mat);
    this.neck = [0, 0.575, -0.012];

    this.head = eng.add(eng.createMesh(headGeo(o)), { rim: 0.25 });

    /* 팔: 위팔(공용 메시 두 번) · 아래팔+손(오른손은 펜을 쥠) */
    var gu = new Geo();
    gu.ellipsoid(0, 0, 0, 0.058 * b, 0.056, 0.06 * b, o.top, { seg: 10, rings: 6 });
    gu.loft([{ p: [0, 0, 0], rx: 0.056 * b, rz: 0.058 * b }, { p: [0, -this.L1 * 0.5, 0], rx: 0.053 * b, rz: 0.054 * b }, { p: [0, -this.L1, 0], rx: 0.047 * b, rz: 0.048 * b }],
      10, o.top, { side: [1, 0, 0], uv: [0, 0, 2, 1.5] });
    gu.ellipsoid(0, -this.L1, 0, 0.048 * b, 0.048, 0.049 * b, o.top, { seg: 10, rings: 6 });
    var um = eng.createMesh(gu);
    /* 팔은 햇빛 그림자를 만들지 않는다(몸통·머리·다리만으로 충분하고 그리기 호출이 줄어든다) */
    this.uarmR = eng.add(um, { tex: tx.fabric, rim: 0.3, cast: false }); this.uarmL = eng.add(um, { tex: tx.fabric, rim: 0.3, cast: false });
    this.farm = [];
    for (i = 0; i < 2; i++) {
      var ga = new Geo(), sg2 = i ? -1 : 1;      /* 0 = 오른팔 */
      ga.loft([{ p: [0, 0, 0], rx: 0.047 * b, rz: 0.048 * b }, { p: [0, -this.L2 * 0.6, 0], rx: 0.042 * b, rz: 0.042 * b }, { p: [0, -this.L2 + 0.012, 0], rx: 0.035, rz: 0.033 },
        { p: [0, -this.L2 + 0.004, 0], rx: 0.037, rz: 0.035, c: GX.mixHex(o.top, 0x000000, 0.14) }], 10, o.top, { side: [1, 0, 0], cap1: true, uv: [0, 0, 2, 1.5] });
      handGeo(ga, -this.L2, o.skin, sg2, i === 0);
      this.farm.push(eng.add(eng.createMesh(ga), { tex: tx.fabric, rim: 0.25, cast: false }));
    }

    /* 상태 */
    this.rnd = GX.rng(Math.floor(r() * 1e9));
    this.t = this.rnd() * 10; this.phase = this.rnd() * 6.28;
    this.mode = 'wait';
    this.act = 'idle'; this.at = 0; this.dur = 0.5 + this.rnd() * 3; this.k = 0;
    this.sick = r() < 0.2;                       /* 감기 기운: 기침·훌쩍임이 잦다 */
    this.sigher = r() < 0.3;
    this.voice = fem ? 1.22 + r() * 0.16 : 0.86 + r() * 0.22;
    this.page = 0;
    this.onSound = null;
    this.cur = { lean: this.leanBase, tw: 0, hy: 0, hp: -0.3, hr: 0, lift: 0, R: POSE.lapR.slice(), L: POSE.lapL.slice() };
    this.tg = { lean: this.leanBase, tw: 0, hy: 0, hp: -0.3, hr: 0, lift: 0, R: POSE.lapR.slice(), L: POSE.lapL.slice() };
    this.jerk = 0; this.wr = [0, 0]; this.line = 0;
    this.lookAt = null;
    this._s = [0, 0, 0]; this._e = [0, 0, 0]; this._w = [0, 0, 0];
    this.update(0);
  }

  Examinee.prototype._snd = function (type, o) { if (this.onSound) this.onSound(type, this, o); };
  /* 바깥에서 일으키는 반응: 'bell'(종) · 'announce'(안내 말) · 'pass'(감독관이 지나감) */
  Examinee.prototype.react = function (what) {
    var r = this.rnd;
    if (what === 'bell') { this._go('look', 1.2 + r() * 1.6); this.lookAt = [-1.25 + (r() - 0.5), 2.5, -4.8]; }
    else if (what === 'announce' && r() < 0.6) { this._go('clock', 1.3 + r() * 1.8); }
    else if (what === 'pass' && this.act !== 'cough' && r() < 0.3) { this.stiff = 1.6 + r(); }
  };
  Examinee.prototype._go = function (act, dur) { this.act = act; this.at = 0; this.dur = dur; this.k = 0; this.wr[0] = this.wr[1] = 0; };
  /* 옆 사람을 쳐다본다(곁눈에 걸린 불빛이나 손동작이 궁금해서). (x,y,z): 쳐다볼 곳, dur: 초 */
  Examinee.prototype.peek = function (x, y, z, dur) {
    this._go('peek', dur);
    this.lookAt = [x, y, z];
    this.peekSide = x > this.cx ? -1 : 1;
  };
  /* 고개가 다 돌아가 실제로 보고 있는가 */
  Examinee.prototype.isPeeking = function () { return this.act === 'peek' && this.at > 0.4; };
  /* 손을 들어 감독관을 부른다. (x,y,z): 감독관 쪽 */
  Examinee.prototype.report = function (x, y, z, dur) {
    this._go('report', dur);
    this.lookAt = [x, y, z];
  };
  /* 지금 하는 일에 얼마나 빠져 있는가: 값이 클수록 곁눈에 걸리는 것을 잘 알아챈다 */
  Examinee.prototype.awareness = function () {
    var a = this.act;
    if (a === 'write' || a === 'mark' || a === 'flip' || a === 'cough') return 0.35;
    if (a === 'read' || a === 'think' || a === 'thinkL' || a === 'scratch' || a === 'tap') return 0.8;
    return 1.2;
  };

  Examinee.prototype._pick = function () {
    var r = this.rnd, k = r();
    if (this.mode !== 'write') {
      if (this.mode === 'done') { this._go(k < 0.25 ? 'stretch' : (k < 0.55 ? 'look' : 'idle'), 2 + r() * 4); this.lookAt = null; return; }
      if (k < 0.5) this._go('idle', 2 + r() * 5);
      else if (k < 0.78) { this._go('look', 1.5 + r() * 2.5); this.lookAt = null; }
      else if (k < 0.86) this._go('clock', 1.4 + r() * 1.4);
      else if (k < 0.93) this._go('stretch', 2 + r() * 1.5);
      else if (k < 0.965 || this.sick) this._go(this.sick && r() < 0.5 ? 'cough' : 'sniff', 1.2);
      else this._go('sigh', 2.4);
      return;
    }
    var coughP = this.sick ? 0.035 : 0.006, sniffP = this.sick ? 0.05 : 0.012, sighP = this.sigher ? 0.04 : 0.012;
    if (k < coughP) return this._go('cough', 0.5 + Math.floor(1 + r() * 2.6) * 0.34);
    k -= coughP;
    if (k < sniffP) return this._go(r() < 0.6 ? 'sniff' : 'throat', 1.0);
    k -= sniffP;
    if (k < sighP) return this._go('sigh', 2.4 + r() * 0.6);
    k -= sighP;
    if (k < 0.36) { this.line = 0; return this._go('write', 3 + r() * 7); }
    if (k < 0.64) return this._go('read', 3 + r() * 8);
    if (k < 0.73) return this._go('mark', 1.2 + r() * 1.2);
    if (k < 0.81) return this._go('flip', 1.25);
    if (k < 0.89) return this._go(r() < 0.5 ? 'think' : 'thinkL', 2.5 + r() * 5);
    if (k < 0.93) return this._go('clock', 1.2 + r() * 1.6);
    if (k < 0.96) return this._go('stretch', 1.8 + r() * 1.6);
    if (k < 0.98) return this._go('scratch', 1.4 + r() * 1.2);
    return this._go('tap', 1.2 + r() * 1.5);
  };

  function setV(a, b) { a[0] = b[0]; a[1] = b[1]; a[2] = b[2]; }
  /* 머리 위의 한 점(목 관절 기준)을 의자 기준 좌표로 옮기고 (ox,oy,oz) 를 더한다.
     사람마다 숙인 정도가 달라도 턱 괴기·기침·머리 긁기 같은 '얼굴에 손 대는' 자세가 맞도록 손목 목표를 머리에 붙인다 */
  Examinee.prototype._face = function (out, x, y, z, ox, oy, oz) {
    var h = this.head.model;
    out[0] = h[0] * x + h[4] * y + h[8] * z + h[12] - this.cx + ox;
    out[1] = h[1] * x + h[5] * y + h[9] * z + h[13] + oy;
    out[2] = h[2] * x + h[6] * y + h[10] * z + h[14] - this.cz + oz;
  };

  Examinee.prototype._behave = function (dt) {
    var r = this.rnd, tg = this.tg, t = this.t, at = this.at, u = at / Math.max(0.01, this.dur), ph = this.phase, k;
    tg.lean = this.leanBase; tg.tw = 0; tg.hr = 0; tg.lift = 0; tg.hy = 0;
    setV(tg.R, POSE.restR); setV(tg.L, POSE.restL);
    switch (this.act) {
      case 'write':            /* 문제지 여백에 끄적이며 계산 */
        tg.hp = -0.34; tg.hy = 0.1;
        this.k -= dt;
        if (this.k <= 0) {
          this.k = 0.7 + r() * 1.5;
          var bd = 0.3 + r() * 0.6;
          if (this.k < bd + 0.15) this.k = bd + 0.15 + r() * 0.3;
          this.wr[0] = bd; this.line += 0.012 + r() * 0.02;
          if (this.line > 0.1) this.line = 0;
          this._snd('scribble', { dur: bd });
        }
        k = 0;
        if (this.wr[0] > 0) { this.wr[0] -= dt; k = 1; }
        tg.R[0] = POSE.book[0] + this.line * 0.9 - 0.04 + Math.sin(t * 19 + ph) * 0.005 * k;
        tg.R[1] = POSE.book[1];
        tg.R[2] = POSE.book[2] + this.line * 0.5 + Math.sin(t * 27 + ph) * 0.004 * k;
        break;
      case 'read':
        tg.hp = -0.3; tg.hy = 0.12 + Math.sin(t * 1.9 + ph) * 0.06;
        tg.R[0] = POSE.restR[0] - 0.06; tg.R[2] = POSE.restR[2] - 0.03;
        tg.R[1] = POSE.restR[1] + Math.max(0, Math.sin(t * 3.1 + ph)) * 0.004;
        break;
      case 'mark':             /* 답안지에 칠하기 */
        tg.hp = -0.32; tg.hy = -0.08;
        if (this.k === 0 && at > 0.35) { this.k = 1; this._snd('mark'); }
        k = at > 0.35 && at < 1.0 ? 1 : 0;
        tg.R[0] = POSE.omr[0] + Math.sin(t * 24) * 0.004 * k; tg.R[1] = POSE.omr[1]; tg.R[2] = POSE.omr[2] + Math.sin(t * 31) * 0.003 * k;
        break;
      case 'flip':             /* 왼손으로 책장을 넘긴다 */
        tg.hp = -0.3; tg.hy = 0.14;
        if (at < 0.35) { tg.L[0] = -0.09; tg.L[1] = DY + 0.01; tg.L[2] = -0.33; }
        else if (at < 0.85) {
          k = (at - 0.35) / 0.5;
          tg.L[0] = GX.lerp(-0.09, -0.33, k); tg.L[1] = DY + 0.02 + Math.sin(k * Math.PI) * 0.1; tg.L[2] = GX.lerp(-0.33, -0.4, k);
          if (this.k === 0) {
            this.k = 1; this._snd('page');
            var st = this.seat;
            if (st.open && st.pages) { this.page = 1 - this.page; st.open.mesh = st.pages[this.page]; }
          }
        }
        break;
      case 'think':            /* 펜 끝을 턱에 대고 */
        tg.hp = 0.12 + Math.sin(t * 0.5 + ph) * 0.05; tg.hy = Math.sin(t * 0.31 + ph) * 0.14; tg.lean = this.leanBase - 0.1;
        this._face(tg.R, 0, 0, -0.075, 0.067, -0.071, -0.017);     /* 턱 끝 바로 아래·오른쪽 */
        break;
      case 'thinkL':           /* 왼손으로 턱을 괴고 */
        tg.hp = -0.06; tg.hy = 0.1; tg.hr = 0.12; tg.lean = this.leanBase + 0.04;
        this._face(tg.L, 0, 0, -0.075, -0.063, -0.011, 0.063);     /* 턱 밑·왼쪽 */
        break;
      case 'clock':            /* 고개를 들어 시계를 본다 */
        this.lookAt = [W.CLOCK[0], W.CLOCK[1], -W.RZ];
        tg.lean = this.leanBase - 0.12;
        break;
      case 'look':
        if (!this.lookAt) {
          k = r();
          this.lookAt = k < 0.4 ? [-0.35 + (r() - 0.5) * 2, 1.5, -4.2] : (k < 0.7 ? [-4.2, 1.6 + r(), this.cz - 2 + r() * 3] : [this.cx + (r() - 0.5) * 3, 0.9, this.cz - 1.6]);
        }
        tg.lean = this.leanBase - 0.12;
        break;
      case 'sigh':             /* 들이쉬고 → 길게 내쉰다 */
        if (at < 0.8) { tg.lean = this.leanBase - 0.09; tg.lift = 0.014; tg.hp = 0.0; }
        else {
          if (this.k === 0) { this.k = 1; this._snd('sigh'); }
          tg.lean = this.leanBase + 0.07; tg.lift = -0.008; tg.hp = -0.34;
        }
        break;
      case 'cough':            /* 왼손으로 입을 가리고 콜록 */
        tg.hp = -0.26; tg.hy = -0.12; tg.lean = this.leanBase + 0.05;
        this._face(tg.L, 0, 0.05, -0.155, -0.033, -0.031, 0.002);  /* 손바닥이 입 바로 앞에 오는 손목 자리 */
        k = Math.floor((at - 0.42) / 0.34);
        if (at > 0.42 && k >= this.k && at < this.dur - 0.1) { this.k = k + 1; this.jerk = 1; this._snd('cough', { n: k }); }
        break;
      case 'sniff':
        tg.hp = -0.2;
        if (this.k === 0 && at > 0.3) { this.k = 1; this.jerk = 0.4; this._snd('sniff'); }
        break;
      case 'throat':
        tg.hp = -0.24;
        if (this.k === 0 && at > 0.3) { this.k = 1; this.jerk = 0.5; this._snd('throat'); }
        break;
      case 'stretch':          /* 목을 한 바퀴 돌린다 */
        tg.lean = this.leanBase - 0.16; tg.hr = Math.sin(u * Math.PI * 2) * 0.3; tg.hp = 0.1 - Math.cos(u * Math.PI * 2) * 0.22;
        if (this.k === 0 && at > 0.4) { this.k = 1; if (r() < 0.6) this._snd('creak'); }
        break;
      case 'scratch':          /* 펜 든 손으로 머리를 긁적 */
        tg.hp = -0.22; tg.hy = -0.08;
        this._face(tg.R, 0.13 + Math.sin(t * 15) * 0.008, 0.0885, 0.153, 0, 0, 0);   /* 뒤통수 오른쪽 */
        break;
      case 'tap':              /* 펜으로 책상을 톡톡 */
        tg.hp = -0.28; tg.hy = 0.1;
        this.k -= dt;
        if (this.k <= 0) { this.k = 0.22 + r() * 0.12; this.wr[1] = 0.1; this._snd('tap'); }
        if (this.wr[1] > 0) this.wr[1] -= dt;
        tg.R[1] = POSE.restR[1] + (this.wr[1] > 0 ? 0 : 0.018);
        break;
      case 'peek':             /* 옆 사람을 쳐다본다: 몸을 조금 틀고 고개를 돌린다 */
        tg.lean = this.leanBase - 0.1;
        tg.tw = (this.peekSide || 1) * 0.32 * GX.smoothstep(0, 0.35, at);
        break;
      case 'report':           /* 펜 든 손을 번쩍 들고 감독관 쪽을 본다 */
        tg.lean = this.leanBase - 0.2;
        tg.R[0] = 0.21; tg.R[1] = 1.36; tg.R[2] = -0.06;
        break;
      default:                 /* idle: 시험 전에는 두 손을 무릎에, 끝난 뒤에는 책상 위에 */
        tg.hp = -0.12 + Math.sin(t * 0.21 + ph) * 0.07; tg.hy = Math.sin(t * 0.17 + ph * 2) * 0.1; tg.lean = this.leanBase - 0.1;
        if (this.mode === 'wait' && (this.seat.i % 3) !== 0) { setV(tg.R, POSE.lapR); setV(tg.L, POSE.lapL); }
    }
    if (this.act !== 'look' && this.act !== 'clock' && this.act !== 'peek' && this.act !== 'report') this.lookAt = null;
    if (this.lookAt) {         /* 세상 속 한 점을 바라보는 고개 각도(몸을 튼 만큼은 빼고, 옆을 볼 때는 고개를 더 돌린다) */
      var hx = this.cx, hy = 1.12, hz = this.cz - 0.12;
      var dx = this.lookAt[0] - hx, dy = this.lookAt[1] - hy, dz = this.lookAt[2] - hz;
      var lim = this.act === 'peek' ? 1.22 : 1.0;
      tg.hy = GX.clamp(Math.atan2(-dx, -dz) - tg.tw, -lim, lim);
      tg.hp = GX.clamp(Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)), -0.5, 0.5) + tg.lean;
    } else if (this.act !== 'think' && this.act !== 'stretch' && this.act !== 'sigh') {
      tg.hp += tg.lean * 0.4;      /* 숙인 몸만큼 고개를 조금 든다 */
    }
    if (this.stiff > 0) { this.stiff -= dt; tg.lean -= 0.05; }
  };

  var _up = [0, 0, 0];
  Examinee.prototype.update = function (dt) {
    var c = this.cur, tg = this.tg, i;
    this.t += dt;
    if (dt > 0) {
      this.at += dt;
      if (this.at >= this.dur) this._pick();
      this._behave(dt);
      var k = 1 - Math.exp(-6 * dt), kh = 1 - Math.exp(-9 * dt);
      c.lean += (tg.lean - c.lean) * k; c.tw += (tg.tw - c.tw) * k; c.lift += (tg.lift - c.lift) * k;
      c.hy += (tg.hy - c.hy) * k; c.hp += (tg.hp - c.hp) * k; c.hr += (tg.hr - c.hr) * k;
      for (i = 0; i < 3; i++) { c.R[i] += (tg.R[i] - c.R[i]) * kh; c.L[i] += (tg.L[i] - c.L[i]) * kh; }
      if (this.jerk > 0) this.jerk = Math.max(0, this.jerk - dt * 5);
    }
    var br = Math.sin(this.t * 1.25 + this.phase), jk = this.jerk * this.jerk;
    var lean = c.lean + br * 0.006 + jk * 0.09, lift = c.lift + br * 0.0025;
    /* 몸통 */
    var m = this.torso.model;
    M4.copy(m, this.base);
    M4.translate(m, m, 0, 0.5 + lift, 0.07);
    if (c.tw) M4.rotateY(m, m, c.tw);
    M4.rotateX(m, m, -lean);
    /* 머리 */
    var h = this.head.model;
    M4.translate(h, m, this.neck[0], this.neck[1], this.neck[2]);
    M4.rotateY(h, h, c.hy);
    M4.rotateX(h, h, c.hp - jk * 0.2);
    if (c.hr) M4.rotateZ(h, h, c.hr);
    /* 팔 */
    for (i = 0; i < 2; i++) {
      var sgn = i ? -1 : 1, T = i ? c.L : c.R, S = this._s, E = this._e, Wp = this._w;
      M4.point(m, sgn * this.sw, this.shY, 0.004, S);
      Wp[0] = this.cx + T[0]; Wp[1] = T[1]; Wp[2] = this.cz + T[2];
      /* 팔꿈치가 굽는 쪽: 책상 위에 놓인 손은 바깥·아래·뒤, 얼굴 앞으로 올린 손(턱 괴기·기침)은 아래·앞(책상에 팔꿈치를 세운 꼴).
         한 방향만 쓰면 손을 입가에 댈 때 어깨→손목 방향과 거의 나란해져 팔꿈치가 몸통 속으로 튄다 */
      var up = GX.smoothstep(0.92, 0.97, T[1]) * GX.smoothstep(-0.09, -0.15, T[2]);
      _up[0] = sgn * (1 - 0.7 * up); _up[1] = -0.75 + 0.15 * up; _up[2] = 0.55 - 1.3 * up;
      GX.elbow(S, Wp, this.L1, this.L2, _up, E);
      M4.aim(i ? this.uarmL.model : this.uarmR.model, S[0], S[1], S[2], E[0], E[1], E[2], 0, 0, -1, 1);
      /* 손등은 위로(책상 위에 얹은 손), 팔을 세우면 손등이 앞을 본다 */
      M4.aim(this.farm[i].model, E[0], E[1], E[2], Wp[0], Wp[1], Wp[2], 0, 0.75, -0.66, 1);
    }
  };
  Examinee.prototype.setVisible = function (v) {
    this.legs.visible = this.torso.visible = this.head.visible = this.uarmL.visible = this.uarmR.visible = this.farm[0].visible = this.farm[1].visible = v;
  };
  Examinee.prototype.dispose = function () {
    var e = this.eng, list = [this.legs, this.torso, this.head, this.uarmR, this.farm[0], this.farm[1]];
    e.remove(this.uarmL);
    for (var i = 0; i < list.length; i++) { e.remove(list[i]); e.destroyMesh(list[i].mesh); }
  };

  /* ───────── 감독관(서서 걷는 인형) ─────────
   * opt: { kind 0 정감독 / 1 부감독, skin, hair, top, pants, shoes, hairStyle, glasses, scale } */
  function Rig(eng, opt, tx) {
    opt = opt || {};
    var kind = opt.kind || 0, fem = kind === 1;
    var o = {
      skin: opt.skin || (fem ? 0xedc7ab : 0xe3b594), hair: opt.hair || (fem ? 0x2b211c : 0x1e1f22), top: opt.top || (fem ? 0xcbbda3 : 0x2b3a55),
      pants: opt.pants || (fem ? 0x2c2f36 : 0x42464e), shoes: opt.shoes || (fem ? 0xd9d2c4 : 0x17181a),
      hairStyle: opt.hairStyle === undefined ? (fem ? 2 : 4) : opt.hairStyle, glasses: opt.glasses === undefined ? !fem : !!opt.glasses
    };
    this.eng = eng; this.kind = kind;
    this.s = opt.scale || (fem ? 0.94 : 1);
    this.pos = [0, 0, 0];
    this.yaw = 0;
    this.pose = { legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: 0, armR: 0, elbowL: 0.15, elbowR: 0.15, outL: 0.06, outR: 0.06, twL: 0, twR: 0,
      headYaw: 0, headPitch: 0, lean: 0, bob: 0 };
    this.walkPhase = 0;
    this.items = [];
    this.gesture = 'none';        /* none / back(뒷짐) / cross(팔짱) / watch(손목시계 보기) */
    var self = this, sgn, i;
    var fab = tx ? tx.fabric : null;
    function add(g, extra) { var it = eng.add(eng.createMesh(g), extra || {}); self.items.push(it); return it; }
    function twin(it, extra) { var c = eng.add(it.mesh, extra || {}); self.items.push(c); return c; }
    var shW = fem ? 0.196 : 0.222; this.shW = shW;

    /* 몸통(원점 = 골반 높이) */
    var g = new Geo();
    g.ellipsoid(0, -0.02, 0, 0.158, 0.1, 0.108, o.pants, { seg: 14, rings: 7 });
    g.loft([
      { p: [0, -0.04, 0], rx: fem ? 0.172 : 0.168, rz: 0.118, sq: 2.4 },
      { p: [0, 0.1, 0], rx: fem ? 0.158 : 0.164, rz: 0.114, sq: 2.4 },
      { p: [0, 0.24, 0.002], rx: fem ? 0.148 : 0.166, rz: 0.112, sq: 2.3 },
      { p: [0, 0.37, 0.004], rx: shW - 0.03, rz: 0.118, sq: 2.4 },
      { p: [0, 0.445, 0.006], rx: shW - 0.006, rz: 0.112, sq: 2.7 },
      { p: [0, 0.488, 0.005], rx: shW - 0.014, rz: 0.1, sq: 2.6 },
      { p: [0, 0.518, 0.002], rx: shW * 0.62, rz: 0.082, sq: 2.2 },
      { p: [0, 0.535, 0], rx: 0.078, rz: 0.072 },
      { p: [0, 0.548, 0], rx: 0.056, rz: 0.056 }
    ], 16, o.top, { side: [1, 0, 0], uv: [0, 0, 4, 3], cap0: true });
    /* 셔츠 깃 · 가디건 여밈 · 단추 */
    g.loft([{ p: [0, 0.525, 0.002], rx: 0.064, rz: 0.062 }, { p: [0, 0.562, 0], rx: 0.052, rz: 0.052 }], 12, 0xf3f2ee, { side: [1, 0, 0] });
    g.box(0, 0.47, -0.094, 0.062, 0.1, 0.012, 0xf3f2ee);
    g.box(0, 0.22, -0.1135, 0.008, 0.42, 0.006, GX.mixHex(o.top, 0x000000, 0.25));
    for (i = 0; i < 4; i++) g.ellipsoid(0.016, 0.07 + i * 0.1, -0.117, 0.008, 0.008, 0.003, fem ? 0x8a7a5c : 0x1c2433, { seg: 6, rings: 3 });
    g.tube([0, 0.54, 0], [0, 0.615, -0.004], 0.05, 0.047, 10, o.skin, { caps: false });
    /* 목걸이 명찰 */
    g.push().translate(0, 0.4, -0.123).rotX(-0.06);
    g.box(-0.032, 0.085, 0, 0.007, 0.17, 0.004, 0x1f4e8c); g.box(0.032, 0.085, 0, 0.007, 0.17, 0.004, 0x1f4e8c);
    g.box(0, -0.055, -0.004, 0.082, 0.112, 0.006, 0xfafaf7);
    g.box(0, -0.014, -0.0075, 0.082, 0.03, 0.002, fem ? 0x2a7a55 : 0x1f4e8c);
    g.box(0, -0.066, -0.0075, 0.05, 0.008, 0.002, 0x3a3d44);
    g.box(0, -0.084, -0.0075, 0.036, 0.006, 0.002, 0x8a8f96);
    g.pop();
    this.torso = add(g, { tex: fab, rim: 0.3 });

    /* 머리: 얼굴은 텍스처, 머리카락·안경은 따로 */
    var gh = new Geo(), plain = [0.2, 0.62, 0.2, 0.62];
    gh.ellipsoid(0, 0.122, -0.004, 0.094, 0.118, 0.104, 0xffffff, { seg: 22, rings: 14, uv: [2.765, -0.409, -0.255, 1.311] });
    gh.loft([{ p: [0, 0.132, -0.098], rx: 0.009, rz: 0.006 }, { p: [0, 0.102, -0.113], rx: 0.012, rz: 0.011 }, { p: [0, 0.088, -0.115], rx: 0.016, rz: 0.012 },
      { p: [0, 0.08, -0.104], rx: 0.013, rz: 0.006 }], 8, 0xffffff, { side: [1, 0, 0], uv: plain, cap1: true });
    for (sgn = -1; sgn <= 1; sgn += 2) gh.ellipsoid(sgn * 0.095, 0.11, 0.008, 0.013, 0.031, 0.02, 0xffffff, { seg: 8, rings: 5, uv: plain });
    this.head = add(gh, { tex: tx ? tx['face' + kind] : null });
    var gk = new Geo();
    hairStyle(gk, o.hairStyle, o.hair, o.skin);
    if (o.glasses) {
      for (sgn = -1; sgn <= 1; sgn += 2) {
        gk.box(sgn * 0.036, 0.124, -0.107, 0.05, 0.004, 0.004, 0x23252a); gk.box(sgn * 0.036, 0.094, -0.107, 0.05, 0.003, 0.004, 0x23252a);
        gk.box(sgn * 0.061, 0.109, -0.107, 0.003, 0.032, 0.004, 0x23252a); gk.box(sgn * 0.011, 0.109, -0.107, 0.003, 0.032, 0.004, 0x23252a);
        gk.box(sgn * 0.079, 0.122, -0.052, 0.003, 0.005, 0.11, 0x23252a);
      }
      gk.box(0, 0.118, -0.107, 0.022, 0.004, 0.004, 0x23252a);
    }
    this.hair = add(gk, { rim: 0.3 });

    /* 다리 */
    var gt = new Geo();
    gt.loft([{ p: [0, -0.04, 0], rx: 0.076, rz: 0.084 }, { p: [0, -0.22, 0], rx: 0.07, rz: 0.074 }, { p: [0, -0.44, 0], rx: 0.058, rz: 0.06 }], 10, o.pants, { side: [1, 0, 0], uv: [0, 0, 3, 2] });
    this.thighL = add(gt, { tex: fab, rim: 0.2 }); this.thighR = twin(this.thighL, { tex: fab, rim: 0.2 });
    var gk2 = new Geo();
    gk2.ellipsoid(0, 0, 0, 0.058, 0.058, 0.06, o.pants, { seg: 10, rings: 6 });
    gk2.loft([{ p: [0, 0, 0], rx: 0.056, rz: 0.058 }, { p: [0, -0.2, 0.004], rx: 0.05, rz: 0.054 }, { p: [0, -0.405, 0], rx: 0.043, rz: 0.046 }], 10, o.pants, { side: [1, 0, 0], uv: [0, 0, 3, 2] });
    if (fem) {                      /* 실내화 */
      gk2.loft([{ p: [0, -0.452, 0.06], rx: 0.04, rz: 0.012 }, { p: [0, -0.452, -0.05], rx: 0.046, rz: 0.012 }, { p: [0, -0.452, -0.17], rx: 0.04, rz: 0.012 }],
        10, o.shoes, { side: [1, 0, 0], sq: 2.6, cap0: true, cap1: true });
      gk2.loft([{ p: [0, -0.43, -0.04], rx: 0.048, rz: 0.03 }, { p: [0, -0.43, -0.13], rx: 0.045, rz: 0.026 }], 10, o.shoes, { side: [1, 0, 0], sq: 2.4, cap0: true, cap1: true });
      gk2.ellipsoid(0, -0.425, 0.03, 0.036, 0.024, 0.045, 0x2a2c31, { seg: 8, rings: 5 });
    } else {                        /* 구두 */
      gk2.loft([{ p: [0, -0.425, 0.075], rx: 0.036, rz: 0.03 }, { p: [0, -0.428, 0.0], rx: 0.046, rz: 0.036 }, { p: [0, -0.44, -0.12], rx: 0.045, rz: 0.026 },
        { p: [0, -0.448, -0.185], rx: 0.034, rz: 0.016 }], 10, o.shoes, { side: [1, 0, 0], sq: 2.5, cap0: true, cap1: true });
      gk2.box(0, -0.456, 0.045, 0.07, 0.012, 0.07, 0x0e0f10);
    }
    this.shinL = add(gk2, { tex: fab, rim: 0.2 }); this.shinR = twin(this.shinL, { tex: fab, rim: 0.2 });

    /* 팔 */
    var gu = new Geo();
    gu.ellipsoid(0, 0, 0, 0.051, 0.046, 0.056, o.top, { seg: 10, rings: 6 });
    gu.loft([{ p: [0, 0, 0], rx: 0.05, rz: 0.055 }, { p: [0, -0.15, 0], rx: 0.049, rz: 0.052 }, { p: [0, -0.29, 0], rx: 0.045, rz: 0.046 }], 10, o.top, { side: [1, 0, 0], uv: [0, 0, 2, 1.5] });
    gu.ellipsoid(0, -0.29, 0, 0.046, 0.046, 0.047, o.top, { seg: 10, rings: 6 });
    this.uarmL = add(gu, { tex: fab, rim: 0.3 }); this.uarmR = twin(this.uarmL, { tex: fab, rim: 0.3 });
    this.farmL = null; this.farmR = null;
    for (i = 0; i < 2; i++) {
      var gf = new Geo(), sd = i ? 1 : -1;      /* 0 = 왼팔(x 음수 쪽) */
      gf.loft([{ p: [0, 0, 0], rx: 0.045, rz: 0.046 }, { p: [0, -0.14, 0], rx: 0.04, rz: 0.04 }, { p: [0, -0.236, 0], rx: 0.034, rz: 0.031 },
        { p: [0, -0.246, 0], rx: 0.036, rz: 0.033, c: GX.mixHex(o.top, 0x000000, 0.16) }], 10, o.top, { side: [1, 0, 0], cap1: true, uv: [0, 0, 2, 1.5] });
      gf.loft([{ p: [0, -0.238, 0], rx: 0.027, rz: 0.021 }, { p: [0, -0.262, 0], rx: 0.029, rz: 0.02 }], 8, 0xf3f2ee, { side: [1, 0, 0] });
      /* 손바닥 + 손가락 넷 + 엄지(살짝 구부림). 팔을 늘어뜨리면 손바닥이 몸 쪽을 본다 */
      gf.push().rotY(sd * Math.PI / 2);
      gf.loft([{ p: [0, -0.25, 0], rx: 0.03, rz: 0.019 }, { p: [0, -0.29, -0.002], rx: 0.04, rz: 0.016 }, { p: [0, -0.335, -0.006], rx: 0.04, rz: 0.014 }],
        10, o.skin, { side: [1, 0, 0], sq: 2.6, cap0: true, cap1: true });
      for (var f = 0; f < 4; f++) {
        var fx = (f - 1.5) * 0.019, fl = [0.07, 0.078, 0.072, 0.056][f];
        gf.loft([{ p: [fx, -0.33, -0.006], rx: 0.0095, rz: 0.009 }, { p: [fx, -0.33 - fl * 0.5, -0.016], rx: 0.009, rz: 0.0085 }, { p: [fx, -0.33 - fl, -0.036], rx: 0.0075, rz: 0.007 }],
          6, o.skin, { side: [1, 0, 0], cap1: true });
      }
      gf.loft([{ p: [sd * 0.036, -0.275, -0.006], rx: 0.012, rz: 0.011 }, { p: [sd * 0.052, -0.31, -0.016], rx: 0.011, rz: 0.01 }, { p: [sd * 0.054, -0.345, -0.026], rx: 0.0085, rz: 0.008 }],
        6, o.skin, { side: [1, 0, 0], cap1: true });
      gf.pop();
      var it = add(gf, { tex: fab, rim: 0.25 });
      if (i) this.farmR = it; else this.farmL = it;
    }

    /* 소품: 서류판 · 수거 바구니 · 시험지 뭉치 */
    var gc = new Geo();
    gc.slab(0, 0, 0, 0.235, 0.008, 0.32, 0x6a4c30, { r: 0.012, seg: 2 });
    gc.box(0, 0.006, 0.005, 0.21, 0.003, 0.29, 0xfbfaf5);
    for (i = 0; i < 9; i++) gc.box(-0.01, 0.0078, -0.09 + i * 0.024, 0.15, 0.0004, 0.004, 0xaab0b6);
    gc.box(0, 0.012, -0.135, 0.09, 0.012, 0.03, 0x9aa0a6);
    this.clip = add(gc, { cast: false });
    var gb = new Geo(), bc = 0x2f6fb5;
    gb.gloss = 0.4;
    gb.box(0, -0.06, 0, 0.36, 0.012, 0.26, bc);
    gb.box(-0.18, 0, 0, 0.012, 0.13, 0.27, bc); gb.box(0.18, 0, 0, 0.012, 0.13, 0.27, bc);
    gb.box(0, 0, -0.13, 0.36, 0.13, 0.012, bc); gb.box(0, 0, 0.13, 0.36, 0.13, 0.012, bc);
    gb.box(-0.07, -0.045, 0.02, 0.075, 0.012, 0.15, 0x16171a); gb.box(0.05, -0.04, -0.03, 0.075, 0.012, 0.15, 0x2a2c31);
    gb.box(0.02, -0.03, 0.06, 0.075, 0.012, 0.15, 0x3b3f46);
    gb.box(-0.1, 0.11, 0, 0.012, 0.1, 0.012, 0x1f4f86); gb.box(0.1, 0.11, 0, 0.012, 0.1, 0.012, 0x1f4f86);
    gb.box(0, 0.16, 0, 0.212, 0.012, 0.014, 0x1f4f86);
    this.basket = add(gb, { visible: false });
    var gp = new Geo();
    gp.box(0, 0, 0, 0.26, 0.05, 0.36, 0xf7f6f0, { shade: [0.82, 1] });
    for (i = 0; i < 7; i++) gp.box(0, -0.02 + i * 0.006, 0, 0.262, 0.0006, 0.362, 0xcfcdc4);
    this.stack = add(gp, { visible: false, cast: false });
    /* 오른손에 드는 것: 전자기기 탐지기(막대 모양) · 수험생에게서 받아 든 안경.
       둘 다 아래팔 기준 좌표로 빚는다(-Y 가 손끝 쪽) */
    var gwd = new Geo();
    gwd.gloss = 0.35;
    gwd.tube([0, -0.262, -0.022], [0, -0.39, -0.03], 0.0165, 0.015, 8, 0x1b1c1f);
    gwd.box(0, -0.52, -0.036, 0.064, 0.27, 0.02, 0x232427);
    gwd.box(0, -0.52, -0.0472, 0.05, 0.2, 0.003, 0x111214);
    gwd.box(0, -0.405, -0.0472, 0.052, 0.014, 0.003, 0xe6c228);
    gwd.box(0, -0.638, -0.0472, 0.052, 0.014, 0.003, 0xe6c228);
    gwd.ellipsoid(0, -0.378, -0.045, 0.006, 0.006, 0.004, 0xd23b2e, { seg: 6, rings: 4 });
    this.wand = add(gwd, { visible: false });
    var gsp = new Geo(), fc = 0x101114;
    gsp.gloss = 0.5;
    for (sgn = -1; sgn <= 1; sgn += 2) {
      gsp.box(sgn * 0.035, 0.017, 0, 0.058, 0.006, 0.007, fc); gsp.box(sgn * 0.035, -0.017, 0, 0.058, 0.005, 0.007, fc);
      gsp.box(sgn * 0.064, 0, 0, 0.006, 0.04, 0.007, fc); gsp.box(sgn * 0.007, 0, 0, 0.005, 0.04, 0.007, fc);
      gsp.box(sgn * 0.066, 0.012, 0.068, 0.008, 0.013, 0.14, fc);      /* 두툼한 안경다리(배터리와 진동 모터가 들어 있다) */
    }
    gsp.box(0, 0.013, 0, 0.02, 0.006, 0.007, fc);
    gsp.gloss = 1;
    for (sgn = -1; sgn <= 1; sgn += 2) gsp.box(sgn * 0.035, 0, 0.0005, 0.052, 0.03, 0.002, 0xa9bfcc);
    this.specs = add(gsp, { visible: false, cast: false });
    this.hold = 'clip';
    this.tool = null;             /* null / wand / specs */
    this.toolPose = null;         /* 도구를 든 오른팔의 목표 자세 [arm, elbow, out, twist]. 없으면 늘어뜨린다 */
    this.headWorld = [0, 1.6, 0];
    this.update();
  }

  var _root = M4.create(), _hip = M4.create();
  Rig.prototype.update = function () {
    var p = this.pose, sgn, m, s = this.s;
    M4.fromPose(_root, this.pos[0], this.pos[1] + p.bob, this.pos[2], this.yaw, 0, 0);
    if (s !== 1) M4.scale(_root, _root, s, s, s);
    M4.translate(_hip, _root, 0, 0.92, 0);
    if (p.lean) M4.rotateX(_hip, _hip, p.lean);
    M4.copy(this.torso.model, _hip);
    m = this.head.model;
    M4.translate(m, _hip, 0, 0.582, 0);
    M4.rotateY(m, m, p.headYaw);
    M4.rotateX(m, m, p.headPitch);
    M4.copy(this.hair.model, m);
    M4.point(m, 0, 0.11, 0, this.headWorld);
    for (sgn = -1; sgn <= 1; sgn += 2) {
      var L = sgn < 0;
      var th = L ? this.thighL : this.thighR, sh = L ? this.shinL : this.shinR;
      var ua = L ? this.uarmL : this.uarmR, fa = L ? this.farmL : this.farmR;
      M4.translate(th.model, _root, sgn * 0.095, 0.92, 0);
      M4.rotateX(th.model, th.model, L ? p.legL : p.legR);
      M4.translate(sh.model, th.model, 0, -0.44, 0);
      M4.rotateX(sh.model, sh.model, -(L ? p.kneeL : p.kneeR));
      M4.translate(ua.model, _hip, sgn * (this.shW - 0.012), 0.462, 0);
      M4.rotateZ(ua.model, ua.model, sgn * (L ? p.outL : p.outR));
      M4.rotateX(ua.model, ua.model, L ? p.armL : p.armR);
      M4.translate(fa.model, ua.model, 0, -0.29, 0);
      var tw = L ? p.twL : p.twR;
      if (tw) M4.rotateY(fa.model, fa.model, tw);
      M4.rotateX(fa.model, fa.model, L ? p.elbowL : p.elbowR);
    }
    /* 손에 든 것 */
    this.clip.visible = this.hold === 'clip' && this.torso.visible;
    this.basket.visible = this.hold === 'basket' && this.torso.visible;
    this.stack.visible = this.hold === 'stack' && this.torso.visible;
    if (this.hold === 'clip') {
      m = this.clip.model;
      M4.translate(m, this.farmL.model, 0.05, -0.2, -0.045);
      M4.rotateX(m, m, 1.35); M4.rotateZ(m, m, 0.25);
    } else if (this.hold === 'basket') {
      /* 손잡이를 쥐고 옆으로 늘어뜨려 든다 */
      m = this.basket.model;
      M4.translate(m, this.farmL.model, 0, -0.455, 0);
      M4.rotateX(m, m, -p.elbowL - p.armL);
      M4.rotateZ(m, m, p.outL);
      M4.rotateY(m, m, Math.PI / 2);
    } else if (this.hold === 'stack') {
      m = this.stack.model;
      M4.translate(m, this.farmL.model, 0.08, -0.17, -0.07);
      M4.rotateX(m, m, -p.elbowL - p.armL);
    }
    this.wand.visible = this.tool === 'wand' && this.torso.visible;
    this.specs.visible = this.tool === 'specs' && this.torso.visible;
    if (this.wand.visible) M4.copy(this.wand.model, this.farmR.model);
    if (this.specs.visible) {
      /* 손끝에 쥔 안경: 렌즈가 감독관 얼굴 쪽을 보게 든다 */
      m = this.specs.model;
      M4.translate(m, this.farmR.model, 0, -0.355, -0.03);
      M4.rotateX(m, m, 1.25);
      M4.rotateY(m, m, Math.PI);
    }
  };

  /* 팔 자세의 목표값: [arm, elbow, out, twist] (왼팔 기준, 비틀기는 좌우 부호가 반대) */
  var ARM = { hang: [0, 0.12, 0.06, 0], back: [-0.58, 1.18, 0.1, 1.45], cross: [0.42, 1.78, 0.04, 1.3], watch: [0.5, 1.85, 0.05, 0.95], clip: [0.12, 1.3, 0.06, 0], stack: [0.12, 1.45, 0.06, 0], basket: [0.04, 0.08, 0.2, 0] };
  Rig.prototype._arms = function (dt, swing) {
    var p = this.pose, g = this.gesture, hold = this.hold;
    var L = hold === 'clip' || hold === 'stack' || hold === 'basket' ? ARM[hold] : (g === 'back' || g === 'cross' ? ARM[g] : (g === 'watch' ? ARM.watch : ARM.hang));
    var R = g === 'back' || g === 'cross' ? ARM[g] : ARM.hang;
    var kL = L === ARM.hang ? swing : (hold === 'basket' ? swing * 0.2 : 0), kR = R === ARM.hang ? -swing : 0, rate = 7;
    p.armL = GX.damp(p.armL, L[0] - 0.32 * kL, rate, dt); p.elbowL = GX.damp(p.elbowL, L[1] + 0.2 * Math.max(0, -kL), rate, dt);
    p.outL = GX.damp(p.outL, L[2], rate, dt); p.twL = GX.damp(p.twL, -L[3], rate, dt);
    var tp = this.toolPose;
    if (tp) {
      /* 도구(탐지기·안경)를 든 오른팔은 대본이 정한 자세를 따라간다 */
      p.armR = GX.damp(p.armR, tp[0], 9, dt); p.elbowR = GX.damp(p.elbowR, tp[1], 9, dt);
      p.outR = GX.damp(p.outR, tp[2], 9, dt); p.twR = GX.damp(p.twR, tp[3] || 0, 9, dt);
    } else if (!this.armOverride) {
      p.armR = GX.damp(p.armR, R[0] - 0.32 * kR, rate, dt); p.elbowR = GX.damp(p.elbowR, R[1] + 0.22 * Math.max(0, -kR), rate, dt);
      p.outR = GX.damp(p.outR, R[2], rate, dt); p.twR = GX.damp(p.twR, R[3], rate, dt);
    }
  };

  /* 걷는 자세: speed(m/s) 만큼 걸음 위상을 진행. 발이 땅에 닿는 순간이면 true */
  Rig.prototype.walk = function (dt, speed) {
    var p = this.pose, prev = this.walkPhase;
    this.walkPhase += dt * speed * (Math.PI * 2 / (1.36 * this.s));
    var ph = this.walkPhase, amp = Math.min(1, speed / 1.2);
    var s = Math.sin(ph), c = Math.cos(ph);
    p.legL = GX.damp(p.legL, 0.46 * s * amp, 18, dt); p.legR = GX.damp(p.legR, -0.46 * s * amp, 18, dt);
    p.kneeL = GX.damp(p.kneeL, (0.08 + 0.8 * Math.max(0, c)) * amp, 18, dt);
    p.kneeR = GX.damp(p.kneeR, (0.08 + 0.8 * Math.max(0, -c)) * amp, 18, dt);
    p.bob = -0.018 * Math.abs(s) * amp;
    this._arms(dt, s * amp);
    var a = Math.floor(prev / Math.PI + 0.5), b = Math.floor(ph / Math.PI + 0.5);
    return a !== b;
  };
  /* 서 있는 자세로 부드럽게 돌아감 */
  Rig.prototype.stand = function (dt) {
    var p = this.pose;
    p.legL = GX.damp(p.legL, 0, 10, dt); p.legR = GX.damp(p.legR, 0, 10, dt);
    p.kneeL = GX.damp(p.kneeL, 0, 10, dt); p.kneeR = GX.damp(p.kneeR, 0, 10, dt);
    p.bob = GX.damp(p.bob, 0, 10, dt);
    this._arms(dt, 0);
  };
  /* 머리를 월드 좌표의 한 점으로 돌림(몸통 기준 각도 제한) */
  Rig.prototype.lookAt = function (x, y, z, dt, rate) {
    var hx = this.pos[0], hy = this.pos[1] + 1.63 * this.s, hz = this.pos[2];
    var dx = x - hx, dy = y - hy, dz = z - hz;
    var want = Math.atan2(-dx, -dz);
    var rel = GX.clamp(GX.wrapAngle(want - this.yaw), -1.25, 1.25);
    var pitch = GX.clamp(Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)), -0.9, 0.5);
    this.pose.headYaw = GX.damp(this.pose.headYaw, rel, rate || 6, dt);
    this.pose.headPitch = GX.damp(this.pose.headPitch, pitch, rate || 6, dt);
  };
  Rig.prototype.lookRel = function (yaw, pitch, dt, rate) {
    this.pose.headYaw = GX.damp(this.pose.headYaw, yaw, rate || 5, dt);
    this.pose.headPitch = GX.damp(this.pose.headPitch, pitch, rate || 5, dt);
  };
  /* 머리가 실제로 향하는 방향(단위 벡터, 수평 성분만) */
  Rig.prototype.gazeDir = function () {
    var a = this.yaw + this.pose.headYaw;
    return [-Math.sin(a), -Math.cos(a)];
  };
  Rig.prototype.setVisible = function (v) {
    for (var i = 0; i < this.items.length; i++) this.items[i].visible = v;
    if (v) this.update();
  };

  GX.Examinee = Examinee;
  GX.Rig = Rig;
})(window.GX = window.GX || {});
