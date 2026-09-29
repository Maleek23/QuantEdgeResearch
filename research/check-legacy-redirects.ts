/**
 * Redirect hygiene check (SR 11-7 T11 / F7.8).
 *
 *   npx tsx research/check-legacy-redirects.ts
 *
 * Asserts, for every row of client/src/lib/legacy-redirects.ts:
 *   1. its target resolves to a NON-legacy route in ONE hop (no chains in the table);
 *   2. that route is a live <Route path> in client/src/App.tsx (first-match
 *      semantics aside, a path with no Route would 404);
 *   3. resolveLegacyRedirect() preserves an incoming query param across the hop.
 * Exits 1 on any failure.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_REDIRECTS,
  resolveLegacyRedirect,
  resolveLegacyRedirectOnce,
} from '../client/src/lib/legacy-redirects';

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(resolve(here, '../client/src/App.tsx'), 'utf8');
const livePatterns = Array.from(appSrc.matchAll(/<Route\s+path="([^"]+)"/g))
  .map((m) => m[1])
  .map((p) => new RegExp('^' + p.split('/').map((s) => (s.startsWith(':') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '$'));
const isLive = (path: string) => livePatterns.some((re) => re.test(path));

const sample = (pattern: string) => pattern.replace(/:[^/]+/g, 'SAMPLE');
const failures: string[] = [];

for (const [source] of LEGACY_REDIRECTS) {
  const src = sample(source);
  const oneHop = resolveLegacyRedirectOnce(src);
  if (!oneHop) { failures.push(`${source}: does not resolve at all`); continue; }
  const targetPath = oneHop.split('?')[0];
  if (resolveLegacyRedirectOnce(targetPath) != null) {
    failures.push(`${source} → ${oneHop}: target is itself legacy (chain)`);
  }
  if (!isLive(targetPath)) {
    failures.push(`${source} → ${oneHop}: no live <Route> for ${targetPath}`);
  }
  const withQuery = resolveLegacyRedirect(src, '?utm_check=1');
  if (!withQuery || !withQuery.includes('utm_check=1')) {
    failures.push(`${source}: query param dropped (${withQuery})`);
  }
}

if (failures.length) {
  console.error(`✗ ${failures.length} legacy redirect problem(s):`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`✓ ${LEGACY_REDIRECTS.length} legacy redirects: each lands on a live route in one hop, query preserved.`);
