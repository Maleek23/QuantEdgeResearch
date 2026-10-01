import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shield, Lock, ChevronLeft, LogOut } from "lucide-react";
import { LuxPage, LuxPageHeader } from "@/components/lux";
import { CURRENT_RELEASE } from "@shared/release";
import "@/styles/admin-hub.css";
import { cn } from "@/lib/utils";

type AuthStep = "pin" | "password" | "authenticated";

interface AdminLayoutProps {
  children: React.ReactNode;
}

/**
 * The admin hub (2026-09-29 consolidation — docs/ADMIN_HUB.md).
 * Sections: Overview · Users & access (users · invite codes · waitlist ·
 *   trader books) · Audit log · System health · Content (blog). docs/ADMIN_TAB.md
 * Retired pages redirect (client/src/lib/legacy-redirects.ts). Drawn in the
 * platform's page template (LuxPage), not a separate sidebar app. The access
 * gate (access code → password → HTTP-only admin cookie) is unchanged.
 */
export const ADMIN_SECTIONS = [
  { title: "Overview", href: "/admin", match: ["/admin"] },
  { title: "Users & access", href: "/admin/users", match: ["/admin/users", "/admin/invites", "/admin/waitlist", "/admin/traders"] },
  { title: "Audit log", href: "/admin/audit", match: ["/admin/audit"] },
  { title: "System health", href: "/admin/system", match: ["/admin/system"] },
  { title: "Content", href: "/admin/blog", match: ["/admin/blog"] },
] as const;
const ACCESS_TABS = [
  { title: "Users", href: "/admin/users" },
  { title: "Invite codes", href: "/admin/invites" },
  { title: "Waitlist", href: "/admin/waitlist" },
  { title: "Trader books", href: "/admin/traders" },
] as const;

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const [authStep, setAuthStep] = useState<AuthStep>("pin");
  const [pinCode, setPinCode] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  // Check if already authenticated (has valid admin session)
  const { data: authCheck, isLoading: checkingAuth } = useQuery({
    queryKey: ['/api/admin/check-auth'],
    queryFn: async () => {
      const res = await fetch('/api/admin/check-auth', { credentials: 'include' });
      if (!res.ok) return { authenticated: false };
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (authCheck?.authenticated) {
      setAuthStep('authenticated');
    }
  }, [authCheck]);

  const handlePinSubmit = async () => {
    if (pinCode.length !== 4) {
      toast({ title: "Please enter 4 digits", variant: "destructive" });
      return;
    }

    try {
      const res = await fetch('/api/admin/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pinCode }),
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Invalid access code');
      }

      setAuthStep('password');
      toast({ title: "Access code verified", description: "Enter admin password" });
    } catch (error) {
      toast({ title: "Invalid access code", variant: "destructive" });
      setPinCode("");
    }
  };

  const handlePasswordSubmit = async () => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Login failed' }));
        throw new Error(error.error || 'Invalid password');
      }

      const response = await res.json();
      setAuthStep('authenticated');
      toast({
        title: "Admin access granted",
        description: `Session expires in ${response.expiresIn || '24h'}`
      });
    } catch (error: any) {
      toast({ title: error.message || "Invalid password", variant: "destructive" });
    }
  };

  // Loading state
  if (checkingAuth) {
    return (
      <div className="ah-root ah-center">
        <div className="flex flex-col items-center gap-3">
          <Shield className="h-8 w-8" style={{ color: 'var(--lx-accent-text)' }} aria-hidden />
          <p className="ah-mute">Checking admin access…</p>
        </div>
      </div>
    );
  }

  // Authentication gate
  if (authStep !== 'authenticated') {
    return (
      <div className="ah-root ah-center p-4">
        <Card className="ah-gate w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="ah-gate-icon mx-auto"><Shield className="h-6 w-6" aria-hidden /></div>
            <CardTitle className="text-xl">Admin hub</CardTitle>
            <CardDescription className="text-muted-foreground">
              {authStep === 'pin' 
                ? 'Enter your 4-digit access code' 
                : 'Enter your admin password'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {authStep === 'pin' ? (
              <div className="flex flex-col items-center gap-6">
                <InputOTP 
                  maxLength={4} 
                  value={pinCode} 
                  onChange={setPinCode}
                  onComplete={handlePinSubmit}
                  data-testid="input-admin-pin"
                >
                  <InputOTPGroup className="gap-3">
                    {[0, 1, 2, 3].map((index) => (
                      <InputOTPSlot 
                        key={index} 
                        index={index} 
                        className="h-14 w-14 text-2xl" 
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <Button 
                  onClick={handlePinSubmit} 
                  className="ah-primary w-full"
                  disabled={pinCode.length !== 4}
                  data-testid="button-verify-pin"
                >
                  Verify Access Code
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Input
                  type="password"
                  placeholder="Admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                  className="h-12"
                  data-testid="input-admin-password"
                />
                <Button 
                  onClick={handlePasswordSubmit}
                  className="ah-primary w-full"
                  disabled={!password}
                  data-testid="button-login"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Access Admin Panel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const section = ADMIN_SECTIONS.find((s) => (s.match as readonly string[]).includes(location)) ?? ADMIN_SECTIONS[0];
  const signOut = async () => {
    try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }); } catch { /* cookie expires anyway */ }
    window.location.href = '/';
  };

  return (
    <div className="ah-root">
      <LuxPage width="default" className="ah-page">
        <div className="ah-top">
          <Link href="/t" className="ah-back"><ChevronLeft aria-hidden size={14} /> Back to app</Link>
          <button type="button" className="ah-back" onClick={signOut}><LogOut aria-hidden size={13} /> Leave admin</button>
        </div>
        <LuxPageHeader section="Admin" context={`v${CURRENT_RELEASE.version} · ${CURRENT_RELEASE.series}`} title={section.title}
          purpose={
            section.title === 'Overview' ? 'Who is using the platform and whether it is healthy, at a glance.'
            : section.title === 'Users & access' ? 'Accounts, tiers and the beta gate: invite codes, the waitlist and trader-book passcodes. New accounts start on Free.'
            : section.title === 'Audit log' ? 'Every operator action that changes access, newest first.'
            : section.title === 'System health' ? 'Data providers, process, database and API traffic — observed, not assumed.'
            : 'Blog posts on the public site.'
          }>
          <nav className="ah-nav" aria-label="Admin sections">
            {ADMIN_SECTIONS.map((s) => (
              <Link key={s.href} href={s.href} className={cn('ah-tab', s === section && 'on')} aria-current={s === section ? 'page' : undefined}
                data-testid={`nav-${s.title.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{s.title}</Link>
            ))}
          </nav>
          {section.title === 'Users & access' && (
            <nav className="ah-subnav" aria-label="Users and access">
              {ACCESS_TABS.map((t) => (
                <Link key={t.href} href={t.href} className={cn('ah-sub', location === t.href && 'on')} aria-current={location === t.href ? 'page' : undefined}>{t.title}</Link>
              ))}
            </nav>
          )}
        </LuxPageHeader>
        <main className="ah-main">{children}</main>
      </LuxPage>
    </div>
  );
}
