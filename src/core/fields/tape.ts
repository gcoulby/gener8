import type { FxType } from '../types.ts';
import { exp2, sinTurns, tanh } from '../dspmath.ts';
import { Xorshift } from '../rand.ts';

const SIZE = 2048;
const MASK = SIZE - 1;

/**
 * Worn tape, as an insert. Depth crossfades from clean to fully processed.
 * Age adds saturation, bandwidth loss and hiss together; wobble sets wow and
 * flutter on a short modulated delay. Stereo sounds get one processor per side
 * with the same transport, so the wobble stays coherent across the pair.
 */
export const tape: FxType = {
  id: 'tape',
  label: 'tape',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '▭',
  defaultShape: { r: 160 },
  handles: [
    { key: 'age', label: 'age', default: 0.5, format: (v) => Math.round(v * 100) + '%' },
    { key: 'wobble', label: 'wobble', default: 0.4, format: (v) => Math.round(v * 100) + '%' },
  ],
  createState: () => ({ made: 0 }),
  createProcessor(ctx) {
    const st = ctx.state as { made: number };
    const rng = new Xorshift();
    rng.seed(ctx.rand(9, st.made++ >> 1) * 4294967296); // a stereo pair shares a seed
    const buf = new Float64Array(SIZE);
    let w = 0;
    let wow = 0;
    let flut = 0;
    let lp = 0;
    let lp2 = 0;
    return {
      mono(x, n, depth) {
        const age = ctx.handles.age ?? 0.5;
        const wob = ctx.handles.wobble ?? 0.4;
        const drive = 1 + age * 3;
        const cut = 0.5 * exp2(-age * 2.6); // one-pole coefficient: ~16 kHz → ~3 kHz
        const hiss = age * age * 0.006;
        const wowD = wob * 18; // samples
        const flutD = wob * 1.2;
        for (let i = 0; i < n; i++) {
          buf[w & MASK] = x[i];
          wow += 0.55 / ctx.sr;
          if (wow >= 1) wow -= 1;
          flut += 7.3 / ctx.sr;
          if (flut >= 1) flut -= 1;
          const d = 40 + wowD * (1 + sinTurns(wow)) + flutD * (1 + sinTurns(flut));
          const rp = w - d;
          const i0 = Math.floor(rp);
          const fr = rp - i0;
          const a = buf[i0 & MASK];
          let y = a + (buf[(i0 + 1) & MASK] - a) * fr;
          y = tanh(y * drive) / drive + rng.next() * hiss;
          lp += (y - lp) * cut;
          lp2 += (lp - lp2) * cut;
          x[i] += (lp2 - x[i]) * depth;
          w++;
        }
        w &= MASK;
      },
    };
  },
};
