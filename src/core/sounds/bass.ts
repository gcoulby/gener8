import type { SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp, exp2, midiToHz, sinTurns, tanh } from '../dspmath.ts';
import { Adsr, IDLE } from '../dsp/adsr.ts';
import { blepSaw, blepSquare } from '../dsp/blep.ts';
import { Svf } from '../dsp/svf.ts';

/** Filter coefficients are refreshed this often (samples) as the envelope moves. */
const FILTER_EVERY = 16;

/**
 * A monophonic bass: one voice, so a new note slides from the last one (glide)
 * instead of starting another. Saw-to-square plus a sine an octave down, through
 * a resonant lowpass with its own decaying envelope, then gentle drive.
 */
class BassVoice implements Voice {
  private p: Record<string, number>;
  private amp = new Adsr();
  private svf = new Svf();
  private ph = 0;
  private sub = 0;
  private hz = 55;
  private target = 55;
  private vel = 0;
  private fenv = 0;
  private kGlide = -1;
  private glideC = 0;
  private kFd = -1;
  private fdc = 0;
  private count = 0;

  constructor(ctx: VoiceContext) {
    this.p = ctx.params;
  }

  get active(): boolean {
    return this.amp.stage !== IDLE;
  }

  noteOn(pitch: number, velocity: number): void {
    this.target = Math.max(20, midiToHz(pitch));
    // sounding already: slide there; otherwise start on the note
    if (!this.active) this.hz = this.target;
    this.vel = velocity;
    this.fenv = 1;
    this.amp.gateOn();
  }

  noteOff(): void {
    this.amp.gateOff();
  }

  render(out: Float64Array, start: number, end: number): void {
    const p = this.p;
    this.amp.set(p.a, p.d, p.s, p.r);
    if (p.glide !== this.kGlide) {
      this.kGlide = p.glide;
      this.glideC = 1 - exp(-4 / Math.max(1, p.glide * SR));
    }
    if (p.fdecay !== this.kFd) {
      this.kFd = p.fdecay;
      this.fdc = exp(-5 / Math.max(1, p.fdecay * SR));
    }
    const wave = p.wave;
    const subLvl = p.sub;
    const drive = 1 + p.drive * 4;
    const gain = this.vel * 0.3;
    let { ph, sub, hz, fenv, count } = this;
    for (let i = start; i < end; i++) {
      hz += (this.target - hz) * this.glideC;
      if (--count <= 0) {
        count = FILTER_EVERY;
        this.svf.set(p.cutoff * exp2(fenv * p.env * this.vel), p.res);
      }
      const dt = Math.min(0.45, hz / SR);
      const x = blepSaw(ph, dt) * (1 - wave) + blepSquare(ph, dt) * wave + sinTurns(sub) * subLvl * 1.2;
      ph += dt;
      if (ph >= 1) ph -= 1;
      sub += dt * 0.5;
      if (sub >= 1) sub -= 1;
      const y = tanh(this.svf.lp(x) * drive) / drive;
      out[i] += y * this.amp.next() * gain;
      fenv *= this.fdc;
    }
    this.ph = ph;
    this.sub = sub;
    this.hz = hz;
    this.fenv = fenv;
    this.count = count;
  }
}

export const bass: SoundType = {
  id: 'bass',
  label: 'bass',
  mode: 'event',
  glyph: 'dome',
  maxVoices: 1,
  params: [
    { key: 'wave', label: 'saw → square', min: 0, max: 1, default: 0.3, curve: 'lin' },
    { key: 'sub', label: 'sub', min: 0, max: 1, default: 0.5, curve: 'lin' },
    { key: 'glide', label: 'glide', min: 0.001, max: 1, default: 0.06, curve: 'exp', unit: 's' },
    { key: 'drive', label: 'drive', min: 0, max: 1, default: 0.3, curve: 'lin' },
    { key: 'cutoff', label: 'cutoff', min: 40, max: 4000, default: 220, curve: 'exp', unit: 'Hz' },
    { key: 'res', label: 'resonance', min: 0, max: 0.95, default: 0.35, curve: 'lin' },
    { key: 'env', label: 'env amount', min: 0, max: 6, default: 2.5, curve: 'lin', unit: 'oct' },
    { key: 'fdecay', label: 'env decay', min: 0.02, max: 2, default: 0.25, curve: 'exp', unit: 's' },
    { key: 'a', label: 'attack', min: 0.001, max: 2, default: 0.003, curve: 'exp', unit: 's' },
    { key: 'd', label: 'decay', min: 0.01, max: 4, default: 0.4, curve: 'exp', unit: 's' },
    { key: 's', label: 'sustain', min: 0, max: 1, default: 0.7, curve: 'lin' },
    { key: 'r', label: 'release', min: 0.01, max: 4, default: 0.15, curve: 'exp', unit: 's' },
  ],
  panel: [
    { kind: 'knobs', title: 'oscillator', keys: ['wave', 'sub', 'glide', 'drive'] },
    { kind: 'filter', title: 'filter (VCF)', cutoff: 'cutoff', res: 'res', extra: ['env', 'fdecay'] },
    { kind: 'adsr', title: 'amp (VCA)', keys: ['a', 'd', 's', 'r'] },
  ],
  createVoice: (ctx) => new BassVoice(ctx),
};
