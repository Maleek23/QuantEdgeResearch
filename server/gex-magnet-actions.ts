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

async function emitIdea(s: MagnetSetup, r: GexRankRow): Promise<boolean> {
  if (!s.expiry) return false;
  const long = s.side === 'call';
  const entry = r.spot;
  const target = s.strike;
  // Risk half the distance to the strike (R:R 2): the thesis is "price is pulled
  // INTO the strike"; losing half that distance means the pull is not there.
  const rawStop = long ? entry - (target - entry) / 2 : entry + (entry - target) / 2;
  // Hold label from the contract's DTE and the shared 1.25× ATR swing floor —
  // DTE sets the hold horizon; the prepared-plan ingestion gate applies the
  // shared cross-source, loss-cooldown, and ATR stop policies before storage.
  const { holdingPeriodForDte, calendarDaysToExpiry } = await import('@shared/option-expiry');
  const holdingPeriod = holdingPeriodForDte(calendarDaysToExpiry(s.expiry, Date.now()), { fallback: (s.dte ?? 99) <= 0 ? 'day' : 'swing' });
  const premium = s.premium?.mid ?? s.premium?.last ?? null;
  const idea: Record<string, any> = {
    symbol: s.symbol,
    assetType: 'option',
    direction: long ? 'long' : 'short',
    entryPrice: +entry.toFixed(2),
    targetPrice: +target.toFixed(2),
    stopLoss: +rawStop.toFixed(2),
    riskRewardRatio: Math.abs(target - entry) / Math.abs(entry - rawStop),
    ...(premium != null && premium > 0 ? { entryPremium: +premium.toFixed(2) } : {}),
    optionType: s.side,
    strikePrice: s.strike,
    expiryDate: s.expiry,
    catalyst: `GEX ${s.side} magnet — ${s.strike}${long ? 'C' : 'P'} exp ${s.expiry}, strike ${s.distPct >= 0 ? '+' : ''}${s.distPct.toFixed(1)}% ${long ? 'above' : 'below'} spot`,
    analysis: `${s.why.join(' | ')} | Detector score ${s.score}/100 (uncalibrated ordering). Levels in underlying price; entry ${entry.toFixed(2)}, target = strike, stop at half the distance.`,
    source: 'gex_magnet',
    dataSourceUsed: `GEX_magnet_${s.side}_${r.dataSource}`,
    sessionContext: 'regular',
    timestamp: new Date().toISOString(),
    outcomeStatus: 'open',
    confidenceScore: Math.min(70, s.score),
    holdingPeriod,
    qualitySignals: [
      `magnet_score:${s.score}`,
      'score_uncalibrated',
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
