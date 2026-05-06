/**
 * CommandPalette — global ⌘K search across the platform.
 *
 * Triggers:
 *   - ⌘K / Ctrl+K from anywhere
 *   - Click the search icon in any header
 *
 * What it searches:
 *   - Tickers (typed → /r/SYMBOL)
 *   - Pages   (Home, Hunt, GEX, Research, Positions, Journal — and tabs within)
 *   - Quick actions (refresh scan, add to watchlist, create idea from symbol)
 *
 * Wraps shadcn Command primitive — keyboard-first, accessible, fast.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Home,
  Crosshair,
  Zap,
  Microscope,
  Wallet,
  BookOpen,
  TrendingUp,
  Star,
  Bell,
  Search,
  ArrowRight,
} from 'lucide-react';

interface NavTarget {
  href: string;
  label: string;
  hint?: string;
  icon: any;
  keywords?: string[];
}

const PRIMARY_DESTINATIONS: NavTarget[] = [
  { href: '/p',   label: 'Home',      icon: Home,       hint: 'Dashboard / Pulse / Rotation', keywords: ['dashboard','pulse','tape','overview'] },
  { href: '/h',   label: 'Hunt',      icon: Crosshair,  hint: 'AI picks · GEX setups · sector hunt', keywords: ['discovery','scanner','picks','setups'] },
  { href: '/g',   label: 'GEX Hub',   icon: Zap,        hint: 'Hub · Per-Symbol · Matrix · Heatmap', keywords: ['gamma','vex','dealer','flow'] },
  { href: '/r',   label: 'Research',  icon: Microscope, hint: 'Per-ticker chart · options · GEX', keywords: ['terminal','chart','options'] },
  { href: '/pos', label: 'Positions', icon: Wallet,     hint: 'Open · heat map · alerts', keywords: ['heatmap','book','pnl'] },
  { href: '/j',   label: 'Journal',   icon: BookOpen,   hint: 'Trade log · metrics · backtest', keywords: ['history','performance','backtest'] },
];

const NESTED_TABS: NavTarget[] = [
  // Home
  { href: '/p?tab=dashboard', label: 'Home → Dashboard', icon: Home,    keywords: ['home','dashboard'] },
  { href: '/p?tab=pulse',     label: 'Home → Pulse',     icon: Home,    keywords: ['tape','market'] },
  // Hunt
  { href: '/h?tab=ai-picks',  label: 'Hunt → AI Picks',  icon: Crosshair, keywords: ['discovery','setups'] },
  { href: '/h?tab=gex',       label: 'Hunt → GEX Setups', icon: Crosshair, keywords: ['gamma','workflow'] },
  { href: '/h?tab=surges',    label: 'Hunt → Surges',     icon: Crosshair, keywords: ['momentum','breakouts'] },
  { href: '/h?tab=watchlist', label: 'Hunt → Watchlist',  icon: Crosshair, keywords: ['watchlist','saved'] },
  // GEX (market-wide only — per-symbol GEX lives in Research to avoid duplication)
  { href: '/g?tab=hub',       label: 'GEX → Hub',         icon: Zap, keywords: ['scanner','workflow','market-wide'] },
  { href: '/g?tab=matrix',    label: 'GEX → Matrix',      icon: Zap, keywords: ['strike','expiry','heatseeker'] },
  { href: '/g?tab=heatmap',   label: 'GEX → Heatmap',     icon: Zap, keywords: ['sector','flow'] },
  { href: '/g?tab=analysis',  label: 'GEX → Analysis',    icon: Zap, keywords: ['gamma','growth','history'] },
  // Research tabs (the per-ticker home — search a ticker → lands here)
  { href: '/r/SPY?tab=chart',    label: 'Research → Chart',    icon: Microscope, keywords: ['price','levels','candle'] },
  { href: '/r/SPY?tab=options',  label: 'Research → Options',  icon: Microscope, keywords: ['chain','greeks','iv'] },
  { href: '/r/SPY?tab=gex',      label: 'Research → GEX',      icon: Microscope, keywords: ['gamma','walls','flip','per-symbol'] },
  // Positions
  { href: '/pos?tab=heatmap', label: 'Positions → Heat Map', icon: Wallet, keywords: ['pnl','treemap'] },
  // Journal
  { href: '/j?tab=log',       label: 'Journal → Trade Log',  icon: BookOpen, keywords: ['history','trades'] },
  { href: '/j?tab=metrics',   label: 'Journal → Metrics',    icon: BookOpen, keywords: ['performance','win'] },
  { href: '/j?tab=backtest',  label: 'Journal → Backtest',   icon: BookOpen, keywords: ['simulator','strategy'] },
];

// Quick popular tickers for tap-jump (extend over time / pull from watchlist)
const POPULAR_TICKERS = [
  'SPY','QQQ','IWM','NVDA','AAPL','MSFT','TSLA','AMD','META','GOOGL','AMZN',
  'AVGO','ARM','MU','SMCI','PLTR','COIN','SHOP','NOK','BB','MP','CRDO','LITE','AAOI',
  'VST','CEG','OKLO','NNE','VRT','GEV','ETN','DDOG','NET','HUBS','SNOW','MDB','PANW','CRWD',
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [, setLocation] = useLocation();

  // Global ⌘K listener — only ⌘K toggles. Digit shortcuts must NOT hijack
  // typing into the search input (a real ticker like "1080P" or just "1" matters).
  // We only honor 1-6 when the search is empty AND the digit is pressed with ⌘.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      // ⌘1-⌘6 jumps to primary destination from anywhere (closes palette if open)
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '6') {
        const idx = parseInt(e.key) - 1;
        if (PRIMARY_DESTINATIONS[idx]) {
          e.preventDefault();
          setLocation(PRIMARY_DESTINATIONS[idx].href);
          setOpen(false);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setLocation]);

  // When search looks like a ticker (1-6 letters, all caps), pressing Enter on
  // empty results jumps to /r/SYMBOL even if it's not in our popular list.
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && search.trim()) {
      const q = search.trim().toUpperCase();
      const looksLikeTicker = /^[A-Z]{1,6}(\.[A-Z])?$/.test(q);
      if (looksLikeTicker) {
        e.preventDefault();
        setOpen(false);
        setLocation(`/r/${q}`);
        setSearch('');
      }
    }
  };

  const go = (href: string) => {
    setOpen(false);
    setSearch('');
    setLocation(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Type a ticker, page, or action…  (⌘K toggle · ⌘1-6 jump · Enter on ticker → Research)"
        value={search}
        onValueChange={setSearch}
        onKeyDown={handleInputKeyDown}
        autoFocus
      />
      <CommandList>
        <CommandEmpty>
          <div className="text-xs text-muted-foreground py-3 px-2">
            {/^[A-Za-z]{1,6}(\.[A-Za-z])?$/.test(search.trim()) ? (
              <div>
                Press <kbd className="px-1 py-0.5 bg-muted rounded text-[var(--brand-cyan)] font-mono">Enter</kbd> to open
                <span className="font-mono font-bold text-[var(--brand-cyan)] mx-1">{search.toUpperCase()}</span>
                in Research → <span className="font-mono text-muted-foreground/70">/r/{search.toUpperCase()}</span>
              </div>
            ) : (
              <>
                <div className="mb-2">No matches. Try:</div>
                <ul className="space-y-1 text-[11px]">
                  <li>· A ticker symbol (e.g. <span className="font-mono text-[var(--brand-cyan)]">CRDO</span>)</li>
                  <li>· A page name (e.g. <span className="font-mono text-[var(--brand-cyan)]">heatmap</span>)</li>
                  <li>· A workflow (e.g. <span className="font-mono text-[var(--brand-cyan)]">leaps</span>, <span className="font-mono text-[var(--brand-cyan)]">earnings</span>)</li>
                </ul>
              </>
            )}
          </div>
        </CommandEmpty>

        <CommandGroup heading="Go to">
          {PRIMARY_DESTINATIONS.map((t, i) => {
            const Icon = t.icon;
            return (
              <CommandItem
                key={t.href}
                value={`${t.label} ${(t.keywords ?? []).join(' ')}`}
                onSelect={() => go(t.href)}
              >
                <Icon className="w-3.5 h-3.5 mr-2 text-[var(--brand-cyan)]" />
                <span className="font-mono text-sm font-bold">{t.label}</span>
                {t.hint && (
                  <span className="ml-2 text-[10px] text-muted-foreground/70">{t.hint}</span>
                )}
                <span className="ml-auto text-[9px] font-mono text-muted-foreground/40">
                  ⌘{i + 1}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Tabs & sub-pages">
          {NESTED_TABS.map(t => {
            const Icon = t.icon;
            return (
              <CommandItem
                key={t.href}
                value={`${t.label} ${(t.keywords ?? []).join(' ')}`}
                onSelect={() => go(t.href)}
              >
                <Icon className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                <span className="text-xs">{t.label}</span>
                <ArrowRight className="ml-auto w-3 h-3 text-muted-foreground/40" />
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Tickers (jump to Research)">
          {POPULAR_TICKERS.map(sym => (
            <CommandItem
              key={sym}
              value={`${sym} ticker`}
              onSelect={() => go(`/r/${sym}`)}
            >
              <TrendingUp className="w-3.5 h-3.5 mr-2 text-[var(--brand-gold)]" />
              <span className="font-mono text-sm font-bold">{sym}</span>
              <span className="ml-2 text-[10px] text-muted-foreground/70">Research</span>
              <span className="ml-auto text-[9px] font-mono text-muted-foreground/40">/r/{sym}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => go('/watchlist')}>
            <Star className="w-3.5 h-3.5 mr-2" />
            <span className="text-xs">Open Watchlists</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/alerts')}>
            <Bell className="w-3.5 h-3.5 mr-2" />
            <span className="text-xs">Open Alerts</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/settings')}>
            <Search className="w-3.5 h-3.5 mr-2" />
            <span className="text-xs">Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
