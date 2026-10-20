// Mixer drawer: master, FX returns and one strip per sound. Faders are dB trims
// stored in the patch (so captures and replays include them), with mute/solo
// per sound and live peak meters from the engine.

import type { App } from './app.ts';
import type { Edit, PatchObject, Role } from '../core/types.ts';
import { byLayer } from '../core/patch.ts';
import { soundTypes } from '../core/sounds/registry.ts';
import { fieldTypes } from '../core/fields/registry.ts';
import { FONT_SMALL, rgba } from './theme.ts';
import { soundPath } from './glyphs.ts';

export const DB_MIN = -40;
export const DB_MAX = 12;
const STRIP_W = 62;
const SHORT: Record<string, string> = { subtractive: 'subtr', 'tape delay': 'delay', percussion: 'perc' };
const PAD = 12;

export interface MixerHit {
  kind: 'fader' | 'mute' | 'solo' | 'label';
  id: string; // object id, or 'master'
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Strip {
  id: string;
  label: string;
  sub: string;
  role: Role | 'sound' | 'master';
  glyph?: string;
  db: number;
  mute?: boolean;
  solo?: boolean;
}

export function mixerHeight(app: App): number {
  return app.mobile ? 210 : 230;
}

export function mixerRect(app: App): { x: number; y: number; w: number; h: number } {
  const h = mixerHeight(app);
  return { x: 0, y: app.H - app.barH - h, w: app.W, h };
}

function strips(app: App): Strip[] {
  const p = app.patch;
  const out: Strip[] = [{ id: 'master', label: 'master', sub: '', role: 'master', db: p.master ?? 0 }];
  const objs = p.objects.slice().sort(byLayer);
  for (const o of objs) {
    if (o.kind !== 'field') continue;
    const t = fieldTypes[o.type];
    if (t?.role === 'fx' && t.kind === 'bus') out.push({ id: o.id, label: t.label, sub: o.id + ' return', role: 'fx', db: o.trim ?? 0 });
  }
  for (const o of objs) {
    if (o.kind !== 'sound') continue;
    const t = soundTypes[o.type];
    out.push({ id: o.id, label: t?.label ?? o.type, sub: o.id, role: 'sound', glyph: t?.glyph, db: o.trim ?? 0, mute: o.mute, solo: o.solo });
  }
  return out;
}

const dbToU = (db: number) => (db - DB_MIN) / (DB_MAX - DB_MIN);
export const uToDb = (u: number) => Math.round((DB_MIN + Math.min(1, Math.max(0, u)) * (DB_MAX - DB_MIN)) * 2) / 2;

function meterDb(v: number): number {
  return v > 1e-5 ? 20 * Math.log10(v) : -100;
}

/** Fader track geometry inside a strip. */
function track(r: { y: number; h: number }): { top: number; bottom: number } {
  return { top: r.y + 54, bottom: r.y + r.h - 54 };
}

export function drawMixer(app: App): void {
  app.mixerHits = [];
  if (!app.mixerOpen) return;
  const g = app.g;
  const r = mixerRect(app);
  g.fillStyle = 'rgba(11,11,14,0.94)';
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = 'rgba(233,228,218,0.12)';
  g.fillRect(r.x, r.y, r.w, 1);

  const list = strips(app);
  const contentW = PAD + list.length * STRIP_W;
  app.mixerScroll = Math.min(Math.max(0, app.mixerScroll), Math.max(0, contentW - r.w + PAD));
  const { top, bottom } = track(r);
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  list.forEach((s, i) => {
    const x = r.x + PAD + i * STRIP_W - app.mixerScroll;
    if (x > r.w || x + STRIP_W < 0) return;
    const cx = x + STRIP_W / 2 - 6;
    const colour = (a: number) => (s.role === 'master' ? `rgba(233,228,218,${a})` : rgba(s.role, a));
    const sel = app.sel === s.id;
    if (sel) {
      g.fillStyle = 'rgba(233,228,218,0.05)';
      g.fillRect(x - 4, r.y + 6, STRIP_W - 4, r.h - 12);
    }
    if (i === 1 || (s.role === 'sound' && list[i - 1].role !== 'sound')) {
      g.fillStyle = 'rgba(233,228,218,0.1)';
      g.fillRect(x - 6, r.y + 14, 1, r.h - 28);
    }

    // label
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = FONT_SMALL;
    if (s.glyph) {
      g.fillStyle = colour(0.8);
      soundPath(g, s.glyph, cx, r.y + 16, 6);
      g.fill();
    } else {
      g.fillStyle = colour(0.85);
      g.fillText(s.role === 'master' ? '◆' : '◌', cx, r.y + 16);
    }
    g.fillStyle = colour(sel ? 1 : 0.75);
    g.fillText(SHORT[s.label] ?? s.label.slice(0, 8), cx, r.y + 30);
    if (s.role !== 'master') {
      g.fillStyle = 'rgba(233,228,218,0.35)';
      g.fillText(s.id, cx, r.y + 42);
    }
    app.mixerHits.push({ kind: 'label', id: s.id, x, y: r.y + 6, w: STRIP_W - 6, h: 42 });

    // meter
    const level = app.meterLevel.get(s.id) ?? 0;
    const mu = Math.min(1, Math.max(0, (meterDb(level) - DB_MIN) / (0 - DB_MIN)));
    g.fillStyle = 'rgba(233,228,218,0.07)';
    g.fillRect(cx + 10, top, 4, bottom - top);
    g.fillStyle = mu > 0.97 ? 'rgba(240,90,90,0.9)' : colour(0.75);
    g.fillRect(cx + 10, bottom - (bottom - top) * mu, 4, (bottom - top) * mu);

    // fader
    const u = dbToU(s.db);
    const silenced = s.mute || (app.anySolo() && s.role === 'sound' && !s.solo);
    g.fillStyle = 'rgba(233,228,218,0.1)';
    g.fillRect(cx - 1, top, 2, bottom - top);
    const zy = bottom - (bottom - top) * dbToU(0);
    g.fillRect(cx - 7, zy, 14, 1);
    const ky = bottom - (bottom - top) * u;
    g.fillStyle = silenced ? 'rgba(233,228,218,0.3)' : colour(0.95);
    g.beginPath();
    g.roundRect(cx - 9, ky - 5, 18, 10, 3);
    g.fill();
    app.mixerHits.push({ kind: 'fader', id: s.id, x: cx - 16, y: top - 8, w: 32, h: bottom - top + 16 });

    g.fillStyle = 'rgba(233,228,218,0.55)';
    g.fillText(`${s.db > 0 ? '+' : ''}${s.db.toFixed(s.db % 1 ? 1 : 0)}`, cx, bottom + 12);

    // mute / solo
    if (s.role === 'sound') {
      const by = bottom + 26;
      const btn = (label: string, on: boolean, kind: 'mute' | 'solo', bx: number, onColour: string) => {
        g.fillStyle = on ? onColour : 'rgba(233,228,218,0.08)';
        g.beginPath();
        g.roundRect(bx, by, 20, 16, 3);
        g.fill();
        g.fillStyle = on ? '#0b0b0e' : 'rgba(233,228,218,0.6)';
        g.fillText(label, bx + 10, by + 8.5);
        app.mixerHits.push({ kind, id: s.id, x: bx - 2, y: by - 2, w: 24, h: 20 });
      };
      btn('M', !!s.mute, 'mute', cx - 22, 'rgba(240,90,90,0.9)');
      btn('S', !!s.solo, 'solo', cx + 2, 'rgba(240,200,80,0.95)');
    }
  });
  g.restore();
  if (contentW > r.w) {
    g.fillStyle = 'rgba(233,228,218,0.3)';
    g.textAlign = 'right';
    g.textBaseline = 'top';
    g.fillText(app.mobile ? 'swipe for more →' : 'scroll for more →', r.w - 12, r.y + 6);
  }
}

export function mixerHitAt(app: App, mx: number, my: number): MixerHit | null {
  for (const h of app.mixerHits) if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) return h;
  return null;
}

export function faderDbAt(app: App, my: number): number {
  const { top, bottom } = track(mixerRect(app));
  return uToDb((bottom - my) / (bottom - top));
}

export function trimEdit(app: App, id: string, db: number): Edit {
  if (id === 'master') return { op: 'master', value: db };
  return { op: 'set', id, path: ['trim'], value: db === 0 ? null : db };
}

export function toggleEdit(app: App, id: string, kind: 'mute' | 'solo'): Edit | null {
  const o = app.patch.objects.find((q) => q.id === id) as PatchObject | undefined;
  if (!o || o.kind !== 'sound') return null;
  return { op: 'set', id, path: [kind], value: o[kind] ? null : true };
}
