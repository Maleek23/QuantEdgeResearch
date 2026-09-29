/**
 * Journal · Accounts — LuxAlgo's Accounts (apps/web/src/app/accounts): where a
 * book's trades come from.
 *   Mine     Alpaca connect / sync (alpaca-connect.tsx) + the sources in the book
 *   Trader   the sources in the book (traders connect nothing here)
 *   Bot      its paper portfolio(s) and balances (/api/journal/bot) — stored
 *            balances, stamped with when they were last written
 *   Desk     no account: published ideas at unit size
 */
import { useMemo } from 'react';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { useJournal } from '@/components/journal/journal-context';
import { AlpacaConnect } from '@/components/journal/alpaca-connect';
import { Card, N, Pnl, fmtDayLabel } from '@/components/journal/parts';
import { fmtMoney } from '@/lib/journal/metrics';
import { useBotBook, useJournalMutations } from '@/lib/journal/use-journal';
import { journalDayKey } from '@shared/journal-filters';

function ago(iso: string | null): string {
  if (!iso) return 'time unknown';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(m)) return 'time unknown';
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}

export default function AccountsView() {
  const { data } = useJournal();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.key === 'mine' && <MineAccounts />}
      {data.key === 'bot' && <BotAccounts />}
      {data.key === 'desk' && (
        <Card num="01" title="No account behind this book">
          <p style={{ margin: 0 }}>{data.meta?.sizing ?? 'The trade desk book scores published ideas at a stated unit size; it has no cash balance.'}</p>
        </Card>
      )}
      {data.key !== 'desk' && <SourcesCard />}
    </div>
  );
}

function MineAccounts() {
  const { refresh } = useJournalMutations('mine');
  return (
    <Card num="01" title="Broker connection · Alpaca">
      <AlpacaConnect onSynced={refresh} />
    </Card>
  );
}

function BotAccounts() {
  const q = useBotBook(true);
  if (q.isError) return <QEError title="The bot's paper accounts didn't load" message={`/api/journal/bot failed (${q.error instanceof Error ? q.error.message : 'no response'}).`} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (q.isLoading || !q.data) return <QELoading rows={2} label="loading paper portfolios…" />;
  const { portfolios, activePortfolio } = q.data;
  if (!portfolios.length) return <QEEmpty message={`The bot has no paper portfolio yet — "${activePortfolio}" is created the first time a bot cycle runs.`} />;
  return (
    <Card num="01" title="Paper portfolios · one per bot run" meta={<N n={portfolios.length} unit="runs" />}>
      <div className="jr-grid">
        {portfolios.map((p) => (
          <section key={p.id} className="jr-span-6" aria-label={p.runLabel ?? p.name}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <b className="jr-sym">{p.runLabel ?? p.name}</b>
              <span className={p.active ? 'jr-chip open' : 'jr-chip'}>{p.active ? 'TRADING' : 'RETIRED · KEPT FOR AUDIT'}</span>
              <span className="jr-mute" title={p.id}>{p.displayName ?? p.name}</span>
            </div>
            <div className="jr-stats">
              <div><span>Total value</span><b>{fmtMoney(p.totalValue, { signed: false })}</b><small>cash + {p.openCount ?? 0} open at marks · started {fmtMoney(p.startingCapital, { signed: false })}</small></div>
              <div><span>Cash</span><b>{fmtMoney(p.cashBalance, { signed: false })}</b><small>uninvested</small></div>
              <div><span>P&amp;L</span><b><Pnl value={p.totalValue - p.startingCapital} /></b><small>value − starting capital</small></div>
              <div><span>Risk / trade</span><b>{p.riskPerTrade != null ? `${(p.riskPerTrade * 100).toFixed(1)}%` : '—'}</b><small>max position {fmtMoney(p.maxPositionSize, { signed: false })}</small></div>
            </div>
            <p className="jr-note">
              {(p.openCount ?? 0) > 0
                ? <>Open positions valued at their last marks — oldest mark {ago(p.oldestMarkAt ?? null)}{p.newestMarkAt && p.newestMarkAt !== p.oldestMarkAt ? `, newest ${ago(p.newestMarkAt)}` : ''}{p.unmarked ? ` · ${p.unmarked} never marked (at cost)` : ''}. Not a live quote unless the age says so.</>
                : <>No open positions — value is cash.</>}
              {p.storedTotalValue != null && Math.abs(p.storedTotalValue - p.totalValue) >= 1 && <> Stored total_value {fmtMoney(p.storedTotalValue, { signed: false })} differs (written {ago(p.updatedAt)}); the figure above is recomputed now.</>}
            </p>
          </section>
        ))}
      </div>
    </Card>
  );
}

/** Where the rows in this book came from — by source (broker / import / manual). */
function SourcesCard() {
  const { data, bookLabel } = useJournal();
  const rows = data.allRows;
  const sources = useMemo(() => {
    const m = new Map<string, { n: number; closed: number; net: number; first: string; last: string }>();
    for (const r of rows) {
      const k = (r.broker || 'manual').toLowerCase();
      const d = journalDayKey(r.entryTime);
      const s = m.get(k) ?? { n: 0, closed: 0, net: 0, first: d, last: d };
      s.n++;
      if (r.status === 'closed' && r.realizedPnL != null) { s.closed++; s.net += Number(r.realizedPnL); }
      if (d < s.first) s.first = d;
      if (d > s.last) s.last = d;
      m.set(k, s);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [rows]);
  return (
    <Card num={data.key.startsWith('trader:') ? '01' : '02'} title={`What's in ${data.key === 'mine' ? 'your' : `${bookLabel}'s`} book`} meta={<N n={rows.length} unit="trades, all time" />}>
      {!sources.length ? <QEEmpty message="No trades in this book yet." /> : (
        <div className="jr-table-wrap">
          <table className="jr-table">
            <thead><tr><th scope="col">Source</th><th scope="col" className="num">Trades</th><th scope="col" className="num">Closed</th><th scope="col" className="num">Net P&amp;L</th><th scope="col">First → last entry</th></tr></thead>
            <tbody>
              {sources.map(([k, s]) => (
                <tr key={k} style={{ cursor: 'default' }}>
                  <td><span className="jr-sym" style={{ fontSize: 13 }}>{k}</span></td>
                  <td className="num">{s.n}</td>
                  <td className="num">{s.closed}</td>
                  <td className="num"><Pnl value={s.net} /></td>
                  <td>{fmtDayLabel(s.first, { month: 'short', day: 'numeric', year: '2-digit' })} → {fmtDayLabel(s.last, { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="jr-note">Unfiltered: every trade in the book, by the source that wrote it. Net P&amp;L sums closed trades with a recorded P&amp;L.</p>
    </Card>
  );
}
