// Where a sound sits → how it is placed: pitch, pan, level and its ripple
// settings. Nothing about the canvas is fixed: map fields (xy, radial, sweep,
// tri) map position inside them to targets, higher layers override lower ones,
// and a sound outside every map gets the defaults. Shared by the engine and the UI.

import type { Axis, FieldObj, MapType, RippleSpec, SoundObj } from './types.ts';
import type { Pose } from './motion.ts';
import { MIDI_MAX, MIDI_MIN, RIPPLE_REACH, Y0_MIDI } from './constants.ts';
import { shapeDims, toLocal } from './geometry.ts';
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
  falloff: { label: 'fall-off', lo: 0, hi: 1, min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
};

export const PARAM_PREFIX = 'param:';

const PARAM_TARGET: XYTarget = { label: 'param', lo: 0, hi: 1, min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` };

/** Target spec for an axis `to`, or null if unknown. Param targets are normalised 0..1. */
export function targetOf(to: string): XYTarget | null {
  if (to.startsWith(PARAM_PREFIX)) return PARAM_TARGET;
  return Object.hasOwn(XY_TARGETS, to) ? XY_TARGETS[to] : null;
}

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
  falloff: 1,
  stop: false,
};

export const RIPPLE_LIMITS = { count: [1, 16], reach: [0, 24], angle: [0, 360], spread: [0, 360], falloff: [0, 1] } as const;

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
  /** A map field set the pitch (otherwise it's the sound's own note). */
  pitchSet: boolean;
  pan: number;
  /** dB. */
  level: number;
  reach: number;
  angle: number;
  spread: number;
  falloff: number;
  /** Sound params set by param: axes, normalised 0..1 (parallel arrays). */
  pk: string[];
  pv: number[];
}

export function newPlacement(): Placement {
  return { pitch: Y0_MIDI, pitchSet: false, pan: 0, level: 0, reach: RIPPLE_REACH, angle: 0, spread: 90, falloff: 1, pk: [], pv: [] };
}

export interface MapPose {
  obj: FieldObj;
  pose: Pose;
  type: MapType;
}

function setTarget(out: Placement, to: string, v: number): void {
  const t = targetOf(to);
  if (!t) return;
  v = v < t.lo ? t.lo : v > t.hi ? t.hi : v;
  switch (to) {
    case 'pitch':
      out.pitch = v;
      out.pitchSet = true;
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
    case 'falloff':
      out.falloff = v;
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

const scratch: number[] = [];
const local = [0, 0];

/**
 * Locate (px, py) in a map: false when outside, otherwise out holds
 * [offset, half] per axis (see MapType.locate). A spinning or stretching map
 * carries its axes round with it.
 */
export function mapLocate(m: MapPose, px: number, py: number, out: number[] = scratch): boolean {
  const p = m.pose;
  const d = shapeDims(m.obj.shape, p.scale);
  toLocal(p.x, p.y, p.angle, p.sx, p.sy, px, py, local);
  return m.type.locate(d.w, d.h, local[0], local[1], out, m.obj.handles);
}

/** Resolve a sound at (px, py) against the maps, which must be in layer order (lowest first). */
export function placeSound(px: number, py: number, maps: readonly MapPose[], s: Pick<SoundObj, 'note' | 'ripple'> | undefined, out: Placement): Placement {
  const ripple = s?.ripple;
  out.pitch = s?.note ?? Y0_MIDI;
  out.pitchSet = false;
  out.pan = 0;
  out.level = 0;
  out.reach = ripple?.reach ?? RIPPLE_DEFAULTS.reach;
  out.angle = ripple?.angle ?? RIPPLE_DEFAULTS.angle;
  out.spread = ripple?.spread ?? RIPPLE_DEFAULTS.spread;
  out.falloff = ripple?.falloff ?? RIPPLE_DEFAULTS.falloff;
  out.pk.length = 0;
  out.pv.length = 0;
  for (const m of maps) {
    if (!mapLocate(m, px, py)) continue;
    const axes = m.obj.axes ?? m.type.defaultAxes;
    const specs = m.type.axes;
    for (let i = 0; i < specs.length; i++) {
      const a = axes[specs[i].key];
      if (a) setTarget(out, a.to, axisValue(a, scratch[i * 2], scratch[i * 2 + 1]));
    }
  }
  return out;
}

/**
 * The topmost XY field whose x or y axis drives `to` at (px, py): the straight
 * axes the UI can draw a pitch ladder along and nudge by semitones.
 */
export function governingAxis(px: number, py: number, maps: readonly MapPose[], to: string): { m: MapPose; axis: 'x' | 'y'; a: Axis; half: number } | null {
  for (let i = maps.length - 1; i >= 0; i--) {
    const m = maps[i];
    if (!mapLocate(m, px, py)) continue;
    const axes = m.obj.axes ?? m.type.defaultAxes;
    if (m.type.id !== 'xy') {
      if (m.type.axes.some((s) => axes[s.key]?.to === to)) return null;
      continue;
    }
    if (axes.y?.to === to) return { m, axis: 'y', a: axes.y, half: scratch[3] };
    if (axes.x?.to === to) return { m, axis: 'x', a: axes.x, half: scratch[1] };
  }
  return null;
}
