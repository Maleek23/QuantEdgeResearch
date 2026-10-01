/**
 * "ADX / Holy Grail" badge for the NEXUS setup detail — shows only when the
 * Holy Grail engine (server/holy-grail.ts, flag HOLY_GRAIL) has an ACTIVE setup
 * on this symbol in its last cycle: armed (entry stop live) or triggered within
 * the hour. Plain styling; status is always "measuring".
 */
import { useQuery } from '@tanstack/react-query';

interface HgRowWire {
  tf: '5m' | '15m' | '1d'; side: 'long' | 'short'; status: 'armed' | 'triggered' | 'published';
  signalEt: string; triggerEt: string | null; adx: number; ema: number; entryStop: number; fill: number | null; stop: number; planTarget: number | null;
  replay: { publish: boolean; evidence: string };
}
interface HgSymbolWire { symbol: string; enabled: boolean; asOf: string | null; active: HgRowWire[] }

const fmt = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2));

export function HolyGrailBadge({ symbol }: { symbol: string }) {
  const q = useQuery<HgSymbolWire>({
    queryKey: ['/api/holy-grail', symbol],
    queryFn: async () => {
      const r = await fetch(`/api/holy-grail/${encodeURIComponent(symbol)}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`holy grail ${r.status}`);
      return r.json();
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 55_000,
    retry: false,
  });
  const rows = q.data?.active ?? [];
  if (!rows.length) return null;
  return (
    <p className="nxp-times nxp-hg">
      {rows.slice(0, 3).map((r) => (
        <span
          key={`${r.tf}-${r.side}-${r.signalEt}`}
          className="nxp-hg-badge"
          title={`Raschke Holy Grail — ADX(14) ${r.adx} > 30, pullback to EMA20 ${fmt(r.ema)} on the ${r.signalEt} bar. ${r.status === 'armed' ? `Entry stop ${fmt(r.entryStop)}` : `Filled ${fmt(r.fill)} at ${r.triggerEt}`}, stop ${fmt(r.stop)}${r.planTarget != null ? `, target ${fmt(r.planTarget)}` : ''}. Replay: ${r.replay.evidence}. Measuring.`}
        >
          ADX / Holy Grail · {r.tf} {r.side} · {r.status === 'armed' ? `armed @ ${fmt(r.entryStop)}` : `triggered ${r.triggerEt}`} · ADX {r.adx.toFixed(0)}
        </span>
      ))}
    </p>
  );
}
