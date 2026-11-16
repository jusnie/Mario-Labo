/**
 * sky.js — the sky dome, as a model rather than a two-colour lerp.
 *
 * The old dome was `mix(horizon, zenith, pow(up, 0.55))` plus a soft dot for
 * the sun: a flat wash with no haze band, no warm scattering toward the sun, no
 * twilight, no disc and no moon. This is a cheap analytic atmosphere instead:
 *
 *  - an exponential vertical gradient, so the deep blue sits high overhead;
 *  - a Mie haze band hugging the horizon, of the sort that makes everything
 *    past 200 m in the tropics go milky;
 *  - Rayleigh-wise, a warm lobe around the sun's azimuth, strongest low down;
 *  - a twilight wedge on the sun's side and a violet belt on the other,
 *    appearing only around sunrise and sunset, plus the sun's own glow as it
 *    sits at the horizon;
 *  - a real sun disc (about 1.6° across, deliberately a touch generous) with a
 *    tight bloom, and a full moon disc at night;
 *  - ACES tonemapping and sRGB encoding applied here, because a raw
 *    ShaderMaterial gets neither from the renderer — the old sky was not
 *    tonemapped at all, which is why it never matched the ground.
 *
 * `sampleSky()` is a JavaScript mirror of the fragment shader, so the offscreen
 * previewer (`tools/preview.mjs`) and `tools/sky-preview.mjs` show the same sky
 * the GPU does. Keep the two in step: the GLSL is the source of truth, the JS
 * exists so this can be looked at without a browser.
 */
import * as THREE from "three";

/* --------------------------------------------------------------- geometry */

/** Sun direction for a given hour. Same path the directional light follows. */
export function sunDirAt(hours, out = new THREE.Vector3()) {
  const a = ((hours - 6) / 12) * Math.PI;
  return out.set(Math.cos(a) * 260, Math.sin(a) * 300, -120).normalize();
}

/* ---------------------------------------------------------------- palette */

const C = (hex) => new THREE.Color(hex);

// Tropical, humid, sea-level. The horizon is pale and slightly blue, never the
// warm grey it used to be — that grey was what made the sky look washed out.
const DAY_TOP = C(0x1d55a4);
const DAY_HORIZON = C(0xc4daea);
const DAY_HAZE = C(0xdae7f0);
const NIGHT_TOP = C(0x03060d);
const NIGHT_HORIZON = C(0x0b1320);
const NIGHT_HAZE = C(0x0d1724);
const DUSK_TOP = C(0x2d4c86);
const DUSK_HORIZON = C(0xe89a5c);
const DUSK_HAZE = C(0xf0b27a);
const SUN_HIGH = C(0xfff6e2);
const SUN_LOW = C(0xff7f36);
const TWILIGHT = C(0xff9b52);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** out = lerp(a, b, t), safe when out is a itself. */
const mixInto = (out, a, b, t) => out.copy(a).lerp(b, t);

/**
 * Everything the shader needs for a given hour, as plain numbers and colours.
 * `target` is a uniforms object (or anything with the same keys).
 */
export function updatePalette(target, hours) {
  const sunDir = target.sunDir.value;
  sunDirAt(hours, sunDir);
  target.moonDir.value.copy(sunDir).multiplyScalar(-1);

  const elev = sunDir.y;
  const day = smoothstep(-0.12, 0.16, elev);
  const night = 1 - day;
  // golden hour: a narrow window around the sun touching the horizon
  // the glow only exists while the sun is close to the horizon: twelve degrees
  // below it there is no warm band left, just deep blue
  const gold =
    Math.exp(-Math.pow((elev - 0.06) / 0.22, 2)) * smoothstep(-0.22, -0.02, elev);
  const lit = clamp01(elev * 3.2);

  mixInto(target.topColor.value, NIGHT_TOP, DAY_TOP, day);
  mixInto(target.topColor.value, target.topColor.value, DUSK_TOP, gold * 0.18);
  mixInto(target.horizonColor.value, NIGHT_HORIZON, DAY_HORIZON, day);
  mixInto(target.hazeColor.value, NIGHT_HAZE, DAY_HAZE, day);
  mixInto(target.hazeColor.value, target.hazeColor.value, DUSK_HAZE, gold * 0.55);
  mixInto(target.sunColor.value, SUN_LOW, SUN_HIGH, lit);

  target.warm.value = gold;
  target.twilight.value = gold * (0.35 + 0.65 * night);
  target.hazeAmount.value = 0.45 + 0.35 * gold + 0.1 * day;
  target.sunGlow.value = clamp01(day * 1.15);
  target.sunDisc.value = day * 28;
  target.moonGlow.value = Math.pow(night, 1.6);

  // colours used by the rest of the world (fog, lights, cloud tint)
  return {
    day,
    night,
    gold,
    elev,
    top: target.topColor.value,
    horizon: target.horizonColor.value,
    haze: target.hazeColor.value,
    sun: target.sunColor.value,
    twilightGlow: target.twilight.value,
  };
}

export function createSkyUniforms() {
  return {
    topColor: { value: C(DAY_TOP) },
    horizonColor: { value: C(DAY_HORIZON) },
    hazeColor: { value: C(DAY_HAZE) },
    sunColor: { value: C(SUN_HIGH) },
    twilightColor: { value: C(TWILIGHT) },
    sunDir: { value: new THREE.Vector3(0.3, 0.5, -0.8) },
    moonDir: { value: new THREE.Vector3(-0.3, -0.5, 0.8) },
    sunGlow: { value: 1 },
    sunDisc: { value: 28 },
    twilight: { value: 0 },
    warm: { value: 0 },
    hazeAmount: { value: 0.5 },
    moonGlow: { value: 0 },
    exposure: { value: 1.05 },
  };
}

/* ------------------------------------------------------------------ shader */

export const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 hazeColor;
  uniform vec3 sunColor;
  uniform vec3 twilightColor;
  uniform vec3 sunDir;
  uniform vec3 moonDir;
  uniform float sunGlow;
  uniform float sunDisc;
  uniform float twilight;
  uniform float warm;
  uniform float hazeAmount;
  uniform float moonGlow;
  uniform float exposure;

  // Narkowicz ACES approximation: the renderer does not tonemap a raw
  // ShaderMaterial, so the dome has to do it for itself or it will not sit in
  // the same exposure as the ground it meets.
  vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }

  void main() {
    vec3 d = normalize(vDir);
    float up = clamp(d.y, 0.0, 1.0);

    // vertical gradient: exponential, so the blue deepens quickly overhead
    vec3 col = mix(horizonColor, topColor, 1.0 - exp(-up * 5.2));

    // horizon haze band
    float band = exp(-up * (9.0 + 16.0 * (1.0 - hazeAmount)));
    col = mix(col, hazeColor, clamp(band * hazeAmount * 0.75, 0.0, 1.0));

    vec3 sd = normalize(sunDir);
    vec2 dh = d.xz / max(length(d.xz), 1e-4);
    vec2 sh = sd.xz / max(length(sd.xz), 1e-4);
    float align = max(dot(dh, sh), 0.0);
    float anti = max(-dot(dh, sh), 0.0);
    float low = pow(1.0 - up, 2.2);

    // a warm wash sitting on the horizon at dawn and dusk only: tinting the
    // whole vertical gradient with it turned the mid sky mauve
    float wash = clamp(warm * exp(-up * 7.0) * 0.95, 0.0, 1.0);
    col = mix(col, twilightColor, wash * 0.85);

    // warm scattering toward the sun, strongest near the horizon
    col += sunColor * sunGlow * pow(align, 6.0) * low * 0.18;

    // twilight: a wedge on the sun's side, a violet belt on the other
    col += twilightColor * twilight * exp(-up * 6.5) * pow(align, 5.0) * 1.35;
    col += vec3(0.30, 0.20, 0.36) * twilight * exp(-up * 9.0) * pow(anti, 3.0) * 0.12;

    // the sun: disc plus two scales of bloom
    float cosSun = dot(d, sd);
    col += sunColor * smoothstep(0.99990, 0.99994, cosSun) * sunDisc;
    col += sunColor * pow(max(cosSun, 0.0), 320.0) * 0.55 * sunGlow;
    col += sunColor * pow(max(cosSun, 0.0), 24.0) * 0.14 * sunGlow;
    col += sunColor * pow(max(cosSun, 0.0), 5.0) * 0.05 * sunGlow;

    // the moon: a pale disc, faintly shaded at the limb
    float cosMoon = dot(d, normalize(moonDir));
    col += vec3(0.90, 0.92, 1.0) * smoothstep(0.99983, 0.99990, cosMoon) * moonGlow * 2.4;
    col += vec3(0.45, 0.55, 0.82) * pow(max(cosMoon, 0.0), 240.0) * moonGlow * 0.30;

    col = aces(col * exposure);
    gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
  }
`;

/* -------------------------------------------------------- JS mirror (CPU) */

const acesOne = (x) => clamp01((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
const encode = (v) => Math.pow(clamp01(v), 1 / 2.2);

/**
 * Sky radiance for a view direction, in sRGB 0..1. Mirrors SKY_FRAG exactly.
 * `u` is a uniforms object from createSkyUniforms(), `out` an object with
 * {r,g,b} or a THREE.Color.
 */
export function sampleSky(dirX, dirY, dirZ, u, out = { r: 0, g: 0, b: 0 }) {
  const len = Math.hypot(dirX, dirY, dirZ) || 1;
  const dx = dirX / len;
  const dy = dirY / len;
  const dz = dirZ / len;
  const up = clamp01(dy);

  const ex = Math.exp;
  const pw = Math.pow;
  const top = u.topColor.value;
  const hor = u.horizonColor.value;
  const hz = u.hazeColor.value;
  const sun = u.sunColor.value;
  const twi = u.twilightColor.value;
  const hazeAmount = u.hazeAmount.value;
  const sunGlow = u.sunGlow.value;
  const twilight = u.twilight.value;
  const moonGlow = u.moonGlow.value;
  const warm = u.warm.value;
  const exposure = u.exposure.value;

  const g = 1 - ex(-up * 5.2);
  let r = hor.r + (top.r - hor.r) * g;
  let gg = hor.g + (top.g - hor.g) * g;
  let b = hor.b + (top.b - hor.b) * g;

  const band = clamp01(ex(-up * (9 + 16 * (1 - hazeAmount))) * hazeAmount * 0.75);
  r += (hz.r - r) * band;
  gg += (hz.g - gg) * band;
  b += (hz.b - b) * band;

  const wash = Math.min(1, Math.max(0, warm * ex(-up * 7) * 0.95)) * 0.85;
  r += (twi.r - r) * wash;
  gg += (twi.g - gg) * wash;
  b += (twi.b - b) * wash;

  const sd = u.sunDir.value;
  const sl = Math.hypot(sd.x, sd.z) || 1e-4;
  const shx = sd.x / sl;
  const shz = sd.z / sl;
  const dl = Math.hypot(dx, dz) || 1e-4;
  const dhx = dx / dl;
  const dhz = dz / dl;
  const align = Math.max(0, dhx * shx + dhz * shz);
  const anti = Math.max(0, -(dhx * shx + dhz * shz));
  const low = pw(1 - up, 2.2);

  const lobe = sunGlow * pw(align, 6) * low * 0.18;
  r += sun.r * lobe;
  gg += sun.g * lobe;
  b += sun.b * lobe;

  const tw = twilight * ex(-up * 6.5) * pw(align, 5) * 1.35;
  r += twi.r * tw;
  gg += twi.g * tw;
  b += twi.b * tw;

  const twa = twilight * ex(-up * 9) * pw(anti, 3) * 0.12;
  r += 0.3 * twa;
  gg += 0.2 * twa;
  b += 0.36 * twa;

  const md = u.moonDir.value;
  const ml = Math.hypot(md.x, md.y, md.z) || 1;
  const cosSun = dx * sd.x + dy * sd.y + dz * sd.z;
  const disc = smoothstep(0.9999, 0.99994, cosSun);
  const bloomA = pw(Math.max(cosSun, 0), 320) * 0.55 * sunGlow;
  const bloomB = pw(Math.max(cosSun, 0), 24) * 0.14 * sunGlow;
  const bloomC = pw(Math.max(cosSun, 0), 5) * 0.05 * sunGlow;
  const sunT = disc * u.sunDisc.value + bloomA + bloomB + bloomC;
  r += sun.r * sunT;
  gg += sun.g * sunT;
  b += sun.b * sunT;

  const cosMoon = (dx * md.x + dy * md.y + dz * md.z) / ml;
  const mdisc = smoothstep(0.99983, 0.9999, cosMoon) * moonGlow * 2.4;
  const mbloom = pw(Math.max(cosMoon, 0), 240) * moonGlow * 0.3;
  r += 0.9 * mdisc + 0.45 * mbloom;
  gg += 0.92 * mdisc + 0.55 * mbloom;
  b += 1.0 * mdisc + 0.82 * mbloom;

  out.r = encode(acesOne(r * exposure)) * 255;
  out.g = encode(acesOne(gg * exposure)) * 255;
  out.b = encode(acesOne(b * exposure)) * 255;
  return out;
}
