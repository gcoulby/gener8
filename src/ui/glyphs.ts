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
    case 'octagon':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const px = x + Math.cos(a) * r * 1.05;
        const py = y + Math.sin(a) * r * 1.05;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      return;
    case 'dome':
      // flat side down: weight at the bottom
      g.moveTo(x - r * 1.05, y + r * 0.55);
      g.arc(x, y + r * 0.55, r * 1.05, Math.PI, 0);
      g.closePath();
      return;
    case 'ring':
    default:
      g.arc(x, y, r, 0, Math.PI * 2);
  }
}

/**
 * Extra inner detail drawn on top of the filled shape, in the current stroke
 * style. `variant` picks the macro sound's mark for its model.
 */
export function soundDetail(g: CanvasRenderingContext2D, glyph: string, x: number, y: number, r: number, variant = -1): void {
  if (glyph === 'ring') {
    g.beginPath();
    g.arc(x, y, r * 0.55, 0, Math.PI * 2);
    g.stroke();
  } else if (glyph === 'octagon' && variant >= 0 && r >= 6) {
    modelMark(g, Math.round(variant), x, y, r * 0.5);
  }
}

const dot = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
};

/** One small mark per macro model: vowel, chords, swarm, fold, grain, particle, modal, string. */
function modelMark(g: CanvasRenderingContext2D, model: number, x: number, y: number, s: number): void {
  g.fillStyle = g.strokeStyle;
  const d = Math.max(1, s * 0.16);
  g.beginPath();
  switch (model) {
    case 0: // vowel: an open mouth
      g.ellipse(x, y, s * 0.55, s * 0.4, 0, 0, Math.PI * 2);
      g.stroke();
      return;
    case 1: // chords: stacked notes
      for (let i = -1; i <= 1; i++) {
        g.moveTo(x - s * 0.6, y + i * s * 0.45);
        g.lineTo(x + s * 0.6, y + i * s * 0.45);
      }
      g.stroke();
      return;
    case 2: // swarm: a ring of dots
      for (let i = 0; i < 6; i++) dot(g, x + Math.cos((i / 6) * Math.PI * 2) * s * 0.6, y + Math.sin((i / 6) * Math.PI * 2) * s * 0.6, d);
      return;
    case 3: // fold: a zigzag
      g.moveTo(x - s * 0.75, y + s * 0.3);
      g.lineTo(x - s * 0.25, y - s * 0.4);
      g.lineTo(x + s * 0.25, y + s * 0.4);
      g.lineTo(x + s * 0.75, y - s * 0.3);
      g.stroke();
      return;
    case 4: // grain: a row of dots
      for (let i = -1; i <= 1; i++) dot(g, x + i * s * 0.55, y, d);
      return;
    case 5: // particle: scattered specks
      dot(g, x - s * 0.5, y - s * 0.35, d * 0.8);
      dot(g, x + s * 0.4, y - s * 0.15, d);
      dot(g, x - s * 0.1, y + s * 0.5, d * 0.7);
      return;
    case 6: // modal: a struck bar
      g.rect(x - s * 0.7, y - s * 0.18, s * 1.4, s * 0.36);
      g.stroke();
      return;
    case 7: // string: a taut line
      g.moveTo(x, y - s * 0.8);
      g.lineTo(x, y + s * 0.8);
      g.stroke();
      return;
  }
}
