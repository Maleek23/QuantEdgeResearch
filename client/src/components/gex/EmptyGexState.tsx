/**
 * EmptyGexState — friendly fallback for null GEX values
 * Replaces silent "—" blanks with actionable messaging.
 */

interface Props {
  reason:
    | 'no_flip'           // GEX is all positive or all negative — no flip
    | 'low_oi'            // strikes have insufficient OI
    | 'market_closed'     // weekend/holiday, cached or stale
    | 'data_unavailable'  // CBOE/Tradier rate-limited or offline
    | 'computing';        // first load
  symbol?: string;
  onRetry?: () => void;
  size?: 'sm' | 'md';
}

const MESSAGES: Record<Props['reason'], { title: string; detail: string; emoji: string }> = {
  no_flip: {
    emoji: '○',
    title: 'No gamma flip',
    detail: 'Dealer positioning is one-sided — no zero-cross detected. Stock will trend with directional flow.'
  },
  low_oi: {
    emoji: '⚠️',
    title: 'Insufficient OI',
    detail: 'Strikes lack open interest >500 to compute walls. Wait for liquidity or check different expiry.'
  },
  market_closed: {
    emoji: '🌙',
    title: 'Market closed',
    detail: 'Showing last cached snapshot. Live levels resume at 9:30 AM ET.'
  },
  data_unavailable: {
    emoji: '⚡',
    title: 'Data source delayed',
    detail: 'CBOE/Tradier rate-limited or offline. Try refreshing in 30 seconds.'
  },
  computing: {
    emoji: '⏳',
    title: 'Computing GEX...',
    detail: 'Aggregating dealer gamma across all expirations. This takes ~2 seconds.'
  }
};

export function EmptyGexState({ reason, symbol, onRetry, size = 'md' }: Props) {
  const m = MESSAGES[reason];
  const padding = size === 'sm' ? 'p-3' : 'p-5';
  const titleSize = size === 'sm' ? 'text-sm' : 'text-base';

  return (
    <div className={`bg-zinc-900/40 border border-zinc-800 rounded-lg ${padding} text-center`}>
      <div className="text-2xl mb-1">{m.emoji}</div>
      <div className={`font-bold ${titleSize} text-zinc-200`}>
        {m.title}
        {symbol && <span className="text-zinc-500 ml-2 font-mono text-xs">{symbol}</span>}
      </div>
      <div className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">{m.detail}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-xs px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-400 hover:bg-cyan-500/20"
        >
          ↻ Retry
        </button>
      )}
    </div>
  );
}
