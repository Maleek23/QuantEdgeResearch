import { Link, useLocation } from "wouter";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import { GlobalSearch } from "@/components/global-search";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  LogOut,
  Zap,
  TrendingUp,
  BarChart3,
  LineChart,
  Brain,
  Target,
  Wallet,
  Activity,
  Layers,
  FileBarChart,
  Clock,
  Crosshair,
  Eye,
} from "lucide-react";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";

interface NavDropdownItem {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
}

// Research - All analysis and signal generation tools
const research: NavDropdownItem[] = [
  { title: "Trade Desk", description: "6-engine AI research briefs & trade ideas", href: "/trade-desk", icon: Brain },
  { title: "Chart Analysis", description: "Pattern recognition & technical analysis", href: "/chart-analysis", icon: BarChart3 },
  { title: "Market Scanner", description: "Intraday momentum & breakout signals", href: "/market-scanner", icon: Activity },
  { title: "CT Tracker", description: "Crypto sentiment & social signals", href: "/ct-tracker", icon: Wallet },
];

// Tools - Tracking, flow analysis, and automation
const tools: NavDropdownItem[] = [
  { title: "Smart Advisor", description: "Exit signals & rebuy zones", href: "/smart-advisor", icon: Zap },
  { title: "Options Analyzer", description: "Options flow & chain analysis", href: "/options-analyzer", icon: Layers },
  { title: "Watchlist", description: "Track & grade your symbols", href: "/watchlist", icon: Eye },
  { title: "Whale Flow", description: "Smart money & options flow", href: "/whale-flow", icon: TrendingUp },
  { title: "Wallet Tracker", description: "Track whale crypto wallets", href: "/wallet-tracker", icon: FileBarChart },
  { title: "Automations", description: "Trading bots & alerts", href: "/automations", icon: Zap },
  { title: "Backtest", description: "Test strategies on historical data", href: "/backtest", icon: Crosshair },
];

// Trading - Execution, practice, and performance tracking
const trading: NavDropdownItem[] = [
  { title: "Market Overview", description: "Real-time market data & indices", href: "/market", icon: LineChart },
  { title: "Paper Trading", description: "Practice with virtual money", href: "/paper-trading", icon: Target },
  { title: "Performance", description: "Track your trading stats", href: "/performance", icon: TrendingUp },
];

// Learn - Education and news
const learn: NavDropdownItem[] = [
  { title: "Academy", description: "Trading education & tutorials", href: "/academy", icon: Brain },
  { title: "News & Blog", description: "Market updates & analysis", href: "/blog", icon: FileBarChart },
];

function DropdownItem({ item }: { item: NavDropdownItem }) {
  const Icon = item.icon;
  return (
    <Link href={item.href}>
      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer group" data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
        <div className="p-2 rounded-lg bg-slate-800/50 group-hover:bg-cyan-500/20 transition-colors">
          <Icon className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-colors" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
            {item.title}
          </span>
          <span className="block text-xs text-slate-500 group-hover:text-slate-400 transition-colors mt-0.5">
            {item.description}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function HeaderNav() {
  const { user, logout, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  
  const handleLogout = () => {
    logout();
    setLocation("/");
  };
  
  const userData = user as { email?: string; firstName?: string } | null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/50 bg-slate-950/95 backdrop-blur-xl">
      <div className="flex items-center justify-between h-14 px-6 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-6">
          <Link href="/home">
            <div className="flex items-center gap-2 cursor-pointer" data-testid="nav-logo">
              <img 
                src={quantEdgeLabsLogoUrl} 
                alt="Quant Edge Labs" 
                className="h-8 w-8 object-contain" 
              />
              <span className="font-semibold text-white hidden sm:block whitespace-nowrap">Quant Edge</span>
            </div>
          </Link>
          
          <div className="hidden md:block w-64 lg:w-80">
            <GlobalSearch 
              variant="default" 
              placeholder="Search stocks, crypto..."
            />
          </div>
          
          <NavigationMenu className="hidden lg:flex">
            <NavigationMenuList className="gap-1">
              <NavigationMenuItem>
                <NavigationMenuTrigger className="px-3 py-2 text-sm text-slate-300 hover:text-white bg-transparent hover:bg-slate-800/50 data-[state=open]:bg-slate-800/50" data-testid="nav-research">
                  Research
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="w-[400px] p-4 bg-slate-900/95 border border-slate-800/50 backdrop-blur-xl rounded-lg shadow-2xl">
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 px-3">
                      Analysis & Signals
                    </div>
                    <div className="space-y-1">
                      {research.map((item) => (
                        <DropdownItem key={item.title} item={item} />
                      ))}
                    </div>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
              
              <NavigationMenuItem>
                <NavigationMenuTrigger className="px-3 py-2 text-sm text-slate-300 hover:text-white bg-transparent hover:bg-slate-800/50 data-[state=open]:bg-slate-800/50" data-testid="nav-tools">
                  Tools
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="w-[400px] p-4 bg-slate-900/95 border border-slate-800/50 backdrop-blur-xl rounded-lg shadow-2xl">
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 px-3">
                      Tracking & Automation
                    </div>
                    <div className="space-y-1">
                      {tools.map((item) => (
                        <DropdownItem key={item.title} item={item} />
                      ))}
                    </div>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
              
              <NavigationMenuItem>
                <NavigationMenuTrigger className="px-3 py-2 text-sm text-slate-300 hover:text-white bg-transparent hover:bg-slate-800/50 data-[state=open]:bg-slate-800/50" data-testid="nav-trading">
                  Trading
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="w-[380px] p-4 bg-slate-900/95 border border-slate-800/50 backdrop-blur-xl rounded-lg shadow-2xl">
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 px-3">
                      Execute & Track
                    </div>
                    <div className="space-y-1">
                      {trading.map((item) => (
                        <DropdownItem key={item.title} item={item} />
                      ))}
                    </div>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
              
              <NavigationMenuItem>
                <NavigationMenuTrigger className="px-3 py-2 text-sm text-slate-300 hover:text-white bg-transparent hover:bg-slate-800/50 data-[state=open]:bg-slate-800/50" data-testid="nav-learn">
                  Learn
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="w-[380px] p-4 bg-slate-900/95 border border-slate-800/50 backdrop-blur-xl rounded-lg shadow-2xl">
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 px-3">
                      Education & Updates
                    </div>
                    <div className="space-y-1">
                      {learn.map((item) => (
                        <DropdownItem key={item.title} item={item} />
                      ))}
                    </div>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        
        <div className="flex items-center gap-3">
          {isAuthenticated && userData ? (
            <>
              <span className="hidden sm:block text-xs font-mono text-slate-500">
                {userData.email || userData.firstName || 'User'}
              </span>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleLogout}
                data-testid="button-logout"
                className="gap-1.5 text-slate-400 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-slate-300" data-testid="button-login">
                  Login
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="button-signup">
                  Upgrade now
                </Button>
              </Link>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
