/**
 * preview.mjs — render the built scene to PNG without a browser or a GPU.
 *
 * There is no Chromium and no WebGL in this sandbox, so the only way to look at
 * what the modelling code actually produces is to rasterise it here: project
 * every triangle with the real camera matrices, shade it flat, and write a PNG.
 * It is not the game's renderer — textures, shadows, fog and the sky shader are
 * all missing — but silhouettes, proportions and construction errors show up.
 *
 * Usage (from resources/game-dev-toolkit):
 *   node tools/preview.mjs house      -> preview-house.png
 *   node tools/preview.mjs street     -> preview-street.png
 *   node tools/preview.mjs mountains  -> preview-mountains.png
 *   node tools/preview.mjs porch      -> preview-porch.png
 *   node tools/preview.mjs hall       -> preview-hall.png (hall on its own)
 *   node tools/preview.mjs forecourt  -> preview-forecourt.png (hall in situ)
 *   node tools/preview.mjs all
 *
 * PNG encoding is delegated to ImageMagick (`convert`), which is present here;
 * the rasteriser itself writes a PPM first.
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/* ---------------------------------------------------------------- canvas stub */
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
globalThis.document = { createElement: () => ({ width: 512, height: 512, getContext: () => ctx2d }) };

const THREE = await import("three");
const { buildWorld, buildHouse, buildHall, LAYOUT } = await import("../barangay/world.js");
const { createStore } = await import("../barangay/places.js");

const W = 1100;
const H = 680;
const LIGHT = new THREE.Vector3(0.45, 0.82, 0.36).normalize();

/** Flat colour for a material, approximating what the map would have been. */
function materialColour(mat) {
  const c = new THREE.Color(1, 1, 1);
  if (!mat) return c;
  if (mat.color) c.copy(mat.color);
  if (mat.map && c.r > 0.92 && c.g > 0.92 && c.b > 0.92) c.setHex(0xc9c1ad); // textured wall / roof sheet
  if (mat.emissive && mat.emissiveIntensity > 0) c.lerp(mat.emissive, 0.35);
  return c;
}

function render(scene, camera, outPath) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const colour = new Uint8ClampedArray(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);
  // sky gradient
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = 168 + (108 - 168) * t;
    const g = 197 + (150 - 197) * t;
    const b = 220 + (196 - 220) * t;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      colour[i] = r;
      colour[i + 1] = g;
      colour[i + 2] = b;
    }
  }

  const view = camera.matrixWorldInverse;
  const proj = camera.projectionMatrix;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  let drawn = 0;

  scene.traverse((obj) => {
    if (!obj.isMesh || obj.isSkinnedMesh) return;
    const geo = obj.geometry;
    const pos = geo.attributes?.position;
    if (!pos) return;
    const index = geo.index;
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (!mat || mat.isShaderMaterial) return; // sky dome: the gradient already stands in
    const base = materialColour(mat);
    // vertex colours matter on the terrain ring, which is all one material
    const vcol = mat.vertexColors ? geo.attributes.color : null;
    const triCount = index ? index.count / 3 : pos.count / 3;

    for (let t = 0; t < triCount; t++) {
      const ia = index ? index.getX(t * 3) : t * 3;
      const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(obj.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(obj.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(obj.matrixWorld);

      // face normal + a little two-sided shading
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      n.crossVectors(e1, e2).normalize();
      if (n.dot(e1.subVectors(eye, a)) < 0) n.negate();
      const lambert = 0.5 + 0.62 * Math.max(0, n.dot(LIGHT));
      const shade = Math.min(1.25, lambert);

      // camera space, then clip against the near plane. Without this the big
      // ground disc and the road vanish as soon as one corner passes the camera.
      const verts = [
        { world: a.clone(), view: a.clone().applyMatrix4(view) },
        { world: b.clone(), view: b.clone().applyMatrix4(view) },
        { world: c.clone(), view: c.clone().applyMatrix4(view) },
      ];
      const near = -0.25;
      const poly = [];
      for (let i = 0; i < verts.length; i++) {
        const cur = verts[i];
        const nxt = verts[(i + 1) % verts.length];
        const curIn = cur.view.z <= near;
        const nxtIn = nxt.view.z <= near;
        if (curIn) poly.push(cur);
        if (curIn !== nxtIn) {
          const t = (near - cur.view.z) / (nxt.view.z - cur.view.z);
          poly.push({
            world: cur.world.clone().lerp(nxt.world, t),
            view: cur.view.clone().lerp(nxt.view, t),
          });
        }
      }
      if (poly.length < 3) continue;
      const screen = poly.map((v) => {
        const pv = v.view.clone().applyMatrix4(proj);
        return {
          x: (pv.x * 0.5 + 0.5) * W,
          y: (0.5 - pv.y * 0.5) * H,
          z: 1 / -v.view.z,
        };
      });

      let cr = base.r;
      let cg = base.g;
      let cb = base.b;
      if (vcol) {
        cr = (vcol.getX(ia) + vcol.getX(ib) + vcol.getX(ic)) / 3;
        cg = (vcol.getY(ia) + vcol.getY(ib) + vcol.getY(ic)) / 3;
        cb = (vcol.getZ(ia) + vcol.getZ(ib) + vcol.getZ(ic)) / 3;
      }
      const rr = Math.min(255, cr * shade * 255);
      const gg = Math.min(255, cg * shade * 255);
      const bb = Math.min(255, cb * shade * 255);

      for (let f = 1; f + 1 < screen.length; f++) {
        const A = screen[0];
        const B = screen[f];
        const C = screen[f + 1];
        const ax = A.x, ay = A.y, bx = B.x, by = B.y, cx = C.x, cy = C.y;
        const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
        const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
        const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
        const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        if (maxX < minX || maxY < minY) continue;
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (Math.abs(area) < 1e-9) continue;
        const inv = 1 / area;
        const za = A.z, zb = B.z, zc = C.z;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) * inv;
          const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const iz = w0 * za + w1 * zb + w2 * zc;
          if (iz <= 0) continue;
          const z = 1 / iz;
          const di = y * W + x;
          if (z >= depth[di]) continue;
          depth[di] = z;
          const ci = di * 3;
          colour[ci] = rr;
          colour[ci + 1] = gg;
          colour[ci + 2] = bb;
        }
      }
      drawn++;
      }
    }
  });

  // decodeAudioData-style PPM out, then let ImageMagick do the PNG
  const header = Buffer.from(`P6\n${W} ${H}\n255\n`, "latin1");
  const ppm = `/tmp/preview-${outPath.split("/").pop().replace(/\.png$/, "")}.ppm`;
  writeFileSync(ppm, Buffer.concat([header, Buffer.from(colour.buffer)]));
  execFileSync("convert", [ppm, outPath]);
  console.log(`${outPath} — ${drawn} triangles rasterised`);
}

function cameraAt(pos, look, fov = 55) {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 4000);
  cam.position.set(pos.x, pos.y, pos.z);
  cam.lookAt(look.x, look.y, look.z);
  return cam;
}

function ground(scene, colour = 0x6f7a4e, size = 900) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 1 })
  );
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);
}

const which = process.argv[2] ?? "house";

if (which === "house" || which === "all") {
  const scene = new THREE.Scene();
  ground(scene);
  const house = buildHouse({ seed: 3, width: 8.2, depth: 6.6, porch: true, fence: true, laundry: true });
  house.group.position.set(0, 0, 0);
  scene.add(house.group);
  render(scene, cameraAt({ x: -9.5, y: 4.2, z: 9.5 }, { x: 0, y: 1.7, z: 0.6 }), "preview-house.png");
}

if (which === "porch" || which === "all") {
  const scene = new THREE.Scene();
  ground(scene);
  const house = buildHouse({ seed: 3, width: 8.2, depth: 6.6, porch: true, fence: true, laundry: true });
  house.group.position.set(0, 0, 0);
  scene.add(house.group);
  const porch = house.group.userData.porch;
  // stand in the yard, off the door axis, looking along the porch
  render(
    scene,
    cameraAt(
      { x: porch.doorX - 3.6, y: 1.55, z: porch.stepZ + 2.3 },
      { x: porch.doorX + 1.6, y: 0.75, z: porch.front - 0.1 }
    ),
    "preview-porch.png"
  );
}

if (which === "porchfront" || which === "all") {
  const scene = new THREE.Scene();
  ground(scene);
  const house = buildHouse({ seed: 3, width: 8.2, depth: 6.6, porch: true, fence: false, laundry: false });
  house.group.position.set(0, 0, 0);
  scene.add(house.group);
  const porch = house.group.userData.porch;
  render(
    scene,
    cameraAt(
      { x: porch.doorX - 0.4, y: 1.35, z: porch.stepZ + 3.4 },
      { x: porch.benchX - 0.9, y: 0.7, z: porch.front - 0.5 }
    ),
    "preview-porchfront.png"
  );
}

if (which === "street" || which === "all") {
  const scene = new THREE.Scene();
  const world = buildWorld(scene, { startHour: 15 });
  render(
    scene,
    cameraAt({ x: 3.0, y: 1.75, z: -34 }, { x: 0.5, y: 6, z: -150 }),
    "preview-street.png"
  );
  void world;
}

if (which === "hall" || which === "all") {
  // the hall on its own: from anywhere in the village the banana grove closes
  // over the forecourt and hides the ground storey, which makes a poor portrait
  const scene = new THREE.Scene();
  ground(scene);
  const hall = buildHall(scene, []);
  render(
    scene,
    cameraAt({ x: 9, y: 3.6, z: LAYOUT.hallZ + 34 }, { x: 0, y: 4.9, z: LAYOUT.hallZ + 8 }, 40),
    "preview-hall.png"
  );
  void hall;
}

if (which === "forecourt" || which === "all") {
  // what the player sees the moment the grove opens up: the hall in situ
  const scene = new THREE.Scene();
  const world = buildWorld(scene, { startHour: 16 });
  render(
    scene,
    cameraAt({ x: 2.2, y: 1.7, z: LAYOUT.hallZ + 18 }, { x: 0, y: 5.4, z: LAYOUT.hallZ + 8 }, 82),
    "preview-forecourt.png"
  );
  void world;
}

if (which === "hallsteps" || which === "all") {
  // the entrance as the player walks up to it: pots, steps, doors
  const scene = new THREE.Scene();
  const hall = buildHall(scene, []);
  render(
    scene,
    cameraAt({ x: 4.6, y: 1.7, z: LAYOUT.hallZ + 21 }, { x: 0, y: 3.2, z: LAYOUT.hallZ + 9 }, 58),
    "preview-hallsteps.png"
  );
  void hall;
}

if (which === "store" || which === "all") {
  const scene = new THREE.Scene();
  const world = buildWorld(scene, { startHour: 15 });
  await createStore(scene, world.colliders, null);
  render(scene, cameraAt({ x: 4.5, y: 2.4, z: 1.5 }, { x: 10.5, y: 1.6, z: -6 }), "preview-store.png");
  void world;
}

if (which === "mountains" || which === "all") {
  const scene = new THREE.Scene();
  const world = buildWorld(scene, { startHour: 15 });
  render(
    scene,
    cameraAt({ x: 0, y: 2.2, z: -60 }, { x: 40, y: 120, z: -700 }),
    "preview-mountains.png"
  );
  void world;
}
