/**
 * Import reconciliation — where every row of an import went: read as fills,
 * matched into round trips, imported, skipped as duplicates, or rejected (with
 * the reason), and whether the counts add up. Plus the import history of the
 * book, batch by batch.
 *
 * Idea from LuxAlgo Trade Journal (apps/web/src/components/import-reconciliation.tsx
 * + lib/import-review.ts), https://github.com/LuxAlgo/trade-journal — MIT
 * License, Copyright (c) 2026 LuxAlgo Global, LLC (notice:
 * client/src/lib/journal/LICENSE-luxalgo.txt). Rewritten for our import
 * response (POST /api/journal/import-csv): theirs reviews before saving; ours
 * reconciles what the server did.
 */
import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { fmtMoney, toTrade } from '@/lib/journal/metrics';
import { groupImportErrors } from '@/lib/journal/metrics-extra';
import { useJournal } from './journal-context';
import { N, Pnl } from './parts';

export interface ImportResult {
  ok: boolean;
  broker?: string;
  saved?: number;
  duplicates?: number;
  open?: number;
  closed?: number;
  errors: string[];
  totalRows?: number;
  fillRows?: number | null;
  roundTrips?: number;
  duplicateRows?: { symbol: string; direction: string; entryTime: string; exitTime: string | null; quantity: number }[];
  batchId?: string;
}

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : '—');

export function ImportReconciliation({ result }: { result: ImportResult }) {
  if (!result.ok) {
    return (
      <div className="jr-err" role="alert">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><X className="h-4 w-4" /> Import failed — nothing was saved</div>
        <ul style={{ margin: '4px 0 0 16px' }}>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      </div>
    );
  }
  const g = groupImportErrors(result.errors);
  const rejectedRows = g.rejected.reduce((s, r) => s + r.rows.length, 0);
  const total = result.totalRows ?? null;
  const fills = result.fillRows ?? null;
  const notTrades = total != null && fills != null ? Math.max(0, total - fills - rejectedRows) : null;
  const trips = result.roundTrips ?? (result.closed ?? 0) + (result.open ?? 0);
  const saved = result.saved ?? 0;
  const dups = result.duplicates ?? 0;
  const failed = g.saves.length;
  const balanced = saved + dups + failed === trips;
  const steps: [string, React.ReactNode, string][] = [
    ['CSV data rows', total ?? '—', 'lines under the header'],
    ['Read as fills', fills ?? '—', 'rows the broker parser recognised as executions'],
    ['Not trades', notTrades ?? '—', 'cancelled / non-execution lines the parser skips'],
    ['Rejected', rejectedRows, 'rows that errored — reasons below'],
    ['Matched round trips', trips, `${result.closed ?? 0} closed · ${result.open ?? 0} open`],
    ['Duplicates', dups, 'already in this journal — skipped'],
    ['Imported', saved, `new trades saved${result.batchId ? ` · batch ${result.batchId}` : ''}`],
  ];
  if (failed) steps.push(['Save failed', failed, 'matched but could not be written']);
  return (
    <div className="jr-recon" role="status">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
        <Check className="h-4 w-4" /> Imported {saved} trade{saved === 1 ? '' : 's'} ({result.broker})
        <span className={balanced ? 'jr-gain' : 'jr-loss'} style={{ marginLeft: 'auto', fontSize: 11.5 }}>
          {balanced ? `reconciles: ${saved} + ${dups}${failed ? ` + ${failed}` : ''} = ${trips} round trips` : `does NOT reconcile: ${saved} + ${dups} + ${failed} ≠ ${trips}`}
        </span>
      </div>
      <div className="jr-recon-steps">
        {steps.map(([k, v, hint]) => <div key={k}><span>{k}</span><b>{v}</b><small>{hint}</small></div>)}
      </div>
      {g.rejected.length > 0 && (
        <details open={g.rejected.length <= 3}>
          <summary>Rejected rows by reason · {rejectedRows}</summary>
          <ul>{g.rejected.map((r) => <li key={r.reason}><b>{r.rows.length}×</b> {r.reason} <span className="jr-n">rows {r.rows.slice(0, 12).join(', ')}{r.rows.length > 12 ? '…' : ''}</span></li>)}</ul>
        </details>
      )}
      {!!result.duplicateRows?.length && (
        <details>
          <summary>Duplicates skipped · {dups}{result.duplicateRows.length < dups ? ` (first ${result.duplicateRows.length} listed)` : ''}</summary>
          <ul>{result.duplicateRows.map((d, i) => <li key={i}>{d.symbol} {d.direction} ×{d.quantity} · {dt(d.entryTime)} → {dt(d.exitTime)}</li>)}</ul>
        </details>
      )}
      {(g.saves.length > 0 || g.other.length > 0) && (
        <details open>
          <summary>Other messages · {g.saves.length + g.other.length}</summary>
          <ul>{[...g.saves, ...g.other].slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

/** Every import batch in the book (importBatchId), plus the sources that import without batches. */
export function ImportHistory() {
  const { data } = useJournal();
  const batches = useMemo(() => {
    const m = new Map<string, { key: string; label: string; at: number | null; trades: number; closed: number; open: number; net: number; symbols: Set<string> }>();
    for (const r of data.allRows) {
      const key = r.importBatchId ?? `src:${r.broker || 'manual'}`;
      const ts = r.importBatchId?.match(/_(\d{12,})$/)?.[1];
      const b = m.get(key) ?? { key, label: r.importBatchId ? `${r.broker} CSV` : r.broker === 'manual' || !r.broker ? 'Logged by hand' : `${r.broker} (synced)`, at: ts ? Number(ts) : null, trades: 0, closed: 0, open: 0, net: 0, symbols: new Set<string>() };
      const t = toTrade(r);
      b.trades++;
      if (t.status === 'open') b.open++; else { b.closed++; b.net += t.netPnl; }
      b.symbols.add(r.symbol);
      m.set(key, b);
    }
    return [...m.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  }, [data.allRows]);
  if (!batches.length) return null;
  return (
    <section className="jr-card jr-span-12" aria-labelledby="jr-imp-history">
      <div className="jr-card-h"><h3 className="jr-card-t" id="jr-imp-history">Import history</h3><div className="jr-card-meta"><N n={data.allRows.length} unit="trades in book" /></div></div>
      <div className="jr-table-wrap">
        <table className="jr-table">
          <thead><tr><th scope="col">Batch / source</th><th scope="col">Imported</th><th scope="col" className="num">Trades</th><th scope="col" className="num">Closed / open</th><th scope="col" className="num">Net P&amp;L</th><th scope="col">Symbols</th></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.key} style={{ cursor: 'default' }}>
                <td>{b.label}{b.key.startsWith('src:') ? '' : <span className="jr-n"> · {b.key}</span>}</td>
                <td>{b.at ? new Date(b.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                <td className="num">{b.trades}</td>
                <td className="num">{b.closed} / {b.open}</td>
                <td className="num"><Pnl value={b.closed ? b.net : null} /></td>
                <td>{[...b.symbols].slice(0, 6).join(', ')}{b.symbols.size > 6 ? ` +${b.symbols.size - 6}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="jr-note">Each broker CSV upload is one batch; Alpaca, Discord and hand-logged trades are grouped by source. Totals: {fmtMoney(batches.reduce((s, b) => s + b.net, 0))} across {batches.reduce((s, b) => s + b.closed, 0)} closed trades.</p>
    </section>
  );
}
