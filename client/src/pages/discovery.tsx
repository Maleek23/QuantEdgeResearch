/**
 * Multi-Signal Discovery Page
 * ===========================
 * Surfaces ARM/QCOM/AEHR-tier setups across 250+ tickers using the
 * unified convergence score (squeeze + GEX + IV + range + catalyst).
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { componentStyles } from '@/lib/design-tokens';

interface DiscoveryResult {
  ticker: string;
  spot: number;
  score: number;
  setupTier: 'A+' | 'A' | 'B+' | 'B' | 'C';
  signals: {
    squeeze: { ratio: number; firing: boolean };
    range: { tight2y: number; position: number };
    iv: { atm: number | null; cheap: boolean };
    gex: {
      regime: 'PINNED-DRIFT' | 'SQUEEZE-RISK' | 'MIXED';
      callWall: number | null;
      callRoom: number | null;
      hasNegativeGEX: boolean;
    };
    momentum4w: number;
    catalyst: { proximityDays: number | null; type: string | null };
  };
  bestContract?: {
    style: string;
    expiry: string;
    strike: number;
    midPrice: number;
    delta: number;
    iv: number;
  };
  thesis: string;
}

const SECTORS = [
  { key: 'all', label: 'All Sectors' },
  { key: 'semis_megacap', label: 'Semis (Mega)' },
  { key: 'semis_cap_equipment', label: 'Semi-Cap' },
  { key: 'ai_infrastructure', label: 'AI Infra' },
  { key: 'ai_data_center_power', label: 'AI Power' },
  { key: 'nuclear_uranium', label: 'Nuclear' },
  { key: 'voice_ai_software', label: 'AI Software' },
  { key: 'consumer_coils', label: 'Consumer Coils' },
  { key: 'fintech_stablecoin', label: 'Fintech' },
  { key: 'biotech_catalysts', label: 'Biotech' },
  { key: 'materials_critical', label: 'Materials' },
  { key: 'industrials_defense', label: 'Defense' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'rate_cut_homebuilders', label: 'Homebuilders' },
  { key: 'crypto_ai_pivot', label: 'Crypto-AI' },
  { key: 'space_drones', label: 'Space/Drones' },
  { key: 'china_adrs', label: 'China ADRs' },
  { key: 'evtol_autonomy', label: 'eVTOL/AV' },
  { key: 'quantum_photonics', label: 'Quantum' },
  { key: 'telecom_ai', label: 'Telecom AI' },
];

const TIER_COLORS: Record<string, string> = {
  'A+': 'bg-[var(--trade-bullish)]/20 text-[var(--trade-bullish)] border-[var(--trade-bullish)]/30',
  'A': 'bg-[var(--trade-bullish)]/15 text-[var(--trade-bullish)] border-[var(--trade-bullish)]/25',
  'B+': 'bg-[var(--brand-cyan)]/20 text-[var(--brand-cyan)] border-[var(--brand-cyan)]/30',
  'B': 'bg-[var(--trade-neutral)]/20 text-[var(--trade-neutral)] border-[var(--trade-neutral)]/30',
  'C': 'bg-muted border-border text-muted-foreground',
};

export default function DiscoveryPage() {
  const [sector, setSector] = useState<string>('all');
  const [minScore, setMinScore] = useState<number>(50);

  const { data, isLoading, refetch, isFetching } = useQuery<{
    scanned_at: string;
    count: number;
    results: DiscoveryResult[];
  }>({
    queryKey: ['discovery', sector, minScore],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (sector !== 'all') params.set('sector', sector);
      params.set('minScore', String(minScore));
      params.set('limit', '40');
      const res = await fetch(`/api/discovery/sleepers?${params}`);
      if (!res.ok) throw new Error('Discovery failed');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Discovery</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Multi-signal convergence: squeeze + GEX + IV anomaly + 2yr range + catalyst proximity
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const res = await fetch('/api/discovery/push-to-trade-desk', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ minScore: 70, maxIdeas: 8 })
                });
                const data = await res.json();
                alert(`✅ ${data.pushed_count} elite setups pushed to Trade Desk\n\n` +
                  data.results.filter((r: any) => r.pushed).map((r: any) => `${r.ticker} [${r.tier}] ${r.score}`).join('\n'));
              }}
              className="px-4 py-2 bg-[var(--trade-bullish)]/10 border border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)] rounded-lg hover:bg-[var(--trade-bullish)]/20"
            >
              🎯 Push Elite → Trade Desk
            </button>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="px-4 py-2 bg-[var(--brand-cyan)]/10 border border-[var(--brand-cyan)]/30 text-[var(--brand-cyan)] rounded-lg hover:bg-[var(--brand-cyan)]/20 disabled:opacity-50"
            >
              {isFetching ? 'Scanning...' : 'Refresh Scan'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">Sector</label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="bg-card border border-border rounded px-3 py-1.5 text-sm"
            >
              {SECTORS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">Min Score</label>
            <input
              type="range"
              min={30}
              max={90}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-32"
            />
            <span className="text-sm font-mono w-8">{minScore}</span>
          </div>
          {data && (
            <span className="text-xs text-muted-foreground ml-auto">
              {data.count} setups · scanned {new Date(data.scanned_at).toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Results table */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Running convergence scan across 250+ tickers...</div>
        ) : !data?.results?.length ? (
          <div className="text-center py-12 text-muted-foreground">No setups meeting criteria. Lower the score threshold.</div>
        ) : (
          <div className="space-y-2">
            {data.results.map((r) => (
              <DiscoveryRow key={r.ticker} result={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiscoveryRow({ result }: { result: DiscoveryResult }) {
  const [expanded, setExpanded] = useState(false);
  const tierClass = TIER_COLORS[result.setupTier];

  return (
    <div className={`${componentStyles.card.default} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center min-w-[60px]">
            <span className={`px-2 py-0.5 rounded text-xs font-bold border ${tierClass}`}>
              {result.setupTier}
            </span>
            <span className="text-2xl font-mono font-bold mt-1">{result.score}</span>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xl font-bold">{result.ticker}</span>
              <span className="text-muted-foreground">${result.spot.toFixed(2)}</span>
              <span className={
                result.signals.gex.regime === 'SQUEEZE-RISK' ? componentStyles.badge.warning :
                result.signals.gex.regime === 'PINNED-DRIFT' ? componentStyles.badge.cyan :
                componentStyles.badge.default
              }>
                {result.signals.gex.regime}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{result.thesis}</p>
          </div>

          <div className="hidden md:flex gap-4 text-xs">
            <Stat label="Squeeze" value={result.signals.squeeze.ratio.toFixed(2)} highlight={result.signals.squeeze.firing} />
            <Stat label="IV" value={result.signals.iv.atm ? `${result.signals.iv.atm.toFixed(0)}%` : '—'} highlight={result.signals.iv.cheap} />
            <Stat label="Pos" value={`${result.signals.range.position.toFixed(0)}%`} highlight={result.signals.range.position > 90} />
            <Stat label="4w" value={`${result.signals.momentum4w.toFixed(0)}%`} />
            {result.signals.gex.callRoom !== null && (
              <Stat label="Wall" value={`+${result.signals.gex.callRoom.toFixed(1)}%`} highlight={result.signals.gex.callRoom > 5 && result.signals.gex.callRoom < 18} />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/20">
          {result.bestContract && (
            <>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Suggested Contract</div>
              <div className="flex flex-wrap gap-4 items-center mb-3">
                <span className="font-mono text-sm">
                  {result.ticker} ${result.bestContract.strike} C {result.bestContract.expiry}
                </span>
                <span className="text-[var(--trade-bullish)] font-bold">${result.bestContract.midPrice.toFixed(2)}</span>
                <span className="text-muted-foreground text-xs">Δ {result.bestContract.delta.toFixed(2)}</span>
                <span className="text-muted-foreground text-xs">IV {result.bestContract.iv.toFixed(0)}%</span>
                <span className={componentStyles.badge.default}>
                  {result.bestContract.style.replace('_', ' ')}
                </span>
              </div>
            </>
          )}
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const res = await fetch(`/api/discovery/push-ticker/${result.ticker}`, { method: 'POST' });
              const data = await res.json();
              alert(data.pushed
                ? `✅ ${result.ticker} pushed to Trade Desk`
                : `❌ Not pushed: ${data.reason}`);
            }}
            className="px-3 py-1.5 bg-[var(--trade-bullish)]/10 border border-[var(--trade-bullish)]/30 text-[var(--trade-bullish)] rounded text-sm hover:bg-[var(--trade-bullish)]/20"
          >
            🎯 Push to Trade Desk
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center min-w-[50px]">
      <span className="text-muted-foreground text-[10px] uppercase">{label}</span>
      <span className={`font-mono ${highlight ? 'text-[var(--trade-bullish)] font-bold' : 'text-foreground/80'}`}>{value}</span>
    </div>
  );
}
