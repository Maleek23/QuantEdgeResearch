import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  Activity, BarChart3, Brain, History, LineChart, 
  Settings, Zap, Home, Search, ChevronLeft, ChevronRight,
  Crosshair, TrendingUp, Bot, Wallet, BookOpen
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string;
  color?: string;
}

const primaryNav: NavItem[] = [
  { icon: Crosshair, label: "Command Center", href: "/trading-engine", color: "text-cyan-400" },
  { icon: Search, label: "Market Scanner", href: "/market-scanner" },
  { icon: BarChart3, label: "Chart Analysis", href: "/chart-analysis" },
  { icon: Brain, label: "ML Intelligence", href: "/ml-intelligence", color: "text-purple-400" },
];

const secondaryNav: NavItem[] = [
  { icon: TrendingUp, label: "Trade Desk", href: "/trade-desk" },
  { icon: History, label: "Historical", href: "/historical-intelligence" },
  { icon: LineChart, label: "Backtest", href: "/backtest" },
  { icon: Bot, label: "Watchlist Bot", href: "/watchlist-bot" },
];

const utilityNav: NavItem[] = [
  { icon: Wallet, label: "Account", href: "/account" },
  { icon: BookOpen, label: "Academy", href: "/academy" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const [location] = useLocation();
  const isActive = location === item.href || location.startsWith(item.href + "/");
  const Icon = item.icon;

  const linkContent = (
    <Link href={item.href}>
      <div
        className={cn(
          "group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
          "hover:bg-slate-800/60 hover:shadow-[0_0_20px_rgba(34,211,238,0.1)]",
          isActive && "bg-slate-800/80 border-l-2 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.15)]",
          !isActive && "border-l-2 border-transparent"
        )}
        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <Icon 
          className={cn(
            "w-5 h-5 transition-all",
            isActive ? "text-cyan-400" : item.color || "text-slate-400 group-hover:text-slate-200"
          )} 
        />
        {!collapsed && (
          <span className={cn(
            "text-sm font-medium transition-colors",
            isActive ? "text-slate-100" : "text-slate-400 group-hover:text-slate-200"
          )}>
            {item.label}
          </span>
        )}
        {item.badge && !collapsed && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono">
            {item.badge}
          </span>
        )}
      </div>
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" className="bg-slate-900/95 border-slate-700/50 backdrop-blur-xl">
          <span className="text-sm">{item.label}</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

export function CommandRail() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen z-40 flex flex-col transition-all duration-300",
        "bg-slate-950/80 backdrop-blur-2xl border-r border-slate-800/50",
        collapsed ? "w-[72px]" : "w-[220px]"
      )}
      data-testid="command-rail"
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800/50">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center">
              <Zap className="w-4 h-4 text-slate-950" />
            </div>
            <span className="font-bold text-sm tracking-tight">
              <span className="text-cyan-400">Quant</span>
              <span className="text-slate-200">Edge</span>
            </span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center mx-auto">
            <Zap className="w-4 h-4 text-slate-950" />
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        <div className="space-y-1">
          {!collapsed && (
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Trading
            </div>
          )}
          {primaryNav.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} />
          ))}
        </div>

        <div className="space-y-1">
          {!collapsed && (
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Research
            </div>
          )}
          {secondaryNav.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} />
          ))}
        </div>

        <div className="space-y-1">
          {!collapsed && (
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Settings
            </div>
          )}
          {utilityNav.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      <div className="p-3 border-t border-slate-800/50">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg",
            "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-all"
          )}
          data-testid="button-toggle-rail"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
