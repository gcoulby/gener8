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
