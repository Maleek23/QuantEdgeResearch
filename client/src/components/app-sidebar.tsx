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

interface NavItem {
  title: string;
  url: string;
  icon: any;
  badge?: string;
}

// Trading - core trading tools
const tradingItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Trade Desk", url: "/trade-desk", icon: TrendingUp },
  { title: "My Watchlist", url: "/watchlist", icon: Eye },
];

// Automations - Trading bots + Market Scanner consolidated
const automationItems: NavItem[] = [
  { title: "Trading Bots", url: "/automations", icon: Zap, badge: "LIVE" },
];

// Analytics - performance and analysis tools (Data Audit is now part of Performance page)
const analyticsItems: NavItem[] = [
  { title: "Performance", url: "/performance", icon: Target },
  { title: "Historical Intel", url: "/historical-intelligence", icon: Brain, badge: "NEW" },
  { title: "Chart Analysis", url: "/chart-analysis", icon: Upload },
  { title: "Options Analyzer", url: "/options-analyzer", icon: Activity, badge: "NEW" },
];

// Learning resources - consolidated into Academy
const learnItems: NavItem[] = [
  { title: "Academy", url: "/academy", icon: BookOpen },
];

const accountItems: NavItem[] = [
  { title: "My Account", url: "/my-account", icon: User },
  { title: "Settings", url: "/settings", icon: Settings },
];

const adminItems: NavItem[] = [
  { title: "Admin", url: "/admin", icon: Shield },
];

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
  items: NavItem[]; 
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
            const isActive = location === item.url;
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton 
                  isActive={isActive}
                  onClick={() => onNavigate(item.url)}
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
                  <item.icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-cyan-500 dark:text-cyan-400' : ''}`} />
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

  const handleNavigation = (url: string) => {
    setLocation(url);
  };

  const isAdmin = !!(user as any)?.isAdmin;

  return (
    <Sidebar collapsible="icon" className="border-r border-border/40">
      <SidebarHeader className="border-b border-border/40">
        <SidebarHeaderContent />
      </SidebarHeader>
      
      <SidebarContent className="gap-0 py-2">
        {/* Trading - Trade Desk & Core Tools */}
        <NavSection 
          label="Trading" 
          items={tradingItems} 
          location={location} 
          onNavigate={handleNavigation}
        />
        
        {/* Automations */}
        <NavSection 
          label="Automations" 
          items={automationItems} 
          location={location} 
          onNavigate={handleNavigation}
        />
        
        <SidebarSeparator className="my-1 mx-4 opacity-30" />
        
        {/* Analytics */}
        <NavSection 
          label="Analytics" 
          items={analyticsItems} 
          location={location} 
          onNavigate={handleNavigation}
        />
        
        <SidebarSeparator className="my-1 mx-4 opacity-30" />
        
        {/* Learn - Academy hub */}
        <NavSection 
          label="Learn" 
          items={learnItems} 
          location={location} 
          onNavigate={handleNavigation}
        />
        
        {/* Account & Settings */}
        <NavSection 
          label="Account" 
          items={accountItems} 
          location={location} 
          onNavigate={handleNavigation}
        />
        
        {isAdmin && (
          <NavSection 
            label="Admin" 
            items={adminItems} 
            location={location} 
            onNavigate={handleNavigation}
          />
        )}
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
