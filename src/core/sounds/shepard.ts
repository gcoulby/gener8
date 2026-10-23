import type { ModFrame, SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { cosTurns, exp2, midiToHz, sinTurns } from '../dspmath.ts';

const PARTIALS = 8;

/**
 * A Shepard tone: eight partials an octave apart slide up (or down) together
 * under a fixed bell-shaped window, so each fades in at the bottom and out at
 * the top and the whole seems to rise forever. The sound's pitch sets the
 * pitch class; a fifth can be layered in. Events brighten it briefly.
 */
class ShepardVoice implements Voice {
  private ctx: VoiceContext;
  private ph = new Float64Array(PARTIALS * 2);
  private amps = new Float64Array(PARTIALS);
  private dts = new Float64Array(PARTIALS);
  private shift = 0;
  private pitch = -1;
  private fade = 0;
  private acc = 0;
  private accPeak = 0;
  readonly active = true;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
    for (let i = 0; i < PARTIALS * 2; i++) this.ph[i] = ctx.rand(3, i);
    this.shift = ctx.rand(4, 0);
  }

  noteOn(): void {}
  noteOff(): void {}

  accent(velocity: number): void {
    if (velocity > this.accPeak) this.accPeak = velocity;
  }

  /** Partial k takes partial k + by's phase (the new one at the end starts silent anyway). */
  private rotate(by: number): void {
    const ph = this.ph;
    for (const o of [0, PARTIALS]) {
      if (by > 0) for (let k = 0; k < PARTIALS - 1; k++) ph[o + k] = ph[o + k + 1];
      else for (let k = PARTIALS - 1; k > 0; k--) ph[o + k] = ph[o + k - 1];
    }
  }

  render(out: Float64Array, start: number, end: number, mod: ModFrame, outR?: Float64Array): void {
    const p = this.ctx.params;
    const oR = outR ?? out;
    if (this.pitch < 0) this.pitch = mod.pitch;
    this.pitch += (mod.pitch - this.pitch) * 0.02;
    const n = end - start;
    // octaves per second, signed by direction
    const rate = p.rate * (p.direction > 0.5 ? -1 : 1);
    this.shift += (rate * n) / SR;
    // a partial that slides a whole octave becomes its neighbour: hand its phase on so nothing jumps
    if (this.shift >= 1) {
      this.shift -= 1;
      this.rotate(1);
    } else if (this.shift < 0) {
      this.shift += 1;
      this.rotate(-1);
    }
    // lowest partial sits four octaves under the pitch class
    const base = midiToHz(this.pitch) * exp2(-4);
    const ph = this.ph;
    const fifth = p.fifth;
    let fade = this.fade;
    let acc = this.acc;
    let accPeak = this.accPeak;
    const { amps, dts } = this;
    for (let k = 0; k < PARTIALS; k++) {
      const u = (k + this.shift) / PARTIALS;
      // raised cosine over log-frequency, narrowed by width
      const c = (u - 0.5) / (0.3 + p.width * 0.2);
      amps[k] = c > -1 && c < 1 ? 0.5 + 0.5 * cosTurns(c * 0.5) : 0;
      dts[k] = Math.min(0.45, (base * exp2(k + this.shift)) / SR);
    }
    for (let i = start; i < end; i++) {
      let l = 0;
      let r = 0;
      for (let k = 0; k < PARTIALS; k++) {
        const a = amps[k];
        if (a === 0) continue;
        const s = sinTurns(ph[k]) * a;
        const f = sinTurns(ph[k + PARTIALS]) * a * fifth;
        ph[k] += dts[k];
        if (ph[k] >= 1) ph[k] -= 1;
        ph[k + PARTIALS] += dts[k] * 1.5;
        if (ph[k + PARTIALS] >= 1) ph[k + PARTIALS] -= 1;
        // alternate partials lean left and right
        if (k & 1) {
          l += s * 0.6 + f;
          r += s;
        } else {
          l += s;
          r += s * 0.6 + f;
        }
      }
      if (fade < 1) fade += 1 / (4 * SR);
      acc += (accPeak - acc) * 0.0008;
      accPeak *= 0.99997;
      const g = 0.075 * fade * (1 + acc * 0.5);
      out[i] += l * g;
      oR[i] += r * g;
    }
    this.fade = fade;
    this.acc = acc;
    this.accPeak = accPeak;
  }
}

export const shepard: SoundType = {
  id: 'shepard',
  label: 'shepard',
  mode: 'sustained',
  stereo: true,
  glyph: 'shell',
  maxVoices: 1,
  params: [
    { key: 'rate', label: 'speed', min: 0.005, max: 0.5, default: 0.04, curve: 'exp', unit: 'oct/s' },
    { key: 'direction', label: 'rise → fall', min: 0, max: 1, default: 0, curve: 'lin', options: ['rising', 'falling'] },
    { key: 'width', label: 'width', min: 0, max: 1, default: 0.5, curve: 'lin' },
    { key: 'fifth', label: 'fifth', min: 0, max: 1, default: 0.25, curve: 'lin' },
  ],
  panel: [{ kind: 'knobs', title: 'endless', keys: ['rate', 'direction', 'width', 'fifth'] }],
  createVoice: (ctx) => new ShepardVoice(ctx),
};
