import { fmtTime, type App } from './app.ts';
import { CAPTURE_SECONDS, HISTORY_SECONDS, SR } from '../core/constants.ts';
import { NOTE_NAMES, SCALE_LABELS } from '../core/music.ts';
import { FONT, INK, rgba } from './theme.ts';
import { fmtDb } from './bar.ts';

/** Height of the bar in a video frame, which has no DOM bar (see bar.ts). */
export const STRIP_H = 30;

interface BarLayout {
  h: number;
  strip: { x0: number; x1: number; y: number; h: number };
}

/** What a video frame shows in place of the bar's controls. */
function readout(app: App): string {
  const p = app.patch;
  return `${Math.round(p.tempo)} bpm   ${NOTE_NAMES[p.key.root]} ${SCALE_LABELS[p.key.scale] ?? p.key.scale}   seed ${p.seed}   vol ${fmtDb(p.master ?? 0)}`;
}

/** The bar's height and the strip's place: from the DOM bar, or a read-only row in video frames. */
export function barLayout(app: App): BarLayout {
  if (app.bar) return app.bar.layout();
  app.g.font = FONT;
  const x0 = 14 + app.g.measureText(readout(app)).width + 24;
  return { h: STRIP_H, strip: { x0, x1: app.W - 14, y: app.H - STRIP_H, h: STRIP_H } };
}

function stripBounds(app: App): BarLayout['strip'] {
  return barLayout(app).strip;
}

function range(app: App): { from: number; to: number } {
  const to = app.history?.now ?? 0;
  return { from: to - HISTORY_SECONDS * SR, to };
}

export function stripSampleAt(app: App, mx: number): number {
  const { x0, x1 } = stripBounds(app);
  const { from, to } = range(app);
  const u = Math.min(1, Math.max(0, (mx - x0) / (x1 - x0)));
  const s = from + u * (to - from);
  return Math.max(app.history?.earliest ?? 0, Math.round(s));
}

export function inStrip(app: App, mx: number, my: number): boolean {
  const { x0, x1, y, h } = stripBounds(app);
  return my >= y && my <= y + h && mx >= x0 - 4 && mx <= x1 + 4;
}

export function drawTimeline(app: App): void {
  const g = app.g;
  const L = barLayout(app);
  app.barH = L.h;
  const { x0, x1, y, h } = L.strip;
  g.fillStyle = 'rgba(11,11,14,0.9)';
  g.fillRect(0, app.H - L.h, app.W, L.h);
  g.fillStyle = 'rgba(233,228,218,0.08)';
  g.fillRect(0, app.H - L.h, app.W, 1);
  g.fillStyle = 'rgba(255,255,255,0.03)';
  g.beginPath();
  g.roundRect(x0 - 2, y, x1 - x0 + 4, h, 6);
  g.fill();
  if (!app.bar) {
    g.font = FONT;
    g.fillStyle = 'rgba(233,228,218,0.6)';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(readout(app), 14, y + h / 2);
  }

  // strip
  const { from, to } = range(app);
  const xs = (s: number) => x0 + ((s - from) / (to - from)) * (x1 - x0);
  const hist = app.history;
  if (hist) {
    const s0 = Math.floor(from / SR);
    const s1 = Math.floor(to / SR);
    const bw = Math.max(1, (x1 - x0) / HISTORY_SECONDS - 0.5);
    g.fillStyle = 'rgba(233,228,218,0.22)';
    for (let s = Math.max(0, s0); s <= s1; s++) {
      const n = hist.activity.get(s);
      if (!n) continue;
      const bh = Math.min(1, n / 10) * (h - 10);
      g.fillRect(xs(s * SR), y + h - 4 - bh, bw, bh);
    }
    g.fillStyle = rgba('transformer', 0.7);
    for (const s of hist.editSamplesSince(Math.max(from, hist.earliest))) g.fillRect(xs(s), y + 3, 1, 4);
    const ex = xs(hist.earliest);
    if (ex > x0) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x0, y, ex - x0, h);
    }
    const cx = xs(to - CAPTURE_SECONDS * SR);
    g.fillStyle = 'rgba(240,80,80,0.06)';
    g.fillRect(cx, y, x1 - cx, h);
  } else {
    g.font = FONT;
    g.fillStyle = 'rgba(233,228,218,0.35)';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const msg = app.mobile ? 'tap ▶ to start audio' : 'press space or ▶ to start audio · h for help';
    g.fillText(g.measureText(msg).width < x1 - x0 ? msg : msg.split(' · ')[0], x0 + 4, y + h / 2);
  }

  if (app.scrub && !app.scrub.cancelled) {
    const sx = xs(app.scrub.sample);
    g.fillStyle = INK;
    g.fillRect(sx, y, 1.5, h);
    g.font = FONT;
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    const msg = app.mobile ? `−${fmtTime((to - app.scrub.sample) / SR)}  lift to branch` : `−${fmtTime((to - app.scrub.sample) / SR)}  release to branch · esc to cancel`;
    g.fillText(msg, Math.max(12, Math.min(sx + 6, x1 - g.measureText(msg).width)), app.H - L.h - 6);
  } else if (app.hover?.kind === 'strip' && hist) {
    const sx = Math.min(x1, Math.max(x0, app.mouse.x));
    g.fillStyle = 'rgba(233,228,218,0.4)';
    g.fillRect(sx, y, 1, h);
  }
}
