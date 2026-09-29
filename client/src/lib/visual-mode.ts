/**
 * VISUAL MODES — five grounds for the same product, one attribute.
 *
 *   dark      the default terminal (the NEXUS palette, #06070a ground)
 *   midnight  true-black OLED: #000 grounds, text dimmed a step, same accents
 *   dim       a softer dark grey for long daylight sessions
 *   light     the day-shift palette (#f2f5f9 ground)
 *   contrast  high contrast: WCAG AAA (≥7:1) body text on every ground,
 *             solid borders, thicker focus rings, no translucency
 *
 * The active mode is `html[data-mode="…"]`; every token override lives in
 * styles/modes.css (and lux.css / nexus.css / index.css for dark + light).
 * The legacy classes stay in step so the existing selectors keep working:
 * light → `html.light.terminal-nexus-light` (+ `.light` on the shells'
 * .nexus-vars root, via useTheme().theme === 'nexus-light'); every other
 * mode → `html.dark.terminal-nexus`.
 *
 * Persisted PER DEVICE in localStorage (`qe-mode`), every access in
 * try/catch (private mode / blocked storage → the default, never a throw).
 * client/index.html applies the saved mode before first paint with the same
 * rules (keep MODE_KEY / LEGACY_KEY / the migration in sync with it), so the
 * boot screen and the first frame are already on the right ground.
 *
 * Contrast ratios per mode are measured in docs/DESIGN_SYSTEM.md "Visual modes".
 */
import { useSyncExternalStore } from 'react';

export type VisualMode = 'dark' | 'midnight' | 'dim' | 'light' | 'contrast';

export const VISUAL_MODES: { id: VisualMode; label: string; hint: string }[] = [
  { id: 'dark', label: 'Dark', hint: 'The default terminal' },
  { id: 'midnight', label: 'Midnight', hint: 'True black for OLED screens, text dimmed a step' },
  { id: 'dim', label: 'Dim', hint: 'Softer dark grey, less glare' },
  { id: 'light', label: 'Light', hint: 'Light ground for bright rooms' },
  { id: 'contrast', label: 'High contrast', hint: 'AAA text contrast, solid borders, thick focus rings' },
];

export const MODE_KEY = 'qe-mode';
/** The pre-2026-09-29 theme key (ThemeProvider storageKey). Read once to migrate. */
export const LEGACY_KEY = 'quantedge-theme';
export const DEFAULT_MODE: VisualMode = 'dark';

/** Browser chrome colour per mode (<meta name="theme-color">) = the mode's ground. */
const THEME_COLOR: Record<VisualMode, string> = {
  dark: '#06070a', midnight: '#000000', dim: '#1a1e26', light: '#f2f5f9', contrast: '#000000',
};

export const isVisualMode = (v: unknown): v is VisualMode =>
  v === 'dark' || v === 'midnight' || v === 'dim' || v === 'light' || v === 'contrast';

/** Old theme values → a mode: nexus/dark → dark, night → midnight, *light → light, system → OS. */
export function fromLegacyTheme(t: string | null | undefined): VisualMode {
  if (!t) return DEFAULT_MODE;
  if (/light/.test(t)) return 'light';
  if (t === 'night') return 'midnight';
  if (t === 'system') {
    try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch { return DEFAULT_MODE; }
  }
  return DEFAULT_MODE;
}

function readStored(): VisualMode {
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (isVisualMode(m)) return m;
    return fromLegacyTheme(localStorage.getItem(LEGACY_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

/** Put a mode on <html>: the data attribute, the legacy classes, color-scheme, theme-color. */
export function applyMode(mode: VisualMode) {
  if (typeof document === 'undefined') return;
  const h = document.documentElement;
  h.setAttribute('data-mode', mode);
  h.classList.remove('light', 'dark', 'terminal-night', 'terminal-nexus', 'terminal-nexus-light');
  if (mode === 'light') h.classList.add('light', 'terminal-nexus-light');
  else h.classList.add('dark', 'terminal-nexus');
  h.style.colorScheme = mode === 'light' ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[mode]);
  version++;
}

let state: VisualMode = typeof window === 'undefined' ? DEFAULT_MODE : readStored();
/** Bumps on every apply — canvas painters cache resolved colours against it. */
let version = 0;
export const modeVersion = () => version;
const listeners = new Set<() => void>();

export function getMode(): VisualMode { return state; }

export function setMode(mode: VisualMode) {
  if (!isVisualMode(mode)) return;
  state = mode;
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* private mode: this session only */ }
  applyMode(mode);
  listeners.forEach((l) => l());
}

/** The rail's one-click ☀/☾: light ↔ the dark-ground mode the viewer came from. */
let lastDarkGround: VisualMode = 'dark';
export function toggleLight() {
  if (state === 'light') setMode(lastDarkGround);
  else { lastDarkGround = state; setMode('light'); }
}

export function useVisualMode(): [VisualMode, (m: VisualMode) => void] {
  const mode = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
    () => DEFAULT_MODE,
  );
  return [mode, setMode];
}

// Re-assert on module load: index.html already applied it pre-paint; this
// covers a page that skipped that script (tests, an embedded build).
if (typeof window !== 'undefined') applyMode(state);
