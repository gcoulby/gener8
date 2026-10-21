// Generators that share one musical idea across the sounds inside: a chord
// progression, a Turing machine's shift register, and a map of drum patterns.

import type { FieldContext, GeneratorType } from '../types.ts';

const pct = (v: number) => Math.round(v * 100) + '%';

// ---------- chords: a seeded progression in the key ----------

const CHORD_EVERY = [4, 8, 16, 32]; // beats
const CHORD_EVERY_LABELS = ['1 bar', '2 bars', '4 bars', '8 bars'];
/** Roots as scale degrees: I vi IV V, I V vi IV, I IV V I, vi IV I V, I vi ii V, I iii IV V. */
const PROGRESSIONS = [
  [0, 5, 3, 4],
  [0, 4, 5, 3],
  [0, 3, 4, 0],
  [5, 3, 0, 4],
  [0, 5, 1, 4],
  [0, 2, 3, 4],
];
const COLOURS = ['triads', '7ths', '9ths'];

export function chordEveryIndex(h: Record<string, number>): number {
  return Math.round((h.every ?? 0.33) * (CHORD_EVERY.length - 1));
}

export function chordTones(h: Record<string, number>): number {
  return 3 + Math.round((h.colour ?? 0.5) * 2);
}

/** The progression this field plays: seeded, so each chords field has its own. */
export function chordProgression(ctx: FieldContext): number[] {
  return PROGRESSIONS[Math.floor(ctx.rand(5, 0) * PROGRESSIONS.length)];
}

/**
 * A chord progression in the patch's key, one chord every few bars. Each sound
 * takes a chord tone by its angle, in the octave nearest its own pitch, so the
 * voices lead smoothly from chord to chord. Sounds deeper than halfway also
 * restrike every bar. Sounds are staggered slightly by angle, like a soft strum.
 */
export const chords: GeneratorType = {
  id: 'chords',
  label: 'chords',
  role: 'generator',
  shape: 'circle',
  glyph: '⫶',
  defaultShape: { r: 180 },
  handles: [
    { key: 'every', label: 'every', default: 0.33, format: (_v, h) => CHORD_EVERY_LABELS[chordEveryIndex(h)] },
    { key: 'colour', label: 'colour', default: 0.5, format: (_v, h) => COLOURS[chordTones(h) - 3] },
  ],
  schedule(ctx, t0, t1, members, emit) {
    const bar = 4 * ctx.ppq;
    const period = CHORD_EVERY[chordEveryIndex(ctx.handles)] * ctx.ppq;
    const tones = chordTones(ctx.handles);
    const prog = chordProgression(ctx);
    const len = ctx.steps.length;
    const STAGGER = 60; // up to a 1/64 note between sounds
    for (let b = Math.max(0, Math.floor((t0 - STAGGER) / bar)); b * bar < t1; b++) {
      const tick = b * bar;
      const change = tick % period === 0;
      const root = prog[Math.floor(tick / period) % prog.length];
      for (const m of members) {
        if (!change && m.depth <= 0.5) continue;
        const at = tick + Math.round(m.angle * STAGGER);
        if (at < t0 || at >= t1) continue;
        const tone = root + 2 * Math.floor(m.angle * tones);
        const target = tone + len * Math.round((m.rootIndex - tone) / len);
        const vel = (0.35 + 0.4 * m.depth) * (change ? 1 : 0.7);
        // held until this sound's next strike
        emit(m.soundId, at, target - m.rootIndex, vel, (m.depth > 0.5 ? bar : period) * 0.95);
      }
    }
  },
};

// ---------- turing: a looping shift register that slowly mutates ----------

export function turingLength(h: Record<string, number>): number {
  return 2 + Math.round((h.length ?? 0.43) * 14);
}

/** Chance that the bit coming round is flipped: 0 locks the loop. */
export function turingChange(h: Record<string, number>): number {
  const c = h.change ?? 0.2;
  return c * c;
}

interface TuringState {
  reg: number;
  /** Last step taken. */
  step: number;
  shown: number;
}

function bit(reg: number, i: number): number {
  return (reg >>> (i & 15)) & 1;
}

/**
 * After the Music Thing Modular Turing Machine: a 16-bit shift register that
 * loops every `length` steps (8ths). Each step, the bit coming round may flip,
 * so the loop slowly mutates; with change at 0 it repeats exactly. Every sound
 * reads the register from its own tap, picked by angle: it fires when that bit
 * is set, and the bits after it choose the note. Depth widens the range.
 */
export const turing: GeneratorType = {
  id: 'turing',
  label: 'turing',
  role: 'generator',
  shape: 'circle',
  glyph: '◫',
  defaultShape: { r: 170 },
  handles: [
    { key: 'length', label: 'length', default: 0.43, format: (_v, h) => `${turingLength(h)} steps` },
    { key: 'change', label: 'change', default: 0.2, format: (_v, h) => (turingChange(h) === 0 ? 'locked' : pct(turingChange(h))) },
  ],
  createState: (ctx) => ({ reg: Math.floor(ctx.rand(6, 0) * 65536), step: -1, shown: -2 }) satisfies TuringState,
  schedule(ctx, t0, t1, members, emit) {
    const st = ctx.state as TuringState;
    const stepT = ctx.ppq / 2;
    const len = turingLength(ctx.handles);
    const p = turingChange(ctx.handles);
    for (let s = Math.ceil(t0 / stepT); s * stepT < t1; s++) {
      if (s <= st.step) continue;
      let out = bit(st.reg, len - 1);
      if (ctx.rand(7, s) < p) out ^= 1;
      st.reg = ((st.reg << 1) | out) & 0xffff;
      st.step = s;
      for (const m of members) {
        const tap = Math.floor(m.angle * len);
        if (!bit(st.reg, tap)) continue;
        // the next three bits pick a note across a range that widens with depth
        const v = bit(st.reg, tap + 1) | (bit(st.reg, tap + 2) << 1) | (bit(st.reg, tap + 3) << 2);
        const range = 3 + Math.round(m.depth * 7);
        const deg = Math.round((v / 7) * range) - 2;
        const vel = 0.35 + 0.3 * m.depth + 0.2 * bit(st.reg, tap + 4);
        emit(m.soundId, s * stepT, deg, vel, stepT * 0.9);
      }
    }
  },
  visual(ctx) {
    const st = ctx.state as TuringState;
    if (st.shown === st.step) return null;
    st.shown = st.step;
    return { reg: st.reg, len: turingLength(ctx.handles) };
  },
};

// ---------- topo: a map of drum patterns ----------

const TOPO_STEPS = 16;
const TOPO_NODES = 3;
/** Pattern templates, levels 0..1 per 16th: low (kick-like), mid (snare-like), high (hats). */
const TEMPLATES = [
  [1, 0, 0.2, 0, 0.5, 0, 0.3, 0.1, 0.8, 0, 0.2, 0, 0.5, 0, 0.4, 0.2],
  [0, 0, 0.1, 0, 1, 0, 0, 0.2, 0, 0.1, 0, 0, 1, 0, 0.2, 0.35],
  [0.8, 0.2, 0.6, 0.2, 0.8, 0.2, 0.6, 0.3, 0.8, 0.2, 0.6, 0.2, 0.8, 0.3, 0.6, 0.45],
];
const PARTS = TEMPLATES.length;

/** levels[part][node][step], node = row * TOPO_NODES + col. */
type TopoState = number[][][];

/**
 * After Mutable Instruments Grids: a 3 × 3 map of drum patterns, one set per
 * part (low, mid, high), each a seeded variation on a template. A sound's
 * position inside the field blends the four nearest patterns, so moving it
 * morphs its groove. Angle picks its part. A step fires when its level beats
 * a threshold that density and depth lower; chaos jitters the levels.
 */
export const topo: GeneratorType = {
  id: 'topo',
  label: 'topo',
  role: 'generator',
  shape: 'rect',
  glyph: '▤',
  defaultShape: { w: 260, h: 260 },
  handles: [
    { key: 'density', label: 'density', default: 0.5, format: pct },
    { key: 'chaos', label: 'chaos', default: 0.15, format: pct },
  ],
  createState(ctx) {
    const st: TopoState = [];
    for (let part = 0; part < PARTS; part++) {
      const nodes: number[][] = [];
      for (let n = 0; n < TOPO_NODES * TOPO_NODES; n++) {
        const base = (part * 9 + n) * 64;
        const mix = 0.15 + 0.45 * ctx.rand(8, base);
        // some nodes push the template off the beat by a 16th or an 8th
        const shift = ctx.rand(8, base + 1) < 0.3 ? 1 + Math.floor(ctx.rand(8, base + 2) * 2) : 0;
        const levels: number[] = [];
        for (let s = 0; s < TOPO_STEPS; s++) {
          const t = TEMPLATES[part][(s - shift + TOPO_STEPS) % TOPO_STEPS];
          levels.push(t * (1 - mix) + ctx.rand(8, base + 3 + s) * mix * (0.4 + 0.6 * t));
        }
        nodes.push(levels);
      }
      st.push(nodes);
    }
    return st;
  },
  schedule(ctx, t0, t1, members, emit) {
    const st = ctx.state as TopoState;
    const step = ctx.ppq / 4;
    const density = ctx.handles.density ?? 0.5;
    const chaos = ctx.handles.chaos ?? 0.15;
    const span = TOPO_NODES - 1;
    for (let s = Math.ceil(t0 / step); s * step < t1; s++) {
      const i = s % TOPO_STEPS;
      for (const m of members) {
        const part = Math.min(PARTS - 1, Math.floor(m.angle * PARTS));
        const u = Math.min(1, Math.max(0, m.lx / ctx.w + 0.5)) * span;
        const v = Math.min(1, Math.max(0, 0.5 - m.ly / ctx.h)) * span;
        const c = Math.min(span - 1, Math.floor(u));
        const r = Math.min(span - 1, Math.floor(v));
        const fu = u - c;
        const fv = v - r;
        const n = st[part];
        const at = (rr: number, cc: number) => n[rr * TOPO_NODES + cc][i];
        let level = (at(r, c) * (1 - fu) + at(r, c + 1) * fu) * (1 - fv) + (at(r + 1, c) * (1 - fu) + at(r + 1, c + 1) * fu) * fv;
        level += (ctx.rand(m.soundHash, s) * 2 - 1) * chaos * 0.5;
        if (level <= 1 - density * (0.4 + 0.6 * m.depth)) continue;
        emit(m.soundId, s * step, 0, Math.min(1, 0.3 + 0.7 * level), step * 0.8);
      }
    }
  },
};
