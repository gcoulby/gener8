import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Patch } from '../src/core/types.ts';
import { interleave } from '../src/core/render.ts';

export function loadPatch(name: string): Patch {
  return JSON.parse(readFileSync(new URL(`../patches/${name}.json`, import.meta.url), 'utf8'));
}

export function hashAudio(left: Float32Array, right: Float32Array): string {
  const buf = interleave(left, right);
  return createHash('sha256').update(new Uint8Array(buf.buffer)).digest('hex');
}

export function goldens(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
  } catch {
    return {};
  }
}
