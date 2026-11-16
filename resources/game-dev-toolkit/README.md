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

## The sky

`barangay/sky.js` owns the dome: the shaders, the palette and a CPU mirror of the
fragment shader. The old dome was `mix(horizon, zenith, pow(up, 0.55))` with a
soft dot for the sun — a flat wash with no haze, no twilight, no disc and no
moon, and — because a raw `ShaderMaterial` gets neither from the renderer — no
tonemapping, so it never matched the exposure of the ground it met.

What is there now:

- **an exponential vertical gradient**, so the deep blue sits high overhead and
  the horizon stays pale.
- **a Mie haze band** hugging the horizon, of the width you get in a humid
  tropical valley at sea level.
- **warm scattering toward the sun's azimuth**, strongest low down, plus a warm
  wash that only exists near the horizon at dawn and dusk (tinting the whole
  gradient with it turned the mid sky mauve).
- **a real sun disc** — about 1.4° across, deliberately a little generous, blown
  out to white by ACES — with three scales of bloom around it.
- **a full moon disc** and its halo at night, on the same axis as the moon light.
- **twilight**: a wedge of warm colour on the sun's side and a violet belt on
  the other, appearing only while the sun is within a few degrees of the
  horizon; twelve degrees below it there is nothing left but deep blue.
- **ACES tonemapping and sRGB encoding inside the shader**, so the dome and the
  ground go through the same exposure.
- **clouds take their colour from the sky they sit in**: hazy grey-blue by day,
  catching the sunset only on the sun's side, almost gone at night. Cumulus is
  billows with a shadowed underside and a sunlit crown; cirrus is its own wispy
  texture, high up, not a stretched cumulus.
- **stars in three size bands** with a brightness and colour spread, dimmer near
  the horizon, each band shimmering at its own rate.

`tools/sky-preview.mjs` renders the dome at a sequence of hours side by side
(using the CPU mirror, so it works without a GPU), and `SKY_HOUR=18.4 node
tools/preview.mjs street` renders any scene preview under that hour's sky.

## The mountains

The range is a displaced terrain ring (`horizonTerrain` in `models.js`), and it
used to read as a row of pale paper cut-outs: every ridge the same tone, no
surface, and — because the old fog curve put the whole range at 60-100 % fog by
day — a flat pastel silhouette that floated *lighter* than the sky behind it.

What changed:

- **fog is aerial perspective again, not a white-out.** By day it now runs
  about 200 m to 2800 m instead of 95 m to 950 m, and its colour sits a little
  below the sky it is seen against, so a backlit ridge stays a silhouette while
  a sunlit one keeps its colour.
- **a real surface**: `mountainDetail()` lays canopy mottle, scree and drainage
  lines over the range on world-space UVs (one tile per 62 m), with a value-noise
  normal map on top, so the slopes are not one flat wash under the sun.
- **rock where rock belongs**: slope comes from the mesh grid itself (not four
  extra height-field samples per vertex — that was most of a second of boot time
  for nothing) and steep faces turn to rock, sheltered mid slopes stay forest,
  valley floors go a touch darker.
- **serrated crests**: two finer ridged octaves (`spurs`, `ribs`) sit on top of
  the main range, so a skyline is crags and gullies rather than a smooth arc.
- **a second, farther range** behind the first, lower than the volcano and
  combined with `max()` rather than added, so it shows through the gaps in the
  near ridges — the layer behind layer that reads as distance.
- **skylight is the fill**: the hemisphere light was raised to ~1.15 at midday,
  because without a GI pass a slope facing away from the sun is lit by nothing
  else and went to near-black.
- resolution is up to 128 x 640, and the volcano keeps its gullied flanks and
  the notched crater that makes it the landmark.

## Looking at the build without a browser

There is no Chromium or WebGL in this environment, so `tools/preview.mjs`
rasterises the real scene to PNG in software: z-buffer, near-plane clipping,
perspective-correct UVs, **texture sampling**, instanced meshes and vertex
colours. It also applies the scene's own fog and its own lights — sun,
hemisphere and ambient, then ACES and sRGB exactly like the renderer — because
judging "too dark" or "too pale" against a made-up shading term is how the
mountains got left as pastel cut-outs. Shadows are still missing (`PREVIEW_SS=1`
for a quick, aliased render, `PREVIEW_EXPOSURE` to override exposure).

```bash
node tools/preview.mjs house       # preview-house.png
node tools/preview.mjs street      # preview-street.png
node tools/preview.mjs hall        # the hall on its own
node tools/preview.mjs forecourt   # the hall as the grove opens up
node tools/preview.mjs porch       # Ernie's porch
node tools/preview.mjs store
node tools/preview.mjs garden
node tools/preview.mjs mountains
node tools/preview.mjs all

node tools/sky-preview.mjs          # preview-sky.png: 05:12 .. 18:18 side by side
SKY_HOUR=6.4 node tools/preview.mjs street   # any preview, under any hour's sky
```

Textures only appear if the optional `@napi-rs/canvas` package is installed
(dev-only, not a dependency of the game):

```bash
npm i --no-save @napi-rs/canvas
```

`SKY_HOUR` drives the whole scene now, not just the sky: the world is built at
that hour, so lights, fog, window glow and the exposure the eye adapts to all
match the dome. Before this the sky could say 21:00 while the village was lit
by 15:00 sun, which made every dusk and night judgement worthless.

`PREVIEW_SS=1` renders without the default 2x2 supersampling, which is twice as
fast and half as legible. `node tools/dumptex.mjs plaster:3 "roadBed:0.3:768"`
writes a single procedural texture to `/tmp` so it can be inspected on its own —
that is how the "bubble wrap" plaster and the rib-on-rib roof moiré were found.

The PNGs are gitignored — regenerate them whenever the modelling changes.

## Realism pass

The place was legible but it read as cardboard: flat maps, a road laid on the
ground as a rectangle, and black holes for windows. What changed:

- **the road is one corridor, not a strip plus shoulders.** `roadBed()` in
  `textures.js` draws the running surface *and* both verges into a single tile —
  wheel ruts (two thirds of a lane apart), a pale worn crown, gravel, and edges
  that wander and break into clods before fading into the grass tone. The
  separate shoulder planes are gone, so there is no polygon edge left to see.
  The mesh is crowned and slightly rutted, ~3.2 m of ground per texture tile.
- **contact shadows.** `groundShadow()` bakes a radial AO smudge under every
  house, the store, Ernie's place and the hall — the thing that stops buildings
  looking pasted onto the ground.
- **normal maps.** `noiseNormal()` turns tileable value noise into a tangent-space
  normal map (no sRGB decode), applied to grass, road, verges and plaster.
- **corrugated iron is geometry, not a texture.** The sheets are modelled
  rib-by-rib; the map now carries only weathering — chalky oxidation, panel laps
  and rust bleeding down the slope. Painting ribs into the map as well put a
  second frequency a few millimetres off the modelled one, which is what made
  the old roofs swirl with moiré.
- **plaster is stucco**, not overlapping translucent circles: fine grit, soft
  tone drift, faint trowel sweeps, hairline cracks and a little grime.
- **glazing reflects the sky.** A baked pane texture (bright at the top, dark at
  the bottom, one diagonal glare) instead of an opaque dark material with no
  environment map to reflect.
- **weeds, 11 000 of them**, as real blade clumps in one instanced draw call:
  short, thin, a third of them dry, crowded against the road edge and thinning
  out across the verge.
- **signs fit their boards.** `sign()` measures its lettering and shrinks it until
  the longest line clears the border (the balcony sign used to read "ARANGAY
  KABUDOC").

### Second pass: the surfaces you stop seeing

The first pass fixed the things that were obviously wrong. This one went after
the things that were never wrong enough to notice, which is where a scene still
reads as a diorama:

- **the floor is no longer one colour.** The village disc is a polar grid with
  per-vertex colour now — dry patches, damp hollows, a worn band down the road —
  over the grass map. It is the largest surface in the game and it used to be a
  single olive tone.
- **paddies hold water.** `paddy()` draws transplanted hills standing in water,
  ~26 cm apart, under a rice texture that carries the canopy; the instanced tufts
  carry the silhouette. The plot gets macro colour in its vertices so the 2.6 m
  tile does not read as wallpaper. Dry mud under green tufts was what made the
  fields look like carpet.
- **shrubs are leaves, not blobs.** A dark core under two `leafSpray()`s of
  alpha-cut leaves from `leafSprig()` — midrib, side veins, a lighter tip — so a
  hedge has an edge made of leaves.
- **banana leaves have their own colour.** Vertex colour per leaf: midrib in
  shade, edges catching light, tips yellowing, the oldest leaves browning off.
  Nine to twelve per plant instead of seven, drooping further.
- **ambient is ground bounce, not blue.** It was `0x334455`, which turned every
  wall facing away from the sun grey-blue. It is warm now and slightly stronger,
  so a shaded facade stays cream.
- **the sari-sari curtain is stock, not bunting.** Rows of pouches on strings,
  each row a run of one or two brands, tinted foil-print packets (`packet()`)
  instead of twelve brightly coloured rectangles a metre apart.
- **twilight lasts twenty minutes.** `gold` used to die the moment the sun
  crossed the horizon, so 18:36 was already full night with a black sky. Civil
  twilight now reaches twenty degrees below the horizon and keeps a warm band in
  the west (`updatePalette` also returns `duskFill`, which feeds a little extra
  hemisphere and warm ambient into the ground), so the village stays legible
  while the ridges go to silhouette.
- **exposure follows the sun.** With the sun seven degrees up, the ground gets a
  seventh of its noon light, which is physically right and looked like an error
  at the hour the game starts. `state.exposure` is applied to the renderer *and*
  to the sky dome's own ACES (the dome tonemaps itself, so changing one without
  the other tears the horizon), and is not applied in full at night: after the
  sun is gone, darkness is the point.
- **counters are boards, not stripes.** `planks()` draws horizontal boards with
  grain, knots and shadowed edges; a grain map wrapped round a box reads as
  vertical corrugation.

## What is actually implemented

- Terrain, a crowned dirt road corridor with baked verges and 11 000 instanced
  weeds, rice paddies with planted rows and bunds, a cornfield, hills and
  mountains, drifting clouds, stars at night.
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
  tools/dumptex.mjs                    one procedural texture -> PNG, for inspection
  tools/sky-preview.mjs                the sky dome at six times of day
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
