import { SR } from '../constants.ts';
import { exp2, LOG2_10, sinTurns } from '../dspmath.ts';

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

const N = 8;
const LENS = [1031, 1327, 1523, 1801, 2053, 2311, 2633, 2953].map((n) => Math.round(n * 2.1));
const MOD_DEPTH = 14; // samples
const MOD_RATES = [0.11, 0.13, 0.17, 0.19, 0.23, 0.29, 0.31, 0.37]; // Hz
const SIZE = 8192; // power of two ≥ max length + modulation
const MASK = SIZE - 1;
const PRE = 1440; // 30 ms pre-delay
const NORM = 1 / Math.sqrt(8);
// Output sign patterns decorrelate left and right.
const OUT_L = [1, -1, 1, -1, 1, 1, -1, -1];
const OUT_R = [1, 1, -1, -1, -1, 1, 1, -1];

/**
 * 8-line feedback delay network: stereo input diffusion, 30 ms pre-delay, slowly
 * modulated line lengths (removes metallic ringing), Hadamard mixing, per-line
 * damping and a low cut on the input so long tails stay clear.
 */
export class Fdn {
  private lines = Array.from({ length: N }, () => new Float64Array(SIZE));
  private w = 0;
  private lp = new Float64Array(N);
  private g = new Float64Array(N);
  private v = new Float64Array(N);
  private mph = new Float64Array(N);
  private pre = new Float64Array(PRE * 2);
  private pw = 0;
  private hpL = 0;
  private hpR = 0;
  private difL = [new Allpass(142, 0.7), new Allpass(379, 0.68), new Allpass(107, 0.65), new Allpass(277, 0.62)];
  private difR = [new Allpass(151, 0.7), new Allpass(353, 0.68), new Allpass(113, 0.65), new Allpass(263, 0.62)];
  private damp = 0.3;
  private kSize = -1;

  set(size: number, damping: number): void {
    this.damp = 0.05 + damping * 0.8;
    if (size === this.kSize) return;
    this.kSize = size;
    const rt60 = 1 + size * size * 24;
    for (let k = 0; k < N; k++) this.g[k] = exp2((-3 * LOG2_10 * LENS[k]) / (SR * rt60));
  }

  process(l: Float64Array, r: Float64Array, n: number): void {
    const { lines, lp, g, v, mph, pre, difL, difR } = this;
    const damp = this.damp;
    let w = this.w;
    let pw = this.pw;
    let hpL = this.hpL;
    let hpR = this.hpR;
    for (let i = 0; i < n; i++) {
      // low cut (~150 Hz) then pre-delay
      hpL += (l[i] - hpL) * 0.02;
      hpR += (r[i] - hpR) * 0.02;
      pre[pw] = l[i] - hpL;
      pre[pw + 1] = r[i] - hpR;
      pw += 2;
      if (pw >= pre.length) pw = 0;
      let xl = pre[pw];
      let xr = pre[pw + 1];
      xl = difL[3].run(difL[2].run(difL[1].run(difL[0].run(xl))));
      xr = difR[3].run(difR[2].run(difR[1].run(difR[0].run(xr))));

      for (let k = 0; k < N; k++) {
        const ph = mph[k] + MOD_RATES[k] / SR;
        mph[k] = ph >= 1 ? ph - 1 : ph;
        const rp = w - LENS[k] - MOD_DEPTH * (1 + sinTurns(ph));
        const i0 = Math.floor(rp);
        const fr = rp - i0;
        const line = lines[k];
        const a = line[i0 & MASK];
        const d = a + (line[(i0 + 1) & MASK] - a) * fr;
        lp[k] = d + (lp[k] - d) * damp;
        v[k] = lp[k] * g[k];
      }
      let outL = 0;
      let outR = 0;
      for (let k = 0; k < N; k++) {
        outL += v[k] * OUT_L[k];
        outR += v[k] * OUT_R[k];
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
      const wi = w & MASK;
      for (let k = 0; k < N; k++) lines[k][wi] = v[k] * NORM + (k & 1 ? xr : xl) * 0.4;
      w++;
      l[i] = outL * 0.32;
      r[i] = outR * 0.32;
    }
    this.w = w & MASK;
    this.pw = pw;
    this.hpL = hpL;
    this.hpR = hpR;
  }
}
