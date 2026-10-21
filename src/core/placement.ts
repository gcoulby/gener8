// Where a sound sits → how it is placed: pitch, pan, level and its ripple
// settings. Nothing about the canvas is fixed: XY fields map position inside
// them to targets, higher layers override lower ones, and a sound outside every
// XY field gets the defaults. Shared by the engine and the UI.

import type { Axes, Axis, FieldObj, RippleSpec } from './types.ts';
import type { Pose } from './motion.ts';
import { MIDI_MAX, MIDI_MIN, RIPPLE_REACH, Y0_MIDI } from './constants.ts';
import { shapeDims } from './geometry.ts';
import { noteName } from './music.ts';

export interface XYTarget {
  label: string;
  /** Legal range; the mapped value is clamped to it. */
  lo: number;
  hi: number;
  /** Range a fresh axis starts with. */
  min: number;
  max: number;
  /** One drag step or scroll notch in the UI. */
  step: number;
  fmt(v: number): string;
}

const num = (v: number) => String(Math.round(v * 100) / 100);

export const XY_TARGETS: Record<string, XYTarget> = {
  pitch: { label: 'pitch', lo: MIDI_MIN, hi: MIDI_MAX, min: 48, max: 84, step: 1, fmt: (v) => noteName(v) },
  pan: { label: 'pan', lo: -1, hi: 1, min: -1, max: 1, step: 0.05, fmt: (v) => (Math.abs(v) < 0.005 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100)) },
  level: { label: 'level', lo: -40, hi: 12, min: -24, max: 0, step: 1, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} dB` },
  reach: { label: 'reach', lo: 0, hi: 24, min: 0, max: 12, step: 0.5, fmt: (v) => `×${num(v)}` },
  angle: { label: 'angle', lo: 0, hi: 360, min: 0, max: 360, step: 5, fmt: (v) => `${Math.round(v)}°` },
  spread: { label: 'spread', lo: 0, hi: 360, min: 0, max: 360, step: 5, fmt: (v) => `${Math.round(v)}°` },
};

export const PARAM_PREFIX = 'param:';

const PARAM_TARGET: XYTarget = { label: 'param', lo: 0, hi: 1, min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` };

/** Target spec for an axis `to`, or null if unknown. Param targets are normalised 0..1. */
export function targetOf(to: string): XYTarget | null {
  if (to.startsWith(PARAM_PREFIX)) return PARAM_TARGET;
  return Object.hasOwn(XY_TARGETS, to) ? XY_TARGETS[to] : null;
}

export const DEFAULT_AXES: Axes = {
  x: { to: 'pan', min: -1, max: 1 },
  y: { to: 'pitch', min: 48, max: 84 },
};

/** Value at offset `l` from the centre of an axis spanning ±half. min > max inverts it. */
export function axisValue(a: Axis, l: number, half: number): number {
  const mid = (a.min + a.max) / 2;
  const hs = (a.max - a.min) / 2;
  if (hs === 0 || half <= 0) return mid;
  // Written as l / (half / hs) so a stage-sized field reproduces the v1 mapping bit for bit.
  return mid + l / (half / hs);
}

/** Offset from the centre where an axis reaches value v (the inverse of axisValue). */
export function axisOffset(a: Axis, v: number, half: number): number {
  const hs = (a.max - a.min) / 2;
  if (hs === 0) return 0;
  return (v - (a.min + a.max) / 2) * (half / hs);
}

// ---------- ripples ----------

export const RIPPLE_DEFAULTS: Required<RippleSpec> = {
  mode: 'ripple',
  angle: 0,
  count: 3,
  spread: 90,
  reach: RIPPLE_REACH,
  stop: false,
};

export const RIPPLE_LIMITS = { count: [1, 16], reach: [0, 24], angle: [0, 360], spread: [0, 360] } as const;

export function rippleOf(r: RippleSpec | undefined): Required<RippleSpec> {
  return r ? { ...RIPPLE_DEFAULTS, ...r } : RIPPLE_DEFAULTS;
}

/** Trace directions in turns clockwise from up, or null for a ring. */
export function traceTurns(mode: RippleSpec['mode'], angle: number, count: number, spread: number): number[] | null {
  if (mode !== 'point' && mode !== 'multi') return null;
  const a = angle / 360;
  const n = mode === 'point' ? 1 : Math.max(1, Math.min(16, Math.round(count)));
  if (n === 1) return [a];
  const out: number[] = [];
  const s = spread / 360;
  for (let i = 0; i < n; i++) out.push(s >= 1 ? a + i / n : a - s / 2 + (i * s) / (n - 1));
  return out;
}

// ---------- placement ----------

export interface Placement {
  pitch: number;
  pan: number;
  /** dB. */
  level: number;
  reach: number;
  angle: number;
  spread: number;
  /** Sound params set by param: axes, normalised 0..1 (parallel arrays). */
  pk: string[];
  pv: number[];
}

export function newPlacement(): Placement {
  return { pitch: Y0_MIDI, pan: 0, level: 0, reach: RIPPLE_REACH, angle: 0, spread: 90, pk: [], pv: [] };
}

export interface MapPose {
  obj: FieldObj;
  pose: Pose;
}

function setTarget(out: Placement, to: string, v: number): void {
  const t = targetOf(to);
  if (!t) return;
  v = v < t.lo ? t.lo : v > t.hi ? t.hi : v;
  switch (to) {
    case 'pitch':
      out.pitch = v;
      return;
    case 'pan':
      out.pan = v;
      return;
    case 'level':
      out.level = v;
      return;
    case 'reach':
      out.reach = v;
      return;
    case 'angle':
      out.angle = v;
      return;
    case 'spread':
      out.spread = v;
      return;
  }
  const key = to.slice(PARAM_PREFIX.length);
  const i = out.pk.indexOf(key);
  if (i >= 0) out.pv[i] = v;
  else {
    out.pk.push(key);
    out.pv.push(v);
  }
}

/** Is (px, py) inside the map's rectangle (edges included)? Returns the half extents, or null. */
export function mapContains(m: MapPose, px: number, py: number): { hw: number; hh: number } | null {
  const d = shapeDims(m.obj.shape, m.pose.scale);
  const hw = d.w / 2;
  const hh = d.h / 2;
  const dx = px - m.pose.x;
  const dy = py - m.pose.y;
  if ((dx < 0 ? -dx : dx) > hw || (dy < 0 ? -dy : dy) > hh) return null;
  return { hw, hh };
}

/** Resolve a sound at (px, py) against the maps, which must be in layer order (lowest first). */
export function placeSound(px: number, py: number, maps: readonly MapPose[], ripple: RippleSpec | undefined, out: Placement): Placement {
  out.pitch = Y0_MIDI;
  out.pan = 0;
  out.level = 0;
  out.reach = ripple?.reach ?? RIPPLE_DEFAULTS.reach;
  out.angle = ripple?.angle ?? RIPPLE_DEFAULTS.angle;
  out.spread = ripple?.spread ?? RIPPLE_DEFAULTS.spread;
  out.pk.length = 0;
  out.pv.length = 0;
  for (const m of maps) {
    const ext = mapContains(m, px, py);
    if (!ext) continue;
    const axes = m.obj.axes ?? DEFAULT_AXES;
    if (axes.x) setTarget(out, axes.x.to, axisValue(axes.x, px - m.pose.x, ext.hw));
    if (axes.y) setTarget(out, axes.y.to, axisValue(axes.y, py - m.pose.y, ext.hh));
  }
  return out;
}

/** The topmost map whose axis drives `to` at (px, py), for the UI's pitch ladder and nudges. */
export function governingAxis(px: number, py: number, maps: readonly MapPose[], to: string): { m: MapPose; axis: 'x' | 'y'; a: Axis; half: number } | null {
  for (let i = maps.length - 1; i >= 0; i--) {
    const m = maps[i];
    const ext = mapContains(m, px, py);
    if (!ext) continue;
    const axes = m.obj.axes ?? DEFAULT_AXES;
    if (axes.y?.to === to) return { m, axis: 'y', a: axes.y, half: ext.hh };
    if (axes.x?.to === to) return { m, axis: 'x', a: axes.x, half: ext.hw };
  }
  return null;
}
