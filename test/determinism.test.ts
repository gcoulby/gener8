import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderOffline } from '../src/core/render.ts';
import { Engine } from '../src/core/engine.ts';
import { BLOCK, SR } from '../src/core/constants.ts';
import type { LoggedEdit } from '../src/core/types.ts';
import { goldens, hashAudio, loadPatch } from './util.ts';

test('60 s render is bit-identical across runs', () => {
  const patch = loadPatch('demo');
  const a = renderOffline(patch, 60);
  const b = renderOffline(patch, 60);
  assert.equal(hashAudio(a.left, a.right), hashAudio(b.left, b.right));
});

test('output does not depend on host chunk size', () => {
  const patch = loadPatch('demo');
  const hashes = [128, 1000, 4096, 777].map((chunk) => {
    const r = renderOffline(patch, 10, { chunk });
    return hashAudio(r.left, r.right);
  });
  for (const h of hashes) assert.equal(h, hashes[0]);
});

test('different seeds give different audio', () => {
  const patch = loadPatch('demo');
  const a = renderOffline(patch, 5);
  const b = renderOffline({ ...patch, seed: patch.seed + 1 }, 5);
  assert.notEqual(hashAudio(a.left, a.right), hashAudio(b.left, b.right));
});

test('audio is finite, non-silent and below full scale', () => {
  const r = renderOffline(loadPatch('demo'), 20);
  let peak = 0;
  let energy = 0;
  for (const ch of [r.left, r.right]) {
    for (const v of ch) {
      assert.ok(Number.isFinite(v));
      peak = Math.max(peak, Math.abs(v));
      energy += v * v;
    }
  }
  assert.ok(peak < 1, `peak ${peak}`);
  assert.ok(energy / (2 * r.left.length) > 1e-5, 'too quiet');
});

test('a live session with edits replays bit-for-bit from its log (capture reproduction)', () => {
  const patch = loadPatch('demo');
  const live = new Engine(patch);
  const n = 8 * SR;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let blocks = 0;
  for (let i = 0; i < n; i += BLOCK) {
    // UI-style edits arriving between blocks
    if (blocks === 300) live.edit({ op: 'move', id: 's3', x: -380, y: 60 });
    if (blocks === 700) live.edit({ op: 'set', id: 'f2', path: ['handles', 'hits'], value: 0.5 });
    if (blocks === 1100) live.edit({ op: 'tempo', value: 110 });
    if (blocks === 1500) live.edit({ op: 'remove', id: 's2' });
    if (blocks === 1900) {
      live.edit({
        op: 'add',
        obj: { id: 's9', kind: 'sound', type: 'pluck', x: 0, y: 0, size: 40, layer: 20, params: {} },
      });
    }
    live.process(L, R, BLOCK, i);
    blocks++;
  }
  const log: LoggedEdit[] = live.drainLog();
  assert.equal(log.length, 5);
  const replay = renderOffline(patch, 8, { edits: log, chunk: 3000 });
  assert.equal(hashAudio(replay.left, replay.right), hashAudio(L, R));
});

test('golden hashes (update deliberately with `npm run golden`)', (t) => {
  const g = goldens();
  if (!g.demo60 || !g.stress10) {
    t.skip('no golden.json yet');
    return;
  }
  const r = renderOffline(loadPatch('demo'), 60);
  assert.equal(hashAudio(r.left, r.right), g.demo60);
  const s = renderOffline(loadPatch('stress-24x12'), 10);
  assert.equal(hashAudio(s.left, s.right), g.stress10);
});
