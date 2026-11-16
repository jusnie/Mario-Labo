/**
 * sound.js — all audio is synthesised with the Web Audio API at runtime.
 *
 * Nothing here is a recording: the crickets, footsteps, wind and the midnight
 * dog howl are generated. The CC0 dog-howl recording the previous build used
 * (simcotter on freesound, via the bark-lab repository) could not be fetched in
 * this environment, so the howl is a clearly-labelled synthesised stand-in and
 * should be replaced in resources/game-dev-toolkit/assets/audio/ when available.
 *
 * Browsers only allow audio after a gesture, so nothing is created until
 * start() is called from a click or key press.
 */

/**
 * Per-surface footstep character. Everything is synthesised from a noise bed
 * plus a low thump, so the road, grass, the store's wooden floor and the hall
 * concrete all sound different underfoot.
 */
export const SURFACES = {
  gravel: { thump: 96, thumpGain: 0.055, noiseFreq: 1850, noiseQ: 0.8, highpass: 420, crunch: 0.2, decay: 0.15 },
  dirt: { thump: 82, thumpGain: 0.05, noiseFreq: 950, noiseQ: 1.1, highpass: 260, crunch: 0.15, decay: 0.17 },
  grass: { thump: 58, thumpGain: 0.03, noiseFreq: 3100, noiseQ: 0.7, highpass: 1500, crunch: 0.1, decay: 0.2 },
  wood: { thump: 132, thumpGain: 0.06, noiseFreq: 620, noiseQ: 2.6, highpass: 180, crunch: 0.11, decay: 0.13 },
  concrete: { thump: 150, thumpGain: 0.05, noiseFreq: 2400, noiseQ: 1.4, highpass: 700, crunch: 0.12, decay: 0.1 },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.captionHandler = null;
    this.nightFactor = 0;
    this.radioPlaying = false;
    this.lastStepAt = 0;
    this.buffers = {};
  }

  onCaption(fn) {
    this.captionHandler = fn;
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
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise(2.5);
    this.buildAmbience();
    await this.ctx.resume();
    return this.ctx;
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

  buildAmbience() {
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

  setNight(factor) {
    this.nightFactor = factor;
    if (!this.ctx) return;
    const target = 0.02 + factor * 0.16;
    this.cricketGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.cricketGain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 1.5);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) return;
    this.master.gain.linearRampToValueAtTime(on ? 0.85 : 0, this.ctx.currentTime + 0.2);
    this.caption(on ? "Tunog: bukas" : "Tunog: patay (muted)");
  }

  /**
   * A footstep, layered from three parts so it has weight and texture instead
   * of a single click: a low heel thump, a debris crunch, and a short scuff.
   * Each surface has its own character, and left/right feet alternate in the
   * stereo field.
   */
  footstep(surface = "dirt", { running = false, foot = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const cfg = SURFACES[surface] ?? SURFACES.dirt;
    const jitter = () => 0.92 + Math.random() * 0.16;
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = foot ? 0.28 : -0.28;
      pan.connect(this.master);
    }
    const bus = pan ?? this.master;
    const loud = running ? 1.15 : 1;

    // 1. heel/sole thump
    const thump = this.ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(cfg.thump * jitter() * (running ? 1.1 : 1), now);
    thump.frequency.exponentialRampToValueAtTime(cfg.thump * 0.55, now + 0.09);
    const thumpGain = this.ctx.createGain();
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
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.playbackRate.value = 0.85 + Math.random() * 0.4;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = cfg.noiseFreq * jitter();
      bp.Q.value = cfg.noiseQ;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = cfg.highpass;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + offset);
      g.gain.exponentialRampToValueAtTime(cfg.crunch * gain * loud, now + offset + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + offset + cfg.decay);
      src.connect(bp).connect(hp).connect(g).connect(bus);
      src.start(now + offset, Math.random() * 1.6, cfg.decay + 0.05);
    }

    // 3. scuff: a faint tail so the step has air around it
    const scuff = this.ctx.createBufferSource();
    scuff.buffer = this.noiseBuffer;
    scuff.playbackRate.value = 1.3;
    const scuffFilter = this.ctx.createBiquadFilter();
    scuffFilter.type = "highpass";
    scuffFilter.frequency.value = cfg.highpass * 1.6;
    const scuffGain = this.ctx.createGain();
    scuffGain.gain.setValueAtTime(0.0001, now + 0.02);
    scuffGain.gain.exponentialRampToValueAtTime(0.018 * loud, now + 0.05);
    scuffGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    scuff.connect(scuffFilter).connect(scuffGain).connect(bus);
    scuff.start(now + 0.02, Math.random(), 0.24);

    this.lastStepAt = now;
  }

  /** Landing from a jump or a drop: the same idea with more mass. */
  landing(force = 1) {
    if (!this.ctx || !this.enabled) return;
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
   * A rooster at dawn — synthesised from a sawtooth with a formant filter bank,
   * a rising-then-falling pitch envelope and three syllables.
   */
  rooster() {
    if (!this.ctx || !this.enabled) return false;
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
    this.caption("(Tilaok ng manok sa malayo)");
    return true;
  }

  /** Sparse daytime birdsong, scheduled while the sun is up. */
  setBirds(on) {
    if (!this.ctx) return;
    if (on && !this.birdTimer) {
      const chirp = () => {
        if (!this.ctx || !this.enabled) return;
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
      };
      this.birdTimer = setInterval(chirp, 4200 + Math.random() * 5000);
      chirp();
    } else if (!on && this.birdTimer) {
      clearInterval(this.birdTimer);
      this.birdTimer = null;
    }
  }

  /** Synthesised, not a recording — see the file header. */
  dogHowl(distance = 1) {
    if (!this.ctx || !this.enabled) return false;
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
    g.gain.exponentialRampToValueAtTime(0.10 * distance, now + 0.35);
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
    this.caption("(Malayong tahol ng aso)");
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

  doorCreak() {
    if (!this.ctx || !this.enabled) return;
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
