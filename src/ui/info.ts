// Patch info: who made a patch and what it is. A DOM dialog (the canvas has
// no text entry) that edits it, and a card that shows it when a patch that
// has some is opened. Info can come from a stranger's file or link, so it is
// only ever written with textContent, and links are http(s) only.

import { INFO_MAX } from '../core/patch.ts';
import type { PatchInfo } from '../core/types.ts';

const AUTHOR_KEY = 'gener8.author';

/** Your own details, remembered in this browser and signed into patches you save. */
export interface Author {
  artist?: string;
  url?: string;
}

export function readAuthor(): Author {
  try {
    const a = JSON.parse(localStorage.getItem(AUTHOR_KEY) ?? '{}');
    return {
      artist: typeof a.artist === 'string' && a.artist ? a.artist : undefined,
      url: typeof a.url === 'string' && a.url ? a.url : undefined,
    };
  } catch {
    return {};
  }
}

export function writeAuthor(a: Author): void {
  try {
    if (a.artist || a.url) localStorage.setItem(AUTHOR_KEY, JSON.stringify(a));
    else localStorage.removeItem(AUTHOR_KEY);
  } catch {
    // private window or blocked storage: nothing is remembered
  }
}

/** `info` with your artist and link filled in where it has none; the same object if nothing changes. */
export function signInfo(info: PatchInfo | undefined, a: Author): PatchInfo | undefined {
  if (!a.artist || info?.artist) return info;
  return { ...info, artist: a.artist, ...(a.url && !info?.url ? { url: a.url } : {}) };
}

/** A file name from the title: `my-patch`, or '' when there is no usable title. */
export function infoFileName(info: PatchInfo | undefined): string {
  return (info?.title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

const CSS = `
.g8-info{position:fixed;inset:0;z-index:21;background:rgba(5,5,7,.6);display:flex;align-items:center;justify-content:center;font:13px/1.55 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif;color:#e9e4da}
.g8-info *{box-sizing:border-box}
.g8-info-card{position:relative;width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow-y:auto;background:#0b0b0e;border:1px solid rgba(233,228,218,.18);border-radius:10px;padding:22px 24px 18px}
.g8-info .kicker{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;color:rgba(233,228,218,.45);margin:0 0 10px}
.g8-info h2{font-size:22px;font-weight:650;letter-spacing:-.01em;margin:0 0 2px;overflow-wrap:anywhere}
.g8-info .by{color:rgba(233,228,218,.75);margin:0 0 10px;overflow-wrap:anywhere}
.g8-info .genre{display:inline-block;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid rgba(233,228,218,.25);border-radius:10px;padding:1px 8px;margin:0 0 12px;color:rgba(233,228,218,.75)}
.g8-info .notes{white-space:pre-wrap;overflow-wrap:anywhere;color:rgba(233,228,218,.86);margin:0 0 12px;max-height:40vh;overflow-y:auto}
.g8-info a{color:#7fd6c7;text-decoration:none;border-bottom:1px solid rgba(127,214,199,.35);overflow-wrap:anywhere}
.g8-info a:hover{border-bottom-color:#7fd6c7}
.g8-info label{display:block;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;color:rgba(233,228,218,.55);margin:10px 0 4px}
.g8-info input[type=text],.g8-info input[type=url],.g8-info textarea{width:100%;padding:6px 9px;font:13px ui-sans-serif,-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif;color:#e9e4da;background:rgba(233,228,218,.05);border:1px solid rgba(233,228,218,.2);border-radius:5px;outline:none}
.g8-info input:focus,.g8-info textarea:focus{border-color:rgba(240,168,48,.7)}
.g8-info textarea{min-height:90px;resize:vertical}
.g8-info .check{display:flex;gap:8px;align-items:center;font:12px ui-sans-serif,-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif;letter-spacing:0;color:rgba(233,228,218,.7);margin-top:12px}
.g8-info .row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.g8-info button{height:28px;padding:0 14px;border-radius:14px;border:1px solid rgba(233,228,218,.25);background:#0b0b0e;color:#e9e4da;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
.g8-info button:hover{background:rgba(233,228,218,.1)}
.g8-info button.primary{border-color:rgba(240,168,48,.7);color:#f0a830}
@media (max-width:760px){.g8-info input[type=text],.g8-info input[type=url],.g8-info textarea{font-size:16px}}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = el('button', primary ? 'primary' : undefined, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export class InfoDialog {
  private root: HTMLDivElement | null = null;

  get isOpen(): boolean {
    return !!this.root;
  }

  close(): void {
    this.root?.remove();
    this.root = null;
  }

  /** The card shown when a patch with info is opened. */
  show(info: PatchInfo, onEdit: () => void): void {
    const card = this.open('patch info', () => this.close());
    card.append(el('p', 'kicker', 'PATCH INFO'), el('h2', undefined, info.title ?? 'untitled'));
    if (info.artist) card.append(el('p', 'by', 'by ' + info.artist));
    if (info.genre) card.append(el('span', 'genre', info.genre));
    if (info.notes) card.append(el('p', 'notes', info.notes));
    if (info.url) {
      const a = el('a', undefined, info.url.replace(/^https?:\/\//i, ''));
      a.href = info.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const p = el('p');
      p.append(a);
      card.append(p);
    }
    const row = el('div', 'row');
    const ok = button('ok', () => this.close(), true);
    row.append(
      button('edit', () => {
        this.close();
        onEdit();
      }),
      ok,
    );
    card.append(row);
    ok.focus();
    // a press on the canvas that opened this takes the focus back as it ends
    setTimeout(() => ok.isConnected && ok.focus(), 50);
  }

  /** The editor. `author` fills an empty artist and link; onSave gets the info and whether to remember them. */
  edit(info: PatchInfo | undefined, author: Author, onSave: (info: PatchInfo, remember: boolean) => void): void {
    const card = this.open('edit patch info', () => this.close());
    card.append(el('p', 'kicker', 'PATCH INFO'));
    const fields: Record<keyof PatchInfo, HTMLInputElement | HTMLTextAreaElement> = {} as never;
    const start: PatchInfo = { ...info, ...(!info?.artist && author.artist ? { artist: author.artist } : {}), ...(!info?.url && author.url ? { url: author.url } : {}) };
    const add = (key: keyof PatchInfo, label: string, placeholder: string) => {
      const id = 'g8-info-' + key;
      const lab = el('label', undefined, label);
      lab.htmlFor = id;
      const inp = key === 'notes' ? el('textarea') : el('input');
      if (inp instanceof HTMLInputElement) inp.type = key === 'url' ? 'url' : 'text';
      inp.id = id;
      inp.maxLength = INFO_MAX[key];
      inp.placeholder = placeholder;
      inp.value = start[key] ?? '';
      inp.spellcheck = key === 'notes';
      inp.autocomplete = 'off';
      fields[key] = inp;
      card.append(lab, inp);
    };
    add('title', 'title', 'untitled');
    add('artist', 'artist', 'your name');
    add('genre', 'genre', 'ambient, techno…');
    add('url', 'link', 'https://…');
    add('notes', 'notes', 'what it is, how to play it, credits…');
    const check = el('label', 'check');
    const remember = el('input');
    remember.type = 'checkbox';
    remember.checked = true;
    check.append(remember, 'remember my artist name and link for new patches');
    card.append(check);
    const save = () => {
      const url = fields.url.value.trim();
      if (url && !/^https?:\/\/\S+$/i.test(url)) {
        fields.url.setCustomValidity('a link starting https://');
        fields.url.reportValidity();
        return;
      }
      const out: PatchInfo = {};
      for (const k of Object.keys(fields) as (keyof PatchInfo)[]) out[k] = fields[k].value;
      this.close();
      onSave(out, remember.checked);
    };
    fields.url.addEventListener('input', () => fields.url.setCustomValidity(''));
    card.addEventListener('keydown', (e) => {
      // Enter saves from a one-line field; ⌘/ctrl-Enter from anywhere
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        save();
      }
    });
    const row = el('div', 'row');
    row.append(button('cancel', () => this.close()), button('save', save, true));
    card.append(row);
    fields.title.focus();
  }

  /** A fresh dialog with an empty card; Esc and a click outside call onDismiss. */
  private open(label: string, onDismiss: () => void): HTMLDivElement {
    this.close();
    if (!document.getElementById('g8-info-css')) {
      const style = document.createElement('style');
      style.id = 'g8-info-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    const root = el('div', 'g8-info');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', label);
    const card = el('div', 'g8-info-card');
    root.append(card);
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) onDismiss();
    });
    // keep keys and wheel away from the instrument underneath
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') onDismiss();
    });
    root.addEventListener('wheel', (e) => e.stopPropagation());
    document.body.appendChild(root);
    this.root = root;
    return card;
  }
}
