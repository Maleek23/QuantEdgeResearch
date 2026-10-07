/**
 * NEXUS ideas book controls — Sizing (Risk $500 default · Risk $1,000 · Custom ≤ $1,000 · Unit)
 * and the Recorded | Managed replay view. Every journal number follows them
 * (client/src/lib/journal/use-journal.ts → shared/desk-view.ts applyDeskView).
 * Persisted in the viewer's journal prefs.
 */
import { useEffect, useState } from 'react';
import { MANAGED_VIEW_CAVEAT, type DeskView } from '@shared/desk-view';
import { DEFAULT_SIZING, MAX_RISK_DOLLARS, MIN_RISK_DOLLARS, RISK_PRESETS, clampRiskDollars, type SizingChoice } from '@shared/position-sizing';
import type { JournalData, JournalPrefs } from '@/lib/journal/use-journal';

export function DeskControls({ prefs, setPrefs, data }: {
  prefs: JournalPrefs; setPrefs: (patch: Partial<JournalPrefs>) => void; data: JournalData;
}) {
  const s = prefs.deskSizing ?? DEFAULT_SIZING;
  const isPreset = s.mode === 'risk' && (RISK_PRESETS as readonly number[]).includes(s.riskDollars);
  const [custom, setCustom] = useState<string>(s.mode === 'risk' && !isPreset ? String(s.riskDollars) : '');
  const [customOpen, setCustomOpen] = useState(s.mode === 'risk' && !isPreset);
  useEffect(() => { if (s.mode === 'risk' && !isPreset) setCustom(String(s.riskDollars)); }, [s.mode, s.riskDollars, isPreset]);
  const setSizing = (c: SizingChoice) => setPrefs({ deskSizing: c });
  const customVal = clampRiskDollars(custom);
  const dv = data.deskView;
  const view: DeskView = prefs.deskView ?? 'recorded';
  const ledgerRows = data.allRows.length;
  // The managed view needs the replay ledger on this server; without it the switch is not offered.
  const hasReplay = (data.tradesQ.data?.trades ?? []).some((r) => r.managed != null);

  return (
    <div className="jr-desk-ctl" role="group" aria-label="NEXUS ideas: sizing and exit view">
      <div className="jr-desk-ctl-row">
        <span className="jr-basis-k">Sizing</span>
        <div className="jr-seg" role="group" aria-label="Position sizing">
          {RISK_PRESETS.map((d) => (
            <button key={d} type="button" aria-pressed={s.mode === 'risk' && s.riskDollars === d && !customOpen}
              onClick={() => { setCustomOpen(false); setSizing({ mode: 'risk', riskDollars: d }); }}>
              RISK ${d.toLocaleString('en-US')}{d === DEFAULT_SIZING.riskDollars ? ' · DEFAULT' : ''}
            </button>
          ))}
          <button type="button" aria-pressed={customOpen} onClick={() => setCustomOpen(true)}>CUSTOM</button>
          <button type="button" aria-pressed={s.mode === 'unit'} onClick={() => { setCustomOpen(false); setSizing({ mode: 'unit', riskDollars: 0 }); }}
            title="1 contract per option idea; $1,000 notional per stock idea — risk varies with the stop">UNIT</button>
        </div>
        {customOpen && (
          <form className="jr-desk-custom" onSubmit={(e) => { e.preventDefault(); if (customVal != null) setSizing({ mode: 'risk', riskDollars: customVal }); }}>
            <label htmlFor="jr-desk-risk" className="sr-only">Custom risk per trade in dollars</label>
            $<input id="jr-desk-risk" className="jr-input" inputMode="numeric" value={custom} placeholder="750" size={6}
              onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))} aria-invalid={custom !== '' && customVal == null} />
            <button type="submit" className="jr-btn jr-btn-sm" disabled={customVal == null}>Apply</button>
            <span className="jr-n">${MIN_RISK_DOLLARS}–${MAX_RISK_DOLLARS.toLocaleString('en-US')} per trade</span>
          </form>
        )}
        {s.mode === 'risk' && <span className="jr-chip" title="Every idea risks the same dollars to its stop">risk-sized · ${s.riskDollars.toLocaleString('en-US')}/trade</span>}
      </div>
      {(hasReplay || view === 'managed') && <div className="jr-desk-ctl-row">
        <span className="jr-basis-k">Exits</span>
        <div className="jr-seg" role="group" aria-label="Exit view">
          <button type="button" aria-pressed={view === 'recorded'} onClick={() => setPrefs({ deskView: 'recorded' })}
            title="The outcome the tracker recorded — never overwritten">RECORDED</button>
          <button type="button" aria-pressed={view === 'managed'} onClick={() => setPrefs({ deskView: 'managed' })}
            title={`Managed exit policy (BE after +1R, ½ at T1, trail, time exit) — ${MANAGED_VIEW_CAVEAT}`}>MANAGED REPLAY</button>
        </div>
        {view === 'managed' && <span className="jr-chip" role="note">{MANAGED_VIEW_CAVEAT}</span>}
      </div>}
      <div className="jr-desk-ctl-row">
        {dv && (dv.skipped.length > 0 || dv.scaled > 0 || dv.capped.count > 0) && (
          <span className="jr-n">
            {ledgerRows} in view{dv.scaled ? ` · ${dv.scaled} scaled` : ''}{dv.capped.count ? ` · ${dv.capped.count} capped at stop` : ''}
            {dv.skipped.length ? ` · not in view: ${dv.skipped.map((x) => `${x.count} ${x.reason}`).join('; ')}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
