import type { Patch } from '../core/types.ts';
import type { Fade } from '../core/render.ts';
import type { FromRender, ToRender } from './renderworker.ts';

/** One offline render running in a worker; cancel() drops it. */
export class RenderJob {
  progress = 0;
  readonly seconds: number;
  private worker: Worker;
  readonly done: Promise<Blob>;

  constructor(patch: Patch, seconds: number, fade: Fade) {
    this.seconds = seconds;
    this.worker = new Worker(new URL('./renderworker.ts', import.meta.url), { type: 'module' });
    this.done = new Promise((resolve, reject) => {
      this.worker.onmessage = (ev: MessageEvent<FromRender>) => {
        const m = ev.data;
        if (m.type === 'progress') this.progress = m.done;
        else {
          resolve(m.wav);
          this.worker.terminate();
        }
      };
      this.worker.onerror = (ev) => {
        reject(new Error(ev.message || 'render failed'));
        this.worker.terminate();
      };
    });
    const msg: ToRender = { patch, seconds, fade };
    this.worker.postMessage(msg);
  }

  cancel(): void {
    this.worker.terminate();
  }
}
