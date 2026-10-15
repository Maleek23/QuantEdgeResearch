/**
 * Docs registry — modules, pages, markdown export and the search index.
 * Add a page: create shared/docs/pages/<module>/<slug>.ts and list it in PAGES.
 * scripts/test-docs-site.ts fails if a module has no field guide.
 */
import { GLOSSARY } from '../glossary';
import { DISCLAIMER_TEXT, slugify, type DocBlock, type DocModule, type DocPage } from './types';

import platformIndex from './pages/platform/index';
import platformData from './pages/platform/data-sources';
import platformGlossary from './pages/platform/glossary';
import nexus from './pages/nexus/index';
import nexusRef from './pages/nexus/reference';
import zero from './pages/zero/index';
import zeroRef from './pages/zero/reference';
import gravity from './pages/gravity/index';
import gravityRef from './pages/gravity/reference';
import gravityLabels from './pages/gravity/node-labels';
import current from './pages/current/index';
import currentRef from './pages/current/reference';
import trajectory from './pages/trajectory/index';
import trajectoryRef from './pages/trajectory/reference';
import envelope from './pages/envelope/index';
import envelopeRef from './pages/envelope/reference';
import envelopeCones from './pages/envelope/cones';
import horizon from './pages/horizon/index';
import horizonRef from './pages/horizon/reference';
import ledger from './pages/ledger/index';
import ledgerRef from './pages/ledger/reference';
import tripwire from './pages/tripwire/index';
import tripwireRef from './pages/tripwire/reference';
import tripwireLevels from './pages/tripwire/level-alerts';
import quantinum from './pages/quantinum/index';
import quantinumRef from './pages/quantinum/reference';
import bot from './pages/quantinum-bot/index';
import botRef from './pages/quantinum-bot/reference';
import academy from './pages/academy/index';
import academyRef from './pages/academy/reference';

export * from './types';

export const DOC_MODULES: DocModule[] = [
  { id: 'platform', name: 'Platform', role: 'Start here — how QuantEdge fits together', icon: 'Compass', appHref: '/t' },
  { id: 'nexus', name: 'NEXUS', role: 'Trading desk — ranked setups', icon: 'Radar', appHref: '/t' },
  { id: 'zero', name: 'Zero', role: '0DTE index desk inside NEXUS', icon: 'Timer', appHref: '/t' },
  { id: 'gravity', name: 'Gravity', role: 'Dealer positioning — GEX, VEX, walls', icon: 'Orbit', appHref: '/t?tab=gex' },
  { id: 'current', name: 'Current', role: 'Live options flow', icon: 'Waves', appHref: '/t?tab=flow' },
  { id: 'trajectory', name: 'Trajectory', role: 'Chart + Path projection', icon: 'ChartSpline', appHref: '/t?tab=chart' },
  { id: 'envelope', name: 'Envelope', role: 'Expected-move cones', icon: 'Cone', appHref: '/t?tab=chart' },
  { id: 'horizon', name: 'Horizon', role: 'LEAPS & swings', icon: 'Telescope', appHref: '/t?tab=leaps' },
  { id: 'ledger', name: 'Ledger', role: 'Verified journal and record', icon: 'BookCheck', appHref: '/t?tab=journal' },
  { id: 'tripwire', name: 'Tripwire', role: 'Alerts', icon: 'BellRing', appHref: '/alerts' },
  { id: 'quantinum', name: 'Quantinum', role: 'AI analyst', icon: 'Sparkles', appHref: '/ask' },
  { id: 'quantinum-bot', name: 'Quantinum Bot', role: 'Paper-trading bot', icon: 'Bot', appHref: '/t?tab=bot' },
  { id: 'academy', name: 'Academy', role: 'Learn the concepts', icon: 'GraduationCap', appHref: '/how-to' },
];

export const DOC_PAGES: DocPage[] = [
  platformIndex, platformData, platformGlossary,
  nexus, nexusRef, zero, zeroRef, gravity, gravityRef, gravityLabels, current, currentRef,
  trajectory, trajectoryRef, envelope, envelopeRef, envelopeCones, horizon, horizonRef,
  ledger, ledgerRef, tripwire, tripwireRef, tripwireLevels, quantinum, quantinumRef,
  bot, botRef, academy, academyRef,
];

export const GLOSSARY_HREF = '/docs/platform/glossary';

export function docHref(p: Pick<DocPage, 'module' | 'slug'>): string {
  return p.slug ? `/docs/${p.module}/${p.slug}` : `/docs/${p.module}`;
}
export const getModule = (id: string) => DOC_MODULES.find((m) => m.id === id);
export const pagesOf = (module: string) => DOC_PAGES.filter((p) => p.module === module);
export function getPage(module: string, slug = ''): DocPage | undefined {
  return DOC_PAGES.find((p) => p.module === module && p.slug === slug);
}
export const headingId = (b: Extract<DocBlock, { t: 'h2' }>) => b.id ?? slugify(b.text);
export const glossaryAnchor = (key: string) => `term-${slugify(key)}`;

/** Every docs URL with its page (the sitemap + SEO + the test read this). */
export function docRoutes(): Array<{ path: string; page: DocPage }> {
  return DOC_PAGES.map((page) => ({ path: docHref(page), page }));
}

const stripMd = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

/** The page as markdown — what "Copy page" puts on the clipboard. */
export function pageToMarkdown(p: DocPage, origin = 'https://quantedgelabs.net'): string {
  const abs = (md: string) => md.replace(/\]\((\/[^)]*)\)/g, `](${origin}$1)`);
  const out: string[] = [`# ${p.title}`, '', p.description, ''];
  for (const b of p.blocks) {
    if (b.t === 'p') out.push(abs(b.md), '');
    else if (b.t === 'h2') out.push(`## ${b.text}`, '');
    else if (b.t === 'h3') out.push(`### ${b.text}`, '');
    else if (b.t === 'list') out.push(...b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : '-'} ${abs(it)}`), '');
    else if (b.t === 'callout') out.push(`> ${abs(b.md)}`, '');
    else if (b.t === 'disclaimer') out.push(`> ${DISCLAIMER_TEXT}`, '');
    else if (b.t === 'table') {
      out.push(`| ${b.head.join(' | ')} |`, `| ${b.head.map(() => '---').join(' | ')} |`);
      for (const r of b.rows) out.push(`| ${r.map((c) => abs(c).replace(/\|/g, '\\|')).join(' | ')} |`);
      out.push('');
    } else if (b.t === 'glossary') {
      for (const e of Object.values(GLOSSARY)) out.push(`**${e.term}** — ${e.short}${'more' in e && e.more ? ` ${e.more}` : ''}`, '');
    }
  }
  out.push(`Source: ${origin}${docHref(p)}`);
  return out.join('\n');
}

export interface SearchDoc { kind: 'page' | 'section' | 'term'; title: string; hint: string; href: string; text: string }

/** Flat index over every page, every H2 and every glossary term. */
export function buildSearchIndex(): SearchDoc[] {
  const out: SearchDoc[] = [];
  for (const p of DOC_PAGES) {
    const mod = getModule(p.module)?.name ?? p.module;
    const body = p.blocks.map((b) =>
      b.t === 'p' || b.t === 'callout' ? b.md : b.t === 'list' ? b.items.join(' ') : b.t === 'table' ? b.rows.flat().join(' ') : b.t === 'h2' || b.t === 'h3' ? b.text : '',
    ).join(' ');
    out.push({ kind: 'page', title: p.title, hint: mod, href: docHref(p), text: stripMd(`${p.title} ${mod} ${p.description} ${body}`).toLowerCase() });
    for (const b of p.blocks) {
      if (b.t === 'h2') out.push({ kind: 'section', title: b.text, hint: `${mod} · ${p.nav}`, href: `${docHref(p)}#${headingId(b)}`, text: `${b.text} ${mod}`.toLowerCase() });
    }
  }
  for (const [key, e] of Object.entries(GLOSSARY)) {
    const entry = e as { term: string; short: string; more?: string };
    out.push({ kind: 'term', title: entry.term, hint: 'Glossary', href: `${GLOSSARY_HREF}#${glossaryAnchor(key)}`, text: `${entry.term} ${key} ${entry.short} ${entry.more ?? ''}`.toLowerCase() });
  }
  return out;
}

/** Ranked search: title hits first, then body. Every query word must match. */
export function searchDocs(index: SearchDoc[], q: string, limit = 12): SearchDoc[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: Array<{ d: SearchDoc; s: number }> = [];
  for (const d of index) {
    const title = d.title.toLowerCase();
    if (!words.every((w) => d.text.includes(w) || title.includes(w))) continue;
    let s = 0;
    for (const w of words) s += title.startsWith(w) ? 6 : title.includes(w) ? 4 : 1;
    if (d.kind === 'term') s += 1;
    if (d.kind === 'page') s += 0.5;
    scored.push({ d, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.d);
}
