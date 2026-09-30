import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { LuxSidebar } from '@/components/lux';
import { useRailCollapsed } from './rail-state';
import qeMark from '@assets/qe-mark.svg';
import { navGroups, utilityItems } from './nav-groups';
import type { Tab } from './nav-model';

/**
 * Desktop navigation rail — the shared LuxSidebar in its `rail` placement:
 * short grouped labels, collapsible to a 56px icon strip (edge trigger or
 * ⌘/Ctrl+\\), the choice remembered (rail-state.ts). Collapsed, every item
 * keeps its accessible name and shows its label as a tooltip on hover AND on
 * keyboard focus — icons alone are never the only carrier. ↑/↓ move between
 * items. The same component draws the journal's page list and the phone
 * "More" sheet, so there is one sidebar implementation.
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
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(id); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const target = { activeTab, currentPath, onTab, go: setLocation };

  return (
    <LuxSidebar
      id="qe-rail"
      placement="rail"
      label="Primary navigation"
      collapsed={collapsed}
      onToggle={() => toggle()}
      toggleShortcut="⌘\"
      toggleKeys="Meta+Backslash Control+Backslash"
      ready={ready}
      brand={{
        href: '/today',
        label: 'QuantEdge',
        mark: <img src={qeMark} alt="" width={20} height={20} />,
        onSelect: () => setLocation('/today'),
      }}
      groups={navGroups(target)}
      footerItems={[
        // Visual modes live ONLY in Settings › Display (operator 2026-09-29).
        ...utilityItems(target),
      ]}
      note={<>Decision support only.<br />Not investment advice.</>}
    />
  );
}
