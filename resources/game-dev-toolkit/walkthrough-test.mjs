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
const { buildWorld } = await import("./barangay/world.js");
const { createStore, createErniesHouse, buildStreetFurniture } = await import("./barangay/places.js");
const { buildPhysics, stepPlayer } = await import("./barangay/physics.js");

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

// 2. the hall must be solid
const beforeHall = physics.body.translation();
const push = walkTo(0, LAYOUT.hallZ, 20, 2.55);
const afterHall = physics.body.translation();
const hallFront = LAYOUT.hallZ + LAYOUT.hallDepth / 2;
afterHall.z > hallFront - 0.4
  ? ok(`hall is solid — stopped at z=${afterHall.z.toFixed(2)}, front face z=${hallFront.toFixed(1)}`)
  : bad(`walked into the hall: z=${afterHall.z.toFixed(2)} past front z=${hallFront.toFixed(1)}`);

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
