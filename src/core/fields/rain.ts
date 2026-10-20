import type { GeneratorType } from '../types.ts';

const SLOT = 120; // ticks: a 1/32 note at 960 PPQ

export function rainPerBeat(h: Record<string, number>): number {
  const d = h.density ?? 0.3;
  return 0.05 + d * d * 3;
}

export function rainRange(h: Record<string, number>): number {
  return Math.round((h.range ?? 0.4) * 10);
}

/**
 * Sparse, off-grid droplets. Each 1/32 slot may hold one drop at a seeded
 * position inside the slot, so timing is free while staying deterministic.
 * Pitch is a seeded scale degree within ±range of the sound's root; depth sets
 * how often drops land on a sound and how hard.
 */
export const rain: GeneratorType = {
  id: 'rain',
  label: 'rain',
  role: 'generator',
  shape: 'circle',
  glyph: '∴',
  defaultShape: { r: 180 },
  handles: [
    { key: 'density', label: 'density', default: 0.3, format: (_v, h) => `${rainPerBeat(h).toFixed(2)} / beat` },
    { key: 'range', label: 'range', default: 0.4, format: (_v, h) => `±${rainRange(h)} deg` },
  ],
  schedule(ctx, t0, t1, members, emit) {
    const perSlot = rainPerBeat(ctx.handles) / (ctx.ppq / SLOT);
    const range = rainRange(ctx.handles);
    for (let s = Math.floor(t0 / SLOT); s * SLOT < t1; s++) {
      for (const m of members) {
        const h = m.soundHash;
        if (ctx.rand(h, s * 4) >= perSlot * (0.3 + 0.7 * m.depth)) continue;
        const tick = s * SLOT + ctx.rand(h, s * 4 + 1) * SLOT;
        if (tick < t0 || tick >= t1) continue;
        const deg = Math.round((ctx.rand(h, s * 4 + 2) * 2 - 1) * range);
        const vel = (0.25 + 0.5 * ctx.rand(h, s * 4 + 3)) * (0.5 + 0.5 * m.depth);
        emit(m.soundId, tick, deg, vel, ctx.ppq);
      }
    }
  },
};
