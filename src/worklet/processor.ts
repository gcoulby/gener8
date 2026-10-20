// Thin AudioWorkletProcessor around the shared Engine. All scheduling happens
// inside Engine.process, block by block; see DESIGN.md §1.3.

import { Engine } from '../core/engine.ts';
import { CAPTURE_SECONDS, SR } from '../core/constants.ts';
import type { CaptureReply, Tele, ToWorklet } from './protocol.ts';

const RING = CAPTURE_SECONDS * SR;
const TELE_EVERY = 4; // render quanta between telemetry posts (~10 ms)

class Gener8Processor extends AudioWorkletProcessor {
  private engine: Engine | null = null;
  private ringL = new Float32Array(RING);
  private ringR = new Float32Array(RING);
  private ringPos = 0;
  private ringFilled = 0;
  private quanta = 0;
  private base = 0;
  private scratch = new Float32Array(128);

  constructor() {
    super();
    this.port.onmessage = (ev: MessageEvent<ToWorklet>) => this.onMessage(ev.data);
  }

  private onMessage(m: ToWorklet): void {
    if (m.type === 'init') {
      this.engine = new Engine(m.patch);
      this.base = currentFrame;
      this.ringPos = 0;
      this.ringFilled = 0;
    } else if (m.type === 'edit') {
      this.engine?.edit(m.edit);
    } else if (m.type === 'capture') {
      const n = this.ringFilled;
      const left = new Float32Array(n);
      const right = new Float32Array(n);
      const start = (this.ringPos - n + RING) % RING;
      for (let i = 0; i < n; i++) {
        const j = (start + i) % RING;
        left[i] = this.ringL[j];
        right[i] = this.ringR[j];
      }
      const reply: CaptureReply = { type: 'capture', left, right, endSample: this.engine?.sample ?? 0 };
      this.port.postMessage(reply, [left.buffer, right.buffer]);
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const e = this.engine;
    const out = outputs[0];
    if (!e || !out || !out[0]) return true;
    const L = out[0];
    const R = out[1] ?? this.scratch;
    const n = L.length;
    // Engine time is what was rendered; keep contextFrame = engineSample + base.
    this.base = currentFrame - e.sample;
    e.process(L, R, n);
    for (let i = 0; i < n; i++) {
      this.ringL[this.ringPos] = L[i];
      this.ringR[this.ringPos] = R[i];
      if (++this.ringPos >= RING) this.ringPos = 0;
    }
    this.ringFilled = Math.min(RING, this.ringFilled + n);
    if (++this.quanta >= TELE_EVERY) {
      this.quanta = 0;
      const tele: Tele = {
        type: 'tele',
        sample: e.sample,
        tick: e.tick,
        tempo: e.patch.tempo,
        base: this.base,
        voices: e.activeVoiceCount,
        events: e.drainRecords(),
        edits: e.drainLog(),
        visuals: e.visuals(),
      };
      this.port.postMessage(tele);
    }
    return true;
  }
}

registerProcessor('gener8', Gener8Processor);
