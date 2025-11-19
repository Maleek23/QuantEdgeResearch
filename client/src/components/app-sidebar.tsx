import { TrendingUp, BarChart2, Target, Shield, Settings, PanelLeftClose, PanelLeft, Sparkles, Database, Award, GraduationCap, Newspaper, Sun, Moon } from "lucide-react";
import { Link, useLocation } from "wouter";
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
import { cn } from "@/lib/utils";

const tradingItems = [
  { title: "Trade Desk", url: "/trade-desk", icon: TrendingUp },
  { title: "Performance", url: "/performance", icon: Target },
];

const marketItems = [
  { title: "Market Intel", url: "/market", icon: BarChart2 },
];

const researchItems = [
  { title: "Chart Database", url: "/chart-database", icon: Database },
  { title: "Academy", url: "/academy", icon: GraduationCap },
  { title: "Blog", url: "/blog", icon: Newspaper },
];

const communityItems = [
  { title: "Success Stories", url: "/success-stories", icon: Award },
];

const systemItems = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Admin", url: "/admin", icon: Shield },
];

function SidebarHeaderContent() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <div className="px-3 py-4">
      <Link href="/" data-testid="nav-home" className="flex items-center justify-center">
        <div className="shrink-0 size-12 flex items-center justify-center">
          <img 
            src={quantEdgeLogoUrl} 
            alt="QuantEdge" 
            className="object-contain h-full w-full"
          />
        </div>
      </Link>
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
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();

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
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link 
                      href={item.url}
                      className="flex items-center gap-3 h-8"
                      data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
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
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link 
                      href={item.url}
                      className="flex items-center gap-3 h-8"
                      data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
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
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link 
                      href={item.url}
                      className="flex items-center gap-3 h-8"
                      data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Community Section */}
        <SidebarGroup className="py-1.5 px-3">
          <SidebarGroupLabel className="mb-0.5 px-0 text-xs">Community</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {communityItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link 
                      href={item.url}
                      className="flex items-center gap-3 h-8"
                      data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
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
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link 
                        href={item.url}
                        className="flex items-center gap-3 h-8"
                        data-testid={`nav-${item.title.toLowerCase().replace(/ /g, '-')}`}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
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
