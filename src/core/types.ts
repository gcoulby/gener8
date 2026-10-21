// Patch format, edits, events and registry interfaces. See DESIGN.md §7, §9.

export type Vec2 = [number, number];

export type PosMotion =
  | { type: 'orbit'; radius: number; periodBeats: number; phase: number }
  | { type: 'path'; points: Vec2[]; periodBeats: number; mode: 'loop' | 'pingpong' }
  | { type: 'drift'; amplitude: number; rateBeats: number }
  /** Drops from `height` and bounces `bounces` times, each lower, to its home spot; then the same in reverse back up. One cycle every periodBeats. */
  | { type: 'bounce'; height: number; bounces: number; periodBeats: number };

export interface Breathe {
  amount: number;
  periodBeats: number;
}

export interface Motion {
  pos?: PosMotion;
  breathe?: Breathe;
}

/** Shared by sounds and fields. */
interface Placed {
  /**
   * Id of an object to ride along with: its motion offset is added to this
   * object's position and its breathing multiplies this object's scale. A
   * leader with motion moves the whole group. Chains are followed a few deep.
   */
  follow?: string;
}

/**
 * How a sound retriggers others. Every key is optional; missing keys take the
 * defaults in xy.ts (a ring reaching 6 × size, no stop).
 */
export interface RippleSpec {
  /** ring: an expanding circle · point: one trace at `angle` · multi: `count` traces fanned over `spread`. */
  mode?: 'ripple' | 'point' | 'multi';
  /** Degrees clockwise from straight up. */
  angle?: number;
  count?: number;
  /** Degrees; 360 spaces the traces evenly all the way round. */
  spread?: number;
  /** How far it travels, as a multiple of the sound's size. 0 never retriggers. */
  reach?: number;
  /**
   * How much strength it loses on the way, 0..1. 1 fades linearly to nothing at
   * the reach; 0 hits as hard at the reach as next door.
   */
  falloff?: number;
  /** The ring or each trace ends at the first listener it reaches. */
  stop?: boolean;
}

export interface SoundObj extends Placed {
  id: string;
  kind: 'sound';
  type: string;
  x: number;
  y: number;
  size: number;
  layer: number;
  params: Record<string, number>;
  motion?: Motion;
  /** MIDI note it plays where no map field sets pitch (default 60, middle C). */
  note?: number;
  ripple?: RippleSpec;
  /** Mixer: level trim in dB (default 0), mute, solo. */
  trim?: number;
  mute?: boolean;
  solo?: boolean;
}

export type FieldShape = { r: number } | { w: number; h: number };

/**
 * One axis of a map field: the value at its low end (min) and high end (max),
 * e.g. the left and right edges of an XY field. `to` is a built-in target
 * (placement.ts XY_TARGETS) or `param:<key>` for a sound parameter,
 * normalised 0..1 over its range.
 */
export interface Axis {
  to: string;
  min: number;
  max: number;
}

/** Keyed by the map type's axis keys (xy: x, y · radial: r · sweep: t · tri: a, b, c). */
export type Axes = Partial<Record<string, Axis>>;

export interface FieldObj extends Placed {
  id: string;
  kind: 'field';
  type: string;
  x: number;
  y: number;
  shape: FieldShape;
  layer: number;
  handles: Record<string, number>;
  motion?: Motion;
  /** Map fields only: what position inside the field controls. */
  axes?: Axes;
  /** Mixer: FX bus return level in dB (default 0). */
  trim?: number;
}

export type PatchObject = SoundObj | FieldObj;

export interface Key {
  root: number;
  scale: string;
}

export interface Patch {
  format: 'gener8.patch';
  /** 2 since XY fields. Version 1 (fixed y = pitch, x = pan) is migrated on load. */
  version: 1 | 2;
  seed: number;
  tempo: number;
  key: Key;
  /** Master level in dB (default 0). */
  master?: number;
  objects: PatchObject[];
}

export type Edit =
  | { op: 'add'; obj: PatchObject }
  | { op: 'remove'; id: string }
  | { op: 'move'; id: string; x: number; y: number }
  | { op: 'set'; id: string; path: string[]; value: unknown }
  | { op: 'tempo'; value: number }
  | { op: 'key'; value: Key }
  | { op: 'seed'; value: number }
  | { op: 'master'; value: number }
  | { op: 'load'; patch: Patch };

export interface LoggedEdit {
  sample: number;
  edit: Edit;
}

export interface NoteEvent {
  tick: number;
  soundId: string;
  pitch: number;
  velocity: number;
  durTicks: number;
  sourceKind: 'generator' | 'ripple';
  sourceId: string;
  chain: number;
  serial: number;
}

/** What the engine reports to the UI for every event that actually sounded. */
export interface EventRecord {
  sample: number;
  tick: number;
  soundId: string;
  sourceId: string;
  sourceKind: 'generator' | 'ripple';
  velocity: number;
  pitch: number;
  chain: number;
  x: number;
  y: number;
  rippleR: number;
  /** Trace directions in turns clockwise from up; absent for a ring. */
  rippleDirs?: number[];
  rippleStop?: boolean;
  /** Only when not the default 1. */
  rippleFalloff?: number;
  accent: boolean;
}

// ---------- sounds ----------

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  curve: 'lin' | 'exp';
  unit?: string;
  /** A stepped choice: the value is an index into these labels (min 0, max length - 1). */
  options?: string[];
}

export type PanelSection =
  /** `hint`: dim lines under the sliders, e.g. what the macros do in the chosen model. */
  | { kind: 'knobs'; title: string; keys: string[]; hint?: (params: Record<string, number>) => string[] }
  | { kind: 'adsr'; title: string; keys: [string, string, string, string] }
  | { kind: 'filter'; title: string; cutoff: string; res: string; extra?: string[] };

export interface ModFrame {
  /** Continuous pitch for sustained voices (after transformers). */
  pitch: number;
  /** Open-voiced chord offsets in semitones from pitch (root, 5th, 9th, 10th), snapped to the scale. */
  chord: number[];
  /** The patch's key, for voices that build their own in-key chords. */
  keyRoot: number;
  steps: number[];
}

export interface VoiceContext {
  /** Live parameter values; the engine updates this object in place. */
  params: Record<string, number>;
  rand(stream: number, index: number): number;
}

export interface Voice {
  noteOn(pitch: number, velocity: number): void;
  noteOff(): void;
  accent?(velocity: number): void;
  /** Add output into out[start..end). Stereo types also receive outR; mono types ignore it. */
  render(out: Float64Array, start: number, end: number, mod: ModFrame, outR?: Float64Array): void;
  readonly active: boolean;
}

export interface SoundType {
  id: string;
  label: string;
  mode: 'event' | 'sustained';
  /** Voices render two channels (out = left, outR = right). */
  stereo?: boolean;
  glyph: string;
  maxVoices: number;
  params: ParamSpec[];
  panel: PanelSection[];
  createVoice(ctx: VoiceContext): Voice;
}

// ---------- fields ----------

export interface HandleSpec {
  key: string;
  label: string;
  default: number;
  format(v: number, handles: Record<string, number>): string;
}

export interface FieldContext {
  readonly seed: number;
  readonly idHash: number;
  readonly handles: Record<string, number>;
  readonly tempo: number;
  readonly ppq: number;
  readonly sr: number;
  /** Musical position at the start of the current block. */
  readonly tick: number;
  /** Current dimensions (breathing applied). Circles report w = h = 2r. */
  readonly w: number;
  readonly h: number;
  /** Dimensions from the patch, without breathing. */
  readonly baseW: number;
  readonly baseH: number;
  /** Current key: root pitch class and scale steps. */
  readonly keyRoot: number;
  readonly steps: number[];
  /** Per-field private state, created by the type. Plain data only. */
  state: any;
  rand(stream: number, index: number): number;
}

export interface GenMember {
  soundId: string;
  soundHash: number;
  depth: number;
  /** Turns clockwise from straight up, [0, 1). */
  angle: number;
  /** Offset from the field centre in world units, y up. */
  lx: number;
  ly: number;
  /** Radius in world units (size / 2, breathing applied). */
  r: number;
  /** Scale index of the sound's own pitch: emitting degree d plays index rootIndex + d. */
  rootIndex: number;
  mode: 'event' | 'sustained';
}

export type Emit = (soundId: string, tick: number, degree: number, velocity: number, durTicks: number) => void;

export interface FxProcessor {
  /** Insert FX: process one sound's mono signal in place. */
  mono?(buf: Float64Array, n: number, depth: number): void;
  /** Bus FX: process the zone's summed stereo send in place. */
  stereo?(l: Float64Array, r: Float64Array, n: number): void;
}

interface FieldTypeBase {
  id: string;
  label: string;
  /** A triangle is stored as { r }: the circumradius, one corner straight up. */
  shape: 'circle' | 'rect' | 'triangle';
  glyph: string;
  handles: HandleSpec[];
  defaultShape: FieldShape;
  createState?(ctx: FieldContext): unknown;
}

export interface GeneratorType extends FieldTypeBase {
  role: 'generator';
  schedule(ctx: FieldContext, t0: number, t1: number, members: GenMember[], emit: Emit): void;
  /** Optional data for the UI (e.g. CA cells). Returns null when unchanged. */
  visual?(ctx: FieldContext): unknown;
}

export interface TransformerType extends FieldTypeBase {
  role: 'transformer';
  transform(e: NoteEvent, depth: number, ctx: FieldContext, out: (e: NoteEvent) => void): void;
  transformPitch?(pitch: number, depth: number, ctx: FieldContext): number;
}

export interface FxType extends FieldTypeBase {
  role: 'fx';
  kind: 'insert' | 'bus';
  createProcessor(ctx: FieldContext): FxProcessor;
}

export interface MapAxisSpec {
  key: string;
  /** Row label in the UI, and the names of the low and high ends. */
  label: string;
  lo: string;
  hi: string;
}

/** Maps position to placement (pitch, pan…). Read by the engine directly, no hooks. */
export interface MapType extends FieldTypeBase {
  role: 'map';
  axes: MapAxisSpec[];
  defaultAxes: Axes;
  /**
   * Point (dx, dy) from the centre of a field w × h (pose scale applied).
   * Returns false when outside; otherwise writes, for each axis in order, the
   * offset from the axis centre and its half length into out[2i], out[2i + 1].
   */
  locate(w: number, h: number, dx: number, dy: number, out: number[]): boolean;
}

export type FieldType = GeneratorType | TransformerType | FxType | MapType;
export type Role = FieldType['role'];
