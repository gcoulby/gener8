import type { SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp2, midiToHz, sinTurns } from '../dspmath.ts';
import { blepSaw } from '../dsp/blep.ts';
import { Glide } from '../dsp/glide.ts';

export const CHIP_WAVES = ['pulse 12%', 'pulse 25%', 'square', 'triangle', 'noise'];
const DUTY = [0.125, 0.25, 0.5];
export const CHIP_ARPS = ['off', 'octave', 'major', 'minor', 'power'];
/** Semitone steps each arpeggio cycles through. */
const ARP_STEPS = [[0], [0, 12], [0, 4, 7], [0, 3, 7], [0, 7, 12]];

/**
 * An 8-bit game console voice: band-limited pulses, a 4-bit stepped triangle
 * or a short-loop noise channel, with the volume stepped in 16 levels. A fast
 * arpeggio fakes chords on one voice, and a delayed vibrato wobbles long notes.
 */
class ChipVoice implements Voice {
  private p: Record<string, number>;
  private ph = 0;
  private hz = 220;
  private pitch = 60;
  private gl = new Glide();
  private vel = 0;
  private env = 0;
  private held = false;
  private age = 0;
  private lfsr = 1;
  private nph = 0;
  private nout = 1;

  constructor(ctx: VoiceContext) {
    this.p = ctx.params;
  }

  get active(): boolean {
    return this.env > 0;
  }

  noteOn(pitch: number, velocity: number): void {
    this.hz = midiToHz(pitch);
    this.pitch = pitch;
    this.gl.stop();
    this.vel = velocity;
    this.env = 1;
    this.held = true;
    this.age = 0;
  }

  glide(from: number, seconds: number): void {
    this.gl.start(from, this.pitch, seconds);
  }

  noteOff(): void {
    this.held = false;
  }

  render(out: Float64Array, start: number, end: number): void {
    const p = this.p;
    const wave = Math.round(p.wave);
    const steps = ARP_STEPS[Math.round(p.arp)];
    const arpLen = SR / p.arpRate;
    const base = this.hz * this.gl.ratio(end - start);
    // envelope: a linear decay to the sustain level while held, then the release
    const fall = 1 / Math.max(1, p.decay * SR);
    const rel = 1 / Math.max(1, p.release * SR);
    const gain = this.vel * 0.22;
    let { ph, env, age, lfsr, nph, nout } = this;
    for (let i = start; i < end; i++) {
      const step = steps[Math.floor(age / arpLen) % steps.length];
      const vib = age > SR * 0.25 ? p.vibrato * sinTurns((age / SR) * 5.5) : 0;
      const hz = base * exp2((step + vib * 0.5) / 12);
      const dt = Math.min(0.45, hz / SR);
      let s: number;
      if (wave < 3) {
        // pulse = the difference of two saws a duty apart
        let ph2 = ph + DUTY[wave];
        if (ph2 >= 1) ph2 -= 1;
        s = (blepSaw(ph, dt) - blepSaw(ph2, dt)) * 0.5;
      } else if (wave === 3) {
        const t = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
        s = Math.round(t * 7.5) / 7.5;
      } else {
        // 15-bit LFSR clocked at the note's pitch × 16 (the console's noise period)
        nph += dt * 16;
        while (nph >= 1) {
          nph -= 1;
          const bit = (lfsr ^ (lfsr >> 1)) & 1;
          lfsr = (lfsr >> 1) | (bit << 14);
          nout = lfsr & 1 ? 1 : -1;
        }
        s = nout * 0.6;
      }
      ph += dt;
      if (ph >= 1) ph -= 1;
      if (this.held) env = env > p.sustain ? env - fall : p.sustain;
      else env = env > rel ? env - rel : 0;
      out[i] += s * (Math.ceil(env * 15) / 15) * gain;
      age++;
    }
    this.ph = ph;
    this.env = env;
    this.age = age;
    this.lfsr = lfsr;
    this.nph = nph;
    this.nout = nout;
  }
}

export const chip: SoundType = {
  id: 'chip',
  label: 'chip',
  mode: 'event',
  glyph: 'cross',
  maxVoices: 6,
  params: [
    { key: 'wave', label: 'wave', min: 0, max: CHIP_WAVES.length - 1, default: 1, curve: 'lin', options: CHIP_WAVES },
    { key: 'arp', label: 'arpeggio', min: 0, max: CHIP_ARPS.length - 1, default: 0, curve: 'lin', options: CHIP_ARPS },
    { key: 'arpRate', label: 'arp speed', min: 6, max: 60, default: 24, curve: 'exp', unit: 'Hz' },
    { key: 'vibrato', label: 'vibrato', min: 0, max: 1, default: 0.3, curve: 'lin', unit: 'st' },
    { key: 'decay', label: 'decay', min: 0.02, max: 4, default: 0.4, curve: 'exp', unit: 's' },
    { key: 'sustain', label: 'sustain', min: 0, max: 1, default: 0.4, curve: 'lin' },
    { key: 'release', label: 'release', min: 0.01, max: 2, default: 0.08, curve: 'exp', unit: 's' },
  ],
  panel: [
    { kind: 'knobs', title: 'voice', keys: ['wave', 'arp', 'arpRate', 'vibrato'] },
    { kind: 'knobs', title: 'volume', keys: ['decay', 'sustain', 'release'] },
  ],
  createVoice: (ctx) => new ChipVoice(ctx),
};
