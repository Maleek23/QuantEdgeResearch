#!/usr/bin/env node
/**
 * Per-run sensitivity replay from Alpaca historical one-minute option trade bars.
 * Minute bars are trade aggregates, not NBBO quotes or executable fills. The
 * selected bar contains the event timestamp; its close may include later trades
 * in that minute, so results are descriptive sensitivity only.
 *
 * Usage: node --import tsx --import dotenv/config research/bot-alpaca-bar-sensitivity.mjs "Run 3"
 */
const run = process.argv[2];
if (!['Run 1', 'Run 2', 'Run 3'].includes(run)) throw new Error('Pass exactly Run 1, Run 2, or Run 3');
const base = process.env.BOT_JOURNAL_BASE_URL ?? 'http://127.0.0.1:3000';
const response = await fetch(`${base}/api/journal/trades?journal=bot`);
if (!response.ok) throw new Error(`Bot journal HTTP ${response.status}`);
const journal = await response.json();
const trades = journal.trades.filter((t) => t.runLabel?.startsWith(run) && t.status === 'closed' && t.assetType === 'option');
const { getAlpacaOptionBars } = await import('../server/alpaca-options.ts');
const day = (iso) => new Date(iso).toISOString().slice(0, 10);
const occ = (t) => {
  const exp = String(t.expiryDate).slice(2, 10).replaceAll('-', '');
  const type = String(t.optionType).toLowerCase().startsWith('p') ? 'P' : 'C';
  return `${String(t.symbol).toUpperCase()}${exp}${type}${String(Math.round(Number(t.strikePrice) * 1000)).padStart(8, '0')}`;
};
const cache = new Map();
async function barsFor(contract, at) {
  const d = day(at);
  const key = `${contract}|${d}`;
  if (!cache.has(key)) {
    const target = Date.parse(at);
    cache.set(key, getAlpacaOptionBars(contract, target - 3 * 60_000, target + 3 * 60_000, '1Min'));
  }
  try { return { status: 'ok', bars: await cache.get(key) }; }
  catch (err) { return { status: `error:${err?.message ?? 'unknown'}`, bars: [] }; }
}
const markMinute = (bars, at) => {
  const target = Date.parse(at);
  const b = bars.find((x) => x.t <= target && target < x.t + 60_000);
  return b ? { bar: b, secondsIntoMinute: Math.floor((target - b.t) / 1000) } : null;
};
const rows = [];
let cursor = 0;
const workers = Array.from({ length: 4 }, async () => {
  while (cursor < trades.length) {
    const t = trades[cursor++];
    const contract = occ(t);
    const [entrySeries, exitSeries] = await Promise.all([barsFor(contract, t.entryTime), barsFor(contract, t.exitTime)]);
    const entry = markMinute(entrySeries.bars, t.entryTime), exit = markMinute(exitSeries.bars, t.exitTime);
    const qty = Number(t.quantity);
    const pnl = entry && exit ? Math.round((exit.bar.c - entry.bar.c) * 100 * qty * 100) / 100 : null;
    rows.push({
      run, id: t.id, symbol: t.symbol, contract, signalSource: t.setupType, quantity: qty,
      entryTime: t.entryTime, recordedEntry: t.entryPrice, entryBarTime: entry ? new Date(entry.bar.t).toISOString() : '',
      entryBarClose: entry?.bar.c ?? '', entryVolume: entry?.bar.v ?? '', entrySecondsIntoMinute: entry?.secondsIntoMinute ?? '', entryStatus: entrySeries.status,
      exitTime: t.exitTime, recordedExit: t.exitPrice, exitBarTime: exit ? new Date(exit.bar.t).toISOString() : '',
      exitBarClose: exit?.bar.c ?? '', exitVolume: exit?.bar.v ?? '', exitSecondsIntoMinute: exit?.secondsIntoMinute ?? '', exitStatus: exitSeries.status,
      recordedPnl: t.realizedPnL, minuteBarMarkPnl: pnl,
      minuteBarMarkDelta: pnl == null ? '' : Math.round((pnl - Number(t.realizedPnL)) * 100) / 100,
      feed: 'Alpaca default (endpoint does not accept a feed parameter)',
      basis: 'Alpaca one-minute option trade bar close; aggregated print, may include post-event trades; not executable bid/ask',
    });
  }
});
await Promise.all(workers);
rows.sort((a, b) => a.entryTime.localeCompare(b.entryTime));
const headers = Object.keys(rows[0] ?? { run: '' });
const cell = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
console.log(headers.join(','));
for (const row of rows) console.log(headers.map((h) => cell(row[h])).join(','));
const paired = rows.filter((r) => r.minuteBarMarkPnl != null);
const wins = paired.filter((r) => r.minuteBarMarkPnl > 0).length;
console.error(JSON.stringify({ run, asOf: journal.journal?.asOf, closedOptionRows: rows.length,
  entryMinuteBars: rows.filter((r) => r.entryBarTime).length, exitMinuteBars: rows.filter((r) => r.exitBarTime).length,
  pairedRows: paired.length, wins, winRatePct: paired.length ? +(100 * wins / paired.length).toFixed(1) : null,
  pnl: +paired.reduce((s, r) => s + Number(r.minuteBarMarkPnl), 0).toFixed(2),
  caveat: 'minute-bar trade-print sensitivity only; feed cannot be selected on this endpoint; not bid/ask executable evidence' }));
