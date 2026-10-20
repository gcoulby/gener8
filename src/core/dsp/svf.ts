import { SR } from '../constants.ts';
import { tanTurns } from '../dspmath.ts';

/** Topology-preserving state-variable filter (Zavalishin / Simper), lowpass output. */
export class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 1;
  private a2 = 0;
  private a3 = 0;
  private lastHz = -1;
  private lastRes = -1;

  /** res in [0, 1): 0 is Butterworth-ish, near 1 self-oscillates. */
  set(hz: number, res: number): void {
    if (hz === this.lastHz && res === this.lastRes) return;
    this.lastHz = hz;
    this.lastRes = res;
    const fc = hz < 20 ? 20 : hz > SR * 0.45 ? SR * 0.45 : hz;
    const g = tanTurns(fc / (2 * SR));
    const k = 2 - 1.96 * (res < 0 ? 0 : res > 1 ? 1 : res);
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  lp(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return v2;
  }

  reset(): void {
    this.ic1 = this.ic2 = 0;
  }
}
