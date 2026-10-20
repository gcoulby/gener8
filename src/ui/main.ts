import { App } from './app.ts';

const app = new App(document.getElementById('c') as HTMLCanvasElement);
(window as unknown as { gener8: App }).gener8 = app;
