// PolyBLEP band-limited oscillators. Phase in [0, 1), dt = freq / sr.

export function polyblep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

export function blepSaw(ph: number, dt: number): number {
  return 2 * ph - 1 - polyblep(ph, dt);
}

export function blepSquare(ph: number, dt: number): number {
  let h = ph + 0.5;
  if (h >= 1) h -= 1;
  return (ph < 0.5 ? 1 : -1) + polyblep(ph, dt) - polyblep(h, dt);
}
