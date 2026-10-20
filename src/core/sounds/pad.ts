import type { ModFrame, SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp, exp2, midiToHz } from '../dspmath.ts';
import { blepSaw } from '../dsp/blep.ts';
import { Svf } from '../dsp/svf.ts';

/** Sustained chord of detuned saws. Events become slow swells. */
class PadVoice implements Voice {
  private ctx: VoiceContext;
  private svf = new Svf();
  private ph = new Float64Array(9);
  private dt = new Float64Array(9);
  private pitch = -1;
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
    for (let i = 0; i < 9; i++) this.ph[i] = ctx.rand(3, i);
  }

  noteOn(): void {}
  noteOff(): void {}

  accent(velocity: number): void {
    if (velocity > this.target || !this.attacking) this.target = Math.max(velocity, this.swell);
    this.attacking = true;
  }

  render(out: Float64Array, start: number, end: number, mod: ModFrame): void {
    const p = this.ctx.params;
    if (p.attack !== this.kA) {
      this.kA = p.attack;
      this.attC = 1 - exp(-4 / Math.max(1, p.attack * SR));
    }
    if (p.release !== this.kR) {
      this.kR = p.release;
      this.relC = exp(-5 / Math.max(1, p.release * SR));
    }
    if (this.pitch < 0) this.pitch = mod.pitch;
    this.pitch += (mod.pitch - this.pitch) * 0.05;
    const spread = p.spread;
    for (let n = 0; n < 3; n++) {
      const hz = midiToHz(this.pitch + (mod.chord[n] ?? 0));
      for (let d = 0; d < 3; d++) {
        this.dt[n * 3 + d] = Math.min(0.45, (hz * exp2(((d - 1) * spread) / 1200)) / SR);
      }
    }
    this.svf.set(p.tone * (1 + this.swell), 0.1);
    const floor = p.floor;
    const { ph, dt, attC, relC } = this;
    let { fade, swell, target, attacking } = this;
    for (let i = start; i < end; i++) {
      let x = 0;
      for (let k = 0; k < 9; k++) {
        const pk = ph[k];
        x += blepSaw(pk, dt[k]);
        const q = pk + dt[k];
        ph[k] = q >= 1 ? q - 1 : q;
      }
      if (attacking) {
        swell += (target - swell) * attC;
        if (swell >= target * 0.98) attacking = false;
      } else {
        swell *= relC;
      }
      if (fade < 1) fade += 1 / (4 * SR);
      out[i] += this.svf.lp(x * 0.111) * 0.24 * fade * (floor + (1 - floor) * swell);
    }
    this.fade = fade;
    this.swell = swell;
    this.target = target;
    this.attacking = attacking;
  }
}

export const pad: SoundType = {
  id: 'pad',
  label: 'pad',
  mode: 'sustained',
  glyph: 'hexagon',
  maxVoices: 1,
  params: [
    { key: 'tone', label: 'tone', min: 100, max: 8000, default: 1400, curve: 'exp', unit: 'Hz' },
    { key: 'spread', label: 'detune', min: 0, max: 40, default: 12, curve: 'lin', unit: 'ct' },
    { key: 'attack', label: 'swell attack', min: 0.05, max: 6, default: 1.2, curve: 'exp', unit: 's' },
    { key: 'release', label: 'swell release', min: 0.1, max: 10, default: 3, curve: 'exp', unit: 's' },
    { key: 'floor', label: 'floor', min: 0, max: 1, default: 0.15, curve: 'lin' },
  ],
  panel: [
    { kind: 'knobs', title: 'oscillators', keys: ['spread'] },
    { kind: 'knobs', title: 'filter', keys: ['tone'] },
    { kind: 'knobs', title: 'swell', keys: ['attack', 'release', 'floor'] },
  ],
  createVoice: (ctx) => new PadVoice(ctx),
};
