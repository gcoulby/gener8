// The one place field types are registered. Adding a type = one file + one line here.

import type { FieldObj, FieldType, MapType, PatchObject } from '../types.ts';
import { drift, grid, pulse } from './generators.ts';
import { arp } from './arp.ts';
import { rain } from './rain.ts';
import { strum } from './strum.ts';
import { harmony } from './harmony.ts';
import { humanise } from './humanise.ts';
import { hold } from './hold.ts';
import { chorus } from './chorus.ts';
import { shimmer } from './shimmer.ts';
import { tape } from './tape.ts';
import { everyNth, probability, quantise, ratchet, transpose } from './transformers.ts';
import { delay, filter, reverb, spring } from './fx.ts';
import { cc, radial, spiral, sweep, tonnetz, tri, xy } from './maps.ts';
import { bounce, phase, poly, wave } from './rhythms.ts';
import { chords, topo, turing } from './sequencers.ts';
import { plinko } from './plinko.ts';
import { midi, sequencer } from './input.ts';
import { automaton, bells, lsystem } from './systems.ts';
import { flock, pendulum } from './physics.ts';
import { canon, echo, mirror, retrograde } from './canon.ts';
import { accent, swing, throttle } from './groove.ts';
import { glide, scatter, smooth } from './contour.ts';
import { beatRepeat, drive, flanger, octaver, phaser, ringmod, wax } from './colour.ts';
import { freeze, lofi, resonator, tremolo } from './texture.ts';

export const fieldTypes: Record<string, FieldType> = {};

for (const t of [
  pulse, drift, arp, rain, strum, grid, phase, chords, turing, topo, plinko, wave, bounce, poly,
  sequencer, lsystem, bells, automaton, pendulum, flock, midi,
  probability, transpose, quantise, harmony, humanise, hold, ratchet, everyNth, canon, mirror,
  swing, accent, throttle, scatter, smooth, glide, echo, retrograde,
  filter, tape, delay, chorus, reverb, shimmer, resonator, freeze, tremolo, lofi,
  drive, wax, phaser, flanger, ringmod, octaver, spring, beatRepeat,
  xy, radial, sweep, tri, spiral, tonnetz, cc,
])
  fieldTypes[t.id] = t;

export function defaultHandles(t: FieldType): Record<string, number> {
  const h: Record<string, number> = {};
  for (const s of t.handles) h[s.key] = s.default;
  return h;
}

export function isMap(o: PatchObject): o is FieldObj {
  return o.kind === 'field' && fieldTypes[o.type]?.role === 'map';
}

export function mapTypeOf(o: PatchObject): MapType | null {
  const t = o.kind === 'field' ? fieldTypes[o.type] : undefined;
  return t?.role === 'map' ? t : null;
}
