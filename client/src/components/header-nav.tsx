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
    <header className="sticky top-0 z-50 w-full border-b border-emerald-100 dark:border-emerald-900/30 bg-gradient-to-r from-white via-emerald-50/30 to-white dark:from-[#0a0a0a] dark:via-emerald-950/20 dark:to-[#0a0a0a] backdrop-blur-xl transition-colors">
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
              <span className="hidden md:inline font-semibold text-lg bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent group-hover:from-emerald-500 group-hover:to-cyan-500 transition-all">
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
        <div className="flex items-center gap-1.5">
          {/* Credit Display - disabled for now, keeping code for future use */}
          {/* {isAuthenticated && <CreditDisplay />} */}

          <Button
            variant="ghost"
            size="icon"
            className="text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
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
                  className="text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#1a1a1a]"
                >
                  <User className="w-4 h-4" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-gray-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
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
                  className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                >
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button
                  size="sm"
                  className="bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 font-medium"
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
      <div className="border-t border-emerald-100/50 dark:border-emerald-900/20 bg-gradient-to-r from-emerald-50/30 via-white to-emerald-50/30 dark:from-emerald-950/10 dark:via-[#0a0a0a] dark:to-emerald-950/10">
        <div className="flex items-center h-10 px-4 max-w-[1800px] mx-auto gap-0.5">
          {/* Main Nav Items */}
          {navItems.map((item) => (
            <Link key={item.id} href={item.href}>
              <button
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
                  isActive(item.href)
                    ? "bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm shadow-emerald-500/10"
                    : "text-gray-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/5"
                )}
                data-testid={`nav-${item.id}`}
              >
                <item.icon className={cn(
                  "w-4 h-4",
                  isActive(item.href) && "text-emerald-500 dark:text-emerald-400"
                )} />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            </Link>
          ))}

          {/* More Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/5 transition-all duration-200"
                data-testid="nav-more"
              >
                <span className="hidden sm:inline">More</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-[#111] border-emerald-100 dark:border-emerald-900/30">
              {moreItems.map((item) => (
                <DropdownMenuItem key={item.id} asChild className="hover:bg-emerald-50 dark:hover:bg-emerald-500/10 focus:bg-emerald-50 dark:focus:bg-emerald-500/10">
                  <Link href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-2 w-full cursor-pointer transition-colors",
                        isActive(item.href)
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-gray-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400"
                      )}
                      data-testid={`nav-${item.id}`}
                    >
                      <item.icon className={cn(
                        "w-4 h-4",
                        isActive(item.href) && "text-emerald-500"
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
