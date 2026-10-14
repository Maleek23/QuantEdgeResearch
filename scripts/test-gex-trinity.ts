/**
 * GEX Trinity — shared/gex-trinity.ts agreement read + ladder window, the
 * /trinity Ask Quantinum command (same function), and the tool registration.
 *   npm run test:gex-trinity
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FLIP_ON_PCT, clauseFor, readIndex, regimeOf, trinityAgreement, type TrinityInput } from '../shared/gex-trinity';
import { parseSlash, suggestCommands } from '../shared/quantinum-analyst';
import { parseHorizon } from '../shared/quantinum-horizon';
import { runAnalystCommand, type AnalystDeps, type GexBuckets } from '../server/quantinum-analyst-tools';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };

const ix = (symbol: string, spot: number, flip: number | null, cw: number | null, pw: number | null, netGex: number | null, regime?: string): TrinityInput =>
  ({ symbol, spot, flip, callWall: cw, putWall: pw, maxGamma: null, netGex, regime });

(async () => {
  // regime words
  eq(regimeOf('positive_gamma', null), 'long', 'legacy positive → long');
  eq(regimeOf('negative', 5), 'short', 'regime word wins over net sign');
  eq(regimeOf(null, -0.4), 'short', 'net sign fallback');
  eq(regimeOf(null, null), 'unknown', 'nothing → unknown');

  // per-index read
  const r1 = readIndex(ix('SPY', 600, 600 - 600 * (FLIP_ON_PCT / 100) * 0.5, 610, 590, 1));
  eq(r1.side, 'on', 'inside ±0.15% → on its flip');
  const r2 = readIndex(ix('QQQ', 500, 505, 520, 499.2, 1));
  eq(r2.side, 'below', 'under flip');
  eq(r2.wall, 'at-put-wall', 'within 0.25% of put wall');
  ok(Math.abs(r2.flipDistPct! + 1) < 1e-9, 'flip distance −1.00%');
  eq(readIndex(ix('IWM', 230, 225, 228, 220, -1)).wall, 'above-call-wall', 'spot through call wall');
  eq(readIndex(ix('IWM', 230, null, null, null, null)).side, 'unknown', 'no flip → unknown, not guessed');

  // aligned
  const up = trinityAgreement([ix('SPY', 600, 590, 610, 580, 2), ix('QQQ', 500, 490, 510, 480, 1), ix('IWM', 230, 225, 240, 220, 0.3)]);
  eq(up.regime, 'all-long', 'all long');
  eq(up.flips, 'all-above', 'all above');
  eq(up.sentence, 'Aligned: all long gamma, all above their flips.', 'aligned sentence');
  const dn = trinityAgreement([ix('SPY', 580, 590, 610, 570, -2), ix('QQQ', 480, 490, 510, 470, -1), ix('IWM', 220, 225, 240, 219.6, -0.3)]);
  eq(dn.verdict, 'Aligned short gamma', 'aligned short');
  ok(dn.sentence.includes('IWM at its put wall'), 'wall tail on an aligned read');
  ok(dn.terms.includes('put-wall'), 'put-wall glossary chip offered');

  // the brief's example: SPY on its flip, QQQ under flip at its put wall, IWM short gamma
  const mixed = trinityAgreement([
    ix('SPY', 600, 600.3, 610, 590, 1),
    ix('QQQ', 500, 505, 520, 499.2, 1),
    ix('IWM', 230, 232, 240, 220, -0.5),
  ]);
  eq(mixed.regime, 'mixed', 'mixed regime');
  eq(mixed.sentence, 'Mixed: SPY on its flip, QQQ under flip at its put wall, IWM short gamma.', 'example sentence verbatim');
  eq(mixed.verdict, 'Mixed', 'mixed verdict');

  // partial / empty data
  const two = trinityAgreement([ix('SPY', 600, 590, 610, 580, 2), ix('QQQ', 500, 490, 510, 480, 1)]);
  eq(two.regime, 'all-long', 'two reads still agree');
  const none = trinityAgreement([ix('SPY', 600, null, null, null, null)]);
  eq(none.verdict, 'Not enough data', 'one empty read → not enough data');
  ok(/not in the data/.test(none.sentence), 'says so instead of guessing');
  eq(clauseFor(readIndex(ix('SPY', 600, 590, 610, 580, 1)), 'long'), 'SPY above flip', 'same regime → flip side');

  // /trinity — same agreement function behind Ask Quantinum
  ok(suggestCommands('/tr').some((s) => s.name === 'trinity'), '/trinity autocompletes');
  const p = parseSlash('/trinity');
  ok(p && p.ok, '/trinity parses');
  const bucket = (spot: number, flip: number, cw: number, pw: number, net: number): GexBuckets => ({
    spot, asOf: '2026-10-14T14:00:00Z', source: 'fixture', regime: null,
    byDte: { today: { callWall: cw, putWall: pw, gammaFlipPrice: flip, maxGammaStrike: cw, totalGEX: net, expirationsCount: 1 } },
  });
  const books: Record<string, GexBuckets> = { SPY: bucket(600, 600.3, 610, 590, 1), QQQ: bucket(500, 505, 520, 499.2, 1), IWM: bucket(230, 232, 240, 220, -0.5) };
  const nil = async () => null;
  const deps: AnalystDeps = {
    now: () => Date.parse('2026-10-14T14:05:00Z'), getDossier: nil, getLevels: nil, getGexBuckets: async (s) => books[s] ?? null,
    getFlow: nil, getIdea: nil, getIdeas: async () => [], getSectorBoard: nil, getNews: nil, getVerifyLedger: () => null,
  };
  const caller = { userId: 'u', isSuper: false };
  const out = await runAnalystCommand((p as any).cmd, { horizon: parseHorizon('day'), page: {} as any, caller }, deps);
  ok(out.ok, '/trinity runs');
  const c = (out as any).card;
  eq(c.status, 'ok', 'card ok');
  eq(c.message, mixed.sentence, 'card says the same sentence as the tool');
  eq(c.table.rows.length, 3, 'three index rows');
  ok(c.sources.every((s: any) => s.asOf), 'every source carries its own timestamp');
  delete books.QQQ; delete books.IWM;
  const thin = await runAnalystCommand((p as any).cmd, { horizon: parseHorizon('day'), page: {} as any, caller }, deps);
  eq((thin as any).card.status, 'unavailable', 'one read → unavailable, never a guess');

  // registration
  const root = process.cwd();
  const defs = fs.readFileSync(path.join(root, 'client/src/components/dashboard/defs/gex.ts'), 'utf8');
  ok(defs.includes("id: 'gex-trinity'") && defs.includes("'GexTrinityTool'"), 'tool registered in the GEX workspace');
  ok(/id: 'trinity', name: 'Trinity'/.test(defs) && defs.includes("['gex-trinity', 0, 0, 12, 12]") && defs.includes("['gex-levels', 0, 12, 12, 6]") && !/'trinity'[\s\S]*'gex-matrix', 0, 11/.test(defs), 'Trinity layout = Trinity full width + Key Levels below');
  const tool = fs.readFileSync(path.join(root, 'client/src/components/dashboard/tools/gex/trinity-tool.tsx'), 'utf8');
  ok(tool.includes('LEVEL_COLORS') && !/--(gain|loss)\b|text-(green|red)-/.test(tool), 'GEX tokens, not gain/loss colours');
  ok(tool.includes('horizon=${horizon}'), 'terminal read with the shared horizon');
  ok(/import \{ GexStrikeMatrix \} from '@\/components\/gex\/gex-strike-grid'/.test(tool) && tool.includes('<GexStrikeMatrix'), 'reuses the workspace heatmap component (no fork)');
  ok(!/trin-ladder|ladderWindow|trin-fill/.test(tool), 'bar ladders removed');
  ok(tool.includes('useSyncedScroll') && tool.includes('strikeBand={band}'), 'shared ±% band + synced scroll');
  ok(tool.includes('trin-switch') && tool.includes('onTouchEnd'), 'phone: segmented switch + swipe');
  ok(tool.includes('useCentreSpot') && /useCentreSpot\(gridRef, `\$\{viewKey\}\|\$\{pick\}`/.test(tool) && /viewKey = `[^`]*range[^`]*horizon/.test(tool), 'spot re-centred on load, index switch, range / horizon change');
  ok(tool.includes('trin-sheet') && tool.includes('More controls'), 'phone: compact row + ⋯ sheet');
  ok(tool.includes("'SPX'") && tool.includes('Reference only'), '+SPX optional reference pane');

  console.log(`gex-trinity: ${n} assertions passed`);
})().catch((e) => { console.error(e); process.exit(1); });
