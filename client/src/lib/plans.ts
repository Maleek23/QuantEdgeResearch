/**
 * PLANS — the prices and features formerly on /pricing (client/src/pages/pricing.tsx,
 * removed 2026-09-30; /pricing now redirects to the landing's Pricing section).
 * Names, prices and feature lines are carried over unchanged. Checkout uses the
 * same Stripe price env vars (VITE_STRIPE_PRICE_{ADVANCED,PRO}_{MONTHLY,YEARLY}).
 *
 * One copy change: Pro's description said "institutional-grade tools", a phrase
 * docs/POSITIONING.md bans; it now describes what Pro is.
 *
 * Compliance review 2026-09-30 (docs/COMPLIANCE_REVIEW_2026-09-30.md): Free no
 * longer says "risk-free" (a loaded phrase next to trading), and Pro's futures
 * line says research, not trading — QuantEdge never places orders.
 */
export interface PlanFeature { name: string; included: boolean; comingSoon?: boolean }
export interface Plan {
  id: 'free' | 'advanced' | 'pro';
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: PlanFeature[];
  popular?: boolean;
  comingSoon?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'Explore the research platform at no cost',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      { name: '5 research briefs per day', included: true },
      { name: 'Delayed market data (15min)', included: true },
      { name: '7-day performance history', included: true },
      { name: 'Stocks & crypto only', included: true },
      { name: '3 watchlist items', included: true },
      { name: 'Real-time market data', included: false },
      { name: 'Chart analysis', included: false },
      { name: 'Discord alerts', included: false },
      { name: 'Advanced analytics', included: false },
    ],
  },
  {
    id: 'advanced',
    name: 'Advanced',
    description: 'Full stock & crypto access for serious traders',
    monthlyPrice: 39,
    yearlyPrice: 349,
    popular: true,
    features: [
      { name: 'Unlimited research briefs', included: true },
      { name: 'Real-time market data', included: true },
      { name: 'Unlimited chart analyses', included: true },
      { name: 'Unlimited AI generations', included: true },
      { name: 'Full performance history', included: true },
      { name: 'Discord alerts', included: true },
      { name: 'Advanced analytics', included: true },
      { name: 'Export data', included: true },
      { name: '50 watchlist items', included: true },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For power users — futures, API access and custom integrations',
    monthlyPrice: 79,
    yearlyPrice: 699,
    comingSoon: true,
    features: [
      { name: 'Everything in Advanced', included: true },
      { name: 'Futures research (NQ, ES, GC)', included: true, comingSoon: true },
      { name: 'REST API access', included: true, comingSoon: true },
      { name: 'White-label PDF reports', included: true, comingSoon: true },
      { name: 'Pattern Scanner module', included: true, comingSoon: true },
      { name: 'Custom webhooks (Slack, Telegram)', included: true, comingSoon: true },
      { name: 'Portfolio correlation analytics', included: true, comingSoon: true },
      { name: 'Priority idea generation', included: true, comingSoon: true },
      { name: '1-on-1 onboarding call', included: true, comingSoon: true },
      { name: 'Private Discord channel', included: true, comingSoon: true },
    ],
  },
];

/** Percent saved by paying yearly vs 12 × monthly (null for free). */
export function yearlySavingsPct(p: Plan): number | null {
  if (p.monthlyPrice === 0) return null;
  const full = p.monthlyPrice * 12;
  return Math.round(((full - p.yearlyPrice) / full) * 100);
}
