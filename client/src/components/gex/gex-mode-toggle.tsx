/**
 * GEXModeToggle — Skylit-style pill toggle for switching chart visualization modes.
 * Orbs | Heatmap | Projection | Walls
 */

import { componentStyles } from '@/lib/design-tokens';
import { cn } from '@/lib/utils';
import type { GEXViewMode } from '../../../../shared/gex-types';

interface GEXModeToggleProps {
  mode: GEXViewMode;
  onChange: (mode: GEXViewMode) => void;
}

const MODES: Array<{ value: GEXViewMode; label: string }> = [
  { value: 'orbs', label: 'Orbs' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'projection', label: 'Projection' },
  { value: 'walls', label: 'Walls' },
];

export function GEXModeToggle({ mode, onChange }: GEXModeToggleProps) {
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--gex-positive)]/15"
      data-testid="gex-mode-toggle"
    >
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          className={cn(
            mode === m.value
              ? componentStyles.gex.modeButtonActive
              : componentStyles.gex.modeButton,
          )}
          data-testid={`gex-mode-${m.value}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
