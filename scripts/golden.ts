// Regenerate test/golden.json. Run deliberately after an intended DSP change.

import { writeFileSync } from 'node:fs';
import { renderOffline } from '../src/core/render.ts';
import { hashAudio, loadPatch } from '../test/util.ts';

const demo = renderOffline(loadPatch('demo'), 60);
const stress = renderOffline(loadPatch('stress-24x12'), 10);
const out = {
  demo60: hashAudio(demo.left, demo.right),
  stress10: hashAudio(stress.left, stress.right),
};
writeFileSync(new URL('../test/golden.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(out);
