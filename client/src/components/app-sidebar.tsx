import { 
  TrendingUp, BarChart2, Target, Shield, Settings, PanelLeftClose, PanelLeft, 
  Sun, Moon, Upload, Home, CreditCard, 
  GraduationCap, FileText, Database, Bot, Zap
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
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme-provider";

interface NavItem {
  title: string;
  url: string;
  icon: any;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
}

const tradingToolsItems: NavItem[] = [
  { title: "Dashboard", url: "/home", icon: Home },
  { title: "Research Desk", url: "/trade-desk", icon: TrendingUp, badge: "Popular", badgeVariant: "default" },
  { title: "Research Desk (Futures)", url: "/futures", icon: Zap, badge: "24h", badgeVariant: "secondary" },
  { title: "Auto-Lotto Bot", url: "/watchlist-bot", icon: Bot, badge: "New", badgeVariant: "secondary" },
];

const analysisItems: NavItem[] = [
  { title: "Chart Analysis", url: "/chart-analysis", icon: Upload, badge: "AI", badgeVariant: "secondary" },
  { title: "Performance", url: "/performance", icon: Target },
  { title: "Market Data", url: "/market", icon: BarChart2 },
  { title: "Chart Database", url: "/chart-database", icon: Database },
];

const learningItems: NavItem[] = [
  { title: "Trading Rules", url: "/trading-rules", icon: Shield },
  { title: "Academy", url: "/academy", icon: GraduationCap },
  { title: "Blog", url: "/blog", icon: FileText },
];

const accountItems: NavItem[] = [
  { title: "Pricing", url: "/pricing", icon: CreditCard },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Admin", url: "/admin", icon: Shield, badge: "Admin" },
];

function SidebarHeaderContent() {
  const [, setLocation] = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <div className="py-3 flex justify-center">
      <button 
        onClick={() => setLocation("/home")} 
        data-testid="nav-logo" 
        className="flex items-center justify-center cursor-pointer"
      >
        {isCollapsed ? (
          <div className="h-7 w-7 rounded bg-cyan-500 flex items-center justify-center">
            <span className="text-xs font-bold text-black">QE</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-cyan-500 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-black">QE</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">QuantEdge</div>
              <div className="text-[9px] font-mono text-cyan-400 tracking-wider">MULTIPLE ENGINES • ONE EDGE</div>
            </div>
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
      size="sm"
      onClick={toggleSidebar}
      className="w-full justify-start gap-2"
      data-testid="button-toggle-sidebar"
    >
      {isCollapsed ? (
        <PanelLeft className="h-4 w-4" />
      ) : (
        <>
          <PanelLeftClose className="h-4 w-4" />
          <span>Collapse</span>
        </>
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
      className="shrink-0"
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
  showAdminOnly = false,
  isAdmin = false
}: { 
  label: string; 
  items: NavItem[]; 
  location: string; 
  onNavigate: (url: string) => void;
  showAdminOnly?: boolean;
  isAdmin?: boolean;
}) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  
  const filteredItems = items.filter(item => {
    if (item.badge === "Admin") {
      return isAdmin;
    }
    return true;
  });

  if (filteredItems.length === 0) return null;

  return (
    <SidebarGroup className="py-2 px-3">
      {!isCollapsed && (
        <SidebarGroupLabel className="mb-1 px-0 text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {filteredItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton 
                isActive={location === item.url}
                onClick={() => onNavigate(item.url)}
                data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
                tooltip={item.title}
                className="group/item"
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && (
                  <span className="flex-1 truncate">{item.title}</span>
                )}
                {!isCollapsed && item.badge && (
                  <Badge 
                    variant={item.badgeVariant || "secondary"} 
                    className="text-[10px] px-1.5 py-0 h-4 font-medium"
                  >
                    {item.badge}
                  </Badge>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
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
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarHeaderContent />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      
      <SidebarContent className="gap-0 py-1">
        <NavSection 
          label="Trading Tools" 
          items={tradingToolsItems} 
          location={location} 
          onNavigate={handleNavigation}
        />
        
        <NavSection 
          label="Analysis & Research" 
          items={analysisItems} 
          location={location} 
          onNavigate={handleNavigation}
        />
        
        <NavSection 
          label="Learning" 
          items={learningItems} 
          location={location} 
          onNavigate={handleNavigation}
        />
        
        <NavSection 
          label="Account" 
          items={accountItems} 
          location={location} 
          onNavigate={handleNavigation}
          isAdmin={isAdmin}
        />
      </SidebarContent>

      <SidebarFooter className="border-t border-slate-800/50 p-2 mt-auto">
        <div className="flex items-center gap-1">
          <SidebarToggleButton />
          <ThemeToggleButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
