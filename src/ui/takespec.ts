// What the render… and video… entries accept: a length, then options in any
// order. No DOM here, so the Node tests can check it.
//
//   5                  five minutes (a bare length is minutes)
//   90s fade           fade in and out, FADE_DEFAULT seconds each
//   1:00:00 fade:10s   both 10 s
//   10m in:2s out:30s  each on its own (a bare fade length is seconds)
//   5 60fps 4k         video only: frame rate and size

import { RENDER_MAX_SECONDS } from '../core/constants.ts';
import type { Fade } from '../core/render.ts';

export interface RenderSpec {
  seconds: number;
  fade: Fade;
}

export interface VideoSpec extends RenderSpec {
  fps: number;
  /** 720, 1080, 1440 or 2160; always 16:9. */
  height: number;
}

/** Seconds, for a plain `fade`. */
export const FADE_DEFAULT = 3;

export const RENDER_DEFAULT: RenderSpec = { seconds: 300, fade: { in: 0, out: 0 } };
export const VIDEO_DEFAULT: VideoSpec = { ...RENDER_DEFAULT, fps: 30, height: 1080 };

const HEIGHTS: Record<string, number> = { '720': 720, '720p': 720, '1080': 1080, '1080p': 1080, '1440': 1440, '1440p': 1440, '2k': 1440, '2160': 2160, '2160p': 2160, '4k': 2160 };

/** Render length text → seconds: h:mm:ss, m:ss, or a number with an optional s / m / h (bare = minutes). */
export function parseDuration(text: string, bare: 's' | 'm' = 'm'): number | null {
  const t = text.trim().toLowerCase();
  let sec: number;
  if (/^\d+(:\d{1,2}){1,2}$/.test(t)) sec = t.split(':').reduce((acc, x) => acc * 60 + Number(x), 0);
  else {
    const m = /^(\d+(?:\.\d+)?)\s*(s|m|h)?$/.exec(t);
    if (!m) return null;
    sec = Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2] ?? bare]!;
  }
  return sec > 0 ? Math.round(sec * 10) / 10 : null;
}

/**
 * A render… entry; null if anything doesn't parse. A length, frame rate or size
 * left out keeps its value from `base`; fades are only what's typed (the entry
 * starts out showing the current ones).
 */
export function parseRenderSpec(text: string, base: RenderSpec): RenderSpec | null {
  const spec = parse(text, { ...base, fps: 0, height: 0 }, false);
  return spec && { seconds: spec.seconds, fade: spec.fade };
}

/** A video… entry: as render…, plus a frame rate (24–60fps) and a size (720p / 1080p / 1440p / 4k). */
export function parseVideoSpec(text: string, base: VideoSpec): VideoSpec | null {
  return parse(text, base, true);
}

function parse(text: string, base: VideoSpec, video: boolean): VideoSpec | null {
  const spec: VideoSpec = { ...base, fade: { in: 0, out: 0 } };
  let seconds: number | null = null;
  for (const tok of text.trim().toLowerCase().split(/\s+/)) {
    if (!tok) continue;
    const fps = /^(24|25|30|50|60)fps$/.exec(tok);
    const fade = /^(fade|in|out)(?::(.+))?$/.exec(tok);
    if (video && fps) spec.fps = Number(fps[1]);
    else if (video && HEIGHTS[tok]) spec.height = HEIGHTS[tok];
    else if (fade) {
      // a plain `in` or `out` needs a length; a plain `fade` takes the default
      const len = fade[2] !== undefined ? parseDuration(fade[2], 's') : fade[1] === 'fade' ? FADE_DEFAULT : null;
      if (len === null) return null;
      if (fade[1] !== 'out') spec.fade.in = len;
      if (fade[1] !== 'in') spec.fade.out = len;
    } else if (seconds === null && (seconds = parseDuration(tok)) !== null) spec.seconds = Math.round(seconds);
    else return null;
  }
  spec.seconds = Math.min(spec.seconds, RENDER_MAX_SECONDS);
  // fades longer than the render share it in proportion
  const total = spec.fade.in + spec.fade.out;
  if (total > spec.seconds) {
    spec.fade.in *= spec.seconds / total;
    spec.fade.out *= spec.seconds / total;
  }
  return spec;
}

/** Back to entry text, which parses to the same spec. */
export function fmtRenderSpec(s: RenderSpec): string {
  return [fmtTime(s.seconds), fmtFade(s.fade)].filter(Boolean).join(' ');
}

export function fmtVideoSpec(s: VideoSpec): string {
  return [fmtTime(s.seconds), s.height === 2160 ? '4k' : s.height + 'p', s.fps + 'fps', fmtFade(s.fade)].filter(Boolean).join(' ');
}

function fmtFade(f: Fade): string {
  const sec = (x: number) => `${Math.round(x * 10) / 10}s`;
  if (f.in === f.out) return f.in ? `fade:${sec(f.in)}` : '';
  return [f.in ? `in:${sec(f.in)}` : '', f.out ? `out:${sec(f.out)}` : ''].filter(Boolean).join(' ');
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
