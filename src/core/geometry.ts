import type { FieldShape } from './types.ts';
import { atan2, TAU } from './dspmath.ts';

export function isCircle(s: FieldShape): s is { r: number } {
  return (s as { r?: number }).r !== undefined;
}

export function shapeDims(s: FieldShape, scale: number): { w: number; h: number } {
  if (isCircle(s)) return { w: 2 * s.r * scale, h: 2 * s.r * scale };
  return { w: s.w * scale, h: s.h * scale };
}

/**
 * Depth of point (px, py) inside a field centred at (cx, cy): 0 at the edge,
 * 1 at the centre, ≤ 0 outside. Linear in inward distance / inradius.
 */
export function depthAt(s: FieldShape, cx: number, cy: number, scale: number, px: number, py: number): number {
  const dx = px - cx;
  const dy = py - cy;
  if (isCircle(s)) {
    const r = s.r * scale;
    if (r <= 0) return 0;
    return 1 - Math.sqrt(dx * dx + dy * dy) / r;
  }
  const hw = (s.w * scale) / 2;
  const hh = (s.h * scale) / 2;
  const ex = hw - (dx < 0 ? -dx : dx);
  const ey = hh - (dy < 0 ? -dy : dy);
  const inr = hw < hh ? hw : hh;
  if (inr <= 0) return 0;
  return (ex < ey ? ex : ey) / inr;
}

/** Angle of (px, py) around (cx, cy) in turns, clockwise from straight up (y up). */
export function angleTurns(cx: number, cy: number, px: number, py: number): number {
  const a = atan2(px - cx, py - cy) / TAU;
  return a < 0 ? a + 1 : a;
}
