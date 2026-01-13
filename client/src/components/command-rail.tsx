import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  Activity, BarChart3, History, LineChart, 
  Settings, Zap, Search, ChevronLeft, ChevronRight,
  Crosshair, TrendingUp, Bot, Wallet, BookOpen
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuroraLayout } from "@/contexts/aurora-layout-context";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: string;
  color?: string;
  glow?: string;
}

const primaryNav: NavItem[] = [
  { icon: Crosshair, label: "Command Center", href: "/trading-engine", color: "text-cyan-400", glow: "rgba(34,211,238,0.4)" },
  { icon: Search, label: "Market Scanner", href: "/market-scanner", color: "text-slate-400", glow: "rgba(148,163,184,0.3)" },
  { icon: BarChart3, label: "Chart Analysis", href: "/chart-analysis", color: "text-slate-400", glow: "rgba(148,163,184,0.3)" },
];

const secondaryNav: NavItem[] = [
  { icon: TrendingUp, label: "Trade Desk", href: "/trade-desk", color: "text-emerald-400", glow: "rgba(52,211,153,0.3)" },
  { icon: History, label: "Historical", href: "/historical-intelligence", color: "text-slate-400", glow: "rgba(148,163,184,0.3)" },
  { icon: LineChart, label: "Backtest", href: "/backtest", color: "text-slate-400", glow: "rgba(148,163,184,0.3)" },
  { icon: Bot, label: "Automations", href: "/watchlist-bot", color: "text-pink-400", glow: "rgba(244,114,182,0.3)" },
];

const utilityNav: NavItem[] = [
  { icon: Wallet, label: "Account", href: "/account" },
  { icon: BookOpen, label: "Academy", href: "/academy" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

function NavIcon({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Link href={item.href}>
          <div
            className={cn(
              "relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 cursor-pointer group",
              isActive 
                ? "bg-slate-800/80" 
                : "hover:bg-slate-800/40"
            )}
            style={{
              boxShadow: isActive ? `0 0 20px ${item.glow || 'rgba(34,211,238,0.3)'}` : 'none'
            }}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {isActive && (
              <div 
                className="absolute inset-0 rounded-xl opacity-20"
                style={{
                  background: `radial-gradient(circle at center, ${item.glow || 'rgba(34,211,238,0.5)'}, transparent 70%)`
                }}
              />
            )}
            <Icon 
              className={cn(
                "w-5 h-5 relative z-10 transition-all duration-200",
                isActive 
                  ? (item.color || "text-cyan-400") 
                  : "text-slate-500 group-hover:text-slate-300"
              )} 
            />
            {isActive && (
              <div 
                className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                style={{ 
                  backgroundColor: item.color?.includes('cyan') ? '#22d3ee' : 
                                   item.color?.includes('purple') ? '#c084fc' :
                                   item.color?.includes('emerald') ? '#34d399' :
                                   item.color?.includes('pink') ? '#f472b6' : '#22d3ee'
                }}
              />
            )}
          </div>
        </Link>
      </TooltipTrigger>
      <TooltipContent 
        side="right" 
        sideOffset={12}
        className="bg-slate-900/95 border-slate-700/50 backdrop-blur-xl px-3 py-1.5"
      >
        <span className="text-xs font-medium">{item.label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function NavIconExpanded({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  
  return (
    <Link href={item.href}>
      <div
        className={cn(
          "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 cursor-pointer group",
          isActive 
            ? "bg-slate-800/80" 
            : "hover:bg-slate-800/40"
        )}
        style={{
          boxShadow: isActive ? `0 0 20px ${item.glow || 'rgba(34,211,238,0.3)'}` : 'none'
        }}
        data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {isActive && (
          <div 
            className="absolute inset-0 rounded-xl opacity-15"
            style={{
              background: `radial-gradient(circle at left, ${item.glow || 'rgba(34,211,238,0.5)'}, transparent 60%)`
            }}
          />
        )}
        <Icon 
          className={cn(
            "w-5 h-5 relative z-10 transition-all duration-200",
            isActive 
              ? (item.color || "text-cyan-400") 
              : "text-slate-500 group-hover:text-slate-300"
          )} 
        />
        <span className={cn(
          "text-sm font-medium relative z-10 transition-colors",
          isActive ? "text-slate-100" : "text-slate-400 group-hover:text-slate-200"
        )}>
          {item.label}
        </span>
        {isActive && (
          <div 
            className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
            style={{ 
              backgroundColor: item.color?.includes('cyan') ? '#22d3ee' : 
                               item.color?.includes('purple') ? '#c084fc' :
                               item.color?.includes('emerald') ? '#34d399' :
                               item.color?.includes('pink') ? '#f472b6' : '#22d3ee'
            }}
          />
        )}
      </div>
    </Link>
  );
}

export function CommandRail() {
  const [location] = useLocation();
  const { railCollapsed: collapsed, setRailCollapsed: setCollapsed } = useAuroraLayout();

  const isItemActive = (href: string) => location === href || location.startsWith(href + "/");

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen z-40 flex flex-col transition-all duration-300",
        "backdrop-blur-2xl border-r border-slate-800/30",
        collapsed ? "w-[68px]" : "w-[200px]"
      )}
      data-testid="command-rail"
    >
      <div className={cn(
        "flex items-center h-12 border-b border-slate-800/30",
        collapsed ? "justify-center px-3" : "justify-between px-4"
      )}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.3)]">
            <Zap className="w-4 h-4 text-slate-950" />
          </div>
          {!collapsed && (
            <span className="font-bold text-sm tracking-tight">
              <span className="text-cyan-400">Q</span>
              <span className="text-slate-300">E</span>
            </span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
            data-testid="button-collapse-rail"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className={cn(
        "flex-1 py-4 overflow-y-auto",
        collapsed ? "px-3" : "px-3"
      )}>
        {!collapsed && (
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            Trading
          </div>
        )}
        <div className={cn("space-y-1", collapsed && "flex flex-col items-center")}>
          {primaryNav.map((item) => (
            collapsed ? (
              <NavIcon key={item.href} item={item} isActive={isItemActive(item.href)} />
            ) : (
              <NavIconExpanded key={item.href} item={item} isActive={isItemActive(item.href)} />
            )
          ))}
        </div>

        <div className={cn(
          "my-3 mx-2 h-px bg-gradient-to-r from-transparent via-slate-700/40 to-transparent"
        )} />

        {!collapsed && (
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            Research
          </div>
        )}
        <div className={cn("space-y-1", collapsed && "flex flex-col items-center")}>
          {secondaryNav.map((item) => (
            collapsed ? (
              <NavIcon key={item.href} item={item} isActive={isItemActive(item.href)} />
            ) : (
              <NavIconExpanded key={item.href} item={item} isActive={isItemActive(item.href)} />
            )
          ))}
        </div>

        <div className={cn(
          "my-3 mx-2 h-px bg-gradient-to-r from-transparent via-slate-700/40 to-transparent"
        )} />

        {!collapsed && (
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            Settings
          </div>
        )}
        <div className={cn("space-y-1", collapsed && "flex flex-col items-center")}>
          {utilityNav.map((item) => (
            collapsed ? (
              <NavIcon key={item.href} item={item} isActive={isItemActive(item.href)} />
            ) : (
              <NavIconExpanded key={item.href} item={item} isActive={isItemActive(item.href)} />
            )
          ))}
        </div>
      </nav>

      <div className={cn(
        "border-t border-slate-800/30 p-3",
        collapsed && "flex justify-center"
      )}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg transition-all duration-200",
            "text-slate-500 hover:text-slate-300 hover:bg-slate-800/30",
            collapsed ? "w-10 h-10" : "w-full px-3 py-2"
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
