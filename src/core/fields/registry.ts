// The one place field types are registered. Adding a type = one file + one line here.

import type { FieldType } from '../types.ts';
import { drift, grid, pulse } from './generators.ts';
import { arp } from './arp.ts';
import { rain } from './rain.ts';
import { strum } from './strum.ts';
import { harmony } from './harmony.ts';
import { humanise } from './humanise.ts';
import { chorus } from './chorus.ts';
import { shimmer } from './shimmer.ts';
import { tape } from './tape.ts';
import { everyNth, probability, quantise, ratchet, transpose } from './transformers.ts';
import { delay, filter, reverb } from './fx.ts';

export const fieldTypes: Record<string, FieldType> = {};

for (const t of [
  pulse, drift, arp, rain, strum, grid,
  probability, transpose, quantise, harmony, humanise, ratchet, everyNth,
  filter, tape, delay, chorus, reverb, shimmer,
])
  fieldTypes[t.id] = t;

export function defaultHandles(t: FieldType): Record<string, number> {
  const h: Record<string, number> = {};
  for (const s of t.handles) h[s.key] = s.default;
  return h;
}
