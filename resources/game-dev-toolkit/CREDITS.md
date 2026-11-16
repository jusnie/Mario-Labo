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

No recorded audio is shipped in this build.

- Crickets, wind, footsteps, the door creak, the radio loop and the **dog howl**
  are all synthesised at runtime with the Web Audio API
  (`barangay/sound.js`). The howl is explicitly **not** a recording.
- The previous build used a CC0 dog-howl recording by **simcotter**
  (<https://freesound.org/people/simcotter/sounds/115357/>), sourced via the
  **bark-lab** repository at `602a6c5931be85d5421a7b469d8a8ec8aa9ae656`. That
  file could not be fetched in this environment (no route to freesound). If it
  is restored, place it at `assets/audio/dog-howl.ogg` and keep this credit.
- Cricket, footstep and radio credits from the earlier build were not recovered;
  re-add them here if those files come back.

## Textures

All surfaces in `barangay/textures.js` are drawn procedurally on a canvas at
load time — no third-party images. Faces and garment albedo maps come from the
CC0 MakeHuman/CharacterCreator sets above.

## Inspiration

The tone references the mood of *Hapunan*. No assets, likenesses, story text or
code from *Hapunan* are used or reproduced.
