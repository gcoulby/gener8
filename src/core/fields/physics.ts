// Generators that simulate something moving inside the field: a double
// pendulum and a flock of boids. Both step at a fixed rate in beats with
// plain arithmetic (and dspmath trig), so they replay identically.

import type { FieldContext, GeneratorType } from '../types.ts';
import { cos, sin, TAU } from '../dspmath.ts';
import { angleTurns } from '../geometry.ts';

const pct = (v: number) => Math.round(v * 100) + '%';

// ---------- pendulum: a double pendulum ----------

/** Simulation steps per beat (each split into RK4 substeps). */
const PEND_STEPS = 32;
const PEND_SUB = 4;
const G = 9.81;

export function pendulumSpeed(h: Record<string, number>): number {
  return 0.5 + (h.speed ?? 0.4) * 3.5;
}

interface PendState {
  /** Arm angles from straight down (radians) and their angular speeds. */
  s: Float64Array;
  energy: number;
  step: number;
  /** Where the lower bob was last step, in turns round the pivot. */
  last: number;
}

/** Equal masses and arms: angular accelerations of the two arms. */
function deriv(s: Float64Array, out: Float64Array): void {
  const [t1, t2, w1, w2] = s;
  const d = t1 - t2;
  const den = 3 - cos(2 * d);
  out[0] = w1;
  out[1] = w2;
  out[2] = (-G * 3 * sin(t1) - G * sin(t1 - 2 * t2) - 2 * sin(d) * (w2 * w2 + w1 * w1 * cos(d))) / den;
  out[3] = (2 * sin(d) * (w1 * w1 * 2 + G * 2 * cos(t1) + w2 * w2 * cos(d))) / den;
}

const k1 = new Float64Array(4);
const k2 = new Float64Array(4);
const k3 = new Float64Array(4);
const k4 = new Float64Array(4);
const tmp = new Float64Array(4);

function rk4(s: Float64Array, h: number): void {
  deriv(s, k1);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + (k1[i] * h) / 2;
  deriv(tmp, k2);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + (k2[i] * h) / 2;
  deriv(tmp, k3);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + k3[i] * h;
  deriv(tmp, k4);
  for (let i = 0; i < 4; i++) s[i] += ((k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) * h) / 6;
}

function pendStart(ctx: FieldContext): PendState {
  const e = ctx.handles.energy ?? 0.6;
  // a little seeded asymmetry so two pendulums never move alike
  const a = 0.5 + e * 2.4;
  const s = new Float64Array([a, a + 0.1 + ctx.rand(31, 0) * 0.3, 0, 0]);
  return { s, energy: e, step: -1, last: lowerTurns(s) };
}

/** Lower bob's angle round the pivot in turns, clockwise from up (y up, hanging down at rest). */
function lowerTurns(s: Float64Array): number {
  return angleTurns(0, 0, sin(s[0]) + sin(s[1]), -cos(s[0]) - cos(s[1]));
}

/**
 * A double pendulum hangs from the field's centre and swings without
 * friction: gentle and regular at low energy, wildly chaotic at high. A sound
 * fires each time the lower bob sweeps past its angle, harder the faster it
 * goes. (Not the pendulum motion, which swings an object.)
 */
export const pendulum: GeneratorType = {
  id: 'pendulum',
  label: 'pendulum',
  role: 'generator',
  shape: 'circle',
  glyph: '⚖',
  defaultShape: { r: 180 },
  handles: [
    { key: 'speed', label: 'speed', default: 0.4, format: (_v, h) => `${pendulumSpeed(h).toFixed(1)}×` },
    { key: 'energy', label: 'energy', default: 0.6, format: (v) => (v < 0.25 ? 'calm' : v < 0.6 ? 'lively' : 'chaotic') },
  ],
  createState: pendStart,
  schedule(ctx, t0, t1, members, emit) {
    let st = ctx.state as PendState;
    if (st.energy !== (ctx.handles.energy ?? 0.6)) ctx.state = st = pendStart(ctx);
    const stepT = ctx.ppq / PEND_STEPS;
    // simulated seconds per step: speed scales time, not gravity
    const h = (pendulumSpeed(ctx.handles) * 0.5) / PEND_STEPS / PEND_SUB;
    for (let k = Math.ceil(t0 / stepT); k * stepT < t1; k++) {
      if (k <= st.step) continue;
      st.step = k;
      for (let i = 0; i < PEND_SUB; i++) rk4(st.s, h);
      const now = lowerTurns(st.s);
      let d = now - st.last;
      if (d > 0.5) d -= 1;
      if (d < -0.5) d += 1;
      for (const m of members) {
        // did the bob cross the member's angle on the short way from last to now?
        let a = m.angle - st.last;
        if (a > 0.5) a -= 1;
        if (a < -0.5) a += 1;
        if ((d > 0 && a > 0 && a <= d) || (d < 0 && a < 0 && a >= d)) {
          const v = Math.min(1, 0.3 + Math.abs(d) * 12 + 0.3 * m.depth);
          emit(m.soundId, k * stepT, 0, v, ctx.ppq / 4);
        }
      }
      st.last = now;
    }
  },
  visual(ctx) {
    const st = ctx.state as PendState;
    return { t1: st.s[0], t2: st.s[1] };
  },
};

// ---------- flock: boids ----------

const FLOCK_STEPS = 16;
const MAX_BOIDS = 16;

export function flockCount(h: Record<string, number>): number {
  return 3 + Math.round((h.count ?? 0.4) * (MAX_BOIDS - 3));
}

interface FlockState {
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  step: number;
  /** Which boids are inside each sound, so only arrivals fire. */
  inside: Map<string, Uint8Array>;
}

/**
 * A flock of boids (Reynolds' rules: stay close, don't collide, fly the same
 * way) wheels round inside the field, turning back at its edge. A sound fires
 * when a boid flies into it. Cohesion pulls the flock into a tight swarm that
 * sweeps from sound to sound; low cohesion scatters it.
 */
export const flock: GeneratorType = {
  id: 'flock',
  label: 'flock',
  role: 'generator',
  shape: 'circle',
  glyph: '⋰',
  defaultShape: { r: 200 },
  handles: [
    { key: 'count', label: 'boids', default: 0.4, format: (_v, h) => `${flockCount(h)} boids` },
    { key: 'cohesion', label: 'cohesion', default: 0.5, format: pct },
  ],
  createState(ctx): FlockState {
    const st: FlockState = {
      x: new Float64Array(MAX_BOIDS),
      y: new Float64Array(MAX_BOIDS),
      vx: new Float64Array(MAX_BOIDS),
      vy: new Float64Array(MAX_BOIDS),
      step: -1,
      inside: new Map(),
    };
    for (let i = 0; i < MAX_BOIDS; i++) {
      const a = ctx.rand(41, i) * TAU;
      const r = 0.6 * ctx.rand(43, i);
      st.x[i] = r * cos(a);
      st.y[i] = r * sin(a);
      const h = ctx.rand(47, i) * TAU;
      st.vx[i] = 0.4 * cos(h);
      st.vy[i] = 0.4 * sin(h);
    }
    return st;
  },
  schedule(ctx, t0, t1, members, emit) {
    const st = ctx.state as FlockState;
    const n = flockCount(ctx.handles);
    const coh = ctx.handles.cohesion ?? 0.5;
    const R = ctx.baseW / 2;
    const stepT = ctx.ppq / FLOCK_STEPS;
    // positions are in field radii; speeds in radii per beat
    const dt = 1 / FLOCK_STEPS;
    const { x, y, vx, vy } = st;
    for (let k = Math.ceil(t0 / stepT); k * stepT < t1; k++) {
      if (k <= st.step) continue;
      st.step = k;
      for (let i = 0; i < n; i++) {
        let cx = 0;
        let cy = 0;
        let ax = 0;
        let ay = 0;
        let sx = 0;
        let sy = 0;
        let near = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const dx = x[j] - x[i];
          const dy = y[j] - y[i];
          const d2 = dx * dx + dy * dy;
          if (d2 > 0.25) continue;
          near++;
          cx += dx;
          cy += dy;
          ax += vx[j];
          ay += vy[j];
          if (d2 < 0.01) {
            sx -= dx / (d2 + 1e-4);
            sy -= dy / (d2 + 1e-4);
          }
        }
        if (near) {
          vx[i] += (cx / near) * coh * 1.5 * dt + (ax / near - vx[i]) * 0.8 * dt;
          vy[i] += (cy / near) * coh * 1.5 * dt + (ay / near - vy[i]) * 0.8 * dt;
        }
        vx[i] += sx * 0.004;
        vy[i] += sy * 0.004;
        // the edge turns them back in
        const r2 = x[i] * x[i] + y[i] * y[i];
        if (r2 > 0.7) {
          vx[i] -= x[i] * (r2 - 0.7) * 6 * dt;
          vy[i] -= y[i] * (r2 - 0.7) * 6 * dt;
        }
        // keep a steady cruising speed
        const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]) || 1;
        const want = 0.5 + 0.3 * (1 - coh);
        vx[i] *= want / sp;
        vy[i] *= want / sp;
      }
      for (let i = 0; i < n; i++) {
        x[i] += vx[i] * dt;
        y[i] += vy[i] * dt;
      }
      for (const m of members) {
        let ins = st.inside.get(m.soundId);
        if (!ins) st.inside.set(m.soundId, (ins = new Uint8Array(MAX_BOIDS)));
        const mx = m.lx / R;
        const my = m.ly / R;
        const rr = (m.r + 6) / R;
        for (let i = 0; i < n; i++) {
          const dx = x[i] - mx;
          const dy = y[i] - my;
          const hit = dx * dx + dy * dy < rr * rr;
          if (hit && !ins[i]) emit(m.soundId, k * stepT, 0, 0.4 + 0.5 * m.depth, ctx.ppq / 4);
          ins[i] = hit ? 1 : 0;
        }
      }
    }
  },
  visual(ctx) {
    const st = ctx.state as FlockState;
    const n = flockCount(ctx.handles);
    return { x: Array.from(st.x.subarray(0, n)), y: Array.from(st.y.subarray(0, n)), vx: Array.from(st.vx.subarray(0, n)), vy: Array.from(st.vy.subarray(0, n)) };
  },
};
