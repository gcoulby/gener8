// Protection layer for patches that arrive in a link. Builds a fresh patch from
// a whitelist (never spreads the input), rejects anything malformed with a short
// human message, and clamps numbers to the ranges the UI itself allows.
// The open-file path and normal editing do not go through this.

import type { Axes, Axis, MapType, Breathe, FieldObj, FieldShape, Motion, Patch, PatchObject, PosMotion, RippleSpec, SoundObj, Vec2 } from './types.ts';
import { SCALE_ORDER } from './music.ts';
import { MIDI_MAX, MIDI_MIN } from './constants.ts';
import { soundTypes } from './sounds/registry.ts';
import { fieldTypes } from './fields/registry.ts';
import { cleanInfo, normalizePatch } from './patch.ts';
import { isCircle } from './geometry.ts';
import { PARAM_PREFIX, RIPPLE_LIMITS, targetOf } from './placement.ts';

export class ShareError extends Error {}

/** The tested scale target (test/stress.test.ts). Raise only if stress passes higher. */
export const SHARE_LIMITS = {
  MAX_SOUNDS: 24,
  MAX_FIELDS: 12,
  /** Map fields (xy, radial, sweep, tri), counted apart from MAX_FIELDS: they cost a few comparisons per sound. */
  MAX_MAPS: 8,
  MAX_JSON_CHARS: 262144,
  MAX_PATH_POINTS: 32,
};

const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,23}$/;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** Canvas bound for positions and sizes. */
export const XY = 8000;
/** Axis ends may run past a target's legal range (the engine clamps the result). */
const AXIS_END = 10000;
const SOUND_PARAM_KEYS = new Set(Object.values(soundTypes).flatMap((t) => t.params.map((p) => p.key)));

// UI clamps (app.ts dragHandle, mixer.ts, motionbar.ts, patch.ts applyEdit).
const SOUND_SIZE = [12, 200];
const MIN_R = 20;
const MIN_WH = 48;
const TRIM = [-40, 12];
const MASTER = [-60, 12];
const BREATHE_AMOUNT = [0, 0.9];
const MOTION_DIST = [0, 4000];
const MIN_BEATS = 0.25;
const MAX_BOUNCES = 12;

type Obj = Record<string, unknown>;

const fail = (msg: string): never => {
  throw new ShareError(msg);
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function isPlain(x: unknown): x is Obj {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

function obj(x: unknown, what: string): Obj {
  return isPlain(x) ? x : fail(`bad ${what}`);
}

function num(x: unknown, what: string): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fail(`bad number in ${what}`);
}

function int(x: unknown, what: string, lo: number, hi: number): number {
  const v = num(x, what);
  return Number.isInteger(v) && v >= lo && v <= hi ? v : fail(`bad ${what}`);
}

function positive(x: unknown, what: string, min: number): number {
  const v = num(x, what);
  if (v <= 0 || v > XY) fail(`bad ${what}`);
  return Math.max(min, v);
}

/** Reject prototype-pollution keys at any depth before anything else reads the input. */
function scanKeys(x: unknown, depth = 0): void {
  if (depth > 32) fail('patch is nested too deeply');
  if (Array.isArray(x)) {
    for (const v of x) scanKeys(v, depth + 1);
  } else if (x && typeof x === 'object') {
    for (const k of Object.keys(x)) {
      if (BAD_KEYS.has(k)) fail('patch contains a forbidden key');
      scanKeys((x as Obj)[k], depth + 1);
    }
  }
}

function values(input: unknown, specs: { key: string; min: number; max: number }[], what: string): Record<string, number> {
  const src = input === undefined ? {} : obj(input, what);
  const out: Record<string, number> = {};
  for (const s of specs) {
    if (!Object.hasOwn(src, s.key)) continue;
    out[s.key] = clamp(num(src[s.key], what), s.min, s.max);
  }
  return out;
}

function beats(x: unknown, what: string): number {
  return Math.max(MIN_BEATS, num(x, what));
}

function posMotion(input: unknown, limits: typeof SHARE_LIMITS): PosMotion {
  const m = obj(input, 'motion');
  switch (m.type) {
    case 'orbit':
      return { type: 'orbit', radius: clamp(num(m.radius, 'orbit'), MOTION_DIST[0], MOTION_DIST[1]), periodBeats: beats(m.periodBeats, 'orbit'), phase: clamp(num(m.phase ?? 0, 'orbit'), -1, 1) };
    case 'drift':
      return { type: 'drift', amplitude: clamp(num(m.amplitude, 'drift'), MOTION_DIST[0], MOTION_DIST[1]), rateBeats: beats(m.rateBeats, 'drift') };
    case 'bounce':
      return { type: 'bounce', height: clamp(num(m.height, 'bounce'), MOTION_DIST[0], MOTION_DIST[1]), bounces: Math.round(clamp(num(m.bounces, 'bounce'), 0, MAX_BOUNCES)), periodBeats: beats(m.periodBeats, 'bounce') };
    case 'path': {
      if (!Array.isArray(m.points) || m.points.length < 1 || m.points.length > limits.MAX_PATH_POINTS) fail('bad path');
      const points = (m.points as unknown[]).map((p): Vec2 => {
        if (!Array.isArray(p) || p.length !== 2) fail('bad path point');
        const q = p as unknown[];
        return [clamp(num(q[0], 'path'), -XY, XY), clamp(num(q[1], 'path'), -XY, XY)];
      });
      if (m.mode !== 'loop' && m.mode !== 'pingpong') fail('bad path mode');
      return { type: 'path', points, periodBeats: beats(m.periodBeats, 'path'), mode: m.mode as 'loop' | 'pingpong' };
    }
  }
  return fail('unknown motion type');
}

function motion(input: unknown, limits: typeof SHARE_LIMITS): Motion | undefined {
  if (input === undefined) return undefined;
  const m = obj(input, 'motion');
  const out: Motion = {};
  if (m.pos !== undefined) out.pos = posMotion(m.pos, limits);
  if (m.breathe !== undefined) {
    const b = obj(m.breathe, 'breathe');
    const breathe: Breathe = { amount: clamp(num(b.amount, 'breathe'), BREATHE_AMOUNT[0], BREATHE_AMOUNT[1]), periodBeats: beats(b.periodBeats, 'breathe') };
    out.breathe = breathe;
  }
  return out.pos || out.breathe ? out : undefined;
}

function shape(input: unknown): FieldShape {
  const s = obj(input, 'shape');
  if (Object.hasOwn(s, 'r')) return { r: positive(s.r, 'shape', MIN_R) };
  return { w: positive(s.w, 'shape', MIN_WH), h: positive(s.h, 'shape', MIN_WH) };
}

function axis(input: unknown, what: string): Axis | undefined {
  if (input === undefined) return undefined;
  const a = obj(input, what);
  const to = typeof a.to === 'string' ? a.to : fail(`bad ${what}`);
  if (!targetOf(to) || (to.startsWith(PARAM_PREFIX) && !SOUND_PARAM_KEYS.has(to.slice(PARAM_PREFIX.length)))) fail(`unknown ${what} target · needs a newer GENER8`);
  return { to, min: clamp(num(a.min, what), -AXIS_END, AXIS_END), max: clamp(num(a.max, what), -AXIS_END, AXIS_END) };
}

function axes(input: unknown, t: MapType): Axes | undefined {
  if (input === undefined) return undefined;
  const a = obj(input, 'axes');
  const out: Axes = {};
  for (const spec of t.axes) {
    const v = axis(a[spec.key], `${spec.key} axis`);
    if (v) out[spec.key] = v;
  }
  return out;
}

function ripple(input: unknown): RippleSpec | undefined {
  if (input === undefined) return undefined;
  const r = obj(input, 'ripple');
  const out: RippleSpec = {};
  if (r.mode !== undefined) out.mode = r.mode === 'ripple' || r.mode === 'point' || r.mode === 'multi' ? r.mode : fail('bad ripple mode');
  if (r.angle !== undefined) out.angle = clamp(num(r.angle, 'ripple'), RIPPLE_LIMITS.angle[0], RIPPLE_LIMITS.angle[1]);
  if (r.count !== undefined) out.count = Math.round(clamp(num(r.count, 'ripple'), RIPPLE_LIMITS.count[0], RIPPLE_LIMITS.count[1]));
  if (r.spread !== undefined) out.spread = clamp(num(r.spread, 'ripple'), RIPPLE_LIMITS.spread[0], RIPPLE_LIMITS.spread[1]);
  if (r.reach !== undefined) out.reach = clamp(num(r.reach, 'ripple'), RIPPLE_LIMITS.reach[0], RIPPLE_LIMITS.reach[1]);
  if (r.falloff !== undefined) out.falloff = clamp(num(r.falloff, 'ripple'), RIPPLE_LIMITS.falloff[0], RIPPLE_LIMITS.falloff[1]);
  if (flag(r.stop, 'ripple stop')) out.stop = true;
  return Object.keys(out).length ? out : undefined;
}

function flag(x: unknown, what: string): boolean | undefined {
  if (x === undefined || x === false) return undefined;
  return x === true ? true : fail(`bad ${what}`);
}

function object(input: unknown, limits: typeof SHARE_LIMITS): PatchObject {
  const o = obj(input, 'object');
  const id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : fail('bad object id');
  const type = typeof o.type === 'string' ? o.type : fail('bad object type');
  const x = clamp(num(o.x, id), -XY, XY);
  const y = clamp(num(o.y, id), -XY, XY);
  const layer = clamp(int(o.layer, `${id} layer`, -Infinity, Infinity), 0, 999);
  const mo = motion(o.motion, limits);
  const trim = o.trim === undefined ? undefined : clamp(num(o.trim, id), TRIM[0], TRIM[1]);
  // checked against the other ids once every object is built
  const follow = o.follow === undefined ? undefined : typeof o.follow === 'string' && ID_RE.test(o.follow) ? o.follow : fail(`bad ${id} follow`);

  if (o.kind === 'sound') {
    const t = soundTypes[type] ?? fail(`unknown sound "${type.slice(0, 24)}" · needs a newer GENER8`);
    const s: SoundObj = { id, kind: 'sound', type, x, y, size: clamp(num(o.size, id), SOUND_SIZE[0], SOUND_SIZE[1]), layer, params: values(o.params, t.params, `${id} params`) };
    if (mo) s.motion = mo;
    if (follow) s.follow = follow;
    const rp = ripple(o.ripple);
    if (rp) s.ripple = rp;
    if (o.note !== undefined) s.note = Math.round(clamp(num(o.note, id), MIDI_MIN, MIDI_MAX));
    if (trim !== undefined) s.trim = trim;
    if (flag(o.mute, 'mute')) s.mute = true;
    if (flag(o.solo, 'solo')) s.solo = true;
    return s;
  }
  if (o.kind === 'field') {
    const t = fieldTypes[type] ?? fail(`unknown field "${type.slice(0, 24)}" · needs a newer GENER8`);
    const handles = values(o.handles, t.handles.map((h) => ({ key: h.key, min: 0, max: 1 })), `${id} handles`);
    const f: FieldObj = { id, kind: 'field', type, x, y, shape: shape(o.shape), layer, handles };
    if (mo) f.motion = mo;
    if (follow) f.follow = follow;
    if (t.role === 'map') {
      if ((t.shape === 'rect') !== !isCircle(f.shape)) fail(`bad ${id} shape`);
      const ax = axes(o.axes, t);
      if (ax) f.axes = ax;
    }
    if (trim !== undefined) f.trim = trim;
    return f;
  }
  return fail('bad object kind');
}

export function sanitisePatch(input: unknown, limits = SHARE_LIMITS): Patch {
  const p = obj(input, 'patch');
  scanKeys(p);
  if (p.format !== 'gener8.patch') fail('not a GENER8 patch');
  if (p.version !== 1 && p.version !== 2) fail('patch version not supported · needs a newer GENER8');

  const seed = int(p.seed, 'seed', 0, 4294967295);
  const tempo = clamp(num(p.tempo, 'tempo'), 20, 300);
  const k = obj(p.key, 'key');
  const root = int(k.root, 'key', 0, 11);
  const scale = typeof k.scale === 'string' && SCALE_ORDER.includes(k.scale) ? k.scale : fail('unknown scale · needs a newer GENER8');

  if (!Array.isArray(p.objects)) fail('bad objects');
  const list = p.objects as unknown[];
  // Count before building anything, so a huge list is rejected cheaply.
  let nSounds = 0;
  let nFields = 0;
  let nMaps = 0;
  for (const o of list) {
    const kind = isPlain(o) ? o.kind : undefined;
    if (kind === 'sound') nSounds++;
    else if (kind === 'field' && isPlain(o) && typeof o.type === 'string' && Object.hasOwn(fieldTypes, o.type) && fieldTypes[o.type].role === 'map') nMaps++;
    else if (kind === 'field') nFields++;
    if (nSounds > limits.MAX_SOUNDS) fail(`too many sounds (max ${limits.MAX_SOUNDS})`);
    if (nFields > limits.MAX_FIELDS) fail(`too many fields (max ${limits.MAX_FIELDS})`);
    if (nMaps > limits.MAX_MAPS) fail(`too many map fields (max ${limits.MAX_MAPS})`);
  }
  const objects = list.map((o) => object(o, limits));
  const ids = new Set<string>();
  for (const o of objects) {
    if (ids.has(o.id)) fail('duplicate object id');
    ids.add(o.id);
  }
  // a follow must name another object in the patch; anything else is dropped
  for (const o of objects) if (o.follow !== undefined && (o.follow === o.id || !ids.has(o.follow))) delete o.follow;

  const built: Patch = { format: 'gener8.patch', version: p.version as 1 | 2, seed, tempo, key: { root, scale }, objects };
  if (p.master !== undefined) built.master = clamp(num(p.master, 'master'), MASTER[0], MASTER[1]);
  const info = cleanInfo(p.info);
  if (info) built.info = info;
  // Version 1 gets the stage XY field that reproduces its fixed mapping.
  const out = p.version === 2 ? built : normalizePatch(built);
  if (JSON.stringify(out).length > limits.MAX_JSON_CHARS) fail('patch is too large');
  return out;
}
