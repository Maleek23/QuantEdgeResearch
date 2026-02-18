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
import { AuroraBackground } from "@/components/aurora-background";
import { CommandRail } from "@/components/command-rail";
import { AuroraLayoutProvider, useAuroraLayout } from "@/contexts/aurora-layout-context";
import { GlassHeader } from "@/components/glass-header";
import { RealtimePricesProvider } from "@/context/realtime-prices-context";
import { useAuth } from "@/hooks/useAuth";
import { usePageTracking } from "@/hooks/use-analytics";
import { Button } from "@/components/ui/button";
import { LogOut, User, Loader2 } from "lucide-react";
import { Footer } from "@/components/footer";
import { ScrollParticles } from "@/components/scroll-particles";
import { AIChatbotPopup } from "@/components/ai-chatbot-popup";
import { HighConvictionAlertProvider } from "@/components/high-conviction-alert";
import { cn } from "@/lib/utils";
import { ProtectedRoute, AdminProtectedRoute } from "@/components/protected-route";
import { PreferencesProvider, usePreferences } from "@/contexts/preferences-context";
import { PersonalizationToolbar } from "@/components/ui/personalization-toolbar";
import { ContentDensityProvider } from "@/hooks/use-content-density";
import { ErrorBoundary } from "@/components/error-boundary";
import { StockContextProvider } from "@/contexts/stock-context";
import { lazyWithRetry } from "@/lib/lazy-import";

// All page imports use lazyWithRetry for automatic chunk-load error recovery.
// If a deployment changes chunk hashes, stale cached HTML won't crash —
// the app retries and auto-reloads to pick up the new chunks.
const Landing = lazyWithRetry(() => import("@/pages/landing"), "landing");
const Login = lazyWithRetry(() => import("@/pages/login"), "login");
const Signup = lazyWithRetry(() => import("@/pages/signup"), "signup");
const TradeDeskPage = lazyWithRetry(() => import("@/pages/trade-desk"), "trade-desk");
const ChartAnalysis = lazyWithRetry(() => import("@/pages/chart-analysis"), "chart-analysis");
const StockDetailPage = lazyWithRetry(() => import("@/pages/stock-detail"), "stock-detail");
const MarketPage = lazyWithRetry(() => import("@/pages/market"), "market");
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
const Academy = lazyWithRetry(() => import("@/pages/academy"), "academy");
const Blog = lazyWithRetry(() => import("@/pages/blog"), "blog");
const TradingRules = lazyWithRetry(() => import("@/pages/trading-rules"), "trading-rules");
const BlogPost = lazyWithRetry(() => import("@/pages/blog-post"), "blog-post");
const Pricing = lazyWithRetry(() => import("@/pages/pricing"), "pricing");
const PaperTrading = lazyWithRetry(() => import("@/pages/paper-trading"), "paper-trading");
const WalletTracker = lazyWithRetry(() => import("@/pages/wallet-tracker"), "wallet-tracker");
const CTTracker = lazyWithRetry(() => import("@/pages/ct-tracker"), "ct-tracker");
const TradeAudit = lazyWithRetry(() => import("@/pages/trade-audit"), "trade-audit");
const AutomationsPage = lazyWithRetry(() => import("@/pages/automations"), "automations");
const Features = lazyWithRetry(() => import("@/pages/features"), "features");
const BacktestPage = lazyWithRetry(() => import("@/pages/backtest"), "backtest");
const TechnicalGuide = lazyWithRetry(() => import("@/pages/technical-guide"), "technical-guide");
const MarketScanner = lazyWithRetry(() => import("@/pages/market-scanner"), "market-scanner");
const BullishTrends = lazyWithRetry(() => import("@/pages/bullish-trends"), "bullish-trends");
const Dashboard = lazyWithRetry(() => import("@/pages/dashboard"), "dashboard");
const UnifiedWatchlist = lazyWithRetry(() => import("@/pages/unified-watchlist"), "unified-watchlist");
const TradingEnginePage = lazyWithRetry(() => import("@/pages/trading-engine"), "trading-engine");
const HomePage = lazyWithRetry(() => import("@/pages/home"), "home");
const StrategyPlaybooks = lazyWithRetry(() => import("@/pages/strategy-playbooks"), "strategy-playbooks");
const HistoricalIntelligence = lazyWithRetry(() => import("@/pages/historical-intelligence"), "historical-intelligence");
const AnalysisPage = lazyWithRetry(() => import("@/pages/analysis"), "analysis");
const NotFound = lazyWithRetry(() => import("@/pages/not-found"), "not-found");
const JoinBeta = lazyWithRetry(() => import("@/pages/join-beta"), "join-beta");
const InviteWelcome = lazyWithRetry(() => import("@/pages/invite-welcome"), "invite-welcome");
const OptionsAnalyzer = lazyWithRetry(() => import("@/pages/options-analyzer"), "options-analyzer");
const ForgotPassword = lazyWithRetry(() => import("@/pages/forgot-password"), "forgot-password");
const ResetPassword = lazyWithRetry(() => import("@/pages/reset-password"), "reset-password");
const LearningDashboard = lazyWithRetry(() => import("@/pages/learning-dashboard"), "learning-dashboard");
const DiscoverPage = lazyWithRetry(() => import("@/pages/discover"), "discover");
const SmartMoneyPage = lazyWithRetry(() => import("@/pages/smart-money"), "smart-money");
const HistoryPage = lazyWithRetry(() => import("@/pages/history"), "history");
const DesignSystemTest = lazyWithRetry(() => import("@/pages/design-system-test"), "design-system-test");
const SPXCommandCenter = lazyWithRetry(() => import("@/pages/spx-command-center"), "spx-command-center");

// Preload critical routes after initial render (during idle time).
// This warms the chunk cache so navigation feels instant.
function preloadCriticalRoutes() {
  // Use requestIdleCallback (or setTimeout fallback) to avoid blocking initial paint
  const schedule = typeof requestIdleCallback !== "undefined" ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 2000);
  schedule(() => {
    // Preload the most-visited authenticated pages
    import("@/pages/home").catch(() => {});
    import("@/pages/trade-desk").catch(() => {});
    import("@/pages/market").catch(() => {});
  });
  // Defer heavier pages a bit more
  setTimeout(() => {
    import("@/pages/smart-money").catch(() => {});
    import("@/pages/stock-detail").catch(() => {});
    import("@/pages/discover").catch(() => {});
  }, 4000);
}

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full fixed inset-0 bg-background/80 backdrop-blur-sm z-50">
      <Loader2 className="h-12 w-12 animate-spin text-cyan-400" />
      <p className="mt-4 text-sm text-slate-400 font-medium animate-pulse">Loading...</p>
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

  // If logged in, go to Home (main dashboard)
  if (user) {
    return <Redirect to="/home" />;
  }

  // Otherwise show landing page
  return <Landing />;
}

function Router() {
  usePageTracking();
  
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Core Pages - Smart redirect for logged-in users */}
        <Route path="/" component={SmartLanding} />
      <Route path="/features" component={Features} />
        <Route path="/landing" component={Landing} />
      {/* AI Learning Dashboard */}
      <Route path="/learning" component={withBetaProtection(LearningDashboard)} />

      {/* Whale Flow redirects to Smart Money */}
      <Route path="/whale-flow">
        <Redirect to="/smart-money" />
      </Route>

      {/* Home Dashboard - Main landing for logged in users */}
      <Route path="/home" component={withBetaProtection(HomePage)} />
      <Route path="/dashboard">
        <Redirect to="/home" />
      </Route>
      <Route path="/command-center">
        <Redirect to="/home" />
      </Route>
      <Route path="/command-center-v2">
        <Redirect to="/home" />
      </Route>
      <Route path="/trading-engine" component={withBetaProtection(TradingEnginePage)} />
      <Route path="/strategy-playbooks" component={withBetaProtection(StrategyPlaybooks)} />
      <Route path="/analysis/:symbol" component={withBetaProtection(AnalysisPage)} />
      <Route path="/analysis" component={withBetaProtection(AnalysisPage)} />
      {/* ML Intelligence consolidated into Trading Engine */}
      <Route path="/historical-intelligence" component={withBetaProtection(HistoricalIntelligence)} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/join-beta" component={JoinBeta} />
      <Route path="/invite/:token">{(params) => <Redirect to={`/invite?code=${params.token}`} />}</Route>
      <Route path="/invite" component={InviteWelcome} />
      <Route path="/trade-desk" component={withBetaProtection(TradeDeskPage)} />
      <Route path="/trade-desk/best-setups" component={withBetaProtection(TradeDeskPage)} />
      <Route path="/paper-trading" component={withBetaProtection(PaperTrading)} />
      <Route path="/wallet-tracker" component={withBetaProtection(WalletTracker)} />
      <Route path="/ct-tracker" component={withBetaProtection(CTTracker)} />
      <Route path="/wsb-trending">
        <Redirect to="/discover" />
      </Route>
      <Route path="/social-trends">
        <Redirect to="/discover" />
      </Route>
      <Route path="/watchlist-bot">
        <Redirect to="/automations" />
      </Route>
      <Route path="/automations" component={withBetaProtection(AutomationsPage)} />
      <Route path="/chart-analysis" component={withBetaProtection(ChartAnalysis)} />
      <Route path="/options-analyzer" component={withBetaProtection(OptionsAnalyzer)} />
      <Route path="/smart-advisor">
        <Redirect to="/trading-engine" />
      </Route>
      <Route path="/research">
        <Redirect to="/home" />
      </Route>
      {/* Stock detail is PUBLIC - visitors can browse and analyze any stock */}
      <Route path="/stock/:symbol" component={StockDetailPage} />
      <Route path="/discover" component={withBetaProtection(DiscoverPage)} />
      <Route path="/market-movers">
        <Redirect to="/market" />
      </Route>
      <Route path="/watchlist" component={withBetaProtection(UnifiedWatchlist)} />
      <Route path="/ai-stock-picker">
        <Redirect to="/trade-desk" />
      </Route>
      <Route path="/smart-signals">
        <Redirect to="/market-scanner" />
      </Route>
      <Route path="/smart-money" component={withBetaProtection(SmartMoneyPage)} />
      <Route path="/portfolio" component={withBetaProtection(PerformancePage)} />
      <Route path="/history/chat" component={withBetaProtection(HistoryPage)} />
      <Route path="/history/research" component={withBetaProtection(HistoryPage)} />
      <Route path="/history" component={withBetaProtection(HistoryPage)} />
      <Route path="/backtest" component={withBetaProtection(BacktestPage)} />
      <Route path="/performance" component={withBetaProtection(PerformancePage)} />
      <Route path="/trade-ideas/:id/audit" component={withBetaProtection(TradeAudit)} />
      <Route path="/data-audit">
        <Redirect to="/performance" />
      </Route>
      <Route path="/market" component={withBetaProtection(MarketPage)} />
      <Route path="/market-scanner" component={withBetaProtection(MarketScanner)} />
      <Route path="/pattern-scanner">
        <Redirect to="/chart-analysis" />
      </Route>
      <Route path="/swing-scanner">
        <Redirect to="/market-scanner" />
      </Route>
      <Route path="/bullish-trends" component={withBetaProtection(BullishTrends)} />
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
      <Route path="/signal-weights" component={PerformancePage} />
      
      {/* Research & Community Pages */}
      <Route path="/technical-guide" component={TechnicalGuide} />
      <Route path="/trading-rules" component={TradingRules} />
      <Route path="/chart-database" component={ChartDatabase} />
      <Route path="/success-stories" component={SuccessStories} />
      <Route path="/academy" component={Academy} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      
      {/* System Pages */}
      <Route path="/settings" component={withBetaProtection(SettingsPage)} />
      <Route path="/account">
        <Redirect to="/settings" />
      </Route>
      <Route path="/my-account">
        <Redirect to="/settings" />
      </Route>
      <Route path="/pricing" component={Pricing} />

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
      <Route path="/generate-ideas" component={TradeDeskPage} />
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
      <Route path="/holographic" component={NotFound} />
      <Route path="/learning" component={NotFound} />
      <Route path="/risk" component={NotFound} />
      
      {/* SPX Command Center - 0DTE Trading Hub */}
      <Route path="/spx" component={withBetaProtection(SPXCommandCenter)} />

      {/* Design System Test */}
      <Route path="/design-system" component={DesignSystemTest} />

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
  
  // Update market status every 30 seconds
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
    <header className="flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-800/50">
      <div className="flex items-center gap-3">
        <SidebarTrigger data-testid="button-mobile-menu" className="lg:hidden" />
        <span className="hidden lg:flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${marketStatus.isOpen ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          {marketStatus.isOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {isAuthenticated && userData && (
          <>
            <span className="hidden sm:inline text-xs font-mono text-muted-foreground">
              {userData.email || userData.firstName || 'User'}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleLogout}
                  data-testid="button-logout"
                  className="gap-1.5"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Exit</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sign out of Quant Edge Labs</TooltipContent>
            </Tooltip>
          </>
        )}
        <PersonalizationToolbar compact className="hidden sm:flex" />
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

  const style = {
    "--sidebar-width": "14rem",
    "--sidebar-width-icon": "3rem",
  };

  // Show public landing pages without sidebar (admin page handles its own layout)
  // Strip query parameters for comparison since location may include ?code=XXX etc.
  const locationPath = location.split('?')[0];
  const publicPages = ['/', '/landing', '/features', '/login', '/signup', '/invite', '/join-beta', '/admin', '/admin/users', '/admin/invites', '/admin/waitlist', '/admin/system', '/admin/trade-ideas', '/admin/reports', '/admin/security', '/admin/win-loss', '/admin/credits', '/admin/beta-invites', '/admin/blog', '/admin/old', '/privacy', '/terms', '/about', '/academy', '/blog', '/pricing'];
  // Also check for dynamic invite paths like /invite/:token
  const isPublicPage = publicPages.includes(locationPath) || locationPath.startsWith('/invite/');
  if (isPublicPage) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark" storageKey="quantedge-theme">
          <TooltipProvider>
            <RealtimePricesProvider>
              <StockContextProvider>
                <AuroraBackground />
                <ScrollParticles />
                <Router />
                <Toaster />
              </StockContextProvider>
            </RealtimePricesProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  // Show app pages with Aurora Grid layout (new minimalist design)
  const enableAuroraLayout = true; // Feature flag for new design

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="quantedge-theme">
        <TooltipProvider>
          <RealtimePricesProvider>
            <StockContextProvider>
              <PreferencesProvider>
                <ContentDensityProvider>
                  <AuroraBackground />
                  {enableAuroraLayout ? (
                    <AuroraLayoutProvider>
                      <div className="flex flex-col h-screen w-full">
                        <GlassHeader />
                        <div className="flex-1 overflow-auto bg-background pt-16">
                          <main className="min-h-full px-4 pb-6 max-w-[1800px] mx-auto">
                            <ErrorBoundary>
                              <Suspense fallback={<PageLoader />}>
                                <Router />
                              </Suspense>
                            </ErrorBoundary>
                          </main>
                        </div>
                      </div>
                    </AuroraLayoutProvider>
                  ) : (
                    <SidebarProvider style={style as React.CSSProperties}>
                      <div className="flex h-screen w-full">
                        <AppSidebar />
                        <MainContentWrapper />
                      </div>
                    </SidebarProvider>
                  )}
                  <AIChatbotPopup />
                  <HighConvictionAlertProvider />
                  <Toaster />
                </ContentDensityProvider>
              </PreferencesProvider>
            </StockContextProvider>
          </RealtimePricesProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Aurora Grid content wrapper - new minimalist layout
function AuroraContentWrapper() {
  const { user, logout, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [marketStatus, setMarketStatus] = useState({ isOpen: false, statusMessage: 'Checking...' });
  const { railWidth } = useAuroraLayout();
  
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
    <div 
      className="flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-300 relative z-10"
      style={{ marginLeft: `${railWidth}px` }}
    >
      <header className="flex items-center justify-between h-12 px-6 border-b border-slate-800/20 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className={cn(
              "h-2 w-2 rounded-full",
              marketStatus.isOpen ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)] animate-pulse" : "bg-slate-500"
            )} />
            <span className="text-slate-400">
              {marketStatus.isOpen ? 'MARKET OPEN' : 'CLOSED'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated && userData && (
            <>
              <span className="text-xs font-mono text-slate-500">
                {userData.email || userData.firstName || 'User'}
              </span>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleLogout}
                data-testid="button-logout"
                className="gap-1.5 text-slate-400 hover:text-slate-200"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
          <ThemeToggle />
        </div>
      </header>
      <div className="flex-1 overflow-auto bg-slate-950/50">
        <main className="min-h-full p-6">
          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Router />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

// Responsive wrapper that adjusts to sidebar state (legacy)
function MainContentWrapper() {
  const { state, isMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  
  return (
    <div 
      className="flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-200 graph-grid"
    >
      <AuthHeader />
      <div className="flex-1 overflow-auto flex flex-col">
        <main className="flex-1 w-full">
          <Router />
        </main>
        <Footer />
      </div>
    </div>
  );
}

export default App;
