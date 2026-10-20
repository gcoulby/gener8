import type { SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp, exp2, midiToHz, sinTurns } from '../dspmath.ts';
import { Xorshift } from '../rand.ts';

class PercussionVoice implements Voice {
  private ctx: VoiceContext;
  private rng = new Xorshift();
  private ph = 0;
  private hz = 100;
  private sweepK = 0;
  private env = 0;
  private penv = 0;
  private nenv = 0;
  private lp = 0;
  private ad = 0;
  private pd = 0;
  private nd = 0;
  private kDecay = -1;
  private serial = 0;
  active = false;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
  }

  noteOn(pitch: number, velocity: number): void {
    const p = this.ctx.params;
    if (p.decay !== this.kDecay) {
      this.kDecay = p.decay;
      const n = Math.max(1, p.decay * SR);
      this.ad = exp(-6.9 / n);
      this.pd = exp(-6.9 / (n * 0.15));
      this.nd = exp(-6.9 / (n * 0.45));
    }
    this.hz = midiToHz(pitch - 12);
    this.sweepK = exp2(p.sweep) - 1;
    this.rng.seed(this.ctx.rand(1, this.serial++) * 4294967296);
    this.ph = 0;
    this.env = velocity;
    this.penv = 1;
    this.nenv = velocity;
    this.active = true;
  }

  noteOff(): void {}

  render(out: Float64Array, start: number, end: number): void {
    const p = this.ctx.params;
    const tone = p.tone;
    const color = p.color;
    const rng = this.rng;
    const { ad, pd, nd } = this;
    const k = this.sweepK;
    const base = this.hz / SR;
    let { ph, env, penv, nenv, lp } = this;
    for (let i = start; i < end; i++) {
      ph += base * (1 + k * penv);
      if (ph >= 1) ph -= 1;
      const n = rng.next();
      lp += (n - lp) * 0.15;
      const hp = n - lp;
      const nn = lp + (hp - lp) * color;
      out[i] += (sinTurns(ph) * env * tone + nn * nenv * (1 - tone)) * 0.55;
      env *= ad;
      penv *= pd;
      nenv *= nd;
    }
    this.ph = ph;
    this.env = env;
    this.penv = penv;
    this.nenv = nenv;
    this.lp = lp;
    if (env < 1e-4 && nenv < 1e-4) this.active = false;
  }
}

export const percussion: SoundType = {
  id: 'percussion',
  label: 'percussion',
  mode: 'event',
  glyph: 'square',
  maxVoices: 6,
  params: [
    { key: 'tone', label: 'sine ↔ noise', min: 0, max: 1, default: 0.65, curve: 'lin' },
    { key: 'decay', label: 'decay', min: 0.02, max: 2, default: 0.3, curve: 'exp', unit: 's' },
    { key: 'sweep', label: 'pitch sweep', min: 0, max: 5, default: 1.5, curve: 'lin', unit: 'oct' },
    { key: 'color', label: 'noise colour', min: 0, max: 1, default: 0.5, curve: 'lin' },
  ],
  panel: [{ kind: 'knobs', title: 'body', keys: ['tone', 'decay', 'sweep', 'color'] }],
  createVoice: (ctx) => new PercussionVoice(ctx),
};
