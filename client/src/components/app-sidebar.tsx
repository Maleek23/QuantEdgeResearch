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
    href: "/" 
  },
  { 
    id: "discover", 
    title: "Discover", 
    icon: Compass, 
    href: "/discover",
    badge: "NEW"
  },
  { 
    id: "research", 
    title: "Research", 
    icon: Search, 
    href: "/research" 
  },
  { 
    id: "watchlist", 
    title: "Watchlist", 
    icon: Eye, 
    href: "/watchlist" 
  },
  { 
    id: "market-movers", 
    title: "Market Movers", 
    icon: TrendingUp, 
    href: "/market-movers" 
  },
  { 
    id: "ai-stock-picker", 
    title: "AI Stock Picker", 
    icon: Sparkles, 
    href: "/ai-stock-picker",
    badge: "NEW"
  },
  { 
    id: "smart-signals", 
    title: "Smart Signals", 
    icon: Zap, 
    href: "/smart-signals" 
  },
  { 
    id: "smart-money", 
    title: "Smart Money", 
    icon: Briefcase, 
    href: "/smart-money" 
  },
  { 
    id: "portfolio", 
    title: "Portfolio Toolbox", 
    icon: PieChart, 
    href: "/portfolio" 
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
    <Sidebar className="border-r border-slate-800/50 bg-slate-950">
      <SidebarHeader className="p-4 border-b border-slate-800/50">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">Q</span>
            </div>
            <span className="font-semibold text-slate-100 group-hover:text-white transition-colors">
              Quant Edge
            </span>
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
                          ? "bg-cyan-500/10 text-cyan-400" 
                          : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
                      )}
                      data-testid={`nav-${item.id}`}
                    >
                      <Link href={item.href}>
                        <item.icon className="w-[18px] h-[18px]" />
                        <span className="flex-1 text-sm font-medium">{item.title}</span>
                        {item.badge && (
                          <Badge 
                            variant="outline" 
                            className="text-[10px] px-1.5 py-0 h-4 bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
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
                      ? "bg-slate-800/50 text-slate-100" 
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50"
                  )}
                  data-testid="nav-history"
                >
                  <Clock className="w-[18px] h-[18px]" />
                  <span className="flex-1 text-sm font-medium">History</span>
                  {historyOpen ? (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  )}
                </SidebarMenuButton>
                
                {historyOpen && (
                  <SidebarMenuSub className="mt-1 ml-6 border-l border-slate-800 pl-3">
                    {historyItems.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.href}>
                        <SidebarMenuSubButton
                          asChild
                          className={cn(
                            "px-3 py-2 rounded-md text-sm transition-all",
                            location === subItem.href
                              ? "text-cyan-400"
                              : "text-slate-500 hover:text-slate-300"
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

      <SidebarFooter className="p-4 border-t border-slate-800/50">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
          asChild
        >
          <Link href="/upgrade">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Upgrade</span>
            <ArrowUpRight className="w-3 h-3 ml-auto" />
          </Link>
        </Button>
        
        <div className="mt-3 flex items-center gap-2 px-2 py-2 rounded-lg bg-slate-900/50">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
            <Mail className="w-3 h-3 text-white" />
          </div>
          <span className="text-xs text-slate-400 truncate flex-1">
            user@email.com
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
