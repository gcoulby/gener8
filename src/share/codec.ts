// Patch ⇄ link payload: minified JSON → deflate-raw → base64url (no padding).
// Web-standard APIs only, so the same code runs in browsers and Node tests.
// Decoding is defensive: length and alphabet are checked first, and the
// decompressed size is counted while streaming so a crafted link can't
// allocate its way past the cap.

import type { Patch } from '../core/types.ts';

export const MAX_PAYLOAD_CHARS = 32768;
export const MAX_DECODED_BYTES = 262144;

const B64URL = /^[A-Za-z0-9_-]*$/;

export class PayloadError extends Error {}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  if (s.length % 4 === 1) throw new PayloadError('bad link');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function readAll(stream: ReadableStream<Uint8Array>, cap: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      throw new PayloadError('link is too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export async function encodePatchPayload(patch: Patch): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(patch));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return toBase64Url(await readAll(stream, Infinity));
}

/** Payload → parsed JSON (unvalidated: run it through sanitisePatch). Throws PayloadError. */
export async function decodePatchPayload(payload: string): Promise<unknown> {
  if (payload.length > MAX_PAYLOAD_CHARS) throw new PayloadError('link is too long');
  if (!payload || !B64URL.test(payload)) throw new PayloadError('bad link');
  const compressed = fromBase64Url(payload);
  let bytes: Uint8Array;
  try {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = await readAll(stream, MAX_DECODED_BYTES);
  } catch (err) {
    throw err instanceof PayloadError ? err : new PayloadError('bad link');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new PayloadError('bad link');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new PayloadError('bad link');
  }
}
