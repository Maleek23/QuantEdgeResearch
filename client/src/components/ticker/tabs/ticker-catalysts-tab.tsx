/**
 * TickerCatalystsTab — earnings, news, events for a single symbol.
 * Fetches from /api/earnings/catalyst, /api/news.
 */

import { useQuery } from '@tanstack/react-query';
import { cn, safeToFixed } from '@/lib/utils';
import { Calendar, Newspaper, Clock, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';

interface EarningsCatalyst {
  symbol: string;
  hasUpcomingEarnings: boolean;
  earningsDate?: string;
  daysUntilEarnings?: number;
  historicalReactions?: Array<{ date: string; movePercent: number }>;
}

interface NewsItem {
  title: string;
  summary?: string;
  source: string;
  url: string;
  publishedAt: number | string;
  sentiment?: 'Positive' | 'Negative' | 'Neutral';
  symbols?: string[];
}

interface TickerCatalystsTabProps {
  symbol: string;
}

export function TickerCatalystsTab({ symbol }: TickerCatalystsTabProps) {
  const { data: earnings } = useQuery<EarningsCatalyst>({
    queryKey: ['/api/earnings/catalyst', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/earnings/catalyst/${symbol}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 3_600_000,
  });

  const { data: newsData } = useQuery<{ news: NewsItem[] }>({
    queryKey: ['/api/news', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/news?tickers=${symbol}&limit=15`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 600_000,
  });

  const news = newsData?.news ?? [];

  function formatDate(d: string | number) {
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return String(d); }
  }

  function timeAgo(d: string | number) {
    const ms = Date.now() - new Date(d).getTime();
    const hrs = Math.floor(ms / 3_600_000);
    if (hrs < 1) return `${Math.floor(ms / 60_000)}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const sentimentColor = (s?: string) =>
    s === 'Positive' ? 'text-[var(--trade-bullish)] bg-[var(--trade-bullish)]/10 border-[var(--trade-bullish)]/30'
    : s === 'Negative' ? 'text-[var(--trade-bearish)] bg-[var(--trade-bearish)]/10 border-[var(--trade-bearish)]/30'
    : 'text-muted-foreground bg-muted/30 border-border';

  return (
    <div className="space-y-4">
      {/* Earnings */}
      <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">EARNINGS</span>
        </div>

        {earnings?.hasUpcomingEarnings ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[9px] font-mono text-muted-foreground">NEXT REPORT</div>
                <div className="text-lg font-mono font-bold text-foreground">{formatDate(earnings.earningsDate!)}</div>
              </div>
              <div className="px-3 py-1 rounded border border-amber-500/30 bg-amber-500/10">
                <div className="text-[9px] font-mono text-amber-400">IN</div>
                <div className="text-lg font-mono font-bold text-amber-400">{earnings.daysUntilEarnings}d</div>
              </div>
            </div>

            {/* Historical Reactions */}
            {earnings.historicalReactions && earnings.historicalReactions.length > 0 && (
              <div>
                <div className="text-[9px] font-mono text-muted-foreground mb-2">PAST REACTIONS</div>
                <div className="flex gap-2">
                  {earnings.historicalReactions.slice(0, 6).map((r, i) => (
                    <div key={i} className="flex-1 rounded border border-border p-2 text-center">
                      <div className="text-[8px] font-mono text-muted-foreground">{formatDate(r.date)}</div>
                      <div className={cn(
                        'text-sm font-mono font-bold',
                        r.movePercent >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'
                      )}>
                        {r.movePercent >= 0 ? '+' : ''}{safeToFixed(r.movePercent, 1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No upcoming earnings date available</p>
        )}
      </div>

      {/* News Feed */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Newspaper className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">NEWS</span>
          <span className="text-[9px] font-mono text-muted-foreground ml-auto">{news.length} articles</span>
        </div>

        {news.length === 0 ? (
          <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-4 text-center">
            <p className="text-xs text-muted-foreground">No recent news for {symbol}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {news.map((article, i) => (
              <a
                key={i}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border bg-[var(--surface-raised)] p-3 hover:border-border/80 hover:bg-muted/20 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 group-hover:text-[var(--brand-teal)] transition-colors">
                    {article.title}
                  </p>
                  <ExternalLink className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-0.5" />
                </div>
                {article.summary && (
                  <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{article.summary}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[9px] text-muted-foreground">{article.source}</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {timeAgo(article.publishedAt)}
                  </span>
                  {article.sentiment && (
                    <>
                      <span className="text-muted-foreground/30">·</span>
                      <span className={cn('text-[8px] px-1.5 py-0.5 rounded border font-mono font-semibold', sentimentColor(article.sentiment))}>
                        {article.sentiment}
                      </span>
                    </>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
