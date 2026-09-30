/**
 * Journal · Playbooks — LuxAlgo's Playbooks (apps/web/src/app/playbooks): a
 * setup you trade on purpose, its written definition, and whether it pays.
 *
 *   · Every book: one card per setupType in view with its live stats (closed n,
 *     win %, profit factor, expectancy, net, hold). On writable books the
 *     definition is editable (journal_notes, reason = 'playbook', one per setup).
 *   · Bot: the playbook IS the bot's rulebook — DEFAULT_BOT_CONFIG from
 *     server/quant-bot.ts via /api/journal/bot — each rule next to what the
 *     ledger shows about it. Rules whose refusals the bot only logs (never
 *     stores) say so instead of showing a number. Exits are grouped by the
 *     rule that closed them. The short gate's refusals are on Missed.
 *   · 2026-09-29 (LuxAlgo rule-checklist / adherence-report parity): a written
 *     definition's rules (one per line / bullet) become a checklist every
 *     trade of that setup is reviewed against on its trade page; each card
 *     then reports, per rule, the share of assessed trades that followed it
 *     and the P&L when followed vs broken (metrics-extra.ts playbookAdherence).
 */
import { reasonOf } from '@/lib/optimistic';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, Plus } from 'lucide-react';
import { journalDayKey } from '@shared/journal-filters';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { useJournal } from '@/components/journal/journal-context';
import { BucketTable, Card, LowSample, N, Pnl } from '@/components/journal/parts';
import {
  bucketStats, fmtDuration, fmtMoney, fmtPct, fmtRatio, groupBy, groupInto, noteLine, peakConcurrent, ruleOfReason,
  type BucketStats, type JTrade,
} from '@/lib/journal/metrics';
import type { JournalNoteRow } from '@/lib/journal/types';
import { readApiError, useBotBook, useJournalNoteMutations, type BotBookInfo } from '@/lib/journal/use-journal';
import { playbookAdherence, playbookRules, type PlaybookAdherence } from '@/lib/journal/metrics-extra';
import { useTradeReviews } from '@/lib/journal/use-journal-extra';

const etMinutes = (iso: string) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  return Number(p.find((x) => x.type === 'hour')?.value ?? NaN) * 60 + Number(p.find((x) => x.type === 'minute')?.value ?? NaN);
};

export default function PlaybooksView() {
  const { data, canWrite, bookLabel, filters } = useJournal();
  const { trades, notesQ } = data;
  const isBot = data.key === 'bot';
  const setups = useMemo(() => groupBy(trades, 'setup'), [trades]);
  const untagged = trades.filter((t) => !t.row.setupType?.trim()).length;

  const defs = useMemo(() => {
    const m = new Map<string, JournalNoteRow>();
    for (const n of notesQ.data?.notes ?? []) {
      if (n.reason === 'playbook' && n.sourceMessageId?.startsWith('playbook:')) m.set(n.sourceMessageId.slice(9), n);
    }
    return m;
  }, [notesQ.data]);

  const { reviews } = useTradeReviews(notesQ.data?.notes);
  const adherence = useMemo(() => {
    const books = [...defs.entries()].map(([k, n]) => ({ setup: k, rules: playbookRules(n.body) }));
    return new Map(playbookAdherence(trades, books, reviews).map((a) => [a.setup, a]));
  }, [defs, trades, reviews]);

  // Written playbooks with no trades in view still show (n=0), so a new playbook has a home.
  const defOnly = [...defs.entries()].filter(([k]) => !setups.some((s) => s.key.toLowerCase() === k));
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {isBot && <BotRulebook trades={trades} />}

      {notesQ.isError && <QEError title="Playbook definitions didn't load" message="The stats below are unaffected (computed from the trades in view); written definitions are missing until this loads." onRetry={() => notesQ.refetch()} retrying={notesQ.isFetching} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 className="jr-section-h" style={{ margin: 0 }}>{isBot ? 'By publishing engine' : data.key === 'desk' ? 'By publishing engine' : 'Setups'}</h3>
        <N n={setups.length} unit="setups" />
        {untagged > 0 && <span className="jr-n">· {untagged} trade{untagged === 1 ? '' : 's'} in view without a setup</span>}
        {canWrite && <button type="button" className="jr-btn jr-btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> New playbook</button>}
      </div>

      {adding && canWrite && <NewPlaybook onDone={() => setAdding(false)} existing={new Set([...setups.map((s) => s.key.toLowerCase()), ...defs.keys()])} />}

      {!setups.length && !defOnly.length ? (
        <QEEmpty message={canWrite
          ? 'No setups yet. A playbook is a setup you trade on purpose — write one here, then tag trades with it (Edit trade → Setup) and its stats fill in.'
          : `No trade in view for ${bookLabel} carries a setup.`} />
      ) : (
        <div className="jr-grid">
          {setups.map((b) => (
            <PlaybookCard key={b.key} name={b.key} stats={b} def={defs.get(b.key.toLowerCase()) ?? null} adherence={adherence.get(b.key.toLowerCase()) ?? null}
              onFilter={() => filters.setFilter('setup', b.key)} readOnlyNote={isBot || data.key === 'desk' ? 'Setup = the engine that published the signal.' : null} />
          ))}
          {defOnly.map(([k, n]) => (
            <PlaybookCard key={k} name={k.charAt(0).toUpperCase() + k.slice(1)} stats={bucketStats(k, [])} def={n} adherence={adherence.get(k) ?? null} readOnlyNote={null} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlaybookCard({ name, stats: b, def, onFilter, readOnlyNote, adherence }: {
  name: string;
  stats: BucketStats;
  def: JournalNoteRow | null;
  adherence: PlaybookAdherence | null;
  onFilter?: () => void;
  readOnlyNote: string | null;
}) {
  const { canWrite } = useJournal();
  return (
    <section className="jr-card jr-span-6" aria-label={`Playbook ${name}`}>
      <div className="jr-card-h">
        <h3 className="jr-card-t">{name}</h3>
        <div className="jr-card-meta">
          <N n={b.closed} /><LowSample n={b.closed} />
          {onFilter && b.trades > 0 && <button type="button" className="jr-btn jr-btn-sm" onClick={onFilter}>Filter to it <ArrowRight className="h-3.5 w-3.5" /></button>}
        </div>
      </div>
      <div className="jr-stats" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <div><span>Net P&amp;L</span><b><Pnl value={b.closed ? b.netPnl : null} /></b><small>{b.trades} trades{b.trades > b.closed ? ` · ${b.trades - b.closed} open` : ''}</small></div>
        <div><span>Win rate</span><b>{fmtPct(b.winRate)}</b><small>{b.wins}W of {b.closed}</small></div>
        <div><span>Profit factor</span><b>{fmtRatio(b.profitFactor, b.profitFactorIsInfinite)}</b><small>gross won ÷ lost</small></div>
        <div><span>Expectancy</span><b><Pnl value={b.expectancy} /></b><small>per closed trade</small></div>
        <div><span>Avg hold</span><b>{fmtDuration(b.avgDurationMs)}</b><small>closed trades</small></div>
        <div><span>Sample</span><b>n={b.closed}</b><small>{b.closed < 20 ? 'under 20 — anecdote' : 'closed trades'}</small></div>
      </div>
      {adherence && adherence.rules.length > 0 && <Adherence a={adherence} />}
      <div style={{ marginTop: 10 }}>
        {canWrite ? <DefinitionEditor setup={name} def={def} /> : def ? <div className="jr-notes">{def.body}</div> : (
          <p className="jr-note" style={{ margin: 0 }}>{readOnlyNote ?? 'No written definition for this setup.'}</p>
        )}
      </div>
    </section>
  );
}

/** Rule checklist + adherence (adherence-report.tsx): per rule, followed share and P&L followed vs broken. */
function Adherence({ a }: { a: PlaybookAdherence }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="jr-kpi-l" style={{ marginBottom: 6 }}>
        Rule checklist · adherence <span className="jr-n">{a.reviewed} of {a.trades} closed trades reviewed{a.rate != null ? ` · ${fmtPct(a.rate)} of checks followed` : ''}</span>
      </div>
      {a.reviewed === 0 ? (
        <>
          <ul className="jr-rule-list">{a.rules.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="jr-note" style={{ margin: 0 }}>No trade of this setup has been checked against these rules yet — open a trade's full page and mark each rule followed or broken.</p>
        </>
      ) : (
        <>
          <div className="jr-table-wrap">
            <table className="jr-table jr-table-wrapcells">
              <thead><tr><th scope="col">Rule</th><th scope="col" className="num">Checked n</th><th scope="col" className="num">Followed</th><th scope="col" className="num">P&amp;L followed</th><th scope="col" className="num">P&amp;L broken</th></tr></thead>
              <tbody>
                {a.perRule.map((r) => (
                  <tr key={r.rule} style={{ cursor: 'default' }}>
                    <td>{r.rule}</td>
                    <td className="num">{r.evaluated}</td>
                    <td className="num">{fmtPct(r.rate)}</td>
                    <td className="num">{r.followed.closed ? <><Pnl value={r.followed.netPnl} compact /> <span className="jr-n">n={r.followed.closed} · exp <Pnl value={r.followed.expectancy} compact /></span></> : '—'}</td>
                    <td className="num">{r.broken.closed ? <><Pnl value={r.broken.netPnl} compact /> <span className="jr-n">n={r.broken.closed} · exp <Pnl value={r.broken.expectancy} compact /></span></> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="jr-stats" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', marginTop: 8 }}>
            <div><span>Followed every rule</span><b><Pnl value={a.followedAll.closed ? a.followedAll.netPnl : null} /></b><small>n={a.followedAll.closed} · {fmtPct(a.followedAll.winRate)} win · exp {fmtMoney(a.followedAll.expectancy, { compact: true })}</small></div>
            <div><span>Broke a rule</span><b><Pnl value={a.brokeAny.closed ? a.brokeAny.netPnl : null} /></b><small>n={a.brokeAny.closed} · {fmtPct(a.brokeAny.winRate)} win · exp {fmtMoney(a.brokeAny.expectancy, { compact: true })}</small></div>
            <div><span>Not fully assessed</span><b>{a.unassessed}</b><small>closed trades</small></div>
          </div>
          <p className="jr-note">"Followed every rule" needs every rule assessed on that trade. Small n on either side is an anecdote.</p>
        </>
      )}
    </div>
  );
}

function DefinitionEditor({ setup, def }: { setup: string; def: JournalNoteRow | null }) {
  const { data } = useJournal();
  const { save } = useJournalNoteMutations(data.key);
  const [text, setText] = useState(def?.body ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setText(def?.body ?? ''); }, [def?.body]);
  const dirty = text.trim() !== (def?.body ?? '').trim();
  const id = `jr-pb-${setup.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <div className="jr-field">
      <label htmlFor={id}>Definition &amp; rules</label>
      <textarea id={id} className="jr-input" value={text} maxLength={20_000} onChange={(e) => setText(e.target.value)}
        placeholder={'What the setup is, then one rule per line:\nOnly after the first 15 minutes\nStop under the opening-range low\nRisk ≤ 1R'} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="jr-btn jr-btn-sm jr-btn-primary" disabled={!dirty || save.isPending}
          onClick={async () => {
            setMsg(null);
            try {
              const r = await save.mutateAsync({ kind: 'playbook', ref: setup, day: journalDayKey(new Date()), body: text });
              setMsg({ ok: true, text: r.note ? 'Saved.' : 'Definition cleared.' });
            } catch (e) { setMsg({ ok: false, text: await readApiError(e) }); }
          }}>
          {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {text.trim() || !def ? 'Save definition' : 'Clear definition'}
        </button>
        {msg && <span className={msg.ok ? 'jr-gain' : 'jr-loss'} role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 12 }}>{msg.text}</span>}
      </div>
    </div>
  );
}

function NewPlaybook({ onDone, existing }: { onDone: () => void; existing: Set<string> }) {
  const { data } = useJournal();
  const { save } = useJournalNoteMutations(data.key);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const clash = existing.has(name.trim().toLowerCase());
  return (
    <Card title="New Playbook">
      <form style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onSubmit={async (e) => {
        e.preventDefault();
        setErr('');
        try {
          await save.mutateAsync({ kind: 'playbook', ref: name.trim(), day: journalDayKey(new Date()), body });
          onDone();
        } catch (x) { setErr(await readApiError(x)); }
      }}>
        <div className="jr-field">
          <label htmlFor="jr-pb-new-name">Setup name — tag trades with exactly this</label>
          <input id="jr-pb-new-name" className="jr-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Opening range breakout" />
          {clash && <span className="jr-note" style={{ marginTop: 0 }}>That setup already has a card — edit its definition there.</span>}
        </div>
        <div className="jr-field">
          <label htmlFor="jr-pb-new-body">Definition &amp; rules</label>
          <textarea id="jr-pb-new-body" className="jr-input" value={body} maxLength={20_000} onChange={(e) => setBody(e.target.value)} />
        </div>
        {err && <div className="jr-err" role="alert">{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="jr-btn jr-btn-primary jr-btn-sm" disabled={!name.trim() || !body.trim() || clash || save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create playbook
          </button>
          <button type="button" className="jr-btn jr-btn-sm" onClick={onDone}>Cancel</button>
        </div>
      </form>
    </Card>
  );
}

// ─── Bot: its rulebook, measured ─────────────────────────────

interface RuleRow { rule: string; value: string; what: string; measured: React.ReactNode }

function BotRulebook({ trades }: { trades: JTrade[] }) {
  const { goTo } = useJournal();
  const q = useBotBook(true);
  const exits = useMemo(() => groupInto(trades.filter((t) => t.status !== 'open'), (t) => {
    const r = noteLine(t, 'Exit:');
    return [r && r !== 'reason not recorded' ? ruleOfReason(r) : 'not recorded'];
  }), [trades]);

  if (q.isError && !q.data) return <QEError title="Quantinum Bot's rules didn't load" message={`${reasonOf(q.error)} The setup stats below are unaffected.`} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  if (q.isLoading || !q.data) return <QELoading rows={3} label="loading the bot's rulebook…" />;
  const rows = botRules(q.data.config, trades);

  return (
    <>
      <Card num="01" title="Quantinum Bot's Rulebook" meta={<><N n={trades.length} unit="fills in view" /><span className="jr-n">config as deployed · server/quant-bot.ts</span></>}>
        <div className="jr-table-wrap">
          <table className="jr-table jr-table-wrapcells">
            <thead>
              <tr><th scope="col">Rule</th><th scope="col">Setting</th><th scope="col">What it does</th><th scope="col">Measured on this ledger</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rule} style={{ cursor: 'default' }}>
                  <td><b>{r.rule}</b></td>
                  <td className="num" style={{ textAlign: 'left' }}>{r.value}</td>
                  <td className="jr-dim">{r.what}</td>
                  <td>{r.measured}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="jr-note">
          "Not measurable here" means the bot logs the refusal to the server log but never stores it, so the journal cannot count it — a gap, not a zero.
          The short-discipline gate's refusals are stored and replayed: <button type="button" className="jr-cell-btn jr-accent-link" onClick={() => goTo('missed')}>See missed trades</button>.
        </p>
      </Card>
      <Card num="02" title="Exits by the Rule That Closed Them" meta={<N n={exits.reduce((s, b) => s + b.closed, 0)} />}>
        {exits.length ? (
          <>
            <BucketTable buckets={exits} keyLabel="Exit rule" showHold />
            <p className="jr-note">Grouped from each fill's recorded exit reason with its numbers stripped ("gap magnet at $412 — banked +38%" → "gap magnet").</p>
          </>
        ) : <QEEmpty message="No closed Quantinum Bot fills in view." />}
      </Card>
    </>
  );
}

function botRules(c: BotBookInfo['config'], trades: JTrade[]): RuleRow[] {
  const closed = trades.filter((t) => t.status !== 'open');
  const wins = closed.filter((t) => t.status === 'win').length;
  const net = closed.reduce((s, t) => s + t.netPnl, 0);
  const losses = closed.filter((t) => t.status === 'loss');
  const overCap = losses.filter((t) => t.netPnl < -c.maxRiskDollars);
  const worst = losses.reduce((m, t) => Math.min(m, t.netPnl), 0);
  const options = trades.filter((t) => t.assetType === 'option');
  const debits = options.map((t) => t.row.entryPrice * t.quantity * 100).filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
  const overDebit = debits.filter((d) => d > c.maxDebitDollars).length;
  const median = debits.length ? debits[Math.floor(debits.length / 2)] : null;
  const early = trades.filter((t) => etMinutes(t.openedAt) < c.delayedFillNotBeforeEtMinutes).length;
  const peak = peakConcurrent(trades);
  const hhmm = `${Math.floor(c.delayedFillNotBeforeEtMinutes / 60)}:${String(c.delayedFillNotBeforeEtMinutes % 60).padStart(2, '0')}`;
  const notMeasured = <span className="jr-mute">Not measurable here — refusals are logged, not stored</span>;
  return [
    { rule: 'Conviction floor', value: `≥ ${c.minConviction} pts`, what: 'Only signals at or above this raw confluence score (bands: S ≥ 25 · A ≥ 19 · B ≥ 13).',
      measured: <>Every fill passed it: n={closed.length} closed · {fmtPct(closed.length ? wins / closed.length : null)} win · expectancy <Pnl value={closed.length ? net / closed.length : null} /> <LowSample n={closed.length} /></> },
    { rule: 'Max open positions', value: String(c.maxOpen), what: 'Concurrent positions the bot will hold.',
      measured: <>Peak held at once: <b>{peak}</b> {peak > c.maxOpen ? <span className="jr-loss">(above the cap)</span> : <span className="jr-dim">(within)</span>} · n={trades.length} fills</> },
    { rule: 'Risk per trade', value: `${c.riskPerTradePct}% · cap ${fmtMoney(c.maxRiskDollars, { signed: false })}`, what: 'Sizing risk; halved when the tape reads "selective". Hard dollar cap on a managed loss.',
      measured: <>{overCap.length} of {losses.length} losses exceeded the {fmtMoney(c.maxRiskDollars, { signed: false })} cap · worst <Pnl value={worst || null} /></> },
    { rule: 'Debit ceiling', value: `${fmtMoney(c.maxDebitDollars, { signed: false })} · ${(c.maxDebitPct * 100).toFixed(0)}% of cash`, what: 'Most premium committed to one option trade.',
      measured: debits.length ? <>{overDebit} of {debits.length} option fills above {fmtMoney(c.maxDebitDollars, { signed: false })} · median debit {fmtMoney(median, { signed: false })}</> : <span className="jr-mute">No option fills in view</span> },
    { rule: 'Opening-price guard', value: `not before ${hhmm} ET`, what: 'No fills on delayed option quotes during opening price discovery (live quotes may fill earlier).',
      measured: <>{early} of {trades.length} fills entered before {hhmm} ET</> },
    { rule: 'Chase guard', value: `≤ ${c.maxProgressPct}% to T1`, what: 'Refuses a signal that has already travelled this far from entry toward target 1.', measured: notMeasured },
    { rule: 'Underlying reward/risk', value: `≥ ${c.minUnderlyingRR.toFixed(1)}`, what: 'Minimum R:R of the stock plan before an option is chosen.', measured: notMeasured },
    { rule: 'Option spread', value: `≤ ${(c.maxOptionSpreadPct * 100).toFixed(0)}%`, what: 'Widest bid/ask accepted for a paper fill.', measured: notMeasured },
    { rule: 'Contract ROI at T1', value: `≥ ${c.minContractRoiAtT1Pct}%`, what: 'Modeled contract return if the underlying reaches T1.', measured: notMeasured },
  ];
}
