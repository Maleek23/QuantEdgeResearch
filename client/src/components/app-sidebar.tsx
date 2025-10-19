import { Home, TrendingUp, BarChart2, Star, Calculator, Target, User, Sparkles, Shield, BookOpen, Settings } from "lucide-react";
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
} from "@/components/ui/sidebar";

const researchItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Trade Ideas", url: "/trade-ideas", icon: TrendingUp },
  { title: "Market", url: "/market", icon: BarChart2 },
  { title: "Watchlist", url: "/watchlist", icon: Star },
];

const toolItems = [
  { title: "Performance", url: "/performance", icon: Target },
  { title: "Signal Intelligence", url: "/signals", icon: Sparkles },
  { title: "Risk Calculator", url: "/risk", icon: Calculator },
];

const systemItems = [
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "About", url: "/about", icon: User },
  { title: "Learn More", url: "/learn-more", icon: BookOpen },
  { title: "Admin", url: "/admin", icon: Shield },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="h-auto min-h-12 items-start px-4 py-3">
              <Link href="/" data-testid="nav-home">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                  <span className="font-semibold">QuantEdge</span>
                  <span className="text-xs text-muted-foreground">Research Platform</span>
                </div>
              </Link>
            </SidebarMenuButton>
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

      <SidebarFooter className="border-t border-sidebar-border/50">
        <div className="px-4 py-3 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center justify-center opacity-30 hover:opacity-50 transition-opacity">
            <span className="text-[10px] font-mono tracking-[0.2em] text-muted-foreground/50">
              UN/TITLD
            </span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
