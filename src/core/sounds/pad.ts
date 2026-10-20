import type { ModFrame, SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp, exp2, midiToHz } from '../dspmath.ts';
import { blepSaw } from '../dsp/blep.ts';
import { Svf } from '../dsp/svf.ts';

const TONES = 4;
const UNISON = 3;
const N = TONES * UNISON;
// Unison voice d is panned left, centre, right.
const PAN_L = [0.92, 0.6, 0.25];
const PAN_R = [0.25, 0.6, 0.92];

function vnoise(ctx: VoiceContext, stream: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = ctx.rand(stream, i);
  const b = ctx.rand(stream, i + 1);
  return (a + (b - a) * f * f * (3 - 2 * f)) * 2 - 1;
}

/**
 * Sustained, open-voiced chord (root, 5th, 9th, 10th) of detuned saws spread
 * across the stereo field. Each oscillator drifts slowly; the filter breathes.
 * Events become slow swells.
 */
class PadVoice implements Voice {
  private ctx: VoiceContext;
  private svfL = new Svf();
  private svfR = new Svf();
  private ph = new Float64Array(N);
  private dt = new Float64Array(N);
  private pitch = -1;
  private t = 0;
  private fade = 0;
  private swell = 0;
  private target = 0;
  private attacking = false;
  private kA = -1;
  private kR = -1;
  private attC = 0;
  private relC = 0;
  readonly active = true;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
    for (let i = 0; i < N; i++) this.ph[i] = ctx.rand(3, i);
  }

  noteOn(): void {}
  noteOff(): void {}

  accent(velocity: number): void {
    if (velocity > this.target || !this.attacking) this.target = Math.max(velocity, this.swell);
    this.attacking = true;
  }

  render(out: Float64Array, start: number, end: number, mod: ModFrame, outR?: Float64Array): void {
    const p = this.ctx.params;
    const oR = outR ?? out;
    if (p.attack !== this.kA) {
      this.kA = p.attack;
      this.attC = 1 - exp(-4 / Math.max(1, p.attack * SR));
    }
    if (p.release !== this.kR) {
      this.kR = p.release;
      this.relC = exp(-5 / Math.max(1, p.release * SR));
    }
    if (this.pitch < 0) this.pitch = mod.pitch;
    this.pitch += (mod.pitch - this.pitch) * 0.02;
    const secs = this.t / SR;
    const spread = p.spread;
    for (let n = 0; n < TONES; n++) {
      const hz = midiToHz(this.pitch + (mod.chord[n] ?? 0));
      for (let d = 0; d < UNISON; d++) {
        const k = n * UNISON + d;
        const wander = vnoise(this.ctx, 10 + k, secs * 0.07) * spread * 0.35;
        this.dt[k] = Math.min(0.45, (hz * exp2(((d - 1) * spread + wander) / 1200)) / SR);
      }
    }
    // Slow filter breathing (≈ 20 s cycle, seeded) plus the swell.
    const breath = vnoise(this.ctx, 30, secs * 0.05) * p.motion;
    const cutoff = p.tone * exp2(breath + this.swell * 0.8);
    this.svfL.set(cutoff, 0.12);
    this.svfR.copyCoefs(this.svfL);
    const floor = p.floor;
    const { ph, dt, attC, relC } = this;
    let { fade, swell, target, attacking } = this;
    for (let i = start; i < end; i++) {
      let xl = 0;
      let xr = 0;
      for (let k = 0; k < N; k++) {
        const pk = ph[k];
        const s = blepSaw(pk, dt[k]);
        const d = k % UNISON;
        xl += s * PAN_L[d];
        xr += s * PAN_R[d];
        const q = pk + dt[k];
        ph[k] = q >= 1 ? q - 1 : q;
      }
      if (attacking) {
        swell += (target - swell) * attC;
        if (swell >= target * 0.98) attacking = false;
      } else {
        swell *= relC;
      }
      if (fade < 1) fade += 1 / (6 * SR);
      const g = 0.075 * fade * (floor + (1 - floor) * swell);
      out[i] += this.svfL.lp(xl) * g;
      oR[i] += this.svfR.lp(xr) * g;
    }
    this.fade = fade;
    this.swell = swell;
    this.target = target;
    this.attacking = attacking;
    this.t += end - start;
  }
}

export const pad: SoundType = {
  id: 'pad',
  label: 'pad',
  mode: 'sustained',
  stereo: true,
  glyph: 'hexagon',
  maxVoices: 1,
  params: [
    { key: 'tone', label: 'tone', min: 100, max: 8000, default: 1100, curve: 'exp', unit: 'Hz' },
    { key: 'motion', label: 'filter breathing', min: 0, max: 2, default: 0.6, curve: 'lin', unit: 'oct' },
    { key: 'spread', label: 'detune', min: 0, max: 40, default: 14, curve: 'lin', unit: 'ct' },
    { key: 'attack', label: 'swell attack', min: 0.05, max: 12, default: 3, curve: 'exp', unit: 's' },
    { key: 'release', label: 'swell release', min: 0.1, max: 20, default: 8, curve: 'exp', unit: 's' },
    { key: 'floor', label: 'floor', min: 0, max: 1, default: 0.35, curve: 'lin' },
  ],
  panel: [
    { kind: 'knobs', title: 'oscillators', keys: ['spread'] },
    { kind: 'knobs', title: 'filter', keys: ['tone', 'motion'] },
    { kind: 'knobs', title: 'swell', keys: ['attack', 'release', 'floor'] },
  ],
  createVoice: (ctx) => new PadVoice(ctx),
};
