import { SR } from '../constants.ts';
import { exp } from '../dspmath.ts';

export const IDLE = 0;
const ATTACK = 1;
const DECAY = 2;
const SUSTAIN = 3;
const RELEASE = 4;

/** Linear attack, exponential decay and release. Retrigger attacks from the current level. */
export class Adsr {
  stage = IDLE;
  level = 0;
  private ai = 1;
  private dc = 0;
  private rc = 0;
  private s = 0;
  private ka = -1;
  private kd = -1;
  private kr = -1;

  set(a: number, d: number, s: number, r: number): void {
    if (a !== this.ka) {
      this.ka = a;
      this.ai = 1 / Math.max(1, a * SR);
    }
    if (d !== this.kd) {
      this.kd = d;
      this.dc = exp(-5 / Math.max(1, d * SR));
    }
    if (r !== this.kr) {
      this.kr = r;
      this.rc = exp(-5 / Math.max(1, r * SR));
    }
    this.s = s < 0 ? 0 : s > 1 ? 1 : s;
  }

  gateOn(): void {
    this.stage = ATTACK;
  }

  gateOff(): void {
    if (this.stage !== IDLE) this.stage = RELEASE;
  }

  next(): number {
    switch (this.stage) {
      case ATTACK:
        this.level += this.ai;
        if (this.level >= 1) {
          this.level = 1;
          this.stage = DECAY;
        }
        break;
      case DECAY:
        this.level = this.s + (this.level - this.s) * this.dc;
        if (this.level - this.s < 1e-4) {
          this.level = this.s;
          this.stage = SUSTAIN;
        }
        break;
      case SUSTAIN:
        this.level = this.s;
        break;
      case RELEASE:
        this.level *= this.rc;
        if (this.level < 1e-3) {
          this.level = 0;
          this.stage = IDLE;
        }
        break;
    }
    return this.level;
  }
}
