import type { Edit, FieldObj, Patch, PatchObject } from './types.ts';
import { MIDI_MAX, MIDI_MIN, STAGE_HALF, UNITS_PER_SEMITONE } from './constants.ts';

export function clone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

export function emptyPatch(): Patch {
  return {
    format: 'gener8.patch',
    version: 2,
    seed: 1,
    tempo: 64,
    key: { root: 2, scale: 'major' },
    objects: [],
  };
}

/** Fill missing top-level fields and migrate version 1. Unknown fields are preserved. */
export function normalizePatch(input: unknown): Patch {
  const p = clone(input) as Partial<Patch> & Record<string, unknown>;
  if (!p || typeof p !== 'object') throw new Error('patch: not an object');
  if (p.format !== undefined && p.format !== 'gener8.patch') throw new Error('patch: unknown format');
  const d = emptyPatch();
  const out = {
    ...p,
    format: 'gener8.patch',
    version: 2,
    seed: typeof p.seed === 'number' ? p.seed >>> 0 : d.seed,
    tempo: typeof p.tempo === 'number' ? p.tempo : d.tempo,
    key: p.key && typeof p.key === 'object' ? p.key : d.key,
    objects: Array.isArray(p.objects) ? p.objects : [],
  } as Patch;
  if (p.version !== 2) out.objects.push(stageField(out.objects));
  return out;
}

/** The classic 1600 × 720 stage: pan L to R across x = ±800, pitch C1 to C7 up y = ±360. */
export function classicStage(id = 'xy1'): FieldObj {
  return stageField([], id);
}

/**
 * Version 1 had fixed meanings: y = pitch (10 units a semitone, clamped C1..C7)
 * and x = pan (±800, clamped). This builds the XY field that reproduces them bit
 * for bit. It grows past the classic stage, keeping the same slope, until it
 * covers every sound and the ground its motion covers; values past the old
 * range are clamped by the engine, exactly as v1 clamped them. Half extents
 * step by 100 (x) and 10 (y) so axisValue's divisions stay exact.
 */
function stageField(objs: PatchObject[], id?: string): FieldObj {
  let ax = 0;
  let ay = 0;
  for (const o of objs) {
    if (o.kind !== 'sound') continue;
    const m = o.motion?.pos;
    let ex = 0;
    let ey = 0;
    if (m?.type === 'orbit') ex = ey = Math.abs(m.radius);
    else if (m?.type === 'drift') ex = ey = Math.abs(m.amplitude);
    else if (m?.type === 'path')
      for (const pt of m.points) {
        // a Catmull-Rom curve can overshoot its points a little
        ex = Math.max(ex, Math.abs(pt[0]) * 1.25 + 10);
        ey = Math.max(ey, Math.abs(pt[1]) * 1.25 + 10);
      }
    ax = Math.max(ax, Math.abs(o.x) + ex);
    ay = Math.max(ay, Math.abs(o.y) + ey);
  }
  const mid = (MIDI_MIN + MIDI_MAX) / 2;
  const hw = Math.max(STAGE_HALF, Math.ceil(ax / 100) * 100);
  const hh = Math.max(((MIDI_MAX - MIDI_MIN) / 2) * UNITS_PER_SEMITONE, Math.ceil(ay / 10) * 10);
  const pan = hw / STAGE_HALF;
  const semis = hh / UNITS_PER_SEMITONE;
  return {
    id: id ?? freeId(objs, 'xy'),
    kind: 'field',
    type: 'xy',
    x: 0,
    y: 0,
    shape: { w: 2 * hw, h: 2 * hh },
    layer: 0,
    handles: {},
    axes: {
      x: { to: 'pan', min: -pan, max: pan },
      y: { to: 'pitch', min: mid - semis, max: mid + semis },
    },
  };
}

function freeId(objs: PatchObject[], prefix: string): string {
  let n = 1;
  while (objs.some((o) => o.id === prefix + n)) n++;
  return prefix + n;
}

export function findObj(p: Patch, id: string): PatchObject | undefined {
  return p.objects.find((o) => o.id === id);
}

function setPath(target: any, path: string[], value: unknown): void {
  let t = target;
  for (let i = 0; i < path.length - 1; i++) {
    if (t[path[i]] === undefined || t[path[i]] === null) t[path[i]] = {};
    t = t[path[i]];
  }
  const k = path[path.length - 1];
  if (value === null || value === undefined) delete t[k];
  else t[k] = clone(value);
}

/** Apply an edit. Mutates p and returns the patch to use from now on (differs only for 'load'). */
export function applyEdit(p: Patch, e: Edit): Patch {
  switch (e.op) {
    case 'add':
      if (!findObj(p, e.obj.id)) p.objects.push(clone(e.obj));
      return p;
    case 'remove':
      p.objects = p.objects.filter((o) => o.id !== e.id);
      return p;
    case 'move': {
      const o = findObj(p, e.id);
      if (o) {
        o.x = e.x;
        o.y = e.y;
      }
      return p;
    }
    case 'set': {
      const o = findObj(p, e.id);
      if (o && e.path.length) setPath(o, e.path, e.value);
      return p;
    }
    case 'tempo':
      p.tempo = Math.min(300, Math.max(20, e.value));
      return p;
    case 'key':
      p.key = clone(e.value);
      return p;
    case 'seed':
      p.seed = e.value >>> 0;
      return p;
    case 'master':
      p.master = Math.min(12, Math.max(-60, e.value));
      return p;
    case 'load':
      return normalizePatch(e.patch);
  }
}

export function nextId(p: Patch, prefix: string): string {
  let max = 0;
  for (const o of p.objects) {
    if (o.id.startsWith(prefix)) {
      const n = Number(o.id.slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return prefix + (max + 1);
}

export function byLayer(a: PatchObject, b: PatchObject): number {
  return a.layer - b.layer || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
