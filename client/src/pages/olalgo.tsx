/**
 * OlAlgo Bot — Challenge Dashboard
 * ================================
 * Backtests "$300 → $3,000 → $30,000" by replaying real historical
 * trade ideas through the bot's risk gates. Each "challenge" is a
 * Monte Carlo of N seeded simulations against one (mode × pool) combo:
 *
 *   • lotto   × last 90 days
 *   • lotto   × full history
 *   • swing   × last 90 days
 *   • swing   × full history
 *
 * The page lets the user fire all four (or any subset) and compares the
 * outcome distribution side by side. The single best run is rendered as
 * a NELA-style trade journal so the user can audit what actually happened.
 */

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { QEPageShell, QEPageHeader, QESectionDivider } from '@/components/ui/qe-page-shell';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { Bot, Play, Loader2, Trophy, Skull } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Types — mirror server/olalgo-backtest.ts
// ─────────────────────────────────────────────────────────────

type Mode = 'lotto' | 'swing' | 'mixed';
type Pool = 'last_90d' | 'full_history';

interface SimulatedTrade {
  ideaId: string;
  symbol: string;
  direction: 'long' | 'short';
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  contracts: number;
  riskedDollars: number;
  realizedPnL: number;
  pnlPct: number;
  outcome: 'win' | 'loss' | 'breakeven';
  reason: 'hit_target' | 'hit_stop' | 'expired' | 'manual';
  equityAfter: number;
  confidence: number;
  catalyst: string;
  tradeType: string | null;
}

interface ChallengeRunResult {
  startedAt: string;
  endedAt: string;
  startingCapital: number;
  endingCapital: number;
  peakCapital: number;
  troughCapital: number;
  vaultBalance: number;
  totalRealized: number;
  skimEvents: number;
  hitTarget: boolean;
  hitStretch: boolean;
  busted: boolean;
  daysToTarget: number | null;
  daysToStretch: number | null;
  totalDays: number;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  expectancy: number;
  maxDrawdownPct: number;
  longestLossStreak: number;
  longestWinStreak: number;
  trades: SimulatedTrade[];
  equityCurve: Array<{ timestamp: string; equity: number; openPositions: number; totalTrades: number }>;
}

interface MonteCarloResult {
  runs: number;
  poolSize: number;
  hitTargetCount: number;
  hitTargetPct: number;
  hitStretchCount: number;
  hitStretchPct: number;
  bustedCount: number;
  bustedPct: number;
  profitableCount: number;
  profitablePct: number;
  endingEquityP10: number;
  endingEquityP25: number;
  endingEquityP50: number;
  endingEquityP75: number;
  endingEquityP90: number;
  endingEquityMean: number;
  endingEquityMax: number;
  endingEquityMin: number;
  medianDaysToTarget: number | null;
  medianDaysToStretch: number | null;
  vaultBalanceP50: number;
  vaultBalanceMean: number;
  vaultBalanceMax: number;
  totalRealizedP50: number;
  totalRealizedMean: number;
  totalRealizedMax: number;
  medianSkimEvents: number;
  worstDrawdown: number;
  medianDrawdown: number;
  longestLossStreak: number;
  perRunSummary: Array<{
    seed: number;
    endingCapital: number;
    vaultBalance: number;
    totalRealized: number;
    hitTarget: boolean;
    hitStretch: boolean;
    busted: boolean;
    profitable: boolean;
    totalTrades: number;
    winRate: number;
    maxDrawdown: number;
  }>;
  bestRun: ChallengeRunResult;
  worstRun: ChallengeRunResult;
}

interface ChallengeKey {
  id: string;
  mode: Mode;
  pool: Pool;
  overrides?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// OlAlgoMax — LEAPs/swings portfolio (separate from challenge tiers)
// Mirrors server/olalgo-max.ts return shape.
// ─────────────────────────────────────────────────────────────

interface OlAlgoMaxClosedTrade {
  symbol: string;
  sector: string;
  entryDate: string;
  exitDate: string;
  reason: 'trim_runner' | 'hard_stop' | 'expired';
  initialCost: number;
  totalRealized: number;
  pnl: number;
  pnlPct: number;
  contracts: number;
  dte: number;
  delta: number;
  trim1Hit: boolean;
  trim2Hit: boolean;
}

interface OlAlgoMaxRun {
  startingCapital: number;
  endingEquity: number;
  totalRealizedPnL: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  trim1Events: number;
  trim2Events: number;
  runnerExits: number;
  hardStops: number;
  expirations: number;
  trades: OlAlgoMaxClosedTrade[];
  equityCurve: Array<{ date: string; equity: number; openPositions: number }>;
}

interface OlAlgoMaxMC {
  runs: number;
  startingCapital: number;
  endingEquityP10: number;
  endingEquityP50: number;
  endingEquityP90: number;
  endingEquityMean: number;
  endingEquityMin: number;
  endingEquityMax: number;
  totalReturnPctP50: number;
  maxDrawdownP50: number;
  winRateP50: number;
  totalTradesP50: number;
  trim1EventsP50: number;
  trim2EventsP50: number;
  runnerExitsP50: number;
  hardStopsP50: number;
  bestRun: OlAlgoMaxRun;
  worstRun: OlAlgoMaxRun;
}

interface WeeklyBucket {
  week: string;
  ideas: number;
  wins: number;
  losses: number;
  expired: number;
  winRate: number;
  realizedPnL: number;
  topWinners: Array<{ sym: string; pnl: number }>;
  topLosers: Array<{ sym: string; pnl: number }>;
}

interface WeeklyAnalysis {
  weeks: WeeklyBucket[];
  overall: { ideas: number; wr: number; pnl: number };
}

// 4 distinct ACCOUNT TYPES — each replays the last 90 days of real trade
// history through a different sized account with different leverage.
//
// STRICT OPTIONS ONLY. Every tier hard-filters to assetType === 'option'
// (no stocks, ever). The bot pulls from the merged lotto+swing pool but
// only the option-tagged ideas survive the gate.
//
// ALPHA TICKER WHITELIST — backtested 90d WR per symbol on options:
//   OLED 100%, UPST 86%, MDB 75%, DUOL 66%, AFRM 65%, NET 55%, DDOG 53%
// Excluded losers: ARM 38%, AMD 32%, MU 35%, SHOP 22%, SNOW 20%, LUNR 15%
//
// What differentiates the tiers is account size, leverage, and per-symbol
// cooldown — NOT which tickers they trade.
//
// USER WATCHLIST (25 tickers): TOP 4 + SIDELINES 9 + BIG WATCH 12.
// 17 of these mega-caps had ZERO option ideas in the live pool — they
// are now covered by the synthetic backfill in server/option-backfill.ts.
// Backfill rows are tagged dataSourceUsed='backfill_synthetic' for
// auditability.
const OPTION_TICKERS = [
  // TOP
  'AAOI', 'MU', 'AVGO', 'TSEM',
  // SIDELINES
  'OKLO', 'NFLX', 'KLAC', 'LRCX', 'NBIS', 'LITE', 'LUNR', 'EWY', 'SOXX',
  // BIG WATCH
  'CRWV', 'CRCL', 'MRVL', 'ARM', 'TSLA', 'AMD', 'APP', 'ORCL', 'SMH',
  'WDC', 'SNDK', 'FSLY',
];

// SMALL ACCOUNT WATCHLIST — cheap, high-vol, catalyst-driven names where
// $0.10-$1.50 weekly premiums actually fit a $300-$1K account.
//
// CURATED to >55% backtested WR (90d synthetic backfill). Tickers
// failing this bar were dropped because they bleed the small account:
//   GME 9%, BTBT 30%, NIO 33%, LCID 37%, BB 36%, HOOD 36%, SMR 40%,
//   RIOT 46%, AFRM 43%, BBAI 49%, ACHR 48%, SOFI 48%, HIMS 47%
//
// Selection criteria (kept):
//   - Stock price $3-$60 (premiums $0.10-$1.50)
//   - >55% backtested WR on 90d window
//   - Has weekly option chains
//   - Catalyst-driven (AI/quantum/crypto/EV/space/nuclear themes)
const SMALL_ACCOUNT_TICKERS = [
  // Top WR (>60%): WULF 73, NNE 66, IREN 61, CLSK 58
  'WULF', 'NNE', 'IREN', 'CLSK',
  // Strong (55-60%): JOBY 57, QBTS 57, ASTS 57, MARA 57, RIVN 56
  'JOBY', 'QBTS', 'ASTS', 'MARA', 'RIVN',
  // Decent (50-55%): SOUN 53, RGTI 52, IONQ 51, RKLB 51, OPEN 50
  'SOUN', 'RGTI', 'IONQ', 'RKLB', 'OPEN',
  // Already-proven from prior $300 backtest: FSLY (12 wins/4 losses)
  // and the cheap originals
  'FSLY', 'OKLO', 'LUNR',
];

const CHALLENGES: Array<ChallengeKey & { label: string; sub: string; capital: number; stretch: number }> = [
  {
    id: 'tier_300_cash',
    mode: 'mixed',
    pool: 'last_90d',
    label: '$300 CASH',
    sub: '3+ confluences · cheap-vol watchlist · skim 75% every 1.5×',
    capital: 300,
    stretch: 3000,
    overrides: {
      startingCapital: 300, targetCapital: 1500, stretchTarget: 3000,
      accountType: 'cash', marginMultiple: 1,
      maxRiskPerTrade: 0.08, maxTradesPerDay: 4, maxConcurrentPositions: 4,
      perSymbolCooldownDays: 2,
      requiredAssetTypes: ['option'],
      // any_approved opens the scope to SECONDARY + SMALL_ACCOUNT_TIER
      // tickers — without this the default s_and_a filter drops them
      // before alphaTickers can apply.
      watchlist: 'any_approved',
      // Small-account tier uses CHEAP names ($3-$60 stocks) so weekly
      // premiums are $0.10-$1.50 and the bot can hold 3-6 positions
      // instead of 1 mega-cap whale.
      alphaTickers: SMALL_ACCOUNT_TICKERS,
      // Stack-the-deck mode: require 3+ independent confluence signals
      // before the bot will fire. Cuts over-trading dramatically and
      // forces the small account into the highest-conviction setups only.
      minConfluenceCount: 3,
      excludedHoldingPeriods: [],
      minConfidence: 0,
      minRiskReward: 1.0,
      maxRiskReward: 0,
      skimTriggerMult: 1.5,
      skimPct: 0.75,
    },
  },
  {
    id: 'tier_500_cash',
    mode: 'mixed',
    pool: 'last_90d',
    label: '$500 CASH',
    sub: '3+ confluences · cheap-vol watchlist · skim 75% every 1.5×',
    capital: 500,
    stretch: 5000,
    overrides: {
      startingCapital: 500, targetCapital: 2500, stretchTarget: 5000,
      accountType: 'cash', marginMultiple: 1,
      maxRiskPerTrade: 0.07, maxTradesPerDay: 4, maxConcurrentPositions: 4,
      perSymbolCooldownDays: 2,
      requiredAssetTypes: ['option'],
      watchlist: 'any_approved',
      alphaTickers: SMALL_ACCOUNT_TICKERS,
      // Stack-the-deck: 3+ confluences required.
      minConfluenceCount: 3,
      excludedHoldingPeriods: [],
      minConfidence: 0,
      minRiskReward: 1.0,
      maxRiskReward: 0,
      skimTriggerMult: 1.5,
      skimPct: 0.75,
    },
  },
  {
    id: 'tier_1000_margin2x',
    mode: 'mixed',
    pool: 'last_90d',
    label: '$1K MARGIN 2×',
    sub: '2+ confluences · mega-cap options · skim 80% · reg-T margin',
    capital: 1000,
    stretch: 10000,
    overrides: {
      startingCapital: 1000, targetCapital: 5000, stretchTarget: 10000,
      accountType: 'margin', marginMultiple: 2,
      maxRiskPerTrade: 0.05, maxTradesPerDay: 4, maxConcurrentPositions: 4,
      perSymbolCooldownDays: 2,
      requiredAssetTypes: ['option'],
      watchlist: 'any_approved',
      alphaTickers: OPTION_TICKERS,
      // Mega-cap tier: require 2+ confluences (mega-caps already have a
      // higher signal floor than penny names so 2 is the sweet spot).
      minConfluenceCount: 2,
      excludedHoldingPeriods: [],
      minConfidence: 0,
      minRiskReward: 1.0,
      maxRiskReward: 0,
      skimTriggerMult: 1.5,
      skimPct: 0.80,
    },
  },
  {
    id: 'tier_2000_margin4x',
    mode: 'mixed',
    pool: 'last_90d',
    label: '$2K MARGIN 4×',
    sub: '2+ confluences · mega-cap options · skim 85% · PDT margin',
    capital: 2000,
    stretch: 20000,
    overrides: {
      startingCapital: 2000, targetCapital: 10000, stretchTarget: 20000,
      accountType: 'margin', marginMultiple: 4,
      maxRiskPerTrade: 0.04, maxTradesPerDay: 5, maxConcurrentPositions: 5,
      perSymbolCooldownDays: 2,
      requiredAssetTypes: ['option'],
      watchlist: 'any_approved',
      alphaTickers: OPTION_TICKERS,
      // Mega-cap PDT tier: 2+ confluences.
      minConfluenceCount: 2,
      excludedHoldingPeriods: [],
      minConfidence: 0,
      minRiskReward: 1.0,
      maxRiskReward: 0,
      skimTriggerMult: 1.5,
      skimPct: 0.85,
    },
  },
];

function challengeId(c: ChallengeKey): string {
  return c.id;
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default function OlAlgoPage() {
  const [runs, setRuns] = useState<number>(40);
  const [results, setResults] = useState<Record<string, MonteCarloResult | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeReplay, setActiveReplay] = useState<string | null>(null);
  const [weekly, setWeekly] = useState<WeeklyAnalysis | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyMode, setWeeklyMode] = useState<'alpha' | 'all'>('alpha');
  const [maxResult, setMaxResult] = useState<OlAlgoMaxMC | null>(null);
  const [maxError, setMaxError] = useState<string | null>(null);

  const maxMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/olalgo/max', {
        watchlist: OPTION_TICKERS,
        runs: 5,
        overrides: { startingCapital: 5000, lookbackDays: 365 },
      });
      const data: OlAlgoMaxMC = await res.json();
      return data;
    },
    onSuccess: (data) => {
      setMaxResult(data);
      setMaxError(null);
    },
    onError: (err: Error) => {
      setMaxError(err.message);
      setMaxResult(null);
    },
  });

  const loadWeekly = async (mode: 'alpha' | 'all') => {
    setWeeklyLoading(true);
    setWeeklyMode(mode);
    try {
      const res = await apiRequest('POST', '/api/olalgo/weekly', {
        alphaTickers: mode === 'alpha' ? OPTION_TICKERS : [],
      });
      const data: WeeklyAnalysis = await res.json();
      setWeekly(data);
    } catch (e) {
      setWeekly(null);
    } finally {
      setWeeklyLoading(false);
    }
  };

  const challengeMutation = useMutation({
    mutationFn: async (key: ChallengeKey) => {
      const res = await apiRequest('POST', '/api/olalgo/challenge', {
        mode: key.mode,
        pool: key.pool,
        runs,
        ...(key.overrides ? { overrides: key.overrides } : {}),
      });
      const data: MonteCarloResult = await res.json();
      return { key, data };
    },
    onSuccess: ({ key, data }) => {
      const id = challengeId(key);
      setResults((r) => ({ ...r, [id]: data }));
      setErrors((e) => {
        const next = { ...e };
        delete next[id];
        return next;
      });
      if (!activeReplay) setActiveReplay(id);
    },
    onError: (err: Error, key) => {
      const id = challengeId(key);
      setErrors((e) => ({ ...e, [id]: err.message }));
    },
  });

  const runAll = async () => {
    setResults({});
    setErrors({});
    setActiveReplay(null);
    for (const c of CHALLENGES) {
      try {
        await challengeMutation.mutateAsync(c);
      } catch {
        /* error already captured in onError */
      }
    }
  };

  const runOne = (key: ChallengeKey) => {
    challengeMutation.mutate(key);
  };

  const isRunning = challengeMutation.isPending;
  const replay = activeReplay ? results[activeReplay]?.bestRun : null;

  return (
    <QEPageShell width="wide" padding="md" grid="subtle">
      <QEPageHeader
        marker="01 // OLALGO BOT · CHALLENGE BACKTEST"
        title="OlAlgo Bot"
        subtitle="STRICTLY OPTIONS · cash & margin accounts · day-by-day replay of last 90d"
        icon={<Bot className="h-5 w-5 text-[var(--brand-teal)]" />}
        iconAccent="ai"
        actions={
          <div className="flex items-center gap-2">
            <RunsControl runs={runs} setRuns={setRuns} disabled={isRunning} />
            <Button
              size="sm"
              onClick={runAll}
              disabled={isRunning}
              className="bg-[var(--brand-teal)] hover:bg-[var(--brand-teal)]/80 text-white font-mono text-[11px] gap-1.5"
              data-testid="run-all-challenges"
            >
              {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              RUN ALL 4
            </Button>
          </div>
        }
      />

      {/* STICKY SECTION NAV — jump pills for the 4 sections */}
      <SectionNav
        sections={[
          { id: 'section-01', num: '01', label: 'CHALLENGE TIERS' },
          { id: 'section-02', num: '02', label: 'OLALGOMAX' },
          { id: 'section-03', num: '03', label: 'WEEKLY DIAGNOSIS' },
          { id: 'section-04', num: '04', label: 'BEST RUN REPLAY', enabled: !!replay },
        ]}
      />

      {/* SECTION 01 — CHALLENGE GRID */}
      <section id="section-01" className="scroll-mt-24">
        <QESectionDivider number="01" label="CHALLENGE TIERS · $300 → $2K" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {CHALLENGES.map((c) => {
            const id = challengeId(c);
            const result = results[id];
            const error = errors[id];
            const isActive = activeReplay === id;
            return (
              <ChallengeCard
                key={id}
                challenge={c}
                result={result}
                error={error}
                isActive={isActive}
                isRunning={isRunning}
                onRun={() => runOne(c)}
                onSelect={() => result && setActiveReplay(id)}
              />
            );
          })}
        </div>

        {/* COMPARISON STRIP */}
        {Object.values(results).filter(Boolean).length >= 2 && (
          <ComparisonStrip results={results} />
        )}
      </section>

      {/* SECTION 02 — OLALGOMAX */}
      <section id="section-02" className="scroll-mt-24">
        <QESectionDivider number="02" label="OLALGOMAX · LEAPS + SWINGS PORTFOLIO" />
        <OlAlgoMaxPanel
          result={maxResult}
          error={maxError}
          isRunning={maxMutation.isPending}
          onRun={() => maxMutation.mutate()}
        />
      </section>

      {/* SECTION 03 — WEEKLY DIAGNOSIS */}
      <section id="section-03" className="scroll-mt-24">
        <QESectionDivider number="03" label="WEEKLY OPTIONS DIAGNOSIS" />
        <WeeklyDiagnosisPanel
          weekly={weekly}
          loading={weeklyLoading}
          mode={weeklyMode}
          onLoad={loadWeekly}
        />
      </section>

      {/* SECTION 04 — REPLAY (conditional) */}
      {replay && activeReplay && (() => {
        const activeChallenge = CHALLENGES.find((c) => c.id === activeReplay);
        return (
          <section id="section-04" className="scroll-mt-24">
            <QESectionDivider
              number="04"
              label={`BEST RUN REPLAY · ${activeChallenge?.label.toUpperCase() ?? activeReplay.toUpperCase()}`}
            />
            <BestRunReplay run={replay} mc={results[activeReplay]!} />
          </section>
        );
      })()}
    </QEPageShell>
  );
}

// ─────────────────────────────────────────────────────────────
// STICKY SECTION NAV — jump pills + scroll-spy
// ─────────────────────────────────────────────────────────────

interface SectionNavItem {
  id: string;
  num: string;
  label: string;
  enabled?: boolean;
}

function SectionNav({ sections }: { sections: SectionNavItem[] }) {
  const [activeId, setActiveId] = useState<string>(sections[0].id);

  // IntersectionObserver scroll-spy: highlight whichever section is in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 py-2 mb-4 bg-[var(--surface-base)]/95 backdrop-blur-md border-b border-border">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {sections.map((s) => {
          const isActive = activeId === s.id;
          const isDisabled = s.enabled === false;
          return (
            <button
              key={s.id}
              type="button"
              disabled={isDisabled}
              onClick={() => handleClick(s.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md border font-mono text-[10px] tracking-widest uppercase transition-all whitespace-nowrap',
                isDisabled
                  ? 'border-border/30 text-muted-foreground/60 cursor-not-allowed'
                  : isActive
                    ? 'border-[var(--brand-teal)] bg-[var(--brand-teal)]/15 text-[var(--brand-teal)]'
                    : 'border-border bg-[var(--surface-raised)] text-muted-foreground hover:text-foreground hover:border-[var(--brand-teal)]/40',
              )}
              data-testid={`section-nav-${s.id}`}
            >
              <span
                className={cn(
                  'font-bold tabular-nums',
                  isActive ? 'text-[var(--brand-teal)]' : 'text-foreground/60',
                )}
              >
                {s.num}
              </span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RUNS CONTROL
// ─────────────────────────────────────────────────────────────

function RunsControl({ runs, setRuns, disabled }: { runs: number; setRuns: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-[var(--surface-raised)]">
      <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">RUNS</span>
      {[10, 20, 40].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => setRuns(n)}
          className={cn(
            'px-1.5 py-0.5 text-[10px] font-mono font-bold rounded',
            runs === n
              ? 'bg-[var(--brand-teal)]/15 text-[var(--brand-teal)]'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHALLENGE CARD
// ─────────────────────────────────────────────────────────────

function ChallengeCard({
  challenge,
  result,
  error,
  isActive,
  isRunning,
  onRun,
  onSelect,
}: {
  challenge: ChallengeKey & { label: string; sub: string; capital?: number; stretch?: number };
  result?: MonteCarloResult | null;
  error?: string;
  isActive: boolean;
  isRunning: boolean;
  onRun: () => void;
  onSelect: () => void;
}) {
  const accent = 'border-[var(--brand-teal)]/30';
  const labelColor = 'text-[var(--brand-teal)]';
  const targetLabel = challenge.stretch
    ? `HIT ${challenge.stretch >= 1000 ? `$${challenge.stretch / 1000}K` : `$${challenge.stretch}`}`
    : 'HIT TARGET';
  const halfLabel = challenge.stretch
    ? `HIT ${challenge.stretch / 2 >= 1000 ? `$${challenge.stretch / 2000}K` : `$${challenge.stretch / 2}`}`
    : 'HIT 5X';

  return (
    <div
      onClick={onSelect}
      className={cn(
        'rounded-lg bg-[var(--surface-raised)] border p-3 cursor-pointer transition-all',
        accent,
        isActive && 'ring-2 ring-[var(--brand-teal)]/50',
      )}
      data-testid={`challenge-card-${challengeId(challenge)}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className={cn('text-[10px] font-mono font-bold tracking-widest', labelColor)}>
            {challenge.label}
          </div>
          <div className="text-[9px] font-mono text-muted-foreground mt-0.5">{challenge.sub}</div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
          disabled={isRunning}
          className="h-6 px-2 text-[10px] font-mono"
        >
          {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : 'RUN'}
        </Button>
      </div>

      {error && (
        <div className="text-[10px] font-mono text-[var(--trade-bearish)] py-2">
          {error.slice(0, 80)}
        </div>
      )}

      {!result && !error && (
        <div className="text-[10px] font-mono text-muted-foreground py-4 text-center">
          Not run yet
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {/* Headline */}
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label={halfLabel}
              value={`${(result.hitTargetPct * 100).toFixed(0)}%`}
              tone={result.hitTargetPct > 0.5 ? 'good' : result.hitTargetPct > 0.2 ? 'warn' : 'bad'}
            />
            <Stat
              label={targetLabel}
              value={`${(result.hitStretchPct * 100).toFixed(0)}%`}
              tone={result.hitStretchPct > 0.5 ? 'good' : result.hitStretchPct > 0.2 ? 'warn' : 'bad'}
            />
          </div>

          {/* Median ending — total realized = trading BP + locked vault */}
          <div className="rounded bg-[var(--surface-base)]/40 px-2 py-1.5 border border-border/40">
            <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
              MEDIAN TOTAL (BP + VAULT)
            </div>
            <div className="text-base font-mono font-bold tabular-nums text-foreground">
              ${(result.totalRealizedP50 ?? result.endingEquityP50).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[8px] font-mono text-muted-foreground tabular-nums">
              p10 ${Math.round(result.endingEquityP10)} · p90 ${Math.round(result.endingEquityP90)}
            </div>
          </div>

          {/* Vault breakdown — locked profits vs trading BP */}
          {(result.vaultBalanceP50 ?? 0) > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded bg-[var(--surface-base)]/40 px-2 py-1.5 border border-[var(--brand-teal)]/30">
                <div className="text-[8px] font-mono uppercase tracking-widest text-[var(--brand-teal)]">
                  LOCKED VAULT
                </div>
                <div className="text-sm font-mono font-bold tabular-nums text-[var(--brand-teal)]">
                  ${Math.round(result.vaultBalanceP50).toLocaleString()}
                </div>
                <div className="text-[8px] font-mono text-muted-foreground tabular-nums">
                  max ${Math.round(result.vaultBalanceMax).toLocaleString()} · {result.medianSkimEvents} skims
                </div>
              </div>
              <div className="rounded bg-[var(--surface-base)]/40 px-2 py-1.5 border border-border/40">
                <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
                  TRADING BP
                </div>
                <div className="text-sm font-mono font-bold tabular-nums text-foreground">
                  ${Math.round(result.endingEquityP50).toLocaleString()}
                </div>
                <div className="text-[8px] font-mono text-muted-foreground tabular-nums">
                  p50 still in play
                </div>
              </div>
            </div>
          )}

          {/* Profitable runs vs BP-drained — leads with the truthful "did you make money" stat */}
          <div className="flex items-center justify-between text-[9px] font-mono">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  (result.profitablePct ?? 0) >= 0.5
                    ? 'text-[var(--trade-bullish)]'
                    : (result.profitablePct ?? 0) >= 0.25
                      ? 'text-[var(--gex-flip)]'
                      : 'text-[var(--trade-bearish)]',
                )}
                title="Runs where total wealth (trading BP + locked vault) ended above starting capital"
              >
                PROFITABLE {((result.profitablePct ?? 0) * 100).toFixed(0)}%
              </span>
              <span
                className="text-muted-foreground"
                title="Runs where the trading bankroll drained below the bust threshold. Locked vault profits are preserved separately."
              >
                · BP DRAINED {(result.bustedPct * 100).toFixed(0)}%
              </span>
            </div>
            <span className="text-muted-foreground">
              {result.poolSize} ideas · {result.runs} runs
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' }) {
  const color =
    tone === 'good'
      ? 'text-[var(--trade-bullish)]'
      : tone === 'warn'
        ? 'text-[var(--gex-flip)]'
        : 'text-[var(--trade-bearish)]';
  return (
    <div className="rounded bg-[var(--surface-base)]/40 px-2 py-1.5 border border-border/40">
      <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-mono font-bold tabular-nums', color)}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WEEKLY DIAGNOSIS PANEL — answers "why are we losing this week?"
// ─────────────────────────────────────────────────────────────

function WeeklyDiagnosisPanel({
  weekly,
  loading,
  mode,
  onLoad,
}: {
  weekly: WeeklyAnalysis | null;
  loading: boolean;
  mode: 'alpha' | 'all';
  onLoad: (mode: 'alpha' | 'all') => void;
}) {
  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-border overflow-hidden mb-6">
      <div className="px-3 py-2 border-b border-border bg-[var(--surface-base)]/40 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground">
            WEEKLY OPTIONS BREAKDOWN
          </div>
          <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
            Last 90d · 1-contract realized P&L per ISO week · diagnoses winning vs losing weeks
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onLoad('alpha')}
            disabled={loading}
            className={cn(
              'px-2 py-1 text-[10px] font-mono font-bold rounded',
              mode === 'alpha' && weekly
                ? 'bg-[var(--brand-teal)]/15 text-[var(--brand-teal)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            ALPHA ONLY
          </button>
          <button
            type="button"
            onClick={() => onLoad('all')}
            disabled={loading}
            className={cn(
              'px-2 py-1 text-[10px] font-mono font-bold rounded',
              mode === 'all' && weekly
                ? 'bg-[var(--brand-teal)]/15 text-[var(--brand-teal)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            ALL TICKERS
          </button>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {!weekly && !loading && (
        <div className="px-3 py-6 text-center text-[10px] font-mono text-muted-foreground">
          Click ALPHA ONLY or ALL TICKERS to load weekly diagnosis.
        </div>
      )}

      {weekly && (
        <>
          {/* Overall summary */}
          <div className="px-3 py-2 border-b border-border bg-[var(--surface-base)]/20 grid grid-cols-3 gap-3">
            <div>
              <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
                Total ideas
              </div>
              <div className="text-sm font-mono font-bold text-foreground tabular-nums">
                {weekly.overall.ideas}
              </div>
            </div>
            <div>
              <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
                Overall WR
              </div>
              <div className={cn(
                'text-sm font-mono font-bold tabular-nums',
                weekly.overall.wr >= 0.5 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]',
              )}>
                {(weekly.overall.wr * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
                Net P&L (1 cons each)
              </div>
              <div className={cn(
                'text-sm font-mono font-bold tabular-nums',
                weekly.overall.pnl >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]',
              )}>
                {weekly.overall.pnl >= 0 ? '+' : ''}${weekly.overall.pnl.toFixed(0)}
              </div>
            </div>
          </div>

          {/* Per-week table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono">
              <thead className="bg-[var(--surface-base)]/40 border-b border-border">
                <tr className="text-left text-muted-foreground uppercase tracking-widest text-[9px]">
                  <th className="px-3 py-2">Week</th>
                  <th className="px-2 py-2 text-right">Ideas</th>
                  <th className="px-2 py-2 text-right">W/L/Exp</th>
                  <th className="px-2 py-2 text-right">WR</th>
                  <th className="px-2 py-2 text-right">P&L</th>
                  <th className="px-3 py-2">Top Winners</th>
                  <th className="px-3 py-2">Top Losers</th>
                </tr>
              </thead>
              <tbody>
                {weekly.weeks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                      No options data in this slice
                    </td>
                  </tr>
                )}
                {weekly.weeks.map((w) => (
                  <tr key={w.week} className="border-b border-border/30">
                    <td className="px-3 py-2 text-foreground tabular-nums">{w.week}</td>
                    <td className="px-2 py-2 text-right text-foreground tabular-nums">{w.ideas}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">
                      <span className="text-[var(--trade-bullish)]">{w.wins}</span>
                      /<span className="text-[var(--trade-bearish)]">{w.losses}</span>
                      /<span className="text-[var(--gex-flip)]">{w.expired}</span>
                    </td>
                    <td className={cn(
                      'px-2 py-2 text-right tabular-nums font-bold',
                      w.winRate >= 0.5 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]',
                    )}>
                      {(w.winRate * 100).toFixed(0)}%
                    </td>
                    <td className={cn(
                      'px-2 py-2 text-right tabular-nums font-bold',
                      w.realizedPnL >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]',
                    )}>
                      {w.realizedPnL >= 0 ? '+' : ''}${w.realizedPnL.toFixed(0)}
                    </td>
                    <td className="px-3 py-2 text-[9px] text-muted-foreground">
                      {w.topWinners.filter((t) => t.pnl > 0).map((t, i) => (
                        <span key={i} className="mr-2">
                          <span className="text-[var(--trade-bullish)]">{t.sym}</span>{' '}
                          +${t.pnl.toFixed(0)}
                        </span>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-[9px] text-muted-foreground">
                      {w.topLosers.filter((t) => t.pnl < 0).map((t, i) => (
                        <span key={i} className="mr-2">
                          <span className="text-[var(--trade-bearish)]">{t.sym}</span>{' '}
                          ${t.pnl.toFixed(0)}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPARISON STRIP
// ─────────────────────────────────────────────────────────────

function ComparisonStrip({ results }: { results: Record<string, MonteCarloResult | null> }) {
  const rows = CHALLENGES.map((c) => ({
    challenge: c,
    result: results[challengeId(c)],
  })).filter((r) => r.result);

  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-border overflow-hidden mb-6">
      <div className="px-3 py-2 border-b border-border bg-[var(--surface-base)]/40">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground">
          STRATEGY COMPARISON
        </div>
        <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
          Side-by-side across {rows.length} challenges
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead className="text-muted-foreground uppercase tracking-widest">
            <tr className="border-b border-border/40">
              <th className="text-left px-3 py-2">Tier</th>
              <th className="text-right px-2 py-2">Pool</th>
              <th className="text-right px-2 py-2">Hit 5x</th>
              <th className="text-right px-2 py-2">Hit 10x</th>
              <th className="text-right px-2 py-2" title="Runs where total wealth (BP + vault) ended above starting capital">Profit %</th>
              <th className="text-right px-2 py-2">Median Total</th>
              <th className="text-right px-2 py-2">Vault</th>
              <th className="text-right px-2 py-2">BP</th>
              <th className="text-right px-2 py-2">p10 → p90</th>
              <th className="text-right px-2 py-2">Worst DD</th>
              <th className="text-right px-2 py-2">Days to 5x</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ challenge, result }) => {
              if (!result) return null;
              return (
                <tr key={challengeId(challenge)} className="border-b border-border/20 hover:bg-[var(--surface-base)]/40">
                  <td className="px-3 py-2 font-bold text-foreground">{challenge.label}</td>
                  <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">{result.poolSize}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-[var(--trade-bullish)]">
                    {(result.hitTargetPct * 100).toFixed(0)}%
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-[var(--gex-positive)]">
                    {(result.hitStretchPct * 100).toFixed(0)}%
                  </td>
                  <td
                    className={cn(
                      'px-2 py-2 text-right tabular-nums',
                      (result.profitablePct ?? 0) >= 0.5
                        ? 'text-[var(--trade-bullish)]'
                        : (result.profitablePct ?? 0) >= 0.25
                          ? 'text-[var(--gex-flip)]'
                          : 'text-[var(--trade-bearish)]',
                    )}
                    title={`${result.profitableCount ?? 0} of ${result.runs} runs ended in profit (BP + vault). BP drained in ${result.bustedCount} runs.`}
                  >
                    {((result.profitablePct ?? 0) * 100).toFixed(0)}%
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-foreground font-bold">
                    ${Math.round(result.totalRealizedP50 ?? result.endingEquityP50).toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-[var(--brand-teal)]">
                    {(result.vaultBalanceP50 ?? 0) > 0
                      ? `$${Math.round(result.vaultBalanceP50).toLocaleString()}`
                      : '—'}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                    ${Math.round(result.endingEquityP50).toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                    ${Math.round(result.endingEquityP10)} → ${Math.round(result.endingEquityP90)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-[var(--trade-bearish)]">
                    {result.worstDrawdown.toFixed(0)}%
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                    {result.medianDaysToTarget != null ? `${result.medianDaysToTarget}d` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BEST RUN REPLAY
// ─────────────────────────────────────────────────────────────

function BestRunReplay({ run, mc }: { run: ChallengeRunResult; mc: MonteCarloResult }) {
  const totalRealized = run.totalRealized ?? run.endingCapital;
  const totalReturn = ((totalRealized - run.startingCapital) / run.startingCapital) * 100;
  const hasVault = (run.vaultBalance ?? 0) > 0;

  return (
    <div className="space-y-3">
      {/* Headline cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <BigStat
          icon={<Trophy className="h-3 w-3" />}
          label="TOTAL REALIZED"
          value={`$${Math.round(totalRealized).toLocaleString()}`}
          sub={`+${totalReturn.toFixed(0)}% · BP+vault`}
          tone="good"
        />
        <BigStat
          label={hasVault ? 'LOCKED VAULT' : 'TRADES'}
          value={hasVault ? `$${Math.round(run.vaultBalance).toLocaleString()}` : `${run.totalTrades}`}
          sub={hasVault ? `${run.skimEvents} skim events` : `${run.wins}W / ${run.losses}L`}
          tone={hasVault ? 'good' : 'neutral'}
        />
        <BigStat
          label="WIN RATE"
          value={`${(run.winRate * 100).toFixed(0)}%`}
          sub={`PF ${run.profitFactor.toFixed(2)} · ${run.totalTrades}t`}
          tone="neutral"
        />
        <BigStat
          icon={<Skull className="h-3 w-3" />}
          label="MAX DD"
          value={`${run.maxDrawdownPct.toFixed(0)}%`}
          sub={`${run.longestLossStreak} loss streak`}
          tone="bad"
        />
        <BigStat
          label="DAYS"
          value={`${run.totalDays}`}
          sub={run.daysToTarget != null ? `Hit 5x in ${run.daysToTarget}d` : 'No target'}
          tone="neutral"
        />
        <BigStat
          label="POOL"
          value={`${mc.poolSize}`}
          sub={`${mc.runs} sims · best of`}
          tone="neutral"
        />
      </div>

      {/* Equity curve sparkline */}
      <EquitySpark curve={run.equityCurve} />

      {/* Trade journal */}
      <TradeJournal trades={run.trades} />
    </div>
  );
}

function BigStat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: 'good' | 'bad' | 'neutral';
}) {
  const color =
    tone === 'good'
      ? 'text-[var(--trade-bullish)]'
      : tone === 'bad'
        ? 'text-[var(--trade-bearish)]'
        : 'text-foreground';
  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-border px-3 py-2">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
      </div>
      <div className={cn('text-lg font-mono font-bold tabular-nums mt-0.5', color)}>{value}</div>
      <div className="text-[9px] font-mono text-muted-foreground tabular-nums">{sub}</div>
    </div>
  );
}

function EquitySpark({ curve }: { curve: ChallengeRunResult['equityCurve'] }) {
  if (curve.length < 2) return null;

  const w = 800;
  const h = 120;
  const min = Math.min(...curve.map((p) => p.equity));
  const max = Math.max(...curve.map((p) => p.equity));
  const range = Math.max(1, max - min);

  const points = curve
    .map((p, i) => {
      const x = (i / (curve.length - 1)) * w;
      const y = h - ((p.equity - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const startEquity = curve[0].equity;
  const endEquity = curve[curve.length - 1].equity;
  const tone = endEquity >= startEquity ? 'var(--trade-bullish)' : 'var(--trade-bearish)';

  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-border p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          EQUITY CURVE — BEST RUN
        </div>
        <div className="text-[9px] font-mono text-muted-foreground tabular-nums">
          ${Math.round(min)} ↔ ${Math.round(max)}
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24">
        <polyline
          fill="none"
          stroke={tone}
          strokeWidth="1.5"
          points={points}
          opacity="0.9"
        />
      </svg>
    </div>
  );
}

function TradeJournal({ trades }: { trades: SimulatedTrade[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? trades : trades.slice(0, 25);

  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-border overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-[var(--surface-base)]/40 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground">
            TRADE JOURNAL
          </div>
          <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
            {trades.length} executed trades · best run
          </div>
        </div>
        {trades.length > 25 && (
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="text-[10px] font-mono text-[var(--brand-teal)] hover:text-[var(--brand-teal)]/80"
          >
            {showAll ? 'SHOW FIRST 25' : `SHOW ALL ${trades.length}`}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead className="text-muted-foreground uppercase tracking-widest">
            <tr className="border-b border-border/40">
              <th className="text-left px-3 py-1.5">#</th>
              <th className="text-left px-2 py-1.5">Symbol</th>
              <th className="text-left px-2 py-1.5">Type</th>
              <th className="text-left px-2 py-1.5">Date</th>
              <th className="text-right px-2 py-1.5">Entry</th>
              <th className="text-right px-2 py-1.5">Exit</th>
              <th className="text-right px-2 py-1.5">Qty</th>
              <th className="text-right px-2 py-1.5">P&L</th>
              <th className="text-right px-2 py-1.5">Equity</th>
              <th className="text-left px-2 py-1.5">Reason</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t, i) => {
              const pnlColor =
                t.outcome === 'win'
                  ? 'text-[var(--trade-bullish)]'
                  : t.outcome === 'loss'
                    ? 'text-[var(--trade-bearish)]'
                    : 'text-muted-foreground';
              return (
                <tr key={t.ideaId + i} className="border-b border-border/20 hover:bg-[var(--surface-base)]/40">
                  <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-2 py-1.5 font-bold text-foreground">{t.symbol}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {t.tradeType || '—'}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                    {t.entryDate.slice(0, 10)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                    ${t.entryPrice.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                    ${t.exitPrice.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {t.contracts}
                  </td>
                  <td className={cn('px-2 py-1.5 text-right tabular-nums font-bold', pnlColor)}>
                    {t.realizedPnL >= 0 ? '+' : ''}
                    ${t.realizedPnL.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                    ${Math.round(t.equityAfter).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground uppercase text-[9px]">
                    {t.reason.replace('_', ' ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OLALGOMAX PANEL — LEAPs/swings portfolio simulator results
// ─────────────────────────────────────────────────────────────

function OlAlgoMaxPanel({
  result,
  error,
  isRunning,
  onRun,
}: {
  result: OlAlgoMaxMC | null;
  error: string | null;
  isRunning: boolean;
  onRun: () => void;
}) {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--brand-teal)]/30 p-4 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] font-mono font-bold tracking-widest text-[var(--brand-teal)]">
            $5K · LEAPS + SWINGS · 1Y LOOKBACK
          </div>
          <div className="text-[9px] font-mono text-muted-foreground mt-0.5">
            Generates entries on-the-fly · trim ⅓ at +15% / +30% · runner trails -25% off peak ·
            DTE-flexed stops 50/40/30 · sector cap 2 · max 10 concurrent · σ=0.30 BSM-ish premium
          </div>
        </div>
        <Button
          size="sm"
          onClick={onRun}
          disabled={isRunning}
          className="bg-[var(--brand-teal)] hover:bg-[var(--brand-teal)]/80 text-white font-mono text-[11px] gap-1.5"
          data-testid="run-olalgo-max"
        >
          {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          RUN OLALGOMAX
        </Button>
      </div>

      {error && (
        <div className="text-[10px] font-mono text-[var(--trade-bearish)] py-2">
          {error.slice(0, 200)}
        </div>
      )}

      {!result && !error && !isRunning && (
        <div className="text-[10px] font-mono text-muted-foreground py-6 text-center border border-dashed border-border rounded">
          Not run yet · click RUN OLALGOMAX to simulate 5 Monte Carlo runs across the 25-ticker watchlist
        </div>
      )}

      {isRunning && (
        <div className="text-[10px] font-mono text-muted-foreground py-6 text-center border border-dashed border-border rounded">
          Fetching 1y OHLC for 25 tickers and walking forward day-by-day · this can take 30-60 seconds
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* HEADLINE: median ending equity + return */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded bg-[var(--surface-base)]/40 px-2 py-2 border border-[var(--brand-teal)]/30">
              <div className="text-[8px] font-mono uppercase tracking-widest text-[var(--brand-teal)]">
                MEDIAN ENDING
              </div>
              <div className="text-base font-mono font-bold tabular-nums text-foreground">
                {fmt(result.endingEquityP50)}
              </div>
              <div className="text-[8px] font-mono text-muted-foreground tabular-nums">
                from {fmt(result.startingCapital)}
              </div>
            </div>
            <div className="rounded bg-[var(--surface-base)]/40 px-2 py-2 border border-border/40">
              <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
                MEDIAN RETURN
              </div>
              <div
                className={cn(
                  'text-base font-mono font-bold tabular-nums',
                  result.totalReturnPctP50 > 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]',
                )}
              >
                {result.totalReturnPctP50 > 0 ? '+' : ''}
                {pct(result.totalReturnPctP50)}
              </div>
              <div className="text-[8px] font-mono text-muted-foreground tabular-nums">
                p10 {fmt(result.endingEquityP10)} · p90 {fmt(result.endingEquityP90)}
              </div>
            </div>
            <div className="rounded bg-[var(--surface-base)]/40 px-2 py-2 border border-border/40">
              <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
                MAX DRAWDOWN
              </div>
              <div className="text-base font-mono font-bold tabular-nums text-[var(--trade-bearish)]">
                -{pct(result.maxDrawdownP50)}
              </div>
              <div className="text-[8px] font-mono text-muted-foreground tabular-nums">
                p50 across {result.runs} runs
              </div>
            </div>
            <div className="rounded bg-[var(--surface-base)]/40 px-2 py-2 border border-border/40">
              <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
                WIN RATE
              </div>
              <div className="text-base font-mono font-bold tabular-nums text-foreground">
                {pct(result.winRateP50)}
              </div>
              <div className="text-[8px] font-mono text-muted-foreground tabular-nums">
                {result.totalTradesP50} trades p50
              </div>
            </div>
          </div>

          {/* TRIM LADDER STATS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="TRIM 1 (+15%)" value={`${result.trim1EventsP50}`} tone="good" />
            <Stat label="TRIM 2 (+30%)" value={`${result.trim2EventsP50}`} tone="good" />
            <Stat label="RUNNERS EXIT" value={`${result.runnerExitsP50}`} tone="warn" />
            <Stat label="HARD STOPS" value={`${result.hardStopsP50}`} tone="bad" />
          </div>

          {/* BEST RUN MINI-JOURNAL — top 10 closed trades by P&L */}
          {result.bestRun?.trades && result.bestRun.trades.length > 0 && (
            <div className="rounded bg-[var(--surface-base)]/40 border border-border/40 overflow-hidden">
              <div className="px-2 py-1.5 text-[8px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40">
                BEST RUN · TOP 10 TRADES (of {result.bestRun.totalTrades})
                · ending {fmt(result.bestRun.endingEquity)} · WR {pct(result.bestRun.winRate)}
              </div>
              <div className="overflow-auto max-h-72">
                <table className="w-full text-[9px] font-mono">
                  <thead className="bg-[var(--surface-base)]/60 sticky top-0">
                    <tr className="text-[8px] uppercase tracking-widest text-muted-foreground">
                      <th className="text-left px-2 py-1.5">Symbol</th>
                      <th className="text-left px-2 py-1.5">Sector</th>
                      <th className="text-left px-2 py-1.5">Entry</th>
                      <th className="text-left px-2 py-1.5">Exit</th>
                      <th className="text-right px-2 py-1.5">DTE</th>
                      <th className="text-right px-2 py-1.5">Δ</th>
                      <th className="text-right px-2 py-1.5">Cost</th>
                      <th className="text-right px-2 py-1.5">P&L</th>
                      <th className="text-right px-2 py-1.5">%</th>
                      <th className="text-left px-2 py-1.5">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {[...result.bestRun.trades]
                      .sort((a, b) => b.pnl - a.pnl)
                      .slice(0, 10)
                      .map((t, i) => {
                        const tone = t.pnl > 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]';
                        return (
                          <tr key={i} className="hover:bg-[var(--surface-base)]/30">
                            <td className="px-2 py-1.5 font-bold text-foreground">{t.symbol}</td>
                            <td className="px-2 py-1.5 text-muted-foreground uppercase">{t.sector}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{t.entryDate.slice(0, 10)}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{t.exitDate.slice(0, 10)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{t.dte}d</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                              {t.delta.toFixed(2)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                              {fmt(t.initialCost)}
                            </td>
                            <td className={cn('px-2 py-1.5 text-right tabular-nums font-bold', tone)}>
                              {t.pnl >= 0 ? '+' : ''}
                              {fmt(t.pnl)}
                            </td>
                            <td className={cn('px-2 py-1.5 text-right tabular-nums', tone)}>
                              {t.pnlPct >= 0 ? '+' : ''}
                              {(t.pnlPct * 100).toFixed(0)}%
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground uppercase text-[8px]">
                              {t.reason.replace('_', ' ')}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
