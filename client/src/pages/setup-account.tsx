/**
 * /setup#token=… — a trader's one-time account setup link (docs/DESK_ADMINS.md
 * §Trader accounts). The token rides in the URL fragment, so it never reaches
 * the server's request logs or a Referer header; the page also accepts
 * ?token= and strips either from the address bar on load.
 *
 *   POST /api/auth/setup/inspect  { token }            → name, login, expiry (link not consumed)
 *   POST /api/auth/setup/complete { token, password }  → signed in → /desk (link used up)
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
import { readSetupTokenFromLocation } from "@shared/trader-accounts";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";

interface SetupInfo { displayName: string; login: string; loginIsUsername: boolean; traderName: string | null; expiresAt: string }

export default function SetupAccount() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  // Read once, then wipe it from the address bar (history, screenshots, shoulder-surfing).
  const [token] = useState(() => (typeof window === "undefined" ? null : readSetupTokenFromLocation(window.location)));
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [linkError, setLinkError] = useState<string | null>(token ? null : "This setup link is incomplete. Open the full link you were sent.");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && (window.location.hash || window.location.search)) {
      window.history.replaceState({}, "", "/setup");
    }
    if (!token) return;
    let live = true;
    apiRequest("POST", "/api/auth/setup/inspect", { token })
      .then((r) => r.json())
      .then((j: SetupInfo) => { if (live) setInfo(j); })
      .catch((e) => { if (live) setLinkError(reasonOf(e)); });
    return () => { live = false; };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validatePassword(password);
    if (err) { toast({ title: "Password not accepted", description: `${err}.`, variant: "destructive" }); return; }
    if (password !== confirm) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/auth/setup/complete", { token, password });
      setPassword(""); setConfirm("");
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "You're in", description: "Your password is set." });
      navigate("/desk");
    } catch (e2) {
      toast({ title: "Not set", description: reasonOf(e2), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle role="heading" aria-level={1}>
            {info ? `Welcome, ${info.displayName}` : linkError ? "Setup link" : "Checking your link…"}
          </CardTitle>
          <CardDescription>
            {info ? (
              <>Set a password for your QuantEdge account{info.traderName ? <> — the <b>{info.traderName}</b> desk</> : null}.
                {" "}You'll sign in with <b>{info.login}</b>{info.loginIsUsername ? " (your username)" : ""}.</>
            ) : linkError ?? "One moment."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {info && (
            <form onSubmit={submit} className="space-y-4" data-testid="form-setup-account">
              <input type="text" name="username" autoComplete="username" value={info.login} readOnly hidden />
              <div className="space-y-2">
                <Label htmlFor="setup-password">New password</Label>
                <Input id="setup-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} disabled={busy} data-testid="input-setup-password" />
                <p className="text-xs text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="setup-confirm">Confirm password</Label>
                <Input id="setup-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  required minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} disabled={busy} data-testid="input-setup-confirm" />
              </div>
              <Button type="submit" className="w-full" disabled={busy} data-testid="button-setup-account">
                {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Set password and open my desk"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                This link works once and expires {new Date(info.expiresAt).toLocaleString()}.
              </p>
            </form>
          )}
          {!info && linkError && (
            <div className="text-center">
              <Link href="/login"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />Go to sign in</Button></Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
