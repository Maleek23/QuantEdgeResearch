import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  Home,
  Brain,
  Star,
  Trophy,
  GraduationCap,
  BookOpen,
  Settings,
  Search,
  Activity,
  Bot,
  Flame,
} from "lucide-react";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { useAuth } from "@/hooks/useAuth";

interface NavItem {
  id: string;
  title: string;
  icon: any;
  href: string;
  badge?: string;
  shortcut?: string;
}

// ────────────────────────────────────────────────────────────────────
// IA: three-tier sidebar
//
//   DISCOVERY  → how you find tickers worth attention
//   DESTINATION → /t/:symbol owns the per-ticker analytics (no sidebar
//                  entry — you get there from search or scanners)
//   ACTION     → where you stage / execute / journal trades
//
// Removed (folded into other surfaces):
//   • Command / GEX Scanner / Flow → merged into Scanner with filter
//     chips. The deep chart now lives at /t/:symbol/chart.
//   • Academy / Blog → moved to footer (learning isn't a daily action).
// ────────────────────────────────────────────────────────────────────

const mainItems: NavItem[] = [
  { id: "home", title: "Home", icon: Home, href: "/home", shortcut: "G H" },
  { id: "trade-desk", title: "Trade Desk", icon: Flame, href: "/trade-desk", badge: "AI", shortcut: "G T" },
  { id: "scanner", title: "Scanner", icon: Search, href: "/market-scanner", shortcut: "G S" },
  { id: "flow", title: "Flow & GEX", icon: Activity, href: "/flow", shortcut: "G F" },
  { id: "watchlist", title: "Watchlist", icon: Star, href: "/watchlist", shortcut: "G W" },
  { id: "olalgo", title: "OlAlgo Bot", icon: Bot, href: "/olalgo", badge: "BOT" },
  { id: "performance", title: "Performance", icon: Trophy, href: "/performance", shortcut: "G P" },
];

const learnItems: NavItem[] = [
  { id: "academy", title: "Academy", icon: GraduationCap, href: "/academy" },
  { id: "blog", title: "Blog", icon: BookOpen, href: "/blog" },
];

function NavGroup({ items, label }: { items: NavItem[]; label?: string }) {
  const [location] = useLocation();

  return (
    <SidebarGroup>
      {label && (
        <SidebarGroupLabel className="text-[9px] font-mono font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/30 px-3 mb-1">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = location === item.href ||
              (item.href !== "/home" && location.startsWith(item.href));

            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isActive}
                  className={cn(
                    "gap-2.5 px-2.5 py-2 rounded-md transition-all text-sm relative",
                    isActive
                      ? "bg-[var(--brand-teal)]/8 text-[var(--brand-teal)] font-medium border-l-2 border-l-[var(--brand-teal)] rounded-l-none"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 border-l-2 border-l-transparent"
                  )}
                  data-testid={`nav-${item.id}`}
                >
                  <Link href={item.href}>
                    <item.icon className={cn("w-4 h-4 flex-shrink-0", isActive && "drop-shadow-[0_0_4px_var(--brand-teal)]")} />
                    <span className="truncate">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant="outline"
                        className="text-[8px] px-1 py-0 h-3.5 font-mono bg-[var(--brand-teal)]/10 text-[var(--brand-teal)] border-[var(--brand-teal)]/30 ml-auto"
                      >
                        {item.badge}
                      </Badge>
                    )}
                    {!item.badge && item.shortcut && (
                      <span className="ml-auto text-[9px] font-mono text-sidebar-foreground/20 group-data-[collapsible=icon]:hidden">
                        {item.shortcut}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { user } = useAuth();
  const userData = user as { firstName?: string; email?: string } | null;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Logo */}
      <SidebarHeader className="px-3 py-3 border-b border-sidebar-border">
        <Link href="/home">
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

      <SidebarContent className="px-1.5 py-2 space-y-1">
        <NavGroup items={mainItems} />
        <NavGroup items={learnItems} label="Learn" />
      </SidebarContent>

      {/* Footer — settings + user */}
      <SidebarFooter className="px-2 py-2 border-t border-sidebar-border space-y-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Settings"
              className="gap-2.5 px-2.5 py-2 rounded-md text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            >
              <Link href="/settings">
                <Settings className="w-4 h-4" />
                <span className="truncate">Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {userData && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-sidebar-accent/20 group-data-[collapsible=icon]:justify-center">
            <div className="w-5 h-5 rounded-full bg-[var(--brand-teal)] flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-white">
                {(userData.firstName?.[0] || userData.email?.[0] || 'U').toUpperCase()}
              </span>
            </div>
            <span className="text-[10px] text-sidebar-foreground/50 truncate font-mono group-data-[collapsible=icon]:hidden">
              {userData.firstName || userData.email || 'User'}
            </span>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
