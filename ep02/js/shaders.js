// AURORA FALL — GLSL ES 3.00 shader sources
'use strict';

const SHADERS = (function () {
  const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\nprecision highp sampler2DArray;\nprecision highp sampler2DShadow;\n';
  const VS_HEAD = HEAD, FS_HEAD = HEAD;
  const L = name => MAT[name] + '.0';              // texture layer as a float literal

  const NOISE = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

  // Shared environment uniforms + lighting / fog / zone / output helpers for lit fragment shaders.
  const LIT = `
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform vec3 uFogColor;
uniform vec3 uFogSun;
uniform vec4 uFogParams;      // x: density, y: lamp factor, z: cloud shadow strength, w: unused
uniform float uTime;
uniform sampler2DShadow uShadowMap;   // near cascade
uniform sampler2DShadow uShadowFar;   // far cascade
uniform mat4 uShadowMat;
uniform mat4 uShadowMatFar;
uniform vec4 uShadowParams;   // x: near on, y: near texel, z: far on, w: far texel
uniform vec4 uShadowFade;     // x: far fade start, y: far fade end, z: near normal offset, w: far normal offset
uniform vec3 uShadowCenter;
uniform vec4 uZone;           // xy: centre, z: radius, w: enabled
uniform vec3 uZoneColor;
uniform float uDirect;        // 1.0 = tone map here (no post processing)
uniform float uExposure;
uniform sampler2D uNoise;     // tileable noise: r large, g medium, b ridged, a fine
uniform vec4 uLightP0;        // point lights: xyz position, w radius
uniform vec4 uLightC0;        //               rgb colour, a: 1 = already baked into the terrain
uniform vec4 uLightP1;
uniform vec4 uLightC1;
uniform vec4 uLightP2;
uniform vec4 uLightC2;
uniform vec4 uLightP3;
uniform vec4 uLightC3;
${NOISE}
float shadowFarAt(vec3 wpos, vec3 n) {
  if (uShadowParams.z < 0.5) return 1.0;
  float fade = smoothstep(uShadowFade.x, uShadowFade.y, length(wpos.xz - uShadowCenter.xz));
  if (fade >= 1.0) return 1.0;
  vec4 sc = uShadowMatFar * vec4(wpos + n * uShadowFade.w, 1.0);
  vec3 c = sc.xyz * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  float ts = uShadowParams.w * 0.5;
  float z = c.z - 0.0004;
  float s = textureLod(uShadowFar, vec3(c.xy + vec2(-ts, -ts), z), 0.0);
  s += textureLod(uShadowFar, vec3(c.xy + vec2(ts, -ts), z), 0.0);
  s += textureLod(uShadowFar, vec3(c.xy + vec2(-ts, ts), z), 0.0);
  s += textureLod(uShadowFar, vec3(c.xy + vec2(ts, ts), z), 0.0);
  return mix(s * 0.25, 1.0, fade);
}
// soft shadow from two cascades (the near one is blended into the far one toward its border)
float shadowAt(vec3 wpos, vec3 n) {
  float sh = 1.0;
  float w = 0.0;
  if (uShadowParams.x > 0.5) {
    vec4 sc = uShadowMat * vec4(wpos + n * uShadowFade.z, 1.0);
    vec3 c = sc.xyz * 0.5 + 0.5;
    vec2 e = abs(c.xy - 0.5) * 2.0;
    float edge = max(e.x, e.y);
    if (edge < 0.985 && c.z < 1.0 && c.z > 0.0) {
      float ts = uShadowParams.y;
      float z = c.z - 0.00015;
      float s = textureLod(uShadowMap, vec3(c.xy, z), 0.0) * 2.0;
      s += textureLod(uShadowMap, vec3(c.xy + vec2(-ts, -ts), z), 0.0);
      s += textureLod(uShadowMap, vec3(c.xy + vec2(ts, -ts), z), 0.0);
      s += textureLod(uShadowMap, vec3(c.xy + vec2(-ts, ts), z), 0.0);
      s += textureLod(uShadowMap, vec3(c.xy + vec2(ts, ts), z), 0.0);
      s += textureLod(uShadowMap, vec3(c.xy + vec2(-ts * 1.5, 0.0), z), 0.0);
      s += textureLod(uShadowMap, vec3(c.xy + vec2(ts * 1.5, 0.0), z), 0.0);
      s += textureLod(uShadowMap, vec3(c.xy + vec2(0.0, -ts * 1.5), z), 0.0);
      s += textureLod(uShadowMap, vec3(c.xy + vec2(0.0, ts * 1.5), z), 0.0);
      sh = s * 0.1;
      w = 1.0 - smoothstep(0.8, 0.98, edge);
    }
  }
  if (w < 0.999) sh = mix(shadowFarAt(wpos, n), sh, w);
  return sh;
}
// one tap per cascade (grass, particles)
float shadowLite(vec3 wpos) {
  if (uShadowParams.x > 0.5) {
    vec4 sc = uShadowMat * vec4(wpos + vec3(0.0, 0.05, 0.0), 1.0);
    vec3 c = sc.xyz * 0.5 + 0.5;
    vec2 e = abs(c.xy - 0.5) * 2.0;
    if (max(e.x, e.y) < 0.97 && c.z < 1.0 && c.z > 0.0) return textureLod(uShadowMap, vec3(c.xy, c.z - 0.0002), 0.0);
  }
  if (uShadowParams.z < 0.5) return 1.0;
  float fade = smoothstep(uShadowFade.x, uShadowFade.y, length(wpos.xz - uShadowCenter.xz));
  if (fade >= 1.0) return 1.0;
  vec4 sf = uShadowMatFar * vec4(wpos + vec3(0.0, 0.2, 0.0), 1.0);
  vec3 cf = sf.xyz * 0.5 + 0.5;
  if (cf.x <= 0.0 || cf.x >= 1.0 || cf.y <= 0.0 || cf.y >= 1.0 || cf.z >= 1.0) return 1.0;
  return mix(textureLod(uShadowFar, vec3(cf.xy, cf.z - 0.0005), 0.0), 1.0, fade);
}
// slow drifting cloud shadows over the whole island
float cloudShade(vec3 wpos) {
  vec2 q = wpos.xz + uSunDir.xz * (wpos.y * 0.6);
  float c = textureLod(uNoise, q * 0.0011 + vec2(uTime * 0.0023, uTime * 0.0009), 0.0).r * 0.65
          + textureLod(uNoise, q * 0.0033 + vec2(0.3 + uTime * 0.004, 0.7), 0.0).g * 0.35;
  return 1.0 - uFogParams.z * smoothstep(0.52, 0.74, c);
}
vec3 onePointLight(vec4 lp, vec4 lc, vec3 wpos, vec3 n, float skipBaked) {
  vec3 d = lp.xyz - wpos;
  float r2 = dot(d, d);
  float att = max(1.0 - r2 / (lp.w * lp.w), 0.0);
  att *= att;
  float nl = max(dot(n, d * inversesqrt(max(r2, 0.0001))), 0.0);
  return lc.rgb * (att * (nl * 0.85 + 0.15) * (1.0 - lc.a * skipBaked));
}
vec3 pointLights(vec3 wpos, vec3 n, float skipBaked) {
  return onePointLight(uLightP0, uLightC0, wpos, n, skipBaked) + onePointLight(uLightP1, uLightC1, wpos, n, skipBaked)
       + onePointLight(uLightP2, uLightC2, wpos, n, skipBaked) + onePointLight(uLightP3, uLightC3, wpos, n, skipBaked);
}
// n: shading normal, ng: geometric normal (shadow lookup), wrap: soft terminator for foliage, ao: sky visibility
// sh: how much of the sun reaches the point (shadow maps x cloud shadows)
vec3 lightSurfaceS(vec3 albedo, vec3 n, vec3 wpos, float wrap, float ao, float spec, float gloss, float skipBaked, float sh) {
  vec3 v = normalize(uCamPos - wpos);
  float ndl = dot(n, uSunDir);
  float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  vec3 amb = mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5) * ao;
  vec3 col = albedo * (uSunColor * (diff * sh) + amb);
  vec3 hv = normalize(v + uSunDir);
  float ndh = max(dot(n, hv), 0.0);
  float sp = pow(ndh, 6.0 + gloss * gloss * 420.0) * (0.3 + gloss * 2.2) * spec;
  col += uSunColor * (sp * diff * sh);
  float fr = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 5.0);
  col += uAmbSky * (fr * spec * ao * 0.7);
  col += albedo * pointLights(wpos, n, skipBaked);
  return col;
}
vec3 lightSurface(vec3 albedo, vec3 n, vec3 ng, vec3 wpos, float wrap, float ao, float spec, float gloss, float skipBaked) {
  return lightSurfaceS(albedo, n, wpos, wrap, ao, spec, gloss, skipBaked, shadowAt(wpos, ng) * cloudShade(wpos));
}
vec3 applyFog(vec3 col, vec3 wpos) {
  vec3 v = wpos - uCamPos;
  float d = length(v);
  float hf = exp(-max(0.5 * (wpos.y + uCamPos.y), 0.0) * 0.011);
  float f = 1.0 - exp(-pow(d * uFogParams.x, 1.35) * (0.4 + 0.6 * hf));
  float sunAmt = pow(max(dot(v / max(d, 0.001), uSunDir), 0.0), 8.0);
  return mix(col, mix(uFogColor, uFogSun, sunAmt), clamp(f, 0.0, 1.0));
}
vec3 applyZone(vec3 col, vec3 wpos) {
  if (uZone.w < 0.5) return col;
  float d = length(wpos.xz - uZone.xy) - uZone.z;
  float outside = smoothstep(-0.5, 2.5, d);
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  vec3 tinted = mix(vec3(lum), col, 0.5) * vec3(0.66, 0.88, 1.0) + uZoneColor * 0.012;
  col = mix(col, tinted, outside * 0.6);
  col += uZoneColor * (exp(-abs(d) * 1.1) * 1.5);
  return col;
}
vec3 tonemapACES(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 finalColor(vec3 col) {
  if (uDirect > 0.5) {
    col = tonemapACES(col * uExposure);
    col = pow(col, vec3(1.0 / 2.2));
  }
  return col;
}
`;

  // Sky colour shared by the sky dome and the water reflection. look(uv) writes the noise lookup (implicit or fixed level).
  const skyFn = look => `
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSunGlow;
uniform vec4 uSkyParams;      // x: stars, y: aurora, z: clouds, w: sun disc
vec3 skyBase(vec3 d) {
  float h = max(d.y, 0.0);
  vec3 c = mix(uSkyHorizon, uSkyTop, 1.0 - exp(-h * 3.4));
  c += uFogColor * (0.22 * exp(-h * 13.0));
  float sd = max(dot(d, uSunDir), 0.0);
  float low = 1.0 - 0.6 * clamp(uSunDir.y * 2.5, 0.0, 1.0);
  c += uSunGlow * (pow(sd, 5.0) * (0.14 + 0.2 * low) + pow(sd, 42.0) * 0.45 + pow(sd, 400.0) * 0.9);
  return c;
}
// rgb: lit cloud colour, a: coverage
vec4 skyClouds(vec3 d) {
  float up = max(d.y, 0.0);
  vec2 uv = d.xz / (up + 0.11) * 0.034 + vec2(uTime * 0.0007, uTime * 0.00025);
  float base = ${look('uv')}.r;
  float det = ${look('uv * 3.1 + vec2(0.17, uTime * 0.0006)')}.g;
  float fine = ${look('uv * 9.3 + 0.41')}.a;
  float dens = base * 0.6 + det * 0.31 + fine * 0.09;
  float lo = 0.8 - uSkyParams.z * 0.44;
  float a = smoothstep(lo, lo + 0.17, dens);
  vec2 ls = uSunDir.xz * 0.016;
  float toSun = ${look('uv + ls')}.r * 0.6 + ${look('(uv + ls) * 3.1 + vec2(0.17, uTime * 0.0006)')}.g * 0.31 + 0.045;
  float lit = clamp(0.55 + (dens - toSun) * 4.5, 0.0, 1.0);
  float core = smoothstep(lo + 0.1, lo + 0.42, dens);
  float sd = max(dot(d, uSunDir), 0.0);
  vec3 bright = uSunGlow * 0.55 + uSunColor * 0.2 + uAmbSky * 0.95;
  vec3 dark = uAmbSky * 0.5 + uFogColor * 0.28;
  vec3 c = mix(dark, bright, lit * (1.0 - core * 0.45));
  c += uSunGlow * (pow(sd, 7.0) * (1.0 - core) * 0.5);
  a *= smoothstep(0.0, 0.14, d.y);
  c = mix(uFogColor, c, smoothstep(0.0, 0.22, d.y) * 0.75 + 0.25);
  return vec4(c, a * 0.93);
}
`;

  const S = {};

  // ---------------------------------------------------------------- terrain
  S.terrainVS = VS_HEAD + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
uniform mat4 uViewProj;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vColor;
void main() {
  vWorld = aPos;
  vNormal = aNormal;
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;
  S.terrainFS = FS_HEAD + LIT + `
uniform sampler2DArray uMat;
uniform sampler2D uCtl;          // r: bare earth, g: paving, b: baked lamp light, a: occlusion
uniform vec4 uCtlParams;         // world xz -> control map uv: x scale, y offset
uniform vec3 uWaterDeep;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;                  // ground-cover tint of the biome
out vec4 fragColor;
void main() {
  vec3 ng = normalize(vNormal);
  vec2 xz = vWorld.xz;
  float h = vWorld.y;
  float dist = length(vWorld - uCamPos);
  vec4 ctl = texture(uCtl, xz * uCtlParams.x + uCtlParams.y);
  vec4 nzA = texture(uNoise, xz * 0.0043);
  vec4 nzB = texture(uNoise, xz * 0.041 + 0.37);
  float brk = nzB.g - 0.5;
  float slope = 1.0 - ng.y;
  vec4 tG = texture(uMat, vec3(xz * 0.3125, ${L('grass')}));
  vec4 tG2 = texture(uMat, vec3(xz * 0.0531 + 0.31, ${L('grass')}));
  vec4 tD = texture(uMat, vec3(xz * 0.3846, ${L('dirt')}));
  vec4 tS = texture(uMat, vec3(xz * 0.4167, ${L('sand')}));
  // paving: one lookup, the layer picked per pixel (cobbles where the control map is near 1, concrete slabs below)
  float cob = step(0.88, ctl.g + (nzB.g - 0.5) * 0.06);
  vec4 tC = texture(uMat, vec3(xz * 0.4167, mix(${L('concrete')}, ${L('cobble')}, cob)));
  vec3 bw = ng * ng;
  bw *= bw;
  bw /= (bw.x + bw.y + bw.z);
  vec4 tRy = texture(uMat, vec3(xz * 0.2, ${L('rock')}));
  vec4 tRx = texture(uMat, vec3(vWorld.zy * 0.2, ${L('rock')}));
  vec4 tRz = texture(uMat, vec3(vWorld.xy * 0.2, ${L('rock')}));
  vec4 tR = tRy * bw.y + tRx * bw.x + tRz * bw.z;

  // ---- how much of each ground material shows here
  float wRock = smoothstep(0.1, 0.22, slope + brk * 0.08 + (tRy.r - 0.5) * 0.06) * step(0.5, h);
  float wSand = 1.0 - smoothstep(2.2, 3.5, h + brk * 1.4 + (nzA.g - 0.5));
  float wSnow = smoothstep(70.0, 84.0, h + (nzA.r - 0.5) * 16.0) * (1.0 - smoothstep(0.16, 0.34, slope));
  float wDirt = smoothstep(0.36, 0.6, ctl.r + (tD.r - 0.5) * 0.45 + brk * 0.35 + (nzA.b - 0.45) * 0.3);
  float wPave = smoothstep(0.38, 0.66, ctl.g + (brk * 0.4 + (tC.a - 0.5) * 0.2 + (nzA.g - 0.5) * 0.35) * mix(0.55, 1.0, cob));
  float wet = (1.0 - smoothstep(0.1, 0.8, h + brk * 0.4)) * step(-0.3, h);

  float farK = smoothstep(18.0, 70.0, dist);
  float gl = mix(tG.r, tG2.r, farK * 0.75) * 2.0;
  float lush = mix(tG.a, tG2.a, 0.5);
  vec3 cGrass = vColor * mix(vec3(1.22, 1.03, 0.62), vec3(1.0), lush) * (0.45 + 0.55 * gl);
  cGrass *= mix(vec3(1.16, 1.06, 0.74), vec3(0.86, 0.98, 0.84), smoothstep(0.3, 0.7, nzA.g + brk * 0.5)) * (0.74 + 0.52 * nzA.r) * (0.88 + 0.24 * nzB.r);
  vec3 cDirt = mix(vec3(0.3, 0.29, 0.27), vec3(0.262, 0.181, 0.092), tD.a) * (tD.r * 2.0) * (0.84 + 0.32 * nzB.r);
  vec3 cRock = mix(vec3(0.216, 0.195, 0.168), vec3(0.114, 0.102, 0.093), smoothstep(0.35, 0.65, nzA.g));
  float strata = 0.5 + 0.5 * sin(h * 0.85 + nzA.r * 9.0 + nzB.g * 2.5);
  cRock = mix(vec3(0.17, 0.19, 0.1), cRock, tR.a) * (tR.r * 2.0) * (0.72 + 0.34 * strata) * (0.8 + 0.4 * nzA.b);
  vec3 cSand = mix(vec3(0.5, 0.45, 0.36), vec3(0.716, 0.597, 0.347), tS.a) * (tS.r * 2.0) * (0.9 + 0.2 * nzB.r) * mix(1.0, 0.6, wet);
  vec3 cPave = mix(vec3(0.11, 0.1, 0.09), mix(vec3(0.33, 0.325, 0.31), vec3(0.3, 0.275, 0.235), cob), tC.a) * (tC.r * 2.0) * (0.9 + 0.2 * nzA.r);
  vec3 cSnow = vec3(0.84, 0.88, 0.94) * (0.92 + 0.16 * nzB.r);
  vec3 alb = mix(cGrass, cSand, wSand);
  alb = mix(alb, cDirt, wDirt * (1.0 - wSand * 0.6));
  alb = mix(alb, cPave, wPave);
  alb = mix(alb, cRock, wRock);
  alb = mix(alb, cSnow, wSnow);
  alb = mix(alb, vec3(0.275, 0.255, 0.145) * (0.8 + 0.4 * tS.r), (1.0 - smoothstep(-5.0, -0.4, h)) * 0.8);

  // ---- detail normal (the ground is close to horizontal, so texture x/y map to world x/z; rock is triplanar)
  float dfade = 1.0 - 0.75 * smoothstep(30.0, 130.0, dist);
  vec2 nxy = (tG.gb * 2.0 - 1.0) * 0.7;
  nxy = mix(nxy, tS.gb * 2.0 - 1.0, wSand);
  nxy = mix(nxy, tD.gb * 2.0 - 1.0, wDirt);
  nxy = mix(nxy, (tC.gb * 2.0 - 1.0) * mix(0.8, 1.2, cob), wPave);
  vec3 dn = vec3(nxy.x, 0.0, nxy.y);
  vec2 rY = tRy.gb * 2.0 - 1.0;
  vec2 rX = tRx.gb * 2.0 - 1.0;
  vec2 rZ = tRz.gb * 2.0 - 1.0;
  vec3 dR = vec3(rY.x, 0.0, rY.y) * bw.y + vec3(0.0, rX.y, rX.x) * bw.x + vec3(rZ.x, rZ.y, 0.0) * bw.z;
  dn = mix(dn, dR * 1.3, wRock) * ((1.0 - wSnow * 0.7) * dfade);
  vec3 n = normalize(ng + dn);

  float spec = mix(0.05, 0.1, wRock);
  spec = mix(spec, 0.3, wSnow);
  spec = max(spec, wet * 0.45);
  float gloss = 0.25 + wet * 0.45 + wSnow * 0.2;
  vec3 col = lightSurface(alb, n, ng, vWorld, 0.0, ctl.a, spec, gloss, 1.0);
  col += alb * vec3(1.0, 0.7, 0.4) * (ctl.b * 2.4 * uFogParams.y);

  // ---- under water: moving light pattern, then the colour of the water column
  if (h < 0.25) {
    float under = 1.0 - smoothstep(-0.5, 0.25, h);
    vec2 cu = xz * 0.13;
    float c1 = textureLod(uNoise, cu + vec2(uTime * 0.021, uTime * 0.013), 0.0).b;
    float c2 = textureLod(uNoise, cu * 1.37 + vec2(0.5 - uTime * 0.017, uTime * 0.019), 0.0).b;
    float caus = pow(max(1.0 - abs(c1 - c2) * 2.4, 0.0), 7.0);
    col += alb * uSunColor * (caus * under * 0.55 * exp(h * 0.35) * max(uSunDir.y, 0.0));
  }
  if (h < 0.0) {
    float dpt = clamp(-h / 7.0, 0.0, 1.0);
    col = mix(col, uWaterDeep * (uAmbSky + uSunColor * 0.25), dpt * 0.8 + 0.1);
  }
  col = applyZone(col, vWorld);
  col = applyFog(col, vWorld);
  fragColor = vec4(finalColor(col), 1.0);
}
`;

  // ---------------------------------------------------------------- textured surfaces (buildings, props, characters)
  // Shared fragment shader: vMat = (u, v, texture layer, sky visibility), vLamp = interior lamp (xyz, radius) or
  // (-, -, -, -strength) for an even indoor glow, vColor.a = emissive (0..1 lamp that follows the night, >1.5 always on).
  S.surfFS = FS_HEAD + LIT + `
uniform sampler2DArray uMat;
uniform sampler2D uMatProps;
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
in vec4 vMat;
in vec4 vLamp;
out vec4 fragColor;
void main() {
  vec3 ng = normalize(vNormal);
  float layer = vMat.z;
  float glass = step(29.5, layer);
  float has = step(-0.5, layer) * (1.0 - glass);
  vec4 t = texture(uMat, vec3(vMat.xy, clamp(layer, 0.0, ${MATERIALS.length - 1}.0)));
  vec4 props = texelFetch(uMatProps, ivec2(int(clamp(layer, 0.0, 31.0) + 0.5), 0), 0);
  float macro = texture(uNoise, vWorld.xz * 0.043 + vWorld.y * 0.031).r;
  // tangent frame from screen-space derivatives (no per-vertex tangents needed)
  vec3 dp1 = dFdx(vWorld);
  vec3 dp2 = dFdy(vWorld);
  vec2 du1 = dFdx(vMat).xy;
  vec2 du2 = dFdy(vMat).xy;
  vec3 p2 = cross(dp2, ng);
  vec3 p1 = cross(ng, dp1);
  vec3 tT = p2 * du1.x + p1 * du2.x;
  vec3 tB = p2 * du1.y + p1 * du2.y;
  float inv = inversesqrt(max(max(dot(tT, tT), dot(tB, tB)), 0.00000000000001));
  vec2 nxy = (t.gb * 2.0 - 1.0) * has;
  vec3 n = normalize(ng + (tT * nxy.x + tB * nxy.y) * inv);

  float lum = mix(1.0, t.r * 2.0, has);
  float keep = mix(1.0, t.a, has);
  vec3 base = vColor.rgb;
  vec3 alb = mix(vec3(0.36, 0.345, 0.32), base, keep) * lum * (0.86 + 0.28 * macro);
  vec3 col = lightSurface(alb, n, ng, vWorld, 0.0, vMat.w, props.r, props.g, 0.0);
  // interior lamp (lit rooms at night, a dim glow by day)
  float lampOn = max(uFogParams.y, 0.14);
  if (vLamp.w > 0.0) {
    vec3 d = vLamp.xyz - vWorld;
    float r2 = dot(d, d);
    float att = max(1.0 - r2 / (vLamp.w * vLamp.w), 0.0);
    float nl = max(dot(n, d * inversesqrt(max(r2, 0.0001))), 0.0);
    col += alb * vec3(1.0, 0.72, 0.42) * (att * att * (nl * 0.75 + 0.25) * 1.25 * lampOn);
  } else {
    col += alb * vec3(1.0, 0.72, 0.42) * (-vLamp.w * lampOn);
  }
  float em = vColor.a > 1.49 ? (vColor.a - 1.5) * 2.0 : vColor.a * uFogParams.y;
  col += base * (em * 3.2);
  float alpha = 1.0;
  if (glass > 0.5) {
    vec3 v = normalize(uCamPos - vWorld);
    float fr = 0.06 + 0.94 * pow(clamp(1.0 - abs(dot(ng, v)), 0.0, 1.0), 5.0);
    vec3 r = reflect(-v, ng);
    vec3 refl = mix(uAmbGround * 0.8, uAmbSky * 1.5 + uFogColor * 0.4, clamp(r.y * 0.5 + 0.5, 0.0, 1.0));
    float sp = pow(max(dot(r, uSunDir), 0.0), 500.0) * 24.0;
    col = base * 0.05 * (uAmbSky + uSunColor * 0.2) + refl * fr + uSunColor * sp;
    alpha = clamp(0.2 + fr * 0.9 + sp, 0.0, 1.0);
  }
  col = applyZone(col, vWorld);
  col = applyFog(col, vWorld);
  fragColor = vec4(finalColor(col), alpha);
}
`;
  S.staticVS = VS_HEAD + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec4 aMat;
layout(location = 4) in vec4 aLamp;
uniform mat4 uViewProj;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
out vec4 vMat;
out vec4 vLamp;
void main() {
  vWorld = aPos;
  vNormal = aNormal;
  vColor = aColor;
  vMat = aMat;
  vLamp = aLamp;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

  // ---------------------------------------------------------------- instanced models (weapons, loot, props, vehicles)
  const MODEL_ATTR = `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec4 aMat;       // uv, layer, w: 1 = tinted by the instance colour
layout(location = 4) in vec4 iM0;
layout(location = 5) in vec4 iM1;
layout(location = 6) in vec4 iM2;
layout(location = 7) in vec4 iM3;
layout(location = 8) in vec4 iColor;     // rgb: tint, a: emissive scale
layout(location = 9) in vec4 iFx;        // x: sky visibility, y: indoor lamp glow, z: flash, w: unused
uniform mat4 uViewProj;
`;
  S.modelVS = VS_HEAD + MODEL_ATTR + `
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
out vec4 vMat;
out vec4 vLamp;
void main() {
  mat4 m = mat4(iM0, iM1, iM2, iM3);
  vec4 w = m * vec4(aPos, 1.0);
  vec3 s2 = vec3(dot(iM0.xyz, iM0.xyz), dot(iM1.xyz, iM1.xyz), dot(iM2.xyz, iM2.xyz));
  vWorld = w.xyz;
  vNormal = mat3(m) * (aNormal / max(s2, vec3(0.000001)));
  vec3 c = mix(aColor.rgb, aColor.rgb * iColor.rgb, aMat.w) + vec3(iFx.z);
  float em = aColor.a > 1.49 ? 1.5 + (aColor.a - 1.5) * iColor.a : aColor.a;
  vColor = vec4(c, em);
  vMat = vec4(aMat.xyz, iFx.x);
  vLamp = vec4(0.0, 0.0, 0.0, -iFx.y);
  gl_Position = uViewProj * w;
}
`;
  S.modelShadowVS = VS_HEAD + MODEL_ATTR + `
void main() {
  mat4 m = mat4(iM0, iM1, iM2, iM3);
  gl_Position = uViewProj * (m * vec4(aPos, 1.0));
}
`;

  // ---------------------------------------------------------------- skinned characters
  const SKIN_ATTR = `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec4 aMat;       // uv, layer, w: baked occlusion
layout(location = 4) in vec4 aBone;      // x: bone A, y: bone B, z: weight of A, w: colour zone
layout(location = 5) in vec4 iA;         // x: row in the bone texture, y: hit flash, z: sky visibility, w: indoor lamp glow
layout(location = 6) in vec4 iB;         // rgb: jacket colour
layout(location = 7) in vec4 iC;         // rgb: trouser colour
layout(location = 8) in vec4 iD;         // rgb: skin tone
uniform mat4 uViewProj;
uniform sampler2D uBones;                // one row per character, three texels per bone (rows of its 3x4 matrix)
mat4 boneMat(float b) {
  int x = int(b + 0.5) * 3;
  int y = int(iA.x + 0.5);
  vec4 r0 = texelFetch(uBones, ivec2(x, y), 0);
  vec4 r1 = texelFetch(uBones, ivec2(x + 1, y), 0);
  vec4 r2 = texelFetch(uBones, ivec2(x + 2, y), 0);
  return mat4(vec4(r0.x, r1.x, r2.x, 0.0), vec4(r0.y, r1.y, r2.y, 0.0), vec4(r0.z, r1.z, r2.z, 0.0), vec4(r0.w, r1.w, r2.w, 1.0));
}
`;
  S.skinVS = VS_HEAD + SKIN_ATTR + `
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
out vec4 vMat;
out vec4 vLamp;
void main() {
  mat4 ma = boneMat(aBone.x);
  mat4 mb = boneMat(aBone.y);
  vec4 p = vec4(aPos, 1.0);
  vec4 w = mix(mb * p, ma * p, aBone.z);
  vec3 n = mix(mat3(mb) * aNormal, mat3(ma) * aNormal, aBone.z);
  float z = aBone.w;
  vec3 c = aColor.rgb;
  if (z > 0.5) {
    vec3 zc = z < 1.5 ? iB.rgb : (z < 2.5 ? iB.rgb * 0.5 : (z < 3.5 ? iC.rgb : (z < 4.5 ? mix(iB.rgb, vec3(1.0), 0.3) : iD.rgb)));
    c *= zc;
  }
  vWorld = w.xyz;
  vNormal = n;
  vColor = vec4(c + vec3(iA.y), aColor.a + iA.y * 0.0);
  vMat = vec4(aMat.xyz, aMat.w * iA.z);
  vLamp = vec4(0.0, 0.0, 0.0, -iA.w);
  gl_Position = uViewProj * vec4(w.xyz, 1.0);
}
`;
  S.skinShadowVS = VS_HEAD + SKIN_ATTR + `
void main() {
  vec4 p = vec4(aPos, 1.0);
  vec4 w = mix(boneMat(aBone.y) * p, boneMat(aBone.x) * p, aBone.z);
  gl_Position = uViewProj * vec4(w.xyz, 1.0);
}
`;

  // ---------------------------------------------------------------- instanced nature (trees, shrubs, rocks)
  const NATURE_ATTR = `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor;     // a: foliage mask (wind flutter + seasonal tint)
layout(location = 3) in vec4 aMat;       // uv, layer, w: baked occlusion
layout(location = 4) in vec4 iPosScale;
layout(location = 5) in vec4 iParams;    // x: yaw, y: tint, z: phase, w: height scale
uniform mat4 uViewProj;
uniform float uTime;
uniform float uWind;
vec3 natureWorld() {
  float c = cos(iParams.x);
  float s = sin(iParams.x);
  vec3 p = aPos * iPosScale.w;
  p.y *= iParams.w;
  p.xz = vec2(p.x * c + p.z * s, -p.x * s + p.z * c);
  float gust = uWind * (0.62 + 0.38 * sin(uTime * 0.6 + iPosScale.x * 0.045 + iPosScale.z * 0.061));
  float sway = aPos.y * aPos.y * 0.0026 * gust;
  float osc = sin(uTime * 1.15 + iParams.z) * 0.6 + 0.4;
  p.x += 0.8 * osc * sway;
  p.z += (0.6 * osc + 0.35 * cos(uTime * 0.83 + iParams.z * 1.7)) * sway;
  float fl = aColor.a * gust * 0.04;
  p.x += sin(uTime * 2.7 + aPos.x * 2.3 + aPos.y * 1.1 + iParams.z) * fl;
  p.y += sin(uTime * 3.1 + aPos.z * 1.9 + iParams.z * 0.7) * fl * 0.6;
  p.z += cos(uTime * 2.3 + aPos.y * 2.1 + aPos.x * 0.9 + iParams.z) * fl;
  return p + iPosScale.xyz;
}
`;
  S.natureVS = VS_HEAD + NATURE_ATTR + `
uniform vec3 uTintA;
uniform vec3 uTintB;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
out vec4 vMat;
void main() {
  vec3 w = natureWorld();
  float c = cos(iParams.x);
  float s = sin(iParams.x);
  vWorld = w;
  vNormal = vec3(aNormal.x * c + aNormal.z * s, aNormal.y, -aNormal.x * s + aNormal.z * c);
  vec3 tint = mix(uTintA, uTintB, iParams.y);
  vColor = vec4(mix(aColor.rgb, aColor.rgb * tint, aColor.a), aColor.a);
  // bark and rock keep their texel density when the plant is scaled; foliage cards always span the whole texture
  vMat = vec4(aMat.xy * mix(iPosScale.w, 1.0, aColor.a), aMat.z, aMat.w);
  gl_Position = uViewProj * vec4(w, 1.0);
}
`;
  S.natureFS = FS_HEAD + LIT + `
uniform sampler2DArray uMat;
uniform sampler2D uMatProps;
uniform vec4 uAlpha;          // x: cutoff, y: 1 = alpha to coverage, z: translucency, w: unused
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
in vec4 vMat;
out vec4 fragColor;
void main() {
  float layer = max(vMat.z, 0.0);
  vec4 t = texture(uMat, vec3(vMat.xy, layer));
  vec4 props = texelFetch(uMatProps, ivec2(int(layer + 0.5), 0), 0);
  float leaf = props.b;
  float dist = length(vWorld - uCamPos);
  vec3 ng = normalize(vNormal);
  vec3 dp1 = dFdx(vWorld);
  vec3 dp2 = dFdy(vWorld);
  vec2 du1 = dFdx(vMat).xy;
  vec2 du2 = dFdy(vMat).xy;
  float alpha = 1.0;
  vec3 alb;
  vec3 n = ng;
  float wrap = 0.0;
  // foliage coverage from the texture: boosted with distance so thin leaves do not melt away in the mips, and thinned
  // out right in front of the lens so a branch never fills the screen (edge width taken here, outside any branch)
  float a = t.a * (1.0 + 0.9 * smoothstep(20.0, 130.0, dist)) * smoothstep(0.6, 2.2, dist);
  // a card seen edge-on would show up as a thin streak: let it thin out instead
  vec3 gn = cross(dp1, dp2);
  a *= smoothstep(0.03, 0.2, abs(dot(gn, vWorld - uCamPos)) / max(length(gn) * dist, 0.0000001));
  float aw = max(fwidth(a), 0.0001);
  if (leaf > 0.5) {
    if (uAlpha.y > 0.5) { alpha = clamp((a - uAlpha.x) / aw + 0.5, 0.0, 1.0); if (alpha < 0.04) discard; }
    else if (a < uAlpha.x) discard;
    float hue = t.g - 0.5;
    alb = vColor.rgb * vec3(1.0 + hue * 0.7, 1.0 + hue * 0.15, 1.0 - hue * 0.5) * (t.r * 2.0) * (0.5 + 0.5 * t.b) * vMat.w;
    wrap = 0.5;
  } else {
    vec3 p2 = cross(dp2, ng);
    vec3 p1 = cross(ng, dp1);
    vec3 tT = p2 * du1.x + p1 * du2.x;
    vec3 tB = p2 * du1.y + p1 * du2.y;
    float inv = inversesqrt(max(max(dot(tT, tT), dot(tB, tB)), 0.00000000000001));
    vec2 nxy = t.gb * 2.0 - 1.0;
    n = normalize(ng + (tT * nxy.x + tB * nxy.y) * inv);
    alb = mix(vec3(0.2, 0.22, 0.13), vColor.rgb, t.a) * (t.r * 2.0) * vMat.w;
    // moss gathers on the upward faces of trunks and boulders
    alb = mix(alb, vec3(0.1, 0.16, 0.05) * (0.6 + t.r), smoothstep(0.55, 0.9, n.y) * (1.0 - t.a * 0.6) * 0.7);
  }
  // leaves take a single shadow sample per cascade (they overlap a lot); trunks and rocks get the soft one
  float cloud = cloudShade(vWorld);
  float sh = (leaf > 0.5 ? shadowLite(vWorld) : shadowAt(vWorld, ng)) * cloud;
  vec3 col = lightSurfaceS(alb, n, vWorld, wrap, 0.55 + 0.45 * vMat.w, props.r, props.g, 0.0, sh);
  // light shining through leaves when looking toward the sun
  vec3 v = normalize(vWorld - uCamPos);
  float back = pow(max(dot(v, uSunDir), 0.0), 3.0) * leaf * uAlpha.z;
  col += alb * uSunColor * (back * 0.55 * cloud * (0.35 + 0.65 * sh));
  col = applyZone(col, vWorld);
  col = applyFog(col, vWorld);
  fragColor = vec4(finalColor(col), alpha);
}
`;
  S.natureShadowVS = VS_HEAD + NATURE_ATTR + `
out vec4 vMat;
void main() {
  vMat = aMat;
  gl_Position = uViewProj * vec4(natureWorld(), 1.0);
}
`;
  S.natureShadowFS = FS_HEAD + `
uniform sampler2DArray uMat;
uniform sampler2D uMatProps;
in vec4 vMat;
out vec4 fragColor;
void main() {
  float layer = max(vMat.z, 0.0);
  vec4 t = textureLod(uMat, vec3(vMat.xy, layer), 1.0);
  float leaf = texelFetch(uMatProps, ivec2(int(layer + 0.5), 0), 0).b;
  if (leaf > 0.5 && t.a < 0.4) discard;
  fragColor = vec4(1.0);
}
`;

  // ---------------------------------------------------------------- grass and flowers (instanced clumps of blades)
  S.grassVS = VS_HEAD + `
layout(location = 0) in vec3 aPos;        // x: across the blade, y: 0..1 up the blade, z: lean
layout(location = 1) in vec3 aNormal;     // x, z: facing of the blade, y: 1 = flower head
layout(location = 2) in vec4 aColor;      // rgb: shade of this blade (or petal colour), a: stiffness
layout(location = 4) in vec4 iPosScale;   // xyz, w: height
layout(location = 5) in vec4 iColor;      // rgb, a: yaw (0..1)
uniform mat4 uViewProj;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec4 uGrassFade;                  // x: fade start, y: fade end, z: wind, w: width boost of thinned-out distant clumps
uniform sampler2D uNoise;
out vec3 vWorld;
out vec3 vColor;
out vec3 vNormal;
void main() {
  float ph = iColor.a * 6.2831853;
  float c = cos(ph);
  float s = sin(ph);
  float gd = length(iPosScale.xyz - uCamPos);
  float fade = (1.0 - smoothstep(uGrassFade.x, uGrassFade.y, gd)) * smoothstep(0.35, 1.3, gd);
  float k = uGrassFade.w * (0.55 + iPosScale.w * 1.1);
  vec3 p = vec3(aPos.x * k, aPos.y * iPosScale.w * fade, aPos.z * k);
  p.xz = vec2(p.x * c + p.z * s, -p.x * s + p.z * c);
  // gusts roll across the field
  vec2 wuv = iPosScale.xz * 0.011 + vec2(uTime * 0.045, uTime * 0.02);
  float gust = textureLod(uNoise, wuv, 0.0).g;
  float bend = aPos.y * aPos.y * iPosScale.w * (1.0 - aColor.a * 0.6);
  float sw = (gust - 0.3) * 0.75 * uGrassFade.z;
  p.x += (sw + sin(uTime * 2.1 + ph + iPosScale.x * 0.7) * 0.07 * uGrassFade.z) * bend;
  p.z += (sw * 0.6 + cos(uTime * 1.7 + ph * 1.3 + iPosScale.z * 0.7) * 0.06 * uGrassFade.z) * bend;
  p.y -= abs(sw) * bend * 0.35;
  vec3 w = p + iPosScale.xyz;
  vWorld = w;
  // blades take the colour of the ground they grow from; flower stems keep their own green and petals use the instance colour
  float flower = aNormal.y;
  float stem = step(0.99, aColor.a);
  vec3 gc = mix(iColor.rgb * aColor.rgb, aColor.rgb, stem) * (0.55 + 0.6 * aPos.y) * mix(vec3(1.0), vec3(1.1, 1.05, 0.8), aPos.y * aPos.y * 0.5);
  vColor = mix(gc, iColor.rgb * aColor.rgb, flower);
  vec2 f = vec2(aNormal.x * c + aNormal.z * s, -aNormal.x * s + aNormal.z * c);
  vNormal = normalize(vec3(f.x * 0.45, 1.0, f.y * 0.45));
  gl_Position = uViewProj * vec4(w, 1.0);
}
`;
  S.grassFS = FS_HEAD + LIT + `
in vec3 vWorld;
in vec3 vColor;
in vec3 vNormal;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  float sh = shadowLite(vWorld) * cloudShade(vWorld);
  float ndl = clamp(dot(n, uSunDir) * 0.75 + 0.25, 0.0, 1.0);
  vec3 amb = mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5);
  vec3 v = normalize(vWorld - uCamPos);
  float back = pow(max(dot(v, uSunDir), 0.0), 4.0);
  vec3 col = vColor * (uSunColor * (ndl + back * 0.5) * sh + amb);
  col += vColor * pointLights(vWorld, n, 0.0);
  col = applyZone(col, vWorld);
  col = applyFog(col, vWorld);
  fragColor = vec4(finalColor(col), 1.0);
}
`;

  // ---------------------------------------------------------------- depth-only passes
  S.depthVS = VS_HEAD + `
layout(location = 0) in vec3 aPos;
uniform mat4 uViewProj;
void main() {
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;
  S.depthFS = FS_HEAD + `
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0);
}
`;

  // ---------------------------------------------------------------- sky
  S.screenVS = VS_HEAD + `
layout(location = 0) in vec2 aPos;
out vec2 vNdc;
void main() {
  vNdc = aPos;
  gl_Position = vec4(aPos, 1.0, 1.0);
}
`;
  S.skyFS = FS_HEAD + LIT + skyFn(uv => `texture(uNoise, ${uv})`) + `
uniform mat4 uInvViewProj;
in vec2 vNdc;
out vec4 fragColor;
vec3 aurora(vec3 d) {
  vec3 acc = vec3(0.0);
  float up = max(d.y, 0.04);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 q = d.xz / up * (0.5 + fi * 0.22);
    float warp = texture(uNoise, q * 0.045 + vec2(uTime * 0.0021, fi * 0.31)).r;
    float band = texture(uNoise, vec2(q.x * 0.07 + warp * 0.55 + fi * 0.37, q.y * 0.017 + uTime * 0.0017 + fi * 0.23)).g;
    float ribbon = smoothstep(0.5, 0.66, band) * (1.0 - smoothstep(0.7, 0.92, band));
    float rays = texture(uNoise, vec2(q.x * 1.3 + warp * 2.0, uTime * 0.011 + fi * 0.5)).a;
    vec3 c = mix(vec3(0.12, 1.0, 0.5), vec3(0.6, 0.25, 1.0), clamp(fi * 0.32 + (1.0 - rays) * 0.4, 0.0, 1.0));
    acc += c * (ribbon * (0.4 + 0.95 * rays) * (1.0 - fi * 0.2));
  }
  return acc * (smoothstep(0.02, 0.32, d.y) * 0.62);
}
void main() {
  vec4 wp = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize(wp.xyz / wp.w - uCamPos);
  vec3 col = skyBase(d);
  float sd = dot(d, uSunDir);
  float disc = smoothstep(0.99952, 0.99974, sd);
  col += uSunColor * (disc * (0.55 + 0.45 * smoothstep(0.99974, 0.99995, sd)) * 6.0 * uSkyParams.w);
  if (uSkyParams.x > 0.01) {
    vec3 sp = d * 170.0;
    vec3 cell = floor(sp);
    vec3 fr = fract(sp) - 0.5;
    float hsh = hash12(cell.xy + cell.z * 37.0);
    float star = step(0.9925, hsh) * (1.0 - smoothstep(0.05, 0.38, length(fr)));
    star *= 0.6 + 0.4 * sin(uTime * 2.0 + hsh * 100.0);
    vec3 sc = mix(vec3(1.0, 0.86, 0.72), vec3(0.75, 0.86, 1.0), fract(hsh * 251.0));
    col += sc * (star * uSkyParams.x * smoothstep(0.0, 0.25, d.y) * (1.0 + fract(hsh * 71.0) * 2.4));
  }
  if (uSkyParams.y > 0.01) col += aurora(d) * uSkyParams.y;
  vec4 cl = skyClouds(d);
  col = mix(col, cl.rgb, cl.a);
  col = mix(col, uFogColor, 1.0 - smoothstep(-0.1, 0.02, d.y));
  fragColor = vec4(finalColor(col), 1.0);
}
`;

  // ---------------------------------------------------------------- water
  S.waterVS = VS_HEAD + `
layout(location = 0) in vec3 aPos;
uniform mat4 uViewProj;
out vec3 vWorld;
void main() {
  vWorld = aPos;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;
  S.waterFS = FS_HEAD + LIT + skyFn(uv => `textureLod(uNoise, ${uv}, 1.0)`) + `
uniform sampler2DArray uMat;
uniform sampler2D uHeightTex;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform vec2 uHtParams;       // world xz -> heightmap uv: scale, offset
in vec3 vWorld;
out vec4 fragColor;
void main() {
  vec2 p = vWorld.xz;
  float t = uTime;
  float hgt = texture(uHeightTex, p * uHtParams.x + uHtParams.y).r;
  vec4 w1 = texture(uMat, vec3(p * 0.11 + vec2(t * 0.021, t * 0.013), ${L('water')}));
  vec4 w2 = texture(uMat, vec3(p * 0.29 + vec2(-t * 0.033, t * 0.027), ${L('water')}));
  vec4 w3 = texture(uMat, vec3(p * 0.027 + vec2(t * 0.006, -t * 0.004), ${L('water')}));
  float depth = -hgt;
  if (depth < -0.06) discard;
  vec3 toCam = uCamPos - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  // long swell (analytic) + two layers of ripples that drift against each other
  vec2 d1 = vec2(0.8, 0.6);
  vec2 d2 = vec2(-0.5, 0.86);
  vec2 d3 = vec2(0.3, -0.95);
  vec2 g = d1 * (cos(dot(p, d1) * 0.45 + t * 1.1) * 0.05);
  g += d2 * (cos(dot(p, d2) * 0.9 + t * 1.5) * 0.06);
  g += d3 * (cos(dot(p, d3) * 2.1 + t * 2.3) * 0.05);
  float calm = exp(-dist * 0.012);
  vec2 rip = (w1.gb * 2.0 - 1.0) * 0.6 + (w2.gb * 2.0 - 1.0) * 0.42 + (w3.gb * 2.0 - 1.0) * 0.14;
  float shore = smoothstep(0.0, 1.6, depth);
  vec2 slope = (g * calm + rip * (0.07 + 0.6 * calm)) * (0.45 + 0.55 * shore);
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  float fres = 0.02 + 0.98 * pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y) + 0.015;
  r = normalize(r);
  vec3 refl = skyBase(r);
  vec4 cl = skyClouds(r);
  refl = mix(refl, cl.rgb, cl.a);
  refl += vec3(0.05, 0.32, 0.2) * (uSkyParams.y * 0.35 * smoothstep(0.1, 0.7, r.y));
  float sh = shadowAt(vWorld, vec3(0.0, 1.0, 0.0));
  float clear = exp(-max(depth, 0.0) * 0.5);
  vec3 body = mix(uWaterDeep, uWaterShallow, clear) * (uAmbSky * 0.9 + uSunColor * (0.35 * max(uSunDir.y, 0.0) * (0.4 + 0.6 * sh)));
  vec3 col = mix(body, refl, fres);
  vec3 hv = normalize(v + uSunDir);
  float ndh = max(dot(n, hv), 0.0);
  col += uSunColor * ((pow(ndh, 380.0) * 5.0 + pow(ndh, 48.0) * 0.1) * sh * exp(-dist * 0.003));
  // foam: a ragged line at the shore and lazy bands rolling in behind it
  float fl = depth + (w1.r - 0.5) * 0.5;
  float band = 0.5 + 0.5 * sin(depth * 7.0 - t * 1.3 + w3.r * 9.0);
  float foam = (1.0 - smoothstep(0.02, 0.36, fl)) * 0.85 + (1.0 - smoothstep(0.25, 1.3, fl)) * smoothstep(0.55, 0.95, band) * smoothstep(0.35, 0.7, w2.r) * 0.55;
  foam *= exp(-dist * 0.01);
  col = mix(col, vec3(0.92) * (uAmbSky + uSunColor * (0.45 * sh)), clamp(foam, 0.0, 1.0));
  float alpha = clamp(1.0 - clear * 0.8 + fres, 0.0, 0.97);
  alpha = max(alpha, clamp(foam, 0.0, 1.0) * 0.85);
  alpha *= smoothstep(-0.06, 0.05, depth);
  col = applyZone(col, vWorld);
  col = applyFog(col, vWorld);
  fragColor = vec4(finalColor(col), alpha);
}
`;

  // ---------------------------------------------------------------- safe-zone wall
  S.zoneVS = VS_HEAD + `
layout(location = 0) in vec3 aPos;     // unit cylinder: (cos, 0..1, sin)
layout(location = 1) in vec2 aUv;      // x: angle fraction, y: 0..1
uniform mat4 uViewProj;
uniform vec4 uZoneGeo;                 // xy: centre, z: radius, w: height
uniform float uZoneBase;
out vec3 vWorld;
out vec2 vUv;
void main() {
  vec3 w = vec3(uZoneGeo.x + aPos.x * uZoneGeo.z, uZoneBase + aPos.y * uZoneGeo.w, uZoneGeo.y + aPos.z * uZoneGeo.z);
  vWorld = w;
  vUv = vec2(aUv.x * 6.2831853 * uZoneGeo.z, aPos.y * uZoneGeo.w);
  gl_Position = uViewProj * vec4(w, 1.0);
}
`;
  S.zoneFS = FS_HEAD + LIT + `
uniform vec3 uZoneColor2;
in vec3 vWorld;
in vec2 vUv;
out vec4 fragColor;
void main() {
  float y = vUv.y;
  float ang = vUv.x;
  float t = uTime;
  float streak = vnoise(vec2(ang * 0.33, y * 0.03 - t * 0.35));
  float streak2 = vnoise(vec2(ang * 1.2 + 7.0, y * 0.08 - t * 0.6));
  float curtain = pow(streak, 1.6) * 0.8 + streak2 * 0.3;
  float hfade = exp(-y * 0.017);
  float base = exp(-y * 0.22);
  vec3 c = mix(uZoneColor, uZoneColor2, clamp(y * 0.012 + streak2 * 0.3, 0.0, 1.0));
  float a = (0.16 + curtain * 0.5) * hfade + base * 0.45;
  float d = length(vWorld - uCamPos);
  a *= mix(1.0, 0.72, smoothstep(50.0, 400.0, d));
  a = clamp(a, 0.0, 0.9);
  vec3 e = c * (0.55 + curtain * 1.1 + base * 1.3) * a;
  if (uDirect > 0.5) e = pow(tonemapACES(e * uExposure), vec3(1.0 / 2.2));
  fragColor = vec4(e, a * 0.5);
}
`;

  // ---------------------------------------------------------------- particles (camera facing sprites)
  S.particleVS = VS_HEAD + `
layout(location = 0) in vec2 aCorner;
layout(location = 3) in vec4 iPosSize;
layout(location = 4) in vec4 iColor;
layout(location = 5) in vec4 iMisc;     // x: rotation, y: kind, z: additive (1) / alpha (0), w: seed
uniform mat4 uViewProj;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
out vec2 vUv;
out vec4 vColor;
out vec4 vMisc;
void main() {
  float c = cos(iMisc.x);
  float s = sin(iMisc.x);
  vec2 q = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c) * iPosSize.w;
  vec3 w = iPosSize.xyz + uCamRight * q.x + uCamUp * q.y;
  vUv = aCorner;
  vColor = iColor;
  vMisc = iMisc;
  gl_Position = uViewProj * vec4(w, 1.0);
}
`;
  S.particleFS = FS_HEAD + NOISE + `
uniform float uDirect;
uniform float uExposure;
in vec2 vUv;
in vec4 vColor;
in vec4 vMisc;
out vec4 fragColor;
void main() {
  float r = length(vUv);
  float kind = vMisc.y;
  float a = 0.0;
  if (kind < 0.5) {
    a = pow(max(1.0 - r, 0.0), 2.0);
  } else if (kind < 1.5) {
    float nz = vnoise(vUv * 2.3 + vMisc.w * 17.0);
    float nz2 = vnoise(vUv * 5.1 - vMisc.w * 9.0);
    a = (1.0 - smoothstep(0.2, 1.0, r + (nz - 0.5) * 0.55 + (nz2 - 0.5) * 0.2)) * (0.75 + 0.25 * nz2);
  } else if (kind < 2.5) {
    float core = pow(max(1.0 - r, 0.0), 3.0);
    float rays = max(0.0, 1.0 - abs(vUv.x) * 9.0) * max(0.0, 1.0 - abs(vUv.y)) + max(0.0, 1.0 - abs(vUv.y) * 9.0) * max(0.0, 1.0 - abs(vUv.x));
    a = core + rays * 0.7;
  } else if (kind < 3.5) {
    a = 1.0 - smoothstep(0.0, 0.16, abs(r - 0.82));
  } else {
    a = 1.0 - smoothstep(0.62, 0.8, r);
  }
  a *= vColor.a;
  if (a < 0.004) discard;
  vec3 col = vColor.rgb * a;
  if (uDirect > 0.5) col = pow(clamp(col * uExposure, 0.0, 1.0), vec3(1.0 / 2.2));
  fragColor = vec4(col, a * (1.0 - vMisc.z));
}
`;

  // ---------------------------------------------------------------- tracers / light beams (view-aligned ribbons)
  S.beamVS = VS_HEAD + `
layout(location = 0) in vec2 aCorner;   // x: 0..1 along, y: -1..1 across
layout(location = 3) in vec4 iA;        // xyz start, w: width
layout(location = 4) in vec4 iB;        // xyz end, w: profile power
layout(location = 5) in vec4 iColor;
uniform mat4 uViewProj;
uniform vec3 uCamPos;
out vec2 vUv;
out vec4 vColor;
out float vPow;
void main() {
  vec3 p = mix(iA.xyz, iB.xyz, aCorner.x);
  vec3 dir = normalize(iB.xyz - iA.xyz);
  vec3 side = cross(dir, p - uCamPos);
  float sl = length(side);
  side = sl > 0.0001 ? side / sl : vec3(1.0, 0.0, 0.0);
  vec3 w = p + side * (aCorner.y * iA.w);
  vUv = aCorner;
  vColor = iColor;
  vPow = iB.w;
  gl_Position = uViewProj * vec4(w, 1.0);
}
`;
  S.beamFS = FS_HEAD + `
uniform float uDirect;
uniform float uExposure;
in vec2 vUv;
in vec4 vColor;
in float vPow;
out vec4 fragColor;
void main() {
  float across = pow(max(1.0 - abs(vUv.y), 0.0), 1.6);
  float along = pow(clamp(vUv.x, 0.0, 1.0), vPow);
  float a = across * along * vColor.a;
  vec3 col = vColor.rgb * a;
  if (uDirect > 0.5) col = pow(clamp(col * uExposure, 0.0, 1.0), vec3(1.0 / 2.2));
  fragColor = vec4(col, 0.0);
}
`;

  // ---------------------------------------------------------------- post processing
  S.postVS = VS_HEAD + `
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;
  // screen-space ambient occlusion from the depth buffer: r = occlusion, g = view depth (for the edge-aware blur)
  const DEPTHFN = `
uniform sampler2D uDepth;
uniform vec4 uProj;           // x: tan(half fov x), y: tan(half fov y), z: near, w: far
float linDepth(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uProj.z * uProj.w / (uProj.w + uProj.z - z * (uProj.w - uProj.z));
}
`;
  S.ssaoFS = FS_HEAD + DEPTHFN + `
uniform vec4 uAoParams;       // x: radius in metres, y: strength, zw: depth texel size
in vec2 vUv;
out vec4 fragColor;
vec3 viewPos(vec2 uv) {
  float l = linDepth(textureLod(uDepth, uv, 0.0).r);
  return vec3((uv * 2.0 - 1.0) * uProj.xy * l, -l);
}
void main() {
  float d0 = textureLod(uDepth, vUv, 0.0).r;
  vec3 p = viewPos(vUv);
  vec2 px = uAoParams.zw;
  vec3 pr = viewPos(vUv + vec2(px.x, 0.0));
  vec3 pl = viewPos(vUv - vec2(px.x, 0.0));
  vec3 pu = viewPos(vUv + vec2(0.0, px.y));
  vec3 pd = viewPos(vUv - vec2(0.0, px.y));
  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
  vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
  vec3 n = normalize(cross(dx, dy) + vec3(0.0, 0.0, 0.0000001));
  float rot = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
  float rad = uAoParams.x / max(-p.z, 0.1);
  vec2 ruv = vec2(rad / uProj.x, rad / uProj.y) * 0.5;
  float r2max = uAoParams.x * uAoParams.x;
  float occ = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float a = fi * 2.399963 + rot;
    float r = sqrt((fi + 0.5) / 10.0);
    vec3 q = viewPos(vUv + vec2(cos(a), sin(a)) * r * ruv);
    vec3 v = q - p;
    float l2 = dot(v, v);
    float nv = dot(n, v) * inversesqrt(max(l2, 0.000001));
    occ += max(nv - 0.14, 0.0) * (1.0 - smoothstep(0.45, 1.0, l2 / r2max));
  }
  float ao = clamp(1.0 - occ * 0.1 * uAoParams.y, 0.0, 1.0);
  ao = mix(ao, 1.0, smoothstep(55.0, 110.0, -p.z));
  if (d0 >= 0.99999) ao = 1.0;
  fragColor = vec4(ao, -p.z, 0.0, 1.0);
}
`;
  // edge-aware blur + upsample of the occlusion, multiplied into the scene
  S.aoApplyFS = FS_HEAD + DEPTHFN + `
uniform sampler2D uTex;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 fragColor;
void main() {
  float dc = linDepth(textureLod(uDepth, vUv, 0.0).r);
  float sum = 0.0;
  float wsum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec4 s = textureLod(uTex, vUv + vec2(float(i), float(j)) * uTexel * 1.25, 0.0);
      float w = max(0.0, 1.0 - abs(s.g - dc) / (0.04 * dc + 0.03)) + 0.0001;
      sum += s.r * w;
      wsum += w;
    }
  }
  float ao = sum / wsum;
  fragColor = vec4(vec3(ao), 1.0);
}
`;
  S.bloomDownFS = FS_HEAD + `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  if (uThreshold > 0.0) {
    float l = max(c.r, max(c.g, c.b));
    c *= max(l - uThreshold, 0.0) / max(l, 0.0001);
    c = min(c, vec3(24.0));
  }
  fragColor = vec4(c, 1.0);
}
`;
  S.bloomUpFS = FS_HEAD + `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uGain;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-0.5, -0.5)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(0.5, -0.5)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-0.5, 0.5)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  fragColor = vec4(c * (0.25 * uGain), 1.0);
}
`;
  S.compositeFS = FS_HEAD + NOISE + `
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
uniform vec4 uFx;          // x: vignette, y: zone tint amount, z: damage flash, w: desaturate
uniform vec3 uTint;
in vec2 vUv;
out vec4 fragColor;
vec3 tonemapACES(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomStrength;
  c = tonemapACES(c * uExposure);
  c = pow(c, vec3(1.0 / 2.2));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.06 - uFx.w);
  // gentle grade: cool shadows, warm highlights
  c *= mix(vec3(0.965, 0.99, 1.035), vec3(1.03, 1.0, 0.965), smoothstep(0.05, 0.8, l));
  vec2 q = vUv - 0.5;
  float r2 = dot(q, q);
  c *= 1.0 - r2 * uFx.x;
  c = mix(c, c * uTint + uTint * 0.05, uFx.y);
  c = mix(c, vec3(0.62, 0.04, 0.03), uFx.z * smoothstep(0.1, 0.52, r2) * 0.6);
  c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(c, 1.0);
}
`;

  // program name -> [vertex source key, fragment source key] (also used by the dev shader checker)
  S.PROGRAMS = {
    terrain: ['terrainVS', 'terrainFS'], static: ['staticVS', 'surfFS'], model: ['modelVS', 'surfFS'], skin: ['skinVS', 'surfFS'],
    nature: ['natureVS', 'natureFS'], grass: ['grassVS', 'grassFS'], sky: ['screenVS', 'skyFS'], water: ['waterVS', 'waterFS'], zone: ['zoneVS', 'zoneFS'],
    particle: ['particleVS', 'particleFS'], beam: ['beamVS', 'beamFS'],
    depth: ['depthVS', 'depthFS'], modelShadow: ['modelShadowVS', 'depthFS'], skinShadow: ['skinShadowVS', 'depthFS'], natureShadow: ['natureShadowVS', 'natureShadowFS'],
    ssao: ['postVS', 'ssaoFS'], aoApply: ['postVS', 'aoApplyFS'], bloomDown: ['postVS', 'bloomDownFS'], bloomUp: ['postVS', 'bloomUpFS'], composite: ['postVS', 'compositeFS'],
  };
  // Shadow lookups are written as textureLod(sampler, uvz, 0.0): no screen-space derivatives, so a compiler can keep the
  // branches around them. Should a driver refuse that form, the renderer calls this and compiles once more with the
  // plain lookup (same picture, possibly slower).
  S.plainShadowLookups = function () {
    for (const k in S) if (typeof S[k] === 'string') S[k] = S[k].replace(/textureLod\((uShadow(?:Map|Far)), (vec3\(.*?\)), 0\.0\)/g, 'texture($1, $2)');
  };
  return S;
})();
