import type { TransformerType } from '../types.ts';

export function holdFactor(h: Record<string, number>, depth: number): number {
  return 1 + (h.length ?? 0.5) * 31 * depth;
}

/**
 * Stretches note gates so plucks and keys become long held swells. The length
 * handle sets the maximum stretch (up to 32×); depth scales it, so notes swell
 * longer the deeper a sound sits. Velocity softens slightly as notes lengthen.
 */
export const hold: TransformerType = {
  id: 'hold',
  label: 'hold',
  role: 'transformer',
  shape: 'circle',
  glyph: '⌒',
  defaultShape: { r: 130 },
  handles: [{ key: 'length', label: 'length', default: 0.5, format: (v) => `up to ${(1 + v * 31).toFixed(0)}×` }],
  transform(e, depth, ctx, out) {
    const k = holdFactor(ctx.handles, depth);
    out({ ...e, durTicks: e.durTicks * k, velocity: e.velocity * (1 - 0.15 * depth) });
  },
};
