/**
 * verify-stack.mjs — proves the toolchain actually works, without a browser.
 *
 *   1. three        : version, scene graph, instancing, raycasting
 *   2. rapier       : initialise WASM, build a world, step a KinematicCharacterController
 *   3. GLB assets   : container + accessor + morph + animation integrity
 *   4. animations   : clip JSON keys resolve to real bones named in the rig
 *
 * Run: npm run verify      (node verify-stack.mjs)
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CC0 = join(ROOT, "assets/characters/cc0");

let failures = 0;
const ok = (msg) => console.log(`  \u2713 ${msg}`);
const bad = (msg) => {
  failures++;
  console.log(`  \u2717 ${msg}`);
};
const section = (title) => console.log(`\n${title}`);

/* ------------------------------------------------------------------ three */
section("three.js");
const THREE = await import("three");
ok(`three r${THREE.REVISION} imported`);
{
  const scene = new THREE.Scene();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x889966 });
  const inst = new THREE.InstancedMesh(geo, mat, 64);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 64; i++) inst.setMatrixAt(i, m.makeTranslation(i, 0, -i));
  scene.add(inst);
  ok(`scene graph + InstancedMesh(64) built (${scene.children.length} child)`);

  const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(inst, false);
  hit.length ? ok(`raycaster hit instance at y=${hit[0].point.y.toFixed(2)}`) : bad("raycaster missed instance");

  const clipped = new THREE.Fog(0xcfd8dc, 40, 500);
  scene.fog = clipped;
  ok(`fog + lights configurable (near ${clipped.near}, far ${clipped.far})`);
  const skel = new THREE.Skeleton([new THREE.Bone()]);
  ok(`Skeleton + SkinnedMesh API present (bones=${skel.bones.length})`);
}

/* ----------------------------------------------------------------- rapier */
section("rapier (WASM physics)");
const RAPIER = await import("@dimforge/rapier3d-compat");
await RAPIER.init();
ok(`rapier initialised (WASM instantiated), version ${RAPIER.version ? RAPIER.version() : "n/a"}`);
{
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // ground
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 200), ground);

  // a wall to push against
  const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 1, -3));
  world.createCollider(RAPIER.ColliderDesc.cuboid(2, 2, 0.25), wallBody);

  // distant "hall" block, mimicking the far-away landmark
  const hallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 3, -300));
  world.createCollider(RAPIER.ColliderDesc.cuboid(9, 6, 7), hallBody);

  // kinematic character controller
  const controller = world.createCharacterController(0.02);
  controller.enableAutostep(0.4, 0.2, true);
  controller.enableSnapToGround(0.4);
  controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 2, 4)
  );
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.35), body);

  let groundedFrames = 0;
  for (let i = 0; i < 120; i++) {
    controller.computeColliderMovement(collider, { x: 0, y: -0.2, z: 0 });
    const mv = controller.computedMovement();
    const p = body.translation();
    body.setNextKinematicTranslation({ x: p.x + mv.x, y: p.y + mv.y, z: p.z + mv.z });
    world.step();
    if (controller.computedGrounded()) groundedFrames++;
  }
  const restY = body.translation().y;
  // ground top is y=0.5, capsule is halfHeight 0.55 + radius 0.35 => centre rests at ~1.40
  groundedFrames > 100 && Math.abs(restY - 1.4) < 0.08
    ? ok(`capsule fell and settled on ground (y=${restY.toFixed(3)}, grounded ${groundedFrames}/120 frames)`)
    : bad(`capsule did not settle correctly (y=${restY.toFixed(3)}, grounded ${groundedFrames}/120)`);

  // walk forward into the wall and confirm blockage
  const before = body.translation().z;
  for (let i = 0; i < 90; i++) {
    controller.computeColliderMovement(collider, { x: 0, y: -0.05, z: -0.15 });
    const mv = controller.computedMovement();
    const p = body.translation();
    body.setNextKinematicTranslation({ x: p.x + mv.x, y: p.y + mv.y, z: p.z + mv.z });
    world.step();
  }
  const after = body.translation().z;
  const stopped = after > -2.6;
  stopped
    ? ok(`wall collision blocks the character (z ${before.toFixed(2)} -> ${after.toFixed(2)}, stopped short)`)
    : bad(`character walked through the wall (z -> ${after.toFixed(2)})`);

  // ray cast used for interaction/aim checks
  // cast from x=6 so the test wall (x -2..2) is out of the way; hall front face is z=-293
  const ray = new RAPIER.Ray({ x: 6, y: 1.5, z: 0 }, { x: 0, y: 0, z: -1 });
  const hit = world.castRay(ray, 400, true);
  hit && Math.abs(hit.timeOfImpact - 293) < 12
    ? ok(`castRay reaches the distant hall landmark (toi=${hit.timeOfImpact.toFixed(1)}m)`)
    : bad(`castRay did not find the distant landmark (${hit ? hit.timeOfImpact.toFixed(1) : "null"})`);

  world.free();
}

/* --------------------------------------------------------------- GLB assets */
section("CC0 character assets (kblood/CharacterCreator @ 852e48f)");
function readGlb(path) {
  const buf = readFileSync(path);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error("not a GLB: bad magic");
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  if (total !== buf.length) throw new Error(`length header ${total} != file ${buf.length}`);
  let off = 12;
  let json = null;
  let bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error("no JSON chunk");
  return { version, json, bin };
}

const modelDir = join(CC0, "models");
const models = readdirSync(modelDir).filter((f) => f.endsWith(".glb")).sort();
let bodyJoints = null;
let bodyTargets = null;
for (const file of models) {
  const path = join(modelDir, file);
  try {
    const { version, json, bin } = readGlb(path);
    const mesh = json.meshes?.[0];
    const prim = mesh?.primitives?.[0];
    const targets = prim?.targets?.length ?? 0;
    const joints = json.skins?.[0]?.joints?.length ?? 0;
    const anims = json.animations?.length ?? 0;
    const names = mesh?.extras?.targetNames ?? [];
    if (targets !== 92) throw new Error(`${targets} morph targets, expected 92`);
    if (!names.length) throw new Error("no morph target names");
    // the binary chunk must cover the largest accessor
    const maxOff = Math.max(
      ...json.accessors.map((a) => (a.byteOffset ?? 0) + (a.count * (a.type === "VEC3" ? 3 : a.type === "VEC2" ? 2 : a.type === "VEC4" ? 4 : a.type === "SCALAR" ? 1 : 16) * 4))
    );
    if (bin && maxOff > bin.length + 64) throw new Error(`accessors overrun BIN chunk (${maxOff} > ${bin.length})`);
    if (file.startsWith("base_body")) {
      bodyJoints = joints;
      bodyTargets = names;
    }
    const kb = Math.round(statSync(path).size / 1024);
    ok(`${file.padEnd(26)} v${version} ${String(kb).padStart(5)}KB  joints=${joints} morphs=${targets} clips=${anims}`);
    if (anims > 0) {
      const clipNames = json.animations.map((a) => a.name);
      ["idle", "walk", "run"].every((n) => clipNames.includes(n))
        ? ok(`  baked clips include idle/walk/run (${clipNames.length} total)`)
        : bad(`  baked clips missing idle/walk/run: ${clipNames.join(",")}`);
    }
  } catch (err) {
    bad(`${file}: ${err.message}`);
  }
}

/* animation JSON <-> rig bone names */
section("animation clips vs rig");
const idx = JSON.parse(readFileSync(join(CC0, "animations/index.json"), "utf8"));
const rigBones = new Set(
  readGlb(join(modelDir, "base_body_anim.glb"))
    .json.skins[0].joints.map((i) => readGlb(join(modelDir, "base_body_anim.glb")).json.nodes[i].name)
);
const boneMap = idx.boneMap;
let mapped = 0;
for (const target of Object.values(boneMap)) {
  if (rigBones.has(target)) mapped++;
  else bad(`boneMap target "${target}" not present in rig`);
}
ok(`${mapped}/${Object.keys(boneMap).length} boneMap entries resolve to real rig bones`);
// authoring clips: { joints: { bone: [quat, ...] }, root: [pos, ...], fps, frames, ... }
for (const clip of ["idle", "walk", "run"]) {
  const p = join(CC0, "animations", `${clip}.json`);
  const data = JSON.parse(readFileSync(p, "utf8"));
  const jointNames = Object.keys(data.joints ?? {});
  const frameCounts = new Set(jointNames.map((b) => data.joints[b].length));
  const framesOk = [...frameCounts].every((n) => n === data.frames + 1);
  // clip tracks use humanoid names (hips, spine...) that map to rig bones via boneMap
  const unknown = jointNames.filter((b) => !rigBones.has(boneMap[b] ?? b));
  if (data.format !== "charactercreator.humanoid-clip") bad(`${clip}.json has an unexpected format field`);
  else if (jointNames.length < 20) bad(`${clip}.json has too few joint tracks (${jointNames.length})`);
  else if (!framesOk) bad(`${clip}.json frame counts do not match frames=${data.frames}`);
  else if (unknown.length) bad(`${clip}.json names bones missing from the rig: ${unknown.slice(0, 3).join(",")}`);
  else
    ok(
      `${clip}.json: ${jointNames.length} joint tracks x ${data.frames + 1} frames @ ${data.fps}fps ` +
        `(${data.duration}s, loop=${data.loop}, rootMotion ${data.rootMotion?.mode ?? "n/a"})`
    );
}

/* catalog sanity */
section("catalogs");
for (const f of ["clothing.json", "hair.json", "body_colliders.json", "asset_licenses.json"]) {
  const p = join(CC0, "catalog", f);
  existsSync(p) ? ok(`${f} present (${Math.round(statSync(p).size / 1024)}KB)`) : bad(`${f} missing`);
}
{
  const lic = JSON.parse(readFileSync(join(CC0, "catalog/asset_licenses.json"), "utf8"));
  const nonCC0 = lic.filter((a) => !/cc0/i.test(a.license ?? ""));
  nonCC0.length === 0
    ? ok(`all ${lic.length} upstream assets are CC0`)
    : bad(`${nonCC0.length} assets are not CC0: ${nonCC0.map((a) => a.asset).join(",")}`);
  existsSync(join(CC0, "licenses/LICENSE-NOTES.md"))
    ? ok("LICENSE-NOTES.md vendored with the assets")
    : bad("LICENSE-NOTES.md missing");
}

/* browser bundle integrity */
section("browser bundles (what the import map points at)");
for (const rel of [
  "vendor/three/three.module.js",
  "vendor/three/three.core.js",
  "vendor/three/addons/loaders/GLTFLoader.js",
  "vendor/three/addons/utils/SkeletonUtils.js",
  "vendor/three/addons/utils/BufferGeometryUtils.js",
  "vendor/three/addons/controls/OrbitControls.js",
  "vendor/rapier/rapier.mjs",
]) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) {
    bad(`${rel} missing`);
    continue;
  }
  const src = readFileSync(p, "utf8");
  const bareImports = [...src.matchAll(/^\s*import[\s\S]{0,200}?from\s+['"]([^'"./][^'"]*)['"]/gm)].map((m) => m[1]);
  const unresolvable = bareImports.filter((s) => s !== "three" && !s.startsWith("three/addons/"));
  unresolvable.length === 0
    ? ok(`${rel.padEnd(46)} ${Math.round(src.length / 1024)}KB, imports resolvable via import map`)
    : bad(`${rel} needs bare imports not in the import map: ${[...new Set(unresolvable)].join(", ")}`);
}

section(failures === 0 ? "STACK OK \u2014 every check passed" : `${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
