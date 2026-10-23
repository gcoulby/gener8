import type { ModFrame, SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { midiToHz, sinTurns } from '../dspmath.ts';
import { Svf } from '../dsp/svf.ts';
import { Xorshift } from '../rand.ts';

const GRAINS = 24;

/**
 * A granular haze with no samples: short windowed tones scattered over the
 * sound's chord (root, 5th, 9th, 10th), each at a random spot in the stereo
 * field. Density is grains per second, size their length, spray how far they
 * scatter in octaves and time. Events thicken it for a moment.
 */
class CloudVoice implements Voice {
  private ctx: VoiceContext;
  private rng = new Xorshift();
  private svfL = new Svf();
  private svfR = new Svf();
  private age = new Float64Array(GRAINS).fill(-1);
  private len = new Float64Array(GRAINS);
  private ph = new Float64Array(GRAINS);
  private dt = new Float64Array(GRAINS);
  private gl = new Float64Array(GRAINS);
  private gr = new Float64Array(GRAINS);
  private next = 0;
  private pitch = -1;
  private boost = 0;
  private fade = 0;
  readonly active = true;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
    this.rng.seed(ctx.rand(9, 0) * 4294967296);
  }

  noteOn(): void {}
  noteOff(): void {}

  accent(velocity: number): void {
    this.boost = Math.min(1, this.boost + velocity * 0.6);
  }

  private spawn(mod: ModFrame, p: Record<string, number>): void {
    const rng = this.rng;
    for (let g = 0; g < GRAINS; g++) {
      if (this.age[g] >= 0) continue;
      const tone = mod.chord[Math.floor((rng.next() * 0.5 + 0.5) * 4) & 3];
      const oct = Math.round(rng.next() * p.spray * 2);
      const hz = midiToHz(this.pitch + tone + oct * 12);
      this.dt[g] = Math.min(0.45, hz / SR);
      this.ph[g] = rng.next() * 0.5 + 0.5;
      this.len[g] = (p.size / 1000) * SR * (0.6 + 0.8 * (rng.next() * 0.5 + 0.5));
      this.age[g] = 0;
      const pan = rng.next() * 0.9;
      this.gl[g] = Math.sqrt(0.5 - pan * 0.5);
      this.gr[g] = Math.sqrt(0.5 + pan * 0.5);
      return;
    }
  }

  render(out: Float64Array, start: number, end: number, mod: ModFrame, outR?: Float64Array): void {
    const p = this.ctx.params;
    const oR = outR ?? out;
    if (this.pitch < 0) this.pitch = mod.pitch;
    this.pitch += (mod.pitch - this.pitch) * 0.02;
    this.svfL.set(p.tone, 0.1);
    this.svfR.copyCoefs(this.svfL);
    const every = SR / (p.density * (1 + this.boost * 2));
    // overlapping Hann grains: keep the level near steady whatever the density
    const norm = 1 / Math.sqrt(Math.max(1, (p.density * p.size) / 1000));
    const { age, len, ph, dt, gl, gr } = this;
    let boost = this.boost;
    let fade = this.fade;
    for (let i = start; i < end; i++) {
      if (--this.next <= 0) {
        this.next = every * (1 - p.spray * 0.5 + p.spray * (this.rng.next() * 0.5 + 0.5));
        this.spawn(mod, p);
      }
      let l = 0;
      let r = 0;
      for (let g = 0; g < GRAINS; g++) {
        if (age[g] < 0) continue;
        const w = sinTurns((age[g] / len[g]) * 0.5);
        const s = sinTurns(ph[g]) * w * w;
        ph[g] += dt[g];
        if (ph[g] >= 1) ph[g] -= 1;
        l += s * gl[g];
        r += s * gr[g];
        if (++age[g] >= len[g]) age[g] = -1;
      }
      boost *= 0.99995;
      if (fade < 1) fade += 1 / (2 * SR);
      const k = 0.16 * norm * fade;
      out[i] += this.svfL.lp(l) * k;
      oR[i] += this.svfR.lp(r) * k;
    }
    this.boost = boost;
    this.fade = fade;
  }
}

export const cloud: SoundType = {
  id: 'cloud',
  label: 'cloud',
  mode: 'sustained',
  stereo: true,
  glyph: 'cloud',
  maxVoices: 1,
  params: [
    { key: 'density', label: 'density', min: 2, max: 80, default: 18, curve: 'exp', unit: '/s' },
    { key: 'size', label: 'grain size', min: 20, max: 800, default: 180, curve: 'exp', unit: 'ms' },
    { key: 'spray', label: 'spray', min: 0, max: 1, default: 0.4, curve: 'lin' },
    { key: 'tone', label: 'tone', min: 200, max: 12000, default: 4000, curve: 'exp', unit: 'Hz' },
  ],
  panel: [
    { kind: 'knobs', title: 'grains', keys: ['density', 'size', 'spray'] },
    { kind: 'knobs', title: 'filter', keys: ['tone'] },
  ],
  createVoice: (ctx) => new CloudVoice(ctx),
};
