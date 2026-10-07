/** Immutable version of the trade plan captured when an idea is first saved. */
export const PLAN_SNAPSHOT_VERSION = "plan-v1" as const;

export interface PlanSnapshot {
  version: typeof PLAN_SNAPSHOT_VERSION;
  capturedAt: string;
  direction: string;
  holdingPeriod: string | null;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  entryPremium: number | null;
  optionType: string | null;
  strikePrice: number | null;
  expiryDate: string | null;
}

type PlanFields = Partial<Omit<PlanSnapshot, "version" | "capturedAt">>;

export function planRiskRewardRatio(entry: number, target: number, stop: number): number {
  const risk = Math.abs(Number(entry) - Number(stop));
  const reward = Math.abs(Number(target) - Number(entry));
  return risk > 0 && Number.isFinite(reward / risk) ? Math.round((reward / risk) * 100) / 100 : 0;
}

export function readPlanSnapshot(value: unknown): PlanSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = (value as Record<string, any>).planSnapshot;
  if (!snapshot || snapshot.version !== PLAN_SNAPSHOT_VERSION) return null;
  if (![snapshot.entryPrice, snapshot.targetPrice, snapshot.stopLoss].every((x) => Number.isFinite(Number(x)))) return null;
  return snapshot as PlanSnapshot;
}

export function capturePlanSnapshot(
  analysis: unknown,
  fields: PlanFields,
  capturedAt = new Date().toISOString(),
): Record<string, unknown> {
  const source = analysis && typeof analysis === "object" && !Array.isArray(analysis)
    ? analysis as Record<string, unknown>
    : {};
  if (readPlanSnapshot(source)) return source;
  const snapshot: PlanSnapshot = {
    version: PLAN_SNAPSHOT_VERSION,
    capturedAt,
    direction: String(fields.direction ?? "long"),
    holdingPeriod: fields.holdingPeriod ?? null,
    entryPrice: Number(fields.entryPrice ?? 0),
    targetPrice: Number(fields.targetPrice ?? 0),
    stopLoss: Number(fields.stopLoss ?? 0),
    riskRewardRatio: planRiskRewardRatio(Number(fields.entryPrice ?? 0), Number(fields.targetPrice ?? 0), Number(fields.stopLoss ?? 0)),
    entryPremium: fields.entryPremium == null ? null : Number(fields.entryPremium),
    optionType: fields.optionType ?? null,
    strikePrice: fields.strikePrice == null ? null : Number(fields.strikePrice),
    expiryDate: fields.expiryDate ?? null,
  };
  return { ...source, planSnapshot: snapshot };
}

/** Plan fields this module guards; an update touching none of them needs no snapshot read. */
export const PLAN_FIELD_KEYS = [
  "direction", "holdingPeriod", "entryPrice", "targetPrice", "stopLoss", "riskRewardRatio",
  "entryPremium", "optionType", "strikePrice", "expiryDate", "convergenceSignalsJson", "status",
] as const;

export function touchesPlan(updates: object): boolean {
  return PLAN_FIELD_KEYS.some((k) => k in updates);
}

const CONTRACT_KEYS = ["entryPremium", "optionType", "strikePrice", "expiryDate"] as const;

/**
 * Apply the frozen plan to an update. Levels (direction, hold, entry, target,
 * stop, R:R) are immutable once published. Contract terms that were NOT known
 * at publish (null in the snapshot) may be attached later — the stock→option
 * backfill does this — and are then captured into the returned snapshot; a
 * contract term that WAS published stays frozen.
 */
export function freezePlanFields<T extends object>(fields: T, snapshot: PlanSnapshot): { fields: T; snapshot: PlanSnapshot } {
  const f = fields as Record<string, any>;
  const next: PlanSnapshot = { ...snapshot };
  for (const k of CONTRACT_KEYS) {
    if (next[k] == null && f[k] != null) (next as any)[k] = k === "optionType" || k === "expiryDate" ? String(f[k]) : Number(f[k]);
  }
  const out: Record<string, any> = {
    ...f,
    direction: next.direction,
    holdingPeriod: next.holdingPeriod,
    entryPrice: next.entryPrice,
    targetPrice: next.targetPrice,
    stopLoss: next.stopLoss,
    riskRewardRatio: next.riskRewardRatio,
  };
  for (const k of CONTRACT_KEYS) if (k in f || next[k] != null) out[k] = next[k];
  return { fields: out as T, snapshot: next };
}
