/**
 * BTC RADAR — Bitcoin Beta Tracker Dashboard
 *
 * Shows live BTC state + ranked beta watchlist + pattern signals.
 * 4 sections:
 *   1. BTC HEADER     spot, 24h, key levels, RSI, vol
 *   2. SIGNALS        any patterns currently firing
 *   3. BETA TABLE     all 14 tracked tickers ranked by 30d beta
 *   4. ACTIONS        re-scan + push-all-to-trade-desk buttons
 */
import { useEffect, useState } from 'react';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { Loader2, RefreshCw, Send, TrendingUp, TrendingDown, Bitcoin } from 'lucide-react';

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
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading BTC tracker…
      </div>
    );
  }

  return (
    <PageErrorBoundary label="BTC Radar">
      <div className="space-y-3 px-4 py-3">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
              <Bitcoin className="h-4 w-4 text-amber-500" />
              BTC Radar
            </h1>
            <p className="text-[11px] font-mono text-muted-foreground/70">
              Live BTC + 14 crypto-equity beta tracker — auto-fires on key level breaks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runScan}
              disabled={scanning}
              className="text-[10px] font-mono px-3 py-1.5 rounded border border-border/40 hover:border-primary/40 hover:bg-muted/30 flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${scanning ? 'animate-spin' : ''}`} />
              Run scan
            </button>
            <button
              onClick={pushAll}
              disabled={pushing}
              className="text-[10px] font-mono px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 flex items-center gap-2 disabled:opacity-50"
            >
              <Send className={`h-3 w-3 ${pushing ? 'animate-pulse' : ''}`} />
              Push A+ to Desk
            </button>
          </div>
        </header>

        {pushResult && (
          <div className="text-[10px] font-mono text-muted-foreground bg-muted/20 px-3 py-2 rounded border border-border/30">
            {pushResult}
          </div>
        )}

        {/* BTC state */}
        {state && <BTCStateCard state={state} />}

        {/* Active signals */}
        {signals.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
              Active Signals · {signals.length}
            </h2>
            {signals.map(s => <SignalCard key={s.id} signal={s} />)}
          </section>
        )}

        {/* Beta table */}
        <section className="space-y-2">
          <h2 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
            Beta Watchlist · {positions.length} tracked
          </h2>
          <BetaTable positions={positions} />
        </section>
      </div>
    </PageErrorBoundary>
  );
}

// ─── BTC state header card ─────────────────────────────────────────

function BTCStateCard({ state }: { state: BTCState }) {
  const isUp = state.change24h >= 0;
  return (
    <div className="qe-card border border-border/40 rounded-md p-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <div className="text-[9px] font-mono uppercase text-muted-foreground/60">BTC</div>
          <div className="text-2xl font-mono font-bold">${state.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className={`text-[10px] font-mono ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isUp ? '+' : ''}{state.change24h.toFixed(2)}% 24h
          </div>
        </div>
        <div>
          <div className="text-[9px] font-mono uppercase text-muted-foreground/60">1H</div>
          <div className={`text-sm font-mono ${state.change1h >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {state.change1h >= 0 ? '+' : ''}{state.change1h.toFixed(2)}%
          </div>
        </div>
        <div>
          <div className="text-[9px] font-mono uppercase text-muted-foreground/60">RSI Daily</div>
          <div className={`text-sm font-mono ${state.rsiDaily > 70 ? 'text-rose-500' : state.rsiDaily < 30 ? 'text-emerald-500' : 'text-foreground'}`}>
            {state.rsiDaily.toFixed(0)}
          </div>
        </div>
        <div>
          <div className="text-[9px] font-mono uppercase text-muted-foreground/60">Realized Vol 30d</div>
          <div className="text-sm font-mono">{state.realizedVol30d.toFixed(0)}%</div>
        </div>
        <div>
          <div className="text-[9px] font-mono uppercase text-muted-foreground/60">Recent Break</div>
          <div className="text-sm font-mono">
            {state.recentBreak ? (
              <span className={state.recentBreak === 'resistance' ? 'text-emerald-500' : 'text-rose-500'}>
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
          <div className="text-muted-foreground/60 mb-1">RESISTANCE</div>
          <div className="flex flex-wrap gap-1">
            {state.resistance.map((r, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500/80 border border-rose-500/20">
                ${Math.round(r).toLocaleString()}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground/60 mb-1">SUPPORT</div>
          <div className="flex flex-wrap gap-1">
            {state.support.map((s, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500/80 border border-emerald-500/20">
                ${Math.round(s).toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Signal card ───────────────────────────────────────────────────

function SignalCard({ signal }: { signal: BTCSignal }) {
  const isLong = signal.direction.includes('long');
  return (
    <div className={`qe-card border rounded-md p-3 space-y-2 ${isLong ? 'border-emerald-500/30' : 'border-rose-500/30'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isLong ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-rose-500" />}
          <span className="font-mono font-bold text-sm">{signal.symbol}</span>
          <GradePill grade={signal.finalGrade} />
          <span className="text-[10px] font-mono text-muted-foreground/60">{signal.pattern.replace(/_/g, ' ')}</span>
        </div>
        <div className="text-[10px] font-mono">
          {signal.direction.replace(/_/g, ' ')} · ${signal.suggestedStrike} {signal.suggestedExpiry} × {signal.suggestedContracts}
        </div>
      </div>
      <p className="text-[11px] font-mono text-muted-foreground/80 leading-relaxed">{signal.thesis}</p>
      <div className="flex items-center gap-3 text-[10px] font-mono">
        <span className="text-emerald-500">T1: ${signal.targets.t1.toFixed(2)}</span>
        {signal.targets.t2 && <span className="text-emerald-500">T2: ${signal.targets.t2.toFixed(2)}</span>}
        <span className="text-rose-500">Stop: ${signal.invalidation.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── Beta table ────────────────────────────────────────────────────

function BetaTable({ positions }: { positions: BTCBetaPosition[] }) {
  if (positions.length === 0) {
    return (
      <div className="text-[11px] font-mono text-muted-foreground/60 text-center py-8">
        No beta data yet — click Run scan to fetch.
      </div>
    );
  }
  // Sort by absolute beta (highest beta first)
  const sorted = [...positions].sort((a, b) => Math.abs(b.beta30d) - Math.abs(a.beta30d));
  return (
    <div className="qe-card border border-border/40 rounded-md overflow-hidden">
      <div className="grid grid-cols-7 gap-2 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 px-3 py-2 border-b border-border/30 bg-muted/10">
        <div>Ticker</div>
        <div className="text-right">Spot</div>
        <div className="text-right">β 30d</div>
        <div className="text-right">β 90d</div>
        <div className="text-right">R²</div>
        <div className="text-right">Today %</div>
        <div className="text-right">Divergence Z</div>
      </div>
      {sorted.map(p => (
        <div key={p.symbol} className="grid grid-cols-7 gap-2 text-[11px] font-mono px-3 py-2 hover:bg-muted/20 border-b border-border/10 last:border-b-0">
          <div className="font-bold">{p.symbol}</div>
          <div className="text-right">${p.spot.toFixed(2)}</div>
          <div className={`text-right ${p.beta30d >= 1.5 ? 'text-emerald-500' : p.beta30d <= 0.5 ? 'text-amber-500' : 'text-foreground'}`}>
            {p.beta30d.toFixed(2)}
          </div>
          <div className="text-right text-muted-foreground/70">{p.beta90d.toFixed(2)}</div>
          <div className={`text-right ${p.r2 >= 0.5 ? 'text-emerald-500' : 'text-muted-foreground/60'}`}>
            {p.r2.toFixed(2)}
          </div>
          <div className={`text-right ${p.actualMovePct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {p.actualMovePct >= 0 ? '+' : ''}{p.actualMovePct.toFixed(2)}%
          </div>
          <div className={`text-right ${Math.abs(p.divergenceZ) >= 1.5 ? 'text-amber-500 font-bold' : 'text-muted-foreground/70'}`}>
            {p.divergenceZ.toFixed(2)}σ
          </div>
        </div>
      ))}
    </div>
  );
}

function GradePill({ grade }: { grade: string }) {
  const color =
    grade.startsWith('A') ? 'bg-emerald-500/15 text-emerald-500' :
    grade.startsWith('B') ? 'bg-blue-500/15 text-blue-500' :
    grade.startsWith('C') ? 'bg-amber-500/15 text-amber-500' :
    'bg-rose-500/15 text-rose-500';
  return (
    <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${color}`}>
      {grade}
    </div>
  );
}
