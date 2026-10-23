import type { SoundType, Voice, VoiceContext } from '../types.ts';
import { SR } from '../constants.ts';
import { exp2, log2, midiToHz, sinTurns } from '../dspmath.ts';
import { Svf } from '../dsp/svf.ts';
import { Adsr, IDLE } from '../dsp/adsr.ts';
import { Glide } from '../dsp/glide.ts';

export const WAVETABLES = ['analog', 'vocal', 'organ', 'glass'];

const SIZE = 1024;
const MASK = SIZE - 1;
const FRAMES = 8;
/** Mip levels: level k holds up to TOP_PARTIALS >> k partials. */
const LEVELS = 9;
const TOP_PARTIALS = 256;

/** Amplitude of partial n (1-based) in frame f (0..FRAMES-1) of a bank, before normalising. */
function partial(bank: number, f: number, n: number): number {
  const u = f / (FRAMES - 1);
  switch (bank) {
    case 0: {
      // sine → triangle → saw → square
      const tri = n % 2 ? 1 / (n * n) : 0;
      const saw = 1 / n;
      const sq = n % 2 ? 1 / n : 0;
      if (u < 1 / 3) return n === 1 ? 1 - u * 3 + u * 3 * tri : u * 3 * tri;
      if (u < 2 / 3) return tri + (saw - tri) * (u * 3 - 1);
      return saw + (sq - saw) * (u * 3 - 2);
    }
    case 1: {
      // a saw through a formant that sweeps from "oo" to "ee"
      const f1 = 3 + u * 2;
      const f2 = 8 + u * 22;
      const bump = (c: number, w: number) => 1 / (1 + ((n - c) / w) * ((n - c) / w));
      return (1 / n) * (0.25 + bump(f1, 1.5) * 2 + bump(f2, 3) * 1.4);
    }
    case 2: {
      // drawbars switching in, low to high
      const bars = [1, 2, 3, 4, 6, 8, 10, 12, 16];
      const i = bars.indexOf(n);
      if (i < 0) return 0;
      const on = 1 + u * (bars.length - 1);
      return i < on ? (i + 1 > on ? on - i : 1) / (1 + i * 0.3) : 0;
    }
    default: {
      // sparse, bright partials that thin out to a pure high ring
      const keep = (n * 7919 + f * 104729) % 5 < 2 || n === 1;
      return keep ? (1 / Math.sqrt(n)) * (1 - u * 0.7 * (n === 1 ? 1 : 0)) : 0;
    }
  }
}

const banks: Float32Array[][][] = [];

/** Tables for a bank, built on first use: [frame][level] → one cycle. */
function bank(b: number): Float32Array[][] {
  if (banks[b]) return banks[b];
  const out: Float32Array[][] = [];
  for (let f = 0; f < FRAMES; f++) {
    const amps = new Float64Array(TOP_PARTIALS + 1);
    for (let n = 1; n <= TOP_PARTIALS; n++) amps[n] = partial(b, f, n);
    const levels: Float32Array[] = [];
    for (let k = 0; k < LEVELS; k++) {
      const top = TOP_PARTIALS >> k;
      const t = new Float64Array(SIZE);
      for (let n = 1; n <= top; n++) {
        const a = amps[n];
        if (!a) continue;
        for (let i = 0; i < SIZE; i++) t[i] += a * sinTurns(((i * n) & MASK) / SIZE);
      }
      let peak = 1e-9;
      for (let i = 0; i < SIZE; i++) peak = Math.max(peak, Math.abs(t[i]));
      const tab = new Float32Array(SIZE + 1);
      for (let i = 0; i < SIZE; i++) tab[i] = t[i] / peak;
      tab[SIZE] = tab[0];
      levels.push(tab);
    }
    out.push(levels);
  }
  banks[b] = out;
  return out;
}

/** The mip level whose partials all sit below Nyquist at hz. */
function levelFor(hz: number): number {
  const fit = SR / 2 / hz;
  if (fit >= TOP_PARTIALS) return 0;
  const k = Math.ceil(log2(TOP_PARTIALS / fit));
  return k >= LEVELS ? LEVELS - 1 : k;
}

function read(t: Float32Array, ph: number): number {
  const x = ph * SIZE;
  const i = Math.floor(x);
  const a = t[i];
  return a + (t[i + 1] - a) * (x - i);
}

/**
 * Scans through eight frames of a wavetable bank (analog shapes, a vowel
 * sweep, drawbars, glassy partials). Position picks the frame, the envelope
 * can scan it further, and warp bends the phase for extra harmonics. Each
 * frame is band-limited per octave, so high notes stay clean.
 */
class WavetableVoice implements Voice {
  private p: Record<string, number>;
  private amp = new Adsr();
  private svf = new Svf();
  private ph = 0;
  private hz = 220;
  private pitch = 60;
  private gl = new Glide();
  private vel = 0;

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
    const amp = this.amp;
    amp.set(p.a, p.d, p.s, p.r);
    const hz = this.hz * this.gl.ratio(end - start);
    const dt = Math.min(0.45, hz / SR);
    const frames = bank(Math.round(p.table));
    // warp makes the waveform's top partials reach higher: use a lower level to stay clean
    const lv = levelFor(hz * (1 + p.warp * 3));
    const warp = p.warp * 0.85;
    const gain = this.vel * 0.3;
    this.svf.set(p.cutoff * exp2(p.envAmt * amp.level), 0.15);
    let ph = this.ph;
    for (let i = start; i < end; i++) {
      const e = amp.next();
      let pos = p.position + p.scan * e;
      pos = (pos < 0 ? 0 : pos > 1 ? 1 : pos) * (FRAMES - 1);
      const f0 = Math.floor(pos);
      const f1 = f0 + 1 < FRAMES ? f0 + 1 : f0;
      // phase warp: squeeze the first part of the cycle, stretch the rest
      const k = 0.5 - warp * 0.45;
      const wp = ph < k ? (ph / k) * 0.5 : 0.5 + ((ph - k) / (1 - k)) * 0.5;
      const a = read(frames[f0][lv], wp);
      const s = a + (read(frames[f1][lv], wp) - a) * (pos - f0);
      out[i] += this.svf.lp(s) * e * gain;
      ph += dt;
      if (ph >= 1) ph -= 1;
    }
    this.ph = ph;
  }
}

export const wavetable: SoundType = {
  id: 'wavetable',
  label: 'wavetable',
  mode: 'event',
  glyph: 'heptagon',
  maxVoices: 8,
  params: [
    { key: 'table', label: 'table', min: 0, max: WAVETABLES.length - 1, default: 0, curve: 'lin', options: WAVETABLES },
    { key: 'position', label: 'position', min: 0, max: 1, default: 0.4, curve: 'lin' },
    { key: 'scan', label: 'env → position', min: -1, max: 1, default: 0.3, curve: 'lin' },
    { key: 'warp', label: 'warp', min: 0, max: 1, default: 0, curve: 'lin' },
    { key: 'cutoff', label: 'cutoff', min: 60, max: 16000, default: 5000, curve: 'exp', unit: 'Hz' },
    { key: 'envAmt', label: 'env → cutoff', min: 0, max: 4, default: 1, curve: 'lin', unit: 'oct' },
    { key: 'a', label: 'attack', min: 0.001, max: 6, default: 0.01, curve: 'exp', unit: 's' },
    { key: 'd', label: 'decay', min: 0.01, max: 6, default: 0.8, curve: 'exp', unit: 's' },
    { key: 's', label: 'sustain', min: 0, max: 1, default: 0.5, curve: 'lin' },
    { key: 'r', label: 'release', min: 0.01, max: 10, default: 1.2, curve: 'exp', unit: 's' },
  ],
  panel: [
    { kind: 'knobs', title: 'table', keys: ['table', 'position', 'scan', 'warp'] },
    { kind: 'knobs', title: 'filter', keys: ['cutoff', 'envAmt'] },
    { kind: 'adsr', title: 'amp', keys: ['a', 'd', 's', 'r'] },
  ],
  createVoice: (ctx) => new WavetableVoice(ctx),
};
