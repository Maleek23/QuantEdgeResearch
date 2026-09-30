/**
 * LUX PAGE — the standalone-page template: the journal's page language
 * (eyebrow pill → display title → one-line purpose → actions, then panels,
 * KPI tiles, tags and tables) as reusable pieces, so /slate, /radar, /alerts,
 * /settings, /how-to and /r/:symbol read as one product with the Journal.
 *
 *   <LuxPage>
 *     <LuxPageHeader section="Slate" context="Tue · Sep 29" title="Daily slate"
 *       purpose="Measured setups for the next session." actions={<LuxButton…/>}>
 *       {optional filter / tab row}
 *     </LuxPageHeader>
 *     <LuxKpiGrid><LuxKpi label="SPY" value="$571.20" sub="▲ 0.42%" /></LuxKpiGrid>
 *     <LuxPanel title="Setups" meta={<LuxTag>n=12</LuxTag>}>…</LuxPanel>
 *   </LuxPage>
 *
 * Portions of the look adapted from the Trade Journal web app (apps/web/src/
 * components/ui/card.tsx + the .card-sheen style, components/filter-bar.tsx
 * page title row, dashboard metric cards), MIT License, Copyright (c) 2026
 * LuxAlgo Global, LLC — see ./LICENSE-luxalgo.txt. Colours, type and copy are
 * QuantEdge's (docs/DESIGN_SYSTEM.md). Styles: ./lux.css § page template.
 *
 * Colour is never the only carrier: KPI tones and tags always print their
 * meaning as text (sign, ▲/▼, WIN/LOSS, a word) — the tint only reinforces.
 */
import { InfoSheet } from '@/components/ui/qe-phone';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { HelpHint } from './lux-tooltip';

export type LuxTone = 'gain' | 'loss' | 'caution' | 'accent' | 'marker' | 'mute' | null | undefined;

/* ── page container ── */
export function LuxPage({
  width = 'default', className, children, ...rest
}: HTMLAttributes<HTMLDivElement> & {
  /** narrow = reading pages (how-to), default = 1400px, wide = 1600px, full = no cap */
  width?: 'narrow' | 'default' | 'wide' | 'full';
}) {
  return (
    <div className={cn('lx-page', className)} data-width={width} {...rest}>
      {children}
    </div>
  );
}

/* ── page header ── */
export function LuxPageHeader({
  section, context, title, purpose, actions, children, className, titleId,
}: {
  /** the destination name in the eyebrow pill, e.g. "Radar" */
  section?: ReactNode;
  /** muted text after the pill: date, scope, basis */
  context?: ReactNode;
  /** the page's one <h1> */
  title: ReactNode;
  /** one line: what this page is for (or live status) */
  purpose?: ReactNode;
  /** right-aligned buttons */
  actions?: ReactNode;
  /** a row below the title: range / filters / tabs */
  children?: ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <header className={cn('lx-page-head', className)}>
      <div className="lx-page-head-row">
        <div className="lx-page-head-main">
          {(section || context) && (
            <div className="lx-eyebrow">
              {section && <span className="lx-eyebrow-pill">{section}</span>}
              {context && <span className="lx-eyebrow-ctx">{context}</span>}
            </div>
          )}
          <div className="lx-page-title-row">
            <h1 className="lx-page-title" id={titleId}>{title}</h1>
            {/* phones: the purpose line is one tap away (qe-phone InfoSheet) */}
            {purpose && <InfoSheet className="qp-phone-only" title={typeof title === 'string' ? title : 'This page'} what={purpose} label="About this page" />}
          </div>
          {purpose && <p className="lx-page-purpose qp-desk-only">{purpose}</p>}
        </div>
        {actions && <div className="lx-page-actions">{actions}</div>}
      </div>
      {children && <div className="lx-page-controls">{children}</div>}
    </header>
  );
}

/* ── panel (the journal card) ── */
export const LuxPanel = forwardRef<HTMLElement, Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title?: ReactNode;
  /** tiny accent caption before the title, e.g. "01" or "LIVE" */
  num?: ReactNode;
  /** muted line under the title */
  sub?: ReactNode;
  /** right side of the header row (tags, buttons) */
  meta?: ReactNode;
  /** help text shown by a "?" beside the title */
  help?: ReactNode;
  /** drop the body padding (full-bleed tables / lists) */
  flush?: boolean;
  as?: 'section' | 'div' | 'article';
  headingLevel?: 2 | 3;
}>(function LuxPanel({ title, num, sub, meta, help, flush, as: Tag = 'section', headingLevel = 2, className, children, ...rest }, ref) {
  const H = headingLevel === 3 ? 'h3' : 'h2';
  return (
    <Tag
      ref={ref as never}
      className={cn('lx-panel', flush && 'lx-panel-flush', className)}
      aria-label={typeof title === 'string' ? title : undefined}
      {...rest}
    >
      {(title || meta) && (
        <div className="lx-panel-h">
          <div className="lx-panel-h-main">
            <div className="lx-panel-h-line">
              {num && <span className="lx-panel-num">{num}</span>}
              {title && <H className="lx-panel-t">{title}</H>}
              {help && <HelpHint heading={typeof title === 'string' ? title : 'this panel'}>{help}</HelpHint>}
              {sub && <InfoSheet className="qp-phone-only lx-panel-info" title={typeof title === 'string' ? title : 'About this panel'} what={sub} label={typeof title === 'string' ? `About ${title}` : 'About this panel'} />}
            </div>
            {sub && <p className="lx-panel-sub qp-desk-only">{sub}</p>}
          </div>
          {meta && <div className="lx-panel-meta">{meta}</div>}
        </div>
      )}
      <div className="lx-panel-body">{children}</div>
    </Tag>
  );
});

/* ── KPI tiles ── */
export function LuxKpiGrid({ children, className, cols }: { children: ReactNode; className?: string; /** max columns on wide screens (default 6) */ cols?: 2 | 3 | 4 | 5 | 6 }) {
  return <div className={cn('lx-kpis', className)} data-cols={cols ?? 6}>{children}</div>;
}

export function LuxKpi({
  label, value, sub, tone, help, className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** tints the value; the value must still carry its meaning as text */
  tone?: LuxTone;
  help?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('lx-kpi', className)}>
      <div className="lx-kpi-l">
        <span>{label}</span>
        {help && <HelpHint heading={typeof label === 'string' ? label : 'this figure'}>{help}</HelpHint>}
      </div>
      <div className="lx-kpi-v" data-tone={tone ?? undefined}>{value}</div>
      {sub != null && <div className="lx-kpi-s">{sub}</div>}
    </div>
  );
}

/* ── tags (mono chips: side, grade, outcome, counts) ── */
export function LuxTag({ tone, className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: LuxTone }) {
  return <span className={cn('lx-tag', className)} data-tone={tone ?? undefined} {...rest}>{children}</span>;
}

/* ── footnote under a page ── */
export function LuxFootnote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('lx-footnote', className)}>{children}</p>;
}

/* ── shadcn-Card-compatible panel parts (same props) — lets a legacy page
   swap `@/components/ui/card` for the template without restructuring. ── */
export const LuxCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function LuxCard({ className, ...rest }, ref) {
  return <div ref={ref} className={cn('lx-panel lx-panel-compose', className)} {...rest} />;
});
export function LuxCardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('lx-panel-h lx-panel-h-stack', className)} {...rest} />;
}
export function LuxCardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('lx-panel-t', className)} {...rest} />;
}
export function LuxCardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('lx-panel-sub', className)} {...rest} />;
}
export function LuxCardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('lx-panel-body', className)} {...rest} />;
}
