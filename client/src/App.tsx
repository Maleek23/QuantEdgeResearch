import { Suspense, useState, useEffect, ComponentType } from "react";
import { getMarketStatus } from "@/lib/market-hours";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { RealtimePricesProvider } from "@/context/realtime-prices-context";
import { useAuth } from "@/hooks/useAuth";
import { usePageTracking } from "@/hooks/use-analytics";
import { Button } from "@/components/ui/button";
import { LogOut, User, Loader2, Search } from "lucide-react";
import { Footer } from "@/components/footer";
import { AIChatbotPopup } from "@/components/ai-chatbot-popup";
import { ProtectedRoute, AdminProtectedRoute } from "@/components/protected-route";
import { PreferencesProvider, usePreferences } from "@/contexts/preferences-context";
import { PersonalizationToolbar } from "@/components/ui/personalization-toolbar";
import { ContentDensityProvider } from "@/hooks/use-content-density";
import { DensityProvider } from "@/components/ui/qe";
import { ErrorBoundary } from "@/components/error-boundary";
import { StockContextProvider } from "@/contexts/stock-context";
import { lazyWithRetry } from "@/lib/lazy-import";
import { CommandPalette } from "@/components/command-palette";
import { WhatsNewDrawer, WhatsNewToast } from "@/components/whats-new";

// All page imports use lazyWithRetry for automatic chunk-load error recovery.
// If a deployment changes chunk hashes, stale cached HTML won't crash —
// the app retries and auto-reloads to pick up the new chunks.
// ─── 6 PRIMARY SHELLS (new IA) — Home / Hunt / GEX / Research / Positions / Journal ───
const TerminalShell  = lazyWithRetry(() => import("@/pages/shells/terminal-shell"),  "terminal-shell");
const ChartLab       = lazyWithRetry(() => import("@/pages/chart-lab"),              "chart-lab");
const HomeShell      = lazyWithRetry(() => import("@/pages/shells/pulse-shell"),     "home-shell");
const HuntShell      = lazyWithRetry(() => import("@/pages/shells/hunt-shell"),      "hunt-shell");
const GexShell       = lazyWithRetry(() => import("@/pages/shells/gex-shell"),       "gex-shell");
const ResearchShell  = lazyWithRetry(() => import("@/pages/shells/research-shell"),  "research-shell");
const PositionsShell = lazyWithRetry(() => import("@/pages/shells/positions-shell"), "positions-shell");
const JournalShell   = lazyWithRetry(() => import("@/pages/shells/journal-shell"),   "journal-shell");
const RadarPage      = lazyWithRetry(() => import("@/pages/radar"),                  "radar");
const HowToPage      = lazyWithRetry(() => import("@/pages/how-to"),                 "how-to");

const Landing = lazyWithRetry(() => import("@/pages/landing"), "landing");
const PublicWatchlist = lazyWithRetry(() => import("@/pages/public-watchlist"), "public-watchlist");
const Login = lazyWithRetry(() => import("@/pages/login"), "login");
const Signup = lazyWithRetry(() => import("@/pages/signup"), "signup");
const TradeDeskPage = lazyWithRetry(() => import("@/pages/trade-desk"), "trade-desk");
const TradeJournalPage = lazyWithRetry(() => import("@/pages/trade-journal"), "trade-journal");
const StockDetailPage = lazyWithRetry(() => import("@/pages/stock-detail"), "stock-detail");
// REMOVED — Market page consolidated, redirect to /home
const PerformancePage = lazyWithRetry(() => import("@/pages/performance"), "performance");
const SettingsPage = lazyWithRetry(() => import("@/pages/settings"), "settings");
const AdminOverview = lazyWithRetry(() => import("@/pages/admin/overview"), "admin-overview");
const AdminUsers = lazyWithRetry(() => import("@/pages/admin/users"), "admin-users");
const AdminInvites = lazyWithRetry(() => import("@/pages/admin/invites"), "admin-invites");
const AdminWaitlist = lazyWithRetry(() => import("@/pages/admin/waitlist"), "admin-waitlist");
const AdminSystem = lazyWithRetry(() => import("@/pages/admin/system"), "admin-system");
const AdminReports = lazyWithRetry(() => import("@/pages/admin/reports"), "admin-reports");
const AdminSecurity = lazyWithRetry(() => import("@/pages/admin/security"), "admin-security");
const AdminWinLoss = lazyWithRetry(() => import("@/pages/admin/win-loss"), "admin-win-loss");
const AdminCredits = lazyWithRetry(() => import("@/pages/admin/credits"), "admin-credits");
const AdminBetaInvites = lazyWithRetry(() => import("@/pages/admin/beta-invites"), "admin-beta-invites");
const AdminBlog = lazyWithRetry(() => import("@/pages/admin/blog"), "admin-blog");
const AdminTradeIdeas = lazyWithRetry(() => import("@/pages/admin/trade-ideas"), "admin-trade-ideas");
const About = lazyWithRetry(() => import("@/pages/about"), "about");
const PrivacyPolicy = lazyWithRetry(() => import("@/pages/privacy-policy"), "privacy-policy");
const TermsOfService = lazyWithRetry(() => import("@/pages/terms-of-service"), "terms-of-service");
const SuccessStories = lazyWithRetry(() => import("@/pages/success-stories"), "success-stories");
const ChartDatabase = lazyWithRetry(() => import("@/pages/chart-database"), "chart-database");
const MarketPulse = lazyWithRetry(() => import("@/pages/market-pulse"), "market-pulse");
const FlowHeatmap = lazyWithRetry(() => import("@/pages/flow-heatmap"), "flow-heatmap");
const PositionsHeatmap = lazyWithRetry(() => import("@/pages/positions-heatmap"), "positions-heatmap");
const StrategySimulator = lazyWithRetry(() => import("@/pages/strategy-simulator"), "strategy-simulator");
const Backtest = lazyWithRetry(() => import("@/pages/backtest"), "backtest");
const ConvictionBacktest = lazyWithRetry(() => import("@/pages/conviction-backtest"), "conviction-backtest");
const Academy = lazyWithRetry(() => import("@/pages/academy"), "academy");
const Blog = lazyWithRetry(() => import("@/pages/blog"), "blog");
const TradingRules = lazyWithRetry(() => import("@/pages/trading-rules"), "trading-rules");
const BlogPost = lazyWithRetry(() => import("@/pages/blog-post"), "blog-post");
const Pricing = lazyWithRetry(() => import("@/pages/pricing"), "pricing");
// REMOVED — Paper Trading, Wallet Tracker, CT Tracker consolidated out
// Redirects added below to prevent broken bookmarks
const TradeAudit = lazyWithRetry(() => import("@/pages/trade-audit"), "trade-audit");
const AutomationsPage = lazyWithRetry(() => import("@/pages/automations"), "automations");
const Features = lazyWithRetry(() => import("@/pages/features"), "features");
const StyleLab = lazyWithRetry(() => import("@/pages/style-lab"), "style-lab");
const StyleGlass = lazyWithRetry(() => import("@/pages/style-glass"), "style-glass");
const HomeGlass = lazyWithRetry(() => import("@/pages/home-glass"), "home-glass");
// REMOVED — Backtest merged into Performance tab
const TechnicalGuide = lazyWithRetry(() => import("@/pages/technical-guide"), "technical-guide");
// MERGED — Market Scanner folded into Hunt → Surges tab
// MERGED — Bullish Trends absorbed into Market Scanner
// MERGED — Trading Engine absorbed into Performance
// /watchlist + /watchlist/weekly now redirect into the Hunt shell's Watchlist tab
// (single canonical surface); the component is loaded lazily by hunt-shell.tsx.
// REMOVED — Weekly Watchlist tab lives in unified-watchlist, Conviction Backtest in Performance
const HomePage = lazyWithRetry(() => import("@/pages/home"), "home");
// REMOVED — AION consolidated out, redirect added below
const StrategyPlaybooks = lazyWithRetry(() => import("@/pages/strategy-playbooks"), "strategy-playbooks");
// REMOVED — Historical Intelligence merged into Performance tab
const AnalysisPage = lazyWithRetry(() => import("@/pages/analysis"), "analysis");
const NotFound = lazyWithRetry(() => import("@/pages/not-found"), "not-found");
const JoinBeta = lazyWithRetry(() => import("@/pages/join-beta"), "join-beta");
const InviteWelcome = lazyWithRetry(() => import("@/pages/invite-welcome"), "invite-welcome");
const ForgotPassword = lazyWithRetry(() => import("@/pages/forgot-password"), "forgot-password");
const ResetPassword = lazyWithRetry(() => import("@/pages/reset-password"), "reset-password");
const LearningDashboard = lazyWithRetry(() => import("@/pages/learning-dashboard"), "learning-dashboard");
// MERGED — Discover absorbed into Trade Desk
const HistoryPage = lazyWithRetry(() => import("@/pages/history"), "history");
const DesignSystemTest = lazyWithRetry(() => import("@/pages/design-system-test"), "design-system-test");
const MarketOutlook = lazyWithRetry(() => import("@/pages/market-outlook"), "market-outlook");
const CommandCenterLegacy = lazyWithRetry(() => import("@/pages/command"), "command-legacy");
const OlAlgoPage = lazyWithRetry(() => import("@/pages/olalgo"), "olalgo");
// Terminal — full-screen Skylit-style dedicated pages
// MERGED: /terminal/:symbol now redirects to Research (/r/:symbol?tab=chart)
// MERGED: Heatmap view now lives inside unified terminal-chart.tsx
// const TerminalHeatmap = lazyWithRetry(() => import("@/pages/terminal-heatmap"), "terminal-heatmap");
const TerminalTrinity = lazyWithRetry(() => import("@/pages/terminal-trinity"), "terminal-trinity");

// Preload critical routes after initial render (during idle time).
// This warms the chunk cache so navigation feels instant.
function preloadCriticalRoutes() {
  // Use requestIdleCallback (or setTimeout fallback) to avoid blocking initial paint
  const schedule = typeof requestIdleCallback !== "undefined" ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 2000);
  schedule(() => {
    // Preload the most-visited authenticated pages
    import("@/pages/home").catch(() => {});
    import("@/pages/trade-desk").catch(() => {});
    import("@/pages/market-scanner").catch(() => {});
  });
  // Defer heavier pages a bit more
  setTimeout(() => {
    import("@/pages/stock-detail").catch(() => {});
    import("@/pages/trade-desk").catch(() => {});
  }, 4000);
}

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full">
      <Loader2 className="h-8 w-8 animate-spin text-cyan-400/60" />
    </div>
  );
}

function withBetaProtection<P extends object>(Component: ComponentType<P>) {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedRoute requireBetaAccess={true}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}

function withAdminProtection<P extends object>(Component: ComponentType<P>) {
  return function AdminProtectedComponent(props: P) {
    return (
      <AdminProtectedRoute>
        <Component {...props} />
      </AdminProtectedRoute>
    );
  };
}
function SmartLanding() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  // If logged in, restore last visited page (or default to /p — Home)
  if (user) {
    const lastPage = localStorage.getItem('qe-last-page') || '/p';
    return <Redirect to={lastPage} />;
  }

  // Otherwise show landing page
  return <Landing />;
}

function Router() {
  usePageTracking();

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* ─── TERMINAL — the consolidation target: one shell, 5 tabs (Oracle/Flow/Heatmap/GEX/PRISM) ─── */}
        <Route path="/t"          component={withBetaProtection(TerminalShell)} />
        {/* Charting POC — public dev route (gate before prod) */}
        <Route path="/chartlab"   component={ChartLab} />
        {/* ─── 6 PRIMARY SHELLS — new IA (Home / Hunt / GEX / Research / Positions / Journal) ─── */}
        <Route path="/p"          component={withBetaProtection(HomeShell)} />
        <Route path="/h"          component={withBetaProtection(HuntShell)} />
        <Route path="/g"          component={withBetaProtection(GexShell)} />
        <Route path="/r/:symbol"  component={withBetaProtection(ResearchShell)} />
        <Route path="/r"          component={withBetaProtection(ResearchShell)} />
        <Route path="/pos"        component={withBetaProtection(PositionsShell)} />
        <Route path="/j"          component={withBetaProtection(JournalShell)} />
        <Route path="/radar"      component={withBetaProtection(RadarPage)} />
        {/* Folded into shells — Movers/BTC → Hunt tabs, Analyze → Research tab */}
        <Route path="/btc"><Redirect to="/h?tab=btc" /></Route>
        <Route path="/movers"><Redirect to="/h?tab=movers" /></Route>
        <Route path="/analyze"><Redirect to="/r/SPY?tab=analyze" /></Route>
        <Route path="/how-to"     component={withBetaProtection(HowToPage)} />

        {/* Public, read-only shared watchlist (no auth) — for trading groups */}
        <Route path="/w" component={PublicWatchlist} />

        {/* Core Pages - Smart redirect for logged-in users */}
        <Route path="/" component={SmartLanding} />
      {/* AI Learning Dashboard */}

      {/* Whale Flow → GEX flow heatmap (single hop; chained redirects drop the query param) */}
      <Route path="/whale-flow">
        <Redirect to="/g?tab=heatmap" />
      </Route>

      {/* Home Dashboard - Main landing for logged in users */}
      <Route path="/dashboard">
        <Redirect to="/home" />
      </Route>
      <Route path="/command-center">
        <Redirect to="/home" />
      </Route>
      <Route path="/command-center-v2">
        <Redirect to="/home" />
      </Route>
      {/* MERGED: Trading Engine → Performance */}
      <Route path="/trading-engine"><Redirect to="/performance" /></Route>
      <Route path="/aion"><Redirect to="/home" /></Route>
      {/* ML Intelligence consolidated into Trading Engine */}
      <Route path="/historical-intelligence"><Redirect to="/performance" /></Route>
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/join-beta" component={JoinBeta} />
      <Route path="/invite/:token">{(params) => <Redirect to={`/invite?code=${params.token}`} />}</Route>
      <Route path="/invite" component={InviteWelcome} />
      {/* DEPRECATED — these routes redirect to canonical destinations to reduce surface area */}
      <Route path="/discovery"><Redirect to="/h?tab=ai-picks" /></Route>
      <Route path="/pulse"><Redirect to="/p?tab=pulse" /></Route>
      <Route path="/chart-analysis"><Redirect to="/r/SPY?tab=chart" /></Route>
      {/* Standalone scanners folded into GEX shell tabs */}
      <Route path="/gex-dashboard"><Redirect to="/g?tab=analysis" /></Route>
      <Route path="/gex-scanner"><Redirect to="/g?tab=hub" /></Route>
      <Route path="/weekly-watchlist"><Redirect to="/watchlist" /></Route>
      <Route path="/paper-trading"><Redirect to="/home" /></Route>
      <Route path="/wallet-tracker"><Redirect to="/home" /></Route>
      <Route path="/ct-tracker"><Redirect to="/home" /></Route>
      <Route path="/wsb-trending"><Redirect to="/trade-desk" /></Route>
      <Route path="/social-trends"><Redirect to="/trade-desk" /></Route>
      <Route path="/watchlist-bot">
        <Redirect to="/automations" />
      </Route>
      {/* duplicate /chart-analysis already handled above by redirect */}
      <Route path="/options-analyzer"><Redirect to="/r/SPY?tab=options" /></Route>
      <Route path="/smart-advisor"><Redirect to="/performance" /></Route>
      <Route path="/research">
        <Redirect to="/home" />
      </Route>
      {/*
       * Stock detail (legacy) — kept reachable at /stock-legacy/:symbol so
       * we can compare against the new ticker page during migration. The
       * canonical /stock/:symbol now redirects to the new ticker page so
       * external links and shared URLs land on the unified destination.
       */}
      <Route path="/stock/:symbol">
        {(params) => <Redirect to={`/r/${params.symbol}?tab=chart`} />}
      </Route>
      {/* MERGED: Discover → Trade Desk */}
      <Route path="/discover"><Redirect to="/trade-desk" /></Route>
      <Route path="/market-movers">
        <Redirect to="/home" />
      </Route>
      <Route path="/watchlist"><Redirect to="/h?tab=watchlist" /></Route>
      <Route path="/watchlist/weekly"><Redirect to="/h?tab=watchlist" /></Route>
      <Route path="/convictions/backtest"><Redirect to="/performance" /></Route>
      <Route path="/ai-stock-picker">
        <Redirect to="/trade-desk" />
      </Route>
      <Route path="/smart-signals">
        <Redirect to="/h?tab=surges" />
      </Route>
      <Route path="/smart-money"><Redirect to="/g?tab=heatmap" /></Route>
      <Route path="/trade-ideas/:id/audit" component={withBetaProtection(TradeAudit)} />
      <Route path="/data-audit">
        <Redirect to="/performance" />
      </Route>
      {/* Market Scanner folded into Hunt → Surges tab */}
      <Route path="/market-scanner"><Redirect to="/h?tab=surges" /></Route>
      <Route path="/pattern-scanner">
        <Redirect to="/chart-analysis" />
      </Route>
      <Route path="/swing-scanner">
        <Redirect to="/h?tab=surges" />
      </Route>
      {/* MERGED: Bullish Trends → Hunt Surges */}
      <Route path="/bullish-trends"><Redirect to="/h?tab=surges" /></Route>
      <Route path="/futures">
        <Redirect to="/trade-desk?tab=futures" />
      </Route>
      <Route path="/futures-research">
        <Redirect to="/trade-desk?tab=futures" />
      </Route>
      <Route path="/crypto">
        {/* Crypto redirects to trade desk with crypto focus */}
        <Redirect to="/trade-desk?asset=crypto" />
      </Route>
      
      {/* Market Outlook — public (no auth), answers "what's tomorrow look like?" */}

      {/* Research & Community Pages */}
      
      {/* System Pages */}
      <Route path="/settings" component={withBetaProtection(SettingsPage)} />
      <Route path="/account">
        <Redirect to="/settings" />
      </Route>
      <Route path="/my-account">
        <Redirect to="/settings" />
      </Route>

      {/* Admin Pages - Have their own password auth via AdminLayout */}
      <Route path="/admin" component={AdminOverview} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/invites" component={AdminInvites} />
      <Route path="/admin/waitlist" component={AdminWaitlist} />
      <Route path="/admin/system" component={AdminSystem} />
      <Route path="/admin/trade-ideas" component={AdminTradeIdeas} />
      <Route path="/admin/blog" component={AdminBlog} />
      <Route path="/admin/reports" component={AdminReports} />
      <Route path="/admin/security" component={AdminSecurity} />
      <Route path="/admin/win-loss" component={AdminWinLoss} />
      <Route path="/admin/credits" component={AdminCredits} />
      <Route path="/admin/beta-invites" component={AdminBetaInvites} />
      <Route path="/about" component={About} />
      
      {/* Legal Pages */}
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      
      {/* Redirects - Consolidated Pages */}
      <Route path="/trade-ideas">
        <Redirect to="/trade-desk" />
      </Route>
      <Route path="/insights">
        <Redirect to="/performance" />
      </Route>
      <Route path="/analytics">
        <Redirect to="/performance" />
      </Route>
      <Route path="/signals">
        <Redirect to="/performance" />
      </Route>

      {/* Redirects - Removed Pages */}
      <Route path="/trading-guide">
        <Redirect to="/blog/how-to-trade-like-a-pro" />
      </Route>
      <Route path="/learn-more">
        <Redirect to="/" />
      </Route>
      
      {/*
       * ═══════════════════════════════════════════════════════════════════
       * COMMAND WORKSPACE — unified per-symbol chart destination.
       *
       * One URL pattern (/command/:symbol?) owns the chart workspace. All
       * legacy chart entry points (gex per-ticker, projector, chart-analysis,
       * spx, stock detail) redirect here. Every layer/panel on the screen is
       * driven by URL query params so deep-links remain shareable:
       *
       *   /command/SPY                  — default orbs layout
       *   /command/SPY?layer=gex        — GEX layer active
       *   /command/SPY?layer=gex+vex    — both
       *   /command/SPY?panel=projection — projection arc visible
       *   /command/SPY?interval=5m      — timeframe
       *
       * /command (no symbol) resolves to /command/SPY.
       * /command-legacy is the old projector+intelligence page, kept as a
       * reference while we migrate its features into this workspace.
       * ═══════════════════════════════════════════════════════════════════
       */}
      {/*
       * ═══════════════════════════════════════════════════════════════
       * TICKER PAGE — canonical per-symbol destination.
       *
       * Every analytic about ONE ticker lives here as a tab:
       *   /t/PLTR              → defaults to /t/PLTR/chart
       *   /t/PLTR/overview     → 5-second trader read
       *   /t/PLTR/chart        → Skylit chart workspace
       *   /t/PLTR/gex          → full GEX heatmap + per-strike
       *   /t/PLTR/options      → strikes / flow / P/C  (stub)
       *   /t/PLTR/vol          → IV surface, term structure (stub)
       *   /t/PLTR/projection   → magnet target + scenarios  (stub)
       *   /t/PLTR/catalysts    → earnings, news, macro  (stub)
       *
       * The OLD per-page chart entry points (/command, /stock, /gex/:s)
       * redirect into this single home so links don't rot.
       * ═══════════════════════════════════════════════════════════════
       */}
      {/* ═══════════════════════════════════════════════════════════════
       * TERMINAL — full-screen Skylit-style dedicated pages
       * Each tool gets its own page, not crammed into tabs.
       * ═══════════════════════════════════════════════════════════════ */}
      {/* ALL per-ticker entry points funnel into the canonical Research home
          (/r/:symbol). Research's Chart tab IS TerminalChart, Options tab IS
          OptionsAnalyzer, GEX tab IS TerminalHeatmap — so these are lossless. */}
      <Route path="/terminal/heatmap"><Redirect to="/r/SPY?tab=gex" /></Route>
      <Route path="/terminal/:symbol">
        {(params) => <Redirect to={`/r/${params.symbol}?tab=chart`} />}
      </Route>
      <Route path="/terminal"><Redirect to="/r/SPY?tab=chart" /></Route>

      {/* TICKER (legacy /t) — folded into Research */}
      <Route path="/t/:symbol/:tab">
        {(params) => <Redirect to={`/r/${params.symbol}`} />}
      </Route>
      <Route path="/t/:symbol">
        {(params) => <Redirect to={`/r/${params.symbol}`} />}
      </Route>
      <Route path="/t"><Redirect to="/r/SPY" /></Route>

      {/* Legacy chart workspace aliases → Research */}
      <Route path="/command/:symbol">
        {(params) => <Redirect to={`/r/${params.symbol}?tab=chart`} />}
      </Route>
      <Route path="/command"><Redirect to="/r/SPY?tab=chart" /></Route>
      <Route path="/projector"><Redirect to="/r/SPY?tab=chart" /></Route>
      <Route path="/spx"><Redirect to="/r/SPX?tab=chart" /></Route>
      <Route path="/gex/:symbol">
        {(params) => <Redirect to={`/r/${params.symbol}?tab=gex`} />}
      </Route>
      {/* Flow — options flow + GEX + smart money (tabs) */}
      {/* /flow redirects to the GEX & Flow Hub which has the Flow tab */}
      {/* GEX Hub merged into Flow as a tab */}
      <Route path="/gex"><Redirect to="/g?tab=hub" /></Route>
      {/* OlAlgo Bot — challenge backtest dashboard */}
      {/* Convictions merged into Trade Desk — redirect for back-compat */}
      <Route path="/convictions"><Redirect to="/trade-desk?preset=todays-best" /></Route>
      <Route path="/scanner/gex"><Redirect to="/g?tab=hub" /></Route>
      <Route path="/gex-legacy"><Redirect to="/g?tab=hub" /></Route>
      {/* Geopolitical Reaction Matrix */}
      <Route path="/geopolitical"><Redirect to="/command" /></Route>
      {/* Redirects */}
      <Route path="/trade-desk-v2"><Redirect to="/trade-desk" /></Route>

      {/* Design System Test — admin only */}

      {/* 404 Fallback */}
      <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AuthHeader() {
  const { user, logout, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [marketStatus, setMarketStatus] = useState({ isOpen: false, statusMessage: 'Checking...' });

  useEffect(() => {
    const updateStatus = () => {
      const status = getMarketStatus();
      setMarketStatus(status);
    };
    updateStatus();
    const interval = setInterval(updateStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const userData = user as { email?: string; firstName?: string } | null;

  return (
    <header className="flex items-center justify-between gap-2 px-3 h-10 border-b border-border/40 bg-card/50 backdrop-blur-sm shrink-0">
      {/* Left — trigger + market status */}
      <div className="flex items-center gap-2">
        <SidebarTrigger data-testid="button-mobile-menu" className="h-7 w-7 text-muted-foreground" />
        <div className="h-4 w-px bg-border hidden sm:block" />
        <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
          <span className={`h-1 w-1 rounded-full ${marketStatus.isOpen ? 'bg-[var(--trade-bullish)] animate-pulse' : 'bg-muted-foreground'}`} />
          {marketStatus.isOpen ? 'OPEN' : 'CLOSED'}
        </span>
      </div>

      {/* Right — search, user, theme */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[10px] font-mono text-muted-foreground hover:text-foreground gap-1.5 hidden sm:flex"
          onClick={() => window.dispatchEvent(new Event('qe:open-command-palette'))}
        >
          <Search className="h-3 w-3" />
          Search
          <kbd className="ml-1 px-1 py-0 text-[8px] bg-muted rounded border border-border text-muted-foreground/50">⌘K</kbd>
        </Button>
        {isAuthenticated && userData && (
          <>
            <span className="hidden md:inline text-[10px] font-mono text-muted-foreground/60 truncate max-w-[120px]">
              {userData.firstName || userData.email || 'User'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              data-testid="button-logout"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3 w-3" />
            </Button>
          </>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

function App() {
  const [location] = useLocation();

  // Preload critical routes once after first render
  useEffect(() => {
    preloadCriticalRoutes();
  }, []);

  // Track last visited page for session persistence across reloads
  useEffect(() => {
    const path = location.split('?')[0];
    // Only save authenticated app pages (not landing/login/public)
    const skipPaths = ['/', '/w', '/landing', '/login', '/signup', '/invite', '/join-beta'];
    if (!skipPaths.includes(path) && !path.startsWith('/admin') && !path.startsWith('/invite/')) {
      localStorage.setItem('qe-last-page', location);
    }
  }, [location]);

  const style = {
    "--sidebar-width": "14rem",
    "--sidebar-width-icon": "3rem",
  };

  // Show public landing pages without sidebar (admin page handles its own layout)
  // Strip query parameters for comparison since location may include ?code=XXX etc.
  const locationPath = location.split('?')[0];
  const publicPages = ['/', '/w', '/landing', '/features', '/chartlab', '/login', '/signup', '/invite', '/join-beta', '/admin', '/admin/users', '/admin/invites', '/admin/waitlist', '/admin/system', '/admin/trade-ideas', '/admin/reports', '/admin/security', '/admin/win-loss', '/admin/credits', '/admin/beta-invites', '/admin/blog', '/admin/old', '/privacy', '/terms', '/about', '/academy', '/blog', '/pricing'];
  // Also check for dynamic invite paths like /invite/:token
  const isPublicPage = publicPages.includes(locationPath) || locationPath.startsWith('/invite/');
  if (isPublicPage) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark" storageKey="quantedge-theme">
          <TooltipProvider>
            <RealtimePricesProvider>
              <StockContextProvider>
                <Router />
                <CommandPalette />
                <WhatsNewDrawer />
                <WhatsNewToast />
                <Toaster />
              </StockContextProvider>
            </RealtimePricesProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  // TERMINAL (/t) — full-bleed, no sidebar. Top-nav only (ADR-0001). Keeps every
  // provider so nested engines/components still work; the Terminal shell supplies
  // its own chrome (header + tabs + footer), so AppSidebar/AuthHeader/Footer are dropped.
  if (locationPath === '/t') {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark" storageKey="quantedge-theme">
          <TooltipProvider>
            <RealtimePricesProvider>
              <StockContextProvider>
                <PreferencesProvider>
                  <ContentDensityProvider>
                    <DensityProvider>
                      <SidebarProvider style={style as React.CSSProperties}>
                        <div className="h-screen w-full overflow-auto page-atmosphere">
                          <ErrorBoundary>
                            <Suspense fallback={<PageLoader />}>
                              <Router />
                            </Suspense>
                          </ErrorBoundary>
                        </div>
                      </SidebarProvider>
                      <CommandPalette />
                      <WhatsNewDrawer />
                      <WhatsNewToast />
                      <Toaster />
                    </DensityProvider>
                  </ContentDensityProvider>
                </PreferencesProvider>
              </StockContextProvider>
            </RealtimePricesProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  // Sidebar layout — primary navigation
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="quantedge-theme">
        <TooltipProvider>
          <RealtimePricesProvider>
            <StockContextProvider>
              <PreferencesProvider>
                <ContentDensityProvider>
                  <DensityProvider>
                    <SidebarProvider style={style as React.CSSProperties}>
                      <div className="flex h-screen w-full">
                        <AppSidebar />
                        <MainContentWrapper />
                      </div>
                    </SidebarProvider>
                    <CommandPalette />
                    <WhatsNewDrawer />
                    <WhatsNewToast />
                    <AIChatbotPopup />
                    <Toaster />
                  </DensityProvider>
                </ContentDensityProvider>
              </PreferencesProvider>
            </StockContextProvider>
          </RealtimePricesProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Responsive wrapper that adjusts to sidebar state (legacy)
function MainContentWrapper() {
  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-200 page-atmosphere">
      <AuthHeader />
      <div className="flex-1 overflow-auto flex flex-col">
        <main className="flex-1 w-full">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Router />
            </Suspense>
          </ErrorBoundary>
        </main>
        <Footer />
      </div>
    </div>
  );
}

export default App;
