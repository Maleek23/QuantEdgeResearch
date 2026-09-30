/**
 * PRICING — the one table of plans (landing Pricing section + server JSON-LD offers).
 *
 * PLACEHOLDER (2026-09-30, home-page pass). Another branch is writing the
 * operator's final pricing into this file; if that lands first, keep its values
 * and delete this note. Until then the numbers below are the prices that were
 * already live on the landing (formerly client/src/lib/plans.ts) — carried over,
 * NOT decided. Every value marked TODO(operator) is waiting on the final prices.
 *
 * Shape: { id, name, monthly, annual, blurb, features, cta, highlighted }.
 *   monthly / annual  USD; 0 = free; null = price not announced (renders "Price TBA").
 *   features          short lines, product nouns (docs/POSITIONING.md — no "AI-powered").
 *   cta               button label; the landing picks the action from the plan:
 *                     free → /signup, comingSoon → waitlist, else Stripe checkout.
 *   comingSoon        optional: not purchasable yet (left out of the JSON-LD offers).
 */
export interface PricingPlan {
  id: 'free' | 'advanced' | 'pro';
  name: string;
  monthly: number | null;
  annual: number | null;
  blurb: string;
  features: string[];
  cta: string;
  highlighted: boolean;
  comingSoon?: boolean;
}

export const PLANS: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    annual: 0,
    blurb: 'Look around the terminal on delayed data.',
    features: [
      'Delayed market data (15 min)',
      '5 research briefs per day',
      '7-day performance history',
      'Stocks and crypto',
      '3 watchlist items',
    ],
    cta: 'Start free',
    highlighted: false,
  },
  {
    id: 'advanced',
    name: 'Advanced',
    monthly: 39, // TODO(operator): final monthly price
    annual: 349, // TODO(operator): final annual price
    blurb: 'The full terminal on real-time data.',
    features: [
      'Real-time market data',
      'Unlimited research briefs',
      'Unlimited chart analyses',
      'Full performance history',
      'Discord alerts',
      'Advanced analytics',
      'Export data',
      '50 watchlist items',
    ],
    cta: 'Upgrade to Advanced',
    highlighted: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 79, // TODO(operator): final monthly price
    annual: 699, // TODO(operator): final annual price
    blurb: 'Futures research, API access and integrations — in development.',
    features: [
      'Everything in Advanced',
      'Futures research (NQ, ES, GC) · soon',
      'REST API access · soon',
      'White-label PDF reports · soon',
      'Pattern scanner module · soon',
      'Custom webhooks (Slack, Telegram) · soon',
      'Portfolio correlation analytics · soon',
      'Priority idea generation · soon',
      '1-on-1 onboarding call · soon',
      'Private Discord channel · soon',
    ],
    cta: 'Join the waitlist',
    highlighted: false,
    comingSoon: true,
  },
];

/** Percent saved by paying annually vs 12 × monthly (null when free or unpriced). */
export function annualSavingsPct(p: PricingPlan): number | null {
  if (!p.monthly || p.annual == null) return null;
  const full = p.monthly * 12;
  return Math.round(((full - p.annual) / full) * 100);
}
