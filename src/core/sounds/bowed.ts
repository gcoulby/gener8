import type { SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { midiToHz, sinTurns } from '../dspmath.ts';
import { Adsr, IDLE } from '../dsp/adsr.ts';
import { Glide } from '../dsp/glide.ts';
import { Svf } from '../dsp/svf.ts';

const SIZE = 4096;
const MASK = SIZE - 1;

function tap(buf: Float64Array, w: number, d: number): number {
  const rp = w - d;
  const i = Math.floor(rp);
  const a = buf[i & MASK];
  return a + (buf[(i + 1) & MASK] - a) * (rp - i);
}

/**
 * A bowed string after the STK model: the string is two delay lines either
 * side of the bow, and the bow grips and slips through a friction curve.
 * Pressure steepens the curve (scratchier), position moves the bow along the
 * string, and the bridge's lowpass sets how bright it rings. A body resonance
 * colours the output.
 */
class BowedVoice implements Voice {
  private p: Record<string, number>;
  private amp = new Adsr();
  private neck = new Float64Array(SIZE);
  private bridge = new Float64Array(SIZE);
  private body = new Svf();
  private w = 0;
  private lp = 0;
  private hz = 220;
  private pitch = 57;
  private gl = new Glide();
  private vel = 0;
  private vib = 0;

  constructor(ctx: VoiceContext) {
    this.p = ctx.params;
    this.vib = ctx.rand(8, 0);
  }

  get active(): boolean {
    return this.amp.stage !== IDLE;
  }

  noteOn(pitch: number, velocity: number): void {
    this.hz = Math.max(40, midiToHz(pitch));
    this.pitch = pitch;
    this.gl.stop();
    this.vel = velocity;
    this.amp.gateOn();
  }

  glide(from: number, seconds: number): void {
    this.gl.start(from, this.pitch, seconds);
  }

  noteOff(): void {
    this.amp.gateOff();
  }

  render(out: Float64Array, start: number, end: number): void {
    const p = this.p;
    this.amp.set(p.a, 0.3, 0.9, p.r);
    const vibD = 1 + p.vibrato * 0.006 * sinTurns(this.vib);
    this.vib += ((end - start) * 5.2) / SR;
    const hz = this.hz * this.gl.ratio(end - start) * vibD;
    const tone = 0.25 + p.brightness * 0.7;
    // the loop is both delays plus the bridge lowpass's delay at low frequencies, (1 − c) / c
    const len = Math.min(SIZE - 4, SR / hz - (1 - tone) / tone);
    const beta = 0.06 + p.position * 0.3;
    const nLen = len * (1 - beta);
    const bLen = len * beta;
    const slope = 5 - 4 * p.pressure;
    this.body.set(500, 0.6);
    const vmax = 0.03 + 0.2 * this.vel;
    const { neck, bridge } = this;
    let { w, lp } = this;
    for (let i = start; i < end; i++) {
      const bowV = vmax * this.amp.next();
      lp += (tap(bridge, w, bLen) - lp) * tone;
      const bridgeRefl = -lp * 0.95;
      const nutRefl = -tap(neck, w, nLen);
      const dv = bowV - (bridgeRefl + nutRefl);
      // friction: the bow grips at small speed differences and slips at large ones
      let f = (dv < 0 ? -dv : dv) * slope + 0.75;
      f = 1 / (f * f * f * f);
      const nv = dv * (f > 1 ? 1 : f);
      neck[w & MASK] = bridgeRefl + nv;
      bridge[w & MASK] = nutRefl + nv;
      const y = bridge[w & MASK];
      out[i] += (y + this.body.bp(y) * 1.5) * 0.9;
      w++;
    }
    this.w = w & MASK;
    this.lp = lp;
  }
}

export const bowed: SoundType = {
  id: 'bowed',
  label: 'bowed',
  mode: 'event',
  glyph: 'lens',
  maxVoices: 6,
  params: [
    { key: 'pressure', label: 'bow pressure', min: 0, max: 1, default: 0.45, curve: 'lin' },
    { key: 'position', label: 'bow position', min: 0, max: 1, default: 0.25, curve: 'lin' },
    { key: 'brightness', label: 'brightness', min: 0, max: 1, default: 0.6, curve: 'lin' },
    { key: 'vibrato', label: 'vibrato', min: 0, max: 1, default: 0.4, curve: 'lin' },
    { key: 'a', label: 'attack', min: 0.01, max: 3, default: 0.12, curve: 'exp', unit: 's' },
    { key: 'r', label: 'release', min: 0.01, max: 6, default: 0.5, curve: 'exp', unit: 's' },
  ],
  panel: [
    { kind: 'knobs', title: 'bow', keys: ['pressure', 'position', 'brightness', 'vibrato'] },
    { kind: 'knobs', title: 'envelope', keys: ['a', 'r'] },
  ],
  createVoice: (ctx) => new BowedVoice(ctx),
};
