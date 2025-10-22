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
    <SidebarMenuButton asChild className="h-auto items-center px-3 py-6">
      <Link href="/" data-testid="nav-home" className="relative overflow-visible">
        {/* Single persistent structure - no unmounting */}
        <div className="flex items-center justify-center w-full relative">
          {/* Logo - shrinks and fades in collapsed state */}
          <div 
            className={cn(
              "flex shrink-0 items-center justify-center transition-all duration-700 ease-in-out",
              isCollapsed ? "opacity-0 scale-50 w-0" : "opacity-100 scale-100"
            )}
          >
            <img 
              src={quantEdgeLogoUrl} 
              alt="QuantEdge" 
              className="h-11 w-11 object-contain"
            />
          </div>
          
          {/* Branding section - transforms based on state */}
          <div 
            className={cn(
              "flex flex-col transition-all duration-700 ease-in-out",
              isCollapsed 
                ? "items-center justify-center absolute inset-0" 
                : "gap-0.5 leading-none ml-3"
            )}
          >
            {/* "by" text - fades out when collapsed */}
            <span 
              className={cn(
                "text-[9px] text-muted-foreground/50 tracking-wide transition-all duration-700",
                isCollapsed ? "opacity-0 h-0" : "opacity-100"
              )}
            >
              by
            </span>
            
            {/* Portal animation component - always mounted */}
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
                      data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}
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
                      data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}
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
                      data-testid={`nav-${item.title.toLowerCase().replace(' ', '-')}`}
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
