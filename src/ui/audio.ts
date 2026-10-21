import workletUrl from '../worklet/processor.ts?worker&url';
import type { Edit, Patch } from '../core/types.ts';
import { PPQ, SR } from '../core/constants.ts';
import type { CaptureReply, FromWorklet, Tele, ToWorklet } from '../worklet/protocol.ts';

/** Main-thread side of the worklet: sends edits, receives telemetry, maps engine time to audible time. */
export class AudioBridge {
  ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private base = 0;
  private last = { sample: 0, tick: 0, tempo: 96 };
  private captureWaiter: ((r: CaptureReply) => void) | null = null;
  onTele: (t: Tele) => void = () => {};

  get started(): boolean {
    return this.node !== null;
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  async start(patch: Patch): Promise<void> {
    if (this.ctx) return;
    const ctx = new AudioContext({ sampleRate: SR, latencyHint: 'interactive' });
    this.ctx = ctx;
    await ctx.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(ctx, 'gener8', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    node.port.onmessage = (ev: MessageEvent<FromWorklet>) => this.onMessage(ev.data);
    node.connect(ctx.destination);
    this.node = node;
    this.post({ type: 'init', patch });
    this.last = { sample: 0, tick: 0, tempo: patch.tempo };
    if (ctx.state !== 'running') await ctx.resume();
  }

  private post(m: ToWorklet): void {
    this.node?.port.postMessage(m);
  }

  send(edit: Edit): void {
    this.post({ type: 'edit', edit });
  }

  async toggle(): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === 'running') await this.ctx.suspend();
    else await this.ctx.resume();
  }

  capture(): Promise<CaptureReply> {
    return new Promise((resolve) => {
      this.captureWaiter = resolve;
      this.post({ type: 'capture' });
    });
  }

  private onMessage(m: FromWorklet): void {
    if (m.type === 'tele') {
      this.base = m.base;
      this.last = { sample: m.sample, tick: m.tick, tempo: m.tempo };
      this.onTele(m);
    } else if (m.type === 'capture') {
      this.captureWaiter?.(m);
      this.captureWaiter = null;
    }
  }

  /** Engine sample currently reaching the speakers. */
  audibleSample(): number {
    const ctx = this.ctx;
    if (!ctx || !this.node) return 0;
    const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    return Math.max(0, (ctx.currentTime - lat) * SR - this.base);
  }

  /** Engine sample most recently rendered (ahead of audible). */
  get renderedSample(): number {
    return this.last.sample;
  }

  tickAt(sample: number): number {
    const l = this.last;
    return l.tick + ((sample - l.sample) * l.tempo * PPQ) / (60 * SR);
  }
}
