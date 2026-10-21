// Renders docs/gener8.ecore as a class diagram: docs/gener8-model.svg.
//   npm run model-svg [in.ecore] [out.svg]
// No dependencies: a small XML reader for the subset Ecore files use, a tree
// layout for inheritance (the SceneObject hierarchy along the bottom, smaller
// classes above, each near what refers to it) and curved reference edges.
// Hovering a class shows its documentation.

import { readFileSync, writeFileSync } from 'node:fs';

// ---------- XML ----------

interface El {
  name: string;
  attrs: Record<string, string>;
  children: El[];
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unescape = (s: string) => s.replace(/&(lt|gt|amp|quot|apos);/g, (_, e: string) => ENTITIES[e]);

function parseXml(src: string): El {
  const root: El = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const tag = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  for (const m of src.matchAll(tag)) {
    if (!m[2]) continue;
    if (m[1]) {
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = unescape(a[2]);
    const el: El = { name: m[2], attrs, children: [] };
    stack[stack.length - 1].children.push(el);
    if (!m[4]) stack.push(el);
  }
  return root.children[0];
}

// ---------- model ----------

interface Feature {
  name: string;
  type: string;
  ref: boolean;
  containment: boolean;
  lower: number;
  upper: number;
  def?: string;
  range?: string;
}

interface Classifier {
  name: string;
  kind: 'class' | 'enum';
  abstract: boolean;
  supers: string[];
  features: Feature[];
  literals: string[];
  doc: string;
  json?: string;
}

const TYPE_NAMES: Record<string, string> = { EDouble: 'double', EInt: 'int', EString: 'string', EBoolean: 'bool', ELong: 'long' };
const typeName = (t = '') => {
  const n = t.slice(t.lastIndexOf('/') + 1);
  return TYPE_NAMES[n] ?? n;
};
const annot = (el: El, source: string) => el.children.find((c) => c.name === 'eAnnotations' && c.attrs.source === source);
const detail = (a: El | undefined, key: string) => a?.children.find((d) => d.attrs.key === key)?.attrs.value;

function readModel(pkg: El): Classifier[] {
  return pkg.children
    .filter((c) => c.name === 'eClassifiers')
    .map((c): Classifier => {
      const kind = c.attrs['xsi:type'] === 'ecore:EEnum' ? 'enum' : 'class';
      const features = c.children
        .filter((f) => f.name === 'eStructuralFeatures')
        .map((f): Feature => {
          const r = annot(f, 'http://gener8.app/ecore/range');
          const lo = detail(r, 'min');
          const hi = detail(r, 'max');
          const unit = detail(r, 'unit');
          return {
            name: f.attrs.name,
            type: typeName(f.attrs.eType),
            ref: f.attrs['xsi:type'] === 'ecore:EReference',
            containment: f.attrs.containment === 'true',
            lower: Number(f.attrs.lowerBound ?? 0),
            upper: Number(f.attrs.upperBound ?? 1),
            def: f.attrs.defaultValueLiteral,
            range: lo !== undefined && hi !== undefined ? `${lo}..${hi}${unit ? ' ' + unit : ''}` : undefined,
          };
        });
      return {
        name: c.attrs.name,
        kind,
        abstract: c.attrs.abstract === 'true',
        supers: (c.attrs.eSuperTypes ?? '').split(/\s+/).filter(Boolean).map((s) => s.replace('#//', '')),
        features,
        literals: c.children.filter((l) => l.name === 'eLiterals').map((l) => l.attrs.literal ?? l.attrs.name),
        doc: detail(annot(c, 'http://www.eclipse.org/emf/2002/GenModel'), 'documentation') ?? '',
        json: detail(annot(c, 'http://gener8.app/ecore/json'), 'type'),
      };
    });
}

// ---------- boxes ----------

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const CHAR = 6.7; // 11px monospace advance
const LINE = 15;
const HEAD = 36;
const PADX = 10;
const GAPX = 22;
const GAPY = 64;

const C = {
  bg: '#11161c',
  box: '#1b232d',
  head: '#222c38',
  stroke: '#9aa7b8',
  text: '#e3e8ef',
  dim: '#93a0b0',
  faint: '#5d6a7a',
};

/** Accent by ancestry, matching the app's role colours. */
const ACCENTS: [string, string][] = [
  ['GeneratorField', '#f0a830'],
  ['TransformerField', '#3cc8b4'],
  ['FxField', '#9a7cf0'],
  ['MapField', '#96b0cc'],
  ['Sound', '#f3e9d8'],
  ['PositionMotion', '#c9b6e4'],
  ['Motion', '#c9b6e4'],
  ['BreatheMotion', '#c9b6e4'],
  ['RippleSettings', '#f3e9d8'],
  ['Axis', '#96b0cc'],
];

interface Box {
  c: Classifier;
  lines: { text: string; dim?: boolean }[];
  w: number;
  h: number;
  x: number;
  y: number;
  accent: string;
}

function makeBox(c: Classifier, byName: Map<string, Classifier>): Box {
  const lines: Box['lines'] = [];
  if (c.kind === 'enum') for (const l of c.literals) lines.push({ text: l });
  for (const f of c.features) {
    if (f.ref) continue;
    let t = `${f.name}: ${f.type}`;
    if (f.def !== undefined) t += ` = ${f.def}`;
    if (f.range) lines.push({ text: t + `  [${f.range}]` });
    else lines.push({ text: t });
  }
  const stereo = c.kind === 'enum' ? '«enumeration»' : c.abstract ? '«abstract»' : c.json ? `"${c.json}"` : '';
  const w = Math.max(c.name.length * (CHAR + 0.8), stereo.length * CHAR, ...lines.map((l) => l.text.length * CHAR)) + 2 * PADX;
  const h = HEAD + (lines.length ? lines.length * LINE + 8 : 4);
  let accent = C.stroke;
  const chain = (n: string, seen = new Set<string>()): string[] => {
    if (seen.has(n)) return [];
    seen.add(n);
    return [n, ...(byName.get(n)?.supers ?? []).flatMap((s) => chain(s, seen))];
  };
  const anc = chain(c.name);
  for (const [n, col] of ACCENTS)
    if (anc.includes(n)) {
      accent = col;
      break;
    }
  return { c, lines, w: Math.ceil(w), h, x: 0, y: 0, accent };
}

// ---------- layout ----------

interface Tree {
  root: Box;
  kids: Map<Box, Box[]>;
  w: number;
  h: number;
  /** Layout relative to (0, 0); shifted when placed. */
  place(dx: number, dy: number): void;
}

function layoutTree(root: Box, kidsOf: (b: Box) => Box[]): Tree {
  const kids = new Map<Box, Box[]>();
  const depthH: number[] = [];
  const walk = (b: Box, d: number) => {
    depthH[d] = Math.max(depthH[d] ?? 0, b.h);
    const ks = kidsOf(b);
    kids.set(b, ks);
    ks.forEach((k) => walk(k, d + 1));
  };
  walk(root, 0);
  const depthY: number[] = [];
  depthH.reduce((y, h, d) => ((depthY[d] = y), y + h + GAPY), 0);
  // leaves left to right; a parent sits centred over its children
  let cursor = 0;
  const pos = (b: Box, d: number): void => {
    const ks = kids.get(b)!;
    b.y = depthY[d];
    if (!ks.length) {
      b.x = cursor;
      cursor += b.w + GAPX;
      return;
    }
    const start = cursor;
    ks.forEach((k) => pos(k, d + 1));
    const first = ks[0];
    const last = ks[ks.length - 1];
    const centre = (first.x + last.x + last.w) / 2;
    b.x = Math.max(start, centre - b.w / 2);
    // a parent wider than its children pushes the next subtree along
    cursor = Math.max(cursor, b.x + b.w + GAPX);
  };
  pos(root, 0);
  const all = [...kids.keys()];
  const w = Math.max(...all.map((b) => b.x + b.w));
  const h = Math.max(...all.map((b) => b.y + b.h));
  return {
    root,
    kids,
    w,
    h,
    place(dx, dy) {
      for (const b of all) {
        b.x += dx;
        b.y += dy;
      }
    },
  };
}

// ---------- svg ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n: number) => Math.round(n * 10) / 10;
const mult = (f: Feature) => (f.upper === -1 ? (f.lower ? `${f.lower}..*` : '*') : f.lower === f.upper ? `${f.lower}` : `${f.lower}..${f.upper}`);

function render(model: Classifier[]): string {
  const byName = new Map(model.map((c) => [c.name, c]));
  const boxes = new Map(model.map((c) => [c.name, makeBox(c, byName)]));
  const box = (n: string) => boxes.get(n)!;
  // single inheritance is all the model uses; the first supertype is the tree parent
  const kidsOf = (b: Box) => model.filter((c) => c.supers[0] === b.c.name).map((c) => box(c.name));
  const roots = model.filter((c) => !c.supers.length || !byName.has(c.supers[0])).map((c) => box(c.name));
  const trees = roots.map((r) => layoutTree(r, kidsOf));
  const treeOf = new Map<Box, Tree>();
  for (const t of trees) for (const b of t.kids.keys()) treeOf.set(b, t);

  // the biggest tree is the bottom band; the rest go above, near what they relate to
  const main = trees.reduce((a, b) => (b.kids.size > a.kids.size ? b : a));
  const others = trees.filter((t) => t !== main);
  const topH = Math.max(...others.map((t) => t.h));
  const TITLE = 54;
  main.place(0, TITLE + topH + 110);

  const related = (a: Box, b: Box) =>
    a.c.features.some((f) => f.type === b.c.name) || b.c.features.some((f) => f.type === a.c.name);
  const desired = new Map<Tree, number>();
  const centre = (b: Box) => b.x + b.w / 2;
  for (let pass = 0; pass < 3; pass++) {
    for (const t of others) {
      const xs: number[] = [];
      for (const b of t.kids.keys())
        for (const o of boxes.values()) {
          const ot = treeOf.get(o)!;
          if (ot === t || !related(b, o)) continue;
          if (ot === main) xs.push(centre(o));
          else if (desired.has(ot)) xs.push(desired.get(ot)!);
        }
      if (xs.length) desired.set(t, xs.reduce((a, b) => a + b, 0) / xs.length);
    }
  }
  const sorted = others.slice().sort((a, b) => (desired.get(a) ?? 0) - (desired.get(b) ?? 0) || a.root.c.name.localeCompare(b.root.c.name));
  // keep related small trees side by side: each one pulls in what it relates to, depth first
  const treesRelated = (a: Tree, b: Tree) => [...a.kids.keys()].some((x) => [...b.kids.keys()].some((y) => related(x, y)));
  const order: Tree[] = [];
  const visit = (t: Tree) => {
    if (order.includes(t)) return;
    order.push(t);
    for (const u of sorted) if (treesRelated(t, u)) visit(u);
  };
  for (const t of sorted) visit(t);
  let right = 0;
  for (const t of order) {
    const want = (desired.get(t) ?? 0) - t.w / 2;
    const x = Math.max(right, want);
    t.place(x, TITLE);
    right = x + t.w + 40;
  }
  // centre the top band over the bottom one if it ends up narrower
  const all = [...boxes.values()];
  const W = Math.ceil(Math.max(...all.map((b) => b.x + b.w)));
  const H = Math.ceil(Math.max(...all.map((b) => b.y + b.h)));

  const out: string[] = [];
  const M = 32;
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W + 2 * M}" height="${H + 2 * M}" viewBox="0 0 ${W + 2 * M} ${H + 2 * M}" font-family="${FONT}">`);
  out.push(`<defs>
<marker id="m-triangle" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1.5L11 6L1 10.5z" fill="${C.box}" stroke="${C.stroke}" stroke-width="1.3" stroke-linejoin="round"/></marker>
<marker id="m-diamond" viewBox="0 0 16 10" refX="0.5" refY="5" markerWidth="16" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M.5 5L8 .8L15.5 5L8 9.2z" fill="${C.stroke}" stroke="${C.stroke}" stroke-width="1" stroke-linejoin="round"/></marker>
<marker id="m-arrow" viewBox="0 0 11 10" refX="10" refY="5" markerWidth="11" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1L10 5L1 9" fill="none" stroke="${C.stroke}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></marker>
<marker id="m-arrowMuted" viewBox="0 0 11 10" refX="10" refY="5" markerWidth="11" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1L10 5L1 9" fill="none" stroke="${C.dim}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></marker>
</defs>`);
  out.push(`<rect width="${W + 2 * M}" height="${H + 2 * M}" fill="${C.bg}"/>`);
  out.push(`<g transform="translate(${M} ${M})">`);
  out.push(`<text x="0" y="18" font-size="18" font-weight="600" fill="${C.text}">GENER8 patch metamodel</text>`);
  out.push(
    `<text x="0" y="38" font-size="11" fill="${C.dim}">generated from docs/gener8.ecore by npm run model-svg · ◆ contains · → refers to · ⇢ enum type · ▷ inherits · hover a class for its notes</text>`,
  );

  // inheritance: a bus under each parent
  const inherit: string[] = [];
  for (const t of trees)
    for (const [p, ks] of t.kids) {
      if (!ks.length) continue;
      const busY = r1(p.y + p.h + GAPY / 2);
      const px = r1(centre(p));
      for (const k of ks) inherit.push(`<path d="M${r1(centre(k))} ${k.y}V${busY}H${px}" fill="none" stroke="${C.stroke}" stroke-width="1"/>`);
      inherit.push(`<path d="M${px} ${busY}V${p.y + p.h}" fill="none" stroke="${C.stroke}" stroke-width="1" marker-end="url(#m-triangle)"/>`);
    }

  // references and enum-typed attributes
  const edges: string[] = [];
  const outCount = new Map<Box, number>();
  const outIndex = new Map<Box, number>();
  const refList: { from: Box; to: Box; f: Feature }[] = [];
  for (const from of boxes.values())
    for (const f of from.c.features) {
      const to = boxes.get(f.type);
      if (!to) continue;
      refList.push({ from, to, f });
      outCount.set(from, (outCount.get(from) ?? 0) + 1);
    }
  for (const { from, to, f } of refList) {
    const i = outIndex.get(from) ?? 0;
    outIndex.set(from, i + 1);
    const n = outCount.get(from)!;
    const style = !f.ref
      ? `stroke="${C.dim}" stroke-dasharray="4 4" marker-end="url(#m-arrowMuted)"`
      : `stroke="${C.stroke}"${f.containment ? ' marker-start="url(#m-diamond)"' : ''} marker-end="url(#m-arrow)"`;
    const label = f.ref ? `${f.name} ${mult(f)}` : f.name;
    if (from === to) {
      // self reference: a loop off the right side
      const x = from.x + from.w;
      const y = from.y + 18;
      edges.push(`<path d="M${x} ${y}c40 0 40 30 0 30" fill="none" ${style}/>`);
      edges.push(`<text x="${x + 36}" y="${y + 18}" font-size="10" fill="${C.dim}">${esc(label)}</text>`);
      continue;
    }
    const sx = r1(from.x + (from.w * (i + 1)) / (n + 1));
    let d: string;
    let lx: number;
    let ly: number;
    if (to.y + to.h < from.y) {
      const sy = from.y;
      const tx = r1(centre(to));
      const ty = to.y + to.h;
      const k = Math.max(40, (sy - ty) / 2);
      d = `M${sx} ${sy}C${sx} ${r1(sy - k)} ${tx} ${r1(ty + k)} ${tx} ${ty}`;
      lx = sx + 4;
      ly = sy - 8 - (i % 2) * 11;
    } else if (to.y > from.y + from.h) {
      const sy = from.y + from.h;
      const tx = r1(centre(to));
      const ty = to.y;
      const k = Math.max(40, (ty - sy) / 2);
      d = `M${sx} ${sy}C${sx} ${r1(sy + k)} ${tx} ${r1(ty - k)} ${tx} ${ty}`;
      lx = sx + 4;
      ly = sy + 14;
    } else {
      // side by side in the same band: arch over the top of both, clear of the inheritance lines
      const tx = r1(centre(to) + (centre(to) > centre(from) ? -6 : 6) * (i % 3));
      const top = Math.min(from.y, to.y);
      const lift = 26 + Math.min(60, Math.abs(tx - sx) / 12);
      d = `M${sx} ${from.y}C${sx} ${r1(top - lift)} ${tx} ${r1(top - lift)} ${tx} ${to.y}`;
      lx = sx + 4;
      ly = from.y - 6 - (i % 2) * 11;
    }
    edges.push(`<path d="${d}" fill="none" stroke-width="1" ${style}/>`);
    edges.push(`<text x="${r1(lx)}" y="${r1(ly)}" font-size="10" fill="${C.dim}">${esc(label)}</text>`);
  }

  out.push(`<g>${inherit.join('')}</g>`);
  out.push(`<g>${edges.join('')}</g>`);

  for (const b of boxes.values()) {
    const c = b.c;
    const stereo = c.kind === 'enum' ? '«enumeration»' : c.abstract ? '«abstract»' : c.json ? `"${c.json}"` : '';
    const g: string[] = [];
    g.push(`<g>${c.doc ? `<title>${esc(c.name + ': ' + c.doc)}</title>` : ''}`);
    g.push(`<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${b.w}" height="${b.h}" rx="5" fill="${C.box}" stroke="${C.stroke}" stroke-width="1"/>`);
    g.push(`<path d="M${r1(b.x)} ${r1(b.y + HEAD)}h${b.w}" stroke="${C.faint}" stroke-width="1"/>`);
    g.push(`<rect x="${r1(b.x + 0.5)}" y="${r1(b.y + 0.5)}" width="${b.w - 1}" height="3" rx="1.5" fill="${b.accent}"/>`);
    g.push(
      `<text x="${r1(b.x + b.w / 2)}" y="${r1(b.y + 19)}" text-anchor="middle" font-size="12" font-weight="600"${c.abstract ? ' font-style="italic"' : ''} fill="${C.text}">${esc(c.name)}</text>`,
    );
    if (stereo) g.push(`<text x="${r1(b.x + b.w / 2)}" y="${r1(b.y + 31)}" text-anchor="middle" font-size="10" fill="${C.dim}">${esc(stereo)}</text>`);
    b.lines.forEach((l, i) => g.push(`<text x="${r1(b.x + PADX)}" y="${r1(b.y + HEAD + 15 + i * LINE)}" font-size="11" fill="${l.dim ? C.dim : C.text}">${esc(l.text)}</text>`));
    g.push('</g>');
    out.push(g.join(''));
  }
  out.push('</g>');
  out.push('</svg>');
  return out.join('\n') + '\n';
}

const [inPath = 'docs/gener8.ecore', outPath = 'docs/gener8-model.svg'] = process.argv.slice(2);
const model = readModel(parseXml(readFileSync(inPath, 'utf8')));
writeFileSync(outPath, render(model));
console.log(`wrote ${outPath} (${model.length} classifiers)`);
