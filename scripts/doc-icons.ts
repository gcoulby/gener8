// Draws the palette icons into docs/guide/icons/*.svg for the guide's tables:
// the same drawing code as the app's palette, recorded into SVG instead of a
// canvas, so the icons and their colours always match. Each sits on a dark
// tile so it reads on a light page (GitHub) as well.
//
//   npm run doc-icons     (after adding or changing a type or a glyph)

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { soundTypes } from '../src/core/sounds/registry.ts';
import { fieldTypes } from '../src/core/fields/registry.ts';
import { MACRO_MODELS } from '../src/core/sounds/macro.ts';
import { drawPaletteIcon, type PaletteItem } from '../src/ui/palette.ts';
import { soundDetail, soundPath } from '../src/ui/glyphs.ts';
import { BG, rgba } from '../src/ui/theme.ts';

const OUT = new URL('../docs/guide/icons/', import.meta.url);
const VIEW = 30;
const SHOWN = 24;

const n = (v: number) => String(Math.round(v * 100) / 100);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Just enough of CanvasRenderingContext2D for the icon code, writing SVG elements. */
class SvgRecorder {
  fillStyle = '#000';
  strokeStyle = '#000';
  lineWidth = 1;
  font = '10px sans-serif';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  out: string[] = [];
  private d = '';
  private dash = '';

  beginPath(): void {
    this.d = '';
  }
  moveTo(x: number, y: number): void {
    this.d += `M${n(x)} ${n(y)}`;
  }
  lineTo(x: number, y: number): void {
    this.d += `${this.d ? 'L' : 'M'}${n(x)} ${n(y)}`;
  }
  closePath(): void {
    this.d += 'Z';
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.d += `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.d += `Q${n(cx)} ${n(cy)} ${n(x)} ${n(y)}`;
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw);
  }
  ellipse(x: number, y: number, rx: number, ry: number, _rot: number, a0: number, a1: number, ccw = false): void {
    const at = (a: number) => `${n(x + Math.cos(a) * rx)} ${n(y + Math.sin(a) * ry)}`;
    this.d += `${this.d ? 'L' : 'M'}${at(a0)}`;
    const T = Math.PI * 2;
    if ((ccw ? a0 - a1 : a1 - a0) >= T - 1e-6) {
      // a full turn is two half arcs
      const s = ccw ? 0 : 1;
      this.d += `A${n(rx)} ${n(ry)} 0 1 ${s} ${at(a0 + (ccw ? -Math.PI : Math.PI))}A${n(rx)} ${n(ry)} 0 1 ${s} ${at(a0)}`;
    } else {
      // like canvas: the arc runs the given way round, wrapping past a full turn if it has to
      let span = ccw ? a0 - a1 : a1 - a0;
      span = ((span % T) + T) % T;
      this.d += `A${n(rx)} ${n(ry)} 0 ${span > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${at(a1)}`;
    }
  }
  setLineDash(d: number[]): void {
    this.dash = d.length ? d.join(' ') : '';
  }
  fill(): void {
    this.out.push(`<path d="${this.d}" fill="${this.fillStyle}"/>`);
  }
  stroke(): void {
    const dash = this.dash ? ` stroke-dasharray="${this.dash}"` : '';
    this.out.push(`<path d="${this.d}" fill="none" stroke="${this.strokeStyle}" stroke-width="${n(this.lineWidth)}"${dash}/>`);
  }
  fillText(t: string, x: number, y: number): void {
    const size = /(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? '12';
    const anchor = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' ? 'end' : 'start';
    this.out.push(
      `<text x="${n(x)}" y="${n(y)}" font-size="${size}" font-family="ui-monospace, Menlo, monospace" text-anchor="${anchor}" dominant-baseline="central" fill="${this.fillStyle}">${esc(t)}</text>`,
    );
  }
}

function svg(title: string, draw: (g: CanvasRenderingContext2D) => void): string {
  const rec = new SvgRecorder();
  draw(rec as unknown as CanvasRenderingContext2D);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHOWN}" height="${SHOWN}" viewBox="0 0 ${VIEW} ${VIEW}" role="img" aria-label="${esc(title)}">`,
    `<title>${esc(title)}</title>`,
    `<rect width="${VIEW}" height="${VIEW}" rx="6" fill="${BG}"/>`,
    ...rec.out,
    `</svg>`,
    '',
  ].join('\n');
}

const icon = (item: PaletteItem, title: string) => svg(title, (g) => drawPaletteIcon(g, item, VIEW / 2, VIEW / 2, VIEW / 2 - 3, 1));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const t of Object.values(soundTypes)) writeFileSync(new URL(`sound-${t.id}.svg`, OUT), icon({ kind: 'sound', type: t.id }, t.label));
for (const t of Object.values(fieldTypes)) writeFileSync(new URL(`field-${t.id}.svg`, OUT), icon({ kind: 'field', type: t.id }, t.label));
// the macro sound once per model, with that model's mark
const r = (VIEW / 2 - 3) * 0.62 * 1.4;
MACRO_MODELS.forEach((m, i) => {
  const out = svg(`macro: ${m}`, (g) => {
    g.fillStyle = rgba('sound', 0.8);
    soundPath(g, 'octagon', VIEW / 2, VIEW / 2, r);
    g.fill();
    g.strokeStyle = BG;
    g.lineWidth = 1.4;
    soundDetail(g, 'octagon', VIEW / 2, VIEW / 2, r, i);
  });
  writeFileSync(new URL(`macro-${m}.svg`, OUT), out);
});
console.log(`wrote ${readdirSync(OUT).length} icons to docs/guide/icons/`);
