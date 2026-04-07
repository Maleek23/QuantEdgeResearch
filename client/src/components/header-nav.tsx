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
    <header className="sticky top-0 z-50 w-full border-b border-border/50 dark:border-emerald-900/30 bg-white/95 dark:bg-card/95 backdrop-blur-sm transition-colors shadow-sm dark:shadow-emerald-500/5">
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
              <span className="hidden md:inline font-semibold text-lg text-white transition-all">
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
            className="text-muted-foreground dark:text-muted-foreground hover:text-[var(--trade-bullish)] dark:hover:text-[var(--trade-bullish)] hover:bg-muted dark:hover:bg-muted"
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
                  className="text-muted-foreground dark:text-muted-foreground hover:text-[var(--trade-bullish)] dark:hover:text-[var(--trade-bullish)] hover:bg-muted dark:hover:bg-muted"
                >
                  <User className="w-4 h-4" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-muted-foreground dark:text-muted-foreground hover:text-[var(--trade-bearish)] dark:hover:text-[var(--trade-bearish)] hover:bg-red-50 dark:hover:bg-red-500/10"
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
                  className="text-muted-foreground/70 dark:text-muted-foreground hover:text-[var(--trade-bullish)] dark:hover:text-[var(--trade-bullish)]"
                >
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-emerald-500 to-purple-500 hover:from-emerald-600 hover:to-purple-600 text-white font-medium shadow-lg shadow-emerald-500/20"
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
      <div className="border-t border-border dark:border-border/50 bg-muted/50/50 dark:bg-card/50">
        <div className="flex items-center h-11 px-4 max-w-[1800px] mx-auto gap-1">
          {/* Main Nav Items */}
          {navItems.map((item) => (
            <Link key={item.id} href={item.href}>
              <button
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive(item.href)
                    ? "bg-gradient-to-r from-emerald-500/15 to-purple-500/15 text-[var(--trade-bullish)] dark:text-[var(--trade-bullish)] border border-emerald-500/20 shadow-sm shadow-emerald-500/10"
                    : "text-muted-foreground/70 dark:text-muted-foreground hover:text-[var(--trade-bullish)] dark:hover:text-[var(--trade-bullish)] hover:bg-muted dark:hover:bg-muted/50"
                )}
                data-testid={`nav-${item.id}`}
              >
                <item.icon className={cn(
                  "w-4 h-4",
                  isActive(item.href) && "text-[var(--trade-bullish)] dark:text-[var(--trade-bullish)]"
                )} />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            </Link>
          ))}

          {/* More Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground/70 dark:text-muted-foreground hover:text-[var(--trade-bullish)] dark:hover:text-[var(--trade-bullish)] hover:bg-muted dark:hover:bg-muted/50 transition-all duration-200"
                data-testid="nav-more"
              >
                <span className="hidden sm:inline">More</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-card border-border dark:border-border">
              {moreItems.map((item) => (
                <DropdownMenuItem key={item.id} asChild className="hover:bg-emerald-50 dark:hover:bg-emerald-500/10 focus:bg-emerald-50 dark:focus:bg-emerald-500/10">
                  <Link href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-2 w-full cursor-pointer transition-colors",
                        isActive(item.href)
                          ? "text-[var(--trade-bullish)] dark:text-[var(--trade-bullish)]"
                          : "text-muted-foreground/50 dark:text-foreground/80 hover:text-[var(--trade-bullish)] dark:hover:text-[var(--trade-bullish)]"
                      )}
                      data-testid={`nav-${item.id}`}
                    >
                      <item.icon className={cn(
                        "w-4 h-4",
                        isActive(item.href) && "text-[var(--trade-bullish)]"
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
