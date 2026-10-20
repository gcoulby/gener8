import type { ModFrame, SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp2, midiToHz } from '../dspmath.ts';
import { Xorshift } from '../rand.ts';
import { Svf } from '../dsp/svf.ts';

function vnoise(ctx: VoiceContext, stream: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = ctx.rand(stream, i);
  const b = ctx.rand(stream, i + 1);
  return (a + (b - a) * f * f * (3 - 2 * f)) * 2 - 1;
}

/**
 * Sustained stereo noise through a wandering bandpass: wind, surf, tape hiss.
 * The band centre follows the sound's pitch (its height); crackle adds sparse
 * vinyl/tape impulses. Events become gusts.
 */
class NoiseVoice implements Voice {
  private ctx: VoiceContext;
  private nl = new Xorshift();
  private nr = new Xorshift();
  private cr = new Xorshift();
  private fl = new Svf();
  private fr = new Svf();
  private t = 0;
  private fade = 0;
  private gust = 0;
  private gustPeak = 0;
  private pitch = -1;
  readonly active = true;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
    this.nl.seed(ctx.rand(1, 0) * 4294967296);
    this.nr.seed(ctx.rand(1, 1) * 4294967296);
    this.cr.seed(ctx.rand(1, 2) * 4294967296);
  }

  noteOn(): void {}
  noteOff(): void {}

  accent(velocity: number): void {
    if (velocity > this.gustPeak) this.gustPeak = velocity;
  }

  render(out: Float64Array, start: number, end: number, mod: ModFrame, outR?: Float64Array): void {
    const p = this.ctx.params;
    const oR = outR ?? out;
    if (this.pitch < 0) this.pitch = mod.pitch;
    this.pitch += (mod.pitch - this.pitch) * 0.02;
    const secs = this.t / SR;
    const wander = vnoise(this.ctx, 3, secs * 0.08) * p.motion;
    const centre = midiToHz(this.pitch + 24) * exp2(wander + this.gust * 1.2);
    this.fl.set(centre, p.focus);
    this.fr.set(centre * 1.06, p.focus);
    const level = 0.22 * (p.floor + (1 - p.floor) * (0.5 + 0.5 * vnoise(this.ctx, 4, secs * 0.05)));
    const crackle = p.crackle * p.crackle * 0.004;
    const { nl, nr, cr } = this;
    let { fade, gust, gustPeak } = this;
    for (let i = start; i < end; i++) {
      let xl = nl.next();
      let xr = nr.next();
      if (crackle > 0 && cr.next() > 1 - crackle) {
        const k = cr.next() * 6;
        xl += k;
        xr += k * 0.7;
      }
      if (fade < 1) fade += 1 / (5 * SR);
      gust += (gustPeak - gust) * 0.0003;
      gustPeak *= 0.99997;
      const g = level * fade * (1 + gust * 1.5);
      out[i] += this.fl.bp(xl) * g;
      oR[i] += this.fr.bp(xr) * g;
    }
    this.fade = fade;
    this.gust = gust;
    this.gustPeak = gustPeak;
    this.t += end - start;
  }
}

export const noise: SoundType = {
  id: 'noise',
  label: 'noise',
  mode: 'sustained',
  stereo: true,
  glyph: 'burst',
  maxVoices: 1,
  params: [
    { key: 'focus', label: 'focus', min: 0, max: 0.95, default: 0.3, curve: 'lin' },
    { key: 'motion', label: 'wander', min: 0, max: 3, default: 1, curve: 'lin', unit: 'oct' },
    { key: 'floor', label: 'steadiness', min: 0, max: 1, default: 0.5, curve: 'lin' },
    { key: 'crackle', label: 'crackle', min: 0, max: 1, default: 0, curve: 'lin' },
  ],
  panel: [
    { kind: 'knobs', title: 'band', keys: ['focus', 'motion'] },
    { kind: 'knobs', title: 'texture', keys: ['floor', 'crackle'] },
  ],
  createVoice: (ctx) => new NoiseVoice(ctx),
};
