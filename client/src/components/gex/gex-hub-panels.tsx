/**
 * GEXHubPanels — slim hub chrome:
 *   1. MarketTape  — single-line: regime · session · net GEX · net VEX · futures
 *   2. TopPlaysPanel — actionable, ranked w/ insight (kept)
 *   3. (Sectors collapsed below by host page — not rendered here)
 *
 * The 3 leaderboards (Top +GEX / Top −GEX / Top VEX) and the Score Legend
 * have been REMOVED. They duplicated the confluence list with different sorts.
 * Sort lives on the list itself now.
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { Plus, Check, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { formatGEX } from '../../../../shared/gex-types';
import { componentStyles } from '@/lib/design-tokens';
import type { GEXHubData, TopPlay } from '../../../../shared/gex-types';

function formatVEX(v: number): string {
  const sign = v >= 0 ? '+' : '−';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}B`;
  if (abs >= 1) return `${sign}$${abs.toFixed(1)}M`;
  if (abs >= 0.001) return `${sign}$${(abs * 1000).toFixed(0)}K`;
  if (abs === 0) return '$0';
  return `${sign}$${(abs * 1000).toFixed(1)}K`;
}

function formatDealerFlow(usd: number | undefined | null): string {
  if (!usd && usd !== 0) return '—';
  const sign = usd >= 0 ? '+' : '−';
  const abs = Math.abs(usd);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

interface GEXHubPanelsProps {
  hub: GEXHubData;
}

export function GEXHubPanels({ hub }: GEXHubPanelsProps) {
  return (
    <div className="space-y-3 mb-3">
      <MarketTape hub={hub} />
      {hub.topPlays && hub.topPlays.length > 0 && <TopPlaysPanel plays={hub.topPlays} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MARKET TAPE — one line, no panel, scannable
// ─────────────────────────────────────────────────────────────

const SESSION_LABEL: Record<string, { text: string; tone: string }> = {
  open:        { text: 'OPEN',        tone: 'text-[var(--trade-bullish)]' },
  pre_market:  { text: 'PRE-MARKET',  tone: 'text-[var(--trade-neutral)]' },
  after_hours: { text: 'AFTER HOURS', tone: 'text-violet-400' },
  overnight:   { text: 'OVERNIGHT',   tone: 'text-muted-foreground' },
};

function MarketTape({ hub }: { hub: GEXHubData }) {
  const sess = SESSION_LABEL[hub.session || 'open'] ?? SESSION_LABEL.open;
  const isOff = hub.session && hub.session !== 'open';
  const gexTone = hub.marketNetGEX >= 0 ? 'text-[var(--gex-positive)]' : 'text-[var(--gex-negative)]';
  const vexTone = hub.marketNetVEX >= 0 ? 'text-[var(--gex-positive)]' : 'text-[var(--gex-negative)]';
  const rd = hub.regimeDistribution;
  const total = Math.max(1, rd.total);

  return (
    <div className={cn(componentStyles.card.default, 'px-3 py-2')}>
      <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono">
        <span className={cn('font-bold uppercase tracking-widest', sess.tone)}>{sess.text}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground uppercase tracking-widest text-[9px]">NET GEX</span>
        <span className={cn('font-bold tabular-nums', gexTone)}>{formatGEX(hub.marketNetGEX)}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground uppercase tracking-widest text-[9px]">NET VEX</span>
        <span className={cn('font-bold tabular-nums', vexTone)}>{formatVEX(hub.marketNetVEX)}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground uppercase tracking-widest text-[9px]">REGIME</span>
        <span className="flex items-center gap-1 tabular-nums">
          <span className="text-[var(--gex-positive)]">{rd.positive_gamma}+</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-[var(--gex-negative)]">{rd.negative_gamma}−</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-muted-foreground">{rd.neutral}n</span>
        </span>
        {/* Slim regime bar */}
        <span className="flex h-1 w-24 rounded overflow-hidden bg-muted/30 ml-1">
          <span style={{ width: `${(rd.positive_gamma / total) * 100}%`, backgroundColor: 'var(--gex-positive)', opacity: 0.7 }} />
          <span style={{ width: `${(rd.negative_gamma / total) * 100}%`, backgroundColor: 'var(--gex-negative)', opacity: 0.7 }} />
          <span style={{ width: `${(rd.transitioning / total) * 100}%`, backgroundColor: 'var(--gex-flip)', opacity: 0.7 }} />
        </span>
        <span className="text-muted-foreground/60 text-[9px] ml-auto">
          {hub.totalTickers} tickers
        </span>
      </div>
      {isOff && hub.futures && hub.futures.length > 0 && (
        <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-border/30 text-[9px] font-mono">
          <span className="uppercase tracking-widest text-muted-foreground/60">FUTURES</span>
          {hub.futures.map(f => {
            const t = f.changePct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]';
            return (
              <span key={f.symbol} className="flex items-center gap-1">
                <span className="text-foreground font-bold">{f.symbol.replace('=F', '')}</span>
                <span className={cn('tabular-nums font-bold', t)}>
                  {f.changePct >= 0 ? '+' : ''}{f.changePct.toFixed(2)}%
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TOP PLAYS — kept (genuinely actionable, has insight text)
// ─────────────────────────────────────────────────────────────

const VEX_STYLE: Record<string, { label: string; cls: string }> = {
  positive_rare:      { label: '+VEX',      cls: componentStyles.badge.bullish },
  negative_explosive: { label: 'EXPLOSIVE', cls: componentStyles.badge.bearish },
  negative_strong:    { label: 'STRONG',    cls: componentStyles.badge.warning },
  mild:               { label: 'MILD',      cls: componentStyles.badge.default },
};

const CONV_STYLE: Record<string, string> = {
  high:   componentStyles.badge.bullish,
  medium: componentStyles.badge.warning,
  low:    componentStyles.badge.default,
};

function TopPlaysPanel({ plays }: { plays: TopPlay[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? plays : plays.slice(0, 8);
  const more = plays.length > 8;

  return (
    <div className={cn(componentStyles.card.accentGold, 'overflow-hidden')}>
      <header className="px-3 py-2 border-b border-border/40 bg-muted/20 flex items-center justify-between">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--brand-gold)]">
          Top Plays
          <span className="text-muted-foreground/60 font-normal ml-2">
            · ranked by dealer positioning
          </span>
        </div>
        {more && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[9px] font-mono font-bold uppercase tracking-widest text-muted-foreground hover:text-[var(--brand-gold)]"
          >
            {expanded ? 'collapse' : `+${plays.length - 8} more`}
          </button>
        )}
      </header>
      <div className="divide-y divide-border/30">
        {visible.map((p, i) => <TopPlayRow key={p.symbol} play={p} rank={i + 1} />)}
      </div>
    </div>
  );
}

type SendState = 'idle' | 'sending' | 'sent' | 'error';

function TopPlayRow({ play, rank }: { play: TopPlay; rank: number }) {
  const vex = VEX_STYLE[play.vexSignal] ?? VEX_STYLE.mild;
  const convCls = CONV_STYLE[play.conviction] ?? CONV_STYLE.low;
  const [sendState, setSendState] = useState<SendState>('idle');

  const sendToDesk = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (sendState !== 'idle') return;
    setSendState('sending');
    try {
      // apiRequest attaches the x-csrf-token header (raw fetch was 403'ing).
      const res = await apiRequest('POST', '/api/trade-desk/ideas/from-gex', {
        symbol: play.symbol,
        workflow: 'all',
        bias: play.bias === 'neutral' ? 'auto' : play.bias,
      });
      const body = await res.json().catch(() => ({}));
      setSendState(body.ok ? 'sent' : 'error');
      setTimeout(() => setSendState('idle'), 2400);
    } catch {
      setSendState('error');
      setTimeout(() => setSendState('idle'), 2400);
    }
  };
  const biasTone = play.bias === 'long' ? 'text-[var(--trade-bullish)]'
                 : play.bias === 'short' ? 'text-[var(--trade-bearish)]'
                 : 'text-muted-foreground';

  return (
    <Link href={`/terminal/${play.symbol}`}>
      <div className="px-3 py-2 hover:bg-muted/20 cursor-pointer transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold tabular-nums text-muted-foreground/60 w-4">
            {rank}
          </span>
          <span className="text-[13px] font-mono font-bold text-foreground">{play.symbol}</span>
          <span className={convCls}>{play.conviction}</span>
          <span className={vex.cls}>{vex.label}</span>
          <span className="text-[10px] font-mono tabular-nums text-foreground ml-auto">
            ${play.spotPrice.toFixed(2)}
          </span>
          {play.callWall && (
            <span className="text-[9px] font-mono tabular-nums text-muted-foreground">
              CW ${play.callWall.toFixed(0)}
            </span>
          )}
          {play.putWall && (
            <span className="text-[9px] font-mono tabular-nums text-muted-foreground">
              PW ${play.putWall.toFixed(0)}
            </span>
          )}
          <span className={cn('text-[9px] font-mono font-bold uppercase tracking-widest', biasTone)}>
            {play.bias}
          </span>
          <div className="flex items-center gap-1.5 ml-1">
            <div className="w-12 h-1 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${play.playScore}%`,
                  backgroundColor: play.playScore >= 70 ? 'var(--gex-positive)'
                                  : play.playScore >= 45 ? 'var(--gex-flip)'
                                  : 'var(--muted-foreground)',
                }}
              />
            </div>
            <span className="text-[9px] font-mono font-bold tabular-nums text-muted-foreground w-5">
              {play.playScore}
            </span>
          </div>
          {/* Send to Desk */}
          <button
            type="button"
            onClick={sendToDesk}
            disabled={sendState === 'sending'}
            title={sendState === 'sent' ? 'Idea created' : sendState === 'error' ? 'Failed' : 'Create Trade Desk idea'}
            className={cn(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider transition-colors border ml-1',
              sendState === 'idle'    && 'border-[var(--brand-gold)]/40 text-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/10',
              sendState === 'sending' && 'border-border text-muted-foreground cursor-wait',
              sendState === 'sent'    && 'border-[var(--trade-bullish)]/40 text-[var(--trade-bullish)] bg-[var(--trade-bullish)]/10',
              sendState === 'error'   && 'border-[var(--trade-bearish)]/40 text-[var(--trade-bearish)] bg-[var(--trade-bearish)]/10',
            )}
          >
            {sendState === 'sending' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
            {sendState === 'sent'    && <Check className="w-2.5 h-2.5" />}
            {sendState === 'error'   && <AlertCircle className="w-2.5 h-2.5" />}
            {sendState === 'idle'    && <Plus className="w-2.5 h-2.5" />}
            IDEA
          </button>
        </div>
        <div className="text-[9px] font-mono text-muted-foreground mt-1 pl-6 leading-tight line-clamp-1">
          {play.insight}
        </div>
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTORS PANEL — exported for the page to render in a collapsible
// ─────────────────────────────────────────────────────────────

export function SectorsPanel({ hub }: { hub: GEXHubData }) {
  if (!hub.sectors?.length) return null;
  const maxAbs = Math.max(...hub.sectors.map(s => Math.abs(s.netGEX)), 0.01);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {hub.sectors.map(s => {
        const positive = s.netGEX >= 0;
        const tone = positive ? 'var(--gex-positive)' : 'var(--gex-negative)';
        const w = Math.min(100, (Math.abs(s.netGEX) / maxAbs) * 100);
        return (
          <div key={s.sector} className={cn(componentStyles.card.inset, 'px-2 py-1.5')}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono font-semibold text-foreground truncate">{s.label}</span>
              <span className="text-[10px] font-mono font-bold tabular-nums" style={{ color: tone }}>
                {formatGEX(s.netGEX)}
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden bg-muted/40 my-1">
              <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: tone, opacity: 0.7 }} />
            </div>
            <div className="flex items-center justify-between text-[8px] font-mono uppercase tracking-widest">
              <span className="flex items-center gap-1.5">
                <span className="text-[var(--trade-bullish)]">L {s.bullishCount}</span>
                <span className="text-[var(--trade-bearish)]">S {s.bearishCount}</span>
              </span>
              {s.topPick && (
                <Link href={`/terminal/${s.topPick}`}>
                  <span className="text-foreground hover:text-[var(--brand-gold)] cursor-pointer">
                    ★ {s.topPick}
                  </span>
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { formatDealerFlow };
