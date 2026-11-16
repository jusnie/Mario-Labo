/**
 * world.js — Barangay Kabudoy.
 *
 * Terrain, road, the banana-lined approach, the barangay hall, rice and corn
 * fields, houses, sky and the 24-hour clock.
 *
 * Second modelling pass: the placeholders (plain boxes, 7-sided cone hills,
 * flat triangle grass) are gone. Houses now have plinths, batten siding,
 * recessed windows with sills, panelled doors, porches with balusters, stairs,
 * tapayan jars, potted plants, clotheslines and bamboo fencing. The horizon is
 * a displaced terrain ring with real ridges and mountains, and every roof is a
 * ribbed corrugated sheet with fascia and soffit.
 *
 * The hall sits at z=-280 — roughly twice the old z=-140 — with puno ng saging
 * lining the entire approach.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as TEX from "./textures.js";
import {
  gableRoof,
  hipRoof,
  bladeGeometry,
  bladeClump,
  windowUnit,
  doorUnit,
  post,
  railing,
  stairs,
  jar,
  pottedPlant,
  shrub,
  groundShadow,
  clothesline,
  bambooFence,
  horizonTerrain,
  ventanilla,
  rainGutter,
  waterDrum,
  porchBench,
  mergeStaticGroup,
  makeGlassMaterial,
} from "./models.js";

export { gableRoof, buildHall };

/**
 * Turn the local collider descriptors a builder emits into world-space ones,
 * carrying the group's position and rotation (and composing any rotation the
 * collider itself carries, which the hidden stair ramps need).
 */
export function placeColliders(localColliders, group, tag) {
  group.updateMatrixWorld(true);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  group.matrixWorld.decompose(pos, quat, scale);
  return localColliders.map((c) => {
    const p = new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]).applyMatrix4(group.matrixWorld);
    const out = { half: [...c.half], pos: [p.x, p.y, p.z], tag: c.tag ?? tag };
    const local = c.quat
      ? new THREE.Quaternion(c.quat[0], c.quat[1], c.quat[2], c.quat[3])
      : new THREE.Quaternion();
    const q = quat.clone().multiply(local);
    if (c.quat || Math.abs(q.w) < 0.999999) out.quat = [q.x, q.y, q.z, q.w];
    return out;
  });
}

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
  groundRadius: 200,
  groundCenterZ: -110,
  // buildings get a tree-free apron so doors, counters and benches stay walkable
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

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

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
    this.minutes = (((hours % 24) + 24) % 24) * 60;
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

/* --------------------------------------------------------------- banana trees */
/** One banana plant: a sheathed trunk with a crown of folded, shredded leaves. */
function bananaPlantGeometry(seed) {
  const r = rngFactory(seed);
  const trunkH = 1.5 + r() * 1.25;
  const lean = (r() - 0.5) * 0.3;

  // trunk built from stacked, slightly offset sheaths so it is not a plain tube
  const sheaths = [];
  const sheathCount = 5;
  for (let i = 0; i < sheathCount; i++) {
    const t0 = i / sheathCount;
    const t1 = (i + 1) / sheathCount;
    const h = trunkH / sheathCount;
    const rBottom = THREE.MathUtils.lerp(0.2, 0.085, t0);
    const rTop = THREE.MathUtils.lerp(0.2, 0.085, t1) * 1.06;
    const geo = new THREE.CylinderGeometry(rTop, rBottom, h * 1.06, 8, 1, true);
    geo.translate(lean * t1 * t1, h * (t0 + 0.5), 0);
    sheaths.push(geo);
  }
  const trunkGeo = mergeGeometries(sheaths, false);
  sheaths.forEach((g) => g.dispose());

  const leafCount = 7 + Math.floor(r() * 3);
  const leaves = [];
  for (let i = 0; i < leafCount; i++) {
    const leaf = bladeGeometry({
      length: 1.6 + r() * 1.0,
      width: 0.4 + r() * 0.3,
      curve: 1.05,
      rise: 0.92,
      fold: 0.4 + r() * 0.25,
      shred: 0.06,
      segsL: 11,
      segsW: 4,
    });
    const azimuth = (i / leafCount) * Math.PI * 2 + r() * 0.55;
    const tilt = -0.1 - r() * 0.9;
    const roll = (r() - 0.5) * 0.45;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(lean, trunkH - r() * 0.1, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, azimuth, roll, "YXZ")),
      new THREE.Vector3(1, 1, 1)
    );
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
  const inClearing = (x, z) => LAYOUT.clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
  const place = (x, z, scale) => {
    if (inClearing(x, z)) return;
    const v = Math.floor(r() * variants.length);
    placements[v].push({ x, z, rot: r() * Math.PI * 2, scale });
  };

  // lined rows along both shoulders, the whole way to the hall lawn
  for (let z = LAYOUT.groveStartZ; z >= LAYOUT.groveEndZ; z -= 4.1) {
    for (const side of [-1, 1]) {
      if (r() < 0.08) continue;
      place(side * (5.5 + r() * 2.2), z + (r() - 0.5) * 1.4, 0.9 + r() * 0.35);
    }
  }
  // depth: groves behind the rows
  for (let i = 0; i < 190; i++) {
    const z = LAYOUT.groveStartZ - r() * (LAYOUT.groveStartZ - LAYOUT.groveEndZ);
    const side = r() < 0.5 ? -1 : 1;
    const x = side * (8.5 + Math.pow(r(), 0.7) * 34);
    if (Math.abs(x) > 45) continue;
    place(x, z, 0.75 + r() * 0.55);
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x93a05a, roughness: 0.95, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({
    map: TEX.bananaLeaf(),
    color: 0xdfe8c8,
    roughness: 0.78,
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

  const near = placements.flat().filter((p) => Math.abs(p.x) < 9);
  for (const p of near) colliders.push({ half: [0.22, 1.4, 0.22], pos: [p.x, 1.4, p.z], tag: "banana" });
  return placements.reduce((n, l) => n + l.length, 0);
}

/* ----------------------------------------------------------------- fields */
function buildFields(scene) {
  const r = rngFactory(4242);
  const mudMat = new THREE.MeshStandardMaterial({ map: TEX.mud(), roughness: 0.95 });
  const bundMat = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 1 });
  const riceMat = new THREE.MeshStandardMaterial({
    color: 0x79953f,
    roughness: 0.88,
    side: THREE.DoubleSide,
  });

  // a real rice clump: three curved blades, not three flat triangles
  const riceTuft = bladeClump(
    3,
    { length: 0.52, width: 0.075, curve: 0.95, rise: 1.0, fold: 0.25, segsL: 4, segsW: 1 },
    4242
  );

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
    const rows = Math.floor(p.d / 1.15);
    const cols = Math.floor(p.w / 1.15);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (r() < 0.05) continue;
        instances.push({
          x: p.x - p.w / 2 + 0.7 + j * 1.15 + (r() - 0.5) * 0.2,
          z: p.z - p.d / 2 + 0.7 + i * 1.15 + (r() - 0.5) * 0.2,
          s: 0.8 + r() * 0.5,
          rot: r() * 6.28,
        });
      }
    }
  }
  const rice = new THREE.InstancedMesh(riceTuft, riceMat, instances.length);
  const dummy = new THREE.Object3D();
  instances.forEach((p, i) => {
    dummy.position.set(p.x, 0.02, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.setScalar(p.s);
    dummy.updateMatrix();
    rice.setMatrixAt(i, dummy.matrix);
  });
  rice.instanceMatrix.needsUpdate = true;
  scene.add(rice);

  // corn: stalk plus real leaves, merged so it can be instanced
  const stalk = new THREE.CylinderGeometry(0.022, 0.038, 1.85, 6, 1);
  stalk.translate(0, 0.925, 0);
  const cornParts = [stalk];
  for (let i = 0; i < 5; i++) {
    const leaf = bladeGeometry({
      length: 0.85,
      width: 0.14,
      curve: 1.15,
      rise: 0.7,
      fold: 0.3,
      segsL: 5,
      segsW: 2,
    });
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.35 + i * 0.3, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, (i / 5) * 6.28, 0.2, "YXZ")),
      new THREE.Vector3(1, 1, 1)
    );
    leaf.applyMatrix4(m);
    cornParts.push(leaf);
  }
  const cornGeo = mergeGeometries(cornParts, false);
  cornParts.forEach((g) => g.dispose());
  const cornMat = new THREE.MeshStandardMaterial({
    color: 0x7f9a45,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const cornPlot = { x: 26, z: -38, w: 22, d: 26 };
  const corn = [];
  for (let i = 0; i < 900; i++) {
    corn.push({
      x: cornPlot.x - cornPlot.w / 2 + r() * cornPlot.w,
      z: cornPlot.z - cornPlot.d / 2 + r() * cornPlot.d,
      s: 0.8 + r() * 0.45,
    });
  }
  const cornMesh = new THREE.InstancedMesh(cornGeo, cornMat, corn.length);
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

/* ---------------------------------------------------------------- the house */
/**
 * A proper bahay: plinth, batten siding, recessed windows with sills, a
 * panelled door with a threshold and steps, an awning, a porch with balusters,
 * a ribbed roof with fascia, plus jars, pots, laundry and fencing.
 */
export function buildHouse(opts = {}) {
  const {
    width = 7.6,
    depth = 6.2,
    storeys = 1,
    roof = "corrugated",
    wallColor = 0xd9d2c2,
    trimColor = 0x2a4a6a,
    seed = 1,
    stilted = false,
    porch = true,
    fence = true,
    laundry = true,
  } = opts;
  const r = rngFactory(seed);
  const group = new THREE.Group();
  const glassMat = makeGlassMaterial();
  const glass = [glassMat];
  const colliders = [];
  const shutterColor = r() > 0.5 ? "#3c5a46" : "#5b4632";

  const wallH = storeys === 2 ? 5.6 : 3.05;
  const floorH = stilted ? 1.1 : 0.35;

  const wallMat = new THREE.MeshStandardMaterial({ map: TEX.plaster(2), color: wallColor, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.8 });
  const roofMat =
    roof === "nipa"
      ? new THREE.MeshStandardMaterial({ map: TEX.nipa(3), roughness: 0.95 })
      : new THREE.MeshStandardMaterial({ map: TEX.corrugated(1), roughness: 0.68, metalness: 0.16 });
  const concMat = new THREE.MeshStandardMaterial({ map: TEX.concrete(2), roughness: 1 });

  /* foundation: plinth, or posts under a raised floor */
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, floorH, depth + 0.6), concMat);
  plinth.position.y = floorH / 2;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  group.add(plinth);
  if (stilted) {
    const stiltMat = new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#6a5136"), roughness: 0.95 });
    for (const sx of [-width / 2 + 0.5, 0, width / 2 - 0.5]) {
      for (const sz of [-depth / 2 + 0.5, depth / 2 - 0.5]) {
        const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, floorH + 0.2, 8), stiltMat);
        stilt.position.set(sx, (floorH + 0.2) / 2, sz);
        group.add(stilt);
      }
    }
  }

  /* walls */
  const walls = new THREE.Mesh(new THREE.BoxGeometry(width, wallH, depth), wallMat);
  walls.position.y = floorH + wallH / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  // batten siding: shallow horizontal bands that catch the light
  const battenMat = new THREE.MeshStandardMaterial({
    map: TEX.plaster(2),
    color: new THREE.Color(wallColor).multiplyScalar(0.94),
    roughness: 0.95,
  });
  const bands = Math.floor(wallH / 0.42);
  for (let i = 1; i < bands; i++) {
    for (const [w, d, x, z, ry] of [
      [width + 0.04, 0.05, 0, depth / 2, 0],
      [width + 0.04, 0.05, 0, -depth / 2, 0],
      [0.05, depth + 0.04, width / 2, 0, 0],
      [0.05, depth + 0.04, -width / 2, 0, 0],
    ]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.055, d), battenMat);
      b.position.set(x, floorH + i * 0.42, z);
      group.add(b);
    }
  }

  // corner boards
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const corner = new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH, 0.12), trimMat);
      corner.position.set((sx * width) / 2, floorH + wallH / 2, (sz * depth) / 2);
      group.add(corner);
    }
  }

  /* roof */
  const rise = Math.min(2.5, width * 0.29 + 0.65);
  const gableMat = new THREE.MeshStandardMaterial({ map: TEX.plaster(2), color: wallColor, roughness: 0.95 });
  const roofGroup = gableRoof({
    width,
    depth,
    rise,
    material: roofMat,
    overhang: 0.62,
    ridgeAlong: "z",
    gableMaterial: gableMat,
    ribbed: roof !== "nipa",
    rafters: true,
    bargeBoards: true,
    gableVent: true,
  });
  roofGroup.position.y = floorH + wallH;
  group.add(roofGroup);

  /* windows: two on the front, one per side, plus a ventanilla */
  const winY = floorH + wallH * (storeys === 2 ? 0.28 : 0.58);
  const frontCols = width > 7 ? 2 : 1;
  // The door sits off-centre under the porch, so the front windows get slots
  // measured from the door rather than mirrored across the middle — otherwise
  // a shutter and a door jamb end up inside each other.
  const doorX = -width * 0.26;
  const frontWindowX = frontCols === 2 ? [width * 0.12, width * 0.34] : [width * 0.1];
  for (let i = 0; i < frontCols; i++) {
    const w = windowUnit({
      width: 1.05,
      height: 1.15,
      sill: true,
      louvres: r() > 0.5,
      glassMaterial: glassMat,
      shutters: r() > 0.35,
      shutterColor,
    });
    const wx = frontWindowX[i];
    w.position.set(wx, winY, depth / 2 + 0.02);
    group.add(w);
    // ventanilla band under the window, the old way of moving air through a
    // house whose walls close at dusk
    const vent = ventanilla({ width: 1.3, height: 0.32 });
    vent.position.set(wx, winY - 0.86, depth / 2 + 0.03);
    group.add(vent);
  }
  for (const side of [-1, 1]) {
    const w = windowUnit({ width: 0.9, height: 1.0, sill: true, glassMaterial: glassMat });
    w.position.set(side * (width / 2 + 0.02), winY, 0);
    w.rotation.y = (side * Math.PI) / 2;
    group.add(w);
  }
  // ventanilla above the door
  const vent = windowUnit({ width: 1.0, height: 0.42, sill: false, glassMaterial: glassMat });
  vent.position.set(doorX, floorH + wallH * 0.88, depth / 2 + 0.02);
  group.add(vent);

  /* door + steps + awning */
  const door = doorUnit({ width: 1.02, height: 2.05, color: "#6b4f33" });
  door.position.set(doorX, floorH, depth / 2 + 0.03);
  group.add(door);

  // Steps run DOWN away from the door, with the top tread level with the floor
  // it serves. stairs() climbs toward -z, so they are placed on the +z side of
  // the building with no extra rotation: highest tread inward, lowest outward.
  const porchD = porch ? 1.45 : 0;
  const deckTop = floorH;
  const porchW = porch ? width * 0.78 : 0;
  const deckFront = depth / 2 + porchD;
  const stepCount = stilted ? 4 : 2;
  const stepRise = deckTop / stepCount;
  const stepRun = stilted ? 0.3 : 0.34;
  const stepZ = deckFront + (stepCount - 1) * stepRun + stepRun / 2;
  const doorSteps = stairs({ steps: stepCount, width: 1.5, rise: stepRise, run: stepRun, material: concMat });
  doorSteps.position.set(doorX, 0, stepZ);
  group.add(doorSteps);
  for (let i = 0; i < stepCount; i++) {
    const top = (i + 1) * stepRise;
    colliders.push({
      half: [0.75, top / 2, stepRun / 2],
      pos: [doorX, top / 2, stepZ - i * stepRun],
      tag: "doorstep",
    });
  }

  const awning = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.06, 1.05), roofMat);
  awning.position.set(doorX, floorH + 2.42, depth / 2 + 0.5);
  awning.rotation.x = -0.18;
  awning.castShadow = true;
  group.add(awning);
  const bracketMat = new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#6a5136"), roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.75), bracketMat);
    bracket.position.set(doorX + sx * 1.1, floorH + 2.2, depth / 2 + 0.3);
    bracket.rotation.x = 0.5;
    group.add(bracket);
  }

  /* eaves gutter, downpipe and the drum that catches the rain */
  {
    // on the street side (-x), out past the eave so the run is actually visible
    const gutterSide = -(width / 2 + 0.72);
    const pipeRun = depth + 1.1;
    const drop = floorH + wallH - 1.15;
    const gutter = rainGutter({ length: pipeRun, drop });
    gutter.position.set(gutterSide, floorH + wallH - 0.16, 0);
    gutter.rotation.y = Math.PI / 2;
    group.add(gutter);
    // stand the drum under the downpipe: local +x runs to world -z after the turn
    const drum = waterDrum({ radius: 0.28, height: 0.86 + r() * 0.12 });
    drum.position.set(gutterSide - 0.02, 0, -(pipeRun / 2 - 0.12));
    group.add(drum);
  }

  /* porch: a raised terrace you can actually stand on, with posts, canopy,
     balusters and a bench — and colliders, so the deck is a floor and not a
     picture of one */
  if (porch) {
    // solid mass to the floor level: no floating slab and no gap underneath
    const deck = new THREE.Mesh(new THREE.BoxGeometry(porchW, deckTop, porchD), concMat);
    deck.position.set(0, deckTop / 2, depth / 2 + porchD / 2);
    deck.receiveShadow = true;
    deck.castShadow = true;
    group.add(deck);
    // nosing round the top edge so the terrace has a lip
    const nosing = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.1, 0.06, porchD + 0.1), concMat);
    nosing.position.set(0, deckTop - 0.03, depth / 2 + porchD / 2);
    nosing.receiveShadow = true;
    group.add(nosing);
    colliders.push({
      half: [porchW / 2 + 0.05, deckTop / 2, porchD / 2 + 0.05],
      pos: [0, deckTop / 2, depth / 2 + porchD / 2],
      tag: "porch-deck",
    });

    const postTop = floorH + wallH - 0.1;
    for (const sx of [-1, 1]) {
      const p = post({ height: postTop - deckTop, radius: 0.075, material: bracketMat });
      p.position.set(sx * (porchW / 2 - 0.12), deckTop, depth / 2 + porchD - 0.14);
      group.add(p);
    }
    // canopy over the porch, so the posts carry something
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.3, 0.09, porchD + 0.35), roofMat);
    canopy.position.set(0, postTop + 0.02, depth / 2 + porchD / 2 - 0.02);
    canopy.rotation.x = -0.06;
    canopy.castShadow = true;
    group.add(canopy);
    const fasciaBoard = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.34, 0.12, 0.05), roofMat);
    fasciaBoard.position.set(0, postTop - 0.02, depth / 2 + porchD + 0.12);
    group.add(fasciaBoard);

    for (const sx of [-1, 1]) {
      const rail = railing({ length: porchD * 0.85, height: 0.95, spacing: 0.2 });
      rail.position.set(sx * (porchW / 2 - 0.02), deckTop + 0.01, depth / 2 + porchD * 0.48);
      rail.rotation.y = Math.PI / 2;
      group.add(rail);
    }

    // bench: against the wall, on the far side of the door, so it neither
    // blocks the doorway nor stands in the middle of the walkway
    const benchX = porchW * 0.28;
    const bench = porchBench({ length: 1.7, depth: 0.46, seatHeight: 0.43 });
    // porchBench's back is on local -z; the wall is on -z here, so no turn
    bench.position.set(benchX, deckTop, depth / 2 + 0.27);
    group.add(bench);
    colliders.push({
      half: [0.85, 0.48, 0.23],
      pos: [benchX, deckTop + 0.48, depth / 2 + 0.27],
      tag: "porch-bench",
    });
  }

  /* props — on the porch floor when there is one, otherwise on the plinth */
  const propY = porch ? deckTop : floorH;
  const waterJar = jar({ height: 0.58, radius: 0.24, color: 0xa9663c });
  waterJar.position.set(-(porch ? porchW / 2 - 0.32 : width * 0.34), propY, depth / 2 + (porch ? 0.34 : 0.45));
  group.add(waterJar);
  if (r() > 0.35) {
    const plant = pottedPlant({ scale: 0.9 + r() * 0.4 });
    plant.position.set(
      porch ? porchW / 2 - 0.42 : width * 0.42,
      propY,
      depth / 2 + (porch ? porchD - 0.38 : 0.4)
    );
    group.add(plant);
  }
  if (laundry) {
    const line = clothesline({ length: 3.0 });
    line.position.set(width * 0.75, 0, depth * 0.1);
    line.rotation.y = Math.PI / 2;
    group.add(line);
  }
  if (fence) {
    const f = bambooFence({ length: Math.min(6, width * 0.8), height: 1.1 });
    f.position.set(-width * 0.15, 0, depth / 2 + 3.4);
    group.add(f);
  }

  colliders.push({ half: [width / 2 + 0.15, (wallH + rise) / 2 + floorH / 2, depth / 2 + 0.15], pos: [0, (wallH + rise) / 2 + floorH / 2, 0], tag: "house" });
  // facade layout, kept so the tests can prove the door and windows clear
  // each other instead of relying on me eyeballing it
  group.userData.porch = porch
    ? {
        width: porchW,
        depth: porchD,
        top: deckTop,
        front: deckFront,
        doorX,
        benchX: porchW * 0.28,
        stepCount,
        stepRise,
        stepRun,
        stepZ,
      }
    : null;
  group.userData.facade = {
    doorX,
    doorWidth: 1.02,
    windowX: frontWindowX,
    windowHalfSpan: 0.525 + (1.05 * 0.24),
    wallHalf: width / 2,
  };
  mergeStaticGroup(group);
  return { group, glass, colliders };
}

/* -------------------------------------------------------------- barangay hall */
function buildHall(scene, colliders) {
  const { hallZ, hallWidth: W, hallDepth: D } = LAYOUT;
  const group = new THREE.Group();
  group.position.set(0, 0, hallZ);

  /* ---------------------------------------------------------------------
   * Remodelled from the owner's elevation sheet: two storeys on a raised
   * plinth, a recessed entrance bay between two square columns, a
   * balustraded balcony with the barangay sign on its rail, side verandas
   * with their own little canopies, louvred windows in dark frames, and a
   * hip roof with wide eaves over the lot.
   * ------------------------------------------------------------------- */
  const floorH = 0.8; // plinth
  const groundH = 3.6; // ground storey
  const upperH = 3.2; // second storey
  const balconyY = floorH + groundH; // storey band / balcony floor = 4.4
  const wallTop = balconyY + upperH; // eaves = 7.6
  const front = D / 2; // 8 — the front wall line
  const alcove = 2.2; // how far the entrance is recessed
  const bayW = 10; // width of the entrance bay / balcony
  const porticoD = 2.2; // how far the balcony reaches out
  const roofRise = 3.4;
  const bayEdge = front + porticoD;
  const wallBack = front - alcove;

  const hallGlass = makeGlassMaterial();
  const glass = [hallGlass];

  const concreteMat = new THREE.MeshStandardMaterial({ map: TEX.concrete(4), roughness: 0.95 });
  const stoneMat = new THREE.MeshStandardMaterial({ map: TEX.concrete(2), color: 0xc2bcae, roughness: 1 });
  const wallMat = new THREE.MeshStandardMaterial({ map: TEX.plaster(3), color: 0xf1ece0, roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b3b5a, roughness: 0.72 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0xe9e3d4, roughness: 0.85 });
  const frameColor = 0x30343a;
  const roofMat = new THREE.MeshStandardMaterial({
    map: TEX.corrugated(1, "#8a968f"),
    roughness: 0.68,
    metalness: 0.18,
  });

  const add = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  /* ---------------------------------------------------------------- plinth */
  add(new THREE.Mesh(new THREE.BoxGeometry(W + 3.2, floorH, D + 3.2), concreteMat)).position.y = floorH / 2;
  colliders.push({
    half: [(W + 3.2) / 2, floorH / 2, (D + 3.2) / 2],
    pos: [0, floorH / 2, hallZ],
    tag: "hall-plinth",
  });

  // entrance steps: four treads up to the plinth, climbing toward the doors
  const stepCount = 4;
  const stepRise = floorH / stepCount;
  const stepRun = 0.34;
  const stepZ = D / 2 + 1.6 + 3.5 * stepRun;
  const entrance = stairs({ steps: stepCount, width: 8, rise: stepRise, run: stepRun, material: concreteMat });
  entrance.position.set(0, 0, stepZ);
  group.add(entrance);
  for (let i = 0; i < stepCount; i++) {
    const top = (i + 1) * stepRise;
    colliders.push({
      half: [4, top / 2, stepRun / 2],
      pos: [0, top / 2, hallZ + stepZ - i * stepRun],
      tag: "hall-step",
    });
  }

  /* -------------------------------------------------------- ground storey */
  const sideW = (W - bayW) / 2;
  for (const sx of [-1, 1]) {
    const block = add(new THREE.Mesh(new THREE.BoxGeometry(sideW, groundH, D), wallMat));
    block.position.set(sx * (bayW / 2 + sideW / 2), floorH + groundH / 2, 0);
    colliders.push({
      half: [sideW / 2, (groundH + floorH) / 2, D / 2],
      pos: [sx * (bayW / 2 + sideW / 2), (floorH + groundH) / 2, hallZ],
      tag: "hall",
    });
  }
  const backDepth = wallBack + D / 2;
  const backBlock = add(new THREE.Mesh(new THREE.BoxGeometry(bayW, groundH, backDepth), wallMat));
  backBlock.position.set(0, floorH + groundH / 2, (wallBack - D / 2) / 2);
  colliders.push({
    half: [bayW / 2, (groundH + floorH) / 2, backDepth / 2],
    pos: [0, (floorH + groundH) / 2, hallZ + (wallBack - D / 2) / 2],
    tag: "hall",
  });

  // stone skirt around the base and the blue belt at the storey line
  add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.34, 0.5, D + 0.34), stoneMat)).position.y = floorH + 0.25;
  add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.36, 0.3, D + 0.36), trimMat)).position.y = balconyY;

  /* ---------------------------------------------------------- upper storey */
  const upper = add(new THREE.Mesh(new THREE.BoxGeometry(W, upperH, D), wallMat));
  upper.position.y = balconyY + upperH / 2;
  colliders.push({ half: [W / 2, upperH / 2, D / 2], pos: [0, balconyY + upperH / 2, hallZ], tag: "hall" });

  const cornice = add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.62, 0.3, D + 0.62), wallMat));
  cornice.position.y = wallTop - 0.16;
  add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.16, D + 0.3), trimMat)).position.y = wallTop - 0.42;

  /* --------------------------------------- entrance bay, columns, balcony */
  const columnH = balconyY - floorH;
  const columnX = bayW / 2 - 0.55;
  // the plinth ends at D/2 + 1.6; keep the whole base on it rather than
  // straddling the top tread, which left the column half over the steps
  const columnZ = D / 2 + 1.25;
  const columns = [];
  for (const sx of [-1, 1]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.34, 0.78), postMat)).position.set(sx * columnX, floorH + 0.17, columnZ);
    const shaft = add(new THREE.Mesh(new THREE.BoxGeometry(0.54, columnH - 0.56, 0.54), postMat));
    shaft.position.set(sx * columnX, floorH + 0.34 + (columnH - 0.56) / 2, columnZ);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.22, 0.72), postMat)).position.set(
      sx * columnX,
      floorH + columnH - 0.11,
      columnZ
    );
    colliders.push({
      half: [0.28, columnH / 2, 0.28],
      pos: [sx * columnX, floorH + columnH / 2, hallZ + columnZ],
      tag: "column",
    });
    columns.push({ x: sx * columnX, z: columnZ, baseY: floorH });
  }

  // balcony slab — the canopy over the entrance and the floor of the balcony
  const slab = add(new THREE.Mesh(new THREE.BoxGeometry(bayW + 0.7, 0.26, porticoD + 0.5), concreteMat));
  slab.position.set(0, balconyY - 0.13, front + porticoD / 2 - 0.05);
  add(new THREE.Mesh(new THREE.BoxGeometry(bayW + 0.8, 0.1, porticoD + 0.6), trimMat)).position.set(
    0,
    balconyY - 0.3,
    front + porticoD / 2 - 0.05
  );
  colliders.push({
    half: [(bayW + 0.7) / 2, 0.13, (porticoD + 0.5) / 2],
    pos: [0, balconyY - 0.13, hallZ + front + porticoD / 2 - 0.05],
    tag: "balcony",
  });

  // balustrade: front run plus the two returns to the wall
  const railH = 0.95;
  const frontRail = railing({ length: bayW + 0.5, height: railH, spacing: 0.2, material: postMat });
  frontRail.position.set(0, balconyY, bayEdge - 0.08);
  group.add(frontRail);
  for (const sx of [-1, 1]) {
    const side = railing({ length: porticoD - 0.1, height: railH, spacing: 0.2, material: postMat });
    side.position.set(sx * (bayW / 2 + 0.24), balconyY, front + porticoD / 2 - 0.05);
    side.rotation.y = Math.PI / 2;
    group.add(side);
  }

  // the sign hangs on the balcony rail, facing the road
  const signTex = TEX.sign("BARANGAY KABUDOY", { size: 104, bg: "#f7f3e6", border: "#1b3b5a", fg: "#12265c" });
  const signBoard = add(new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.0, 0.1), postMat));
  signBoard.position.set(0, balconyY + 0.5, bayEdge - 0.06);
  const signPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(6.44, 0.86),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 })
  );
  signPanel.position.set(0, balconyY + 0.5, bayEdge + 0.005);
  group.add(signPanel);

  /* ------------------------------------------------------------ side wings */
  for (const sx of [-1, 1]) {
    const wingX = W / 2 + 1.35;
    const wing = add(new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.24, 5.6), concreteMat));
    wing.position.set(sx * wingX, balconyY - 0.12, 0.4);
    colliders.push({
      half: [1.35, 0.12, 2.8],
      pos: [sx * wingX, balconyY - 0.12, hallZ + 0.4],
      tag: "veranda",
    });
    // columns down to the GROUND: these stand outside the plinth, so stopping
    // them at plinth height left them hanging in the air over the lawn
    const wingColX = sx * (W / 2 + 2.35);
    for (const sz of [-1, 1]) {
      const z = 0.4 + sz * 2.3;
      const height = balconyY - 0.24;
      const col = add(new THREE.Mesh(new THREE.BoxGeometry(0.44, height, 0.44), postMat));
      col.position.set(wingColX, height / 2, z);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.62), postMat)).position.set(wingColX, 0.15, z);
      colliders.push({
        half: [0.24, height / 2, 0.24],
        pos: [wingColX, height / 2, hallZ + z],
        tag: "column",
      });
      columns.push({ x: wingColX, z, baseY: 0 });
    }
    // balustrade on the outer edge and the two ends
    const outer = railing({ length: 5.5, height: 0.9, spacing: 0.2, material: postMat });
    outer.position.set(sx * (W / 2 + 2.62), balconyY, 0.4);
    outer.rotation.y = Math.PI / 2;
    group.add(outer);
    for (const sz of [-1, 1]) {
      const end = railing({ length: 2.6, height: 0.9, spacing: 0.2, material: postMat });
      end.position.set(sx * wingX, balconyY, 0.4 + sz * 2.72);
      group.add(end);
    }
    // small canopy over each wing, carried by two slim posts
    for (const sz of [-1, 1]) {
      const p = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 2.4, 8), postMat));
      p.position.set(sx * (W / 2 + 2.35), balconyY + 1.2, 0.4 + sz * 2.3);
    }
    const canopy = hipRoof({
      width: 3.4,
      depth: 6.2,
      rise: 0.85,
      overhang: 0.3,
      material: roofMat,
    });
    canopy.position.set(sx * (W / 2 + 1.35), balconyY + 2.35, 0.4);
    group.add(canopy);
  }

  /* ---------------------------------------------------------------- windows */
  const louvre = (w, h, x, y, z, rotY = 0) => {
    const win = windowUnit({
      width: w,
      height: h,
      sill: true,
      louvres: true,
      mullions: false,
      frameColor,
      glassMaterial: hallGlass,
    });
    win.position.set(x, y, z);
    win.rotation.y = rotY;
    group.add(win);
  };
  const upperSill = balconyY + 1.75;
  const lowerSill = floorH + 1.85;
  for (const sx of [-1, 1]) {
    louvre(1.7, 1.5, sx * 3.6, upperSill, front + 0.02);
    louvre(1.7, 1.5, sx * 8.3, upperSill, front + 0.02);
    louvre(1.9, 1.45, sx * 7.2, lowerSill, front + 0.02);
    louvre(1.9, 1.45, sx * 10.4, lowerSill, front + 0.02);
    for (const z of [-4.6, 0, 4.6]) {
      louvre(1.45, 1.35, sx * (W / 2 + 0.02), upperSill, z, (sx * Math.PI) / 2);
    }
    for (const z of [-3.4, 3.4]) {
      louvre(1.6, 1.3, sx * (W / 2 + 0.02), lowerSill, z, (sx * Math.PI) / 2);
    }
  }
  // a small window over the door on the upper floor
  louvre(1.2, 0.9, 0, balconyY + 2.5, front + 0.02);
  // balcony door (glass, opens onto the balcony)
  const balconyDoor = doorUnit({ width: 1.7, height: 2.4, color: "#2e4652", glassOut: glass });
  balconyDoor.position.set(0, balconyY + 0.02, front + 0.03);
  group.add(balconyDoor);

  /* ------------------------------------------------------- entrance doors */
  const doorGroup = new THREE.Group();
  for (const sx of [-1, 1]) {
    const leaf = doorUnit({ width: 1.32, height: 2.9, color: "#5c3f28", glassOut: glass });
    leaf.position.set(sx * 0.7, floorH, wallBack + 0.05);
    doorGroup.add(leaf);
  }
  group.add(doorGroup);
  // transom over the doors, so the big opening reads like a public building
  const transom = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.6), hallGlass);
  transom.position.set(0, floorH + 3.24, wallBack + 0.06);
  group.add(transom);
  add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.12, 0.24), concreteMat)).position.set(0, floorH + 2.98, wallBack + 0.1);

  const subTex = TEX.sign("TANGGAPAN NG PUNONG BARANGAY", { size: 54, bg: "#12307a", border: "#f7f3e6", fg: "#f7f3e6" });
  const subPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 0.66),
    new THREE.MeshStandardMaterial({ map: subTex, roughness: 0.8 })
  );
  subPanel.position.set(0, floorH + 3.72, wallBack + 0.05);
  group.add(subPanel);

  /* ------------------------------------------------------------------ roof */
  const roof = hipRoof({
    width: W + 0.4,
    depth: D + 0.4,
    rise: roofRise,
    overhang: 1.35,
    material: roofMat,
  });
  roof.position.y = wallTop;
  group.add(roof);

  /* ------------------------------------------------- flagpole on its plinth */
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xd7d9dc, roughness: 0.4, metalness: 0.6 });
  const poleX = W / 2 + 3.4;
  const poleZ = front + 4.6;
  add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.36, 1.5), concreteMat)).position.set(poleX, 0.18, poleZ);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 10.4, 12), poleMat);
  pole.position.set(poleX, 5.4, poleZ);
  pole.castShadow = true;
  group.add(pole);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), poleMat);
  finial.position.set(poleX, 10.68, poleZ);
  group.add(finial);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.2, 16, 8),
    new THREE.MeshStandardMaterial({ map: TEX.philippineFlag(), side: THREE.DoubleSide, roughness: 0.85 })
  );
  flag.position.set(poleX + 1.24, 9.75, poleZ);
  flag.userData.noMerge = true;
  group.add(flag);
  group.userData.flag = flag;
  colliders.push({ half: [0.18, 5, 0.18], pos: [poleX, 5, hallZ + poleZ], tag: "flagpole" });
  colliders.push({ half: [0.75, 0.18, 0.75], pos: [poleX, 0.18, hallZ + poleZ], tag: "flagpole-base" });

  /* ---------------------------------------------------------- entrance lamps */
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.6, metalness: 0.4 });
  const lamps = [];
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff1c9,
    emissive: new THREE.Color(0xffd894),
    emissiveIntensity: 0,
  });
  for (const side of [-1, 1]) {
    // a wall lantern: back plate on the render, arm out from the wall, shade and
    // bulb hanging off the end. It used to be a bracket and a bulb floating
    // 0.35 m off the facade with nothing joining them to it.
    const x = side * (bayW / 2 + 0.45);
    const y = floorH + 3.05;
    const zWall = front + 0.03;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.07), lampMat);
    plate.position.set(x, y, zWall);
    group.add(plate);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 8), lampMat);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(x, y, zWall + 0.24);
    group.add(arm);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.2, 10), lampMat);
    shade.position.set(x, y - 0.04, zWall + 0.46);
    group.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bulbMat);
    bulb.position.set(x, y - 0.17, zWall + 0.46);
    group.add(bulb);
    const light = new THREE.PointLight(0xffd08a, 0, 22, 1.8);
    light.position.copy(bulb.position);
    group.add(light);
    lamps.push({ bulb, light });
  }

  /* ------------------------------------------------------- lawn + planting */
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 22, 30),
    new THREE.MeshStandardMaterial({ map: TEX.grass(8), color: 0x93a367, roughness: 1 })
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, 0.03, hallZ + front + 15);
  lawn.receiveShadow = true;
  scene.add(lawn);

  // planting either side of the approach: a run of shrubs on the lawn, with a
  // pot at the foot of the steps. These were clipped boxes on the first pass,
  // which read as black crates dropped in front of the doors.
  const props = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const bush = shrub({
        radius: 0.5 + (i % 2) * 0.08,
        height: 0.8 + (i % 3) * 0.06,
        seed: 31 + i * 7 + (sx > 0 ? 3 : 0),
      });
      const x = sx * (5.7 + (i % 2) * 0.25);
      const z = stepZ + 1.5 + i * 1.15;
      bush.position.set(x, 0.01, z);
      group.add(bush);
      props.push({ kind: "shrub", x, y: 0.01, z });
    }
    const plant = pottedPlant({ scale: 1.35 });
    plant.position.set(sx * 4.5, 0.02, stepZ + 1.1);
    group.add(plant);
    props.push({ kind: "pot", x: sx * 4.5, y: 0.02, z: stepZ + 1.1 });
  }

  mergeStaticGroup(group);
  scene.add(group);
  const hallShadow = groundShadow({ width: W + 6, depth: D + 6, opacity: 0.3 });
  // above the lawn plane at 0.03, or the smudge is hidden under the grass
  hallShadow.position.set(0, 0.045, hallZ);
  scene.add(hallShadow);

  group.userData.hall = {
    width: W,
    depth: D,
    floorH,
    groundH,
    upperH,
    wallTop,
    balconyY,
    balconyDepth: porticoD,
    balconyFront: bayEdge,
    bayWidth: bayW,
    alcoveDepth: alcove,
    wallBack,
    roofRise,
    ridgeHalfLength: roof.userData.ridgeHalfLength,
    signWidth: 6.6,
    flagTop: 10.8,
    props,
    columns,
  };

  return { group, glass, lamps, flag };
}

/* -------------------------------------------------------- horizon, sky, air */
function buildBackdrop(scene) {
  const r = rngFactory(777);

  // displaced terrain ring: flat where the village is, hills then mountains out
  const terrain = horizonTerrain({
    innerRadius: LAYOUT.groundRadius,
    outerRadius: 1000,
    radialSteps: 56,
    segments: 184,
    seed: 2024,
    // the ring is built around the same centre as the flat ground disc, so its
    // hole sits exactly over the village. Offsetting the mesh as well doubled
    // the shift and left hills standing on top of the relocated hall.
    centerZ: LAYOUT.groundCenterZ,
  });
  terrain.position.z = 0;
  scene.add(terrain);

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

  return { terrain, clouds, stars, starMat };
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

  /* ground: a disc that meets the terrain ring exactly at its inner radius */
  const groundMat = new THREE.MeshStandardMaterial({
    map: TEX.grass(90),
    normalMap: TEX.noiseNormal({ repeat: 90, strength: 0.9, scale: 40, seed: 5 }),
    normalScale: new THREE.Vector2(0.55, 0.55),
    color: 0xc9c7a4,
    roughness: 1,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(LAYOUT.groundRadius, 96), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, LAYOUT.groundCenterZ);
  ground.receiveShadow = true;
  scene.add(ground);

  /* road corridor: one texture across the whole width, verges baked in */
  const roadLength = LAYOUT.roadStartZ - LAYOUT.roadEndZ;
  const VERGE = 2.6;
  const corridorW = LAYOUT.roadWidth + VERGE * 2;
  const vergeFrac = VERGE / corridorW;
  const roadMat = new THREE.MeshStandardMaterial({
    map: TEX.roadBed({ verge: vergeFrac, seed: 21 }),
    normalMap: TEX.noiseNormal({ repeat: 1, strength: 1.6, scale: 30, seed: 9 }),
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 1,
  });
  // one tile across the corridor, ~3.2 m of ground per tile along it: any
  // shorter and the ruts strobe, any longer and they smear into cardboard
  roadMat.map.repeat.set(1, roadLength / 3.2);
  roadMat.normalMap.repeat.set(corridorW / 3.4, roadLength / 3.4);
  // a crowned, slightly rutted surface, with enough length segments that the
  // light does not slide over a dead-flat plane
  const roadGeo = new THREE.PlaneGeometry(corridorW, roadLength, 10, Math.round(roadLength / 3.5));
  const rp = roadGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i);
    const half = corridorW / 2;
    const inn = Math.max(0, 1 - Math.abs(x) / (LAYOUT.roadWidth / 2));
    const z = rp.getY(i);
    const rut = Math.exp(-Math.pow((Math.abs(x) - LAYOUT.roadWidth * 0.2) / 0.34, 2)) * 0.016;
    rp.setZ(i, inn * 0.06 + Math.sin(z * 0.27) * 0.02 - rut + Math.sin(x * 1.7 + z * 0.5) * 0.008);
  }
  roadGeo.computeVertexNormals();
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, (LAYOUT.roadStartZ + LAYOUT.roadEndZ) / 2);
  road.receiveShadow = true;
  road.name = "road";
  scene.add(road);

  const groveCount = buildGrove(scene, colliders);
  const fields = buildFields(scene);
  const hall = buildHall(scene, colliders);
  const backdrop = buildBackdrop(scene);

  /* houses along the road */
  const houses = [];
  const houseRects = [];
  const houseSeeds = [
    { z: -58, side: -1, w: 7.6, d: 6.2, storeys: 1, roof: "corrugated", wall: 0xd6cfbe, porch: true },
    { z: -86, side: 1, w: 6.8, d: 5.8, storeys: 1, roof: "nipa", wall: 0xcfc4a8, stilted: true },
    { z: -118, side: -1, w: 8.2, d: 6.4, storeys: 2, roof: "corrugated", wall: 0xe0d9c8, porch: false },
    { z: -152, side: 1, w: 7.0, d: 6.0, storeys: 1, roof: "corrugated", wall: 0xd2c6a6, porch: true },
    { z: -186, side: -1, w: 7.4, d: 6.0, storeys: 1, roof: "nipa", wall: 0xc9bda0, stilted: true },
    { z: -218, side: 1, w: 8.0, d: 6.2, storeys: 2, roof: "corrugated", wall: 0xdcd5c4, porch: false },
    { z: -246, side: -1, w: 6.6, d: 5.6, storeys: 1, roof: "corrugated", wall: 0xd0c8b4, porch: true },
  ];
  for (let i = 0; i < houseSeeds.length; i++) {
    const h = houseSeeds[i];
    const { group, glass, colliders: localColliders } = buildHouse({
      width: h.w,
      depth: h.d,
      storeys: h.storeys,
      roof: h.roof,
      wallColor: h.wall,
      stilted: !!h.stilted,
      porch: h.porch !== false,
      laundry: i % 2 === 0,
      fence: i % 3 !== 2,
      seed: 100 + i * 13,
    });
    const x = h.side * (9.5 + (i % 3) * 1.8);
    group.position.set(x, 0, h.z);
    group.rotation.y = h.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(group);
    colliders.push(...placeColliders(localColliders, group, "house"));
    const shadow = groundShadow({ width: h.w + 4, depth: h.d + 4, opacity: 0.3 });
    shadow.position.set(x, 0.026, h.z);
    scene.add(shadow);
    houseRects.push({ x, z: h.z, hx: h.d / 2 + 2.4, hz: h.w / 2 + 2.4 });
    houses.push({ group, glass });
  }


  /* weeds: real blade clumps crowding the verge, in one instanced draw call.
     Bare dirt running straight into mown-looking grass is the single biggest
     tell that a road is a texture rather than a road. */
  {
    const rects = [
      ...houseRects,
      { x: 11.5, z: -8, hx: 7, hz: 7 }, // store + Ernie's lot
      { x: 0, z: LAYOUT.hallZ, hx: 21, hz: 19 }, // hall plinth, steps, lawn
    ];
    const blocked = (x, z) => rects.some((b) => Math.abs(x - b.x) < b.hx && Math.abs(z - b.z) < b.hz);
    let seed = 91733;
    const wr = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const spots = [];
    const halfRoad = LAYOUT.roadWidth / 2;
    let guard = 0;
    while (spots.length < 11000 && guard++ < 200000) {
      const alongVerge = wr() < 0.82;
      const side = wr() < 0.5 ? -1 : 1;
      let x;
      let z;
      if (alongVerge) {
        // crowded against the road edge, thinning out across the verge
        x = side * (halfRoad - 0.15 + Math.pow(wr(), 2.1) * 7.5);
        z = LAYOUT.roadEndZ - 6 + wr() * (LAYOUT.roadStartZ - LAYOUT.roadEndZ + 40);
      } else {
        x = (wr() - 0.5) * 130;
        z = LAYOUT.roadEndZ + 10 + wr() * (LAYOUT.roadStartZ - LAYOUT.roadEndZ + 30);
      }
      if (Math.abs(x) < halfRoad - 0.2) continue;
      if (blocked(x, z)) continue;
      const big = wr() < 0.09;
      spots.push({
        x,
        z,
        s: big ? 1.25 + wr() * 0.5 : 0.5 + wr() * 0.6,
        rot: wr() * 6.28,
        dry: wr() < 0.4,
        lean: (wr() - 0.5) * 0.22,
      });
    }
    // short, thin, half-dead verge growth -- the first pass was the size of a
    // houseplant, which is what made the roadside read as planted rather than wild
    const geo = bladeClump(5, { length: 0.21, width: 0.026, curve: 0.6, rise: 0.95, fold: 0.25, segsL: 3, segsW: 1 }, 731);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide });
    const weeds = new THREE.InstancedMesh(geo, mat, spots.length);
    const dummy = new THREE.Object3D();
    const green = new THREE.Color(0x76803f);
    const straw = new THREE.Color(0xa89a63);
    spots.forEach((p, i) => {
      dummy.position.set(p.x, 0.022, p.z);
      dummy.rotation.set(p.lean, p.rot, p.lean * 0.6);
      dummy.scale.set(p.s, p.s * (0.8 + (i % 7) * 0.06), p.s);
      dummy.updateMatrix();
      weeds.setMatrixAt(i, dummy.matrix);
      weeds.setColorAt(i, p.dry ? straw : green);
    });
    weeds.instanceMatrix.needsUpdate = true;
    if (weeds.instanceColor) weeds.instanceColor.needsUpdate = true;
    weeds.receiveShadow = true;
    weeds.castShadow = false;
    scene.add(weeds);
  }

  /* lights */
  const hemi = new THREE.HemisphereLight(0x9fc0e8, 0x4a4433, 0.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d0, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 620; // the light sits ~400 units off before re-anchoring
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

  const windowMats = [...hall.glass, ...houses.flatMap((h) => h.glass)];

  /* palette */
  const dayTop = new THREE.Color(0x3f74b8);
  const dayHorizon = new THREE.Color(0xd9dcd6);
  const duskTop = new THREE.Color(0x2f4478);
  const duskHorizon = new THREE.Color(0xe0996a);
  const nightTop = new THREE.Color(0x05080f);
  const nightHorizon = new THREE.Color(0x131d2e);
  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();

  const state = { clock, colliders, hall, houses, groveCount, fields, hemi, sun, moon, ambient, sky: skyUniforms, terrain: backdrop.terrain };

  const sunPos = new THREE.Vector3();
  const moonPos = new THREE.Vector3();

  function updateLighting() {
    const day = clock.daylight;
    const h = clock.hours;
    const a = ((h - 6) / 12) * Math.PI;
    sunPos.set(Math.cos(a) * 260, Math.sin(a) * 300, -120);
    sun.position.copy(sunPos);
    skyUniforms.sunDir.value.copy(sunPos).normalize();

    const dusk = Math.max(0, 1 - Math.abs(Math.sin(a)) * 3.2) * (day > 0.02 ? 1 : 0);

    if (day > 0.02) {
      tmpA.copy(dayTop);
      tmpB.copy(duskTop);
      skyUniforms.topColor.value.copy(tmpA.lerp(tmpB, dusk));
      tmpA.copy(dayHorizon);
      tmpB.copy(duskHorizon);
      skyUniforms.horizonColor.value.copy(tmpA.lerp(tmpB, dusk));
    } else {
      skyUniforms.topColor.value.copy(nightTop);
      skyUniforms.horizonColor.value.copy(nightHorizon);
    }
    skyUniforms.sunColor.value.setHex(dusk > 0.4 ? 0xff9a4d : 0xffe9c4);
    skyUniforms.sunGlow.value = Math.max(0, day) * (1 - dusk * 0.35);

    // long sight lines by day so the hall reads at the end of the road
    scene.fog.color.copy(skyUniforms.horizonColor.value).multiplyScalar(0.96);
    scene.fog.near = 40 + day * 55;
    scene.fog.far = 300 + day * 650;

    hemi.intensity = 0.22 + day * 0.72;
    hemi.color.copy(skyUniforms.topColor.value).lerp(new THREE.Color(0xffffff), 0.35);
    ambient.intensity = 0.18 + day * 0.22;

    sun.intensity = day * (2.35 - dusk * 0.5);
    sun.color.setHex(dusk > 0.45 ? 0xffb070 : 0xfff2d8);
    const night = 1 - day;
    moonPos.copy(sunPos).multiplyScalar(-1);
    moon.position.copy(moonPos);
    moon.intensity = night * 0.42;
    moon.color.setHex(0xa8bfe8);

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
      sun.target.position.set(cameraPosition.x, 0, cameraPosition.z);
      sun.position.copy(sunPos).add(new THREE.Vector3(cameraPosition.x, 0, cameraPosition.z));
    }

    for (const c of backdrop.clouds) {
      c.sprite.position.x += c.speed * dt;
      if (c.sprite.position.x > 460) c.sprite.position.x = -460;
    }

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
