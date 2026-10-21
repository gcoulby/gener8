import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Patch } from '../src/core/types.ts';
import { interleave } from '../src/core/render.ts';
import { canonicalJson } from '../src/core/canonical.ts';
import { generators } from '../src/core/generate.ts';

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

export const GOLDEN_SEEDS = [0, 1, 42, 424242, 4294967295];

/** sha256 of canonicalJson(generators[version](seed)) per golden seed, keyed `v<version>:<seed>`. Raw output, before migration. */
export function generatorHashes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of Object.keys(generators).map(Number)) {
    for (const s of GOLDEN_SEEDS) out[`v${v}:${s}`] = createHash('sha256').update(canonicalJson(generators[v](s))).digest('hex');
  }
  return out;
}
