/**
 * models.js — reusable, actually-modelled components for Barangay Kabudoy.
 *
 * The first pass dressed the village in plain boxes and 7-sided cones, which
 * read as "random shapes" up close. Everything here is built to look like a
 * thing: ribbed corrugated sheets, fascia and soffits, recessed windows with
 * sills and persianas, panelled doors with handles and thresholds, turned clay
 * jars (lathe profiles), balustered railings, bamboo fencing, and a displaced
 * horizon terrain instead of cones.
 *
 * All of it is procedural — no external model files, no Blender.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as TEX from "./textures.js";

/* --------------------------------------------------------------- materials */
/**
 * Materials are shared by property signature rather than minted per part.
 * A house has ~200 little pieces; without this, every one of them is its own
 * material and therefore its own draw call.
 *
 * Anything that must animate (window glass, lamp bulbs, the carabao-yellow
 * porch light) is created explicitly and never cached.
 */
const MATERIAL_CACHE = new Map();
export function sharedMaterial(key, factory) {
  if (!MATERIAL_CACHE.has(key)) MATERIAL_CACHE.set(key, factory());
  return MATERIAL_CACHE.get(key);
}

export function materialSignature(mat) {
  if (!mat) return "none";
  return [
    mat.type,
    mat.color?.getHexString?.() ?? "c",
    mat.map?.uuid ?? "nomap",
    mat.emissive?.getHexString?.() ?? "e",
    (mat.emissiveIntensity ?? 0).toFixed(2),
    (mat.roughness ?? 1).toFixed(2),
    (mat.metalness ?? 0).toFixed(2),
    mat.side,
    mat.transparent ? 1 : 0,
    (mat.opacity ?? 1).toFixed(2),
  ].join("|");
}

/** Window glass: fresh per building so the night glow can be animated. */
export function makeGlassMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x18222e,
    roughness: 0.18,
    metalness: 0.05,
    emissive: new THREE.Color(0xffc87a),
    emissiveIntensity: 0,
  });
}

/* ------------------------------------------------------------------- noise */
/** Deterministic 2D value noise (smooth, tileable enough for terrain). */
export function makeNoise(seed = 1337) {
  const hash = (x, y) => {
    let h = x * 374761393 + y * 668265263 + seed * 144665;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
  };
  noise.fbm = (x, y, octaves = 4, gain = 0.5, lacunarity = 2) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let i = 0; i < octaves; i++) {
      sum += noise(fx, fy) * amp;
      norm += amp;
      amp *= gain;
      fx *= lacunarity;
      fy *= lacunarity;
    }
    return sum / norm;
  };
  return noise;
}

/* -------------------------------------------------------------- vegetation */
/**
 * One tapered, curved, folded blade — the shape most plants in the scene are
 * made of (banana leaf, rice blade, corn leaf, garden seedling).
 */
export function bladeGeometry({
  length = 1,
  width = 0.2,
  curve = 0.6, // how much the tip droops relative to length
  fold = 0.35,
  rise = 0.5,
  twist = 0,
  shred = 0,
  segsL = 8,
  segsW = 3,
} = {}) {
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= segsL; i++) {
    const t = i / segsL;
    const taper = Math.sin(Math.PI * Math.pow(t, 0.6)) * (1 - 0.1 * t);
    const notch = shred ? 1 + shred * Math.sin(t * 34) : 1;
    const halfW = width * taper * notch * 0.5;
    const y = length * (rise * t - curve * t * t);
    const tw = twist * t;
    for (let j = 0; j <= segsW; j++) {
      const s = (j / segsW) * 2 - 1;
      const x = s * halfW;
      const droop = s * s * halfW * fold;
      const cx = x * Math.cos(tw);
      const cy = y - droop + x * Math.sin(tw) * 0.35;
      pos.push(cx, cy, t * length);
      uvs.push(s * 0.5 + 0.5, t);
    }
  }
  for (let i = 0; i < segsL; i++) {
    for (let j = 0; j < segsW; j++) {
      const a = i * (segsW + 1) + j;
      const b = a + 1;
      const c = a + (segsW + 1);
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A clump of blades, merged into one geometry, for instancing. */
export function bladeClump(count, opts, seed = 7) {
  const r = makeNoise(seed);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (r(i, 1) - 0.5) * 0.9;
    const tilt = -0.25 - r(i, 2) * 0.9;
    const geo = bladeGeometry({
      ...opts,
      length: opts.length * (0.8 + r(i, 3) * 0.45),
      width: opts.width * (0.8 + r(i, 4) * 0.4),
      curve: opts.curve * (0.8 + r(i, 5) * 0.5),
    });
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3((r(i, 6) - 0.5) * 0.1, 0, (r(i, 7) - 0.5) * 0.1),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, a, (r(i, 8) - 0.5) * 0.3, "YXZ")),
      new THREE.Vector3(1, 1, 1)
    );
    geo.applyMatrix4(m);
    parts.push(geo);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/* --------------------------------------------------------------------- roof */
/**
 * One corrugated sheet, centred on its own origin: x runs along the slope,
 * z along the ridge, and the ribs are real geometry rather than a flat strip.
 */
export function corrugatedSlab({ slopeLength, ridgeLength, ribDepth = 0.028, ribSpacing = 0.115, sag = 0.018 }) {
  const nx = Math.max(8, Math.round(slopeLength / ribSpacing));
  const nz = Math.max(1, Math.round(ridgeLength / 1.2));
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= nx; i++) {
    const u = i / nx;
    const x = (u - 0.5) * slopeLength;
    const rib = Math.cos((x / ribSpacing) * Math.PI * 2) * ribDepth;
    // sheets sag slightly between purlins
    const dip = -Math.sin(Math.PI * u) * sag;
    for (let j = 0; j <= nz; j++) {
      const v = j / nz;
      pos.push(x, rib + dip, (v - 0.5) * ridgeLength);
      uvs.push(u * (slopeLength * 1.6), v * (ridgeLength * 0.4));
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const a = i * (nz + 1) + j;
      const b = a + 1;
      const c = a + (nz + 1);
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Gable roof with real components: two ribbed slopes, a ridge cap, fascia and
 * soffit along every eave, and gable infill under the rake.
 *
 * `width` spans the slopes, `depth` is the ridge length. `ridgeAlong: "x"`
 * turns the finished roof 90° so the ridge runs along X.
 *
 * Placement is derived, not guessed: a sheet of length L rotated by -angle has
 * its inner end at (0, rise) and its outer end at (halfSpan, 0) once it is put
 * at (halfSpan/2, rise/2). The opposite slope mirrors that with +angle.
 */
export function gableRoof({
  width,
  depth,
  rise,
  material,
  overhang = 0.5,
  ridgeAlong = "z",
  gableMaterial = null,
  ribbed = true,
  eaves = true,
}) {
  const group = new THREE.Group();
  const halfSpan = width / 2 + overhang;
  const slopeLength = Math.sqrt(halfSpan * halfSpan + rise * rise);
  const angle = Math.atan2(rise, halfSpan);
  const ridgeLength = depth + overhang * 2;

  for (const side of [-1, 1]) {
    const geo = ribbed
      ? corrugatedSlab({ slopeLength, ridgeLength })
      : new THREE.BoxGeometry(slopeLength, 0.08, ridgeLength);
    const sheet = new THREE.Mesh(geo, material);
    sheet.userData.role = "slope";
    sheet.rotation.z = -side * angle;
    sheet.position.set((side * halfSpan) / 2, rise / 2, 0);
    sheet.castShadow = true;
    sheet.receiveShadow = true;
    group.add(sheet);

    if (eaves) {
      // fascia board closing the sheet edge
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.17, ridgeLength), material);
      fascia.position.set(side * halfSpan, -0.07, 0);
      fascia.castShadow = true;
      group.add(fascia);
      // soffit running back under the eave
      const soffit = new THREE.Mesh(
        new THREE.BoxGeometry(overhang * 0.85, 0.035, ridgeLength),
        new THREE.MeshStandardMaterial({ color: 0x6d6152, roughness: 1 })
      );
      soffit.position.set(side * (halfSpan - overhang * 0.42), -0.15, 0);
      group.add(soffit);
    }
  }

  // ridge cap: two short angled boards rather than a floating box
  for (const side of [-1, 1]) {
    const capBoard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, ridgeLength), material);
    capBoard.rotation.z = -side * angle * 0.9;
    capBoard.position.set(side * 0.1, rise + 0.045, 0);
    group.add(capBoard);
  }

  // gable infill
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const gableGeo = new THREE.ShapeGeometry(shape);
  const gableMat =
    gableMaterial ?? new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.95 });
  for (const z of [-depth / 2, depth / 2]) {
    const g = new THREE.Mesh(gableGeo, gableMat);
    g.position.set(0, 0, z);
    g.rotation.y = z < 0 ? Math.PI : 0;
    group.add(g);
  }

  if (ridgeAlong === "x") group.rotation.y = Math.PI / 2;
  return group;
}

/* ----------------------------------------------------------------- openings */
/** Recessed window: dark glass, frame, sill, mullions, optional louvres. */
export function windowUnit({
  width = 1.1,
  height = 1.2,
  sill = true,
  louvres = false,
  glassOut = null,
  glassMaterial = null,
  frameColor = 0xf0ece0,
}) {
  const g = new THREE.Group();
  const frameMat = sharedMaterial(
    `windowframe:${frameColor}`,
    () => new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.7 })
  );
  // glass stays its own material so it can light up after dusk
  const glassMat = glassMaterial ?? makeGlassMaterial();
  if (glassOut && !glassOut.includes(glassMat)) glassOut.push(glassMat);

  // reveal: dark inset box so the window has depth
  const reveal = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.1),
    sharedMaterial("windowreveal", () => new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.9 }))
  );
  reveal.position.z = -0.06;
  g.add(reveal);

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width, height), glassMat);
  glass.position.z = 0.012;
  g.add(glass);

  // frame
  const rail = (w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frameMat);
    m.position.set(x, y, 0.04);
    return m;
  };
  g.add(rail(width + 0.12, 0.1, 0, height / 2), rail(width + 0.12, 0.1, 0, -height / 2));
  g.add(rail(0.1, height + 0.12, -width / 2, 0), rail(0.1, height + 0.12, width / 2, 0));
  g.add(rail(0.055, height, 0, 0));

  if (sill) {
    const sillMesh = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.07, 0.24), frameMat);
    sillMesh.position.set(0, -height / 2 - 0.09, 0.07);
    sillMesh.castShadow = true;
    g.add(sillMesh);
  }
  if (louvres) {
    const slatCount = Math.max(4, Math.round(height / 0.16));
    for (let i = 0; i < slatCount; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(width * 0.92, 0.075, 0.02), frameMat);
      slat.position.set(0, -height / 2 + 0.1 + i * (height / slatCount), 0.09);
      slat.rotation.x = 0.55;
      g.add(slat);
    }
  }
  return g;
}

/** Panelled door with a frame, threshold, handle and hinges. */
export function doorUnit({ width = 1.05, height = 2.1, color = "#6b4f33", glassOut = null } = {}) {
  const g = new THREE.Group();
  const woodMat = sharedMaterial(
    `doorwood:${color}`,
    () => new THREE.MeshStandardMaterial({ map: TEX.wood(1, color), roughness: 0.85 })
  );
  const frameMat = sharedMaterial(
    "doorframe",
    () => new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.75 })
  );

  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.08), woodMat);
  panel.position.y = height / 2;
  panel.castShadow = true;
  g.add(panel);

  // raised panels
  for (const [cy, ph] of [
    [height * 0.72, height * 0.34],
    [height * 0.3, height * 0.38],
  ]) {
    for (const cx of [-width * 0.22, width * 0.22]) {
      const inset = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.34, ph, 0.02),
        sharedMaterial(
          "doorinset",
          () => new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#5b4029"), roughness: 0.9 })
        )
      );
      inset.position.set(cx, cy, 0.05);
      g.add(inset);
    }
  }

  // frame
  for (const x of [-width / 2 - 0.06, width / 2 + 0.06]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, height + 0.12, 0.14), frameMat);
    jamb.position.set(x, (height + 0.12) / 2, 0.02);
    g.add(jamb);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(width + 0.36, 0.14, 0.16), frameMat);
  head.position.set(0, height + 0.07, 0.02);
  g.add(head);

  // handle + hinges
  const metal = sharedMaterial(
    "doormetal",
    () => new THREE.MeshStandardMaterial({ color: 0xb9a06a, roughness: 0.35, metalness: 0.8 })
  );
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), metal);
  knob.position.set(width * 0.36, height * 0.52, 0.08);
  g.add(knob);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), metal);
  rose.rotation.x = Math.PI / 2;
  rose.position.set(width * 0.36, height * 0.52, 0.05);
  g.add(rose);
  for (const y of [height * 0.25, height * 0.75]) {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.02), metal);
    hinge.position.set(-width / 2 + 0.03, y, 0.05);
    g.add(hinge);
  }

  // threshold
  const threshold = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.4, 0.06, 0.3),
    sharedMaterial("threshold", () => new THREE.MeshStandardMaterial({ color: 0x8d8a82, roughness: 1 }))
  );
  threshold.position.set(0, 0.03, 0.06);
  g.add(threshold);
  return g;
}

/* --------------------------------------------------------------- structure */
/** Turned wooden/tin post with a base and a capital. */
export function post({ height = 3, radius = 0.09, material = null, base = true } = {}) {
  const g = new THREE.Group();
  const mat = material ?? new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#6a5136"), roughness: 0.9 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, height, 10, 1), mat);
  shaft.position.y = height / 2;
  shaft.castShadow = true;
  g.add(shaft);
  if (base) {
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 1.9, radius * 2.2, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: 0x8d8a82, roughness: 1 })
    );
    foot.position.y = 0.08;
    g.add(foot);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.35, radius * 1.35, 0.08, 10), mat);
  collar.position.y = height - 0.16;
  g.add(collar);
  return g;
}

/** Balustered railing along a run, e.g. a porch or a stair edge. */
export function railing({ length = 3, height = 1, material, spacing = 0.22 } = {}) {
  const g = new THREE.Group();
  const mat = material ?? new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.85 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(length, 0.07, 0.09), mat);
  top.position.y = height;
  g.add(top);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(length, 0.05, 0.07), mat);
  bottom.position.y = height * 0.12;
  g.add(bottom);
  const count = Math.max(2, Math.floor(length / spacing));
  for (let i = 0; i <= count; i++) {
    const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, height * 0.88, 6), mat);
    baluster.position.set(-length / 2 + (i * length) / count, height * 0.56, 0);
    g.add(baluster);
  }
  return g;
}

/** Concrete steps with stringers, used at doors and the hall entrance. */
export function stairs({ steps = 3, width = 1.4, rise = 0.22, run = 0.3, material = null } = {}) {
  const g = new THREE.Group();
  const mat = material ?? new THREE.MeshStandardMaterial({ map: TEX.concrete(2), roughness: 1 });
  for (let i = 0; i < steps; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(width, rise, run), mat);
    step.position.set(0, rise / 2 + i * rise, -i * run);
    step.castShadow = true;
    step.receiveShadow = true;
    g.add(step);
  }
  return g;
}

/* ------------------------------------------------------------------- props */
/** Real lathe-turned clay jar (tapayan) or pot, not a plain cylinder. */
export function jar({ height = 0.62, radius = 0.28, color = 0xa9663c, segments = 18 } = {}) {
  const profile = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // bulging middle, narrow neck, flared lip
    const r =
      radius *
      (0.42 +
        0.62 * Math.sin(Math.PI * Math.min(1, t * 1.05)) +
        0.12 * Math.pow(Math.max(0, t - 0.78) * 5, 2));
    profile.push(new THREE.Vector2(Math.max(0.02, r), t * height));
  }
  const geo = new THREE.LatheGeometry(profile, segments);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.62, 0.022, 6, 18),
    new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = height;
  g.add(rim);
  return g;
}

/** Potted plant: lathe pot + a clump of leaves. */
export function pottedPlant({ scale = 1, leafCount = 7, potColor = 0xa9603c } = {}) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * scale, 0.12 * scale, 0.24 * scale, 14),
    new THREE.MeshStandardMaterial({ color: potColor, roughness: 0.9 })
  );
  pot.position.y = 0.12 * scale;
  pot.castShadow = true;
  g.add(pot);
  const leaves = new THREE.Mesh(
    bladeClump(
      leafCount,
      { length: 0.55 * scale, width: 0.16 * scale, curve: 0.7, rise: 0.9, fold: 0.3, segsL: 5, segsW: 2 },
      91
    ),
    new THREE.MeshStandardMaterial({ color: 0x4f7a34, roughness: 0.9, side: THREE.DoubleSide })
  );
  leaves.position.y = 0.24 * scale;
  g.add(leaves);
  return g;
}

/** Clothesline with pegged laundry — reads instantly as a lived-in home. */
export function clothesline({ length = 3.4, height = 1.8, colors = [0xd8d2c0, 0x9fb4c8, 0xc9a08a] } = {}) {
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#6a5136"), roughness: 0.95 });
  for (const x of [-length / 2, length / 2]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, height, 8), postMat);
    p.position.set(x, height / 2, 0);
    p.castShadow = true;
    g.add(p);
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-length / 2, height - 0.05, 0),
    new THREE.Vector3(0, height - 0.13, 0),
    new THREE.Vector3(length / 2, height - 0.05, 0),
  ]);
  g.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x2b2b2b })));
  const cloths = 3;
  for (let i = 0; i < cloths; i++) {
    const w = length / (cloths + 1.6);
    const h = 0.55 + (i % 2) * 0.18;
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h, 3, 2),
      new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        roughness: 0.95,
        side: THREE.DoubleSide,
      })
    );
    const x = -length / 2 + (length * (i + 1)) / (cloths + 1);
    cloth.position.set(x, height - 0.15 - h / 2, 0.01);
    cloth.rotation.y = (i - 1) * 0.08;
    cloth.castShadow = true;
    g.add(cloth);
  }
  return g;
}

/** Bamboo fence run: poles, two ties and vertical slats. */
export function bambooFence({ length = 4, height = 1.2, material = null } = {}) {
  const g = new THREE.Group();
  const mat = material ?? new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#8a7a45"), roughness: 0.95 });
  for (const y of [height * 0.28, height * 0.78]) {
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, length, 6), mat);
    tie.rotation.z = Math.PI / 2;
    tie.position.y = y;
    g.add(tie);
  }
  const slats = Math.floor(length / 0.12);
  for (let i = 0; i <= slats; i++) {
    const slat = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, height, 6), mat);
    slat.position.set(-length / 2 + (i * length) / slats, height / 2, 0);
    slat.rotation.z = 0.02 * Math.sin(i * 1.7);
    g.add(slat);
  }
  for (const x of [-length / 2, 0, length / 2]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, height + 0.1, 8), mat);
    p.position.set(x, (height + 0.1) / 2, 0);
    p.castShadow = true;
    g.add(p);
  }
  return g;
}

/* ------------------------------------------------------------------- batch */
/**
 * Bake a group's static meshes down to one mesh per material.
 *
 * The detailed houses are made of ~200 small parts each (battens, balusters,
 * window frames, hinges), which is fine for looks and terrible for draw calls.
 * This merges everything that cannot move into a handful of meshes. Skinned
 * meshes, instanced meshes, points, lines, sprites and anything tagged
 * `userData.noMerge` (the animated flag) are left alone.
 */
export function mergeStaticGroup(group) {
  group.updateMatrixWorld(true);
  const toGroupSpace = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const merged = [];

  group.traverse((o) => {
    if (
      o.isMesh &&
      !o.isInstancedMesh &&
      !o.isSkinnedMesh &&
      !o.isPoints &&
      !o.isLine &&
      !o.isSprite &&
      o.geometry &&
      !o.userData.noMerge &&
      !Array.isArray(o.material) &&
      !(o.geometry.morphAttributes?.position?.length)
    ) {
      merged.push(o);
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const key of Object.keys(geo.attributes)) {
        if (key !== "position" && key !== "normal" && key !== "uv") geo.deleteAttribute(key);
      }
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!geo.attributes.uv) {
        const count = geo.attributes.position.count;
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
      }
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toGroupSpace, o.matrixWorld));
      const key = `${materialSignature(o.material)}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          material: o.material,
          castShadow: o.castShadow,
          receiveShadow: o.receiveShadow,
          geos: [],
        });
      }
      buckets.get(key).geos.push(geo);
    }
  });

  if (!merged.length) return group;

  for (const mesh of merged) mesh.removeFromParent();
  let built = 0;
  for (const bucket of buckets.values()) {
    const geo = mergeGeometries(bucket.geos, false);
    bucket.geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, bucket.material);
    mesh.castShadow = bucket.castShadow;
    mesh.receiveShadow = bucket.receiveShadow;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    built++;
  }
  group.userData.batched = { from: merged.length, to: built };
  return group;
}

/* ------------------------------------------------------------------ terrain */
/**
 * Displaced horizon terrain: a ring mesh that is flat where the village is and
 * rolls into hills, then mountains, as it heads to the fog. Replaces the ring
 * of 7-sided cones that read as pyramids.
 */
export function horizonTerrain({
  innerRadius = 200,
  outerRadius = 1000,
  radialSteps = 46,
  segments = 168,
  seed = 2024,
  grassColor = 0x5e6b3d,
  hillColor = 0x4b5738,
  rockColor = 0x515b57,
} = {}) {
  const noise = makeNoise(seed);
  const pos = [];
  const colors = [];
  const idx = [];
  const cGrass = new THREE.Color(grassColor);
  const cHill = new THREE.Color(hillColor);
  const cRock = new THREE.Color(rockColor);
  const tmp = new THREE.Color();

  const heightAt = (x, z, r) => {
    const t = THREE.MathUtils.smoothstep(r, innerRadius, innerRadius + 220);
    const rolling = noise.fbm(x * 0.0042, z * 0.0042, 4) * 46 * t;
    const ridgeT = THREE.MathUtils.smoothstep(r, 520, 940);
    const ridges =
      Math.pow(noise.fbm(x * 0.0016, z * 0.0016, 3), 1.7) * 300 * ridgeT +
      noise.fbm(x * 0.006, z * 0.006, 2) * 26 * ridgeT;
    return rolling + ridges;
  };

  for (let i = 0; i <= radialSteps; i++) {
    // log spacing: dense near the village, coarse at the horizon
    const t = i / radialSteps;
    const r = innerRadius + (outerRadius - innerRadius) * Math.pow(t, 1.9);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r - 110;
      const y = heightAt(x, z, r);
      pos.push(x, y, z);
      const h = THREE.MathUtils.clamp(y / 120, 0, 1);
      tmp.copy(cGrass).lerp(cHill, THREE.MathUtils.smoothstep(y, 2, 55));
      tmp.lerp(cRock, THREE.MathUtils.smoothstep(h, 0.35, 0.9));
      colors.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < radialSteps; i++) {
    for (let j = 0; j < segments; j++) {
      const j2 = (j + 1) % segments;
      const a = i * segments + j;
      const b = i * segments + j2;
      const c = (i + 1) * segments + j;
      const d = (i + 1) * segments + j2;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  return mesh;
}
