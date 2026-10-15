/**
 * PUBLIC DOCS (/docs, /docs/:module, /docs/:module/:page) — 2026-10-14.
 *
 * Structure studied from a competitor's docs (research/skylit-teardown — layout
 * only, none of their copy, icons or assets): module tabs on top, a sectioned
 * sidebar (Field guide · Reference · Glossary) with Launch app + What's new,
 * breadcrumb, large H1, Copy page (markdown), on-page TOC on wide screens, a
 * disclaimer callout, ⌘K search over pages + shared/glossary.ts, and an
 * "Ask Quantinum" hand-off (/ask?q=…). Phone: the sidebar is a sheet, the
 * tabs scroll sideways, nothing scrolls the page horizontally at 390px.
 *
 * Content is typed TS under shared/docs (one file per page) — the server reads
 * the same registry for titles and the sitemap. Graphic language: the landing's
 * tokens (.lv2.nexus-vars in styles/landing-v2.css), light + dark.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ArrowUpRight, Bot, BookCheck, BellRing, ChartSpline, Check, Compass, Cone, Copy, GraduationCap, History, Info,
  Menu, Orbit, Radar, Rocket, Search, Sparkles, Telescope, Timer, TriangleAlert, Waves, X, type LucideIcon,
} from 'lucide-react';
import '@/styles/nexus.css';
import '@/styles/landing-v2.css';
import '@/styles/docs.css';
import { SEOHead } from '@/components/seo-head';
import { ThemePicker } from '@/components/landing/theme-picker';
import { useTheme } from '@/components/theme-provider';
import { GLOSSARY } from '@shared/glossary';
import { DOCS_PAGE_META } from '@shared/public-seo';
import {
  DISCLAIMER_TEXT, DOC_MODULES, GLOSSARY_HREF, buildSearchIndex, docHref, getModule, getPage, glossaryAnchor,
  headingId, pageToMarkdown, pagesOf, searchDocs, type DocBlock, type DocModule, type DocPage, type SearchDoc,
} from '@shared/docs';

const ICONS: Record<string, LucideIcon> = { Compass, Radar, Timer, Orbit, Waves, ChartSpline, Cone, Telescope, BookCheck, BellRing, Sparkles, Bot, GraduationCap };
const ModIcon = ({ m, size = 16 }: { m: DocModule; size?: number }) => {
  const I = ICONS[m.icon] ?? Compass;
  return <I size={size} aria-hidden="true" strokeWidth={1.9} />;
};
const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/* ── inline markdown: **bold**, `code`, [label](href) ─────────────────────── */
function Md({ md }: { md: string }) {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(md))) {
    if (m.index > last) out.push(md.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2]) out.push(<code key={k++}>{m[2]}</code>);
    else if (m[3]) {
      const href = m[4];
      out.push(href.startsWith('/') ? <Link key={k++} href={href}>{m[3]}</Link> : <a key={k++} href={href} target="_blank" rel="noopener noreferrer">{m[3]}</a>);
    }
    last = re.lastIndex;
  }
  if (last < md.length) out.push(md.slice(last));
  return <>{out}</>;
}

export function Disclaimer() {
  return (
    <aside className="qd-callout qd-disclaimer" role="note" aria-label="Disclaimer">
      <Info size={18} aria-hidden="true" /><p>{DISCLAIMER_TEXT}</p>
    </aside>
  );
}

function Block({ b }: { b: DocBlock }) {
  switch (b.t) {
    case 'p': return <p><Md md={b.md} /></p>;
    case 'h2': return <h2 id={headingId(b)}><a href={`#${headingId(b)}`} className="qd-anchor">{b.text}</a></h2>;
    case 'h3': return <h3>{b.text}</h3>;
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul';
      return <L>{b.items.map((it, i) => <li key={i}><Md md={it} /></li>)}</L>;
    }
    case 'table': return (
      <div className="qd-table" role="region" aria-label={`${b.head.join(', ')} table`} tabIndex={0}>
        <table>
          <thead><tr>{b.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row"><Md md={c} /></th> : <td key={j}><Md md={c} /></td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    case 'callout': return (
      <aside className={`qd-callout ${b.kind}`} role="note">
        {b.kind === 'caution' ? <TriangleAlert size={18} aria-hidden="true" /> : <Info size={18} aria-hidden="true" />}
        <p><Md md={b.md} /></p>
      </aside>
    );
    case 'disclaimer': return <Disclaimer />;
    case 'glossary': return (
      <dl className="qd-glossary">
        {Object.entries(GLOSSARY).map(([key, e]) => {
          const entry = e as { term: string; short: string; more?: string };
          return (
            <div key={key} id={glossaryAnchor(key)}>
              <dt>{entry.term}</dt>
              <dd>{entry.short}{entry.more ? <span> {entry.more}</span> : null}</dd>
            </div>
          );
        })}
      </dl>
    );
  }
}

/* ── ⌘K search ─────────────────────────────────────────────────────────────── */
function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, go] = useLocation();
  const index = useMemo(() => buildSearchIndex(), []);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const shown = useMemo<SearchDoc[]>(() => q.trim()
    ? searchDocs(index, q)
    : DOC_MODULES.map((m) => ({ kind: 'page', title: m.name, hint: m.role, href: `/docs/${m.id}`, text: '' })), [q, index]);
  useEffect(() => { if (open) { setQ(''); setSel(0); requestAnimationFrame(() => inputRef.current?.focus()); } }, [open]);
  useEffect(() => setSel(0), [q]);
  if (!open) return null;
  const pick = (d?: SearchDoc) => { if (!d) return; onClose(); go(d.href); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(shown.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[sel]); }
  };
  return (
    <div className="qd-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qd-cmdk" role="dialog" aria-modal="true" aria-label="Search docs" onKeyDown={onKey}>
        <div className="qd-cmdk-in">
          <Search size={16} aria-hidden="true" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs and glossary"
            aria-label="Search docs and glossary" role="combobox" aria-expanded="true" aria-controls="qd-cmdk-list"
            aria-activedescendant={shown[sel] ? `qd-r-${sel}` : undefined} />
          <kbd>esc</kbd>
        </div>
        <ul id="qd-cmdk-list" role="listbox" className="qd-cmdk-list">
          {!q.trim() && <li role="presentation" className="qd-cmdk-g">Modules</li>}
          {q.trim() && shown.length === 0 && (
            <li className="qd-cmdk-empty">Nothing matches “{q}”. Try a module (Gravity, Ledger) or a term (zero-gamma, 0DTE, R).</li>
          )}
          {shown.map((d, i) => (
            <li key={d.href + i} role="presentation">
              <button type="button" role="option" id={`qd-r-${i}`} aria-selected={sel === i} className={sel === i ? 'on' : ''}
                onMouseEnter={() => setSel(i)} onClick={() => pick(d)}>
                <span className={`qd-kind ${d.kind}`}>{d.kind === 'term' ? 'Term' : d.kind === 'section' ? '§' : 'Page'}</span>
                <b>{d.title}</b><span className="hint">{d.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="qd-cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span></p>
      </div>
    </div>
  );
}

/* ── on-page TOC with scrollspy ────────────────────────────────────────────── */
function Toc({ page }: { page: DocPage }) {
  const heads = page.blocks.filter((b): b is Extract<DocBlock, { t: 'h2' }> => b.t === 'h2');
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = heads.map((h) => document.getElementById(headingId(h))).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: '-120px 0px -65% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  if (heads.length < 2) return <aside className="qd-toc" aria-hidden="true" />;
  return (
    <aside className="qd-toc">
      <nav aria-label="On this page">
        <p className="qd-label">On this page</p>
        <ul>{heads.map((h) => <li key={headingId(h)}><a href={`#${headingId(h)}`} className={active === headingId(h) ? 'on' : ''} aria-current={active === headingId(h) ? 'location' : undefined}>{h.text}</a></li>)}</ul>
      </nav>
    </aside>
  );
}

/* ── sidebar (desktop column + phone sheet) ───────────────────────────────── */
function Sidebar({ mod, page, onNavigate }: { mod: DocModule | undefined; page: DocPage | undefined; onNavigate?: () => void }) {
  const own = mod ? pagesOf(mod.id) : [];
  const guides = own.filter((p) => p.section === 'field-guide');
  const refs = [...own.filter((p) => p.section === 'reference'), ...(mod?.id !== 'platform' ? [getPage('platform', 'data-sources')!] : [])];
  const item = (p: DocPage, label = p.nav) => {
    const on = page && p.module === page.module && p.slug === page.slug;
    return <li key={docHref(p)}><Link href={docHref(p)} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={onNavigate}>{label}</Link></li>;
  };
  const glossary = getPage('platform', 'glossary')!;
  return (
    <nav className="qd-side-in" aria-label="Docs sections">
      <ul className="qd-side-quick">
        <li><Link href="/t" onClick={onNavigate}><Rocket size={16} aria-hidden="true" /> Launch app</Link></li>
        <li><Link href="/updates" onClick={onNavigate}><History size={16} aria-hidden="true" /> What's new</Link></li>
      </ul>
      <div className="qd-side-group"><p className="qd-label">Field guide</p>
        <ul>{guides.length ? guides.map((p) => item(p)) : DOC_MODULES.filter((m) => m.id !== 'platform').map((m) => item(getPage(m.id)!, m.name))}</ul>
      </div>
      {refs.length > 0 && <div className="qd-side-group"><p className="qd-label">Reference</p><ul>{refs.map((p) => item(p))}</ul></div>}
      <div className="qd-side-group"><p className="qd-label">Glossary</p><ul>{item(glossary, 'All terms')}</ul></div>
      {mod && mod.id !== 'platform' && (
        <a className="qd-side-open" href={mod.appHref}>Open {mod.name} in the app <ArrowUpRight size={14} aria-hidden="true" /></a>
      )}
    </nav>
  );
}

function CopyPage({ page }: { page: DocPage }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  const copy = useCallback(async () => {
    const md = pageToMarkdown(page, window.location.origin);
    try {
      await navigator.clipboard.writeText(md);
      setState('ok');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = md; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        setState(ok ? 'ok' : 'err');
      } catch { setState('err'); }
    }
    window.setTimeout(() => setState('idle'), 2000);
  }, [page]);
  return (
    <button type="button" className="qd-btn ghost" onClick={copy} aria-live="polite" aria-label={state === 'ok' ? 'Copied as Markdown' : 'Copy page as Markdown'}>
      {state === 'ok' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      <span className="qd-hide-sm">{state === 'ok' ? 'Copied' : state === 'err' ? 'Copy failed' : 'Copy page'}</span>
    </button>
  );
}

function askHref(title: string, path: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://quantedgelabs.net';
  return `/ask?q=${encodeURIComponent(`I'm reading the QuantEdge docs page "${title}" (${origin}${path}). `)}`;
}

/* ── pages ─────────────────────────────────────────────────────────────────── */
function DocsHome() {
  return (
    <article className="qd-article qd-home">
      <p className="qd-eyebrow">QuantEdge docs</p>
      <h1>Every desk, explained.</h1>
      <p className="qd-lede">Field guides written from the engines themselves: what each layer means, where it comes from, and how to read it. Plain English, with the assumptions left in.</p>
      <Disclaimer />
      <ul className="qd-grid">
        {DOC_MODULES.map((m) => (
          <li key={m.id}>
            <Link href={`/docs/${m.id}`} className="qd-card">
              <span className="qd-card-ic"><ModIcon m={m} size={18} /></span>
              <b>{m.name}</b>
              <span>{m.role}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="qd-fine">Looking for a word? Press <kbd>{isMac() ? '⌘K' : 'Ctrl K'}</kbd> to search every page and the <Link href={GLOSSARY_HREF}>glossary</Link>.</p>
    </article>
  );
}

function DocArticle({ page, mod }: { page: DocPage; mod: DocModule }) {
  const sectionLabel = page.section === 'field-guide' ? 'Field guide' : page.section === 'reference' ? 'Reference' : 'Glossary';
  return (
    <article className="qd-article">
      <nav className="qd-crumbs" aria-label="Breadcrumb">
        <ol>
          <li><Link href="/docs">Docs</Link></li>
          <li><Link href={`/docs/${mod.id}`}><ModIcon m={mod} size={14} /> {mod.name}</Link></li>
          <li aria-current="page">{sectionLabel}</li>
        </ol>
      </nav>
      <header className="qd-head">
        <h1>{page.title}</h1>
        <div className="qd-head-actions">
          <CopyPage page={page} />
        </div>
      </header>
      <p className="qd-lede">{page.description}</p>
      <div className="qd-body">{page.blocks.map((b, i) => <Fragment key={i}><Block b={b} /></Fragment>)}</div>
      <footer className="qd-foot">
        <span>Updated {page.updated}</span>
        <a href={askHref(page.title, docHref(page))} className="qd-more">Ask Quantinum about this page <ArrowUpRight size={14} aria-hidden="true" /></a>
      </footer>
    </article>
  );
}

function DocsNotFound() {
  return (
    <article className="qd-article">
      <p className="qd-eyebrow">404</p>
      <h1>No docs page here.</h1>
      <p className="qd-lede">That page may have moved. Pick a module above, search with <kbd>{isMac() ? '⌘K' : 'Ctrl K'}</kbd>, or go to the <Link href="/docs">docs home</Link>.</p>
    </article>
  );
}

export default function DocsPage({ params }: { params?: { module?: string; page?: string } }) {
  const isLight = useTheme().theme === 'nexus-light';
  const moduleId = params?.module;
  const mod = moduleId ? getModule(moduleId) : undefined;
  const page = moduleId ? getPage(moduleId, params?.page ?? '') : undefined;
  const path = moduleId ? (page ? docHref(page) : `/docs/${moduleId}`) : '/docs';
  const meta = DOCS_PAGE_META[path];
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [loc] = useLocation();

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((o) => !o); }
      else if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  useEffect(() => { if (!sheet) return; const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false); }; document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, [sheet]);
  // New page → top (or the hash target), and keep the active tab in view on a phone.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const el = hash ? document.getElementById(hash) : null;
    if (el) el.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
    tabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [loc]);

  const title = meta?.title ?? 'Docs page not found | QuantEdge Docs';
  const description = meta?.description ?? 'This docs page does not exist.';

  return (
    <div className={`lv2 nexus-vars qd-docs${isLight ? ' light' : ''}`}>
      <SEOHead title={title} description={description} />
      <a href="#qd-main" className="qd-skip">Skip to content</a>
      <header className="qd-top">
        <div className="qd-bar">
          <button type="button" className="qd-icon-btn qd-burger" aria-label="Open docs menu" aria-expanded={sheet} aria-controls="qd-sheet" onClick={() => setSheet(true)}><Menu size={18} aria-hidden="true" /></button>
          <Link href="/" className="qd-brand" aria-label="QuantEdge home"><span className="brand-mark" aria-hidden="true" /><span className="qd-brand-name">QuantEdge</span></Link>
          <Link href="/docs" className="qd-docs-word">Docs</Link>
          <span className="qd-spacer" />
          <a href={askHref(page?.title ?? 'QuantEdge docs', path)} className="qd-btn ask"><Sparkles size={15} aria-hidden="true" /><span className="qd-hide-sm">Ask Quantinum</span></a>
          <button type="button" className="qd-search" onClick={() => setSearchOpen(true)} aria-label="Search docs">
            <Search size={15} aria-hidden="true" /><span className="qd-hide-sm">Search docs</span><kbd className="qd-hide-sm">{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          <ThemePicker compact className="qd-theme" />
        </div>
        <div className="qd-tabs" ref={tabsRef}>
          <nav aria-label="Modules">
            <ul>
              {DOC_MODULES.map((m) => (
                <li key={m.id}><Link href={`/docs/${m.id}`} aria-current={mod?.id === m.id ? 'page' : undefined} className={mod?.id === m.id ? 'on' : ''}><ModIcon m={m} size={15} />{m.name}</Link></li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <div className="qd-layout">
        <aside className="qd-side"><Sidebar mod={mod} page={page} /></aside>
        <main id="qd-main" className="qd-main" tabIndex={-1}>
          {!moduleId ? <DocsHome /> : page && mod ? <DocArticle page={page} mod={mod} /> : <DocsNotFound />}
        </main>
        {page ? <Toc page={page} /> : <aside className="qd-toc" aria-hidden="true" />}
      </div>

      {sheet && (
        <div className="qd-scrim side" onMouseDown={(e) => { if (e.target === e.currentTarget) setSheet(false); }}>
          <div className="qd-sheet" id="qd-sheet" role="dialog" aria-modal="true" aria-label="Docs menu">
            <div className="qd-sheet-h"><span className="qd-label">Docs{mod ? ` · ${mod.name}` : ''}</span>
              <button type="button" className="qd-icon-btn" aria-label="Close docs menu" onClick={() => setSheet(false)} autoFocus><X size={18} aria-hidden="true" /></button>
            </div>
            <Sidebar mod={mod} page={page} onNavigate={() => setSheet(false)} />
            <div className="qd-sheet-row"><span className="qd-label">Colour mode</span><ThemePicker compact /></div>
          </div>
        </div>
      )}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
