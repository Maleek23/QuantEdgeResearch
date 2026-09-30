/**
 * /settings — the one account page (2026-09-29 redesign).
 *
 * A plain scrolling page in the page template (LuxPage → flat LuxPanels), no
 * tile workspace. Every control on it writes somewhere that something reads —
 * the old page's dead controls are gone (docs/ADMIN_HUB.md "Settings audit"
 * lists what was kept, removed and added):
 *
 *   Profile            name → PATCH /api/auth/me · email + plan read-only
 *   Display            mode (the ONLY place it is picked) · text size ·
 *                      density · calm · clock                → this device
 *   Trading defaults   default horizon → this device (useHorizonFilter);
 *                      account size / risk % / options budget / capital per
 *                      idea → /api/preferences (read by signal sizing,
 *                      shared/sizing.ts, and the terminal risk drawer);
 *                      watchlist → read from /api/watchlist, managed on NEXUS
 *   Alerts             the alert engine's own prefs (qe-alert-prefs-v1)
 *   Connected accounts Alpaca (journal broker link) · Discord bot (read-only)
 *   Journal            default book · sizing display           → this device
 *   Data & privacy     export my journal CSV · delete my journal (typed confirm)
 *   Admin              the hub link, operator only
 *
 * "This device" settings apply instantly (no Save); account settings have
 * their own Save beside them, so nothing is half-saved by a page-level button.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Download, ShieldCheck, Trash2 } from 'lucide-react';
import { LuxButton, LuxPage, LuxPageHeader, LuxPanel, LuxSegmented, LuxTag } from '@/components/lux';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { MODE_SWATCH, VISUAL_MODES, useVisualMode, type VisualMode } from '@/lib/visual-mode';
import { MODE_ICON, useIsAdmin } from '@/components/shell/mode-menu';
import { usePrefs as useBoardPrefs, setPrefs as setBoardPrefs } from '@/lib/board-prefs';
import { readDefaultHorizon, writeDefaultHorizon, type HorizonFilterValue } from '@/components/ideas/horizon-filter';
import { HORIZON_META, HORIZON_ORDER } from '@shared/idea-horizon';
import { useJournalPrefs } from '@/lib/journal/use-journal';
import { parseJournalKey } from '@shared/journal-sources';
import { toCsv, downloadCsv } from '@/lib/journal/metrics-extra';
import { AlertTypeToggles, AlertDeliveryRows } from '@/components/terminal/terminal-alerts';
import { loadAlertPrefs, saveAlertPrefs, type AlertPrefs } from '@/lib/alerts/alert-engine';
import { RELEASE_LABEL } from '@shared/release';
import '@/styles/settings.css';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'display', label: 'Display' },
  { id: 'trading', label: 'Trading' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'accounts', label: 'Connections' },
  { id: 'journal', label: 'Journal' },
  { id: 'data', label: 'Data & privacy' },
] as const;

type AuthUser = {
  id?: string; email?: string | null; firstName?: string | null; lastName?: string | null;
  subscriptionTier?: string | null; createdAt?: string | null; isAdmin?: boolean;
};

const goTo = (id: string) => {
  document.getElementById(`st-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try { history.replaceState(null, '', `#${id}`); } catch { /* sandboxed */ }
};

/** One labelled row: label + help on the left, control on the right (stacks on a phone). */
function Row({ label, help, htmlFor, children, scope }: { label: ReactNode; help?: ReactNode; htmlFor?: string; children: ReactNode; scope?: 'device' | 'account' }) {
  return (
    <div className="st-row">
      <div className="st-row-l">
        {htmlFor ? <label htmlFor={htmlFor} className="st-label">{label}</label> : <span className="st-label">{label}</span>}
        {help && <p className="st-help">{help}</p>}
      </div>
      <div className="st-row-c">
        {children}
        {scope && <span className="st-scope">{scope === 'device' ? 'this device' : 'your account'}</span>}
      </div>
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={`${label}: ${on ? 'on' : 'off'}`} className="st-switch" onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export default function SettingsPage() {
  const isAdmin = useIsAdmin();

  // Deep links (#display from the account menu) land on the section.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = window.setTimeout(() => document.getElementById(`st-${id}`)?.scrollIntoView({ block: 'start' }), 80);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <LuxPage width="narrow" className="st-page">
      <LuxPageHeader
        section="Account"
        context={RELEASE_LABEL}
        title="Settings"
        purpose="Your profile, how the terminal looks, trading defaults, alerts, connections and your data."
      >
        <nav className="st-jump" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); goTo(s.id); }}>{s.label}</a>
          ))}
          {isAdmin && <Link href="/admin" className="st-jump-admin"><ShieldCheck aria-hidden size={13} /> Admin hub</Link>}
        </nav>
      </LuxPageHeader>

      <ProfileSection />
      <DisplaySection />
      <TradingSection />
      <AlertsSection />
      <ConnectionsSection />
      <JournalSection />
      <DataSection />

      <p className="st-foot">QuantEdge is for education and research only — nothing here is investment advice.</p>
    </LuxPage>
  );
}

/* ── Profile ──────────────────────────────────────────────── */
function ProfileSection() {
  const { user } = useAuth();
  const u = (user ?? null) as AuthUser | null;
  const { toast } = useToast();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  useEffect(() => { setFirst(u?.firstName ?? ''); setLast(u?.lastName ?? ''); }, [u?.firstName, u?.lastName]);
  const dirty = first.trim() !== (u?.firstName ?? '') || last.trim() !== (u?.lastName ?? '');
  const save = useMutation({
    mutationFn: async () => (await apiRequest('PATCH', '/api/auth/me', { firstName: first, lastName: last })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] }); toast({ title: 'Profile saved' }); },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Profile not saved', description: e.message }),
  });
  const initial = (first || u?.email || '?').trim().slice(0, 1).toUpperCase();
  const since = u?.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <LuxPanel id="st-profile" num="01" title="Profile" sub="How you appear in the account menu and on journal notes.">
      <div className="st-profile">
        <div className="st-avatar" aria-hidden>{initial}</div>
        <div className="st-profile-id">
          <b>{[first, last].filter(Boolean).join(' ') || u?.email || 'Guest'}</b>
          <span className="st-help">{u?.email ?? 'not signed in'}</span>
          <span className="st-tags">
            <LuxTag>{(u?.subscriptionTier ?? 'free').toUpperCase()}</LuxTag>
            {u?.isAdmin && <LuxTag tone="accent">OPERATOR</LuxTag>}
            <span className="st-help">member since {since}</span>
          </span>
        </div>
      </div>
      <Row label="First name" htmlFor="st-first" scope="account">
        <input id="st-first" className="st-input" value={first} maxLength={80} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
      </Row>
      <Row label="Last name" htmlFor="st-last" scope="account">
        <input id="st-last" className="st-input" value={last} maxLength={80} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
      </Row>
      <Row label="Email" help="Your sign-in address — read only." htmlFor="st-email">
        <input id="st-email" className="st-input" value={u?.email ?? ''} readOnly aria-readonly />
      </Row>
      <div className="st-actions">
        <LuxButton variant="primary" disabled={!u || !dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save profile'}
        </LuxButton>
      </div>
    </LuxPanel>
  );
}

/* ── Display ──────────────────────────────────────────────── */
/** A miniature of the terminal drawn in one mode's palette (not the active one). */
function ModePreview({ id }: { id: VisualMode }) {
  const c = MODE_SWATCH[id];
  const bars = [0.55, 0.8, 0.4, 0.95, 0.65, 0.3, 0.75];
  return (
    <div className="st-prev" style={{ background: c.bg, borderColor: c.line }} aria-hidden>
      <div className="st-prev-bar" style={{ background: c.surface, borderColor: c.line }}>
        <span style={{ background: c.accent }} /><i style={{ background: c.dim }} />
      </div>
      <div className="st-prev-body">
        <div className="st-prev-card" style={{ background: c.surface, borderColor: c.line }}>
          <b style={{ color: c.text }}>SPY</b>
          <em style={{ color: c.gain }}>+1.24%</em>
          <em style={{ color: c.loss }}>−0.62%</em>
        </div>
        <div className="st-prev-chart" style={{ background: c.hi }}>
          {bars.map((h, i) => <span key={i} style={{ height: `${h * 100}%`, background: i % 3 === 2 ? c.loss : i === 3 ? c.caution : c.accent }} />)}
        </div>
      </div>
      <div className="st-prev-text"><span style={{ background: c.text }} /><span style={{ background: c.dim }} /></div>
    </div>
  );
}

function DisplaySection() {
  const [mode, setMode] = useVisualMode();
  const board = useBoardPrefs();
  const [jp, setJp] = useJournalPrefs();
  const localZone = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'this device'; } }, []);
  return (
    <LuxPanel id="st-display" num="02" title="Display" sub="Applies instantly and is saved on this device. This is the one place the display mode is chosen.">
      <div className="st-modes" role="radiogroup" aria-label="Display mode">
        {VISUAL_MODES.map((m) => {
          const I = MODE_ICON[m.id];
          const on = m.id === mode;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={on} className="st-mode" data-mode-id={m.id} tabIndex={on ? 0 : -1}
              onClick={() => setMode(m.id)}
              onKeyDown={(e) => {
                const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                if (!d) return;
                e.preventDefault();
                const i = VISUAL_MODES.findIndex((x) => x.id === mode);
                const next = VISUAL_MODES[(i + d + VISUAL_MODES.length) % VISUAL_MODES.length];
                setMode(next.id);
                e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-mode-id="${next.id}"]`)?.focus();
              }}>
              <ModePreview id={m.id} />
              <span className="st-mode-name"><I aria-hidden size={14} /> {m.label}{on && <Check aria-hidden size={14} className="st-mode-check" />}</span>
              <span className="st-mode-hint">{m.hint}</span>
            </button>
          );
        })}
      </div>
      <Row label="Text size" help="Scales type across the whole app." scope="device">
        <LuxSegmented label="Text size" value={board.textSize} onChange={(v) => setBoardPrefs({ textSize: v })}
          options={[{ value: 'm', label: 'Standard' }, { value: 'l', label: 'Large' }, { value: 'xl', label: 'Extra large' }]} />
      </Row>
      <Row label="Density" help="Spacing on idea cards and boards. Compact fits more on screen." scope="device">
        <LuxSegmented label="Density" value={board.density} onChange={(v) => setBoardPrefs({ density: v })}
          options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
      </Row>
      <Row label="Calm mode" help="No moving background, glow or pulsing. Independent of the display mode." scope="device">
        <Switch on={board.calm} onChange={(v) => setBoardPrefs({ calm: v })} label="Calm mode" />
      </Row>
      <Row label="Clock" help={<>Times on journal notes, days and the calendar. Trading days are always New York days. This device: {localZone}.</>} scope="device">
        <LuxSegmented label="Clock" value={jp.timeDisplay} onChange={(v) => setJp({ timeDisplay: v })}
          options={[{ value: 'et', label: 'New York (ET)' }, { value: 'local', label: 'This device' }]} />
      </Row>
    </LuxPanel>
  );
}

/* ── Trading defaults ─────────────────────────────────────── */
type SizingPrefs = { accountSize: number; maxRiskPerTrade: number; defaultOptionsBudget: number; defaultCapitalPerIdea: number };
const SIZING_KEYS: (keyof SizingPrefs)[] = ['accountSize', 'maxRiskPerTrade', 'defaultOptionsBudget', 'defaultCapitalPerIdea'];

function NumField({ id, value, onChange, prefix = '$', suffix, step = 1, max }: { id: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; step?: number; max?: number }) {
  return (
    <span className="st-num">
      {!suffix && <i aria-hidden>{prefix}</i>}
      <input id={id} type="number" inputMode="decimal" className="st-input" value={Number.isFinite(value) ? value : ''} step={step} min={0} max={max}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
      {suffix && <i aria-hidden>{suffix}</i>}
    </span>
  );
}

function TradingSection() {
  const { toast } = useToast();
  const [horizon, setHorizon] = useState<HorizonFilterValue>(() => readDefaultHorizon());
  const prefsQ = useQuery<SizingPrefs>({ queryKey: ['/api/preferences'], retry: 1 });
  const [draft, setDraft] = useState<SizingPrefs | null>(null);
  useEffect(() => {
    if (prefsQ.data) setDraft(Object.fromEntries(SIZING_KEYS.map((k) => [k, Number(prefsQ.data![k]) || 0])) as SizingPrefs);
  }, [prefsQ.data]);
  const valid = !!draft && SIZING_KEYS.every((k) => Number.isFinite(draft[k]) && draft[k] >= 0) && draft.maxRiskPerTrade <= 10;
  const dirty = !!draft && !!prefsQ.data && SIZING_KEYS.some((k) => Number(prefsQ.data![k]) !== draft[k]);
  const save = useMutation({
    mutationFn: async (d: SizingPrefs) => (await apiRequest('PATCH', '/api/preferences', d)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/preferences'] }); toast({ title: 'Sizing saved', description: 'Signals size from these numbers now.' }); },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Not saved', description: e.message }),
  });
  const watch = useQuery<{ id: string; symbol: string }[]>({ queryKey: ['/api/watchlist'], retry: 1, staleTime: 60_000 });
  const symbols = useMemo(() => [...new Set((watch.data ?? []).map((w) => w.symbol))].sort(), [watch.data]);
  const risk$ = draft ? (draft.accountSize * draft.maxRiskPerTrade) / 100 : NaN;

  return (
    <LuxPanel id="st-trading" num="03" title="Trading defaults" sub="What boards open on, and the numbers every signal is sized from.">
      <Row label="Default horizon" help="Horizon filters (NEXUS 'Book by horizon') open on this until you pick another there." htmlFor="st-horizon" scope="device">
        <select id="st-horizon" className="st-input st-select" value={horizon}
          onChange={(e) => { const v = e.target.value as HorizonFilterValue; setHorizon(v); writeDefaultHorizon(v); }}>
          <option value="all">All horizons</option>
          {HORIZON_ORDER.map((h) => <option key={h} value={h}>{HORIZON_META[h].label}</option>)}
        </select>
      </Row>

      {prefsQ.isLoading && <p className="st-help st-pad">Loading your sizing numbers…</p>}
      {prefsQ.isError && (
        <p className="st-warn">Couldn't load your sizing numbers — nothing is shown rather than wrong defaults.{' '}
          <button type="button" className="st-linkbtn" onClick={() => prefsQ.refetch()}>Retry</button></p>
      )}
      {draft && (
        <>
          <Row label="Account size" help="Total trading capital." htmlFor="st-acct" scope="account">
            <NumField id="st-acct" value={draft.accountSize} step={500} onChange={(v) => setDraft({ ...draft, accountSize: v })} />
          </Row>
          <Row label="Risk per trade" help="The most one short-dated idea may lose, as % of account size (0–10)." htmlFor="st-risk" scope="account">
            <NumField id="st-risk" value={draft.maxRiskPerTrade} step={0.25} max={10} suffix="%" onChange={(v) => setDraft({ ...draft, maxRiskPerTrade: v })} />
          </Row>
          <Row label="Options budget" help="Premium cap for a short-dated options idea. 0 uses the risk % above." htmlFor="st-opt" scope="account">
            <NumField id="st-opt" value={draft.defaultOptionsBudget} step={50} onChange={(v) => setDraft({ ...draft, defaultOptionsBudget: v })} />
          </Row>
          <Row label="Capital per idea" help="Allocation for long-dated ideas (LEAPS), which are sized as an allocation, not a stop." htmlFor="st-cap" scope="account">
            <NumField id="st-cap" value={draft.defaultCapitalPerIdea} step={100} onChange={(v) => setDraft({ ...draft, defaultCapitalPerIdea: v })} />
          </Row>
          <div className="st-actions">
            <span className="st-help">Risk budget <b className="st-mono">{Number.isFinite(risk$) ? `$${risk$.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}</b> per trade</span>
            {!valid && <span className="st-warn-inline">Numbers ≥ 0; risk ≤ 10%.</span>}
            <LuxButton variant="primary" disabled={!dirty || !valid || save.isPending} onClick={() => draft && save.mutate(draft)}>
              {save.isPending ? 'Saving…' : 'Save sizing'}
            </LuxButton>
          </div>
        </>
      )}

      <Row label="Watchlist" help="The tickers the scanners and alerts follow. Add or remove them on NEXUS.">
        <div className="st-tickers">
          {watch.isLoading ? <span className="st-help">Loading…</span>
            : watch.isError ? <span className="st-help">Couldn't load the watchlist.</span>
            : symbols.length ? <>{symbols.slice(0, 24).map((s) => <LuxTag key={s}>{s}</LuxTag>)}{symbols.length > 24 && <span className="st-help">+{symbols.length - 24} more</span>}</>
            : <span className="st-help">No tickers yet.</span>}
          <Link href="/t" className="st-link">Manage on NEXUS <ArrowRight aria-hidden size={12} /></Link>
        </div>
      </Row>
    </LuxPanel>
  );
}

/* ── Alerts ───────────────────────────────────────────────── */
function AlertsSection() {
  const [prefs, setPrefs] = useState<AlertPrefs>(() => loadAlertPrefs());
  const update = (p: AlertPrefs) => { setPrefs(p); saveAlertPrefs(p); };
  return (
    <LuxPanel id="st-alerts" num="04" title="Alerts" sub="Signal state changes, detected while the platform is open. Saved on this device — the same settings as the Alerts page."
      meta={<Link href="/alerts" className="st-link">Alerts page <ArrowRight aria-hidden size={12} /></Link>}>
      <div className="st-alerts">
        <AlertTypeToggles prefs={prefs} update={update} />
        <AlertDeliveryRows prefs={prefs} update={update} />
      </div>
      <Row label="Alert sounds" help="A short sound when an alert fires." scope="device">
        <Switch on={prefs.sound} onChange={(v) => update({ ...prefs, sound: v })} label="Alert sounds" />
      </Row>
      <Row label="Watchlist only" help="Only alert on tickers in your watchlist." scope="device">
        <Switch on={prefs.watchlistOnly} onChange={(v) => update({ ...prefs, watchlistOnly: v })} label="Alert on watchlist tickers only" />
      </Row>
    </LuxPanel>
  );
}

/* ── Connected accounts ───────────────────────────────────── */
type AlpacaStatus = { connection: { paper?: boolean; keyHint?: string | null; lastSyncAt?: string | null } | null; canStoreKeys: boolean };
type SourcesResp = { sources: { key: string; label: string }[]; isAdmin: boolean; capabilities: { discordBot: boolean; brokerKeys: boolean; serverAlpaca: boolean } };

function ConnectionsSection() {
  const { toast } = useToast();
  const alpaca = useQuery<AlpacaStatus>({ queryKey: ['/api/journal/broker/alpaca'], retry: 0 });
  const sources = useQuery<SourcesResp>({ queryKey: ['/api/journal/sources'], retry: 0, staleTime: 60_000 });
  const disconnect = useMutation({
    mutationFn: async () => (await apiRequest('DELETE', '/api/journal/broker/alpaca')).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/journal/broker/alpaca'] }); toast({ title: 'Alpaca disconnected', description: 'The saved keys were deleted. Imported trades stay in your journal.' }); },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Not disconnected', description: e.message }),
  });
  const conn = alpaca.data?.connection;
  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never');

  return (
    <LuxPanel id="st-accounts" num="05" title="Connected accounts" sub="Read-only links that feed your journal. QuantEdge never places orders.">
      <Row label="Alpaca" help={conn
        ? <>Linked ({conn.paper ? 'paper' : 'live'}{conn.keyHint ? ` · key …${conn.keyHint}` : ''}). Last sync {fmt(conn.lastSyncAt)}.</>
        : 'Imports your filled orders into the Mine journal. Keys are entered on the journal Import page and stored encrypted.'}>
        {alpaca.isLoading ? <span className="st-help">Checking…</span>
          : alpaca.isError ? <span className="st-help">Status unavailable (journal access needed).</span>
          : conn ? (
            <span className="st-inline">
              <LuxTag tone="accent">CONNECTED</LuxTag>
              <LuxButton variant="ghost" disabled={disconnect.isPending}
                onClick={() => { if (window.confirm('Disconnect Alpaca? The saved keys are deleted; imported trades stay.')) disconnect.mutate(); }}>Disconnect</LuxButton>
            </span>
          ) : (
            <span className="st-inline">
              <LuxTag>NOT CONNECTED</LuxTag>
              <Link href="/t?tab=journal&jtab=import" className="st-link">Connect <ArrowRight aria-hidden size={12} /></Link>
            </span>
          )}
      </Row>
      <Row label="Discord" help="The server-side bot that imports trader calls into their journals. Set up by the operator — nothing to connect per user.">
        {sources.isLoading ? <span className="st-help">Checking…</span>
          : sources.data ? <LuxTag tone={sources.data.capabilities.discordBot ? 'accent' : 'mute'}>{sources.data.capabilities.discordBot ? 'BOT CONFIGURED' : 'NOT CONFIGURED'}</LuxTag>
          : <span className="st-help">Status unavailable.</span>}
      </Row>
    </LuxPanel>
  );
}

/* ── Journal ──────────────────────────────────────────────── */
function JournalSection() {
  const [jp, setJp] = useJournalPrefs();
  const sources = useQuery<SourcesResp>({ queryKey: ['/api/journal/sources'], retry: 0, staleTime: 60_000 });
  const books = sources.data?.sources?.length ? sources.data.sources : [{ key: 'mine', label: 'Mine' }, { key: 'bot', label: 'Bot' }, { key: 'desk', label: 'Trade desk' }];
  return (
    <LuxPanel id="st-journal" num="06" title="Journal" sub="Defaults for the trade journal. Saved on this device."
      meta={<Link href="/t?tab=journal" className="st-link">Open journal <ArrowRight aria-hidden size={12} /></Link>}>
      <Row label="Default book" help="Opened when a link doesn't name a book. Links that do still win." htmlFor="st-book" scope="device">
        <select id="st-book" className="st-input st-select" value={jp.defaultBook} onChange={(e) => setJp({ defaultBook: parseJournalKey(e.target.value) })}>
          {books.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
      </Row>
      <Row label="Sizing rule" help="Show each book's sizing rule under its basis line, or tuck it away." scope="device">
        <LuxSegmented label="Sizing rule" value={jp.sizing} onChange={(v) => setJp({ sizing: v })}
          options={[{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Collapse' }]} />
      </Row>
    </LuxPanel>
  );
}

/* ── Data & privacy ───────────────────────────────────────── */
function DataSection() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [asking, setAsking] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const r = await fetch('/api/journal/trades?journal=mine', { credentials: 'include' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`);
      const { trades } = (await r.json()) as { trades: Record<string, unknown>[] };
      if (!trades?.length) { toast({ title: 'Nothing to export', description: 'Your journal (Mine) has no trades yet.' }); return; }
      const cols = [...new Set(trades.flatMap((t) => Object.keys(t)))];
      const cell = (v: unknown) => (v == null ? null : typeof v === 'object' ? JSON.stringify(v) : (v as string | number));
      downloadCsv(`quantedge-journal-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([cols, ...trades.map((t) => cols.map((c) => cell(t[c])))]));
      toast({ title: 'Journal exported', description: `${trades.length} trades.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Export failed', description: (e as Error).message });
    } finally { setExporting(false); }
  };

  const wipe = useMutation({
    mutationFn: async () => (await (await apiRequest('DELETE', '/api/journal/trades/all?journal=mine')).json()) as { deleted: number },
    onSuccess: (r) => { setAsking(false); setConfirmText(''); queryClient.invalidateQueries(); toast({ title: 'Journal deleted', description: `${r.deleted} trades removed.` }); },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Not deleted', description: e.message }),
  });

  return (
    <LuxPanel id="st-data" num="07" title="Data & privacy" sub="Your journal (the Mine book) — take a copy, or remove it.">
      <Row label="Export my journal" help="Every trade in your Mine book as CSV, all columns.">
        <LuxButton onClick={exportCsv} disabled={exporting}><Download aria-hidden /> {exporting ? 'Exporting…' : 'Download CSV'}</LuxButton>
      </Row>
      <Row label="Delete my journal" help="Permanently deletes every trade in your Mine book. Export first — this can't be undone. Bot, Trade desk and trader books are not touched.">
        {!asking ? (
          <LuxButton className="st-danger" onClick={() => setAsking(true)}><Trash2 aria-hidden /> Delete…</LuxButton>
        ) : (
          <span className="st-confirm">
            <label htmlFor="st-del" className="st-help">Type DELETE to confirm</label>
            <input id="st-del" className="st-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            <LuxButton className="st-danger" disabled={confirmText !== 'DELETE' || wipe.isPending} onClick={() => wipe.mutate()}>{wipe.isPending ? 'Deleting…' : 'Delete all'}</LuxButton>
            <LuxButton variant="ghost" onClick={() => { setAsking(false); setConfirmText(''); }}>Cancel</LuxButton>
          </span>
        )}
      </Row>
    </LuxPanel>
  );
}
