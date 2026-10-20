// Counter-based randomness: a value depends only on (seed, id, stream, index),
// never on how many values were drawn before it. See DESIGN.md §1.5.

export function hash32(x: number): number {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** FNV-1a over UTF-16 code units. */
export function strHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const TWO32 = 4294967296;

/** Uniform in [0, 1). */
export function rand(seed: number, id: number, stream: number, index: number): number {
  index = Math.floor(index);
  const hi = Math.floor(index / TWO32);
  const lo = index - hi * TWO32;
  let h = hash32((seed ^ 0x9e3779b9) >>> 0);
  h = hash32(h ^ id);
  h = hash32(h ^ stream);
  h = hash32(h ^ (hi >>> 0));
  h = hash32(h ^ (lo >>> 0));
  return h / TWO32;
}

/** Smooth value noise in [-1, 1]. */
export function noise1(seed: number, id: number, stream: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = rand(seed, id, stream, i);
  const b = rand(seed, id, stream, i + 1);
  const s = f * f * (3 - 2 * f);
  return (a + (b - a) * s) * 2 - 1;
}

/** Three octaves of value noise, roughly in [-1, 1]. */
export function fbm(seed: number, id: number, stream: number, t: number): number {
  return (
    (noise1(seed, id, stream, t) +
      0.5 * noise1(seed, id, stream + 101, t * 2) +
      0.25 * noise1(seed, id, stream + 202, t * 4)) /
    1.75
  );
}

/** Stateful audio-rate noise. Seeded from the counter-based rand, so still deterministic. */
export class Xorshift {
  s = 1;
  seed(x: number): void {
    this.s = (hash32(x >>> 0) | 1) >>> 0;
  }
  /** Uniform in [-1, 1). */
  next(): number {
    let s = this.s;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.s = s >>> 0;
    return this.s / 2147483648 - 1;
  }
}
