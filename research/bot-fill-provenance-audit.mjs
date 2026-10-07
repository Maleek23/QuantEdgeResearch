#!/usr/bin/env node
/**
 * Read-only audit of quote provenance exposed by the Bot journal.
 *
 * Usage:
 *   node research/bot-fill-provenance-audit.mjs [journal-url] > bot-fill-audit.csv
 *
 * The journal endpoint is read-only. A blank provenance cell means that the
 * old fill cannot be verified from the stored paper ledger; this script never
 * infers a bid, ask, provider, or timestamp from entry/exit prices.
 */
const url = process.argv[2] ?? 'http://127.0.0.1:3000/api/journal/trades?journal=bot';
const response = await fetch(url);
if (!response.ok) throw new Error(`Bot journal request failed: HTTP ${response.status}`);
const payload = await response.json();
if (!Array.isArray(payload.trades)) throw new Error('Journal response has no trades array');

const entryRe = /entry ask=([\d.]+) bid=([\d.]+) source=([^\s\]]+) feed=([^\s\]]+) delayed=(true|false) quoteTime=([^\s\]]+) observedAt=([^\s\]]+)/i;
const exitRe = /\[fill bid=([\d.]+) ask=([\d.]+) source=([^\s\]]+) feed=([^\s\]]+) delayed=(true|false) quoteTime=([^\s\]]+) quoteAgeSeconds=([^\s\]]+) observedAt=([^\s\]]+)\]/i;
const parseMs = (value) => {
  if (value == null || value === '' || value === 'unknown') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const csv = (value) => {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const fields = [
  'run','symbol','signalSource','status','optionType','strike','expiry','quantity',
  'entryTime','exitTime','entryPremium','exitPremium','realizedPnL','outcome','exitReason',
  'entryQuoteSource','entryQuoteFeed','entryBid','entryAsk','entryDelayed','entryQuoteTime','entryObservedAt','entryQuoteAgeSeconds','entryQuoteAudit',
  'exitQuoteSource','exitQuoteFeed','exitBid','exitAsk','exitDelayed','exitQuoteTime','exitQuoteAgeSeconds','exitObservedAt','exitQuoteAudit',
  'measurementStatus','measurementNote',
];
console.log(fields.join(','));
for (const trade of payload.trades) {
  const notes = String(trade.notes ?? '');
  const e = notes.match(entryRe);
  const x = notes.match(exitRe);
  const entryAtMs = e ? parseMs(e[7]) : parseMs(trade.entryTime);
  const entryQuoteAtMs = e ? parseMs(e[6]) : null;
  const entryAge = entryAtMs != null && entryQuoteAtMs != null ? Math.round((entryAtMs - entryQuoteAtMs) / 1000) : null;
  const exitAtMs = x ? parseMs(x[8]) : null;
  const exitQuoteAtMs = x ? parseMs(x[6]) : null;
  const exitAge = x && x[7] !== 'unknown' ? Number(x[7])
    : exitAtMs != null && exitQuoteAtMs != null ? Math.round((exitAtMs - exitQuoteAtMs) / 1000) : null;
  const audit = (quote, bid, ask, delayed, age) => {
    if (!quote) return 'missing';
    if (delayed === 'true') return 'delayed';
    if (!(Number(bid) > 0 && Number(ask) >= Number(bid))) return 'invalid_two_sided_market';
    if (age == null || !Number.isFinite(age)) return 'timestamp_unknown';
    if (age < -5) return 'timestamp_future';
    if (age > 60) return 'stale_over_60s';
    return 'timestamped_live_quote';
  };
  const exitReason = notes.match(/(?:^|\n)Exit: ([^\n]+)/)?.[1] ?? '';
  const row = [
    trade.runLabel, trade.symbol, trade.setupType, trade.status, trade.optionType, trade.strikePrice,
    trade.expiryDate, trade.quantity, trade.entryTime, trade.exitTime, trade.entryPrice, trade.exitPrice,
    trade.realizedPnL, trade.outcome, exitReason,
    e?.[3], e?.[4], e?.[2], e?.[1], e?.[5], e?.[6], e?.[7], entryAge,
    audit(e, e?.[2], e?.[1], e?.[5], entryAge),
    x?.[3], x?.[4], x?.[1], x?.[2], x?.[5], x?.[6], exitAge, x?.[8],
    audit(x, x?.[1], x?.[2], x?.[5], exitAge),
    /(?:^|\n)Measurement: ([^\n—]+) — ([^\n]+)/i.exec(notes)?.[1] ?? '',
    /(?:^|\n)Measurement: ([^\n—]+) — ([^\n]+)/i.exec(notes)?.[2] ?? '',
  ];
  console.log(row.map(csv).join(','));
}
