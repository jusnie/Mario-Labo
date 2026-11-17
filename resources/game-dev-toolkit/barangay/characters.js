/**
 * characters.js — CC0 skinned characters for Barangay Kabudoy.
 *
 * Source rig: kblood/CharacterCreator @ 852e48f (models, morphs, garments, hair
 * and baked clips are CC0-1.0; see assets/characters/cc0/licenses).
 *
 * Notes that matter:
 *  - Every body/garment/hair GLB ships 92 morph targets with all weights
 *    defaulting to 1. That is not a usable human: weights must be zeroed first,
 *    then the intended morphs applied.
 *  - Garments are separate GLBs with their own copy of the same 53-bone rig.
 *    They are rebound onto the body's live bones by bone name, so one animation
 *    drives body + clothes + hair together.
 *  - Everything degrades gracefully: if an asset 404s, a plain silhouette is
 *    used so the scene still runs.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const MODEL_BASE = "/assets/characters/cc0/models/";

export const BODY_FILE = "base_body_anim.glb";

/** Named recipes for the people in the barangay. */
export const LOOKS = {
  // Ernie: Filipino boy, ~14. Small frame, short hair, house clothes.
  ernie: {
    morphs: {
      gender_male: 0.92,
      age_child: 0.62,
      height_short: 0.42,
      weight_min: 0.34,
      muscle_min: 0.2,
      face_jaw_width_decr: 0.22,
      face_eye_size_incr: 0.18,
    },
    garments: ["clothing_tshirt.glb", "clothing_shorts.glb", "clothing_shoes.glb"],
    hair: "hair_short02.glb",
    tints: { "clothing_tshirt.glb": 0x9fb2c4, "clothing_shorts.glb": 0x2f3a4a },
    height: 1.52,
  },
  // Aling Nena: the tindera. Late twenties, everyday duster, ponytail.
  tindera: {
    morphs: {
      gender_female: 0.95,
      age_child: 0.05,
      height_short: 0.22,
      weight_max: 0.18,
      proportions_ideal: 0.6,
      face_cheekbones_incr: 0.16,
      face_lips_incr: 0.12,
    },
    garments: ["clothing_dress.glb", "clothing_shoes.glb"],
    hair: "hair_ponytail01.glb",
    tints: { "clothing_dress.glb": 0x6f8f7a },
    height: 1.58,
  },
  /**
   * Maria Labo. Tall, thin, ashen; a black dress that goes to the ankles, black
   * hair to the waist and no shoes. The rig cannot give her the parts that make
   * her *her* — the floor-length skirt and the hair hanging over the face — so
   * those are separate pieces attached to the pelvis and head bones by
   * `attachMariaDress()`; the head sits low so the face is under the hair.
   */
  maria: {
    morphs: {
      gender_female: 0.97,
      age_child: 0.02,
      height_tall: 0.5,
      weight_min: 0.42,
      muscle_min: 0.3,
      face_cheekbones_decr: 0.45,
      face_eye_size_decr: 0.3,
      face_chin_decr: 0.22,
      face_jaw_width_decr: 0.18,
    },
    garments: ["clothing_dress.glb"],
    hair: "hair_long01.glb",
    tints: { "clothing_dress.glb": 0x241f1e },
    // ashen, a little grey, the way a body reads under a bulb
    skin: 0xc9c1b8,
    height: 1.73,
    extras: attachMariaDress,
    pose: [
      ["neck_01", [0.2, 0, 0]],
      ["head", [0.14, 0, 0.05]],
      ["spine_02", [0.04, 0, 0.02]],
    ],
  },
};

/* ----------------------------------------------------------- Maria's pieces */

/**
 * The two things the CC0 rig has no morph for: a skirt that reaches her ankles
 * and a curtain of hair over her face. Both are attached to bones, so they ride
 * the clips — and both are built in metres after the rig is scaled, which is
 * why they hang off the bones instead of being part of the body mesh.
 */
export function attachMariaDress({ holder, bones, height }) {
  if (!holder || !bones) return;
  holder.updateMatrixWorld(true);

  const clothMat = new THREE.MeshStandardMaterial({
    color: 0x2b2727,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x121010,
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const world = (boneName) => {
    const bone = bones.get(boneName);
    if (!bone) return null;
    const v = new THREE.Vector3();
    bone.getWorldPosition(v);
    return v;
  };

  const pelvis = bones.get("pelvis");
  const head = bones.get("head");
  const hipL = world("thigh_l");
  const hipR = world("thigh_r");
  const pelvisAt = world("pelvis");

  if (pelvis && pelvisAt && hipL && hipR) {
    const waistY = pelvisAt.y + 0.09;
    const hemY = 0.055; // just above the ground, so she does not float
    const rWaist = Math.max(0.14, hipL.distanceTo(hipR) / 2 + 0.075);
    const RINGS = 14;
    const SEGS = 32;
    const pos = [];
    const idx = [];
    for (let ring = 0; ring <= RINGS; ring++) {
      const t = ring / RINGS;
      const y = waistY + (hemY - waistY) * t;
      // a straight fall that flares only near the hem, the way wet cloth does
      const flare = 1 + 0.78 * Math.pow(t, 1.6);
      for (let s = 0; s < SEGS; s++) {
        const a = (s / SEGS) * Math.PI * 2;
        const fold = 1 + 0.05 * Math.sin(a * 9 + t * 1.4) + 0.035 * Math.sin(a * 4 - t * 2.6);
        const r = rWaist * flare * fold;
        // ragged hem: cut the very bottom ring unevenly
        const ragged = ring === RINGS ? 0.02 + 0.035 * (0.5 + 0.5 * Math.sin(a * 5.5 + 1.3)) : 0;
        pos.push(Math.sin(a) * r, y + ragged, Math.cos(a) * r * 0.88);
      }
    }
    for (let ring = 0; ring < RINGS; ring++) {
      for (let s = 0; s < SEGS; s++) {
        const i0 = ring * SEGS + s;
        const i1 = ring * SEGS + ((s + 1) % SEGS);
        const i2 = i0 + SEGS;
        const i3 = i1 + SEGS;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    const skirtGeo = new THREE.BufferGeometry();
    skirtGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    skirtGeo.setIndex(idx);
    skirtGeo.computeVertexNormals();
    const skirt = new THREE.Mesh(skirtGeo, clothMat);
    skirt.name = "maria-skirt";
    skirt.castShadow = true;
    // the skirt hangs off the pelvis, so it swings with the body
    pelvis.attach(skirt);
  }

  if (head) {
    const headAt = world("head");
    const unit = (height ?? 1.73) / 1.73;
    const crownY = headAt.y + 0.115 * unit;
    const browY = headAt.y + 0.02 * unit;
    const faceZ = headAt.z + 0.125 * unit; // in front of the nose, not through it
    const STRANDS = 26;
    const hair = new THREE.Group();
    hair.name = "maria-hair";
    const r = mulberry32(7);
    for (let i = 0; i < STRANDS; i++) {
      const f = (i % 13) / 12;
      const layer = i < 13 ? 0 : 1; // a second, shorter layer fills the gaps
      const x = (f - 0.5) * 0.205 * unit + (layer ? (r() - 0.5) * 0.012 : 0);
      const length = (0.34 + 0.08 * Math.sin(f * Math.PI) + r() * 0.07) * unit;
      const zAt = faceZ + layer * 0.028 * unit + 0.02 * Math.cos((f - 0.5) * Math.PI * 1.6);
      const segs = 7;
      const width = (0.036 - 0.008 * Math.abs(f - 0.5) * 2) * unit;
      const verts = [];
      const faces = [];
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const y = crownY - length * t;
        // over the skull to the brow, then straight down in front of the face
        const curve = y > browY ? (crownY - y) / Math.max(0.001, crownY - browY) : 1;
        const zz = (headAt.z + 0.015 + (zAt - headAt.z - 0.015) * Math.min(1, curve)) -
          0.018 * Math.sin(t * Math.PI) * unit;
        const sway = Math.sin(t * 2.6 + i * 0.7) * 0.012 * unit;
        const w = (width * (1 - 0.28 * t)) / 2;
        verts.push(x + sway - w, y, zz, x + sway + w, y, zz);
        if (s < segs) {
          const b = s * 2;
          faces.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setIndex(faces);
      g.computeVertexNormals();
      const strand = new THREE.Mesh(g, hairMat);
      strand.castShadow = true;
      hair.add(strand);
    }
    head.attach(hair);
  }
}

/** Small deterministic PRNG, so Maria's hair is the same on every load. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class CharacterLibrary {
  constructor() {
    this.loader = new GLTFLoader();
    this.pending = new Map();
    this.warned = new Set();
  }

  load(file) {
    if (!this.pending.has(file)) {
      this.pending.set(
        file,
        this.loader.loadAsync(MODEL_BASE + file).catch((err) => {
          console.warn(`[characters] could not load ${file}:`, err?.message ?? err);
          return null;
        })
      );
    }
    return this.pending.get(file);
  }

  async preload() {
    await this.load(BODY_FILE);
  }

  /**
   * Build a character. Returns { root, mixer, actions, play, dispose }.
   * `root` is positioned with feet at y=0.
   */
  async create(lookName, opts = {}) {
    const look = typeof lookName === "string" ? LOOKS[lookName] : lookName;
    if (!look) throw new Error(`unknown character look: ${lookName}`);

    const body = await this.load(BODY_FILE);
    if (!body) return this.fallback(lookName, opts);

    const root = cloneSkinned(body.scene);
    const bodyMeshes = [];
    root.traverse((o) => {
      if (o.isSkinnedMesh) bodyMeshes.push(o);
    });
    if (!bodyMeshes.length) return this.fallback(lookName, opts);

    // 1. zero all 92 morph weights, then apply the intended ones
    for (const mesh of bodyMeshes) applyMorphs(mesh, look.morphs);
    if (look.skin !== undefined) {
      // keep the face map: the tint multiplies it rather than replacing it
      for (const mesh of bodyMeshes) mesh.material = tintMaterial(mesh.material, look.skin, true);
    }

    // body bone map for garment rebinding
    const bones = new Map();
    root.traverse((o) => {
      if (o.isBone) bones.set(o.name, o);
    });

    // 2. garments + hair, rebound onto the body skeleton
    const attachments = [...(look.garments ?? [])];
    if (look.hair) attachments.push(look.hair);
    for (const file of attachments) {
      const gltf = await this.load(file);
      if (!gltf) continue;
      try {
        const piece = cloneSkinned(gltf.scene);
        const meshes = [];
        piece.traverse((o) => {
          if (o.isSkinnedMesh) meshes.push(o);
        });
        for (const gsm of meshes) {
          applyMorphs(gsm, look.morphs);
          rebind(gsm, bones);
          const tint = look.tints?.[file];
          if (tint !== undefined) gsm.material = tintMaterial(gsm.material, tint);
          // sit it beside the body mesh so local transforms match exactly
          const host = bodyMeshes[0].parent ?? root;
          gsm.position.copy(bodyMeshes[0].position);
          gsm.quaternion.copy(bodyMeshes[0].quaternion);
          gsm.scale.copy(bodyMeshes[0].scale);
          gsm.frustumCulled = false;
          host.add(gsm);
        }
      } catch (err) {
        console.warn(`[characters] garment ${file} failed:`, err?.message ?? err);
      }
    }

    // 3. scale the whole rig to the intended height (raw rig is ~1.66m)
    const box = new THREE.Box3().setFromObject(root);
    const raw = Math.max(0.5, box.max.y - Math.min(0, box.min.y));
    const targetHeight = look.height ?? 1.66;
    const scale = THREE.MathUtils.clamp(targetHeight / raw, 0.6, 1.6);
    const holder = new THREE.Group();
    holder.add(root);
    root.scale.setScalar(scale);
    root.position.y = -Math.min(0, box.min.y) * scale;
    for (const m of bodyMeshes) m.frustumCulled = false;

    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        if (o.material) o.material.side = THREE.FrontSide;
      }
    });

    // 4. animation
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map();
    for (const clip of body.animations ?? []) {
      const action = mixer.clipAction(clip);
      actions.set(clip.name, action);
    }
    const play = (name, fade = 0.25) => {
      const next = actions.get(name) ?? actions.get("idle");
      if (!next) return;
      for (const [key, action] of actions) {
        if (action !== next && action.isRunning()) action.fadeOut(fade);
      }
      next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    };
    play(opts.animation ?? "idle", 0);

    // 3b. pieces the rig has no morph for (Maria's skirt and hair), plus pose
    // offsets. Both are attached to bones, so both must be re-applied after the
    // mixer writes the clip: the clip owns every bone rotation.
    const postUpdate = [];
    if (typeof look.extras === "function") {
      look.extras({ holder, bones, height: targetHeight, postUpdate });
    }
    if (look.pose?.length) {
      const offsets = look.pose
        .map(([name, [x, y, z]]) => [bones.get(name), x ?? 0, y ?? 0, z ?? 0])
        .filter(([bone]) => bone);
      postUpdate.push(() => {
        for (const [bone, x, y, z] of offsets) {
          bone.rotation.x += x;
          bone.rotation.y += y;
          bone.rotation.z += z;
        }
      });
    }
    const stepMixer = mixer.update.bind(mixer);
    if (postUpdate.length) {
      mixer.update = (dt) => {
        stepMixer(dt);
        for (const fn of postUpdate) fn(dt);
      };
      // and once now, so the first frame is already posed
      for (const fn of postUpdate) fn(0);
    }

    if (opts.position) holder.position.copy(opts.position);
    if (opts.rotationY !== undefined) holder.rotation.y = opts.rotationY;

    return {
      root: holder,
      mixer,
      actions,
      play,
      bones,
      postUpdate,
      height: targetHeight,
      dispose: () => mixer.stopAllAction(),
    };
  }

  /** Blocky stand-in used only if the CC0 assets are unavailable. */
  fallback(name, opts = {}) {
    console.warn(`[characters] using fallback silhouette for ${name}`);
    const holder = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xb98a63, roughness: 0.85 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x6f8f7a, roughness: 0.9 });
    const h = LOOKS[name]?.height ?? 1.6;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.14, h * 0.42, 6, 12), cloth);
    body.position.y = h * 0.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.1, 16, 12), skin);
    head.position.y = h * 0.92;
    holder.add(body, head);
    if (opts.position) holder.position.copy(opts.position);
    if (opts.rotationY !== undefined) holder.rotation.y = opts.rotationY;
    return {
      root: holder,
      mixer: { update() {}, stopAllAction() {} },
      actions: new Map(),
      play() {},
      height: h,
      dispose() {},
    };
  }
}

function applyMorphs(mesh, morphs) {
  const dict = mesh.morphTargetDictionary;
  const infl = mesh.morphTargetInfluences;
  if (!infl) return;
  if (!dict) {
    infl.fill(0);
    return;
  }
  for (let i = 0; i < infl.length; i++) infl[i] = 0;
  if (!morphs) return;
  for (const [key, value] of Object.entries(morphs)) {
    const idx = dict[key];
    if (idx !== undefined) infl[idx] = value;
  }
  if (mesh.geometry?.morphAttributes) mesh.geometry.morphAttributes.needsUpdate = true;
}

/** Point a garment's skeleton at the body's live bones, matched by name. */
function rebind(skinnedMesh, boneMap) {
  const skel = skinnedMesh.skeleton;
  if (!skel) return;
  const mapped = skel.bones.map((bone) => boneMap.get(bone.name) ?? bone);
  const mismatched = mapped.filter((b, i) => b !== skel.bones[i]).length;
  skinnedMesh.skeleton = new THREE.Skeleton(mapped, skel.boneInverses);
  if (mismatched === 0 && !skinnedMesh.userData.silentBind) {
    console.warn(`[characters] garment "${skinnedMesh.name}" matched no bones by name`);
  }
}

/**
 * Recolour a garment. SkeletonUtils.clone() shares materials with the cached
 * GLTF, so the material itself must be cloned before its colour is changed.
 */
function tintMaterial(material, colorHex) {
  if (!material) return material;
  const one = (mat) => {
    const clone = mat.clone();
    clone.color = new THREE.Color(colorHex);
    clone.roughness = Math.max(clone.roughness ?? 1, 0.72);
    clone.metalness = 0;
    // a tinted albedo map would fight the colour, so drop it for fabric
    if (clone.map) {
      clone.map = null;
      clone.needsUpdate = true;
    }
    return clone;
  };
  return Array.isArray(material) ? material.map(one) : one(material);
}
