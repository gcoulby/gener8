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

/** Sustained oscillators with slow seeded drift. Events become accents. */
class DroneVoice implements Voice {
  private ctx: VoiceContext;
  private svf = new Svf();
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

  render(out: Float64Array, start: number, end: number, mod: ModFrame): void {
    const p = this.ctx.params;
    if (this.pitch < 0) this.pitch = mod.pitch;
    this.pitch += (mod.pitch - this.pitch) * 0.05;
    const secs = this.t / SR;
    const d1 = vnoise(this.ctx, 1, secs * 0.13) * p.drift;
    const d2 = vnoise(this.ctx, 2, secs * 0.11) * p.drift;
    const hz = midiToHz(this.pitch);
    const dt0 = Math.min(0.45, (hz * exp2((d1 - p.spread * 0.5) / 1200)) / SR);
    const dt1 = Math.min(0.45, (hz * exp2((d2 + p.spread * 0.5) / 1200)) / SR);
    const dt2 = hz / 2 / SR;
    this.svf.set(p.tone * exp2(this.acc * 2), 0.15);
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
      const x = (blepSaw(p0, dt0) + blepSaw(p1, dt1)) * 0.5 * sawGain + sinTurns(p2) * sub;
      p0 += dt0;
      if (p0 >= 1) p0 -= 1;
      p1 += dt1;
      if (p1 >= 1) p1 -= 1;
      p2 += dt2;
      if (p2 >= 1) p2 -= 1;
      if (fade < 1) fade += 1 / (3 * SR);
      acc += (accPeak - acc) * 0.002;
      accPeak *= 0.99996;
      out[i] += this.svf.lp(x) * 0.16 * fade * (1 + acc * 0.8);
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
  glyph: 'ring',
  maxVoices: 1,
  params: [
    { key: 'tone', label: 'tone', min: 80, max: 6000, default: 900, curve: 'exp', unit: 'Hz' },
    { key: 'spread', label: 'spread', min: 0, max: 30, default: 8, curve: 'lin', unit: 'ct' },
    { key: 'drift', label: 'drift', min: 0, max: 60, default: 12, curve: 'lin', unit: 'ct' },
    { key: 'sub', label: 'sub', min: 0, max: 1, default: 0.4, curve: 'lin' },
  ],
  panel: [
    { kind: 'knobs', title: 'oscillators', keys: ['spread', 'drift', 'sub'] },
    { kind: 'knobs', title: 'filter', keys: ['tone'] },
  ],
  createVoice: (ctx) => new DroneVoice(ctx),
};
