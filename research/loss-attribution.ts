/**
 * LOSS ATTRIBUTION — read-only. Where do the NEXUS ideas book (desk) and the
 * Quantinum Bot book lose money?
 *
 * Books are loaded exactly as the journal loads them (server/journal-sources.ts):
 *   desk  every NEXUS idea since OUTCOME_BASELINE_DATE (2026-08-26), unit-sized:
 *         1 contract per option idea at its recorded premiums, $1,000 notional
 *         per stock/crypto idea. Ideas that cannot be scored are excluded by the
 *         journal's own mapper (never counted as 0).
 *   bot   every paper_positions fill in every bot portfolio, at the bot's size.
 * Extra attributes (holding period, stop, DTE, conviction band, exit-time tag)
 * are joined from trade_ideas / paper_positions by id. Nothing is written.
 *
 * Also answers: duplicates (same symbol + side + engine + instrument open at
 * once or re-published same/next day) and exit-time stamping (identical
 * exit_date across different symbols).
 *
 * Run (server): npx tsx research/loss-attribution.ts > out.txt
 * The JSON block after the line "@@JSON@@" is saved as
 * research/loss-attribution-results.json.
 */
import { inArray } from 'drizzle-orm';
import { db, pool } from '../server/db';
import { tradeIdeas, paperPositions } from '@shared/schema';
import { loadJournal, resolveJournal } from '../server/journal-sources';

const TZ = 'America/New_York';
const etDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));
const etHour = (ms: number) => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date(ms))) % 24;
const etDow = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date(ms));
const r2 = (v: number) => Math.round(v * 100) / 100;
const MID = Date.parse('2026-09-13T00:00:00-04:00'); // splits 2026-08-26 → 2026-09-30 into halves

/** exit_date is written as ISO with offset, or occasionally a bare date (= that day's close). */
function parseExit(s: string | null | undefined): number | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T16:00:00-04:00`);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

type Agg = { n: number; wins: number; losses: number; flat: number; net: number; grossWin: number; grossLoss: number; pctSum: number };
const agg = (): Agg => ({ n: 0, wins: 0, losses: 0, flat: 0, net: 0, grossWin: 0, grossLoss: 0, pctSum: 0 });
function add(a: Agg, pnl: number, pct: number | null) {
  a.n++; a.net += pnl; a.pctSum += pct ?? 0;
  if (pnl > 0.005) { a.wins++; a.grossWin += pnl; } else if (pnl < -0.005) { a.losses++; a.grossLoss += pnl; } else a.flat++;
}
function fmt(a: Agg) {
  return {
    n: a.n, wins: a.wins, losses: a.losses, winRate: a.n ? r2((a.wins / a.n) * 100) : null,
    net: r2(a.net), perTrade: a.n ? r2(a.net / a.n) : null,
    avgWin: a.wins ? r2(a.grossWin / a.wins) : null, avgLoss: a.losses ? r2(a.grossLoss / a.losses) : null,
    avgPct: a.n ? r2(a.pctSum / a.n) : null,
  };
}
function groupBy<T>(rows: T[], key: (r: T) => string, pnl: (r: T) => number, pct: (r: T) => number | null) {
  const m = new Map<string, Agg>();
  for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, agg()); add(m.get(k)!, pnl(r), pct(r)); }
  return [...m].map(([k, a]) => ({ key: k, ...fmt(a) })).sort((x, y) => x.net - y.net);
}

function dteBucket(d: number | null) {
  if (d == null) return 'n/a';
  if (d <= 0) return '0DTE';
  if (d <= 2) return '1-2d';
  if (d <= 7) return '3-7d';
  if (d <= 21) return '8-21d';
  if (d <= 60) return '22-60d';
  return '60d+';
}
function stopBucket(p: number | null) {
  if (p == null || !Number.isFinite(p)) return 'n/a';
  if (p < 0.5) return '<0.5%';
  if (p < 1) return '0.5-1%';
  if (p < 2) return '1-2%';
  if (p < 4) return '2-4%';
  return '4%+';
}

/**
 * The desk book, loaded the way server/journal-sources.ts loadDesk does (same
 * filters, same pure mapper) but without the notes-regex column: the prod build
 * of 2026-09-30 17:10 CT (c1980ccb) ships `'\[exit-time…'` inside a `sql` template,
 * whose cooked string drops the backslashes, so Postgres rejects the regex and
 * loadDesk throws. Reading the rows directly keeps this review independent of that.
 */
async function loadDeskRows(): Promise<{ rows: any[]; excluded: { reason: string; count: number }[] }> {
  const { and, gte, ne, or, eq, isNull } = await import('drizzle-orm');
  const { OUTCOME_BASELINE_DATE } = await import('@shared/constants');
  const { mapDeskIdea } = await import('../server/journal-row-maps');
  const ideas = await db.select({
    id: tradeIdeas.id, symbol: tradeIdeas.symbol, assetType: tradeIdeas.assetType, direction: tradeIdeas.direction,
    entryPrice: tradeIdeas.entryPrice, targetPrice: tradeIdeas.targetPrice, stopLoss: tradeIdeas.stopLoss,
    riskRewardRatio: tradeIdeas.riskRewardRatio, optionType: tradeIdeas.optionType, strikePrice: tradeIdeas.strikePrice,
    expiryDate: tradeIdeas.expiryDate, entryPremium: tradeIdeas.entryPremium, exitPremium: tradeIdeas.exitPremium,
    optionPercentGain: tradeIdeas.optionPercentGain, exitPrice: tradeIdeas.exitPrice, percentGain: tradeIdeas.percentGain,
    outcomeStatus: tradeIdeas.outcomeStatus, resolutionReason: tradeIdeas.resolutionReason, exitDate: tradeIdeas.exitDate,
    timestamp: tradeIdeas.timestamp, source: tradeIdeas.source, catalyst: tradeIdeas.catalyst, genConvictionBand: tradeIdeas.genConvictionBand,
  }).from(tradeIdeas).where(and(
    gte(tradeIdeas.timestamp, OUTCOME_BASELINE_DATE), ne(tradeIdeas.status, 'draft'),
    or(eq(tradeIdeas.excludeFromTraining, false), isNull(tradeIdeas.excludeFromTraining)),
  ));
  const rows: any[] = []; const ex = new Map<string, number>();
  for (const i of ideas) { const r = mapDeskIdea(i as any); if ('row' in r) rows.push(r.row); else ex.set(r.excluded, (ex.get(r.excluded) ?? 0) + 1); }
  return { rows, excluded: [...ex].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count) };
}

async function main() {
  // ─── DESK ─────────────────────────────────────────────────
  const deskLoaded = await loadDeskRows();
  const desk = { rows: deskLoaded.rows, meta: { basis: 'NEXUS ideas since 2026-08-26, unit-sized (journal-row-maps mapDeskIdea)', sizing: '1 contract per option idea; $1,000 notional per stock/crypto idea', excluded: deskLoaded.excluded } };
  const ids = desk.rows.map((r) => r.id.replace(/^desk:/, ''));
  const extra = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 300) {
    const part = await db.select({
      id: tradeIdeas.id, direction: tradeIdeas.direction, holdingPeriod: tradeIdeas.holdingPeriod, tradeType: tradeIdeas.tradeType,
      entryPrice: tradeIdeas.entryPrice, stopLoss: tradeIdeas.stopLoss, targetPrice: tradeIdeas.targetPrice,
      optionDte: tradeIdeas.optionDte, expiryTier: tradeIdeas.expiryTier, genConvictionBand: tradeIdeas.genConvictionBand,
      probabilityBand: tradeIdeas.probabilityBand, outcomeStatus: tradeIdeas.outcomeStatus, resolutionReason: tradeIdeas.resolutionReason,
      outcomeNotes: tradeIdeas.outcomeNotes, exitDate: tradeIdeas.exitDate, exitBy: tradeIdeas.exitBy, isLottoPlay: tradeIdeas.isLottoPlay,
      optionDelta: tradeIdeas.optionDelta, entryPremium: tradeIdeas.entryPremium, exitPremium: tradeIdeas.exitPremium,
    }).from(tradeIdeas).where(inArray(tradeIdeas.id, ids.slice(i, i + 300)));
    for (const p of part) extra.set(p.id, p);
  }

  const rows = desk.rows.map((r) => {
    const x = extra.get(r.id.replace(/^desk:/, '')) ?? {};
    const entryMs = Date.parse(r.entryTime as any);
    const exitMs = parseExit(x.exitDate);
    const option = r.assetType === 'option';
    const dte = option && r.expiryDate
      ? Math.round((Date.parse(`${String(r.expiryDate).slice(0, 10)}T12:00:00Z`) - Date.parse(`${etDay(entryMs)}T12:00:00Z`)) / 86_400_000)
      : null;
    const stopPct = x.entryPrice > 0 && x.stopLoss > 0 ? (Math.abs(x.entryPrice - x.stopLoss) / x.entryPrice) * 100 : null;
    const tag = String(x.outcomeNotes ?? '').match(/\[exit-time:(bar_hit|deadline|live)\]/)?.[1] ?? 'untagged';
    return {
      id: r.id, symbol: r.symbol, asset: r.assetType, engine: String(r.setupType ?? 'unknown'),
      thesis: x.direction === 'short' ? 'short' : 'long',
      optionSide: option ? (String(r.optionType ?? '').toLowerCase().startsWith('p') ? 'put' : 'call') : 'n/a',
      strike: r.strikePrice ?? null, expiry: r.expiryDate ? String(r.expiryDate).slice(0, 10) : null,
      holding: x.holdingPeriod ?? 'n/a', tradeType: x.tradeType ?? 'n/a', lotto: !!x.isLottoPlay,
      dte, dteBucket: option ? dteBucket(dte) : 'n/a',
      band: x.genConvictionBand ?? 'none', probBand: x.probabilityBand ?? 'none',
      entryMs, entryIso: new Date(entryMs).toISOString(), entryHourET: etHour(entryMs), dowET: etDow(entryMs), entryDayET: etDay(entryMs),
      half: entryMs < MID ? 'H1 (08-26→09-12)' : 'H2 (09-13→09-30)',
      status: r.status, outcome: x.outcomeStatus ?? null, reason: x.resolutionReason ?? null,
      exitDate: x.exitDate ?? null, exitMs, exitTag: tag,
      entryUnderlying: x.entryPrice ?? null, stop: x.stopLoss ?? null, target: x.targetPrice ?? null,
      stopPct: stopPct == null ? null : r2(stopPct), stopBucket: stopBucket(stopPct),
      entryPremium: x.entryPremium ?? null, exitPremium: x.exitPremium ?? null, delta: x.optionDelta ?? null,
      pnl: r.realizedPnL, pct: r.realizedPnLPercent,
    };
  });
  const closed = rows.filter((r) => r.status === 'closed' && r.pnl != null);
  const P = (r: any) => Number(r.pnl), PC = (r: any) => (r.pct == null ? null : Number(r.pct));

  const dims: Record<string, (r: any) => string> = {
    engine: (r) => r.engine,
    asset: (r) => r.asset,
    optionSide: (r) => r.optionSide,
    holding: (r) => r.holding,
    tradeType: (r) => r.tradeType,
    dteBucket: (r) => r.dteBucket,
    entryHourET: (r) => String(r.entryHourET).padStart(2, '0'),
    dowET: (r) => r.dowET,
    thesis: (r) => r.thesis,
    convictionBand: (r) => r.band,
    probabilityBand: (r) => r.probBand,
    outcome: (r) => String(r.outcome),
    stopDistance: (r) => r.stopBucket,
    half: (r) => r.half,
    engine_asset_side_holding: (r) => `${r.engine} · ${r.asset}${r.asset === 'option' ? ' ' + r.optionSide : ''} · ${r.holding}`,
    engine_half: (r) => `${r.engine} · ${r.half}`,
  };
  const deskBy: Record<string, any> = {};
  for (const [k, f] of Object.entries(dims)) deskBy[k] = groupBy(closed, f, P, PC);
  const deskTotal = fmt(closed.reduce((a, r) => (add(a, P(r), PC(r)), a), agg()));
  const worst = [...closed].sort((a, b) => P(a) - P(b)).slice(0, 15).map((r) => ({
    symbol: r.symbol, engine: r.engine, asset: r.asset, k: r.asset === 'option' ? `${r.strike}${r.optionSide[0].toUpperCase()} ${r.expiry}` : '', entry: r.entryIso, outcome: r.outcome, pnl: r.pnl, pct: r.pct,
  }));

  // ─── DUPLICATES ───────────────────────────────────────────
  const instr = (r: any) => (r.asset === 'option' ? `${r.strike}${r.optionSide}${r.expiry}` : r.asset);
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const k = `${r.symbol}|${r.thesis}|${r.engine}|${instr(r)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  const NOW = Date.now();
  let dupRows: any[] = [], firstRows: any[] = [], dupGroups = 0;
  const dupExamples: any[] = [];
  for (const [k, rs] of groups) {
    if (rs.length < 2) { firstRows.push(...rs); continue; }
    rs.sort((a, b) => a.entryMs - b.entryMs);
    let any = false;
    rs.forEach((r, i) => {
      if (i === 0) { firstRows.push(r); return; }
      const overlap = rs.slice(0, i).some((p) => (p.exitMs ?? NOW) > r.entryMs);
      const dayGap = Math.round((Date.parse(`${r.entryDayET}T12:00:00Z`) - Date.parse(`${rs[i - 1].entryDayET}T12:00:00Z`)) / 86_400_000);
      if (overlap || dayGap <= 1) { dupRows.push({ ...r, overlap, dayGap }); any = true; } else firstRows.push(r);
    });
    if (any) { dupGroups++; if (dupExamples.length < 25) dupExamples.push({ key: k, n: rs.length, pnl: rs.map((r) => r.pnl), entries: rs.map((r) => r.entryIso.slice(5, 16)) }); }
  }
  const dupClosed = dupRows.filter((r) => r.status === 'closed' && r.pnl != null);
  const duplicates = {
    definition: 'same symbol + thesis side + engine + instrument (option strike/type/expiry, else asset class); a later idea counts as a duplicate when an earlier one in the group was still open at its publish time, or it was published the same or next ET day',
    groupsWithDuplicates: dupGroups,
    duplicateIdeas: dupRows.length,
    duplicateOverlapOpen: dupRows.filter((r) => r.overlap).length,
    duplicateSameOrNextDayOnly: dupRows.filter((r) => !r.overlap).length,
    duplicateClosed: fmt(dupClosed.reduce((a, r) => (add(a, P(r), PC(r)), a), agg())),
    duplicateOpenNow: dupRows.filter((r) => r.status !== 'closed').length,
    byEngine: groupBy(dupClosed, (r) => r.engine, P, PC),
    firstInstanceClosed: fmt(firstRows.filter((r) => r.status === 'closed' && r.pnl != null).reduce((a, r) => (add(a, P(r), PC(r)), a), agg())),
    examples: dupExamples,
  };
  // Looser: same symbol + thesis + engine, ANY strike/expiry (e.g. IWM 290P / 280P / 275P
  // published minutes apart are one bet expressed three times).
  const loose = new Map<string, any[]>();
  for (const r of rows) {
    const k = `${r.symbol}|${r.thesis}|${r.engine}`;
    (loose.get(k) ?? loose.set(k, []).get(k)!).push(r);
  }
  const looseDup: any[] = [];
  let looseGroups = 0;
  for (const [, rs] of loose) {
    if (rs.length < 2) continue;
    rs.sort((a, b) => a.entryMs - b.entryMs);
    let any = false;
    rs.forEach((r, i) => {
      if (i === 0) return;
      const overlap = rs.slice(0, i).some((p) => (p.exitMs ?? NOW) > r.entryMs);
      const dayGap = Math.round((Date.parse(`${r.entryDayET}T12:00:00Z`) - Date.parse(`${rs[i - 1].entryDayET}T12:00:00Z`)) / 86_400_000);
      if (overlap || dayGap <= 1) { looseDup.push(r); any = true; }
    });
    if (any) looseGroups++;
  }
  const looseClosed = looseDup.filter((r) => r.status === 'closed' && r.pnl != null);
  (duplicates as any).anyStrike = {
    definition: 'same symbol + thesis side + engine, any strike/expiry/asset, overlapping or same/next ET day',
    groups: looseGroups, duplicateIdeas: looseDup.length, openNow: looseDup.length - looseClosed.length,
    closed: fmt(looseClosed.reduce((a, r) => (add(a, P(r), PC(r)), a), agg())),
    byEngine: groupBy(looseClosed, (r) => r.engine, P, PC),
  };
  const collapsed = await pool.query(`select count(*)::int n from trade_ideas where timestamp >= '2026-08-26' and resolution_reason = 'duplicate_collapsed'`).catch(() => null);

  // ─── EXIT-TIME STAMPING ───────────────────────────────────
  const allClosedIdeas = (await pool.query(`select id, symbol, source, outcome_status, resolution_reason, exit_date, outcome_notes from trade_ideas
      where timestamp >= '2026-08-26' and status <> 'draft' and coalesce(outcome_status,'open') <> 'open' and exit_date is not null`)) as any;
  const cl: any[] = allClosedIdeas.rows ?? allClosedIdeas;
  const byStamp = new Map<string, any[]>();
  for (const r of cl) (byStamp.get(r.exit_date) ?? byStamp.set(r.exit_date, []).get(r.exit_date)!).push(r);
  const shared = [...byStamp].filter(([, rs]) => new Set(rs.map((r) => r.symbol)).size > 1);
  const tagOf = (r: any) => String(r.outcome_notes ?? '').match(/\[exit-time:(bar_hit|deadline|live)\]/)?.[1] ?? 'untagged';
  const exitStamps = {
    closedWithExitDate: cl.length,
    distinctStamps: byStamp.size,
    stampsSharedAcrossSymbols: shared.length,
    rowsOnSharedStamps: shared.reduce((s, [, rs]) => s + rs.length, 0),
    tagCounts: cl.reduce((m: any, r) => ((m[tagOf(r)] = (m[tagOf(r)] ?? 0) + 1), m), {}),
    bareDateStamps: cl.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.exit_date)).length,
    top: shared.sort((a, b) => b[1].length - a[1].length).slice(0, 20).map(([stamp, rs]) => ({
      stamp, etTime: /^\d{4}-\d{2}-\d{2}$/.test(stamp) ? 'date only' : new Date(stamp).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }),
      n: rs.length, symbols: new Set(rs.map((r) => r.symbol)).size,
      sources: [...new Set(rs.map((r) => r.source))].join(','), outcomes: rs.reduce((m: any, r) => ((m[r.outcome_status] = (m[r.outcome_status] ?? 0) + 1), m), {}),
      reasons: [...new Set(rs.map((r) => r.resolution_reason))].slice(0, 4).join(','), tags: [...new Set(rs.map(tagOf))].join(','),
      sample: rs.slice(0, 6).map((r) => r.symbol).join(' '),
    })),
    sept30_1140ET: cl.filter((r) => String(r.exit_date).startsWith('2026-09-30T10:4')).map((r) => ({ symbol: r.symbol, source: r.source, outcome: r.outcome_status, stamp: r.exit_date, tag: tagOf(r), note: String(r.outcome_notes ?? '').split('\n').filter((l: string) => l.includes('[exit-time')).join(' ').slice(0, 200) })),
  };

  // ─── BOT ──────────────────────────────────────────────────
  const bot = await loadJournal(await resolveJournal({ userId: null, isAdmin: true }, 'bot' as any));
  const pids = bot.rows.map((r) => r.id.replace(/^bot:/, ''));
  const pos = pids.length ? await db.select().from(paperPositions).where(inArray(paperPositions.id, pids)) : [];
  const posOf = new Map(pos.map((p) => [p.id, p]));
  const tids = [...new Set(pos.map((p) => p.tradeIdeaId).filter(Boolean) as string[])];
  const tix = tids.length ? await db.select({ id: tradeIdeas.id, holdingPeriod: tradeIdeas.holdingPeriod, direction: tradeIdeas.direction, band: tradeIdeas.genConvictionBand }).from(tradeIdeas).where(inArray(tradeIdeas.id, tids)) : [];
  const tixOf = new Map(tix.map((t) => [t.id, t]));
  const brows = bot.rows.map((r) => {
    const p: any = posOf.get(r.id.replace(/^bot:/, '')) ?? {};
    const t: any = p.tradeIdeaId ? tixOf.get(p.tradeIdeaId) ?? {} : {};
    const entryMs = Date.parse(r.entryTime as any);
    const option = r.assetType === 'option';
    const dte = option && r.expiryDate ? Math.round((Date.parse(`${String(r.expiryDate).slice(0, 10)}T12:00:00Z`) - Date.parse(`${etDay(entryMs)}T12:00:00Z`)) / 86_400_000) : null;
    const reason = String(p.exitReason ?? '').toLowerCase();
    const exitKind = !reason ? 'n/a' : /stop|trail/.test(reason) ? (/trail/.test(reason) ? 'trailing stop' : 'stop') : /target|profit|tp/.test(reason) ? 'target' : /expir|dte|time|eod|close/.test(reason) ? 'time/expiry' : 'other';
    return {
      id: r.id, symbol: r.symbol, asset: r.assetType, engine: String(r.setupType ?? 'unlinked'),
      optionSide: option ? (String(r.optionType ?? '').toLowerCase().startsWith('p') ? 'put' : 'call') : 'n/a',
      dteBucket: option ? dteBucket(dte) : 'n/a', holding: t.holdingPeriod ?? 'n/a', band: t.band ?? 'none',
      run: r.runLabel ?? 'n/a', entryHourET: etHour(entryMs), dowET: etDow(entryMs), half: entryMs < MID ? 'H1 (08-26→09-12)' : 'H2 (09-13→09-30)',
      status: r.status, exitReason: p.exitReason ?? null, exitKind, qty: r.quantity, entryPrice: r.entryPrice, exitPrice: r.exitPrice,
      stop: p.stopLoss ?? null, target: p.targetPrice ?? null, entryIso: new Date(entryMs).toISOString(), exitIso: r.exitTime ?? null,
      cost: r2(Number(r.entryPrice) * Number(r.quantity) * (option ? 100 : 1)),
      pnl: r.realizedPnL, pct: r.realizedPnLPercent,
    };
  });
  const bclosed = brows.filter((r) => r.status === 'closed' && r.pnl != null);
  const botDims: Record<string, (r: any) => string> = {
    engine: (r) => r.engine, asset: (r) => r.asset, optionSide: (r) => r.optionSide, dteBucket: (r) => r.dteBucket,
    holding: (r) => r.holding, run: (r) => r.run, exitKind: (r) => r.exitKind, entryHourET: (r) => String(r.entryHourET).padStart(2, '0'),
    dowET: (r) => r.dowET, convictionBand: (r) => r.band, half: (r) => r.half,
  };
  const botBy: Record<string, any> = {};
  for (const [k, f] of Object.entries(botDims)) botBy[k] = groupBy(bclosed, f, P, PC);

  const out = {
    generatedAt: new Date().toISOString(),
    window: { from: '2026-08-26', to: etDay(Date.now()), halvesSplitAt: '2026-09-13 ET' },
    desk: {
      basis: desk.meta.basis, sizing: desk.meta.sizing, excluded: desk.meta.excluded,
      rows: rows.length, open: rows.filter((r) => r.status !== 'closed').length, closed: closed.length,
      total: deskTotal, by: deskBy, worst,
    },
    duplicates: { ...duplicates, alreadyCollapsedInDb: (collapsed as any)?.rows?.[0]?.n ?? null },
    exitStamps,
    bot: {
      basis: bot.meta.basis, sizing: bot.meta.sizing, excluded: bot.meta.excluded,
      rows: brows.length, closed: bclosed.length, total: fmt(bclosed.reduce((a, r) => (add(a, P(r), PC(r)), a), agg())),
      by: botBy, trades: bclosed.sort((a, b) => P(a) - P(b)),
    },
    deskTrades: closed.map((r) => ({ id: r.id, symbol: r.symbol, engine: r.engine, asset: r.asset, side: r.optionSide, thesis: r.thesis, strike: r.strike, expiry: r.expiry, holding: r.holding, band: r.band, entry: r.entryIso, exitDate: r.exitDate, exitTag: r.exitTag, outcome: r.outcome, reason: r.reason, stopPct: r.stopPct, entryPremium: r.entryPremium, exitPremium: r.exitPremium, pnl: r.pnl, pct: r.pct })),
  };
  // write-then-exit: a bare process.exit() truncates piped stdout at 64–128 KB
  process.stdout.write('@@JSON@@\n' + JSON.stringify(out) + '\n', () => process.exit(0));
}
main().catch((e) => { console.error(e); process.exit(1); });
