/**
 * Journal · Trades — the full log (was Trade Log → Trades, plus the P&L Sim tab
 * folded in as a section). Sortable table on desktop, card list on phones; a
 * row opens the trade drawer (notes, screenshot, edit, delete). Export writes
 * exactly the rows in view.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { useJournal } from '@/components/journal/journal-context';
import { Card, N, OutcomeChip, Pnl, SideChip, useJournalPortalClass } from '@/components/journal/parts';
import { OptionsSim } from '@/components/journal/options-sim';
import { fmtDuration, fmtPrice, type JTrade } from '@/lib/journal/metrics';
import { readApiError, useJournalMutations } from '@/lib/journal/use-journal';
import { useJournalMarks } from '@/lib/journal/use-journal-marks';
import { OpenMark } from '@/components/journal/open-mark';

type SortKey = 'date' | 'symbol' | 'pnl' | 'qty' | 'hold';

const PAGE = 50;

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(trades: JTrade[], book: string) {
  const cols = ['entryTime', 'exitTime', 'symbol', 'assetType', 'direction', 'optionType', 'strikePrice', 'expiryDate', 'quantity',
    'entryPrice', 'exitPrice', 'fees', 'realizedPnL', 'realizedPnLPercent', 'status', 'setupType', 'mistakeTag', 'emotion', 'rating', 'broker', 'notes'] as const;
  const lines = [cols.join(','), ...trades.map((t) => cols.map((c) => csvCell(t.row[c])).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `journal-${book}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function TradesView() {
  const { data, openTrade, openEditor, openImport, simSymbol, filters } = useJournal();
  const { trades, rows } = data;
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [limit, setLimit] = useState(PAGE);
  const [simOpen, setSimOpen] = useState(!!simSymbol || new URLSearchParams(window.location.search).get('jsim') === '1');
  useEffect(() => { if (simSymbol) setSimOpen(true); }, [simSymbol]);
  const portal = useJournalPortalClass();
  const { removeWithUndo } = useJournalMutations(data.key);
  const readOnly = !(data.meta?.canWrite ?? data.key === 'mine');
  const [deleteError, setDeleteError] = useState('');
  const openCount = useMemo(() => data.allRows.filter((r) => String(r.status).toLowerCase() === 'open').length, [data.allRows]);
  // Live marks for open rows (Mine / trader books), polled every 30 s while visible.
  const marks = useJournalMarks(data.key, openCount);

  const sorted = useMemo(() => {
    const val = (t: JTrade): number | string => {
      switch (sort.key) {
        case 'symbol': return t.symbol;
        case 'pnl': return t.status === 'open' ? Number.NEGATIVE_INFINITY : t.netPnl;
        case 'qty': return t.quantity;
        case 'hold': return t.durationMs ?? -1;
        default: return Date.parse(t.closedAt ?? t.openedAt);
      }
    };
    return [...trades].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [trades, sort]);
  // Desk book: capture ratio (realized ÷ best favourable move) on closed rows — docs/EXIT_RULE_REPLAY.md.
  const showCapture = useMemo(() => trades.some((t) => t.row.captureRatio != null), [trades]);
  const order = sorted.map((t) => t.id);
  const shown = sorted.slice(0, limit);

  const th = (key: SortKey, label: string, num = false) => {
    const active = sort.key === key;
    return (
      <th scope="col" className={num ? 'num' : undefined} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'symbol' ? 1 : -1 }))}>
          {label}{active && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      </th>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card num="01" title="Trade Log"
        meta={
          <>
            <N n={trades.length} unit="trades" />
            <select className="jr-select jr-phone-only" aria-label="Sort trades" value={`${sort.key}:${sort.dir}`}
              onChange={(e) => { const [k, d] = e.target.value.split(':'); setSort({ key: k as SortKey, dir: Number(d) as 1 | -1 }); }}>
              <option value="date:-1">Newest first</option>
              <option value="date:1">Oldest first</option>
              <option value="pnl:-1">Best P&amp;L</option>
              <option value="pnl:1">Worst P&amp;L</option>
              <option value="symbol:1">Symbol A–Z</option>
            </select>
            <button type="button" className="jr-btn jr-btn-sm" onClick={() => exportCsv(sorted, data.key.replace(':', '-'))} disabled={!sorted.length}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            {!readOnly && (
              <button type="button" className="jr-btn jr-btn-sm jr-btn-primary" onClick={() => openEditor()}>
                <Plus className="h-3.5 w-3.5" /> Add trade
              </button>
            )}
          </>
        }>
        <div className="jr-table-wrap jr-desktop-only">
          <table className="jr-table">
            <thead>
              <tr>
                {th('date', 'Date')}
                {th('symbol', 'Symbol')}
                <th scope="col">Side</th>
                {th('qty', 'Qty', true)}
                <th scope="col" className="num">Entry</th>
                <th scope="col" className="num">Exit</th>
                {th('pnl', 'Net P&L', true)}
                <th scope="col">Result</th>
                {showCapture && <th scope="col" className="num" title="Realized move ÷ the best favourable move of the underlying while open (closed rows)">Capture</th>}
                {th('hold', 'Held', true)}
                <th scope="col">Setup</th>
                <th scope="col">Source</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} onClick={() => openTrade(t.id, order)}>
                  <td className="jr-dim">{new Date(t.closedAt ?? t.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'America/New_York' })}</td>
                  <td>
                    <button type="button" className="jr-cell-btn jr-sym" onClick={(e) => { e.stopPropagation(); openTrade(t.id, order); }}
                      aria-label={`Open ${t.symbol} ${t.direction} trade details`}>{t.symbol}</button>{' '}
                    {t.assetType === 'option' && <span className="jr-chip opt">{(t.row.optionType ?? '').toUpperCase()} {t.row.strikePrice ?? ''}</span>}
                    {t.row.notes && <span className="jr-mute" title="Has notes"> ✎</span>}
                    {t.row.screenshot && <span className="jr-mute" title="Has a screenshot"> ▣</span>}
                  </td>
                  <td><SideChip direction={t.direction} assetType={t.assetType} optionType={t.row.optionType} />{t.row.runLabel && <span className="jr-mute" title={t.row.runLabel}> {t.row.runLabel.split(' · ')[0]}</span>}</td>
                  <td className="num">{t.quantity}</td>
                  <td className="num">{fmtPrice(t.row.entryPrice)}</td>
                  <td className="num">{t.row.exitPrice != null ? fmtPrice(t.row.exitPrice) : '—'}</td>
                  <td className="num">{t.status === 'open'
                    // Open rows: live mark (Mine/trader) or the stored ledger mark (bot), always with its age — unrealized, not 0.
                    ? (marks[t.id] || t.row.mark) ? <OpenMark rowId={t.id} live={marks[t.id]} stored={t.row.mark} /> : <span className="jr-dim">—</span>
                    : <Pnl value={t.netPnl} />}</td>
                  <td><OutcomeChip status={t.status} /></td>
                  {showCapture && <td className="num jr-dim">{t.status !== 'open' && t.row.captureRatio != null ? `${Math.round(t.row.captureRatio * 100)}%` : '—'}</td>}
                  <td className="num jr-dim">{fmtDuration(t.durationMs)}</td>
                  <td>{t.row.setupType ? <span className="jr-tag">{t.row.setupType}</span> : <span className="jr-mute">—</span>}</td>
                  <td className="jr-dim">{t.row.broker}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {!readOnly && <button type="button" className="jr-icon-btn" aria-label={`Edit ${t.symbol} trade`} onClick={() => openEditor(t.row)}><Pencil className="h-3.5 w-3.5" /></button>}
                    {!readOnly && <button type="button" className="jr-icon-btn danger" aria-label={`Delete ${t.symbol} trade (Undo for 6 seconds)`} onClick={() => {
                      setDeleteError('');
                      const row = data.allRows.find((r) => r.id === t.id);
                      if (row) removeWithUndo(row, `${t.symbol} ${t.direction} · ${new Date(t.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
                      else setDeleteError('That trade is no longer in this book — refresh and try again.');
                    }}><Trash2 className="h-3.5 w-3.5" /></button>}
                    <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-mute)' }} aria-hidden />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="jr-list jr-phone-only">
          {shown.map((t) => (
            <button key={t.id} type="button" className="jr-row-card" onClick={() => openTrade(t.id, order)}>
              <span><span className="jr-sym">{t.symbol}</span> <SideChip direction={t.direction} assetType={t.assetType} optionType={t.row.optionType} /></span>
              <span className="r">{t.status === 'open' ? <OpenMark rowId={t.id} live={marks[t.id]} stored={t.row.mark} compact /> : <Pnl value={t.netPnl} />}</span>
              <span className="meta">
                <OutcomeChip status={t.status} />
                {new Date(t.closedAt ?? t.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
                {' · '}{t.quantity} @ {fmtPrice(t.row.entryPrice)}{t.row.exitPrice != null ? ` → ${fmtPrice(t.row.exitPrice)}` : ''}
                {t.row.setupType && <span className="jr-tag">{t.row.setupType}</span>}
              </span>
            </button>
          ))}
        </div>
        {sorted.length === 0 && (
          // One line + one next action — never a blank table.
          <div className="lx-empty" data-testid="qe-empty" style={{ marginTop: 10 }}>
            {filters.activeCount > 0 ? (
              <>
                <div>No trades match these filters{filters.state.filters.ids?.length ? ' (the drilled-down trades are outside the other filters)' : ''}.</div>
                <div className="mt-1 flex justify-center"><button type="button" className="jr-btn jr-btn-sm" onClick={filters.clear}>Clear filters</button></div>
              </>
            ) : readOnly ? (
              <div>This book has no trades yet.</div>
            ) : (
              <>
                <div>No trades logged yet — import a broker file (or use Add trade above).</div>
                <div className="mt-1 flex justify-center"><button type="button" className="jr-btn jr-btn-sm jr-btn-primary" onClick={() => openImport()}>Import trades</button></div>
              </>
            )}
          </div>
        )}
        {deleteError && <div className="jr-err" role="alert" style={{ marginTop: 10 }}>{deleteError}</div>}
        {sorted.length > limit && (
          <button type="button" className="jr-btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, sorted.length - limit)} more · {sorted.length - limit} hidden
          </button>
        )}
      </Card>

      <section className="jr-card" id="jr-sim">
        <details className="jr-details" open={simOpen} onToggle={(e) => setSimOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="jr-card-h" style={{ marginBottom: simOpen ? 12 : 0 }}>
            <ChevronRight className="chev h-4 w-4" aria-hidden />
            <span className="jr-sec-num">02</span>
            <h3 className="jr-card-t">Options P&amp;L simulator</h3>
            <span className="jr-card-meta jr-n">at-expiry payoff of your option legs</span>
          </summary>
          {simOpen && <OptionsSim rows={rows} preselect={simSymbol} />}
        </details>
      </section>

    </div>
  );
}

