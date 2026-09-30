/**
 * Compact trade list (symbol, side, P&L, outcome, date, tags) — used by the
 * dashboard's Activity tool, the Calendar day panel and the Daily journal.
 */
import { fmtMoney, type JTrade } from '@/lib/journal/metrics';
import { OutcomeChip, Pnl, SideChip } from './parts';
import { OpenMark } from './open-mark';
import type { LiveMark } from '@/lib/journal/use-journal-marks';

export function TradeMiniList({ trades, onOpen, marks }: { trades: JTrade[]; onOpen: (id: string) => void; marks?: Record<string, LiveMark> }) {
  if (!trades.length) return <p className="jr-note">No trades here.</p>;
  return (
    <div className="jr-list">
      {trades.map((t) => (
        <button key={t.id} type="button" className="jr-row-card" onClick={() => onOpen(t.id)}
          aria-label={`${t.symbol} ${t.direction}, ${t.status === 'open' ? 'open' : fmtMoney(t.netPnl)}`}>
          <span><span className="jr-sym">{t.symbol}</span> <SideChip direction={t.direction} /></span>
          <span className="r">{t.status === 'open'
            ? (marks?.[t.id] || t.row.mark) ? <OpenMark rowId={t.id} live={marks?.[t.id]} stored={t.row.mark} compact /> : <span className="jr-dim">open</span>
            : <Pnl value={t.netPnl} />}</span>
          <span className="meta">
            <OutcomeChip status={t.status} />
            {new Date(t.closedAt ?? t.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}
            {t.row.setupType && <span className="jr-tag">{t.row.setupType}</span>}
            {t.row.notes && <span title="Has notes">✎ notes</span>}
            {t.row.screenshot && <span title="Has a screenshot">▣ chart</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
