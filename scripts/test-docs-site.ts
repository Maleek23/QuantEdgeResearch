/**
 * Public docs contract.   npm run test:docs-site
 *
 *   1. every module (and every product name in the nav) has a field-guide page,
 *      and every field guide carries the disclaimer and a Layer · Comes from · What you see table;
 *   2. every docs route resolves: App.tsx declares the three /docs routes, the
 *      server answers 200 for each page, and each page is an indexable public route in the sitemap;
 *   3. search finds every glossary term (by its term and its key) and every module;
 *   4. markdown export round-trips titles and tables; SEO lengths hold;
 *   5. no performance claims: no "% win rate"/"win rate of N" style numbers in the copy.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOSSARY } from '../shared/glossary';
import { DOCS_PAGE_META } from '../shared/public-seo';
import {
  DOC_MODULES, DOC_PAGES, buildSearchIndex, docRoutes, getPage, pageToMarkdown, searchDocs,
} from '../shared/docs';
import { PUBLIC_ROUTES, seoStatusFor } from '../server/seo-metadata';
import { generateSitemap } from '../server/sitemap-generator';

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0; const fails: string[] = [];
const ok = (cond: unknown, msg: string) => { if (cond) pass++; else fails.push(msg); };

// 1. coverage
const REQUIRED = ['NEXUS', 'Zero', 'Gravity', 'Current', 'Trajectory', 'Envelope', 'Horizon', 'Ledger', 'Tripwire', 'Quantinum', 'Quantinum Bot', 'Academy'];
for (const name of REQUIRED) ok(DOC_MODULES.some((m) => m.name === name), `no docs module named ${name}`);
for (const m of DOC_MODULES) {
  const guide = getPage(m.id);
  ok(guide && guide.section === 'field-guide', `${m.id}: no field guide at /docs/${m.id}`);
  if (m.id === 'platform' || !guide) continue;
  ok(guide.blocks.some((b) => b.t === 'disclaimer'), `${m.id}: field guide has no disclaimer`);
  ok(guide.blocks.some((b) => b.t === 'table' && b.head.join('|') === 'Layer|Comes from|What you see'), `${m.id}: no Layer · Comes from · What you see table`);
  ok(DOC_PAGES.some((p) => p.module === m.id && p.section === 'reference'), `${m.id}: no reference page`);
}
const keys = DOC_PAGES.map((p) => `${p.module}/${p.slug}`);
ok(new Set(keys).size === keys.length, 'duplicate docs page');
for (const p of DOC_PAGES) ok(DOC_MODULES.some((m) => m.id === p.module), `${p.module}/${p.slug}: unknown module`);

// 2. routes
const app = readFileSync(resolve(here, '../client/src/App.tsx'), 'utf8');
for (const r of ['/docs', '/docs/:module', '/docs/:module/:page']) ok(app.includes(`path="${r}"`), `App.tsx missing <Route path="${r}">`);
const sitemap = generateSitemap();
ok(seoStatusFor('/docs') === 200 && PUBLIC_ROUTES['/docs'], '/docs is not a public 200');
ok(sitemap.includes('https://quantedgelabs.net/docs</loc>'), '/docs not in sitemap');
for (const { path } of docRoutes()) {
  ok(seoStatusFor(path) === 200, `${path} is not a 200`);
  ok(PUBLIC_ROUTES[path] && PUBLIC_ROUTES[path].index !== false, `${path} is not an indexable public route`);
  ok(sitemap.includes(`https://quantedgelabs.net${path}</loc>`), `${path} missing from sitemap`);
  const meta = DOCS_PAGE_META[path];
  ok(meta && meta.title.length <= 60 && meta.description.length <= 155, `${path}: SEO title/description too long`);
}
// in-content links point at real docs pages
const known = new Set(['/docs', ...docRoutes().map((r) => r.path)]);
for (const p of DOC_PAGES) {
  const md = pageToMarkdown(p, '');
  for (const m of md.matchAll(/\]\((\/docs[^)#]*)/g)) ok(known.has(m[1]), `${p.module}/${p.slug}: broken docs link ${m[1]}`);
}

// 3. search
const idx = buildSearchIndex();
for (const [key, e] of Object.entries(GLOSSARY)) {
  const term = (e as { term: string }).term;
  ok(searchDocs(idx, term).some((d) => d.kind === 'term' && d.title === term), `search "${term}" does not find the glossary term`);
  ok(searchDocs(idx, key).some((d) => d.kind === 'term' && d.title === term), `search "${key}" does not find the glossary term`);
}
for (const m of DOC_MODULES) ok(searchDocs(idx, m.name).some((d) => d.href.startsWith(`/docs/${m.id}`)), `search "${m.name}" does not find its module`);
ok(searchDocs(idx, 'zero gamma flip').length > 0, 'search "zero gamma flip" finds nothing');
ok(searchDocs(idx, 'qwxzv').length === 0, 'nonsense query returns results');

// 4. markdown
const g = getPage('gravity')!;
const md = pageToMarkdown(g);
ok(md.startsWith('# Gravity field guide'), 'markdown does not start with the H1');
ok(md.includes('| Layer | Comes from | What you see |'), 'markdown lost the reference table');
ok(md.includes('https://quantedgelabs.net/docs/gravity'), 'markdown has no source link');
ok(pageToMarkdown(getPage('platform', 'glossary')!).includes('Call wall'), 'glossary markdown is empty');

// 5. no performance numbers in copy
for (const p of DOC_PAGES) {
  const text = pageToMarkdown(p, '');
  ok(!/\d+(\.\d+)?\s*%\s*(win|hit|success)/i.test(text) && !/win rate (of|is|was)\s*\d/i.test(text), `${p.module}/${p.slug}: looks like a performance claim`);
}

console.log(`docs-site: ${pass} passed, ${fails.length} failed (${DOC_PAGES.length} pages, ${DOC_MODULES.length} modules, ${idx.length} search entries)`);
if (fails.length) { for (const f of fails) console.error(`  FAIL ${f}`); process.exit(1); }
