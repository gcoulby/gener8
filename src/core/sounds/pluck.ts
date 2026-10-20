import type { SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp2, midiToHz } from '../dspmath.ts';
import { Xorshift } from '../rand.ts';

const SIZE = 4096;
const MASK = SIZE - 1;

/** Karplus-Strong plucked string. */
class PluckVoice implements Voice {
  private ctx: VoiceContext;
  private rng = new Xorshift();
  private buf = new Float64Array(SIZE);
  private w = 0;
  private len = 100;
  private fb = 0.99;
  private lp = 0;
  private exLp = 0;
  private burst = 0;
  private vel = 0;
  private level = 0;
  private serial = 0;
  active = false;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
  }

  noteOn(pitch: number, velocity: number): void {
    const p = this.ctx.params;
    const hz = Math.max(20, midiToHz(pitch));
    this.len = Math.min(SIZE - 4, SR / hz);
    // -60 dB (2^-9.966) over `decay` seconds
    this.fb = exp2((-9.966 / hz) / Math.max(0.05, p.decay));
    this.rng.seed(this.ctx.rand(2, this.serial++) * 4294967296);
    this.burst = Math.ceil(this.len);
    this.vel = velocity;
    this.level = 1;
    this.active = true;
  }

  noteOff(): void {}

  render(out: Float64Array, start: number, end: number): void {
    const p = this.ctx.params;
    const exC = 0.05 + 0.95 * p.bright;
    const damp = p.damp * 0.85;
    const { buf, len, fb, rng } = this;
    const gain = this.vel * 0.5;
    let { w, lp, exLp, burst, level } = this;
    for (let i = start; i < end; i++) {
      let x = 0;
      if (burst > 0) {
        exLp += (rng.next() - exLp) * exC;
        x = exLp;
        burst--;
      }
      const rp = w - len;
      const i0 = Math.floor(rp);
      const fr = rp - i0;
      const a = buf[i0 & MASK];
      const v = a + (buf[(i0 + 1) & MASK] - a) * fr;
      lp = v + (lp - v) * damp;
      const y = x + fb * lp;
      buf[w & MASK] = y;
      w++;
      out[i] += y * gain;
      const ay = y < 0 ? -y : y;
      level = ay > level ? ay : level * 0.9995;
    }
    this.w = w & MASK;
    this.lp = lp;
    this.exLp = exLp;
    this.burst = burst;
    this.level = level;
    if (burst === 0 && level < 1e-4) {
      this.active = false;
      buf.fill(0);
      this.lp = 0;
    }
  }
}

export const pluck: SoundType = {
  id: 'pluck',
  label: 'pluck',
  mode: 'event',
  glyph: 'diamond',
  maxVoices: 6,
  params: [
    { key: 'decay', label: 'decay', min: 0.1, max: 10, default: 2, curve: 'exp', unit: 's' },
    { key: 'bright', label: 'brightness', min: 0, max: 1, default: 0.6, curve: 'lin' },
    { key: 'damp', label: 'damping', min: 0, max: 1, default: 0.3, curve: 'lin' },
  ],
  panel: [{ kind: 'knobs', title: 'string', keys: ['decay', 'bright', 'damp'] }],
  createVoice: (ctx) => new PluckVoice(ctx),
};
