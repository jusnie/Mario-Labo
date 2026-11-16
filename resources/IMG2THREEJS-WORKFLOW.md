# img2threejs workflow — fitting images to the barangay

The "img2threejs skill" from the previous workspace was never a package you could
install; it was agent-side guidance for rebuilding a 3D scene from a reference
image. This file keeps the rules that actually matter so they outlive any one
session. It is **not** automatic image-to-mesh conversion — nothing here turns a
photo into a model by itself.

## What images are good for

| Use | Yes | No |
|---|---|---|
| Tiling surfaces (dirt, grass, nipa, corrugated iron, plaster) | ✅ | |
| Signs and lettering | ✅ (canvas text is sharper) | |
| Character **faces** projected onto a head | ✅ with limits | |
| A whole building or street recreated from a photo | ⚠️ by hand, piece by piece | ❌ |
| Generating a mesh from one image | | ❌ |

## Rules that keep it looking like a place, not a collage

1. **One light direction.** Pick the sun angle (this scene: rises +X, sets −X) and
   make every generated surface agree with it. A texture lit from the left on a
   wall lit from the right kills the illusion faster than low poly counts.
2. **Match the palette to the fog.** The scene's fog is the horizon colour; sample
   texture mid-tones from that same family, or distant buildings pop out.
3. **Seamless or don't tile.** Bake tiles at 512/1024 and mirror-wrap; a visible
   seam repeated 40× along a road reads as a mistake. Prefer drawing tiling
   surfaces procedurally (`barangay/textures.js`) and reserving generated images
   for one-off decals.
4. **Scale is measured, not guessed.** A corrugated sheet is ~2.4 m wide; a nipa
   course ~0.4 m; a door 0.8×2.0 m. Set `texture.repeat` from those numbers.
5. **Faces: fit, don't paste.** Project the portrait through a camera onto the
   CC0 head, then keep the original skin texture as the base and the portrait as a
   low-opacity detail layer. Lasers-on-a-sphere portraits are the single most
   obvious failure mode, and the previous build's Ernie was rejected for exactly
   that reason.
6. **Never claim a photo-derived asset is authentic to a real barangay.** Mark
   generated images as new work in `CREDITS.md`.
7. **Licences travel with the image.** A generated image can still be derivative.
   Only use references you own or that are licensed for this.

## How to swap a surface in

`barangay/textures.js` is the single entry point. Each factory returns a
`THREE.CanvasTexture`. To use an image instead:

```js
// before: procedural
export function dirtRoad(repeat = 1) { /* canvas drawing */ }

// after: generated image, still tiling-safe
const loader = new THREE.TextureLoader();
export function dirtRoad(repeat = 1) {
  const tex = loader.load("/assets/textures/dirt-road.jpg");
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
```

Then run `npm run verify` and walk the road at 08:00 and 20:00 — a texture that
works at noon will often glow at night because the emissive window materials and
the moon light do not know about it.

## Where generated images are still owed

- Building surfaces: weathered corrugated iron, nipa thatch close-ups.
- Plant detail: banana leaf macro, rice blade macro.
- Character faces: Ernie, Aling Nena, Maria Labo — fitted to the CC0 heads, not
  pasted flat.
- The sari-sari store reference the owner asked about (an authentic-looking
  storefront), used as a guide for proportions, not as a texture.
