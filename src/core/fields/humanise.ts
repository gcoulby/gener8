import type { TransformerType } from '../types.ts';
import { strHash } from '../rand.ts';

/**
 * Loosens events: a seeded late push in time (up to a 1/16 at full depth and
 * timing) and seeded velocity variation. Depth scales both.
 */
export const humanise: TransformerType = {
  id: 'humanise',
  label: 'humanise',
  role: 'transformer',
  shape: 'circle',
  glyph: '~',
  defaultShape: { r: 130 },
  handles: [
    { key: 'timing', label: 'timing', default: 0.5, format: (v) => `≤ ${Math.round(v * 240)} ticks late` },
    { key: 'dynamics', label: 'dynamics', default: 0.5, format: (v) => `±${Math.round(v * 50)}%` },
  ],
  transform(e, depth, ctx, out) {
    const h = strHash(e.soundId);
    const k = Math.floor(e.tick) * 3 + e.chain;
    const late = ctx.rand(h, k) * (ctx.handles.timing ?? 0.5) * 240 * depth;
    const dv = (ctx.rand(h, k + 1) * 2 - 1) * (ctx.handles.dynamics ?? 0.5) * 0.5 * depth;
    out({ ...e, tick: e.tick + late, velocity: Math.min(1, Math.max(0.05, e.velocity * (1 + dv))) });
  },
};
