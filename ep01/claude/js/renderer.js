// AURORA FALL — WebGL2 renderer (no external libraries)
'use strict';

// Instanced primitive batches filled every frame by the presentation code (characters, items, props).
class PrimBatch {
  constructor(cap) { this.cap = cap; this.data = new Float32Array(cap * 20); this.count = 0; }
  reset() { this.count = 0; }
  add(m, r, g, b, e) {
    if (this.count >= this.cap) return;
    const o = this.count * 20, d = this.data;
    for (let i = 0; i < 16; i++) d[o + i] = m[i];
    d[o + 16] = r; d[o + 17] = g; d[o + 18] = b; d[o + 19] = e || 0;
    this.count++;
  }
}
const Prims = { box: new PrimBatch(6000), rbox: new PrimBatch(3500), cyl: new PrimBatch(2000), cone: new PrimBatch(600), sphere: new PrimBatch(1500) };
function resetPrims() { for (const k in Prims) Prims[k].reset(); }

const Renderer = {
  gl: null, canvas: null, ready: false, direct: true, hdr: false,
  quality: 'high', Q: null,
  QUALITY: {
    low: { post: false, msaa: 0, shadow: 1024, maxDpr: 1.0, grass: 0, treeDist: 380, bloom: 0 },
    medium: { post: true, msaa: 2, shadow: 2048, maxDpr: 1.25, grass: 0.6, treeDist: 480, bloom: 1 },
    high: { post: true, msaa: 4, shadow: 2048, maxDpr: 1.5, grass: 1, treeDist: 560, bloom: 1 },
    ultra: { post: true, msaa: 4, shadow: 4096, maxDpr: 2.0, grass: 1, treeDist: 640, bloom: 1 },
  },
  scale: 1, P: {}, stats: { draws: 0, tris: 0 },
  SHADOW_EXTENT: 92,
  frustum: makeFrustum(), _shadowMat: m4.create(), _lv: m4.create(), _lp: m4.create(), _tmp: m4.create(),
  targets: null, shadow: null,

  // ------------------------------------------------------------------ setup
  init(canvas, quality) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2를 사용할 수 없습니다. 최신 Chrome / Edge / Firefox / Safari에서 열어 주세요.');
    this.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('OES_texture_float_linear');
    this._compile();
    this._staticGeometry();
    this.quality = this.QUALITY[quality] ? quality : 'high';
    this.Q = this.QUALITY[this.quality];
    this._makeShadow();
    this._makeTargets();
    this.ready = true;
  },
  _program(name, vsSrc, fsSrc) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader ' + name + (type === gl.VERTEX_SHADER ? ' (vertex)' : ' (fragment)') + ': ' + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    const vs = mk(gl.VERTEX_SHADER, vsSrc), fs = mk(gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('program ' + name + ': ' + gl.getProgramInfoLog(prog));
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (gl._label) gl._label(prog, name);
    const locs = {};
    return { prog, name, u(n) { if (!(n in locs)) locs[n] = gl.getUniformLocation(prog, n); return locs[n]; } };
  },
  _compile() {
    const gl = this.gl, S = SHADERS, P = this.P;
    P.terrain = this._program('terrain', S.terrainVS, S.terrainFS);
    P.static = this._program('static', S.staticVS, S.staticFS);
    P.prim = this._program('prim', S.primVS, S.primFS);
    P.nature = this._program('nature', S.natureVS, S.natureFS);
    P.grass = this._program('grass', S.grassVS, S.grassFS);
    P.sky = this._program('sky', S.screenVS, S.skyFS);
    P.water = this._program('water', S.waterVS, S.waterFS);
    P.zone = this._program('zone', S.zoneVS, S.zoneFS);
    P.particle = this._program('particle', S.particleVS, S.particleFS);
    P.beam = this._program('beam', S.beamVS, S.beamFS);
    P.depth = this._program('depth', S.depthVS, S.depthFS);
    P.primShadow = this._program('primShadow', S.primShadowVS, S.depthFS);
    P.natureShadow = this._program('natureShadow', S.natureShadowVS, S.depthFS);
    P.bloomDown = this._program('bloomDown', S.postVS, S.bloomDownFS);
    P.bloomUp = this._program('bloomUp', S.postVS, S.bloomUpFS);
    P.composite = this._program('composite', S.postVS, S.compositeFS);
    // fixed texture units: 0 scene/source, 1 bloom/heightmap, 3 shadow map
    for (const k in P) {
      const p = P[k];
      gl.useProgram(p.prog);
      gl.uniform1i(p.u('uShadowMap'), 3);
      gl.uniform1i(p.u('uHeightTex'), 1);
      gl.uniform1i(p.u('uTex'), 0);
      gl.uniform1i(p.u('uScene'), 0);
      gl.uniform1i(p.u('uBloom'), 1);
    }
    gl.useProgram(null);
  },
  _buf(target, data, usage) {
    const gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(target, b); gl.bufferData(target, data, usage || gl.STATIC_DRAW);
    return b;
  },
  // Non-instanced mesh: attributes 0 = position, 1 = normal, 2 = colour (3 or 4 components)
  _mesh(mesh, colorSize) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this._buf(gl.ARRAY_BUFFER, mesh.positions); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this._buf(gl.ARRAY_BUFFER, mesh.normals); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    this._buf(gl.ARRAY_BUFFER, mesh.colors); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, colorSize, gl.FLOAT, false, 0, 0);
    this._buf(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
    gl.bindVertexArray(null);
    return { vao, count: mesh.indices.length };
  },
  // Instanced mesh: base attributes as above (+ optional colour) and per-instance vec4 attributes starting at location 3.
  _instanced(mesh, nInstAttrs, cap, colorSize) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this._buf(gl.ARRAY_BUFFER, mesh.positions); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this._buf(gl.ARRAY_BUFFER, mesh.normals); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    if (colorSize) { this._buf(gl.ARRAY_BUFFER, mesh.colors); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, colorSize, gl.FLOAT, false, 0, 0); }
    this._buf(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
    const stride = nInstAttrs * 16;
    const ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferData(gl.ARRAY_BUFFER, Math.max(1, cap) * stride, gl.DYNAMIC_DRAW);
    for (let k = 0; k < nInstAttrs; k++) { gl.enableVertexAttribArray(3 + k); gl.vertexAttribPointer(3 + k, 4, gl.FLOAT, false, stride, k * 16); gl.vertexAttribDivisor(3 + k, 1); }
    gl.bindVertexArray(null);
    return { vao, ibuf, count: mesh.indices.length, cap: Math.max(1, cap), floats: nInstAttrs * 4 };
  },
  // Sprite-like instanced quad: attribute 0 = vec2 corner
  _instancedQuad(corners, nInstAttrs, cap) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this._buf(gl.ARRAY_BUFFER, new Float32Array(corners)); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this._buf(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array([0, 1, 2, 0, 2, 3]));
    const stride = nInstAttrs * 16, ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferData(gl.ARRAY_BUFFER, cap * stride, gl.DYNAMIC_DRAW);
    for (let k = 0; k < nInstAttrs; k++) { gl.enableVertexAttribArray(3 + k); gl.vertexAttribPointer(3 + k, 4, gl.FLOAT, false, stride, k * 16); gl.vertexAttribDivisor(3 + k, 1); }
    gl.bindVertexArray(null);
    return { vao, ibuf, count: 6, cap, floats: nInstAttrs * 4 };
  },
  _staticGeometry() {
    const gl = this.gl;
    // fullscreen triangle
    this.triVao = gl.createVertexArray(); gl.bindVertexArray(this.triVao);
    this._buf(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3])); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // water: coarse grid so interpolation stays precise
    { const R = 3600, n = 12, pos = [], idx = [];
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) pos.push(-R + 2 * R * i / n, 0, -R + 2 * R * j / n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, c = d + 1; idx.push(a, d, c, a, c, b); }
      this.waterVao = gl.createVertexArray(); gl.bindVertexArray(this.waterVao);
      this._buf(gl.ARRAY_BUFFER, new Float32Array(pos)); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      this._buf(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx)); this.waterCount = idx.length; }
    // zone wall cylinder
    { const n = 128, pos = [], uv = [], idx = [];
      for (let k = 0; k <= n; k++) { const a = k / n * TAU; pos.push(Math.cos(a), 0, Math.sin(a), Math.cos(a), 1, Math.sin(a)); uv.push(k / n, 0, k / n, 1); }
      for (let k = 0; k < n; k++) { const a = k * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      this.zoneVao = gl.createVertexArray(); gl.bindVertexArray(this.zoneVao);
      this._buf(gl.ARRAY_BUFFER, new Float32Array(pos)); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      this._buf(gl.ARRAY_BUFFER, new Float32Array(uv)); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      this._buf(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx)); this.zoneCount = idx.length; }
    gl.bindVertexArray(null);
    this.particleGeo = this._instancedQuad([-1, -1, 1, -1, 1, 1, -1, 1], 3, 4000);
    this.beamGeo = this._instancedQuad([0, -1, 1, -1, 1, 1, 0, 1], 3, 1200);
    this.primGeo = {};
    for (const k in Prims) this.primGeo[k] = this._instanced(PrimShapes[k](), 5, Prims[k].cap, 0);
    // grass tuft
    { const b = new MeshBuilder(), w = 0.065, col = [1, 1, 1];
      for (let k = 0; k < 3; k++) {
        const a = k * 1.05 + 0.3, c = Math.cos(a), s = Math.sin(a), ox = Math.cos(a * 2.3) * 0.12, oz = Math.sin(a * 2.3) * 0.12;
        const P = (lx, y, lz) => [ox + lx * c + lz * s, y, oz - lx * s + lz * c];
        const lean = 0.22;
        b.quad(P(-w, 0, 0), P(w, 0, 0), P(w * 0.6, 0.55, lean * 0.4), P(-w * 0.6, 0.55, lean * 0.4), col, 0);
        b.tri(P(-w * 0.6, 0.55, lean * 0.4), P(w * 0.6, 0.55, lean * 0.4), P(0, 1, lean), col, 0);
      }
      this.grassGeo = this._instanced(b.build(), 2, 9000, 0); this.grassData = new Float32Array(9000 * 8); this.grassCount = 0; this.grassCx = 1e9; this.grassCz = 1e9; }
  },
  _tex(w, h, internal, format, type, filter, data) {
    const gl = this.gl, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  },
  _makeShadow() {
    const gl = this.gl, res = this.Q.shadow;
    if (this.shadow) { gl.deleteTexture(this.shadow.tex); gl.deleteFramebuffer(this.shadow.fbo); }
    const tex = this._tex(res, res, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.shadow = { tex, fbo, res, ok };
  },
  _freeTargets() {
    const gl = this.gl, T = this.targets;
    if (!T) return;
    for (const t of T.textures) gl.deleteTexture(t);
    for (const r of T.renderbuffers) gl.deleteRenderbuffer(r);
    for (const f of T.fbos) gl.deleteFramebuffer(f);
    this.targets = null;
  },
  _makeTargets() {
    const gl = this.gl, w = this.canvas.width, h = this.canvas.height;
    this._freeTargets();
    this.direct = !(this.Q.post && this.hdr);
    if (this.direct) return;
    const T = this.targets = { textures: [], renderbuffers: [], fbos: [], w, h, bloom: [] };
    let ok = true;
    const fboTex = (tex, depthRb) => {
      const f = gl.createFramebuffer(); T.fbos.push(f);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (depthRb) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) ok = false;
      return f;
    };
    const rb = (samples, fmt) => {
      const r = gl.createRenderbuffer(); T.renderbuffers.push(r);
      gl.bindRenderbuffer(gl.RENDERBUFFER, r);
      if (samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, fmt, w, h);
      return r;
    };
    try {
      const samples = Math.min(this.Q.msaa, gl.getParameter(gl.MAX_SAMPLES) || 0);
      T.sceneTex = this._tex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR); T.textures.push(T.sceneTex);
      if (samples > 1) {
        T.resolveFbo = fboTex(T.sceneTex, null);
        const c = rb(samples, gl.RGBA16F), d = rb(samples, gl.DEPTH_COMPONENT24);
        const f = gl.createFramebuffer(); T.fbos.push(f);
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, c);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) ok = false;
        T.sceneFbo = f; T.msaa = true;
      } else {
        T.sceneFbo = fboTex(T.sceneTex, rb(0, gl.DEPTH_COMPONENT24)); T.msaa = false;
      }
      let bw = w, bh = h;
      for (let i = 0; i < 5; i++) {
        bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
        const tex = this._tex(bw, bh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR); T.textures.push(tex);
        T.bloom.push({ tex, fbo: fboTex(tex, null), w: bw, h: bh });
      }
    } catch (e) { ok = false; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!ok) { this._freeTargets(); this.direct = true; }
  },
  setQuality(q) {
    if (!this.QUALITY[q]) return;
    const oldShadow = this.Q.shadow;
    this.quality = q; this.Q = this.QUALITY[q];
    if (this.Q.shadow !== oldShadow) this._makeShadow();
    this.grassCx = 1e9;
    this._sized = null;
  },
  // Match the drawing buffer to the CSS size. Returns true when the size changed.
  resize(cssW, cssH, dpr) {
    const k = Math.min(dpr || 1, this.Q.maxDpr) * this.scale;
    const w = Math.max(64, Math.floor(cssW * k)), h = Math.max(64, Math.floor(cssH * k));
    const key = w + 'x' + h + this.quality;
    if (this._sized === key) return false;
    this._sized = key;
    this.canvas.width = w; this.canvas.height = h;
    this._makeTargets();
    return true;
  },

  // ------------------------------------------------------------------ world data
  buildWorld() {
    const gl = this.gl;
    const tm = Terrain.buildMesh();
    this.terrain = this._mesh(tm, 3);
    this.terrain.chunks = tm.chunks;
    this.staticMeshes = World.meshes.map(m => { const o = this._mesh(m, 4); o.c = m.center; o.r = m.radius; return o; });
    // heightmap for the water shader
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.heightTex = this._tex(Terrain.N, Terrain.N, gl.R16F, gl.RED, gl.FLOAT, gl.LINEAR, Terrain.h);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // nature
    const nm = NatureModels.build();
    const perType = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < World.treeCount; i++) perType[World.trees[i * 8 + 7]]++;
    this.treeGeo = []; this.treeBuf = [];
    for (let t = 0; t < 6; t++) {
      this.treeGeo.push([this._instanced(nm.trees[t], 2, perType[t], 4), this._instanced(nm.treesLod[t], 2, perType[t], 4)]);
      this.treeBuf.push([{ data: new Float32Array(Math.max(1, perType[t]) * 8), count: 0 }, { data: new Float32Array(Math.max(1, perType[t]) * 8), count: 0 }]);
    }
    const perRock = [0, 0, 0];
    for (let i = 0; i < World.rockCount; i++) perRock[World.rocks[i * 8 + 6]]++;
    this.rockGeo = []; this.rockBuf = [];
    for (let v = 0; v < 3; v++) { this.rockGeo.push(this._instanced(nm.rocks[v], 2, perRock[v], 4)); this.rockBuf.push({ data: new Float32Array(Math.max(1, perRock[v]) * 8), count: 0 }); }
    this.TREE_TINTS = [
      [[0.86, 0.95, 0.9], [1.12, 1.08, 0.86]],     // pine
      [[1.0, 0.92, 0.7], [1.08, 0.72, 0.5]],       // birch (yellow -> orange)
      [[1.08, 0.82, 0.62], [0.82, 0.42, 0.42]],    // maple (orange -> crimson)
      [[0.86, 1.0, 0.8], [1.15, 1.05, 0.62]],      // green broadleaf
      [[1, 1, 1], [1, 1, 1]],
      [[0.85, 1.0, 0.8], [1.25, 0.8, 0.5]],        // bush
    ];
  },
  _updateGrass(cx, cz) {
    const dens = this.Q.grass;
    this.grassCount = 0;
    if (!dens) return;
    const R = 50, step = dens >= 1 ? 0.95 : 1.3, d = this.grassData, c = [0, 0, 0];
    const x0 = Math.floor((cx - R) / step), x1 = Math.ceil((cx + R) / step), z0 = Math.floor((cz - R) / step), z1 = Math.ceil((cz + R) / step);
    let n = 0;
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const h1 = hash2i(gx, gz, 11);
      if (h1 > 0.62) continue;
      const x = (gx + hash2i(gx, gz, 23)) * step, z = (gz + hash2i(gx, gz, 37)) * step;
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz > R * R) continue;
      const h = Terrain.height(x, z);
      if (h < 2.9 || h > 70) continue;
      Terrain.colorAt(x, z, c);
      if (c[1] < c[0] * 1.02 || c[1] < c[2] * 1.5) continue;
      if (Terrain.steepness(x, z) > 0.55) continue;
      if (n >= 9000) break;
      const o = n * 8, v = 0.85 + hash2i(gx, gz, 51) * 0.4;
      d[o] = x; d[o + 1] = h - 0.03; d[o + 2] = z; d[o + 3] = 0.26 + hash2i(gx, gz, 67) * 0.34;
      d[o + 4] = c[0] * v * 1.05; d[o + 5] = c[1] * v * 1.12; d[o + 6] = c[2] * v; d[o + 7] = hash2i(gx, gz, 83);
      n++;
    }
    this.grassCount = n; this.grassCx = cx; this.grassCz = cz;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.grassGeo.ibuf);
    if (n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n * 8);
  },

  // ------------------------------------------------------------------ per-frame helpers
  _common(p, viewProj) {
    const gl = this.gl, s = this.scene, e = s.env;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u('uViewProj'), false, viewProj || s.cam.viewProj);
    gl.uniform3fv(p.u('uCamPos'), s.cam.pos);
    gl.uniform3fv(p.u('uSunDir'), e.sunDir);
    gl.uniform3fv(p.u('uSunColor'), e.sunColor);
    gl.uniform3fv(p.u('uAmbSky'), e.ambSky);
    gl.uniform3fv(p.u('uAmbGround'), e.ambGround);
    gl.uniform3fv(p.u('uFogColor'), e.fogColor);
    gl.uniform3fv(p.u('uFogSun'), e.fogSun);
    gl.uniform4f(p.u('uFogParams'), e.fogDensity, e.lamp, e.cloudShadow, 0);
    gl.uniform1f(p.u('uTime'), s.time);
    gl.uniformMatrix4fv(p.u('uShadowMat'), false, this._shadowMat);
    gl.uniform4f(p.u('uShadowParams'), this._shadowOn ? 1 : 0, 1 / this.shadow.res, this.SHADOW_EXTENT * 0.78, this.SHADOW_EXTENT * 0.96);
    gl.uniform3fv(p.u('uShadowCenter'), this._shadowCenter);
    gl.uniform4f(p.u('uZone'), s.zone.x, s.zone.z, s.zone.r, s.zone.enabled ? 1 : 0);
    gl.uniform3fv(p.u('uZoneColor'), e.zoneColor);
    gl.uniform1f(p.u('uDirect'), this.direct ? 1 : 0);
    gl.uniform1f(p.u('uExposure'), e.exposure);
  },
  _drawInstanced(geo, data, count) {
    if (!count) return;
    const gl = this.gl;
    count = Math.min(count, geo.cap);
    gl.bindVertexArray(geo.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.ibuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * geo.floats);
    gl.drawElementsInstanced(gl.TRIANGLES, geo.count, gl.UNSIGNED_INT, 0, count);
    this.stats.draws++; this.stats.tris += geo.count / 3 * count;
  },
  _redrawInstanced(geo, count) {
    if (!count) return;
    const gl = this.gl;
    gl.bindVertexArray(geo.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, geo.count, gl.UNSIGNED_INT, 0, Math.min(count, geo.cap));
    this.stats.draws++;
  },
  _computeShadow() {
    const s = this.scene, e = s.env, S = this.SHADOW_EXTENT, res = this.shadow.res;
    const f = s.cam.fwd;
    const fl = Math.hypot(f[0], f[2]) || 1;
    let fx = s.cam.pos[0] + f[0] / fl * S * 0.55, fz = s.cam.pos[2] + f[2] / fl * S * 0.55, fy = s.focusY === undefined ? s.cam.pos[1] : s.focusY;
    const L = e.sunDir, v = this._lv;
    m4.lookAt(v, fx + L[0] * 320, fy + L[1] * 320, fz + L[2] * 320, fx, fy, fz, 0, 1, 0);
    // snap the focus to shadow-map texels to stop shimmering
    const texel = 2 * S / res;
    const rx = v[0], ry = v[4], rz = v[8], ux = v[1], uy = v[5], uz = v[9];
    const lx = rx * fx + ry * fy + rz * fz, ly = ux * fx + uy * fy + uz * fz;
    const sx = Math.round(lx / texel) * texel - lx, sy = Math.round(ly / texel) * texel - ly;
    fx += rx * sx + ux * sy; fy += ry * sx + uy * sy; fz += rz * sx + uz * sy;
    m4.lookAt(v, fx + L[0] * 320, fy + L[1] * 320, fz + L[2] * 320, fx, fy, fz, 0, 1, 0);
    m4.ortho(this._lp, -S, S, -S, S, 120, 560);
    m4.multiply(this._shadowMat, this._lp, v);
    this._shadowCenter = [fx, fy, fz];
  },
  _cullNature() {
    const s = this.scene, cam = s.cam.pos, fr = this.frustum, maxD = this.Q.treeDist, maxD2 = maxD * maxD;
    const T = World.trees, lodD2 = 105 * 105;
    for (let t = 0; t < 6; t++) { this.treeBuf[t][0].count = 0; this.treeBuf[t][1].count = 0; }
    for (let i = 0, n = World.treeCount; i < n; i++) {
      const o = i * 8, x = T[o], y = T[o + 1], z = T[o + 2], sc = T[o + 3];
      const dx = x - cam[0], dz = z - cam[2], d2 = dx * dx + dz * dz;
      if (d2 > maxD2) continue;
      if (d2 > 1600 && !fr.sphere(x, y + 4 * sc, z, 6.5 * sc)) continue;
      const type = T[o + 7];
      if (type === 5 && d2 > 200 * 200) continue;
      const b = this.treeBuf[type][d2 < lodD2 ? 0 : 1], q = b.count * 8, d = b.data;
      // fade trees out near the far limit by shrinking them
      const fade = d2 > maxD2 * 0.8 ? 1 - (Math.sqrt(d2) - maxD * 0.894) / (maxD * 0.106) : 1;
      d[q] = x; d[q + 1] = y; d[q + 2] = z; d[q + 3] = sc * (fade < 0 ? 0 : fade);
      d[q + 4] = T[o + 4]; d[q + 5] = T[o + 5]; d[q + 6] = T[o + 6]; d[q + 7] = 1;
      b.count++;
    }
    const Rk = World.rocks;
    for (let v = 0; v < 3; v++) this.rockBuf[v].count = 0;
    for (let i = 0, n = World.rockCount; i < n; i++) {
      const o = i * 8, x = Rk[o], y = Rk[o + 1], z = Rk[o + 2], sc = Rk[o + 3];
      const dx = x - cam[0], dz = z - cam[2], d2 = dx * dx + dz * dz;
      const lim = 140 + sc * 130;
      if (d2 > lim * lim) continue;
      if (d2 > 900 && !fr.sphere(x, y, z, sc * 1.3)) continue;
      const b = this.rockBuf[Rk[o + 6]], q = b.count * 8, d = b.data;
      d[q] = x; d[q + 1] = y; d[q + 2] = z; d[q + 3] = sc; d[q + 4] = Rk[o + 4]; d[q + 5] = (Rk[o + 5] - 0.82) / 0.3; d[q + 6] = 0; d[q + 7] = Rk[o + 7];
      b.count++;
    }
  },

  // ------------------------------------------------------------------ frame
  // scene: { time, focusY, cam:{pos,fwd,right,up,viewProj,invViewProj}, env:{...}, zone:{x,z,r,enabled}, fx:{vignette,zoneTint,damage,desat},
  //          particles:{data,count}, beams:{data,count} }
  render(scene) {
    const gl = this.gl, P = this.P, Q = this.Q;
    this.scene = scene;
    const e = scene.env;
    this.stats.draws = 0; this.stats.tris = 0;
    this.frustum.set(scene.cam.viewProj);
    this._cullNature();
    if (Math.abs(scene.cam.pos[0] - this.grassCx) + Math.abs(scene.cam.pos[2] - this.grassCz) > 7) this._updateGrass(scene.cam.pos[0], scene.cam.pos[2]);
    this._shadowOn = this.shadow.ok && e.shadowStrength > 0.02;
    this._computeShadow();
    const W = this.canvas.width, H = this.canvas.height;

    // upload dynamic instance data once (shared by the shadow and colour passes)
    const upload = (geo, data, count) => { if (!count) return; gl.bindBuffer(gl.ARRAY_BUFFER, geo.ibuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, Math.min(count, geo.cap) * geo.floats); };
    for (const k in Prims) upload(this.primGeo[k], Prims[k].data, Prims[k].count);
    for (let t = 0; t < 6; t++) for (let l = 0; l < 2; l++) upload(this.treeGeo[t][l], this.treeBuf[t][l].data, this.treeBuf[t][l].count);
    for (let v = 0; v < 3; v++) upload(this.rockGeo[v], this.rockBuf[v].data, this.rockBuf[v].count);

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

    // ---- shadow map
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, null);
    if (this._shadowOn) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fbo);
      gl.viewport(0, 0, this.shadow.res, this.shadow.res);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2.0, 4.0);
      const sc = this._shadowCenter, lim = this.SHADOW_EXTENT * 1.5;
      gl.useProgram(P.depth.prog);
      gl.uniformMatrix4fv(P.depth.u('uViewProj'), false, this._shadowMat);
      for (const m of this.staticMeshes) {
        if (Math.hypot(m.c[0] - sc[0], m.c[2] - sc[2]) > m.r + lim) continue;
        gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); this.stats.draws++;
      }
      gl.useProgram(P.natureShadow.prog);
      gl.uniformMatrix4fv(P.natureShadow.u('uViewProj'), false, this._shadowMat);
      gl.uniform1f(P.natureShadow.u('uTime'), scene.time);
      gl.uniform1f(P.natureShadow.u('uWind'), e.wind);
      for (let t = 0; t < 6; t++) this._redrawInstanced(this.treeGeo[t][0], this.treeBuf[t][0].count);
      gl.uniform1f(P.natureShadow.u('uWind'), 0);
      for (let v = 0; v < 3; v++) this._redrawInstanced(this.rockGeo[v], this.rockBuf[v].count);
      gl.useProgram(P.primShadow.prog);
      gl.uniformMatrix4fv(P.primShadow.u('uViewProj'), false, this._shadowMat);
      for (const k in Prims) this._redrawInstanced(this.primGeo[k], Prims[k].count);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // ---- main colour pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.direct ? null : this.targets.sceneFbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(e.fogColor[0], e.fogColor[1], e.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    gl.activeTexture(gl.TEXTURE0);

    // sky
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    this._common(P.sky);
    gl.uniformMatrix4fv(P.sky.u('uInvViewProj'), false, scene.cam.invViewProj);
    gl.uniform3fv(P.sky.u('uSkyTop'), e.skyTop); gl.uniform3fv(P.sky.u('uSkyHorizon'), e.skyHorizon); gl.uniform3fv(P.sky.u('uSunGlow'), e.sunGlow);
    gl.uniform4f(P.sky.u('uSkyParams'), e.stars, e.aurora, e.clouds, e.sunDisc);
    gl.bindVertexArray(this.triVao); gl.drawArrays(gl.TRIANGLES, 0, 3); this.stats.draws++;
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.CULL_FACE);

    // terrain
    this._common(P.terrain);
    gl.uniform3fv(P.terrain.u('uWaterDeep'), e.waterDeep);
    gl.bindVertexArray(this.terrain.vao);
    for (const c of this.terrain.chunks) {
      if (!this.frustum.sphere(c.cx, c.cy, c.cz, c.radius)) continue;
      gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, c.start * 4); this.stats.draws++; this.stats.tris += c.count / 3;
    }
    // static structures
    this._common(P.static);
    for (const m of this.staticMeshes) {
      if (!this.frustum.sphere(m.c[0], m.c[1], m.c[2], m.r)) continue;
      gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); this.stats.draws++; this.stats.tris += m.count / 3;
    }
    // trees and rocks
    this._common(P.nature);
    gl.uniform1f(P.nature.u('uWind'), e.wind); gl.uniform1f(P.nature.u('uWrap'), 0.45);
    for (let t = 0; t < 6; t++) {
      gl.uniform3fv(P.nature.u('uTintA'), this.TREE_TINTS[t][0]); gl.uniform3fv(P.nature.u('uTintB'), this.TREE_TINTS[t][1]);
      this._redrawInstanced(this.treeGeo[t][0], this.treeBuf[t][0].count);
      this._redrawInstanced(this.treeGeo[t][1], this.treeBuf[t][1].count);
    }
    gl.uniform1f(P.nature.u('uWind'), 0); gl.uniform1f(P.nature.u('uWrap'), 0);
    gl.uniform3f(P.nature.u('uTintA'), 0.78, 0.78, 0.8); gl.uniform3f(P.nature.u('uTintB'), 1.12, 1.1, 1.04);
    for (let v = 0; v < 3; v++) this._redrawInstanced(this.rockGeo[v], this.rockBuf[v].count);
    // grass
    if (this.grassCount) {
      gl.disable(gl.CULL_FACE);
      this._common(P.grass);
      gl.uniform2f(P.grass.u('uGrassFade'), 34, 49);
      this._redrawInstanced(this.grassGeo, this.grassCount);
      gl.enable(gl.CULL_FACE);
    }
    // dynamic primitives
    this._common(P.prim);
    for (const k in Prims) this._redrawInstanced(this.primGeo[k], Prims[k].count);

    // water
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
    this._common(P.water);
    gl.uniform3fv(P.water.u('uSkyTop'), e.skyTop); gl.uniform3fv(P.water.u('uSkyHorizon'), e.skyHorizon); gl.uniform3fv(P.water.u('uSunGlow'), e.sunGlow);
    gl.uniform3fv(P.water.u('uWaterDeep'), e.waterDeep); gl.uniform3fv(P.water.u('uWaterShallow'), e.waterShallow);
    gl.uniform2f(P.water.u('uHtParams'), 1 / (Terrain.CELL * Terrain.N), (Terrain.HALF / Terrain.CELL + 0.5) / Terrain.N);
    gl.bindVertexArray(this.waterVao); gl.drawElements(gl.TRIANGLES, this.waterCount, gl.UNSIGNED_INT, 0); this.stats.draws++;

    // additive / translucent effects
    gl.depthMask(false); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (scene.zone.enabled && scene.zone.r > 0.5) {
      this._common(P.zone);
      gl.uniform4f(P.zone.u('uZoneGeo'), scene.zone.x, scene.zone.z, scene.zone.r, 230);
      gl.uniform1f(P.zone.u('uZoneBase'), -16);
      gl.uniform3fv(P.zone.u('uZoneColor2'), e.zoneColor2);
      gl.bindVertexArray(this.zoneVao); gl.drawElements(gl.TRIANGLES, this.zoneCount, gl.UNSIGNED_INT, 0); this.stats.draws++;
    }
    if (scene.beams && scene.beams.count) {
      const p = P.beam;
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.u('uViewProj'), false, scene.cam.viewProj); gl.uniform3fv(p.u('uCamPos'), scene.cam.pos);
      gl.uniform1f(p.u('uDirect'), this.direct ? 1 : 0); gl.uniform1f(p.u('uExposure'), e.exposure);
      this._drawInstanced(this.beamGeo, scene.beams.data, scene.beams.count);
    }
    if (scene.particles && scene.particles.count) {
      const p = P.particle;
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.u('uViewProj'), false, scene.cam.viewProj);
      gl.uniform3fv(p.u('uCamRight'), scene.cam.right); gl.uniform3fv(p.u('uCamUp'), scene.cam.up);
      gl.uniform1f(p.u('uDirect'), this.direct ? 1 : 0); gl.uniform1f(p.u('uExposure'), e.exposure);
      this._drawInstanced(this.particleGeo, scene.particles.data, scene.particles.count);
    }
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);

    if (!this.direct) this._post(scene);
  },
  _post(scene) {
    const gl = this.gl, P = this.P, T = this.targets, e = scene.env, W = T.w, H = T.h;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    if (T.msaa) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.sceneFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.resolveFbo);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }
    gl.bindVertexArray(this.triVao);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    const B = T.bloom, useBloom = this.Q.bloom > 0;
    if (useBloom) {
      gl.useProgram(P.bloomDown.prog);
      let src = T.sceneTex, sw = W, sh = H;
      for (let i = 0; i < B.length; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, B[i].fbo); gl.viewport(0, 0, B[i].w, B[i].h);
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform2f(P.bloomDown.u('uTexel'), 1 / sw, 1 / sh);
        gl.uniform1f(P.bloomDown.u('uThreshold'), i === 0 ? e.bloomThreshold : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = B[i].tex; sw = B[i].w; sh = B[i].h;
      }
      gl.useProgram(P.bloomUp.prog);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = B.length - 1; i > 0; i--) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, B[i - 1].fbo); gl.viewport(0, 0, B[i - 1].w, B[i - 1].h);
        gl.bindTexture(gl.TEXTURE_2D, B[i].tex);
        gl.uniform2f(P.bloomUp.u('uTexel'), 1 / B[i].w, 1 / B[i].h);
        gl.uniform1f(P.bloomUp.u('uGain'), 0.9);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(P.composite.prog);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B[0].tex);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.sceneTex);
    gl.uniform1f(P.composite.u('uBloomStrength'), useBloom ? e.bloomStrength : 0);
    gl.uniform1f(P.composite.u('uExposure'), e.exposure);
    const fx = scene.fx || {};
    gl.uniform4f(P.composite.u('uFx'), fx.vignette === undefined ? 0.9 : fx.vignette, fx.zoneTint || 0, fx.damage || 0, fx.desat || 0);
    gl.uniform3fv(P.composite.u('uTint'), e.zoneTint);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.CULL_FACE);
  },
};
