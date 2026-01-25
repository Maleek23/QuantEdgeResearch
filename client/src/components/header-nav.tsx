import { Link, useLocation } from "wouter";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import { GlobalSearch } from "@/components/global-search";
import {
  LogOut,
  Mail,
  HelpCircle,
  Bell,
  Zap,
  TrendingUp,
  Search as SearchIcon,
  PieChart,
  BarChart3,
} from "lucide-react";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";

const navItems = [
  { label: "Opportunities", href: "/trade-desk", icon: Zap, description: "AI Trade Ideas" },
  { label: "Markets", href: "/command-center", icon: TrendingUp, description: "Market Overview" },
  { label: "Research", href: "/research-hub", icon: SearchIcon, description: "Analysis Tools" },
  { label: "Portfolio", href: "/performance", icon: PieChart, description: "Track Positions" },
];

export function HeaderNav() {
  const { user, logout, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  
  const handleLogout = () => {
    logout();
    setLocation("/");
  };
  
  const userData = user as { email?: string; firstName?: string } | null;

  const isActivePage = (href: string) => {
    return location === href || location.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/50 bg-slate-950/95 backdrop-blur-xl">
      <div className="flex items-center h-14 px-4 max-w-[1600px] mx-auto gap-4">
        {/* Logo */}
        <Link href={isAuthenticated ? "/trade-desk" : "/"}>
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" data-testid="nav-logo">
            <img
              src={quantEdgeLabsLogoUrl}
              alt="Quant Edge"
              className="h-7 w-7 object-contain"
            />
            <span className="font-semibold text-white hidden md:inline">QuantEdge</span>
          </div>
        </Link>

        {/* Main Navigation - Only show if authenticated */}
        {isAuthenticated && (
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActivePage(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "gap-2 h-9 px-3 text-sm font-medium transition-colors",
                      active
                        ? "text-cyan-400 bg-cyan-500/10"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    )}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden lg:inline">{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </nav>
        )}

        {/* Global Search */}
        <div className="flex-1 max-w-md mx-auto">
          <GlobalSearch
            variant="default"
            placeholder="Search stocks, crypto..."
          />
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {!isAuthenticated ? (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200">
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600 text-white">
                  Sign up
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="text-slate-400 hover:text-slate-200"
                data-testid="button-notifications"
              >
                <Bell className="w-4 h-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-slate-400 hover:text-red-400"
                title="Log out"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
