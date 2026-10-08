/**
 * Desk portal (docs/DESK_ADMINS.md) — /desk (your desk) and /desk/:slug (the
 * super-admin opens any desk). A desk admin runs ONE trader book: their paper
 * bot (sleeves, risk, filters within platform caps), their book (passcode,
 * import, privacy), their watchlist. Platform admin (users, invites, waitlist,
 * env) is not here and the server refuses it to desk admins.
 *
 *   GET   /api/desk/:slug            overview      PATCH /api/desk/:slug/bot      settings
 *   GET   /api/desk/:slug/bot        settings      POST  /api/desk/:slug/bot/enabled
 *   PUT   /api/desk/:slug/passcode   book lock     PUT   /api/desk/:slug/privacy  group sharing
 *   GET/POST/DELETE /api/traders/:slug/watchlist   the desk watchlist (existing endpoints)
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LuxButton, LuxKpi, LuxKpiGrid, LuxPage, LuxPageHeader, LuxPanel, LuxTag } from '@/components/lux';
import { QEEmpty, QEError } from '@/components/ui/qe-states';
import { useToast } from '@/hooks/use-toast';
import { adminWrite, fmtAgo, getJson } from '@/components/admin/hub-data';
import { useDeskRole } from '@/lib/desk-role';
import { DESK_BOT_CAPS, fmtEt, type DeskBotConfig } from '@shared/desk-admin';
import '@/styles/admin-hub.css';

interface Overview {
  trader: { slug: string; name: string; handle: string | null; source: string | null; locked: boolean };
  shareWithGroup: boolean;
  deskAdmin: { email: string; name: string | null; hasBetaAccess: boolean } | null;
  viewer: { role: 'super' | 'desk' };
  bot: {
    setUp?: boolean; enabled?: boolean; error?: string; startingCapital?: number;
    lastCycle?: { at: string; opened: number; closed: number; openCount: number; error?: string } | null;
    portfolio: { id: string; name: string } | null; cash: number | null; totalValue: number | null; realizedPnL: number; unrealizedPnL: number | null;
    open: { id: string; symbol: string; optionType: string | null; strikePrice: number | null; expiryDate: string | null; quantity: number; entryPrice: number; currentPrice: number | null; markAgeMin: number | null; unrealizedPnL: number | null }[];
    closed: { id: string; symbol: string; exitTime: string | null; exitReason: string | null; realizedPnL: number | null }[];
    wins: number; losses: number;
  };
  book: { trades?: number; open?: number; closed?: number; wins?: number; losses?: number; winRate?: number | null; realizedPnL?: number; error?: string };
}
interface BotSettings { enabled: boolean; shareWithGroup: boolean; config: DeskBotConfig; caps: typeof DESK_BOT_CAPS; maxBlocked: number; maxBots: number; updatedAt: string | null }

const money = (n: number | null | undefined) => (n == null ? '—' : `${n < 0 ? '−' : n > 0 ? '+' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
const tone = (n: number | null | undefined) => (n == null || n === 0 ? undefined : n > 0 ? 'gain' : 'loss') as 'gain' | 'loss' | undefined;

export default function DeskPortal() {
  const params = useParams<{ slug?: string }>();
  const role = useDeskRole();
  const [, setLocation] = useLocation();
  const slug = (params.slug ?? role.deskSlug ?? '').toLowerCase();

  if (role.isLoading) return <LuxPage><p className="ah-note">Loading…</p></LuxPage>;
  if (!role.enabled) {
    return (
      <LuxPage>
        <LuxPageHeader section="Desk" title="Desk pages aren’t open yet" purpose="Trader desk pages haven’t been switched on for this account. Your journal and the rest of the terminal work as usual." />
        <p className="ah-note"><Link href="/today">← Back to Today</Link></p>
      </LuxPage>
    );
  }
  if (!slug) {
    return (
      <LuxPage>
        <LuxPageHeader section="Desk" title={role.isSuperAdmin ? 'Pick a desk' : 'You do not run a desk'}
          purpose={role.isSuperAdmin ? 'Every trader book has a desk. Open one to see and manage it.' : 'An admin links your account to your trader book. Ask the desk admin, then reload.'} />
        {role.isSuperAdmin && (
          <LuxPanel title="Desks">
            <div className="ah-acts" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {role.desks.map((d) => <LuxButton key={d.slug} onClick={() => setLocation(`/desk/${d.slug}`)}>{d.name}</LuxButton>)}
            </div>
          </LuxPanel>
        )}
      </LuxPage>
    );
  }
  return <Desk slug={slug} superAdmin={role.isSuperAdmin} desks={role.desks} />;
}

function Desk({ slug, superAdmin, desks }: { slug: string; superAdmin: boolean; desks: { slug: string; name: string }[] }) {
  const [, setLocation] = useLocation();
  const ov = useQuery<Overview>({ queryKey: [`/api/desk/${slug}`], queryFn: () => getJson(`/api/desk/${slug}`), refetchInterval: 60_000 });
  if (ov.isError) {
    return (
      <LuxPage>
        <QEError title="This desk didn't load" message={/403/.test((ov.error as Error)?.message ?? '') ? 'This is not your desk.' : (ov.error as Error)?.message ?? ''} onRetry={() => void ov.refetch()} />
      </LuxPage>
    );
  }
  const o = ov.data;
  return (
    <LuxPage width="wide">
      <LuxPageHeader
        section="Desk"
        context={o ? `${o.trader.slug}${o.viewer.role === 'super' ? ' · viewing as platform admin' : ''}` : slug}
        title={<span data-testid="text-desk-title">{o ? `${o.trader.name}'s desk` : 'Desk'}</span>}
        purpose="Your paper bot, your journal book and your watchlist. Paper only — no broker, no real money."
        actions={superAdmin && desks.length ? (
          <select className="ah-select" value={slug} aria-label="Open another desk" onChange={(e) => setLocation(`/desk/${e.target.value}`)}>
            {desks.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>
        ) : undefined}
      />
      {!o ? <p className="ah-note">Loading…</p> : (
        <div className="ah-stack">
          <OverviewPanel o={o} />
          <BotPanel slug={slug} superAdmin={superAdmin} />
          <BookPanel slug={slug} o={o} />
          <WatchlistPanel slug={slug} name={o.trader.name} />
          <AccountPanel o={o} />
        </div>
      )}
    </LuxPage>
  );
}

function OverviewPanel({ o }: { o: Overview }) {
  const b = o.bot;
  const pnl = b.totalValue != null && b.startingCapital ? b.totalValue - b.startingCapital : null;
  return (
    <>
      <LuxKpiGrid cols={4}>
        <LuxKpi label="Bot · paper P&L" value={money(pnl)} tone={tone(pnl)} sub={b.portfolio ? `of $${(b.startingCapital ?? 0).toLocaleString()} fresh book` : b.enabled ? 'no fills yet' : 'bot is off'} />
        <LuxKpi label="Bot · realized" value={money(b.realizedPnL)} tone={tone(b.realizedPnL)} sub={`${b.wins} win · ${b.losses} loss`} />
        <LuxKpi label="Book · realized" value={money(o.book.realizedPnL ?? null)} tone={tone(o.book.realizedPnL)} sub={`${o.book.closed ?? 0} closed · ${o.book.open ?? 0} open${o.book.winRate != null ? ` · ${o.book.winRate}% win` : ''}`} />
        <LuxKpi label="Last bot cycle" value={b.lastCycle ? fmtAgo(b.lastCycle.at) : '—'} sub={b.lastCycle ? (b.lastCycle.error ?? `+${b.lastCycle.opened} / −${b.lastCycle.closed} · ${b.lastCycle.openCount} open`) : b.setUp === false ? 'desk bots not set up yet' : 'no cycle on this server yet'} />
      </LuxKpiGrid>
      {!!b.open?.length && (
        <LuxPanel title="Bot · open positions" sub="Marks are the bot's last re-price, with their age — not live quotes." flush>
          <div className="ah-scroll">
            <table className="ah-table ah-rows">
              <thead><tr><th>Contract</th><th>Qty</th><th>Entry</th><th>Mark</th><th>Unrealized</th></tr></thead>
              <tbody>
                {b.open.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Contract">{p.symbol}{p.optionType ? ` ${p.strikePrice}${p.optionType[0].toUpperCase()} ${p.expiryDate ?? ''}` : ''}</td>
                    <td data-label="Qty">{p.quantity}</td>
                    <td data-label="Entry">{p.entryPrice}</td>
                    <td data-label="Mark">{p.currentPrice ?? '—'}{p.markAgeMin != null ? <span className="ah-sub2">{p.markAgeMin}m old</span> : <span className="ah-sub2">never marked</span>}</td>
                    <td data-label="Unrealized"><LuxTag tone={tone(p.unrealizedPnL)}>{money(p.unrealizedPnL)}</LuxTag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </LuxPanel>
      )}
    </>
  );
}

type NumKey = keyof typeof DESK_BOT_CAPS;
const SLEEVE_KEYS: NumKey[] = ['zeroDteMax', 'zeroDteRiskUsd', 'swingMax', 'swingRiskUsd', 'swingMaxDebitUsd', 'swingMinGrade'];
const FILTER_KEYS: NumKey[] = ['maxProgressPct', 'minUnderlyingRR', 'minContractRoiAtT1Pct', 'minStopWidthPct'];

function BotPanel({ slug, superAdmin }: { slug: string; superAdmin: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = `/api/desk/${slug}/bot`;
  const q = useQuery<BotSettings>({ queryKey: [key], queryFn: () => getJson(key) });
  const [draft, setDraft] = useState<DeskBotConfig | null>(null);
  const [blocked, setBlocked] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) { setDraft(q.data.config); setBlocked(q.data.config.blockedSymbols.join(', ')); } }, [q.data]);
  const dirty = useMemo(() => !!draft && !!q.data && (JSON.stringify(draft) !== JSON.stringify(q.data.config) || blocked !== q.data.config.blockedSymbols.join(', ')), [draft, q.data, blocked]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); toast({ title: label }); await qc.invalidateQueries({ queryKey: [key] }); void qc.invalidateQueries({ queryKey: [`/api/desk/${slug}`] }); }
    catch (e) { toast({ title: 'Not saved', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  if (q.isError) return <LuxPanel title="Bot"><QEError title="Bot settings didn't load" message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} /></LuxPanel>;
  if (!q.data || !draft) return <LuxPanel title="Bot"><p className="ah-note">Loading…</p></LuxPanel>;
  const caps = q.data.caps;
  const num = (k: NumKey) => (
    <label key={k} className="ah-field" style={{ display: 'grid', gap: 4 }}>
      <span className="ah-mute">{caps[k].label}{caps[k].unit ? ` (${caps[k].unit})` : ''} · {caps[k].min}–{caps[k].max}</span>
      <input className="ah-input" type="number" min={caps[k].min} max={caps[k].max} step={caps[k].step} value={(draft as unknown as Record<string, number>)[k]}
        onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} aria-label={caps[k].label} data-testid={`input-bot-${k}`} />
    </label>
  );
  const save = () => {
    const syms = blocked.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return run('Bot settings saved', () => adminWrite('PATCH', key, { ...draft, blockedSymbols: syms }));
  };

  return (
    <LuxPanel title="Bot" meta={<LuxTag tone={q.data.enabled ? 'accent' : 'mute'}>{q.data.enabled ? 'ON' : 'OFF'}</LuxTag>}
      sub={`Same engine as the Quantinum Bot — the 0DTE and swing sleeves and every platform gate — on your own fresh $100K paper book. At most ${q.data.maxBots} desk bots run at once.`}>
      <div className="ah-bar" style={{ marginBottom: 12 }}>
        <LuxButton variant={q.data.enabled ? 'outline' : 'primary'} disabled={busy} data-testid="button-bot-toggle"
          onClick={() => void run(q.data!.enabled ? 'Bot turned off' : 'Bot turned on', () => adminWrite('POST', `${key}/enabled`, { enabled: !q.data!.enabled }))}>
          {q.data.enabled ? 'Turn bot off' : 'Turn bot on'}
        </LuxButton>
        {superAdmin && <LuxButton disabled={busy} title="One cycle now (platform admin only)" onClick={() => void run('Cycle requested', () => adminWrite('POST', `${key}/run`, {}))}>Run a cycle</LuxButton>}
        {q.data.updatedAt && <span className="ah-mute">Settings changed {fmtAgo(q.data.updatedAt)}</span>}
      </div>
      <h3 className="ah-h3">Sleeves</h3>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>{SLEEVE_KEYS.map(num)}</div>
      <h3 className="ah-h3" style={{ marginTop: 14 }}>Filters</h3>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {FILTER_KEYS.map(num)}
        <label className="ah-field" style={{ display: 'grid', gap: 4 }}>
          <span className="ah-mute">Entry window (ET) · {fmtEt(caps.entryStartEt.min)}–{fmtEt(caps.entryEndEt.max)}</span>
          <span className="ah-bar">
            <input className="ah-input" type="time" value={fmtEt(draft.entryStartEt)} aria-label="Entries from"
              onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); setDraft({ ...draft, entryStartEt: h * 60 + m }); }} />
            <input className="ah-input" type="time" value={fmtEt(draft.entryEndEt)} aria-label="Entries until"
              onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); setDraft({ ...draft, entryEndEt: h * 60 + m }); }} />
          </span>
        </label>
        <label className="ah-field" style={{ display: 'grid', gap: 4 }}>
          <span className="ah-mute">Universe</span>
          <select className="ah-select" value={draft.universe} onChange={(e) => setDraft({ ...draft, universe: e.target.value as DeskBotConfig['universe'] })} aria-label="Universe">
            <option value="board">Every published idea</option><option value="watchlist">Only my watchlist</option>
          </select>
        </label>
        <label className="ah-check"><input type="checkbox" checked={draft.allowLongs} onChange={(e) => setDraft({ ...draft, allowLongs: e.target.checked })} /> Longs</label>
        <label className="ah-check"><input type="checkbox" checked={draft.allowShorts} onChange={(e) => setDraft({ ...draft, allowShorts: e.target.checked })} /> Shorts</label>
        <label className="ah-field" style={{ display: 'grid', gap: 4, gridColumn: '1 / -1' }}>
          <span className="ah-mute">Never trade (tickers, comma-separated, up to {q.data.maxBlocked})</span>
          <input className="ah-input ah-grow" value={blocked} onChange={(e) => setBlocked(e.target.value.toUpperCase())} placeholder="TSLA, COIN" aria-label="Blocked tickers" />
        </label>
      </div>
      <div className="ah-bar" style={{ marginTop: 12 }}>
        <LuxButton variant="primary" disabled={!dirty || busy} onClick={() => void save()} data-testid="button-bot-save">Save settings</LuxButton>
        <LuxButton variant="ghost" disabled={!dirty || busy} onClick={() => { setDraft(q.data!.config); setBlocked(q.data!.config.blockedSymbols.join(', ')); }}>Undo</LuxButton>
      </div>
      <p className="ah-note" style={{ marginTop: 8 }}>Caps are set by the platform: a desk bot can be stricter than the Quantinum Bot, never looser. Spread, quote and loss rules are the platform's.</p>
    </LuxPanel>
  );
}

function BookPanel({ slug, o }: { slug: string; o: Overview }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); toast({ title: label }); setCode(''); await qc.invalidateQueries({ queryKey: [`/api/desk/${slug}`] }); }
    catch (e) { toast({ title: 'Not saved', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <LuxPanel title="Journal book" meta={<LuxTag tone={o.trader.locked ? 'accent' : 'caution'}>{o.trader.locked ? 'PASSCODE SET' : 'NO PASSCODE'}</LuxTag>}
      sub={`${o.book.trades ?? 0} trades in ${o.trader.name}'s book. Trades you mark "I took this" on NEXUS land here, labelled QuantEdge idea.`}>
      <div className="ah-bar">
        <Link href={`/t?tab=journal&jtab=trades`} className="lx-btn" data-variant="outline">Open the journal</Link>
        <Link href={`/t?tab=journal&jtab=import`} className="lx-btn" data-variant="outline">Import trades</Link>
      </div>
      <h3 className="ah-h3" style={{ marginTop: 14 }}>Passcode</h3>
      <div className="ah-bar">
        <input className="ah-input" type="password" autoComplete="new-password" minLength={6} maxLength={128} placeholder="new passcode (6+)"
          value={code} onChange={(e) => setCode(e.target.value)} aria-label="New book passcode" data-testid="input-desk-passcode" />
        <LuxButton variant="primary" disabled={busy || code.length < 6} onClick={() => void act('Passcode set', () => adminWrite('PUT', `/api/desk/${slug}/passcode`, { passcode: code }))}>{o.trader.locked ? 'Change' : 'Set'}</LuxButton>
        {o.trader.locked && <LuxButton className="ah-danger" disabled={busy} onClick={() => void act('Passcode cleared', () => adminWrite('PUT', `/api/desk/${slug}/passcode`, { passcode: '' }))}>Clear</LuxButton>}
      </div>
      <h3 className="ah-h3" style={{ marginTop: 14 }}>Privacy</h3>
      <label className="ah-check">
        <input type="checkbox" checked={o.shareWithGroup} disabled={busy} data-testid="toggle-share-book"
          onChange={(e) => void act(e.target.checked ? 'Book shared with the group' : 'Book is private', () => adminWrite('PUT', `/api/desk/${slug}/privacy`, { shareWithGroup: e.target.checked }))} />
        Share my book with the group
      </label>
      <p className="ah-note">Off (the default): only you and the platform admin see this book, its watchlist, its stats and which QuantEdge ideas you took. On: other members can see it too (a passcode still locks it).</p>
    </LuxPanel>
  );
}

function WatchlistPanel({ slug, name }: { slug: string; name: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = `/api/traders/${slug}/watchlist`;
  const q = useQuery<{ canWrite: boolean; items: { id: string; symbol: string; note: string | null }[] }>({ queryKey: [key], queryFn: () => getJson(key) });
  const [sym, setSym] = useState('');
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); toast({ title: label }); await qc.invalidateQueries({ queryKey: [key] }); }
    catch (e) { toast({ title: 'Not saved', description: (e as Error).message, variant: 'destructive' }); }
  };
  return (
    <LuxPanel title="Watchlist & alerts" sub={`${name}'s watchlist — the bot's universe when it is set to "Only my watchlist". Price and idea alerts for your account live on Alerts.`}>
      {q.isError && <QEError title="Watchlist didn't load" message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />}
      {q.data?.canWrite && (
        <form className="ah-bar" style={{ marginBottom: 10 }} onSubmit={(e) => { e.preventDefault(); const s = sym.trim(); if (s) void run(`${s} added`, () => adminWrite('POST', key, { symbol: s })).then(() => setSym('')); }}>
          <input className="ah-input" value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} placeholder="NVDA" aria-label="Add a ticker" maxLength={12} />
          <LuxButton type="submit" variant="primary" disabled={!sym.trim()}>Add</LuxButton>
          <Link href="/alerts" className="lx-btn" data-variant="ghost">Alerts</Link>
        </form>
      )}
      {q.data && !q.data.items.length && <QEEmpty title="No tickers yet" message="Add the names you trade." />}
      {!!q.data?.items.length && (
        <div className="ah-acts" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {q.data.items.map((i) => (
            <LuxTag key={i.id} tone="mute">
              {i.symbol}
              {q.data!.canWrite && <button type="button" className="ah-x" aria-label={`Remove ${i.symbol}`} onClick={() => void run(`${i.symbol} removed`, () => adminWrite('DELETE', `${key}/${encodeURIComponent(i.id)}`))}> ×</button>}
            </LuxTag>
          ))}
        </div>
      )}
    </LuxPanel>
  );
}

function AccountPanel({ o }: { o: Overview }) {
  return (
    <LuxPanel title="Account" sub="Your own sign-in, profile and NEXUS display preferences — the same Settings every member has.">
      <div className="ah-bar">
        <span>{o.deskAdmin ? <>{o.deskAdmin.email}{o.deskAdmin.name ? ` · ${o.deskAdmin.name}` : ''}</> : <span className="ah-mute">No desk admin linked to this book yet</span>}</span>
        {o.deskAdmin && !o.deskAdmin.hasBetaAccess && <LuxTag tone="caution">NO BETA ACCESS — journal and watchlist need it</LuxTag>}
        <Link href="/settings" className="lx-btn" data-variant="outline">Settings</Link>
      </div>
    </LuxPanel>
  );
}
