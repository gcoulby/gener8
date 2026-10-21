/** 32-bit float stereo WAV. */
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const n = left.length;
  const data = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    data[2 * i] = left[i];
    data[2 * i + 1] = right[i];
  }
  return new Blob([wavHeader(n, sampleRate), data], { type: 'audio/wav' });
}

/** The 58-byte header of a 32-bit float stereo WAV of `frames` frames; interleaved little-endian samples follow. */
export function wavHeader(frames: number, sampleRate: number): ArrayBuffer {
  const dataBytes = frames * 2 * 4;
  const buf = new ArrayBuffer(58);
  const v = new DataView(buf);
  let o = 0;
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o++, s.charCodeAt(i));
  };
  const u32 = (x: number) => {
    v.setUint32(o, x, true);
    o += 4;
  };
  const u16 = (x: number) => {
    v.setUint16(o, x, true);
    o += 2;
  };
  str('RIFF');
  u32(50 + dataBytes);
  str('WAVE');
  str('fmt ');
  u32(18);
  u16(3); // IEEE float
  u16(2);
  u32(sampleRate);
  u32(sampleRate * 8);
  u16(8);
  u16(32);
  u16(0);
  str('fact');
  u32(4);
  u32(frames);
  str('data');
  u32(dataBytes);
  return buf;
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
