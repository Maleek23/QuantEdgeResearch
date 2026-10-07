import { Suspense, useEffect, ComponentType, lazy } from "react";
import { LEGACY_REDIRECT_PATTERN, resolveLegacyRedirect } from "@/lib/legacy-redirects";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { PhoneAutoClamp } from "@/components/ui/qe-phone";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { RealtimePricesProvider } from "@/context/realtime-prices-context";
import { useAuth, hasAuthHint } from "@/hooks/useAuth";
import { takeStashedReturnTo } from "@/lib/return-to";
import { usePageTracking } from "@/hooks/use-analytics";
import { RouteFallback } from "@/components/ui/qe-loading";
import { ProtectedRoute, AdminProtectedRoute } from "@/components/protected-route";
import { PreferencesProvider } from "@/contexts/preferences-context";
import { ContentDensityProvider } from "@/hooks/use-content-density";
import { DensityProvider } from "@/components/ui/qe-density";
import { ErrorBoundary } from "@/components/error-boundary";
import { StockContextProvider } from "@/contexts/stock-context";
import { lazyWithRetry } from "@/lib/lazy-import";
import { CommandPaletteHost } from "@/components/command-palette-host";
import { WhatsNewDrawer, WhatsNewToast } from "@/components/whats-new";
import { NexusFrame } from "@/components/shell/nexus-frame";

// All page imports use lazyWithRetry for automatic chunk-load error recovery.
// If a deployment changes chunk hashes, stale cached HTML won't crash —
// the app retries and auto-reloads to pick up the new chunks.
// ─── SHELLS — Terminal (/t) + Research (/r) ───
const TerminalShell  = lazyWithRetry(() => import("@/pages/shells/terminal-shell"),  "terminal-shell");

const ResearchShell  = lazyWithRetry(() => import("@/pages/shells/research-shell"),  "research-shell");
const HowToPage      = lazyWithRetry(() => import("@/pages/how-to"),                 "how-to");
// DEV-only device harness index (client/src/dev/harness.ts). null in builds → no route, no chunk.
const HarnessIndex   = import.meta.env.DEV ? lazy(() => import("@/dev/harness-index")) : null;

// The tenth reference mock: the wired marketing page. Prior landing stays at @/pages/landing.
const Landing = lazyWithRetry(() => import("@/pages/landing-v2"), "landing");
// `/` for a visitor: start fetching the landing chunk now, in parallel with the auth check.
if (typeof window !== "undefined" && window.location.pathname === "/") void import("@/pages/landing-v2").catch(() => undefined);
const PublicWatchlist = lazyWithRetry(() => import("@/pages/public-watchlist"), "public-watchlist");
const Login = lazyWithRetry(() => import("@/pages/login"), "login");
const Signup = lazyWithRetry(() => import("@/pages/signup"), "signup");
const TodayPage     = lazyWithRetry(() => import("@/pages/today"), "today");
// REMOVED — Market page consolidated, redirect to /home
const SettingsPage = lazyWithRetry(() => import("@/pages/settings"), "settings");
const AlertsPage = lazyWithRetry(() => import("@/pages/alerts"), "alerts");
const AdminOverview = lazyWithRetry(() => import("@/pages/admin/overview"), "admin-overview");
const AdminUsers = lazyWithRetry(() => import("@/pages/admin/users"), "admin-users");
const AdminInvites = lazyWithRetry(() => import("@/pages/admin/invites"), "admin-invites");
const AdminWaitlist = lazyWithRetry(() => import("@/pages/admin/waitlist"), "admin-waitlist");
const AdminSystem = lazyWithRetry(() => import("@/pages/admin/system"), "admin-system");
const AdminBlog = lazyWithRetry(() => import("@/pages/admin/blog"), "admin-blog");
const AdminTraders = lazyWithRetry(() => import("@/pages/admin/traders"), "admin-traders");
const DeskPortalPage = lazyWithRetry(() => import("@/pages/desk"), "desk");
const AdminAudit = lazyWithRetry(() => import("@/pages/admin/audit"), "admin-audit");
const About = lazyWithRetry(() => import("@/pages/about"), "about");
const PrivacyPolicy = lazyWithRetry(() => import("@/pages/privacy-policy"), "privacy-policy");
const TermsOfService = lazyWithRetry(() => import("@/pages/terms-of-service"), "terms-of-service");

const Academy = lazyWithRetry(() => import("@/pages/academy"), "academy");
const Blog = lazyWithRetry(() => import("@/pages/blog"), "blog");

const BlogPost = lazyWithRetry(() => import("@/pages/blog-post"), "blog-post");
// REMOVED — Paper Trading, Wallet Tracker, CT Tracker consolidated out
const TradeAudit = lazyWithRetry(() => import("@/pages/trade-audit"), "trade-audit");

// REMOVED — Backtest merged into Performance tab

// MERGED — Market Scanner folded into Hunt → Surges tab
// MERGED — Bullish Trends absorbed into Market Scanner
// MERGED — Trading Engine absorbed into Performance
// /watchlist + /watchlist/weekly now redirect into the Hunt shell's Watchlist tab
// (single canonical surface); the component is loaded lazily by hunt-shell.tsx.
// REMOVED — Weekly Watchlist tab lives in unified-watchlist, Conviction Backtest in Performance

// REMOVED — AION consolidated out, redirect added below
// REMOVED — Historical Intelligence merged into Performance tab
const NotFound = lazyWithRetry(() => import("@/pages/not-found"), "not-found");
const JoinBeta = lazyWithRetry(() => import("@/pages/join-beta"), "join-beta");
const InviteWelcome = lazyWithRetry(() => import("@/pages/invite-welcome"), "invite-welcome");
const ForgotPassword = lazyWithRetry(() => import("@/pages/forgot-password"), "forgot-password");
const ResetPassword = lazyWithRetry(() => import("@/pages/reset-password"), "reset-password");

// MERGED — Discover absorbed into Trade Desk
// REMOVED 2026-09-29 — pages/history.tsx (never routed; /history → Journal › Trades)

// Terminal — full-screen Skylit-style dedicated pages
// MERGED: /terminal/:symbol now redirects to Research (/r/:symbol?tab=chart)

// Preload critical routes after initial render (during idle time).
// This warms the chunk cache so navigation feels instant.
function preloadCriticalRoutes() {
  // Use requestIdleCallback (or setTimeout fallback) to avoid blocking initial paint
  const schedule = typeof requestIdleCallback !== "undefined" ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 2000);
  // Warm only the canonical terminal shell. The previous list downloaded three
  // legacy/heavy pages (including an unrouted Home) immediately after first paint,
  // competing with the live Oracle requests the user was actually waiting for.
  // Only for a signed-in session (perf 2026-09-30): an anonymous landing-page
  // visitor cannot open /t, and the shell chunk was ~145 KB gzip of wasted
  // bandwidth + parse on the marketing page's first load.
  const warm = () => { import("@/pages/shells/terminal-shell").catch(() => {}); };
  const signedIn = () => !!queryClient.getQueryData(["/api/auth/me"]);
  schedule(() => {
    if (signedIn()) return warm();
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe(() => {
      if (signedIn()) { unsubscribe(); warm(); }
    });
  });
}

/** Route-chunk / auth fallback: holds the boot screen during boot, then the page skeleton (ui/qe-loading.tsx). */
function PageLoader() {
  return <RouteFallback />;
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
// Route components are wrapped ONCE, at module scope. Calling withBetaProtection()
// inside <Router> minted a brand-new component type on every Router render — and
// Router re-renders on every location/search change (usePageTracking reads
// useSearch). React treats a new type as a different component, so every ?tab=
// switch unmounted and remounted the WHOLE terminal: every poller restarted
// (the /api/pulse?since=0 storm), every query refired, every chart rebuilt.
const ProtectedTerminalShell = withBetaProtection(TerminalShell);
/** DEV-only: the real terminal shell on fixture data (main.tsx installs the mocks) — /dev/gex-phone?tab=gex */
const DevGexPhone = import.meta.env.DEV ? TerminalShell : null;
/** DEV-only: the 0DTE desk on fixture data (main.tsx installs dev/zerodte-mocks) — /dev/zerodte?fx=live&mode=dark */
const DevZeroDte = import.meta.env.DEV ? lazyWithRetry(() => import("@/dev/zerodte-harness"), "dev-zerodte") : null;
const ProtectedResearchShell = withBetaProtection(ResearchShell);
const ProtectedTodayPage = withBetaProtection(TodayPage);
const ProtectedTradeAudit = withBetaProtection(TradeAudit);
const ProtectedSettingsPage = withBetaProtection(SettingsPage);
const ProtectedAlertsPage = withBetaProtection(AlertsPage);
// Desk portal (docs/DESK_ADMINS.md): any signed-in member route; the server decides whose desk.
const DeskPortal = withBetaProtection(DeskPortalPage);

function SmartLanding() {
  const { user, isLoading } = useAuth();

  // Visitors (no "signed in last time" hint) see the landing at once while the auth
  // check runs — no boot splash on `/` (index.html skips it too). A member's browser
  // keeps the splash until auth answers, so it never flashes the marketing page.
  if (isLoading) {
    return hasAuthHint() ? <PageLoader /> : <Landing />;
  }

  // If logged in, land on TODAY (/today) — the signed-in home (2026-09-24).
  // We deliberately ignore a stale `qe-last-page` pointing at a legacy shell so the
  // app stops opening on the old sidebar UI; the legacy routes all still work if you
  // navigate to them directly. Anything else previously visited is still restored.
  // ?preview=landing renders the marketing page even while signed in. Without it
  // the landing page is unreachable to anyone with a session — which is everyone
  // who works on it — so the only way to check a change was to log out. Read-only
  // escape hatch: it changes nothing but which component renders.
  // ?section=pricing is where every upgrade path lands (/pricing was folded into
  // the landing's Pricing section, 2026-09-30) — signed-in users must see it too.
  const qs = new URLSearchParams(window.location.search);
  if (user && (qs.get('preview') === 'landing' || qs.get('section') === 'pricing')) {
    return <Landing />;
  }

  if (user) {
    const lastPage = localStorage.getItem('qe-last-page');
    const LEGACY_LANDINGS = ['/p', '/h', '/g', '/r'];
    const target = !lastPage || LEGACY_LANDINGS.includes(lastPage.split('?')[0]) ? '/today' : lastPage;
    return <Redirect to={target} />;
  }

  // Otherwise show landing page
  return <Landing />;
}

/**
 * Renders the redirect for any legacy URL matched by LEGACY_REDIRECT_PATTERN.
 * (Unmatched fallthrough renders NotFound, same as the old 404 fallback.)
 */
function LegacyRedirect() {
  const [location] = useLocation();
  const target = resolveLegacyRedirect(location, window.location.search);
  if (!target) return <NotFound />;
  return <Redirect to={target} />;
}

/**
 * OAuth deep-link return: Google's callback always lands on a fixed page, so a
 * target stashed by the login page (lib/return-to.ts) is followed once the
 * session exists. Email/password logins navigate directly and clear the stash.
 */
function useConsumeReturnTo() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  useEffect(() => {
    if (!user) return;
    const target = takeStashedReturnTo();
    if (target && target !== location) setLocation(target, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
}

function Router() {
  usePageTracking();
  useConsumeReturnTo();

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* ─── TERMINAL — one shell, 10 tabs (NEXUS · CHART · FLOW · GEX · LEAPS · CRYPTO · CATALYST · BOT · POSITIONS · JOURNAL) ─── */}
        <Route path="/t"          component={ProtectedTerminalShell} />
        {DevGexPhone && <Route path="/dev/gex-phone" component={DevGexPhone} />}
        {DevZeroDte && <Route path="/dev/zerodte" component={DevZeroDte} />}
        {DevGexPhone && <Route path="/dev/nexus-workspace" component={DevGexPhone} />}
        
        {/* ─── RESEARCH — per-ticker shell (own symbol chrome; stays separate) ─── */}

        <Route path="/r/:symbol"  component={ProtectedResearchShell} />
        <Route path="/r"          component={ProtectedResearchShell} />

        <Route path="/how-to"     component={HowToPage} />

        {/* ─── RESTORED ROUTES ───────────────────────────────────────────────
            These four paths had NO <Route> while 28 <Redirect>s and roughly 25
            nav links pointed at them, so every one of those landed on NotFound.
            /trade-desk was the worst: login.tsx:62 and :87 send you there after
            a successful sign-in, which meant signing in ended on a 404.

            The pages themselves were fine the whole time — imported, building,
            and backed by live endpoints. Only the routes were missing, lost when
            the router was collapsed to shells and the targets were never
            repointed. Restoring the route is the small fix; deleting the pages
            would have been the expensive one. */}
        <Route path="/today"       component={ProtectedTodayPage} />
        {/* HOME IS THE TERMINAL. Confirmed by the owner, against two rival
            candidates that both call themselves the dashboard in their own headers:
            pages/home.tsx ("Command Center", 1,186 lines) and pages/home-glass.tsx
            ("the real dashboard in the chosen design language"). Neither is. The
            product is /t — Terminal ORACLE: regime, rotation map, session brief,
            early rotation, the live signal board and the signal card.

            So /home is a redirect, not a page, and the other two stay unrouted.
            Three files claiming to be the dashboard is how this drifted in the
            first place; only one of them is reachable now, and it is the right one. */}

        {/* Public marketing routes that had links but no <Route>. Blog had the
            problem that /admin/blog was routed, so posts could be authored but
            never read. /pricing is no longer a page: it redirects (legacy table)
            to the landing's Pricing section, /?section=pricing (2026-09-30). */}
        <Route path="/blog/:slug" component={BlogPost} />
        <Route path="/blog"       component={Blog} />
        <Route path="/academy"    component={Academy} />

        {/* Public, read-only shared watchlist (no auth) — for trading groups */}
        <Route path="/w" component={PublicWatchlist} />

        {/* Core Pages - Smart redirect for logged-in users */}
        <Route path="/" component={SmartLanding} />

      {HarnessIndex && <Route path="/__harness" component={HarnessIndex} />}
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/join-beta" component={JoinBeta} />
      
      <Route path="/invite" component={InviteWelcome} />

      <Route path="/trade-ideas/:id/audit" component={ProtectedTradeAudit} />

      {/* System Pages */}
      <Route path="/settings" component={ProtectedSettingsPage} />
      <Route path="/alerts" component={ProtectedAlertsPage} />
      <Route path="/desk" component={DeskPortal} />
      <Route path="/desk/:slug" component={DeskPortal} />

      {/* Admin hub — own access gate (AdminLayout). Four sections; the retired
          admin pages redirect via lib/legacy-redirects.ts (docs/ADMIN_HUB.md). */}
      <Route path="/admin" component={AdminOverview} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/invites" component={AdminInvites} />
      <Route path="/admin/waitlist" component={AdminWaitlist} />
      <Route path="/admin/system" component={AdminSystem} />
      <Route path="/admin/blog" component={AdminBlog} />
      <Route path="/admin/traders" component={AdminTraders} />
      <Route path="/admin/audit" component={AdminAudit} />
      <Route path="/about" component={About} />
      
      {/* Legal Pages */}
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />

      {/* ─── LEGACY REDIRECTS ─── one catch-all replaces ~70 individual redirect
          routes. The map, matcher, and route pattern live in
          lib/legacy-redirects.ts; redirect chains were resolved to final
          destinations so every legacy URL lands in one hop. */}
      <Route path={LEGACY_REDIRECT_PATTERN}>
        <LegacyRedirect />
      </Route>

      {/* 404 Fallback */}
      <Route component={NotFound} />
      </Switch>
    </Suspense>
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
    // Don't remember legacy shells as the landing page — the Terminal (/t) is the front
    // door now. They remain reachable directly; they just no longer hijack the next visit.
    const skipPaths = ['/', '/w', '/login', '/signup', '/invite', '/join-beta',
                       '/p', '/h', '/g', '/r', '/pos', '/j', '/academy', '/how-to'];
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
  const publicPages = ['/', '/w', '/login', '/signup', '/invite', '/join-beta', '/admin', '/admin/users', '/admin/invites', '/admin/waitlist', '/admin/system', '/admin/blog', '/admin/traders', '/admin/audit', '/__harness', '/privacy', '/terms', '/about', '/academy', '/how-to', '/blog'];
  // Also check for dynamic invite paths like /invite/:token
  const isPublicPage = publicPages.includes(locationPath) || locationPath.startsWith('/invite/');
  if (isPublicPage) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="nexus" storageKey="quantedge-theme">
          <TooltipProvider>
            <RealtimePricesProvider>
              <StockContextProvider>
                <Router />
                <CommandPaletteHost />
                <WhatsNewDrawer />
                <WhatsNewToast />
                <Toaster />
                <PhoneAutoClamp />
              </StockContextProvider>
            </RealtimePricesProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  // FULL-BLEED SHELLS — the current design. No AppSidebar, no AuthHeader, no global
  // Footer; each of these shells supplies its own header and tabs, so the sidebar was
  // redundant chrome stacked on top of chrome.
  //
  // /t was the only route in here, which meant the Terminal was the only surface in
  // the new design and everything else still rendered the old left-sidebar layout.
  // That split was doing real damage: the evidence rail links a signal to
  // /r/:symbol, so validating a call threw you out of the new product and into the
  // old one mid-task. Research already draws its own symbol header and its own
  // Chart/Options/GEX/Flow/Analyze tabs — it was never missing chrome, it was
  // wearing two sets.
  //
  // Matching /r and /r/:symbol as a prefix, not an equality, so per-ticker routes
  // are included.
  // /r (research) now renders inside NexusFrame like every other page, so it
  // gets the shared topbar and mobile dock instead of a third chrome of its own.
  // Today is the signed-in homepage, not a second landing site. It belongs in
  // NexusFrame with the rest of the product so navigation never disappears.
  // (/nexus used to be listed here too, but it is a legacy redirect to /t —
  // the redirect renders before this branch could ever matter.)
  const isFullBleedShell = locationPath === '/t' || (import.meta.env.DEV && (locationPath === '/dev/gex-phone' || locationPath === '/dev/zerodte' || locationPath === '/dev/nexus-workspace'));

  if (isFullBleedShell) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="nexus" storageKey="quantedge-theme">
          <TooltipProvider>
            <RealtimePricesProvider>
              <StockContextProvider>
                <PreferencesProvider>
                  <ContentDensityProvider>
                    <DensityProvider>
                      <SidebarProvider style={style as React.CSSProperties}>
                        <div className="h-[100dvh] w-full overflow-hidden page-atmosphere">
                          <ErrorBoundary>
                            <Suspense fallback={<PageLoader />}>
                              <Router />
                            </Suspense>
                          </ErrorBoundary>
                        </div>
                      </SidebarProvider>
                      {/* No legacy CommandPalette here: the terminal shell owns
                          ⌘K with its own palette (liquid-universe search + tab
                          jumps). Mounting both stacked two palettes on one
                          keystroke. */}
                      <WhatsNewDrawer />
                      <WhatsNewToast />
                      <Toaster />
                      <PhoneAutoClamp />
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

  // Every other signed-in page wears the terminal's chrome (NexusFrame): same
  // topbar, same desktop tabs, same mobile bottom dock. The legacy left-sidebar
  // layout (AppSidebar + AuthHeader + Footer) was retired 2026-09-24 — two
  // designs in one product made moving between the board and a page feel like
  // leaving the app.
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="nexus" storageKey="quantedge-theme">
        <TooltipProvider>
          <RealtimePricesProvider>
            <StockContextProvider>
              <PreferencesProvider>
                <ContentDensityProvider>
                  <DensityProvider>
                    <SidebarProvider style={style as React.CSSProperties}>
                      <NexusFrame>
                        <ErrorBoundary>
                          <Suspense fallback={<PageLoader />}>
                            <Router />
                          </Suspense>
                        </ErrorBoundary>
                      </NexusFrame>
                    </SidebarProvider>
                    <CommandPaletteHost />
                    <WhatsNewDrawer />
                    <WhatsNewToast />
                    <Toaster />
                    <PhoneAutoClamp />
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

export default App;
