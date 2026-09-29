/**
 * The display-mode choice, in the two places the operator asked for it:
 *   <ModeMenuItems />   inside an account LuxMenu (terminal shell, NexusFrame)
 *   <ModePicker />      a labelled segmented control (Settings › Display,
 *                       the Customize panel)
 * One store (lib/visual-mode.ts); both write the same per-device mode.
 */
import { Contrast, Moon, MoonStar, Sun, SunDim } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VISUAL_MODES, useVisualMode, type VisualMode } from '@/lib/visual-mode';
import { LuxMenuRadioGroup, LuxMenuRadioItem, LuxMenuSeparator } from '@/components/lux/lux-menu';

const ICON: Record<VisualMode, typeof Moon> = { dark: Moon, midnight: MoonStar, dim: SunDim, light: Sun, contrast: Contrast };

export function ModeMenuItems() {
  const [mode, setMode] = useVisualMode();
  return (
    <>
      <LuxMenuSeparator />
      <div className="lx-menu-label" role="presentation"><small>Display mode</small></div>
      <LuxMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as VisualMode)} aria-label="Display mode">
        {VISUAL_MODES.map((m) => {
          const I = ICON[m.id];
          return (
            <LuxMenuRadioItem key={m.id} value={m.id} icon={<I />} title={m.hint}
              onSelect={(e) => e.preventDefault() /* keep the menu open so the change is seen in place */}>
              {m.label}
            </LuxMenuRadioItem>
          );
        })}
      </LuxMenuRadioGroup>
      <LuxMenuSeparator />
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
