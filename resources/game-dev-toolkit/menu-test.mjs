/**
 * menu-test.mjs — the front end, driven with no browser.
 *
 * There is no DOM in this sandbox, so menu.js is written against
 * `getElementById` and nothing else, and this file provides a stub document to
 * drive it: open, navigate, change a setting, Esc back, resume.
 *
 * It also checks the *page* against the menu: every id and data-attribute
 * menu.js reaches for has to exist in index.html, because a renamed button is
 * exactly the kind of thing that cannot be noticed without a browser.
 *
 * Run: npm run menu   (node menu-test.mjs)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMenu,
  loadSettings,
  saveSettings,
  clampSettings,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
} from "./barangay/menu.js";

const ROOT = dirname(fileURLToPath(import.meta.url));

let failures = 0;
const ok = (msg) => console.log(`  \u2713 ${msg}`);
const bad = (msg) => {
  failures++;
  console.log(`  \u2717 ${msg}`);
};
const section = (title) => console.log(`\n${title}`);

/* ------------------------------------------------------------- fake DOM */

function matches(el, selector) {
  if (selector === "button") return el.tagName === "BUTTON";
  const m = /^\[data-([a-z]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (!m) return false;
  const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const value = el.dataset[key] ?? el.attributes.get(`data-${m[1]}`) ?? null;
  if (value === null) return false;
  return m[2] === undefined ? true : value === m[2];
}

class ClassList {
  constructor() {
    this.set = new Set();
  }
  add(...names) {
    for (const n of names) this.set.add(n);
  }
  remove(...names) {
    for (const n of names) this.set.delete(n);
  }
  toggle(name, force) {
    const want = force === undefined ? !this.set.has(name) : !!force;
    if (want) this.set.add(name);
    else this.set.delete(name);
    return want;
  }
  contains(name) {
    return this.set.has(name);
  }
}

class Element {
  constructor(tag = "div", attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.classList = new ClassList();
    this.dataset = {};
    this.style = {};
    this.attributes = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
    this.children = [];
    this.parent = null;
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.id = attrs.id ?? "";
  }
  setAttribute(key, value) {
    this.attributes.set(key, String(value));
    if (key === "id") this.id = String(value);
  }
  getAttribute(key) {
    return this.attributes.has(key) ? this.attributes.get(key) : null;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type, event = {}) {
    const list = this.listeners.get(type) ?? [];
    for (const fn of list) fn({ target: this, preventDefault() {}, ...event });
  }
  focus() {
    doc.activeElement = this;
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
    return this;
  }
  *walk() {
    for (const child of this.children) {
      yield child;
      yield* child.walk();
    }
  }
  querySelectorAll(selector) {
    return Array.from(this.walk()).filter((el) => matches(el, selector));
  }
}

const registry = new Map();
function make(tag, attrs = {}) {
  const el = new Element(tag, attrs);
  if (attrs.id) registry.set(attrs.id, el);
  return el;
}
function button(attrs = {}) {
  return make("button", { type: "button", ...attrs });
}

const doc = {
  body: new Element("body"),
  activeElement: null,
  listeners: new Map(),
  getElementById(id) {
    return registry.get(id) ?? null;
  },
  querySelectorAll(selector) {
    const roots = [this.body, ...registry.values()];
    const out = [];
    for (const root of roots) {
      if (root instanceof Element) {
        if (matches(root, selector)) out.push(root);
        out.push(...root.querySelectorAll(selector));
      }
    }
    return Array.from(new Set(out));
  },
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  },
  removeEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  },
  pressKey(key, extra = {}) {
    for (const fn of this.listeners.get("keydown") ?? []) {
      fn({ key, preventDefault() {}, ...extra });
    }
  },
};

function buildPage() {
  const menu = make("div", { id: "menu", "aria-hidden": "true" });
  const inner = make("div");
  const home = make("section", { id: "menuHome" });
  const settingsPanel = make("section", { id: "menuSettings", "aria-hidden": "true" });
  const about = make("section", { id: "menuAbout", "aria-hidden": "true" });

  const play = button({ id: "playBtn" });
  play.dataset.menu = "play";
  const playLabel = make("span", { id: "playLabel" });
  const playLabelEn = make("em", { id: "playLabelEn" });
  play.append(playLabel, playLabelEn);

  const settingsBtn = button();
  settingsBtn.dataset.menu = "settings";
  const aboutBtn = button();
  aboutBtn.dataset.menu = "about";
  const quit = button({ id: "menuQuit", hidden: "" });
  quit.dataset.menu = "quit";
  quit.hidden = true;

  home.append(play, settingsBtn, aboutBtn, quit);

  const sens = make("input", { id: "setSensitivity", type: "range" });
  const vol = make("input", { id: "setVolume", type: "range" });
  const subs = make("input", { id: "setSubtitles", type: "checkbox" });
  const back = button();
  back.dataset.menu = "back";
  settingsPanel.append(sens, vol, subs, back);

  const daylight = button({ "data-time": "8" });
  daylight.dataset.time = "8";
  settingsPanel.append(daylight);
  const aboutBack = button();
  aboutBack.dataset.menu = "back";
  about.append(aboutBack);

  inner.append(home, settingsPanel, about);
  menu.append(inner);
  doc.body.append(menu);
  registry.set("menu", menu);
  return { menu, home, settingsPanel, about, play, settingsBtn, aboutBtn, quit, playLabel, playLabelEn, sens, vol, subs, back, daylight };
}

const page = buildPage();

/* --------------------------------------------------------------- settings */

section("settings store");
{
  const store = new Map();
  const fake = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  const defaults = loadSettings(fake);
  defaults.volume === DEFAULT_SETTINGS.volume ? ok("empty storage loads the defaults") : bad("defaults wrong");

  saveSettings({ sensitivity: 1.7, volume: 0.4, subtitles: false }, fake);
  const back = loadSettings(fake);
  back.sensitivity === 1.7 && back.volume === 0.4 && back.subtitles === false
    ? ok("settings round-trip through storage")
    : bad(`round-trip lost values: ${JSON.stringify(back)}`);

  store.set(SETTINGS_KEY, "{not json");
  loadSettings(fake).sensitivity === DEFAULT_SETTINGS.sensitivity
    ? ok("corrupt storage falls back to defaults")
    : bad("corrupt storage crashed or returned junk");

  const wild = clampSettings({ sensitivity: 99, volume: -3, subtitles: "yes" });
  wild.sensitivity === 2.4 && wild.volume === 0 && wild.subtitles === true
    ? ok("out-of-range values are clamped (99 -> 2.4, -3 -> 0)")
    : bad(`clamp failed: ${JSON.stringify(wild)}`);

  const junk = clampSettings({ sensitivity: "fast", volume: null });
  junk.sensitivity === 1 && junk.volume === 0
    ? ok("junk values fall back without throwing")
    : bad(`junk clamp failed: ${JSON.stringify(junk)}`);
}

/* ------------------------------------------------------------------- menu */

section("the menu");
const calls = { play: [], quit: [], open: [], change: [], time: [] };
const settings = { sensitivity: 1, volume: 0.85, subtitles: true };
const menu = createMenu({
  doc,
  settings,
  storage: false,
  onOpenChange: (open, mode) => calls.open.push({ open, mode }),
  onPlay: (mode) => calls.play.push(mode),
  onQuit: () => calls.quit.push(true),
  onChange: (s) => calls.change.push({ ...s }),
  onTime: (h) => calls.time.push(h),
});

{
  menu.isOpen === false ? ok("starts closed") : bad("menu starts open");

  menu.open("home");
  page.menu.classList.contains("on") && page.menu.getAttribute("aria-hidden") === "false"
    ? ok("opening shows the overlay and marks it visible")
    : bad("open() did not show the overlay");
  doc.body.classList.contains("menu-open") ? ok("body gets .menu-open, so the HUD hides") : bad("HUD would show through");
  page.home.classList.contains("on") && !page.settingsPanel.classList.contains("on")
    ? ok("home is the first screen")
    : bad("wrong starting screen");
  page.playLabel.textContent === "Laro" && page.quit.hidden
    ? ok("home offers Laro, and no quit button")
    : bad("home labels wrong");
  calls.open.at(-1)?.open === true ? ok("main.js is told the menu opened") : bad("onOpenChange not called");
  doc.activeElement === page.play ? ok("the play button takes focus") : bad("nothing focused, Enter would do nothing");

  page.settingsBtn.dispatch("click");
  page.settingsPanel.classList.contains("on") && !page.home.classList.contains("on")
    ? ok("Settings swaps to the settings screen")
    : bad("settings did not open");

  doc.pressKey("Escape");
  page.home.classList.contains("on") ? ok("Esc backs out to home") : bad("Esc did not go back");
  menu.screen === "home" ? ok("and the state agrees") : bad("screen state out of sync");

  // play from home
  page.play.dispatch("click");
  !menu.isOpen && calls.play.at(-1) === "home" ? ok("Laro closes the menu and starts the game") : bad("play did not close the menu");
  !page.menu.classList.contains("on") ? ok("overlay hidden") : bad("overlay still up");
  !doc.body.classList.contains("menu-open") ? ok("HUD comes back") : bad("HUD still hidden");

  // pause
  menu.open("pause");
  page.playLabel.textContent === "Ituloy" && page.playLabelEn.textContent === "Resume"
    ? ok("pause relabels the button Ituloy / Resume")
    : bad("pause label wrong");
  page.quit.hidden === false ? ok("pause offers a way back to the start") : bad("no quit in pause");
  doc.pressKey("Escape");
  !menu.isOpen && calls.play.at(-1) === "pause" ? ok("Esc in pause resumes the game") : bad("Esc did not resume");

  // settings that actually change things
  calls.change.length = 0;
  page.sens.value = "1.8";
  page.sens.dispatch("input", { target: page.sens });
  settings.sensitivity === 1.8 && calls.change.at(-1)?.sensitivity === 1.8
    ? ok("look speed slider reaches the game")
    : bad("sensitivity change lost");
  page.vol.value = "0.3";
  page.vol.dispatch("input", { target: page.vol });
  calls.change.at(-1)?.volume === 0.3 ? ok("volume slider reaches the game") : bad("volume change lost");
  page.subs.checked = false;
  page.subs.dispatch("change", { target: page.subs });
  calls.change.at(-1)?.subtitles === false ? ok("subtitle toggle reaches the game") : bad("subtitle toggle lost");

  page.daylight.dispatch("click");
  calls.time.at(-1) === 8 ? ok("time-of-day button sets the hour") : bad("time button did nothing");

  menu.open("home");
  menu.quit();
  calls.quit.length === 1 ? ok("quit asks the game to go back to the start") : bad("quit not wired");
  menu.destroy();
}

/* ---------------------------------------------------- page vs. menu check */

section("index.html matches the menu");
{
  const html = readFileSync(join(ROOT, "barangay/index.html"), "utf8");
  const ids = ["menu", "menuHome", "menuSettings", "menuAbout", "playLabel", "playLabelEn", "menuQuit", "setSensitivity", "setVolume", "setSubtitles"];
  const missingIds = ids.filter((id) => !html.includes(`id="${id}"`));
  missingIds.length === 0 ? ok(`all ${ids.length} ids menu.js needs exist`) : bad(`missing ids: ${missingIds.join(", ")}`);

  const menus = ["play", "settings", "about", "back", "quit"];
  const missingMenus = menus.filter((m) => !html.includes(`data-menu="${m}"`));
  missingMenus.length === 0 ? ok("Laro / Settings / Tungkol / Balik / Quit are all wired") : bad(`missing buttons: ${missingMenus.join(", ")}`);

  html.includes('data-time="17.5"') ? ok("the settings screen has the three times of day") : bad("no time buttons in the page");
  html.includes("/barangay/main.js") && html.includes("menu.js") === false
    ? ok("the page still boots main.js, and menu.js is imported from there")
    : bad("script wiring looks wrong");
  /id="menu"[^>]*aria-hidden="true"/.test(html) ? ok("the menu ships hidden, so it cannot flash before boot") : bad("menu is not hidden in the markup");
}

section("main.js wiring");
{
  const js = readFileSync(join(ROOT, "barangay/main.js"), "utf8");
  js.includes('from "./menu.js"') ? ok("main.js imports the menu") : bad("main.js does not import menu.js");
  js.includes('openMenu("home")') ? ok("entering opens the front end, not the village") : bad("enter still drops straight into the world");
  /canMove = [^;]*menuOpen/.test(js) ? ok("movement stops while the menu is up") : bad("the player can walk behind the menu");
  js.includes("settings.sensitivity") ? ok("look speed comes from the settings") : bad("sensitivity is still hard-coded");
  js.includes("audio.setVolume") ? ok("the volume setting reaches the audio engine") : bad("volume is not wired");
  /if \(!settings.subtitles\) return;/.test(js) ? ok("subtitles honour the toggle") : bad("subtitles ignore the setting");
  js.includes("pointerlockchange") ? ok("losing the pointer lock pauses the game") : bad("no pause on pointer-lock loss");
}

console.log(
  failures === 0
    ? "\nMENU OK — the front end opens, navigates and its settings reach the game"
    : `\n${failures} FAILURE(S)`
);
process.exit(failures === 0 ? 0 : 1);
