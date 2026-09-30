/**
 * SHARED STATE — small JSON files the worker writes and the web process reads.
 *
 * After the web/worker split (docs/WORKER_SPLIT.md) the jobs that used to keep
 * route-visible state in memory (pre-market plan, 0DTE desk evaluations, squeeze
 * radar, SPX scanners, crypto last scan, worker health …) run in another process.
 * Durable facts already go to Postgres; this is for the in-memory "what did the
 * last pass see" state that never had a table.
 *
 *   writeShared(name, obj)   atomic: write <name>.json.<pid>.tmp, then rename —
 *                            a reader never sees a half-written file.
 *   readShared(name, maxAge) parsed envelope, cached by mtime (a request storm
 *                            parses a file once per write), with its age stamped.
 *
 * Files live in SHARED_STATE_DIR (default <cwd>/.cache/shared). Both pm2 apps
 * must share a cwd. Nothing here throws: a missing / corrupt file reads as null.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface SharedEnvelope<T> {
  name: string;
  writtenAt: string;
  pid: number;
  data: T;
}

export interface SharedRead<T> {
  data: T;
  writtenAt: string;
  writtenAtMs: number;
  ageMs: number;
  /** ageMs > maxAgeMs (still returned — the caller decides whether stale beats nothing). */
  stale: boolean;
}

export function sharedDir(): string {
  return process.env.SHARED_STATE_DIR || path.join(process.cwd(), '.cache', 'shared');
}

const safe = (name: string) => name.replace(/[^A-Za-z0-9._-]/g, '_');
export const sharedFile = (name: string) => path.join(sharedDir(), `${safe(name)}.json`);

let dirReady = false;
function ensureDir(): void {
  if (dirReady) return;
  fs.mkdirSync(sharedDir(), { recursive: true });
  dirReady = true;
}

/** Synchronous atomic write. Returns false (never throws) when the write failed. */
export function writeSharedSync<T>(name: string, data: T): boolean {
  try {
    ensureDir();
    const file = sharedFile(name);
    const tmp = `${file}.${process.pid}.tmp`;
    const env: SharedEnvelope<T> = { name, writtenAt: new Date().toISOString(), pid: process.pid, data };
    fs.writeFileSync(tmp, JSON.stringify(env));
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/** Async atomic write — use for anything larger than a few hundred KB. */
export async function writeShared<T>(name: string, data: T): Promise<boolean> {
  try {
    ensureDir();
    const file = sharedFile(name);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const env: SharedEnvelope<T> = { name, writtenAt: new Date().toISOString(), pid: process.pid, data };
    await fs.promises.writeFile(tmp, JSON.stringify(env));
    await fs.promises.rename(tmp, file);
    return true;
  } catch {
    return false;
  }
}

const cache = new Map<string, { mtimeMs: number; size: number; env: SharedEnvelope<unknown> }>();

/**
 * Read a shared file. `maxAgeMs` only sets `stale`; pass Infinity to ignore age.
 * Returns null when there is no file (the worker has not written it yet).
 */
export function readShared<T>(name: string, maxAgeMs = Infinity): SharedRead<T> | null {
  const file = sharedFile(name);
  let st: fs.Stats;
  try { st = fs.statSync(file); } catch { cache.delete(name); return null; }
  let hit = cache.get(name);
  if (!hit || hit.mtimeMs !== st.mtimeMs || hit.size !== st.size) {
    try {
      const env = JSON.parse(fs.readFileSync(file, 'utf8')) as SharedEnvelope<unknown>;
      if (!env || typeof env !== 'object' || !('data' in env)) return null;
      hit = { mtimeMs: st.mtimeMs, size: st.size, env };
      cache.set(name, hit);
    } catch {
      return hit ? toRead<T>(hit.env as SharedEnvelope<T>, maxAgeMs) : null;
    }
  }
  return toRead<T>(hit.env as SharedEnvelope<T>, maxAgeMs);
}

function toRead<T>(env: SharedEnvelope<T>, maxAgeMs: number): SharedRead<T> {
  const writtenAtMs = Date.parse(env.writtenAt) || 0;
  const ageMs = Math.max(0, Date.now() - writtenAtMs);
  return { data: env.data, writtenAt: env.writtenAt, writtenAtMs, ageMs, stale: ageMs > maxAgeMs };
}

/** mtime of a shared file in ms (0 when absent) — cheap change detection. */
export function sharedMtime(name: string): number {
  try { return fs.statSync(sharedFile(name)).mtimeMs; } catch { return 0; }
}

/** Age stamp for API payloads: { source, asOf, ageSec }. */
export function sharedStamp(r: SharedRead<unknown> | null, source = 'worker') {
  return r
    ? { source, asOf: r.writtenAt, ageSec: Math.round(r.ageMs / 1000), stale: r.stale }
    : { source, asOf: null, ageSec: null, stale: true };
}

/** Append one JSON line (worker → web event bridge). */
export function appendSharedLine(name: string, obj: unknown): void {
  try {
    ensureDir();
    fs.appendFileSync(path.join(sharedDir(), `${safe(name)}.jsonl`), JSON.stringify(obj) + '\n');
  } catch { /* best effort */ }
}

/**
 * Tail a .jsonl written by appendSharedLine: calls onLine for lines appended
 * after the tail starts. Truncates the file past 1 MB (the reader restarts at 0).
 */
export function tailSharedLines(name: string, onLine: (obj: any) => void, everyMs = 2_000): () => void {
  const file = path.join(sharedDir(), `${safe(name)}.jsonl`);
  let offset = 0;
  try { offset = fs.statSync(file).size; } catch { offset = 0; }
  const t = setInterval(() => {
    let size = 0;
    try { size = fs.statSync(file).size; } catch { offset = 0; return; }
    if (size < offset) offset = 0; // truncated / rotated
    if (size === offset) return;
    try {
      const fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      fs.closeSync(fd);
      offset = size;
      for (const line of buf.toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        try { onLine(JSON.parse(line)); } catch { /* skip a torn line */ }
      }
      if (size > 1024 * 1024) { fs.truncateSync(file, 0); offset = 0; }
    } catch { /* next tick */ }
  }, everyMs);
  t.unref?.();
  return () => clearInterval(t);
}
