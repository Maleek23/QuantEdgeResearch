/**
 * Wall-touch badge — "price 0.3% above put wall 600 · touched 1×".
 * Used in the NEXUS setup detail and the ticker page's dealer map. Reads
 * GET /api/wall-touch/:symbol (server/wall-touch.ts, flag WALL_TOUCH). Renders
 * nothing unless the engine's last cycle has a row for this symbol. Plain
 * styling (theme tokens only, light/dark), wraps on phones. Status: measuring.
 */
import { useQuery } from '@tanstack/react-query';
import './walls.css';

export interface WallRowWire {
  symbol: string; wall: 'put' | 'call'; wallPrice: number; wallBasis: string;
  state: 'away' | 'approaching' | 'touched' | 'rejected' | 'broken' | 'stalled' | 'beyond';
  distPct: number | null; touches: number; line: string;
  lastEvent: { kind: string; atEt: string; price: number } | null;
  live: { h15: { tradePct: number } | null; h30: { tradePct: number } | null; mfePct: number | null } | null;
  contract: { occ: string; strike: number; type: 'call' | 'put'; label: string; ask: number | null; vehicle: string } | null;
  superseded: boolean;
}
interface WallSymbolWire {
  symbol: string; enabled: boolean; asOf: string | null;
  walls: { putWall: number | null; callWall: number | null; basis: string; computedAt: string } | null;
  rows: WallRowWire[];
}

const EVENT_WORD: Record<string, string> = { approach: 'approached', touch: 'touched', rejection: 'rejection', break: 'break', stall: 'stalled' };

/** The row's line without the leading symbol ("AMD price … " → "price …"). */
export function wallLine(r: WallRowWire): string {
  return r.line.startsWith(`${r.symbol} `) ? r.line.slice(r.symbol.length + 1) : r.line;
}

export function WallTouchBadge({ symbol, className }: { symbol: string; className?: string }) {
  const q = useQuery<WallSymbolWire>({
    queryKey: ['/api/wall-touch', symbol],
    queryFn: async () => {
      const r = await fetch(`/api/wall-touch/${encodeURIComponent(symbol)}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`wall touch ${r.status}`);
      return r.json();
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 55_000,
    retry: false,
    enabled: !!symbol,
  });
  const rows = (q.data?.rows ?? []).filter((r) => !r.superseded);
  if (!rows.length) return null;
  return (
    <p className={`wt-badges ${className ?? ''}`} aria-label={`${symbol} GEX wall proximity`}>
      {rows.slice(0, 2).map((r) => (
        <span
          key={`${r.wall}-${r.wallPrice}`}
          className={`wt-badge wt-${r.state}`}
          title={`${r.wall === 'put' ? 'Put' : 'Call'} wall ${r.wallPrice} — ${r.wallBasis}.${r.lastEvent ? ` Last: ${EVENT_WORD[r.lastEvent.kind] ?? r.lastEvent.kind} ${r.lastEvent.atEt} ET @ ${r.lastEvent.price.toFixed(2)}.` : ''} Walls are modelled dealer positioning, not guaranteed support/resistance. Measuring.`}
        >
          {wallLine(r)}
        </span>
      ))}
    </p>
  );
}
