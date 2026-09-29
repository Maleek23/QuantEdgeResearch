/**
 * LuxSidebar — THE sidebar. One implementation for the app rail, the journal's
 * page list and the phone "More" sheet (placement = rail | inline | sheet).
 *
 * Portions adapted from the Trade Journal web app (apps/web/src/components/
 * shell.tsx: NavLink, the collapsible desktop sidebar with its edge trigger,
 * collapsed-state tooltips; globals.css: .journal-desktop-sidebar mechanics),
 * MIT License, Copyright (c) 2026 LuxAlgo Global, LLC — see ./LICENSE-luxalgo.txt.
 * Re-themed to QuantEdge tokens; grouping, badges, active bar, arrow-key
 * movement and the inline/sheet placements are ours.
 *
 * Accessibility: a <nav> landmark of real links (middle-click / copy link
 * work; a plain click calls onSelect for in-place switching), aria-current on
 * the page in view, groups labelled by their caption, ↑/↓ (and ←/→ on the
 * phone strip) move between items, Home/End jump. Collapsed, labels stay in
 * the accessibility tree and appear as a tooltip on hover AND keyboard focus.
 */
import { useEffect, useRef, type ComponentType, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HoverHint } from './lux-tooltip';

export type LuxIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

export interface LuxNavItem {
  id: string;
  /** Short label — one or two words. */
  label: string;
  icon: LuxIcon;
  /** Real URL for the link (copy / new-tab). Omit for a pure action button. */
  href?: string;
  /** Plain left click → preventDefault + onSelect (modified clicks follow href). */
  onSelect?: () => void;
  active?: boolean;
  /** Longer description — shown in the tooltip. */
  hint?: string;
  /** Count / status shown right-aligned (a dot when collapsed). */
  badge?: number | string;
  testId?: string;
}

export interface LuxNavGroup {
  id: string;
  /** Short caption; drawn as a hairline when collapsed. */
  label: string;
  items: LuxNavItem[];
}

export interface LuxSidebarProps {
  groups: LuxNavGroup[];
  /** Pinned below the scrolling nav (settings, theme, help…). */
  footerItems?: LuxNavItem[];
  placement?: 'rail' | 'inline' | 'sheet';
  collapsed?: boolean;
  onToggle?: () => void;
  /** Shown in the toggle's tooltip, e.g. "⌘\\". */
  toggleShortcut?: string;
  /** aria-keyshortcuts value for the toggle, e.g. "Meta+Backslash Control+Backslash". */
  toggleKeys?: string;
  /** Accessible name of the <nav>. */
  label: string;
  /** Brand link in the header row (rail). The collapse trigger sits on its edge. */
  brand?: { href: string; label: string; mark?: ReactNode; onSelect?: () => void };
  /** Small print at the bottom; hidden when collapsed. */
  note?: ReactNode;
  /** False on the first paint so a remembered collapsed state does not animate in. */
  ready?: boolean;
  /** Called after any item is chosen (e.g. close the sheet it lives in). */
  onAnyItem?: () => void;
  className?: string;
  id?: string;
}

const isPlainClick = (e: MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);

function SidebarItem({
  item,
  collapsed,
  tooltips,
  onAnyItem,
}: {
  item: LuxNavItem;
  collapsed: boolean;
  tooltips: boolean;
  onAnyItem?: () => void;
}) {
  const Icon = item.icon;
  const body = (
    <>
      <Icon aria-hidden />
      <span className="lx-sidebar-label">{item.label}</span>
      {item.badge != null && item.badge !== 0 && item.badge !== '' && (
        <span className="lx-sidebar-badge" aria-label={`${item.badge} new`}>{item.badge}</span>
      )}
    </>
  );
  const common = {
    className: 'lx-sidebar-item',
    'aria-current': item.active ? ('page' as const) : undefined,
    'data-testid': item.testId,
  };
  const el = item.href ? (
    <a
      {...common}
      href={item.href}
      onClick={(e) => {
        if (!item.onSelect || !isPlainClick(e)) { onAnyItem?.(); return; }
        e.preventDefault();
        item.onSelect();
        onAnyItem?.();
      }}
    >
      {body}
    </a>
  ) : (
    <button {...common} type="button" onClick={() => { item.onSelect?.(); onAnyItem?.(); }}>
      {body}
    </button>
  );
  if (!tooltips) return el;
  if (collapsed) {
    return item.hint
      ? <HoverHint side="right" heading={item.label} content={item.hint} delay={120}>{el}</HoverHint>
      : <HoverHint side="right" content={item.label} compact delay={120}>{el}</HoverHint>;
  }
  return item.hint ? <HoverHint side="right" content={item.hint} delay={700}>{el}</HoverHint> : el;
}

const MOVE_KEYS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

export function LuxSidebar({
  groups,
  footerItems,
  placement = 'rail',
  collapsed = false,
  onToggle,
  toggleShortcut,
  toggleKeys,
  label,
  brand,
  note,
  ready = true,
  onAnyItem,
  className,
  id,
}: LuxSidebarProps) {
  const rootRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const isCollapsed = placement !== 'sheet' && collapsed;
  const tooltips = placement !== 'sheet';
  const activeId = [...groups.flatMap((g) => g.items), ...(footerItems ?? [])].find((i) => i.active)?.id;

  // Phone strip (inline placement): keep the current page visible. Horizontal
  // scroll only — never scrolls the page.
  useEffect(() => {
    if (placement !== 'inline') return;
    const nav = navRef.current;
    const a = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !a || nav.scrollWidth <= nav.clientWidth) return;
    const l = a.offsetLeft - nav.offsetLeft;
    if (l < nav.scrollLeft || l + a.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = Math.max(0, l - 12);
  }, [placement, activeId]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!MOVE_KEYS.has(e.key)) return;
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('.lx-sidebar-item') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : fwd ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const toggleLabel = `${isCollapsed ? 'Expand' : 'Collapse'} sidebar`;
  const toggleTip = toggleShortcut ? `${toggleLabel} (${toggleShortcut})` : toggleLabel;
  const edgeToggle = onToggle && brand && placement === 'rail';

  return (
    <aside
      ref={rootRef}
      id={id}
      className={cn('lx-sidebar', className)}
      data-placement={placement}
      data-collapsed={isCollapsed ? 'true' : 'false'}
      data-ready={ready ? 'true' : 'false'}
      onKeyDown={onKeyDown}
    >
      {brand && (
        <div className="lx-sidebar-header">
          <a
            href={brand.href}
            className="lx-sidebar-home"
            aria-label={brand.label}
            onClick={(e) => { if (brand.onSelect && isPlainClick(e)) { e.preventDefault(); brand.onSelect(); } }}
          >
            {brand.mark}
            <span className="lx-sidebar-brand" aria-hidden>{brand.label}</span>
          </a>
          {edgeToggle && (
            <HoverHint side="right" content={toggleTip} compact delay={200}>
              <button
                type="button"
                className="lx-sidebar-trigger"
                onClick={onToggle}
                aria-label={toggleLabel}
                aria-expanded={!isCollapsed}
                aria-keyshortcuts={toggleKeys}
              >
                {isCollapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
              </button>
            </HoverHint>
          )}
        </div>
      )}

      <nav ref={navRef} className="lx-sidebar-nav" aria-label={label}>
        {groups.map((g) => (
          <div key={g.id} className="lx-sidebar-group" role="group" aria-labelledby={`${id ?? label}-${g.id}`.replace(/\s+/g, '-')}>
            <div className="lx-sidebar-group-label" id={`${id ?? label}-${g.id}`.replace(/\s+/g, '-')}>{g.label}</div>
            <ul>
              {g.items.map((item) => (
                <li key={item.id}>
                  <SidebarItem item={item} collapsed={isCollapsed} tooltips={tooltips} onAnyItem={onAnyItem} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {(footerItems?.length || note || (onToggle && !edgeToggle)) && (
        <div className="lx-sidebar-footer">
          {!!footerItems?.length && (
            <ul>
              {footerItems.map((item) => (
                <li key={item.id}>
                  <SidebarItem item={item} collapsed={isCollapsed} tooltips={tooltips} onAnyItem={onAnyItem} />
                </li>
              ))}
            </ul>
          )}
          {onToggle && !edgeToggle && (
            <HoverHint side="right" content={isCollapsed ? toggleTip : null} compact delay={120}>
              <button
                type="button"
                className="lx-sidebar-item lx-sidebar-toggle"
                onClick={onToggle}
                aria-label={toggleLabel}
                aria-expanded={!isCollapsed}
                aria-keyshortcuts={toggleKeys}
              >
                {isCollapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
                <span className="lx-sidebar-label">Collapse</span>
              </button>
            </HoverHint>
          )}
          {note && <div className="lx-sidebar-note">{note}</div>}
        </div>
      )}
    </aside>
  );
}
