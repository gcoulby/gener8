// What the newer generators, transformers, FX and sounds actually do, beyond
// the registry test's "renders and is audible".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EventRecord, FieldContext, FieldObj, Patch, PatchObject, SoundObj } from '../src/core/types.ts';
import { Engine } from '../src/core/engine.ts';
import { PPQ, SR } from '../src/core/constants.ts';
import { renderOffline } from '../src/core/render.ts';
import { soundTypes, defaultParams } from '../src/core/sounds/registry.ts';
import { fieldTypes, defaultHandles } from '../src/core/fields/registry.ts';
import { MACRO_MODELS } from '../src/core/sounds/macro.ts';
import { SCALES, nearestIndex } from '../src/core/music.ts';
import { rand } from '../src/core/rand.ts';
import { polyDivision } from '../src/core/fields/rhythms.ts';

const TEMPO = 120;
/** Ticks per sample at TEMPO. */
const TPS = (TEMPO * PPQ) / (60 * SR);

function patch(objects: PatchObject[]): Patch {
  return { format: 'gener8.patch', version: 2, seed: 11, tempo: TEMPO, key: { root: 0, scale: 'major' }, objects };
}

function field(type: string, x: number, y: number, handles: Record<string, number> = {}, shape?: FieldObj['shape']): FieldObj {
  const t = fieldTypes[type];
  return { id: 'f' + type, kind: 'field', type, x, y, shape: shape ?? structuredClone(t.defaultShape), layer: 1, handles: { ...defaultHandles(t), ...handles } };
}

/** An event sound that never retriggers others, so only the field under test makes notes. */
function sound(id: string, x: number, y: number, extra: Partial<SoundObj> = {}): SoundObj {
  return { id, kind: 'sound', type: 'percussion', x, y, size: 30, layer: 5, params: defaultParams(soundTypes.percussion), ripple: { reach: 0 }, ...extra };
}

function events(p: Patch, beats: number): EventRecord[] {
  const e = new Engine(p);
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
const inKey = (m: number) => SCALES.major.includes(((Math.round(m) % 12) + 12) % 12);

// ---------- generators ----------

test('plinko: balls hit the pegs below the drop, never a sound off to the side', () => {
  const p = patch([field('plinko', 0, 0, { drop: 0.25 }), sound('top', 0, 60), sound('low', 40, -60), sound('side', 200, 0)]);
  const ev = events(p, 16);
  assert.ok(of(ev, 'top').length >= 5, `top peg hit ${of(ev, 'top').length}× from 16 drops`);
  assert.equal(of(ev, 'side').length, 0);
  assert.deepEqual(events(p, 16), ev, 'deterministic');
});

test('plinko: snap puts hits on the grid', () => {
  const ev = events(patch([field('plinko', 0, 0, { drop: 0.5, snap: 0.67 }), sound('top', 0, 60)]), 16);
  assert.ok(ev.length > 0);
  for (const e of ev) assert.equal(e.tick % 240, 0, `tick ${e.tick}`);
});

test('turing: locked, the pattern repeats every `length` steps exactly', () => {
  const len = 8;
  const ev = events(patch([field('turing', 0, 0, { length: (len - 2) / 14, change: 0 }), sound('a', 30, 40), sound('b', -50, -20)]), 32);
  const loop = len * (PPQ / 2);
  const later = ev.filter((e) => e.tick >= loop * 2).map((e) => `${e.soundId}:${e.tick % loop}:${e.pitch}`);
  const first = ev.filter((e) => e.tick >= loop && e.tick < loop * 2).map((e) => `${e.soundId}:${e.tick % loop}:${e.pitch}`);
  assert.ok(first.length > 0);
  for (const k of later) assert.ok(first.includes(k), `${k} not in the first loop`);
});

test('turing: with change up, it mutates', () => {
  const ev = events(patch([field('turing', 0, 0, { length: 6 / 14, change: 1 }), sound('a', 30, 40)]), 32);
  const loop = 8 * (PPQ / 2);
  const sig = (k: number) => ev.filter((e) => Math.floor(e.tick / loop) === k).map((e) => `${e.tick % loop}:${e.pitch}`).join();
  assert.ok(new Set([1, 2, 3, 4, 5, 6].map(sig)).size > 1);
});

test('chords: every note is in the key, and changes land on the period', () => {
  const ev = events(patch([field('chords', 0, 0, { every: 0 }), sound('a', 0, 30, { note: 64 }), sound('b', 40, -40, { note: 55 }), sound('c', -60, 0, { note: 72 })]), 32);
  assert.ok(ev.length >= 8 * 3);
  for (const e of ev) {
    assert.ok(inKey(e.pitch), `pitch ${e.pitch}`);
    assert.ok(e.tick % (4 * PPQ) < 61, `tick ${e.tick}`);
  }
  // voice leading: each sound stays within a fifth of its own note
  for (const [id, note] of [['a', 64], ['b', 55], ['c', 72]] as const) for (const e of of(ev, id)) assert.ok(Math.abs(e.pitch - note) <= 7, `${id} ${e.pitch}`);
});

test('polyrhythm: each sound plays its own division of the cycle', () => {
  const h = { cycle: 0.5, max: 0.5 };
  const f = field('poly', 0, 0, h);
  const ev = events(patch([f, sound('edge', 150, 0), sound('mid', 80, 0), sound('centre', 5, 0)]), 16);
  const cycles = 16 / 4;
  for (const id of ['edge', 'mid', 'centre']) {
    const s = { edge: 150, mid: 80, centre: 5 }[id]!;
    const n = polyDivision(h, 1 - s / 170);
    assert.equal(of(ev, id).length, n * cycles, id);
  }
});

test('wave: one hit per sweep, two when it goes there and back', () => {
  const one = events(patch([field('wave', 0, 0, { period: 0.5 }), sound('a', -60, 0)]), 16);
  assert.equal(one.length, 4);
  const back = events(patch([field('wave', 0, 0, { period: 0.5, back: 1 }), sound('a', -60, 0)]), 16);
  assert.equal(back.length, 8);
});

test('bounce: the gaps shrink and the hits soften', () => {
  const ev = of(events(patch([field('bounce', 0, 0, { every: 1 }), sound('a', 10, 0)]), 15), 'a');
  assert.ok(ev.length >= 5);
  for (let i = 2; i < ev.length; i++) {
    assert.ok(ev[i].tick - ev[i - 1].tick < ev[i - 1].tick - ev[i - 2].tick + 1, 'gaps shrink');
    assert.ok(ev[i].velocity < ev[i - 1].velocity, 'softer');
  }
});

test('phase: a sound at the centre loops every bar; one near the edge takes longer', () => {
  const ev = events(patch([field('phase', 0, 0, { spread: 1 }), sound('c', 0, 0), sound('e', 160, 0)]), 64);
  const loopOf = (id: string) => {
    const ticks = of(ev, id).map((e) => e.tick);
    for (let L = 240; L <= 64 * 240; L += 240) if (ticks.filter((t) => t + L <= ticks[ticks.length - 1]).every((t) => ticks.includes(t + L))) return L;
    return Infinity;
  };
  assert.equal(loopOf('c'), 16 * 240);
  assert.ok(loopOf('e') > 16 * 240);
});

test('topo: density sets how busy it is, and moving a sound changes its groove', () => {
  const at = (x: number, y: number, density: number) => events(patch([field('topo', 0, 0, { density, chaos: 0 }), sound('a', x, y)]), 16);
  assert.equal(at(-80, 80, 0).length, 0);
  const sparse = at(-80, 80, 0.3).length;
  const busy = at(-80, 80, 1).length;
  assert.ok(busy > sparse, `${busy} > ${sparse}`);
  const sig = (ev: EventRecord[]) => ev.map((e) => e.tick % (16 * 240)).join();
  assert.notEqual(sig(at(-100, 100, 0.8)), sig(at(100, -100, 0.8)));
});

// ---------- transformers ----------

test('canon: each note comes back later, moved by the interval', () => {
  const objs = [field('pulse', 0, 0, { hits: 0.07, length: 0.14 }, { r: 200 }), field('canon', 0, 0, { delay: 0.2, interval: 1 }, { r: 200 }), sound('a', 0, 0)];
  const ev = events(patch(objs), 8);
  const plain = events(patch([objs[0], objs[2]]), 8);
  assert.ok(ev.length >= plain.length * 2);
  // a beat later there's an octave up (later echoes of earlier notes may land there too)
  let checked = 0;
  for (const e of plain) {
    const later = ev.filter((x) => Math.abs(x.tick - (e.tick + PPQ)) < 1);
    if (!later.length) continue;
    checked++;
    assert.ok(later.some((x) => nearestIndex(x.pitch, 0, SCALES.major) - nearestIndex(e.pitch, 0, SCALES.major) === 7), 'an octave up');
  }
  assert.ok(checked > 0);
});

test('mirror: notes flip around the axis, in key', () => {
  const objs = [field('pulse', 0, 0, {}, { r: 200 }), field('mirror', 0, 0, { axis: 0.5, share: 1 }, { r: 200 }), sound('a', 0, 0, { note: 67 })];
  const ev = events(patch(objs), 8);
  assert.ok(ev.length > 0);
  // G4 mirrored around C4 (two octaves above C2… axis 0.5 = C4 = 60): 60 − (67 − 60) = 53 (F3)
  for (const e of ev) assert.equal(e.pitch, 53);
});

// ---------- FX (processors directly) ----------

function fxCtx(type: string, handles: Record<string, number> = {}, tick = 0): FieldContext & { tick: number } {
  return {
    seed: 3, idHash: 5, handles: { ...defaultHandles(fieldTypes[type]), ...handles }, tempo: TEMPO, ppq: PPQ, sr: SR, tick,
    w: 300, h: 300, baseW: 300, baseH: 300, keyRoot: 0, steps: SCALES.major, state: null,
    rand: (s, i) => rand(3, 5, s, i),
  };
}

function processor(type: string, ctx: FieldContext) {
  const t = fieldTypes[type];
  assert.ok(t.role === 'fx');
  return t.createProcessor(ctx);
}

test('tremolo: dips in time with the beat', () => {
  const ctx = fxCtx('tremolo', { rate: 0.5, depth: 1 }); // a quarter-note cycle
  const p = processor('tremolo', ctx);
  const n = Math.round(PPQ / TPS); // one beat
  const buf = new Float64Array(n).fill(1);
  p.mono!(buf, n, 1);
  assert.ok(buf[0] < 0.01, 'quiet on the beat');
  assert.ok(Math.abs(buf[Math.floor(n / 2)] - 1) < 0.01, 'full between beats');
});

test('lo-fi: output sits on the bit grid and holds for the rate', () => {
  const p = processor('lofi', fxCtx('lofi', { bits: 1, rate: 0.5 }));
  const buf = new Float64Array(256);
  for (let i = 0; i < 256; i++) buf[i] = Math.sin(i / 7) * 0.8;
  p.mono!(buf, 256, 1);
  const q = 2 ** (16 - 13 - 1);
  for (const v of buf) assert.ok(Math.abs(v * q - Math.round(v * q)) < 1e-9, `${v} off the grid`);
  assert.equal(buf[0], buf[1]);
});

test('resonator: rings on after the input stops', () => {
  const p = processor('resonator', fxCtx('resonator', { decay: 0.6, mix: 1 }));
  const buf = new Float64Array(128);
  buf[0] = 1;
  p.mono!(buf, 128, 1);
  let tail = 0;
  for (let b = 0; b < 100; b++) {
    buf.fill(0);
    p.mono!(buf, 128, 1);
    if (b > 90) for (const v of buf) tail += v * v;
  }
  assert.ok(tail > 1e-6, `tail energy ${tail}`);
});

test('freeze: holds the sound after it stops', () => {
  const p = processor('freeze', fxCtx('freeze'));
  const l = new Float64Array(128);
  const r = new Float64Array(128);
  let tail = 0;
  for (let b = 0; b < 1500; b++) {
    for (let i = 0; i < 128; i++) l[i] = r[i] = b < 300 ? Math.sin((b * 128 + i) / 9) * 0.5 : 0;
    p.stereo!(l, r, 128);
    for (let i = 0; i < 128; i++) {
      assert.ok(Number.isFinite(l[i]) && Math.abs(l[i]) < 2);
      if (b > 1300) tail += l[i] * l[i];
    }
  }
  assert.ok(tail > 1e-3, `tail energy ${tail} (3 s after the input stopped)`);
});

// ---------- sounds ----------

for (const [i, m] of MACRO_MODELS.entries()) {
  test(`macro model "${m}" renders at low, middle and high notes`, () => {
    for (const note of [36, 60, 84]) {
      const s: SoundObj = { id: 's', kind: 'sound', type: 'macro', x: 0, y: 0, size: 48, layer: 5, note, params: { ...defaultParams(soundTypes.macro), model: i } };
      const r = renderOffline(patch([field('pulse', 0, 0, { hits: 0.5 }, { r: 200 }), s]), 3);
      let peak = 0;
      let energy = 0;
      for (const v of r.left) {
        assert.ok(Number.isFinite(v));
        peak = Math.max(peak, Math.abs(v));
        energy += v * v;
      }
      assert.ok(peak < 1, `${m} @${note}: peak ${peak}`);
      assert.ok(energy / r.left.length > 1e-6, `${m} @${note}: silent`);
    }
  });
}

test('bass: one voice, so notes glide rather than stack', () => {
  const s: SoundObj = { id: 'b', kind: 'sound', type: 'bass', x: 0, y: 0, size: 48, layer: 5, params: { ...defaultParams(soundTypes.bass), glide: 0.2 } };
  const e = new Engine(patch([field('drift', 0, 0, { rate: 1, entropy: 1 }, { r: 200 }), s]));
  const L = new Float32Array(128);
  const R = new Float32Array(128);
  let peakVoices = 0;
  for (let i = 0; i < 4 * SR; i += 128) {
    e.process(L, R, 128);
    peakVoices = Math.max(peakVoices, e.activeVoiceCount);
  }
  assert.equal(peakVoices, 1);
});
