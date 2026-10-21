// JSON with object keys sorted recursively, so two equal patches always give
// the same string regardless of key order.

export function canonicalJson(x: unknown): string {
  return JSON.stringify(sortKeys(x));
}

function sortKeys(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(x).sort()) out[k] = sortKeys((x as Record<string, unknown>)[k]);
    return out;
  }
  return x;
}
