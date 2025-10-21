import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Footer } from "@/components/footer";
import Landing from "@/pages/landing";
import LearnMore from "@/pages/learn-more";
import Dashboard from "@/pages/dashboard";
import TradeIdeasPage from "@/pages/trade-ideas";
import MarketPage from "@/pages/market";
import WatchlistPage from "@/pages/watchlist";
import RiskCalculatorPage from "@/pages/risk-calculator";
import PerformancePage from "@/pages/performance";
import SignalIntelligencePage from "@/pages/signal-intelligence";
import LearningPage from "@/pages/learning";
import AnalyticsPage from "@/pages/analytics";
import SettingsPage from "@/pages/settings";
import AdminPanel from "@/pages/admin";
import About from "@/pages/about";
import PrivacyPolicy from "@/pages/privacy-policy";
import TermsOfService from "@/pages/terms-of-service";
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
      <Route path="/learning" component={LearningPage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/admin" component={AdminPanel} />
      <Route path="/about" component={About} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  // Show public landing pages without sidebar (admin page handles its own layout)
  const publicPages = ['/', '/learn-more', '/admin', '/privacy', '/terms'];
  if (publicPages.includes(location)) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark" storageKey="quantedge-theme">
          <TooltipProvider>
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
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Mobile header with hamburger menu */}
                <header className="flex lg:hidden items-center gap-2 p-4 border-b bg-background">
                  <SidebarTrigger data-testid="button-mobile-menu" />
                  <h1 className="text-lg font-semibold">QuantEdge</h1>
                </header>
                <div className="flex-1 overflow-auto flex flex-col">
                  <main className="flex-1">
                    <Router />
                  </main>
                  <Footer />
                </div>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
