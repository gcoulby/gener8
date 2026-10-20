// The one place sound types are registered. Adding a type = one file + one line here.

import type { SoundType } from '../types.ts';
import { subtractive } from './subtractive.ts';
import { percussion } from './percussion.ts';
import { pluck } from './pluck.ts';
import { drone } from './drone.ts';
import { pad } from './pad.ts';

export const soundTypes: Record<string, SoundType> = {};

for (const t of [subtractive, percussion, pluck, drone, pad]) soundTypes[t.id] = t;

export function defaultParams(t: SoundType): Record<string, number> {
  const p: Record<string, number> = {};
  for (const s of t.params) p[s.key] = s.default;
  return p;
}
