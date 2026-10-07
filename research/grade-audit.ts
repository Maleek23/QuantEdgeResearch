/**
 * GRADE AUDIT — does the NEXUS grade (shared/nexus-grade.ts), or any input anyone
 * proposes for it, rank resolved ideas? READ-ONLY. docs/GRADE_AUDIT_2026-10-01.md.
 *
 * Win rate / mean R by grade decile and by every feature, split into two walk-forward
 * halves at the median publish day, and again with each half's top 5 trades removed
 * (walk-forward law: a feature counts only if both halves agree with the winners gone).
 *
 * Inputs (pick one):
 *   --study                   the 443 bar-verified ideas in research/score-v2-study-results.json
 *                             (labels: exit-rule replay rule 7, underlying R). Runs offline.
 *   --ideas <dump.json>       a psql json_agg dump of trade_ideas (SELECT below). Labels: the
 *                             outcome tracker's stored exit (post-2026-08-26 only; resolved only).
 *   (neither, DATABASE_URL)   runs the same SELECT itself inside a READ ONLY transaction.
 *
 *   npx tsx research/grade-audit.ts --study
 *   npx tsx research/grade-audit.ts --ideas .cache/grade-audit/ideas.json [--out research/grade-audit-results.json]
 *
 * Prod (operator session; SELECT only):
 *   ssh … "cd /opt/quantedge && set -a && . ./.env && set +a && psql \"$DATABASE_URL\" -At -c \"<IDEAS_SQL>\"" > .cache/grade-audit/ideas.json
 *   or on the droplet:  cd /opt/quantedge && npx tsx research/grade-audit.ts
 *
 * The grade on a historical idea is read AS OF ITS FIRST BOARD SURFACING
 * (generation_timestamp, when gen_scoring_layers was stamped): fresh = surfaced on the
 * publish day; window left from the holding window; rotation from the sector layer.
 * Stale-at-surfacing cannot be rebuilt without bars, so every resolved idea grades as
 * live & valid — the decile table therefore measures fresh / window / rotation only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { nexusGrade, rotationAligned } from '../shared/nexus-grade';
import { etDay, windowFor } from '../shared/setup-lifecycle';

export const VALID_FROM = '2026-08-26';
export const IDEAS_SQL = `select json_agg(x) from (select id, symbol, direction, source, asset_type, option_type, strike_price, expiry_date, entry_price, entry_premium, exit_premium, stop_loss, target_price, risk_reward_ratio, timestamp as ts, generation_timestamp, exit_by, gen_conviction_score, gen_scoring_layers, holding_period, outcome_status, exit_price, exit_date from trade_ideas where timestamp >= '${VALID_FROM}' and coalesce(archived,false)=false and outcome_status is not null and outcome_status <> 'open') x`;

// ── types ─────────────────────────────────────────────────────────────────
export interface AuditRow {
  id: string;
  day: string;
  half?: 'H1' | 'H2';
  R: number;
  f: Record<string, number | null>;
}

const LAYER_KINDS = ['technical', 'structure', 'regime', 'ta', 'premarket', 'gex', 'sector', 'breadth', 'compression'] as const;
/** Families counted as "confluence" in the brief's fallback (sector excluded: rotation is its own bonus). */
const CONF_FAMILIES = ['technical', 'structure', 'regime', 'ta', 'premarket', 'breadth', 'compression', 'gex'];

const num = (v: unknown): number | null => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? null : n; };
const wins = (r: number) => Math.max(-3, Math.min(5, r));

/** R:R "sane band" the brief proposed: 1.5–3.2 → 2, 1.0–1.5 or 3.2–5 → 1, else 0. */
export function rrBand(rr: number | null): number | null {
  if (rr == null) return null;
  if (rr >= 1.5 && rr <= 3.2) return 2;
  if ((rr >= 1 && rr < 1.5) || (rr > 3.2 && rr <= 5)) return 1;
  return 0;
}

export function layerSums(layers: unknown): Record<string, number> | null {
  if (!Array.isArray(layers)) return null;
  const out: Record<string, number> = {};
  for (const l of layers as Array<{ kind?: string; points?: number }>) {
    const k = String(l?.kind ?? ''); const p = Number(l?.points);
    if (k && Number.isFinite(p)) out[k] = (out[k] ?? 0) + p;
  }
  return out;
}

// ── labels from the DB (outcome tracker) ──────────────────────────────────
/**
 * Underlying R = side × (exit − entry) / |entry − stop| on the stored exit. Premium-level
 * option rows (entry far below the strike — the convictions engine's levelBasis rule)
 * use exit_premium on the premium levels. Rows with no usable exit are dropped.
 */
export function dbR(x: any): number | null {
  const entry = num(x.entry_price), stop = num(x.stop_loss);
  if (entry == null || stop == null || !(entry > 0) || entry === stop) return null;
  const strike = num(x.strike_price);
  const contract = x.option_type != null && strike != null && entry < strike * 0.5;
  const exit = contract ? num(x.exit_premium) : num(x.exit_price);
  if (exit == null || !(exit > 0)) return null;
  const side = contract ? 1 : String(x.direction).toLowerCase() === 'short' ? -1 : 1;
  return side * (exit - entry) / Math.abs(entry - stop);
}

/** The grade as of first board surfacing (generation_timestamp), live & valid assumed. */
export function gradeAtSurfacing(x: any): ReturnType<typeof nexusGrade> | null {
  const pub = Date.parse(String(x.ts ?? ''));
  if (!Number.isFinite(pub)) return null;
  const gen = Date.parse(String(x.generation_timestamp ?? ''));
  const at = Number.isFinite(gen) && gen >= pub ? gen : pub;
  const w = windowFor({
    direction: x.direction, entryPrice: x.entry_price, stopLoss: x.stop_loss, targetPrice: x.target_price,
    assetType: x.asset_type, holdingPeriod: x.holding_period, source: x.source, expiryDate: x.expiry_date, exitBy: x.exit_by,
  }, pub);
  return nexusGrade({
    lifecycle: at >= w.endMs ? 'stale' : etDay(pub) === etDay(at) ? 'fresh' : 'carried',
    publishMs: pub, windowEndsMs: w.endMs, publishedDay: etDay(pub), today: etDay(at), nowMs: at,
    layers: Array.isArray(x.gen_scoring_layers) ? x.gen_scoring_layers : null,
  });
}

export function rowFromDb(x: any): AuditRow | null {
  if (String(x.ts ?? '') < VALID_FROM) return null;
  if (!x.outcome_status || x.outcome_status === 'open') return null;
  const R = dbR(x);
  if (R == null) return null;
  const L = layerSums(x.gen_scoring_layers);
  const entry = num(x.entry_price), stop = num(x.stop_loss), target = num(x.target_price);
  const rr = num(x.risk_reward_ratio) ?? (entry != null && stop != null && target != null && entry !== stop ? Math.abs(target - entry) / Math.abs(entry - stop) : null);
  const g = gradeAtSurfacing(x);
  const f: Record<string, number | null> = {
    grade: g?.score ?? null,
    gFresh: g ? (g.factors.find((k) => k.key === 'fresh')!.points > 0 ? 1 : 0) : null,
    gWindow: g?.factors.find((k) => k.key === 'window')!.points ?? null,
    rotWith: L ? (rotationAligned(x.gen_scoring_layers) ? 1 : 0) : null,
    rotAgainst: L ? ((L.sector ?? 0) < 0 ? 1 : 0) : null,
    confFamilies: L ? CONF_FAMILIES.filter((k) => (L[k] ?? 0) > 0).length : null,
    rr, rrBand: rrBand(rr),
    old: num(x.gen_conviction_score),
    isShort: String(x.direction).toLowerCase() === 'short' ? 1 : 0,
  };
  for (const k of LAYER_KINDS) f[`L_${k}`] = L ? (L[k] ?? 0) : null;
  return { id: String(x.id), day: String(x.ts).slice(0, 10), R, f };
}

// ── labels from the score-v2 study (bar-verified replay) ──────────────────
export function rowFromStudy(r: any): AuditRow {
  const f0 = r.f ?? {};
  const scored = r.old != null;
  const conf = scored ? CONF_FAMILIES.filter((k) => (f0[`L_${k}`] ?? 0) > 0).length : null;
  const rotWith = scored ? ((f0.L_sector ?? 0) > 0 ? 1 : 0) : null;
  // At publish every idea is fresh with its whole window ahead → grade = 95 + 5 × rotation.
  const f: Record<string, number | null> = {
    grade: rotWith == null ? null : 95 + 5 * rotWith,
    rotWith,
    rotAgainst: scored ? ((f0.L_sector ?? 0) < 0 ? 1 : 0) : null,
    rotPeerAligned: f0.rotAligned ?? null,
    confFamilies: conf,
    rr: f0.rr ?? null, rrBand: rrBand(f0.rr ?? null),
    old: r.old ?? null,
    isShort: f0.isShort ?? null,
    gapAtr: f0.gapAtr ?? null, adx: f0.adx ?? null, nr7: f0.nr7 ?? null, stopAtr: f0.stopAtr ?? null,
  };
  for (const k of LAYER_KINDS) f[`L_${k}`] = scored ? (f0[`L_${k}`] ?? 0) : null;
  return { id: r.id, day: r.day, half: r.half, R: r.R, f };
}

// ── stats ─────────────────────────────────────────────────────────────────
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) out[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return out;
}
export function spearman(x: number[], y: number[]): number | null {
  if (x.length < 5) return null;
  const rx = ranks(x), ry = ranks(y);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length, my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) { n += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? n / Math.sqrt(dx * dy) : null;
}
interface Cell { n: number; win: number | null; R: number | null }
const cell = (rs: AuditRow[]): Cell => ({
  n: rs.length,
  win: rs.length ? rs.filter((r) => r.R > 0).length / rs.length : null,
  R: rs.length ? rs.reduce((s, r) => s + wins(r.R), 0) / rs.length : null,
});

/** Assign halves at the median publish day (study rows keep their own). */
export function splitHalves(rows: AuditRow[]): AuditRow[] {
  if (rows.every((r) => r.half)) return rows;
  const days = rows.map((r) => r.day).sort();
  const med = days[Math.floor(days.length / 2)] ?? '';
  return rows.map((r) => ({ ...r, half: r.day < med ? 'H1' : 'H2' }));
}
const dropTop = (rs: AuditRow[], k: number) => [...rs].sort((a, b) => b.R - a.R).slice(k);

/** Decile (or fewer, when the feature has few distinct values) buckets cut on the whole sample. */
function buckets(rows: AuditRow[], key: string, maxB = 10): Array<{ label: string; test: (v: number) => boolean }> {
  const vals = rows.map((r) => r.f[key]).filter((v): v is number => v != null).sort((a, b) => a - b);
  const distinct = Array.from(new Set(vals));
  if (distinct.length <= maxB) return distinct.map((v) => ({ label: String(v), test: (x: number) => x === v }));
  const cuts = Array.from({ length: maxB - 1 }, (_, i) => vals[Math.floor(((i + 1) * vals.length) / maxB)]);
  const edges = Array.from(new Set(cuts));
  return [-Infinity, ...edges].map((lo, i) => {
    const hi = edges[i] ?? Infinity;
    return { label: `${lo === -Infinity ? '<' : `${+lo.toFixed(2)}–`}${hi === Infinity ? '∞' : +hi.toFixed(2)}`, test: (x: number) => x >= lo && x < hi };
  });
}

export interface FeatureReport {
  key: string; n: number;
  rho: { H1: number | null; H2: number | null; H1drop: number | null; H2drop: number | null };
  sameSign: boolean; sameSignDropTop: boolean;
  table: Array<{ bucket: string; all: Cell; H1: Cell; H2: Cell }>;
}

export function featureReport(rowsIn: AuditRow[], key: string, maxB = 10): FeatureReport {
  const rows = rowsIn.filter((r) => r.f[key] != null);
  const half = (h: string) => rows.filter((r) => r.half === h);
  const rho = (rs: AuditRow[]) => spearman(rs.map((r) => r.f[key] as number), rs.map((r) => wins(r.R)));
  const r1 = rho(half('H1')), r2 = rho(half('H2')), r1d = rho(dropTop(half('H1'), 5)), r2d = rho(dropTop(half('H2'), 5));
  const same = (a: number | null, b: number | null) => a != null && b != null && Math.sign(a) === Math.sign(b) && Math.abs(a) >= 0.05 && Math.abs(b) >= 0.05;
  return {
    key, n: rows.length,
    rho: { H1: r1, H2: r2, H1drop: r1d, H2drop: r2d },
    sameSign: same(r1, r2), sameSignDropTop: same(r1, r2) && same(r1d, r2d) && Math.sign(r1d!) === Math.sign(r1!),
    table: buckets(rows, key, maxB).map((b) => {
      const inB = rows.filter((r) => b.test(r.f[key] as number));
      return { bucket: b.label, all: cell(inB), H1: cell(inB.filter((r) => r.half === 'H1')), H2: cell(inB.filter((r) => r.half === 'H2')) };
    }),
  };
}

export function audit(rowsIn: AuditRow[]) {
  const rows = splitHalves(rowsIn);
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.f))));
  const features = keys.map((k) => featureReport(rows, k, k === 'grade' ? 10 : 5));
  return {
    n: rows.length,
    nH1: rows.filter((r) => r.half === 'H1').length,
    nH2: rows.filter((r) => r.half === 'H2').length,
    book: { all: cell(rows), H1: cell(rows.filter((r) => r.half === 'H1')), H2: cell(rows.filter((r) => r.half === 'H2')) },
    features,
    /** A feature passes only if same sign, |ρ| ≥ 0.05 in both halves, with and without each half's top 5 trades. */
    passing: features.filter((f) => f.sameSignDropTop).map((f) => f.key),
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────
const fmt = (v: number | null, d = 2) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`);
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

function print(rep: ReturnType<typeof audit>, label: string) {
  console.log(`\nGRADE AUDIT — ${label}`);
  console.log(`n=${rep.n} (H1 ${rep.nH1} / H2 ${rep.nH2}) · book ${fmt(rep.book.all.R)}R, win ${pct(rep.book.all.win)} · H1 ${fmt(rep.book.H1.R)}R · H2 ${fmt(rep.book.H2.R)}R`);
  console.log('\nfeature            n    ρH1    ρH2   ρH1−top5 ρH2−top5  both-halves');
  for (const f of rep.features) {
    console.log(`${f.key.padEnd(16)} ${String(f.n).padStart(4)}  ${fmt(f.rho.H1).padStart(5)}  ${fmt(f.rho.H2).padStart(5)}   ${fmt(f.rho.H1drop).padStart(5)}    ${fmt(f.rho.H2drop).padStart(5)}    ${f.sameSignDropTop ? 'PASS' : f.sameSign ? 'same sign (fails w/o top 5)' : 'no'}`);
  }
  for (const f of rep.features.filter((x) => ['grade', 'rotWith', 'confFamilies', 'rrBand'].includes(x.key))) {
    console.log(`\n${f.key}: bucket  |  all n / win / R  |  H1 n / R  |  H2 n / R`);
    for (const b of f.table) console.log(`  ${b.bucket.padEnd(14)} ${String(b.all.n).padStart(4)} ${pct(b.all.win).padStart(4)} ${fmt(b.all.R)}  |  ${b.H1.n} / ${fmt(b.H1.R)}  |  ${b.H2.n} / ${fmt(b.H2.R)}`);
  }
  console.log(`\npassing (both halves, with and without top 5): ${rep.passing.length ? rep.passing.join(', ') : 'NONE'}`);
}

async function loadDb(): Promise<any[]> {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin transaction read only');
    const res = await client.query(IDEAS_SQL);
    await client.query('rollback');
    return (res.rows[0]?.json_agg as any[]) ?? [];
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  let rows: AuditRow[]; let label: string;
  if (args.includes('--study')) {
    const d = JSON.parse(readFileSync(new URL('./score-v2-study-results.json', import.meta.url), 'utf8'));
    rows = (d.rows as any[]).map(rowFromStudy);
    label = 'score-v2 bar-verified ideas (rule-7 replay labels), grade at publish';
  } else {
    const file = arg('--ideas');
    const raw: any[] = file ? JSON.parse(readFileSync(file, 'utf8')) ?? [] : process.env.DATABASE_URL ? await loadDb() : [];
    if (!raw.length) { console.error('no ideas: pass --study, --ideas <dump.json>, or set DATABASE_URL'); process.exit(2); }
    rows = raw.map(rowFromDb).filter((r): r is AuditRow => r != null);
    label = `resolved ideas since ${VALID_FROM} (outcome-tracker labels), grade at first surfacing`;
  }
  const rep = audit(rows);
  print(rep, label);
  const out = arg('--out');
  if (out) { writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), label, ...rep }, null, 2)); console.log(`\nwrote ${out}`); }
}

if (process.argv[1] && /grade-audit\.ts$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
