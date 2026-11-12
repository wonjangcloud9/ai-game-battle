// AURORA FALL — GLSL ES 3.00 shader sources
'use strict';

const SHADERS = (function () {
  const VS_HEAD = '#version 300 es\nprecision highp float;\n';
  const FS_HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2DShadow;\n';

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
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMat;
uniform vec4 uShadowParams;   // x: enabled, y: texel size, z: fade start, w: fade end
uniform vec3 uShadowCenter;
uniform vec4 uZone;           // xy: centre, z: radius, w: enabled
uniform vec3 uZoneColor;
uniform float uDirect;        // 1.0 = tone map here (no post processing)
uniform float uExposure;
${NOISE}
float shadowAt(vec3 wpos, vec3 n) {
  if (uShadowParams.x < 0.5) return 1.0;
  float fade = smoothstep(uShadowParams.z, uShadowParams.w, length(wpos.xz - uShadowCenter.xz));
  if (fade >= 1.0) return 1.0;
  vec4 sc = uShadowMat * vec4(wpos + n * 0.14, 1.0);
  vec3 c = sc.xyz * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  float ts = uShadowParams.y;
  float z = c.z - 0.0009;
  float s = texture(uShadowMap, vec3(c.xy + vec2(-0.5, -0.5) * ts, z));
  s += texture(uShadowMap, vec3(c.xy + vec2(0.5, -0.5) * ts, z));
  s += texture(uShadowMap, vec3(c.xy + vec2(-0.5, 0.5) * ts, z));
  s += texture(uShadowMap, vec3(c.xy + vec2(0.5, 0.5) * ts, z));
  return mix(s * 0.25, 1.0, fade);
}
// slow drifting cloud shadows over the whole island
float cloudShade(vec3 wpos) {
  vec2 q = wpos.xz + uSunDir.xz * (wpos.y * 0.6);
  float c = vnoise(q * 0.0042 + vec2(uTime * 0.011, uTime * 0.004)) * 0.65 + vnoise(q * 0.011 + vec2(5.0 + uTime * 0.018, 3.0)) * 0.35;
  return 1.0 - uFogParams.z * smoothstep(0.46, 0.7, c);
}
vec3 lightSurface(vec3 albedo, vec3 n, vec3 wpos, float wrap) {
  float ndl = dot(n, uSunDir);
  float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  float sh = 1.0;
  if (diff > 0.0) sh = shadowAt(wpos, n) * cloudShade(wpos);
  vec3 amb = mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5);
  return albedo * (uSunColor * (diff * sh) + amb);
}
vec3 applyFog(vec3 col, vec3 wpos) {
  vec3 v = wpos - uCamPos;
  float d = length(v);
  float f = 1.0 - exp(-pow(d * uFogParams.x, 1.35));
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

  const SKYFN = `
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSunGlow;
vec3 skyGradient(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uSkyHorizon, uSkyTop, pow(h, 0.5));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunGlow * (pow(sd, 6.0) * 0.25 + pow(sd, 48.0) * 0.55);
  return c;
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
uniform vec3 uWaterDeep;
in vec3 vWorld;
in vec3 vNormal;
in vec3 vColor;
out vec4 fragColor;
void main() {
  vec3 fn = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (fn.y < 0.0) fn = -fn;
  float flatAmt = 0.62 * (1.0 - smoothstep(140.0, 380.0, length(vWorld - uCamPos)));
  vec3 n = normalize(mix(normalize(vNormal), fn, flatAmt));
  float n1 = vnoise(vWorld.xz * 0.9);
  float n2 = vnoise(vWorld.xz * 0.17 + 17.0);
  vec3 alb = vColor * (0.9 + 0.13 * n1 + 0.12 * (n2 - 0.5));
  vec3 col = lightSurface(alb, n, vWorld, 0.0);
  if (vWorld.y < 0.0) {
    float dpt = clamp(-vWorld.y / 7.0, 0.0, 1.0);
    col = mix(col, uWaterDeep * (uAmbSky + uSunColor * 0.25), dpt * 0.8 + 0.12);
  }
  col = applyZone(col, vWorld);
  col = applyFog(col, vWorld);
  fragColor = vec4(finalColor(col), 1.0);
}
`;

  // ---------------------------------------------------------------- static meshes (buildings, props)
  S.staticVS = VS_HEAD + `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor;
uniform mat4 uViewProj;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
void main() {
  vWorld = aPos;
  vNormal = aNormal;
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;
  S.staticFS = FS_HEAD + LIT + `
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  float grain = vnoise(vWorld.xz * 1.7 + vWorld.y * 1.3);
  vec3 alb = vColor.rgb * (0.92 + 0.14 * grain);
  vec3 col = lightSurface(alb, n, vWorld, 0.0);
  float em = vColor.a > 1.5 ? 1.0 : vColor.a * uFogParams.y;
  col += vColor.rgb * (em * 3.2);
  col = applyZone(col, vWorld);
  col = applyFog(col, vWorld);
  fragColor = vec4(finalColor(col), 1.0);
}
`;

  // ---------------------------------------------------------------- instanced primitives (characters, items, ...)
  const PRIM_ATTR = `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 3) in vec4 iM0;
layout(location = 4) in vec4 iM1;
layout(location = 5) in vec4 iM2;
layout(location = 6) in vec4 iM3;
layout(location = 7) in vec4 iColor;
uniform mat4 uViewProj;
`;
  S.primVS = VS_HEAD + PRIM_ATTR + `
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
void main() {
  mat4 m = mat4(iM0, iM1, iM2, iM3);
  vec4 w = m * vec4(aPos, 1.0);
  vec3 s2 = vec3(dot(iM0.xyz, iM0.xyz), dot(iM1.xyz, iM1.xyz), dot(iM2.xyz, iM2.xyz));
  vWorld = w.xyz;
  vNormal = mat3(m) * (aNormal / max(s2, vec3(0.000001)));
  vColor = iColor;
  gl_Position = uViewProj * w;
}
`;
  S.primFS = FS_HEAD + LIT + `
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 col = lightSurface(vColor.rgb, n, vWorld, 0.15);
  vec3 v = normalize(uCamPos - vWorld);
  float rim = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 3.0);
  col += uAmbSky * vColor.rgb * rim * 0.5;
  col += vColor.rgb * (vColor.a * 2.6);
  col = applyZone(col, vWorld);
  col = applyFog(col, vWorld);
  fragColor = vec4(finalColor(col), 1.0);
}
`;
  S.primShadowVS = VS_HEAD + PRIM_ATTR + `
void main() {
  mat4 m = mat4(iM0, iM1, iM2, iM3);
  gl_Position = uViewProj * (m * vec4(aPos, 1.0));
}
`;

  // ---------------------------------------------------------------- instanced nature (trees, rocks)
  const NATURE_ATTR = `
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec4 iPosScale;
layout(location = 4) in vec4 iParams;   // x: yaw, y: tint, z: phase, w: y scale
uniform mat4 uViewProj;
uniform float uTime;
uniform float uWind;
vec3 natureWorld() {
  float c = cos(iParams.x);
  float s = sin(iParams.x);
  vec3 p = aPos * iPosScale.w;
  p.y *= iParams.w;
  p.xz = vec2(p.x * c + p.z * s, -p.x * s + p.z * c);
  float sway = aColor.a * aPos.y * aPos.y * 0.0035 * uWind;
  p.x += sin(uTime * 1.3 + iParams.z + aPos.y * 0.35) * sway;
  p.z += cos(uTime * 1.05 + iParams.z * 1.7) * sway * 0.7;
  return p + iPosScale.xyz;
}
`;
  S.natureVS = VS_HEAD + NATURE_ATTR + `
uniform vec3 uTintA;
uniform vec3 uTintB;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
void main() {
  vec3 w = natureWorld();
  float c = cos(iParams.x);
  float s = sin(iParams.x);
  vWorld = w;
  vNormal = vec3(aNormal.x * c + aNormal.z * s, aNormal.y, -aNormal.x * s + aNormal.z * c);
  vec3 tint = mix(uTintA, uTintB, iParams.y);
  vColor = vec4(mix(aColor.rgb, aColor.rgb * tint, aColor.a), aColor.a);
  gl_Position = uViewProj * vec4(w, 1.0);
}
`;
  S.natureFS = FS_HEAD + LIT + `
uniform float uWrap;
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 col = lightSurface(vColor.rgb, n, vWorld, vColor.a * uWrap);
  vec3 v = normalize(vWorld - uCamPos);
  col += vColor.rgb * uSunColor * (vColor.a * uWrap * pow(max(dot(v, uSunDir), 0.0), 4.0) * 0.3);
  col = applyZone(col, vWorld);
  col = applyFog(col, vWorld);
  fragColor = vec4(finalColor(col), 1.0);
}
`;
  S.natureShadowVS = VS_HEAD + NATURE_ATTR + `
void main() {
  gl_Position = uViewProj * vec4(natureWorld(), 1.0);
}
`;

  // ---------------------------------------------------------------- grass tufts
  S.grassVS = VS_HEAD + `
layout(location = 0) in vec3 aPos;        // y in 0..1 is the blade height fraction
layout(location = 3) in vec4 iPosScale;
layout(location = 4) in vec4 iColor;      // rgb + phase
uniform mat4 uViewProj;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec2 uGrassFade;                  // start, end
out vec3 vWorld;
out vec3 vColor;
void main() {
  float ph = iColor.a * 6.2831;
  float c = cos(ph);
  float s = sin(ph);
  float gd = length(iPosScale.xyz - uCamPos);
  float fade = (1.0 - smoothstep(uGrassFade.x, uGrassFade.y, gd)) * smoothstep(0.5, 1.7, gd);
  vec3 p = aPos * iPosScale.w * vec3(1.0, fade, 1.0);
  p.xz = vec2(p.x * c + p.z * s, -p.x * s + p.z * c);
  float bend = aPos.y * aPos.y;
  p.x += sin(uTime * 1.7 + ph + iPosScale.x * 0.3) * 0.16 * bend;
  p.z += cos(uTime * 1.3 + ph * 1.3 + iPosScale.z * 0.3) * 0.12 * bend;
  vec3 w = p + iPosScale.xyz;
  vWorld = w;
  vColor = iColor.rgb * (0.72 + 0.6 * aPos.y);
  gl_Position = uViewProj * vec4(w, 1.0);
}
`;
  S.grassFS = FS_HEAD + LIT + `
in vec3 vWorld;
in vec3 vColor;
out vec4 fragColor;
void main() {
  vec3 col = lightSurface(vColor, vec3(0.0, 1.0, 0.0), vWorld, 0.0);
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
  S.skyFS = FS_HEAD + LIT + SKYFN + `
uniform mat4 uInvViewProj;
uniform vec4 uSkyParams;      // x: stars, y: aurora, z: clouds, w: sun disc
in vec2 vNdc;
out vec4 fragColor;
vec3 aurora(vec3 d) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 q = d.xz / max(d.y, 0.06) * ((1.0 + fi * 0.28) * 0.42);
    float warp = vnoise(q * 0.6 + vec2(uTime * 0.03, fi * 5.0));
    float band = vnoise(vec2(q.x * 0.9 + warp * 2.2 + fi * 3.3, q.y * 0.22 + uTime * 0.015 + fi * 1.7));
    band = smoothstep(0.54, 0.84, band);
    float rays = 0.55 + 0.45 * vnoise(vec2(q.x * 9.0 + warp * 4.0, uTime * 0.25 + fi));
    vec3 c = mix(vec3(0.1, 1.0, 0.55), vec3(0.55, 0.3, 1.0), clamp(fi * 0.3 + (1.0 - band) * 0.4, 0.0, 1.0));
    acc += c * (band * rays * (1.0 - fi * 0.15));
  }
  return acc * (smoothstep(0.03, 0.35, d.y) * 0.55);
}
void main() {
  vec4 wp = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize(wp.xyz / wp.w - uCamPos);
  vec3 col = skyGradient(d);
  float sd = dot(d, uSunDir);
  col += uSunColor * (smoothstep(0.9993, 0.9997, sd) * 5.0 * uSkyParams.w);
  if (d.y > 0.0) {
    if (uSkyParams.x > 0.01) {
      vec3 sp = d * 170.0;
      vec3 cell = floor(sp);
      vec3 fr = fract(sp) - 0.5;
      float hsh = hash12(cell.xy + cell.z * 37.0);
      float star = step(0.9925, hsh) * (1.0 - smoothstep(0.05, 0.38, length(fr)));
      star *= 0.6 + 0.4 * sin(uTime * 2.0 + hsh * 100.0);
      col += vec3(0.9, 0.95, 1.0) * (star * uSkyParams.x * smoothstep(0.0, 0.25, d.y) * 1.8);
    }
    if (uSkyParams.y > 0.01) col += aurora(d) * uSkyParams.y;
    vec2 cuv = d.xz / (d.y + 0.12) * 0.55 + vec2(uTime * 0.006, uTime * 0.002);
    float cn = vnoise(cuv * 1.3) * 0.55 + vnoise(cuv * 2.9 + 3.7) * 0.3 + vnoise(cuv * 6.3 + 9.1) * 0.15;
    float cl = smoothstep(1.0 - uSkyParams.z * 0.62, 1.06 - uSkyParams.z * 0.3, cn) * smoothstep(0.0, 0.18, d.y);
    float lit = pow(max(sd, 0.0), 3.0) * 0.6 + 0.25 * max(uSunDir.y, 0.0);
    vec3 cloudCol = mix(uAmbSky * 1.25 + uFogColor * 0.3, uSunGlow * 1.2 + uAmbSky, lit);
    col = mix(col, cloudCol, cl * 0.85);
  }
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
  S.waterFS = FS_HEAD + LIT + SKYFN + `
uniform sampler2D uHeightTex;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform vec2 uHtParams;       // world xz -> heightmap uv: scale, offset
in vec3 vWorld;
out vec4 fragColor;
void main() {
  float h = texture(uHeightTex, vWorld.xz * uHtParams.x + uHtParams.y).r;
  float depth = -h;
  if (depth < -0.05) discard;
  vec3 toCam = uCamPos - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  vec2 p = vWorld.xz;
  float t = uTime;
  vec2 d1 = vec2(0.8, 0.6);
  vec2 d2 = vec2(-0.5, 0.86);
  vec2 d3 = vec2(0.3, -0.95);
  vec2 d4 = vec2(-0.9, -0.3);
  vec2 g = d1 * (cos(dot(p, d1) * 0.45 + t * 1.1) * 0.17);
  g += d2 * (cos(dot(p, d2) * 0.9 + t * 1.5) * 0.18);
  g += d3 * (cos(dot(p, d3) * 2.1 + t * 2.3) * 0.15);
  g += d4 * (cos(dot(p, d4) * 3.7 + t * 3.1) * 0.14);
  g *= exp(-dist * 0.011);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  float fres = 0.03 + 0.97 * pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 refl = skyGradient(r);
  float shallow = 1.0 - smoothstep(0.0, 4.5, depth);
  vec3 body = mix(uWaterDeep, uWaterShallow, shallow) * (uAmbSky * 0.9 + uSunColor * (0.35 * max(uSunDir.y, 0.0)));
  vec3 col = mix(body, refl, fres);
  vec3 hv = normalize(v + uSunDir);
  col += uSunColor * (pow(max(dot(n, hv), 0.0), 220.0) * 1.5 * exp(-dist * 0.004));
  float foamN = vnoise(p * 1.4 + vec2(t * 0.3, -t * 0.2));
  float foam = 1.0 - smoothstep(0.0, 0.5, depth + (foamN * 0.35 - sin(t * 1.2 + p.x * 0.1) * 0.08) * exp(-dist * 0.012));
  col = mix(col, vec3(0.95) * (uAmbSky + uSunColor * 0.5), foam * 0.75);
  float alpha = clamp(0.3 + depth * 0.55 + fres, 0.0, 0.96);
  alpha = max(alpha, foam * 0.8);
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
    a = 1.0 - smoothstep(0.25, 1.0, r + (nz - 0.5) * 0.5);
  } else if (kind < 2.5) {
    float core = pow(max(1.0 - r, 0.0), 3.0);
    float rays = max(0.0, 1.0 - abs(vUv.x) * 9.0) * max(0.0, 1.0 - abs(vUv.y)) + max(0.0, 1.0 - abs(vUv.y) * 9.0) * max(0.0, 1.0 - abs(vUv.x));
    a = core + rays * 0.7;
  } else if (kind < 3.5) {
    a = 1.0 - smoothstep(0.0, 0.16, abs(r - 0.82));
  } else {
    a = step(r, 0.78);
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
  c = mix(vec3(l), c, 1.1 - uFx.w);
  vec2 q = vUv - 0.5;
  float r2 = dot(q, q);
  c *= 1.0 - r2 * uFx.x;
  c = mix(c, c * uTint + uTint * 0.05, uFx.y);
  c = mix(c, vec3(0.62, 0.04, 0.03), uFx.z * smoothstep(0.1, 0.52, r2) * 0.6);
  c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(c, 1.0);
}
`;
  return S;
})();
