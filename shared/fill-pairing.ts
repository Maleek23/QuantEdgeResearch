/**
 * Fill pairing — turn a broker's raw executions into journal round trips.
 *
 * Brokers report fills, the journal stores round trips (one row = one trade from
 * flat to flat). Per instrument we walk fills in time order keeping a signed
 * position: fills in the position's direction add (average entry), opposite
 * fills reduce (average exit), and a fill that crosses zero closes the trip and
 * opens a new one in the other direction with the remainder. Whatever is still
 * held at the end is an open trip.
 *
 * Pure and deterministic: the same fills always produce the same trips with the
 * same keys (the id of the fill that opened the trip), so a re-sync updates
 * rows instead of duplicating them.
 */

export type FillSide = 'buy' | 'sell' | 'sell_short' | 'buy_to_cover';

export interface BrokerFill {
  id: string;
  /** Broker symbol. OCC option symbols (AAPL240119C00190000) are decoded. */
  symbol: string;
  side: FillSide;
  qty: number;
  price: number;
  /** ISO timestamp. */
  time: string;
  /** us_equity | us_option | crypto — options may also be recognised from the OCC symbol. */
  assetClass?: string | null;
}

export interface RoundTrip {
  /** Stable key: id of the fill that opened the trip. */
  key: string;
  symbol: string;
  assetType: 'stock' | 'option' | 'crypto';
  optionType: 'call' | 'put' | null;
  strikePrice: number | null;
  expiryDate: string | null;
  direction: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  entryTime: string;
  exitTime: string | null;
  status: 'open' | 'closed';
  /** Gross P&L in dollars (contract multiplier applied); null while open. */
  realizedPnL: number | null;
  fillIds: string[];
}

const OCC_RE = /^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

export function decodeOccSymbol(sym: string): { root: string; expiry: string; optionType: 'call' | 'put'; strike: number } | null {
  const m = OCC_RE.exec(sym.replace(/\s+/g, '').toUpperCase());
  if (!m) return null;
  return {
    root: m[1],
    expiry: `20${m[2]}-${m[3]}-${m[4]}`,
    optionType: m[5] === 'C' ? 'call' : 'put',
    strike: Number(m[6]) / 1000,
  };
}

const EPS = 1e-9;
const round = (v: number, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

interface OpenTrip {
  key: string;
  sign: 1 | -1;
  qty: number;          // currently held (absolute)
  openedQty: number;    // total ever added
  entryCost: number;    // Σ qty*price of adds
  closedQty: number;
  exitProceeds: number; // Σ qty*price of reductions
  entryTime: string;
  exitTime: string | null;
  fillIds: string[];
}

export function pairFills(fills: BrokerFill[]): RoundTrip[] {
  const byInstrument = new Map<string, BrokerFill[]>();
  for (const f of fills) {
    if (!f || !f.symbol || !Number.isFinite(f.qty) || f.qty <= 0 || !Number.isFinite(f.price) || f.price < 0) continue;
    const k = f.symbol.toUpperCase();
    const list = byInstrument.get(k);
    if (list) list.push(f); else byInstrument.set(k, [f]);
  }

  const out: RoundTrip[] = [];
  for (const [sym, list] of byInstrument) {
    list.sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.id.localeCompare(b.id));
    const occ = decodeOccSymbol(sym);
    const isOption = !!occ || list[0].assetClass === 'us_option';
    const isCrypto = !isOption && (list[0].assetClass === 'crypto' || sym.includes('/'));
    const mult = isOption ? 100 : 1;
    let trip: OpenTrip | null = null;

    const finish = (t: OpenTrip, closed: boolean) => {
      const entryPrice = t.entryCost / t.openedQty;
      const exitPrice = t.closedQty > 0 ? t.exitProceeds / t.closedQty : null;
      const pnl = closed && exitPrice != null ? (exitPrice - entryPrice) * t.closedQty * mult * t.sign : null;
      out.push({
        key: t.key,
        symbol: occ ? occ.root : sym,
        assetType: isOption ? 'option' : isCrypto ? 'crypto' : 'stock',
        optionType: occ?.optionType ?? null,
        strikePrice: occ?.strike ?? null,
        expiryDate: occ?.expiry ?? null,
        direction: t.sign === 1 ? 'long' : 'short',
        quantity: round(closed ? t.closedQty : t.openedQty),
        entryPrice: round(entryPrice),
        exitPrice: closed && exitPrice != null ? round(exitPrice) : null,
        entryTime: t.entryTime,
        exitTime: closed ? t.exitTime : null,
        status: closed ? 'closed' : 'open',
        realizedPnL: pnl == null ? null : Math.round(pnl * 100) / 100,
        fillIds: t.fillIds,
      });
    };

    for (const f of list) {
      const s: 1 | -1 = f.side === 'buy' || f.side === 'buy_to_cover' ? 1 : -1;
      let remaining = f.qty;
      while (remaining > EPS) {
        if (!trip) {
          trip = { key: f.id, sign: s, qty: 0, openedQty: 0, entryCost: 0, closedQty: 0, exitProceeds: 0, entryTime: f.time, exitTime: null, fillIds: [] };
        }
        if (!trip.fillIds.includes(f.id)) trip.fillIds.push(f.id);
        if (s === trip.sign) {
          trip.qty += remaining;
          trip.openedQty += remaining;
          trip.entryCost += remaining * f.price;
          remaining = 0;
        } else {
          const used = Math.min(remaining, trip.qty);
          trip.qty -= used;
          trip.closedQty += used;
          trip.exitProceeds += used * f.price;
          trip.exitTime = f.time;
          remaining -= used;
          if (trip.qty <= EPS) {
            finish(trip, true);
            trip = null;
            // A crossing fill opens the next trip with the remainder; key it so it
            // stays distinct from the trip this same fill just closed.
            if (remaining > EPS) {
              trip = { key: `${f.id}:flip`, sign: s, qty: 0, openedQty: 0, entryCost: 0, closedQty: 0, exitProceeds: 0, entryTime: f.time, exitTime: null, fillIds: [f.id] };
            }
          }
        }
      }
    }
    if (trip && trip.qty > EPS) {
      // Partially reduced but not flat: the reduced part is realised history the
      // journal can't split into its own row, so the open row carries the full
      // opened size and the average entry; the partial exits stay visible in fillIds.
      finish(trip, false);
    }
  }
  return out.sort((a, b) => Date.parse(a.entryTime) - Date.parse(b.entryTime) || a.key.localeCompare(b.key));
}
