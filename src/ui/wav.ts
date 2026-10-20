/** 32-bit float stereo WAV. */
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const n = left.length;
  const dataBytes = n * 2 * 4;
  const buf = new ArrayBuffer(58 + dataBytes);
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
  u32(n);
  str('data');
  u32(dataBytes);
  for (let i = 0; i < n; i++) {
    v.setFloat32(o, left[i], true);
    v.setFloat32(o + 4, right[i], true);
    o += 8;
  }
  return new Blob([buf], { type: 'audio/wav' });
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
