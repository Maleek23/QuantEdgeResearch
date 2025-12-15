import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Footer } from "@/components/footer";
import { ScrollParticles } from "@/components/scroll-particles";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, LogIn } from "lucide-react";
import Landing from "@/pages/landing";
import TradeDeskPage from "@/pages/trade-desk";
import ChartAnalysis from "@/pages/chart-analysis";
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
import Login from "@/pages/login";
import Signup from "@/pages/signup";

function Router() {
  return (
    <Switch>
      {/* Core Pages */}
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/trade-desk" component={TradeDeskPage} />
      <Route path="/chart-analysis" component={ChartAnalysis} />
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

function AuthButtons() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {(user as any)?.email || 'User'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            logout();
            setLocation('/');
          }}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline ml-2">Logout</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation('/login')}
        data-testid="button-login"
      >
        <LogIn className="h-4 w-4" />
        <span className="hidden sm:inline ml-2">Login</span>
      </Button>
      <Button
        size="sm"
        onClick={() => setLocation('/signup')}
        data-testid="button-signup"
        className="hidden sm:inline-flex"
      >
        Sign Up
      </Button>
    </div>
  );
}

function App() {
  const [location] = useLocation();
  
  const style = {
    "--sidebar-width": "13rem",
    "--sidebar-width-icon": "3rem",
  };

  // Show public landing pages without sidebar (admin page handles its own layout)
  const publicPages = ['/', '/admin', '/privacy', '/terms', '/login', '/signup'];
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
                {/* Header with auth buttons */}
                <header className="flex items-center justify-between gap-2 p-4 border-b bg-background">
                  <div className="flex items-center gap-2">
                    <SidebarTrigger data-testid="button-mobile-menu" className="lg:hidden" />
                    <h1 className="text-lg font-semibold lg:hidden">QuantEdge</h1>
                  </div>
                  <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <AuthButtons />
                  </div>
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
