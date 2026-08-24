/**
 * LEAP TRACKER — "A+ LEAPS to absolutely get"
 *
 * Ranks long-dated stock-replacement calls across a quality universe. Each card
 * shows the composite grade (S/A/B/C), the three pillars that earned it (sector
 * rotation, the name's own trend, contract quality), and the exact LEAP contract
 * the canonical engine selected — strike, expiry, delta, IV, premium, modeled ROI.
 *
 * Data: GET /api/leap-tracker  (server: leap-tracker.ts → getLeapTracker)
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Loader2, Telescope, TrendingUp, ShieldCheck, Waves, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QECard, QEPill, type QEPillVariant } from '@/components/ui/qe';
import { Segmented } from '@/components/templates/charts';
import { KitStyles } from '@/components/templates/kit';
import { LeapGrid } from './leap-grid';
import { useUserPrefs } from '@/components/terminal/terminal-settings';
import { sizingFor } from '@shared/sizing';

type LeapGrade = 'S' | 'A' | 'B' | 'C';
type Quadrant = 'leading' | 'improving' | 'weakening' | 'lagging';

interface LeapFundamentals {
  eps: number | null; revenue: number | null; revenueGrowth: number | null;
  cash: number | null; profitable: boolean | null; marketCap: number | null; forwardPE: number | null;
}

interface LeapPick {
  symbol: string; name: string; sectorEtf: string; sectorLabel: string; tier: 'core' | 'spec'; spot: number;
  fundamentals: LeapFundamentals | null;
  score: number; grade: LeapGrade; sectorScore: number; trendScore: number; contractScore: number;
  quadrant: Quadrant; sectorRel3M: number | null; sectorTrend: string;
  ret3M: number | null; ret6M: number | null; aboveSma50: boolean; aboveSma200: boolean; goldenCross: boolean;
  optionSymbol: string; strike: number; expiry: string; dte: number; delta: number; iv: number;
  entryPremium: number; breakeven: number; openInterest: number; spreadPct: number;
  roiAtT1Pct: number; roiAtT2Pct?: number; riskRewardRatio: number;
  why: string[]; ivLabel: 'cheap' | 'fair' | 'rich';
}

interface LeapTrackerData {
  asOf: string; sessionLabel: string; isStale: boolean; spyChange: number;
  scanned: number; qualified: number; picks: LeapPick[]; note?: string;
}

function useLeapTracker() {
  return useQuery<LeapTrackerData>({
    queryKey: ['/api/leap-tracker'],
    queryFn: async () => {
      const res = await fetch('/api/leap-tracker', { credentials: 'include' });
      if (!res.ok) throw new Error('leap tracker failed');
      return res.json();
    },
    staleTime: 300_000,
    refetchInterval: 900_000,
    retry: 1,
  });
}

const GRADE_META: Record<LeapGrade, { ring: string; text: string; bg: string; label: string }> = {
  S: { ring: 'ring-emerald-400/60', text: 'text-emerald-300', bg: 'bg-emerald-500/10', label: 'A+ conviction' },
  A: { ring: 'ring-cyan-400/50',    text: 'text-cyan-300',    bg: 'bg-cyan-500/10',    label: 'Strong' },
  B: { ring: 'ring-amber-400/40',   text: 'text-amber-300',   bg: 'bg-amber-500/10',   label: 'Watch' },
  C: { ring: 'ring-zinc-600/40',    text: 'text-zinc-400',    bg: 'bg-zinc-700/10',    label: 'Marginal' },
};

const QUAD_VARIANT: Record<Quadrant, QEPillVariant> = {
  leading: 'bull', improving: 'cyan', weakening: 'gold', lagging: 'bear',
};

const IV_VARIANT: Record<'cheap' | 'fair' | 'rich', QEPillVariant> = {
  cheap: 'bull', fair: 'cyan', rich: 'bear',
};

function fmtPct(v: number | null, digits = 1): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

function fmtMoney(v: number | null): string {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

/** Slim 3-segment pillar bar: sector (0-30) / trend (0-30) / contract (0-40). */
function PillarBar({ sector, trend, contract }: { sector: number; trend: number; contract: number }) {
  const seg = (v: number, max: number, color: string, label: string) => (
    <div className="flex-1" title={`${label}: ${v}/${max}`}>
      <div className="flex items-center justify-between text-[8px] text-zinc-500 mb-0.5">
        <span>{label}</span><span className="tabular-nums">{v}</span>
      </div>
      <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${(v / max) * 100}%` }} />
      </div>
    </div>
  );
  return (
    <div className="flex items-end gap-2">
      {seg(sector, 30, 'bg-cyan-400', 'Sector')}
      {seg(trend, 30, 'bg-emerald-400', 'Trend')}
      {seg(contract, 40, 'bg-violet-400', 'Contract')}
    </div>
  );
}

function LeapRow({ p }: { p: LeapPick }) {
  const [open, setOpen] = useState(false);
  const g = GRADE_META[p.grade];
  return (
    <QECard variant="default" padding="none" className={cn('overflow-hidden ring-1', g.ring)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-zinc-900/40 transition-colors"
      >
        {/* Grade badge */}
        <div className={cn('flex flex-col items-center justify-center h-11 w-11 rounded-lg shrink-0', g.bg)}>
          <span className={cn('text-lg font-mono font-bold leading-none', g.text)}>{p.grade}</span>
          <span className="text-[8px] font-mono text-zinc-500 tabular-nums">{p.score}</span>
        </div>

        {/* Ticker + sector */}
        <div className="min-w-0 w-28 shrink-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono font-bold text-zinc-100 text-[13px]">{p.symbol}</span>
            <span className="text-[10px] text-zinc-500 truncate">${p.spot.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <QEPill variant={QUAD_VARIANT[p.quadrant]} className="text-[8px]">{p.sectorLabel}</QEPill>
            {p.tier === 'spec' && (
              <span className="text-[7px] font-mono uppercase tracking-wider text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/30 rounded px-1 py-px">
                spec
              </span>
            )}
          </div>
        </div>

        {/* Pillars */}
        <div className="flex-1 min-w-0 hidden sm:block">
          <PillarBar sector={p.sectorScore} trend={p.trendScore} contract={p.contractScore} />
        </div>

        {/* Contract one-liner. Premium and DTE belong on the COLLAPSED row: a
            LEAP is chosen on what it costs and how much time it buys, and both
            were previously only visible after expanding — so the list could not
            be scanned for the thing it exists to rank. */}
        <div className="text-right shrink-0 w-40">
          <div className="font-mono text-[11px] text-zinc-200 tabular-nums">
            ${p.strike}C <span className="text-zinc-500">{p.expiry.slice(0, 7)}</span>
          </div>
          <div className="font-mono text-[11px] tabular-nums text-zinc-100">
            ${p.entryPremium.toFixed(2)}
            <span className="text-zinc-500"> · {p.dte}d</span>
          </div>
          <div className="font-mono text-[10px] text-emerald-400 tabular-nums">
            {fmtPct(p.roiAtT1Pct, 0)} <span className="text-zinc-600">@ +30%</span>
          </div>
        </div>

        <ChevronDown className={cn('h-4 w-4 text-zinc-600 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-zinc-800/70 space-y-3">
          {/* Mobile pillars */}
          <div className="sm:hidden">
            <PillarBar sector={p.sectorScore} trend={p.trendScore} contract={p.contractScore} />
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-[11px] font-mono">
            <Stat label="Contract" value={`$${p.strike}C ${p.expiry}`} />
            <Stat label="DTE / Δ" value={`${p.dte}d · ${p.delta.toFixed(2)}`} />
            <Stat label="Premium" value={`$${p.entryPremium.toFixed(2)}`} />
            <Stat label="Breakeven" value={`$${p.breakeven.toFixed(2)}`} />
            <Stat label="IV" value={`${(p.iv * 100).toFixed(0)}%`} pill={p.ivLabel} />
            <Stat label="Open Int" value={p.openInterest.toLocaleString()} />
            <Stat label="ROI +30%" value={fmtPct(p.roiAtT1Pct, 0)} tone="bull" />
            <Stat label="R:R" value={`${p.riskRewardRatio.toFixed(1)}:1`} />
          </div>

          {/* Fundamentals strip — EPS / revenue / cash so a high-flyer isn't
              mistaken for a profitable compounder. Omits fields Yahoo didn't return. */}
          {p.fundamentals && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-zinc-600 mr-1">Fundamentals</span>
              {p.fundamentals.profitable != null && (
                <span className={cn(
                  'text-[9px] font-mono rounded px-1.5 py-0.5 border',
                  p.fundamentals.profitable
                    ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5'
                    : 'text-rose-300 border-rose-500/30 bg-rose-500/5',
                )}>
                  {p.fundamentals.profitable ? 'Profitable' : 'Unprofitable'}
                </span>
              )}
              <FundChip label="EPS" value={p.fundamentals.eps != null ? `$${p.fundamentals.eps.toFixed(2)}` : null} />
              <FundChip label="Rev" value={fmtMoney(p.fundamentals.revenue)} />
              <FundChip
                label="Rev YoY"
                value={p.fundamentals.revenueGrowth != null ? fmtPct(p.fundamentals.revenueGrowth * 100, 0) : null}
                tone={p.fundamentals.revenueGrowth != null && p.fundamentals.revenueGrowth > 0 ? 'bull' : undefined}
              />
              <FundChip label="Cash" value={fmtMoney(p.fundamentals.cash)} />
              <FundChip label="Mkt Cap" value={fmtMoney(p.fundamentals.marketCap)} />
              <FundChip label="Fwd P/E" value={p.fundamentals.forwardPE != null ? p.fundamentals.forwardPE.toFixed(1) : null} />
            </div>
          )}

          {/* Trend strip */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-zinc-600 mr-1">Trend</span>
            <MiniBadge ok={p.aboveSma200} label="200d" icon={<TrendingUp className="h-2.5 w-2.5" />} />
            <MiniBadge ok={p.aboveSma50} label="50d" icon={<TrendingUp className="h-2.5 w-2.5" />} />
            <MiniBadge ok={p.goldenCross} label="GC" icon={<ShieldCheck className="h-2.5 w-2.5" />} />
            <span className="text-[10px] font-mono text-zinc-500 ml-1">
              3M {fmtPct(p.ret3M)} · 6M {fmtPct(p.ret6M)}
            </span>
          </div>

          {/* Why chips */}
          <div className="flex flex-wrap gap-1">
            {p.why.map((w, i) => (
              <span key={i} className="text-[9px] font-mono text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded px-1.5 py-0.5">
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
    </QECard>
  );
}

function Stat({ label, value, tone, pill }: { label: string; value: string; tone?: 'bull'; pill?: 'cheap' | 'fair' | 'rich' }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</div>
      <div className={cn('tabular-nums', tone === 'bull' ? 'text-emerald-400' : 'text-zinc-200')}>
        {pill ? <QEPill variant={IV_VARIANT[pill]} className="text-[9px]">{value} {pill}</QEPill> : value}
      </div>
    </div>
  );
}

function FundChip({ label, value, tone }: { label: string; value: string | null; tone?: 'bull' }) {
  if (value == null || value === '—') return null;
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono border border-zinc-800 bg-zinc-900/60">
      <span className="text-zinc-600 uppercase tracking-wider text-[8px]">{label}</span>
      <span className={cn('tabular-nums', tone === 'bull' ? 'text-emerald-400' : 'text-zinc-300')}>{value}</span>
    </span>
  );
}

function MiniBadge({ ok, label, icon }: { ok: boolean; label: string; icon: React.ReactNode }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-mono border',
      ok ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5' : 'text-zinc-600 border-zinc-800',
    )}>
      {icon}{label}
    </span>
  );
}

export function LeapTracker({ className }: { className?: string }) {
  const { data, isLoading, isError } = useLeapTracker();
  const { data: prefs } = useUserPrefs();
  const [minGrade, setMinGrade] = useState<LeapGrade>('B');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [affordableOnly, setAffordableOnly] = useState(false);
  /**
   * LEAPS budget, editable, separate from the per-trade risk rule.
   *
   * The account's `maxRiskPerTrade` (2% here = $200) is the right ceiling for a
   * weekly, where the premium really can go to zero. It is the wrong ceiling for
   * a Δ0.70 LEAP held 12-18 months, which is a stock REPLACEMENT — you are not
   * risking the full premium the way you are on a lottery ticket, and sizing it
   * by that rule makes literally every LEAP on the board unbuyable (measured:
   * 0 of 26 at $200).
   *
   * Rather than invent a LEAPS-specific risk percentage, this is just a number
   * the user sets. Defaults to the per-trade budget so nothing changes silently.
   */
  const [budgetInput, setBudgetInput] = useState<number | null>(null);

  // Same ladder the cockpit's Risk panel uses, so the two boards cannot disagree
  // about what this account can buy. LEAPS are always long-dated, so this always
  // resolves to the ALLOCATION basis (defaultCapitalPerIdea) rather than the
  // per-trade risk rule — which is the whole reason 0 of 26 were buyable before.
  const ladderBudget = sizingFor(400, prefs as any).budget;
  const perTradeBudget = budgetInput ?? ladderBudget;

  if (isLoading) {
    return (
      <QECard variant="default" padding="lg" className={cn('flex items-center gap-2', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
        <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">Scanning LEAP chains for A+ setups…</span>
      </QECard>
    );
  }

  if (isError || !data || data.picks.length === 0) {
    return (
      <QECard variant="default" padding="lg" className={cn('flex items-center gap-2', className)}>
        <Telescope className="h-4 w-4 text-zinc-600" />
        <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-600">
          {data?.note ?? 'LEAP tracker unavailable'}
        </span>
      </QECard>
    );
  }

  const order: LeapGrade[] = ['S', 'A', 'B', 'C'];
  const cutoff = order.indexOf(minGrade);
  const graded = data.picks.filter((p) => order.indexOf(p.grade) <= cutoff);

  // AFFORDABILITY. Measured on the live board: median contract cost $4,712,
  // range $106–$29,580. On a $1,500 per-trade budget only 16 of 52 are buyable,
  // so by default this board spends most of its space on trades the account
  // cannot take. The filter is off by default — hiding picks silently would be
  // worse — but the count is always stated so the gap is visible.
  const affordable = perTradeBudget > 0
    ? graded.filter((p) => p.entryPremium * 100 <= perTradeBudget)
    : graded;
  const picks = affordableOnly ? affordable : graded;
  const unaffordable = graded.length - affordable.length;
  const sCount = data.picks.filter((p) => p.grade === 'S').length;
  const aCount = data.picks.filter((p) => p.grade === 'A').length;

  return (
    <div className={cn('space-y-3', className)}>
      <KitStyles />
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Telescope className="h-4 w-4 text-[var(--brand-cyan,#22d3ee)]" />
        <span className="text-[12px] font-mono font-bold uppercase tracking-widest text-zinc-200">LEAP Tracker</span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider',
            data.isStale ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25' : 'bg-emerald-500/15 text-emerald-400',
          )}
        >
          {data.isStale ? `${data.sessionLabel} · stale` : data.sessionLabel}
        </span>
        <span className="text-[10px] font-mono text-zinc-500">
          {data.qualified}/{data.scanned} with liquid LEAPS · {sCount} A+ · {aCount} strong
        </span>
        <span className={cn('ml-auto text-[11px] font-mono tabular-nums', data.spyChange >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
          SPY {fmtPct(data.spyChange, 2)}
        </span>
      </div>

      {/* Subtitle + grade filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Waves className="h-3 w-3 text-zinc-600" />
        <span className="text-[10px] font-mono text-zinc-500">
          Stock-replacement calls — secular leaders in inflowing sectors, deep-ITM &amp; liquid
        </span>
        {/* Budget gate. The count is separated from the amount — glued together
            they rendered as "≤ $2000" when the real reading was "≤ $200 · 0". */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wider text-zinc-500">Budget</span>
          <span className="flex items-center rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
            $
            <input
              type="number"
              value={perTradeBudget || ''}
              onChange={(e) => setBudgetInput(Number(e.target.value) || 0)}
              className="w-16 bg-transparent outline-none tabular-nums"
              aria-label="Max cost of one LEAP contract"
            />
          </span>
          <button
            onClick={() => setAffordableOnly((v) => !v)}
            title={`Show only LEAPS where one contract costs $${perTradeBudget.toLocaleString()} or less`}
            className={cn(
              'rounded border px-2 py-0.5 font-mono text-[10px] transition-colors cursor-pointer',
              affordableOnly
                ? 'border-cyan-500/30 bg-cyan-500/20 text-cyan-300'
                : 'border-zinc-700 text-zinc-400 hover:text-zinc-200',
            )}
          >
            affordable · {affordable.length}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-zinc-600 mr-1">Min grade</span>
          {(['S', 'A', 'B', 'C'] as LeapGrade[]).map((gr) => (
            <button
              key={gr}
              onClick={() => setMinGrade(gr)}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-mono cursor-pointer transition-colors',
                minGrade === gr ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-zinc-500 border border-transparent hover:text-zinc-300',
              )}
            >
              {gr}
            </button>
          ))}
        </div>
      </div>

      {/* Picks — LIST for scanning 52 in rank order, GRID for comparing the
          shortlist's contracts side by side. Both render the same filtered set;
          the toggle is the reference site's .hp-switch doing real work. */}
      <div className="flex justify-end">
        <Segmented
          options={[{ value: 'list' as const, label: 'List' }, { value: 'grid' as const, label: 'Grid' }]}
          value={view}
          onChange={setView}
        />
      </div>

      {picks.length === 0 ? (
        <div className="text-[11px] font-mono text-zinc-600 py-4 text-center">
          No {minGrade}+ LEAPS right now — loosen the grade filter.
        </div>
      ) : view === 'list' ? (
        <div className="space-y-1.5">
          {picks.map((p) => <LeapRow key={p.symbol} p={p} />)}
        </div>
      ) : (
        <LeapGrid picks={picks} />
      )}

      {/* Footnote */}
      <div className="text-[9px] font-mono text-zinc-600 leading-snug">
        {perTradeBudget > 0 && unaffordable > 0 && !affordableOnly && (
          <span className="block mb-1 text-[var(--brand-gold)]">
            {unaffordable} of {graded.length} cost more than one contract of your ${perTradeBudget.toLocaleString()} per-trade budget.
          </span>
        )}
        Grade = Sector rotation (30) + name trend (30) + contract quality (40). ROI modeled at a +30% underlying move via Black-Scholes off the live mid. Not advice.
      </div>
    </div>
  );
}
