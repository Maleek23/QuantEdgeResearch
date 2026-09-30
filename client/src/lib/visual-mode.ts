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

/**
 * Each mode's palette as literal values, for the Settings › Display previews
 * (a preview has to show a mode that is NOT the active one, so it cannot read
 * the live --lx-* variables). Values are the measured tokens in
 * styles/modes.css / docs/DESIGN_SYSTEM.md "Visual modes" — keep in sync.
 */
export const MODE_SWATCH: Record<VisualMode, {
  bg: string; surface: string; hi: string; line: string; text: string; dim: string; accent: string; gain: string; loss: string; caution: string;
}> = {
  dark:     { bg: '#06070a', surface: '#0e1117', hi: '#1a1f2a', line: 'rgba(59,140,255,0.22)', text: '#e8ecf3', dim: '#8b93a3', accent: '#3b8cff', gain: '#6ee7b7', loss: '#ff6b3d', caution: '#facc15' },
  midnight: { bg: '#000000', surface: '#07080b', hi: '#12151c', line: 'rgba(59,140,255,0.2)', text: '#d6dbe4', dim: '#868e9d', accent: '#3b8cff', gain: '#6ee7b7', loss: '#ff6b3d', caution: '#facc15' },
  dim:      { bg: '#1a1e26', surface: '#232933', hi: '#303744', line: 'rgba(160,175,200,0.26)', text: '#e6e9ef', dim: '#b0b8c6', accent: '#66a4ff', gain: '#78ebbf', loss: '#ff8f66', caution: '#fad33d' },
  light:    { bg: '#f2f5f9', surface: '#ffffff', hi: '#e7ecf3', line: 'rgba(29,99,209,0.22)', text: '#121826', dim: '#46536b', accent: '#1a63d1', gain: '#047857', loss: '#b23c0b', caution: '#8f5706' },
  contrast: { bg: '#000000', surface: '#0a0a0c', hi: '#17191f', line: '#aab3c2', text: '#ffffff', dim: '#e2e6ed', accent: '#7ab2ff', gain: '#86f2c8', loss: '#ff9a73', caution: '#ffdc55' },
};

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
