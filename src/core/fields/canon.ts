import type { TransformerType } from '../types.ts';
import { strHash } from '../rand.ts';
import { indexToMidi, nearestIndex, noteName } from '../music.ts';
import { MIDI_MAX, MIDI_MIN } from '../constants.ts';

/** Back into the playable range by whole octaves. */
function fold(m: number): number {
  while (m < MIDI_MIN) m += 12;
  while (m > MIDI_MAX) m -= 12;
  return m;
}

const CANON_BEATS = [0.5, 1, 2, 3, 4, 8];
const CANON_BEAT_LABELS = ['1/8', '1/4', '1/2', '3/4', '1 bar', '2 bars'];
/** Scale degrees each repeat moves by. */
const CANON_STEPS = [-7, -3, 0, 2, 3, 4, 7];
const CANON_STEP_LABELS = ['octave down', '4th down', 'unison', '3rd up', '4th up', '5th up', 'octave up'];

export function canonDelayIndex(h: Record<string, number>): number {
  return Math.round((h.delay ?? 0.4) * (CANON_BEATS.length - 1));
}

export function canonStepIndex(h: Record<string, number>): number {
  return Math.round((h.interval ?? 0.83) * (CANON_STEPS.length - 1));
}

/**
 * A round: each note comes back later, moved through the key by an interval
 * and softer each time. One repeat at the edge, three at the centre. The
 * repeats are notes, so later transformers and the sound's ripples treat them
 * like any other.
 */
export const canon: TransformerType = {
  id: 'canon',
  label: 'canon',
  role: 'transformer',
  shape: 'circle',
  glyph: '⤳',
  defaultShape: { r: 130 },
  handles: [
    { key: 'delay', label: 'delay', default: 0.4, format: (_v, h) => CANON_BEAT_LABELS[canonDelayIndex(h)] },
    { key: 'interval', label: 'interval', default: 0.83, format: (_v, h) => CANON_STEP_LABELS[canonStepIndex(h)] },
  ],
  transform(e, depth, ctx, out) {
    out(e);
    const gap = CANON_BEATS[canonDelayIndex(ctx.handles)] * ctx.ppq;
    const step = CANON_STEPS[canonStepIndex(ctx.handles)];
    const idx = nearestIndex(e.pitch, ctx.keyRoot, ctx.steps);
    const voices = 1 + Math.round(depth * 2);
    let vel = e.velocity;
    for (let v = 1; v <= voices; v++) {
      vel *= 0.7;
      out({ ...e, tick: e.tick + v * gap, pitch: fold(indexToMidi(idx + v * step, ctx.keyRoot, ctx.steps)), velocity: vel });
    }
  },
};

/** MIDI note the melody is flipped around: C2 to C6, on the key's scale. */
export function mirrorAxis(h: Record<string, number>, root: number, steps: number[]): number {
  return indexToMidi(nearestIndex(36 + (h.axis ?? 0.5) * 48, root, steps), root, steps);
}

/**
 * Turns melodies upside down: a note n scale steps above the axis comes out n
 * steps below it, staying in key. A share of notes is flipped, more the deeper
 * a sound sits; sustained sounds flip once that share passes half.
 */
export const mirror: TransformerType = {
  id: 'mirror',
  label: 'mirror',
  role: 'transformer',
  shape: 'circle',
  glyph: '⇅',
  defaultShape: { r: 130 },
  handles: [
    { key: 'axis', label: 'axis', default: 0.5, format: (v) => `around ${noteName(36 + v * 48)}` },
    { key: 'share', label: 'share', default: 1, format: (v) => Math.round(v * 100) + '%' },
  ],
  transform(e, depth, ctx, out) {
    const p = (ctx.handles.share ?? 1) * depth;
    if (ctx.rand(strHash(e.soundId), Math.floor(e.tick * 4) + e.chain) >= p) return out(e);
    out({ ...e, pitch: flip(e.pitch, ctx.handles, ctx.keyRoot, ctx.steps) });
  },
  transformPitch(pitch, depth, ctx) {
    return (ctx.handles.share ?? 1) * depth > 0.5 ? flip(pitch, ctx.handles, ctx.keyRoot, ctx.steps) : pitch;
  },
};

function flip(pitch: number, h: Record<string, number>, root: number, steps: number[]): number {
  const axis = nearestIndex(mirrorAxis(h, root, steps), root, steps);
  return fold(indexToMidi(2 * axis - nearestIndex(pitch, root, steps), root, steps));
}

const ECHO_BEATS = [0.25, 0.5, 0.75, 1, 1.5, 2];
const ECHO_LABELS = ['1/16', '1/8', '3/16', '1/4', '3/8', '1/2'];

export function echoIndex(h: Record<string, number>): number {
  return Math.round((h.gap ?? 0.6) * (ECHO_BEATS.length - 1));
}

/** Level each repeat keeps of the one before. */
export function echoKeep(h: Record<string, number>): number {
  return 0.3 + (h.decay ?? 0.5) * 0.55;
}

/**
 * Note delay: each note repeats at the same pitch, fading by `decay` each
 * time, until it is too quiet to hear. Two repeats at the edge, six at the
 * centre. Unlike tape delay these are notes, so they ripple and transform.
 */
export const echo: TransformerType = {
  id: 'echo',
  label: 'echo',
  role: 'transformer',
  shape: 'circle',
  glyph: '⋯',
  defaultShape: { r: 130 },
  handles: [
    { key: 'gap', label: 'gap', default: 0.6, format: (_v, h) => ECHO_LABELS[echoIndex(h)] },
    { key: 'decay', label: 'decay', default: 0.5, format: (_v, h) => `${Math.round(echoKeep(h) * 100)}% each` },
  ],
  transform(e, depth, ctx, out) {
    out(e);
    const gap = ECHO_BEATS[echoIndex(ctx.handles)] * ctx.ppq;
    const keep = echoKeep(ctx.handles);
    const repeats = 2 + Math.round(depth * 4);
    let vel = e.velocity;
    for (let v = 1; v <= repeats; v++) {
      vel *= keep;
      if (vel < 0.05) break;
      out({ ...e, tick: e.tick + v * gap, velocity: vel, durTicks: Math.min(e.durTicks, gap * 0.9) });
    }
  },
};

const RETRO_BEATS = [2, 4, 8, 16];
const RETRO_LABELS = ['1/2 bar', '1 bar', '2 bars', '4 bars'];

export function retroIndex(h: Record<string, number>): number {
  return Math.round((h.window ?? 0.33) * (RETRO_BEATS.length - 1));
}

/**
 * Plays each window backwards in the next one: a note at t in window k ends
 * where it started, mirrored, in window k + 1 (2·(k+1)·W − t − dur). A pure
 * function of the note, so no buffer is kept. A share of notes (scaled by
 * depth) is moved; the rest play as they come.
 */
export const retrograde: TransformerType = {
  id: 'retrograde',
  label: 'retrograde',
  role: 'transformer',
  shape: 'circle',
  glyph: '⇆',
  defaultShape: { r: 130 },
  handles: [
    { key: 'window', label: 'window', default: 0.33, format: (_v, h) => RETRO_LABELS[retroIndex(h)] },
    { key: 'share', label: 'share', default: 1, format: (v) => Math.round(v * 100) + '%' },
  ],
  transform(e, depth, ctx, out) {
    const p = (ctx.handles.share ?? 1) * depth;
    if (ctx.rand(strHash(e.soundId), Math.floor(e.tick * 4) + e.chain) >= p) return out(e);
    const w = RETRO_BEATS[retroIndex(ctx.handles)] * ctx.ppq;
    const k = Math.floor(e.tick / w);
    const t = 2 * (k + 1) * w - e.tick - e.durTicks;
    out({ ...e, tick: t > e.tick ? t : e.tick });
  },
};
