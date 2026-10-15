/**
 * Proof page — Path calibration aggregation (withheld below min days,
 * "collecting since"), SEO/sitemap/footer/route wiring, and a no-hardcoded-
 * numbers guard on the page source.
 *   npm run test:proof-page
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aggregateCalibration, CALIBRATION_MIN_DAYS, type DayScore } from '../server/path-calibration';
import { PUBLIC_ROUTES, seoStatusFor } from '../server/seo-metadata';
import { generateSitemap } from '../server/sitemap-generator';
import { PUBLIC_PAGE_META } from '../shared/public-seo';
import { flagOn } from '../shared/feature-flags';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };
const NOW = '2026-10-15T12:00:00Z';

const none = aggregateCalibration([], [], NOW);
eq(none.status, 'none', 'no snapshots → none'); eq(none.since, null, 'no since date'); eq(none.in50, null, 'no rate');

const few: DayScore[] = Array.from({ length: 5 }, (_, i) => ({ symbol: 'SPY', date: `2026-10-0${i + 1}`, n: 70, in50: 0.5, in80: 0.8 }));
const c1 = aggregateCalibration(few, ['2026-09-30', ...few.map((d) => d.date)], NOW);
eq(c1.status, 'collecting', 'below min days → collecting'); eq(c1.since, '2026-09-30', 'collecting since earliest snapshot');
eq(c1.in50, null, 'rate withheld'); eq(c1.scoredDays, 5, 'scored count shown');

const many: DayScore[] = Array.from({ length: CALIBRATION_MIN_DAYS }, (_, i) => ({ symbol: i % 2 ? 'QQQ' : 'SPY', date: `2026-09-${String(i + 1).padStart(2, '0')}`, n: 70, in50: i % 2 ? 0.4 : 0.6, in80: 0.8 }));
const c2 = aggregateCalibration([...many, { symbol: 'SPY', date: '2026-09-30', n: 0, in50: null, in80: null }], many.map((d) => d.date), NOW);
eq(c2.status, 'ready', 'ready at min days');
ok(Math.abs(c2.in50! - 0.5) < 1e-9 && Math.abs(c2.in80! - 0.8) < 1e-9, 'mean coverage');
eq(c2.scoredDays, CALIBRATION_MIN_DAYS, 'empty day not counted');
eq(c2.through, `2026-09-${String(CALIBRATION_MIN_DAYS).padStart(2, '0')}`, 'through date');

// SEO, sitemap, footer, route
const meta = PUBLIC_PAGE_META['/proof'];
ok(meta && meta.title.length <= 60 && meta.description.length <= 155, 'meta within limits');
ok(PUBLIC_ROUTES['/proof'] && seoStatusFor('/proof') === 200, 'public 200 route');
ok(generateSitemap([]).includes('/proof</loc>'), 'in sitemap');
ok(fs.readFileSync('client/src/components/landing/public-nav.tsx', 'utf8').includes('href="/proof"'), 'footer Proof column links /proof');
const app = fs.readFileSync('client/src/App.tsx', 'utf8');
ok(app.includes('path="/proof"') && /publicPages = \[[^\]]*'\/proof'/.test(app), 'route + public shell');
ok(fs.readFileSync('server/routes.ts', 'utf8').includes('/api/public/path-calibration'), 'calibration endpoint');

// page honesty guards
const src = fs.readFileSync('client/src/pages/proof.tsx', 'utf8');
const jsx = src.replace(/\/\*\*[\s\S]*?\*\//, '');
ok(!/\b\d{2}(\.\d)?%/.test(jsx.replace(/target ≈ \d+%|50% fan|80% fan/g, '')), 'no hard-coded percentages');
ok(src.includes("'Withheld'") && src.includes('Collecting since'), 'withheld + collecting copy');
ok(/26 Aug 2026/.test(src), 'baseline stated');
ok(flagOn('PROOF_PAGE') && !flagOn('PROOF_PAGE', { env: { FLAG_PROOF_PAGE: 'off' } }), 'flag');
console.log(`test-proof-page: ${n} checks passed`);
