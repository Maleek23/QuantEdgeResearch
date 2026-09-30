/**
 * The universal ticker opener. Any board can call openWorkup('TSLA') without
 * threading a context through five component trees.
 *
 * Every call lands on the ONE ticker page (/r/:symbol, docs/TICKER_PAGE.md).
 * A shell may claim the event (the terminal does, to stamp ?from= so the page
 * can offer "Back to <tab>"); when nothing claims it — Today, NEXUS, Slate,
 * any NexusFrame page — the bus navigates itself, so a ticker click is never
 * a silent no-op.
 */
import { navigate } from 'wouter/use-browser-location';

const EVENT = 'qe:workup';

export function tickerHref(symbol: string, section?: string): string {
  const sym = encodeURIComponent(symbol.trim().toUpperCase());
  return `/r/${sym}${section ? `#${section}` : ''}`;
}

export function openWorkup(symbol: string) {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return;
  const ev = new CustomEvent(EVENT, { detail: { symbol: sym }, cancelable: true });
  const unclaimed = window.dispatchEvent(ev);
  if (unclaimed) navigate(tickerHref(sym));
}

export function onWorkup(handler: (symbol: string) => void): () => void {
  const fn = (e: Event) => {
    const sym = (e as CustomEvent).detail?.symbol;
    if (typeof sym === 'string' && sym) {
      e.preventDefault(); // claimed — the bus will not navigate on its own
      handler(sym);
    }
  };
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
