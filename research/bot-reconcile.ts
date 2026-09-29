/**
 * Bot reconciliation — settle the bot's expired option positions (every run).
 *
 *   npx tsx research/bot-reconcile.ts            DRY RUN (default): prints exactly
 *                                                which rows would change and the P&L
 *                                                impact. Every DB connection is opened
 *                                                READ ONLY (default_transaction_read_only).
 *   npx tsx research/bot-reconcile.ts --apply    writes the settlements (operator only).
 *
 * Rules (server/bot-expiry-plan.ts): bought options only — shares never auto-close;
 * settlement = intrinsic at the underlying's close ON expiry day; no close for that
 * exact day → row left open and reported; exit reason 'expired'; exit time = expiry
 * day 16:00 ET. Also prints the per-run record before and after.
 */
const APPLY = process.argv.includes('--apply');
if (!APPLY) {
  // Must be set before the pool opens its first connection: every session is read-only.
  process.env.PGOPTIONS = `${process.env.PGOPTIONS ?? ''} -c default_transaction_read_only=on`.trim();
}

import 'dotenv/config';

type Rec = { n: number; wins: number; losses: number; net: number; open: number };
const fmt = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const wr = (r: Rec) => (r.n ? `${((r.wins / r.n) * 100).toFixed(1)}%` : 'n/a');

(async () => {
  const { loadBotLedger } = await import('../server/bot-ledger');
  const { reconcileExpiredBotPositions } = await import('../server/bot-reconcile');
  const { pool } = await import('../server/db');

  if (!APPLY) {
    const ro = await pool.query('show default_transaction_read_only');
    console.log(`mode: DRY RUN — session read-only = ${ro.rows[0]?.default_transaction_read_only}`);
  } else {
    console.log('mode: APPLY — settlements will be written');
  }

  const ledger = await loadBotLedger();
  const res = await reconcileExpiredBotPositions({ apply: APPLY });
  const label = new Map(ledger.runs.map((r) => [r.id, r.label]));

  console.log(`as of ${res.asOf}\n`);
  console.log(`${res.settlements.length} expired option position(s) ${APPLY ? 'SETTLED' : 'WOULD SETTLE'}:`);
  for (const s of res.settlements) {
    console.log(
      `  ${s.id.slice(0, 8)}  ${label.get(s.portfolioId) ?? s.portfolioId.slice(0, 8)}\n` +
      `      ${s.contract}  ×${s.quantity} @ $${s.entryPrice}  underlying close ${s.expiryDay}: $${s.underlyingClose} (${s.closeSource ?? '?'})\n` +
      `      status open → closed · exit_reason 'expired' · exit_price $${s.exitPrice} · exit_time ${s.exitTime}\n` +
      `      realized_pnl 0 → ${fmt(s.realizedPnL)} (${s.realizedPnLPercent}%) · cash +$${s.proceeds}\n` +
      `      was shown as: last mark ${s.priorMark ?? '—'} at ${s.priorMarkAt ?? 'never'} (unrealized ${s.priorUnrealizedPnL == null ? '—' : fmt(s.priorUnrealizedPnL)})`,
    );
  }
  if (res.skipped.length) {
    console.log(`\n${res.skipped.length} due but NOT settled (left untouched):`);
    for (const k of res.skipped) console.log(`  ${k.id.slice(0, 8)}  ${k.contract} — ${k.reason}`);
  }
  console.log(`\nrealized P&L impact: ${fmt(res.realizedDelta)}`);
  for (const [pid, c] of Object.entries(res.cashDelta)) console.log(`cash credited to ${label.get(pid)}: +$${c.toFixed(2)}`);

  // Per-run record, before → after.
  const settledById = new Map(res.settlements.map((s) => [s.id, s]));
  console.log('\nper-run record (closed trades; win = realized P&L > 0):');
  const all = { before: { n: 0, wins: 0, losses: 0, net: 0, open: 0 } as Rec, after: { n: 0, wins: 0, losses: 0, net: 0, open: 0 } as Rec };
  for (const run of ledger.runs) {
    const pf = ledger.portfolios.find((p) => p.id === run.id)!;
    const rows = ledger.positions.filter((x) => x.portfolioId === run.id);
    const before: Rec = { n: 0, wins: 0, losses: 0, net: 0, open: 0 };
    const after: Rec = { n: 0, wins: 0, losses: 0, net: 0, open: 0 };
    for (const x of rows) {
      const add = (r: Rec, pnl: number | null) => {
        if (pnl == null) { r.open++; return; }
        r.n++; r.net += pnl; if (pnl > 0) r.wins++; else if (pnl < 0) r.losses++;
      };
      const closedPnl = x.status === 'closed' ? Number(x.realizedPnL ?? 0) : null;
      add(before, closedPnl);
      const s = settledById.get(x.id);
      add(after, s ? s.realizedPnL : closedPnl);
    }
    for (const k of ['before', 'after'] as const) {
      const src = k === 'before' ? before : after;
      all[k].n += src.n; all[k].wins += src.wins; all[k].losses += src.losses; all[k].net += src.net; all[k].open += src.open;
    }
    const openVal = rows.filter((x) => x.status !== 'closed' && !settledById.has(x.id))
      .reduce((s2, x) => s2 + Number(x.currentPrice ?? x.entryPrice) * x.quantity * (x.assetType === 'option' ? 100 : 1), 0);
    const cashAfter = pf.cashBalance + (res.cashDelta[run.id] ?? 0);
    console.log(
      `  ${run.label.padEnd(30)} [${run.displayName}]\n` +
      `      before: n=${before.n} ${before.wins}W/${before.losses}L win ${wr(before)} net ${fmt(before.net)} · ${before.open} open\n` +
      `      after : n=${after.n} ${after.wins}W/${after.losses}L win ${wr(after)} net ${fmt(after.net)} · ${after.open} open\n` +
      `      value : stored total_value $${pf.totalValue} · cash+marks now $${(pf.cashBalance + openVal + rows.filter((x) => x.status !== 'closed' && settledById.has(x.id)).reduce((s2, x) => s2 + Number(x.currentPrice ?? x.entryPrice) * x.quantity * 100, 0)).toFixed(2)} → after $${(cashAfter + openVal).toFixed(2)}`,
    );
  }
  console.log(`  ${'COMBINED'.padEnd(30)}\n      before: n=${all.before.n} win ${wr(all.before)} net ${fmt(all.before.net)} · ${all.before.open} open\n      after : n=${all.after.n} win ${wr(all.after)} net ${fmt(all.after.net)} · ${all.after.open} open`);
  if (!APPLY) console.log('\nDRY RUN — nothing was written. Re-run with --apply to settle.');
  await pool.end();
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
