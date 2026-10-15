/**
 * Quantinum side panel — page context (shared/quantinum-panel.ts), push-back
 * prompt, the server's target parser accepting it, and the wiring in the
 * ⌘\ host + panel.
 *   npm run test:quantinum-panel
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pageAskTarget, pushBackPrompt, PUSHBACK_PREFIX } from '../shared/quantinum-panel';
import { parseAskTarget } from '../shared/quantinum-ai';
import { isToggleShortcut } from '../shared/quantinum-analyst';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };

const g = pageAskTarget('/t', '?tab=gex&sym=spy');
eq(g?.symbol, 'SPY', 'symbol from ?sym=');
eq(g?.page, '/t?tab=gex&sym=SPY', 'page keeps tab + symbol');
ok(g?.label?.includes('Gravity'), 'tab named with the product name');
eq(pageAskTarget('/r/nvda', '')?.kind, 'ticker', '/r/:sym → ticker');
eq(pageAskTarget('/r/nvda', '')?.symbol, 'NVDA', 'ticker symbol');
eq(pageAskTarget('/ask', '?sym=SPY'), null, 'no target on /ask itself');
eq(pageAskTarget('/alerts', '')?.symbol, null, 'page without a symbol still gives context');
eq(pageAskTarget('/t', '?sym=<script>')?.symbol, null, 'junk symbol rejected');
const parsed = parseAskTarget(pageAskTarget('/t', '?tab=flow&sym=QQQ'));
eq(parsed.page, '/t?tab=flow&sym=QQQ', 'server parser accepts the page');
eq(parsed.symbol, 'QQQ', 'server parser keeps the symbol');

const pb = pushBackPrompt('Where is the SPY Apex?');
ok(pb.startsWith(PUSHBACK_PREFIX) && /cite the source and age/.test(pb) && pb.includes('SPY Apex'), 'push-back prompt');
ok(pushBackPrompt(null).startsWith(PUSHBACK_PREFIX), 'push-back without a question');
ok(isToggleShortcut({ key: '\\', metaKey: true, ctrlKey: false } as KeyboardEvent), '⌘\\ toggles');

const host = fs.readFileSync('client/src/components/quantinum/ask-quantinum-host.tsx', 'utf8');
const panel = fs.readFileSync('client/src/components/quantinum/ask-quantinum-panel.tsx', 'utf8');
ok(host.includes("clientFlag('QUANTINUM_PANEL')") && host.includes('pageAskTarget'), 'host uses page context behind the flag');
ok(panel.includes('Push back') && panel.includes('pushBackPrompt'), 'panel has the push-back button');
ok(fs.readFileSync('client/src/App.tsx', 'utf8').includes('<AskQuantinumHost />'), 'host mounted app-wide');
console.log(`test-quantinum-panel: ${n} checks passed`);
