/**
 * NEXUS tracked symbols — store (shared/nexus-tracked.ts holds the pure rules).
 *
 * Persisted as .cache/shared/nexus-tracked.json through the shared-state
 * helpers, so the web process (endpoints) and the worker (producers) read the
 * same list. readShared is mtime-cached, so getTrackedSymbols() is cheap enough
 * to call at the top of every scan pass. Seeded from env NEXUS_TRACK.
 */
import { readShared, writeSharedSync } from './lib/shared-state';
import {
  MAX_TRACKED, dismissKey, etEndOfDayIso, mergeTracked, normSymbol, parseTrackEnv, tradingDayAhead,
  type TrackedFile, type TrackedSymbol,
} from '@shared/nexus-tracked';

export const TRACKED_FILE = 'nexus-tracked';

function readFile(): TrackedFile {
  const r = readShared<TrackedFile>(TRACKED_FILE);
  const d = r?.data;
  return { entries: Array.isArray(d?.entries) ? d!.entries : [], dismissed: Array.isArray(d?.dismissed) ? d!.dismissed : [] };
}

/** The live tracked list (expired entries already dropped). */
export function listTracked(nowMs = Date.now()): TrackedSymbol[] {
  return mergeTracked(parseTrackEnv(process.env.NEXUS_TRACK, nowMs), readFile(), nowMs);
}

/** Just the symbols — what scanners prepend to their universe. Never throws. */
export function getTrackedSymbols(nowMs = Date.now()): string[] {
  try { return listTracked(nowMs).map((e) => e.symbol); } catch { return []; }
}

export class TrackedInputError extends Error {}

/** Add or extend a symbol. `until` (YYYY-MM-DD, last ET day) beats `days` (trading sessions incl. today). */
export function addTracked(input: { symbol: unknown; days?: unknown; until?: unknown; note?: unknown }, nowMs = Date.now()): TrackedSymbol[] {
  const symbol = normSymbol(input.symbol);
  if (!symbol) throw new TrackedInputError('symbol must be 1–6 letters');
  const day = typeof input.until === 'string' && input.until ? input.until : tradingDayAhead(nowMs, Number(input.days ?? 1));
  const until = etEndOfDayIso(day);
  if (!until || Date.parse(until) <= nowMs) throw new TrackedInputError('until must be today or later (YYYY-MM-DD, ET)');
  const live = listTracked(nowMs);
  if (!live.some((e) => e.symbol === symbol) && live.length >= MAX_TRACKED) throw new TrackedInputError(`at most ${MAX_TRACKED} tracked symbols`);
  const file = readFile();
  const entry: TrackedSymbol = { symbol, until, note: String(input.note ?? '').slice(0, 140), addedAt: new Date(nowMs).toISOString(), origin: 'operator' };
  const next: TrackedFile = {
    entries: [...file.entries.filter((e) => e.symbol !== symbol && Date.parse(e.until) > nowMs), entry],
    dismissed: file.dismissed,
  };
  if (!writeSharedSync(TRACKED_FILE, next)) throw new Error('could not write the tracked list');
  return listTracked(nowMs);
}

/** Stop tracking a symbol now (an env seed is dismissed until its own expiry). */
export function removeTracked(rawSymbol: unknown, nowMs = Date.now()): TrackedSymbol[] {
  const symbol = normSymbol(rawSymbol);
  if (!symbol) throw new TrackedInputError('symbol must be 1–6 letters');
  const file = readFile();
  const envSeeds = parseTrackEnv(process.env.NEXUS_TRACK, nowMs).filter((e) => e.symbol === symbol).map(dismissKey);
  const next: TrackedFile = {
    entries: file.entries.filter((e) => e.symbol !== symbol && Date.parse(e.until) > nowMs),
    dismissed: Array.from(new Set([...file.dismissed, ...envSeeds])),
  };
  if (!writeSharedSync(TRACKED_FILE, next)) throw new Error('could not write the tracked list');
  return listTracked(nowMs);
}
