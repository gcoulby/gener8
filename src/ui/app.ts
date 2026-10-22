import type { Edit, EventRecord, FieldObj, MapType, Patch, PatchObject, PosMotion, SoundObj } from '../core/types.ts';
import { PPQ, SR, CAPTURE_SECONDS, MIDI_MAX, MIDI_MIN, RIPPLE_SPEED } from '../core/constants.ts';
import { applyEdit, byLayer, classicStage, clone, emptyPatch, nextId, normalizePatch } from '../core/patch.ts';
import { followPose, type Pose } from '../core/motion.ts';
import { angleTurns, depthAt, isCircle } from '../core/geometry.ts';
import { soundTypes, defaultParams } from '../core/sounds/registry.ts';
import { fieldTypes, defaultHandles, isMap, mapTypeOf } from '../core/fields/registry.ts';
import { governingAxis, newPlacement, placeSound, RIPPLE_LIMITS, rippleOf, type MapPose, type Placement } from '../core/placement.ts';
import { triCorner } from '../core/fields/maps.ts';
import { noteName } from '../core/music.ts';
import { generatePatch, generators } from '../core/generate.ts';
import { buildShare, isDisposable, linkErrorMessage, parseHash, resolveLink } from './share.ts';
import { AudioBridge } from './audio.ts';
import { History } from './history.ts';
import { download, encodeWav } from './wav.ts';
import { InfoDialog, infoFileName, readAuthor, signInfo, writeAuthor } from './info.ts';
import { RenderJob } from './renderjob.ts';
import { openSink, VideoJob } from './video.ts';
import { fmtRenderSpec, fmtTime, fmtVideoSpec, RENDER_DEFAULT, VIDEO_DEFAULT, type RenderSpec, type VideoSpec } from './takespec.ts';
import type { Tele } from '../worklet/protocol.ts';
import { draw } from './draw.ts';
import { paletteHit, type PaletteItem } from './palette.ts';
import { inStrip, STRIP_H, stripSampleAt } from './timeline.ts';
import { Bar, parseSeed } from './bar.ts';
import { faderDbAt, mixerHitAt, mixerRect, toggleEdit as mixerToggle, trimEdit, type MixerHit } from './mixer.ts';
import { panelPointerDown, panelPointerMove, panelRect } from './panel.ts';
import { axisTargetEdit, inAxisMenu, menuHitAt, motionHitAt, openAxisMenu, readValue, stepValue, toggleEdit, valueEdit, MAX_PERIOD, periodLabel, type AxisMenu, type MenuHit, type MotionHit, type ValueKey } from './motionbar.ts';
import { EXAMPLES } from './examples.ts';
import { DocsViewer, parseDocsHash } from './docs.ts';
import { inMinimap, m2w, minimapTf, type MiniTf } from './minimap.ts';

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
  falloff: number;
  /** Traces: directions in turns and how far each one gets (stop on impact). */
  dirs?: number[];
  lens?: number[];
  /** Ring with stop on: where it ends. */
  stopR?: number;
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
}

export type HandleKind = 'size' | 'char' | 'mradius' | 'mamp' | 'mheight' | 'mpoint' | 'ripple';

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
  /** The bar, outside the strip: its controls are DOM and take their own events. */
  | { kind: 'bar' }
  | { kind: 'motion'; hit: MotionHit }
  | { kind: 'mixer'; hit: MixerHit }
  | { kind: 'mixerBg' }
  | { kind: 'paletteToggle' }
  | { kind: 'minimap' }
  | { kind: 'menu'; hit: MenuHit }
  | { kind: 'strip' };

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'move'; id: string; dx: number; dy: number }
  | { kind: 'handle'; id: string; h: HandlePos; startVal: number; startY: number }
  | { kind: 'palette'; item: PaletteItem }
  | { kind: 'scrub' }
  | { kind: 'mvalue'; id: string; key: ValueKey; start: number; sx: number }
  | { kind: 'fader'; id: string }
  | { kind: 'mixerScroll'; sx: number; start: number }
  | { kind: 'pinch'; d0: number; z0: number; wx: number; wy: number }
  | { kind: 'minimap'; tf: MiniTf }
  | { kind: 'panel'; key: string; data: any };

const STORE_KEY = 'gener8.patch.v2';
/** Where the stored patch goes when a link replaces it. */
const PREV_KEY = 'gener8.patch.prev';
const MINIMAP_KEY = 'gener8.minimap';
const LIT_KEY = 'gener8.lit';
export const HANDLE_ZOOM = 0.6;
/** Far enough out to see the whole canvas (±8000, see sanitise.ts XY). */
const MIN_ZOOM = 0.05;

/** A copy of the App that only draws, for video frames (see video.ts). */
export interface Headless {
  patch: Patch;
  W: number;
  H: number;
  dpr: number;
  /** The live App: its view and open panels are what the video shows. */
  from: App;
  /** Just the elements: no UI, labels or map fields (a short). Its own camera. */
  clean?: { cam: { x: number; y: number; zoom: number } };
}

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
  /** Offline render in progress (see startRender). */
  render: RenderJob | null = null;
  /** Video render in progress (see startVideo). */
  video: VideoJob | null = null;
  /** Drawing video frames: no input, no audio, playing from the start. */
  readonly headless: boolean;
  /** Draw only the elements (see Headless.clean). */
  readonly clean: boolean;
  voices = 0;
  pending: EventRecord[] = [];
  pulses = new Map<string, Pulse>();
  ripples: RippleVis[] = [];
  causes: Cause[] = [];
  fieldFlash = new Map<string, number>();
  /** Latest generator visuals (grid cells, plinko balls, Turing register) and when each arrived. */
  visuals = new Map<string, { data: unknown; t: number }>();
  poses = new Map<string, Pose>();
  /** XY fields in layer order, with their current poses, and what they make of each sound. */
  maps: MapPose[] = [];
  places = new Map<string, Placement>();
  driven = new Set<string>();
  tickNow = 0;
  beat = 0;
  now = 0;
  motionHits: MotionHit[] = [];
  /** Touch device with a phone/tablet-sized screen: switches to the mobile layout. */
  mobile = false;
  /** The bottom bar's controls (none in video frames). */
  readonly bar: Bar | null = null;
  /** Height of the bottom bar, set as it's drawn. */
  barH = STRIP_H;
  paletteOpen = false;
  mixerOpen = false;
  showMinimap = readFlag(MINIMAP_KEY, true);
  /** Everything at full brightness, instead of lit by nearness to the cursor. */
  lit = readFlag(LIT_KEY, false);
  readonly docs = new DocsViewer();
  readonly infoDialog = new InfoDialog();
  /** Open axis-target dropdown, and its item hit boxes (set while drawing). */
  axisMenu: AxisMenu | null = null;
  /** Picking a leader for this object: the next click on an object sets its follow. */
  followPick: string | null = null;
  readonly lookup = (id: string): PatchObject | undefined => this.view.objects.find((o) => o.id === id);
  menuHits: MenuHit[] = [];
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
  toastMsg = '';
  toastT = 0;
  private taps: number[] = [];
  /** Replacing an edited patch needs a second press before this time. */
  private confirmUntil = 0;
  /** What the render menu last rendered, which it starts from next time. */
  renderSpec: RenderSpec = RENDER_DEFAULT;
  videoSpec: VideoSpec = VIDEO_DEFAULT;
  private spaceDown = false;
  private sendQueue = new Map<string, Edit>();
  private saveTimer = 0;

  constructor(canvas: HTMLCanvasElement, headless?: Headless) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d')!;
    this.headless = !!headless;
    this.clean = !!headless?.clean;
    if (headless) {
      const { from } = headless;
      this.patch = headless.patch;
      this.W = headless.W;
      this.H = headless.H;
      this.dpr = headless.dpr;
      this.mobile = from.mobile;
      this.history = new History(this.patch);
      this.lit = true;
      this.cam = { ...from.cam };
      this.sel = this.patch.objects.some((o) => o.id === from.sel) ? from.sel : null;
      this.panel = this.sel && from.panel?.id === this.sel ? { ...from.panel } : null;
      this.paletteOpen = from.paletteOpen;
      this.mixerOpen = from.mixerOpen;
      this.mixerScroll = from.mixerScroll;
      this.showMinimap = from.showMinimap;
      if (headless.clean) {
        this.cam = { ...headless.clean.cam };
        this.sel = null;
        this.panel = null;
        this.barH = 0;
      }
      return;
    }
    // Precedence: a link, then the stored patch, then the demo. Seed links build
    // synchronously so the old patch never flashes; patch links decode async.
    const link = parseHash(location.hash);
    const seeded = link?.kind === 'seed' && generators[link.gen] ? generatePatch(link.seed, link.gen) : null;
    if (seeded) this.stashPrev(false);
    this.patch = seeded ?? this.loadStored() ?? normalizePatch(EXAMPLES[0].patch);
    this.resize();
    this.bind();
    this.bar = new Bar(this);
    this.barH = this.bar.layout().h;
    if (seeded) {
      this.stripHash();
      this.fitView();
      this.queueSave();
      this.toastLoaded();
    } else if (link) void this.loadFromHash();
    const doc = parseDocsHash(location.hash);
    if (doc) this.docs.open(doc.page, doc.anchor);
    window.addEventListener('hashchange', () => void this.loadFromHash());
    requestAnimationFrame(this.frame);
  }

  /** Load the patch named by location.hash, if any. Never starts audio; a bad link keeps the current patch. */
  async loadFromHash(): Promise<void> {
    const hash = location.hash;
    if (hash.length < 2) return;
    // #docs/<page>: open the guide, leaving the patch alone
    const doc = parseDocsHash(hash);
    if (doc) {
      this.docs.open(doc.page, doc.anchor);
      return;
    }
    const link = parseHash(hash);
    // strip it either way, so a reload doesn't repeat it
    this.stripHash();
    if (!link) {
      this.toast('bad link');
      return;
    }
    try {
      const p = await resolveLink(link);
      this.stashPrev(true);
      this.load(p, '');
      this.fitView();
      this.toastLoaded();
      this.showInfo();
    } catch (err) {
      this.toast(linkErrorMessage(err));
    }
  }

  private toastLoaded(): void {
    const n = (k: string) => this.patch.objects.filter((o) => o.kind === k).length;
    this.toast(`loaded shared patch · ${n('sound')} sounds, ${n('field')} fields · ${this.mobile ? 'tap ▶' : 'press space'}`);
  }

  private stripHash(): void {
    history.replaceState(null, '', location.pathname + location.search);
  }

  /**
   * Keep the stored patch in gener8.patch.prev before a link replaces it. In an
   * open tab (`flush`), save the live patch first so recent edits aren't lost.
   */
  private stashPrev(flush: boolean): void {
    try {
      if (flush) {
        clearTimeout(this.saveTimer);
        localStorage.setItem(STORE_KEY, JSON.stringify(this.patch));
      }
      const cur = localStorage.getItem(STORE_KEY);
      if (cur) localStorage.setItem(PREV_KEY, cur);
    } catch {
      /* storage unavailable */
    }
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

  /** False (with a toast) when `p` isn't a patch. */
  load(p: unknown, label: string): boolean {
    try {
      const patch = normalizePatch(p);
      this.commit({ op: 'load', patch });
      this.sel = null;
      this.panel = null;
      this.toast(label);
      return true;
    } catch (err) {
      this.toast('could not load: ' + (err as Error).message);
      return false;
    }
  }

  /** Open a patch file's text, then show its info if it has some. */
  private loadFile(f: File): void {
    f.text()
      .then((t) => JSON.parse(t))
      .then(
        (p) => this.load(p, `loaded ${f.name}`) && this.showInfo(),
        () => this.toast(`could not load: ${f.name} isn't JSON`),
      );
  }

  /** The patch's info card, if it has info. */
  showInfo(): void {
    const info = this.patch.info;
    if (info) this.infoDialog.show(info, () => this.editInfo());
  }

  editInfo(): void {
    this.infoDialog.edit(this.patch.info, readAuthor(), (info, remember) => {
      if (remember) writeAuthor({ artist: info.artist?.trim() || undefined, url: info.url?.trim() || undefined });
      this.commit({ op: 'info', value: info });
      this.toast(this.patch.info ? 'patch info saved' : 'patch info cleared');
    });
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
    this.audio.onTele = (t) => this.ingest(t, performance.now());
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

  /** Telemetry from the engine: events wait in `pending` until they are heard (see activate). */
  ingest(t: Tele, now: number): void {
    this.history?.ingest(t.edits, t.events, t.sample);
    this.voices = t.voices;
    for (const e of t.events) this.pending.push(e);
    if (this.pending.length > 4000) this.pending.splice(0, this.pending.length - 4000);
    for (const id in t.meters) this.meterLevel.set(id, Math.max(this.meterLevel.get(id) ?? 0, t.meters[id]));
    for (const v of t.visuals) this.visuals.set(v.id, { data: v.data, t: now });
  }

  /**
   * Render the current patch from a fresh start, as a reload + play would sound,
   * faster than real time in a worker. Downloads WAV + patch JSON when done.
   */
  async startRender(spec: RenderSpec): Promise<void> {
    this.render?.cancel();
    const patch = clone(this.patch);
    const job = new RenderJob(patch, spec.seconds, spec.fade);
    this.render = job;
    this.toast(`rendering ${fmtRenderSpec(spec)} from the start · cancel it in the render menu`);
    let wav: Blob;
    try {
      wav = await job.done;
    } catch (err) {
      if (this.render === job) this.render = null;
      this.toast('render failed: ' + (err as Error).message);
      return;
    }
    if (this.render !== job) return;
    this.render = null;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = `gener8-render-${stamp}`;
    download(wav, `${name}.wav`);
    const meta = { format: 'gener8.render', version: 1, sampleRate: SR, seconds: spec.seconds, fade: spec.fade, seed: patch.seed, patch };
    download(new Blob([JSON.stringify(meta)], { type: 'application/json' }), `${name}.json`);
    this.toast(`rendered ${fmtRenderSpec(spec)} → ${name}.wav + .json`);
  }

  /**
   * Render the patch from a fresh start as an MP4 of the whole window, in the
   * background. The file is chosen first, while the Enter still counts as a click.
   */
  async startVideo(spec: VideoSpec): Promise<void> {
    this.video?.cancel();
    this.video = null;
    const patch = clone(this.patch);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    let sink;
    try {
      sink = await openSink(`gener8-${spec.short ? 'short' : 'video'}-${stamp}`);
    } catch (err) {
      this.toast('video failed: ' + (err as Error).message);
      return;
    }
    if (!sink) return;
    const job = new VideoJob(this, patch, spec, sink);
    this.video = job;
    this.toast(`rendering video ${fmtVideoSpec(spec)} from the start · cancel it in the render menu`);
    try {
      await job.done;
    } catch (err) {
      if (this.video === job) this.video = null;
      this.toast('video failed: ' + (err as Error).message);
      return;
    }
    if (this.video !== job) return;
    this.video = null;
    const meta = { format: 'gener8.video', version: 1, sampleRate: SR, ...spec, seed: patch.seed, patch };
    download(new Blob([JSON.stringify(meta)], { type: 'application/json' }), `${sink.name}.json`);
    this.toast(`rendered video ${fmtVideoSpec(spec)} → ${sink.name}.mp4 + .json`);
  }

  // ---------- frame ----------

  private frame = (now: number): void => {
    this.bar?.sync();
    this.flushSends();
    if (this.audio.started) {
      const a = this.audio.audibleSample();
      this.tickNow = Math.max(0, this.audio.tickAt(a));
      this.activate(a, now);
    }
    requestAnimationFrame(this.frame);
    this.paint(now, 0.88);
  };

  /** Draw one frame at time `now` (ms); `decay` is how far the meters fall since the last. */
  paint(now: number, decay: number): void {
    this.now = now;
    this.beat = this.tickNow / PPQ;
    for (const [id, v] of this.meterLevel) this.meterLevel.set(id, v * decay);
    this.computePoses();
    this.autoPanel();
    try {
      draw(this);
    } catch (err) {
      // Never let one bad frame freeze the instrument.
      if (!this.drawFailed) console.error('draw failed', err);
      this.drawFailed = true;
    }
  }

  /** Bring in the events heard by engine sample `audible`. */
  activate(audible: number, now: number): void {
    let i = 0;
    const p = this.pending;
    while (i < p.length && p[i].sample <= audible) {
      const e = p[i++];
      this.pulses.set(e.soundId, { t: now, vel: e.velocity, accent: e.accent });
      if (e.rippleR > 0) this.ripples.push(this.rippleVis(e));
      if (e.sourceKind === 'generator') this.fieldFlash.set(e.sourceId, now);
      else this.causes.push({ from: e.sourceId, to: e.soundId, t: now });
    }
    if (i) p.splice(0, i);
    this.ripples = this.ripples.filter((r) => ((this.tickNow - r.tick) / PPQ) * RIPPLE_SPEED < visReach(r));
    if (this.ripples.length > 80) this.ripples.splice(0, this.ripples.length - 80);
    this.causes = this.causes.filter((c) => now - c.t < 500);
  }

  /**
   * What to draw for a ripple. With stop on impact the end is worked out here
   * from where listeners are now: close to, but not exactly, what the engine hears.
   */
  private rippleVis(e: EventRecord): RippleVis {
    const r: RippleVis = { x: e.x, y: e.y, tick: e.tick, maxR: e.rippleR, vel: e.velocity, falloff: e.rippleFalloff ?? 1, dirs: e.rippleDirs };
    if (!e.rippleStop && !e.rippleDirs) return r;
    const listeners: { x: number; y: number; w: number }[] = [];
    for (const o of this.view.objects) {
      if (o.kind !== 'sound' || o.id === e.soundId) continue;
      if (soundTypes[o.type]?.mode === 'event' && this.driven.has(o.id)) continue;
      const p = this.poseOf(o);
      listeners.push({ x: p.x - e.x, y: p.y - e.y, w: Math.max(8, (o.size * p.scale) / 2) });
    }
    if (e.rippleDirs) {
      r.lens = e.rippleDirs.map((t) => {
        if (!e.rippleStop) return e.rippleR;
        const ux = Math.sin(t * Math.PI * 2);
        const uy = Math.cos(t * Math.PI * 2);
        let best = e.rippleR;
        for (const l of listeners) {
          const along = l.x * ux + l.y * uy;
          if (along > 0 && along < best && Math.abs(l.x * uy - l.y * ux) <= l.w) best = along;
        }
        return best;
      });
    } else {
      r.stopR = Math.min(e.rippleR, ...listeners.map((l) => Math.hypot(l.x, l.y)));
    }
    return r;
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
      followPose(o, this.beat, v.seed, this.lookup, p);
      seen.add(o.id);
    }
    for (const k of this.poses.keys()) if (!seen.has(k)) this.poses.delete(k);
    this.maps = v.objects
      .filter((o): o is FieldObj => isMap(o))
      .sort(byLayer)
      .map((o) => ({ obj: o, pose: this.poseOf(o), type: fieldTypes[o.type] as MapType }));
    for (const k of this.places.keys()) if (!seen.has(k)) this.places.delete(k);
    for (const o of v.objects) {
      if (o.kind !== 'sound') continue;
      let pl = this.places.get(o.id);
      if (!pl) {
        pl = newPlacement();
        this.places.set(o.id, pl);
      }
      const p = this.poseOf(o);
      placeSound(p.x, p.y, this.maps, o, pl);
    }
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
      if (o.id === this.sel && soundTypes[o.type]?.mode === 'event') {
        // retrigger handle: its direction is the sound's own angle, its distance its own reach
        // (a map field may override either; the handle's tag says so)
        const r = rippleOf(o.ripple);
        const a = (r.angle / 360) * Math.PI * 2;
        const R = Math.max(this.soundRadius(o) + 18, r.reach * o.size * p.scale * z);
        out.push({ kind: 'ripple', x: sx + Math.sin(a) * R, y: sy - Math.cos(a) * R });
      }
    } else {
      const t = fieldTypes[o.type];
      const keys = t ? t.handles.map((h) => h.key) : [];
      if (t?.shape === 'triangle' && isCircle(o.shape)) {
        const [cx, cy] = triCorner(1, o.shape.r * p.scale * z);
        out.push({ kind: 'size', x: sx + cx, y: sy - cy });
      } else if (isCircle(o.shape)) {
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
      else if (m.type === 'bounce') out.push({ kind: 'mheight', x: hx, y: hy - m.height * z });
      else if (m.type === 'path')
        m.points.forEach((pt, i) => {
          const [px, py] = this.w2s(o.x + pt[0], o.y + pt[1]);
          out.push({ kind: 'mpoint', index: i, x: px, y: py });
        });
    }
    return out;
  }

  hitTest(mx: number, my: number): Hit | null {
    if (this.axisMenu) {
      const h = menuHitAt(this, mx, my);
      if (h) return { kind: 'menu', hit: h };
    }
    if (this.mixerOpen) {
      const r = mixerRect(this);
      if (my >= r.y && my < r.y + r.h) {
        const xh = mixerHitAt(this, mx, my);
        return xh ? { kind: 'mixer', hit: xh } : { kind: 'mixerBg' };
      }
    }
    if (this.mobile && mx >= 8 && mx <= 44 && my >= 46 && my <= 82) return { kind: 'paletteToggle' };
    if (inMinimap(this, mx, my)) return { kind: 'minimap' };
    const mh = motionHitAt(this, mx, my);
    if (mh) return { kind: 'motion', hit: mh };
    const pi = paletteHit(this, mx, my);
    if (pi) return { kind: 'palette', item: pi };
    if (my > this.H - this.barH) return inStrip(this, mx, my) ? { kind: 'strip' } : { kind: 'bar' };
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
    const mapsHit: string[] = [];
    for (const o of sorted) {
      if (o.kind !== 'field') continue;
      const p = this.poseOf(o);
      if (mapTypeOf(o)) {
        // Map fields are the ground everything sits on: pick them by their edge or label only.
        const lb = this.mapLabelBox(o);
        const onLabel = mx >= lb.x && mx <= lb.x + lb.w && my >= lb.y && my <= lb.y + lb.h;
        if (mapEdgeDist(o, p, wx, wy) * z < EDGE || onLabel) mapsHit.push(o.id);
        continue;
      }
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
    return out.concat(mapsHit);
  }

  /** Screen box of a map field's label, which also picks it: top-left inside a rectangle, above the top of a circle or triangle. */
  mapLabelBox(o: FieldObj): { x: number; y: number; w: number; h: number; align: 'left' | 'center' } {
    const p = this.poseOf(o);
    const z = this.cam.zoom;
    const [sx, sy] = this.w2s(p.x, p.y);
    if (isCircle(o.shape)) return { x: sx - 40, y: sy - o.shape.r * p.scale * z - 22, w: 80, h: 18, align: 'center' };
    return { x: sx - (o.shape.w * p.scale * z) / 2, y: sy - (o.shape.h * p.scale * z) / 2, w: 80, h: 20, align: 'left' };
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

  /** Everything that follows id, directly or down a chain. */
  followersOf(id: string): PatchObject[] {
    const out: PatchObject[] = [];
    const seen = new Set([id]);
    for (let frontier = [id]; frontier.length; ) {
      const next: string[] = [];
      for (const o of this.patch.objects) {
        if (o.follow && frontier.includes(o.follow) && !seen.has(o.id)) {
          seen.add(o.id);
          out.push(o);
          next.push(o.id);
        }
      }
      frontier = next;
    }
    return out;
  }

  /** Move an object, and its followers by the same amount, so a group moves together. */
  private moveGroup(id: string, x: number, y: number, coalesce: boolean): void {
    const o = this.patch.objects.find((q) => q.id === id);
    if (!o) return;
    const dx = x - o.x;
    const dy = y - o.y;
    const send = (e: Edit) => (coalesce ? this.commitCoalesced(`move:${e.op === 'move' ? e.id : ''}`, e) : this.commit(e));
    send({ op: 'move', id, x, y });
    if (dx || dy) for (const f of this.followersOf(id)) send({ op: 'move', id: f.id, x: f.x + dx, y: f.y + dy });
  }

  private setFollow(id: string, leader: string): void {
    if (id === leader) return;
    // no loops: the leader mustn't already follow this object
    if (this.followersOf(id).some((f) => f.id === leader)) {
      this.toast(`${leader} already follows ${id}`);
      return;
    }
    this.commit({ op: 'set', id, path: ['follow'], value: leader });
    this.toast(`${id} follows ${leader} · give ${leader} motion to move them together`);
  }

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
    const f: FieldObj = { id: nextId(this.patch, t.role === 'map' ? t.id : 'f'), kind: 'field', type: t.id, x: Math.round(x), y: Math.round(y), shape: clone(t.defaultShape), layer, handles: defaultHandles(t) };
    if (t.role === 'map') f.axes = clone(t.defaultAxes);
    return f;
  }

  private duplicate(id: string): string | null {
    const o = this.patch.objects.find((q) => q.id === id);
    if (!o) return null;
    const c = clone(o);
    c.id = nextId(this.patch, o.kind === 'sound' ? 's' : isMap(o) ? o.type : 'f');
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
    else if (cur === 'path') next = { type: 'bounce', height: 120, bounces: 4, periodBeats: 8 };
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

  tap(): void {
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
      if (f) this.loadFile(f);
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

    if (this.axisMenu) {
      // an open menu takes the click: pick an item, or close it
      const h = menuHitAt(this, mx, my);
      const m = this.axisMenu;
      const o = this.patch.objects.find((q) => q.id === m.id);
      if (h && o) this.commit(axisTargetEdit(o, m.axis, h.to));
      if (h || !inAxisMenu(this, mx, my)) this.axisMenu = null;
      return;
    }

    const hit = this.hitTest(mx, my);
    if (this.followPick) {
      // picking a leader: an object sets it, anything else cancels
      if (hit?.kind === 'object') this.setFollow(this.followPick, hit.id);
      else if (!(hit?.kind === 'motion' && hit.hit.action.kind === 'follow')) this.toast('follow cancelled');
      this.followPick = null;
      return;
    }
    this.downAt = { x: mx, y: my, id: hit?.kind === 'object' ? hit.id : null, wasSel: hit?.kind === 'object' && hit.id === this.sel, touch };
    if (!hit) {
      this.sel = null;
      this.drag = { kind: 'pan', sx: mx, sy: my, cx: this.cam.x, cy: this.cam.y };
      return;
    }
    switch (hit.kind) {
      case 'palette':
        this.drag = { kind: 'palette', item: hit.item };
        return;
      case 'paletteToggle':
        this.paletteOpen = !this.paletteOpen;
        return;
      case 'minimap': {
        const tf = minimapTf(this);
        if (!tf) return;
        this.drag = { kind: 'minimap', tf };
        [this.cam.x, this.cam.y] = m2w(tf, mx, my);
        return;
      }
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
        if (a.kind === 'axis') {
          openAxisMenu(this, o, a.axis, hit.hit);
          return;
        }
        if (a.kind === 'follow') {
          this.followPick = o.id;
          return;
        }
        if (a.kind === 'value') {
          this.drag = { kind: 'mvalue', id: o.id, key: a.key, start: readValue(o, a.key), sx: mx };
        } else {
          const ed = toggleEdit(this, o, a);
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
      this.cam.zoom = Math.min(8, Math.max(MIN_ZOOM, d.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / d.d0)));
      // keep the world point that started under the fingers' midpoint under it
      const [wx, wy] = this.s2w((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.cam.x += d.wx - wx;
      this.cam.y += d.wy - wy;
      return;
    }
    if (!d) {
      if (this.pinned && !this.nearPin(mx, my)) this.pinned = null;
      this.hover = this.panel ? null : this.hitTest(mx, my);
      this.canvas.style.cursor = this.hover && this.hover.kind !== 'strip' && this.hover.kind !== 'bar' ? 'pointer' : 'default';
      return;
    }
    const [wx, wy] = this.s2w(mx, my);
    switch (d.kind) {
      case 'minimap':
        [this.cam.x, this.cam.y] = m2w(d.tf, mx, my);
        return;
      case 'pan':
        this.cam.x = d.cx - (mx - d.sx) / this.cam.zoom;
        this.cam.y = d.cy + (my - d.sy) / this.cam.zoom;
        return;
      case 'move':
        this.moveGroup(d.id, Math.round(wx + d.dx), Math.round(wy + d.dy), true);
        return;
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
      case 'mixerScroll':
        this.mixerScroll = d.start - (mx - d.sx);
        return;
      case 'mvalue': {
        const o = this.patch.objects.find((q) => q.id === d.id);
        if (!o) return;
        const dx = mx - d.sx;
        const v = stepValue(o, d.key, d.start, Math.round(dx / 12), dx);
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
        if (isMap(o) && !isCircle(o.shape)) {
          // XY fields resize from the corner: the opposite (top-left) corner stays put.
          const left = o.x - o.shape.w / 2;
          const top = o.y + o.shape.h / 2;
          const w = Math.round(Math.max(48, wx - left));
          const h = Math.round(Math.max(48, top - wy));
          this.commitCoalesced(key, { op: 'set', id: o.id, path: ['shape'], value: { w, h } });
          this.commitCoalesced(key + ':pos', { op: 'move', id: o.id, x: Math.round(left + w / 2), y: Math.round(top - h / 2) });
          return;
        }
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
      case 'mheight':
        this.commitCoalesced(key, { op: 'set', id: o.id, path: ['motion', 'pos', 'height'], value: Math.round(Math.max(5, wy - o.y)) });
        return;
      case 'mradius':
      case 'mamp': {
        const r = Math.round(Math.max(5, Math.hypot(wx - o.x, wy - o.y)));
        this.commitCoalesced(key, { op: 'set', id: o.id, path: ['motion', 'pos', d.h.kind === 'mradius' ? 'radius' : 'amplitude'], value: r });
        return;
      }
      case 'ripple': {
        if (o.kind !== 'sound') return;
        const a = Math.round((angleTurns(p.x, p.y, wx, wy) * 360) / 5) * 5;
        // pulled in onto the sound itself: reach 0, it stops retriggering
        const d = Math.hypot(wx - p.x, wy - p.y) * this.cam.zoom < this.soundRadius(o) + 4 ? 0 : Math.hypot(wx - p.x, wy - p.y);
        const reach = Math.min(RIPPLE_LIMITS.reach[1], Math.round((d / (o.size * p.scale)) * 2) / 2);
        this.commitCoalesced(key + ':a', { op: 'set', id: o.id, path: ['ripple', 'angle'], value: a % 360 });
        this.commitCoalesced(key + ':r', { op: 'set', id: o.id, path: ['ripple', 'reach'], value: reach });
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
    if (my > this.H - this.barH) return;
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
    if (this.axisMenu && inAxisMenu(this, mx, my)) return;
    if (inMinimap(this, mx, my)) {
      this.zoomAt(this.W / 2, (this.H - this.barH) / 2, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      return;
    }
    const mh = motionHitAt(this, mx, my);
    if (mh && (mh.action.kind === 'value' || mh.action.kind === 'axis')) {
      const o = this.patch.objects.find((q) => q.id === this.sel);
      if (o) {
        const dir = e.deltaY < 0 ? 1 : -1;
        if (mh.action.kind === 'axis') {
          const ed = toggleEdit(this, o, mh.action, -dir);
          if (ed) this.commit(ed);
        } else {
          const key = mh.action.key;
          this.commit(valueEdit(o, key, stepValue(o, key, readValue(o, key), dir, dir * 10)));
        }
      }
      return;
    }
    const sel = this.obj(this.sel);
    if (e.altKey && sel) {
      const f = e.deltaY < 0 ? 0.5 : 2;
      if (sel.motion?.pos && 'periodBeats' in sel.motion.pos) {
        const v = Math.min(MAX_PERIOD, Math.max(1, sel.motion.pos.periodBeats * f));
        this.commit({ op: 'set', id: sel.id, path: ['motion', 'pos', 'periodBeats'], value: v });
        this.toast(`motion period ${periodLabel(v)}`);
      } else if (sel.motion?.pos?.type === 'drift') {
        const v = Math.min(MAX_PERIOD, Math.max(1, sel.motion.pos.rateBeats * f));
        this.commit({ op: 'set', id: sel.id, path: ['motion', 'pos', 'rateBeats'], value: v });
        this.toast(`drift rate ${periodLabel(v)}`);
      } else if (sel.motion?.breathe) {
        const v = Math.min(MAX_PERIOD, Math.max(1, sel.motion.breathe.periodBeats * f));
        this.commit({ op: 'set', id: sel.id, path: ['motion', 'breathe', 'periodBeats'], value: v });
        this.toast(`breathe period ${periodLabel(v)}`);
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
    this.cam.zoom = Math.min(8, Math.max(MIN_ZOOM, this.cam.zoom * k));
    const [wx2, wy2] = this.s2w(mx, my);
    this.cam.x += wx - wx2;
    this.cam.y += wy - wy2;
  }

  get playing(): boolean {
    return this.headless || (this.audio.started && this.audio.running);
  }

  togglePlay(): void {
    if (!this.audio.started) void this.ensureAudio();
    else void this.audio.toggle();
  }

  /** The same patch with a different engine seed: the same parts, other chances. */
  rerollSeed(): void {
    this.commit({ op: 'seed', value: crypto.getRandomValues(new Uint32Array(1))[0] });
  }

  newPatch(): void {
    const p = this.patch;
    this.load({ ...emptyPatch(), tempo: p.tempo, key: p.key, seed: p.seed, objects: [classicStage()] }, 'new patch · scrub the timeline to go back');
  }

  /** The guide, at `page`, or where it was last left. */
  openDocs(page?: string): void {
    this.docs.open(page);
  }

  cancelRender(): void {
    this.render?.cancel();
    this.render = null;
    this.toast('render cancelled');
  }

  cancelVideo(): void {
    this.video?.cancel();
    this.video = null;
    this.toast('video cancelled');
  }

  /**
   * True when it's fine to replace the current patch. An edited patch needs a
   * second press within 3 s: before audio starts there is no history to branch
   * back to, and autosave would overwrite the stored patch within a second.
   */
  private confirmReplace(): boolean {
    if (isDisposable(this.patch) || performance.now() < this.confirmUntil) {
      this.confirmUntil = 0;
      return true;
    }
    this.confirmUntil = performance.now() + 3000;
    this.toast('this replaces your edited patch · press again to confirm');
    return false;
  }

  /** Load a bundled example and frame it, wherever the view had wandered. */
  loadExample(ex: (typeof EXAMPLES)[number]): void {
    if (!this.load(ex.patch, `loaded ${ex.label}`)) return;
    this.fitView();
    this.showInfo();
  }

  /** A new patch from a random seed; false if it's waiting for a second press to replace an edited one. */
  randomPatch(): boolean {
    if (!this.confirmReplace()) return false;
    this.loadSeed(crypto.getRandomValues(new Uint32Array(1))[0]);
    return true;
  }

  /** A new patch from typed seed text (see parseSeed); false as for randomPatch. */
  seedPatch(text: string): boolean {
    if (!this.confirmReplace()) return false;
    this.loadSeed(parseSeed(text));
    return true;
  }

  private loadSeed(seed: number): void {
    this.load(generatePatch(seed), 'seed ' + seed);
    this.fitView();
  }

  /** Centre the camera on the patch, zooming out if needed but never in past 1. */
  fitView(): void {
    // Fit to what plays: sounds and generators. FX and transformer washes (a
    // big reverb) and XY fields are background, used only if nothing else is there.
    const all = this.patch.objects;
    const plays = all.filter((o) => o.kind === 'sound' || fieldTypes[o.type]?.role === 'generator');
    const objs = plays.length ? plays : all.some((o) => !isMap(o)) ? all.filter((o) => !isMap(o)) : all;
    if (!objs.length) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const o of objs) {
      const hw = o.kind === 'sound' ? o.size / 2 : isCircle(o.shape) ? o.shape.r : o.shape.w / 2;
      const hh = o.kind === 'sound' ? o.size / 2 : isCircle(o.shape) ? o.shape.r : o.shape.h / 2;
      x0 = Math.min(x0, o.x - hw);
      x1 = Math.max(x1, o.x + hw);
      y0 = Math.min(y0, o.y - hh);
      y1 = Math.max(y1, o.y + hh);
    }
    const margin = 60;
    const z = Math.min(this.W / (x1 - x0 + 2 * margin), (this.H - this.barH) / (y1 - y0 + 2 * margin));
    const zoom = Math.min(1, Math.max(MIN_ZOOM, z));
    this.cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - this.barH / 2 / zoom, zoom };
  }

  async share(): Promise<void> {
    let r: { url: string; kind: 'seed' | 'patch' };
    try {
      r = await buildShare(this.patch);
    } catch (err) {
      this.toast("can't share: " + linkErrorMessage(err));
      return;
    }
    if (!(await copyText(r.url))) {
      history.replaceState(null, '', r.url);
      this.toast('could not copy · the link is in the address bar');
      return;
    }
    const n = r.url.length;
    let msg = 'link copied · ' + (r.kind === 'seed' ? 'seed link' : `${n < 1000 ? n : (n / 1000).toFixed(1) + 'k'} chars`);
    if (n > 2000) msg += ' · long, some chat apps may cut it';
    this.toast(msg);
  }

  savePatch(): void {
    // sign it with your remembered details, where it has no artist yet
    const info = this.patch.info;
    const signed = signInfo(info, readAuthor());
    if (signed !== info) this.commit({ op: 'info', value: signed! });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = infoFileName(this.patch.info) || `gener8-${stamp}`;
    download(new Blob([JSON.stringify(this.patch, null, 2)], { type: 'application/json' }), `${name}.json`);
    this.toast(signed !== info ? `patch saved · signed ${signed!.artist}` : 'patch saved');
  }

  openPatch(): void {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (f) this.loadFile(f);
    };
    inp.click();
  }

  private onKey(e: KeyboardEvent): void {
    // typing in a text box must not trigger shortcuts (c captures, t taps tempo…), nor keys meant for the bar's controls
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || this.bar?.owns(e.target)) return;
    if (e.key === 'Escape' && this.bar?.close()) return;
    if (this.docs.isOpen) {
      if (e.key === 'Escape') this.docs.escape();
      return;
    }
    // the card can lose focus to the click that opened it: keys still belong to it
    if (this.infoDialog.isOpen) {
      if (e.key === 'Escape' || e.key === 'Enter') this.infoDialog.close();
      return;
    }
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
        this.togglePlay();
      }
      this.spaceDown = true;
      return;
    }
    void this.ensureAudio();
    const sel = this.sel;
    switch (e.key) {
      case 'Escape':
        this.pinned = null;
        if (this.followPick) this.followPick = null;
        else if (this.axisMenu) this.axisMenu = null;
        else if (this.scrub) this.scrub.cancelled = true;
        else if (this.panel) this.panel = null;
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
      case 'g':
        this.openDocs();
        return;
      case 'n':
        this.showMinimap = !this.showMinimap;
        writeFlag(MINIMAP_KEY, this.showMinimap);
        return;
      case 'l':
        this.lit = !this.lit;
        writeFlag(LIT_KEY, this.lit);
        this.toast(this.lit ? 'lit: everything at full brightness' : 'reactive: lit by the cursor');
        return;
      case 't':
        this.tap();
        return;
      case 'r':
        this.randomPatch();
        return;
      case 'h':
      case '?':
        this.openDocs('overview');
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
      case 'C':
        e.preventDefault(); // keep the C out of the spec field this focuses
        this.bar?.open('render');
        return;
      case 'V':
        e.preventDefault();
        this.bar?.open('video');
        return;
      case 'i':
        e.preventDefault(); // keep the i out of the title field
        this.editInfo();
        return;
      case 'D':
      case 'T':
      case 'R':
      case 'X': {
        this.loadExample(EXAMPLES.find((x) => x.key === e.key)!);
        return;
      }
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        const o = this.obj(sel);
        if (!o) return;
        e.preventDefault();
        const p = this.poseOf(o);
        // no map sets this sound's pitch: ↑ ↓ change its own note instead of moving it
        if (o.kind === 'sound' && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !this.places.get(o.id)?.pitchSet) {
          const n = Math.min(MIDI_MAX, Math.max(MIDI_MIN, (o.note ?? 60) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1)));
          this.commit({ op: 'set', id: o.id, path: ['note'], value: n });
          this.toast(`note ${noteName(n)}`);
          return;
        }
        // a semitone (shift: an octave) along whichever axis carries pitch here, else 10 units
        const g = o.kind === 'sound' ? governingAxis(p.x, p.y, this.maps, 'pitch') : null;
        const semi = g ? Math.abs(g.half / ((g.a.max - g.a.min) / 2)) || 10 : 10;
        const step = Math.max(1, Math.round(semi * (e.shiftKey ? 12 : 1)));
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0;
        this.moveGroup(o.id, o.x + dx, o.y + dy, false);
        return;
      }
    }
  }
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea fallback */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** Distance in world units from (wx, wy) to a map field's outline. */
function mapEdgeDist(o: FieldObj, p: Pose, wx: number, wy: number): number {
  const dx = wx - p.x;
  const dy = wy - p.y;
  if (!isCircle(o.shape)) {
    const hw = (o.shape.w * p.scale) / 2;
    const hh = (o.shape.h * p.scale) / 2;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    return ax <= hw && ay <= hh ? Math.min(hw - ax, hh - ay) : Math.hypot(Math.max(ax - hw, 0), Math.max(ay - hh, 0));
  }
  const R = o.shape.r * p.scale;
  if (fieldTypes[o.type]?.shape !== 'triangle') return Math.abs(Math.hypot(dx, dy) - R);
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = triCorner(i, R);
    const [bx, by] = triCorner((i + 1) % 3, R);
    const ex = bx - ax;
    const ey = by - ay;
    const t = Math.min(1, Math.max(0, ((dx - ax) * ex + (dy - ay) * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(dx - ax - t * ex, dy - ay - t * ey));
  }
  return best;
}

/** How far a ripple's visuals travel. */
export function visReach(r: RippleVis): number {
  if (r.lens) return Math.max(0, ...r.lens);
  return r.stopR ?? r.maxR;
}

export { fmtTime };

export const CAPTURE_SAMPLES = CAPTURE_SECONDS * SR;
