// Deterministic transcendental functions.
//
// Math.sin/exp/pow/log/tanh/atan are not specified to be bit-identical across
// JS engines or versions, so the core never calls them. Everything here is built
// from + - * /, Math.sqrt (correctly rounded by IEEE 754) and Math.floor.

export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const LN2 = 0.6931471805599453;
export const LOG2E = 1.4426950408889634;
export const LOG2_10 = 3.321928094887362;

// ---------- sine ----------

function sinSeries(x: number): number {
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n < 12; n++) {
    term *= -x2 / (2 * n * (2 * n + 1));
    sum += term;
  }
  return sum;
}

const SIN_N = 4096;
const SIN_TABLE = new Float64Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i++) {
  const ph = i / SIN_N;
  const x = ph < 0.25 ? ph : ph < 0.75 ? 0.5 - ph : ph - 1;
  SIN_TABLE[i] = sinSeries(x * TAU);
}

/** sin(2π·t), t in turns. */
export function sinTurns(t: number): number {
  t -= Math.floor(t);
  const f = t * SIN_N;
  const i = f | 0;
  const a = SIN_TABLE[i];
  return a + (SIN_TABLE[i + 1] - a) * (f - i);
}

export function cosTurns(t: number): number {
  return sinTurns(t + 0.25);
}

export function sin(x: number): number {
  return sinTurns(x / TAU);
}

export function cos(x: number): number {
  return sinTurns(x / TAU + 0.25);
}

/** tan(π·fc/sr) style helper: tan of an angle given in turns. */
export function tanTurns(t: number): number {
  return sinTurns(t) / cosTurns(t);
}

// ---------- exp / log ----------

const POW2_OFFSET = 1000;
const POW2 = new Float64Array(2 * POW2_OFFSET + 1);
POW2[POW2_OFFSET] = 1;
for (let i = 1; i <= POW2_OFFSET; i++) {
  POW2[POW2_OFFSET + i] = POW2[POW2_OFFSET + i - 1] * 2;
  POW2[POW2_OFFSET - i] = POW2[POW2_OFFSET - i + 1] * 0.5;
}

export function exp2(x: number): number {
  if (x >= POW2_OFFSET) return POW2[2 * POW2_OFFSET];
  if (x <= -POW2_OFFSET) return 0;
  const n = Math.floor(x);
  const y = (x - n) * LN2;
  let term = 1;
  let sum = 1;
  for (let k = 1; k <= 14; k++) {
    term *= y / k;
    sum += term;
  }
  return sum * POW2[n + POW2_OFFSET];
}

export function exp(x: number): number {
  return exp2(x * LOG2E);
}

export function log2(x: number): number {
  if (!(x > 0)) return -POW2_OFFSET;
  let e = 0;
  while (x >= 2) {
    x *= 0.5;
    e++;
  }
  while (x < 1) {
    x *= 2;
    e--;
  }
  const z = (x - 1) / (x + 1);
  const z2 = z * z;
  let term = z;
  let sum = z;
  for (let k = 3; k <= 31; k += 2) {
    term *= z2;
    sum += term / k;
  }
  return e + 2 * sum * LOG2E;
}

export function pow(a: number, b: number): number {
  return exp2(b * log2(a));
}

// ---------- misc ----------

/** Rational tanh approximation, exact ±1 beyond |x| = 3. */
export function tanh(x: number): number {
  if (x >= 3) return 1;
  if (x <= -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

function atanSmall(z: number): number {
  const z2 = z * z;
  let term = z;
  let sum = z;
  for (let k = 3; k <= 25; k += 2) {
    term *= -z2;
    sum += term / k;
  }
  return sum;
}

export function atan(z: number): number {
  const s = z < 0 ? -1 : 1;
  z = z < 0 ? -z : z;
  // Halve the angle three times: tan(θ/2) = z / (1 + sqrt(1 + z²)).
  z = z / (1 + Math.sqrt(1 + z * z));
  z = z / (1 + Math.sqrt(1 + z * z));
  z = z / (1 + Math.sqrt(1 + z * z));
  return s * 8 * atanSmall(z);
}

export function atan2(y: number, x: number): number {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return PI / 2;
  if (y < 0) return -PI / 2;
  return 0;
}

export function midiToHz(m: number): number {
  return 440 * exp2((m - 69) / 12);
}

export function dbToGain(db: number): number {
  return exp2((db * LOG2_10) / 20);
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
