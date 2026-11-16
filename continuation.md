# Maria Labo: Nawawala — continuation handoff

## Important: source files need recovery

The latest barangay game, character models, textures, audio, and setup scripts from the previous workspace are **not present in the current checkout**. They were not committed to the available Git history, whose current base is `67e7009e5f339ee3605258dd23d93a75c9c8bb37`. The original reason for their absence is unknown. A search of connected Google Drive for names containing Maria, barangay, or game-dev-toolkit returned no matching files. This document is a handoff of the conversation and known design, **not a backup or runnable game**.

First try to restore the earlier workspace snapshot or obtain a copy of the missing `resources/game-dev-toolkit/` folder and associated setup files. If no backup can be recovered, ask the owner before rebuilding, and clearly identify recreated assets as new. Do not claim that this document restores the original project. Avoid replacing a recovered project with a new prototype without permission.

## Immediate unfinished request

The owner wants the **Barangay Kabudoy hall farther away** than in the last preview, with a longer, fuller approach lined with **puno ng saging** (banana trees). The path should remain walkable, the hall and Philippine flag visible when reached, and the result polished rather than a scattering of random shapes. This request was **not implemented** because the source files were missing.

When the game is recovered, extend the road and terrain and playable bounds together, move the hall and its collision/landmarks to the new location, adjust distant hills and fog, extend the banana grove on both sides, and verify the route on foot. Do not break the store, house, time controls, audio, or interaction camera. Check real visual results as well as collisions and performance.

## Game direction and standing preferences

- Original first-person Filipino horror game titled **Maria Labo: Nawawala**. Ernie is a Filipino older brother, around **14**, searching for his younger sister after children begin disappearing every night. Barangay residents talk about their missing sons and daughters. Maria Labo should eventually chase the player through the barangay.
- Setting: a Philippine barangay named **Barangay Kabudoy**, with rice fields, cornfields, rural houses, and nearby hills/mountains.
- Tone: grounded, familiar provincial atmosphere, inspired by the mood of *Hapunan*, not a copy of its assets, likenesses, story, or code.
- Ernie should look like a believable kid aged about 13–15, not an adult or a cartoon assembled from random primitive shapes. User prefers images/textures fitted to appropriate models; prior low-quality primitive Ernie was rejected and deleted.
- The user wants polished Philippine surroundings and a sari-sari store with a long side **upuan**. They asked about an authentic store image and the tindera's house and kusina visible behind her; that home/kitchen was **not implemented** in the earlier prototype.

## Previously built prototype (historical; files currently missing)

The prior implementation was a stylized Three.js browser prototype, not a finished game, a Blender file, or a Rapier-integrated game. It used pinned Three.js 0.185.1, and Rapier 0.21.0 was installed separately for exploration. Assets and implementation need to be recovered before these can run again.

- First-person barangay road, textured houses, grass, planted rice and corn, hills, mountains, transparent drifting clouds, nighttime stars, sun/moon, flashlight and basic collision.
- A larger two-storey closed barangay hall with a Philippine flag and sign. The most recent previous hall was at approximately world `z = -140` beyond 64 banana trees. It was still visible from the start along a straight road. The owner now wants it **farther** and the banana-tree approach longer.
- The sari-sari store had a pitched roof, porch, service opening, shelf products, hanging sachets, and a long slatted wooden bench on its side. The bench had collision but was not sit-able. The tindera's own home and kusina were not present.
- Tindera was an animated skinned character with Filipino subtitles, dialogue choices, and AI-generated speech. Ernie started with ₱50; the shop had 14 products, session-only balance/inventory, and a spoken/subtitled no-credit response for insufficient money. Items were not usable. User prefers a younger-sounding woman, not the earlier old strict voice. Existing voice clips, if recovered, were generated with the session's `voice-04`; this ID cannot be assumed portable to another voice service.
- Interacting with the tindera moved the first-person camera smoothly to a view of her, displaying the dialogue and shop menu beside her on desktop and in a bottom panel on mobile. Closing restored the previous position/view and flashlight state. This was an original camera workflow, not copied *Hapunan* code.
- Ernie's house had two small bedrooms, a kusina, sala, garden, switchable light, electric fan, and radio. The radio used a local CC0 music loop, not live radio. Garden watering and fan/switch sounds were interactive.
- 24-hour in-game clock, about one real second per in-game minute, with Day (08:00) and Night (00:00) buttons, an editable time, sound-caption toggle, night crickets, footsteps, and a distant recorded dog howl triggered at midnight or by selecting Night. Audio needed a user gesture and was not queued for later if muted/blocked. Clouds drifted; stars were night-only.
- A separate Ernie model preview used CC0 morphable skinned human assets, clothing, hair, animations, and a runtime-projected face, not a standalone combined GLB or in-game protagonist model.
- A separate Maria Labo preview assembled a female-morphed body, hair, dress, shoes, and idle/walk/run animations. It had an everyday floral-dress form and a creepier long white apparition form with blood on her dress and facial scar. The portrait and scar were runtime projections, not sculpted or baked; cloth and facial seams needed refinement. Maria was **not yet connected to gameplay or a chase**.

## Prior layout to look for in a backup

```text
resources/game-dev-toolkit/
  package.json / package-lock.json       # Three.js, Rapier and other dependencies
  barangay/
    index.html                          # game UI and time controls
    world.js                            # world, road, grove, hall, clock and camera
    places.js                           # Ernie house, store, bench and tindera
    shop.js / tindera-lines.js          # shop choices, dialogue and subtitles
    sound.js                            # cricket, dog howl, footsteps and voices
    serve.py / README.md
    textures/ audio/
    characters/ernie/cc0-teen-assets/   # shared CC0 body, clothes, rig and animations
    characters/maria/                  # separate Maria character viewer
resources/setup-game-toolkit.sh
resources/VOICESTUDIO-INSTALLATION.md
resources/setup-voicestudio-source.sh
```

The previous live preview ran through `python3 resources/game-dev-toolkit/barangay/serve.py` on a configurable port and bound to `0.0.0.0`. The last preview used port 4188, served the game at `/`, and disabled caching. That process is no longer available in the current workspace. For a new Arena preview, use a fresh server on `0.0.0.0`; browser code should use relative URLs and never call browser localhost.

## Assets, provenance and limitations

- Skinned body, morphs, garments, hair, skeleton and animation assets used in the separate character previews and tindera came from [kblood/CharacterCreator at commit `852e48f316b90a0937234886630e4fb4cdfd1f78`](https://github.com/kblood/CharacterCreator/tree/852e48f316b90a0937234886630e4fb4cdfd1f78/output). Its [license notes](https://github.com/kblood/CharacterCreator/blob/852e48f316b90a0937234886630e4fb4cdfd1f78/LICENSE-NOTES.md) state generated models/morphs/joints/animation clips are CC0; source code is GPL. Verify before reuse. The GLBs default all 92 morph weights to 1; previous viewers zeroed them before applying intended morphs.
- The distant dog howl used a CC0 recording of [simcotter's dog howling](https://freesound.org/people/simcotter/sounds/115357/), sourced as an excerpt from [bark-lab at `602a6c5931be85d5421a7b469d8a8ec8aa9ae656`](https://github.com/voidash/bark-lab/blob/602a6c5931be85d5421a7b469d8a8ec8aa9ae656/crates/chimera/src/creatures/data/README.md). Prior credits documented cricket, footstep, and radio sources separately; recover and preserve those credits.
- Scene and character surface images were original AI-generated assets, not assets from *Hapunan*. They cannot be reconstructed exactly from this document.
- Blender was not operational in the old environment: its `bpy` import failed due to missing X11/OpenGL libraries. Do not claim Blender was installed and working.
- The user explicitly requested the open-source **VoiceStudio** project, not the hosted ElevenLabs API. The previous effort only built its frontend and installed a Python package without dependencies; no working desktop, backend, model, or synthesis was available. Model downloads were blocked and model weights have their own licensing terms. Do not claim VoiceStudio generated the tindera clips or is functional.
- The installed `img2threejs` skill was agent-guided reconstruction, not automatic image-to-mesh conversion.

## Verification checklist after recovery

1. Confirm recovered source, textures, audio and license documentation are actually present. Reinstall pinned dependencies using the recovered setup instructions; do not commit `node_modules` or virtual environments.
2. Walk from the start, through the extended banana grove, to the relocated hall; verify ground, road and play bounds extend all the way and collision blocks the hall but not the approach. Visually inspect day and night views.
3. Exercise Day/Night, 24-hour clock, moving clouds, stars, midnight dog howl and sound captions; verify no delayed howl during daytime. Start audio from a user gesture and account for mute/browser permissions.
4. Verify Ernie's house, radio, fan, lights, garden, store bench and tindera menu, dialogue/voice, ₱50 purchase flow, no-credit response and camera focus/restore on desktop and mobile.
5. Check browser console/network errors and accessible controls. Audio-buffer/playback checks are not proof of physical speaker audibility.
6. Keep unimplemented features clearly labeled: chase/story progression, usable inventory, hall interior, tindera home/kusina, production-quality character exports and functional VoiceStudio.
