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
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PanelFrame } from '@/components/oracle/panel-frame';
import { TC } from '@/lib/oracle/trading-colors';
import { DivergingBar, ParticipationStrip, robustMax } from '@/components/viz';

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

  // No local collapse state. This panel used to clip itself THREE ways — a 2-line
  // clamp on the summary, a 176px inner scrollbar, and only 5 of N groups rendered —
  // and then PanelFrame clipped it again on top. Two systems truncating the same
  // content is why expanding it didn't reveal what you'd expect. Render everything;
  // PanelFrame owns the height.

  const sectors = data?.sectors ?? [];
  // Shared scale so every bar is comparable — but robust, not the raw max. One
  // outlier group (crypto routinely runs 10x the rest) was setting the axis and
  // flattening every other bar to an unreadable nub.
  const maxMove = robustMax(sectors.map((x) => x.medianChangePct));
  const strong = sectors.filter((x) => x.medianChangePct >= 0);
  const weak = sectors.filter((x) => x.medianChangePct < 0).reverse();
  // What the collapsed view can't fit — used to label the expand control with
  // something specific instead of the word "More".
  const hiddenCount = Math.max(0, sectors.length - 5);

  return (
    <PanelFrame
      title="Session Brief"
      className={className}
      moreLabel={hiddenCount > 0 ? `+${hiddenCount} groups` : undefined}
      right={
        <span className="flex items-center gap-2 text-label font-mono text-muted-foreground">
          {data && (
            <>
              <span style={{ color: data.session === 'regular' ? TC.bull : TC.warn }}>
                {SESSION_LABEL[data.session] ?? data.session}
              </span>
              <span>· {data.quoted}/{data.universeSize} names</span>
            </>
          )}
        </span>
      }
    >
      {isLoading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-label font-mono uppercase tracking-widest text-muted-foreground/70">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> reading leadership…
        </div>
      ) : isError || sectors.length === 0 ? (
        <div className="px-6 py-8 text-center text-meta leading-relaxed text-muted-foreground/70">
          Leadership unavailable right now. It will refresh automatically.
        </div>
      ) : (
        <>
          {data?.interpretation && (
            <p className="ui-prose border-b border-border/30 px-4 py-2 text-body leading-snug text-foreground/85"
               title={data.interpretation}>
              {data.interpretation}
            </p>
          )}

          <div className="px-4 py-2.5">
            <div className="mb-1.5 text-label font-mono uppercase tracking-widest" style={{ color: TC.bull }}>
              Leading
            </div>
            <div className="space-y-2">
              {strong.map((s) => (
                <SectorRow key={s.key} s={s} names={s.leaders} onSelectSymbol={onSelectSymbol} maxMove={maxMove} />
              ))}
            </div>

            <div className="mb-1.5 mt-3 text-label font-mono uppercase tracking-widest" style={{ color: TC.bear }}>
              Under pressure
            </div>
            <div className="space-y-2">
              {weak.map((s) => (
                <SectorRow key={s.key} s={s} names={s.laggards} onSelectSymbol={onSelectSymbol} maxMove={maxMove} />
              ))}
            </div>

            {(data?.megaCaps?.length ?? 0) > 0 && (
              <div className="mt-3 border-t border-border/30 pt-2.5">
                <div className="mb-1 text-label font-mono uppercase tracking-widest text-muted-foreground/70">
                  Mega caps
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {data!.megaCaps.map((m) => (
                    <button key={m.symbol} onClick={() => onSelectSymbol?.(m.symbol)}
                      className="cursor-pointer text-label font-mono tabular-nums transition-opacity hover:opacity-70"
                      style={{ color: m.changePct >= 0 ? TC.bull : TC.bear }}>
                      {m.symbol} {m.changePct >= 0 ? '+' : ''}{m.changePct.toFixed(1)}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="ui-prose mt-3 text-label leading-relaxed text-muted-foreground">
              Trade continuation in the leaders, or look for reversals in the laggards. Confirm on the
              chart before acting — leadership says where to look, not what to buy.
            </p>
          </div>


        </>
      )}
    </PanelFrame>
  );
}

function SectorRow({ s, names, onSelectSymbol, maxMove }: {
  s: SectorStrength; names: LeaderName[]; onSelectSymbol?: (sym: string) => void; maxMove: number;
}) {
  const up = s.medianChangePct >= 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-meta font-mono uppercase tracking-wider text-foreground/85">{s.label}</span>
        <span className="flex items-baseline gap-2 text-label font-mono tabular-nums">
          <span style={{ color: up ? TC.bull : TC.bear }}>
            {up ? '+' : ''}{s.medianChangePct.toFixed(2)}%
          </span>
          {s.isSkewed && <span style={{ color: TC.warn }} title="One name is carrying this group">thin</span>}
        </span>
      </div>

      {/* move vs the rest of the board, drawn from centre so direction reads instantly */}
      <div className="mt-1"><DivergingBar value={s.medianChangePct} max={maxMove} height={5} /></div>

      {/* Breadth — how much of the group is moving together, not just the average.
          A segmented strip rather than a second filled bar: it sits directly under
          the move bar, and two green bars of similar length meaning different things
          is unreadable no matter how correct the widths are. */}
      <div className="mt-1.5 flex items-center gap-2">
        <ParticipationStrip pct={s.breadthPct} className="flex-1 text-foreground" />
        <span className="shrink-0 text-label font-mono tabular-nums text-muted-foreground">
          {s.breadthPct.toFixed(0)}% of group
        </span>
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
        {names.slice(0, 3).map((n) => (
          <button key={n.symbol} onClick={() => onSelectSymbol?.(n.symbol)}
            className="cursor-pointer text-label font-mono tabular-nums transition-opacity hover:opacity-70"
            style={{ color: n.changePct >= 0 ? TC.bull : TC.bear }}>
            {n.symbol} {n.changePct >= 0 ? '+' : ''}{n.changePct.toFixed(1)}%
          </button>
        ))}
      </div>
    </div>
  );
}
