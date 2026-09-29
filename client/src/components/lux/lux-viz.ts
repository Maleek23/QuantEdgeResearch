/**
 * Chart tokens at runtime. SVG charts can use var(--lx-*) directly; canvas
 * painters (lightweight-charts, ECharts) cannot, so they resolve the tokens
 * here and re-resolve when the theme class on <html> flips. Every mounted
 * chart shares ONE MutationObserver and one computed-style read.
 *
 * Portions adapted from the Trade Journal web app (apps/web/src/components/
 * charts/tokens.ts: readVizTokens, useVizTokens, tooltipStyle), MIT License,
 * Copyright (c) 2026 LuxAlgo Global, LLC — see ./LICENSE-luxalgo.txt.
 * Token names and values are QuantEdge's (./lux.css).
 */
import { useSyncExternalStore, type CSSProperties } from 'react';

export interface LuxVizTokens {
  surface: string;
  text: string;
  mute: string;
  grid: string;
  baseline: string;
  border: string;
  accent: string;
  gain: string;
  loss: string;
  caution: string;
  series: string[];
}

export function readVizTokens(): LuxVizTokens {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    surface: v('--lx-surface', '#0e1117'),
    text: v('--lx-text', '#e8ecf3'),
    mute: v('--lx-mute', '#7f889a'),
    grid: v('--lx-grid', 'rgba(139,147,163,0.12)'),
    baseline: v('--lx-baseline', 'rgba(139,147,163,0.32)'),
    border: v('--lx-line-hi', 'rgba(59,140,255,0.22)'),
    accent: v('--lx-accent', '#3b8cff'),
    gain: v('--lx-gain', '#6ee7b7'),
    loss: v('--lx-loss', '#ff6b3d'),
    caution: v('--lx-caution', '#facc15'),
    series: [1, 2, 3, 4, 5, 6].map((i) => v(`--lx-series-${i}`, '#3b8cff')),
  };
}

let tokens: LuxVizTokens | null = null;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!observer) {
    const read = () => {
      const next = readVizTokens();
      if (JSON.stringify(next) === JSON.stringify(tokens)) return;
      tokens = next;
      listeners.forEach((notify) => notify());
    };
    observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    read();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      observer?.disconnect();
      observer = null;
      tokens = null;
    }
  };
}

/** Resolved chart colours; null on the very first render (server/pre-mount). */
export function useVizTokens(): LuxVizTokens | null {
  return useSyncExternalStore(subscribe, () => tokens, () => null);
}

/** Recharts/ECharts tooltip box in the lux hover-card style. */
export function vizTooltipStyle(t: LuxVizTokens): CSSProperties {
  return {
    background: t.surface,
    border: `1px solid ${t.border}`,
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 12.5,
    lineHeight: 1.55,
    color: t.text,
    boxShadow: '0 12px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.14)',
  };
}
