/**
 * NEXUS · trader-call evidence. A call is shown as "Trader call · Femi · 2h ago"
 * with its message link, the stated entry (labelled as stated, at post time),
 * and the LIVE underlying quote — never the post's price as if current.
 * Evidence only: it does not change conviction, and the bot never reads it.
 */
import { ExternalLink } from 'lucide-react';
import { callAge, callContract, callsForSymbol, useTraderCalls, type TraderCall } from '@/lib/trader-calls';

const fmt = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(2) : n.toFixed(3).replace(/0$/, ''));

export function TraderCallLine({ c, compact = false }: { c: TraderCall; compact?: boolean }) {
  const u = c.underlying;
  return (
    <div className="nxtc-call" data-view={c.view}>
      <div className="nxtc-head">
        <span className="nxtc-tag">Trader call</span>
        <strong>{c.trader.name}</strong>
        <time dateTime={c.postedAt} title={new Date(c.postedAt).toLocaleString()}>{callAge(c.postedAt)}</time>
        {c.link && <a href={c.link} target="_blank" rel="noreferrer noopener" aria-label={`Open ${c.trader.name}'s post in Discord`}>post <ExternalLink size={11} aria-hidden /></a>}
      </div>
      <div className="nxtc-body">
        <span className={`nxtc-side ${c.view === 'long' ? 'bull' : 'bear'}`}>{c.view === 'long' ? '▲' : '▼'}</span>
        <span className="nxtc-contract">{callContract(c)}</span>
        <span className="nxtc-stated" title="What the post stated, at post time — not a current price">
          stated {c.stated.units === 'premium' ? 'premium' : 'entry'} {fmt(c.stated.entry)}
          {c.stated.stop != null ? ` · stop ${fmt(c.stated.stop)}` : ''}{c.stated.target != null ? ` · target ${fmt(c.stated.target)}` : ''}
        </span>
      </div>
      {!compact && (
        <div className="nxtc-foot">
          {u ? (
            <span title={`Quote source: ${u.source}${u.live ? '' : ' (last daily close — not live)'} · as of ${new Date(u.asOf).toLocaleTimeString()}`}>
              {c.symbol} {u.live ? 'now' : 'last close'} {fmt(u.price)} ({u.changePct >= 0 ? '+' : ''}{u.changePct.toFixed(2)}% day)
              {c.sinceCallPct != null ? ` · ${c.sinceCallPct >= 0 ? '+' : ''}${c.sinceCallPct.toFixed(2)}% since the call` : ''}
            </span>
          ) : <span>{c.symbol} quote unavailable — no price shown</span>}
          <span>rank #{c.trader.rank ?? '—'} · score {c.trader.score ?? '—'}{c.confidence != null ? ` · parse ${Math.round(c.confidence * 100)}%` : ''}</span>
        </div>
      )}
    </div>
  );
}

/** Small marker for a setup row: how many ranked-trader calls name this ticker. */
export function TraderCallBadge({ symbol }: { symbol: string }) {
  const q = useTraderCalls();
  const calls = callsForSymbol(q.data, symbol);
  if (!calls.length) return null;
  const c = calls[0];
  return (
    <span className="nxtc-badge" title={`Trader call · ${c.trader.name} · ${callAge(c.postedAt)}${calls.length > 1 ? ` (+${calls.length - 1} more)` : ''} — evidence, not a signal`}>
      TC{calls.length > 1 ? ` ×${calls.length}` : ''}
    </span>
  );
}

/** Evidence block for the selected setup's detail. Renders nothing when no ranked trader called it. */
export function TraderCallEvidence({ symbol }: { symbol: string }) {
  const q = useTraderCalls();
  const calls = callsForSymbol(q.data, symbol);
  if (!calls.length) return null;
  return (
    <div className="nxtc-evidence" aria-label={`Trader calls on ${symbol}`}>
      <div className="nxp-section-title"><span>Trader calls · evidence</span><small>not scored into conviction · not used by Quantinum Bot</small></div>
      {calls.slice(0, 3).map((c) => <TraderCallLine key={c.id} c={c} />)}
    </div>
  );
}
