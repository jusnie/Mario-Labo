/**
 * sound.js — recorded sound effects, with synthesis as a fallback.
 *
 * The footsteps, the landing, the chicken, the dog, the forest ambience and the
 * door come from real field recordings: the Oculus Audio Pack 1, redistributed
 * by Meta Open Sound (facebookincubator/Meta-open-sound), licensed CC BY 4.0.
 * They live in assets/audio/oculus/ and are re-fetched by
 * tools/fetch-oculus-audio.mjs; see assets/audio/oculus/MANIFEST.json and
 * CREDITS.md for the attribution that licence requires.
 *
 * What is still synthesised, and stays labelled as such: the radio in Ernie's
 * house, the grit layer mixed under the gravel road, and the whole fallback
 * path used before the samples finish loading (or if they fail).
 *
 * Two honest gaps in the pack:
 *   - there is no gravel recording, so the road is the concrete sample with a
 *     thin synthesised grit layer on top;
 *   - there is no rooster either. BIRDFowl_Chicken_OS_01 is a chicken, and the
 *     dawn call is played from it, pitched down a little and set back in the
 *     mix. It is not a tilaok, and the caption says "manok", not "tilaok".
 *
 * Browsers only allow audio after a gesture, so nothing is created until
 * start() is called from a click or key press; the samples are fetched and
 * decoded right after that.
 */

const AUDIO_DIR = new URL("../assets/audio/oculus/", import.meta.url);

const pad = (n) => String(n).padStart(2, "0");

/** Footstep families present in the pack, with how many takes each has. */
const FOOT_PACK = {
  Concrete: { walk: 5, run: 5, land: 2 },
  Dirt: { walk: 5, run: 5, land: 2 },
  Grass: { walk: 5, run: 5, land: 2 },
  Wood: { walk: 5, run: 5, land: 2 },
};

const footFile = (family, gait, n) => `FEETHmn_Shoe${family}${gait}_OS_${pad(n)}.ogg`;

/**
 * Which recording family each walkable surface uses.
 * "grit" adds a quiet synthesised crunch — the pack has no gravel, and the
 * barangay road is loose gravel over dirt, not a concrete slab.
 */
const SURFACE_SAMPLE = {
  gravel: { family: "Concrete", gain: 0.7, grit: 0.5, rate: 0.96 },
  dirt: { family: "Dirt", gain: 0.95, grit: 0.15, rate: 1 },
  grass: { family: "Grass", gain: 0.9, grit: 0, rate: 1 },
  wood: { family: "Wood", gain: 0.95, grit: 0, rate: 1 },
  concrete: { family: "Concrete", gain: 0.85, grit: 0, rate: 1 },
};

/** One-shots and loops, beyond the footsteps. */
const ONE_SHOTS = [
  "BIRDFowl_Chicken_OS_01.ogg",
  "ANMLDog_DogAttention_OS_01.ogg",
  "ANMLDog_DogBark_OS_01.ogg",
  "ANMLDog_DogBark_OS_02.ogg",
  "DOORWood_FrontDoorOpen_OS_01.ogg",
  "DOORWood_FrontDoorClose_OS_01.ogg",
  "AMBForst_ForestBirds_OS_01.ogg",
];

const LOOPS = ["AMBForst_Forest_LOOP_01.ogg", "AMBForst_Night_LOOP_01.ogg"];

/** Every sample the engine will try to fetch. De-duplicated, stable order. */
export const SAMPLE_FILES = [
  ...new Set([
    ...Object.entries(FOOT_PACK).flatMap(([family, takes]) => [
      ...Array.from({ length: takes.walk }, (_, i) => footFile(family, "Walk", i + 1)),
      ...Array.from({ length: takes.run }, (_, i) => footFile(family, "Run", i + 1)),
      ...Array.from({ length: takes.land }, (_, i) => footFile(family, "Land", i + 1)),
    ]),
    ...ONE_SHOTS,
    ...LOOPS,
  ]),
];

/**
 * Synthesis parameters, kept only as the fallback path (and for the gravel
 * grit layer). Values are unchanged from the previous all-synthesised build.
 */
export const SURFACES = {
  gravel: { thump: 96, thumpGain: 0.055, noiseFreq: 1850, noiseQ: 0.8, highpass: 420, crunch: 0.2, decay: 0.15 },
  dirt: { thump: 82, thumpGain: 0.05, noiseFreq: 950, noiseQ: 1.1, highpass: 260, crunch: 0.15, decay: 0.17 },
  grass: { thump: 58, thumpGain: 0.03, noiseFreq: 3100, noiseQ: 0.7, highpass: 1500, crunch: 0.1, decay: 0.2 },
  wood: { thump: 132, thumpGain: 0.06, noiseFreq: 620, noiseQ: 2.6, highpass: 180, crunch: 0.11, decay: 0.13 },
  concrete: { thump: 150, thumpGain: 0.05, noiseFreq: 2400, noiseQ: 1.4, highpass: 700, crunch: 0.12, decay: 0.1 },
};

const randomOf = (list) => list[Math.floor(Math.random() * list.length)];
const jitter = (amount = 0.06) => 1 + (Math.random() * 2 - 1) * amount;

/** decodeAudioData is promise-based everywhere current; wrap the old callback form. */
function decode(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const maybe = ctx.decodeAudioData(arrayBuffer, resolve, reject);
    if (maybe && typeof maybe.then === "function") maybe.then(resolve, reject);
  });
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.captionHandler = null;
    this.nightFactor = 0;
    this.daylight = 1;
    this.radioPlaying = false;
    this.lastStepAt = 0;
    this.buffers = {};
    this.sampleState = "idle"; // idle | loading | ready | failed
    this.sampleFailures = [];
    this.recordedAmbience = false;
    this.synthDuck = 1;
    this.volume = 0.85;
  }

  onCaption(fn) {
    this.captionHandler = fn;
  }

  /** Master volume, 0..1. Safe to call before start(): it is remembered. */
  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : this.volume));
    if (this.master) this.master.gain.value = this.volume;
    return this.volume;
  }

  caption(text) {
    this.captionHandler?.(text);
  }

  async start() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx;
    }
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) {
      console.warn("[sound] Web Audio unavailable");
      return null;
    }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise(2.5);
    this.buildSynthAmbience();
    await this.ctx.resume();
    // Kick the downloads off, but never make the first frame wait on them.
    this.loadSamples().then((ok) => {
      if (!ok) console.warn("[sound] samples unavailable, using synthesis", this.sampleFailures);
    });
    return this.ctx;
  }

  /**
   * Fetch + decode every recording. Resolves true if at least the footsteps are
   * usable. Individual misses are collected in sampleFailures rather than thrown,
   * so one bad file cannot silence the game.
   */
  async loadSamples() {
    if (this.sampleState === "loading") return false;
    if (this.sampleState === "ready") return true;
    if (!this.ctx) return false;
    this.sampleState = "loading";
    const ctx = this.ctx;
    const results = await Promise.all(
      SAMPLE_FILES.map(async (file) => {
        try {
          const res = await fetch(new URL(file, AUDIO_DIR));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return [file, await decode(ctx, await res.arrayBuffer()), null];
        } catch (err) {
          return [file, null, String(err && err.message ? err.message : err)];
        }
      })
    );
    this.buffers = {};
    this.sampleFailures = [];
    for (const [file, audio, error] of results) {
      if (audio) this.buffers[file] = audio;
      else this.sampleFailures.push({ file, error });
    }
    const loaded = Object.keys(this.buffers).length;
    this.sampleState = loaded ? "ready" : "failed";
    this.sampleCount = loaded;
    if (loaded) this.startRecordedAmbience();
    return this.sampleState === "ready";
  }

  /** True when recordings are decoded and usable. */
  get usingSamples() {
    return this.sampleState === "ready";
  }

  makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(1, len, rate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * white; // slightly pink
      data[i] = last * 3.2;
    }
    return buffer;
  }

  /** Fallback bed: filtered noise for wind and crickets. Always built, then ducked. */
  buildSynthAmbience() {
    const ctx = this.ctx;
    // --- crickets: band-passed noise, amplitude-modulated into chirps
    const cricketSrc = ctx.createBufferSource();
    cricketSrc.buffer = this.noiseBuffer;
    cricketSrc.loop = true;
    const cricketBand = ctx.createBiquadFilter();
    cricketBand.type = "bandpass";
    cricketBand.frequency.value = 4300;
    cricketBand.Q.value = 14;
    this.cricketGain = ctx.createGain();
    this.cricketGain.gain.value = 0;
    const chirp = ctx.createOscillator();
    chirp.type = "sine";
    chirp.frequency.value = 11;
    const chirpDepth = ctx.createGain();
    chirpDepth.gain.value = 0.5;
    chirp.connect(chirpDepth).connect(this.cricketGain.gain);
    cricketSrc.connect(cricketBand).connect(this.cricketGain).connect(this.master);
    cricketSrc.start();
    chirp.start();

    // --- wind: low-passed noise, very quiet bed
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;
    const windLp = ctx.createBiquadFilter();
    windLp.type = "lowpass";
    windLp.frequency.value = 320;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    windSrc.connect(windLp).connect(this.windGain).connect(this.master);
    windSrc.start();

    // slow LFO on the wind so it breathes
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(this.windGain.gain);
    lfo.start();
  }

  /** Loop one decoded buffer forever at a fixed gain of 0, ready to be faded in. */
  makeLoop(file, { delay = 0.4 } = {}) {
    const buffer = this.buffers[file];
    if (!buffer) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.master);
    const startAt = this.ctx.currentTime + delay;
    src.start(startAt, Math.random() * Math.max(0.5, buffer.duration * 0.6));
    return gain;
  }

  /**
   * Swap the synthesised bed for the two recorded ambiences: forest by day,
   * forest night after dark. The synth bed stays at a whisper underneath so the
   * wind still moves between the loop edits.
   */
  startRecordedAmbience() {
    if (this.recordedAmbience) return;
    this.dayAmbience = this.makeLoop("AMBForst_Forest_LOOP_01.ogg");
    this.nightAmbience = this.makeLoop("AMBForst_Night_LOOP_01.ogg", { delay: 0.9 });
    if (!this.dayAmbience && !this.nightAmbience) return;
    this.recordedAmbience = true;
    this.synthDuck = 0.08;
    if (this.forestRainGain) this.forestRainGain.gain.value = 0;
    this.applyAmbienceMix(2);
  }

  /** Crossfade day/night ambience (and the fallback bed) to match nightFactor. */
  applyAmbienceMix(seconds = 1.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + seconds;
    const f = Math.min(1, Math.max(0, this.nightFactor));
    const ramp = (param, value) => {
      param.cancelScheduledValues(this.ctx.currentTime);
      param.linearRampToValueAtTime(value, t);
    };
    if (this.cricketGain) ramp(this.cricketGain.gain, (0.02 + f * 0.16) * (1 - this.synthDuck));
    if (this.windGain) ramp(this.windGain.gain, 0.05 * this.synthDuck);
    const dayLevel = this.daylight > 0.2 ? 0.13 : 0.05;
    if (this.dayAmbience) ramp(this.dayAmbience.gain, (1 - f) * dayLevel);
    if (this.nightAmbience) ramp(this.nightAmbience.gain, f * 0.16);
  }

  setNight(factor) {
    this.nightFactor = factor;
    if (!this.ctx) return;
    this.applyAmbienceMix();
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.linearRampToValueAtTime(on ? 0.85 : 0, this.ctx.currentTime + 0.2);
    this.caption(on ? "Tunog: bukas" : "Tunog: patay (muted)");
  }

  /** A pan node when the browser has one, else the master bus. */
  panBus(foot = 0, width = 0.28) {
    if (!this.ctx.createStereoPanner) return this.master;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = foot ? width : -width;
    pan.connect(this.master);
    return pan;
  }

  /** Play one decoded one-shot through a small chain; returns false if missing. */
  playSample(file, { gain = 0.2, rate = 1, pan = 0, delay = 0, lowpass = 0, offset = 0 } = {}) {
    const buffer = this.buffers[file];
    if (!this.ctx || !buffer) return false;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const out = ctx.createGain();
    out.gain.value = gain;
    let node = src;
    if (lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = lowpass;
      node.connect(lp);
      node = lp;
    }
    node.connect(out);
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p).connect(this.master);
    } else {
      out.connect(this.master);
    }
    const startAt = ctx.currentTime + delay;
    src.start(startAt, Math.min(offset, Math.max(0, buffer.duration - 0.02)));
    return true;
  }

  /**
   * A footstep: the recorded shoe impact for the surface, with a little
   * variation in pitch and level so repeats do not machine-gun, panned to the
   * side of the foot that made it.
   */
  footstep(surface = "dirt", { running = false, foot = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    if (this.usingSamples && this.recordedFootstep(surface, running, foot)) return;
    this.synthFootstep(surface, { running, foot });
  }

  recordedFootstep(surface, running, foot) {
    const cfg = SURFACE_SAMPLE[surface] ?? SURFACE_SAMPLE.dirt;
    const takes = FOOT_PACK[cfg.family];
    if (!takes) return false;
    const gait = running ? "run" : "walk";
    const file = footFile(cfg.family, running ? "Run" : "Walk", 1 + Math.floor(Math.random() * takes[gait]));
    const buffer = this.buffers[file];
    if (!buffer) return false;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const rate = cfg.rate * jitter(0.05) * (running ? 1.04 : 1);
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    const level = cfg.gain * (running ? 0.5 : 0.34) * jitter(0.14);
    gain.gain.value = level;
    const pan = this.panBus(foot, 0.3);
    src.connect(gain).connect(pan);
    src.start(ctx.currentTime, Math.min(0.01, buffer.duration * 0.05), buffer.duration / rate + 0.05);
    if (cfg.grit) this.gritLayer(surface, pan, running);
    this.lastStepAt = ctx.currentTime;
    return true;
  }

  /** Loose-stone crunch mixed under the road's footstep. Synthesised on purpose. */
  gritLayer(surface, bus, running) {
    const cfg = SURFACES[surface] ?? SURFACES.gravel;
    const grit = SURFACE_SAMPLE[surface]?.grit ?? 0.4;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const [offset, weight] of [
      [0, 1],
      [0.045 + Math.random() * 0.03, 0.5],
    ]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.playbackRate.value = 0.9 + Math.random() * 0.35;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = cfg.noiseFreq * jitter(0.12);
      bp.Q.value = cfg.noiseQ;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = cfg.highpass;
      const g = ctx.createGain();
      const peak = cfg.crunch * grit * weight * (running ? 0.7 : 0.5);
      g.gain.setValueAtTime(0.0001, now + offset);
      g.gain.exponentialRampToValueAtTime(peak, now + offset + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + offset + cfg.decay);
      src.connect(bp).connect(hp).connect(g).connect(bus);
      src.start(now + offset, Math.random() * 1.6, cfg.decay + 0.05);
    }
  }

  /**
   * The old all-synthesised footstep, kept as the fallback. Three layers: a heel
   * thump, a debris crunch and a scuff.
   */
  synthFootstep(surface = "dirt", { running = false, foot = 0 } = {}) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const cfg = SURFACES[surface] ?? SURFACES.dirt;
    const bus = this.panBus(foot, 0.28);
    const loud = running ? 1.15 : 1;

    // 1. heel/sole thump
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(cfg.thump * jitter(0.08) * (running ? 1.1 : 1), now);
    thump.frequency.exponentialRampToValueAtTime(cfg.thump * 0.55, now + 0.09);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(cfg.thumpGain * loud, now + 0.008);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    thump.connect(thumpGain).connect(bus);
    thump.start(now);
    thump.stop(now + 0.14);

    // 2. debris / surface crunch — two quick grains, heel then toe
    for (const [offset, gain] of [
      [0, 1],
      [0.055 + Math.random() * 0.02, 0.55],
    ]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.playbackRate.value = 0.85 + Math.random() * 0.4;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = cfg.noiseFreq * jitter(0.08);
      bp.Q.value = cfg.noiseQ;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = cfg.highpass;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + offset);
      g.gain.exponentialRampToValueAtTime(cfg.crunch * gain * loud, now + offset + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + offset + cfg.decay);
      src.connect(bp).connect(hp).connect(g).connect(bus);
      src.start(now + offset, Math.random() * 1.6, cfg.decay + 0.05);
    }

    // 3. scuff: a faint tail so the step has air around it
    const scuff = ctx.createBufferSource();
    scuff.buffer = this.noiseBuffer;
    scuff.playbackRate.value = 1.3;
    const scuffFilter = ctx.createBiquadFilter();
    scuffFilter.type = "highpass";
    scuffFilter.frequency.value = cfg.highpass * 1.6;
    const scuffGain = ctx.createGain();
    scuffGain.gain.setValueAtTime(0.0001, now + 0.02);
    scuffGain.gain.exponentialRampToValueAtTime(0.018 * loud, now + 0.05);
    scuffGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    scuff.connect(scuffFilter).connect(scuffGain).connect(bus);
    scuff.start(now + 0.02, Math.random(), 0.24);

    this.lastStepAt = now;
  }

  /** Landing from a jump or a drop: the recorded landing take, heavier the fall. */
  landing(force = 1, surface = "dirt") {
    if (!this.ctx || !this.enabled) return;
    const cfg = SURFACE_SAMPLE[surface] ?? SURFACE_SAMPLE.dirt;
    const takes = FOOT_PACK[cfg.family]?.land ?? 2;
    const file = footFile(cfg.family, "Land", 1 + Math.floor(Math.random() * takes));
    const weight = Math.min(1.6, force);
    if (this.usingSamples && this.buffers[file]) {
      this.playSample(file, {
        gain: 0.42 * weight * jitter(0.1),
        rate: 0.97 * jitter(0.04),
        lowpass: weight > 1.2 ? 0 : 5200,
      });
      if (cfg.grit) this.gritLayer(surface, this.master, true);
      return;
    }
    this.synthLanding(force);
  }

  synthLanding(force = 1) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(78, now);
    thump.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22 * Math.min(1.6, force), now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    thump.connect(g).connect(this.master);
    thump.start(now);
    thump.stop(now + 0.28);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.13 * Math.min(1.6, force), now + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    src.connect(lp).connect(ng).connect(this.master);
    src.start(now, Math.random(), 0.22);
  }

  /**
   * The dawn call. Played from the pack's chicken recording, pitched down and
   * given a slap of distance; it is a chicken, not a rooster — see the header.
   */
  rooster() {
    if (!this.ctx || !this.enabled) return false;
    if (this.usingSamples && this.buffers["BIRDFowl_Chicken_OS_01.ogg"]) {
      this.playSample("BIRDFowl_Chicken_OS_01.ogg", {
        gain: 0.17,
        rate: 0.82 * jitter(0.03),
        lowpass: 3600,
        pan: Math.random() * 0.8 - 0.4,
      });
      this.caption("(Manok sa malayo)");
      return true;
    }
    return this.synthRooster();
  }

  /** Fallback: three syllables of sawtooth through a formant bank. */
  synthRooster() {
    const ctx = this.ctx;
    const start = ctx.currentTime + 0.05;
    const syllables = [
      { t: 0, dur: 0.34, f0: 520, f1: 760 },
      { t: 0.4, dur: 0.28, f0: 700, f1: 940 },
      { t: 0.72, dur: 0.62, f0: 880, f1: 620 },
    ];
    for (const s of syllables) {
      const t = start + s.t;
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(s.f0, t);
      osc.frequency.linearRampToValueAtTime(s.f1, t + s.dur * 0.4);
      osc.frequency.linearRampToValueAtTime(s.f0 * 0.82, t + s.dur);
      const vib = ctx.createOscillator();
      vib.frequency.value = 28;
      const vibGain = ctx.createGain();
      vibGain.gain.value = 22;
      vib.connect(vibGain).connect(osc.frequency);
      // two formants give it a throaty, animal timbre
      const f1 = ctx.createBiquadFilter();
      f1.type = "bandpass";
      f1.frequency.value = 1200;
      f1.Q.value = 4.5;
      const f2 = ctx.createBiquadFilter();
      f2.type = "bandpass";
      f2.frequency.value = 2500;
      f2.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.05, t + s.dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
      osc.connect(f1).connect(g);
      osc.connect(f2).connect(g);
      g.connect(this.master);
      osc.start(t);
      vib.start(t);
      osc.stop(t + s.dur + 0.02);
      vib.stop(t + s.dur + 0.02);
    }
    this.caption("(Tilaok ng manok sa malayo — synthesised)");
    return true;
  }

  /**
   * Daytime birdsong. With samples this is the recorded forest-birds take,
   * dropped in at random intervals and a random point in the stereo field; the
   * forest loop underneath carries the rest.
   */
  setBirds(on) {
    if (!this.ctx) return;
    if (on && !this.birdTimer) {
      const chirp = () => {
        if (!this.ctx || !this.enabled) return;
        if (this.usingSamples && this.buffers["AMBForst_ForestBirds_OS_01.ogg"]) {
          const dur = this.buffers["AMBForst_ForestBirds_OS_01.ogg"].duration;
          this.playSample("AMBForst_ForestBirds_OS_01.ogg", {
            gain: 0.2 * jitter(0.25),
            rate: 0.95 * jitter(0.05),
            pan: Math.random() * 1.4 - 0.7,
            offset: Math.random() * Math.max(0, dur - 1.5),
          });
          return;
        }
        this.synthChirp();
      };
      this.birdTimer = setInterval(chirp, 4200 + Math.random() * 5000);
      chirp();
    } else if (!on && this.birdTimer) {
      clearInterval(this.birdTimer);
      this.birdTimer = null;
    }
  }

  setDaylight(daylight) {
    this.daylight = daylight;
    if (this.ctx) this.applyAmbienceMix(3);
  }

  synthChirp() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const t = now + i * (0.07 + Math.random() * 0.05);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const base = 2200 + Math.random() * 1600;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.4), t + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.02, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) {
        pan.pan.value = Math.random() * 1.4 - 0.7;
        osc.connect(g).connect(pan).connect(this.master);
      } else {
        osc.connect(g).connect(this.master);
      }
      osc.start(t);
      osc.stop(t + 0.09);
    }
  }

  /** The midnight dog: recorded attention call, lowpassed and delayed to sit far off. */
  dogHowl(distance = 1) {
    if (!this.ctx || !this.enabled) return false;
    if (this.usingSamples && this.buffers["ANMLDog_DogAttention_OS_01.ogg"]) {
      this.playSample("ANMLDog_DogAttention_OS_01.ogg", {
        gain: 0.2 * distance,
        rate: 0.95 * jitter(0.03),
        lowpass: 1800,
        offset: 0.05,
      });
      if (Math.random() < 0.5) {
        this.playSample(randomOf(["ANMLDog_DogBark_OS_01.ogg", "ANMLDog_DogBark_OS_02.ogg"]), {
          gain: 0.09 * distance,
          rate: 0.94,
          lowpass: 1500,
          delay: 1.4 + Math.random() * 0.8,
          pan: Math.random() * 0.6 - 0.3,
        });
      }
      this.caption("(Malayong tahol ng aso)");
      return true;
    }
    return this.synthDogHowl(distance);
  }

  synthDogHowl(distance = 1) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(430, now + 0.55);
    osc.frequency.linearRampToValueAtTime(360, now + 1.5);
    osc.frequency.linearRampToValueAtTime(250, now + 2.4);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 8;
    vib.connect(vibGain).connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.1 * distance, now + 0.35);
    g.gain.exponentialRampToValueAtTime(0.06 * distance, now + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
    // a little space so it reads as "far away"
    const delay = ctx.createDelay(0.6);
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.25;
    osc.connect(lp).connect(g);
    g.connect(this.master);
    g.connect(delay).connect(fb).connect(delay);
    delay.connect(this.master);
    osc.start(now);
    vib.start(now);
    osc.stop(now + 2.7);
    vib.stop(now + 2.7);
    this.caption("(Malayong tahol ng aso — synthesised)");
    return true;
  }

  /** A short, plainly-synthetic radio loop for Ernie's house. Not live radio. */
  radioToggle() {
    if (!this.ctx) return this.radioPlaying;
    if (this.radioPlaying) {
      this.stopRadio();
      this.radioPlaying = false;
      this.caption("Radyo: patay");
      return false;
    }
    this.startRadio();
    this.radioPlaying = true;
    this.caption("Radyo: buhay (synthesised loop)");
    return true;
  }

  startRadio() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.radioGain = ctx.createGain();
    this.radioGain.gain.value = 0.0;
    this.radioGain.gain.linearRampToValueAtTime(0.075, now + 0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    this.radioGain.connect(lp).connect(this.master);
    const notes = [392, 440, 523.25, 587.33, 523.25, 440, 392, 349.23];
    let step = 0;
    this.radioTimer = setInterval(() => {
      if (!this.ctx || !this.radioGain) return;
      const t = this.ctx.currentTime;
      const freq = notes[step % notes.length];
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(g).connect(this.radioGain);
      osc.start(t);
      osc.stop(t + 0.45);
      step++;
    }, 460);
  }

  stopRadio() {
    clearInterval(this.radioTimer);
    if (this.radioGain) {
      this.radioGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
      const gain = this.radioGain;
      setTimeout(() => gain.disconnect(), 500);
      this.radioGain = null;
    }
  }

  /** The plank door of Ernie's house on its wooden hinges. */
  doorCreak() {
    if (!this.ctx || !this.enabled) return;
    if (this.usingSamples && this.buffers["DOORWood_FrontDoorOpen_OS_01.ogg"]) {
      this.playSample("DOORWood_FrontDoorOpen_OS_01.ogg", {
        gain: 0.3,
        rate: 0.94 * jitter(0.03),
        pan: 0.15,
      });
      return;
    }
    this.synthDoorCreak();
  }

  synthDoorCreak() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(320, now + 0.5);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(bp).connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.65);
  }
}
