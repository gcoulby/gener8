// Re-render a capture from its JSON (root patch + edit log) and optionally
// verify it against the captured WAV, bit for bit.
//
//   node scripts/render-capture.ts capture.json [capture.wav] [out.wav]

import { readFileSync } from 'node:fs';
import { readWav, writeWav } from './wavfile.ts';
import { Engine } from '../src/core/engine.ts';
import { SR } from '../src/core/constants.ts';

const [jsonPath, wavPath, outPath] = process.argv.slice(2);
if (!jsonPath) {
  console.error('usage: node scripts/render-capture.ts capture.json [capture.wav] [out.wav]');
  process.exit(2);
}
const cap = JSON.parse(readFileSync(jsonPath, 'utf8'));
const { startSample, endSample } = cap.window;
const engine = new Engine(cap.replay.root);
engine.recordEvents = false;
engine.schedule(cap.replay.edits);

const chunk = 4096;
const skipL = new Float32Array(chunk);
const skipR = new Float32Array(chunk);
for (let i = 0; i < startSample; i += chunk) engine.process(skipL, skipR, Math.min(chunk, startSample - i));
const n = endSample - startSample;
const left = new Float32Array(n);
const right = new Float32Array(n);
for (let i = 0; i < n; i += chunk) engine.process(left, right, Math.min(chunk, n - i), i);

if (wavPath) {
  const [wl, wr] = readWav(wavPath);
  let diff = 0;
  let first = -1;
  for (let i = 0; i < Math.min(n, wl.length); i++) {
    if (wl[i] !== left[i] || wr[i] !== right[i]) {
      diff++;
      if (first < 0) first = i;
    }
  }
  const ok = diff === 0 && wl.length === n;
  console.log(
    ok
      ? `bit-identical: ${n} frames (${(n / SR).toFixed(2)} s) match`
      : `MISMATCH: ${diff} differing frames, first at ${first}; lengths ${wl.length} vs ${n}`,
  );
  if (!ok) process.exitCode = 1;
}

if (outPath) {
  writeWav(outPath, left, right, SR);
  console.log(`wrote ${outPath}`);
}
