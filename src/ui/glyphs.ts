// Shape encodes type.

export function soundPath(g: CanvasRenderingContext2D, glyph: string, x: number, y: number, r: number): void {
  g.beginPath();
  switch (glyph) {
    case 'triangle':
      g.moveTo(x, y - r * 1.1);
      g.lineTo(x + r * 1.0, y + r * 0.7);
      g.lineTo(x - r * 1.0, y + r * 0.7);
      g.closePath();
      return;
    case 'square':
      g.rect(x - r * 0.82, y - r * 0.82, r * 1.64, r * 1.64);
      return;
    case 'diamond':
      g.moveTo(x, y - r * 1.15);
      g.lineTo(x + r * 0.85, y);
      g.lineTo(x, y + r * 1.15);
      g.lineTo(x - r * 0.85, y);
      g.closePath();
      return;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      return;
    case 'pentagon':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const px = x + Math.cos(a) * r * 1.05;
        const py = y + Math.sin(a) * r * 1.05;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      return;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * 0.5 : r * 1.15;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      return;
    case 'burst':
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rr = i % 2 ? r * 0.78 : r * 1.05;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      return;
    case 'ring':
    default:
      g.arc(x, y, r, 0, Math.PI * 2);
  }
}

/** Extra inner detail drawn on top of the filled shape. */
export function soundDetail(g: CanvasRenderingContext2D, glyph: string, x: number, y: number, r: number): void {
  if (glyph === 'ring') {
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, Math.PI * 2);
    g.stroke();
  }
}
