import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdit, cleanInfo, emptyPatch, INFO_MAX, normalizePatch } from '../src/core/patch.ts';
import { sanitisePatch } from '../src/core/sanitise.ts';
import { renderOffline } from '../src/core/render.ts';
import { infoFileName, signInfo } from '../src/ui/info.ts';
import { loadPatch } from './util.ts';

test('cleanInfo trims, cuts to length, and drops blanks, non-strings and bad links', () => {
  assert.equal(cleanInfo(undefined), undefined);
  assert.equal(cleanInfo('nope'), undefined);
  assert.equal(cleanInfo({ title: '   ', artist: 3 }), undefined);
  assert.deepEqual(cleanInfo({ title: '  a \n  title ', notes: ' line 1\r\nline 2 ' }), { title: 'a title', notes: 'line 1\nline 2' });
  assert.equal(cleanInfo({ title: 'x'.repeat(500) })!.title!.length, INFO_MAX.title);
  assert.equal(cleanInfo({ url: 'javascript:alert(1)' }), undefined);
  assert.equal(cleanInfo({ url: 'https://example.com/me' })!.url, 'https://example.com/me');
  assert.equal(cleanInfo({ title: 't', extra: 'dropped' } as object)!.hasOwnProperty('extra'), false);
});

test('the info edit sets, replaces and clears', () => {
  let p = emptyPatch();
  p = applyEdit(p, { op: 'info', value: { title: 'dawn', artist: 'me' } });
  assert.deepEqual(p.info, { title: 'dawn', artist: 'me' });
  p = applyEdit(p, { op: 'info', value: { title: '', artist: ' ' } });
  assert.equal('info' in p, false);
});

test('info survives normalise and share sanitising, cleaned', () => {
  const p = { ...emptyPatch(), info: { title: 'dawn', url: 'ftp://x', notes: 'n' } };
  assert.deepEqual(normalizePatch(p).info, { title: 'dawn', notes: 'n' });
  assert.deepEqual(sanitisePatch(p).info, { title: 'dawn', notes: 'n' });
  assert.equal('info' in sanitisePatch(emptyPatch()), false);
});

test('info never changes the sound', () => {
  const p = loadPatch('rhythmic');
  const a = renderOffline(p, 1);
  const b = renderOffline({ ...p, info: { title: 'x', artist: 'y' } }, 1);
  assert.deepEqual(a.left, b.left);
  assert.deepEqual(a.right, b.right);
});

test('signing fills an empty artist and link, and never replaces one', () => {
  const me = { artist: 'me', url: 'https://me.example' };
  assert.deepEqual(signInfo(undefined, me), { artist: 'me', url: 'https://me.example' });
  assert.deepEqual(signInfo({ title: 't' }, me), { title: 't', artist: 'me', url: 'https://me.example' });
  const theirs = { artist: 'them' };
  assert.equal(signInfo(theirs, me), theirs);
  assert.deepEqual(signInfo({ url: 'https://x.example' }, me), { url: 'https://x.example', artist: 'me' });
  const none = { title: 't' };
  assert.equal(signInfo(none, {}), none);
});

test('file names come from the title', () => {
  assert.equal(infoFileName({ title: 'Café Nights: Vol. 2!' }), 'cafe-nights-vol-2');
  assert.equal(infoFileName({ title: '★★★' }), '');
  assert.equal(infoFileName(undefined), '');
});
