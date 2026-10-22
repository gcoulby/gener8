// The bottom bar: transport, the patch's level / tempo / key / seed, the
// history strip, recording and the patch menus. Unlike the rest of the UI it
// is DOM, for real text entry and controls a finger can hit; the canvas draws
// the strip into the slot it leaves (see timeline.ts). On a phone it is one
// row of big controls plus a sheet holding everything else, kept above the
// on-screen keyboard. Video frames have no DOM: they draw a read-only bar.

import type { App } from './app.ts';
import { EXAMPLES } from './examples.ts';
import { DB_MAX, DB_MIN } from './mixer.ts';
import { NOTE_NAMES, SCALE_LABELS, SCALE_ORDER } from '../core/music.ts';
import { strHash } from '../core/rand.ts';
import { fmtRenderSpec, fmtTime, fmtVideoSpec, parseRenderSpec, parseVideoSpec, SHORT, type VideoSpec } from './takespec.ts';

/** Seed text → uint32: digits within range are used as is, anything else is hashed. */
export function parseSeed(text: string): number {
  const t = text.trim();
  if (/^\d{1,10}$/.test(t) && Number(t) <= 4294967295) return Number(t);
  return strHash(t) >>> 0;
}

export function fmtDb(db: number): string {
  return `${db > 0 ? '+' : ''}${db.toFixed(db % 1 ? 1 : 0)} dB`;
}

const MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace';
const SANS = 'ui-sans-serif,-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif';
const CARET = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0h8L4 5z' fill='%23e9e4da' fill-opacity='.5'/%3E%3C/svg%3E")`;

const CSS = `
.g8-bar{position:fixed;left:0;right:0;bottom:0;z-index:10;display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:"s s s" "l . r";grid-template-rows:28px 40px;align-items:center;column-gap:14px;padding:0 10px;pointer-events:none;font:11px ${MONO};color:#e9e4da;user-select:none;-webkit-user-select:none;color-scheme:dark}
.g8-bar *,.g8-pop *{box-sizing:border-box}
.g8-bar .grp{display:flex;align-items:center;gap:6px;pointer-events:auto;min-width:0}
.g8-bar .l{grid-area:l}.g8-bar .r{grid-area:r}
.g8-bar .slot{grid-area:s;align-self:stretch;margin:6px 0 0}
.g8-bar .sep{width:1px;height:16px;background:rgba(233,228,218,.12);margin:0 4px;flex:none}
.g8-bar .dim{color:rgba(233,228,218,.3);font-variant-numeric:tabular-nums;min-width:3ch;text-align:right}
@media (min-width:1700px){.g8-bar:not(.mobile){grid-template-columns:auto minmax(240px,1fr) auto;grid-template-areas:"l s r";grid-template-rows:40px}.g8-bar:not(.mobile) .slot{margin:6px 0}}
@media (max-width:1160px){.g8-bar:not(.mobile){grid-template-columns:auto 1fr;grid-template-areas:"s s" "l ." "r .";grid-template-rows:28px 40px 36px}.g8-bar:not(.mobile) .r{padding-bottom:4px}}
.g8-bar button,.g8-pop button,.g8-num,.g8-sel{height:26px;padding:0 10px;border-radius:13px;border:1px solid rgba(233,228,218,.14);background:rgba(11,11,14,.7);color:rgba(233,228,218,.78);font:11px ${MONO};cursor:pointer;white-space:nowrap;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;outline:none}
.g8-bar button:hover,.g8-pop button:hover,.g8-num:hover,.g8-sel:hover{background:rgba(233,228,218,.09);color:#e9e4da;border-color:rgba(233,228,218,.28)}
.g8-bar button:focus-visible,.g8-pop button:focus-visible,.g8-num:focus-visible,.g8-sel:focus-visible{border-color:rgba(240,168,48,.8)}
.g8-bar button.on,.g8-pop button.on{color:#f0a830;border-color:rgba(240,168,48,.6);background:rgba(240,168,48,.08)}
.g8-bar button.rec,.g8-pop button.rec{color:rgba(240,110,110,.95);border-color:rgba(240,90,90,.35)}
.g8-bar button.rec:hover,.g8-pop button.rec:hover{background:rgba(240,90,90,.12)}
.g8-bar button.busy{color:#f06e6e;border-color:rgba(240,90,90,.6);font-variant-numeric:tabular-nums}
.g8-bar button.play{width:30px;height:30px;padding:0;border-radius:15px;font-size:12px;color:#e9e4da;border-color:rgba(233,228,218,.3)}
.g8-bar button.play.going{border-color:rgba(60,200,180,.6);color:#3cc8b4}
.g8-num{position:relative;overflow:hidden;cursor:ew-resize;touch-action:none;font-variant-numeric:tabular-nums}
.g8-num .k{color:rgba(233,228,218,.4);position:relative}
.g8-num .v{position:relative;min-width:var(--w,4ch);text-align:right}
.g8-num .fill{position:absolute;left:0;top:0;bottom:0;background:rgba(240,168,48,.16);border-right:1px solid rgba(240,168,48,.55);pointer-events:none}
.g8-num input{position:relative;width:var(--w,4ch);min-width:5ch;height:20px;padding:0 4px;margin:0 -4px;border:0;border-radius:4px;background:rgba(233,228,218,.1);color:#e9e4da;font:inherit;text-align:right;outline:1px solid rgba(240,168,48,.7)}
.g8-sel{appearance:none;-webkit-appearance:none;padding-right:22px;background-image:${CARET};background-repeat:no-repeat;background-position:right 9px center}
.g8-sel option{background:#0b0b0e;color:#e9e4da}
.g8-bar.mobile{grid-template-columns:1fr;grid-template-areas:"s" "l";grid-template-rows:36px 56px;padding:0 8px env(safe-area-inset-bottom)}
.g8-bar.mobile .slot{margin:6px 0 0}
.g8-bar.mobile .grp{gap:6px}
.g8-bar.mobile button,.g8-bar.mobile .g8-num{height:40px;border-radius:20px;font-size:13px;padding:0 12px}
.g8-bar.mobile button.play,.g8-bar.mobile button.menu{width:44px;height:44px;border-radius:22px;padding:0;font-size:15px}
.g8-bar.mobile button.key{display:block;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;text-align:left;line-height:38px}
.g8-bar.mobile .g8-num{padding:0 11px;flex:0 1 auto;min-width:0}
.g8-bar.mobile .g8-num .v{min-width:0}
.g8-bar.mobile .g8-num.vol .k{display:none}
.g8-bar.mobile .grow{flex:1}
.g8-pop{position:fixed;z-index:16;width:320px;max-height:calc(var(--g8-vh,100vh) - 70px);overflow-y:auto;background:rgba(14,14,18,.98);border:1px solid rgba(233,228,218,.18);border-radius:10px;padding:12px 14px 14px;font:12px/1.45 ${SANS};color:#e9e4da;color-scheme:dark;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.g8-pop.wide{width:380px}
.g8-pop h3{font:11px ${MONO};letter-spacing:.08em;text-transform:uppercase;color:rgba(233,228,218,.45);margin:14px 0 8px;font-weight:400;display:flex;justify-content:space-between;align-items:center}
.g8-pop h3:first-child{margin-top:2px}
.g8-pop .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
.g8-pop .grid button{width:100%;justify-content:space-between}
.g8-pop .kbd{color:rgba(233,228,218,.3)}
.g8-pop .list{display:flex;flex-direction:column;gap:2px}
.g8-pop .list button{width:100%;justify-content:space-between;border-color:transparent;background:none;border-radius:6px;height:28px}
.g8-pop .list button:hover{background:rgba(233,228,218,.08)}
.g8-pop .row{display:flex;gap:6px;align-items:center;margin:0 0 8px;flex-wrap:wrap}
.g8-pop .row>label{width:58px;flex:none;font:11px ${MONO};color:rgba(233,228,218,.5)}
.g8-pop .chips{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.g8-pop .chips button{height:24px;padding:0 9px}
.g8-pop input[type=text]{flex:1;min-width:0;height:28px;padding:0 9px;font:12px ${MONO};color:#e9e4da;background:rgba(233,228,218,.05);border:1px solid rgba(233,228,218,.2);border-radius:6px;outline:none}
.g8-pop input[type=text]:focus{border-color:rgba(240,168,48,.7)}
.g8-pop input.bad{border-color:rgba(240,90,90,.8)}
.g8-pop .hint{font-size:11px;color:rgba(233,228,218,.45);margin:4px 0 0}
.g8-pop .foot{display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:12px}
.g8-pop .foot .hint{flex:1;margin:0}
.g8-pop button.primary{color:#f0a830;border-color:rgba(240,168,48,.7)}
.g8-pop .tabs{display:flex;gap:4px;margin:0 0 12px}
.g8-pop .tabs button{flex:1}
.g8-pop .progress{height:6px;border-radius:3px;background:rgba(233,228,218,.1);overflow:hidden;margin:6px 0 4px}
.g8-pop .progress>i{display:block;height:100%;background:#f06e6e}
.g8-pop .ctl{display:flex;gap:6px;align-items:center;flex:1;min-width:0}
.g8-pop .ctl .g8-num{flex:1;justify-content:space-between;touch-action:pan-y}
.g8-scrim{position:fixed;inset:0;z-index:15;background:rgba(5,5,7,.55)}
.g8-pop.sheet{left:0;right:0;width:auto;bottom:var(--g8-kb,0px);max-height:calc(var(--g8-vh,100vh) - 24px);border-radius:16px 16px 0 0;border-bottom:0;padding:6px 16px calc(18px + env(safe-area-inset-bottom));font-size:14px;overscroll-behavior:contain}
.g8-pop.sheet .head{position:sticky;top:-6px;z-index:1;margin:0 -16px;padding:4px 16px 6px;background:rgb(14,14,18);display:flex;justify-content:space-between;align-items:center}
.g8-pop.sheet .head .grab{position:absolute;left:50%;top:6px;width:40px;height:4px;margin-left:-20px;border-radius:2px;background:rgba(233,228,218,.25)}
.g8-pop.sheet .head p{font:12px ${MONO};letter-spacing:.08em;color:rgba(233,228,218,.45);margin:8px 0 0}
.g8-pop.sheet .ctl .g8-num{justify-content:center}
.g8-pop.sheet .ctl .g8-num .k{display:none}
.g8-pop.sheet button,.g8-pop.sheet .g8-num,.g8-pop.sheet .g8-sel{height:44px;border-radius:22px;font-size:14px;padding:0 14px}
.g8-pop.sheet .chips button{height:38px;padding:0 13px;font-size:13px}
.g8-pop.sheet .list button{height:44px;font-size:14px}
.g8-pop.sheet button.step{width:44px;padding:0;font-size:18px}
.g8-pop.sheet .grid{grid-template-columns:1fr 1fr}
.g8-pop.sheet .row{flex-direction:column;align-items:stretch;gap:6px;margin-bottom:12px}
.g8-pop.sheet .row>label{width:auto;font-size:12px}
.g8-pop.sheet .ctl .g8-num .v{min-width:0}
.g8-pop.sheet .g8-sel{flex:1}
.g8-pop.sheet input[type=text]{height:44px;font-size:16px;border-radius:10px}
.g8-pop.sheet h3{font-size:12px;margin:20px 0 10px}
`;

/** A number you drag, scroll, type or step: level, tempo, seed. */
interface ScrubOpts {
  label: string;
  /** Tooltip and accessible name. */
  title: string;
  get: () => number;
  /** `live` while dragging: the App coalesces those. */
  set: (v: number, live: boolean) => void;
  fmt: (v: number) => string;
  /** What the text box starts with when typing a value. */
  text?: (v: number) => string;
  parse: (t: string) => number | null;
  min: number;
  max: number;
  step: number;
  /** With shift held. */
  fine: number;
  /** Drag pixels per step. */
  px: number;
  /** Double-click goes back to this. */
  reset?: number;
  /** A level bar behind the value. */
  fill?: boolean;
  /** Width of the value, in characters, so the bar doesn't jitter. */
  chars?: number;
  /** A tap without a drag does this instead of opening the text box. */
  onTap?: () => void;
}

class Scrub {
  readonly el: HTMLDivElement;
  private readonly o: ScrubOpts;
  private readonly val: HTMLSpanElement;
  private readonly fillEl: HTMLSpanElement | null = null;
  private shown = '';
  private editing = false;
  private drag: { x: number; start: number; moved: boolean } | null = null;
  private tapTimer = 0;
  private wheelAcc = 0;

  constructor(o: ScrubOpts) {
    this.o = o;
    const el = (this.el = document.createElement('div'));
    el.className = 'g8-num';
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', o.title);
    el.setAttribute('aria-valuemin', String(o.min));
    el.setAttribute('aria-valuemax', String(o.max));
    const hints = ['drag or scroll (shift: fine)', o.onTap ? 'tap for more' : 'click to type'];
    if (o.reset !== undefined) hints.push(`double-click: ${o.fmt(o.reset)}`);
    el.title = `${o.title} · ${hints.join(' · ')}`;
    if (o.chars) el.style.setProperty('--w', o.chars + 'ch');
    if (o.fill) {
      this.fillEl = document.createElement('span');
      this.fillEl.className = 'fill';
      el.append(this.fillEl);
    }
    if (o.label) el.append(span('k', o.label));
    this.val = span('v', '');
    el.append(this.val);

    el.addEventListener('pointerdown', (e) => {
      if (this.editing || e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, start: o.get(), moved: false };
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) < 4) return;
      d.moved = true;
      this.put(d.start + (dx / o.px) * (e.shiftKey ? o.fine : o.step), e.shiftKey, true);
    });
    el.addEventListener('pointerup', () => {
      const d = this.drag;
      this.drag = null;
      if (d && !d.moved) this.tap();
    });
    el.addEventListener('pointercancel', () => (this.drag = null));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.editing) return;
      // a trackpad sends a stream of small deltas: one step per notch's worth
      const dy = e.deltaY || -e.deltaX;
      if (e.deltaMode === 0 && Math.abs(dy) < 40) {
        this.wheelAcc += dy;
        if (Math.abs(this.wheelAcc) < 40) return;
      } else this.wheelAcc = dy;
      const dir = this.wheelAcc < 0 ? 1 : -1;
      this.wheelAcc = 0;
      this.put(o.get() + dir * (e.shiftKey ? o.fine : o.step), e.shiftKey, false);
    }, { passive: false });
    el.addEventListener('dblclick', () => {
      if (o.reset === undefined || this.editing) return;
      clearTimeout(this.tapTimer);
      o.set(o.reset, false);
    });
    el.addEventListener('keydown', (e) => {
      if (this.editing) return;
      const up = e.key === 'ArrowUp' || e.key === 'ArrowRight';
      const down = e.key === 'ArrowDown' || e.key === 'ArrowLeft';
      if (up || down) {
        e.preventDefault();
        e.stopPropagation();
        this.put(o.get() + (up ? 1 : -1) * (e.shiftKey ? o.fine : o.step), e.shiftKey, false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.edit();
      }
    });
  }

  /** Step by `n` steps (the − / + buttons). */
  nudge(n: number): void {
    this.put(this.o.get() + n * this.o.step, false, false);
  }

  private put(v: number, fine: boolean, live: boolean): void {
    const q = fine ? this.o.fine : this.o.step;
    v = Math.round(v / q) * q;
    this.o.set(+Math.min(this.o.max, Math.max(this.o.min, v)).toFixed(4), live);
  }

  private tap(): void {
    if (this.o.onTap) return this.o.onTap();
    // wait to see whether it's a double-click (reset) before opening the box
    clearTimeout(this.tapTimer);
    if (this.o.reset === undefined) this.edit();
    else this.tapTimer = window.setTimeout(() => this.edit(), 230);
  }

  edit(): void {
    if (this.editing) return;
    this.editing = true;
    const o = this.o;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.inputMode = o.min < 0 ? 'text' : 'decimal';
    inp.value = (o.text ?? String)(o.get());
    inp.spellcheck = false;
    inp.autocomplete = 'off';
    inp.setAttribute('aria-label', o.title);
    this.val.replaceWith(inp);
    let done = false;
    const finish = (keep: boolean) => {
      if (done) return;
      done = true;
      if (keep) {
        const v = o.parse(inp.value);
        if (v !== null && Number.isFinite(v)) o.set(Math.min(o.max, Math.max(o.min, v)), false);
      }
      inp.replaceWith(this.val);
      this.editing = false;
      this.shown = '';
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    inp.addEventListener('pointerdown', (e) => e.stopPropagation());
    inp.addEventListener('blur', () => finish(true));
    inp.focus();
    inp.select();
  }

  /** Show the current value; true if what's shown changed. */
  sync(): boolean {
    if (this.editing) return false;
    const v = this.o.get();
    const s = this.o.fmt(v);
    if (s === this.shown) return false;
    this.shown = s;
    this.val.textContent = s;
    this.el.setAttribute('aria-valuenow', String(v));
    this.el.setAttribute('aria-valuetext', s);
    if (this.fillEl) this.fillEl.style.width = `${(100 * (Math.min(this.o.max, Math.max(this.o.min, v)) - this.o.min)) / (this.o.max - this.o.min)}%`;
    return true;
  }
}

function span(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function btn(text: string, onClick: () => void, cls?: string, title?: string): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

/** A button with a dim shortcut hint at its right. */
function keyBtn(text: string, kbd: string, onClick: () => void, mobile: boolean): HTMLButtonElement {
  const b = btn(text, onClick);
  if (kbd && !mobile) b.append(span('kbd', kbd));
  return b;
}

type PopId = 'sheet' | 'patch' | 'examples' | 'render';
type TakeKind = 'audio' | 'video';

const LENGTHS: [string, number][] = [['1 min', 60], ['5 min', 300], ['10 min', 600], ['30 min', 1800], ['1 h', 3600]];
const FADES: [string, number][] = [['none', 0], ['3 s', 3], ['10 s', 10], ['30 s', 30]];
const SIZES: [string, number][] = [['720p', 720], ['1080p', 1080], ['1440p', 1440], ['4k', 2160]];
const FPS = [24, 30, 60];

export class Bar {
  private readonly app: App;
  private readonly root: HTMLDivElement;
  private mobile = false;
  private syncers: (() => boolean | void)[] = [];
  private popSyncers: (() => boolean | void)[] = [];
  private pop: { id: PopId; el: HTMLElement; anchor: HTMLElement | null; scrim: HTMLElement | null } | null = null;
  private slot!: HTMLDivElement;
  private dirty = true;
  private cached = { h: 40, strip: { x0: 0, x1: 0, y: 0, h: 0 } };
  /** The render menu's open tab, kept between openings. */
  private tab: TakeKind = 'audio';

  constructor(app: App) {
    this.app = app;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    this.root = el('div', 'g8-bar');
    this.root.setAttribute('role', 'toolbar');
    // buttons don't keep the focus from a click, so space and the other shortcuts still reach the canvas
    this.root.addEventListener('mousedown', (e) => {
      if (e.target instanceof HTMLButtonElement) e.preventDefault();
    });
    document.body.append(this.root);
    this.build();

    // The sheet sits on the on-screen keyboard: the visual viewport is what's left above it.
    const vv = window.visualViewport;
    const fit = () => {
      const s = document.documentElement.style;
      s.setProperty('--g8-kb', (vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0) + 'px');
      s.setProperty('--g8-vh', (vv?.height ?? window.innerHeight) + 'px');
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    window.addEventListener('resize', () => (this.dirty = true));

    // a press anywhere else closes an open menu
    document.addEventListener(
      'pointerdown',
      (e) => {
        const p = this.pop;
        const t = e.target as Node;
        if (p && !p.el.contains(t) && !p.anchor?.contains(t) && p.scrim !== t) this.close();
      },
      true,
    );
  }

  /** Is this element part of the bar or one of its menus? Keys typed there are theirs. */
  owns(t: EventTarget | null): boolean {
    return t instanceof Node && (this.root.contains(t) || !!this.pop?.el.contains(t));
  }

  /** Height and the strip's slot, in CSS pixels from the window's top left. */
  layout(): { h: number; strip: { x0: number; x1: number; y: number; h: number } } {
    if (this.dirty) {
      this.dirty = false;
      const r = this.root.getBoundingClientRect();
      const s = this.slot.getBoundingClientRect();
      this.cached = { h: Math.round(window.innerHeight - r.top), strip: { x0: s.left + 2, x1: s.right - 2, y: s.top, h: s.height } };
    }
    return this.cached;
  }

  /** Every frame: follow the patch and the App, and rebuild on a switch between phone and desktop. */
  sync(): void {
    if (this.app.mobile !== this.mobile) this.build();
    let changed = false;
    for (const f of this.syncers) if (f()) changed = true;
    for (const f of this.popSyncers) f();
    if (changed) this.dirty = true;
  }

  // ---------- the bar ----------

  private build(): void {
    this.close();
    this.mobile = this.app.mobile;
    this.syncers = [];
    this.root.replaceChildren();
    this.root.classList.toggle('mobile', this.mobile);
    this.dirty = true;
    const app = this.app;
    const l = el('div', 'grp l');
    const r = el('div', 'grp r');
    this.slot = el('div', 'slot');

    const play = btn('▶', () => app.togglePlay(), 'play');
    play.setAttribute('aria-label', 'play');
    this.label(play, () => (app.playing ? '❚❚' : '▶'), (b, s) => {
      b.classList.toggle('going', app.playing);
      b.setAttribute('aria-label', app.playing ? 'pause' : 'play');
      void s;
    });

    if (this.mobile) {
      // one row of the things you reach for while playing; the rest is in the sheet
      const openSheet = () => this.open('sheet');
      const vol = this.volume(openSheet);
      const bpm = this.tempo(openSheet);
      const key = btn('', openSheet, 'key', 'key and scale');
      this.label(key, () => this.keyText());
      const busy = btn('', () => this.open('sheet', null, 'record'), 'busy');
      this.label(busy, () => this.jobText(), (b, s) => (b.style.display = s ? '' : 'none'));
      const menu = btn('☰', openSheet, 'menu', 'more');
      menu.setAttribute('aria-label', 'more');
      l.append(play, vol.el, bpm.el, key, busy, menu);
      this.root.append(l, this.slot);
      return;
    }

    const vol = this.volume();
    const bpm = this.tempo();
    const seed = this.seed();
    l.append(play, vol.el, sep(), bpm.el, btn('tap', () => app.tap(), undefined, 'tap tempo (t): three taps or more'), this.rootSelect(), this.scaleSelect(), sep(), seed.el, btn('roll', () => app.rerollSeed(), undefined, 'new engine seed: the same patch, different chances'));

    const voices = span('dim', '');
    voices.title = 'voices playing';
    this.syncers.push(() => setText(voices, app.audio.started ? `${app.voices}v` : ''));
    const mixer = btn('mixer', () => (app.mixerOpen = !app.mixerOpen), undefined, 'levels, mute, solo, FX returns');
    this.syncers.push(() => void mixer.classList.toggle('on', app.mixerOpen));
    const capture = btn('● capture', () => void app.capture(), 'rec', 'save the last 30 s as a WAV, with the patch and edit log (c)');
    const render = btn('', () => this.toggle('render', render), undefined, 'render the patch from a fresh start as a WAV or MP4 (shift-C / shift-V)');
    this.label(render, () => this.jobText() || 'render ▾', (b, s) => b.classList.toggle('busy', s !== 'render ▾'));
    const patch = btn('patch ▾', () => this.toggle('patch', patch), undefined, 'new, open, save, info, share, random');
    const examples = btn('examples ▾', () => this.toggle('examples', examples), undefined, 'the bundled demos');
    const docs = btn('docs', () => app.openDocs(), undefined, 'the full guide (g)');
    const help = btn('?', () => (app.showHelp = !app.showHelp), undefined, 'shortcuts (h)');
    this.syncers.push(() => void help.classList.toggle('on', app.showHelp));
    for (const [b, id] of [[render, 'render'], [patch, 'patch'], [examples, 'examples']] as const) {
      this.syncers.push(() => void b.classList.toggle('on', this.pop?.id === id));
    }
    r.append(voices, mixer, capture, render, sep(), patch, examples, docs, help);
    this.root.append(l, this.slot, r);
  }

  /** Keep a button's text up to date; `after` runs when it changes. */
  private label<T extends HTMLElement>(b: T, text: () => string, after?: (b: T, s: string) => void): void {
    let shown: string | null = null;
    this.syncers.push(() => {
      const s = text();
      if (s === shown) return false;
      shown = s;
      b.textContent = s;
      after?.(b, s);
      return true;
    });
  }

  private keyText(): string {
    const k = this.app.patch.key;
    return `${NOTE_NAMES[k.root]} ${SCALE_LABELS[k.scale] ?? k.scale}`;
  }

  /** Progress of a running render, or ''. */
  private jobText(): string {
    const { render, video } = this.app;
    if (render) return `● wav ${Math.floor(render.progress * 100)}%`;
    if (video) return `● mp4 ${Math.floor(video.progress * 100)}%`;
    return '';
  }

  private volume(onTap?: () => void, into = this.syncers): Scrub {
    const app = this.app;
    const s = new Scrub({
      label: 'vol',
      title: 'master level',
      get: () => app.patch.master ?? 0,
      set: (v, live) => (live ? app.commitCoalesced('vol', { op: 'master', value: v }) : app.commit({ op: 'master', value: v })),
      fmt: fmtDb,
      text: (v) => String(v),
      parse: (t) => num(t.replace(/db/i, '')),
      min: DB_MIN,
      max: DB_MAX,
      step: 0.5,
      fine: 0.1,
      px: 4,
      reset: 0,
      fill: true,
      chars: 7,
      onTap,
    });
    s.el.classList.add('vol');
    into.push(() => s.sync());
    return s;
  }

  private tempo(onTap?: () => void, into = this.syncers): Scrub {
    const app = this.app;
    const s = new Scrub({
      label: 'bpm',
      title: 'tempo',
      get: () => app.patch.tempo,
      set: (v, live) => (live ? app.commitCoalesced('tempo', { op: 'tempo', value: v }) : app.commit({ op: 'tempo', value: v })),
      fmt: (v) => (v % 1 ? v.toFixed(1) : String(v)),
      parse: (t) => num(t.replace(/bpm/i, '')),
      min: 20,
      max: 300,
      step: 1,
      fine: 0.1,
      px: 5,
      chars: 5,
      onTap,
    });
    into.push(() => s.sync());
    return s;
  }

  private seed(into = this.syncers): Scrub {
    const app = this.app;
    const s = new Scrub({
      label: 'seed',
      title: 'engine seed: the chance in this patch (any number or text)',
      get: () => app.patch.seed,
      set: (v, live) => (live ? app.commitCoalesced('seed', { op: 'seed', value: v >>> 0 }) : app.commit({ op: 'seed', value: v >>> 0 })),
      fmt: String,
      parse: (t) => (t.trim() ? parseSeed(t) : null),
      min: 0,
      max: 4294967295,
      step: 1,
      fine: 1,
      px: 8,
      chars: 7,
    });
    into.push(() => s.sync());
    return s;
  }

  private select(options: [string, string][], title: string, get: () => string, set: (v: string) => void, into = this.syncers): HTMLSelectElement {
    const s = el('select', 'g8-sel');
    s.title = title;
    s.setAttribute('aria-label', title);
    for (const [v, t] of options) {
      const o = el('option', undefined, t);
      o.value = v;
      s.append(o);
    }
    s.addEventListener('change', () => {
      set(s.value);
      // let go of the focus, or space and the arrow keys stay with the menu
      if (!this.mobile) s.blur();
    });
    s.addEventListener('wheel', (e) => {
      e.preventDefault();
      const i = Math.min(options.length - 1, Math.max(0, s.selectedIndex + (e.deltaY < 0 ? -1 : 1)));
      if (i !== s.selectedIndex) set(options[i][0]);
    }, { passive: false });
    into.push(() => {
      const v = get();
      if (s.value === v) return false;
      s.value = v;
      return true;
    });
    return s;
  }

  private rootSelect(into = this.syncers): HTMLSelectElement {
    const app = this.app;
    return this.select(
      NOTE_NAMES.map((n, i) => [String(i), n]),
      'key root',
      () => String(app.patch.key.root),
      (v) => app.commit({ op: 'key', value: { ...app.patch.key, root: Number(v) } }),
      into,
    );
  }

  private scaleSelect(into = this.syncers): HTMLSelectElement {
    const app = this.app;
    return this.select(
      SCALE_ORDER.map((s) => [s, SCALE_LABELS[s] ?? s]),
      'scale',
      () => app.patch.key.scale,
      (v) => app.commit({ op: 'key', value: { ...app.patch.key, scale: v } }),
      into,
    );
  }

  // ---------- menus ----------

  /** Open a menu: from the keyboard (shift-C / shift-V), `anchor` is null. */
  open(id: PopId | 'video', anchor: HTMLElement | null = null, section?: 'record'): void {
    if (id === 'video' || id === 'render') {
      this.tab = id === 'video' ? 'video' : 'audio';
      if (this.mobile) return this.open('sheet', null, 'record');
      id = 'render';
      anchor ??= [...this.root.querySelectorAll('button')].find((b) => b.title.startsWith('render')) ?? null;
    }
    this.close();
    const pop = el('div', 'g8-pop');
    pop.setAttribute('role', 'dialog');
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
    let scrim: HTMLElement | null = null;
    if (id === 'sheet') {
      scrim = el('div', 'g8-scrim');
      scrim.addEventListener('click', () => this.close());
      pop.classList.add('sheet');
      // keep a focused field in view as the keyboard comes up
      pop.addEventListener('focusin', (e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement) setTimeout(() => t.scrollIntoView({ block: 'nearest' }), 350);
      });
      // iOS can scroll the page under a focused field: put it back
      pop.addEventListener('focusout', () => setTimeout(() => window.scrollTo(0, 0), 50));
      document.body.append(scrim);
    }
    this.pop = { id, el: pop, anchor, scrim };
    this.popSyncers = [];
    if (id === 'sheet') this.fillSheet(pop);
    else if (id === 'patch') this.fillPatch(pop);
    else if (id === 'examples') this.fillExamples(pop);
    else {
      pop.classList.add('wide');
      this.fillTake(pop);
    }
    document.body.append(pop);
    for (const f of this.popSyncers) f();
    if (id !== 'sheet') this.place(pop, anchor);
    if (section) pop.querySelector(`[data-section=${section}]`)?.scrollIntoView({ block: 'start' });
    // the render menu's spec takes typing straight away, as the old one-line entry did
    if (id === 'render' && !this.mobile) pop.querySelector<HTMLInputElement>('input[type=text]')?.focus();
  }

  /** Over its button, inside the window. */
  private place(pop: HTMLElement, anchor: HTMLElement | null): void {
    const a = anchor?.getBoundingClientRect();
    const top = a ? a.top : window.innerHeight - this.layout().h;
    pop.style.bottom = window.innerHeight - top + 8 + 'px';
    const w = pop.offsetWidth;
    const left = a ? Math.min(a.left, window.innerWidth - w - 8) : (window.innerWidth - w) / 2;
    pop.style.left = Math.max(8, left) + 'px';
  }

  private toggle(id: PopId, anchor: HTMLElement): void {
    if (this.pop?.id === id) this.close();
    else this.open(id, anchor);
  }

  /** Close the open menu; false if none was open. */
  close(): boolean {
    const p = this.pop;
    if (!p) return false;
    this.pop = null;
    this.popSyncers = [];
    p.el.remove();
    p.scrim?.remove();
    return true;
  }

  /** Run an action from a menu, closing it first. */
  private act(f: () => void): () => void {
    return () => {
      this.close();
      f();
    };
  }

  private fillPatch(c: HTMLElement): void {
    const app = this.app;
    const m = this.mobile;
    const grid = el('div', 'grid');
    grid.append(
      keyBtn('new', '', this.act(() => app.newPatch()), m),
      keyBtn('open…', '⌘O', this.act(() => app.openPatch()), m),
      keyBtn('save', '⌘S', this.act(() => app.savePatch()), m),
      keyBtn('info…', 'i', this.act(() => app.editInfo()), m),
      keyBtn('share', '', this.act(() => void app.share()), m),
      keyBtn('random', 'r', () => {
        // the patch menu stays open on the first press: random asks again over an edited patch
        if (app.randomPatch()) this.close();
      }, m),
    );
    grid.querySelector<HTMLButtonElement>('button:nth-child(5)')!.title = 'copy a link to this patch';
    c.append(el('h3', undefined, 'patch'), grid);

    c.append(el('h3', undefined, 'new from a seed'));
    const row = el('div', 'row');
    const inp = el('input');
    inp.type = 'text';
    inp.maxLength = 32;
    inp.placeholder = 'a number, or any words';
    inp.spellcheck = false;
    inp.autocomplete = 'off';
    inp.setAttribute('aria-label', 'seed for a new patch');
    const go = () => {
      if (!inp.value.trim()) return inp.focus();
      if (app.seedPatch(inp.value)) this.close();
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') go();
      else if (e.key === 'Escape') this.close();
    });
    row.append(inp, btn('make', go, 'primary'));
    c.append(row, el('p', 'hint', 'The same seed always makes the same patch.'));
  }

  private fillExamples(c: HTMLElement): void {
    const list = el('div', 'list');
    for (const ex of EXAMPLES) list.append(keyBtn(ex.label, ex.key ? '⇧' + ex.key : '', this.act(() => this.app.loadExample(ex)), this.mobile));
    c.append(el('h3', undefined, 'examples'), list);
  }

  /** Render a WAV or an MP4: a spec you can type, or pick with the chips. */
  private fillTake(c: HTMLElement): void {
    const app = this.app;
    const body = el('div');
    c.append(body);
    let shownFor = '';
    const draw = () => {
      body.replaceChildren();
      const running = this.tab === 'audio' ? app.render : app.video;
      const tabs = el('div', 'tabs');
      for (const [k, t] of [['audio', 'audio · wav'], ['video', 'video · mp4']] as const) {
        const b = btn(t, () => {
          this.tab = k;
          draw();
        });
        b.classList.toggle('on', this.tab === k);
        tabs.append(b);
      }
      body.append(tabs);
      if (running) this.takeProgress(body);
      else this.takeForm(body);
    };
    // redraw when a job starts or ends under the open menu
    this.popSyncers.push(() => {
      const s = `${this.tab}:${!!app.render}:${!!app.video}`;
      if (s === shownFor) return;
      shownFor = s;
      draw();
    });
  }

  private takeProgress(c: HTMLElement): void {
    const app = this.app;
    const video = this.tab === 'video';
    const job = () => (video ? app.video : app.render);
    const total = video ? app.video!.spec.seconds : app.render!.seconds;
    const bar = el('div', 'progress');
    const fill = el('i');
    bar.append(fill);
    const text = el('p', 'hint');
    this.popSyncers.push(() => {
      const j = job();
      if (!j) return;
      fill.style.width = j.progress * 100 + '%';
      setText(text, `${Math.floor(j.progress * 100)}% · ${fmtTime(j.progress * total)} of ${fmtTime(total)} rendered`);
    });
    const foot = el('div', 'foot');
    foot.append(el('p', 'hint', 'Keep playing: it renders in the background.'), btn('cancel', () => (video ? app.cancelVideo() : app.cancelRender()), 'rec'));
    c.append(el('h3', undefined, video ? 'rendering video' : 'rendering audio'), bar, text, foot);
  }

  private takeForm(c: HTMLElement): void {
    const app = this.app;
    const video = this.tab === 'video';
    // the form edits a copy; a render takes what's typed or picked
    let s: VideoSpec = video ? { ...app.videoSpec, fade: { ...app.videoSpec.fade } } : { ...app.videoSpec, ...app.renderSpec, fade: { ...app.renderSpec.fade }, short: false };
    const fmt = (x: VideoSpec) => (video ? fmtVideoSpec(x) : fmtRenderSpec(x));
    const parse = (t: string): VideoSpec | null => (video ? parseVideoSpec(t, s) : ((r) => r && { ...s, ...r })(parseRenderSpec(t, s)));

    const spec = el('input');
    spec.type = 'text';
    spec.spellcheck = false;
    spec.autocomplete = 'off';
    spec.setAttribute('aria-label', 'render spec');
    spec.value = fmt(s);
    const syncs: (() => void)[] = [];
    const refresh = (text = true) => {
      if (text) spec.value = fmt(s);
      spec.classList.remove('bad');
      for (const f of syncs) f();
    };
    spec.addEventListener('input', () => {
      const p = parse(spec.value);
      spec.classList.toggle('bad', !p);
      if (p) {
        s = p;
        refresh(false);
      }
    });
    const start = () => {
      const p = parse(spec.value);
      if (!p) {
        spec.classList.add('bad');
        spec.focus();
        return;
      }
      this.close();
      if (video) {
        app.videoSpec = p;
        void app.startVideo(p);
      } else {
        app.renderSpec = { seconds: p.seconds, fade: p.fade };
        void app.startRender(app.renderSpec);
      }
    };
    spec.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') start();
      else if (e.key === 'Escape') this.close();
    });

    const chips = (label: string, opts: [string, number][], is: (v: number) => boolean, pick: (v: number) => void) => {
      const row = el('div', 'row');
      const box = el('div', 'chips');
      const bs = opts.map(([t, v]) => {
        const b = btn(t, () => {
          pick(v);
          refresh();
        });
        box.append(b);
        return [b, v] as const;
      });
      syncs.push(() => bs.forEach(([b, v]) => b.classList.toggle('on', is(v))));
      row.append(el('label', undefined, label), box);
      c.append(row);
      return row;
    };

    const specRow = el('div', 'row');
    specRow.append(el('label', undefined, 'spec'), spec);
    c.append(el('h3', undefined, video ? 'video of the whole window' : 'audio from a fresh start'), specRow);
    chips('length', LENGTHS, (v) => s.seconds === v, (v) => (s.seconds = v));
    chips('fade in', FADES, (v) => s.fade.in === v, (v) => (s.fade.in = Math.min(v, s.seconds)));
    chips('fade out', FADES, (v) => s.fade.out === v, (v) => (s.fade.out = Math.min(v, s.seconds)));
    if (video) {
      chips('size', [...SIZES, ['short', 0]], (v) => (v ? !s.short && s.height === v : s.short), (v) => {
        if (v) {
          s.short = false;
          s.height = v;
        } else {
          // a short is a portrait minute of just the elements
          if (!s.short && s.seconds > SHORT.seconds) s.seconds = SHORT.seconds;
          s.short = true;
        }
      });
      chips('frames', FPS.map((f) => [`${f} fps`, f]), (v) => s.fps === v, (v) => (s.fps = v));
    }
    refresh();
    const hint = video ? 'Up to an hour. A short is a 1080 × 1920 portrait video of just the elements.' : 'Up to an hour, faster than real time. About 1.4 GB an hour.';
    const foot = el('div', 'foot');
    foot.append(el('p', 'hint', hint), btn(video ? 'render mp4' : 'render wav', start, 'primary'));
    c.append(foot);
  }

  /** The phone's sheet: everything the bar has no room for, in big controls. */
  private fillSheet(c: HTMLElement): void {
    const app = this.app;
    const into = this.popSyncers;
    const head = el('div', 'head');
    const x = btn('✕', () => this.close(), 'step', 'close');
    x.setAttribute('aria-label', 'close');
    head.append(el('div', 'grab'), el('p', undefined, 'GENER8'), x);
    c.append(head);

    const stepped = (label: string, s: Scrub, extra?: HTMLElement) => {
      const row = el('div', 'row');
      const ctl = el('div', 'ctl');
      ctl.append(btn('−', () => s.nudge(-1), 'step'), s.el, btn('+', () => s.nudge(1), 'step'));
      if (extra) ctl.append(extra);
      row.append(el('label', undefined, label), ctl);
      return row;
    };
    const sound = el('h3', undefined, 'sound');
    sound.dataset.section = 'sound';
    const keyRow = el('div', 'row');
    const keyCtl = el('div', 'ctl');
    keyCtl.append(this.rootSelect(into), this.scaleSelect(into));
    keyRow.append(el('label', undefined, 'key'), keyCtl);
    const dice = btn('roll', () => app.rerollSeed(), undefined, 'new engine seed: the same patch, different chances');
    c.append(
      sound,
      stepped('volume', this.volume(undefined, into)),
      stepped('tempo', this.tempo(undefined, into), btn('tap', () => app.tap())),
      keyRow,
      stepped('seed', this.seed(into), dice),
    );

    const rec = el('h3', undefined, 'record');
    rec.dataset.section = 'record';
    const mixer = btn('mixer', this.act(() => (app.mixerOpen = !app.mixerOpen)));
    into.push(() => void mixer.classList.toggle('on', app.mixerOpen));
    const grid = el('div', 'grid');
    grid.append(btn('● capture 30 s', this.act(() => void app.capture()), 'rec'), mixer);
    c.append(rec, grid);
    const take = el('div');
    take.style.marginTop = '12px';
    c.append(take);
    this.fillTake(take);

    this.fillPatch(c);
    this.fillExamples(c);
    c.append(el('h3', undefined, 'help'));
    const help = el('div', 'grid');
    help.append(btn('the guide', this.act(() => app.openDocs())));
    c.append(help);
  }
}

function sep(): HTMLElement {
  return el('span', 'sep');
}

function setText(e: HTMLElement, s: string): boolean {
  if (e.textContent === s) return false;
  e.textContent = s;
  return true;
}

function num(t: string): number | null {
  const v = Number(t.trim().replace('−', '-').replace(',', '.'));
  return t.trim() && Number.isFinite(v) ? v : null;
}
