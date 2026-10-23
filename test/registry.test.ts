// Every registered type must make finite, audible, non-clipping sound in a
// minimal patch. New types are covered automatically.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LoggedEdit, Patch, PatchObject } from '../src/core/types.ts';
import { SR } from '../src/core/constants.ts';
import { soundTypes, defaultParams } from '../src/core/sounds/registry.ts';
import { fieldTypes, defaultHandles } from '../src/core/fields/registry.ts';
import { renderOffline } from '../src/core/render.ts';
import { hashAudio, loadPatch } from './util.ts';

function patch(objects: PatchObject[]): Patch {
  return { format: 'gener8.patch', version: 1, seed: 7, tempo: 100, key: { root: 2, scale: 'major' }, objects };
}

function check(p: Patch, seconds: number, label: string, edits?: LoggedEdit[]): void {
  const r = renderOffline(p, seconds, { edits });
  let peak = 0;
  let energy = 0;
  for (const ch of [r.left, r.right]) {
    for (const v of ch) {
      assert.ok(Number.isFinite(v), `${label}: non-finite sample`);
      peak = Math.max(peak, Math.abs(v));
      energy += v * v;
    }
  }
  assert.ok(peak < 1, `${label}: peak ${peak}`);
  assert.ok(energy / (2 * r.left.length) > 1e-7, `${label}: silent`);
}

const gen = (id: string): PatchObject => ({
  id: 'gen',
  kind: 'field',
  type: 'pulse',
  x: 0,
  y: 0,
  shape: { r: 200 },
  layer: 0,
  handles: { hits: 0.5, length: 0.43 },
});

for (const t of Object.values(soundTypes)) {
  test(`sound type "${t.id}" renders`, () => {
    const s: PatchObject = { id: 's', kind: 'sound', type: t.id, x: 30, y: 20, size: 48, layer: 5, params: defaultParams(t) };
    check(patch([gen('g'), s]), 4, t.id);
  });
}

/** Types that only act on something the minimal patch lacks get it from a field placed before them. */
const PRIME: Record<string, string> = { smooth: 'scatter', glide: 'scatter' };

/** Types driven from outside get some input: midi in gets a few notes, on and off. */
const INPUT: Record<string, LoggedEdit[]> = {
  midi: [60, 64, 67, 72].flatMap((n, i) => [
    { sample: Math.round((0.2 + i * 0.8) * SR), edit: { op: 'midi', data: [0x90, n, 100] } },
    { sample: Math.round((0.6 + i * 0.8) * SR), edit: { op: 'midi', data: [0x80, n, 0] } },
  ]),
};

for (const t of Object.values(fieldTypes)) {
  test(`field type "${t.id}" renders`, () => {
    const f: PatchObject = { id: 'f', kind: 'field', type: t.id, x: 0, y: 0, shape: structuredClone(t.defaultShape), layer: 1, handles: defaultHandles(t) };
    const objs: PatchObject[] = [f];
    if (t.role !== 'generator') objs.push(gen('g'));
    const prime = PRIME[t.id] && fieldTypes[PRIME[t.id]];
    if (prime) objs.push({ id: 'p', kind: 'field', type: prime.id, x: 0, y: 0, shape: { r: 300 }, layer: 0, handles: { ...defaultHandles(prime), chance: 1 } });
    objs.push({ id: 'a', kind: 'sound', type: 'subtractive', x: 20, y: 10, size: 48, layer: 5, params: defaultParams(soundTypes.subtractive) });
    objs.push({ id: 'b', kind: 'sound', type: 'pad', x: -20, y: -60, size: 48, layer: 6, params: defaultParams(soundTypes.pad) });
    const edits = INPUT[t.id];
    check(patch(objs), 6, t.id, edits);
    const withF = renderOffline(patch(objs), 6, { edits });
    const without = renderOffline(patch(objs.filter((o) => o !== f)), 6, { edits });
    assert.notEqual(hashAudio(withF.left, withF.right), hashAudio(without.left, without.right), `${t.id} has no audible effect`);
  });
}

import { readdirSync } from 'node:fs';

for (const f of readdirSync(new URL('../patches/', import.meta.url)).filter((n) => n.endsWith('.json'))) {
  test(`example patch "${f}" renders`, () => {
    const name = f.replace(/\.json$/, '');
    check(loadPatch(name), 6, name);
  });
}
