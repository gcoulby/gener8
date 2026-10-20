import { readFileSync, writeFileSync } from 'node:fs';

/** Write 32-bit float stereo WAV. */
export function writeWav(path: string, left: Float32Array, right: Float32Array, sr: number): void {
  const n = left.length;
  const buf = Buffer.alloc(58 + n * 8);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(50 + n * 8, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(18, 16);
  buf.writeUInt16LE(3, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 8, 28);
  buf.writeUInt16LE(8, 32);
  buf.writeUInt16LE(32, 34);
  buf.writeUInt16LE(0, 36);
  buf.write('fact', 38);
  buf.writeUInt32LE(4, 42);
  buf.writeUInt32LE(n, 46);
  buf.write('data', 50);
  buf.writeUInt32LE(n * 8, 54);
  for (let i = 0; i < n; i++) {
    buf.writeFloatLE(left[i], 58 + i * 8);
    buf.writeFloatLE(right[i], 62 + i * 8);
  }
  writeFileSync(path, buf);
}

/** Read a 32-bit float stereo WAV as written by the app or writeWav. */
export function readWav(path: string): [Float32Array, Float32Array] {
  const b = readFileSync(path);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 12;
  while (o < b.length) {
    const id = b.toString('ascii', o, o + 4);
    const size = v.getUint32(o + 4, true);
    if (id === 'data') {
      const frames = size / 8;
      const l = new Float32Array(frames);
      const r = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        l[i] = v.getFloat32(o + 8 + i * 8, true);
        r[i] = v.getFloat32(o + 12 + i * 8, true);
      }
      return [l, r];
    }
    o += 8 + size + (size & 1);
  }
  throw new Error('no data chunk');
}
