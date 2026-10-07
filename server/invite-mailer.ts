/**
 * Waitlist approval → invite email (admin hub, 2026-10-07).
 *
 *   approveWaitlistEntries()  one email-locked code per entry (an unused code is
 *                             reused), then — unless sendEmail is false — the
 *                             "You're in" email through the sender. Emailed →
 *                             waitlist 'invited' + invite sent_at; failed → stays
 *                             'approved' and the admin row offers "copy link".
 *   buildBetaInviteEmail()    subject / text / html (pure).
 *   inviteSenderConfig()      what the sender would use, and whether Resend can
 *                             deliver from it (onboarding@resend.dev = sandbox:
 *                             only the Resend account owner receives mail).
 *
 * Everything here is DB-free and the sender is injectable, so tests never send
 * a real email (scripts/test-waitlist-approve.ts).
 */
import { inviteLink } from './admin-ops';

export const DEFAULT_DISCORD_URL = 'https://discord.gg/ppjjxVfsc';
export const INVITE_SUBJECT = 'You’re in — QuantEdge beta';
/** Resend's default rate limit is 2 requests/s; batches pace themselves. */
export const SEND_SPACING_MS = 550;

// ── Sender config ─────────────────────────────────────────────────────────
export interface InviteSenderConfig {
  configured: boolean;
  from: string;
  fromHeader: string;
  domain: string;
  sandbox: boolean;
  replyTo: string;
  problem: string | null;
}

export function inviteSenderConfig(env: NodeJS.ProcessEnv = process.env): InviteSenderConfig {
  const from = (env.FROM_EMAIL || 'onboarding@resend.dev').trim();
  const domain = from.includes('@') ? from.slice(from.lastIndexOf('@') + 1).toLowerCase() : '';
  const sandbox = domain === 'resend.dev';
  const configured = !!env.RESEND_API_KEY;
  const problem = !configured
    ? 'RESEND_API_KEY is not set — no email can be sent.'
    : sandbox
      ? 'FROM_EMAIL is not set, so mail would go from onboarding@resend.dev — Resend only delivers that to the Resend account owner. Verify quantedgelabs.net in Resend and set FROM_EMAIL (e.g. beta@quantedgelabs.net).'
      : null;
  return { configured, from, fromHeader: `QuantEdge <${from}>`, domain, sandbox, replyTo: env.SUPPORT_EMAIL || 'support@quantedgelabs.net', problem };
}

/** Turns a provider error into what the operator should do about it. */
export function explainSendError(error: string, cfg: InviteSenderConfig): string {
  if (/domain is not verified|verify a domain|testing emails|own email address|not verified/i.test(error)) {
    return `${error} — the sending domain (${cfg.domain || 'unknown'}) is not verified in Resend. Add Resend's DNS records (Resend → Domains → ${cfg.domain === 'resend.dev' ? 'quantedgelabs.net' : cfg.domain}) and set FROM_EMAIL on that domain.`;
  }
  if (/api key|unauthori[sz]ed|401|403/i.test(error)) return `${error} — check RESEND_API_KEY.`;
  if (/rate|429|too many/i.test(error)) return `${error} — Resend rate limit; try again in a minute.`;
  return error;
}

// ── Template ──────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface InviteEmailInput {
  link: string;
  code: string;
  expiresAt: Date | string | null;
  discordUrl?: string;
  tierOverride?: string | null;
}

export function buildBetaInviteEmail(input: InviteEmailInput): { subject: string; text: string; html: string } {
  const discord = input.discordUrl || DEFAULT_DISCORD_URL;
  const exp = input.expiresAt ? new Date(input.expiresAt) : null;
  const expText = exp && Number.isFinite(exp.getTime())
    ? exp.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
    : null;
  const tier = input.tierOverride && input.tierOverride !== 'free' ? input.tierOverride[0].toUpperCase() + input.tierOverride.slice(1) : null;
  const footer = 'QuantEdge is an educational research tool, not investment advice. Trading stocks, options and crypto involves substantial risk of loss.';

  const text = [
    'You’re in.',
    '',
    'Your spot in the QuantEdge beta is ready. Create your account with this link — the invite code is already filled in:',
    input.link,
    '',
    `Invite code: ${input.code}${expText ? ` (valid until ${expText})` : ''}`,
    'The code only works with this email address.',
    tier ? `Your account starts on the ${tier} plan.` : '',
    '',
    `Join the community on Discord: ${discord}`,
    '',
    'Questions? Reply to this email.',
    '',
    '—',
    footer,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(INVITE_SUBJECT)}</title></head>
<body style="margin:0;padding:0;background:#0b0f17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e6e9ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f17;padding:40px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 0 24px;font-size:15px;font-weight:700;letter-spacing:2px;color:#e6e9ef;">QUANTEDGE</td></tr>
<tr><td style="background:#121826;border:1px solid #1f2937;border-radius:14px;padding:32px;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#ffffff;">You’re in.</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#c3c9d4;">Your spot in the QuantEdge beta is ready. Create your account — the invite code is already filled in.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#3b82f6;">
<a href="${esc(input.link)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Create my account</a>
</td></tr></table>
<p style="margin:24px 0 4px;font-size:13px;color:#8b93a3;">Invite code</p>
<p style="margin:0 0 4px;font-size:16px;font-family:Menlo,Consolas,monospace;color:#ffffff;">${esc(input.code)}</p>
<p style="margin:0 0 16px;font-size:13px;color:#8b93a3;">Works only with this email address${expText ? ` · valid until ${esc(expText)}` : ''}.${tier ? ` Your account starts on the ${esc(tier)} plan.` : ''}</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#c3c9d4;">Join the community on <a href="${esc(discord)}" style="color:#7fb0ff;">Discord</a> — setups, questions and release notes.</p>
<p style="margin:16px 0 0;font-size:12px;color:#8b93a3;">Button not working? Paste this link: <span style="word-break:break-all;color:#c3c9d4;">${esc(input.link)}</span></p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:11px;line-height:1.6;color:#6b7280;">${esc(footer)}<br>Questions? Reply to this email.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: INVITE_SUBJECT, text, html };
}

// ── Sender (injectable) ───────────────────────────────────────────────────
export interface OutgoingEmail { from: string; to: string; replyTo: string; subject: string; text: string; html: string }
export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };
export type InviteEmailSender = (msg: OutgoingEmail) => Promise<SendResult>;

let override: InviteEmailSender | null = null;
/** Tests inject a mock here; null restores the Resend sender. */
export function setInviteEmailSender(sender: InviteEmailSender | null): void { override = sender; }

const resendSender: InviteEmailSender = async (msg) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };
  try {
    const { Resend } = await import('resend');
    const { data, error } = await new Resend(key).emails.send({
      from: msg.from, to: msg.to, replyTo: msg.replyTo, subject: msg.subject, text: msg.text, html: msg.html,
    });
    if (error) return { ok: false, error: error.message || String(error.name || 'send failed') };
    return { ok: true, id: data?.id ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'send failed' };
  }
};

export function currentInviteSender(): InviteEmailSender { return override ?? resendSender; }

// ── Approve ───────────────────────────────────────────────────────────────
export interface WaitlistRow { id: string; email: string; status: string | null }
export interface InviteRow { id: string; token: string; status: string | null; expiresAt: Date | string | null; sentAt?: Date | string | null }

export interface ApproveDeps {
  /** Most recent pending/sent invite for this email, or null. */
  getOpenInvite(email: string): Promise<InviteRow | null>;
  createInvite(input: { email: string; tierOverride: string | null; expiresAt: Date; notes: string }): Promise<InviteRow>;
  setWaitlistStatus(id: string, status: 'approved' | 'invited', inviteId: string): Promise<void>;
  markInviteSent(inviteId: string): Promise<void>;
  /** Best-effort: email_error / email_message_id columns (migration 0006). */
  recordEmailResult?(inviteId: string, r: { error: string | null; messageId: string | null }): Promise<void>;
  isUnused(invite: InviteRow): boolean;
  send: InviteEmailSender;
  sleep?(ms: number): Promise<void>;
  now?(): number;
}

export interface ApproveOptions {
  origin: string;
  tierOverride: string | null;
  expiresAt: Date;
  sendEmail: boolean;
  sender: InviteSenderConfig;
  discordUrl?: string;
}

export interface ApproveResult {
  id: string;
  email: string;
  code: string | null;
  link: string | null;
  reused: boolean;
  emailed: boolean;
  emailedAt: string | null;
  emailError: string | null;
  skipped?: string;
}

export async function approveWaitlistEntries(entries: WaitlistRow[], opts: ApproveOptions, deps: ApproveDeps): Promise<ApproveResult[]> {
  const results: ApproveResult[] = [];
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  let sentSoFar = 0;
  for (const e of entries) {
    if (e.status === 'joined') {
      results.push({ id: e.id, email: e.email, code: null, link: null, reused: false, emailed: false, emailedAt: null, emailError: null, skipped: 'already joined' });
      continue;
    }
    const email = e.email.toLowerCase();
    const existing = await deps.getOpenInvite(email);
    let invite: InviteRow;
    let reused = false;
    if (existing && deps.isUnused(existing)) {
      invite = existing;
      reused = true;
    } else {
      invite = await deps.createInvite({ email, tierOverride: opts.tierOverride, expiresAt: opts.expiresAt, notes: 'waitlist approval' });
    }
    const link = inviteLink(opts.origin, invite.token);
    const alreadyEmailedAt = reused && invite.sentAt ? new Date(invite.sentAt).toISOString() : null;
    const base = { id: e.id, email: e.email, code: invite.token, link, reused };

    // A code that was already emailed is not emailed again by "Approve" / "Show code".
    if (alreadyEmailedAt) {
      await deps.setWaitlistStatus(e.id, 'invited', invite.id);
      results.push({ ...base, emailed: true, emailedAt: alreadyEmailedAt, emailError: null });
      continue;
    }
    if (!opts.sendEmail) {
      await deps.setWaitlistStatus(e.id, 'approved', invite.id);
      results.push({ ...base, emailed: false, emailedAt: null, emailError: null });
      continue;
    }
    if (!opts.sender.configured) {
      await deps.setWaitlistStatus(e.id, 'approved', invite.id);
      results.push({ ...base, emailed: false, emailedAt: null, emailError: opts.sender.problem ?? 'Email is not configured' });
      continue;
    }
    if (sentSoFar > 0) await sleep(SEND_SPACING_MS);
    sentSoFar++;
    const mail = buildBetaInviteEmail({ link, code: invite.token, expiresAt: invite.expiresAt, discordUrl: opts.discordUrl, tierOverride: opts.tierOverride });
    let r: SendResult;
    try {
      r = await deps.send({ from: opts.sender.fromHeader, to: email, replyTo: opts.sender.replyTo, ...mail });
    } catch (err) {
      r = { ok: false, error: (err as Error)?.message || 'send failed' };
    }
    if (r.ok) {
      await deps.markInviteSent(invite.id);
      await deps.setWaitlistStatus(e.id, 'invited', invite.id);
      await deps.recordEmailResult?.(invite.id, { error: null, messageId: r.id }).catch(() => undefined);
      results.push({ ...base, emailed: true, emailedAt: new Date(now()).toISOString(), emailError: null });
    } else {
      const why = explainSendError(r.error, opts.sender);
      await deps.setWaitlistStatus(e.id, 'approved', invite.id);
      await deps.recordEmailResult?.(invite.id, { error: why.slice(0, 1000), messageId: null }).catch(() => undefined);
      results.push({ ...base, emailed: false, emailedAt: null, emailError: why });
    }
  }
  return results;
}

/** "Approve all pending": the server re-counts and refuses if the list moved since the operator confirmed. */
export function checkApproveAllConfirmation(body: unknown, pendingCount: number): { ok: true } | { ok: false; status: number; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.confirm !== 'approve-all-pending') return { ok: false, status: 400, error: 'Confirmation missing: send confirm "approve-all-pending"' };
  const expected = Number(b.expectedCount);
  if (!Number.isInteger(expected) || expected < 1) return { ok: false, status: 400, error: 'expectedCount: the pending count you confirmed' };
  if (pendingCount === 0) return { ok: false, status: 409, error: 'Nobody is pending' };
  if (expected !== pendingCount) return { ok: false, status: 409, error: `The pending list changed — ${pendingCount} pending now, you confirmed ${expected}. Reload and confirm again.` };
  return { ok: true };
}
