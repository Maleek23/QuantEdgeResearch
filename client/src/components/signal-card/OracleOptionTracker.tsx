/**
 * OracleOptionTracker — auto-suggested options contract with live P&L
 * Inspired by MomoEdge "MRVL $125 CALL · EXP Jan 15 · PREM $6.34 → NOW $30.60 +382.6%"
 */

interface Props {
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;             // ISO date or display string
  premiumAtIssue: number;
  premiumNow: number;
  pctChange?: number;
  size?: 'sm' | 'md';
}

export function OracleOptionTracker({
  symbol, optionType, strike, expiry, premiumAtIssue, premiumNow, pctChange, size = 'md'
}: Props) {
  const change = pctChange ?? ((premiumNow - premiumAtIssue) / premiumAtIssue) * 100;
  const positive = change >= 0;

  const fmtExpiry = (() => {
    try {
      const d = new Date(expiry);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    } catch {}
    return expiry;
  })();

  return (
    <div className="bg-zinc-950/50 border border-cyan-500/20 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold">◆ Oracle Option</span>
        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
          {optionType.toUpperCase()}
        </span>
      </div>
      <div className="text-lg font-bold mb-2">
        {symbol} ${strike}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <div className="text-[10px] text-zinc-500">EXP</div>
          <div className="text-sm font-bold">{fmtExpiry}</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500">PREM</div>
          <div className="text-sm font-bold text-amber-400">${premiumAtIssue.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-500">STRIKE</div>
          <div className="text-sm font-bold text-cyan-400">${strike}</div>
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <span className="text-[10px] text-zinc-500">NOW</span>
        <div className="flex items-center gap-2">
          <span className="font-bold">${premiumNow.toFixed(2)}</span>
          <span className={`text-sm font-mono ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
            {positive ? '+' : ''}{change.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
