import type { GeneratorType } from '../types.ts';

const PERIODS = [2, 4, 8, 16, 32]; // beats
const CHORD = [0, 2, 4, 6, 7, 9]; // root, 3rd, 5th, 7th, octave, 10th (scale degrees)

export function strumPeriod(h: Record<string, number>): number {
  return PERIODS[Math.round((h.every ?? 0.5) * (PERIODS.length - 1))];
}

export function strumGap(h: Record<string, number>): number {
  return Math.round((h.spread ?? 0.4) * 240); // ticks between strings, up to a 1/16
}

/**
 * Every few bars, a slow strummed chord on each sound, built in thirds from its
 * root. Depth sets how many strings ring (3 at the edge to 6 at the centre).
 * Angle offsets each sound's strum within the period, so sounds take turns.
 */
export const strum: GeneratorType = {
  id: 'strum',
  label: 'strum',
  role: 'generator',
  shape: 'circle',
  glyph: '⫼',
  defaultShape: { r: 160 },
  handles: [
    { key: 'every', label: 'every', default: 0.5, format: (_v, h) => `${strumPeriod(h)} beats` },
    { key: 'spread', label: 'strum', default: 0.4, format: (_v, h) => (strumGap(h) === 0 ? 'block chord' : `${strumGap(h)} ticks / string`) },
  ],
  schedule(ctx, t0, t1, members, emit) {
    const period = strumPeriod(ctx.handles) * ctx.ppq;
    const gap = strumGap(ctx.handles);
    for (const m of members) {
      const strings = 3 + Math.round(m.depth * 3);
      const offset = Math.floor(m.angle * strumPeriod(ctx.handles)) * ctx.ppq;
      // any strum whose strings could land in this window
      const first = Math.floor((t0 - offset - strings * gap) / period);
      for (let k = Math.max(0, first); k * period + offset < t1; k++) {
        const base = k * period + offset;
        for (let i = 0; i < strings; i++) {
          const tick = base + i * gap;
          if (tick < t0 || tick >= t1) continue;
          const vel = (0.35 + 0.4 * m.depth) * (1 - i * 0.07);
          emit(m.soundId, tick, CHORD[i], vel, period * 0.9);
        }
      }
    }
  },
};
