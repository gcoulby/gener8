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
const COLS = 2;
const X = 10;
export const PALETTE_TOP = 72;
const GROUP_GAP = 12;

/** Two columns, one block per role. */
function slots(top: number): Slot[] {
  const out: Slot[] = [];
  let y = top;
  const groups: [Role | 'sound', { item: PaletteItem; label: string }[]][] = [
    ['sound', Object.values(soundTypes).map((t) => ({ item: { kind: 'sound', type: t.id }, label: t.label }))],
  ];
  for (const role of ['generator', 'transformer', 'fx', 'map'] as const) {
    groups.push([
      role,
      Object.values(fieldTypes)
        .filter((t) => t.role === role)
        .map((t) => ({ item: { kind: 'field', type: t.id }, label: t.label })),
    ]);
  }
  for (const [role, items] of groups) {
    items.forEach((it, i) => {
      out.push({ ...it, role, x: X + (i % COLS) * SIZE, y: y + Math.floor(i / COLS) * SIZE });
    });
    y += Math.ceil(items.length / COLS) * SIZE + GROUP_GAP;
  }
  return out;
}

const DESKTOP = slots(PALETTE_TOP);
const MOBILE = slots(92);

/** On mobile the palette lives behind a toggle under the logo. */
function visibleSlots(app: App): Slot[] {
  if (!app.mobile) return DESKTOP;
  return app.paletteOpen ? MOBILE : [];
}

export function paletteHit(app: App, mx: number, my: number): PaletteItem | null {
  for (const s of visibleSlots(app)) if (mx >= s.x && mx < s.x + SIZE && my >= s.y && my < s.y + SIZE) return s.item;
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
  if (t.role === 'transformer' || t.role === 'map') g.setLineDash([3, 2]);
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
  if (app.mobile) {
    g.strokeStyle = 'rgba(233,228,218,0.5)';
    g.fillStyle = app.paletteOpen ? 'rgba(233,228,218,0.85)' : 'rgba(233,228,218,0.06)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(26, 64, 15, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = app.paletteOpen ? '#0b0b0e' : 'rgba(233,228,218,0.85)';
    g.font = '18px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(app.paletteOpen ? '×' : '+', 26, 65);
    if (app.paletteOpen) {
      const sl = MOBILE;
      const bottom = Math.max(...sl.map((s) => s.y)) + SIZE + 8;
      g.fillStyle = 'rgba(11,11,14,0.88)';
      g.beginPath();
      g.roundRect(4, 84, COLS * SIZE + 12, bottom - 84, 8);
      g.fill();
    }
  }
  for (const s of visibleSlots(app)) {
    const on = hovered && hovered.kind === s.item.kind && hovered.type === s.item.type;
    drawPaletteIcon(g, s.item, s.x + SIZE / 2, s.y + SIZE / 2, SIZE / 2 - 3, on ? 1 : 0.55);
    if (on) {
      g.font = FONT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = rgba(s.role, 0.9);
      g.fillText(s.label, X + COLS * SIZE + 6, s.y + SIZE / 2);
    }
  }
  if (app.drag?.kind === 'palette') {
    drawPaletteIcon(g, app.drag.item, app.mouse.x, app.mouse.y, 16, 0.8);
  }
}
