/**
 * SPX MIRROR (server) — attaches `spxMirror` to open SPY 0DTE/1DTE/2DTE option
 * ideas on the board (/api/convictions) and the 0DTE desk.
 *
 * Read-only: it writes no trade_ideas rows and grades nothing — the outcome
 * stays on the SPY idea. Flag SPX_MIRROR (default on; set 0/false to disable).
 *
 * Never blocks a board build: the live ratio and the SPXW chain each get a
 * short budget. A chain that is still downloading keeps going in the
 * background (shared CBOE loader + 60 s chain cache), so the next board read
 * prices it; meanwhile the mirror ships levels/contract with the reason.
 */
import { logger } from './logger';
import {
  buildSpxMirror, isMirrorCandidate, omittedMirror, spxRatio,
  type MirrorChain, type MirrorInput, type MirrorRatio, type SpxMirror,
} from '@shared/spx-mirror';

export const spxMirrorEnabled = () => !/^(0|false|off|no)$/i.test(String(process.env.SPX_MIRROR ?? '').trim());

const RATIO_BUDGET_MS = 2500;
const CHAIN_BUDGET_MS = 2500;
const RATIO_TTL_MS = 30_000;
const MEMO_TTL_MS = 30_000;

const settleWithin = <T,>(p: Promise<T>, ms: number): Promise<{ v: T | null; timedOut: boolean }> =>
  new Promise((res) => {
    const t = setTimeout(() => res({ v: null, timedOut: true }), ms);
    p.then((v) => { clearTimeout(t); res({ v, timedOut: false }); }, () => { clearTimeout(t); res({ v: null, timedOut: false }); });
  });

// ── live SPX/SPY ratio (same quote path as the 0DTE desk and /api/spx/expression) ──
let ratioMemo: { at: number; r: MirrorRatio | null } | null = null;
async function readRatio(): Promise<MirrorRatio | null> {
  if (ratioMemo && Date.now() - ratioMemo.at < RATIO_TTL_MS) return ratioMemo.r;
  const { fetchYahooFinancePrice } = await import('./market-api');
  const [spyQ, spxQ] = await Promise.all([fetchYahooFinancePrice('SPY'), fetchYahooFinancePrice('%5EGSPC')]);
  const spy = Number(spyQ?.currentPrice); const spx = Number(spxQ?.currentPrice);
  const value = spxRatio(spy, spx);
  let r: MirrorRatio | null = null;
  if (value != null) {
    // The ratio is only as fresh as the older of its two quotes.
    const stamps = [spyQ?.fetchedAt, spxQ?.fetchedAt].map((s) => Date.parse(String(s ?? ''))).filter(Number.isFinite);
    const asOf = new Date(stamps.length ? Math.min(...stamps) : Date.now()).toISOString();
    r = { value, spx, spy, asOf, source: 'Yahoo ^GSPC ÷ SPY' };
  }
  ratioMemo = { at: Date.now(), r };
  return r;
}

// ── SPXW chain (CBOE delayed; shared with the 0DTE desk via fetchCboeChain's cache) ──
let chainInflight: Promise<MirrorChain | null> | null = null;
function readChain(): Promise<MirrorChain | null> {
  if (chainInflight) return chainInflight;
  chainInflight = (async () => {
    const { fetchCboeChain } = await import('./contract-analyzer/cboe-chain');
    const cb = await fetchCboeChain('SPX', 15_000);
    return cb?.rawChain.length ? { rows: cb.rawChain as unknown as MirrorChain['rows'], fetchedAt: cb.fetchedAt ?? Date.now() } : null;
  })().catch((e) => { logger.warn(`[SPX-MIRROR] chain failed: ${(e as Error).message}`); return null; })
    .finally(() => { chainInflight = null; });
  return chainInflight;
}

const memo = new Map<string, { at: number; m: SpxMirror }>();

/** Compute mirrors for the given SPY contracts. Bounded by the two budgets above. */
export async function computeSpxMirrors(inputs: MirrorInput[]): Promise<Map<string, SpxMirror>> {
  const out = new Map<string, SpxMirror>();
  if (!inputs.length) return out;
  const now = Date.now();
  for (const [k, v] of memo) if (now - v.at > MEMO_TTL_MS) memo.delete(k);
  const todo = inputs.filter((i) => { const hit = memo.get(i.key); if (hit) out.set(i.key, hit.m); return !hit; });
  if (!todo.length) return out;

  const [ratioRes, chainRes] = await Promise.all([settleWithin(readRatio(), RATIO_BUDGET_MS), settleWithin(readChain(), CHAIN_BUDGET_MS)]);
  const chainReason = chainRes.timedOut ? 'SPXW chain still loading (CBOE delayed) — premium on the next refresh' : chainRes.v ? null : 'SPXW chain unavailable (CBOE delayed)';
  for (const i of todo) {
    const m = ratioRes.timedOut ? omittedMirror('SPX/SPY quotes timed out — mirror omitted this cycle') : buildSpxMirror(i, ratioRes.v, chainRes.v, chainReason);
    out.set(i.key, m);
    if (m.status === 'ok') memo.set(i.key, { at: now, m }); // retry anything incomplete next cycle
  }
  return out;
}

interface PickLike {
  ideaId: string; symbol: string; optionType: 'call' | 'put' | null; strikePrice: number | null; expiryDate: string | null;
  entryPrice: number; stopLoss: number; targetPrice: number; lifecycleState?: string; horizon?: { dte: number | null } | null;
}

/** Board: attach `spxMirror` to each open SPY option idea with DTE ≤ 2. Never throws. */
export async function attachSpxMirrors<T extends PickLike>(picks: T[]): Promise<Array<T & { spxMirror?: SpxMirror }>> {
  if (!spxMirrorEnabled()) return picks;
  try {
    const cands = picks.filter((p) => p.lifecycleState !== 'closed' && isMirrorCandidate(p, p.horizon?.dte ?? null));
    if (!cands.length) return picks;
    const mirrors = await computeSpxMirrors(cands.map((p) => ({
      key: `${p.ideaId}|${p.strikePrice}|${p.expiryDate}`, optionType: p.optionType as 'call' | 'put', strike: p.strikePrice!, expiry: p.expiryDate!,
      dte: p.horizon?.dte ?? null, entry: p.entryPrice, stop: p.stopLoss, targets: [p.targetPrice],
    })));
    return picks.map((p) => {
      const m = mirrors.get(`${p.ideaId}|${p.strikePrice}|${p.expiryDate}`);
      return m ? { ...p, spxMirror: m } : p;
    });
  } catch (e) {
    logger.warn(`[SPX-MIRROR] attach skipped: ${(e as Error).message}`);
    return picks;
  }
}
