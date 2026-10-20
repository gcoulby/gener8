// Motion bar: appears under the selected object. Toggle breathe / orbit / drift /
// path and drag (or scroll) the values. Motion is the only modulation, so this
// is where any sound or field gets modulated.

import type { App } from './app.ts';
import type { Edit, PatchObject, PosMotion } from '../core/types.ts';
import { isCircle } from '../core/geometry.ts';
import { FONT_SMALL, INK } from './theme.ts';
import { STRIP_H } from './timeline.ts';

export const PERIODS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];

export type MotionAction =
  | { kind: 'toggle'; what: 'breathe' | 'orbit' | 'drift' | 'path' }
  | { kind: 'value'; key: ValueKey }
  | { kind: 'mode' };

export type ValueKey = 'breathe.amount' | 'breathe.period' | 'pos.radius' | 'pos.amplitude' | 'pos.period' | 'pos.rate';

export interface MotionHit {
  action: MotionAction;
  x: number;
  y: number;
  w: number;
  h: number;
}

const CH = 18;
const GAP = 6;
const ROW = 24;

interface Item {
  text: string;
  action: MotionAction;
  active?: boolean;
  value?: boolean;
}

function rows(o: PatchObject): Item[][] {
  const m = o.motion ?? {};
  const pos = m.pos?.type;
  const out: Item[][] = [
    [
      { text: '∿ breathe', action: { kind: 'toggle', what: 'breathe' }, active: !!m.breathe },
      { text: '◯ orbit', action: { kind: 'toggle', what: 'orbit' }, active: pos === 'orbit' },
      { text: '≈ drift', action: { kind: 'toggle', what: 'drift' }, active: pos === 'drift' },
      { text: '⌇ path', action: { kind: 'toggle', what: 'path' }, active: pos === 'path' },
    ],
  ];
  if (m.breathe) {
    out.push([
      { text: 'breathe', action: { kind: 'toggle', what: 'breathe' }, active: true },
      { text: `depth ${Math.round(m.breathe.amount * 100)}%`, action: { kind: 'value', key: 'breathe.amount' }, value: true },
      { text: `every ${m.breathe.periodBeats} beats`, action: { kind: 'value', key: 'breathe.period' }, value: true },
    ]);
  }
  const p = m.pos;
  if (p?.type === 'orbit') {
    out.push([
      { text: 'orbit', action: { kind: 'toggle', what: 'orbit' }, active: true },
      { text: `radius ${Math.round(p.radius)}`, action: { kind: 'value', key: 'pos.radius' }, value: true },
      { text: `every ${p.periodBeats} beats`, action: { kind: 'value', key: 'pos.period' }, value: true },
    ]);
  } else if (p?.type === 'drift') {
    out.push([
      { text: 'drift', action: { kind: 'toggle', what: 'drift' }, active: true },
      { text: `range ${Math.round(p.amplitude)}`, action: { kind: 'value', key: 'pos.amplitude' }, value: true },
      { text: `speed ${p.rateBeats} beats`, action: { kind: 'value', key: 'pos.rate' }, value: true },
    ]);
  } else if (p?.type === 'path') {
    out.push([
      { text: 'path', action: { kind: 'toggle', what: 'path' }, active: true },
      { text: `every ${p.periodBeats} beats`, action: { kind: 'value', key: 'pos.period' }, value: true },
      { text: p.mode, action: { kind: 'mode' }, value: true },
    ]);
  }
  return out;
}

function anchor(app: App, o: PatchObject): [number, number] {
  const p = app.poseOf(o);
  const [sx, sy] = app.w2s(p.x, p.y);
  let below: number;
  if (o.kind === 'sound') below = sy + app.soundRadius(o) + 26;
  else if (isCircle(o.shape)) below = sy + o.shape.r * p.scale * app.cam.zoom + 12;
  else below = sy + (o.shape.h * p.scale * app.cam.zoom) / 2 + 12;
  return [sx, below];
}

/** Draws the bar for the selection and records hit boxes on app.motionHits. */
export function drawMotionBar(app: App): void {
  app.motionHits = [];
  const o = app.obj(app.sel);
  if (!o || app.panel || app.scrub) return;
  const g = app.g;
  g.font = FONT_SMALL;
  const rs = rows(o);
  const widths = rs.map((r) => r.reduce((w, it) => w + g.measureText(it.text).width + 12 + GAP, -GAP));
  const maxW = Math.max(...widths);
  const totalH = rs.length * ROW;
  let [cx, top] = anchor(app, o);
  top = Math.min(Math.max(top, 40), app.H - STRIP_H - totalH - 10);
  const left = Math.min(Math.max(cx - maxW / 2, 84), app.W - maxW - 12);
  g.fillStyle = 'rgba(11,11,14,0.82)';
  g.beginPath();
  g.roundRect(left - 6, top - 5, maxW + 12, totalH + 4, 6);
  g.fill();
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  rs.forEach((row, ri) => {
    let x = left;
    const y = top + ri * ROW;
    row.forEach((it, i) => {
      const w = g.measureText(it.text).width + 12;
      const hov = app.hover?.kind === 'motion' && sameAction(app.hover.hit.action, it.action);
      if (it.value) {
        g.strokeStyle = `rgba(233,228,218,${hov ? 0.7 : 0.3})`;
        g.lineWidth = 1;
        g.beginPath();
        g.roundRect(x + 0.5, y + 0.5, w - 1, CH - 1, 4);
        g.stroke();
        g.fillStyle = INK;
      } else if (ri > 0 && i === 0) {
        g.fillStyle = 'rgba(233,228,218,0.45)';
      } else {
        g.fillStyle = it.active ? 'rgba(233,228,218,0.9)' : `rgba(233,228,218,${hov ? 0.18 : 0.07})`;
        g.beginPath();
        g.roundRect(x, y, w, CH, 9);
        g.fill();
        g.fillStyle = it.active ? '#0b0b0e' : `rgba(233,228,218,${hov ? 0.95 : 0.65})`;
      }
      g.fillText(it.text, x + 6, y + CH / 2 + 0.5);
      if (!(ri > 0 && i === 0)) app.motionHits.push({ action: it.action, x, y, w, h: CH });
      x += w + GAP;
    });
  });
  const hov = app.hover?.kind === 'motion' ? app.hover.hit.action : null;
  if (hov?.kind === 'value') {
    g.fillStyle = 'rgba(233,228,218,0.4)';
    g.fillText('drag ↔ or scroll', left, top + totalH + 8);
  }
}

export function sameAction(a: MotionAction, b: MotionAction): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'toggle' && b.kind === 'toggle') return a.what === b.what;
  if (a.kind === 'value' && b.kind === 'value') return a.key === b.key;
  return true;
}

export function motionHitAt(app: App, mx: number, my: number): MotionHit | null {
  for (const h of app.motionHits) if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) return h;
  return null;
}

const DEFAULTS: Record<'orbit' | 'drift' | 'path', PosMotion> = {
  orbit: { type: 'orbit', radius: 80, periodBeats: 16, phase: 0 },
  drift: { type: 'drift', amplitude: 60, rateBeats: 8 },
  path: { type: 'path', points: [[0, 0], [120, 60], [0, 120], [-120, 60]], periodBeats: 32, mode: 'loop' },
};

/** The edit for a click on a toggle or mode chip. */
export function toggleEdit(o: PatchObject, a: MotionAction): Edit | null {
  if (a.kind === 'mode') {
    const p = o.motion?.pos;
    if (p?.type !== 'path') return null;
    return { op: 'set', id: o.id, path: ['motion', 'pos', 'mode'], value: p.mode === 'loop' ? 'pingpong' : 'loop' };
  }
  if (a.kind !== 'toggle') return null;
  if (a.what === 'breathe') {
    return { op: 'set', id: o.id, path: ['motion', 'breathe'], value: o.motion?.breathe ? null : { amount: 0.3, periodBeats: 16 } };
  }
  const on = o.motion?.pos?.type === a.what;
  return { op: 'set', id: o.id, path: ['motion', 'pos'], value: on ? null : DEFAULTS[a.what] };
}

export function readValue(o: PatchObject, key: ValueKey): number {
  const m = o.motion ?? {};
  const p = m.pos as Record<string, number> | undefined;
  switch (key) {
    case 'breathe.amount':
      return m.breathe?.amount ?? 0;
    case 'breathe.period':
      return m.breathe?.periodBeats ?? 16;
    case 'pos.radius':
      return p?.radius ?? 0;
    case 'pos.amplitude':
      return p?.amplitude ?? 0;
    case 'pos.period':
      return p?.periodBeats ?? 16;
    case 'pos.rate':
      return p?.rateBeats ?? 8;
  }
}

function stepPeriod(v: number, steps: number): number {
  let i = PERIODS.findIndex((p) => p >= v);
  if (i < 0) i = PERIODS.length - 1;
  return PERIODS[Math.min(PERIODS.length - 1, Math.max(0, i + steps))];
}

/** New value for a value chip: `steps` is signed (drag pixels / 12, or ±1 per scroll notch). */
export function stepValue(key: ValueKey, start: number, steps: number, fine: number): number {
  switch (key) {
    case 'breathe.amount':
      return Math.round(Math.min(0.9, Math.max(0, start + fine * 0.005)) * 100) / 100;
    case 'pos.radius':
    case 'pos.amplitude':
      return Math.round(Math.min(800, Math.max(5, start + fine)));
    default:
      return stepPeriod(start, steps);
  }
}

export function valueEdit(o: PatchObject, key: ValueKey, v: number): Edit {
  const path: Record<ValueKey, string[]> = {
    'breathe.amount': ['motion', 'breathe', 'amount'],
    'breathe.period': ['motion', 'breathe', 'periodBeats'],
    'pos.radius': ['motion', 'pos', 'radius'],
    'pos.amplitude': ['motion', 'pos', 'amplitude'],
    'pos.period': ['motion', 'pos', 'periodBeats'],
    'pos.rate': ['motion', 'pos', 'rateBeats'],
  };
  return { op: 'set', id: o.id, path: path[key], value: v };
}
