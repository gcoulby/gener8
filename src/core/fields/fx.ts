import type { FxType } from '../types.ts';
import { exp2, log2, tanh } from '../dspmath.ts';
import { Svf } from '../dsp/svf.ts';
import { Fdn } from '../dsp/reverb.ts';
import { TapeDelay } from '../dsp/delay.ts';

const pct = (v: number) => Math.round(v * 100) + '%';

export function filterCutoffHz(h: Record<string, number>): number {
  return 60 * exp2((h.cutoff ?? 0.3) * 8);
}

const OPEN_LOG = log2(18000);

/** Insert: depth sweeps from fully open at the edge to the character cutoff at the centre. */
export const filter: FxType = {
  id: 'filter',
  label: 'filter',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '∿',
  defaultShape: { r: 140 },
  handles: [
    { key: 'cutoff', label: 'cutoff', default: 0.3, format: (_v, h) => Math.round(filterCutoffHz(h)) + ' Hz' },
    { key: 'res', label: 'resonance', default: 0.4, format: pct },
  ],
  createProcessor(ctx) {
    const svf = new Svf();
    let kCut = -1;
    let cutLog = 0;
    return {
      mono(buf, n, depth) {
        const c = ctx.handles.cutoff ?? 0.3;
        if (c !== kCut) {
          kCut = c;
          cutLog = log2(filterCutoffHz(ctx.handles));
        }
        svf.set(exp2(OPEN_LOG + (cutLog - OPEN_LOG) * depth), (ctx.handles.res ?? 0.4) * 0.95 * depth);
        for (let i = 0; i < n; i++) buf[i] = svf.lp(buf[i]);
      },
    };
  },
};

const DELAY_BEATS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const DELAY_LABELS = ['1/8', '3/16', '1/4', '3/8', '1/2', '3/4', '1 bar'];

export function delayIndex(h: Record<string, number>): number {
  return Math.round((h.time ?? 0.5) * (DELAY_BEATS.length - 1));
}

export const delay: FxType = {
  id: 'delay',
  label: 'tape delay',
  role: 'fx',
  kind: 'bus',
  shape: 'circle',
  glyph: '⋯',
  defaultShape: { r: 160 },
  handles: [
    { key: 'time', label: 'time', default: 0.5, format: (_v, h) => DELAY_LABELS[delayIndex(h)] },
    { key: 'feedback', label: 'feedback', default: 0.55, format: pct },
  ],
  createProcessor(ctx) {
    const tape = new TapeDelay();
    return {
      stereo(l, r, n) {
        const beats = DELAY_BEATS[delayIndex(ctx.handles)];
        tape.process(l, r, n, (beats * 60 * ctx.sr) / ctx.tempo, (ctx.handles.feedback ?? 0.55) * 0.97, 0.35);
      },
    };
  },
};

export const reverb: FxType = {
  id: 'reverb',
  label: 'reverb',
  role: 'fx',
  kind: 'bus',
  shape: 'circle',
  glyph: '◌',
  defaultShape: { r: 220 },
  handles: [
    { key: 'size', label: 'size', default: 0.7, format: (v) => `${(1 + v * v * 24).toFixed(1)} s` },
    { key: 'damping', label: 'damping', default: 0.4, format: pct },
  ],
  createProcessor(ctx) {
    const fdn = new Fdn();
    return {
      stereo(l, r, n) {
        fdn.set(ctx.handles.size ?? 0.7, ctx.handles.damping ?? 0.4);
        fdn.process(l, r, n);
      },
    };
  },
};

const SPRING_STAGES = 12;

/** Loop delay of a spring in seconds: tighter springs are shorter. */
export function springDelay(h: Record<string, number>): number {
  return 0.07 - (h.tension ?? 0.5) * 0.035;
}

/**
 * Bus: a spring tank, two springs (one per side) of slightly different
 * lengths. Each is a feedback delay with a chain of allpass filters inside, so
 * every pass smears the highs out behind the lows: the boing and the chirping
 * drip. Tension sets the springs' length; drip, how much they disperse.
 */
export const spring: FxType = {
  id: 'spring',
  label: 'spring',
  role: 'fx',
  kind: 'bus',
  shape: 'circle',
  glyph: '§',
  defaultShape: { r: 200 },
  handles: [
    { key: 'tension', label: 'tension', default: 0.5, format: (_v, h) => `${Math.round(springDelay(h) * 1000)} ms` },
    { key: 'drip', label: 'drip', default: 0.5, format: pct },
  ],
  createProcessor(ctx) {
    const SIZE = 4096;
    const MASK = SIZE - 1;
    const lines = [new Float64Array(SIZE), new Float64Array(SIZE)];
    const ap = [new Float64Array(SPRING_STAGES), new Float64Array(SPRING_STAGES)];
    const lp = [0, 0];
    const hp = [0, 0];
    let w = 0;
    return {
      stereo(l, r, n) {
        const a = -(0.3 + (ctx.handles.drip ?? 0.5) * 0.5);
        const d0 = springDelay(ctx.handles) * ctx.sr;
        const lens = [Math.floor(d0), Math.floor(d0 * 1.13)];
        for (let i = 0; i < n; i++) {
          const x = (l[i] + r[i]) * 0.35;
          for (let s = 0; s < 2; s++) {
            const line = lines[s];
            const z = ap[s];
            const back = line[(w - lens[s]) & MASK];
            lp[s] += (back - lp[s]) * 0.35;
            let y = x + tanh(lp[s] * 0.82);
            for (let k = 0; k < SPRING_STAGES; k++) {
              const v = a * y + z[k];
              z[k] = y - a * v;
              y = v;
            }
            line[w & MASK] = y;
            // springs are thin: lose the lows on the way out
            hp[s] += (y - hp[s]) * 0.02;
            if (s === 0) l[i] = y - hp[s];
            else r[i] = y - hp[s];
          }
          w++;
        }
        w &= MASK;
      },
    };
  },
};
