import type { SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { midiToHz, sinTurns } from '../dspmath.ts';
import { Adsr, IDLE } from '../dsp/adsr.ts';
import { Glide } from '../dsp/glide.ts';
import { Svf } from '../dsp/svf.ts';
import { Xorshift } from '../rand.ts';

/**
 * A breathy pipe, like a flute or pan pipe: a soft, nearly pure tone with
 * breath noise tuned around it and a puff of air ("chiff") as each note
 * starts. Overblow pushes the tone up onto the octave and twelfth, as blowing
 * harder does. A delayed vibrato comes in on held notes.
 */
class PipeVoice implements Voice {
  private ctx: VoiceContext;
  private p: Record<string, number>;
  private amp = new Adsr();
  private rng = new Xorshift();
  private tuned = new Svf();
  private chiffF = new Svf();
  private air = 0;
  private ph = 0;
  private hz = 440;
  private pitch = 69;
  private gl = new Glide();
  private vel = 0;
  private age = 0;
  private chiff = 0;
  private serial = 0;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
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
    this.age = 0;
    this.chiff = 0.5 + velocity * 0.5;
    this.rng.seed(this.ctx.rand(7, this.serial++) * 4294967296);
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
    this.amp.set(p.a, 0.2, 0.85, p.r);
    const hz = this.hz * this.gl.ratio(end - start);
    const dt = Math.min(0.45, hz / SR);
    this.tuned.set(hz, 0.92);
    this.chiffF.set(Math.min(SR * 0.4, hz * 2.5), 0.6);
    const ob = p.overblow;
    // overblow: the fundamental gives way to the octave, then the twelfth
    const h1 = 1 - ob * 0.8;
    const h2 = 0.08 + ob * 0.7;
    const h3 = 0.03 + ob * ob * 0.4;
    const breath = p.breath;
    const gain = this.vel * 0.28;
    let { ph, air, age, chiff } = this;
    for (let i = start; i < end; i++) {
      const e = this.amp.next();
      const vib = age > SR * 0.35 ? p.vibrato * 0.004 * sinTurns((age / SR) * 5) : 0;
      const tone = h1 * sinTurns(ph) + h2 * sinTurns(ph * 2) + h3 * sinTurns(ph * 3);
      ph += dt * (1 + vib);
      if (ph >= 1) ph -= 1;
      const n = this.rng.next();
      air += (n - air) * 0.3;
      const s = tone + this.tuned.bp(n) * breath * 1.2 + air * breath * 0.08 + this.chiffF.bp(n) * chiff;
      chiff *= 0.9985;
      out[i] += s * e * gain;
      age++;
    }
    this.ph = ph;
    this.air = air;
    this.age = age;
    this.chiff = chiff;
  }
}

export const pipe: SoundType = {
  id: 'pipe',
  label: 'pipe',
  mode: 'event',
  glyph: 'capsule',
  maxVoices: 6,
  params: [
    { key: 'breath', label: 'breath', min: 0, max: 1, default: 0.35, curve: 'lin' },
    { key: 'overblow', label: 'overblow', min: 0, max: 1, default: 0.1, curve: 'lin' },
    { key: 'vibrato', label: 'vibrato', min: 0, max: 1, default: 0.4, curve: 'lin' },
    { key: 'a', label: 'attack', min: 0.005, max: 2, default: 0.05, curve: 'exp', unit: 's' },
    { key: 'r', label: 'release', min: 0.01, max: 4, default: 0.25, curve: 'exp', unit: 's' },
  ],
  panel: [
    { kind: 'knobs', title: 'breath', keys: ['breath', 'overblow', 'vibrato'] },
    { kind: 'knobs', title: 'envelope', keys: ['a', 'r'] },
  ],
  createVoice: (ctx) => new PipeVoice(ctx),
};
