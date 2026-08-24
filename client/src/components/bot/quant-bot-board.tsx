/**
 * QUANT BOT — the platform trading its own signals, on paper.
 *
 * Everything else here produces opinions. This is the only surface that answers "did they
 * work". The bot takes the highest-conviction signals into a paper portfolio and manages
 * them against their own stop and target, so the equity curve is the engine's actual
 * record — not a backtest, not a claim.
 *
 * It states what it doesn't know: no win rate is shown until trades have actually closed.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TC, pnlColor } from '@/lib/oracle/trading-colors';
import { apiRequest } from '@/lib/queryClient';
import { RangeBar, DecayBar, Meter, LiveValue } from '@/components/viz';
import { daysToExpiry, formatExpiry } from '@/lib/market-date';

interface Position {
  id: string; symbol: string; direction: string; entryPrice: number; currentPrice?: number;
  quantity: number; targetPrice?: number; stopLoss?: number; unrealizedPnL?: number;
  unrealizedPnLPercent?: number; realizedPnL?: number; entryReason?: string;
  entryTime?: string; exitReason?: string; status?: string;
  assetType?: string; optionType?: string | null; strikePrice?: number | null;
  expiryDate?: string | null;
}

/** Days until a contract expires — the clock that only options have. */
const dte = (expiry?: string | null) => daysToExpiry(expiry);
interface BotStatus {
  portfolioId: string; name: string;
  startingCapital: number; cashBalance: number; totalValue: number;
  totalPnL: number; totalPnLPercent: number;
  winCount: number; lossCount: number; winRate: number | null;
  openPositions: Position[]; closedPositions: Position[];
  config: { minConviction: number; maxOpen: number; riskPerTradePct: number };
}

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function QuantBotBoard({ onSelectSymbol }: { onSelectSymbol?: (s: string) => void }) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery<BotStatus>({
    queryKey: ['/api/quant-bot/status'],
    queryFn: async () => {
      const r = await fetch('/api/quant-bot/status', { credentials: 'include' });
      if (!r.ok) throw new Error('bot status failed');
      return r.json();
    },
    staleTime: 30_000, refetchInterval: 60_000, retry: 1,
  });

  const run = useMutation({
    mutationFn: async () => (await apiRequest('POST', '/api/quant-bot/run', {})).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/quant-bot/status'] }),
  });

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center gap-2 text-label font-mono uppercase tracking-widest text-muted-foreground/70">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> reading the bot…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-card-border bg-card px-6 py-10 text-center">
        <div className="text-meta font-mono uppercase tracking-widest text-foreground/80">Bot unavailable</div>
        <p className="mx-auto mt-2 max-w-md text-meta leading-relaxed text-muted-foreground/70">
          The paper portfolio could not be read. It will retry automatically.
        </p>
      </div>
    );
  }

  const decided = data.winCount + data.lossCount;

  return (
    <div className="space-y-3 px-4 py-3">
      {/* the record */}
      <div className="rounded-xl border border-card-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
          <span className="text-meta font-mono font-bold uppercase tracking-widest text-foreground/80">
            Quant Bot · paper options
          </span>
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-foreground/10 px-2 py-1 text-label font-mono uppercase tracking-wider text-foreground transition-colors hover:bg-foreground/15 disabled:opacity-60"
          >
            {run.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            {run.isPending ? 'Working' : 'Re-price & manage'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-px bg-border/20 sm:grid-cols-5">
          <Stat label="Equity" live={data.totalValue} format={money} />
          <Stat label="P&L" live={data.totalPnL} format={(n) => `${n >= 0 ? '+' : ''}${money(n)}`} color={pnlColor(data.totalPnL)} />
          <Stat label="Return" live={data.totalPnLPercent} format={(n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`} color={pnlColor(data.totalPnLPercent)} />
          <Stat label="Cash" live={data.cashBalance} format={money} />
          <Stat
            label="Win rate"
            value={data.winRate == null ? '—' : `${data.winRate.toFixed(0)}%`}
            color={data.winRate == null ? undefined : data.winRate >= 50 ? TC.bull : TC.bear}
          />
        </div>

        <div className="border-t border-border/30 px-4 py-2">
          <p className="text-meta leading-relaxed text-muted-foreground/70">
            {decided === 0
              ? `No trades have closed yet, so there is no win rate to report. The bot takes signals scoring ${data.config.minConviction}+ and holds up to ${data.config.maxOpen} at once, exiting on the signal's own stop or target.`
              : `${data.winCount}W / ${data.lossCount}L across ${decided} closed trades. This is the engine's own record — every position came from a published signal and exited on its own stop or target.`}
          </p>
        </div>
      </div>

      {/* what it's holding */}
      <Section title="Open positions" count={data.openPositions.length}>
        {data.openPositions.length === 0 ? (
          <Empty text="Nothing open. The bot enters on the next cycle when a signal clears its threshold." />
        ) : (
          data.openPositions.map((p) => <Row key={p.id} p={p} onSelectSymbol={onSelectSymbol} />)
        )}
      </Section>

      <Section title="Closed" count={data.closedPositions.length}>
        {data.closedPositions.length === 0 ? (
          <Empty text="No closed trades yet — the record starts once positions exit." />
        ) : (
          data.closedPositions.map((p) => <Row key={p.id} p={p} closed onSelectSymbol={onSelectSymbol} />)
        )}
      </Section>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-card-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <span className="text-meta font-mono font-bold uppercase tracking-widest text-foreground/80">{title}</span>
        <span className="text-label font-mono text-muted-foreground/70">{count}</span>
      </div>
      <div className="divide-y divide-border/25">{children}</div>
    </div>
  );
}

function Row({ p, closed, onSelectSymbol }: { p: Position; closed?: boolean; onSelectSymbol?: (s: string) => void }) {
  const pnl = closed ? (p.realizedPnL ?? 0) : (p.unrealizedPnL ?? 0);
  const pct = p.unrealizedPnLPercent ?? (p.entryPrice && p.currentPrice
    ? ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100 * (p.direction === 'short' ? -1 : 1)
    : 0);
  const long = p.direction !== 'short';
  const isOption = p.assetType === 'option' && !!p.optionType;
  const mult = isOption ? 100 : 1;
  const days = dte(p.expiryDate);
  const cost = p.quantity * p.entryPrice * mult;

  // Distance to the two things that end the trade — the whole risk picture in one line.
  // how far the position has travelled entry -> target
  const progressPct = (() => {
    if (!p.targetPrice || !p.currentPrice) return 0;
    const span = p.targetPrice - p.entryPrice;
    const done = p.currentPrice - p.entryPrice;
    return span !== 0 ? Math.max(0, Math.min(100, (done / span) * 100)) : 0;
  })();

  return (
    <div className="px-4 py-2.5">
      {/* what it is */}
      <div className="flex items-baseline gap-2">
        <button onClick={() => onSelectSymbol?.(p.symbol)}
          className="cursor-pointer text-body font-mono font-bold tracking-wider text-foreground transition-colors hover:text-[var(--brand-cyan,#22d3ee)]">
          {p.symbol}
        </button>
        {isOption ? (
          <span className="text-meta font-mono tabular-nums" style={{ color: p.optionType === 'call' ? TC.bull : TC.bear }}>
            ${p.strikePrice}{p.optionType === 'call' ? 'C' : 'P'}
          </span>
        ) : (
          <span className="rounded border px-1 py-px text-label font-mono font-bold tracking-wider"
                style={{ color: long ? TC.bull : TC.bear, borderColor: `${long ? TC.bull : TC.bear}55` }}>
            {long ? '▲ SHARES' : '▼ SHARES'}
          </span>
        )}
        {isOption && p.expiryDate && (
          <span className="text-label font-mono tabular-nums"
                style={{ color: days != null && days <= 2 ? TC.bear : days != null && days <= 7 ? TC.warn : 'var(--muted-foreground)' }}>
            {formatExpiry(p.expiryDate)}{days != null ? ` · ${days}d left` : ''}
          </span>
        )}
        <span className="ml-auto flex items-baseline gap-2">
          <span className="text-body font-mono font-bold tabular-nums" style={{ color: pnlColor(pnl) }}>
            {pnl >= 0 ? '+' : ''}{money(pnl)}
          </span>
          <span className="text-meta font-mono tabular-nums" style={{ color: pnlColor(pct) }}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
          </span>
        </span>
      </div>

      {/* size + cost, kept terse — the bars carry the risk picture */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-label font-mono tabular-nums text-muted-foreground/70">
        <span>
          {p.quantity} {isOption ? (p.quantity === 1 ? 'contract' : 'contracts') : 'sh'} @ ${p.entryPrice.toFixed(2)}
        </span>
        <span>cost {money(cost)}</span>
        {closed && p.exitReason && <span className="uppercase tracking-wider">{p.exitReason.replace(/_/g, ' ')}</span>}
      </div>

      {/* WHERE THE TRADE LIVES — stop / entry / now / target on one axis */}
      {!closed && p.stopLoss != null && p.targetPrice != null && p.currentPrice != null && (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_120px]">
          <RangeBar
            stop={p.stopLoss}
            entry={p.entryPrice}
            current={p.currentPrice}
            target={p.targetPrice}
            quantity={p.quantity}
            multiplier={isOption ? 100 : 1}
          />
          {isOption && days != null ? (
            <DecayBar daysLeft={days} totalDays={30} />
          ) : (
            <Meter
              value={progressPct}
              label="To target"
              right={`${progressPct.toFixed(0)}%`}
              color={TC.info}
            />
          )}
        </div>
      )}

      {/* why the bot took it */}
      {p.entryReason && (
        <div className="mt-1 text-label leading-snug text-muted-foreground/70">{p.entryReason}</div>
      )}
    </div>
  );
}

/**
 * A stat tile. Pass `live` (the raw number) and `format` for figures that move
 * while you are watching — LiveValue tweens to the new value and flashes the
 * direction it went, so a change registers without you having to diff it by eye.
 * Pass plain `value` for anything that is a claim rather than a tick: a win rate
 * tweening through intermediate percentages would be inventing readings the
 * engine never produced. See viz/MOTION.md.
 */
function Stat({
  label,
  value,
  live,
  format,
  color,
}: {
  label: string;
  value?: string;
  live?: number;
  format?: (n: number) => string;
  color?: string;
}) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-label font-mono uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <div className="mt-0.5 text-lead font-mono font-bold tabular-nums" style={{ color: color ?? 'var(--foreground)' }}>
        {live !== undefined ? <LiveValue value={live} format={format} /> : value}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-6 text-center text-meta leading-relaxed text-muted-foreground/70">{text}</div>;
}
