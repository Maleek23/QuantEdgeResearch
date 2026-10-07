/**
 * Ask Quantinum — the pure rules (docs/ASK_QUANTINUM.md), shared by server,
 * client and scripts/test-quantinum-ai.ts. No DB, no env reads, no network.
 *
 * Flag QUANTINUM_AI = admin (default: super-admins + desk admins only) | all | off.
 * Quotas: free 5/day · advanced 50 · pro 200 · admin / desk-admin 200 (ET day).
 * Global spend cap: QUANTINUM_AI_DAILY_USD (default $5) from token accounting.
 */

export const ASK_QUANTINUM_NAME = 'Ask Quantinum';
export const ASK_QUANTINUM_DISCLAIMER = 'Educational, not investment advice.';

// ─── Flag + who sees it ──────────────────────────────────────

export type QuantinumAiMode = 'admin' | 'all' | 'off';

export function readQuantinumAiMode(raw: string | null | undefined): QuantinumAiMode {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'all' || v === 'off') return v;
  return 'admin';
}

export interface AskCaller {
  userId: string | null;
  tier: string | null | undefined;
  /** super = platform admin (ADMIN_EMAIL / admin tier); desk = desk admin; none = member. */
  role: 'super' | 'desk' | 'none';
}

export function canUseAskQuantinum(mode: QuantinumAiMode, caller: AskCaller): boolean {
  if (!caller.userId || mode === 'off') return false;
  if (mode === 'all') return true;
  return caller.role === 'super' || caller.role === 'desk';
}

export const QUANTINUM_TIER_QUOTA = Object.freeze({ free: 5, advanced: 50, pro: 200, admin: 200, desk: 200 } as const);

/** Questions per ET day. Admin role (super or desk) always gets the admin quota. */
export function dailyQuotaFor(caller: Pick<AskCaller, 'tier' | 'role'>): number {
  if (caller.role === 'super' || caller.tier === 'admin') return QUANTINUM_TIER_QUOTA.admin;
  if (caller.role === 'desk') return QUANTINUM_TIER_QUOTA.desk;
  if (caller.tier === 'pro') return QUANTINUM_TIER_QUOTA.pro;
  if (caller.tier === 'advanced') return QUANTINUM_TIER_QUOTA.advanced;
  return QUANTINUM_TIER_QUOTA.free;
}

export const DEFAULT_DAILY_USD_CAP = 5;
export function readDailyUsdCap(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === '') return DEFAULT_DAILY_USD_CAP;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_USD_CAP;
}

// ─── Providers, models, pricing ──────────────────────────────

export const QUANTINUM_PROVIDERS = ['groq', 'gemini', 'anthropic', 'openai'] as const;
export type QuantinumProviderId = (typeof QUANTINUM_PROVIDERS)[number];
export type AskMode = 'quick' | 'deep';

export interface ProviderStep { provider: QuantinumProviderId; model: string }
export interface QuantinumAiConfig { quick: ProviderStep[]; deep: ProviderStep[]; updatedAt: string | null; updatedBy: string | null }

/**
 * Defaults in code; /admin overrides them (.cache/quantinum-ai/config.json).
 * Quick Q&A → Groq Llama (free tier) then Gemini Flash. Deep analyze → Claude
 * Haiku 4.5 (the cheapest current Claude model) then the quick chain.
 */
export const DEFAULT_QUANTINUM_AI_CONFIG: QuantinumAiConfig = Object.freeze({
  quick: [
    { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    { provider: 'gemini', model: 'gemini-2.5-flash' },
    { provider: 'anthropic', model: 'claude-haiku-4-5' },
  ],
  deep: [
    { provider: 'anthropic', model: 'claude-haiku-4-5' },
    { provider: 'gemini', model: 'gemini-2.5-flash' },
    { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  ],
  updatedAt: null,
  updatedBy: null,
}) as QuantinumAiConfig;

const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{1,79}$/;

/** Validates an admin config patch. Unknown providers / malformed models are refused, not dropped. */
export function parseQuantinumAiConfig(x: unknown): { ok: true; config: Pick<QuantinumAiConfig, 'quick' | 'deep'> } | { ok: false; error: string } {
  if (!x || typeof x !== 'object') return { ok: false, error: 'config must be an object' };
  const out: Partial<Record<AskMode, ProviderStep[]>> = {};
  for (const mode of ['quick', 'deep'] as const) {
    const chain = (x as any)[mode];
    if (!Array.isArray(chain) || chain.length < 1 || chain.length > 5) return { ok: false, error: `${mode}: 1–5 steps required` };
    const steps: ProviderStep[] = [];
    for (const s of chain) {
      const provider = String(s?.provider ?? '');
      const model = String(s?.model ?? '').trim();
      if (!(QUANTINUM_PROVIDERS as readonly string[]).includes(provider)) return { ok: false, error: `${mode}: unknown provider "${provider}"` };
      if (!MODEL_RE.test(model)) return { ok: false, error: `${mode}: bad model id "${model}"` };
      steps.push({ provider: provider as QuantinumProviderId, model });
    }
    out[mode] = steps;
  }
  return { ok: true, config: { quick: out.quick!, deep: out.deep! } };
}

/** USD per 1M tokens [input, output]. Free tiers are still priced at paid rates so the cap is conservative. */
export const MODEL_PRICING_USD_PER_MTOK: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  'llama-3.3-70b-versatile': [0.59, 0.79],
  'llama-3.1-8b-instant': [0.05, 0.08],
  'gemini-2.5-flash': [0.30, 2.50],
  'gemini-2.5-flash-lite': [0.10, 0.40],
  'claude-haiku-4-5': [1.00, 5.00],
  'claude-sonnet-5-5': [2.00, 10.00],
  'gpt-4o-mini': [0.15, 0.60],
});
/** Unknown model → priced high on purpose. */
export const UNKNOWN_MODEL_PRICING: readonly [number, number] = [5, 25];

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [pin, pout] = MODEL_PRICING_USD_PER_MTOK[model] ?? UNKNOWN_MODEL_PRICING;
  const i = Math.max(0, Number(inputTokens) || 0), o = Math.max(0, Number(outputTokens) || 0);
  return (i * pin + o * pout) / 1_000_000;
}

/** Rough token estimate for text we have not sent yet (≈4 chars/token, rounded up). */
export const estimateTokens = (text: string): number => Math.ceil(String(text ?? '').length / 4);

export const MAX_OUTPUT_TOKENS: Record<AskMode, number> = { quick: 700, deep: 1500 };

// ─── What a question is about ────────────────────────────────

export const ASK_TARGET_KINDS = ['page', 'ticker', 'setup', 'flow', 'gex', 'zerodte', 'journal'] as const;
export type AskTargetKind = (typeof ASK_TARGET_KINDS)[number];

/**
 * What the opener sends. Only identifiers and a few displayed numbers — the
 * server rebuilds every fact from its own data. `row` values are what the row
 * showed (strike, premium …), kept as numbers/short enums and labelled
 * "as displayed" in the pack; they never carry free text to the model.
 */
export interface AskTarget {
  kind: AskTargetKind;
  symbol?: string | null;
  /** Trade-idea id for kind 'setup'. */
  id?: string | null;
  /** Page path for kind 'page' (e.g. "/t?tab=gex"). */
  page?: string | null;
  /** Short label the chip shows ("NVDA 140C 10/17"). Display only, never sent to a model. */
  label?: string | null;
  row?: Record<string, number | string | null> | null;
}

export const SYMBOL_RE = /^[A-Z][A-Z0-9.^-]{0,9}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ROW_KEYS = new Set([
  'strike', 'expiry', 'optionType', 'premium', 'size', 'price', 'side', 'kind',
  'level', 'levelType', 'entry', 'exit', 'stop', 'target', 'pnl', 'pnlPct', 'rMultiple', 'direction',
  'openedAt', 'closedAt', 'status', 'delta', 'iv', 'bid', 'ask', 'spot', 'contracts',
]);
const ROW_TEXT_RE = /^[A-Za-z0-9 ._:+\/-]{0,24}$/;

export function normalizeSymbol(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toUpperCase();
  return SYMBOL_RE.test(s) ? s : null;
}

/** Strict parse of the client's target. Anything outside the schema is dropped. */
export function parseAskTarget(x: unknown): AskTarget {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const kind = (ASK_TARGET_KINDS as readonly string[]).includes(String(o.kind)) ? (o.kind as AskTargetKind) : 'page';
  const symbol = normalizeSymbol(o.symbol);
  const id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : null;
  const page = typeof o.page === 'string' && /^\/[A-Za-z0-9\/_?=&.-]{0,120}$/.test(o.page) ? o.page : null;
  const label = typeof o.label === 'string' ? o.label.replace(/[^\w .:+\/$%-]/g, '').slice(0, 60) : null;
  let row: AskTarget['row'] = null;
  if (o.row && typeof o.row === 'object') {
    row = {};
    for (const [k, v] of Object.entries(o.row as Record<string, unknown>)) {
      if (!ROW_KEYS.has(k)) continue;
      if (typeof v === 'number' && Number.isFinite(v)) row[k] = v;
      else if (typeof v === 'string' && ROW_TEXT_RE.test(v)) row[k] = v;
      else if (v == null) row[k] = null;
    }
    if (!Object.keys(row).length) row = null;
  }
  return { kind, symbol, id, page, label, row };
}

// ─── The context pack ────────────────────────────────────────

export interface PackField {
  /** Stable key the model cites, e.g. "quote.last". */
  key: string;
  /** Human label for the source chip. */
  label: string;
  value: unknown;
  /** Where it came from (endpoint / engine). */
  source: string;
  asOf?: string | null;
}
export interface ContextPack {
  generatedAt: string;
  target: AskTarget;
  fields: PackField[];
  /** What we looked for and did not have — the model must say "not in the data". */
  missing: string[];
}

/** Pull the pack keys the answer cited as [[key]] (or [key]) — only keys that exist in the pack. */
export function extractCitations(answer: string, pack: Pick<ContextPack, 'fields'>): PackField[] {
  const byKey = new Map(pack.fields.map((f) => [f.key, f]));
  const seen = new Set<string>();
  const out: PackField[] = [];
  const re = /\[\[?([a-z][a-zA-Z0-9_.-]{1,60})\]?\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(answer ?? '')))) {
    const k = m[1];
    if (byKey.has(k) && !seen.has(k)) { seen.add(k); out.push(byKey.get(k)!); }
  }
  return out;
}

/** Remove the cite markers for display (chips render them instead). */
export function stripCitationMarkers(answer: string): string {
  return String(answer ?? '').replace(/\s?\[\[[a-z][a-zA-Z0-9_.-]{1,60}\]\]/g, '');
}

// ─── Privacy ─────────────────────────────────────────────────

/** Strip email addresses and phone-number-like runs from text before it leaves for a provider. */
export function redactPii(text: string): string {
  return String(text ?? '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email removed]')
    .replace(/(?<![\d.$])(?:\+?\d[\s().-]?){9,14}\d(?![\d.%])/g, '[number removed]');
}

// ─── Usage log ───────────────────────────────────────────────

export interface UsageEntry {
  at: string;
  /** ET day key YYYY-MM-DD the quota counts against. */
  day: string;
  userKey: string;
  tier: string;
  mode: AskMode;
  targetKind: AskTargetKind;
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ok: boolean;
  /** quota | cost_cap | provider_error | disabled … when not ok. */
  error?: string | null;
  fallbacks: number;
  latencyMs: number;
}
