import type { FxType } from '../types.ts';
import { BLOCK } from '../constants.ts';
import { sinTurns, tanh } from '../dspmath.ts';
import { Fdn } from '../dsp/reverb.ts';

const WIN = 2048; // pitch-shifter grain window, ~43 ms
const SIZE = 4096;
const MASK = SIZE - 1;

/** Octave-up pitch shifter: two crossfaded taps sweeping through a delay line. */
class OctaveUp {
  private buf = new Float64Array(SIZE);
  private w = 0;
  private d = 0;
  run(x: number): number {
    this.buf[this.w & MASK] = x;
    // ratio 2: the tap delay shrinks by one sample per sample
    this.d -= 1;
    if (this.d < 0) this.d += WIN;
    const d2 = this.d + WIN / 2 >= WIN ? this.d - WIN / 2 : this.d + WIN / 2;
    const a = this.buf[(this.w - Math.floor(this.d) - 1) & MASK];
    const b = this.buf[(this.w - Math.floor(d2) - 1) & MASK];
    // sin² windows sum to one across the two taps
    const wa = sinTurns(this.d / WIN / 2);
    const wb = sinTurns(d2 / WIN / 2);
    this.w++;
    return a * wa * wa + b * wb * wb;
  }
}

/**
 * Shimmer reverb: the long modulated FDN with its own output pitched up an
 * octave and fed back in, so tails bloom upward. The feedback is soft-clipped
 * and runs one block late, which keeps the loop stable and simple.
 */
export const shimmer: FxType = {
  id: 'shimmer',
  label: 'shimmer',
  role: 'fx',
  kind: 'bus',
  shape: 'circle',
  glyph: '✦',
  defaultShape: { r: 230 },
  handles: [
    { key: 'size', label: 'size', default: 0.75, format: (v) => `${(1 + v * v * 24).toFixed(1)} s` },
    { key: 'shimmer', label: 'shimmer', default: 0.45, format: (v) => Math.round(v * 100) + '%' },
  ],
  createProcessor(ctx) {
    const fdn = new Fdn();
    const upL = new OctaveUp();
    const upR = new OctaveUp();
    const fbL = new Float64Array(BLOCK);
    const fbR = new Float64Array(BLOCK);
    let hpL = 0;
    let hpR = 0;
    return {
      stereo(l, r, n) {
        const amt = (ctx.handles.shimmer ?? 0.45) * 0.55;
        fdn.set(ctx.handles.size ?? 0.75, 0.5);
        for (let i = 0; i < n; i++) {
          l[i] += fbL[i] * amt;
          r[i] += fbR[i] * amt;
        }
        fdn.process(l, r, n);
        for (let i = 0; i < n; i++) {
          hpL += (l[i] - hpL) * 0.03;
          hpR += (r[i] - hpR) * 0.03;
          fbL[i] = tanh(upL.run(l[i] - hpL) * 1.5) / 1.5;
          fbR[i] = tanh(upR.run(r[i] - hpR) * 1.5) / 1.5;
        }
      },
    };
  },
};
