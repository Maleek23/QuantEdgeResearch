import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import { GlobalSearch } from "@/components/global-search";
import {
  LogOut,
  Bell,
  Home,
  Compass,
  Search,
  Star,
  TrendingUp,
  Sparkles,
  Activity,
  Wallet,
  Clock,
  Settings,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";

const navItems = [
  { id: "home", label: "Home", href: "/research", icon: Home },
  { id: "discover", label: "Discover", href: "/discover", icon: Compass },
  { id: "research", label: "Research", href: "/research", icon: Search },
  { id: "watchlist", label: "Watchlist", href: "/watchlist", icon: Star },
  { id: "movers", label: "Movers", href: "/market-movers", icon: TrendingUp },
  { id: "ai-picks", label: "AI Picks", href: "/ai-stock-picker", icon: Sparkles },
  { id: "signals", label: "Signals", href: "/smart-signals", icon: Activity },
];

const moreItems = [
  { id: "smart-money", label: "Smart Money", href: "/smart-money", icon: Wallet },
  { id: "history", label: "History", href: "/history", icon: Clock },
  { id: "portfolio", label: "Portfolio", href: "/portfolio", icon: TrendingUp },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

export function HeaderNav() {
  const { user, logout, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  
  const handleLogout = () => {
    logout();
    setLocation("/");
  };
  
  const isActive = (href: string) => {
    if (href === "/research" && (location === "/" || location === "/research")) return true;
    return location === href || location.startsWith(href + "/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/50 bg-slate-950/95 backdrop-blur-xl">
      {/* Main Header Row */}
      <div className="flex items-center justify-between h-14 px-4 max-w-[1800px] mx-auto">
        {/* Left: Logo */}
        <div className="flex items-center gap-6">
          <Link href="/research">
            <div className="flex items-center gap-2 cursor-pointer" data-testid="nav-logo">
              <img 
                src={quantEdgeLabsLogoUrl} 
                alt="Quant Edge" 
                className="h-8 w-8 object-contain" 
              />
              <span className="hidden md:inline font-semibold text-lg text-slate-100">
                Quant Edge
              </span>
            </div>
          </Link>
        </div>
        
        {/* Center: Global Search */}
        <div className="flex-1 max-w-xl mx-8 hidden lg:block">
          <GlobalSearch 
            variant="default" 
            placeholder="Search for companies, tickers, or crypto"
          />
        </div>
        
        {/* Right: Actions & User */}
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-slate-400 hover:text-slate-200"
            data-testid="button-notifications"
          >
            <Bell className="w-4 h-4" />
          </Button>
          
          <ThemeToggle />
          
          <Link href="/pricing">
            <Button 
              size="sm" 
              className="bg-cyan-500 hover:bg-cyan-600 text-white"
              data-testid="button-pricing"
            >
              Upgrade
            </Button>
          </Link>
          
          {isAuthenticated && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Navigation Row */}
      <div className="border-t border-slate-800/30 bg-slate-900/50">
        <div className="flex items-center h-10 px-4 max-w-[1800px] mx-auto gap-1">
          {/* Main Nav Items */}
          {navItems.map((item) => (
            <Link key={item.id} href={item.href}>
              <button
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-cyan-500/15 text-cyan-400"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                )}
                data-testid={`nav-${item.id}`}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            </Link>
          ))}
          
          {/* More Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
                data-testid="nav-more"
              >
                <span className="hidden sm:inline">More</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-slate-900 border-slate-800">
              {moreItems.map((item) => (
                <DropdownMenuItem key={item.id} asChild>
                  <Link href={item.href}>
                    <div 
                      className={cn(
                        "flex items-center gap-2 w-full cursor-pointer",
                        isActive(item.href) && "text-cyan-400"
                      )}
                      data-testid={`nav-${item.id}`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </div>
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-slate-800" />
              <DropdownMenuItem asChild>
                <Link href="/trade-desk">
                  <div className="flex items-center gap-2 w-full cursor-pointer">
                    <Activity className="w-4 h-4" />
                    Trade Desk
                  </div>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Mobile Search */}
          <div className="lg:hidden ml-auto">
            <GlobalSearch 
              variant="default" 
              placeholder="Search..."
            />
          </div>
        </div>
      </div>
    </header>
  );
}
