// FX that colour a sound rather than place it: sympathetic strings, a granular
// freeze, a tempo-synced tremolo and a bit crusher.

import type { FxType } from '../types.ts';
import { exp2, midiToHz, sinTurns, tanh } from '../dspmath.ts';
import { snapToScale } from '../music.ts';
import { Xorshift } from '../rand.ts';

const pct = (v: number) => Math.round(v * 100) + '%';

// ---------- resonator: strings tuned to the key ----------

/** Semitones above the key's root at C3 (snapped to the scale): root, 5th, octave, 10th, 12th. */
const RES_NOTES = [0, 7, 12, 16, 19];
const RES_SIZE = 2048;
const RES_MASK = RES_SIZE - 1;

export function resonatorDecay(h: Record<string, number>): number {
  return 0.3 * exp2((h.decay ?? 0.5) * 4.3);
}

/**
 * Insert: five comb-filter strings tuned to the key (root, 5th, octave, 10th,
 * 12th around C3) that ring in sympathy with whatever passes through. Decay is
 * how long they ring; mix, scaled by depth, how much of them you hear.
 */
export const resonator: FxType = {
  id: 'resonator',
  label: 'resonator',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '≋',
  defaultShape: { r: 150 },
  handles: [
    { key: 'decay', label: 'decay', default: 0.5, format: (_v, h) => `${resonatorDecay(h).toFixed(1)} s` },
    { key: 'mix', label: 'mix', default: 0.6, format: pct },
  ],
  createProcessor(ctx) {
    const n = RES_NOTES.length;
    const bufs = RES_NOTES.map(() => new Float64Array(RES_SIZE));
    const len = new Float64Array(n);
    const fb = new Float64Array(n);
    const lp = new Float64Array(n);
    let w = 0;
    let tuned = '';
    return {
      mono(buf, frames, depth) {
        const key = `${ctx.keyRoot}:${ctx.steps.join(',')}:${ctx.handles.decay}`;
        if (key !== tuned) {
          tuned = key;
          const decay = resonatorDecay(ctx.handles);
          const base = 48 + ctx.keyRoot;
          for (let j = 0; j < n; j++) {
            const hz = midiToHz(snapToScale(base + RES_NOTES[j], ctx.keyRoot, ctx.steps));
            len[j] = ctx.sr / hz;
            // −60 dB over `decay` seconds
            fb[j] = exp2(-9.966 / (hz * decay));
          }
        }
        const mix = (ctx.handles.mix ?? 0.6) * depth;
        if (mix <= 0) return;
        for (let i = 0; i < frames; i++) {
          const x = buf[i];
          let wet = 0;
          for (let j = 0; j < n; j++) {
            const b = bufs[j];
            const rp = w - len[j];
            const i0 = Math.floor(rp);
            const fr = rp - i0;
            const a = b[i0 & RES_MASK];
            const v = a + (b[(i0 + 1) & RES_MASK] - a) * fr;
            lp[j] += (v - lp[j]) * 0.6;
            const y = x * 0.15 + lp[j] * fb[j];
            b[w & RES_MASK] = y;
            wet += y;
          }
          buf[i] = x * (1 - mix * 0.5) + tanh(wet * 0.5) * mix;
          w++;
        }
        w &= RES_MASK;
      },
    };
  },
};

// ---------- freeze: an endless granular cloud ----------

const FREEZE_SIZE = 1 << 18; // ~5.5 s
const FREEZE_MASK = FREEZE_SIZE - 1;
const GRAINS = 8;

export function freezeGrainMs(h: Record<string, number>): number {
  return Math.round(60 + (h.size ?? 0.5) * 440);
}

export function freezeRate(h: Record<string, number>): number {
  return 3 + (h.density ?? 0.5) * 27;
}

/**
 * Bus: catches what's sent to it and holds it as a cloud of overlapping grains
 * read from the last few seconds, at random spots and pans. Grains are fed
 * back into the buffer, so the cloud sustains after the sound stops and slowly
 * smears. Size is grain length (and how far back they reach); density, grains
 * per second.
 */
export const freeze: FxType = {
  id: 'freeze',
  label: 'freeze',
  role: 'fx',
  kind: 'bus',
  shape: 'circle',
  glyph: '❄',
  defaultShape: { r: 190 },
  handles: [
    { key: 'size', label: 'size', default: 0.5, format: (_v, h) => `${freezeGrainMs(h)} ms grains` },
    { key: 'density', label: 'density', default: 0.5, format: (_v, h) => `${freezeRate(h).toFixed(0)} / s` },
  ],
  createProcessor(ctx) {
    const bl = new Float32Array(FREEZE_SIZE);
    const br = new Float32Array(FREEZE_SIZE);
    const rng = new Xorshift();
    rng.seed(ctx.rand(10, 0) * 4294967296);
    const start = new Float64Array(GRAINS);
    const glen = new Float64Array(GRAINS);
    const age = new Float64Array(GRAINS).fill(-1);
    const panL = new Float64Array(GRAINS);
    const panR = new Float64Array(GRAINS);
    let w = 0;
    let next = 0;
    let fbL = 0;
    let fbR = 0;
    return {
      stereo(l, r, n) {
        const len = (freezeGrainMs(ctx.handles) / 1000) * ctx.sr;
        const reach = Math.min(FREEZE_SIZE - len - 2, len * 6);
        const every = ctx.sr / freezeRate(ctx.handles);
        // overlapping Hann windows average 1/2 each: keep the sum near unity
        const gain = 1 / Math.sqrt(Math.max(1, (len / every) * 0.5));
        for (let i = 0; i < n; i++) {
          bl[w & FREEZE_MASK] = l[i] + fbL;
          br[w & FREEZE_MASK] = r[i] + fbR;
          if (--next <= 0) {
            next = every * (0.6 + 0.8 * (rng.next() * 0.5 + 0.5));
            for (let g = 0; g < GRAINS; g++) {
              if (age[g] >= 0) continue;
              age[g] = 0;
              glen[g] = len * (0.75 + 0.5 * (rng.next() * 0.5 + 0.5));
              start[g] = w - glen[g] - (rng.next() * 0.5 + 0.5) * reach;
              const pan = rng.next() * 0.8;
              panL[g] = Math.sqrt(0.5 - pan * 0.5);
              panR[g] = Math.sqrt(0.5 + pan * 0.5);
              break;
            }
          }
          let ol = 0;
          let or = 0;
          for (let g = 0; g < GRAINS; g++) {
            if (age[g] < 0) continue;
            const s = sinTurns((age[g] / glen[g]) * 0.5);
            const win = s * s;
            const j = (start[g] + age[g]) & FREEZE_MASK;
            const m = (bl[j] + br[j]) * 0.5 * win;
            ol += m * panL[g];
            or += m * panR[g];
            if (++age[g] >= glen[g]) age[g] = -1;
          }
          ol *= gain;
          or *= gain;
          fbL = tanh(ol * 0.6) * 0.85;
          fbR = tanh(or * 0.6) * 0.85;
          l[i] = ol;
          r[i] = or;
          w++;
        }
        w &= FREEZE_MASK;
      },
    };
  },
};

// ---------- tremolo: tempo-synced level ----------

const TREM_BEATS = [0.25, 0.5, 1, 2, 4];
const TREM_LABELS = ['1/16', '1/8', '1/4', '1/2', '1 bar'];

export function tremoloIndex(h: Record<string, number>): number {
  return Math.round((h.rate ?? 0.25) * (TREM_BEATS.length - 1));
}

/** Insert: level pulsing in time with the tempo, locked to the beat. Depth scales how deep it dips. */
export const tremolo: FxType = {
  id: 'tremolo',
  label: 'tremolo',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '≀',
  defaultShape: { r: 140 },
  handles: [
    { key: 'rate', label: 'rate', default: 0.25, format: (_v, h) => TREM_LABELS[tremoloIndex(h)] },
    { key: 'depth', label: 'depth', default: 0.7, format: pct },
  ],
  createProcessor(ctx) {
    return {
      mono(buf, n, depth) {
        const amt = (ctx.handles.depth ?? 0.7) * depth;
        if (amt <= 0) return;
        const cycle = TREM_BEATS[tremoloIndex(ctx.handles)] * ctx.ppq;
        const tps = (ctx.tempo * ctx.ppq) / (60 * ctx.sr);
        for (let i = 0; i < n; i++) {
          const ph = (ctx.tick + i * tps) / cycle;
          buf[i] *= 1 - amt * (0.5 + 0.5 * sinTurns(ph + 0.25));
        }
      },
    };
  },
};

// ---------- lo-fi: bit and sample-rate crushing ----------

export function lofiBits(h: Record<string, number>): number {
  return 16 - Math.round((h.bits ?? 0.6) * 13);
}

export function lofiHold(h: Record<string, number>): number {
  const v = h.rate ?? 0.3;
  return 1 + Math.round(v * v * 31);
}

/** Insert: fewer bits and a lower sample rate. Depth crossfades from clean to crushed. */
export const lofi: FxType = {
  id: 'lofi',
  label: 'lo-fi',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '▚',
  defaultShape: { r: 140 },
  handles: [
    { key: 'bits', label: 'bits', default: 0.6, format: (_v, h) => `${lofiBits(h)} bits` },
    { key: 'rate', label: 'rate', default: 0.3, format: (_v, h) => `${Math.round(48000 / lofiHold(h) / 100) / 10} kHz` },
  ],
  createProcessor(ctx) {
    let held = 0;
    let count = 0;
    return {
      mono(buf, n, depth) {
        if (depth <= 0) return;
        const q = exp2(lofiBits(ctx.handles) - 1);
        const hold = lofiHold(ctx.handles);
        for (let i = 0; i < n; i++) {
          if (count <= 0) {
            held = Math.round(buf[i] * q) / q;
            count = hold;
          }
          count--;
          buf[i] += (held - buf[i]) * depth;
        }
      },
    };
  },
};
