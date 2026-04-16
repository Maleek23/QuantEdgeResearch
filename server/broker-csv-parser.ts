/**
 * BROKER CSV PARSER
 * =================
 * Parses trade history CSV exports from major brokers into a unified
 * JournalTrade format. Auto-detects broker from column headers.
 *
 * Supported brokers:
 *   - Webull (Account Activity / Order History)
 *   - Robinhood (Account Statements)
 *   - Schwab / TD Ameritrade (Trade History)
 *   - Interactive Brokers (Flex Query Trades)
 *   - Tastytrade (Transaction History)
 *   - Generic CSV (Symbol, Side, Qty, Price, Date)
 */

import { logger } from './logger';
import type { JournalBroker } from '../shared/schema';

// ─── Unified parsed trade ───────────────────────────────────

export interface ParsedTrade {
  symbol: string;
  assetType: 'stock' | 'option' | 'future' | 'crypto';
  direction: 'long' | 'short';
  optionType?: 'call' | 'put';
  strikePrice?: number;
  expiryDate?: string;
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  fees: number;
  entryTime: string;            // ISO
  exitTime?: string;
  realizedPnL?: number;
  status: 'open' | 'closed';
  broker: JournalBroker;
  brokerOrderId?: string;
  rawCsvRow: Record<string, string>;
}

export interface ParseResult {
  broker: JournalBroker;
  trades: ParsedTrade[];
  errors: string[];
  totalRows: number;
  parsedRows: number;
}

// ─── CSV Parsing Core ───────────────────────────────────────

function parseCSVLines(raw: string): string[][] {
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  });
}

function rowToObj(headers: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h.trim().toLowerCase()] = (row[i] || '').trim(); });
  return obj;
}

function parseNum(v: string): number {
  if (!v) return 0;
  return parseFloat(v.replace(/[$,()]/g, '').replace(/^\((.+)\)$/, '-$1')) || 0;
}

function parseDate(v: string): string {
  if (!v) return new Date().toISOString();
  // Try common formats
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toISOString();
  // MM/DD/YYYY
  const parts = v.split('/');
  if (parts.length === 3) {
    const [m, dd, y] = parts;
    const d2 = new Date(`${y}-${m.padStart(2, '0')}-${dd.padStart(2, '0')}T12:00:00Z`);
    if (!isNaN(d2.getTime())) return d2.toISOString();
  }
  return new Date().toISOString();
}

function isOptionSymbol(sym: string): boolean {
  // OCC format: AAPL230120C00150000 or similar patterns
  return /\d{6}[CP]\d{8}/.test(sym) || /\s+(call|put)\s*/i.test(sym);
}

function parseOptionSymbol(sym: string): { underlying: string; optionType: 'call' | 'put'; strike: number; expiry: string } | null {
  // OCC: AAPL230120C00150000
  const occ = sym.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (occ) {
    const [, underlying, yy, mm, dd, cp, strikeRaw] = occ;
    return {
      underlying,
      optionType: cp === 'C' ? 'call' : 'put',
      strike: parseInt(strikeRaw) / 1000,
      expiry: `20${yy}-${mm}-${dd}`,
    };
  }
  return null;
}

// ─── Broker Detection ───────────────────────────────────────

function detectBroker(headers: string[]): JournalBroker {
  const h = headers.map(s => s.toLowerCase().trim()).join('|');

  // Webull — various header formats (spaces, underscores, etc.)
  if (h.includes('webull') || (h.includes('order_id') && h.includes('filled_price'))
    || (h.includes('order id') && h.includes('filled price'))
    || (h.includes('filled_qty') || h.includes('filled qty'))
    || (h.includes('avg_price') && h.includes('symbol') && h.includes('side'))) return 'webull';

  // Moomoo / Futu
  if (h.includes('moomoo') || h.includes('futu')
    || (h.includes('order id') && h.includes('contract') && h.includes('status'))
    || (h.includes('symbol') && h.includes('side') && h.includes('filled') && h.includes('avg'))
    || (h.includes('stock') && h.includes('side') && h.includes('avg. price'))) return 'webull'; // moomoo uses similar format

  if (h.includes('robinhood') || (h.includes('trans code') && h.includes('settle date'))) return 'robinhood';
  if (h.includes('schwab') || (h.includes('action') && h.includes('description') && h.includes('symbol'))) return 'schwab';
  if (h.includes('ib_') || h.includes('tradeid') || (h.includes('conid') && h.includes('symbol'))) return 'ibkr';
  if (h.includes('tastytrade') || (h.includes('underlying symbol') && h.includes('net value'))) return 'tastytrade';
  if (h.includes('tda') || (h.includes('ref #') && h.includes('description') && h.includes('amount'))) return 'tda';

  return 'csv'; // generic
}

// ─── Broker-Specific Parsers ────────────────────────────────

function parseWebull(row: Record<string, string>): ParsedTrade | null {
  // Webull/Moomoo have various header spellings — try all known variations
  const sym = row['symbol'] || row['ticker'] || row['stock'] || row['contract'] || '';
  const side = (row['side'] || row['direction'] || row['action'] || row['buy/sell'] || '').toLowerCase();
  const qty = parseNum(row['qty'] || row['quantity'] || row['filled_qty'] || row['filled qty']
    || row['filled'] || row['total qty'] || row['total_qty'] || '0');
  const price = parseNum(row['avg_price'] || row['avg. price'] || row['avg price']
    || row['filled_price'] || row['filled price'] || row['price'] || '0');
  const fee = parseNum(row['fee'] || row['fees'] || row['commission'] || '0');
  const date = row['filled_time'] || row['filled time'] || row['create_time'] || row['create time']
    || row['date'] || row['time'] || row['order time'] || '';
  const pnl = parseNum(row['realized_pnl'] || row['realized pnl'] || row['p&l'] || row['p/l'] || '');
  const status = (row['status'] || '').toLowerCase();

  if (!sym || price === 0) return null;
  // Skip cancelled/pending orders
  if (status.includes('cancel') || status.includes('pending') || status.includes('rejected')) return null;

  // Try parsing OCC symbol from any field that looks like one
  const optInfo = parseOptionSymbol(sym);
  const isBuy = side.includes('buy') || side === 'long' || side === 'b' || side === 'bto' || side === 'btc';
  const isSell = side.includes('sell') || side === 'short' || side === 's' || side === 'sto' || side === 'stc';

  // For options: BTO/BTC are buys, STO/STC are sells
  const direction = isSell ? 'short' : 'long';

  // Use filled qty if available, otherwise fall back
  const finalQty = qty || parseNum(row['total qty'] || row['order qty'] || '1');

  return {
    symbol: optInfo?.underlying || sym.replace(/\s+\d{2}\/\d{2}\/\d{4}.*/, '').replace(/\d{6}[CP]\d{8}/, '').trim().toUpperCase(),
    assetType: optInfo ? 'option' : (isOptionSymbol(sym) ? 'option' : 'stock'),
    direction,
    optionType: optInfo?.optionType,
    strikePrice: optInfo?.strike,
    expiryDate: optInfo?.expiry,
    quantity: Math.abs(finalQty),
    entryPrice: Math.abs(price),
    fees: Math.abs(fee),
    entryTime: parseDate(date),
    realizedPnL: pnl || undefined,
    status: pnl ? 'closed' : 'open',
    broker: 'webull',
    brokerOrderId: row['order_id'] || row['order id'] || undefined,
    rawCsvRow: row,
  };
}

function parseRobinhood(row: Record<string, string>): ParsedTrade | null {
  const desc = row['description'] || '';
  const sym = row['instrument'] || row['symbol'] || '';
  const code = (row['trans code'] || '').toLowerCase();
  const qty = parseNum(row['quantity'] || '0');
  const price = parseNum(row['price'] || '0');
  const amount = parseNum(row['amount'] || '0');
  const date = row['activity date'] || row['date'] || '';

  // Filter to buys/sells only
  if (!code.includes('buy') && !code.includes('sell') && !code.includes('sbo') && !code.includes('sto')) return null;
  if (!sym || price === 0) return null;

  const isBuy = code.includes('buy') || code.includes('sbo');
  const isOption = desc.toLowerCase().includes('call') || desc.toLowerCase().includes('put');

  return {
    symbol: sym.split(' ')[0].trim(),
    assetType: isOption ? 'option' : 'stock',
    direction: isBuy ? 'long' : 'short',
    optionType: desc.toLowerCase().includes('call') ? 'call' : desc.toLowerCase().includes('put') ? 'put' : undefined,
    quantity: Math.abs(qty) || 1,
    entryPrice: Math.abs(price),
    fees: 0,
    entryTime: parseDate(date),
    realizedPnL: undefined,
    status: 'closed',
    broker: 'robinhood',
    rawCsvRow: row,
  };
}

function parseSchwab(row: Record<string, string>): ParsedTrade | null {
  const action = (row['action'] || '').toLowerCase();
  const sym = row['symbol'] || '';
  const qty = parseNum(row['quantity'] || '0');
  const price = parseNum(row['price'] || '0');
  const fee = parseNum(row['fees & comm'] || row['commission'] || row['fees'] || '0');
  const date = row['date'] || '';
  const amount = parseNum(row['amount'] || '0');

  if (!action.includes('buy') && !action.includes('sell')) return null;
  if (!sym || price === 0) return null;

  const isBuy = action.includes('buy');
  const optInfo = parseOptionSymbol(sym);

  return {
    symbol: optInfo?.underlying || sym.split(' ')[0].trim(),
    assetType: optInfo ? 'option' : 'stock',
    direction: isBuy ? 'long' : 'short',
    optionType: optInfo?.optionType,
    strikePrice: optInfo?.strike,
    expiryDate: optInfo?.expiry,
    quantity: Math.abs(qty),
    entryPrice: Math.abs(price),
    fees: Math.abs(fee),
    entryTime: parseDate(date),
    realizedPnL: undefined,
    status: 'closed',
    broker: 'schwab',
    rawCsvRow: row,
  };
}

function parseIBKR(row: Record<string, string>): ParsedTrade | null {
  const sym = row['symbol'] || '';
  const qty = parseNum(row['quantity'] || '0');
  const price = parseNum(row['t. price'] || row['price'] || '0');
  const fee = parseNum(row['comm/fee'] || row['commission'] || '0');
  const date = row['date/time'] || row['datetime'] || row['tradedate'] || '';
  const pnl = parseNum(row['realized p/l'] || row['realized_pnl'] || '');
  const putCall = (row['put/call'] || row['right'] || '').toLowerCase();

  if (!sym || qty === 0) return null;

  return {
    symbol: row['underlying'] || sym,
    assetType: putCall ? 'option' : 'stock',
    direction: qty > 0 ? 'long' : 'short',
    optionType: putCall === 'p' || putCall === 'put' ? 'put' : putCall === 'c' || putCall === 'call' ? 'call' : undefined,
    strikePrice: parseNum(row['strike'] || '') || undefined,
    expiryDate: row['expiry'] || undefined,
    quantity: Math.abs(qty),
    entryPrice: Math.abs(price),
    fees: Math.abs(fee),
    entryTime: parseDate(date),
    realizedPnL: pnl || undefined,
    status: pnl ? 'closed' : 'open',
    broker: 'ibkr',
    brokerOrderId: row['tradeid'] || undefined,
    rawCsvRow: row,
  };
}

function parseTastytrade(row: Record<string, string>): ParsedTrade | null {
  const sym = row['underlying symbol'] || row['symbol'] || '';
  const action = (row['action'] || row['type'] || '').toLowerCase();
  const qty = parseNum(row['quantity'] || '0');
  const price = parseNum(row['price'] || row['average price'] || '0');
  const fee = parseNum(row['commissions'] || row['fees'] || '0');
  const date = row['date'] || row['executed at'] || '';
  const pnl = parseNum(row['net value'] || row['p/l'] || '');

  if (!sym || !action) return null;
  const isBuy = action.includes('buy') || action.includes('bto') || action.includes('btc');

  return {
    symbol: sym.trim(),
    assetType: row['instrument type']?.toLowerCase().includes('option') ? 'option' : 'stock',
    direction: isBuy ? 'long' : 'short',
    optionType: row['call or put']?.toLowerCase() === 'put' ? 'put' : row['call or put']?.toLowerCase() === 'call' ? 'call' : undefined,
    strikePrice: parseNum(row['strike price'] || '') || undefined,
    expiryDate: row['expiration date'] || undefined,
    quantity: Math.abs(qty) || 1,
    entryPrice: Math.abs(price),
    fees: Math.abs(fee),
    entryTime: parseDate(date),
    realizedPnL: pnl || undefined,
    status: 'closed',
    broker: 'tastytrade',
    rawCsvRow: row,
  };
}

function parseGeneric(row: Record<string, string>): ParsedTrade | null {
  // Try common column name variations — check EVERY possible key with flexible matching
  const keys = Object.keys(row);
  const find = (patterns: string[]) => {
    for (const p of patterns) {
      const match = keys.find(k => k.includes(p));
      if (match && row[match]) return row[match];
    }
    return '';
  };

  const sym = row['symbol'] || row['ticker'] || row['stock'] || row['instrument'] || row['contract'] || find(['symbol', 'ticker', 'stock', 'contract']);
  const side = (row['side'] || row['direction'] || row['action'] || find(['side', 'direction', 'action', 'buy/sell'])).toLowerCase();
  const qty = parseNum(row['quantity'] || row['qty'] || row['shares'] || row['contracts']
    || row['filled'] || row['filled qty'] || find(['qty', 'quantity', 'filled', 'shares', 'contracts']) || '1');
  const price = parseNum(row['price'] || row['fill_price'] || row['avg_price'] || row['avg. price']
    || row['avg price'] || row['filled price'] || row['entry']
    || find(['price', 'avg', 'fill', 'entry']) || '0');
  const fee = parseNum(row['fee'] || row['fees'] || row['commission'] || row['commissions']
    || find(['fee', 'commission']) || '0');
  const date = row['date'] || row['time'] || row['datetime'] || row['timestamp'] || row['trade_date']
    || row['filled time'] || row['create time'] || row['order time']
    || find(['date', 'time', 'filled', 'create']) || '';
  const pnl = parseNum(row['pnl'] || row['p&l'] || row['p/l'] || row['profit'] || row['realized_pnl']
    || row['realized pnl'] || row['net'] || find(['pnl', 'p&l', 'profit', 'realized', 'net']) || '');
  const exitP = parseNum(row['exit_price'] || row['exit'] || row['close_price'] || '');
  const status = (row['status'] || '').toLowerCase();

  if (!sym || price === 0) return null;
  // Skip cancelled/pending
  if (status.includes('cancel') || status.includes('pending') || status.includes('rejected')) return null;

  // CRITICAL: Try OCC option symbol parsing on the symbol field
  const optInfo = parseOptionSymbol(sym.trim());
  const hasOptionType = row['type']?.toLowerCase().includes('option')
    || row['asset']?.toLowerCase().includes('option')
    || row['asset type']?.toLowerCase().includes('option');

  const isBuy = side.includes('buy') || side.includes('long') || side === 'b' || side === 'bto' || side === 'btc';

  return {
    symbol: optInfo?.underlying || sym.toUpperCase().trim(),
    assetType: optInfo ? 'option' : (hasOptionType ? 'option' : (isOptionSymbol(sym) ? 'option' : 'stock')),
    direction: isBuy ? 'long' : 'short',
    optionType: optInfo?.optionType,
    strikePrice: optInfo?.strike,
    expiryDate: optInfo?.expiry,
    quantity: Math.abs(qty),
    entryPrice: Math.abs(price),
    exitPrice: exitP || undefined,
    fees: Math.abs(fee),
    entryTime: parseDate(date),
    realizedPnL: pnl || undefined,
    status: pnl || exitP ? 'closed' : 'open',
    broker: 'csv',
    rawCsvRow: row,
  };
}

// ─── Trade Matching (pair opens with closes) ─────────────────

function matchTrades(trades: ParsedTrade[]): ParsedTrade[] {
  // Group by symbol + direction, pair BUY with SELL
  const opens = new Map<string, ParsedTrade[]>();
  const matched: ParsedTrade[] = [];

  const sorted = [...trades].sort((a, b) =>
    new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

  for (const t of sorted) {
    const key = `${t.symbol}_${t.optionType || ''}_${t.strikePrice || ''}`;

    if (t.direction === 'long') {
      // Opening long
      const existing = opens.get(key) || [];
      existing.push(t);
      opens.set(key, existing);
    } else {
      // Closing — try to match with an open long
      const existing = opens.get(key);
      if (existing && existing.length > 0) {
        const open = existing.shift()!;
        if (existing.length === 0) opens.delete(key);

        // Merge into a complete trade — apply 100x multiplier for options
        const multiplier = open.assetType === 'option' ? 100 : 1;
        const pnl = (t.entryPrice - open.entryPrice) * open.quantity * multiplier - (open.fees + t.fees);
        const holdMs = new Date(t.entryTime).getTime() - new Date(open.entryTime).getTime();

        matched.push({
          ...open,
          exitPrice: t.entryPrice,
          exitTime: t.entryTime,
          realizedPnL: open.realizedPnL ?? +pnl.toFixed(2),
          fees: open.fees + t.fees,
          status: 'closed',
        });
      } else {
        // No match — short opening
        matched.push(t);
      }
    }
  }

  // Add unmatched opens
  opens.forEach((remaining) => {
    for (const t of remaining) {
      matched.push({ ...t, status: 'open' });
    }
  });

  return matched;
}

// ─── Main Export ─────────────────────────────────────────────

export function parseBrokerCSV(rawCsv: string, brokerHint?: JournalBroker): ParseResult {
  const lines = parseCSVLines(rawCsv);
  if (lines.length < 2) {
    return { broker: brokerHint || 'csv', trades: [], errors: ['CSV has no data rows'], totalRows: 0, parsedRows: 0 };
  }

  const headers = lines[0];
  const broker = brokerHint || detectBroker(headers);
  const errors: string[] = [];
  const raw: ParsedTrade[] = [];

  const parserMap: Record<JournalBroker, (row: Record<string, string>) => ParsedTrade | null> = {
    webull: parseWebull,
    robinhood: parseRobinhood,
    schwab: parseSchwab,
    tda: parseSchwab,          // TDA uses similar format to Schwab post-merger
    ibkr: parseIBKR,
    tastytrade: parseTastytrade,
    etrade: parseGeneric,
    fidelity: parseGeneric,
    manual: parseGeneric,
    csv: parseGeneric,
  };

  const parser = parserMap[broker] || parseGeneric;

  for (let i = 1; i < lines.length; i++) {
    const row = rowToObj(headers, lines[i]);
    try {
      const trade = parser(row);
      if (trade) raw.push(trade);
    } catch (err: any) {
      errors.push(`Row ${i + 1}: ${err.message}`);
    }
  }

  // Try to match buy/sell pairs into complete trades
  const matched = matchTrades(raw);

  logger.info(`[CSV-PARSER] Parsed ${matched.length} trades from ${lines.length - 1} rows (broker=${broker}, errors=${errors.length})`);

  return {
    broker,
    trades: matched,
    errors,
    totalRows: lines.length - 1,
    parsedRows: matched.length,
  };
}
