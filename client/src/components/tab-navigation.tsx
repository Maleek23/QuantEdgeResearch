import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  Home,
  BarChart3,
  Activity,
  Bot,
  Search,
  ChevronDown,
  LogOut,
  Settings,
  User,
  TrendingUp,
  Zap,
  Target,
  Brain,
  LineChart,
  Wallet,
  Clock,
  Sparkles,
  Eye,
  FileText,
  Briefcase,
  History,
} from "lucide-react";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { GlobalSearch } from "./global-search";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

interface NavCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const navCategories: NavCategory[] = [
  {
    id: "analysis",
    label: "Analysis",
    icon: BarChart3,
    items: [
      { label: "Trade Desk", href: "/trade-desk", icon: Brain, description: "AI-powered stock analysis" },
      { label: "Chart Analysis", href: "/chart-analysis", icon: LineChart, description: "Technical chart patterns" },
      { label: "Options Analyzer", href: "/options-analyzer", icon: Target, description: "Options risk lab" },
      { label: "Smart Advisor", href: "/smart-advisor", icon: Sparkles, description: "AI trading advisor" },
      { label: "Historical Intel", href: "/historical-intelligence", icon: History, description: "Past trade patterns" },
    ],
  },
  {
    id: "scanners",
    label: "Scanners",
    icon: Activity,
    items: [
      { label: "Market Scanner", href: "/market-scanner", icon: Activity, description: "Real-time opportunities" },
      { label: "Bullish Trends", href: "/bullish-trends", icon: TrendingUp, description: "Momentum stocks" },
      { label: "Market Movers", href: "/market-movers", icon: Zap, description: "Top gainers & losers" },
      { label: "AI Stock Picker", href: "/ai-stock-picker", icon: Sparkles, description: "ML-powered picks" },
      { label: "WSB Trending", href: "/wsb-trending", icon: TrendingUp, description: "Reddit sentiment" },
      { label: "Social Trends", href: "/social-trends", icon: Eye, description: "Social media buzz" },
    ],
  },
  {
    id: "bots",
    label: "Bots",
    icon: Bot,
    items: [
      { label: "Paper Trading", href: "/paper-trading", icon: Briefcase, description: "Practice trading" },
      { label: "Automations", href: "/automations", icon: Zap, description: "Bot management" },
      { label: "Watchlist Bot", href: "/watchlist-bot", icon: Eye, description: "Auto watchlist alerts" },
      { label: "CT Tracker", href: "/ct-tracker", icon: Wallet, description: "Crypto signals" },
      { label: "Wallet Tracker", href: "/wallet-tracker", icon: Wallet, description: "Crypto wallets" },
    ],
  },
  {
    id: "research",
    label: "Research",
    icon: Search,
    items: [
      { label: "Research Hub", href: "/research", icon: Search, description: "Central research" },
      { label: "Discover", href: "/discover", icon: Eye, description: "News & catalysts" },
      { label: "Watchlist", href: "/watchlist", icon: Eye, description: "Your tracked stocks" },
      { label: "Backtest", href: "/backtest", icon: Clock, description: "Strategy testing" },
      { label: "Performance", href: "/performance", icon: FileText, description: "Trade history" },
    ],
  },
];

function CategoryDropdown({ category, isActive }: { category: NavCategory; isActive: boolean }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const Icon = category.icon;

  return (
    <div
      ref={dropdownRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
          isActive
            ? "text-primary bg-primary/10"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
        data-testid={`tab-${category.id}`}
      >
        <Icon className="h-4 w-4" />
        <span>{category.label}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-xl z-50 py-2">
          {category.items.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted transition-colors cursor-pointer"
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function TabNavigation() {
  const [location, setLocation] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const isInCategory = (category: NavCategory) => {
    return category.items.some(item => location === item.href || location.startsWith(item.href + "/"));
  };

  const userData = user as { email?: string; firstName?: string } | null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 gap-4">
        {/* Logo */}
        <Link href="/home">
          <div className="flex items-center gap-2 cursor-pointer mr-2" data-testid="nav-logo">
            <img 
              src={quantEdgeLabsLogoUrl} 
              alt="Quant Edge" 
              className="h-8 w-8 object-contain" 
            />
            <span className="font-semibold text-foreground hidden sm:block">
              Quant Edge
            </span>
          </div>
        </Link>

        {/* Home Link */}
        <Link href="/home">
          <div
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer",
              location === "/home" || location === "/"
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            data-testid="nav-home"
          >
            <Home className="h-4 w-4" />
            <span className="hidden md:inline">Home</span>
          </div>
        </Link>

        {/* Category Tabs */}
        <nav className="flex items-center gap-1">
          {navCategories.map((category) => (
            <CategoryDropdown
              key={category.id}
              category={category}
              isActive={isInCategory(category)}
            />
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className="w-64 hidden lg:block">
          <GlobalSearch variant="default" placeholder="Search stocks..." />
        </div>

        {/* User Menu */}
        {isAuthenticated && userData && (
          <div className="flex items-center gap-2">
            <Link href="/settings">
              <Button variant="ghost" size="icon" className="h-9 w-9" data-testid="nav-settings">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              data-testid="button-logout"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
