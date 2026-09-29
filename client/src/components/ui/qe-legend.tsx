/**
 * QELegend — the shared, reachable legend for bands, grades and jargon
 * (SR 11-7 F7.2 / T4).
 *
 * Before this, the only score-band/grade key lived in the orphaned
 * trade-desk/todays-picks.tsx dialog, and it documented stale client cutoffs
 * (S≥30/A≥22/B≥15). Rule from T4: every surface that renders a band, grade,
 * glyph or regime abbreviation gets a one-click legend reachable from the
 * surface itself — a small "?" button that opens this dialog.
 *
 *   <QELegendButton title="Radar legend" sections={[...]} showBands />
 *
 * Swatches follow the kit's IntensityLegend (templates/kit.tsx): colour-mixed
 * chips, mono uppercase captions.
 */
import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { bandColor } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';

/**
 * Conviction band floors on the 13-layer conviction score.
 * Mirror of server/convictions-engine.ts band cutoffs (BAND_CUTOFFS = S 25 / A 19 / B 13).
 * Replace with the shared/conviction-bands.ts import once that module lands —
 * the server value is the only source of truth; do not tune these here.
 */
export const LEGEND_BAND_CUTOFFS = { S: 25, A: 19, B: 13 } as const;

const BAND_ROWS: { band: 'S' | 'A' | 'B' | 'C'; rule: string; meaning: string }[] = [
  { band: 'S', rule: `score ≥ ${LEGEND_BAND_CUTOFFS.S}`, meaning: 'Elite — meant to be rare (roughly the top 5% at fit time).' },
  { band: 'A', rule: `score ≥ ${LEGEND_BAND_CUTOFFS.A}`, meaning: 'Strong — most layers agree.' },
  { band: 'B', rule: `score ≥ ${LEGEND_BAND_CUTOFFS.B}`, meaning: 'Solid but mixed evidence.' },
  { band: 'C', rule: `score < ${LEGEND_BAND_CUTOFFS.B}`, meaning: 'Weak — shown for completeness, not a call.' },
];

export interface LegendEntry {
  term: ReactNode;
  def: ReactNode;
}
export interface LegendSection {
  heading: string;
  entries: LegendEntry[];
}

/** The conviction band key — S/A/B/C with the server cutoffs. */
export function BandLegend() {
  return (
    <div className="space-y-1.5">
      {BAND_ROWS.map((r) => {
        const c = bandColor(r.band);
        return (
          <div key={r.band} className="flex items-start gap-2.5">
            <span
              className="mt-px inline-flex h-5 w-6 shrink-0 items-center justify-center rounded-[3px] border font-mono text-[10px] font-bold"
              style={{
                color: c,
                borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
                background: `color-mix(in srgb, ${c} 12%, transparent)`,
              }}
            >
              {r.band}
            </span>
            <span className="w-20 shrink-0 pt-0.5 font-mono text-[10px] tabular-nums text-foreground/85">{r.rule}</span>
            <span className="pt-0.5 text-[11px] leading-snug text-muted-foreground">{r.meaning}</span>
          </div>
        );
      })}
      <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">
        The band is the one authoritative quality label: it is cut from the same conviction score the lists sort on.
        Cutoffs are the server&apos;s, not a client copy.
      </p>
    </div>
  );
}

export function QELegendBody({ sections = [], showBands = false }: { sections?: LegendSection[]; showBands?: boolean }) {
  return (
    <div className="space-y-4">
      {showBands && (
        <section>
          <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--brand-cyan)]">Conviction bands</h3>
          <BandLegend />
        </section>
      )}
      {sections.map((s) => (
        <section key={s.heading}>
          <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--brand-cyan)]">{s.heading}</h3>
          <dl className="space-y-1.5">
            {s.entries.map((e, i) => (
              <div key={i} className="grid grid-cols-[minmax(5.5rem,auto)_1fr] gap-x-3">
                <dt className="font-mono text-[10px] font-bold uppercase tracking-wider text-foreground/85">{e.term}</dt>
                <dd className="text-[11px] leading-snug text-muted-foreground">{e.def}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/** Small "?" trigger + dialog. Place it next to the band/grade it explains. */
export function QELegendButton({
  title = 'Legend',
  description,
  sections,
  showBands = false,
  className,
  label,
}: {
  title?: string;
  description?: string;
  sections?: LegendSection[];
  showBands?: boolean;
  className?: string;
  /** Optional visible text next to the "?" (e.g. "Legend"). */
  label?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Open ${title.toLowerCase()}`}
          title={title}
          className={cn(
            'inline-flex h-6 min-w-6 cursor-pointer items-center justify-center gap-1 rounded-md border border-border/50 px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-[var(--brand-cyan)]/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-cyan)]/70',
            className,
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          {label && <span>{label}</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm uppercase tracking-wider">{title}</DialogTitle>
          {description && <DialogDescription className="text-xs">{description}</DialogDescription>}
        </DialogHeader>
        <QELegendBody sections={sections} showBands={showBands} />
      </DialogContent>
    </Dialog>
  );
}
