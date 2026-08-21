/**
 * LAYOUT FAMILIES — the page had one shape and used it seven times.
 *
 * Every feature on the landing page was the same two-column block with the image
 * flipped left or right. Six of seven sections differed only by a `reverse` flag.
 * That is why it read as text and overlays: there was no compositional variety to
 * read, only alternating sides.
 *
 * These are five genuinely different shapes. Each has a job it does better than
 * the others, and the page alternates families rather than sides:
 *
 *   Ledger     — full-bleed horizontal strip. For enumerable things (the layers).
 *   Statement  — single column, oversized type, no visual. For claims that should
 *                be read rather than illustrated.
 *   Exhibit    — one large live surface, text demoted to a caption beneath it.
 *   Mosaic     — an irregular grid. For a set of peers with no ranking.
 *   Ribbon     — narrow full-width band. A rhythm break between heavy sections.
 */
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE, DUR } from '@/lib/motion';

/** Shared eyebrow. Small, tracked, never competing with the headline. */
function Eyebrow({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span className="ui-eyebrow text-[10px]" style={{ color: tone ?? 'var(--brand-cyan)' }}>
      {children}
    </span>
  );
}

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: DUR.slow, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * LEDGER — a full-bleed strip that runs past the container edges. Used for the
 * layer stack: sixteen items are a LIST, and a list wants a row, not a card grid
 * pretending the items are independent.
 */
export function Ledger({
  eyebrow, headline, note, items,
}: {
  eyebrow: string; headline: string; note?: string;
  items: { id: string; name: string; blurb: string }[];
}) {
  return (
    <section className="border-y border-border/40 bg-[var(--card)]/40 py-14">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">{headline}</h2>
          {note && <p className="ui-prose mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{note}</p>}
        </Reveal>
      </div>

      {/* Runs edge to edge and scrolls horizontally on narrow screens — a strip,
          not a grid that reflows into a stack of identical cards. */}
      <div className="mt-8 overflow-x-auto">
        <div className="mx-auto flex min-w-max gap-px bg-border/40 px-6">
          {items.map((it, i) => (
            <Reveal key={it.id} delay={Math.min(i * 0.02, 0.2)}>
              <div className="w-[172px] shrink-0 bg-[var(--background)] px-4 py-4">
                <div className="ui-data text-[11px] font-bold text-[var(--brand-cyan)]">{it.id}</div>
                <div className="mt-1 text-[13px] font-semibold text-foreground">{it.name}</div>
                <div className="ui-prose mt-1.5 text-[11px] leading-snug text-muted-foreground">{it.blurb}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * STATEMENT — one column, oversized type, deliberately no visual. For the claims
 * that carry the product's argument: putting a screenshot beside them would imply
 * the sentence needs illustrating, and it does not.
 */
export function Statement({
  eyebrow, lines, footnote, tone,
}: { eyebrow: string; lines: string[]; footnote?: string; tone?: string }) {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-4xl px-6">
        <Reveal>
          <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
        </Reveal>
        <div className="mt-5 space-y-2">
          {lines.map((l, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <p
                className="text-[28px] sm:text-[40px] font-bold leading-[1.12] tracking-tight"
                style={{ color: i === 0 ? 'var(--foreground)' : 'color-mix(in srgb, var(--foreground) 55%, transparent)' }}
              >
                {l}
              </p>
            </Reveal>
          ))}
        </div>
        {footnote && (
          <Reveal delay={0.2}>
            <p className="ui-prose mt-8 max-w-xl text-[14px] leading-relaxed text-muted-foreground">{footnote}</p>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/**
 * EXHIBIT — the live surface is the subject and gets the width; the words are a
 * caption underneath it. The inverse of the two-column block, where the text
 * competed with the image for the same visual weight and neither won.
 */
export function Exhibit({
  eyebrow, headline, body, children, bullets,
}: { eyebrow: string; headline: string; body: string; children: ReactNode; bullets?: string[] }) {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="max-w-2xl">
              <Eyebrow>{eyebrow}</Eyebrow>
              <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">{headline}</h2>
            </div>
            {bullets && (
              <ul className="max-w-xs space-y-1">
                {bullets.map((b) => (
                  <li key={b} className="ui-prose text-[12px] leading-snug text-muted-foreground">{b}</li>
                ))}
              </ul>
            )}
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-8">{children}</div>
        </Reveal>

        <Reveal delay={0.15}>
          <p className="ui-prose mt-4 max-w-3xl text-[14px] leading-relaxed text-muted-foreground">{body}</p>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * MOSAIC — an irregular grid for a set of peers. Cells are deliberately unequal
 * so the eye has somewhere to start; a uniform 2x2 reads as a form, not a layout.
 */
export function Mosaic({
  eyebrow, headline, cells,
}: { eyebrow: string; headline: string; cells: { title: string; body: string; wide?: boolean }[] }) {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-2 max-w-2xl text-3xl sm:text-4xl font-bold tracking-tight text-foreground">{headline}</h2>
        </Reveal>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cells.map((c, i) => (
            <Reveal key={c.title} delay={Math.min(i * 0.05, 0.25)}>
              <div
                className={`h-full rounded-xl border border-card-border bg-card p-5 ${c.wide ? 'lg:col-span-2' : ''}`}
              >
                <div className="text-[15px] font-semibold text-foreground">{c.title}</div>
                <p className="ui-prose mt-2 text-[13px] leading-relaxed text-muted-foreground">{c.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** RIBBON — a narrow band that breaks the rhythm between two heavy sections. */
export function Ribbon({ text, tone }: { text: string; tone?: string }) {
  return (
    <section className="border-y border-border/40 py-6" style={{ background: `color-mix(in srgb, ${tone ?? 'var(--brand-cyan)'} 6%, transparent)` }}>
      <div className="mx-auto max-w-5xl px-6">
        <p className="ui-prose text-center text-[15px] leading-relaxed text-foreground/85">{text}</p>
      </div>
    </section>
  );
}
