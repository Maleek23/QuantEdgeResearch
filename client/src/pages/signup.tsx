/**
 * SIGN UP — the invite-only beta door (home-page pass 2026-09-30,
 * docs/HOME_AUDIT_2026-09-30.md §Signup).
 *
 * Two paths, both on this page, chosen with one segmented control:
 *   • I have an invite code → POST /api/auth/signup (unchanged contract:
 *     inviteCode, email, password, firstName?, lastName?). Code prefilled from
 *     ?code= / ?invite=. Password rule shown up front and checked live — the
 *     rule is shared/password-policy.ts, the same constant the server enforces.
 *   • Join the waitlist → POST /api/waitlist/join (email). Before this, "Don't
 *     have a code? Join the waitlist" linked back to the landing, which had no
 *     waitlist form — a dead loop.
 * Success shows the next steps (components/landing/next-steps.tsx) instead of
 * a toast and a jump to /t. Errors are written inline (role=alert) in plain
 * words via reasonOf — never "403: {…}". Inputs are 16px (no iOS zoom on
 * focus), every control ≥ 44px, every input has a <label>.
 * Security logic (sessions, CSRF, rate limits, hashing) is server-side and
 * untouched here.
 */
import { forwardRef, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import '@/styles/nexus.css';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { reasonOf } from '@/lib/optimistic';
import { authHref, clearStashedReturnTo, readReturnTo, stashReturnTo } from '@/lib/return-to';
import NextSteps from '@/components/landing/next-steps';
import { DISCORD_INVITE_URL } from '@/lib/public-config';
import { attributionPayload } from '@/lib/attribution';
import { ThemePicker } from '@/components/landing/theme-picker';
import { useTheme } from '@/components/theme-provider';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '@shared/password-policy';

/** The server's rule — one shared constant (shared/password-policy.ts). */
const MIN_PASSWORD = PASSWORD_MIN_LENGTH;

const signupSchema = z.object({
  inviteCode: z.string().trim().min(1, 'Enter the invite code from your email.'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().trim().email('Enter a valid email address, like you@example.com.'),
  password: z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters.`).max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`),
  confirmPassword: z.string().min(1, 'Type the password again to confirm it.'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'The two passwords don’t match.',
  path: ['confirmPassword'],
});
type SignupFormData = z.infer<typeof signupSchema>;

const waitlistSchema = z.object({ email: z.string().trim().email('Enter a valid email address, like you@example.com.') });
type WaitlistData = z.infer<typeof waitlistSchema>;

/** Server messages → what to do next. Unknown messages pass through (reasonOf). */
function signupError(err: unknown): string {
  const r = reasonOf(err);
  if (/too many/i.test(r)) return 'Too many sign-up attempts from this network. Wait 15 minutes and try again.';
  if (/already exists/i.test(r)) return 'An account with this email already exists. Sign in instead, or reset your password from the sign-in page.';
  if (/already been used/i.test(r)) return 'This invite code has already been used. If it was you, sign in; otherwise ask for a new code.';
  if (/expired|revoked|invalid/i.test(r)) return `${r.replace(/\.$/, '')}. Check the code in your invite email — it isn’t case-sensitive — or join the waitlist for a new one.`;
  return r;
}

function Field({ id, label, optional, help, error, children }: { id: string; label: string; optional?: boolean; help?: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}{optional && <span className="opt"> (optional)</span>}</label>
      {children}
      {help && <p className="auth-help" id={`${id}-help`}>{help}</p>}
      {error && <p className="auth-err" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  );
}

type PasswordInputProps = React.InputHTMLAttributes<HTMLInputElement> & { id: string; show: boolean; onToggle: () => void; describedBy?: string; invalid?: boolean };
// forwardRef: react-hook-form's register() hands over a ref it reads values and focus through.
const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput({ id, show, onToggle, describedBy, invalid, ...rest }, ref) {
  return (
    <div className="auth-pw">
      <input ref={ref} id={id} className="auth-input" type={show ? 'text' : 'password'} aria-invalid={invalid || undefined} aria-describedby={describedBy} {...rest} />
      <button type="button" className="auth-eye" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
});

export default function Signup() {
  const isLight = useTheme().theme === 'nexus-light';
  const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const initialCode = (params.get('code') || params.get('invite') || '').trim();
  const [returnTo] = useState(() => (typeof window === 'undefined' ? null : readReturnTo(window.location.search)));
  const [mode, setMode] = useState<'code' | 'waitlist'>(params.get('waitlist') === '1' && !initialCode ? 'waitlist' : 'code');
  const [showPw, setShowPw] = useState(false);
  const [done, setDone] = useState<{ name: string | null } | null>(null);
  const [waitlisted, setWaitlisted] = useState<string | null>(null);

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    mode: 'onTouched',
    defaultValues: { inviteCode: initialCode, firstName: '', lastName: '', email: '', password: '', confirmPassword: '' },
  });
  const wl = useForm<WaitlistData>({ resolver: zodResolver(waitlistSchema), mode: 'onTouched', defaultValues: { email: '' } });

  const signup = useMutation({
    mutationFn: async (data: SignupFormData) => {
      const { confirmPassword: _c, ...payload } = data;
      const r = await apiRequest('POST', '/api/auth/signup', { ...payload, email: payload.email.trim(), inviteCode: payload.inviteCode.trim(), ...attributionPayload() });
      return r.json();
    },
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      clearStashedReturnTo();
      setDone({ name: vars.firstName?.trim() || null });
    },
  });

  const join = useMutation({
    mutationFn: async (data: WaitlistData) => {
      const r = await apiRequest('POST', '/api/waitlist/join', { email: data.email.trim(), source: 'signup', ...attributionPayload() });
      return r.json() as Promise<{ alreadyExists?: boolean }>;
    },
    onSuccess: (res) => setWaitlisted(res?.alreadyExists
      ? 'You’re already on the waitlist — we’ll be in touch when a spot opens.'
      : 'You’re on the waitlist. We’ll be in touch at that address when a spot opens.'),
  });

  // Move focus to the success heading so screen readers announce it.
  useEffect(() => { if (done) document.getElementById('auth-done-title')?.focus(); }, [done]);

  const pw = form.watch('password');
  const confirm = form.watch('confirmPassword');
  const errs = form.formState.errors;

  return (
    <div className={`landing nexus-vars lp auth-page${isLight ? ' light' : ''}`}>
      <nav className="lnav" aria-label="Main">
        <div className="lnav-inner">
          <Link href="/" className="brand" aria-label="QuantEdge home">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">QUANTEDGE</span>
          </Link>
          <div className="lnav-spacer" />
          <ThemePicker compact className="lnav-theme" />
          <Link href={authHref('/login', returnTo)} className="btn btn-ghost" data-testid="link-login">Sign in</Link>
        </div>
      </nav>

      <main className="auth-wrap">
        {done ? (
          <NextSteps name={done.name} continueTo={returnTo} />
        ) : (
          <div className="auth-card">
            <p className="lp-eyebrow">Early-access beta</p>
            <h1 className="auth-h1">Join the QuantEdge beta</h1>
            <p className="auth-sub">QuantEdge is invite-only while it’s in beta. Have an invite code? Create your account. No code yet? Join the waitlist and we’ll be in touch.</p>

            <div className="auth-seg" role="group" aria-label="How are you joining?">
              <button type="button" aria-pressed={mode === 'code'} onClick={() => setMode('code')} data-testid="tab-invite-code">I have an invite code</button>
              <button type="button" aria-pressed={mode === 'waitlist'} onClick={() => setMode('waitlist')} data-testid="tab-waitlist">Join the waitlist</button>
            </div>

            {mode === 'code' ? (
              <form className="auth-form" noValidate onSubmit={form.handleSubmit((d) => signup.mutate(d))} aria-describedby={signup.isError ? 'signup-alert' : undefined}>
                <Field id="su-code" label="Invite code" error={errs.inviteCode?.message}
                  help={<>It’s in your invite email. Not case-sensitive.</>}>
                  <input id="su-code" className="auth-input mono" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    aria-invalid={!!errs.inviteCode || undefined} aria-describedby={`su-code-help${errs.inviteCode ? ' su-code-err' : ''}`}
                    data-testid="input-invite-code" {...form.register('inviteCode')} />
                </Field>
                <Field id="su-email" label="Email" error={errs.email?.message}>
                  <input id="su-email" className="auth-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
                    placeholder="you@example.com" aria-invalid={!!errs.email || undefined} aria-describedby={errs.email ? 'su-email-err' : undefined}
                    data-testid="input-email" {...form.register('email')} />
                </Field>
                <div className="auth-row">
                  <Field id="su-first" label="First name" optional>
                    <input id="su-first" className="auth-input" autoComplete="given-name" data-testid="input-first-name" {...form.register('firstName')} />
                  </Field>
                  <Field id="su-last" label="Last name" optional>
                    <input id="su-last" className="auth-input" autoComplete="family-name" data-testid="input-last-name" {...form.register('lastName')} />
                  </Field>
                </div>
                <Field id="su-pw" label="Password" error={errs.password?.message}>
                  <PasswordInput id="su-pw" show={showPw} onToggle={() => setShowPw((v) => !v)} autoComplete="new-password"
                    invalid={!!errs.password} describedBy={`su-pw-rules${errs.password ? ' su-pw-err' : ''}`}
                    data-testid="input-password" {...form.register('password')} />
                  <ul className="auth-rules" id="su-pw-rules" aria-label="Password rules">
                    <li className={pw.length >= MIN_PASSWORD ? 'ok' : ''}>{pw.length >= MIN_PASSWORD ? '✓' : '·'} At least {MIN_PASSWORD} characters</li>
                    <li>· A passphrase or password manager is best</li>
                  </ul>
                </Field>
                <Field id="su-pw2" label="Confirm password" error={errs.confirmPassword?.message}>
                  <PasswordInput id="su-pw2" show={showPw} onToggle={() => setShowPw((v) => !v)} autoComplete="new-password"
                    invalid={!!errs.confirmPassword} describedBy={errs.confirmPassword ? 'su-pw2-err' : undefined}
                    data-testid="input-confirm-password" {...form.register('confirmPassword')} />
                  {confirm.length > 0 && !errs.confirmPassword && (
                    <p className={`auth-help${confirm === pw ? ' up' : ''}`} aria-live="polite">{confirm === pw ? '✓ Passwords match' : 'Passwords don’t match yet'}</p>
                  )}
                </Field>

                {signup.isError && (
                  <p className="auth-alert" id="signup-alert" role="alert">
                    <b>Couldn’t create your account.</b> {signupError(signup.error)}
                  </p>
                )}

                <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={signup.isPending} data-testid="button-signup">
                  {signup.isPending ? 'Creating your account…' : 'Create account'}
                </button>

                <p className="auth-help">No code? <button type="button" className="lp-link" onClick={() => setMode('waitlist')}>Join the waitlist instead</button>.</p>
              </form>
            ) : waitlisted ? (
              <div className="auth-form">
                <p className="auth-alert ok" role="status">{waitlisted}</p>
                {DISCORD_INVITE_URL && (
                  <p className="auth-help">While you wait, <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">join the community on Discord<span className="sr-only"> (opens in a new tab)</span></a>.</p>
                )}
                <Link href="/" className="btn btn-ghost btn-lg auth-submit">Back to the home page</Link>
              </div>
            ) : (
              <form className="auth-form" noValidate onSubmit={wl.handleSubmit((d) => join.mutate(d))}>
                <Field id="wl-email" label="Email" error={wl.formState.errors.email?.message}
                  help="We’ll be in touch at this address when a beta spot opens.">
                  <input id="wl-email" className="auth-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
                    placeholder="you@example.com" aria-invalid={!!wl.formState.errors.email || undefined}
                    aria-describedby={`wl-email-help${wl.formState.errors.email ? ' wl-email-err' : ''}`}
                    data-testid="input-waitlist-email" {...wl.register('email')} />
                </Field>
                {join.isError && <p className="auth-alert" role="alert"><b>Couldn’t add you to the waitlist.</b> {reasonOf(join.error)}</p>}
                <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={join.isPending} data-testid="button-join-waitlist">
                  {join.isPending ? 'Joining…' : 'Join the waitlist'}
                </button>
                {DISCORD_INVITE_URL && (
                  <p className="auth-help">Want to see it first? <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Join the community on Discord<span className="sr-only"> (opens in a new tab)</span></a>.</p>
                )}
              </form>
            )}

            {mode === 'code' && !waitlisted && (
              <>
                <p className="auth-or">or</p>
                <a href="/api/auth/google" className="btn btn-ghost btn-lg auth-google" onClick={() => stashReturnTo(returnTo)} data-testid="button-google-signup">
                  Continue with Google
                </a>
                <p className="auth-help" style={{ marginTop: 8 }}>For invites sent to a Google address — no code needed.</p>
              </>
            )}

            {/* Compliance review 2026-09-30: terms + risk acknowledgement at the point of signup. */}
            <p className="auth-fine" data-testid="text-signup-terms">
              By creating an account you agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>, and
              acknowledge that QuantEdge is an educational research tool, not investment advice. Trading stocks, options and crypto involves
              substantial risk of loss.
            </p>
            <p className="auth-switch">Already have an account? <Link href={authHref('/login', returnTo)}>Sign in</Link></p>
          </div>
        )}
      </main>
    </div>
  );
}
