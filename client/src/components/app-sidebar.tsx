/**
 * AppSidebar — 5 top-level destinations.
 *
 *   PULSE      what's happening (default home)
 *   HUNT       what to trade today
 *   RESEARCH   per-ticker deep dive
 *   POSITIONS  my book + P&L
 *   JOURNAL    history + learning
 *
 * Everything else is a tab/subpage inside one of these.
 * Old routes still work — they redirect via App.tsx.
 */
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Home,
  Crosshair,
  Microscope,
  Wallet,
  BookOpen,
  Settings,
  Star,
  Bell,
  Sparkles,
  Zap,
} from "lucide-react";
import { WhatsNewBell } from "@/components/whats-new";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { useAuth } from "@/hooks/useAuth";

interface NavItem {
  id: string;
  title: string;
  icon: any;
  href: string;
  /** Path prefixes that mark this item as active (for old/aliased routes) */
  match?: string[];
  shortcut?: string;
  hint?: string;
}

// ─── 6 PRIMARY DESTINATIONS ─────────────────────────────────────────
const PRIMARY: NavItem[] = [
  {
    id: "home",
    title: "Home",
    icon: Home,
    href: "/p",
    match: ["/p", "/pulse", "/home", "/market-pulse", "/market-outlook", "/geopolitical-matrix", "/command"],
    shortcut: "1",
    hint: "Your home — dashboard, market tape, rotation, earnings, what changed",
  },
  {
    id: "hunt",
    title: "Hunt",
    icon: Crosshair,
    href: "/h",
    match: ["/h", "/discovery", "/market-scanner", "/trade-desk", "/flow-heatmap"],
    shortcut: "2",
    hint: "What to trade — AI picks, sector hunt, surges, earnings, watchlist",
  },
  {
    id: "gex",
    title: "GEX",
    icon: Zap,
    href: "/g",
    match: ["/g", "/flow", "/flow-edge", "/gex-scanner", "/gex-dashboard", "/terminal/"],
    shortcut: "3",
    hint: "All gamma — hub, terminal, expiry matrix, heatmap, per-symbol",
  },
  {
    id: "research",
    title: "Research",
    icon: Microscope,
    href: "/r/SPY",
    match: ["/r/", "/options-analyzer", "/chart-analysis", "/analysis", "/historical-intelligence"],
    shortcut: "4",
    hint: "Per-ticker deep dive — chart, options, news, setups",
  },
  {
    id: "positions",
    title: "Positions",
    icon: Wallet,
    href: "/pos",
    match: ["/pos", "/positions", "/positions-heatmap"],
    shortcut: "5",
    hint: "My book — open positions, heat map, alerts, exits",
  },
  {
    id: "journal",
    title: "Journal",
    icon: BookOpen,
    href: "/j",
    match: ["/j", "/performance", "/history", "/backtest", "/simulator", "/conviction-backtest", "/academy", "/learning-dashboard"],
    shortcut: "6",
    hint: "Learning — trade log, metrics, backtests, mistakes",
  },
];

// ─── UTILITY (always-visible footer items) ──────────────────────────
// Note: "What's New" is inserted in the JSX (it's a stateful component, not just a NavItem)
const UTILITY: NavItem[] = [
  { id: "watchlists", title: "Watchlists", icon: Star,     href: "/watchlist" },
  { id: "alerts",     title: "Alerts",     icon: Bell,     href: "/alerts" },
  { id: "settings",   title: "Settings",   icon: Settings, href: "/settings" },
];

function isActive(item: NavItem, location: string): boolean {
  const matches = item.match ?? [item.href];
  return matches.some(m => location === m || location.startsWith(m));
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={item.hint ?? item.title}
        isActive={active}
        className={cn(
          "gap-2.5 px-2.5 py-2 rounded-md transition-all text-[13px]",
          active
            ? "bg-[var(--brand-cyan)]/10 text-[var(--brand-cyan)] font-semibold border border-[var(--brand-cyan)]/20"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
        )}
        data-testid={`nav-${item.id}`}
      >
        <Link href={item.href}>
          <Icon className={cn("w-4 h-4 shrink-0", active && "text-[var(--brand-cyan)]")} />
          <span className="truncate font-mono uppercase tracking-wider text-[11px]">{item.title}</span>
          {item.shortcut && (
            <span className="ml-auto text-[9px] font-mono text-sidebar-foreground/25 group-data-[collapsible=icon]:hidden">
              ⌘{item.shortcut}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { user } = useAuth();
  const userData = user as { firstName?: string; email?: string } | null;
  const [location] = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Logo */}
      <SidebarHeader className="px-3 py-3 border-b border-sidebar-border">
        <Link href="/p">
          <div className="flex items-center gap-2 cursor-pointer group">
            <img src={quantEdgeLabsLogoUrl} alt="QE" className="h-6 w-6 object-contain shrink-0" />
            <div className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
              <span className="text-xs font-bold text-sidebar-foreground tracking-tight">
                QuantEdge
              </span>
              <span className="text-[8px] font-semibold text-sidebar-foreground/40 tracking-[0.12em] uppercase font-mono">
                Labs
              </span>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      {/* PRIMARY — 5 destinations, flat */}
      <SidebarContent className="px-2 py-3 space-y-3">
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {PRIMARY.map(item => (
                <NavRow key={item.id} item={item} active={isActive(item, location)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* EDGE AI launcher — placeholder, wires up next sprint */}
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Edge AI — ask the platform"
                  className="gap-2.5 px-2.5 py-2 rounded-md text-[13px] border border-dashed border-[var(--brand-gold)]/30 text-[var(--brand-gold)]/80 hover:text-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/5"
                  data-testid="nav-edge-ai"
                  onClick={() => { /* TODO: open Edge drawer */ }}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="truncate font-mono uppercase tracking-wider text-[11px]">Edge AI</span>
                  <span className="ml-auto text-[8px] font-mono text-sidebar-foreground/25 group-data-[collapsible=icon]:hidden">
                    soon
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* UTILITY — small, low-emphasis */}
        <SidebarGroup className="py-0 mt-auto">
          <div className="px-2.5 pb-1 text-[8px] font-mono uppercase tracking-[0.14em] text-sidebar-foreground/30 group-data-[collapsible=icon]:hidden">
            Utility
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {/* What's New — stateful (unread badge from changelog) */}
              <SidebarMenuItem>
                <WhatsNewBell />
              </SidebarMenuItem>
              {UTILITY.map(item => (
                <NavRow key={item.id} item={item} active={isActive(item, location)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — user pill */}
      <SidebarFooter className="px-2 py-2 border-t border-sidebar-border">
        {userData && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-sidebar-accent/20 group-data-[collapsible=icon]:justify-center">
            <div className="w-5 h-5 rounded-full bg-[var(--brand-cyan)] flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-black">
                {(userData.firstName?.[0] || userData.email?.[0] || 'U').toUpperCase()}
              </span>
            </div>
            <span className="text-[10px] text-sidebar-foreground/60 truncate font-mono group-data-[collapsible=icon]:hidden">
              {userData.firstName || userData.email || 'User'}
            </span>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
