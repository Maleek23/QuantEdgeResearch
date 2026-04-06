/**
 * QuantEdge Navigation Header
 * Clean, floating navigation bar with browser-style tabs.
 * Uses semantic design tokens — works in both light and dark modes.
 */

import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Brain,
  LineChart,
  Menu,
  X,
  ChevronDown,
  BarChart3,
  Wallet,
  Star,
  Settings,
  LogOut,
  Activity,
  GraduationCap,
  History,
  BookOpen,
  Crosshair,
  Zap,
  SlidersHorizontal,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UniversalSearchHero } from "@/components/universal-search-hero";
import { useAuth } from "@/hooks/useAuth";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";

interface NavTab {
  label: string;
  href: string;
  icon: any;
}

/**
 * Navigation Architecture — logical grouping:
 *
 * Main tabs (always visible):
 *   Home → Dashboard entry
 *   Trade Desk → AI picks, discovery, overnight predictions (Discover merged)
 *   Markets → Market overview + Scanner (Bullish Trends merged)
 *   Charts → Technical analysis
 *   Options → Chain analysis (SPX merged as preset)
 *   Flow → Options flow + convergence (kept separate)
 *
 * More → Tools:
 *   GEX → Gamma exposure
 *   Smart Money → Whale flow
 *   Watchlist → Unified watchlist
 *   Performance → Track record (Trading Engine merged)
 *
 * More → Learn:
 *   Academy → Education
 *   Blog → Content
 */
const mainTabs: NavTab[] = [
  { label: "Home", href: "/home", icon: BarChart3 },
  { label: "Trade Desk", href: "/trade-desk", icon: Brain },
  { label: "Markets", href: "/market", icon: Search },
  { label: "Charts", href: "/chart-analysis", icon: LineChart },
  { label: "Options", href: "/options-analyzer", icon: SlidersHorizontal },
  { label: "Flow", href: "/flow", icon: Zap },
];

const moreToolItems: NavTab[] = [
  { label: "GEX", href: "/gex", icon: Crosshair },
  { label: "Smart Money", href: "/smart-money", icon: Activity },
  { label: "Watchlist", href: "/watchlist", icon: Star },
  { label: "Performance", href: "/performance", icon: Trophy },
];

const moreResearchItems: NavTab[] = [
  { label: "Academy", href: "/academy", icon: GraduationCap },
  { label: "Blog", href: "/blog", icon: BookOpen },
];

const allMoreItems = [...moreToolItems, ...moreResearchItems];

export function GlassHeader() {
  const [location, setLocation] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { user, logout, isAuthenticated } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
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
        "fixed top-0 left-0 right-0 z-50 transition-all duration-150",
        scrolled ? "pt-0.5" : "pt-1.5"
      )}
    >
      <div className="max-w-[1600px] mx-auto px-2">
        {/* Main Header Bar */}
        <div
          className={cn(
            "bg-card/92 backdrop-blur-xl border border-border rounded-lg transition-shadow duration-150",
            scrolled && "shadow-md"
          )}
        >
          <div className="flex items-center h-10 px-1.5">
            {/* Logo */}
            <Link href="/home">
              <div className="flex items-center gap-1.5 px-1.5 cursor-pointer group shrink-0">
                <img
                  src={quantEdgeLabsLogoUrl}
                  alt="QuantEdge"
                  className="h-6 w-6 object-contain"
                />
                <div className="hidden xl:flex flex-col leading-none">
                  <span className="text-xs font-bold text-foreground tracking-tight">
                    QuantEdge
                  </span>
                  <span className="text-[8px] font-semibold text-muted-foreground tracking-[0.12em] uppercase font-mono">
                    Labs
                  </span>
                </div>
              </div>
            </Link>

            {/* Divider */}
            <div className="h-5 w-px bg-border mx-1.5 hidden md:block" />

            {/* Browser-Style Tabs — Bloomberg-dense */}
            <nav className="hidden md:flex items-center flex-1 min-w-0">
              <div className="flex items-end">
                {mainTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = location === tab.href;

                  return (
                    <Link key={tab.href} href={tab.href}>
                      <div
                        className={cn(
                          "relative flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer whitespace-nowrap rounded-md mx-px",
                          isActive
                            ? "bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        )}
                      >
                        <Icon className="h-3 w-3 shrink-0" />
                        <span>{tab.label}</span>
                        {isActive && (
                          <motion.div
                            layoutId="activeTab"
                            className="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full bg-[var(--brand-teal)]"
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          />
                        )}
                      </div>
                    </Link>
                  );
                })}

                {/* More Dropdown */}
                <div className="relative" ref={moreRef}>
                  <button
                    onClick={() => setMoreOpen(!moreOpen)}
                    className={cn(
                      "flex items-center gap-0.5 px-2 py-1.5 text-xs font-medium transition-all cursor-pointer rounded-md mx-px whitespace-nowrap",
                      moreOpen || allMoreItems.some(item => location === item.href)
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    )}
                  >
                    <span>More</span>
                    <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", moreOpen && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {moreOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.12 }}
                        className="absolute top-full left-0 mt-1 w-48 rounded-lg border border-border bg-popover/95 backdrop-blur-xl shadow-lg overflow-hidden z-50"
                      >
                        <div className="p-1">
                          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-mono px-2 py-1">
                            Tools
                          </p>
                          {moreToolItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = location === item.href;
                            return (
                              <Link key={item.href} href={item.href}>
                                <div
                                  onClick={() => setMoreOpen(false)}
                                  className={cn(
                                    "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer",
                                    isActive
                                      ? "bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]"
                                      : "text-foreground/80 hover:bg-muted hover:text-foreground"
                                  )}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                  <span>{item.label}</span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                        <div className="border-t border-border mx-1" />
                        <div className="p-1">
                          <p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-mono px-2 py-1">
                            Learn
                          </p>
                          {moreResearchItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = location === item.href;
                            return (
                              <Link key={item.href} href={item.href}>
                                <div
                                  onClick={() => setMoreOpen(false)}
                                  className={cn(
                                    "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer",
                                    isActive
                                      ? "bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]"
                                      : "text-foreground/80 hover:bg-muted hover:text-foreground"
                                  )}
                                >
                                  <Icon className="h-3.5 w-3.5" />
                                  <span>{item.label}</span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </nav>

            {/* Right Section */}
            <div className="flex items-center gap-1 ml-auto">
              {/* Search */}
              <div className="hidden md:flex w-44 lg:w-52">
                <UniversalSearchHero variant="default" placeholder="Search..." />
              </div>

              {/* Live Badge */}
              <Badge
                variant="outline"
                className="hidden sm:flex border-[var(--trade-bullish)]/30 bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)] text-[9px] px-1.5 py-0 h-5 font-mono"
              >
                <div className="w-1 h-1 rounded-full bg-[var(--trade-bullish)] animate-pulse mr-1" />
                LIVE
              </Badge>

              {/* Quick Links */}
              <Link href="/performance">
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden lg:flex h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <Wallet className="h-3.5 w-3.5" />
                </Button>
              </Link>

              <Link href="/settings">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </Link>

              {/* User Avatar */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="cursor-pointer"
                >
                  <Avatar className="h-6 w-6 border border-[var(--brand-teal)]/30 hover:border-[var(--brand-teal)]/50 transition-colors">
                    <AvatarFallback className="bg-[var(--brand-teal)] text-white text-[10px] font-semibold">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </button>

                <AnimatePresence>
                  {userMenuOpen && isAuthenticated && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.98 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-full right-0 mt-1 w-48 rounded-lg border border-border bg-popover/95 backdrop-blur-xl shadow-lg overflow-hidden z-50"
                    >
                      <div className="px-2.5 py-2 border-b border-border">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {userData?.firstName || "User"}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate font-mono">
                          {userData?.email || ""}
                        </p>
                      </div>
                      <div className="p-1">
                        <Link href="/performance">
                          <div
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-foreground/80 hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                          >
                            <Wallet className="h-3.5 w-3.5" />
                            <span>Portfolio</span>
                          </div>
                        </Link>
                        <Link href="/history">
                          <div
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-foreground/80 hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                          >
                            <History className="h-3.5 w-3.5" />
                            <span>History</span>
                          </div>
                        </Link>
                        <Link href="/settings">
                          <div
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-foreground/80 hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                          >
                            <Settings className="h-3.5 w-3.5" />
                            <span>Settings</span>
                          </div>
                        </Link>
                        <div className="border-t border-border mx-1 my-0.5" />
                        <button
                          onClick={handleLogout}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-destructive hover:bg-destructive/10 cursor-pointer w-full transition-colors"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          <span>Sign out</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
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
              className="md:hidden mt-2 bg-popover/95 backdrop-blur-xl border border-border rounded-xl overflow-hidden shadow-xl"
            >
              {/* Mobile Search */}
              <div className="p-3 border-b border-border">
                <UniversalSearchHero variant="default" placeholder="Search..." />
              </div>

              <div className="p-2 space-y-0.5">
                {mainTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = location === tab.href;
                  return (
                    <Link key={tab.href} href={tab.href}>
                      <div
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                          isActive
                            ? "bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]"
                            : "text-foreground/80 hover:bg-muted"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{tab.label}</span>
                      </div>
                    </Link>
                  );
                })}

                <div className="border-t border-border my-2" />
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono px-3 py-1">Tools</p>
                {moreToolItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                          isActive
                            ? "bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]"
                            : "text-foreground/80 hover:bg-muted"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  );
                })}

                <div className="border-t border-border my-2" />
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono px-3 py-1">Learn</p>
                {moreResearchItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                          isActive
                            ? "bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]"
                            : "text-foreground/80 hover:bg-muted"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  );
                })}

                {isAuthenticated && (
                  <>
                    <div className="border-t border-border my-2" />
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono px-3 py-1">Account</p>
                    <Link href="/performance">
                      <div
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground/80 hover:bg-muted cursor-pointer"
                      >
                        <Wallet className="h-5 w-5" />
                        <span>Portfolio</span>
                      </div>
                    </Link>
                    <Link href="/history">
                      <div
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-foreground/80 hover:bg-muted cursor-pointer"
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
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 cursor-pointer w-full transition-colors"
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
