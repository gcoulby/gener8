import type { GeneratorType } from '../types.ts';

// Chord tones stacked in thirds, in scale degrees: root, 3rd, 5th, 7th, octave, 10th, 12th, 14th.
const THIRDS = [0, 2, 4, 6, 7, 9, 11, 13];
const RATES = [0.25, 0.5, 1, 2, 3, 4];
const RATE_LABELS = ['1 / bar', '1 / 2 beats', '1 / beat', '2 / beat', '3 / beat', '4 / beat'];

export function arpRate(h: Record<string, number>): number {
  return RATES[Math.round((h.rate ?? 0.4) * (RATES.length - 1))];
}

export function arpSpan(h: Record<string, number>): number {
  return 3 + Math.round((h.span ?? 0.4) * (THIRDS.length - 3));
}

/** Up-and-down pattern over the first `span` chord tones, e.g. 0 2 4 6 4 2. */
function pattern(span: number): number[] {
  const up = THIRDS.slice(0, span);
  return up.concat(up.slice(1, -1).reverse());
}

/**
 * Slow chord-tone arpeggio in the sound's register. Each sound's angle offsets
 * where it starts in the pattern; depth sets how often a step plays (and how
 * loud), so sounds near the edge play sparse, seeded fragments.
 */
export const arp: GeneratorType = {
  id: 'arp',
  label: 'arp',
  role: 'generator',
  shape: 'circle',
  glyph: '⋰',
  defaultShape: { r: 170 },
  handles: [
    { key: 'rate', label: 'rate', default: 0.4, format: (_v, h) => RATE_LABELS[Math.round((h.rate ?? 0.4) * (RATES.length - 1))] },
    { key: 'span', label: 'span', default: 0.4, format: (_v, h) => `${arpSpan(h)} tones` },
  ],
  schedule(ctx, t0, t1, members, emit) {
    const stepT = ctx.ppq / arpRate(ctx.handles);
    const seq = pattern(arpSpan(ctx.handles));
    const len = seq.length;
    for (let s = Math.ceil(t0 / stepT); s * stepT < t1; s++) {
      for (const m of members) {
        const p = 0.3 + 0.7 * m.depth;
        if (ctx.rand(m.soundHash, s) >= p) continue;
        const off = Math.floor(m.angle * len);
        const deg = seq[(((s + off) % len) + len) % len];
        const vel = 0.3 + 0.45 * m.depth + (deg === 0 ? 0.1 : 0);
        emit(m.soundId, s * stepT, deg, vel, stepT * 1.6);
      }
    }
  },
};
