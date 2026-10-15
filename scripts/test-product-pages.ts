/**
 * Product pages contract.   npm run test:product-pages
 *
 *   1. every product named in the nav (nav-groups.ts) has a page, with a docs
 *      module that exists, a real app shot (RealFrame desk), pairs that resolve,
 *      and every template section filled;
 *   2. routes: App.tsx declares /product and /product/:slug; the server answers
 *      200 for each; each is an indexable public route in the sitemap; SEO lengths hold;
 *   3. no invented performance: no %, win-rate or P&L numbers in the copy, and the
 *      template reads proof only from /api/public/showcase or shows the Ledger text;
 *   4. the public nav: mega menu + phone sheet list every product, footer has six columns;
 *   5. docs gaps: /academy redirects to /how-to, and /how-to uses the product names.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTS, productBySlug } from '../shared/product/catalog';
import { PRODUCT_PAGE_META } from '../shared/public-seo';
import { DOC_MODULES } from '../shared/docs';
import { PUBLIC_ROUTES, seoStatusFor } from '../server/seo-metadata';
import { generateSitemap } from '../server/sitemap-generator';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, '..', p), 'utf8');
let pass = 0; const fails: string[] = [];
const ok = (cond: unknown, msg: string) => { if (cond) pass++; else fails.push(msg); };

// 1. coverage
const REQUIRED = ['NEXUS', '0DTE', 'GEX', 'Flow', 'Chart', 'Expected move', 'LEAPS & Swings', 'Quantinum', 'Quantinum Bot', 'Journal', 'Alerts'];
for (const n of REQUIRED) ok(PRODUCTS.some((p) => p.name === n), `no product page for ${n}`);
const navSrc = read('client/src/components/shell/nav-groups.ts');
for (const n of ['NEXUS', 'Chart', 'Flow', 'GEX', 'LEAPS & Swings', 'Quantinum Bot', 'Journal', 'Alerts']) ok(navSrc.includes(`'${n}'`), `nav-groups.ts no longer names ${n}`);
const frameSrc = read('client/src/components/landing/real-frame.tsx');
const slugs = PRODUCTS.map((p) => p.slug);
ok(new Set(slugs).size === slugs.length, 'duplicate product slug');
for (const p of PRODUCTS) {
  ok(DOC_MODULES.some((m) => m.id === p.docsModule), `${p.slug}: docs module ${p.docsModule} missing`);
  ok(new RegExp(`\\b${p.shot}: \\{ path:`).test(frameSrc), `${p.slug}: shot "${p.shot}" is not a RealFrame desk`);
  ok(p.oneLiner.length <= 60, `${p.slug}: one-liner > 60 chars`);
  ok(p.problem.body.length > 0 && p.steps.length >= 3 && p.capabilities.length >= 4 && p.features.length >= 2 && p.faq.length >= 3, `${p.slug}: a template section is thin or empty`);
  ok(p.pairsWith.length > 0 && p.pairsWith.every((s) => s !== p.slug && productBySlug(s)), `${p.slug}: pairsWith has an unknown or self slug`);
}

// 2. routes + SEO
const app = read('client/src/App.tsx');
ok(/<Route path="\/product\/:slug"/.test(app), 'App.tsx has no /product/:slug route');
ok(/<Route path="\/product"\s/.test(app), 'App.tsx has no /product route');
const sitemap = generateSitemap([]);
for (const path of ['/product', ...slugs.map((s) => `/product/${s}`)]) {
  ok(seoStatusFor(path) === 200, `${path}: server would not answer 200`);
  ok(!!PUBLIC_ROUTES[path], `${path}: not a public route`);
  ok(sitemap.includes(`https://quantedgelabs.net${path}</loc>`), `${path}: not in sitemap`);
  const m = PRODUCT_PAGE_META[path];
  ok(m && m.title.length <= 60 && m.description.length <= 155, `${path}: SEO title/description too long`);
}

// 3. no invented performance
const copy = JSON.stringify(PRODUCTS);
ok(!/\d+(\.\d+)?\s?%\s*(win|hit|accuracy|success)/i.test(copy), 'catalog states a win/hit-rate percentage');
ok(!/win rate of \d|\d+% of (trades|ideas)|returned \d|\+\$\d/i.test(copy), 'catalog states a performance figure');
const page = read('client/src/pages/product.tsx');
ok(page.includes("'Verified results live on Journal'") || page.includes('Verified results live on Journal'), 'template lacks the "Verified results live on Journal" fallback');
ok(page.includes('useShowcase'), 'template does not read the public showcase endpoint');
ok(/n=\{/.test(page), 'template shows a figure without its sample size');
ok(page.includes('ledgerAsOf') && page.includes('ago('), 'template shows a figure without its age stamp');
ok(page.includes('PRODUCT_DISCORD_URL') && read('shared/product/catalog.ts').includes('https://discord.gg/uBNgRqqgmS'), 'CTA lacks the Discord invite');
ok(page.includes('DISCLAIMER_TEXT'), 'template lacks the disclaimer');
ok(page.includes('<RealFrame'), 'product shot is not the real app (RealFrame)');

// 4. nav + footer
const nav = read('client/src/components/landing/public-nav.tsx');
ok(/PRODUCTS\.map/.test(nav) && nav.includes('pp-mega'), 'mega menu does not list PRODUCTS');
ok(nav.includes('pp-sheet-cta') && nav.includes('/signup'), 'phone sheet has no sticky Start CTA');
for (const col of ['Products', 'Platform', 'Proof', 'Learn', 'Company', 'Legal']) ok(nav.includes(`<nav aria-label="${col}">`), `footer has no ${col} column`);
ok(read('client/src/components/landing/landing-chrome.tsx').includes('<ProductsMenu />'), 'landing header has no Products menu');

// 5. docs gaps
ok(/<Route path="\/academy"><Redirect to="\/how-to" \/><\/Route>/.test(app), '/academy does not redirect to /how-to');
const howTo = read('client/src/pages/how-to.tsx');
for (const name of ['Journal', 'GEX', 'Flow', '0DTE', 'Alerts']) ok(howTo.includes(`title="${name}"`), `/how-to has no ${name} card`);

if (fails.length) { console.error(`product pages: ${fails.length} FAIL, ${pass} pass`); fails.forEach((f) => console.error('  FAIL', f)); process.exit(1); }
console.log(`product pages: ${pass} pass`);
