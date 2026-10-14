/**
 * JOURNAL P&L AUDIT — the NEXUS ideas book's headline BEFORE (pre-2026-10-14 definitions)
 * and AFTER (pnl-truth-v1, shared/journal-pnl-truth.ts) on the same rows, the same ledger.
 * READ-ONLY: one READ ONLY transaction, rolled back; prints only.
 *
 *   set -a && . ./.env && set +a && npx tsx research/journal-pnl-audit.ts [--ledger f.json] [--retro f.json] [--budget 500]
 */
import fs from 'node:fs';
import pg from 'pg';
import { OUTCOME_BASELINE_DATE } from '../shared/constants';
import { mapDeskIdea, verifyDeskRows, deskVerificationMeta, type DeskIdea, type DeskLedger, type JournalWireRow } from '../server/journal-row-maps';
import { ledgerEntryOf } from '../server/desk-verify-ledger';
import { readRetroLedger } from '../shared/journal-pnl-truth';
import { applyDeskView, type DeskViewRow } from '../shared/desk-view';

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const LEDGER = arg('--ledger') ?? process.env.NEXUS_BOOK_VERIFY_LEDGER ?? '.cache/shared/ledgers/nexus-book-verify.json';
const RETRO = arg('--retro') ?? null;
const BUDGET = Number(arg('--budget') ?? 500);
const num = (x: unknown) => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const r2 = (x: number) => Math.round(x * 100) / 100;
const $ = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

async function load(): Promise<DeskIdea[]> {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '') ? undefined : { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows } = await c.query(`
      SELECT id, symbol, asset_type, direction, entry_price, target_price, stop_loss, risk_reward_ratio, option_type, strike_price, expiry_date,
        entry_premium, exit_premium, option_percent_gain, exit_price, percent_gain, outcome_status, outcome_notes, resolution_reason, exit_date,
        timestamp, source, catalyst, gen_conviction_band, holding_period, exit_by, highest_price_reached, lowest_price_reached, data_source_used,
        session_context, quality_signals,
        json_build_object('planSnapshot', convergence_signals_json::jsonb -> 'planSnapshot', 'budgetContract', convergence_signals_json::jsonb -> 'budgetContract') AS cs,
        substring(outcome_notes from '\\[exit-premium:(touch_bar|pass|withheld)\\]') AS epb,
        substring(outcome_notes from '\\[exit-time:([a-z_]+)\\]') AS ets,
        convergence_signals_json->'executionAudit'->>'state' AS es,
        CASE WHEN analysis ILIKE '%Underlying-only idea%' THEN 'Underlying-only idea' ELSE NULL END AS an
      FROM trade_ideas WHERE timestamp >= $1 AND status <> 'draft' AND (exclude_from_training = false OR exclude_from_training IS NULL)`, [OUTCOME_BASELINE_DATE]);
    return rows.map((x: any) => ({
      id: x.id, symbol: x.symbol, assetType: x.asset_type, direction: x.direction, entryPrice: Number(x.entry_price), targetPrice: num(x.target_price),
      stopLoss: num(x.stop_loss), riskRewardRatio: num(x.risk_reward_ratio), optionType: x.option_type, strikePrice: num(x.strike_price), expiryDate: x.expiry_date,
      entryPremium: num(x.entry_premium), exitPremium: num(x.exit_premium), optionPercentGain: num(x.option_percent_gain), exitPrice: num(x.exit_price),
      percentGain: num(x.percent_gain), outcomeStatus: x.outcome_status, outcomeNotes: x.outcome_notes, resolutionReason: x.resolution_reason,
      exitDate: x.exit_date ? new Date(x.exit_date).toISOString() : null, timestamp: new Date(x.timestamp).toISOString(), source: x.source, catalyst: x.catalyst,
      genConvictionBand: x.gen_conviction_band, holdingPeriod: x.holding_period, exitBy: x.exit_by, highestPriceReached: num(x.highest_price_reached),
      lowestPriceReached: num(x.lowest_price_reached), dataSourceUsed: x.data_source_used, sessionContext: x.session_context, qualitySignals: x.quality_signals,
      convergenceSignalsJson: x.cs, exitPremiumBasis: x.epb, exitTimeSource: x.ets, executionState: x.es, analysis: x.an,
    }));
  } finally { await c.query('ROLLBACK').catch(() => {}); await c.end(); }
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const byId = new Map<string, any>();
  for (const t of raw.trades ?? []) { const e = ledgerEntryOf(t); if (e) byId.set(t.id, e); }
  const ledger: DeskLedger = { asOf: String(raw.generatedAt), path: LEDGER, byId };
  const retro = RETRO && fs.existsSync(RETRO) ? readRetroLedger(JSON.parse(fs.readFileSync(RETRO, 'utf8'))) : null;
  const ideas = await load();
  const pairs: { idea: DeskIdea; row: JournalWireRow }[] = [];
  const notScored = new Map<string, number>();
  for (const i of ideas) { const m = mapDeskIdea(i); if ('row' in m) pairs.push({ idea: i, row: m.row }); else notScored.set(m.excluded.replace(/ — .*/, ''), (notScored.get(m.excluded.replace(/ — .*/, '')) ?? 0) + 1); }
  const res = verifyDeskRows(pairs, ledger, retro);
  const meta = deskVerificationMeta(res, ledger, true);
  const all = [...res.counted, ...res.unverified];
  const sized = applyDeskView(all as unknown as DeskViewRow[], { view: 'recorded', sizing: { mode: 'risk', riskDollars: BUDGET } });
  const head = sized.rows.filter((r: any) => r.status === 'closed' && r.verification?.status !== 'unverified');
  const sizedPnl = r2(head.reduce((s: number, r: any) => s + (r.realizedPnL ?? 0), 0));
  const wins = head.filter((r: any) => (r.realizedPnL ?? 0) > 0).length;
  const headIds = new Set(all.filter((r) => r.status === 'closed' && r.verification?.status !== 'unverified').map((r) => r.id));
  const skippedHead = [...headIds].filter((id) => !head.some((r: any) => r.id === id)).length;
  console.log(`ledger ${ledger.asOf} (${byId.size} rows) · retro ${retro ? retro.size : 0} records · ideas ${ideas.length} · scored ${pairs.length} · not scored ${[...notScored.values()].reduce((a, b) => a + b, 0)}`);
  console.log('not scored:', JSON.stringify(Object.fromEntries(notScored)));
  console.log('\nAFTER (pnl-truth-v1):');
  console.log(`  headline n=${meta.truth!.n} unit ${$(meta.truth!.pnl)} · byClass ${JSON.stringify(meta.truth!.byClass)}`);
  console.log(`  at $${BUDGET} whole contracts: n=${head.length} ${$(sizedPnl)} · win ${head.length ? Math.round((wins / head.length) * 100) : 0}% · over budget (not in this view) ${skippedHead} · skipped ${JSON.stringify(sized.skipped)}`);
  console.log(`  outside the headline n=${meta.truth!.outside.n} recorded ${$(meta.truth!.outside.pnl)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
