// Generators driven from outside the patch: MIDI notes coming in, and a step
// sequence written by hand.

import type { GeneratorType } from '../types.ts';
import { MIDI_MAX, MIDI_MIN } from '../constants.ts';

// ---------- midi in ----------

export function midiChannel(h: Record<string, number>): number {
  return Math.round((h.channel ?? 0) * 16);
}

export function midiOctave(h: Record<string, number>): number {
  return Math.round(((h.octave ?? 0.5) - 0.5) * 4);
}

/** Longest a MIDI note can hold if its note-off never arrives. */
const MAX_HOLD_BEATS = 16;

/**
 * Plays incoming MIDI notes on every sound inside, at the note's own pitch
 * (shifted by whole octaves), louder the deeper a sound sits. Sustained sounds
 * take them as accents. MIDI arrives as logged edits, so captures and renders
 * replay it exactly.
 */
export const midi: GeneratorType = {
  id: 'midi',
  label: 'midi in',
  role: 'generator',
  shape: 'circle',
  glyph: '⎍',
  defaultShape: { r: 170 },
  handles: [
    { key: 'channel', label: 'channel', default: 0, format: (_v, h) => (midiChannel(h) === 0 ? 'omni' : `ch ${midiChannel(h)}`) },
    { key: 'octave', label: 'octave', default: 0.5, format: (_v, h) => `${midiOctave(h) > 0 ? '+' : ''}${midiOctave(h)} oct` },
  ],
  schedule(ctx, t0, _t1, members, emit) {
    const m = ctx.midi;
    if (!m.length || !members.length) return;
    const ch = midiChannel(ctx.handles);
    const shift = midiOctave(ctx.handles) * 12;
    for (let i = 0; i + 2 < m.length; i += 3) {
      const st = m[i];
      const kind = st & 0xf0;
      if (kind !== 0x90 && kind !== 0x80) continue;
      if (ch && (st & 0x0f) + 1 !== ch) continue;
      const note = m[i + 1];
      let pitch = note + shift;
      while (pitch < MIDI_MIN) pitch += 12;
      while (pitch > MIDI_MAX) pitch -= 12;
      const on = kind === 0x90 && m[i + 2] > 0;
      for (const mb of members) {
        if (on) emit(mb.soundId, t0, 0, (m[i + 2] / 127) * (0.5 + 0.5 * mb.depth), MAX_HOLD_BEATS * ctx.ppq, { pitch, tag: note + 1 });
        else emit(mb.soundId, t0, 0, 0, 0, { pitch, tag: note + 1, off: true });
      }
    }
  },
};

// ---------- sequencer ----------

/** Degrees used until the steps are edited: a rising and falling phrase with rests. */
export const DEFAULT_SEQ: (number | null)[] = [0, 2, 4, 2, 5, 4, 2, null, 0, null, 4, 7, 5, 4, 2, null];
export const SEQ_MAX = 16;
/** A step's degree range either side of the sound's own note. */
export const SEQ_RANGE = 7;

const SEQ_BEATS = [0.25, 0.5, 1];
const SEQ_LABELS = ['1/16', '1/8', '1/4'];

export function seqIndex(h: Record<string, number>): number {
  return Math.round((h.rate ?? 0.5) * (SEQ_BEATS.length - 1));
}

export function seqLength(h: Record<string, number>): number {
  return 1 + Math.round((h.length ?? 1) * (SEQ_MAX - 1));
}

/** The step sequence a field plays: its own, or the default. */
export function seqOf(seq: readonly (number | null)[] | null | undefined): readonly (number | null)[] {
  return seq && seq.length ? seq : DEFAULT_SEQ;
}

/**
 * A step sequencer you write by hand: each step is a scale degree from the
 * sound's own note, or a rest. Every sound inside plays it, starting at the
 * step its angle points to, so sounds round the circle play it as a round.
 */
export const sequencer: GeneratorType = {
  id: 'sequencer',
  label: 'sequencer',
  role: 'generator',
  shape: 'circle',
  glyph: '⋮',
  defaultShape: { r: 160 },
  handles: [
    { key: 'rate', label: 'rate', default: 0.5, format: (_v, h) => SEQ_LABELS[seqIndex(h)] },
    { key: 'length', label: 'length', default: 1, format: (_v, h) => `${seqLength(h)} steps` },
  ],
  schedule(ctx, t0, t1, members, emit) {
    const steps = seqOf(ctx.seq);
    const n = Math.min(seqLength(ctx.handles), steps.length);
    const stepT = SEQ_BEATS[seqIndex(ctx.handles)] * ctx.ppq;
    for (let s = Math.ceil(t0 / stepT); s * stepT < t1; s++) {
      for (const m of members) {
        const off = Math.round(m.angle * n) % n;
        const deg = steps[(s + off) % n];
        if (deg === null || deg === undefined) continue;
        emit(m.soundId, s * stepT, deg, 0.4 + 0.5 * m.depth, stepT * 0.85);
      }
    }
  },
};
