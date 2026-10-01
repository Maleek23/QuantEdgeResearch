/**
 * Light / Dark / System — the PUBLIC pages' mode picker (landing header,
 * login, signup). Operator 2026-09-30: "landing page people should be able to
 * pick whichever mode". Inside the app the mode is still chosen in
 * Settings › Display only; this control is for pages a visitor sees before
 * they have Settings.
 *
 * It writes the app's one mode store (lib/visual-mode.ts, localStorage
 * `qe-mode`, try/catch inside), so a visitor who then signs in keeps the mode
 * they picked. Default = System (prefers-color-scheme, followed live).
 *
 * A signed-in user may have picked Midnight / Dim / High contrast in
 * Settings — those read as "Dark" here (a dark ground) until the visitor picks.
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { useModePref, type ModePref } from '@/lib/visual-mode';

const OPTS: { id: 'light' | 'dark' | 'system'; label: string; I: typeof Sun }[] = [
  { id: 'light', label: 'Light', I: Sun },
  { id: 'dark', label: 'Dark', I: Moon },
  { id: 'system', label: 'System', I: Monitor },
];

const groupOf = (p: ModePref): 'light' | 'dark' | 'system' => (p === 'system' ? 'system' : p === 'light' ? 'light' : 'dark');

export function ThemePicker({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [pref, setPref] = useModePref();
  const cur = groupOf(pref);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = OPTS.findIndex((o) => o.id === cur);
    const next = OPTS[(i + d + OPTS.length) % OPTS.length];
    setPref(next.id);
    e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-theme-opt="${next.id}"]`)?.focus();
  };
  return (
    <div className={cn('qe-theme-picker', compact && 'compact', className)} role="radiogroup" aria-label="Colour mode">
      {OPTS.map(({ id, label, I }) => {
        const on = id === cur;
        return (
          <button key={id} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            data-theme-opt={id} title={id === 'system' ? 'Match this device' : `${label} mode`}
            aria-label={compact ? (id === 'system' ? 'System (match this device)' : label) : undefined}
            className={cn('qe-theme-opt', on && 'on')}
            onClick={() => { if (!(id === 'dark' && on)) setPref(id); }}
            onKeyDown={onKey}>
            <I aria-hidden size={14} />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
