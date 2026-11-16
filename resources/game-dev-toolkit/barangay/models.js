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
  // Roughness/metalness are quantised: a 0.02 difference between two boards is
  // invisible but would otherwise split the batch into another draw call.
  const q = (v) => Math.round(v * 12) / 12;
  return [
    mat.type,
    mat.color?.getHexString?.() ?? "c",
    mat.map?.uuid ?? "nomap",
    mat.emissive?.getHexString?.() ?? "e",
    q(mat.emissiveIntensity ?? 0).toFixed(2),
    q(mat.roughness ?? 1).toFixed(2),
    q(mat.metalness ?? 0).toFixed(2),
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
  rafters = false,
  bargeBoards = false,
  gableVent = false,
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

  // exposed rafter tails: the ends of the roof structure, left showing under the
  // eaves the way they are on an unpainted provincial house
  if (rafters) {
    const rafterMat = sharedMaterial(
      "rafterwood",
      () => new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#5f4831"), roughness: 0.95 })
    );
    const count = Math.max(3, Math.round(ridgeLength / 0.66));
    for (let i = 0; i < count; i++) {
      const z = -ridgeLength / 2 + (i + 0.5) * (ridgeLength / count);
      for (const side of [-1, 1]) {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(overhang * 1.0, 0.075, 0.055), rafterMat);
        tail.position.set(side * (halfSpan - overhang * 0.55), -0.3, z);
        tail.rotation.z = -side * angle;
        tail.castShadow = true;
        group.add(tail);
      }
    }
  }

  // verge / barge boards down the rake of each gable, so the sheet edge is capped
  if (bargeBoards) {
    for (const z of [-depth / 2 - overhang, depth / 2 + overhang]) {
      for (const side of [-1, 1]) {
        const board = new THREE.Mesh(new THREE.BoxGeometry(slopeLength, 0.19, 0.055), material);
        board.position.set((side * halfSpan) / 2, rise / 2 + 0.04, z);
        board.rotation.z = -side * angle;
        group.add(board);
      }
    }
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

  // louvred vent in each gable: the triangle of wall above the eaves is
  // otherwise dead flat, and this is where the hot air leaves the house
  if (gableVent) {
    const ventMat = sharedMaterial(
      "gablevent",
      () => new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#5b4a38"), roughness: 0.9 })
    );
    const darkMat = sharedMaterial(
      "windowreveal",
      () => new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.9 })
    );
    for (const z of [-depth / 2 - 0.012, depth / 2 + 0.012]) {
      const facing = z > 0 ? 1 : -1;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.03), darkMat);
      back.position.set(0, rise * 0.42, z);
      group.add(back);
      for (let i = 0; i < 6; i++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.055, 0.045), ventMat);
        slat.position.set(0, rise * 0.42 - 0.21 + i * 0.084, z + facing * 0.025);
        slat.rotation.x = facing * 0.5;
        group.add(slat);
      }
      for (const y of [rise * 0.42 - 0.27, rise * 0.42 + 0.27]) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.06, 0.05), ventMat);
        trim.position.set(0, y, z + facing * 0.02);
        group.add(trim);
      }
    }
  }

  if (ridgeAlong === "x") group.rotation.y = Math.PI / 2;
  return group;
}

/* ----------------------------------------------------------------- openings */
/** Recessed window: dark glass, frame, sill, mullions, optional louvres. */
/**
 * Hip roof — four slopes and no gables, the shape of every provincial capitol
 * and every barangay hall worth the name. The ridge is inset by the half-depth
 * so all four pitches match, and the sheets carry corrugated UVs running down
 * the slope rather than across it.
 */
export function hipRoof({
  width = 10,
  depth = 8,
  rise = 3,
  overhang = 0.9,
  material = null,
  fasciaMaterial = null,
  ridgeCap = true,
  uvScale = 1.6,
} = {}) {
  const g = new THREE.Group();
  const mat =
    material ??
    sharedMaterial("hiproof", () =>
      new THREE.MeshStandardMaterial({ map: TEX.corrugated(6, "#87938b"), roughness: 0.7, metalness: 0.2 })
    );
  const hw = width / 2 + overhang;
  const hd = depth / 2 + overhang;
  const rx = Math.max(0.6, hw - hd); // ridge half-length: equal pitch in plan

  const A = new THREE.Vector3(-hw, 0, hd); // front left eave
  const B = new THREE.Vector3(hw, 0, hd); // front right eave
  const C = new THREE.Vector3(hw, 0, -hd); // back right eave
  const Dc = new THREE.Vector3(-hw, 0, -hd); // back left eave
  const E = new THREE.Vector3(-rx, rise, 0); // ridge, left
  const F = new THREE.Vector3(rx, rise, 0); // ridge, right

  const faces = [
    { pts: [A, B, F, E], u: new THREE.Vector3(1, 0, 0) },
    { pts: [C, Dc, E, F], u: new THREE.Vector3(-1, 0, 0) },
    { pts: [B, C, F], u: new THREE.Vector3(0, 0, -1) },
    { pts: [Dc, A, E], u: new THREE.Vector3(0, 0, 1) },
  ];

  const positions = [];
  const uvs = [];
  const emit = (p, u) => {
    positions.push(p.x, p.y, p.z);
    uvs.push(p.dot(u) / uvScale, (rise - p.y) / uvScale);
  };
  for (const face of faces) {
    for (let i = 1; i < face.pts.length - 1; i++) {
      emit(face.pts[0], face.u);
      emit(face.pts[i], face.u);
      emit(face.pts[i + 1], face.u);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  const roof = new THREE.Mesh(geo, mat);
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);

  const trimMat =
    fasciaMaterial ??
    sharedMaterial("hiproof-trim", () => new THREE.MeshStandardMaterial({ color: 0xcac4b4, roughness: 0.95 }));

  // soffit so the roof is a roof and not a hole when you stand under the eaves
  const soffit = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hd * 2), trimMat);
  soffit.rotation.x = Math.PI / 2;
  soffit.position.y = -0.03;
  g.add(soffit);

  // fascia boards around the eave line
  const board = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), trimMat);
    m.position.set(x, 0.03, z);
    g.add(m);
  };
  board(hw * 2 + 0.06, 0.07, 0, hd);
  board(hw * 2 + 0.06, 0.07, 0, -hd);
  board(0.07, hd * 2, hw, 0);
  board(0.07, hd * 2, -hw, 0);

  if (ridgeCap) {
    const capMat = sharedMaterial("hiproof-cap", () =>
      new THREE.MeshStandardMaterial({ map: TEX.corrugated(2, "#6f7a73"), roughness: 0.6, metalness: 0.3 })
    );
    const cap = new THREE.Mesh(new THREE.BoxGeometry(rx * 2 + 0.3, 0.16, 0.34), capMat);
    cap.position.y = rise + 0.02;
    g.add(cap);
    for (const sx of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.2, 4), capMat);
      end.rotation.y = Math.PI / 4;
      end.position.set(sx * (rx + 0.12), rise + 0.02, 0);
      g.add(end);
    }
  }

  g.userData.ridgeHalfLength = rx;
  return g;
}

export function windowUnit({
  width = 1.1,
  height = 1.2,
  sill = true,
  louvres = false,
  glassOut = null,
  glassMaterial = null,
  frameColor = 0xf0ece0,
  mullions = true,
  shutters = false,
  shutterColor = "#3c5a46",
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

  // glazing bars: the cross that turns a pane into the six-light sash you see on
  // every concrete house in the province
  if (mullions) {
    // same paint as the frame, so the bars cost no extra draw call
    const bar = frameMat;
    for (const y of [-height * 0.18, height * 0.18]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.03, 0.03), bar);
      h.position.set(0, y, 0.055);
      g.add(h);
    }
    for (const x of [-width * 0.22, width * 0.22]) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.03, height * 0.94, 0.03), bar);
      v.position.set(x, 0, 0.055);
      g.add(v);
    }
  }

  // timber shutters, folded flat against the wall on either side of the opening
  if (shutters) {
    const leafMat = sharedMaterial(
      `shutter:${shutterColor}`,
      () => new THREE.MeshStandardMaterial({ map: TEX.wood(1, shutterColor), roughness: 0.9 })
    );
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(width * 0.46, height * 0.96, 0.045), leafMat);
      leaf.position.set(side * (width / 2 + width * 0.24), 0, 0.05);
      leaf.castShadow = true;
      g.add(leaf);
      // two stiles and a brace per leaf
      for (const y of [-height * 0.38, height * 0.38]) {
        const stile = new THREE.Mesh(new THREE.BoxGeometry(width * 0.42, 0.05, 0.012), leafMat);
        stile.position.set(side * (width / 2 + width * 0.24), y, 0.078);
        g.add(stile);
      }
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, height * 0.9, 0.012), leafMat);
      strap.position.set(side * (width / 2 + width * 0.24) + side * width * 0.19, 0, 0.078);
      g.add(strap);
    }
  }

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

/**
 * Ventanilla — the slatted vent band that sits under a window on old provincial
 * houses, letting air through while keeping the rain out.
 */
export function ventanilla({ width = 1.6, height = 0.34, slats = 7, frameColor = 0xf0ece0 } = {}) {
  const g = new THREE.Group();
  const frameMat = sharedMaterial(
    `ventframe:${frameColor}`,
    () => new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.8 })
  );
  const slatMat = sharedMaterial(
    "ventslat",
    () => new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#6a5136"), roughness: 0.9 })
  );
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.05),
    sharedMaterial("windowreveal", () => new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.9 }))
  );
  back.position.z = -0.03;
  g.add(back);
  for (const y of [-height / 2, height / 2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.06, 0.09), frameMat);
    rail.position.set(0, y, 0.02);
    g.add(rail);
  }
  for (const x of [-width / 2, width / 2]) {
    const stile = new THREE.Mesh(new THREE.BoxGeometry(0.06, height, 0.09), frameMat);
    stile.position.set(x, 0, 0.02);
    g.add(stile);
  }
  for (let i = 1; i < slats; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(width * 0.97, 0.045, 0.085), slatMat);
    slat.position.set(0, -height / 2 + (i * height) / slats, 0.015);
    slat.rotation.x = 0.62;
    g.add(slat);
  }
  return g;
}

/**
 * A run of galvanised gutter with brackets, ending in a downpipe. Returns the
 * group plus the downpipe's local x so a drum can be stood under it.
 */
export function rainGutter({ length = 4, drop = 2.6, material = null, endX = null } = {}) {
  const group = new THREE.Group();
  const metal = material ??
    sharedMaterial("guttermtl", () => new THREE.MeshStandardMaterial({ color: 0x9aa19c, roughness: 0.5, metalness: 0.55 }));
  const trough = new THREE.Mesh(new THREE.BoxGeometry(length, 0.11, 0.13), metal);
  trough.position.set(0, 0, 0);
  group.add(trough);
  // a lip on the outer edge reads as a folded sheet rather than a bar
  const lip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.03, 0.03), metal);
  lip.position.set(0, 0.065, 0.065);
  group.add(lip);
  const brackets = Math.max(2, Math.round(length / 0.9));
  for (let i = 0; i < brackets; i++) {
    const x = -length / 2 + (i + 0.5) * (length / brackets);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.2), metal);
    bracket.position.set(x, -0.06, 0);
    group.add(bracket);
  }
  const x = endX ?? length / 2 - 0.12;
  const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 10), metal);
  elbow.position.set(x, -0.12, 0.02);
  group.add(elbow);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, drop, 10), metal);
  pipe.position.set(x, -0.2 - drop / 2, 0.02);
  group.add(pipe);
  for (const y of [-0.6, -drop * 0.55]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.1), metal);
    strap.position.set(x, y, 0.02);
    group.add(strap);
  }
  group.userData.downpipe = { x, z: 0.02, bottom: -0.2 - drop };
  return group;
}

/** A ribbed steel drum, the rain catchment that stands under every downpipe. */
export function waterDrum({ radius = 0.29, height = 0.82, color = 0x4c6b7a } = {}) {
  const g = new THREE.Group();
  const body = sharedMaterial(
    `drum:${color}`,
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 })
  );
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.96, height, 16), body);
  shell.position.y = height / 2;
  shell.castShadow = true;
  g.add(shell);
  for (const y of [height * 0.28, height * 0.62]) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.01, 0.018, 6, 18), body);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = y;
    g.add(rib);
  }
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.05, 16), body);
  lid.position.y = height + 0.02;
  g.add(lid);
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

/**
 * A porch bench — four legs, an apron, a slatted seat and a slatted back, so it
 * reads as joinery instead of a table with two legs. The back is on local -z,
 * which is the side that goes against the house wall.
 */
export function porchBench({
  length = 1.7,
  depth = 0.46,
  seatHeight = 0.43,
  material = null,
} = {}) {
  const g = new THREE.Group();
  const wood = material ??
    sharedMaterial(
      "benchwood",
      () => new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#8a6a45"), roughness: 0.9 })
    );
  const seat = new THREE.Mesh(new THREE.BoxGeometry(length, 0.035, depth * 0.86), wood);
  seat.position.set(0, seatHeight, 0.05);
  seat.castShadow = true;
  g.add(seat);
  // two seat boards laid side by side, with a shadow gap between them
  for (const z of [-depth * 0.28, depth * 0.36]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(length * 0.99, 0.03, depth * 0.3), wood);
    board.position.set(0, seatHeight + 0.03, z + 0.05);
    g.add(board);
  }
  // legs
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.055, seatHeight, 0.055), wood);
      leg.position.set(sx * (length / 2 - 0.06), seatHeight / 2, 0.05 + sz * (depth / 2 - 0.07));
      leg.castShadow = true;
      g.add(leg);
    }
  }
  // apron rails tying the legs together
  for (const sz of [-1, 1]) {
    const apron = new THREE.Mesh(new THREE.BoxGeometry(length - 0.12, 0.06, 0.03), wood);
    apron.position.set(0, seatHeight - 0.055, 0.05 + sz * (depth / 2 - 0.07));
    g.add(apron);
  }
  // back: two uprights, three slats, leaned back a little
  const backH = 0.52;
  const lean = 0.12;
  for (const sx of [-1, 1]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.05, backH, 0.05), wood);
    upright.position.set(sx * (length / 2 - 0.06), seatHeight + backH / 2 - 0.02, -depth / 2 + 0.06);
    upright.rotation.x = -lean;
    g.add(upright);
  }
  for (const t of [0.18, 0.52, 0.86]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(length - 0.1, 0.085, 0.028), wood);
    slat.position.set(0, seatHeight + backH * t - 0.02, -depth / 2 + 0.06 - (t - 0.5) * backH * lean);
    slat.rotation.x = -lean;
    g.add(slat);
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
  radialSteps = 56,
  segments = 184,
  seed = 2024,
  grassColor = 0x5c6a3c,
  hillColor = 0x3d4b2c,
  rockColor = 0x6a6d68,
  sedimentColor = 0x6d6a4e,
  hazeColor = 0xa9b8c2,
  centerZ = -110,
  volcano = { x: 150, z: -900, height: 350, radius: 285, crater: 0.13 },
} = {}) {
  const noise = makeNoise(seed);
  const pos = [];
  const colors = [];
  const idx = [];
  const cGrass = new THREE.Color(grassColor);
  const cHill = new THREE.Color(hillColor);
  const cRock = new THREE.Color(rockColor);
  const cSediment = new THREE.Color(sedimentColor);
  const cHaze = new THREE.Color(hazeColor);
  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();

  /**
   * Ridged noise: folding fbm through 1-|2n-1| turns rounded hills into sharp
   * crests, and the domain warp stops the crests reading as parallel ridges.
   */
  const crest = (x, z, freq, octaves) => {
    const wx = x + (noise(x * 0.0019, z * 0.0019) - 0.5) * 190;
    const wz = z + (noise(z * 0.0019 + 13.7, x * 0.0019 + 5.1) - 0.5) * 190;
    const n = noise.fbm(wx * freq, wz * freq, octaves);
    return 1 - Math.abs(2 * n - 1);
  };

  /** The landmark cone: gullied flanks, a notched summit and a raised rim. */
  const volcanoAt = (x, z) => {
    if (!volcano) return 0;
    const dx = x - volcano.x;
    const dz = z - volcano.z;
    const d = Math.hypot(dx, dz);
    if (d > volcano.radius) return 0;
    const flank = 1 - d / volcano.radius;
    const a = Math.atan2(dz, dx) * 5.4;
    // radial gullies, carved deeper near the base
    const gullies = (noise.fbm(Math.cos(a) * 3.1 + 7, Math.sin(a) * 3.1 + 2, 3) - 0.5) * 0.13;
    const cone = volcano.height * Math.pow(flank, 1.42) * (1 + gullies * (1 - flank * 0.4));
    const craterR = volcano.radius * volcano.crater;
    const notch = volcano.height * 0.14 * Math.exp(-Math.pow(d / craterR, 2));
    const rim = volcano.height * 0.045 * Math.exp(-Math.pow((d - craterR * 1.25) / (craterR * 1.4), 2));
    return Math.max(0, cone - notch + rim);
  };

  /**
   * The range noise is damped inside the volcano's footprint, otherwise the
   * fbm crests eat the cone and the landmark disappears into the ridge line.
   */
  const rangeMask = (x, z) => {
    if (!volcano) return 1;
    const d = Math.hypot(x - volcano.x, z - volcano.z);
    const w = 1 - THREE.MathUtils.smoothstep(d, volcano.radius * 0.35, volcano.radius * 1.15);
    return 1 - 0.95 * w;
  };

  const heightAt = (x, z, r) => {
    const t = THREE.MathUtils.smoothstep(r, innerRadius, innerRadius + 220);
    // paddies give way to rolling pasture, then the range proper
    const rolling = noise.fbm(x * 0.0042, z * 0.0042, 4) * 42 * t;
    const rangeT = THREE.MathUtils.smoothstep(r, 470, 880);
    const mask = rangeMask(x, z);
    const peaks = Math.pow(crest(x, z, 0.00155, 4), 1.75) * 200 * rangeT * mask;
    const secondLine = Math.pow(crest(x + 260, z - 140, 0.0031, 3), 2.1) * 78 * rangeT * mask;
    const grain = (noise.fbm(x * 0.0062, z * 0.0062, 3) - 0.5) * 26 * rangeT * (0.3 + 0.7 * mask);
    // max() rather than sum: the cone has to win where it is taller, and its
    // base has to disappear into the range instead of sitting in a moat
    return rolling + Math.max(peaks + secondLine + grain, volcanoAt(x, z));
  };

  for (let i = 0; i <= radialSteps; i++) {
    // log spacing: dense near the village, coarse at the horizon
    const t = i / radialSteps;
    const r = innerRadius + (outerRadius - innerRadius) * Math.pow(t, 1.9);
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r + centerZ;
      const y = heightAt(x, z, r);
      pos.push(x, y, z);

      // --- slope, from finite differences, so crags read as rock and valleys
      //     as silt rather than every peak getting the same tint
      const e = 5;
      const gx = (heightAt(x + e, z, r) - heightAt(x - e, z, r)) / (2 * e);
      const gz = (heightAt(x, z + e, r) - heightAt(x, z - e, r)) / (2 * e);
      const slope = Math.hypot(gx, gz);
      const mottle = noise.fbm(x * 0.018, z * 0.018, 2);

      tmp.copy(cGrass).lerp(cHill, THREE.MathUtils.smoothstep(y, 3, 60));
      tmp.lerp(cSediment, THREE.MathUtils.smoothstep(mottle, 0.62, 0.9) * 0.35 * (1 - THREE.MathUtils.smoothstep(y, 90, 160)));
      tmp.lerp(cRock, THREE.MathUtils.smoothstep(slope, 0.5, 1.15));
      tmp.lerp(cRock, THREE.MathUtils.smoothstep(y, 150, 265) * 0.55);
      // forest speckle on the sheltered mid slopes: reads as canopy at distance
      tmp2.copy(cHill).multiplyScalar(0.78);
      tmp.lerp(tmp2, THREE.MathUtils.smoothstep(mottle, 0.45, 0.8) * (1 - THREE.MathUtils.smoothstep(slope, 0.55, 1)) * 0.5);
      // aerial perspective, so the far crests sit behind the near ones
      tmp.lerp(cHaze, THREE.MathUtils.smoothstep(r, 560, 990) * 0.62);
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
  mesh.name = "horizonTerrain";
  mesh.userData.volcano = volcano;
  return mesh;
}
