import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, BarChart2, Target, Settings, PanelLeftClose, PanelLeft, 
  Sun, Moon, Home, BookOpen, Zap, Shield, ExternalLink,
  Upload, Database, LineChart, User, FileBarChart, Lock, LayoutDashboard, Eye, Brain, Activity
} from "lucide-react";
import { useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme-provider";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import type { NavigationLayoutType, NavigationGroupType, NavigationItemType } from "@shared/schema";

interface NavItem {
  title: string;
  url: string;
  icon: any;
  badge?: string;
  adminOnly?: boolean;
}

const iconMap: Record<string, any> = {
  Activity,
  TrendingUp,
  Eye,
  Target,
  Upload,
  BarChart2,
  Brain,
  BookOpen,
  Settings,
  Shield,
  Home,
  Database,
  LineChart,
  User,
  FileBarChart,
  LayoutDashboard,
  Zap,
};

const defaultNavItems: NavigationItemType[] = [
  { id: "home", title: "Home", icon: "Home", href: "/" },
  { id: "strategy-playbooks", title: "Strategy Playbooks", icon: "Zap", href: "/strategy-playbooks", badge: "NEW" },
  { id: "command-center", title: "Command Center", icon: "Activity", href: "/trading-engine", badge: "LIVE" },
  { id: "trade-desk", title: "Trade Desk", icon: "TrendingUp", href: "/trade-desk" },
  { id: "watchlist", title: "Watchlist", icon: "Eye", href: "/watchlist" },
  { id: "performance", title: "Performance", icon: "Target", href: "/performance" },
  { id: "chart-analysis", title: "Chart Analysis", icon: "Upload", href: "/chart-analysis" },
  { id: "options", title: "Options", icon: "BarChart2", href: "/options-analyzer" },
  { id: "trends", title: "Trends", icon: "TrendingUp", href: "/bullish-trends" },
  { id: "historical", title: "Historical", icon: "Brain", href: "/historical-intelligence" },
  { id: "academy", title: "Academy", icon: "BookOpen", href: "/academy" },
  { id: "blog", title: "Blog", icon: "BookOpen", href: "/blog" },
  { id: "settings", title: "Settings", icon: "Settings", href: "/settings" },
  { id: "admin", title: "Admin", icon: "Shield", href: "/admin", adminOnly: true },
];

const defaultLayout: NavigationLayoutType = {
  version: 1,
  groups: [
    {
      id: "trading",
      title: "Trading",
      items: defaultNavItems.filter(i => ["home", "strategy-playbooks", "command-center", "trade-desk", "watchlist"].includes(i.id)),
    },
    {
      id: "analytics",
      title: "Analytics",
      items: defaultNavItems.filter(i => ["performance", "chart-analysis", "options", "trends", "historical"].includes(i.id)),
    },
    {
      id: "learn",
      title: "Learn",
      items: defaultNavItems.filter(i => ["academy", "blog"].includes(i.id)),
    },
    {
      id: "account",
      title: "Account",
      items: defaultNavItems.filter(i => ["settings"].includes(i.id)),
    },
  ],
};


function SidebarHeaderContent() {
  const [, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <div className="py-4 px-2">
      <button 
        onClick={() => setLocation("/trade-desk")} 
        data-testid="nav-logo" 
        className="flex items-center gap-3 cursor-pointer w-full"
      >
        <img 
          src={quantEdgeLabsLogoUrl} 
          alt="Quant Edge Labs" 
          className="h-8 w-8 object-contain flex-shrink-0" 
        />
        {!isCollapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground tracking-tight">Quant Edge</span>
            <span className="text-[10px] text-muted-foreground">Labs</span>
          </div>
        )}
      </button>
    </div>
  );
}

function SidebarToggleButton() {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleSidebar}
      className="h-8 w-8"
      data-testid="button-toggle-sidebar"
    >
      {isCollapsed ? (
        <PanelLeft className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </Button>
  );
}

function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      data-testid="button-theme-toggle-sidebar"
      className="h-8 w-8"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

function NavSection({ 
  label, 
  items, 
  location, 
  onNavigate,
  showLabel = true,
}: { 
  label: string; 
  items: NavigationItemType[]; 
  location: string; 
  onNavigate: (url: string) => void;
  showLabel?: boolean;
}) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  if (items.length === 0) return null;

  return (
    <SidebarGroup className="py-1.5 px-2">
      {!isCollapsed && showLabel && (
        <SidebarGroupLabel className="mb-1 px-2 text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {items.map((item) => {
            const isActive = location === item.href;
            const IconComponent = iconMap[item.icon] || Activity;
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton 
                  isActive={isActive}
                  onClick={() => onNavigate(item.href)}
                  data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-').replace(/&/g, '')}`}
                  tooltip={item.title}
                  className={`
                    h-9 px-2 rounded-md transition-colors
                    ${isActive 
                      ? 'bg-cyan-500/10 text-cyan-500 dark:text-cyan-400' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }
                  `}
                >
                  <IconComponent className={`h-4 w-4 shrink-0 ${isActive ? 'text-cyan-500 dark:text-cyan-400' : ''}`} />
                  {!isCollapsed && (
                    <span className="flex-1 truncate text-sm">{item.title}</span>
                  )}
                  {!isCollapsed && item.badge && (
                    <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 dark:text-emerald-400">
                      {item.badge}
                    </span>
                  )}
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
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const { data: savedLayout } = useQuery<NavigationLayoutType>({
    queryKey: ['/api/navigation-layout'],
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const handleNavigation = useCallback((url: string) => {
    setLocation(url);
  }, [setLocation]);

  const isAdmin = !!(user as any)?.isAdmin;

  const navigationGroups = useMemo(() => {
    const layout = savedLayout || defaultLayout;
    
    const hydrateItem = (item: NavigationItemType): NavigationItemType => {
      const defaultItem = defaultNavItems.find(d => d.id === item.id);
      if (defaultItem) {
        return { ...defaultItem, ...item, icon: defaultItem.icon };
      }
      return item;
    };
    
    const allSavedItemIds = new Set<string>();
    const allSavedGroupIds = new Set<string>();
    layout.groups.forEach(group => {
      allSavedGroupIds.add(group.id);
      group.items.forEach(item => allSavedItemIds.add(item.id));
    });
    
    const groups = layout.groups.map(group => ({
      ...group,
      items: group.items
        .map(hydrateItem)
        .filter(item => !item.adminOnly || isAdmin),
    })).filter(group => group.items.length > 0);
    
    defaultLayout.groups.forEach(defaultGroup => {
      if (!allSavedGroupIds.has(defaultGroup.id)) {
        const groupItems = defaultGroup.items
          .filter(item => !allSavedItemIds.has(item.id))
          .filter(item => !item.adminOnly || isAdmin);
        if (groupItems.length > 0) {
          groups.push({ ...defaultGroup, items: groupItems });
          groupItems.forEach(item => allSavedItemIds.add(item.id));
        }
      }
    });
    
    const missingDefaultItems = defaultNavItems.filter(
      item => !allSavedItemIds.has(item.id) && (!item.adminOnly || isAdmin)
    );
    if (missingDefaultItems.length > 0 && groups.length > 0) {
      groups[groups.length - 1].items.push(...missingDefaultItems);
    }
    
    const hasAdminItems = groups.some(g => g.items.some(i => i.adminOnly));
    if (isAdmin && !hasAdminItems) {
      const adminItems = defaultNavItems.filter(i => i.adminOnly);
      if (adminItems.length > 0) {
        groups.push({
          id: "admin-group",
          title: "Admin",
          items: adminItems,
        });
      }
    }
    
    return groups;
  }, [savedLayout, isAdmin]);

  return (
    <Sidebar collapsible="icon" className="border-r border-border/40">
      <SidebarHeader className="border-b border-border/40">
        <SidebarHeaderContent />
      </SidebarHeader>
      
      <SidebarContent className="gap-0 py-2">
        {navigationGroups.map((group, index) => (
          <div key={group.id}>
            {index > 0 && <SidebarSeparator className="my-1 mx-4 opacity-30" />}
            <NavSection 
              label={group.title} 
              items={group.items} 
              location={location} 
              onNavigate={handleNavigation}
            />
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 p-2 mt-auto">
        <div className={`flex items-center ${isCollapsed ? 'flex-col gap-1' : 'justify-between'}`}>
          <SidebarToggleButton />
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleNavigation("/landing")}
              className="h-8 w-8"
              data-testid="button-landing-page"
              title="View Landing Page"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <ThemeToggleButton />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
