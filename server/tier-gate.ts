/**
 * The tier gate behind routes.ts requireTier(feature): one pure decision so
 * scripts/test-admin-ops.ts can prove a brand-new Free account reaches the Free
 * features and is refused the paid-only ones (server/tierConfig.ts).
 */
import type { SubscriptionTier } from '@shared/schema';
import { TIER_CONFIG, canAccessFeature, type TierLimits } from './tierConfig';
import { ACCOUNT_DISABLED_ERROR, isAccountDisabled } from './admin-ops';

type GateUser = { email?: string | null; subscriptionTier?: string | null; subscriptionStatus?: string | null };

export type TierGateDecision =
  | { ok: true }
  | { ok: false; status: 401 | 403; body: Record<string, unknown> };

/**
 * Minimum tier label for a feature (for the 403 message), read from
 * TIER_CONFIG itself. It used to be two hand-kept lists that missed some
 * features (e.g. prioritySupport), whose 403 then said "requires Free tier".
 */
export function requiredTierForFeature(feature: keyof TierLimits): 'Free' | 'Advanced' | 'Pro' {
  if (TIER_CONFIG.free[feature] === true) return 'Free';
  if (TIER_CONFIG.advanced[feature] === true) return 'Advanced';
  return 'Pro';
}

const TIER_NAMES: Record<string, string> = { free: 'Free', advanced: 'Advanced', pro: 'Pro' };

/**
 * user = the session's user (null when signed out / unknown); isAdmin = the
 * caller's existing admin check (ADMIN_EMAIL or the admin tier).
 */
export function tierGateDecision(user: GateUser | null | undefined, feature: keyof TierLimits, isAdmin: boolean): TierGateDecision {
  if (!user) return { ok: false, status: 401, body: { message: 'Unauthorized' } };
  if (isAccountDisabled(user)) return { ok: false, status: 403, body: { message: ACCOUNT_DISABLED_ERROR, code: 'ACCOUNT_DISABLED' } };
  if (isAdmin) return { ok: true };
  // Anything that is not a known paid tier is gated as Free.
  const raw = user.subscriptionTier;
  const tier: Exclude<SubscriptionTier, 'admin'> = raw === 'advanced' || raw === 'pro' ? raw : 'free';
  if (canAccessFeature(tier, feature)) return { ok: true };
  return {
    ok: false,
    status: 403,
    body: {
      message: `This feature requires ${requiredTierForFeature(feature)} tier or higher`,
      currentTier: TIER_NAMES[tier] || 'Free',
      requiredFeature: feature,
      upgradeUrl: '/?section=pricing',
    },
  };
}
