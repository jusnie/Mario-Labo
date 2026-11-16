# Installing the Maria Labo stack — record

Date: 2026-11-16 · branch `arena/be51d423-mario-labo`

Everything below is installed **in this repository** and verified. The previous
workspace was lost, so this is a fresh toolchain, not a restore.

## What was asked for, and its state

| Item | Status | Detail |
|---|---|---|
| Three.js | ✅ installed | 0.185.1 (r185), pinned. Browser build vendored in `resources/game-dev-toolkit/vendor/three/`. |
| CC0 character models + animations | ✅ installed | kblood/CharacterCreator @ `852e48f`: body rig (53 bones, 92 morphs), 12 baked clips, 8 garments, 3 hairstyles. 18 MB in `assets/characters/cc0/`, with licences. |
| AI-generated images | ⚠️ available, not yet applied | Image generation is available in this session. All current surfaces are procedural (better for seamless tiling); the swap-in path is documented in `IMG2THREEJS-WORKFLOW.md`. Nothing AI-generated from the old build could be recovered. |
| img2threejs skill | ⚠️ documented, not a package | This was never an installable package — it was agent-side guidance for reconstructing a scene from an image. Its useful rules are written up in `IMG2THREEJS-WORKFLOW.md` so they survive without an agent session. |
| AI speech | ⚠️ available, not yet recorded | Speech synthesis is available in this session. No tindera voice clips are in the repo yet; the old `voice-04` id is not portable. Dialogue is subtitled for now. |
| Recorded sounds | ❌ not recoverable | The CC0 dog howl (simcotter via bark-lab) lives on freesound, which is not reachable from this sandbox. Substituted with a clearly-labelled synthesised howl. |
| Python | ✅ present | 3.11.2 — runs `barangay/serve.py`. |
| Node.js | ✅ present | 22.22.3 / npm 10.9.8 — `npm ci`, `npm run verify`. |
| Rapier | ✅ installed **and integrated** | `@dimforge/rapier3d-compat` 0.21.0. Unlike the previous build, gameplay now uses a Rapier `KinematicCharacterController` (capsule, autostep, ground snap) against the ground, houses, store, bench, flagpole, posts and play bounds. |
| Blender | ❌ unavailable | Never worked here: `bpy` import fails without X11/OpenGL libraries. No `.blend` workflow is claimed. |
| VoiceStudio | ❌ not installed | Not attempted in this pass. The hosted ElevenLabs API was explicitly not wanted. |

## Verification (`npm run verify`)

```text
three r185 imported
scene graph + InstancedMesh(64) built
raycaster hit instance at y=0.50
rapier initialised (WASM instantiated)
capsule fell and settled on ground (y=1.419, grounded 118/120 frames)
wall collision blocks the character
castRay reaches the distant hall landmark (toi=293.0m)
12/12 GLB assets valid — 92 morph targets, 53 joints, 12 baked clips each
52/52 boneMap entries resolve to real rig bones
idle/walk/run authoring clips: 22 joint tracks, 481/61/44 frames @ 60fps
37/37 upstream assets are CC0
every browser bundle's bare imports resolve through the import map
STACK OK — every check passed
```

## Walkthrough (`npm run walkthrough`)

Since there is no browser in this sandbox, the route is verified headlessly with
the real scene and the real character controller at 60 fps:

```text
scene built in 74ms — 545 meshes, 9 instanced meshes (11115 instances)
116 static colliders, 284 banana plants
hall front is 286m from the spawn (previous build: ~154m at z=-140)
banana grove spans 206m of road with 284 plants
grove ends before the hall lawn, so the hall is revealed
road runs to z=-292, past the hall front; play bounds reach z=-288
walked the full 286m route to the hall in 110.0s
never fell through the ground
hall is solid — stopped at z=-271.70, front face z=-272.0
store counter reachable, bench reachable, Ernie's house door reachable
one real second advances one in-game minute; midnight dark, noon lit
world.update() ran clean at 7 times of day (140 frames)
WALKTHROUGH OK — the route is walkable end to end
```

## Notes for the next session

- `node_modules/` is excluded from workspace snapshots. `vendor/` and `assets/`
  are committed, so **the game runs without reinstalling**; only `npm run verify`
  needs `npm ci`.
- Rapier in the browser comes from the vendored `vendor/rapier/rapier.mjs` via
  the import map (`@dimforge/rapier3d-compat`), so no bundler is involved.
- Preview: `python3 resources/game-dev-toolkit/barangay/serve.py` → the game is
  served at `/`, bound to `0.0.0.0`, no-cache, `.mjs`/`.glb`/`.wasm` MIME types
  set. Browser code only uses relative/absolute paths — never localhost.
