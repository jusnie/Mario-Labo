#!/usr/bin/env node
/**
 * tools/char-preview.mjs — software render of one CC0 character look.
 *
 * There is no browser or GPU in this environment, and the world previewer
 * (tools/preview.mjs) only knows static geometry, so a character had no way to
 * be looked at. This one loads the rig the way characters.js does — morphs,
 * garments rebound by bone name, hair, tints — poses it with a baked clip, does
 * the skinning on the CPU and rasterises three views into one sheet.
 *
 *   node tools/char-preview.mjs                    # LOOKS.maria, front/3-4/back
 *   PREVIEW_LOOK=tindera node tools/char-preview.mjs preview-tindera.png
 *   PREVIEW_CLIP=walk PREVIEW_TIME=0.4 node tools/char-preview.mjs
 *
 * It is a check, not a beauty render: no textures (the GLBs' PNG maps need a
 * DOM), flat-shaded faces, a three-quarter key light. Good enough to judge
 * silhouette, proportion, colour and pose.
 */
globalThis.self = globalThis; // GLTFLoader reaches for self.createImageBitmap

import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import zlib from "node:zlib";
import { LOOKS, BODY_FILE } from "../barangay/characters.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MODEL_DIR = path.join(ROOT, "assets/characters/cc0/models");

const LOOK_NAME = process.env.PREVIEW_LOOK ?? "maria";
const CLIP = process.env.PREVIEW_CLIP ?? "idle";
const TIME = Number(process.env.PREVIEW_TIME ?? 0);
const OUT = process.argv[2] ?? `preview-${LOOK_NAME}.png`;
const SS = Math.max(1, Number(process.env.PREVIEW_SS ?? 2));

/* ----------------------------------------------------------------- loading */

// GLTFLoader wants a DOM-ish environment for textures and pokes at console for
// each missing map; silence that, the geometry is what this tool is for.
const realWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === "string" && args[0].includes("Couldn't load texture")) return;
  realWarn(...args);
};

const loader = new GLTFLoader();
const cache = new Map();
function load(file) {
  if (!cache.has(file)) {
    const buf = fs.readFileSync(path.join(MODEL_DIR, file));
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    cache.set(
      file,
      new Promise((resolve, reject) => loader.parse(data, "", resolve, reject))
    );
  }
  return cache.get(file);
}

/* ------------------------------------------------------------- look recipe */

function applyMorphs(mesh, morphs) {
  const infl = mesh.morphTargetInfluences;
  if (!infl) return;
  const dict = mesh.morphTargetDictionary;
  for (let i = 0; i < infl.length; i++) infl[i] = 0;
  if (!dict || !morphs) return;
  for (const [key, value] of Object.entries(morphs)) {
    const idx = dict[key];
    if (idx !== undefined) infl[idx] = value;
  }
}

function tintMaterial(material, colorHex, keepMap = false) {
  if (!material) return material;
  const one = (mat) => {
    const clone = mat.clone();
    clone.color = new THREE.Color(colorHex);
    clone.metalness = 0;
    clone.roughness = Math.max(clone.roughness ?? 1, 0.72);
    if (!keepMap && clone.map) {
      clone.map = null;
      clone.needsUpdate = true;
    }
    return clone;
  };
  return Array.isArray(material) ? material.map(one) : one(material);
}

async function buildFigure(lookName) {
  const look = LOOKS[lookName];
  if (!look) throw new Error(`unknown look: ${lookName} (have ${Object.keys(LOOKS).join(", ")})`);

  const body = await load(BODY_FILE);
  const root = body.scene;
  const bodyMeshes = [];
  root.traverse((o) => {
    if (o.isSkinnedMesh) bodyMeshes.push(o);
  });
  if (!bodyMeshes.length) throw new Error("body has no skinned meshes");

  for (const mesh of bodyMeshes) applyMorphs(mesh, look.morphs);
  if (look.skin) {
    for (const mesh of bodyMeshes) mesh.material = tintMaterial(mesh.material, look.skin, true);
  }

  const bones = new Map();
  root.traverse((o) => {
    if (o.isBone) bones.set(o.name, o);
  });

  const files = [...(look.garments ?? [])];
  if (look.hair) files.push(look.hair);
  for (const file of files) {
    const gltf = await load(file);
    const meshes = [];
    gltf.scene.traverse((o) => {
      if (o.isSkinnedMesh) meshes.push(o);
    });
    for (const src of meshes) {
      const mesh = src.clone(); // geometry is shared, materials are cloned below
      applyMorphs(mesh, look.morphs);
      // rebind onto the body's live bones, matched by name
      const skel = mesh.skeleton;
      if (skel) {
        const mapped = skel.bones.map((b) => bones.get(b.name) ?? b);
        mesh.skeleton = new THREE.Skeleton(mapped, skel.boneInverses);
      }
      const tint = look.tints?.[file];
      if (tint !== undefined) mesh.material = tintMaterial(mesh.material, tint, !!look.keepMap);
      const host = bodyMeshes[0].parent ?? root;
      mesh.position.copy(bodyMeshes[0].position);
      mesh.quaternion.copy(bodyMeshes[0].quaternion);
      mesh.scale.copy(bodyMeshes[0].scale);
      mesh.frustumCulled = false;
      host.add(mesh);
    }
  }

  // scale to the recipe height, feet on y = 0 (mirrors characters.js)
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const raw = Math.max(0.5, box.max.y - Math.min(0, box.min.y));
  const target = look.height ?? 1.66;
  const scale = THREE.MathUtils.clamp(target / raw, 0.6, 1.6);
  const holder = new THREE.Group();
  holder.add(root);
  root.scale.setScalar(scale);
  root.position.y = -Math.min(0, box.min.y) * scale;

  // pose
  const mixer = new THREE.AnimationMixer(root);
  const clip = (body.animations ?? []).find((c) => c.name === CLIP) ?? body.animations?.[0];
  if (clip) {
    const action = mixer.clipAction(clip);
    action.play();
    mixer.update(TIME);
  }
  if (typeof look.extras === "function") look.extras({ holder, bones, height: target });
  applyPose(holder, look);

  holder.updateMatrixWorld(true);
  return { holder, bones, look };
}

/**
 * Look-specific posing on top of the baked clip. `look.pose` is a list of
 * [bone, [x,y,z] radians] triples; `look.tilt` drops the head, which for Maria
 * is most of the read.
 */
function applyPose(holder, look) {
  if (!look.pose) return;
  const bones = new Map();
  holder.traverse((o) => {
    if (o.isBone) bones.set(o.name, o);
  });
  for (const [name, rot] of look.pose) {
    const bone = bones.get(name);
    if (!bone) continue;
    bone.rotation.x += rot[0] ?? 0;
    bone.rotation.y += rot[1] ?? 0;
    bone.rotation.z += rot[2] ?? 0;
  }
}

/* --------------------------------------------------------------- rasteriser */

function collectTriangles(holder) {
  const tris = [];
  const v = new THREE.Vector3();
  const delta = new THREE.Vector3();
  holder.updateMatrixWorld(true);
  holder.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const col = new THREE.Color(mat?.color?.getHex?.() ?? 0xb9b0a6).convertSRGBToLinear();
    const alpha = mat?.transparent ? (mat.opacity ?? 1) : 1;
    const side = mat?.side ?? THREE.FrontSide;

    const count = pos.count;
    const world = new Float32Array(count * 3);
    const infl = o.morphTargetInfluences;
    const morphPos = geo.morphAttributes?.position;
    const active = [];
    if (infl && morphPos) {
      for (let t = 0; t < morphPos.length; t++) if (infl[t]) active.push([morphPos[t], infl[t]]);
    }
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(pos, i);
      if (active.length) {
        delta.set(0, 0, 0);
        for (const [attr, w] of active) {
          delta.x += attr.getX(i) * w;
          delta.y += attr.getY(i) * w;
          delta.z += attr.getZ(i) * w;
        }
        v.add(delta);
      }
      if (o.isSkinnedMesh) {
        o.skeleton.update();
        o.applyBoneTransform(i, v);
      }
      v.applyMatrix4(o.matrixWorld);
      world[i * 3] = v.x;
      world[i * 3 + 1] = v.y;
      world[i * 3 + 2] = v.z;
    }
    const index = geo.index;
    const n = index ? index.count : count;
    for (let t = 0; t < n; t += 3) {
      const a = index ? index.getX(t) : t;
      const b = index ? index.getX(t + 1) : t + 1;
      const c = index ? index.getX(t + 2) : t + 2;
      tris.push({ p: world, a, b, c, r: col.r, g: col.g, bl: col.b, alpha, side });
    }
  });
  return tris;
}

const LIGHT_KEY = new THREE.Vector3(-0.45, 0.82, 0.55).normalize();
const LIGHT_FILL = new THREE.Vector3(0.75, 0.1, 0.35).normalize();
const LIGHT_RIM = new THREE.Vector3(0.2, 0.45, -0.9).normalize();

/* --------------------------------------------------------------------- main */

const look = LOOKS[LOOK_NAME];
const { holder } = await buildFigure(LOOK_NAME);
const tris = collectTriangles(holder);
const box = new THREE.Box3().setFromObject(holder);
console.log(`${LOOK_NAME}: ${tris.length} triangles, height ${(box.max.y - box.min.y).toFixed(2)}m`);

const PANEL_H = 640;
const PANEL_W = 366;
const W = PANEL_W * 3;
const H = PANEL_H;
const SW = W * SS;
const SH = H * SS;

const buf = new Uint8Array(SW * SH * 4);
const mid = new THREE.Vector3((box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2);
const centre = new THREE.Vector3(mid.x, (box.min.y + box.max.y) / 2 - 0.02, mid.z);
const dist = (box.max.y - box.min.y) * 2.1;

const VIEWS = [
  { name: "front", angle: 0 },
  { name: "three-quarter", angle: Math.PI * 0.28 },
  { name: "back", angle: Math.PI },
];

// studio sweep behind her: dark at the edges so a black dress still reads
for (let i = 0; i < SW * SH; i++) {
  const t = Math.floor(i / SW) / SH;
  const shade = t < 0.55 ? 0.17 + t * 0.05 : 0.22 - (t - 0.55) * 0.16;
  buf[i * 4] = Math.round(255 * Math.pow(shade * 1.02, 2.2));
  buf[i * 4 + 1] = Math.round(255 * Math.pow(shade, 2.2));
  buf[i * 4 + 2] = Math.round(255 * Math.pow(shade * 1.08, 2.2));
  buf[i * 4 + 3] = 255;
}

/** Rasterise one view straight into a panel of `buf`. */
function drawPanel(view, panelIndex) {
  const panelW = Math.floor(SW / 3);
  const x0 = panelIndex * panelW;
  const eye = new THREE.Vector3(
    Math.sin(view.angle) * dist,
    centre.y + dist * 0.12,
    Math.cos(view.angle) * dist
  ).add(centre);
  const depth = new Float32Array(panelW * SH).fill(Infinity);
  const rgb = new Float32Array(panelW * SH * 3);
  const drawn = renderViewScratch(tris, depth, rgb, panelW, SH, eye, centre);
  const tone = (v) => Math.round(255 * Math.min(1, Math.pow((v / (v + 0.72)) * 1.55, 1 / 2.2)));
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < panelW; x++) {
      const si = y * panelW + x;
      if (!Number.isFinite(depth[si])) continue;
      const di = (y * SW + x + x0) * 4;
      buf[di] = tone(rgb[si * 3]);
      buf[di + 1] = tone(rgb[si * 3 + 1]);
      buf[di + 2] = tone(rgb[si * 3 + 2]);
    }
  }
  // a hairline between panels
  if (panelIndex > 0) {
    for (let y = 0; y < SH; y++) {
      const di = (y * SW + x0) * 4;
      buf[di] = 22;
      buf[di + 1] = 22;
      buf[di + 2] = 26;
    }
  }
  return drawn;
}

VIEWS.forEach((view, i) => {
  const drawn = drawPanel(view, i);
  console.log(`  ${view.name}: ${drawn} triangles drawn`);
});

/** Box-filter the supersampled buffer down to the sheet. */
const out = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const si = ((y * SS + sy) * SW + x * SS + sx) * 4;
        r += buf[si];
        g += buf[si + 1];
        b += buf[si + 2];
      }
    }
    const n = SS * SS;
    const di = (y * W + x) * 4;
    out[di] = r / n;
    out[di + 1] = g / n;
    out[di + 2] = b / n;
    out[di + 3] = 255;
  }
}

fs.writeFileSync(path.join(ROOT, OUT), encodePng(W, H, out));
console.log(`${OUT} — ${LOOK_NAME}, ${CLIP} @ ${TIME}s (${W}x${H})`);

/* -------------------------------------------------------------- png output */
/**
 * A minimal PNG writer, so this tool needs nothing but node and three.
 * 8-bit RGBA, one IDAT, no interlacing.
 */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(
      raw,
      y * (width * 4 + 1) + 1
    );
  }
  const chunks = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  chunks.push(chunk("IHDR", ihdr));
  chunks.push(chunk("IDAT", zlib.deflateSync(raw, { level: 9 })));
  chunks.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

var crcTable = null; // var: the writer below is called before this line runs
function crc32(bufIn) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bufIn.length; i++) c = crcTable[(c ^ bufIn[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Scan-convert the triangle soup into a depth + colour buffer for one view. */
function renderViewScratch(triList, depth, rgb, W2, H2, eye, target) {
  const fovy = 34;
  const aspect = W2 / H2;
  const halfH = Math.tan((fovy * Math.PI) / 180 / 2);
  const halfW = halfH * aspect;
  const fwd = new THREE.Vector3().subVectors(target, eye).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();

  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const toEye = new THREE.Vector3();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  let drawn = 0;

  for (const t of triList) {
    const { p, a, b, c } = t;
    A.set(p[a * 3], p[a * 3 + 1], p[a * 3 + 2]);
    B.set(p[b * 3], p[b * 3 + 1], p[b * 3 + 2]);
    C.set(p[c * 3], p[c * 3 + 1], p[c * 3 + 2]);
    va.subVectors(A, eye);
    vb.subVectors(B, eye);
    vc.subVectors(C, eye);
    const az = va.dot(fwd);
    const bz = vb.dot(fwd);
    const cz = vc.dot(fwd);
    if (az < 0.04 || bz < 0.04 || cz < 0.04) continue; // no near-plane clipping here

    const px0 = ((va.dot(right) / (az * halfW)) * 0.5 + 0.5) * W2;
    const py0 = (1 - ((va.dot(up) / (az * halfH)) * 0.5 + 0.5)) * H2;
    const px1 = ((vb.dot(right) / (bz * halfW)) * 0.5 + 0.5) * W2;
    const py1 = (1 - ((vb.dot(up) / (bz * halfH)) * 0.5 + 0.5)) * H2;
    const px2 = ((vc.dot(right) / (cz * halfW)) * 0.5 + 0.5) * W2;
    const py2 = (1 - ((vc.dot(up) / (cz * halfH)) * 0.5 + 0.5)) * H2;

    if (Math.max(px0, px1, px2) < 0 || Math.min(px0, px1, px2) > W2) continue;
    if (Math.max(py0, py1, py2) < 0 || Math.min(py0, py1, py2) > H2) continue;

    e1.subVectors(B, A);
    e2.subVectors(C, A);
    nrm.crossVectors(e1, e2);
    if (nrm.lengthSq() < 1e-12) continue;
    nrm.normalize();
    toEye.subVectors(eye, A).normalize();
    const facing = nrm.dot(toEye);
    // cull the way the GPU would, by the material's side
    if (t.side === THREE.FrontSide && facing <= 0) continue;
    if (t.side === THREE.BackSide && facing >= 0) continue;
    if (t.side === THREE.DoubleSide && facing > 0) nrm.negate();

    const key = Math.max(0, nrm.dot(LIGHT_KEY));
    const fill = Math.max(0, nrm.dot(LIGHT_FILL)) * 0.35;
    const rim = Math.pow(Math.max(0, nrm.dot(LIGHT_RIM)), 2) * 0.5;
    const lit = 0.2 + key * 0.92 + fill + rim;

    const area = (px1 - px0) * (py2 - py0) - (px2 - px0) * (py1 - py0);
    if (Math.abs(area) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(px0, px1, px2)));
    const maxX = Math.min(W2 - 1, Math.ceil(Math.max(px0, px1, px2)));
    const minY = Math.max(0, Math.floor(Math.min(py0, py1, py2)));
    const maxY = Math.min(H2 - 1, Math.ceil(Math.max(py0, py1, py2)));
    if (maxX < minX || maxY < minY) continue;
    const inv = 1 / area;
    const ia = 1 / az;
    const ib = 1 / bz;
    const ic = 1 / cz;
    drawn++;

    for (let y = minY; y <= maxY; y++) {
      const yc = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const xc = x + 0.5;
        const w0 = ((px1 - xc) * (py2 - yc) - (px2 - xc) * (py1 - yc)) * inv;
        const w1 = ((px2 - xc) * (py0 - yc) - (px0 - xc) * (py2 - yc)) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = 1 / (w0 * ia + w1 * ib + w2 * ic);
        const di = y * W2 + x;
        if (z >= depth[di]) continue;
        depth[di] = z;
        rgb[di * 3] = t.r * lit;
        rgb[di * 3 + 1] = t.g * lit;
        rgb[di * 3 + 2] = t.bl * lit;
      }
    }
  }
  return drawn;
}
