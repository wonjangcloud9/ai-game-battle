/* SUNDRIFT GP — GLSL ES 3.00 sources. Kept in one place so the lighting model stays consistent. */
(function (root) {
  'use strict';
  var SD = root.SD;
  var S = SD.SHADERS = {};

  // -------------------------------------------------------------- shared chunks
  var ENV = `
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyTop;
uniform vec3 uSkyHor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGnd;
uniform vec4 uFog;      // x density, y max amount, z exposure, w unused
uniform float uTime;

vec3 skyBase(vec3 d) {
  float h = max(d.y, 0.0);
  vec3 c = mix(uSkyHor, uSkyTop, 1.0 - exp(-h * 3.4));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (0.07 * pow(s, 5.0) + 0.22 * pow(s, 40.0));
  return c;
}
vec3 applyFog(vec3 col, vec3 world) {
  vec3 v = world - uCamPos;
  float dist = length(v);
  float f = (1.0 - exp(-dist * uFog.x)) * uFog.y;
  vec3 dir = normalize(vec3(v.x, 0.05 * dist + abs(v.y) * 0.25, v.z));
  return mix(col, skyBase(dir), f);
}
vec3 toneMap(vec3 c) {
  c = 1.0 - exp(-c * uFog.z);
  return pow(c, vec3(1.0 / 2.2));
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

  var ANIMATE = `
uniform float uCrowd;
vec3 animate(vec3 p, vec3 n, int mat, vec2 uv, float t) {
  if (mat == 7) {                       // foliage sway: uv.x amplitude, uv.y phase
    p.x += sin(t * 1.7 + uv.y + p.y * 0.35) * uv.x;
    p.z += cos(t * 1.3 + uv.y * 1.7 + p.y * 0.3) * uv.x * 0.8;
  } else if (mat == 13) {               // crowd hop: uv.x phase, uv.y weight
    p.y += max(0.0, sin(t * 7.0 + uv.x)) * 0.24 * uv.y * uCrowd;
  } else if (mat == 14) {               // cloth: uv.x distance from the pole, uv.y phase
    float sgn = (n.x + 0.618 * n.z + 0.3 * n.y) >= 0.0 ? 1.0 : -1.0;
    float w = sin(t * 6.0 + uv.y - uv.x * 5.0) * uv.x;
    p += n * sgn * w * 0.42;
    p.y += cos(t * 4.7 + uv.y - uv.x * 3.0) * uv.x * 0.1;
  }
  return p;
}
`;

  // -------------------------------------------------------------- lit geometry
  S.litVert = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec2 aUV;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat4 uShadowMat;
uniform vec2 uShadowBias;   // x: normal offset (m), y: depth bias
uniform float uTimeV;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
out vec2 vUV;
out vec3 vShadow;
flat out int vMat;
${ANIMATE}
void main() {
  int mat = int(aColor.a * 255.0 + 0.5);
  vec3 p = animate(aPos, aNormal, mat, aUV, uTimeV);
  vec4 w = uModel * vec4(p, 1.0);
  vec3 n = normalize(mat3(uModel) * aNormal);
  vWorld = w.xyz;
  vNormal = n;
  vColor = aColor.rgb;
  vUV = aUV;
  vMat = mat;
  vShadow = (uShadowMat * vec4(w.xyz + n * uShadowBias.x, 1.0)).xyz;
  gl_Position = uViewProj * w;
}
`;

  S.litFrag = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
in vec2 vUV;
in vec3 vShadow;
flat in int vMat;
uniform sampler2DShadow uShadowMap;
uniform sampler2D uAtlas;
uniform vec2 uShadowBias;
uniform float uShadowTexel;
uniform vec4 uRoad;       // x half width, y dash period, z track length
uniform vec3 uLights;     // start lights: 0 off, 1 red, 2 green
uniform vec4 uTint;       // rgb added glow colour, a amount (per draw)
out vec4 fragColor;
${ENV}
float shadowAt() {
  vec3 sc = vShadow;
  vec2 e = abs(sc.xy - 0.5) * 2.0;
  float edge = max(e.x, e.y);
  if (edge >= 1.0 || sc.z >= 1.0 || sc.z <= 0.0) return 1.0;
  float z = sc.z - uShadowBias.y;
  float t = uShadowTexel * 1.15;
  float s = texture(uShadowMap, vec3(sc.xy + vec2(-t, -t), z));
  s += texture(uShadowMap, vec3(sc.xy + vec2(t, -t), z));
  s += texture(uShadowMap, vec3(sc.xy + vec2(-t, t), z));
  s += texture(uShadowMap, vec3(sc.xy + vec2(t, t), z));
  s *= 0.25;
  return mix(s, 1.0, smoothstep(0.8, 1.0, edge));
}
vec3 roadColor(vec2 uv, vec2 fw) {
  float x = uv.x;
  float s = uv.y;
  float hw = uRoad.x;
  float ax = max(fw.x, 0.0005);
  float ay = max(fw.y, 0.0005);
  float grain = vnoise(uv * 4.3) * 0.45 + vnoise(uv * 19.0) * 0.55;
  float detail = clamp(1.0 - max(fw.x, fw.y) * 4.0, 0.0, 1.0);
  vec3 c = vec3(0.058, 0.062, 0.074) * (1.0 + (grain - 0.5) * 0.36 * detail);
  c *= 1.0 - 0.16 * exp(-pow(x / (hw * 0.62), 2.0) * 3.0);                      // rubbered-in racing groove
  float edge = 1.0 - smoothstep(0.12 - ax, 0.12 + ax, abs(abs(x) - (hw - 0.6)));
  float ph = fract(s / uRoad.y);
  float dy = ay / uRoad.y;
  float on = smoothstep(0.0, dy, ph) * (1.0 - smoothstep(0.4, 0.4 + dy, ph));
  on = mix(on, 0.4, clamp(dy * 2.5, 0.0, 1.0));
  float dash = (1.0 - smoothstep(0.1 - ax, 0.1 + ax, abs(x))) * on;
  c = mix(c, vec3(0.80, 0.80, 0.76), max(edge, dash) * 0.9);
  if (s < 2.5) {                                                                  // start / finish chequers
    vec2 q = floor(vec2((x + hw) / 1.25, s / 1.25));
    float ck = mod(q.x + q.y, 2.0);
    float m = smoothstep(2.5, 2.5 - ay * 1.5, s) * smoothstep(0.0, ay * 1.5, s);
    c = mix(c, mix(vec3(0.03), vec3(0.86), ck), m);
  }
  return c;
}
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  vec3 albedo = pow(vColor, vec3(2.2));
  vec2 uvDx = dFdx(vUV);        // derivatives taken outside the material branches
  vec2 uvDy = dFdy(vUV);
  float gloss = 0.0;
  float shin = 24.0;
  float rim = 0.0;
  float emis = 0.0;
  float wrap = 0.0;
  float refl = 0.0;
  if (vMat == 3) {
    albedo = roadColor(vUV, abs(uvDx) + abs(uvDy)); gloss = 0.1; shin = 10.0;
  } else if (vMat == 1) {
    gloss = 0.9; shin = 90.0; rim = 0.5; refl = 0.075;
  } else if (vMat == 2) {
    emis = 1.0;
  } else if (vMat == 4) {
    albedo = pow(textureGrad(uAtlas, vUV, uvDx, uvDy).rgb, vec3(2.2)); gloss = 0.08; shin = 20.0;
  } else if (vMat == 5) {
    gloss = 1.4; shin = 140.0; rim = 0.9; refl = 0.16;
  } else if (vMat == 6) {
    gloss = 0.12; shin = 9.0;
  } else if (vMat == 7) {
    wrap = 0.5;
  } else if (vMat == 8) {
    gloss = 1.1; shin = 100.0; rim = 0.7; refl = 0.14;
  } else if (vMat == 9) {
    gloss = 0.18; shin = 26.0;
  } else if (vMat == 10) {
    albedo *= 0.9 + 0.2 * vnoise(vWorld.xz * 2.6);
  } else if (vMat == 11) {
    float ch = fract((vUV.y + abs(vUV.x) * 1.15) * 0.42 - uTime * 2.4);
    float arrow = smoothstep(0.0, 0.08, ch) * (1.0 - smoothstep(0.5, 0.58, ch));
    float border = smoothstep(0.84, 0.9, abs(vUV.x));
    albedo = mix(mix(vec3(0.0, 0.12, 0.42), vec3(0.25, 1.0, 1.0), arrow), vec3(1.0, 0.8, 0.1), border);
    emis = 0.45 + 0.55 * max(arrow, border);
  } else if (vMat == 13) {
    wrap = 0.3;
  } else if (vMat == 14) {
    wrap = 0.35;
  } else if (vMat == 15) {
    int idx = int(vUV.x + 0.5);
    float st = idx == 0 ? uLights.x : (idx == 1 ? uLights.y : uLights.z);
    if (st < 0.5) { albedo = vec3(0.05, 0.012, 0.012); gloss = 0.9; shin = 60.0; }
    else if (st < 1.5) { albedo = vec3(1.0, 0.06, 0.03); emis = 1.0; }
    else { albedo = vec3(0.1, 1.0, 0.25); emis = 1.0; }
  } else if (vMat == 16) {
    albedo *= 0.9 + 0.2 * vnoise(vWorld.xz * 1.4);
  } else if (vMat == 17) {
    albedo *= 0.86 + 0.28 * vnoise(vWorld.xz * 0.9 + vWorld.y * 0.7);
  }
  float ndl = dot(N, uSunDir);
  float diff = max((ndl + wrap) / (1.0 + wrap), 0.0);
  float sh = shadowAt();
  vec3 amb = mix(uAmbGnd, uAmbSky, N.y * 0.5 + 0.5);
  vec3 col = albedo * (amb + uSunCol * diff * sh);
  vec3 Hv = normalize(uSunDir + V);
  float spec = pow(max(dot(N, Hv), 0.0), shin) * gloss * sh * step(0.0, ndl);
  col += uSunCol * spec;
  float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += skyBase(reflect(-V, N)) * (fr * rim * 0.55 + refl);
  col = mix(col, albedo * 1.7, emis);
  col += uTint.rgb * uTint.a;
  col = applyFog(col, vWorld);
  fragColor = vec4(toneMap(col), clamp(emis * 0.9 + uTint.a * 0.4 + spec * 0.25, 0.0, 1.0));
}
`;

  // -------------------------------------------------------------- shadow depth
  S.shadowVert = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec2 aUV;
uniform mat4 uModel;
uniform mat4 uLightVP;
uniform float uTimeV;
${ANIMATE}
void main() {
  int mat = int(aColor.a * 255.0 + 0.5);
  vec3 p = animate(aPos, aNormal, mat, aUV, uTimeV);
  gl_Position = uLightVP * (uModel * vec4(p, 1.0));
}
`;
  S.shadowFrag = `#version 300 es
precision mediump float;
void main() {}
`;

  // -------------------------------------------------------------- sky
  S.fullVert = `#version 300 es
precision highp float;
out vec2 vNdc;
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  vNdc = p * 2.0 - 1.0;
  gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0);
}
`;
  S.skyFrag = `#version 300 es
precision highp float;
in vec2 vNdc;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform vec2 uTan;
out vec4 fragColor;
${ENV}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s / 0.9375;
}
void main() {
  vec3 d = normalize(uCamFwd + vNdc.x * uTan.x * uCamRight + vNdc.y * uTan.y * uCamUp);
  vec3 col = skyBase(d);
  float s = dot(d, uSunDir);
  float disc = smoothstep(0.99925, 0.99965, s);
  col += uSunCol * disc * 4.0;
  float glow = disc;
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.14) * 0.85 + uTime * vec2(0.0065, 0.0021);
    float n = fbm(uv);
    float cov = smoothstep(0.5, 0.74, n);
    float n2 = fbm(uv + uSunDir.xz * 0.14);
    float lit = clamp(0.6 + (n - n2) * 2.6, 0.0, 1.0);
    vec3 cc = mix(vec3(0.5, 0.6, 0.76), vec3(1.0, 0.98, 0.93), lit) * 1.15;
    float fade = smoothstep(0.0, 0.2, d.y);
    col = mix(col, cc, cov * fade * 0.94);
    glow *= 1.0 - cov;
  } else {
    col = mix(col, vec3(0.02, 0.2, 0.42), smoothstep(0.0, -0.08, d.y));
  }
  fragColor = vec4(toneMap(col), glow);
}
`;

  // -------------------------------------------------------------- sea
  S.seaVert = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 3) in vec2 aUV;
uniform mat4 uViewProj;
out vec3 vWorld;
out float vH;
void main() {
  vWorld = aPos;
  vH = aUV.x;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;
  S.seaFrag = `#version 300 es
precision highp float;
in vec3 vWorld;
in float vH;
out vec4 fragColor;
${ENV}
vec2 grad(vec2 p) {
  float e = 0.35;
  return vec2(vnoise(p + vec2(e, 0.0)) - vnoise(p - vec2(e, 0.0)), vnoise(p + vec2(0.0, e)) - vnoise(p - vec2(0.0, e)));
}
void main() {
  float depth = -vH;
  vec2 p = vWorld.xz;
  float t = uTime;
  vec3 toCam = uCamPos - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float amp = 1.0 / (1.0 + dist * 0.012);
  vec2 g = grad(p * 0.16 + vec2(t * 0.42, t * 0.15)) + grad(p * 0.43 + vec2(-t * 0.33, t * 0.47)) * 0.7;
  vec3 N = normalize(vec3(-g.x * 0.9 * amp, 1.0, -g.y * 0.9 * amp));
  vec3 deep = vec3(0.008, 0.13, 0.36);
  vec3 mid = vec3(0.012, 0.36, 0.52);
  vec3 shallow = vec3(0.07, 0.72, 0.68);
  vec3 base = mix(mix(shallow, mid, smoothstep(0.0, 3.2, depth)), deep, smoothstep(2.5, 12.0, depth));
  base = mix(vec3(0.72, 0.62, 0.36), base, smoothstep(-0.15, 1.0, depth));
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 col = base * (uAmbSky * 0.9 + uSunCol * (0.35 + 0.65 * ndl));
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col = mix(col, skyBase(reflect(-V, N)), fres * 0.7);
  float sp = pow(max(dot(N, normalize(uSunDir + V)), 0.0), 320.0);
  col += uSunCol * sp * 2.2;
  float wob = vnoise(p * 0.3 + t * 0.15) * 6.2832;
  float f1 = 1.0 - smoothstep(0.0, 0.5, abs(depth - 0.3 - 0.3 * sin(t * 1.2 + wob)));
  float f2 = (1.0 - smoothstep(0.0, 0.3, abs(depth - 1.5 - 0.5 * sin(t * 0.8 + wob + 2.0)))) * 0.45;
  float foam = clamp(f1 + f2, 0.0, 1.0) * step(-0.4, depth) * (0.75 + 0.25 * vnoise(p * 1.7));
  col = mix(col, vec3(1.25), foam * 0.85);
  col = applyFog(col, vWorld);
  fragColor = vec4(toneMap(col), clamp(sp * 0.8, 0.0, 1.0));
}
`;

  // -------------------------------------------------------------- particles (CPU billboards)
  S.partVert = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aColor;
layout(location = 3) in float aKind;
uniform mat4 uViewProj;
out vec2 vUV;
out vec4 vColor;
out float vKind;
void main() {
  vUV = aUV;
  vColor = aColor;
  vKind = aKind;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;
  S.partFrag = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
in float vKind;
uniform float uAdd;
out vec4 fragColor;
void main() {
  float r = length(vUV);
  float a;
  if (vKind < 0.5) a = 1.0 - smoothstep(0.25, 1.0, r);                               // soft puff
  else if (vKind < 1.5) a = (1.0 - smoothstep(0.3, 1.0, abs(vUV.x))) * (1.0 - smoothstep(0.55, 1.0, abs(vUV.y)));   // streak
  else if (vKind < 2.5) a = 1.0;                                                     // confetti
  else a = exp(-r * r * 3.6) * (1.0 - smoothstep(0.85, 1.0, r));                     // glow
  a *= vColor.a;
  if (a < 0.003) discard;
  if (uAdd > 0.5) fragColor = vec4(vColor.rgb * a, a * 0.75);
  else fragColor = vec4(vColor.rgb, a);
}
`;

  // -------------------------------------------------------------- skid marks
  S.skidVert = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in float aAlpha;
uniform mat4 uViewProj;
uniform vec3 uCamPos;
out float vA;
void main() {
  vA = aAlpha * exp(-distance(aPos, uCamPos) * 0.006);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;
  S.skidFrag = `#version 300 es
precision highp float;
in float vA;
out vec4 fragColor;
void main() {
  fragColor = vec4(0.035, 0.035, 0.04, vA);
}
`;

  // -------------------------------------------------------------- post
  S.brightFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  vec4 c = texture(uTex, vUV);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float k = c.a * 1.15 + smoothstep(0.82, 1.0, l) * 0.3;
  fragColor = vec4(c.rgb * k, 1.0);
}
`;
  S.blurFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uTexel;     // source texel size * spread
out vec4 fragColor;
void main() {
  vec3 c = texture(uTex, vUV).rgb * 4.0;
  c += texture(uTex, vUV + vec2(-uTexel.x, -uTexel.y)).rgb;
  c += texture(uTex, vUV + vec2(uTexel.x, -uTexel.y)).rgb;
  c += texture(uTex, vUV + vec2(-uTexel.x, uTexel.y)).rgb;
  c += texture(uTex, vUV + vec2(uTexel.x, uTexel.y)).rgb;
  c += (texture(uTex, vUV + vec2(-2.0 * uTexel.x, 0.0)).rgb + texture(uTex, vUV + vec2(2.0 * uTexel.x, 0.0)).rgb
      + texture(uTex, vUV + vec2(0.0, -2.0 * uTexel.y)).rgb + texture(uTex, vUV + vec2(0.0, 2.0 * uTexel.y)).rgb) * 0.5;
  fragColor = vec4(c / 10.0, 1.0);
}
`;
  S.compositeFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec4 uFx;        // x radial blur, y speed lines, z boost tint, w time
uniform vec4 uGrade;     // x bloom amount, y vignette, z saturation, w fade (1 = visible)
out vec4 fragColor;
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
void main() {
  vec2 uv = vUV;
  vec2 dir = uv - vec2(0.5, 0.54);
  float dist = length(dir);
  vec3 col;
  if (uFx.x > 0.002) {
    float amt = uFx.x * smoothstep(0.07, 0.62, dist);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 10; i++) {
      acc += texture(uScene, uv - dir * amt * (float(i) / 9.0)).rgb;
    }
    col = acc * 0.1;
  } else {
    col = texture(uScene, uv).rgb;
  }
  col += texture(uBloom, uv).rgb * uGrade.x;
  if (uFx.y > 0.002) {
    float ang = atan(dir.y, dir.x) * 9.5493;                  // 60 wedges around the circle
    float seg = floor(ang);
    float rnd = hash11(seg + floor(uFx.w * 16.0) * 7.13);
    float rnd2 = hash11(seg * 3.7 + 1.3);
    float wedge = abs(fract(ang) - 0.5) * 2.0;
    float line = (1.0 - smoothstep(0.0, 0.12 + 0.3 * rnd2, wedge)) * step(0.68, rnd);
    float radial = smoothstep(0.26 + 0.22 * rnd2, 0.8, dist);
    col += vec3(1.0, 1.0, 1.0) * line * radial * uFx.y * 0.5;
  }
  col = mix(col, col * vec3(0.92, 1.02, 1.12) + vec3(0.0, 0.015, 0.05) * smoothstep(0.25, 0.75, dist), uFx.z);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uGrade.z);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
  col *= 1.0 - dist * dist * uGrade.y;
  col *= uGrade.w;
  col += (hash11(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uFx.w) - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}
`;
})(typeof window !== 'undefined' ? window : globalThis);
