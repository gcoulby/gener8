import type { Role } from '../core/types.ts';

export const BG = '#0b0b0e';
export const INK = '#e9e4da';
export const DIM = 'rgba(233,228,218,0.35)';
export const FAINT = 'rgba(233,228,218,0.08)';

/** Colour encodes role. */
export const ROLE_RGB: Record<Role | 'sound', [number, number, number]> = {
  sound: [243, 233, 216],
  generator: [240, 168, 48],
  transformer: [60, 200, 180],
  fx: [154, 124, 240],
};

export function rgba(role: Role | 'sound', a: number): string {
  const [r, g, b] = ROLE_RGB[role];
  return `rgba(${r},${g},${b},${a})`;
}

export const FONT = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
export const FONT_SMALL = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
