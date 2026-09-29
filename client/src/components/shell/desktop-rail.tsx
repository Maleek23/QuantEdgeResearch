import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Moon, Sun } from 'lucide-react';
import { LuxSidebar } from '@/components/lux';
import { useTheme } from '@/components/theme-provider';
import { toggleLight } from '@/lib/visual-mode';
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
  const { theme } = useTheme();
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
  const light = theme === 'nexus-light' || theme === 'light';

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
        ...utilityItems(target),
        {
          // Quick ☀/☾: light ↔ the dark-ground mode you came from (Dark,
          // Midnight, Dim or High contrast). All five modes: account menu or
          // Settings › Display.
          id: 'theme',
          label: light ? 'Dark mode' : 'Light mode',
          icon: light ? Moon : Sun,
          onSelect: () => toggleLight(),
        },
      ]}
      note={<>Decision support only.<br />Not investment advice.</>}
    />
  );
}
