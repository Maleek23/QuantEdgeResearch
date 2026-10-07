/**
 * Admin hub › System › Ask Quantinum — flag, spend vs cap, provider order and
 * models (quick + deep chains), key presence, and usage (counts only: the
 * usage log never holds questions or answers). docs/ASK_QUANTINUM.md.
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LuxKpi, LuxKpiGrid, LuxPanel, LuxTag } from '@/components/lux';
import { useAdminJson } from '@/components/admin/hub-data';
import { csrfHeader } from '@/lib/ask-quantinum';
import { QUANTINUM_PROVIDERS, type ProviderStep, type QuantinumAiConfig, type QuantinumProviderId } from '@shared/quantinum-ai';

interface AdminView {
  mode: 'admin' | 'all' | 'off';
  capUsd: number;
  today: string;
  spentTodayUsd: number;
  config: QuantinumAiConfig;
  defaults: QuantinumAiConfig;
  providersWithKey: Record<QuantinumProviderId, boolean>;
  usage: {
    days: { day: string; questions: number; answered: number; blocked: number; costUsd: number; inputTokens: number; outputTokens: number }[];
    byProvider: { provider: string; model: string; questions: number; costUsd: number; fallbacks: number; errors: number }[];
    byTier: { tier: string; questions: number }[];
    topUsersToday: { userKey: string; tier: string; questions: number }[];
  };
  note: string;
}

const URL = '/api/admin/quantinum-ai';
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

function ChainEditor({ label, value, onChange }: { label: string; value: ProviderStep[]; onChange: (v: ProviderStep[]) => void }) {
  const set = (i: number, patch: Partial<ProviderStep>) => onChange(value.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= value.length) return; const v = [...value]; [v[i], v[j]] = [v[j], v[i]]; onChange(v); };
  return (
    <fieldset className="ah-field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="ah-note" style={{ fontWeight: 600 }}>{label}</legend>
      {value.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          <span className="ah-note" style={{ width: 18, fontFamily: 'var(--lx-font-data)' }}>{i + 1}.</span>
          <select aria-label={`${label} step ${i + 1} provider`} value={s.provider} onChange={(e) => set(i, { provider: e.target.value as QuantinumProviderId })} className="lx-btn" style={{ height: 30 }}>
            {QUANTINUM_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input aria-label={`${label} step ${i + 1} model`} value={s.model} onChange={(e) => set(i, { model: e.target.value.trim() })} className="lx-btn" style={{ height: 30, minWidth: 210, fontFamily: 'var(--lx-font-data)', textAlign: 'left' }} />
          <button type="button" className="lx-btn" data-variant="ghost" aria-label={`Move step ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
          <button type="button" className="lx-btn" data-variant="ghost" aria-label={`Move step ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === value.length - 1}>↓</button>
          <button type="button" className="lx-btn" data-variant="ghost" aria-label={`Remove step ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))} disabled={value.length <= 1}>Remove</button>
        </div>
      ))}
      {value.length < 5 && <button type="button" className="lx-btn" style={{ marginTop: 6 }} onClick={() => onChange([...value, { provider: 'gemini', model: 'gemini-2.5-flash' }])}>Add fallback</button>}
    </fieldset>
  );
}

export function QuantinumAiPanel() {
  const q = useAdminJson<AdminView>(URL, 60_000);
  const qc = useQueryClient();
  const [quick, setQuick] = useState<ProviderStep[]>([]);
  const [deep, setDeep] = useState<ProviderStep[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (q.data) { setQuick(q.data.config.quick); setDeep(q.data.config.deep); } }, [q.data?.config.updatedAt, q.data?.config.quick.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (method: 'PUT' | 'DELETE') => {
    setMsg(null);
    const r = await fetch(`${URL}/config`, { method, credentials: 'include', headers: { 'content-type': 'application/json', ...csrfHeader() }, body: method === 'PUT' ? JSON.stringify({ quick, deep }) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg({ ok: false, text: j.error ?? `HTTP ${r.status}` }); return; }
    setMsg({ ok: true, text: method === 'PUT' ? 'Saved — applies to the next question.' : 'Reset to the defaults in code.' });
    void qc.invalidateQueries({ queryKey: [URL] });
  };

  const d = q.data;
  const today = d?.usage.days.find((x) => x.day === d.today);
  return (
    <LuxPanel title="Ask Quantinum" sub="Embedded AI analyst. Flag QUANTINUM_AI (admin · all · off), daily spend cap QUANTINUM_AI_DAILY_USD, quotas free 5 · advanced 50 · pro 200 · admin/desk 200 per ET day."
      meta={d ? <LuxTag tone={d.mode === 'off' ? undefined : d.mode === 'all' ? 'accent' : 'caution'}>{d.mode === 'admin' ? 'ADMINS + DESK ADMINS' : d.mode.toUpperCase()}</LuxTag> : undefined}>
      {q.isError && <p className="ah-note">{URL} didn't load — the server may be on an older build.</p>}
      {d && (
        <>
          <LuxKpiGrid cols={4}>
            <LuxKpi label="Spend today (ET)" value={usd(d.spentTodayUsd)} sub={`cap ${usd(d.capUsd)} · ${d.capUsd ? Math.round((d.spentTodayUsd / d.capUsd) * 100) : 0}% used`} tone={d.spentTodayUsd >= d.capUsd * 0.8 ? 'caution' : undefined} />
            <LuxKpi label="Questions today" value={today?.questions ?? 0} sub={`${today?.answered ?? 0} answered · ${today?.blocked ?? 0} at a limit`} />
            <LuxKpi label="Tokens today" value={today ? `${Math.round((today.inputTokens + today.outputTokens) / 1000)}k` : '0'} sub={today ? `${Math.round(today.inputTokens / 1000)}k in · ${Math.round(today.outputTokens / 1000)}k out` : '—'} />
            <LuxKpi label="Keys present" value={QUANTINUM_PROVIDERS.filter((p) => d.providersWithKey[p]).length + ` / ${QUANTINUM_PROVIDERS.length}`} sub={QUANTINUM_PROVIDERS.map((p) => `${p} ${d.providersWithKey[p] ? '✓' : '—'}`).join(' · ')} />
          </LuxKpiGrid>

          <div style={{ display: 'grid', gap: 14, marginTop: 12 }}>
            <ChainEditor label="Quick Q&A — in order, falls through on error / rate limit" value={quick} onChange={setQuick} />
            <ChainEditor label="Deep analyze" value={deep} onChange={setDeep} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="lx-btn" data-variant="primary" onClick={() => void send('PUT')}>Save provider order</button>
              <button type="button" className="lx-btn" onClick={() => void send('DELETE')}>Reset to defaults</button>
              <span className="ah-note">{d.config.updatedAt ? `last changed ${new Date(d.config.updatedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET by ${d.config.updatedBy ?? '?'}` : 'using the defaults in code'}</span>
              {msg && <span role="status" className="ah-note" style={{ color: msg.ok ? undefined : 'var(--lx-caution)' }}>{msg.text}</span>}
            </div>
          </div>

          <div className="ah-scroll" style={{ marginTop: 12 }}>
            <table className="ah-table">
              <thead><tr><th>Day (ET)</th><th>Questions</th><th>Answered</th><th>At a limit</th><th>Tokens in / out</th><th>Cost</th></tr></thead>
              <tbody>{d.usage.days.map((x) => <tr key={x.day}><td>{x.day}</td><td>{x.questions}</td><td>{x.answered}</td><td>{x.blocked}</td><td>{x.inputTokens.toLocaleString()} / {x.outputTokens.toLocaleString()}</td><td>{usd(x.costUsd)}</td></tr>)}</tbody>
            </table>
            {!d.usage.days.length && <p className="ah-note">No questions yet.</p>}
          </div>
          {d.usage.byProvider.length > 0 && (
            <div className="ah-scroll" style={{ marginTop: 10 }}>
              <table className="ah-table">
                <thead><tr><th>Provider</th><th>Model</th><th>Answers</th><th>Fallbacks</th><th>Errors</th><th>Cost (7d)</th></tr></thead>
                <tbody>{d.usage.byProvider.map((p) => <tr key={`${p.provider}|${p.model}`}><td>{p.provider}</td><td>{p.model}</td><td>{p.questions}</td><td>{p.fallbacks}</td><td>{p.errors}</td><td>{usd(p.costUsd)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <p className="ah-note" style={{ marginTop: 8 }}>
            By tier (7d): {d.usage.byTier.map((t) => `${t.tier} ${t.questions}`).join(' · ') || '—'} · top users today: {d.usage.topUsersToday.slice(0, 5).map((u) => `${u.userKey.slice(0, 8)}… ${u.questions}`).join(' · ') || '—'}. {d.note}
          </p>
        </>
      )}
    </LuxPanel>
  );
}
