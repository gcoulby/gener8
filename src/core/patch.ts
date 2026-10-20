import type { Edit, Patch, PatchObject } from './types.ts';

export function clone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

export function emptyPatch(): Patch {
  return {
    format: 'gener8.patch',
    version: 1,
    seed: 1,
    tempo: 64,
    key: { root: 2, scale: 'major' },
    objects: [],
  };
}

/** Fill missing top-level fields. Unknown fields are preserved. */
export function normalizePatch(input: unknown): Patch {
  const p = clone(input) as Partial<Patch> & Record<string, unknown>;
  if (!p || typeof p !== 'object') throw new Error('patch: not an object');
  if (p.format !== undefined && p.format !== 'gener8.patch') throw new Error('patch: unknown format');
  const d = emptyPatch();
  return {
    ...p,
    format: 'gener8.patch',
    version: 1,
    seed: typeof p.seed === 'number' ? p.seed >>> 0 : d.seed,
    tempo: typeof p.tempo === 'number' ? p.tempo : d.tempo,
    key: p.key && typeof p.key === 'object' ? p.key : d.key,
    objects: Array.isArray(p.objects) ? p.objects : [],
  } as Patch;
}

export function findObj(p: Patch, id: string): PatchObject | undefined {
  return p.objects.find((o) => o.id === id);
}

function setPath(target: any, path: string[], value: unknown): void {
  let t = target;
  for (let i = 0; i < path.length - 1; i++) {
    if (t[path[i]] === undefined || t[path[i]] === null) t[path[i]] = {};
    t = t[path[i]];
  }
  const k = path[path.length - 1];
  if (value === null || value === undefined) delete t[k];
  else t[k] = clone(value);
}

/** Apply an edit. Mutates p and returns the patch to use from now on (differs only for 'load'). */
export function applyEdit(p: Patch, e: Edit): Patch {
  switch (e.op) {
    case 'add':
      if (!findObj(p, e.obj.id)) p.objects.push(clone(e.obj));
      return p;
    case 'remove':
      p.objects = p.objects.filter((o) => o.id !== e.id);
      return p;
    case 'move': {
      const o = findObj(p, e.id);
      if (o) {
        o.x = e.x;
        o.y = e.y;
      }
      return p;
    }
    case 'set': {
      const o = findObj(p, e.id);
      if (o && e.path.length) setPath(o, e.path, e.value);
      return p;
    }
    case 'tempo':
      p.tempo = Math.min(300, Math.max(20, e.value));
      return p;
    case 'key':
      p.key = clone(e.value);
      return p;
    case 'seed':
      p.seed = e.value >>> 0;
      return p;
    case 'master':
      p.master = Math.min(12, Math.max(-60, e.value));
      return p;
    case 'load':
      return normalizePatch(e.patch);
  }
}

export function nextId(p: Patch, prefix: string): string {
  let max = 0;
  for (const o of p.objects) {
    if (o.id.startsWith(prefix)) {
      const n = Number(o.id.slice(prefix.length));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return prefix + (max + 1);
}

export function byLayer(a: PatchObject, b: PatchObject): number {
  return a.layer - b.layer || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
