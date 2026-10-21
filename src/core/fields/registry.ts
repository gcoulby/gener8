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
import { delay, filter, reverb } from './fx.ts';
import { radial, sweep, tri, xy } from './maps.ts';
import { bounce, phase, poly, wave } from './rhythms.ts';
import { chords, topo, turing } from './sequencers.ts';
import { plinko } from './plinko.ts';
import { canon, mirror } from './canon.ts';
import { freeze, lofi, resonator, tremolo } from './texture.ts';

export const fieldTypes: Record<string, FieldType> = {};

for (const t of [
  pulse, drift, arp, rain, strum, grid, phase, chords, turing, topo, plinko, wave, bounce, poly,
  probability, transpose, quantise, harmony, humanise, hold, ratchet, everyNth, canon, mirror,
  filter, tape, delay, chorus, reverb, shimmer, resonator, freeze, tremolo, lofi,
  xy, radial, sweep, tri,
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
