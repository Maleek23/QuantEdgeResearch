/**
 * Alpaca → journal (read-only import).
 *
 * Reads the account's FILL activities and pairs them into round trips
 * (shared/fill-pairing.ts), then upserts them into the user's journal keyed by
 * `alpaca:<opening fill id>` — re-syncing updates rows (an open trip that has
 * since closed gets its exit) and never duplicates them. Tags, notes, ratings
 * and screenshots added in the journal are left alone.
 *
 * READ-ONLY: only GET /v2/account and GET /v2/account/activities/FILL are called.
 * This module never places, changes or cancels an order.
 *
 * Credentials: per-user keys live in broker_connections, sealed with
 * server/secret-box.ts and never returned to the client. The operator can also
 * sync the env-configured account (ALPACA_API_KEY / ALPACA_SECRET_KEY /
 * ALPACA_PAPER) into their own journal — admin only.
 */
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { storage } from './storage';
import { logger } from './logger';
import { brokerConnections, type JournalTrade } from '@shared/schema';
import { pairFills, type BrokerFill, type RoundTrip } from '@shared/fill-pairing';
import { openSecret, sealSecret, secretBoxConfigured } from './secret-box';

export interface AlpacaCreds { keyId: string; secret: string; paper: boolean }

const BASE = (paper: boolean) => (paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets');
const MAX_PAGES = 100; // 10,000 fills per sync

async function alpacaGet(creds: AlpacaCreds, path: string): Promise<any> {
  const res = await fetch(`${BASE(creds.paper)}${path}`, {
    method: 'GET',
    headers: { 'APCA-API-KEY-ID': creds.keyId, 'APCA-API-SECRET-KEY': creds.secret, Accept: 'application/json' },
  });
  if (res.status === 401 || res.status === 403) throw new AlpacaAuthError('Alpaca rejected these keys (check key id, secret and paper/live)');
  if (!res.ok) throw new Error(`Alpaca ${path.split('?')[0]} answered ${res.status}`);
  return res.json();
}

export class AlpacaAuthError extends Error {}

export function envAlpacaCreds(): AlpacaCreds | null {
  const keyId = process.env.ALPACA_API_KEY?.trim();
  const secret = process.env.ALPACA_SECRET_KEY?.trim();
  if (!keyId || !secret) return null;
  return { keyId, secret, paper: process.env.ALPACA_PAPER !== 'false' };
}

/** Verify keys with a read-only account call; returns non-secret account facts. */
export async function verifyAlpaca(creds: AlpacaCreds): Promise<{ accountNumberHint: string; status: string }> {
  const acct = await alpacaGet(creds, '/v2/account');
  const num = String(acct?.account_number ?? '');
  return { accountNumberHint: num ? `…${num.slice(-4)}` : '—', status: String(acct?.status ?? 'unknown') };
}

/** Account equity now (read-only GET /v2/account) — the journal's balance for Mine. */
export async function fetchAlpacaEquity(creds: AlpacaCreds): Promise<{ equity: number; asOf: string }> {
  const acct = await alpacaGet(creds, '/v2/account');
  const equity = Number(acct?.equity);
  if (!Number.isFinite(equity) || equity <= 0) throw new Error('account reported no equity');
  return { equity, asOf: new Date().toISOString() };
}

export async function fetchAlpacaFills(creds: AlpacaCreds): Promise<BrokerFill[]> {
  const fills: BrokerFill[] = [];
  let token: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ direction: 'asc', page_size: '100' });
    if (token) qs.set('page_token', token);
    const batch = await alpacaGet(creds, `/v2/account/activities/FILL?${qs}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const a of batch) {
      const qty = Number(a.qty);
      const price = Number(a.price);
      const side = String(a.side ?? '').toLowerCase();
      if (!a.id || !a.symbol || !Number.isFinite(qty) || !Number.isFinite(price)) continue;
      fills.push({
        id: String(a.id),
        symbol: String(a.symbol),
        side: side === 'sell_short' ? 'sell_short' : side.startsWith('sell') ? 'sell' : 'buy',
        qty,
        price,
        time: String(a.transaction_time),
        assetClass: a.asset_class ?? null,
      });
    }
    token = String(batch[batch.length - 1].id);
    if (batch.length < 100) break;
  }
  return fills;
}

// ─── Stored connection ───────────────────────────────────────

export async function getAlpacaConnection(userId: string) {
  const [row] = await db.select().from(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.broker, 'alpaca'))).limit(1);
  return row ?? null;
}

/** What the client may see: never the keys. */
export function publicConnection(row: Awaited<ReturnType<typeof getAlpacaConnection>>) {
  if (!row) return null;
  return { broker: 'alpaca', paper: row.paper, keyHint: row.keyHint, lastSyncAt: row.lastSyncAt, lastSyncResult: row.lastSyncResult, connectedAt: row.createdAt };
}

export async function saveAlpacaConnection(userId: string, creds: AlpacaCreds) {
  if (!secretBoxConfigured()) throw new Error('BROKER_CREDENTIALS_KEY is not configured on the server');
  const values = {
    userId, broker: 'alpaca', paper: creds.paper,
    keyIdEnc: sealSecret(creds.keyId), secretEnc: sealSecret(creds.secret),
    keyHint: creds.keyId.slice(-4), updatedAt: new Date(),
  };
  const existing = await getAlpacaConnection(userId);
  if (existing) {
    await db.update(brokerConnections).set(values).where(eq(brokerConnections.id, existing.id));
  } else {
    await db.insert(brokerConnections).values(values);
  }
  return getAlpacaConnection(userId);
}

export async function deleteAlpacaConnection(userId: string): Promise<boolean> {
  const res = await db.delete(brokerConnections)
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.broker, 'alpaca')))
    .returning({ id: brokerConnections.id });
  return res.length > 0;
}

export function credsFromConnection(row: NonNullable<Awaited<ReturnType<typeof getAlpacaConnection>>>): AlpacaCreds {
  return { keyId: openSecret(row.keyIdEnc), secret: openSecret(row.secretEnc), paper: row.paper };
}

// ─── Upsert ──────────────────────────────────────────────────

export interface SyncResult {
  fills: number;
  trips: number;
  created: number;
  updated: number;
  unchanged: number;
  open: number;
  closed: number;
  account: 'paper' | 'live';
  source: 'your keys' | 'server account';
  at: string;
}

function tripFields(t: RoundTrip) {
  const mult = t.assetType === 'option' ? 100 : 1;
  const cost = t.entryPrice * t.quantity * mult;
  const pnl = t.realizedPnL;
  return {
    symbol: t.symbol,
    assetType: t.assetType,
    direction: t.direction,
    optionType: t.optionType,
    strikePrice: t.strikePrice,
    expiryDate: t.expiryDate,
    quantity: t.quantity,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    // Alpaca is commission-free; regulatory pass-through fees arrive as separate
    // activities and are not attributed to trips here.
    fees: 0,
    entryTime: new Date(t.entryTime).toISOString(),
    exitTime: t.exitTime ? new Date(t.exitTime).toISOString() : null,
    holdingMinutes: t.exitTime ? Math.max(0, Math.round((Date.parse(t.exitTime) - Date.parse(t.entryTime)) / 60_000)) : null,
    realizedPnL: pnl,
    grossPnL: pnl,
    realizedPnLPercent: pnl != null && cost > 0 ? Math.round((pnl / cost) * 10_000) / 100 : null,
    status: t.status,
    outcome: (pnl == null ? 'open' : Math.abs(pnl) < 0.005 ? 'breakeven' : pnl > 0 ? 'win' : 'loss') as JournalTrade['outcome'],
  };
}

export async function syncAlpacaIntoJournal(ownerId: string, creds: AlpacaCreds, source: SyncResult['source']): Promise<SyncResult> {
  const fills = await fetchAlpacaFills(creds);
  const trips = pairFills(fills);
  const existing = (await storage.getJournalTrades(ownerId)).filter((r) => r.broker === 'alpaca' && r.brokerOrderId);
  const byKey = new Map(existing.map((r) => [r.brokerOrderId!, r]));
  const batchId = `alpaca_${Date.now()}`;
  let created = 0, updated = 0, unchanged = 0;

  for (const t of trips) {
    const key = `alpaca:${t.key}`;
    const fields = tripFields(t);
    const prev = byKey.get(key);
    if (!prev) {
      await storage.createJournalTrade({
        ...fields, userId: ownerId, broker: 'alpaca', brokerOrderId: key, importBatchId: batchId,
        rawCsvRow: { fillIds: t.fillIds } as any,
      } as any);
      created++;
      continue;
    }
    const changed = (['quantity', 'entryPrice', 'exitPrice', 'exitTime', 'realizedPnL', 'status'] as const)
      .some((k) => (prev as any)[k] !== (fields as any)[k]);
    if (!changed) { unchanged++; continue; }
    // Economics only — the user's notes / tags / rating / screenshot stay.
    await storage.updateJournalTrade(prev.id, { ...fields, rawCsvRow: { fillIds: t.fillIds } as any, updatedAt: new Date() } as any);
    updated++;
  }

  const result: SyncResult = {
    fills: fills.length, trips: trips.length, created, updated, unchanged,
    open: trips.filter((t) => t.status === 'open').length,
    closed: trips.filter((t) => t.status === 'closed').length,
    account: creds.paper ? 'paper' : 'live', source, at: new Date().toISOString(),
  };
  logger.info(`[JOURNAL-ALPACA] synced ${result.trips} trips (${created} new, ${updated} updated) from ${fills.length} fills`);
  return result;
}

export async function recordSync(userId: string, result: SyncResult | { error: string; at: string }) {
  await db.update(brokerConnections)
    .set({ lastSyncAt: new Date(), lastSyncResult: result as any, updatedAt: new Date() })
    .where(and(eq(brokerConnections.userId, userId), eq(brokerConnections.broker, 'alpaca')));
}
