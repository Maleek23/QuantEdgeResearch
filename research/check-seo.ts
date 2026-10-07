/**
 * SEO hygiene check.
 *
 *   npx tsx research/check-seo.ts
 *
 * Asserts:
 *   1. every public page title ≤ 60 chars and description ≤ 155 (shared/public-seo.ts);
 *   2. every <Route path> in client/src/App.tsx gets HTTP 200 from the server
 *      (server/seo-metadata.ts seoStatusFor) — a Route missing there would 404;
 *   3. an unknown path gets 404, noindex and no canonical;
 *   4. every sitemap URL is a 200, indexable public page with a <lastmod>;
 *   5. robots.txt has a single `User-agent: *` group (a per-bot group overrides
 *      it) and disallows nothing the sitemap lists;
 *   6. JSON-LD on `/` parses and includes Organization, WebSite, Person,
 *      SoftwareApplication and a FAQPage with one Question per landing FAQ item.
 * Exits 1 on any failure.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_PAGE_META } from '../shared/public-seo';
import { LANDING_FAQ } from '../shared/landing-faq';
import { PUBLIC_ROUTES, injectServerSeo, seoStatusFor } from '../server/seo-metadata';
import { generateRobotsTxt, generateSitemap } from '../server/sitemap-generator';

const here = dirname(fileURLToPath(import.meta.url));
const failures: string[] = [];
const fail = (m: string) => failures.push(m);

// 1. lengths
for (const [path, { title, description }] of Object.entries(PUBLIC_PAGE_META)) {
  if (title.length > 60) fail(`${path}: title ${title.length} chars > 60`);
  if (description.length > 155) fail(`${path}: description ${description.length} chars > 155`);
}
const titles = Object.values(PUBLIC_PAGE_META).map((m) => m.title);
if (new Set(titles).size !== titles.length) fail('duplicate public page titles');

// 2. App.tsx routes → 200
const appSrc = readFileSync(resolve(here, '../client/src/App.tsx'), 'utf8');
const routes = Array.from(appSrc.matchAll(/<Route\s+path="([^"]+)"/g)).map((m) => m[1]);
for (const r of routes) {
  // DEV-only harness routes (import.meta.env.DEV) never exist in production builds.
  if (r.startsWith('/dev/') || r === '/__harness') continue;
  const sample = r.replace(/:[^/]+/g, 'SAMPLE');
  if (seoStatusFor(sample) !== 200) fail(`App.tsx route ${r} would get HTTP 404 — add it to APP_ROUTE_PATTERNS in server/seo-metadata.ts`);
}

// 3. unknown path
const html = readFileSync(resolve(here, '../client/index.html'), 'utf8');
const unknown = '/definitely-not-a-page';
if (seoStatusFor(unknown) !== 404) fail('unknown path is not 404');
const unknownHtml = injectServerSeo(html, unknown);
if (!/<meta name="robots" content="noindex/.test(unknownHtml)) fail('unknown path is not noindex');
if (/rel="canonical"/.test(unknownHtml)) fail('unknown path carries a canonical');

// 4. sitemap
const sitemap = generateSitemap([{ slug: 'sample-post', updatedAt: '2026-09-30T00:00:00Z' }]);
const locs = Array.from(sitemap.matchAll(/<loc>https:\/\/quantedgelabs\.net([^<]*)<\/loc>/g)).map((m) => m[1]);
const entries = sitemap.split('<url>').slice(1);
if (entries.some((e) => !/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(e))) fail('sitemap entry without <lastmod>');
for (const loc of locs) {
  if (loc.startsWith('/blog/')) continue;
  if (seoStatusFor(loc) !== 200) fail(`sitemap ${loc} is not a 200`);
  if (PUBLIC_ROUTES[loc]?.index === false || !PUBLIC_ROUTES[loc]) fail(`sitemap ${loc} is not an indexable public page`);
}

// 5. robots
const robots = generateRobotsTxt();
const agents = robots.match(/^User-agent:.*$/gm) ?? [];
if (agents.length !== 1 || agents[0].trim() !== 'User-agent: *') fail(`robots.txt must have exactly one "User-agent: *" group, has: ${agents.join(' | ')}`);
const disallows = (robots.match(/^Disallow:\s*(\S+)/gm) ?? []).map((l) => l.replace(/^Disallow:\s*/, ''));
for (const loc of locs) {
  for (const d of disallows) if (loc.startsWith(d.replace(/\$$/, ''))) fail(`robots Disallow ${d} blocks sitemap URL ${loc}`);
}
if (!/^Sitemap: https:\/\/quantedgelabs\.net\/sitemap\.xml$/m.test(robots)) fail('robots.txt missing Sitemap line');

// 6. JSON-LD on /
const home = injectServerSeo(html, '/');
const blocks = Array.from(home.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g));
if (blocks.length !== 1) fail(`/ has ${blocks.length} JSON-LD blocks (want 1)`);
try {
  const graph = JSON.parse(blocks[0]?.[1] ?? '[]') as Array<Record<string, any>>;
  const types = graph.map((n) => n['@type']);
  for (const t of ['Organization', 'WebSite', 'Person', 'SoftwareApplication', 'FAQPage']) {
    if (!types.includes(t)) fail(`/ JSON-LD missing ${t}`);
  }
  const faq = graph.find((n) => n['@type'] === 'FAQPage');
  if (faq && faq.mainEntity.length !== LANDING_FAQ.length) fail('FAQPage question count != landing FAQ');
  const person = graph.find((n) => n['@type'] === 'Person');
  if (person?.name !== 'Abdulmalik Ajisegiri') fail('Person entity is not the founder');
} catch (e) {
  fail(`/ JSON-LD does not parse: ${(e as Error).message}`);
}

if (failures.length) {
  console.error(`SEO check: ${failures.length} FAIL`);
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`SEO check: 0 FAIL (${Object.keys(PUBLIC_PAGE_META).length} public pages, ${routes.length} app routes, ${locs.length} sitemap URLs)`);
