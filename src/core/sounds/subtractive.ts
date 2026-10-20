import type { SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp2, midiToHz, sinTurns } from '../dspmath.ts';
import { blepSaw, blepSquare } from '../dsp/blep.ts';
import { Svf } from '../dsp/svf.ts';
import { Adsr, IDLE } from '../dsp/adsr.ts';

/**
 * Two band-limited oscillators, one leaning left and one right, into a resonant
 * lowpass per side. ADSR on the filter and on the amp (the VCA). A slow
 * per-voice pitch wobble stands in for analogue drift.
 */
class SubtractiveVoice implements Voice {
  private ctx: VoiceContext;
  private p: Record<string, number>;
  private amp = new Adsr();
  private fenv = new Adsr();
  private svfL = new Svf();
  private svfR = new Svf();
  private ph1 = 0;
  private ph2 = 0.37;
  private hz = 220;
  private vel = 0;
  private lfo = 0;
  private lfoRate = 0.3;
  private serial = 0;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
    this.p = ctx.params;
  }

  get active(): boolean {
    return this.amp.stage !== IDLE;
  }

  noteOn(pitch: number, velocity: number): void {
    this.hz = midiToHz(pitch);
    this.vel = velocity;
    this.lfo = this.ctx.rand(4, this.serial);
    this.lfoRate = 0.15 + 0.3 * this.ctx.rand(5, this.serial++);
    this.amp.gateOn();
    this.fenv.gateOn();
  }

  noteOff(): void {
    this.amp.gateOff();
    this.fenv.gateOff();
  }

  render(out: Float64Array, start: number, end: number, _mod: unknown, outR?: Float64Array): void {
    const p = this.p;
    const oR = outR ?? out;
    const amp = this.amp;
    const fenv = this.fenv;
    amp.set(p.a, p.d, p.s, p.r);
    fenv.set(p.fa, p.fd, p.fs, p.fr);
    const wob = exp2((sinTurns(this.lfo) * p.wobble) / 1200);
    this.lfo += ((end - start) * this.lfoRate) / SR;
    const dt1 = Math.min(0.45, (this.hz * wob) / SR);
    const dt2 = Math.min(0.45, dt1 * exp2(p.detune / 1200));
    const shape = p.shape;
    const cutoff = p.cutoff;
    const envAmt = p.envAmt;
    const res = p.res;
    const gain = this.vel * 0.3;
    let ph1 = this.ph1;
    let ph2 = this.ph2;
    for (let i = start; i < end; i++) {
      if (((i - start) & 15) === 0) {
        const c = cutoff * exp2(envAmt * fenv.level);
        this.svfL.set(c, res);
        this.svfR.copyCoefs(this.svfL);
      }
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
      fenv.next();
      const e = amp.next() * gain;
      out[i] += this.svfL.lp(o1 * 0.7 + o2 * 0.3) * e;
      oR[i] += this.svfR.lp(o2 * 0.7 + o1 * 0.3) * e;
    }
    this.ph1 = ph1;
    this.ph2 = ph2;
  }
}

export const subtractive: SoundType = {
  id: 'subtractive',
  label: 'subtractive',
  mode: 'event',
  stereo: true,
  glyph: 'triangle',
  maxVoices: 8,
  params: [
    { key: 'shape', label: 'saw → square', min: 0, max: 1, default: 0.2, curve: 'lin' },
    { key: 'detune', label: 'detune / width', min: 0, max: 30, default: 9, curve: 'lin', unit: 'ct' },
    { key: 'wobble', label: 'drift', min: 0, max: 30, default: 5, curve: 'lin', unit: 'ct' },
    { key: 'cutoff', label: 'cutoff', min: 60, max: 12000, default: 1200, curve: 'exp', unit: 'Hz' },
    { key: 'res', label: 'resonance', min: 0, max: 0.95, default: 0.2, curve: 'lin' },
    { key: 'envAmt', label: 'env amount', min: 0, max: 6, default: 1.5, curve: 'lin', unit: 'oct' },
    { key: 'fa', label: 'attack', min: 0.001, max: 6, default: 0.02, curve: 'exp', unit: 's' },
    { key: 'fd', label: 'decay', min: 0.01, max: 6, default: 1.2, curve: 'exp', unit: 's' },
    { key: 'fs', label: 'sustain', min: 0, max: 1, default: 0.25, curve: 'lin' },
    { key: 'fr', label: 'release', min: 0.01, max: 10, default: 2.5, curve: 'exp', unit: 's' },
    { key: 'a', label: 'attack', min: 0.001, max: 6, default: 0.03, curve: 'exp', unit: 's' },
    { key: 'd', label: 'decay', min: 0.01, max: 6, default: 1.5, curve: 'exp', unit: 's' },
    { key: 's', label: 'sustain', min: 0, max: 1, default: 0.5, curve: 'lin' },
    { key: 'r', label: 'release', min: 0.01, max: 10, default: 3, curve: 'exp', unit: 's' },
  ],
  panel: [
    { kind: 'knobs', title: 'oscillators', keys: ['shape', 'detune', 'wobble'] },
    { kind: 'filter', title: 'filter', cutoff: 'cutoff', res: 'res', extra: ['envAmt'] },
    { kind: 'adsr', title: 'filter env', keys: ['fa', 'fd', 'fs', 'fr'] },
    { kind: 'adsr', title: 'amp (VCA)', keys: ['a', 'd', 's', 'r'] },
  ],
  createVoice: (ctx) => new SubtractiveVoice(ctx),
};
