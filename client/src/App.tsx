import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Footer } from "@/components/footer";
import { ScrollParticles } from "@/components/scroll-particles";
import Landing from "@/pages/landing";
import TradeDeskPage from "@/pages/trade-desk";
import MarketPage from "@/pages/market";
import PerformancePage from "@/pages/performance";
import SettingsPage from "@/pages/settings";
import AdminPanel from "@/pages/admin";
import About from "@/pages/about";
import PrivacyPolicy from "@/pages/privacy-policy";
import TermsOfService from "@/pages/terms-of-service";
import SuccessStories from "@/pages/success-stories";
import ChartDatabase from "@/pages/chart-database";
import Academy from "@/pages/academy";
import Blog from "@/pages/blog";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      {/* Core Pages */}
      <Route path="/" component={Landing} />
      <Route path="/trade-desk" component={TradeDeskPage} />
      <Route path="/trade-desk/:mode" component={TradeDeskPage} />
      <Route path="/performance" component={PerformancePage} />
      <Route path="/market" component={MarketPage} />
      
      {/* Research & Community Pages */}
      <Route path="/chart-database" component={ChartDatabase} />
      <Route path="/success-stories" component={SuccessStories} />
      <Route path="/academy" component={Academy} />
      <Route path="/blog" component={Blog} />
      
      {/* System Pages */}
      <Route path="/settings" component={SettingsPage} />
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
      <Route path="/insights">
        <Redirect to="/performance" />
      </Route>
      <Route path="/analytics">
        <Redirect to="/performance" />
      </Route>
      <Route path="/signals">
        <Redirect to="/performance" />
      </Route>
      <Route path="/watchlist">
        <Redirect to="/market" />
      </Route>
      
      {/* Redirects - Removed Pages */}
      <Route path="/learn-more">
        <Redirect to="/" />
      </Route>
      <Route path="/holographic" component={NotFound} />
      <Route path="/learning" component={NotFound} />
      <Route path="/risk" component={NotFound} />
      
      {/* 404 Fallback */}
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
  const publicPages = ['/', '/admin', '/privacy', '/terms'];
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
