/**
 * The ledger-audit 2026-10-15 cases (research/ledger-audit-2026-10-15/REPORT.md) run
 * through the pure verifier core (research/verify-option-core.ts) exactly as
 * research/verify-nexus-book.ts verifyOption runs them — from REAL prod rows and
 * Alpaca 1-min bars frozen in scripts/fixtures/ledger-audit-2026-10-15.json
 * (read-only extraction). Shared by the tests; no I/O beyond reading the fixture.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readPlanSnapshot } from '../../shared/plan-snapshot';
import { premiumPlanFor, readPremiumPlan } from '../../shared/premium-outcome';
import {
  entryCheck, exitCheck, exitPremiumAt, fillVerdict, firstBarrier, orderCheck, premiumGoverned,
  type EntryCheck, type ExitCheck, type FillVerdict, type OBar, type OrderCheck,
} from '../../research/verify-option-core';

export interface FixtureIdea {
  id: string; symbol: string; asset_type: string; direction: string; entry_price: number; target_price: number | null; stop_loss: number | null;
  risk_reward_ratio: number | null; option_type: string | null; strike_price: number | null; expiry_date: string | null; entry_premium: number | null;
  exit_premium: number | null; option_percent_gain: number | null; exit_price: number | null; percent_gain: number | null; outcome_status: string | null;
  resolution_reason: string | null; exit_date: string | null; timestamp: string; source: string | null; data_source_used: string | null; session_context: string | null;
  exit_time_source: string | null; execution_state: string | null; trigger_observed_at: string | null; plan_snapshot: unknown; premium_plan: unknown;
}
export interface FixtureCase { idea: FixtureIdea; occ: string; optionBars: OBar[]; underlyingBars: OBar[] }
export interface Fixture { generatedAt: string; cases: Record<string, FixtureCase>; neverTriggered: FixtureIdea[] }

export function loadLedgerAuditFixture(): Fixture {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'fixtures', 'ledger-audit-2026-10-15.json'), 'utf8'));
}

const ET = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function etParts(ms: number) { const p = Object.fromEntries(ET.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) }; }
const rth = (b: OBar) => { const m = etParts(b.t).min; return m >= 570 && m < 960; };
function nyWall(day: string, minute: number): number {
  for (const off of [4, 5]) { const ms = Date.parse(`${day}T00:00:00Z`) + (minute + off * 60) * 60_000; const e = etParts(ms); if (e.day === day && e.min === minute) return ms; }
  return Date.parse(`${day}T00:00:00Z`) + (minute + 4 * 60) * 60_000;
}

export interface CaseRun { entry: EntryCheck; order: OrderCheck; exit: ExitCheck; verdict: FillVerdict; recomputedPnL: number | null; trigMs: number }

/** verifyOption's decision path on a fixture case (settlement = last RTH underlying close ≤ 16:00 ET). */
export function runCase(c: FixtureCase): CaseRun {
  const i = c.idea;
  const cs = { planSnapshot: i.plan_snapshot ?? undefined, premiumPlan: i.premium_plan ?? undefined };
  const snap = readPlanSnapshot(cs);
  const long = (snap?.direction ?? i.direction) !== 'short';
  const pubMs = Date.parse(i.timestamp);
  const day = String(i.expiry_date).slice(0, 10);
  const expiryCloseMs = nyWall(day, 960);
  const exitMs = Math.min(i.exit_date ? Date.parse(i.exit_date) : expiryCloseMs, expiryCloseMs);
  const trigMs = i.trigger_observed_at ? Date.parse(i.trigger_observed_at) : pubMs;
  const bars = c.optionBars.filter((b) => b.t <= expiryCloseMs);
  const ub = c.underlyingBars.filter(rth);
  const recEntry = Number(i.entry_premium);
  const entry = entryCheck(bars, { pubMs, trigMs, exitMs, recorded: recEntry });
  const stored = readPremiumPlan(cs);
  const governing = premiumGoverned({ hasStoredPremiumPlan: !!stored, resolutionReason: i.resolution_reason }) ? 'premium' : 'underlying';
  const plan = stored ?? (governing === 'premium'
    ? premiumPlanFor({ assetType: 'option', direction: long ? 'long' : 'short', entryPrice: snap?.entryPrice ?? i.entry_price, targetPrice: snap?.targetPrice ?? i.target_price, stopLoss: snap?.stopLoss ?? i.stop_loss, entryPremium: recEntry, convergenceSignalsJson: cs }, { zeroDte: day === etParts(pubMs).day })
    : null);
  const toMs = Math.min(expiryCloseMs, exitMs + (i.exit_time_source === 'live' ? 15 * 60_000 : 60_000));
  const u = ub.length ? firstBarrier(ub, { long, stop: snap?.stopLoss ?? i.stop_loss, target: snap?.targetPrice ?? i.target_price, fromMs: trigMs, toMs, basis: 'underlying' }) : null;
  const p = plan && bars.length ? firstBarrier(bars, { long: true, stop: plan.stop, target: plan.t1, fromMs: trigMs, toMs, basis: 'premium' }) : null;
  const order = orderCheck({ recordedStatus: i.outcome_status, governing, underlying: u, premium: p });
  let computed = order.first && order.first.kind !== 'none' ? exitPremiumAt(order.first, bars) : null;
  let settlement: number | null = null;
  if (!computed && Math.abs(exitMs - expiryCloseMs) < 3600_000) {
    const last = [...ub].reverse().find((b) => b.t < expiryCloseMs);
    if (last) {
      const K = Number(i.strike_price);
      settlement = Math.round((String(i.option_type).toLowerCase().startsWith('c') ? Math.max(0, last.c - K) : Math.max(0, K - last.c)) * 100) / 100;
      computed = { px: settlement, at: expiryCloseMs, basis: 'settlement' };
    }
  } else if (!computed) {
    const xb = [...bars].reverse().find((b) => b.t <= exitMs && exitMs - b.t <= 10 * 60_000);
    if (xb) computed = { px: xb.c, at: xb.t, basis: 'time exit' };
  }
  const exit = exitCheck(bars, { recorded: i.exit_premium, eventMs: computed?.at ?? null, recordedExitMs: exitMs, computed: computed?.px ?? null, settlement });
  const verdict = fillVerdict(entry, order, exit, settlement != null);
  const recomputedPnL = entry.entry != null && exit.exit != null ? Math.round((exit.exit - entry.entry) * 100 * 100) / 100 : null;
  return { entry, order, exit, verdict, recomputedPnL, trigMs };
}
