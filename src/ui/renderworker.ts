// Offline render in a worker, so the UI stays live: a fresh Engine from the
// patch, exactly what a reload + play would produce, only faster than real
// time. Audio goes into Blob parts as it is made (the browser may page large
// blobs to disk), so an hour never sits in one ArrayBuffer.

import { Engine } from '../core/engine.ts';
import { SR } from '../core/constants.ts';
import type { Patch } from '../core/types.ts';
import { wavHeader } from './wav.ts';

export type ToRender = { patch: Patch; seconds: number };
export type FromRender = { type: 'progress'; done: number } | { type: 'done'; wav: Blob };

const CHUNK = 4096;
const PART = 10 * SR; // frames per Blob part (3.84 MB)

self.onmessage = (ev: MessageEvent<ToRender>) => {
  const { patch, seconds } = ev.data;
  const post = (m: FromRender) => self.postMessage(m);
  const engine = new Engine(patch);
  engine.recordEvents = false;
  const n = Math.round(seconds * SR);
  const left = new Float32Array(PART);
  const right = new Float32Array(PART);
  const parts: BlobPart[] = [wavHeader(n, SR)];
  for (let at = 0; at < n; at += PART) {
    const m = Math.min(PART, n - at);
    for (let i = 0; i < m; i += CHUNK) engine.process(left, right, Math.min(CHUNK, m - i), i);
    const data = new Float32Array(m * 2);
    for (let i = 0; i < m; i++) {
      data[2 * i] = left[i];
      data[2 * i + 1] = right[i];
    }
    parts.push(new Blob([data]));
    post({ type: 'progress', done: (at + m) / n });
  }
  post({ type: 'done', wav: new Blob(parts, { type: 'audio/wav' }) });
};
