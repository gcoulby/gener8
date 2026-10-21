import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { encodePatchPayload, decodePatchPayload, PayloadError, MAX_PAYLOAD_CHARS, MAX_DECODED_BYTES } from '../src/share/codec.ts';
import { buildShare, canonicalJson, isDisposable, parseHash, resolveLink } from '../src/ui/share.ts';
import { applyEdit, clone } from '../src/core/patch.ts';
import { generatePatch, GENERATOR_VERSION } from '../src/core/generate.ts';
import { ShareError } from '../src/core/sanitise.ts';
import { loadPatch } from './util.ts';

const BUNDLED = readdirSync(new URL('../patches/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const BASE = 'https://example.test/gener8/';
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');

// ---------- codec ----------

test('codec round-trips bundled and generated patches', async () => {
  for (const p of [...BUNDLED.map(loadPatch), generatePatch(3041872655)]) {
    const payload = await encodePatchPayload(p);
    assert.match(payload, /^[A-Za-z0-9_-]+$/);
    assert.equal(canonicalJson(await decodePatchPayload(payload)), canonicalJson(p));
  }
});

test('codec rejects a deflate bomb without decoding past the cap', async () => {
  const bomb = deflateRawSync(Buffer.alloc(300 * 1024, 0x20), { level: 9 });
  const payload = b64url(bomb);
  assert.ok(payload.length < MAX_PAYLOAD_CHARS, `bomb payload ${payload.length} chars`);
  await assert.rejects(decodePatchPayload(payload), PayloadError);
  // a much bigger bomb is cut off just as quickly
  const big = b64url(deflateRawSync(Buffer.alloc(64 * 1024 * 1024, 0x20), { level: 9 }));
  const before = process.memoryUsage().arrayBuffers;
  await assert.rejects(decodePatchPayload(big), PayloadError);
  assert.ok(process.memoryUsage().arrayBuffers - before < 16 * MAX_DECODED_BYTES);
});

test('codec rejects oversized, malformed and non-base64url payloads', async () => {
  const bad = [
    'A'.repeat(MAX_PAYLOAD_CHARS + 1),
    '',
    'abc+def/',
    'abc=',
    'has space',
    'é',
    'A', // impossible length
    'AAAAAAAA', // not deflate
    b64url(deflateRawSync(Buffer.from([0xff, 0xfe, 0xfd]))), // not UTF-8
    b64url(deflateRawSync(Buffer.from('{"format":'))), // not JSON
  ];
  for (const s of bad) await assert.rejects(decodePatchPayload(s), PayloadError, JSON.stringify(s.slice(0, 20)));
});

// ---------- parseHash ----------

test('parseHash', () => {
  assert.deepEqual(parseHash('#s=3041872655&g=1'), { kind: 'seed', seed: 3041872655, gen: 1 });
  assert.deepEqual(parseHash('#s=7'), { kind: 'seed', seed: 7, gen: GENERATOR_VERSION });
  assert.deepEqual(parseHash('#s=7&g=1&utm=x'), { kind: 'seed', seed: 7, gen: 1 });
  assert.deepEqual(parseHash('#s=1&p=abc'), { kind: 'patch', payload: 'abc' });
  assert.deepEqual(parseHash('#s=1&g=99'), { kind: 'seed', seed: 1, gen: 99 });
  for (const junk of ['', '#', '#hello', 'nohash', '#s=', '#s=-1', '#s=1.5', '#s=4294967296', '#s=abc', '#s=1&g=x', '#s=1&g=0', '#s=1&g=-1', '#p=', '#%', '#s=99999999999']) {
    assert.equal(parseHash(junk), null, junk);
  }
});

test('a link to an unknown generator version is refused', async () => {
  await assert.rejects(resolveLink({ kind: 'seed', seed: 1, gen: GENERATOR_VERSION + 1 }), ShareError);
});

// ---------- buildShare ----------

test('a fresh generated patch gives a seed link that resolves to the same patch', async () => {
  const p = generatePatch(3041872655);
  const r = await buildShare(p, BASE);
  assert.equal(r.kind, 'seed');
  assert.equal(r.url, `${BASE}#s=3041872655&g=${GENERATOR_VERSION}`);
  const back = await resolveLink(parseHash(new URL(r.url).hash)!);
  assert.equal(canonicalJson(back), canonicalJson(p));
});

test('moving one object gives a patch link that round-trips', async () => {
  const p = generatePatch(5);
  const o = p.objects[0];
  applyEdit(p, { op: 'move', id: o.id, x: o.x + 10, y: o.y });
  const r = await buildShare(p, BASE);
  assert.equal(r.kind, 'patch');
  assert.ok(r.url.startsWith(BASE + '#p='));
  const back = await resolveLink(parseHash(new URL(r.url).hash)!);
  assert.equal(canonicalJson(back), canonicalJson(p));
});

test('changing the runtime seed gives a patch link', async () => {
  const p = generatePatch(5);
  applyEdit(p, { op: 'seed', value: 6 });
  assert.equal((await buildShare(p, BASE)).kind, 'patch');
});

test('bundled examples share as patch links', async () => {
  for (const name of BUNDLED) {
    const p = loadPatch(name);
    const r = await buildShare(p, BASE);
    assert.equal(r.kind, 'patch', name);
    assert.equal(canonicalJson(await resolveLink(parseHash(new URL(r.url).hash)!)), canonicalJson(p), name);
  }
});

test('isDisposable', () => {
  assert.ok(isDisposable({ ...generatePatch(1), objects: [] }));
  assert.ok(isDisposable(generatePatch(77)));
  assert.ok(isDisposable(loadPatch('demo')));
  const edited = clone(loadPatch('demo'));
  applyEdit(edited, { op: 'tempo', value: edited.tempo + 1 });
  assert.ok(!isDisposable(edited));
  const g = generatePatch(77);
  applyEdit(g, { op: 'remove', id: g.objects[0].id });
  assert.ok(!isDisposable(g));
});
