/**
 * Multi-step intake form — waitlist signup (with email) and the signed-in
 * "Complete your profile" sheet (no email). ≤ 90 seconds: three required steps
 * of taps, two optional steps with Skip, one consent step. Option lists and
 * validation: shared/intake.ts (the server re-validates the same way).
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import {
  ACCOUNT_SIZE, EXPERIENCE, GOALS, MARKETS, SOURCES, STRUGGLE_MAX, TOOLS, TRADING_TIME,
  validateIntakeProfile, type IntakeErrors, type IntakeProfile,
} from '@shared/intake';
import '@/styles/onboarding.css';

type Draft = Partial<Omit<IntakeProfile, 'ackNotAdvice'>> & { ackNotAdvice?: boolean; email?: string };
type Opt = { id: string; label: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface StepDef { id: string; title: string; sub: string; optional?: boolean; fields: (keyof Draft)[] }
const STEPS: StepDef[] = [
  { id: 'you', title: 'About you', sub: 'So we know who we’re building for.', fields: ['name', 'email', 'experience'] },
  { id: 'trading', title: 'How you trade', sub: 'Tap everything that fits.', fields: ['markets', 'accountSize', 'goal'] },
  { id: 'source', title: 'How you found us', sub: 'Helps us find more people like you.', fields: ['source', 'sourceDetail'] },
  { id: 'work', title: 'A bit more (optional)', sub: 'Skip anything you’d rather not share.', optional: true, fields: ['occupation', 'industry', 'timezone', 'discord'] },
  { id: 'habits', title: 'Your routine (optional)', sub: 'Shapes which tools we show you first.', optional: true, fields: ['tradingTime', 'struggle', 'tools'] },
  { id: 'confirm', title: 'Last step', sub: 'Two quick confirmations.', fields: ['consentEmails', 'ackNotAdvice'] },
];

function guessTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; } catch { return ''; }
}

function Single({ legend, options, value, onChange, error, name }: { legend: ReactNode; options: readonly Opt[]; value?: string; onChange(v: string): void; error?: string; name: string }) {
  return (
    <fieldset className="ob-field">
      <legend>{legend}</legend>
      <div className="ob-chips" role="radiogroup" aria-label={typeof legend === 'string' ? legend : name}>
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="ob-chip"
            onClick={() => onChange(o.id)} data-testid={`intake-${name}-${o.id}`}>
            {value === o.id && <Check aria-hidden />}{o.label}
          </button>
        ))}
      </div>
      {error && <p className="ob-err" role="alert">{error}</p>}
    </fieldset>
  );
}

function Multi({ legend, options, value, onChange, error, name }: { legend: ReactNode; options: readonly Opt[]; value?: string[]; onChange(v: string[]): void; error?: string; name: string }) {
  const set = new Set(value ?? []);
  return (
    <fieldset className="ob-field">
      <legend>{legend}</legend>
      <div className="ob-chips">
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={set.has(o.id)} className="ob-chip" data-testid={`intake-${name}-${o.id}`}
            onClick={() => { const n = new Set(set); n.has(o.id) ? n.delete(o.id) : n.add(o.id); onChange(options.filter((x) => n.has(x.id)).map((x) => x.id)); }}>
            {set.has(o.id) && <Check aria-hidden />}{o.label}
          </button>
        ))}
      </div>
      {error && <p className="ob-err" role="alert">{error}</p>}
    </fieldset>
  );
}

function Text({ id, label, value, onChange, error, optional, type = 'text', autoComplete, max = 80, placeholder }: {
  id: string; label: string; value?: string; onChange(v: string): void; error?: string; optional?: boolean; type?: string; autoComplete?: string; max?: number; placeholder?: string;
}) {
  return (
    <div className="ob-field">
      <label className="ob-label" htmlFor={id}>{label}{optional && <span className="ob-opt"> · optional</span>}</label>
      <input id={id} className="ob-input" type={type} value={value ?? ''} maxLength={max} autoComplete={autoComplete} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} data-testid={`intake-${id}`} />
      {error && <p className="ob-err" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  );
}

export interface IntakeFormProps {
  mode: 'waitlist' | 'profile';
  initial?: Draft;
  /** Resolve to an error message to stay on the last step, or nothing for success. */
  onSubmit(profile: IntakeProfile, email?: string): Promise<string | void>;
  submitLabel?: string;
}

export function IntakeForm({ mode, initial, onSubmit, submitLabel }: IntakeFormProps) {
  const [draft, setDraft] = useState<Draft>(() => ({ timezone: guessTimezone(), consentEmails: true, ...initial }));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<IntakeErrors & { email?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const steps = useMemo(() => STEPS.map((s) => (s.id === 'you' && mode === 'profile' ? { ...s, fields: s.fields.filter((f) => f !== 'email') } : s)), [mode]);
  const cur = steps[step];
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft((d) => ({ ...d, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const stepErrors = (i: number) => {
    const all = validateIntakeProfile(draft);
    const errs: Record<string, string> = all.ok ? {} : { ...all.errors };
    if (mode === 'waitlist' && !EMAIL_RE.test((draft.email ?? '').trim())) errs.email = 'Enter a valid email, like you@example.com.';
    const out: Record<string, string> = {};
    for (const f of steps[i].fields) if (errs[f as string]) out[f as string] = errs[f as string];
    return out;
  };
  const focusTop = () => requestAnimationFrame(() => topRef.current?.focus());
  const next = () => {
    const e = stepErrors(step);
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({}); setStep((s) => Math.min(s + 1, steps.length - 1)); focusTop();
  };
  const skip = () => {
    setDraft((d) => { const n = { ...d }; for (const f of cur.fields) if (f !== 'timezone') delete n[f]; return n; });
    setErrors({}); setStep((s) => s + 1); focusTop();
  };
  const back = () => { setErrors({}); setStep((s) => Math.max(0, s - 1)); focusTop(); };
  const submit = async () => {
    for (let i = 0; i < steps.length; i++) {
      const e = stepErrors(i);
      if (Object.keys(e).length) { setErrors(e); setStep(i); focusTop(); return; }
    }
    const v = validateIntakeProfile(draft);
    if (!v.ok) { setErrors(v.errors); return; }
    setBusy(true);
    try {
      const msg = await onSubmit(v.value, mode === 'waitlist' ? draft.email!.trim() : undefined);
      if (msg) setErrors({ form: msg });
    } catch (e) {
      setErrors({ form: (e as Error)?.message || 'Something went wrong — try again.' });
    } finally { setBusy(false); }
  };

  const pct = Math.round(((step + 1) / steps.length) * 100);
  const isLast = step === steps.length - 1;

  return (
    <form className="ob ob-form" onSubmit={(e) => { e.preventDefault(); if (isLast) void submit(); else next(); }} noValidate data-testid={`intake-form-${mode}`}>
      <div className="ob-progress">
        <div className="ob-progress-meta"><span>Step {step + 1} of {steps.length}</span><span>{cur.optional ? 'Optional' : step < 3 ? 'About a minute' : ''}</span></div>
        <div className="ob-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Form progress"><span style={{ width: `${pct}%` }} /></div>
      </div>
      <div ref={topRef} tabIndex={-1} style={{ outline: 'none' }}>
        <h3 className="ob-step-title">{cur.title}</h3>
        <p className="ob-step-sub">{cur.sub}</p>
      </div>

      {cur.id === 'you' && (<>
        <Text id="name" label="Your name" value={draft.name} onChange={(v) => set('name', v)} error={errors.name} autoComplete="name" />
        {mode === 'waitlist' && <Text id="email" label="Email" type="email" value={draft.email} onChange={(v) => set('email', v)} error={errors.email} autoComplete="email" max={254} placeholder="you@example.com" />}
        <Single name="experience" legend="Trading experience" options={EXPERIENCE} value={draft.experience} onChange={(v) => set('experience', v as Draft['experience'])} error={errors.experience} />
      </>)}

      {cur.id === 'trading' && (<>
        <Multi name="markets" legend="What do you trade?" options={MARKETS} value={draft.markets} onChange={(v) => set('markets', v as Draft['markets'])} error={errors.markets} />
        <Single name="accountSize" legend="Account size" options={ACCOUNT_SIZE} value={draft.accountSize} onChange={(v) => set('accountSize', v as Draft['accountSize'])} error={errors.accountSize} />
        <Single name="goal" legend="What do you want most?" options={GOALS} value={draft.goal} onChange={(v) => set('goal', v as Draft['goal'])} error={errors.goal} />
      </>)}

      {cur.id === 'source' && (<>
        <Single name="source" legend="How did you hear about us?" options={SOURCES} value={draft.source} onChange={(v) => set('source', v as Draft['source'])} error={errors.source} />
        {draft.source === 'referral' && <Text id="sourceDetail" label="Who referred you?" optional value={draft.sourceDetail} onChange={(v) => set('sourceDetail', v)} />}
        {draft.source === 'other' && <Text id="sourceDetail" label="Where was that?" optional value={draft.sourceDetail} onChange={(v) => set('sourceDetail', v)} />}
      </>)}

      {cur.id === 'work' && (
        <div className="ob-grid2">
          <Text id="occupation" label="Occupation / where you work" optional value={draft.occupation} onChange={(v) => set('occupation', v)} autoComplete="organization-title" />
          <Text id="industry" label="Industry" optional value={draft.industry} onChange={(v) => set('industry', v)} />
          <Text id="timezone" label="Location / timezone" optional value={draft.timezone} onChange={(v) => set('timezone', v)} max={64} />
          <Text id="discord" label="Discord handle" optional value={draft.discord} onChange={(v) => set('discord', v)} max={40} placeholder="name" />
        </div>
      )}

      {cur.id === 'habits' && (<>
        <Single name="tradingTime" legend={<>When do you usually trade? <span className="ob-opt">· optional</span></>} options={TRADING_TIME} value={draft.tradingTime} onChange={(v) => set('tradingTime', v as Draft['tradingTime'])} />
        <div className="ob-field">
          <label className="ob-label" htmlFor="struggle">Biggest struggle right now <span className="ob-opt">· optional</span></label>
          <textarea id="struggle" className="ob-textarea" maxLength={STRUGGLE_MAX} value={draft.struggle ?? ''} onChange={(e) => set('struggle', e.target.value)}
            placeholder="e.g. I exit winners too early" data-testid="intake-struggle" />
          <span className="ob-count" aria-live="polite">{(draft.struggle ?? '').length}/{STRUGGLE_MAX}</span>
        </div>
        <Multi name="tools" legend={<>Tools you use now <span className="ob-opt">· optional</span></>} options={TOOLS} value={draft.tools} onChange={(v) => set('tools', v as Draft['tools'])} />
      </>)}

      {cur.id === 'confirm' && (<>
        <label className="ob-check">
          <input type="checkbox" checked={!!draft.consentEmails} onChange={(e) => set('consentEmails', e.target.checked)} data-testid="intake-consent" />
          <span>Email me about my invite and product updates. Unsubscribe any time.</span>
        </label>
        <label className="ob-check">
          <input type="checkbox" checked={!!draft.ackNotAdvice} onChange={(e) => set('ackNotAdvice', e.target.checked)} data-testid="intake-ack" aria-invalid={!!errors.ackNotAdvice} />
          <span>I understand QuantEdge is for education and research. Nothing on it is financial advice, and trading options can lose all of the money put in.</span>
        </label>
        {errors.ackNotAdvice && <p className="ob-err" role="alert">{errors.ackNotAdvice}</p>}
      </>)}

      {errors.form && <p className="ob-err" role="alert">{errors.form}</p>}

      <div className="ob-actions">
        {step > 0 && <button type="button" className="ob-btn ob-btn-ghost" onClick={back}>Back</button>}
        <span className="ob-spacer" />
        {cur.optional && <button type="button" className="ob-btn" onClick={skip} data-testid="intake-skip">Skip</button>}
        <button type="submit" className="ob-btn ob-btn-primary" disabled={busy} data-testid={isLast ? 'intake-submit' : 'intake-next'}>
          {isLast ? (busy ? 'Saving…' : submitLabel ?? 'Submit') : 'Continue'}
        </button>
      </div>
    </form>
  );
}
