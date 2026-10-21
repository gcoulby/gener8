// Regenerate test/generator-golden.json. Version 1 is frozen: only run this
// when adding a new generator version, never to paper over a change to v1.

import { writeFileSync } from 'node:fs';
import { generatorHashes } from '../test/util.ts';

const out = generatorHashes();
writeFileSync(new URL('../test/generator-golden.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(out);
