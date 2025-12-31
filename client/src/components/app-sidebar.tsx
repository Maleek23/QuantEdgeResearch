import { 
  TrendingUp, BarChart2, Target, Settings, PanelLeftClose, PanelLeft, 
  Sun, Moon, Upload, Home, 
  GraduationCap, FileText, Database, Bot, Zap, Shield
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
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme-provider";
import quantEdgeLogoUrl from "@assets/image (1)_1761160822785.png";

interface NavItem {
  title: string;
  url: string;
  icon: any;
}

const mainItems: NavItem[] = [
  { title: "Dashboard", url: "/home", icon: Home },
  { title: "Research Desk", url: "/trade-desk", icon: TrendingUp },
  { title: "Futures", url: "/futures", icon: Zap },
  { title: "Auto-Lotto Bot", url: "/watchlist-bot", icon: Bot },
];

const analysisItems: NavItem[] = [
  { title: "Chart Analysis", url: "/chart-analysis", icon: Upload },
  { title: "Performance", url: "/performance", icon: Target },
  { title: "Market Data", url: "/market", icon: BarChart2 },
  { title: "Chart Database", url: "/chart-database", icon: Database },
];

const resourceItems: NavItem[] = [
  { title: "Trading Rules", url: "/trading-rules", icon: Shield },
  { title: "Academy", url: "/academy", icon: GraduationCap },
  { title: "Blog", url: "/blog", icon: FileText },
];

const settingsItems: NavItem[] = [
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
        onClick={() => setLocation("/")} 
        data-testid="nav-logo" 
        className="flex items-center gap-3 cursor-pointer w-full"
      >
        <img 
          src={quantEdgeLogoUrl} 
          alt="QuantEdge" 
          className="h-8 w-8 object-contain flex-shrink-0" 
        />
        {!isCollapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground tracking-tight">QuantEdge</span>
            <span className="text-[10px] text-muted-foreground">Research Platform</span>
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
}: { 
  label: string; 
  items: NavItem[]; 
  location: string; 
  onNavigate: (url: string) => void;
}) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  if (items.length === 0) return null;

  return (
    <SidebarGroup className="py-2 px-2">
      {!isCollapsed && (
        <SidebarGroupLabel className="mb-1 px-2 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">
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
                  data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
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
        <NavSection 
          label="Research" 
          items={mainItems} 
          location={location} 
          onNavigate={handleNavigation}
        />
        
        <NavSection 
          label="Analysis" 
          items={analysisItems} 
          location={location} 
          onNavigate={handleNavigation}
        />
        
        <NavSection 
          label="Learn" 
          items={resourceItems} 
          location={location} 
          onNavigate={handleNavigation}
        />
        
        <NavSection 
          label="Account" 
          items={settingsItems} 
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
          <ThemeToggleButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
