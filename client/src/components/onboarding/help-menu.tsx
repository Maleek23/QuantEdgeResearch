/**
 * Help entries for the account menu (terminal shell + NexusFrame):
 * "Take the tour" re-launches the current page's tour; "What's new" opens /updates.
 */
import { Compass, Sparkles } from 'lucide-react';
import { useLocation } from 'wouter';
import { LuxMenuItem } from '@/components/lux/lux-menu';
import { startTour } from '@/lib/onboarding';
import { useUpdatesBadge } from '@/lib/updates';

export function HelpMenuItems() {
  const [, setLocation] = useLocation();
  const badge = useUpdatesBadge();
  return (
    <>
      <LuxMenuItem icon={<Compass />} onSelect={() => window.setTimeout(() => startTour(), 50)} data-testid="menu-take-tour">Take the tour</LuxMenuItem>
      <LuxMenuItem icon={<Sparkles />} end={badge > 0 ? badge : undefined} onSelect={() => setLocation('/updates')} data-testid="menu-whats-new">What’s new</LuxMenuItem>
    </>
  );
}
