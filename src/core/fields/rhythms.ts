// Generators whose timing comes from where a sound sits: loops that phase
// against each other, a sweeping line, bouncing balls and polyrhythms.

import type { GeneratorType } from '../types.ts';

const pct = (v: number) => Math.round(v * 100) + '%';
const pick = <T>(xs: T[], v: number | undefined, fallback: number): T => xs[Math.round((v ?? fallback) * (xs.length - 1))];

// ---------- phase: loops of different lengths drifting in and out of step ----------

const PHASE_BASE = 16; // 16ths: a one-bar loop at the centre

export function phaseNotes(h: Record<string, number>): number {
  return 2 + Math.round((h.motif ?? 0.33) * 6);
}

/** Loop length in 16ths for a sound at `depth`: one bar at the centre, up to four at the edge. */
export function phaseLoop(h: Record<string, number>, depth: number): number {
  return PHASE_BASE + Math.round((1 - depth) * (h.spread ?? 0.5) * 3 * PHASE_BASE);
}

/**
 * Each sound loops a short seeded motif. Its distance from the centre sets the
 * loop's length, so loops at different distances drift in and out of phase,
 * as in Music for Airports. The motif keeps its shape as the loop stretches.
 */
export const phase: GeneratorType = {
  id: 'phase',
  label: 'phase',
  role: 'generator',
  shape: 'circle',
  glyph: '⟲',
  defaultShape: { r: 180 },
  handles: [
    { key: 'motif', label: 'motif', default: 0.33, format: (_v, h) => `${phaseNotes(h)} notes` },
    { key: 'spread', label: 'spread', default: 0.5, format: (_v, h) => `1–${(phaseLoop(h, 0) / PHASE_BASE).toFixed(2).replace(/\.?0+$/, '')} bars` },
  ],
  schedule(ctx, t0, t1, members, emit) {
    const step = ctx.ppq / 4;
    const n = phaseNotes(ctx.handles);
    for (let s = Math.ceil(t0 / step); s * step < t1; s++) {
      for (const m of members) {
        const len = phaseLoop(ctx.handles, m.depth);
        const at = s % len;
        for (let j = 0; j < n; j++) {
          // note j sits at a seeded fraction of the loop, so stretching keeps the motif's shape
          if (Math.floor(((j + ctx.rand(m.soundHash, j * 2)) / n) * len) !== at) continue;
          const deg = Math.floor(ctx.rand(m.soundHash, j * 2 + 1) * 7) - 2;
          emit(m.soundId, s * step, deg, (0.35 + 0.4 * m.depth) * (j === 0 ? 1 : 0.85), ctx.ppq);
        }
      }
    }
  },
};

// ---------- wave: a line sweeping across ----------

const WAVE_BEATS = [1, 2, 4, 8, 16];

export function wavePeriod(h: Record<string, number>): number {
  return pick(WAVE_BEATS, h.period, 0.5);
}

export function waveReturns(h: Record<string, number>): boolean {
  return (h.back ?? 0) >= 0.5;
}

/** Where the line is at `tick`, from the left edge (0) to the right (1). */
export function waveAt(h: Record<string, number>, ppq: number, tick: number): number {
  let u = tick / (wavePeriod(h) * ppq);
  u -= Math.floor(u);
  if (!waveReturns(h)) return u;
  return u < 0.5 ? u * 2 : 2 - u * 2;
}

/** A vertical line sweeps left to right (and back) across the field, firing each sound it passes. */
export const wave: GeneratorType = {
  id: 'wave',
  label: 'wave',
  role: 'generator',
  shape: 'rect',
  glyph: '⫽',
  defaultShape: { w: 320, h: 180 },
  handles: [
    { key: 'period', label: 'period', default: 0.5, format: (_v, h) => `${wavePeriod(h)} beats` },
    { key: 'back', label: 'sweep', default: 0, format: (_v, h) => (waveReturns(h) ? 'there and back' : 'one way') },
  ],
  schedule(ctx, t0, t1, members, emit) {
    const P = wavePeriod(ctx.handles) * ctx.ppq;
    const back = waveReturns(ctx.handles);
    for (const m of members) {
      const f = Math.min(0.999, Math.max(0, m.lx / ctx.w + 0.5));
      // phases within one period at which the line is over this sound
      const hits = back ? [f / 2, 1 - f / 2] : [f];
      for (const h of hits) {
        for (let k = Math.ceil(t0 / P - h); (k + h) * P < t1; k++) {
          const tick = (k + h) * P;
          if (tick >= t0) emit(m.soundId, tick, 0, 0.35 + 0.55 * m.depth, ctx.ppq / 2);
        }
      }
    }
  },
};

// ---------- bounce: a dropped-ball rhythm ----------

const BOUNCE_EVERY = [2, 4, 8, 16];

export function bounceEvery(h: Record<string, number>): number {
  return pick(BOUNCE_EVERY, h.every, 0.33);
}

export function bounceRatio(h: Record<string, number>): number {
  return 0.45 + 0.4 * (h.bounce ?? 0.5);
}

/**
 * Every few beats, each sound plays a bouncing ball: repeats that come faster
 * and softer until they settle. Depth sets the height of the drop (the first
 * gap); angle offsets each sound's drop, so they take turns.
 */
export const bounce: GeneratorType = {
  id: 'bounce',
  label: 'bounce',
  role: 'generator',
  shape: 'circle',
  glyph: '⦿',
  defaultShape: { r: 150 },
  handles: [
    { key: 'every', label: 'every', default: 0.33, format: (_v, h) => `${bounceEvery(h)} beats` },
    { key: 'bounce', label: 'bounciness', default: 0.5, format: pct },
  ],
  schedule(ctx, t0, t1, members, emit) {
    const every = bounceEvery(ctx.handles);
    const period = every * ctx.ppq;
    const ratio = bounceRatio(ctx.handles);
    const minGap = ctx.ppq / 16;
    for (const m of members) {
      const gap0 = ctx.ppq * (0.35 + 0.65 * m.depth);
      const span = gap0 / (1 - ratio);
      const offset = Math.floor(m.angle * every) * ctx.ppq;
      for (let k = Math.max(0, Math.floor((t0 - offset - span) / period)); k * period + offset < t1; k++) {
        let tick = k * period + offset;
        let gap = gap0;
        let vel = 0.4 + 0.5 * m.depth;
        for (let i = 0; i < 16 && gap >= minGap; i++) {
          if (tick >= t0 && tick < t1) emit(m.soundId, tick, 0, vel, Math.min(gap, ctx.ppq) * 0.9);
          tick += gap;
          gap *= ratio;
          vel *= 0.8;
        }
      }
    }
  },
};

// ---------- polyrhythm: depth picks the subdivision ----------

const POLY_CYCLE = [2, 3, 4, 6, 8];

export function polyCycle(h: Record<string, number>): number {
  return pick(POLY_CYCLE, h.cycle, 0.5);
}

export function polyMax(h: Record<string, number>): number {
  return 3 + Math.round((h.max ?? 0.5) * 6);
}

/** Beats per cycle split this many ways for a sound at `depth`: 2 at the edge, up to `max` at the centre. */
export function polyDivision(h: Record<string, number>, depth: number): number {
  return 2 + Math.round(depth * (polyMax(h) - 2));
}

/**
 * One cycle, divided differently for each sound: the deeper it sits, the more
 * evenly spaced hits per cycle, so 3 plays against 4 against 5. Each cycle's
 * first hit is accented; angle rotates where a sound's hits fall.
 */
export const poly: GeneratorType = {
  id: 'poly',
  label: 'polyrhythm',
  role: 'generator',
  shape: 'circle',
  glyph: '⁂',
  defaultShape: { r: 170 },
  handles: [
    { key: 'cycle', label: 'cycle', default: 0.5, format: (_v, h) => `${polyCycle(h)} beats` },
    { key: 'max', label: 'up to', default: 0.5, format: (_v, h) => `${polyMax(h)} per cycle` },
  ],
  schedule(ctx, t0, t1, members, emit) {
    const cycle = polyCycle(ctx.handles) * ctx.ppq;
    for (const m of members) {
      const n = polyDivision(ctx.handles, m.depth);
      const gap = cycle / n;
      const offset = m.angle * gap;
      for (let k = Math.ceil((t0 - offset) / gap); k * gap + offset < t1; k++) {
        const down = ((k % n) + n) % n === 0;
        emit(m.soundId, k * gap + offset, 0, (0.35 + 0.35 * m.depth) * (down ? 1.25 : 1), Math.min(gap, ctx.ppq) * 0.8);
      }
    }
  },
};
