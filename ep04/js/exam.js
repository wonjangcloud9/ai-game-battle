/* 내 책상 — 문제지(넘어가는 책장)·답안지(OMR)·AI 렌즈 표시, 1인칭으로 보이는 두 손과 팔·컴퓨터용 사인펜, 그리고 채점 */
(function (GX) {
  'use strict';
  var M4 = GX.M4, Geo = GX.Geo, T = GX.Text, FONT = GX.FONT, W = GX.W;
  var PW = 1448, PH = 2048, OW = 720, OH = 1058, OS = 1.5, AW = 724, AH = 1024;
  var CIRC = ['①', '②', '③', '④', '⑤'];
  var BOOK = { x0: -0.305, w: 0.25, zc: -0.013, h: 0.354, yaw: -0.018 };   /* 책상 중심 기준 문제지(조금 비뚤게 놓임) */
  var OMR = { x0: -0.03, w: 0.16, z0: -0.10, h: 0.235, yaw: 0.03 };        /* 책상 중심 기준 답안지 */
  var ROW_Y = 300, ROW_H = 70, COL_X = 268, COL_W = 92;                    /* 답안지(720x1058 기준) 위 마킹 칸 위치 */
  var NS = 14;                                                             /* 넘어가는 책장의 가로 분할 수 */
  var FLIP_TIME = 0.42, MARK_TIME = 0.6;
  var SKIN = 0xdfb08d, NAIL = 0xf0cfc2, SLEEVE = 0x565c66, CUFF = 0x464b54, PANTS = 0x2b3140;
  var KNUCKLE = GX.mixHex(0xdfb08d, 0xc1876a, 0.5), TIP = GX.mixHex(0xdfb08d, 0xe59f8c, 0.45);
  var L1 = 0.28, L2 = 0.262;                                               /* 위팔·아래팔 길이 */

  function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vmul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vnorm(a) { var l = Math.sqrt(vdot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function vlerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  function shuffle(arr, r) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1)), t = arr[i];
      arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* AI 안경이 한 문항에 내놓는 답. kind:
   *   ok     맞는 답, 높은 신뢰도
   *   unsure 맞는 답인데 신뢰도가 낮게 나온다
   *   guess  틀린 답, 낮은 신뢰도(스스로도 자신 없어 함)
   *   sure   틀린 답을 높은 신뢰도와 그럴듯한 근거로 내민다 ← 자신 있게 틀림
   * 틀릴 때 문제에 misread 가 있으면 '않는/잘못'을 놓치고 읽은 것이라, 렌즈에 뜨는 '읽은 문장'(readAs)도 그렇게 나온다 */
  GX.aiAnswer = function (q, kind, r) {
    var wrong = kind === 'guess' || kind === 'sure', mis = wrong && !!q.misread;
    var conf = kind === 'sure' ? 90 + Math.floor(r() * 8) : (kind === 'ok' ? 86 + Math.floor(r() * 13) : (kind === 'guess' ? 52 + Math.floor(r() * 17) : 56 + Math.floor(r() * 17)));
    return {
      kind: kind, wrong: wrong, pick: wrong ? q.trap : q.answer, conf: conf,
      why: (wrong ? q.lie : q.why) + (kind === 'guess' || kind === 'unsure' ? ' (확신 낮음)' : ''),
      readAs: mis ? q.misread : q.text, misread: mis
    };
  };

  /* 과목별 5문항씩 뽑고 보기를 섞는다. AI 안경의 답도 여기서 정한다: 열 문항 가운데 둘은 자신 있게 틀리고(sure),
   * 하나는 자신 없이 틀리고(guess), 하나는 맞는데 자신 없어 한다(unsure). 그러니 신뢰도 숫자만 믿을 수는 없다 */
  GX.pickQuestions = function (r) {
    var out = [];
    ['tax', 'acc'].forEach(function (subj) {
      var pool = GX.QUESTIONS.filter(function (q) { return q.subj === subj; });
      shuffle(pool, r);
      pool.slice(0, 5).forEach(function (q) {
        var order = [0, 1, 2, 3, 4];
        if (!q.fixed) shuffle(order, r);
        out.push({
          id: q.id, subj: subj, text: q.q,
          choices: order.map(function (k) { return q.c[k]; }),
          answer: order.indexOf(q.a), trap: order.indexOf(q.trap), ex: q.ex,
          why: q.why, lie: q.lie, misread: q.misread || null
        });
      });
    });
    var idx = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], r);
    out.forEach(function (q, i) {
      var kind = i === idx[0] || i === idx[1] ? 'sure' : (i === idx[2] ? 'guess' : (i === idx[3] ? 'unsure' : 'ok'));
      q.ai = GX.aiAnswer(q, kind, r);
    });
    return out;
  };

  /* ───────── 손 모델 ───────── */
  /* 손가락 한 개: 마디 점들을 잇고 끝을 둥글린 뒤 손톱을 얹는다. dorsal 은 손등 쪽 방향 */
  function finger(g, pts, rad, side, dorsal) {
    var n = pts.length, e = pts[n - 1], dir = vnorm(vsub(e, pts[n - 2])), rings = [], i;
    for (i = 0; i < n; i++) {
      /* 마디는 조금 굵고 붉게, 마디 사이는 가늘고 밝게, 손끝은 분홍빛 */
      rings.push({ p: pts[i], rx: rad[i], rz: rad[i] * 0.92, c: i === n - 1 ? TIP : (i === 0 ? SKIN : KNUCKLE) });
      if (i < n - 1) rings.push({ p: vlerp(pts[i], pts[i + 1], 0.5), rx: (rad[i] + rad[i + 1]) * 0.47, rz: (rad[i] + rad[i + 1]) * 0.435, c: SKIN });
    }
    /* 손끝을 둥글게 마무리 */
    var rt = rad[n - 1];
    rings.push({ p: vadd(e, vmul(dir, rt * 0.5)), rx: rt * 0.85, rz: rt * 0.78, c: TIP });
    rings.push({ p: vadd(e, vmul(dir, rt * 0.86)), rx: rt * 0.55, rz: rt * 0.5, c: TIP });
    rings.push({ p: vadd(e, vmul(dir, rt * 1.02)), rx: rt * 0.16, rz: rt * 0.15, c: TIP });
    g.loft(rings, 10, SKIN, { side: side, cap0: true, cap1: true });
    var r = rad[n - 1], keep = g.gloss;
    g.push();
    g.m = M4.aim(M4.create(), e[0], e[1], e[2], e[0] + dir[0], e[1] + dir[1], e[2] + dir[2], dorsal[0], dorsal[1], dorsal[2], 1);
    g.gloss = 0.45;
    g.ellipsoid(0, r * 0.1, r * 0.72, r * 0.62, r * 0.78, r * 0.2, NAIL, { seg: 8, rings: 5 });
    g.pop();
    g.gloss = keep;
  }

  /* 펜을 쥔 오른손. 원점 = 펜촉, 축은 세상과 같다(x 오른쪽, y 위, z 내 몸 쪽).
   * a 는 펜이 누운 방향, n 은 펜 위쪽, s 는 엄지 쪽(왼쪽). 돌려주는 값: { geo, a, wrist } */
  function buildPenHand() {
    var g = new Geo();
    g.gloss = 0.1;
    var a = vnorm([0.25, 0.72, 0.64]);
    var n = vnorm(vsub([0, 1, 0], vmul(a, a[1])));
    var s = vcross(a, n);
    function P(al, be, ga) { return [a[0] * al + n[0] * be + s[0] * ga, a[1] * al + n[1] * be + s[1] * ga, a[2] * al + n[2] * be + s[2] * ga]; }
    /* 마디 길이는 실제 손 치수(첫 마디 4cm 안팎, 가운데 2.5cm, 끝 2cm)에 맞춘다 */
    var I = [P(0.095, -0.006, -0.028), P(0.068, 0.022, -0.012), P(0.045, 0.016, -0.004), P(0.024, 0.0125, -0.001)];
    var Mi = [P(0.092, -0.018, -0.045), P(0.060, 0.004, -0.030), P(0.038, -0.004, -0.0185), P(0.020, -0.0095, -0.0075)];
    var R = [P(0.086, -0.031, -0.060), P(0.056, -0.012, -0.048), P(0.038, -0.019, -0.036), P(0.026, -0.019, -0.022)];
    var Pk = [P(0.076, -0.043, -0.072), P(0.050, -0.029, -0.062), P(0.038, -0.031, -0.050), P(0.030, -0.023, -0.038)];
    var Th = [P(0.118, -0.022, 0.012), P(0.088, -0.006, 0.028), P(0.060, 0.003, 0.0235), P(0.036, 0.002, 0.0125)];
    var kn = vnorm(vsub(Pk[0], I[0]));                         /* 손등 너비 방향(검지 → 새끼) */
    var up = vnorm(vadd(n, [0, 0.6, 0]));
    finger(g, I, [0.0098, 0.0088, 0.0078, 0.0068], kn, n);
    finger(g, Mi, [0.0098, 0.0088, 0.0078, 0.0068], kn, up);
    finger(g, R, [0.0092, 0.0083, 0.0073, 0.0064], kn, up);
    finger(g, Pk, [0.0085, 0.0075, 0.0066, 0.0058], kn, up);
    finger(g, Th, [0.0125, 0.0105, 0.0092, 0.008], n, s);
    var mid = vlerp(I[0], Pk[0], 0.5), wrist = [0.110, 0.034, 0.133];
    var back = vnorm(vsub(wrist, mid));
    /* 손등·손바닥 */
    g.loft([
      { p: vadd(wrist, vmul(back, 0.03)), rx: 0.027, rz: 0.019 },
      { p: wrist, rx: 0.029, rz: 0.0195 },
      { p: vlerp(wrist, mid, 0.4), rx: 0.037, rz: 0.019 },
      { p: vlerp(wrist, mid, 0.8), rx: 0.0405, rz: 0.0165 },
      { p: vadd(mid, vmul(back, -0.006)), rx: 0.039, rz: 0.0125 }
    ], 12, SKIN, { side: kn, sq: 2.5, cap0: true, cap1: true });
    [I[0], Mi[0], R[0], Pk[0]].forEach(function (p, i) { var r = [0.0108, 0.0108, 0.01, 0.0092][i]; g.ellipsoid(p[0], p[1], p[2], r, r, r, SKIN, { seg: 8, rings: 5 }); });
    /* 엄지 두덩: 엄지 뿌리에서 손목까지 이어지는 도톰한 살 */
    g.loft([{ p: Th[1], rx: 0.0115, rz: 0.011 }, { p: Th[0], rx: 0.0145, rz: 0.013 }, { p: vlerp(Th[0], wrist, 0.55), rx: 0.017, rz: 0.014 }, { p: vlerp(Th[0], wrist, 0.92), rx: 0.014, rz: 0.012 }],
      10, SKIN, { side: n, cap0: true, cap1: true });
    var web = vlerp(Th[1], I[0], 0.5);
    g.ellipsoid(web[0], web[1] - 0.006, web[2], 0.012, 0.009, 0.014, SKIN, { seg: 8, rings: 5 });   /* 엄지와 검지 사이 */
    return { geo: g, a: a, wrist: wrist };
  }

  /* 편 손(왼손 기준: 손바닥이 아래, 손가락은 -z, 엄지는 +x). 원점 = 손목, y=0 이 닿는 면 */
  function buildOpenHand() {
    var g = new Geo(), up = [0, 1, 0], sd = [1, 0, 0], i;
    g.gloss = 0.1;
    g.loft([{ p: [0, 0.019, 0.032], rx: 0.027, rz: 0.018 }, { p: [0, 0.018, 0], rx: 0.029, rz: 0.018 }, { p: [0.002, 0.0165, -0.036], rx: 0.04, rz: 0.0165 },
      { p: [0.001, 0.0145, -0.076], rx: 0.043, rz: 0.0145 }, { p: [0, 0.0125, -0.1], rx: 0.041, rz: 0.012 }], 12, SKIN, { side: sd, sq: 2.6, cap0: true, cap1: true });
    var bx = [0.03, 0.0105, -0.0095, -0.0285], len = [0.072, 0.08, 0.074, 0.058], spr = [-0.07, -0.01, 0.05, 0.14], rd = [0.0095, 0.0096, 0.009, 0.0082];
    for (i = 0; i < 4; i++) {
      var dx = -Math.sin(spr[i]), dz = -Math.cos(spr[i]), L = len[i], r = rd[i], z0 = -0.098 + Math.abs(i - 1.2) * 0.004;
      /* 손가락 뿌리는 손바닥 속에서 시작해 이음매가 드러나지 않게 한다 */
      finger(g, [[bx[i] - dx * 0.014, 0.0128, z0 - dz * 0.014], [bx[i] + dx * L * 0.42, 0.0135, z0 + dz * L * 0.42], [bx[i] + dx * L * 0.74, 0.0112, z0 + dz * L * 0.74], [bx[i] + dx * L, 0.0078, z0 + dz * L]],
        [r * 0.98, r * 0.93, r * 0.83, r * 0.72], sd, up);
    }
    finger(g, [[0.02, 0.014, -0.02], [0.05, 0.0135, -0.056], [0.063, 0.0115, -0.084], [0.068, 0.009, -0.106]], [0.0118, 0.0106, 0.0092, 0.0078], [0.6, 0, 0.8], up);
    g.loft([{ p: [0.012, 0.015, -0.012], rx: 0.013, rz: 0.012 }, { p: [0.03, 0.0148, -0.036], rx: 0.0165, rz: 0.0128 }, { p: [0.044, 0.014, -0.052], rx: 0.012, rz: 0.011 }],
      10, SKIN, { side: [0.8, 0, 0.6], cap0: true, cap1: true });
    return g;
  }

  /* 컴퓨터용 사인펜. 원점 = 펜촉, +Y 가 펜 뒤쪽. 몸통 글씨는 종이 텍스처(papers)의 한 칸 */
  function buildPen(g) {
    var U = GX.PAPER_UV, wh = [(U.white[0] + U.white[2]) / 2, (U.white[1] + U.white[3]) / 2], w4 = [wh[0], wh[1], wh[0], wh[1]], L = U.penLabel;
    g.gloss = 0.3;
    g.tube([0, 0, 0], [0, 0.004, 0], 0.0006, 0.0017, 6, 0x0c0c0d, { uv: w4 });
    g.gloss = 0.55;
    g.tube([0, 0.004, 0], [0, 0.017, 0], 0.0017, 0.0043, 10, 0x2b2c30, { uv: w4, caps: false });
    g.tube([0, 0.017, 0], [0, 0.041, 0], 0.0045, 0.0047, 10, 0x141416, { uv: w4, caps: false });
    g.gloss = 0.8;
    g.tube([0, 0.041, 0], [0, 0.0445, 0], 0.005, 0.005, 10, 0xc9a43a, { uv: w4, caps: false });
    g.gloss = 0.55;
    g.tube([0, 0.0445, 0], [0, 0.113, 0], 0.0047, 0.005, 12, 0xffffff, { uv: [L[2], L[3], L[0], L[1]], caps: false });
    g.tube([0, 0.11, 0], [0, 0.149, 0], 0.0058, 0.0056, 10, 0x18191b, { uv: w4 });
    g.box(0.0062, 0.128, 0, 0.0016, 0.034, 0.0034, 0x18191b, { uv: 0 });
    g.tube([0, 0.149, 0], [0, 0.152, 0], 0.004, 0.0036, 8, 0x0f0f10, { uv: w4 });
    return g;
  }

  function Exam(eng, world, seat, r) {
    var tx = world.tx, U = GX.PAPER_UV, i;
    this.eng = eng; this.world = world; this.seat = seat;
    this.qs = GX.pickQuestions(r);
    this.answers = []; this.scanned = []; this.followed = [];
    for (i = 0; i < 10; i++) { this.answers.push(-1); this.scanned.push(false); this.followed.push(false); }
    this.cur = 0;
    this.state = 'none';          /* none → cover → open → closed */
    this.glasses = true;          /* AI 안경을 쓰고 있는가 */
    this.arAlpha = 0;
    this.arStage = 'idle'; this.arStep = 0; this.arQ = -1;     /* 렌즈가 지금 하는 일(그림을 다시 그릴 때만 바뀐다) */
    this.scanT = -1;              /* 0..1 스캔 진행, -1 이면 스캔 중 아님 */
    this.aspect = 16 / 9;         /* 화면 비율(안경다리를 만지는 손을 시야 가장자리에 두는 데 쓴다) */
    this.touch = { k: 0, phase: null, hold: 0, hit: false, fast: false };
    this.tremor = 0;              /* 긴장해서 떨리는 손 0..1 */
    this.flip = 0;                /* 책장 넘기는 애니메이션 0..1 */
    this.flipTo = null; this.flipDir = 1;
    this.layout = null;
    this.dx = seat.x; this.dz = seat.z; this.y = W.DESK_Y;
    this.on = false;              /* 자리에 앉았는가(손·팔을 그린다) */
    this.t = 0;

    /* 문제지: 맨 위 장(top) + 넘어가는 장이 쓸 캔버스 두 장을 번갈아 쓴다 */
    this.pageCv = [GX.newCanvas(PW, PH), GX.newCanvas(PW, PH)];
    this.top = 0; this.shown = -1; this.leafIdx = -1;
    this.omrCv = GX.newCanvas(OW * OS, OH * OS);
    this.arCv = GX.newCanvas(AW, AH);
    this.drawPage(0, 0); this.drawPage(1, 0); this.drawOMR(); this.drawAR();
    this.pageTex = [eng.createTexture(this.pageCv[0], {}), eng.createTexture(this.pageCv[1], {})];
    this.omrTex = eng.createTexture(this.omrCv, {});
    this.arTex = eng.createTexture(this.arCv, {});

    var g = new Geo();
    g.quad([0, 0, -BOOK.h / 2], [BOOK.w, 0, -BOOK.h / 2], [BOOK.w, 0, BOOK.h / 2], [0, 0, BOOK.h / 2], 0xffffff, [0, 0, 1, 1], [0, 1, 0]);
    var pageMesh = eng.createMesh(g);
    this.book = eng.add(pageMesh, { tex: this.pageTex[0], cast: false, visible: false, lod: -0.6 });
    this.ar = eng.add(pageMesh, { tex: this.arTex, cast: false, visible: false, blend: 1, unlit: 1, tint: [1.5, 1.5, 1.5, 0], order: 8 });
    /* 넘어가는 장(앞면·뒷면) */
    this.leafF = eng.add(leafMesh(eng, [0, 0, 1, 1]), { tex: this.pageTex[1], cast: false, visible: false, lod: -0.6 });
    this.leafB = eng.add(leafMesh(eng, [U.back[2], U.back[1], U.back[0], U.back[3]]), { tex: tx.papers, cast: false, visible: false });
    /* 문제지 밑에 깔린 나머지 장(두께) */
    var gs = new Geo();
    gs.box(BOOK.w / 2 + 0.0008, -0.0016, 0.0006, BOOK.w, 0.0022, BOOK.h, 0xe6e4dc, { shade: [0.8, 1] });
    gs.push().translate(BOOK.w / 2, -0.0004, 0).rotY(0.012);
    gs.box(0.0016, 0, 0.001, BOOK.w, 0.0003, BOOK.h, 0xf4f3ec);
    gs.pop();
    gs.box(0.004, -0.0003, -BOOK.h * 0.3, 0.004, 0.0005, 0.011, 0x8a8f96);        /* 스테이플 */
    gs.box(0.004, -0.0003, BOOK.h * 0.3, 0.004, 0.0005, 0.011, 0x8a8f96);
    this.stack = eng.add(eng.createMesh(gs), { cast: false, visible: false });
    var go = new Geo();
    go.quad([-OMR.w / 2, 0, -OMR.h / 2], [OMR.w / 2, 0, -OMR.h / 2], [OMR.w / 2, 0, OMR.h / 2], [-OMR.w / 2, 0, OMR.h / 2], 0xffffff, [0, 0, 1, 1], [0, 1, 0]);
    this.omr = eng.add(eng.createMesh(go), { tex: this.omrTex, cast: false, visible: false, lod: -0.5 });
    this.omrC = [this.dx + OMR.x0 + OMR.w / 2, this.dz + OMR.z0 + OMR.h / 2];
    M4.fromPose(this.omr.model, this.omrC[0], this.y + 0.0018, this.omrC[1], OMR.yaw, 0, 0);
    /* 스캔 줄 */
    var gl2 = new Geo();
    gl2.quad([0, 0, -0.012], [BOOK.w, 0, -0.012], [BOOK.w, 0, 0.012], [0, 0, 0.012], 0xffffff, [0, 0, 1, 1], [0, 1, 0]);
    this.scanLine = eng.add(eng.createMesh(gl2), { tex: tx.shaft, cast: false, visible: false, blend: 1, unlit: 1, tint: [0.25, 1.25, 1.5, 0.6], order: 9 });

    /* 신분증 · 수험표 · 휴대폰 · 손목시계 */
    var gi = new Geo();
    gi.quad([-0.043, 0, -0.027], [0.043, 0, -0.027], [0.043, 0, 0.027], [-0.043, 0, 0.027], 0xffffff, U.card, [0, 1, 0]);
    /* 뒷면(무늬 없는 면). 들어 보일 때 내 쪽에서는 이 면이 보인다 */
    gi.quad([-0.043, -0.0008, 0.027], [0.043, -0.0008, 0.027], [0.043, -0.0008, -0.027], [-0.043, -0.0008, -0.027], 0xd9e4ee,
      [U.white[0], U.white[1], U.white[2], U.white[3]], [0, -1, 0]);
    this.idCard = eng.add(eng.createMesh(gi), { tex: tx.papers, cast: false, visible: false });
    this.idHome = [this.dx + 0.213, this.y + 0.0018, this.dz - 0.094];
    this.idPos = this.idHome.slice(); this.idTilt = 0; this.idYaw = 0;
    this.holdId = false; this.holdPhone = false;
    var gt = new Geo();
    GX.dquad(gt, this.dx + 0.19, this.dx + 0.3, this.dz - 0.052, this.dz + 0.036, this.y + 0.0014, 0xffffff, U.ticket);
    /* 손목시계(문자판) */
    var wx = this.dx + 0.045, wz = this.dz - 0.166, wy = this.y;
    GX.dquad(gt, wx - 0.0165, wx + 0.0165, wz - 0.0165, wz + 0.0165, wy + 0.0096, 0xffffff, U.watch);
    this.ticket = eng.add(eng.createMesh(gt), { tex: tx.papers, cast: false, visible: false });
    var gw = new Geo();
    gw.gloss = 0.7;
    gw.lathe(wx, wy, wz, [[0.0185, 0], [0.0195, 0.003], [0.0195, 0.008], [0.0178, 0.0098], [0.0166, 0.0094]], 20, 0xb9bdc2, { cap0: true });
    gw.box(wx + 0.021, wy + 0.005, wz, 0.003, 0.003, 0.004, 0xb9bdc2);
    gw.gloss = 0.15;
    gw.loft([{ p: [wx - 0.017, wy + 0.004, wz], rx: 0.009, rz: 0.0022 }, { p: [wx - 0.04, wy + 0.0022, wz + 0.002], rx: 0.009, rz: 0.002 }, { p: [wx - 0.075, wy + 0.002, wz + 0.008], rx: 0.008, rz: 0.0018 }],
      8, 0x4a3324, { side: [0, 0, 1], sq: 3, cap1: true });
    gw.loft([{ p: [wx + 0.017, wy + 0.004, wz], rx: 0.009, rz: 0.0022 }, { p: [wx + 0.04, wy + 0.0022, wz - 0.003], rx: 0.009, rz: 0.002 }, { p: [wx + 0.068, wy + 0.002, wz - 0.01], rx: 0.008, rz: 0.0018 }],
      8, 0x4a3324, { side: [0, 0, 1], sq: 3, cap1: true });
    this.watch = eng.add(eng.createMesh(gw), { cast: false, visible: false });
    function whand(len, wd) {
      var gh2 = new Geo();
      gh2.quad([-wd / 2, 0, 0.003], [wd / 2, 0, 0.003], [wd / 4, 0, -len], [-wd / 4, 0, -len], 0x16181c, null, [0, 1, 0]);
      return eng.add(eng.createMesh(gh2), { cast: false, visible: false });
    }
    this.watchH = whand(0.0085, 0.0022); this.watchM = whand(0.013, 0.0016);
    this.watchPos = [wx, wy + 0.0099, wz];
    var gp = new Geo();
    gp.gloss = 0.75;
    gp.slab(0, 0, 0, 0.072, 0.009, 0.15, 0x17181b, { r: 0.011, seg: 3 });
    gp.box(0, 0.0048, 0, 0.066, 0.0006, 0.143, 0x0a0b0d);
    gp.box(0, 0.005, -0.066, 0.01, 0.0006, 0.003, 0x26282c);
    this.phone = eng.add(eng.createMesh(gp), { cast: false, visible: false });
    this.phoneHome = [this.dx - 0.17, this.y + 0.005, this.dz - 0.05];
    this.phonePos = this.phoneHome.slice();

    /* ── 내 몸: 두 손, 펜, 팔, 무릎 ── */
    var fab = { tex: tx.fabric, rim: 0.3, visible: false };
    var ph = buildPenHand();
    this.penAxis = ph.a; this.penWrist = ph.wrist;
    this.hand = eng.add(eng.createMesh(ph.geo), { visible: false });
    var openMesh = eng.createMesh(buildOpenHand());
    this.handL = eng.add(openMesh, { visible: false });
    this.handR = eng.add(openMesh, { visible: false });          /* 같은 메시를 좌우로 뒤집어 그린다 */
    var penGeo = buildPen(new Geo());
    this.pen = eng.add(eng.createMesh(penGeo), { tex: tx.papers, visible: false });
    /* 펜 방향 회전(+Y → a) */
    var a = ph.a, px = vnorm(vcross([0, 0, 1], a)), pz = vcross(px, a);
    this.penRot = new Float32Array([px[0], px[1], px[2], 0, a[0], a[1], a[2], 0, pz[0], pz[1], pz[2], 0, 0, 0, 0, 1]);
    var gu = new Geo();
    gu.ellipsoid(0, 0, 0, 0.06, 0.058, 0.062, SLEEVE, { seg: 10, rings: 6 });
    gu.loft([{ p: [0, 0, 0], rx: 0.058, rz: 0.06 }, { p: [0, -L1 * 0.5, 0], rx: 0.054, rz: 0.056 }, { p: [0, -L1, 0], rx: 0.049, rz: 0.05 }], 10, SLEEVE, { side: [1, 0, 0], uv: [0, 0, 2, 1.5] });
    gu.ellipsoid(0, -L1, 0, 0.05, 0.05, 0.051, SLEEVE, { seg: 10, rings: 6 });
    var um = eng.createMesh(gu);
    var gf = new Geo();
    gf.loft([{ p: [0, 0, 0], rx: 0.049, rz: 0.05 }, { p: [0, -0.12, 0], rx: 0.044, rz: 0.043 }, { p: [0, -L2 + 0.034, 0], rx: 0.036, rz: 0.032 },
      { p: [0, -L2 + 0.03, 0], rx: 0.0375, rz: 0.0335, c: CUFF }, { p: [0, -L2 + 0.004, 0], rx: 0.036, rz: 0.031, c: CUFF }, { p: [0, -L2, 0], rx: 0.033, rz: 0.028, c: CUFF }],
      12, SLEEVE, { side: [1, 0, 0], uv: [0, 0, 2, 2], cap1: true });
    var fm = eng.createMesh(gf);
    this.arm = [
      { up: eng.add(um, { tex: tx.fabric, rim: 0.3, visible: false }), fore: eng.add(fm, { tex: tx.fabric, rim: 0.3, visible: false }), sgn: 1, wrist: [0, 0, 0], e: [0, 0, 0], s: [0, 0, 0] },
      { up: eng.add(um, { tex: tx.fabric, rim: 0.3, visible: false }), fore: eng.add(fm, { tex: tx.fabric, rim: 0.3, visible: false }), sgn: -1, wrist: [0, 0, 0], e: [0, 0, 0], s: [0, 0, 0] }
    ];
    /* 무릎·배(고개를 깊이 숙이면 보인다) */
    var gb = new Geo(), cx = seat.chair[0], cz = seat.chair[1], sgn;
    for (sgn = -1; sgn <= 1; sgn += 2) {
      gb.loft([{ p: [cx + sgn * 0.09, 0.52, cz + 0.08], rx: 0.085, rz: 0.075 }, { p: [cx + sgn * 0.1, 0.515, cz - 0.14], rx: 0.076, rz: 0.068 }, { p: [cx + sgn * 0.11, 0.5, cz - 0.38], rx: 0.06, rz: 0.058 }],
        10, PANTS, { side: [1, 0, 0], uv: [0, 0, 3, 2] });
      gb.ellipsoid(cx + sgn * 0.11, 0.497, cz - 0.385, 0.06, 0.06, 0.06, PANTS, { seg: 10, rings: 6 });
      gb.loft([{ p: [cx + sgn * 0.11, 0.5, cz - 0.39], rx: 0.056, rz: 0.056 }, { p: [cx + sgn * 0.11, 0.3, cz - 0.38], rx: 0.05, rz: 0.052 }, { p: [cx + sgn * 0.11, 0.09, cz - 0.34], rx: 0.041, rz: 0.043 }],
        10, PANTS, { side: [1, 0, 0], uv: [0, 0, 3, 2] });
      gb.loft([{ p: [cx + sgn * 0.11, 0.05, cz - 0.27], rx: 0.04, rz: 0.04 }, { p: [cx + sgn * 0.11, 0.052, cz - 0.34], rx: 0.047, rz: 0.05 }, { p: [cx + sgn * 0.11, 0.042, cz - 0.46], rx: 0.047, rz: 0.038 },
        { p: [cx + sgn * 0.11, 0.03, cz - 0.53], rx: 0.035, rz: 0.026 }], 10, 0xeeeeea, { side: [1, 0, 0], sq: 2.6, cap0: true, cap1: true });
    }
    gb.loft([{ p: [cx, 0.5, cz + 0.07], rx: 0.175, rz: 0.125, sq: 2.5 }, { p: [cx, 0.68, cz + 0.05], rx: 0.168, rz: 0.118, sq: 2.4 }, { p: [cx, 0.86, cz + 0.02], rx: 0.172, rz: 0.112, sq: 2.5 },
      { p: [cx, 0.94, cz + 0.0], rx: 0.15, rz: 0.09 }], 14, SLEEVE, { side: [1, 0, 0], uv: [0, 0, 4, 3], cap0: true, cap1: true });
    this.body = eng.add(eng.createMesh(gb), fab);

    this.handPos = [this.dx + 0.21, this.y + 0.03, this.dz + 0.09];
    this.handTarget = this.handPos.slice();
    this.handAnim = 0; this.markAt = null;
    this.handVisible = false;
    /* 편 손의 손목 위치·방향(책상 기준 → 세상 좌표). L: 왼손, R: 오른손 */
    this.restL = { p: [this.dx - 0.29, this.y + 0.0012, this.dz + 0.262], yaw: -0.95, pitch: -0.03 };
    this.restR = { p: [this.dx + 0.245, this.y + 0.0012, this.dz + 0.262], yaw: 0.7, pitch: -0.03 };
    this.hL = { p: this.restL.p.slice(), yaw: this.restL.yaw, pitch: this.restL.pitch, roll: 0 };
    this.hR = { p: this.restR.p.slice(), yaw: this.restR.yaw, pitch: this.restR.pitch, roll: 0 };
    this.nudgeT = 0;
    this.penHome = [this.dx + 0.1, this.y + 0.0052, this.dz + 0.16, 1.15];
    this.update(0, null);
  }

  /* 넘어가는 장의 동적 메시(가로로 NS 칸). uv = [u0,v0,u1,v1] */
  function leafMesh(eng, uv) {
    var nv = (NS + 1) * 2, v = new Float32Array(nv * 12), idx = new Uint32Array(NS * 6), i, k;
    for (i = 0; i <= NS; i++) {
      for (k = 0; k < 2; k++) {
        var o = (i * 2 + k) * 12;
        v[o + 4] = 1; v[o + 6] = v[o + 7] = v[o + 8] = 1;
        v[o + 10] = uv[0] + (uv[2] - uv[0]) * (i / NS); v[o + 11] = k ? uv[3] : uv[1];
      }
    }
    for (i = 0; i < NS; i++) { var a = i * 2; idx.set([a, a + 2, a + 3, a, a + 3, a + 1], i * 6); }
    var mesh = eng.createMesh({ vertices: v, indices: idx }, true);
    mesh.v = v;
    return mesh;
  }
  /* 책등(x=0)을 축으로 th 만큼 넘어간 책장 모양을 두 메시에 써 넣는다. curl 은 휘는 정도. 끝(자유단)의 [x,y] 를 돌려준다 */
  Exam.prototype._leaf = function (th, curl) {
    var f = this.leafF.mesh.v, b = this.leafB.mesh.v, ds = BOOK.w / NS, x = 0, y = 0, i, k, hz = BOOK.h / 2;
    for (i = 0; i <= NS; i++) {
      var al = th * (1 - curl * (1 - i / NS)), nx = -Math.sin(al), ny = Math.cos(al);
      for (k = 0; k < 2; k++) {
        var o = (i * 2 + k) * 12, z = k ? hz : -hz;
        f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = nx; f[o + 4] = ny; f[o + 5] = 0;
        b[o] = x - nx * 0.0005; b[o + 1] = y - ny * 0.0005; b[o + 2] = z; b[o + 3] = -nx; b[o + 4] = -ny; b[o + 5] = 0;
      }
      if (i < NS) { var am = th * (1 - curl * (1 - (i + 0.5) / NS)); x += Math.cos(am) * ds; y += Math.sin(am) * ds; }
    }
    this.eng.updateMesh(this.leafF.mesh, f);
    this.eng.updateMesh(this.leafB.mesh, b);
    return [x, y];
  };

  /* ───────── 문제지 그리기 ───────── */
  /* slot 번 캔버스에 idx 번 문항 쪽(시험 중이 아니면 표지)을 그린다 */
  Exam.prototype.drawPage = function (slot, idx) {
    var cv = this.pageCv[slot], c;
    cv.width = PW;
    c = cv.getContext('2d');
    c.fillStyle = '#f8f7f0'; c.fillRect(0, 0, PW, PH);
    T.paperGrain(c, 0, 0, PW, PH, 300 + idx, 1);
    c.textBaseline = 'alphabetic';
    if (this.state !== 'open') { this._cover(c); this.layout = null; return; }
    var q = this.qs[idx], subj = GX.SUBJECTS[q.subj];
    /* 뒷면 글씨가 옅게 비친다 */
    var rr = GX.rng(900 + idx), i;
    c.fillStyle = 'rgba(70,70,78,0.045)';
    for (i = 0; i < 22; i++) c.fillRect(PW - 110 - 620 - rr() * 420, 470 + i * 62 + rr() * 8, 620 + rr() * 420, 16);
    /* 머리말 */
    c.fillStyle = '#16171a'; c.textAlign = 'left';
    T.font(c, 34, FONT.serif); c.fillText('2030년도 세무사 제1차 시험', 92, 104);
    c.textAlign = 'right'; c.fillText('1교시 · 문제지 A형', PW - 92, 104);
    c.textAlign = 'center'; T.font(c, 76, FONT.serif, true); c.fillText(subj.name, PW / 2, 198);
    c.fillRect(84, 236, PW - 168, 7); c.fillRect(84, 252, PW - 168, 2);
    c.textAlign = 'left'; T.font(c, 34, FONT.serif);
    c.fillText((q.subj === 'tax' ? '제1과목' : '제2과목') + '  ·  문 ' + (idx + 1) + ' / 10', 92, 314);
    /* 글자 크기 맞추기 */
    var X0 = 100, NUMW = 96, X1 = PW - 100, top = 420, bottom = 1880, size, lh, qLines, chLines, total;
    for (size = 66; size >= 40; size -= 2) {
      lh = Math.round(size * 1.52);
      T.font(c, size, FONT.serif);
      qLines = T.wrap(c, q.text, X1 - X0 - NUMW);
      chLines = [];
      total = qLines.length * lh + lh * 0.75;
      for (i = 0; i < 5; i++) {
        var ls = T.wrap(c, q.choices[i], X1 - X0 - NUMW - size * 1.35);
        chLines.push(ls);
        total += ls.length * lh + lh * 0.42;
      }
      if (total <= bottom - top) break;
    }
    var y = top + size;
    c.fillStyle = '#111214';
    T.font(c, size, FONT.serif, true);
    c.fillText((idx + 1) + '.', X0, y);
    T.font(c, size, FONT.serif);
    for (i = 0; i < qLines.length; i++) c.fillText(qLines[i], X0 + NUMW, y + i * lh);
    var qRect = { x: X0 - 26, y: top - 22, w: X1 - X0 + 52, h: qLines.length * lh + 30 };
    y += qLines.length * lh + lh * 0.75;
    var rects = [];
    for (i = 0; i < 5; i++) {
      var cy0 = y - size;
      T.font(c, size, FONT.serif);
      c.fillText(CIRC[i], X0 + NUMW, y);
      for (var k = 0; k < chLines[i].length; k++) c.fillText(chLines[i][k], X0 + NUMW + size * 1.35, y + k * lh);
      rects.push({ x: X0 + NUMW - 20, y: cy0 - 8, w: X1 - X0 - NUMW + 40, h: chLines[i].length * lh + 4, cx: X0 + NUMW + size * 0.5, cy: y - size * 0.36, r: size * 0.72 });
      y += chLines[i].length * lh + lh * 0.42;
    }
    this.layout = { q: qRect, choices: rects, size: size, idx: idx };
    /* 내가 고른 답: 문제지에도 펜으로 동그라미 */
    var a = this.answers[idx];
    if (a >= 0) {
      var rc = rects[a];
      c.strokeStyle = 'rgba(24,26,32,0.86)'; c.lineWidth = Math.max(5, size * 0.09); c.lineCap = 'round';
      c.beginPath();
      for (var s = 0; s <= 26; s++) {
        var ang = -0.5 + s / 26 * (Math.PI * 2 + 0.55), rad = rc.r * (1 + 0.07 * Math.sin(s * 1.7));
        var px = rc.cx + Math.cos(ang) * rad * 1.08, py = rc.cy + Math.sin(ang) * rad * 0.92;
        if (s === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.stroke();
    }
    c.fillStyle = '#16171a'; c.textAlign = 'center'; T.font(c, 34, FONT.serif);
    c.fillText('- ' + (idx + 1) + ' -', PW / 2, PH - 74);
    c.textAlign = 'right'; T.font(c, 28, FONT.serif);
    c.fillText(idx < 9 ? '다음 장에 계속 ▶' : '— 끝 —  수고하셨습니다', PW - 92, PH - 76);
  };

  Exam.prototype._cover = function (c) {
    c.strokeStyle = '#17181b'; c.lineWidth = 8; c.strokeRect(90, 90, PW - 180, PH - 180);
    c.lineWidth = 2; c.strokeRect(108, 108, PW - 216, PH - 216);
    c.fillStyle = '#17181b'; c.textAlign = 'center';
    T.font(c, 48, FONT.serif); c.fillText('2030년도', PW / 2, 300);
    T.font(c, 78, FONT.serif, true); c.fillText('세무사 제1차 시험', PW / 2, 410);
    T.font(c, 190, FONT.serif, true); c.fillText('문 제 지', PW / 2, 690);
    c.lineWidth = 6; c.strokeRect(PW / 2 - 330, 800, 300, 190); c.strokeRect(PW / 2 + 30, 800, 300, 190);
    T.font(c, 44, FONT.serif); c.fillText('교 시', PW / 2 - 180, 852); c.fillText('문제 형별', PW / 2 + 180, 852);
    T.font(c, 96, FONT.serif, true); c.fillText('1', PW / 2 - 180, 958); c.fillText('A', PW / 2 + 180, 958);
    T.font(c, 56, FONT.serif); c.fillText('세법학개론 · 회계학개론', PW / 2, 1170);
    c.fillText('총 10문항 · 80분', PW / 2, 1260);
    c.fillStyle = '#b3261e'; T.font(c, 62, FONT.sans, true);
    c.fillText('본령이 울리기 전에는', PW / 2, 1500);
    c.fillText('문제지를 넘기지 마십시오.', PW / 2, 1590);
    c.fillStyle = '#17181b'; c.lineWidth = 4; c.strokeRect(PW / 2 - 330, 1710, 660, 110);
    T.font(c, 50, FONT.sans, true); c.fillText('수험번호  ' + this.seat.no, PW / 2, 1783);
    /* 바코드 */
    var r = GX.rng(77), x = PW / 2 - 200;
    while (x < PW / 2 + 200) { var w = 2 + Math.floor(r() * 3) * 2; c.fillRect(x, 1862, w, 46); x += w + 2 + Math.floor(r() * 3) * 2; }
  };

  /* ───────── 답안지 그리기 ───────── */
  Exam.prototype.drawOMR = function () {
    var cv = this.omrCv, c, i, k;
    cv.width = OW * OS;
    c = cv.getContext('2d');
    c.scale(OS, OS);
    var ink = '#cf4a44', pale = '#f8d3ce', paler = '#fdeeeb';
    c.fillStyle = '#fffcf9'; c.fillRect(0, 0, OW, OH);
    T.paperGrain(c, 0, 0, OW, OH, 17, 0.7);
    c.strokeStyle = ink; c.lineWidth = 3; c.strokeRect(46, 22, OW - 68, OH - 44);
    c.fillStyle = '#111111';
    for (i = 0; i < 30; i++) c.fillRect(8, 34 + i * 34, 22, 11);         /* 타이밍 마크 */
    c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle';
    T.font(c, 36, FONT.sans, true); c.fillText('세무사 제1차 시험 답안지', OW / 2 + 12, 56);
    T.font(c, 15, FONT.sans); c.fillText('※ 반드시 컴퓨터용 사인펜으로 표기하십시오 (예비 마킹 불인정)', OW / 2 + 12, 88);
    c.fillRect(46, 104, OW - 68, 2);
    /* 교시 · 형별 · 성명 */
    c.fillStyle = paler; c.fillRect(48, 106, OW - 72, 40);
    c.fillStyle = ink; c.textAlign = 'left'; T.font(c, 19, FONT.sans, true);
    c.fillText('교시', 62, 127); c.fillText('형별', 172, 127); c.fillText('성명', 366, 127);
    c.strokeStyle = ink; c.lineWidth = 2;
    c.strokeRect(104, 112, 44, 28);
    c.fillStyle = '#17181c'; T.font(c, 24, FONT.sans, true); c.textAlign = 'center'; c.fillText('1', 126, 127);
    var hr = GX.rng(5150);
    for (k = 0; k < 2; k++) {
      var fx = 232 + k * 52;
      if (k === 0) { c.fillStyle = '#141518'; T.oval(c, fx, 126, 11, 14); c.fill(); }
      else { c.strokeStyle = ink; T.oval(c, fx, 126, 10, 13); c.stroke(); c.fillStyle = ink; T.font(c, 17, FONT.sans, true); c.fillText('B', fx, 127); }
    }
    c.fillStyle = ink; T.font(c, 15, FONT.sans, true); c.fillText('A', 212, 127);
    c.strokeStyle = ink; c.strokeRect(412, 112, 132, 28);
    T.hand(c, hr, '홍길동', 478, 134, 26, FONT.chalk, '#1c2030', 'center', 1.3);
    c.fillStyle = ink; c.fillRect(46, 146, OW - 68, 2);
    /* 수험번호: 손으로 쓴 칸 + 표기 칸 */
    c.textAlign = 'left'; T.font(c, 19, FONT.sans, true); c.fillText('수험', 62, 172); c.fillText('번호', 62, 196);
    var digits = this.seat.no.replace(/\s/g, '');
    for (i = 0; i < 8; i++) {
      var gx = 120 + i * 40;
      c.strokeStyle = ink; c.lineWidth = 1.5; c.strokeRect(gx, 152, 34, 26);
      T.hand(c, hr, digits[i], gx + 17, 173, 23, FONT.chalk, '#1c2030', 'center', 1.2);
      for (k = 0; k < 10; k++) {
        var by = 184.5 + k * 4.9;
        if (String(k) === digits[i]) { c.fillStyle = '#141518'; c.fillRect(gx + 9, by - 1.8, 16, 3.8); }
        else { c.fillStyle = pale; c.fillRect(gx + 10, by - 1.4, 14, 2.8); }
      }
    }
    /* 감독위원 확인 도장 */
    c.strokeStyle = ink; c.lineWidth = 2; c.strokeRect(566, 110, 100, 122);
    c.fillStyle = ink; c.textAlign = 'center'; T.font(c, 15, FONT.sans, true); c.fillText('감독위원 확인', 616, 124);
    c.save(); c.translate(618, 180); c.rotate(-0.16);
    c.strokeStyle = 'rgba(196,38,30,0.86)'; c.lineWidth = 3.5; c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(196,38,30,0.86)'; T.font(c, 17, FONT.serif, true); c.fillText('감독', 0, -8); c.fillText('확인', 0, 12);
    c.restore();
    c.fillStyle = ink; c.fillRect(46, 236, OW - 68, 3);
    /* 답 표기란 */
    for (i = 0; i < 10; i++) {
      var y = this.rowY(i);
      if (i === 0 || i === 5) {
        c.fillStyle = pale; c.fillRect(60, y - 60, OW - 96, 28);
        c.fillStyle = ink; c.textAlign = 'left'; T.font(c, 21, FONT.sans, true);
        c.fillText(i === 0 ? '제1과목 세법학개론' : '제2과목 회계학개론', 74, y - 45);
      }
      if (i % 2 === 1) { c.fillStyle = paler; c.fillRect(60, y - 33, OW - 96, 66); }
      c.fillStyle = ink; c.textAlign = 'center'; T.font(c, 32, FONT.sans, true);
      c.fillText(String(i + 1), 150, y + 1);
      c.fillRect(196, y - 30, 2, 60);
      for (k = 0; k < 5; k++) {
        var x = COL_X + k * COL_W;
        if (this.answers[i] === k) {
          /* 사인펜으로 칠한 칸: 타원을 꽉 채우되 가장자리가 살짝 고르지 않다 */
          var mr = GX.rng(i * 31 + k * 7 + 3);
          c.fillStyle = '#131417';
          T.oval(c, x + (mr() - 0.5) * 1.2, y + (mr() - 0.5) * 1.2, 16.8, 24.2); c.fill();
          for (var st = 0; st < 7; st++) {
            var ba = mr() * Math.PI * 2;
            T.oval(c, x + Math.cos(ba) * 15.2, y + Math.sin(ba) * 22.2, 2.6 + mr() * 1.6, 2.6 + mr() * 1.6); c.fill();
          }
          c.fillStyle = 'rgba(255,255,255,0.07)'; T.oval(c, x - 4, y - 6, 6, 11); c.fill();
        } else {
          c.strokeStyle = ink; c.lineWidth = 2.6;
          T.oval(c, x, y, 15.5, 23); c.stroke();
          c.fillStyle = ink; T.font(c, 23, FONT.sans, true); c.fillText(String(k + 1), x, y + 1);
        }
      }
    }
    c.fillStyle = ink; T.font(c, 15.5, FONT.sans); c.textAlign = 'left';
    c.fillText('※ 한 문항에 하나만 표기하십시오. 잘못 표기한 칸은 수정테이프로만', 62, 1002);
    c.fillText('   고칠 수 있으며, 답안지를 접거나 낙서하면 판독되지 않을 수 있습니다.', 62, 1022);
    c.fillStyle = '#111111';
    var br = GX.rng(42), bx = 560;
    while (bx < 668) { var bw = 1.5 + Math.floor(br() * 3) * 1.5; c.fillRect(bx, 992, bw, 34); bx += bw + 1.5 + Math.floor(br() * 3) * 1.5; }
  };
  Exam.prototype.rowY = function (i) { return ROW_Y + i * ROW_H + (i >= 5 ? 26 : 0); };

  /* ───────── AI 렌즈가 문제지 위에 겹쳐 보여 주는 표시 ─────────
   * 렌즈가 지금 하는 일(arStage)에 따라 다르다: 문항 테두리를 찾는 중(lock) → 글자를 줄줄이 읽는 중(read)
   * → 답을 만드는 중(think) → 답(이미 답이 나온 문항은 켜자마자 다시 보여 준다) */
  Exam.prototype.drawAR = function () {
    var cv = this.arCv, c, s = AW / PW, i;
    cv.width = AW;
    c = cv.getContext('2d');
    var L = this.layout;
    if (!L || !this.glasses) return;
    var q = this.qs[this.cur], done = this.scanned[this.cur];
    var st = this.arStage, step = this.arStep, mine = this.arQ === this.cur;      /* 기기가 붙잡은 문항이 지금 펼친 문항인가 */
    var colr = done && q.ai.conf < 80 ? '255,206,96' : '110,240,255';
    function bracket(x, y, w, h, len) {
      c.beginPath();
      c.moveTo(x, y + len); c.lineTo(x, y); c.lineTo(x + len, y);
      c.moveTo(x + w - len, y); c.lineTo(x + w, y); c.lineTo(x + w, y + len);
      c.moveTo(x + w, y + h - len); c.lineTo(x + w, y + h); c.lineTo(x + w - len, y + h);
      c.moveTo(x + len, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h - len);
      c.stroke();
    }
    var last = L.choices[4], bx = L.q.x * s, by = L.q.y * s, bw = L.q.w * s, bh = (last.y + last.h - L.q.y + 24) * s;
    function label(text, w) {
      c.fillStyle = 'rgba(6,22,30,0.8)'; T.roundRect(c, AW - 42 - w, by - 67, w, 50, 10); c.fill();
      c.fillStyle = 'rgba(' + colr + ',1)'; c.textAlign = 'center'; T.font(c, 26, FONT.sans, true);
      c.fillText(text, AW - 42 - w / 2, by - 41);
    }
    c.lineCap = 'round'; c.lineJoin = 'round'; c.textBaseline = 'middle';
    if (done) {
      c.strokeStyle = 'rgba(' + colr + ',0.95)'; c.lineWidth = 5;
      bracket(bx, by, bw, bh, 34);
      var r = L.choices[q.ai.pick], rx = r.x * s, ry = r.y * s, rw = r.w * s, rh = r.h * s;
      c.fillStyle = 'rgba(' + colr + ',0.2)'; T.roundRect(c, rx, ry, rw, rh, 12); c.fill();
      c.strokeStyle = 'rgba(' + colr + ',1)'; c.lineWidth = 5; T.roundRect(c, rx, ry, rw, rh, 12); c.stroke();
      label('AI 답 ' + CIRC[q.ai.pick] + '  ·  신뢰도 ' + q.ai.conf + '%', 348);
      /* 고른 보기 오른쪽 꼬리표 */
      c.fillStyle = 'rgba(' + colr + ',1)'; T.roundRect(c, rx + rw - 96, ry - 20, 96, 40, 10); c.fill();
      c.fillStyle = '#04161d'; T.font(c, 25, FONT.sans, true); c.fillText('AI ' + CIRC[q.ai.pick], rx + rw - 48, ry + 1);
      return;
    }
    if (mine && st === 'lock') {
      /* 점선 테두리가 바깥에서 흔들리며 조여 들어온다 */
      var pad = (3 - step) * 26 + 8, wob = (step % 2 ? 1 : -1) * (3 - step) * 9;
      c.strokeStyle = 'rgba(' + colr + ',0.9)'; c.lineWidth = 5;
      c.setLineDash([18, 9]);
      bracket(bx - pad + wob, by - pad, bw + pad * 2, bh + pad * 2, 64);
      c.setLineDash([]);
      label('문항 찾는 중', 230);
      return;
    }
    c.strokeStyle = 'rgba(' + colr + ',0.95)'; c.lineWidth = 5;
    bracket(bx, by, bw, bh, 34);
    if (mine && (st === 'read' || st === 'think')) {
      /* 읽은 덩어리(문제 → 보기 ①~⑤)마다 옅은 칠과 밑줄 */
      var units = [L.q].concat(L.choices), n = st === 'think' ? 6 : Math.min(6, step);
      for (i = 0; i < n; i++) {
        var u = units[i];
        c.fillStyle = 'rgba(' + colr + ',0.09)'; c.fillRect(u.x * s, u.y * s, u.w * s, u.h * s);
        c.fillStyle = 'rgba(' + colr + ',0.6)'; c.fillRect(u.x * s, (u.y + u.h) * s - 3, u.w * s, 2);
      }
      if (st === 'read' && n < 6) {
        var u2 = units[n];
        c.strokeStyle = 'rgba(' + colr + ',0.9)'; c.lineWidth = 3;
        c.strokeRect(u2.x * s, u2.y * s, u2.w * s, u2.h * s);
      }
      label(st === 'read' ? '글자 읽는 중' : '답 생성 중' + ['', ' ·', ' · ·', ' · · ·'][step % 4], st === 'read' ? 230 : 276);
      return;
    }
    label('문항 인식 대기', 250);
  };
  /* 렌즈가 하는 일이 바뀌었을 때만 표시를 다시 그린다 */
  Exam.prototype.setAR = function (stage, step, q) {
    if (stage === this.arStage && step === this.arStep && q === this.arQ) return;
    this.arStage = stage; this.arStep = step; this.arQ = q;
    if (this.state !== 'open') return;
    this.drawAR(); this.eng.updateTexture(this.arTex, this.arCv);
  };

  /* what: { page(맨 위 장 다시 그리기), omr, ar }. 없으면 전부 */
  Exam.prototype.refresh = function (what) {
    if (!what || what.page) {
      this.drawPage(this.top, this.shown < 0 ? this.cur : this.shown);
      this.eng.updateTexture(this.pageTex[this.top], this.pageCv[this.top]);
    }
    if (!what || what.omr) { this.drawOMR(); this.eng.updateTexture(this.omrTex, this.omrCv); }
    if (!what || what.ar || what.page) { this.drawAR(); this.eng.updateTexture(this.arTex, this.arCv); }
  };

  /* none(없음) / cover(덮인 문제지) / open(시험 중) / closed(종료) */
  Exam.prototype.setState = function (s) {
    this.state = s;
    var on = s !== 'none';
    this.book.visible = on; this.stack.visible = on; this.omr.visible = on;
    this.flipTo = null; this.flip = 0; this.leafF.visible = this.leafB.visible = false;
    this.shown = s === 'open' ? this.cur : -1;
    this.book.tex = this.pageTex[this.top];
    this.markAt = null;
    this.refresh();
  };
  /* 본령이 울린 뒤 내 손으로 표지를 넘긴다: 표지가 한 장 넘어가며 1번 문항이 드러난다(문항을 넘길 때와 같은 책장 넘김) */
  Exam.prototype.openCover = function () {
    if (this.state !== 'cover' || this.flipTo !== null) return false;
    var spare = 1 - this.top;
    this.state = 'open';
    this.cur = 0;
    this.drawPage(spare, 0);
    this.eng.updateTexture(this.pageTex[spare], this.pageCv[spare]);
    this.leafF.tex = this.pageTex[this.top]; this.leafIdx = -1;       /* 넘어가는 장 = 지금 보이는 표지 */
    this.book.tex = this.pageTex[spare]; this.top = spare; this.shown = 0;
    this.flipTo = 0; this.flip = 0.0001; this.flipDir = 1;
    this.markAt = null;
    this.drawAR(); this.eng.updateTexture(this.arTex, this.arCv);
    return true;
  };
  /* 자리에 앉으면 손과 팔이 보인다 */
  Exam.prototype.seated = function (on) { this.on = !!on; };
  /* 넘길 수 없는 문제지를 넘기려 할 때: 왼손이 모서리를 집었다 놓는다 */
  Exam.prototype.nudge = function () { this.nudgeT = 0.45; };

  /* 문항 이동(책장 넘김) */
  Exam.prototype.goto = function (i) {
    if (this.state !== 'open') return false;
    i = GX.clamp(i, 0, 9);
    if (i === this.cur || this.flipTo !== null) return false;
    if (this.markAt) this._commitMark();
    var spare = 1 - this.top, fwd = i > this.cur;
    this.flipTo = i; this.flip = 0.0001; this.flipDir = fwd ? 1 : -1;
    this.drawPage(spare, i);
    this.eng.updateTexture(this.pageTex[spare], this.pageCv[spare]);
    if (fwd) {
      /* 새 쪽을 아래에 깔고, 지금 쪽이 넘어간다 */
      this.leafF.tex = this.pageTex[this.top]; this.leafIdx = this.cur;
      this.book.tex = this.pageTex[spare]; this.top = spare; this.shown = i;
    } else {
      /* 앞 쪽이 왼쪽에서 돌아와 덮인다 */
      this.leafF.tex = this.pageTex[spare]; this.leafIdx = i;
    }
    return true;
  };

  Exam.prototype.mark = function (i, choice) {
    if (this.state !== 'open' || i < 0 || i > 9 || choice < 0 || choice > 4) return false;
    if (this.answers[i] === choice) return false;
    if (this.markAt) this._commitMark();
    this.answers[i] = choice;
    this.followed[i] = this.scanned[i] && choice === this.qs[i].ai.pick;
    /* 손이 그 칸으로 가서 칠한 다음에 답안지 그림을 바꾼다. 문제지의 동그라미는 바로 */
    if (i === this.shown) this.refresh({ page: 1 });
    else if (i === this.leafIdx && this.flipTo !== null && this.flipDir < 0) {
      var sp = 1 - this.top;
      this.drawPage(sp, i); this.eng.updateTexture(this.pageTex[sp], this.pageCv[sp]);
      this.drawAR(); this.eng.updateTexture(this.arTex, this.arCv);
    }
    var p = this.bubblePos(i, choice);
    this.handTarget = [p[0], this.y + 0.003, p[2]];
    this.handAnim = MARK_TIME;
    this.markAt = { t: MARK_TIME * 0.42 };
    return true;
  };
  Exam.prototype._commitMark = function () {
    this.markAt = null;
    this.drawOMR(); this.eng.updateTexture(this.omrTex, this.omrCv);
  };

  /* i 번 문항(없으면 지금 펼친 문항)에 AI 의 답을 띄운다 */
  Exam.prototype.reveal = function (i) {
    if (i === undefined) i = this.cur;
    if (this.scanned[i]) return this.qs[i].ai;
    this.scanned[i] = true;
    this.followed[i] = this.answers[i] === this.qs[i].ai.pick;
    this.refresh({ ar: 1 });
    return this.qs[i].ai;
  };
  /* 문항의 글자 수(렌즈가 읽는 데 걸리는 시간을 정한다) */
  Exam.prototype.chars = function (i) {
    var c = this._chars || (this._chars = []);
    if (c[i] === undefined) {
      var q = this.qs[i], n = Array.from(q.text).length;
      for (var k = 0; k < 5; k++) n += Array.from(q.choices[k]).length;
      c[i] = n;
    }
    return c[i];
  };

  /* 안경다리를 만지러 왼손을 올린다. fast 면 급하게. 손이 보이지 않는 때(걷는 중)에는 false */
  Exam.prototype.touchTemple = function (fast) {
    var tc = this.touch;
    if (!this.on) return false;
    tc.fast = !!fast;
    if (tc.phase === 'hold') { tc.hold = 0.13; tc.hit = true; }       /* 손이 이미 닿아 있으면 한 번 더 톡 */
    else if (tc.phase !== 'reach') tc.phase = 'reach';
    return true;
  };
  /* 손이 얼굴 옆으로 올라와 있는가(남의 눈에 띄는 동작) */
  Exam.prototype.touching = function () { return this.touch.k > 0.35; };
  /* 손가락이 안경다리에 닿은 순간을 한 번만 알려 준다 */
  Exam.prototype.takeHit = function () { var h = this.touch.hit; this.touch.hit = false; return h; };

  Exam.prototype.bubblePos = function (i, k) {
    var lx = ((COL_X + k * COL_W) / OW - 0.5) * OMR.w, lz = (this.rowY(i) / OH - 0.5) * OMR.h;
    var c = Math.cos(OMR.yaw), s = Math.sin(OMR.yaw);
    return [this.omrC[0] + c * lx + s * lz, this.y, this.omrC[1] - s * lx + c * lz];
  };

  /* 시선(광선)이 책상 위 어디에 닿는가 → { on:'book'|'omr'|'desk'|null, row, col } */
  Exam.prototype.gaze = function (o, d) {
    var res = { on: null, row: -1, col: -1, x: 0, z: 0 };
    if (d[1] >= -0.05) return res;
    var t = (this.y - o[1]) / d[1];
    if (t <= 0 || t > 2.5) return res;
    var wx = o[0] + d[0] * t, wz = o[2] + d[2] * t, x = wx - this.dx, z = wz - this.dz;
    res.x = x; res.z = z;
    if (Math.abs(x) > 0.34 || Math.abs(z) > 0.24) return res;
    res.on = 'desk';
    if (this.state === 'none') return res;
    /* 답안지(조금 돌아가 있으므로 답안지 기준 좌표로 바꿔서 본다) */
    var c = Math.cos(OMR.yaw), s = Math.sin(OMR.yaw), ox = wx - this.omrC[0], oz = wz - this.omrC[1];
    var lx = c * ox - s * oz, lz = s * ox + c * oz;
    if (Math.abs(lx) <= OMR.w / 2 + 0.006 && Math.abs(lz) <= OMR.h / 2 + 0.008) {
      res.on = 'omr';
      var px = (lx / OMR.w + 0.5) * OW, py = (lz / OMR.h + 0.5) * OH;
      for (var i = 0; i < 10; i++) {
        if (Math.abs(py - this.rowY(i)) <= ROW_H * 0.5) {
          var k = Math.round((px - COL_X) / COL_W);
          if (k >= 0 && k <= 4 && Math.abs(px - (COL_X + k * COL_W)) <= COL_W * 0.5) { res.row = i; res.col = k; }
          break;
        }
      }
      return res;
    }
    var cb = Math.cos(BOOK.yaw), sb = Math.sin(BOOK.yaw), bx = x - BOOK.x0, bz = z - BOOK.zc;
    var kx = cb * bx - sb * bz, kz = sb * bx + cb * bz;
    if (kx >= -0.01 && kx <= BOOK.w + 0.006 && Math.abs(kz) <= BOOK.h / 2 + 0.01) res.on = 'book';
    return res;
  };

  Exam.prototype.bookCenter = function () {
    var c = Math.cos(BOOK.yaw), s = Math.sin(BOOK.yaw);
    return [this.dx + BOOK.x0 + c * BOOK.w / 2, this.y, this.dz + BOOK.zc - s * BOOK.w / 2];
  };
  Exam.prototype.omrCenter = function () { return [this.omrC[0], this.y, this.omrC[1]]; };

  var _m = M4.create(), _t = M4.create(), _pole = [0, 0, 0];
  function setHand(dst, p, yaw, pitch, k) {
    for (var i = 0; i < 3; i++) dst.p[i] += (p[i] - dst.p[i]) * k;
    dst.yaw += (yaw - dst.yaw) * k; dst.pitch += (pitch - dst.pitch) * k;
  }
  /* 두 자세(행렬) 사이를 k 만큼 섞는다: 위치는 곧게, 방향은 축을 섞은 뒤 다시 직각으로 맞춘다 */
  function blendPose(o, a, b, k) {
    var i, m = [];
    for (i = 0; i < 16; i++) m.push(a[i] + (b[i] - a[i]) * k);
    var x = vnorm([m[0], m[1], m[2]]), y = [m[4], m[5], m[6]], d = vdot(x, y);
    y = vnorm([y[0] - x[0] * d, y[1] - x[1] * d, y[2] - x[2] * d]);
    var z = vcross(x, y);
    o[0] = x[0]; o[1] = x[1]; o[2] = x[2]; o[3] = 0;
    o[4] = y[0]; o[5] = y[1]; o[6] = y[2]; o[7] = 0;
    o[8] = z[0]; o[9] = z[1]; o[10] = z[2]; o[11] = 0;
    o[12] = m[12]; o[13] = m[13]; o[14] = m[14]; o[15] = 1;
    return o;
  }

  /* pl: GX.Player(앉은 자세에서 어깨 위치를 정하는 데 쓴다). 없으면 손·팔은 건드리지 않는다 */
  Exam.prototype.update = function (dt, pl) {
    var m, bx = this.dx + BOOK.x0, by = this.y + 0.0036, bz = this.dz + BOOK.zc, i;
    this.t += dt;
    /* ── 책장 넘김 ── */
    var edge = null;
    if (this.flipTo !== null) {
      var before = this.flip;
      this.flip += dt / FLIP_TIME;
      if (before < 0.5 && this.flip >= 0.5) { this.cur = this.flipTo; this.drawAR(); this.eng.updateTexture(this.arTex, this.arCv); }
      if (this.flip >= 1) {
        if (this.flipDir < 0) { this.top = 1 - this.top; this.book.tex = this.pageTex[this.top]; this.shown = this.flipTo; }
        this.cur = this.flipTo;
        this.flip = 0; this.flipTo = null; this.leafIdx = -1;
        this.leafF.visible = this.leafB.visible = false;
      } else {
        var u = this.flipDir > 0 ? this.flip : 1 - this.flip;       /* 0 = 덮여 있음, 1 = 다 넘어감 */
        var th = GX.smooth(u) * Math.PI * 1.5;
        edge = this._leaf(th, 0.55 * Math.sin(Math.min(1, th / Math.PI) * Math.PI));
        edge.push(u);
        this.leafF.visible = this.leafB.visible = this.book.visible;
        M4.fromPose(this.leafF.model, bx, by + 0.0004, bz, BOOK.yaw, 0, 0);
        M4.copy(this.leafB.model, this.leafF.model);
      }
    }
    M4.fromPose(this.book.model, bx, by, bz, BOOK.yaw, 0, 0);
    M4.copy(this.stack.model, this.book.model);
    /* AI 표시 */
    var wantAR = (this.glasses && this.state === 'open' && this.flipTo === null) ? this.arWant || 0 : 0;
    this.arAlpha = GX.damp(this.arAlpha, wantAR, 9, dt);
    this.ar.visible = this.arAlpha > 0.01 && this.book.visible;
    this.ar.tint[3] = this.arAlpha;
    M4.fromPose(this.ar.model, bx, by + 0.0008, bz, BOOK.yaw, 0, 0);
    this.scanLine.visible = this.scanT >= 0 && this.book.visible;
    if (this.scanLine.visible) {
      M4.fromPose(this.scanLine.model, bx, by + 0.0016, bz, BOOK.yaw, 0, 0);
      M4.translate(this.scanLine.model, this.scanLine.model, 0, 0, -BOOK.h / 2 + 0.02 + (BOOK.h - 0.04) * ((this.scanT * 2.2) % 1));
    }
    /* 신분증 · 휴대폰 · 손목시계 */
    M4.fromPose(this.idCard.model, this.idPos[0], this.idPos[1], this.idPos[2], this.idYaw, this.idTilt, 0);
    M4.fromPose(this.phone.model, this.phonePos[0], this.phonePos[1], this.phonePos[2], 0.12, 0, 0);
    var wOn = this.ticket.visible;
    this.watch.visible = this.watchH.visible = this.watchM.visible = wOn;
    if (wOn) {
      var ct = this.world.clockTime, wp = this.watchPos;
      /* 바늘은 먼 쪽(-z)이 12시. 교실 시계와 같은 시각을 가리킨다 */
      M4.fromPose(this.watchH.model, wp[0], wp[1], wp[2], -(ct / 43200) * Math.PI * 2, 0, 0);
      M4.fromPose(this.watchM.model, wp[0], wp[1] + 0.0003, wp[2], -(ct / 3600) * Math.PI * 2, 0, 0);
    }

    /* ── 펜 든 오른손 ── */
    var wig = 0, wigz = 0, lift = 0.02;
    if (this.handAnim > 0) {
      this.handAnim -= dt;
      var k = 1 - this.handAnim / MARK_TIME;
      if (this.markAt && k >= 0.62) this._commitMark();
      if (k > 0.24 && k < 0.78) { wigz = Math.sin((k - 0.24) * 46) * 0.0042; wig = Math.sin((k - 0.24) * 23) * 0.0012; lift = 0.0012; }
      else lift = k <= 0.24 ? GX.lerp(0.02, 0.0012, k / 0.24) : GX.lerp(0.0012, 0.02, (k - 0.78) / 0.22);
    } else if (this.state === 'open') {
      var rest = this.bubblePos(this.flipTo !== null ? this.flipTo : this.cur, 4);
      this.handTarget = [rest[0] + 0.034, this.y + 0.003, rest[2] + 0.004];
    } else {
      this.handTarget = [this.dx + 0.2, this.y + 0.003, this.dz + 0.1];
    }
    for (i = 0; i < 3; i++) this.handPos[i] = GX.damp(this.handPos[i], this.handTarget[i], 16, dt || 1);
    var penHeld = this.on && this.handVisible && this.state === 'open';
    /* 긴장하면 펜 쥔 손이 잘게 떨린다 */
    var tr = this.tremor;
    if (tr > 0.02) {
      wig += (Math.sin(this.t * 37) + Math.sin(this.t * 53.3 + 1.1)) * 0.00042 * tr;
      wigz += (Math.sin(this.t * 41.7 + 0.6) + Math.sin(this.t * 29.1)) * 0.00042 * tr;
    }
    var hx = this.handPos[0] + wig, hy = this.handPos[1] + lift, hz = this.handPos[2] + wigz;
    this.hand.visible = penHeld;
    M4.fromPose(this.hand.model, hx, hy, hz, 0, 0, 0);
    /* 펜: 쥐고 있으면 손과 함께, 아니면 책상 위에 눕혀 둔다 */
    this.pen.visible = this.on && this.handVisible;
    if (penHeld) {
      M4.fromPose(_m, hx, hy, hz, 0, 0, 0);
      M4.multiply(this.pen.model, _m, this.penRot);
    } else {
      var ph = this.penHome;
      M4.fromPose(this.pen.model, ph[0], ph[1], ph[2], ph[3], 0, -Math.PI / 2);
    }

    /* ── 편 손(왼손, 그리고 펜을 쥐기 전의 오른손) ── */
    var kk = dt ? 1 - Math.exp(-14 * dt) : 1;
    var L = this.restL, tp = L.p, tyaw = L.yaw, tpitch = L.pitch;
    if (edge && edge[2] < 0.62) {
      /* 책장의 끝을 집고 따라간다 */
      var cb = Math.cos(BOOK.yaw), sb = Math.sin(BOOK.yaw), ex = bx + cb * edge[0], ez = bz - sb * edge[0] + BOOK.h / 2 - 0.03;
      tp = [ex - 0.02, by + edge[1] + 0.012, ez + 0.172]; tyaw = -0.12; tpitch = 0.25;
    } else if (this.nudgeT > 0) {
      this.nudgeT -= dt;
      tp = [bx + BOOK.w - 0.03, by + 0.01 + Math.sin(Math.max(0, this.nudgeT) / 0.45 * Math.PI) * 0.03, bz + BOOK.h / 2 + 0.14]; tyaw = -0.12; tpitch = 0.2;
    } else if (this.holdId && this.idYaw < 0) {
      /* 감독관이 왼쪽에 서 있으면 왼손으로 신분증을 들어 보인다(손바닥이 신분증 뒷면을 받친다) */
      var kq = Math.min(1, -this.idYaw / 1.25);
      tp = [this.idPos[0] + 0.012, this.idPos[1] - 0.11 * kq, this.idPos[2] + 0.17 * (1 - kq)]; tyaw = 1.5 * kq; tpitch = 1.35 * kq;
    } else if (this.holdPhone && this.phonePos[0] < this.dx + 0.5 && this.phonePos[0] > this.dx - 0.5) {
      tp = [this.phonePos[0] - 0.02, this.phonePos[1] + 0.012, this.phonePos[2] + 0.13]; tyaw = 0.1; tpitch = 0.1;
    }
    setHand(this.hL, tp, tyaw, tpitch, kk);
    var R = this.restR;
    tp = R.p; tyaw = R.yaw; tpitch = R.pitch;
    if (this.holdId && this.idYaw > 0) {
      var kr = Math.min(1, this.idYaw / 1.25);
      tp = [this.idPos[0] - 0.012, this.idPos[1] - 0.11 * kr, this.idPos[2] + 0.17 * (1 - kr)]; tyaw = -1.5 * kr; tpitch = 1.35 * kr;
    }
    setHand(this.hR, tp, tyaw, tpitch, kk);
    var show = this.on;
    this.handL.visible = show;
    this.handR.visible = show && !penHeld;
    M4.fromPose(this.handL.model, this.hL.p[0], this.hL.p[1], this.hL.p[2], this.hL.yaw, this.hL.pitch, 0);
    M4.fromPose(this.handR.model, this.hR.p[0], this.hR.p[1], this.hR.p[2], this.hR.yaw, this.hR.pitch, 0);
    M4.scale(this.handR.model, this.handR.model, -1, 1, 1);

    /* ── 안경다리를 만지는 왼손: 책상에서 얼굴 왼쪽으로 올라가 톡 치고 내려온다 ── */
    var tc = this.touch, tk = 0;
    if (tc.phase) {
      if (tc.phase === 'reach') {
        tc.k += dt / (tc.fast ? 0.16 : 0.24);
        if (tc.k >= 1) { tc.k = 1; tc.phase = 'hold'; tc.hold = 0.13; tc.hit = true; }
      } else if (tc.phase === 'hold') {
        tc.hold -= dt;
        if (tc.hold <= 0) tc.phase = 'back';
      } else {
        tc.k -= dt / 0.3;
        if (tc.k <= 0) { tc.k = 0; tc.phase = null; }
      }
      tk = GX.smooth(tc.k);
    }
    if (tk > 0 && pl) {
      /* 눈(카메라) 기준 자리: 시야 왼쪽 가장자리, 손끝이 안경테 높이에 온다. 시야가 좁아지면(숙였을 때) 그만큼 안쪽으로 */
      var hf = pl.tanHalfFov(this.aspect || 1.6) * (this.aspect || 1.6), TP = Exam.TOUCH_POSE;
      var lx = -Math.min(TP.xMax, TP.z * hf * TP.edge);
      var poke = tc.phase === 'hold' ? Math.sin((0.13 - tc.hold) / 0.13 * Math.PI) * 0.012 : 0;
      M4.fromPose(_t, pl.eye[0], pl.eye[1], pl.eye[2], pl.yaw, pl.pitch, 0);
      M4.translate(_t, _t, lx + poke, TP.y, -TP.z);
      M4.rotateY(_t, _t, TP.ry);
      M4.rotateX(_t, _t, TP.rx);
      M4.rotateZ(_t, _t, TP.rz);
      blendPose(this.handL.model, this.handL.model, _t, tk);
    }

    /* ── 팔: 어깨는 눈 아래 양옆, 손목까지 두 마디로 잇는다 ── */
    this.body.visible = show;
    for (i = 0; i < 2; i++) {
      var A = this.arm[i];
      A.up.visible = A.fore.visible = show && !!pl;
      if (!show || !pl) continue;
      var S = A.s, Wp = A.wrist, E = A.e, hd = i ? this.hL : this.hR;
      S[0] = this.dx + A.sgn * 0.19 + (pl.eye[0] - this.dx) * 0.5; S[1] = pl.eye[1] - 0.2; S[2] = pl.eye[2] + 0.075;
      if (i === 0 && penHeld) { Wp[0] = hx + this.penWrist[0] + 0.012; Wp[1] = hy + this.penWrist[1] + 0.002; Wp[2] = hz + this.penWrist[2] + 0.024; }
      else if (i === 1 && tk > 0) M4.point(this.handL.model, 0, 0.018, 0.026, Wp);       /* 안경다리로 올라간 손의 손목 밑동 */
      else {
        /* 손목에서 팔 쪽으로 조금 물러난 점(손 모델의 손목 밑동) */
        var cy = Math.cos(hd.yaw), sy = Math.sin(hd.yaw), cp = Math.cos(hd.pitch), sp = Math.sin(hd.pitch);
        Wp[0] = hd.p[0] + sy * cp * 0.026; Wp[1] = hd.p[1] + 0.018 * cp - sp * 0.026 + 0.0; Wp[2] = hd.p[2] + cy * cp * 0.026;
      }
      _pole[0] = A.sgn; _pole[1] = -0.55; _pole[2] = 0.75;
      GX.elbow(S, Wp, L1, L2, _pole, E);
      M4.aim(A.up.model, S[0], S[1], S[2], E[0], E[1], E[2], 0, 0, -1, 1);
      var dx = Wp[0] - E[0], dy = Wp[1] - E[1], dz = Wp[2] - E[2], fl = Math.sqrt(dx * dx + dy * dy + dz * dz);
      M4.aim(A.fore.model, E[0], E[1], E[2], Wp[0], Wp[1], Wp[2], 0, 1, 0, fl / L2);
    }
  };

  /* 게임 속 합격선: 과목별 40점 이상이면서 평균 60점 이상 */
  function passes(tax, acc) { return tax >= 40 && acc >= 40 && (tax + acc) / 2 >= 60; }
  GX.passes = passes;

  /* 채점. 과목당 100점(문항당 20점).
   * aiWrong: 렌즈가 띄운 답 가운데 틀린 것, aiSure: 그중 자신 있게 틀린 것,
   * aiFooled: 틀린 답을 그대로 따라 적은 것, aiFooledSure: 그중 자신 있게 틀린 답을 따라 적은 것,
   * aiGain: 렌즈의 답을 따라 적어 맞힌 것.
   * 엔딩을 가르는 데 쓰는 '만약에' 점수 두 가지도 함께 낸다:
   *   solo*  렌즈를 따라 적어 맞힌 문항을 뺀 점수(내 힘만으로 받았을 점수)
   *   fix*   렌즈의 틀린 답을 따라 적은 문항이 맞았다고 칠 때의 점수(렌즈가 틀리지만 않았다면) */
  Exam.prototype.score = function () {
    var s = { tax: 0, acc: 0, correct: [], aiUsed: 0, aiFollowed: 0, aiWrong: 0, aiSure: 0, aiFooled: 0, aiFooledSure: 0, aiGain: 0, own: 0, answered: 0 };
    var solo = { tax: 0, acc: 0 }, fix = { tax: 0, acc: 0 };
    for (var i = 0; i < 10; i++) {
      var q = this.qs[i], ok = this.answers[i] === q.answer;
      var copied = this.scanned[i] && this.answers[i] === q.ai.pick;       /* 렌즈가 띄운 답과 같은 답을 적었다 */
      s.correct.push(ok);
      if (this.answers[i] >= 0) s.answered++;
      if (ok) s[q.subj] += 20;
      if (ok && !copied) solo[q.subj] += 20;
      if (ok || (copied && q.ai.wrong)) fix[q.subj] += 20;
      if (this.scanned[i]) {
        s.aiUsed++;
        if (q.ai.wrong) s.aiWrong++;
        if (q.ai.kind === 'sure') s.aiSure++;
        if (copied) { s.aiFollowed++; if (ok) s.aiGain++; if (q.ai.wrong) s.aiFooled++; if (q.ai.kind === 'sure') s.aiFooledSure++; }
      }
      if (ok && !this.scanned[i]) s.own++;
    }
    s.avg = (s.tax + s.acc) / 2;
    s.pass = passes(s.tax, s.acc);
    s.soloTax = solo.tax; s.soloAcc = solo.acc; s.soloAvg = (solo.tax + solo.acc) / 2; s.soloPass = passes(solo.tax, solo.acc);
    s.fixTax = fix.tax; s.fixAcc = fix.acc; s.fixAvg = (fix.tax + fix.acc) / 2; s.fixPass = passes(fix.tax, fix.acc);
    return s;
  };

  Exam.prototype.dispose = function () {
    var e = this.eng, i;
    /* 메시를 함께 쓰는 항목은 한 번만 지운다 */
    var own = [this.book, this.leafF, this.leafB, this.stack, this.omr, this.scanLine, this.idCard, this.ticket, this.watch, this.watchH, this.watchM,
      this.phone, this.hand, this.handL, this.pen, this.arm[0].up, this.arm[0].fore, this.body];
    var shared = [this.ar, this.handR, this.arm[1].up, this.arm[1].fore];
    for (i = 0; i < own.length; i++) { e.remove(own[i]); e.destroyMesh(own[i].mesh); }
    for (i = 0; i < shared.length; i++) e.remove(shared[i]);
    e.destroyTexture(this.pageTex[0]); e.destroyTexture(this.pageTex[1]); e.destroyTexture(this.omrTex); e.destroyTexture(this.arTex);
  };

  /* 안경다리를 만질 때의 왼손 자세(눈 기준). z: 눈앞 거리, edge: 시야 반폭의 몇 할 지점에 손목을 두는가,
     y: 눈높이에서 손목까지, rx·ry·rz: 손의 방향(손끝이 위로, 손바닥이 얼굴 쪽으로) */
  Exam.TOUCH_POSE = { z: 0.28, edge: 0.8, xMax: 0.2, y: -0.12, rx: 1.75, ry: 0, rz: 0.9 };

  GX.Exam = Exam;
  GX.CIRC = CIRC;
})(window.GX = window.GX || {});
