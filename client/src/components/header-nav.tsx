import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import { GlobalSearch } from "@/components/global-search";
import { CreditDisplay } from "@/components/credit-display";
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
  User,
  Zap,
  BarChart3,
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
  { id: "home", label: "Home", href: "/home", icon: Home },
  { id: "trade-desk", label: "Trade Desk", href: "/trade-desk", icon: Sparkles },
  { id: "market", label: "Markets", href: "/market", icon: TrendingUp },
  { id: "charts", label: "Charts", href: "/chart-analysis", icon: Activity },
  { id: "watchlist", label: "Watchlist", href: "/watchlist", icon: Star },
];

const moreItems = [
  { id: "discover", label: "Discover", href: "/discover", icon: Compass },
  { id: "scanner", label: "Scanner", href: "/market-scanner", icon: BarChart3 },
  { id: "academy", label: "Academy", href: "/academy", icon: Search },
  { id: "performance", label: "Performance", href: "/performance", icon: TrendingUp },
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
    if (href === "/home" && (location === "/" || location === "/home")) return true;
    return location === href || location.startsWith(href + "/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/50 dark:border-cyan-900/30 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl transition-colors shadow-sm dark:shadow-cyan-500/5">
      {/* Main Header Row */}
      <div className="flex items-center justify-between h-14 px-4 max-w-[1800px] mx-auto">
        {/* Left: Logo */}
        <div className="flex items-center gap-6">
          <Link href="/home">
            <div className="flex items-center gap-2.5 cursor-pointer group" data-testid="nav-logo">
              <img
                src={quantEdgeLabsLogoUrl}
                alt="Quant Edge"
                className="h-8 w-8 object-contain"
              />
              <span className="hidden md:inline font-semibold text-lg bg-gradient-to-r from-cyan-500 to-purple-500 dark:from-cyan-400 dark:to-purple-400 bg-clip-text text-transparent group-hover:from-cyan-400 group-hover:to-purple-400 transition-all">
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
        <div className="flex items-center gap-2">
          {/* Credit Display - disabled for now, keeping code for future use */}
          {/* {isAuthenticated && <CreditDisplay />} */}

          <Button
            variant="ghost"
            size="icon"
            className="text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            data-testid="button-notifications"
          >
            <Bell className="w-4 h-4" />
          </Button>

          <ThemeToggle />

          {isAuthenticated ? (
            <>
              <Link href="/settings">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <User className="w-4 h-4" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400"
                >
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white font-medium shadow-lg shadow-cyan-500/20"
                  data-testid="button-signup"
                >
                  Sign Up
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Navigation Row */}
      <div className="border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center h-11 px-4 max-w-[1800px] mx-auto gap-1">
          {/* Main Nav Items */}
          {navItems.map((item) => (
            <Link key={item.id} href={item.href}>
              <button
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive(item.href)
                    ? "bg-gradient-to-r from-cyan-500/15 to-purple-500/15 text-cyan-500 dark:text-cyan-400 border border-cyan-500/20 shadow-sm shadow-cyan-500/10"
                    : "text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800/50"
                )}
                data-testid={`nav-${item.id}`}
              >
                <item.icon className={cn(
                  "w-4 h-4",
                  isActive(item.href) && "text-cyan-500 dark:text-cyan-400"
                )} />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            </Link>
          ))}

          {/* More Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-all duration-200"
                data-testid="nav-more"
              >
                <span className="hidden sm:inline">More</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
              {moreItems.map((item) => (
                <DropdownMenuItem key={item.id} asChild className="hover:bg-cyan-50 dark:hover:bg-cyan-500/10 focus:bg-cyan-50 dark:focus:bg-cyan-500/10">
                  <Link href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-2 w-full cursor-pointer transition-colors",
                        isActive(item.href)
                          ? "text-cyan-600 dark:text-cyan-400"
                          : "text-slate-700 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400"
                      )}
                      data-testid={`nav-${item.id}`}
                    >
                      <item.icon className={cn(
                        "w-4 h-4",
                        isActive(item.href) && "text-cyan-500"
                      )} />
                      {item.label}
                    </div>
                  </Link>
                </DropdownMenuItem>
              ))}
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
