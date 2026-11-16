/**
 * places.js — the places Ernie actually walks up to: the sari-sari store (with
 * its long side upuan and the tindera behind the counter) and Ernie's own house.
 *
 * Layout: the store sits on the right of the road at z=-6, front facing the
 * road; Ernie's house sits on the left at z=+18. Both were rebuilt here from
 * the design notes — the original scene files were not recoverable.
 */
import * as THREE from "three";
import { buildHouse } from "./world.js";
import * as TEX from "./textures.js";

/* ------------------------------------------------------------------- store */
export async function createStore(scene, colliders, characters) {
  const group = new THREE.Group();
  group.position.set(10.5, 0, -6);
  group.rotation.y = -Math.PI / 2; // front (+Z local) faces the road

  const W = 7.2;
  const D = 5.6;
  const wallH = 3.1;
  const plasterMat = new THREE.MeshStandardMaterial({ map: TEX.plaster(2), color: 0xc8d6bd, roughness: 0.95 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2f5d43, roughness: 0.8 });
  const woodMat = new THREE.MeshStandardMaterial({ map: TEX.wood(2), roughness: 0.9 });
  const nipaMat = new THREE.MeshStandardMaterial({ map: TEX.nipa(4), roughness: 0.95 });

  /* shell: back and side walls only, so the front is an open counter */
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.2, wallH, D), plasterMat);
  sideL.position.set(-W / 2, wallH / 2, 0);
  const sideR = sideL.clone();
  sideR.position.x = W / 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, wallH, 0.2), plasterMat);
  back.position.set(0, wallH / 2, -D / 2);
  const frontTop = new THREE.Mesh(new THREE.BoxGeometry(W, 0.75, 0.2), plasterMat);
  frontTop.position.set(0, wallH - 0.375, D / 2); // header above the service window
  for (const m of [sideL, sideR, back, frontTop]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.3, D + 0.4), new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 1 }));
  base.position.y = 0.15;
  base.receiveShadow = true;
  group.add(base);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.5, D - 0.5), new THREE.MeshStandardMaterial({ color: 0x6d5b46, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.31;
  group.add(floor);

  /* roof */
  const roofGroup = new THREE.Group();
  const rise = 1.9;
  const w2 = W / 2 + 0.7;
  const slope = Math.sqrt(w2 * w2 + rise * rise);
  const angle = Math.atan2(rise, w2);
  for (const side of [-1, 1]) {
    const plane = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.14, D + 1.6), nipaMat);
    plane.rotation.z = side * angle;
    plane.position.set((side * w2) / 2, wallH + rise / 2, 0);
    plane.castShadow = true;
    group.add(plane);
  }
  roofGroup.position.y = 0;
  group.add(roofGroup);

  /* counter + service window */
  const counter = new THREE.Mesh(new THREE.BoxGeometry(W - 1.4, 1.05, 0.5), woodMat);
  counter.position.set(0, 0.82, D / 2 - 0.35);
  counter.castShadow = true;
  group.add(counter);
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(W - 1.2, 0.08, 0.66), new THREE.MeshStandardMaterial({ color: 0x8d6f4d, roughness: 0.8 }));
  counterTop.position.set(0, 1.38, D / 2 - 0.35);
  group.add(counterTop);

  /* shelves behind the tindera, with products */
  const shelfMat = new THREE.MeshStandardMaterial({ map: TEX.wood(2, "#7a5c3a"), roughness: 0.9 });
  const productColors = [
    0xd94f3d, 0xf0c419, 0x3f8fd0, 0x59a14f, 0xe07b39, 0xc45fa0, 0x8c6d31, 0x4e79a7, 0xe15759, 0x76b7b2,
    0xf28e2b, 0x59a14f, 0xedc948, 0xb07aa1,
  ];
  const productGeo = new THREE.BoxGeometry(0.14, 0.2, 0.1);
  let productIdx = 0;
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 1.35 + shelf * 0.62;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(W - 1.9, 0.06, 0.42), shelfMat);
    plank.position.set(0, y, -D / 2 + 0.5);
    group.add(plank);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: productColors[productIdx++ % productColors.length],
        roughness: 0.7,
      });
      const box = new THREE.Mesh(productGeo, mat);
      box.position.set(-W / 2 + 1.0 + i * ((W - 2.0) / 15) + (Math.random() - 0.5) * 0.02, y + 0.13, -D / 2 + 0.5);
      box.rotation.y = (Math.random() - 0.5) * 0.2;
      group.add(box);
    }
  }

  /* hanging sachets along the counter (the classic sari-sari curtain) */
  const sachetGeo = new THREE.PlaneGeometry(0.16, 0.24);
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
  for (let i = 0; i < 12; i++) {
    const x = -W / 2 + 0.7 + i * ((W - 1.4) / 11);
    const mat = new THREE.MeshStandardMaterial({
      color: productColors[(i * 3) % productColors.length],
      roughness: 0.65,
      side: THREE.DoubleSide,
    });
    const sachet = new THREE.Mesh(sachetGeo, mat);
    sachet.position.set(x, wallH - 0.62 - (i % 3) * 0.1, D / 2 + 0.12);
    sachet.rotation.y = (Math.random() - 0.5) * 0.25;
    group.add(sachet);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 3), wireMat);
    string.position.set(x, wallH - 0.45, D / 2 + 0.12);
    group.add(string);
  }

  /* signboard */
  const signTex = TEX.sign("SARI-SARI STORE", { size: 78, bg: "#f2e9c9", border: "#8a2f2f", fg: "#7b1f1f" });
  const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.85 }));
  signBoard.position.set(0, wallH + 0.35, D / 2 + 0.1);
  group.add(signBoard);

  /* the long slatted upuan on the side of the store, facing the road */
  const bench = createBench(woodMat);
  bench.position.set(-W / 2 - 0.95, 0, 1.1);
  bench.rotation.y = Math.PI / 2;
  group.add(bench);
  // where Ernie's eye goes if he sits down
  const seat = new THREE.Object3D();
  seat.position.set(0, 0.52, 0);
  bench.add(seat);

  /* porch posts + a warm bulb over the counter */
  for (const x of [-W / 2 + 0.4, W / 2 - 0.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, wallH, 8), woodMat);
    post.position.set(x, wallH / 2, D / 2 + 1.0);
    post.castShadow = true;
    group.add(post);
  }
  const porchLightMat = new THREE.MeshStandardMaterial({ color: 0xfff3cf, emissive: new THREE.Color(0xffd08a), emissiveIntensity: 1 });
  const porchBulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), porchLightMat);
  porchBulb.position.set(0, wallH - 0.1, D / 2 + 0.55);
  group.add(porchBulb);
  const porchLight = new THREE.PointLight(0xffc987, 6, 12, 2);
  porchLight.position.copy(porchBulb.position).setY(wallH - 0.3);
  group.add(porchLight);

  /* the back room: tindera's own home + kusina, visible behind her */
  const backRoom = new THREE.Group();
  backRoom.position.set(0, 0.31, -D / 2 - 0.05);
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 1 }));
  backWall.position.set(0, 1.3, -2.0);
  backRoom.add(backWall);
  // kusina hints: a low table, a kaldero, a shelf of plates
  const tableMat = new THREE.MeshStandardMaterial({ map: TEX.wood(1, "#6f563a"), roughness: 0.9 });
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.7), tableMat);
  table.position.set(-0.75, 0.72, -1.45);
  backRoom.add(table);
  for (const dx of [-0.5, 0.5]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), tableMat);
    leg.position.set(-0.75 + dx, 0.36, -1.45);
    backRoom.add(leg);
  }
  const kaldero = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.26, 12), new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.55, metalness: 0.55 }));
  kaldero.position.set(-0.75, 0.9, -1.45);
  backRoom.add(kaldero);
  const stove = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.42), new THREE.MeshStandardMaterial({ color: 0x7d7d7d, roughness: 0.8 }));
  stove.position.set(-0.75, 0.42, -1.15);
  backRoom.add(stove);
  for (let i = 0; i < 5; i++) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 14), new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.5 }));
    plate.position.set(0.9, 1.15 + i * 0.05, -1.7);
    plate.rotation.z = 0.06;
    backRoom.add(plate);
  }
  const backLight = new THREE.PointLight(0xffcf96, 3.2, 6, 2);
  backLight.position.set(0, 2.0, -1.2);
  backRoom.add(backLight);
  group.add(backRoom);

  /* colliders: walls, counter, bench, and the whole footprint so you cannot
     walk through the shop from behind */
  const worldRotation = group.rotation.y;
  const pushLocal = (half, pos, tag) => {
    const cos = Math.cos(worldRotation);
    const sin = Math.sin(worldRotation);
    const hx = Math.abs(cos) * half[0] + Math.abs(sin) * half[2];
    const hz = Math.abs(sin) * half[0] + Math.abs(cos) * half[2];
    colliders.push({
      half: [hx, half[1], hz],
      pos: [group.position.x + pos[0] * cos + pos[2] * sin, pos[1], group.position.z - pos[0] * sin + pos[2] * cos],
      tag,
    });
  };
  pushLocal([W / 2, 1.6, D / 2 + 1.0], [0, 1.6, 0], "store");
  pushLocal([1.05, 0.28, 0.25], [-W / 2 - 0.95, 0.5, 1.1], "bench");

  scene.add(group);

  /* the tindera herself */
  let tindera = null;
  if (characters) {
    try {
      tindera = await characters.create("tindera", { animation: "idle" });
      // behind the counter, facing out through the service window
      tindera.root.position.set(0.15, 0.31, D / 2 - 1.35);
      // the CC0 clip frame is "+Z forward", so 0 faces out of the window
      tindera.root.rotation.y = -0.16;
      group.add(tindera.root);
    } catch (err) {
      console.warn("[places] tindera failed to load:", err?.message ?? err);
    }
  }

  /* where the camera settles when you talk to her */
  const focusLocal = new THREE.Vector3(0, 1.42, D / 2 + 1.55);
  const focusWorld = focusLocal.clone().applyMatrix4(new THREE.Matrix4().compose(group.position, new THREE.Quaternion().setFromEuler(group.rotation), new THREE.Vector3(1, 1, 1)));
  const lookTarget = new THREE.Vector3(0.15, 1.35, D / 2 - 1.1).applyMatrix4(
    new THREE.Matrix4().compose(group.position, new THREE.Quaternion().setFromEuler(group.rotation), new THREE.Vector3(1, 1, 1))
  );

  const worldMatrix = new THREE.Matrix4().compose(
    group.position,
    new THREE.Quaternion().setFromEuler(group.rotation),
    new THREE.Vector3(1, 1, 1)
  );

  return {
    group,
    tindera,
    bench,
    seat,
    seatWorld: seat.getWorldPosition(new THREE.Vector3()),
    focusWorld,
    lookTarget,
    porchLight,
    update(dt) {
      tindera?.mixer.update(dt);
    },
  };
}

function createBench(woodMat) {
  const bench = new THREE.Group();
  const seatY = 0.46;
  const length = 2.6;
  // slats
  for (let i = 0; i < 4; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(length, 0.055, 0.14), woodMat);
    slat.position.set(0, seatY, -0.24 + i * 0.16);
    slat.castShadow = true;
    bench.add(slat);
  }
  // legs + stretchers
  for (const x of [-length / 2 + 0.18, length / 2 - 0.18]) {
    for (const z of [-0.24, 0.24]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, seatY, 0.09), woodMat);
      leg.position.set(x, seatY / 2, z);
      leg.castShadow = true;
      bench.add(leg);
    }
    const stretcher = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.62), woodMat);
    stretcher.position.set(x, 0.16, 0);
    bench.add(stretcher);
  }
  return bench;
}

/* --------------------------------------------------------- Ernie's house */
export function createErniesHouse(scene, colliders) {
  const { group, glass, colliders: localColliders } = buildHouse({
    width: 8.2,
    depth: 6.6,
    storeys: 1,
    roof: "corrugated",
    wallColor: 0xcdd7c4,
    trimColor: 0x35553f,
    seed: 909,
  });
  group.position.set(-11, 0, 18);
  group.rotation.y = Math.PI / 2; // front faces the road
  scene.add(group);

  const cos = Math.cos(group.rotation.y);
  const sin = Math.sin(group.rotation.y);
  for (const c of localColliders) {
    const hx = Math.abs(cos) * c.half[0] + Math.abs(sin) * c.half[2];
    const hz = Math.abs(sin) * c.half[0] + Math.abs(cos) * c.half[2];
    colliders.push({
      half: [hx, c.half[1], hz],
      pos: [group.position.x + c.pos[0] * cos + c.pos[2] * sin, c.pos[1], group.position.z - c.pos[0] * sin + c.pos[2] * cos],
      tag: "ernie-house",
    });
  }

  /* garden bed of pechay / talong seedlings in front */
  const soilMat = new THREE.MeshStandardMaterial({ map: TEX.mud(), color: 0x6a5540, roughness: 1 });
  const plantMat = new THREE.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 0.9, side: THREE.DoubleSide });
  const garden = new THREE.Group();
  garden.position.set(0, 0, 5.6);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 2.2), soilMat);
  bed.position.y = 0.08;
  bed.receiveShadow = true;
  garden.add(bed);
  for (let i = 0; i < 34; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.34), plantMat);
    leaf.position.set(-2.5 + (i % 8) * 0.7 + Math.random() * 0.2, 0.3, -0.8 + Math.floor(i / 8) * 0.7);
    leaf.rotation.x = -0.5 - Math.random() * 0.4;
    leaf.rotation.z = Math.random() * 0.6 - 0.3;
    garden.add(leaf);
  }
  group.add(garden);

  /* porch bulb that is on at night */
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3cf, emissive: new THREE.Color(0xffd08a), emissiveIntensity: 0 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), bulbMat);
  bulb.position.set(1.6, 2.5, 3.5);
  group.add(bulb);
  const porch = new THREE.PointLight(0xffc987, 0, 10, 2);
  porch.position.copy(bulb.position);
  group.add(porch);

  group.updateMatrixWorld(true);
  const doorAnchor = new THREE.Vector3(1.804, 0, 3.9).applyMatrix4(group.matrixWorld);
  const windowAnchor = new THREE.Vector3(-1.6, 0, 3.9).applyMatrix4(group.matrixWorld);

  return { group, glass, bulbMat, porchLight: porch, garden, doorAnchor, windowAnchor };
}

/* ------------------------------------------------------- street furniture */
export function buildStreetFurniture(scene, colliders) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8b8377, roughness: 0.9 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 0.9 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1b1b1b, transparent: true, opacity: 0.55 });
  const poles = [];
  for (let z = 40; z >= -270; z -= 34) {
    const pole = new THREE.Group();
    pole.position.set(4.6, 0, z);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 7.2, 8), poleMat);
    shaft.position.y = 3.6;
    shaft.castShadow = true;
    pole.add(shaft);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), armMat);
    arm.position.set(-0.7, 6.7, 0);
    pole.add(arm);
    scene.add(pole);
    poles.push(pole);
    colliders.push({ half: [0.18, 3.6, 0.18], pos: [4.6, 3.6, z], tag: "post" });
  }
  // sagging wires between poles
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i].position;
    const b = poles[i + 1].position;
    for (const yOff of [6.6, 6.25]) {
      const points = [];
      for (let t = 0; t <= 10; t++) {
        const p = t / 10;
        const sag = Math.sin(Math.PI * p) * 0.55;
        points.push(new THREE.Vector3(4.6 - 1.2 + (b.x - a.x) * 0, yOff - sag, a.z + (b.z - a.z) * p));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      scene.add(new THREE.Line(geo, wireMat));
    }
  }
}
