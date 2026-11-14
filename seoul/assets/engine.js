    (function () {
      THREE.ColorManagement.legacyMode = false;
      const S2 = window.S2;
      const bytes = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
      const F = (b64) => new Float32Array(bytes(b64));
      const U = (b64) => new Uint32Array(bytes(b64));
      const hash = (i) => { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
      const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
      const lerp = (a, b, k) => a + (b - a) * k;

      // ---------- renderer / scene ----------
      const canvas = document.getElementById("gl");
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
      renderer.setPixelRatio(1); renderer.setSize(1920, 1080, false);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = true;
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xcfc6b2, 4000, 42000);
      const camera = new THREE.PerspectiveCamera(42, 1920 / 1080, 2, 120000);
      const SH = { uYear: { value: 1394 }, uNight: { value: 0 }, uDay: { value: 1 }, uT: { value: 0 } };   // shared uniforms

      // ---------- terrain ----------
      const G = S2.grid, Z = F(G.z);
      function th(x, yn) {   // terrain height at local meters (x east, yn north)
        let u = (x - G.x0) / (G.x1 - G.x0) * (G.w - 1), v = (G.y1 - yn) / (G.y1 - G.y0) * (G.h - 1);
        u = Math.min(Math.max(u, 0), G.w - 1.001); v = Math.min(Math.max(v, 0), G.h - 1.001);
        const i = Math.floor(v), j = Math.floor(u), fu = u - j, fv = v - i;
        return Z[i * G.w + j] * (1 - fu) * (1 - fv) + Z[i * G.w + j + 1] * fu * (1 - fv) + Z[(i + 1) * G.w + j] * (1 - fu) * fv + Z[(i + 1) * G.w + j + 1] * fu * fv;
      }
      const tg = new THREE.PlaneGeometry(G.x1 - G.x0, G.y1 - G.y0, G.w - 1, G.h - 1);
      tg.rotateX(-Math.PI / 2);
      const tp = tg.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const c = i % G.w, r = Math.floor(i / G.w);
        tp.setX(i, G.x0 + (c / (G.w - 1)) * (G.x1 - G.x0));
        tp.setZ(i, -(G.y1 - (r / (G.h - 1)) * (G.y1 - G.y0)));
        const ed = Math.min(c, r, G.w - 1 - c, G.h - 1 - r) / (0.06 * G.w);
        tp.setY(i, Z[r * G.w + c] * (ed >= 1 ? 1 : ed * ed * (3 - 2 * ed)));
      }
      tg.computeVertexNormals();
      const loader = new THREE.TextureLoader();
      let groundTex, urbanTex;
      const ready = Promise.all([
        new Promise((res) => { groundTex = loader.load("assets/ground2.jpg", res); }),
        new Promise((res) => { urbanTex = loader.load("assets/urban.png", res); }),
      ]);
      groundTex.encoding = THREE.sRGBEncoding; groundTex.anisotropy = 16;
      const NOISE = `
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ return 0.5*vn(p) + 0.25*vn(p*2.03) + 0.125*vn(p*4.01) + 0.125*vn(p*8.07); }`;
      const terrainMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0, envMapIntensity: 0.9 });
      terrainMat.onBeforeCompile = (s) => {
        s.uniforms.uU = { value: urbanTex }; s.uniforms.uYear = SH.uYear; s.uniforms.uNight = SH.uNight;
        s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
          .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
        s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vWP; uniform sampler2D uU; uniform float uYear; uniform float uNight; float vWaterF = 0.0;\n${NOISE}`)
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.68, vWaterF);")
          .replace("#include <map_fragment>", `#include <map_fragment>
            vec3 uu = texture2D(uU, vUv).rgb; float yr = 1950.0 + uu.g * 80.0;
            float amt = uu.r * smoothstep(yr - 3.0, yr + 7.0, uYear);
            float n1 = fbm(vWP.xz * 0.11), n2 = fbm(vWP.xz * 0.9);
            float water = clamp((diffuseColor.b - diffuseColor.g) * 60.0, 0.0, 1.0);
            diffuseColor.rgb *= (0.86 + 0.22 * n1 + 0.08 * n2) * 0.64;
            { float forest = clamp((diffuseColor.g - diffuseColor.r) * 9.0, 0.0, 1.0);
              // paddies: bent rows (domain warp) and a different row direction per district, so it never reads as a checkerboard
              vec2 wp = vWP.xz;
              vec2 wv = vec2(fbm(wp * 0.0032), fbm(wp * 0.0032 + 17.3)) - 0.5;
              float dist = fbm(wp * 0.00042 + 5.1);
              vec2 q = dist < 0.42 ? mat2(0.92, 0.39, -0.39, 0.92) * wp : dist < 0.58 ? mat2(0.57, -0.82, 0.82, 0.57) * wp : mat2(0.99, -0.12, 0.12, 0.99) * wp;
              q += wv * 140.0;
              vec2 cs = dist < 0.42 ? vec2(64.0, 38.0) : dist < 0.58 ? vec2(90.0, 30.0) : vec2(52.0, 46.0);
              vec2 cell = floor(q / cs); float hc = h21(cell + floor(dist * 3.0) * 31.0);
              vec2 fq = fract(q / cs); float edge = smoothstep(0.0, 0.05, min(min(fq.x, 1.0 - fq.x), min(fq.y, 1.0 - fq.y)));
              vec3 fcol = hc < 0.35 ? vec3(0.20, 0.24, 0.11) : hc < 0.6 ? vec3(0.27, 0.27, 0.13) : hc < 0.82 ? vec3(0.30, 0.26, 0.14) : vec3(0.25, 0.23, 0.16);
              fcol *= 0.86 + 0.28 * n2 + 0.06 * sin(fq.y * 40.0); fcol = mix(fcol * 0.8, fcol, edge);
              diffuseColor.rgb = mix(diffuseColor.rgb, fcol, (1.0 - forest) * (1.0 - water) * 0.55); }
            vec3 paved = vec3(0.17, 0.165, 0.16) * (0.8 + 0.3 * n1 + 0.15 * n2);
            diffuseColor.rgb = mix(diffuseColor.rgb, paved, amt * 0.9 * (1.0 - water));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018, 0.045, 0.06) * (0.9 + 0.2 * n2), water);
            vWaterF = water;
            float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
            diffuseColor.rgb = mix(vec3(0.55, 0.52, 0.42), diffuseColor.rgb, smoothstep(0.0, 0.05, e));`)
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
            totalEmissiveRadiance += vec3(1.0, 0.62, 0.30) * amt * uNight * 0.010 * (0.6 + n2) * (1.0 - vWaterF);`);
      };
      const terrain = new THREE.Mesh(tg, terrainMat); terrain.receiveShadow = true; scene.add(terrain);
      const skirt = new THREE.Mesh(new THREE.PlaneGeometry(500000, 500000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8c8466, roughness: 1 }));
      skirt.position.y = -6; scene.add(skirt);

      // ---------- geometry builder ----------
      class GB {
        constructor(cap, extra) { this.n = 0; this.cap = cap; this.P = new Float32Array(cap * 3); this.C = new Float32Array(cap * 3);
          this.X = new Float32Array(cap * 4); this.K = new Float32Array(cap); this.I = []; this.col = [1, 1, 1]; this.x = [0, 0, 0, 0]; this.k = 0; }
        grow() { const c = this.cap * 2; for (const k of ["P", "C"]) { const a = new Float32Array(c * 3); a.set(this[k]); this[k] = a; }
          const a = new Float32Array(c * 4); a.set(this.X); this.X = a; const k = new Float32Array(c); k.set(this.K); this.K = k; this.cap = c; }
        v(x, y, z, w) { if (this.n >= this.cap) this.grow(); const n = this.n;
          this.P[n * 3] = x; this.P[n * 3 + 1] = y; this.P[n * 3 + 2] = z;
          this.C[n * 3] = this.col[0]; this.C[n * 3 + 1] = this.col[1]; this.C[n * 3 + 2] = this.col[2];
          this.X[n * 4] = this.x[0]; this.X[n * 4 + 1] = this.x[1]; this.X[n * 4 + 2] = this.x[2]; this.X[n * 4 + 3] = w === undefined ? this.x[3] : w; this.K[n] = this.k;
          return this.n++; }
        quad(a, b, c, d) { this.I.push(a, b, c, a, c, d); }
        tri(a, b, c) { this.I.push(a, b, c); }
        geo() { const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(this.P.subarray(0, this.n * 3), 3));
          g.setAttribute("color", new THREE.BufferAttribute(this.C.subarray(0, this.n * 3), 3));
          g.setAttribute("aX", new THREE.BufferAttribute(this.X.subarray(0, this.n * 4), 4));
          g.setAttribute("aK", new THREE.BufferAttribute(this.K.subarray(0, this.n), 1));
          g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
          g.computeVertexNormals(); return g; }
      }
      const C3 = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
      const shadeC = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

      // ---------- traditional buildings: palace halls, houses, walls (one mesh; aX = base, yearStart, yearEnd, tile) ----------
      const HB = new GB(1 << 20);
      function frame(cx, cy, ang) { const ca = Math.cos(ang), sa = Math.sin(ang);
        return (u, v, h) => [cx + u * ca - v * sa, h, -(cy + u * sa + v * ca)]; }
      function boxL(W, hl, hw, y0, y1, col) {        // box in a local frame
        HB.col = col;
        const p = [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]];
        for (let k = 0; k < 4; k++) {
          const a = W(p[k][0], p[k][1], y0), b = W(p[(k + 1) % 4][0], p[(k + 1) % 4][1], y0);
          const c = W(p[(k + 1) % 4][0], p[(k + 1) % 4][1], y1), d = W(p[k][0], p[k][1], y1);
          HB.quad(HB.v(...a, -9999), HB.v(...b, -9999), HB.v(...c, -9999), HB.v(...d, -9999));
        }
        const t = p.map((q) => W(q[0], q[1], y1));
        HB.quad(HB.v(...t[0], -9999), HB.v(...t[1], -9999), HB.v(...t[2], -9999), HB.v(...t[3], -9999));
      }
      // hip-and-gable style roof with up-swept corners and a sagging slope
      function roofL(W, a, b, yb, hr, curve, sag, col, n, thatch) {
        HB.col = col;
        const r = Math.max(a - b * (thatch ? 1.05 : 0.85), a * 0.18);
        const lift = (s) => curve * Math.pow(Math.abs(2 * s - 1), 3.2);
        // front (v=+b) and back (v=-b)
        for (const sg of [1, -1]) {
          const E = [], M = [], R = [];
          for (let i = 0; i <= n; i++) {
            const s = i / n, l = lift(s), u = lerp(-a, a, s) * (1 + 0.03 * l);
            const ru = lerp(-r, r, s);
            E.push(HB.v(...W(u, sg * (b + 0.25 * l), yb + l), thatch ? -5000 : u));
            M.push(HB.v(...W(lerp(u, ru, 0.5), sg * b * 0.5, yb + hr * (0.5 - sag) + l * 0.35), thatch ? -5000 : u));
            R.push(HB.v(...W(ru, 0, yb + hr + 0.2 * l), thatch ? -5000 : u));
          }
          for (let i = 0; i < n; i++) { HB.quad(E[i], E[i + 1], M[i + 1], M[i]); HB.quad(M[i], M[i + 1], R[i + 1], R[i]); }
        }
        // sides (u=±a): fan to the ridge end, through a sagging mid row
        for (const sg of [1, -1]) {
          const apex = HB.v(...W(sg * r, 0, yb + hr), thatch ? -5000 : 0);
          const E = [], M = [];
          for (let i = 0; i <= n; i++) {
            const s = i / n, l = lift(s), v = lerp(-b, b, s) * (1 + 0.03 * l);
            E.push(HB.v(...W(sg * (a + 0.25 * l), v, yb + l), thatch ? -5000 : v));
            M.push(HB.v(...W(sg * lerp(a, r, 0.5), v * 0.5, yb + hr * (0.5 - sag) + l * 0.35), thatch ? -5000 : v));
          }
          for (let i = 0; i < n; i++) { HB.quad(E[i], E[i + 1], M[i + 1], M[i]); HB.tri(M[i], M[i + 1], apex); }
        }
        // ridge cap
        if (!thatch) boxL((u, v, h) => W(u, v, h), r + 0.4, 0.35, yb + hr - 0.1, yb + hr + 0.55, shadeC(col, 1.9));
      }
      const STONE = C3("#8e887c"), RED = C3("#7a2a20"), GREEN = C3("#2c6656"), TILE = C3("#3b3e44"), PLASTER = C3("#d9cfbb"),
            WOOD = C3("#5a4030"), THATCH = C3("#a88a57"), WALLRED = C3("#9a4a34");
      function hall(cx, cy, L, Wd, ang, g0, kind, yr, yEnd) {
        const W = frame(cx, cy, ang);
        HB.x = [g0, yr, yEnd, -1]; HB.k = 1;
        if (kind === 6) {            // Jongmyo shrine hall: vast low stone terrace, long plain roof
          boxL(W, L / 2 + 8, Wd / 2 + 26, g0 - 2, g0 + 1.2, STONE);
          boxL(W, L / 2 + 1.2, Wd / 2 + 1.2, g0 + 1.2, g0 + 2.0, STONE);
          boxL(W, L / 2 - 0.4, Wd / 2 - 0.4, g0 + 2.0, g0 + 6.8, C3("#5e2a22"));
          roofL(W, L / 2 + 2.2, Wd / 2 + 2.6, g0 + 6.8, 0.44 * Wd + 0.6, 0.5, 0.06, TILE, 24, false);
          return;
        }
        if (kind === 8 || kind === 9) {   // city gate: stone base with one arch, pavilion on top (two-storey for the great gates)
          const bh = kind === 9 ? 8.2 : 6.0;
          boxL(W, L / 2, Wd / 2, g0 - 1.5, g0 + bh, STONE);
          boxL(W, 2.6, Wd / 2 + 0.05, g0 - 0.5, g0 + bh * 0.62, C3("#2b2622"));
          const yb = g0 + bh;
          boxL(W, L * 0.34, Wd * 0.36, yb, yb + 4.2, RED);
          boxL(W, L * 0.345, Wd * 0.365, yb + 3.5, yb + 4.2, GREEN);
          if (kind === 9) {
            roofL(W, L * 0.42, Wd * 0.50, yb + 4.2, 1.8, 0.6, 0.0, TILE, 12, false);
            boxL(W, L * 0.30, Wd * 0.30, yb + 5.2, yb + 8.4, RED);
            roofL(W, L * 0.39, Wd * 0.46, yb + 8.4, 0.42 * Wd, 1.2, 0.12, TILE, 14, false);
          } else roofL(W, L * 0.40, Wd * 0.50, yb + 4.2, 0.38 * Wd, 0.9, 0.12, TILE, 12, false);
          return;
        }
        if (kind === 7) kind = 1;
        if (kind === 5) {            // cloister corridors along the four sides
          const cw = 5.6, hl = L / 2 - cw / 2 - 1, hw = Wd / 2 - cw / 2 - 1;
          for (const [ox, oy, len, rot] of [[0, hw, hl, 0], [0, -hw, hl, 0], [hl, 0, hw, Math.PI / 2], [-hl, 0, hw, Math.PI / 2]]) {
            const Wc = (u, v, h) => { const cr = Math.cos(rot), sr = Math.sin(rot); return W(ox + u * cr - v * sr, oy + u * sr + v * cr, h); };
            boxL(Wc, len + cw / 2, cw / 2 + 0.6, g0 - 1, g0 + 0.6, STONE);
            boxL(Wc, len + cw / 2 - 0.4, cw / 2 - 0.5, g0 + 0.6, g0 + 3.3, RED);
            roofL(Wc, len + cw / 2 + 0.6, cw / 2 + 0.9, g0 + 3.3, 2.4, 0.25, 0.08, TILE, 10, false);
          }
          return;
        }
        if (kind === 2) {            // Geunjeongjeon: two-tier stone terrace, double roof
          boxL(W, L / 2 + 22, Wd / 2 + 26, g0 - 2, g0 + 1.3, STONE);
          boxL(W, L / 2 + 12, Wd / 2 + 14, g0 + 1.3, g0 + 2.6, STONE);
          boxL(W, L / 2 + 1.5, Wd / 2 + 1.5, g0 + 2.6, g0 + 3.6, STONE);
          const yb = g0 + 3.6;
          boxL(W, L / 2 - 0.6, Wd / 2 - 0.6, yb, yb + 6.0, RED);
          boxL(W, L / 2 - 0.5, Wd / 2 - 0.5, yb + 5.2, yb + 6.0, GREEN);
          roofL(W, L / 2 + 2.6, Wd / 2 + 2.6, yb + 6.0, 2.6, 0.9, 0.0, TILE, 12, false);   // lower skirt roof
          boxL(W, L / 2 - 3.2, Wd / 2 - 3.2, yb + 7.2, yb + 11.4, RED);
          boxL(W, L / 2 - 3.1, Wd / 2 - 3.1, yb + 10.6, yb + 11.4, GREEN);
          roofL(W, L / 2 + 1.2, Wd / 2 + 1.2, yb + 11.4, 0.42 * Wd, 1.6, 0.12, TILE, 14, false);
          return;
        }
        if (kind === 4) {            // Gwanghwamun: stone base with arches + double-roof pavilion
          boxL(W, L / 2, Wd / 2, g0 - 1, g0 + 8.6, STONE);
          for (const off of [-9, 0, 9]) boxL((uu, vv, hh) => W(uu + off, vv, hh), off === 0 ? 2.6 : 2.1, Wd / 2 + 0.05, g0, g0 + (off === 0 ? 6.0 : 5.0), C3("#2b2622"));
          const yb = g0 + 8.6;
          boxL(W, L * 0.30, Wd * 0.36, yb, yb + 4.4, RED);
          roofL(W, L * 0.36, Wd * 0.48, yb + 4.4, 1.8, 0.6, 0.0, TILE, 12, false);
          boxL(W, L * 0.27, Wd * 0.30, yb + 5.4, yb + 8.4, RED);
          roofL(W, L * 0.33, Wd * 0.44, yb + 8.4, 0.40 * Wd, 1.2, 0.12, TILE, 14, false);
          return;
        }
        if (kind === 3) {            // Gyeonghoeru: on 48 stone pillars over the pond
          for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) {
            const u = lerp(-L / 2 + 2, L / 2 - 2, i / 7), v = lerp(-Wd / 2 + 2, Wd / 2 - 2, j / 5);
            boxL((uu, vv, h) => W(u + uu, v + vv, h), 0.6, 0.6, g0 - 2, g0 + 5.0, STONE);
          }
          boxL(W, L / 2, Wd / 2, g0 + 5.0, g0 + 5.8, WOOD);
          boxL(W, L / 2 - 0.8, Wd / 2 - 0.8, g0 + 5.8, g0 + 9.6, RED);
          boxL(W, L / 2 - 0.7, Wd / 2 - 0.7, g0 + 8.9, g0 + 9.6, GREEN);
          roofL(W, L / 2 + 3.2, Wd / 2 + 3.2, g0 + 9.6, 0.40 * Wd, 1.5, 0.12, TILE, 14, false);
          return;
        }
        // ordinary hall
        const eave = Math.min(Math.max(0.26 * Wd + 2.6, 4.2), 8.5), o = 0.14 * Wd + 0.9;
        boxL(W, L / 2 + 1.4, Wd / 2 + 1.4, g0 - 1.5, g0 + 1.0, STONE);
        boxL(W, L / 2 - 0.4, Wd / 2 - 0.4, g0 + 1.0, g0 + 1.0 + eave, RED);
        boxL(W, L / 2 - 0.3, Wd / 2 - 0.3, g0 + 0.3 + eave, g0 + 1.0 + eave, GREEN);
        roofL(W, L / 2 + o, Wd / 2 + o, g0 + 1.0 + eave, 0.40 * Wd + 0.4, 0.06 * Wd + 0.45, 0.11, TILE, 12, false);
      }
      function house(cx, cy, L, Wd, ang, g0, y0, y1, i) {
        const W = frame(cx, cy, ang), thatch = hash(i * 3.1) < 0.55;
        HB.x = [g0, y0, y1, -1];
        boxL(W, L / 2 + 0.3, Wd / 2 + 0.3, g0 - 1.2, g0 + 0.45, STONE);
        boxL(W, L / 2 - 0.5, Wd / 2 - 0.5, g0 + 0.45, g0 + 2.9, shadeC(PLASTER, 0.9 + 0.15 * hash(i)));
        if (thatch) roofL(W, L / 2 + 0.45, Wd / 2 + 0.45, g0 + 2.9, 0.5 * Wd + 0.3, 0.0, -0.06, shadeC(THATCH, 0.85 + 0.25 * hash(i * 7.7)), 4, true);
        else roofL(W, L / 2 + 0.7, Wd / 2 + 0.7, g0 + 2.9, 0.40 * Wd + 0.4, 0.35, 0.09, shadeC(TILE, 0.9 + 0.2 * hash(i * 5.3)), 4, false);
      }
      const HA = F(S2.hall.a);
      for (let i = 0; i < S2.hall.n; i++) { const o = i * 9; hall(HA[o], HA[o + 1], HA[o + 2], HA[o + 3], HA[o + 4], HA[o + 5], Math.round(HA[o + 6]), HA[o + 7], HA[o + 8]); }
      HB.k = 0;
      const RA = F(S2.roof.a);
      for (let i = 0; i < S2.roof.n; i++) { const o = i * 9; house(RA[o], RA[o + 1], RA[o + 2], RA[o + 3], RA[o + 4], RA[o + 5], RA[o + 7], RA[o + 8], i); }
      // Hanyang wall (stone, built in 1396 around the ridges)
      const WA = F(S2.wall.a);
      for (let i = 0; i < S2.wall.n; i++) {
        const o = i * 8, ax = WA[o], ay = WA[o + 1], bx = WA[o + 2], by = WA[o + 3], g = Math.min(WA[o + 4], WA[o + 5]), gm = Math.max(WA[o + 4], WA[o + 5]);
        const len = Math.hypot(bx - ax, by - ay); if (len < 0.5) continue;
        HB.x = [g, 1396.0 + WA[o + 6] * 0.9, WA[o + 7], -1];
        boxL(frame((ax + bx) / 2, (ay + by) / 2, Math.atan2(by - ay, bx - ax)), len / 2 + 0.6, 2.2, g - 3, gm + 6.5, shadeC(STONE, 0.95));
      }
      // glowing route ribbon over the Hanyang wall (for wide shots while it is built)
      const wgP = [], wgF = [], wgE = [], wgI = []; let wgn = 0;
      for (let i = 0; i < S2.wall.n; i++) {
        const o = i * 8, ax = WA[o], ay = WA[o + 1], bx = WA[o + 2], by = WA[o + 3], ga = WA[o + 4], gb = WA[o + 5];
        const len = Math.hypot(bx - ax, by - ay); if (len < 0.5) continue;
        const px = -(by - ay) / len * 14, py = (bx - ax) / len * 14;
        wgP.push(ax + px, ga + 14, -(ay + py), ax - px, ga + 14, -(ay - py), bx - px, gb + 14, -(by - py), bx + px, gb + 14, -(by + py));
        for (let k = 0; k < 4; k++) { wgF.push(WA[o + 6]); wgE.push(WA[o + 7]); }
        wgI.push(wgn, wgn + 1, wgn + 2, wgn, wgn + 2, wgn + 3); wgn += 4;
      }
      const wgG = new THREE.BufferGeometry();
      wgG.setAttribute("position", new THREE.Float32BufferAttribute(wgP, 3));
      wgG.setAttribute("aF", new THREE.Float32BufferAttribute(wgF, 1)); wgG.setAttribute("aE", new THREE.Float32BufferAttribute(wgE, 1));
      wgG.setIndex(wgI);
      const WG = { uYear: SH.uYear, uGlow: { value: 0 } };
      const wallGlowMat = new THREE.ShaderMaterial({ uniforms: WG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        vertexShader: `#include <common>
          #include <logdepthbuf_pars_vertex>
          attribute float aF; attribute float aE; varying float vF; varying float vE;
          void main(){ vF = aF; vE = aE; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
          }`,
        fragmentShader: `#include <common>
          #include <logdepthbuf_pars_fragment>
          uniform float uYear; uniform float uGlow; varying float vF; varying float vE;
          void main(){
            #include <logdepthbuf_fragment>
            float prog = clamp((uYear - 1396.0) / 0.9, 0.0, 1.0);
            if (vF > prog || uYear > vE) discard;
            float head = smoothstep(0.035, 0.0, prog - vF) * step(prog, 0.999);
            vec3 c = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.45, 0.2), head);
            gl_FragColor = vec4(c * uGlow * (0.55 + 1.2 * head), 1.0);
          }` });
      const wallGlow = new THREE.Mesh(wgG, wallGlowMat); wallGlow.frustumCulled = false; wallGlow.renderOrder = 5; scene.add(wallGlow);
      // palace walls (red-brown, tiled cap)
      const PW = F(S2.pwall.a);
      for (let i = 0; i < S2.pwall.n; i++) {
        const o = i * 6, ax = PW[o], ay = PW[o + 1], bx = PW[o + 2], by = PW[o + 3], g = Math.min(PW[o + 4], PW[o + 5]);
        const len = Math.hypot(bx - ax, by - ay); if (len < 0.5) continue;
        const W = frame((ax + bx) / 2, (ay + by) / 2, Math.atan2(by - ay, bx - ax));
        HB.x = [g, 1395.3, 99999, -1]; HB.k = 1;
        boxL(W, len / 2 + 0.3, 0.6, g - 1, g + 3.6, WALLRED);
        roofL(W, len / 2 + 0.5, 1.0, g + 3.6, 0.7, 0.0, 0.0, TILE, 2, false);
      }
      HB.k = 0;
      const DECK = C3("#8f9194"), PIER = C3("#6f7174");
      for (const br of (S2.bridges || [])) {
        const ring = br.ring, g = Math.max(br.g, 8), top = g + 16, bot = top - 2.4;
        HB.x = [g - 6, br.year - 1.3, br.end || 99999, -9999]; HB.col = DECK;
        const tris = THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p[0], p[1])), []);
        const base = HB.n; for (const p of ring) HB.v(p[0], top, -p[1]);
        for (const t of tris) HB.tri(base + t[0], base + t[1], base + t[2]);
        for (let k = 0; k < ring.length; k++) { const p = ring[k], q = ring[(k + 1) % ring.length];
          HB.quad(HB.v(p[0], bot, -p[1]), HB.v(q[0], bot, -q[1]), HB.v(q[0], top, -q[1]), HB.v(p[0], top, -p[1])); }
        // piers along the long axis
        let mx = 0, my = 0; for (const p of ring) { mx += p[0]; my += p[1]; } mx /= ring.length; my /= ring.length;
        let sxx = 0, sxy = 0, syy = 0; for (const p of ring) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
        const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
        let lo = 1e9, hi = -1e9, wd = 0; for (const p of ring) { const t = (p[0] - mx) * ux + (p[1] - my) * uy, n = Math.abs(-(p[0] - mx) * uy + (p[1] - my) * ux); lo = Math.min(lo, t); hi = Math.max(hi, t); wd = Math.max(wd, n); }
        for (let t = lo + 30; t < hi - 20; t += 55) {
          HB.col = PIER; boxL(frame(mx + ux * t, my + uy * t, ang), 2.2, Math.max(wd * 0.75, 4), g - 6, bot, PIER);
        }
      }
      if (S2.ggb) {   // 1926–1995/96, granite block in front of Geunjeongjeon
        const G = S2.ggb, W = frame(G.x, G.y, 0), GR = C3("#b7b1a4"), DK = C3("#5c5a56");
        HB.x = [G.g - 2, G.y0 - 1.0, G.y1, -9999];
        boxL(W, 64, 36, G.g - 2, G.g + 1.5, shadeC(GR, 0.8));
        for (const [ox, oy, hl, hw] of [[0, -28, 64, 8], [0, 28, 64, 8], [-56, 0, 8, 36], [56, 0, 8, 36], [0, 0, 8, 36]])
          boxL((u, v, h) => W(u + ox, v + oy, h), hl, hw, G.g + 1.5, G.g + 23, GR);
        for (const [ox, oy, hl, hw] of [[0, -28, 64.3, 8.3], [0, 28, 64.3, 8.3], [-56, 0, 8.3, 36.3], [56, 0, 8.3, 36.3], [0, 0, 8.3, 36.3]])
          boxL((u, v, h) => W(u + ox, v + oy, h), hl, hw, G.g + 23, G.g + 24.2, DK);
        boxL((u, v, h) => W(u, v - 22, h), 12, 12, G.g + 1.5, G.g + 38, GR);
        boxL((u, v, h) => W(u, v - 22, h), 8, 8, G.g + 38, G.g + 46, shadeC(GR, 0.9));
        boxL((u, v, h) => W(u, v - 22, h), 4.5, 4.5, G.g + 46, G.g + 54, DK);
      }
      if (S2.cgc && S2.cgc.line.length > 1) {   // Cheonggye elevated highway over the covered stream (1971–2003)
        const L_ = S2.cgc.line, CON = C3("#8b8c8e");
        for (let i = 0; i < L_.length - 1; i++) {
          const a = L_[i], b = L_[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1) continue;
          const g = Math.min(a[2], b[2]), W = frame((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(b[1] - a[1], b[0] - a[0]));
          HB.x = [g - 1, 1969.6 + (i / L_.length) * 1.4, 2003.45 + (i / L_.length) * 0.5, -9999];
          boxL(W, len / 2 + 0.8, 8, g + 13.6, g + 15.4, CON);
          boxL(W, 1.6, 2.2, g - 1, g + 13.6, shadeC(CON, 0.8));
        }
      }
      const tradGeo = HB.geo();
      function riseVS(src) {   // shared rise/sink for aX = (base, yearStart, yearEnd, tile)
        return src.replace("#include <common>", "#include <common>\nattribute vec4 aX; attribute float aK; uniform float uYear; varying float vTile; varying float vAge; varying float vEnd; varying float vK; varying vec3 vWP2;")
          .replace("#include <begin_vertex>", `vec3 transformed = vec3(position);
            float rise = clamp((uYear - aX.y) / 1.2, 0.0, 1.0); float k = 1.0 - pow(1.0 - rise, 3.0);
            float gone = clamp((uYear - aX.z) / 1.5, 0.0, 1.0); k *= 1.0 - gone;
            transformed.y = aX.x - 3.0 + (position.y - aX.x + 3.0) * k;
            vTile = aX.w; vAge = clamp((uYear - aX.y) / 3.0, 0.0, 1.0); vEnd = aX.z; vK = aK; vWP2 = position;`);
      }
      const tradMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
      tradMat.onBeforeCompile = (s) => {
        s.uniforms.uYear = SH.uYear; s.uniforms.uNight = SH.uNight;
        s.vertexShader = riseVS(s.vertexShader);
        s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\nvarying float vTile; varying float vAge; varying float vEnd; varying float vK; varying vec3 vWP2; uniform float uNight; uniform float uYear;\n${NOISE}`)
          .replace("#include <color_fragment>", `#include <color_fragment>
            if (vTile > -1000.0) { float st = abs(fract(vTile / 0.34) - 0.5); diffuseColor.rgb *= 0.72 + 0.28 * smoothstep(0.05, 0.22, st); }
            else if (vTile > -6000.0) { diffuseColor.rgb *= 0.85 + 0.3 * vn(gl_FragCoord.xy * 0.35); }`)
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
            totalEmissiveRadiance += vec3(1.0, 0.45, 0.22) * (1.0 - vAge) * 0.12;
            float fireWin = (step(1591.0, vEnd) * step(vEnd, 1593.0) + step(2008.0, vEnd) * step(vEnd, 2008.5) + step(1950.3, vEnd) * step(vEnd, 1951.3));
            float burn = fireWin * smoothstep(vEnd - 0.55, vEnd - 0.1, uYear) * step(uYear, vEnd + 0.4);
            float fl = 0.55 + 0.45 * vn(vec2(vWP2.x * 0.08 + uYear * 37.0, vWP2.y * 0.15 - uYear * 91.0));
            totalEmissiveRadiance += vec3(1.0, 0.28, 0.04) * burn * fl * 2.6;
            diffuseColor.rgb *= 1.0 - 0.75 * burn;
            totalEmissiveRadiance += diffuseColor.rgb * vK * uNight * step(1960.0, uYear) * 0.55;`);
      };
      const trad = new THREE.Mesh(tradGeo, tradMat); trad.castShadow = true; trad.receiveShadow = true;
      const riseDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
      riseDepth.onBeforeCompile = (s) => { s.uniforms.uYear = SH.uYear; s.vertexShader = riseVS(s.vertexShader); };
      trad.customDepthMaterial = riseDepth; scene.add(trad);

      // ---------- modern buildings: real footprints, windows ----------
      const PP = F(S2.poly.pts), PO = U(S2.poly.off), PM = F(S2.poly.meta);
      let nv = 0, ni = 0;
      for (let i = 0; i < S2.poly.n; i++) { nv += PO[i * 2 + 1] * 5; ni += PO[i * 2 + 1] * 9; }
      const mP = new Float32Array(nv * 3), mN = new Float32Array(nv * 3), mA = new Float32Array(nv * 4), mB = new Float32Array(nv * 4);
      const mI = new Uint32Array(ni); let vi = 0, ii = 0;
      for (let i = 0; i < S2.poly.n; i++) {
        const st = PO[i * 2], cnt = PO[i * 2 + 1];
        const h = PM[i * 4], g0 = PM[i * 4 + 1], yr = PM[i * 4 + 2], sty = PM[i * 4 + 3], seed = hash(i * 1.7 + 3.3);
        let pts = []; for (let k = 0; k < cnt; k++) pts.push([PP[(st + k) * 2], PP[(st + k) * 2 + 1]]);
        let ar = 0; for (let k = 0; k < cnt; k++) { const p = pts[k], q = pts[(k + 1) % cnt]; ar += p[0] * q[1] - q[0] * p[1]; }
        if (ar < 0) pts.reverse();
        const put = (x, y, yn, nx, ny, nz, top, uu, wall) => {
          mP.set([x, y, -yn], vi * 3); mN.set([nx, ny, nz], vi * 3);
          mA.set([g0, h, yr, sty], vi * 4); mB.set([uu, top, seed, wall], vi * 4); return vi++;
        };
        let cum = 0;
        for (let k = 0; k < cnt; k++) {
          const p = pts[k], q = pts[(k + 1) % cnt], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
          const nx = dy / len, nyn = -dx / len;   // outward (CCW ring)
          const a = put(p[0], g0 - 3, p[1], nx, 0, -nyn, 0, cum, 1), b = put(q[0], g0 - 3, q[1], nx, 0, -nyn, 0, cum + len, 1);
          const c = put(q[0], g0 + h, q[1], nx, 0, -nyn, 1, cum + len, 1), d = put(p[0], g0 + h, p[1], nx, 0, -nyn, 1, cum, 1);
          mI.set([a, b, c, a, c, d], ii); ii += 6; cum += len;
        }
        const tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
        const base = vi;
        for (const p of pts) put(p[0], g0 + h, p[1], 0, 1, 0, 1, 0, 0);
        for (const t of tris) { if (ii + 3 > mI.length) break; mI.set([base + t[0], base + t[1], base + t[2]], ii); ii += 3; }
      }
      const mg = new THREE.BufferGeometry();
      mg.setAttribute("position", new THREE.BufferAttribute(mP.subarray(0, vi * 3), 3));
      mg.setAttribute("normal", new THREE.BufferAttribute(mN.subarray(0, vi * 3), 3));
      mg.setAttribute("aA", new THREE.BufferAttribute(mA.subarray(0, vi * 4), 4));
      mg.setAttribute("aB", new THREE.BufferAttribute(mB.subarray(0, vi * 4), 4));
      mg.setIndex(new THREE.BufferAttribute(mI.subarray(0, ii), 1));
      function modVS(src) {
        return src.replace("#include <common>", "#include <common>\nattribute vec4 aA; attribute vec4 aB; uniform float uYear; varying vec4 vA; varying vec4 vB; varying float vLY; varying float vAge;")
          .replace("#include <begin_vertex>", `vec3 transformed = vec3(position);
            float rise = clamp((uYear - aA.z) / 1.4, 0.0, 1.0); float k = 1.0 - pow(1.0 - rise, 3.0);
            transformed.y = mix(aA.x - 3.0, aA.x + aA.y * k, aB.y);
            if (k <= 0.0) transformed.y = aA.x - 3.0;
            vA = aA; vB = aB; vLY = transformed.y - aA.x; vAge = clamp((uYear - aA.z) / 3.5, 0.0, 1.0);`);
      }
      const FACADE = `
        float wallF = vB.w, sty = vA.w, seed = vB.z;
        float fl = vLY / 3.3, fi = floor(fl), ff = fract(fl);
        float cw = sty > 0.5 && sty < 1.5 ? 2.8 : 3.2;
        float cu = vB.x / cw, ci = floor(cu), cf = fract(cu);
        float win = step(0.24, ff) * step(ff, 0.80) * step(0.16, cf) * step(cf, 0.84);
        if (sty > 1.5) win = step(0.07, ff) * step(0.06, cf) * step(cf, 0.94);
        if (vLY < 0.6) win = 0.0;
        diffuseColor.rgb *= 1.0;
        float aa = clamp((max(fwidth(fl), fwidth(cu)) - 0.25) * 2.0, 0.0, 1.0);
        win = mix(win, sty > 1.5 ? 0.8 : 0.42, aa * wallF);
        vec3 wallCol = sty < 0.5 ? (seed < 0.32 ? vec3(0.83, 0.79, 0.71) : seed < 0.52 ? vec3(0.55, 0.36, 0.29) : seed < 0.8 ? vec3(0.76, 0.76, 0.74) : vec3(0.66, 0.62, 0.55))
                     : sty < 1.5 ? vec3(0.90, 0.89, 0.86) : vec3(0.50, 0.55, 0.60);
        if (sty > 0.5 && sty < 1.5 && ff > 0.80) wallCol *= 0.86;
        vec3 glass = sty > 1.5 ? vec3(0.20, 0.25, 0.30) : vec3(0.13, 0.15, 0.17);
        vec3 c = mix(wallCol, glass, win * wallF);
        if (wallF < 0.5) c = (sty < 0.5 && seed > 0.62) ? vec3(0.33, 0.50, 0.38) : vec3(0.52, 0.52, 0.51) * (0.9 + 0.2 * seed);
        float ao = mix(0.62, 1.0, clamp(vLY / 7.0, 0.0, 1.0));
        diffuseColor.rgb = c * ao * 0.78 * (0.93 + 0.14 * h21(vec2(ci, fi) + seed * 31.0)) * (1.0 - 0.55 * uNight);`;
      const modMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, envMapIntensity: 0.6 });
      modMat.onBeforeCompile = (s) => {
        s.uniforms.uYear = SH.uYear; s.uniforms.uNight = SH.uNight;
        s.vertexShader = modVS(s.vertexShader);
        s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec4 vA; varying vec4 vB; varying float vLY; varying float vAge; uniform float uNight;\n${NOISE}`)
          .replace("#include <color_fragment>", `#include <color_fragment>\n${FACADE}`)
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.85, sty > 1.5 ? 0.12 : 0.25, win * wallF);")
          .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = win * wallF * (sty > 1.5 ? 0.7 : 0.3);")
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
            float lit = mix(step(0.64, h21(vec2(ci * 1.37 + seed * 17.0, fi * 0.71 + seed * 3.0))), 0.3 + 0.2 * seed, aa);
            vec3 lc = mix(vec3(1.0, 0.68, 0.36), vec3(0.80, 0.88, 1.0), mix(step(0.78, h21(vec2(fi + seed, ci))), 0.2, aa));
            float dimw = 0.45 + 0.55 * h21(vec2(ci * 3.1 + seed, fi * 1.7));
            totalEmissiveRadiance += lc * lit * dimw * win * wallF * uNight * 0.85 * mix(1.0, 0.35, aa);
            totalEmissiveRadiance += vec3(1.0, 0.42, 0.22) * (1.0 - vAge) * 0.55;`);
      };
      const modern = new THREE.Mesh(mg, modMat); modern.castShadow = true; modern.receiveShadow = true;
      const modDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      modDepth.onBeforeCompile = (s) => { s.uniforms.uYear = SH.uYear; s.vertexShader = modVS(s.vertexShader); };
      modern.customDepthMaterial = modDepth; modern.frustumCulled = false; scene.add(modern);

      // ---------- far city: instanced boxes with the same facade ----------
      const FB = F(S2.far.a), nf = S2.far.n;
      const bx = new THREE.BoxGeometry(1, 1, 1); bx.translate(0, 0.5, 0);
      const fg = new THREE.InstancedBufferGeometry(); fg.index = bx.index;
      fg.setAttribute("position", bx.attributes.position); fg.setAttribute("normal", bx.attributes.normal);
      const iP = new Float32Array(nf * 4), iS = new Float32Array(nf * 4);
      for (let i = 0; i < nf; i++) { const o = i * 8;
        iP.set([FB[o], FB[o + 1], FB[o + 6], FB[o + 4]], i * 4); iS.set([FB[o + 2], FB[o + 3], FB[o + 5], FB[o + 7]], i * 4); }
      fg.setAttribute("iP", new THREE.InstancedBufferAttribute(iP, 4)); fg.setAttribute("iS", new THREE.InstancedBufferAttribute(iS, 4));
      fg.instanceCount = nf;
      const farMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, envMapIntensity: 0.5 });
      farMat.onBeforeCompile = (s) => {
        s.uniforms.uYear = SH.uYear; s.uniforms.uNight = SH.uNight;
        s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute vec4 iP; attribute vec4 iS; uniform float uYear; varying vec4 vA; varying vec4 vB; varying float vLY; varying float vAge;")
          .replace("#include <beginnormal_vertex>", `vec3 objectNormal = vec3(normal);
            { float a = iP.w; vec2 n2 = mat2(cos(a), sin(a), -sin(a), cos(a)) * vec2(normal.x, -normal.z); objectNormal = vec3(n2.x, normal.y, -n2.y); }`)
          .replace("#include <begin_vertex>", `vec3 transformed;
            { float rise = clamp((uYear - iS.w) / 1.4, 0.0, 1.0); float k = 1.0 - pow(1.0 - rise, 3.0);
              float hh = iS.z * k; float a = iP.w;
              vec2 lp = vec2(position.x * iS.x, position.z * iS.y);
              vec2 r = mat2(cos(a), sin(a), -sin(a), cos(a)) * vec2(lp.x, -lp.y);
              float y = mix(-3.0, hh, position.y); if (k <= 0.0) y = -40.0;
              transformed = vec3(iP.x + r.x, iP.z + y, -(iP.y) - r.y);
              float sty = iS.z > 45.0 ? 2.0 : 1.0;
              vA = vec4(iP.z, iS.z, iS.w, sty);
              float per = abs(normal.x) > 0.5 ? (position.z + 0.5) * iS.y : (position.x + 0.5) * iS.x;
              vB = vec4(per, position.y, fract(sin(dot(iP.xy, vec2(12.9898, 78.233))) * 43758.5453), abs(normal.y) > 0.5 ? 0.0 : 1.0);
              vLY = y; vAge = clamp((uYear - iS.w) / 3.5, 0.0, 1.0); }`);
        s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec4 vA; varying vec4 vB; varying float vLY; varying float vAge; uniform float uNight;\n${NOISE}`)
          .replace("#include <color_fragment>", `#include <color_fragment>\n${FACADE}`)
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
            float lit = mix(step(0.5, h21(vec2(ci * 1.37 + seed * 17.0, fi * 0.71 + seed * 3.0))), 0.45 + 0.3 * seed, aa);
            totalEmissiveRadiance += vec3(1.0, 0.76, 0.46) * lit * win * wallF * uNight * 1.6 * mix(1.0, 0.6, aa);
            totalEmissiveRadiance += vec3(1.0, 0.42, 0.22) * (1.0 - vAge) * 0.55;`);
      };
      const far = new THREE.Mesh(fg, farMat); far.frustumCulled = false; far.receiveShadow = true; scene.add(far);

      // ---------- palace ground, lawns, ponds (draped grid) ----------
      const DRAPES = [];
      function drape(ring, y0off, mat, step) {
        // re-tessellate on a grid so the patch follows the slope
        const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
        const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
        const nx = Math.max(2, Math.ceil((maxx - minx) / step)), ny = Math.max(2, Math.ceil((maxy - miny) / step));
        const pg = new THREE.PlaneGeometry(maxx - minx, maxy - miny, nx, ny); pg.rotateX(-Math.PI / 2);
        const pa = pg.attributes.position;
        for (let i = 0; i < pa.count; i++) { const x = pa.getX(i) + (minx + maxx) / 2, yn = -pa.getZ(i) + (miny + maxy) / 2;
          pa.setXYZ(i, x, th(x, yn) + y0off, -yn); }
        pg.computeVertexNormals();
        // clip to the ring in the shader via a mask texture drawn on a canvas
        const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 1024; const cx = cv.getContext("2d");
        cx.fillStyle = "#000"; cx.fillRect(0, 0, 1024, 1024); cx.fillStyle = "#fff"; cx.beginPath();
        ring.forEach((p, k) => { const px = (p[0] - minx) / (maxx - minx) * 1024, py = (maxy - p[1]) / (maxy - miny) * 1024; k ? cx.lineTo(px, py) : cx.moveTo(px, py); });
        cx.closePath(); cx.fill();
        const tex = new THREE.CanvasTexture(cv);
        const m = mat.clone(); m.alphaMap = tex; m.transparent = true; m.depthWrite = false;
        m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
        const mesh = new THREE.Mesh(pg, m); mesh.receiveShadow = true; scene.add(mesh); DRAPES.push(mesh); return mesh;
      }
      const granite = new THREE.MeshStandardMaterial({ color: 0x8a8376, roughness: 0.95 });
      const lawnM = new THREE.MeshStandardMaterial({ color: 0x46602f, roughness: 1 });
      const waterM = new THREE.MeshStandardMaterial({ color: 0x23464d, roughness: 0.08, metalness: 0.4, envMapIntensity: 1.2 });
      const palGround = drape(S2.palace, 0.7, granite, 6);
      S2.lawns.forEach((r) => drape(r, 0.95, lawnM, 6));
      S2.ponds.forEach((r) => drape(r, 0.4, waterM, 5));
      if (S2.cgc && S2.cgc.poly.length > 3) { const m = drape(S2.cgc.poly, 0.5, waterM, 4);
        m.userData.vis = (y) => (1 - smooth(1958, 1966, y)) + smooth(2005.4, 2005.9, y); }

      // ---------- roads (appear with the modern city; glow at night) ----------
      const RP = F(S2.roads.p), RO = F(S2.roads.o);
      const rb = { P: [], N: [], I: [], Y: [] };
      let rv = 0;
      for (let k = 0; k < S2.roads.n; k++) {
        const st = RO[k * 4], cnt = RO[k * 4 + 1], wdt = RO[k * 4 + 2], br = RO[k * 4 + 3];
        for (let j = 0; j < cnt - 1; j++) {
          const a = st + j, b = st + j + 1;
          const ax = RP[a * 4], ay = RP[a * 4 + 1], az = RP[a * 4 + 2], bx2 = RP[b * 4], by = RP[b * 4 + 1], bz = RP[b * 4 + 2], ya = RP[a * 4 + 3], yb2 = RP[b * 4 + 3];
          const dx = bx2 - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, px = -dy / len * wdt / 2, py = dx / len * wdt / 2;
          const lift = br ? 15.5 : 1.2;
          rb.Y.push(ya, ya, yb2, yb2);
          rb.P.push(ax + px, az + lift, -(ay + py), ax - px, az + lift, -(ay - py), bx2 - px, bz + lift, -(by - py), bx2 + px, bz + lift, -(by + py));
          rb.I.push(rv, rv + 1, rv + 2, rv, rv + 2, rv + 3); rv += 4;
        }
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute("position", new THREE.Float32BufferAttribute(rb.P, 3));
      rg.setAttribute("aRY", new THREE.Float32BufferAttribute(rb.Y, 1));
      rg.setIndex(rv > 65535 ? new THREE.Uint32BufferAttribute(rb.I, 1) : new THREE.Uint16BufferAttribute(rb.I, 1));
      rg.computeVertexNormals();
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x2f3134, roughness: 0.9, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      roadMat.onBeforeCompile = (s) => { s.uniforms.uNight = SH.uNight; s.uniforms.uYear = SH.uYear;
        s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute float aRY; varying float vRY;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRY = aRY;");
        s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uNight; uniform float uYear; varying float vRY;")
          .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (uYear < vRY) discard;")
          .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.62, 0.28) * uNight * 0.55;"); };
      const roads = new THREE.Mesh(rg, roadMat); roads.receiveShadow = true; scene.add(roads);

      // ---------- trees ----------
      const TA = F(S2.trees.a), ntr = S2.trees.n;
      const cone = new THREE.ConeGeometry(2.3, 7.5, 7); cone.translate(0, 4.6, 0);
      const trees = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), ntr);
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), tcol = new THREE.Color();
      for (let i = 0; i < ntr; i++) { const o = i * 4, s = TA[o + 3];
        ps.set(TA[o], TA[o + 2] - 0.6, -TA[o + 1]); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i) * 6.28); sc.set(s, s * (0.85 + 0.4 * hash(i * 2.3)), s);
        mtx.compose(ps, q, sc); trees.setMatrixAt(i, mtx);
        tcol.setRGB(0.025 + 0.015 * hash(i * 4.1), 0.05 + 0.025 * hash(i * 1.9), 0.022 + 0.012 * hash(i * 3.7)); trees.setColorAt(i, tcol); }
      trees.castShadow = true; trees.receiveShadow = true; scene.add(trees);

      // ---------- Lotte World Tower (procedural; 555 m, rises 2011–2016) ----------
      const LT = S2.lotte, LX = LT[0], LZ = -LT[1], LG = LT[2];
      const tw = new GB(200000);
      const NA = 96, NL = 90, HT = 497;
      const hwAt = (y) => 41 * (1 - 0.70 * Math.pow(y / HT, 1.25));
      const prof = (th_, hw) => { const c = Math.cos(th_), s = Math.sin(th_), p = 5.0;
        const r = hw / Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), 1 / p); return [c * r, s * r]; };
      const ring = [];
      for (let l = 0; l <= NL; l++) { const y = HT * l / NL, hw = hwAt(y), row = [];
        for (let a = 0; a <= NA; a++) { const t = a / NA * Math.PI * 2, xy = prof(t + Math.PI / 4, hw);
          tw.x = [LG, 2011.0, 99999, a / NA]; row.push(tw.v(LX + xy[0], LG + y, LZ + xy[1])); }
        ring.push(row); }
      for (let l = 0; l < NL; l++) for (let a = 0; a < NA; a++) tw.quad(ring[l][a], ring[l][a + 1], ring[l + 1][a + 1], ring[l + 1][a]);
      // crown: four tapering fins + glowing lantern
      for (let k = 0; k < 4; k++) { const t0 = Math.PI / 4 + k * Math.PI / 2;
        for (const dt of [-0.18, 0.18]) { const b0 = prof(t0 + dt, hwAt(HT));
          tw.x = [LG, 2011.0, 99999, -5];
          const i0 = tw.v(LX + b0[0], LG + HT, LZ + b0[1]), i1 = tw.v(LX + b0[0] * 0.92, LG + HT, LZ + b0[1] * 0.92);
          const i2 = tw.v(LX + b0[0] * 0.08, LG + 555, LZ + b0[1] * 0.08), i3 = tw.v(LX + b0[0] * 0.07, LG + 555, LZ + b0[1] * 0.07);
          tw.quad(i0, i1, i3, i2); } }
      const lan = []; for (let l = 0; l <= 6; l++) { const y = HT + l * 7, r = 9 * (1 - l / 7); const row = [];
        for (let a = 0; a <= 24; a++) { const t = a / 24 * Math.PI * 2; tw.x = [LG, 2011.0, 99999, -6]; row.push(tw.v(LX + Math.cos(t) * r, LG + y, LZ + Math.sin(t) * r)); }
        lan.push(row); }
      for (let l = 0; l < 6; l++) for (let a = 0; a < 24; a++) tw.quad(lan[l][a], lan[l][a + 1], lan[l + 1][a + 1], lan[l + 1][a]);
      const towerGeo = tw.geo();
      const towerVS = (src) => src.replace("#include <common>", "#include <common>\nattribute vec4 aX; uniform float uYear; varying vec4 vX; varying float vH;")
        .replace("#include <begin_vertex>", `vec3 transformed = vec3(position);
          float top = 560.0 * smoothstep(2011.0, 2016.6, uYear);
          float hh = position.y - aX.x; transformed.y = aX.x + min(hh, top) - (uYear < 2011.0 ? 40.0 : 0.0);
          vX = aX; vH = hh;`);
      const towerMat = new THREE.MeshStandardMaterial({ color: 0xd2dade, roughness: 0.2, metalness: 0.8, envMapIntensity: 1.1, side: THREE.DoubleSide });
      towerMat.onBeforeCompile = (s) => {
        s.uniforms.uYear = SH.uYear; s.uniforms.uNight = SH.uNight;
        s.vertexShader = towerVS(s.vertexShader);
        s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec4 vX; varying float vH; uniform float uNight;\n${NOISE}`)
          .replace("#include <color_fragment>", `#include <color_fragment>
            float fl = fract(vH / 4.3), col = fract(vX.w * 380.0);
            float mull = (step(0.92, fl) + step(0.9, col)) * (1.0 - clamp((max(fwidth(vH / 4.3), fwidth(vX.w * 380.0)) - 0.25) * 2.0, 0.0, 1.0));
            diffuseColor.rgb *= 1.0 - 0.18 * clamp(mull, 0.0, 1.0);
            diffuseColor.rgb *= 1.0 - 0.6 * smoothstep(0.012, 0.0, abs(fract(vX.w * 4.0) - 0.5));`)
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
            float taa = clamp((max(fwidth(vH / 4.3), fwidth(vX.w * 380.0 / 3.0)) - 0.25) * 2.0, 0.0, 1.0);
            float lit = mix(step(0.45, h21(vec2(floor(vH / 4.3), floor(vX.w * 380.0 / 3.0)))), 0.5, taa);
            totalEmissiveRadiance += vec3(1.0, 0.86, 0.66) * lit * uNight * 0.9 * (1.0 - step(0.92, fl));
            if (vX.w < -4.5) totalEmissiveRadiance += vec3(1.0, 0.97, 0.92) * (0.25 + 2.6 * uNight);`);
      };
      const tower = new THREE.Mesh(towerGeo, towerMat); tower.castShadow = true;
      const towerDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
      towerDepth.onBeforeCompile = (s) => { s.uniforms.uYear = SH.uYear; s.vertexShader = towerVS(s.vertexShader); };
      tower.customDepthMaterial = towerDepth; scene.add(tower);

      // ---------- smoke columns (CH.smoke: {x, z, y0, y1, r, h}) ----------
      for (const [i, sm] of (window.CH.smoke || []).entries()) {
        const h = sm.h || 380, r = sm.r || 120, g = th(sm.x, -sm.z);
        const cg = new THREE.CylinderGeometry(r, r * 0.35, h, 28, 18, true); cg.translate(0, h / 2, 0);
        const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
          uniforms: { uYear: SH.uYear, uT: SH.uT, uY0: { value: sm.y0 }, uY1: { value: sm.y1 }, uH: { value: h }, uSeed: { value: i * 7.31 } },
          vertexShader: `#include <common>
            #include <logdepthbuf_pars_vertex>
            varying float vH; varying vec2 vQ; uniform float uH;
            void main(){ vH = position.y / uH; vQ = vec2(atan(position.z, position.x), position.y);
              vec3 p = position; p.x += sin(position.y * 0.012) * 25.0 * vH; p.z += cos(position.y * 0.009) * 18.0 * vH;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            #include <logdepthbuf_vertex>
            }`,
          fragmentShader: `#include <common>
            #include <logdepthbuf_pars_fragment>
            uniform float uYear; uniform float uT; uniform float uY0; uniform float uY1; uniform float uSeed; varying float vH; varying vec2 vQ;
            ${NOISE}
            void main(){
              #include <logdepthbuf_fragment>
              float vis = smoothstep(uY0, uY0 + 0.12, uYear) * (1.0 - smoothstep(uY1 - 0.25, uY1, uYear));
              if (vis <= 0.0) discard;
              vec2 q = vec2(vQ.x * 2.2 + uSeed, vQ.y * 0.012 - uT * 0.35);
              float n = fbm(q) * 0.75 + fbm(q * 2.7 + 3.1) * 0.35;
              float a = smoothstep(0.32, 0.78, n) * smoothstep(0.0, 0.06, vH) * (1.0 - smoothstep(0.55, 1.0, vH)) * vis * 0.82;
              vec3 c = mix(vec3(0.13, 0.11, 0.10), vec3(0.42, 0.37, 0.33), vH) + vec3(1.0, 0.35, 0.08) * pow(1.0 - vH, 6.0) * 0.9;
              gl_FragColor = vec4(c, a);
            }` });
        const mesh = new THREE.Mesh(cg, m); mesh.position.set(sm.x, g - 4, sm.z); mesh.renderOrder = 8; mesh.frustumCulled = false; scene.add(mesh);
      }

      // ---------- sky, sun, environment ----------
      const skyU = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
                     uSunC: { value: new THREE.Color() }, uNight: SH.uNight };
      const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }",
        fragmentShader: `uniform vec3 uSun; uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunC; uniform float uNight; varying vec3 vD;
          float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          void main(){ vec3 d = normalize(vD); float e = max(d.y, 0.0);
            vec3 c = mix(uHor, uZen, pow(e, 0.55));
            float sd = max(dot(d, normalize(uSun)), 0.0);
            c += uSunC * (pow(sd, 6.0) * 0.35 + pow(sd, 400.0) * 3.0) * (1.0 - 0.8 * uNight);
            vec3 sp = floor(d * 900.0); float st = step(0.9985, h3(sp)) * smoothstep(0.05, 0.4, e);
            c += vec3(0.9, 0.95, 1.0) * st * uNight * 0.9;
            if (d.y < 0.0) c = uHor * 0.85;
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <encodings_fragment>
          }` });
      const sky = new THREE.Mesh(new THREE.SphereGeometry(100000, 48, 24), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
      const sun = new THREE.DirectionalLight(0xffffff, 3);
      sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
      sun.shadow.camera.near = 10; sun.shadow.camera.far = 12000;
      scene.add(sun); scene.add(sun.target);
      const hemi = new THREE.HemisphereLight(0xbfd2e6, 0x6b5f48, 0.7); scene.add(hemi);
      // static environment for reflections (a neutral daylight sky)
      const envScene = new THREE.Scene();
      const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
        vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "varying vec3 vD; void main(){ float e = vD.y; vec3 c = e > 0.0 ? mix(vec3(0.85,0.84,0.80), vec3(0.42,0.58,0.78), pow(e, 0.5)) : vec3(0.32,0.30,0.27); gl_FragColor = vec4(c, 1.0); }" }));
      envScene.add(envSky);
      const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.02).texture;

      // ---------- time of day (from window.CH.sun) ----------
      const CH = window.CH;
      const SUNK = CH.sun;
      function sunAt(t) { let i = 0; while (i < SUNK.length - 2 && t > SUNK[i + 1][0]) i++;
        const a = SUNK[i], b = SUNK[i + 1], k = smooth(a[0], b[0], t); return [lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
      const cZ = { day: new THREE.Color("#5d8fc4"), gold: new THREE.Color("#6f8fb5"), set: new THREE.Color("#3e5486"), dusk: new THREE.Color("#18233f"), night: new THREE.Color("#050914") };
      const cH = { day: new THREE.Color("#c3d0d8"), gold: new THREE.Color("#f0d3a6"), set: new THREE.Color("#f0955e"), dusk: new THREE.Color("#6d4d5e"), night: new THREE.Color("#141c30") };
      const tmpA = new THREE.Color(), tmpB = new THREE.Color();
      function skyCols(el, out, tab) {   // by sun elevation
        const st = [[-14, "night"], [-5, "dusk"], [2, "set"], [14, "gold"], [32, "day"]];
        if (el <= st[0][0]) return out.copy(tab[st[0][1]]);
        for (let i = 0; i < st.length - 1; i++) if (el <= st[i + 1][0]) return out.copy(tab[st[i][1]]).lerp(tab[st[i + 1][1]], smooth(st[i][0], st[i + 1][0], el));
        return out.copy(tab.day);
      }
      function applyTime(t) {
        const [az, el] = CH.live ? CH.live.sun : sunAt(t); const ar = az * Math.PI / 180, er = el * Math.PI / 180;
        const dir = new THREE.Vector3(Math.sin(ar) * Math.cos(er), Math.sin(er), -Math.cos(ar) * Math.cos(er));
        const night = smooth(2, -9, el); SH.uNight.value = night;
        skyU.uSun.value.copy(dir); skyCols(el, skyU.uZen.value, cZ); skyCols(el, skyU.uHor.value, cH);
        skyU.uSunC.value.setRGB(1.0, lerp(0.55, 0.92, smooth(0, 30, el)), lerp(0.3, 0.82, smooth(0, 30, el)));
        sun.color.copy(skyU.uSunC.value);
        sun.intensity = 2.5 * smooth(-3, 8, el) + 0.05 * night;
        if (el < -2) { sun.color.setRGB(0.6, 0.7, 1.0); dir.set(-0.3, 0.8, 0.5).normalize(); }
        hemi.intensity = lerp(0.42, 0.05, night); hemi.color.copy(skyU.uZen.value).lerp(new THREE.Color(1, 1, 1), 0.35);
        hemi.groundColor.setRGB(lerp(0.42, 0.06, night), lerp(0.37, 0.06, night), lerp(0.29, 0.08, night));
        { const TT = CH.tint || [[0, 0]]; let tv = TT[TT.length - 1][1];
          for (let i = 0; i < TT.length - 1; i++) if (t <= TT[i + 1][0]) { tv = t <= TT[0][0] ? TT[0][1] : lerp(TT[i][1], TT[i + 1][1], smooth(TT[i][0], TT[i + 1][0], t)); break; }
          if (tv > 0) { const sm = new THREE.Color(0.30, 0.22, 0.17); skyU.uZen.value.lerp(sm, tv * 0.7); skyU.uHor.value.lerp(new THREE.Color(0.55, 0.32, 0.18), tv * 0.75);
            sun.intensity *= 1 - 0.6 * tv; hemi.intensity *= 1 - 0.45 * tv; renderer.toneMappingExposure *= 1 - 0.35 * tv; } }
        scene.fog.color.copy(skyU.uHor.value).multiplyScalar(0.92);
        scene.fog.near = lerp(16000, 3000, night); scene.fog.far = lerp(140000, 30000, night);
        renderer.toneMappingExposure = lerp(0.85, 1.0, night);
        const envK = 1 - 0.92 * night;
        modMat.envMapIntensity = 0.6 * envK; farMat.envMapIntensity = 0.5 * envK; towerMat.envMapIntensity = 1.1 * envK; waterM.envMapIntensity = 1.2 * envK;
        const pa_ = smooth(1394.9, 1395.4, SH.uYear.value);
        for (const d of DRAPES) { d.material.opacity = d.userData.vis ? d.userData.vis(SH.uYear.value) : pa_; d.material.envMapIntensity = (d.material.roughness < 0.5 ? 1.2 : 1.0) * envK; }
        roadMat.opacity = 0.92;
        return dir;
      }

      // ---------- year + camera (from window.CH) ----------
      const EASE = { lin: (k) => k, io: (k) => k * k * (3 - 2 * k), in: (k) => k * k, out: (k) => 1 - (1 - k) * (1 - k), in3: (k) => k * k * k };
      function yearAt(t) { if (CH.live) return CH.live.year; const Y = CH.years; if (t <= Y[0][0]) return Y[0][1];
        for (let i = 0; i < Y.length - 1; i++) if (t <= Y[i + 1][0]) { const k = (t - Y[i][0]) / (Y[i + 1][0] - Y[i][0]); return lerp(Y[i][1], Y[i + 1][1], EASE[Y[i + 1][2] || "lin"](k)); }
        return Y[Y.length - 1][1]; }
      const KEYS = CH.keys;
      const PC = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[1])), false, "centripetal");
      const TC = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[2])), false, "centripetal");
      const KT = KEYS.map((k) => k[0]), NK = KEYS.length;
      const SL = KT.map((_, i) => i === 0 ? 0.3 / (KT[1] - KT[0]) : i === NK - 1 ? 0.3 / (KT[NK - 1] - KT[NK - 2]) : 2 / (KT[i + 1] - KT[i - 1]));
      function camU(t) { if (t <= 0) return 0; if (t >= KT[NK - 1]) return 1;
        let i = 0; while (t > KT[i + 1]) i++;
        const h = KT[i + 1] - KT[i], x = (t - KT[i]) / h, x2 = x * x, x3 = x2 * x;
        const v = (2 * x3 - 3 * x2 + 1) * i + (x3 - 2 * x2 + x) * h * SL[i] + (-2 * x3 + 3 * x2) * (i + 1) + (x3 - x2) * h * SL[i + 1];
        return Math.min(Math.max(v / (NK - 1), 0), 1); }

      const yearEl = document.getElementById("year"), eraEl = document.getElementById("era");
      const TAGS = (CH.tags || []).map(([id, p]) => [document.getElementById(id), new THREE.Vector3(...(p === "lotte" ? [LX, LG + 572, LZ] : p))]);
      const pv = new THREE.Vector3(), look = new THREE.Vector3();
      function renderAt(t) {
        const y = yearAt(t); SH.uYear.value = y; SH.uT.value = t;
        { const G_ = CH.wallGlow || [[0, 0]]; let g = G_[G_.length - 1][1];
          for (let i = 0; i < G_.length - 1; i++) if (t <= G_[i + 1][0]) { g = t <= G_[0][0] ? G_[0][1] : lerp(G_[i][1], G_[i + 1][1], Math.min(Math.max((t - G_[i][0]) / (G_[i + 1][0] - G_[i][0]), 0), 1)); break; }
          WG.uGlow.value = g; }
        const dir = applyTime(t);
        const u = camU(t);
        camera.position.copy(PC.getPoint(u)); look.copy(TC.getPoint(u));
        if (CH.live) { camera.position.set(...CH.live.cam); look.set(...CH.live.look); }
        camera.lookAt(look);
        camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        const dist = camera.position.distanceTo(look), S = Math.min(Math.max(dist * 0.85, 260), 3200);
        sun.target.position.copy(look); sun.position.copy(look).addScaledVector(dir, 5000);
        const sc_ = sun.shadow.camera; sc_.left = -S; sc_.right = S; sc_.top = S; sc_.bottom = -S; sc_.updateProjectionMatrix();
        sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
        sky.position.copy(camera.position);
        renderer.render(scene, camera);
        yearEl.textContent = String(Math.floor(y));
        const ERA = y < 1897 ? ["Joseon · Hanyang", "조선 · 한양"] : y < 1910 ? ["Korean Empire · Hanseong", "대한제국 · 한성"] : y < 1945.6 ? ["Gyeongseong", "경성"] : ["Seoul", "서울"];
        const ko_ = CH.lang === "ko"; const html_ = `<span class="ep">${ko_ ? ERA[1] : ERA[0]}</span><span class="es">${ko_ ? ERA[0] : ERA[1]}</span>`;
        if (eraEl.innerHTML !== html_) eraEl.innerHTML = html_;
        if (CH.onFrame) CH.onFrame(t, y);
        for (const [el, p] of TAGS) { pv.copy(p).project(camera);
          el.style.left = ((pv.x * 0.5 + 0.5) * 1920).toFixed(1) + "px"; el.style.top = ((-pv.y * 0.5 + 0.5) * 1080).toFixed(1) + "px"; }
      }


      window.__hf = window.__hf || {}; window.__hf.buildReady = window.__hf.buildReady || {};
      window.__hf.buildReady.seoul = ready.then(() => renderAt(0));
      window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
      window.__seoulRender = renderAt; window.__seoulReady = ready; window.__seoulGround = th;
      ready.then(() => renderAt(0));
    })();
