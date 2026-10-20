// The one place field types are registered. Adding a type = one file + one line here.

import type { FieldType } from '../types.ts';
import { drift, grid, pulse } from './generators.ts';
import { arp } from './arp.ts';
import { everyNth, probability, quantise, ratchet, transpose } from './transformers.ts';
import { delay, filter, reverb } from './fx.ts';

export const fieldTypes: Record<string, FieldType> = {};

for (const t of [pulse, drift, arp, grid, probability, transpose, quantise, ratchet, everyNth, filter, delay, reverb])
  fieldTypes[t.id] = t;

export function defaultHandles(t: FieldType): Record<string, number> {
  const h: Record<string, number> = {};
  for (const s of t.handles) h[s.key] = s.default;
  return h;
}
