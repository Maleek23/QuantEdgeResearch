import { TrendingUp, BarChart2, Target, Shield, Settings, PanelLeftClose, PanelLeft, Sun, Moon, Upload, BookOpen, Home, CreditCard, ExternalLink, User, Activity, DollarSign, Wallet, MessageSquare } from "lucide-react";
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
import { cn } from "@/lib/utils";
import quantEdgeLogoUrl from "@assets/image (1)_1761160822785.png";

// Simplified navigation - just the essentials
const mainItems = [
  { title: "Home", url: "/home", icon: Home },
  { title: "Trade Desk", url: "/trade-desk", icon: TrendingUp },
  { title: "Live Trading", url: "/live-trading", icon: Activity },
  // Hidden for now - Paper Trading, Wallet Tracker, CT Tracker
  // { title: "Paper Trading", url: "/paper-trading", icon: DollarSign },
  // { title: "Wallet Tracker", url: "/wallet-tracker", icon: Wallet },
  // { title: "CT Tracker", url: "/ct-tracker", icon: MessageSquare },
  { title: "Trading Rules", url: "/trading-rules", icon: BookOpen },
];

const moreItems = [
  { title: "Performance", url: "/performance", icon: Target },
  { title: "Market", url: "/market", icon: BarChart2 },
  { title: "Chart Analysis", url: "/chart-analysis", icon: Upload },
];

const systemItems = [
  { title: "Pricing", url: "/pricing", icon: CreditCard },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Admin", url: "/admin", icon: Shield },
];

function SidebarHeaderContent() {
  const [, setLocation] = useLocation();

  return (
    <div className="py-4 flex justify-center">
      <button 
        onClick={() => setLocation("/home")} 
        data-testid="nav-logo" 
        className="flex items-center justify-center cursor-pointer"
      >
        {/* Collapsed state - just logo */}
        <img 
          src={quantEdgeLogoUrl} 
          alt="QuantEdge" 
          className="h-8 w-8 object-contain group-data-[collapsible=icon]:block hidden"
        />
        {/* Expanded state - logo with text */}
        <div className="flex flex-col items-center gap-1 group-data-[collapsible=icon]:hidden">
          <img 
            src={quantEdgeLogoUrl} 
            alt="QuantEdge" 
            className="h-14 w-14 object-contain"
          />
          <div className="text-center">
            <div className="text-sm font-bold text-foreground">QuantEdge</div>
            <div className="text-[10px] text-muted-foreground tracking-wider">RESEARCH</div>
          </div>
        </div>
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
      className="w-full justify-start gap-2 group-data-[collapsible=icon]:justify-center"
      data-testid="button-toggle-sidebar"
    >
      <PanelLeftClose className="h-4 w-4 group-data-[collapsible=icon]:hidden" />
      <PanelLeft className="h-4 w-4 hidden group-data-[collapsible=icon]:block" />
      <span className="group-data-[collapsible=icon]:hidden">Collapse</span>
    </Button>
  );
}

function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();
  const { state } = useSidebar();

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

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();

  const handleNavigation = (url: string) => {
    setLocation(url);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarHeaderContent />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      
      <SidebarContent className="gap-0 py-2">
        {/* Main Section - Core navigation */}
        <SidebarGroup className="py-1.5 px-3 group-data-[collapsible=icon]:px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    isActive={location === item.url}
                    onClick={() => handleNavigation(item.url)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
                    tooltip={item.title}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* More Section - Additional tools */}
        <SidebarGroup className="py-1.5 px-3 group-data-[collapsible=icon]:px-2">
          <SidebarGroupLabel className="mb-0.5 px-0 text-xs group-data-[collapsible=icon]:hidden">More</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {moreItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    isActive={location === item.url}
                    onClick={() => handleNavigation(item.url)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
                    tooltip={item.title}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* System Section */}
        <SidebarGroup className="py-1.5 px-3 group-data-[collapsible=icon]:px-2">
          <SidebarGroupLabel className="mb-0.5 px-0 text-xs group-data-[collapsible=icon]:hidden">System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {systemItems.map((item) => {
                // Only show Admin link to the owner account (set via ADMIN_EMAIL env var on backend)
                if (item.title === "Admin" && !(user as any)?.isAdmin) {
                  return null;
                }
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      isActive={location === item.url}
                      onClick={() => handleNavigation(item.url)}
                      data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
                      tooltip={item.title}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/50 p-2 mt-auto">
        {/* User Account Display */}
        {isAuthenticated && user && (
          <div className="flex items-center gap-2 px-2 py-1.5 mb-2 rounded-md bg-sidebar-accent/30 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="text-xs font-medium truncate" data-testid="text-user-name">
                {String((user as any)?.firstName || (user as any)?.email?.split('@')[0] || 'User')}
              </span>
              <span className="text-[10px] text-muted-foreground truncate" data-testid="text-user-email">
                {String((user as any)?.email || '')}
              </span>
            </div>
          </div>
        )}
        
        {/* Back to Landing Page Link */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleNavigation("/")}
          className="w-full justify-start gap-2 mb-2 text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:justify-center"
          data-testid="nav-landing-page"
        >
          <ExternalLink className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Back to Site</span>
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
