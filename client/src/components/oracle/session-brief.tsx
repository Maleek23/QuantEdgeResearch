/**
 * SESSION BRIEF — "what do I go into today with?"
 *
 * The desk's morning workflow starts with sector leadership, not with a signal list:
 * see which groups are bid, then find the names carrying them, then go looking for flow.
 * The platform computed all of this and left it in an endpoint nobody surfaced, so at
 * 08:25 with the open an hour away the screen said nothing useful.
 *
 * Session-aware by design: outside 09:30–16:00 this reads the extended-hours tape, so
 * pre-market leadership is visible while it still matters — before the bell.
 */
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TC } from '@/lib/oracle/trading-colors';
import { DivergingBar, Meter } from '@/components/viz';

interface LeaderName { symbol: string; changePct: number; isMega?: boolean }
interface SectorStrength {
  key: string; label: string; medianChangePct: number; breadthPct: number;
  strength: number; isSkewed?: boolean; leaders: LeaderName[]; laggards: LeaderName[];
  stance: 'leading' | 'improving' | 'weakening' | 'lagging';
}
interface Leadership {
  session: string; quoted: number; universeSize: number;
  benchmarkChangePct: number | null;
  sectors: SectorStrength[]; megaCaps: LeaderName[];
  interpretation: string;
}

const SESSION_LABEL: Record<string, string> = {
  pre: 'Pre-market', regular: 'Live session', post: 'After-hours', closed: 'Overnight',
};

export function SessionBrief({ onSelectSymbol, className }: { onSelectSymbol?: (s: string) => void; className?: string }) {
  const { data, isLoading, isError } = useQuery<Leadership>({
    queryKey: ['/api/sector-leadership'],
    queryFn: async () => {
      const r = await fetch('/api/sector-leadership', { credentials: 'include' });
      if (!r.ok) throw new Error('leadership failed');
      return r.json();
    },
    staleTime: 120_000, refetchInterval: 180_000, retry: 1,
  });

  const sectors = data?.sectors ?? [];
  // shared scale so every bar on the panel is comparable
  const maxMove = Math.max(0.5, ...sectors.map((x) => Math.abs(x.medianChangePct)));
  const strong = sectors.slice(0, 4);
  const weak = sectors.slice(-2).reverse();

  return (
    <div className={cn('rounded-xl border border-card-border bg-card overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
          Session Brief
        </span>
        <span className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/70">
          {data && (
            <>
              <span style={{ color: data.session === 'regular' ? TC.bull : TC.warn }}>
                {SESSION_LABEL[data.session] ?? data.session}
              </span>
              <span>· {data.quoted}/{data.universeSize} names</span>
            </>
          )}
        </span>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> reading leadership…
        </div>
      ) : isError || sectors.length === 0 ? (
        <div className="px-6 py-8 text-center text-[11px] leading-relaxed text-muted-foreground/70">
          Leadership unavailable right now. It will refresh automatically.
        </div>
      ) : (
        <>
          {data?.interpretation && (
            <p className="border-b border-border/30 px-4 py-2.5 text-[12px] leading-relaxed text-foreground/85">
              {data.interpretation}
            </p>
          )}

          <div className="px-4 py-3">
            <div className="mb-1.5 text-[10px] font-mono uppercase tracking-widest" style={{ color: TC.bull }}>
              Leading
            </div>
            <div className="space-y-2">
              {strong.map((s) => (
                <SectorRow key={s.key} s={s} names={s.leaders} onSelectSymbol={onSelectSymbol} maxMove={maxMove} />
              ))}
            </div>

            <div className="mb-1.5 mt-3 text-[10px] font-mono uppercase tracking-widest" style={{ color: TC.bear }}>
              Under pressure
            </div>
            <div className="space-y-2">
              {weak.map((s) => (
                <SectorRow key={s.key} s={s} names={s.laggards} onSelectSymbol={onSelectSymbol} maxMove={maxMove} />
              ))}
            </div>

            {(data?.megaCaps?.length ?? 0) > 0 && (
              <div className="mt-3 border-t border-border/30 pt-2.5">
                <div className="mb-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
                  Mega caps
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {data!.megaCaps.map((m) => (
                    <button key={m.symbol} onClick={() => onSelectSymbol?.(m.symbol)}
                      className="cursor-pointer text-[10px] font-mono tabular-nums transition-opacity hover:opacity-70"
                      style={{ color: m.changePct >= 0 ? TC.bull : TC.bear }}>
                      {m.symbol} {m.changePct >= 0 ? '+' : ''}{m.changePct.toFixed(1)}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/70">
              Trade continuation in the leaders, or look for reversals in the laggards. Confirm on the
              chart before acting — leadership says where to look, not what to buy.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function SectorRow({ s, names, onSelectSymbol, maxMove }: {
  s: SectorStrength; names: LeaderName[]; onSelectSymbol?: (sym: string) => void; maxMove: number;
}) {
  const up = s.medianChangePct >= 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-foreground/85">{s.label}</span>
        <span className="flex items-baseline gap-2 text-[10px] font-mono tabular-nums">
          <span style={{ color: up ? TC.bull : TC.bear }}>
            {up ? '+' : ''}{s.medianChangePct.toFixed(2)}%
          </span>
          {s.isSkewed && <span style={{ color: TC.warn }} title="One name is carrying this group">thin</span>}
        </span>
      </div>

      {/* move vs the rest of the board, drawn from centre so direction reads instantly */}
      <div className="mt-1"><DivergingBar value={s.medianChangePct} max={maxMove} height={5} /></div>

      {/* breadth — how much of the group is participating, not just the average */}
      <div className="mt-1">
        <Meter
          value={s.breadthPct}
          right={`${s.breadthPct.toFixed(0)}% participating`}
          color={s.breadthPct >= 60 ? TC.bull : s.breadthPct >= 40 ? TC.warn : TC.bear}
          height={4}
        />
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
        {names.slice(0, 3).map((n) => (
          <button key={n.symbol} onClick={() => onSelectSymbol?.(n.symbol)}
            className="cursor-pointer text-[10px] font-mono tabular-nums transition-opacity hover:opacity-70"
            style={{ color: n.changePct >= 0 ? TC.bull : TC.bear }}>
            {n.symbol} {n.changePct >= 0 ? '+' : ''}{n.changePct.toFixed(1)}%
          </button>
        ))}
      </div>
    </div>
  );
}
