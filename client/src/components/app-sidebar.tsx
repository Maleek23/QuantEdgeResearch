import { 
  TrendingUp, BarChart2, Target, Shield, Settings, PanelLeftClose, PanelLeft, 
  Sun, Moon, Upload, BookOpen, Home, CreditCard, ExternalLink, User, 
  LineChart, GraduationCap, FileText, Database, LogOut, Sparkles, Bot, Zap
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
import quantEdgeLogoUrl from "@assets/image (1)_1761160822785.png";

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
  { title: "Auto-Lotto Bot", url: "/watchlist-bot", icon: Bot, badge: "New", badgeVariant: "secondary" },
];

const analysisItems: NavItem[] = [
  { title: "Chart Analysis", url: "/chart-analysis", icon: Upload, badge: "AI", badgeVariant: "secondary" },
  { title: "Futures", url: "/futures", icon: Zap, badge: "24h", badgeVariant: "secondary" },
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
    <div className="py-4 flex justify-center">
      <button 
        onClick={() => setLocation("/home")} 
        data-testid="nav-logo" 
        className="flex items-center justify-center cursor-pointer"
      >
        {isCollapsed ? (
          <img 
            src={quantEdgeLogoUrl} 
            alt="QuantEdge" 
            className="h-8 w-8 object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <img 
              src={quantEdgeLogoUrl} 
              alt="QuantEdge" 
              className="h-12 w-12 object-contain"
            />
            <div className="text-center">
              <div className="text-sm font-bold text-foreground">QuantEdge</div>
              <div className="text-[10px] text-cyan-400 tracking-wider font-medium">2 Engines. 1 Edge.</div>
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
  const { user, isAuthenticated, logout } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const handleNavigation = (url: string) => {
    setLocation(url);
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const isAdmin = !!(user as any)?.isAdmin;
  const userName = String((user as any)?.firstName || (user as any)?.email?.split('@')[0] || 'User');
  const userEmail = String((user as any)?.email || '');

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

      <SidebarFooter className="border-t border-sidebar-border/50 p-2 mt-auto">
        {isAuthenticated && user && (
          <div className="mb-2">
            {!isCollapsed ? (
              <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-sidebar-accent/30">
                <div className="h-8 w-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
                  <User className="h-4 w-4 text-cyan-400" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-medium truncate" data-testid="text-user-name">
                    {userName}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate" data-testid="text-user-email">
                    {userEmail}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="h-7 w-7 shrink-0"
                  data-testid="button-logout"
                >
                  <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="h-8 w-8"
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            )}
          </div>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleNavigation("/")}
          className="w-full justify-start gap-2 mb-2 text-muted-foreground hover:text-foreground"
          data-testid="nav-landing-page"
        >
          <ExternalLink className="h-4 w-4" />
          {!isCollapsed && <span>Back to Site</span>}
        </Button>
        
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SidebarToggleButton />
          </div>
          <ThemeToggleButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
