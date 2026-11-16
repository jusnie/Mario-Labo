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

`barangay/sound.js` now plays **recorded** effects and keeps its synthesis only as
a fallback. The recordings are the Oculus Audio Pack 1 (CC BY 4.0, via Meta Open
Sound) in `assets/audio/oculus/` — 57 Ogg Vorbis files, 2.7 MB, fetched by
`tools/fetch-oculus-audio.mjs` and checksummed in `MANIFEST.json`. Attribution is
in `CREDITS.md` and on the in-game About card.

- **Footsteps** use the recorded shoe takes for the surface underfoot and pick a
  random take each stride, with ±5% pitch and level variation and left/right
  panning. Five surfaces come from `barangay/surfaces.js`: gravel on the road,
  grass off it, **wood on the store's floorboards**, concrete on the hall
  forecourt, and dirt on the bare paths. The pack has no gravel, so the road is
  the concrete take plus a thin synthesised grit layer.
- **Landing** plays the recorded `Land` take, harder the further you fell.
- **Ambience** is two long loops crossfaded by the clock: forest by day
  (59 s) and forest night (45 s), with the recorded forest-birds take dropped in
  at random intervals and stereo positions.
- **Dawn** plays the chicken recording at 05:00 (the pack has no rooster — the
  caption says "manok", not "tilaok"); the midnight dog uses the recorded
  attention call and barks, lowpassed and delayed to sound far off; the house
  door is the recorded wooden door.
- The **radio** stays deliberately synthesised, and says so in its caption.

## Modelling pass (third build)

The village is built from components in `barangay/models.js`, not from boxes and
cones standing in for things.

**Houses** (`buildHouse` in `world.js`) gained the details that make a provincial
house read as one:

- **roof**: ribbed corrugated sheets, a ridge cap, **barge boards down each
  gable rake**, **exposed rafter tails** under the eaves, a **louvred gable vent**
  at each end, plus the ridge-high/eaves-low geometry the roof test pins down.
- **openings**: six-light windows with glazing bars, timber **shutters** folded
  flat against the wall, **ventanilla** slat bands under the front windows, a
  panelled door with jamb, head, threshold, knob and hinges.
- **rainwater**: a **galvanised gutter with brackets** along the street eave, a
  downpipe, and a **ribbed steel drum** standing under it.
- **porch**: deck, carried posts, canopy with fascia, baluster railings, bench,
  and steps set outside the deck. Water jar, potted plant, clothesline and bamboo
  fence finish the yard.
- façade layout: the door sits off-centre and the front windows have slots
  measured from it, so a shutter can no longer end up inside a door jamb — the
  walkthrough test asserts this for all seven houses.

**Mountains** (`horizonTerrain` in `models.js`):

- heights come from **domain-warped ridged noise** (`1-|2n-1|`), which gives
  sharp crests instead of rounded fbm domes — the test counts separate crests so
  one smooth lump cannot pass.
- a **volcanic cone** with a notched crater, a raised rim and radial gullies
  stands as the landmark, its footprint damping the range noise so the cone is
  not swallowed by the ridge line.
- **slope-based vertex colouring**: rock on the crags, forest green on the
  sheltered mid slopes, silt in the valleys, and an aerial-perspective lerp
  toward haze with distance, so far crests sit behind near ones.

## Looking at the build without a browser

There is no Chromium or WebGL in this environment, so `tools/preview.mjs`
rasterises the real scene to PNG in software (z-buffer, near-plane clipping, flat
shading, vertex colours; no textures, shadows or fog) and hands the result to
ImageMagick:

```bash
node tools/preview.mjs house       # preview-house.png
node tools/preview.mjs street      # preview-street.png
node tools/preview.mjs hall       # the hall on its own
node tools/preview.mjs forecourt  # the hall as the grove opens up
node tools/preview.mjs porch      # Ernie's porch
node tools/preview.mjs store
node tools/preview.mjs mountains
node tools/preview.mjs all
```

The PNGs are gitignored — regenerate them whenever the modelling changes.

## What is actually implemented

- Terrain, dirt road with shoulders, rice paddies with planted rows and bunds, a
  cornfield, hills and mountains, drifting clouds, stars at night.
- **The extended approach**: the hall now sits at `z = -280`, ~2× the previous
  140 m, at the end of a seamless road. Roughly 300 puno ng saging line both
  shoulders the whole way, with deeper groves behind them, three plant variants
  with tapered trunks and folded, wind-shredded leaves.
- **The barangay hall**: remodelled from the owner's elevation sheet — two
  storeys on a raised plinth, a recessed entrance bay between square columns, a
  balustraded balcony carrying the `BARANGAY KABUDOY` sign on its rail, side
  verandas with their own canopies, louvred windows in dark frames, a hip roof
  (`hipRoof`, four pitches, no gable) with 1.35 m eaves, `TANGGAPAN NG PUNONG
  BARANGAY` over the doors, entrance lamps that come on after dusk, an animated
  Philippine flag on an 11 m pole with its own plinth, hedges and a mown lawn.
  Solid to walk into: four treads up the plinth, then the entrance bay.
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
    sound.js                          recorded effects (CC BY 4.0) + synth fallback, radio
  walkthrough-test.mjs                 headless route test (no browser needed)
  tools/preview.mjs                    software renderer: scene -> PNG, no GPU
  tools/fetch-oculus-audio.mjs        re-downloads the 57 vendored sound effects
  assets/audio/oculus/                57 Ogg recordings, LICENSE (CC BY 4.0), MANIFEST.json
  assets/characters/cc0/              models, animations, catalogs, licences
  vendor/                             browser bundles (three, rapier)
```

## Next step

The outstanding design request from the handoff — a farther hall behind a longer
banana approach — is now in place at `z = -280`. Worth confirming on foot, then:
Maria's chase, hall interior, the tindera's recorded voice, and AI-generated
surface textures swapped in behind `textures.js`.
