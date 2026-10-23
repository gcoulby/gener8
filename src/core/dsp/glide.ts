import { SR } from '../constants.ts';
import { exp2 } from '../dspmath.ts';

/**
 * Portamento for event voices: a pitch offset in semitones that starts at the
 * previous note and runs linearly to zero over the glide time. Voices multiply
 * their frequency by ratio() once per render call.
 */
export class Glide {
  private semis = 0;
  private rate = 0;

  start(from: number, to: number, seconds: number): void {
    this.semis = from - to;
    this.rate = seconds > 0 ? Math.abs(this.semis) / (seconds * SR) : Infinity;
  }

  stop(): void {
    this.semis = 0;
  }

  /** Frequency ratio for the next n samples, then moves on by n. */
  ratio(n: number): number {
    const s = this.semis;
    if (s === 0) return 1;
    const step = this.rate * n;
    this.semis = s > 0 ? (s > step ? s - step : 0) : s < -step ? s + step : 0;
    return exp2(s / 12);
  }
}
