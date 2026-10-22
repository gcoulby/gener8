// Motion bar: appears under the selected object. Toggle breathe / orbit / drift /
// path and drag (or scroll) the values. Motion is the only modulation, so this
// is where any sound or field gets modulated. Event sounds also get a retrigger
// row (ripple / point / multi), and XY fields a row per axis.

import type { App } from './app.ts';
import type { Axes, Axis, Edit, MapAxisSpec, PatchObject, PosMotion, RippleSpec } from '../core/types.ts';
import { isCircle } from '../core/geometry.ts';
import { soundTypes } from '../core/sounds/registry.ts';
import { mapTypeOf } from '../core/fields/registry.ts';
import { mapLocate, PARAM_PREFIX, RIPPLE_LIMITS, rippleOf, targetOf, XY_TARGETS } from '../core/placement.ts';
import { MIDI_MAX, MIDI_MIN } from '../core/constants.ts';
import { noteName } from '../core/music.ts';
import { FONT_SMALL, INK } from './theme.ts';

/** Motion periods in beats: up to 1024, i.e. 256 bars, for slow changes over a whole piece. */
export const PERIODS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024];
export const MAX_PERIOD = PERIODS[PERIODS.length - 1];

/** A period for display: beats below 16 bars, whole bars from there. */
export function periodLabel(beats: number): string {
  return beats >= 64 && beats % 4 === 0 ? `${beats / 4} bars` : `${beats} beats`;
}

export type MotionAction =
  | { kind: 'toggle'; what: 'breathe' | 'orbit' | 'drift' | 'path' | 'bounce' }
  | { kind: 'follow' }
  | { kind: 'unfollow' }
  | { kind: 'value'; key: ValueKey }
  | { kind: 'mode' }
  | { kind: 'rmode'; mode: NonNullable<RippleSpec['mode']> }
  | { kind: 'rstop' }
  | { kind: 'axis'; axis: string }
  | { kind: 'label' };

export type ValueKey =
  | 'breathe.amount'
  | 'breathe.period'
  | 'pos.radius'
  | 'pos.amplitude'
  | 'pos.period'
  | 'pos.rate'
  | 'pos.height'
  | 'pos.bounces'
  | 'ripple.reach'
  | 'ripple.angle'
  | 'ripple.count'
  | 'ripple.spread'
  | 'ripple.falloff'
  | 'sound.note'
  | `axis.${string}.${'min' | 'max'}`;

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
  /** Plain dim text, not a control. */
  dim?: boolean;
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
  return (o.kind === 'field' && o.axes) || mapTypeOf(o)?.defaultAxes || {};
}

function retriggerRow(o: PatchObject): Item[] {
  const r = rippleOf(o.kind === 'sound' ? o.ripple : undefined);
  const row: Item[] = [
    { text: 'retrigger', action: { kind: 'label' } },
    { text: '◎ ripple', action: { kind: 'rmode', mode: 'ripple' }, active: r.mode === 'ripple' },
    { text: '→ point', action: { kind: 'rmode', mode: 'point' }, active: r.mode === 'point' },
    { text: '⋔ multi', action: { kind: 'rmode', mode: 'multi' }, active: r.mode === 'multi' },
    { text: `reach ×${r.reach}`, action: { kind: 'value', key: 'ripple.reach' }, value: true },
    { text: `fall-off ${Math.round(r.falloff * 100)}%`, action: { kind: 'value', key: 'ripple.falloff' }, value: true },
  ];
  if (r.mode !== 'ripple') row.push({ text: `angle ${Math.round(r.angle)}°`, action: { kind: 'value', key: 'ripple.angle' }, value: true });
  if (r.mode === 'multi') {
    row.push({ text: `count ${r.count}`, action: { kind: 'value', key: 'ripple.count' }, value: true });
    row.push({ text: `spread ${Math.round(r.spread)}°`, action: { kind: 'value', key: 'ripple.spread' }, value: true });
  }
  row.push({ text: '⊣ stop on impact', action: { kind: 'rstop' }, active: r.stop });
  return row;
}

function axisRow(o: PatchObject, spec: MapAxisSpec): Item[] {
  const ax = spec.key;
  const a = axesOf(o)[ax];
  const row: Item[] = [
    { text: spec.label, action: { kind: 'label' } },
    { text: `${a ? targetLabel(a.to) : 'none'} ▾`, action: { kind: 'axis', axis: ax }, value: true },
  ];
  const t = a && targetOf(a.to);
  if (a && t) {
    row.push({ text: `${spec.lo} ${t.fmt(a.min)}`, action: { kind: 'value', key: `axis.${ax}.min` }, value: true });
    row.push({ text: `${spec.hi} ${t.fmt(a.max)}`, action: { kind: 'value', key: `axis.${ax}.max` }, value: true });
  }
  return row;
}

function noteRow(app: App, o: PatchObject): Item[] {
  const note = o.kind === 'sound' ? (o.note ?? 60) : 60;
  const row: Item[] = [
    { text: 'note', action: { kind: 'label' } },
    { text: noteName(note), action: { kind: 'value', key: 'sound.note' }, value: true },
  ];
  if (app.places.get(o.id)?.pitchSet) row.push({ text: 'a map sets pitch here', action: { kind: 'label' }, dim: true });
  else row.push({ text: '↑ ↓ to step', action: { kind: 'label' }, dim: true });
  return row;
}

/** Following another object (its motion moves this one), or pick one to follow. */
function followRow(app: App, o: PatchObject): Item[] {
  const n = app.followersOf(o.id).length;
  const lead: Item[] = n ? [{ text: `leads ${n}`, action: { kind: 'label' }, dim: true }] : [];
  if (app.followPick === o.id) return [{ text: 'group', action: { kind: 'label' } }, { text: 'click the object to follow… (esc cancels)', action: { kind: 'label' }, dim: true }];
  const leader = o.follow && app.obj(o.follow);
  if (leader) {
    return [
      { text: 'group', action: { kind: 'label' } },
      { text: `⛓ follows ${leader.id}`, action: { kind: 'follow' }, active: true },
      { text: '× unfollow', action: { kind: 'unfollow' } },
      ...lead,
    ];
  }
  return [{ text: 'group', action: { kind: 'label' } }, { text: '⛓ follow…', action: { kind: 'follow' } }, ...lead];
}

function rows(app: App, o: PatchObject): Item[][] {
  const m = o.motion ?? {};
  const pos = m.pos?.type;
  const out: Item[][] = [
    [
      { text: '∿ breathe', action: { kind: 'toggle', what: 'breathe' }, active: !!m.breathe },
      { text: '◯ orbit', action: { kind: 'toggle', what: 'orbit' }, active: pos === 'orbit' },
      { text: '≈ drift', action: { kind: 'toggle', what: 'drift' }, active: pos === 'drift' },
      { text: '⌇ path', action: { kind: 'toggle', what: 'path' }, active: pos === 'path' },
      { text: '⤓ bounce', action: { kind: 'toggle', what: 'bounce' }, active: pos === 'bounce' },
    ],
    followRow(app, o),
  ];
  if (m.breathe) {
    out.push([
      { text: 'breathe', action: { kind: 'toggle', what: 'breathe' }, active: true },
      { text: `depth ${Math.round(m.breathe.amount * 100)}%`, action: { kind: 'value', key: 'breathe.amount' }, value: true },
      { text: `every ${periodLabel(m.breathe.periodBeats)}`, action: { kind: 'value', key: 'breathe.period' }, value: true },
    ]);
  }
  const p = m.pos;
  if (p?.type === 'orbit') {
    out.push([
      { text: 'orbit', action: { kind: 'toggle', what: 'orbit' }, active: true },
      { text: `radius ${Math.round(p.radius)}`, action: { kind: 'value', key: 'pos.radius' }, value: true },
      { text: `every ${periodLabel(p.periodBeats)}`, action: { kind: 'value', key: 'pos.period' }, value: true },
    ]);
  } else if (p?.type === 'drift') {
    out.push([
      { text: 'drift', action: { kind: 'toggle', what: 'drift' }, active: true },
      { text: `range ${Math.round(p.amplitude)}`, action: { kind: 'value', key: 'pos.amplitude' }, value: true },
      { text: `speed ${periodLabel(p.rateBeats)}`, action: { kind: 'value', key: 'pos.rate' }, value: true },
    ]);
  } else if (p?.type === 'path') {
    out.push([
      { text: 'path', action: { kind: 'toggle', what: 'path' }, active: true },
      { text: `every ${periodLabel(p.periodBeats)}`, action: { kind: 'value', key: 'pos.period' }, value: true },
      { text: p.mode, action: { kind: 'mode' }, value: true },
    ]);
  } else if (p?.type === 'bounce') {
    out.push([
      { text: 'bounce', action: { kind: 'toggle', what: 'bounce' }, active: true },
      { text: `height ${Math.round(p.height)}`, action: { kind: 'value', key: 'pos.height' }, value: true },
      { text: `${p.bounces} bounces`, action: { kind: 'value', key: 'pos.bounces' }, value: true },
      { text: `every ${periodLabel(p.periodBeats)}`, action: { kind: 'value', key: 'pos.period' }, value: true },
    ]);
  }
  if (o.kind === 'sound') out.push(noteRow(app, o));
  if (o.kind === 'sound' && soundTypes[o.type]?.mode === 'event') out.push(retriggerRow(o));
  const mt = mapTypeOf(o);
  if (mt) for (const spec of mt.axes) out.push(axisRow(o, spec));
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
  const rs = rows(app, o);
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
      } else if ((ri > 0 && i === 0) || it.dim) {
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
  if ((hov?.kind === 'value' || hov?.kind === 'axis') && !app.axisMenu) {
    g.fillStyle = 'rgba(233,228,218,0.4)';
    g.fillText(hov.kind === 'axis' ? 'click to choose · scroll to step' : 'drag ↔ or scroll', left, top + totalH + 8);
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

const DEFAULTS: Record<'orbit' | 'drift' | 'path' | 'bounce', PosMotion> = {
  bounce: { type: 'bounce', height: 120, bounces: 4, periodBeats: 8 },
  orbit: { type: 'orbit', radius: 80, periodBeats: 16, phase: 0 },
  drift: { type: 'drift', amplitude: 60, rateBeats: 8 },
  path: { type: 'path', points: [[0, 0], [120, 60], [0, 120], [-120, 60]], periodBeats: 32, mode: 'loop' },
};

/** Point an axis at a new target (null: none), starting from that target's default range. */
export function axisTargetEdit(o: PatchObject, axis: string, to: string | null): Edit {
  const t = to && targetOf(to);
  const axes: Axes = { ...axesOf(o) };
  if (to && t) axes[axis] = { to, min: t.min, max: t.max };
  else delete axes[axis];
  return { op: 'set', id: o.id, path: ['axes'], value: axes };
}

// ---------- axis target menu ----------

export interface AxisMenu {
  id: string;
  axis: string;
  /** Left edge, and the chip's top and bottom: it opens below, or above when there's more room. */
  x: number;
  top: number;
  y: number;
}

export interface MenuHit {
  to: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

const MROW = 18;

export function openAxisMenu(app: App, o: PatchObject, axis: string, chip: MotionHit): void {
  app.axisMenu = { id: o.id, axis, x: chip.x, top: chip.y - 3, y: chip.y + chip.h + 3 };
}

/** The open axis menu: built-in targets, then the params of the sounds inside, then none. Wraps into columns when tall. */
export function drawAxisMenu(app: App): void {
  app.menuHits = [];
  const m = app.axisMenu;
  const o = m && app.obj(m.id);
  if (!m || !o || app.sel !== m.id) {
    app.axisMenu = null;
    return;
  }
  const g = app.g;
  g.font = FONT_SMALL;
  const options = axisTargets(app, o);
  const cur = axesOf(o)[m.axis]?.to ?? null;
  type Row = { text: string; to?: string | null; head?: boolean };
  const rows: Row[] = [];
  const builtIn = options.filter((v): v is string => !!v && !v.startsWith(PARAM_PREFIX));
  const params = options.filter((v): v is string => !!v && v.startsWith(PARAM_PREFIX));
  for (const to of builtIn) rows.push({ text: targetLabel(to), to });
  rows.push({ text: 'sound params', head: true });
  // different sounds can label different params alike (attack, decay…): add the key when they clash
  const labels = params.map(targetLabel);
  if (params.length)
    params.forEach((to, i) =>
      rows.push({ text: labels.indexOf(labels[i]) !== labels.lastIndexOf(labels[i]) ? `${labels[i]} · ${to.slice(PARAM_PREFIX.length)}` : labels[i], to }),
    );
  else rows.push({ text: 'put sounds inside to list theirs', head: true });
  rows.push({ text: 'none', to: null });

  const below = app.H - app.barH - m.y - 12;
  const above = m.top - 12;
  const up = rows.length * MROW + 8 > below && above > below;
  const avail = Math.max(MROW * 4, up ? above : below);
  const perCol = Math.max(4, Math.floor((avail - 8) / MROW));
  const cols = Math.ceil(rows.length / perCol);
  const colW = Math.max(...rows.map((r) => g.measureText(r.text).width)) + 26;
  const w = cols * colW + 8;
  const h = Math.min(rows.length, perCol) * MROW + 8;
  const x = Math.max(8, Math.min(m.x, app.W - w - 8));
  const y = up ? m.top - h : m.y;
  g.fillStyle = 'rgba(11,11,14,0.96)';
  g.strokeStyle = 'rgba(233,228,218,0.25)';
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(x, y, w, h, 6);
  g.fill();
  g.stroke();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const hov = app.hover?.kind === 'menu' ? app.hover.hit.to : undefined;
  rows.forEach((r, i) => {
    const rx = x + 4 + Math.floor(i / perCol) * colW;
    const ry = y + 4 + (i % perCol) * MROW;
    if (r.head) {
      g.fillStyle = 'rgba(233,228,218,0.35)';
      g.fillText(r.text, rx + 6, ry + MROW / 2);
      return;
    }
    const on = r.to === cur;
    if (r.to === hov) {
      g.fillStyle = 'rgba(233,228,218,0.12)';
      g.fillRect(rx, ry, colW - 4, MROW);
    }
    g.fillStyle = on ? INK : 'rgba(233,228,218,0.72)';
    g.fillText((on ? '▸ ' : '  ') + r.text, rx + 4, ry + MROW / 2);
    app.menuHits.push({ to: r.to ?? null, x: rx, y: ry, w: colW - 4, h: MROW });
  });
}

export function menuHitAt(app: App, mx: number, my: number): MenuHit | null {
  for (const h of app.menuHits) if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) return h;
  return null;
}

/** Inside the open menu's box (items or not)? */
export function inAxisMenu(app: App, mx: number, my: number): boolean {
  if (!app.menuHits.length) return false;
  const x0 = Math.min(...app.menuHits.map((h) => h.x)) - 4;
  const y0 = Math.min(...app.menuHits.map((h) => h.y)) - 4;
  const x1 = Math.max(...app.menuHits.map((h) => h.x + h.w)) + 4;
  const y1 = Math.max(...app.menuHits.map((h) => h.y + h.h)) + 4;
  return mx >= x0 && mx <= x1 && my >= y0 && my <= y1;
}

/** Axis targets to cycle through: the built-ins, then params of the sounds inside the field, then none. */
function axisTargets(app: App, o: PatchObject): (string | null)[] {
  const keys = new Set<string>();
  const type = mapTypeOf(o);
  if (!type || o.kind !== 'field') return [];
  const m = { obj: o, pose: app.poseOf(o), type };
  for (const s of app.view.objects) {
    if (s.kind !== 'sound') continue;
    const p = app.poseOf(s);
    if (!mapLocate(m, p.x, p.y)) continue;
    for (const q of soundTypes[s.type]?.params ?? []) keys.add(q.key);
  }
  return [...Object.keys(XY_TARGETS), ...[...keys].sort().map((k) => PARAM_PREFIX + k), null];
}

/** The edit for a click on a toggle or mode chip (dir: -1 steps an axis target backwards). */
export function toggleEdit(app: App, o: PatchObject, a: MotionAction, dir = 1): Edit | null {
  if (a.kind === 'rmode' && o.kind === 'sound') {
    return { op: 'set', id: o.id, path: ['ripple', 'mode'], value: a.mode === 'ripple' ? null : a.mode };
  }
  if (a.kind === 'unfollow') return { op: 'set', id: o.id, path: ['follow'], value: null };
  if (a.kind === 'rstop' && o.kind === 'sound') {
    return { op: 'set', id: o.id, path: ['ripple', 'stop'], value: o.ripple?.stop ? null : true };
  }
  if (a.kind === 'axis') {
    // scrolling over the chip steps through the targets (a click opens the menu instead)
    const list = axisTargets(app, o);
    if (!list.length) return null;
    const cur = axesOf(o)[a.axis]?.to ?? null;
    const i = list.indexOf(cur);
    return axisTargetEdit(o, a.axis, list[(((i < 0 ? 0 : i + dir) % list.length) + list.length) % list.length]);
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
    case 'pos.height':
      return p?.height ?? 0;
    case 'pos.bounces':
      return p?.bounces ?? 4;
  }
  if (key === 'sound.note') return o.kind === 'sound' ? (o.note ?? 60) : 60;
  if (key.startsWith('ripple.')) {
    const r = rippleOf(o.kind === 'sound' ? o.ripple : undefined);
    return r[key.slice(7) as 'reach' | 'angle' | 'count' | 'spread' | 'falloff'];
  }
  const [, ax, end] = key.split('.') as [string, string, 'min' | 'max'];
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
    case 'pos.height':
      return Math.round(Math.min(4000, Math.max(5, start + fine)));
    case 'pos.bounces':
      return clampTo(Math.round(start + steps), 0, 12);
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
    case 'sound.note':
      return clampTo(Math.round(start + steps), MIDI_MIN, MIDI_MAX);
    case 'ripple.falloff':
      return clampTo(Math.round((start + steps * 0.05) * 20) / 20, RIPPLE_LIMITS.falloff[0], RIPPLE_LIMITS.falloff[1]);
  }
  const a = axesOf(o)[key.split('.')[1]];
  const t = a && targetOf(a.to);
  if (!t) return start;
  const v = Math.round((start + steps * t.step) / t.step) * t.step;
  return clampTo(Number(v.toPrecision(6)), t.lo, t.hi);
}

export function valueEdit(o: PatchObject, key: ValueKey, v: number): Edit {
  if (key.startsWith('axis.')) {
    const [, ax, end] = key.split('.') as [string, string, 'min' | 'max'];
    const axes: Axes = { ...axesOf(o) };
    const cur = axes[ax];
    if (cur) axes[ax] = { ...cur, [end]: v } as Axis;
    return { op: 'set', id: o.id, path: ['axes'], value: axes };
  }
  if (key.startsWith('ripple.')) return { op: 'set', id: o.id, path: ['ripple', key.slice(7)], value: v };
  if (key === 'sound.note') return { op: 'set', id: o.id, path: ['note'], value: v };
  const path: Record<string, string[]> = {
    'breathe.amount': ['motion', 'breathe', 'amount'],
    'breathe.period': ['motion', 'breathe', 'periodBeats'],
    'pos.radius': ['motion', 'pos', 'radius'],
    'pos.amplitude': ['motion', 'pos', 'amplitude'],
    'pos.period': ['motion', 'pos', 'periodBeats'],
    'pos.rate': ['motion', 'pos', 'rateBeats'],
    'pos.height': ['motion', 'pos', 'height'],
    'pos.bounces': ['motion', 'pos', 'bounces'],
  };
  return { op: 'set', id: o.id, path: path[key], value: v };
}
