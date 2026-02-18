/**
 * Browser-Tab Style Navigation
 * Clean, modern navigation with Chrome-like tabs
 */

import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Brain,
  LineChart,
  Sparkles,
  Menu,
  X,
  TrendingUp,
  ChevronDown,
  BarChart3,
  Wallet,
  Star,
  Settings,
  LogOut,
  Activity,
  Newspaper,
  GraduationCap,
  History,
  Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UniversalSearchHero } from "@/components/universal-search-hero";
import { useAuth } from "@/hooks/useAuth";

interface NavTab {
  label: string;
  href: string;
  icon: any;
}

// Main navigation tabs - browser-style (core trading workflow)
const mainTabs: NavTab[] = [
  { label: "Trade Desk", href: "/trade-desk", icon: Brain },
  { label: "AI Picks", href: "/trade-desk/best-setups", icon: Sparkles },
  { label: "Markets", href: "/market", icon: BarChart3 },
  { label: "Charts", href: "/chart-analysis", icon: LineChart },
  { label: "Smart Money", href: "/smart-money", icon: Activity },
  { label: "SPX", href: "/spx", icon: Crosshair },
  { label: "Watchlist", href: "/watchlist", icon: Star },
];

// Discover dropdown items (research & learning)
const discoverItems: NavTab[] = [
  { label: "Academy", href: "/academy", icon: GraduationCap },
  { label: "News & Social", href: "/discover", icon: Newspaper },
  { label: "Bullish Trends", href: "/bullish-trends", icon: TrendingUp },
  { label: "Market Scanner", href: "/market-scanner", icon: Search },
];

export function GlassHeader() {
  const [location, setLocation] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const discoverRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { user, logout, isAuthenticated } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (discoverRef.current && !discoverRef.current.contains(event.target as Node)) {
        setDiscoverOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setLocation("/");
    setUserMenuOpen(false);
  };

  const userData = user as { email?: string; firstName?: string } | null;
  const userInitial = userData?.firstName?.[0] || userData?.email?.[0]?.toUpperCase() || "U";

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled ? "pt-1" : "pt-2"
      )}
    >
      <div className="max-w-[1600px] mx-auto px-3">
        {/* Main Header Bar */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-xl">
          <div className="flex items-center h-12 px-2">
            {/* Logo */}
            <Link href="/home">
              <div className="flex items-center gap-2 px-3 cursor-pointer group shrink-0">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-md blur-sm opacity-75" />
                  <div className="relative bg-gradient-to-br from-teal-400 to-cyan-500 p-1.5 rounded-md">
                    <TrendingUp className="h-4 w-4 text-white" />
                  </div>
                </div>
                <span className="hidden xl:block text-lg font-bold bg-gradient-to-r from-teal-400 to-cyan-500 bg-clip-text text-transparent">
                  QuantEdge
                </span>
              </div>
            </Link>

            {/* Divider */}
            <div className="h-6 w-px bg-slate-700/50 mx-2 hidden lg:block" />

            {/* Browser-Style Tabs */}
            <nav className="hidden lg:flex items-center flex-1 min-w-0">
              <div className="flex items-end overflow-x-auto no-scrollbar">
                {mainTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = location === tab.href;

                  return (
                    <Link key={tab.href} href={tab.href}>
                      <div
                        className={cn(
                          "relative flex items-center gap-1 px-2.5 py-2 text-sm font-medium transition-all cursor-pointer whitespace-nowrap",
                          // Browser tab styling
                          isActive
                            ? "bg-slate-800 text-white rounded-t-lg -mb-px border-t border-x border-slate-600/50"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg mx-0.5"
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{tab.label}</span>
                        {isActive && (
                          <motion.div
                            layoutId="activeTab"
                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-400"
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          />
                        )}
                      </div>
                    </Link>
                  );
                })}

                {/* Discover Dropdown */}
                <div className="relative" ref={discoverRef}>
                  <button
                    onClick={() => setDiscoverOpen(!discoverOpen)}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-2 text-sm font-medium transition-all cursor-pointer rounded-lg mx-0.5 whitespace-nowrap",
                      discoverOpen
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Discover</span>
                    <ChevronDown className={cn("h-3 w-3 transition-transform", discoverOpen && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {discoverOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-1 w-48 rounded-lg border border-slate-700/50 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden z-50"
                      >
                        {discoverItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = location === item.href;
                          return (
                            <Link key={item.href} href={item.href}>
                              <div
                                onClick={() => setDiscoverOpen(false)}
                                className={cn(
                                  "flex items-center gap-2.5 px-3 py-2.5 text-sm transition-all cursor-pointer",
                                  isActive
                                    ? "bg-teal-500/20 text-teal-400"
                                    : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                                )}
                              >
                                <Icon className="h-4 w-4" />
                                <span>{item.label}</span>
                              </div>
                            </Link>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </nav>

            {/* Right Section */}
            <div className="flex items-center gap-2 ml-auto">
              {/* Search */}
              <div className="hidden md:flex w-48 lg:w-56">
                <UniversalSearchHero
                  variant="default"
                  placeholder="Search..."
                />
              </div>

              {/* Live Badge */}
              <Badge
                variant="outline"
                className="hidden sm:flex border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0.5"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1" />
                Live
              </Badge>

              {/* Quick Links */}
              <Link href="/performance">
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden lg:flex h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800/50"
                >
                  <Wallet className="h-4 w-4" />
                </Button>
              </Link>

              <Link href="/settings">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800/50"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>

              {/* User Avatar */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="cursor-pointer"
                >
                  <Avatar className="h-8 w-8 border border-teal-500/30 hover:border-teal-500/50 transition-colors">
                    <AvatarFallback className="bg-gradient-to-br from-teal-500 to-cyan-500 text-white text-xs">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </button>

                <AnimatePresence>
                  {userMenuOpen && isAuthenticated && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full right-0 mt-1 w-48 rounded-lg border border-slate-700/50 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden z-50"
                    >
                      <div className="px-3 py-2 border-b border-slate-700/50">
                        <p className="text-sm font-medium text-white truncate">
                          {userData?.firstName || "User"}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {userData?.email || ""}
                        </p>
                      </div>
                      <div className="p-1">
                        <Link href="/performance">
                          <div
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-slate-300 hover:bg-slate-800/70 hover:text-white cursor-pointer"
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            <span>Portfolio</span>
                          </div>
                        </Link>
                        <Link href="/history">
                          <div
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-slate-300 hover:bg-slate-800/70 hover:text-white cursor-pointer"
                          >
                            <History className="h-3.5 w-3.5" />
                            <span>History</span>
                          </div>
                        </Link>
                        <Link href="/settings">
                          <div
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-slate-300 hover:bg-slate-800/70 hover:text-white cursor-pointer"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            <span>Settings</span>
                          </div>
                        </Link>
                        <div className="border-t border-slate-700/50 mt-1 pt-1">
                          <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm text-red-400 hover:bg-red-500/10 cursor-pointer w-full"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            <span>Sign out</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-300"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden mt-2 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl overflow-hidden"
            >
              {/* Mobile Search */}
              <div className="p-3 border-b border-slate-700/50">
                <UniversalSearchHero variant="default" placeholder="Search..." />
              </div>

              <div className="p-2 space-y-1">
                {/* Main Tabs */}
                {mainTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = location === tab.href;
                  return (
                    <Link key={tab.href} href={tab.href}>
                      <div
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
                          isActive
                            ? "bg-teal-500/20 text-teal-400"
                            : "text-slate-300 hover:bg-slate-800/50"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{tab.label}</span>
                      </div>
                    </Link>
                  );
                })}

                {/* Divider */}
                <div className="border-t border-slate-700/50 my-2" />

                {/* Discover Items */}
                <p className="text-[10px] uppercase tracking-wider text-slate-500 px-3 py-1">Discover</p>
                {discoverItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
                          isActive
                            ? "bg-teal-500/20 text-teal-400"
                            : "text-slate-300 hover:bg-slate-800/50"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  );
                })}

                {/* Account */}
                {isAuthenticated && (
                  <>
                    <div className="border-t border-slate-700/50 my-2" />
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 px-3 py-1">Account</p>
                    <Link href="/performance">
                      <div
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/50 cursor-pointer"
                      >
                        <Wallet className="h-5 w-5" />
                        <span>Portfolio</span>
                      </div>
                    </Link>
                    <Link href="/history">
                      <div
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800/50 cursor-pointer"
                      >
                        <History className="h-5 w-5" />
                        <span>History</span>
                      </div>
                    </Link>
                    <button
                      onClick={() => {
                        handleLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 cursor-pointer w-full"
                    >
                      <LogOut className="h-5 w-5" />
                      <span>Sign out</span>
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
