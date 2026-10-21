import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/core/engine.ts';
import { SR } from '../src/core/constants.ts';
import type { EventRecord, FieldObj, MapType, Patch, PatchObject, RippleSpec } from '../src/core/types.ts';
import { classicStage, normalizePatch } from '../src/core/patch.ts';
import { fieldTypes, isMap } from '../src/core/fields/registry.ts';
import { newPlacement, placeSound, traceTurns, type MapPose } from '../src/core/placement.ts';
import { renderOffline } from '../src/core/render.ts';
import { hashAudio } from './util.ts';

const v1Pitch = (y: number) => Math.min(96, Math.max(24, 60 + y / 10));
const v1Pan = (x: number) => Math.min(1, Math.max(-1, x / 800));
const still = (obj: FieldObj): MapPose => ({ obj, pose: { x: obj.x, y: obj.y, scale: 1 }, type: fieldTypes[obj.type] as MapType });

function xyField(id: string, x: number, y: number, w: number, h: number, layer: number, axes: FieldObj['axes']): FieldObj {
  return { id, kind: 'field', type: 'xy', x, y, shape: { w, h }, layer, handles: {}, axes };
}

test('the stage XY field reproduces the v1 mapping bit for bit', () => {
  const maps = [still(classicStage())];
  const pl = newPlacement();
  for (let x = -800; x <= 800; x += 3.7) {
    for (let y = -360; y <= 360; y += 1.3) {
      placeSound(x, y, maps, undefined, pl);
      assert.equal(pl.pitch, v1Pitch(y), `pitch at ${x}, ${y}`);
      assert.equal(pl.pan, v1Pan(x) + 0, `pan at ${x}, ${y}`);
    }
  }
});

test('migration grows the stage to cover far-out sounds, keeping the v1 slope and clamps', () => {
  const p = normalizePatch({
    format: 'gener8.patch',
    version: 1,
    seed: 1,
    tempo: 90,
    key: { root: 0, scale: 'major' },
    objects: [
      { id: 's1', kind: 'sound', type: 'pluck', x: 1234, y: -567, size: 40, layer: 1, params: {} },
      { id: 's2', kind: 'sound', type: 'pluck', x: 0, y: 300, size: 40, layer: 2, params: {}, motion: { pos: { type: 'orbit', radius: 200, periodBeats: 8, phase: 0 } } },
    ],
  });
  assert.equal(p.version, 2);
  const stage = p.objects.filter(isMap);
  assert.equal(stage.length, 1);
  const f = stage[0];
  assert.ok(!('r' in f.shape) && f.shape.w >= 2 * 1234 && f.shape.h >= 2 * 567, JSON.stringify(f.shape));
  const pl = newPlacement();
  for (let x = -1234; x <= 1234; x += 11.1) {
    for (let y = -567; y <= 567; y += 7.7) {
      placeSound(x, y, [still(f)], undefined, pl);
      assert.equal(pl.pitch, v1Pitch(y), `pitch at ${x}, ${y}`);
      assert.equal(pl.pan, v1Pan(x) + 0, `pan at ${x}, ${y}`);
    }
  }
  // already version 2: left alone
  assert.equal(normalizePatch(p).objects.filter(isMap).length, 1);
});

test('outside every XY field a sound sits at middle C, centre', () => {
  const pl = placeSound(5000, 5000, [still(classicStage())], undefined, newPlacement());
  assert.deepEqual([pl.pitch, pl.pan, pl.level], [60, 0, 0]);
});

test('XY fields: higher layers override, axes can be inverted, unset axes leave values alone', () => {
  const low = xyField('a', 0, 0, 1000, 1000, 0, { x: { to: 'pan', min: -1, max: 1 }, y: { to: 'pitch', min: 40, max: 80 } });
  const high = xyField('b', 0, 0, 200, 200, 1, { x: { to: 'pan', min: 1, max: -1 } });
  const pl = placeSound(50, 100, [still(low), still(high)], undefined, newPlacement());
  assert.equal(pl.pan, -0.5, 'inverted pan from the top field');
  assert.equal(pl.pitch, 64, 'pitch still from the lower field');
  // wide, gentle pan: 4000 units for only half the stereo field
  const wide = xyField('w', 0, 0, 4000, 400, 0, { x: { to: 'pan', min: -0.5, max: 0.5 } });
  assert.equal(placeSound(1000, 0, [still(wide)], undefined, newPlacement()).pan, 0.25);
});

test('a param axis drives that sound parameter', () => {
  const p = (x: number): Patch => ({
    format: 'gener8.patch',
    version: 2,
    seed: 3,
    tempo: 90,
    key: { root: 0, scale: 'major' },
    objects: [
      xyField('xy1', 0, 0, 800, 400, 0, { x: { to: 'param:tone', min: 0, max: 1 }, y: { to: 'pitch', min: 48, max: 72 } }),
      { id: 's1', kind: 'sound', type: 'pad', x, y: 0, size: 48, layer: 1, params: {} },
    ],
  });
  const a = renderOffline(p(-300), 2);
  const b = renderOffline(p(300), 2);
  assert.notEqual(hashAudio(a.left, a.right), hashAudio(b.left, b.right));
});

test('trace directions', () => {
  assert.equal(traceTurns('ripple', 0, 3, 90), null);
  assert.deepEqual(traceTurns('point', 45, 3, 90), [0.125]);
  assert.deepEqual(traceTurns('multi', 0, 4, 360), [0, 0.25, 0.5, 0.75]);
  assert.deepEqual(traceTurns('multi', 90, 3, 90), [0.125, 0.25, 0.375]);
});

// ---------- retrigger modes ----------

/** A pulse-driven emitter at the origin, listeners up (near and far), right and down-left. */
function layout(ripple?: RippleSpec): Patch {
  const listener = (id: string, x: number, y: number, layer: number): PatchObject => ({ id, kind: 'sound', type: 'pluck', x, y, size: 40, layer, params: {}, ripple: { reach: 0 } });
  return {
    format: 'gener8.patch',
    version: 2,
    seed: 9,
    tempo: 120,
    key: { root: 0, scale: 'minorPentatonic' },
    objects: [
      classicStage(),
      { id: 'g', kind: 'field', type: 'pulse', x: 0, y: 0, shape: { r: 60 }, layer: 1, handles: { hits: 1, length: 0 } },
      { id: 'src', kind: 'sound', type: 'pluck', x: 0, y: 0, size: 80, layer: 2, params: {}, ...(ripple ? { ripple } : {}) },
      listener('up', 0, 150, 3),
      listener('far', 0, 300, 4),
      listener('right', 200, 0, 5),
      listener('diag', -200, -200, 6),
    ],
  };
}

/** Which listeners the emitter retriggered in a few seconds. */
function answered(p: Patch): string[] {
  const e = new Engine(p);
  const L = new Float32Array(4096);
  const R = new Float32Array(4096);
  const recs: EventRecord[] = [];
  for (let i = 0; i < 3 * SR; i += 4096) {
    e.process(L, R, 4096);
    recs.push(...e.drainRecords());
  }
  return [...new Set(recs.filter((r) => r.sourceKind === 'ripple' && r.sourceId === 'src').map((r) => r.soundId))].sort();
}

test('ripple (default): a ring reaches every listener in range', () => {
  assert.deepEqual(answered(layout()), ['diag', 'far', 'right', 'up']);
});

test('point: a single trace at the angle only hits what it passes through', () => {
  assert.deepEqual(answered(layout({ mode: 'point', angle: 0 })), ['far', 'up']);
  assert.deepEqual(answered(layout({ mode: 'point', angle: 90 })), ['right']);
  assert.deepEqual(answered(layout({ mode: 'point', angle: 225 })), ['diag']);
});

test('stop on impact: the trace or ring ends at the first listener', () => {
  assert.deepEqual(answered(layout({ mode: 'point', angle: 0, stop: true })), ['up']);
  assert.deepEqual(answered(layout({ stop: true })), ['up']);
});

test('multi: traces fanned over the spread', () => {
  assert.deepEqual(answered(layout({ mode: 'multi', angle: 0, count: 4, spread: 360 })), ['far', 'right', 'up']);
  assert.deepEqual(answered(layout({ mode: 'multi', angle: 0, count: 4, spread: 360, stop: true })), ['right', 'up']);
});

test('reach sets how far it travels; 0 never retriggers', () => {
  assert.deepEqual(answered(layout({ reach: 0 })), []);
  // 3 × size 80 = 240: up (150) and right (200) yes, diag (283) and far (300) no
  assert.deepEqual(answered(layout({ reach: 3 })), ['right', 'up']);
});

// ---------- radial, sweep, tri ----------

function roundField(type: string, r: number, axes: FieldObj['axes']): FieldObj {
  return { id: type, kind: 'field', type, x: 100, y: 50, shape: { r }, layer: 0, handles: {}, axes };
}

test('radial: centre is min, edge is max, outside is untouched', () => {
  const m = [still(roundField('radial', 200, { r: { to: 'level', min: 0, max: -20 } }))];
  const at = (x: number, y: number) => placeSound(x, y, m, undefined, newPlacement()).level;
  assert.equal(at(100, 50), 0);
  assert.equal(at(200, 50), -10);
  assert.equal(at(100, 250), -20);
  assert.equal(at(100, 251), 0, 'outside');
});

test('sweep: values go round clockwise from straight up', () => {
  const m = [still(roundField('sweep', 200, { t: { to: 'pitch', min: 48, max: 72 } }))];
  const at = (x: number, y: number) => placeSound(x, y, m, undefined, newPlacement()).pitch;
  assert.equal(at(100, 150), 48, 'up');
  assert.ok(Math.abs(at(200, 50) - 54) < 1e-9, 'right: a quarter of the way');
  assert.ok(Math.abs(at(100, -50) - 60) < 1e-9, 'down: half way');
  assert.ok(Math.abs(at(0, 50) - 66) < 1e-9, 'left: three quarters');
});

test('tri: each axis runs from the opposite edge to its own corner, and they blend', () => {
  const m = [still(roundField('tri', 300, { a: { to: 'pitch', min: 40, max: 80 }, b: { to: 'pan', min: 0, max: 1 }, c: { to: 'level', min: 0, max: -30 } }))];
  const at = (x: number, y: number) => placeSound(x, y, m, undefined, newPlacement());
  const top = at(100, 50 + 299.999);
  assert.ok(Math.abs(top.pitch - 80) < 1e-3 && Math.abs(top.pan) < 1e-3 && Math.abs(top.level) < 1e-3, 'top corner');
  const mid = at(100, 50);
  assert.ok(Math.abs(mid.pitch - (40 + 40 / 3)) < 1e-9 && Math.abs(mid.pan - 1 / 3) < 1e-9 && Math.abs(mid.level + 10) < 1e-9, 'centre: a third each');
  // bottom edge (opposite corner a) at y = 50 - 150
  assert.ok(Math.abs(at(100, -100).pitch - 40) < 1e-9);
  assert.equal(at(100, 50 + 301).pitch, 60, 'outside: default');
  assert.equal(at(400, -100).pitch, 60, 'outside a bottom corner');
});

test('every map type has a default axis per spec and the right shape', () => {
  for (const t of Object.values(fieldTypes)) {
    if (t.role !== 'map') continue;
    for (const s of t.axes) assert.ok(s.key in t.defaultAxes, `${t.id}.${s.key}`);
    assert.equal(t.shape === 'rect', !('r' in t.defaultShape), t.id);
  }
  assert.equal(Object.values(fieldTypes).filter((t) => t.role === 'map').length % 2, 0, 'palette column stays even');
});
