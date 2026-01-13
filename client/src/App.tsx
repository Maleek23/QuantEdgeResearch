import { lazy, Suspense, useState, useEffect, ComponentType } from "react";
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
import { RealtimePricesProvider } from "@/context/realtime-prices-context";
import { useAuth } from "@/hooks/useAuth";
import { usePageTracking } from "@/hooks/use-analytics";
import { Button } from "@/components/ui/button";
import { LogOut, User, Loader2 } from "lucide-react";
import { Footer } from "@/components/footer";
import { ScrollParticles } from "@/components/scroll-particles";
import { AIChatbotPopup } from "@/components/ai-chatbot-popup";
import { BotNotificationPopup } from "@/components/bot-notification-popup";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/protected-route";
import { PreferencesProvider, usePreferences } from "@/contexts/preferences-context";
import { PersonalizationToolbar } from "@/components/ui/personalization-toolbar";
import { ContentDensityProvider } from "@/hooks/use-content-density";
import { ErrorBoundary } from "@/components/error-boundary";

const Landing = lazy(() => import("@/pages/landing"));
const Login = lazy(() => import("@/pages/login"));
const Signup = lazy(() => import("@/pages/signup"));
const TradeDeskPage = lazy(() => import("@/pages/trade-desk"));
const ChartAnalysis = lazy(() => import("@/pages/chart-analysis"));
const MarketPage = lazy(() => import("@/pages/market"));
const PerformancePage = lazy(() => import("@/pages/performance"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const AdminPanel = lazy(() => import("@/pages/admin"));
const AdminOverview = lazy(() => import("@/pages/admin/overview"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminInvites = lazy(() => import("@/pages/admin/invites"));
const AdminWaitlist = lazy(() => import("@/pages/admin/waitlist"));
const AdminSystem = lazy(() => import("@/pages/admin/system"));
const AdminReports = lazy(() => import("@/pages/admin-reports"));
const AdminSecurity = lazy(() => import("@/pages/admin-security"));
const AdminWinLoss = lazy(() => import("@/pages/admin-win-loss"));
const AdminCredits = lazy(() => import("@/pages/admin-credits"));
const AdminBetaInvites = lazy(() => import("@/pages/admin-beta-invites"));
const AdminBlog = lazy(() => import("@/pages/admin/blog"));
const About = lazy(() => import("@/pages/about"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy-policy"));
const TermsOfService = lazy(() => import("@/pages/terms-of-service"));
const SuccessStories = lazy(() => import("@/pages/success-stories"));
const ChartDatabase = lazy(() => import("@/pages/chart-database"));
const Academy = lazy(() => import("@/pages/academy"));
const Blog = lazy(() => import("@/pages/blog"));
const TradingRules = lazy(() => import("@/pages/trading-rules"));
const BlogPost = lazy(() => import("@/pages/blog-post"));
const Pricing = lazy(() => import("@/pages/pricing"));
const PaperTrading = lazy(() => import("@/pages/paper-trading"));
const WalletTracker = lazy(() => import("@/pages/wallet-tracker"));
const CTTracker = lazy(() => import("@/pages/ct-tracker"));
const TradeAudit = lazy(() => import("@/pages/trade-audit"));
const DataAuditCenter = lazy(() => import("@/pages/data-audit-center"));
const WatchlistBot = lazy(() => import("@/pages/watchlist-bot"));
const AutomationsPage = lazy(() => import("@/pages/automations"));
const Features = lazy(() => import("@/pages/features"));
const BacktestPage = lazy(() => import("@/pages/backtest"));
const TechnicalGuide = lazy(() => import("@/pages/technical-guide"));
const MarketScanner = lazy(() => import("@/pages/market-scanner"));
const SwingScanner = lazy(() => import("@/pages/swing-scanner"));
const BullishTrends = lazy(() => import("@/pages/bullish-trends"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const WatchlistPage = lazy(() => import("@/pages/watchlist"));
const TradingEnginePage = lazy(() => import("@/pages/trading-engine"));
const HistoricalIntelligence = lazy(() => import("@/pages/historical-intelligence"));
const AnalysisPage = lazy(() => import("@/pages/analysis"));
const NotFound = lazy(() => import("@/pages/not-found"));
const JoinBeta = lazy(() => import("@/pages/join-beta"));
const InviteWelcome = lazy(() => import("@/pages/invite-welcome"));
const OptionsAnalyzer = lazy(() => import("@/pages/options-analyzer"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
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
function SmartLanding() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return <PageLoader />;
  }
  
  // If logged in, go straight to trade desk
  if (user) {
    return <Redirect to="/trade-desk" />;
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
      <Route path="/home">
        <Redirect to="/trade-desk" />
      </Route>
      <Route path="/dashboard" component={withBetaProtection(Dashboard)} />
      <Route path="/trading-engine" component={withBetaProtection(TradingEnginePage)} />
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
      <Route path="/paper-trading" component={withBetaProtection(PaperTrading)} />
      <Route path="/wallet-tracker" component={withBetaProtection(WalletTracker)} />
      <Route path="/ct-tracker" component={withBetaProtection(CTTracker)} />
      <Route path="/watchlist-bot" component={withBetaProtection(WatchlistBot)} />
      <Route path="/automations" component={withBetaProtection(AutomationsPage)} />
      <Route path="/chart-analysis" component={withBetaProtection(ChartAnalysis)} />
      <Route path="/options-analyzer" component={withBetaProtection(OptionsAnalyzer)} />
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
      <Route path="/swing-scanner" component={withBetaProtection(SwingScanner)} />
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
      <Route path="/admin" component={AdminOverview} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/invites" component={AdminInvites} />
      <Route path="/admin/waitlist" component={AdminWaitlist} />
      <Route path="/admin/system" component={AdminSystem} />
      <Route path="/admin/blog" component={AdminBlog} />
      <Route path="/admin/reports" component={AdminReports} />
      <Route path="/admin/security" component={AdminSecurity} />
      <Route path="/admin/win-loss" component={AdminWinLoss} />
      <Route path="/admin/credits" component={AdminCredits} />
      <Route path="/admin/beta-invites" component={AdminBetaInvites} />
      <Route path="/admin/old" component={AdminPanel} />
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
      <Route path="/watchlist" component={withBetaProtection(WatchlistPage)} />
      
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
  
  const style = {
    "--sidebar-width": "14rem",
    "--sidebar-width-icon": "3rem",
  };

  // Show public landing pages without sidebar (admin page handles its own layout)
  // Strip query parameters for comparison since location may include ?code=XXX etc.
  const locationPath = location.split('?')[0];
  const publicPages = ['/', '/landing', '/features', '/login', '/signup', '/invite', '/join-beta', '/admin', '/admin/users', '/admin/invites', '/admin/waitlist', '/admin/system', '/admin/reports', '/admin/security', '/admin/win-loss', '/admin/credits', '/admin/beta-invites', '/admin/old', '/privacy', '/terms', '/about', '/academy', '/blog', '/pricing'];
  // Also check for dynamic invite paths like /invite/:token
  const isPublicPage = publicPages.includes(locationPath) || locationPath.startsWith('/invite/');
  if (isPublicPage) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark" storageKey="quantedge-theme">
          <TooltipProvider>
            <RealtimePricesProvider>
              <ScrollParticles />
              <Router />
              <Toaster />
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
            <PreferencesProvider>
              <ContentDensityProvider>
                <AuroraBackground />
                {enableAuroraLayout ? (
                  <AuroraLayoutProvider>
                    <div className="flex h-screen w-full">
                      <CommandRail />
                      <AuroraContentWrapper />
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
                <BotNotificationPopup />
                <Toaster />
              </ContentDensityProvider>
            </PreferencesProvider>
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
