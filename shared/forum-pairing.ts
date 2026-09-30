/**
 * Forum legs → round-trip trades (pure; no I/O), and the broker-row dedupe for
 * the operator's own "Mine" book.
 *
 * pairForumLegs(legs)
 *   Legs come from the post text (shared/discord-journal-parser via
 *   forum-vision.textLeg) and from screenshots (forum-vision.visionLegs), for
 *   ONE thread's main author, across all of the thread's posts. In time order:
 *
 *   open   → a lot on the position keyed SYMBOL|type|strike|expiry + side
 *            (a second open on an open position is an add: another lot)
 *   close  → the position it replies to; else the same contract; else the same
 *            contract without expiry; else the most recent open position on the
 *            ticker; else (no ticker) the only open position. A TEXT close
 *            ("out", "sold", "stopped") closes everything; a SCREENSHOT close
 *            with a size smaller than what is open is a partial close.
 *   trim   → a partial close; counted in the P&L only when sized and priced.
 *
 *   Lots are consumed FIFO. A position still open at the end that had sized,
 *   priced partial closes is split: the closed part (its FIFO cost) becomes a
 *   closed trade, the remainder an open one (key "<key>:open").
 *
 *   P&L only when both sides are known: exit price stated (text or screenshot),
 *   or derived from a stated % (text) or a stated realized $ P&L with a known
 *   size (screenshot) — each derivation is flagged. Otherwise the call stays
 *   open; a close with nothing to price it goes to the review list. No exit is
 *   invented.
 *
 *   Duplicate legs: a screenshot leg that repeats another leg (same contract,
 *   same action, compatible size/price, within 15 minutes — e.g. "in NVDA
 *   190c @ 2.15" then the fill screenshot a minute later) is merged into it,
 *   never double-counted.
 *
 * matchBrokerRows(discordTrades, brokerRows)
 *   Mine already holds the operator's real broker-CSV trades. A Discord trade
 *   matches a broker row with the same underlying, asset type, side, option
 *   type/strike (expiry when both state it), an entry within ±1 New York
 *   trading day, and a compatible size; each broker row matches at most one
 *   trade (closest entry time wins). Matched trades annotate the broker row,
 *   unmatched ones are inserted flagged as source=discord.
 */
import { discordDayKey, type DiscordTrade } from './discord-journal-parser';
import { sameInstrument, type ForumLeg } from './forum-vision';

export type ExitVia = 'reply' | 'contract' | 'ticker' | 'only-open';
const VIA_FACTOR: Record<ExitVia, number> = { reply: 1, contract: 0.95, ticker: 0.85, 'only-open': 0.7 };
const DUP_WINDOW_MS = 15 * 60_000;

export interface ForumTrade extends Omit<DiscordTrade, 'assetType'> {
  assetType: 'stock' | 'option' | 'future' | 'crypto';
  /** Where the numbers came from. */
  evidence: 'text' | 'vision' | 'text+vision';
  /** Sum of the realized $ P&L the screenshots state for the closing legs, when every close stated one. */
  statedPnl: number | null;
  legIds: string[];
}

export type LeftoverReason = 'entry_without_price' | 'unmatched_exit' | 'unpriced_exit';

export interface Leftover { legId: string; messageId: string; reason: LeftoverReason; symbol: string | null; detail: string }

export interface ForumPairResult {
  trades: ForumTrade[];
  leftovers: Leftover[];
  /** Legs merged into an earlier leg as duplicates (screenshot repeating a post). */
  duplicates: { legId: string; into: string }[];
  stats: { legs: number; entries: number; exits: number; trims: number; closedTrades: number; openTrades: number; fromScreenshots: number };
}

/** A post that is not a trade leg but replies to one (chart update) — joins the trade's timeline. */
export interface LegUpdate { messageId: string; time: string; replyTo: string; text: string }

interface Lot { legId: string; qty: number | null; price: number; time: string; conf: number }
interface Sell { leg: ForumLeg; qty: number | null; via: ExitVia }
interface Pos {
  key: string;
  first: ForumLeg;
  side: 'long' | 'short';
  instrument: string;
  lots: Lot[];
  sells: Sell[];
  exit: Sell | null;
  lines: string[];
  msgIds: Set<string>;
  legIds: string[];
  evidence: Set<string>;
  flags: string[];
  setup: string | null;
  stop: number | null;
  target: number | null;
}

const instrumentKey = (l: Pick<ForumLeg, 'symbol' | 'optionType' | 'strike' | 'expiry'>) => `${l.symbol}|${l.optionType ?? ''}|${l.strike ?? ''}|${l.expiry ?? ''}`;
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const mult = (a: ForumLeg['assetType']) => (a === 'option' ? 100 : a === 'future' ? null : 1);
const compatible = (a: number | null, b: number | null, tol: number) => a == null || b == null || Math.abs(a - b) <= Math.max(tol, Math.abs(b) * tol);

/** Merge screenshot legs that repeat another leg (see header). Returns kept legs + what was merged. */
export function dedupeLegs(legs: ForumLeg[]): { legs: ForumLeg[]; duplicates: { legId: string; into: string }[] } {
  const kept: ForumLeg[] = [];
  const duplicates: { legId: string; into: string }[] = [];
  for (const l of legs) {
    const dup = l.source === 'text' ? null : kept.find((k) => k.messageId !== l.messageId
      && k.action === l.action && sameInstrument(k, l)
      && Math.abs(Date.parse(k.time) - Date.parse(l.time)) <= DUP_WINDOW_MS
      && compatible(k.price, l.price, 0.02) && compatible(k.qty, l.qty, 0)
      && (k.direction == null || l.direction == null || k.direction === l.direction));
    if (!dup) { kept.push({ ...l, flags: [...l.flags] }); continue; }
    // Fill in what the earlier leg lacked; never overwrite a stated value.
    if (dup.qty == null) dup.qty = l.qty;
    if (dup.price == null) dup.price = l.price;
    if (dup.strike == null) dup.strike = l.strike;
    if (dup.expiry == null) dup.expiry = l.expiry;
    if (dup.optionType == null) dup.optionType = l.optionType;
    if (dup.realizedPnl == null) dup.realizedPnl = l.realizedPnl;
    if (dup.direction == null) dup.direction = l.direction;
    dup.source = dup.source === 'vision' && l.source === 'vision' ? 'vision' : 'text+vision';
    dup.confidence = Math.min(0.99, Math.max(dup.confidence, l.confidence));
    dup.label = `${dup.label} [same fill: ${l.label}]`;
    duplicates.push({ legId: l.id, into: dup.id });
  }
  return { legs: kept, duplicates };
}

export function pairForumLegs(input: ForumLeg[], updates: LegUpdate[] = []): ForumPairResult {
  const sorted = [...input].sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.id.localeCompare(b.id));
  const { legs, duplicates } = dedupeLegs(sorted);
  const upd = [...updates].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  let ui = 0;

  const open: Pos[] = [];
  const done: Pos[] = [];
  const byMsg = new Map<string, Pos>();
  const leftovers: Leftover[] = [];
  const stats = { legs: legs.length, entries: 0, exits: 0, trims: 0, closedTrades: 0, openTrades: 0, fromScreenshots: 0 };

  const line = (pos: Pos, l: ForumLeg, label: string) => {
    pos.lines.push(`[${stamp(l.time)} ET] ${label}: ${l.label}`);
    pos.msgIds.add(l.messageId);
    pos.legIds.push(l.id);
    pos.evidence.add(l.source);
    byMsg.set(l.messageId, pos);
    for (const f of l.flags) if (!pos.flags.includes(f)) pos.flags.push(f);
    if (!pos.setup && l.setup) pos.setup = l.setup;
    if (pos.stop == null && l.stop != null) pos.stop = l.stop;
    if (pos.target == null && l.target != null) pos.target = l.target;
  };
  const flushUpdates = (until: number) => {
    while (ui < upd.length && Date.parse(upd[ui].time) <= until) {
      const u = upd[ui++];
      const parent = byMsg.get(u.replyTo);
      if (parent && open.includes(parent)) {
        parent.lines.push(`[${stamp(u.time)} ET] update: ${u.text}`);
        parent.msgIds.add(u.messageId);
        byMsg.set(u.messageId, parent);
      }
    }
  };
  const openQty = (p: Pos) => {
    if (p.lots.some((x) => x.qty == null)) return null;
    const sold = p.sells.reduce((s, x) => s + (x.qty ?? 0), 0);
    return p.lots.reduce((s, x) => s + (x.qty ?? 0), 0) - sold;
  };

  const findOpen = (l: ForumLeg): [Pos, ExitVia] | null => {
    const pool = open.filter((o) => l.direction == null || o.side === l.direction);
    if (l.replyTo) {
      const hit = byMsg.get(l.replyTo);
      if (hit && pool.includes(hit) && (!l.symbol || hit.first.symbol === l.symbol)) return [hit, 'reply'];
    }
    if (l.symbol && l.assetType === 'option') {
      const exact = [...pool].reverse().find((o) => o.instrument === instrumentKey(l));
      if (exact) return [exact, 'contract'];
      const loose = [...pool].reverse().find((o) => o.first.symbol === l.symbol && o.first.assetType === 'option'
        && (l.strike == null || o.first.strike === l.strike) && (l.optionType == null || o.first.optionType === l.optionType));
      if (loose) return [loose, 'contract'];
    }
    if (l.symbol) {
      const t = [...pool].reverse().find((o) => o.first.symbol === l.symbol);
      return t ? [t, 'ticker'] : null;
    }
    return pool.length === 1 ? [pool[0], 'only-open'] : null;
  };

  for (const l of legs) {
    flushUpdates(Date.parse(l.time));
    if (l.source !== 'text') stats.fromScreenshots++;
    if (l.action === 'open') {
      if (!l.symbol) continue;
      const side = l.direction ?? 'long';
      const existing = [...open].reverse().find((o) => o.instrument === instrumentKey(l) && o.side === side);
      if (l.origin === 'position' && existing) {
        // A holdings screenshot restates the open position — it is not a new buy.
        const lone = existing.lots.length === 1 ? existing.lots[0] : null;
        if (lone && lone.qty == null && l.qty != null && !existing.sells.length) {
          lone.qty = l.qty;
          existing.flags.push(`Size ${l.qty} read from a position screenshot.`);
        }
        existing.lines.push(`[${stamp(l.time)} ET] position: ${l.label}`);
        existing.msgIds.add(l.messageId);
        existing.evidence.add(l.source);
        continue;
      }
      if (l.price == null) { leftovers.push({ legId: l.id, messageId: l.messageId, reason: 'entry_without_price', symbol: l.symbol, detail: l.label }); continue; }
      stats.entries++;
      if (existing) {
        existing.lots.push({ legId: l.id, qty: l.qty, price: l.price, time: l.time, conf: l.confidence });
        line(existing, l, 'add');
        continue;
      }
      const pos: Pos = {
        key: l.id, first: l, side, instrument: instrumentKey(l),
        lots: [{ legId: l.id, qty: l.qty, price: l.price, time: l.time, conf: l.confidence }],
        sells: [], exit: null, lines: [], msgIds: new Set(), legIds: [], evidence: new Set(), flags: [], setup: null, stop: null, target: null,
      };
      if (l.origin === 'position') pos.flags.push('Entry from a position screenshot (average cost), not a fill.');
      line(pos, l, 'entry');
      open.push(pos);
      continue;
    }

    const found = findOpen(l);
    if (!found) {
      leftovers.push({ legId: l.id, messageId: l.messageId, reason: 'unmatched_exit', symbol: l.symbol, detail: l.label });
      continue;
    }
    const [pos, via] = found;
    const left = openQty(pos);
    // A text close closes everything; a sized screenshot close smaller than what is open is partial.
    const partial = l.action === 'trim' || (l.source === 'vision' && l.qty != null && left != null && l.qty < left - 1e-9);
    if (partial) {
      stats.trims++;
      pos.sells.push({ leg: l, qty: l.qty, via });
      line(pos, l, 'trim');
      continue;
    }
    stats.exits++;
    pos.exit = { leg: l, qty: null, via };
    line(pos, l, 'exit');
    open.splice(open.indexOf(pos), 1);
    done.push(pos);
  }
  flushUpdates(Number.POSITIVE_INFINITY);

  const trades: ForumTrade[] = [];
  for (const pos of [...done, ...open]) {
    const out = finalize(pos);
    if ('leftover' in out) { leftovers.push(out.leftover); continue; }
    for (const t of out.trades) {
      if (t.status === 'closed') stats.closedTrades++; else stats.openTrades++;
      trades.push(t);
    }
  }
  trades.sort((a, b) => Date.parse(a.entryTime) - Date.parse(b.entryTime) || a.key.localeCompare(b.key));
  return { trades, leftovers, duplicates, stats };
}

/** Price of a close: stated; else from the stated % on entry; else from the stated realized $ and a known size. */
function sellPrice(s: Sell, entry: number, side: 'long' | 'short', qty: number | null, assetType: ForumLeg['assetType']): { px: number; how: string | null } | null {
  const l = s.leg;
  if (l.price != null) return { px: l.price, how: null };
  const sign = side === 'short' ? -1 : 1;
  if (l.pct != null) return { px: Math.max(0, entry * (1 + sign * (l.pct / 100))), how: `Exit price derived from the stated ${l.pct > 0 ? '+' : ''}${l.pct}% (no price posted).` };
  const m = mult(assetType);
  const q = s.qty ?? qty;
  if (l.realizedPnl != null && q != null && q > 0 && m != null) {
    return { px: Math.max(0, entry + sign * (l.realizedPnl / (q * m))), how: `Exit price derived from the screenshot's stated realized P&L $${l.realizedPnl} on ${q}.` };
  }
  return null;
}

function finalize(pos: Pos): { trades: ForumTrade[] } | { leftover: Leftover } {
  const f = pos.first;
  const flags = [...pos.flags];
  const sized = pos.lots.every((x) => x.qty != null);
  const unit = f.assetType === 'option' ? 'contract' : f.assetType === 'future' ? 'contract' : 'share';
  const qty = sized ? pos.lots.reduce((s, x) => s + x.qty!, 0) : pos.lots.length;
  const entryAvg = sized
    ? pos.lots.reduce((s, x) => s + x.price * x.qty!, 0) / qty
    : pos.lots.reduce((s, x) => s + x.price, 0) / pos.lots.length;
  if (!sized) {
    flags.push(pos.lots.length > 1
      ? `Size not stated — ${pos.lots.length} entries journaled as 1 ${unit} each, averaged equally.`
      : `Size not stated — journaled as 1 ${unit}.`);
  }
  const evidence = pos.evidence.has('text+vision') || (pos.evidence.has('text') && pos.evidence.has('vision')) ? 'text+vision'
    : pos.evidence.has('vision') ? 'vision' : 'text';
  const entryConf = pos.lots[0].conf;

  const base = (): Omit<ForumTrade, 'key' | 'quantity' | 'entryPrice' | 'exitPrice' | 'exitTime' | 'status' | 'exitDerivedFromPct' | 'confidence' | 'notes' | 'flags' | 'statedPnl' | 'exitVia' | 'entryTime'> => ({
    authorId: '', symbol: f.symbol!, assetType: f.assetType, optionType: f.optionType, strikePrice: f.strike, expiryDate: f.expiry,
    direction: pos.side, qtyStated: sized, setupType: pos.setup, screenshot: null, messageIds: [...pos.msgIds],
    stop: pos.stop, target: pos.target, evidence, legIds: [...pos.legIds],
  });
  const notesOf = (fl: string[]) => [...pos.lines, ...(fl.length ? ['', ...fl.map((x) => `· ${x}`)] : [])].join('\n');
  const tail = (fl: string[]) => {
    if (f.assetType === 'option' && !f.expiry) fl.push('Expiry not stated.');
    if (f.assetType === 'future') fl.push('Futures: P&L is in points × contracts (no contract multiplier applied).');
    return fl;
  };

  // ── Closed ──
  if (pos.exit) {
    // The exit's own size: what it states, else (sized position) what was still open.
    const soldBefore = pos.sells.reduce((s, x) => s + (x.qty ?? 0), 0);
    const exitQty = pos.exit.leg.qty ?? (sized ? Math.max(0, qty - soldBefore) : null);
    const ex = sellPrice({ ...pos.exit, qty: exitQty }, entryAvg, pos.side, null, f.assetType);
    if (!ex) {
      return { leftover: { legId: pos.exit.leg.id, messageId: pos.exit.leg.messageId, reason: 'unpriced_exit', symbol: f.symbol, detail: `${pos.lines.join('\n')}\n— exit had no price, % or stated P&L, so it is kept as a note, not a scored trade.` } };
    }
    let exitPrice = ex.px;
    let derived: number | null = null;
    if (ex.how) { flags.push(ex.how); if (pos.exit.leg.pct != null && pos.exit.leg.price == null) derived = pos.exit.leg.pct; }
    const pricedSells = sized ? pos.sells.filter((s) => s.qty != null).map((s) => ({ s, p: sellPrice(s, entryAvg, pos.side, null, f.assetType) })).filter((x) => x.p) : [];
    if (pricedSells.length) {
      let soldQty = 0, proceeds = 0;
      for (const { s, p } of pricedSells) { soldQty += s.qty!; proceeds += p!.px * s.qty!; if (p!.how) flags.push(p!.how); }
      const rest = Math.max(0, qty - soldQty);
      exitPrice = (proceeds + rest * exitPrice) / Math.max(qty, soldQty);
      flags.push(`${pricedSells.length} sized trim${pricedSells.length === 1 ? '' : 's'} averaged into the exit price.`);
      if (soldQty > qty) flags.push(`Sold ${soldQty} but only ${qty} were opened — check the posts.`);
    }
    const unsized = pos.sells.length - pricedSells.length;
    if (unsized > 0) flags.push(`${unsized} trim${unsized === 1 ? '' : 's'} without a size or price listed above — not included in the P&L.`);
    const pnls = [...pos.sells.map((s) => s.leg.realizedPnl), pos.exit.leg.realizedPnl];
    const statedPnl = pnls.every((x) => x != null) ? Math.round(pnls.reduce((s, x) => s! + x!, 0)! * 100) / 100 : null;
    const m = mult(f.assetType);
    if (statedPnl != null && m != null && pos.exit.leg.price != null) {
      const implied = (pos.side === 'long' ? exitPrice - entryAvg : entryAvg - exitPrice) * qty * m;
      if (Math.abs(implied - statedPnl) > Math.max(5, Math.abs(statedPnl) * 0.05)) flags.push(`Screenshot states $${statedPnl} realized; the prices imply $${Math.round(implied * 100) / 100} (fees, other lots?) — prices kept.`);
    }
    let conf = Math.min(entryConf, pos.exit.leg.confidence) * VIA_FACTOR[pos.exit.via];
    if (ex.how) conf -= 0.05;
    return {
      trades: [{
        ...base(), key: pos.key, quantity: qty, entryPrice: r4(entryAvg), entryTime: pos.lots[0].time,
        exitPrice: r4(exitPrice), exitTime: pos.exit.leg.time, exitDerivedFromPct: derived, status: 'closed',
        exitVia: pos.exit.via, confidence: Math.max(0.05, Math.round(conf * 100) / 100), statedPnl,
        flags: tail(flags), notes: notesOf(tail([...flags])),
      }],
    };
  }

  // ── Still open ──
  const pricedSells = sized ? pos.sells.filter((s) => s.qty != null).map((s) => ({ s, p: sellPrice(s, entryAvg, pos.side, null, f.assetType) })).filter((x) => x.p) : [];
  const unsized = pos.sells.length - pricedSells.length;
  if (unsized > 0) flags.push(`${unsized} trim${unsized === 1 ? '' : 's'} without a size or price listed above — not included in the P&L.`);
  if (!pricedSells.length) {
    return {
      trades: [{
        ...base(), key: pos.key, quantity: qty, entryPrice: r4(entryAvg), entryTime: pos.lots[0].time,
        exitPrice: null, exitTime: null, exitDerivedFromPct: null, status: 'open', exitVia: null,
        confidence: Math.max(0.05, Math.round(entryConf * 100) / 100), statedPnl: null,
        flags: tail(flags), notes: notesOf(tail([...flags])),
      }],
    };
  }
  // FIFO split: the sized, priced partial closes consume the oldest lots first.
  const lots = pos.lots.map((x) => ({ ...x, left: x.qty! }));
  let closedQty = 0, cost = 0, proceeds = 0;
  for (const { s, p } of pricedSells) {
    let need = s.qty!;
    proceeds += p!.px * s.qty!;
    if (p!.how) flags.push(p!.how);
    for (const lot of lots) {
      if (need <= 0) break;
      const take = Math.min(lot.left, need);
      lot.left -= take; need -= take; closedQty += take; cost += take * lot.price;
    }
    if (need > 0) flags.push(`A partial close of ${s.qty} is larger than what was open — the extra ${need} is ignored.`);
  }
  const soldQty = pricedSells.reduce((s, x) => s + x.s.qty!, 0);
  const exitPx = proceeds / soldQty;
  const remaining = lots.reduce((s, x) => s + x.left, 0);
  const remCost = lots.reduce((s, x) => s + x.left * x.price, 0);
  const lastSell = pricedSells[pricedSells.length - 1].s;
  const pnls = pricedSells.map((x) => x.s.leg.realizedPnl);
  const closedFlags = [...flags, `Partial close: ${closedQty} of ${qty} closed (FIFO); the other ${remaining} stay open as their own trade.`];
  const out: ForumTrade[] = [{
    ...base(), key: pos.key, quantity: closedQty, entryPrice: r4(cost / closedQty), entryTime: pos.lots[0].time,
    exitPrice: r4(exitPx), exitTime: lastSell.leg.time, exitDerivedFromPct: null, status: 'closed', exitVia: lastSell.via,
    confidence: Math.max(0.05, Math.round(Math.min(entryConf, lastSell.leg.confidence) * VIA_FACTOR[lastSell.via] * 100) / 100),
    statedPnl: pnls.every((x) => x != null) ? Math.round(pnls.reduce((s, x) => s! + x!, 0)! * 100) / 100 : null,
    flags: tail(closedFlags), notes: notesOf(tail([...closedFlags])),
  }];
  if (remaining > 1e-9) {
    const firstOpen = lots.find((x) => x.left > 0)!;
    const openFlags = [...flags, `Remainder of a partially closed position (${remaining} of ${qty}, FIFO cost).`];
    out.push({
      ...base(), key: `${pos.key}:open`, quantity: r4(remaining), entryPrice: r4(remCost / remaining), entryTime: firstOpen.time,
      exitPrice: null, exitTime: null, exitDerivedFromPct: null, status: 'open', exitVia: null,
      confidence: Math.max(0.05, Math.round(entryConf * 100) / 100), statedPnl: null,
      flags: tail(openFlags), notes: notesOf(tail([...openFlags])),
    });
  }
  return { trades: out };
}

// ─── Mine: dedupe against the operator's broker rows ─────────

export interface BrokerRowLike {
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  optionType: string | null;
  strikePrice: number | null;
  expiryDate: string | null;
  quantity: number;
  entryTime: string;
  broker: string;
}

export interface BrokerMatch { tradeKey: string; brokerRowId: string; dayGap: number }

const dayNum = (iso: string) => Date.parse(`${discordDayKey(iso)}T12:00:00Z`) / 86_400_000;
/** Trading days between two New York days (weekends skipped), unsigned. */
function tradingDayGap(a: string, b: string): number {
  let lo = Math.min(dayNum(a), dayNum(b));
  const hi = Math.max(dayNum(a), dayNum(b));
  let n = 0;
  while (lo < hi) {
    lo += 1;
    const wd = new Date(lo * 86_400_000).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}
const underlying = (s: string) => s.toUpperCase().replace(/^\$/, '').split(/[\s_]/)[0].replace(/\d{6}[CP]\d+$/, '');

/** Discord trades ↔ Mine's broker rows (see header). Pure; the caller writes. */
export function matchBrokerRows(trades: Pick<ForumTrade, 'key' | 'symbol' | 'assetType' | 'direction' | 'optionType' | 'strikePrice' | 'expiryDate' | 'quantity' | 'qtyStated' | 'entryTime'>[], rows: BrokerRowLike[]): BrokerMatch[] {
  const candidates: (BrokerMatch & { dt: number })[] = [];
  for (const t of trades) {
    for (const r of rows) {
      if (r.broker === 'discord') continue;
      if (underlying(r.symbol) !== t.symbol.toUpperCase()) continue;
      const rAsset = r.assetType === 'option' ? 'option' : r.assetType;
      if (rAsset !== (t.assetType === 'crypto' ? 'crypto' : t.assetType)) continue;
      if (r.direction !== t.direction) continue;
      if (t.assetType === 'option') {
        if (t.optionType && r.optionType && t.optionType !== r.optionType) continue;
        if (t.strikePrice != null && r.strikePrice != null && Math.abs(t.strikePrice - r.strikePrice) > 0.01) continue;
        if (t.expiryDate && r.expiryDate && t.expiryDate.slice(0, 10) !== r.expiryDate.slice(0, 10)) continue;
      }
      const gap = tradingDayGap(t.entryTime, r.entryTime);
      if (gap > 1) continue;
      // Size: unstated is compatible; stated must not exceed the broker's (a post can show part of a fill).
      if (t.qtyStated && t.quantity > r.quantity + 1e-9) continue;
      candidates.push({ tradeKey: t.key, brokerRowId: r.id, dayGap: gap, dt: Math.abs(Date.parse(t.entryTime) - Date.parse(r.entryTime)) });
    }
  }
  candidates.sort((a, b) => a.dt - b.dt);
  const usedT = new Set<string>(), usedR = new Set<string>();
  const out: BrokerMatch[] = [];
  for (const c of candidates) {
    if (usedT.has(c.tradeKey) || usedR.has(c.brokerRowId)) continue;
    usedT.add(c.tradeKey); usedR.add(c.brokerRowId);
    out.push({ tradeKey: c.tradeKey, brokerRowId: c.brokerRowId, dayGap: c.dayGap });
  }
  return out;
}
