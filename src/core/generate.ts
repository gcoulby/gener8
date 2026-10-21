// Seed → patch. Pure and engine-independent: a seed link is only meaningful if
// every JS engine builds the same patch from it, so this uses the counter-based
// rand, dspmath's sin/cos/exp2, and quantises every number it emits.
//
// Versions are frozen once shipped. Any change to the output is a new version
// in `generators`, and the old one keeps working so old links stay valid.
// v1 builds a version 1 patch; generatePatch migrates it (normalizePatch adds
// the stage XY field), so what the generator itself emits never changes.

import type { FieldObj, FieldShape, Motion, Patch, PatchObject, SoundObj } from './types.ts';
import { RIPPLE_REACH } from './constants.ts';
import { cosTurns, exp2, sinTurns } from './dspmath.ts';
import { depthAt, isCircle } from './geometry.ts';
import { SCALE_ORDER } from './music.ts';
import { rand, strHash } from './rand.ts';
import { soundTypes, defaultParams } from './sounds/registry.ts';
import { fieldTypes, defaultHandles } from './fields/registry.ts';
import { normalizePatch } from './patch.ts';

export const GENERATOR_VERSION = 1;

const GEN_ID = strHash('gener8.generate');

// One stream per concern, so adding a draw in one place never shifts another.
const S_KEY = 1;
const S_TEMPO = 2;
const S_COUNTS = 3;
const S_FIELD_TYPE = 4;
const S_FIELD_POS = 5;
const S_FIELD_SIZE = 6;
const S_HANDLES = 7;
const S_SOUND_TYPE = 8;
const S_SOUND_POS = 9;
const S_PARAMS = 10;
const S_MOTION = 11;
const S_SOUND_SIZE = 12;

const PERIODS = [8, 12, 16, 24, 32];
const MAX_ATTEMPTS = 24;
const Y_MAX = 200;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clampN = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function v1(seed: number): Patch {
  seed = seed >>> 0;
  const R = (stream: number, index: number) => rand(seed, GEN_ID, stream, index);
  const pick = <T>(xs: T[], u: number): T => xs[Math.min(xs.length - 1, Math.floor(u * xs.length))];
  const int = (lo: number, hi: number, u: number) => lo + Math.min(hi - lo, Math.floor(u * (hi - lo + 1)));

  // Chromatic is left out: with every note allowed, generated melodies wander.
  const scales = SCALE_ORDER.filter((s) => s !== 'chromatic');
  const key = { root: int(0, 11, R(S_KEY, 0)), scale: pick(scales, R(S_KEY, 1)) };
  const tempo = int(50, 130, R(S_TEMPO, 0));

  const byRole = (role: string) => Object.values(fieldTypes).filter((t) => t.role === role).map((t) => t.id);
  const gens = byRole('generator');
  const trans = byRole('transformer');
  const fxs = byRole('fx');

  const nGen = int(1, 3, R(S_COUNTS, 0));
  const nFx = int(1, 3, R(S_COUNTS, 1));
  let nTrans = Math.min(int(0, 3, R(S_COUNTS, 2)), 8 - nGen - nFx);
  if (nGen + nFx + nTrans < 3) nTrans = 3 - nGen - nFx;

  const objects: PatchObject[] = [];
  const fields: FieldObj[] = [];
  let layer = 0;

  const makeField = (type: string, i: number, x: number, y: number): FieldObj => {
    const t = fieldTypes[type];
    const k = 0.8 + 0.6 * R(S_FIELD_SIZE, i);
    const d = t.defaultShape;
    const shape: FieldShape = isCircle(d) ? { r: Math.round(d.r * k) } : { w: Math.round(d.w * k), h: Math.round(d.h * k) };
    const handles = defaultHandles(t);
    const keys = Object.keys(handles);
    const nVary = int(0, Math.min(2, keys.length), R(S_HANDLES, i * 8));
    for (let j = 0; j < nVary; j++) {
      const hk = pick(keys, R(S_HANDLES, i * 8 + 1 + j * 2));
      handles[hk] = r2(clampN(handles[hk] + (R(S_HANDLES, i * 8 + 2 + j * 2) * 2 - 1) * 0.25, 0, 1));
    }
    const f: FieldObj = { id: 'f' + (fields.length + 1), kind: 'field', type, x: clampN(Math.round(x), -2000, 2000), y: clampN(Math.round(y), -120, 120), shape, layer: layer++, handles };
    const motion = fieldMotion(i);
    if (motion) f.motion = motion;
    fields.push(f);
    objects.push(f);
    return f;
  };

  // Fields breathe; a few drift slowly. Drawn per field index.
  const fieldMotion = (i: number): Motion | undefined => {
    const m: Motion = {};
    if (R(S_MOTION, i * 8) < 0.3) m.breathe = { amount: r2(0.1 + 0.3 * R(S_MOTION, i * 8 + 1)), periodBeats: pick(PERIODS, R(S_MOTION, i * 8 + 2)) };
    if (R(S_MOTION, i * 8 + 3) < 0.15) m.pos = { type: 'drift', amplitude: Math.round(20 + 40 * R(S_MOTION, i * 8 + 4)), rateBeats: pick(PERIODS, R(S_MOTION, i * 8 + 5)) };
    return m.breathe || m.pos ? m : undefined;
  };

  // Generators: the first near the centre, the rest spread around it.
  const genFields: FieldObj[] = [];
  const turn0 = R(S_FIELD_POS, 0);
  for (let i = 0; i < nGen; i++) {
    const rad = i === 0 ? 120 * R(S_FIELD_POS, 1) : 180 + 140 * R(S_FIELD_POS, i * 4 + 1);
    const a = turn0 + i / nGen + 0.15 * R(S_FIELD_POS, i * 4 + 2);
    genFields.push(makeField(pick(gens, R(S_FIELD_TYPE, i)), i, rad * sinTurns(a), rad * 0.5 * cosTurns(a)));
  }
  // Transformers and FX sit over a generator so they touch the sounds it drives.
  const over = (i: number, spread: number): [number, number] => {
    const g = genFields[Math.floor(R(S_FIELD_POS, i * 4 + 1) * genFields.length)];
    const gr = fieldRadius(g);
    const rad = spread * gr * R(S_FIELD_POS, i * 4 + 2);
    const a = R(S_FIELD_POS, i * 4 + 3);
    return [g.x + rad * sinTurns(a), g.y + rad * cosTurns(a)];
  };
  for (let j = 0; j < nTrans; j++) {
    const i = nGen + j;
    const [x, y] = over(i, 0.6);
    makeField(pick(trans, R(S_FIELD_TYPE, i)), i, x, y);
  }
  const fxFields: FieldObj[] = [];
  for (let j = 0; j < nFx; j++) {
    const i = nGen + nTrans + j;
    const [x, y] = over(i, 0.5);
    fxFields.push(makeField(pick(fxs, R(S_FIELD_TYPE, i)), i, x, y));
  }

  // Sounds: mostly driven by a generator, a few hollow listeners, a few sustained.
  const eventTypes = Object.values(soundTypes).filter((t) => t.mode === 'event').map((t) => t.id);
  const susTypes = Object.values(soundTypes).filter((t) => t.mode === 'sustained').map((t) => t.id);
  const total = int(4, 12, R(S_COUNTS, 3));
  const nSus = Math.min(3, int(0, Math.floor(total / 3), R(S_COUNTS, 4)));
  const nListen = Math.min(int(1, 3, R(S_COUNTS, 5)), Math.max(1, total - nSus - Math.ceil(total / 2)));
  const nDriven = total - nSus - nListen;

  const sounds: SoundObj[] = [];
  const inside = (f: FieldObj, x: number, y: number) => depthAt(f.shape, f.x, f.y, 1, x, y);
  const insideAnyGen = (x: number, y: number) => genFields.some((g) => inside(g, x, y) > 0);

  const makeSound = (type: string, x: number, y: number): SoundObj => {
    const i = sounds.length;
    const t = soundTypes[type];
    const size = t.mode === 'sustained' ? int(30, 56, R(S_SOUND_SIZE, i)) : int(22, 48, R(S_SOUND_SIZE, i));
    const params = defaultParams(t);
    const nVary = int(1, Math.min(3, t.params.length), R(S_PARAMS, i * 16));
    for (let j = 0; j < nVary; j++) {
      const spec = pick(t.params, R(S_PARAMS, i * 16 + 1 + j * 2));
      const u = R(S_PARAMS, i * 16 + 2 + j * 2) * 2 - 1;
      const v = spec.curve === 'exp' ? spec.default * exp2(u * 1.5) : spec.default + u * 0.3 * (spec.max - spec.min);
      params[spec.key] = clampN(r2(v), spec.min, spec.max);
    }
    const s: SoundObj = { id: 's' + (i + 1), kind: 'sound', type, x: Math.round(x), y: Math.round(y), size, layer: layer++, params };
    sounds.push(s);
    objects.push(s);
    return s;
  };

  // Sample a point at least 20% deep inside f, re-rolling with an attempt index.
  const pointIn = (f: FieldObj, i: number): [number, number] => {
    for (let k = 0; k < MAX_ATTEMPTS; k++) {
      const base = i * 64 + k * 2;
      const a = R(S_SOUND_POS, base);
      const u = 0.75 * Math.sqrt(R(S_SOUND_POS, base + 1));
      let x: number;
      let y: number;
      if (isCircle(f.shape)) {
        x = f.x + u * f.shape.r * sinTurns(a);
        y = f.y + u * f.shape.r * cosTurns(a);
      } else {
        x = f.x + (a * 2 - 1) * 0.375 * f.shape.w;
        y = f.y + (R(S_SOUND_POS, base + 1) * 2 - 1) * 0.375 * f.shape.h;
      }
      x = Math.round(x);
      y = Math.round(y);
      if (Math.abs(y) <= Y_MAX && inside(f, x, y) > 0.2) return [x, y];
    }
    return [f.x, f.y];
  };

  for (let j = 0; j < nDriven; j++) {
    const i = sounds.length;
    const g = genFields[j % genFields.length];
    const [x, y] = pointIn(g, i);
    makeSound(pick(eventTypes, R(S_SOUND_TYPE, i)), x, y);
  }
  const emitters = sounds.slice();
  for (let j = 0; j < nListen; j++) {
    const i = sounds.length;
    let placed = false;
    for (let k = 0; k < MAX_ATTEMPTS && !placed; k++) {
      const base = i * 64 + k * 3;
      const e = emitters[Math.floor(R(S_SOUND_POS, base) * emitters.length)];
      const reach = RIPPLE_REACH * e.size;
      const d = reach * (0.35 + 0.5 * R(S_SOUND_POS, base + 1));
      const a = R(S_SOUND_POS, base + 2);
      const x = Math.round(e.x + d * sinTurns(a));
      const y = Math.round(e.y + d * cosTurns(a));
      if (Math.abs(y) <= Y_MAX && Math.abs(x) <= 2000 && !insideAnyGen(x, y)) {
        makeSound(pick(eventTypes, R(S_SOUND_TYPE, i)), x, y);
        placed = true;
      }
    }
    // Nowhere free within reach: drive it instead, so the sound count holds.
    if (!placed) makeSound(pick(eventTypes, R(S_SOUND_TYPE, i)), ...pointIn(genFields[i % genFields.length], i));
  }
  for (let j = 0; j < nSus; j++) {
    const i = sounds.length;
    const f = fxFields[Math.floor(R(S_SOUND_POS, i * 64 + 63) * fxFields.length)];
    const [x, y] = pointIn(f, i);
    makeSound(pick(susTypes, R(S_SOUND_TYPE, i)), x, y);
  }

  // About a third of sounds move. Driven sounds orbit tightly so they stay inside.
  for (const s of sounds) {
    const i = Number(s.id.slice(1));
    if (R(S_MOTION, 1000 + i * 8) >= 0.33) continue;
    const period = pick(PERIODS, R(S_MOTION, 1000 + i * 8 + 1));
    s.motion =
      R(S_MOTION, 1000 + i * 8 + 2) < 0.5
        ? { pos: { type: 'orbit', radius: Math.round(10 + 30 * R(S_MOTION, 1000 + i * 8 + 3)), periodBeats: period, phase: r2(R(S_MOTION, 1000 + i * 8 + 4)) } }
        : { pos: { type: 'drift', amplitude: Math.round(10 + 30 * R(S_MOTION, 1000 + i * 8 + 3)), rateBeats: period } };
  }

  return { format: 'gener8.patch', version: 1, seed, tempo, key, objects };
}

function fieldRadius(f: FieldObj): number {
  return isCircle(f.shape) ? f.shape.r : Math.min(f.shape.w, f.shape.h) / 2;
}

export const generators: Record<number, (seed: number) => Patch> = { 1: v1 };

export function generatePatch(seed: number, version = GENERATOR_VERSION): Patch {
  const g = generators[version];
  if (!g) throw new Error(`unknown generator version ${version}`);
  return normalizePatch(g(seed));
}
