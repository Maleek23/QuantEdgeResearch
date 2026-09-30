/**
 * The navigation, as the sidebar draws it: SHORT sentence-case labels, a
 * longer hint for the tooltip, one icon per destination, and the grouping.
 * Desktop rail and the phone "More" sheet both read this, so a destination
 * has one name and one icon everywhere. Ids / hrefs still come from
 * nav-model.tsx (the single source the nav-architecture test parses).
 */
import {
  Activity, Bitcoin, Bot, BookOpen, CalendarDays, CandlestickChart, Grid3X3, Radar, TrendingUp, Wallet,
} from 'lucide-react';
import type { LuxIcon, LuxNavGroup, LuxNavItem } from '@/components/lux/lux-sidebar';
import { PAGES, UTILITY_PAGES, tabHref, type PageLink, type Tab } from './nav-model';

export const TAB_ICON: Record<Tab, LuxIcon> = {
  oracle: Radar,
  chart: CandlestickChart,
  flow: Activity,
  gex: Grid3X3,
  leaps: TrendingUp,
  crypto: Bitcoin,
  catalyst: CalendarDays,
  bot: Bot,
  positions: Wallet,
  journal: BookOpen,
};

/** Short labels — product names per docs/POSITIONING.md (NEXUS = the trading desk,
 *  Quantinum Bot = the paper-trading bot). Labels only; ids and URLs never change. */
export const TAB_SHORT: Record<Tab, string> = {
  oracle: 'NEXUS',
  chart: 'Chart',
  flow: 'Flow',
  gex: 'GEX',
  leaps: 'LEAPS',
  crypto: 'Crypto',
  catalyst: 'Catalysts',
  bot: 'Quantinum Bot',
  positions: 'Positions',
  journal: 'Journal',
};

export const TAB_HINT: Record<Tab, string> = {
  oracle: 'Trading desk — ranked setups and the 0DTE desk',
  chart: 'Charts with walls, zero-γ and idea levels',
  flow: 'Options flow — prints, sweeps and blocks',
  gex: 'Dealer positioning — GEX, VEX, walls, zero-γ',
  leaps: 'Long-dated calls, graded',
  crypto: 'BTC/ETH and the equity proxies',
  catalyst: 'Earnings, macro and news calendar',
  bot: 'Paper-trading bot — rules, fills, public record',
  positions: 'Your open positions, stops and alerts',
  journal: 'Your trades, insights and track record',
};

/** Top-bar titles — the short label, or the product name with its role. */
export const TAB_TITLE: Record<Tab, string> = { ...TAB_SHORT, oracle: 'NEXUS · Trading desk' };

const PAGE_SHORT: Record<string, string> = { '/how-to': 'Guide' };
const PAGE_HINT: Record<string, string> = {
  '/today': 'Morning brief — dealer map and best ideas',
  '/alerts': 'Price and idea alerts',
  '/how-to': 'How to use QuantEdge',
  '/settings': 'Account and display settings',
};
export const pageShort = (p: PageLink) => PAGE_SHORT[p.href] ?? p.label;

/** Group captions — short, drawn as hairlines when the rail is collapsed. */
export const NAV_GROUPS: Array<{ id: string; label: string; tabs?: Tab[]; pages?: string[] }> = [
  { id: 'start', label: 'Start', pages: ['/today'] },
  { id: 'trade', label: 'Trade', tabs: ['oracle', 'flow', 'gex'] },
  { id: 'research', label: 'Research', tabs: ['chart', 'leaps', 'crypto', 'catalyst'] },
  { id: 'manage', label: 'Manage', tabs: ['bot', 'positions', 'journal'] },
];

export interface NavTarget {
  /** Terminal tab in view (null on a standalone page). */
  activeTab?: Tab | null;
  /** Current path, for page items. */
  currentPath?: string;
  /** Switch a terminal tab in place (inside /t). Absent → navigate. */
  onTab?: (tab: Tab) => void;
  /** SPA navigation (wouter setLocation). */
  go: (href: string) => void;
  /** Tabs to leave out (e.g. the phone dock's primary tabs). */
  omitTabs?: readonly Tab[];
  /** Page hrefs to leave out (e.g. /today, already in the phone dock). */
  omitPages?: readonly string[];
}

export function tabItem(id: Tab, t: NavTarget): LuxNavItem {
  return {
    id: `tab-${id}`,
    label: TAB_SHORT[id],
    hint: TAB_HINT[id],
    icon: TAB_ICON[id],
    href: tabHref(id),
    active: t.activeTab === id,
    onSelect: () => (t.onTab ? t.onTab(id) : t.go(tabHref(id))),
    testId: `nav-tab-${id}`,
  };
}

export function pageItem(p: PageLink, t: NavTarget): LuxNavItem {
  return {
    id: `page-${p.href}`,
    label: pageShort(p),
    hint: PAGE_HINT[p.href],
    icon: p.icon as LuxIcon,
    href: p.href,
    active: t.currentPath === p.href,
    onSelect: () => t.go(p.href),
    testId: `nav-page-${p.href.slice(1)}`,
  };
}

export function navGroups(t: NavTarget): LuxNavGroup[] {
  const pages = new Map(PAGES.map((p) => [p.href, p]));
  return NAV_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    items: [
      ...(g.pages ?? []).filter((h) => !t.omitPages?.includes(h)).map((h) => pages.get(h)).filter((p): p is PageLink => !!p).map((p) => pageItem(p, t)),
      ...(g.tabs ?? []).filter((id) => !t.omitTabs?.includes(id)).map((id) => tabItem(id, t)),
    ],
  })).filter((g) => g.items.length > 0);
}

export function utilityItems(t: NavTarget): LuxNavItem[] {
  return UTILITY_PAGES.map((p) => pageItem(p, t));
}
