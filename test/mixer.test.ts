import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderOffline } from '../src/core/render.ts';
import type { Patch, SoundObj } from '../src/core/types.ts';
import { hashAudio, loadPatch } from './util.ts';

function peak(p: Patch, seconds = 6): number {
  const r = renderOffline(p, seconds);
  let pk = 0;
  for (const ch of [r.left, r.right]) for (const v of ch) pk = Math.max(pk, Math.abs(v));
  return pk;
}

function withSounds(p: Patch, f: (s: SoundObj) => void): Patch {
  const q = structuredClone(p);
  for (const o of q.objects) if (o.kind === 'sound') f(o);
  return q;
}

test('muting every sound silences the output (sends included)', () => {
  assert.equal(peak(withSounds(loadPatch('demo'), (s) => (s.mute = true))), 0);
});

test('solo isolates: soloing one sound equals muting all the others', () => {
  const base = loadPatch('demo');
  const solo = withSounds(base, (s) => (s.solo = s.id === 's4'));
  const mutes = withSounds(base, (s) => (s.mute = s.id !== 's4'));
  const a = renderOffline(solo, 5);
  const b = renderOffline(mutes, 5);
  assert.equal(hashAudio(a.left, a.right), hashAudio(b.left, b.right));
  assert.ok(peak(solo, 5) > 0);
});

test('master and trims change the level in the right direction', () => {
  const base = loadPatch('demo');
  const p0 = peak(base);
  assert.ok(peak({ ...base, master: -12 }) < p0 * 0.5);
  assert.ok(peak(withSounds(base, (s) => (s.trim = -18))) < p0 * 0.5);
});

test('mixer edits replay bit-for-bit from the log', async () => {
  const { Engine } = await import('../src/core/engine.ts');
  const patch = loadPatch('demo');
  const live = new Engine(patch);
  const n = 128 * 1500;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0, b = 0; i < n; i += 128, b++) {
    if (b === 200) live.edit({ op: 'master', value: -6 });
    if (b === 500) live.edit({ op: 'set', id: 's1', path: ['solo'], value: true });
    if (b === 900) live.edit({ op: 'set', id: 'f1', path: ['trim'], value: -10 });
    if (b === 1200) live.edit({ op: 'set', id: 's1', path: ['solo'], value: null });
    live.process(L, R, 128, i);
  }
  const replay = renderOffline(patch, n / 48000, { edits: live.drainLog() });
  assert.equal(hashAudio(replay.left, replay.right), hashAudio(L, R));
});
