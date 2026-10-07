/**
 * Intake profiles (waitlist form + "Complete your profile" sheet) and per-user
 * onboarding progress.
 *
 *   profiles  → beta_waitlist.profile jsonb          (by lower-cased email)
 *   progress  → user_preferences.onboarding jsonb    (by user id)
 *
 * Both columns come from migrations/0007_intake_onboarding.sql, which this
 * branch does NOT apply. Until it is applied every DB call fails with 42703 and
 * is switched off for the life of the process; the data always also lives in
 * .cache/shared/{intake-profiles,onboarding-progress}.json (server/lib/shared-state.ts),
 * so nothing is lost before or after the migration — reads merge both.
 *
 * Deliberately NOT in shared/schema.ts (same reason as 0006: drizzle selects
 * every declared column, so declaring them before the ALTER breaks every read).
 * Never throws.
 */
import type { IntakeProfile } from '@shared/intake';
import { normalizeProgress, newerProgress, mergeProgress, type OnboardingProgress } from '@shared/onboarding';

export interface KvStore {
  read<T>(name: string): T | null;
  write<T>(name: string, data: T): boolean;
}

export interface IntakeStoreDeps {
  kv: KvStore;
  /** Optional DB layer; each call may throw (42703 = column missing → disabled). */
  db?: {
    saveProfile(email: string, profile: IntakeProfile, overwrite: boolean): Promise<void>;
    readProfiles(): Promise<{ email: string; profile: unknown }[]>;
    saveProgress(userId: string, progress: OnboardingProgress): Promise<void>;
    readProgress(userId: string): Promise<unknown | null>;
  };
  log?(level: 'warn' | 'error', msg: string, meta?: Record<string, unknown>): void;
}

export const PROFILES_FILE = 'intake-profiles';
export const PROGRESS_FILE = 'onboarding-progress';

type ProfileMap = Record<string, IntakeProfile>;
type ProgressMap = Record<string, OnboardingProgress>;

let profileColumnMissing = false;
let progressColumnMissing = false;
export function _resetIntakeStoreState(): void { profileColumnMissing = false; progressColumnMissing = false; }

const isMissingColumn = (e: unknown) => ['42703', '42P01'].includes((e as { code?: string })?.code ?? '');

function onDbError(deps: IntakeStoreDeps, which: 'profile' | 'progress', e: unknown) {
  if (isMissingColumn(e)) {
    if (which === 'profile') profileColumnMissing = true; else progressColumnMissing = true;
    deps.log?.('warn', `[INTAKE] ${which} column missing — apply migrations/0007_intake_onboarding.sql (using .cache/shared until then)`);
  } else {
    deps.log?.('warn', `[INTAKE] ${which} DB write/read failed`, { error: (e as Error)?.message });
  }
}

/**
 * Save a profile for an email. overwrite=false (public waitlist form) keeps the
 * first profile an email submitted — an anonymous request can't replace
 * someone else's answers. Signed-in saves pass overwrite=true.
 */
export async function saveProfile(deps: IntakeStoreDeps, emailRaw: string, profile: IntakeProfile, overwrite: boolean):
  Promise<'saved' | 'kept' | 'error'> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return 'error';
  const map = deps.kv.read<ProfileMap>(PROFILES_FILE) ?? {};
  if (map[email] && !overwrite) return 'kept';
  const stamped: IntakeProfile = { ...profile, submittedAt: new Date().toISOString() };
  map[email] = stamped;
  const fileOk = deps.kv.write(PROFILES_FILE, map);
  let dbOk = false;
  if (deps.db && !profileColumnMissing) {
    try { await deps.db.saveProfile(email, stamped, overwrite); dbOk = true; } catch (e) { onDbError(deps, 'profile', e); }
  }
  if (!fileOk && !dbOk) { deps.log?.('error', '[INTAKE] profile not saved anywhere', { email: email.split('@')[1] }); return 'error'; }
  return 'saved';
}

/** Every stored profile by email — DB rows win over the file copy. */
export async function readAllProfiles(deps: IntakeStoreDeps): Promise<Map<string, IntakeProfile>> {
  const out = new Map<string, IntakeProfile>(Object.entries(deps.kv.read<ProfileMap>(PROFILES_FILE) ?? {}));
  if (deps.db && !profileColumnMissing) {
    try {
      for (const r of await deps.db.readProfiles()) {
        if (r.profile && typeof r.profile === 'object') out.set(r.email.toLowerCase(), r.profile as IntakeProfile);
      }
    } catch (e) { onDbError(deps, 'profile', e); }
  }
  return out;
}

export async function readProfile(deps: IntakeStoreDeps, email: string): Promise<IntakeProfile | null> {
  return (await readAllProfiles(deps)).get(email.trim().toLowerCase()) ?? null;
}

export async function readProgress(deps: IntakeStoreDeps, userId: string): Promise<OnboardingProgress> {
  const map = deps.kv.read<ProgressMap>(PROGRESS_FILE) ?? {};
  const fromFile = map[userId] ? normalizeProgress(map[userId]) : null;
  let fromDb: OnboardingProgress | null = null;
  if (deps.db && !progressColumnMissing) {
    try { const raw = await deps.db.readProgress(userId); fromDb = raw ? normalizeProgress(raw) : null; } catch (e) { onDbError(deps, 'progress', e); }
  }
  return newerProgress(fromDb, fromFile);
}

export async function patchProgress(deps: IntakeStoreDeps, userId: string, patch: unknown): Promise<OnboardingProgress> {
  const next = mergeProgress(await readProgress(deps, userId), patch);
  const map = deps.kv.read<ProgressMap>(PROGRESS_FILE) ?? {};
  map[userId] = next;
  deps.kv.write(PROGRESS_FILE, map);
  if (deps.db && !progressColumnMissing) {
    try { await deps.db.saveProgress(userId, next); } catch (e) { onDbError(deps, 'progress', e); }
  }
  return next;
}

/** Production deps (lazy imports keep the module DB-free for tests). */
export async function defaultIntakeDeps(): Promise<IntakeStoreDeps> {
  const { readShared, writeSharedSync } = await import('./lib/shared-state');
  const { db } = await import('./db');
  const { sql } = await import('drizzle-orm');
  const { logger } = await import('./logger');
  const rows = (r: unknown) => ((r as { rows?: unknown[] })?.rows ?? []) as Record<string, unknown>[];
  return {
    kv: {
      read: <T,>(name: string) => readShared<T>(name)?.data ?? null,
      write: <T,>(name: string, data: T) => writeSharedSync(name, data),
    },
    db: {
      saveProfile: async (email, profile, overwrite) => {
        const json = JSON.stringify(profile);
        await (overwrite
          ? db.execute(sql`UPDATE beta_waitlist SET profile = ${json}::jsonb WHERE lower(email) = ${email}`)
          : db.execute(sql`UPDATE beta_waitlist SET profile = COALESCE(profile, ${json}::jsonb) WHERE lower(email) = ${email}`));
      },
      readProfiles: async () => rows(await db.execute(sql`SELECT email, profile FROM beta_waitlist WHERE profile IS NOT NULL`))
        .map((r) => ({ email: String(r.email), profile: r.profile })),
      saveProgress: async (userId, progress) => {
        await db.execute(sql`UPDATE user_preferences SET onboarding = ${JSON.stringify(progress)}::jsonb WHERE user_id = ${userId}`);
      },
      readProgress: async (userId) => rows(await db.execute(sql`SELECT onboarding FROM user_preferences WHERE user_id = ${userId} LIMIT 1`))[0]?.onboarding ?? null,
    },
    log: (level, msg, meta) => logger[level](msg, meta ?? {}),
  };
}
