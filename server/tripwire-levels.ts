/**
 * TRIPWIRE level sweep — approach/touch alerts on Apex, Gatekeeper, walls and
 * zero-γ for every symbol on any member's watchlist (cap TRIPWIRE_MAX, 40).
 *
 * Levels: walls + zero-γ from the GEX engine's 0DTE ("today") book read
 * (gex-horizon-view, falling back to the all-expiry headline), Apex +
 * Gatekeeper from the Gravity read (server/gravity-route.ts). Price from the
 * realtime quote service. Pure evaluation: shared/tripwire-levels.ts.
 *
 * Delivery = the existing alerts infra: in-app (system-pulse 'alert' line,
 * the same feed the level-cross alerts use) + ONE batched Discord line via
 * discord-service sendDiscordAlert (the alerts webhook, DISCORD_WEBHOOK_QUANTFLOOR).
 * Dedupe per (session, symbol, level, event), persisted to
 * server/data/tripwire-sent.json so a restart does not re-send.
 *
 * Every dependency is injectable (TripwireDeps) — the test passes fakes and
 * never reaches a webhook. Flag TRIPWIRE_LEVELS (default on).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { evaluateTripwires, type TripAlert, type TripLevel } from '@shared/tripwire-levels';
import { serverFlag } from '@shared/feature-flags';
import { marketDateET } from '@shared/market-day';
import { logger } from './logger';

export interface TripwireDeps {
  symbols(): Promise<string[]>;
  levels(symbol: string): Promise<TripLevel[]>;
  quotes(symbols: string[]): Promise<Map<string, number>>;
  inApp(text: string): void;
  discord(text: string): Promise<void>;
  now(): number;
}

interface State { date: string; sent: string[]; prev: Record<string, number> }
const FILE = path.join(process.cwd(), 'server', 'data', 'tripwire-sent.json');
let state: State | null = null;

async function loadState(file: string): Promise<State> {
  if (state) return state;
  try { state = JSON.parse(await fs.readFile(file, 'utf8')); } catch { state = null; }
  if (!state || typeof state !== 'object' || !Array.isArray(state.sent)) state = { date: '', sent: [], prev: {} };
  return state;
}
async function saveState(file: string, s: State) {
  try { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(s)); } catch { /* memory still dedupes */ }
}
/** Test hook. */
export function resetTripwireState() { state = null; }

/** One sweep. Returns the alerts delivered. */
export async function sweepTripwires(deps: TripwireDeps = defaultDeps(), file = FILE): Promise<TripAlert[]> {
  if (!serverFlag('TRIPWIRE_LEVELS')) return [];
  const s = await loadState(file);
  const date = marketDateET(new Date(deps.now()));
  if (s.date !== date) { s.date = date; s.sent = []; s.prev = {}; }
  const sent = new Set(s.sent);
  const syms = (await deps.symbols()).slice(0, Number(process.env.TRIPWIRE_MAX ?? 40) || 40);
  if (!syms.length) return [];
  const px = await deps.quotes(syms);
  const fired: TripAlert[] = [];
  for (const sym of syms) {
    const price = px.get(sym);
    if (!(price && price > 0)) continue;
    let levels: TripLevel[] = [];
    try { levels = await deps.levels(sym); } catch (e) { logger.debug?.(`[TRIPWIRE] ${sym} levels: ${(e as Error).message}`); continue; }
    const alerts = evaluateTripwires({ date, symbol: sym, price, prevPrice: s.prev[sym] ?? null, levels, sent });
    for (const a of alerts) { sent.add(a.key); fired.push(a); }
    s.prev[sym] = price;
  }
  s.sent = [...sent];
  await saveState(file, s);
  if (!fired.length) return fired;
  for (const a of fired) { try { deps.inApp(`Tripwire: ${a.text}`); } catch { /* decoration */ } }
  try { await deps.discord(fired.map((a) => `Tripwire · ${a.text}`).join('\n')); } catch (e) { logger.warn('[TRIPWIRE] discord relay failed (alerts still recorded):', e); }
  logger.info(`[TRIPWIRE] ${fired.length} alert(s): ${fired.map((a) => a.key).join(', ')}`);
  return fired;
}

/** Production wiring (never used by tests). */
export function defaultDeps(): TripwireDeps {
  return {
    async symbols() {
      const { storage } = await import('./storage');
      const rows = await storage.getAllWatchlist();
      return [...new Set(rows.filter((r: any) => !r.assetType || r.assetType === 'stock' || r.assetType === 'option').map((r: any) => String(r.symbol).toUpperCase()))]
        .filter((x) => /^[A-Z][A-Z.]{0,5}$/.test(x));
    },
    async levels(sym) {
      const out: TripLevel[] = [];
      const { calculateAggregateGammaExposure } = await import('./gamma-exposure');
      const gex: any = await calculateAggregateGammaExposure(sym);
      if (gex) {
        let cw = gex.callWall ?? null; let pw = gex.putWall ?? null; let flip = gex.zeroGammaLevel ?? gex.flipPoint ?? null;
        try {
          const { buildHorizonView } = await import('./gex-horizon-view');
          const v: any = buildHorizonView(gex, gex.strikeExpiryMatrix ?? [], 'today', Date.now());
          cw = v.callWall ?? cw; pw = v.putWall ?? pw; flip = v.zeroGamma ?? flip;
        } catch { /* headline levels */ }
        if (cw) out.push({ kind: 'call-wall', price: cw });
        if (pw) out.push({ kind: 'put-wall', price: pw });
        if (flip) out.push({ kind: 'zero-gamma', price: flip });
      }
      try {
        const { buildGravity } = await import('./gravity-route');
        const g = await buildGravity(sym, 'today');
        if (g.read?.apex) out.push({ kind: 'apex', price: g.read.apex });
        if (g.read?.gatekeeper) out.push({ kind: 'gatekeeper', price: g.read.gatekeeper });
      } catch { /* gravity optional */ }
      return out;
    },
    async quotes(symbols) {
      const { getRealtimeBatchQuotes } = await import('./realtime-pricing-service');
      const q = await getRealtimeBatchQuotes(symbols.map((symbol) => ({ symbol, assetType: 'stock' as const })));
      const m = new Map<string, number>();
      for (const s of symbols) { const p = Number((q.get(s) as any)?.price); if (Number.isFinite(p) && p > 0) m.set(s, p); }
      return m;
    },
    inApp(text) { void import('./system-pulse').then(({ pulse }) => pulse('alert', text)).catch(() => {}); },
    async discord(text) { const { sendDiscordAlert } = await import('./discord-service'); await sendDiscordAlert(text, 'info'); },
    now: () => Date.now(),
  };
}
