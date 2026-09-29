/**
 * Flow tape — shared client read model for the FLOW dashboard tools.
 *
 * One query (/api/flow/tape, 15s server cache) feeds Options Flow, Net Flow
 * by Strike and Flow Alerts, so three tools on screen cost one request.
 * Also home of SigScore, whose formula is stated here and in the UI tooltip.
 */
import { useQuery } from '@tanstack/react-query';

export interface TapeRow {
  id: string;
  source: 'bullflow' | 'chain-scan';
  at: string | null;
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  premium: number;
  price: number | null;
  size: number | null;
  spot: number | null;
  openInterest: number | null;
  volOI: number | null;
  label: string;
  kind: 'sweep' | 'block' | 'unusual' | 'repeater' | 'grenade' | 'custom' | 'other';
  alertType: 'algo' | 'custom' | null;
}

export interface TapePayload {
  generatedAt: string;
  windowDays: number;
  symbol?: string | null;
  rows: TapeRow[];
  truncated: boolean;
  sources: {
    bullflow: { enabled: boolean; streamState: string; rows: number; newestAt: string | null };
    chainScan: { ok: boolean; rows: number; newestAt: string | null; error?: string };
  };
}

/**
 * The tape. Without a symbol: the market-wide read (Options Flow, Flow Alerts,
 * Sweeps & blocks, Unusual, tape Top Tickers) — one shared key per window.
 * With a symbol: that underlying only (ladder, heatmap, timeline, context) —
 * one shared key per symbol + window, so the ticker tools cost one request.
 */
export function useFlowTape(days: number, symbol?: string | null, enabled = true) {
  const sym = symbol ? symbol.toUpperCase() : null;
  return useQuery<TapePayload>({
    queryKey: sym ? ['/api/flow/tape', days, sym] : ['/api/flow/tape', days],
    queryFn: async () => {
      const r = await fetch(`/api/flow/tape?days=${days}${sym ? `&symbol=${encodeURIComponent(sym)}` : ''}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`flow tape ${r.status}`);
      return r.json();
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 1,
    enabled,
  });
}

// Index / sector / leveraged ETF list. Not exhaustive — the ETF / Stocks chips
// say so in their tooltip.
export const ETF_SET = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'SPX', 'SPXW', 'XSP', 'NDX', 'RUT', 'VIX', 'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'UVXY', 'VXX', 'SMH', 'SOXX', 'XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLP', 'XLI', 'XLU', 'XLC', 'XLB', 'XLRE', 'IGV', 'XBI', 'XOP', 'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'HYG', 'LQD', 'EEM', 'EFA', 'FXI', 'KWEB', 'EWZ', 'GDX', 'GDXJ', 'GDXU', 'ARKK', 'KRE', 'SPXL', 'SPXS', 'UPRO', 'TNA', 'TZA', 'LABU', 'TSLL', 'TSLG', 'TSLR', 'NVDL', 'SMCX', 'PLTU', 'MSTU', 'MSTX', 'BITX', 'IBIT', 'FBTC', 'ETHA', 'BITO', 'URA', 'JETS', 'XHB', 'ITB', 'XRT', 'VNQ', 'IEF', 'SHY', 'BND', 'AGG', 'VOO', 'VTI', 'IVV', 'RSP', 'MDY', 'IJR']);

export const contractKey = (r: Pick<TapeRow, 'symbol' | 'optionType' | 'strike' | 'expiry'>) =>
  `${r.symbol}|${r.optionType}|${r.strike}|${r.expiry}`;

export function dte(expiry: string, now = Date.now()): number | null {
  const t = Date.parse(`${expiry.slice(0, 10)}T16:00:00-04:00`);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((t - now) / 86_400_000));
}

/* ───────────────────────────── SigScore ─────────────────────────────
 *
 * SigScore ∈ [0, 1] — a transparent ORDERING of prints, not a probability
 * and not a direction. Sum of four components, each 0…1 × weight:
 *
 *   size       0.40 × clamp((log10(premium) − log10($50K)) / (log10($10M) − log10($50K)))
 *   aggression 0.20 × (sweep = 1 · block = 0.5 · anything else = 0)
 *   repeat     0.20 × min(1, (n − 1) / 4), n = prints of the SAME contract in
 *                     the loaded window (so it depends on the window chosen)
 *   vol/OI     0.20 × min(1, volume / open interest ÷ 5)
 *
 * A component whose input the source does not carry (e.g. vol/OI on Bullflow
 * alerts, which have no OI) scores 0 — missing data never adds points, so a
 * Bullflow alert tops out at 0.80. Bid/ask side is NOT an input: neither
 * source measures it.
 */
export const SIG_WEIGHTS = { size: 0.4, aggression: 0.2, repeat: 0.2, volOI: 0.2 } as const;
const LOG_LO = Math.log10(50_000);
const LOG_HI = Math.log10(10_000_000);

export interface SigParts { size: number; aggression: number; repeat: number; volOI: number | null; total: number }

export function sigScore(r: TapeRow, repeatN: number): SigParts {
  const size = r.premium > 0 ? Math.min(1, Math.max(0, (Math.log10(r.premium) - LOG_LO) / (LOG_HI - LOG_LO))) : 0;
  const aggression = r.kind === 'sweep' ? 1 : r.kind === 'block' ? 0.5 : 0;
  const repeat = Math.min(1, Math.max(0, (repeatN - 1) / 4));
  const volOI = r.volOI != null && Number.isFinite(r.volOI) ? Math.min(1, Math.max(0, r.volOI / 5)) : null;
  const total = SIG_WEIGHTS.size * size + SIG_WEIGHTS.aggression * aggression + SIG_WEIGHTS.repeat * repeat + SIG_WEIGHTS.volOI * (volOI ?? 0);
  return { size, aggression, repeat, volOI, total: Math.round(total * 100) / 100 };
}

export const SIG_FORMULA_TEXT = [
  'SigScore (0–1) orders prints; it is not a probability or a direction.',
  '0.40 × size: log-scaled premium, $50K → 0, $10M → 1',
  '0.20 × aggression: sweep 1 · block 0.5 · other 0',
  '0.20 × repeat: same contract n times in this window → (n−1)/4, max 1',
  '0.20 × vol/OI: volume ÷ open interest ÷ 5, max 1',
  'Inputs a source does not carry score 0 (Bullflow alerts have no OI → max 0.80).',
  'Bid/ask side is not an input — neither feed measures it.',
].join('\n');

/* ───────────────────────────── formatting ───────────────────────────── */

export const money = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
};

export function ageLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'no timestamp';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'no timestamp';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 90) return `${Math.round(s)}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${(s / 3600).toFixed(1)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const etTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
