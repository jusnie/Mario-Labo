#!/usr/bin/env node
/**
 * fetch-oculus-audio.mjs — re-download the recorded sound effects.
 *
 * Source: facebookincubator/Meta-open-sound, `corpora/oculus-audio-pack`
 * (Oculus Audio Pack 1, 508 samples, **CC BY 4.0** — attribution required, see
 * assets/audio/oculus/LICENSE and CREDITS.md).
 *
 * Only the files the game uses are taken, so the repo carries ~2.7 MB instead
 * of the whole pack. Run with: node tools/fetch-oculus-audio.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEST = join(ROOT, "assets/audio/oculus");
const REPO = "https://api.github.com/repos/facebookincubator/Meta-open-sound";
const API = `${REPO}/contents`;
const REPO_DIR = "corpora/oculus-audio-pack/ogg";

const FOOT_SURFACES = ["Dirt", "Grass", "Wood", "Concrete"];
const files = [];
for (const surface of FOOT_SURFACES) {
  for (const gait of ["Walk", "Run", "Land"]) {
    const count = gait === "Land" ? 2 : 5;
    for (let i = 1; i <= count; i++) {
      files.push(`${REPO_DIR}/FEETHmn_Shoe${surface}${gait}_OS_${String(i).padStart(2, "0")}.ogg`);
    }
  }
}
files.push(
  `${REPO_DIR}/AMBForst_Night_LOOP_01.ogg`,
  `${REPO_DIR}/AMBForst_Forest_LOOP_01.ogg`,
  `${REPO_DIR}/AMBForst_ForestBirds_OS_01.ogg`,
  `${REPO_DIR}/ANMLDog_DogBark_OS_01.ogg`,
  `${REPO_DIR}/ANMLDog_DogBark_OS_02.ogg`,
  `${REPO_DIR}/ANMLDog_DogAttention_OS_01.ogg`,
  `${REPO_DIR}/BIRDFowl_Chicken_OS_01.ogg`,
  `${REPO_DIR}/DOORWood_FrontDoorOpen_OS_01.ogg`,
  `${REPO_DIR}/DOORWood_FrontDoorClose_OS_01.ogg`
);

mkdirSync(DEST, { recursive: true });

/**
 * The sandbox's TLS interception chain is not in Node's CA bundle, so requests
 * go through curl (which uses the system store). Swap in fetch() elsewhere.
 */
async function getJson(path) {
  const out = execFileSync(
    "curl",
    ["-sS", "--fail", "-H", "Accept: application/vnd.github+json", `${API}/${path}`],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  return JSON.parse(out.toString("utf8"));
}

/**
 * Raw bytes for files the contents API won't inline (>1 MB). raw.githubusercontent
 * is blocked in this sandbox, but the git blobs endpoint serves base64 for any size.
 */
function getBlob(sha) {
  const meta = execFileSync(
    "curl",
    ["-sS", "--fail", "-H", "Accept: application/vnd.github+json", `${REPO}/git/blobs/${sha}`],
    { maxBuffer: 64 * 1024 * 1024 }
  );
  return Buffer.from(JSON.parse(meta.toString("utf8")).content, "base64");
}

let written = 0;
let bytes = 0;
const manifest = [];
for (const path of files) {
  const name = path.split("/").pop();
  const target = join(DEST, name);
  const meta = await getJson(path);
  // GitHub only inlines content up to 1 MB; anything bigger comes back as
  // { encoding: "none", content: "" } and has to be pulled from download_url.
  const data =
    meta.encoding === "base64" && meta.content
      ? Buffer.from(meta.content, "base64")
      : getBlob(meta.sha);
  if (!data.length) throw new Error(`empty payload for ${path}`);
  writeFileSync(target, data);
  written++;
  bytes += data.length;
  manifest.push({
    file: name,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
  process.stdout.write(`\r${written}/${files.length}  ${(bytes / 1024 / 1024).toFixed(2)} MB`);
}
console.log();

// licence + provenance
const licence = await getJson("corpora/oculus-audio-pack/LICENSE");
writeFileSync(join(DEST, "LICENSE"), Buffer.from(licence.content, "base64"));
writeFileSync(
  join(DEST, "MANIFEST.json"),
  JSON.stringify(
    {
      source: "https://github.com/facebookincubator/Meta-open-sound",
      collection: "Oculus Audio Pack 1",
      path: REPO_DIR,
      license: "CC BY 4.0",
      attribution:
        "Oculus Audio Pack 1, via Meta Open Sound (facebookincubator/Meta-open-sound), licensed CC BY 4.0",
      note: "Only the samples used by Barangay Kabudoy are vendored. Re-fetch with tools/fetch-oculus-audio.mjs",
      files: manifest,
    },
    null,
    2
  )
);
console.log(`done: ${written} files, ${(bytes / 1024 / 1024).toFixed(2)} MB + LICENSE + MANIFEST.json`);
