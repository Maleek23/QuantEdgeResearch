/**
 * PHONE DENSITY primitives (operator 2026-09-30: "for mobile — is the info on
 * screen / the texts messing up the readability?"). A phone screen shows the
 * few things a trader needs, big; detail is one tap away. Desktop is
 * unchanged: every primitive here renders its desktop form at ≥ 768px.
 *
 *   usePhone()        (max-width: 767px), live — the same breakpoint as the CSS
 *   compactAge()      "45s" / "2m" / "1.5h" / "3d" — the phone freshness stamp
 *   <FreshStamp>      ONE stamp per section: colour dot (grey → amber → red by
 *                     age) + compact age; the full source text lives in the ⓘ sheet
 *   <InfoSheet>       ⓘ button → bottom sheet (what it shows, units, source, age)
 *   <PhoneNote>       method notes / hints: inline on desktop, ⓘ-expand on phones
 *   <Clamp>           narrative paragraph: 2 lines + "More" on phones
 *
 * Styles: styles/phone-density.css (all phone rules under max-width:767px).
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { QEDrawer } from './qe-drawer';
import { cn } from '@/lib/utils';

const PHONE_Q = '(max-width: 767px)';

function subscribe(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(PHONE_Q);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}
const snap = () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE_Q).matches);

/** True below 768px (phones). Synchronous on first render — no desktop flash on a phone. */
export function usePhone(): boolean {
  return useSyncExternalStore(subscribe, snap, () => false);
}

/** Compact age for a phone stamp: "45s", "2m", "1.5h", "3d". */
export function compactAge(asOf: string | number | null | undefined, now = Date.now()): string | null {
  if (asOf == null || asOf === '') return null;
  const t = typeof asOf === 'number' ? asOf : Date.parse(asOf);
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, (now - t) / 1000);
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${(s / 3600).toFixed(1).replace(/\.0$/, '')}h`;
  return `${Math.round(s / 86400)}d`;
}

export type AgeTone = 'fresh' | 'aging' | 'stale' | 'none';
/** Default thresholds: grey ≤ 5m, amber ≤ 30m, red beyond (intraday market data). */
export const AGE_AMBER_MS = 5 * 60_000;
export const AGE_RED_MS = 30 * 60_000;
export function ageTone(asOf: string | number | null | undefined, now = Date.now(), amber = AGE_AMBER_MS, red = AGE_RED_MS): AgeTone {
  if (asOf == null || asOf === '') return 'none';
  const t = typeof asOf === 'number' ? asOf : Date.parse(asOf);
  if (!Number.isFinite(t)) return 'none';
  const ms = now - t;
  return ms > red ? 'stale' : ms > amber ? 'aging' : 'fresh';
}

/**
 * One compact freshness stamp: ● 2m. `warn` (a degraded feed) is at least amber.
 * `label` replaces the age when there is no timestamp ("—", "static", "per row").
 */
export function FreshStamp({ asOf, now, label, warn, className }: {
  asOf?: string | number | null; now?: number; label?: string; warn?: boolean; className?: string;
}) {
  const age = compactAge(asOf, now);
  let tone = ageTone(asOf, now);
  if (warn && (tone === 'fresh' || tone === 'none')) tone = 'aging';
  const text = age ?? label ?? '—';
  const spoken = age ? `data ${age} old${tone === 'stale' ? ', stale' : tone === 'aging' ? ', aging' : ''}${warn ? ', degraded' : ''}` : `${text}${warn ? ', degraded' : ''}`;
  return (
    <span className={cn('qp-stamp', `qp-${tone}`, className)} role="note" aria-label={spoken} title={spoken}>
      <i aria-hidden className="qp-dot" />{text}
    </span>
  );
}

/**
 * A source string as a reader sees it: endpoint paths ("/api/…", "GET …") are
 * plumbing, not provenance — they move to the ⓘ "Feed" line. Returns the
 * readable part ("convictions engine") and the stripped detail, if any.
 */
export function splitSource(src: string | undefined): { label: string; detail?: string } {
  if (!src) return { label: '' };
  const parts = src.split(/\s+·\s+/);
  const keep = parts.filter((p) => !/(^|\s)(GET\s+)?\/api\//.test(p));
  const drop = parts.filter((p) => !keep.includes(p));
  return { label: (keep.join(' · ') || src.replace(/(GET\s+)?\/api\/\S+/g, '').trim() || 'feed'), detail: drop.length ? drop.join(' · ') : undefined };
}

/**
 * ⓘ → the section's description, units, source and full age (and the feed
 * endpoint, for the curious). Phone: a bottom sheet. Desktop: a popover
 * anchored to the ⓘ — one tap either way, nothing printed by default.
 */
export function InfoSheet({ title, what, units, source, age, note, extra, className, label, feed }: {
  title: string; what?: ReactNode; units?: string; source?: string; age?: string; note?: string;
  extra?: ReactNode; className?: string; label?: string;
  /** endpoint / backing detail — shown last, small */
  feed?: string;
}) {
  const [open, setOpen] = useState(false);
  const phone = usePhone();
  const { label: srcLabel, detail } = splitSource(source);
  const feedLine = [detail, feed].filter(Boolean).join(' · ') || undefined;
  const body = (
    <>
      <dl className="qp-sheet-dl">
        {what && (<><dt>What it shows</dt><dd>{what}</dd></>)}
        {units && (<><dt>Units</dt><dd>{units}</dd></>)}
        {source && (<><dt>Source</dt><dd>{srcLabel}</dd></>)}
        {age && (<><dt>Age</dt><dd>{age} <span className="qp-sheet-mute">(time since the newest datum shown, not since the last fetch)</span></dd></>)}
        {note && (<><dt>Status</dt><dd>{note}</dd></>)}
        {feedLine && (<><dt>Feed</dt><dd className="qp-sheet-feed">{feedLine}</dd></>)}
      </dl>
      {extra}
    </>
  );
  const btn = (
    <button type="button" className={cn('qp-info', className)} onClick={() => setOpen(true)}
      aria-label={label ?? `About ${title}`} title={label ?? `About ${title} — what it shows, source and age`} aria-haspopup="dialog">
      <Info aria-hidden size={16} />
    </button>
  );
  if (!phone) {
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>{btn}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="qp-pop" side="bottom" align="end" sideOffset={6} collisionPadding={12} aria-label={title}>
            <div className="qp-pop-title">{title}</div>
            {body}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
  return (
    <>
      {btn}
      <QEDrawer open={open} onClose={() => setOpen(false)} title={title} side="bottom" className="qp-sheet">
        {body}
      </QEDrawer>
    </>
  );
}

/**
 * A method note / hint / caption that is secondary on a phone. Desktop: the
 * children inline, as before. Phone: a small ⓘ that expands the note inline.
 * `as="div"` for block notes (default), "span" inside a line of text.
 */
export function PhoneNote({ children, label = 'Details', className, as = 'div' }: {
  children: ReactNode; label?: string; className?: string; as?: 'div' | 'span';
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const Tag = as;
  return (
    <Tag className={cn('qp-note', open && 'open', className)} data-phone-note="">
      <button type="button" className="qp-note-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        title={open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
        <Info aria-hidden size={14} /><span>{open ? 'Hide' : label}</span>
      </button>
      <Tag id={id} className="qp-note-body">{children}</Tag>
    </Tag>
  );
}

/**
 * Narrative paragraph: clamps to `lines` on phones; "More" shows only when the
 * text is actually cut. Desktop: unchanged (no clamp, no button).
 */
export function Clamp({ children, lines = 2, className, as = 'p' }: {
  children: ReactNode; lines?: number; className?: string; as?: 'p' | 'div';
  /** @deprecated measured now; kept so call sites stay valid */
  text?: string; min?: number;
}) {
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  const phone = usePhone();
  const ref = useRef<HTMLElement | null>(null);
  const Tag = as as 'p';
  useLayoutEffect(() => {
    const el = ref.current;
    if (!phone || !el) { setCut(false); return; }
    const measure = () => { if (!open) setCut(el.scrollHeight > el.clientHeight + 1); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phone, open, children]);
  const clamped = phone && !open;
  return (
    <>
      <Tag ref={ref as never} className={cn(className, clamped && 'qp-clamp')} style={clamped ? ({ ['--qp-lines' as string]: lines }) : undefined}>
        {children}
      </Tag>
      {phone && (cut || open) && (
        <button type="button" className="qp-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Less' : 'More'}</button>
      )}
    </>
  );
}

/** The phone half of a tool title: text before " · " and without a "(…)" suffix. */
export function shortTitle(title: string): string {
  return title.split(' · ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim() || title;
}

/**
 * Narrative / note classes that clamp on phones without touching each call site
 * (the journal alone renders ~100 `.jr-note`s). Add `data-qp-clamp` to any
 * element to opt it in. Desktop: nothing happens.
 */
export const AUTO_CLAMP_SELECTOR = '.jr-note, .jr-lede, .jr-ins p, .gx-ps-read, .nxd .nxp-detail-head p, [data-qp-clamp]';

/**
 * Mounted once (App). On phones every AUTO_CLAMP_SELECTOR element is clamped
 * to 2 lines (CSS: [data-qp-ac]); when its text is actually cut, a real
 * "More" button is placed right after it (Less when open). Only data-qp-*
 * attributes are set on the component's own element; the button is a sibling
 * this hook owns and removes (note gone, no longer cut, or desktop).
 */
export function PhoneAutoClamp() {
  const phone = usePhone();
  useEffect(() => {
    const btnOf = new Map<HTMLElement, HTMLButtonElement>();
    const all = () => Array.from(document.querySelectorAll<HTMLElement>(AUTO_CLAMP_SELECTOR));
    const drop = (el: HTMLElement) => { btnOf.get(el)?.remove(); btnOf.delete(el); };
    const reset = () => {
      all().forEach((el) => { delete el.dataset.qpAc; });
      btnOf.forEach((b) => b.remove()); btnOf.clear();
    };
    if (!phone) { reset(); return; }
    let raf = 0;
    const apply = () => {
      raf = 0;
      // orphaned buttons (their note left the DOM)
      btnOf.forEach((b, el) => { if (!el.isConnected) { b.remove(); btnOf.delete(el); } });
      for (const el of all()) {
        if (el.closest('[role=dialog]')) continue; // sheets show everything
        const open = el.dataset.qpAc === 'open';
        if (!open) el.dataset.qpAc = 'clamp';
        const cut = open || el.scrollHeight > el.clientHeight + 1;
        const have = btnOf.get(el);
        if (!cut) { if (have) drop(el); continue; }
        const b = have ?? document.createElement('button');
        if (!have) {
          b.type = 'button';
          b.className = 'qp-more qp-ac-more';
          b.addEventListener('click', () => {
            const next = el.dataset.qpAc !== 'open';
            el.dataset.qpAc = next ? 'open' : 'clamp';
            b.textContent = next ? 'Less' : 'More';
            b.setAttribute('aria-expanded', String(next));
          });
          btnOf.set(el, b);
        }
        b.textContent = open ? 'Less' : 'More';
        b.setAttribute('aria-expanded', String(open));
        if (el.nextSibling !== b) el.after(b);
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const mo = new MutationObserver((recs) => {
      // ignore our own button insertions
      if (recs.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => n instanceof HTMLElement && n.classList.contains('qp-ac-more')))) return;
      schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', schedule); reset(); };
  }, [phone]);
  return null;
}
