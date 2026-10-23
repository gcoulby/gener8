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
import plinkoPatch from '../../patches/plinko.json' with { type: 'json' };
import turingPatch from '../../patches/turing.json' with { type: 'json' };
import progressionPatch from '../../patches/progression.json' with { type: 'json' };
import breaksPatch from '../../patches/breaks.json' with { type: 'json' };
import clocksPatch from '../../patches/clocks.json' with { type: 'json' };
import bellsPatch from '../../patches/bells.json' with { type: 'json' };
import murmurationPatch from '../../patches/murmuration.json' with { type: 'json' };
import pendulumPatch from '../../patches/pendulum.json' with { type: 'json' };
import growthPatch from '../../patches/growth.json' with { type: 'json' };
import endlessPatch from '../../patches/endless.json' with { type: 'json' };
import midiPatch from '../../patches/midi.json' with { type: 'json' };

/** Bundled patches, in menu order; `key` is an optional shift-shortcut. */
export const EXAMPLES: { id: string; label: string; key?: string; patch: unknown }[] = [
  { id: 'ambient', label: 'ambient', key: 'D', patch: demoPatch },
  { id: 'tape', label: 'tape', key: 'T', patch: tapePatch },
  { id: 'loops', label: 'loops (airports)', patch: loopsPatch },
  { id: 'rainfall', label: 'rainfall', patch: rainfallPatch },
  { id: 'bloom', label: 'bloom', patch: bloomPatch },
  { id: 'choir', label: 'choir (motion)', patch: choirPatch },
  { id: 'cells', label: 'cells (automaton)', patch: cellsPatch },
  { id: 'plinko', label: 'plinko', patch: plinkoPatch },
  { id: 'turing', label: 'turing machine', patch: turingPatch },
  { id: 'progression', label: 'progression (chords)', patch: progressionPatch },
  { id: 'breaks', label: 'breaks (topo)', patch: breaksPatch },
  { id: 'clocks', label: 'clocks (polyrhythm)', patch: clocksPatch },
  { id: 'bells', label: 'bells (change ringing)', patch: bellsPatch },
  { id: 'murmuration', label: 'murmuration (flock)', patch: murmurationPatch },
  { id: 'pendulum', label: 'pendulum (bowed)', patch: pendulumPatch },
  { id: 'growth', label: 'growth (L-system)', patch: growthPatch },
  { id: 'endless', label: 'endless (spiral)', patch: endlessPatch },
  { id: 'midi', label: 'midi rig', patch: midiPatch },
  { id: 'rhythmic', label: 'rhythmic', key: 'R', patch: rhythmicPatch },
  { id: 'stress', label: 'stress 24×12', key: 'X', patch: stressPatch },
];

