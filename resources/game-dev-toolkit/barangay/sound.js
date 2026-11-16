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

  footstep(surface = "dirt") {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStepAt < 0.22) return;
    this.lastStepAt = now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = surface === "dirt" ? 850 : 1500;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = surface === "dirt" ? 240 : 700;
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    src.connect(lp).connect(bp).connect(g).connect(this.master);
    src.start(now, Math.random() * 1.5, 0.22);
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
