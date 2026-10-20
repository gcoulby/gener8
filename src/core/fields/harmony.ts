import type { TransformerType } from '../types.ts';
import { indexToMidi, nearestIndex } from '../music.ts';

const INTERVALS = [2, 3, 4, 5, 7]; // scale degrees: 3rd, 4th, 5th, 6th, octave
const LABELS = ['3rds', '4ths', '5ths', '6ths', 'octaves'];

export function harmonyInterval(h: Record<string, number>): number {
  return Math.round((h.interval ?? 0) * (INTERVALS.length - 1));
}

/**
 * Adds in-key parallel voices above each note, stacked by the chosen interval.
 * Depth sets how many: one voice at the edge, up to three at the centre
 * (so 3rds at full depth make a 7th chord).
 */
export const harmony: TransformerType = {
  id: 'harmony',
  label: 'harmony',
  role: 'transformer',
  shape: 'circle',
  glyph: '⊕',
  defaultShape: { r: 120 },
  handles: [
    { key: 'interval', label: 'stack', default: 0, format: (_v, h) => LABELS[harmonyInterval(h)] },
    { key: 'level', label: 'level', default: 0.7, format: (v) => Math.round(v * 100) + '%' },
  ],
  transform(e, depth, ctx, out) {
    out(e);
    const step = INTERVALS[harmonyInterval(ctx.handles)];
    const voices = 1 + Math.round(depth * 2);
    const idx = nearestIndex(e.pitch, ctx.keyRoot, ctx.steps);
    const level = ctx.handles.level ?? 0.7;
    for (let v = 1; v <= voices; v++) {
      out({ ...e, pitch: indexToMidi(idx + v * step, ctx.keyRoot, ctx.steps), velocity: e.velocity * level * (1 - v * 0.1) });
    }
  },
};
