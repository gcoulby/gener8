import { fmtTime, type App } from './app.ts';
import { EXAMPLES } from './examples.ts';
import { CAPTURE_SECONDS, HISTORY_SECONDS, SR } from '../core/constants.ts';
import { NOTE_NAMES, SCALE_LABELS } from '../core/music.ts';
import { FONT, INK, rgba } from './theme.ts';

/** Height of one bar row (the desktop bar is one row). */
export const STRIP_H = 30;
const READOUT_W = 540;

type Item = [string, string];

function ioItems(app: App): Item[] {
  return [
    ['new', 'new'],
    ['open', 'open'],
    ['save', 'save'],
    ['random', 'random'],
    ['seedentry', 'seed…'],
    ['share', 'share'],
    ['examples', app.examplesOpen ? 'examples ▴' : 'examples ▾'],
  ];
}

function readoutItems(app: App): Item[] {
  const p = app.patch;
  const items: Item[] = [
    ['play', app.audio.started ? (app.audio.running ? '❚❚' : '▶') : '▶'],
    ['vol', `vol ${fmtDb(p.master ?? 0)}`],
    ['tempo', `${Math.round(p.tempo)} bpm`],
    ['root', NOTE_NAMES[p.key.root]],
    ['scale', SCALE_LABELS[p.key.scale] ?? p.key.scale],
    ['seed', `seed ${p.seed}`],
  ];
  if (!app.mobile) items.push(['voices', `${app.audio.voices}v`]);
  items.push(['mixer', app.mixerOpen ? 'mixer ▾' : 'mixer ▴'], ['capture', '● capture'], ['docs', 'docs'], ['help', '?']);
  return items;
}

export function fmtDb(db: number): string {
  return `${db > 0 ? '+' : ''}${db.toFixed(db % 1 ? 1 : 0)} dB`;
}

interface Placed {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface BarLayout {
  h: number;
  strip: { x0: number; x1: number; y: number };
  items: Placed[];
}

/**
 * Desktop: one row (I/O · strip · readout). Mobile: the buttons wrap onto
 * rows above a full-width strip.
 */
export function barLayout(app: App): BarLayout {
  const g = app.g;
  g.font = FONT;
  if (!app.mobile) {
    const y = app.H - STRIP_H;
    const items: Placed[] = [];
    let x = 14;
    for (const [id, label] of ioItems(app)) {
      items.push({ id, label, x, y });
      x += g.measureText(label).width + 14;
    }
    const x0 = x + 12;
    const x1 = Math.max(x0 + 120, app.W - READOUT_W);
    x = x1 + 16;
    for (const [id, label] of readoutItems(app)) {
      items.push({ id, label, x, y });
      x += g.measureText(label).width + 14;
    }
    return { h: STRIP_H, strip: { x0, x1, y }, items };
  }
  const gap = 18;
  const all = [...readoutItems(app), ...ioItems(app)];
  const rows: Placed[][] = [[]];
  let x = 14;
  for (const [id, label] of all) {
    const w = g.measureText(label).width;
    if (x + w > app.W - 10 && rows[rows.length - 1].length) {
      rows.push([]);
      x = 14;
    }
    rows[rows.length - 1].push({ id, label, x, y: 0 });
    x += w + gap;
  }
  const h = (rows.length + 1) * STRIP_H;
  const top = app.H - h;
  rows.forEach((r, i) => r.forEach((p) => (p.y = top + i * STRIP_H)));
  return { h, strip: { x0: 12, x1: app.W - 12, y: app.H - STRIP_H }, items: rows.flat() };
}

function stripBounds(app: App): { x0: number; x1: number; y: number } {
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
  const { x0, x1, y } = stripBounds(app);
  return my >= y && mx >= x0 - 4 && mx <= x1 + 4;
}

function drawExamplesMenu(app: App, ax: number, y: number): void {
  const g = app.g;
  const itemH = app.mobile ? 34 : 24;
  const w = 190;
  const h = EXAMPLES.length * itemH + 8;
  const left = Math.min(ax - 8, app.W - w - 8);
  const top = y - h - 6;
  g.fillStyle = 'rgba(14,14,18,0.96)';
  g.strokeStyle = 'rgba(233,228,218,0.18)';
  g.beginPath();
  g.roundRect(left, top, w, h, 6);
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
      g.fillRect(left + 4, iy, w - 8, itemH);
    }
    g.textAlign = 'left';
    g.fillStyle = `rgba(233,228,218,${hov ? 1 : 0.75})`;
    g.fillText(ex.label, left + 12, iy + itemH / 2);
    if (!app.mobile && ex.key) {
      g.textAlign = 'right';
      g.fillStyle = 'rgba(233,228,218,0.3)';
      g.fillText('⇧' + ex.key, left + w - 12, iy + itemH / 2);
    }
    app.uiHits.push({ id, x: left + 4, y: iy, w: w - 8, h: itemH });
  });
}

export function drawTimeline(app: App): void {
  const g = app.g;
  const L = barLayout(app);
  app.barH = L.h;
  const { x0, x1, y } = L.strip;
  const h = STRIP_H;
  g.fillStyle = app.mobile ? 'rgba(11,11,14,0.92)' : 'rgba(255,255,255,0.025)';
  g.fillRect(0, app.H - L.h, app.W, L.h);
  if (app.mobile) {
    g.fillStyle = 'rgba(255,255,255,0.025)';
    g.fillRect(0, y, app.W, h);
  }

  // buttons
  app.uiHits = [];
  g.font = FONT;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  for (const it of L.items) {
    const w = g.measureText(it.label).width;
    const hov = app.hover?.kind === 'ui' && app.hover.id === it.id;
    const on = (it.id === 'examples' && app.examplesOpen) || (it.id === 'mixer' && app.mixerOpen);
    g.fillStyle =
      it.id === 'capture'
        ? `rgba(240,90,90,${hov ? 1 : 0.7})`
        : `rgba(233,228,218,${hov || on ? 1 : it.id === 'voices' ? 0.3 : 0.6})`;
    g.fillText(it.label, it.x, it.y + h / 2);
    if (it.id !== 'voices') app.uiHits.push({ id: it.id, x: it.x - 6, y: it.y, w: w + 12, h });
  }
  if (!app.mobile) {
    g.fillStyle = 'rgba(233,228,218,0.1)';
    g.fillRect(x0 - 10, y + 7, 1, h - 14);
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
    g.fillText(app.mobile ? 'tap ▶ to start audio' : 'press space or click to start audio · h for help', x0, y + h / 2);
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

  if (app.examplesOpen) {
    const ex = app.uiHits.find((u) => u.id === 'examples');
    if (ex) drawExamplesMenu(app, ex.x + 6, ex.y);
  }
}
