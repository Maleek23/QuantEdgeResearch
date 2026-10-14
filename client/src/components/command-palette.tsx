/**
 * CommandPalette — global ⌘K search across the platform.
 *
 * Triggers:
 *   - ⌘K / Ctrl+K from anywhere
 *   - Click the search icon in any header
 *
 * What it searches:
 *   - Tickers (typed → /r/SYMBOL)
 *   - Pages   (Today, Ideas, Markets, Research, Book, Journal — and tabs within)
 *   - Quick actions (thesis radar, settings)
 *
 * Wraps shadcn Command primitive — keyboard-first, accessible, fast.
 */
import { WatchStar } from '@/components/watch/watch-star';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useDeskRole } from '@/lib/desk-role';
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
  Bell,
  Zap,
  Microscope,
  Wallet,
  BookOpen,
  TrendingUp,
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

// The destinations of docs/IA_SYSTEM_DESIGN.md §3, in job order (Ideas/Slate retired 2026-09-29 → Today)
// (FIND → UNDERSTAND → ACT → PROVE). ⌘1–⌘5 follow this order.
const PRIMARY_DESTINATIONS: NavTarget[] = [
  { href: '/today',          label: 'Today',      icon: Home,      hint: 'Dealer map, best idea, ranked book', keywords: ['home','morning','brief','convictions','best','slate','radar','ideas','picks','gappers'] },
  { href: '/t',              label: 'NEXUS',      icon: Zap,       hint: 'Trading desk — ranked setups', keywords: ['terminal','dashboard','pulse','overview','nexus','desk','setups','tape'] },
  { href: '/r',              label: 'Ticker page', icon: Microscope,hint: 'Quantinum read, chart, options, GEX', keywords: ['chart','options','ticker','dossier','quantinum','evidence'] },
  { href: '/t?tab=positions',label: 'Positions',  icon: Wallet,    hint: 'Open positions, risk and P&L', keywords: ['positions','heatmap','pnl'] },
  { href: '/t?tab=journal',  label: 'Journal',    icon: BookOpen,  hint: 'Trades, analytics and track record', keywords: ['history','performance','backtest','calendar','pnl'] },
];

const NESTED_TABS: NavTarget[] = [
  // Terminal tabs
  { href: '/t?tab=gex',      label: 'GEX',      icon: Zap,  keywords: ['gamma','vex','dealer','walls'] },
  { href: '/t?tab=chart',    label: 'Chart',    icon: Home, keywords: ['price','levels','candle'] },
  { href: '/t?tab=flow',     label: 'Flow',     icon: Home, keywords: ['tape','premium','sweeps','whales'] },
  { href: '/t?tab=leaps',    label: 'LEAPS',    icon: Home, keywords: ['long','dated','thesis'] },
  { href: '/t?tab=crypto',   label: 'Crypto',   icon: Home, keywords: ['bitcoin','btc'] },
  { href: '/t?tab=catalyst', label: 'Catalysts', icon: Home, keywords: ['events','earnings','calendar'] },
  { href: '/t?tab=sectors', label: 'Sectors', icon: Home, keywords: ['sector','rotation','rank flow','leaders','semis','overnight','gappers'] },
  { href: '/t?tab=bot',      label: 'Quantinum Bot', icon: Home, keywords: ['bot','automation','paper','quantinum'] },
  // Ticker page (the per-ticker home — search a ticker → lands here; docs/TICKER_PAGE.md)
  { href: '/r/SPY?tab=chart',    label: 'Ticker page → Chart',    icon: Microscope, keywords: ['price','levels','candle'] },
  { href: '/r/SPY?tab=options',  label: 'Ticker page → Options',  icon: Microscope, keywords: ['chain','greeks','iv'] },
  { href: '/r/SPY?tab=gex',      label: 'Ticker page → GEX',      icon: Microscope, keywords: ['gamma','walls','flip','per-symbol'] },
  { href: '/r/SPY?tab=analyze',  label: 'Ticker page → Contract lab',  icon: Microscope, keywords: ['contract','grade','bullflow','a+'] },
  // Journal sub-tabs (nested — the journal reads ?jtab= so it never fights the shell's ?tab=)
  { href: '/t?tab=journal&jtab=trades',    label: 'Journal → Trades',       icon: BookOpen, keywords: ['history','trades','log','edit','export'] },
  { href: '/t?tab=journal&jtab=analytics', label: 'Journal → Analytics',    icon: BookOpen, keywords: ['setup','symbol','timing','insights','drawdown'] },
  { href: '/t?tab=journal&jtab=record',    label: 'Journal → Track record', icon: BookOpen, keywords: ['performance','win','metrics','ideas'] },
  { href: '/t?tab=journal&jtab=backtest',  label: 'Journal → Backtest',     icon: BookOpen, keywords: ['simulator','strategy'] },
  { href: '/t?tab=journal&jtab=import',    label: 'Journal → Import trades', icon: BookOpen, keywords: ['csv','broker','upload','bullflow','flow'] },
];

// Quick popular tickers for tap-jump (extend over time / pull from watchlist)
/** Role-gated destinations (useDeskRole): the platform admin's hub and a desk admin's own desk. */
const ROLE_DESTINATIONS = {
  admin: { href: '/admin', label: 'Admin', hint: 'Users, invite codes, waitlist, desks, audit log', keywords: ['admin', 'users', 'invites', 'waitlist', 'hub'] },
  desk: { href: '/desk', label: 'My desk', hint: 'Your bot, book and watchlist', keywords: ['desk', 'my bot', 'book', 'passcode'] },
} as const;

const POPULAR_TICKERS = [
  'SPY','QQQ','IWM','NVDA','AAPL','MSFT','TSLA','AMD','META','GOOGL','AMZN',
  'AVGO','ARM','MU','SMCI','PLTR','COIN','SHOP','NOK','BB','MP','CRDO','LITE','AAOI',
  'VST','CEG','OKLO','NNE','VRT','GEV','ETN','DDOG','NET','HUBS','SNOW','MDB','PANW','CRWD',
];

export function CommandPalette({ defaultOpen = false }: { defaultOpen?: boolean } = {}) {
  const [open, setOpen] = useState(defaultOpen);
  const [search, setSearch] = useState('');
  const [, setLocation] = useLocation();
  const deskRole = useDeskRole();
  const tickerQuery = search.trim().toUpperCase();
  const { data: tickerResults = [] } = useQuery<Array<{ symbol: string; name?: string; type?: string; changePct?: number | null }>>({
    queryKey: ['/api/search/symbols', tickerQuery, 'global-palette'],
    queryFn: async () => {
      const response = await fetch(`/api/search/symbols?q=${encodeURIComponent(tickerQuery)}`, { credentials: 'include' });
      if (!response.ok) return [];
      const body = await response.json();
      return (Array.isArray(body) ? body : body.results ?? []).slice(0, 10);
    },
    enabled: open && tickerQuery.length > 0,
    staleTime: 60_000,
    retry: 0,
  });

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
    // Allow any header search button (or other UI) to open the palette without
    // faking a keyboard event — dispatch `window` event 'qe:open-command-palette'.
    const openHandler = () => setOpen(true);
    window.addEventListener('qe:open-command-palette', openHandler);
    return () => {
      document.removeEventListener('keydown', handler);
      window.removeEventListener('qe:open-command-palette', openHandler);
    };
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
        placeholder="Search a ticker, page or tool…  (⌘K open/close · ⌘1–5 jump · Enter opens the ticker page)"
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
                on its ticker page → <span className="font-mono text-muted-foreground">/r/{search.toUpperCase()}</span>
              </div>
            ) : (
              <>
                <div className="mb-2">No matches. Try one of these:</div>
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
                  <span className="ml-2 text-[10px] text-muted-foreground">{t.hint}</span>
                )}
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  ⌘{i + 1}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Tabs and tools">
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
                <ArrowRight className="ml-auto w-3 h-3 text-muted-foreground" />
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={tickerQuery ? "Tickers" : "Popular tickers"}>
          {(tickerQuery
            ? tickerResults.map((result) => result.symbol)
            : POPULAR_TICKERS
          ).map(sym => {
            const result = tickerResults.find((item) => item.symbol === sym);
            return (
            <CommandItem
              key={sym}
              value={`${sym} ${result?.name ?? ''} ticker`}
              onSelect={() => go(`/r/${sym}`)}
            >
              <TrendingUp className="w-3.5 h-3.5 mr-2 text-[var(--brand-gold)]" />
              <span className="font-mono text-sm font-bold">{sym}</span>
              <span className="ml-2 min-w-0 truncate text-[10px] text-muted-foreground">{result?.name ?? 'Open ticker page'}</span>
              {result?.changePct != null && (
                <span className={result.changePct >= 0 ? 'ml-auto text-[10px] text-[var(--trade-bullish)]' : 'ml-auto text-[10px] text-[var(--trade-bearish)]'}>
                  {result.changePct >= 0 ? '+' : ''}{result.changePct.toFixed(2)}%
                </span>
              )}
              <span className="ml-auto text-[10px] font-mono text-muted-foreground">/r/{sym}</span>
              <WatchStar sym={sym} size={12} />
            </CommandItem>
          )})}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Pages">
          {deskRole.isSuperAdmin && (
            <CommandItem value={`${ROLE_DESTINATIONS.admin.label} ${ROLE_DESTINATIONS.admin.keywords.join(' ')}`} onSelect={() => go(ROLE_DESTINATIONS.admin.href)} data-testid="palette-admin">
              <Search className="w-3.5 h-3.5 mr-2" />
              <span className="text-xs">{ROLE_DESTINATIONS.admin.label}</span>
            </CommandItem>
          )}
          {(deskRole.deskSlug || (deskRole.isSuperAdmin && deskRole.enabled)) && (
            <CommandItem value={`${ROLE_DESTINATIONS.desk.label} ${ROLE_DESTINATIONS.desk.keywords.join(' ')}`} onSelect={() => go(ROLE_DESTINATIONS.desk.href)} data-testid="palette-desk">
              <Wallet className="w-3.5 h-3.5 mr-2" />
              <span className="text-xs">{deskRole.deskSlug ? ROLE_DESTINATIONS.desk.label : 'Desks'}</span>
            </CommandItem>
          )}
          <CommandItem onSelect={() => go('/alerts')}>
            <Bell className="w-3.5 h-3.5 mr-2" />
            <span className="text-xs">Alerts</span>
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
