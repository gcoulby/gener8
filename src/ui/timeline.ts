import { EXAMPLES, fmtTime, type App } from './app.ts';
import { CAPTURE_SECONDS, HISTORY_SECONDS, SR } from '../core/constants.ts';
import { NOTE_NAMES, SCALE_LABELS } from '../core/music.ts';
import { FONT, INK, rgba } from './theme.ts';

export const STRIP_H = 30;
const READOUT_W = 420;
const IO_W = 250;

function stripBounds(app: App): { x0: number; x1: number; y: number } {
  return { x0: IO_W, x1: Math.max(IO_W + 120, app.W - READOUT_W), y: app.H - STRIP_H };
}

/** Text buttons; records hit boxes. Returns the x after the last item. */
function buttons(app: App, items: [string, string][], x: number, y: number, h: number): number {
  const g = app.g;
  g.font = FONT;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  for (const [id, label] of items) {
    const w = g.measureText(label).width;
    const hov = app.hover?.kind === 'ui' && app.hover.id === id;
    const on = id === 'examples' && app.examplesOpen;
    g.fillStyle =
      id === 'capture'
        ? `rgba(240,90,90,${hov ? 1 : 0.7})`
        : `rgba(233,228,218,${hov || on ? 1 : id === 'voices' ? 0.3 : 0.6})`;
    g.fillText(label, x, y + h / 2);
    if (id !== 'voices') app.uiHits.push({ id, x: x - 4, y, w: w + 8, h });
    x += w + 14;
  }
  return x;
}

function drawExamplesMenu(app: App, ax: number, y: number): void {
  const g = app.g;
  const itemH = 24;
  const w = 180;
  const h = EXAMPLES.length * itemH + 8;
  const top = y - h - 6;
  g.fillStyle = 'rgba(14,14,18,0.96)';
  g.strokeStyle = 'rgba(233,228,218,0.18)';
  g.beginPath();
  g.roundRect(ax - 8, top, w, h, 6);
  g.fill();
  g.stroke();
  g.font = FONT;
  g.textBaseline = 'middle';
  EXAMPLES.forEach((ex, i) => {
    const iy = top + 4 + i * itemH;
    const id = 'example:' + ex.id;
    const hov = app.hover?.kind === 'ui' && app.hover.id === id;
    if (hov) {
      g.fillStyle = 'rgba(233,228,218,0.08)';
      g.fillRect(ax - 4, iy, w - 8, itemH);
    }
    g.textAlign = 'left';
    g.fillStyle = `rgba(233,228,218,${hov ? 1 : 0.75})`;
    g.fillText(ex.label, ax, iy + itemH / 2);
    g.textAlign = 'right';
    g.fillStyle = 'rgba(233,228,218,0.3)';
    g.fillText('⇧' + ex.key, ax + w - 18, iy + itemH / 2);
    app.uiHits.push({ id, x: ax - 4, y: iy, w: w - 8, h: itemH });
  });
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

export function drawTimeline(app: App): void {
  const g = app.g;
  const { x0, x1, y } = stripBounds(app);
  const h = STRIP_H;
  g.fillStyle = 'rgba(255,255,255,0.025)';
  g.fillRect(0, y, app.W, h);
  app.uiHits = [];
  const io: [string, string][] = [
    ['new', 'new'],
    ['open', 'open'],
    ['save', 'save'],
    ['examples', app.examplesOpen ? 'examples ▴' : 'examples ▾'],
  ];
  buttons(app, io, 14, y, h);
  g.fillStyle = 'rgba(233,228,218,0.1)';
  g.fillRect(x0 - 10, y + 7, 1, h - 14);
  const { from, to } = range(app);
  const xs = (s: number) => x0 + ((s - from) / (to - from)) * (x1 - x0);
  const hist = app.history;

  if (hist) {
    // activity: events per second
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
    // edits
    g.fillStyle = rgba('transformer', 0.7);
    for (const s of hist.editSamplesSince(Math.max(from, hist.earliest))) g.fillRect(xs(s), y + 3, 1, 4);
    // unavailable region
    const ex = xs(hist.earliest);
    if (ex > x0) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x0, y, ex - x0, h);
    }
    // capture window
    const cx = xs(to - CAPTURE_SECONDS * SR);
    g.fillStyle = 'rgba(240,80,80,0.06)';
    g.fillRect(cx, y, x1 - cx, h);
  } else {
    g.font = FONT;
    g.fillStyle = 'rgba(233,228,218,0.35)';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('press space or click to start audio · h for help', x0, y + h / 2);
  }

  if (app.scrub && !app.scrub.cancelled) {
    const sx = xs(app.scrub.sample);
    g.fillStyle = INK;
    g.fillRect(sx, y, 1.5, h);
    g.font = FONT;
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    g.fillText(`−${fmtTime((to - app.scrub.sample) / SR)}  release to branch · esc to cancel`, Math.min(sx + 6, x1 - 260), y - 4);
  } else if (app.hover?.kind === 'strip' && hist) {
    const sx = Math.min(x1, Math.max(x0, app.mouse.x));
    g.fillStyle = 'rgba(233,228,218,0.4)';
    g.fillRect(sx, y, 1, h);
  }

  // readout
  const p = app.patch;
  const items: [string, string][] = [
    ['play', app.audio.started ? (app.audio.running ? '❚❚' : '▶') : '▶'],
    ['tempo', `${Math.round(p.tempo)} bpm`],
    ['root', NOTE_NAMES[p.key.root]],
    ['scale', SCALE_LABELS[p.key.scale] ?? p.key.scale],
    ['seed', `seed ${p.seed}`],
    ['voices', `${app.audio.voices}v`],
    ['capture', '● capture'],
    ['help', '?'],
  ];
  buttons(app, items, x1 + 16, y, h);
  if (app.examplesOpen) {
    const ex = app.uiHits.find((u) => u.id === 'examples');
    if (ex) drawExamplesMenu(app, ex.x + 4, y);
  }
}
