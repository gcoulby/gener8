// The engine: one deterministic simulation + DSP graph, stepped in fixed 128-sample
// blocks. Runs unchanged in the AudioWorklet and in Node. See DESIGN.md §1.

import type {
  Edit,
  EventRecord,
  FieldContext,
  FieldObj,
  FieldType,
  FxProcessor,
  GenMember,
  LoggedEdit,
  ModFrame,
  NoteEvent,
  ParamSpec,
  Patch,
  SoundObj,
  SoundType,
  Voice,
} from './types.ts';
import {
  BLOCK,
  MAX_CHAIN,
  MAX_RIPPLES,
  PPQ,
  REFRACTORY_BEATS,
  RIPPLE_SPEED,
  SR,
  UNITY_SIZE,
  VOICE_BUDGET,
} from './constants.ts';
import { applyEdit, byLayer, clone, normalizePatch } from './patch.ts';
import { pose, type Pose } from './motion.ts';
import { soundTypes } from './sounds/registry.ts';
import { fieldTypes } from './fields/registry.ts';
import { hash32, rand, strHash } from './rand.ts';
import { angleTurns, depthAt, shapeDims } from './geometry.ts';
import { indexToMidi, nearestIndex, scaleSteps, snapToScale } from './music.ts';
import { cosTurns, dbToGain, exp2, log2, sinTurns, tanh } from './dspmath.ts';
import { newPlacement, placeSound, rippleOf, traceTurns, type MapPose, type Placement } from './placement.ts';

const MASTER_GAIN = 0.9;
const NO_SOUNDED: { e: NoteEvent; off: number }[] = [];

class FieldCtx implements FieldContext {
  seed = 0;
  idHash: number;
  handles: Record<string, number> = {};
  tempo = 120;
  ppq = PPQ;
  sr = SR;
  w = 0;
  h = 0;
  baseW = 0;
  baseH = 0;
  keyRoot = 0;
  steps: number[] = [];
  state: any = null;
  constructor(idHash: number) {
    this.idHash = idHash;
  }
  rand(stream: number, index: number): number {
    return rand(this.seed, this.idHash, stream, index);
  }
}

interface Membership {
  f: FieldRT;
  depth: number;
}

interface FieldRT {
  id: string;
  obj: FieldObj;
  type: FieldType;
  ctx: FieldCtx;
  pose: Pose;
  members: GenMember[];
  proc: FxProcessor | null;
  busL: Float64Array | null;
  busR: Float64Array | null;
  ret: number;
  peak: number;
}

interface SoundRT {
  id: string;
  hash: number;
  obj: SoundObj;
  type: SoundType;
  params: Record<string, number>;
  voices: Voice[];
  offAt: Float64Array;
  started: Float64Array;
  used: Uint8Array;
  pose: Pose;
  order: number;
  rootIndex: number;
  genCount: number;
  trans: Membership[];
  inserts: Membership[];
  buses: Membership[];
  insertProcs: Map<string, FxProcessor[]>;
  sendPrev: Map<string, number>;
  gL: number;
  gR: number;
  peak: number;
  lastRipple: number;
  buf: Float64Array;
  bufR: Float64Array | null;
  mod: ModFrame;
  events: NoteEvent[];
  place: Placement;
  /** Params an XY field set last block, restored before placement runs again. */
  xyKeys: string[];
}

interface Ripple {
  x: number;
  y: number;
  tick0: number;
  maxR: number;
  vel: number;
  chain: number;
  emitter: string;
  hit: Set<string>;
  /** Traces as unit vectors [x0, y0, x1, y1, …]; null for a ring. */
  dirs: Float64Array | null;
  /** Per trace (or [0] for a ring): still travelling. Only kept when stop is on. */
  alive: Uint8Array | null;
}

const MIN_TRACE_WIDTH = 8;

interface Action {
  off: number;
  kind: number; // 0 noteOff, 1 noteOn, 2 accent
  v: number;
  pitch: number;
  vel: number;
}

export interface Visual {
  id: string;
  data: unknown;
}

export class Engine {
  patch: Patch;
  /** Absolute sample at the start of the next block. */
  sample = 0;
  /** Musical position at the start of the next block. */
  tick = 0;
  recordEvents = true;

  private sounds = new Map<string, SoundRT>();
  private fields = new Map<string, FieldRT>();
  private soundList: SoundRT[] = [];
  private fieldList: FieldRT[] = [];
  private maps: MapPose[] = [];
  private ripples: Ripple[] = [];
  private future: NoteEvent[] = [];
  private fresh: NoteEvent[] = [];
  private ready: NoteEvent[] = [];
  private actions: Action[] = [];
  private queue: Edit[] = [];
  private scheduled: LoggedEdit[] = [];
  private schedIdx = 0;
  private dirty = true;
  private serial = 0;
  private activeVoices = 0;
  private curGen = '';
  private curT0 = 0;
  private steps: number[] = [];
  private outL = new Float64Array(BLOCK);
  private outR = new Float64Array(BLOCK);
  private carry = BLOCK;
  private log: LoggedEdit[] = [];
  private records: EventRecord[] = [];
  private anySolo = false;
  private master = MASTER_GAIN;
  private masterPeak = 0;

  constructor(patch: Patch) {
    this.patch = normalizePatch(patch);
  }

  // ---------- host API ----------

  /** Queue an edit; it takes effect at the next block boundary and is logged with that sample. */
  edit(e: Edit): void {
    this.queue.push(e);
  }

  /** Pre-stamped edits (from a log) to replay at their exact samples. */
  schedule(edits: LoggedEdit[]): void {
    this.scheduled = edits.slice().sort((a, b) => a.sample - b.sample);
    this.schedIdx = 0;
  }

  drainLog(): LoggedEdit[] {
    const l = this.log;
    this.log = [];
    return l;
  }

  drainRecords(): EventRecord[] {
    const r = this.records;
    this.records = [];
    return r;
  }

  visuals(): Visual[] {
    const out: Visual[] = [];
    for (const f of this.fieldList) {
      if (f.type.role === 'generator' && f.type.visual) {
        const data = f.type.visual(f.ctx);
        if (data) out.push({ id: f.id, data });
      }
    }
    return out;
  }

  /** Peak levels since the last call, per sound / FX bus id, plus 'master'. */
  meters(): Record<string, number> {
    const m: Record<string, number> = { master: this.masterPeak };
    this.masterPeak = 0;
    for (const s of this.soundList) {
      m[s.id] = s.peak;
      s.peak = 0;
    }
    for (const f of this.fieldList) {
      if (!f.busL) continue;
      m[f.id] = f.peak;
      f.peak = 0;
    }
    return m;
  }

  get activeVoiceCount(): number {
    return this.activeVoices;
  }

  /** Render `frames` samples into left/right starting at `offset`. Chunk size never affects output. */
  process(left: Float32Array, right: Float32Array, frames: number, offset = 0): void {
    let i = 0;
    while (i < frames) {
      if (this.carry >= BLOCK) {
        this.block();
        this.carry = 0;
      }
      const n = Math.min(BLOCK - this.carry, frames - i);
      const c = this.carry;
      for (let k = 0; k < n; k++) {
        left[offset + i + k] = this.outL[c + k];
        right[offset + i + k] = this.outR[c + k];
      }
      i += n;
      this.carry += n;
    }
  }

  // ---------- edits and runtime reconciliation ----------

  private apply(e: Edit, s0: number): void {
    this.patch = applyEdit(this.patch, e);
    this.log.push({ sample: s0, edit: clone(e) });
    this.dirty = true;
  }

  private sync(): void {
    this.dirty = false;
    const objs = this.patch.objects.slice().sort(byLayer);
    const seenS = new Set<string>();
    const seenF = new Set<string>();
    const sl: SoundRT[] = [];
    const fl: FieldRT[] = [];
    for (const o of objs) {
      if (o.kind === 'sound') {
        const t = soundTypes[o.type];
        if (!t) continue;
        let rt = this.sounds.get(o.id);
        if (!rt || rt.type !== t) {
          rt = this.makeSound(o, t);
          this.sounds.set(o.id, rt);
        }
        rt.obj = o;
        for (const p of t.params) rt.params[p.key] = typeof o.params?.[p.key] === 'number' ? o.params[p.key] : p.default;
        rt.order = sl.length;
        sl.push(rt);
        seenS.add(o.id);
      } else if (o.kind === 'field') {
        const t = fieldTypes[o.type];
        if (!t) continue;
        let rt = this.fields.get(o.id);
        const fresh = !rt || rt.type !== t;
        if (fresh) {
          rt = {
            id: o.id,
            obj: o,
            type: t,
            ctx: new FieldCtx(strHash(o.id)),
            pose: { x: o.x, y: o.y, scale: 1 },
            members: [],
            proc: null,
            busL: null,
            busR: null,
            ret: 1,
            peak: 0,
          };
          this.fields.set(o.id, rt);
        }
        rt = rt!;
        rt.obj = o;
        const h = rt.ctx.handles;
        for (const k in h) delete h[k];
        for (const s of t.handles) h[s.key] = typeof o.handles?.[s.key] === 'number' ? o.handles[s.key] : s.default;
        const base = shapeDims(o.shape, 1);
        rt.ctx.baseW = base.w;
        rt.ctx.baseH = base.h;
        rt.ctx.w = base.w;
        rt.ctx.h = base.h;
        rt.ctx.seed = this.patch.seed;
        rt.ctx.tempo = this.patch.tempo;
        if (fresh) {
          rt.ctx.state = t.createState ? t.createState(rt.ctx) : null;
          if (t.role === 'fx') {
            if (t.kind === 'bus') {
              rt.proc = t.createProcessor(rt.ctx);
              rt.busL = new Float64Array(BLOCK);
              rt.busR = new Float64Array(BLOCK);
            }
          }
        }
        fl.push(rt);
        seenF.add(o.id);
      }
    }
    for (const id of this.sounds.keys()) if (!seenS.has(id)) this.sounds.delete(id);
    for (const id of this.fields.keys()) if (!seenF.has(id)) this.fields.delete(id);
    for (const s of sl) {
      for (const id of s.insertProcs.keys()) if (!seenF.has(id)) s.insertProcs.delete(id);
      for (const id of s.sendPrev.keys()) if (!seenF.has(id)) s.sendPrev.delete(id);
    }
    this.soundList = sl;
    this.fieldList = fl;
    this.maps = [];
    for (const f of fl) if (f.type.role === 'map') this.maps.push({ obj: f.obj, pose: f.pose, type: f.type });
  }

  private makeSound(o: SoundObj, t: SoundType): SoundRT {
    const params: Record<string, number> = {};
    const hash = strHash(o.id);
    const n = t.mode === 'sustained' ? 1 : Math.max(1, t.maxVoices);
    const voices: Voice[] = [];
    for (let i = 0; i < n; i++) {
      const vh = hash32(hash ^ (i + 1));
      voices.push(t.createVoice({ params, rand: (stream, index) => rand(this.patch.seed, vh, stream, index) }));
    }
    return {
      id: o.id,
      hash,
      obj: o,
      type: t,
      params,
      voices,
      offAt: new Float64Array(n).fill(-1),
      started: new Float64Array(n),
      used: new Uint8Array(n),
      pose: { x: o.x, y: o.y, scale: 1 },
      order: 0,
      rootIndex: 0,
      genCount: 0,
      trans: [],
      inserts: [],
      buses: [],
      insertProcs: new Map(),
      sendPrev: new Map(),
      gL: 0,
      gR: 0,
      peak: 0,
      lastRipple: -Infinity,
      buf: new Float64Array(BLOCK),
      bufR: t.stereo ? new Float64Array(BLOCK) : null,
      mod: { pitch: 60, chord: [0, 0, 0, 0] },
      events: [],
      place: newPlacement(),
      xyKeys: [],
    };
  }

  // ---------- the block ----------

  private block(): void {
    const s0 = this.sample;

    while (this.schedIdx < this.scheduled.length && this.scheduled[this.schedIdx].sample <= s0) {
      this.apply(this.scheduled[this.schedIdx++].edit, s0);
    }
    if (this.queue.length) {
      for (const e of this.queue) this.apply(e, s0);
      this.queue.length = 0;
    }
    if (this.dirty) this.sync();
    let active = 0;
    for (const s of this.soundList) if (s.type.mode === 'event') active += countActive(s.voices);
    this.activeVoices = active;

    const patch = this.patch;
    const seed = patch.seed;
    const tps = (patch.tempo * PPQ) / (60 * SR);
    const t0 = this.tick;
    const t1 = t0 + BLOCK * tps;
    const beat = t0 / PPQ;
    const keyRoot = patch.key.root;
    this.steps = scaleSteps(patch.key.scale);
    this.curT0 = t0;

    // 1. Motion
    for (const f of this.fieldList) {
      pose(f.obj, beat, seed, f.pose);
      const d = shapeDims(f.obj.shape, f.pose.scale);
      f.ctx.w = d.w;
      f.ctx.h = d.h;
      f.ctx.seed = seed;
      f.ctx.tempo = patch.tempo;
      f.ctx.keyRoot = keyRoot;
      f.ctx.steps = this.steps;
      f.members.length = 0;
    }
    for (const s of this.soundList) {
      pose(s.obj, beat, seed, s.pose);
      placeSound(s.pose.x, s.pose.y, this.maps, s.obj.ripple, s.place);
      if (s.xyKeys.length || s.place.pk.length) this.applyXYParams(s);
      s.rootIndex = nearestIndex(s.place.pitch, keyRoot, this.steps);
      s.events.length = 0;
    }

    // 2. Membership, in layer order
    for (const s of this.soundList) {
      s.genCount = 0;
      s.trans.length = 0;
      s.inserts.length = 0;
      s.buses.length = 0;
      const px = s.pose.x;
      const py = s.pose.y;
      for (const f of this.fieldList) {
        const t = f.type;
        if (t.role === 'map') continue;
        const fp = f.pose;
        const depth = depthAt(f.obj.shape, fp.x, fp.y, fp.scale, px, py);
        if (depth <= 0) continue;
        if (t.role === 'generator') {
          s.genCount++;
          f.members.push({
            soundId: s.id,
            soundHash: s.hash,
            depth,
            angle: angleTurns(fp.x, fp.y, px, py),
            lx: px - fp.x,
            ly: py - fp.y,
            mode: s.type.mode,
          });
        } else if (t.role === 'transformer') {
          s.trans.push({ f, depth });
        } else if (t.kind === 'insert') {
          s.inserts.push({ f, depth });
        } else {
          s.buses.push({ f, depth });
        }
      }
      // Sustained pitch through pitch-aware transformers
      if (s.type.mode === 'sustained') {
        // Sustained voices sit on the scale too; moving them glides between notes.
        let p = snapToScale(s.place.pitch, keyRoot, this.steps);
        for (const m of s.trans) {
          const t = m.f.type;
          if (t.role === 'transformer' && t.transformPitch) p = t.transformPitch(p, m.depth, m.f.ctx);
        }
        const idx = nearestIndex(p, keyRoot, this.steps);
        const base = indexToMidi(idx, keyRoot, this.steps);
        s.mod.pitch = p;
        s.mod.chord[0] = 0;
        s.mod.chord[1] = snapToScale(base + 7, keyRoot, this.steps) - base;
        s.mod.chord[2] = snapToScale(base + 14, keyRoot, this.steps) - base;
        s.mod.chord[3] = snapToScale(base + 15.5, keyRoot, this.steps) - base;
      }
    }

    // 3. Generators
    const fresh = this.fresh;
    fresh.length = 0;
    for (const f of this.fieldList) {
      const t = f.type;
      if (t.role !== 'generator') continue;
      this.curGen = f.id;
      t.schedule(f.ctx, t0, t1, f.members, this.emit);
    }

    // 4. Ripple arrivals
    this.rippleArrivals(t0, t1);

    // 5. Transformers. Anything landing beyond this block waits in `future`.
    const ready = this.ready;
    ready.length = 0;
    if (this.future.length) {
      const keep: NoteEvent[] = [];
      for (const e of this.future) (e.tick < t1 ? ready : keep).push(e);
      this.future = keep;
    }
    for (const e of fresh) {
      const s = this.sounds.get(e.soundId);
      if (!s) continue;
      this.transformChain(e, s, t1);
    }
    for (const e of ready) {
      const s = this.sounds.get(e.soundId);
      if (s) s.events.push(e);
    }

    // 6. Voices, inserts, pan, sends
    const outL = this.outL;
    const outR = this.outR;
    outL.fill(0);
    outR.fill(0);
    for (const f of this.fieldList) {
      if (f.busL) {
        f.busL.fill(0);
        f.busR!.fill(0);
      }
    }
    this.anySolo = false;
    for (const s of this.soundList) if (s.obj.solo) this.anySolo = true;
    for (const s of this.soundList) this.renderSound(s, s0, t0, tps);

    // 7. Buses, with their mixer return level (ramped)
    for (const f of this.fieldList) {
      if (f.proc && f.proc.stereo && f.busL && f.busR) {
        f.proc.stereo(f.busL, f.busR, BLOCK);
        const target = f.obj.trim ? dbToGain(f.obj.trim) : 1;
        const d = (target - f.ret) / BLOCK;
        let g = f.ret;
        let pk = f.peak;
        for (let i = 0; i < BLOCK; i++) {
          g += d;
          const l = f.busL[i] * g;
          const r = f.busR[i] * g;
          outL[i] += l;
          outR[i] += r;
          const al = l < 0 ? -l : l;
          const ar = r < 0 ? -r : r;
          if (al > pk) pk = al;
          if (ar > pk) pk = ar;
        }
        f.ret = target;
        f.peak = pk;
      }
    }

    // 8. Master level (ramped), then a gentle soft clip above 0.6
    const mTarget = patch.master ? MASTER_GAIN * dbToGain(patch.master) : MASTER_GAIN;
    const md = (mTarget - this.master) / BLOCK;
    let mg = this.master;
    let mpk = this.masterPeak;
    for (let i = 0; i < BLOCK; i++) {
      mg += md;
      const l = soft(outL[i] * mg);
      const r = soft(outR[i] * mg);
      outL[i] = l;
      outR[i] = r;
      const al = l < 0 ? -l : l;
      const ar = r < 0 ? -r : r;
      if (al > mpk) mpk = al;
      if (ar > mpk) mpk = ar;
    }
    this.master = mTarget;
    this.masterPeak = mpk;

    this.sample = s0 + BLOCK;
    this.tick = t1;
  }

  private emit = (soundId: string, tick: number, degree: number, velocity: number, durTicks: number): void => {
    const s = this.sounds.get(soundId);
    if (!s) return;
    const pitch =
      s.type.mode === 'event' ? indexToMidi(s.rootIndex + degree, this.patch.key.root, this.steps) : s.mod.pitch;
    this.fresh.push({
      tick: tick < this.curT0 ? this.curT0 : tick,
      soundId,
      pitch,
      velocity,
      durTicks,
      sourceKind: 'generator',
      sourceId: this.curGen,
      chain: 0,
      serial: this.serial++,
    });
  };

  private transformChain(e: NoteEvent, s: SoundRT, t1: number): void {
    let cur: NoteEvent[] = [e];
    for (const m of s.trans) {
      const t = m.f.type;
      if (t.role !== 'transformer') continue;
      const next: NoteEvent[] = [];
      for (const ev of cur) t.transform(ev, m.depth, m.f.ctx, (o) => next.push(o));
      cur = next;
      if (!cur.length) return;
    }
    for (const ev of cur) (ev.tick < t1 ? this.ready : this.future).push(ev);
  }

  private rippleArrivals(t0: number, t1: number): void {
    const rs = this.ripples;
    if (!rs.length) return;
    const refractory = REFRACTORY_BEATS * PPQ;
    const keep: Ripple[] = [];
    for (const r of rs) {
      const rNow = ((t0 - r.tick0) / PPQ) * RIPPLE_SPEED;
      if (rNow > r.maxR) continue;
      if (r.alive && !r.alive.includes(1)) continue;
      keep.push(r);
      const rEnd = ((t1 - r.tick0) / PPQ) * RIPPLE_SPEED;
      if (r.dirs) this.traceArrivals(r, rEnd, t0, refractory);
      else if (r.alive) this.ringStop(r, rEnd, t0, refractory);
      else {
        for (const s of this.soundList) {
          if (!this.listens(r, s)) continue;
          const dx = s.pose.x - r.x;
          const dy = s.pose.y - r.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > rEnd) continue;
          r.hit.add(s.id);
          if (d > r.maxR) continue;
          this.rippleHit(r, s, d, t0, refractory);
        }
      }
    }
    this.ripples = keep;
  }

  private listens(r: Ripple, s: SoundRT): boolean {
    if (s.id === r.emitter || r.hit.has(s.id)) return false;
    return !(s.type.mode === 'event' && s.genCount > 0); // driven sounds don't listen
  }

  /** A ring with stop on: only the nearest listener it has reached answers, then it's gone. */
  private ringStop(r: Ripple, rEnd: number, t0: number, refractory: number): void {
    let best: SoundRT | null = null;
    let bestD = Infinity;
    for (const s of this.soundList) {
      if (!this.listens(r, s)) continue;
      const dx = s.pose.x - r.x;
      const dy = s.pose.y - r.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > rEnd || d > r.maxR) continue;
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (!best) return;
    r.hit.add(best.id);
    r.alive![0] = 0;
    this.rippleHit(r, best, bestD, t0, refractory);
  }

  /** Traces travel out along their direction and hit listeners whose body they pass through. */
  private traceArrivals(r: Ripple, rEnd: number, t0: number, refractory: number): void {
    const dirs = r.dirs!;
    const n = dirs.length / 2;
    for (let i = 0; i < n; i++) {
      if (r.alive && !r.alive[i]) continue;
      const ux = dirs[i * 2];
      const uy = dirs[i * 2 + 1];
      let best: SoundRT | null = null;
      let bestD = Infinity;
      for (const s of this.soundList) {
        if (!this.listens(r, s)) continue;
        const dx = s.pose.x - r.x;
        const dy = s.pose.y - r.y;
        const along = dx * ux + dy * uy;
        if (along <= 0 || along > rEnd || along > r.maxR) continue;
        const perp = dx * uy - dy * ux;
        const w = (s.obj.size * s.pose.scale) / 2;
        if ((perp < 0 ? -perp : perp) > (w > MIN_TRACE_WIDTH ? w : MIN_TRACE_WIDTH)) continue;
        if (!r.alive) {
          r.hit.add(s.id);
          this.rippleHit(r, s, along, t0, refractory);
        } else if (along < bestD) {
          best = s;
          bestD = along;
        }
      }
      if (best) {
        r.hit.add(best.id);
        r.alive![i] = 0;
        this.rippleHit(r, best, bestD, t0, refractory);
      }
    }
  }

  /** A ripple or trace reached sound s at distance d. */
  private rippleHit(r: Ripple, s: SoundRT, d: number, t0: number, refractory: number): void {
    let tick = r.tick0 + (d / RIPPLE_SPEED) * PPQ;
    if (tick < t0) tick = t0;
    if (tick - s.lastRipple < refractory) return;
    const vel = r.vel * (1 - d / r.maxR) * 0.9;
    if (vel < 0.05) return;
    s.lastRipple = tick;
    this.fresh.push({
      tick,
      soundId: s.id,
      pitch: s.type.mode === 'event' ? indexToMidi(s.rootIndex, this.patch.key.root, this.steps) : s.mod.pitch,
      velocity: vel,
      durTicks: PPQ / 8,
      sourceKind: 'ripple',
      sourceId: r.emitter,
      chain: r.chain + 1,
      serial: this.serial++,
    });
  }

  /** XY param: axes: restore last block's, then set this block's. */
  private applyXYParams(s: SoundRT): void {
    const specs = s.type.params;
    for (const k of s.xyKeys) {
      const spec = specs.find((p) => p.key === k);
      if (spec) s.params[k] = typeof s.obj.params?.[k] === 'number' ? s.obj.params[k] : spec.default;
    }
    s.xyKeys.length = 0;
    const pl = s.place;
    for (let i = 0; i < pl.pk.length; i++) {
      const spec = specs.find((p) => p.key === pl.pk[i]);
      if (!spec) continue;
      s.params[spec.key] = denorm(spec, pl.pv[i]);
      s.xyKeys.push(spec.key);
    }
  }

  private allocate(s: SoundRT): number {
    const vs = s.voices;
    if (this.activeVoices < VOICE_BUDGET) {
      for (let i = 0; i < vs.length; i++) {
        if (!vs[i].active && !s.used[i]) {
          this.activeVoices++;
          return i;
        }
      }
    }
    let best = -1;
    for (let i = 0; i < vs.length; i++) {
      if (!vs[i].active && !s.used[i]) continue;
      if (best < 0 || s.started[i] < s.started[best]) best = i;
    }
    return best;
  }

  private renderSound(s: SoundRT, s0: number, t0: number, tps: number): void {
    const buf = s.buf;
    buf.fill(0);
    const bufR = s.bufR ?? buf;
    if (s.bufR) s.bufR.fill(0);
    const actions = this.actions;
    actions.length = 0;
    const isEvent = s.type.mode === 'event';
    const sounded = s.events.length ? ([] as { e: NoteEvent; off: number }[]) : NO_SOUNDED;

    if (s.events.length) {
      s.events.sort((a, b) => a.tick - b.tick || a.serial - b.serial);
      for (const e of s.events) {
        let off = Math.floor((e.tick - t0) / tps);
        off = off < 0 ? 0 : off >= BLOCK ? BLOCK - 1 : off;
        if (isEvent) {
          const v = this.allocate(s);
          if (v < 0) continue;
          s.used[v] = 1;
          s.started[v] = s0 + off;
          s.offAt[v] = s0 + off + Math.max(1, Math.round(e.durTicks / tps));
          actions.push({ off, kind: 1, v, pitch: e.pitch, vel: e.velocity });
        } else {
          actions.push({ off, kind: 2, v: 0, pitch: e.pitch, vel: e.velocity });
        }
        sounded.push({ e, off });
      }
    }
    if (isEvent) {
      for (let i = 0; i < s.voices.length; i++) {
        const at = s.offAt[i];
        if (at >= s0 && at < s0 + BLOCK) {
          actions.push({ off: at - s0, kind: 0, v: i, pitch: 0, vel: 0 });
          s.offAt[i] = -1;
        }
      }
    }

    if (actions.length) actions.sort((a, b) => a.off - b.off || a.kind - b.kind);
    let cur = 0;
    for (const a of actions) {
      if (a.off > cur) {
        this.renderVoices(s, cur, a.off);
        cur = a.off;
      }
      const v = s.voices[a.v];
      if (a.kind === 1) v.noteOn(a.pitch, a.vel);
      else if (a.kind === 0) v.noteOff();
      else v.accent?.(a.vel);
    }
    this.renderVoices(s, cur, BLOCK);
    if (isEvent) s.used.fill(0);

    // Inserts (series, layer order)
    for (const m of s.inserts) {
      let p = s.insertProcs.get(m.f.id);
      if (!p) {
        const t = m.f.type;
        if (t.role !== 'fx') continue;
        p = s.bufR ? [t.createProcessor(m.f.ctx), t.createProcessor(m.f.ctx)] : [t.createProcessor(m.f.ctx)];
        s.insertProcs.set(m.f.id, p);
      }
      p[0].mono?.(buf, BLOCK, m.depth);
      if (s.bufR) p[1].mono?.(s.bufR, BLOCK, m.depth);
    }
    if (s.insertProcs.size > s.inserts.length) {
      for (const id of s.insertProcs.keys()) if (!s.inserts.some((m) => m.f.id === id)) s.insertProcs.delete(id);
    }

    // Gain and equal-power pan, ramped across the block
    const o = s.obj;
    const silenced = o.mute || (this.anySolo && !o.solo);
    let gain = silenced ? 0 : ((o.size * s.pose.scale) / UNITY_SIZE) * (o.trim ? dbToGain(o.trim) : 1);
    if (s.place.level) gain *= dbToGain(s.place.level);
    let p = s.place.pan;
    p = p < -1 ? -1 : p > 1 ? 1 : p;
    const gL = gain * cosTurns((p + 1) / 8);
    const gR = gain * sinTurns((p + 1) / 8);
    const dL = (gL - s.gL) / BLOCK;
    const dR = (gR - s.gR) / BLOCK;
    const outL = this.outL;
    const outR = this.outR;
    let l = s.gL;
    let r = s.gR;
    let pk = s.peak;
    for (let i = 0; i < BLOCK; i++) {
      l += dL;
      r += dR;
      const a = buf[i] * l;
      const b = bufR[i] * r;
      outL[i] += a;
      outR[i] += b;
      const aa = a < 0 ? -a : a;
      const ab = b < 0 ? -b : b;
      if (aa > pk) pk = aa;
      if (ab > pk) pk = ab;
    }
    s.peak = pk;

    // Sends (parallel, send level = depth, ramped)
    for (const m of s.buses) {
      const f = m.f;
      if (!f.busL || !f.busR) continue;
      const prev = s.sendPrev.get(f.id) ?? 0;
      const ds = (m.depth - prev) / BLOCK;
      let sv = prev;
      let ll = s.gL;
      let rr = s.gR;
      for (let i = 0; i < BLOCK; i++) {
        sv += ds;
        ll += dL;
        rr += dR;
        f.busL[i] += buf[i] * ll * sv;
        f.busR[i] += bufR[i] * rr * sv;
      }
      s.sendPrev.set(f.id, m.depth);
    }
    if (s.sendPrev.size > s.buses.length) {
      for (const [id, prev] of s.sendPrev) {
        if (s.buses.some((m) => m.f.id === id)) continue;
        // Ramp out of a zone we just left instead of cutting the send.
        const f = this.fields.get(id);
        if (f && f.busL && f.busR && prev > 0) {
          const ds = -prev / BLOCK;
          let sv = prev;
          let ll = s.gL;
          let rr = s.gR;
          for (let i = 0; i < BLOCK; i++) {
            sv += ds;
            ll += dL;
            rr += dR;
            f.busL[i] += buf[i] * ll * sv;
            f.busR[i] += bufR[i] * rr * sv;
          }
        }
        s.sendPrev.delete(id);
      }
    }
    s.gL = gL;
    s.gR = gR;

    // Telemetry and ripples
    const rip = sounded.length ? rippleOf(s.obj.ripple) : null;
    const turns = rip ? traceTurns(rip.mode, s.place.angle, rip.count, s.place.spread) : null;
    for (const { e, off } of sounded) {
      const emits = isEvent && e.chain < MAX_CHAIN && s.place.reach > 0;
      const reach = emits ? s.place.reach * s.obj.size * s.pose.scale : 0;
      if (emits) {
        let dirs: Float64Array | null = null;
        if (turns) {
          dirs = new Float64Array(turns.length * 2);
          for (let i = 0; i < turns.length; i++) {
            dirs[i * 2] = sinTurns(turns[i]);
            dirs[i * 2 + 1] = cosTurns(turns[i]);
          }
        }
        this.ripples.push({
          x: s.pose.x,
          y: s.pose.y,
          tick0: e.tick,
          maxR: reach,
          vel: e.velocity,
          chain: e.chain,
          emitter: s.id,
          hit: new Set(),
          dirs,
          alive: rip!.stop ? new Uint8Array(turns ? turns.length : 1).fill(1) : null,
        });
        if (this.ripples.length > MAX_RIPPLES) this.ripples.shift();
      }
      if (this.recordEvents) {
        this.records.push({
          sample: s0 + off,
          tick: e.tick,
          soundId: s.id,
          sourceId: e.sourceId,
          sourceKind: e.sourceKind,
          velocity: e.velocity,
          pitch: e.pitch,
          chain: e.chain,
          x: s.pose.x,
          y: s.pose.y,
          rippleR: reach,
          ...(emits && turns ? { rippleDirs: turns } : null),
          ...(emits && rip!.stop ? { rippleStop: true } : null),
          accent: !isEvent,
        });
      }
    }
  }

  private renderVoices(s: SoundRT, start: number, end: number): void {
    if (end <= start) return;
    const r = s.bufR ?? undefined;
    for (const v of s.voices) if (v.active) v.render(s.buf, start, end, s.mod, r);
  }
}

function denorm(spec: ParamSpec, u: number): number {
  if (spec.curve === 'exp' && spec.min > 0) return spec.min * exp2(u * log2(spec.max / spec.min));
  return spec.min + u * (spec.max - spec.min);
}

function countActive(vs: Voice[]): number {
  let n = 0;
  for (const v of vs) if (v.active) n++;
  return n;
}

function soft(x: number): number {
  if (x > 0.6) return 0.6 + 0.4 * tanh((x - 0.6) / 0.4);
  if (x < -0.6) return -0.6 - 0.4 * tanh((-x - 0.6) / 0.4);
  return x;
}
