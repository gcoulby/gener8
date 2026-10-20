// Motion is closed-form in beats: no integration state, so it is scrubbable,
// deterministic and tempo-synced. Offsets are relative to the object's home x, y.

import type { PatchObject, Vec2 } from './types.ts';
import { cosTurns, sinTurns } from './dspmath.ts';
import { fbm, strHash } from './rand.ts';

export interface Pose {
  x: number;
  y: number;
  scale: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function pathPoint(pts: Vec2[], u: number, closed: boolean, out: Pose): void {
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
  const t = f - i;
  const at = (k: number): Vec2 => (closed ? pts[((k % n) + n) % n] : pts[k < 0 ? 0 : k >= n ? n - 1 : k]);
  const a = at(i - 1);
  const b = at(i);
  const c = at(i + 1);
  const d = at(i + 2);
  out.x += catmull(a[0], b[0], c[0], d[0], t);
  out.y += catmull(a[1], b[1], c[1], d[1], t);
}

export function pose(obj: PatchObject, beat: number, seed: number, out: Pose): Pose {
  out.x = obj.x;
  out.y = obj.y;
  out.scale = 1;
  const m = obj.motion;
  if (!m) return out;
  const p = m.pos;
  if (p) {
    if (p.type === 'orbit') {
      const a = beat / Math.max(0.25, p.periodBeats) + p.phase;
      out.x += p.radius * sinTurns(a);
      out.y += p.radius * cosTurns(a);
    } else if (p.type === 'path') {
      let u = beat / Math.max(0.25, p.periodBeats);
      u -= Math.floor(u);
      if (p.mode === 'pingpong') u = u < 0.5 ? u * 2 : 2 - u * 2;
      pathPoint(p.points, u, p.mode === 'loop', out);
    } else if (p.type === 'drift') {
      const h = strHash(obj.id);
      const t = beat / Math.max(0.25, p.rateBeats);
      out.x += p.amplitude * fbm(seed, h, 11, t);
      out.y += p.amplitude * fbm(seed, h, 23, t);
    }
  }
  const b = m.breathe;
  if (b) {
    out.scale = 1 + b.amount * sinTurns(beat / Math.max(0.25, b.periodBeats));
    if (out.scale < 0.05) out.scale = 0.05;
  }
  return out;
}
