/**
 * Ask Quantinum — quota + cost ledger, admin config store.
 *
 * Usage is an append-only JSONL under .cache/quantinum-ai/ (both pm2 apps share
 * the cwd, same pattern as admin-audit.ts). One line per question: counts,
 * tokens, cost, provider, latency — never the question or the answer.
 * Today's per-user counts and the global spend are rebuilt from that file on the
 * first call of each ET day, then kept in memory.
 *
 * Config (provider order + models) lives beside it in config.json; defaults are
 * in shared/quantinum-ai.ts and win whenever the file is absent or invalid.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_QUANTINUM_AI_CONFIG, parseQuantinumAiConfig, type QuantinumAiConfig, type UsageEntry,
} from '@shared/quantinum-ai';
import { etDay } from '@shared/setup-lifecycle';

export function quantinumAiDir(): string {
  return process.env.QUANTINUM_AI_DIR || path.join(process.cwd(), '.cache', 'quantinum-ai');
}

// ─── ledger ──────────────────────────────────────────────────

export class UsageLedger {
  private day = '';
  private perUser = new Map<string, number>();
  private spent = 0;
  /** Questions running right now — counted against quota and cap until recorded. */
  private inflight = new Map<string, number>();
  private reservedUsd = 0;

  constructor(private readonly file: string, private readonly now: () => number = Date.now) {}

  private roll(): void {
    const today = etDay(this.now());
    if (today === this.day) return;
    this.day = today;
    this.perUser = new Map();
    this.spent = 0;
    for (const e of readUsage(this.file)) {
      if (e.day !== today) continue;
      this.spent += Number(e.costUsd) || 0;
      if (e.ok) this.perUser.set(e.userKey, (this.perUser.get(e.userKey) ?? 0) + 1);
    }
  }

  today(): string { this.roll(); return this.day; }
  usedBy(userKey: string): number { this.roll(); return this.perUser.get(userKey) ?? 0; }
  spentToday(): number { this.roll(); return this.spent; }

  /**
   * May this question run? Quota counts answered questions; the cost cap is
   * checked against today's spend plus this request's worst case (full output).
   */
  check(userKey: string, quota: number, capUsd: number, worstCaseUsd: number):
    { ok: true; used: number; remaining: number } | { ok: false; code: 'quota' | 'cost_cap'; used: number; remaining: number } {
    this.roll();
    const used = this.usedBy(userKey) + (this.inflight.get(userKey) ?? 0);
    if (used >= quota) return { ok: false, code: 'quota', used, remaining: 0 };
    if (this.spent + this.reservedUsd + worstCaseUsd > capUsd) return { ok: false, code: 'cost_cap', used, remaining: quota - used };
    return { ok: true, used, remaining: quota - used };
  }

  /** check() and, when allowed, hold a slot + the worst-case spend until release(). */
  acquire(userKey: string, quota: number, capUsd: number, worstCaseUsd: number): ReturnType<UsageLedger['check']> {
    const r = this.check(userKey, quota, capUsd, worstCaseUsd);
    if (r.ok) {
      this.inflight.set(userKey, (this.inflight.get(userKey) ?? 0) + 1);
      this.reservedUsd += worstCaseUsd;
    }
    return r;
  }

  release(userKey: string, worstCaseUsd: number): void {
    const n = (this.inflight.get(userKey) ?? 0) - 1;
    if (n > 0) this.inflight.set(userKey, n); else this.inflight.delete(userKey);
    this.reservedUsd = Math.max(0, this.reservedUsd - worstCaseUsd);
  }

  record(entry: Omit<UsageEntry, 'day' | 'at'> & { at?: string }): UsageEntry {
    this.roll();
    const full: UsageEntry = { ...entry, at: entry.at ?? new Date(this.now()).toISOString(), day: this.day };
    this.spent += Number(full.costUsd) || 0;
    if (full.ok) this.perUser.set(full.userKey, (this.perUser.get(full.userKey) ?? 0) + 1);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, JSON.stringify(full) + '\n');
    } catch { /* the in-memory count still holds for this process */ }
    return full;
  }
}

export function readUsage(file: string): UsageEntry[] {
  let raw = '';
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const out: UsageEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip torn line */ }
  }
  return out;
}

export interface UsageSummary {
  days: { day: string; questions: number; answered: number; blocked: number; costUsd: number; inputTokens: number; outputTokens: number }[];
  byProvider: { provider: string; model: string; questions: number; costUsd: number; fallbacks: number; errors: number }[];
  byTier: { tier: string; questions: number }[];
  topUsersToday: { userKey: string; tier: string; questions: number }[];
}

/** Admin view: last `days` ET days. Counts only — the log never holds content. */
export function summarizeUsage(entries: UsageEntry[], today: string, days = 7): UsageSummary {
  const dayKeys = [...new Set(entries.map((e) => e.day))].sort().reverse().slice(0, days);
  const keep = entries.filter((e) => dayKeys.includes(e.day));
  const dayMap = new Map<string, UsageSummary['days'][number]>();
  const prov = new Map<string, UsageSummary['byProvider'][number]>();
  const tiers = new Map<string, number>();
  const users = new Map<string, { tier: string; questions: number }>();
  for (const e of keep) {
    const d = dayMap.get(e.day) ?? { day: e.day, questions: 0, answered: 0, blocked: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
    d.questions++; if (e.ok) d.answered++; if (e.error === 'quota' || e.error === 'cost_cap') d.blocked++;
    d.costUsd += e.costUsd || 0; d.inputTokens += e.inputTokens || 0; d.outputTokens += e.outputTokens || 0;
    dayMap.set(e.day, d);
    if (e.provider) {
      const k = `${e.provider}|${e.model}`;
      const p = prov.get(k) ?? { provider: e.provider, model: String(e.model), questions: 0, costUsd: 0, fallbacks: 0, errors: 0 };
      p.questions++; p.costUsd += e.costUsd || 0; p.fallbacks += e.fallbacks || 0; if (!e.ok) p.errors++;
      prov.set(k, p);
    }
    tiers.set(e.tier, (tiers.get(e.tier) ?? 0) + 1);
    if (e.day === today && e.ok) {
      const u = users.get(e.userKey) ?? { tier: e.tier, questions: 0 };
      u.questions++; users.set(e.userKey, u);
    }
  }
  return {
    days: [...dayMap.values()].sort((a, b) => b.day.localeCompare(a.day)).map((d) => ({ ...d, costUsd: +d.costUsd.toFixed(4) })),
    byProvider: [...prov.values()].sort((a, b) => b.questions - a.questions).map((p) => ({ ...p, costUsd: +p.costUsd.toFixed(4) })),
    byTier: [...tiers.entries()].map(([tier, questions]) => ({ tier, questions })).sort((a, b) => b.questions - a.questions),
    topUsersToday: [...users.entries()].map(([userKey, u]) => ({ userKey, ...u })).sort((a, b) => b.questions - a.questions).slice(0, 20),
  };
}

// ─── config ──────────────────────────────────────────────────

export function configFile(): string { return path.join(quantinumAiDir(), 'config.json'); }

export function readQuantinumAiConfig(file = configFile()): QuantinumAiConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const parsed = parseQuantinumAiConfig(raw);
    if (!parsed.ok) return DEFAULT_QUANTINUM_AI_CONFIG;
    return { ...parsed.config, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null, updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : null };
  } catch {
    return DEFAULT_QUANTINUM_AI_CONFIG;
  }
}

export function writeQuantinumAiConfig(cfg: Pick<QuantinumAiConfig, 'quick' | 'deep'>, actor: string, file = configFile()): QuantinumAiConfig {
  const full: QuantinumAiConfig = { ...cfg, updatedAt: new Date().toISOString(), updatedBy: actor };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(full, null, 2));
  fs.renameSync(tmp, file);
  return full;
}

export function resetQuantinumAiConfig(file = configFile()): void {
  try { fs.unlinkSync(file); } catch { /* already default */ }
}
