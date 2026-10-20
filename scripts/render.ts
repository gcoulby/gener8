// Offline render of a patch to WAV.
//
//   node scripts/render.ts patches/demo.json 30 out.wav

import { readFileSync } from 'node:fs';
import { renderOffline } from '../src/core/render.ts';
import { SR } from '../src/core/constants.ts';
import { writeWav } from './wavfile.ts';

const [patchPath, secs = '30', out = 'render.wav'] = process.argv.slice(2);
if (!patchPath) {
  console.error('usage: node scripts/render.ts patch.json [seconds] [out.wav]');
  process.exit(2);
}
const seconds = Number(secs);
const t = performance.now();
const r = renderOffline(JSON.parse(readFileSync(patchPath, 'utf8')), seconds);
const ms = performance.now() - t;
writeWav(out, r.left, r.right, SR);
console.log(`${seconds}s in ${(ms / 1000).toFixed(2)}s (${(ms / 1000 / seconds).toFixed(3)}× real time) → ${out}`);
