// Offline render of a patch to WAV.
//
//   node scripts/render.ts patches/demo.json 30 out.wav
//   node scripts/render.ts patches/demo.json 3600 out.wav --fade 3       (3 s in and out)
//   node scripts/render.ts patches/demo.json 3600 out.wav --fade 2,30    (2 s in, 30 s out)

import { readFileSync } from 'node:fs';
import { renderOffline, type Fade } from '../src/core/render.ts';
import { SR } from '../src/core/constants.ts';
import { writeWav } from './wavfile.ts';

const args = process.argv.slice(2);
let fade: Fade | undefined;
const fi = args.indexOf('--fade');
if (fi >= 0) {
  const [a, b = a] = (args.splice(fi, 2)[1] ?? '').split(',').map(Number);
  if (!(a >= 0 && b >= 0)) {
    console.error('--fade takes seconds: --fade 3 or --fade 2,30');
    process.exit(2);
  }
  fade = { in: a, out: b };
}
const [patchPath, secs = '30', out = 'render.wav'] = args;
if (!patchPath) {
  console.error('usage: node scripts/render.ts patch.json [seconds] [out.wav] [--fade in[,out]]');
  process.exit(2);
}
const seconds = Number(secs);
const t = performance.now();
const r = renderOffline(JSON.parse(readFileSync(patchPath, 'utf8')), seconds, { fade });
const ms = performance.now() - t;
writeWav(out, r.left, r.right, SR);
console.log(`${seconds}s in ${(ms / 1000).toFixed(2)}s (${(ms / 1000 / seconds).toFixed(3)}× real time) → ${out}`);
