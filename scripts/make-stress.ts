// Builds patches/stress-24x12.json: 24 sounds and 12 fields, all active, with
// motion and ripples. Deterministic: rerunning produces the same file.

import { writeFileSync } from 'node:fs';
import type { FieldObj, Patch, SoundObj } from '../src/core/types.ts';
import { soundTypes, defaultParams } from '../src/core/sounds/registry.ts';
import { fieldTypes, defaultHandles } from '../src/core/fields/registry.ts';
import { rand } from '../src/core/rand.ts';

const objects: (SoundObj | FieldObj)[] = [];
let layer = 0;

function field(type: string, x: number, y: number, shape: FieldObj['shape'], handles: Record<string, number> = {}, motion?: FieldObj['motion']) {
  const t = fieldTypes[type];
  objects.push({ id: `f${objects.length + 1}`, kind: 'field', type, x, y, shape, layer: layer++, handles: { ...defaultHandles(t), ...handles }, ...(motion ? { motion } : {}) });
}

function sound(type: string, x: number, y: number, size: number, motion?: SoundObj['motion']) {
  objects.push({ id: `s${objects.length + 1}`, kind: 'sound', type, x, y, size, layer: layer++, params: defaultParams(soundTypes[type]), ...(motion ? { motion } : {}) });
}

// 12 fields
field('reverb', -350, 0, { r: 400 }, { size: 0.7 });
field('reverb', 350, 0, { r: 400 }, { size: 0.4 });
field('pulse', -450, -80, { r: 200 }, { hits: 0.4 });
field('pulse', -150, 150, { r: 180 }, { hits: 0.6, length: 0.5 });
field('pulse', 150, -200, { r: 200 }, { hits: 0.25 });
field('drift', 450, 120, { r: 200 }, { rate: 0.6, entropy: 0.5 });
field('grid', 0, 0, { w: 300, h: 220 }, { rate: 0.66, entropy: 0.5 });
field('ratchet', -450, -80, { r: 120 }, {}, { breathe: { amount: 0.5, periodBeats: 8 } });
field('probability', -150, 150, { r: 120 }, { bias: 0.4 });
field('transpose', 450, 120, { r: 90 }, {});
field('filter', 0, 0, { r: 150 }, { cutoff: 0.3, res: 0.6 }, { pos: { type: 'orbit', radius: 250, periodBeats: 16, phase: 0 } });
field('delay', 150, -200, { r: 220 }, { feedback: 0.6 });

// 24 sounds: positions inside the generators plus a few free listeners
const types = ['subtractive', 'subtractive', 'percussion', 'pluck', 'subtractive', 'pad', 'drone', 'subtractive'];
const centres: [number, number, number][] = [
  [-450, -80, 170],
  [-150, 150, 150],
  [150, -200, 170],
  [450, 120, 170],
  [0, 0, 100],
];
for (let i = 0; i < 24; i++) {
  const type = types[i % types.length];
  let x: number;
  let y: number;
  if (i >= 20) {
    x = -600 + (i - 20) * 400;
    y = 330 - (i % 2) * 660;
  } else {
    const [cx, cy, r] = centres[i % centres.length];
    const a = rand(7, 7, 1, i) * Math.PI * 2;
    const d = rand(7, 7, 2, i) * r;
    x = Math.round(cx + Math.cos(a) * d);
    y = Math.round(cy + Math.sin(a) * d);
  }
  const motion: SoundObj['motion'] =
    i % 5 === 0 ? { pos: { type: 'orbit', radius: 40, periodBeats: 8 + i, phase: 0 } } : i % 7 === 0 ? { pos: { type: 'drift', amplitude: 60, rateBeats: 8 } } : undefined;
  sound(type, x, y, 40 + (i % 4) * 8, motion);
}

const patch: Patch = {
  format: 'gener8.patch',
  version: 1,
  seed: 424242,
  tempo: 128,
  key: { root: 2, scale: 'dorian' },
  objects,
};

const s = objects.filter((o) => o.kind === 'sound').length;
const f = objects.filter((o) => o.kind === 'field').length;
if (s !== 24 || f !== 12) throw new Error(`expected 24×12, got ${s}×${f}`);
writeFileSync(new URL('../patches/stress-24x12.json', import.meta.url), JSON.stringify(patch, null, 2) + '\n');
console.log(`wrote patches/stress-24x12.json (${s} sounds, ${f} fields)`);
