/* SUNDRIFT GP — thin WebGL2 helpers: programs, vertex arrays, render targets. */
(function (root) {
  'use strict';
  var SD = root.SD;
  var GLX = {};

  function numbered(src) {
    return src.split('\n').map(function (l, i) { return (i + 1) + ': ' + l; }).join('\n');
  }

  function compile(gl, type, src, label) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('Shader compile failed [' + label + ']\n' + log + '\n' + numbered(src));
    }
    return sh;
  }

  /** Compile + link. Returns { prog, u: {uniformName: location} }. Attribute slots come from layout(location). */
  GLX.program = function (gl, vsSrc, fsSrc, label) {
    var vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + '.vert');
    var fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + '.frag');
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Program link failed [' + label + ']\n' + gl.getProgramInfoLog(prog));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    var u = {}, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(prog, i);
      if (!info) continue;
      u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(prog, info.name);
    }
    return { prog: prog, u: u, label: label };
  };

  /** Vertex array for the standard 36-byte mesh layout. */
  GLX.mesh = function (gl, built, usage) {
    var vao = gl.createVertexArray(), vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, built.buffer, usage || gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 36, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 36, 28);
    gl.bindVertexArray(null);
    return { vao: vao, vbo: vbo, count: built.count };
  };

  /** Dynamic vertex array from a list of float attribute sizes, e.g. [3, 2, 4]. */
  GLX.dynamic = function (gl, sizes, maxVerts) {
    var stride = 0, i;
    for (i = 0; i < sizes.length; i++) stride += sizes[i];
    var vao = gl.createVertexArray(), vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, maxVerts * stride * 4, gl.DYNAMIC_DRAW);
    var off = 0;
    for (i = 0; i < sizes.length; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, sizes[i], gl.FLOAT, false, stride * 4, off * 4);
      off += sizes[i];
    }
    gl.bindVertexArray(null);
    return { vao: vao, vbo: vbo, stride: stride, data: new Float32Array(maxVerts * stride), max: maxVerts };
  };

  /** Colour render target (texture), optionally with a depth renderbuffer. */
  GLX.target = function (gl, w, h, opts) {
    opts = opts || {};
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var rb = null;
    if (opts.depth) {
      rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb: fb, tex: tex, rb: rb, w: w, h: h, ok: ok };
  };

  /** Multisampled colour + depth target (resolved with blitFramebuffer). */
  GLX.msaaTarget = function (gl, w, h, samples) {
    var fb = gl.createFramebuffer(), color = gl.createRenderbuffer(), depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb: fb, color: color, depth: depth, w: w, h: h, ok: ok };
  };

  /** Depth-only target sampled with hardware PCF (sampler2DShadow). */
  GLX.shadowTarget = function (gl, size) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb: fb, tex: tex, size: size, ok: ok };
  };

  GLX.freeTarget = function (gl, t) {
    if (!t) return;
    if (t.fb) gl.deleteFramebuffer(t.fb);
    if (t.tex) gl.deleteTexture(t.tex);
    if (t.rb) gl.deleteRenderbuffer(t.rb);
    if (t.color) gl.deleteRenderbuffer(t.color);
    if (t.depth) gl.deleteRenderbuffer(t.depth);
  };

  SD.GLX = GLX;
})(typeof window !== 'undefined' ? window : globalThis);
