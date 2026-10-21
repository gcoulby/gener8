// The in-app guide: docs/guide/*.md rendered into a DOM overlay (the canvas has
// no text layout or selection of its own). Pages link to each other with plain
// relative .md links, so the same files read properly on GitHub. Deep links:
// #docs/<page>[/<heading id>].

import { renderMarkdown, type Rendered } from './markdown.ts';
import start from '../../docs/guide/README.md?raw';
import sounds from '../../docs/guide/sounds.md?raw';
import fields from '../../docs/guide/fields.md?raw';
import maps from '../../docs/guide/maps.md?raw';
import retrigger from '../../docs/guide/retrigger.md?raw';
import motion from '../../docs/guide/motion.md?raw';
import mixing from '../../docs/guide/mixing.md?raw';
import shortcuts from '../../docs/guide/shortcuts.md?raw';
import model from '../../docs/guide/model.md?raw';
import modelSvg from '../../docs/gener8-model.svg?url';

export interface DocPage {
  id: string;
  file: string;
  title: string;
  md: string;
}

const SOURCES: [string, string, string][] = [
  ['start', 'README.md', start],
  ['sounds', 'sounds.md', sounds],
  ['fields', 'fields.md', fields],
  ['maps', 'maps.md', maps],
  ['retrigger', 'retrigger.md', retrigger],
  ['motion', 'motion.md', motion],
  ['mixing', 'mixing.md', mixing],
  ['shortcuts', 'shortcuts.md', shortcuts],
  ['model', 'model.md', model],
];

/** The palette icons in the tables (npm run doc-icons), keyed as the markdown writes them: icons/<file>. */
const ICONS = import.meta.glob('../../docs/guide/icons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Images the guide may show, by the relative path the markdown uses (so it also renders on GitHub). */
const IMAGES: Record<string, string> = {
  '../gener8-model.svg': modelSvg,
  ...Object.fromEntries(Object.entries(ICONS).map(([path, url]) => [path.replace(/^.*\/guide\//, ''), url])),
};

export const DOC_PAGES: DocPage[] = SOURCES.map(([id, file, md]) => ({ id, file, md, title: md.match(/^#\s+(.+)$/m)?.[1] ?? id }));

/** Page id and heading for a guide link like `maps.md#targets`, or null if it isn't one. */
export function docTarget(href: string): { page: string; anchor?: string } | null {
  const m = href.match(/^(?:\.\/)?([\w-]+\.md)?(?:#([\w-]+))?$/);
  if (!m || (!m[1] && !m[2])) return null;
  const page = m[1] ? DOC_PAGES.find((p) => p.file === m[1])?.id : '';
  if (page === undefined) return null;
  return { page, anchor: m[2] };
}

export function renderDoc(page: DocPage): Rendered {
  return renderMarkdown(page.md, {
    link(href): Record<string, string> | null {
      const t = docTarget(href);
      if (t) return { href: `#docs/${t.page || page.id}${t.anchor ? '/' + t.anchor : ''}`, 'data-doc': t.page || page.id, 'data-anchor': t.anchor ?? '' };
      if (/^(https?:|mailto:)/.test(href)) return { href, target: '_blank', rel: 'noopener noreferrer' };
      return null;
    },
    image: (src) => IMAGES[src] ?? null,
  });
}

/** `#docs/maps/targets` → { page: 'maps', anchor: 'targets' }; null when the hash isn't a docs link. */
export function parseDocsHash(hash: string): { page: string; anchor?: string } | null {
  const m = hash.match(/^#docs(?:\/([\w-]+))?(?:\/([\w-]+))?$/);
  if (!m) return null;
  return { page: DOC_PAGES.some((p) => p.id === m[1]) ? m[1] : 'start', anchor: m[2] };
}

const DOCS_CSS = `
.g8-docs{position:fixed;inset:0;z-index:20;background:rgba(5,5,7,.72);display:flex;align-items:center;justify-content:center;font:13px/1.6 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif;color:#e9e4da}
.g8-docs *{box-sizing:border-box}
.g8-docs-panel{display:flex;width:min(1080px,calc(100vw - 48px));height:min(860px,calc(100vh - 48px));background:#0b0b0e;border:1px solid rgba(233,228,218,.18);border-radius:10px;overflow:hidden}
.g8-docs nav{flex:0 0 220px;border-right:1px solid rgba(233,228,218,.1);padding:18px 0;overflow-y:auto;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.g8-docs nav .brand{padding:0 18px 12px;color:rgba(233,228,218,.5);letter-spacing:.08em;font-size:11px}
.g8-docs nav a{display:block;padding:4px 18px;color:rgba(233,228,218,.65);text-decoration:none;border-left:2px solid transparent}
.g8-docs nav a:hover{color:#e9e4da;background:rgba(233,228,218,.05)}
.g8-docs nav a.on{color:#e9e4da;border-left-color:#f0a830;background:rgba(233,228,218,.04)}
.g8-docs nav .toc{margin-top:16px;padding-top:12px;border-top:1px solid rgba(233,228,218,.08)}
.g8-docs nav .toc .label{padding:0 18px 4px;color:rgba(233,228,218,.4);font-size:10px;letter-spacing:.08em}
.g8-docs nav .toc a{font-size:11px;padding:2px 18px 2px 26px;color:rgba(233,228,218,.5)}
.g8-docs main{flex:1;min-width:0;position:relative;display:flex;flex-direction:column}
.g8-docs .close{position:absolute;top:10px;right:12px;width:30px;height:30px;border-radius:15px;border:1px solid rgba(233,228,218,.25);background:#0b0b0e;color:#e9e4da;font-size:16px;line-height:1;cursor:pointer;z-index:1}
.g8-docs .close:hover{background:rgba(233,228,218,.1)}
.g8-docs article{flex:1;overflow-y:auto;padding:28px 44px 40px;max-width:100%}
.g8-docs article>*{max-width:760px}
.g8-docs h1{font-size:24px;margin:0 0 14px;font-weight:650;letter-spacing:-.01em}
.g8-docs h2{font-size:17px;margin:30px 0 8px;font-weight:620;padding-top:6px;border-top:1px solid rgba(233,228,218,.08)}
.g8-docs h3{font-size:14px;margin:22px 0 6px;font-weight:620}
.g8-docs p,.g8-docs ul,.g8-docs ol{margin:0 0 12px;color:rgba(233,228,218,.86)}
.g8-docs ul,.g8-docs ol{padding-left:22px}
.g8-docs li{margin:3px 0}
.g8-docs a{color:#7fd6c7;text-decoration:none;border-bottom:1px solid rgba(127,214,199,.35)}
.g8-docs a:hover{border-bottom-color:#7fd6c7}
.g8-docs strong{color:#fff;font-weight:620}
.g8-docs code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(233,228,218,.08);padding:1px 5px;border-radius:4px}
.g8-docs pre{background:rgba(233,228,218,.05);border:1px solid rgba(233,228,218,.1);border-radius:6px;padding:10px 14px;overflow-x:auto}
.g8-docs pre code{background:none;padding:0}
.g8-docs kbd{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid rgba(233,228,218,.35);border-bottom-width:2px;border-radius:4px;padding:0 5px;background:rgba(233,228,218,.06);white-space:nowrap}
.g8-docs .table{overflow-x:auto;margin:0 0 14px}
.g8-docs table{border-collapse:collapse;width:100%;font-size:12.5px}
.g8-docs th,.g8-docs td{text-align:left;vertical-align:top;padding:6px 10px;border-bottom:1px solid rgba(233,228,218,.09)}
.g8-docs th{color:rgba(233,228,218,.55);font-weight:500;font-size:11px;letter-spacing:.04em}
.g8-docs td img{width:26px;height:26px;vertical-align:-8px;margin-right:7px}
.g8-docs td:has(> img:first-child){white-space:nowrap}
.g8-docs blockquote{margin:0 0 12px;padding:4px 14px;border-left:2px solid rgba(233,228,218,.25);color:rgba(233,228,218,.7)}
.g8-docs hr{border:0;border-top:1px solid rgba(233,228,218,.12);margin:20px 0}
.g8-docs nav a,.g8-docs nav a:hover{border-bottom:0}
.g8-docs .pager{display:flex;justify-content:space-between;gap:12px;margin-top:34px;padding-top:14px;border-top:1px solid rgba(233,228,218,.1);max-width:760px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
.g8-docs .pager a{border:0}
.g8-docs .zoom{position:relative;margin:4px 0 16px;max-width:none;border:1px solid rgba(233,228,218,.14);border-radius:8px;background:#11161c;overflow:hidden}
.g8-docs .zoom-view{position:relative;height:clamp(240px,46vh,480px);overflow:hidden;cursor:grab;touch-action:none;user-select:none}
.g8-docs .zoom-view.grabbing{cursor:grabbing}
.g8-docs .zoom-view img{position:absolute;left:0;top:0;max-width:none;transform-origin:0 0;pointer-events:none}
.g8-docs .zoom-bar{position:absolute;right:8px;bottom:8px;display:flex;gap:4px;align-items:center;font:11px ui-monospace,SFMono-Regular,Menlo,monospace}
.g8-docs .zoom-bar button,.g8-docs .zoom-bar a{min-width:26px;height:26px;padding:0 8px;border-radius:13px;border:1px solid rgba(233,228,218,.25);background:rgba(11,11,14,.88);color:#e9e4da;font:inherit;line-height:24px;text-align:center;cursor:pointer}
.g8-docs .zoom-bar button:hover,.g8-docs .zoom-bar a:hover{background:rgba(40,40,46,.95)}
.g8-docs .zoom-hint{position:absolute;left:10px;bottom:12px;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:rgba(233,228,218,.45);pointer-events:none}
.g8-docs .zoom.big{position:absolute;inset:0;z-index:2;margin:0;border:0;border-radius:0;display:flex}
.g8-docs .zoom.big .zoom-view{flex:1;height:auto!important}
@media (max-width:760px){
.g8-docs .zoom-hint{display:none}
.g8-docs-panel{flex-direction:column;width:100vw;height:100vh;border-radius:0;border:0}
.g8-docs nav{flex:0 0 auto;display:flex;overflow-x:auto;overflow-y:hidden;padding:10px 48px 10px 8px;border-right:0;border-bottom:1px solid rgba(233,228,218,.1);white-space:nowrap}
.g8-docs nav .brand,.g8-docs nav .toc{display:none}
.g8-docs nav a{border-left:0;border-bottom:2px solid transparent;padding:4px 10px}
.g8-docs nav a.on{border-bottom-color:#f0a830}
.g8-docs article{padding:20px 18px 32px}
.g8-docs .close{top:8px;right:8px}
}`;

export class DocsViewer {
  private root: HTMLDivElement | null = null;
  private nav!: HTMLElement;
  private article!: HTMLElement;
  page = 'start';

  get isOpen(): boolean {
    return !!this.root;
  }

  open(page = this.page, anchor?: string): void {
    if (!this.root) this.build();
    this.show(page, anchor);
  }

  /** Esc: leave a full-size diagram first, then close the guide. */
  escape(): void {
    const big = this.root?.querySelector('.zoom.big');
    if (big) big.classList.remove('big');
    else this.close();
  }

  close(): void {
    this.root?.remove();
    this.root = null;
    if (location.hash.startsWith('#docs')) history.replaceState(null, '', location.pathname + location.search);
  }

  private build(): void {
    if (!document.getElementById('g8-docs-css')) {
      const style = document.createElement('style');
      style.id = 'g8-docs-css';
      style.textContent = DOCS_CSS;
      document.head.appendChild(style);
    }
    const root = document.createElement('div');
    root.className = 'g8-docs';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'GENER8 guide');
    root.innerHTML = `<div class="g8-docs-panel"><nav aria-label="guide pages"></nav><main><button class="close" aria-label="close the guide" title="close (esc)">×</button><article></article></main></div>`;
    this.nav = root.querySelector('nav')!;
    this.article = root.querySelector('article')!;
    root.addEventListener('click', (e) => {
      if (e.target === root || (e.target as HTMLElement).closest('.close')) {
        this.close();
        return;
      }
      const a = (e.target as HTMLElement).closest('a[data-doc]') as HTMLAnchorElement | null;
      if (a) {
        e.preventDefault();
        this.show(a.dataset.doc!, a.dataset.anchor || undefined);
      }
    });
    // keep keys and wheel inside the guide, away from the instrument underneath
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.escape();
    });
    root.addEventListener('wheel', (e) => e.stopPropagation());
    document.body.appendChild(root);
    this.root = root;
    root.querySelector<HTMLButtonElement>('.close')!.focus();
  }

  private show(id: string, anchor?: string): void {
    const page = DOC_PAGES.find((p) => p.id === id) ?? DOC_PAGES[0];
    if (page.id !== this.page || !this.article.childElementCount) {
      this.page = page.id;
      const r = renderDoc(page);
      const i = DOC_PAGES.indexOf(page);
      const prev = DOC_PAGES[i - 1];
      const next = DOC_PAGES[i + 1];
      const link = (p: DocPage, text: string) => `<a href="#docs/${p.id}" data-doc="${p.id}">${text}</a>`;
      this.article.innerHTML =
        r.html + `<div class="pager"><span>${prev ? link(prev, '← ' + prev.title) : ''}</span><span>${next ? link(next, next.title + ' →') : ''}</span></div>`;
      // diagrams pan and zoom; icons in tables stay inline
      for (const img of this.article.querySelectorAll('img')) if (!img.closest('td, th')) zoomable(img);
      const toc = r.headings.filter((h) => h.level === 2);
      this.nav.innerHTML =
        `<div class="brand">GENER8 GUIDE</div>` +
        DOC_PAGES.map((p) => `<a href="#docs/${p.id}" data-doc="${p.id}"${p.id === page.id ? ' class="on" aria-current="page"' : ''}>${escapeText(p.title)}</a>`).join('') +
        (toc.length
          ? `<div class="toc"><div class="label">ON THIS PAGE</div>${toc.map((h) => `<a href="#docs/${page.id}/${h.id}" data-doc="${page.id}" data-anchor="${h.id}">${escapeText(h.text)}</a>`).join('')}</div>`
          : '');
    }
    const target = anchor ? this.article.querySelector(`[id="${CSS.escape(anchor)}"]`) : null;
    if (target) target.scrollIntoView({ block: 'start' });
    else this.article.scrollTop = 0;
    history.replaceState(null, '', `${location.pathname}${location.search}#docs/${page.id}${target ? '/' + anchor : ''}`);
  }
}

/**
 * Turn an image into a pan/zoom view: drag to pan, ⌘/ctrl-scroll or pinch to
 * zoom, double-click to zoom in (shift: out). Plain scrolling still scrolls the
 * page, except sideways, which pans. ⤢ fills the guide with it.
 */
function zoomable(img: HTMLImageElement): void {
  const fig = document.createElement('div');
  fig.className = 'zoom';
  const view = document.createElement('div');
  view.className = 'zoom-view';
  view.setAttribute('role', 'img');
  view.setAttribute('aria-label', img.alt);
  fig.append(view);
  fig.insertAdjacentHTML(
    'beforeend',
    `<span class="zoom-hint">drag to pan · ⌘-scroll or pinch to zoom</span><div class="zoom-bar"><button data-z="out" title="zoom out">−</button><button data-z="in" title="zoom in">+</button><button data-z="fit" title="fit">fit</button><button data-z="big" title="fill the guide (esc to leave)">⤢</button><a href="${escapeText(img.src)}" target="_blank" rel="noopener" title="the SVG on its own; hover a class for its notes">open ↗</a></div>`,
  );
  // an image alone in its paragraph replaces the paragraph
  const p = img.parentElement;
  (p?.tagName === 'P' && p.childNodes.length === 1 ? p : img).replaceWith(fig);
  view.append(img);

  let s = 1;
  let tx = 0;
  let ty = 0;
  let fitted = true;
  const nat = () => [img.naturalWidth || 1, img.naturalHeight || 1];
  const fitScale = () => {
    const [w, h] = nat();
    return Math.min(view.clientWidth / w, view.clientHeight / h);
  };
  const apply = () => {
    const [w, h] = nat();
    const vw = view.clientWidth;
    const vh = view.clientHeight;
    // keep the image on screen: centred when smaller than the view, edge to edge when larger
    tx = w * s <= vw ? (vw - w * s) / 2 : Math.min(0, Math.max(vw - w * s, tx));
    ty = h * s <= vh ? (vh - h * s) / 2 : Math.min(0, Math.max(vh - h * s, ty));
    img.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
  };
  const fit = () => {
    // size the box to the image's shape, within reason
    const [w, h] = nat();
    view.style.height = `${Math.round(Math.min(480, Math.max(300, (view.clientWidth * h) / w)))}px`;
    s = fitScale();
    fitted = true;
    apply();
  };
  /** Scale by k about the view point (px, py). */
  const zoom = (k: number, px = view.clientWidth / 2, py = view.clientHeight / 2) => {
    const f = fitScale();
    const ns = Math.min(2, Math.max(f, s * k));
    tx = px - ((px - tx) * ns) / s;
    ty = py - ((py - ty) * ns) / s;
    s = ns;
    fitted = s <= f;
    apply();
  };
  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = view.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  if (img.complete) fit();
  else img.addEventListener('load', fit, { once: true });
  new ResizeObserver(() => (fitted ? fit() : apply())).observe(view);

  fig.querySelector('.zoom-bar')!.addEventListener('click', (e) => {
    const z = (e.target as HTMLElement).closest('button')?.dataset.z;
    if (z === 'in') zoom(1.6);
    else if (z === 'out') zoom(1 / 1.6);
    else if (z === 'fit') fit();
    else if (z === 'big') fig.classList.toggle('big');
  });
  view.addEventListener('dblclick', (e) => zoom(e.shiftKey ? 0.5 : 2, ...at(e)));
  view.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.002)), ...at(e));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || fig.classList.contains('big')) {
        e.preventDefault();
        tx -= e.deltaX;
        ty -= e.deltaY;
        apply();
      }
    },
    { passive: false },
  );

  // one pointer pans, two pinch
  const ptrs = new Map<number, [number, number]>();
  let last: { x: number; y: number; d: number } | null = null;
  const gesture = () => {
    const ps = [...ptrs.values()];
    const x = ps.reduce((a, p) => a + p[0], 0) / ps.length;
    const y = ps.reduce((a, p) => a + p[1], 0) / ps.length;
    const d = ps.length > 1 ? Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]) : 0;
    return { x, y, d };
  };
  view.addEventListener('pointerdown', (e) => {
    view.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, at(e));
    last = gesture();
    view.classList.add('grabbing');
  });
  view.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId) || !last) return;
    ptrs.set(e.pointerId, at(e));
    const g = gesture();
    tx += g.x - last.x;
    ty += g.y - last.y;
    if (g.d && last.d) zoom(g.d / last.d, g.x, g.y);
    else apply();
    last = g;
  });
  const up = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    last = ptrs.size ? gesture() : null;
    if (!ptrs.size) view.classList.remove('grabbing');
  };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
