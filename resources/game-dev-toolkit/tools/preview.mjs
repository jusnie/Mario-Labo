/**
 * preview.mjs — render the built scene to PNG without a browser or a GPU.
 *
 * There is no Chromium and no WebGL in this sandbox, so the only way to look at
 * what the modelling code actually produces is to rasterise it here: project
 * every triangle with the real camera matrices, shade it flat, and write a PNG.
 * It is not the game's renderer — textures, shadows, fog and the sky shader are
 * all missing — but silhouettes, proportions and construction errors show up.
 *
 * Usage (from resources/game-dev-toolkit):
 *   node tools/preview.mjs house      -> preview-house.png
 *   node tools/preview.mjs street     -> preview-street.png
 *   node tools/preview.mjs mountains  -> preview-mountains.png
 *   node tools/preview.mjs porch      -> preview-porch.png
 *   node tools/preview.mjs hall       -> preview-hall.png (hall on its own)
 *   node tools/preview.mjs forecourt  -> preview-forecourt.png (hall in situ)
 *   node tools/preview.mjs all
 *
 * PNG encoding is delegated to ImageMagick (`convert`), which is present here;
 * the rasteriser itself writes a PPM first.
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/* ------------------------------------------------------------------- canvas
 * Optional: if @napi-rs/canvas is installed we rasterise with the real
 * procedural textures instead of flat material colours. It is a dev-only,
 * best-effort dependency (install it with `npm i --no-save @napi-rs/canvas`);
 * without it the preview still renders, just untextured.
 */
const CANVAS = await (async () => {
  try {
    return await import("@napi-rs/canvas");
  } catch {
    return null;
  }
})();

const gradient = { addColorStop() {} };
const ctx2d = new Proxy(
  {},
  {
    get(_t, key) {
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (key === "canvas") return { width: 512, height: 512 };
      if (key === "measureText") return () => ({ width: 10 });
      if (key === "createImageData") return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (key === "getImageData") return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      return () => {};
    },
    set() {
      return true;
    },
  }
);

globalThis.document = {
  createElement: (tag) => {
    if (CANVAS && (tag === "canvas" || !tag)) return CANVAS.createCanvas(512, 512);
    return { width: 512, height: 512, getContext: () => ctx2d };
  },
};

/** Pull a texture's pixels once, so the rasteriser can sample it per pixel. */
const TEXDATA = new Map();
function textureData(tex) {
  if (!CANVAS || !tex || !tex.image) return null;
  if (TEXDATA.has(tex.uuid)) return TEXDATA.get(tex.uuid);
  let entry = null;
  try {
    const img = tex.image;
    if (img.getContext) {
      const ctx = img.getContext("2d");
      const w = img.width;
      const h = img.height;
      const data = ctx.getImageData(0, 0, w, h).data;
      entry = {
        data,
        w,
        h,
        flipY: tex.flipY !== false,
        rx: tex.repeat ? tex.repeat.x : 1,
        ry: tex.repeat ? tex.repeat.y : 1,
        ox: tex.offset ? tex.offset.x : 0,
        oy: tex.offset ? tex.offset.y : 0,
        wrapS: tex.wrapS ?? 1000,
        wrapT: tex.wrapT ?? 1000,
      };
    }
  } catch {
    entry = null;
  }
  TEXDATA.set(tex.uuid, entry);
  return entry;
}

function wrapCoord(v, mode) {
  if (mode === 1001) return Math.min(1, Math.max(0, v)); // ClampToEdge
  return v - Math.floor(v);
}

/** Bilinear sample, in 0..1 sRGB byte space. */
function sampleTexture(t, u, v, out) {
  const su = wrapCoord(u * t.rx + t.ox, t.wrapS);
  const sv = wrapCoord(v * t.ry + t.oy, t.wrapT);
  let x = su * (t.w - 1);
  let y = (t.flipY ? 1 - sv : sv) * (t.h - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const x1 = Math.min(t.w - 1, x0 + 1);
  const y1 = Math.min(t.h - 1, y0 + 1);
  const d = t.data;
  const i00 = (y0 * t.w + x0) * 4;
  const i10 = (y0 * t.w + x1) * 4;
  const i01 = (y1 * t.w + x0) * 4;
  const i11 = (y1 * t.w + x1) * 4;
  for (let k = 0; k < 3; k++) {
    const top = d[i00 + k] * (1 - fx) + d[i10 + k] * fx;
    const bot = d[i01 + k] * (1 - fx) + d[i11 + k] * fx;
    out[k] = (top * (1 - fy) + bot * fy) / 255;
  }
  const ta = d[i00 + 3] * (1 - fx) + d[i10 + 3] * fx;
  const tb = d[i01 + 3] * (1 - fx) + d[i11 + 3] * fx;
  out[3] = (ta * (1 - fy) + tb * fy) / 255;
}

const THREE = await import("three");
const { createSkyUniforms, updatePalette, sampleSky } = await import("../barangay/sky.js");
const { buildWorld, buildHouse, buildHall, LAYOUT } = await import("../barangay/world.js");
const { gardenBed } = await import("../barangay/models.js");
const { createStore } = await import("../barangay/places.js");

// supersampled: the rasteriser has no mipmaps, so averaging 2x2 subsamples is
// what makes fine texture detail (roof ribs, grass blades) legible at all
const SS = Number(process.env.PREVIEW_SS ?? 2);
const W = 1100 * SS;
const H = 680 * SS;
const LIGHT = new THREE.Vector3(0.45, 0.82, 0.36).normalize();

const acesOne = (x) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
const encodeSRGB = (v) => Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2);
const toLinear = (v) => Math.pow(v, 2.2);
const EXPOSURE = Number(process.env.PREVIEW_EXPOSURE ?? 1.05);

/**
 * The scene's own lights, so previews are exposed the way the game exposes
 * them: sun + sky/ground hemisphere + ambient, diffuse = albedo * irradiance,
 * then ACES and sRGB exactly like the renderer. Judging "too dark" or "too
 * pale" against a made-up shading term is how the mountains got left pastel.
 */
function sceneLighting(scene) {
  const sun = { dir: LIGHT.clone(), color: new THREE.Color(0xffffff), intensity: 1 };
  const hemi = { sky: new THREE.Color(0xffffff), ground: new THREE.Color(0x333333), intensity: 0 };
  const ambient = { color: new THREE.Color(0xffffff), intensity: 0 };
  let found = false;
  scene.traverse((o) => {
    if (o.isDirectionalLight && o.intensity > 0 && !found) {
      sun.dir.copy(o.position).normalize();
      sun.color.copy(o.color);
      sun.intensity = o.intensity;
      found = true;
    } else if (o.isDirectionalLight && o.intensity > 0) {
      // a second directional light (the moon): add it in
      sun.color.lerp(o.color, 0.35);
      sun.intensity += o.intensity * 0.5;
    } else if (o.isHemisphereLight) {
      hemi.sky.copy(o.color);
      hemi.ground.copy(o.groundColor);
      hemi.intensity = o.intensity;
    } else if (o.isAmbientLight) {
      ambient.color.copy(o.color);
      ambient.intensity = o.intensity;
    }
  });
  if (!found) {
    // standalone previews (a house on its own) carry no lights: give them the
    // world's midday rig rather than rendering a black box
    const dir = new THREE.Vector3();
    const u = createSkyUniforms();
    updatePalette(u, skyHour);
    dir.copy(u.sunDir.value);
    sun.dir.copy(dir);
    sun.color.setHex(0xfff2d8);
    sun.intensity = 2.35;
    hemi.sky.copy(u.topColor.value).lerp(new THREE.Color(0xffffff), 0.35);
    hemi.ground.setHex(0x6b5f45);
    hemi.intensity = 1.15;
    ambient.color.setHex(0x334455);
    ambient.intensity = 0.32;
  }
  return { sun, hemi, ambient };
}

/** Flat colour for a material, approximating what the map would have been. */
function materialColour(mat) {
  const c = new THREE.Color(1, 1, 1);
  if (!mat) return c;
  if (mat.color) c.copy(mat.color);
  if (mat.map && !CANVAS && c.r > 0.92 && c.g > 0.92 && c.b > 0.92) c.setHex(0xc9c1ad); // textured wall / roof sheet
  if (mat.emissive && mat.emissiveIntensity > 0) c.lerp(mat.emissive, 0.35);
  return c;
}

function render(scene, camera, outPath) {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const colour = new Uint8ClampedArray(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);

  // sky: the same palette and the same sampler the shader uses, evaluated per
  // pixel through the camera basis. `skyHour` picks the time of day.
  const skyU = createSkyUniforms();
  updatePalette(skyU, skyHour);
  const tanHalf = Math.tan((camera.fov * Math.PI) / 180 / 2);
  const aspect = W / H;
  const basis = new THREE.Matrix4().extractRotation(camera.matrixWorld);
  const right = new THREE.Vector3(1, 0, 0).applyMatrix4(basis);
  const up = new THREE.Vector3(0, 1, 0).applyMatrix4(basis);
  const fwd = new THREE.Vector3(0, 0, -1).applyMatrix4(basis);
  {
    const out = { r: 0, g: 0, b: 0 };
    for (let y = 0; y < H; y++) {
      const sy = (0.5 - (y + 0.5) / H) * 2 * tanHalf;
      for (let x = 0; x < W; x++) {
        const sx = ((x + 0.5) / W - 0.5) * 2 * tanHalf * aspect;
        const dx = fwd.x + right.x * sx + up.x * sy;
        const dy = fwd.y + right.y * sx + up.y * sy;
        const dz = fwd.z + right.z * sx + up.z * sy;
        sampleSky(dx, dy, dz, skyU, out);
        const i = (y * W + x) * 3;
        colour[i] = out.r;
        colour[i + 1] = out.g;
        colour[i + 2] = out.b;
      }
    }
  }

  const view = camera.matrixWorldInverse;
  const proj = camera.projectionMatrix;
  // linear fog, so a preview shows the same atmospheric perspective the game does
  const lights = sceneLighting(scene);
  const fogColor = new THREE.Color();
  if (scene.fog) {
    fogColor.copy(scene.fog.color).convertLinearToSRGB();
    fogColor.setRGB(fogColor.r * 255, fogColor.g * 255, fogColor.b * 255, THREE.LinearSRGBColorSpace);
  }
  const fogNear = scene.fog?.near ?? 1e9;
  const fogFar = scene.fog?.far ?? 1e10;
  const fogAt = (depth) => {
    if (!scene.fog) return 0;
    return Math.min(1, Math.max(0, (depth - fogNear) / (fogFar - fogNear)));
  };
  const fogR = scene.fog ? Math.min(255, fogColor.r) : 0;
  const fogG = scene.fog ? Math.min(255, fogColor.g) : 0;
  const fogB = scene.fog ? Math.min(255, fogColor.b) : 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  let drawn = 0;

  scene.traverse((obj) => {
    if (!obj.isMesh || obj.isSkinnedMesh) return;
    // instanced meshes (weeds, grove, rice, corn) are drawn once per instance
    let instances = [null];
    if (obj.isInstancedMesh && obj.count) {
      instances = [];
      const m = new THREE.Matrix4();
      for (let i = 0; i < obj.count; i++) {
        obj.getMatrixAt(i, m);
        instances.push(m.clone());
      }
    }
    const geo = obj.geometry;
    const pos = geo.attributes?.position;
    if (!pos) return;
    const index = geo.index;
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (!mat || mat.isShaderMaterial) return; // sky dome: the gradient already stands in
    const base = materialColour(mat);
    // vertex colours matter on the terrain ring, which is all one material
    const vcol = mat.vertexColors ? geo.attributes.color : null;
    const uvs = geo.attributes.uv ?? null;
    const tdata = textureData(mat.map);
    const texPixel = [0, 0, 0, 1];
    const alphaBlend = !!mat.transparent && !!tdata;
    const triCount = index ? index.count / 3 : pos.count / 3;
    const instCol = obj.isInstancedMesh && obj.instanceColor ? obj.instanceColor : null;

    for (let inst = 0; inst < instances.length; inst++) {
    const mw = instances[inst]
      ? new THREE.Matrix4().multiplyMatrices(obj.matrixWorld, instances[inst])
      : obj.matrixWorld;
    if (instCol) {
      const c = new THREE.Color();
      c.fromBufferAttribute(instCol, inst);
      base.copy(c);
    }

    for (let t = 0; t < triCount; t++) {
      const ia = index ? index.getX(t * 3) : t * 3;
      const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(mw);
      b.fromBufferAttribute(pos, ib).applyMatrix4(mw);
      c.fromBufferAttribute(pos, ic).applyMatrix4(mw);

      // face normal
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      n.crossVectors(e1, e2).normalize();
      if (n.dot(e1.subVectors(eye, a)) < 0) n.negate();
      // irradiance from the scene's own lights, in linear space
      const ndl = Math.max(0, n.dot(lights.sun.dir));
      const upness = 0.5 + 0.5 * n.y;
      const irrR =
        (lights.sun.color.r * lights.sun.intensity * ndl +
          (lights.hemi.ground.r + (lights.hemi.sky.r - lights.hemi.ground.r) * upness) * lights.hemi.intensity +
          lights.ambient.color.r * lights.ambient.intensity) /
        Math.PI;
      const irrG =
        (lights.sun.color.g * lights.sun.intensity * ndl +
          (lights.hemi.ground.g + (lights.hemi.sky.g - lights.hemi.ground.g) * upness) * lights.hemi.intensity +
          lights.ambient.color.g * lights.ambient.intensity) /
        Math.PI;
      const irrB =
        (lights.sun.color.b * lights.sun.intensity * ndl +
          (lights.hemi.ground.b + (lights.hemi.sky.b - lights.hemi.ground.b) * upness) * lights.hemi.intensity +
          lights.ambient.color.b * lights.ambient.intensity) /
        Math.PI;

      // camera space, then clip against the near plane. Without this the big
      // ground disc and the road vanish as soon as one corner passes the camera.
      const uvAt = (i) =>
        uvs ? { u: uvs.getX(i), v: uvs.getY(i) } : { u: 0, v: 0 };
      const verts = [
        { world: a.clone(), view: a.clone().applyMatrix4(view), uv: uvAt(ia) },
        { world: b.clone(), view: b.clone().applyMatrix4(view), uv: uvAt(ib) },
        { world: c.clone(), view: c.clone().applyMatrix4(view), uv: uvAt(ic) },
      ];
      const near = -0.25;
      const poly = [];
      for (let i = 0; i < verts.length; i++) {
        const cur = verts[i];
        const nxt = verts[(i + 1) % verts.length];
        const curIn = cur.view.z <= near;
        const nxtIn = nxt.view.z <= near;
        if (curIn) poly.push(cur);
        if (curIn !== nxtIn) {
          const t = (near - cur.view.z) / (nxt.view.z - cur.view.z);
          poly.push({
            world: cur.world.clone().lerp(nxt.world, t),
            view: cur.view.clone().lerp(nxt.view, t),
            uv: { u: cur.uv.u + (nxt.uv.u - cur.uv.u) * t, v: cur.uv.v + (nxt.uv.v - cur.uv.v) * t },
          });
        }
      }
      if (poly.length < 3) continue;
      const screen = poly.map((v) => {
        const pv = v.view.clone().applyMatrix4(proj);
        const iz = 1 / -v.view.z;
        return {
          x: (pv.x * 0.5 + 0.5) * W,
          y: (0.5 - pv.y * 0.5) * H,
          z: iz,
          u: v.uv.u * iz,
          vv: v.uv.v * iz,
        };
      });

      let cr = base.r;
      let cg = base.g;
      let cb = base.b;
      if (vcol) {
        cr = (vcol.getX(ia) + vcol.getX(ib) + vcol.getX(ic)) / 3;
        cg = (vcol.getY(ia) + vcol.getY(ib) + vcol.getY(ic)) / 3;
        cb = (vcol.getZ(ia) + vcol.getZ(ib) + vcol.getZ(ic)) / 3;
      }
      const rr = 0; // computed per pixel below (needs the albedo from the map)
      const gg = 0;
      const bb = 0;

      for (let f = 1; f + 1 < screen.length; f++) {
        const A = screen[0];
        const B = screen[f];
        const C = screen[f + 1];
        const ax = A.x, ay = A.y, bx = B.x, by = B.y, cx = C.x, cy = C.y;
        const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
        const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
        const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
        const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
        if (maxX < minX || maxY < minY) continue;
        const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (Math.abs(area) < 1e-9) continue;
        const inv = 1 / area;
        const za = A.z, zb = B.z, zc = C.z;
        const ua = A.u, ub = B.u, uc = C.u;
        const va = A.vv, vb = B.vv, vc = C.vv;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) * inv;
          const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const iz = w0 * za + w1 * zb + w2 * zc;
          if (iz <= 0) continue;
          const z = 1 / iz;
          const di = y * W + x;
          if (z >= depth[di]) continue;
          if (!alphaBlend) depth[di] = z;
          const ci = di * 3;
          if (tdata) {
            const tu = (w0 * ua + w1 * ub + w2 * uc) * z;
            const tv = (w0 * va + w1 * vb + w2 * vc) * z;
            sampleTexture(tdata, tu, tv, texPixel);
            const r0 = encodeSRGB(acesOne(cr * toLinear(texPixel[0]) * irrR * EXPOSURE)) * 255;
            const g0 = encodeSRGB(acesOne(cg * toLinear(texPixel[1]) * irrG * EXPOSURE)) * 255;
            const b0 = encodeSRGB(acesOne(cb * toLinear(texPixel[2]) * irrB * EXPOSURE)) * 255;
            if (alphaBlend) {
              // contact shadows and other transparent decals: blend, no depth write
              const al = texPixel[3] * (mat.opacity ?? 1);
              colour[ci] = colour[ci] * (1 - al) + r0 * al;
              colour[ci + 1] = colour[ci + 1] * (1 - al) + g0 * al;
              colour[ci + 2] = colour[ci + 2] * (1 - al) + b0 * al;
            } else {
              colour[ci] = r0;
              colour[ci + 1] = g0;
              colour[ci + 2] = b0;
            }
          } else {
            colour[ci] = encodeSRGB(acesOne(cr * irrR * EXPOSURE)) * 255;
            colour[ci + 1] = encodeSRGB(acesOne(cg * irrG * EXPOSURE)) * 255;
            colour[ci + 2] = encodeSRGB(acesOne(cb * irrB * EXPOSURE)) * 255;
          }
          if (mat.emissive && mat.emissiveIntensity > 0) {
            const e = mat.emissiveIntensity;
            colour[ci] = Math.min(255, colour[ci] + encodeSRGB(acesOne(mat.emissive.r * e * EXPOSURE)) * 255 * 0.6);
            colour[ci + 1] = Math.min(255, colour[ci + 1] + encodeSRGB(acesOne(mat.emissive.g * e * EXPOSURE)) * 255 * 0.6);
            colour[ci + 2] = Math.min(255, colour[ci + 2] + encodeSRGB(acesOne(mat.emissive.b * e * EXPOSURE)) * 255 * 0.6);
          }
          const f = fogAt(z);
          if (f > 0) {
            colour[ci] += (fogR - colour[ci]) * f;
            colour[ci + 1] += (fogG - colour[ci + 1]) * f;
            colour[ci + 2] += (fogB - colour[ci + 2]) * f;
          }
        }
      }
      drawn++;
      }
    }
    }
  });

  /* ------------------------------------------------------------- sprites
   * Clouds are Sprites, and a sprite is just a camera-facing quad. Project it,
   * sample the cloud map, alpha-blend over whatever is already there. Without
   * this the previewer could never be used to judge cloud placement or tint.
   */
  const spriteList = [];
  scene.traverse((obj) => {
    if (obj.isSprite && obj.visible !== false) spriteList.push(obj);
  });
  const spritePixel = [0, 0, 0, 1];
  const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  for (const sp of spriteList) {
    const mat = sp.material;
    const tex = textureData(mat.map);
    if (!tex) continue;
    const centre = new THREE.Vector3().setFromMatrixPosition(sp.matrixWorld);
    if (centre.distanceTo(camPos) < 1) continue;
    const hw = sp.scale.x / 2;
    const hh = sp.scale.y / 2;
    const corners = [
      { world: centre.clone().addScaledVector(right, -hw).addScaledVector(up, -hh), uv: [0, 0] },
      { world: centre.clone().addScaledVector(right, hw).addScaledVector(up, -hh), uv: [1, 0] },
      { world: centre.clone().addScaledVector(right, hw).addScaledVector(up, hh), uv: [1, 1] },
      { world: centre.clone().addScaledVector(right, -hw).addScaledVector(up, hh), uv: [0, 1] },
    ].map((c) => {
      const vp = c.world.clone().applyMatrix4(camera.matrixWorldInverse);
      if (vp.z > -0.4) return null; // behind the camera: skip the whole quad
      const pv = vp.clone().applyMatrix4(proj);
      const iz = 1 / -vp.z;
      return {
        x: (pv.x * 0.5 + 0.5) * W,
        y: (0.5 - pv.y * 0.5) * H,
        z: iz,
        u: c.uv[0] * iz,
        v: c.uv[1] * iz,
        iz,
      };
    });
    if (corners.some((c) => !c)) continue;
    const tint = mat.color ?? { r: 1, g: 1, b: 1 };
    const tri = [[0, 1, 2], [0, 2, 3]];
    for (const [i0, i1, i2] of tri) {
      const A = corners[i0];
      const B = corners[i1];
      const C = corners[i2];
      const minX = Math.max(0, Math.floor(Math.min(A.x, B.x, C.x)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(A.x, B.x, C.x)));
      const minY = Math.max(0, Math.floor(Math.min(A.y, B.y, C.y)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(A.y, B.y, C.y)));
      const area = (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y);
      if (Math.abs(area) < 1e-9 || maxX < minX || maxY < minY) continue;
      const inv = 1 / area;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((B.x - px) * (C.y - py) - (C.x - px) * (B.y - py)) * inv;
          const w1 = ((C.x - px) * (A.y - py) - (A.x - px) * (C.y - py)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const iz = w0 * A.iz + w1 * B.iz + w2 * C.iz;
          if (iz <= 0) continue;
          const di = y * W + x;
          const z = 1 / iz;
          if (z >= depth[di]) continue;
          const tu = (w0 * A.u + w1 * B.u + w2 * C.u) * z;
          const tv = (w0 * A.v + w1 * B.v + w2 * C.v) * z;
          sampleTexture(tex, tu, tv, spritePixel);
          const al = spritePixel[3] * (mat.opacity ?? 1);
          if (al < 0.004) continue;
          const ci = di * 3;
          const r0 = spritePixel[0] * tint.r * 255;
          const g0 = spritePixel[1] * tint.g * 255;
          const b0 = spritePixel[2] * tint.b * 255;
          colour[ci] = colour[ci] * (1 - al) + r0 * al;
          colour[ci + 1] = colour[ci + 1] * (1 - al) + g0 * al;
          colour[ci + 2] = colour[ci + 2] * (1 - al) + b0 * al;
        }
      }
      drawn++;
    }
  }

  // decodeAudioData-style PPM out, then let ImageMagick do the PNG
  const header = Buffer.from(`P6\n${W} ${H}\n255\n`, "latin1");
  const ppm = `/tmp/preview-${outPath.split("/").pop().replace(/\.png$/, "")}.ppm`;
  writeFileSync(ppm, Buffer.concat([header, Buffer.from(colour.buffer)]));
  execFileSync(
    "convert",
    SS > 1 ? [ppm, "-filter", "box", "-resize", `${100 / SS}%`, outPath] : [ppm, outPath]
  );
  console.log(`${outPath} — ${drawn} triangles rasterised`);
}

function cameraAt(pos, look, fov = 55) {
  const cam = new THREE.PerspectiveCamera(fov, W / H, 0.1, 4000);
  cam.position.set(pos.x, pos.y, pos.z);
  cam.lookAt(look.x, look.y, look.z);
  return cam;
}

function ground(scene, colour = 0x6f7a4e, size = 900) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 1 })
  );
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);
}

const which = process.argv[2] ?? "house";
/** time of day used for the sky in every preview (the game starts at 17.5) */
const skyHour = Number(process.env.SKY_HOUR ?? 17.5);

if (which === "house" || which === "all") {
  const scene = new THREE.Scene();
  ground(scene);
  const house = buildHouse({ seed: 3, width: 8.2, depth: 6.6, porch: true, fence: true, laundry: true });
  house.group.position.set(0, 0, 0);
  scene.add(house.group);
  render(scene, cameraAt({ x: -9.5, y: 4.2, z: 9.5 }, { x: 0, y: 1.7, z: 0.6 }), "preview-house.png");
}

if (which === "porch" || which === "all") {
  const scene = new THREE.Scene();
  ground(scene);
  const house = buildHouse({ seed: 3, width: 8.2, depth: 6.6, porch: true, fence: true, laundry: true });
  house.group.position.set(0, 0, 0);
  scene.add(house.group);
  const porch = house.group.userData.porch;
  // stand in the yard, off the door axis, looking along the porch
  render(
    scene,
    cameraAt(
      { x: porch.doorX - 3.6, y: 1.55, z: porch.stepZ + 2.3 },
      { x: porch.doorX + 1.6, y: 0.75, z: porch.front - 0.1 }
    ),
    "preview-porch.png"
  );
}

if (which === "porchfront" || which === "all") {
  const scene = new THREE.Scene();
  ground(scene);
  const house = buildHouse({ seed: 3, width: 8.2, depth: 6.6, porch: true, fence: false, laundry: false });
  house.group.position.set(0, 0, 0);
  scene.add(house.group);
  const porch = house.group.userData.porch;
  render(
    scene,
    cameraAt(
      { x: porch.doorX - 0.4, y: 1.35, z: porch.stepZ + 3.4 },
      { x: porch.benchX - 0.9, y: 0.7, z: porch.front - 0.5 }
    ),
    "preview-porchfront.png"
  );
}

if (which === "garden" || which === "all") {
  const scene = new THREE.Scene();
  ground(scene);
  scene.add(gardenBed({ width: 5.6, depth: 2.2, ridges: 4, seed: 11, crop: "pechay", crop2: "talong" }));
  render(scene, cameraAt({ x: 3.1, y: 1.35, z: 3.0 }, { x: -0.2, y: 0.25, z: 0.1 }, 48), "preview-garden.png");
}

if (which === "street" || which === "all") {
  const scene = new THREE.Scene();
  const world = buildWorld(scene, { startHour: 15 });
  render(
    scene,
    cameraAt({ x: 3.0, y: 1.75, z: -34 }, { x: 0.5, y: 6, z: -150 }),
    "preview-street.png"
  );
  void world;
}

if (which === "hall" || which === "all") {
  // the hall on its own: from anywhere in the village the banana grove closes
  // over the forecourt and hides the ground storey, which makes a poor portrait
  const scene = new THREE.Scene();
  ground(scene);
  const hall = buildHall(scene, []);
  render(
    scene,
    cameraAt({ x: 9, y: 3.6, z: LAYOUT.hallZ + 34 }, { x: 0, y: 4.9, z: LAYOUT.hallZ + 8 }, 40),
    "preview-hall.png"
  );
  void hall;
}

if (which === "forecourt" || which === "all") {
  // what the player sees the moment the grove opens up: the hall in situ
  const scene = new THREE.Scene();
  const world = buildWorld(scene, { startHour: 16 });
  render(
    scene,
    cameraAt({ x: 2.2, y: 1.7, z: LAYOUT.hallZ + 18 }, { x: 0, y: 5.4, z: LAYOUT.hallZ + 8 }, 82),
    "preview-forecourt.png"
  );
  void world;
}

if (which === "hallsteps" || which === "all") {
  // the entrance as the player walks up to it: pots, steps, doors
  const scene = new THREE.Scene();
  const hall = buildHall(scene, []);
  render(
    scene,
    cameraAt({ x: 4.6, y: 1.7, z: LAYOUT.hallZ + 21 }, { x: 0, y: 3.2, z: LAYOUT.hallZ + 9 }, 58),
    "preview-hallsteps.png"
  );
  void hall;
}

if (which === "hallwing" || which === "all") {
  // ground-level look at the side veranda: this is where the columns used to
  // stop at plinth height and hang over the lawn
  const scene = new THREE.Scene();
  ground(scene);
  const hall = buildHall(scene, []);
  render(
    scene,
    cameraAt({ x: 21, y: 1.6, z: LAYOUT.hallZ + 13 }, { x: 12.5, y: 3.0, z: LAYOUT.hallZ + 1 }, 55),
    "preview-hallwing.png"
  );
  void hall;
}

if (which === "store" || which === "all") {
  const scene = new THREE.Scene();
  const world = buildWorld(scene, { startHour: 15 });
  await createStore(scene, world.colliders, null);
  // stand on the road, a little off the counter axis, so the open front and the
  // shelves behind it both read
  render(scene, cameraAt({ x: 3.2, y: 1.7, z: -2.2 }, { x: 10.5, y: 1.35, z: -6.9 }, 54), "preview-store.png");
  void world;
}

if (which === "mountains" || which === "all") {
  const scene = new THREE.Scene();
  const world = buildWorld(scene, { startHour: 15 });
  render(
    scene,
    cameraAt({ x: 0, y: 2.2, z: -60 }, { x: 40, y: 120, z: -700 }),
    "preview-mountains.png"
  );
  void world;
}
