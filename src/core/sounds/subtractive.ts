import type { SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp2, midiToHz } from '../dspmath.ts';
import { blepSaw, blepSquare } from '../dsp/blep.ts';
import { Svf } from '../dsp/svf.ts';
import { Adsr, IDLE } from '../dsp/adsr.ts';

class SubtractiveVoice implements Voice {
  private p: Record<string, number>;
  private amp = new Adsr();
  private fenv = new Adsr();
  private svf = new Svf();
  private ph1 = 0;
  private ph2 = 0.37;
  private hz = 220;
  private vel = 0;

  constructor(ctx: VoiceContext) {
    this.p = ctx.params;
  }

  get active(): boolean {
    return this.amp.stage !== IDLE;
  }

  noteOn(pitch: number, velocity: number): void {
    this.hz = midiToHz(pitch);
    this.vel = velocity;
    this.amp.gateOn();
    this.fenv.gateOn();
  }

  noteOff(): void {
    this.amp.gateOff();
    this.fenv.gateOff();
  }

  render(out: Float64Array, start: number, end: number): void {
    const p = this.p;
    const amp = this.amp;
    const fenv = this.fenv;
    const svf = this.svf;
    amp.set(p.a, p.d, p.s, p.r);
    fenv.set(p.fa, p.fd, p.fs, p.fr);
    const dt1 = Math.min(0.45, this.hz / SR);
    const dt2 = Math.min(0.45, dt1 * exp2(p.detune / 1200));
    const shape = p.shape;
    const cutoff = p.cutoff;
    const envAmt = p.envAmt;
    const res = p.res;
    const gain = this.vel * 0.3;
    let ph1 = this.ph1;
    let ph2 = this.ph2;
    for (let i = start; i < end; i++) {
      if (((i - start) & 15) === 0) svf.set(cutoff * exp2(envAmt * fenv.level), res);
      const s1 = blepSaw(ph1, dt1);
      const s2 = blepSaw(ph2, dt2);
      let o1 = s1;
      let o2 = s2;
      if (shape > 0) {
        o1 += (blepSquare(ph1, dt1) - s1) * shape;
        o2 += (blepSquare(ph2, dt2) - s2) * shape;
      }
      ph1 += dt1;
      if (ph1 >= 1) ph1 -= 1;
      ph2 += dt2;
      if (ph2 >= 1) ph2 -= 1;
      const y = svf.lp((o1 + o2) * 0.5);
      fenv.next();
      out[i] += y * amp.next() * gain;
    }
    this.ph1 = ph1;
    this.ph2 = ph2;
  }
}

export const subtractive: SoundType = {
  id: 'subtractive',
  label: 'subtractive',
  mode: 'event',
  glyph: 'triangle',
  maxVoices: 8,
  params: [
    { key: 'shape', label: 'saw → square', min: 0, max: 1, default: 0, curve: 'lin' },
    { key: 'detune', label: 'detune', min: 0, max: 30, default: 7, curve: 'lin', unit: 'ct' },
    { key: 'cutoff', label: 'cutoff', min: 60, max: 12000, default: 900, curve: 'exp', unit: 'Hz' },
    { key: 'res', label: 'resonance', min: 0, max: 0.95, default: 0.35, curve: 'lin' },
    { key: 'envAmt', label: 'env amount', min: 0, max: 6, default: 2.5, curve: 'lin', unit: 'oct' },
    { key: 'fa', label: 'attack', min: 0.001, max: 2, default: 0.002, curve: 'exp', unit: 's' },
    { key: 'fd', label: 'decay', min: 0.01, max: 3, default: 0.18, curve: 'exp', unit: 's' },
    { key: 'fs', label: 'sustain', min: 0, max: 1, default: 0.1, curve: 'lin' },
    { key: 'fr', label: 'release', min: 0.01, max: 4, default: 0.3, curve: 'exp', unit: 's' },
    { key: 'a', label: 'attack', min: 0.001, max: 2, default: 0.004, curve: 'exp', unit: 's' },
    { key: 'd', label: 'decay', min: 0.01, max: 3, default: 0.25, curve: 'exp', unit: 's' },
    { key: 's', label: 'sustain', min: 0, max: 1, default: 0.3, curve: 'lin' },
    { key: 'r', label: 'release', min: 0.01, max: 4, default: 0.3, curve: 'exp', unit: 's' },
  ],
  panel: [
    { kind: 'knobs', title: 'oscillators', keys: ['shape', 'detune'] },
    { kind: 'filter', title: 'filter', cutoff: 'cutoff', res: 'res', extra: ['envAmt'] },
    { kind: 'adsr', title: 'filter env', keys: ['fa', 'fd', 'fs', 'fr'] },
    { kind: 'adsr', title: 'amp (VCA)', keys: ['a', 'd', 's', 'r'] },
  ],
  createVoice: (ctx) => new SubtractiveVoice(ctx),
};
