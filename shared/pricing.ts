/**
 * PRICING — the single source of truth for QuantEdge plans (2026-09-30).
 *
 * Rationale, cost model and sources: docs/PRICING_AND_UNIT_ECONOMICS.md.
 * This replaces client/src/lib/plans.ts (Free / Advanced $39 / Pro $79). Until the
 * landing page and server/seo-metadata.ts are switched to import from here, that file
 * is still what renders; switch both in one change so there is only one price table.
 *
 * Ids equal the `SubscriptionTier` values in shared/schema.ts ('free' | 'advanced' | 'pro'),
 * so no DB migration, tier gate (server/tierConfig.ts) or Stripe env var rename is needed.
 * Stripe price ids come from env: VITE_STRIPE_PRICE_{ADVANCED,PRO}_{MONTHLY,YEARLY}
 * (client) / STRIPE_{ADVANCED,PRO}_{MONTHLY,YEARLY}_PRICE_ID (server). New list prices
 * need NEW Stripe Price objects — Stripe prices are immutable.
 *
 * Copy rules (docs/POSITIONING.md, docs/COMPLIANCE_REVIEW_2026-09-30.md):
 *  - Prices sell access to research tools and data, never results. No win rates,
 *    returns, "profitable", "beat the market" or subscriber counts in any plan text.
 *  - Nothing is labelled real-time unless it is licensed for display to subscribers.
 *    Real-time equities/options are `soon: true` until a redistribution licence is signed.
 *  - Features marked `soon` must render with a "Soon" tag and are not sold as delivered.
 */

import type { SubscriptionTier } from './schema';

export type PlanId = Exclude<SubscriptionTier, 'admin'>;

export interface PlanFeature {
  /** What the subscriber gets, in trader nouns. */
  label: string;
  included: boolean;
  /** Not shipped yet (or blocked on a data licence) — render with a "Soon" tag. */
  soon?: boolean;
}

export interface PlanCta {
  label: string;
  /** signup → /signup · checkout → Stripe Checkout · waitlist → /join-beta */
  action: 'signup' | 'checkout' | 'waitlist';
}

export interface Plan {
  id: PlanId;
  name: string;
  /** List price per month, billed monthly (USD). */
  monthly: number;
  /** List price per year, billed yearly (USD). */
  annual: number;
  blurb: string;
  features: PlanFeature[];
  cta: PlanCta;
  /** The recommended plan (render as "Recommended" — not "Most popular", which is a factual claim). */
  highlighted: boolean;
  /** Checkout disabled; show the waitlist CTA. */
  comingSoon?: boolean;
  /** Founder (beta) pricing, locked for `lockMonths` for accounts that subscribe before GA. */
  founder?: { monthly: number; annual: number; lockMonths: number };
}

/** Annual discount applied to list prices (annual = monthly × 12 × (1 − 0.2), rounded to a whole $/mo). */
export const ANNUAL_DISCOUNT = 0.2;

/** Free trial of Advanced: no card, falls back to Free when it ends. Pro has no trial while real-time data is per-user licensed. */
export const TRIAL = { planId: 'advanced' as PlanId, days: 14, cardRequired: false };

/** Founder pricing is offered until general availability or this many founder seats, whichever comes first. */
export const FOUNDER_SEATS = 200;

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    annual: 0,
    blurb: 'During the invite-only beta every desk is open on delayed data. The limits below apply once paid plans launch.',
    highlighted: false,
    cta: { label: 'Start free', action: 'signup' },
    features: [
      { label: '5 NEXUS ideas a day (stocks and crypto)', included: true },
      { label: 'Delayed quotes (15 min) · crypto live', included: true },
      { label: 'GEX dealer map for SPY, QQQ and SPX', included: true },
      { label: 'Public model record, always with its sample size', included: true },
      { label: 'Journal: your own book, broker CSV import', included: true },
      { label: '30 Quantinum credits a month', included: true },
      { label: '3 watchlist symbols', included: true },
      { label: 'Options ideas, FLOW tape and full GEX workspace', included: false },
      { label: '0DTE desk and alerts', included: false },
    ],
  },
  {
    id: 'advanced',
    name: 'Advanced',
    monthly: 49,
    annual: 468,
    blurb: 'The full research terminal: stocks, options and crypto.',
    highlighted: true,
    cta: { label: 'Start 14-day trial', action: 'checkout' },
    founder: { monthly: 29, annual: 288, lockMonths: 12 },
    features: [
      { label: 'Every NEXUS idea: entry, stop, targets, call and trigger times, evidence score', included: true },
      { label: 'Options ideas, 0DTE desk (watch mode), pre-market and crypto ideas', included: true },
      { label: 'FLOW: options flow tape, sweeps, blocks, flow by strike', included: true },
      { label: 'GEX workspace: walls, zero-γ, raw vs delta-adjusted, VEX, squeeze radar', included: true },
      { label: 'Sector ignition and rotation', included: true },
      { label: 'Quantinum read on any ticker · 600 credits a month', included: true },
      { label: 'Quantinum Bot paper ledger', included: true },
      { label: 'Journal: broker import, Discord trader journals, analytics', included: true },
      { label: 'Charts with GEX levels and drawing tools', included: true },
      { label: '50 alerts · 50 watchlist symbols', included: true },
      { label: 'Data age shown on every tile (equity and option chains delayed until licensed real-time ships)', included: true },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 99,
    annual: 948,
    blurb: 'Advanced plus licensed real-time data and power-user tools.',
    highlighted: false,
    comingSoon: true,
    cta: { label: 'Join the waitlist', action: 'waitlist' },
    founder: { monthly: 69, annual: 660, lockMonths: 12 },
    features: [
      { label: 'Everything in Advanced', included: true },
      { label: 'Real-time US equities and options (licensed)', included: true, soon: true },
      { label: '0DTE sniper', included: true },
      { label: 'Unlimited alerts and watchlist', included: true },
      { label: '1,500 Quantinum credits a month', included: true },
      { label: 'Your own Quantinum Bot paper runs', included: true, soon: true },
      { label: 'Webhooks and REST API', included: true, soon: true },
      { label: 'Priority support', included: true },
    ],
  },
];

export const PLAN_BY_ID: Record<PlanId, Plan> = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<PlanId, Plan>;

/** Percent saved by paying yearly vs 12 × monthly (null for free). */
export function annualSavingsPct(p: Pick<Plan, 'monthly' | 'annual'>): number | null {
  if (p.monthly === 0) return null;
  return Math.round(((p.monthly * 12 - p.annual) / (p.monthly * 12)) * 100);
}

/** Effective monthly price when billed yearly, e.g. 468 → 39. */
export function annualPerMonth(p: Pick<Plan, 'annual'>): number {
  return Math.round(p.annual / 12);
}

/** Legal line to render under the plans. Keep in sync with the compliance review. */
export const PRICING_FINE_PRINT =
  'Paid plans renew automatically at the listed price each month or year until cancelled; cancel anytime by emailing support@quantedgelabs.net. ' +
  'Founder prices hold for 12 months from the first payment. Prices buy access to research tools and data, not results. ' +
  'Educational research only — not investment advice. Past performance does not guarantee future results.';

// ── Landing-page adapters ────────────────────────────────────────────────
export type PricingPlan = Plan;

/**
 * Paid checkout stays OFF until (1) the operator approves these prices, (2) new
 * Stripe prices exist for them (the live Stripe prices are the old $39/$79), and
 * (3) the data-licensing decision in docs/PRICING_AND_UNIT_ECONOMICS.md is made.
 * While off, paid plans show their price and route to the beta waitlist.
 */
export const CHECKOUT_LIVE = false;
