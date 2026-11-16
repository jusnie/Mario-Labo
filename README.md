# Maria Labo: Nawawala

A first-person Filipino horror game set in **Barangay Kabudoy**. Ernie, 14, goes
looking for his younger sister Lisa the night the children start disappearing.

## Status

This repository was rebuilt from a handoff document after the original workspace
was lost — see [`continuation.md`](continuation.md). The game, models, textures
and audio from that earlier build were never committed and could not be
recovered, so everything here is new work built from the design notes.

The playable prototype lives in [`resources/game-dev-toolkit/`](resources/game-dev-toolkit/README.md).

## Run

```bash
python3 resources/game-dev-toolkit/barangay/serve.py --port 4188
```

Then open the served URL. Nothing needs installing to play: three.js and Rapier
are vendored under `resources/game-dev-toolkit/vendor/`.

## Docs

| File | What it is |
|---|---|
| [`continuation.md`](continuation.md) | The handoff: design intent, what was built before, what was lost |
| [`resources/INSTALLED-STACK.md`](resources/INSTALLED-STACK.md) | What is installed, what is not, and the verification output |
| [`resources/game-dev-toolkit/README.md`](resources/game-dev-toolkit/README.md) | Controls, layout, implemented vs. not |
| [`resources/game-dev-toolkit/CREDITS.md`](resources/game-dev-toolkit/CREDITS.md) | Licences: three.js, Rapier, CC0 character assets, audio provenance |
| [`resources/IMG2THREEJS-WORKFLOW.md`](resources/IMG2THREEJS-WORKFLOW.md) | How images get fitted into the scene |

## Licences

Code in `resources/game-dev-toolkit/barangay/` is original to this repository.
Vendored libraries keep their own licences (three.js MIT, Rapier Apache-2.0) and
the CC0 character assets ship with the upstream licence notes. Full detail:
[`CREDITS.md`](resources/game-dev-toolkit/CREDITS.md).
