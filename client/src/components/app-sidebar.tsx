import { Home, TrendingUp, BarChart2, Star, Calculator, Target, User, Sparkles, Shield, BookOpen, Settings, Sparkle, PanelLeftClose, PanelLeft } from "lucide-react";
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
import { UntitldLogo } from "@/components/untitld-logo";
import quantEdgeLogoUrl from "@assets/image (1)_1761160822785.png";
import { cn } from "@/lib/utils";

const researchItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Trade Ideas", url: "/trade-ideas", icon: TrendingUp },
  { title: "Market", url: "/market", icon: BarChart2 },
  { title: "Watchlist", url: "/watchlist", icon: Star },
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
                isCollapsed ? "h-14 w-14" : "h-11 w-11"
              )}
              style={{
                filter: isCollapsed ? 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.4))' : 'none',
                opacity: isCollapsed ? 0.9 : 1
              }}
            />
          </div>
          
          {/* Branding section - always mounted, transforms between states */}
          <div className={cn(
            "flex flex-col transition-all duration-300",
            isCollapsed ? "gap-0" : "gap-0.5 leading-none ml-3"
          )}>
            {/* "by" text - fades out when collapsed */}
            <span className={cn(
              "text-[9px] text-muted-foreground/50 tracking-wide transition-all duration-300",
              isCollapsed ? "opacity-0 h-0 overflow-hidden" : "opacity-100"
            )}>
              by
            </span>
            
            {/* Portal animation - ALWAYS MOUNTED */}
            <UntitldLogo collapsed={isCollapsed} />
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
      
      <SidebarContent>
        {/* Research Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Research</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {researchItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link 
                      href={item.url}
                      className="flex items-center gap-3"
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
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link 
                      href={item.url}
                      className="flex items-center gap-3"
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
        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link 
                      href={item.url}
                      className="flex items-center gap-3"
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

      <SidebarFooter className="border-t border-sidebar-border/50 p-4">
        <SidebarToggleButton />
      </SidebarFooter>
    </Sidebar>
  );
}
