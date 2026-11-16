# Maria Labo: Nawawala — toolchain

A first-person Filipino horror prototype set in **Barangay Kabudoy**. Ernie, 14,
walks out looking for his sister Lisa. This folder holds the working toolchain and
the playable build that runs in the browser.

> **Provenance note.** The original workspace (game, models, textures, audio,
> setup scripts) was never committed and could not be recovered — see
> [`../../continuation.md`](../../continuation.md). Everything in this folder is
> a **new rebuild** created from those design notes. Nothing here is a restored
> original.

## Run it

```bash
python3 barangay/serve.py            # http://localhost:4188/
python3 barangay/serve.py --port 5000
```

The server binds `0.0.0.0`, serves this folder as the root, no-cache, and maps
`/` to `barangay/index.html`. `node_modules/` is **not** required to play: the
browser bundles are vendored in `vendor/` (see below).

## Verify the toolchain

```bash
npm ci
npm run verify        # the stack: three, Rapier WASM, GLBs, clips, licences, bundles
npm run walkthrough   # builds the real scene and walks Ernie to the hall on foot
```

`verify-stack.mjs` checks three.js, a real Rapier WASM world (capsule falls,
settles, is blocked by a wall, ray-casts a landmark 293 m away), every GLB's
container/accessor/morph/animation integrity, clip-vs-rig bone mapping, the CC0
license records, and that every browser bundle's bare imports are covered by the
import map.

## What is in the box

| Piece | Version | Where |
|---|---|---|
| three.js | 0.185.1 (r185) | `vendor/three/` (build + GLTFLoader, SkeletonUtils, BufferGeometryUtils, OrbitControls) |
| Rapier physics | `@dimforge/rapier3d-compat` 0.21.0 | `vendor/rapier/rapier.mjs` (WASM inlined) |
| CC0 character rig, morphs, garments, hair, 12 baked clips | kblood/CharacterCreator @ `852e48f` | `assets/characters/cc0/` |
| Node.js | 22.22.3 | sandbox |
| Python | 3.11.2 | sandbox |

`node_modules/` is a build-time convenience only (it is excluded from snapshots);
the vendored bundles are what the browser actually loads. `vendor/` holds MIT
(three) and Apache-2.0 (Rapier) licence files.

## Controls

| Input | Action |
|---|---|
| `W A S D` / arrows | walk |
| `Shift` | run |
| mouse | look — drag the view, or click to capture the pointer |
| `E` | talk to the tindera / sit on the bench / read |
| `F` | flashlight |
| `Esc` | release pointer, close the shop, stand up |
| `G` | dev jump to the hall lawn |
| Araw / Gabi | set 08:00 / 00:00 (night also triggers the dog howl) |
| time field | set any hour; one real second = one in-game minute |

Touch: left joystick to walk, drag to look, buttons for flashlight.

## Modelling pass (second build)

The first pass dressed the village in plain boxes and cone hills. Everything now
comes from `barangay/models.js`, a library of real components:

- **Houses** — concrete plinth (or stilts for the two raised houses), batten
  siding, corner boards, recessed windows with sills, mullions and louvred
  *persianas*, a ventanilla over the door, panelled doors with jambs, head
  casing, hinges, knob and threshold, concrete steps, an awning on brackets, a
  porch with deck, posts, canopy, fascia and turned balusters, plus a tapayan
  (lathe-turned clay jar), potted plants, a clothesline of laundry and a bamboo
  fence.
- **Roofs** — corrugated *sheets*: the ribs are real geometry with a shallow sag
  between purlins, closed by a fascia board and a soffit, capped at the ridge.
- **Hall** — four-post portico carrying a first-floor balcony with balustrade,
  cornice, skirt and storey band, double panelled doors, ten front windows, side
  windows, entrance lamps, signboards, a finialled flagpole and a mown lawn.
- **Landscape** — the 7-sided cones are gone. The horizon is a displaced terrain
  ring (7,896 vertices) that is flat where you walk, rolls into hills, then
  ridges into mountains at the fog line. Rice is a clump of curved blades, and
  the cornfield is a single merged stalk-plus-leaves geometry, both instanced.
- **Performance** — houses were 188 loose parts each; a static-batch pass with
  shared materials folds them to ~25-31 draw calls, so all that detail costs
  about 410 draw calls for the whole village at ~70k triangles.

## Sound pass

`barangay/sound.js` synthesises everything with the Web Audio API — there are no
recordings in this build.

- **Footsteps** are layered from a heel thump, a two-grain surface crunch and a
  scuff, panned left/right by alternating foot, with a longer stride when
  running. Five surfaces are mapped by position in `barangay/surfaces.js`:
  gravel on the road, grass off it, **wood on the store's floorboards**, and
  concrete on the hall forecourt.
- **Landing** thuds when you drop more than a few metres.
- **Dawn** — a synthesised rooster at 05:00, then sparse birdsong while the sun
  is up; crickets swell after dusk and the dog howls at midnight.

## What is actually implemented

- Terrain, dirt road with shoulders, rice paddies with planted rows and bunds, a
  cornfield, hills and mountains, drifting clouds, stars at night.
- **The extended approach**: the hall now sits at `z = -280`, ~2× the previous
  140 m, at the end of a seamless road. Roughly 300 puno ng saging line both
  shoulders the whole way, with deeper groves behind them, three plant variants
  with tapered trunks and folded, wind-shredded leaves.
- **The barangay hall**: two storeys, gable roof, blue trim, ten front windows,
  side windows, double door, `BARANGAY KABUDOY` and `TANGGAPAN NG PUNONG
  BARANGAY` signboards, entrance lamps that come on after dusk, an animated
  Philippine flag on a 9.5 m pole, and a mown lawn. Solid to walk into.
- Sari-sari store: nipa roof, porch posts, service counter, three shelves of
  products, hanging sachets, painted signboard, the long slatted side **upuan**
  (now sit-able), and the tindera's own back room with a **kusina** — the low
  table, kaldero, stove and stacked plates she was missing before.
- **Aling Nena**, the tindera: a CC0 skinned character (dress, ponytail, idle +
  breathing clips), Filipino subtitles with an English gloss, a 14-item shop,
  ₱50 to start, a no-credit response when the money is short, and a camera that
  glides to her and back without losing your position or flashlight state.
- Ernie's house with garden bed, porch bulb, and a synthesised radio.
- 24-hour clock, day/dusk/night lighting, midnight dog howl, footsteps and
  crickets, sound captions for accessibility.
- **Rapier is actually integrated now**: a kinematic capsule + character
  controller with autostep and ground snapping against the ground, every house,
  the store, the bench, the flagpole, road-side posts and invisible play bounds.

## What is *not* implemented (do not claim otherwise)

- Maria Labo is **not** in the scene and there is no chase or story progression.
  Only her look recipe (`LOOKS.maria`) exists.
- Shop items are not usable; money and bag are session-only.
- The hall interior is locked; only the exterior and lawn exist.
- No recorded audio: the dog howl is **synthesised**, not the CC0 recording the
  old build used, and the radio is a synthetic loop, not live radio.
- No recorded tindera voice. Dialogue is subtitled only; the old `voice-04`
  clips were not recoverable and that voice id is not portable.
- No character *faces* fitted from AI images yet; the CC0 heads use their own
  skin textures. See `../../resources/IMG2THREEJS-WORKFLOW.md`.
- Blender is not installed and never worked in this environment (`bpy` failed on
  missing X11/OpenGL libraries). No `.blend` files are produced here.
- VoiceStudio is not installed or functional.

## Files

```text
resources/game-dev-toolkit/
  package.json / package-lock.json    node deps (three, rapier) for verify only
  verify-stack.mjs                    the stack test suite
  serve.py -> barangay/serve.py
  barangay/
    index.html                        UI, import map, HUD, shop panel
    main.js                           Rapier player, input, interactions, loop
    world.js                          terrain, road, grove, hall, fields, sky, clock
    places.js                         store, bench, tindera, Ernie's house, posts
    models.js                         component library: roofs, windows, doors, props, terrain
    characters.js                     CC0 body/garment factory, morphs, clips
    surfaces.js                       which footstep surface is underfoot
    textures.js                       procedural canvas surfaces
    physics.js                        Rapier world + shared character step
    shop.js / tindera-lines.js        inventory, wallet, dialogue
    sound.js                          synthesised ambience, footsteps, howl, radio
  walkthrough-test.mjs                 headless route test (no browser needed)
  assets/characters/cc0/              models, animations, catalogs, licences
  vendor/                             browser bundles (three, rapier)
```

## Next step

The outstanding design request from the handoff — a farther hall behind a longer
banana approach — is now in place at `z = -280`. Worth confirming on foot, then:
Maria's chase, hall interior, the tindera's recorded voice, and AI-generated
surface textures swapped in behind `textures.js`.
