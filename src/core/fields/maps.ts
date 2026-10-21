// Map fields: shapes whose axes map position to placement targets (pitch, pan,
// level, ripple reach/angle/spread, or a sound param). The engine reads them
// through placement.ts; they have no scheduling or audio hooks. Each `locate`
// writes [offset from the axis centre, half length] per axis, so placement's
// axisValue turns it into min..max.

import type { MapType } from '../types.ts';
import { angleTurns } from '../geometry.ts';

/** Rectangle: x left → right, y bottom → top. */
export const xy: MapType = {
  id: 'xy',
  label: 'xy',
  role: 'map',
  shape: 'rect',
  glyph: '⊹',
  handles: [],
  defaultShape: { w: 800, h: 480 },
  axes: [
    { key: 'x', label: 'x ↔', lo: 'left', hi: 'right' },
    { key: 'y', label: 'y ↕', lo: 'bottom', hi: 'top' },
  ],
  defaultAxes: {
    x: { to: 'pan', min: -1, max: 1 },
    y: { to: 'pitch', min: 48, max: 84 },
  },
  locate(w, h, dx, dy, out) {
    const hw = w / 2;
    const hh = h / 2;
    if ((dx < 0 ? -dx : dx) > hw || (dy < 0 ? -dy : dy) > hh) return false;
    out[0] = dx;
    out[1] = hw;
    out[2] = dy;
    out[3] = hh;
    return true;
  },
};

/** Circle with one axis from the centre out to the edge: a spotlight. */
export const radial: MapType = {
  id: 'radial',
  label: 'radial',
  role: 'map',
  shape: 'circle',
  glyph: '◎',
  handles: [],
  defaultShape: { r: 240 },
  axes: [{ key: 'r', label: 'r ⟷', lo: 'centre', hi: 'edge' }],
  defaultAxes: { r: { to: 'level', min: 0, max: -24 } },
  locate(w, _h, dx, dy, out) {
    const R = w / 2;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > R) return false;
    out[0] = d - R / 2;
    out[1] = R / 2;
    return true;
  },
};

/** Circle with one axis going round clockwise from straight up: pairs with orbit motion. */
export const sweep: MapType = {
  id: 'sweep',
  label: 'sweep',
  role: 'map',
  shape: 'circle',
  glyph: '↻',
  handles: [],
  defaultShape: { r: 240 },
  axes: [{ key: 't', label: 'around ↻', lo: 'from', hi: 'to' }],
  defaultAxes: { t: { to: 'pitch', min: 48, max: 72 } },
  locate(w, _h, dx, dy, out) {
    const R = w / 2;
    if (dx * dx + dy * dy > R * R) return false;
    out[0] = angleTurns(0, 0, dx, dy) - 0.5;
    out[1] = 0.5;
    return true;
  },
};

const S3 = Math.sqrt(3) / 2;

/**
 * Equilateral triangle, one corner straight up, then clockwise. Each axis runs
 * from the opposite edge (min) to its own corner (max): barycentric weights, so
 * the three always blend.
 */
export const tri: MapType = {
  id: 'tri',
  label: 'tri',
  role: 'map',
  shape: 'triangle',
  glyph: '△',
  handles: [],
  defaultShape: { r: 260 },
  axes: [
    { key: 'a', label: 'a ↑', lo: 'edge', hi: 'corner' },
    { key: 'b', label: 'b ↘', lo: 'edge', hi: 'corner' },
    { key: 'c', label: 'c ↙', lo: 'edge', hi: 'corner' },
  ],
  defaultAxes: {
    a: { to: 'pitch', min: 48, max: 84 },
    b: { to: 'pan', min: 0, max: 1 },
    c: { to: 'reach', min: 0, max: 12 },
  },
  locate(w, _h, dx, dy, out) {
    const R = w / 2;
    if (R <= 0) return false;
    const k = 2 / (3 * R * R);
    // weight of corner i: 1/3 + 2 (p · v_i) / 3R², v_0 = (0, R), v_1 = (R√3/2, -R/2), v_2 = (-R√3/2, -R/2)
    const wa = 1 / 3 + k * (dy * R);
    const wb = 1 / 3 + k * (dx * R * S3 - (dy * R) / 2);
    const wc = 1 - wa - wb;
    if (wa < 0 || wb < 0 || wc < 0) return false;
    out[0] = wa - 0.5;
    out[1] = 0.5;
    out[2] = wb - 0.5;
    out[3] = 0.5;
    out[4] = wc - 0.5;
    out[5] = 0.5;
    return true;
  },
};

/** Corner i of a triangle map with circumradius R, relative to its centre (y up). */
export function triCorner(i: number, R: number): [number, number] {
  return i === 0 ? [0, R] : i === 1 ? [R * S3, -R / 2] : [-R * S3, -R / 2];
}
