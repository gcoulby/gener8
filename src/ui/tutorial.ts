// The tutorial: a guided tour in three chapters (build a patch, mix and keep,
// explore), one move at a time. A card says what to do and a ring marks where;
// each step moves on by itself once it's done. It doesn't block the instrument:
// everything but the card lets events through to the canvas and the bar. Shown
// once on a first visit; **tutorial** in the bar (or the phone's sheet) runs it
// again, from the start or from any chapter.

import type { App } from './app.ts';
import type { Patch } from '../core/types.ts';
import { clone } from '../core/patch.ts';
import { isCircle } from '../core/geometry.ts';
import { fieldTypes, isMap } from '../core/fields/registry.ts';
import { isDisposable } from './share.ts';
import { paletteItemRect, type PaletteItem } from './palette.ts';
import { MOVE } from './motionbar.ts';
import { mixerRect } from './mixer.ts';
import { EXAMPLES } from './examples.ts';

const SEEN_KEY = 'gener8.tutorial';
/** How long a done step shows its tick before the next one. */
const DONE_MS = 900;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  round?: boolean;
  /** What the card must keep clear of, when more than the target: the menu it's in. */
  avoid?: Rect;
}

/** What a step started from: its done test compares against this. */
interface Mark {
  loads: number;
  captures: number;
  seed: number;
  feel: string;
  mix: string;
}

interface Step {
  /** Index into CHAPTERS; 0 is the welcome. */
  chapter: number;
  title: string;
  /** HTML; `m` is the phone layout. */
  body: (app: App, m: boolean) => string;
  /** Where to point, in CSS pixels, or null for nowhere. */
  target?: (app: App) => Rect | null;
  /** Moves on by itself once this is true. Steps without it wait for next. */
  done?: (app: App, from: Mark) => boolean;
}

const CHAPTERS = ['', 'build a patch', 'mix and keep', 'explore'];

const PLUCK: PaletteItem = { kind: 'sound', type: 'pluck' };
const PULSE: PaletteItem = { kind: 'field', type: 'pulse' };
const HARMONY: PaletteItem = { kind: 'field', type: 'harmony' };
const REVERB: PaletteItem = { kind: 'field', type: 'reverb' };

const sounds = (app: App) => app.patch.objects.filter((o) => o.kind === 'sound');
const hasRole = (app: App, role: string) => app.patch.objects.some((o) => o.kind === 'field' && fieldTypes[o.type]?.role === role);

function mark(app: App): Mark {
  const p = app.patch;
  return {
    loads: app.loads,
    captures: app.captures,
    seed: p.seed,
    feel: JSON.stringify([p.tempo, p.key]),
    mix: JSON.stringify([p.master ?? 0, p.objects.map((o) => [o.trim ?? 0, o.kind === 'sound' && !!o.mute, o.kind === 'sound' && !!o.solo])]),
  };
}

/** A palette item, or on a phone with the palette shut, the + that opens it (see drawPalette). */
function paletteTarget(item: PaletteItem) {
  return (app: App): Rect | null => paletteItemRect(app, item) ?? (app.mobile ? { x: 11, y: 49, w: 30, h: 30, round: true } : null);
}

/** The first of these named controls (`data-tut`, see bar.ts) on screen; on a phone, ☰ if none is. */
function ui(...names: string[]) {
  return (app: App): Rect | null => {
    for (const n of app.mobile ? [...names, 'menu'] : names) {
      for (const e of document.querySelectorAll(`[data-tut="${n}"]`)) {
        const r = e.getBoundingClientRect();
        if (!r.width || r.bottom <= 0 || r.top >= window.innerHeight) continue;
        const m = e.closest('.g8-pop')?.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height, round: n === 'menu', avoid: m && { x: m.left, y: m.top, w: m.width, h: m.height } };
      }
    }
    return null;
  };
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

/** The sound a generator plays, or failing that any sound. */
function firstSound(app: App): Rect | null {
  const s = sounds(app).find((o) => app.driven.has(o.id)) ?? sounds(app)[0];
  return s ? objRect(app, s.id) : null;
}

const STEPS: Step[] = [
  {
    chapter: 0,
    title: 'Welcome to GENER8',
    body: (app) =>
      `GENER8 makes music from where things sit. There are no cables or notes to draw: you place sounds, lay fields over them and let them play.<br><br>` +
      `This tour has three short chapters. Each step moves on by itself once you've done it. Start at the beginning, or jump to a chapter.` +
      (isDisposable(app.patch) ? '' : `<br><br>Your current patch is kept: you can go back to it at the end.`),
  },

  // ---------- 1: build a patch ----------
  {
    chapter: 1,
    title: 'Start the audio',
    body: (_app, m) => `${m ? 'Tap ▶' : 'Press <kbd>space</kbd> or ▶'} to start the audio. Nothing plays yet: the stage is empty.`,
    target: () => domRect('.g8-bar button.play'),
    done: (app) => app.playing,
  },
  {
    chapter: 1,
    title: 'The stage',
    body: () =>
      `This steel rectangle is a <b>map field</b>. It gives position a meaning: higher up plays higher notes, and left to right pans. Pitch snaps to the key in the bar.`,
    target: (app) => {
      const f = app.patch.objects.find(isMap);
      return f ? objRect(app, f.id) : null;
    },
  },
  {
    chapter: 1,
    title: 'Place a sound',
    body: (_app, m) =>
      `${m ? 'Tap <b>+</b> for the palette, then drag' : 'Drag'} a <b>pluck</b> (warm white, at the top of the palette) onto the stage. Any sound will do.<br><br>It's drawn hollow: nothing is playing it yet.`,
    target: paletteTarget(PLUCK),
    done: (app) => sounds(app).length > 0,
  },
  {
    chapter: 1,
    title: 'Make it play',
    body: (_app, m) =>
      `Drag a <b>pulse</b> (amber) ${m ? 'from the palette ' : ''}so it covers your sound. Amber fields are <b>generators</b>: the sound fills in and plays a rhythm.<br><br>Then try dragging the sound up and down the stage.`,
    target: paletteTarget(PULSE),
    done: (app) => app.driven.size > 0,
  },
  {
    chapter: 1,
    title: 'Change the notes',
    body: () =>
      `Teal fields are <b>transformers</b>: they change the notes a generator sends, on the way to the sound. Drag a <b>harmony</b> over your sound to add notes above each one.<br><br>Others thin the notes out, transpose, ratchet, swing or echo them.`,
    target: paletteTarget(HARMONY),
    done: (app) => hasRole(app, 'transformer'),
  },
  {
    chapter: 1,
    title: 'Call and response',
    body: () =>
      `Every note sends out a <b>ripple</b>. Drag a second sound just outside the amber circle, not too far: it stays hollow and answers when a ripple reaches it.<br><br>Layout alone makes the conversation.`,
    target: paletteTarget(PLUCK),
    done: (app) => sounds(app).length > 1 && sounds(app).some((o) => !app.driven.has(o.id)),
  },
  {
    chapter: 1,
    title: 'Add some space',
    body: () => `Drag a <b>reverb</b> (violet) over both sounds. Violet fields are <b>FX</b>: they process the audio of the sounds inside them. The deeper inside, the stronger.`,
    target: paletteTarget(REVERB),
    done: (app) => hasRole(app, 'fx'),
  },
  {
    chapter: 1,
    title: 'Look inside a sound',
    body: (_app, m) =>
      `${m ? 'Double-tap' : 'Double-click'} a sound, or zoom right in on it, to open its <b>internals</b>: oscillators, filter, envelope. Drag a value to change it.<br><br>${m ? 'Tap' : 'Click'} outside the panel to close it.`,
    target: (app) => (app.panel ? null : firstSound(app)),
    done: (app) => !!app.panel,
  },
  {
    chapter: 1,
    title: 'Set it moving',
    body: (_app, m) =>
      (m
        ? `Tap <b>pan</b> in the bar to switch to select, tap the first sound, then <b>edit</b>. Open <b>move: still ▾</b> and pick <b>orbit</b> or <b>bounce</b>.`
        : `Click the first sound to select it. In the bar under it, open <b>move: still ▾</b> and pick <b>orbit</b> or <b>bounce</b>.`) +
      `<br><br>Motion is modulation: as it moves across the stage, its pitch and pan move with it. Fields can move too.`,
    target: (app) => {
      if (app.panel) return null;
      const s = app.obj(app.sel);
      const move = s?.kind === 'sound' ? app.motionHits.find((h) => h.action.kind === 'axis' && h.action.axis === MOVE) : undefined;
      if (move) return { x: move.x, y: move.y, w: move.w, h: move.h };
      if (app.mobile && app.panMode) return domRect('.g8-bar button.mode');
      return firstSound(app);
    },
    done: (app) => sounds(app).some((o) => !!o.motion?.pos),
  },

  // ---------- 2: mix and keep ----------
  {
    chapter: 2,
    title: 'Mix and keep',
    body: () => `You've built a patch. This chapter sets its tempo and key, balances it in the mixer, goes back in time, and saves what you hear as audio or video.`,
  },
  {
    chapter: 2,
    title: 'Tempo and key',
    body: (_app, m) =>
      m
        ? `Tap ☰ for tempo, key and scale. Ripples, motion and generators all keep time with the tempo; map fields snap pitch to the key.`
        : `Drag or scroll <b>bpm</b> (shift: fine), or click it and type. The menus beside it set the <b>key</b> and <b>scale</b>.<br><br>Ripples, motion and generators all keep time with the tempo; map fields snap pitch to the key.`,
    target: ui('bpm'),
    done: (app, from) => mark(app).feel !== from.feel,
  },
  {
    chapter: 2,
    title: 'Open the mixer',
    body: (_app, m) => `${m ? 'Tap ☰, then' : 'Press'} <b>mixer</b>. Every sound gets a channel strip, with the FX returns and the master beside them.`,
    target: ui('mixer'),
    done: (app) => app.mixerOpen,
  },
  {
    chapter: 2,
    title: 'Balance it',
    body: (_app, m) =>
      `Drag a <b>fader</b> to set a sound's level, or ${m ? 'tap' : 'click'} <b>M</b> to mute it and <b>S</b> to solo it. ${m ? 'Double-tap' : 'Double-click'} a fader to put it back to 0 dB. The meters show what each one is playing.`,
    target: (app) => (app.mixerOpen ? mixerRect(app) : ui('mixer')(app)),
    done: (app, from) => mark(app).mix !== from.mix,
  },
  {
    chapter: 2,
    title: 'Go back in time',
    body: () =>
      `The <b>timeline</b> along the top of the bar holds the last five minutes. Drag along it to hear the patch as it was, and let go to carry on from there. <kbd>esc</kbd> while dragging cancels.<br><br>Nothing you try is lost.`,
    target: (app) => {
      const s = app.bar?.layout().strip;
      return s ? { x: s.x0, y: s.y, w: s.x1 - s.x0, h: s.h } : null;
    },
    done: (app) => !!app.scrub,
  },
  {
    chapter: 2,
    title: 'Capture what you heard',
    body: (_app, m) =>
      `${m ? 'In ☰, tap <b>● capture 30 s</b>' : 'Press <b>● capture</b> or <kbd>c</kbd>'} to save the <b>last 30 seconds</b> as a WAV, with the patch and every edit you made in that time.<br><br>It works after the fact: when something good happens, capture it.`,
    target: ui('capture'),
    done: (app, from) => app.captures > from.captures,
  },
  {
    chapter: 2,
    title: 'Render a take',
    body: (_app, m) =>
      `${m ? 'In ☰, <b>render</b>' : '<b>render ▾</b> (<kbd>shift</kbd>+<kbd>C</kbd>)'} plays the patch from a fresh start, up to an hour, faster than real time, and saves a <b>WAV</b>. Its <b>video</b> tab saves an <b>MP4</b> of the window, or a portrait <b>short</b>.<br><br>It renders in the background while you keep playing. Have a look; you don't have to render now.`,
    target: ui('take', 'render'),
    done: (app) => !app.mobile && app.bar?.menu === 'render',
  },

  // ---------- 3: explore ----------
  {
    chapter: 3,
    title: 'Explore',
    body: () => `Last chapter: finished patches to learn from, patches built from a random seed, starting fresh, sharing, and the guide.<br><br>Loading a patch replaces this one, but the timeline still has it.`,
  },
  {
    chapter: 3,
    title: 'Browse the examples',
    body: (_app, m) =>
      `${m ? 'In ☰, the' : 'Open <b>examples ▾</b>. The'} bundled patches show off one idea each: phasing loops, a Turing machine, a cellular automaton, a flock, polyrhythms. Load one.<br><br>Each opens with a card saying how it works.`,
    target: ui('examples-list', 'examples'),
    done: (app, from) => app.loads > from.loads,
  },
  {
    chapter: 3,
    title: 'A random patch',
    body: (_app, m) =>
      `${m ? 'In ☰, tap' : 'Open <b>patch ▾</b> and press'} <b>random</b>${m ? '' : ' (or <kbd>r</kbd>)'} for a whole patch built from a random seed. Over a patch you've edited it asks twice.<br><br>Under it, <b>new from a seed</b> builds one from a number or any words, the same every time. <b>roll</b> in the bar keeps the patch and changes its chances.`,
    target: ui('random', 'patch'),
    done: (app, from) => app.patch.seed !== from.seed,
  },
  {
    chapter: 3,
    title: 'Start fresh',
    body: (_app, m) => `${m ? 'In ☰, tap' : 'In <b>patch ▾</b>, press'} <b>new</b> for an empty stage, as at the start of this tour.`,
    target: ui('new', 'patch'),
    done: (app, from) => app.loads > from.loads && app.patch.objects.every(isMap),
  },
  {
    chapter: 3,
    title: 'Save and share',
    body: (_app, m) =>
      `<b>patch</b> ${m ? 'in ☰' : '▾'} also keeps your work:<br>` +
      `· <b>save…</b>${m ? '' : ' (<kbd>⌘S</kbd>)'} keeps it in this browser by name; <b>open…</b>${m ? '' : ' (<kbd>⌘O</kbd>)'} brings it back<br>` +
      `· <b>export</b> downloads it as a file; <b>import…</b> or dropping a file loads one<br>` +
      `· <b>share</b> copies a link with the whole patch in it<br>` +
      `· <b>info…</b>${m ? '' : ' (<kbd>i</kbd>)'} gives it a title, artist and notes`,
    target: ui('save', 'patch'),
  },
  {
    chapter: 3,
    title: 'Read the guide',
    body: (_app, m) =>
      `${m ? 'In ☰, <b>the guide</b>' : '<b>? help</b> (<kbd>h</kbd>)'} opens <b>At a glance</b>, the whole instrument on one page, and from there the full guide: every sound and field, map fields, ripples, motion, mixing, shortcuts.`,
    target: ui('help'),
    done: (app) => app.docs.isOpen,
  },
  {
    chapter: 3,
    title: "That's the tour",
    body: (_app, m) =>
      `Place, overlap, move; mix, capture, share. Come and hear what others are making on the <b>discord</b>.<br><br><b>tutorial</b> ${m ? 'in ☰' : 'in the bar'} runs this again, from any chapter.`,
  },
];

/** Index of a chapter's first step. */
const chapterStart = (c: number) => STEPS.findIndex((s) => s.chapter === c);

const CSS = `
.g8-tut{position:fixed;inset:0;z-index:17;pointer-events:none;font:13px/1.55 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif;color:#e9e4da}
.g8-tut *{box-sizing:border-box}
.g8-tut-ring{position:absolute;border:2px solid #f0a830;border-radius:8px;box-shadow:0 0 0 4px rgba(240,168,48,.18),0 0 24px rgba(240,168,48,.35);animation:g8-tut-pulse 1.6s ease-in-out infinite;display:none}
.g8-tut-ring.round{border-radius:999px}
@keyframes g8-tut-pulse{50%{box-shadow:0 0 0 8px rgba(240,168,48,.08),0 0 32px rgba(240,168,48,.5)}}
.g8-tut-card{position:absolute;width:min(330px,calc(100vw - 24px));pointer-events:auto;background:rgba(14,14,18,.97);border:1px solid rgba(240,168,48,.45);border-radius:10px;padding:10px 14px 12px;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.g8-tut-card .head{display:flex;justify-content:space-between;align-items:center;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:rgba(233,228,218,.45);letter-spacing:.06em;text-transform:uppercase}
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
.g8-tut-card .chapters{display:flex;flex-direction:column;gap:4px;margin-top:12px}
.g8-tut-card .chapters button{display:flex;justify-content:space-between;width:100%;height:30px;padding:0 12px;border-radius:6px;border:1px solid rgba(233,228,218,.14);background:rgba(233,228,218,.03);color:rgba(233,228,218,.8);font:12px ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer;align-items:center}
.g8-tut-card .chapters button:hover{background:rgba(233,228,218,.09);color:#e9e4da}
.g8-tut-card .chapters button span{color:rgba(233,228,218,.35)}
.g8-tut-card .foot{display:flex;gap:6px;justify-content:flex-end;margin-top:10px}
.g8-tut-card .foot button{height:28px;padding:0 12px;border-radius:14px;border:1px solid rgba(233,228,218,.18);background:rgba(11,11,14,.7);color:rgba(233,228,218,.78);font:11px ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
.g8-tut-card .foot button:hover{background:rgba(233,228,218,.09);color:#e9e4da}
.g8-tut-card .foot button.primary{color:#f0a830;border-color:rgba(240,168,48,.7)}
@media (pointer:coarse){.g8-tut-card .foot button,.g8-tut-card .chapters button{height:40px;padding:0 16px;font-size:13px}.g8-tut-card .foot button{border-radius:20px}.g8-tut-card .x{width:36px;height:36px}}
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
  /** The step's starting point, for its done test. */
  private from: Mark | null = null;
  /** The patch from before the tour first replaced it, when it was worth keeping. */
  private prev: Patch | null = null;
  private stashed = false;

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
    this.stashed = false;
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

  /** Keep the patch from before the tour, once, if it was worth keeping. */
  private stash(): void {
    if (this.stashed) return;
    this.stashed = true;
    this.prev = isDisposable(this.app.patch) ? null : clone(this.app.patch);
  }

  /** Start chapter `c`, with a patch to suit it. */
  private chapter(c: number): void {
    const app = this.app;
    this.stash();
    if (c === 1) {
      // the build starts from an empty stage
      app.newPatch();
      app.fitView();
    } else if (!app.patch.objects.some((o) => o.kind === 'sound')) {
      // mixing needs something to mix: the ambient demo
      app.loadExample(EXAMPLES[0]);
    }
    // later chapters assume it's playing (this click counts as the gesture audio needs)
    if (c > 1 && !app.playing) app.togglePlay();
    this.go(chapterStart(c));
  }

  private act(act: string): void {
    const last = STEPS.length - 1;
    const ch = act.match(/^chapter(\d)$/);
    if (ch) {
      this.chapter(Number(ch[1]));
      return;
    }
    switch (act) {
      case 'next':
        this.go(this.step + 1);
        return;
      case 'close':
        // part way through with a patch to go back to: the last card offers it
        if (this.step > 0 && this.step < last && this.prev) this.go(last);
        else this.close();
        return;
      case 'restore':
        if (this.prev && this.app.load(this.prev, 'your patch is back')) this.app.fitView();
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
    this.from = mark(this.app);
    this.shown = '';
  }

  /** Every frame: move on from a done step, and follow the target as the view and objects move. */
  sync(): void {
    if (!this.root) return;
    const app = this.app;
    const s = STEPS[this.step];
    const now = performance.now();
    if (s.done && !this.doneAt && s.done(app, this.from!)) this.doneAt = now;
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
    // a chapter's steps, for the counter and the progress dots
    const steps = STEPS.map((t, i) => [t, i] as const).filter(([t]) => t.chapter === s.chapter && s.chapter > 0);
    const at = steps.findIndex(([, i]) => i === this.step);
    const intro = at === 0 && !s.done && s.chapter > 1;
    let head = 'tutorial';
    let extra = '';
    let foot: string;
    if (this.step === 0) {
      extra =
        `<div class="chapters">` +
        CHAPTERS.slice(1)
          .map((c, i) => `<button type="button" data-act="chapter${i + 1}">${i + 1} · ${c}<span>${STEPS.filter((t) => t.chapter === i + 1).length} steps</span></button>`)
          .join('') +
        `</div>`;
      foot = b('done', 'not now') + b('chapter1', 'start', true);
    } else {
      head = `${s.chapter} · ${CHAPTERS[s.chapter]} · ${at + 1} / ${steps.length}`;
      extra = `<div class="dots">${steps.map((_, i) => `<i${i < at || (i === at && this.doneAt) ? ' class="on"' : ''}></i>`).join('')}</div>`;
      if (this.step === last) foot = (this.prev ? b('restore', 'back to my old patch') : '') + b('done', 'done', true);
      else if (intro) foot = b('close', 'stop here') + b('next', 'next', true);
      else foot = s.done ? b('next', 'skip') : b('next', 'next', true);
    }
    this.card.classList.toggle('ok', !!this.doneAt);
    this.card.innerHTML =
      `<div class="head"><span>${head}</span><button type="button" class="x" data-act="close" aria-label="close the tutorial" title="close">×</button></div>` +
      `<h4>${s.title}</h4><p>${s.body(app, app.mobile)}</p>${extra}<div class="foot">${foot}</div>`;
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
      // a phone's menus open from the bottom: keep clear of them
      y = this.app.mobile ? M : (H - this.app.barH - ch) / 2;
    } else {
      const P = 6;
      ring.display = 'block';
      ring.left = `${t.x - P}px`;
      ring.top = `${t.y - P}px`;
      ring.width = `${t.w + 2 * P}px`;
      ring.height = `${t.h + 2 * P}px`;
      this.ring.classList.toggle('round', !!t.round && Math.abs(t.w - t.h) < 4);
      const inBar = t.y >= H - this.app.barH - 2;
      // a phone has no room beside anything: dock at the top or the bottom, away from the target itself
      const away = inBar || t.y + t.h / 2 > H / 2 ? M : H;
      t = t.avoid ?? t;
      const G = P + 14;
      const midY = t.y + t.h / 2 - ch / 2;
      const midX = t.x + t.w / 2 - cw / 2;
      if (this.app.mobile) [x, y] = [midX, away];
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
