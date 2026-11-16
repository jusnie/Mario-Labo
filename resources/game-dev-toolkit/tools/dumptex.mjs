/**
 * dumptex.mjs — write a procedural texture out as a PNG so it can be eyeballed.
 *
 *   node tools/dumptex.mjs plaster:3 corrugated:1 "roadBed:0.3:768"
 *
 * Needs @napi-rs/canvas (dev-only, `npm i --no-save @napi-rs/canvas`) because
 * the game's textures are drawn with a real 2D canvas context.
 */
import { writeFileSync } from "node:fs";

let createCanvas;
try {
  ({ createCanvas } = await import("@napi-rs/canvas"));
} catch {
  console.error("dumptex needs @napi-rs/canvas: npm i --no-save @napi-rs/canvas");
  process.exit(1);
}

globalThis.document = { createElement: () => createCanvas(512, 512) };
const TEX = await import("../barangay/textures.js");

for (const job of process.argv.slice(2)) {
  const [name, ...args] = job.split(":");
  const fn = TEX[name];
  if (typeof fn !== "function") {
    console.error(`no such texture: ${name}`);
    continue;
  }
  const tex = fn(...args.map((a) => (Number.isNaN(Number(a)) ? a : Number(a))));
  const img = tex?.image;
  if (!img?.toBuffer) {
    console.error(`${name}: no canvas-backed image`);
    continue;
  }
  const out = `/tmp/tex-${name.toLowerCase()}.png`;
  writeFileSync(out, img.toBuffer("image/png"));
  console.log(`${out} — ${img.width}x${img.height}`);
}
