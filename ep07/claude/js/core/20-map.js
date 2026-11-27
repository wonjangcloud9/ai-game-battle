/* 해돌전쟁 — 맵 생성기
   네 귀퉁이가 똑같은(좌우·상하 대칭) 맵을 씨앗값으로 만들어 낸다. */
'use strict';
(function (g) {
  var R = g.RTS;
  var T_GROUND = R.T_GROUND, T_WATER = R.T_WATER, T_ROCK = R.T_ROCK, T_TREE = R.T_TREE;

  R.MAP_SIZES = { small: 72, medium: 96, large: 120 };
  R.MAP_SIZE_NAMES = { small: '작은 맵', medium: '보통 맵', large: '큰 맵' };

  R.generateMap = function (opts) {
    var size = R.MAP_SIZES[opts.size] || 96;
    var W = size, H = size, Q = size >> 1;
    var seed = (opts.seed >>> 0) || 1;
    var noise = R.makeNoise(seed), noise2 = R.makeNoise(seed ^ 0x5bd1e995), rng = R.makeRng(seed);
    var q = new Uint8Array(Q * Q);
    var ox = rng.range(0, 200), oy = rng.range(0, 200);
    var x, y, i;

    // 1) 바위·숲·물을 노이즈로 흩뿌린다
    for (y = 0; y < Q; y++) {
      for (x = 0; x < Q; x++) {
        var rv = noise.fbm((x + ox) * 0.105, (y + oy) * 0.105, 4);
        var wv = noise2.fbm((x + ox) * 0.075, (y + oy) * 0.075, 3);
        var biome = noise2.fbm((x + oy) * 0.045 + 40, (y + ox) * 0.045 + 40, 2);
        var t = T_GROUND;
        if (rv > 0.6) t = biome > 0.5 ? T_TREE : T_ROCK;
        else if (wv > 0.62) t = T_WATER;
        q[y * Q + x] = t;
      }
    }

    function clearCircle(cx, cy, rad) {
      var x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(Q - 1, Math.ceil(cx + rad));
      var y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(Q - 1, Math.ceil(cy + rad));
      for (var yy = y0; yy <= y1; yy++) for (var xx = x0; xx <= x1; xx++) {
        var dx = xx + 0.5 - cx, dy = yy + 0.5 - cy;
        if (dx * dx + dy * dy <= rad * rad) q[yy * Q + xx] = T_GROUND;
      }
    }
    function carve(ax, ay, bx, by, rad, amp, salt) {
      var len = R.dist(ax, ay, bx, by), steps = Math.ceil(len * 2);
      var nx = -(by - ay) / len, ny = (bx - ax) / len;
      for (var s = 0; s <= steps; s++) {
        var tt = s / steps;
        var wob = (noise(tt * 3.1 + salt * 17.3, salt * 5.7) - 0.5) * 2 * amp * Math.sin(Math.PI * tt);
        clearCircle(ax + (bx - ax) * tt + nx * wob, ay + (by - ay) * tt + ny * wob, rad);
      }
    }

    // 2) 거점 (사분면 좌표, 타일 모서리 기준)
    var natX = R.clamp(Math.round(Q * 0.72), 26, 36);
    var sMain = { kind: 'main', cx: 12, cy: 12, back: Math.atan2(-1, -1) };
    var sNat = { kind: 'natural', cx: natX, cy: 11, back: -Math.PI / 2 };
    var sThird = { kind: 'third', cx: 11, cy: natX, back: Math.PI };
    clearCircle(sMain.cx, sMain.cy, 11.5);
    clearCircle(sNat.cx, sNat.cy, 8.2);
    clearCircle(sThird.cx, sThird.cy, 8.2);
    clearCircle(Q, Q, 10);
    carve(sMain.cx, sMain.cy, sNat.cx, sNat.cy, 2.3, 1.5, 1);
    carve(sMain.cx, sMain.cy, sThird.cx, sThird.cy, 2.3, 1.5, 2);
    carve(sNat.cx, sNat.cy, Q, Q, 2.2, 3, 3);
    carve(sThird.cx, sThird.cy, Q, Q, 2.2, 3, 4);
    carve(sMain.cx, sMain.cy, Q, Q, 2.4, 4.5, 5);
    // 이웃 사분면으로 넘어가는 가장자리 길
    carve(sNat.cx, sNat.cy, Q, sNat.cy + 2, 2.0, 1.5, 6);
    carve(sThird.cx, sThird.cy, sThird.cx + 2, Q, 2.0, 1.5, 7);

    // 3) 맵 테두리
    for (y = 0; y < Q; y++) for (x = 0; x < Q; x++) {
      if (x < 2 || y < 2) {
        var bz = noise2.fbm((x + oy) * 0.045 + 40, (y + ox) * 0.045 + 40, 2);
        q[y * Q + x] = bz > 0.5 ? T_TREE : T_ROCK;
      }
    }

    // 4) 자원 노드 (사분면 좌표)
    var qNodes = [];   // {kind, tx, ty, site}
    var used = {};
    function putNode(kind, tx, ty, siteIdx) {
      var s = R.NODES[kind].size;
      for (var yy = 0; yy < s; yy++) for (var xx = 0; xx < s; xx++) {
        if (used[(tx + xx) + ',' + (ty + yy)]) return false;
        if (tx + xx < 2 || ty + yy < 2 || tx + xx >= Q || ty + yy >= Q) return false;
      }
      for (yy = -1; yy <= s; yy++) for (xx = -1; xx <= s; xx++) {
        var ax = tx + xx, ay = ty + yy;
        if (ax >= 0 && ay >= 0 && ax < Q && ay < Q && q[ay * Q + ax] !== T_GROUND) q[ay * Q + ax] = T_GROUND;
      }
      for (yy = 0; yy < s; yy++) for (xx = 0; xx < s; xx++) used[(tx + xx) + ',' + (ty + yy)] = 1;
      qNodes.push({ kind: kind, tx: tx, ty: ty, site: siteIdx });
      return true;
    }
    function arc(site, siteIdx, kind, count, radius, stepDeg) {
      for (var k = 0; k < count; k++) {
        var a = site.back + (k - (count - 1) / 2) * stepDeg * Math.PI / 180;
        var rr = radius, ok = false, tries = 0;
        while (!ok && tries < 4) {
          ok = putNode(kind, Math.floor(site.cx + Math.cos(a) * rr), Math.floor(site.cy + Math.sin(a) * rr), siteIdx);
          rr += 1; tries++;
        }
      }
    }
    function dewAt(site, siteIdx, angOff, radius) {
      var a = site.back + angOff * Math.PI / 180;
      putNode('dew', Math.floor(site.cx + Math.cos(a) * radius - 1), Math.floor(site.cy + Math.sin(a) * radius - 1), siteIdx);
    }
    arc(sMain, 0, 'sun', 8, 6.3, 19);
    dewAt(sMain, 0, 108, 6.7);
    dewAt(sMain, 0, -108, 6.7);
    arc(sNat, 1, 'sun', 6, 5.8, 22);
    dewAt(sNat, 1, 105, 6.4);
    arc(sThird, 2, 'sun', 6, 5.8, 22);
    dewAt(sThird, 2, -105, 6.4);
    // 중앙 거점의 사분면 몫: 큰 해돌 2개 (네 번 대칭 복사되어 8개)
    putNode('sunRich', Q - 2, Q - 7, 3);
    putNode('sunRich', Q - 5, Q - 6, 3);

    // 5) 지상 연결 확인 — 끊겨 있으면 곧은 길을 다시 뚫는다
    function connected() {
      var seen = new Uint8Array(Q * Q), stack = [sMain.cy * Q + sMain.cx + 3 * Q + 3];
      // 본진 앞마당 쪽 빈 칸에서 시작
      var start = -1;
      for (var d = 3; d < 9 && start < 0; d++) { var c = (sMain.cy + d) * Q + (sMain.cx + d); if (q[c] === T_GROUND && !used[(sMain.cx + d) + ',' + (sMain.cy + d)]) start = c; }
      if (start < 0) return false;
      stack = [start]; seen[start] = 1;
      while (stack.length) {
        var c2 = stack.pop(), cx2 = c2 % Q, cy2 = (c2 / Q) | 0;
        var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var k = 0; k < 4; k++) {
          var nx2 = cx2 + nb[k][0], ny2 = cy2 + nb[k][1];
          if (nx2 < 0 || ny2 < 0 || nx2 >= Q || ny2 >= Q) continue;
          var ni = ny2 * Q + nx2;
          if (seen[ni] || q[ni] !== T_GROUND || used[nx2 + ',' + ny2]) continue;
          seen[ni] = 1; stack.push(ni);
        }
      }
      function ok(cx3, cy3) {
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
          var xx = cx3 + dx, yy = cy3 + dy;
          if (xx >= 0 && yy >= 0 && xx < Q && yy < Q && seen[yy * Q + xx]) return true;
        }
        return false;
      }
      return ok(sNat.cx, sNat.cy + 3) && ok(sThird.cx + 3, sThird.cy) && ok(Q - 2, Q - 2) && ok(Q - 1, sNat.cy + 2) && ok(sThird.cx + 2, Q - 1);
    }
    function reopenNodes() { /* 길을 다시 뚫어도 노드 칸은 그대로 */ }
    if (!connected()) {
      carve(sMain.cx + 3, sMain.cy + 3, sNat.cx, sNat.cy + 3, 2.2, 0, 8);
      carve(sMain.cx + 3, sMain.cy + 3, sThird.cx + 3, sThird.cy, 2.2, 0, 9);
      carve(sMain.cx + 3, sMain.cy + 3, Q - 1, Q - 1, 2.4, 0, 10);
      carve(sNat.cx, sNat.cy + 3, Q - 1, sNat.cy + 2, 2.0, 0, 11);
      carve(sThird.cx + 3, sThird.cy, sThird.cx + 2, Q - 1, 2.0, 0, 12);
      reopenNodes();
    }

    // 6) 네 사분면으로 대칭 복사
    var terrain = new Uint8Array(W * H);
    for (y = 0; y < Q; y++) for (x = 0; x < Q; x++) {
      var v = q[y * Q + x];
      terrain[y * W + x] = v;
      terrain[y * W + (W - 1 - x)] = v;
      terrain[(H - 1 - y) * W + x] = v;
      terrain[(H - 1 - y) * W + (W - 1 - x)] = v;
    }

    var sites = [], nodes = [], mains = [];
    var qSites = [sMain, sNat, sThird];
    for (var quad = 0; quad < 4; quad++) {
      var fx = (quad & 1) === 1, fy = (quad & 2) === 2;
      var base = sites.length;
      for (i = 0; i < qSites.length; i++) {
        var s0 = qSites[i];
        sites.push({ id: sites.length, kind: s0.kind, quad: quad, cx: fx ? W - s0.cx : s0.cx, cy: fy ? H - s0.cy : s0.cy, nodes: [] });
      }
      mains.push(base);
      for (i = 0; i < qNodes.length; i++) {
        var n0 = qNodes[i], ns = R.NODES[n0.kind].size;
        nodes.push({
          kind: n0.kind,
          tx: fx ? W - ns - n0.tx : n0.tx,
          ty: fy ? H - ns - n0.ty : n0.ty,
          site: n0.site === 3 ? -1 : base + n0.site
        });
      }
    }
    // 중앙 거점
    var centerId = sites.length;
    sites.push({ id: centerId, kind: 'center', quad: -1, cx: Q, cy: Q, nodes: [] });
    nodes.push({ kind: 'dew', tx: Q - 8, ty: Q - 1, site: centerId });
    nodes.push({ kind: 'dew', tx: Q + 6, ty: Q - 1, site: centerId });
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i].site < 0) nodes[i].site = centerId;
      // 노드 주변은 반드시 평지
      var nn = nodes[i], sz = R.NODES[nn.kind].size;
      for (y = -1; y <= sz; y++) for (x = -1; x <= sz; x++) {
        var ax2 = nn.tx + x, ay2 = nn.ty + y;
        if (ax2 >= 0 && ay2 >= 0 && ax2 < W && ay2 < H && terrain[ay2 * W + ax2] !== T_GROUND && !(ax2 < 2 || ay2 < 2 || ax2 >= W - 2 || ay2 >= H - 2)) terrain[ay2 * W + ax2] = T_GROUND;
      }
      sites[nn.site].nodes.push(i);
    }

    return { w: W, h: H, size: opts.size, seed: seed, terrain: terrain, sites: sites, nodes: nodes, mains: mains };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
