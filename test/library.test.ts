import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, Library, savedAgo } from '../src/ui/library.ts';
import { emptyPatch } from '../src/core/patch.ts';
import { loadPatch } from './util.ts';

function memory(): Storage & { data: Map<string, string>; full: boolean } {
  const data = new Map<string, string>();
  const s = {
    data,
    full: false,
    getItem: (k: string) => data.get(k) ?? null,
    setItem(k: string, v: string) {
      if (s.full) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
  };
  return s as unknown as Storage & { data: Map<string, string>; full: boolean };
}

test('library: save, list newest first, open', () => {
  const lib = new Library(memory());
  assert.deepEqual(lib.list(), []);
  lib.save('Ambient', loadPatch('demo'), 1000);
  lib.save('tape', loadPatch('tape'), 2000);
  assert.deepEqual(lib.list().map((e) => e.name), ['tape', 'Ambient']);
  assert.equal(lib.get('ambient')?.name, 'Ambient');
  assert.equal(lib.get('ambient')?.patch.format, 'gener8.patch');
  assert.equal(lib.get('nope'), undefined);
});

test('library: a taken name (any case) is replaced, keeping one entry', () => {
  const lib = new Library(memory());
  lib.save('Ambient', loadPatch('demo'), 1000);
  lib.save('  AMBIENT ', { ...emptyPatch(), tempo: 99 }, 3000);
  const all = lib.list();
  assert.equal(all.length, 1);
  assert.equal(all[0].name, 'AMBIENT');
  assert.equal(all[0].patch.tempo, 99);
  assert.equal(all[0].saved, 3000);
});

test('library: remove, and names are cleaned', () => {
  const lib = new Library(memory());
  lib.save('a', emptyPatch());
  lib.save('b', emptyPatch());
  lib.remove('A');
  assert.deepEqual(lib.list().map((e) => e.name), ['b']);
  assert.equal(cleanName('  two   words '), 'two words');
  assert.equal(cleanName('x'.repeat(100)).length, 60);
  assert.throws(() => lib.save('   ', emptyPatch()), /name/);
});

test('library: full or missing storage throws; bad entries are skipped', () => {
  const store = memory();
  const lib = new Library(store);
  lib.save('ok', emptyPatch());
  store.full = true;
  assert.throws(() => lib.save('more', emptyPatch()), /full/);
  assert.deepEqual(lib.list().map((e) => e.name), ['ok']);
  assert.throws(() => new Library(null).save('x', emptyPatch()), /unavailable/);
  assert.deepEqual(new Library(null).list(), []);

  store.full = false;
  store.data.set('gener8.library', JSON.stringify([{ name: 'bad', saved: 1, patch: { format: 'nope' } }, { name: 'good', saved: 2, patch: emptyPatch() }, 7]));
  assert.deepEqual(lib.list().map((e) => e.name), ['good']);
  store.data.set('gener8.library', '{not json');
  assert.deepEqual(lib.list(), []);
});

test('library: saved ago', () => {
  const now = Date.UTC(2026, 9, 26, 12);
  assert.equal(savedAgo(now - 10_000, now), 'just now');
  assert.equal(savedAgo(now - 5 * 60_000, now), '5 min ago');
  assert.equal(savedAgo(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(savedAgo(now - 30 * 3600_000, now), 'yesterday');
});
