import type { ModFrame, SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp2, midiToHz, sinTurns } from '../dspmath.ts';
import { blepSaw } from '../dsp/blep.ts';
import { Svf } from '../dsp/svf.ts';

function vnoise(ctx: VoiceContext, stream: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = ctx.rand(stream, i);
  const b = ctx.rand(stream, i + 1);
  return (a + (b - a) * f * f * (3 - 2 * f)) * 2 - 1;
}

/** Sustained saws (one per side) over a sine sub, with slow seeded drift. Events become accents. */
class DroneVoice implements Voice {
  private ctx: VoiceContext;
  private svfL = new Svf();
  private svfR = new Svf();
  private ph = new Float64Array(3);
  private pitch = -1;
  private t = 0;
  private fade = 0;
  private acc = 0;
  private accPeak = 0;
  readonly active = true;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
    this.ph[1] = 0.33;
    this.ph[2] = 0.71;
  }

  noteOn(): void {}
  noteOff(): void {}

  accent(velocity: number): void {
    if (velocity > this.accPeak) this.accPeak = velocity;
  }

  render(out: Float64Array, start: number, end: number, mod: ModFrame, outR?: Float64Array): void {
    const p = this.ctx.params;
    const oR = outR ?? out;
    if (this.pitch < 0) this.pitch = mod.pitch;
    this.pitch += (mod.pitch - this.pitch) * 0.02;
    const secs = this.t / SR;
    const d1 = vnoise(this.ctx, 1, secs * 0.09) * p.drift;
    const d2 = vnoise(this.ctx, 2, secs * 0.07) * p.drift;
    const hz = midiToHz(this.pitch);
    const dt0 = Math.min(0.45, (hz * exp2((d1 - p.spread * 0.5) / 1200)) / SR);
    const dt1 = Math.min(0.45, (hz * exp2((d2 + p.spread * 0.5) / 1200)) / SR);
    const dt2 = hz / 2 / SR;
    const cut = p.tone * exp2(this.acc * 1.5 + vnoise(this.ctx, 3, secs * 0.04) * 0.5);
    this.svfL.set(cut, 0.2);
    this.svfR.copyCoefs(this.svfL);
    const sub = p.sub;
    const sawGain = 1 - sub * 0.5;
    const ph = this.ph;
    let p0 = ph[0];
    let p1 = ph[1];
    let p2 = ph[2];
    let fade = this.fade;
    let acc = this.acc;
    let accPeak = this.accPeak;
    for (let i = start; i < end; i++) {
      const a = blepSaw(p0, dt0) * sawGain;
      const b = blepSaw(p1, dt1) * sawGain;
      const s = sinTurns(p2) * sub;
      p0 += dt0;
      if (p0 >= 1) p0 -= 1;
      p1 += dt1;
      if (p1 >= 1) p1 -= 1;
      p2 += dt2;
      if (p2 >= 1) p2 -= 1;
      if (fade < 1) fade += 1 / (6 * SR);
      acc += (accPeak - acc) * 0.0005;
      accPeak *= 0.99998;
      const g = 0.13 * fade * (1 + acc * 0.6);
      out[i] += this.svfL.lp(a * 0.8 + b * 0.25 + s) * g;
      oR[i] += this.svfR.lp(b * 0.8 + a * 0.25 + s) * g;
    }
    ph[0] = p0;
    ph[1] = p1;
    ph[2] = p2;
    this.fade = fade;
    this.acc = acc;
    this.accPeak = accPeak;
    this.t += end - start;
  }
}

export const drone: SoundType = {
  id: 'drone',
  label: 'drone',
  mode: 'sustained',
  stereo: true,
  glyph: 'ring',
  maxVoices: 1,
  params: [
    { key: 'tone', label: 'tone', min: 80, max: 6000, default: 600, curve: 'exp', unit: 'Hz' },
    { key: 'spread', label: 'spread', min: 0, max: 30, default: 8, curve: 'lin', unit: 'ct' },
    { key: 'drift', label: 'drift', min: 0, max: 60, default: 10, curve: 'lin', unit: 'ct' },
    { key: 'sub', label: 'sub', min: 0, max: 1, default: 0.5, curve: 'lin' },
  ],
  panel: [
    { kind: 'knobs', title: 'oscillators', keys: ['spread', 'drift', 'sub'] },
    { kind: 'knobs', title: 'filter', keys: ['tone'] },
  ],
  createVoice: (ctx) => new DroneVoice(ctx),
};
