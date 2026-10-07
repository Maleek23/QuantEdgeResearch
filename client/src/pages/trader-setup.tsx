/**
 * /trader-setup — a trader creates their own login from the sign-in page
 * (docs/DESK_ADMINS.md §Trader self-setup; rules in shared/trader-self-setup.ts).
 *
 *   1. pick your name      GET  /api/auth/trader-setup/names
 *   2. your passcode       POST /api/auth/trader-setup/verify   { slug, passcode }
 *   3. choose a password   POST /api/auth/trader-setup/complete { slug, passcode, password } → signed in → /desk
 *
 * The passcode stays in this component's memory between steps 2 and 3 (the
 * server checks it again on step 3) and is cleared on success or "Back".
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { reasonOf } from "@/lib/optimistic";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULE_TEXT, validatePassword } from "@shared/password-policy";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";

interface Name { slug: string; name: string }
type Step = "name" | "passcode" | "password";

export default function TraderSetup() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [names, setNames] = useState<Name[] | null>(null);
  const [open, setOpen] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("name");
  const [slug, setSlug] = useState("");
  const [passcode, setPasscode] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/auth/trader-setup/names", { credentials: "include" })
      .then(async (r) => { if (!r.ok) throw new Error(r.status === 429 ? "Too many requests — wait a few minutes." : "Couldn't load the list."); return r.json(); })
      .then((j: { open: boolean; names: Name[] }) => { if (live) { setOpen(j.open); setNames(j.names); } })
      .catch((e) => { if (live) setLoadError((e as Error).message); });
    return () => { live = false; };
  }, []);

  const picked = names?.find((n) => n.slug === slug) ?? null;

  const restart = () => { setStep("name"); setPasscode(""); setPassword(""); setConfirm(""); setError(null); };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await apiRequest("POST", "/api/auth/trader-setup/verify", { slug, passcode });
      const j = (await r.json()) as { login: string };
      setLogin(j.login);
      setStep("password");
    } catch (e2) {
      setError(reasonOf(e2));
    } finally { setBusy(false); }
  };

  const complete = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validatePassword(password);
    if (err) { setError(`${err}.`); return; }
    if (password !== confirm) { setError("The passwords don't match."); return; }
    setBusy(true); setError(null);
    try {
      await apiRequest("POST", "/api/auth/trader-setup/complete", { slug, passcode, password });
      setPasscode(""); setPassword(""); setConfirm("");
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "You're in", description: `From now on, sign in with ${login}.` });
      navigate("/desk");
    } catch (e2) {
      setError(reasonOf(e2));
    } finally { setBusy(false); }
  };

  const title = step === "name" ? "Set up your trader account" : step === "passcode" ? `Hi ${picked?.name ?? ""}` : "Choose your password";
  const sub = step === "name"
    ? "For traders whose book the operator has set up. You'll need your book passcode."
    : step === "passcode"
      ? "Enter the passcode the operator gave you for your book."
      : <>You'll sign in with <b>{login}</b> and this password.</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <CardTitle role="heading" aria-level={1}>{title}</CardTitle>
          <CardDescription>{sub}</CardDescription>
          {step !== "name" && <p className="text-xs text-muted-foreground" aria-label="Progress">Step {step === "passcode" ? 2 : 3} of 3</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p role="alert" className="text-sm text-[var(--trade-bearish)]" data-testid="text-trader-setup-error">{error}</p>}

          {step === "name" && (
            <>
              {loadError && <p role="alert" className="text-sm text-[var(--trade-bearish)]">{loadError}</p>}
              {!loadError && names === null && <p className="text-sm text-muted-foreground text-center"><Loader2 className="inline h-4 w-4 mr-2 animate-spin" />Loading…</p>}
              {names && !open && <p className="text-sm text-muted-foreground text-center" data-testid="text-trader-setup-off">Self-setup is turned off. Ask the operator for a setup link.</p>}
              {names && open && !names.length && (
                <p className="text-sm text-muted-foreground text-center" data-testid="text-trader-setup-none">
                  No books are open for setup. If you already set up your account, sign in with your name. Forgot your password? The operator can send you a new link.
                </p>
              )}
              {names && open && !!names.length && (
                <form onSubmit={(e) => { e.preventDefault(); if (slug) { setError(null); setStep("passcode"); } }} className="space-y-4" data-testid="form-trader-setup-name">
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium mb-2">Who are you?</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {names.map((n) => (
                        <label key={n.slug} className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm ${slug === n.slug ? "border-primary bg-primary/5" : "border-border"}`}>
                          <input type="radio" name="trader" value={n.slug} checked={slug === n.slug} onChange={() => setSlug(n.slug)} data-testid={`radio-trader-${n.slug}`} />
                          {n.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Button type="submit" className="w-full" disabled={!slug} data-testid="button-trader-setup-next">Next</Button>
                </form>
              )}
            </>
          )}

          {step === "passcode" && (
            <form onSubmit={verify} className="space-y-4" data-testid="form-trader-setup-passcode">
              <div className="space-y-2">
                <Label htmlFor="trader-passcode">Book passcode</Label>
                <Input id="trader-passcode" type="password" autoComplete="off" value={passcode} onChange={(e) => setPasscode(e.target.value)}
                  required maxLength={128} disabled={busy} autoFocus data-testid="input-trader-passcode" />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !passcode} data-testid="button-trader-setup-verify">
                {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking…</> : "Continue"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={restart} disabled={busy}>Back</Button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={complete} className="space-y-4" data-testid="form-trader-setup-password">
              <input type="text" name="username" autoComplete="username" value={login} readOnly hidden />
              <div className="space-y-2">
                <Label htmlFor="trader-new-password">New password</Label>
                <Input id="trader-new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} disabled={busy} autoFocus data-testid="input-trader-new-password" />
                <p className="text-xs text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="trader-confirm-password">Confirm password</Label>
                <Input id="trader-confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} disabled={busy} data-testid="input-trader-confirm-password" />
              </div>
              <Button type="submit" className="w-full" disabled={busy} data-testid="button-trader-setup-complete">
                {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : "Create account and open my desk"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={restart} disabled={busy}>Start over</Button>
            </form>
          )}

          <div className="text-center pt-2">
            <Link href="/login"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back to sign in</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
