/**
 * DEV-ONLY: /dev/zerodte — the real 0DTE desk on fixture data (dev/zerodte-mocks.ts,
 * installed by main.tsx before mount). ?fx=preopen|live|midday|closed &mode=light|dark.
 * Dropped from production builds (App.tsx gates the route on import.meta.env.DEV).
 */
import { useEffect } from 'react';
import ZeroDteView from '@/components/zerodte/zero-dte-desk';
import { applyMode } from '@/lib/visual-mode';

export default function ZeroDteHarness() {
  const mode = new URLSearchParams(window.location.search).get('mode') === 'light' ? 'light' : 'dark';
  useEffect(() => {
    applyMode(mode);
    // ThemeProvider may re-apply the stored mode after mount; pin the harness mode once more.
    const id = window.setTimeout(() => applyMode(mode), 300);
    return () => window.clearTimeout(id);
  }, [mode]);
  return (
    <div className={`nexus-vars ${mode === 'light' ? 'light' : ''}`} style={{ height: '100dvh', overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg)' }} data-testid="zerodte-harness">
      <ZeroDteView />
    </div>
  );
}
