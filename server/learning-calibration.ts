/**
 * LEARNING CALIBRATION — the approved config, read by publishing code.
 * ===================================================================
 * .cache/shared/calibration.json (versioned; written ONLY by an admin Approve /
 * Rollback on /admin/learning, or the nightly auto-rollback). Every read is
 * behind LEARNING_LOOP_APPLY (default OFF): with the flag off this module returns
 * null and changes nothing, whatever the file says.
 *
 * Consumers:
 *   · DatabaseStorage.createTradeIdea → learningPublishGate(): engine mutes,
 *     time-bucket mutes, contract |delta| / DTE bands for NEW automated ideas.
 *   · appliedCalibration() exposes grade weights/floor, stop/T1 ATR and exit
 *     policy for modules that adopt them; none consumes those fields yet — the
 *     admin page says so beside an approved config that changes them.
 */
import { etMinuteOf, todBucket, calendarDteAt } from '@shared/learning-ledger';
import { activeCalibration, type CalibrationFile, type CalibrationVersion } from '@shared/learning-loop';
import { readShared } from './lib/shared-state';

export const CALIBRATION_NAME = 'calibration';
const off = (v: string | undefined) => !/^(1|true|on|yes)$/i.test(String(v ?? '').trim());
export const learningApplyEnabled = (env: Record<string, string | undefined> = process.env) => !off(env.LEARNING_LOOP_APPLY);

export function readCalibrationFile(): CalibrationFile | null {
  const r = readShared<CalibrationFile>(CALIBRATION_NAME);
  return r?.data && r.data.v === 'calibration-v1' ? r.data : null;
}
/** The active approved config — null unless LEARNING_LOOP_APPLY is on and a version is active. */
export function appliedCalibration(env: Record<string, string | undefined> = process.env): CalibrationVersion | null {
  if (!learningApplyEnabled(env)) return null;
  return activeCalibration(readCalibrationFile());
}

/** Pure gate (exported for tests): refusal reason or null. */
export function calibrationGateFor(
  cal: CalibrationVersion | null,
  idea: { source?: string | null; assetType?: string | null; expiryDate?: string | null; optionDelta?: number | null },
  nowMs: number,
): string | null {
  if (!cal) return null;
  const c = cal.config;
  const src = String(idea.source ?? '').toLowerCase();
  if (c.muteEngines.map((e) => e.toLowerCase()).includes(src)) return `learning calibration v${cal.version}: engine ${src} muted`;
  const tod = todBucket(etMinuteOf(nowMs));
  if (tod && c.muteTod.includes(tod)) return `learning calibration v${cal.version}: ${tod} time bucket muted`;
  if (String(idea.assetType ?? '') === 'option') {
    if (c.dteBand) {
      const dte = calendarDteAt(idea.expiryDate, nowMs);
      if (dte == null || dte < c.dteBand[0] || dte > c.dteBand[1]) return `learning calibration v${cal.version}: DTE ${dte ?? '?'} outside ${c.dteBand[0]}–${c.dteBand[1]}`;
    }
    if (c.deltaBand && idea.optionDelta != null && Number.isFinite(Number(idea.optionDelta))) {
      const d = Math.abs(Number(idea.optionDelta));
      if (d < c.deltaBand[0] || d > c.deltaBand[1]) return `learning calibration v${cal.version}: |Δ| ${d.toFixed(2)} outside ${c.deltaBand[0]}–${c.deltaBand[1]}`;
    }
  }
  return null;
}

export function learningPublishGate(idea: Parameters<typeof calibrationGateFor>[1], nowMs = Date.now()): string | null {
  return calibrationGateFor(appliedCalibration(), idea, nowMs);
}
