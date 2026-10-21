import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { renderInline, renderMarkdown, safeUrl } from '../src/ui/markdown.ts';

test('markdown: blocks', () => {
  const { html, headings } = renderMarkdown(
    [
      '# Title',
      '',
      'A *para* with **bold**,',
      'continued.',
      '',
      '## Same',
      '## Same',
      '',
      '- one',
      '- two',
      '  - nested',
      '',
      '1. first',
      '2. second',
      '',
      '| a | b |',
      '|---|:---:|',
      '| `x|y` | 2 |',
      '',
      '> quoted',
      '',
      '```sh',
      'npm <run>',
      '```',
      '',
      '---',
    ].join('\n'),
  );
  assert.deepEqual(
    headings.map((h) => [h.level, h.id]),
    [
      [1, 'title'],
      [2, 'same'],
      [2, 'same-1'],
    ],
  );
  assert.ok(html.includes('<p>A <em>para</em> with <strong>bold</strong>, continued.</p>'));
  assert.ok(html.includes('<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul>'));
  assert.ok(html.includes('<ol><li>first</li><li>second</li></ol>'));
  assert.ok(html.includes('<th style="text-align:center">b</th>'));
  assert.ok(html.includes('<td><code>x|y</code></td>'), 'pipes inside code stay in the cell');
  assert.ok(html.includes('<blockquote><p>quoted</p></blockquote>'));
  assert.ok(html.includes('<pre><code class="lang-sh">npm &lt;run&gt;</code></pre>'));
  assert.ok(html.includes('<hr>'));
});

test('markdown: escapes HTML and only lets <kbd> through', () => {
  const h = renderInline('<script>alert(1)</script> <img src=x onerror=y> <kbd>space</kbd> a & b');
  assert.ok(!h.includes('<script') && !h.includes('<img'));
  assert.ok(h.includes('<kbd>space</kbd>') && h.includes('a &amp; b'));
});

test('markdown: links go through the resolver and unsafe ones are dropped', () => {
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:x', 'data:text/html,x', 'vbscript:x']) {
    assert.equal(safeUrl(bad), false, bad);
    const h = renderInline(`[x](${bad})`);
    assert.ok(!h.includes('<a') && !h.includes('href'), h);
  }
  for (const ok of ['https://a.b/c', 'maps.md', 'maps.md#targets', '#here', './x.md', 'mailto:a@b.c']) assert.ok(safeUrl(ok), ok);
  assert.equal(renderInline('[t](https://a.b/?q="x")'), '<a href="https://a.b/?q=&quot;x&quot;">t</a>');
  assert.equal(renderInline('[t](maps.md)', { link: (h) => ({ href: '#docs/' + h, 'data-doc': 'maps' }) }), '<a href="#docs/maps.md" data-doc="maps">t</a>');
  assert.equal(renderInline('[t](x.md)', { link: () => null }), 't');
  assert.equal(renderInline('`**not bold**`'), '<code>**not bold**</code>');
  assert.equal(renderInline('snake_case_name stays'), 'snake_case_name stays');
});

// ---------- the guide itself ----------

const DIR = new URL('../docs/guide/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
const read = (f: string) => readFileSync(new URL(f, DIR), 'utf8');

test('every guide page is in the viewer, and the viewer only lists real pages', () => {
  const viewer = readFileSync(new URL('../src/ui/docs.ts', import.meta.url), 'utf8');
  const imported = [...viewer.matchAll(/docs\/guide\/([\w-]+\.md)\?raw/g)].map((m) => m[1]).sort();
  assert.deepEqual(imported, files.slice().sort());
});

test('every link between guide pages points at a page and heading that exist', () => {
  const ids = new Map(files.map((f) => [f, new Set(renderMarkdown(read(f)).headings.map((h) => h.id))]));
  for (const f of files) {
    const links: string[] = [];
    renderMarkdown(read(f), {
      link(href) {
        links.push(href);
        return { href };
      },
    });
    for (const href of links) {
      if (/^(https?:|mailto:)/.test(href)) continue;
      const m = href.match(/^(?:\.\/)?([\w-]+\.md)?(?:#([\w-]+))?$/);
      assert.ok(m, `${f}: odd link ${href}`);
      const page = m![1] ?? f;
      assert.ok(ids.has(page), `${f}: no page ${page}`);
      if (m![2]) assert.ok(ids.get(page)!.has(m![2]), `${f}: no heading #${m![2]} in ${page}`);
    }
  }
});

test('every image in the guide exists and the viewer can show it', () => {
  const viewer = readFileSync(new URL('../src/ui/docs.ts', import.meta.url), 'utf8');
  for (const f of files) {
    for (const [, src] of read(f).matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
      assert.ok(existsSync(new URL(src, DIR)), `${f}: no file ${src}`);
      const icon = src.startsWith('icons/') && viewer.includes("import.meta.glob('../../docs/guide/icons/*.svg'");
      assert.ok(icon || viewer.includes(`'${src}':`), `${f}: ${src} is not in the viewer's IMAGES`);
    }
  }
});

test('every sound and field type has a guide icon, and the guide shows it', async () => {
  const { soundTypes } = await import('../src/core/sounds/registry.ts');
  const { fieldTypes } = await import('../src/core/fields/registry.ts');
  const guide = files.map(read).join('\n');
  const want = [...Object.keys(soundTypes).map((id) => `sound-${id}`), ...Object.keys(fieldTypes).map((id) => `field-${id}`)];
  for (const name of want) {
    assert.ok(existsSync(new URL(`icons/${name}.svg`, DIR)), `no icons/${name}.svg · run npm run doc-icons`);
    assert.ok(guide.includes(`(icons/${name}.svg)`), `the guide doesn't show icons/${name}.svg`);
  }
});
