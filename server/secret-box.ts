/**
 * Secret box — encryption at rest for per-user third-party credentials
 * (broker API keys for read-only journal import).
 *
 * AES-256-GCM with a random 96-bit IV per value; the stored string is
 * `v1:<iv b64>:<tag b64>:<ciphertext b64>`. The key comes from
 * BROKER_CREDENTIALS_KEY — 32 bytes as 64 hex chars or base64. It is deliberately
 * NOT derived from SESSION_SECRET: rotating sessions must not brick stored keys,
 * and a leaked session secret must not also unlock broker credentials.
 *
 * Generate one:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function loadKey(): Buffer | null {
  const raw = process.env.BROKER_CREDENTIALS_KEY?.trim();
  if (!raw) return null;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null;
}

export function secretBoxConfigured(): boolean {
  return loadKey() !== null;
}

export function sealSecret(plain: string): string {
  const key = loadKey();
  if (!key) throw new Error('BROKER_CREDENTIALS_KEY is not configured (32 bytes, hex or base64)');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

export function openSecret(sealed: string): string {
  const key = loadKey();
  if (!key) throw new Error('BROKER_CREDENTIALS_KEY is not configured');
  const [v, iv, tag, ct] = sealed.split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unrecognised sealed secret');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}
