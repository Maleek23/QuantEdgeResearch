/**
 * EXIT-RULE REPLAY — every NEXUS idea since 2026-08-26, same entries, seven exits.
 *
 *   npm run research:exit-rules            (needs .cache/exit-replay/ideas.json — see docs/EXIT_RULE_REPLAY.md)
 *
 * Question: which exit rule captures the most of each move? The rules live in
 * shared/exit-policy.ts (pure); this script only loads bars, finds the entry,
 * runs every rule on the same entry and aggregates.
 *
 * DATA (read-only; never touches a database)
 *   ideas  : .cache/exit-replay/ideas.json — a SELECT dump of trade_ideas since 2026-08-26
 *   stocks : Alpaca v2/stocks/bars 1Min (SIP, split-adjusted) per symbol, RTH only; 1Day for daily EMA/ATR
 *   crypto : Alpaca v1beta3 crypto/us bars (24/7; a "session" is a UTC day)
 *   options: Alpaca v1beta1/options/bars 1Min by OCC symbol (SPX → SPXW root)
 *   SPX    : SPY bars × that day's ^GSPC/SPY close ratio
 *
 * ENTRY (identical for every rule)
 *   market-entry engines (flow, orb_scanner, zero_dte_desk, gex_scanner) fill at the open of
 *   the first regular-session bar after publish; every other engine waits for price to TRADE
 *   AT entry (a bar range containing it, or a gap across it → the open) before the horizon
 *   ends, and is void if the stop traded first. Options fill at that minute's contract bar
 *   HIGH (conservative) — a second pass fills at the bar's mid ((h+l)/2).
 *
 * HORIZON: shared/loss-rules.ts horizonTradingDays (day 1 · swing 5 · position 10 sessions,
 * never past the contract's 16:00 ET expiry). Ideas whose horizon runs past the data are
 * marked at the last bar (identically for every rule) and flagged `open`.
 *
 * EXCLUSIONS: rows whose recorded exit precedes publish (the UTC-midnight expiry bug —
 * docs/LOSS_ATTRIBUTION_2026-09-30.md §3), and duplicates (same symbol + side + engine +
 * instrument within one ET session — the first is kept).
 */
import fs from 'fs';
import path from 'path';
import { EXIT_RULES, EXIT_RULE_LABEL, type ExitRuleId } from '../shared/exit-policy';
import { replayIdeas, requests, type Idea, type Row } from './lib/idea-replay';

const ROOT = path.resolve(process.cwd(), '.cache/exit-replay');
const OUT = path.resolve(process.cwd(), process.env.EXIT_REPLAY_OUT || 'research/exit-rule-replay-results.json');

async function main() {
  const ideasFile = path.join(ROOT, 'ideas.json');
  if (!fs.existsSync(ideasFile)) throw new Error(`missing ${ideasFile} — dump trade_ideas first (docs/EXIT_RULE_REPLAY.md)`);
  const all: Idea[] = JSON.parse(fs.readFileSync(ideasFile, 'utf8'));
  const { rows, excl } = await replayIdeas(all);

  // ── aggregate ─────────────────────────────────────────────────────────
  const days = rows.map((r) => r.pubDay).sort();
  const median = days[Math.floor(days.length / 2)];
  const halfOf = (r: Row) => (r.pubDay < median ? 'H1' : 'H2');
  const tercile = (() => { const c = rows.map((r) => r.conv).filter((v): v is number => v != null).sort((a, b) => a - b); return [c[Math.floor(c.length / 3)], c[Math.floor((2 * c.length) / 3)]]; })();
  const convBand = (r: Row) => (r.conv == null ? 'none' : r.conv < tercile[0] ? `low (<${tercile[0]})` : r.conv < tercile[1] ? `mid (${tercile[0]}–${tercile[1] - 1})` : `high (≥${tercile[1]})`);
  type Mode = { variant: 'cons' | 'mid'; eq: boolean };
  const val = (r: Row, rule: ExitRuleId, m: Mode): number | null => {
    const v = r.v[m.variant] ?? (r.kind === 'stock' || r.kind === 'crypto' ? r.v.cons : undefined);
    if (!v) return null; const x = (m.eq ? v.pnlEq : v.pnl)[rule]; return x == null ? null : x;
  };
  const peakOf = (r: Row, m: Mode) => { const v = r.v[m.variant] ?? (r.kind === 'stock' || r.kind === 'crypto' ? r.v.cons : undefined); return v ? (m.eq ? v.peakEq : v.peak) : 0; };
  function stats(rs: Row[], rule: ExitRuleId, m: Mode) {
    const xs = rs.map((r) => ({ r, p: val(r, rule, m) })).filter((z) => z.p != null) as Array<{ r: Row; p: number }>;
    xs.sort((a, b) => a.r.entryMs - b.r.entryMs);
    let cum = 0, hi = 0, dd = 0, win = 0, peak = 0;
    for (const z of xs) { cum += z.p; hi = Math.max(hi, cum); dd = Math.min(dd, cum - hi); if (z.p > 0) win++; peak += peakOf(z.r, m); }
    const n = xs.length;
    return { n, total: round(cum), winPct: n ? round((100 * win) / n, 1) : 0, expectancy: n ? round(cum / n) : 0, capture: peak > 0 ? round(cum / peak, 3) : null, peak: round(peak), maxDD: round(dd) };
  }
  const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
  const modes: Record<string, Mode> = { 'cons-1c': { variant: 'cons', eq: false }, 'cons-eq500': { variant: 'cons', eq: true }, 'mid-1c': { variant: 'mid', eq: false }, 'mid-eq500': { variant: 'mid', eq: true } };
  const dims: Record<string, (r: Row) => string> = {
    all: () => 'all', half: halfOf, engine: (r) => r.source, asset: (r) => (r.kind === 'stock' || r.kind === 'crypto' ? `${r.kind} ${r.dir}` : `${r.kind}`),
    holding: (r) => r.hp, conviction: convBand, horizonComplete: (r) => (r.open ? 'open (marked at last bar)' : 'complete'),
  };
  const tables: any = {};
  for (const [mk, m] of Object.entries(modes)) {
    tables[mk] = {};
    for (const [dk, f] of Object.entries(dims)) {
      const groups = new Map<string, Row[]>();
      for (const r of rows) (groups.get(f(r)) ?? groups.set(f(r), []).get(f(r))!).push(r);
      tables[mk][dk] = {};
      for (const [g, rs] of [...groups].sort()) {
        tables[mk][dk][g] = {};
        for (const rule of EXIT_RULES) tables[mk][dk][g][rule] = stats(rs, rule, m);
        tables[mk][dk][g].planOptionsOnly = stats(rs.filter((r) => r.kind === 'call' || r.kind === 'put'), 'plan', m);
      }
    }
  }
  // Verdict: beats plan in BOTH halves and survives removing its top-3 trades.
  const verdict: any = {};
  for (const [mk, m] of Object.entries(modes)) {
    verdict[mk] = {};
    for (const rule of EXIT_RULES) {
      if (rule === 'plan') continue;
      const pool0 = rule === 'opt_premium' ? rows.filter((r) => r.kind === 'call' || r.kind === 'put') : rows;
      const ds = pool0.map((r) => ({ r, d: (val(r, rule, m) ?? NaN) - (val(r, 'plan', m) ?? NaN) })).filter((z) => Number.isFinite(z.d));
      const sum = (zs: typeof ds) => round(zs.reduce((a, z) => a + z.d, 0));
      const top = [...ds].sort((a, b) => b.d - a.d).slice(0, 3);
      const exTop = sum(ds) - sum(top);
      const h1 = sum(ds.filter((z) => halfOf(z.r) === 'H1')), h2 = sum(ds.filter((z) => halfOf(z.r) === 'H2'));
      verdict[mk][rule] = {
        n: ds.length, deltaVsPlan: sum(ds), deltaH1: h1, deltaH2: h2, deltaExTop3: round(exTop),
        top3: top.map((z) => `${z.r.symbol} ${z.r.kind} ${z.r.pubDay} ${round(z.d)}`),
        better: ds.filter((z) => z.d > 0.005).length, worse: ds.filter((z) => z.d < -0.005).length,
        wins: h1 > 0 && h2 > 0 && exTop > 0,
      };
    }
  }
  const out = { generatedAt: new Date().toISOString(), medianSplit: median, convTerciles: tercile, ideasLoaded: all.length, exclusions: excl, simulated: rows.length, labels: EXIT_RULE_LABEL, verdict, tables, rows };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

  // Console summary.
  for (const mk of Object.keys(modes)) {
    console.log(`\n=== ${mk} ===`);
    for (const g of ['all', 'H1', 'H2']) {
      const t = g === 'all' ? tables[mk].all.all : tables[mk].half[g];
      if (!t) continue;
      console.log(`-- ${g}`);
      for (const rule of EXIT_RULES) { const s = t[rule]; console.log(`${rule.padEnd(14)} n=${String(s.n).padStart(3)} $${String(s.total).padStart(7)} win ${s.winPct}% exp ${s.expectancy} cap ${s.capture} dd ${s.maxDD}`); }
      console.log(`plan(opt only) n=${t.planOptionsOnly.n} $${t.planOptionsOnly.total}`);
    }
    for (const [r, v] of Object.entries<any>(verdict[mk])) console.log(`${r.padEnd(14)} Δ ${v.deltaVsPlan} H1 ${v.deltaH1} H2 ${v.deltaH2} exTop3 ${v.deltaExTop3} ${v.better}/${v.worse} ${v.wins ? 'WINS' : ''}`);
  }
  console.log(`\nwrote ${OUT} (requests ${requests})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
