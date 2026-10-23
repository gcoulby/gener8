// What the expansion's generators, transformers, FX, maps and motions do,
// beyond the registry test's "renders and is audible".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EventRecord, FieldObj, LoggedEdit, Patch, PatchObject, PosMotion, SoundObj } from '../src/core/types.ts';
import { Engine } from '../src/core/engine.ts';
import { PPQ, SR } from '../src/core/constants.ts';
import { soundTypes, defaultParams } from '../src/core/sounds/registry.ts';
import { fieldTypes, defaultHandles } from '../src/core/fields/registry.ts';
import { lsysMelody } from '../src/core/fields/systems.ts';
import { spiralU, tonnetzStep } from '../src/core/fields/maps.ts';
import { newPlacement, placeSound, type MapPose } from '../src/core/placement.ts';
import { followPose, newPose, pose } from '../src/core/motion.ts';
import { sanitisePatch } from '../src/core/sanitise.ts';
import { renderOffline } from '../src/core/render.ts';
import { hashAudio } from './util.ts';
import type { MapType } from '../src/core/types.ts';

const TEMPO = 120;
const TPS = (TEMPO * PPQ) / (60 * SR);

function patch(objects: PatchObject[]): Patch {
  return { format: 'gener8.patch', version: 2, seed: 11, tempo: TEMPO, key: { root: 0, scale: 'major' }, objects };
}

function field(type: string, x: number, y: number, handles: Record<string, number> = {}, extra: Partial<FieldObj> = {}): FieldObj {
  const t = fieldTypes[type];
  return { id: 'f' + type, kind: 'field', type, x, y, shape: structuredClone(t.defaultShape), layer: 1, handles: { ...defaultHandles(t), ...handles }, ...extra };
}

function sound(id: string, x: number, y: number, extra: Partial<SoundObj> = {}): SoundObj {
  return { id, kind: 'sound', type: 'percussion', x, y, size: 30, layer: 5, params: defaultParams(soundTypes.percussion), ripple: { reach: 0 }, ...extra };
}

function events(p: Patch, beats: number, edits?: LoggedEdit[]): EventRecord[] {
  const e = new Engine(p);
  if (edits) e.schedule(edits);
  const n = Math.round((beats * PPQ) / TPS);
  const L = new Float32Array(4096);
  const R = new Float32Array(4096);
  const out: EventRecord[] = [];
  for (let i = 0; i < n; i += 4096) {
    e.process(L, R, Math.min(4096, n - i));
    out.push(...e.drainRecords());
  }
  return out;
}

const of = (ev: EventRecord[], id: string) => ev.filter((e) => e.soundId === id);
/** A pulse that plays every 16th on a sound at the centre. */
const every16th = () => field('pulse', 0, 0, { hits: 1, length: 1 }, { shape: { r: 300 }, layer: 0 });

// ---------- transformers ----------

test('swing: off-beat 16ths move late, on-beats stay, nothing moves early', () => {
  const ev = of(events(patch([every16th(), field('swing', 0, 0, { amount: 1, grid: 1 }, { shape: { r: 300 } }), sound('a', 0, 0)]), 4), 'a');
  const on = ev.filter((e) => e.tick % 480 < 1);
  const late = ev.filter((e) => e.tick % 480 >= 1);
  assert.ok(on.length >= 7 && late.length >= 7);
  for (const e of late) assert.ok(e.tick % 480 > 240 && e.tick % 480 <= 360 + 1, `off-beat at ${e.tick % 480}`);
});

test('accent: notes on the accent grid are louder than the rest', () => {
  const ev = of(events(patch([every16th(), field('accent', 0, 0, { every: 0.33, strength: 1 }, { shape: { r: 300 } }), sound('a', 0, 0)]), 4), 'a');
  const on = ev.filter((e) => Math.round(e.tick / 240) % 4 === 0);
  const off = ev.filter((e) => Math.round(e.tick / 240) % 4 !== 0);
  assert.ok(Math.min(...on.map((e) => e.velocity)) > Math.max(...off.map((e) => e.velocity)));
});

test('throttle: at the centre no more than `max` notes per window', () => {
  const ev = of(events(patch([every16th(), field('throttle', 0, 0, { max: 1 / 7, per: 1 / 3 }, { shape: { r: 300 } }), sound('a', 0, 0)]), 8), 'a');
  const per = new Map<number, number>();
  for (const e of ev) per.set(Math.floor(e.tick / PPQ), (per.get(Math.floor(e.tick / PPQ)) ?? 0) + 1);
  assert.ok(ev.length > 0);
  for (const n of per.values()) assert.ok(n <= 2, `${n} in a beat`);
});

test('scatter: pitches move by whole octaves only', () => {
  const plain = of(events(patch([every16th(), sound('a', 0, 0, { note: 60 })]), 4), 'a');
  const ev = of(events(patch([every16th(), field('scatter', 0, 0, { chance: 1, range: 1 }, { shape: { r: 300 } }), sound('a', 0, 0, { note: 60 })]), 4), 'a');
  assert.equal(ev.length, plain.length);
  assert.ok(ev.some((e) => e.pitch !== 60));
  for (const e of ev) assert.equal((((e.pitch - 60) % 12) + 12) % 12, 0);
});

test('smooth: after scatter, no leap is wider than the limit', () => {
  const objs = [every16th(), field('scatter', 0, 0, { chance: 1, range: 1 }, { shape: { r: 300 }, layer: 0 }), field('smooth', 0, 0, { leap: 0.5, mode: 0 }, { shape: { r: 300 }, layer: 2 }), sound('a', 0, 0, { note: 60 })];
  const ev = of(events(patch(objs), 8), 'a');
  for (let i = 1; i < ev.length; i++) assert.ok(Math.abs(ev[i].pitch - ev[i - 1].pitch) <= 7, `${ev[i - 1].pitch} → ${ev[i].pitch}`);
});

test('echo: each note repeats, softer each time', () => {
  const one = field('pulse', 0, 0, { hits: 0, length: 1 }, { shape: { r: 300 }, layer: 0 });
  const ev = of(events(patch([one, field('echo', 0, 0, { gap: 0.6, decay: 0.5 }, { shape: { r: 300 } }), sound('a', 0, 0)]), 4), 'a');
  const first = ev.filter((e) => e.tick < 4 * PPQ);
  assert.ok(first.length >= 3);
  for (let i = 1; i < first.length; i++) assert.ok(first[i].velocity < first[i - 1].velocity);
});

test('retrograde: each window comes back reversed in the next', () => {
  // a rising run of 8ths, one bar at a time
  const run = field('sequencer', 0, 0, { rate: 0.5, length: 7 / 15 }, { shape: { r: 300 }, layer: 0, seq: [0, 1, 2, 3, 4, 5, 6, 7] });
  const ev = of(events(patch([run, field('retrograde', 0, 0, { window: 1 / 3, share: 1 }, { shape: { r: 300 } }), sound('a', 0, 0)]), 12), 'a');
  const bar = (k: number) => ev.filter((e) => Math.floor(e.tick / (4 * PPQ)) === k).map((e) => e.pitch);
  const b1 = bar(1);
  assert.equal(b1.length, 8);
  for (let i = 1; i < b1.length; i++) assert.ok(b1[i] < b1[i - 1], `falling: ${b1}`);
});

test('glide: notes carry a glide time, and it changes the sound', () => {
  const objs: PatchObject[] = [field('drift', 0, 0, { rate: 0.6, entropy: 1 }, { shape: { r: 300 }, layer: 0 }), { ...sound('a', 0, 0), type: 'subtractive', params: defaultParams(soundTypes.subtractive) }];
  const plain = renderOffline(patch(objs), 3);
  const slid = renderOffline(patch([...objs, field('glide', 0, 0, { share: 1 }, { shape: { r: 300 } })]), 3);
  assert.notEqual(hashAudio(plain.left, plain.right), hashAudio(slid.left, slid.right));
});

// ---------- generators ----------

test('sequencer: plays its steps in order from the sound’s note, skipping rests', () => {
  const ev = of(events(patch([field('sequencer', 0, 0, { rate: 0, length: 3 / 15 }, { seq: [0, null, 2, 4] }), sound('a', 0, 0, { note: 60 })]), 2), 'a');
  assert.deepEqual(ev.slice(0, 6).map((e) => e.pitch), [60, 64, 67, 60, 64, 67]);
});

test('midi in: a note-on plays its own pitch and the note-off releases it', () => {
  const edits: LoggedEdit[] = [
    { sample: 4800, edit: { op: 'midi', data: [0x90, 67, 100] } },
    { sample: 9600, edit: { op: 'midi', data: [0x80, 67, 0] } },
  ];
  const s: SoundObj = { ...sound('a', 0, 0), type: 'subtractive', params: { ...defaultParams(soundTypes.subtractive), r: 0.01 } };
  const e = new Engine(patch([field('midi', 0, 0), s]));
  e.schedule(edits);
  const L = new Float32Array(48000);
  const R = new Float32Array(48000);
  e.process(L, R, 48000);
  const rec = e.drainRecords();
  assert.equal(rec.length, 1);
  assert.equal(rec[0].pitch, 67);
  // silent soon after the release, long before the 16-beat hold limit
  let tail = 0;
  for (let i = 24000; i < 48000; i++) tail = Math.max(tail, Math.abs(L[i]));
  assert.ok(tail < 1e-3, `tail ${tail}`);
  // channel filter: channel 2 only ignores channel 1
  const ch2 = events(patch([field('midi', 0, 0, { channel: 2 / 16 }), sound('a', 0, 0)]), 2, edits);
  assert.equal(ch2.length, 0);
});

test('bells: plain hunt rings every bell once a change and comes back to rounds', () => {
  const n = 4;
  const ss = [0, 1, 2, 3].map((i) => sound('b' + i, Math.sin((i / n) * 2 * Math.PI + 0.2) * 100, Math.cos((i / n) * 2 * Math.PI + 0.2) * 100));
  const ev = events(patch([field('bells', 0, 0, { method: 1 / 3, rate: 1 }), ...ss]), 40);
  const ids = ev.map((e) => e.soundId);
  const rows: string[] = [];
  for (let i = 0; i + n <= ids.length; i += n) rows.push(ids.slice(i, i + n).join());
  for (const r of rows.slice(0, 2 * n + 1)) assert.equal(new Set(r.split(',')).size, n, r);
  assert.equal(rows[2 * n], rows[0], 'back to rounds after 2n changes');
  assert.notEqual(rows[1], rows[0]);
});

test('L-system: algae grows by Fibonacci numbers', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((g) => lsysMelody(0, g).length), [2, 3, 5, 8, 13]);
});

test('automaton: rule 90 from one cell grows a symmetric triangle', () => {
  const e = new Engine(patch([field('automaton', 0, 0, { rule: 1 / 6, rate: 1 }, { shape: { w: 24 * 15, h: 24 * 6 } })]));
  const L = new Float32Array(48000);
  e.process(L, L, 48000);
  const v = e.visuals().find((x) => x.id === 'fautomaton')!.data as { cols: number; rows: number; cells: Uint8Array };
  for (let r = 0; r < v.rows; r++) {
    const row = Array.from(v.cells.subarray(r * v.cols, (r + 1) * v.cols));
    assert.deepEqual(row, row.slice().reverse(), `row ${r}`);
  }
});

test('pendulum and flock: they play, and replay identically', () => {
  for (const type of ['pendulum', 'flock']) {
    const p = patch([field(type, 0, 0), sound('a', 60, -60), sound('b', -80, 20), sound('c', 0, 100)]);
    const ev = events(p, 32);
    assert.ok(ev.length > 4, `${type} played ${ev.length}`);
    assert.deepEqual(events(p, 32), ev, `${type} deterministic`);
  }
});

// ---------- maps ----------

test('spiral: going round changes the note, stepping out an arm adds an octave', () => {
  const R = 240;
  const at = (turns: number, r: number) => spiralU(R, Math.sin(turns * 2 * Math.PI) * r, Math.cos(turns * 2 * Math.PI) * r);
  assert.ok(Math.abs(at(0.25, R / 3 + 20) - at(0.25, (2 * R) / 3 + 20) + 1) < 1e-9);
  assert.ok(at(0.5, R / 2) > at(0.25, R / 2));
});

test('tonnetz: neighbours are a fifth and a major third apart, folded into ±6', () => {
  assert.equal(tonnetzStep(1, 0), -5);
  assert.equal(tonnetzStep(0, 1), 4);
  assert.equal(tonnetzStep(-1, 1), -3);
  for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) assert.ok(Math.abs(tonnetzStep(q, r)) <= 6);
});

test('midi cc: every sound inside gets the value handle, wherever it sits', () => {
  const f = field('cc', 0, 0, { value: 1 });
  const m: MapPose = { obj: f, pose: newPose(), type: fieldTypes.cc as MapType };
  const a = placeSound(-150, 100, [m], undefined, newPlacement()).level;
  const b = placeSound(120, -90, [m], undefined, newPlacement()).level;
  assert.equal(a, 0);
  assert.equal(b, 0);
  f.handles.value = 0;
  assert.equal(placeSound(0, 0, [m], undefined, newPlacement()).level, -24);
});

// ---------- motion ----------

const KINDS: PosMotion[] = [
  { type: 'pendulum', length: 120, swing: 60, periodBeats: 8 },
  { type: 'lissajous', size: 100, a: 1, b: 2, periodBeats: 16 },
  { type: 'spiral', radius: 120, turns: 3, periodBeats: 16 },
  { type: 'rose', size: 120, petals: 5, periodBeats: 16 },
  { type: 'spirograph', radius: 120, lobes: 5, arm: 0.6, periodBeats: 16 },
  { type: 'spring', stretch: 80, damping: 0.4, periodBeats: 8 },
  { type: 'shuttle', angle: 90, distance: 120, periodBeats: 8, ease: 'smooth' },
  { type: 'orbit', radius: 80, periodBeats: 8, phase: 0, ease: 'elastic' },
];

test('new motions are smooth, repeat each period and stay near their size', () => {
  for (const m of KINDS) {
    const o: PatchObject = { ...sound('s', 10, 20), motion: { pos: m } };
    const period = 'periodBeats' in m ? m.periodBeats : 8;
    const p = newPose();
    let px = NaN;
    let py = NaN;
    for (let i = 0; i <= 400; i++) {
      pose(o, (i / 400) * period, 1, p);
      if (i) assert.ok(Math.hypot(p.x - px, p.y - py) < 25, `${m.type} jumps at ${i}`);
      assert.ok(Math.hypot(p.x - 10, p.y - 20) < 400, `${m.type} wanders off`);
      px = p.x;
      py = p.y;
    }
    // a spring flicks a new seeded way each cycle; the rest trace the same figure again
    if (m.type === 'spring') continue;
    const a = pose(o, 1.3, 1, newPose());
    const b = pose(o, 1.3 + period, 1, newPose());
    assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, `${m.type} repeats`);
  }
});

test('hop: sits still between hops, on a spot within its distance', () => {
  const o: PatchObject = { ...sound('s', 0, 0), motion: { pos: { type: 'hop', distance: 100, spots: 4, everyBeats: 2 } } };
  const a = pose(o, 4.6, 1, newPose());
  const b = pose(o, 5.8, 1, newPose());
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
  assert.ok(Math.hypot(a.x, a.y) <= 100);
});

test('path dwell: waits at each point for its share of the segment', () => {
  const o: PatchObject = { ...sound('s', 0, 0), motion: { pos: { type: 'path', points: [[0, 0], [100, 0]], periodBeats: 4, mode: 'loop', dwell: 0.5 } } };
  assert.equal(pose(o, 0.2, 1, newPose()).x, 0);
  assert.equal(pose(o, 0.9, 1, newPose()).x, 0);
  assert.ok(pose(o, 1.5, 1, newPose()).x > 0);
});

test('spin turns a field, carrying its sounds round a pulse', () => {
  const objs = [field('pulse', 0, 0, { hits: 0.25, length: 1 }), sound('a', 0, 100)];
  const still = events(patch(objs), 16).map((e) => e.tick);
  const spun = events(patch([{ ...objs[0], motion: { spin: { periodBeats: 4 } } } as PatchObject, objs[1]]), 16).map((e) => e.tick);
  assert.notDeepEqual(spun, still);
});

test('stretch squashes one way as it stretches the other', () => {
  const o: PatchObject = { ...field('filter', 0, 0), motion: { stretch: { amount: 0.5, periodBeats: 4 } } };
  const p = pose(o, 1, 1, newPose());
  assert.ok(p.sx > 1 && p.sy < 1);
  assert.ok(Math.abs(p.sx * p.sy - 1) < 1e-9);
});

test('lag: a follower trails its leader by that many beats', () => {
  const lead: PatchObject = { ...sound('L', 0, 0), motion: { pos: { type: 'orbit', radius: 50, periodBeats: 8, phase: 0 } } };
  const f: PatchObject = { ...sound('F', 200, 0), follow: 'L', motion: { lag: 2 } };
  const look = (id: string) => (id === 'L' ? lead : undefined);
  const lp = pose(lead, 3, 1, newPose());
  const fp = followPose(f, 5, 1, look, newPose());
  assert.ok(Math.abs(fp.x - 200 - lp.x) < 1e-9 && Math.abs(fp.y - lp.y) < 1e-9);
});

test('sanitise keeps the new motion, clamped, and rejects bad shapes', () => {
  const src = patch([
    { ...sound('a', 0, 0), motion: { pos: { type: 'rose', size: 1e9, petals: 5, periodBeats: 8 }, spin: { periodBeats: 0, ccw: true }, breathe: { amount: 0.3, periodBeats: 8, shape: 'step' }, lag: 999 } },
  ]);
  const out = sanitisePatch(JSON.parse(JSON.stringify(src)));
  const m = (out.objects[0] as SoundObj).motion!;
  assert.equal((m.pos as { size: number }).size, 4000);
  assert.equal(m.spin!.periodBeats, 0.25);
  assert.equal(m.spin!.ccw, true);
  assert.equal(m.breathe!.shape, 'step');
  assert.equal(m.lag, 64);
  const bad = JSON.parse(JSON.stringify(src));
  bad.objects[0].motion.breathe.shape = 'wobbly';
  assert.throws(() => sanitisePatch(bad));
});
