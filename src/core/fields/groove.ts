// Transformers that shape time and weight rather than pitch: swing, accents
// and a density limit.

import type { TransformerType } from '../types.ts';
import { strHash } from '../rand.ts';

const SWING_GRID = [480, 240];
const SWING_LABELS = ['1/8', '1/16'];

export function swingGrid(h: Record<string, number>): number {
  return SWING_GRID[Math.round((h.grid ?? 1) * (SWING_GRID.length - 1))];
}

/**
 * Pushes the off-beats of each pair late. The pair is remapped piecewise so
 * nothing moves earlier: the off-beat goes from halfway to up to 75% of the
 * pair at full amount and depth, and everything between follows linearly.
 */
export const swing: TransformerType = {
  id: 'swing',
  label: 'swing',
  role: 'transformer',
  shape: 'circle',
  glyph: '♩',
  defaultShape: { r: 130 },
  handles: [
    { key: 'amount', label: 'amount', default: 0.5, format: (v) => `${Math.round(50 + v * 25)}%` },
    { key: 'grid', label: 'grid', default: 1, format: (_v, h) => SWING_LABELS[SWING_GRID.indexOf(swingGrid(h))] },
  ],
  transform(e, depth, ctx, out) {
    const g = swingGrid(ctx.handles);
    const k = (ctx.handles.amount ?? 0.5) * depth * 0.5;
    if (k <= 0) return out(e);
    const pair = Math.floor(e.tick / (2 * g)) * 2 * g;
    const pos = e.tick - pair;
    const mid = g * (1 + k);
    const moved = pos < g ? (pos / g) * mid : mid + ((pos - g) / g) * (2 * g - mid);
    out({ ...e, tick: pair + moved });
  },
};

export function accentEvery(h: Record<string, number>): number {
  return 2 + Math.round((h.every ?? 0.33) * 6);
}

/**
 * Weights a grid of 16ths: notes nearest every Nth step get louder, the rest
 * softer, so a flat pattern finds a downbeat. Depth scales the strength.
 */
export const accent: TransformerType = {
  id: 'accent',
  label: 'accent',
  role: 'transformer',
  shape: 'circle',
  glyph: '>',
  defaultShape: { r: 120 },
  handles: [
    { key: 'every', label: 'every', default: 0.33, format: (_v, h) => `${accentEvery(h)} × 1/16` },
    { key: 'strength', label: 'strength', default: 0.6, format: (v) => Math.round(v * 100) + '%' },
  ],
  transform(e, depth, ctx, out) {
    const s = (ctx.handles.strength ?? 0.6) * depth;
    const step = Math.round(e.tick / (ctx.ppq / 4));
    const on = step % accentEvery(ctx.handles) === 0;
    const v = on ? e.velocity * (1 + s * 0.6) : e.velocity * (1 - s * 0.55);
    out({ ...e, velocity: v > 1 ? 1 : v < 0.05 ? 0.05 : v });
  },
};

const THROTTLE_BEATS = [0.5, 1, 2, 4];
const THROTTLE_LABELS = ['1/8', 'beat', '1/2 bar', 'bar'];

export function throttleMax(h: Record<string, number>): number {
  return 1 + Math.round((h.max ?? 0.14) * 7);
}

export function throttleIndex(h: Record<string, number>): number {
  return Math.round((h.per ?? 0.33) * (THROTTLE_BEATS.length - 1));
}

/**
 * A density limit: each sound plays `max` notes per window, first come first
 * served, and each note over that is dropped with a chance of depth, so busy
 * generators thin out gradually as a sound moves in.
 */
export const throttle: TransformerType = {
  id: 'throttle',
  label: 'throttle',
  role: 'transformer',
  shape: 'circle',
  glyph: '⧖',
  defaultShape: { r: 130 },
  handles: [
    { key: 'max', label: 'max', default: 0.14, format: (_v, h) => `${throttleMax(h)} notes` },
    { key: 'per', label: 'per', default: 0.33, format: (_v, h) => `per ${THROTTLE_LABELS[throttleIndex(h)]}` },
  ],
  createState: () => new Map<string, { win: number; n: number }>(),
  transform(e, depth, ctx, out) {
    const seen = ctx.state as Map<string, { win: number; n: number }>;
    const win = Math.floor(e.tick / (THROTTLE_BEATS[throttleIndex(ctx.handles)] * ctx.ppq));
    let c = seen.get(e.soundId);
    if (!c) seen.set(e.soundId, (c = { win, n: 0 }));
    if (c.win !== win) {
      c.win = win;
      c.n = 0;
    }
    if (c.n++ >= throttleMax(ctx.handles) && ctx.rand(strHash(e.soundId), Math.floor(e.tick * 4) + e.chain) < depth) return;
    out(e);
  },
};
