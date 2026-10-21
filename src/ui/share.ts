// Share links. Everything lives in the URL fragment, which never reaches a server.
//   #s=<seed>&g=<generator version>   exactly what generatePatch(seed, g) builds
//   #p=<payload>                      any patch (see share/codec.ts)
// If the payload format ever changes it gets a new name (p2); `p` is never reinterpreted.

import type { Patch } from '../core/types.ts';
import { normalizePatch } from '../core/patch.ts';
import { canonicalJson } from '../core/canonical.ts';
import { generatePatch, generators, GENERATOR_VERSION } from '../core/generate.ts';
import { sanitisePatch, ShareError } from '../core/sanitise.ts';
import { decodePatchPayload, encodePatchPayload, PayloadError } from '../share/codec.ts';
import { EXAMPLES } from './examples.ts';

export { canonicalJson };

export type Link = { kind: 'seed'; seed: number; gen: number } | { kind: 'patch'; payload: string };

const UINT = /^\d{1,10}$/;

/** Fragment → link, or null for anything that isn't one. Never throws. */
export function parseHash(hash: string): Link | null {
  try {
    if (!hash.startsWith('#') || hash.length < 2) return null;
    const q = new URLSearchParams(hash.slice(1));
    const p = q.get('p');
    if (p !== null) return p ? { kind: 'patch', payload: p } : null;
    const s = q.get('s');
    if (s === null || !UINT.test(s) || Number(s) > 4294967295) return null;
    const g = q.get('g');
    if (g !== null && !/^\d{1,6}$/.test(g)) return null;
    const gen = g === null ? GENERATOR_VERSION : Number(g);
    if (gen < 1) return null;
    return { kind: 'seed', seed: Number(s), gen };
  } catch {
    return null;
  }
}

/** True when the patch is exactly what the generator makes from its own seed. */
function isGenerated(p: Patch): boolean {
  return canonicalJson(normalizePatch(p)) === canonicalJson(generatePatch(p.seed));
}

/** Throws ShareError with a message fit for a toast. */
export async function buildShare(patch: Patch, base = location.origin + location.pathname + location.search): Promise<{ url: string; kind: 'seed' | 'patch' }> {
  if (isGenerated(patch)) return { url: `${base}#s=${patch.seed}&g=${GENERATOR_VERSION}`, kind: 'seed' };
  const clean = sanitisePatch(normalizePatch(patch));
  return { url: `${base}#p=${await encodePatchPayload(clean)}`, kind: 'patch' };
}

/** Safe to replace without asking: empty, freshly generated, or an untouched bundled example. */
export function isDisposable(patch: Patch): boolean {
  if (!patch.objects.length) return true;
  if (isGenerated(patch)) return true;
  const c = canonicalJson(normalizePatch(patch));
  return EXAMPLES.some((ex) => canonicalJson(normalizePatch(ex.patch)) === c);
}

/** Link → sanitised patch. Throws ShareError (or PayloadError) with a toast-safe message. */
export async function resolveLink(link: Link): Promise<Patch> {
  if (link.kind === 'seed') {
    if (!generators[link.gen]) throw new ShareError('link needs a newer GENER8');
    return generatePatch(link.seed, link.gen);
  }
  return sanitisePatch(await decodePatchPayload(link.payload));
}

/** Message for a failed link load: only our own text, never anything decoded from the link. */
export function linkErrorMessage(err: unknown): string {
  return err instanceof ShareError || err instanceof PayloadError ? err.message : 'bad link';
}
