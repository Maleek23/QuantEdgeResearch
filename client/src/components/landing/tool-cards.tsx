/**
 * TOOL CARDS — the reference site's card anatomy, rebuilt against live data.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THEIR CARDS ACTUALLY DO, read out of their stylesheet
 * ─────────────────────────────────────────────────────────────────────────────
 * A card is not a headline in a box. It has four parts and three motions:
 *
 *   .tool-card        min-height 340, padding 40, overflow hidden, and
 *                     transition: transform .35s cubic-bezier(.2,.8,.2,1)
 *   .tool-card:after  a 2px accent rule, transform-origin left, scaleX(0) → (1)
 *                     over .5s — the underline wipes in on hover
 *   .tool-card:hover  translateY(-3px), border-color → accent,
 *                     box-shadow 0 20px 44px -22px
 *
 *   .tool-chart       height 80, gap 4, align-items:end, bars flex:1
 *   .tool-chart .bar  opacity .2, transition all .4s, INLINE transition-delay
 *                     stepping 30ms per bar
 *   :hover .bar:nth-child(odd) { opacity:.6 }
 *   :hover .bar:nth-child(3n)  { opacity:1 }
 *      └─ this is the wave. Two overlapping selectors on a staggered delay make
 *         the bars light up in a travelling pattern rather than all at once.
 *
 *   .tool-heatmap     grid, repeat(12,1fr), gap 3, cells aspect-ratio 1
 *
 *   .tool-preview     position:absolute; inset:0; opacity:0; visibility:hidden
 *   .tool-card:hover
 *     .tool-preview   opacity:1; visibility:visible; pointer-events:auto
 *      └─ AN ENTIRE SECOND CARD FACE. Hovering swaps the marketing copy for a
 *         mock terminal — topbar with traffic-light dots, stat tiles, data rows.
 *         This is the piece that makes their cards feel like a product rather
 *         than a brochure, and it is invisible in a screenshot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE THIS DEPARTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Their bars and heatmap cells are random numbers generated at build time — the
 * bar heights are unlabelled and the heatmap has no legend, because there is
 * nothing behind them to label. Ours read /api/convictions: the bars are the
 * live conviction scores of the top-ranked ideas in rank order, and the heatmap
 * is the actual layer-firing matrix — one column per idea, one row per layer,
 * cell opacity from the points that layer contributed.
 *
 * So the hover reveal is not a mock terminal either. It is the same numbers the
 * board shows, which is the only version of this pattern worth shipping on a
 * product that claims to measure things.
 *
 * If the endpoint is empty the viz renders a flat rule and says so. It never
 * falls back to generated bars.
 */
import { useQuery } from '@tanstack/react-query';
import { CONVICTION_LAYERS } from '@shared/conviction-layers';
import { cn } from '@/lib/utils';
import { Matrix, type MatrixRow } from '@/components/templates/charts';
import { IntensityLegend, KitStyles } from '@/components/templates/kit';
import {
  SchematicStyles, ScanSchematic, ConvergenceSchematic, ContractSchematic,
} from './schematic';

// ── live feed ────────────────────────────────────────────────────────────────

interface Layer { kind: string; label: string; points: number; why?: string }
interface Pick {
  ideaId: string; symbol: string; direction: 'long' | 'short';
  convictionScore: number; convictionBand: 'S' | 'A' | 'B' | 'C';
  layerCount: number; layers: Layer[];
  riskRewardRatio?: number; optionDte?: number; strikePrice?: number; optionType?: string;
}
interface ConvictionFeed {
  picks: Pick[];
  totalCandidatesScanned?: number;
  marketContext?: { regime?: string; preferredDirection?: string };
}

function useConvictions() {
  return useQuery<ConvictionFeed>({
    queryKey: ['/api/convictions', 'landing-cards'],
    queryFn: async () => {
      const r = await fetch('/api/convictions', { credentials: 'include' });
      if (!r.ok) throw new Error('convictions unavailable');
      return r.json();
    },
    staleTime: 300_000,
    retry: 1,
  });
}

// ── card shell ───────────────────────────────────────────────────────────────

function ToolCard({
  label, badge, title, body, viz, preview, className,
}: {
  label: string; badge: string; title: string; body: string;
  viz?: React.ReactNode; preview?: React.ReactNode; className?: string;
}) {
  return (
    <article
      className={cn(
        'qe-vis-host group relative flex min-h-[340px] flex-col overflow-hidden bg-card p-8',
        'border border-card-border',
        'transition-[transform,box-shadow,border-color] duration-[350ms] ease-[cubic-bezier(.2,.8,.2,1)]',
        'hover:-translate-y-[3px] hover:border-[color:var(--brand-cyan)]',
        'hover:shadow-[0_20px_44px_-22px_rgba(10,15,14,.28)]',
        className,
      )}
    >
      {/* their :after — a 2px rule that wipes in from the left edge */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-0.5 origin-left scale-x-0',
          'bg-[var(--brand-cyan)] transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]',
          'group-hover:scale-x-100 motion-reduce:transition-none',
        )}
      />

      <div className="mb-7 flex items-start justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--brand-cyan)]">
          {label}
        </span>
        <span className="rounded-[1px] border border-[var(--brand-cyan)]/30 bg-[var(--brand-cyan)]/10 px-2 py-[3px] font-mono text-[10px] tracking-[0.08em] text-[var(--brand-cyan)]">
          {badge}
        </span>
      </div>

      <h3 className="mb-4 text-[28px] font-light leading-[1.15] tracking-[-0.02em] text-foreground">
        {title}
      </h3>
      <p className="max-w-[440px] flex-1 text-sm leading-[1.65] text-muted-foreground">{body}</p>

      {viz}

      {/* Second face. Hidden from AT and from the tab order until it is shown. */}
      {preview && (
        <div
          className={cn(
            'qe-preview invisible absolute inset-0 z-[2] flex flex-col overflow-hidden bg-card p-[18px] opacity-0',
            'transition-[opacity,visibility] duration-300',
            'group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100',
          )}
        >
          {preview}
        </div>
      )}
    </article>
  );
}

/** Their .tp-topbar — traffic lights and a right-aligned title. */
function PreviewBar({ crumb, title }: { crumb: string; title: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5 border-b border-border pb-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
      <span className="flex gap-[5px]">
        <i className="h-2 w-2 rounded-full bg-[#ff6b6b]" />
        <i className="h-2 w-2 rounded-full bg-[#f7c94b]" />
        <i className="h-2 w-2 rounded-full bg-[var(--brand-cyan)]" />
      </span>
      {crumb}
      <span className="ml-auto font-medium text-foreground">{title}</span>
    </div>
  );
}

function StatTile({ v, lbl, sub, tone }: { v: string; lbl: string; sub?: string; tone?: 'accent' | 'warn' }) {
  return (
    <div className="flex min-w-0 flex-col gap-px rounded-[2px] border border-border bg-background/40 px-2 py-1.5">
      <span
        className={cn(
          'font-light leading-none tracking-[-0.02em] tabular-nums',
          tone === 'accent' ? 'text-[18px] text-[var(--brand-cyan)]' : 'text-[22px] text-foreground',
          tone === 'warn' && 'text-[var(--brand-gold)]',
        )}
      >
        {v}
      </span>
      <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-foreground">{lbl}</span>
      {sub && <span className="font-mono text-[9px] text-muted-foreground/70">{sub}</span>}
    </div>
  );
}

// ── viz 1: the ranked bar wave ───────────────────────────────────────────────

const BAR_COUNT = 24;

function ConvictionBars({ picks }: { picks: Pick[] }) {
  const top = picks.slice(0, BAR_COUNT);
  if (top.length < 2) {
    return (
      <div className="mt-6 flex h-20 items-end">
        <div className="h-px w-full bg-border" />
      </div>
    );
  }
  const max = Math.max(...top.map((p) => p.convictionScore)) || 1;

  return (
    <div className="mt-6 flex h-20 items-end gap-1">
      {top.map((p, i) => (
        <span
          key={p.ideaId}
          title={`${p.symbol} · ${p.convictionScore}`}
          className={cn(
            'flex-1 rounded-[1px] bg-[var(--brand-cyan)] opacity-20 transition-all duration-[400ms]',
            // the wave: two overlapping nth selectors on a staggered delay
            'group-hover:[&:nth-child(odd)]:opacity-60 group-hover:[&:nth-child(3n)]:opacity-100',
            'motion-reduce:transition-none',
          )}
          style={{ height: `${(p.convictionScore / max) * 100}%`, transitionDelay: `${i * 30}ms` }}
        />
      ))}
    </div>
  );
}

// ── viz 2: the real layer-firing matrix ──────────────────────────────────────

const HEAT_COLS = 12;

/**
 * The layer-firing matrix, now built on the kit's Matrix rather than the
 * continuous alpha ramp this file shipped first. Their `.fv3-cell` quantises to
 * three levels for a reason: two similar alphas are not comparable by eye, three
 * levels are countable at a glance, and the exact value belongs in the tooltip
 * where it can be read. See templates/charts.tsx.
 */
function LayerHeatmap({ picks }: { picks: Pick[] }) {
  const cols = picks.slice(0, HEAT_COLS);
  // Only layers that actually fire on this book get a row. Rendering 16 rows
  // when 7 are permanently blank draws a grid whose emptiness means nothing.
  const live = CONVICTION_LAYERS.filter((l) =>
    cols.some((p) => p.layers.some((x) => x.kind === l.kind && x.points !== 0)),
  );
  if (!cols.length || !live.length) {
    return <div className="mt-6 h-20 rounded-[1px] border border-dashed border-border" />;
  }

  const rows: MatrixRow[] = live.map((l) => ({
    label: l.short,
    cells: cols.map((p) => {
      const hit = p.layers.find((x) => x.kind === l.kind);
      const pts = hit?.points ?? 0;
      return {
        value: pts,
        tip: pts === 0
          ? `${p.symbol} · ${l.label} — silent`
          : `${p.symbol} · ${l.label} ${pts > 0 ? '+' : ''}${pts}`,
      };
    }),
  }));

  return (
    <div className="mt-6">
      <Matrix rows={rows} labelWidth={40} axis={cols.map((p) => p.symbol)} />
      <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[9px] text-muted-foreground/60">
        <span>{cols.length} ideas × {live.length} live layers</span>
        <IntensityLegend labels={['weak', 'mid', 'strong']} />
      </div>
    </div>
  );
}

// ── the section ──────────────────────────────────────────────────────────────

export function ToolCards() {
  const { data, isError } = useConvictions();
  const picks = data?.picks ?? [];
  const scanned = data?.totalCandidatesScanned ?? 0;

  const sTier = picks.filter((p) => p.convictionBand === 'S').length;
  const shorts = picks.filter((p) => p.direction === 'short').length;
  const withContract = picks.filter((p) => p.optionDte != null);
  const medDte = withContract.length
    ? [...withContract].map((p) => p.optionDte!).sort((a, b) => a - b)[Math.floor(withContract.length / 2)]
    : null;

  return (
    <div className="px-6 py-20 md:py-28 max-w-7xl mx-auto">
      <SchematicStyles />
      <KitStyles />

      <div className="mb-12 grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end">
        <div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--brand-cyan)]">
            The pipeline
          </span>
          <h2 className="mt-3 text-3xl font-light leading-[1.06] tracking-[-0.03em] text-foreground sm:text-4xl lg:text-[3.25rem]">
            Three decisions,
            <br />
            made in order.
          </h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground md:pb-2">
          A candidate has to survive a scan, earn a score, and then still produce a contract worth
          buying. Each stage throws work away — which is the point. Every card opens onto the stage
          running against today&rsquo;s book.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ToolCard
          label="Scan · Universe"
          badge="CONTINUOUS"
          title="Everything, then almost nothing"
          body={
            scanned
              ? `${scanned.toLocaleString()} candidates were scanned for this book. ${picks.length} carried enough evidence to be published — the rest were dropped without a signal being written.`
              : 'Every listed name in the universe is scanned, scored, and then mostly discarded. What survives is published; what does not leaves no signal behind.'
          }
          viz={<div className="mt-6 text-[var(--brand-cyan)]"><ScanSchematic /></div>}
          preview={
            <>
              <PreviewBar crumb="Scanner" title="Today" />
              <div className="grid grid-cols-4 gap-1.5">
                <StatTile v={scanned ? scanned.toLocaleString() : '—'} lbl="scanned" />
                <StatTile v={picks.length ? String(picks.length) : '—'} lbl="published" />
                <StatTile v={String(sTier)} lbl="S band" tone="accent" />
                <StatTile v={String(shorts)} lbl="short" sub={`${picks.length - shorts} long`} />
              </div>
              <p className="mt-3 font-mono text-[9px] leading-relaxed text-muted-foreground">
                {scanned && picks.length
                  ? `${((picks.length / scanned) * 100).toFixed(1)}% survival. Regime: ${data?.marketContext?.regime ?? 'unknown'}.`
                  : 'Live counts appear when the scanner has run.'}
              </p>
              <div className="mt-auto">
                <ConvictionBars picks={picks} />
              </div>
            </>
          }
        />

        <ToolCard
          label="Score · 16 layers"
          badge="WEIGHTED"
          title="Confluence, and what argues back"
          body="Every surviving idea is scored across sixteen independent layers. A layer can subtract — a stale entry or a hostile regime pulls the score down, and the signal shows it rather than hiding it."
          viz={
            <div className="mt-6 text-[var(--brand-cyan)]">
              <ConvergenceSchematic left={['CHART', 'TAPE', 'GAMMA']} right={['SECTOR', 'MACRO', 'EVENTS']} />
            </div>
          }
          preview={
            <>
              <PreviewBar crumb="Conviction" title="Layer matrix" />
              <LayerHeatmap picks={picks} />
              <p className="mt-auto pt-3 font-mono text-[9px] leading-relaxed text-muted-foreground">
                Columns are today&rsquo;s top ideas in rank order; rows are the layers that fired on
                at least one. Blank means the layer had nothing to say, not that it agreed.
              </p>
            </>
          }
        />

        <ToolCard
          label="Select · Contract"
          badge="LIQUIDITY-GATED"
          title="A thesis is not a trade"
          body="A correct direction still loses on the wrong contract. Strike and expiry are chosen against spread, open interest and days remaining — and an idea with no contract worth buying is published without one."
          viz={<div className="mt-6 text-[var(--brand-cyan)]"><ContractSchematic /></div>}
          preview={
            <>
              <PreviewBar crumb="Selection" title="Chain filter" />
              <div className="grid grid-cols-3 gap-1.5">
                <StatTile v={String(withContract.length)} lbl="contracts" sub={`of ${picks.length}`} />
                <StatTile v={medDte != null ? `${medDte}d` : '—'} lbl="median DTE" tone="accent" />
                <StatTile
                  v={picks.length ? `${Math.round((withContract.length / picks.length) * 100)}%` : '—'}
                  lbl="coverage"
                />
              </div>
              <div className="mt-3 flex-1 overflow-hidden">
                {picks.slice(0, 7).map((p) => (
                  <div
                    key={p.ideaId}
                    className="grid grid-cols-[42px_1fr_58px_36px] items-center gap-1.5 border-b border-border py-[5px] font-mono text-[10px] text-foreground"
                  >
                    <span className="font-medium">{p.symbol}</span>
                    <span className="truncate text-[9px] text-muted-foreground">
                      {p.strikePrice ? `${p.optionType === 'put' ? 'P' : 'C'} ${p.strikePrice}` : 'no contract'}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {p.optionDte != null ? `${p.optionDte}d` : '—'}
                    </span>
                    <span className="text-right font-medium text-[var(--brand-cyan)] tabular-nums">
                      {p.convictionScore}
                    </span>
                  </div>
                ))}
                {!picks.length && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {isError ? 'Feed unavailable.' : 'No published ideas right now.'}
                  </span>
                )}
              </div>
            </>
          }
        />
      </div>
    </div>
  );
}
