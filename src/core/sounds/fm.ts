import type { SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp, midiToHz, sinTurns, TAU } from '../dspmath.ts';
import { Adsr, IDLE } from '../dsp/adsr.ts';
import { Glide } from '../dsp/glide.ts';

/**
 * Two-operator FM: a sine modulator phase-modulates a sine carrier. The
 * modulation index has its own fast decay, so notes start bright and settle
 * into a pure tone: bells at high ratios, soft keys at ratio 1.
 */
class FmVoice implements Voice {
  private p: Record<string, number>;
  private amp = new Adsr();
  private cph = 0;
  private mph = 0;
  private hz = 220;
  private pitch = 60;
  private gl = new Glide();
  private vel = 0;
  private ienv = 0;
  private idc = 0;
  private kDecay = -1;

  constructor(ctx: VoiceContext) {
    this.p = ctx.params;
  }

  get active(): boolean {
    return this.amp.stage !== IDLE;
  }

  noteOn(pitch: number, velocity: number): void {
    this.hz = midiToHz(pitch);
    this.pitch = pitch;
    this.gl.stop();
    this.vel = velocity;
    this.ienv = 0.4 + 0.6 * velocity;
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
    this.amp.set(p.a, p.d, p.s, p.r);
    if (p.indexDecay !== this.kDecay) {
      this.kDecay = p.indexDecay;
      this.idc = exp(-5 / Math.max(1, p.indexDecay * SR));
    }
    const hz = this.hz * this.gl.ratio(end - start);
    const cInc = Math.min(0.45, hz / SR);
    const mInc = Math.min(0.45, (hz * p.ratio) / SR);
    const index = p.index / TAU;
    const floor = p.sustainIndex;
    const gain = this.vel * 0.32;
    const idc = this.idc;
    let { cph, mph, ienv } = this;
    for (let i = start; i < end; i++) {
      const m = sinTurns(mph) * index * (floor + (1 - floor) * ienv);
      out[i] += sinTurns(cph + m) * this.amp.next() * gain;
      cph += cInc;
      if (cph >= 1) cph -= 1;
      mph += mInc;
      if (mph >= 1) mph -= 1;
      ienv *= idc;
    }
    this.cph = cph;
    this.mph = mph;
    this.ienv = ienv;
  }
}

export const fm: SoundType = {
  id: 'fm',
  label: 'fm',
  mode: 'event',
  glyph: 'star',
  maxVoices: 8,
  params: [
    { key: 'ratio', label: 'ratio', min: 0.5, max: 8, default: 3.5, curve: 'lin' },
    { key: 'index', label: 'index', min: 0, max: 10, default: 3, curve: 'lin' },
    { key: 'indexDecay', label: 'index decay', min: 0.02, max: 6, default: 0.6, curve: 'exp', unit: 's' },
    { key: 'sustainIndex', label: 'index floor', min: 0, max: 1, default: 0.05, curve: 'lin' },
    { key: 'a', label: 'attack', min: 0.001, max: 4, default: 0.002, curve: 'exp', unit: 's' },
    { key: 'd', label: 'decay', min: 0.01, max: 8, default: 2.5, curve: 'exp', unit: 's' },
    { key: 's', label: 'sustain', min: 0, max: 1, default: 0, curve: 'lin' },
    { key: 'r', label: 'release', min: 0.01, max: 10, default: 3, curve: 'exp', unit: 's' },
  ],
  panel: [
    { kind: 'knobs', title: 'operators', keys: ['ratio', 'index', 'indexDecay', 'sustainIndex'] },
    { kind: 'adsr', title: 'amp (VCA)', keys: ['a', 'd', 's', 'r'] },
  ],
  createVoice: (ctx) => new FmVoice(ctx),
};
