#!/usr/bin/env node
/**
 * Time-split Bot mark sensitivity using exact-contract Yahoo option trade bars.
 * These are prints, never bid/ask fills. A row is marked only if a positive,
 * volume-backed print occurs within 60 seconds AFTER the stored event time.
 *
 * Usage:
 *   node research/bot-option-print-sensitivity.mjs "Run 3" > run3-print-sensitivity.csv
 */
const run = process.argv[2];
if (!['Run 1', 'Run 2', 'Run 3'].includes(run)) throw new Error('Pass exactly Run 1, Run 2, or Run 3');
const base = process.env.BOT_JOURNAL_BASE_URL ?? 'http://127.0.0.1:3000';
const journalResponse = await fetch(`${base}/api/journal/trades?journal=bot`);
if (!journalResponse.ok) throw new Error(`Bot journal HTTP ${journalResponse.status}`);
const journal = await journalResponse.json();
const trades = journal.trades.filter((t) => t.runLabel?.startsWith(run) && t.status === 'closed' && t.assetType === 'option');

const nyDay = (iso) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const v = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${v.year}-${v.month}-${v.day}`;
};
const occ = (t) => {
  const d = String(t.expiryDate).slice(2, 10).replaceAll('-', '');
  const side = String(t.optionType).toLowerCase().startsWith('p') ? 'P' : 'C';
  const strike = String(Math.round(Number(t.strikePrice) * 1000)).padStart(8, '0');
  return `${String(t.symbol).toUpperCase()}${d}${side}${strike}`;
};
const cache = new Map();
async function barsFor(contract, day) {
  const key = `${contract}|${day}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    const r = await fetch(`${base}/api/options/history/${encodeURIComponent(contract)}?date=${day}`);
    if (!r.ok) return { status: r.status, bars: [] };
    const data = await r.json();
    const bars = (data.bars ?? []).filter((b) =>
      [b.open, b.high, b.low, b.close, b.volume].every(Number.isFinite) &&
      b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0 && b.volume > 0,
    );
    return { status: r.status, bars };
  })());
  return cache.get(key);
}
function markWithinMinute(bars, at) {
  const target = Date.parse(at);
  const b = bars.find((x) => Date.parse(x.timestamp) >= target);
  if (!b) return null;
  const age = Math.round((Date.parse(b.timestamp) - target) / 1000);
  return age <= 60 ? { bar: b, age } : null;
}
const rows = [];
let cursor = 0;
const workers = Array.from({ length: 4 }, async () => {
  while (cursor < trades.length) {
    const t = trades[cursor++];
    const contract = occ(t);
    const entryDay = nyDay(t.entryTime), exitDay = nyDay(t.exitTime);
    const [entrySeries, exitSeries] = await Promise.all([barsFor(contract, entryDay), barsFor(contract, exitDay)]);
    const entry = markWithinMinute(entrySeries.bars, t.entryTime);
    const exit = markWithinMinute(exitSeries.bars, t.exitTime);
    const printPnl = entry && exit
      ? Math.round((exit.bar.close - entry.bar.close) * 100 * Number(t.quantity) * 100) / 100
      : null;
    rows.push({
      run, id: t.id, symbol: t.symbol, contract, signalSource: t.setupType, quantity: t.quantity,
      entryTime: t.entryTime, recordedEntry: t.entryPrice,
      entryPrintTime: entry?.bar.timestamp ?? '', entryPrintPremium: entry?.bar.close ?? '', entryPrintOffsetSeconds: entry?.age ?? '',
      entryHistoryStatus: entrySeries.status,
      exitTime: t.exitTime, recordedExit: t.exitPrice,
      exitPrintTime: exit?.bar.timestamp ?? '', exitPrintPremium: exit?.bar.close ?? '', exitPrintOffsetSeconds: exit?.age ?? '',
      exitHistoryStatus: exitSeries.status,
      recordedPnl: t.realizedPnL, printMarkPnl: printPnl,
      printMarkDelta: printPnl == null ? '' : Math.round((printPnl - Number(t.realizedPnL)) * 100) / 100,
      basis: 'reported trade prints only; not executable bid/ask',
    });
  }
});
await Promise.all(workers);
rows.sort((a, b) => a.entryTime.localeCompare(b.entryTime));
const headers = Object.keys(rows[0] ?? { run: '' });
const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
console.log(headers.join(','));
for (const row of rows) console.log(headers.map((h) => cell(row[h])).join(','));
const pairs = rows.filter((r) => r.printMarkPnl != null);
const wins = pairs.filter((r) => r.printMarkPnl > 0).length;
const net = pairs.reduce((s, r) => s + Number(r.printMarkPnl), 0);
console.error(JSON.stringify({
  run, asOf: journal.journal?.asOf, closedOptionRows: rows.length,
  entryPrintsWithin60s: rows.filter((r) => r.entryPrintTime).length,
  exitPrintsWithin60s: rows.filter((r) => r.exitPrintTime).length,
  pairedRows: pairs.length, printMarkWins: wins, printMarkWinRate: pairs.length ? +(wins / pairs.length * 100).toFixed(1) : null,
  pairedPrintMarkPnl: +net.toFixed(2), caveat: 'trade-print sensitivity only; no bid/ask fill evidence',
}));
