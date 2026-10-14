/**
 * ContractEngine — ONE contract engine: one set of limits, one ranked list.
 * ========================================================================
 * Replaces the old pair that rendered side by side — "Contract Engine · Pick
 * Tier" (POST /api/options/select) and "Fit my budget" (GET /api/contract-picker)
 * — which carried two account inputs, two conflicting caps, all-F grades and an
 * empty state that contradicted the list above it.
 *
 * Now:
 *   - Limits (account, max loss per trade, max debit, DTE window) live in ONE
 *     per-user store (localStorage, shared live across every mounted engine).
 *   - GET /api/contract-engine/:symbol ranks the chain against those limits.
 *     Contracts that fit come first; the rest sit in a separate "outside your
 *     limits" group naming the exact rule each breaks.
 *   - Grades are contract quality only, with four visible components (target
 *     odds, R:R to T1, liquidity, decay & IV). Formula: shared/contract-engine.ts.
 *   - Tiers are labels on rows (by |delta|), not a separate picker.
 *   - Source + age are the chain actually used (Alpaca indicative / CBOE
 *     delayed / Yahoo) — never assumed.
 */
import { gradeColor as canonGradeColor } from '@/components/canon/score';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseMarketDate } from '@/lib/market-date';
import { TC } from '@/lib/design-tokens';
import {
  DTE_PRESETS,
  dteWindowForHold,
  holdDaysForLabel,
  type ContractEngineResult,
  type ContractTier,
  type Letter,
  type RankedContract,
  type RelaxAction,
} from '@shared/contract-engine';
import { ContractValuePanel } from './contract-value-panel';

export type { RankedContract } from '@shared/contract-engine';

// ─── One per-user limits store ───────────────────────────────────────────

export interface ContractLimits {
  accountSize: number;
  maxLossDollars: number;
  maxDebitDollars: number;
  /** null = follow the idea's holding horizon. */
  dteMin: number | null;
  dteMax: number | null;
}

const LIMITS_KEY = 'qe-contract-engine-limits';
const DEFAULT_LIMITS: ContractLimits = { accountSize: 10_000, maxLossDollars: 250, maxDebitDollars: 500, dteMin: null, dteMax: null };

function readLimits(): ContractLimits {
  try {
    const saved = JSON.parse(localStorage.getItem(LIMITS_KEY) ?? 'null');
    if (saved && typeof saved === 'object') return { ...DEFAULT_LIMITS, ...saved };
    // One-time carry-over from the old Pick-Tier profile so nobody loses their numbers.
    const old = JSON.parse(localStorage.getItem('qe-contract-risk-profile') ?? 'null');
    if (old && typeof old === 'object') {
      return {
        ...DEFAULT_LIMITS,
        accountSize: Number(old.accountSize) > 0 ? Number(old.accountSize) : DEFAULT_LIMITS.accountSize,
        maxLossDollars: Number(old.riskBudgetDollars) > 0 ? Number(old.riskBudgetDollars) : DEFAULT_LIMITS.maxLossDollars,
        maxDebitDollars: Number(old.maxDebitDollars) > 0 ? Number(old.maxDebitDollars) : DEFAULT_LIMITS.maxDebitDollars,
      };
    }
  } catch { /* storage blocked — defaults */ }
  return DEFAULT_LIMITS;
}

let limitsState: ContractLimits | null = null;
const listeners = new Set<() => void>();
function getLimits(): ContractLimits {
  if (!limitsState) limitsState = readLimits();
  return limitsState;
}
export function setContractLimits(patch: Partial<ContractLimits>) {
  limitsState = { ...getLimits(), ...patch };
  try { localStorage.setItem(LIMITS_KEY, JSON.stringify(limitsState)); } catch { /* ok */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function useContractLimits(): ContractLimits {
  return useSyncExternalStore(subscribe, getLimits, getLimits);
}

// ─── Formatting ──────────────────────────────────────────────────────────

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const px = (n: number) => `$${n.toFixed(2)}`;

function fmtExpiry(expiry: string): string {
  try {
    const d = parseMarketDate(expiry) ?? new Date(expiry);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { /* fall through */ }
  return expiry;
}

function ageLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const m = Math.max(0, Math.round(ms / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

const TIER_STYLE: Record<ContractTier, { color: string; label: string; hint: string }> = {
  conservative: { color: TC.bull, label: 'CONSERVATIVE', hint: '|Δ| ≥ 0.60 — deep in the money, least theta per $ of delta' },
  balanced: { color: TC.info, label: 'BALANCED', hint: '|Δ| 0.40–0.60 — near the money' },
  aggressive: { color: TC.warn, label: 'AGGRESSIVE', hint: '|Δ| 0.22–0.40 — out of the money, convex' },
  starter: { color: '#a78bfa', label: 'STARTER', hint: '|Δ| under 0.22 — cheapest way to express the view, lowest odds' },
};

/** One grade palette (canon/score.tsx). */
const gradeColor = (g: Letter | null): string => canonGradeColor(g);

function GradeChip({ grade, score, partial }: { grade: Letter | null; score?: number | null; partial?: boolean }) {
  const c = gradeColor(grade);
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums"
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
      title={partial ? 'Partial grade — no idea target, so target odds and R:R are not graded' : undefined}
    >
      {grade ?? '—'}{score != null ? ` · ${score}` : ''}{partial ? '*' : ''}
    </span>
  );
}

/** Underlying daily closes for the IV-vs-realized read in ContractValuePanel. */
function useUnderlyingCloses(symbol: string, enabled: boolean) {
  const { data } = useQuery<number[]>({
    queryKey: ['/api/historical-prices', symbol, 'contract-value'],
    queryFn: async () => {
      const r = await fetch(`/api/historical-prices/${symbol}?range=3mo&interval=1d`, { credentials: 'include' });
      if (!r.ok) return [];
      const j = await r.json();
      const rows = Array.isArray(j) ? j : (j?.data ?? []);
      return rows.map((c: any) => Number(c?.close ?? c?.c ?? c)).filter((n: number) => Number.isFinite(n) && n > 0);
    },
    staleTime: 15 * 60_000,
    retry: 0,
    enabled: !!symbol && enabled,
  });
  return data ?? [];
}

// ─── Inputs ──────────────────────────────────────────────────────────────

function MoneyInput({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  // Commit after a pause so each keystroke does not refetch the chain.
  useEffect(() => {
    const n = Number(draft);
    if (!(n > 0) || n === value) return;
    const t = setTimeout(() => onCommit(Math.round(n)), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  return (
    <label className="min-w-0">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="flex items-center rounded border border-card-border bg-background/40 px-2">
        <span className="font-mono text-[11px] text-muted-foreground">$</span>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { const n = Number(draft); if (n > 0 && n !== value) onCommit(Math.round(n)); else setDraft(String(value)); }}
          className="w-full min-w-0 bg-transparent px-1 py-1.5 font-mono text-[12px] tabular-nums text-foreground outline-none"
          aria-label={label}
        />
      </span>
    </label>
  );
}

// ─── Rows ────────────────────────────────────────────────────────────────

function ContractRow({
  c, rank, recommended, expanded, onToggle, selected, onPick, spot, t1, closes, outside,
}: {
  c: RankedContract; rank: number; recommended: boolean; expanded: boolean; onToggle: () => void;
  selected: boolean; onPick: () => void; spot: number; t1: number | null; closes: number[]; outside?: boolean;
}) {
  const st = TIER_STYLE[c.tier];
  const cp = c.optionType === 'call' ? 'C' : 'P';
  return (
    <div
      className="rounded-md border bg-foreground/[0.02]"
      style={{ borderColor: selected ? st.color : 'var(--card-border)', opacity: outside ? 0.92 : 1 }}
      data-testid={`contract-row-${c.occ}`}
    >
      <button
        type="button"
        onClick={() => { onToggle(); if (!outside) onPick(); }}
        aria-expanded={expanded}
        className="w-full cursor-pointer px-2.5 py-2 text-left hover:bg-foreground/[0.03]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono text-[10px] text-muted-foreground">{outside ? '·' : `#${rank}`}</span>
            <span className="font-mono text-[10px] font-bold tracking-widest" style={{ color: st.color }} title={st.hint}>{st.label}</span>
            {recommended && (
              <span className="rounded px-1.5 py-px font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: TC.info, background: `color-mix(in srgb, ${TC.info} 14%, transparent)` }}>
                Top fit
              </span>
            )}
          </div>
          <GradeChip grade={c.grade} score={c.score} partial={c.partialGrade} />
        </div>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="font-mono text-[15px] font-bold tabular-nums text-foreground">
            ${c.strike}{cp}
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{fmtExpiry(c.expiry)} · {c.dte}DTE</span>
          </span>
          <span className="font-mono text-[12px] tabular-nums text-foreground">
            <b>{usd(c.debitPerContract)}</b><span className="text-muted-foreground">/contract · {px(c.mid)}/sh</span>
          </span>
        </div>
        {outside ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {c.violations.map((v) => (
              <span key={v.rule} className="rounded border px-1.5 py-px font-mono text-[11px]" style={{ color: TC.bear, borderColor: `color-mix(in srgb, ${TC.bear} 40%, transparent)` }}>
                {v.message}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {c.contractsAffordable}× fit · max loss {usd(c.riskPerContract)}/contract {c.riskBasis === 'underlying_stop' ? 'at the stop' : '(−50% premium stop)'}
            {c.roiAtT1Pct != null ? ` · ${c.roiAtT1Pct >= 0 ? '+' : ''}${c.roiAtT1Pct.toFixed(0)}% at T1` : ''}
          </div>
        )}
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-border/30 px-2.5 pb-2.5 pt-2">
          {/* Grade components — the grade is never a bare letter. */}
          <div className="space-y-1.5">
            {c.components.map((k) => (
              <div key={k.key} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-[11px] font-bold text-foreground">{k.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{Math.round(k.weight * 100)}% weight</span>
                    <span className="font-mono text-[11px] tabular-nums text-foreground">{k.value}</span>
                  </div>
                  <div className="font-mono text-[11px] leading-snug text-muted-foreground">{k.why}</div>
                </div>
                <GradeChip grade={k.grade} score={k.score} />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-1 font-mono text-[11px]">
            {[
              ['Bid×Ask', `${c.bid.toFixed(2)}×${c.ask.toFixed(2)}`],
              ['Δ', c.delta.toFixed(2)],
              ['Θ/day', c.theta != null ? c.theta.toFixed(2) : '—'],
              ['IV', c.iv != null ? `${Math.round(c.iv * 100)}%` : '—'],
              ['OI', c.openInterest != null ? c.openInterest.toLocaleString('en-US') : 'n/a'],
              ['Vol', c.volume != null ? c.volume.toLocaleString('en-US') : 'n/a'],
              ['BE', px(c.breakeven)],
              ['@T1', c.projectedAtT1 != null ? px(c.projectedAtT1) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
                <div className="truncate font-bold tabular-nums text-foreground">{v}</div>
              </div>
            ))}
          </div>

          {c.lossAtStopPerContract != null && (
            <div className="font-mono text-[11px] text-muted-foreground">
              Stock at the stop → modelled loss {usd(c.lossAtStopPerContract)}/contract; −50% premium stop = {usd(c.debitPerContract / 2)}. Planned loss is the smaller: {usd(c.riskPerContract)}.
            </div>
          )}

          {c.flags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.flags.map((f) => (
                <span key={f} className="rounded border px-1.5 py-px font-mono text-[11px]" style={{ color: TC.warn, borderColor: `color-mix(in srgb, ${TC.warn} 35%, transparent)` }}>{f}</span>
              ))}
            </div>
          )}

          {c.iv != null && (
            <ContractValuePanel
              spot={spot} strike={c.strike} optionType={c.optionType} iv={c.iv} dte={c.dte}
              bid={c.bid} ask={c.ask} mid={c.mid} theta={c.theta} targetPrice={t1} closes={closes}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Engine ──────────────────────────────────────────────────────────────

interface Props {
  symbol: string;
  /** Direction from the idea. Omitted / NEUTRAL → the user picks calls or puts. */
  direction?: 'BULL' | 'BEAR' | 'NEUTRAL';
  entry?: number | null;
  stop?: number | null;
  t1?: number | null;
  /** Kept for callers; the unified engine grades against T1. */
  t2?: number;
  holdPeriodLabel?: string | null;
  /** Kept for callers; limits, not conviction, decide what is shown. */
  conviction?: number;
  /** Kept for callers; the engine always loads (one cached chain read). */
  autoLoad?: boolean;
  title?: string;
  onSelect?: (pick: RankedContract) => void;
  /** Fires with the active contract (top fit by default) whenever it changes. */
  onResolve?: (pick: RankedContract | null) => void;
}

export function ContractEngine({ symbol, direction, entry, stop, t1, holdPeriodLabel, title, onSelect, onResolve }: Props) {
  const limits = useContractLimits();
  const fromIdea = direction === 'BULL' || direction === 'BEAR';
  const [manualSide, setManualSide] = useState<'long' | 'short'>('long');
  const side: 'long' | 'short' = fromIdea ? (direction === 'BEAR' ? 'short' : 'long') : manualSide;
  const ideaWindow = dteWindowForHold(holdPeriodLabel);
  const dteMin = limits.dteMin ?? ideaWindow.min;
  const dteMax = limits.dteMax ?? ideaWindow.max;
  const holdDays = holdDaysForLabel(holdPeriodLabel);
  const validT1 = t1 != null && Number.isFinite(t1) && t1 > 0 ? t1 : null;
  const validStop = stop != null && Number.isFinite(stop) && stop > 0 ? stop : null;

  const url = useMemo(() => {
    const qs = new URLSearchParams({
      direction: side,
      account: String(limits.accountSize),
      maxLoss: String(limits.maxLossDollars),
      maxDebit: String(limits.maxDebitDollars),
      dteMin: String(dteMin),
      dteMax: String(dteMax),
      holdDays: String(holdDays),
    });
    if (validT1 != null) qs.set('t1', String(validT1));
    if (validStop != null) qs.set('stop', String(validStop));
    if (entry != null && Number.isFinite(entry)) qs.set('entry', String(entry));
    return `/api/contract-engine/${encodeURIComponent(symbol)}?${qs}`;
  }, [symbol, side, limits.accountSize, limits.maxLossDollars, limits.maxDebitDollars, dteMin, dteMax, holdDays, validT1, validStop, entry]);

  const q = useQuery<ContractEngineResult>({
    queryKey: [url],
    queryFn: async () => {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!symbol,
    staleTime: 60_000,
    // Re-rank every 3 minutes while visible — a one-shot fetch left an open
    // cockpit showing hour-old premium (audit 2026-09-24).
    refetchInterval: 180_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
    retry: 0,
  });
  const data = q.data;

  const [openRow, setOpenRow] = useState<string | null>(null);
  const [selectedOcc, setSelectedOcc] = useState<string | null>(null);
  const [showOutside, setShowOutside] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const closes = useUnderlyingCloses(symbol, !!openRow);

  const active = data?.within.find((c) => c.occ === selectedOcc) ?? data?.within[0] ?? null;
  useEffect(() => {
    onResolve?.(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.occ]);

  const applyRelax = (a: RelaxAction) => {
    const patch: Partial<ContractLimits> = {};
    if (a.maxDebitDollars != null) patch.maxDebitDollars = a.maxDebitDollars;
    if (a.maxLossDollars != null) patch.maxLossDollars = a.maxLossDollars;
    if (a.dteMin != null && a.dteMax != null) { patch.dteMin = a.dteMin; patch.dteMax = a.dteMax; }
    setContractLimits(patch);
  };

  const kind = side === 'long' ? 'calls' : 'puts';
  const src = data?.source;
  const within = data?.within ?? [];
  const visible = showAll ? within : within.slice(0, 5);

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-card-border bg-card" data-testid="contract-engine">
      {/* Header — what, and from which chain */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border/30 px-3 py-2.5">
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-foreground">
          {title ?? 'Contract engine'} · {symbol} {kind}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {data?.spot != null ? `Spot ${px(data.spot)}` : ''}
          {validT1 != null ? ` · T1 ${px(validT1)}` : ''}
          {validStop != null ? ` · stop ${px(validStop)}` : ''}
        </span>
      </header>

      {/* One set of limits */}
      <div className="space-y-2 border-b border-border/30 bg-foreground/[0.015] px-3 py-2.5">
        <div className="grid grid-cols-3 gap-2">
          <MoneyInput label="Account" value={limits.accountSize} onCommit={(v) => setContractLimits({ accountSize: v })} />
          <MoneyInput label="Max loss/trade" value={limits.maxLossDollars} onCommit={(v) => setContractLimits({ maxLossDollars: v })} />
          <MoneyInput label="Max debit" value={limits.maxDebitDollars} onCommit={(v) => setContractLimits({ maxDebitDollars: v })} />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">DTE</span>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5">
            {DTE_PRESETS.map((p) => {
              const on = p.min === dteMin && p.max === dteMax;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setContractLimits({ dteMin: p.min, dteMax: p.max })}
                  className="shrink-0 cursor-pointer rounded border px-2 py-1 font-mono text-[11px]"
                  style={{
                    color: on ? TC.info : 'var(--muted-foreground)',
                    borderColor: on ? TC.info : 'var(--card-border)',
                    background: on ? `color-mix(in srgb, ${TC.info} 12%, transparent)` : 'transparent',
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
          {fromIdea ? (
            <span>
              Direction <b style={{ color: side === 'long' ? TC.bull : TC.bear }}>{side === 'long' ? 'LONG → calls' : 'SHORT → puts'}</b> from the idea
            </span>
          ) : (
            <span className="flex items-center gap-1">
              {(['long', 'short'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setManualSide(s)}
                  className="cursor-pointer rounded border px-2 py-0.5"
                  style={{ color: manualSide === s ? (s === 'long' ? TC.bull : TC.bear) : 'var(--muted-foreground)', borderColor: manualSide === s ? 'currentColor' : 'var(--card-border)' }}
                >
                  {s === 'long' ? 'Calls' : 'Puts'}
                </button>
              ))}
              <span>· no idea attached — grade is liquidity + cost only</span>
            </span>
          )}
          {limits.dteMin == null ? (
            <span>window follows the idea horizon</span>
          ) : (
            (ideaWindow.min !== dteMin || ideaWindow.max !== dteMax) && holdPeriodLabel ? (
              <button type="button" className="cursor-pointer underline" onClick={() => setContractLimits({ dteMin: null, dteMax: null })}>
                use idea horizon ({ideaWindow.min}–{ideaWindow.max}d)
              </button>
            ) : null
          )}
        </div>
      </div>

      <div className="space-y-2 px-3 py-2.5">
        {/* Source line — the chain actually used */}
        {src && (
          <div className="font-mono text-[11px] text-muted-foreground" title={src.note}>
            Chain: <b className="text-foreground">{src.label}</b> · fetched {ageLabel(src.fetchedAt)}
            {src.quotesAsOf ? ` · newest quote ${ageLabel(src.quotesAsOf)}` : ''}
            {src.openInterestDate ? ` · OI as of ${src.openInterestDate}` : ''}
            {q.isFetching ? ' · refreshing…' : ''}
          </div>
        )}

        {q.isLoading && (
          <div className="animate-pulse font-mono text-[12px] text-muted-foreground">Reading the {symbol} chain…</div>
        )}
        {q.isError && !data && (
          <div className="font-mono text-[12px]" style={{ color: TC.bear }}>
            The contract engine request failed. <button type="button" className="cursor-pointer underline" onClick={() => q.refetch()}>Retry</button>
          </div>
        )}

        {data && data.within.length > 0 && (
          <>
            <div className="font-mono text-[11px] text-muted-foreground">
              <b className="text-foreground">{data.counts.withinLimits}</b> of {data.counts.tradeable} tradeable {kind} in {dteMin}–{dteMax} DTE fit your limits · ranked by grade
            </div>
            <div className="space-y-1.5">
              {visible.map((c, i) => (
                <ContractRow
                  key={c.occ} c={c} rank={i + 1} recommended={i === 0}
                  expanded={openRow === c.occ} onToggle={() => setOpenRow(openRow === c.occ ? null : c.occ)}
                  selected={active?.occ === c.occ}
                  onPick={() => { setSelectedOcc(c.occ); onSelect?.(c); }}
                  spot={data.spot ?? 0} t1={validT1} closes={closes}
                />
              ))}
            </div>
            {within.length > 5 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="cursor-pointer font-mono text-[11px] underline" style={{ color: TC.info }}>
                {showAll ? 'Show top 5' : `Show all ${within.length}`}
              </button>
            )}
          </>
        )}

        {/* The one empty state — names the constraint and offers the fix */}
        {data && data.within.length === 0 && (
          <div className="rounded-md border px-3 py-2.5" style={{ borderColor: `color-mix(in srgb, ${TC.warn} 35%, transparent)`, background: `color-mix(in srgb, ${TC.warn} 6%, transparent)` }} data-testid="contract-engine-empty">
            <div className="font-mono text-[12px] leading-snug text-foreground">
              {data.emptyReason ?? `Nothing fits your limits in ${dteMin}–${dteMax} DTE.`}
            </div>
            {data.relax.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.relax.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => applyRelax(a)}
                    className="cursor-pointer rounded border px-2 py-1 font-mono text-[11px] font-bold"
                    style={{ color: TC.info, borderColor: `color-mix(in srgb, ${TC.info} 40%, transparent)` }}
                    title={`${a.unlocks} contract${a.unlocks === 1 ? '' : 's'} would fit`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            {data.status === 'no_chain' && (
              <button type="button" className="mt-2 cursor-pointer font-mono text-[11px] underline" style={{ color: TC.info }} onClick={() => q.refetch()}>Retry</button>
            )}
          </div>
        )}

        {/* Outside your limits — separate, with the rule each one breaks */}
        {data && data.outside.length > 0 && (
          <div className="border-t border-border/30 pt-2">
            <button type="button" onClick={() => setShowOutside((v) => !v)} className="flex w-full cursor-pointer items-center justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <span>Outside your limits · {data.counts.outsideLimits}</span>
              <span>{showOutside || data.within.length === 0 ? 'hide' : 'show'}</span>
            </button>
            {(showOutside || data.within.length === 0) && (
              <div className="mt-1.5 space-y-1.5">
                {data.outside.map((c, i) => (
                  <ContractRow
                    key={c.occ} c={c} rank={i + 1} recommended={false} outside
                    expanded={openRow === c.occ} onToggle={() => setOpenRow(openRow === c.occ ? null : c.occ)}
                    selected={false} onPick={() => {}}
                    spot={data.spot ?? 0} t1={validT1} closes={closes}
                  />
                ))}
                {data.counts.outsideLimits > data.outside.length && (
                  <div className="font-mono text-[11px] text-muted-foreground">Closest {data.outside.length} to fitting shown.</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* How grades work — stated, not implied */}
        <div className="border-t border-border/30 pt-2">
          <button type="button" onClick={() => setShowMethod((v) => !v)} className="cursor-pointer font-mono text-[11px] text-muted-foreground underline">
            {showMethod ? 'Hide' : 'How'} grades and limits work
          </button>
          {showMethod && (
            <ul className="mt-1.5 list-disc space-y-1 pl-4 font-mono text-[11px] leading-snug text-muted-foreground">
              <li>Limits are hard rules applied first: one contract's debit must be ≤ max debit and ≤ account, and its planned loss ≤ max loss. They never change the grade.</li>
              <li>Planned loss = the smaller of the modelled loss if the stock hits the idea's stop and the −50% premium stop.</li>
              <li>Grade = target odds 30% (touch T1 + finish past breakeven, from the expiry's ATM IV) · R:R to T1 30% · liquidity 20% (spread, OI, volume) · decay &amp; IV 20% (theta over the hold, IV vs ATM). A ≥ 80 · B ≥ 65 · C ≥ 50 · D ≥ 35 · F below.</li>
              <li>IV rank is not computed — there is no IV-history feed. * marks a partial grade (no idea target).</li>
              <li>Tier labels follow |Δ|: conservative ≥ 0.60 · balanced 0.40–0.60 · aggressive 0.22–0.40 · starter below.</li>
              {src && <li>{src.note}</li>}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
