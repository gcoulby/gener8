import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import type { Patch } from '../src/core/types.ts';
import { sanitisePatch, ShareError, SHARE_LIMITS } from '../src/core/sanitise.ts';
import { canonicalJson } from '../src/core/canonical.ts';
import { generatePatch } from '../src/core/generate.ts';
import { loadPatch } from './util.ts';

const BUNDLED = readdirSync(new URL('../patches/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));

const base = (): Patch => loadPatch('demo');
const sound = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: 'sound', type: 'pluck', x: 0, y: 0, size: 40, layer: 1, params: {}, ...extra });

test('every bundled patch passes unchanged', () => {
  assert.ok(BUNDLED.length >= 4);
  for (const name of BUNDLED) {
    const p = loadPatch(name);
    assert.equal(canonicalJson(sanitisePatch(p)), canonicalJson(p), name);
  }
});

test('generated patches 1–200 pass unchanged and inside the caps', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const p = generatePatch(seed);
    assert.equal(canonicalJson(sanitisePatch(p)), canonicalJson(p), `seed ${seed}`);
    assert.ok(p.objects.filter((o) => o.kind === 'sound').length <= SHARE_LIMITS.MAX_SOUNDS);
    assert.ok(p.objects.filter((o) => o.kind === 'field').length <= SHARE_LIMITS.MAX_FIELDS);
  }
});

const rejects: [string, () => unknown][] = [
  ['not an object', () => 'hello'],
  ['array', () => []],
  ['pollution: __proto__', () => JSON.parse('{"format":"gener8.patch","version":1,"seed":1,"tempo":60,"key":{"root":0,"scale":"major"},"objects":[],"__proto__":{"polluted":1}}')],
  ['pollution: nested constructor', () => ({ ...base(), objects: [{ ...sound('s1'), params: JSON.parse('{"constructor":{"prototype":{"x":1}}}') }] })],
  ['pollution: prototype key', () => ({ ...base(), key: JSON.parse('{"root":0,"scale":"major","prototype":1}') })],
  ['5,000 sounds', () => ({ ...base(), objects: Array.from({ length: 5000 }, (_, i) => sound('s' + i)) })],
  ['13 fields', () => ({ ...base(), objects: Array.from({ length: 13 }, (_, i) => ({ id: 'f' + i, kind: 'field', type: 'reverb', x: 0, y: 0, shape: { r: 100 }, layer: i, handles: {} })) })],
  ['string where a number belongs', () => ({ ...base(), tempo: '120' })],
  ['string x', () => ({ ...base(), objects: [sound('s1', { x: '10' })] })],
  ['NaN', () => ({ ...base(), objects: [sound('s1', { x: NaN })] })],
  ['Infinity', () => ({ ...base(), objects: [sound('s1', { size: Infinity })] })],
  ['null number', () => ({ ...base(), objects: [sound('s1', { params: { decay: null } })] })],
  ['unknown sound type', () => ({ ...base(), objects: [sound('s1', { type: 'theremin' })] })],
  ['unknown field type', () => ({ ...base(), objects: [{ id: 'f1', kind: 'field', type: 'wormhole', x: 0, y: 0, shape: { r: 100 }, layer: 0, handles: {} }] })],
  ['unknown kind', () => ({ ...base(), objects: [sound('s1', { kind: 'thing' })] })],
  ['unknown scale', () => ({ ...base(), key: { root: 0, scale: 'klingon' } })],
  ['bad root', () => ({ ...base(), key: { root: 12, scale: 'major' } })],
  ['duplicate ids', () => ({ ...base(), objects: [sound('s1'), sound('s1')] })],
  ['bad id', () => ({ ...base(), objects: [sound('<img onerror=x>')] })],
  ['long id', () => ({ ...base(), objects: [sound('s'.repeat(25))] })],
  ['wrong format', () => ({ ...base(), format: 'other' })],
  ['wrong version', () => ({ ...base(), version: 2 })],
  ['seed out of range', () => ({ ...base(), seed: 4294967296 })],
  ['fractional seed', () => ({ ...base(), seed: 1.5 })],
  ['path with 100k points', () => ({ ...base(), objects: [sound('s1', { motion: { pos: { type: 'path', points: Array.from({ length: 100000 }, () => [0, 0]), periodBeats: 8, mode: 'loop' } } })] })],
  ['empty path', () => ({ ...base(), objects: [sound('s1', { motion: { pos: { type: 'path', points: [], periodBeats: 8, mode: 'loop' } } })] })],
  ['bad path mode', () => ({ ...base(), objects: [sound('s1', { motion: { pos: { type: 'path', points: [[0, 0]], periodBeats: 8, mode: 'spiral' } } })] })],
  ['unknown motion type', () => ({ ...base(), objects: [sound('s1', { motion: { pos: { type: 'teleport' } } })] })],
  ['zero radius field', () => ({ ...base(), objects: [{ id: 'f1', kind: 'field', type: 'reverb', x: 0, y: 0, shape: { r: 0 }, layer: 0, handles: {} }] })],
  ['huge field', () => ({ ...base(), objects: [{ id: 'f1', kind: 'field', type: 'reverb', x: 0, y: 0, shape: { r: 1e9 }, layer: 0, handles: {} }] })],
  ['mute not boolean', () => ({ ...base(), objects: [sound('s1', { mute: 'yes' })] })],
];

for (const [name, make] of rejects) {
  test(`rejects: ${name}`, () => {
    assert.throws(() => sanitisePatch(make()), ShareError);
  });
}

test('pollution payload does not pollute', () => {
  try {
    sanitisePatch(JSON.parse('{"__proto__":{"polluted":1}}'));
  } catch {
    /* expected */
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('clamps out-of-range numbers', () => {
  const p = sanitisePatch({
    ...base(),
    tempo: 9999,
    master: 99,
    objects: [
      sound('s1', {
        x: 1e6,
        y: -1e6,
        size: 5000,
        layer: 5000,
        trim: -500,
        params: { decay: 1e9, bright: -4 },
        motion: { pos: { type: 'orbit', radius: 1e7, periodBeats: -3, phase: 0 }, breathe: { amount: 5, periodBeats: 0 } },
      }),
      sound('s2', { motion: { pos: { type: 'drift', amplitude: -10, rateBeats: 0 } } }),
      sound('s3', { motion: { pos: { type: 'path', points: [[1e5, -1e5]], periodBeats: 0, mode: 'pingpong' } } }),
      { id: 'f1', kind: 'field', type: 'pulse', x: 0, y: 0, shape: { w: 1, h: 2000 }, layer: 0, handles: { hits: 7, length: -1 } },
    ],
  });
  assert.equal(p.tempo, 300);
  assert.equal(p.master, 12);
  const [s1, s2, s3, f1] = p.objects as any[];
  assert.deepEqual([s1.x, s1.y, s1.size, s1.layer, s1.trim], [2000, -2000, 200, 999, -40]);
  assert.deepEqual(s1.params, { decay: 10, bright: 0 });
  assert.deepEqual(s1.motion, { pos: { type: 'orbit', radius: 1000, periodBeats: 0.25, phase: 0 }, breathe: { amount: 0.9, periodBeats: 0.25 } });
  assert.deepEqual(s2.motion.pos, { type: 'drift', amplitude: 0, rateBeats: 0.25 });
  assert.deepEqual(s3.motion.pos, { type: 'path', points: [[2000, -2000]], periodBeats: 0.25, mode: 'pingpong' });
  assert.deepEqual(f1.shape, { w: 48, h: 2000 });
  assert.deepEqual(f1.handles, { hits: 1, length: 0 });
});

test('drops unknown keys everywhere', () => {
  const p = sanitisePatch({
    ...base(),
    extra: 1,
    key: { root: 2, scale: 'major', mode: 'x' },
    objects: [
      sound('s1', { colour: 'red', params: { decay: 1, notAParam: 3 }, motion: { breathe: { amount: 0.2, periodBeats: 8, junk: 1 }, junk: {} } }),
      { id: 'f1', kind: 'field', type: 'reverb', x: 0, y: 0, shape: { r: 100, w: 3 }, layer: 0, handles: { size: 0.5, bogus: 1 }, html: '<b>' },
    ],
  }) as any;
  assert.equal(p.extra, undefined);
  assert.deepEqual(p.key, { root: 2, scale: 'major' });
  assert.deepEqual(Object.keys(p.objects[0]).sort(), ['id', 'kind', 'layer', 'motion', 'params', 'size', 'type', 'x', 'y']);
  assert.deepEqual(p.objects[0].params, { decay: 1 });
  assert.deepEqual(p.objects[0].motion, { breathe: { amount: 0.2, periodBeats: 8 } });
  assert.deepEqual(p.objects[1].shape, { r: 100 });
  assert.deepEqual(p.objects[1].handles, { size: 0.5 });
  assert.equal(p.objects[1].html, undefined);
});

test('the result shares no references with the input', () => {
  const input = base();
  const out = sanitisePatch(input);
  assert.notEqual(out.key, input.key);
  out.objects.forEach((o, i) => {
    assert.notEqual(o, input.objects[i]);
    if (o.kind === 'sound' && input.objects[i].kind === 'sound') assert.notEqual(o.params, (input.objects[i] as any).params);
  });
});
