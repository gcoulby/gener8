const SIZE = 1 << 18;
const MASK = SIZE - 1;

/** Stereo ping-pong delay with damped feedback and glided delay time. */
export class PingPong {
  private bl = new Float32Array(SIZE);
  private br = new Float32Array(SIZE);
  private w = 0;
  private cur = -1;
  private lpL = 0;
  private lpR = 0;

  process(l: Float64Array, r: Float64Array, n: number, timeSamples: number, fb: number): void {
    const target = timeSamples < 1 ? 1 : timeSamples > SIZE - 4 ? SIZE - 4 : timeSamples;
    if (this.cur < 0) this.cur = target;
    const { bl, br } = this;
    let w = this.w;
    let cur = this.cur;
    let lpL = this.lpL;
    let lpR = this.lpR;
    for (let i = 0; i < n; i++) {
      cur += (target - cur) * 0.0005;
      const rp = w - cur;
      const i0 = Math.floor(rp);
      const fr = rp - i0;
      const a = i0 & MASK;
      const b = (i0 + 1) & MASK;
      const dl = bl[a] + (bl[b] - bl[a]) * fr;
      const dr = br[a] + (br[b] - br[a]) * fr;
      lpL += (dl - lpL) * 0.55;
      lpR += (dr - lpR) * 0.55;
      bl[w & MASK] = (l[i] + r[i]) * 0.5 + lpR * fb;
      br[w & MASK] = lpL * fb;
      w++;
      l[i] = dl * 0.8;
      r[i] = dr * 0.8;
    }
    this.w = w & MASK;
    this.cur = cur;
    this.lpL = lpL;
    this.lpR = lpR;
  }
}
