/* SUNDRIFT GP — renderer: shadow pass -> MSAA scene -> bloom -> composite (speed blur, lines, grade). */
(function (root) {
  'use strict';
  var SD = root.SD, GLX = SD.GLX, M = SD.M;

  function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  /* Lighting / atmosphere. Colours are authored in sRGB and converted once. */
  SD.ENV = {
    sunDir: norm3([-0.46, 0.74, 0.5]),
    sunCol: SD.lin([1.0, 0.96, 0.86]).map(function (v) { return v * 1.18; }),
    skyTop: SD.lin(SD.hex(0x2d7fe6)),
    skyHor: SD.lin(SD.hex(0xc4e8ff)),
    ambSky: SD.lin(SD.hex(0x9fc3ee)).map(function (v) { return v * 0.78; }),
    ambGnd: SD.lin(SD.hex(0xa89a7a)).map(function (v) { return v * 0.62; }),
    fog: [0.00125, 0.9, 1.45, 0]
  };

  var IDENT = M.create();
  var BIAS = new Float32Array([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1]);
  var NO_TINT = new Float32Array([0, 0, 0, 0]);

  function Renderer(canvas) {
    var gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('WEBGL2_UNAVAILABLE');
    this.gl = gl;
    this.canvas = canvas;
    var S = SD.SHADERS;
    this.pLit = GLX.program(gl, S.litVert, S.litFrag, 'lit');
    this.pShadow = GLX.program(gl, S.shadowVert, S.shadowFrag, 'shadow');
    this.pSky = GLX.program(gl, S.fullVert, S.skyFrag, 'sky');
    this.pSea = GLX.program(gl, S.seaVert, S.seaFrag, 'sea');
    this.pPart = GLX.program(gl, S.partVert, S.partFrag, 'particles');
    this.pSkid = GLX.program(gl, S.skidVert, S.skidFrag, 'skid');
    this.pBright = GLX.program(gl, S.fullVert, S.brightFrag, 'bright');
    this.pBlur = GLX.program(gl, S.fullVert, S.blurFrag, 'blur');
    this.pComp = GLX.program(gl, S.fullVert, S.compositeFrag, 'composite');

    this.shadowSize = 2048;
    this.shadow = GLX.shadowTarget(gl, this.shadowSize);
    this.samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
    this.maxPixels = 3.3e6;
    this.quality = 1;
    this.T = null;

    this.proj = M.create(); this.view = M.create(); this.viewProj = M.create();
    this.lightView = M.create(); this.lightProj = M.create(); this.lightVP = M.create(); this.shadowMat = M.create();
    this.camRight = [1, 0, 0]; this.camUp = [0, 1, 0]; this.camFwd = [0, 0, -1];
    this.tmpM = M.create();

    this.partBuf = GLX.dynamic(gl, [3, 2, 4, 1], 6 * 5000);
    this.skidBuf = GLX.dynamic(gl, [3, 1], 6 * 2400);
    this.emptyVAO = gl.createVertexArray();

    this.staticMesh = null; this.seaMesh = null; this.props = [];
    this.atlas = null;
    this.roadParams = new Float32Array([7.5, 8, 1000, 0]);
    this.stats = { draws: 0, tris: 0 };
    this._slow = 0; this._fast = 0; this._wait = 900; this._sinceRaise = 1e9;
    this.resize(true);
  }
  var R = Renderer.prototype;

  R.addMesh = function (built) { return GLX.mesh(this.gl, built); };

  R.setWorld = function (world, track) {
    var gl = this.gl, self = this;
    this.staticMesh = GLX.mesh(gl, world.staticMesh);
    this.seaMesh = GLX.mesh(gl, world.seaMesh);
    this.props = world.dynamic.map(function (d) { return { mesh: GLX.mesh(gl, d.built), update: d.update, m: M.create(), noShadow: !!d.noShadow }; });
    world.staticMesh = null; world.seaMesh = null;      // the GPU owns the geometry now; free ~25 MB of JS memory
    var dashes = Math.max(1, Math.round(track.length / 9));
    this.roadParams = new Float32Array([track.halfWidth, track.length / dashes, track.length, 0]);
    // sign atlas
    var cv = document.createElement('canvas');
    SD.drawAtlas(cv);
    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    this.atlas = tex;
    gl.activeTexture(gl.TEXTURE0);
  };

  // ------------------------------------------------------------ targets
  R.resize = function (force) {
    var cv = this.canvas, dpr = Math.min(root.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.floor((cv.clientWidth || 2) * dpr)), h = Math.max(2, Math.floor((cv.clientHeight || 2) * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    var s = Math.min(1, Math.sqrt(this.maxPixels / (w * h))) * this.quality;
    var rw = Math.max(4, Math.round(w * s)), rh = Math.max(4, Math.round(h * s));
    if (force || !this.T || this.T.w !== rw || this.T.h !== rh) this._alloc(rw, rh);
  };

  R._alloc = function (w, h) {
    var gl = this.gl, T = this.T, i;
    if (T) {
      GLX.freeTarget(gl, T.ms); GLX.freeTarget(gl, T.scene);
      for (i = 0; i < T.bloom.length; i++) GLX.freeTarget(gl, T.bloom[i]);
    }
    T = this.T = { w: w, h: h, ms: null, scene: null, bloom: [] };
    if (this.samples >= 2) {
      T.ms = GLX.msaaTarget(gl, w, h, this.samples);
      if (!T.ms.ok) { GLX.freeTarget(gl, T.ms); T.ms = null; this.samples = 0; }
    }
    T.scene = GLX.target(gl, w, h, { depth: !T.ms });
    var bw = w, bh = h;
    for (i = 0; i < 4; i++) {
      bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      T.bloom.push(GLX.target(gl, bw, bh));
    }
  };

  /** Drop / raise internal resolution so the frame rate holds. dtMs = last frame time. */
  R.adapt = function (dtMs) {
    if (dtMs > 21) { this._slow++; this._fast = 0; } else { this._fast++; this._slow = Math.max(0, this._slow - 0.5); }
    if (this._slow > 40 && this.quality > 0.5) {
      // too slow: render fewer pixels. If we had only just stepped up, wait longer before trying again.
      if (this._sinceRaise < 400) this._wait = Math.min(this._wait * 2, 14400);
      this.quality = Math.max(0.5, this.quality * 0.86); this._slow = 0; this._fast = 0; this.resize();
    } else if (this._fast > this._wait && this.quality < 1) {
      this.quality = Math.min(1, this.quality * 1.1); this._fast = 0; this._sinceRaise = 0; this.resize();
    }
    this._sinceRaise++;
  };

  // ------------------------------------------------------------ frame
  R._envUniforms = function (p, time) {
    var gl = this.gl, e = SD.ENV, u = p.u;
    gl.uniform3fv(u.uSunDir, e.sunDir);
    gl.uniform3fv(u.uSunCol, e.sunCol);
    gl.uniform3fv(u.uSkyTop, e.skyTop);
    gl.uniform3fv(u.uSkyHor, e.skyHor);
    gl.uniform3fv(u.uAmbSky, e.ambSky);
    gl.uniform3fv(u.uAmbGnd, e.ambGnd);
    gl.uniform4fv(u.uFog, e.fog);
    gl.uniform3fv(u.uCamPos, this.eye);
    gl.uniform1f(u.uTime, time);
  };

  R.render = function (sc) {
    var gl = this.gl, T = this.T, e = SD.ENV, cam = sc.cam, i, d, u;
    var time = sc.time, draws = sc.draws, nDraws = sc.drawCount;
    this.stats.draws = 0; this.stats.tris = 0;

    // ---- camera
    var ex = cam.eye[0], ey = cam.eye[1], ez = cam.eye[2];
    var fx = cam.target[0] - ex, fy = cam.target[1] - ey, fz = cam.target[2] - ez, fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    var rx = -fz, rz = fx, rl = Math.hypot(rx, rz) || 1;          // right = fwd x worldUp
    rx /= rl; rz /= rl;
    var roll = cam.roll || 0, cr = Math.cos(roll), sr = Math.sin(roll);
    M.lookAt(this.view, ex, ey, ez, cam.target[0], cam.target[1], cam.target[2], rx * sr, cr, rz * sr);
    M.perspective(this.proj, cam.fov, T.w / T.h, 0.35, 3400);
    M.mul(this.viewProj, this.proj, this.view);
    var v = this.view;
    this.camRight = [v[0], v[4], v[8]]; this.camUp = [v[1], v[5], v[9]]; this.camFwd = [-v[2], -v[6], -v[10]];
    this.eye = [ex, ey, ez];
    var tanY = Math.tan(cam.fov / 2), tanX = tanY * T.w / T.h;

    // ---- shadow camera (texel-snapped so shadows do not crawl)
    var RAD = 72, DIST = 230, foc = sc.focus || cam.target, sd = e.sunDir;
    M.lookAt(this.lightView, foc[0] + sd[0] * DIST, foc[1] + sd[1] * DIST, foc[2] + sd[2] * DIST, foc[0], foc[1], foc[2], 0, 1, 0);
    var lv = this.lightView, texel = 2 * RAD / this.shadowSize;
    var lrx = lv[0], lry = lv[4], lrz = lv[8], lux = lv[1], luy = lv[5], luz = lv[9];
    var px = foc[0] * lrx + foc[1] * lry + foc[2] * lrz, py = foc[0] * lux + foc[1] * luy + foc[2] * luz;
    var ddx = Math.floor(px / texel) * texel - px, ddy = Math.floor(py / texel) * texel - py;
    var f0 = foc[0] + lrx * ddx + lux * ddy, f1 = foc[1] + lry * ddx + luy * ddy, f2 = foc[2] + lrz * ddx + luz * ddy;
    M.lookAt(this.lightView, f0 + sd[0] * DIST, f1 + sd[1] * DIST, f2 + sd[2] * DIST, f0, f1, f2, 0, 1, 0);
    M.ortho(this.lightProj, -RAD, RAD, -RAD, RAD, DIST - 140, DIST + 120);
    M.mul(this.lightVP, this.lightProj, this.lightView);
    M.mul(this.shadowMat, BIAS, this.lightVP);

    // ---- animated props
    for (i = 0; i < this.props.length; i++) this.props[i].update(this.props[i].m, time);

    // ================= 1. shadow map
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadow.fb);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.6, 2.5);
    var ps = this.pShadow;
    gl.useProgram(ps.prog);
    gl.uniformMatrix4fv(ps.u.uLightVP, false, this.lightVP);
    gl.uniform1f(ps.u.uTimeV, time);
    gl.uniform1f(ps.u.uCrowd, sc.fx.crowd);
    gl.uniformMatrix4fv(ps.u.uModel, false, IDENT);
    if (this.staticMesh) { gl.bindVertexArray(this.staticMesh.vao); gl.drawArrays(gl.TRIANGLES, 0, this.staticMesh.count); }
    for (i = 0; i < this.props.length; i++) {
      d = this.props[i];
      if (d.noShadow) continue;
      gl.uniformMatrix4fv(ps.u.uModel, false, d.m); gl.bindVertexArray(d.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, d.mesh.count);
    }
    for (i = 0; i < nDraws; i++) {
      d = draws[i];
      if (d.noShadow) continue;
      gl.uniformMatrix4fv(ps.u.uModel, false, d.m); gl.bindVertexArray(d.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, d.mesh.count);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // ================= 2. scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.ms ? T.ms.fb : T.scene.fb);
    gl.viewport(0, 0, T.w, T.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    var pl = this.pLit;
    u = pl.u;
    gl.useProgram(pl.prog);
    this._envUniforms(pl, time);
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    gl.uniformMatrix4fv(u.uShadowMat, false, this.shadowMat);
    gl.uniform2f(u.uShadowBias, 0.11, 0.0007);
    gl.uniform1f(u.uShadowTexel, 1 / this.shadowSize);
    gl.uniform1f(u.uTimeV, time);
    gl.uniform1f(u.uCrowd, sc.fx.crowd);
    gl.uniform4fv(u.uRoad, this.roadParams);
    gl.uniform3fv(u.uLights, sc.fx.lights);
    gl.uniform4fv(u.uTint, NO_TINT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shadow.tex); gl.uniform1i(u.uShadowMap, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.atlas); gl.uniform1i(u.uAtlas, 1);
    gl.uniformMatrix4fv(u.uModel, false, IDENT);
    if (this.staticMesh) {
      gl.bindVertexArray(this.staticMesh.vao); gl.drawArrays(gl.TRIANGLES, 0, this.staticMesh.count);
      this.stats.draws++; this.stats.tris += this.staticMesh.count / 3;
    }
    for (i = 0; i < this.props.length; i++) {
      d = this.props[i];
      gl.uniformMatrix4fv(u.uModel, false, d.m); gl.bindVertexArray(d.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, d.mesh.count);
      this.stats.draws++;
    }
    for (i = 0; i < nDraws; i++) {
      d = draws[i];
      gl.uniformMatrix4fv(u.uModel, false, d.m);
      gl.uniform4fv(u.uTint, d.tint || NO_TINT);
      gl.bindVertexArray(d.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, d.mesh.count);
      this.stats.draws++; this.stats.tris += d.mesh.count / 3;
    }

    // sea
    if (this.seaMesh) {
      var pw = this.pSea;
      gl.useProgram(pw.prog);
      this._envUniforms(pw, time);
      gl.uniformMatrix4fv(pw.u.uViewProj, false, this.viewProj);
      gl.bindVertexArray(this.seaMesh.vao); gl.drawArrays(gl.TRIANGLES, 0, this.seaMesh.count);
      this.stats.draws++;
    }

    // sky fills whatever is still at the far plane
    var pk = this.pSky;
    gl.useProgram(pk.prog);
    this._envUniforms(pk, time);
    gl.uniform3fv(pk.u.uCamRight, this.camRight);
    gl.uniform3fv(pk.u.uCamUp, this.camUp);
    gl.uniform3fv(pk.u.uCamFwd, this.camFwd);
    gl.uniform2f(pk.u.uTan, tanX, tanY);
    gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.stats.draws++;

    // skid marks
    gl.enable(gl.BLEND);
    if (sc.skid && sc.skid.count > 0) {
      var pk2 = this.pSkid, sb = this.skidBuf, n2 = Math.min(sc.skid.count, sb.max);
      gl.useProgram(pk2.prog);
      gl.uniformMatrix4fv(pk2.u.uViewProj, false, this.viewProj);
      gl.uniform3fv(pk2.u.uCamPos, this.eye);
      gl.bindVertexArray(sb.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, sb.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sc.skid.data, 0, n2 * 4);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -3);
      gl.drawArrays(gl.TRIANGLES, 0, n2);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      this.stats.draws++;
    }

    // particles: alpha-blended first, then additive (glow accumulates in the alpha channel)
    var pp = this.pPart, pb = this.partBuf, cnt;
    gl.useProgram(pp.prog);
    gl.uniformMatrix4fv(pp.u.uViewProj, false, this.viewProj);
    gl.bindVertexArray(pb.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, pb.vbo);
    if (sc.fxAlpha) {
      cnt = sc.fxAlpha.fill(pb.data, pb.max, this.camRight, this.camUp, this.eye);
      if (cnt > 0) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, pb.data, 0, cnt * pb.stride);
        gl.uniform1f(pp.u.uAdd, 0);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, cnt);
        this.stats.draws++;
      }
    }
    if (sc.fxAdd) {
      cnt = sc.fxAdd.fill(pb.data, pb.max, this.camRight, this.camUp, this.eye);
      if (cnt > 0) {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, pb.data, 0, cnt * pb.stride);
        gl.uniform1f(pp.u.uAdd, 1);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArrays(gl.TRIANGLES, 0, cnt);
        this.stats.draws++;
      }
    }
    gl.disable(gl.BLEND);
    gl.depthMask(true); gl.depthFunc(gl.LESS);

    // ================= 3. resolve
    if (T.ms) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.ms.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.scene.fb);
      gl.blitFramebuffer(0, 0, T.w, T.h, 0, 0, T.w, T.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }

    // ================= 4. bloom
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.emptyVAO);
    gl.activeTexture(gl.TEXTURE0);
    var B = T.bloom, pbr = this.pBright, pbl = this.pBlur;
    gl.useProgram(pbr.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, B[0].fb); gl.viewport(0, 0, B[0].w, B[0].h);
    gl.bindTexture(gl.TEXTURE_2D, T.scene.tex); gl.uniform1i(pbr.u.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(pbl.prog);
    gl.uniform1i(pbl.u.uTex, 0);
    for (i = 1; i < B.length; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, B[i].fb); gl.viewport(0, 0, B[i].w, B[i].h);
      gl.bindTexture(gl.TEXTURE_2D, B[i - 1].tex);
      gl.uniform2f(pbl.u.uTexel, 1 / B[i - 1].w, 1 / B[i - 1].h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (i = B.length - 1; i > 0; i--) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, B[i - 1].fb); gl.viewport(0, 0, B[i - 1].w, B[i - 1].h);
      gl.bindTexture(gl.TEXTURE_2D, B[i].tex);
      gl.uniform2f(pbl.u.uTexel, 0.6 / B[i].w, 0.6 / B[i].h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);

    // ================= 5. composite to the canvas
    var pc = this.pComp, fxv = sc.fx;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(pc.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.scene.tex); gl.uniform1i(pc.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, B[0].tex); gl.uniform1i(pc.u.uBloom, 2);
    gl.uniform4f(pc.u.uFx, fxv.blur, fxv.lines, fxv.tint, time % 1000);
    gl.uniform4f(pc.u.uGrade, 0.34, 0.5, 1.1, fxv.fade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
  };

  SD.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
