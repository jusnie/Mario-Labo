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

function speckle(ctx, size, count, colors, rmin, rmax, seed, x0 = 0, window = null) {
  const r = rnd(seed);
  const width = window ?? size;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(r() * colors.length) | 0];
    ctx.globalAlpha = 0.06 + r() * 0.3;
    const rad = rmin + r() * (rmax - rmin);
    ctx.beginPath();
    ctx.ellipse(x0 + r() * width, r() * size, rad, rad * (0.5 + r()), r() * 6.28, 0, 6.28);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * A tiling bump map made from value noise, for the surfaces that are only flat
 * colour right now. Grass, dirt and plaster all read as painted cardboard
 * without one — a normal map is the cheapest realism there is.
 */
export function noiseNormal({ repeat = 1, strength = 1.2, scale = 48, seed = 1, octaves = 4 } = {}) {
  const key = `normal:${repeat}:${strength}:${scale}:${seed}:${octaves}`;
  if (cache.has(key)) return cache.get(key);

  const size = 256;
  const { c, ctx } = canvas(size);
  const r = rnd(seed);
  // value noise laid down at a few scales
  const fields = [];
  for (let o = 0; o < octaves; o++) {
    const step = Math.max(2, Math.round(scale / Math.pow(2, o)));
    const grid = Math.ceil(size / step) + 1;
    const points = [];
    for (let i = 0; i < grid * grid; i++) points.push(r());
    fields.push({ step, grid, points });
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (f, x, y) => {
    const gx = x / f.step;
    const gy = y / f.step;
    const x0 = Math.floor(gx) % f.grid;
    const y0 = Math.floor(gy) % f.grid;
    const x1 = (x0 + 1) % f.grid;
    const y1 = (y0 + 1) % f.grid;
    const tx = smooth(gx - Math.floor(gx));
    const ty = smooth(gy - Math.floor(gy));
    const a = f.points[y0 * f.grid + x0] * (1 - tx) + f.points[y0 * f.grid + x1] * tx;
    const b = f.points[y1 * f.grid + x0] * (1 - tx) + f.points[y1 * f.grid + x1] * tx;
    return a * (1 - ty) + b * ty;
  };
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0;
      let amp = 1;
      let norm = 0;
      for (const f of fields) {
        h += sample(f, x, y) * amp;
        norm += amp;
        amp *= 0.55;
      }
      height[y * size + x] = h / norm;
    }
  }
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[(((y + size) % size) * size) + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength * 8;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength * 8;
      // normal = normalize(-dx, -dy, 1) packed into RGB
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = finish(c, repeat, false);
  cache.set(key, tex);
  return tex;
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

/**
 * The whole road corridor in one tile: packed clay with wheel ruts, broken up
 * by an irregular dusty verge on either side that fades into the grass colour.
 * Baking the transition into the texture is what stops the road reading as a
 * rectangle laid on the ground -- the polygon edge is no longer visible.
 *
 * U spans the corridor (road + verge), V tiles along its length.
 */
export function roadBed({ verge = 0.3, size = 768, seed = 21 } = {}) {
  const key = `roadbed:${verge}:${size}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const { c, ctx } = canvas(size);
  const r = rnd(seed);
  const left = size * verge;
  const right = size - left;
  const bandW = right - left;
  const TAU = Math.PI * 2;
  // Any noise that runs along V has to close at the tile seam, so its
  // frequencies are whole cycles per tile.
  const wave = (y, k, amp, phase = 0) => Math.sin((y / size) * TAU * k + phase) * amp;

  /* ---- verge: dry, trampled ground with grass crowding in from outside ---- */
  ctx.fillStyle = "#8f8468";
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 1400, ["#8b8064", "#786c53", "#94896c", "#6d6149"], 2, 16, seed + 1);

  // grass: fine upright strokes, denser toward the outer edge
  for (let i = 0; i < 5200; i++) {
    const side = r() < 0.5 ? 0 : 1;
    const t = Math.pow(r(), 1.5);
    const x = side === 0 ? t * left : size - t * left;
    const y = r() * size;
    const len = 3 + r() * 9;
    ctx.strokeStyle = ["#7d8552", "#6c7847", "#8f9158", "#5d6a41", "#87834f"][(r() * 5) | 0];
    ctx.globalAlpha = 0.3 + r() * 0.55 * (1 - t * 0.4);
    ctx.lineWidth = 0.9 + r() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 3, y - len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // greener toward the outside: the verge fades into unkempt grass
  for (const [x0, dir] of [[0, 1], [size, -1]]) {
    const g = ctx.createLinearGradient(x0, 0, x0 + dir * left * 0.7, 0);
    g.addColorStop(0, "rgba(88,100,56,0.7)");
    g.addColorStop(1, "rgba(88,100,56,0.05)");
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x0 + dir * left * 0.7), 0, left * 0.7, size);
  }
  // bare, scuffed earth right where feet leave the road
  for (const edge of [left, right]) {
    const dir = edge === left ? 1 : -1;
    const g = ctx.createLinearGradient(edge, 0, edge + dir * bandW * 0.16, 0);
    g.addColorStop(0, "rgba(158,144,117,0.9)");
    g.addColorStop(1, "rgba(158,144,117,0)");
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(edge, edge + dir * bandW * 0.16), 0, bandW * 0.16, size);
  }

  /* ---- the running surface ---- */
  const bandBase = "#8b7c61";
  // build it in rows so both edges wander, and the wander closes at the seam
  for (let y = 0; y < size; y += 1) {
    const wobIn = wave(y, 3, 5) + wave(y, 7, 3, 1.1) + (r() - 0.5) * 2.2;
    const wobOut = wave(y, 2, 6, 0.7) + wave(y, 9, 2.6, 2.3) + (r() - 0.5) * 2.2;
    ctx.fillStyle = bandBase;
    ctx.fillRect(left + wobIn, y, bandW - wobIn - wobOut, 1);
  }
  // tonal drift along the length, sealed at the seam
  for (let i = 0; i < 900; i++) {
    const x = left + r() * bandW;
    const y = r() * size;
    ctx.globalAlpha = 0.05 + r() * 0.16;
    ctx.fillStyle = r() < 0.5 ? "#9c8e70" : "#77694f";
    ctx.beginPath();
    ctx.ellipse(x, y, 6 + r() * 30, 4 + r() * 22, r() * 3, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  speckle(ctx, size, 1500, ["#9a8862", "#7a6a4c", "#a69572", "#6b5c42"], 1.5, 14, seed + 2, left + 6, bandW - 12);

  // wheel ruts: two thirds of a lane apart, soft-edged, with the compacted
  // pale centre a wheel actually leaves
  for (const f of [0.3, 0.7]) {
    const x = left + bandW * f;
    const g = ctx.createLinearGradient(x - 34, 0, x + 34, 0);
    g.addColorStop(0, "rgba(84,70,48,0)");
    g.addColorStop(0.32, "rgba(80,66,45,0.5)");
    g.addColorStop(0.68, "rgba(80,66,45,0.5)");
    g.addColorStop(1, "rgba(84,70,48,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 34, 0, 68, size);
    const inner = ctx.createLinearGradient(x - 12, 0, x + 12, 0);
    inner.addColorStop(0, "rgba(160,146,116,0)");
    inner.addColorStop(0.5, "rgba(160,146,116,0.35)");
    inner.addColorStop(1, "rgba(160,146,116,0)");
    ctx.fillStyle = inner;
    ctx.fillRect(x - 12, 0, 24, size);
  }
  // pale, worn crown down the middle
  const crown = ctx.createLinearGradient(left, 0, right, 0);
  crown.addColorStop(0, "rgba(190,178,150,0)");
  crown.addColorStop(0.5, "rgba(190,178,150,0.26)");
  crown.addColorStop(1, "rgba(190,178,150,0)");
  ctx.fillStyle = crown;
  ctx.fillRect(left, 0, bandW, size);

  // gravel, leaf litter, the odd damp patch
  for (let i = 0; i < 340; i++) {
    ctx.fillStyle = ["#b7a684", "#6b5a42", "#a08c62", "#585040"][(r() * 4) | 0];
    ctx.globalAlpha = 0.3 + r() * 0.45;
    ctx.beginPath();
    ctx.arc(left + r() * bandW, r() * size, 0.7 + r() * 2.4, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 18; i++) {
    ctx.globalAlpha = 0.06 + r() * 0.1;
    ctx.fillStyle = "#5c5140";
    ctx.beginPath();
    ctx.ellipse(left + r() * bandW, r() * size, 8 + r() * 26, 5 + r() * 16, r() * 3, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // clods and grass breaking the straight line of the band on both sides
  for (const [edge, dir] of [[left, -1], [right, 1]]) {
    for (let i = 0; i < 900; i++) {
      const y = r() * size;
      const rad = 1 + r() * 5.5;
      const off = rad * (0.15 + r() * 1.5);
      ctx.globalAlpha = 0.3 + r() * 0.5;
      const pick = r();
      ctx.fillStyle = pick < 0.5 ? bandBase : pick < 0.8 ? "#9e9075" : ["#7d8552", "#6c7847"][(r() * 2) | 0];
      ctx.beginPath();
      ctx.ellipse(edge + dir * off, y, rad, rad * (0.5 + r() * 1.1), r() * 3, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // outermost few pixels fade to the grass tone so the plane's edge vanishes
  for (const [x0, dir] of [[0, 1], [size, -1]]) {
    const g = ctx.createLinearGradient(x0, 0, x0 + dir * size * 0.05, 0);
    g.addColorStop(0, "rgba(118,126,84,0.9)");
    g.addColorStop(0.55, "rgba(118,126,84,0.45)");
    g.addColorStop(1, "rgba(118,126,84,0)");
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x0 + dir * size * 0.05), 0, size * 0.05, size);
  }

  const tex = finish(c, 1);
  cache.set(key, tex);
  return tex;
}

/**
 * Glazing. Without an environment map a "glass" material is just a black hole,
 * which is what every window in the barangay looked like. This bakes the sky
 * reflection -- bright at the top, dark at the bottom, one diagonal glare --
 * so a pane reads as glass from any angle.
 */
export function glassPane() {
  if (cache.has("glasspane")) return cache.get("glasspane");
  const w = 256;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#c3d6e6");
  g.addColorStop(0.22, "#93aabb");
  g.addColorStop(0.55, "#556a78");
  g.addColorStop(0.82, "#2b3742");
  g.addColorStop(1, "#1b232b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // a soft diagonal glare, the way a flat pane catches the sky
  ctx.save();
  ctx.translate(w * 0.42, h * 0.42);
  ctx.rotate(-0.6);
  const gl = ctx.createLinearGradient(-90, 0, 90, 0);
  gl.addColorStop(0, "rgba(255,255,255,0)");
  gl.addColorStop(0.45, "rgba(255,255,255,0.34)");
  gl.addColorStop(0.55, "rgba(255,255,255,0.12)");
  gl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gl;
  ctx.fillRect(-90, -200, 180, 400);
  ctx.restore();

  // the room behind, faintly, and dust settled at the bottom
  const r = rnd(77);
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.04 + r() * 0.08;
    ctx.fillStyle = "#0e1418";
    ctx.beginPath();
    ctx.ellipse(r() * w, h * 0.5 + r() * h * 0.5, 6 + r() * 26, 4 + r() * 16, r() * 3, 0, 6.28);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set("glasspane", tex);
  return tex;
}

export function plaster(repeat = 4) {
  if (cache.has("plaster" + repeat)) return cache.get("plaster" + repeat);
  const size = 512;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = "#dcd5c6";
  ctx.fillRect(0, 0, size, size);
  const r = rnd(31);

  // tone drift: broad, very soft gradients. Hard-edged blobs read as bubbles,
  // which is exactly what the first pass looked like on the hall wall.
  for (let i = 0; i < 14; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 70 + r() * 150;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.5;
    g.addColorStop(0, dark ? "rgba(186,178,160,0.16)" : "rgba(246,242,232,0.20)");
    g.addColorStop(1, "rgba(220,213,198,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // stucco grit: dense, tiny, low contrast
  speckle(ctx, size, 5200, ["#d2cab8", "#e7e1d3", "#c6bda9", "#efeade"], 0.5, 2.4, 61);

  // trowel sweeps, barely there
  for (let i = 0; i < 18; i++) {
    ctx.lineWidth = 16 + r() * 16;
    ctx.strokeStyle = r() < 0.5 ? "rgba(255,255,255,0.028)" : "rgba(150,142,124,0.022)";
    ctx.beginPath();
    const x = r() * size;
    const y = r() * size;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 40 + r() * 80, y + (r() - 0.5) * 60, x + 90 + r() * 130, y + (r() - 0.5) * 40);
    ctx.stroke();
  }

  // grime gathering at the bottom of the wall
  const grime = ctx.createLinearGradient(0, size * 0.6, 0, size);
  grime.addColorStop(0, "rgba(118,110,92,0)");
  grime.addColorStop(1, "rgba(118,110,92,0.1)");
  ctx.fillStyle = grime;
  ctx.fillRect(0, size * 0.6, size, size * 0.4);

  // a few hairline cracks and the odd chipped patch
  ctx.strokeStyle = "rgba(128,120,104,0.4)";
  for (let i = 0; i < 7; i++) {
    ctx.lineWidth = 0.5 + r() * 0.5;
    ctx.beginPath();
    let x = r() * size;
    let y = r() * size;
    ctx.moveTo(x, y);
    for (let step = 0; step < 7; step++) {
      x += (r() - 0.5) * 34;
      y += 12 + r() * 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = r() < 0.5 ? "rgba(196,186,166,0.5)" : "rgba(232,226,214,0.5)";
    ctx.beginPath();
    ctx.ellipse(r() * size, r() * size, 1.5 + r() * 5, 1 + r() * 3.5, r() * 3, 0, 6.28);
    ctx.fill();
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

export function corrugated(repeat = 1, tone = "#9aa0a2") {
  const key = `corr${repeat}${tone}`;
  if (cache.has(key)) return cache.get(key);
  const size = 512;
  const { c, ctx } = canvas(size);
  ctx.fillStyle = tone;
  ctx.fillRect(0, 0, size, size);
  const r = rnd(91);
  // The ribs themselves are geometry (corrugatedSlab models them), so the map
  // carries weathering only. Painting ribs here as well put a second frequency
  // a few millimetres off the modelled ones and produced that swirling moire.
  // What old GI sheet really looks like: chalky oxidation, panel laps every
  // sheet, and rust bleeding down the slope from every lap and fastener.
  speckle(ctx, size, 260, ["#a9aeac", "#878d8a", "#b3b6ae", "#6f7671"], 8, 46, 17);

  // panel laps: two seams per tile, running down the slope
  for (let i = 0; i < 2; i++) {
    const x = (i + 0.5) * (size / 2);
    const lap = ctx.createLinearGradient(x - 5, 0, x + 7, 0);
    lap.addColorStop(0, "rgba(45,48,46,0.42)");
    lap.addColorStop(0.6, "rgba(70,74,70,0.18)");
    lap.addColorStop(1, "rgba(150,154,148,0.10)");
    ctx.fillStyle = lap;
    ctx.fillRect(x - 5, 0, 12, size);
  }

  // rust streaks: long, thin, running downhill from the laps
  for (let i = 0; i < 46; i++) {
    const x = r() * size;
    const len = 40 + r() * (size * 0.9);
    const y0 = r() * size * 0.7;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    const a = 0.1 + r() * 0.3;
    g.addColorStop(0, `rgba(${110 + r() * 40},${58 + r() * 26},${28 + r() * 18},${a})`);
    g.addColorStop(1, `rgba(${104 + r() * 30},${54 + r() * 20},${26 + r() * 16},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, 2 + r() * 7, len);
  }
  // rust blooms and pits
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(${118 + r() * 42},${58 + r() * 30},${28 + r() * 20},${0.06 + r() * 0.24})`;
    ctx.beginPath();
    ctx.ellipse(r() * size, r() * size, 3 + r() * 20, 2 + r() * 11, r() * 3, 0, 6.28);
    ctx.fill();
  }
  // grey chalky bloom over the top, so it is not uniformly rusty
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#c7c9c1";
  for (let i = 0; i < 26; i++) {
    ctx.beginPath();
    ctx.ellipse(r() * size, r() * size, 20 + r() * 70, 14 + r() * 50, r() * 3, 0, 6.28);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
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
  let size = opts.size ?? Math.min(120, (h * 0.62) / lines.length);
  // never let the lettering run off the board: measure and shrink until the
  // longest line fits inside the border
  const maxW = w - 90;
  for (let pass = 0; pass < 6; pass++) {
    ctx.font = `700 ${size}px "Trebuchet MS", "DejaVu Sans", sans-serif`;
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (!Number.isFinite(widest) || widest <= maxW) break;
    size = Math.max(18, Math.floor((size * maxW) / widest) - 1);
  }
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
  const size = 512;
  const { c, ctx } = canvas(size);
  ctx.clearRect(0, 0, size, size);
  const r = rnd(3);

  // Billows: a heap of soft circles along a horizontal axis, tallest in the
  // middle. Solid rather than translucent, so the sprite does not wash out to
  // a flat white smudge against the sky.
  const heap = [];
  for (let i = 0; i < 34; i++) {
    const t = (i / 33) * 2 - 1; // -1..1 across the cloud
    const x = size * 0.5 + t * size * 0.34 + (r() - 0.5) * size * 0.08;
    const lift = Math.max(0, 1 - Math.abs(t)) ; // taller in the middle
    const y = size * (0.66 - lift * 0.17 - r() * 0.09);
    const rad = size * (0.07 + lift * 0.08 + r() * 0.07);
    heap.push({ x, y, rad });
  }
  // soft shadowed underside first
  for (const b of heap) {
    const g = ctx.createRadialGradient(b.x, b.y + b.rad * 0.25, b.rad * 0.1, b.x, b.y, b.rad * 1.08);
    g.addColorStop(0, "rgba(184,196,210,0.95)");
    g.addColorStop(0.7, "rgba(196,207,220,0.55)");
    g.addColorStop(1, "rgba(200,210,222,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y + b.rad * 0.16, b.rad * 1.08, 0, 6.28);
    ctx.fill();
  }
  // sunlit crowns, offset up and to the sun side
  for (const b of heap) {
    const g = ctx.createRadialGradient(b.x - b.rad * 0.2, b.y - b.rad * 0.3, 0, b.x - b.rad * 0.1, b.y, b.rad);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(252,253,255,0.85)");
    g.addColorStop(1, "rgba(240,244,250,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y - b.rad * 0.06, b.rad, 0, 6.28);
    ctx.fill();
  }
  // a few smaller puffs torn off the top edge
  for (let i = 0; i < 14; i++) {
    const x = size * (0.25 + r() * 0.5);
    const y = size * (0.3 + r() * 0.18);
    const rad = size * (0.03 + r() * 0.05);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 6.28);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
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
