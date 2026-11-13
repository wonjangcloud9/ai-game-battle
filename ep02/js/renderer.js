// AURORA FALL — WebGL2 renderer (no external libraries)
'use strict';

// Instanced model batches filled every frame by the presentation code (weapons, loot, props, vehicles).
// Per instance: 4x4 matrix, tint rgb + emissive scale, sky visibility / indoor glow / flash.
class ModelBatch {
  constructor(cap) { this.cap = cap; this.data = new Float32Array(cap * 24); this.count = 0; }
  add(m, r, g, b, e, sky, lamp, flash) {
    if (this.count >= this.cap) return;
    const o = this.count * 24, d = this.data;
    for (let i = 0; i < 16; i++) d[o + i] = m[i];
    d[o + 16] = r; d[o + 17] = g; d[o + 18] = b; d[o + 19] = e === undefined ? 1 : e;
    d[o + 20] = sky === undefined ? 1 : sky; d[o + 21] = lamp || 0; d[o + 22] = flash || 0; d[o + 23] = 0;
    this.count++;
  }
}
const Batches = {};               // model name -> ModelBatch (created by Renderer.buildWorld from Models.build())
// Skinned characters: bone matrices go into a float texture (one row per character), the rest is per instance.
const SkinBatch = {
  MAX: 64, BONES: 24, rows: 0,
  bones: new Float32Array(64 * 24 * 12),
  inst: [new Float32Array(64 * 16), new Float32Array(64 * 16)], count: [0, 0],
  reset() { this.rows = 0; this.count[0] = 0; this.count[1] = 0; },
  // returns the offset into `bones` where 12 floats per bone (rows of the 3x4 matrix) must be written, or -1 if full
  add(lod, flash, sky, lamp, suit, pants, skin) {
    if (this.rows >= this.MAX) return -1;
    const row = this.rows++, d = this.inst[lod], o = this.count[lod]++ * 16;
    d[o] = row; d[o + 1] = flash; d[o + 2] = sky; d[o + 3] = lamp;
    d[o + 4] = suit[0]; d[o + 5] = suit[1]; d[o + 6] = suit[2]; d[o + 7] = 0;
    d[o + 8] = pants[0]; d[o + 9] = pants[1]; d[o + 10] = pants[2]; d[o + 11] = 0;
    d[o + 12] = skin[0]; d[o + 13] = skin[1]; d[o + 14] = skin[2]; d[o + 15] = 0;
    return row * this.BONES * 12;
  },
};
function resetBatches() { for (const k in Batches) Batches[k].count = 0; SkinBatch.reset(); }

const Renderer = {
  gl: null, canvas: null, ready: false, direct: true, hdr: false,
  quality: 'high', Q: null,
  // grass: spacing of the clumps in metres (0 = none), grassR: how far it reaches, lod0 / lod1: tree detail distances,
  // farEvery: the wide shadow cascade is redrawn every n-th frame (1 = even frame pacing, 2 = half the cost)
  QUALITY: {
    low: { post: false, msaa: 0, shadowNear: 0, shadowFar: 1024, maxDpr: 1.0, grass: 0, grassR: 0, treeDist: 380, lod0: 40, lod1: 140, ao: false, tex: 256, aniso: 2, plants: 0, farEvery: 2 },
    medium: { post: true, msaa: 2, shadowNear: 1024, shadowFar: 1024, maxDpr: 1.25, grass: 0.62, grassR: 36, treeDist: 480, lod0: 55, lod1: 190, ao: false, tex: 512, aniso: 2, plants: 55, farEvery: 2 },
    high: { post: true, msaa: 4, shadowNear: 2048, shadowFar: 2048, maxDpr: 1.5, grass: 0.45, grassR: 48, treeDist: 560, lod0: 72, lod1: 230, ao: true, tex: 512, aniso: 4, plants: 80, farEvery: 1 },
    ultra: { post: true, msaa: 4, shadowNear: 4096, shadowFar: 2048, maxDpr: 2.0, grass: 0.38, grassR: 60, treeDist: 640, lod0: 95, lod1: 280, ao: true, tex: 512, aniso: 8, plants: 105, farEvery: 1 },
  },
  scale: 1, P: {}, stats: { draws: 0, tris: 0 },
  NEAR_EXTENT: 24, FAR_EXTENT: 112,
  // set by the frame-rate governor (main.js): effects that are dropped before the picture gets choppy
  auto: { ao: true, grass: 1 },
  grassBudget: 2,                 // grass chunks built per frame
  texSize: 0,                     // override of the material texture size (dev harness)
  frustum: makeFrustum(), _tmp: m4.create(),
  targets: null, shadowNear: null, shadowFar: null,
  _casc: [{ mat: m4.create(), view: m4.create(), proj: m4.create(), c: [0, 0, 0], S: 1 }, { mat: m4.create(), view: m4.create(), proj: m4.create(), c: [0, 0, 0], S: 1 }],
  _nearFirst(a, b) { return a.d2 - b.d2; },
  _noLights: [], LIGHT_P: ['uLightP0', 'uLightP1', 'uLightP2', 'uLightP3'], LIGHT_C: ['uLightC0', 'uLightC1', 'uLightC2', 'uLightC3'],

  // ------------------------------------------------------------------ setup
  // Start up. With defer = true only the context is created and the shaders are handed to the driver; the caller then
  // calls finish() (and can show progress in between while the browser compiles in the background).
  init(canvas, quality, defer) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2를 사용할 수 없습니다. 최신 Chrome / Edge / Firefox / Safari에서 열어 주세요.');
    this.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('OES_texture_float_linear');
    this.anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
    this.quality = this.QUALITY[quality] ? quality : 'high';
    this.Q = this.QUALITY[this.quality];
    this._compileStart();
    this._staticGeometry();
    if (!defer) this.finish();
  },
  finish() {
    this._makeTextures();          // the CPU-side work comes first: more time for the shader compiler
    this._compileFinish();
    this._makeShadows();
    this._makeTargets();
    this.ready = true;
  },
  // fixed texture units
  UNIT: { uTex: 0, uScene: 0, uBloom: 1, uHeightTex: 1, uMat: 2, uShadowMap: 3, uShadowFar: 4, uNoise: 5, uCtl: 6, uDepth: 7, uBones: 8, uMatProps: 9 },
  // Hand every program to the driver without asking for the result yet: browsers compile them in parallel that way.
  _compileStart() {
    const gl = this.gl, S = SHADERS;
    const mk = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
    this._pending = [];
    for (const name in S.PROGRAMS) {
      const prog = gl.createProgram(), vs = mk(gl.VERTEX_SHADER, S[S.PROGRAMS[name][0]]), fs = mk(gl.FRAGMENT_SHADER, S[S.PROGRAMS[name][1]]);
      gl.attachShader(prog, vs); gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      this._pending.push({ name, prog, vs, fs });
    }
  },
  // Collect the results (a slow compile is waited for here) and report a failure with the driver's own log.
  _compileFinish() {
    const gl = this.gl, P = this.P;
    this.noAo = false;
    for (const q of this._pending) {
      let err = '';
      if (!gl.getProgramParameter(q.prog, gl.LINK_STATUS)) {
        if (!gl.getShaderParameter(q.vs, gl.COMPILE_STATUS)) err = 'shader ' + q.name + ' (vertex): ' + gl.getShaderInfoLog(q.vs);
        else if (!gl.getShaderParameter(q.fs, gl.COMPILE_STATUS)) err = 'shader ' + q.name + ' (fragment): ' + gl.getShaderInfoLog(q.fs);
        else err = 'program ' + q.name + ': ' + gl.getProgramInfoLog(q.prog);
      }
      gl.deleteShader(q.vs); gl.deleteShader(q.fs);
      if (err) {
        if (q.name !== 'ssao' && q.name !== 'aoApply') {
          // one more try with the conservative form of the shadow lookups before giving up
          if (this._plainShadows) throw new Error(err);
          this._plainShadows = true;
          if (typeof console !== 'undefined') console.warn(err);
          for (const r of this._pending) { gl.deleteShader(r.vs); gl.deleteShader(r.fs); gl.deleteProgram(r.prog); }
          for (const k in P) delete P[k];
          SHADERS.plainShadowLookups();
          this._compileStart();
          return this._compileFinish();
        }
        // the contact-shadow pass is an extra: without it the game simply draws without it
        this.noAo = true;
        if (typeof console !== 'undefined') console.warn(err);
        continue;
      }
      if (gl._label) gl._label(q.prog, q.name);
      const locs = {}, prog = q.prog;
      P[q.name] = { prog, name: q.name, u(n) { if (!(n in locs)) locs[n] = gl.getUniformLocation(prog, n); return locs[n]; } };
    }
    this._pending = null;
    for (const k in P) {
      gl.useProgram(P[k].prog);
      for (const u in this.UNIT) gl.uniform1i(P[k].u(u), this.UNIT[u]);
    }
    gl.useProgram(null);
  },
  _buf(target, data, usage) {
    const gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(target, b); gl.bufferData(target, data, usage || gl.STATIC_DRAW);
    return b;
  },
  _attr(loc, buf, size, stride, offset, divisor) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride || 0, offset || 0);
    if (divisor) gl.vertexAttribDivisor(loc, divisor);
  },
  // GL buffers of a MeshBuilder mesh (shared between several vertex arrays)
  _meshBuffers(mesh) {
    const gl = this.gl;
    return {
      pos: this._buf(gl.ARRAY_BUFFER, mesh.positions), nrm: this._buf(gl.ARRAY_BUFFER, mesh.normals), col: this._buf(gl.ARRAY_BUFFER, mesh.colors),
      mat: mesh.mats ? this._buf(gl.ARRAY_BUFFER, mesh.mats) : null, indices: mesh.indices, count: mesh.indices.length, colorSize: mesh.colors.length / (mesh.positions.length / 3),
    };
  },
  _bindMesh(mb) {
    const gl = this.gl;
    this._attr(0, mb.pos, 3); this._attr(1, mb.nrm, 3); this._attr(2, mb.col, mb.colorSize);
    if (mb.mat) this._attr(3, mb.mat, 4);
    this._buf(gl.ELEMENT_ARRAY_BUFFER, mb.indices);
  },
  // Non-instanced world mesh: position, normal, colour, material (+ interior lamp for buildings)
  _mesh(mesh, withLamp) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this._bindMesh(this._meshBuffers(mesh));
    if (withLamp) this._attr(4, this._buf(gl.ARRAY_BUFFER, mesh.lamps || new Float32Array(mesh.positions.length / 3 * 4)), 4);
    gl.bindVertexArray(null);
    return { vao, count: mesh.indices.length };
  },
  // Instanced mesh: per-instance vec4 attributes start at `first`.
  _instanced(mesh, first, nInstAttrs, cap, extra) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const mb = this._meshBuffers(mesh);
    this._bindMesh(mb);
    if (extra) this._attr(extra.loc, this._buf(gl.ARRAY_BUFFER, extra.data), 4);
    const stride = nInstAttrs * 16, n = Math.max(1, cap);
    const ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ibuf); gl.bufferData(gl.ARRAY_BUFFER, n * stride, gl.DYNAMIC_DRAW);
    for (let k = 0; k < nInstAttrs; k++) this._attr(first + k, ibuf, 4, stride, k * 16, 1);
    gl.bindVertexArray(null);
    return { vao, ibuf, count: mesh.indices.length, cap: n, floats: nInstAttrs * 4, mb, first, n: nInstAttrs };
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
  },
  _tex(w, h, internal, format, type, filter, data, wrap) {
    const gl = this.gl, t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap || gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap || gl.CLAMP_TO_EDGE);
    return t;
  },
  _mipmapped(target) {
    const gl = this.gl;
    gl.generateMipmap(target);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (this.anisoExt) gl.texParameterf(target, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(this.Q.aniso, gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
  },
  // procedural textures: material array, tileable noise, per-material properties, bone matrices
  _makeTextures() {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this._makeMaterials();
    const nz = TexGen.noise(256);
    this.noiseTex = this._tex(nz.size, nz.size, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, nz.data, gl.REPEAT);
    this._mipmapped(gl.TEXTURE_2D);
    this.propsTex = this._tex(32, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST, TexGen.props());
    this.boneTex = this._tex(SkinBatch.BONES * 3, SkinBatch.MAX, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  },
  _makeMaterials() {
    const gl = this.gl, size = this.texSize || this.Q.tex;
    if (this.matTex && this.matSize === size) return;
    if (this.matTex) gl.deleteTexture(this.matTex);
    const m = TexGen.build(size);
    const t = this.matTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.UNIT.uMat);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, m.size, m.size, m.layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, m.data);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this._mipmapped(gl.TEXTURE_2D_ARRAY);
    gl.activeTexture(gl.TEXTURE0);
    this.matSize = size;
  },
  _shadowTarget(res) {
    const gl = this.gl;
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
    return { tex, fbo, res, ok };
  },
  _makeShadows() {
    const gl = this.gl;
    for (const s of [this.shadowNear, this.shadowFar]) if (s) { gl.deleteTexture(s.tex); gl.deleteFramebuffer(s.fbo); }
    // the near cascade always exists (a 1x1 stand-in when it is switched off) so its sampler has something bound
    this.shadowNear = this._shadowTarget(this.Q.shadowNear || 1);
    this.shadowFar = this._shadowTarget(this.Q.shadowFar);
    this._farValid = false;
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
    const gl = this.gl;
    this._freeTargets();
    this.direct = !(this.Q.post && this.hdr);
    if (this.direct) return;
    // multisampled float targets do not exist everywhere: try plain ones before giving up on post-processing altogether
    const samples = Math.min(this.Q.msaa, gl.getParameter(gl.MAX_SAMPLES) || 0);
    if (!this._buildTargets(samples) && !(samples > 1 && this._buildTargets(0))) { this._freeTargets(); this.direct = true; }
  },
  _buildTargets(samples) {
    const gl = this.gl, w = this.canvas.width, h = this.canvas.height;
    this._freeTargets();
    const T = this.targets = { textures: [], renderbuffers: [], fbos: [], w, h, bloom: [], ao: false };
    let ok = true;
    const fboTex = (tex, depthRb) => {
      const f = gl.createFramebuffer(); T.fbos.push(f);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (depthRb) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) ok = false;
      return f;
    };
    const rb = (n, fmt) => {
      const r = gl.createRenderbuffer(); T.renderbuffers.push(r);
      gl.bindRenderbuffer(gl.RENDERBUFFER, r);
      if (n > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, n, fmt, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, fmt, w, h);
      return r;
    };
    try {
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
    // ambient occlusion: the scene depth is copied into a texture, the occlusion is computed at half resolution.
    // Optional: if any of this is unavailable the frame is simply drawn without it.
    if (ok && this.Q.ao && !this.noAo && this._aoBlit !== false) {
      try {
        let aok = true;
        T.depthTex = this._tex(w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST); T.textures.push(T.depthTex);
        const df = gl.createFramebuffer(); T.fbos.push(df);
        gl.bindFramebuffer(gl.FRAMEBUFFER, df);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, T.depthTex, 0);
        gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) aok = false;
        T.depthFbo = df;
        T.aoW = Math.max(2, w >> 1); T.aoH = Math.max(2, h >> 1);
        T.aoTex = this._tex(T.aoW, T.aoH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR); T.textures.push(T.aoTex);
        const af = gl.createFramebuffer(); T.fbos.push(af);
        gl.bindFramebuffer(gl.FRAMEBUFFER, af);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.aoTex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) aok = false;
        T.aoFbo = af;
        T.ao = aok;
      } catch (e) { T.ao = false; }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return ok;
  },
  setQuality(q) {
    if (!this.QUALITY[q]) return;
    const old = this.Q;
    this.quality = q; this.Q = this.QUALITY[q];
    if (this.Q.shadowNear !== old.shadowNear || this.Q.shadowFar !== old.shadowFar) this._makeShadows();
    this._makeMaterials();
    if (this.anisoExt) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + this.UNIT.uMat); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.matTex);
      gl.texParameterf(gl.TEXTURE_2D_ARRAY, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(this.Q.aniso, gl.getParameter(this.anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
      gl.activeTexture(gl.TEXTURE0);
    }
    this._grassClear();
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
    this.terrain = this._mesh(tm, false);
    this.terrain.chunks = tm.chunks;
    this.staticMeshes = World.meshes.map(m => { const o = this._mesh(m, true); o.c = m.center; o.r = m.radius; return o; });
    this.glassMeshes = (World.glass || []).filter(m => m.indexCount > 0).map(m => { const o = this._mesh(m, true); o.c = m.center; o.r = m.radius; return o; });
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // heightmap for the water shader, ground control map for the terrain shader
    this.heightTex = this._tex(Terrain.N, Terrain.N, gl.R16F, gl.RED, gl.FLOAT, gl.LINEAR, Terrain.h);
    this.ctlTex = this._tex(Terrain.CTL, Terrain.CTL, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, Terrain.ctl);
    this._mipmapped(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // ---- nature: per species three levels of detail, each with its own instance list
    const fm = Flora.build();
    const perType = fm.trees.map(() => 0);
    for (let i = 0; i < World.treeCount; i++) perType[World.trees[i * 8 + 7]]++;
    this.treeGeo = fm.trees.map((lods, t) => lods.map(m => this._instanced(m, 4, 2, perType[t])));
    this.treeBuf = fm.trees.map((lods, t) => lods.map(() => ({ data: new Float32Array(Math.max(1, perType[t]) * 8), count: 0 })));
    const perRock = [0, 0, 0];
    for (let i = 0; i < World.rockCount; i++) perRock[World.rocks[i * 8 + 6]]++;
    this.rockGeo = fm.rocks.map((lods, v) => lods.map(m => this._instanced(m, 4, 2, perRock[v])));
    this.rockBuf = fm.rocks.map((lods, v) => lods.map(() => ({ data: new Float32Array(Math.max(1, perRock[v]) * 8), count: 0 })));
    const PCAP = 2600;
    this.plantGeo = fm.plants.map(m => this._instanced(m, 4, 2, PCAP));
    this.plantBuf = fm.plants.map(() => ({ data: new Float32Array(PCAP * 8), count: 0 }));
    this.TREE_TINTS = [
      [[0.84, 0.96, 0.9], [1.12, 1.1, 0.84]],      // pine
      [[1.0, 0.94, 0.72], [1.08, 0.76, 0.52]],     // birch (gold -> amber)
      [[1.08, 0.86, 0.66], [0.84, 0.46, 0.44]],    // maple (orange -> crimson)
      [[0.86, 1.0, 0.8], [1.14, 1.06, 0.64]],      // green broadleaf
      [[1, 1, 1], [1, 1, 1]],
      [[0.85, 1.0, 0.8], [1.22, 0.84, 0.54]],      // shrub
    ];
    // ---- grass: shared clump geometry, per-chunk instance buffers created on demand
    this.grassMB = this._meshBuffers(Flora.grassMesh());
    this.flowerMB = this._meshBuffers(Flora.flowerMesh());
    this._grassClear();
    // ---- instanced models and the character mesh
    const models = Models.build();
    this.modelGeo = {};
    for (const name in models) {
      const cap = Models.CAP[name] || 64;
      this.modelGeo[name] = this._instanced(models[name], 4, 6, cap);
      Batches[name] = new ModelBatch(cap);
    }
    const cm = CharMesh.build();
    this.skinGeo = cm.map(m => this._instanced(m, 5, 4, SkinBatch.MAX, { loc: 4, data: m.bones }));
  },
  // ---- grass chunks
  GRASS_CHUNK: 12,
  _grassClear() {
    if (this.grassChunks) for (const c of this.grassChunks.values()) this._grassFree(c);
    this.grassChunks = new Map();
    this._gTmp = this._gTmp || new Float32Array(1400 * 8); this._fTmp = this._fTmp || new Float32Array(160 * 8);
  },
  _grassFree(c) {
    const gl = this.gl;
    if (c.grass) { gl.deleteVertexArray(c.grass.vao); gl.deleteBuffer(c.grass.buf); }
    if (c.flowers) { gl.deleteVertexArray(c.flowers.vao); gl.deleteBuffer(c.flowers.buf); }
  },
  _grassPart(mb, data, count) {
    if (!count) return null;
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this._attr(0, mb.pos, 3); this._attr(1, mb.nrm, 3); this._attr(2, mb.col, 4);
    // element buffers belong to the vertex array, so each chunk needs its own binding of the shared indices
    mb.ebo = mb.ebo || this._buf(gl.ELEMENT_ARRAY_BUFFER, mb.indices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mb.ebo);
    const buf = this._buf(gl.ARRAY_BUFFER, data.subarray(0, count * 8));
    this._attr(4, buf, 4, 32, 0, 1); this._attr(5, buf, 4, 32, 16, 1);
    gl.bindVertexArray(null);
    return { vao, buf, count, tris: mb.count / 3 };
  },
  _updateGrass(cam) {
    const Q = this.Q, step = Q.grass / Math.max(0.5, this.auto.grass);
    const vis = this.grassVisible || (this.grassVisible = []), want = this._grassWant || (this._grassWant = []);
    vis.length = 0; want.length = 0;
    if (!Q.grass || this.auto.grass <= 0) return;
    const C = this.GRASS_CHUNK, R = Q.grassR, cx = cam.pos[0], cz = cam.pos[2];
    const ground = Terrain.height(cx, cz);
    if (cam.pos[1] - Math.max(ground, 0) > R * 1.6) return;                         // high in the air: nothing to see
    const key = step.toFixed(3);
    if (this._grassKey !== key) { for (const c of this.grassChunks.values()) this._grassFree(c); this.grassChunks.clear(); this._grassKey = key; }
    const i0 = Math.floor((cx - R) / C), i1 = Math.floor((cx + R) / C), j0 = Math.floor((cz - R) / C), j1 = Math.floor((cz + R) / C);
    this._gframe = (this._gframe || 0) + 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const mx = (i + 0.5) * C, mz = (j + 0.5) * C, d = Math.hypot(mx - cx, mz - cz);
      if (d > R + C * 0.71) continue;
      const k = (i + 4096) * 8192 + (j + 4096), ch = this.grassChunks.get(k);
      if (!ch) { want.push([d, i, j, k]); continue; }
      ch.used = this._gframe;
      if (!ch.grass && !ch.flowers) continue;
      if (d > C && !this.frustum.sphere(mx, ch.y, mz, C * 0.9)) continue;
      ch.d = d;
      vis.push(ch);
    }
    if (want.length) {
      want.sort((a, b) => a[0] - b[0]);
      for (let n = 0; n < want.length && n < this.grassBudget; n++) {
        const [dist, i, j, k] = want[n];
        const cnt = Flora.fillChunk(i * C, j * C, C, step, this._gTmp, this._fTmp);
        const ch = { grass: this._grassPart(this.grassMB, this._gTmp, cnt[0]), flowers: this._grassPart(this.flowerMB, this._fTmp, cnt[1]), y: Terrain.height((i + 0.5) * C, (j + 0.5) * C), used: this._gframe, d: dist };
        this.grassChunks.set(k, ch);
        if ((ch.grass || ch.flowers) && (dist <= C || this.frustum.sphere((i + 0.5) * C, ch.y, (j + 0.5) * C, C * 0.9))) vis.push(ch);
      }
    }
    if (this.grassChunks.size > 260) {                                              // forget chunks that were left behind
      for (const [k, c] of this.grassChunks) if (this._gframe - c.used > 240) { this._grassFree(c); this.grassChunks.delete(k); }
    }
  },

  // ------------------------------------------------------------------ per-frame helpers
  _common(p, viewProj) {
    const gl = this.gl, s = this.scene, e = s.env, cn = this._casc[0], cf = this._casc[1];
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
    gl.uniformMatrix4fv(p.u('uShadowMat'), false, cn.mat);
    gl.uniformMatrix4fv(p.u('uShadowMatFar'), false, cf.mat);
    gl.uniform4f(p.u('uShadowParams'), this._nearOn ? 1 : 0, 1 / this.shadowNear.res, this._farOn ? 1 : 0, 1 / this.shadowFar.res);
    gl.uniform4f(p.u('uShadowFade'), this.FAR_EXTENT * 0.78, this.FAR_EXTENT * 0.96, 0.05, 0.17);
    gl.uniform3fv(p.u('uShadowCenter'), cf.c);
    gl.uniform4f(p.u('uZone'), s.zone.x, s.zone.z, s.zone.r, s.zone.enabled ? 1 : 0);
    gl.uniform3fv(p.u('uZoneColor'), e.zoneColor);
    gl.uniform1f(p.u('uDirect'), this.direct ? 1 : 0);
    gl.uniform1f(p.u('uExposure'), e.exposure);
    const L = s.lights || this._noLights;
    for (let i = 0; i < 4; i++) {
      const l = L[i];
      if (l) { gl.uniform4f(p.u(this.LIGHT_P[i]), l.x, l.y, l.z, Math.max(l.r, 0.01)); gl.uniform4f(p.u(this.LIGHT_C[i]), l.cr, l.cg, l.cb, l.baked ? 1 : 0); }
      else { gl.uniform4f(p.u(this.LIGHT_P[i]), 0, -1000, 0, 0.01); gl.uniform4f(p.u(this.LIGHT_C[i]), 0, 0, 0, 0); }
    }
  },
  _upload(geo, data, count) {
    if (!count) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.ibuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, Math.min(count, geo.cap) * geo.floats);
  },
  _drawInstanced(geo, data, count) {
    if (!count) return;
    this._upload(geo, data, count);
    this._redraw(geo, count);
  },
  _redraw(geo, count) {
    if (!count) return;
    const gl = this.gl;
    count = Math.min(count, geo.cap);
    gl.bindVertexArray(geo.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, geo.count, gl.UNSIGNED_INT, 0, count);
    this.stats.draws++; this.stats.tris += geo.count / 3 * count;
  },
  // Orthographic shadow cascade of half extent S around (fx, fy, fz), snapped to texels so it does not shimmer.
  _cascade(c, fx, fy, fz, S, res, dist, near, far) {
    const L = this.scene.env.sunDir, v = c.view;
    m4.lookAt(v, fx + L[0] * dist, fy + L[1] * dist, fz + L[2] * dist, fx, fy, fz, 0, 1, 0);
    const texel = 2 * S / res;
    const rx = v[0], ry = v[4], rz = v[8], ux = v[1], uy = v[5], uz = v[9];
    const lx = rx * fx + ry * fy + rz * fz, ly = ux * fx + uy * fy + uz * fz;
    const sx = Math.round(lx / texel) * texel - lx, sy = Math.round(ly / texel) * texel - ly;
    fx += rx * sx + ux * sy; fy += ry * sx + uy * sy; fz += rz * sx + uz * sy;
    m4.lookAt(v, fx + L[0] * dist, fy + L[1] * dist, fz + L[2] * dist, fx, fy, fz, 0, 1, 0);
    m4.ortho(c.proj, -S, S, -S, S, near, far);
    m4.multiply(c.mat, c.proj, v);
    c.c[0] = fx; c.c[1] = fy; c.c[2] = fz; c.S = S;
  },
  // is a sphere inside the footprint of a cascade (any distance along the light)?
  _inCascade(c, x, y, z, r) {
    const v = c.view, dx = x - c.c[0], dy = y - c.c[1], dz = z - c.c[2];
    return Math.abs(v[0] * dx + v[4] * dy + v[8] * dz) < c.S + r && Math.abs(v[1] * dx + v[5] * dy + v[9] * dz) < c.S + r;
  },
  // How far the shadow of something `height` metres tall reaches along the ground (0 when nothing casts shadows).
  shadowReach(height, env) {
    if (!(env.shadowStrength > 0.02)) return 0;
    const sy = Math.max(0.08, env.sunDir[1]);
    return Math.min(70, height * Math.sqrt(1 - sy * sy) / sy);
  },
  _cullNature() {
    const s = this.scene, cam = s.cam.pos, fr = this.frustum, Q = this.Q, maxD = Q.treeDist, maxD2 = maxD * maxD;
    // casters just outside the view still throw their shadows into it: near the camera the test is widened by that reach
    const reach = this.shadowReach(1, s.env);
    const T = World.trees, l0 = Q.lod0 * Q.lod0, l1 = Q.lod1 * Q.lod1;
    for (const lods of this.treeBuf) for (const b of lods) b.count = 0;
    for (let i = 0, n = World.treeCount; i < n; i++) {
      const o = i * 8, x = T[o], y = T[o + 1], z = T[o + 2], sc = T[o + 3];
      const dx = x - cam[0], dz = z - cam[2], d2 = dx * dx + dz * dz;
      if (d2 > maxD2) continue;
      if (d2 > 3000 && !fr.sphere(x, y + 4 * sc, z, 7 * sc + (d2 < 40000 ? Math.min(70, reach * 9 * sc) : 0))) continue;      // (close ones are always kept)
      const type = T[o + 7];
      if (type === 5 && d2 > 210 * 210) continue;
      const b = this.treeBuf[type][d2 < l0 ? 0 : d2 < l1 ? 1 : 2], q = b.count * 8, d = b.data;
      // fade trees out near the far limit by shrinking them
      const fade = d2 > maxD2 * 0.8 ? 1 - (Math.sqrt(d2) - maxD * 0.894) / (maxD * 0.106) : 1;
      d[q] = x; d[q + 1] = y; d[q + 2] = z; d[q + 3] = sc * (fade < 0 ? 0 : fade);
      d[q + 4] = T[o + 4]; d[q + 5] = T[o + 5]; d[q + 6] = T[o + 6]; d[q + 7] = 1;
      b.count++;
    }
    const Rk = World.rocks;
    for (const lods of this.rockBuf) for (const b of lods) b.count = 0;
    for (let i = 0, n = World.rockCount; i < n; i++) {
      const o = i * 8, x = Rk[o], y = Rk[o + 1], z = Rk[o + 2], sc = Rk[o + 3];
      const dx = x - cam[0], dz = z - cam[2], d2 = dx * dx + dz * dz;
      const lim = 140 + sc * 130;
      if (d2 > lim * lim) continue;
      if (d2 > 900 && !fr.sphere(x, y, z, sc * 1.4 + (d2 < 22500 ? Math.min(30, reach * sc) : 0))) continue;
      const b = this.rockBuf[Rk[o + 6]][d2 < 55 * 55 ? 0 : 1], q = b.count * 8, d = b.data;
      d[q] = x; d[q + 1] = y; d[q + 2] = z; d[q + 3] = sc; d[q + 4] = Rk[o + 4]; d[q + 5] = (Rk[o + 5] - 0.82) / 0.3; d[q + 6] = 0; d[q + 7] = Rk[o + 7];
      b.count++;
    }
    // undergrowth: found through a coarse grid, only close to the camera
    for (const b of this.plantBuf) b.count = 0;
    const PD = Q.plants;
    if (PD > 0 && World.plantGrid) {
      const G = World.plantGrid, P = World.plants, cs = G.cell, n = G.n, H = Terrain.HALF;
      const i0 = Math.max(0, Math.floor((cam[0] - PD + H) / cs)), i1 = Math.min(n - 1, Math.floor((cam[0] + PD + H) / cs));
      const j0 = Math.max(0, Math.floor((cam[2] - PD + H) / cs)), j1 = Math.min(n - 1, Math.floor((cam[2] + PD + H) / cs));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const list = G.cells[j * n + i];
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const o = list[k] * 8, x = P[o], y = P[o + 1], z = P[o + 2];
          const dx = x - cam[0], dz = z - cam[2], d2 = dx * dx + dz * dz;
          if (d2 > PD * PD || (d2 > 100 && !fr.sphere(x, y + 0.5, z, 1.6))) continue;
          const b = this.plantBuf[P[o + 7]];
          if (b.count * 8 >= b.data.length) continue;
          const q = b.count * 8, d = b.data, dist = Math.sqrt(d2), fade = dist > PD * 0.8 ? 1 - (dist - PD * 0.8) / (PD * 0.2) : 1;
          d[q] = x; d[q + 1] = y; d[q + 2] = z; d[q + 3] = P[o + 3] * fade; d[q + 4] = P[o + 4]; d[q + 5] = P[o + 5]; d[q + 6] = P[o + 6]; d[q + 7] = 1;
          b.count++;
        }
      }
    }
  },
  // depth-only pass of everything that casts a shadow into one cascade
  _shadowPass(target, casc, near) {
    const gl = this.gl, P = this.P, scene = this.scene, e = scene.env;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.res, target.res);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.useProgram(P.depth.prog);
    gl.uniformMatrix4fv(P.depth.u('uViewProj'), false, casc.mat);
    for (const m of this.staticMeshes) {
      if (!this._inCascade(casc, m.c[0], m.c[1], m.c[2], m.r)) continue;
      gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); this.stats.draws++;
    }
    gl.useProgram(P.modelShadow.prog);
    gl.uniformMatrix4fv(P.modelShadow.u('uViewProj'), false, casc.mat);
    for (const k in Batches) if (!Models.NO_SHADOW[k]) this._redraw(this.modelGeo[k], Batches[k].count);
    gl.useProgram(P.skinShadow.prog);
    gl.uniformMatrix4fv(P.skinShadow.u('uViewProj'), false, casc.mat);
    for (let l = 0; l < 2; l++) this._redraw(this.skinGeo[l], SkinBatch.count[l]);
    // foliage: alpha tested, both sides
    gl.disable(gl.CULL_FACE);
    const p = P.natureShadow;
    gl.useProgram(p.prog);
    gl.uniformMatrix4fv(p.u('uViewProj'), false, casc.mat);
    gl.uniform1f(p.u('uTime'), scene.time);
    gl.uniform1f(p.u('uWind'), e.wind);
    // (mid-distance trees go into the near cascade as well: with a low sun their shadows reach all the way to the camera)
    for (let t = 0; t < this.treeGeo.length; t++) {
      this._redraw(this.treeGeo[t][0], this.treeBuf[t][0].count);
      this._redraw(this.treeGeo[t][1], this.treeBuf[t][1].count);
    }
    if (near) for (let k = 0; k < this.plantGeo.length; k++) this._redraw(this.plantGeo[k], this.plantBuf[k].count);
    gl.uniform1f(p.u('uWind'), 0);
    gl.enable(gl.CULL_FACE);
    for (let v = 0; v < this.rockGeo.length; v++) for (let l = 0; l < 2; l++) this._redraw(this.rockGeo[v][l], this.rockBuf[v][l].count);
  },

  // ------------------------------------------------------------------ frame
  // scene: { time, focusY, cam:{pos,fwd,right,up,proj,viewProj,invViewProj}, env:{...}, zone:{x,z,r,enabled}, fx:{vignette,zoneTint,damage,desat},
  //          lights:[{x,y,z,r,cr,cg,cb,baked}], particles:{data,count}, beams:{data,count} }
  render(scene) {
    const gl = this.gl, P = this.P, Q = this.Q, U = this.UNIT;
    this.scene = scene;
    const e = scene.env, cam = scene.cam;
    this.stats.draws = 0; this.stats.tris = 0;
    this.frustum.set(cam.viewProj);
    this._cullNature();
    this._updateGrass(cam);
    const lit = e.shadowStrength > 0.02;
    this._nearOn = lit && Q.shadowNear > 0 && this.shadowNear.ok;
    this._farOn = lit && this.shadowFar.ok;
    // cascades: a tight one around the point of interest, a wide one pushed ahead of the camera
    const f = cam.fwd, fl = Math.hypot(f[0], f[2]) || 1, fy = scene.focusY === undefined ? cam.pos[1] : scene.focusY;
    const Sn = this.NEAR_EXTENT, Sf = this.FAR_EXTENT;
    this._cascade(this._casc[0], cam.pos[0] + f[0] / fl * Sn * 0.55, fy, cam.pos[2] + f[2] / fl * Sn * 0.55, Sn, this.shadowNear.res, 300, 20, 380);
    // the wide one changes slowly: on the lighter presets it is redrawn every other frame (and sampled with the matrix it was drawn with)
    this._farAge = (this._farAge || 0) + 1;
    if (!this._farOn) this._farValid = false;
    const farNow = this._farOn && (!this._farValid || this._farAge >= Q.farEvery);
    if (farNow) this._cascade(this._casc[1], cam.pos[0] + f[0] / fl * Sf * 0.55, fy, cam.pos[2] + f[2] / fl * Sf * 0.55, Sf, this.shadowFar.res, 320, 110, 570);
    const W = this.canvas.width, H = this.canvas.height;

    // ---- upload this frame's instance data once (shared by the shadow and colour passes)
    for (const k in Batches) this._upload(this.modelGeo[k], Batches[k].data, Batches[k].count);
    for (let t = 0; t < this.treeGeo.length; t++) for (let l = 0; l < 3; l++) this._upload(this.treeGeo[t][l], this.treeBuf[t][l].data, this.treeBuf[t][l].count);
    for (let v = 0; v < this.rockGeo.length; v++) for (let l = 0; l < 2; l++) this._upload(this.rockGeo[v][l], this.rockBuf[v][l].data, this.rockBuf[v][l].count);
    for (let k = 0; k < this.plantGeo.length; k++) this._upload(this.plantGeo[k], this.plantBuf[k].data, this.plantBuf[k].count);
    for (let l = 0; l < 2; l++) this._upload(this.skinGeo[l], SkinBatch.inst[l], SkinBatch.count[l]);
    gl.activeTexture(gl.TEXTURE0 + U.uBones); gl.bindTexture(gl.TEXTURE_2D, this.boneTex);
    if (SkinBatch.rows) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SkinBatch.BONES * 3, SkinBatch.rows, gl.RGBA, gl.FLOAT, SkinBatch.bones);

    // ---- textures that stay bound for the whole frame
    gl.activeTexture(gl.TEXTURE0 + U.uMat); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.matTex);
    gl.activeTexture(gl.TEXTURE0 + U.uNoise); gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.activeTexture(gl.TEXTURE0 + U.uCtl); gl.bindTexture(gl.TEXTURE_2D, this.ctlTex);
    gl.activeTexture(gl.TEXTURE0 + U.uMatProps); gl.bindTexture(gl.TEXTURE_2D, this.propsTex);
    gl.activeTexture(gl.TEXTURE0 + U.uDepth); gl.bindTexture(gl.TEXTURE_2D, null);

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);

    // ---- shadow maps
    gl.activeTexture(gl.TEXTURE0 + U.uShadowMap); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + U.uShadowFar); gl.bindTexture(gl.TEXTURE_2D, null);
    if (this._nearOn || farNow) {
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2.0, 4.0);
      if (farNow) { this._shadowPass(this.shadowFar, this._casc[1], false); this._farValid = true; this._farAge = 0; }
      if (this._nearOn) this._shadowPass(this.shadowNear, this._casc[0], true);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // ---- main colour pass
    const T = this.targets;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.direct ? null : T.sceneFbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(e.fogColor[0], e.fogColor[1], e.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0 + U.uShadowMap); gl.bindTexture(gl.TEXTURE_2D, this.shadowNear.tex);
    gl.activeTexture(gl.TEXTURE0 + U.uShadowFar); gl.bindTexture(gl.TEXTURE_2D, this.shadowFar.tex);
    gl.activeTexture(gl.TEXTURE0 + U.uHeightTex); gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    gl.activeTexture(gl.TEXTURE0);

    // buildings and props
    this._common(P.static);
    for (const m of this.staticMeshes) {
      if (!this.frustum.sphere(m.c[0], m.c[1], m.c[2], m.r)) continue;
      gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); this.stats.draws++; this.stats.tris += m.count / 3;
    }
    // rocks, then trees and undergrowth (foliage cards: both sides, edges softened by alpha to coverage where available)
    const a2c = !this.direct && T.msaa;
    this._common(P.nature);
    gl.uniform1f(P.nature.u('uWind'), 0);
    gl.uniform4f(P.nature.u('uAlpha'), 0.5, 0, 0, 0);
    gl.uniform3f(P.nature.u('uTintA'), 0.78, 0.78, 0.8); gl.uniform3f(P.nature.u('uTintB'), 1.12, 1.1, 1.04);
    for (let v = 0; v < this.rockGeo.length; v++) for (let l = 0; l < 2; l++) this._redraw(this.rockGeo[v][l], this.rockBuf[v][l].count);
    gl.disable(gl.CULL_FACE);
    if (a2c) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.uniform1f(P.nature.u('uWind'), e.wind);
    gl.uniform4f(P.nature.u('uAlpha'), a2c ? 0.42 : 0.5, a2c ? 1 : 0, 1, 0);
    for (let t = 0; t < this.treeGeo.length; t++) {
      gl.uniform3fv(P.nature.u('uTintA'), this.TREE_TINTS[t][0]); gl.uniform3fv(P.nature.u('uTintB'), this.TREE_TINTS[t][1]);
      for (let l = 0; l < 3; l++) this._redraw(this.treeGeo[t][l], this.treeBuf[t][l].count);
    }
    gl.uniform3f(P.nature.u('uTintA'), 0.86, 1.0, 0.8); gl.uniform3f(P.nature.u('uTintB'), 1.16, 1.06, 0.7);
    for (let k = 0; k < this.plantGeo.length; k++) this._redraw(this.plantGeo[k], this.plantBuf[k].count);
    if (a2c) gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    // grass and flowers
    if (this.grassVisible.length) {
      this._common(P.grass);
      const R = Q.grassR;
      for (const ch of this.grassVisible) {
        const far = ch.d > R * 0.5;
        gl.uniform4f(P.grass.u('uGrassFade'), R * 0.72, R, e.wind, far ? 1.6 : 1);
        for (let q = 0; q < 2; q++) {
          const part = q ? ch.flowers : ch.grass;
          if (!part) continue;
          const n = far && !q ? Math.ceil(part.count * 0.5) : part.count;          // distant grass: every other clump, drawn wider
          gl.bindVertexArray(part.vao);
          gl.drawElementsInstanced(gl.TRIANGLES, part.tris * 3, gl.UNSIGNED_INT, 0, n);
          this.stats.draws++; this.stats.tris += part.tris * n;
        }
      }
    }
    gl.enable(gl.CULL_FACE);
    // instanced models and characters
    this._common(P.model);
    for (const k in Batches) if (!Models.GLASS[k]) this._redraw(this.modelGeo[k], Batches[k].count);
    this._common(P.skin);
    for (let l = 0; l < 2; l++) this._redraw(this.skinGeo[l], SkinBatch.count[l]);

    // terrain: its shader is the most expensive one, so it comes after everything that can hide it
    this._common(P.terrain);
    gl.uniform3fv(P.terrain.u('uWaterDeep'), e.waterDeep);
    gl.uniform4f(P.terrain.u('uCtlParams'), 1 / Terrain.SIZE, 0.5, 0, 0);
    gl.bindVertexArray(this.terrain.vao);
    const near = this._chunkOrder || (this._chunkOrder = []);
    near.length = 0;
    for (const c of this.terrain.chunks) {
      if (!this.frustum.sphere(c.cx, c.cy, c.cz, c.radius)) continue;
      const dx = c.cx - cam.pos[0], dz = c.cz - cam.pos[2];
      c.d2 = dx * dx + dz * dz; near.push(c);
    }
    near.sort(this._nearFirst);                      // nearer ground hides what lies behind it
    for (let k = 0; k < near.length; k++) {
      const c = near[k];
      gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_INT, c.start * 4); this.stats.draws++; this.stats.tris += c.count / 3;
    }

    // sky: behind everything that has been drawn
    gl.depthMask(false); gl.disable(gl.CULL_FACE);
    this._common(P.sky);
    gl.uniformMatrix4fv(P.sky.u('uInvViewProj'), false, cam.invViewProj);
    gl.uniform3fv(P.sky.u('uSkyTop'), e.skyTop); gl.uniform3fv(P.sky.u('uSkyHorizon'), e.skyHorizon); gl.uniform3fv(P.sky.u('uSunGlow'), e.sunGlow);
    gl.uniform4f(P.sky.u('uSkyParams'), e.stars, e.aurora, e.clouds, e.sunDisc);
    gl.bindVertexArray(this.triVao); gl.drawArrays(gl.TRIANGLES, 0, 3); this.stats.draws++;

    // contact shadows from the depth buffer
    if (!this.direct && T.ao && this.auto.ao) this._ssao(scene);

    // water
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this._common(P.water);
    gl.uniform3fv(P.water.u('uSkyTop'), e.skyTop); gl.uniform3fv(P.water.u('uSkyHorizon'), e.skyHorizon); gl.uniform3fv(P.water.u('uSunGlow'), e.sunGlow);
    gl.uniform4f(P.water.u('uSkyParams'), e.stars, e.aurora, e.clouds, e.sunDisc);
    gl.uniform3fv(P.water.u('uWaterDeep'), e.waterDeep); gl.uniform3fv(P.water.u('uWaterShallow'), e.waterShallow);
    gl.uniform2f(P.water.u('uHtParams'), 1 / (Terrain.CELL * Terrain.N), (Terrain.HALF / Terrain.CELL + 0.5) / Terrain.N);
    gl.bindVertexArray(this.waterVao); gl.drawElements(gl.TRIANGLES, this.waterCount, gl.UNSIGNED_INT, 0); this.stats.draws++;
    // window glass
    if (this.glassMeshes.length) {
      this._common(P.static);
      for (const m of this.glassMeshes) {
        if (!this.frustum.sphere(m.c[0], m.c[1], m.c[2], m.r)) continue;
        gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0); this.stats.draws++;
      }
    }
    // glazing of vehicles (instanced models, same blending)
    {
      let any = false;
      for (const k in Models.GLASS) if (Batches[k] && Batches[k].count) any = true;
      if (any) { this._common(P.model); for (const k in Models.GLASS) if (Batches[k]) this._redraw(this.modelGeo[k], Batches[k].count); }
    }

    // additive / translucent effects
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
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
      gl.uniformMatrix4fv(p.u('uViewProj'), false, cam.viewProj); gl.uniform3fv(p.u('uCamPos'), cam.pos);
      gl.uniform1f(p.u('uDirect'), this.direct ? 1 : 0); gl.uniform1f(p.u('uExposure'), e.exposure);
      this._drawInstanced(this.beamGeo, scene.beams.data, scene.beams.count);
    }
    if (scene.particles && scene.particles.count) {
      const p = P.particle;
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.u('uViewProj'), false, cam.viewProj);
      gl.uniform3fv(p.u('uCamRight'), cam.right); gl.uniform3fv(p.u('uCamUp'), cam.up);
      gl.uniform1f(p.u('uDirect'), this.direct ? 1 : 0); gl.uniform1f(p.u('uExposure'), e.exposure);
      this._drawInstanced(this.particleGeo, scene.particles.data, scene.particles.count);
    }
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    gl.bindVertexArray(null);

    if (!this.direct) this._post(scene);
  },
  _ssao(scene) {
    const gl = this.gl, P = this.P, T = this.targets, U = this.UNIT, W = T.w, H = T.h, pr = scene.cam.proj;
    // copy (and resolve) the depth buffer into a texture
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.sceneFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.depthFbo);
    if (this._aoBlit === undefined) {                     // the very first time: does this driver accept the copy?
      for (let k = 0; k < 8 && gl.getError() !== gl.NO_ERROR; k++) { /* forget whatever was reported earlier */ }
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      this._aoBlit = gl.getError() === gl.NO_ERROR;
      if (!this._aoBlit) { T.ao = false; gl.bindFramebuffer(gl.FRAMEBUFFER, T.sceneFbo); return; }
    } else gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    const near = pr[14] / (pr[10] - 1), far = pr[14] / (pr[10] + 1);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.bindVertexArray(this.triVao);
    gl.activeTexture(gl.TEXTURE0 + U.uDepth); gl.bindTexture(gl.TEXTURE_2D, T.depthTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.aoFbo); gl.viewport(0, 0, T.aoW, T.aoH);
    let p = P.ssao;
    gl.useProgram(p.prog);
    gl.uniform4f(p.u('uProj'), 1 / pr[0], 1 / pr[5], near, far);
    gl.uniform4f(p.u('uAoParams'), 0.75, 1.5, 1 / W, 1 / H);
    gl.drawArrays(gl.TRIANGLES, 0, 3); this.stats.draws++;
    // blur + multiply into the scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.sceneFbo); gl.viewport(0, 0, W, H);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
    p = P.aoApply;
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.aoTex);
    gl.uniform4f(p.u('uProj'), 1 / pr[0], 1 / pr[5], near, far);
    gl.uniform2f(p.u('uTexel'), 1 / T.aoW, 1 / T.aoH);
    gl.drawArrays(gl.TRIANGLES, 0, 3); this.stats.draws++;
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0 + U.uDepth); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.BLEND);
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
    const B = T.bloom, useBloom = true;
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
