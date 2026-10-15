/**
 * PUBLIC NAV — the Products ▾ mega menu, the full-screen phone sheet and the
 * six-column footer, shared by the landing (pages/landing-v2.tsx) and the
 * product pages (pages/product.tsx). Product names, icons and one-liners come
 * from shared/product/catalog.ts so the menu, the pages and the docs agree.
 *
 * Styles: styles/landing-v2.css (.lv2.lp scope) + styles/product-pages.css.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'wouter';
import {
  BellRing, BookCheck, BookOpen, Bot, ChartSpline, ChevronDown, Cone, LayoutGrid, Megaphone, Orbit, Radar, Sparkles, Telescope, Timer, Waves, X,
  type LucideIcon,
} from 'lucide-react';
import { PRODUCTS, PRODUCT_DISCORD_URL as DISCORD_INVITE_URL, productPath } from '@shared/product/catalog';
import { ThemePicker } from './theme-picker';

const ICONS: Record<string, LucideIcon> = { Radar, Timer, Orbit, Waves, ChartSpline, Cone, Telescope, Sparkles, Bot, BookCheck, BellRing };
export function ProductIcon({ name, size = 18 }: { name: string; size?: number }) {
  const I = ICONS[name] ?? Radar;
  return <I size={size} strokeWidth={1.8} aria-hidden="true" />;
}

/** Products ▾ — a two-column grid of every module plus Docs / What's new / All products. */
export function ProductsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <div className="lv2-menu" ref={ref}>
      <button type="button" className="lv2-link" aria-expanded={open} aria-controls="pp-mega" onClick={() => setOpen((o) => !o)} data-testid="nav-products">
        Products <ChevronDown size={12} strokeWidth={2.5} aria-hidden="true" />
      </button>
      {open && (
        <div className="pp-mega" id="pp-mega" role="region" aria-label="Products">
          <ul className="pp-mega-grid">
            {PRODUCTS.map((p) => (
              <li key={p.slug}>
                <Link href={productPath(p.slug)} className="pp-mega-item" onClick={() => setOpen(false)}>
                  <span className="pp-ico"><ProductIcon name={p.icon} /></span>
                  <span><b>{p.name}</b><span>{p.oneLiner}</span></span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="pp-mega-foot">
            <Link href="/product" onClick={() => setOpen(false)}><LayoutGrid size={15} aria-hidden="true" />All products</Link>
            <Link href="/docs" onClick={() => setOpen(false)}><BookOpen size={15} aria-hidden="true" />Docs</Link>
            <Link href="/updates" onClick={() => setOpen(false)}><Megaphone size={15} aria-hidden="true" />What&rsquo;s new</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Accordion({ id, label, children, defaultOpen = false }: { id: string; label: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pp-acc">
      <button type="button" aria-expanded={open} aria-controls={`pp-acc-${id}`} onClick={() => setOpen((o) => !o)}>
        {label}<ChevronDown size={18} aria-hidden="true" className="pp-acc-chev" />
      </button>
      {open && <div id={`pp-acc-${id}`} className="pp-acc-body">{children}</div>}
    </div>
  );
}

/**
 * The phone menu: a full-screen sheet with accordions and a sticky Start CTA.
 * Portalled to the .lv2 root (the sticky nav's backdrop-filter would otherwise
 * become the containing block of a position:fixed child).
 */
export function PhoneSheet({ open, onClose, anchor, extra }: {
  open: boolean; onClose: () => void; anchor: HTMLElement | null; extra?: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [open, onClose]);
  const root = anchor?.closest('.lv2') ?? null;
  if (!open || !root) return null;
  return createPortal(
    <div className="pp-sheet" id="lv2-sheet" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="pp-sheet-top">
        <Link href="/" className="lv2-brand" aria-label="QuantEdge home" onClick={onClose}><span className="brand-mark" aria-hidden="true" /><span className="lv2-brand-name">QuantEdge</span></Link>
        <button ref={closeRef} type="button" className="lv2-burger pp-sheet-x" aria-label="Close menu" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </div>
      <nav className="pp-sheet-body" aria-label="Main">
        <Accordion id="products" label="Products" defaultOpen>
          <ul className="pp-sheet-products">
            {PRODUCTS.map((p) => (
              <li key={p.slug}>
                <Link href={productPath(p.slug)} onClick={onClose}>
                  <span className="pp-ico"><ProductIcon name={p.icon} /></span>
                  <span><b>{p.name}</b><span>{p.oneLiner}</span></span>
                </Link>
              </li>
            ))}
            <li><Link href="/product" onClick={onClose} className="pp-sheet-all">All products</Link></li>
          </ul>
        </Accordion>
        <Accordion id="learn" label="Learn">
          <Link href="/docs" onClick={onClose}>Docs</Link>
          <Link href="/how-to" onClick={onClose}>Academy</Link>
          <Link href="/blog" onClick={onClose}>Blog</Link>
          <Link href="/updates" onClick={onClose}>What&rsquo;s new</Link>
        </Accordion>
        {extra}
        <Link href="/product/ledger" onClick={onClose} className="pp-sheet-link">Track record</Link>
        <Link href="/?section=pricing" onClick={onClose} className="pp-sheet-link">Pricing</Link>
        {DISCORD_INVITE_URL && <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className="pp-sheet-link">Discord<span className="sr-only"> (opens in a new tab)</span></a>}
        <div className="pp-sheet-row"><span className="lv2-label">Colour mode</span><ThemePicker compact /></div>
      </nav>
      <div className="pp-sheet-cta">
        <Link href="/login" className="lv2-btn ghost lg" onClick={onClose}>Sign in</Link>
        <Link href="/signup" className="lv2-btn primary lg" onClick={onClose}>Start — join the beta</Link>
      </div>
    </div>,
    root,
  );
}

const FOOT_DISCLAIMER = 'Educational and analytical tool only. Not investment advice. Trading involves risk of loss; options (including 0DTE) and crypto carry substantial risk and can lose their full value. Quantinum Bot results are paper (simulated) trades, and past performance does not guarantee future results. Some data is delayed (e.g. CBOE option chains ~15 min; free plan quotes 15 min). Anything marked Sample is illustrative; live panels show real market data with its source and age. Every performance figure carries its sample size.';

/** Six-column public footer: Products · Platform · Proof · Learn · Company · Legal. */
export function PublicFooter() {
  return (
    <footer className="lv2-foot pp-foot">
      <div className="lv2-wrap">
        <div className="pp-foot-brand">
          <Link href="/" className="lv2-brand" aria-label="QuantEdge home"><span className="brand-mark" aria-hidden="true" /><span className="lv2-brand-name">QuantEdge</span></Link>
          <p className="lv2-fine">A trading research terminal for stocks, options and crypto — every number carries its evidence and its record.</p>
        </div>
        <div className="pp-foot-cols">
          <nav aria-label="Products"><p className="lv2-label">Products</p>
            {PRODUCTS.map((p) => <Link key={p.slug} href={productPath(p.slug)}>{p.name}</Link>)}
          </nav>
          <nav aria-label="Platform"><p className="lv2-label">Platform</p>
            <Link href="/product">All products</Link><Link href="/?section=pricing">Pricing</Link><Link href="/updates">What&rsquo;s new</Link><Link href="/w">Public watchlist</Link><Link href="/login">Sign in</Link><Link href="/signup">Join the beta</Link>
          </nav>
          <nav aria-label="Proof"><p className="lv2-label">Proof</p>
            <Link href="/product/ledger">Verified record</Link><Link href="/product/quantinum-bot">Bot paper book</Link><Link href="/docs/ledger">How we verify</Link><Link href="/docs/platform/data-sources">Data sources</Link>
          </nav>
          <nav aria-label="Learn"><p className="lv2-label">Learn</p>
            <Link href="/docs">Docs</Link><Link href="/how-to">Academy</Link><Link href="/docs/platform/glossary">Glossary</Link><Link href="/blog">Blog</Link>
          </nav>
          <nav aria-label="Company"><p className="lv2-label">Company</p>
            <Link href="/about">About</Link>{DISCORD_INVITE_URL && <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Discord</a>}
          </nav>
          <nav aria-label="Legal"><p className="lv2-label">Legal</p>
            <Link href="/terms">Terms of Service</Link><Link href="/privacy">Privacy Policy</Link><a href="#disclaimer">Risk disclaimer</a>
          </nav>
        </div>
        <div className="lv2-foot-bot">
          <span>© QuantEdge Labs · Founded by <Link href="/about#founder">Abdulmalik Ajisegiri</Link></span>
          <p id="disclaimer">{FOOT_DISCLAIMER}</p>
        </div>
      </div>
    </footer>
  );
}
