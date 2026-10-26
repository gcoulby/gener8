// Patches saved in this browser, by name: patch ▾ → save… and open…. They live
// in localStorage beside the autosaved working patch, so they stay on this
// device only; export and import move a patch as a file. Names are unique,
// ignoring case: saving under a taken name replaces that patch.

import type { Patch } from '../core/types.ts';
import { normalizePatch } from '../core/patch.ts';

const KEY = 'gener8.library';
export const NAME_MAX = 60;

export interface LibraryEntry {
  name: string;
  /** When it was last saved (ms since the epoch). */
  saved: number;
  patch: Patch;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The name as stored: trimmed, spaces collapsed, capped. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export class Library {
  private readonly store: Store | null;

  constructor(store: Store | null) {
    this.store = store;
  }

  /** Everything saved, newest first. Entries that no longer read as patches are skipped. */
  list(): LibraryEntry[] {
    let raw: unknown;
    try {
      raw = JSON.parse(this.store?.getItem(KEY) ?? '[]');
    } catch {
      return [];
    }
    if (!Array.isArray(raw)) return [];
    const out: LibraryEntry[] = [];
    for (const e of raw) {
      if (!e || typeof e.name !== 'string' || !e.name) continue;
      try {
        out.push({ name: e.name, saved: Number(e.saved) || 0, patch: normalizePatch(e.patch) });
      } catch {
        /* not a patch any more: leave it out */
      }
    }
    return out.sort((a, b) => b.saved - a.saved);
  }

  get(name: string): LibraryEntry | undefined {
    return this.list().find((e) => same(e.name, name));
  }

  /** Save under `name`, replacing a patch of that name. Throws when storage is full or missing. */
  save(name: string, patch: Patch, now = Date.now()): LibraryEntry {
    const n = cleanName(name);
    if (!n) throw new Error('give it a name');
    const entry = { name: n, saved: now, patch };
    this.write([entry, ...this.list().filter((e) => !same(e.name, n))]);
    return entry;
  }

  remove(name: string): void {
    this.write(this.list().filter((e) => !same(e.name, name)));
  }

  private write(entries: LibraryEntry[]): void {
    if (!this.store) throw new Error('browser storage is unavailable');
    try {
      this.store.setItem(KEY, JSON.stringify(entries));
    } catch {
      throw new Error('browser storage is full: export instead, or delete some saved patches');
    }
  }
}

/** "just now", "5 min ago", "3 h ago", "yesterday", or the date. */
export function savedAgo(saved: number, now = Date.now()): string {
  const s = (now - saved) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86400) return 'yesterday';
  return new Date(saved).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
