import { App } from './app.ts';
import logoWoff2 from './fonts/freefatfont-regular-webfont.woff2?url';
import logoWoff from './fonts/freefatfont-regular-webfont.woff?url';

const face = new FontFace('gener8-logo', `url(${logoWoff2}) format('woff2'), url(${logoWoff}) format('woff')`);
face
  .load()
  .then((f) => document.fonts.add(f))
  .catch(() => {
    /* falls back to the UI font */
  });

const app = new App(document.getElementById('c') as HTMLCanvasElement);
(window as unknown as { gener8: App }).gener8 = app;
