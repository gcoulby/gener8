import { SR } from '../constants.ts';
import { sinTurns, tanh } from '../dspmath.ts';

const SIZE = 1 << 18;
const MASK = SIZE - 1;

/**
 * Tape-style stereo ping-pong delay: wow and flutter on the read head,
 * saturating feedback, and repeats that darken and thin with each pass.
 * Changing the time glides the head, so it bends pitch like tape.
 */
export class TapeDelay {
  private bl = new Float32Array(SIZE);
  private br = new Float32Array(SIZE);
  private w = 0;
  private cur = -1;
  private lpL = 0;
  private lpR = 0;
  private hpL = 0;
  private hpR = 0;
  private wow = 0;
  private flut = 0;

  process(l: Float64Array, r: Float64Array, n: number, timeSamples: number, fb: number, tone: number): void {
    const target = timeSamples < 1 ? 1 : timeSamples > SIZE - 2048 ? SIZE - 2048 : timeSamples;
    if (this.cur < 0) this.cur = target;
    const { bl, br } = this;
    const lpc = 0.08 + tone * 0.5;
    let { w, cur, lpL, lpR, hpL, hpR, wow, flut } = this;
    for (let i = 0; i < n; i++) {
      cur += (target - cur) * 0.00004;
      wow += 0.43 / SR;
      if (wow >= 1) wow -= 1;
      flut += 5.7 / SR;
      if (flut >= 1) flut -= 1;
      const m = cur * 0.0022 * sinTurns(wow) + 9 * sinTurns(flut) * 0.12;
      const rpl = w - cur - m;
      const rpr = w - cur - m * 0.8 - 17;
      let i0 = Math.floor(rpl);
      let fr = rpl - i0;
      let a = bl[i0 & MASK];
      const dl = a + (bl[(i0 + 1) & MASK] - a) * fr;
      i0 = Math.floor(rpr);
      fr = rpr - i0;
      a = br[i0 & MASK];
      const dr = a + (br[(i0 + 1) & MASK] - a) * fr;
      // darken (lowpass) and thin (highpass ~ 100 Hz) the repeats
      lpL += (dl - lpL) * lpc;
      lpR += (dr - lpR) * lpc;
      hpL += (lpL - hpL) * 0.013;
      hpR += (lpR - hpR) * 0.013;
      const fl = tanh((lpL - hpL) * fb * 1.3) / 1.3;
      const fR = tanh((lpR - hpR) * fb * 1.3) / 1.3;
      bl[w & MASK] = (l[i] + r[i]) * 0.5 + fR;
      br[w & MASK] = fl;
      w++;
      l[i] = dl * 0.85;
      r[i] = dr * 0.85;
    }
    this.w = w & MASK;
    this.cur = cur;
    this.lpL = lpL;
    this.lpR = lpR;
    this.hpL = hpL;
    this.hpR = hpR;
    this.wow = wow;
    this.flut = flut;
  }
}
