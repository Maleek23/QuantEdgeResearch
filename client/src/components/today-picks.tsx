/**
 * TODAY'S PICKS — top Radar fires for the current session
 *
 * Compact widget designed to live ATOP /p Home → Dashboard.
 * Shows the 5 most recent A/B graded picks from the Radar with one-click
 * routes to /radar (full view) and /r/[ticker] (deep-dive).
 *
 * Empty state explains exactly when the next scan fires so the user is
 * never confused about whether the engine is "off."
 */
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Target, Clock, ChevronRight } from 'lucide-react';

interface RadarPick {
  id: string;
  firedAt: string;
  patternId: string;
  symbol: string;
  spotAtFire: number;
  finalGrade: string;
  finalScore: number;
  synthesis: string;
}

const SCAN_TIMES = ['09:35', '12:00', '15:55', '20:00'];

function nextScanTime(now = new Date()): string {
  // Compute the next scan time in NY tz (cron schedule)
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = ny.getHours();
  const min = ny.getMinutes();
  const cur = hour * 60 + min;
  const slots = [9 * 60 + 35, 12 * 60, 15 * 60 + 55, 20 * 60];
  for (const s of slots) {
    if (cur < s) {
      const h = Math.floor(s / 60);
      const m = s % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ET`;
    }
  }
  return '09:35 ET (tomorrow)';
}

export function TodayPicks() {
  const [picks, setPicks] = useState<RadarPick[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/radar/picks?limit=5', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        // Filter to picks from the last 24h with grade A/B
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const recent = (d.picks ?? []).filter((p: RadarPick) => {
          if (new Date(p.firedAt).getTime() < cutoff) return false;
          return p.finalGrade.startsWith('A') || p.finalGrade.startsWith('B');
        });
        setPicks(recent);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setPicks([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="qe-card border border-border/40 rounded-md p-3">
      <header className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-[var(--brand-cyan)]" />
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground">
            Today's Picks
          </h3>
          <span className="text-[9px] font-mono text-muted-foreground/60">
            (auto from Thesis Radar)
          </span>
        </div>
        <Link href="/radar" className="text-[10px] font-mono text-[var(--brand-cyan)] hover:underline flex items-center gap-1">
          Full Radar <ChevronRight className="h-3 w-3" />
        </Link>
      </header>

      {loading && (
        <div className="text-[10px] font-mono text-muted-foreground/60 py-3 text-center">
          Loading picks…
        </div>
      )}

      {!loading && picks && picks.length === 0 && (
        <div className="text-[10px] font-mono text-muted-foreground/60 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            No A/B-grade picks in the last 24h.
          </div>
          <div className="mt-1 text-muted-foreground/60">
            Next scan: {nextScanTime()}
          </div>
        </div>
      )}

      {!loading && picks && picks.length > 0 && (
        <div className="space-y-1.5">
          {picks.map(p => (
            <Link
              key={p.id}
              href={`/r/${p.symbol}`}
              className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-muted/30 transition border border-transparent hover:border-border/30"
            >
              <GradePill grade={p.finalGrade} />
              <div className="font-mono font-bold text-[12px] text-foreground min-w-[55px]">
                {p.symbol}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground/70 min-w-[60px]">
                ${p.spotAtFire.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground/60 flex-1 truncate">
                {p.patternId.replace(/_/g, ' ')}
              </div>
              <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function GradePill({ grade }: { grade: string }) {
  const color =
    grade.startsWith('A') ? 'bg-emerald-500/15 text-emerald-500' :
    grade.startsWith('B') ? 'bg-blue-500/15 text-blue-500' :
    'bg-amber-500/15 text-amber-500';
  return (
    <div className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold w-7 text-center ${color}`}>
      {grade}
    </div>
  );
}
