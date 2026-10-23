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

/** Turns of the spiral map, one per octave by default. */
export const SPIRAL_TURNS = 3;

/**
 * Position along the spiral (0 at the centre, SPIRAL_TURNS at the edge) of
 * the arm nearest (dx, dy): the angle picks the place within a turn, the
 * distance which turn.
 */
export function spiralU(R: number, dx: number, dy: number): number {
  const a = angleTurns(0, 0, dx, dy);
  const d = Math.sqrt(dx * dx + dy * dy) / R;
  const u = a + Math.round(d * SPIRAL_TURNS - a);
  return u < 0 ? 0 : u > SPIRAL_TURNS ? SPIRAL_TURNS : u;
}

/**
 * Circle with one axis wound outwards from the centre: a pitch helix seen from
 * above. Going round changes the note within an octave, stepping out to the
 * next arm goes up an octave, so the same angle is the same pitch class.
 */
export const spiral: MapType = {
  id: 'spiral',
  label: 'spiral',
  role: 'map',
  shape: 'circle',
  glyph: '@',
  handles: [],
  defaultShape: { r: 240 },
  axes: [{ key: 't', label: 'along ꩜', lo: 'centre', hi: 'edge' }],
  defaultAxes: { t: { to: 'pitch', min: 48, max: 84 } },
  locate(w, _h, dx, dy, out) {
    const R = w / 2;
    if (R <= 0 || dx * dx + dy * dy > R * R) return false;
    out[0] = spiralU(R, dx, dy) - SPIRAL_TURNS / 2;
    out[1] = SPIRAL_TURNS / 2;
    return true;
  },
};

/** Hex cells across a tonnetz map's width. */
export const TONNETZ_CELLS = 7;

/**
 * Nearest hex cell to (dx, dy) on a lattice of size s, in axial coordinates
 * [q, r]: q runs right, r up and to the right at 60°.
 */
export function hexCell(s: number, dx: number, dy: number, out: number[]): void {
  const rf = dy / (s * S3);
  const qf = dx / s - rf / 2;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const t = Math.round(sf);
  const eq = Math.abs(q - qf);
  const er = Math.abs(r - rf);
  const es = Math.abs(t - sf);
  if (eq > er && eq > es) q = -r - t;
  else if (er > es) r = -q - t;
  out[0] = q;
  out[1] = r;
}

/** Semitones from the centre cell: fifths along q, major thirds along r, folded into ±6. */
export function tonnetzStep(q: number, r: number): number {
  const n = 7 * q + 4 * r;
  return ((((n + 6) % 12) + 12) % 12) - 6;
}

const cell = [0, 0];

/**
 * Rectangle tiled with the tonnetz, Euler's map of harmony: each hex is a
 * pitch class, its neighbours a fifth to the right, a major third up-right and
 * a minor third up-left. Triangles of neighbours are triads, so sounds near
 * each other play in harmony. The axis maps the cell's offset from the centre
 * (−6 to +6 semitones).
 */
export const tonnetz: MapType = {
  id: 'tonnetz',
  label: 'tonnetz',
  role: 'map',
  shape: 'rect',
  glyph: '⬡',
  handles: [],
  defaultShape: { w: 640, h: 440 },
  axes: [{ key: 'n', label: 'cell', lo: '−6', hi: '+6' }],
  defaultAxes: { n: { to: 'pitch', min: 54, max: 66 } },
  locate(w, h, dx, dy, out) {
    if ((dx < 0 ? -dx : dx) > w / 2 || (dy < 0 ? -dy : dy) > h / 2) return false;
    hexCell(w / TONNETZ_CELLS, dx, dy, cell);
    out[0] = tonnetzStep(cell[0], cell[1]);
    out[1] = 6;
    return true;
  },
};

/** MIDI controller number a cc map listens to. */
export function ccNumber(h: Record<string, number>): number {
  return Math.round((h.cc ?? 74 / 127) * 127);
}

/**
 * A zone wired to one knob: every sound inside gets the same value on its
 * axis, set by the `value` handle. Incoming MIDI CC on the chosen controller
 * moves that handle; without MIDI it is a macro fader to drag by hand.
 */
export const cc: MapType = {
  id: 'cc',
  label: 'midi cc',
  role: 'map',
  shape: 'rect',
  glyph: '⧉',
  handles: [
    { key: 'cc', label: 'cc', default: 74 / 127, format: (_v, h) => `CC ${ccNumber(h)}` },
    { key: 'value', label: 'value', default: 0.5, format: (v) => String(Math.round(v * 127)) },
  ],
  defaultShape: { w: 400, h: 300 },
  axes: [{ key: 'v', label: 'value', lo: '0', hi: '127' }],
  defaultAxes: { v: { to: 'level', min: -24, max: 0 } },
  locate(w, h, dx, dy, out, handles) {
    if ((dx < 0 ? -dx : dx) > w / 2 || (dy < 0 ? -dy : dy) > h / 2) return false;
    out[0] = (handles?.value ?? 0.5) - 0.5;
    out[1] = 0.5;
    return true;
  },
};
