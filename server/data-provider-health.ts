/**
 * DATA PROVIDER HEALTH — the feeds the product actually uses, observed from
 * the calls it already makes (no probe requests of its own).
 *
 * Before 2026-09-29 the terminal's "Data ready / Data partial" chip read
 * /api/health, whose overall status was `degraded` whenever TRADIER failed —
 * and Tradier's token is rejected, so every viewer saw "Data partial" forever
 * while options and quotes were in fact flowing from Alpaca → CBOE → Yahoo.
 * Tradier is no longer a product data source (server/tradier-api.ts paths are
 * circuit-broken and kept last in every cascade); it is not listed here.
 *
 * Providers, in the order the product leans on them:
 *   alpaca    options chains + greeks (indicative feed) and IEX spot — primary
 *   schwab    real-time chains / quotes — only when configured
 *   cboe      delayed option chains — fallback when Alpaca has no chain
 *   yahoo     quotes, candles, fallback chains
 *   bullflow  options-flow alerts stream (SSE) — only when configured
 *
 * State of one provider:
 *   not_configured  no credentials — never counts against the chip
 *   idle            no call observed in the last RECENT_MS (a fallback that is
 *                   not being needed is idle, not down)
 *   ok              the most recent observation succeeded
 *   degraded        the most recent observation failed or was rate-limited,
 *                   but fewer than DOWN_AFTER consecutive failures
 *   down            DOWN_AFTER+ consecutive failures within RECENT_MS
 *
 * `dataPartial` is true only when a configured provider is `down` — that is
 * what the chip's "Data partial" means now.
 */
// Leaf module: the provider modules import it, so it imports none of them
// (credential checks mirror isAlpacaOptionsConfigured / isSchwabConfigured).

export type ProviderId = 'alpaca' | 'schwab' | 'cboe' | 'yahoo' | 'bullflow';
export type ProviderState = 'not_configured' | 'idle' | 'ok' | 'degraded' | 'down';

const RECENT_MS = 15 * 60_000;
const DOWN_AFTER = 3;

const META: Record<ProviderId, { label: string; role: string }> = {
  alpaca: { label: 'Alpaca', role: 'option chains + greeks (indicative), IEX spot — primary' },
  schwab: { label: 'Schwab', role: 'real-time chains and quotes (when configured)' },
  cboe: { label: 'CBOE delayed', role: 'option chains, ~15-min delayed — fallback' },
  yahoo: { label: 'Yahoo Finance', role: 'quotes, candles, fallback chains' },
  bullflow: { label: 'Bullflow', role: 'options-flow alerts stream' },
};

interface Obs {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastError: string | null;
  consecutiveFailures: number;
}
const OBS = new Map<ProviderId, Obs>();
const obs = (id: ProviderId): Obs => {
  let o = OBS.get(id);
  if (!o) { o = { lastSuccessAt: null, lastFailureAt: null, lastError: null, consecutiveFailures: 0 }; OBS.set(id, o); }
  return o;
};

/** Record one real call's outcome. `ok` = the provider answered usefully. */
export function noteProvider(id: ProviderId, ok: boolean, error?: string): void {
  const o = obs(id);
  if (ok) { o.lastSuccessAt = Date.now(); o.consecutiveFailures = 0; return; }
  o.lastFailureAt = Date.now();
  o.lastError = error ?? 'failed';
  o.consecutiveFailures++;
}

/**
 * HTTP status → provider outcome. A 4xx that means "no such symbol / no
 * options for it" is the provider answering, not the provider failing.
 */
export function httpOk(status: number): boolean {
  if (status >= 200 && status < 300) return true;
  return status === 400 || status === 404 || status === 422;
}

function configured(id: ProviderId): boolean {
  const env = process.env;
  if (id === 'alpaca') return !!(env.ALPACA_API_KEY && env.ALPACA_SECRET_KEY);
  if (id === 'schwab') return !!(env.SCHWAB_APP_KEY && env.SCHWAB_APP_SECRET && env.SCHWAB_REFRESH_TOKEN);
  if (id === 'bullflow') return !!process.env.BULLFLOW_API_KEY?.trim();
  return true; // CBOE delayed + Yahoo need no key
}

export interface ProviderHealth {
  id: ProviderId;
  label: string;
  role: string;
  configured: boolean;
  state: ProviderState;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  detail: string | null;
}

/** Bullflow's stream state, injected by the caller (avoids importing the stream module here). */
export function getDataProviderHealth(opts: { bullflowStream?: string } = {}): { providers: ProviderHealth[]; dataPartial: boolean; partial: string[] } {
  const now = Date.now();
  const providers = (Object.keys(META) as ProviderId[]).map((id): ProviderHealth => {
    const o = obs(id);
    const iso = (t: number | null) => (t ? new Date(t).toISOString() : null);
    const base = { id, ...META[id], configured: configured(id), lastSuccessAt: iso(o.lastSuccessAt), lastFailureAt: iso(o.lastFailureAt) };
    if (!base.configured) return { ...base, state: 'not_configured', detail: 'no credentials configured' };

    // Bullflow is a long-lived stream: its connection state IS its health.
    if (id === 'bullflow' && opts.bullflowStream) {
      const s = opts.bullflowStream;
      const state: ProviderState = s === 'live' ? 'ok' : s === 'backoff' ? 'down' : s === 'connecting' ? 'degraded' : 'idle';
      return { ...base, state, detail: `stream ${s}` };
    }

    const last = Math.max(o.lastSuccessAt ?? 0, o.lastFailureAt ?? 0);
    if (!last || now - last > RECENT_MS) return { ...base, state: 'idle', detail: last ? 'no call in the last 15 min' : 'no call observed since boot' };
    const failing = (o.lastFailureAt ?? 0) > (o.lastSuccessAt ?? 0);
    if (!failing) return { ...base, state: 'ok', detail: null };
    return { ...base, state: o.consecutiveFailures >= DOWN_AFTER ? 'down' : 'degraded', detail: o.lastError };
  });
  const partial = providers.filter((p) => p.configured && p.state === 'down').map((p) => p.label);
  return { providers, dataPartial: partial.length > 0, partial };
}
