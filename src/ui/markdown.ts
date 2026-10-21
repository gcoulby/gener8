// A small Markdown renderer for the in-app guide. Covers what the guide uses:
// headings, paragraphs, lists (nested), tables, fenced code, block quotes,
// rules, links, images, **bold**, *italic*, `code` and <kbd>. Everything is
// HTML-escaped first; the only raw HTML let through is <kbd>…</kbd>, and links
// go through a resolver that decides what an href becomes (or drops it).

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export interface Rendered {
  html: string;
  headings: Heading[];
}

export interface MarkdownOptions {
  /** Turn a link target into attributes for <a> (e.g. href and data-*), or null to render the text alone. */
  link?(href: string): Record<string, string> | null;
  /** Turn an image source into a URL, or null to drop the image. */
  image?(src: string): string | null;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Only plain, harmless targets: web links, mail, in-page anchors and relative paths. */
export function safeUrl(href: string): boolean {
  return /^(https?:\/\/|mailto:|#|\.{0,2}\/|[\w.-]+(?:[/#?]|$))/i.test(href) && !/^\s*(javascript|data|vbscript):/i.test(href);
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/&[a-z#0-9]+;/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section'
  );
}

function attrs(a: Record<string, string>): string {
  return Object.entries(a)
    .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
    .join('');
}

export function renderInline(text: string, opts: MarkdownOptions = {}): string {
  // protect code spans first: nothing inside them is formatted
  const codes: string[] = [];
  let s = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _t, code: string) => {
    codes.push(`<code>${escapeHtml(code.trim())}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  s = s.replace(/&lt;kbd&gt;([\s\S]*?)&lt;\/kbd&gt;/g, '<kbd>$1</kbd>');
  const unesc = (u: string) => u.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => {
    const url = unesc(src);
    const out = safeUrl(url) ? (opts.image ? opts.image(url) : url) : null;
    return out ? `<img${attrs({ src: out, alt: unesc(alt) })}>` : alt;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
    const url = unesc(href);
    if (!safeUrl(url)) return label;
    const a = opts.link ? opts.link(url) : { href: url };
    return a ? `<a${attrs(a)}>${label}</a>` : label;
  });
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)]);
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const isBlank = (l: string) => !l.trim();

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  // pipes inside code spans don't split cells
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '`') inCode = !inCode;
    if (c === '\\' && t[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

export function renderMarkdown(src: string, opts: MarkdownOptions = {}): Rendered {
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const uniqueId = (text: string) => {
    const base = slugify(text);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
  const inline = (t: string) => renderInline(t, opts);

  const blockStart = (l: string) =>
    /^\s*```/.test(l) || /^#{1,6}\s/.test(l) || /^>/.test(l) || /^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || LIST_ITEM.test(l);

  function blocks(lines: string[]): string {
    const out: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) {
        i++;
        continue;
      }
      const fence = line.match(/^\s*```\s*([\w-]*)/);
      if (fence) {
        const body: string[] = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
        i++;
        out.push(`<pre><code${fence[1] ? ` class="lang-${escapeHtml(fence[1])}"` : ''}>${escapeHtml(body.join('\n'))}</code></pre>`);
        continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (h) {
        const level = h[1].length;
        const html = inline(h[2]);
        const text = html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        const id = uniqueId(text);
        headings.push({ level, text, id });
        out.push(`<h${level} id="${id}">${html}</h${level}>`);
        i++;
        continue;
      }
      if (/^(\s*)(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }
      if (line.includes('|') && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
        const head = splitRow(line);
        const align = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i].includes('|') && !isBlank(lines[i])) rows.push(splitRow(lines[i++]));
        const cell = (tag: string, c: string, j: number) => `<${tag}${align[j] ? ` style="text-align:${align[j]}"` : ''}>${inline(c)}</${tag}>`;
        out.push(
          `<div class="table"><table><thead><tr>${head.map((c, j) => cell('th', c, j)).join('')}</tr></thead><tbody>${rows
            .map((r) => `<tr>${head.map((_, j) => cell('td', r[j] ?? '', j)).join('')}</tr>`)
            .join('')}</tbody></table></div>`,
        );
        continue;
      }
      if (/^>/.test(line)) {
        const body: string[] = [];
        while (i < lines.length && /^>/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
        out.push(`<blockquote>${blocks(body)}</blockquote>`);
        continue;
      }
      if (LIST_ITEM.test(line)) {
        const [html, next] = list(lines, i);
        out.push(html);
        i = next;
        continue;
      }
      const para: string[] = [];
      while (i < lines.length && !isBlank(lines[i]) && !(para.length && blockStart(lines[i]))) para.push(lines[i++].trim());
      out.push(`<p>${inline(para.join(' '))}</p>`);
    }
    return out.join('\n');
  }

  /** A list starting at line i; items indented further nest. Returns [html, next line]. */
  function list(lines: string[], i: number): [string, number] {
    const first = lines[i].match(LIST_ITEM)!;
    const indent = first[1].length;
    const ordered = /\d/.test(first[2]);
    const items: string[] = [];
    while (i < lines.length) {
      const m = lines[i].match(LIST_ITEM);
      if (!m || m[1].length !== indent || /\d/.test(m[2]) !== ordered) break;
      const text = [m[3]];
      const nested: string[] = [];
      i++;
      while (i < lines.length && !isBlank(lines[i])) {
        const n = lines[i].match(LIST_ITEM);
        if (n && n[1].length <= indent) break;
        if (n) {
          const [html, next] = list(lines, i);
          nested.push(html);
          i = next;
          continue;
        }
        text.push(lines[i++].trim());
      }
      // a blank line followed by a deeper-indented line continues the item
      if (i + 1 < lines.length && isBlank(lines[i]) && LIST_ITEM.test(lines[i + 1]) && lines[i + 1].match(LIST_ITEM)![1].length === indent) i++;
      items.push(`<li>${inline(text.join(' '))}${nested.join('')}</li>`);
    }
    const tag = ordered ? 'ol' : 'ul';
    return [`<${tag}>${items.join('')}</${tag}>`, i];
  }

  const html = blocks(src.replace(/\r\n?/g, '\n').split('\n'));
  return { html, headings };
}
