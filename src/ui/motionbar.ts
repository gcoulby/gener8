// Motion bar: appears under the selected object. Toggle breathe / spin /
// stretch, pick how it moves from the move menu, and drag (or scroll) the
// values. Motion is the only modulation, so this is where any sound or field
// gets modulated. Event sounds also get a retrigger row (ripple / point /
// multi), and XY fields a row per axis.

import type { App } from './app.ts';
import type { Axes, Axis, BreatheShape, Ease, Edit, MapAxisSpec, PatchObject, PosMotion, RippleSpec } from '../core/types.ts';
import { isCircle } from '../core/geometry.ts';
import { soundTypes } from '../core/sounds/registry.ts';
import { mapTypeOf } from '../core/fields/registry.ts';
import { mapLocate, PARAM_PREFIX, RIPPLE_LIMITS, rippleOf, targetOf, XY_TARGETS } from '../core/placement.ts';
import { MIDI_MAX, MIDI_MIN } from '../core/constants.ts';
import { noteName } from '../core/music.ts';
import { seqLength, seqOf, SEQ_MAX, SEQ_RANGE } from '../core/fields/input.ts';
import { FONT_SMALL, INK } from './theme.ts';

/** Motion periods in beats: up to 1024, i.e. 256 bars, for slow changes over a whole piece. */
export const PERIODS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024];
export const MAX_PERIOD = PERIODS[PERIODS.length - 1];

/** A period for display: beats below 16 bars, whole bars from there. */
export function periodLabel(beats: number): string {
  return beats >= 64 && beats % 4 === 0 ? `${beats / 4} bars` : `${beats} beats`;
}

/** The axis-menu key for the move menu (motion types, not axis targets). */
export const MOVE = '@move';

export type MotionAction =
  | { kind: 'toggle'; what: 'breathe' | 'spin' | 'stretch' | PosMotion['type'] }
  | { kind: 'cycle'; what: 'ease' | 'bshape' | 'spindir' }
  | { kind: 'follow' }
  | { kind: 'unfollow' }
  | { kind: 'value'; key: ValueKey }
  | { kind: 'mode' }
  | { kind: 'rmode'; mode: NonNullable<RippleSpec['mode']> }
  | { kind: 'rstop' }
  | { kind: 'axis'; axis: string }
  | { kind: 'midi' }
  | { kind: 'learn' }
  | { kind: 'label' };

export type ValueKey =
  | 'breathe.amount'
  | 'breathe.period'
  | 'spin.period'
  | 'stretch.amount'
  | 'stretch.period'
  | 'lag'
  | `pos.${string}`
  | `seq.${number}`
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

/** MIDI in and cc fields: whether MIDI is connected (click to connect), and for cc a learn button. */
function midiRow(app: App, o: PatchObject): Item[] {
  const st = app.midi.status;
  const connect = st === 'off' || st === 'denied';
  const row: Item[] = [
    { text: 'midi', action: { kind: 'label' } },
    { text: app.midi.label(), action: connect ? { kind: 'midi' } : { kind: 'label' }, dim: !connect },
  ];
  if (o.kind === 'field' && o.type === 'cc' && st !== 'unsupported') {
    const on = app.midi.learn === o.id;
    row.push({ text: on ? '◎ move a knob… (esc cancels)' : '◎ learn: click, then move a knob', action: { kind: 'learn' }, active: on });
  }
  return row;
}

/** A rest, one step below the lowest degree. */
const REST = -SEQ_RANGE - 1;

/** Sequencer: one chip per step, its degree from the sound's note (· a rest). Drag or scroll to change. */
function seqRow(o: PatchObject): Item[] {
  if (o.kind !== 'field') return [];
  const steps = seqOf(o.seq);
  const n = Math.min(seqLength(o.handles), SEQ_MAX);
  const row: Item[] = [{ text: 'steps', action: { kind: 'label' } }];
  for (let i = 0; i < n; i++) {
    const d = steps[i % steps.length] ?? null;
    row.push({ text: d === null ? '·' : d > 0 ? `+${d}` : String(d), action: { kind: 'value', key: `seq.${i}` }, value: true });
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
      { text: `lag ${o.motion?.lag ?? 0} beats`, action: { kind: 'value', key: 'lag' }, value: true },
      ...lead,
    ];
  }
  return [{ text: 'group', action: { kind: 'label' } }, { text: '⛓ follow…', action: { kind: 'follow' } }, ...lead];
}

type PosType = PosMotion['type'];

/** A position motion's menu glyph and its value chips: [property, chip text]. */
const POS_UI: Record<PosType, { glyph: string; fields: [string, (v: number) => string][] }> = {
  orbit: { glyph: '◯', fields: [['radius', (v) => `radius ${Math.round(v)}`], ['periodBeats', (v) => `every ${periodLabel(v)}`]] },
  drift: { glyph: '≈', fields: [['amplitude', (v) => `range ${Math.round(v)}`], ['rateBeats', (v) => `speed ${periodLabel(v)}`]] },
  path: { glyph: '⌇', fields: [['periodBeats', (v) => `every ${periodLabel(v)}`], ['dwell', (v) => `dwell ${Math.round(v * 100)}%`]] },
  bounce: { glyph: '⤓', fields: [['height', (v) => `height ${Math.round(v)}`], ['bounces', (v) => `${v} bounces`], ['periodBeats', (v) => `every ${periodLabel(v)}`]] },
  pendulum: { glyph: '⟟', fields: [['length', (v) => `length ${Math.round(v)}`], ['swing', (v) => `swing ±${Math.round(v)}°`], ['periodBeats', (v) => `every ${periodLabel(v)}`]] },
  lissajous: { glyph: '∞', fields: [['size', (v) => `size ${Math.round(v)}`], ['a', (v) => `x ×${v}`], ['b', (v) => `y ×${v}`], ['periodBeats', (v) => `every ${periodLabel(v)}`]] },
  spiral: { glyph: '꩜', fields: [['radius', (v) => `radius ${Math.round(v)}`], ['turns', (v) => `${v} turns`], ['periodBeats', (v) => `every ${periodLabel(v)}`]] },
  rose: { glyph: '✿', fields: [['size', (v) => `size ${Math.round(v)}`], ['petals', (v) => `${v} petals`], ['periodBeats', (v) => `every ${periodLabel(v)}`]] },
  spirograph: { glyph: '⚙', fields: [['radius', (v) => `radius ${Math.round(v)}`], ['lobes', (v) => `${v} loops`], ['arm', (v) => `arm ${Math.round(v * 100)}%`], ['periodBeats', (v) => `every ${periodLabel(v)}`]] },
  hop: { glyph: '⁖', fields: [['distance', (v) => `range ${Math.round(v)}`], ['spots', (v) => `${v} spots`], ['everyBeats', (v) => `hop every ${periodLabel(v)}`]] },
  spring: { glyph: '⌁', fields: [['stretch', (v) => `stretch ${Math.round(v)}`], ['damping', (v) => `damping ${Math.round(v * 100)}%`], ['periodBeats', (v) => `every ${periodLabel(v)}`]] },
  shuttle: { glyph: '⇹', fields: [['distance', (v) => `distance ${Math.round(v)}`], ['angle', (v) => `angle ${Math.round(v)}°`], ['periodBeats', (v) => `every ${periodLabel(v)}`]] },
};

/** The move menu's order. */
export const POS_TYPES = Object.keys(POS_UI) as PosType[];

export function posGlyph(t: PosType): string {
  return POS_UI[t].glyph;
}

const EASES: Ease[] = ['linear', 'smooth', 'elastic'];
const BREATHE_SHAPES: BreatheShape[] = ['sine', 'tri', 'ramp', 'square', 'step'];

function rows(app: App, o: PatchObject): Item[][] {
  const m = o.motion ?? {};
  const pos = m.pos?.type;
  const top: Item[] = [
    { text: '∿ breathe', action: { kind: 'toggle', what: 'breathe' }, active: !!m.breathe },
    { text: '↻ spin', action: { kind: 'toggle', what: 'spin' }, active: !!m.spin },
  ];
  // sounds are round: only fields stretch
  if (o.kind === 'field') top.push({ text: '⇔ stretch', action: { kind: 'toggle', what: 'stretch' }, active: !!m.stretch });
  top.push({ text: `move: ${pos ? `${POS_UI[pos].glyph} ${pos}` : 'still'} ▾`, action: { kind: 'axis', axis: MOVE }, value: true });
  const out: Item[][] = [top, followRow(app, o)];
  if (m.breathe) {
    out.push([
      { text: 'breathe', action: { kind: 'toggle', what: 'breathe' }, active: true },
      { text: `depth ${Math.round(m.breathe.amount * 100)}%`, action: { kind: 'value', key: 'breathe.amount' }, value: true },
      { text: `every ${periodLabel(m.breathe.periodBeats)}`, action: { kind: 'value', key: 'breathe.period' }, value: true },
      { text: m.breathe.shape ?? 'sine', action: { kind: 'cycle', what: 'bshape' }, value: true },
    ]);
  }
  if (m.spin) {
    out.push([
      { text: 'spin', action: { kind: 'toggle', what: 'spin' }, active: true },
      { text: `once every ${periodLabel(m.spin.periodBeats)}`, action: { kind: 'value', key: 'spin.period' }, value: true },
      { text: m.spin.ccw ? '↺ anticlockwise' : '↻ clockwise', action: { kind: 'cycle', what: 'spindir' }, value: true },
    ]);
  }
  if (m.stretch && o.kind === 'field') {
    out.push([
      { text: 'stretch', action: { kind: 'toggle', what: 'stretch' }, active: true },
      { text: `amount ${Math.round(m.stretch.amount * 100)}%`, action: { kind: 'value', key: 'stretch.amount' }, value: true },
      { text: `every ${periodLabel(m.stretch.periodBeats)}`, action: { kind: 'value', key: 'stretch.period' }, value: true },
    ]);
  }
  const p = m.pos;
  if (p) {
    const vals = p as unknown as Record<string, number>;
    const row: Item[] = [{ text: p.type, action: { kind: 'toggle', what: p.type }, active: true }];
    for (const [key, fmt] of POS_UI[p.type].fields) row.push({ text: fmt(vals[key] ?? 0), action: { kind: 'value', key: `pos.${key}` }, value: true });
    if (p.type === 'path') row.push({ text: p.mode, action: { kind: 'mode' }, value: true });
    if (p.type === 'orbit' || p.type === 'path' || p.type === 'shuttle') row.push({ text: p.ease ?? 'linear', action: { kind: 'cycle', what: 'ease' }, value: true });
    out.push(row);
  }
  if (o.kind === 'sound') out.push(noteRow(app, o));
  if (o.kind === 'sound' && soundTypes[o.type]?.mode === 'event') out.push(retriggerRow(o));
  const mt = mapTypeOf(o);
  if (mt) for (const spec of mt.axes) out.push(axisRow(o, spec));
  if (o.kind === 'field' && o.type === 'sequencer') out.push(seqRow(o));
  if (o.kind === 'field' && (o.type === 'midi' || o.type === 'cc')) out.push(midiRow(app, o));
  return out;
}

/** Centre x, the top of a bar placed below the object, and the bottom of one placed above it. */
function anchor(app: App, o: PatchObject): [number, number, number] {
  const p = app.poseOf(o);
  const [sx, sy] = app.w2s(p.x, p.y);
  // sounds keep room for their label underneath
  if (o.kind === 'sound') return [sx, sy + app.soundRadius(o) + 26, sy - app.soundRadius(o) - 10];
  const half = isCircle(o.shape) ? o.shape.r * p.scale * app.cam.zoom : (o.shape.h * p.scale * app.cam.zoom) / 2;
  return [sx, sy + half + 12, sy - half - 12];
}

/** Draws the bar for the selection and records hit boxes on app.motionHits. */
export function drawMotionBar(app: App): void {
  app.motionHits = [];
  const o = app.obj(app.sel);
  if (!o || app.panel || app.scrub) return;
  // on touch it stays out of the way until asked for (the strip's edit button, or a double-tap)
  if (app.touchUsed && app.selBarFor !== o.id) return;
  const g = app.g;
  g.font = FONT_SMALL;
  const rs = rows(app, o);
  const widths = rs.map((r) => r.reduce((w, it) => w + g.measureText(it.text).width + 12 + GAP, -GAP));
  const maxW = Math.max(...widths);
  const totalH = rs.length * ROW;
  const [cx, below, above] = anchor(app, o);
  const floor = app.H - app.barH - totalH - 10;
  // below the object; above it when that doesn't fit, so the bar never covers it; clamped when neither does
  let top = below <= floor ? below : above - totalH >= 40 ? above - totalH : below;
  top = Math.min(Math.max(top, 40), floor);
  let left = Math.min(Math.max(cx - maxW / 2, 84), app.W - maxW - 12);
  if (app.touchUsed) {
    // docked: a full-width panel sitting on the selection strip, like part of the bar
    top = app.H - app.barH - totalH - 4;
    left = 14;
    g.fillStyle = '#0b0b0e';
    g.fillRect(0, top - 10, app.W, app.H - app.barH - top + 10);
    g.fillStyle = 'rgba(233,228,218,0.1)';
    g.fillRect(0, top - 10, app.W, 1);
  } else {
    g.fillStyle = 'rgba(11,11,14,0.82)';
    g.beginPath();
    g.roundRect(left - 6, top - 5, maxW + 12, totalH + 4, 6);
    g.fill();
  }
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
  if (a.kind === 'cycle' && b.kind === 'cycle') return a.what === b.what;
  if (a.kind === 'value' && b.kind === 'value') return a.key === b.key;
  if (a.kind === 'rmode' && b.kind === 'rmode') return a.mode === b.mode;
  if (a.kind === 'axis' && b.kind === 'axis') return a.axis === b.axis;
  return true;
}

export function motionHitAt(app: App, mx: number, my: number): MotionHit | null {
  for (const h of app.motionHits) if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) return h;
  return null;
}

const DEFAULTS: Record<PosType, PosMotion> = {
  bounce: { type: 'bounce', height: 120, bounces: 4, periodBeats: 8 },
  orbit: { type: 'orbit', radius: 80, periodBeats: 16, phase: 0 },
  drift: { type: 'drift', amplitude: 60, rateBeats: 8 },
  path: { type: 'path', points: [[0, 0], [120, 60], [0, 120], [-120, 60]], periodBeats: 32, mode: 'loop' },
  pendulum: { type: 'pendulum', length: 120, swing: 60, periodBeats: 8 },
  lissajous: { type: 'lissajous', size: 100, a: 1, b: 2, periodBeats: 32 },
  spiral: { type: 'spiral', radius: 120, turns: 3, periodBeats: 32 },
  rose: { type: 'rose', size: 120, petals: 5, periodBeats: 32 },
  spirograph: { type: 'spirograph', radius: 120, lobes: 5, arm: 0.6, periodBeats: 32 },
  hop: { type: 'hop', distance: 120, spots: 4, everyBeats: 4 },
  spring: { type: 'spring', stretch: 80, damping: 0.4, periodBeats: 8 },
  shuttle: { type: 'shuttle', angle: 90, distance: 120, periodBeats: 16 },
};

/**
 * Point an axis at a new target (null: none), starting from that target's
 * default range. For the move menu, start that motion type (null: stand still).
 */
export function axisTargetEdit(o: PatchObject, axis: string, to: string | null): Edit {
  if (axis === MOVE) {
    const cur = o.motion?.pos?.type;
    return { op: 'set', id: o.id, path: ['motion', 'pos'], value: to && to !== cur ? DEFAULTS[to as PosType] : to ? o.motion?.pos : null };
  }
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
  const move = m.axis === MOVE;
  const options = axisTargets(app, o, m.axis);
  const cur = move ? (o.motion?.pos?.type ?? null) : (axesOf(o)[m.axis]?.to ?? null);
  type Row = { text: string; to?: string | null; head?: boolean };
  const rows: Row[] = [];
  if (move) {
    for (const t of POS_TYPES) rows.push({ text: `${POS_UI[t].glyph} ${t}`, to: t });
    rows.push({ text: 'still', to: null });
  }
  const builtIn = options.filter((v): v is string => !!v && !v.startsWith(PARAM_PREFIX));
  const params = options.filter((v): v is string => !!v && v.startsWith(PARAM_PREFIX));
  if (!move) {
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
  }

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

/**
 * Axis targets to cycle through: the built-ins, then params of the sounds
 * inside the field, then none. For the move menu, the motion types then still.
 */
function axisTargets(app: App, o: PatchObject, axis: string): (string | null)[] {
  if (axis === MOVE) return [...POS_TYPES, null];
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
    const list = axisTargets(app, o, a.axis);
    if (!list.length) return null;
    const cur = a.axis === MOVE ? (o.motion?.pos?.type ?? null) : (axesOf(o)[a.axis]?.to ?? null);
    const i = list.indexOf(cur);
    return axisTargetEdit(o, a.axis, list[(((i < 0 ? 0 : i + dir) % list.length) + list.length) % list.length]);
  }
  if (a.kind === 'mode') {
    const p = o.motion?.pos;
    if (p?.type !== 'path') return null;
    return { op: 'set', id: o.id, path: ['motion', 'pos', 'mode'], value: p.mode === 'loop' ? 'pingpong' : 'loop' };
  }
  if (a.kind === 'cycle') {
    const m = o.motion;
    if (a.what === 'spindir' && m?.spin) return { op: 'set', id: o.id, path: ['motion', 'spin', 'ccw'], value: m.spin.ccw ? null : true };
    if (a.what === 'bshape' && m?.breathe) {
      const next = BREATHE_SHAPES[(BREATHE_SHAPES.indexOf(m.breathe.shape ?? 'sine') + dir + BREATHE_SHAPES.length) % BREATHE_SHAPES.length];
      return { op: 'set', id: o.id, path: ['motion', 'breathe', 'shape'], value: next === 'sine' ? null : next };
    }
    const p = m?.pos;
    if (a.what === 'ease' && (p?.type === 'orbit' || p?.type === 'path' || p?.type === 'shuttle')) {
      const next = EASES[(EASES.indexOf(p.ease ?? 'linear') + dir + EASES.length) % EASES.length];
      return { op: 'set', id: o.id, path: ['motion', 'pos', 'ease'], value: next === 'linear' ? null : next };
    }
    return null;
  }
  if (a.kind !== 'toggle') return null;
  if (a.what === 'breathe') {
    return { op: 'set', id: o.id, path: ['motion', 'breathe'], value: o.motion?.breathe ? null : { amount: 0.3, periodBeats: 16 } };
  }
  if (a.what === 'spin') return { op: 'set', id: o.id, path: ['motion', 'spin'], value: o.motion?.spin ? null : { periodBeats: 16 } };
  if (a.what === 'stretch') return { op: 'set', id: o.id, path: ['motion', 'stretch'], value: o.motion?.stretch ? null : { amount: 0.3, periodBeats: 16 } };
  const on = o.motion?.pos?.type === a.what;
  return { op: 'set', id: o.id, path: ['motion', 'pos'], value: on ? null : DEFAULTS[a.what] };
}

export function readValue(o: PatchObject, key: ValueKey): number {
  const m = o.motion ?? {};
  switch (key) {
    case 'breathe.amount':
      return m.breathe?.amount ?? 0;
    case 'breathe.period':
      return m.breathe?.periodBeats ?? 16;
    case 'spin.period':
      return m.spin?.periodBeats ?? 16;
    case 'stretch.amount':
      return m.stretch?.amount ?? 0;
    case 'stretch.period':
      return m.stretch?.periodBeats ?? 16;
    case 'lag':
      return m.lag ?? 0;
  }
  if (key.startsWith('pos.')) {
    const k = key.slice(4);
    const v = (m.pos as Record<string, unknown> | undefined)?.[k];
    return typeof v === 'number' ? v : (POS_PROPS[k]?.lo ?? 0);
  }
  if (key === 'sound.note') return o.kind === 'sound' ? (o.note ?? 60) : 60;
  if (key.startsWith('seq.')) {
    const steps = seqOf(o.kind === 'field' ? o.seq : null);
    const d = steps[Number(key.slice(4)) % steps.length];
    return d === null || d === undefined ? REST : d;
  }
  if (key.startsWith('ripple.')) {
    const r = rippleOf(o.kind === 'sound' ? o.ripple : undefined);
    return r[key.slice(7) as 'reach' | 'angle' | 'count' | 'spread' | 'falloff'];
  }
  const [, ax, end] = key.split('.') as [string, string, 'min' | 'max'];
  return axesOf(o)[ax]?.[end] ?? 0;
}

/** How each position-motion property steps: distances by pixels, periods through PERIODS, the rest in units. */
const POS_PROPS: Record<string, { kind: 'dist' | 'period' | 'int' | 'deg' | 'frac'; lo: number; hi: number; step?: number }> = {
  radius: { kind: 'dist', lo: 5, hi: 4000 },
  amplitude: { kind: 'dist', lo: 5, hi: 4000 },
  height: { kind: 'dist', lo: 5, hi: 4000 },
  length: { kind: 'dist', lo: 5, hi: 4000 },
  size: { kind: 'dist', lo: 5, hi: 4000 },
  distance: { kind: 'dist', lo: 5, hi: 4000 },
  stretch: { kind: 'dist', lo: 5, hi: 4000 },
  periodBeats: { kind: 'period', lo: 1, hi: MAX_PERIOD },
  rateBeats: { kind: 'period', lo: 1, hi: MAX_PERIOD },
  everyBeats: { kind: 'period', lo: 1, hi: MAX_PERIOD },
  bounces: { kind: 'int', lo: 0, hi: 12 },
  a: { kind: 'int', lo: 1, hi: 8 },
  b: { kind: 'int', lo: 1, hi: 8 },
  petals: { kind: 'int', lo: 2, hi: 9 },
  lobes: { kind: 'int', lo: 2, hi: 12 },
  spots: { kind: 'int', lo: 2, hi: 8 },
  turns: { kind: 'int', lo: 0.5, hi: 8, step: 0.5 },
  swing: { kind: 'deg', lo: 5, hi: 170 },
  angle: { kind: 'deg', lo: 0, hi: 360 },
  arm: { kind: 'frac', lo: 0, hi: 1 },
  damping: { kind: 'frac', lo: 0, hi: 1 },
  dwell: { kind: 'frac', lo: 0, hi: 0.9 },
};

function stepPeriod(v: number, steps: number): number {
  let i = PERIODS.findIndex((p) => p >= v);
  if (i < 0) i = PERIODS.length - 1;
  return PERIODS[Math.min(PERIODS.length - 1, Math.max(0, i + steps))];
}

const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** New value for a value chip: `steps` is signed (drag pixels / 12, or ±1 per scroll notch). */
export function stepValue(o: PatchObject, key: ValueKey, start: number, steps: number, fine: number): number {
  if (key.startsWith('pos.')) {
    const s = POS_PROPS[key.slice(4)];
    if (!s) return start;
    switch (s.kind) {
      case 'dist':
        return Math.round(clampTo(start + fine, s.lo, s.hi));
      case 'period':
        return stepPeriod(start, steps);
      case 'int': {
        const st = s.step ?? 1;
        return clampTo(Math.round((start + steps * st) / st) * st, s.lo, s.hi);
      }
      case 'deg':
        return s.hi === 360 ? ((Math.round((start + steps * 5) / 5) * 5) % 360 + 360) % 360 : clampTo(Math.round((start + steps * 5) / 5) * 5, s.lo, s.hi);
      case 'frac':
        return clampTo(Math.round((start + steps * 0.05) * 20) / 20, s.lo, s.hi);
    }
  }
  switch (key) {
    case 'breathe.amount':
    case 'stretch.amount':
      return Math.round(Math.min(0.9, Math.max(0, start + fine * 0.005)) * 100) / 100;
    case 'breathe.period':
    case 'spin.period':
    case 'stretch.period':
      return stepPeriod(start, steps);
    case 'lag':
      return clampTo(Math.round((start + steps * 0.25) * 4) / 4, 0, 64);
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
  if (key.startsWith('seq.')) return clampTo(Math.round(start + steps), REST, SEQ_RANGE);
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
  if (key.startsWith('pos.')) return { op: 'set', id: o.id, path: ['motion', 'pos', key.slice(4)], value: v };
  if (key.startsWith('seq.')) {
    // the whole sequence, written out to the full length so every step can be set
    const cur = seqOf(o.kind === 'field' ? o.seq : null);
    const seq = Array.from({ length: SEQ_MAX }, (_, i) => cur[i % cur.length] ?? null);
    seq[Number(key.slice(4))] = v <= REST ? null : v;
    return { op: 'set', id: o.id, path: ['seq'], value: seq };
  }
  if (key === 'lag') return { op: 'set', id: o.id, path: ['motion', 'lag'], value: v || null };
  const path: Record<string, string[]> = {
    'breathe.amount': ['motion', 'breathe', 'amount'],
    'breathe.period': ['motion', 'breathe', 'periodBeats'],
    'spin.period': ['motion', 'spin', 'periodBeats'],
    'stretch.amount': ['motion', 'stretch', 'amount'],
    'stretch.period': ['motion', 'stretch', 'periodBeats'],
  };
  return { op: 'set', id: o.id, path: path[key], value: v };
}
