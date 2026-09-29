/**
 * LOSS RULES REPORT — before/after + HYPOTHETICAL counterfactual, desk and bot.
 *
 *   # from a read-only JSON export (no DB connection from this machine):
 *   npx tsx research/loss-rules-report.ts --input /path/export.json [--vol] [--json out.json]
 *   # or against the DATABASE_URL in the environment (read-only queries):
 *   npx tsx research/loss-rules-report.ts --db [--vol]
 *
 * Export shape: { ideas: IdeaRow[], positions: BotPositionRow[] } in camelCase —
 * research/loss-rules-export.sql produces it with psql.
 *
 * --vol loads 1y of daily bars per symbol from Yahoo so the target-cap
 * counterfactual can be classified (σ = 20-day realized vol before publish).
 *
 * Same pure core as GET /api/journal/loss-rules (shared/loss-rules-report.ts).
 */
import { readFileSync, writeFileSync } from 'fs';
import { buildLossRulesReport, type LossRulesReport } from '../shared/loss-rules-report';
import { DEFAULT_LOSS_RULES_CONFIG } from '../shared/loss-rules';
import { OUTCOME_BASELINE_DATE } from '../shared/constants';
import { botReportTrade, deskReportTrade, peerRow, type BotPositionRow, type IdeaRow } from '../server/loss-rules-report-rows';

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const has = (k: string) => args.includes(k);

async function closesFor(symbols: string[]) {
  const { fetchCandles } = await import('../server/historical-candles');
  const out = new Map<string, Array<{ time: number; close: number }>>();
  for (const s of symbols) {
    try {
      const bars = await fetchCandles(s, '1y', '1d');
      if (bars.length) out.set(s, bars.map((b) => ({ time: b.time, close: b.close })));
    } catch { /* unknown stays unknown */ }
  }
  return out;
}

function fmt(r: LossRulesReport): string {
  const g = (s: { n: number; winRate: number | null; profitFactor: number | null; net: number; lowSample: boolean }) =>
    `n=${String(s.n).padStart(3)}  win ${s.winRate == null ? '  —  ' : `${s.winRate.toFixed(1).padStart(5)}%`}  PF ${s.profitFactor == null ? ' — ' : s.profitFactor.toFixed(2).padStart(4)}  net ${(s.net >= 0 ? '+' : '−') + '$' + Math.abs(s.net).toLocaleString('en-US', { maximumFractionDigits: 0 })}${s.lowSample ? '  (low n)' : ''}`;
  const lines = [
    `\n══ ${r.journal.toUpperCase()} ══  ${r.basis}`,
    `MEASURED (by stamped rule-set version)`,
    `  before rules      ${g(r.measured.before)}`,
    `  ${r.rulesVersion.padEnd(16)}  ${g(r.measured.after)}`,
    `COUNTERFACTUAL — HYPOTHETICAL`,
    `  all               ${g(r.counterfactual.all)}`,
  ];
  for (const rule of r.counterfactual.rules) {
    lines.push(`  ${rule.rule}  [${rule.flag}] — ${rule.scope}`);
    for (const grp of rule.groups) lines.push(`    ${grp.label.padEnd(70)} ${g(grp.stats)}`);
  }
  lines.push(`  rules 1+2 combined`);
  lines.push(`    ${'kept'.padEnd(70)} ${g(r.counterfactual.combinedBotEntryRules.kept)}`);
  lines.push(`    ${'filtered'.padEnd(70)} ${g(r.counterfactual.combinedBotEntryRules.filtered)}`);
  return lines.join('\n');
}

(async () => {
  let ideas: IdeaRow[]; let positions: BotPositionRow[];
  if (opt('--input')) {
    const dump = JSON.parse(readFileSync(opt('--input')!, 'utf8'));
    ideas = dump.ideas ?? []; positions = dump.positions ?? [];
  } else if (has('--db')) {
    await import('dotenv/config');
    const { getLossRulesReport } = await import('../server/loss-rules-report');
    for (const j of ['desk', 'bot'] as const) console.log(fmt(await getLossRulesReport(j, { vol: has('--vol') })));
    process.exit(0);
  } else {
    console.error('usage: --input export.json | --db   [--vol] [--json out.json]');
    process.exit(2);
  }

  // Same book as the journal's Trade desk: since the clean-era baseline, not drafts, not excluded.
  const baseline = ideas.filter((i: any) => i.timestamp >= OUTCOME_BASELINE_DATE && i.status !== 'draft' && i.excludeFromTraining !== true);
  const deskTrades = baseline.map(deskReportTrade).filter((t): t is NonNullable<typeof t> => !!t);
  const byId = new Map(ideas.map((i) => [i.id, i]));
  const botTrades = positions.map((p) => botReportTrade(p, p.tradeIdeaId ? byId.get(p.tradeIdeaId) ?? null : null)).filter((t): t is NonNullable<typeof t> => !!t);
  const peers = ideas.map(peerRow);
  const closes = has('--vol') ? await closesFor([...new Set([...deskTrades, ...botTrades].map((t) => t.symbol))]) : null;

  const desk = buildLossRulesReport({ journal: 'desk', trades: deskTrades, peers, closesBySymbol: closes, cfg: DEFAULT_LOSS_RULES_CONFIG, includeTrades: true,
    basis: `Trade desk — ideas since ${OUTCOME_BASELINE_DATE} with a measured result (${deskTrades.length} of ${baseline.length}), unit-sized as in the journal` });
  const bot = buildLossRulesReport({ journal: 'bot', trades: botTrades, peers, closesBySymbol: closes, cfg: DEFAULT_LOSS_RULES_CONFIG, includeTrades: true,
    basis: `Quant Bot — every closed paper fill, all runs (${botTrades.length})` });
  console.log(fmt(desk));
  console.log(fmt(bot));
  if (opt('--json')) writeFileSync(opt('--json')!, JSON.stringify({ desk, bot }, null, 2));
  process.exit(0);
})();
