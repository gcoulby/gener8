// Bundled patches. Imported with JSON attributes so Node tests can load this too.

import demoPatch from '../../patches/demo.json' with { type: 'json' };
import stressPatch from '../../patches/stress-24x12.json' with { type: 'json' };
import rhythmicPatch from '../../patches/rhythmic.json' with { type: 'json' };
import tapePatch from '../../patches/tape.json' with { type: 'json' };
import loopsPatch from '../../patches/loops.json' with { type: 'json' };
import rainfallPatch from '../../patches/rainfall.json' with { type: 'json' };
import cellsPatch from '../../patches/cells.json' with { type: 'json' };
import choirPatch from '../../patches/choir.json' with { type: 'json' };
import bloomPatch from '../../patches/bloom.json' with { type: 'json' };

/** Bundled patches, in menu order; `key` is an optional shift-shortcut. */
export const EXAMPLES: { id: string; label: string; key?: string; patch: unknown }[] = [
  { id: 'ambient', label: 'ambient', key: 'D', patch: demoPatch },
  { id: 'tape', label: 'tape', key: 'T', patch: tapePatch },
  { id: 'loops', label: 'loops (airports)', patch: loopsPatch },
  { id: 'rainfall', label: 'rainfall', patch: rainfallPatch },
  { id: 'bloom', label: 'bloom', patch: bloomPatch },
  { id: 'choir', label: 'choir (motion)', patch: choirPatch },
  { id: 'cells', label: 'cells (automaton)', patch: cellsPatch },
  { id: 'rhythmic', label: 'rhythmic', key: 'R', patch: rhythmicPatch },
  { id: 'stress', label: 'stress 24×12', key: 'X', patch: stressPatch },
];

