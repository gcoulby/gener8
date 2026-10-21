// Motion bar: appears under the selected object. Toggle breathe / orbit / drift /
// path and drag (or scroll) the values. Motion is the only modulation, so this
// is where any sound or field gets modulated. Event sounds also get a retrigger
// row (ripple / point / multi), and XY fields a row per axis.

import type { App } from './app.ts';
import type { Axes, Axis, Edit, PatchObject, PosMotion, RippleSpec } from '../core/types.ts';
import { isCircle } from '../core/geometry.ts';
import { soundTypes } from '../core/sounds/registry.ts';
import { isMap } from '../core/fields/registry.ts';
import { DEFAULT_AXES, mapContains, PARAM_PREFIX, RIPPLE_LIMITS, rippleOf, targetOf, XY_TARGETS } from '../core/placement.ts';
import { FONT_SMALL, INK } from './theme.ts';

export const PERIODS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256];

export type MotionAction =
  | { kind: 'toggle'; what: 'breathe' | 'orbit' | 'drift' | 'path' }
  | { kind: 'value'; key: ValueKey }
  | { kind: 'mode' }
  | { kind: 'rmode'; mode: NonNullable<RippleSpec['mode']> }
  | { kind: 'rstop' }
  | { kind: 'axis'; axis: 'x' | 'y' }
  | { kind: 'label' };

export type ValueKey =
  | 'breathe.amount'
  | 'breathe.period'
  | 'pos.radius'
  | 'pos.amplitude'
  | 'pos.period'
  | 'pos.rate'
  | 'ripple.reach'
  | 'ripple.angle'
  | 'ripple.count'
  | 'ripple.spread'
  | 'axis.x.min'
  | 'axis.x.max'
  | 'axis.y.min'
  | 'axis.y.max';

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

/** Display name for an axis target; param targets use the first sound type's label for that key. */
export function targetLabel(to: string): string {
  if (to.startsWith(PARAM_PREFIX)) {
    const key = to.slice(PARAM_PREFIX.length);
    for (const t of Object.values(soundTypes)) {
      const p = t.params.find((q) => q.key === key);
      if (p) return p.label;
    }
    return key;
  }
  return targetOf(to)?.label ?? to;
}

export function axesOf(o: PatchObject): Axes {
  return (o.kind === 'field' && o.axes) || DEFAULT_AXES;
}

function retriggerRow(o: PatchObject): Item[] {
  const r = rippleOf(o.kind === 'sound' ? o.ripple : undefined);
  const row: Item[] = [
    { text: 'retrigger', action: { kind: 'label' } },
    { text: '◎ ripple', action: { kind: 'rmode', mode: 'ripple' }, active: r.mode === 'ripple' },
    { text: '→ point', action: { kind: 'rmode', mode: 'point' }, active: r.mode === 'point' },
    { text: '⋔ multi', action: { kind: 'rmode', mode: 'multi' }, active: r.mode === 'multi' },
    { text: `reach ×${r.reach}`, action: { kind: 'value', key: 'ripple.reach' }, value: true },
  ];
  if (r.mode !== 'ripple') row.push({ text: `angle ${Math.round(r.angle)}°`, action: { kind: 'value', key: 'ripple.angle' }, value: true });
  if (r.mode === 'multi') {
    row.push({ text: `count ${r.count}`, action: { kind: 'value', key: 'ripple.count' }, value: true });
    row.push({ text: `spread ${Math.round(r.spread)}°`, action: { kind: 'value', key: 'ripple.spread' }, value: true });
  }
  row.push({ text: '⊣ stop on impact', action: { kind: 'rstop' }, active: r.stop });
  return row;
}

function axisRow(o: PatchObject, ax: 'x' | 'y'): Item[] {
  const a = axesOf(o)[ax];
  const row: Item[] = [
    { text: ax === 'x' ? 'x ↔' : 'y ↕', action: { kind: 'label' } },
    { text: `${a ? targetLabel(a.to) : 'none'} ▾`, action: { kind: 'axis', axis: ax }, value: true },
  ];
  const t = a && targetOf(a.to);
  if (a && t) {
    const lo = ax === 'x' ? 'left' : 'bottom';
    const hi = ax === 'x' ? 'right' : 'top';
    row.push({ text: `${lo} ${t.fmt(a.min)}`, action: { kind: 'value', key: `axis.${ax}.min` }, value: true });
    row.push({ text: `${hi} ${t.fmt(a.max)}`, action: { kind: 'value', key: `axis.${ax}.max` }, value: true });
  }
  return row;
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
  if (o.kind === 'sound' && soundTypes[o.type]?.mode === 'event') out.push(retriggerRow(o));
  if (isMap(o)) out.push(axisRow(o, 'x'), axisRow(o, 'y'));
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
  top = Math.min(Math.max(top, 40), app.H - app.barH - totalH - 10);
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
      if (it.action.kind !== 'label' && !(ri > 0 && i === 0)) app.motionHits.push({ action: it.action, x, y, w, h: CH });
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
  if (a.kind === 'rmode' && b.kind === 'rmode') return a.mode === b.mode;
  if (a.kind === 'axis' && b.kind === 'axis') return a.axis === b.axis;
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

/** Axis targets to cycle through: the built-ins, then params of the sounds inside the field, then none. */
function axisTargets(app: App, o: PatchObject): (string | null)[] {
  const keys = new Set<string>();
  const m = { obj: o as Extract<PatchObject, { kind: 'field' }>, pose: app.poseOf(o) };
  for (const s of app.view.objects) {
    if (s.kind !== 'sound') continue;
    const p = app.poseOf(s);
    if (!mapContains(m, p.x, p.y)) continue;
    for (const q of soundTypes[s.type]?.params ?? []) keys.add(q.key);
  }
  return [...Object.keys(XY_TARGETS), ...[...keys].sort().map((k) => PARAM_PREFIX + k), null];
}

/** The edit for a click on a toggle or mode chip (dir: -1 steps an axis target backwards). */
export function toggleEdit(app: App, o: PatchObject, a: MotionAction, dir = 1): Edit | null {
  if (a.kind === 'rmode' && o.kind === 'sound') {
    return { op: 'set', id: o.id, path: ['ripple', 'mode'], value: a.mode === 'ripple' ? null : a.mode };
  }
  if (a.kind === 'rstop' && o.kind === 'sound') {
    return { op: 'set', id: o.id, path: ['ripple', 'stop'], value: o.ripple?.stop ? null : true };
  }
  if (a.kind === 'axis') {
    const list = axisTargets(app, o);
    const cur = axesOf(o)[a.axis]?.to ?? null;
    const i = list.indexOf(cur);
    const to = list[(((i < 0 ? 0 : i + dir) % list.length) + list.length) % list.length];
    const t = to && targetOf(to);
    const axes: Axes = { ...axesOf(o) };
    if (to && t) axes[a.axis] = { to, min: t.min, max: t.max };
    else delete axes[a.axis];
    return { op: 'set', id: o.id, path: ['axes'], value: axes };
  }
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
  if (key.startsWith('ripple.')) {
    const r = rippleOf(o.kind === 'sound' ? o.ripple : undefined);
    return r[key.slice(7) as 'reach' | 'angle' | 'count' | 'spread'];
  }
  const [, ax, end] = key.split('.') as [string, 'x' | 'y', 'min' | 'max'];
  return axesOf(o)[ax]?.[end] ?? 0;
}

function stepPeriod(v: number, steps: number): number {
  let i = PERIODS.findIndex((p) => p >= v);
  if (i < 0) i = PERIODS.length - 1;
  return PERIODS[Math.min(PERIODS.length - 1, Math.max(0, i + steps))];
}

const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** New value for a value chip: `steps` is signed (drag pixels / 12, or ±1 per scroll notch). */
export function stepValue(o: PatchObject, key: ValueKey, start: number, steps: number, fine: number): number {
  switch (key) {
    case 'breathe.amount':
      return Math.round(Math.min(0.9, Math.max(0, start + fine * 0.005)) * 100) / 100;
    case 'pos.radius':
    case 'pos.amplitude':
      return Math.round(Math.min(4000, Math.max(5, start + fine)));
    case 'breathe.period':
    case 'pos.period':
    case 'pos.rate':
      return stepPeriod(start, steps);
    case 'ripple.reach':
      return clampTo(Math.round((start + steps * 0.5) * 2) / 2, RIPPLE_LIMITS.reach[0], RIPPLE_LIMITS.reach[1]);
    case 'ripple.angle':
      return ((Math.round((start + steps * 5) / 5) * 5) % 360 + 360) % 360;
    case 'ripple.count':
      return clampTo(Math.round(start + steps), RIPPLE_LIMITS.count[0], RIPPLE_LIMITS.count[1]);
    case 'ripple.spread':
      return clampTo(Math.round((start + steps * 5) / 5) * 5, RIPPLE_LIMITS.spread[0], RIPPLE_LIMITS.spread[1]);
  }
  const a = axesOf(o)[key.split('.')[1] as 'x' | 'y'];
  const t = a && targetOf(a.to);
  if (!t) return start;
  const v = Math.round((start + steps * t.step) / t.step) * t.step;
  return clampTo(Number(v.toPrecision(6)), t.lo, t.hi);
}

export function valueEdit(o: PatchObject, key: ValueKey, v: number): Edit {
  if (key.startsWith('axis.')) {
    const [, ax, end] = key.split('.') as [string, 'x' | 'y', 'min' | 'max'];
    const axes: Axes = { ...axesOf(o) };
    const cur = axes[ax];
    if (cur) axes[ax] = { ...cur, [end]: v } as Axis;
    return { op: 'set', id: o.id, path: ['axes'], value: axes };
  }
  if (key.startsWith('ripple.')) return { op: 'set', id: o.id, path: ['ripple', key.slice(7)], value: v };
  const path: Record<string, string[]> = {
    'breathe.amount': ['motion', 'breathe', 'amount'],
    'breathe.period': ['motion', 'breathe', 'periodBeats'],
    'pos.radius': ['motion', 'pos', 'radius'],
    'pos.amplitude': ['motion', 'pos', 'amplitude'],
    'pos.period': ['motion', 'pos', 'periodBeats'],
    'pos.rate': ['motion', 'pos', 'rateBeats'],
  };
  return { op: 'set', id: o.id, path: path[key], value: v };
}
