import { MIDI_MAX, MIDI_MIN, UNITS_PER_SEMITONE, Y0_MIDI } from './constants.ts';

export const SCALES: Record<string, number[]> = {
  minorPentatonic: [0, 3, 5, 7, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  wholeTone: [0, 2, 4, 6, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const SCALE_ORDER = Object.keys(SCALES);

export const SCALE_LABELS: Record<string, string> = {
  minorPentatonic: 'minor pent',
  majorPentatonic: 'major pent',
  dorian: 'dorian',
  minor: 'minor',
  major: 'major',
  phrygian: 'phrygian',
  lydian: 'lydian',
  wholeTone: 'whole tone',
  chromatic: 'chromatic',
};

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export function scaleSteps(name: string): number[] {
  return SCALES[name] ?? SCALES.minorPentatonic;
}

/** Vertical position → continuous MIDI pitch. Up is higher. */
export function yToMidi(y: number): number {
  const m = Y0_MIDI + y / UNITS_PER_SEMITONE;
  return m < MIDI_MIN ? MIDI_MIN : m > MIDI_MAX ? MIDI_MAX : m;
}

export function midiToY(m: number): number {
  return (m - Y0_MIDI) * UNITS_PER_SEMITONE;
}

/** Index of the nearest scale note on an infinite scale ladder. */
export function nearestIndex(m: number, root: number, steps: number[]): number {
  const len = steps.length;
  const rel = m - root;
  const oct = Math.floor(rel / 12);
  const pc = rel - oct * 12;
  let best = 0;
  let bestD = Infinity;
  for (let j = 0; j < len; j++) {
    const d = pc - steps[j] < 0 ? steps[j] - pc : pc - steps[j];
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  const wrap = steps[0] + 12 - pc;
  if (wrap < bestD) return (oct + 1) * len;
  return oct * len + best;
}

export function indexToMidi(i: number, root: number, steps: number[]): number {
  const len = steps.length;
  const oct = Math.floor(i / len);
  return root + oct * 12 + steps[i - oct * len];
}

export function snapToScale(m: number, root: number, steps: number[]): number {
  return indexToMidi(nearestIndex(m, root, steps), root, steps);
}

export function noteName(m: number): string {
  const r = Math.round(m);
  return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}
