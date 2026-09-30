/**
 * Route-guard table (server/route-guards.ts) — security review 2026-09-30.
 *   npx tsx scripts/test-route-guards.ts
 */
import assert from 'node:assert/strict';
import { guardFor } from '../server/route-guards';

const op: Array<[string, string]> = [
  ['POST', '/api/executor/start'], ['POST', '/api/executor/stop'], ['POST', '/api/executor/rules'],
  ['POST', '/api/executor/execute/abc'], ['GET', '/api/executor/status'], ['GET', '/api/executor/trades'],
  ['GET', '/api/alpaca/account'], ['GET', '/api/alpaca/positions'],
  ['GET', '/api/portfolio/positions'], ['POST', '/api/portfolio/clear'], ['POST', '/api/portfolio/import/webull'],
  ['GET', '/api/picks/config'], ['POST', '/api/picks/config'],
  ['POST', '/api/notifications/sms/phone'], ['GET', '/api/notifications/sms/config'],
  ['POST', '/api/trade-ideas'], ['POST', '/api/trade-ideas/add'], ['POST', '/api/trade-ideas/from-chart'],
  ['DELETE', '/api/trade-ideas/0b7c1c9e-1111-2222-3333-444455556666'],
  ['PATCH', '/api/trade-ideas/abc/performance'], ['PATCH', '/api/trade-ideas/abc/promote'],
  ['GET', '/api/trade-ideas/debug/raw'], ['GET', '/api/audit/trade-ideas'],
  ['POST', '/api/annual-watchlist/send-discord'], ['DELETE', '/api/annual-watchlist/NVDA'],
  ['POST', '/api/chart-analysis/send-to-discord'], ['POST', '/api/btc/push-all'],
  ['POST', '/api/ml/retraining/update-outcome'], ['POST', '/api/ai/chat'], ['GET', '/api/ai/chat/history'],
  ['DELETE', '/api/ai/chat/history'], ['POST', '/api/quant/generate-ideas'], ['POST', '/api/market-data'],
  ['POST', '/api/futures-research/generate/ES'], ['POST', '/api/futures-research/generate-all'],
  ['POST', '/api/gex-scanner/run'], ['POST', '/api/detection/run'], ['DELETE', '/api/detection/alert/NVDA'],
  // Express routing is case-insensitive and ignores a trailing slash — so must the guard be.
  ['POST', '/API/Executor/Start'], ['POST', '/api/executor/start/'], ['post', '/api/portfolio/clear'],
  ['HEAD', '/api/alpaca/account'],
];
for (const [m, p] of op) assert.equal(guardFor(m, p), 'operator', `${m} ${p} is operator-only`);

const member: Array<[string, string]> = [
  ['GET', '/api/performance/export'],
  ['GET', '/api/trade-ideas/0b7c1c9e-1111-2222-3333-444455556666'],
  ['GET', '/api/trade-ideas/0b7c1c9e-1111-2222-3333-444455556666/audit'],
];
for (const [m, p] of member) assert.equal(guardFor(m, p), 'member', `${m} ${p} is member-only`);

const signedIn: Array<[string, string]> = [
  ['POST', '/api/alerts/relay'], ['POST', '/api/alerts/level'], ['DELETE', '/api/alerts/level/abc'],
  ['POST', '/api/trade-desk/ideas/from-contract-analysis'], ['POST', '/api/gex-scanner/scan-ticker'],
];
for (const [m, p] of signedIn) assert.equal(guardFor(m, p), 'signed-in', `${m} ${p} needs a session`);

// Untouched: public reads, auth flow, and routes that already carry their own middleware.
const open: Array<[string, string]> = [
  ['GET', '/api/health'], ['POST', '/api/auth/login'], ['GET', '/api/public/showcase'],
  ['GET', '/api/trade-ideas/best-setups'], ['GET', '/api/trade-ideas/news'], ['GET', '/api/trade-ideas'],
  ['GET', '/api/alerts/level'], ['GET', '/api/annual-watchlist'], ['GET', '/api/performance/stats'],
  ['GET', '/api/gex-scanner/latest'], ['POST', '/api/trade-ideas/abc/share-discord'],
  ['POST', '/api/executorx'], ['GET', '/api/alpacas'],
];
for (const [m, p] of open) assert.equal(guardFor(m, p), null, `${m} ${p} is not in the guard table`);

console.log(`route-guards: ${op.length + member.length + signedIn.length + open.length} checks passed`);
