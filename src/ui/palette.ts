import type { App } from './app.ts';
import { soundTypes } from '../core/sounds/registry.ts';
import { fieldTypes } from '../core/fields/registry.ts';
import type { Role } from '../core/types.ts';
import { FONT, rgba } from './theme.ts';
import { soundPath, soundDetail } from './glyphs.ts';

export interface PaletteItem {
  kind: 'sound' | 'field';
  type: string;
}

interface Slot {
  item: PaletteItem;
  role: Role | 'sound';
  label: string;
  x: number;
  y: number;
}

const SIZE = 30;
const X = 10;
const Y0 = 14;
const GROUP_GAP = 12;

function slots(): Slot[] {
  const out: Slot[] = [];
  let y = Y0;
  for (const t of Object.values(soundTypes)) {
    out.push({ item: { kind: 'sound', type: t.id }, role: 'sound', label: t.label, x: X, y });
    y += SIZE;
  }
  for (const role of ['generator', 'transformer', 'fx'] as const) {
    y += GROUP_GAP;
    for (const t of Object.values(fieldTypes)) {
      if (t.role !== role) continue;
      out.push({ item: { kind: 'field', type: t.id }, role, label: t.label, x: X, y });
      y += SIZE;
    }
  }
  return out;
}

const SLOTS = slots();

export function paletteHit(_app: App, mx: number, my: number): PaletteItem | null {
  for (const s of SLOTS) if (mx >= s.x && mx < s.x + SIZE && my >= s.y && my < s.y + SIZE) return s.item;
  return null;
}

export function drawPaletteIcon(g: CanvasRenderingContext2D, item: PaletteItem, cx: number, cy: number, r: number, a: number): void {
  if (item.kind === 'sound') {
    const t = soundTypes[item.type];
    g.fillStyle = rgba('sound', 0.8 * a);
    g.strokeStyle = rgba('sound', 0.9 * a);
    soundPath(g, t.glyph, cx, cy, r * 0.62);
    g.fill();
    g.strokeStyle = `rgba(11,11,14,${a})`;
    soundDetail(g, t.glyph, cx, cy, r * 0.62);
    return;
  }
  const t = fieldTypes[item.type];
  g.strokeStyle = rgba(t.role, 0.85 * a);
  g.fillStyle = rgba(t.role, 0.12 * a);
  g.lineWidth = 1.2;
  g.beginPath();
  if (t.shape === 'rect') g.rect(cx - r * 0.9, cy - r * 0.65, r * 1.8, r * 1.3);
  else g.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  g.fill();
  if (t.role === 'transformer') g.setLineDash([3, 2]);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = rgba(t.role, 0.95 * a);
  g.font = '12px ui-monospace, Menlo, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t.glyph, cx, cy + 0.5);
}

export function drawPalette(app: App): void {
  const g = app.g;
  const hovered = app.hover?.kind === 'palette' ? app.hover.item : null;
  for (const s of SLOTS) {
    const on = hovered && hovered.kind === s.item.kind && hovered.type === s.item.type;
    drawPaletteIcon(g, s.item, s.x + SIZE / 2, s.y + SIZE / 2, SIZE / 2 - 3, on ? 1 : 0.55);
    if (on) {
      g.font = FONT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = rgba(s.role, 0.9);
      g.fillText(s.label, s.x + SIZE + 6, s.y + SIZE / 2);
    }
  }
  if (app.drag?.kind === 'palette') {
    drawPaletteIcon(g, app.drag.item, app.mouse.x, app.mouse.y, 16, 0.8);
  }
}
