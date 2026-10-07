/**
 * Beta intake profile — the questions asked on the waitlist form and, for
 * invited users who skipped it, the one-time "Complete your profile" sheet.
 *
 * One source for the option lists (client renders them, server validates
 * against them, admin filters on them) and for the experience → onboarding
 * tier mapping (client/src/lib/onboarding.ts).
 *
 * Storage: server/intake-store.ts (beta_waitlist.profile jsonb once
 * migrations/0007_intake_onboarding.sql is applied; .cache/shared file until then).
 */

export const EXPERIENCE = [
  { id: 'new', label: 'Brand new' },
  { id: 'lt1', label: 'Under 1 year' },
  { id: '1to3', label: '1–3 years' },
  { id: '3plus', label: '3+ years' },
  { id: 'pro', label: 'Professional' },
] as const;
export const MARKETS = [
  { id: 'stocks', label: 'Stocks' },
  { id: 'options', label: 'Options' },
  { id: '0dte', label: '0DTE' },
  { id: 'futures', label: 'Futures' },
  { id: 'crypto', label: 'Crypto' },
] as const;
export const ACCOUNT_SIZE = [
  { id: 'lt1k', label: 'Under $1k' },
  { id: '1to5k', label: '$1k–5k' },
  { id: '5to25k', label: '$5k–25k' },
  { id: '25to100k', label: '$25k–100k' },
  { id: '100kplus', label: '$100k+' },
  { id: 'na', label: 'Prefer not to say' },
] as const;
export const GOALS = [
  { id: 'learn', label: 'Learn to trade' },
  { id: 'ideas', label: 'Signals and ideas' },
  { id: 'automation', label: 'Automation / bot' },
  { id: 'research', label: 'Research tools' },
] as const;
export const SOURCES = [
  { id: 'discord', label: 'Discord' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'x', label: 'X' },
  { id: 'referral', label: 'Friend / referral' },
  { id: 'other', label: 'Other' },
] as const;
export const TRADING_TIME = [
  { id: 'premarket', label: 'Pre-market' },
  { id: 'open', label: 'The open' },
  { id: 'allday', label: 'All day' },
  { id: 'afterwork', label: 'After work' },
] as const;
export const TOOLS = [
  { id: 'tradingview', label: 'TradingView' },
  { id: 'webull', label: 'Webull' },
  { id: 'robinhood', label: 'Robinhood' },
  { id: 'tos', label: 'thinkorswim' },
  { id: 'ibkr', label: 'IBKR' },
  { id: 'other', label: 'Other' },
] as const;

type Ids<T extends readonly { id: string }[]> = T[number]['id'];
export type Experience = Ids<typeof EXPERIENCE>;
export type Market = Ids<typeof MARKETS>;
export type AccountSize = Ids<typeof ACCOUNT_SIZE>;
export type Goal = Ids<typeof GOALS>;
export type Source = Ids<typeof SOURCES>;
export type TradingTime = Ids<typeof TRADING_TIME>;
export type Tool = Ids<typeof TOOLS>;

export interface IntakeProfile {
  name: string;
  experience: Experience;
  markets: Market[];
  accountSize: AccountSize;
  goal: Goal;
  source: Source;
  /** referral → who referred them; other → free text. */
  sourceDetail?: string;
  occupation?: string;
  industry?: string;
  timezone?: string;
  discord?: string;
  tradingTime?: TradingTime;
  struggle?: string;
  tools?: Tool[];
  consentEmails: boolean;
  /** Must be true — "not financial advice" acknowledgement. */
  ackNotAdvice: true;
  /** Server-stamped. */
  submittedAt?: string;
  /** 'waitlist' | 'profile-sheet' | 'settings' */
  via?: string;
}

export const STRUGGLE_MAX = 280;
const SHORT_MAX = 80;

const idsOf = (list: readonly { id: string }[]) => new Set(list.map((o) => o.id));
const oneOf = <T extends string>(list: readonly { id: string }[], v: unknown): T | null =>
  typeof v === 'string' && idsOf(list).has(v) ? (v as T) : null;
const manyOf = <T extends string>(list: readonly { id: string }[], v: unknown): T[] => {
  if (!Array.isArray(v)) return [];
  const ok = idsOf(list);
  return [...new Set(v.filter((x): x is T => typeof x === 'string' && ok.has(x)))];
};
/** Trim, strip control chars / angle brackets, cap length; empty → undefined. */
export function cleanText(v: unknown, max = SHORT_MAX): string | undefined {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || undefined;
}

export type IntakeErrors = Partial<Record<keyof IntakeProfile, string>>;

/** Validates and normalises a profile. Unknown keys are dropped. */
export function validateIntakeProfile(body: unknown): { ok: true; value: IntakeProfile } | { ok: false; errors: IntakeErrors } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const errors: IntakeErrors = {};
  const name = cleanText(b.name, SHORT_MAX);
  if (!name) errors.name = 'Add your name.';
  const experience = oneOf<Experience>(EXPERIENCE, b.experience);
  if (!experience) errors.experience = 'Pick your trading experience.';
  const markets = manyOf<Market>(MARKETS, b.markets);
  if (!markets.length) errors.markets = 'Pick at least one thing you trade.';
  const accountSize = oneOf<AccountSize>(ACCOUNT_SIZE, b.accountSize);
  if (!accountSize) errors.accountSize = 'Pick an account size, or “Prefer not to say”.';
  const goal = oneOf<Goal>(GOALS, b.goal);
  if (!goal) errors.goal = 'Pick what you want most from QuantEdge.';
  const source = oneOf<Source>(SOURCES, b.source);
  if (!source) errors.source = 'Tell us how you heard about us.';
  const sourceDetail = cleanText(b.sourceDetail, SHORT_MAX);
  if (b.ackNotAdvice !== true) errors.ackNotAdvice = 'Please confirm you understand QuantEdge is not financial advice.';
  if (Object.keys(errors).length) return { ok: false, errors };
  const value: IntakeProfile = {
    name: name!, experience: experience!, markets, accountSize: accountSize!, goal: goal!, source: source!,
    consentEmails: b.consentEmails === true, ackNotAdvice: true,
  };
  if (sourceDetail && (source === 'referral' || source === 'other')) value.sourceDetail = sourceDetail;
  const occupation = cleanText(b.occupation); if (occupation) value.occupation = occupation;
  const industry = cleanText(b.industry); if (industry) value.industry = industry;
  const timezone = cleanText(b.timezone, 64); if (timezone) value.timezone = timezone;
  const discord = cleanText(b.discord, 40); if (discord) value.discord = discord;
  const tradingTime = oneOf<TradingTime>(TRADING_TIME, b.tradingTime); if (tradingTime) value.tradingTime = tradingTime;
  const struggle = cleanText(b.struggle, STRUGGLE_MAX); if (struggle) value.struggle = struggle;
  const tools = manyOf<Tool>(TOOLS, b.tools); if (tools.length) value.tools = tools;
  return { ok: true, value };
}

export type OnboardingTier = 'beginner' | 'intermediate' | 'pro';

/** Brand new / <1 yr → beginner · 1–3 yrs → intermediate · 3+ / professional → pro. No profile → beginner-safe default is NOT assumed: null. */
export function experienceTier(exp: Experience | null | undefined): OnboardingTier | null {
  if (!exp) return null;
  if (exp === 'new' || exp === 'lt1') return 'beginner';
  if (exp === '1to3') return 'intermediate';
  return 'pro';
}

export const labelOf = (list: readonly { id: string; label: string }[], id: string | undefined | null) =>
  list.find((o) => o.id === id)?.label ?? (id ?? '');
