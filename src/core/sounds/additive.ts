import type { ModFrame, SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp2, log2, midiToHz, sinTurns } from '../dspmath.ts';

const MAX = 16;
const LOG2K = Array.from({ length: MAX + 1 }, (_, k) => (k > 0 ? log2(k) : 0));

function vnoise(ctx: VoiceContext, stream: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = ctx.rand(stream, i);
  const b = ctx.rand(stream, i + 1);
  return (a + (b - a) * f * f * (3 - 2 * f)) * 2 - 1;
}

/**
 * Sustained partial bank: up to 16 harmonics with a spectral tilt (brightness),
 * odd/even balance (hollow), and slow per-partial shimmer. Partials alternate
 * left and right. Partials above Nyquist are dropped, so it never aliases.
 * Events briefly brighten the spectrum.
 */
class AdditiveVoice implements Voice {
  private ctx: VoiceContext;
  private ph = new Float64Array(MAX + 1);
  private amp = new Float64Array(MAX + 1);
  private ampPrev = new Float64Array(MAX + 1);
  private pitch = -1;
  private t = 0;
  private fade = 0;
  private glow = 0;
  private glowPeak = 0;
  readonly active = true;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
    for (let k = 1; k <= MAX; k++) this.ph[k] = ctx.rand(7, k);
  }

  noteOn(): void {}
  noteOff(): void {}

  accent(velocity: number): void {
    if (velocity > this.glowPeak) this.glowPeak = velocity;
  }

  render(out: Float64Array, start: number, end: number, mod: ModFrame, outR?: Float64Array): void {
    const p = this.ctx.params;
    const oR = outR ?? out;
    if (this.pitch < 0) this.pitch = mod.pitch;
    this.pitch += (mod.pitch - this.pitch) * 0.02;
    const hz = midiToHz(this.pitch);
    const n = Math.round(p.partials);
    const secs = this.t / SR;
    const tilt = Math.max(0, p.tilt - this.glow * 0.8);
    let norm = 0;
    for (let k = 1; k <= MAX; k++) {
      this.ampPrev[k] = this.amp[k];
      if (k > n || hz * k > SR * 0.45) {
        this.amp[k] = 0;
        continue;
      }
      let a = exp2(-tilt * LOG2K[k]);
      if (k % 2 === 0) a *= 1 - p.hollow;
      a *= 1 + p.shimmer * vnoise(this.ctx, 20 + k, secs * (0.05 + k * 0.011));
      this.amp[k] = a < 0 ? 0 : a;
      norm += this.amp[k];
    }
    const g = norm > 0 ? 0.14 / Math.sqrt(norm) : 0;
    const len = end - start;
    const { ph, amp, ampPrev } = this;
    let { fade, glow, glowPeak } = this;
    for (let k = 1; k <= MAX; k++) {
      const a1 = amp[k] * g;
      const a0 = ampPrev[k] * g;
      if (a0 === 0 && a1 === 0) continue;
      const inc = (hz * k) / SR;
      const da = (a1 - a0) / len;
      let a = a0;
      let q = ph[k];
      const toRight = k % 2 === 0;
      const main = toRight ? oR : out;
      const other = toRight ? out : oR;
      for (let i = start; i < end; i++) {
        const s = sinTurns(q) * a;
        main[i] += s * 0.85;
        other[i] += s * 0.35;
        a += da;
        q += inc;
        if (q >= 1) q -= 1;
      }
      ph[k] = q;
    }
    for (let i = start; i < end; i++) {
      if (fade < 1) fade += 1 / (5 * SR);
      glow += (glowPeak - glow) * 0.0004;
      glowPeak *= 0.99997;
    }
    // apply the fade-in once per segment (it only matters for the first seconds)
    if (fade < 1) {
      for (let i = start; i < end; i++) {
        out[i] *= fade;
        oR[i] *= fade;
      }
    }
    this.fade = fade;
    this.glow = glow;
    this.glowPeak = glowPeak;
    this.t += len;
  }
}

export const additive: SoundType = {
  id: 'additive',
  label: 'additive',
  mode: 'sustained',
  stereo: true,
  glyph: 'pentagon',
  maxVoices: 1,
  params: [
    { key: 'partials', label: 'partials', min: 2, max: 16, default: 12, curve: 'lin' },
    { key: 'tilt', label: 'darkness', min: 0, max: 3, default: 1.3, curve: 'lin' },
    { key: 'hollow', label: 'hollow (odd only)', min: 0, max: 1, default: 0.3, curve: 'lin' },
    { key: 'shimmer', label: 'shimmer', min: 0, max: 1, default: 0.6, curve: 'lin' },
  ],
  panel: [
    { kind: 'knobs', title: 'partials', keys: ['partials', 'shimmer'] },
    { kind: 'knobs', title: 'spectrum', keys: ['tilt', 'hollow'] },
  ],
  createVoice: (ctx) => new AdditiveVoice(ctx),
};
