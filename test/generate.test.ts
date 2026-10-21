import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { FieldObj, Patch } from '../src/core/types.ts';
import { generatePatch, GENERATOR_VERSION } from '../src/core/generate.ts';
import { fieldTypes } from '../src/core/fields/registry.ts';
import { soundTypes } from '../src/core/sounds/registry.ts';
import { depthAt } from '../src/core/geometry.ts';
import { renderOffline } from '../src/core/render.ts';
import { generatorHashes } from './util.ts';

const fields = (p: Patch) => p.objects.filter((o) => o.kind === 'field') as FieldObj[];
const sounds = (p: Patch) => p.objects.filter((o) => o.kind === 'sound');

test('same seed gives deep-equal patches', () => {
  for (const s of [0, 5, 99, 3041872655]) assert.deepEqual(generatePatch(s), generatePatch(s));
  assert.notDeepEqual(generatePatch(1), generatePatch(2));
});

test('generator golden hashes match', () => {
  const want = JSON.parse(readFileSync(new URL('./generator-golden.json', import.meta.url), 'utf8'));
  assert.deepEqual(generatorHashes(), want);
});

test('unknown generator version throws', () => {
  assert.throws(() => generatePatch(1, GENERATOR_VERSION + 1));
});

test('seeds 1–200: shape, counts and ranges', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const p = generatePatch(seed);
    const f = fields(p);
    const s = sounds(p);
    const msg = `seed ${seed}`;
    assert.equal(p.seed, seed, msg);
    assert.ok(p.tempo >= 50 && p.tempo <= 130 && Number.isInteger(p.tempo), msg);
    assert.ok(f.length >= 3 && f.length <= 8, `${msg}: ${f.length} fields`);
    assert.ok(s.length >= 4 && s.length <= 12, `${msg}: ${s.length} sounds`);
    const role = (r: string) => f.filter((o) => fieldTypes[o.type].role === r).length;
    assert.ok(role('generator') >= 1 && role('generator') <= 3, msg);
    assert.ok(role('transformer') <= 3, msg);
    assert.ok(role('fx') >= 1 && role('fx') <= 3, msg);
    const gens = f.filter((o) => fieldTypes[o.type].role === 'generator');
    const driven = s.filter((o) => gens.some((g) => depthAt(g.shape, g.x, g.y, 1, o.x, o.y) > 0.2));
    assert.ok(driven.length >= 1, `${msg}: no sound inside a generator`);
    const sus = s.filter((o) => soundTypes[o.type].mode === 'sustained');
    assert.ok(sus.length <= 3, msg);
    for (const o of s) assert.ok(Math.abs(o.y) <= 200, `${msg}: ${o.id} y=${o.y}`);
    const ids = p.objects.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length, msg);
  }
});

test('20 generated patches render finite, audible, non-clipping audio', () => {
  for (let seed = 1000; seed < 1020; seed++) {
    const r = renderOffline(generatePatch(seed), 4);
    let peak = 0;
    let energy = 0;
    for (const ch of [r.left, r.right]) {
      for (const v of ch) {
        assert.ok(Number.isFinite(v), `seed ${seed}: non-finite sample`);
        peak = Math.max(peak, Math.abs(v));
        energy += v * v;
      }
    }
    assert.ok(peak < 1, `seed ${seed}: peak ${peak}`);
    assert.ok(energy / (2 * r.left.length) > 1e-7, `seed ${seed}: silent`);
  }
});
