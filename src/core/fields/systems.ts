// Generators that unfold a rule: change ringing, an L-system grammar and a
// one-dimensional cellular automaton.

import type { FieldContext, GeneratorType } from '../types.ts';

// ---------- bells: change ringing ----------

export const BELL_METHODS = ['rounds', 'plain hunt', 'plain bob', 'shuffle'];
const BELL_RATES = [2, 3, 4, 6];

export function bellMethod(h: Record<string, number>): number {
  return Math.round((h.method ?? 0.67) * (BELL_METHODS.length - 1));
}

export function bellRate(h: Record<string, number>): number {
  return BELL_RATES[Math.round((h.rate ?? 0.67) * (BELL_RATES.length - 1))];
}

interface BellState {
  n: number;
  method: number;
  /** The row (bell at each place) for change `at`. */
  row: number[];
  at: number;
}

/** Swaps adjacent pairs from place `from` on: 0 is "cross", 1 keeps the lead, 2 keeps the first two. */
function swapFrom(row: number[], from: number): void {
  for (let i = from; i + 1 < row.length; i += 2) {
    const t = row[i];
    row[i] = row[i + 1];
    row[i + 1] = t;
  }
}

/** Moves a row on by one change of the method; c is the change's number from rounds. */
function change(row: number[], method: number, c: number, ctx: FieldContext): void {
  const n = row.length;
  if (method === 1) swapFrom(row, c % 2);
  else if (method === 2) {
    // plain bob: plain hunt, but each lead ends with the first two places held
    const lead = 2 * n;
    swapFrom(row, c % lead === lead - 1 ? 2 : c % 2);
  } else if (method === 3) {
    // a seeded swap of non-touching neighbours
    for (let i = 0; i + 1 < n; i++) {
      if (ctx.rand(21, c * 16 + i) < 0.5) continue;
      const t = row[i];
      row[i] = row[i + 1];
      row[i + 1] = t;
      i++;
    }
  }
}

/** The row for change r, moving on from the cached one (or from rounds when going back). */
function rowAt(st: BellState, r: number, ctx: FieldContext): number[] {
  if (r < st.at) {
    st.row = Array.from({ length: st.n }, (_, i) => i);
    st.at = 0;
  }
  while (st.at < r) change(st.row, st.method, st.at++, ctx);
  return st.row;
}

/**
 * Change ringing: the sounds inside are bells, numbered clockwise from the
 * top. Each change rings every bell once in some order; the method decides how
 * the order moves on, swapping neighbours so the bells weave through every
 * position. Pairs of changes are a whole pull, with a gap before each
 * handstroke as in a tower.
 */
export const bells: GeneratorType = {
  id: 'bells',
  label: 'bells',
  role: 'generator',
  shape: 'circle',
  glyph: '⍾',
  defaultShape: { r: 180 },
  handles: [
    { key: 'method', label: 'method', default: 0.67, format: (_v, h) => BELL_METHODS[bellMethod(h)] },
    { key: 'rate', label: 'rate', default: 0.67, format: (_v, h) => `${bellRate(h)} / beat` },
  ],
  createState: (): BellState => ({ n: 0, method: -1, row: [], at: 0 }),
  schedule(ctx, t0, t1, members, emit) {
    const n = Math.min(12, members.length);
    if (n === 0) return;
    const st = ctx.state as BellState;
    const method = bellMethod(ctx.handles);
    if (st.n !== n || st.method !== method) {
      st.n = n;
      st.method = method;
      st.row = Array.from({ length: n }, (_, i) => i);
      st.at = 0;
    }
    const order = members.slice(0, n).sort((a, b) => a.angle - b.angle);
    const stepT = ctx.ppq / bellRate(ctx.handles);
    const pull = 2 * n + 1;
    for (let s = Math.ceil(t0 / stepT); s * stepT < t1; s++) {
      const k = s % pull;
      if (k === 0) continue; // the handstroke gap
      const r = Math.floor(s / pull) * 2 + (k - 1 >= n ? 1 : 0);
      const row = rowAt(st, r, ctx);
      const m = order[row[(k - 1) % n]];
      // handstrokes ring a touch louder than backstrokes
      emit(m.soundId, s * stepT, 0, (0.4 + 0.5 * m.depth) * (r % 2 ? 0.9 : 1), stepT * 1.5);
    }
  },
};

// ---------- L-system ----------

interface Grammar {
  label: string;
  axiom: string;
  rules: Record<string, string>;
}

/**
 * Symbols: A and F play and step up a degree, B plays and steps down, X is a
 * rest, + and − move up or down a degree without playing, [ and ] save and
 * restore the degree. Anything else is skipped.
 */
export const GRAMMARS: Grammar[] = [
  { label: 'algae', axiom: 'A', rules: { A: 'AB', B: 'A' } },
  { label: 'cantor', axiom: 'A', rules: { A: 'AXA', X: 'XXX' } },
  { label: 'koch', axiom: 'F', rules: { F: 'F+F-F-F+F' } },
  { label: 'tree', axiom: 'Y', rules: { Y: 'F[+Y][-Y]FY', F: 'FX' } },
];

const LSYS_MAX = 512;

export function lsysGrammar(h: Record<string, number>): number {
  return Math.round((h.rule ?? 0) * (GRAMMARS.length - 1));
}

export function lsysGenerations(h: Record<string, number>): number {
  return 1 + Math.round((h.generations ?? 0.5) * 5);
}

/** The melody a grammar grows to after g generations: a degree per step, null for a rest. */
export function lsysMelody(rule: number, g: number): (number | null)[] {
  const gr = GRAMMARS[rule];
  let s = gr.axiom;
  for (let i = 0; i < g && s.length < LSYS_MAX * 4; i++) {
    let next = '';
    for (const c of s) next += gr.rules[c] ?? c;
    s = next;
  }
  const out: (number | null)[] = [];
  const stack: number[] = [];
  let deg = 0;
  // keep within an octave either way, bouncing off the ends
  const move = (d: number) => {
    deg += d;
    if (deg > 7) deg = 14 - deg;
    if (deg < -7) deg = -14 - deg;
  };
  for (const c of s) {
    if (out.length >= LSYS_MAX) break;
    if (c === 'A' || c === 'F') {
      out.push(deg);
      move(1);
    } else if (c === 'B') {
      out.push(deg);
      move(-1);
    } else if (c === 'X') out.push(null);
    else if (c === '+') move(1);
    else if (c === '-') move(-1);
    else if (c === '[') stack.push(deg);
    else if (c === ']') deg = stack.pop() ?? 0;
  }
  return out.length ? out : [0];
}

/**
 * An L-system: a short rule rewritten into itself generation after generation
 * grows a long, self-similar melody (or, for cantor, a rhythm). Every sound
 * inside plays it in 8ths from the sound's own note, starting where its angle
 * points, so sounds round the circle are staggered copies.
 */
export const lsystem: GeneratorType = {
  id: 'lsystem',
  label: 'L-system',
  role: 'generator',
  shape: 'circle',
  glyph: 'ᛉ',
  defaultShape: { r: 170 },
  handles: [
    { key: 'rule', label: 'rule', default: 0, format: (_v, h) => GRAMMARS[lsysGrammar(h)].label },
    { key: 'generations', label: 'generations', default: 0.5, format: (_v, h) => `${lsysGenerations(h)} generations` },
  ],
  createState: () => ({ key: '', melody: [0] as (number | null)[] }),
  schedule(ctx, t0, t1, members, emit) {
    const st = ctx.state as { key: string; melody: (number | null)[] };
    const rule = lsysGrammar(ctx.handles);
    const g = lsysGenerations(ctx.handles);
    const key = `${rule}:${g}`;
    if (st.key !== key) {
      st.key = key;
      st.melody = lsysMelody(rule, g);
    }
    const mel = st.melody;
    const n = mel.length;
    const stepT = ctx.ppq / 2;
    for (let s = Math.ceil(t0 / stepT); s * stepT < t1; s++) {
      for (const m of members) {
        const deg = mel[(s + Math.round(m.angle * n)) % n];
        if (deg === null) continue;
        emit(m.soundId, s * stepT, deg, 0.4 + 0.5 * m.depth, stepT * 0.9);
      }
    }
  },
};

// ---------- automaton: an elementary (1D) cellular automaton ----------

export const AUTO_CELL = 24;
export const AUTO_RULES = [30, 90, 110, 150, 184, 54, 45];
const AUTO_RATES = [1, 2, 4];

export function autoRule(h: Record<string, number>): number {
  return AUTO_RULES[Math.round((h.rule ?? 0) * (AUTO_RULES.length - 1))];
}

export function autoRate(h: Record<string, number>): number {
  return AUTO_RATES[Math.round((h.rate ?? 0.5) * (AUTO_RATES.length - 1))];
}

interface AutoState {
  cols: number;
  rows: number;
  /** The last `rows` generations, oldest first. */
  hist: Uint8Array;
  gen: number;
  shown: number;
}

function autoDims(ctx: FieldContext): [number, number] {
  return [Math.max(3, Math.floor(ctx.baseW / AUTO_CELL)), Math.max(2, Math.floor(ctx.baseH / AUTO_CELL))];
}

function autoSeed(ctx: FieldContext, cols: number, g: number, row: Uint8Array): void {
  row.fill(0);
  if (g < 0) row[cols >> 1] = 1;
  else for (let c = 0; c < cols; c++) row[c] = ctx.rand(23, g * 64 + c) < 0.3 ? 1 : 0;
}

/**
 * Wolfram's elementary automata: a row of cells, each generation worked out
 * from the one before by the rule (each cell's next state from itself and its
 * two neighbours). Rule 30 is chaotic, 90 a Sierpiński triangle, 110 a
 * crawling texture. A sound fires when its column is lit in the new row; the
 * field shows the recent rows, newest at the bottom. A row that dies out (or
 * fills up) is reseeded.
 */
export const automaton: GeneratorType = {
  id: 'automaton',
  label: 'automaton',
  role: 'generator',
  shape: 'rect',
  glyph: '⧩',
  defaultShape: { w: 288, h: 168 },
  handles: [
    { key: 'rule', label: 'rule', default: 0, format: (_v, h) => `rule ${autoRule(h)}` },
    { key: 'rate', label: 'rate', default: 0.5, format: (_v, h) => `${autoRate(h)} rows / beat` },
  ],
  createState(ctx): AutoState {
    const [cols, rows] = autoDims(ctx);
    const hist = new Uint8Array(cols * rows);
    autoSeed(ctx, cols, -1, hist.subarray((rows - 1) * cols));
    return { cols, rows, hist, gen: -1, shown: -2 };
  },
  schedule(ctx, t0, t1, members, emit) {
    const st = ctx.state as AutoState;
    const [cols, rows] = autoDims(ctx);
    if (cols !== st.cols || rows !== st.rows) {
      st.cols = cols;
      st.rows = rows;
      st.hist = new Uint8Array(cols * rows);
      autoSeed(ctx, cols, -1, st.hist.subarray((rows - 1) * cols));
    }
    const rule = autoRule(ctx.handles);
    const genT = ctx.ppq / autoRate(ctx.handles);
    for (let g = Math.ceil(t0 / genT); g * genT < t1; g++) {
      const h = st.hist;
      h.copyWithin(0, cols);
      const prev = h.subarray((rows - 2) * cols, (rows - 1) * cols);
      const row = h.subarray((rows - 1) * cols);
      let on = 0;
      for (let c = 0; c < cols; c++) {
        const l = prev[(c - 1 + cols) % cols];
        const r = prev[(c + 1) % cols];
        row[c] = (rule >> ((l << 2) | (prev[c] << 1) | r)) & 1;
        on += row[c];
      }
      if (on === 0 || on === cols) autoSeed(ctx, cols, g, row);
      st.gen = g;
      for (const m of members) {
        let c = Math.floor((m.lx / ctx.w + 0.5) * cols);
        c = c < 0 ? 0 : c >= cols ? cols - 1 : c;
        if (row[c]) emit(m.soundId, g * genT, 0, 0.4 + 0.6 * m.depth, genT * 0.9);
      }
    }
  },
  visual(ctx) {
    const st = ctx.state as AutoState;
    if (st.shown === st.gen) return null;
    st.shown = st.gen;
    return { cols: st.cols, rows: st.rows, cells: st.hist.slice(), gen: st.gen };
  },
};
