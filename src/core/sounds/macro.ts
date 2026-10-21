import type { ModFrame, SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp, exp2, log2, midiToHz, sinTurns } from '../dspmath.ts';
import { blepSaw, blepSquare } from '../dsp/blep.ts';
import { Svf } from '../dsp/svf.ts';
import { Xorshift } from '../rand.ts';
import { indexToMidi, nearestIndex } from '../music.ts';

export const MACRO_MODELS = ['vowel', 'chords', 'swarm', 'fold', 'grain', 'particle', 'modal', 'string'];
const VOWEL = 0;
const CHORDS = 1;
const SWARM = 2;
const FOLD = 3;
const GRAIN = 4;
const PARTICLE = 5;
const MODAL = 6;
const STRING = 7;

/** What harmonics, timbre and morph do in each model. */
export const MACRO_ROLES: [string, string, string][] = [
  ['vocal tract size', 'vowel (u o a e i)', 'breath'],
  ['chord (triad → 7th → 9th → 4ths)', 'open voicing', 'saw → square → sine'],
  ['detune', 'brightness', 'octave scatter'],
  ['symmetry', 'fold drive', 'sine → triangle'],
  ['formant', 'second formant', 'roughness'],
  ['resonator spread', 'density', 'resonance'],
  ['material (string → bar → bell)', 'brightness', 'damping'],
  ['ring brightness', 'pluck brightness', 'bow'],
];

/** Per-model output trims, so every model sits at about the same loudness. */
const LEVEL = [0.25, 0.16, 0.11, 0.3, 0.42, 4, 0.15, 0.65];

/** Formants (Hz) for u, o, a, e, i: timbre morphs along this line. */
const VOWELS = [
  [300, 870, 2240],
  [570, 840, 2410],
  [730, 1090, 2440],
  [530, 1840, 2480],
  [270, 2290, 3010],
];
const FORMANT_GAIN = [1, 0.55, 0.3];

/** Chord shapes as scale steps: triad, 7th, 9th, stacked 4ths. */
const SHAPES = [
  [0, 2, 4],
  [0, 2, 4, 6],
  [0, 2, 4, 6, 8],
  [0, 3, 6, 9],
];

const SWARM_N = 8;
const PARTIALS = 8;
/** Partial ratios: a string (harmonic), a free bar, and a bell. Harmonics morphs across them. */
const RATIOS = [
  [1, 2, 3, 4, 5, 6, 7, 8],
  [1, 2.756, 5.404, 8.933, 13.34, 18.64, 24.81, 31.87],
  [1, 2, 2.4, 3, 4.5, 5.33, 6, 8.2],
];
const STR_SIZE = 4096;
const STR_MASK = STR_SIZE - 1;

/**
 * After Mutable Instruments Plaits: one voice, eight synthesis models, and the
 * same three macro controls on each. Harmonics, timbre and morph mean
 * something different per model (see sounds.md), so a map axis on any of them
 * morphs whatever model is chosen. Every note goes through a low-pass gate: it
 * decays over `decay`, and colour sets how much it also darkens as it fades.
 */
class MacroVoice implements Voice {
  private ctx: VoiceContext;
  private rng = new Xorshift();
  private serial = 0;
  active = false;
  private model = MODAL;
  private pitch = 60;
  private hz = 220;
  private vel = 0;
  private env = 0;
  private att = 0;
  private lpg = 0;
  private kDecay = -1;
  private dc = 0;
  private fresh = false;
  // shared oscillator state
  private ph = new Float64Array(SWARM_N);
  private dt = new Float64Array(SWARM_N);
  private amp = new Float64Array(PARTIALS);
  private ampDc = new Float64Array(PARTIALS);
  private svf = [new Svf(), new Svf(), new Svf()];
  private fgain = new Float64Array(3);
  /** Particle: resonator energy grows with pitch; this evens it out (1 at middle C). */
  private pnorm = 1;
  // grain
  private gEnv = 0;
  private gPh1 = 0;
  private gPh2 = 0;
  private gCount = 0;
  // string
  private str = new Float64Array(STR_SIZE);
  private sw = 0;
  private slen = 100;
  private sfb = 0.99;
  private slp = 0;
  private burst = 0;
  private exLp = 0;

  constructor(ctx: VoiceContext) {
    this.ctx = ctx;
  }

  noteOn(pitch: number, velocity: number): void {
    const p = this.ctx.params;
    this.model = Math.max(0, Math.min(MACRO_MODELS.length - 1, Math.round(p.model)));
    this.pitch = pitch;
    this.hz = Math.max(20, midiToHz(pitch));
    this.vel = velocity;
    // a restrike attacks from where the gate is, so it doesn't click
    this.att = this.env;
    this.rng.seed(this.ctx.rand(4, this.serial++) * 4294967296);
    this.fresh = true;
    this.active = true;
    if (this.model === STRING) {
      this.str.fill(0);
      this.slen = Math.min(STR_SIZE - 4, SR / this.hz);
      this.burst = Math.ceil(this.slen);
      this.slp = 0;
    } else if (this.model === MODAL) {
      for (let k = 0; k < PARTIALS; k++) this.ph[k] = 0;
    } else if (this.model === GRAIN) {
      this.gCount = 0;
    }
  }

  noteOff(): void {}

  /** Set up what depends on the note and the key, once per note, at its first render. */
  private start(mod: ModFrame): void {
    const p = this.ctx.params;
    const h = p.harmonics;
    const tb = p.timbre;
    const mo = p.morph;
    const hz = this.hz;
    if (this.model === CHORDS) {
      const shape = SHAPES[Math.min(SHAPES.length - 1, Math.floor(h * SHAPES.length))];
      const idx = nearestIndex(this.pitch, mod.keyRoot, mod.steps);
      for (let k = 0; k < SWARM_N; k++) {
        if (k >= shape.length) {
          this.dt[k] = 0;
          continue;
        }
        // timbre opens the voicing: every other tone up an octave
        const up = k % 2 === 1 && tb > (k / shape.length) * 0.8 ? 12 : 0;
        const m = indexToMidi(idx + shape[k], mod.keyRoot, mod.steps) + up + (this.pitch - indexToMidi(idx, mod.keyRoot, mod.steps));
        this.dt[k] = Math.min(0.45, midiToHz(m) / SR);
        this.ph[k] = this.ctx.rand(5, k);
      }
    } else if (this.model === SWARM) {
      for (let k = 0; k < SWARM_N; k++) {
        const det = (this.ctx.rand(6, k) * 2 - 1) * h * 60;
        // morph scatters some oscillators an octave up or down
        const oct = this.ctx.rand(7, k) < mo * 0.6 ? (this.ctx.rand(8, k) < 0.5 ? -12 : 12) : 0;
        this.dt[k] = Math.min(0.45, (hz * exp2((det / 100 + oct) / 12)) / SR);
        this.ph[k] = this.ctx.rand(9, k);
      }
      this.svf[0].set(300 * exp2(tb * 5.7), 0.15);
    } else if (this.model === MODAL) {
      const r = h < 0.5 ? 0 : 1;
      const f = h < 0.5 ? h * 2 : h * 2 - 1;
      const tilt = 1.6 - tb * 1.4;
      for (let k = 0; k < PARTIALS; k++) {
        const ratio = RATIOS[r][k] + (RATIOS[r + 1][k] - RATIOS[r][k]) * f;
        const inc = (hz * ratio) / SR;
        this.dt[k] = inc < 0.45 ? inc : 0;
        this.amp[k] = this.dt[k] ? exp2(-tilt * log2(k + 1)) : 0;
        // the gate sets the overall decay; morph makes the upper partials die away faster still
        this.ampDc[k] = exp((-6.9 * (exp2(k * mo * 0.8) - 1)) / (Math.max(0.05, p.decay) * SR));
      }
    } else if (this.model === PARTICLE) {
      this.pnorm = Math.sqrt(262 / hz);
      for (let j = 0; j < 3; j++) {
        const spread = 1 + (this.ctx.rand(10, this.serial * 4 + j) * 2 - 1) * h * 0.5;
        this.svf[j].set(hz * [1, 1.5, 2.25][j] * spread, 0.5 + mo * 0.49);
      }
    } else if (this.model === STRING) {
      this.sfb = exp2(-9.966 / (hz * Math.max(0.1, p.decay * 1.5)));
    }
  }

  render(out: Float64Array, start: number, end: number, mod: ModFrame): void {
    const p = this.ctx.params;
    if (this.fresh) {
      this.fresh = false;
      this.start(mod);
    }
    if (p.decay !== this.kDecay) {
      this.kDecay = p.decay;
      this.dc = exp(-6.9 / Math.max(1, p.decay * SR));
    }
    const h = p.harmonics;
    const tb = p.timbre;
    const mo = p.morph;
    const colour = p.colour;
    const hz = this.hz;
    const inc = Math.min(0.45, hz / SR);
    const model = this.model;
    const gain = this.vel * LEVEL[model];
    const { ph, dt, svf, rng } = this;

    if (model === VOWEL) {
      // formants follow timbre (u → o → a → e → i); harmonics sets the vocal tract size
      const x = tb * (VOWELS.length - 1);
      const i0 = Math.min(VOWELS.length - 2, Math.floor(x));
      const fx = x - i0;
      const size = exp2((h - 0.5) * 1.2);
      for (let j = 0; j < 3; j++) {
        const f = (VOWELS[i0][j] + (VOWELS[i0 + 1][j] - VOWELS[i0][j]) * fx) * size;
        svf[j].set(f, 0.82);
        this.fgain[j] = FORMANT_GAIN[j];
      }
    }

    let { env, att, lpg } = this;
    const dc = this.dc;
    for (let i = start; i < end; i++) {
      let x = 0;
      switch (model) {
        case VOWEL: {
          const q = ph[0];
          const src = blepSaw(q, inc) * (1 - mo * 0.7) + rng.next() * mo * 0.6;
          ph[0] = q + inc >= 1 ? q + inc - 1 : q + inc;
          x = svf[0].bp(src) * this.fgain[0] + svf[1].bp(src) * this.fgain[1] + svf[2].bp(src) * this.fgain[2];
          break;
        }
        case CHORDS: {
          for (let k = 0; k < SWARM_N; k++) {
            const d = dt[k];
            if (!d) continue;
            const q = ph[k];
            const saw = blepSaw(q, d);
            const sq = blepSquare(q, d);
            const sine = sinTurns(q);
            x += mo < 0.5 ? saw + (sq - saw) * mo * 2 : sq + (sine - sq) * (mo * 2 - 1);
            ph[k] = q + d >= 1 ? q + d - 1 : q + d;
          }
          break;
        }
        case SWARM: {
          for (let k = 0; k < SWARM_N; k++) {
            const q = ph[k];
            x += blepSaw(q, dt[k]);
            ph[k] = q + dt[k] >= 1 ? q + dt[k] - 1 : q + dt[k];
          }
          x = svf[0].lp(x);
          break;
        }
        case FOLD: {
          // a sine wavefolder: morph blends the input from sine to triangle,
          // timbre is the drive, harmonics the symmetry (even harmonics)
          const q = ph[0];
          const tri = q < 0.5 ? 4 * q - 1 : 3 - 4 * q;
          const s = sinTurns(q) * (1 - mo) + tri * mo;
          x = sinTurns(s * (0.25 + tb * 2.5) + (h - 0.5) * 0.5);
          ph[0] = q + inc >= 1 ? q + inc - 1 : q + inc;
          break;
        }
        case GRAIN: {
          // VOSIM-like: two formant sines restarted every pitch period, decaying across it
          if (--this.gCount <= 0) {
            const jitter = 1 + rng.next() * mo * 0.25;
            this.gCount = (SR / hz) * jitter;
            this.gEnv = 1;
            this.gPh1 = 0;
            this.gPh2 = 0;
          }
          const f1 = (200 * exp2(h * 4)) / SR;
          const f2 = f1 * (1.5 + tb * 2.5);
          x = (sinTurns(this.gPh1) + 0.5 * sinTurns(this.gPh2)) * this.gEnv;
          this.gPh1 += f1;
          this.gPh2 += f2;
          this.gEnv *= 1 - (hz / SR) * 3;
          break;
        }
        case PARTICLE: {
          // dust: random impulses (timbre is how many) through three tuned resonators
          const rate = 20 * exp2(tb * 6.6);
          const imp = rng.next() * 0.5 + 0.5 < rate / SR ? rng.next() : 0;
          x = (svf[0].bp(imp) + svf[1].bp(imp) * 0.7 + svf[2].bp(imp) * 0.5) * this.pnorm;
          break;
        }
        case MODAL: {
          for (let k = 0; k < PARTIALS; k++) {
            const a = this.amp[k];
            if (a < 1e-5) continue;
            const q = ph[k];
            x += sinTurns(q) * a;
            const n = q + dt[k];
            ph[k] = n >= 1 ? n - 1 : n;
            this.amp[k] = a * this.ampDc[k];
          }
          break;
        }
        case STRING: {
          // Karplus-Strong: harmonics is how long the highs ring, timbre the
          // pluck's brightness, morph bows the string (a steady rough excitation)
          let ex = 0;
          if (this.burst > 0) {
            this.exLp += (rng.next() - this.exLp) * (0.05 + 0.95 * tb);
            ex = this.exLp;
            this.burst--;
          }
          ex += rng.next() * mo * mo * 0.08 * env;
          const b = this.str;
          const w = this.sw;
          const rp = w - this.slen;
          const j0 = Math.floor(rp);
          const fr = rp - j0;
          const a = b[j0 & STR_MASK];
          const v = a + (b[(j0 + 1) & STR_MASK] - a) * fr;
          this.slp = v + (this.slp - v) * (0.65 - h * 0.6);
          const y = ex + this.sfb * this.slp;
          b[w & STR_MASK] = y;
          this.sw = w + 1;
          x = y;
          break;
        }
      }

      // low-pass gate: a fast attack, then the decay; colour lets it darken as it closes
      if (att < 1) {
        att += 1 / (0.002 * SR);
        env = att > 1 ? 1 : att;
      } else env *= dc;
      const cut = colour * 0.98 * (1 - env);
      lpg += (x - lpg) * (1 - cut);
      out[i] += lpg * env * gain;
    }
    this.env = env;
    this.att = att;
    this.lpg = lpg;
    if (att >= 1 && env < 1e-4) {
      this.active = false;
      this.env = 0;
      this.lpg = 0;
      for (const f of this.svf) f.reset();
      if (this.model === STRING) this.str.fill(0);
    }
  }
}

export const macro: SoundType = {
  id: 'macro',
  label: 'macro',
  mode: 'event',
  glyph: 'octagon',
  maxVoices: 6,
  params: [
    { key: 'model', label: 'model', min: 0, max: MACRO_MODELS.length - 1, default: MODAL, curve: 'lin', options: MACRO_MODELS },
    { key: 'harmonics', label: 'harmonics', min: 0, max: 1, default: 0.5, curve: 'lin' },
    { key: 'timbre', label: 'timbre', min: 0, max: 1, default: 0.5, curve: 'lin' },
    { key: 'morph', label: 'morph', min: 0, max: 1, default: 0.3, curve: 'lin' },
    { key: 'decay', label: 'decay', min: 0.05, max: 10, default: 1.5, curve: 'exp', unit: 's' },
    { key: 'colour', label: 'colour', min: 0, max: 1, default: 0.5, curve: 'lin' },
  ],
  panel: [
    {
      kind: 'knobs',
      title: 'model',
      keys: ['model'],
      hint: (p) => {
        const [h, t, m] = MACRO_ROLES[Math.max(0, Math.min(MACRO_ROLES.length - 1, Math.round(p.model ?? MODAL)))];
        return [`harmonics: ${h}`, `timbre: ${t}`, `morph: ${m}`];
      },
    },
    { kind: 'knobs', title: 'macros', keys: ['harmonics', 'timbre', 'morph'] },
    { kind: 'knobs', title: 'low-pass gate', keys: ['decay', 'colour'] },
  ],
  createVoice: (ctx) => new MacroVoice(ctx),
};
