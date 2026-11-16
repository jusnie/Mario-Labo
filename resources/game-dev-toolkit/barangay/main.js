/**
 * main.js — bootstrap, first-person controller, interactions and HUD.
 *
 * Player movement and collision use Rapier's KinematicCharacterController over
 * a capsule, so walls, the bench, the store and the hall are solid. Rapier was
 * installed but unintegrated in the previous build; this is the first pass that
 * actually uses it.
 */
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

import { buildWorld, LAYOUT } from "./world.js";
import { buildPhysics, stepPlayer } from "./physics.js";
import { surfaceAt } from "./surfaces.js";
import { createStore, createErniesHouse, buildStreetFurniture } from "./places.js";
import { CharacterLibrary } from "./characters.js";
import { AudioEngine } from "./sound.js";
import { PRODUCTS, Wallet } from "./shop.js";
import { LINES, TINDERA_NAME, timeGreeting } from "./tindera-lines.js";

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ state */
const app = {
  ready: false,
  focused: null, // "store" while talking to the tindera
  sitting: false,
  flashlightOn: false,
  yaw: Math.PI, // facing -Z, down the road toward the hall
  pitch: 0,
  velocityY: 0,
  grounded: true,
  money: new Wallet(),
  stepDistance: 0,
  footToggle: 0,
  focusAnim: null,
  nearest: null,
};

const EYE = 0.62; // above the capsule centre => ~1.32m eye height

/* ------------------------------------------------------------------- boot */
async function boot() {
  const loadingText = $("loadingText");
  const loadingBar = $("loadingBarFill");
  const progress = (pct, text) => {
    loadingBar.style.width = `${pct}%`;
    if (text) loadingText.textContent = text;
  };

  progress(6, "Sinisimulan ang physics…");
  await RAPIER.init();

  /* renderer + scene */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 1400);
  scene.add(camera);

  /* flashlight */
  const flashlight = new THREE.SpotLight(0xfff2d6, 0, 42, 0.44, 0.45, 1.4);
  flashlight.position.set(0, 0, 0);
  const flashlightTarget = new THREE.Object3D();
  flashlightTarget.position.set(0, 0, -1);
  camera.add(flashlight, flashlightTarget);
  flashlight.target = flashlightTarget;

  const audio = new AudioEngine();
  audio.onCaption(showCaption);

  progress(18, "Nilo-load ang mga character (CC0)…");
  const characters = new CharacterLibrary();
  await characters.preload();

  progress(42, "Itinatayo ang Barangay Kabudoy…");
  const world3d = buildWorld(scene, { startHour: 17.5 });
  const street = buildStreetFurniture(scene, world3d.colliders);

  progress(64, "Nilalagay ang sari-sari store at bahay…");
  const store = await createStore(scene, world3d.colliders, characters);
  const house = createErniesHouse(scene, world3d.colliders);

  progress(80, "Binubuo ang physics world…");
  const physics = buildPhysics(world3d.colliders);

  progress(92, "Handa na…");
  app.ready = true;
  progress(100, "Pindutin ang Pumasok");
  $("enter").disabled = false;

  /* ------------------------------------------------------------- controls */
  const canvas = renderer.domElement;
  const promptEl = $("prompt");
  const promptText = $("promptText");
  const crosshair = $("crosshair");

  const interactables = [
    {
      id: "store",
      position: new THREE.Vector3(store.focusWorld.x, 0, store.focusWorld.z),
      radius: 3.4,
      label: `Kausapin si ${TINDERA_NAME}`,
      action: () => openStore(),
    },
    {
      id: "bench",
      position: new THREE.Vector3(store.seatWorld.x, 0, store.seatWorld.z),
      radius: 1.9,
      label: "Umupo sa upuan",
      action: () => toggleSit(),
    },
    {
      id: "radio",
      position: new THREE.Vector3(house.windowAnchor.x, 0, house.windowAnchor.z),
      radius: 2.6,
      label: "Buksan ang radyo",
      action: () => {
        audio.radioToggle();
        showSubtitle(LINES.radioOn);
      },
    },
    {
      id: "hall",
      position: new THREE.Vector3(0, 0, LAYOUT.hallZ + LAYOUT.hallDepth / 2 + 2.2),
      radius: 5.0,
      label: "Tingnan ang bulwagan",
      action: () => showSubtitle(LINES.hallLocked),
    },
  ];

  /* --------------------------------------------------------------- input */
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === "f") toggleFlashlight();
    if (k === "e") interact();
    if (k === "escape") {
      if (app.focused) closeStore();
      else if (app.sitting) toggleSit();
    }
    if (k === "g") jumpToHall();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  // Pointer lock is not always available (embedded previews, some iframes), so
  // dragging the canvas also turns the head. Both paths feed the same yaw/pitch.
  const drag = { active: false, x: 0, y: 0 };
  canvas.addEventListener("click", () => {
    if (!app.ready || app.focused) return;
    if (document.pointerLockElement === canvas) return;
    try {
      const request = canvas.requestPointerLock?.();
      request?.catch?.(() => {});
    } catch {
      /* iframe refused the lock: dragging still works */
    }
  });

  canvas.addEventListener("mousedown", (e) => {
    if (document.pointerLockElement === canvas) return;
    drag.active = true;
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  window.addEventListener("mouseup", () => {
    drag.active = false;
  });

  document.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement === canvas) {
      app.yaw -= e.movementX * 0.0022;
      app.pitch = THREE.MathUtils.clamp(app.pitch - e.movementY * 0.0022, -1.3, 1.3);
      return;
    }
    if (!drag.active || app.focused) return;
    app.yaw -= (e.clientX - drag.x) * 0.0034;
    app.pitch = THREE.MathUtils.clamp(app.pitch - (e.clientY - drag.y) * 0.0034, -1.3, 1.3);
    drag.x = e.clientX;
    drag.y = e.clientY;
  });

  /* touch look + joystick */
  let touchLook = null;
  canvas.addEventListener(
    "touchstart",
    (e) => {
      for (const t of e.changedTouches) touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      for (const t of e.changedTouches) {
        if (touchLook && t.identifier === touchLook.id) {
          app.yaw -= (t.clientX - touchLook.x) * 0.005;
          app.pitch = THREE.MathUtils.clamp(app.pitch - (t.clientY - touchLook.y) * 0.005, -1.2, 1.2);
          touchLook.x = t.clientX;
          touchLook.y = t.clientY;
        }
      }
    },
    { passive: true }
  );

  const joystick = $("joystick");
  const knob = $("joystickKnob");
  const touchMove = { x: 0, y: 0, id: null };
  const joyRadius = 44;
  const joyStart = (e) => {
    const t = e.changedTouches[0];
    touchMove.id = t.identifier;
  };
  const joyMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchMove.id) continue;
      const rect = joystick.getBoundingClientRect();
      const dx = t.clientX - (rect.left + rect.width / 2);
      const dy = t.clientY - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(len, joyRadius);
      touchMove.x = (dx / len) * (clamped / joyRadius);
      touchMove.y = (dy / len) * (clamped / joyRadius);
      knob.style.transform = `translate(${(dx / len) * clamped}px, ${(dy / len) * clamped}px)`;
    }
  };
  const joyEnd = () => {
    touchMove.x = 0;
    touchMove.y = 0;
    touchMove.id = null;
    knob.style.transform = "";
  };
  joystick.addEventListener("touchstart", joyStart, { passive: true });
  joystick.addEventListener("touchmove", joyMove, { passive: true });
  joystick.addEventListener("touchend", joyEnd);
  joystick.addEventListener("touchcancel", joyEnd);
  $("flashBtn").addEventListener("click", toggleFlashlight);

  /* --------------------------------------------------------------- UI bits */
  const clockTime = $("clockTime");
  const clockPhase = $("clockPhase");
  const distanceEl = $("distance");
  const locationEl = $("location");

  $("dayBtn").addEventListener("click", () => setHour(8));
  $("nightBtn").addEventListener("click", () => {
    setHour(0);
    audio.dogHowl(1);
  });
  $("setTime").addEventListener("change", (e) => {
    const [h, m] = e.target.value.split(":").map(Number);
    if (!Number.isNaN(h)) world3d.clock.set(h + (m || 0) / 60);
  });

  world3d.clock.onHour((hour) => {
    if (hour === 0) audio.dogHowl(1);
    if (hour === 5) audio.rooster();
  });

  function setHour(h) {
    world3d.clock.set(h);
    $("setTime").value = `${String(Math.floor(h)).padStart(2, "0")}:00`;
  }

  /* ------------------------------------------------------------- subtitle */
  let subtitleTimer = null;
  function showSubtitle(line, ms = 5200) {
    $("subtitleFil").textContent = line.fil;
    $("subtitleEn").textContent = line.en ?? "";
    $("subtitle").classList.add("on");
    clearTimeout(subtitleTimer);
    subtitleTimer = setTimeout(() => $("subtitle").classList.remove("on"), ms);
  }
  app.showSubtitle = showSubtitle;

  let captionTimer = null;
  function showCaption(text) {
    const el = $("soundCaption");
    el.textContent = `♪ ${text}`;
    el.classList.add("on");
    clearTimeout(captionTimer);
    captionTimer = setTimeout(() => el.classList.remove("on"), 3600);
  }

  /* ---------------------------------------------------------------- shop */
  const shopEl = $("shop");
  const shopList = $("shopList");
  const shopLine = $("shopLine");
  const balanceEl = $("balance");
  const bagEl = $("bag");

  function renderShop(line) {
    balanceEl.textContent = `₱${app.money.money}`;
    const bagCount = [...app.money.bag.values()].reduce((a, b) => a + b, 0);
    bagEl.textContent = bagCount ? `Bag: ${bagCount} item${bagCount > 1 ? "s" : ""}` : "Bag: walang laman";
    if (line) {
      shopLine.innerHTML = `${line.fil}<span class="en">${line.en ?? ""}</span>`;
    }
    shopList.replaceChildren(
      ...PRODUCTS.map((p) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "product";
        btn.disabled = !app.money.canAfford(p.price);
        btn.innerHTML = `<span class="nm">${p.name}<span class="unit">${p.unit} · ${p.note}</span></span><span class="price">₱${p.price}</span>`;
        btn.addEventListener("click", () => buy(p));
        return btn;
      })
    );
  }

  function buy(product) {
    const result = app.money.buy(product);
    if (!result.ok) {
      renderShop(LINES.noCredit);
      audio.caption(LINES.noCredit.fil);
      return;
    }
    renderShop({ fil: `${LINES.bought.fil} — ${product.name}, ₱${product.price}.`, en: LINES.bought.en });
    audio.caption(`Binili: ${product.name}`);
  }

  function openStore() {
    if (app.sitting) toggleSit();
    app.focused = "store";
    document.exitPointerLock?.();
    const greeting = timeGreeting(world3d.clock.hours);
    renderShop({ fil: `${greeting.fil} ${LINES.shopOpen.fil}`, en: `${greeting.en} ${LINES.shopOpen.en}` });
    shopEl.classList.add("on");
    promptEl.classList.remove("on");
    startFocus(store.focusWorld, store.lookTarget, true);
    audio.doorCreak();
  }

  function closeStore() {
    if (!app.focused) return;
    app.focused = null;
    shopEl.classList.remove("on");
    showSubtitle(LINES.closeShop, 3000);
    endFocus();
  }

  $("shopClose").addEventListener("click", closeStore);

  /* ------------------------------------------------------------- camera focus */
  function startFocus(targetPos, lookTarget, showPanel) {
    app.focusAnim = {
      phase: "in",
      t: 0,
      fromPos: camera.position.clone(),
      fromQuat: camera.quaternion.clone(),
      toPos: targetPos.clone(),
      toQuat: lookQuaternion(targetPos, lookTarget),
      showPanel,
      savedPos: camera.position.clone(),
      savedQuat: camera.quaternion.clone(),
    };
  }
  function endFocus() {
    app.focusAnim = {
      phase: "out",
      t: 0,
      fromPos: camera.position.clone(),
      fromQuat: camera.quaternion.clone(),
      toPos: app.focusAnim?.savedPos ?? camera.position.clone(),
      toQuat: app.focusAnim?.savedQuat ?? camera.quaternion.clone(),
    };
  }
  function lookQuaternion(eye, target) {
    const m = new THREE.Matrix4().lookAt(eye, target, new THREE.Vector3(0, 1, 0));
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }

  /* ---------------------------------------------------------------- actions */
  function toggleFlashlight() {
    app.flashlightOn = !app.flashlightOn;
    flashlight.intensity = app.flashlightOn ? 26 : 0;
    audio.caption(app.flashlightOn ? "Flashlight: bukas" : "Flashlight: patay");
    $("flashBtn").style.background = app.flashlightOn ? "rgba(216,169,74,0.3)" : "";
  }

  function toggleSit() {
    if (app.sitting) {
      app.sitting = false;
      app.focusAnim = null;
      audio.caption("Tumayo ka");
      return;
    }
    app.sitting = true;
    const seatPos = store.seatWorld.clone();
    const eyePos = new THREE.Vector3(seatPos.x, 1.52, seatPos.z);
    // look across the road
    const lookAt = new THREE.Vector3(seatPos.x - 6, 1.3, seatPos.z + 1.5);
    app.focusAnim = {
      phase: "in",
      t: 0,
      fromPos: camera.position.clone(),
      fromQuat: camera.quaternion.clone(),
      toPos: eyePos,
      toQuat: lookQuaternion(eyePos, lookAt),
      savedPos: camera.position.clone(),
      savedQuat: camera.quaternion.clone(),
    };
    showSubtitle(LINES.benchSit, 4000);
  }

  function interact() {
    if (app.focused) {
      closeStore();
      return;
    }
    if (app.sitting) {
      toggleSit();
      return;
    }
    if (app.nearest) app.nearest.action();
  }

  function jumpToHall() {
    const p = physics.body.translation();
    physics.body.setTranslation({ x: 0, y: 1.0, z: LAYOUT.hallZ + 16 }, true);
    app.velocityY = 0;
    showCaption("Dev jump: harap ng bulwagan");
  }

  /* ------------------------------------------------------------- main loop */
  const clock = new THREE.Clock();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    const frozen = app.focused === "store";
    const canMove = !frozen && !app.sitting;

    // --- movement intent
    let ix = 0;
    let iz = 0;
    if (canMove) {
      if (keys.has("w") || keys.has("arrowup")) iz -= 1;
      if (keys.has("s") || keys.has("arrowdown")) iz += 1;
      if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
      if (keys.has("d") || keys.has("arrowright")) ix += 1;
      ix += touchMove.x;
      iz += touchMove.y;
    }
    const running = keys.has("shift");
    const speed = running ? 4.7 : 2.55;

    forward.set(-Math.sin(app.yaw), 0, -Math.cos(app.yaw));
    right.set(Math.cos(app.yaw), 0, -Math.sin(app.yaw));
    wish.set(0, 0, 0).addScaledVector(right, ix).addScaledVector(forward, -iz);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);

    // --- gravity + capsule movement (shared with walkthrough-test.mjs)
    app.velocityY = Math.max(app.velocityY - 22 * dt, -55);
    const step = stepPlayer(physics, wish.x, wish.z, app.velocityY, dt);
    const airborne = !app.grounded;
    const impact = app.velocityY;
    app.grounded = step.grounded;
    const pos = step.position;
    if (app.grounded && app.velocityY < 0) {
      if (airborne && impact < -5) {
        audio.landing(Math.min(1.6, Math.abs(impact) / 11), surfaceAt(pos.x, pos.z));
      }
      app.velocityY = -2;
    }

    // --- footsteps: stride length depends on gait, feet alternate, and the
    //     surface underfoot changes the sound
    if (canMove && app.grounded && step.moved > 0.0005) {
      const stride = running ? 1.32 : 0.74;
      app.stepDistance += step.moved;
      if (app.stepDistance >= stride) {
        app.stepDistance = 0;
        audio.footstep(surfaceAt(pos.x, pos.z), { running, foot: app.footToggle ^= 1 });
      }
    } else if (!canMove || !app.grounded) {
      app.stepDistance = Math.min(app.stepDistance, 0.4);
    }

    // --- camera
    if (app.focusAnim) {
      const f = app.focusAnim;
      f.t = Math.min(1, f.t + dt / 0.45);
      const e = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2;
      camera.position.lerpVectors(f.fromPos, f.toPos, e);
      camera.quaternion.slerpQuaternions(f.fromQuat, f.toQuat, e);
      if (f.t >= 1) {
        if (f.phase === "out") app.focusAnim = null;
      }
    } else if (!app.sitting) {
      const bob = canMove && wish.lengthSq() > 0.5 && app.grounded ? Math.sin(performance.now() / 145) * 0.022 : 0;
      camera.position.set(pos.x, pos.y + EYE + bob, pos.z);
      camera.quaternion.setFromEuler(new THREE.Euler(app.pitch, app.yaw, 0, "YXZ"));
    }

    // --- world + characters
    world3d.update(dt, camera.position);
    store.update(dt);
    audio.setNight(1 - world3d.clock.daylight);
    audio.setDaylight(world3d.clock.daylight);
    audio.setBirds(world3d.clock.daylight > 0.55);
    house.bulbMat.emissiveIntensity = (1 - world3d.clock.daylight) * 1.5;
    for (const mat of street.lampMats) mat.emissiveIntensity = (1 - world3d.clock.daylight) * 1.6;
    house.porchLight.intensity = (1 - world3d.clock.daylight) * 7;

    // --- HUD
    clockTime.textContent = world3d.clock.format();
    const dl = world3d.clock.daylight;
    clockPhase.textContent = dl > 0.75 ? "Araw" : dl > 0.15 ? "Dapit-hapon" : "Gabi";
    if (document.activeElement !== $("setTime")) $("setTime").value = world3d.clock.format();
    const distToHall = Math.max(
      0,
      Math.round(Math.hypot(pos.x, pos.z - (LAYOUT.hallZ + LAYOUT.hallDepth / 2)))
    );
    distanceEl.textContent = `Bulwagan: ${distToHall} m${pos.z < -200 ? " · malapit na" : ""}`;
    locationEl.innerHTML =
      pos.z > -40
        ? "<b>Barangay Kabudoy</b> — kalsada"
        : pos.z > -240
          ? "<b>Sagingan</b> — daan patungong bulwagan"
          : "<b>Bulwagan ng Barangay</b> — bakuran";

    // --- interaction prompt
    let nearest = null;
    let best = Infinity;
    for (const item of interactables) {
      const d = Math.hypot(pos.x - item.position.x, pos.z - item.position.z);
      if (d < item.radius && d < best) {
        best = d;
        nearest = item;
      }
    }
    app.nearest = nearest;
    if (nearest && !app.focused && !app.sitting && !app.focusAnim) {
      promptText.textContent = nearest.label;
      promptEl.classList.add("on");
      crosshair.classList.add("active");
    } else {
      promptEl.classList.remove("on");
      crosshair.classList.remove("active");
    }

    renderer.render(scene, camera);
  }

  animate();

  /* ------------------------------------------------------------- start gate */
  $("enter").addEventListener("click", async () => {
    await audio.start();
    $("loading").classList.add("hidden");
    showCaption("Tunog: bukas");
    canvas.requestPointerLock?.();
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  app.camera = camera;
  app.scene = scene;
  app.physics = physics;
  app.world3d = world3d;
  app.store = store;
}

boot().catch((err) => {
  console.error(err);
  const el = document.getElementById("loadingText");
  if (el) {
    el.textContent = "May error sa pag-load — tingnan ang console.";
    el.style.color = "#d86a6a";
  }
  const bar = document.getElementById("loadingBarFill");
  if (bar) bar.style.background = "#8f2b2b";
});
