/* 작은 WebGL2 렌더러 — 외부 라이브러리 없이 교실 한 칸과 복도를 그린다.
 *  · 햇빛 1개(그림자 맵 + PCF)
 *  · 창문과 형광등(천장)을 넓은 면광원으로 계산 → 창가가 밝고 복도 쪽으로 갈수록 어두워지는 실내 빛
 *  · 방 모서리 음영, 광택 면(마루·책상·칠판)에 비치는 창문과 형광등
 *  · 정점색/텍스처, 무광(unlit)·알파·가산 블렌딩
 *  · 셰이더가 실패하면 단순 셰이더로 내려가서라도 화면은 나오게 한다
 * 구역(zone) 0 = 교실, 1 = 복도. 조각의 x 좌표가 split 보다 크면 복도로 본다.
 */
(function (GX) {
  'use strict';
  var M4 = GX.M4;

  var VS_MAIN = [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec3 aPos;',
    'layout(location=1) in vec3 aNormal;',
    'layout(location=2) in vec4 aColor;',
    'layout(location=3) in vec2 aUV;',
    'uniform mat4 uViewProj;',
    'uniform mat4 uModel;',
    'uniform mat4 uLightVP;',
    'out vec3 vWorld;',
    'out vec3 vNormal;',
    'out vec4 vColor;',
    'out vec2 vUV;',
    'out vec4 vShadowPos;',
    'invariant gl_Position;',      /* 깊이만 먼저 쓰는 셰이더(VS_SHADOW)와 화면 위치가 끝자리까지 같게 */
    'void main() {',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  vWorld = wp.xyz;',
    '  vNormal = mat3(uModel) * aNormal;',
    '  vColor = aColor;',
    '  vUV = aUV;',
    '  vShadowPos = uLightVP * wp;',
    '  gl_Position = uViewProj * wp;',
    '}'
  ].join('\n');

  var FS_MAIN = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'uniform sampler2D uTex;',
    'uniform highp sampler2DShadow uShadowMap;',
    'uniform vec3 uCamPos;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uSunColor;',
    'uniform vec4 uTint;',
    'uniform vec4 uMat;',          /* x 무광 비율, y 그림자 받기, z 밉 편향, w 광택 배수 */
    'uniform vec4 uMat2;',         /* x 텍스처 밝기로 광택 조절(마루 틈), y 테두리 빛(천·머리카락), z·w 예비 */
    'uniform vec4 uFog;',
    'uniform vec2 uShadowTexel;',
    'uniform float uExposure;',
    'uniform float uSplit;',
    'uniform float uCeilY;',
    'uniform vec3 uAmbSky[2];',
    'uniform vec3 uAmbGround[2];',
    'uniform vec3 uBoxMin[2];',
    'uniform vec3 uBoxMax[2];',
    'uniform vec3 uWinRect[8];',
    'uniform vec3 uWinColor[2];',
    'uniform vec3 uLampRect[8];',
    'uniform vec3 uLampColor[2];',
    'uniform vec4 uWinRef[4];',    /* 구역마다 (창 평면 x, 창턱, 창 위, 방향 부호), (첫 창 중심 z, 간격, 반폭, 개수) */
    'uniform vec4 uTubeRef[4];',   /* 구역마다 (첫 등 x, z, 간격 x, z), (반폭 x, 반길이 z, 개수 x, z) */
    'uniform vec3 uTubeColor[2];',
    'in vec3 vWorld;',
    'in vec3 vNormal;',
    'in vec4 vColor;',
    'in vec2 vUV;',
    'in vec4 vShadowPos;',
    'out vec4 fragColor;',
    '',
    'float sunShadow(float ndl) {',
    '  vec3 p = vShadowPos.xyz / vShadowPos.w;',
    '  p = p * 0.5 + 0.5;',
    '  if (p.x <= 0.002 || p.x >= 0.998 || p.y <= 0.002 || p.y >= 0.998 || p.z <= 0.0 || p.z >= 1.0) {',
    '    return 0.0;',
    '  }',
    '  float bias = 0.0007 + 0.0022 * (1.0 - ndl);',
    '  float zref = p.z - bias;',
    '  float acc = 0.0;',
    '  for (int j = -1; j <= 1; j++) {',
    '    for (int i = -1; i <= 1; i++) {',
    '      vec2 ofs = vec2(float(i), float(j)) * uShadowTexel * 1.7;',
    '      acc += texture(uShadowMap, vec3(p.xy + ofs, zref));',
    '    }',
    '  }',
    '  return acc / 9.0;',
    '}',
    '',
    'vec3 toneMap(vec3 x) {',
    '  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);',
    '}',
    '',
    /* 사각 면광원이 한 점에 주는 빛의 양(0..1). 꼭짓점은 받는 쪽에서 볼 때 시계 방향 */
    'vec3 edgeF(vec3 a, vec3 b) {',
    '  float d = clamp(dot(a, b), -0.9999, 0.9999);',
    '  return cross(a, b) * (acos(d) * inversesqrt(1.0 - d * d));',
    '}',
    'float rectIrr(vec3 P, vec3 N, vec3 p0, vec3 p1, vec3 p2, vec3 p3) {',
    '  vec3 v0 = normalize(p0 - P);',
    '  vec3 v1 = normalize(p1 - P);',
    '  vec3 v2 = normalize(p2 - P);',
    '  vec3 v3 = normalize(p3 - P);',
    '  vec3 F = (edgeF(v0, v1) + edgeF(v1, v2) + edgeF(v2, v3) + edgeF(v3, v0)) * 0.15915494;',
    '  float len = length(F);',
    '  float x = min(len, 0.999);',
    '  float y = clamp(dot(N, F) / max(len, 0.00001), -1.0, 1.0);',
    '  return clamp(x * (0.9245867 + y) * (0.5 + (y - 0.9245867) * (0.5359050 + x * (-1.0054222 + x * (1.8199061 - x * 1.3172082)))), 0.0, 1.0);',
    '}',
    '',
    /* 방(상자) 안쪽 모서리 근처를 어둡게 */
    'float boxAO(vec3 P, vec3 N, vec3 bmin, vec3 bmax) {',
    '  vec3 f0 = sqrt(clamp((P - bmin) * 2.2, 0.0, 1.0));',
    '  vec3 f1 = sqrt(clamp((bmax - P) * 2.2, 0.0, 1.0));',
    '  vec3 a = 1.0 - (1.0 - N * N) * 0.4 * (1.0 - f0 * f1);',
    '  return a.x * a.y * a.z;',
    '}',
    '',
    /* 광택 면에 비치는 것: 창문(밝은 바깥)과 천장 형광등을 수식으로 찾는다 */
    'vec3 envReflect(vec3 P, vec3 R, float rough, int zi) {',
    '  vec3 col = mix(uAmbGround[zi], uAmbSky[zi], R.y * 0.5 + 0.5) * 0.7;',
    '  vec4 wr = uWinRef[zi * 2];',
    '  vec4 wz = uWinRef[zi * 2 + 1];',
    '  if (R.x * wr.w > 0.02) {',
    '    float t = (wr.x - P.x) / R.x;',
    '    if (t > 0.0) {',
    '      vec3 h = P + R * t;',
    '      float blur = 0.012 + rough * t;',
    '      float k = clamp(floor((h.z - wz.x) / wz.y + 0.5), 0.0, wz.w - 1.0);',
    '      float dz = abs(h.z - (wz.x + k * wz.y));',
    '      float m = (1.0 - smoothstep(wz.z - blur, wz.z + blur, dz)) * smoothstep(wr.y - blur, wr.y + blur, h.y) * (1.0 - smoothstep(wr.z - blur, wr.z + blur, h.y));',
    '      m *= 0.6 + 0.4 * smoothstep(0.0, 0.03 + blur, dz);',
    '      float up = 0.45 + 0.55 * smoothstep(wr.y, wr.z, h.y);',
    '      col += uWinColor[zi] * (m * up);',
    '    }',
    '  }',
    '  if (R.y > 0.02) {',
    '    float t2 = (uCeilY - P.y) / R.y;',
    '    if (t2 > 0.0) {',
    '      vec2 h2 = P.xz + R.xz * t2;',
    '      vec4 tr = uTubeRef[zi * 2];',
    '      vec4 ts = uTubeRef[zi * 2 + 1];',
    '      float blur2 = 0.012 + rough * t2;',
    '      vec2 gi = clamp(floor((h2 - tr.xy) / tr.zw + 0.5), vec2(0.0), ts.zw - 1.0);',
    '      vec2 d = abs(h2 - (tr.xy + gi * tr.zw));',
    '      float m2 = (1.0 - smoothstep(ts.x - blur2, ts.x + blur2, d.x)) * (1.0 - smoothstep(ts.y - blur2, ts.y + blur2, d.y));',
    '      m2 *= min(1.0, ts.x / blur2) * min(1.0, ts.y / blur2);',
    '      col += uTubeColor[zi] * m2;',
    '    }',
    '  }',
    '  return col;',
    '}',
    '',
    'void main() {',
    '  vec4 texel = texture(uTex, vUV, uMat.z);',
    '  vec3 tc = texel.rgb / max(texel.a, 0.0001);',
    '  vec3 albedo = pow(tc, vec3(2.2)) * vColor.rgb * uTint.rgb;',
    '  float alpha = texel.a * uTint.a;',
    '  vec3 toCam = uCamPos - vWorld;',
    '  float dist = length(toCam);',
    '  vec3 c = albedo;',
    '  if (uMat.x < 0.99) {',
    '    vec3 N = normalize(vNormal);',
    '    vec3 V = toCam / max(dist, 0.0001);',
    '    int zi = int(step(uSplit, vWorld.x));',
    '    float ao = boxAO(vWorld, N, uBoxMin[zi], uBoxMax[zi]);',
    /* 아래에서 올라오는 반사광은 바닥 가까이에서는 가려진다(책상 밑·손바닥 밑이 어둡게) */
    '    float bounce = 0.22 + 0.78 * smoothstep(0.0, 2.7, vWorld.y);',
    '    vec3 light = mix(uAmbGround[zi] * bounce, uAmbSky[zi], N.y * 0.5 + 0.5) * ao;',
    '    float eWin = rectIrr(vWorld, N, uWinRect[zi * 4], uWinRect[zi * 4 + 1], uWinRect[zi * 4 + 2], uWinRect[zi * 4 + 3]);',
    '    float eLamp = rectIrr(vWorld, N, uLampRect[zi * 4], uLampRect[zi * 4 + 1], uLampRect[zi * 4 + 2], uLampRect[zi * 4 + 3]);',
    '    light += uWinColor[zi] * (eWin * (0.5 + 0.5 * ao));',
    '    light += uLampColor[zi] * (eLamp * (0.45 + 0.55 * ao));',
    '    float ndl = max(dot(N, uSunDir), 0.0);',
    '    float sh = 0.0;',
    '    if (ndl > 0.0 && uMat.y > 0.5) {',
    '      sh = sunShadow(ndl);',
    '    }',
    '    light += uSunColor * (ndl * sh);',
    '    float nv = max(dot(N, V), 0.0);',
    '    float edge = 1.0 - nv;',
    '    light += (uWinColor[zi] * 0.05 + uLampColor[zi] * 0.3) * (uMat2.y * edge * edge * edge * (0.4 + 0.6 * ao));',
    '    vec3 lit = albedo * light;',
    '    float gloss = vColor.a * uMat.w;',
    '    if (gloss > 0.002) {',
    '      float lum = dot(tc, vec3(0.3, 0.6, 0.1));',
    '      float g = gloss * mix(1.0, smoothstep(0.2, 0.62, lum), uMat2.x);',
    '      float e2 = edge * edge;',
    '      float fres = 0.04 + 0.96 * e2 * e2 * edge;',
    '      float rough = mix(0.2, 0.012, g);',
    '      vec3 env = envReflect(vWorld, reflect(-V, N), rough, zi);',
    '      lit += env * (fres * g * (0.35 + 0.65 * ao));',
    '      vec3 H1 = normalize(uSunDir + V);',
    '      float s1 = pow(max(dot(N, H1), 0.0), 64.0) * sh;',
    '      lit += uSunColor * (s1 * 0.45 * g);',
    '    }',
    '    float fogAmt = 1.0 - exp(-dist * uFog.a);',
    '    lit = mix(lit, uFog.rgb, fogAmt);',
    '    c = mix(lit, albedo, uMat.x);',
    '  }',
    '  c = toneMap(c * uExposure);',
    '  c = pow(c, vec3(1.0 / 2.2));',
    '  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);',
    '  c += (dither - 0.5) / 255.0;',
    '  fragColor = vec4(c * alpha, alpha);',
    '}'
  ].join('\n');

  var VS_SHADOW = [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec3 aPos;',
    'uniform mat4 uLightVP;',
    'uniform mat4 uModel;',
    'invariant gl_Position;',
    'void main() {',
    '  gl_Position = uLightVP * (uModel * vec4(aPos, 1.0));',
    '}'
  ].join('\n');

  var FS_SHADOW = [
    '#version 300 es',
    'precision highp float;',
    'void main() {',
    '}'
  ].join('\n');

  /* 그림자·조명 없이 색만 내는 예비 셰이더(메인 셰이더가 안 될 때) */
  var FS_BASIC = [
    '#version 300 es',
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform vec4 uTint;',
    'uniform vec4 uMat;',
    'in vec3 vNormal;',
    'in vec4 vColor;',
    'in vec2 vUV;',
    'out vec4 fragColor;',
    'void main() {',
    '  vec4 texel = texture(uTex, vUV);',
    '  vec3 tc = texel.rgb / max(texel.a, 0.0001);',
    '  vec3 albedo = tc * pow(max(vColor.rgb, vec3(0.0)), vec3(1.0 / 2.2)) * min(uTint.rgb, vec3(1.0));',
    '  vec3 N = normalize(vNormal);',
    '  float l = 0.62 + 0.38 * (N.y * 0.5 + 0.5) + 0.12 * max(-N.x, 0.0);',
    '  vec3 c = mix(albedo * l, albedo, uMat.x);',
    '  float alpha = texel.a * uTint.a;',
    '  fragColor = vec4(clamp(c, 0.0, 1.0) * alpha, alpha);',
    '}'
  ].join('\n');

  GX.SHADERS = { VS_MAIN: VS_MAIN, FS_MAIN: FS_MAIN, VS_SHADOW: VS_SHADOW, FS_SHADOW: FS_SHADOW, FS_BASIC: FS_BASIC };

  function Engine(canvas) {
    this.canvas = canvas;
    var gl = canvas.getContext('webgl2', {
      antialias: true, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('NO_WEBGL2');
    this.gl = gl;
    this.items = [];
    this.mode = 'full';
    this.warnings = [];
    this.shadowSize = 2048;
    this.shadowsOn = true;
    this.shadowOK = false;
    this.exposure = 1;
    this.clear = [0.05, 0.06, 0.08];
    this.drawCalls = 0;

    this.sunDir = [0, 1, 0];
    this.sunColor = [0, 0, 0];
    this.fog = [0.8, 0.8, 0.8, 0];
    this.split = 1e6;
    this.ceilY = 3;
    /* 구역 2개 분량의 조명 값(셰이더 uniform 배열과 같은 순서) */
    this.z = {
      ambSky: new Float32Array(6), ambGround: new Float32Array(6),
      boxMin: new Float32Array(6), boxMax: new Float32Array(6),
      winRect: new Float32Array(24), winColor: new Float32Array(6),
      lampRect: new Float32Array(24), lampColor: new Float32Array(6),
      winRef: new Float32Array(16), tubeRef: new Float32Array(16), tubeColor: new Float32Array(6)
    };
    for (var i = 0; i < 2; i++) this.setZone(i, {});
    this.lightVP = M4.create();

    this._tmpVP = M4.create();
    this._blend = [];
    this._solid = [];
    /* 본 그리기 전에 깊이만 먼저 쓴다(가려진 조각의 조명 계산을 없앤다).
       타일 방식인 애플 GPU 는 가려진 조각을 스스로 걸러 내므로 득이 없고 그리기 호출만 늘어난다(프레임당 +0.2~0.5ms): 그런 기기에서는 끈다.
       그래픽 장치 이름을 알 수 없으면 켠다(켠 쪽도 화면은 똑같다). 주소에 ?prepass=1 · ?prepass=0 을 붙이면 억지로 정할 수 있다(main.js) */
    this.renderer = this._rendererName();
    this.prepass = !/apple/i.test(this.renderer);
    /* 그때 깊이를 뒤로 미는 정도(polygonOffset 의 기울기 몫 · 고정 몫). 클수록 안전하지만 바로 밑에 겹쳐 깔린 면(문제지 아래의 종이 더미)까지 칠하게 된다 */
    this.prepassBias = [0.1, 16];
    this._last = new Float64Array(10);

    var ext = gl.getExtension('EXT_texture_filter_anisotropic');
    this.anisoExt = ext || null;
    this.maxAniso = ext ? (gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1) : 1;

    this._initPrograms();
    this._initShadow();
    this.white = this.createTexture({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }, { mip: false });
  }

  /* 그래픽 장치 이름(예: "Apple GPU", "ANGLE (Intel, …)"). 알 수 없으면 빈 문자열 */
  Engine.prototype._rendererName = function () {
    var gl = this.gl, name = '';
    try {
      name = String(gl.getParameter(gl.RENDERER) || '');
      /* 크롬·사파리는 여기서 뭉뚱그린 이름만 준다: 그때만 확장으로 진짜 이름을 묻는다(파이어폭스는 위에서 바로 주고, 확장을 부르면 경고를 낸다) */
      if (!name || /^(webkit webgl|mozilla)$/i.test(name)) {
        var dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || name);
      }
    } catch (e) { /* 이름을 못 얻어도 그리는 데는 지장이 없다 */ }
    return name;
  };

  Engine.prototype._compile = function (vsSrc, fsSrc, label) {
    var gl = this.gl;
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        var log = gl.getShaderInfoLog(s) || '';
        gl.deleteShader(s);
        throw new Error('셰이더 컴파일 실패(' + label + '): ' + log);
      }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER, vsSrc);
    var fs = sh(gl.FRAGMENT_SHADER, fsSrc);
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('셰이더 링크 실패(' + label + '): ' + (gl.getProgramInfoLog(p) || ''));
    }
    var prog = { prog: p, loc: {} };
    prog.u = function (name) {
      if (!(name in prog.loc)) prog.loc[name] = gl.getUniformLocation(p, name);
      return prog.loc[name];
    };
    return prog;
  };

  Engine.prototype._initPrograms = function () {
    try {
      if (GX.DEBUG_FORCE_BASIC) throw new Error('forced');
      this.pMain = this._compile(VS_MAIN, FS_MAIN, 'main');
    } catch (e) {
      this.warnings.push(String(e && e.message || e));
      this.mode = 'basic';
      this.pMain = this._compile(VS_MAIN, FS_BASIC, 'basic');   /* 이것마저 실패하면 예외를 그대로 올린다 */
    }
    try {
      this.pShadow = this._compile(VS_SHADOW, FS_SHADOW, 'shadow');
    } catch (e2) {
      this.warnings.push(String(e2 && e2.message || e2));
      this.pShadow = null;
    }
  };

  Engine.prototype._initShadow = function () {
    var gl = this.gl, S = this.shadowSize;
    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, S, S, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowTex = tex;
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    this.shadowFbo = fbo;
    this.shadowOK = ok && !!this.pShadow && this.mode === 'full';
    if (!this.shadowOK) this.warnings.push('그림자 맵을 쓸 수 없어 그림자 없이 그립니다.');
  };

  /* 햇빛 방향(해를 향한 단위 벡터)과 그림자가 덮을 영역(AABB) */
  Engine.prototype.setSun = function (dir, color, bounds) {
    var l = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]) || 1;
    this.sunDir = [dir[0] / l, dir[1] / l, dir[2] / l];
    this.sunColor = color;
    var b = bounds;
    var cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
    var view = M4.create();
    var d = 40;
    M4.lookAt(view, cx + this.sunDir[0] * d, cy + this.sunDir[1] * d, cz + this.sunDir[2] * d, cx, cy, cz, 0, 1, 0);
    var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], p = [0, 0, 0];
    for (var i = 0; i < 8; i++) {
      M4.point(view, (i & 1) ? b[3] : b[0], (i & 2) ? b[4] : b[1], (i & 4) ? b[5] : b[2], p);
      for (var k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
    }
    var proj = M4.create();
    /* 뷰 공간에서 카메라는 -z 를 본다: near = -max z, far = -min z */
    M4.ortho(proj, mn[0], mx[0], mn[1], mx[1], -mx[2] - 1, -mn[2] + 1);
    M4.multiply(this.lightVP, proj, view);
  };

  /* 구역 조명. o 의 항목은 모두 선택(없으면 0):
   *  ambSky/ambGround [r,g,b] 위·아래에서 오는 바탕빛, box [x0,y0,z0,x1,y1,z1] 방의 안쪽 크기(모서리 음영)
   *  win { x, y0, y1, z0, z1, color } 창문 띠 전체를 하나의 면광원으로, sign: 창이 -x 쪽이면 -1
   *  winRef { z0, period, half, count } 창 하나하나의 위치(반사용)
   *  lamp { y, x0, x1, z0, z1, color } 형광등이 달린 천장 면
   *  tube { x0, z0, px, pz, hx, hz, nx, nz, color } 형광등 격자(반사용) */
  Engine.prototype.setZone = function (i, o) {
    var z = this.z, k;
    function put(arr, at, v, n) { for (k = 0; k < n; k++) arr[at + k] = v ? (v[k] || 0) : 0; }
    put(z.ambSky, i * 3, o.ambSky, 3); put(z.ambGround, i * 3, o.ambGround, 3);
    var b = o.box || [-1e4, -1e4, -1e4, 1e4, 1e4, 1e4];
    put(z.boxMin, i * 3, [b[0], b[1], b[2]], 3); put(z.boxMax, i * 3, [b[3], b[4], b[5]], 3);
    var w = o.win, r, sg;
    if (w) {
      sg = w.sign || -1;
      /* 방 안에서 볼 때 시계 방향 */
      r = sg < 0 ? [w.x, w.y0, w.z1, w.x, w.y1, w.z1, w.x, w.y1, w.z0, w.x, w.y0, w.z0]
        : [w.x, w.y0, w.z0, w.x, w.y1, w.z0, w.x, w.y1, w.z1, w.x, w.y0, w.z1];
      put(z.winRect, i * 12, r, 12); put(z.winColor, i * 3, w.color, 3);
      var wr = o.winRef || { z0: (w.z0 + w.z1) / 2, period: 1, half: (w.z1 - w.z0) / 2, count: 1 };
      put(z.winRef, i * 8, [w.x, w.y0, w.y1, sg, wr.z0, wr.period, wr.half, wr.count], 8);
    } else {
      put(z.winRect, i * 12, [0, 1e4, 0, 1, 1e4, 0, 1, 1e4, 1, 0, 1e4, 1], 12); put(z.winColor, i * 3, null, 3);
      put(z.winRef, i * 8, [0, 0, 0, 0, 0, 1, 0, 1], 8);
    }
    var L = o.lamp;
    if (L) {
      put(z.lampRect, i * 12, [L.x0, L.y, L.z1, L.x1, L.y, L.z1, L.x1, L.y, L.z0, L.x0, L.y, L.z0], 12);
      put(z.lampColor, i * 3, L.color, 3);
    } else {
      put(z.lampRect, i * 12, [0, 1e4, 0, 1, 1e4, 0, 1, 1e4, 1, 0, 1e4, 1], 12); put(z.lampColor, i * 3, null, 3);
    }
    var t = o.tube;
    if (t) {
      put(z.tubeRef, i * 8, [t.x0, t.z0, t.px || 1, t.pz || 1, t.hx, t.hz, t.nx || 1, t.nz || 1], 8);
      put(z.tubeColor, i * 3, t.color, 3);
    } else {
      put(z.tubeRef, i * 8, [0, 0, 1, 1, 0.001, 0.001, 1, 1], 8); put(z.tubeColor, i * 3, null, 3);
    }
  };

  /* geo: GX.Geo 또는 { vertices, indices } */
  Engine.prototype.createMesh = function (geo, dynamic) {
    var gl = this.gl;
    var b = geo.build ? geo.build() : geo;
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, b.vertices, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 48, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 48, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 48, 40);
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return { vao: vao, vbo: vbo, ibo: ibo, count: b.indices.length };
  };

  /* 동적 메시의 정점만 갈아 끼운다(정점 수는 같아야 함) */
  Engine.prototype.updateMesh = function (mesh, vertices) {
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  };

  /* src: <canvas> 또는 { width, height, data:Uint8Array(RGBA, 알파 미리 곱함) }
   * opts: { repeat, mip(기본 true), aniso(기본 true), nearest } */
  Engine.prototype.createTexture = function (src, opts) {
    var t = { tex: this.gl.createTexture(), opts: opts || {}, width: src.width, height: src.height };
    this.updateTexture(t, src);
    return t;
  };

  Engine.prototype.updateTexture = function (t, src) {
    var gl = this.gl, o = t.opts;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (typeof src.getContext !== 'function') {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, src.width, src.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
    } else {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    t.width = src.width; t.height = src.height;
    var wrap = o.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    var mip = o.mip !== false;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, o.nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : (o.nearest ? gl.NEAREST : gl.LINEAR));
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    if (this.anisoExt && mip && o.aniso !== false) {
      gl.texParameterf(gl.TEXTURE_2D, this.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, this.maxAniso));
    }
    return t;
  };

  /* 그릴 항목 등록. opts: tex, model, tint, unlit, cast, receive, blend(0 불투명 /1 알파 /2 가산), order, lod, spec,
   *   glossLum(텍스처가 어두운 곳은 덜 반짝이게 0..1), rim(가장자리 빛 0..1) */
  Engine.prototype.add = function (mesh, o) {
    o = o || {};
    var it = {
      mesh: mesh,
      tex: o.tex || null,
      model: o.model || M4.create(),
      tint: o.tint || [1, 1, 1, 1],
      unlit: o.unlit || 0,
      receive: o.receive !== false,
      blend: o.blend || 0,
      cast: o.cast !== false && !o.blend,
      depthWrite: o.depthWrite !== undefined ? o.depthWrite : !o.blend,
      lod: o.lod || 0,
      spec: o.spec === undefined ? 1 : o.spec,
      glossLum: o.glossLum || 0,
      rim: o.rim || 0,
      visible: o.visible !== false,
      order: o.order || 0
    };
    this.items.push(it);
    return it;
  };

  Engine.prototype.remove = function (it) {
    var i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
  };
  Engine.prototype.destroyMesh = function (mesh) {
    var gl = this.gl;
    if (!mesh || mesh.dead) return;
    mesh.dead = true;
    gl.deleteVertexArray(mesh.vao); gl.deleteBuffer(mesh.vbo); gl.deleteBuffer(mesh.ibo);
  };
  Engine.prototype.destroyTexture = function (t) {
    if (!t || t.dead) return;
    t.dead = true;
    this.gl.deleteTexture(t.tex);
  };

  Engine.prototype.resize = function (w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
  };

  /* 이번 프레임에 그릴 불투명한 물체를 그릴 순서(등록한 순서)대로 돌려준다. 반투명한 것은 this._blend 에 모아 둔다.
   * 순서는 바꾸지 않는다: 딱 붙어 있는 두 면은 나중에 그린 쪽이 보이는데, 순서를 바꾸면 그 몇 픽셀이 달라진다(tools/wk/prepass.js 로 확인) */
  Engine.prototype.opaqueOrder = function () {
    var items = this.items, n = items.length, out = this._solid, blend = this._blend, i, it;
    out.length = 0; blend.length = 0;
    for (i = 0; i < n; i++) {
      it = items[i];
      if (!it.visible) continue;
      if (it.blend) blend.push(it); else out.push(it);
    }
    return out;
  };

  /* cam: { view, proj, pos:[x,y,z] } */
  Engine.prototype.render = function (cam) {
    var gl = this.gl, items = this.items, n = items.length, i, it, p;
    this.drawCalls = 0;

    /* 1) 그림자 맵 */
    if (this.shadowOK && this.shadowsOn) {
      p = this.pShadow;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.5, 3.0);
      gl.useProgram(p.prog);
      gl.uniformMatrix4fv(p.u('uLightVP'), false, this.lightVP);
      for (i = 0; i < n; i++) {
        it = items[i];
        if (!it.visible || !it.cast) continue;
        gl.uniformMatrix4fv(p.u('uModel'), false, it.model);
        gl.bindVertexArray(it.mesh.vao);
        gl.drawElements(gl.TRIANGLES, it.mesh.count, gl.UNSIGNED_INT, 0);
        this.drawCalls++;
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    /* 2) 본 화면 */
    p = this.pMain;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(this.clear[0], this.clear[1], this.clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(p.prog);

    M4.multiply(this._tmpVP, cam.proj, cam.view);
    gl.uniformMatrix4fv(p.u('uViewProj'), false, this._tmpVP);
    gl.uniformMatrix4fv(p.u('uLightVP'), false, this.lightVP);
    gl.uniform3f(p.u('uCamPos'), cam.pos[0], cam.pos[1], cam.pos[2]);
    gl.uniform3f(p.u('uSunDir'), this.sunDir[0], this.sunDir[1], this.sunDir[2]);
    var sunOn = (this.shadowOK && this.shadowsOn) ? 1 : 0;   /* 그림자를 못 쓰면 실내에 햇빛이 새지 않게 끈다 */
    gl.uniform3f(p.u('uSunColor'), this.sunColor[0] * sunOn, this.sunColor[1] * sunOn, this.sunColor[2] * sunOn);
    var z = this.z;
    gl.uniform3fv(p.u('uAmbSky[0]'), z.ambSky);
    gl.uniform3fv(p.u('uAmbGround[0]'), z.ambGround);
    gl.uniform3fv(p.u('uBoxMin[0]'), z.boxMin);
    gl.uniform3fv(p.u('uBoxMax[0]'), z.boxMax);
    gl.uniform3fv(p.u('uWinRect[0]'), z.winRect);
    gl.uniform3fv(p.u('uWinColor[0]'), z.winColor);
    gl.uniform3fv(p.u('uLampRect[0]'), z.lampRect);
    gl.uniform3fv(p.u('uLampColor[0]'), z.lampColor);
    gl.uniform4fv(p.u('uWinRef[0]'), z.winRef);
    gl.uniform4fv(p.u('uTubeRef[0]'), z.tubeRef);
    gl.uniform3fv(p.u('uTubeColor[0]'), z.tubeColor);
    gl.uniform1f(p.u('uSplit'), this.split);
    gl.uniform1f(p.u('uCeilY'), this.ceilY);
    gl.uniform4f(p.u('uFog'), this.fog[0], this.fog[1], this.fog[2], this.fog[3]);
    gl.uniform2f(p.u('uShadowTexel'), 1 / this.shadowSize, 1 / this.shadowSize);
    gl.uniform1f(p.u('uExposure'), this.exposure);
    gl.uniform1i(p.u('uTex'), 0);
    gl.uniform1i(p.u('uShadowMap'), 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.activeTexture(gl.TEXTURE0);

    var blend = this._blend, solid = this.opaqueOrder();

    /* 2-1) 깊이 먼저: 조명을 받는 불투명한 물체의 깊이만 먼저 써 둔다(색은 쓰지 않는다).
       그러면 본 그리기에서 가려진 조각은 깊이 판정에서 걸러져, 무거운 조명 계산이 화면에 실제로 보이는 조각에만 돈다
       (한 픽셀에 평균 두 번쯤 하던 계산이 한 번으로 준다 — tools/wk/overdraw.js 로 잰다).
       깊이를 아주 조금 뒤로 밀어 써 두므로(polygonOffset), 두 셰이더의 계산이 끝자리에서 어긋나도 보여야 할 조각이 떨어져 나가지 않고,
       본 그리기는 예전과 똑같은 깊이 판정(LEQUAL)을 하므로 화면은 예전과 같다 */
    if (this.prepass && this.mode === 'full' && this.pShadow) {
      var ps = this.pShadow;
      gl.useProgram(ps.prog);
      gl.uniformMatrix4fv(ps.u('uLightVP'), false, this._tmpVP);
      gl.colorMask(false, false, false, false);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(this.prepassBias[0], this.prepassBias[1]);
      for (i = 0; i < solid.length; i++) {
        it = solid[i];
        if (it.unlit >= 0.99) continue;          /* 조명을 안 받는 것(창밖 풍경·형광등 관)은 싸게 그려지므로 건너뛴다 */
        gl.uniformMatrix4fv(ps.u('uModel'), false, it.model);
        gl.bindVertexArray(it.mesh.vao);
        gl.drawElements(gl.TRIANGLES, it.mesh.count, gl.UNSIGNED_INT, 0);
        this.drawCalls++;
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.colorMask(true, true, true, true);
      gl.useProgram(p.prog);
    }

    var lastTex = null, lc = this._last;
    for (i = 0; i < 10; i++) lc[i] = NaN;        /* 프레임마다 재질 값을 처음부터 다시 보낸다 */
    for (i = 0; i < solid.length; i++) lastTex = this._draw(p, solid[i], lastTex);

    if (blend.length) {
      var cx = cam.pos[0], cy = cam.pos[1], cz = cam.pos[2];
      for (i = 0; i < blend.length; i++) {
        var m = blend[i].model, dx = m[12] - cx, dy = m[13] - cy, dz = m[14] - cz;
        blend[i]._d = dx * dx + dy * dy + dz * dz;
      }
      blend.sort(function (a, b) { return (a.order - b.order) || (b._d - a._d); });
      gl.enable(gl.BLEND);
      var mode = 0;
      for (i = 0; i < blend.length; i++) {
        it = blend[i];
        if (it.blend !== mode) {
          mode = it.blend;
          if (mode === 2) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
        gl.depthMask(!!it.depthWrite);
        lastTex = this._draw(p, it, lastTex);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
  };

  Engine.prototype._draw = function (p, it, lastTex) {
    var gl = this.gl;
    var tex = (it.tex || this.white).tex;
    if (tex !== lastTex) { gl.bindTexture(gl.TEXTURE_2D, tex); lastTex = tex; }
    gl.uniformMatrix4fv(p.u('uModel'), false, it.model);
    /* 재질 값은 앞 물체와 다를 때만 다시 보낸다(그리기 호출마다 드는 비용을 줄인다) */
    var t = it.tint, c = this._last, rc = it.receive ? 1 : 0;
    if (c[0] !== t[0] || c[1] !== t[1] || c[2] !== t[2] || c[3] !== t[3]) {
      gl.uniform4f(p.u('uTint'), t[0], t[1], t[2], t[3]);
      c[0] = t[0]; c[1] = t[1]; c[2] = t[2]; c[3] = t[3];
    }
    if (c[4] !== it.unlit || c[5] !== rc || c[6] !== it.lod || c[7] !== it.spec) {
      gl.uniform4f(p.u('uMat'), it.unlit, rc, it.lod, it.spec);
      c[4] = it.unlit; c[5] = rc; c[6] = it.lod; c[7] = it.spec;
    }
    if (c[8] !== it.glossLum || c[9] !== it.rim) {
      gl.uniform4f(p.u('uMat2'), it.glossLum, it.rim, 0, 0);
      c[8] = it.glossLum; c[9] = it.rim;
    }
    gl.bindVertexArray(it.mesh.vao);
    gl.drawElements(gl.TRIANGLES, it.mesh.count, gl.UNSIGNED_INT, 0);
    this.drawCalls++;
    return lastTex;
  };

  GX.Engine = Engine;
})(window.GX = window.GX || {});
