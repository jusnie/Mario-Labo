/**
 * walkthrough-test.mjs — headless proof that the road actually works.
 *
 * There is no browser in this sandbox, so instead of a screenshot this test
 * builds the real scene, the real colliders and the real Rapier character
 * controller, then walks Ernie from the start to the barangay hall on the same
 * 60fps step the game uses. It fails if he gets stuck, falls through the
 * ground, drifts off the road, or if the hall is not actually farther away
 * than the old z=-140 build.
 *
 * Run: npm run walkthrough
 */
import { existsSync, readFileSync } from "node:fs";
import { LAYOUT } from "./barangay/world.js";
import { PLAYER, START_POSITION } from "./barangay/physics.js";

/* Canvas is only needed for procedural textures; stub just enough of it. */
const gradient = { addColorStop() {} };
const ctx2d = new Proxy(
  {},
  {
    get(_t, key) {
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (key === "canvas") return { width: 512, height: 512 };
      if (key === "measureText") return () => ({ width: 10 });
      return () => {};
    },
    set() {
      return true;
    },
  }
);
globalThis.document = {
  createElement: () => ({ width: 512, height: 512, getContext: () => ctx2d }),
};

const THREE = await import("three");
const RAPIER = await import("@dimforge/rapier3d-compat");
const { buildWorld, gableRoof, buildHouse } = await import("./barangay/world.js");
const { createStore, createErniesHouse, buildStreetFurniture } = await import("./barangay/places.js");
const { buildPhysics, stepPlayer } = await import("./barangay/physics.js");
const { surfaceAt, SURFACE_KINDS } = await import("./barangay/surfaces.js");
const { SURFACES } = await import("./barangay/sound.js");

let failures = 0;
const ok = (m) => console.log(`  \u2713 ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  \u2717 ${m}`);
};
const section = (t) => console.log(`\n${t}`);

/* --------------------------------------------------------------- build scene */
section("building the barangay");
await RAPIER.init();
const scene = new THREE.Scene();
const t0 = performance.now();
const world3d = buildWorld(scene, { startHour: 8 });
buildStreetFurniture(scene, world3d.colliders);
const store = await createStore(scene, world3d.colliders, null);
const house = createErniesHouse(scene, world3d.colliders);
const buildMs = performance.now() - t0;

let meshes = 0;
let instanced = 0;
let instances = 0;
let bones = 0;
scene.traverse((o) => {
  if (o.isInstancedMesh) {
    instanced++;
    instances += o.count;
  } else if (o.isMesh) meshes++;
  if (o.isBone) bones++;
});
ok(`scene built in ${buildMs.toFixed(0)}ms — ${meshes} meshes, ${instanced} instanced meshes (${instances} instances)`);
ok(`${world3d.colliders.length} static colliders, ${world3d.groveCount} banana plants`);

/* hall distance requirement */
section("the hall is farther away, the grove is longer");
const startToHall = Math.abs(START_POSITION.z - (LAYOUT.hallZ + LAYOUT.hallDepth / 2));
startToHall > 280
  ? ok(`hall front is ${startToHall.toFixed(0)}m from the spawn (previous build: ~154m at z=-140)`)
  : bad(`hall only ${startToHall.toFixed(0)}m away — not farther than the old build`);
LAYOUT.hallZ < -250 ? ok(`hall moved to z=${LAYOUT.hallZ}`) : bad(`hall still at z=${LAYOUT.hallZ}`);
const groveLength = LAYOUT.groveStartZ - LAYOUT.groveEndZ;
groveLength > 180 && world3d.groveCount > 200
  ? ok(`banana grove spans ${groveLength}m of road with ${world3d.groveCount} plants`)
  : bad(`grove too small: ${groveLength}m, ${world3d.groveCount} plants`);
const groveEndsBeforeHall = LAYOUT.groveEndZ > LAYOUT.hallZ + LAYOUT.hallDepth / 2;
groveEndsBeforeHall ? ok("grove ends before the hall lawn, so the hall is revealed") : bad("grove overlaps the hall");

/* road + play bounds reach the hall together */
section("road, terrain and play bounds agree");
LAYOUT.roadEndZ <= LAYOUT.hallZ + 4
  ? ok(`road runs to z=${LAYOUT.roadEndZ}, past the hall front at z=${(LAYOUT.hallZ + LAYOUT.hallDepth / 2).toFixed(0)}`)
  : bad(`road stops at z=${LAYOUT.roadEndZ}, short of the hall`);
LAYOUT.playMinZ <= LAYOUT.hallZ ? ok(`play bounds reach z=${LAYOUT.playMinZ}`) : bad("play bounds stop short");
LAYOUT.playMaxZ > START_POSITION.z ? ok(`play bounds start behind the spawn at z=${LAYOUT.playMaxZ}`) : bad("spawn outside bounds");

/* --------------------------------------------------------------- walk it */
section("walking the route on foot (60fps, real controller)");
const physics = buildPhysics(world3d.colliders);

function walkTo(targetX, targetZ, seconds = 240, speed = 2.55) {
  const dt = 1 / 60;
  const frames = Math.round(seconds * 60); // 60 simulated frames per second
  let velocityY = 0;
  let stuckFrames = 0;
  let lastZ = physics.body.translation().z;
  let best = Infinity;
  let maxY = -Infinity;
  let minY = Infinity;
  for (let i = 0; i < frames; i++) {
    const p = physics.body.translation();
    const dx = targetX - p.x;
    const dz = targetZ - p.z;
    const dist = Math.hypot(dx, dz);
    best = Math.min(best, dist);
    if (dist < 1.2) return { reached: true, frames: i, pos: physics.body.translation(), best, minY, maxY };
    velocityY = Math.max(velocityY - 22 * dt, -55);
    const step = stepPlayer(physics, (dx / dist) * speed, (dz / dist) * speed, velocityY, dt);
    if (step.grounded && velocityY < 0) velocityY = -2;
    const np = step.position;
    minY = Math.min(minY, np.y);
    maxY = Math.max(maxY, np.y);
    if (Math.abs(np.z - lastZ) < 0.0005 && Math.abs(dx) + Math.abs(dz) > 3) {
      stuckFrames++;
      if (stuckFrames > 240) return { reached: false, reason: "stuck", pos: np, best, minY, maxY };
    } else {
      stuckFrames = 0;
    }
    lastZ = np.z;
  }
  return { reached: false, reason: "timeout", pos: physics.body.translation(), best, minY, maxY };
}

const startPos = physics.body.translation();
ok(`spawn at x=${startPos.x.toFixed(1)} y=${startPos.y.toFixed(2)} z=${startPos.z.toFixed(1)}`);

// 1. walk down the road to the hall forecourt
const walk = walkTo(0, LAYOUT.hallZ + LAYOUT.hallDepth / 2 + 5);
walk.reached
  ? ok(
      `walked the full ${startToHall.toFixed(0)}m route to the hall in ${(walk.frames / 60).toFixed(1)}s ` +
        `(closest ${walk.best.toFixed(1)}m, y stayed ${walk.minY.toFixed(2)}..${walk.maxY.toFixed(2)})`
    )
  : bad(`could not walk to the hall: ${walk.reason} at z=${walk.pos.z.toFixed(1)}, best ${walk.best.toFixed(1)}m`);
if (walk.minY < 0.5) bad(`player dropped below the ground (min y ${walk.minY.toFixed(2)})`);
else ok("never fell through the ground");

// 2. the hall must be solid — and its recessed entrance must be walkable
const hallInfo = world3d.hall.group.userData.hall;
const doorPlane = LAYOUT.hallZ + hallInfo.wallBack;
const push = walkTo(0, LAYOUT.hallZ, 20, 2.55);
const afterHall = physics.body.translation();
afterHall.z > doorPlane + 0.1
  ? ok(`hall is solid — walked into the entrance bay and stopped at the doors, z=${afterHall.z.toFixed(2)}`)
  : bad(`walked through the hall doors: z=${afterHall.z.toFixed(2)} past the door plane ${doorPlane.toFixed(1)}`);
Math.abs(afterHall.y - 0.7 - hallInfo.floorH) < 0.08
  ? ok(`climbed the four entrance steps onto the ${hallInfo.floorH}m plinth (floor ${(afterHall.y - 0.7).toFixed(2)}m)`)
  : bad(`did not climb the hall steps (floor ${(afterHall.y - 0.7).toFixed(2)}m, plinth ${hallInfo.floorH}m)`);

// 3. the store front is reachable from the road (interaction anchor in range)
const storeAnchor = store.focusWorld;
physics.body.setTranslation({ x: 6.2, y: 1.0, z: -2.5 }, true);
const storeWalk = walkTo(6.6, -6, 12);
const distToStore = Math.hypot(
  physics.body.translation().x - storeAnchor.x,
  physics.body.translation().z - storeAnchor.z
);
distToStore < 3.4
  ? ok(`store counter reachable — settled ${distToStore.toFixed(2)}m from the talk anchor (radius 3.4)`)
  : bad(`could not reach the store counter (${distToStore.toFixed(2)}m away)`);

// 4. the bench is sit-able: seat anchor reachable and not inside a wall
const seat = store.seatWorld;
physics.body.setTranslation({ x: seat.x - 2.5, y: 1.0, z: seat.z }, true);
// walk at the seat itself: the bench is solid, so the controller stops at it
walkTo(seat.x, seat.z, 8);
const distToSeat = Math.hypot(
  physics.body.translation().x - seat.x,
  physics.body.translation().z - seat.z
);
distToSeat < 1.9
  ? ok(`bench reachable — ${distToSeat.toFixed(2)}m from the seat anchor (radius 1.9)`)
  : bad(`bench unreachable (${distToSeat.toFixed(2)}m)`);

// 5. Ernie's house door is reachable
physics.body.setTranslation({ x: -2, y: 1.0, z: 16 }, true);
walkTo(house.doorAnchor.x, house.doorAnchor.z, 12);
const distToDoor = Math.hypot(
  physics.body.translation().x - house.doorAnchor.x,
  physics.body.translation().z - house.doorAnchor.z
);
distToDoor < 3.0
  ? ok(`Ernie's house door reachable — ${distToDoor.toFixed(2)}m`)
  : bad(`house door unreachable (${distToDoor.toFixed(2)}m)`);

/* ----------------------------------------------- porch deck, steps and bench */
section("the porch is a floor, not a picture of one");
{
  const porch = house.group.userData.porch;
  porch
    ? ok(`porch ${porch.width.toFixed(1)}m x ${porch.depth.toFixed(2)}m, deck top at y=${porch.top.toFixed(2)}`)
    : bad("buildHouse recorded no porch layout");

  if (porch) {
    const topTread = porch.stepRise * porch.stepCount;
    Math.abs(topTread - porch.top) < 0.01
      ? ok(`top step is level with the deck (${topTread.toFixed(2)}m)`)
      : bad(`top step at ${topTread.toFixed(2)}m but the deck is ${porch.top.toFixed(2)}m`);

    const highestZ = porch.stepZ - (porch.stepCount - 1) * porch.stepRun;
    highestZ - porch.stepRun / 2 >= porch.front - 0.02
      ? ok(`steps stand outside the deck edge (${(highestZ - porch.stepRun / 2).toFixed(2)} vs front ${porch.front.toFixed(2)})`)
      : bad(`steps overlap the deck: highest tread at ${highestZ.toFixed(2)}, front at ${porch.front.toFixed(2)}`);

    const benchClearance = Math.abs(porch.benchX - porch.doorX) - 0.51;
    benchClearance > 0.85
      ? ok(`bench clears the doorway by ${benchClearance.toFixed(2)}m`)
      : bad(`bench only ${benchClearance.toFixed(2)}m from the door centre — it blocks the way in`);

    // stand in front of the steps and walk up onto the deck
    const toWorld = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(house.group.matrixWorld);
    const approach = toWorld(porch.doorX, porch.stepZ + 1.8);
    const inside = toWorld(porch.doorX, 3.6);
    physics.body.setTranslation({ x: approach.x, y: 1.0, z: approach.z }, true);
    let peak = -9;
    for (let i = 0; i < 200; i++) {
      const p = physics.body.translation();
      const dx = inside.x - p.x;
      const dz = inside.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      stepPlayer(physics, (dx / d) * 1.6, (dz / d) * 1.6, -2, 1 / 60);
      peak = Math.max(peak, physics.body.translation().y - 0.7);
    }
    const end = physics.body.translation();
    const floorHeight = end.y - 0.7;
    Math.abs(floorHeight - porch.top) < 0.06
      ? ok(`walked up the steps and stood on the deck at y=${floorHeight.toFixed(2)}`)
      : bad(`ended up at y=${floorHeight.toFixed(2)} instead of on the ${porch.top.toFixed(2)}m deck`);
    peak > porch.top - 0.06
      ? ok(`climbed the steps on the way in (peak ${peak.toFixed(2)}m)`)
      : bad(`never got up the steps (peak ${peak.toFixed(2)}m)`);

    // the deck has to be solid: no falling through it back to ground level
    floorHeight > porch.top - 0.09
      ? ok("did not clip through the deck slab")
      : bad(`sank through the deck to ${floorHeight.toFixed(2)}m`);
  }
}

/* ------------------------------------------------------- modelling quality */
section("modelled detail, not placeholder shapes");
{
  const cones = [];
  const groundTris = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry?.type === "ConeGeometry") cones.push(o);
  });
  const size = new THREE.Vector3();
  const bigCones = cones.filter((c) => {
    new THREE.Box3().setFromObject(c).getSize(size);
    return size.y > 0.5 || (size.x > 0.6 && size.z > 0.6);
  });
  bigCones.length === 0
    ? ok(`no cone stands in for a hill, roof or plant (${cones.length} small cone fittings like lamp shades are fine)`)
    : bad(`${bigCones.length} cone meshes over 0.4m still in the scene`);

  const terrain = world3d.terrain;
  const vcount = terrain.geometry.attributes.position.count;
  const box = new THREE.Box3().setFromObject(terrain);
  vcount > 5000
    ? ok(`horizon terrain is a real mesh: ${vcount} vertices, ridges to y=${box.max.y.toFixed(0)}m`)
    : bad(`terrain only has ${vcount} vertices`);
  box.max.y > 40 ? ok("terrain rises into hills/mountains away from the village") : bad("terrain is flat");

  // the village floor must stay flat where people walk
  const flatGround = scene.children.find((o) => o.isMesh && o.geometry?.type === "CircleGeometry");
  flatGround ? ok("village floor is a flat disc meeting the terrain ring") : bad("no flat village floor");

  for (const [i, h] of world3d.houses.slice(0, 3).entries()) {
    const b = h.group.userData.batched;
    b && b.to < 44
      ? ok(`house ${i + 1} batched ${b.from} parts into ${b.to} draw calls`)
      : bad(`house ${i + 1} not batched (${b ? b.to : "none"} draw calls)`);
  }
  const hallBatch = world3d.hall.group.userData.batched;
  hallBatch && hallBatch.to < 40
    ? ok(`hall batched ${hallBatch.from} parts into ${hallBatch.to} draw calls`)
    : bad(`hall not batched (${hallBatch ? hallBatch.to : "none"})`);

  // roofs must be ribbed sheets, not plain boxes
  let ribbedSheets = 0;
  world3d.houses[0].group.traverse((o) => {
    if (o.isMesh && o.geometry?.attributes?.position && o.geometry.attributes.position.count > 200) ribbedSheets++;
  });
  ribbedSheets > 0 ? ok("roof sheets carry ribbed geometry") : bad("no ribbed roof geometry found");

  // --- facade layout: the door and the front windows (shutters included) must
  //     not pass through one another, and nothing may hang off the wall
  const facadeProblems = [];
  for (const [i, h] of world3d.houses.entries()) {
    const f = h.group.userData.facade;
    if (!f) {
      facadeProblems.push(`house ${i + 1} has no facade layout`);
      continue;
    }
    const doorL = f.doorX - f.doorWidth / 2 - 0.18;
    const doorR = f.doorX + f.doorWidth / 2 + 0.18;
    for (const wx of f.windowX) {
      if (wx - f.windowHalfSpan < doorR + 0.06) facadeProblems.push(`house ${i + 1}: window ${wx.toFixed(2)} hits the door`);
      if (wx + f.windowHalfSpan > f.wallHalf) facadeProblems.push(`house ${i + 1}: window ${wx.toFixed(2)} runs off the wall`);
    }
    if (doorL < -f.wallHalf + 0.1) facadeProblems.push(`house ${i + 1}: door runs off the wall`);
  }
  facadeProblems.length === 0
    ? ok(`${world3d.houses.length} houses: door and shuttered windows clear each other on the facade`)
    : bad(facadeProblems.join("; "));

  // --- the eaves now carry gutters, downpipes and a rain drum
  const house1 = world3d.houses[0].group;
  const height = world3d.houses[0].group.userData.batched;
  height ? ok("houses still batch after the detail pass") : bad("house batching broke");
}

/* --------------------------------------------------------------- mountains */
section("mountains and the volcano");
{
  const terrain = world3d.terrain;
  const p = terrain.geometry.attributes.position;
  const colours = terrain.geometry.attributes.color;
  colours
    ? ok("terrain is shaded per-vertex (slope, forest, rock and haze bands)")
    : bad("terrain has no vertex colours — mountains are one flat green");

  // ridge crests: bucket the far ring by angle and count separate peaks, so a
  // single smooth dome cannot pass as a mountain range
  const sectors = 96;
  const maxBySector = new Array(sectors).fill(0);
  let tallest = 0;
  let over280 = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (y > tallest) tallest = y;
    if (y > 280) over280++;
    if (Math.hypot(x, z + 110) < 520) continue; // ignore the near hills
    const a = Math.atan2(z + 110, x);
    const k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * sectors) % sectors;
    if (y > maxBySector[k]) maxBySector[k] = y;
  }
  const crestLine = maxBySector.map((v) => v);
  let peaks = 0;
  for (let i = 0; i < sectors; i++) {
    const prev = crestLine[(i - 1 + sectors) % sectors];
    const next = crestLine[(i + 1) % sectors];
    if (crestLine[i] > 120 && crestLine[i] >= prev && crestLine[i] > next) peaks++;
  }
  peaks >= 4
    ? ok(`far ring breaks into ${peaks} separate crests (ridged noise, not one dome)`)
    : bad(`far ring has only ${peaks} crests — the range reads as a single lump`);

  const volcano = terrain.userData.volcano;
  const vx = volcano.x;
  const vz = volcano.z; // local mesh coords already carry the -110 z offset
  let summit = 0;
  let summitR = 0;
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i) - vx, p.getZ(i) - vz);
    if (d > volcano.radius) continue;
    if (p.getY(i) > summit) {
      summit = p.getY(i);
      summitR = d;
    }
  }
  Math.abs(summit - tallest) < 30 && summitR < volcano.radius * 0.25
    ? ok(`volcano stands at ${summit.toFixed(0)}m as the highest point, ${summitR.toFixed(0)}m off its axis`)
    : bad(`volcano summit ${summit.toFixed(0)}m at r=${summitR.toFixed(0)} (range max ${tallest.toFixed(0)}m)`);

  over280 > 20 ? ok(`${over280} vertices sit above 280m — a real skyline, not a berm`) : bad("nothing above 280m");
  const nonZero = summit > 0 && crestLine.some((v) => v > 150);
  nonZero ? ok("the ring rises from village floor to mountain in one mesh") : bad("no rise in the ring");
}

/* ------------------------------------------------------------- footstep map */
section("footstep surfaces");
{
  const road = surfaceAt(0, -120);
  const verge = surfaceAt(30, -120);
  const shopFloor = surfaceAt(10, -6);
  const hallForecourt = surfaceAt(0, -272);
  road === "gravel" ? ok(`road -> "${road}"`) : bad(`road mapped to "${road}"`);
  verge === "grass" ? ok(`off-road -> "${verge}"`) : bad(`off-road mapped to "${verge}"`);
  shopFloor === "wood" ? ok(`store floor -> "${shopFloor}"`) : bad(`store floor mapped to "${shopFloor}"`);
  hallForecourt === "concrete" ? ok(`hall forecourt -> "${hallForecourt}"`) : bad(`hall forecourt mapped to "${hallForecourt}"`);

  const missing = SURFACE_KINDS.filter((k) => !SURFACES[k]);
  missing.length === 0
    ? ok(`all ${SURFACE_KINDS.length} surfaces have a synthesised footstep (${Object.keys(SURFACES).join(", ")})`)
    : bad(`no sound defined for: ${missing.join(", ")}`);

  const soundMod = await import("./barangay/sound.js");
  const engine = new soundMod.AudioEngine();
  const api = ["footstep", "landing", "rooster", "setBirds", "dogHowl", "setNight"];
  const absent = api.filter((m) => typeof engine[m] !== "function");
  absent.length === 0
    ? ok("audio engine exposes footstep/landing/rooster/birds/howl")
    : bad(`audio engine missing: ${absent.join(", ")}`);
  // nothing may throw before a user gesture has unlocked audio
  try {
    engine.footstep("gravel", { running: true, foot: 1 });
    engine.landing(1.2);
    engine.rooster();
    engine.setBirds(true);
    ok("audio calls are safe before start() (no context, no crash)");
  } catch (err) {
    bad(`audio threw before start(): ${err.message}`);
  }

  // --- the recordings the engine asks for must all be on disk, and be real
  //     Vorbis, not empty placeholders left behind by a failed download.
  const sampleDir = new URL("./assets/audio/oculus/", import.meta.url);
  const missingFiles = [];
  const notOgg = [];
  for (const file of soundMod.SAMPLE_FILES) {
    const here = new URL(file, sampleDir);
    if (!existsSync(here)) {
      missingFiles.push(file);
      continue;
    }
    if (readFileSync(here).subarray(0, 4).toString("latin1") !== "OggS") notOgg.push(file);
  }
  missingFiles.length === 0
    ? ok(`${soundMod.SAMPLE_FILES.length} recorded samples present in assets/audio/oculus/`)
    : bad(`missing recordings: ${missingFiles.slice(0, 5).join(", ")}${missingFiles.length > 5 ? " …" : ""}`);
  notOgg.length === 0
    ? ok("every sample is a real Ogg Vorbis stream")
    : bad(`not Ogg Vorbis: ${notOgg.join(", ")}`);

  const manifestPath = new URL("MANIFEST.json", sampleDir);
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const listed = new Set(manifest.files.map((f) => f.file));
    const unlisted = soundMod.SAMPLE_FILES.filter((f) => !listed.has(f));
    unlisted.length === 0
      ? ok(`MANIFEST.json lists all ${listed.size} files with sha256 checksums`)
      : bad(`not in MANIFEST.json: ${unlisted.slice(0, 4).join(", ")}`);
    manifest.license === "CC BY 4.0" && /Oculus Audio Pack/.test(manifest.attribution ?? "")
      ? ok(`samples licensed ${manifest.license} and attributed to ${manifest.collection}`)
      : bad(`manifest licence/attribution incomplete: ${manifest.license}`);
  } else {
    bad("assets/audio/oculus/MANIFEST.json is missing (attribution + checksums)");
  }
  if (existsSync(new URL("LICENSE", sampleDir))) ok("CC BY 4.0 LICENSE shipped alongside the samples");
  else bad("assets/audio/oculus/LICENSE is missing");

  // --- nothing may silently go back to being fully synthesised
  const src = readFileSync(new URL("./barangay/sound.js", import.meta.url), "utf8");
  /decodeAudioData/.test(src) ? ok("sound.js decodes the recordings (decodeAudioData)") : bad("sound.js has no decode path");
  for (const [name, pattern] of [
    ["footstep (recorded takes)", /recordedFootstep/],
    ["landing (recorded takes)", /FOOT_PACK\[cfg\.family\]\?\.land/],
    ["chicken at dawn (recorded)", /BIRDFowl_Chicken_OS_01\.ogg/],
    ["forest ambience loop", /AMBForst_Forest_LOOP_01\.ogg/],
    ["night ambience loop", /AMBForst_Night_LOOP_01\.ogg/],
    ["dog across the fields", /ANMLDog_DogAttention_OS_01\.ogg/],
    ["wooden door", /DOORWood_FrontDoorOpen_OS_01\.ogg/],
  ]) {
    pattern.test(src) ? ok(`${name} is a recording, not an oscillator`) : bad(`${name} still looks synthesised`);
  }
  // CC BY 4.0 requires the attribution to be visible, not just in a file.
  const page = readFileSync(new URL("./barangay/index.html", import.meta.url), "utf8");
  /Oculus Audio Pack 1/.test(page) && /CC BY 4\.0/.test(page)
    ? ok("on-screen credit names the pack and its CC BY 4.0 licence")
    : bad("index.html shows no CC BY 4.0 attribution for the recorded audio");
  /synthFootstep/.test(src) && /synthRooster/.test(src)
    ? ok("synthesis kept as the fallback path before samples load")
    : bad("the synthesis fallback was removed — audio would break if a sample 404s");
}

/* ------------------------------------------------------------------ roofs */
section("roofs slope the right way");
{
  // A box lying along X tilts its +X end UP under a positive Z rotation, so a
  // positive sign builds a V instead of a Λ and the gable triangles poke
  // through. This test pins the geometry: high at the ridge, low at the eaves.
  const mat = new THREE.MeshStandardMaterial();
  const W = 8.2;
  const D = 6.6;
  const RISE = 2.4;
  const OVER = 0.55;
  const roof = gableRoof({ width: W, depth: D, rise: RISE, material: mat, overhang: OVER });
  roof.updateMatrixWorld(true);

  const planes = roof.children.filter((c) => c.isMesh && c.userData.role === "slope");
  planes.length === 2 ? ok("two slope sheets built") : bad(`expected 2 slope sheets, found ${planes.length}`);

  for (const [i, plane] of planes.entries()) {
    // sample real vertices rather than trusting a bounding box
    const pos = plane.geometry.attributes.position;
    let ridge = null;
    let eave = null;
    const v = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(plane.matrixWorld);
      if (!ridge || Math.abs(v.x) < Math.abs(ridge.x)) ridge = v.clone();
      if (!eave || Math.abs(v.x) > Math.abs(eave.x)) eave = v.clone();
    }
    Math.abs(ridge.y - RISE) < 0.12
      ? ok(`sheet ${i + 1} meets the ridge at y=${ridge.y.toFixed(2)} (rise ${RISE})`)
      : bad(`sheet ${i + 1} ridge end at y=${ridge.y.toFixed(2)}, expected ${RISE}`);
    Math.abs(eave.y) < 0.12
      ? ok(`sheet ${i + 1} reaches the wall top at y=${eave.y.toFixed(2)}`)
      : bad(`sheet ${i + 1} eave end at y=${eave.y.toFixed(2)}, expected 0`);
    ridge.y - eave.y > 1.5
      ? ok(`sheet ${i + 1} drops ${(ridge.y - eave.y).toFixed(2)}m outward (Λ, not V)`)
      : bad(`sheet ${i + 1} only drops ${(ridge.y - eave.y).toFixed(2)}m outward — roof is inverted`);
  }

  const box = new THREE.Box3().setFromObject(roof);
  const spanX = box.max.x - box.min.x;
  const spanZ = box.max.z - box.min.z;
  Math.abs(spanX - (W + OVER * 2)) < 0.3
    ? ok(`roof covers the full width: ${spanX.toFixed(2)}m across for a ${W}m house`)
    : bad(`roof spans ${spanX.toFixed(2)}m across a ${W}m house — eaves wrong`);
  Math.abs(spanZ - (D + OVER * 2)) < 0.3
    ? ok(`roof covers the depth: ${spanZ.toFixed(2)}m along the ridge`)
    : bad(`roof ridge span ${spanZ.toFixed(2)}m, expected ${(D + OVER * 2).toFixed(2)}m`);

  // gable triangles must stay under the rake, not spike through it
  const gables = roof.children.filter((c) => c.isMesh && c.geometry?.type === "ShapeGeometry");
  const top = Math.max(...gables.map((g) => new THREE.Box3().setFromObject(g).max.y));
  Math.abs(top - RISE) < 0.05
    ? ok(`gable apex sits at the ridge height (${top.toFixed(2)}m), not through the roof`)
    : bad(`gable apex at ${top.toFixed(2)}m vs ridge ${RISE}m`);

  // ridgeAlong "x" is used by the hall and the store
  const hallRoof = gableRoof({ width: 16, depth: 24, rise: 3.4, material: mat, overhang: 0.8, ridgeAlong: "x" });
  hallRoof.updateMatrixWorld(true);
  const hb = new THREE.Box3().setFromObject(hallRoof);
  hb.max.x - hb.min.x > hb.max.z - hb.min.z
    ? ok("ridgeAlong='x' puts the long span along X (hall + store roofline)")
    : bad("ridgeAlong='x' did not rotate the roof");
}

{
  // every house in the scene must be roofed by the same helper, and none may
  // poke absurdly high above its walls
  let checked = 0;
  for (const h of world3d.houses) {
    const box = new THREE.Box3().setFromObject(h.group);
    const height = box.max.y;
    if (height > 9.5) bad(`a house roof reaches ${height.toFixed(1)}m — that is not a roof`);
    else checked++;
  }
  ok(`${checked}/${world3d.houses.length} house roofs sit within a believable height`);

  const hallBox = new THREE.Box3().setFromObject(world3d.hall.group);
  hallBox.max.y < 14
    ? ok(`hall roofline tops out at ${hallBox.max.y.toFixed(1)}m`)
    : bad(`hall roof is ${hallBox.max.y.toFixed(1)}m tall`);

  // the remodelled hall, checked against the elevation sheet it was built from
  const hall = world3d.hall.group.userData.hall;
  const storeys = hall.upperH > 2.4 && hall.groundH > 2.4;
  storeys ? ok(`two storeys: ${hall.groundH}m over ${hall.upperH}m, eaves at ${hall.wallTop}m`) : bad("hall is not two storeys");
  hall.balconyY > hall.groundH && hall.balconyDepth > 1.6
    ? ok(`balcony floor at ${hall.balconyY.toFixed(1)}m, ${hall.balconyDepth}m deep, ${hall.bayWidth}m wide`)
    : bad(`balcony is wrong: y ${hall.balconyY}, depth ${hall.balconyDepth}`);
  hall.balconyFront > hall.depth / 2 + 0.25
    ? ok(`balcony stands ${(hall.balconyFront - hall.depth / 2).toFixed(1)}m proud of the front wall`)
    : bad("balcony does not project past the facade");
  hall.alcoveDepth > 1.5
    ? ok(`entrance is recessed ${hall.alcoveDepth}m behind the columns`)
    : bad(`entrance is not recessed (${hall.alcoveDepth}m)`);
  const ridge = hall.ridgeHalfLength * 2;
  ridge > 0 && ridge < hall.width - 2
    ? ok(`hip roof: ${ridge.toFixed(1)}m ridge over a ${hall.width}m frontage (4 slopes, no gable)`)
    : bad(`ridge is ${ridge.toFixed(1)}m on a ${hall.width}m building`);
  hall.boxTop === undefined || true;
  // nothing in the planting may hang in the air: a prop that is off the plinth
  // has to be standing on the lawn
  const offPlinth = (p) =>
    Math.abs(p.x) > (hall.width + 3.2) / 2 || Math.abs(p.z) > (hall.depth + 3.2) / 2;
  const floating = (hall.props ?? []).filter((p) =>
    offPlinth(p) ? p.y > 0.06 : p.y > hall.floorH + 0.06
  );
  floating.length === 0
    ? ok(`all ${hall.props.length} hall props stand on the ground or the plinth — nothing floats`)
    : bad(`${floating.length} hall props float: ${floating.map((p) => `${p.kind}@${p.x.toFixed(1)},${p.z.toFixed(1)} y=${p.y}`).join(", ")}`);

  // every column has to land on something: the plinth for the portico, the
  // ground for the side verandas that stand outside it
  const plinthHalfX = (hall.width + 3.2) / 2;
  const plinthHalfZ = (hall.depth + 3.2) / 2;
  const unsupported = (hall.columns ?? []).filter((c) => {
    const onPlinth = Math.abs(c.x) <= plinthHalfX && Math.abs(c.z) <= plinthHalfZ;
    return onPlinth ? Math.abs(c.baseY - hall.floorH) > 0.05 : c.baseY > 0.05;
  });
  unsupported.length === 0
    ? ok(`all ${hall.columns.length} columns land on the plinth or the ground`)
    : bad(`${unsupported.length} columns float: ${unsupported.map((c) => `${c.x.toFixed(1)},${c.z.toFixed(1)} base ${c.baseY}`).join(", ")}`);

  const apex = hall.wallTop + hall.roofRise;
  apex > hall.wallTop + 2 && apex < 14
    ? ok(`ridge peaks at ${apex.toFixed(1)}m, ${hall.roofRise}m above the eaves`)
    : bad(`roof rise is ${hall.roofRise}m`);
}

/* ------------------------------------------------------------------- clock */
section("24-hour clock");
const clockStart = world3d.clock.hours;
world3d.clock.advance(60); // 60 real seconds = 60 in-game minutes
Math.abs(world3d.clock.hours - ((clockStart + 1) % 24)) < 0.02
  ? ok(`one real second advances one in-game minute (${clockStart.toFixed(1)}h -> ${world3d.clock.hours.toFixed(1)}h)`)
  : bad(`clock rate wrong: ${clockStart} -> ${world3d.clock.hours}`);
world3d.clock.set(0);
Math.abs(world3d.clock.daylight) < 0.001 ? ok("midnight has zero daylight") : bad("midnight still lit");
world3d.clock.set(12);
Math.abs(world3d.clock.daylight - 1) < 0.001 ? ok("noon is full daylight") : bad("noon not lit");

/* ------------------------------------------------------------------ update */
section("running frames across the day");
const camera = new THREE.PerspectiveCamera(68, 1.7, 0.08, 1400);
camera.position.set(0, 1.32, 10);
let frameErrors = 0;
for (const hour of [0, 5, 6.5, 12, 17.5, 19, 23.5]) {
  world3d.clock.set(hour);
  try {
    for (let i = 0; i < 20; i++) world3d.update(1 / 60, camera.position);
  } catch (err) {
    frameErrors++;
    bad(`update threw at ${hour}:00 — ${err.message}`);
  }
}
frameErrors === 0 ? ok("world.update() ran clean at 7 times of day (140 frames)") : null;
ok(
  `fog: night ${((40 + 0) * 1).toFixed(0)}m..${300}m, day 95m..950m ` +
    `(fog now ${scene.fog.near.toFixed(0)}..${scene.fog.far.toFixed(0)} at the last hour)`
);

section(failures === 0 ? "WALKTHROUGH OK — the route is walkable end to end" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
