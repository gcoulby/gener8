import { SR } from '../constants.ts';
import { exp2, LOG2_10 } from '../dspmath.ts';

class Allpass {
  private buf: Float64Array;
  private i = 0;
  private g: number;
  constructor(len: number, g: number) {
    this.buf = new Float64Array(len);
    this.g = g;
  }
  run(x: number): number {
    const d = this.buf[this.i];
    const v = x - this.g * d;
    this.buf[this.i] = v;
    if (++this.i >= this.buf.length) this.i = 0;
    return d + this.g * v;
  }
}

const LENS = [1031, 1327, 1523, 1801, 2053, 2311, 2633, 2953].map((n) => Math.round(n * 1.35));
const N = 8;
const NORM = 1 / Math.sqrt(8);

/** 8-line feedback delay network with Hadamard mixing and input diffusion. */
export class Fdn {
  private lines = LENS.map((n) => new Float64Array(n));
  private pos = new Int32Array(N);
  private lp = new Float64Array(N);
  private g = new Float64Array(N);
  private v = new Float64Array(N);
  private diff = [new Allpass(142, 0.7), new Allpass(107, 0.7), new Allpass(379, 0.65), new Allpass(277, 0.65)];
  private damp = 0.3;
  private kSize = -1;

  set(size: number, damping: number): void {
    this.damp = 0.05 + damping * 0.75;
    if (size === this.kSize) return;
    this.kSize = size;
    const rt60 = 0.5 + size * size * 11.5;
    for (let k = 0; k < N; k++) this.g[k] = exp2((-3 * LOG2_10 * LENS[k]) / (SR * rt60));
  }

  process(l: Float64Array, r: Float64Array, n: number): void {
    const { lines, pos, lp, g, v, diff } = this;
    const damp = this.damp;
    for (let i = 0; i < n; i++) {
      let x = (l[i] + r[i]) * 0.5;
      x = diff[3].run(diff[2].run(diff[1].run(diff[0].run(x))));
      for (let k = 0; k < N; k++) {
        const d = lines[k][pos[k]];
        lp[k] = d + (lp[k] - d) * damp;
        v[k] = lp[k] * g[k];
      }
      for (let h = 1; h < N; h *= 2) {
        for (let a = 0; a < N; a += 2 * h) {
          for (let j = a; j < a + h; j++) {
            const p = v[j];
            const q = v[j + h];
            v[j] = p + q;
            v[j + h] = p - q;
          }
        }
      }
      let outL = 0;
      let outR = 0;
      for (let k = 0; k < N; k++) {
        const line = lines[k];
        const d = line[pos[k]];
        if (k & 1) outR += k & 2 ? -d : d;
        else outL += k & 2 ? -d : d;
        line[pos[k]] = v[k] * NORM + (k & 1 ? -x : x) * 0.35;
        if (++pos[k] >= line.length) pos[k] = 0;
      }
      l[i] = outL * 0.45;
      r[i] = outR * 0.45;
    }
  }
}
