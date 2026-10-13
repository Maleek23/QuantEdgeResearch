/**
 * BACKFILL — premium-based outcomes for option ideas (shared/premium-outcome.ts).
 *
 * DRY-RUN BY DEFAULT. Prints a diff table (old → new) of outcome_status,
 * exit_premium, option_percent_gain and the contract's true peak, recomputed on
 * each contract's own 1-minute bars (server/option-bars-chain.ts: Massive →
 * Alpaca → Yahoo — the option-peak-job loader). Writes nothing unless --apply.
 *
 *   tsx scripts/backfill-premium-outcomes.ts                    # DB rows since 2026-10-01, dry run
 *   tsx scripts/backfill-premium-outcomes.ts --since 2026-10-07 --ids id1,id2
 *   tsx scripts/backfill-premium-outcomes.ts --rows rows.json   # offline: rows exported with psql (no DB import)
 *   tsx scripts/backfill-premium-outcomes.ts --apply            # writes (operator only; never in this branch's checks)
 *
 * Also covers:
 *   · budget contracts (convergence_signals_json.budgetContract) — tracking recomputed;
 *   · 0DTE ideas stored as SHARES whose catalyst names the contract
 *     ("AMZN 255P 0DTE … mid $1.33") — the contract is recovered and judged on premium.
 */
import { readFileSync } from 'node:fs';
import {
  backfillWindow, contractFromCatalyst, etDateKey, judgePremiumOutcome, peakOverWindow, premiumPlanFor,
  type PremiumBar,
} from '../shared/premium-outcome';
import { trackBudgetContract, readBudgetContract } from '../shared/budget-contract';
import { parsePeak } from '../shared/option-peak';
import { readOracleExecutionAudit } from '../shared/oracle-lifecycle';
import { wasConvertedToShares } from '../shared/options-only';

const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes('--apply');
const SINCE = arg('--since') ?? '2026-10-01';
const IDS = (arg('--ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const ROWS_FILE = arg('--rows');
const NOW = Date.now();

type Row = Record<string, any>;
const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const jsonOf = (x: unknown) => { if (typeof x === 'string') { try { return JSON.parse(x); } catch { return null; } } return x ?? null; };
const hhmm = (ms: number | null | undefined) => (ms == null ? '—' : new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }));
const money = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(2));

/** Normalise snake_case psql rows and camelCase drizzle rows to one shape. */
function norm(r: Row): Row {
  const g = (c: string, s: string) => (r[c] !== undefined ? r[c] : r[s]);
  return {
    id: g('id', 'id'), source: g('source', 'source'), symbol: g('symbol', 'symbol'), assetType: g('assetType', 'asset_type'),
    direction: g('direction', 'direction'), optionType: g('optionType', 'option_type'), strikePrice: num(g('strikePrice', 'strike_price')),
    expiryDate: g('expiryDate', 'expiry_date'), entryPrice: num(g('entryPrice', 'entry_price')), targetPrice: num(g('targetPrice', 'target_price')),
    stopLoss: num(g('stopLoss', 'stop_loss')), entryPremium: num(g('entryPremium', 'entry_premium')), exitPremium: num(g('exitPremium', 'exit_premium')),
    optionPercentGain: num(g('optionPercentGain', 'option_percent_gain')), outcomeStatus: g('outcomeStatus', 'outcome_status'),
    resolutionReason: g('resolutionReason', 'resolution_reason'), timestamp: g('timestamp', 'timestamp'), exitDate: g('exitDate', 'exit_date'),
    exitBy: g('exitBy', 'exit_by'), optionDelta: num(g('optionDelta', 'option_delta')), qualitySignals: jsonOf(g('qualitySignals', 'quality_signals')),
    convergenceSignalsJson: jsonOf(g('convergenceSignalsJson', 'convergence_signals_json')), outcomeNotes: g('outcomeNotes', 'outcome_notes'),
    catalyst: g('catalyst', 'catalyst'), analysis: g('analysis', 'analysis'), dataSourceUsed: g('dataSourceUsed', 'data_source_used'),
  };
}

function entryMsOf(r: Row): number {
  const pub = Date.parse(String(r.timestamp));
  const a = readOracleExecutionAudit(r.convergenceSignalsJson);
  const trig = a?.triggerObservedAt ? Date.parse(a.triggerObservedAt) : NaN;
  return Number.isFinite(trig) && trig >= pub ? trig : pub;
}

async function loadRows(): Promise<Row[]> {
  if (ROWS_FILE) return (JSON.parse(readFileSync(ROWS_FILE, 'utf8')) as Row[]).map(norm);
  const { db } = await import('../server/db');
  const { sql } = await import('drizzle-orm');
  const res: any = await db.execute(sql`
    SELECT * FROM trade_ideas
    WHERE timestamp >= ${SINCE}
      AND (asset_type = 'option' OR (source IN ('zero_dte_flow','zero_dte_desk','zero_dte_sniper','index_scalp','spx_fast_move') AND asset_type = 'stock'))
    ORDER BY timestamp`);
  return (res.rows ?? res).map(norm);
}

interface Diff {
  id: string; label: string; kind: 'primary' | 'recovered' | 'budget'; entry: number | null;
  old: { status: string | null; exit: number | null; pct: number | null; peak: string };
  next: { status: string | null; exit: number | null; pct: number | null; peak: string; exitAt: string };
  changed: boolean; note: string;
}

async function main() {
  const { contractMinuteBars } = await import('../server/option-bars-chain');
  const rows = (await loadRows()).filter((r) => !IDS.length || IDS.includes(r.id));
  const diffs: Diff[] = [];
  const skipped: Record<string, number> = {};
  const skip = (k: string) => { skipped[k] = (skipped[k] ?? 0) + 1; };
  const barsCache = new Map<string, PremiumBar[]>();
  const barsFor = async (symbol: string, expiry: string, type: 'call' | 'put', strike: number, fromMs: number, toMs: number) => {
    const k = `${symbol}|${expiry}|${type}|${strike}|${fromMs}|${toMs}`;
    if (!barsCache.has(k)) barsCache.set(k, (await contractMinuteBars({ symbol, expiry, optionType: type, strike, fromMs, toMs, nowMs: NOW })).bars);
    return barsCache.get(k)!;
  };

  for (const r0 of rows) {
    let r = r0;
    let kind: Diff['kind'] = 'primary';
    // 0DTE stored as shares: recover the contract from its own catalyst.
    if (r.assetType !== 'option') {
      if (!wasConvertedToShares(r)) { skip('stock_not_converted'); continue; }
      const c = contractFromCatalyst(r.catalyst);
      if (!c || !(c.mid && c.mid > 0)) { skip('converted_no_contract_in_catalyst'); continue; }
      r = { ...r, assetType: 'option', optionType: c.optionType, strikePrice: c.strike, expiryDate: etDateKey(Date.parse(r.timestamp)), entryPremium: c.mid };
      kind = 'recovered';
    }
    const type: 'call' | 'put' = String(r.optionType ?? '').toLowerCase().startsWith('p') ? 'put' : 'call';
    const label = `${r.symbol} ${r.strikePrice}${type === 'put' ? 'P' : 'C'} ${String(r.expiryDate ?? '').slice(5, 10)} (${r.source})`;
    const entryMs = entryMsOf(r);

    // ── budget contract (any row carrying one) ──
    // Operator-backfilled budget contracts carry v:1 (MU 10/09 1090C) — read those too.
    const rawBc = (r.convergenceSignalsJson as any)?.budgetContract;
    const bc = readBudgetContract(r.convergenceSignalsJson) ?? (rawBc && Number(rawBc.strike) > 0 && Number(rawBc.entryPremium) > 0 && Number(rawBc.qty) >= 1 && Number(rawBc.premiumT1) > 0 ? rawBc : null);
    if (bc && !String(r.resolutionReason ?? '').startsWith('missed_entry')) {
      const bClose = Date.parse(`${bc.expiry}T20:00:00Z`);
      const toMs = Math.min(NOW - 16 * 60_000, bClose);
      if (toMs > entryMs) {
        const bars = await barsFor(bc.symbol, bc.expiry, bc.optionType, bc.strike, entryMs, toMs);
        if (bars.length) {
          const tr = trackBudgetContract({ ...bc, tracking: undefined }, bars, entryMs, toMs, 'backfill', NOW);
          const oldT = bc.tracking;
          const oldPeak = oldT?.peak ? `${money(oldT.peak.premium)}@${hhmm(oldT.peak.atMs)}` : '—';
          const newPeak = tr.peak ? `${money(tr.peak.premium)}@${hhmm(tr.peak.atMs)}` : '—';
          const exit = tr.outcome === 'hit_t2' ? bc.premiumT2 : tr.outcome === 'hit_t1' ? bc.premiumT1 : tr.outcome === 'hit_stop' ? bc.premiumStop : tr.lastMark ?? null;
          diffs.push({
            id: r.id, kind: 'budget', entry: bc.entryPremium, label: `${bc.label} ×${bc.qty} budget (${r.symbol} ${r.source})`,
            old: { status: oldT?.outcome ?? null, exit: null, pct: null, peak: oldPeak },
            next: { status: tr.outcome ?? null, exit: exit ?? null, pct: exit != null ? Math.round(((exit - bc.entryPremium) / bc.entryPremium) * 10000) / 100 : null, peak: newPeak, exitAt: hhmm(tr.t2HitAt ?? tr.t1HitAt ?? tr.stopHitAt ?? null) },
            changed: (oldT?.outcome ?? null) !== (tr.outcome ?? null) || oldPeak !== newPeak, note: `entry $${bc.entryPremium} · T1 $${bc.premiumT1} · stop $${bc.premiumStop}`,
          });
        } else skip('budget_no_bars');
      }
    }

    if (!(num(r.entryPremium) && num(r.strikePrice))) { skip('no_contract_or_premium'); continue; }
    if (r.outcomeStatus === 'open' && !r.exitDate) {
      const w0 = backfillWindow({ ...r, entryMs }, NOW);
      if (!w0.ok || !w0.final) { skip('open_not_due'); continue; }
    }
    const w = backfillWindow({ ...r, entryMs }, NOW);
    if (!w.ok) { skip(w.why); continue; }
    const plan = premiumPlanFor(r, { zeroDte: w.shortDated, nowMs: entryMs });
    if (!plan) { skip('no_plan'); continue; }
    const bars = await barsFor(r.symbol, String(r.expiryDate).slice(0, 10), type, Number(r.strikePrice), w.fromMs, w.toMs);
    if (!bars.length) { skip('no_contract_bars'); continue; }
    const v = judgePremiumOutcome(bars, plan, w.fromMs, w.toMs, { final: w.final, source: 'backfill' });
    const pk = peakOverWindow(bars, w.fromMs, w.toMs);
    const oldPk = parsePeak(r.outcomeNotes);
    const oldPeak = oldPk ? `${money(oldPk.premium)}@${hhmm(oldPk.atMs)}` : '—';
    const newPeak = pk ? `${money(pk.premium)}@${hhmm(pk.atMs)}` : '—';
    const next = { status: v.status, exit: v.exitPremium, pct: v.optionPercentGain, peak: newPeak, exitAt: hhmm(v.exitAtMs) };
    const old = { status: kind === 'recovered' ? `${r0.outcomeStatus} (as shares)` : r.outcomeStatus, exit: r.exitPremium, pct: r.optionPercentGain, peak: oldPeak };
    const changed = kind === 'recovered' || old.status !== next.status || money(old.exit) !== money(next.exit) || oldPeak !== newPeak;
    diffs.push({ id: r.id, kind, label, entry: plan.entry, old, next, changed, note: `entry $${plan.entry} · T1 $${plan.t1} · stop $${plan.stop} (${plan.source})${kind === 'recovered' ? ' · contract recovered from catalyst' : ''}` });
  }

  // ── report ──
  const changed = diffs.filter((d) => d.changed);
  console.log(`\nPREMIUM OUTCOME BACKFILL — ${APPLY ? 'APPLY' : 'DRY RUN (no writes)'} · since ${SINCE} · ${rows.length} rows read · ${diffs.length} judged · ${changed.length} differ`);
  console.log('id       | kind      | contract                                   | status old → new                  | exit old → new | % old → new      | peak old → new           | exit @ET | plan');
  for (const d of changed) {
    console.log([
      d.id.slice(0, 8), d.kind.padEnd(9), d.label.slice(0, 42).padEnd(42),
      `${d.old.status ?? '—'} → ${d.next.status ?? '—'}`.padEnd(33),
      `${money(d.old.exit)} → ${money(d.next.exit)}`.padEnd(14),
      `${d.old.pct ?? '—'} → ${d.next.pct ?? '—'}`.padEnd(16),
      `${d.old.peak} → ${d.next.peak}`.padEnd(24),
      d.next.exitAt.padEnd(8), d.note,
    ].join(' | '));
  }
  const by = (f: (d: Diff) => boolean) => changed.filter(f).length;
  console.log(`\nSUMMARY: ${changed.length} rows differ`);
  console.log(`  hit_target → other            : ${by((d) => String(d.old.status) === 'hit_target' && d.next.status !== 'hit_target')}`);
  console.log(`  other → hit_target            : ${by((d) => String(d.old.status) !== 'hit_target' && d.next.status === 'hit_target')}`);
  console.log(`  hit_target with exit < entry (old): ${diffs.filter((d) => d.kind === 'primary' && d.old.status === 'hit_target' && d.old.exit != null && d.entry != null ? d.old.exit < d.entry : false).length}`);
  console.log(`  exit premium changed          : ${by((d) => money(d.old.exit) !== money(d.next.exit))}`);
  console.log(`  peak changed                  : ${by((d) => d.old.peak !== d.next.peak)}`);
  console.log(`  recovered from shares         : ${by((d) => d.kind === 'recovered')}`);
  console.log(`  budget contracts re-tracked   : ${by((d) => d.kind === 'budget')}`);
  console.log(`  skipped: ${JSON.stringify(skipped)}`);

  if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply (operator) to write.'); return; }
  if (ROWS_FILE) { console.log('--apply needs DB mode (not --rows).'); return; }
  const { db } = await import('../server/db');
  const { tradeIdeas } = await import('../shared/schema');
  const { eq } = await import('drizzle-orm');
  let n = 0;
  for (const d of changed) {
    if (d.kind !== 'primary') continue; // recovered / budget rows are reviewed by hand first
    const row = rows.find((x) => x.id === d.id)!;
    const notes = `${row.outcomeNotes ? `${row.outcomeNotes}\n` : ''}[premium-backfill ${new Date(NOW).toISOString().slice(0, 10)}] ${d.old.status} $${money(d.old.exit)} → ${d.next.status} $${money(d.next.exit)} · peak ${d.next.peak} ET (${d.note})`;
    await db.update(tradeIdeas).set({
      outcomeStatus: d.next.status as any, exitPremium: d.next.exit, optionPercentGain: d.next.pct, outcomeNotes: notes,
      resolutionReason: `premium_${d.next.status}`,
    } as any).where(eq(tradeIdeas.id, d.id));
    n++;
  }
  console.log(`applied ${n} primary rows`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
