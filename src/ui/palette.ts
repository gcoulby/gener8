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

/** Cell size: as large as fits the window, within these bounds. */
const MAX_SIZE = 30;
const MIN_SIZE = 20;
const X = 10;
export const PALETTE_TOP = 72;
const MOBILE_TOP = 92;
const GROUP_GAP = 12;

const GROUPS: [Role | 'sound', { item: PaletteItem; label: string }[]][] = [
  ['sound', Object.values(soundTypes).map((t) => ({ item: { kind: 'sound', type: t.id }, label: t.label }))],
  ...(['generator', 'transformer', 'fx', 'map'] as const).map(
    (role): [Role, { item: PaletteItem; label: string }[]] => [
      role,
      Object.values(fieldTypes)
        .filter((t) => t.role === role)
        .map((t) => ({ item: { kind: 'field', type: t.id }, label: t.label })),
    ],
  ),
];

interface Layout {
  slots: Slot[];
  size: number;
  cols: number;
}

/** Right edge of the palette at its widest (three full-size columns). */
export const PALETTE_RIGHT = X + 3 * MAX_SIZE + 6;

/**
 * One block per role, three columns, with cells shrunk to fit the height
 * available. A window too short even for the smallest cells gets four columns.
 */
function layoutFor(top: number, avail: number): Layout {
  const gaps = (GROUPS.length - 1) * GROUP_GAP;
  let cols = 3;
  let rows = GROUPS.reduce((n, [, items]) => n + Math.ceil(items.length / cols), 0);
  let size = Math.floor((avail - gaps) / rows);
  if (size < MIN_SIZE) {
    cols = 4;
    rows = GROUPS.reduce((n, [, items]) => n + Math.ceil(items.length / cols), 0);
    size = Math.floor((avail - gaps) / rows);
  }
  size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, size));
  const slots: Slot[] = [];
  let y = top;
  for (const [role, items] of GROUPS) {
    items.forEach((it, i) => slots.push({ ...it, role, x: X + (i % cols) * size, y: y + Math.floor(i / cols) * size }));
    y += Math.ceil(items.length / cols) * size + GROUP_GAP;
  }
  return { slots, size, cols };
}

let cached: { key: string; layout: Layout } | null = null;

function layout(app: App): Layout {
  const top = app.mobile ? MOBILE_TOP : PALETTE_TOP;
  const avail = app.H - app.barH - top - 12;
  const key = `${top}:${avail}`;
  if (cached?.key !== key) cached = { key, layout: layoutFor(top, avail) };
  return cached.layout;
}

/** On mobile the palette lives behind a toggle under the logo. */
function visibleSlots(app: App): Slot[] {
  if (app.mobile && !app.paletteOpen) return [];
  return layout(app).slots;
}

export function paletteHit(app: App, mx: number, my: number): PaletteItem | null {
  const size = layout(app).size;
  for (const s of visibleSlots(app)) if (mx >= s.x && mx < s.x + size && my >= s.y && my < s.y + size) return s.item;
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
    soundDetail(g, t.glyph, cx, cy, r * 0.62, t.params.find((p) => p.key === 'model')?.default ?? -1);
    return;
  }
  const t = fieldTypes[item.type];
  g.strokeStyle = rgba(t.role, 0.85 * a);
  g.fillStyle = rgba(t.role, 0.12 * a);
  g.lineWidth = 1.2;
  g.beginPath();
  if (t.shape === 'rect') g.rect(cx - r * 0.9, cy - r * 0.65, r * 1.8, r * 1.3);
  else if (t.shape === 'triangle') {
    g.moveTo(cx, cy - r * 0.95);
    g.lineTo(cx + r * 0.95, cy + r * 0.7);
    g.lineTo(cx - r * 0.95, cy + r * 0.7);
    g.closePath();
  } else g.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
  g.fill();
  if (t.role === 'transformer' || t.role === 'map') g.setLineDash([3, 2]);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = rgba(t.role, 0.95 * a);
  g.font = `${Math.round(Math.max(9, Math.min(12, r)))}px ui-monospace, Menlo, monospace`;
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
      const { slots, size, cols } = layout(app);
      const bottom = Math.max(...slots.map((s) => s.y)) + size + 8;
      g.fillStyle = 'rgba(11,11,14,0.88)';
      g.beginPath();
      g.roundRect(4, MOBILE_TOP - 8, cols * size + 12, bottom - MOBILE_TOP + 8, 8);
      g.fill();
    }
  }
  const { size, cols } = layout(app);
  for (const s of visibleSlots(app)) {
    const on = hovered && hovered.kind === s.item.kind && hovered.type === s.item.type;
    drawPaletteIcon(g, s.item, s.x + size / 2, s.y + size / 2, size / 2 - 3, on ? 1 : 0.55);
    if (on) {
      g.font = FONT;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = rgba(s.role, 0.9);
      g.fillText(s.label, X + cols * size + 6, s.y + size / 2);
    }
  }
  if (app.drag?.kind === 'palette') {
    drawPaletteIcon(g, app.drag.item, app.mouse.x, app.mouse.y, 16, 0.8);
  }
}
