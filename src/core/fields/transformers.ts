import type { TransformerType } from '../types.ts';
import { strHash } from '../rand.ts';
import { NOTE_NAMES, SCALE_LABELS, SCALE_ORDER, scaleSteps, snapToScale } from '../music.ts';

const pct = (v: number) => Math.round(v * 100) + '%';

export const probability: TransformerType = {
  id: 'probability',
  label: 'probability',
  role: 'transformer',
  shape: 'circle',
  glyph: '%',
  defaultShape: { r: 120 },
  handles: [{ key: 'bias', label: 'thinning', default: 0.7, format: pct }],
  transform(e, depth, ctx, out) {
    const p = depth * (ctx.handles.bias ?? 0.7);
    if (ctx.rand(strHash(e.soundId), Math.floor(e.tick * 4) + e.chain) >= p) out(e);
  },
};

export function transposeSemis(h: Record<string, number>): number {
  return Math.round(((h.interval ?? 0.5) - 0.5) * 24);
}

export const transpose: TransformerType = {
  id: 'transpose',
  label: 'transpose',
  role: 'transformer',
  shape: 'circle',
  glyph: '↕',
  defaultShape: { r: 120 },
  handles: [
    {
      key: 'interval',
      label: 'interval',
      default: 0.75,
      format: (_v, h) => {
        const s = transposeSemis(h);
        return (s > 0 ? '+' : '') + s + ' st';
      },
    },
  ],
  transform(e, _depth, ctx, out) {
    out({ ...e, pitch: e.pitch + transposeSemis(ctx.handles) });
  },
  transformPitch(pitch, _depth, ctx) {
    return pitch + transposeSemis(ctx.handles);
  },
};

export function quantiseScale(h: Record<string, number>): string {
  return SCALE_ORDER[Math.round((h.scale ?? 0) * (SCALE_ORDER.length - 1))];
}

export function quantiseRoot(h: Record<string, number>): number {
  return Math.round((h.root ?? 0) * 11);
}

export const quantise: TransformerType = {
  id: 'quantise',
  label: 'quantise',
  role: 'transformer',
  shape: 'circle',
  glyph: '♮',
  defaultShape: { r: 130 },
  handles: [
    { key: 'scale', label: 'scale', default: 0.5, format: (_v, h) => SCALE_LABELS[quantiseScale(h)] },
    { key: 'root', label: 'root', default: 0, format: (_v, h) => NOTE_NAMES[quantiseRoot(h)] },
  ],
  transform(e, _depth, ctx, out) {
    out({ ...e, pitch: snapToScale(e.pitch, quantiseRoot(ctx.handles), scaleSteps(quantiseScale(ctx.handles))) });
  },
  transformPitch(pitch, depth, ctx) {
    const s = snapToScale(pitch, quantiseRoot(ctx.handles), scaleSteps(quantiseScale(ctx.handles)));
    return pitch + (s - pitch) * depth;
  },
};

const RATCHET_TICKS = [120, 160, 240];
const RATCHET_LABELS = ['1/32', '1/16T', '1/16'];

export const ratchet: TransformerType = {
  id: 'ratchet',
  label: 'ratchet',
  role: 'transformer',
  shape: 'circle',
  glyph: '≡',
  defaultShape: { r: 110 },
  handles: [
    {
      key: 'rate',
      label: 'rate',
      default: 0,
      format: (v) => RATCHET_LABELS[Math.round(v * (RATCHET_LABELS.length - 1))],
    },
  ],
  transform(e, depth, ctx, out) {
    const count = 1 + Math.round(depth * 3);
    const gap = RATCHET_TICKS[Math.round((ctx.handles.rate ?? 0) * (RATCHET_TICKS.length - 1))];
    let v = e.velocity;
    for (let i = 0; i < count; i++) {
      out({ ...e, tick: e.tick + i * gap, velocity: v, durTicks: Math.min(e.durTicks, gap * 0.9) });
      v *= 0.75;
    }
  },
};

export function nthN(h: Record<string, number>): number {
  return 2 + Math.round((h.n ?? 0.2) * 6);
}

export const everyNth: TransformerType = {
  id: 'everyNth',
  label: 'every Nth',
  role: 'transformer',
  shape: 'circle',
  glyph: '÷',
  defaultShape: { r: 110 },
  handles: [
    { key: 'n', label: 'N', default: 0.17, format: (_v, h) => `every ${nthN(h)}` },
    {
      key: 'offset',
      label: 'offset',
      default: 0,
      format: (v, h) => `+${Math.round(v * (nthN(h) - 1))}`,
    },
  ],
  createState: () => new Map<string, number>(),
  transform(e, _depth, ctx, out) {
    const counts = ctx.state as Map<string, number>;
    const n = nthN(ctx.handles);
    const off = Math.round((ctx.handles.offset ?? 0) * (n - 1));
    const c = counts.get(e.soundId) ?? 0;
    counts.set(e.soundId, c + 1);
    if ((((c - off) % n) + n) % n === 0) out(e);
  },
};
