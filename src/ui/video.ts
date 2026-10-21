// Offline video render: the whole UI, drawn frame by frame by a headless App
// that is fed by a fresh Engine in a worker (videoworker.ts), so picture and
// sound come from the same render and stay in step however long it takes.
// Frames are encoded with WebCodecs (via mediabunny) and streamed to an MP4
// file as they are made, so a long render never sits in memory.

import type { StreamTargetChunk } from 'mediabunny';
import { SR } from '../core/constants.ts';
import { fadeGain } from '../core/render.ts';
import type { Patch } from '../core/types.ts';
import { App } from './app.ts';
import { BG } from './theme.ts';
import { drawLogoAt, LOGO, logoWidth } from './draw.ts';
import { SHORT, type VideoSpec } from './takespec.ts';
import { download } from './wav.ts';
import type { FromVideo, ToVideo, VideoFrameData } from './videoworker.ts';

/** Roughly YouTube's recommended upload bitrates (SDR). */
const BITRATE: Record<number, [number, number]> = {
  720: [5e6, 7.5e6],
  1080: [8e6, 12e6],
  1440: [16e6, 24e6],
  2160: [35e6, 53e6],
};

/** Where the MP4 goes: a file chosen up front (Chrome, Edge), else a download at the end. */
interface Sink {
  writable: WritableStream<StreamTargetChunk>;
  name: string;
  /** Called after the output is finalized. */
  finish(): void;
  /** Call before cancelling the output: drops what was written instead of keeping a broken file. */
  discard(): void;
}

/**
 * Ask where to save, while the Enter that started it still counts as a user
 * gesture. Returns null if the user cancels the dialog.
 */
export async function openSink(name: string): Promise<Sink | null> {
  const pick = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
  if (pick) {
    let handle: FileSystemFileHandle;
    try {
      handle = await pick({ suggestedName: `${name}.mp4`, types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] });
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return null;
      throw err;
    }
    const file = await handle.createWritable();
    let keep = true;
    // the picker already made an empty file: a discarded render removes it (remove() is Chromium-only)
    const remove = () => (handle as unknown as { remove?: () => Promise<void> }).remove?.().catch(() => {});
    const writable = new WritableStream<StreamTargetChunk>({
      write: (c) => file.write(c),
      close: () => (keep ? file.close() : file.abort().then(remove)),
    });
    return { writable, name: handle.name.replace(/\.mp4$/i, ''), finish: () => {}, discard: () => (keep = false) };
  }
  // Blob parts, which the browser may page to disk. Nearly every write appends;
  // the few that go back (headers, at the end) splice in via slices, which share data rather than copy it.
  let parts: Blob[] = [];
  let size = 0;
  const writable = new WritableStream<StreamTargetChunk>({
    write(c) {
      const end = c.position + c.data.byteLength;
      if (c.position >= size) {
        if (c.position > size) parts.push(new Blob([new Uint8Array(c.position - size)]));
        parts.push(new Blob([c.data]));
      } else {
        const all = new Blob(parts);
        parts = [all.slice(0, c.position), new Blob([c.data]), all.slice(end)];
      }
      size = Math.max(size, end);
    },
  });
  return {
    writable,
    name,
    finish: () => download(new Blob(parts, { type: 'video/mp4' }), `${name}.mp4`),
    discard: () => (parts.length = 0),
  };
}

/** One video render; cancel() stops it and drops the file. */
export class VideoJob {
  progress = 0;
  readonly spec: VideoSpec;
  readonly done: Promise<void>;
  private cancelled = false;
  private worker: Worker;
  /** Resolves the wait for the worker's next batch. */
  private wake: (() => void) | null = null;

  constructor(live: App, patch: Patch, spec: VideoSpec, sink: Sink) {
    this.spec = spec;
    this.worker = new Worker(new URL('./videoworker.ts', import.meta.url), { type: 'module' });
    this.done = this.run(live, patch, sink).finally(() => this.worker.terminate());
  }

  cancel(): void {
    this.cancelled = true;
    this.worker.terminate();
    this.wake?.();
  }

  private async run(live: App, patch: Patch, sink: Sink): Promise<void> {
    // loaded on first use: most sessions never render a video
    const { AudioSample, AudioSampleSource, CanvasSource, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, Quality, StreamTarget } = await import('mediabunny');
    const { fps, seconds, fade, short } = this.spec;
    const height = short ? SHORT.height : this.spec.height;
    const width = short ? SHORT.width : Math.round((height * 16) / 9);
    const bitrate = BITRATE[short ? 1080 : height][fps > 30 ? 1 : 0];
    const vcodec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width, height, bitrate });
    const acodec = await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: 2, sampleRate: SR, bitrate: 256e3 });
    if (!vcodec || !acodec) throw new Error("this browser can't encode video · try Chrome or Edge");

    let app: App;
    if (short) {
      // Just the elements, at phone scale (540 × 960 points), showing everything
      // the live window shows: its view fitted into the portrait frame.
      const W = width / 2;
      const H = height / 2;
      const zoom = live.cam.zoom * Math.min(W / live.W, H / live.H);
      app = new App(document.createElement('canvas'), { patch, W, H, dpr: 2, from: live, clean: { cam: { ...live.cam, zoom } } });
    } else {
      // The same layout as the live window, widened (or narrowed) to 16:9 and scaled up to the video size.
      const H = live.H;
      const W = Math.round((H * width) / height);
      app = new App(document.createElement('canvas'), { patch, W, H, dpr: height / H, from: live });
    }
    app.canvas.width = width;
    app.canvas.height = height;

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: false }),
      target: new StreamTarget(sink.writable, { chunked: true }),
    });
    const video = new CanvasSource(app.canvas, { codec: vcodec, quality: new Quality({ bitrate }), keyFrameInterval: 2 });
    const audio = new AudioSampleSource({ codec: acodec, quality: new Quality({ bitrate: 256e3 }) });
    output.addVideoTrack(video, { frameRate: fps });
    output.addAudioTrack(audio);
    await output.start();

    const total = Math.round(seconds * fps);
    const batch = Math.max(1, Math.round(fps / 2));
    const queue: VideoFrameData[][] = [];
    let failed: Error | null = null;
    this.worker.onmessage = (ev: MessageEvent<FromVideo>) => {
      queue.push(ev.data.frames);
      this.wake?.();
    };
    this.worker.onerror = (ev) => {
      failed = new Error(ev.message || 'video render failed');
      this.wake?.();
    };
    const post = (m: ToVideo) => this.worker.postMessage(m);
    post({ type: 'init', patch, fps, frames: total, fade });
    // two batches in flight: the worker renders the next while this one is drawn and encoded
    post({ type: 'more', n: batch });
    post({ type: 'more', n: batch });

    const decay = 0.88 ** (60 / fps);
    const samples = Math.round((total * SR) / fps);
    let k = 0;
    let slice = performance.now();
    try {
      while (k < total) {
        if (!queue.length && !failed && !this.cancelled) await new Promise<void>((r) => (this.wake = r));
        this.wake = null;
        if (failed) throw failed;
        if (this.cancelled) break;
        const frames = queue.shift()!;
        if (k + frames.length < total) post({ type: 'more', n: batch });
        for (const f of frames) {
          const now = (k * 1000) / fps;
          const start = f.tele.sample - f.audio.length / 2;
          app.ingest(f.tele, now);
          app.tickNow = f.tele.tick;
          app.activate(f.tele.sample, now);
          app.paint(now, decay);
          // the picture fades with the sound, from and to the background: black at both ends
          const shade = 1 - Math.min(fadeGain(start, samples, fade), fadeGain(f.tele.sample - 1, samples, fade));
          if (shade > 0) {
            app.g.setTransform(1, 0, 0, 1, 0, 0);
            app.g.globalAlpha = shade;
            app.g.fillStyle = BG;
            app.g.fillRect(0, 0, width, height);
            app.g.globalAlpha = 1;
          }
          drawVideoLogo(app.g, width, height, app.dpr, short, app.mobile, 1 - shade);
          await video.add(k / fps, 1 / fps);
          const sample = new AudioSample({ data: f.audio, format: 'f32-planar', numberOfChannels: 2, sampleRate: SR, timestamp: start / SR });
          await audio.add(sample);
          sample.close();
          k++;
          this.progress = k / total;
          if (this.cancelled) break;
          // hand the main thread back to the live instrument every few ms
          if (performance.now() - slice > 12) {
            await yieldTask();
            slice = performance.now();
          }
        }
      }
    } catch (err) {
      sink.discard();
      await output.cancel();
      throw err;
    }
    if (this.cancelled) {
      sink.discard();
      await output.cancel();
      return;
    }
    await output.finalize();
    sink.finish();
  }
}

/** 0 → 1, easing in and out. */
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * The logo on every video, in canvas pixels. It rests in its usual place (the
 * app's top left, or a short's top centre). While the picture is faded out it
 * sits large in the middle, like a title card, and glides between the two as
 * the picture fades in and out: `shown` is how far the picture is faded in.
 */
function drawVideoLogo(g: CanvasRenderingContext2D, width: number, height: number, dpr: number, short: boolean, mobile: boolean, shown: number): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  const per100 = logoWidth(g, 100) / 100; // ink width per pixel of font size
  let px = (mobile ? LOGO.mobilePx : LOGO.px) * dpr;
  let x = LOGO.x * dpr;
  let y = LOGO.y * dpr;
  if (short) {
    px = (width * 0.42) / per100;
    x = (width - px * per100) / 2;
    y = height * 0.045;
  }
  // stays centred for the darkest part of the fade, then moves
  const t = ease((shown - 0.3) / 0.7);
  if (t < 1) {
    const cpx = (width * (short ? 0.7 : 0.4)) / per100;
    const cx = (width - cpx * per100) / 2;
    const cy = height / 2 - cpx * 0.55;
    px = cpx + (px - cpx) * t;
    x = cx + (x - cx) * t;
    y = cy + (y - cy) * t;
  }
  drawLogoAt(g, x, y, px);
}

/**
 * Yield to the event loop. A MessageChannel rather than setTimeout, which
 * background tabs throttle to once a second or less.
 */
function yieldTask(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(null);
  });
}
