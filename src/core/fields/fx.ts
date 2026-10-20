import type { FxType } from '../types.ts';
import { exp2, log2 } from '../dspmath.ts';
import { Svf } from '../dsp/svf.ts';
import { Fdn } from '../dsp/reverb.ts';
import { PingPong } from '../dsp/delay.ts';

const pct = (v: number) => Math.round(v * 100) + '%';

export function filterCutoffHz(h: Record<string, number>): number {
  return 60 * exp2((h.cutoff ?? 0.3) * 8);
}

const OPEN_LOG = log2(18000);

/** Insert: depth sweeps from fully open at the edge to the character cutoff at the centre. */
export const filter: FxType = {
  id: 'filter',
  label: 'filter',
  role: 'fx',
  kind: 'insert',
  shape: 'circle',
  glyph: '∿',
  defaultShape: { r: 140 },
  handles: [
    { key: 'cutoff', label: 'cutoff', default: 0.3, format: (_v, h) => Math.round(filterCutoffHz(h)) + ' Hz' },
    { key: 'res', label: 'resonance', default: 0.4, format: pct },
  ],
  createProcessor(ctx) {
    const svf = new Svf();
    let kCut = -1;
    let cutLog = 0;
    return {
      mono(buf, n, depth) {
        const c = ctx.handles.cutoff ?? 0.3;
        if (c !== kCut) {
          kCut = c;
          cutLog = log2(filterCutoffHz(ctx.handles));
        }
        svf.set(exp2(OPEN_LOG + (cutLog - OPEN_LOG) * depth), (ctx.handles.res ?? 0.4) * 0.95 * depth);
        for (let i = 0; i < n; i++) buf[i] = svf.lp(buf[i]);
      },
    };
  },
};

const DELAY_BEATS = [0.25, 0.5, 0.75, 1, 1.5, 2];
const DELAY_LABELS = ['1/16', '1/8', '3/16', '1/4', '3/8', '1/2'];

export function delayIndex(h: Record<string, number>): number {
  return Math.round((h.time ?? 0.5) * (DELAY_BEATS.length - 1));
}

export const delay: FxType = {
  id: 'delay',
  label: 'delay',
  role: 'fx',
  kind: 'bus',
  shape: 'circle',
  glyph: '⋯',
  defaultShape: { r: 160 },
  handles: [
    { key: 'time', label: 'time', default: 0.5, format: (_v, h) => DELAY_LABELS[delayIndex(h)] },
    { key: 'feedback', label: 'feedback', default: 0.45, format: pct },
  ],
  createProcessor(ctx) {
    const pp = new PingPong();
    return {
      stereo(l, r, n) {
        const beats = DELAY_BEATS[delayIndex(ctx.handles)];
        pp.process(l, r, n, (beats * 60 * ctx.sr) / ctx.tempo, (ctx.handles.feedback ?? 0.45) * 0.9);
      },
    };
  },
};

export const reverb: FxType = {
  id: 'reverb',
  label: 'reverb',
  role: 'fx',
  kind: 'bus',
  shape: 'circle',
  glyph: '◌',
  defaultShape: { r: 220 },
  handles: [
    { key: 'size', label: 'size', default: 0.55, format: pct },
    { key: 'damping', label: 'damping', default: 0.4, format: pct },
  ],
  createProcessor(ctx) {
    const fdn = new Fdn();
    return {
      stereo(l, r, n) {
        fdn.set(ctx.handles.size ?? 0.55, ctx.handles.damping ?? 0.4);
        fdn.process(l, r, n);
      },
    };
  },
};
