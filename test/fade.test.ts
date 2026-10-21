import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFade, fadeGain, renderOffline } from '../src/core/render.ts';
import { SR } from '../src/core/constants.ts';
import { fmtRenderSpec, fmtVideoSpec, parseRenderSpec, parseVideoSpec, RENDER_DEFAULT, VIDEO_DEFAULT } from '../src/ui/takespec.ts';
import { loadPatch } from './util.ts';

test('fade gain: silent at both ends, full in the middle, rising then falling', () => {
  const n = 10 * SR;
  const f = { in: 2, out: 3 };
  assert.equal(fadeGain(0, n, f), 0);
  assert.equal(fadeGain(n - 1, n, f), 0);
  assert.equal(fadeGain(5 * SR, n, f), 1);
  assert.equal(fadeGain(2 * SR, n, f), 1);
  assert.ok(Math.abs(fadeGain(SR, n, f) - 0.5) < 1e-6);
  let prev = -1;
  for (let i = 0; i < 2 * SR; i += 997) {
    const g = fadeGain(i, n, f);
    assert.ok(g >= prev);
    prev = g;
  }
  prev = 2;
  for (let i = n - 3 * SR; i < n; i += 997) {
    const g = fadeGain(i, n, f);
    assert.ok(g <= prev);
    prev = g;
  }
  assert.equal(fadeGain(5 * SR, n, { in: 0, out: 0 }), 1);
});

test('fade applied in chunks (render worker, video frames) matches one pass', () => {
  const patch = loadPatch('demo');
  const f = { in: 1.5, out: 2.25 };
  const whole = renderOffline(patch, 6, { fade: f });
  const raw = renderOffline(patch, 6);
  const n = raw.left.length;
  for (const chunk of [1600, 800, 4801]) {
    const l = raw.left.slice();
    const r = raw.right.slice();
    for (let at = 0; at < n; at += chunk) applyFade(l.subarray(at), r.subarray(at), at, Math.min(chunk, n - at), n, f);
    assert.deepEqual(l, whole.left);
    assert.deepEqual(r, whole.right);
  }
  // and the middle is untouched
  const mid = 3 * SR;
  assert.equal(whole.left[mid], raw.left[mid]);
  assert.ok(whole.left[0] === 0); // ±0
  assert.ok(whole.right[n - 1] === 0);
});

test('render and video entries', () => {
  const r = (t: string) => parseRenderSpec(t, RENDER_DEFAULT);
  assert.deepEqual(r('5'), { seconds: 300, fade: { in: 0, out: 0 } });
  assert.deepEqual(r('90s fade'), { seconds: 90, fade: { in: 3, out: 3 } });
  assert.deepEqual(r('1:00:00 fade:10s'), { seconds: 3600, fade: { in: 10, out: 10 } });
  assert.deepEqual(r('10m in:2 out:30s'), { seconds: 600, fade: { in: 2, out: 30 } });
  assert.deepEqual(r('out:1m 10'), { seconds: 600, fade: { in: 0, out: 60 } });
  assert.deepEqual(r('fade'), { seconds: 300, fade: { in: 3, out: 3 } });
  assert.deepEqual(r('10s fade:20s'), { seconds: 10, fade: { in: 5, out: 5 } }, 'fades share a short render');
  assert.deepEqual(r('9h'), { seconds: 3600, fade: { in: 0, out: 0 } }, 'capped at an hour');
  for (const bad of ['in', 'fade:x', '5 60fps', '5 4k', 'five', '5 5']) assert.equal(r(bad), null, bad);

  const v = (t: string) => parseVideoSpec(t, VIDEO_DEFAULT);
  assert.deepEqual(v('90s 60fps fade'), { seconds: 90, fps: 60, height: 1080, fade: { in: 3, out: 3 }, short: false });
  assert.deepEqual(v('4k 1:00:00 out:30s'), { seconds: 3600, fps: 30, height: 2160, fade: { in: 0, out: 30 }, short: false });
  assert.equal(v('5 7fps'), null);
  assert.deepEqual(v('short'), { seconds: 60, fps: 30, height: 1080, fade: { in: 0, out: 0 }, short: true }, 'a minute unless told');
  assert.deepEqual(v('short 30s fade'), { seconds: 30, fps: 30, height: 1080, fade: { in: 3, out: 3 }, short: true });
  assert.equal(v('short 4k'), null, 'a short has its own size');
  assert.equal(v('5')!.short, false, 'only when typed');
  assert.equal(parseRenderSpec('short', RENDER_DEFAULT), null, 'video only');

  // what the entries start out showing parses back to the same spec
  for (const t of ['5', '90s fade', '10m in:2s out:30s', '1:00:00 fade:1.5s']) {
    const s = r(t)!;
    assert.deepEqual(r(fmtRenderSpec(s)), s, t);
  }
  for (const t of ['5', '90s 60fps fade', '4k 10m in:2s out:30s', '720p', 'short', 'short 45s fade:2s']) {
    const s = v(t)!;
    assert.deepEqual(v(fmtVideoSpec(s)), s, t);
  }
});
