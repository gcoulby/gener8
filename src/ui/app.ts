import type { Edit, EventRecord, FieldObj, Patch, PatchObject, PosMotion, SoundObj } from '../core/types.ts';
import { PPQ, SR, CAPTURE_SECONDS } from '../core/constants.ts';
import { applyEdit, byLayer, clone, emptyPatch, nextId, normalizePatch } from '../core/patch.ts';
import { pose, type Pose } from '../core/motion.ts';
import { depthAt, isCircle } from '../core/geometry.ts';
import { soundTypes, defaultParams } from '../core/sounds/registry.ts';
import { fieldTypes, defaultHandles } from '../core/fields/registry.ts';
import { SCALE_ORDER } from '../core/music.ts';
import { AudioBridge } from './audio.ts';
import { History } from './history.ts';
import { download, encodeWav } from './wav.ts';
import { draw } from './draw.ts';
import { paletteHit, type PaletteItem } from './palette.ts';
import { inStrip, STRIP_H, stripSampleAt } from './timeline.ts';
import { faderDbAt, mixerHitAt, mixerRect, toggleEdit as mixerToggle, trimEdit, type MixerHit } from './mixer.ts';
import { panelPointerDown, panelPointerMove, panelRect } from './panel.ts';
import { motionHitAt, readValue, stepValue, toggleEdit, valueEdit, type MotionHit, type ValueKey } from './motionbar.ts';
import demoPatch from '../../patches/demo.json';
import stressPatch from '../../patches/stress-24x12.json';
import rhythmicPatch from '../../patches/rhythmic.json';
import tapePatch from '../../patches/tape.json';
import loopsPatch from '../../patches/loops.json';
import rainfallPatch from '../../patches/rainfall.json';
import cellsPatch from '../../patches/cells.json';
import choirPatch from '../../patches/choir.json';
import bloomPatch from '../../patches/bloom.json';

/** Bundled patches, in menu order; `key` is an optional shift-shortcut. */
export const EXAMPLES: { id: string; label: string; key?: string; patch: unknown }[] = [
  { id: 'ambient', label: 'ambient', key: 'D', patch: demoPatch },
  { id: 'tape', label: 'tape', key: 'T', patch: tapePatch },
  { id: 'loops', label: 'loops (airports)', patch: loopsPatch },
  { id: 'rainfall', label: 'rainfall', patch: rainfallPatch },
  { id: 'bloom', label: 'bloom', patch: bloomPatch },
  { id: 'choir', label: 'choir (motion)', patch: choirPatch },
  { id: 'cells', label: 'cells (automaton)', patch: cellsPatch },
  { id: 'rhythmic', label: 'rhythmic', key: 'R', patch: rhythmicPatch },
  { id: 'stress', label: 'stress 24×12', key: 'X', patch: stressPatch },
];

export interface Pulse {
  t: number;
  vel: number;
  accent: boolean;
}

export interface RippleVis {
  x: number;
  y: number;
  tick: number;
  maxR: number;
  vel: number;
}

export interface Cause {
  from: string;
  to: string;
  t: number;
}

export interface GridVis {
  cols: number;
  rows: number;
  cells: Uint8Array;
  gen: number;
  t: number;
}

export type HandleKind = 'size' | 'char' | 'mradius' | 'mamp' | 'mpoint';

export interface HandlePos {
  kind: HandleKind;
  key?: string;
  index?: number;
  x: number;
  y: number;
}

export type Hit =
  | { kind: 'object'; id: string }
  | { kind: 'handle'; id: string; h: HandlePos }
  | { kind: 'palette'; item: PaletteItem }
  | { kind: 'ui'; id: string }
  | { kind: 'motion'; hit: MotionHit }
  | { kind: 'mixer'; hit: MixerHit }
  | { kind: 'mixerBg' }
  | { kind: 'paletteToggle' }
  | { kind: 'strip' };

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'move'; id: string; dx: number; dy: number }
  | { kind: 'handle'; id: string; h: HandlePos; startVal: number; startY: number }
  | { kind: 'palette'; item: PaletteItem }
  | { kind: 'scrub' }
  | { kind: 'mvalue'; id: string; key: ValueKey; start: number; sx: number }
  | { kind: 'fader'; id: string }
  | { kind: 'vol'; sx: number; start: number }
  | { kind: 'mixerScroll'; sx: number; start: number }
  | { kind: 'pinch'; d0: number; z0: number; wx: number; wy: number }
  | { kind: 'panel'; key: string; data: any };

const STORE_KEY = 'gener8.patch.v2';
export const HANDLE_ZOOM = 0.6;

export class App {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  W = 0;
  H = 0;
  dpr = 1;
  patch: Patch;
  cam = { x: 0, y: 0, zoom: 1 };
  mouse = { x: -1e4, y: -1e4, inside: false };
  sel: string | null = null;
  hover: Hit | null = null;
  drag: Drag | null = null;
  panel: { id: string; auto: boolean } | null = null;
  scrub: { sample: number; preview: Patch; cancelled: boolean } | null = null;
  readonly audio = new AudioBridge();
  history: History | null = null;
  pending: EventRecord[] = [];
  pulses = new Map<string, Pulse>();
  ripples: RippleVis[] = [];
  causes: Cause[] = [];
  fieldFlash = new Map<string, number>();
  grids = new Map<string, GridVis>();
  poses = new Map<string, Pose>();
  driven = new Set<string>();
  tickNow = 0;
  beat = 0;
  now = 0;
  uiHits: { id: string; x: number; y: number; w: number; h: number }[] = [];
  motionHits: MotionHit[] = [];
  examplesOpen = false;
  /** Touch device with a phone/tablet-sized screen: switches to the mobile layout. */
  mobile = false;
  /** Height of the bottom bar (one row on desktop, wrapped rows on mobile). */
  barH = STRIP_H;
  paletteOpen = false;
  mixerOpen = false;
  mixerScroll = 0;
  mixerHits: MixerHit[] = [];
  meterLevel = new Map<string, number>();
  private pointers = new Map<number, { x: number; y: number; touch: boolean }>();
  private downAt: { x: number; y: number; id: string | null; wasSel: boolean; touch: boolean } | null = null;
  private lastTap: { t: number; id: string } | null = null;
  /** Object picked with Tab: clicks near where Tab was pressed go to it, not to whatever is on top. */
  pinned: string | null = null;
  tabInfo: { stack: string[]; t: number; x: number; y: number } | null = null;
  private drawFailed = false;
  showHelp = false;
  toastMsg = '';
  toastT = 0;
  private taps: number[] = [];
  private spaceDown = false;
  private sendQueue = new Map<string, Edit>();
  private saveTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    this.patch = this.loadStored() ?? normalizePatch(demoPatch);
    this.resize();
    this.bind();
    requestAnimationFrame(this.frame);
  }

  // ---------- model ----------

  get view(): Patch {
    return this.scrub && !this.scrub.cancelled ? this.scrub.preview : this.patch;
  }

  obj(id: string | null): PatchObject | undefined {
    return id ? this.view.objects.find((o) => o.id === id) : undefined;
  }

  poseOf(o: PatchObject): Pose {
    return this.poses.get(o.id) ?? { x: o.x, y: o.y, scale: 1 };
  }

  /** Apply locally and send to the engine now. */
  commit(e: Edit): void {
    this.patch = applyEdit(this.patch, clone(e));
    this.audio.send(e);
    this.queueSave();
  }

  /** Apply locally now; send once per frame (drags). */
  commitCoalesced(key: string, e: Edit): void {
    this.patch = applyEdit(this.patch, clone(e));
    this.sendQueue.set(key, e);
    this.queueSave();
  }

  private flushSends(): void {
    for (const e of this.sendQueue.values()) this.audio.send(e);
    this.sendQueue.clear();
  }

  private queueSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(this.patch));
      } catch {
        /* storage unavailable */
      }
    }, 800);
  }

  private loadStored(): Patch | null {
    try {
      const s = localStorage.getItem(STORE_KEY);
      return s ? normalizePatch(JSON.parse(s)) : null;
    } catch {
      return null;
    }
  }

  load(p: unknown, label: string): void {
    try {
      const patch = normalizePatch(p);
      this.commit({ op: 'load', patch });
      this.sel = null;
      this.panel = null;
      this.toast(label);
    } catch (err) {
      this.toast('could not load: ' + (err as Error).message);
    }
  }

  toast(msg: string): void {
    this.toastMsg = msg;
    this.toastT = performance.now();
  }

  anySolo(): boolean {
    return this.patch.objects.some((o) => o.kind === 'sound' && o.solo);
  }

  // ---------- coordinates ----------

  w2s(x: number, y: number): [number, number] {
    return [(x - this.cam.x) * this.cam.zoom + this.W / 2, this.H / 2 - (y - this.cam.y) * this.cam.zoom];
  }

  s2w(sx: number, sy: number): [number, number] {
    return [(sx - this.W / 2) / this.cam.zoom + this.cam.x, (this.H / 2 - sy) / this.cam.zoom + this.cam.y];
  }

  soundRadius(o: SoundObj): number {
    return Math.max(5, ((o.size * this.poseOf(o).scale) / 2) * this.cam.zoom);
  }

  // ---------- audio ----------

  async ensureAudio(): Promise<void> {
    if (this.audio.started) return;
    this.flushSends();
    this.history = new History(this.patch);
    this.audio.onTele = (t) => {
      this.history?.ingest(t.edits, t.events, t.sample);
      for (const e of t.events) this.pending.push(e);
      if (this.pending.length > 4000) this.pending.splice(0, this.pending.length - 4000);
      for (const id in t.meters) this.meterLevel.set(id, Math.max(this.meterLevel.get(id) ?? 0, t.meters[id]));
      for (const v of t.visuals) this.grids.set(v.id, { ...(v.data as Omit<GridVis, 't'>), t: performance.now() });
    };
    try {
      await this.audio.start(this.patch);
    } catch (err) {
      this.toast('audio failed: ' + (err as Error).message);
    }
  }

  async capture(): Promise<void> {
    if (!this.audio.started || !this.history) {
      this.toast('start audio first (space)');
      return;
    }
    const r = await this.audio.capture();
    const end = r.endSample;
    const start = end - r.left.length;
    const h = this.history;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = `gener8-${stamp}`;
    download(encodeWav(r.left, r.right, SR), `${name}.wav`);
    const capture = {
      format: 'gener8.capture',
      version: 1,
      sampleRate: SR,
      seconds: r.left.length / SR,
      window: { startSample: start, endSample: end },
      seed: h.patchAt(start).seed,
      patchAtStart: h.patchAt(start),
      editsInWindow: h.log.filter((e) => e.sample >= start && e.sample < end),
      replay: { root: h.root, edits: h.log.filter((e) => e.sample < end) },
    };
    download(new Blob([JSON.stringify(capture)], { type: 'application/json' }), `${name}.json`);
    this.toast(`captured ${Math.round(r.left.length / SR)} s → ${name}.wav + .json`);
  }

  // ---------- frame ----------

  private frame = (now: number): void => {
    this.now = now;
    this.flushSends();
    if (this.audio.started) {
      const a = this.audio.audibleSample();
      this.tickNow = Math.max(0, this.audio.tickAt(a));
      this.activate(a, now);
    }
    this.beat = this.tickNow / PPQ;
    for (const [id, v] of this.meterLevel) this.meterLevel.set(id, v * 0.88);
    requestAnimationFrame(this.frame);
    this.computePoses();
    this.autoPanel();
    try {
      draw(this);
    } catch (err) {
      // Never let one bad frame freeze the instrument.
      if (!this.drawFailed) console.error('draw failed', err);
      this.drawFailed = true;
    }
  };

  private activate(audible: number, now: number): void {
    let i = 0;
    const p = this.pending;
    while (i < p.length && p[i].sample <= audible) {
      const e = p[i++];
      this.pulses.set(e.soundId, { t: now, vel: e.velocity, accent: e.accent });
      if (e.rippleR > 0) this.ripples.push({ x: e.x, y: e.y, tick: e.tick, maxR: e.rippleR, vel: e.velocity });
      if (e.sourceKind === 'generator') this.fieldFlash.set(e.sourceId, now);
      else this.causes.push({ from: e.sourceId, to: e.soundId, t: now });
    }
    if (i) p.splice(0, i);
    this.ripples = this.ripples.filter((r) => ((this.tickNow - r.tick) / PPQ) * 240 < r.maxR);
    if (this.ripples.length > 80) this.ripples.splice(0, this.ripples.length - 80);
    this.causes = this.causes.filter((c) => now - c.t < 500);
  }

  private computePoses(): void {
    const v = this.view;
    const seen = new Set<string>();
    for (const o of v.objects) {
      let p = this.poses.get(o.id);
      if (!p) {
        p = { x: 0, y: 0, scale: 1 };
        this.poses.set(o.id, p);
      }
      pose(o, this.beat, v.seed, p);
      seen.add(o.id);
    }
    for (const k of this.poses.keys()) if (!seen.has(k)) this.poses.delete(k);
    this.driven.clear();
    const gens = v.objects.filter((o): o is FieldObj => o.kind === 'field' && fieldTypes[o.type]?.role === 'generator');
    for (const s of v.objects) {
      if (s.kind !== 'sound') continue;
      const sp = this.poseOf(s);
      for (const f of gens) {
        const fp = this.poseOf(f);
        if (depthAt(f.shape, fp.x, fp.y, fp.scale, sp.x, sp.y) > 0) {
          this.driven.add(s.id);
          break;
        }
      }
    }
  }

  private autoPanel(): void {
    if (this.panel?.auto && this.cam.zoom < 3) this.panel = null;
    if (!this.panel && !this.drag && this.cam.zoom >= 4 && this.hover?.kind === 'object') {
      const o = this.obj(this.hover.id);
      if (o?.kind === 'sound') this.panel = { id: o.id, auto: true };
    }
  }

  // ---------- hit testing ----------

  handlesFor(o: PatchObject): HandlePos[] {
    const out: HandlePos[] = [];
    const p = this.poseOf(o);
    const [sx, sy] = this.w2s(p.x, p.y);
    const z = this.cam.zoom;
    if (o.kind === 'sound') {
      out.push({ kind: 'size', x: sx + this.soundRadius(o), y: sy });
    } else {
      const t = fieldTypes[o.type];
      const keys = t ? t.handles.map((h) => h.key) : [];
      if (isCircle(o.shape)) {
        const R = o.shape.r * p.scale * z;
        out.push({ kind: 'size', x: sx + R, y: sy });
        const angs = [0.125, 0.875];
        keys.forEach((k, i) => {
          const a = angs[i] * Math.PI * 2;
          out.push({ kind: 'char', key: k, x: sx + Math.sin(a) * R, y: sy - Math.cos(a) * R });
        });
      } else {
        const hw = (o.shape.w * p.scale * z) / 2;
        const hh = (o.shape.h * p.scale * z) / 2;
        out.push({ kind: 'size', x: sx + hw, y: sy + hh });
        const pts = [
          [sx + hw, sy - hh],
          [sx - hw, sy - hh],
        ];
        keys.forEach((k, i) => out.push({ kind: 'char', key: k, x: pts[i][0], y: pts[i][1] }));
      }
    }
    if (o.id === this.sel && o.motion?.pos) {
      const m = o.motion.pos;
      const [hx, hy] = this.w2s(o.x, o.y);
      if (m.type === 'orbit') out.push({ kind: 'mradius', x: hx + m.radius * z, y: hy });
      else if (m.type === 'drift') out.push({ kind: 'mamp', x: hx + m.amplitude * z, y: hy });
      else if (m.type === 'path')
        m.points.forEach((pt, i) => {
          const [px, py] = this.w2s(o.x + pt[0], o.y + pt[1]);
          out.push({ kind: 'mpoint', index: i, x: px, y: py });
        });
    }
    return out;
  }

  hitTest(mx: number, my: number): Hit | null {
    for (const u of this.uiHits) if (mx >= u.x && mx <= u.x + u.w && my >= u.y && my <= u.y + u.h) return { kind: 'ui', id: u.id };
    if (this.mixerOpen) {
      const r = mixerRect(this);
      if (my >= r.y && my < r.y + r.h) {
        const xh = mixerHitAt(this, mx, my);
        return xh ? { kind: 'mixer', hit: xh } : { kind: 'mixerBg' };
      }
    }
    if (this.mobile && mx >= 8 && mx <= 44 && my >= 46 && my <= 82) return { kind: 'paletteToggle' };
    const mh = motionHitAt(this, mx, my);
    if (mh) return { kind: 'motion', hit: mh };
    const pi = paletteHit(this, mx, my);
    if (pi) return { kind: 'palette', item: pi };
    if (my > this.H - this.barH) {
      for (const u of this.uiHits) if (mx >= u.x && mx <= u.x + u.w && my >= u.y && my <= u.y + u.h) return { kind: 'ui', id: u.id };
      return inStrip(this, mx, my) ? { kind: 'strip' } : { kind: 'ui', id: 'none' };
    }
    const v = this.view;
    if (this.cam.zoom >= HANDLE_ZOOM) {
      const cands = [this.sel, this.hover?.kind === 'object' ? this.hover.id : null, this.hover?.kind === 'handle' ? this.hover.id : null];
      for (const id of cands) {
        const o = this.obj(id);
        if (!o) continue;
        const reach = this.mobile ? 18 : 9;
        for (const h of this.handlesFor(o)) if (Math.hypot(mx - h.x, my - h.y) < reach) return { kind: 'handle', id: o.id, h };
      }
    }
    void v;
    const stack = this.stackAt(mx, my);
    if (this.pinned && this.nearPin(mx, my) && stack.includes(this.pinned)) return { kind: 'object', id: this.pinned };
    return stack.length ? { kind: 'object', id: stack[0] } : null;
  }

  /**
   * Everything under a screen point, top first: sounds (by layer), then fields
   * the point is inside or whose edge is within a few pixels (by layer).
   */
  stackAt(mx: number, my: number): string[] {
    const EDGE = 8;
    const sorted = this.view.objects.slice().sort(byLayer).reverse();
    const out: string[] = [];
    for (const o of sorted) {
      if (o.kind !== 'sound') continue;
      const p = this.poseOf(o);
      const [sx, sy] = this.w2s(p.x, p.y);
      if (Math.hypot(mx - sx, my - sy) < this.soundRadius(o) + 4) out.push(o.id);
    }
    const [wx, wy] = this.s2w(mx, my);
    const z = this.cam.zoom;
    for (const o of sorted) {
      if (o.kind !== 'field') continue;
      const p = this.poseOf(o);
      let edgePx: number;
      if (isCircle(o.shape)) {
        edgePx = Math.abs(Math.hypot(wx - p.x, wy - p.y) - o.shape.r * p.scale) * z;
      } else {
        const hw = (o.shape.w * p.scale) / 2;
        const hh = (o.shape.h * p.scale) / 2;
        const dx = Math.abs(wx - p.x);
        const dy = Math.abs(wy - p.y);
        const inside = dx <= hw && dy <= hh;
        edgePx = (inside ? Math.min(hw - dx, hh - dy) : Math.hypot(Math.max(dx - hw, 0), Math.max(dy - hh, 0))) * z;
      }
      if (edgePx < EDGE || depthAt(o.shape, p.x, p.y, p.scale, wx, wy) > 0) out.push(o.id);
    }
    return out;
  }

  /** Is (mx, my) within reach of where the current pin was made? */
  private nearPin(mx: number, my: number): boolean {
    const ti = this.tabInfo;
    return !!ti && Math.hypot(mx - ti.x, my - ti.y) <= 30;
  }

  /** Tab / shift-Tab: step through the stack under the cursor (wraps). */
  private cycleStack(dir: 1 | -1): void {
    const stack = this.stackAt(this.mouse.x, this.mouse.y);
    if (!stack.length) {
      this.toast('nothing under the cursor');
      return;
    }
    const i = this.sel ? stack.indexOf(this.sel) : -1;
    const n = stack.length;
    const next = i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n;
    this.sel = stack[next];
    this.pinned = stack[next];
    this.tabInfo = { stack, t: performance.now(), x: this.mouse.x, y: this.mouse.y };
  }

  // ---------- objects ----------

  private maxLayer(): number {
    return this.patch.objects.reduce((m, o) => Math.max(m, o.layer), 0);
  }

  makeObject(item: PaletteItem, x: number, y: number): PatchObject | null {
    const layer = this.maxLayer() + 1;
    if (item.kind === 'sound') {
      const t = soundTypes[item.type];
      if (!t) return null;
      return { id: nextId(this.patch, 's'), kind: 'sound', type: t.id, x: Math.round(x), y: Math.round(y), size: 44, layer, params: defaultParams(t) };
    }
    const t = fieldTypes[item.type];
    if (!t) return null;
    return { id: nextId(this.patch, 'f'), kind: 'field', type: t.id, x: Math.round(x), y: Math.round(y), shape: clone(t.defaultShape), layer, handles: defaultHandles(t) };
  }

  private duplicate(id: string): string | null {
    const o = this.patch.objects.find((q) => q.id === id);
    if (!o) return null;
    const c = clone(o);
    c.id = nextId(this.patch, o.kind === 'sound' ? 's' : 'f');
    c.layer = this.maxLayer() + 1;
    this.commit({ op: 'add', obj: c });
    return c.id;
  }

  private cycleMotion(id: string): void {
    const o = this.patch.objects.find((q) => q.id === id);
    if (!o) return;
    const cur = o.motion?.pos?.type;
    let next: PosMotion | null;
    if (!cur) next = { type: 'orbit', radius: 80, periodBeats: 16, phase: 0 };
    else if (cur === 'orbit') next = { type: 'drift', amplitude: 60, rateBeats: 8 };
    else if (cur === 'drift')
      next = { type: 'path', points: [[0, 0], [120, 60], [0, 120], [-120, 60]], periodBeats: 32, mode: 'loop' };
    else next = null;
    this.commit({ op: 'set', id, path: ['motion', 'pos'], value: next });
    this.toast(next ? `motion: ${next.type}` : 'motion: none');
  }

  private toggleBreathe(id: string): void {
    const o = this.patch.objects.find((q) => q.id === id);
    if (!o) return;
    const on = !o.motion?.breathe;
    this.commit({ op: 'set', id, path: ['motion', 'breathe'], value: on ? { amount: 0.3, periodBeats: 8 } : null });
    this.toast(on ? 'breathe on' : 'breathe off');
  }

  private shiftLayer(id: string, dir: 1 | -1): void {
    const sorted = this.patch.objects.slice().sort(byLayer);
    const i = sorted.findIndex((o) => o.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[i];
    const b = sorted[j];
    const la = a.layer === b.layer ? b.layer + dir : b.layer;
    this.commit({ op: 'set', id: a.id, path: ['layer'], value: la });
    this.commit({ op: 'set', id: b.id, path: ['layer'], value: a.layer });
  }

  private tap(): void {
    const t = performance.now();
    this.taps = this.taps.filter((x) => t - x < 2500);
    this.taps.push(t);
    if (this.taps.length >= 3) {
      const iv = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
      const bpm = Math.round(60000 / iv);
      this.commit({ op: 'tempo', value: bpm });
      this.toast(`${bpm} bpm`);
    }
  }

  // ---------- input ----------

  private bind(): void {
    const c = this.canvas;
    window.addEventListener('resize', () => this.resize());
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointerleave', () => (this.mouse.inside = false));
    c.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
      this.drag = null;
      this.downAt = null;
    });
    c.addEventListener('dblclick', (e) => this.onDbl(e));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceDown = false;
    });
    c.addEventListener('dragover', (e) => e.preventDefault());
    c.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = e.dataTransfer?.files[0];
      if (f) f.text().then((t) => this.load(JSON.parse(t), `loaded ${f.name}`));
    });
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.mobile = window.matchMedia('(pointer: coarse)').matches && Math.min(this.W, this.H) < 900;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  }

  private onDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    void this.ensureAudio();
    const mx = e.offsetX;
    const my = e.offsetY;
    this.mouse = { x: mx, y: my, inside: true };
    const touch = e.pointerType === 'touch';
    this.pointers.set(e.pointerId, { x: mx, y: my, touch });
    if (this.pinned && !this.nearPin(mx, my)) this.pinned = null;
    if (this.pointers.size === 2 && [...this.pointers.values()].every((p) => p.touch)) {
      // second finger: pinch-zoom and pan, abandoning whatever the first finger started
      const [a, b] = [...this.pointers.values()];
      const [wx, wy] = this.s2w((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: this.cam.zoom, wx, wy };
      this.downAt = null;
      return;
    }

    if (this.panel) {
      const r = panelRect(this);
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        const d = panelPointerDown(this, mx, my);
        if (d) this.drag = { kind: 'panel', key: d.key, data: d };
        return;
      }
      this.panel = null;
      return;
    }

    if (e.button === 1 || e.button === 2 || this.spaceDown) {
      this.drag = { kind: 'pan', sx: mx, sy: my, cx: this.cam.x, cy: this.cam.y };
      return;
    }

    const hit = this.hitTest(mx, my);
    this.downAt = { x: mx, y: my, id: hit?.kind === 'object' ? hit.id : null, wasSel: hit?.kind === 'object' && hit.id === this.sel, touch };
    if (this.examplesOpen && !(hit?.kind === 'ui' && (hit.id === 'examples' || hit.id.startsWith('example:')))) {
      this.examplesOpen = false;
    }
    if (!hit) {
      this.sel = null;
      this.drag = { kind: 'pan', sx: mx, sy: my, cx: this.cam.x, cy: this.cam.y };
      return;
    }
    switch (hit.kind) {
      case 'palette':
        this.drag = { kind: 'palette', item: hit.item };
        return;
      case 'ui':
        if (hit.id === 'vol') {
          this.drag = { kind: 'vol', sx: mx, start: this.patch.master ?? 0 };
          return;
        }
        this.onUi(hit.id);
        return;
      case 'paletteToggle':
        this.paletteOpen = !this.paletteOpen;
        return;
      case 'mixerBg':
        this.drag = { kind: 'mixerScroll', sx: mx, start: this.mixerScroll };
        return;
      case 'mixer': {
        const h = hit.hit;
        if (h.kind === 'fader') {
          this.drag = { kind: 'fader', id: h.id };
          this.commitCoalesced('fader:' + h.id, trimEdit(this, h.id, faderDbAt(this, my)));
        } else if (h.kind === 'label') {
          if (h.id !== 'master') this.sel = h.id;
          this.drag = { kind: 'mixerScroll', sx: mx, start: this.mixerScroll };
        } else {
          const ed = mixerToggle(this, h.id, h.kind);
          if (ed) this.commit(ed);
        }
        return;
      }
      case 'motion': {
        const o = this.patch.objects.find((q) => q.id === this.sel);
        if (!o) return;
        const a = hit.hit.action;
        if (a.kind === 'value') {
          this.drag = { kind: 'mvalue', id: o.id, key: a.key, start: readValue(o, a.key), sx: mx };
        } else {
          const ed = toggleEdit(o, a);
          if (ed) this.commit(ed);
        }
        return;
      }
      case 'strip':
        if (!this.history) return;
        this.drag = { kind: 'scrub' };
        this.updateScrub(mx);
        return;
      case 'handle': {
        const o = this.obj(hit.id)!;
        let startVal = 0;
        if (hit.h.kind === 'char' && o.kind === 'field') startVal = o.handles[hit.h.key!] ?? 0;
        this.sel = hit.id;
        this.drag = { kind: 'handle', id: hit.id, h: hit.h, startVal, startY: my };
        return;
      }
      case 'object': {
        let id = hit.id;
        if (e.altKey) id = this.duplicate(id) ?? id;
        const o = this.patch.objects.find((q) => q.id === id)!;
        const [wx, wy] = this.s2w(mx, my);
        this.sel = id;
        this.drag = { kind: 'move', id, dx: o.x - wx, dy: o.y - wy };
        return;
      }
    }
  }

  private onMove(e: PointerEvent): void {
    const mx = e.offsetX;
    const my = e.offsetY;
    this.mouse = { x: mx, y: my, inside: true };
    const pt = this.pointers.get(e.pointerId);
    if (pt) {
      pt.x = mx;
      pt.y = my;
    }
    const d = this.drag;
    if (d?.kind === 'pinch') {
      if (this.pointers.size < 2) return;
      const [a, b] = [...this.pointers.values()];
      this.cam.zoom = Math.min(8, Math.max(0.15, d.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / d.d0)));
      // keep the world point that started under the fingers' midpoint under it
      const [wx, wy] = this.s2w((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.cam.x += d.wx - wx;
      this.cam.y += d.wy - wy;
      return;
    }
    if (!d) {
      if (this.pinned && !this.nearPin(mx, my)) this.pinned = null;
      this.hover = this.panel ? null : this.hitTest(mx, my);
      this.canvas.style.cursor = this.hover && this.hover.kind !== 'strip' ? 'pointer' : 'default';
      return;
    }
    const [wx, wy] = this.s2w(mx, my);
    switch (d.kind) {
      case 'pan':
        this.cam.x = d.cx - (mx - d.sx) / this.cam.zoom;
        this.cam.y = d.cy + (my - d.sy) / this.cam.zoom;
        return;
      case 'move': {
        const x = Math.round(wx + d.dx);
        const y = Math.round(wy + d.dy);
        this.commitCoalesced('move:' + d.id, { op: 'move', id: d.id, x, y });
        return;
      }
      case 'handle':
        this.dragHandle(d, mx, my, wx, wy);
        return;
      case 'scrub':
        this.updateScrub(mx);
        return;
      case 'panel':
        panelPointerMove(this, d.data, mx, my);
        return;
      case 'fader':
        this.commitCoalesced('fader:' + d.id, trimEdit(this, d.id, faderDbAt(this, my)));
        return;
      case 'vol': {
        const db = Math.round(Math.min(12, Math.max(-40, d.start + (mx - d.sx) / 6)) * 2) / 2;
        this.commitCoalesced('vol', { op: 'master', value: db });
        return;
      }
      case 'mixerScroll':
        this.mixerScroll = d.start - (mx - d.sx);
        return;
      case 'mvalue': {
        const o = this.patch.objects.find((q) => q.id === d.id);
        if (!o) return;
        const dx = mx - d.sx;
        const v = stepValue(d.key, d.start, Math.round(dx / 12), dx);
        this.commitCoalesced(`mv:${d.id}:${d.key}`, valueEdit(o, d.key, v));
        return;
      }
      case 'palette':
        return;
    }
  }

  private dragHandle(d: Extract<Drag, { kind: 'handle' }>, mx: number, my: number, wx: number, wy: number): void {
    const o = this.patch.objects.find((q) => q.id === d.id);
    if (!o) return;
    const p = this.poseOf(o);
    const key = `${d.h.kind}:${d.id}:${d.h.key ?? d.h.index ?? ''}`;
    switch (d.h.kind) {
      case 'size': {
        const dx = wx - p.x;
        const dy = wy - p.y;
        if (o.kind === 'sound') {
          const size = Math.round(Math.min(200, Math.max(12, (2 * Math.hypot(dx, dy)) / p.scale)));
          this.commitCoalesced(key, { op: 'set', id: o.id, path: ['size'], value: size });
        } else if (isCircle(o.shape)) {
          const r = Math.round(Math.max(20, Math.hypot(dx, dy) / p.scale));
          this.commitCoalesced(key, { op: 'set', id: o.id, path: ['shape'], value: { r } });
        } else {
          const w = Math.round(Math.max(48, (2 * Math.abs(dx)) / p.scale));
          const h = Math.round(Math.max(48, (2 * Math.abs(dy)) / p.scale));
          this.commitCoalesced(key, { op: 'set', id: o.id, path: ['shape'], value: { w, h } });
        }
        return;
      }
      case 'char': {
        const v = Math.min(1, Math.max(0, d.startVal - (my - d.startY) / 160));
        this.commitCoalesced(key, { op: 'set', id: o.id, path: ['handles', d.h.key!], value: Math.round(v * 1000) / 1000 });
        return;
      }
      case 'mradius':
      case 'mamp': {
        const r = Math.round(Math.max(5, Math.hypot(wx - o.x, wy - o.y)));
        this.commitCoalesced(key, { op: 'set', id: o.id, path: ['motion', 'pos', d.h.kind === 'mradius' ? 'radius' : 'amplitude'], value: r });
        return;
      }
      case 'mpoint': {
        const m = o.motion?.pos;
        if (m?.type !== 'path') return;
        const pts = m.points.map((q) => [...q]);
        pts[d.h.index!] = [Math.round(wx - o.x), Math.round(wy - o.y)];
        this.commitCoalesced(key, { op: 'set', id: o.id, path: ['motion', 'pos', 'points'], value: pts });
        return;
      }
    }
    void mx;
  }

  private onUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    this.drag = null;
    const mx = e.offsetX;
    const my = e.offsetY;
    const down = this.downAt;
    this.downAt = null;
    if (down?.touch && down.id && Math.hypot(mx - down.x, my - down.y) < 8) this.onTap(down.id, down.wasSel);
    if (!d) return;
    // a dragged Tab pick stays pinned where it was dropped
    if (this.pinned && this.tabInfo && d.kind === 'move' && d.id === this.pinned) {
      this.tabInfo.x = mx;
      this.tabInfo.y = my;
    }
    if (d.kind === 'palette') {
      const inCanvas = !paletteHit(this, mx, my) && my < this.H - this.barH;
      const [wx, wy] = inCanvas ? this.s2w(mx, my) : [this.cam.x, this.cam.y];
      const o = this.makeObject(d.item, wx, wy);
      if (o) {
        this.commit({ op: 'add', obj: o });
        this.sel = o.id;
      }
      if (this.mobile) this.paletteOpen = false;
    } else if (d.kind === 'scrub') {
      const s = this.scrub;
      this.scrub = null;
      if (s && !s.cancelled && this.history) {
        const ago = (this.history.now - s.sample) / SR;
        this.commit({ op: 'load', patch: s.preview });
        this.toast(`branched from −${fmtTime(ago)}`);
      }
    }
    this.flushSends();
  }

  private updateScrub(mx: number): void {
    if (!this.history) return;
    const sample = stripSampleAt(this, mx);
    this.scrub = { sample, preview: this.history.patchAt(sample), cancelled: false };
  }

  /** Touch taps: tap a selected object again to step down its stack; double-tap a sound for its panel. */
  private onTap(id: string, wasSel: boolean): void {
    const now = performance.now();
    const o = this.obj(id);
    if (this.lastTap && this.lastTap.id === id && now - this.lastTap.t < 350 && o?.kind === 'sound') {
      this.panel = { id, auto: false };
      this.lastTap = null;
      return;
    }
    this.lastTap = { t: now, id };
    if (wasSel) this.cycleStack(1);
  }

  private onDbl(e: MouseEvent): void {
    const xh = this.mixerOpen ? mixerHitAt(this, e.offsetX, e.offsetY) : null;
    if (xh?.kind === 'fader') {
      this.commit(trimEdit(this, xh.id, 0));
      return;
    }
    const hit = this.hitTest(e.offsetX, e.offsetY);
    if (hit?.kind === 'object' && this.obj(hit.id)?.kind === 'sound') this.panel = { id: hit.id, auto: false };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const mx = e.offsetX;
    const my = e.offsetY;
    if (my > this.H - this.barH) {
      const u = this.uiHits.find((q) => mx >= q.x && mx <= q.x + q.w);
      if (u) this.wheelUi(u.id, e.deltaY < 0 ? 1 : -1);
      return;
    }
    if (this.mixerOpen) {
      const r = mixerRect(this);
      if (my >= r.y && my < r.y + r.h) {
        const xh = mixerHitAt(this, mx, my);
        if (xh?.kind === 'fader') {
          const cur = xh.id === 'master' ? (this.patch.master ?? 0) : (this.patch.objects.find((o) => o.id === xh.id)?.trim ?? 0);
          this.commit(trimEdit(this, xh.id, Math.min(12, Math.max(-40, cur + (e.deltaY < 0 ? 1 : -1)))));
        } else {
          this.mixerScroll += e.deltaX + e.deltaY;
        }
        return;
      }
    }
    const mh = motionHitAt(this, mx, my);
    if (mh && mh.action.kind === 'value') {
      const o = this.patch.objects.find((q) => q.id === this.sel);
      if (o) {
        const dir = e.deltaY < 0 ? 1 : -1;
        const key = mh.action.key;
        this.commit(valueEdit(o, key, stepValue(key, readValue(o, key), dir, dir * 10)));
      }
      return;
    }
    const sel = this.obj(this.sel);
    if (e.altKey && sel) {
      const f = e.deltaY < 0 ? 0.5 : 2;
      if (sel.motion?.pos && 'periodBeats' in sel.motion.pos) {
        const v = Math.min(256, Math.max(1, sel.motion.pos.periodBeats * f));
        this.commit({ op: 'set', id: sel.id, path: ['motion', 'pos', 'periodBeats'], value: v });
        this.toast(`motion period ${v} beats`);
      } else if (sel.motion?.pos?.type === 'drift') {
        const v = Math.min(256, Math.max(1, sel.motion.pos.rateBeats * f));
        this.commit({ op: 'set', id: sel.id, path: ['motion', 'pos', 'rateBeats'], value: v });
        this.toast(`drift rate ${v} beats`);
      } else if (sel.motion?.breathe) {
        const v = Math.min(256, Math.max(1, sel.motion.breathe.periodBeats * f));
        this.commit({ op: 'set', id: sel.id, path: ['motion', 'breathe', 'periodBeats'], value: v });
        this.toast(`breathe period ${v} beats`);
      }
      return;
    }
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey || mouseWheel) {
      const k = Math.exp(-e.deltaY * (mouseWheel ? 0.0015 : 0.01));
      this.zoomAt(mx, my, k);
    } else {
      this.cam.x += e.deltaX / this.cam.zoom;
      this.cam.y -= e.deltaY / this.cam.zoom;
    }
  }

  zoomAt(mx: number, my: number, k: number): void {
    const [wx, wy] = this.s2w(mx, my);
    this.cam.zoom = Math.min(8, Math.max(0.15, this.cam.zoom * k));
    const [wx2, wy2] = this.s2w(mx, my);
    this.cam.x += wx - wx2;
    this.cam.y += wy - wy2;
  }

  private onUi(id: string): void {
    const p = this.patch;
    switch (id) {
      case 'play':
        if (!this.audio.started) void this.ensureAudio();
        else void this.audio.toggle();
        return;
      case 'scale': {
        const i = SCALE_ORDER.indexOf(p.key.scale);
        this.commit({ op: 'key', value: { ...p.key, scale: SCALE_ORDER[(i + 1) % SCALE_ORDER.length] } });
        return;
      }
      case 'seed':
        this.commit({ op: 'seed', value: (Math.random() * 1e6) | 0 });
        return;
      case 'tempo':
        this.tap();
        return;
      case 'capture':
        void this.capture();
        return;
      case 'help':
        this.showHelp = !this.showHelp;
        return;
      case 'new':
        this.load({ ...emptyPatch(), tempo: p.tempo, key: p.key, seed: p.seed }, 'new patch · scrub the timeline to go back');
        return;
      case 'open':
        this.openPatch();
        return;
      case 'save':
        this.savePatch();
        return;
      case 'examples':
        this.examplesOpen = !this.examplesOpen;
        return;
      case 'mixer':
        this.mixerOpen = !this.mixerOpen;
        return;
    }
    if (id.startsWith('example:')) {
      const ex = EXAMPLES.find((x) => 'example:' + x.id === id);
      this.examplesOpen = false;
      if (ex) this.load(ex.patch, `loaded ${ex.label}`);
    }
  }

  savePatch(): void {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    download(new Blob([JSON.stringify(this.patch, null, 2)], { type: 'application/json' }), `gener8-${stamp}.json`);
    this.toast('patch saved');
  }

  openPatch(): void {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (f) f.text().then((t) => this.load(JSON.parse(t), `loaded ${f.name}`));
    };
    inp.click();
  }

  private wheelUi(id: string, dir: number): void {
    const p = this.patch;
    if (id === 'tempo') this.commit({ op: 'tempo', value: p.tempo + dir });
    else if (id === 'root') this.commit({ op: 'key', value: { ...p.key, root: (p.key.root + dir + 12) % 12 } });
    else if (id === 'scale') {
      const i = SCALE_ORDER.indexOf(p.key.scale);
      this.commit({ op: 'key', value: { ...p.key, scale: SCALE_ORDER[(i + dir + SCALE_ORDER.length) % SCALE_ORDER.length] } });
    } else if (id === 'seed') this.commit({ op: 'seed', value: (p.seed + dir) >>> 0 });
    else if (id === 'vol') this.commit({ op: 'master', value: Math.min(12, Math.max(-40, (p.master ?? 0) + dir)) });
  }

  private onKey(e: KeyboardEvent): void {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 's') {
      e.preventDefault();
      this.savePatch();
      return;
    }
    if (mod && e.key === 'o') {
      e.preventDefault();
      this.openPatch();
      return;
    }
    if (mod && e.key === 'd' && this.sel) {
      e.preventDefault();
      this.sel = this.duplicate(this.sel) ?? this.sel;
      return;
    }
    if (mod) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      this.cycleStack(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.spaceDown && !e.repeat) {
        if (!this.audio.started) void this.ensureAudio();
        else void this.audio.toggle();
      }
      this.spaceDown = true;
      return;
    }
    void this.ensureAudio();
    const sel = this.sel;
    switch (e.key) {
      case 'Escape':
        this.pinned = null;
        if (this.examplesOpen) this.examplesOpen = false;
        else if (this.scrub) this.scrub.cancelled = true;
        else if (this.panel) this.panel = null;
        else if (this.showHelp) this.showHelp = false;
        else this.sel = null;
        return;
      case 'Backspace':
      case 'Delete':
        if (sel) {
          this.commit({ op: 'remove', id: sel });
          this.sel = null;
          if (this.panel?.id === sel) this.panel = null;
        }
        return;
      case '[':
        if (sel) this.shiftLayer(sel, -1);
        return;
      case ']':
        if (sel) this.shiftLayer(sel, 1);
        return;
      case 'm':
        if (sel) this.cycleMotion(sel);
        return;
      case 'b':
        if (sel) this.toggleBreathe(sel);
        return;
      case 'c':
        void this.capture();
        return;
      case 't':
        this.tap();
        return;
      case 'h':
      case '?':
        this.showHelp = !this.showHelp;
        return;
      case '=':
      case '+':
        this.zoomAt(this.W / 2, this.H / 2, 1.25);
        return;
      case '-':
        this.zoomAt(this.W / 2, this.H / 2, 0.8);
        return;
      case '0':
        this.cam = { x: 0, y: 0, zoom: 1 };
        return;
      case 'D':
      case 'T':
      case 'R':
      case 'X': {
        const ex = EXAMPLES.find((x) => x.key === e.key)!;
        this.load(ex.patch, `loaded ${ex.label}`);
        return;
      }
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        const o = this.obj(sel);
        if (!o) return;
        e.preventDefault();
        const step = e.shiftKey ? 120 : 10;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
        this.commit({ op: 'move', id: o.id, x: o.x + dx, y: o.y + dy });
        return;
      }
    }
  }
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const CAPTURE_SAMPLES = CAPTURE_SECONDS * SR;
