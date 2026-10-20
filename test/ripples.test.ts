import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/core/engine.ts';
import { MAX_CHAIN, PPQ, REFRACTORY_BEATS, SR } from '../src/core/constants.ts';
import type { EventRecord, Patch } from '../src/core/types.ts';

/** A pulse-driven sound next to a tight cluster of free listeners: worst case for feedback. */
function cluster(): Patch {
  const listeners = [];
  for (let i = 0; i < 6; i++) {
    listeners.push({
      id: `l${i}`,
      kind: 'sound' as const,
      type: 'pluck',
      x: 300 + (i % 3) * 30,
      y: Math.floor(i / 3) * 30,
      size: 80,
      layer: 10 + i,
      params: {},
    });
  }
  return {
    format: 'gener8.patch',
    version: 1,
    seed: 9,
    tempo: 120,
    key: { root: 0, scale: 'minorPentatonic' },
    objects: [
      { id: 'g', kind: 'field', type: 'pulse', x: 200, y: 0, shape: { r: 60 }, layer: 0, handles: { hits: 1, length: 0 } },
      { id: 'src', kind: 'sound', type: 'pluck', x: 200, y: 20, size: 80, layer: 1, params: {} },
      ...listeners,
    ],
  };
}

function run(patch: Patch, seconds: number): EventRecord[] {
  const e = new Engine(patch);
  const n = seconds * SR;
  const L = new Float32Array(4096);
  const R = new Float32Array(4096);
  const out: EventRecord[] = [];
  for (let i = 0; i < n; i += 4096) {
    e.process(L, R, 4096);
    out.push(...e.drainRecords());
  }
  return out;
}

test('ripples cascade, but never beyond the max chain depth', () => {
  const recs = run(cluster(), 10);
  const maxChain = Math.max(...recs.map((r) => r.chain));
  assert.ok(maxChain >= 2, 'expected a cascade');
  assert.ok(maxChain <= MAX_CHAIN, `chain ${maxChain}`);
  for (const r of recs) if (r.chain === MAX_CHAIN) assert.equal(r.rippleR, 0);
});

test('per-sound refractory period holds for ripple-triggered events', () => {
  const recs = run(cluster(), 10).filter((r) => r.sourceKind === 'ripple');
  const last = new Map<string, number>();
  for (const r of recs) {
    const prev = last.get(r.soundId);
    if (prev !== undefined) assert.ok(r.tick - prev >= REFRACTORY_BEATS * PPQ - 1e-6, `${r.soundId} ${r.tick - prev}`);
    last.set(r.soundId, r.tick);
  }
});

test('ripple delay is tempo-synced: same layout, same beat offsets at any tempo', () => {
  const offsets = (tempo: number) => {
    const p = cluster();
    p.tempo = tempo;
    const recs = run(p, 6);
    const first = recs.find((r) => r.soundId === 'src')!;
    const hit = recs.find((r) => r.soundId === 'l0' && r.chain === 1)!;
    return (hit.tick - first.tick) / PPQ;
  };
  assert.ok(Math.abs(offsets(90) - offsets(150)) < 0.01);
});
