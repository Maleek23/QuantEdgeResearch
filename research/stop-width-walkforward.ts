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
 *   set -a && . ./.env && set +a && NODE_ENV=production npx tsx research/losers-later.ts --since 2026-09-29 --focus 2026-10-05 --out /tmp/losers-later.json
 *   npx tsx research/stop-width-walkforward.ts --in /tmp/losers-later.json
 * Options:
 *   --in file.json      losers-later output (default /tmp/losers-later.json)
 *   --md file.md        default research/results/STOP_WIDTH_WALKFORWARD_<today>.md
 *   --top N             improvements removed per half (default 3)
 *   --min N             minimum paired ideas per half (default 30)
 *
 * Output: the table + the chosen multiple (→ BOT_STOP_ATR_MULT). No candidate holding
 * in both halves (or too few ideas) → the 1.5× fallback, said so explicitly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { walkForward, renderWalkForward, RULES, type WfIdea, type RuleId } from './losers-later-core';

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const IN = arg('--in') ?? '/tmp/losers-later.json';
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
  let missingWide = 0;
  for (const r of rows) {
    const t = Date.parse(String(r?.triggerAt ?? ''));
    if (!Number.isFinite(t) || !r?.rules?.plan || r.rules.plan.pct == null) continue;
    const pcts: WfIdea['pcts'] = {};
    for (const k of RULES as RuleId[]) pcts[k] = r.rules[k]?.pct ?? null;
    if (pcts.wide1_5 == null && pcts.atr1_5 != null) missingWide++;
    ideas.push({ id: String(r.id), triggerMs: t, pcts });
  }
  if (missingWide) console.warn(`  ${missingWide} ideas carry atr rules but no wide* rules — the input predates the wide rules; re-run research/losers-later.ts`);
  const w = walkForward(ideas, { topRemoved: TOP, minPerHalf: MIN });
  const md = renderWalkForward(w, { generatedAt: new Date().toISOString(), source: IN });
  fs.mkdirSync(path.dirname(MD), { recursive: true });
  fs.writeFileSync(MD, md);
  console.log(`\n=== stop width walk-forward (${w.n} paired ideas, top ${w.topRemoved} removed, min ${w.minPerHalf}/half) ===`);
  for (const r of w.rows) {
    const c = (i: 0 | 1) => `n=${r.halves[i].n} win ${r.halves[i].winRate ?? '—'}% vs ${r.halves[i].planWinRate ?? '—'}% · ΔΣex-top ${r.halves[i].deltaSumExTop ?? '—'}%`;
    console.log(`  ${r.rule.padEnd(9)} A[${c(0)}]  B[${c(1)}]  ${r.holdsBoth ? 'HOLDS' : '-'}${r.adoptable ? '' : ' (not adoptable)'}`);
  }
  console.log(`\nchosen: ${w.chosen.mult}× ATR — ${w.chosen.basis}`);
  console.log(`→ BOT_STOP_ATR_MULT=${w.chosen.mult}   (wrote ${MD})`);
}

main();
