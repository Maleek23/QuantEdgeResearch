/**
 * NEXUS P&L views — row chip, Setup Detail P&L block, and the day strip.
 * Rules: shared/nexus-pnl.ts (options only, whole contracts at $500 / $1,000,
 * tradable = primary or budget contract). Marks: client/src/lib/nexus-pnl.ts.
 * Colour is by SIGN of the P&L only (gain / loss tokens) — never on levels.
 */
import { Link } from 'wouter';
import { useMemo } from 'react';
import { ageShort, etClock, pctText, pnlChip, usd, type DaySummary, type NexusPnl, type PnlBudget, type PnlVerification } from '@shared/nexus-pnl';
import { PNL_BUDGETS } from '@shared/nexus-pnl';
import { pickPnl, useBoardMarkOf, useNexusMarks, usePnlBudget, type PnlPickLike, type PnlRecordLike } from '@/lib/nexus-pnl';
import { useIdeaDetail } from '@/components/ideas/idea-detail-by-id';
import './nexus-pnl.css';

const toneCls = (v: number | null | undefined) => (v == null ? 'muted' : v > 0 ? 'gain' : v < 0 ? 'loss' : 'flat');
const etHm = (ms: number | null) => (ms == null ? null : new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }));
const prem = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toFixed(2)}`);

/** Row chip: "—" / "loading mark" / "+$120 +24%" + sub-line. */
export function PnlChipView({ p, now, compact }: { p: NexusPnl; now: number; compact?: boolean }) {
  const c = pnlChip(p, now);
  return (
    <span className={`nxpl-chip ${c.tone}${p.loadingMark ? ' loading' : ''}`} title={c.title} data-testid="nexus-pnl-chip" data-pnl-status={p.status}>
      <b>{c.text}</b>{!compact && c.sub && <small>{c.sub}</small>}
    </span>
  );
}

export function BudgetToggle({ budget, onBudget }: { budget: PnlBudget; onBudget: (b: PnlBudget) => void }) {
  return (
    <span className="nxpl-budget" role="group" aria-label="P&L budget">
      {PNL_BUDGETS.map((b) => (
        <button key={b} type="button" aria-pressed={budget === b} className={budget === b ? 'on' : ''} onClick={() => onBudget(b)}>${b.toLocaleString('en-US')}</button>
      ))}
    </span>
  );
}

function VerifyChip({ v, open }: { v: PnlVerification | null | undefined; open: boolean }) {
  if (open) return <span className="nxpl-vchip muted" title="Open positions are verified after they close (nightly bar check, 17:30 ET).">unverified · open</span>;
  if (!v) return <span className="nxpl-vchip muted" title="Verify ledger not read for this idea.">unverified</span>;
  return <span className={`nxpl-vchip ${v.status === 'unverified' ? 'muted' : v.status}`} title={`${v.detail}${v.ledgerAsOf ? ` · ledger ${v.ledgerAsOf.slice(0, 16).replace('T', ' ')}Z` : ''}`}>{v.status}</span>;
}

/**
 * Setup Detail P&L block — entry premium, qty, debit, current / exit premium + time,
 * unrealized / realized $ and %, peak (premium · time · %), MFE / MAE, R, verified chip.
 */
export function NexusPnlBlock({ pick }: { pick: PnlPickLike & { ideaId: string } }) {
  const [budget, setBudget] = usePnlBudget();
  const now = Date.now();
  const boardMarkOf = useBoardMarkOf();
  const stored = useIdeaDetail(pick.ideaId, !pick.isBotHeld);
  const d = stored.data;
  const rec: PnlRecordLike | null = d ? {
    outcomeStatus: d.record.outcomeStatus, resolutionReason: d.record.resolutionReason,
    exitPremium: d.record.exitPremium ?? d.premium?.exitPremium ?? null, exitDate: d.record.exitDate ?? (d.premium?.exitAtMs != null ? new Date(d.premium.exitAtMs).toISOString() : null),
    optionPercentGain: d.record.optionPercentGain,
    peak: d.premium?.peak ? { premium: d.premium.peak.premium, atMs: d.premium.peak.atMs } : d.record.peak ? { premium: d.record.peak.premium, at: d.record.peak.at } : null,
    trough: d.premium?.trough ?? null,
    lastTrade: d.premium?.lastPremium != null && d.premium.lastPremium > 0
      ? { premium: d.premium.lastPremium, atMs: d.premium.asOf ? Date.parse(d.premium.asOf) : null, source: d.premium.source ? `last 1m bar · ${d.premium.source}` : 'last 1m bar' }
      : null,
  } : null;
  // Key for the own-marks fallback (detail opened without the board: /idea/:id, tool detail on its own).
  const probe = pickPnl(pick, budget, () => null, rec, now);
  const ownKeys = useMemo(() => (!boardMarkOf && probe.status === 'open' && probe.tradable ? [probe.tradable.key] : []), [boardMarkOf, probe.status, probe.tradable?.key]);
  const own = useNexusMarks(ownKeys);
  const markOf = boardMarkOf ?? own.markOf;
  const p = pickPnl(pick, budget, markOf, rec, now);
  const t = p.tradable;
  const head = (
    <div className="nxpl-block-head">
      <span>P&amp;L · options · whole contracts</span>
      <BudgetToggle budget={budget} onBudget={setBudget} />
    </div>
  );
  if (p.status === 'none' || !t) {
    return <section className="nxpl-block" aria-label="P&L" data-testid="nexus-pnl-block">{head}<p className="nxpl-none">{p.status === 'waiting' ? 'Waiting for a trigger — a plan has no P&L.' : 'No P&L'}{p.reason ? ` — ${p.reason}.` : ''}</p></section>;
  }
  const open = p.status === 'open';
  const label = p.status === 'waiting' ? 'Not triggered' : open ? 'Unrealized' : 'Realized';
  const markLine = p.loadingMark ? 'loading mark…'
    : p.premium == null ? (p.reason ?? '—')
    : p.markKind === 'last-trade' ? `${prem(p.premium)}${etClock(p.premiumAtMs) ? ` · ${etClock(p.premiumAtMs)} ET` : ''}`
    : `${prem(p.premium)} · ${p.premiumKind === 'exit' ? `exit ${etHm(p.premiumAtMs) ?? ''} ET` : `mark ${ageShort(p.premiumAtMs, now)} old${p.delayed ? ' · delayed' : ''}${p.stale ? ' · stale' : ''}`}`;
  // Peak: the stored option-peak tracking (budget contract) or the idea's bar read —
  // "reading bars…" only while that read is in flight; it always resolves to a value or a reason.
  const peakNote = stored.isLoading ? 'reading bars…' : stored.isError ? 'bar read failed — no peak' : d?.premiumNote ?? 'no peak recorded';
  const cells: Array<[string, string, string | null, string?]> = [
    ['Entry premium', prem(t.entryPremium), `${t.label}${t.basis === 'budget' ? ' · budget contract' : ''}`],
    ['Qty · debit', `${t.qty} × · $${t.debit.toLocaleString('en-US')}`, `at $${t.budget.toLocaleString('en-US')} budget`],
    [open ? (p.markKind === 'last-trade' ? 'Last trade (no live quote)' : 'Current premium') : p.status === 'resolved' ? 'Exit premium' : 'Current premium', p.status === 'waiting' ? '—' : markLine, p.source ?? null],
    [label, p.pnl == null ? '—' : usd(p.pnl), p.pct == null ? null : pctText(p.pct), toneCls(p.pnl)],
    ['Peak premium', p.peak ? prem(p.peak.premium) : '—', p.peak ? `${pctText(p.peak.pct)}${p.peak.atMs ? ` · ${etHm(p.peak.atMs)} ET` : ''}` : peakNote, p.peak ? toneCls(p.peak.pct) : undefined],
    ['MFE / MAE', `${p.peak ? usd(p.peak.pnl) : '—'} / ${p.trough ? usd(p.trough.pnl) : '—'}`, p.trough ? `low ${prem(p.trough.premium)} (${pctText(p.trough.pct)})` : 'best / worst open P&L'],
    ['R multiple', p.r == null ? '—' : `${p.r >= 0 ? '+' : ''}${p.r.toFixed(2)}R`, `stop ${prem(t.premiumStop)} · ${t.stopBasis}`, toneCls(p.r)],
  ];
  return (
    <section className="nxpl-block" aria-label="P&L" data-testid="nexus-pnl-block">
      {head}
      <div className="nxpl-block-sum">
        <PnlChipView p={p} now={now} />
        <VerifyChip v={d?.verification} open={p.status !== 'resolved'} />
      </div>
      <div className="nxpl-cells">
        {cells.map(([k, v, s, tone]) => <div key={k} className={tone ? `t-${tone}` : undefined}><span>{k}</span><strong>{v}</strong>{s && <small>{s}</small>}</div>)}
      </div>
      <p className="nxpl-foot">Same rules as the Journal: whole contracts, qty × (premium − entry) × 100. Marks are the contract's mid with their quote age — delayed feeds say so.</p>
    </section>
  );
}

/** Today's NEXUS P&L strip at the top of Ranked Setups (and per day on HISTORY). */
export function NexusDayStrip({ s, budget, onBudget, label, loading, timingMs }: { s: DaySummary; budget: PnlBudget; onBudget: (b: PnlBudget) => void; label: string; loading?: number; timingMs?: number | null }) {
  return (
    <div className="nxpl-day" role="region" aria-label={`${label} NEXUS P&L`} data-testid="nexus-day-strip">
      <div className="nxpl-day-main">
        <span className="nxpl-day-label">{label}</span>
        <strong className={toneCls(s.total)}>{s.realized === 0 && s.unrealized === 0 && s.wins + s.losses + s.open === 0 ? '$0' : usd(s.total)}</strong>
        <span className="nxpl-day-split">
          <span>realized <b className={toneCls(s.realized)}>{usd(s.realized)}</b></span>
          <span>unrealized <b className={toneCls(s.unrealized)}>{usd(s.unrealized)}</b>{s.staleMarks ? <em title="marks older than 5 min"> · {s.staleMarks} stale</em> : null}{s.lastTradeMarks ? <em title="no live quote — priced at the contract's last 1-min trade (time shown on each row)"> · {s.lastTradeMarks} at last trade</em> : null}</span>
        </span>
      </div>
      <div className="nxpl-day-meta">
        <span>{s.wins}W · {s.losses}L{s.flat ? ` · ${s.flat} flat` : ''} · {s.open} open{s.waiting ? ` · ${s.waiting} waiting` : ''}</span>
        {s.best && <span>best <b className={toneCls(s.best.pnl)}>{s.best.symbol} {usd(s.best.pnl)}</b></span>}
        {s.worst && s.worst.id !== s.best?.id && <span>worst <b className={toneCls(s.worst.pnl)}>{s.worst.symbol} {usd(s.worst.pnl)}</b></span>}
        {(loading ?? 0) > 0 && <span className="nxpl-loading">loading {loading} mark{loading === 1 ? '' : 's'}…</span>}
        {s.unmarked - (loading ?? 0) > 0 && <span title="open with no contract quote — not in unrealized">{s.unmarked - (loading ?? 0)} unquoted</span>}
        {s.unpriced > 0 && <span title="no tradable contract at this budget, or no exit premium recorded">{s.unpriced} unpriced</span>}
        <BudgetToggle budget={budget} onBudget={onBudget} />
        <Link href="/t?tab=journal&jtab=trades" className="nxpl-journal" title="The bar-verified book lives in the Journal (NEXUS ideas)">Verified book → Journal</Link>
        {timingMs != null && <span className="nxpl-timing" title="marks round trip">marks {timingMs} ms</span>}
      </div>
    </div>
  );
}
