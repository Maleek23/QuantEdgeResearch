/**
 * ThemeProvider / useTheme — a thin adapter over the visual-mode store
 * (lib/visual-mode.ts).
 *
 * Since 2026-09-29 the app has five VISUAL MODES (dark · midnight · dim ·
 * light · high contrast) on `html[data-mode]`. `theme` is kept for the many
 * existing readers that only need "is this the light ground?": it is
 * 'nexus-light' in light mode and 'nexus' in every dark-ground mode.
 * `setTheme(legacyValue)` still works (maps onto a mode), so an older caller
 * cannot put the app into a state the mode store does not know about.
 *
 * The store is module-level, so useTheme() works with or without the
 * provider; ThemeProvider stays so App.tsx's tree is unchanged.
 */
import type { ReactNode } from "react";
import { fromLegacyTheme, isVisualMode, useVisualMode, type VisualMode } from "@/lib/visual-mode";

export type Theme = "dark" | "night" | "nexus" | "nexus-light" | "light" | "system";

type ThemeProviderProps = {
  children: ReactNode;
  /** Kept for API compatibility; the default is lib/visual-mode DEFAULT_MODE. */
  defaultTheme?: Theme;
  /** Kept for API compatibility; the legacy key is only read once, to migrate. */
  storageKey?: string;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  return <>{children}</>;
}

export function useTheme(): {
  /** 'nexus-light' on the light ground, 'nexus' on every dark ground */
  theme: Theme;
  setTheme: (theme: Theme) => void;
  mode: VisualMode;
  setMode: (mode: VisualMode) => void;
} {
  const [mode, setMode] = useVisualMode();
  return {
    theme: mode === 'light' ? 'nexus-light' : 'nexus',
    setTheme: (t: Theme) => setMode(isVisualMode(t) ? t : t === 'nexus' ? 'dark' : fromLegacyTheme(t)),
    mode,
    setMode,
  };
}
