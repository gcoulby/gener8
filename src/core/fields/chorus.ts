import type { FxType } from '../types.ts';
import { sinTurns } from '../dspmath.ts';

const SIZE = 4096;
const MASK = SIZE - 1;
const TAPS = 3;

/**
 * Ensemble chorus as a send bus (the dry signal stays on the main path, so
 * the bus adds the moving copies). Three modulated taps per side, the right
 * side a half-cycle out of phase with the left for width.
 */
export const chorus: FxType = {
  id: 'chorus',
  label: 'chorus',
  role: 'fx',
  kind: 'bus',
  shape: 'circle',
  glyph: '◎',
  defaultShape: { r: 170 },
  handles: [
    { key: 'rate', label: 'rate', default: 0.35, format: (v) => `${(0.1 + v * 1.4).toFixed(2)} Hz` },
    { key: 'depth', label: 'depth', default: 0.5, format: (v) => `${(1 + v * 7).toFixed(1)} ms` },
  ],
  createProcessor(ctx) {
    const bl = new Float64Array(SIZE);
    const br = new Float64Array(SIZE);
    let w = 0;
    let ph = 0;
    const read = (b: Float64Array, pos: number) => {
      const i0 = Math.floor(pos);
      const fr = pos - i0;
      const a = b[i0 & MASK];
      return a + (b[(i0 + 1) & MASK] - a) * fr;
    };
    return {
      stereo(l, r, n) {
        const rate = 0.1 + (ctx.handles.rate ?? 0.35) * 1.4;
        const depth = ((1 + (ctx.handles.depth ?? 0.5) * 7) / 1000) * ctx.sr;
        const base = 0.012 * ctx.sr;
        const inc = rate / ctx.sr;
        for (let i = 0; i < n; i++) {
          bl[w & MASK] = l[i];
          br[w & MASK] = r[i];
          let ol = 0;
          let or = 0;
          for (let k = 0; k < TAPS; k++) {
            const pk = ph + k / TAPS;
            ol += read(bl, w - base - depth * (1 + sinTurns(pk)) * 0.5);
            or += read(br, w - base - depth * (1 + sinTurns(pk + 0.5)) * 0.5);
          }
          l[i] = ol * 0.45;
          r[i] = or * 0.45;
          w++;
          ph += inc;
          if (ph >= 1) ph -= 1;
        }
        w &= MASK;
      },
    };
  },
};
