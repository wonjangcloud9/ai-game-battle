// AURORA FALL — time of day: afternoon -> golden hour -> sunset -> aurora night (no DOM dependencies)
'use strict';

const Env = (function () {
  // keyframes over match progress t in [0, 1]
  const K = [
    { t: 0.0, elev: 46, az: 222, sun: [1.0, 0.96, 0.88], sunI: 2.5, ambSky: [0.5, 0.63, 0.82], ambI: 0.5, ambGround: [0.44, 0.41, 0.34], gndI: 0.36,
      skyTop: [0.09, 0.29, 0.72], skyHor: [0.55, 0.74, 0.92], fog: [0.6, 0.76, 0.9], fogSun: [1.0, 0.93, 0.78], glow: [1.0, 0.86, 0.62], fogD: 0.001,
      stars: 0, aurora: 0, clouds: 0.55, lamp: 0, exposure: 1.0, deep: [0.02, 0.17, 0.27], shallow: [0.1, 0.55, 0.54] },
    { t: 0.42, elev: 19, az: 242, sun: [1.0, 0.8, 0.55], sunI: 2.6, ambSky: [0.54, 0.57, 0.74], ambI: 0.48, ambGround: [0.46, 0.38, 0.3], gndI: 0.4,
      skyTop: [0.17, 0.32, 0.66], skyHor: [0.95, 0.74, 0.5], fog: [0.86, 0.73, 0.6], fogSun: [1.0, 0.72, 0.42], glow: [1.0, 0.62, 0.32], fogD: 0.0011,
      stars: 0, aurora: 0, clouds: 0.6, lamp: 0.15, exposure: 1.0, deep: [0.03, 0.15, 0.25], shallow: [0.16, 0.48, 0.5] },
    { t: 0.68, elev: 5, az: 256, sun: [1.0, 0.5, 0.26], sunI: 2.3, ambSky: [0.52, 0.44, 0.64], ambI: 0.48, ambGround: [0.4, 0.3, 0.3], gndI: 0.4,
      skyTop: [0.14, 0.18, 0.46], skyHor: [0.98, 0.5, 0.3], fog: [0.72, 0.5, 0.48], fogSun: [1.0, 0.52, 0.28], glow: [1.0, 0.45, 0.2], fogD: 0.0012,
      stars: 0.2, aurora: 0.2, clouds: 0.6, lamp: 0.7, exposure: 1.05, deep: [0.04, 0.1, 0.2], shallow: [0.22, 0.36, 0.44] },
    { t: 0.8, elev: 1.5, az: 262, sun: [1.0, 0.42, 0.24], sunI: 0.0, ambSky: [0.3, 0.36, 0.6], ambI: 0.58, ambGround: [0.2, 0.22, 0.3], gndI: 0.42,
      skyTop: [0.06, 0.09, 0.28], skyHor: [0.5, 0.3, 0.4], fog: [0.3, 0.26, 0.4], fogSun: [0.6, 0.36, 0.36], glow: [0.6, 0.3, 0.25], fogD: 0.0013,
      stars: 0.7, aurora: 0.6, clouds: 0.5, lamp: 1, exposure: 1.15, deep: [0.03, 0.08, 0.17], shallow: [0.12, 0.3, 0.38] },
    { t: 1.0, elev: 1.5, az: 262, sun: [0.55, 0.78, 1.0], sunI: 0.0, ambSky: [0.2, 0.42, 0.58], ambI: 0.6, ambGround: [0.12, 0.2, 0.26], gndI: 0.4,
      skyTop: [0.015, 0.035, 0.11], skyHor: [0.05, 0.17, 0.25], fog: [0.045, 0.12, 0.18], fogSun: [0.1, 0.3, 0.34], glow: [0.1, 0.3, 0.3], fogD: 0.0013,
      stars: 1, aurora: 1, clouds: 0.38, lamp: 1, exposure: 1.2, deep: [0.02, 0.09, 0.15], shallow: [0.08, 0.34, 0.36] },
  ];
  const MOON = { elev: 48, az: 140, col: [0.55, 0.8, 1.0], I: 0.85 };
  const V3 = ['sun', 'ambSky', 'ambGround', 'skyTop', 'skyHor', 'fog', 'fogSun', 'glow', 'deep', 'shallow'];
  const SC = ['elev', 'az', 'sunI', 'ambI', 'gndI', 'fogD', 'stars', 'aurora', 'clouds', 'lamp', 'exposure'];
  const tmp = {};
  for (const k of V3) tmp[k] = [0, 0, 0];
  const dirFrom = (elevDeg, azDeg, out) => {
    const e = elevDeg * DEG, a = azDeg * DEG;
    // azimuth: 0 = north (-z), 90 = east (+x)
    out[0] = Math.sin(a) * Math.cos(e); out[1] = Math.sin(e); out[2] = -Math.cos(a) * Math.cos(e);
    return out;
  };
  return {
    make() {
      return {
        sunDir: [0, 1, 0], sunColor: [1, 1, 1], ambSky: [0, 0, 0], ambGround: [0, 0, 0], fogColor: [0, 0, 0], fogSun: [0, 0, 0],
        skyTop: [0, 0, 0], skyHorizon: [0, 0, 0], sunGlow: [0, 0, 0], waterDeep: [0, 0, 0], waterShallow: [0, 0, 0],
        zoneColor: [0.16, 1.0, 0.72], zoneColor2: [0.6, 0.32, 1.0], zoneTint: [0.55, 0.98, 0.9],
        fogDensity: 0.0016, stars: 0, aurora: 0, clouds: 0.5, lamp: 0, exposure: 1, sunDisc: 1, shadowStrength: 1, wind: 1,
        bloomThreshold: 1.05, bloomStrength: 0.42, night: 0, cloudShadow: 0.5,
      };
    },
    // t: 0 (afternoon) .. 1 (aurora night)
    compute(t, out) {
      t = clamp01(t);
      let i = 0;
      while (i < K.length - 2 && t > K[i + 1].t) i++;
      const a = K[i], b = K[i + 1], f = clamp01((t - a.t) / (b.t - a.t));
      for (const k of V3) for (let q = 0; q < 3; q++) tmp[k][q] = a[k][q] + (b[k][q] - a[k][q]) * f;
      for (const k of SC) tmp[k] = a[k] + (b[k] - a[k]) * f;
      // directional light: sun until it sets, then the moon fades in
      const moonF = smoothstep(0.8, 0.9, t);
      if (t < 0.8) {
        dirFrom(Math.max(tmp.elev, 1.5), tmp.az, out.sunDir);
        for (let q = 0; q < 3; q++) out.sunColor[q] = tmp.sun[q] * tmp.sunI;
        out.sunDisc = 1;
        out.shadowStrength = clamp01(tmp.sunI / 1.2);
      } else {
        dirFrom(MOON.elev, MOON.az, out.sunDir);
        for (let q = 0; q < 3; q++) out.sunColor[q] = MOON.col[q] * MOON.I * moonF;
        out.sunDisc = 0.45 * moonF;
        out.shadowStrength = moonF;
      }
      for (let q = 0; q < 3; q++) {
        out.ambSky[q] = tmp.ambSky[q] * tmp.ambI; out.ambGround[q] = tmp.ambGround[q] * tmp.gndI;
        out.fogColor[q] = tmp.fog[q]; out.fogSun[q] = tmp.fogSun[q]; out.skyTop[q] = tmp.skyTop[q]; out.skyHorizon[q] = tmp.skyHor[q];
        out.sunGlow[q] = tmp.glow[q]; out.waterDeep[q] = tmp.deep[q]; out.waterShallow[q] = tmp.shallow[q];
      }
      out.fogDensity = tmp.fogD; out.stars = tmp.stars; out.aurora = tmp.aurora; out.clouds = tmp.clouds; out.lamp = tmp.lamp; out.exposure = tmp.exposure;
      out.night = smoothstep(0.6, 0.95, t);
      out.cloudShadow = 0.55 * tmp.clouds / 0.6 * (1 - out.night * 0.5);
      return out;
    },
  };
})();
