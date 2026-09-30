/**
 * Display mode — ONE home (2026-09-29, operator: "mode settings should be
 * picked only in Settings"). The mode is chosen in Settings › Display
 * (pages/settings.tsx, a visual picker with a preview of every mode).
 *
 *   <ModeMenuItems />   in the account menus (terminal shell, NexusFrame):
 *                       no picker any more — one row that names the current
 *                       mode and opens Settings › Display, plus the Admin hub
 *                       row for the operator. (Kept under the old name so the
 *                       shells did not have to change.)
 *   <ModePicker />      the compact segmented control (kept for reuse; not
 *                       mounted in menus, drawers or the Customize panel).
 * One store (lib/visual-mode.ts), per device.
 */
import { Contrast, Moon, MoonStar, ShieldCheck, Sun, SunDim } from 'lucide-react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { VISUAL_MODES, useVisualMode, type VisualMode } from '@/lib/visual-mode';
import { LuxMenuItem, LuxMenuSeparator } from '@/components/lux/lux-menu';
import { useAuth } from '@/hooks/useAuth';

export const MODE_ICON: Record<VisualMode, typeof Moon> = { dark: Moon, midnight: MoonStar, dim: SunDim, light: Sun, contrast: Contrast };
const ICON = MODE_ICON;

/** The operator flag the server puts on /api/auth/me (sanitizeUser: owner email) or the admin tier. */
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  const u = user as { isAdmin?: boolean; subscriptionTier?: string | null } | null | undefined;
  return !!u && (u.isAdmin === true || u.subscriptionTier === 'admin');
}

export function ModeMenuItems() {
  const [mode] = useVisualMode();
  const [, setLocation] = useLocation();
  const isAdmin = useIsAdmin();
  const I = ICON[mode];
  const label = VISUAL_MODES.find((m) => m.id === mode)?.label ?? 'Dark';
  return (
    <>
      <LuxMenuItem icon={<I />} end={label} onSelect={() => setLocation('/settings#display')}>Display mode</LuxMenuItem>
      {isAdmin && (
        <>
          <LuxMenuSeparator />
          <LuxMenuItem icon={<ShieldCheck />} onSelect={() => setLocation('/admin')}>Admin hub</LuxMenuItem>
        </>
      )}
    </>
  );
}

export function ModePicker({ className }: { className?: string }) {
  const [mode, setMode] = useVisualMode();
  return (
    <div className={cn('qe-mode-picker', className)} role="radiogroup" aria-label="Display mode">
      {VISUAL_MODES.map((m) => {
        const I = ICON[m.id];
        const on = m.id === mode;
        return (
          <button key={m.id} type="button" role="radio" aria-checked={on} title={m.hint}
            className={cn('qe-mode-opt', on && 'on')} onClick={() => setMode(m.id)}>
            <I aria-hidden size={14} /> <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
