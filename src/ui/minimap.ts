// Minimap: the whole patch in a corner, with the view as a rectangle. Click or
// drag in it to move the view; scroll over it to zoom. `n` toggles it.

import type { App } from './app.ts';
import { byLayer } from '../core/patch.ts';
import { isCircle } from '../core/geometry.ts';
import { fieldTypes } from '../core/fields/registry.ts';
import { triCorner } from '../core/fields/maps.ts';
import { FONT_SMALL, INK, rgba } from './theme.ts';

/** Screen rect plus the world → minimap mapping: scale s around world point (cx, cy). */
export interface MiniTf {
  x: number;
  y: number;
  w: number;
  h: number;
  s: number;
  cx: number;
  cy: number;
}

const TAU = Math.PI * 2;

export function minimapRect(app: App): { x: number; y: number; w: number; h: number } | null {
  if (!app.showMinimap || app.panel) return null;
  const w = app.mobile ? 132 : 200;
  const h = app.mobile ? 88 : 130;
  return { x: app.W - w - (app.mobile ? 8 : 12), y: app.mobile ? 8 : 12, w, h };
}

export function inMinimap(app: App, mx: number, my: number): boolean {
  const r = minimapRect(app);
  return !!r && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
}

/** Fit everything in the patch plus the current view, with a margin. */
export function minimapTf(app: App): MiniTf | null {
  const r = minimapRect(app);
  if (!r) return null;
  const [vx0, vy1] = app.s2w(0, 0);
  const [vx1, vy0] = app.s2w(app.W, app.H - app.barH);
  let x0 = vx0;
  let x1 = vx1;
  let y0 = vy0;
  let y1 = vy1;
  for (const o of app.view.objects) {
    const p = app.poseOf(o);
    const hw = o.kind === 'sound' ? o.size / 2 : isCircle(o.shape) ? o.shape.r * p.scale : (o.shape.w * p.scale) / 2;
    const hh = o.kind === 'sound' ? o.size / 2 : isCircle(o.shape) ? o.shape.r * p.scale : (o.shape.h * p.scale) / 2;
    x0 = Math.min(x0, p.x - hw);
    x1 = Math.max(x1, p.x + hw);
    y0 = Math.min(y0, p.y - hh);
    y1 = Math.max(y1, p.y + hh);
  }
  const pad = 6;
  const s = Math.min((r.w - 2 * pad) / (x1 - x0 || 1), (r.h - 2 * pad) / (y1 - y0 || 1));
  return { ...r, s, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

export function w2m(tf: MiniTf, wx: number, wy: number): [number, number] {
  return [tf.x + tf.w / 2 + (wx - tf.cx) * tf.s, tf.y + tf.h / 2 - (wy - tf.cy) * tf.s];
}

export function m2w(tf: MiniTf, mx: number, my: number): [number, number] {
  return [tf.cx + (mx - tf.x - tf.w / 2) / tf.s, tf.cy - (my - tf.y - tf.h / 2) / tf.s];
}

export function drawMinimap(app: App): void {
  // while dragging in it, keep the mapping it started with so the map doesn't slide under the pointer
  const tf = app.drag?.kind === 'minimap' ? app.drag.tf : minimapTf(app);
  if (!tf) return;
  const g = app.g;
  g.fillStyle = 'rgba(11,11,14,0.86)';
  g.strokeStyle = 'rgba(233,228,218,0.18)';
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(tf.x, tf.y, tf.w, tf.h, 6);
  g.fill();
  g.stroke();
  g.save();
  g.beginPath();
  g.roundRect(tf.x, tf.y, tf.w, tf.h, 6);
  g.clip();

  const objs = app.view.objects.slice().sort(byLayer);
  for (const o of objs) {
    if (o.kind !== 'field') continue;
    const t = fieldTypes[o.type];
    const role = t?.role ?? 'fx';
    const p = app.poseOf(o);
    const [mx, my] = w2m(tf, p.x, p.y);
    g.strokeStyle = rgba(role, role === 'map' ? 0.35 : 0.5);
    g.fillStyle = rgba(role, role === 'map' ? 0.03 : 0.08);
    g.beginPath();
    if (!isCircle(o.shape)) {
      const w = o.shape.w * p.scale * tf.s;
      const h = o.shape.h * p.scale * tf.s;
      g.rect(mx - w / 2, my - h / 2, w, h);
    } else if (t?.shape === 'triangle') {
      for (let i = 0; i < 3; i++) {
        const [cx, cy] = triCorner(i, o.shape.r * p.scale * tf.s);
        if (i) g.lineTo(mx + cx, my - cy);
        else g.moveTo(mx + cx, my - cy);
      }
      g.closePath();
    } else g.arc(mx, my, Math.max(1.5, o.shape.r * p.scale * tf.s), 0, TAU);
    g.fill();
    g.stroke();
  }
  for (const o of objs) {
    if (o.kind !== 'sound') continue;
    const p = app.poseOf(o);
    const [mx, my] = w2m(tf, p.x, p.y);
    const pulse = app.pulses.get(o.id);
    const k = pulse ? Math.max(0, 1 - (app.now - pulse.t) / 300) : 0;
    g.fillStyle = rgba('sound', 0.55 + 0.45 * k);
    g.beginPath();
    g.arc(mx, my, Math.max(1.6, ((o.size * p.scale) / 2) * tf.s) + 1.5 * k, 0, TAU);
    g.fill();
  }
  const sel = app.obj(app.sel);
  if (sel) {
    const p = app.poseOf(sel);
    const [mx, my] = w2m(tf, p.x, p.y);
    g.strokeStyle = INK;
    g.beginPath();
    g.arc(mx, my, 4, 0, TAU);
    g.stroke();
  }

  // the view
  const [ax, ay] = w2m(tf, ...app.s2w(0, 0));
  const [bx, by] = w2m(tf, ...app.s2w(app.W, app.H - app.barH));
  g.strokeStyle = 'rgba(233,228,218,0.75)';
  g.fillStyle = 'rgba(233,228,218,0.05)';
  g.beginPath();
  g.rect(ax, ay, bx - ax, by - ay);
  g.fill();
  g.stroke();
  g.restore();

  if (app.hover?.kind === 'minimap' || app.drag?.kind === 'minimap') {
    g.font = FONT_SMALL;
    g.fillStyle = 'rgba(233,228,218,0.45)';
    g.textAlign = 'right';
    g.textBaseline = 'top';
    g.fillText('drag to move · scroll to zoom · n hides', tf.x + tf.w, tf.y + tf.h + 4);
  }
}
