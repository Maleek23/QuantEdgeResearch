/**
 * npx tsx scripts/test-privacy-redact.ts — server/privacy-redact.ts (no DB, no network).
 */
import assert from 'node:assert/strict';
import { emailDomain, maskEmail, waitlistDiscordConfig, waitlistEmailForDiscord } from '../server/privacy-redact';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`ok ${n} ${name}`); };

t('emailDomain', () => {
  assert.equal(emailDomain('Jane.Doe@Gmail.com'), 'gmail.com');
  assert.equal(emailDomain('no-at-sign'), 'unknown');
  assert.equal(emailDomain(''), 'unknown');
  assert.equal(emailDomain(null), 'unknown');
});

t('maskEmail keeps first char + domain only', () => {
  assert.equal(maskEmail('jane@gmail.com'), 'j***@gmail.com');
  assert.equal(maskEmail('@x.com'), '***');
});

t('waitlist: no dedicated webhook → no notification (never falls back to DISCORD_WEBHOOK_URL)', () => {
  const c = waitlistDiscordConfig({ DISCORD_WEBHOOK_URL: 'https://discord.test/general' } as any);
  assert.equal(c.webhookUrl, null);
  assert.equal(c.detail, 'domain');
});

t('waitlist: default detail is domain-only', () => {
  const c = waitlistDiscordConfig({ DISCORD_WAITLIST_WEBHOOK_URL: 'https://discord.test/ops' } as any);
  assert.equal(c.webhookUrl, 'https://discord.test/ops');
  assert.equal(waitlistEmailForDiscord('jane@gmail.com', c.detail), '…@gmail.com');
});

t('waitlist: off disables even with a webhook; full passes the address; junk → domain', () => {
  assert.equal(waitlistDiscordConfig({ DISCORD_WAITLIST_WEBHOOK_URL: 'u', WAITLIST_DISCORD_DETAIL: 'OFF' } as any).webhookUrl, null);
  const full = waitlistDiscordConfig({ DISCORD_WAITLIST_WEBHOOK_URL: 'u', WAITLIST_DISCORD_DETAIL: 'full' } as any);
  assert.equal(waitlistEmailForDiscord('jane@gmail.com', full.detail), 'jane@gmail.com');
  assert.equal(waitlistDiscordConfig({ DISCORD_WAITLIST_WEBHOOK_URL: 'u', WAITLIST_DISCORD_DETAIL: 'everything' } as any).detail, 'domain');
});

console.log(`\n${n} passed`);
