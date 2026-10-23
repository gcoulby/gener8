import type { SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp, midiToHz, sinTurns } from '../dspmath.ts';
import { Adsr, IDLE } from '../dsp/adsr.ts';
import { Glide } from '../dsp/glide.ts';

/** Drawbar footages as multiples of the played note: 16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1'. */
const BARS = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];

export const REGISTRATIONS = ['flute', 'jazz', 'gospel', 'full', 'reed', 'bright'];

/** Drawbar settings (0..8) per registration, in BARS order. */
const DRAWBARS = [
  [0, 0, 8, 0, 0, 0, 0, 0, 0],
  [8, 8, 8, 0, 0, 0, 0, 0, 0],
  [8, 8, 8, 8, 0, 0, 0, 0, 0],
  [8, 8, 8, 8, 8, 8, 8, 8, 8],
  [0, 0, 8, 8, 4, 6, 6, 4, 2],
  [0, 0, 6, 8, 0, 8, 0, 0, 8],
];

/**
 * A tonewheel organ: nine sine drawbars set by a registration, a key click,
 * decaying percussion on the 2nd or 3rd harmonic, and a rotary speaker
 * (vibrato plus a spinning pan) whose speed and depth you set.
 */
class OrganVoice implements Voice {
  private ctx: VoiceContext;
  private p: Record<string, number>;
  private amp = new Adsr();
  private ph = new Float64Array(BARS.length);
  private lv = new Float64Array(BARS.length);
  private hz = 220;
  private pitch = 60;
  private gl = new Glide();
  private vel = 0;
  private perc = 0;
  private click = 0;
  private rot = 0;
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
    this.perc = 1;
    this.click = 1;
    this.rot = this.ctx.rand(6, this.serial++);
    this.amp.gateOn();
  }

  glide(from: number, seconds: number): void {
    this.gl.start(from, this.pitch, seconds);
  }

  noteOff(): void {
    this.amp.gateOff();
  }

  render(out: Float64Array, start: number, end: number, _mod: unknown, outR?: Float64Array): void {
    const p = this.p;
    const oR = outR ?? out;
    this.amp.set(0.004, 0.05, 1, p.release);
    const bars = DRAWBARS[Math.round(p.registration)];
    let norm = 0;
    for (const b of bars) norm += b;
    const lv = this.lv;
    for (let k = 0; k < BARS.length; k++) lv[k] = bars[k] / Math.max(8, norm);
    const hz = this.hz * this.gl.ratio(end - start);
    const percK = p.percussion * 0.6;
    const percH = p.percHarm > 0.5 ? 4 : 3; // index of 2nd (4') or 3rd (2⅔') harmonic
    const pd = exp(-1 / (0.25 * SR));
    const rotHz = 0.7 + p.leslie * 6;
    const depth = p.depth;
    const gain = this.vel * 0.35;
    const ph = this.ph;
    let { perc, click, rot } = this;
    for (let i = start; i < end; i++) {
      const vib = 1 + depth * 0.004 * sinTurns(rot);
      let s = 0;
      for (let k = 0; k < BARS.length; k++) {
        let l = lv[k];
        if (k === percH) l += percK * perc;
        if (l > 0) s += l * sinTurns(ph[k]);
        ph[k] += Math.min(0.45, (hz * BARS[k] * vib) / SR);
        if (ph[k] >= 1) ph[k] -= 1;
      }
      // a short burst of the top drawbars as the contacts close
      s += click * p.click * 0.3 * sinTurns(ph[8] * 3.01);
      click *= 0.993;
      perc *= pd;
      rot += rotHz / SR;
      if (rot >= 1) rot -= 1;
      const pan = depth * 0.5 * sinTurns(rot + 0.25);
      const e = this.amp.next() * gain * s;
      out[i] += e * (0.7 - pan);
      oR[i] += e * (0.7 + pan);
    }
    this.perc = perc;
    this.click = click;
    this.rot = rot;
  }
}

export const organ: SoundType = {
  id: 'organ',
  label: 'organ',
  mode: 'event',
  stereo: true,
  glyph: 'arch',
  maxVoices: 8,
  params: [
    { key: 'registration', label: 'drawbars', min: 0, max: REGISTRATIONS.length - 1, default: 1, curve: 'lin', options: REGISTRATIONS },
    { key: 'percussion', label: 'percussion', min: 0, max: 1, default: 0.4, curve: 'lin' },
    { key: 'percHarm', label: 'perc 2nd → 3rd', min: 0, max: 1, default: 1, curve: 'lin' },
    { key: 'click', label: 'key click', min: 0, max: 1, default: 0.3, curve: 'lin' },
    { key: 'leslie', label: 'rotor speed', min: 0, max: 1, default: 0.15, curve: 'lin' },
    { key: 'depth', label: 'rotor depth', min: 0, max: 1, default: 0.5, curve: 'lin' },
    { key: 'release', label: 'release', min: 0.01, max: 4, default: 0.12, curve: 'exp', unit: 's' },
  ],
  panel: [
    { kind: 'knobs', title: 'tone', keys: ['registration', 'percussion', 'percHarm', 'click'] },
    { kind: 'knobs', title: 'rotary', keys: ['leslie', 'depth', 'release'] },
  ],
  createVoice: (ctx) => new OrganVoice(ctx),
};
