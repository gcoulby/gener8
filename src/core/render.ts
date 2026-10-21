import type { LoggedEdit, Patch } from './types.ts';
import { SR } from './constants.ts';
import { Engine } from './engine.ts';

export interface RenderResult {
  left: Float32Array;
  right: Float32Array;
  engine: Engine;
}

/** Fade lengths in seconds at the start and end of a render; 0 for none. */
export interface Fade {
  in: number;
  out: number;
}

export const NO_FADE: Fade = { in: 0, out: 0 };

/** 0 → 1 with zero slope at both ends, so a fade starts and lands gently. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Gain at sample i of an n-sample render: silent on the first and last sample.
 * Plain arithmetic (no Math.sin and friends), so bit-identical on every engine.
 */
export function fadeGain(i: number, n: number, f: Fade): number {
  const a = f.in * SR;
  const b = f.out * SR;
  let g = 1;
  if (i < a) g = smooth(i / a);
  const left = n - 1 - i;
  if (left < b) g *= smooth(Math.max(0, left) / b);
  return g;
}

/** Fade `count` samples in place, which are samples start… of an n-sample render. */
export function applyFade(left: Float32Array, right: Float32Array, start: number, count: number, n: number, f: Fade, offset = 0): void {
  const end = start + count;
  const scale = (s: number) => {
    const g = fadeGain(s, n, f);
    left[offset + s - start] *= g;
    right[offset + s - start] *= g;
  };
  // only the ends need touching: s < in·SR, and n-1-s < out·SR
  const inEnd = Math.min(end, Math.ceil(f.in * SR));
  const outStart = Math.max(start, inEnd, Math.floor(n - 1 - f.out * SR) + 1);
  for (let s = start; s < inEnd; s++) scale(s);
  for (let s = outStart; s < end; s++) scale(s);
}

/**
 * Offline render: the same Engine as the worklet, with no I/O. With `edits`
 * (a log from a live session) it reproduces that session bit-for-bit.
 */
export function renderOffline(
  patch: Patch,
  seconds: number,
  opts: { edits?: LoggedEdit[]; chunk?: number; startSample?: number; fade?: Fade } = {},
): RenderResult {
  const engine = new Engine(patch);
  engine.recordEvents = false;
  if (opts.edits) engine.schedule(opts.edits);
  const n = Math.round(seconds * SR);
  const chunk = opts.chunk ?? 4096;
  const skip = opts.startSample ?? 0;
  if (skip > 0) {
    const sl = new Float32Array(chunk);
    const sr = new Float32Array(chunk);
    for (let i = 0; i < skip; i += chunk) engine.process(sl, sr, Math.min(chunk, skip - i));
  }
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i += chunk) engine.process(left, right, Math.min(chunk, n - i), i);
  if (opts.fade) applyFade(left, right, 0, n, n, opts.fade);
  return { left, right, engine };
}

/** Interleaved little-endian float32 bytes, the input to the test hashes. */
export function interleave(left: Float32Array, right: Float32Array): Float32Array {
  const out = new Float32Array(left.length * 2);
  for (let i = 0; i < left.length; i++) {
    out[2 * i] = left[i];
    out[2 * i + 1] = right[i];
  }
  return out;
}
