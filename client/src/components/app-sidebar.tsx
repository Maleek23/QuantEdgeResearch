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
import { Badge } from "@/components/ui/badge";
import {
  Home,
  Star,
  Trophy,
  GraduationCap,
  BookOpen,
  Settings,
  Search,
  Activity,
  Bot,
  Flame,
  BarChart3,
  Grid3X3,
  Columns3,
  Calculator,
  Flag,
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

interface NavSection {
  id: string;
  label: string;
  icon: any;
  items: NavItem[];
}

// ────────────────────────────────────────────────────────────────────
// Branded sections with tree-line architecture.
// Each section has an icon + name, sub-items connect via tree lines.
// ────────────────────────────────────────────────────────────────────

const sections: NavSection[] = [
  {
    id: "home",
    label: "HOME",
    icon: Home,
    items: [
      { id: "dashboard", title: "Dashboard", icon: Home, href: "/home", shortcut: "G H" },
    ],
  },
  {
    id: "alphalab",
    label: "ALPHA LAB",
    icon: Flame,
    items: [
      { id: "trade-desk", title: "Trade Desk", icon: Flame, href: "/trade-desk", badge: "AI" },
      { id: "scanner", title: "Scanner", icon: Search, href: "/market-scanner", shortcut: "G S" },
      { id: "bull-flag", title: "Bull Flag", icon: Flag, href: "/market-scanner?tab=bull-flag", badge: "NEW" },
      { id: "options-analyzer", title: "Options Analyzer", icon: Calculator, href: "/options-analyzer" },
      { id: "watchlist", title: "Watchlist", icon: Star, href: "/watchlist", shortcut: "G W" },
      { id: "olalgo", title: "OlAlgo Bot", icon: Bot, href: "/olalgo", badge: "BOT" },
    ],
  },
  {
    id: "quantseeker",
    label: "QUANT SEEKER",
    icon: Activity,
    items: [
      { id: "gex-hub", title: "GEX Hub", icon: Activity, href: "/flow", shortcut: "G F" },
      { id: "terminal", title: "Terminal", icon: BarChart3, href: "/terminal/SPY", shortcut: "G T" },
      { id: "exp-index", title: "Index Mode", icon: Columns3, href: "/terminal/trinity" },
      { id: "flow-feed", title: "Options Flow", icon: Activity, href: "/flow?tab=flow" },
    ],
  },
  {
    id: "proof",
    label: "PROOF",
    icon: Trophy,
    items: [
      { id: "performance", title: "Performance", icon: Trophy, href: "/performance", shortcut: "G P" },
      { id: "trade-journal", title: "Trade Journal", icon: BookOpen, href: "/trade-journal", shortcut: "G J" },
    ],
  },
  {
    id: "academy",
    label: "ACADEMY",
    icon: GraduationCap,
    items: [
      { id: "academy-learn", title: "Learn", icon: GraduationCap, href: "/academy" },
      { id: "blog", title: "Blog", icon: BookOpen, href: "/blog" },
    ],
  },
];

function TreeNavSection({ section }: { section: NavSection }) {
  const [location] = useLocation();
  const SectionIcon = section.icon;

  return (
    <SidebarGroup className="py-1">
      {/* Section header with icon */}
      <div className="flex items-center gap-2 px-3 py-1.5 group-data-[collapsible=icon]:justify-center">
        <SectionIcon className="w-3.5 h-3.5 text-sidebar-foreground/25 shrink-0" />
        <span className="text-[9px] font-mono font-bold uppercase tracking-[0.14em] text-sidebar-foreground/35 group-data-[collapsible=icon]:hidden">
          {section.label}
        </span>
      </div>

      <SidebarGroupContent>
        <SidebarMenu>
          {section.items.map((item, idx) => {
            const isActive = location === item.href ||
              (item.href !== "/home" && location.startsWith(item.href));
            const isLast = idx === section.items.length - 1;

            return (
              <SidebarMenuItem key={item.id} className="relative">
                {/* Tree line connector — vertical + horizontal */}
                <div className="absolute left-[18px] top-0 bottom-0 group-data-[collapsible=icon]:hidden pointer-events-none" aria-hidden>
                  {/* Vertical line */}
                  {!isLast && (
                    <div className="absolute left-0 top-0 bottom-0 w-px bg-sidebar-foreground/20" />
                  )}
                  {/* Vertical line (only to midpoint for last item) */}
                  {isLast && (
                    <div className="absolute left-0 top-0 h-1/2 w-px bg-sidebar-foreground/20" />
                  )}
                  {/* Horizontal branch */}
                  <div className="absolute left-0 top-1/2 w-3 h-px bg-sidebar-foreground/20" />
                </div>

                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isActive}
                  className={cn(
                    "gap-2 pl-8 pr-2.5 py-1.5 rounded-md transition-all text-[13px] relative group-data-[collapsible=icon]:pl-2.5",
                    isActive
                      ? "bg-[var(--brand-teal)]/8 text-[var(--brand-teal)] font-medium"
                      : "text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                  )}
                  data-testid={`nav-${item.id}`}
                >
                  <Link href={item.href}>
                    <span className="truncate">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant="outline"
                        className="text-[7px] px-1 py-0 h-3.5 font-mono bg-[var(--brand-teal)]/10 text-[var(--brand-teal)] border-[var(--brand-teal)]/30 ml-auto"
                      >
                        {item.badge}
                      </Badge>
                    )}
                    {!item.badge && item.shortcut && (
                      <span className="ml-auto text-[9px] font-mono text-sidebar-foreground/15 group-data-[collapsible=icon]:hidden">
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

      <SidebarContent className="px-1.5 py-1 space-y-0">
        {sections.map(section => (
          <TreeNavSection key={section.id} section={section} />
        ))}
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
