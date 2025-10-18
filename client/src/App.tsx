import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Landing from "@/pages/landing";
import LearnMore from "@/pages/learn-more";
import Dashboard from "@/pages/dashboard";
import TradeIdeasPage from "@/pages/trade-ideas";
import MarketPage from "@/pages/market";
import WatchlistPage from "@/pages/watchlist";
import RiskCalculatorPage from "@/pages/risk-calculator";
import PerformancePage from "@/pages/performance";
import SignalIntelligencePage from "@/pages/signal-intelligence";
import About from "@/pages/about";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/learn-more" component={LearnMore} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/trade-ideas" component={TradeIdeasPage} />
      <Route path="/market" component={MarketPage} />
      <Route path="/watchlist" component={WatchlistPage} />
      <Route path="/risk" component={RiskCalculatorPage} />
      <Route path="/performance" component={PerformancePage} />
      <Route path="/signals" component={SignalIntelligencePage} />
      <Route path="/about" component={About} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect authenticated users from landing page to dashboard
  if (isAuthenticated && location === '/') {
    return <Redirect to="/dashboard" />;
  }

  // Show public pages for unauthenticated users
  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/learn-more" component={LearnMore} />
        <Route path="*">
          <Redirect to="/" />
        </Route>
      </Switch>
    );
  }

  // Show authenticated app with sidebar
  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Mobile header with hamburger menu */}
          <header className="flex lg:hidden items-center gap-2 p-4 border-b bg-background">
            <SidebarTrigger data-testid="button-mobile-menu" />
            <h1 className="text-lg font-semibold">QuantEdge</h1>
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="quantedge-theme">
        <AuthProvider>
          <TooltipProvider>
            <AuthenticatedApp />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
