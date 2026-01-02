import { lazy, Suspense } from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, User, Loader2 } from "lucide-react";
import { Footer } from "@/components/footer";
import { ScrollParticles } from "@/components/scroll-particles";
import { cn } from "@/lib/utils";

const Landing = lazy(() => import("@/pages/landing"));
const Login = lazy(() => import("@/pages/login"));
const Signup = lazy(() => import("@/pages/signup"));
const HomePage = lazy(() => import("@/pages/home"));
const TradeDeskPage = lazy(() => import("@/pages/trade-desk"));
const ChartAnalysis = lazy(() => import("@/pages/chart-analysis"));
const MarketPage = lazy(() => import("@/pages/market"));
const PerformancePage = lazy(() => import("@/pages/performance"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const AdminPanel = lazy(() => import("@/pages/admin"));
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
const FuturesPage = lazy(() => import("@/pages/futures"));
const Features = lazy(() => import("@/pages/features"));
const BacktestPage = lazy(() => import("@/pages/backtest"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
    </div>
  );
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
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Core Pages - Smart redirect for logged-in users */}
        <Route path="/" component={SmartLanding} />
      <Route path="/features" component={Features} />
        <Route path="/landing" component={Landing} />
      <Route path="/home" component={HomePage} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/trade-desk" component={TradeDeskPage} />
      <Route path="/paper-trading" component={PaperTrading} />
      <Route path="/wallet-tracker" component={WalletTracker} />
      <Route path="/ct-tracker" component={CTTracker} />
      <Route path="/watchlist-bot" component={WatchlistBot} />
      <Route path="/chart-analysis" component={ChartAnalysis} />
      <Route path="/backtest" component={BacktestPage} />
      <Route path="/performance" component={PerformancePage} />
      <Route path="/trade-ideas/:id/audit" component={TradeAudit} />
      <Route path="/data-audit" component={DataAuditCenter} />
      <Route path="/market" component={MarketPage} />
      <Route path="/futures" component={FuturesPage} />
      <Route path="/futures-research">
        <Redirect to="/futures" />
      </Route>
      
      {/* Research & Community Pages */}
      <Route path="/trading-rules" component={TradingRules} />
      <Route path="/chart-database" component={ChartDatabase} />
      <Route path="/success-stories" component={SuccessStories} />
      <Route path="/academy" component={Academy} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      
      {/* System Pages */}
      <Route path="/settings" component={SettingsPage} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/admin" component={AdminPanel} />
      <Route path="/about" component={About} />
      
      {/* Legal Pages */}
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      
      {/* Redirects - Consolidated Pages */}
      <Route path="/dashboard">
        <Redirect to="/trade-desk" />
      </Route>
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
      <Route path="/watchlist" component={MarketPage} />
      
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
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          MARKET CLOSED
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
              <TooltipContent>Sign out of QuantEdge</TooltipContent>
            </Tooltip>
          </>
        )}
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
  const publicPages = ['/', '/features', '/login', '/signup', '/admin', '/privacy', '/terms'];
  if (publicPages.includes(location)) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark" storageKey="quantedge-theme">
          <TooltipProvider>
            <ScrollParticles />
            <Router />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  // Show app pages with sidebar
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="quantedge-theme">
        <TooltipProvider>
          <ScrollParticles />
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <MainContentWrapper />
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Responsive wrapper that adjusts to sidebar state
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
