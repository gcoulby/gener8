import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PatchObject } from '../src/core/types.ts';
import { bounceHeight, followPose, newPose, pose } from '../src/core/motion.ts';
import { sanitisePatch } from '../src/core/sanitise.ts';
import { renderOffline } from '../src/core/render.ts';
import { hashAudio, loadPatch } from './util.ts';

test('bounce: drops and bounces lower to the ground, then the same in reverse back to the top', () => {
  assert.equal(bounceHeight(100, 3, 0), 100);
  assert.equal(bounceHeight(100, 3, 0.5), 0, 'touches down half way');
  const peaks: number[] = [];
  let prev = 100;
  let rising = false;
  for (let u = 0; u < 1; u += 0.0005) {
    const h = bounceHeight(100, 3, u);
    assert.ok(h >= 0 && h <= 100, `u ${u}: ${h}`);
    if (rising && h < prev) peaks.push(prev);
    rising = h > prev;
    prev = h;
  }
  assert.equal(peaks.length, 6, `peaks ${peaks}`);
  for (let i = 1; i < 3; i++) assert.ok(peaks[i] < peaks[i - 1], 'lower and lower');
  for (let i = 3; i < 6; i++) assert.ok(Math.abs(peaks[i] - peaks[5 - i]) < 0.5, 'then mirrored');
  for (const u of [0.1, 0.23, 0.37, 0.44]) assert.ok(Math.abs(bounceHeight(100, 3, u) - bounceHeight(100, 3, 1 - u)) < 1e-9, `symmetric at ${u}`);
  assert.ok(bounceHeight(100, 3, 0.999) > 99, 'rises back to the top: no jump when it repeats');
  assert.ok(bounceHeight(100, 0, 0.25) > 0 && bounceHeight(100, 0, 0.5) === 0, 'no bounces: down and back up');
});

test('bounce motion moves the object up from its home and repeats each period', () => {
  const o: PatchObject = { id: 's', kind: 'sound', type: 'pluck', x: 10, y: 20, size: 40, layer: 0, params: {}, motion: { pos: { type: 'bounce', height: 80, bounces: 2, periodBeats: 4 } } };
  const p = newPose();
  assert.deepEqual(pose(o, 0, 1, p), { ...newPose(10, 100) });
  assert.equal(pose(o, 2, 1, p).y, 20);
  assert.equal(pose(o, 4, 1, p).y, 100);
});

test("follow: a follower adds its leader's motion offset and breathing, down a chain", () => {
  const lead: PatchObject = { id: 'a', kind: 'field', type: 'reverb', x: 100, y: 0, shape: { r: 100 }, layer: 0, handles: {}, motion: { pos: { type: 'orbit', radius: 50, periodBeats: 4, phase: 0 }, breathe: { amount: 0.5, periodBeats: 4 } } };
  const mid: PatchObject = { id: 'b', kind: 'sound', type: 'pluck', x: 300, y: 300, size: 40, layer: 1, params: {}, follow: 'a' };
  const end: PatchObject = { id: 'c', kind: 'sound', type: 'pluck', x: -50, y: 0, size: 40, layer: 2, params: {}, follow: 'b', motion: { pos: { type: 'orbit', radius: 10, periodBeats: 4, phase: 0 } } };
  const all = [lead, mid, end];
  const lookup = (id: string) => all.find((o) => o.id === id);
  for (const beat of [0, 0.5, 1.3, 2.9]) {
    const lp = pose(lead, beat, 1, newPose());
    const mp = followPose(mid, beat, 1, lookup, newPose());
    assert.ok(Math.abs(mp.x - (300 + lp.x - 100)) < 1e-9 && Math.abs(mp.y - (300 + lp.y)) < 1e-9, `beat ${beat}`);
    assert.equal(mp.scale, lp.scale);
    const own = pose(end, beat, 1, newPose());
    const ep = followPose(end, beat, 1, lookup, newPose());
    assert.ok(Math.abs(ep.x - (own.x + lp.x - 100)) < 1e-9, 'chain');
  }
  // a loop just stops after a few hops instead of recursing forever
  const x: PatchObject = { ...mid, id: 'x', follow: 'y' };
  const y: PatchObject = { ...mid, id: 'y', follow: 'x' };
  followPose(x, 1, 1, (id) => (id === 'x' ? x : id === 'y' ? y : undefined), newPose());
});

test('a following field changes the audio (the engine uses follow)', () => {
  const p = loadPatch('demo');
  const with_ = structuredClone(p);
  const f = with_.objects.find((o) => o.id === 'f6')!; // the pulse field
  with_.objects.find((o) => o.id === 's4')!.motion = { pos: { type: 'orbit', radius: 200, periodBeats: 8, phase: 0 } };
  f.follow = 's4';
  const without = structuredClone(with_);
  delete without.objects.find((o) => o.id === 'f6')!.follow;
  const a = renderOffline(with_, 6);
  const b = renderOffline(without, 6);
  assert.notEqual(hashAudio(a.left, a.right), hashAudio(b.left, b.right));
});

test('sanitise keeps a follow only when it names another object, and clamps bounce', () => {
  const base = loadPatch('demo');
  const p = sanitisePatch({
    ...base,
    objects: [
      ...base.objects,
      { id: 'q1', kind: 'sound', type: 'pluck', x: 0, y: 0, size: 40, layer: 30, params: {}, follow: 's1', motion: { pos: { type: 'bounce', height: 1e9, bounces: 99, periodBeats: 0 } } },
      { id: 'q2', kind: 'sound', type: 'pluck', x: 0, y: 0, size: 40, layer: 31, params: {}, follow: 'ghost' },
      { id: 'q3', kind: 'sound', type: 'pluck', x: 0, y: 0, size: 40, layer: 32, params: {}, follow: 'q3' },
    ],
  }) as any;
  const by = (id: string) => p.objects.find((o: any) => o.id === id);
  assert.equal(by('q1').follow, 's1');
  assert.deepEqual(by('q1').motion.pos, { type: 'bounce', height: 4000, bounces: 12, periodBeats: 0.25 });
  assert.equal(by('q2').follow, undefined);
  assert.equal(by('q3').follow, undefined);
});
