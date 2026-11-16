/**
 * sky-preview.mjs — render the sky dome at a sequence of hours, side by side.
 *
 * The sky is a fragment shader, and there is no GPU in this sandbox, so this
 * drives the JavaScript mirror in `barangay/sky.js` instead: identical palette
 * maths, identical tonemapping. Each frame is a wide-angle view looking west
 * (the sun sets that way) with a flat ground line so the haze band and the
 * horizon can be judged.
 *
 *   node tools/sky-preview.mjs            -> preview-sky.png  (6 hours)
 *   node tools/sky-preview.mjs 5 6 12 18  -> your own hours
 *
 * Needs @napi-rs/canvas only if you want the PNG; it falls back to PPM+ImageMagick
 * exactly like tools/preview.mjs.
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import * as THREE from "three";
import { createSkyUniforms, updatePalette, sampleSky } from "../barangay/sky.js";

const HOURS = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [5.2, 6.1, 8, 12, 17.4, 18.3];
const W = 420;
const H = 300;
const FOV = 82; // degrees, vertical

/* camera looking west, slightly up, so the horizon sits a third from the bottom */
const yaw = Math.PI; // looking west, where the sun goes down
const pitch = 0.12;
const camDir = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
const right = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
const up = new THREE.Vector3().crossVectors(right, camDir).normalize();

const frames = [];
for (const hour of HOURS) {
  const u = createSkyUniforms();
  updatePalette(u, hour);
  const px = new Uint8ClampedArray(W * H * 3);
  const tanHalf = Math.tan((FOV * Math.PI) / 180 / 2);
  const out = { r: 0, g: 0, b: 0 };
  for (let y = 0; y < H; y++) {
    const sy = (0.5 - (y + 0.5) / H) * 2 * tanHalf;
    for (let x = 0; x < W; x++) {
      const sx = ((x + 0.5) / W - 0.5) * 2 * tanHalf * (W / H);
      const dx = camDir.x + right.x * sx + up.x * sy;
      const dy = camDir.y + right.y * sx + up.y * sy;
      const dz = camDir.z + right.z * sx + up.z * sy;
      if (dy < 0) {
        // ground: a dark silhouetted field, so the horizon line is visible
        const i = (y * W + x) * 3;
        const shade = 26 + Math.max(0, -dy) * 14;
        px[i] = shade * 0.8;
        px[i + 1] = shade * 0.95;
        px[i + 2] = shade * 0.7;
        continue;
      }
      sampleSky(dx, dy, dz, u, out);
      const i = (y * W + x) * 3;
      px[i] = out.r;
      px[i + 1] = out.g;
      px[i + 2] = out.b;
    }
  }
  frames.push({ hour, px });
  console.log(`  ${hour.toFixed(1)}h  zenith ${u.topColor.value.getHexString()}  horizon ${u.horizonColor.value.getHexString()}  twilight ${u.twilight.value.toFixed(2)}`);
}

/* lay the frames out side by side, with each hour drawn into the image */
const totalW = W * frames.length;
const strip = Buffer.alloc(totalW * H * 3);
frames.forEach((f, fi) => {
  for (let y = 0; y < H; y++) {
    const src = y * W * 3;
    const dst = (y * totalW + fi * W) * 3;
    Buffer.from(f.px.buffer, src, W * 3).copy(strip, dst);
  }
  // a hairline between frames
  for (let y = 0; y < H; y++) {
    const dst = (y * totalW + (fi * W + W - 1)) * 3;
    strip[dst] = 12;
    strip[dst + 1] = 12;
    strip[dst + 2] = 14;
  }
});

const header = Buffer.from(`P6\n${totalW} ${H}\n255\n`, "latin1");
const ppm = "/tmp/preview-sky.ppm";
writeFileSync(ppm, Buffer.concat([header, strip]));
const labels = frames
  .map((f, i) => `-annotate +${i * W + 10}+${H / 2 - 10} "${f.hour.toFixed(1)}h"`)
  .join(" ");
execFileSync("sh", ["-c", `convert ${ppm} -fill white -pointsize 20 -font DejaVu-Sans ${labels} preview-sky.png`]);
console.log("preview-sky.png");
