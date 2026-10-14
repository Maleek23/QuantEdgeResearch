/**
 * NEXUS · HISTORY — every setup published on any past ET day, with its outcome
 * (GET /api/setups/by-day, shared/journal-integrity.ts toSetupRow), plus the
 * data-health strip. Shares ideas say "Shares idea"; option ideas without a
 * contract say "contract not recorded" — never a made-up number.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { DataHealthStrip } from './data-health-strip';
import { pickPnl, usePnlBudget } from '@/lib/nexus-pnl';
import { summarizeDay, type BudgetContractLike, type PnlVerification } from '@shared/nexus-pnl';
import { NexusDayStrip, PnlChipView } from '@/components/dashboard/tools/nexus/nexus-pnl';
import './integrity.css';

interface SetupRow {
  id: string; symbol: string; source: string; instrument: string; direction: string | null; contract: string | null;
  calledAt: string; calledEt: string | null; entry: number | null; target: number | null; stop: number | null;
  entryPremium: number | null; exitPremium: number | null; resultPct: number | null; resultBasis: string;
  outcome: { status: string; label: string; tone: 'win' | 'loss' | 'flat' | 'open' }; gaps: string[];
  /** NEXUS P&L inputs (server/journal-integrity-routes.ts) — priced on the client at the budget toggle. */
  pnlInput?: {
    assetType: string | null; optionType: string | null; strikePrice: number | null; expiryDate: string | null;
    entryPremium: number | null; exitPremium: number | null; outcomeStatus: string; exitDate: string | null;
    budgetContract: BudgetContractLike | null; peak: { premium: number; atMs: number } | null;
  };
  verification?: PnlVerification | null;
}

/** A HISTORY row's P&L: open = triggered with no outcome yet (marked live), resolved = realized. */
function rowPnl(r: SetupRow, budget: number, markOf: Parameters<typeof pickPnl>[2], now: number) {
  const x = r.pnlInput;
  if (!x) return null;
  const open = x.outcomeStatus === 'open';
  return pickPnl(
    { symbol: r.symbol, assetType: x.assetType, optionType: x.optionType, strikePrice: x.strikePrice, expiryDate: x.expiryDate, entryPremium: x.entryPremium, budgetContract: x.budgetContract, lifecycleState: open ? 'pending_trigger' : null },
    budget, markOf,
    { outcomeStatus: x.outcomeStatus, exitPremium: x.exitPremium, exitDate: x.exitDate, peak: x.peak },
    now,
  );
}
interface Payload { date: string; asOf: string; setups: SetupRow[]; source: string }

const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const px = (v: number | null) => (v == null ? '—' : v >= 100 ? v.toFixed(2) : v.toFixed(v >= 1 ? 2 : 3));

export function SetupsByDay() {
  const [date, setDate] = useState(todayKey());
  const [src, setSrc] = useState<string>('all');
  const q = useQuery<Payload>({
    queryKey: ['/api/setups/by-day', date],
    queryFn: async () => {
      const r = await fetch(`/api/setups/by-day?date=${encodeURIComponent(date)}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 60_000,
  });
  const sources = useMemo(() => [...new Set((q.data?.setups ?? []).map((s) => s.source))].sort(), [q.data]);
  const rows = (q.data?.setups ?? []).filter((s) => src === 'all' || s.source === src);
  const shift = (days: number) => {
    const d = new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    if (d <= todayKey()) setDate(d);
  };
  const [budget, setBudget] = usePnlBudget();
  const now = Date.now();
  const pnls = useMemo(() => new Map(rows.map((r) => [r.id, rowPnl(r, budget, null, now)])), [rows, budget, now]);
  const day = useMemo(() => summarizeDay(rows.flatMap((r) => { const p = pnls.get(r.id); return p ? [{ id: r.id, symbol: r.symbol, pnl: p }] : []; })), [rows, pnls]);
  const tally = rows.reduce((t, r) => { t[r.outcome.tone] = (t[r.outcome.tone] ?? 0) + 1; return t; }, {} as Record<string, number>);
  return (
    <div className="ix-hist">
      <DataHealthStrip days={14} />
      <div className="ix-bar">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous day">‹</button>
        <label>Setups called on (ET) <input type="date" value={date} max={todayKey()} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
        <button type="button" onClick={() => shift(1)} aria-label="Next day" disabled={date >= todayKey()}>›</button>
        <select aria-label="Engine" value={src} onChange={(e) => setSrc(e.target.value)} className="ix-bar-sel">
          <option value="all">all engines</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {q.data && <span className="ix-src">{rows.length} setups · {tally.win ?? 0} win · {tally.loss ?? 0} loss · {tally.flat ?? 0} flat · {tally.open ?? 0} open</span>}
      </div>
      {q.data && <NexusDayStrip s={day} budget={budget} onBudget={setBudget} label={date === todayKey() ? 'Today' : date} />}
      {q.isError && <p className="ix-gap">Setups didn't load: {(q.error as Error).message}</p>}
      {!q.data && !q.isError && <p className="ix-src">Reading {date}…</p>}
      {q.data && (rows.length === 0 ? <p className="ix-src">No setups were published on {date}.</p> : (
        <div className="ix-table-wrap">
          <table className="ix-table">
            <thead><tr><th>Called</th><th>Symbol</th><th>Instrument</th><th>Side</th><th>Entry / T1 / stop</th><th>Premium in → out</th><th>Result</th><th>P&amp;L (${budget.toLocaleString('en-US')})</th><th>Outcome</th><th>Engine</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.calledEt ?? '—'}</td>
                  <td><b>{r.symbol}</b></td>
                  <td>{r.instrument}{r.contract && <><br /><small className={r.contract === 'contract not recorded' ? 'ix-gap' : 'ix-src'}>{r.contract}</small></>}</td>
                  <td>{r.direction ?? '—'}</td>
                  <td className="num">{px(r.entry)} / {px(r.target)} / {px(r.stop)}</td>
                  <td className="num">{r.entryPremium != null ? `${px(r.entryPremium)} → ${px(r.exitPremium)}` : '—'}</td>
                  <td className={`num ix-${r.resultPct == null ? 'flat' : r.resultPct >= 0 ? 'win' : 'loss'}`} title={r.resultBasis}>{r.resultPct == null ? '—' : `${r.resultPct >= 0 ? '+' : ''}${r.resultPct.toFixed(1)}%`}</td>
                  <td className="num">{pnls.get(r.id) ? <PnlChipView p={pnls.get(r.id)!} now={now} /> : '—'}{r.verification && r.outcome.status !== 'open' ? <div className="ix-src" title={r.verification.detail}>{r.verification.status}</div> : null}</td>
                  <td className={`ix-${r.outcome.tone}`}>{r.outcome.label}{r.gaps.map((g) => <div key={g} className="ix-gap">{g}</div>)}</td>
                  <td><small className="ix-src">{r.source}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {q.data && <span className="ix-src">{q.data.source} · read {new Date(q.data.asOf).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })} ET · result: option = contract premium; legacy shares ideas = underlying %, not in the options book (hover) · P&amp;L = whole contracts at the budget on the tradable contract (budget contract when 1 primary is over budget); still-open rows show — here (live P&amp;L is on the board)</span>}
    </div>
  );
}

export default SetupsByDay;
