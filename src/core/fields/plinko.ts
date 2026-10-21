import type { GeneratorType } from '../types.ts';

const DROP_BEATS = [0.5, 1, 2, 4, 8];
const DROP_LABELS = ['1/8', '1/4', '1/2', '1 bar', '2 bars'];
const SNAP_TICKS = [0, 120, 240, 480]; // at 960 PPQ
const SNAP_LABELS = ['free', '1/32', '1/16', '1/8'];

/** Ball radius in world units. */
export const PLINKO_BALL = 4;
const MAX_BALLS = 12;
const BOUNCE = 0.55;
/** Gravity in field heights per beat²: a ball falls the whole board in about two beats. */
const GRAVITY = 0.5;
/** Fastest a ball may go, in field heights per beat. */
const MAX_SPEED = 2;

export function plinkoDropIndex(h: Record<string, number>): number {
  return Math.round((h.drop ?? 0.5) * (DROP_BEATS.length - 1));
}

export function plinkoSnapIndex(h: Record<string, number>): number {
  return Math.round((h.snap ?? 0) * (SNAP_TICKS.length - 1));
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Beats since it dropped. */
  age: number;
  /** The sound it last hit, and when (tick), so resting contact doesn't machine-gun. */
  last: string;
  lastTick: number;
}

interface PlinkoState {
  balls: Ball[];
  /** Last drop taken. */
  drop: number;
  shownEmpty: boolean;
}

/**
 * The sounds inside are the pegs of a plinko board. Every so often a ball drops
 * in near the top centre, falls, and bounces off whatever sounds are in its
 * way; each one it hits fires, harder the faster the ball is going. Moving the
 * sounds rearranges the board. With snap, hits land on the next grid step
 * instead of exactly when they happen.
 *
 * Plain arithmetic in field-local coordinates (y up), stepped once per block
 * with sub-steps for fast balls, so it is deterministic like the rest.
 */
export const plinko: GeneratorType = {
  id: 'plinko',
  label: 'plinko',
  role: 'generator',
  shape: 'rect',
  glyph: '⁙',
  defaultShape: { w: 240, h: 300 },
  handles: [
    { key: 'drop', label: 'drop every', default: 0.5, format: (_v, h) => DROP_LABELS[plinkoDropIndex(h)] },
    { key: 'snap', label: 'snap', default: 0, format: (_v, h) => SNAP_LABELS[plinkoSnapIndex(h)] },
  ],
  createState: () => ({ balls: [], drop: -1, shownEmpty: true }) satisfies PlinkoState,
  schedule(ctx, t0, t1, members, emit) {
    const st = ctx.state as PlinkoState;
    const w = ctx.w;
    const h = ctx.h;
    const period = DROP_BEATS[plinkoDropIndex(ctx.handles)] * ctx.ppq;
    const snap = SNAP_TICKS[plinkoSnapIndex(ctx.handles)];
    const balls = st.balls;

    for (let k = Math.ceil(t0 / period); k * period < t1; k++) {
      if (k <= st.drop) continue;
      st.drop = k;
      balls.push({
        x: (ctx.rand(7, k * 2) * 2 - 1) * 0.15 * w,
        y: h / 2 - PLINKO_BALL,
        vx: (ctx.rand(7, k * 2 + 1) * 2 - 1) * 0.05 * h,
        vy: 0,
        age: 0,
        last: '',
        lastTick: -Infinity,
      });
      if (balls.length > MAX_BALLS) balls.shift();
    }

    const dt = (t1 - t0) / ctx.ppq;
    const g = GRAVITY * h;
    const vmax = MAX_SPEED * h;
    for (let bi = 0; bi < balls.length; bi++) {
      const b = balls[bi];
      const n = Math.max(1, Math.ceil((Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt) / 2));
      const sdt = dt / n;
      for (let j = 0; j < n; j++) {
        b.vy -= g * sdt;
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (sp > vmax) {
          b.vx *= vmax / sp;
          b.vy *= vmax / sp;
        }
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        b.age += sdt;
        if (b.x < -w / 2 + PLINKO_BALL || b.x > w / 2 - PLINKO_BALL) {
          b.x = b.x < 0 ? -w / 2 + PLINKO_BALL : w / 2 - PLINKO_BALL;
          b.vx = -b.vx * BOUNCE;
        }
        const tick = t0 + ((j + 1) / n) * (t1 - t0);
        for (const m of members) {
          const dx = b.x - m.lx;
          const dy = b.y - m.ly;
          const rr = m.r + PLINKO_BALL;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 1e-6;
          const nx = dx / d;
          const ny = dy / d;
          const vn = b.vx * nx + b.vy * ny;
          // out of the peg, and bounce if heading into it
          b.x = m.lx + nx * rr;
          b.y = m.ly + ny * rr;
          if (vn >= 0) continue;
          b.vx -= (1 + BOUNCE) * vn * nx;
          b.vy -= (1 + BOUNCE) * vn * ny;
          // a little seeded spin, so a ball never balances on top of a peg
          b.vx += (ctx.rand(9, Math.floor(tick) * 16 + bi) - 0.5) * 0.04 * h;
          // a soft touch (rolling, resting) is silent; so is a rattle on the same peg
          if (-vn < 0.08 * h || (b.last === m.soundId && tick - b.lastTick < ctx.ppq / 8)) continue;
          b.last = m.soundId;
          b.lastTick = tick;
          const vel = Math.min(1, 0.2 + (-vn / h) * 0.8);
          const at = snap ? Math.ceil(tick / snap) * snap : tick;
          emit(m.soundId, at, 0, vel, ctx.ppq / 2);
        }
      }
    }
    // gone out of the bottom, or rolling about too long
    st.balls = balls.filter((b) => b.y > -h / 2 - PLINKO_BALL * 2 && b.age < 32);
  },
  visual(ctx) {
    const st = ctx.state as PlinkoState;
    if (!st.balls.length) {
      if (st.shownEmpty) return null;
      st.shownEmpty = true;
      return { balls: [] };
    }
    st.shownEmpty = false;
    const balls: number[] = [];
    for (const b of st.balls) balls.push(Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10);
    return { balls, w: ctx.w, h: ctx.h };
  },
};
