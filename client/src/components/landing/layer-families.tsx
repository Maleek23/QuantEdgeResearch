/**
 * LAYER FAMILIES — the 16 conviction layers, grouped into the four questions
 * they actually answer.
 *
 * Replaces a 4×4 grid of 16 identical chips. That grid failed for a structural
 * reason, not a stylistic one: when every item is the same size, nothing has a
 * shape, there is no order to read in, and sixteen six-word fragments ask the
 * reader to do the grouping the page should have done for them. Styling the
 * chips would not have fixed it.
 *
 * The layout follows the reference site's multi-item pattern:
 *   • asymmetric header — headline left, the qualifying paragraph right, rather
 *     than a centred block that gives both equal weight
 *   • four TALL cards instead of sixteen small ones, each with room for a real
 *     sentence
 *   • ordinal numbering (01 / 04), because these genuinely read in sequence —
 *     the chart first, then who is positioned, then the tape, then the calendar
 *   • a tag pill and a footer strip, so a card has a top, a middle and a bottom
 *     instead of being one undifferentiated block
 *
 * The member layers still appear — nothing was hidden to make the section
 * tidier — they just sit inside the family that explains why they exist.
 *
 * Motion: one staggered reveal on entry, Tier 3 under viz/MOTION.md (marketing
 * surface). Off entirely under prefers-reduced-motion, where the cards simply
 * arrive.
 */
import { motion, useReducedMotion } from 'framer-motion';
import {
  CONVICTION_FAMILIES,
  CONVICTION_LAYER_COUNT,
  layersInFamily,
} from '@shared/conviction-layers';
import { cn } from '@/lib/utils';

/** One accent per family. Ice Signal leads; the rest are the app's own tokens. */
const ACCENT: Record<string, string> = {
  chart: 'var(--brand-cyan)',
  positioning: 'var(--brand-gold)',
  tape: 'var(--trade-bullish)',
  calendar: 'var(--brand-teal)',
};

export function LayerFamilies() {
  const reduce = useReducedMotion();

  return (
    <div className="px-6 py-20 md:py-28 max-w-7xl mx-auto">
      {/* Asymmetric header — the claim carries the width, the caveat sits beside it. */}
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end mb-12">
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-[var(--brand-cyan)]">
            Convergence
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl lg:text-[3.25rem] font-light leading-[1.06] tracking-[-0.03em] text-foreground">
            {CONVICTION_LAYER_COUNT} layers,
            <br />
            four questions.
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground max-w-md md:pb-2">
          Every setup is scored across {CONVICTION_LAYER_COUNT} independent layers. Not every
          layer fires on every signal — several are conditional — and a signal shows which
          ones did, including the ones that argued against it.
        </p>
      </div>

      <div className="grid gap-0 border-t border-border md:grid-cols-2 lg:grid-cols-4 [&>*+*]:lg:border-l [&>*]:border-border">
        {CONVICTION_FAMILIES.map((fam, i) => {
          const layers = layersInFamily(fam.id);
          const accent = ACCENT[fam.id] ?? 'var(--brand-cyan)';
          return (
            <motion.div
              key={fam.id}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="group relative flex flex-col bg-card p-5 transition-colors hover:bg-foreground/[0.02]"
            >
              {/* top rule that colours in on hover — the only decorative motion here */}
              <span
                aria-hidden
                className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
                style={{ background: accent }}
              />

              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60">
                  {String(i + 1).padStart(2, '0')} / {String(CONVICTION_FAMILIES.length).padStart(2, '0')}
                </span>
                <span
                  className="rounded border px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-[0.12em]"
                  style={{ color: accent, borderColor: `color-mix(in srgb, ${accent} 40%, transparent)` }}
                >
                  {fam.tag}
                </span>
              </div>

              <h3 className="mt-6 text-lg font-semibold tracking-tight text-foreground">
                {fam.label}
              </h3>
              <p className="mt-1 text-[13px] font-mono text-muted-foreground/70">{fam.question}</p>

              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{fam.blurb}</p>

              {/* The layers themselves — kept, not hidden, but subordinate to the family. */}
              <div className="mt-5 flex-1 space-y-1.5 border-t border-border/50 pt-4">
                {layers.map((l) => (
                  <div key={l.kind} className="flex items-baseline gap-2">
                    <span
                      className="w-8 shrink-0 text-[10px] font-mono font-bold tabular-nums"
                      style={{ color: accent }}
                    >
                      {l.short}
                    </span>
                    <span className="text-[12px] text-foreground/80">{l.label}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
                  {layers.length} {layers.length === 1 ? 'layer' : 'layers'}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-mono tabular-nums text-muted-foreground/60',
                    'transition-colors group-hover:text-[color:var(--brand-cyan)]',
                  )}
                >
                  {Math.round((layers.length / CONVICTION_LAYER_COUNT) * 100)}% of the score
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
