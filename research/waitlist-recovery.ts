/**
 * Waitlist recovery — READ-ONLY scan for people who left an email but are not
 * in beta_waitlist (2026-10-07). Prints a deduped list: email, first seen,
 * sources, and whether beta_waitlist already has it. Writes NOTHING: database
 * sessions are opened read-only (default_transaction_read_only + BEGIN READ
 * ONLY), files are only read, Discord / Resend calls are GETs.
 *
 *   cd /opt/quantedge && npx tsx research/waitlist-recovery.ts            # table + summary
 *   npx tsx research/waitlist-recovery.ts --csv > lost.csv                 # CSV of the missing ones
 *   npx tsx research/waitlist-recovery.ts --all                            # include emails already on the list
 *
 * Where it looks (each source is optional; a missing one is reported, not fatal):
 *   1. Databases   DATABASE_URL (live) + RECOVERY_DATABASE_URLS (comma list: the
 *                  old Supabase / Neon / Render databases — the Sep 24 import
 *                  brought ideas/positions/flow over, NOT beta_waitlist) + the
 *                  DATABASE_URL in ./.env.supabase if that file exists. Every
 *                  public table column named like %email% (beta_waitlist,
 *                  beta_invites, users, password_reset_tokens, …) plus emails
 *                  inside sessions.sess (Google / join-beta sessions).
 *   2. Logs        ./logs/*.log* (winston) and $PM2_HOME/logs (default ~/.pm2/logs,
 *                  /root/.pm2/logs), .gz included, plus --logs <dir>. Before
 *                  2026-09-30 every waitlist signup was logged WITH the email
 *                  ("New beta waitlist signup"); Google sign-ins refused for
 *                  lack of an invite are logged with the email to this day.
 *   3. Files       .cache/waitlist-fallback.jsonl (DB-down capture),
 *                  .cache/admin-audit/actions.jsonl, any .cache file whose name
 *                  says waitlist/signup/invite/beta/lead/email.
 *   4. Discord     Before 2026-09-30 each signup was posted WITH the full email
 *                  to DISCORD_WEBHOOK_URL. The webhook's channel is looked up
 *                  (GET webhook) and read with DISCORD_BOT_TOKEN, or channel ids
 *                  in RECOVERY_DISCORD_CHANNEL_IDS. Embeds titled "…Waitlist…".
 *   5. Resend      RESEND_API_KEY → GET /emails (what was sent, to whom) — shows
 *                  who already got an invite / reset email.
 *
 * Flags: --csv  --json  --all  --since YYYY-MM-DD  --no-db  --no-logs  --no-discord
 *        --no-resend  --logs <dir> (repeatable)  --discord-pages N (default 40)
 */
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

// ── Pure helpers (unit-tested in scripts/test-waitlist-capture.ts) ──────────
const EMAIL_RE = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g;
const FILE_EXT_TLD = /\.(png|jpe?g|gif|svg|webp|ico|js|mjs|css|map|json|ts|tsx|html?)$/i;
const OWN_OR_SYSTEM = /(@|\.)(quantedgelabs\.net|resend\.dev|example\.(com|org|net)|sentry\.io|test|localhost|users\.noreply\.github\.com)$/i;
const SYSTEM_LOCAL = /^(no-?reply|noreply|donotreply|mailer-daemon|postmaster|unsubscribe|support|admin|root|test)$/i;

export function extractEmails(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = m[0].replace(/^[._%+-]+/, '').replace(/[.]+$/, '').toLowerCase();
    if (!isExcludedEmail(e)) out.add(e);
  }
  return [...out];
}

export function isExcludedEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at <= 0) return true;
  if (FILE_EXT_TLD.test(email)) return true;
  if (OWN_OR_SYSTEM.test(email)) return true;
  if (SYSTEM_LOCAL.test(email.slice(0, at))) return true;
  return false;
}

/** What a log line says about the email(s) in it; null = not a signup-related line. */
export function classifyLogLine(line: string): string | null {
  if (/New beta waitlist signup/i.test(line)) return 'log:waitlist_join';
  if (/not authorized for beta|INVITE_REQUIRED/i.test(line)) return 'log:google_no_invite';
  if (/Beta verification failed|beta\/verify-code/i.test(line)) return 'log:join_beta_attempt';
  if (/\[WAITLIST\]|waitlist\/join|waitlist/i.test(line)) return 'log:waitlist';
  if (/signup|sign-up|auth\/signup/i.test(line)) return 'log:signup';
  if (/sendBetaInviteEmail|Beta invite sent|invite sent|Attempting to send to/i.test(line)) return 'log:invite_email';
  if (/Google OAuth login successful|Google OAuth/i.test(line)) return 'log:google_login';
  if (/Beta code verified|redeem/i.test(line)) return 'log:invite_redeem';
  return null;
}

/** First timestamp in a log line (winston JSON, winston printf, pm2 --time prefix), ISO or null. */
export function lineTimestamp(line: string): string | null {
  const m = line.match(/(20\d\d-[01]\d-[0-3]\d)[T ]([0-2]\d:[0-5]\d(?::[0-5]\d)?)/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}Z`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export interface Sighting { email: string; source: string; at: string | null; detail?: string }
export interface Candidate { email: string; firstSeen: string | null; sources: Set<string>; count: number; onWaitlist: boolean; details: string[] }

export function addSighting(map: Map<string, Candidate>, s: Sighting): void {
  const email = s.email.trim().toLowerCase();
  if (!email || isExcludedEmail(email)) return;
  let c = map.get(email);
  if (!c) { c = { email, firstSeen: null, sources: new Set(), count: 0, onWaitlist: false, details: [] }; map.set(email, c); }
  c.sources.add(s.source);
  c.count++;
  if (s.at && (!c.firstSeen || s.at < c.firstSeen)) c.firstSeen = s.at;
  if (s.detail && c.details.length < 3 && !c.details.includes(s.detail)) c.details.push(s.detail);
}

/** Discord embed (pre-2026-09-30 waitlist webhook) → email, if it is one. */
export function emailFromWaitlistEmbed(embed: { title?: string; fields?: { name?: string; value?: string }[]; description?: string }): string | null {
  if (!/waitlist|beta/i.test(embed.title ?? '')) return null;
  const field = (embed.fields ?? []).find((f) => /e-?mail/i.test(f.name ?? ''));
  const found = extractEmails(`${field?.value ?? ''} ${embed.description ?? ''}`);
  return found[0] ?? null;
}

export function toCsv(rows: Candidate[]): string {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return ['email,first_seen,on_waitlist,sources,count', ...rows.map((r) =>
    [r.email, r.firstSeen ?? '', r.onWaitlist ? 'yes' : 'no', [...r.sources].sort().join(' '), String(r.count)].map(q).join(','))].join('\n');
}

// ── Sources ────────────────────────────────────────────────────────────────
interface Args { csv: boolean; json: boolean; all: boolean; since: string | null; db: boolean; logs: boolean; discord: boolean; resend: boolean; logDirs: string[]; discordPages: number }

function parseArgs(argv: string[]): Args {
  const a: Args = { csv: false, json: false, all: false, since: null, db: true, logs: true, discord: true, resend: true, logDirs: [], discordPages: 40 };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--csv') a.csv = true;
    else if (v === '--json') a.json = true;
    else if (v === '--all') a.all = true;
    else if (v === '--since') a.since = argv[++i] ?? null;
    else if (v === '--no-db') a.db = false;
    else if (v === '--no-logs') a.logs = false;
    else if (v === '--no-discord') a.discord = false;
    else if (v === '--no-resend') a.resend = false;
    else if (v === '--logs') a.logDirs.push(argv[++i]);
    else if (v === '--discord-pages') a.discordPages = Math.max(1, Number(argv[++i]) || 40);
  }
  return a;
}

const notes: string[] = [];
const note = (s: string) => { notes.push(s); };

function redactDsn(dsn: string): string {
  try { const u = new URL(dsn); return `${u.hostname}${u.pathname}`; } catch { return 'dsn'; }
}

function databaseUrls(): { label: string; url: string; live: boolean }[] {
  const out: { label: string; url: string; live: boolean }[] = [];
  if (process.env.DATABASE_URL) out.push({ label: 'live', url: process.env.DATABASE_URL, live: true });
  for (const u of (process.env.RECOVERY_DATABASE_URLS ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    out.push({ label: `old:${redactDsn(u)}`, url: u, live: false });
  }
  const supa = path.join(process.cwd(), '.env.supabase');
  if (fs.existsSync(supa)) {
    const m = fs.readFileSync(supa, 'utf8').match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\n]+)/m);
    if (m && !out.some((o) => o.url === m[1])) out.push({ label: `old:supabase(${redactDsn(m[1])})`, url: m[1], live: false });
  }
  return out;
}

async function scanDatabase(db: { label: string; url: string; live: boolean }, map: Map<string, Candidate>, onList: Set<string>): Promise<void> {
  const pg = (await import('pg')).default;
  const client = new pg.Client({
    connectionString: db.url,
    ssl: /localhost|127\.0\.0\.1/.test(db.url) ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
    options: '-c default_transaction_read_only=on',
  } as never);
  try {
    await client.connect();
  } catch (e) {
    note(`db ${db.label}: cannot connect (${(e as Error).message})`);
    return;
  }
  try {
    await client.query('BEGIN READ ONLY');
    const cols = await client.query<{ table_name: string; column_name: string }>(
      `SELECT c.table_name, c.column_name FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public' AND c.column_name ILIKE '%email%' AND c.data_type IN ('character varying', 'text')`);
    const hasCreated = new Set((await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'created_at'`)).rows.map((r) => r.table_name));
    let total = 0;
    for (const { table_name: t, column_name: c } of cols.rows) {
      const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const sql = hasCreated.has(t)
        ? `SELECT lower(trim(${ident(c)})) AS e, min(created_at) AS at FROM ${ident(t)} WHERE ${ident(c)} LIKE '%@%' GROUP BY 1`
        : `SELECT DISTINCT lower(trim(${ident(c)})) AS e, NULL::timestamp AS at FROM ${ident(t)} WHERE ${ident(c)} LIKE '%@%'`;
      try {
        const r = await client.query<{ e: string; at: Date | null }>(sql);
        for (const row of r.rows) {
          if (db.live && t === 'beta_waitlist' && c === 'email') onList.add(row.e);
          addSighting(map, { email: row.e, source: `db:${db.live ? '' : `${db.label}:`}${t}`, at: row.at ? new Date(row.at).toISOString() : null });
        }
        total += r.rowCount ?? 0;
      } catch (e) {
        note(`db ${db.label}: ${t}.${c} unreadable (${(e as Error).message})`);
      }
    }
    // Sessions: Google / join-beta / passport payloads carry emails in JSON.
    try {
      const r = await client.query<{ s: string; expire: Date }>(`SELECT sess::text AS s, expire FROM sessions WHERE sess::text LIKE '%@%'`);
      for (const row of r.rows) for (const e of extractEmails(row.s)) addSighting(map, { email: e, source: `db:${db.live ? '' : `${db.label}:`}sessions`, at: null });
      total += r.rowCount ?? 0;
    } catch { /* no sessions table */ }
    note(`db ${db.label}: ${cols.rows.length} email columns, ${total} rows read`);
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    await client.end().catch(() => undefined);
  }
}

function logDirectories(extra: string[]): string[] {
  const pm2Home = process.env.PM2_HOME || path.join(os.homedir(), '.pm2');
  const dirs = [path.join(process.cwd(), 'logs'), path.join(pm2Home, 'logs'), '/root/.pm2/logs', ...extra];
  return [...new Set(dirs.map((d) => path.resolve(d)))].filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
}

async function scanLogFile(file: string, map: Map<string, Candidate>): Promise<number> {
  let stream: NodeJS.ReadableStream = fs.createReadStream(file);
  if (file.endsWith('.gz')) stream = stream.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let hits = 0;
  try {
    for await (const line of rl) {
      if (!line.includes('@')) continue;
      const kind = classifyLogLine(line);
      if (!kind) continue;
      const at = lineTimestamp(line);
      for (const e of extractEmails(line)) { addSighting(map, { email: e, source: kind, at, detail: path.basename(file) }); hits++; }
    }
  } catch (e) {
    note(`log ${file}: read error (${(e as Error).message})`);
  }
  return hits;
}

async function scanLogs(extra: string[], map: Map<string, Candidate>): Promise<void> {
  const dirs = logDirectories(extra);
  if (!dirs.length) { note('logs: no log directory found (./logs, ~/.pm2/logs, /root/.pm2/logs)'); return; }
  for (const dir of dirs) {
    const files = fs.readdirSync(dir).filter((f) => /\.log(\.\d+)?(\.gz)?$|\.gz$|-(out|error)(__\d+)?\.log/.test(f) || /\.log/.test(f));
    let hits = 0;
    for (const f of files) hits += await scanLogFile(path.join(dir, f), map);
    note(`logs ${dir}: ${files.length} files, ${hits} email hits on signup-related lines`);
  }
}

function scanCacheFiles(map: Map<string, Candidate>): void {
  const root = path.join(process.cwd(), '.cache');
  if (!fs.existsSync(root)) { note('files: no .cache directory'); return; }
  const wanted = /waitlist|signup|invite|beta|lead|email|admin-audit|actions\.jsonl/i;
  const stack = [root];
  let files = 0, hits = 0;
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { stack.push(p); continue; }
      if (!wanted.test(p) || !/\.(jsonl?|ndjson|csv|txt|log)$/i.test(ent.name)) continue;
      let size = 0;
      try { size = fs.statSync(p).size; } catch { continue; }
      if (size > 50 * 1024 * 1024) { note(`files ${p}: skipped (${Math.round(size / 1e6)} MB)`); continue; }
      files++;
      const rel = path.relative(process.cwd(), p);
      const source = /waitlist-fallback/.test(p) ? 'file:waitlist_fallback' : /admin-audit/.test(p) ? 'file:admin_audit' : `file:${rel}`;
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        if (!line.includes('@')) continue;
        let at: string | null = null;
        try { const j = JSON.parse(line); at = j.at ?? j.timestamp ?? j.createdAt ?? null; } catch { at = lineTimestamp(line); }
        for (const e of extractEmails(line)) { addSighting(map, { email: e, source, at, detail: rel }); hits++; }
      }
    }
  }
  note(`files: ${files} candidate files under .cache, ${hits} email hits`);
}

async function getJson(url: string, headers: Record<string, string>): Promise<{ status: number; body: any }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { method: 'GET', headers });
    if (r.status === 429) {
      const body = await r.json().catch(() => ({}));
      await new Promise((res) => setTimeout(res, Math.ceil(((body as any)?.retry_after ?? 1) * 1000) + 250));
      continue;
    }
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  return { status: 429, body: null };
}

async function scanDiscord(pages: number, map: Map<string, Candidate>): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channels = new Set((process.env.RECOVERY_DISCORD_CHANNEL_IDS ?? '').split(',').map((x) => x.trim()).filter(Boolean));
  for (const hook of [process.env.DISCORD_WEBHOOK_URL, process.env.DISCORD_WAITLIST_WEBHOOK_URL]) {
    if (!hook) continue;
    const m = hook.match(/webhooks\/(\d+)\/([\w-]+)/);
    if (!m) continue;
    const r = await getJson(`https://discord.com/api/webhooks/${m[1]}/${m[2]}`, {}); // GET: webhook info, no side effect
    if (r.status === 200 && r.body?.channel_id) channels.add(String(r.body.channel_id));
    else note(`discord: webhook lookup ${m[1]} → HTTP ${r.status}`);
  }
  if (!channels.size) { note('discord: no channel (set DISCORD_WEBHOOK_URL or RECOVERY_DISCORD_CHANNEL_IDS)'); return; }
  if (!token) { note(`discord: channels ${[...channels].join(', ')} found but DISCORD_BOT_TOKEN is not set — cannot read history`); return; }
  for (const ch of channels) {
    let before: string | undefined;
    let found = 0, read = 0;
    for (let page = 0; page < pages; page++) {
      const r = await getJson(`https://discord.com/api/v10/channels/${ch}/messages?limit=100${before ? `&before=${before}` : ''}`, { Authorization: `Bot ${token}` });
      if (r.status !== 200 || !Array.isArray(r.body)) { note(`discord: channel ${ch} → HTTP ${r.status} (bot needs View Channel + Read Message History)`); break; }
      if (!r.body.length) break;
      for (const msg of r.body) {
        read++;
        for (const emb of msg.embeds ?? []) {
          const e = emailFromWaitlistEmbed(emb);
          if (e) { addSighting(map, { email: e, source: 'discord:waitlist_embed', at: emb.timestamp ?? msg.timestamp ?? null, detail: `channel ${ch}` }); found++; }
        }
      }
      before = r.body[r.body.length - 1].id;
      await new Promise((res) => setTimeout(res, 400));
    }
    note(`discord: channel ${ch}: ${read} messages read, ${found} waitlist emails`);
  }
}

async function scanResend(map: Map<string, Candidate>): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) { note('resend: RESEND_API_KEY not set'); return; }
  let after: string | undefined;
  let n = 0;
  for (let page = 0; page < 50; page++) {
    const r = await getJson(`https://api.resend.com/emails?limit=100${after ? `&after=${after}` : ''}`, { Authorization: `Bearer ${key}` });
    if (r.status !== 200) { note(`resend: list emails → HTTP ${r.status}${r.body?.message ? ` (${r.body.message})` : ''}`); break; }
    const rows: any[] = r.body?.data ?? [];
    for (const em of rows) {
      for (const to of Array.isArray(em.to) ? em.to : [em.to]) {
        if (typeof to === 'string') { addSighting(map, { email: to, source: 'resend:sent', at: em.created_at ?? null, detail: String(em.subject ?? '').slice(0, 60) }); n++; }
      }
    }
    if (!r.body?.has_more || !rows.length) break;
    after = rows[rows.length - 1].id;
    await new Promise((res) => setTimeout(res, 600));
  }
  note(`resend: ${n} sent-email recipients`);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const map = new Map<string, Candidate>();
  const onList = new Set<string>();

  if (args.db) {
    const dbs = databaseUrls();
    if (!dbs.length) note('db: DATABASE_URL not set');
    for (const db of dbs) await scanDatabase(db, map, onList);
  }
  if (args.logs) await scanLogs(args.logDirs, map);
  scanCacheFiles(map);
  if (args.discord) await scanDiscord(args.discordPages, map).catch((e) => note(`discord: ${(e as Error).message}`));
  if (args.resend) await scanResend(map).catch((e) => note(`resend: ${(e as Error).message}`));

  for (const c of map.values()) c.onWaitlist = onList.has(c.email);
  let rows = [...map.values()];
  if (args.since) rows = rows.filter((r) => !r.firstSeen || r.firstSeen >= args.since!);
  const missing = rows.filter((r) => !r.onWaitlist);
  const show = (args.all ? rows : missing).sort((a, b) => (a.firstSeen ?? '9').localeCompare(b.firstSeen ?? '9'));

  if (args.csv) { process.stdout.write(toCsv(show) + '\n'); return; }
  if (args.json) {
    process.stdout.write(JSON.stringify(show.map((r) => ({ ...r, sources: [...r.sources] })), null, 2) + '\n');
    return;
  }
  console.log('\nWAITLIST RECOVERY — read-only scan', new Date().toISOString());
  for (const n of notes) console.log('  ·', n);
  console.log(`\n${rows.length} distinct emails seen · ${onList.size} already in beta_waitlist · ${missing.length} NOT on the waitlist${args.since ? ` (since ${args.since})` : ''}\n`);
  const bySource = new Map<string, number>();
  for (const r of missing) for (const s of r.sources) bySource.set(s, (bySource.get(s) ?? 0) + 1);
  if (bySource.size) {
    console.log('missing, by source:');
    for (const [s, n] of [...bySource].sort((a, b) => b[1] - a[1])) console.log(`  ${s.padEnd(42)} ${n}`);
    console.log('');
  }
  console.log(`${'email'.padEnd(40)} ${'first seen (UTC)'.padEnd(20)} ${'list'.padEnd(4)} sources`);
  for (const r of show) {
    console.log(`${r.email.padEnd(40)} ${(r.firstSeen ?? '—').slice(0, 19).replace('T', ' ').padEnd(20)} ${(r.onWaitlist ? 'yes' : 'NO').padEnd(4)} ${[...r.sources].sort().join(', ')}`);
  }
  console.log('\nNothing was written. Review the list (users/invites rows are people who already have access or an invite),');
  console.log('then import the ones you want: npx tsx research/waitlist-recovery.ts --csv > lost.csv');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
