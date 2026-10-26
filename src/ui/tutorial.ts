// The tutorial: a guided first patch, one move at a time. A card says what to
// do and a ring marks where; each step moves on by itself once it's done. It
// doesn't block the instrument: everything but the card lets events through to
// the canvas and the bar. Shown once on a first visit; **tutorial** in the bar
// (or the phone's sheet) runs it again.

import type { App } from './app.ts';
import type { Patch } from '../core/types.ts';
import { clone } from '../core/patch.ts';
import { isCircle } from '../core/geometry.ts';
import { fieldTypes, isMap } from '../core/fields/registry.ts';
import { isDisposable } from './share.ts';
import { paletteItemRect, type PaletteItem } from './palette.ts';
import { MOVE } from './motionbar.ts';

const SEEN_KEY = 'gener8.tutorial';
/** How long a done step shows its tick before the next one. */
const DONE_MS = 900;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  round?: boolean;
}

interface Step {
  title: string;
  /** HTML; `m` is the phone layout. */
  body: (app: App, m: boolean) => string;
  /** Where to point, in CSS pixels, or null for nowhere. */
  target?: (app: App) => Rect | null;
  /** Moves on by itself once this is true. Steps without it wait for next. */
  done?: (app: App) => boolean;
}

const PLUCK: PaletteItem = { kind: 'sound', type: 'pluck' };
const PULSE: PaletteItem = { kind: 'field', type: 'pulse' };
const REVERB: PaletteItem = { kind: 'field', type: 'reverb' };

const sounds = (app: App) => app.patch.objects.filter((o) => o.kind === 'sound');

/** A palette item, or on a phone with the palette shut, the + that opens it (see drawPalette). */
function paletteTarget(item: PaletteItem) {
  return (app: App): Rect | null => paletteItemRect(app, item) ?? (app.mobile ? { x: 11, y: 49, w: 30, h: 30, round: true } : null);
}

function domRect(sel: string): Rect | null {
  const e = document.querySelector(sel);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height, round: true } : null;
}

/** An object's box on screen (unrotated). */
function objRect(app: App, id: string): Rect | null {
  const o = app.obj(id);
  if (!o) return null;
  const p = app.poseOf(o);
  const [sx, sy] = app.w2s(p.x, p.y);
  if (o.kind === 'sound') {
    const r = app.soundRadius(o);
    return { x: sx - r, y: sy - r, w: 2 * r, h: 2 * r, round: true };
  }
  const z = app.cam.zoom * p.scale;
  if (isCircle(o.shape)) return { x: sx - o.shape.r * z, y: sy - o.shape.r * z, w: 2 * o.shape.r * z, h: 2 * o.shape.r * z, round: true };
  return { x: sx - (o.shape.w * z) / 2, y: sy - (o.shape.h * z) / 2, w: o.shape.w * z, h: o.shape.h * z };
}

const STEPS: Step[] = [
  {
    title: 'Build a first patch',
    body: (app) =>
      `GENER8 makes music from where things sit. There are no cables or notes to draw: you place sounds, lay fields over them and let them play.<br><br>This builds a patch from an empty stage, one move at a time. Each step moves on by itself once you've done it.` +
      (isDisposable(app.patch) ? '' : `<br><br>Your current patch is kept: you can go back to it at the end.`),
  },
  {
    title: 'Start the audio',
    body: (_app, m) => `${m ? 'Tap ▶' : 'Press <kbd>space</kbd> or ▶'} to start the audio. Nothing plays yet: the stage is empty.`,
    target: () => domRect('.g8-bar button.play'),
    done: (app) => app.playing,
  },
  {
    title: 'The stage',
    body: () =>
      `This steel rectangle is a <b>map field</b>. It gives position a meaning: higher up plays higher notes, and left to right pans. Pitch snaps to the key in the bar.`,
    target: (app) => {
      const f = app.patch.objects.find(isMap);
      return f ? objRect(app, f.id) : null;
    },
  },
  {
    title: 'Place a sound',
    body: (_app, m) =>
      `${m ? 'Tap <b>+</b> for the palette, then drag' : 'Drag'} a <b>pluck</b> (warm white, at the top of the palette) onto the stage. Any sound will do.<br><br>It's drawn hollow: nothing is playing it yet.`,
    target: paletteTarget(PLUCK),
    done: (app) => sounds(app).length > 0,
  },
  {
    title: 'Make it play',
    body: (_app, m) =>
      `Drag a <b>pulse</b> (amber) ${m ? 'from the palette ' : ''}so it covers your sound. Amber fields are <b>generators</b>: the sound fills in and plays a rhythm.<br><br>Then try dragging the sound up and down the stage.`,
    target: paletteTarget(PULSE),
    done: (app) => app.driven.size > 0,
  },
  {
    title: 'Call and response',
    body: () =>
      `Every note sends out a <b>ripple</b>. Drag a second sound just outside the amber circle, not too far: it stays hollow and answers when a ripple reaches it.<br><br>Layout alone makes the conversation.`,
    target: paletteTarget(PLUCK),
    done: (app) => sounds(app).length > 1 && sounds(app).some((o) => !app.driven.has(o.id)),
  },
  {
    title: 'Add some space',
    body: () => `Drag a <b>reverb</b> (violet) over both sounds. Violet fields are <b>FX</b>: they process the audio of the sounds inside them. The deeper inside, the stronger.`,
    target: paletteTarget(REVERB),
    done: (app) => app.patch.objects.some((o) => o.kind === 'field' && fieldTypes[o.type]?.role === 'fx'),
  },
  {
    title: 'Set it moving',
    body: (_app, m) =>
      (m
        ? `Tap <b>pan</b> in the bar to switch to select, tap the first sound, then <b>edit</b>. Open <b>move: still ▾</b> and pick <b>orbit</b> or <b>bounce</b>.`
        : `Click the first sound to select it. In the bar under it, open <b>move: still ▾</b> and pick <b>orbit</b> or <b>bounce</b>.`) +
      `<br><br>Motion is modulation: as it moves across the stage, its pitch and pan move with it.`,
    target: (app) => {
      const s = app.obj(app.sel);
      const move = s?.kind === 'sound' ? app.motionHits.find((h) => h.action.kind === 'axis' && h.action.axis === MOVE) : undefined;
      if (move) return { x: move.x, y: move.y, w: move.w, h: move.h };
      if (app.mobile && app.panMode) return domRect('.g8-bar button.mode');
      const first = sounds(app).find((o) => app.driven.has(o.id)) ?? sounds(app)[0];
      return first ? objRect(app, first.id) : null;
    },
    done: (app) => sounds(app).some((o) => !!o.motion?.pos),
  },
  {
    title: "That's the flow",
    body: (_app, m) =>
      `Place, overlap, move. From here:<br>` +
      `· drag along the <b>timeline</b> to hear the last five minutes and branch from any point, so nothing you try is lost<br>` +
      `· ${m ? '<b>☰</b> has the examples and the guide' : '<b>examples ▾</b> has finished patches, and <b>? help</b> the guide'}<br>` +
      `· <b>tutorial</b> ${m ? 'in ☰' : 'in the bar'} runs this again`,
    target: (app) => {
      const s = app.bar?.layout().strip;
      return s ? { x: s.x0, y: s.y, w: s.x1 - s.x0, h: s.h } : null;
    },
  },
];

const CSS = `
.g8-tut{position:fixed;inset:0;z-index:17;pointer-events:none;font:13px/1.55 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif;color:#e9e4da}
.g8-tut *{box-sizing:border-box}
.g8-tut-ring{position:absolute;border:2px solid #f0a830;border-radius:8px;box-shadow:0 0 0 4px rgba(240,168,48,.18),0 0 24px rgba(240,168,48,.35);animation:g8-tut-pulse 1.6s ease-in-out infinite;display:none}
.g8-tut-ring.round{border-radius:999px}
@keyframes g8-tut-pulse{50%{box-shadow:0 0 0 8px rgba(240,168,48,.08),0 0 32px rgba(240,168,48,.5)}}
.g8-tut-card{position:absolute;width:min(320px,calc(100vw - 24px));pointer-events:auto;background:rgba(14,14,18,.97);border:1px solid rgba(240,168,48,.45);border-radius:10px;padding:10px 14px 12px;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.g8-tut-card .head{display:flex;justify-content:space-between;align-items:center;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:rgba(233,228,218,.45);letter-spacing:.06em}
.g8-tut-card .x{width:24px;height:24px;margin-right:-6px;border:0;background:none;color:rgba(233,228,218,.6);font-size:16px;line-height:1;cursor:pointer;border-radius:12px}
.g8-tut-card .x:hover{color:#e9e4da;background:rgba(233,228,218,.08)}
.g8-tut-card h4{margin:4px 0 6px;font-size:15px;font-weight:620}
.g8-tut-card.ok h4::after{content:' ✓';color:#3cc8b4}
.g8-tut-card p{margin:0;color:rgba(233,228,218,.86)}
.g8-tut-card b{color:#fff;font-weight:620}
.g8-tut-card kbd{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid rgba(233,228,218,.35);border-bottom-width:2px;border-radius:4px;padding:0 5px;background:rgba(233,228,218,.06)}
.g8-tut-card .dots{display:flex;gap:4px;margin-top:12px}
.g8-tut-card .dots i{flex:1;height:3px;border-radius:2px;background:rgba(233,228,218,.12)}
.g8-tut-card .dots i.on{background:#f0a830}
.g8-tut-card .foot{display:flex;gap:6px;justify-content:flex-end;margin-top:10px}
.g8-tut-card .foot button{height:28px;padding:0 12px;border-radius:14px;border:1px solid rgba(233,228,218,.18);background:rgba(11,11,14,.7);color:rgba(233,228,218,.78);font:11px ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
.g8-tut-card .foot button:hover{background:rgba(233,228,218,.09);color:#e9e4da}
.g8-tut-card .foot button.primary{color:#f0a830;border-color:rgba(240,168,48,.7)}
@media (pointer:coarse){.g8-tut-card .foot button{height:40px;padding:0 16px;font-size:13px;border-radius:20px}.g8-tut-card .x{width:36px;height:36px}}
`;

/** Has the tutorial been shown in this browser? */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export class Tutorial {
  private readonly app: App;
  private root: HTMLDivElement | null = null;
  private ring!: HTMLDivElement;
  private card!: HTMLDivElement;
  private step = 0;
  /** What the card was last drawn for, so it's only rebuilt when that changes. */
  private shown = '';
  private doneAt = 0;
  /** The patch from before the tutorial cleared the stage, when it was worth keeping. */
  private prev: Patch | null = null;

  constructor(app: App) {
    this.app = app;
  }

  get isOpen(): boolean {
    return !!this.root;
  }

  open(): void {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage unavailable */
    }
    if (!this.root) this.build();
    this.prev = null;
    this.go(0);
  }

  close(): void {
    this.root?.remove();
    this.root = null;
    this.prev = null;
  }

  /** Is this element part of the tutorial? */
  owns(t: EventTarget | null): boolean {
    return t instanceof Node && !!this.root?.contains(t);
  }

  private build(): void {
    if (!document.getElementById('g8-tut-css')) {
      const style = document.createElement('style');
      style.id = 'g8-tut-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    const root = document.createElement('div');
    root.className = 'g8-tut';
    this.ring = document.createElement('div');
    this.ring.className = 'g8-tut-ring';
    this.card = document.createElement('div');
    this.card.className = 'g8-tut-card';
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-label', 'tutorial');
    // buttons don't keep the focus, so space and the other shortcuts still reach the instrument
    this.card.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    this.card.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.act;
      if (act) this.act(act);
    });
    this.card.addEventListener('wheel', (e) => e.stopPropagation());
    root.append(this.ring, this.card);
    document.body.append(root);
    this.root = root;
  }

  private act(act: string): void {
    const app = this.app;
    const last = STEPS.length - 1;
    switch (act) {
      case 'start':
        // clear to the stage; keep an edited patch to go back to
        this.prev = isDisposable(app.patch) ? null : clone(app.patch);
        app.newPatch();
        app.fitView();
        this.go(1);
        return;
      case 'next':
        this.go(this.step + 1);
        return;
      case 'close':
        // part way through with a patch to go back to: the last card offers it
        if (this.step > 0 && this.step < last && this.prev) this.go(last);
        else this.close();
        return;
      case 'restore':
        if (this.prev && app.load(this.prev, 'your patch is back')) app.fitView();
        this.close();
        return;
      case 'done':
        this.close();
        return;
    }
  }

  private go(i: number): void {
    this.step = Math.min(STEPS.length - 1, Math.max(0, i));
    this.doneAt = 0;
    this.shown = '';
  }

  /** Every frame: move on from a done step, and follow the target as the view and objects move. */
  sync(): void {
    if (!this.root) return;
    const app = this.app;
    const s = STEPS[this.step];
    const now = performance.now();
    if (s.done && !this.doneAt && s.done(app)) this.doneAt = now;
    if (this.doneAt && now - this.doneAt > DONE_MS) this.go(this.step + 1);
    this.render();
    this.place(STEPS[this.step].target?.(app) ?? null);
  }

  private render(): void {
    const app = this.app;
    const key = `${this.step}|${app.mobile}|${!!this.doneAt}`;
    if (key === this.shown) return;
    this.shown = key;
    const s = STEPS[this.step];
    const last = STEPS.length - 1;
    const b = (act: string, text: string, primary = false) => `<button type="button" data-act="${act}"${primary ? ' class="primary"' : ''}>${text}</button>`;
    let foot: string;
    if (this.step === 0) foot = b('done', 'not now') + b('start', 'start', true);
    else if (this.step === last) foot = (this.prev ? b('restore', 'back to my old patch') : '') + b('done', 'done', true);
    else foot = s.done ? b('next', 'skip') : b('next', 'next', true);
    const dots = STEPS.slice(1).map((_, i) => `<i${i < this.step ? ' class="on"' : ''}></i>`).join('');
    this.card.classList.toggle('ok', !!this.doneAt);
    this.card.innerHTML =
      `<div class="head"><span>TUTORIAL${this.step ? ` · ${this.step} / ${last}` : ''}</span><button type="button" class="x" data-act="close" aria-label="close the tutorial" title="close">×</button></div>` +
      `<h4>${s.title}</h4><p>${s.body(app, app.mobile)}</p>` +
      (this.step ? `<div class="dots">${dots}</div>` : '') +
      `<div class="foot">${foot}</div>`;
  }

  /** Ring the target and put the card beside it, wherever there's room; centred with no target. */
  private place(t: Rect | null): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cw = this.card.offsetWidth;
    const ch = this.card.offsetHeight;
    const M = 12;
    const ring = this.ring.style;
    let x: number;
    let y: number;
    if (!t) {
      ring.display = 'none';
      x = (W - cw) / 2;
      y = (H - this.app.barH - ch) / 2;
    } else {
      const P = 6;
      ring.display = 'block';
      ring.left = `${t.x - P}px`;
      ring.top = `${t.y - P}px`;
      ring.width = `${t.w + 2 * P}px`;
      ring.height = `${t.h + 2 * P}px`;
      this.ring.classList.toggle('round', !!t.round && Math.abs(t.w - t.h) < 4);
      const G = P + 14;
      const midY = t.y + t.h / 2 - ch / 2;
      const midX = t.x + t.w / 2 - cw / 2;
      const inBar = t.y >= H - this.app.barH - 2;
      // a phone has no room beside anything: dock at the top or the bottom, away from the target
      if (this.app.mobile) [x, y] = [midX, inBar || t.y + t.h / 2 > H / 2 ? M : H];
      else if (inBar) [x, y] = [midX, t.y - G - ch];
      else if (t.x + t.w + G + cw <= W - M) [x, y] = [t.x + t.w + G, midY];
      else if (t.x - G - cw >= M) [x, y] = [t.x - G - cw, midY];
      else if (t.y - G - ch >= M) [x, y] = [midX, t.y - G - ch];
      else [x, y] = [midX, t.y + t.h + G];
    }
    // never over the bar
    x = Math.min(W - cw - M, Math.max(M, x));
    y = Math.min(H - this.app.barH - ch - M, Math.max(M, y));
    this.card.style.left = `${Math.round(x)}px`;
    this.card.style.top = `${Math.round(y)}px`;
  }
}
