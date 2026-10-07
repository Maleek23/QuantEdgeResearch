/**
 * Admin action log — append-only JSONL (docs/ADMIN_TAB.md §Audit log).
 *
 * The same pattern as the squeeze radar's forward log: one JSON object per
 * line under .cache/ (both pm2 apps share a cwd), so it needs no migration and
 * survives restarts — unlike server/audit-logger.ts, which is an in-memory
 * request log since boot (the System health page still shows that one).
 *
 * Every operator action that changes access is appended here: invite codes
 * generated / revoked, waitlist approvals, tier and beta-access changes,
 * account disable / enable / delete, password-reset links, trader-book passcode
 * set / clear. Entries never hold a secret: no invite code (only its last 4),
 * no passcode, no reset token.
 */
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger';

export interface AdminAuditEntry {
  at: string;
  action: string;
  /** Who acted: 'admin-hub' (admin JWT) or 'user:<id>' (signed-in admin account). */
  actor: string;
  /** What it acted on: a user id/email, invite id, trader slug … */
  target: string | null;
  detail: Record<string, unknown>;
  ip: string | null;
}

export const ADMIN_AUDIT_ACTIONS = [
  'invite.generate', 'invite.revoke', 'invite.create', 'invite.send',
  'waitlist.approve', 'waitlist.approve_all', 'waitlist.reject', 'waitlist.invite',
  'user.tier', 'user.beta', 'user.disable', 'user.enable', 'user.delete', 'user.password_reset',
  'trader.passcode_set', 'trader.passcode_clear',
  // Desk admins (docs/DESK_ADMINS.md) — actor is the desk admin's user (or the hub), detail.role says which.
  'desk.assign', 'desk.unassign', 'desk.bot_config', 'desk.bot_enable', 'desk.bot_disable', 'desk.bot_run',
  'desk.passcode_set', 'desk.passcode_clear', 'desk.privacy',
  // Trader accounts (docs/DESK_ADMINS.md §Trader accounts) — detail.codeTail is the last 4 of a link token / temp password, never more.
  'trader_account.create', 'trader_account.regenerate', 'trader_account.revoke', 'trader_account.setup_complete', 'trader_account.password_changed',
  // Trader self-setup from the sign-in page (docs/DESK_ADMINS.md §Trader self-setup) — never the passcode or password.
  'trader_self_setup.fail', 'trader_self_setup.lockout', 'trader_self_setup.complete', 'trader_self_setup.config',
  // Ask Quantinum (docs/ASK_QUANTINUM.md) — provider order / models changed or reset.
  'quantinum_ai.config', 'quantinum_ai.config_reset',
] as const;

export function adminAuditFile(): string {
  return process.env.ADMIN_AUDIT_FILE || path.join(process.cwd(), '.cache', 'admin-audit', 'actions.jsonl');
}

const SECRET_KEYS = /pass|token|secret|code$|^code|hash/i;

/** Drops secret-looking keys; an invite code is reduced to its last 4 characters. */
export function scrubAuditDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (k.startsWith('codeTail')) { out[k] = v; continue; }
    if (SECRET_KEYS.test(k)) continue;
    out[k] = v;
  }
  return out;
}

export function codeTail(code: string | null | undefined): string | null {
  return code ? `…${code.slice(-4)}` : null;
}

/** Never throws: a failed write is logged, and the action itself is not rolled back. */
export function appendAdminAudit(entry: Omit<AdminAuditEntry, 'at' | 'detail'> & { detail?: Record<string, unknown> }, file = adminAuditFile()): AdminAuditEntry {
  const row: AdminAuditEntry = {
    at: new Date().toISOString(),
    action: entry.action,
    actor: entry.actor,
    target: entry.target ?? null,
    detail: scrubAuditDetail(entry.detail ?? {}),
    ip: entry.ip ?? null,
  };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(row) + '\n');
  } catch (err) {
    logger.error('[ADMIN-AUDIT] append failed', { error: (err as Error)?.message, action: row.action });
  }
  logger.info(`[ADMIN-AUDIT] ${row.action}`, { actor: row.actor, target: row.target });
  return row;
}

/** Newest first. Reads at most the last 512 KB of the file. */
export function readAdminAudit(limit = 200, file = adminAuditFile()): AdminAuditEntry[] {
  let text = '';
  try {
    const st = fs.statSync(file);
    const span = Math.min(st.size, 512 * 1024);
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(span);
      fs.readSync(fd, buf, 0, span, st.size - span);
      text = buf.toString('utf8');
    } finally { fs.closeSync(fd); }
    if (span < st.size) text = text.slice(text.indexOf('\n') + 1); // drop the partial first line
  } catch {
    return [];
  }
  const rows: AdminAuditEntry[] = [];
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0 && rows.length < limit; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const r = JSON.parse(line);
      if (r && typeof r.action === 'string' && typeof r.at === 'string') rows.push(r as AdminAuditEntry);
    } catch { /* skip a torn line */ }
  }
  return rows;
}

/** Actor label for a request: the admin hub's JWT, or the signed-in admin user. */
export function auditActor(req: { session?: unknown; cookies?: Record<string, string> }): string {
  const uid = (req.session as { userId?: string } | undefined)?.userId;
  if (uid) return `user:${uid}`;
  return 'admin-hub';
}
