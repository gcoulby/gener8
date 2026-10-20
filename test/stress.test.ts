// Scale target: 24 sounds + 12 fields. Fails if offline render is slower than
// 0.25× real time (4× headroom for the live worklet). See DESIGN.md §11.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/core/engine.ts';
import { SR } from '../src/core/constants.ts';
import { loadPatch } from './util.ts';

const SECONDS = 60;
const THRESHOLD = 0.25;

test(`stress: 24 sounds × 12 fields, ${SECONDS} s, render ≤ ${THRESHOLD}× real time`, () => {
  const patch = loadPatch('stress-24x12');
  const sounds = patch.objects.filter((o) => o.kind === 'sound').length;
  const fields = patch.objects.filter((o) => o.kind === 'field').length;
  assert.equal(sounds, 24);
  assert.equal(fields, 12);

  const e = new Engine(patch);
  const chunk = 128;
  const L = new Float32Array(chunk);
  const R = new Float32Array(chunk);
  const n = SECONDS * SR;
  let events = 0;
  let peakVoices = 0;
  let worstBlockMs = 0;
  // warm up the JIT so the measurement reflects steady state
  for (let i = 0; i < SR; i += chunk) e.process(L, R, chunk);
  e.drainRecords();
  const t0 = performance.now();
  for (let i = 0; i < n; i += chunk) {
    const b0 = performance.now();
    e.process(L, R, chunk);
    const dt = performance.now() - b0;
    if (dt > worstBlockMs) worstBlockMs = dt;
    events += e.drainRecords().length;
    if (e.activeVoiceCount > peakVoices) peakVoices = e.activeVoiceCount;
  }
  const ms = performance.now() - t0;
  const ratio = ms / 1000 / SECONDS;
  const blockBudgetMs = (chunk / SR) * 1000;
  console.log(
    `stress: ${SECONDS}s rendered in ${(ms / 1000).toFixed(2)}s → ${ratio.toFixed(3)}× real time ` +
      `(${(1 / ratio).toFixed(1)}× headroom); events ${events}; peak voices ${peakVoices}; ` +
      `worst block ${worstBlockMs.toFixed(2)} ms of ${blockBudgetMs.toFixed(2)} ms budget`,
  );
  assert.ok(events > 1000, `only ${events} events — patch not exercising the engine`);
  assert.ok(ratio <= THRESHOLD, `render ratio ${ratio.toFixed(3)} > ${THRESHOLD}`);
});
