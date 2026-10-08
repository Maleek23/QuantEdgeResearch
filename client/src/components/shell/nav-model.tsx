/**
 * ONE NAVIGATION MODEL for the whole signed-in platform.
 *
 * The terminal (/t) and every standalone page (/today,
 * /performance, /alerts, /how-to, /settings…) read their tabs, the mobile dock
 * and the "More" sheet from here. Before 2026-09-24 the standalone pages wore a
 * second, older design — a left sidebar with its own header and footer — so
 * moving between the board and a page changed the whole chrome under you.
 */
import {
  Activity, Bell, Bitcoin, Bot, BookOpen, CalendarDays, CandlestickChart,
  Grid3X3, HelpCircle, Layers, Radar, SlidersHorizontal, Sparkles, TrendingUp, Wallet, Home,
} from 'lucide-react';

export type Tab = 'oracle' | 'chart' | 'flow' | 'gex' | 'sectors' | 'leaps' | 'crypto' | 'catalyst' | 'bot' | 'positions' | 'journal';

export const TABS: { id: Tab; label: string }[] = [
  { id: 'oracle',  label: 'NEXUS' },
  { id: 'flow',    label: 'FLOW' },
  { id: 'gex',     label: 'GEX' },
  { id: 'chart',   label: 'CHART' },
  { id: 'sectors', label: 'SECTORS' },
  { id: 'leaps',   label: 'LEAPS & Swings' },
  { id: 'crypto',  label: 'CRYPTO' },
  { id: 'catalyst', label: 'CATALYST' },
  { id: 'bot',     label: 'BOT' },
  { id: 'positions', label: 'POSITIONS' },
  { id: 'journal',   label: 'JOURNAL' },
];

/**
 * The phone dock, left to right (operator order, 2026-09-29): TODAY, NEXUS,
 * FLOW, GEX, CHART — five destinations, no "More" slot. Everything else
 * (Research group, Manage group, Alerts, Guide, Settings) opens from the
 * menu button in the phone top bar (MobileMenuButton). On the desktop rail
 * CHART stays in the Research group; the dock carries it because it is the
 * phone's most-used research view.
 */
export type DockItem = { kind: 'page'; href: string } | { kind: 'tab'; tab: Tab };
export const MOBILE_DOCK: DockItem[] = [
  { kind: 'page', href: '/today' },
  { kind: 'tab', tab: 'oracle' },
  { kind: 'tab', tab: 'flow' },
  { kind: 'tab', tab: 'gex' },
  { kind: 'tab', tab: 'chart' },
];
export const MOBILE_PRIMARY: Tab[] = ['oracle', 'flow', 'gex', 'chart'];
export const MOBILE_PRIMARY_PAGES: string[] = ['/today'];
export const MOBILE_MORE: Tab[] = ['sectors', 'leaps', 'crypto', 'catalyst', 'bot', 'positions', 'journal'];

/** Standalone pages — same chrome as the terminal, reached from the nav and "More". */
export interface PageLink { href: string; label: string; short: string; icon: typeof Radar }
export const PAGES: PageLink[] = [
  { href: '/today',       label: 'Today',       short: 'TODAY',  icon: Home },
];
export const UTILITY_PAGES: PageLink[] = [
  { href: '/alerts',   label: 'Alerts',   short: 'ALERTS',   icon: Bell },
  { href: '/how-to',   label: 'Guide',    short: 'GUIDE',  icon: HelpCircle },
  { href: '/updates',  label: "What's new", short: 'UPDATES', icon: Sparkles },
  { href: '/settings', label: 'Settings', short: 'SETTINGS', icon: SlidersHorizontal },
];

export function tabHref(t: Tab) { return t === 'oracle' ? '/t' : `/t?tab=${t}`; }

export function MobileTabIcon({ tab }: { tab: Tab }) {
  const c = 'h-[18px] w-[18px]';
  if (tab === 'oracle') return <Radar className={c} />;
  if (tab === 'chart') return <CandlestickChart className={c} />;
  if (tab === 'flow') return <Activity className={c} />;
  if (tab === 'gex') return <Grid3X3 className={c} />;
  if (tab === 'sectors') return <Layers className={c} />;
  if (tab === 'leaps') return <TrendingUp className={c} />;
  if (tab === 'crypto') return <Bitcoin className={c} />;
  if (tab === 'catalyst') return <CalendarDays className={c} />;
  if (tab === 'positions') return <Wallet className={c} />;
  if (tab === 'journal') return <BookOpen className={c} />;
  return <Bot className={c} />;
}
