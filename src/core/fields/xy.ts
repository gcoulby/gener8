// XY field: a rectangle whose x and y axes map position to placement targets
// (pitch, pan, level, ripple reach/angle/spread, or a sound param). The engine
// reads it through placement.ts; it has no scheduling or audio hooks.

import type { MapType } from '../types.ts';
import { DEFAULT_AXES } from '../placement.ts';

export const xy: MapType = {
  id: 'xy',
  label: 'xy',
  role: 'map',
  shape: 'rect',
  glyph: '⊹',
  handles: [],
  defaultShape: { w: 800, h: 480 },
  defaultAxes: DEFAULT_AXES,
};
