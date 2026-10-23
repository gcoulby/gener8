// Motion is closed-form in beats: no integration state, so it is scrubbable,
// deterministic and tempo-synced. Offsets are relative to the object's home x, y.
// An object that follows another adds its leader's motion offset and breathing.

import type { Breathe, Ease, PatchObject, PosMotion, Vec2 } from './types.ts';
import { cosTurns, exp, exp2, sinTurns } from './dspmath.ts';
import { fbm, rand, strHash } from './rand.ts';

export interface Pose {
  x: number;
  y: number;
  scale: number;
  /** Rotation in turns, clockwise. */
  angle: number;
  /** Stretch on the object's own x and y, on top of scale. */
  sx: number;
  sy: number;
}

export function newPose(x = 0, y = 0): Pose {
  return { x, y, scale: 1, angle: 0, sx: 1, sy: 1 };
}

/** Maps u in [0, 1] to [0, 1] with the given ease. */
export function ease(e: Ease | undefined, u: number): number {
  if (e === 'smooth') return u * u * (3 - 2 * u);
  if (e === 'elastic') return u >= 1 ? 1 : 1 + exp2(-10 * u) * sinTurns((u * 10 - 0.75) / 3);
  return u;
}

/** Lissajous ratios offered in the UI, as [a, b]. */
export const LISSAJOUS_RATIOS: [number, number][] = [[1, 2], [2, 3], [3, 4], [1, 3], [3, 5], [4, 5]];

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function pathPoint(pts: Vec2[], u: number, closed: boolean, out: Pose, dwell = 0, e?: Ease): void {
  const n = pts.length;
  if (n === 0) return;
  if (n === 1) {
    out.x += pts[0][0];
    out.y += pts[0][1];
    return;
  }
  const segs = closed ? n : n - 1;
  const f = u * segs;
  let i = Math.floor(f);
  if (i >= segs) i = segs - 1;
  let t = f - i;
  // wait at the segment's start point, then travel the rest of it
  if (dwell > 0) t = t < dwell ? 0 : (t - dwell) / (1 - dwell);
  t = ease(e, t);
  const at = (k: number): Vec2 => (closed ? pts[((k % n) + n) % n] : pts[k < 0 ? 0 : k >= n ? n - 1 : k]);
  const a = at(i - 1);
  const b = at(i);
  const c = at(i + 1);
  const d = at(i + 2);
  out.x += catmull(a[0], b[0], c[0], d[0], t);
  out.y += catmull(a[1], b[1], c[1], d[1], t);
}

/** Each bounce reaches this fraction of the previous one's height. */
const BOUNCE_KEEP = 0.45;

/**
 * Height above home at phase u in [0, 1) of a bounce cycle. The first half
 * drops from the height and bounces n times, each lower, until it touches down;
 * the second half is the same in reverse, so it hops back up to the top.
 */
export function bounceHeight(height: number, n: number, u: number): number {
  return bounceDrop(height, n, u < 0.5 ? u * 2 : (1 - u) * 2);
}

/** The drop and ever-lower hops, spread over v in [0, 1]. */
function bounceDrop(height: number, n: number, v: number): number {
  // segment durations go with √height (free fall); the drop is half a hop
  let total = 1;
  let h = 1;
  for (let k = 0; k < n; k++) {
    h *= BOUNCE_KEEP;
    total += 2 * Math.sqrt(h);
  }
  let t = v * total;
  if (t >= total) return 0;
  if (t < 1) return height * (1 - t * t);
  t -= 1;
  h = 1;
  for (let k = 0; k < n; k++) {
    h *= BOUNCE_KEEP;
    const half = Math.sqrt(h);
    if (t < 2 * half) {
      const x = (t - half) / half;
      return height * h * (1 - x * x);
    }
    t -= 2 * half;
  }
  return 0;
}

const MAX_FOLLOW = 8;
const leaderPose: Pose[] = Array.from({ length: MAX_FOLLOW }, () => newPose());

/**
 * pose() plus whatever the object follows: the leader's offset from its home is
 * added, its scale and stretch multiplied in and its rotation added. A lag
 * makes the follower trail its leader by that many beats. `lookup` finds
 * objects by id.
 */
export function followPose(obj: PatchObject, beat: number, seed: number, lookup: (id: string) => PatchObject | undefined, out: Pose, depth = 0): Pose {
  pose(obj, beat, seed, out);
  const leader = obj.follow && depth < MAX_FOLLOW ? lookup(obj.follow) : undefined;
  if (!leader || leader === obj) return out;
  const lp = followPose(leader, beat - (obj.motion?.lag ?? 0), seed, lookup, leaderPose[depth], depth + 1);
  out.x += lp.x - leader.x;
  out.y += lp.y - leader.y;
  out.scale *= lp.scale;
  out.angle += lp.angle;
  out.sx *= lp.sx;
  out.sy *= lp.sy;
  return out;
}

/** Beats in one cycle of a position motion (drift: its rate; hop: one step). */
export function motionBeats(p: PosMotion): number {
  return p.type === 'drift' ? p.rateBeats : p.type === 'hop' ? p.everyBeats : p.periodBeats;
}

/** Fraction of the way through the current cycle, [0, 1). */
function cycle(beat: number, period: number): number {
  const u = beat / Math.max(0.25, period);
  return u - Math.floor(u);
}

/** Up and down once per cycle: 0 → 1 → 0. */
function tri(u: number): number {
  return u < 0.5 ? u * 2 : 2 - u * 2;
}

function breatheWave(b: Breathe, beat: number, seed: number, id: number): number {
  const p = Math.max(0.25, b.periodBeats);
  const u = cycle(beat, p);
  switch (b.shape) {
    case 'tri':
      return tri(u) * 2 - 1;
    case 'ramp':
      return u * 2 - 1;
    case 'square':
      // a short smoothstep at each edge so the size doesn't jump
      return u < 0.5 ? ease('smooth', Math.min(1, u * 20)) * 2 - 1 : 1 - ease('smooth', Math.min(1, (u - 0.5) * 20)) * 2;
    case 'step':
      return rand(seed, id, 53, Math.floor(beat / p)) * 2 - 1;
  }
  return sinTurns(beat / p);
}

/** Adds a position motion's offset from home into out. */
function posOffset(p: PosMotion, obj: PatchObject, beat: number, seed: number, out: Pose): void {
  switch (p.type) {
    case 'orbit': {
      const a = ease(p.ease, cycle(beat, p.periodBeats)) + p.phase;
      out.x += p.radius * sinTurns(a);
      out.y += p.radius * cosTurns(a);
      return;
    }
    case 'path': {
      let u = cycle(beat, p.periodBeats);
      if (p.mode === 'pingpong') u = tri(u);
      pathPoint(p.points, u, p.mode === 'loop', out, p.dwell ?? 0, p.ease);
      return;
    }
    case 'drift': {
      const h = strHash(obj.id);
      const t = beat / Math.max(0.25, p.rateBeats);
      out.x += p.amplitude * fbm(seed, h, 11, t);
      out.y += p.amplitude * fbm(seed, h, 23, t);
      return;
    }
    case 'bounce':
      out.y += bounceHeight(p.height, p.bounces, cycle(beat, p.periodBeats));
      return;
    case 'pendulum': {
      const th = (p.swing / 360) * cosTurns(cycle(beat, p.periodBeats));
      out.x += p.length * sinTurns(th);
      out.y += p.length * (1 - cosTurns(th));
      return;
    }
    case 'lissajous': {
      const u = cycle(beat, p.periodBeats);
      out.x += p.size * sinTurns(p.a * u + 0.25);
      out.y += p.size * sinTurns(p.b * u);
      return;
    }
    case 'spiral': {
      const u = cycle(beat, p.periodBeats);
      const r = p.radius * tri(u);
      out.x += r * sinTurns(p.turns * 2 * u);
      out.y += r * cosTurns(p.turns * 2 * u);
      return;
    }
    case 'rose': {
      const u = cycle(beat, p.periodBeats);
      // odd k draws k petals in half a turn, even k needs 2k: either way one sweep per cycle draws them all
      const k = p.petals % 2 ? p.petals : p.petals / 2;
      const th = p.petals % 2 ? u / 2 : u;
      const r = p.size * cosTurns(k * th);
      out.x += r * sinTurns(th);
      out.y += r * cosTurns(th);
      return;
    }
    case 'spirograph': {
      const u = cycle(beat, p.periodBeats);
      const n = Math.max(2, Math.round(p.lobes));
      const rr = 1 / n; // rolling circle radius, fixed circle radius 1
      const d = p.arm * rr * 2;
      const k = p.radius / (1 - rr + d);
      out.x += k * ((1 - rr) * cosTurns(u) + d * cosTurns(u * (n - 1)));
      out.y += k * ((1 - rr) * sinTurns(u) - d * sinTurns(u * (n - 1)));
      return;
    }
    case 'hop': {
      const h = strHash(obj.id);
      const every = Math.max(0.25, p.everyBeats);
      const step = Math.floor(beat / every);
      const t = beat / every - step;
      const n = Math.max(2, Math.round(p.spots));
      const a = hopSpot(seed, h, n, step - 1);
      const b = hopSpot(seed, h, n, step);
      // glide over the first fifth of each step, then sit
      const g = ease('smooth', t < 0.2 ? t * 5 : 1);
      const ax = p.distance * spotX(seed, h, a);
      const ay = p.distance * spotY(seed, h, a);
      out.x += ax + (p.distance * spotX(seed, h, b) - ax) * g;
      out.y += ay + (p.distance * spotY(seed, h, b) - ay) * g;
      return;
    }
    case 'spring': {
      const period = Math.max(0.25, p.periodBeats);
      const c = Math.floor(beat / period);
      const t = beat / period - c;
      const dir = rand(seed, strHash(obj.id), 59, c);
      const v = p.stretch * exp(-(2 + p.damping * 10) * t) * sinTurns(4 * t);
      out.x += v * sinTurns(dir);
      out.y += v * cosTurns(dir);
      return;
    }
    case 'shuttle': {
      const u = cycle(beat, p.periodBeats);
      const s = (ease(p.ease, tri(u)) * 2 - 1) * p.distance;
      out.x += s * sinTurns(p.angle / 360);
      out.y += s * cosTurns(p.angle / 360);
      return;
    }
  }
}

/** Which of n spots a hop sits on at step k: seeded, never the same spot twice running. */
function hopSpot(seed: number, h: number, n: number, k: number): number {
  const prev = Math.floor(rand(seed, h, 61, k - 1) * n);
  const pick = Math.floor(rand(seed, h, 61, k) * (n - 1));
  return pick >= prev ? pick + 1 : pick;
}

/** Spot i of a hop, in a unit disc (area-uniform). */
function spotX(seed: number, h: number, i: number): number {
  return Math.sqrt(rand(seed, h, 67, i)) * sinTurns(rand(seed, h, 71, i));
}

function spotY(seed: number, h: number, i: number): number {
  return Math.sqrt(rand(seed, h, 67, i)) * cosTurns(rand(seed, h, 71, i));
}

export function pose(obj: PatchObject, beat: number, seed: number, out: Pose): Pose {
  out.x = obj.x;
  out.y = obj.y;
  out.scale = 1;
  out.angle = 0;
  out.sx = 1;
  out.sy = 1;
  const m = obj.motion;
  if (!m) return out;
  if (m.pos) posOffset(m.pos, obj, beat, seed, out);
  const b = m.breathe;
  if (b) {
    out.scale = 1 + b.amount * breatheWave(b, beat, seed, strHash(obj.id));
    if (out.scale < 0.05) out.scale = 0.05;
  }
  const sp = m.spin;
  if (sp) {
    const a = cycle(beat, sp.periodBeats);
    out.angle = sp.ccw ? -a : a;
  }
  const st = m.stretch;
  if (st) {
    const w = st.amount * sinTurns(beat / Math.max(0.25, st.periodBeats));
    out.sx = 1 + w;
    out.sy = 1 / (1 + w);
  }
  return out;
}
