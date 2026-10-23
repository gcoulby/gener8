// Transformers that reshape a melody's line: octave scatter and leap smoothing.

import type { TransformerType } from '../types.ts';
import { strHash } from '../rand.ts';
import { snapToScale } from '../music.ts';
import { MIDI_MAX, MIDI_MIN } from '../constants.ts';

/** Back into the playable range by whole octaves. */
function fold(m: number): number {
  while (m < MIDI_MIN) m += 12;
  while (m > MIDI_MAX) m -= 12;
  return m;
}

export function scatterRange(h: Record<string, number>): number {
  return 1 + Math.round((h.range ?? 0) * 2);
}

/**
 * Throws a share of notes up or down by whole octaves (1 to `range`), so a
 * narrow pattern spreads over the keyboard. Depth scales the chance.
 */
export const scatter: TransformerType = {
  id: 'scatter',
  label: 'scatter',
  role: 'transformer',
  shape: 'circle',
  glyph: '⁘',
  defaultShape: { r: 130 },
  handles: [
    { key: 'range', label: 'range', default: 0, format: (_v, h) => `±${scatterRange(h)} oct` },
    { key: 'chance', label: 'chance', default: 0.5, format: (v) => Math.round(v * 100) + '%' },
  ],
  transform(e, depth, ctx, out) {
    const h = strHash(e.soundId);
    const k = Math.floor(e.tick * 4) + e.chain;
    if (ctx.rand(h, k) >= (ctx.handles.chance ?? 0.5) * depth) return out(e);
    const n = scatterRange(ctx.handles);
    const r = ctx.rand(h + 1, k);
    // up or down, 1..n octaves, evenly
    const oct = 1 + Math.floor(r * 2 * n) % n;
    out({ ...e, pitch: fold(e.pitch + (r < 0.5 ? -12 : 12) * oct) });
  },
};

const SMOOTH_MODES = ['fold', 'squeeze'];

export function smoothLeap(h: Record<string, number>): number {
  return 2 + Math.round((h.leap ?? 0.5) * 10);
}

export function smoothMode(h: Record<string, number>): number {
  return Math.round(h.mode ?? 0);
}

/**
 * Keeps lines singable: when a note jumps further than `leap` semitones from
 * the sound's last note, fold moves it by octaves towards it, squeeze pulls
 * it to the in-key note `leap` away. Towards the edge larger leaps get
 * through (leap + 24 × (1 − depth)).
 */
export const smooth: TransformerType = {
  id: 'smooth',
  label: 'smooth',
  role: 'transformer',
  shape: 'circle',
  glyph: '∽',
  defaultShape: { r: 130 },
  handles: [
    { key: 'leap', label: 'max leap', default: 0.5, format: (_v, h) => `${smoothLeap(h)} st` },
    { key: 'mode', label: 'mode', default: 0, format: (_v, h) => SMOOTH_MODES[smoothMode(h)] },
  ],
  createState: () => new Map<string, number>(),
  transform(e, depth, ctx, out) {
    const last = ctx.state as Map<string, number>;
    const prev = last.get(e.soundId);
    let p = e.pitch;
    if (prev !== undefined) {
      const leap = smoothLeap(ctx.handles) + 24 * (1 - depth);
      const d = p - prev;
      if ((d < 0 ? -d : d) > leap) {
        if (smoothMode(ctx.handles) === 0) {
          while (p - prev > 6 && p - 12 >= MIDI_MIN) p -= 12;
          while (prev - p > 6 && p + 12 <= MIDI_MAX) p += 12;
        } else {
          p = snapToScale(prev + (d < 0 ? -leap : leap), ctx.keyRoot, ctx.steps);
        }
      }
    }
    last.set(e.soundId, p);
    out(p === e.pitch ? e : { ...e, pitch: p });
  },
};

const GLIDE_BEATS = [0.125, 0.25, 0.5, 1];
const GLIDE_LABELS = ['1/32', '1/16', '1/8', '1/4'];

export function glideIndex(h: Record<string, number>): number {
  return Math.round((h.time ?? 0.33) * (GLIDE_BEATS.length - 1));
}

/**
 * Portamento: a share of notes (scaled by depth) slide in from the sound's
 * previous note instead of starting on their own. Sounds whose voices can
 * glide (subtractive, FM, bass and most newer sounds) follow it; the rest
 * play as normal.
 */
export const glide: TransformerType = {
  id: 'glide',
  label: 'glide',
  role: 'transformer',
  shape: 'circle',
  glyph: '⟋',
  defaultShape: { r: 130 },
  handles: [
    { key: 'time', label: 'time', default: 0.33, format: (_v, h) => GLIDE_LABELS[glideIndex(h)] },
    { key: 'share', label: 'share', default: 0.8, format: (v) => Math.round(v * 100) + '%' },
  ],
  transform(e, depth, ctx, out) {
    if (ctx.rand(strHash(e.soundId), Math.floor(e.tick * 4) + e.chain) >= (ctx.handles.share ?? 0.8) * depth) return out(e);
    out({ ...e, glide: GLIDE_BEATS[glideIndex(ctx.handles)] * ctx.ppq });
  },
};
