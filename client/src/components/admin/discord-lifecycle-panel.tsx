/**
 * Admin hub › System › QuantEdge Labs Discord — per-channel on/off for the
 * lifecycle cards (server/discord-lifecycle.ts). One idea = one card: posted at
 * publish, edited on trigger / exit, one short reply per event, 16:20 ET recap.
 * Master switch: env DISCORD_LIFECYCLE (default on).
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LuxPanel, LuxTag } from '@/components/lux';
import { fmtAgo, useAdminJson } from '@/components/admin/hub-data';
import { csrfHeader } from '@/lib/ask-quantinum';

interface ChannelRow {
  key: string; label: string; env: string; configured: boolean; on: boolean;
  cardsToday: number; openCards: number; pending: number; capped: number; recapToday: boolean;
}
interface Status { enabled: boolean; env: string; channels: ChannelRow[]; outbox: number; caps: { perHour: number; perDay: number }; lastError: { at: number; channel: string; message: string } | null }

const URL = '/api/admin/discord-lifecycle';

export function DiscordLifecyclePanel() {
  const q = useAdminJson<Status>(URL, 60_000);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = async (key: string, on: boolean) => {
    setBusy(key); setMsg(null);
    try {
      const r = await fetch(`${URL}/channel`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json', ...csrfHeader() }, body: JSON.stringify({ channel: key, on }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`);
      await qc.invalidateQueries({ queryKey: [URL] });
    } catch (e: any) {
      setMsg(e?.message ?? 'update failed');
    } finally { setBusy(null); }
  };

  const d = q.data;
  return (
    <LuxPanel title="QuantEdge Labs Discord" sub="One idea = one card: posted at publish, edited on trigger and exit, one reply per event, recap 16:20 ET. Turning a channel off drops its queued posts."
      meta={d ? <LuxTag tone={d.enabled ? 'accent' : 'caution'}>{d.enabled ? 'LIFECYCLE ON' : `OFF · ${d.env}`}</LuxTag> : undefined}>
      {q.isError && <p className="ah-note">Status didn't load — the server may be on an older build.</p>}
      <div className="ah-list">
        {(d?.channels ?? []).map((c) => (
          <div key={c.key} className="ah-li">
            <b>{c.label}</b>
            <LuxTag tone={!c.configured ? 'mute' : c.on ? 'accent' : 'caution'}>{!c.configured ? 'NO WEBHOOK' : c.on ? 'ON' : 'OFF'}</LuxTag>
            <small>{c.env} · {c.cardsToday} today · {c.openCards} open · {c.pending} queued{c.capped ? ` · ${c.capped} over cap (digest)` : ''}{c.recapToday ? ' · recap sent' : ''}</small>
            <button type="button" className="lx-btn" disabled={!d?.enabled || busy === c.key} onClick={() => void toggle(c.key, !c.on)}
              aria-label={`${c.on ? 'Turn off' : 'Turn on'} ${c.label}`}>{c.on ? 'Turn off' : 'Turn on'}</button>
          </div>
        ))}
      </div>
      {d && <p className="ah-note">Graded channels cap at {d.caps.perHour}/hour and {d.caps.perDay}/day (DISCORD_LABS_CAP_PER_HOUR / _PER_DAY); overflow goes out as one digest post. #0dte-ideas is uncapped.</p>}
      {d?.lastError &&<p className="ah-note">Last delivery error: {d.lastError.channel} · {d.lastError.message} · {fmtAgo(new Date(d.lastError.at).toISOString())}</p>}
      {msg && <p className="ah-note" role="alert">{msg}</p>}
    </LuxPanel>
  );
}
