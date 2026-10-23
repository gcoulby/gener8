// Insert FX that colour or bend a sound: drive, worn vinyl, phaser, flanger,
// ring modulation and an octave divider. Modulated ones run in beats from
// ctx.tick, so they stay locked to the tempo and to each other.

import type { FieldContext, FxType } from '../types.ts';
import { exp2, midiToHz, sinTurns, tanh, tanTurns } from '../dspmath.ts';
import { Xorshift } from '../rand.ts';

const pct = (v: number) => Math.round(v * 100) + '%';

/** Beat position of sample i in the current block. */
function beatAt(ctx: FieldContext, i: number): number {
  return (ctx.tick + (i * ctx.tempo * ctx.ppq) / (60 * ctx.sr)) / ctx.ppq;
}

const MOD_BEATS = [0.5, 1, 2, 4, 8, 16];
const MOD_LABELS = ['1/8', '1/4', '1/2', '1 bar', '2 bars', '4 bars'];

function modIndex(v: number | undefined): number {
  return Math.round((v ?? 0.6) * (MOD_BEATS.length - 1));
}

// ---------- drive: waveshaper ----------

export function driveGain(h: Record<string, number>): number {
  return exp2((h.drive ?? 0.5) * 5);
}

const CURVES = ['soft', 'warm', 'hard', 'folded'];

/** Soft (tanh) blending into a sine wavefolder as curve goes 0 → 1. */
function shape(x: number, c: number): number {
  return (1 - c) * tanh(x) + c * sinTurns(x * 0.25);
}

/**
 * Insert: gain into a waveshaper whose curve runs from soft saturation to a
 * wavefolder. Run at 2× (linear up, box down) to tame the fold's aliasing.
 * Depth crossfades from clean.
 */
export const drive: FxType = {
  id: 'drive',
  label: 'drive',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '⌇',
  defaultShape: { r: 140 },
  handles: [
    { key: 'drive', label: 'drive', default: 0.5, format: (_v, h) => `+${Math.round((h.drive ?? 0.5) * 30.1)} dB` },
    { key: 'curve', label: 'curve', default: 0.2, format: (v) => CURVES[Math.min(3, Math.floor(v * 4))] },
  ],
  createProcessor(ctx) {
    let prev = 0;
    return {
      mono(buf, n, depth) {
        if (depth <= 0) return;
        const g = driveGain(ctx.handles);
        const c = ctx.handles.curve ?? 0.2;
        const out = 0.6 / (1 + (g - 1) * 0.05);
        for (let i = 0; i < n; i++) {
          const x = buf[i];
          const y = (shape(((prev + x) * 0.5) * g, c) + shape(x * g, c)) * 0.5 * out;
          prev = x;
          buf[i] = x + (y - x) * depth;
        }
      },
    };
  },
};

// ---------- wax: worn vinyl ----------

/**
 * Insert: a worn record. Crackle is sparse seeded pops; wear rolls the top
 * off, adds rumble and a little groove noise. Depth scales both. Stereo pairs
 * share a seed so the crackle sits in the middle.
 */
export const wax: FxType = {
  id: 'wax',
  label: 'wax',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '◉',
  defaultShape: { r: 160 },
  handles: [
    { key: 'crackle', label: 'crackle', default: 0.5, format: pct },
    { key: 'wear', label: 'wear', default: 0.5, format: pct },
  ],
  createState: () => ({ made: 0 }),
  createProcessor(ctx) {
    const st = ctx.state as { made: number };
    const rng = new Xorshift();
    rng.seed(ctx.rand(12, st.made++ >> 1) * 4294967296);
    let pop = 0;
    let popLp = 0;
    let lp = 0;
    let lp2 = 0;
    let rum = 0;
    let rum2 = 0;
    return {
      mono(buf, n, depth) {
        if (depth <= 0) return;
        const crackle = (ctx.handles.crackle ?? 0.5) * depth;
        const wear = (ctx.handles.wear ?? 0.5) * depth;
        const rate = crackle * crackle * 0.0012;
        const cut = 0.5 * exp2(-wear * 3); // ~16 kHz → ~2 kHz
        const noise = wear * 0.004;
        for (let i = 0; i < n; i++) {
          const r = rng.next();
          if (r * 0.5 + 0.5 < rate) pop = rng.next() * (0.15 + 0.35 * crackle);
          popLp += (pop - popLp) * 0.5;
          pop *= 0.82;
          rum += (rng.next() - rum) * 0.004;
          rum2 += (rum - rum2) * 0.004;
          lp += (buf[i] - lp) * cut;
          lp2 += (lp - lp2) * cut;
          const worn = lp2 + rum2 * wear * 6 + rng.next() * noise;
          buf[i] = buf[i] + (worn - buf[i]) * wear * 1.6 + popLp;
        }
      },
    };
  },
};

// ---------- phaser ----------

const PHASE_STAGES = 6;

/**
 * Insert: six allpass stages swept between ~200 Hz and ~3 kHz by an LFO
 * locked to the beat, mixed with the dry signal for moving notches. Depth
 * scales the mix; the depth handle, how wide the sweep and the feedback.
 */
export const phaser: FxType = {
  id: 'phaser',
  label: 'phaser',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '◐',
  defaultShape: { r: 140 },
  handles: [
    { key: 'rate', label: 'rate', default: 0.6, format: (v) => MOD_LABELS[modIndex(v)] },
    { key: 'depth', label: 'depth', default: 0.6, format: pct },
  ],
  createProcessor(ctx) {
    const z = new Float64Array(PHASE_STAGES);
    let fb = 0;
    return {
      mono(buf, n, depth) {
        if (depth <= 0) return;
        const d = ctx.handles.depth ?? 0.6;
        const cycle = MOD_BEATS[modIndex(ctx.handles.rate)];
        const k = 0.6 * d;
        let a = 0;
        for (let i = 0; i < n; i++) {
          // coefficient once every 16 samples is plenty for a slow sweep
          if ((i & 15) === 0) {
            const lfo = 0.5 + 0.5 * sinTurns(beatAt(ctx, i) / cycle);
            const t = tanTurns((200 * exp2(d * 4 * lfo)) / (2 * ctx.sr));
            a = (t - 1) / (t + 1);
          }
          let x = buf[i] + fb * k;
          for (let s = 0; s < PHASE_STAGES; s++) {
            const y = a * x + z[s];
            z[s] = x - a * y;
            x = y;
          }
          fb = x;
          buf[i] = buf[i] * (1 - 0.5 * depth) + x * 0.5 * depth;
        }
      },
    };
  },
};

// ---------- flanger ----------

const FLANGE_SIZE = 1024;
const FLANGE_MASK = FLANGE_SIZE - 1;

/**
 * Insert: a 0.5–6 ms delay swept by a beat-locked LFO and fed back on itself,
 * mixed with the dry signal: the jet-plane whoosh. Depth scales the mix.
 */
export const flanger: FxType = {
  id: 'flanger',
  label: 'flanger',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '⟆',
  defaultShape: { r: 140 },
  handles: [
    { key: 'rate', label: 'rate', default: 0.6, format: (v) => MOD_LABELS[modIndex(v)] },
    { key: 'feedback', label: 'feedback', default: 0.5, format: pct },
  ],
  createProcessor(ctx) {
    const line = new Float64Array(FLANGE_SIZE);
    let w = 0;
    return {
      mono(buf, n, depth) {
        if (depth <= 0) return;
        const fb = (ctx.handles.feedback ?? 0.5) * 0.85;
        const cycle = MOD_BEATS[modIndex(ctx.handles.rate)];
        const lo = 0.0005 * ctx.sr;
        const span = 0.0055 * ctx.sr;
        for (let i = 0; i < n; i++) {
          const lfo = 0.5 + 0.5 * sinTurns(beatAt(ctx, i) / cycle);
          const rp = w - (lo + span * lfo);
          const i0 = Math.floor(rp);
          const fr = rp - i0;
          const a = line[i0 & FLANGE_MASK];
          const y = a + (line[(i0 + 1) & FLANGE_MASK] - a) * fr;
          line[w & FLANGE_MASK] = tanh(buf[i] + y * fb);
          buf[i] = buf[i] * (1 - 0.5 * depth) + y * 0.5 * depth;
          w++;
        }
        w &= FLANGE_MASK;
      },
    };
  },
};

// ---------- ring mod ----------

const RING_RATIOS = [0.5, 1, 1.5, 2, 3, 4, 5];
const RING_LABELS = ['octave down', 'root', '5th', 'octave', 'octave + 5th', '2 octaves', '2 oct + 3rd'];

export function ringIndex(h: Record<string, number>): number {
  return Math.round((h.ratio ?? 0.5) * (RING_RATIOS.length - 1));
}

/**
 * Insert: multiplies the sound by a sine tuned to the key's root (C3 octave)
 * times a ratio, so the sidebands stay related to the key. Mix, scaled by
 * depth, crossfades from dry.
 */
export const ringmod: FxType = {
  id: 'ringmod',
  label: 'ring mod',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '⊗',
  defaultShape: { r: 140 },
  handles: [
    { key: 'ratio', label: 'ratio', default: 0.5, format: (_v, h) => RING_LABELS[ringIndex(h)] },
    { key: 'mix', label: 'mix', default: 0.7, format: pct },
  ],
  createProcessor(ctx) {
    let ph = 0;
    return {
      mono(buf, n, depth) {
        const mix = (ctx.handles.mix ?? 0.7) * depth;
        const inc = (midiToHz(48 + ctx.keyRoot) * RING_RATIOS[ringIndex(ctx.handles)]) / ctx.sr;
        for (let i = 0; i < n; i++) {
          ph += inc;
          if (ph >= 1) ph -= 1;
          if (mix > 0) buf[i] += buf[i] * (sinTurns(ph) - 1) * mix;
        }
      },
    };
  },
};

// ---------- octaver ----------

const OCT_LABELS = ['−1 oct', '−2 oct', 'both'];

export function octaverMode(h: Record<string, number>): number {
  return Math.round((h.down ?? 0) * 2);
}

/**
 * Insert: an analog-style octave divider. A flip-flop toggles on each rising
 * zero crossing of the (smoothed) input, giving a square an octave down; a
 * second toggles on the first for two down. Shaped by the input's envelope and
 * smoothed, mixed under the dry signal. Best on single notes.
 */
export const octaver: FxType = {
  id: 'octaver',
  label: 'octaver',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '⇊',
  defaultShape: { r: 140 },
  handles: [
    { key: 'down', label: 'down', default: 0, format: (_v, h) => OCT_LABELS[octaverMode(h)] },
    { key: 'mix', label: 'mix', default: 0.6, format: pct },
  ],
  createProcessor(ctx) {
    let pre = 0;
    let pre2 = 0;
    let high = false;
    let f1 = 1;
    let f2 = 1;
    let env = 0;
    let s1 = 0;
    let s2 = 0;
    return {
      mono(buf, n, depth) {
        const mix = (ctx.handles.mix ?? 0.6) * depth;
        const mode = octaverMode(ctx.handles);
        const c = 0.06; // ~470 Hz one-pole, twice
        for (let i = 0; i < n; i++) {
          const x = buf[i];
          pre += (x - pre) * c;
          pre2 += (pre - pre2) * c;
          const a = x < 0 ? -x : x;
          env += (a - env) * (a > env ? 0.01 : 0.0005);
          const th = env * 0.05;
          if (!high && pre2 > th) {
            high = true;
            f1 = -f1;
            if (f1 > 0) f2 = -f2;
          } else if (high && pre2 < -th) high = false;
          const sub = mode === 0 ? f1 : mode === 1 ? f2 : (f1 + f2) * 0.5;
          s1 += (sub * env * 1.4 - s1) * c;
          s2 += (s1 - s2) * c;
          if (mix > 0) buf[i] = x * (1 - mix * 0.4) + s2 * mix;
        }
      },
    };
  },
};

// ---------- beat repeat ----------

const BR_SIZE = 1 << 17; // ~2.7 s: half a beat at the slowest tempo
const BR_MASK = BR_SIZE - 1;
const BR_BEATS = [0.25, 0.5, 1, 2];
const BR_LABELS = ['1/16', '1/8', '1/4', '1/2'];
const BR_FADE = 64;

export function repeatIndex(h: Record<string, number>): number {
  return Math.round((h.slice ?? 0.33) * (BR_BEATS.length - 1));
}

/**
 * Insert: a stutter locked to the beat. At each slice boundary it may (by a
 * seeded chance, scaled by depth) grab the slice that just played and loop it
 * one to three more times in place of the live sound. Short fades at each
 * edge keep it from clicking.
 */
export const beatRepeat: FxType = {
  id: 'beatRepeat',
  label: 'beat repeat',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '⁞',
  defaultShape: { r: 140 },
  handles: [
    { key: 'slice', label: 'slice', default: 0.33, format: (_v, h) => BR_LABELS[repeatIndex(h)] },
    { key: 'chance', label: 'chance', default: 0.4, format: pct },
  ],
  createProcessor(ctx) {
    const line = new Float32Array(BR_SIZE);
    let w = 0;
    let slice = -1;
    let edge = 0;
    let capStart = 0;
    let capLen = 0;
    let left = 0;
    return {
      mono(buf, n, depth) {
        const grid = BR_BEATS[repeatIndex(ctx.handles)] * ctx.ppq;
        const tps = (ctx.tempo * ctx.ppq) / (60 * ctx.sr);
        const chance = (ctx.handles.chance ?? 0.4) * depth;
        for (let i = 0; i < n; i++) {
          const q = Math.floor((ctx.tick + i * tps) / grid);
          if (q !== slice) {
            if (left > 0) left--;
            else if (slice >= 0 && w - edge > BR_FADE * 2 && ctx.rand(14, q) < chance) {
              capStart = edge;
              capLen = w - edge;
              left = 1 + Math.floor(ctx.rand(15, q) * 3);
            }
            slice = q;
            edge = w;
          }
          const x = buf[i];
          line[w & BR_MASK] = x;
          if (left > 0 && capLen > 0) {
            const o = (w - edge) % capLen;
            const fade = Math.min(1, o / BR_FADE, (capLen - o) / BR_FADE);
            buf[i] = x + (line[(capStart + o) & BR_MASK] * fade - x) * depth;
          }
          w++;
        }
      },
    };
  },
};
