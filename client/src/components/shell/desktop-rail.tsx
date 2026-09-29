import { Link } from 'wouter';
import { useEffect } from 'react';
import {
  Activity, Bitcoin, Bot, BookOpen, CalendarDays, CandlestickChart,
  Grid3X3, PanelLeftClose, PanelLeftOpen, Radar, TrendingUp, Wallet,
} from 'lucide-react';
import { useRailCollapsed } from './rail-state';
import { cn } from '@/lib/utils';
import qeMark from '@assets/qe-mark.svg';
import { PAGES, TABS, UTILITY_PAGES, tabHref, type Tab } from './nav-model';

const TAB_ICONS: Record<Tab, typeof Radar> = {
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

const GROUPS: Array<{ label: string; tabs: Tab[] }> = [
  { label: 'Workspace', tabs: ['oracle', 'chart', 'flow', 'gex'] },
  { label: 'Research', tabs: ['leaps', 'crypto', 'catalyst'] },
  { label: 'Operations', tabs: ['bot', 'positions', 'journal'] },
];

/**
 * Desktop navigation rail. Collapses to an icon-only 56px strip (toggle at the
 * bottom, or ⌘/Ctrl+\\); the choice is remembered. Collapsed, every item keeps
 * its accessible name (aria-label) and shows its label as a tooltip on hover
 * AND on keyboard focus — icons alone are never the only carrier.
 */
export function DesktopRail({
  activeTab,
  currentPath,
  onTab,
}: {
  activeTab?: Tab | null;
  currentPath?: string;
  onTab?: (tab: Tab) => void;
}) {
  const [collapsed, toggle] = useRailCollapsed();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
  const tip = (label: string) => (collapsed ? { 'data-tip': label, 'aria-label': label } : {});

  return (
    <aside className={cn('qe-desktop-rail hidden lg:flex', collapsed && 'collapsed')} aria-label="Primary navigation">
      <Link href="/today" className="qe-rail-brand" aria-label="QuantEdge home" {...(collapsed ? { 'data-tip': 'QuantEdge home' } : {})}>
        <img src={qeMark} alt="" width={24} height={24} />
        <span><b>QUANTEDGE</b><small>RESEARCH TERMINAL</small></span>
      </Link>

      <nav className="qe-rail-nav">
        <section className="qe-rail-group" aria-label="Start">
          <div className="qe-rail-label">Start</div>
          {PAGES.slice(0, 1).map((page) => {
            const Icon = page.icon;
            const active = currentPath === page.href;
            return <Link key={page.href} href={page.href} className={cn('qe-rail-item', active && 'active')} aria-current={active ? 'page' : undefined} {...tip(page.label)}><Icon aria-hidden /><span>{page.label}</span>{active && <i aria-hidden />}</Link>;
          })}
        </section>

        {GROUPS.map((group) => (
          <section key={group.label} className="qe-rail-group" aria-label={group.label}>
            <div className="qe-rail-label">{group.label}</div>
            {group.tabs.map((id) => {
              const item = TABS.find((tab) => tab.id === id)!;
              const Icon = TAB_ICONS[id];
              const active = activeTab === id;
              const body = <><Icon aria-hidden /><span>{item.label}</span>{active && <i aria-hidden />}</>;
              return onTab ? (
                <button key={id} type="button" className={cn('qe-rail-item', active && 'active')} onClick={() => onTab(id)} aria-current={active ? 'page' : undefined} {...tip(item.label)}>{body}</button>
              ) : (
                <Link key={id} href={tabHref(id)} className="qe-rail-item" {...tip(item.label)}>{body}</Link>
              );
            })}
          </section>
        ))}

        <section className="qe-rail-group" aria-label="Daily workflow">
          <div className="qe-rail-label">Daily workflow</div>
          {PAGES.slice(1).map((page) => {
            const Icon = page.icon;
            const active = currentPath === page.href;
            return <Link key={page.href} href={page.href} className={cn('qe-rail-item', active && 'active')} aria-current={active ? 'page' : undefined} {...tip(page.label)}><Icon aria-hidden /><span>{page.label}</span>{active && <i aria-hidden />}</Link>;
          })}
        </section>
      </nav>

      <div className="qe-rail-utility">
        {UTILITY_PAGES.map((page) => {
          const Icon = page.icon;
          const active = currentPath === page.href;
          return <Link key={page.href} href={page.href} className={cn('qe-rail-item', active && 'active')} aria-current={active ? 'page' : undefined} {...tip(page.label)}><Icon aria-hidden /><span>{page.label}</span></Link>;
        })}
        <button
          type="button"
          className="qe-rail-item qe-rail-toggle"
          onClick={() => toggle()}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={`${collapsed ? 'Expand' : 'Collapse'} navigation (⌘/Ctrl + \\)`}
          {...(collapsed ? { 'data-tip': 'Expand navigation' } : {})}
        >
          {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
          <span>Collapse</span>
        </button>
        <div className="qe-rail-disclosure"><span />Decision support only<br />Data quality is surfaced</div>
      </div>
    </aside>
  );
}
