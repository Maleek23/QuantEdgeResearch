import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  Home,
  Compass,
  Search,
  Star,
  TrendingUp,
  Sparkles,
  Activity,
  Wallet,
  Briefcase,
  Clock,
  MessageSquare,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  CreditCard,
} from "lucide-react";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      { id: "home", label: "Home", href: "/home", icon: Home },
      { id: "discover", label: "Discover", href: "/discover", icon: Compass },
      { id: "research", label: "Research", href: "/research", icon: Search },
    ],
  },
  {
    items: [
      { id: "watchlist", label: "Watchlist", href: "/watchlist", icon: Star },
      { id: "market-movers", label: "Market Movers", href: "/market-movers", icon: TrendingUp },
      { id: "ai-stock-picker", label: "AI Stock Picker", href: "/ai-stock-picker", icon: Sparkles },
      { id: "market-scanner", label: "Market Scanner", href: "/market-scanner", icon: Activity },
      { id: "smart-money", label: "Smart Money", href: "/smart-money", icon: Wallet },
    ],
  },
  {
    items: [
      { id: "paper-trading", label: "Paper Trading", href: "/paper-trading", icon: Briefcase },
    ],
  },
  {
    title: "History",
    items: [
      { id: "journal", label: "Trade Journal", href: "/trade-audit", icon: Clock },
      { id: "chart-analysis", label: "Chart Analysis", href: "/chart-analysis", icon: FileText },
    ],
  },
];

export function KavoutSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  
  const handleLogout = () => {
    logout();
    setLocation("/");
  };
  
  const isActive = (href: string) => {
    if (href === "/home" && location === "/") return true;
    return location === href || location.startsWith(href + "/");
  };
  
  const userData = user as { email?: string; firstName?: string } | null;

  return (
    <aside 
      className={cn(
        "flex flex-col h-screen border-r border-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo & Collapse Toggle */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-border">
        <Link href="/home">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="nav-logo">
            <img 
              src={quantEdgeLabsLogoUrl} 
              alt="Quant Edge" 
              className="h-8 w-8 object-contain" 
            />
            {!collapsed && (
              <span className="font-semibold text-foreground">
                Quant Edge
              </span>
            )}
          </div>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          data-testid="button-collapse-sidebar"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {navSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="mb-4">
            {section.title && !collapsed && (
              <div className="px-3 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {section.title}
              </div>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <Link key={item.id} href={item.href}>
                  <div
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                      isActive(item.href)
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    data-testid={`nav-${item.id}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                </Link>
              ))}
            </div>
            {sectionIndex < navSections.length - 1 && (
              <div className="mt-4 mx-3 border-t border-border" />
            )}
          </div>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="mt-auto border-t border-border p-2">
        {/* Upgrade Button */}
        <Link href="/pricing">
          <div
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
              "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            data-testid="nav-upgrade"
          >
            <CreditCard className="h-5 w-5 flex-shrink-0" />
            {!collapsed && (
              <>
                <span>Upgrade</span>
                <ChevronRight className="h-4 w-4 ml-auto" />
              </>
            )}
          </div>
        </Link>

        {/* Settings */}
        <Link href="/settings">
          <div
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
              isActive("/settings")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            data-testid="nav-settings"
          >
            <Settings className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>Settings</span>}
          </div>
        </Link>

        {/* User Email & Logout */}
        {isAuthenticated && userData && (
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 mt-2",
            collapsed ? "justify-center" : ""
          )}>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate">
                  {userData.email || userData.firstName || 'User'}
                </p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
              data-testid="button-logout"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
