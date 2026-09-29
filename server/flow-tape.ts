/**
 * FLOW TAPE — the read model behind the FLOW dashboard's Options Flow tool.
 *
 * Two sources, never blended into one pretend feed:
 *   - 'bullflow'   Bullflow's algo/custom alert prints from the in-process SSE
 *                  ring (getBullflowPrints — zero provider calls; the stream
 *                  is already running). Classification = Bullflow's alert name,
 *                  verbatim. No spot, no OI, no bid/ask side: those fields are
 *                  null because the alert payload does not carry them.
 *   - 'chain-scan' Our own scanners' contract observations (options_flow_history).
 *                  Pattern (sweep/block/unusual) is INFERRED from chain
 *                  snapshots, so it is reported as "-like"; spot / OI / vol-OI
 *                  are measured at the snapshot.
 *
 * Neither source measures the aggressor side of a print, so there is no
 * side / bull / bear field here at all — the UI hides Bid/Ask/AA chips rather
 * than showing an unknown as a value.
 *
 * Cached server-side (15s per window) so any number of open dashboards cost
 * one DB read per window per 15s and nothing against the Bullflow budget.
 */
import { db } from './db';
import { optionsFlowHistory } from '@shared/schema';
import { and, desc, gte } from 'drizzle-orm';
import { marketDateET, marketDateDaysAgo } from '@shared/market-day';
import { logger } from './logger';

export interface TapeRow {
  id: string;
  source: 'bullflow' | 'chain-scan';
  at: string | null;              // ISO time of the print / observation
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;                 // YYYY-MM-DD
  premium: number;                // total premium, dollars
  price: number | null;           // per-contract fill (bullflow) / snapshot premium (chain-scan)
  size: number | null;            // contracts: derived premium/(fill×100) on bullflow, volume on chain-scan
  spot: number | null;            // underlying at observation (chain-scan only)
  openInterest: number | null;
  volOI: number | null;
  /** Bullflow alert name verbatim, or the chain scanner's inferred pattern. */
  label: string;
  /** Normalised class used for chips and tint. */
  kind: 'sweep' | 'block' | 'unusual' | 'repeater' | 'grenade' | 'custom' | 'other';
  alertType: 'algo' | 'custom' | null;
}

export interface TapePayload {
  generatedAt: string;
  windowDays: number;
  rows: TapeRow[];
  truncated: boolean;
  sources: {
    bullflow: { enabled: boolean; streamState: string; rows: number; newestAt: string | null };
    chainScan: { ok: boolean; rows: number; newestAt: string | null; error?: string };
  };
}

const MAX_CHAIN_ROWS = 1500;
const TTL_MS = 15_000;
const cache = new Map<number, { at: number; data: TapePayload }>();

function bullflowKind(name: string): TapeRow['kind'] {
  const n = name.toLowerCase();
  if (n.includes('grenade')) return 'grenade';
  if (n.includes('sweep')) return 'sweep';
  if (n.includes('repeater') || n.includes('position build')) return 'repeater';
  if (n.includes('block')) return 'block';
  if (n.includes('unusual')) return 'unusual';
  return 'custom';
}

function chainKind(flowType: string | null | undefined): TapeRow['kind'] {
  if (flowType === 'sweep') return 'sweep';
  if (flowType === 'block') return 'block';
  if (flowType === 'unusual_volume') return 'unusual';
  return 'other';
}
const CHAIN_LABEL: Record<string, string> = {
  sweep: 'Sweep-like', block: 'Block-like', unusual_volume: 'Unusual vol', dark_pool: 'Dark-pool-like', normal: 'Chain obs',
};

const newest = (rows: TapeRow[]) =>
  rows.reduce<string | null>((m, r) => (r.at && (!m || r.at > m) ? r.at : m), null);

export async function buildFlowTape(days: number): Promise<TapePayload> {
  const windowDays = [1, 2, 5, 7].includes(days) ? days : 1;
  const hit = cache.get(windowDays);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const fromDate = windowDays === 1 ? marketDateET() : marketDateDaysAgo(windowDays - 1);

  // ── Bullflow ring (in-process, no provider call) ──
  let bfRows: TapeRow[] = [];
  let bfEnabled = false;
  let bfState = 'off';
  try {
    const bf = await import('./bullflow-service');
    bfEnabled = bf.bullflowEnabled();
    const { state, prints } = bf.getBullflowPrints();
    bfState = state;
    bfRows = prints
      .filter((p) => marketDateET(new Date(p.at)) >= fromDate)
      .map((p): TapeRow => ({
        id: `bf-${p.id}`,
        source: 'bullflow',
        at: p.at,
        symbol: p.underlying,
        optionType: p.optionType,
        strike: p.strike,
        expiry: p.expiry,
        premium: p.premium,
        price: Number.isFinite(p.fillPrice) && p.fillPrice > 0 ? p.fillPrice : null,
        size: p.contracts,
        spot: null,
        openInterest: null,
        volOI: null,
        label: p.alertName,
        kind: bullflowKind(p.alertName),
        alertType: p.alertType ?? null,
      }));
  } catch (e: any) {
    logger.warn(`[FLOW-TAPE] bullflow ring unavailable: ${e?.message}`);
  }

  // ── chain-scan observations ──
  let chainRows: TapeRow[] = [];
  let chainOk = true;
  let chainError: string | undefined;
  let truncated = false;
  try {
    const rows = await db.select()
      .from(optionsFlowHistory)
      .where(and(gte(optionsFlowHistory.detectedDate, fromDate)))
      .orderBy(desc(optionsFlowHistory.detectedAt))
      .limit(MAX_CHAIN_ROWS + 1);
    truncated = rows.length > MAX_CHAIN_ROWS;
    chainRows = rows.slice(0, MAX_CHAIN_ROWS).map((f: any): TapeRow => {
      const oi = f.openInterest != null && Number.isFinite(Number(f.openInterest)) ? Number(f.openInterest) : null;
      const vol = Number.isFinite(Number(f.volume)) ? Number(f.volume) : null;
      const volOI = f.volumeOIRatio != null && Number.isFinite(Number(f.volumeOIRatio))
        ? Number(f.volumeOIRatio)
        : oi && vol != null && oi > 0 ? vol / oi : null;
      return {
        id: `cs-${f.id}`,
        source: 'chain-scan',
        at: f.detectedAt ? new Date(f.detectedAt).toISOString() : null,
        symbol: f.symbol,
        optionType: f.optionType === 'put' ? 'put' : 'call',
        strike: Number(f.strikePrice),
        expiry: String(f.expirationDate ?? '').slice(0, 10),
        premium: Number(f.totalPremium ?? 0) || 0,
        price: Number.isFinite(Number(f.premium)) && Number(f.premium) > 0 ? Number(f.premium) : null,
        size: vol,
        spot: f.underlyingPrice != null && Number(f.underlyingPrice) > 0 ? Number(f.underlyingPrice) : null,
        openInterest: oi,
        volOI,
        label: CHAIN_LABEL[f.flowType] ?? 'Chain obs',
        kind: chainKind(f.flowType),
        alertType: null,
      };
    });
  } catch (e: any) {
    chainOk = false;
    chainError = 'options_flow_history read failed';
    logger.warn(`[FLOW-TAPE] chain-scan read failed: ${e?.message}`);
  }

  const rows = [...bfRows, ...chainRows].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  const data: TapePayload = {
    generatedAt: new Date().toISOString(),
    windowDays,
    rows,
    truncated,
    sources: {
      bullflow: { enabled: bfEnabled, streamState: bfState, rows: bfRows.length, newestAt: newest(bfRows) },
      chainScan: { ok: chainOk, rows: chainRows.length, newestAt: newest(chainRows), ...(chainError ? { error: chainError } : {}) },
    },
  };
  // Don't pin a failed DB read for the TTL — let the next request retry.
  if (chainOk) cache.set(windowDays, { at: Date.now(), data });
  return data;
}
