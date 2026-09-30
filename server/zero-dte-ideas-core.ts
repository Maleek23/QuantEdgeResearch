/**
 * 0DTE IDEAS — pure core (no I/O). Turns the desk's per-name reads into
 * ACTIONABLE ideas: ticker · calls/puts · exact contract · premium zone ·
 * underlying trigger · stop (underlying + premium) · targets · deadline · why
 * · structure grade · stage. The producer (server/zero-dte-desk.ts) fetches;
 * this file decides. Tested with synthetic fixtures in
 * scripts/test-zero-dte-desk.ts (§8).
 *
 *   zeroDteEligibility   the nearest listed expiry is usable only when it is
 *                        ≤ 2 calendar days out; otherwise the name is "no 0DTE
 *                        today" and produces no idea (never a 1-week contract
 *                        dressed up as a scalp).
 *   watchSetups          WATCH-stage ideas: a policy A/B setup that is FORMING —
 *                        a measured level within reach of price in a regime that
 *                        has a rule, with the trigger, stop and target the
 *                        policy would use. Same levels, windows, stop buffer and
 *                        1.5R floor as server/zero-dte-policies.ts, so a WATCH
 *                        idea is the policy's own trigger seen early. Names the
 *                        operator's setups: ORB break (OR30), zero-γ cross, wall
 *                        break, PDH/PDL and HOD/LOD break (−γ, policy A), wall
 *                        fade / reject and the power-hour pin to max-γ (+γ, B).
 *                        VWAP is a side-of-mean condition inside the trigger,
 *                        never a trigger on its own (2026-09-24 validation:
 *                        intraday VWAP tags were among the worst predictors).
 *   pickIdeaContract     the exact contract on that expiry: spread ≤ 15%,
 *                        OI ≥ 100, mid ≥ $0.20, chain delta 0.20–0.65 (a
 *                        missing delta is never guessed), sized so the planned
 *                        premium loss stays inside the $ risk cap and the
 *                        debit inside the debit cap. Premium stop / target
 *                        are delta-only estimates (no gamma), capped at the
 *                        −50% premium stop — labelled as estimates.
 *   ideaStage            TRIGGERED (enter-now window) → IN PLAY → DONE
 *                        (target / stop / 15:55 time stop), from the logged
 *                        idea + the live underlying.
 *   sortIdeas            triggered first, then in play, then closest to trigger.
 *
 * Honesty: every idea is a model idea from an UNVALIDATED policy family
 * (walk-forward law: a short-window win is a regime artefact until proven).
 * The grade is a structure count, not a probability.
 */
import type { DeskChainRow, DeskExpiry, SessionPhase } from './zero-dte-desk-core';
import { POLICY_WINDOWS, POWER_HOUR_START, TIME_STOP_ET, type ZeroDteSetup } from './zero-dte-policies';

// ─── config ──────────────────────────────────────────────────────────────

/** A name trades "0DTE" only when its nearest expiry is at most this many calendar days out. */
export const MAX_IDEA_DTE = 2;
export const STOP_BUFFER = 0.001;          // policies: 0.10% beyond the level
export const MIN_RR = 1.5;                 // policies: R:R floor
export const ENTRY_WINDOW_MIN = 10;        // a triggered idea is "enter now" for 10 min (entryValidUntil)
export const LIQ = { maxSpreadPct: 0.15, minOi: 100, minMid: 0.20, minDelta: 0.20, maxDelta: 0.65, idealDelta: 0.40, maxQty: 10 } as const;
export const PREMIUM_STOP_FRACTION = 0.5;  // hard premium stop −50%

const f2 = (x: number) => x.toFixed(2);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// ─── expiry eligibility ──────────────────────────────────────────────────

export interface Eligibility { ok: boolean; dte: number | null; label: string; reason: string | null }

export function zeroDteEligibility(ex: DeskExpiry): Eligibility {
  if (!ex.expiry || ex.calendarDays == null) return { ok: false, dte: null, label: 'no listed expiry', reason: 'no listed expiry in the chain' };
  const d = ex.calendarDays;
  if (ex.sameDay) return { ok: true, dte: 0, label: '0DTE', reason: null };
  const wd = ex.label.replace(/^nearest:\s*/, '').replace(/\s*\(.*$/, '');
  if (d > MAX_IDEA_DTE) return { ok: false, dte: d, label: `no 0DTE today — nearest ${wd} (${d}d)`, reason: `nearest listed expiry ${ex.expiry} is ${d} calendar days out (> ${MAX_IDEA_DTE}); no idea is produced` };
  return { ok: true, dte: d, label: `${d}DTE — nearest ${wd}, held intraday`, reason: null };
}

// ─── setup kinds ─────────────────────────────────────────────────────────

export type SetupKind = 'orb_break' | 'zero_gamma_cross' | 'wall_break' | 'pdh_pdl_break' | 'hod_lod_break' | 'wall_fade' | 'power_hour_pin';
export const KIND_LABEL: Record<SetupKind, string> = {
  orb_break: 'ORB break', zero_gamma_cross: 'Zero-γ cross', wall_break: 'Wall break', pdh_pdl_break: 'PDH/PDL break',
  hod_lod_break: 'HOD/LOD break', wall_fade: 'Wall reject (fade)', power_hour_pin: 'Power-hour pin → max-γ',
};

export function kindForLevel(policy: 'A' | 'B', levelName: string, targetName?: string | null): SetupKind {
  if (policy === 'B') return targetName && /max-γ/.test(targetName) ? 'power_hour_pin' : 'wall_fade';
  if (/OR30/.test(levelName)) return 'orb_break';
  if (/zero-γ/.test(levelName)) return 'zero_gamma_cross';
  if (/wall/.test(levelName)) return 'wall_break';
  if (/HOD|LOD/.test(levelName)) return 'hod_lod_break';
  return 'pdh_pdl_break';
}

/** The kind of a FIRED policy setup (for the triggered idea). */
export function kindForSetup(s: ZeroDteSetup): SetupKind {
  return kindForLevel(s.policy.startsWith('A') ? 'A' : 'B', s.trigger.name, s.targetLevel.name);
}

// ─── WATCH setups ────────────────────────────────────────────────────────

export interface Lv { name: string; price: number }

export interface WatchInput {
  symbol: string;
  phase: SessionPhase;
  /** Last closed 5-min close (the price the policies read). */
  price: number;
  /** Dealer sign the policies read (all-expiry snapshot at spot). */
  sign: 'positive' | 'negative' | 'neutral';
  vwap: number | null;
  levels: {
    zeroGamma?: number | null; callWall?: number | null; putWall?: number | null;
    or30High?: number | null; or30Low?: number | null; pdh?: number | null; pdl?: number | null;
    hod?: number | null; lod?: number | null;
    zCallWall?: number | null; zPutWall?: number | null; zMaxGamma?: number | null;
  };
  /** Same per-name risk cap (%) the policy uses. */
  maxRiskPct: number;
  /** Today's expected move as % of spot (scales how near "forming" is). */
  emTodayPct: number | null;
  flowLean: 'long' | 'short' | 'flat' | null;
}

export interface WatchSetup {
  key: string;
  symbol: string;
  policy: 'A' | 'B';
  kind: SetupKind;
  direction: 'long' | 'short';
  trigger: Lv;
  triggerText: string;
  /** Estimated underlying entry when the trigger prints (0.10% beyond the level for A, back inside the wall for B). */
  entry: number;
  stop: number;
  target: Lv;
  target2: Lv | null;
  rr: number;
  /** Distance from price to the trigger level, % of price. */
  distPct: number;
  entryBy: string;    // HH:MM ET — last minute the policy can still fire
  exitBy: string;     // HH:MM ET — the hard time stop
  why: string;
  grade: 'A' | 'B' | 'C';
  gradeWhy: string[];
}

/** How close a level must be to count as forming: 0.3 × today's expected move, clamped to 0.30–1.00% of price. */
export function formingProximityPct(emTodayPct: number | null): number {
  return Math.min(1, Math.max(0.3, (emTodayPct ?? 0) * 0.3));
}

const pos = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n > 0;
const L = (name: string, p: number | null | undefined): Lv | null => (pos(p) ? { name, price: p } : null);

function gradeOf(dir: 'long' | 'short', trig: Lv, all: Lv[], rr: number, flowLean: WatchInput['flowLean']): { grade: 'A' | 'B' | 'C'; why: string[] } {
  const why: string[] = [];
  let pts = 0;
  if (flowLean === dir) { pts++; why.push(`flow leans ${dir}`); } else if (flowLean && flowLean !== 'flat') why.push(`flow leans ${flowLean} (against)`);
  const confl = all.filter((x) => x.name !== trig.name && Math.abs(x.price - trig.price) / trig.price <= 0.001);
  if (confl.length || /0DTE/.test(trig.name)) { pts++; why.push(confl.length ? `confluence with ${confl.map((c) => c.name).join(', ')}` : 'same-day-expiry level'); }
  if (rr >= 2) { pts++; why.push(`${rr.toFixed(1)}R to the first measured level`); }
  return { grade: pts >= 3 ? 'A' : pts === 2 ? 'B' : 'C', why };
}

export function watchSetups(i: WatchInput): { setups: WatchSetup[]; notes: string[] } {
  const notes: string[] = [];
  const { phase, price } = i;
  if (!pos(price)) return { setups: [], notes: ['no price'] };
  if (!phase.entriesOpen) return { setups: [], notes: [`no new 0DTE entries outside ${hhmm(POLICY_WINDOWS.entry.start)}–${hhmm(POLICY_WINDOWS.entry.end)} ET`] };
  if (i.sign === 'neutral') return { setups: [], notes: ['neutral gamma — no dealer footprint, no rule (policy C)'] };
  const prox = formingProximityPct(i.emTodayPct);
  const lv = i.levels;
  const powerHour = phase.etMin >= POWER_HOUR_START;
  const all = [
    L('zero-γ', lv.zeroGamma), L('call wall', lv.callWall), L('put wall', lv.putWall), L('OR30 high', lv.or30High), L('OR30 low', lv.or30Low),
    L('PDH', lv.pdh), L('PDL', lv.pdl), L('0DTE call wall', lv.zCallWall), L('0DTE put wall', lv.zPutWall), L('0DTE max-γ', lv.zMaxGamma),
  ].filter((x): x is Lv => !!x);
  const out: WatchSetup[] = [];
  const exitBy = TIME_STOP_ET;

  if (i.sign === 'negative') {
    if (!phase.policies.A) return { setups: [], notes: ['A (−γ continuation) is outside its window'] };
    const up = [L('zero-γ', lv.zeroGamma), L('call wall', lv.callWall), L('OR30 high', lv.or30High), L('PDH', lv.pdh), powerHour ? L('HOD', lv.hod) : null, L('0DTE call wall', lv.zCallWall)].filter((x): x is Lv => !!x);
    const dn = [L('zero-γ', lv.zeroGamma), L('put wall', lv.putWall), L('OR30 low', lv.or30Low), L('PDL', lv.pdl), powerHour ? L('LOD', lv.lod) : null, L('0DTE put wall', lv.zPutWall)].filter((x): x is Lv => !!x);
    for (const dir of ['long', 'short'] as const) {
      const pool = dir === 'long' ? up : dn;
      // Unbroken level on the far side, within reach (a level price is already beyond by > 0.1% is the policy's job, not a forming setup).
      const cands = pool.filter((x) => (dir === 'long' ? x.price >= price * 0.999 : x.price <= price * 1.001) && Math.abs(x.price - price) / price * 100 <= prox)
        .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
      const trig = cands[0];
      if (!trig) continue;
      const entry = dir === 'long' ? trig.price * (1 + STOP_BUFFER) : trig.price * (1 - STOP_BUFFER);
      const stop = dir === 'long' ? trig.price * (1 - STOP_BUFFER) : trig.price * (1 + STOP_BUFFER);
      const risk = Math.abs(entry - stop);
      if (risk / entry * 100 > i.maxRiskPct) { notes.push(`A ${dir}: risk ${(risk / entry * 100).toFixed(2)}% > cap ${i.maxRiskPct.toFixed(2)}%`); continue; }
      const tpool = (dir === 'long'
        ? [L('call wall', lv.callWall), L('PDH', lv.pdh), L('OR30 high', lv.or30High), L('zero-γ', lv.zeroGamma), L('0DTE call wall', lv.zCallWall)]
        : [L('put wall', lv.putWall), L('PDL', lv.pdl), L('OR30 low', lv.or30Low), L('zero-γ', lv.zeroGamma), L('0DTE put wall', lv.zPutWall)])
        .filter((x): x is Lv => !!x && (dir === 'long' ? x.price > entry * 1.0005 : x.price < entry * 0.9995))
        .sort((a, b) => Math.abs(a.price - entry) - Math.abs(b.price - entry));
      const tIdx = tpool.findIndex((x) => Math.abs(x.price - entry) / risk >= MIN_RR);
      if (tIdx < 0) { notes.push(`A ${dir} at ${trig.name} $${f2(trig.price)}: no measured level ${dir === 'long' ? 'above' : 'below'} at ≥ ${MIN_RR}R`); continue; }
      const target = tpool[tIdx];
      const target2 = tpool.slice(tIdx + 1).find((x) => Math.abs(x.price - target.price) / target.price > 0.0005) ?? null;
      const rr = Math.abs(target.price - entry) / risk;
      const needVwap = i.vwap != null && (dir === 'long' ? trig.price <= i.vwap : trig.price >= i.vwap);
      const kind = kindForLevel('A', trig.name);
      const g = gradeOf(dir, trig, all, rr, i.flowLean);
      out.push({
        key: `${i.symbol}|A|${dir}|${trig.name}`, symbol: i.symbol, policy: 'A', kind, direction: dir, trigger: trig,
        triggerText: `two 5-min closes ${dir === 'long' ? 'above' : 'below'} $${f2(trig.price)} (${trig.name})${needVwap ? ` and ${dir === 'long' ? 'above' : 'below'} VWAP $${f2(i.vwap!)}` : ''}`,
        entry, stop, target, target2, rr, distPct: Math.abs(trig.price - price) / price * 100,
        entryBy: hhmm(POLICY_WINDOWS.A[0].end), exitBy,
        why: `−γ (dealers amplify): a held break of ${trig.name} runs to ${target.name} $${f2(target.price)}${i.vwap != null ? ` · VWAP $${f2(i.vwap)}` : ''}`,
        grade: g.grade, gradeWhy: g.why,
      });
    }
    if (!out.length && !notes.length) notes.push(`A: no measured level within ${prox.toFixed(2)}% of price`);
    return { setups: out, notes };
  }

  // positive gamma → policy B (wall fade · power-hour pin)
  if (!phase.policies.B) {
    return { setups: [], notes: [phase.etMin < 600 ? 'B (+γ wall fade) opens at 10:00 ET' : phase.etMin < 900 ? 'B is off 14:30–15:00 ET (pre-registered gap); the power-hour pin opens at 15:00' : 'B power-hour pin window (15:00–15:40) is over'] };
  }
  const bEnd = POLICY_WINDOWS.B.find((w) => phase.etMin >= w.start && phase.etMin <= w.end)?.end ?? POLICY_WINDOWS.B[0].end;
  const proxB = prox * (2 / 3);
  const walls: Array<{ w: Lv; dir: 'long' | 'short' }> = [];
  for (const w of [L('call wall', lv.callWall), L('0DTE call wall', lv.zCallWall)]) if (w && w.price >= price * 0.9995 && (w.price - price) / price * 100 <= proxB) walls.push({ w, dir: 'short' });
  for (const w of [L('put wall', lv.putWall), L('0DTE put wall', lv.zPutWall)]) if (w && w.price <= price * 1.0005 && (price - w.price) / price * 100 <= proxB) walls.push({ w, dir: 'long' });
  const seen = new Set<string>();
  for (const { w, dir } of walls.sort((a, b) => Math.abs(a.w.price - price) - Math.abs(b.w.price - price))) {
    if (seen.has(dir)) continue;
    if (i.vwap != null && (dir === 'short' ? price <= i.vwap : price >= i.vwap)) { notes.push(`B ${dir} at ${w.name}: price not stretched ${dir === 'short' ? 'above' : 'below'} VWAP`); continue; }
    const entry = dir === 'short' ? w.price * (1 - STOP_BUFFER) : w.price * (1 + STOP_BUFFER);
    const stop = dir === 'short' ? w.price * (1 + STOP_BUFFER) : w.price * (1 - STOP_BUFFER);
    const risk = Math.abs(entry - stop);
    const tpool = [L('VWAP', i.vwap), L('zero-γ', lv.zeroGamma), powerHour ? L('0DTE max-γ', lv.zMaxGamma) : null]
      .filter((x): x is Lv => !!x && (dir === 'short' ? x.price < entry * 0.9995 : x.price > entry * 1.0005))
      .sort((a, b) => Math.abs(a.price - entry) - Math.abs(b.price - entry));
    const target = tpool[0];
    if (!target) { notes.push(`B ${dir}: no VWAP / zero-γ destination`); continue; }
    const rr = Math.abs(target.price - entry) / risk;
    if (rr < MIN_RR) { notes.push(`B ${dir}: ${rr.toFixed(2)}R to ${target.name} < ${MIN_RR}`); continue; }
    const target2 = tpool[1] ?? null;
    const kind = kindForLevel('B', w.name, target.name);
    const g = gradeOf(dir, w, all, rr, i.flowLean);
    seen.add(dir);
    out.push({
      key: `${i.symbol}|B|${dir}|${w.name}`, symbol: i.symbol, policy: 'B', kind, direction: dir, trigger: w,
      triggerText: `tag $${f2(w.price)} (${w.name}), then a 5-min close back ${dir === 'short' ? 'below' : 'above'} it and ${dir === 'short' ? 'below' : 'above'} the prior close`,
      entry, stop, target, target2, rr, distPct: Math.abs(w.price - price) / price * 100,
      entryBy: hhmm(bEnd), exitBy,
      why: `+γ (dealers dampen): ${w.name} rejects back toward ${target.name} $${f2(target.price)}${powerHour && lv.zMaxGamma ? ` · 0DTE max-γ magnet $${f2(lv.zMaxGamma)}` : ''}`,
      grade: g.grade, gradeWhy: g.why,
    });
  }
  if (!out.length && !notes.length) notes.push(`B: no wall within ${proxB.toFixed(2)}% of price`);
  return { setups: out, notes };
}

// ─── the contract ────────────────────────────────────────────────────────

export interface ContractPickInput {
  rows: DeskChainRow[];
  /** OCC root for synthesised symbols (SPXW for SPX). */
  root: string;
  expiry: string;
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target: number;
  target2?: number | null;
  riskCapDollars: number;
  maxDebitDollars: number;
  multiplier?: number;
}

export interface IdeaContract {
  occ: string;
  root: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  bid: number;
  ask: number;
  mid: number;
  spreadPct: number;
  openInterest: number;
  delta: number;
  /** Estimated premium when the underlying reaches the stop (delta-only, capped at −50%). */
  premiumStop: number;
  premiumT1: number;
  premiumT2: number | null;
  /** Premium R:R = (T1 − mid) / (mid − stop). */
  premiumRR: number;
  qty: number;
  riskDollars: number;
  debitDollars: number;
  basis: string;
}

export function occSymbol(root: string, expiry: string, type: 'call' | 'put', strike: number): string {
  const [y, m, d] = expiry.split('-');
  return `${root}${y.slice(2)}${m}${d}${type === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}

export function pickIdeaContract(i: ContractPickInput): { contract: IdeaContract | null; reason: string | null; considered: number } {
  const type: 'call' | 'put' = i.direction === 'long' ? 'call' : 'put';
  const mult = i.multiplier ?? 100;
  const stopDist = Math.abs(i.entry - i.stop);
  const t1Dist = Math.abs(i.target - i.entry);
  const t2Dist = i.target2 != null ? Math.abs(i.target2 - i.entry) : null;
  const rows = i.rows.filter((r) => r.expiration_date === i.expiry && r.option_type === type && r.strike > 0);
  const miss = { quote: 0, spread: 0, oi: 0, mid: 0, delta: 0, risk: 0, rr: 0 };
  const cands: IdeaContract[] = [];
  for (const r of rows) {
    const bid = Number(r.bid); const ask = Number(r.ask);
    if (!(bid > 0 && ask >= bid)) { miss.quote++; continue; }
    const mid = (bid + ask) / 2;
    if (mid < LIQ.minMid) { miss.mid++; continue; }
    const spreadPct = (ask - bid) / mid;
    if (spreadPct > LIQ.maxSpreadPct) { miss.spread++; continue; }
    const oi = Number(r.open_interest ?? 0);
    if (!(oi >= LIQ.minOi)) { miss.oi++; continue; }
    const d = Math.abs(Number(r.greeks?.delta ?? 0));
    if (!(d >= LIQ.minDelta && d <= LIQ.maxDelta)) { miss.delta++; continue; } // CBOE sends 0 for unknown — never guessed
    const loss = Math.min(mid * PREMIUM_STOP_FRACTION, d * stopDist);
    const premiumStop = mid - loss;
    const premiumT1 = mid + d * t1Dist;
    const premiumRR = loss > 0 ? (premiumT1 - mid) / loss : 0;
    if (premiumRR < 1) { miss.rr++; continue; }
    const riskPer = loss * mult;
    const qty = Math.min(LIQ.maxQty, Math.floor(i.riskCapDollars / riskPer), Math.floor(i.maxDebitDollars / (mid * mult)));
    if (!(qty >= 1)) { miss.risk++; continue; }
    cands.push({
      occ: r.symbol && /\d{6}[CP]\d{8}$/.test(r.symbol) ? r.symbol.replace(/^O:/, '') : occSymbol(i.root, i.expiry, type, r.strike),
      root: i.root, optionType: type, strike: r.strike, expiry: i.expiry, bid, ask, mid, spreadPct, openInterest: oi, delta: d,
      premiumStop, premiumT1, premiumT2: t2Dist != null ? mid + d * t2Dist : null, premiumRR,
      qty, riskDollars: qty * riskPer, debitDollars: qty * mid * mult,
      basis: `Δ ${d.toFixed(2)} from the chain; premium stop/target = mid ∓ Δ × underlying distance (no gamma — estimate), loss capped at −${PREMIUM_STOP_FRACTION * 100}%`,
    });
  }
  if (!cands.length) {
    const why = Object.entries(miss).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${({ quote: 'no two-sided quote', spread: `spread > ${LIQ.maxSpreadPct * 100}%`, oi: `OI < ${LIQ.minOi}`, mid: `mid < $${LIQ.minMid.toFixed(2)}`, delta: `Δ outside ${LIQ.minDelta}–${LIQ.maxDelta} (or unknown)`, risk: `over the $${Math.round(i.riskCapDollars)} risk / $${Math.round(i.maxDebitDollars)} debit cap`, rr: 'premium R:R < 1' } as Record<string, string>)[k]}`);
    return { contract: null, considered: rows.length, reason: rows.length ? `no ${type} on ${i.expiry} passes the gates (${why.join(' · ')})` : `no ${type}s listed on ${i.expiry}` };
  }
  cands.sort((a, b) => Math.abs(a.delta - LIQ.idealDelta) - Math.abs(b.delta - LIQ.idealDelta) || a.spreadPct - b.spreadPct || b.openInterest - a.openInterest);
  return { contract: cands[0], reason: null, considered: rows.length };
}

// ─── $ caps per name ─────────────────────────────────────────────────────

/**
 * One $ risk budget per trade (ZERO_DTE_RISK_BUDGET, else INDEX_0DTE_RISK_BUDGET,
 * default $200), overridable per name with ZERO_DTE_RISK_<SYM>. Each name's
 * quantity is sized to it from that name's own per-contract risk, and the
 * underlying stop is capped by the name's own expected move (policy maxRiskPct).
 * Debit cap: ZERO_DTE_MAX_DEBIT, else INDEX_0DTE_MAX_DEBIT, else 2× the risk cap
 * (a −50% premium stop on a full-cap debit spends exactly the risk budget).
 */
export function capsFor(symbol: string, env: Record<string, string | undefined> = process.env): { riskCapDollars: number; maxDebitDollars: number; basis: string } {
  const n = (v: string | undefined) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
  const own = n(env[`ZERO_DTE_RISK_${symbol.toUpperCase()}`]);
  const risk = Math.max(25, own ?? n(env.ZERO_DTE_RISK_BUDGET) ?? n(env.INDEX_0DTE_RISK_BUDGET) ?? 200);
  const debit = Math.max(25, n(env.ZERO_DTE_MAX_DEBIT) ?? n(env.INDEX_0DTE_MAX_DEBIT) ?? risk * 2);
  return { riskCapDollars: risk, maxDebitDollars: debit, basis: `$${Math.round(risk)} risk / $${Math.round(debit)} debit per trade${own ? ` (${symbol} override)` : ''}` };
}

// ─── lifecycle ───────────────────────────────────────────────────────────

export type IdeaStage = 'watch' | 'triggered' | 'in_play' | 'done';

export interface LoggedIdea {
  direction: 'long' | 'short';
  stop: number;
  target: number;
  timestamp: string;
  entryValidUntil: string | null;
  exitBy: string | null;
  outcomeStatus: string | null;
  resolutionReason?: string | null;
}

export function ideaStage(x: LoggedIdea, nowMs: number, livePrice: number | null): { stage: Exclude<IdeaStage, 'watch'>; doneReason: string | null } {
  const s = String(x.outcomeStatus ?? 'open');
  if (s !== 'open') {
    const r = s === 'hit_target' ? 'target hit' : s === 'hit_stop' ? 'stop hit' : s === 'expired' ? 'time stop / expired' : s.replace(/_/g, ' ');
    return { stage: 'done', doneReason: x.resolutionReason ? `${r} — ${x.resolutionReason}` : r };
  }
  if (x.exitBy && nowMs >= Date.parse(x.exitBy)) return { stage: 'done', doneReason: `time stop ${TIME_STOP_ET} ET (tracker resolving)` };
  if (livePrice != null && livePrice > 0) {
    const stopped = x.direction === 'long' ? livePrice <= x.stop : livePrice >= x.stop;
    const hit = x.direction === 'long' ? livePrice >= x.target : livePrice <= x.target;
    if (stopped) return { stage: 'done', doneReason: 'stop touched on the live price (tracker resolving)' };
    if (hit) return { stage: 'done', doneReason: 'target touched on the live price (tracker resolving)' };
  }
  const until = x.entryValidUntil ? Date.parse(x.entryValidUntil) : Date.parse(x.timestamp) + ENTRY_WINDOW_MIN * 60_000;
  return { stage: nowMs < until ? 'triggered' : 'in_play', doneReason: null };
}

const STAGE_ORDER: Record<IdeaStage, number> = { triggered: 0, in_play: 1, watch: 2, done: 3 };

export function sortIdeas<T extends { stage: IdeaStage; distPct: number | null; at: string }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]
    || (a.stage === 'watch' ? (a.distPct ?? 99) - (b.distPct ?? 99) : 0)
    || b.at.localeCompare(a.at));
}
