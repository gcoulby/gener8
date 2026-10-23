import type { ModFrame, SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp, midiToHz, sinTurns } from '../dspmath.ts';

/** Partial ratios of a singing bowl (measured bowls run close to these). */
const RATIOS = [1, 2.71, 5.15, 8.17, 11.7];
const N = RATIOS.length;

/**
 * A singing bowl: inharmonic partials, each a pair of sines a little apart so
 * they beat slowly, the bowl's wobble. Rubbing keeps it sounding; each event
 * strikes it, ringing out over the decay time. Brightness lifts the upper
 * partials.
 */
class BowlVoice implements Voice {
  private ctx: VoiceContext;
  private ph = new Float64Array(N * 2);
  private ring = 0;
  private pitch = -1;
  private fade = 0;
  readonly active = true;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
    for (let i = 0; i < N * 2; i++) this.ph[i] = ctx.rand(3, i);
  }

  noteOn(): void {}
  noteOff(): void {}

  accent(velocity: number): void {
    this.ring = Math.min(1.5, this.ring + velocity);
  }

  render(out: Float64Array, start: number, end: number, mod: ModFrame, outR?: Float64Array): void {
    const p = this.ctx.params;
    const oR = outR ?? out;
    if (this.pitch < 0) this.pitch = mod.pitch;
    this.pitch += (mod.pitch - this.pitch) * 0.02;
    const hz = midiToHz(this.pitch);
    const ph = this.ph;
    const decay = exp(-1 / (Math.max(0.2, p.decay) * SR));
    let ring = this.ring;
    let fade = this.fade;
    for (let i = start; i < end; i++) {
      let l = 0;
      let r = 0;
      const level = p.rub * 0.5 + ring;
      for (let k = 0; k < N; k++) {
        const f = hz * RATIOS[k];
        if (f > SR * 0.45) break;
        const a = (k === 0 ? 1 : p.brightness * (0.9 / (k + 0.5))) * level;
        // the pair: one a little flat, one a little sharp, panned apart
        const beat = p.beat * (1 + k * 0.4);
        const d0 = (f - beat * 0.5) / SR;
        const d1 = (f + beat * 0.5) / SR;
        const x0 = sinTurns(ph[k * 2]) * a;
        const x1 = sinTurns(ph[k * 2 + 1]) * a;
        ph[k * 2] += d0;
        if (ph[k * 2] >= 1) ph[k * 2] -= 1;
        ph[k * 2 + 1] += d1;
        if (ph[k * 2 + 1] >= 1) ph[k * 2 + 1] -= 1;
        l += x0 * 0.8 + x1 * 0.2;
        r += x1 * 0.8 + x0 * 0.2;
      }
      ring *= decay;
      if (fade < 1) fade += 1 / (3 * SR);
      const g = 0.12 * fade;
      out[i] += l * g;
      oR[i] += r * g;
    }
    this.ring = ring;
    this.fade = fade;
  }
}

export const bowl: SoundType = {
  id: 'bowl',
  label: 'bowl',
  mode: 'sustained',
  stereo: true,
  glyph: 'cup',
  maxVoices: 1,
  params: [
    { key: 'rub', label: 'rub', min: 0, max: 1, default: 0.5, curve: 'lin' },
    { key: 'beat', label: 'beating', min: 0.1, max: 6, default: 1.2, curve: 'exp', unit: 'Hz' },
    { key: 'brightness', label: 'brightness', min: 0, max: 1, default: 0.5, curve: 'lin' },
    { key: 'decay', label: 'strike decay', min: 0.5, max: 30, default: 8, curve: 'exp', unit: 's' },
  ],
  panel: [
    { kind: 'knobs', title: 'bowl', keys: ['rub', 'beat', 'brightness'] },
    { kind: 'knobs', title: 'strike', keys: ['decay'] },
  ],
  createVoice: (ctx) => new BowlVoice(ctx),
};
