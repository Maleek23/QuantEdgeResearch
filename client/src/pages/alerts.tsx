/**
 * /alerts — dedicated alerts page.
 *
 * The full alerts management UI, reusing the terminal's alert engine verbatim:
 * the same `useSignalAlerts` hook, the same localStorage-backed prefs/feed, and
 * the same shared presentational pieces (AlertTypeToggles, AlertDeliveryRows,
 * AlertFeedItem) the terminal drawer renders. The convictions feed uses the
 * identical query key, so the page and the terminal share one cached fetch.
 *
 * Alerts are signal state changes detected locally against the live conviction
 * feed — they fire while you're in the platform, not while you're away.
 *
 * 2026-09-29: drawn in the page template (components/lux/lux-page.tsx).
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Trash2, Loader2 } from 'lucide-react';
import { LuxKpi, LuxKpiGrid, LuxPage, LuxPageHeader, LuxPanel, LuxTag } from '@/components/lux';
import { QEEmpty, QEError } from '@/components/ui/qe-states';
import { cn } from '@/lib/utils';
import { CONVICTIONS_QUERY_KEY, type ConvictionsResponse } from '@/lib/convictions';
import {
  useSignalAlerts,
  AlertTypeToggles,
  AlertDeliveryRows,
  AlertFeedItem,
  clearFeedWithUndo,
} from '@/components/terminal/terminal-alerts';
import { ALERT_LABELS, type AlertType } from '@/lib/alerts/alert-engine';

const FEED_CAP = 30;
const DAY_MS = 24 * 3600_000;

/** Plain-English descriptions of each alert type, matching lib/alerts/alert-engine. */
const ALERT_DESCRIPTIONS: Record<AlertType, string> = {
  new_signal: 'A fresh idea appeared on the board within the last 2 hours',
  trigger_confirmed: 'Price entered the entry zone — the idea is now in play',
  target_hit: 'Price reached the first target (T1)',
  danger_zone: 'Price is approaching the stop',
  invalidated: 'The stop was taken out — the setup no longer holds',
  rating_jump: "An idea's conviction score moved 5+ points",
  high_conviction: 'An idea reached NEXUS grade A (actionability score 90+, unvalidated — not a win probability)',
};

const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default function AlertsPage() {
  // Identical query key to the terminal shell — one cached fetch, shared.
  const { data: convictions, isLoading, isError, refetch } = useQuery<ConvictionsResponse>({
    queryKey: [...CONVICTIONS_QUERY_KEY],
    queryFn: async () => {
      const r = await fetch('/api/convictions', { credentials: 'include' });
      if (!r.ok) throw new Error('convictions failed');
      return r.json();
    },
    staleTime: 60_000, refetchInterval: 90_000, retry: 1,
  });
  const { prefs, update, feed, setFeed, unread, setUnread } = useSignalAlerts(convictions?.picks);
  const [showAll, setShowAll] = useState(false);

  // Opening the page marks alerts as seen, same as opening the terminal drawer.
  useEffect(() => { setUnread(0); }, [setUnread]);

  // Hero metric: alerts fired in the last 24h — the outcome that answers
  // "is my alert setup catching things?" Types armed is a setup stat and
  // unread is ephemeral; neither is the headline.
  const fired24h = feed.filter((a) => Date.now() - a.at < DAY_MS).length;
  const armedCount = (Object.keys(ALERT_LABELS) as AlertType[]).filter((t) => prefs.enabled[t]).length;
  const visible = showAll ? feed : feed.slice(0, FEED_CAP);

  return (
    <LuxPage width="wide">
      <LuxPageHeader
        section="Alerts"
        context="in-app · this device"
        title={<span data-testid="text-page-title">Alerts</span>}
        purpose={<>In-app alerts when a signal changes state — a trigger fills, T1 is hit, a stop
          comes into range. They fire while you&apos;re in the platform.</>}
      />

      <LuxKpiGrid cols={3}>
        <LuxKpi
          label="Alerts · 24h"
          help="Signal state changes caught in the last 24 hours"
          value={isLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-label="Loading" /> : fired24h}
          sub="state changes caught"
        />
        <LuxKpi label="Types armed" help="Alert types currently armed, out of 7" value={`${armedCount} / 7`}
          tone={armedCount === 0 ? 'caution' : undefined} sub={armedCount === 0 ? 'none armed — nothing will fire' : 'of 7 alert types'} />
        <LuxKpi label="Unread" help="Alerts you haven't opened yet" value={unread} sub="cleared when you open this page" />
      </LuxKpiGrid>

      {/* Live-detection error — honest state, not fake emptiness */}
      {isError && (
        <QEError
          title="Live detection is paused"
          message="Couldn't reach the signal feed, so new state changes won't fire until it reconnects. Your saved alerts and preferences below are unaffected."
          onRetry={() => void refetch()}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Preferences */}
        <LuxPanel title="Alert Preferences" sub="Which state changes fire, and where they reach you. Saved on this device.">
          <div className="space-y-1">
            <AlertTypeToggles prefs={prefs} update={update} />
            <AlertDeliveryRows prefs={prefs} update={update} />
            <div className="mt-3 flex items-center justify-between">
              <span className="lx-card-title" title="Play a short sound when an alert fires">
                Alert sounds
              </span>
              <button
                onClick={() => update({ ...prefs, sound: !prefs.sound })}
                role="switch" aria-checked={prefs.sound} aria-label="Toggle alert sounds"
                className={cn('relative h-5 w-9 cursor-pointer rounded-full transition-colors',
                  prefs.sound ? 'bg-[var(--lx-accent)]' : 'bg-foreground/15')}
              >
                <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all',
                  prefs.sound ? 'left-[18px]' : 'left-0.5')} />
              </button>
            </div>
            {armedCount === 0 && (
              <p className="pt-2 text-xs lx-tone-caution">
                All alert types are off — arm at least one above to start receiving alerts.
              </p>
            )}
          </div>
        </LuxPanel>

        {/* Legend — what each alert type means */}
        <LuxPanel title="What Fires an Alert" sub="Nothing fires just for existing — only state changes against the live board.">
          <dl className="space-y-2">
            {(Object.keys(ALERT_LABELS) as AlertType[]).map((t) => (
              <div key={t} className="flex items-baseline gap-2">
                <dt className="shrink-0">
                  <LuxTag tone={prefs.enabled[t] ? 'accent' : 'mute'} title={prefs.enabled[t] ? 'Armed' : 'Off'}>
                    {ALERT_LABELS[t]}{prefs.enabled[t] ? '' : ' · off'}
                  </LuxTag>
                </dt>
                <dd className="text-xs text-muted-foreground">{ALERT_DESCRIPTIONS[t]}</dd>
              </div>
            ))}
          </dl>
        </LuxPanel>
      </div>

      {/* Feed */}
      <LuxPanel
        flush
        title="Alert Feed"
        sub={isLoading ? 'Connecting to the live signal feed…' : 'Newest first · kept on this device'}
        meta={feed.length > 0 ? (
          <>
            <LuxTag>n={feed.length}</LuxTag>
            {/* Clearing is instant; the toast's Undo restores every alert (was a confirm dialog). */}
            <button type="button" className="lx-btn" data-variant="ghost" onClick={() => clearFeedWithUndo(feed, setFeed)}>
              <Trash2 aria-hidden /> Clear
            </button>
          </>
        ) : undefined}
      >
        {feed.length === 0 ? (
          <div className="px-4 pb-4">
            <QEEmpty
              title="No alerts yet"
              icon={<Bell aria-hidden />}
              message="Alerts fire when a signal actually changes state — a trigger fills, T1 is hit, a stop comes into range. Keep the platform open and they'll land here."
            />
          </div>
        ) : (
          <>
            <div style={{ borderTop: '1px solid var(--lx-line)' }}>
              {visible.map((a) => <AlertFeedItem key={a.id} a={a} />)}
            </div>
            {feed.length > FEED_CAP && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="lx-rowlink w-full justify-center text-xs text-muted-foreground"
              >
                {showAll ? 'Show less' : `Show all ${feed.length}`}
              </button>
            )}
          </>
        )}
      </LuxPanel>
    </LuxPage>
  );
}
