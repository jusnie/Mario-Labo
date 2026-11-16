/**
 * places.js — the places Ernie actually walks up to: the sari-sari store (with
 * its long side upuan and the tindera behind the counter) and Ernie's own house.
 *
 * Layout: the store sits on the right of the road at z=-6, front facing the
 * road; Ernie's house sits on the left at z=+18. Both were rebuilt here from
 * the design notes — the original scene files were not recoverable.
 */
import * as THREE from "three";
import { buildHouse, gableRoof, placeColliders } from "./world.js";
import { jar, pottedPlant, mergeStaticGroup, gardenBed, sharedMaterial, groundShadow } from "./models.js";
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

  /* roof: ridge parallel to the storefront, so the eaves shade the counter */
  const rise = 1.9;
  const roofGroup = gableRoof({
    width: D,
    depth: W,
    rise,
    material: nipaMat,
    overhang: 0.7,
    ridgeAlong: "x",
    gableMaterial: plasterMat,
    ribbed: false,
  });
  roofGroup.position.y = wallH;
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
  // stock on the shelves: tins, bottles and sachet packs rather than sixteen
  // identical boxes in sixteen colours
  const goodsMat = (hex, key = "") =>
    sharedMaterial(`goods:${key}${hex.toString(16)}`, () =>
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.62 })
    );
  const tin = (hex) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.11, 12), goodsMat(0xc2c6c9, "tin"));
    body.position.y = 0.055;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.072, 12), goodsMat(hex));
    label.position.y = 0.055;
    g.add(body, label);
    return g;
  };
  const bottle = (hex) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.048, 0.17, 10), goodsMat(hex));
    body.position.y = 0.085;
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.045, 0.05, 10), goodsMat(hex));
    shoulder.position.y = 0.195;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.06, 8), goodsMat(hex));
    neck.position.y = 0.245;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.02, 8), goodsMat(0xf2f0e8, "cap"));
    cap.position.y = 0.285;
    g.add(body, shoulder, neck, cap);
    return g;
  };
  const sachetPack = (hex) => {
    const g = new THREE.Group();
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.19, 0.035), goodsMat(hex));
    pack.position.y = 0.095;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.035, 0.037), goodsMat(0xf7f3e6, "band"));
    band.position.y = 0.13;
    g.add(pack, band);
    return g;
  };

  let productIdx = 0;
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 1.35 + shelf * 0.62;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(W - 1.9, 0.06, 0.42), shelfMat);
    plank.position.set(0, y, -D / 2 + 0.5);
    group.add(plank);
    for (let i = 0; i < 15; i++) {
      const hex = productColors[productIdx++ % productColors.length];
      const roll = (i * 7 + shelf * 3) % 10; // deterministic, so runs repeat
      const item = roll < 4 ? tin(hex) : roll < 7 ? bottle(hex) : sachetPack(hex);
      item.position.set(
        -W / 2 + 1.1 + i * ((W - 2.2) / 14) + ((i * 13) % 5) * 0.004,
        y + 0.04,
        -D / 2 + 0.5
      );
      item.rotation.y = (((i * 11) % 7) - 3) * 0.06;
      group.add(item);
    }
  }

  // rice sacks and a bayong at the foot of the counter
  for (const [sx, sz, rot] of [[-2.1, 0.5, 0.2], [-1.75, 0.15, -0.35]]) {
    const sack = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.3, 0.32),
      sharedMaterial("goods:sack", () => new THREE.MeshStandardMaterial({ color: 0xe3d9bd, roughness: 1 }))
    );
    sack.position.set(sx, 0.46, D / 2 - 1.15 + sz);
    sack.rotation.y = rot;
    group.add(sack);
    const tie = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8),
      sharedMaterial("goods:sacktie", () => new THREE.MeshStandardMaterial({ color: 0xc9bda0, roughness: 1 }))
    );
    tie.position.set(sx, 0.62, D / 2 - 1.15 + sz);
    group.add(tie);
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
    for (const dz of [-0.26, 0.26]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), tableMat);
      leg.position.set(-0.75 + dx, 0.36, -1.45 + dz);
      backRoom.add(leg);
    }
  }
  // apron rails, so the kusina table is a table and not a plank on two sticks
  for (const dz of [-0.26, 0.26]) {
    const apron = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.07, 0.04), tableMat);
    apron.position.set(-0.75, 0.63, -1.45 + dz);
    backRoom.add(apron);
  }
  for (const dx of [-0.5, 0.5]) {
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.5), tableMat);
    apron.position.set(-0.75 + dx, 0.63, -1.45);
    backRoom.add(apron);
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

  /* props: a tapayan by the post and a plant on the counter end */
  const shopJar = jar({ height: 0.58, radius: 0.27, color: 0x9d5f38 });
  shopJar.position.set(W / 2 - 0.5, 0.3, D / 2 + 1.35);
  group.add(shopJar);
  const shopPlant = pottedPlant({ scale: 0.85 });
  shopPlant.position.set(-W / 2 + 0.45, 0.3, D / 2 + 1.3);
  group.add(shopPlant);

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
  mergeStaticGroup(group);
  scene.add(group);
  const storeShadow = groundShadow({ width: W + 5, depth: D + 5, opacity: 0.32 });
  storeShadow.position.set(group.position.x, 0.026, group.position.z);
  scene.add(storeShadow);

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

  colliders.push(...placeColliders(localColliders, group, "ernie-house"));
  const houseShadow = groundShadow({ width: 11, depth: 10, opacity: 0.3 });
  houseShadow.position.set(group.position.x, 0.026, group.position.z);
  scene.add(houseShadow);

  /* garden bed in front: ridged soil with pechay and talong set out in rows */
  const garden = new THREE.Group();
  garden.position.set(0, 0, 5.6);
  garden.add(gardenBed({ width: 5.6, depth: 2.2, ridges: 4, seed: 11, crop: "pechay", crop2: "talong" }));
  // the planting is ~100 little meshes; bake it down to one mesh per material
  mergeStaticGroup(garden);
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
/**
 * The road's power line: creosoted poles with two crossarms, pin insulators,
 * a distribution transformer every third pole, a street lamp every fourth, and
 * sagging conductors that actually land on the insulators. The first pass was a
 * bare cylinder with one box arm and two wires floating beside it.
 */
export function buildStreetFurniture(scene, colliders) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x6f6a5e, roughness: 0.95 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x7d7668, roughness: 0.95 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x8d9094, roughness: 0.5, metalness: 0.55 });
  const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xdad6cc, roughness: 0.35 });
  const wireMat = new THREE.LineBasicMaterial({ color: 0x1b1b1b, transparent: true, opacity: 0.55 });

  const CIRCUITS = [
    { dx: -0.58, y: 6.74 },
    { dx: 0.58, y: 6.74 },
    { dx: -0.34, y: 6.18 },
    { dx: 0.34, y: 6.18 },
  ];

  const street = new THREE.Group();
  const poles = [];
  const lampMats = [];
  let index = 0;
  for (let z = 40; z >= -270; z -= 34, index++) {
    const pole = new THREE.Group();
    pole.position.set(4.6, 0, z);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 7.4, 10), poleMat);
    shaft.position.y = 3.7;
    shaft.castShadow = true;
    pole.add(shaft);

    for (const [armY, armLen] of [[6.74, 1.7], [6.18, 1.2]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.09, 0.1), armMat);
      arm.position.set(0, armY, 0);
      arm.castShadow = true;
      pole.add(arm);
      // brace back to the pole
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.05, armLen * 0.55, 0.05), armMat);
      brace.position.set(0, armY - armLen * 0.19, 0.05);
      brace.rotation.z = Math.PI / 2;
      pole.add(brace);
    }

    // pin insulators where the conductors sit
    for (const c of CIRCUITS) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.09, 6), metalMat);
      pin.position.set(c.dx, c.y + 0.09, 0);
      pole.add(pin);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.075, 10), ceramicMat);
      bell.position.set(c.dx, c.y + 0.16, 0);
      pole.add(bell);
    }

    // distribution transformer, hung off every third pole
    if (index % 3 === 1) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.72, 14), metalMat);
      can.position.set(0.42, 5.1, 0);
      can.castShadow = true;
      pole.add(can);
      for (const y of [4.85, 5.4]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.06), metalMat);
        strap.position.set(0.2, y, 0);
        pole.add(strap);
      }
      const bushing = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 8), ceramicMat);
      bushing.position.set(0.42, 5.53, 0);
      pole.add(bushing);
    }

    // a street lamp on every fourth pole, reaching over the road
    let lampBulb = null;
    if (index % 4 === 2) {
      const reach = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), metalMat);
      reach.rotation.z = Math.PI / 2;
      reach.position.set(-0.75, 5.7, 0);
      pole.add(reach);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.15, 10), metalMat);
      shade.position.set(-1.48, 5.64, 0);
      pole.add(shade);
      const lampMat = new THREE.MeshStandardMaterial({
        color: 0xfff3cf,
        emissive: new THREE.Color(0xffd9a0),
        emissiveIntensity: 0,
      });
      lampMats.push(lampMat);
      lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lampMat);
      lampBulb.position.set(-1.48, 5.52, 0);
      pole.add(lampBulb);
    }

    street.add(pole);
    poles.push(pole);
    colliders.push({ half: [0.18, 3.7, 0.18], pos: [4.6, 3.7, z], tag: "post" });
  }

  // one draw call per material for the whole line
  mergeStaticGroup(street);
  scene.add(street);

  // sagging conductors, one per circuit, pole to pole
  for (let i = 0; i < poles.length - 1; i++) {
    const a = poles[i].position;
    const b = poles[i + 1].position;
    for (const c of CIRCUITS) {
      const points = [];
      for (let t = 0; t <= 12; t++) {
        const p = t / 12;
        const sag = Math.sin(Math.PI * p) * 0.5;
        points.push(new THREE.Vector3(4.6 + c.dx, c.y + 0.2 - sag, a.z + (b.z - a.z) * p));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), wireMat));
    }
  }

  return { group: street, lampMats };
}
