import type { LoggedEdit, Patch } from './types.ts';
import { SR } from './constants.ts';
import { Engine } from './engine.ts';

export interface RenderResult {
  left: Float32Array;
  right: Float32Array;
  engine: Engine;
}

/**
 * Offline render: the same Engine as the worklet, with no I/O. With `edits`
 * (a log from a live session) it reproduces that session bit-for-bit.
 */
export function renderOffline(
  patch: Patch,
  seconds: number,
  opts: { edits?: LoggedEdit[]; chunk?: number; startSample?: number } = {},
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
