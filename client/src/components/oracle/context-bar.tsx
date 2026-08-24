/**
 * CONTEXT BAR — the market read, as one instrument strip instead of three cards.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE PROBLEM THIS SOLVES
 * ═══════════════════════════════════════════════════════════════════════════
 * Measured on the live board before this change:
 *
 *     market context (3 cards)   0 → 309px
 *     early rotation           317 → 1036px
 *     layer board             1044 → 1426px
 *     THE SIGNALS             1434 → 4133px      ← the fold is at 900px
 *
 * The ranked, graded, tradeable signals — the reason the board exists — began
 * 1434px down, a screen and a half below the fold, underneath 1400px of context
 * and pre-signal material. Early Rotation alone took 719px, and its own copy
 * says "these are setups, not entries — most of these will never produce a
 * graded signal."
 *
 * Four full-width slabs of equal visual weight, stacked in ascending order of
 * importance. Nothing in the layout said which one to look at, so the layout
 * said they were all the same, and the least actionable one came first.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FIX IS COMPRESSION, NOT DELETION
 * ═══════════════════════════════════════════════════════════════════════════
 * Every reading the three cards carried is still here. What changes is the FORM:
 * these are all scalars — a regime word, five asset-class stances, a rotation
 * pair, a leadership name. Scalars belong on a strip, not in cards. A card is
 * for something with internal structure you need to read into; wrapping a single
 * word in 100px of chrome tells the eye to stop and study a thing that can be
 * absorbed at a glance.
 *
 * Result: ~96px instead of 309px, and the signals clear the fold.
 *
 * Anything with real internal structure — the rotation scatter, the full
 * leadership breakdown — stays available behind its own tab rather than being
 * flattened into a number here. Compression must not become amputation.
 */
import { useQuery } from '@tanstack/react-query';
import { Eyebrow, LiveDot, KitStyles, type Tone } from '@/components/templates/kit';
import { cn } from '@/lib/utils';

interface AssetClass { key: string; label: string; symbol: string; changePct: number; stance: string }
interface Sector { etf: string; name: string; change: number; relChange: number; state: string; rank: number }

interface RotationFeed {
  marketState: string; sessionLabel: string; isStale: boolean; spyChange: number;
  headline: string; leaders: Sector[]; laggards: Sector[];
}
interface ExtendedFeed { session?: string; assetClasses?: AssetClass[]; interpretation?: string }

const STANCE_TONE: Record<string, Tone> = {
  BULLISH: 'bull', BEARISH: 'bear', NEUTRAL: 'muted',
};

const pct = (n: number, d = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;

/**
 * Regime, on the SAME thresholds the orb used (>0.3 / <-0.3 on SPY) and with the
 * same three words. The orb's circle is gone; its reading is not. Re-deriving
 * with different cut points would have quietly changed what the board says while
 * looking like a layout change.
 */
function regimeOf(spy: number | null): { label: string; sub: string; tone: Tone } {
  if (spy == null) return { label: 'UNREAD', sub: 'no tape', tone: 'muted' };
  if (spy > 0.3) return { label: 'RISK-ON', sub: 'Buyers in control', tone: 'bull' };
  if (spy < -0.3) return { label: 'RISK-OFF', sub: 'Defense on', tone: 'bear' };
  return { label: 'TRANSITION', sub: 'No clear edge', tone: 'time' };
}

const TONE_CSS: Record<Tone, string> = {
  bull: 'var(--trade-bullish)', bear: 'var(--trade-bearish)',
  time: 'var(--brand-gold)', structural: 'var(--brand-cyan)', muted: 'var(--muted-foreground)',
};

export function ContextBar({ className }: { className?: string }) {
  const { data: rot } = useQuery<RotationFeed>({
    queryKey: ['/api/sector-rotation', 'context-bar'],
    queryFn: async () => {
      const r = await fetch('/api/sector-rotation', { credentials: 'include' });
      if (!r.ok) throw new Error('rotation unavailable');
      return r.json();
    },
    staleTime: 120_000, retry: 1,
  });

  const { data: ext } = useQuery<ExtendedFeed>({
    queryKey: ['/api/extended-hours', 'context-bar'],
    queryFn: async () => {
      const r = await fetch('/api/extended-hours?limit=1', { credentials: 'include' });
      if (!r.ok) throw new Error('extended unavailable');
      return r.json();
    },
    staleTime: 120_000, retry: 1,
  });

  const open = rot?.marketState && rot.marketState !== 'CLOSED';
  const spy = rot?.spyChange ?? null;
  const lead = rot?.leaders?.[0];
  const lag = rot?.laggards?.[0];
  const regime = regimeOf(spy);

  return (
    <div
      className={cn(
        'flex flex-wrap items-stretch gap-x-8 gap-y-3 rounded-lg border border-card-border bg-card px-4 py-3',
        className,
      )}
    >
      <KitStyles />

      {/* ── regime + session · the reading that invalidates every other one ── */}
      <div className="flex min-w-0 flex-col justify-center gap-1">
        <Eyebrow tone={rot?.isStale ? 'time' : 'structural'}>
          {open ? 'Live session' : rot?.sessionLabel ?? 'Session'}
        </Eyebrow>
        <div className="flex items-baseline gap-2.5">
          {open && <LiveDot />}
          <span
            className="text-lg font-medium leading-none tracking-[-0.01em]"
            style={{ color: TONE_CSS[regime.tone] }}
          >
            {regime.label}
          </span>
          <span
            className="font-mono text-[11px] tabular-nums"
            style={{ color: spy == null ? undefined : spy >= 0 ? 'var(--trade-bullish)' : 'var(--trade-bearish)' }}
          >
            {spy == null ? '—' : `SPY ${pct(spy, 2)}`}
          </span>
          {rot?.isStale && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--brand-gold)]">stale</span>
          )}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
          {regime.sub}
        </span>
      </div>

      <Rule />

      {/* ── asset classes · where money actually is ── */}
      <div className="flex min-w-0 flex-col justify-center gap-1.5">
        <BarLabel>By asset class</BarLabel>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {(ext?.assetClasses ?? []).map((a) => (
            <span key={a.key} className="flex items-baseline gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {a.label}
              </span>
              <span
                className="font-mono text-[11px] font-medium tabular-nums"
                style={{ color: `var(--${STANCE_TONE[a.stance] === 'bull' ? 'trade-bullish' : STANCE_TONE[a.stance] === 'bear' ? 'trade-bearish' : 'muted-foreground'})` }}
              >
                {pct(a.changePct)}
              </span>
            </span>
          ))}
          {!ext?.assetClasses?.length && (
            <span className="font-mono text-[10px] text-muted-foreground/60">unavailable</span>
          )}
        </div>
      </div>

      <Rule />

      {/* ── rotation · one pair, not a scatter. The scatter lives in its own tab. ── */}
      <div className="flex min-w-0 flex-col justify-center gap-1.5">
        <BarLabel>Rotation</BarLabel>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          {lead ? (
            <span className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground/60">into</span>
              <span style={{ color: 'var(--trade-bullish)' }}>{lead.name}</span>
              <span className="tabular-nums text-muted-foreground">{pct(lead.change)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground/60">no clear inflow</span>
          )}
          {lag && (
            <span className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground/60">out of</span>
              <span style={{ color: 'var(--trade-bearish)' }}>{lag.name}</span>
              <span className="tabular-nums text-muted-foreground">{pct(lag.change)}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── the sentence, if there is room. Truncated, never wrapped to a block:
             a paragraph here would rebuild the card this strip replaced. ── */}
      {ext?.interpretation && (
        <div className="ml-auto hidden min-w-0 max-w-[30ch] flex-col justify-center xl:flex">
          <span className="truncate font-mono text-[10px] leading-relaxed text-muted-foreground/70" title={ext.interpretation}>
            {ext.interpretation}
          </span>
        </div>
      )}
    </div>
  );
}

function Rule() {
  return <span aria-hidden className="hidden w-px self-stretch bg-border md:block" />;
}

/**
 * One label treatment for every section on the strip.
 *
 * The first pass had two: `Eyebrow` on the session block and a bare faint span on
 * the other three, which is exactly the drift the kit exists to prevent. It also
 * set those spans at 9px / 50% opacity — around 2:1 against the card, under any
 * usable threshold, on the only text that says what the numbers beside it mean.
 *
 * The session block keeps its Eyebrow, and that is hierarchy rather than
 * inconsistency: it carries the reading that invalidates all the others, so it
 * is the one section allowed to announce itself.
 */
function BarLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
      {children}
    </span>
  );
}
