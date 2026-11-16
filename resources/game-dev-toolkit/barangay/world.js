/**
 * world.js — Barangay Kabudoy: terrain, the long banana-lined approach, the
 * barangay hall, the paddy and corn fields, sky, weather and the 24-hour clock.
 *
 * The hall sits at HALL_Z, roughly twice as far as the previous build (z=-140),
 * with the puno ng saging (banana) grove lining the whole approach on both
 * sides of the road. Road, terrain, playable bounds, fog and the grove all
 * extend together so the walk stays seamless.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as TEX from "./textures.js";

export const LAYOUT = {
  startZ: 14,
  roadWidth: 7.2,
  roadStartZ: 74,
  roadEndZ: -292,
  hallZ: -280,
  hallWidth: 24,
  hallDepth: 16,
  groveStartZ: -46,
  groveEndZ: -252,
  playMinX: -48,
  playMaxX: 48,
  playMinZ: -288,
  playMaxZ: 58,
  // buildings get a tree-free apron so their doors, counters and benches stay
  // walkable. Mirrors the positions used in places.js.
  clearings: [
    { x: 10.5, z: -6, r: 8.5, label: "sari-sari store" },
    { x: -11, z: 18, r: 9.0, label: "ernie's house" },
  ],
};

const rngFactory = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/* --------------------------------------------------------------- sky + clock */
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 sunColor;
  uniform vec3 sunDir;
  uniform float sunGlow;
  void main() {
    vec3 d = normalize(vDir);
    float up = max(d.y, 0.0);
    vec3 col = mix(horizonColor, topColor, pow(up, 0.55));
    float sun = pow(max(dot(d, normalize(sunDir)), 0.0), 350.0);
    float halo = pow(max(dot(d, normalize(sunDir)), 0.0), 8.0) * 0.10;
    col += sunColor * (sun * 3.0 + halo) * sunGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class WorldClock {
  /** minutes since midnight; one real second = one in-game minute */
  constructor(hours = 17.5, minutesPerSecond = 1) {
    this.minutes = hours * 60;
    this.rate = minutesPerSecond;
    this.paused = false;
    this.hourListeners = [];
    this.lastHour = Math.floor(hours);
  }
  advance(dt) {
    if (this.paused) return;
    this.minutes = (this.minutes + dt * this.rate) % 1440;
    const h = Math.floor(this.minutes / 60);
    if (h !== this.lastHour) {
      this.lastHour = h;
      for (const fn of this.hourListeners) fn(h, this.hours);
    }
  }
  onHour(fn) {
    this.hourListeners.push(fn);
  }
  get hours() {
    return this.minutes / 60;
  }
  set(hours) {
    this.minutes = ((hours % 24) + 24) % 24 * 60;
    this.lastHour = Math.floor(this.hours);
  }
  format() {
    const total = Math.floor(this.minutes);
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  /** 0 = full night, 1 = full day */
  get daylight() {
    const h = this.hours;
    if (h < 5 || h > 19) return 0;
    if (h < 6.4) return (h - 5) / 1.4;
    if (h > 17.6) return 1 - (h - 17.6) / 1.4;
    return 1;
  }
}

/* ------------------------------------------------------------------- helpers */
/**
 * A gable roof. `width` is the span the two slopes cover (perpendicular to the
 * ridge), `depth` is the length of the ridge.
 *
 * The slopes must drop away from the ridge: a box lying along X tilts the +X end
 * UP when rotated by +angle, so the +X slope needs -angle. Getting that sign
 * backwards produces a V (a butterfly roof) with the gable triangles sticking
 * through it.
 *
 * `ridgeAlong` orients the finished roof: "z" leaves the ridge on Z (gable ends
 * facing front/back), "x" turns it so the ridge runs along X (gable ends on the
 * short sides, which is how the hall is roofed).
 */
export function gableRoof(
  width,
  depth,
  rise,
  material,
  overhang = 0.5,
  ridgeAlong = "z",
  gableMaterial = null
) {
  const group = new THREE.Group();
  const halfSpan = width / 2 + overhang;
  const slope = Math.sqrt(halfSpan * halfSpan + rise * rise);
  const angle = Math.atan2(rise, halfSpan);
  const ridgeLength = depth + overhang * 2;

  for (const side of [-1, 1]) {
    const plane = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.12, ridgeLength), material);
    // ridge end high, eave end low
    plane.rotation.z = -side * angle;
    plane.position.set((side * halfSpan) / 2, rise / 2, 0);
    plane.castShadow = true;
    plane.receiveShadow = true;
    group.add(plane);
  }

  // ridge cap
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, ridgeLength), material);
  ridge.position.y = rise;
  group.add(ridge);

  // gable ends: triangles that close the space under the rake
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

function framedWindow(w, h, glassEmissive) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.75 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1a2430,
    roughness: 0.22,
    metalness: 0.1,
    emissive: new THREE.Color(0xffca7a),
    emissiveIntensity: 0,
  });
  glassMat.userData.isWindow = true;
  glassEmissive.push(glassMat);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat);
  glass.position.z = 0.06;
  g.add(glass);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.09, 0.09), frameMat);
  bar.position.y = h / 2;
  const bar2 = bar.clone();
  bar2.position.y = -h / 2;
  const barV = new THREE.Mesh(new THREE.BoxGeometry(0.09, h + 0.16, 0.09), frameMat);
  barV.position.x = -w / 2;
  const barV2 = barV.clone();
  barV2.position.x = w / 2;
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.06), frameMat);
  g.add(bar, bar2, barV, barV2, mullion);
  return g;
}

/* --------------------------------------------------------------- banana trees */
/**
 * One banana leaf as a curved, folded blade lying along +Z with its base at the
 * origin. Width tapers to the tip so it reads as a banana rather than a paddle.
 */
function bananaLeafGeometry({ length = 2.1, width = 0.5, fold = 0.42, segsL = 12, segsW = 5 }) {
  const pos = [];
  const uvs = [];
  const idx = [];
  for (let i = 0; i <= segsL; i++) {
    const t = i / segsL;
    const taper = Math.sin(Math.PI * Math.pow(t, 0.62)) * (1 - 0.12 * t);
    // small notches make the edge look wind-shredded
    const shred = 1 + 0.07 * Math.sin(t * 34);
    const halfW = width * taper * shred * 0.5;
    const y = length * (0.92 * t - 1.02 * t * t * 0.85);
    for (let j = 0; j <= segsW; j++) {
      const s = (j / segsW) * 2 - 1;
      const x = s * halfW;
      const droop = s * s * halfW * fold;
      pos.push(x, y - droop, t * length);
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

/** A whole plant: a slightly bent trunk plus a crown of leaves, as one geometry each. */
function bananaPlantGeometry(seed) {
  const r = rngFactory(seed);
  const trunkH = 1.5 + r() * 1.25;
  const bend = (r() - 0.5) * 0.34;

  const trunkGeo = new THREE.CylinderGeometry(0.075, 0.19, trunkH, 7, 5, false);
  {
    const p = trunkGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = (y + trunkH / 2) / trunkH;
      p.setX(i, p.getX(i) + bend * t * t);
    }
    trunkGeo.computeVertexNormals();
  }
  trunkGeo.translate(bend, trunkH / 2, 0);

  const leafCount = 7 + Math.floor(r() * 3);
  const leaves = [];
  for (let i = 0; i < leafCount; i++) {
    const leaf = bananaLeafGeometry({
      length: 1.55 + r() * 0.95,
      width: 0.34 + r() * 0.3,
      fold: 0.3 + r() * 0.3,
      segsL: 10,
      segsW: 4,
    });
    const azimuth = (i / leafCount) * Math.PI * 2 + r() * 0.5;
    const tilt = -0.12 - r() * 0.85; // negative = splaying downward
    const roll = (r() - 0.5) * 0.5;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, azimuth, roll, "YXZ"));
    m.compose(new THREE.Vector3(bend, trunkH - r() * 0.12, 0), q, new THREE.Vector3(1, 1, 1));
    leaf.applyMatrix4(m);
    leaves.push(leaf);
  }
  const leafGeo = mergeGeometries(leaves, false);
  leaves.forEach((g) => g.dispose());
  return { trunkGeo, leafGeo, trunkH };
}

function buildGrove(scene, colliders) {
  const r = rngFactory(90210);
  const variants = [bananaPlantGeometry(11), bananaPlantGeometry(23), bananaPlantGeometry(37)];

  const placements = [[], [], []];
  const inClearing = (x, z) =>
    LAYOUT.clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
  const place = (x, z, scale) => {
    if (inClearing(x, z)) return;
    const v = Math.floor(r() * variants.length);
    placements[v].push({ x, z, rot: r() * Math.PI * 2, scale });
  };

  // 1. the lined rows: banana plants right along both shoulders of the road,
  //    the whole way from the edge of the houses to the hall lawn.
  for (let z = LAYOUT.groveStartZ; z >= LAYOUT.groveEndZ; z -= 4.1) {
    for (const side of [-1, 1]) {
      if (r() < 0.08) continue; // occasional gap so it does not look stamped
      const x = side * (5.5 + r() * 2.2);
      place(x, z + (r() - 0.5) * 1.4, 0.9 + r() * 0.35);
    }
  }
  // 2. depth: scattered groves behind the rows, both sides
  for (let i = 0; i < 190; i++) {
    const z = LAYOUT.groveStartZ - r() * (LAYOUT.groveStartZ - LAYOUT.groveEndZ);
    const side = r() < 0.5 ? -1 : 1;
    const x = side * (8.5 + Math.pow(r(), 0.7) * 34);
    if (Math.abs(x) > 45) continue;
    place(x, z, 0.75 + r() * 0.55);
  }

  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x93a05a,
    roughness: 0.95,
    flatShading: true,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    map: TEX.bananaLeaf(),
    color: 0xdfe8c8,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });

  const dummy = new THREE.Object3D();
  placements.forEach((list, vi) => {
    if (!list.length) return;
    const { trunkGeo, leafGeo } = variants[vi];
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, list.length);
    list.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);
    });
    trunks.castShadow = true;
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    scene.add(trunks, leaves);
  });

  // only trunks near the road get colliders; the grove is scenery otherwise
  const near = placements.flat().filter((p) => Math.abs(p.x) < 9);
  for (const p of near) {
    colliders.push({ half: [0.22, 1.4, 0.22], pos: [p.x, 1.4, p.z], tag: "banana" });
  }
  return placements.reduce((n, l) => n + l.length, 0);
}

/* --------------------------------------------------------------- fields */
function tuftGeometry() {
  // three crossed tapered blades
  const geos = [];
  for (let i = 0; i < 3; i++) {
    const shape = new THREE.BufferGeometry();
    const a = 0.045;
    const h = 0.55;
    shape.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-a, 0, 0, a, 0, 0, a * 0.25, h, 0, -a, 0, 0, a * 0.25, h, 0, -a * 0.25, h, 0], 3)
    );
    shape.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    shape.computeVertexNormals();
    const m = new THREE.Matrix4().makeRotationY((i * Math.PI) / 3);
    shape.applyMatrix4(m);
    geos.push(shape);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
}

function buildFields(scene) {
  const r = rngFactory(4242);
  const mudMat = new THREE.MeshStandardMaterial({ map: TEX.mud(), roughness: 0.95 });
  const riceMat = new THREE.MeshStandardMaterial({ color: 0x6f8c3a, roughness: 0.9, side: THREE.DoubleSide });
  const tuft = tuftGeometry();

  const plots = [
    { x: -30, z: -70, w: 30, d: 44 },
    { x: -34, z: -130, w: 34, d: 52 },
    { x: -30, z: -196, w: 30, d: 40 },
    { x: 32, z: -96, w: 32, d: 46 },
    { x: 34, z: -168, w: 34, d: 50 },
  ];
  const instances = [];
  for (const p of plots) {
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d), mudMat);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(p.x, 0.035, p.z);
    bed.receiveShadow = true;
    scene.add(bed);
    // bunds
    const bundMat = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 1 });
    for (const [dx, dz, bw, bd] of [
      [0, p.d / 2, p.w + 1, 0.7],
      [0, -p.d / 2, p.w + 1, 0.7],
      [p.w / 2, 0, 0.7, p.d],
      [-p.w / 2, 0, 0.7, p.d],
    ]) {
      const bund = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.22, bd), bundMat);
      bund.position.set(p.x + dx, 0.11, p.z + dz);
      bund.receiveShadow = true;
      scene.add(bund);
    }
    // rows of rice
    const rows = Math.floor(p.d / 0.85);
    const cols = Math.floor(p.w / 0.85);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (r() < 0.06) continue;
        instances.push({
          x: p.x - p.w / 2 + 0.6 + j * 0.85 + (r() - 0.5) * 0.18,
          z: p.z - p.d / 2 + 0.6 + i * 0.85 + (r() - 0.5) * 0.18,
          s: 0.75 + r() * 0.5,
          rot: r() * 6.28,
        });
      }
    }
  }
  const rice = new THREE.InstancedMesh(tuft, riceMat, instances.length);
  const dummy = new THREE.Object3D();
  instances.forEach((p, i) => {
    dummy.position.set(p.x, 0.02, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    rice.setMatrixAt(i, dummy.matrix);
  });
  rice.instanceMatrix.needsUpdate = true;
  rice.castShadow = false;
  scene.add(rice);

  // a cornfield on the near right, tall enough to hide things
  const cornPlot = { x: 26, z: -38, w: 22, d: 26 };
  const cornStalk = new THREE.CylinderGeometry(0.022, 0.035, 1.75, 5, 1);
  cornStalk.translate(0, 0.875, 0);
  const cornMat = new THREE.MeshStandardMaterial({ color: 0x7f9a45, roughness: 0.9 });
  const corn = [];
  for (let i = 0; i < 900; i++) {
    corn.push({
      x: cornPlot.x - cornPlot.w / 2 + r() * cornPlot.w,
      z: cornPlot.z - cornPlot.d / 2 + r() * cornPlot.d,
      s: 0.8 + r() * 0.45,
    });
  }
  const cornMesh = new THREE.InstancedMesh(cornStalk, cornMat, corn.length);
  corn.forEach((c, i) => {
    dummy.position.set(c.x, 0, c.z);
    dummy.rotation.set(0, r() * 6.28, 0);
    dummy.scale.set(c.s, c.s, c.s);
    dummy.updateMatrix();
    cornMesh.setMatrixAt(i, dummy.matrix);
  });
  cornMesh.instanceMatrix.needsUpdate = true;
  scene.add(cornMesh);

  return { riceCount: instances.length, cornCount: corn.length };
}

/* ------------------------------------------------------------------ houses */
export function buildHouse(opts = {}) {
  const {
    width = 7,
    depth = 6,
    storeys = 1,
    roof = "corrugated",
    wallColor = 0xd9d2c2,
    trimColor = 0x2a4a6a,
    seed = 1,
  } = opts;
  const r = rngFactory(seed);
  const group = new THREE.Group();
  const wallH = storeys === 2 ? 5.6 : 3.0;
  const wallMat = new THREE.MeshStandardMaterial({ map: TEX.plaster(2), color: wallColor, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.8 });
  const roofMat =
    roof === "nipa"
      ? new THREE.MeshStandardMaterial({ map: TEX.nipa(3), roughness: 0.95 })
      : new THREE.MeshStandardMaterial({ map: TEX.corrugated(4), roughness: 0.7, metalness: 0.15 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, wallH, depth), wallMat);
  body.position.y = wallH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.35, depth + 0.5), new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 1 }));
  plinth.position.y = 0.17;
  plinth.receiveShadow = true;
  group.add(plinth);

  const rise = Math.min(2.4, width * 0.28 + 0.7);
  const gableMat = new THREE.MeshStandardMaterial({ map: TEX.plaster(2), color: wallColor, roughness: 0.95 });
  // ridge along Z => the gable end faces the road, slopes face the neighbours
  const roofGroup = gableRoof(width, depth, rise, roofMat, 0.55, "z", gableMat);
  roofGroup.position.y = wallH;
  group.add(roofGroup);

  // windows + door on the front (+Z) face
  const glass = [];
  const winW = 1.0;
  const winH = 1.05;
  const cols = Math.max(1, Math.floor(width / 2.6));
  for (let storey = 0; storey < storeys; storey++) {
    for (let i = 0; i < cols; i++) {
      const w = framedWindow(winW, winH, glass);
      w.position.set(
        -width / 2 + (width / (cols + 1)) * (i + 1),
        1.35 + storey * (wallH / storeys),
        depth / 2 + 0.011
      );
      group.add(w);
    }
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.05, 0.1), new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#6b4f33"), roughness: 0.9 }));
  door.position.set(width * 0.22, 1.02, depth / 2 + 0.03);
  group.add(door);

  // a small awning over the door
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.0), roofMat);
  awning.position.set(width * 0.22, 2.35, depth / 2 + 0.5);
  awning.rotation.x = -0.16;
  awning.castShadow = true;
  group.add(awning);

  // clutter: a water jar by the door
  if (r() < 0.8) {
    const jar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.2, 0.62, 10),
      new THREE.MeshStandardMaterial({ color: 0xb5703f, roughness: 0.85 })
    );
    jar.position.set(-width * 0.3, 0.31, depth / 2 + 0.45);
    jar.castShadow = true;
    group.add(jar);
  }

  return { group, glass, colliders: [{ half: [width / 2, wallH / 2 + rise / 2, depth / 2], pos: [0, wallH / 2, 0] }] };
}

/* -------------------------------------------------------------- barangay hall */
function buildHall(scene, colliders) {
  const { hallZ, hallWidth: W, hallDepth: D } = LAYOUT;
  const group = new THREE.Group();
  group.position.set(0, 0, hallZ);
  const wallH = 7.8;
  const glass = [];

  const concreteMat = new THREE.MeshStandardMaterial({ map: TEX.concrete(4), roughness: 0.95 });
  const wallMat = new THREE.MeshStandardMaterial({ map: TEX.plaster(3), color: 0xf1ece0, roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1d3f8f, roughness: 0.7 });
  const roofMat = new THREE.MeshStandardMaterial({ map: TEX.corrugated(6, "#8e6f5a"), roughness: 0.8, metalness: 0.12 });

  // plinth + steps facing the road (+Z)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 3, 0.7, D + 3), concreteMat);
  plinth.position.y = 0.35;
  plinth.receiveShadow = true;
  group.add(plinth);
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(7.5 - i * 0.6, 0.24, 1.1), concreteMat);
    step.position.set(0, 0.12 + i * 0.24, D / 2 + 1.9 - i * 0.55);
    step.receiveShadow = true;
    step.castShadow = true;
    group.add(step);
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(W, wallH, D), wallMat);
  body.position.y = 0.7 + wallH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  colliders.push({ half: [W / 2, wallH / 2 + 0.7, D / 2], pos: [0, wallH / 2 + 0.7, hallZ] });

  // floor band + eaves trim
  const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.36, 0.34, D + 0.36), trimMat);
  band.position.y = 0.7 + wallH * 0.56;
  group.add(band);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(W + 0.28, 0.5, D + 0.28), trimMat);
  skirt.position.y = 0.72;
  group.add(skirt);

  // roof, ridge running across the front so the gable faces the road
  const rise = 3.4;
  const gableMat = new THREE.MeshStandardMaterial({ map: TEX.plaster(3), color: 0xf1ece0, roughness: 0.9 });
  const roofGroup = gableRoof(D, W, rise, roofMat, 0.8, "x", gableMat);
  roofGroup.position.y = 0.7 + wallH;
  group.add(roofGroup);

  // windows: five upstairs, four plus the door downstairs
  const front = D / 2 + 0.02;
  const upperY = 0.7 + wallH * 0.72;
  const lowerY = 0.7 + wallH * 0.28;
  for (let i = 0; i < 5; i++) {
    const w = framedWindow(1.25, 1.3, glass);
    w.position.set(-W / 2 + (W / 6) * (i + 1), upperY, front);
    group.add(w);
  }
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + (W / 5) * (i + 1);
    if (Math.abs(x) < 2.2) continue; // door gap
    const w = framedWindow(1.15, 1.2, glass);
    w.position.set(x, lowerY, front);
    group.add(w);
  }
  // side windows so the hall reads as a building when you walk past it
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const w = framedWindow(1.1, 1.15, glass);
      w.position.set(side * (W / 2 + 0.02), upperY, -D / 2 + (D / 4) * (i + 1));
      w.rotation.y = side * Math.PI / 2;
      group.add(w);
    }
  }

  // main door
  const doorMat = new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#5c3f28"), roughness: 0.85 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.1, 0.16), doorMat);
  door.position.set(0, 0.7 + 1.55, front);
  group.add(door);
  const doorSplit = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.1, 0.2), trimMat);
  doorSplit.position.copy(door.position).setZ(front + 0.02);
  group.add(doorSplit);

  // signboards
  const signTex = TEX.sign("BARANGAY KABUDOY", { size: 104, bg: "#f7f3e6", border: "#1d3f8f", fg: "#12265c" });
  const signPanel = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.85), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 }));
  signPanel.position.set(0, 0.7 + wallH * 0.44, front + 0.05);
  group.add(signPanel);
  const subTex = TEX.sign("TANGGAPAN NG PUNONG BARANGAY", { size: 54, bg: "#12307a", border: "#f7f3e6", fg: "#f7f3e6" });
  const subPanel = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.0), new THREE.MeshStandardMaterial({ map: subTex, roughness: 0.8 }));
  subPanel.position.set(0, 0.7 + wallH * 0.92, front + 0.05);
  group.add(subPanel);

  // flagpole + Philippine flag on the lawn
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xd7d9dc, roughness: 0.4, metalness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 9.5, 10), poleMat);
  pole.position.set(W / 2 + 2.6, 0.7 + 4.75, D / 2 + 2.2);
  pole.castShadow = true;
  group.add(pole);
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.2, 16, 8);
  const flag = new THREE.Mesh(
    flagGeo,
    new THREE.MeshStandardMaterial({ map: TEX.philippineFlag(), side: THREE.DoubleSide, roughness: 0.85 })
  );
  flag.position.set(W / 2 + 2.6 + 1.22, 0.7 + 8.7, D / 2 + 2.2);
  group.add(flag);
  group.userData.flag = flag;
  colliders.push({ half: [0.16, 4.75, 0.16], pos: [W / 2 + 2.6, 4.75 + 0.7, hallZ + D / 2 + 2.2], tag: "flagpole" });

  // night lighting at the entrance
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.6, metalness: 0.4 });
  const lamps = [];
  for (const side of [-1, 1]) {
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), lampMat);
    bracket.rotation.z = Math.PI / 2;
    bracket.position.set(side * (W / 2 + 0.3), 0.7 + wallH * 0.5, front + 0.5);
    group.add(bracket);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: new THREE.Color(0xffd894), emissiveIntensity: 0 })
    );
    bulb.position.set(side * (W / 2 + 0.9), 0.7 + wallH * 0.5, front + 0.5);
    group.add(bulb);
    const light = new THREE.PointLight(0xffd08a, 0, 22, 1.8);
    light.position.copy(bulb.position);
    group.add(light);
    lamps.push({ bulb, light });
  }

  // lawn: a cut-grass patch in front of the hall
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 20, 26),
    new THREE.MeshStandardMaterial({ map: TEX.grass(8), color: 0x93a367, roughness: 1 })
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, 0.03, hallZ + D / 2 + 13);
  lawn.receiveShadow = true;
  scene.add(lawn);

  scene.add(group);
  return { group, glass, lamps, flag };
}

/* -------------------------------------------------------------- hills, sky */
function buildBackdrop(scene) {
  const r = rngFactory(777);
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x53613f, roughness: 1, flatShading: true });
  const hills = [];
  for (let i = 0; i < 42; i++) {
    const angle = (i / 42) * Math.PI * 2 + r() * 0.1;
    const dist = 210 + r() * 260;
    hills.push({
      x: Math.cos(angle) * dist,
      z: -140 + Math.sin(angle) * dist,
      radius: 26 + r() * 60,
      height: 14 + r() * 46,
    });
  }
  const hillGeo = new THREE.ConeGeometry(1, 1, 7, 1);
  const hillMesh = new THREE.InstancedMesh(hillGeo, hillMat, hills.length);
  const dummy = new THREE.Object3D();
  hills.forEach((h, i) => {
    dummy.position.set(h.x, -1, h.z);
    dummy.rotation.set(0, r() * 6.28, 0);
    dummy.scale.set(h.radius, h.height * 2, h.radius);
    dummy.updateMatrix();
    hillMesh.setMatrixAt(i, dummy.matrix);
  });
  hillMesh.instanceMatrix.needsUpdate = true;
  scene.add(hillMesh);

  // mountains behind the hall (north), matching the reference mood
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x4d5a52, roughness: 1, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.ConeGeometry(110 + r() * 70, 80 + r() * 70, 6, 1);
    const m = new THREE.Mesh(geo, mountainMat);
    m.position.set(-260 + i * 105 + r() * 30, -6, -620 - r() * 130);
    m.rotation.y = r() * 6.28;
    scene.add(m);
  }

  // clouds
  const cloudTex = TEX.cloud();
  const clouds = [];
  for (let i = 0; i < 18; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudTex,
      transparent: true,
      opacity: 0.35 + r() * 0.3,
      depthWrite: false,
      fog: false,
      color: 0xffffff,
    });
    const sprite = new THREE.Sprite(mat);
    const scale = 60 + r() * 120;
    sprite.scale.set(scale, scale * 0.5, 1);
    sprite.position.set(-380 + r() * 760, 70 + r() * 70, -60 - r() * 700);
    scene.add(sprite);
    clouds.push({ sprite, speed: 0.9 + r() * 1.6, drift: r() * 100 });
  }

  // stars
  const starCount = 1400;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = r() * Math.PI * 2;
    const phi = Math.acos(r() * 0.95);
    const rad = 820;
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * rad;
    positions[i * 3 + 1] = Math.cos(phi) * rad * 0.9 + 20;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * rad;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xdfe9ff,
    size: 2.1,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  return { hills: hillMesh, clouds, stars, starMat };
}

/* ------------------------------------------------------------------- build */
export function buildWorld(scene, opts = {}) {
  const colliders = [];
  const clock = new WorldClock(opts.startHour ?? 17.5);
  scene.fog = new THREE.Fog(0xcfd8dc, 55, 620);

  /* sky dome */
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x3f74b8) },
    horizonColor: { value: new THREE.Color(0xd7d9d2) },
    sunColor: { value: new THREE.Color(0xffe6b0) },
    sunDir: { value: new THREE.Vector3(0.4, 0.5, -0.6) },
    sunGlow: { value: 1 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 20),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  scene.add(sky);

  /* ground + road */
  const groundMat = new THREE.MeshStandardMaterial({ map: TEX.grass(120), color: 0xc9c7a4, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 980, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -150);
  ground.receiveShadow = true;
  scene.add(ground);

  const roadLength = LAYOUT.roadStartZ - LAYOUT.roadEndZ;
  const roadMat = new THREE.MeshStandardMaterial({ map: TEX.dirtRoad(1), roughness: 1 });
  roadMat.map.repeat.set(1.6, roadLength / 6);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(LAYOUT.roadWidth, roadLength), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, (LAYOUT.roadStartZ + LAYOUT.roadEndZ) / 2);
  road.receiveShadow = true;
  scene.add(road);
  // soft shoulders so the road does not cut the grass with a hard edge
  const shoulderMat = new THREE.MeshStandardMaterial({ map: TEX.mud(), color: 0xb9a98c, roughness: 1 });
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(2.6, roadLength), shoulderMat);
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(side * (LAYOUT.roadWidth / 2 + 1.2), 0.012, road.position.z);
    shoulder.receiveShadow = true;
    scene.add(shoulder);
  }

  const groveCount = buildGrove(scene, colliders);
  const fields = buildFields(scene);
  const hall = buildHall(scene, colliders);
  const backdrop = buildBackdrop(scene);

  /* houses along the road */
  const houses = [];
  const houseSeeds = [
    { z: -58, side: -1, w: 7.6, d: 6.2, storeys: 1, roof: "corrugated", wall: 0xd6cfbe },
    { z: -86, side: 1, w: 6.8, d: 5.8, storeys: 1, roof: "nipa", wall: 0xcfc4a8 },
    { z: -118, side: -1, w: 8.2, d: 6.4, storeys: 2, roof: "corrugated", wall: 0xe0d9c8 },
    { z: -152, side: 1, w: 7.0, d: 6.0, storeys: 1, roof: "corrugated", wall: 0xd2c6a6 },
    { z: -186, side: -1, w: 7.4, d: 6.0, storeys: 1, roof: "nipa", wall: 0xc9bda0 },
    { z: -218, side: 1, w: 8.0, d: 6.2, storeys: 2, roof: "corrugated", wall: 0xdcd5c4 },
    { z: -246, side: -1, w: 6.6, d: 5.6, storeys: 1, roof: "corrugated", wall: 0xd0c8b4 },
  ];
  for (let i = 0; i < houseSeeds.length; i++) {
    const h = houseSeeds[i];
    const { group, glass, colliders: localColliders } = buildHouse({
      width: h.w,
      depth: h.d,
      storeys: h.storeys,
      roof: h.roof,
      wallColor: h.wall,
      seed: 100 + i * 13,
    });
    const x = h.side * (9.5 + (i % 3) * 1.8);
    group.position.set(x, 0, h.z);
    group.rotation.y = h.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(group);
    for (const c of localColliders) {
      const rotate = group.rotation.y;
      const hx = Math.abs(Math.cos(rotate)) * c.half[0] + Math.abs(Math.sin(rotate)) * c.half[2];
      const hz = Math.abs(Math.sin(rotate)) * c.half[0] + Math.abs(Math.cos(rotate)) * c.half[2];
      colliders.push({
        half: [hx, c.half[1], hz],
        pos: [x + c.pos[0] * Math.cos(rotate) + c.pos[2] * Math.sin(rotate), c.pos[1], h.z - c.pos[0] * Math.sin(rotate) + c.pos[2] * Math.cos(rotate)],
        tag: "house",
      });
    }
    houses.push({ group, glass });
  }

  /* lights */
  const hemi = new THREE.HemisphereLight(0x9fc0e8, 0x4a4433, 0.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d0, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 620; // the light sits ~400 units off before it is re-anchored
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const moon = new THREE.DirectionalLight(0x9fb6e0, 0.0);
  scene.add(moon);

  const ambient = new THREE.AmbientLight(0x334455, 0.35);
  scene.add(ambient);

  /* window materials gathered from the hall + houses */
  const windowMats = [...hall.glass, ...houses.flatMap((h) => h.glass)];

  /* gradient / colour helpers */
  const dayTop = new THREE.Color(0x3f74b8);
  const dayHorizon = new THREE.Color(0xd9dcd6);
  const duskTop = new THREE.Color(0x2f4478);
  const duskHorizon = new THREE.Color(0xe0996a);
  const nightTop = new THREE.Color(0x05080f);
  const nightHorizon = new THREE.Color(0x131d2e);
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();

  const state = {
    clock,
    colliders,
    hall,
    houses,
    groveCount,
    fields,
    hemi,
    sun,
    moon,
    ambient,
    sky: skyUniforms,
  };

  const sunPos = new THREE.Vector3();
  const moonPos = new THREE.Vector3();

  function updateLighting() {
    const day = clock.daylight;
    const h = clock.hours;
    // sun arc: rises east (+x) at 06:00, sets west (-x) at 18:00
    const a = ((h - 6) / 12) * Math.PI;
    sunPos.set(Math.cos(a) * 260, Math.sin(a) * 300, -120);
    sun.position.copy(sunPos);
    skyUniforms.sunDir.value.copy(sunPos).normalize();

    const dusk = Math.max(0, 1 - Math.abs(Math.sin(a)) * 3.2) * (day > 0.02 ? 1 : 0);

    // sky colours
    if (day > 0.02) {
      tmpA.copy(dayTop);
      tmpB.copy(duskTop);
      skyUniforms.topColor.value.copy(tmpA.lerp(tmpB, dusk));
      tmpA.copy(dayHorizon);
      tmpB.copy(duskHorizon);
      skyUniforms.horizonColor.value.copy(tmpA.lerp(tmpB, dusk));
    } else {
      tmpA.copy(nightTop);
      tmpB.copy(nightHorizon);
      skyUniforms.topColor.value.copy(tmpA);
      skyUniforms.horizonColor.value.copy(tmpB);
    }
    skyUniforms.sunColor.value.setHex(dusk > 0.4 ? 0xff9a4d : 0xffe9c4);
    skyUniforms.sunGlow.value = Math.max(0, day) * (1 - dusk * 0.35);

    // fog matches the horizon so the far hall dissolves into the haze
    // Long sight lines by day so the hall 280m away reads at the end of the
    // road; at night the fog closes in and the road disappears.
    scene.fog.color.copy(skyUniforms.horizonColor.value).multiplyScalar(0.96);
    scene.fog.near = 40 + day * 55;
    scene.fog.far = 300 + day * 650;

    hemi.intensity = 0.22 + day * 0.72;
    hemi.color.copy(skyUniforms.topColor.value).lerp(new THREE.Color(0xffffff), 0.35);
    ambient.intensity = 0.18 + day * 0.22;

    sun.intensity = day * (2.35 - dusk * 0.5);
    sun.color.setHex(dusk > 0.45 ? 0xffb070 : 0xfff2d8);
    // moon opposite the sun, visible only at night
    const night = 1 - day;
    moonPos.copy(sunPos).multiplyScalar(-1);
    moon.position.copy(moonPos);
    moon.intensity = night * 0.42;
    moon.color.setHex(0xa8bfe8);

    // window glow after dusk
    const glow = THREE.MathUtils.clamp((0.55 - day) / 0.45, 0, 1);
    for (const mat of windowMats) mat.emissiveIntensity = glow * 0.9;
    for (const lamp of hall.lamps) {
      lamp.bulb.material.emissiveIntensity = glow * 1.6;
      lamp.light.intensity = glow * 12;
    }

    backdrop.starMat.opacity = THREE.MathUtils.clamp((0.35 - day) / 0.35, 0, 1) * 0.95;
    backdrop.stars.visible = backdrop.starMat.opacity > 0.01;
    for (const c of backdrop.clouds) {
      c.sprite.material.color.copy(skyUniforms.horizonColor.value).lerp(new THREE.Color(0xffffff), 0.55);
      c.sprite.material.opacity = 0.12 + day * 0.34;
    }

    sky.position.copy(opts.cameraPosition ?? new THREE.Vector3());
  }

  let flagTime = 0;
  const flagPos = hall.flag.geometry.attributes.position;
  const flagBase = Float32Array.from(flagPos.array);

  function update(dt, cameraPosition) {
    clock.advance(dt);
    updateLighting();

    if (cameraPosition) {
      sky.position.set(cameraPosition.x, 0, cameraPosition.z);
      // keep the shadow frustum around the player
      sun.target.position.set(cameraPosition.x, 0, cameraPosition.z);
      sun.position.copy(sunPos).add(new THREE.Vector3(cameraPosition.x, 0, cameraPosition.z));
    }

    for (const c of backdrop.clouds) {
      c.sprite.position.x += c.speed * dt;
      if (c.sprite.position.x > 460) c.sprite.position.x = -460;
    }

    // gentle flag ripple
    flagTime += dt;
    for (let i = 0; i < flagPos.count; i++) {
      const x = flagBase[i * 3];
      const y = flagBase[i * 3 + 1];
      const t = (x + 1.2) / 2.4;
      const wave = Math.sin(flagTime * 2.4 + t * 6.0 + y * 0.7) * 0.14 * t;
      flagPos.setZ(i, flagBase[i * 3 + 2] + wave);
    }
    flagPos.needsUpdate = true;
    hall.flag.geometry.computeVertexNormals();
  }

  updateLighting();

  return Object.assign(state, { update, updateLighting, sun, sky });
}
