/**
 * TickerTabNav — horizontal tab strip under the top identity bar.
 *
 * Renders the canonical tab list from `ticker-tabs.ts` and lets the user
 * jump between sections of the ticker page. Active state, "stub"/"new"
 * markers, and accessibility live here so the page shell only has to
 * pass `activeTab` and `onTabChange`.
 */

import { cn } from '@/lib/utils';
import { TICKER_TABS, type TickerTabSlug } from './ticker-tabs';

interface TickerTabNavProps {
  activeTab: TickerTabSlug;
  onTabChange: (next: TickerTabSlug) => void;
}

export function TickerTabNav({ activeTab, onTabChange }: TickerTabNavProps) {
  return (
    <nav
      className="flex items-end gap-1 mb-4 border-b border-border/40 overflow-x-auto"
      role="tablist"
      aria-label="Ticker analytics sections"
      data-testid="ticker-tab-nav"
    >
      {TICKER_TABS.map((tab) => {
        const isActive = tab.slug === activeTab;
        return (
          <button
            key={tab.slug}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.slug)}
            title={tab.description}
            className={cn(
              'relative px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-[0.12em] whitespace-nowrap transition-colors',
              'border-b-2 -mb-px',
              isActive
                ? 'border-[var(--gex-positive)] text-[var(--gex-positive)]'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            data-testid={`ticker-tab-${tab.slug}`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
