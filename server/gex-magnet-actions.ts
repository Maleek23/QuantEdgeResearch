/**
 * GEX MAGNET ACTIONS — what happens after the rankings job finds a setup.
 * =======================================================================
 *   1. ARCHIVE every qualifying setup (cash hours) to
 *      .cache/gex-magnet/setups-YYYY-MM-DD.jsonl — the sample
 *      research/gex-magnet-backtest.ts will measure once it exists.
 *   2. DISCORD (optional): score ≥ ALERT_MIN_SCORE, cash hours, fresh row,
 *      DISCORD_WEBHOOK_ORACLE_SIGNALS set. Deduped per ticker/side/strike/ET day
 *      (persisted, so a restart does not re-alert), ≤ 5 per cycle, and sent
 *      through postDiscordWebhook's own rate gate.
 *   3. IDEAS: the same bar, written through storage.createTradeIdea — the exact
 *      entry point gex_scanner ideas use, so the shared validation gate and the
 *      spine dedup apply unchanged. source='gex_magnet'. It persists through
 *      the prepared-plan ingestion gate and centralized storage validation.
 *
 * Nothing here claims an edge: the score is an ordering (server/gex-magnet.ts),
 * and every alert/idea says so.
 */
import fs from 'fs';
import path from 'path';
import { logger } from './logger';
import type { GexRankRow } from './gex-rankings';
import type { MagnetSetup } from './gex-magnet';

export const ALERT_MIN_SCORE = 60;
const MAX_ACTIONS_PER_CYCLE = 5;
const DIR = path.join(process.cwd(), '.cache', 'gex-magnet');

const etDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
const keyOf = (s: MagnetSetup) => `${s.symbol}|${s.side}|${s.strike}|${etDay()}`;

function loadSet(file: string): Set<string> {
  try { return new Set(JSON.parse(fs.readFileSync(file, 'utf8')) as string[]); } catch { return new Set(); }
}
function saveSet(file: string, set: Set<string>): void {
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file, JSON.stringify([...set])); } catch { /* best effort */ }
}

let stats = { day: etDay(), sent: 0, ideas: 0 };
export function magnetActionStats() {
  if (stats.day !== etDay()) stats = { day: etDay(), sent: 0, ideas: 0 };
  return { discordConfigured: !!process.env.DISCORD_WEBHOOK_ORACLE_SIGNALS, sentToday: stats.sent, ideasToday: stats.ideas };
}

function archive(rows: GexRankRow[]): void {
  const lines: string[] = [];
  const at = new Date().toISOString();
  for (const r of rows) for (const s of r.setups ?? []) {
    lines.push(JSON.stringify({
      at, symbol: r.symbol, spot: r.spot, changePct: r.changePct, regime: r.regime, zeroGamma: r.zeroGamma,
      netGEX: r.netGEX, netVEX: r.netVEX, dataSource: r.dataSource, openInterestDate: r.openInterestDate,
      fetchedAt: r.fetchedAt, setup: s,
    }));
  }
  if (!lines.length) return;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(path.join(DIR, `setups-${etDay()}.jsonl`), lines.join('\n') + '\n');
  } catch (e: any) {
    logger.warn(`[GEX-MAGNET] archive failed: ${e?.message}`);
  }
}

async function sendDiscord(s: MagnetSetup, r: GexRankRow): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_ORACLE_SIGNALS;
  if (!url) return false;
  const { postDiscordWebhook } = await import('./discord-service');
  const tag = `${s.symbol} ${s.strike}${s.side === 'call' ? 'C' : 'P'}${s.expiry ? ` ${s.expiry}` : ''}`;
  const prem = s.premium?.mid != null ? `$${s.premium.mid.toFixed(2)} mid` : s.premium?.last != null ? `$${s.premium.last.toFixed(2)} last` : 'n/a';
  const body = {
    embeds: [{
      title: `GEX ${s.side} magnet · ${tag} · score ${s.score}/100`,
      description: s.why.map((w) => `• ${w}`).join('\n'),
      color: s.side === 'call' ? 0x3b8cff : 0xff6b3d,
      fields: [
        { name: 'Spot', value: `$${r.spot.toFixed(2)} (${(r.changePct ?? 0) >= 0 ? '+' : ''}${(r.changePct ?? 0).toFixed(1)}%)`, inline: true },
        { name: 'Strike', value: `$${s.strike} (${s.distPct >= 0 ? '+' : ''}${s.distPct.toFixed(1)}%)`, inline: true },
        { name: 'Contract', value: prem, inline: true },
        { name: 'Gamma regime', value: `${r.regime}${r.nearFlip ? ' (near flip)' : ''}`, inline: true },
        { name: 'Data', value: `${r.dataSource}${r.openInterestDate ? ` · OI as of ${r.openInterestDate}` : ''} · fetched ${new Date(r.fetchedAt).toISOString().slice(11, 16)}Z`, inline: false },
      ],
      footer: { text: 'Detector score is an ordering, not a probability — no validated edge yet. Educational only.' },
      timestamp: new Date().toISOString(),
    }],
  };
  // ?wait=true makes Discord answer 200 with the message; postDiscordWebhook
  // answers 204 when its own rate/duplicate gate suppressed the send — so 204
  // here means NOT sent and the setup stays eligible next cycle.
  const target = url.includes('?') ? `${url}&wait=true` : `${url}?wait=true`;
  const res = await postDiscordWebhook(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.ok && res.status !== 204;
}

/**
 * Level-map clusters + this row's own GEX walls / zero gamma, then the pure rebuild.
 * `deps` are test seams; production reads the shared level map and the loss-rule cap.
 */
export async function rebuildFromStructure(
  s: Pick<MagnetSetup, 'symbol' | 'side' | 'strike' | 'expiry'>,
  r: Pick<GexRankRow, 'callWall' | 'putWall' | 'zeroGamma'>,
  entry: number,
  flooredStop: number,
  minRR: number,
  horizon: 'day' | 'swing' | 'position',
  deps: {
    levelMap?: (sym: string) => Promise<{ clusters: Array<{ price: number; low: number; high: number; score: number; label: string }>; tolerance: number } | null>;
    cap?: (p: { symbol: string; direction: 'long' | 'short'; entry: number; stop: number; targets: number[]; horizon: 'day' | 'swing' | 'position'; expiryDate?: string | null }) => Promise<number | null>;
  } = {},
) {
  const { rebuildMagnetPlan } = await import('@shared/magnet-plan');
  const side: 'long' | 'short' = s.side === 'call' ? 'long' : 'short';
  let clusters: Array<{ price: number; low?: number; high?: number; score: number; label: string }> = [];
  let tolerance = 0;
  try {
    const map = await (deps.levelMap ?? (async (sym: string) => (await import('./levels/level-map')).getLevelMap(sym)))(s.symbol);
    if (map) { clusters = map.clusters.map((c) => ({ price: c.price, low: c.low, high: c.high, score: c.score, label: c.label })); tolerance = map.tolerance; }
  } catch { /* no map — walls only */ }
  if (r.callWall) clusters.push({ price: r.callWall, score: 1, label: `call wall ${r.callWall}` });
  if (r.putWall) clusters.push({ price: r.putWall, score: 1, label: `put wall ${r.putWall}` });
  if (r.zeroGamma) clusters.push({ price: r.zeroGamma, score: 1, label: `zero gamma ${r.zeroGamma.toFixed(2)}` });
  let maxTarget: number | null = null;
  try {
    maxTarget = await (deps.cap ?? (async (p) => (await import('./levels/level-map')).expectedMoveCapFor(p)))({
      // Probe with a far target: expectedMoveCapFor returns the cap only when T1 is
      // beyond it, so a ±50% probe reads the cap itself (null = the rule is off).
      symbol: s.symbol, direction: side, entry, stop: flooredStop, targets: [entry * (side === 'long' ? 1.5 : 0.5)], horizon, expiryDate: s.expiry ?? null,
    });
  } catch { maxTarget = null; }
  return rebuildMagnetPlan({ side, entry, strike: s.strike, flooredStop, levels: clusters, maxTarget, minRR, tolerance });
}

async function emitIdea(s: MagnetSetup, r: GexRankRow): Promise<boolean> {
  if (!s.expiry) return false;
  const long = s.side === 'call';
  const entry = r.spot;
  let target = s.strike;
  // Risk half the distance to the strike (R:R 2): the thesis is "price is pulled
  // INTO the strike"; losing half that distance means the pull is not there.
  const rawStop = long ? entry - (target - entry) / 2 : entry + (entry - target) / 2;
  // Hold label from the contract's DTE and the shared 1.25× ATR swing floor —
  // this path bypassed the ingestion gate (SR 11-7 v6 F-7/F-8). Same helper as
  // gex_scanner; persistPreparedTradeIdea then applies the shared cross-source,
  // loss-cooldown and dedup gates (its ATR floor is a no-op on a floored stop).
  const { optionPublishPlan } = await import('./lib/option-publish-plan');
  const plan = await optionPublishPlan({
    symbol: s.symbol, direction: long ? 'long' : 'short', entry, stop: rawStop, target,
    expiryDate: s.expiry, fallbackHolding: (s.dte ?? 99) <= 0 ? 'day' : 'swing',
  });
  let stop = plan.stopLoss;
  let rr = plan.riskRewardRatio;
  let rebuildNote = '';
  // 2026-10-07: a magnet closer than the floored stop used to reach storage at
  // R:R < 0.5 and be refused ("AVGO long: R:R 0.31 < 0.5 (trap)"). Rebuild the
  // plan from structure (shared/magnet-plan.ts) and reject only when no valid
  // plan exists — logged with the reason.
  const { readMinRrPublish } = await import('@shared/publish-rr');
  const minRR = readMinRrPublish();
  if (!(rr + 1e-9 >= minRR)) {
    const rebuilt = await rebuildFromStructure(s, r, entry, stop, minRR, plan.holdingPeriod);
    if (!rebuilt.plan) {
      logger.info(`[GEX-MAGNET] ${s.symbol} ${s.strike}${long ? 'C' : 'P'} withheld — ${rebuilt.reason}`);
      return false;
    }
    stop = rebuilt.plan.stop; target = rebuilt.plan.target; rr = rebuilt.plan.rr;
    rebuildNote = `Plan rebuilt (magnet was ${rebuilt.plan.strikeRR.toFixed(2)}R on the ${plan.stopLoss.toFixed(2)} floored stop): stop ${stop.toFixed(2)} — ${rebuilt.plan.stopBasis}; T1 ${target.toFixed(2)} — ${rebuilt.plan.targetBasis} (${rr.toFixed(2)}R).`;
    logger.info(`[GEX-MAGNET] ${s.symbol} ${s.strike}${long ? 'C' : 'P'}: ${rebuildNote}`);
  }
  const premium = s.premium?.mid ?? s.premium?.last ?? null;
  const idea: Record<string, any> = {
    symbol: s.symbol,
    assetType: 'option',
    direction: long ? 'long' : 'short',
    entryPrice: +entry.toFixed(2),
    targetPrice: +target.toFixed(2),
    stopLoss: +stop.toFixed(2),
    riskRewardRatio: rr,
    ...(premium != null && premium > 0 ? { entryPremium: +premium.toFixed(2) } : {}),
    optionType: s.side,
    strikePrice: s.strike,
    expiryDate: s.expiry,
    catalyst: `GEX ${s.side} magnet — ${s.strike}${long ? 'C' : 'P'} exp ${s.expiry}, strike ${s.distPct >= 0 ? '+' : ''}${s.distPct.toFixed(1)}% ${long ? 'above' : 'below'} spot`,
    analysis: `${s.why.join(' | ')} | Detector score ${s.score}/100 (uncalibrated ordering). Levels in underlying price; entry ${entry.toFixed(2)}, ${rebuildNote ? rebuildNote : `target = strike, stop at half the distance.${plan.note ? ` ${plan.note}` : ''}`}`,
    source: 'gex_magnet',
    dataSourceUsed: `GEX_magnet_${s.side}_${r.dataSource}`,
    sessionContext: 'regular',
    timestamp: new Date().toISOString(),
    outcomeStatus: 'open',
    confidenceScore: Math.min(70, s.score),
    holdingPeriod: plan.holdingPeriod,
    qualitySignals: [
      `magnet_score:${s.score}`,
      'score_uncalibrated',
      rebuildNote ? 'plan:rebuilt_from_structure' : '',
      `share:${(s.share * 100).toFixed(1)}`,
      `vol_oi:${s.volOI.toFixed(2)}`,
      `side_rank:${s.sideRank}`,
      `gamma_regime:${r.regime}`,
      r.zeroGamma ? `zero_gamma:${r.zeroGamma.toFixed(2)}` : '',
      `data:${r.dataSource}`,
      r.openInterestDate ? `oi_date:${r.openInterestDate}` : '',
    ].filter(Boolean),
  };
  try {
    const { persistPreparedTradeIdea } = await import('./trade-idea-ingestion');
    return await persistPreparedTradeIdea(idea);
  } catch (e: any) {
    logger.warn(`[GEX-MAGNET] idea rejected ${s.symbol} ${s.strike}${long ? 'C' : 'P'}: ${e?.message}`);
    return false;
  }
}

export async function processMagnetSetups(rows: GexRankRow[], opts: { cashHours: boolean }): Promise<void> {
  if (!opts.cashHours) return; // off-hours chains are last session's — no archive rows, alerts or ideas from them
  archive(rows);
  magnetActionStats();
  const candidates = rows
    .flatMap((r) => (r.setups ?? []).map((s) => ({ s, r })))
    .filter(({ s }) => s.score >= ALERT_MIN_SCORE)
    .sort((a, b) => b.s.score - a.s.score)
    .slice(0, MAX_ACTIONS_PER_CYCLE);
  if (!candidates.length) return;

  const sentFile = path.join(DIR, `sent-${etDay()}.json`);
  const ideaFile = path.join(DIR, `ideas-${etDay()}.json`);
  const sent = loadSet(sentFile);
  const ideas = loadSet(ideaFile);
  for (const { s, r } of candidates) {
    const k = keyOf(s);
    if (!sent.has(k) && process.env.DISCORD_WEBHOOK_ORACLE_SIGNALS) {
      try {
        if (await sendDiscord(s, r)) { sent.add(k); stats.sent++; }
      } catch (e: any) { logger.warn(`[GEX-MAGNET] discord failed: ${e?.message}`); }
    }
    if (!ideas.has(k)) {
      if (await emitIdea(s, r)) { stats.ideas++; logger.info(`[GEX-MAGNET] idea ${k} score ${s.score}`); }
      ideas.add(k); // attempted once per day either way — a rejected idea is not retried every 10 min
    }
  }
  saveSet(sentFile, sent);
  saveSet(ideaFile, ideas);
}
