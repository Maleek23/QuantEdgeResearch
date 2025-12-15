import { TrendingUp, BarChart2, Target, Shield, Settings, PanelLeftClose, PanelLeft, Sun, Moon, Upload, Eye, Sparkles } from "lucide-react";
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
import { QuantEdgeLogo } from "@/components/quantedge-logo";
import { cn } from "@/lib/utils";

const tradingItems = [
  { title: "Trade Desk", url: "/trade-desk", icon: TrendingUp },
  { title: "Generate Ideas", url: "/trade-desk", icon: Sparkles },
];

const marketItems = [
  { title: "Overview", url: "/market", icon: BarChart2 },
  { title: "Watchlist", url: "/market", icon: Eye },
];

const researchItems = [
  { title: "Performance", url: "/performance", icon: Target },
  { title: "Chart Analysis", url: "/chart-analysis", icon: Upload },
];

const systemItems = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Admin", url: "/admin", icon: Shield },
];

function SidebarHeaderContent() {
  const { state } = useSidebar();
  const [, setLocation] = useLocation();
  const isCollapsed = state === "collapsed";

  return (
    <div className="px-3 py-4">
      <button 
        onClick={() => setLocation("/")} 
        data-testid="nav-home" 
        className="flex items-center justify-center w-full cursor-pointer"
      >
        <QuantEdgeLogo 
          collapsed={isCollapsed} 
          size={isCollapsed ? "md" : "md"}
        />
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
        {/* Trading Section */}
        <SidebarGroup className="py-1.5 px-3">
          <SidebarGroupLabel className="mb-0.5 px-0 text-xs">Trading</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {tradingItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    isActive={location === item.url}
                    onClick={() => handleNavigation(item.url)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Market Section */}
        <SidebarGroup className="py-1.5 px-3">
          <SidebarGroupLabel className="mb-0.5 px-0 text-xs">Market</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {marketItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    isActive={location === item.url}
                    onClick={() => handleNavigation(item.url)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Research Section */}
        <SidebarGroup className="py-1.5 px-3">
          <SidebarGroupLabel className="mb-0.5 px-0 text-xs">Research</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {researchItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    isActive={location === item.url}
                    onClick={() => handleNavigation(item.url)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
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
        <SidebarGroup className="py-1.5 px-3">
          <SidebarGroupLabel className="mb-0.5 px-0 text-xs">System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {systemItems.map((item) => {
                // Hide Admin link unless user has admin role
                if (item.title === "Admin" && !(user as any)?.isAdmin) {
                  return null;
                }
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      isActive={location === item.url}
                      onClick={() => handleNavigation(item.url)}
                      data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
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
