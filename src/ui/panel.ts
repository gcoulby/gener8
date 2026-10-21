// Zoomed-in view of a sound's internals: fixed layout per type, direct handles, no cables.

import type { App } from './app.ts';
import type { PanelSection, ParamSpec, SoundObj } from '../core/types.ts';
import { soundTypes } from '../core/sounds/registry.ts';
import { indexToMidi, nearestIndex, noteName, scaleSteps } from '../core/music.ts';
import { BG, FONT, FONT_SMALL, rgba } from './theme.ts';

const PAD = 18;
const HEAD = 34;

function gridCols(app: App, sections: number): number {
  return app.mobile && app.W < 700 ? Math.min(2, sections) : sections;
}

export function panelRect(app: App): { x: number; y: number; w: number; h: number } {
  const o = app.obj(app.panel?.id ?? null);
  const n = (o?.kind === 'sound' && soundTypes[o.type]?.panel.length) || 1;
  const rows = Math.ceil(n / gridCols(app, n));
  const w = app.mobile ? app.W - 24 : Math.min(860, app.W - 120);
  const h = Math.min(rows === 1 ? 300 : 70 + rows * (app.mobile ? 180 : 220), app.H - app.barH - 30);
  return { x: (app.W - w) / 2, y: Math.max(10, (app.H - app.barH - h) / 2), w, h };
}

/** Section cell i: column/row in the panel grid. */
function cell(app: App, n: number, i: number): { x: number; top: number; bottom: number; w: number } {
  const r = panelRect(app);
  const cols = gridCols(app, n);
  const rows = Math.ceil(n / cols);
  const cw = (r.w - PAD * (cols + 1)) / cols;
  const ch = (r.h - HEAD - PAD) / rows;
  const row = Math.floor(i / cols);
  const top = r.y + HEAD + row * ch;
  return { x: r.x + PAD + (i % cols) * (cw + PAD), top: top + 22, bottom: top + ch - PAD, w: cw };
}

function norm(s: ParamSpec, v: number): number {
  if (s.curve === 'exp') return Math.log(v / s.min) / Math.log(s.max / s.min);
  return (v - s.min) / (s.max - s.min);
}

function denorm(s: ParamSpec, u: number): number {
  u = Math.min(1, Math.max(0, u));
  const v = s.curve === 'exp' ? s.min * Math.pow(s.max / s.min, u) : s.min + u * (s.max - s.min);
  return Number(v.toPrecision(4));
}

function fmt(s: ParamSpec, v: number): string {
  const n = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3).replace(/\.?0+$/, '');
  return n + (s.unit ? ' ' + s.unit : '');
}

function short(v: number): string {
  return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(3).replace(/^0/, '').replace(/0+$/, '').replace(/\.$/, '.0');
}

interface Ctl {
  key: string;
  kind: 'slider' | 'adsr' | 'filter';
  x: number;
  y: number;
  w: number;
  h: number;
  section: PanelSection;
}

function layout(app: App, o: SoundObj): Ctl[] {
  const t = soundTypes[o.type];
  if (!t) return [];
  const out: Ctl[] = [];
  t.panel.forEach((sec, i) => {
    const { x, top, bottom, w: cw } = cell(app, t.panel.length, i);
    if (sec.kind === 'knobs') {
      sec.keys.forEach((k, j) => out.push({ key: k, kind: 'slider', x, y: top + j * 42, w: cw, h: 34, section: sec }));
    } else if (sec.kind === 'adsr') {
      out.push({ key: sec.keys.join(','), kind: 'adsr', x, y: top, w: cw, h: bottom - top, section: sec });
    } else {
      const extra = sec.extra ?? [];
      const fh = bottom - top - extra.length * 42;
      out.push({ key: sec.cutoff + ',' + sec.res, kind: 'filter', x, y: top, w: cw, h: fh, section: sec });
      extra.forEach((k, j) => out.push({ key: k, kind: 'slider', x, y: top + fh + 8 + j * 42, w: cw, h: 34, section: sec }));
    }
  });
  return out;
}

function spec(o: SoundObj, key: string): ParamSpec | undefined {
  return soundTypes[o.type]?.params.find((p) => p.key === key);
}

function val(o: SoundObj, key: string): number {
  return o.params[key] ?? spec(o, key)?.default ?? 0;
}

/** ADSR geometry: each time segment gets up to a quarter of the width, in its param's normalised scale. */
function adsrPoints(o: SoundObj, c: Ctl): { x: number; y: number }[] {
  const [a, d, s, r] = (c.section as Extract<PanelSection, { kind: 'adsr' }>).keys;
  const seg = c.w / 3.6;
  const base = c.y + c.h - 4;
  const top = c.y + 6;
  const ya = (lvl: number) => base - lvl * (base - top);
  const xa = c.x + norm(spec(o, a)!, val(o, a)) * seg;
  const xd = xa + norm(spec(o, d)!, val(o, d)) * seg;
  const xs = xd + seg * 0.6;
  const xr = xs + norm(spec(o, r)!, val(o, r)) * seg;
  return [
    { x: c.x, y: base },
    { x: xa, y: top },
    { x: xd, y: ya(val(o, s)) },
    { x: xs, y: ya(val(o, s)) },
    { x: xr, y: base },
  ];
}

function filterPoint(o: SoundObj, c: Ctl): { x: number; y: number } {
  const sec = c.section as Extract<PanelSection, { kind: 'filter' }>;
  const u = norm(spec(o, sec.cutoff)!, val(o, sec.cutoff));
  const rs = spec(o, sec.res)!;
  const q = norm(rs, val(o, sec.res));
  return { x: c.x + u * c.w, y: c.y + c.h - 8 - q * (c.h - 24) };
}

export function drawPanel(app: App): void {
  const o = app.obj(app.panel?.id ?? null);
  if (!o || o.kind !== 'sound') {
    app.panel = null;
    return;
  }
  const t = soundTypes[o.type];
  const g = app.g;
  g.fillStyle = 'rgba(5,5,7,0.6)';
  g.fillRect(0, 0, app.W, app.H);
  const r = panelRect(app);
  g.fillStyle = BG;
  g.strokeStyle = rgba('sound', 0.25);
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(r.x, r.y, r.w, r.h, 8);
  g.fill();
  g.stroke();

  g.font = FONT;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = rgba('sound', 0.9);
  const k = app.view.key;
  const steps = scaleSteps(k.scale);
  const m = app.places.get(o.id)?.pitch ?? 60;
  const pitch = noteName(indexToMidi(nearestIndex(m, k.root, steps), k.root, steps));
  const head = app.mobile ? `${o.id} · ${t?.label ?? o.type} · ${pitch}` : `${o.id} · ${t?.label ?? o.type} · ${t?.mode ?? ''} · ${pitch} · size ${o.size}`;
  g.fillText(head, r.x + PAD, r.y + HEAD / 2 + 4);
  g.textAlign = 'right';
  g.fillStyle = 'rgba(233,228,218,0.4)';
  g.fillText(app.mobile ? 'tap outside to close' : 'esc / zoom out to close', r.x + r.w - PAD, r.y + HEAD / 2 + 4);
  if (!t) return;

  const ctls = layout(app, o);
  // section titles
  t.panel.forEach((sec, i) => {
    const c = cell(app, t.panel.length, i);
    g.textAlign = 'left';
    g.fillStyle = 'rgba(233,228,218,0.45)';
    g.font = FONT_SMALL;
    g.fillText(sec.title.toUpperCase(), c.x, c.top - 14);
  });

  const active = app.drag?.kind === 'panel' ? app.drag.key : null;
  for (const c of ctls) {
    if (c.kind === 'slider') {
      const s = spec(o, c.key);
      if (!s) continue;
      const u = norm(s, val(o, c.key));
      g.font = FONT_SMALL;
      g.textAlign = 'left';
      g.fillStyle = 'rgba(233,228,218,0.6)';
      g.fillText(s.label, c.x, c.y + 8);
      g.textAlign = 'right';
      g.fillText(fmt(s, val(o, c.key)), c.x + c.w, c.y + 8);
      g.fillStyle = 'rgba(233,228,218,0.08)';
      g.fillRect(c.x, c.y + 20, c.w, 4);
      g.fillStyle = rgba('sound', active === c.key ? 1 : 0.75);
      g.fillRect(c.x, c.y + 20, c.w * u, 4);
      g.beginPath();
      g.arc(c.x + c.w * u, c.y + 22, 5, 0, Math.PI * 2);
      g.fill();
    } else if (c.kind === 'adsr') {
      g.strokeStyle = 'rgba(233,228,218,0.08)';
      g.strokeRect(c.x, c.y, c.w, c.h);
      const pts = adsrPoints(o, c);
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.strokeStyle = rgba('sound', 0.85);
      g.lineWidth = 1.5;
      g.stroke();
      g.lineTo(pts[pts.length - 1].x, c.y + c.h - 4);
      g.lineTo(c.x, c.y + c.h - 4);
      g.fillStyle = rgba('sound', 0.06);
      g.fill();
      g.fillStyle = rgba('sound', 1);
      for (const i of [1, 2, 4]) {
        g.beginPath();
        g.arc(pts[i].x, pts[i].y, 5, 0, Math.PI * 2);
        g.fill();
      }
      const keys = (c.section as Extract<PanelSection, { kind: 'adsr' }>).keys;
      g.font = FONT_SMALL;
      g.textAlign = 'left';
      g.fillStyle = 'rgba(233,228,218,0.5)';
      g.fillText(keys.map((k, i) => 'ADSR'[i] + ' ' + short(val(o, k))).join('  '), c.x, c.y + c.h + 10);
    } else {
      const sec = c.section as Extract<PanelSection, { kind: 'filter' }>;
      g.strokeStyle = 'rgba(233,228,218,0.08)';
      g.strokeRect(c.x, c.y, c.w, c.h);
      const fp = filterPoint(o, c);
      const q = norm(spec(o, sec.res)!, val(o, sec.res));
      // stylised lowpass response with a resonant bump at the cutoff
      g.beginPath();
      for (let x = 0; x <= c.w; x += 2) {
        const dx = (c.x + x - fp.x) / (c.w * 0.12);
        const bump = q * 40 * Math.exp(-dx * dx * 2);
        const fall = x > fp.x - c.x ? (x - (fp.x - c.x)) * 1.6 : 0;
        const yy = Math.min(c.y + c.h, c.y + c.h * 0.45 - bump + fall);
        if (x === 0) g.moveTo(c.x + x, yy);
        else g.lineTo(c.x + x, yy);
      }
      g.strokeStyle = rgba('sound', 0.85);
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = rgba('sound', 1);
      g.beginPath();
      g.arc(fp.x, fp.y, 6, 0, Math.PI * 2);
      g.fill();
      g.font = FONT_SMALL;
      g.textAlign = 'left';
      g.fillStyle = 'rgba(233,228,218,0.5)';
      g.fillText(`${fmt(spec(o, sec.cutoff)!, val(o, sec.cutoff))} · res ${val(o, sec.res).toFixed(2)}`, c.x + 4, c.y + 10);
    }
  }
}

export interface PanelDrag {
  key: string;
  ctl: Ctl;
  point?: number;
}

export function panelPointerDown(app: App, mx: number, my: number): PanelDrag | null {
  const o = app.obj(app.panel?.id ?? null);
  if (!o || o.kind !== 'sound') return null;
  for (const c of layout(app, o)) {
    if (c.kind === 'adsr') {
      const pts = adsrPoints(o, c);
      for (const i of [1, 2, 4]) if (Math.hypot(mx - pts[i].x, my - pts[i].y) < 10) return { key: c.key, ctl: c, point: i };
    } else if (mx >= c.x - 6 && mx <= c.x + c.w + 6 && my >= c.y && my <= c.y + c.h) {
      const d = { key: c.key, ctl: c };
      panelPointerMove(app, d, mx, my);
      return d;
    }
  }
  return null;
}

export function panelPointerMove(app: App, d: PanelDrag, mx: number, my: number): void {
  const o = app.obj(app.panel?.id ?? null);
  if (!o || o.kind !== 'sound') return;
  const c = d.ctl;
  const set = (key: string, u: number) => {
    const s = spec(o, key);
    if (s) app.commitCoalesced(`p:${o.id}:${key}`, { op: 'set', id: o.id, path: ['params', key], value: denorm(s, u) });
  };
  if (c.kind === 'slider') {
    set(c.key, (mx - c.x) / c.w);
  } else if (c.kind === 'filter') {
    const sec = c.section as Extract<PanelSection, { kind: 'filter' }>;
    set(sec.cutoff, (mx - c.x) / c.w);
    set(sec.res, (c.y + c.h - 8 - my) / (c.h - 24));
  } else {
    const [a, dk, s, r] = (c.section as Extract<PanelSection, { kind: 'adsr' }>).keys;
    const pts = adsrPoints(o, c);
    const seg = c.w / 3.6;
    if (d.point === 1) set(a, (mx - c.x) / seg);
    else if (d.point === 2) {
      set(dk, (mx - pts[1].x) / seg);
      const base = c.y + c.h - 4;
      set(s, (base - my) / (base - (c.y + 6)));
    } else if (d.point === 4) set(r, (mx - pts[3].x) / seg);
  }
}
