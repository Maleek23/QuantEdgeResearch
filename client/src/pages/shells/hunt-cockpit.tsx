/**
 * HUNT — Signals Cockpit (MOMO-style 3-zone template).
 *
 *   ┌─────────────┬───────────────────────────┬──────────────┐
 *   │ ACTIVE      │  SUBJECT                   │  ANALYTICS   │
 *   │ SIGNALS     │  header · chart · thesis   │  gauge ·     │
 *   │ (list)      │  · catalyst                │  components ·│
 *   │             │                            │  key levels  │
 *   └─────────────┴───────────────────────────┴──────────────┘
 *
 * Every cell binds to the real /api/convictions payload (ConvictionPick),
 * real OHLC (/api/historical-prices), real live quote (/api/quotes/batch),
 * and real company logos. Nothing is fabricated; missing data shows honest
 * empty states.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Loader2, AlertTriangle, ArrowUpRight, Camera } from 'lucide-react';
import { SiDiscord } from 'react-icons/si';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { QETabs } from '@/components/ui/qe';
import { COCKPIT_MODES, matchesMode, type CockpitMode } from '@/components/hunt/cockpit/cockpit-modes';

import { TickerLogo } from '@/components/hunt/cockpit/ticker-logo';
import { ConvictionGauge } from '@/components/hunt/cockpit/conviction-gauge';
import { SignalChart } from '@/components/hunt/cockpit/signal-chart';
import { TASummary } from '@/components/hunt/cockpit/ta-summary';
import { ComponentBars } from '@/components/hunt/cockpit/component-bars';
import { KeyLevels } from '@/components/hunt/cockpit/key-levels';
import { SignalRow } from '@/components/hunt/cockpit/signal-row';
import { KpiStrip } from '@/components/hunt/cockpit/kpi-strip';
import { OracleOptionPicker } from '@/components/signal-card/OracleOptionPicker';
import { PriceLadder, ContextPanel, ProfitPlan, TradeGeometry, RiskReward, PositionSize, geometryFor } from '@/components/oracle/signal-detail';
import { EpochChart } from '@/components/charting/epoch-chart';
import { displayedGrade, gradeColorClass } from '@/lib/conviction-display';
import {
  tierLabel, directionTone, convictionPercent, LAYER_COLOR, LAYER_TAG,
  type ConvictionPick, type ConvictionsResponse,
} from '@/lib/convictions';

const RANGES = [
  { id: '5d',  label: '1H', range: '5d',  interval: '60m' },
  { id: '1mo', label: '1D', range: '1mo', interval: '1d' },
  { id: '3mo', label: '1W', range: '3mo', interval: '1d' },
  { id: '6mo', label: '1M', range: '6mo', interval: '1wk' },
] as const;

export default function HuntCockpit() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rangeId, setRangeId] = useState<typeof RANGES[number]['id']>('1mo');
  const [mode, setMode] = useState<CockpitMode>('all');
  const [streamFilter, setStreamFilter] = useState<'new' | 'best' | 'conviction'>('conviction');
  const [sharingDiscord, setSharingDiscord] = useState(false);
  const subjectRef = useRef<HTMLElement>(null);

  // ── Shareable full-board screenshot ──────────────────────────────────────
  // Captures the entire Hunt board (signals list + selected subject + analytics)
  // to a PNG. Scroll/sticky containers are temporarily expanded so nothing is
  // clipped, then restored. Uses the native share sheet when the browser supports
  // sharing files (best for "send to people"); otherwise downloads the PNG.
  const captureRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const [capturing, setCapturing] = useState(false);

  const shareBoard = async () => {
    const node = captureRef.current;
    if (!node || capturing) return;
    setCapturing(true);

    const list = listRef.current;
    const rail = railRef.current;
    const prevList = list ? { maxHeight: list.style.maxHeight, overflow: list.style.overflow } : null;
    const prevRail = rail ? { position: rail.style.position, top: rail.style.top } : null;
    // Lift the scroll clip on the signals list + the sticky on the right rail so
    // the capture shows the full content, not just the viewport slice.
    if (list) { list.style.maxHeight = 'none'; list.style.overflow = 'visible'; }
    if (rail) { rail.style.position = 'static'; rail.style.top = 'auto'; }

    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(node, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: node.scrollWidth,
      });
      const fileName = `quantedge-hunt-${new Date().toISOString().slice(0, 10)}.png`;
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));

      // Prefer the native share sheet (mobile + some desktop) when it can take files.
      const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
      const canShareFile =
        !!file &&
        typeof navigator.canShare === 'function' &&
        (() => { try { return navigator.canShare({ files: [file] }); } catch { return false; } })();

      if (canShareFile && file) {
        await navigator.share({ files: [file], title: 'QuantEdge Hunt', text: 'My QuantEdge Hunt signals' });
      } else {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast({ title: 'Screenshot saved', description: fileName });
      }
    } catch (e) {
      // AbortError = user dismissed the share sheet; not an error worth surfacing.
      if ((e as Error)?.name !== 'AbortError') {
        toast({ title: 'Capture failed', description: 'Could not generate the screenshot.', variant: 'destructive' });
      }
    } finally {
      if (list && prevList) { list.style.maxHeight = prevList.maxHeight; list.style.overflow = prevList.overflow; }
      if (rail && prevRail) { rail.style.position = prevRail.position; rail.style.top = prevRail.top; }
      setCapturing(false);
    }
  };

  // ── Share the selected setup to Discord (ported from the old Trade Desk) ──
  // Renders the center subject card to a PNG and posts it to the dedicated
  // Trade Desk card webhook via the existing /share-discord-card route.
  const shareToDiscord = async (pick: ConvictionPick) => {
    const node = subjectRef.current;
    if (!node || sharingDiscord) return;
    setSharingDiscord(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(node, {
        backgroundColor: '#0a0a0a', scale: 2, useCORS: true, logging: false,
      });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('render failed');
      const form = new FormData();
      form.append('card', blob, `${pick.symbol}_${pick.direction}_card.png`);
      const res = await fetch(`/api/trade-ideas/${pick.ideaId}/share-discord-card`, {
        method: 'POST', body: form, credentials: 'include',
      });
      if (!res.ok) throw new Error(`share failed (${res.status})`);
      toast({ title: 'Sent to Discord', description: `${pick.symbol} card posted.` });
    } catch {
      toast({ title: 'Discord share failed', description: 'Could not post the card.', variant: 'destructive' });
    } finally {
      setSharingDiscord(false);
    }
  };

  // Widened pool (lower floor, higher limit) so the mode tabs — AI Picks / Flow /
  // Lotto / News / Manual — each have ideas to show, giving the cockpit the same
  // reach the standalone Trade Desk had.
  const { data, isLoading, isError } = useQuery<ConvictionsResponse>({
    queryKey: ['/api/convictions', { limit: 40, minScore: 10, watchlistOnly: false }],
    queryFn: async () => {
      const res = await fetch('/api/convictions?limit=40&minScore=10&watchlistOnly=false', { credentials: 'include' });
      if (!res.ok) throw new Error('convictions failed');
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const allPicks = data?.picks ?? [];
  // Per-mode counts for the tab badges.
  const modeCounts = useMemo(() => {
    const counts: Record<CockpitMode, number> = { all: 0, 'ai-picks': 0, flow: 0, lotto: 0, news: 0, manual: 0 };
    for (const m of COCKPIT_MODES) counts[m.id] = allPicks.filter((p) => matchesMode(p, m.id)).length;
    return counts;
  }, [allPicks]);
  // Show "All" plus only the engines that actually have ideas right now.
  const visibleModes = useMemo(
    () => COCKPIT_MODES.filter((m) => m.id === 'all' || modeCounts[m.id] > 0),
    [modeCounts],
  );
  // If the active mode lost its ideas (data refreshed), fall back to "All".
  const activeMode: CockpitMode = visibleModes.some((m) => m.id === mode) ? mode : 'all';
  const picks = useMemo(() => allPicks.filter((p) => matchesMode(p, activeMode)), [allPicks, activeMode]);

  // ─── "What's new" ─────────────────────────────────────────────
  // Discord pings new ideas; the platform needs the same signal. Baseline = the
  // last time the user looked (localStorage); any pick generated after it is NEW.
  // Leaving the page marks everything seen, so the next visit only flags what
  // genuinely arrived since. First-ever visit shows nothing as new (no noise).
  const SEEN_KEY = 'qe:aipicks:lastSeen';
  const [baselineSeen, setBaselineSeen] = useState<number>(() => {
    try { const v = localStorage.getItem(SEEN_KEY); return v ? new Date(v).getTime() : Date.now(); }
    catch { return Date.now(); }
  });
  const isNew = (p: ConvictionPick) => {
    const t = new Date(p.generatedAt).getTime();
    return Number.isFinite(t) && t > baselineSeen;
  };
  const newCount = useMemo(
    () => picks.filter(isNew).length,
    [picks, baselineSeen],
  );
  const markSeen = () => {
    const now = Date.now();
    try { localStorage.setItem(SEEN_KEY, new Date(now).toISOString()); } catch { /* private mode */ }
    setBaselineSeen(now);
    setNewOnly(false);
  };
  useEffect(() => () => {
    try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* private mode */ }
  }, []);
  // ALERT STREAM filter — the three reads the desk actually uses:
  //   NEW        = just fired, nothing else earned yet
  //   BEST       = furthest along toward T1 (already working)
  //   CONVICTION = highest rated regardless of progress
  // A signal is "closed" once price has resolved it — target reached or stop taken out.
  // The convictions feed only returns open ideas, so we classify by geometry rather than
  // inventing a status the backend doesn't track yet.
  const closedToday = picks.filter((p) => {
    const st = geometryFor(p, p.currentPrice ?? p.entryPrice).status;
    return st === 'at_target' || st === 'invalidated';
  });
  const openPicks = picks.filter((p) => !closedToday.includes(p));

  const shown = (() => {
    if (streamFilter === 'new') return openPicks.filter(isNew);
    const px = (p: ConvictionPick) => p.currentPrice ?? p.entryPrice;
    if (streamFilter === 'best') {
      return [...openPicks].sort((a, b) => geometryFor(b, px(b)).progressPct - geometryFor(a, px(a)).progressPct);
    }
    return [...openPicks].sort((a, b) => b.convictionScore - a.convictionScore);
  })();

  const selected: ConvictionPick | undefined =
    shown.find((p) => p.ideaId === selectedId) ?? shown[0] ?? picks[0];

  // Live quote for the selected ticker's header price.
  const { data: quote } = useQuery<{ price: number; change: number; changePct: number }>({
    queryKey: ['/api/quotes/batch', selected?.symbol],
    queryFn: async () => {
      const res = await fetch(`/api/quotes/batch/${selected!.symbol}`, { credentials: 'include' });
      if (!res.ok) throw new Error('quote failed');
      const body = await res.json();
      const q = body?.quotes?.[selected!.symbol];
      if (!q) throw new Error('no quote');
      return { price: q.price, change: q.change, changePct: q.changePercent };
    },
    enabled: !!selected?.symbol,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  const kpis = useMemo(() => {
    const avg = picks.length
      ? picks.reduce((s, p) => s + p.convictionScore, 0) / picks.length
      : 0;
    const top = picks.length ? Math.max(...picks.map((p) => p.convictionScore)) : 0;
    const longs = picks.filter((p) => p.direction === 'long').length;
    const mc = data?.marketContext;
    return [
      { label: 'Active Signals', value: String(picks.length), tone: 'neutral' as const },
      { label: 'Avg Conf', value: avg ? `${convictionPercent(avg)}%` : '—', tone: 'bull' as const },
      { label: 'Top Conf', value: top ? `${convictionPercent(top)}%` : '—', tone: 'bull' as const },
      { label: 'Long / Short', value: `${longs} / ${picks.length - longs}`, tone: 'muted' as const },
      ...(mc ? [{ label: 'Regime', value: mc.regime?.toUpperCase() ?? '—', tone: 'neutral' as const }] : []),
      ...(mc?.vixLevel ? [{ label: 'VIX', value: mc.vixLevel.toFixed(1), tone: 'muted' as const }] : []),
    ];
  }, [picks, data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--brand-cyan)]" />
      </div>
    );
  }

  if (isError || allPicks.length === 0) {
    return (
      <div className="px-4 py-3 space-y-3">
        <div className="flex flex-col items-center justify-center h-[40vh] gap-2 text-center">
          <AlertTriangle className="w-5 h-5 text-[var(--trade-neutral)]" />
          <p className="text-sm font-mono text-muted-foreground">
            {isError ? 'Could not load signals right now.' : 'No active signals match the current filters.'}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground/60">
            The convictions engine returns nothing when no setup clears the score floor — that's expected on quiet days.
          </p>
        </div>
      </div>
    );
  }

  const tone = selected ? directionTone(selected.direction) : 'bull';
  // One live price for every geometry panel, so the ladder / geometry / R:R agree.
  const livePx = quote?.price ?? selected?.currentPrice ?? selected?.entryPrice ?? 0;
  const toneColor = tone === 'bull' ? 'var(--trade-bullish)' : 'var(--trade-bearish)';
  const activeRange = RANGES.find((r) => r.id === rangeId)!;

  // Only show the Catalyst card when it adds NEW information — the convictions feed
  // sometimes falls the thesis back to the catalyst string, so they'd read verbatim.
  const norm = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const showCatalyst =
    !!selected?.catalyst && norm(selected.catalyst) !== norm(selected.thesis);

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Single action bar: MODE engine tabs (left) share one row with the
          share actions (right). The shell already renders the "HUNT" title +
          tab strip above us, so we don't repeat a page header here.
          MODE tabs auto-hide engines with no live ideas, keeping it calm. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {visibleModes.length > 1 ? (
          <QETabs
            items={visibleModes.map((m) => ({ id: m.id, label: m.label, hint: m.hint, count: modeCounts[m.id] }))}
            active={mode}
            onChange={(m) => { setMode(m); setSelectedId(null); }}
            prefixLabel="MODE"
            className="min-w-0"
          />
        ) : (
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
            Ranked Conviction Signals
          </span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {selected && (
            <button
              onClick={() => shareToDiscord(selected)}
              disabled={sharingDiscord}
              title="Post the selected setup card to Discord"
              className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-md border border-[#5865F2]/40 bg-[#5865F2]/10 text-[#8b94f7] hover:bg-[#5865F2]/20 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              data-testid="button-share-discord"
            >
              {sharingDiscord ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SiDiscord className="h-3.5 w-3.5" />}
              {sharingDiscord ? 'Posting…' : 'Discord'}
            </button>
          )}
          <button
            onClick={shareBoard}
            disabled={capturing}
            title="Capture the full Hunt board as a shareable PNG"
            className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-md border border-[var(--brand-cyan)]/30 bg-[var(--brand-cyan)]/10 text-[var(--brand-cyan)] hover:bg-[var(--brand-cyan)]/20 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            data-testid="button-share-board"
          >
            {capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            {capturing ? 'Capturing…' : 'Share board'}
          </button>
        </div>
      </div>

      {picks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[32vh] gap-2 text-center">
          <AlertTriangle className="w-5 h-5 text-[var(--trade-neutral)]" />
          <p className="text-sm font-mono text-muted-foreground">
            No {COCKPIT_MODES.find((m) => m.id === mode)?.label} setups right now.
          </p>
          <p className="text-[11px] font-mono text-muted-foreground/60">
            Switch modes above — other engines may have live ideas.
          </p>
        </div>
      ) : (
      <div ref={captureRef} className="space-y-3">
      <KpiStrip items={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_300px] gap-3 items-start">
        {/* ─── LEFT: signal list ─────────────────────────────── */}
        <aside
          ref={listRef}
          className="space-y-2 max-h-[44vh] overflow-y-auto lg:max-h-[calc(100vh-180px)] pr-1 -mr-1"
        >
          <div className="sticky top-0 z-10 -mx-1 px-2 py-1.5 bg-background/95 backdrop-blur flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">Active Signals</span>
            {/* the NEW count now lives on the NEW tab of the stream filter below, so this
                row just carries the open count + mark-seen (no competing toggle). */}
            <div className="flex items-center gap-1.5">
              {newCount > 0 && (
                <button
                  onClick={markSeen}
                  title="Mark all as seen"
                  className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50 transition-colors hover:text-foreground"
                >
                  seen
                </button>
              )}
              <span className="text-[10px] font-mono text-[var(--brand-cyan)]">{openPicks.length} open</span>
            </div>
          </div>
          {/* NEW / BEST / CONVICTION */}
          <div className="mb-2 flex items-center gap-0.5 rounded bg-foreground/5 p-0.5">
            {([['new', 'NEW'], ['best', 'BEST'], ['conviction', 'CONVICTION']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setStreamFilter(id)}
                className={cn(
                  'flex-1 cursor-pointer rounded px-2 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors',
                  streamFilter === id ? 'bg-foreground/10 text-[var(--brand-cyan)]' : 'text-muted-foreground/55 hover:text-foreground',
                )}
                data-testid={`stream-filter-${id}`}
              >
                {label}{id === 'new' && newCount > 0 ? ` ${newCount}` : ''}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="px-2 py-6 text-center text-[10px] font-mono text-muted-foreground/60">
              {streamFilter === 'new'
                ? <>No new signals right now — <button onClick={() => setStreamFilter('conviction')} className="text-[var(--brand-cyan)] hover:underline">show all {picks.length}</button></>
                : 'No signals match.'}
            </div>
          ) : (
            shown.map((p) => (
              <SignalRow
                key={p.ideaId}
                pick={p}
                live={p.currentPrice ?? undefined}
                selected={selected?.ideaId === p.ideaId}
                isNew={isNew(p)}
                onClick={() => setSelectedId(p.ideaId)}
              />
            ))
          )}

          {/* CLOSED TODAY — signals that already resolved, kept visible for the record */}
          {closedToday.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40">
                Closed today · {closedToday.length}
              </div>
              <div className="space-y-1.5">
                {closedToday.map((p) => (
                  <SignalRow
                    key={p.ideaId}
                    pick={p}
                    closed
                    selected={selected?.ideaId === p.ideaId}
                    onClick={() => setSelectedId(p.ideaId)}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ─── CENTER: subject ───────────────────────────────── */}
        {selected && (
          <main ref={subjectRef} className="space-y-3 min-w-0">
            {/* HERO — identity · live price · levels · chart in ONE card so the
                subject reads as a single unit instead of four stacked boxes. */}
            <CockpitCard bodyClassName="space-y-4">
              {/* identity + live price */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <TickerLogo symbol={selected.symbol} size="lg" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-2xl font-mono font-bold tracking-wide text-foreground">{selected.symbol}</h2>
                      <span
                        className={cn(
                          'text-[11px] font-mono font-bold px-1.5 py-0.5 rounded border',
                          gradeColorClass(displayedGrade(selected)),
                        )}
                      >
                        {displayedGrade(selected)}
                      </span>
                      <span
                        className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ color: toneColor, background: `color-mix(in srgb, ${toneColor} 12%, transparent)` }}
                      >
                        {selected.direction === 'long' ? '▲ BULL' : '▼ BEAR'}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-foreground/[0.05] text-muted-foreground capitalize">
                        {selected.holdingPeriod}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground/60 capitalize mt-0.5 truncate">
                      {selected.sector}{selected.optionType ? ` · ${selected.optionType.toUpperCase()}${selected.strikePrice ? ` $${selected.strikePrice}` : ''}` : ''}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-mono font-bold tabular-nums text-foreground leading-none">
                    {quote ? `$${quote.price.toFixed(2)}` : '—'}
                  </div>
                  {quote && (
                    <div
                      className="text-xs font-mono font-medium tabular-nums mt-1"
                      style={{ color: quote.change >= 0 ? 'var(--trade-bullish)' : 'var(--trade-bearish)' }}
                    >
                      {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePct >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%)
                    </div>
                  )}
                </div>
              </div>

              {/* THE CHART is the focus of the analysis — prominent, right under the header.
                  One universal EpochChart (epoch-anchored, any ticker) with entry/stop/target. */}
              <EpochChart
                symbol={selected.symbol}
                initialTf="1D"
                height={340}
                levels={[
                  { price: selected.entryPrice, color: '#22d3ee', label: 'ENTRY' },
                  { price: selected.stopLoss, color: '#ef4444', label: 'STOP', dashed: true },
                  { price: selected.targetPrice, color: '#22c55e', label: 'T1' },
                ]}
              />

              {/* price ladder + interpretation. Confidence, components, and levels live in the
                  right rail — shown ONCE, not duplicated here. */}
              <div className="grid gap-2 lg:grid-cols-2">
                <PriceLadder pick={selected} live={livePx} />
                <div className="space-y-2">
                  <ContextPanel
                    pick={selected}
                    live={livePx}
                    regime={data?.marketContext?.regime}
                    preferredDirection={data?.marketContext?.preferredDirection}
                  />
                  <ProfitPlan pick={selected} live={livePx} />
                </div>
              </div>

              <TASummary symbol={selected.symbol} />
            </CockpitCard>

            {/* CONTRACT ENGINE — the actionable trade. Renders its own QE-styled
                card (same chrome as everything else now). */}
            {(selected.direction === 'long' || selected.direction === 'short') && (
              <OracleOptionPicker
                key={selected.ideaId}
                autoLoad
                symbol={selected.symbol}
                direction={selected.direction === 'long' ? 'BULL' : 'BEAR'}
                entry={selected.entryPrice}
                stop={selected.stopLoss}
                t1={selected.targetPrice}
                holdPeriodLabel={selected.holdingPeriod}
                conviction={selected.convictionScore}
              />
            )}

            {/* THESIS — the reasoning in prose. The layer-by-layer breakdown lives once,
                in the right rail's Signal Components (no duplicate chips here). */}
            <CockpitCard title="Signal Thesis" meta="Conviction Reasoning">
              <p className="text-[13px] leading-relaxed text-foreground/85">{selected.thesis}</p>
            </CockpitCard>

            {/* CATALYST */}
            {showCatalyst && (
              <CockpitCard title="Catalyst">
                <p className="text-[12px] font-mono text-foreground/80">{selected.catalyst}</p>
                {selected.catalystSourceUrl && (
                  <a
                    href={selected.catalystSourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--brand-cyan)] hover:underline mt-2"
                  >
                    Source <ArrowUpRight className="w-3 h-3" />
                  </a>
                )}
              </CockpitCard>
            )}

            <button
              onClick={() => setLocation(`/r/${selected.symbol}?tab=chart`)}
              className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--brand-cyan)] hover:underline"
            >
              Open {selected.symbol} in Research <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </main>
        )}

        {/* ─── RIGHT: analytics ──────────────────────────────── */}
        {selected && (
          <aside ref={railRef} className="space-y-3 lg:sticky lg:top-3 self-start">
            <CockpitCard title="Confidence Index" meta={<span className="text-[var(--brand-cyan)]">Live</span>}>
              <ConvictionGauge
                score={convictionPercent(selected.convictionScore)}
                tone={tone}
                tierLabel={tierLabel(selected)}
                caption={`Band ${selected.convictionBand} · ${selected.layerCount} layers`}
              />
            </CockpitCard>

            <CockpitCard title="Signal Components">
              <ComponentBars layers={selected.layers} />
            </CockpitCard>

            <PositionSize pick={selected} live={livePx} />
            <TradeGeometry pick={selected} live={livePx} />
            <RiskReward pick={selected} live={livePx} />

            {data?.marketContext && (
              <CockpitCard title="Market Context">
                <div className="space-y-2">
                  <ContextRow label="Regime" value={data.marketContext.regime?.toUpperCase() ?? '—'} />
                  <ContextRow label="Risk" value={data.marketContext.riskSentiment?.toUpperCase() ?? '—'} />
                  <ContextRow
                    label="Bias"
                    value={data.marketContext.preferredDirection?.toUpperCase() ?? '—'}
                    tone={data.marketContext.preferredDirection === 'long' ? 'bull' : data.marketContext.preferredDirection === 'short' ? 'bear' : undefined}
                  />
                  {typeof data.marketContext.vixLevel === 'number' && (
                    <ContextRow label="VIX" value={data.marketContext.vixLevel.toFixed(1)} />
                  )}
                  {data.breadth && (
                    <ContextRow label="Breadth" value={data.breadth.regime?.toUpperCase() ?? '—'} />
                  )}
                  {data.geopolitical?.risk && (
                    <ContextRow
                      label="Geo Risk"
                      value={data.geopolitical.risk.toUpperCase()}
                      tone={/high|elevated/i.test(data.geopolitical.risk) ? 'bear' : undefined}
                    />
                  )}
                </div>
                {data.breadth?.interpretation && (
                  <p className="text-[10px] font-mono text-muted-foreground/60 mt-3 leading-snug border-t border-border/30 pt-2">
                    {data.breadth.interpretation}
                  </p>
                )}
              </CockpitCard>
            )}
          </aside>
        )}
      </div>
      </div>
      )}
    </div>
  );
}

// ─── small inline pieces ────────────────────────────────────────────────────

const STAT_TONE: Record<string, string> = {
  cyan: 'var(--brand-cyan)',
  bull: 'var(--trade-bullish)',
  bear: 'var(--trade-bearish)',
};

/**
 * CockpitCard — the ONE card primitive for the whole cockpit. Uniform chrome
 * (border + radius + bg) and a consistent titled header strip so every panel
 * reads as part of the same system instead of ad-hoc stacked boxes.
 */
function CockpitCard({
  title,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('rounded-lg border border-card-border bg-card overflow-hidden', className)}>
      {(title || meta) && (
        <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/30">
          {title && (
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">{title}</span>
          )}
          {meta && (
            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">{meta}</span>
          )}
        </header>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** A single labelled metric tile — used in the hero's uniform levels grid. */
function StatTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const color = tone ? STAT_TONE[tone] ?? 'var(--foreground)' : 'var(--foreground)';
  return (
    <div className="rounded-md border border-border/30 bg-foreground/[0.02] px-2.5 py-2">
      <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">{label}</div>
      <div className="text-base font-mono font-bold tabular-nums mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

function ContextRow({ label, value, tone }: { label: string; value: string; tone?: 'bull' | 'bear' }) {
  const color = tone === 'bull' ? 'var(--trade-bullish)' : tone === 'bear' ? 'var(--trade-bearish)' : 'var(--foreground)';
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">{label}</span>
      <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

function fmt(n: number | null | undefined): string {
  return typeof n === 'number' && isFinite(n) ? `$${n.toFixed(2)}` : '—';
}
