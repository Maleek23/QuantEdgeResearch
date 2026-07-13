/**
 * BTC RADAR — Bitcoin Beta Tracker Dashboard
 *
 * Shows live BTC state + ranked beta watchlist + pattern signals.
 * 4 sections:
 *   1. BTC HEADER     spot, 24h, key levels, RSI, vol
 *   2. SIGNALS        any patterns currently firing
 *   3. BETA TABLE     all 14 tracked tickers ranked by 30d beta
 *   4. ACTIONS        re-scan + push-all-to-trade-desk buttons
 *
 * Styled to the Hunt cockpit aesthetic: CSS-var colors (--trade-bullish/bearish,
 * --brand-cyan/gold), card-border cards, real TickerLogo. Lives inside HuntShell,
 * so it owns no outer padding / page <h1>.
 */
import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Send, TrendingUp, TrendingDown, Bitcoin } from 'lucide-react';
import { TickerLogo } from '@/components/hunt/cockpit/ticker-logo';

const BULL = 'var(--trade-bullish)';
const BEAR = 'var(--trade-bearish)';
const GOLD = 'var(--brand-gold)';

interface BTCState {
  price: number;
  timestamp: string;
  change24h: number;
  change1h: number;
  realizedVol30d: number;
  resistance: number[];
  support: number[];
  recentBreak: 'resistance' | 'support' | null;
  breakStrength: number;
  nextResistance: number | null;
  nextSupport: number | null;
  rsi1h: number;
  rsiDaily: number;
}

interface BTCBetaPosition {
  symbol: string;
  spot: number;
  beta30d: number;
  beta90d: number;
  r2: number;
  actualMovePct: number;
  predictedMovePct: number;
  divergence: number;
  divergenceZ: number;
}

interface BTCSignal {
  id: string;
  pattern: string;
  symbol: string;
  spotAtFire: number;
  direction: string;
  suggestedStrike: number;
  suggestedExpiry: string;
  suggestedContracts: number;
  finalGrade: string;
  finalScore: number;
  thesis: string;
  invalidation: number;
  targets: { t1: number; t2?: number };
}

export default function BTCRadarPage() {
  const [state, setState] = useState<BTCState | null>(null);
  const [positions, setPositions] = useState<BTCBetaPosition[]>([]);
  const [signals, setSignals] = useState<BTCSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const stateRes = await fetch('/api/btc/state', { credentials: 'include' });
      const stateData = await stateRes.json();
      setState(stateData.state ?? null);

      const posRes = await fetch('/api/btc/positions', { credentials: 'include' });
      const posData = await posRes.json();
      setPositions(posData.positions ?? []);
    } catch {
      // Silent — UI will show empty states
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/btc/scan', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      setState(data.state ?? null);
      setPositions(data.positions ?? []);
      setSignals(data.signals ?? []);
    } finally {
      setScanning(false);
    }
  };

  const pushAll = async () => {
    setPushing(true);
    setPushResult(null);
    try {
      const res = await fetch('/api/btc/push-all', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      setPushResult(`✓ Pushed ${data.pushed?.length ?? 0} signals to Trade Desk · ${data.failed?.length ?? 0} skipped (low grade or dedup)`);
    } catch {
      setPushResult('✗ Push failed');
    } finally {
      setPushing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[11px] font-mono text-muted-foreground/60">
        <Loader2 className="h-4 w-4 animate-spin mr-2 text-[var(--brand-cyan)]" />
        Loading BTC tracker…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* sub-header + actions (shell already renders the Hunt title) */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bitcoin className="h-4 w-4" style={{ color: GOLD }} />
          <div>
            <h2 className="text-base font-mono font-bold uppercase tracking-widest text-foreground">BTC Radar</h2>
            <p className="text-[11px] font-mono text-muted-foreground/70">
              Live BTC + 14 crypto-equity beta tracker — auto-fires on key level breaks.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runScan}
            disabled={scanning}
            className="text-[10px] font-mono px-3 py-1.5 rounded-md border border-border/40 text-muted-foreground hover:text-foreground hover:border-border hover:bg-foreground/[0.05] flex items-center gap-2 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${scanning ? 'animate-spin' : ''}`} />
            Run scan
          </button>
          <button
            onClick={pushAll}
            disabled={pushing}
            className="text-[10px] font-mono px-3 py-1.5 rounded-md border flex items-center gap-2 disabled:opacity-50 transition-colors cursor-pointer"
            style={{ borderColor: `color-mix(in srgb, ${BULL} 40%, transparent)`, color: BULL }}
          >
            <Send className={`h-3 w-3 ${pushing ? 'animate-pulse' : ''}`} />
            Push A+ to Desk
          </button>
        </div>
      </div>

      {pushResult && (
        <div className="text-[10px] font-mono text-muted-foreground bg-foreground/[0.04] px-3 py-2 rounded-md border border-border/30">
          {pushResult}
        </div>
      )}

      {/* BTC state */}
      {state && <BTCStateCard state={state} />}

      {/* Active signals */}
      {signals.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
            Active Signals · {signals.length}
          </h3>
          {signals.map(s => <SignalCard key={s.id} signal={s} />)}
        </section>
      )}

      {/* Beta table */}
      <section className="space-y-2">
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
          Beta Watchlist · {positions.length} tracked
        </h3>
        <BetaTable positions={positions} />
      </section>
    </div>
  );
}

// ─── BTC state header card ─────────────────────────────────────────

function BTCStateCard({ state }: { state: BTCState }) {
  const isUp = state.change24h >= 0;
  return (
    <div className="rounded-lg border border-card-border bg-card p-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="flex items-center gap-2.5">
          <TickerLogo symbol="BTC" size="md" />
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">BTC</div>
            <div className="text-2xl font-mono font-bold tabular-nums text-foreground">${state.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div className="text-[10px] font-mono tabular-nums" style={{ color: isUp ? BULL : BEAR }}>
              {isUp ? '+' : ''}{state.change24h.toFixed(2)}% 24h
            </div>
          </div>
        </div>
        <Metric label="1H" value={`${state.change1h >= 0 ? '+' : ''}${state.change1h.toFixed(2)}%`} color={state.change1h >= 0 ? BULL : BEAR} />
        <Metric label="RSI Daily" value={state.rsiDaily.toFixed(0)} color={state.rsiDaily > 70 ? BEAR : state.rsiDaily < 30 ? BULL : 'var(--foreground)'} />
        <Metric label="Realized Vol 30d" value={`${state.realizedVol30d.toFixed(0)}%`} />
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">Recent Break</div>
          <div className="text-sm font-mono mt-0.5">
            {state.recentBreak ? (
              <span style={{ color: state.recentBreak === 'resistance' ? BULL : BEAR }}>
                {state.recentBreak} ({state.breakStrength.toFixed(0)})
              </span>
            ) : (
              <span className="text-muted-foreground/60">none</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-[10px] font-mono">
        <div>
          <div className="text-muted-foreground/60 mb-1 uppercase tracking-widest text-[9px]">Resistance</div>
          <div className="flex flex-wrap gap-1">
            {state.resistance.map((r, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded tabular-nums" style={{ background: `color-mix(in srgb, ${BEAR} 10%, transparent)`, color: BEAR, border: `1px solid color-mix(in srgb, ${BEAR} 22%, transparent)` }}>
                ${Math.round(r).toLocaleString()}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground/60 mb-1 uppercase tracking-widest text-[9px]">Support</div>
          <div className="flex flex-wrap gap-1">
            {state.support.map((s, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded tabular-nums" style={{ background: `color-mix(in srgb, ${BULL} 10%, transparent)`, color: BULL, border: `1px solid color-mix(in srgb, ${BULL} 22%, transparent)` }}>
                ${Math.round(s).toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">{label}</div>
      <div className="text-sm font-mono tabular-nums mt-0.5" style={{ color: color ?? 'var(--foreground)' }}>{value}</div>
    </div>
  );
}

// ─── Signal card ───────────────────────────────────────────────────

function SignalCard({ signal }: { signal: BTCSignal }) {
  const isLong = signal.direction.includes('long');
  const tone = isLong ? BULL : BEAR;
  return (
    <div
      className="rounded-lg border bg-card p-3 space-y-2"
      style={{ borderColor: `color-mix(in srgb, ${tone} 30%, transparent)` }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <TickerLogo symbol={signal.symbol} size="sm" />
          {isLong ? <TrendingUp className="h-4 w-4" style={{ color: BULL }} /> : <TrendingDown className="h-4 w-4" style={{ color: BEAR }} />}
          <span className="font-mono font-bold text-sm text-foreground">{signal.symbol}</span>
          <GradePill grade={signal.finalGrade} />
          <span className="text-[10px] font-mono text-muted-foreground/60">{signal.pattern.replace(/_/g, ' ')}</span>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground/80 tabular-nums">
          {signal.direction.replace(/_/g, ' ')} · ${signal.suggestedStrike} {signal.suggestedExpiry} × {signal.suggestedContracts}
        </div>
      </div>
      <p className="text-[11px] font-mono text-muted-foreground/80 leading-relaxed">{signal.thesis}</p>
      <div className="flex items-center gap-3 text-[10px] font-mono tabular-nums">
        <span style={{ color: BULL }}>T1: ${signal.targets.t1.toFixed(2)}</span>
        {signal.targets.t2 && <span style={{ color: BULL }}>T2: ${signal.targets.t2.toFixed(2)}</span>}
        <span style={{ color: BEAR }}>Stop: ${signal.invalidation.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── Beta table ────────────────────────────────────────────────────

function BetaTable({ positions }: { positions: BTCBetaPosition[] }) {
  if (positions.length === 0) {
    return (
      <div className="text-[11px] font-mono text-muted-foreground/60 text-center py-8 rounded-lg border border-card-border bg-card">
        No beta data yet — click Run scan to fetch.
      </div>
    );
  }
  // Sort by absolute beta (highest beta first)
  const sorted = [...positions].sort((a, b) => Math.abs(b.beta30d) - Math.abs(a.beta30d));
  return (
    <div className="rounded-lg border border-card-border bg-card overflow-hidden">
      <div className="grid grid-cols-[1.4fr_repeat(6,1fr)] gap-2 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60 px-3 py-2 border-b border-border/30 bg-foreground/[0.03]">
        <div>Ticker</div>
        <div className="text-right">Spot</div>
        <div className="text-right">β 30d</div>
        <div className="text-right">β 90d</div>
        <div className="text-right">R²</div>
        <div className="text-right">Today %</div>
        <div className="text-right">Divergence Z</div>
      </div>
      {sorted.map(p => (
        <div key={p.symbol} className="grid grid-cols-[1.4fr_repeat(6,1fr)] gap-2 text-[11px] font-mono px-3 py-2 hover:bg-foreground/[0.04] border-b border-border/10 last:border-b-0 transition-colors tabular-nums">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <TickerLogo symbol={p.symbol} size="sm" />
            {p.symbol}
          </div>
          <div className="text-right text-foreground/90">${p.spot.toFixed(2)}</div>
          <div className="text-right" style={{ color: p.beta30d >= 1.5 ? BULL : p.beta30d <= 0.5 ? GOLD : 'var(--foreground)' }}>
            {p.beta30d.toFixed(2)}
          </div>
          <div className="text-right text-muted-foreground/70">{p.beta90d.toFixed(2)}</div>
          <div className="text-right" style={{ color: p.r2 >= 0.5 ? BULL : 'var(--muted-foreground)' }}>
            {p.r2.toFixed(2)}
          </div>
          <div className="text-right" style={{ color: p.actualMovePct >= 0 ? BULL : BEAR }}>
            {p.actualMovePct >= 0 ? '+' : ''}{p.actualMovePct.toFixed(2)}%
          </div>
          <div className="text-right" style={{ color: Math.abs(p.divergenceZ) >= 1.5 ? GOLD : 'var(--muted-foreground)', fontWeight: Math.abs(p.divergenceZ) >= 1.5 ? 700 : 400 }}>
            {p.divergenceZ.toFixed(2)}σ
          </div>
        </div>
      ))}
    </div>
  );
}

function GradePill({ grade }: { grade: string }) {
  const tone =
    grade.startsWith('A') ? BULL :
    grade.startsWith('B') ? 'var(--brand-cyan)' :
    grade.startsWith('C') ? GOLD :
    BEAR;
  return (
    <div
      className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold"
      style={{ background: `color-mix(in srgb, ${tone} 15%, transparent)`, color: tone }}
    >
      {grade}
    </div>
  );
}
