// The engine side of a video render: a fresh Engine from the patch, stepped one
// video frame at a time. Each frame carries its audio and the same telemetry the
// worklet posts, so the headless App that draws it sees what a live session would.
// The main thread asks for frames in batches, which keeps the two in step.

import { Engine } from '../core/engine.ts';
import { SR } from '../core/constants.ts';
import { applyFade, type Fade } from '../core/render.ts';
import type { Patch } from '../core/types.ts';
import type { Tele } from '../worklet/protocol.ts';

export type ToVideo = { type: 'init'; patch: Patch; fps: number; frames: number; fade: Fade } | { type: 'more'; n: number };

export interface VideoFrameData {
  tele: Tele;
  /** This frame's audio, planar: left then right. */
  audio: Float32Array;
}

export type FromVideo = { type: 'frames'; frames: VideoFrameData[] };

const CHUNK = 4096;

let engine: Engine;
let fps = 30;
let total = 0;
let next = 0;
let fade: Fade;
/** Samples in the whole render, for the fade out. */
let samples = 0;

self.onmessage = (ev: MessageEvent<ToVideo>) => {
  const m = ev.data;
  if (m.type === 'init') {
    engine = new Engine(m.patch);
    fps = m.fps;
    total = m.frames;
    next = 0;
    fade = m.fade;
    samples = Math.round((total * SR) / fps);
    return;
  }
  const frames: VideoFrameData[] = [];
  const transfer: ArrayBuffer[] = [];
  for (let k = 0; k < m.n && next < total; k++, next++) {
    // frame boundaries on whole samples, so rounding never drifts
    const at = Math.round((next * SR) / fps);
    const n = Math.round(((next + 1) * SR) / fps) - at;
    const audio = new Float32Array(n * 2);
    const left = audio.subarray(0, n);
    const right = audio.subarray(n);
    for (let i = 0; i < n; i += CHUNK) {
      const c = Math.min(CHUNK, n - i);
      engine.process(left.subarray(i, i + c), right.subarray(i, i + c), c);
    }
    applyFade(left, right, at, n, samples, fade);
    const tele: Tele = {
      type: 'tele',
      sample: engine.sample,
      tick: engine.tick,
      tempo: engine.patch.tempo,
      base: 0,
      voices: engine.activeVoiceCount,
      meters: engine.meters(),
      events: engine.drainRecords(),
      edits: engine.drainLog(),
      visuals: engine.visuals(),
    };
    frames.push({ tele, audio });
    transfer.push(audio.buffer);
  }
  const reply: FromVideo = { type: 'frames', frames };
  self.postMessage(reply, { transfer });
};
