// History: the edit log (stamped by the engine) plus periodic patch snapshots.
// Branching is a 'load' edit at the current engine time, so the log stays linear
// and a capture can always be replayed bit-for-bit from (root, log).

import type { EventRecord, LoggedEdit, Patch } from '../core/types.ts';
import { HISTORY_SECONDS, SNAPSHOT_SECONDS, SR } from '../core/constants.ts';
import { applyEdit, clone } from '../core/patch.ts';

interface Snap {
  sample: number;
  patch: Patch;
}

export class History {
  readonly root: Patch;
  readonly log: LoggedEdit[] = [];
  private head: Patch;
  private snaps: Snap[];
  /** Events per second of engine time, keyed by second index. */
  readonly activity = new Map<number, number>();
  now = 0;

  constructor(root: Patch) {
    this.root = clone(root);
    this.head = clone(root);
    this.snaps = [{ sample: 0, patch: clone(root) }];
  }

  ingest(edits: LoggedEdit[], events: EventRecord[], sample: number): void {
    for (const e of edits) {
      this.log.push(e);
      this.head = applyEdit(this.head, clone(e.edit));
    }
    for (const r of events) {
      const s = Math.floor(r.sample / SR);
      this.activity.set(s, (this.activity.get(s) ?? 0) + 1);
    }
    this.now = sample;
    const last = this.snaps[this.snaps.length - 1];
    if (sample - last.sample >= SNAPSHOT_SECONDS * SR) {
      this.snaps.push({ sample, patch: clone(this.head) });
      const oldest = sample - (HISTORY_SECONDS + SNAPSHOT_SECONDS) * SR;
      while (this.snaps.length > 1 && this.snaps[1].sample < oldest) this.snaps.shift();
      const oldSec = Math.floor(oldest / SR);
      for (const k of this.activity.keys()) if (k < oldSec) this.activity.delete(k);
    }
  }

  get earliest(): number {
    return Math.max(this.snaps[0].sample, this.now - HISTORY_SECONDS * SR);
  }

  patchAt(sample: number): Patch {
    let snap = this.snaps[0];
    for (const s of this.snaps) if (s.sample <= sample) snap = s;
    let p = clone(snap.patch);
    // binary search first log entry at or after the snapshot
    let lo = 0;
    let hi = this.log.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.log[mid].sample < snap.sample) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < this.log.length && this.log[i].sample <= sample; i++) p = applyEdit(p, clone(this.log[i].edit));
    return p;
  }

  editSamplesSince(from: number): number[] {
    const out: number[] = [];
    for (let i = this.log.length - 1; i >= 0 && this.log[i].sample >= from; i--) out.push(this.log[i].sample);
    return out;
  }
}
