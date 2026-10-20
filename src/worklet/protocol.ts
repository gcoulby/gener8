import type { Edit, EventRecord, LoggedEdit, Patch } from '../core/types.ts';
import type { Visual } from '../core/engine.ts';

export type ToWorklet =
  | { type: 'init'; patch: Patch }
  | { type: 'edit'; edit: Edit }
  | { type: 'capture' };

export interface Tele {
  type: 'tele';
  /** Engine sample at the end of the reported blocks. */
  sample: number;
  tick: number;
  tempo: number;
  /** contextFrame = engineSample + base */
  base: number;
  voices: number;
  events: EventRecord[];
  edits: LoggedEdit[];
  visuals: Visual[];
}

export interface CaptureReply {
  type: 'capture';
  left: Float32Array;
  right: Float32Array;
  endSample: number;
}

export type FromWorklet = Tele | CaptureReply;
