import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { reasonOf } from "@/lib/optimistic";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, Sparkles } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/qe-mark.svg";
import { WaitlistPopup } from "@/components/waitlist-popup";
import { RETURN_TO_PARAM, clearStashedReturnTo, readReturnTo, stashReturnTo } from "@/lib/return-to";
import { ThemePicker } from "@/components/landing/theme-picker";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULE_TEXT, validatePassword } from "@shared/password-policy";

/** The login answer for a temporary (admin-issued) password: no session until the trader sets their own. */
function isMustChange(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : '').match(/^403: ([\s\S]*)$/);
  if (!m) return false;
  try { return JSON.parse(m[1])?.mustChangePassword === true; } catch { return false; }
}

// One field: an email, or the username an admin gave you (trader accounts — shared/trader-accounts.ts).
const loginSchema = z.object({
  email: z.string().trim().min(2, "Enter your email or username").max(254),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  // Temp-password first sign-in: the typed login + temp password, held only in memory until the change.
  const [mustChange, setMustChange] = useState<{ login: string; password: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Deep link the visitor was sent here from (sanitised: same-origin relative paths only).
  const [returnTo] = useState(() => (typeof window === "undefined" ? null : readReturnTo(window.location.search)));
  const landing = returnTo ?? "/t";

  // Handle URL error parameters from OAuth callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');

    if (error) {
      const errorMessages: Record<string, string> = {
        'invite_required': 'This is an invite-only beta. Join the waitlist to request access.',
        'google_auth_failed': 'Google sign-in failed. Please try again.',
        'no_user': 'Could not retrieve your account. Please try again.',
        'login_failed': 'Login failed. Please try again.',
        'not_on_waitlist': 'You must be on the waitlist to sign in. Join below.',
        'account_disabled': 'This account is disabled. Contact support if you think this is a mistake.',
      };

      setAuthError(errorMessages[error] || 'An error occurred during sign-in.');
      window.history.replaceState({}, '', returnTo ? `/login?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}` : '/login');
    }
  }, []);

  // Admin login mutation
  const adminLoginMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/auth/dev-login", { accessCode: code });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Welcome!", description: "Admin login successful." });
      clearStashedReturnTo();
      setLocation(landing);
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: reasonOf(error),
        variant: "destructive",
      });
    },
  });

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Welcome back!", description: "You have been logged in successfully." });
      clearStashedReturnTo();
      setTimeout(() => setLocation(landing), 100);
    },
    onError: (error: Error, vars: LoginFormData) => {
      if (isMustChange(error)) {
        setMustChange({ login: vars.email, password: vars.password });
        form.setValue("password", "");
        return;
      }
      toast({
        title: "Login failed",
        description: reasonOf(error),
        variant: "destructive",
      });
    },
  });

  const firstLoginMutation = useMutation({
    mutationFn: async () => {
      if (!mustChange) throw new Error("Sign in again");
      const response = await apiRequest("POST", "/api/auth/first-login", { login: mustChange.login, password: mustChange.password, newPassword });
      return response.json() as Promise<{ redirect?: string }>;
    },
    onSuccess: async (data) => {
      setMustChange(null); setNewPassword(""); setConfirmPassword("");
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Password set", description: "You're signed in." });
      clearStashedReturnTo();
      setTimeout(() => setLocation(data?.redirect === "/desk" ? "/desk" : landing), 100);
    },
    onError: (error: Error) => {
      toast({ title: "Not changed", description: reasonOf(error), variant: "destructive" });
    },
  });

  const submitNewPassword = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validatePassword(newPassword);
    if (err) { toast({ title: "Password not accepted", description: `${err}.`, variant: "destructive" }); return; }
    if (newPassword !== confirmPassword) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (mustChange && newPassword === mustChange.password) { toast({ title: "Choose a new password", description: "Not the temporary one.", variant: "destructive" }); return; }
    firstLoginMutation.mutate();
  };

  const onSubmit = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const handleAdminLogin = () => {
    if (accessCode.trim()) {
      adminLoginMutation.mutate(accessCode);
    }
  };

  return (
    <div className="min-h-screen bg-background flex transition-colors">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 dark:from-emerald-950/50 via-background to-background" />

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <Link href="/">
              <div className="flex items-center gap-3 cursor-pointer">
                <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-8 w-8" />
                <span className="text-foreground dark:text-foreground font-medium">QuantEdge</span>
              </div>
            </Link>
          </div>

          <div className="space-y-8">
            {/* docs/POSITIONING.md — no user counts or testimonials we cannot show. */}
            <div>
              <h1 className="text-4xl font-medium text-foreground dark:text-foreground mb-4 leading-tight">
                The trading research terminal.
              </h1>
              <p className="text-muted-foreground dark:text-muted-foreground text-lg max-w-md">
                Stocks, options and crypto — every number carries its evidence and its record.
              </p>
            </div>

            <ul className="space-y-4 max-w-md">
              {[
                ['See the positioning', 'GEX and VEX by strike, walls, zero-γ, the squeeze radar, options flow and dark-pool levels.'],
                ['Rank the setup', 'NEXUS scores every idea layer by layer, with entry, stop and target — plus a 0DTE desk and charts.'],
                ['Prove the record', 'A paper-trading bot with a public ledger, and a journal for your own trades: import, insights, loss analysis.'],
              ].map(([t, d]) => (
                <li key={t} className="border-l-2 border-[var(--trade-bullish)]/50 pl-4">
                  <div className="text-sm font-medium text-foreground">{t}</div>
                  <div className="text-sm text-muted-foreground">{d}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="text-xs text-muted-foreground dark:text-muted-foreground">
            © {new Date().getFullYear()} QuantEdge Labs
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center mb-8">
            <Link href="/">
              <div className="flex items-center gap-2">
                <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-8 w-8" />
                <span className="text-foreground dark:text-foreground font-medium">QuantEdge</span>
              </div>
            </Link>
          </div>

          {/* Back link + the public pages' Light / Dark / System picker */}
          <div className="flex items-center justify-between gap-3 mb-8">
            <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </Link>
            <ThemePicker compact />
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-medium text-foreground dark:text-foreground mb-2">Welcome back</h2>
            <p className="text-muted-foreground dark:text-muted-foreground">
              Sign in to access your dashboard
            </p>
          </div>

          {/* Error Alert */}
          {authError && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-[var(--trade-bearish)]">{authError}</p>
              {authError.includes('waitlist') && (
                <button
                  onClick={() => setWaitlistOpen(true)}
                  className="mt-2 text-sm text-foreground underline"
                >
                  Join the waitlist
                </button>
              )}
            </div>
          )}

          {/* Waitlist Notice */}
          <div className="mb-6 p-4 rounded-lg bg-white dark:bg-card border border-gray-200 dark:border-border">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Sparkles className="w-4 h-4 text-[var(--trade-bullish)] dark:text-[var(--trade-bullish)]" />
              </div>
              <div>
                <p className="text-sm text-foreground dark:text-foreground font-medium">Invite-only beta</p>
                <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
                  Sign-in is for approved beta members. Have an invite code?{" "}
                  <Link href="/signup" className="text-sky-700 dark:text-sky-400 hover:underline">Create your account</Link> first.
                </p>
              </div>
            </div>
          </div>

          {/* Google Sign In */}
          {/* Google returns through the server (fixed redirect), so the deep link rides in sessionStorage. */}
          <a href="/api/auth/google" className="block mb-4" onClick={() => stashReturnTo(returnTo)}>
            <Button
              type="button"
              className="w-full h-11 bg-white dark:bg-card border border-gray-200 dark:border-border text-foreground dark:text-foreground hover:bg-gray-50 dark:hover:bg-muted hover:border-gray-300 dark:hover:border-border"
            >
              <SiGoogle className="mr-2 h-4 w-4" />
              Continue with Google
            </Button>
          </a>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-muted-foreground dark:text-muted-foreground">or continue with email or username</span>
            </div>
          </div>

          {mustChange ? (
            <form onSubmit={submitNewPassword} className="space-y-4" data-testid="form-first-login">
              <div className="p-4 rounded-lg bg-white dark:bg-card border border-gray-200 dark:border-border">
                <p className="text-sm text-foreground font-medium">Set your own password</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You signed in as <b>{mustChange.login}</b> with a temporary password. Choose your own to finish — the temporary one stops working. {PASSWORD_RULE_TEXT}
                </p>
              </div>
              <Input type="password" placeholder="New password" aria-label="New password" autoComplete="new-password"
                value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH}
                className="h-11 bg-white dark:bg-card border-gray-200 dark:border-border" data-testid="input-first-new-password" />
              <Input type="password" placeholder="Confirm new password" aria-label="Confirm new password" autoComplete="new-password"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH}
                className="h-11 bg-white dark:bg-card border-gray-200 dark:border-border" data-testid="input-first-confirm-password" />
              <Button type="submit" className="w-full h-11 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 font-medium" disabled={firstLoginMutation.isPending}>
                {firstLoginMutation.isPending ? "Saving..." : "Set password and sign in"}
              </Button>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground w-full min-h-11"
                onClick={() => { setMustChange(null); setNewPassword(""); setConfirmPassword(""); }}>
                Back to sign in
              </button>
            </form>
          ) : (
          // Email/Password Form
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground dark:text-muted-foreground" />
                        <Input
                          type="text"
                          inputMode="email"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder="Email, username or trader name"
                          aria-label="Email or username"
                          autoComplete="username"
                          className="h-11 pl-10 bg-white dark:bg-card border-gray-200 dark:border-border text-foreground dark:text-foreground placeholder:text-muted-foreground dark:placeholder:text-muted-foreground focus:border-gray-300 dark:focus:border-border focus:ring-0"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[var(--trade-bearish)] dark:text-[var(--trade-bearish)] text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground dark:text-muted-foreground" />
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Password"
                          aria-label="Password"
                          autoComplete="current-password"
                          className="h-11 pl-10 pr-10 bg-white dark:bg-card border-gray-200 dark:border-border text-foreground dark:text-foreground placeholder:text-muted-foreground dark:placeholder:text-muted-foreground focus:border-gray-300 dark:focus:border-border focus:ring-0"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-0 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage className="text-[var(--trade-bearish)] dark:text-[var(--trade-bearish)] text-xs" />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-between">
                <Link href="/forgot-password">
                  <span className="text-xs text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground transition-colors">
                    Forgot password?
                  </span>
                </Link>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 font-medium"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Signing in..." : "Sign in"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                <Link href="/trader-setup">
                  <span className="hover:text-foreground underline-offset-2 hover:underline transition-colors" data-testid="link-trader-setup">
                    Trader? Set up your account
                  </span>
                </Link>
              </p>
            </form>
          </Form>
          )}

          {/* Waitlist CTA */}
          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-3">Don't have access yet?</p>
            <Button
              variant="outline"
              className="w-full h-11 border-gray-200 dark:border-border text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground hover:bg-gray-50 dark:hover:bg-card"
              onClick={() => setWaitlistOpen(true)}
            >
              Join the waitlist
            </Button>
          </div>

          {/* Admin Access - Hidden by default */}
          <div className="mt-8 pt-6 border-t border-border/50">
            <button
              type="button"
              onClick={() => setShowAdminLogin(!showAdminLogin)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center min-h-11"
            >
              Admin access
            </button>

            {showAdminLogin && (
              <div className="mt-4 space-y-3">
                <Input
                  type="password"
                  placeholder="Admin access code"
                  aria-label="Admin access code"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                  className="h-10 bg-card border-border text-foreground placeholder:text-muted-foreground focus:border-border focus:ring-0"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-9 border-border text-muted-foreground hover:text-foreground hover:bg-card text-xs"
                  onClick={handleAdminLogin}
                  disabled={adminLoginMutation.isPending || !accessCode.trim()}
                >
                  {adminLoginMutation.isPending ? "Logging in..." : "Admin Login"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Waitlist Popup */}
      <WaitlistPopup open={waitlistOpen} onOpenChange={setWaitlistOpen} />
    </div>
  );
}
