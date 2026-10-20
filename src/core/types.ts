// Patch format, edits, events and registry interfaces. See DESIGN.md §7, §9.

export type Vec2 = [number, number];

export type PosMotion =
  | { type: 'orbit'; radius: number; periodBeats: number; phase: number }
  | { type: 'path'; points: Vec2[]; periodBeats: number; mode: 'loop' | 'pingpong' }
  | { type: 'drift'; amplitude: number; rateBeats: number };

export interface Breathe {
  amount: number;
  periodBeats: number;
}

export interface Motion {
  pos?: PosMotion;
  breathe?: Breathe;
}

export interface SoundObj {
  id: string;
  kind: 'sound';
  type: string;
  x: number;
  y: number;
  size: number;
  layer: number;
  params: Record<string, number>;
  motion?: Motion;
  /** Mixer: level trim in dB (default 0), mute, solo. */
  trim?: number;
  mute?: boolean;
  solo?: boolean;
}

export type FieldShape = { r: number } | { w: number; h: number };

export interface FieldObj {
  id: string;
  kind: 'field';
  type: string;
  x: number;
  y: number;
  shape: FieldShape;
  layer: number;
  handles: Record<string, number>;
  motion?: Motion;
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
  version: 1;
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
}

export type PanelSection =
  | { kind: 'knobs'; title: string; keys: string[] }
  | { kind: 'adsr'; title: string; keys: [string, string, string, string] }
  | { kind: 'filter'; title: string; cutoff: string; res: string; extra?: string[] };

export interface ModFrame {
  /** Continuous pitch for sustained voices (after transformers). */
  pitch: number;
  /** Open-voiced chord offsets in semitones from pitch (root, 5th, 9th, 10th), snapped to the scale. */
  chord: number[];
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
  shape: 'circle' | 'rect';
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

export type FieldType = GeneratorType | TransformerType | FxType;
export type Role = FieldType['role'];
