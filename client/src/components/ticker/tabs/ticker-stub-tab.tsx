/**
 * TickerStubTab — placeholder shown for tabs whose real content hasn't
 * been built yet (Overview, Options, Vol, Catalysts).
 *
 * The point of this stub is to make the IA fully navigable RIGHT NOW
 * even though the deeper analytics aren't wired up. Each stub tells the
 * user exactly what's coming, so the empty state isn't a dead end —
 * it's a roadmap.
 *
 * This intentionally lives in one file (instead of one file per
 * placeholder) — until the real tab content lands, there's nothing to
 * differentiate them beyond labels.
 */

import { Sparkles } from 'lucide-react';
import { TICKER_TABS, type TickerTabSlug } from '../ticker-tabs';

interface TickerStubTabProps {
  slug: TickerTabSlug;
  symbol: string;
  /** Optional preview lines describing what will live in the real tab. */
  preview?: string[];
}

export function TickerStubTab({ slug, symbol, preview }: TickerStubTabProps) {
  const tab = TICKER_TABS.find((t) => t.slug === slug);
  if (!tab) return null;

  const lines = preview ?? DEFAULT_PREVIEWS[slug] ?? [];

  return (
    <div
      className="rounded-lg border border-dashed border-[var(--gex-positive)]/20 bg-[var(--surface-raised)]/40 p-8 text-center"
      data-testid={`ticker-stub-${slug}`}
    >
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--gex-positive)]/10 border border-[var(--gex-positive)]/30 mb-3">
        <Sparkles className="w-5 h-5 text-[var(--gex-positive)]" />
      </div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
        {symbol} · COMING NEXT
      </div>
      <div className="text-lg font-mono font-bold text-foreground tracking-tight">
        {tab.label}
      </div>
      <div className="text-xs font-mono text-muted-foreground mt-1 max-w-md mx-auto">
        {tab.description}
      </div>
      {lines.length > 0 && (
        <ul className="text-[11px] font-mono text-muted-foreground/80 mt-4 max-w-md mx-auto space-y-1 text-left list-disc list-inside">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const DEFAULT_PREVIEWS: Partial<Record<TickerTabSlug, string[]>> = {
  overview: [
    '5-second trader read: regime, walls, target, bias',
    'Mini chart preview with key dealer levels overlaid',
    'Top peers + sector context + data quality grade',
  ],
  options: [
    'Strike ladder with OI, volume, last price, IV',
    'Unusual flow scanner filtered to this ticker',
    'P/C ratios for OI and volume, by expiration',
  ],
  vol: [
    'IV term structure (1D → 365D)',
    'Skew profile by expiry (10ΔP → 10ΔC)',
    'Volatility surface heatmap',
    'Volatility risk premium and z-score',
  ],
  projection: [
    'Zero-gamma magnet target with confidence band',
    'Multi-horizon outlook (intraday / EOD / multi-day)',
    'Scenario fan: bullish / bearish / neutral paths',
  ],
  catalysts: [
    'Earnings date + historical reaction',
    'Macro events anchoring the tape',
    'News stream filtered to material moves',
  ],
};
