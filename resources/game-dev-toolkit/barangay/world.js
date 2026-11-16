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
  bladeGeometry,
  bladeClump,
  windowUnit,
  doorUnit,
  post,
  railing,
  stairs,
  jar,
  pottedPlant,
  clothesline,
  bambooFence,
  horizonTerrain,
  ventanilla,
  rainGutter,
  waterDrum,
  mergeStaticGroup,
  makeGlassMaterial,
} from "./models.js";

export { gableRoof };

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
      : new THREE.MeshStandardMaterial({ map: TEX.corrugated(4), roughness: 0.68, metalness: 0.16 });
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
  const doorSteps = stairs({ steps: stilted ? 4 : 2, width: 1.5, rise: 0.2, run: 0.3, material: concMat });
  doorSteps.position.set(doorX, 0, depth / 2 + (porch ? 1.45 : 0.16));
  doorSteps.rotation.y = Math.PI;
  group.add(doorSteps);

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

  /* porch: deck, posts, canopy and balusters */
  const porchD = porch ? 1.35 : 0;
  if (porch) {
    const porchW = width * 0.78;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(porchW, 0.14, porchD), concMat);
    deck.position.set(0, floorH + 0.02, depth / 2 + porchD / 2);
    deck.receiveShadow = true;
    group.add(deck);

    const postTop = floorH + wallH - 0.1;
    for (const sx of [-1, 1]) {
      const p = post({ height: postTop, radius: 0.075, material: bracketMat });
      p.position.set(sx * (porchW / 2 - 0.12), 0, depth / 2 + porchD - 0.14);
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
      rail.position.set(sx * (porchW / 2 - 0.02), floorH + 0.08, depth / 2 + porchD * 0.48);
      rail.rotation.y = Math.PI / 2;
      group.add(rail);
    }
    const benchMat = new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#7d6142"), roughness: 0.9 });
    const porchBench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.36), benchMat);
    porchBench.position.set(-porchW * 0.22, floorH + 0.45, depth / 2 + 0.55);
    group.add(porchBench);
    for (const sx of [-0.65, 0.65]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.44, 0.3), benchMat);
      leg.position.set(-porchW * 0.22 + sx, floorH + 0.22, depth / 2 + 0.55);
      group.add(leg);
    }
  }

  /* props */
  const waterJar = jar({ height: 0.66, radius: 0.3, color: 0xa9663c });
  waterJar.position.set(-width * 0.34, floorH, depth / 2 + 0.45);
  group.add(waterJar);
  if (r() > 0.35) {
    const plant = pottedPlant({ scale: 0.9 + r() * 0.4 });
    plant.position.set(width * 0.42, floorH, depth / 2 + 0.4);
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
  const floorH = 0.8;
  const wallH = 7.4;
  const hallGlass = makeGlassMaterial();
  const glass = [hallGlass];

  const concreteMat = new THREE.MeshStandardMaterial({ map: TEX.concrete(4), roughness: 0.95 });
  const wallMat = new THREE.MeshStandardMaterial({ map: TEX.plaster(3), color: 0xf1ece0, roughness: 0.9 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1d3f8f, roughness: 0.7 });
  const roofMat = new THREE.MeshStandardMaterial({ map: TEX.corrugated(6, "#8e6f5a"), roughness: 0.78, metalness: 0.14 });
  const gableMat = new THREE.MeshStandardMaterial({ map: TEX.plaster(3), color: 0xefe9dc, roughness: 0.9 });

  /* plinth + grand steps */
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 3.2, floorH, D + 3.2), concreteMat);
  plinth.position.y = floorH / 2;
  plinth.receiveShadow = true;
  group.add(plinth);
  const entrance = stairs({ steps: 4, width: 8, rise: 0.2, run: 0.34, material: concreteMat });
  entrance.position.set(0, 0, D / 2 + 3.1);
  entrance.rotation.y = Math.PI;
  group.add(entrance);

  /* body */
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, wallH, D), wallMat);
  body.position.y = floorH + wallH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  colliders.push({ half: [W / 2, wallH / 2 + floorH, D / 2], pos: [0, wallH / 2 + floorH, hallZ] });

  /* storey band, plinth skirt and cornice */
  const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.34, D + 0.4), trimMat);
  band.position.y = floorH + wallH * 0.55;
  group.add(band);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(W + 0.34, 0.55, D + 0.34), trimMat);
  skirt.position.y = floorH + 0.1;
  group.add(skirt);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(W + 0.7, 0.26, D + 0.7), wallMat);
  cornice.position.y = floorH + wallH - 0.16;
  cornice.castShadow = true;
  group.add(cornice);

  /* portico: four posts carrying the front balcony */
  const postMat = new THREE.MeshStandardMaterial({ color: 0xe9e3d4, roughness: 0.85 });
  const porticoD = 2.6;
  for (const sx of [-1, 1]) {
    for (const t of [0.33, 0.66]) {
      const p = post({ height: floorH + wallH * 0.56, radius: 0.19, material: postMat });
      p.position.set(sx * W * t, floorH, D / 2 + porticoD);
      group.add(p);
      colliders.push({ half: [0.24, (floorH + wallH * 0.56) / 2, 0.24], pos: [sx * W * t, (floorH + wallH * 0.56) / 2, hallZ + D / 2 + porticoD], tag: "column" });
    }
  }
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.2, porticoD + 0.6), concreteMat);
  balcony.position.set(0, floorH + wallH * 0.57, D / 2 + porticoD / 2);
  balcony.castShadow = true;
  balcony.receiveShadow = true;
  group.add(balcony);
  const balustrade = railing({ length: W + 1.2, height: 1.0, spacing: 0.26, material: postMat });
  balustrade.position.set(0, floorH + wallH * 0.58, D / 2 + porticoD - 0.1);
  group.add(balustrade);

  /* roof */
  const rise = 3.4;
  const roofGroup = gableRoof({
    width: D,
    depth: W,
    rise,
    material: roofMat,
    overhang: 0.85,
    ridgeAlong: "x",
    gableMaterial: gableMat,
    bargeBoards: true,
    rafters: true,
  });
  roofGroup.position.y = floorH + wallH;
  group.add(roofGroup);

  /* windows */
  const front = D / 2 + 0.02;
  const upperY = floorH + wallH * 0.72;
  const lowerY = floorH + wallH * 0.3;
  for (let i = 0; i < 5; i++) {
    const w = windowUnit({ width: 1.25, height: 1.35, sill: true, glassMaterial: hallGlass });
    w.position.set(-W / 2 + (W / 6) * (i + 1), upperY, front);
    group.add(w);
  }
  for (let i = 0; i < 4; i++) {
    const x = -W / 2 + (W / 5) * (i + 1);
    if (Math.abs(x) < 2.4) continue;
    const w = windowUnit({ width: 1.15, height: 1.2, sill: true, glassMaterial: hallGlass });
    w.position.set(x, lowerY, front);
    group.add(w);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const w = windowUnit({ width: 1.1, height: 1.15, sill: true, glassMaterial: hallGlass });
      w.position.set(side * (W / 2 + 0.02), upperY, -D / 2 + (D / 4) * (i + 1));
      w.rotation.y = (side * Math.PI) / 2;
      group.add(w);
    }
  }

  /* double door */
  const doorGroup = new THREE.Group();
  for (const sx of [-1, 1]) {
    const leaf = doorUnit({ width: 1.35, height: 2.9, color: "#5c3f28" });
    leaf.position.set(sx * 0.72, floorH, front + 0.04);
    leaf.scale.set(1, 1, 1);
    doorGroup.add(leaf);
  }
  group.add(doorGroup);

  /* signboards */
  const signTex = TEX.sign("BARANGAY KABUDOY", { size: 104, bg: "#f7f3e6", border: "#1d3f8f", fg: "#12265c" });
  const signPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 1.85),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 })
  );
  signPanel.position.set(0, floorH + wallH * 0.45, front + 0.06);
  group.add(signPanel);
  const subTex = TEX.sign("TANGGAPAN NG PUNONG BARANGAY", { size: 54, bg: "#12307a", border: "#f7f3e6", fg: "#f7f3e6" });
  const subPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(6.0, 1.0),
    new THREE.MeshStandardMaterial({ map: subTex, roughness: 0.8 })
  );
  subPanel.position.set(0, floorH + wallH * 0.9, front + 0.06);
  group.add(subPanel);

  /* flagpole with a finial */
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xd7d9dc, roughness: 0.4, metalness: 0.6 });
  const poleX = W / 2 + 3.2;
  const poleZ = D / 2 + 3.4;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 10, 12), poleMat);
  pole.position.set(poleX, floorH + 5, poleZ);
  pole.castShadow = true;
  group.add(pole);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), poleMat);
  finial.position.set(poleX, floorH + 10.05, poleZ);
  group.add(finial);
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.2, 16, 8);
  const flag = new THREE.Mesh(
    flagGeo,
    new THREE.MeshStandardMaterial({ map: TEX.philippineFlag(), side: THREE.DoubleSide, roughness: 0.85 })
  );
  flag.position.set(poleX + 1.24, floorH + 9.1, poleZ);
  flag.userData.noMerge = true;
  group.add(flag);
  group.userData.flag = flag;
  colliders.push({ half: [0.18, 5, 0.18], pos: [poleX, 5 + floorH, hallZ + poleZ], tag: "flagpole" });

  /* entrance lamps */
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.6, metalness: 0.4 });
  const lamps = [];
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff1c9,
    emissive: new THREE.Color(0xffd894),
    emissiveIntensity: 0,
  });
  for (const side of [-1, 1]) {
    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), lampMat);
    bracket.rotation.z = Math.PI / 2;
    bracket.position.set(side * (W / 2 + 0.3), floorH + wallH * 0.5, front + 0.5);
    group.add(bracket);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), bulbMat);
    bulb.position.set(side * (W / 2 + 0.9), floorH + wallH * 0.5, front + 0.5);
    group.add(bulb);
    const light = new THREE.PointLight(0xffd08a, 0, 24, 1.8);
    light.position.copy(bulb.position);
    group.add(light);
    lamps.push({ bulb, light });
  }

  /* lawn + a few potted plants flanking the steps */
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 22, 28),
    new THREE.MeshStandardMaterial({ map: TEX.grass(8), color: 0x93a367, roughness: 1 })
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, 0.03, hallZ + D / 2 + 14);
  lawn.receiveShadow = true;
  scene.add(lawn);
  for (const sx of [-1, 1]) {
    const plant = pottedPlant({ scale: 1.3 });
    plant.position.set(sx * 5.2, floorH, D / 2 + 3.4);
    group.add(plant);
  }

  mergeStaticGroup(group);
  scene.add(group);
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
  });
  terrain.position.z = -LAYOUT.groundCenterZ;
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
  const groundMat = new THREE.MeshStandardMaterial({ map: TEX.grass(90), color: 0xc9c7a4, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(LAYOUT.groundRadius, 96), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, LAYOUT.groundCenterZ);
  ground.receiveShadow = true;
  scene.add(ground);

  /* road + shoulders */
  const roadLength = LAYOUT.roadStartZ - LAYOUT.roadEndZ;
  const roadMat = new THREE.MeshStandardMaterial({ map: TEX.dirtRoad(1), roughness: 1 });
  roadMat.map.repeat.set(1.6, roadLength / 6);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(LAYOUT.roadWidth, roadLength), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, (LAYOUT.roadStartZ + LAYOUT.roadEndZ) / 2);
  road.receiveShadow = true;
  scene.add(road);
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
    const cos = Math.cos(group.rotation.y);
    const sin = Math.sin(group.rotation.y);
    for (const c of localColliders) {
      const hx = Math.abs(cos) * c.half[0] + Math.abs(sin) * c.half[2];
      const hz = Math.abs(sin) * c.half[0] + Math.abs(cos) * c.half[2];
      colliders.push({
        half: [hx, c.half[1], hz],
        pos: [x + c.pos[0] * cos + c.pos[2] * sin, c.pos[1], h.z - c.pos[0] * sin + c.pos[2] * cos],
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
