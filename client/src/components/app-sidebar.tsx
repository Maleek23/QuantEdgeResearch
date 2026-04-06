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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Home,
  Compass,
  Search,
  Eye,
  TrendingUp,
  Sparkles,
  Zap,
  Briefcase,
  PieChart,
  Clock,
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Mail,
  HelpCircle,
  Bell,
} from "lucide-react";
import { useState } from "react";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";

interface NavItem {
  id: string;
  title: string;
  icon: any;
  href: string;
  badge?: string;
  children?: { title: string; href: string }[];
}

const navItems: NavItem[] = [
  {
    id: "home",
    title: "Home",
    icon: Home,
    href: "/home"
  },
  {
    id: "trade-desk",
    title: "Trade Desk",
    icon: Sparkles,
    href: "/trade-desk",
    badge: "AI"
  },
  {
    id: "market",
    title: "Markets",
    icon: TrendingUp,
    href: "/market"
  },
  {
    id: "charts",
    title: "Charts",
    icon: FileText,
    href: "/chart-analysis"
  },
  {
    id: "flow",
    title: "Flow Edge",
    icon: Zap,
    href: "/flow"
  },
  {
    id: "smart-money",
    title: "Smart Money",
    icon: Briefcase,
    href: "/smart-money"
  },
  {
    id: "watchlist",
    title: "Watchlist",
    icon: Eye,
    href: "/watchlist"
  },
  {
    id: "performance",
    title: "Performance",
    icon: PieChart,
    href: "/performance"
  },
];

const historyItems = [
  { title: "Chat History", href: "/history/chat", icon: MessageSquare },
  { title: "Research History", href: "/history/research", icon: FileText },
];

export function AppSidebar() {
  const [location] = useLocation();
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <Link href="/">
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-7 w-7 object-contain" />
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold text-sidebar-foreground tracking-tight">
                QuantEdge
              </span>
              <span className="text-[9px] font-medium text-sidebar-foreground/50 tracking-[0.15em] uppercase">
                Labs
              </span>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.href || 
                  (item.href !== "/" && location.startsWith(item.href));
                
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "w-full justify-start gap-3 px-3 py-2.5 rounded-lg transition-all",
                        isActive 
                          ? "bg-[var(--brand-cyan)]/10 text-[var(--brand-cyan)]" 
                          : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                      )}
                      data-testid={`nav-${item.id}`}
                    >
                      <Link href={item.href}>
                        <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                        <span className="flex-1 text-sm font-medium truncate">{item.title}</span>
                        {item.badge && (
                          <Badge 
                            variant="outline" 
                            className="text-[10px] px-1.5 py-0 h-4 bg-[var(--brand-cyan)]/10 text-[var(--brand-cyan)] border-[var(--brand-cyan)]/30"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* History with submenu */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setHistoryOpen(!historyOpen)}
                  className={cn(
                    "w-full justify-start gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer",
                    historyOpen || location.startsWith("/history")
                      ? "bg-sidebar-accent/50 text-sidebar-foreground" 
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                  data-testid="nav-history"
                >
                  <Clock className="w-[18px] h-[18px]" />
                  <span className="flex-1 text-sm font-medium">History</span>
                  {historyOpen ? (
                    <ChevronDown className="w-4 h-4 text-sidebar-foreground/50" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-sidebar-foreground/50" />
                  )}
                </SidebarMenuButton>
                
                {historyOpen && (
                  <SidebarMenuSub className="mt-1 ml-6 border-l border-sidebar-border pl-3">
                    {historyItems.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.href}>
                        <SidebarMenuSubButton
                          asChild
                          className={cn(
                            "px-3 py-2 rounded-md text-sm transition-all",
                            location === subItem.href
                              ? "text-[var(--brand-cyan)]"
                              : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
                          )}
                        >
                          <Link href={subItem.href}>
                            <subItem.icon className="w-4 h-4 mr-2" />
                            {subItem.title}
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-sidebar-border text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          asChild
        >
          <Link href="/upgrade">
            <Sparkles className="w-4 h-4 text-[var(--trade-neutral)]" />
            <span>Upgrade</span>
            <ArrowUpRight className="w-3 h-3 ml-auto" />
          </Link>
        </Button>
        
        <div className="mt-3 flex items-center gap-2 px-2 py-2 rounded-lg bg-sidebar-accent/30">
          <div className="w-6 h-6 rounded-full bg-[var(--brand-teal)]/15 flex items-center justify-center flex-shrink-0">
            <Mail className="w-3 h-3 text-[var(--brand-teal)]" />
          </div>
          <span className="text-xs text-sidebar-foreground/60 truncate flex-1 min-w-0">
            user@email.com
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
