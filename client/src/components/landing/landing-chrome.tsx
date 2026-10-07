/**
 * LANDING CHROME (v2, 2026-10-07) — the thin announcement bar, the slim nav
 * (logo · Product ▾ · Track record · Pricing · FAQ · ⌘K search pill · theme ·
 * Sign in · Join beta) and the marketing command palette ("Where to?").
 *
 * The palette is our own small dialog, not the in-app palette: the in-app one
 * pulls the terminal's nav model and data hooks into the landing chunk. It lists
 * the desks (which select that desk in the tour) and the public pages.
 * ⌘K / Ctrl+K opens it anywhere on the landing; Esc closes; ↑↓ + Enter navigate.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ThemePicker } from './theme-picker';
import { DESKS, showDesk } from './desk-tour';
import { DISCORD_INVITE_URL } from '@/lib/public-config';

type Item = { label: string; hint: string; group: 'Desks' | 'On this page' | 'Pages'; run: () => void };

const SEARCH = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
const CHEV = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function scrollToId(id: string) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

export function AnnouncementBar() {
  return (
    <div className="lv2-announce" role="note">
      <span className="dot" aria-hidden="true" />
      <span>The invite-only beta is open<span className="long"> — Free plan on delayed data</span>.</span>
      {DISCORD_INVITE_URL
        ? <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Say hi on Discord <span aria-hidden="true">→</span><span className="sr-only"> (opens in a new tab)</span></a>
        : <Link href="/signup?waitlist=1">Join the waitlist <span aria-hidden="true">→</span></Link>}
    </div>
  );
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const items = useMemo<Item[]>(() => [
    ...DESKS.map((d) => ({ label: d.tab, hint: d.title, group: 'Desks' as const, run: () => showDesk(d.id) })),
    { label: 'Track record', hint: 'A record you can check', group: 'On this page', run: () => scrollToId('sec-record') },
    { label: 'Pricing', hint: 'Free during the beta · waitlist for paid', group: 'On this page', run: () => scrollToId('pricing') },
    { label: 'FAQ', hint: 'Questions, answered plainly', group: 'On this page', run: () => scrollToId('sec-faq') },
    { label: 'Join the beta', hint: 'Invite code or waitlist', group: 'Pages', run: () => setLocation('/signup') },
    { label: 'Sign in', hint: 'Members', group: 'Pages', run: () => setLocation('/login') },
    { label: 'How to use QuantEdge', hint: 'The guide', group: 'Pages', run: () => setLocation('/how-to') },
    { label: 'Academy', hint: 'Options, GEX and flow explained', group: 'Pages', run: () => setLocation('/academy') },
    { label: 'About', hint: 'Who builds it and why', group: 'Pages', run: () => setLocation('/about') },
    { label: 'Blog', hint: 'Notes and research', group: 'Pages', run: () => setLocation('/blog') },
    { label: 'Public watchlist', hint: 'What we are watching', group: 'Pages', run: () => setLocation('/w') },
  ], [setLocation]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(s)) : items;
  }, [q, items]);

  useEffect(() => { if (open) { setQ(''); setSel(0); requestAnimationFrame(() => inputRef.current?.focus()); } }, [open]);
  useEffect(() => { setSel(0); }, [q]);
  if (!open) return null;

  const go = (i: Item | undefined) => { if (!i) return; onClose(); setTimeout(i.run, 0); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(shown.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(shown[sel]); }
  };
  let lastGroup = '';
  return (
    <div className="lv2-cmdk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="lv2-cmdk" role="dialog" aria-modal="true" aria-label="Tour the terminal" onKeyDown={onKey}>
        <div className="lv2-cmdk-in">
          {SEARCH}
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where to?" aria-label="Search desks and pages"
            role="combobox" aria-expanded="true" aria-controls="lv2-cmdk-list" aria-activedescendant={shown[sel] ? `lv2-cmdk-${sel}` : undefined} />
          <kbd>esc</kbd>
        </div>
        <ul id="lv2-cmdk-list" role="listbox" className="lv2-cmdk-list">
          {shown.length === 0 && <li className="lv2-cmdk-empty">Nothing matches “{q}”. Try a desk name like GEX or Flow.</li>}
          {shown.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <li key={`${it.group}-${it.label}`} role="presentation">
                {head && <p className="lv2-cmdk-g" aria-hidden="true">{head}</p>}
                <button type="button" role="option" id={`lv2-cmdk-${i}`} aria-selected={sel === i} className={sel === i ? 'on' : ''}
                  onMouseEnter={() => setSel(i)} onClick={() => go(it)}>
                  <b>{it.label}</b><span>{it.hint}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="lv2-cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span></p>
      </div>
    </div>
  );
}

export function LandingNav({ onTour }: { onTour: () => void }) {
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    if (!sheet) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [sheet]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [menu]);
  const anchor = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); scrollToId(id); };
  const pickDesk = (id: string) => { setMenu(false); showDesk(id); };

  return (
    <header className={`lv2-nav${scrolled ? ' scrolled' : ''}`}>
      <nav className="lv2-nav-in" aria-label="Main">
        <Link href="/" className="lv2-brand" aria-label="QuantEdge home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="lv2-brand-name">QuantEdge</span>
        </Link>
        <div className="lv2-links">
          <div className="lv2-menu" ref={menuRef}>
            <button type="button" className="lv2-link" aria-expanded={menu} aria-controls="lv2-product-menu" onClick={() => setMenu((m) => !m)}>Product {CHEV}</button>
            {menu && (
              <ul className="lv2-menu-pop" id="lv2-product-menu">
                {DESKS.map((d) => (
                  <li key={d.id}><button type="button" onClick={() => pickDesk(d.id)}><b>{d.tab}</b><span>{d.title}</span></button></li>
                ))}
              </ul>
            )}
          </div>
          <a className="lv2-link" href="#sec-record" onClick={anchor('sec-record')}>Track record</a>
          <a className="lv2-link" href="#pricing" onClick={anchor('pricing')}>Pricing</a>
          <a className="lv2-link" href="#sec-faq" onClick={anchor('sec-faq')}>FAQ</a>
        </div>
        <span className="lv2-spacer" />
        <button type="button" className="lv2-search" onClick={onTour} aria-label="Tour the terminal (command palette)">
          {SEARCH}<span className="lbl">Tour the terminal</span><kbd>{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <ThemePicker compact className="lv2-theme" />
        <Link href="/login" className="lv2-btn ghost lv2-signin">Sign in</Link>
        <Link href="/signup" className="lv2-btn primary">Join beta</Link>
        <button type="button" className="lv2-burger" aria-expanded={sheet} aria-controls="lv2-sheet" aria-label={sheet ? 'Close menu' : 'Open menu'} onClick={() => setSheet((v) => !v)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{sheet ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
        </button>
      </nav>
      {sheet && (
        <div className="lv2-sheet" id="lv2-sheet">
          <p className="lv2-label">Desks</p>
          <div className="lv2-sheet-desks">
            {DESKS.map((d) => <button key={d.id} type="button" onClick={() => { setSheet(false); showDesk(d.id); }}>{d.tab}</button>)}
          </div>
          <a href="#sec-record" onClick={(e) => { setSheet(false); anchor('sec-record')(e); }}>Track record</a>
          <a href="#pricing" onClick={(e) => { setSheet(false); anchor('pricing')(e); }}>Pricing</a>
          <a href="#sec-faq" onClick={(e) => { setSheet(false); anchor('sec-faq')(e); }}>FAQ</a>
          <Link href="/how-to">How to use it</Link>
          <div className="lv2-sheet-row"><span className="lv2-label">Colour mode</span><ThemePicker compact /></div>
          <Link href="/login" className="lv2-btn ghost lg">Sign in</Link>
        </div>
      )}
    </header>
  );
}

/** ⌘K / Ctrl+K opens the palette while the landing is mounted. */
export function useCmdK() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const show = useCallback(() => setOpen(true), []);
  return { open, show, close };
}
