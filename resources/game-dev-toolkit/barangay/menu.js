/**
 * menu.js — the game's front end: home, settings, about.
 *
 * The game used to open straight into the village behind a loading bar. This is
 * the screen in front of it: a title, three doors, and a settings panel that
 * actually changes things (look speed, volume, subtitles, time of day).
 *
 * It is deliberately DOM-only and dependency-free, and everything it touches is
 * reachable through `getElementById`, so `menu-test.mjs` can drive the whole
 * thing against a stub document with no browser in sight.
 *
 * Settings survive a reload in localStorage, and are clamped on the way in:
 * a corrupt or hand-edited entry must never leave the look speed at 0.01.
 */

export const SETTINGS_KEY = "maria-labo:settings";

export const DEFAULT_SETTINGS = Object.freeze({
  sensitivity: 1, // multiplier on the base look speed
  volume: 0.85,
  subtitles: true,
});

const SENS_MIN = 0.4;
const SENS_MAX = 2.4;

export function clampSettings(input = {}) {
  const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  return {
    sensitivity: Math.min(SENS_MAX, Math.max(SENS_MIN, num(input.sensitivity, DEFAULT_SETTINGS.sensitivity))),
    volume: Math.min(1, Math.max(0, num(input.volume, DEFAULT_SETTINGS.volume))),
    subtitles: input.subtitles !== false,
  };
}

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // private mode / blocked storage: settings just do not persist
    return null;
  }
}

export function loadSettings(storage) {
  const store = resolveStorage(storage);
  if (!store) return { ...DEFAULT_SETTINGS };
  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return clampSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, storage) {
  const store = resolveStorage(storage);
  if (!store) return false;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(clampSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {object} opts
 * @param {Document} [opts.doc]
 * @param {object} [opts.settings]  loaded settings; mutated in place
 * @param {object} [opts.storage]   localStorage-compatible; false disables saving
 * @param {(open:boolean, mode:string)=>void} [opts.onOpenChange]
 * @param {()=>void} [opts.onPlay]  play / resume
 * @param {()=>void} [opts.onQuit]  back to the start
 * @param {(settings:object)=>void} [opts.onChange]
 * @param {(hour:number)=>void} [opts.onTime]
 */
export function createMenu({
  doc = globalThis.document,
  settings = loadSettings(),
  storage,
  onOpenChange = () => {},
  onPlay = () => {},
  onQuit = () => {},
  onChange = () => {},
  onTime = () => {},
} = {}) {
  const el = (id) => doc.getElementById(id);
  const root = el("menu");
  if (!root) throw new Error("menu.js: #menu is missing from the page");
  const screens = { home: el("menuHome"), settings: el("menuSettings"), about: el("menuAbout") };
  const playLabel = el("playLabel");
  const playLabelEn = el("playLabelEn");
  const quitButton = el("menuQuit");
  const inputs = {
    sensitivity: el("setSensitivity"),
    volume: el("setVolume"),
    subtitles: el("setSubtitles"),
  };

  const state = { open: false, mode: "home", screen: "home" };

  const screenKeys = Object.keys(screens).filter((k) => screens[k]);
  const visibleButtons = () => {
    const panel = screens[state.screen];
    if (!panel) return [];
    return Array.from(panel.querySelectorAll("button")).filter((b) => !b.disabled && b.hidden !== true);
  };

  /** Push `settings` into the controls; used on open and after a load. */
  function syncControls() {
    if (inputs.sensitivity) inputs.sensitivity.value = String(settings.sensitivity);
    if (inputs.volume) inputs.volume.value = String(settings.volume);
    if (inputs.subtitles) inputs.subtitles.checked = !!settings.subtitles;
  }

  function applyScreen() {
    for (const key of screenKeys) {
      const panel = screens[key];
      const on = key === state.screen;
      panel.classList.toggle("on", on);
      panel.setAttribute("aria-hidden", on ? "false" : "true");
    }
    root.dataset.screen = state.screen;
    // the first thing on the panel gets focus, so Enter always does something
    const first = visibleButtons()[0];
    if (state.open && first && typeof first.focus === "function") first.focus();
  }

  function applyMode() {
    root.dataset.mode = state.mode;
    const paused = state.mode === "pause";
    if (playLabel) playLabel.textContent = paused ? "Ituloy" : "Laro";
    if (playLabelEn) playLabelEn.textContent = paused ? "Resume" : "Play";
    if (quitButton) {
      quitButton.hidden = !paused;
      quitButton.style.display = paused ? "" : "none";
    }
  }

  function open(mode = "home") {
    state.open = true;
    state.mode = mode === "pause" ? "pause" : "home";
    state.screen = "home";
    syncControls();
    applyMode();
    applyScreen();
    root.classList.add("on");
    root.setAttribute("aria-hidden", "false");
    if (doc.body?.classList) doc.body.classList.add("menu-open");
    onOpenChange(true, state.mode);
  }

  function close(reason = "close") {
    if (!state.open) return;
    state.open = false;
    root.classList.remove("on");
    root.setAttribute("aria-hidden", "true");
    if (doc.body?.classList) doc.body.classList.remove("menu-open");
    onOpenChange(false, reason);
  }

  function show(screen) {
    if (!screens[screen]) return;
    state.screen = screen;
    applyScreen();
  }

  function play() {
    close("play");
    onPlay(state.mode);
  }

  function quit() {
    close("quit");
    onQuit();
  }

  /* ------------------------------------------------------------- wiring */
  const clickHandlers = {
    play,
    settings: () => show("settings"),
    about: () => show("about"),
    back: () => show("home"),
    quit,
  };
  for (const key of Object.keys(clickHandlers)) {
    for (const button of Array.from(doc.querySelectorAll(`[data-menu="${key}"]`))) {
      button.addEventListener("click", (event) => {
        event?.preventDefault?.();
        clickHandlers[key]();
      });
    }
  }
  for (const button of Array.from(doc.querySelectorAll("[data-time]"))) {
    button.addEventListener("click", () => {
      const hour = Number(button.getAttribute("data-time"));
      if (Number.isFinite(hour)) onTime(hour);
    });
  }

  /** Any control that writes a setting funnels through here. */
  function changed(patch) {
    Object.assign(settings, clampSettings({ ...settings, ...patch }));
    syncControls();
    saveSettings(settings, storage);
    onChange(settings);
  }

  if (inputs.sensitivity) {
    inputs.sensitivity.addEventListener("input", (e) => changed({ sensitivity: e.target.value }));
  }
  if (inputs.volume) {
    inputs.volume.addEventListener("input", (e) => changed({ volume: e.target.value }));
  }
  if (inputs.subtitles) {
    inputs.subtitles.addEventListener("change", (e) => changed({ subtitles: !!e.target.checked }));
  }

  /* ----------------------------------------------------------- keyboard */
  function keydown(e) {
    if (!state.open) return;
    const key = (e.key ?? "").toLowerCase();
    if (key === "escape") {
      e.preventDefault?.();
      if (state.screen !== "home") show("home");
      else if (state.mode === "pause") play();
      return;
    }
    if (key === "arrowdown" || key === "arrowup") {
      const buttons = visibleButtons();
      if (!buttons.length) return;
      e.preventDefault?.();
      const current = buttons.indexOf(doc.activeElement);
      const step = key === "arrowdown" ? 1 : -1;
      const next = buttons[(current + step + buttons.length) % buttons.length];
      next?.focus?.();
    }
  }
  doc.addEventListener("keydown", keydown);

  return {
    open,
    close,
    show,
    play,
    quit,
    get isOpen() {
      return state.open;
    },
    get mode() {
      return state.mode;
    },
    get screen() {
      return state.screen;
    },
    settings,
    destroy() {
      doc.removeEventListener?.("keydown", keydown);
    },
  };
}
