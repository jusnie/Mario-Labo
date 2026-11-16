/**
 * textures.js — canvas-generated surface textures for Barangay Kabudoy.
 *
 * Every texture here is drawn procedurally at load time (no network, no external
 * files). They are deliberately desaturated and matte so the scene reads as a
 * real provincial barangay at dusk rather than a cartoon. AI-generated surface
 * images can be dropped in later by swapping the factory return value — see
 * resources/IMG2THREEJS-WORKFLOW.md.
 */
import * as THREE from "three";

const cache = new Map();

function canvas(size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return { c, ctx: c.getContext("2d") };
}

function finish(c, repeat = 1, srgb = true) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/* deterministic-ish noise so the world looks the same every reload */
function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function speckle(ctx, size, count, colors, rmin, rmax, seed) {
  const r = rnd(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(r() * colors.length) | 0];
    ctx.globalAlpha = 0.06 + r() * 0.3;
    const rad = rmin + r() * (rmax - rmin);
    ctx.beginPath();
    ctx.ellipse(r() * size, r() * size, rad, rad * (0.5 + r()), r() * 6.28, 0, 6.28);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function grass(repeat = 26) {
  if (cache.has("grass" + repeat)) return cache.get("grass" + repeat);
  const size = 512;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = "#5f6b3a";
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 900, ["#6e7a42", "#54602f", "#7c8a4a", "#47522a", "#8b8f4e"], 2, 14, 7);
  // blade strokes
  const r = rnd(21);
  for (let i = 0; i < 2600; i++) {
    const x = r() * size;
    const y = r() * size;
    const h = 4 + r() * 12;
    ctx.strokeStyle = ["#7d8a45", "#68742f", "#93a05a", "#4e5a2a"][(r() * 4) | 0];
    ctx.globalAlpha = 0.35 + r() * 0.4;
    ctx.lineWidth = 0.6 + r();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (r() - 0.5) * 4, y - h * 0.6, x + (r() - 0.5) * 7, y - h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // dry patches
  speckle(ctx, size, 40, ["#8f8449", "#a39355"], 12, 42, 3);
  const tex = finish(c, repeat);
  cache.set("grass" + repeat, tex);
  return tex;
}

export function dirtRoad(repeat = 1) {
  if (cache.has("dirt" + repeat)) return cache.get("dirt" + repeat);
  const size = 512;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = "#8a7350";
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 700, ["#9c845c", "#7a6444", "#a89166", "#6d5a3d"], 3, 22, 11);
  // tyre ruts running along the road (V axis)
  for (const x of [size * 0.3, size * 0.7]) {
    const g = ctx.createLinearGradient(x - 26, 0, x + 26, 0);
    g.addColorStop(0, "rgba(90,74,50,0)");
    g.addColorStop(0.5, "rgba(88,72,48,0.5)");
    g.addColorStop(1, "rgba(90,74,50,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 26, 0, 52, size);
  }
  // scattered gravel + dried leaves
  const r = rnd(5);
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = ["#b4a184", "#6b5a42", "#9a8258"][(r() * 3) | 0];
    ctx.globalAlpha = 0.5 + r() * 0.4;
    ctx.beginPath();
    ctx.arc(r() * size, r() * size, 0.8 + r() * 2.4, 0, 6.28);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = finish(c, repeat);
  cache.set("dirt" + repeat, tex);
  return tex;
}

export function plaster(repeat = 4) {
  if (cache.has("plaster" + repeat)) return cache.get("plaster" + repeat);
  const size = 512;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = "#d9d2c2";
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 500, ["#cfc7b5", "#e4ddcd", "#c4bba6", "#b8ae99"], 4, 26, 31);
  // water stains near the bottom
  const g = ctx.createLinearGradient(0, size * 0.62, 0, size);
  g.addColorStop(0, "rgba(120,110,92,0)");
  g.addColorStop(1, "rgba(120,110,92,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, size * 0.62, size, size * 0.38);
  // hairline cracks
  const r = rnd(44);
  ctx.strokeStyle = "rgba(120,112,96,0.5)";
  for (let i = 0; i < 12; i++) {
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    let x = r() * size;
    let y = r() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (r() - 0.5) * 40;
      y += r() * 26;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = finish(c, repeat);
  cache.set("plaster" + repeat, tex);
  return tex;
}

export function wood(repeat = 2, tone = "#8a6a44") {
  const key = `wood${repeat}${tone}`;
  if (cache.has(key)) return cache.get(key);
  const size = 512;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, size, size);
  const r = rnd(77);
  // plank seams
  const planks = 8;
  for (let p = 0; p < planks; p++) {
    const x = (p * size) / planks;
    ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.12})`;
    ctx.fillRect(x, 0, 2, size);
    ctx.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.05})`;
    ctx.fillRect(x + 2, 0, (size / planks) * 0.5, size);
  }
  // grain
  for (let i = 0; i < 420; i++) {
    const x = r() * size;
    ctx.strokeStyle = `rgba(${60 + r() * 40},${40 + r() * 30},${20 + r() * 20},${0.1 + r() * 0.2})`;
    ctx.lineWidth = 0.5 + r();
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (r() - 0.5) * 18, size * 0.33, x + (r() - 0.5) * 18, size * 0.66, x, size);
    ctx.stroke();
  }
  // knots
  for (let i = 0; i < 5; i++) {
    const x = r() * size;
    const y = r() * size;
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = `rgba(70,48,26,${0.35 - k * 0.07})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 3 + k * 3, 6 + k * 4, r(), 0, 6.28);
      ctx.stroke();
    }
  }
  const tex = finish(c, repeat);
  cache.set(key, tex);
  return tex;
}

export function corrugated(repeat = 6, tone = "#9aa0a2") {
  const key = `corr${repeat}${tone}`;
  if (cache.has(key)) return cache.get(key);
  const size = 512;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, size, size);
  // vertical ribs
  const ribs = 26;
  for (let i = 0; i < ribs; i++) {
    const x = (i * size) / ribs;
    const g = ctx.createLinearGradient(x, 0, x + size / ribs, 0);
    g.addColorStop(0, "rgba(0,0,0,0.22)");
    g.addColorStop(0.45, "rgba(255,255,255,0.16)");
    g.addColorStop(0.55, "rgba(255,255,255,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0.26)");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, size / ribs, size);
  }
  // rust blooms
  const r = rnd(91);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(${120 + r() * 40},${60 + r() * 30},${30 + r() * 20},${0.05 + r() * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(r() * size, r() * size, 3 + r() * 22, 2 + r() * 12, r() * 3, 0, 6.28);
    ctx.fill();
  }
  const tex = finish(c, repeat);
  cache.set(key, tex);
  return tex;
}

export function nipa(repeat = 4) {
  if (cache.has("nipa" + repeat)) return cache.get("nipa" + repeat);
  const size = 512;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = "#8d7748";
  ctx.fillRect(0, 0, size, size);
  const r = rnd(13);
  // overlapping thatch courses
  const courses = 16;
  for (let row = 0; row < courses; row++) {
    const y = (row * size) / courses;
    for (let i = 0; i < 40; i++) {
      const x = r() * size;
      const len = size / courses * (0.9 + r() * 0.9);
      ctx.strokeStyle = `rgba(${150 + r() * 60},${126 + r() * 40},${74 + r() * 30},${0.25 + r() * 0.4})`;
      ctx.lineWidth = 0.8 + r() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 8, y + len);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(60,46,24,0.32)";
    ctx.fillRect(0, y, size, 2);
  }
  const tex = finish(c, repeat);
  cache.set("nipa" + repeat, tex);
  return tex;
}

export function concrete(repeat = 3) {
  if (cache.has("concrete" + repeat)) return cache.get("concrete" + repeat);
  const size = 512;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = "#a9a7a0";
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 800, ["#9d9b94", "#b6b4ac", "#8f8d86", "#c2c0b8"], 2, 16, 61);
  const r = rnd(63);
  for (let i = 0; i < 24; i++) {
    ctx.strokeStyle = "rgba(120,118,110,0.35)";
    ctx.beginPath();
    ctx.moveTo(r() * size, r() * size);
    ctx.lineTo(r() * size, r() * size);
    ctx.stroke();
  }
  const tex = finish(c, repeat);
  cache.set("concrete" + repeat, tex);
  return tex;
}

/** Painted sign board: dark text on light board, weathered. */
export function sign(text, opts = {}) {
  const key = "sign" + text + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const w = 1024;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = opts.bg ?? "#f4efe2";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = opts.border ?? "#1d3f8f";
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = opts.fg ?? "#12265c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = text.split("\n");
  const size = opts.size ?? Math.min(120, (h * 0.62) / lines.length);
  ctx.font = `700 ${size}px "Trebuchet MS", "DejaVu Sans", sans-serif`;
  lines.forEach((line, i) => {
    const y = h / 2 + (i - (lines.length - 1) / 2) * size * 1.15;
    ctx.fillText(line, w / 2, y);
  });
  // weathering
  const r = rnd(text.length * 31);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(90,80,60,${0.02 + r() * 0.06})`;
    ctx.beginPath();
    ctx.ellipse(r() * w, r() * h, 4 + r() * 26, 3 + r() * 12, r() * 3, 0, 6.28);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Philippine flag: blue over red, white hoist triangle, sun and three stars. */
export function philippineFlag() {
  if (cache.has("flag")) return cache.get("flag");
  const w = 512;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0038A8";
  ctx.fillRect(0, 0, w, h / 2);
  ctx.fillStyle = "#CE1126";
  ctx.fillRect(0, h / 2, w, h / 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo((h * 2) / 2.6, h / 2);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  // sun
  const cx = h * 0.34;
  const cy = h / 2;
  const R = h * 0.115;
  ctx.fillStyle = "#FCD116";
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 6.28);
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 1.05, cy + Math.sin(a) * R * 1.05);
    ctx.lineTo(cx + Math.cos(a + 0.16) * R * 2.0, cy + Math.sin(a + 0.16) * R * 2.0);
    ctx.lineTo(cx + Math.cos(a - 0.16) * R * 2.0, cy + Math.sin(a - 0.16) * R * 2.0);
    ctx.closePath();
    ctx.fill();
  }
  // three stars
  const star = (x, y, r) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 ? r * 0.45 : r;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };
  star(h * 0.34, h * 0.16, h * 0.055);
  star(h * 0.34, h * 0.84, h * 0.055);
  star(h * 0.55, h * 0.5, h * 0.055);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set("flag", tex);
  return tex;
}

/** Soft drifting cloud puff with alpha. */
export function cloud() {
  if (cache.has("cloud")) return cache.get("cloud");
  const size = 256;
  const { c, ctx } = canvas(size);
  ctx.clearRect(0, 0, size, size);
  const r = rnd(3);
  for (let i = 0; i < 26; i++) {
    const x = size * 0.15 + r() * size * 0.7;
    const y = size * 0.35 + r() * size * 0.4;
    const rad = size * (0.08 + r() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 6.28);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set("cloud", tex);
  return tex;
}

/** Banana leaf: midrib + parallel veins, used on the grove leaf cards. */
export function bananaLeaf(repeat = 1) {
  if (cache.has("bananaLeaf")) return cache.get("bananaLeaf");
  const w = 256;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3f6b2a";
  ctx.fillRect(0, 0, w, h);
  // veins fanning from the midrib
  for (let i = 0; i < 70; i++) {
    const t = i / 70;
    const y = h * t;
    ctx.strokeStyle = `rgba(${90 + (i % 7) * 6},${130 + (i % 5) * 8},${60},0.30)`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(w / 2, y);
    ctx.lineTo(0, y + h * 0.06);
    ctx.moveTo(w / 2, y);
    ctx.lineTo(w, y + h * 0.06);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(150,180,90,0.5)";
  ctx.fillRect(w / 2 - 2, 0, 4, h);
  // dried edges
  ctx.fillStyle = "rgba(120,100,50,0.16)";
  ctx.fillRect(0, 0, 10, h);
  ctx.fillRect(w - 10, 0, 10, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set("bananaLeaf", tex);
  return tex;
}

/** Medial-axis simple brick/soil for the paddy bunds. */
export function mud() {
  if (cache.has("mud")) return cache.get("mud");
  const size = 256;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = "#54463a";
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 400, ["#5f5041", "#483b31", "#6b5a48"], 3, 16, 17);
  // wet sheen patches
  const r = rnd(19);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(90,110,120,${0.05 + r() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(r() * size, r() * size, 8 + r() * 40, 5 + r() * 20, r() * 3, 0, 6.28);
    ctx.fill();
  }
  const tex = finish(c, 3);
  cache.set("mud", tex);
  return tex;
}

export function disposeAll() {
  for (const tex of cache.values()) if (tex?.dispose) tex.dispose();
  cache.clear();
}
