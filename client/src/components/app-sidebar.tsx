/**
 * AppSidebar — nav for the legacy-chrome pages.
 *
 * The Terminal (/t) is the product's front door and draws its own tab bar, so
 * this sidebar only renders around the remaining legacy-chrome surfaces
 * (Trade Desk, Thesis Radar, Settings, …). It links the REAL information
 * architecture — every href below is a live route or a live terminal tab.
 * No redirect aliases, no 404s.
 *
 * Active states are tab-aware: useLocation() returns the pathname only, so the
 * ?tab= is read separately via useSearch(). A terminal tab with its own item
 * (GEX, Positions, Journal) lights that item; the Terminal item lights for the
 * NEXUS home (no tab).
 */
import { Link, useLocation, useSearch } from "wouter";
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
  Zap,
  Target,
  HelpCircle,
} from "lucide-react";
import { WhatsNewBell } from "@/components/whats-new";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { useAuth } from "@/hooks/useAuth";

interface NavItem {
  id: string;
  title: string;
  icon: any;
  href: string;
  /** Path prefixes that mark this item as active */
  match?: string[];
  /** ?tab= value that activates this item (terminal tabs). Omit for path-only items. */
  tab?: string;
  shortcut?: string;
  hint?: string;
}

// ─── PRIMARY DESTINATIONS ───────────────────────────────────────────
// Order matches the ⌘1-6 jumps in the global command palette.
const PRIMARY: NavItem[] = [
  {
    id: "terminal",
    title: "Terminal",
    icon: Home,
    href: "/t",
    tab: "oracle",
    shortcut: "1",
    hint: "NEXUS home — market tape, rotation, signals",
  },
  {
    id: "gex",
    title: "GEX",
    icon: Zap,
    href: "/t?tab=gex",
    tab: "gex",
    shortcut: "2",
    hint: "Gamma hub — market-wide and per-symbol",
  },
  {
    id: "research",
    title: "Research",
    icon: Microscope,
    href: "/r/SPY",
    match: ["/r"],
    shortcut: "3",
    hint: "Per-ticker deep dive — chart, options, news, setups",
  },
  {
    id: "positions",
    title: "Positions",
    icon: Wallet,
    href: "/t?tab=positions",
    tab: "positions",
    shortcut: "4",
    hint: "My book — open positions, P&L heat map",
  },
  {
    id: "journal",
    title: "Journal",
    icon: BookOpen,
    href: "/t?tab=journal",
    tab: "journal",
    shortcut: "5",
    hint: "Trade log, metrics, backtests, academy",
  },
  {
    id: "trade-desk",
    title: "Trade Desk",
    icon: Crosshair,
    href: "/trade-desk",
    shortcut: "6",
    hint: "Idea generation — flow-driven trade ideas",
  },
];

// ─── AUTONOMOUS RADARS ──────────────────────────────────────────────
const RADARS: NavItem[] = [
  {
    id: "radar",
    title: "Thesis Radar",
    icon: Target,
    href: "/radar",
    hint: "Autonomous setup discovery — 6 patterns, 5 scans/day",
  },
];

// ─── UTILITY (always-visible footer items) ──────────────────────────
// Note: "What's New" is inserted in the JSX (it's a stateful component, not just a NavItem)
const UTILITY: NavItem[] = [
  { id: "how-to",   title: "How to use", icon: HelpCircle, href: "/how-to" },
  { id: "settings", title: "Settings",   icon: Settings,   href: "/settings" },
];

function activeTab(search: string): string | null {
  return new URLSearchParams(search).get("tab");
}

function isActive(item: NavItem, pathname: string, tab: string | null): boolean {
  const paths = item.match ?? [item.href.split("?")[0]];
  // Exact or child-path match — never a naive prefix ("/how-to" must not
  // light up a "/h" item).
  const pathOk = paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!pathOk) return false;
  if (item.tab === undefined) return true;
  return (tab ?? "oracle") === item.tab;
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
  const search = useSearch();
  const tab = activeTab(search);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Logo */}
      <SidebarHeader className="px-3 py-3 border-b border-sidebar-border">
        <Link href="/t">
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

      {/* PRIMARY — destinations, flat */}
      <SidebarContent className="px-2 py-3 space-y-3">
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {PRIMARY.map(item => (
                <NavRow key={item.id} item={item} active={isActive(item, location, tab)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* RADARS — autonomous discovery */}
        <SidebarGroup className="py-0">
          <div className="px-2.5 pb-1 text-[8px] font-mono uppercase tracking-[0.14em] text-sidebar-foreground/30 group-data-[collapsible=icon]:hidden">
            Radars
          </div>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {RADARS.map(item => (
                <NavRow key={item.id} item={item} active={isActive(item, location, tab)} />
              ))}
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
                <NavRow key={item.id} item={item} active={isActive(item, location, tab)} />
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
