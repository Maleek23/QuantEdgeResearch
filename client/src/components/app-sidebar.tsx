import { Home, TrendingUp, BarChart2, Star, Calculator, Target, User, Sparkles, Shield, BookOpen, Settings, Sparkle, PanelLeftClose, PanelLeft, Lightbulb } from "lucide-react";
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
import quantEdgeLogoUrl from "@assets/image (1)_1761160822785.png";
import { cn } from "@/lib/utils";

const researchItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Trade Ideas", url: "/trade-ideas", icon: TrendingUp },
  { title: "Market", url: "/market", icon: BarChart2 },
  { title: "Watchlist", url: "/watchlist", icon: Star },
  { title: "Insights", url: "/insights", icon: Lightbulb },
];

const toolItems = [
  { title: "Performance", url: "/performance", icon: Target },
  { title: "Signal Intelligence", url: "/signals", icon: Sparkles },
  { title: "Quant Analytics", url: "/analytics", icon: BarChart2 },
  { title: "Holographic View", url: "/holographic", icon: Sparkle },
  { title: "Risk Calculator", url: "/risk", icon: Calculator },
  { title: "Quant Learning", url: "/learning", icon: BookOpen },
];

const systemItems = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "About", url: "/about", icon: User },
  { title: "Learn More", url: "/learn-more", icon: BookOpen },
  { title: "Admin", url: "/admin", icon: Shield },
];

function SidebarHeaderContent() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <SidebarMenuButton asChild className="h-auto items-center px-3 py-4">
      <Link href="/" data-testid="nav-home" className="relative">
        {/* Single persistent structure - no conditional branches */}
        <div className={cn(
          "flex w-full relative transition-all duration-300",
          isCollapsed ? "flex-col items-center gap-3" : "flex-row items-center"
        )}>
          {/* Logo - transitions between horizontal and vertical layouts */}
          <div className={cn(
            "relative transition-all duration-300 ease-out rounded-lg",
            isCollapsed ? "p-3" : "p-0"
          )}
          style={{
            background: isCollapsed ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
            boxShadow: isCollapsed ? '0 0 20px rgba(59, 130, 246, 0.15), inset 0 0 12px rgba(59, 130, 246, 0.05)' : 'none',
          }}
          >
            <img 
              src={quantEdgeLogoUrl} 
              alt="QuantEdge" 
              className={cn(
                "object-contain transition-all duration-300",
                isCollapsed ? "h-20 w-20" : "h-24 w-24"
              )}
              style={{
                filter: isCollapsed ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))' : 'none',
                opacity: isCollapsed ? 0.95 : 1
              }}
            />
          </div>
          
        </div>
      </Link>
    </SidebarMenuButton>
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

export function AppSidebar() {
  const [location] = useLocation();

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

        {/* Tools Section */}
        <SidebarGroup className="py-1.5 px-3">
          <SidebarGroupLabel className="mb-0.5 px-0 text-xs">Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0">
              {toolItems.map((item) => (
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
              {systemItems.map((item) => (
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
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/50 p-2 mt-auto">
        <SidebarToggleButton />
      </SidebarFooter>
    </Sidebar>
  );
}
