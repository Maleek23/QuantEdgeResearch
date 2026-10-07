/**
 * STOP WIDTH — WALK-FORWARD. Which stop multiple holds in BOTH halves of the
 * record with its best trades removed?
 *
 * Operator (2026-10-07): wider stops approved, bot first, then NEXUS — but only
 * at a multiple that survives a walk-forward split (Signal Lab law: a
 * short-window win is a regime artifact until it holds out of sample).
 *
 * Input: the JSON research/losers-later.ts writes (`allAnalysed[].rules` holds
 * every triggered closed idea replayed under each rule on the same bars —
 * plan, k×ATR, wider-of(structural, k×ATR) for k = 1.0/1.5/2.0, time-only with a
 * 3×ATR disaster stop …). This script only post-processes that file: no database,
 * no network, read-only.
 *
 * Run on the droplet (bars + DB are there; the local cache is empty):
 *   set -a && . ./.env && set +a && NODE_ENV=production npx tsx research/losers-later.ts --since 2026-09-29 --focus 2026-10-05 --out /tmp/losers-later-ws.json
 *   npx tsx research/stop-width-walkforward.ts --in /tmp/losers-later-ws.json
 * Options:
 *   --in file.json      losers-later output (default /tmp/losers-later-ws.json)
 *   --md file.md        default research/results/STOP_WIDTH_WALKFORWARD_<today>.md
 *   --top N             improvements removed per half (default 3)
 *   --min N             minimum paired ideas per half (default 30)
 *
 * Output: two evaluations of the same halves —
 *   1. unsized % per trade (what the first run reported), and
 *   2. R at equal-risk sizing: each variant's P&L ÷ ITS OWN stop distance (the bot sizes
 *      every trade to the same $ risk, so a wider stop trades a smaller size). Expectancy,
 *      profit factor and max drawdown in R per half, top trades removed. A multiple is chosen
 *      ONLY if its ex-top R-expectancy beats the plan's in both halves.
 * Hybrids (plan stop for the first 3/6 bars, then wide / trailed) need a losers-later run made
 * with this version; an older input shows them as "not in this input".
 */
import fs from 'node:fs';
import path from 'node:path';
import { walkForward, renderWalkForward, walkForwardR, renderWalkForwardR, RULES, WF_FALLBACK_MULT, type WfIdea, type WfRIdea, type RuleId } from './losers-later-core';

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const IN = arg('--in') ?? '/tmp/losers-later-ws.json';
const MD = arg('--md') ?? `research/results/STOP_WIDTH_WALKFORWARD_${new Date().toISOString().slice(0, 10)}.md`;
const TOP = Number(arg('--top') ?? 3);
const MIN = Number(arg('--min') ?? 30);

function main() {
  if (!fs.existsSync(IN)) {
    console.error(`[stop-width-walkforward] ${IN} not found — run research/losers-later.ts first (see the header of this file).`);
    process.exit(2);
  }
  const j = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const rows: any[] = Array.isArray(j?.allAnalysed) ? j.allAnalysed : [];
  const ideas: WfIdea[] = [];
  const rIdeas: WfRIdea[] = [];
  let missingWide = 0;
  for (const r of rows) {
    const t = Date.parse(String(r?.triggerAt ?? ''));
    if (!Number.isFinite(t) || !r?.rules?.plan || r.rules.plan.pct == null) continue;
    const pcts: WfIdea['pcts'] = {};
    for (const k of RULES as RuleId[]) pcts[k] = r.rules[k]?.pct ?? null;
    if (pcts.wide1_5 == null && pcts.atr1_5 != null) missingWide++;
    ideas.push({ id: String(r.id), triggerMs: t, pcts });
    const entry = Number(r?.plan?.entry), stop = Number(r?.plan?.stop), atr = Number(r?.context?.atrD);
    if (entry > 0 && stop > 0 && entry !== stop) {
      rIdeas.push({ id: String(r.id), triggerMs: t, planRiskPct: Math.abs(entry - stop) / entry * 100, atrPct: atr > 0 ? atr / entry * 100 : null, pcts });
    }
  }
  if (missingWide) console.warn(`  ${missingWide} ideas carry atr rules but no wide* rules — the input predates the wide rules; re-run research/losers-later.ts`);
  const w = walkForward(ideas, { topRemoved: TOP, minPerHalf: MIN });
  const wr = walkForwardR(rIdeas, { topRemoved: TOP, minPerHalf: MIN });
  const md = `${renderWalkForward(w, { generatedAt: new Date().toISOString(), source: IN })}\n${renderWalkForwardR(wr, WF_FALLBACK_MULT)}`;
  fs.mkdirSync(path.dirname(MD), { recursive: true });
  fs.writeFileSync(MD, md);
  console.log(`\n=== stop width walk-forward (${w.n} paired ideas, top ${w.topRemoved} removed, min ${w.minPerHalf}/half) ===`);
  for (const r of w.rows) {
    const c = (i: 0 | 1) => `n=${r.halves[i].n} win ${r.halves[i].winRate ?? '—'}% vs ${r.halves[i].planWinRate ?? '—'}% · ΔΣex-top ${r.halves[i].deltaSumExTop ?? '—'}%`;
    console.log(`  ${r.rule.padEnd(9)} A[${c(0)}]  B[${c(1)}]  ${r.holdsBoth ? 'HOLDS' : '-'}${r.adoptable ? '' : ' (not adoptable)'}`);
  }
  console.log(`\n% (unsized) chosen: ${w.chosen.mult}× ATR — ${w.chosen.basis}`);
  console.log(`\n=== in R (equal-risk sizing; 1R = each variant's own stop), top ${wr.topRemoved} removed ===`);
  for (const r of wr.rows) {
    if (r.missing) { console.log(`  ${r.rule.padEnd(10)} not in this input — re-run research/losers-later.ts for it`); continue; }
    const c = (i: 0 | 1) => { const h = r.halves[i]; return `n=${h.variant.n} E[R]x ${h.variant.expRExTop ?? '—'} vs plan ${h.plan.expRExTop ?? '—'} · PF ${h.variant.profitFactor ?? '∞'} · DD ${h.variant.maxDdR ?? '—'}R`; };
    console.log(`  ${r.rule.padEnd(10)} A[${c(0)}]  B[${c(1)}]  ${r.holdsBoth ? 'HOLDS' : '-'}${r.adoptable ? '' : ' (report only)'}`);
  }
  console.log(`\nR chosen: ${wr.chosen.mult != null ? `${wr.chosen.mult}× ATR → BOT_STOP_ATR_MULT=${wr.chosen.mult}` : `none — ${wr.chosen.basis}`}`);
  console.log(`(wrote ${MD})`);
}

main();
