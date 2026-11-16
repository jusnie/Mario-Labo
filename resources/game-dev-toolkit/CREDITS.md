# Credits and licences

## three.js 0.185.1

MIT. Copyright © 2010–2026 three.js authors.
Bundled in `vendor/three/` together with its `LICENSE`.
<https://github.com/mrdoob/three.js>

## Rapier — `@dimforge/rapier3d-compat` 0.21.0

Apache-2.0, © Dimforge / Sébastien Crozet.
Bundled in `vendor/rapier/` together with its `LICENSE`.
The compat build inlines the WebAssembly module as base64, so it needs no
separate `.wasm` request.
<https://github.com/dimforge/rapier>

## Character rig, morphs, garments, hair and animation clips

**kblood/CharacterCreator**, commit `852e48f316b90a0937234886630e4fb4cdfd1f78`.
Vendored in `assets/characters/cc0/` with the upstream `LICENSE`,
`LICENSE-NOTES.md` and `PROVENANCE.md`.

- **Generated assets — CC0-1.0**: `output/base_body*.glb`, `output/hair_*.glb`,
  `output/clothing_*.glb`, the 92 morph targets, the baked animation clips in
  `base_body_anim.glb`, and the JSON sidecars (`clothing.json`, `hair.json`,
  `base_body.joints.json`, `body_colliders.json`, `asset_licenses.json`,
  `animations/*.json`).
- **Upstream MakeHuman assets — all 37 are CC0**, listed in
  `assets/characters/cc0/catalog/asset_licenses.json` (skins, eyes, eyebrows,
  eyelashes, teeth, tongue, hair meshes).
- **Code in that repository — GPL-3.0-or-later.** No code from it is copied into
  this project; only generated CC0 assets are used. The Blender pipeline that
  produced them is GPL and is not vendored here.
- The GLBs default all 92 morph weights to 1 and must be zeroed before use —
  `barangay/characters.js` does this.

## Audio

**Recorded sound effects — Oculus Audio Pack 1, CC BY 4.0.**

- Source: **Meta Open Sound** (`facebookincubator/Meta-open-sound`), directory
  `corpora/oculus-audio-pack/ogg`. <https://github.com/facebookincubator/Meta-open-sound>
- Licence: **Creative Commons Attribution 4.0 International (CC BY 4.0)**.
  The pack's own `LICENSE` file is vendored next to the samples in
  `assets/audio/oculus/LICENSE`, and the collection-level `LICENSE` in that
  repository is CC0 — the audio files themselves are the CC BY 4.0 part.
- Attribution to keep, in the form the pack asks for:
  **"Oculus Audio Pack 1, via Meta Open Sound, licensed CC BY 4.0."**
  It is printed in game (the Sound panel / About card) and repeated in
  `assets/audio/oculus/MANIFEST.json`, which also records each file's size and
  SHA-256 so a re-download can be checked.
- Vendored subset — 57 files, 2.7 MB: `FEETHmn_Shoe{Concrete,Dirt,Grass,Wood}`
  `{Walk,Run,Land}` takes, `BIRDFowl_Chicken_OS_01`, `ANMLDog_DogAttention_OS_01`,
  `ANMLDog_DogBark_OS_01/02`, `DOORWood_FrontDoorOpen/Close_OS_01`,
  `AMBForst_ForestBirds_OS_01`, `AMBForst_Forest_LOOP_01`,
  `AMBForst_Night_LOOP_01`. Re-fetch with
  `node tools/fetch-oculus-audio.mjs`.
- The samples are Freesound-derived field recordings redistributed by Meta under
  CC BY 4.0; the individual recordist names are not carried in the pack's
  filenames, so the collection is credited as above rather than per-clip.

Still synthesised on purpose (`barangay/sound.js`):

- the **radio** in Ernie's house — a generated music loop, captioned as
  "synthesised loop";
- the **grit** layer mixed under the gravel road, because the pack has no gravel
  recording;
- the whole **fallback path** used before the samples finish decoding or if any
  of them 404s, so a missing file cannot silence the game.

Two things the pack does not contain, stated plainly: there is **no rooster** —
`BIRDFowl_Chicken_OS_01` is a chicken, and the dawn call plays it pitched down
and captioned "(Manok sa malayo)"; and there is no dog howl, only the
"attention" call and barks, which is what the midnight dog now uses.

## Textures

All surfaces in `barangay/textures.js` are drawn procedurally on a canvas at
load time — no third-party images. Faces and garment albedo maps come from the
CC0 MakeHuman/CharacterCreator sets above.

## Inspiration

The tone references the mood of *Hapunan*. No assets, likenesses, story text or
code from *Hapunan* are used or reproduced.
