import type { FieldContext, GeneratorType } from '../types.ts';

const pct = (v: number) => Math.round(v * 100) + '%';

// ---------- pulse: Euclidean rhythm ----------

export function pulseLength(h: Record<string, number>): number {
  return 2 + Math.round((h.length ?? 1) * 14);
}

export function pulseHits(h: Record<string, number>): number {
  const n = pulseLength(h);
  return Math.max(1, Math.min(n, Math.round((h.hits ?? 0.3) * n)));
}

export function euclid(i: number, k: number, n: number): boolean {
  return (i * k) % n < k;
}

export const pulse: GeneratorType = {
  id: 'pulse',
  label: 'pulse',
  role: 'generator',
  shape: 'circle',
  glyph: '◉',
  defaultShape: { r: 160 },
  handles: [
    { key: 'hits', label: 'hits', default: 0.3125, format: (_v, h) => `${pulseHits(h)} / ${pulseLength(h)}` },
    { key: 'length', label: 'length', default: 1, format: (_v, h) => `${pulseLength(h)} steps` },
  ],
  schedule(ctx, t0, t1, members, emit) {
    const step = ctx.ppq / 4;
    const n = pulseLength(ctx.handles);
    const k = pulseHits(ctx.handles);
    // Music box: the pattern rotates clockwise one step per 16th; a sound fires
    // when a hit passes its angle. Pattern index under angle `rot` at step s is rot − s.
    for (let s = Math.ceil(t0 / step); s * step < t1; s++) {
      for (const m of members) {
        const rot = Math.round(m.angle * n) % n;
        const idx = (((rot - s) % n) + n) % n;
        if (!euclid(idx, k, n)) continue;
        const vel = Math.min(1, 0.35 + 0.6 * m.depth + (idx === 0 ? 0.08 : 0));
        emit(m.soundId, s * step, 0, vel, step * 0.8);
      }
    }
  },
};

// ---------- drift: seeded random-walk melody ----------

const DRIFT_RATES = [1, 2, 3, 4, 6, 8];

export function driftRate(h: Record<string, number>): number {
  return DRIFT_RATES[Math.round((h.rate ?? 0.4) * (DRIFT_RATES.length - 1))];
}

export const drift: GeneratorType = {
  id: 'drift',
  label: 'drift',
  role: 'generator',
  shape: 'circle',
  glyph: '≈',
  defaultShape: { r: 170 },
  handles: [
    { key: 'rate', label: 'rate', default: 0.4, format: (_v, h) => `${driftRate(h)} / beat` },
    { key: 'entropy', label: 'entropy', default: 0.4, format: (v) => `±${(v * 4).toFixed(1)} deg` },
  ],
  createState: () => new Map<string, number>(),
  schedule(ctx, t0, t1, members, emit) {
    const state = ctx.state as Map<string, number>;
    const stepT = ctx.ppq / driftRate(ctx.handles);
    const maxStep = (ctx.handles.entropy ?? 0.4) * 4;
    for (let s = Math.ceil(t0 / stepT); s * stepT < t1; s++) {
      for (const m of members) {
        let deg = state.get(m.soundId) ?? 0;
        deg += Math.round((ctx.rand(m.soundHash, s * 2) * 2 - 1) * maxStep);
        if (deg > 7) deg = 14 - deg;
        if (deg < -7) deg = -14 - deg;
        state.set(m.soundId, deg);
        const p = 0.15 + 0.85 * m.depth;
        if (ctx.rand(m.soundHash, s * 2 + 1) < p) emit(m.soundId, s * stepT, deg, 0.45 + 0.4 * m.depth, stepT * 0.9);
      }
    }
  },
};

// ---------- grid: cellular automaton ----------

export const GRID_CELL = 24;
const GRID_RATES = [0.5, 1, 2, 4];

export function gridRate(h: Record<string, number>): number {
  return GRID_RATES[Math.round((h.rate ?? 0.33) * (GRID_RATES.length - 1))];
}

interface GridState {
  cols: number;
  rows: number;
  cells: Uint8Array;
  born: Uint8Array;
  gen: number;
  shown: number;
}

function gridDims(ctx: FieldContext): [number, number] {
  return [Math.max(2, Math.floor(ctx.baseW / GRID_CELL)), Math.max(2, Math.floor(ctx.baseH / GRID_CELL))];
}

function gridFit(ctx: FieldContext): GridState {
  const st = ctx.state as GridState;
  const [cols, rows] = gridDims(ctx);
  if (st.cols === cols && st.rows === rows) return st;
  const cells = new Uint8Array(cols * rows);
  for (let r = 0; r < Math.min(rows, st.rows); r++)
    for (let c = 0; c < Math.min(cols, st.cols); c++) cells[r * cols + c] = st.cells[r * st.cols + c];
  st.cols = cols;
  st.rows = rows;
  st.cells = cells;
  st.born = new Uint8Array(cols * rows);
  return st;
}

function gridStep(st: GridState, ctx: FieldContext, g: number): void {
  const { cols, rows, cells } = st;
  const next = new Uint8Array(cols * rows);
  const born = st.born;
  born.fill(0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = (r + dr + rows) % rows;
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          n += cells[rr * cols + ((c + dc + cols) % cols)];
        }
      }
      const i = r * cols + c;
      const alive = cells[i] ? n === 2 || n === 3 : n === 3;
      if (alive) {
        next[i] = 1;
        if (!cells[i]) born[i] = 1;
      }
    }
  }
  const total = cols * rows;
  const births = Math.round((ctx.handles.entropy ?? 0.25) * total * 0.04);
  for (let j = 0; j < births; j++) {
    const i = Math.floor(ctx.rand(2, g * 64 + j) * total);
    if (!next[i]) {
      next[i] = 1;
      born[i] = 1;
    }
  }
  st.cells = next;
  st.gen = g;
}

export const grid: GeneratorType = {
  id: 'grid',
  label: 'grid',
  role: 'generator',
  shape: 'rect',
  glyph: '▦',
  defaultShape: { w: 240, h: 168 },
  handles: [
    { key: 'rate', label: 'rate', default: 0.33, format: (_v, h) => `${gridRate(h)} gen / beat` },
    { key: 'entropy', label: 'entropy', default: 0.25, format: pct },
  ],
  createState(ctx) {
    const [cols, rows] = gridDims(ctx);
    const cells = new Uint8Array(cols * rows);
    for (let i = 0; i < cells.length; i++) cells[i] = ctx.rand(1, i) < 0.3 ? 1 : 0;
    return { cols, rows, cells, born: new Uint8Array(cols * rows), gen: -1, shown: -2 } satisfies GridState;
  },
  schedule(ctx, t0, t1, members, emit) {
    const st = gridFit(ctx);
    const genT = ctx.ppq / gridRate(ctx.handles);
    for (let g = Math.ceil(t0 / genT); g * genT < t1; g++) {
      gridStep(st, ctx, g);
      for (const m of members) {
        let c = Math.floor((m.lx / ctx.w + 0.5) * st.cols);
        let r = Math.floor((0.5 - m.ly / ctx.h) * st.rows);
        c = c < 0 ? 0 : c >= st.cols ? st.cols - 1 : c;
        r = r < 0 ? 0 : r >= st.rows ? st.rows - 1 : r;
        if (st.born[r * st.cols + c]) emit(m.soundId, g * genT, 0, 0.4 + 0.6 * m.depth, genT * 0.9);
      }
    }
  },
  visual(ctx) {
    const st = ctx.state as GridState;
    if (st.shown === st.gen) return null;
    st.shown = st.gen;
    return { cols: st.cols, rows: st.rows, cells: st.cells.slice(), gen: st.gen };
  },
};
