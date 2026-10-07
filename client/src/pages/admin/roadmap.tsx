/**
 * Admin hub › Roadmap — the update planner. Items feed the public /updates page
 * (Shipped + In progress) and the "What's new" badge.
 *
 *   list    GET    /api/admin/roadmap
 *   create  POST   /api/admin/roadmap
 *   update  PATCH  /api/admin/roadmap/:id   (status change inline; shipping with no date stamps today)
 *   delete  DELETE /api/admin/roadmap/:id
 * Stored in .cache/shared/roadmap.json (server/roadmap-store.ts) — no migration.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/admin-layout';
import { LuxButton, LuxKpi, LuxKpiGrid, LuxPanel, LuxTag, type LuxTone } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import { useToast } from '@/hooks/use-toast';
import { adminWrite, getJson } from '@/components/admin/hub-data';
import {
  ROADMAP_AREAS, ROADMAP_AUDIENCES, ROADMAP_PRIORITIES, ROADMAP_STATUSES, STATUS_LABEL,
  type RoadmapInput, type RoadmapItem, type RoadmapStatus,
} from '@shared/roadmap';

const KEY = '/api/admin/roadmap';
const TONE: Record<RoadmapStatus, LuxTone> = { idea: 'mute', planned: 'marker', in_progress: 'caution', shipped: 'accent' };
const BLANK: RoadmapInput = { title: '', description: '', area: 'NEXUS', status: 'planned', priority: 'medium', targetDate: null, audience: 'all', announce: false };

export default function AdminRoadmap() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery<{ items: RoadmapItem[] }>({ queryKey: [KEY], queryFn: () => getJson(KEY) });
  const [draft, setDraft] = useState<RoadmapInput>(BLANK);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'all' | RoadmapStatus>('all');
  const [area, setArea] = useState('all');

  const all = q.data?.items ?? [];
  const rows = useMemo(() => all
    .filter((i) => (status === 'all' || i.status === status) && (area === 'all' || i.area === area))
    .sort((a, b) => ROADMAP_STATUSES.indexOf(b.status) - ROADMAP_STATUSES.indexOf(a.status) || (b.targetDate ?? '').localeCompare(a.targetDate ?? '')), [all, status, area]);
  const count = (s: RoadmapStatus) => all.filter((i) => i.status === s).length;
  const refresh = () => { void qc.invalidateQueries({ queryKey: [KEY] }); void qc.invalidateQueries({ queryKey: ['/api/updates'] }); };

  const save = async () => {
    if (!draft.title.trim()) { toast({ title: 'Add a title', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      if (editing) await adminWrite('PATCH', `${KEY}/${editing}`, draft);
      else await adminWrite('POST', KEY, draft);
      toast({ title: editing ? 'Item updated' : 'Item added' });
      setDraft(BLANK); setEditing(null); refresh();
    } catch (e) { toast({ title: 'Not saved', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const setItemStatus = async (it: RoadmapItem, s: RoadmapStatus) => {
    try { await adminWrite('PATCH', `${KEY}/${it.id}`, { status: s }); refresh(); }
    catch (e) { toast({ title: 'Not updated', description: (e as Error).message, variant: 'destructive' }); }
  };
  const remove = async (it: RoadmapItem) => {
    if (!window.confirm(`Delete “${it.title}”? It disappears from /updates too.`)) return;
    try { await adminWrite('DELETE', `${KEY}/${it.id}`); refresh(); toast({ title: 'Deleted' }); }
    catch (e) { toast({ title: 'Not deleted', description: (e as Error).message, variant: 'destructive' }); }
  };
  const edit = (it: RoadmapItem) => {
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = it;
    setDraft(rest); setEditing(it.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const set = <K extends keyof RoadmapInput>(k: K, v: RoadmapInput[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <AdminLayout>
      <div className="ah-stack">
        <LuxKpiGrid cols={4}>
          <LuxKpi label="Ideas / planned" value={q.data ? `${count('idea')} / ${count('planned')}` : '—'} sub="not public" />
          <LuxKpi label="In progress" value={q.data ? count('in_progress') : '—'} sub="shown on /updates" />
          <LuxKpi label="Shipped" value={q.data ? count('shipped') : '—'} sub="shown on /updates, dated" />
          <LuxKpi label="Announce" value={q.data ? all.filter((i) => i.announce).length : '—'} sub="flagged for announcement" />
        </LuxKpiGrid>

        <LuxPanel title={editing ? 'Edit item' : 'Add an item'} sub="Shipped and In progress items appear on the public /updates page. Shipping with no date stamps today.">
          <div className="ah-form">
            <label className="ah-field ah-grow">Title
              <input className="ah-input" value={draft.title} maxLength={120} onChange={(e) => set('title', e.target.value)} data-testid="input-roadmap-title" />
            </label>
            <label className="ah-field ah-grow">Description (what a user sees)
              <textarea className="ah-input" rows={3} value={draft.description} maxLength={600} onChange={(e) => set('description', e.target.value)} />
            </label>
            <label className="ah-field">Area
              <select className="ah-select" value={draft.area} onChange={(e) => set('area', e.target.value as RoadmapInput['area'])}>
                {ROADMAP_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="ah-field">Status
              <select className="ah-select" value={draft.status} onChange={(e) => set('status', e.target.value as RoadmapStatus)}>
                {ROADMAP_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label className="ah-field">Priority
              <select className="ah-select" value={draft.priority} onChange={(e) => set('priority', e.target.value as RoadmapInput['priority'])}>
                {ROADMAP_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="ah-field">Target / ship date
              <input className="ah-input" type="date" value={draft.targetDate ?? ''} onChange={(e) => set('targetDate', e.target.value || null)} />
            </label>
            <label className="ah-field">Audience
              <select className="ah-select" value={draft.audience} onChange={(e) => set('audience', e.target.value as RoadmapInput['audience'])}>
                {ROADMAP_AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="ah-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={draft.announce} onChange={(e) => set('announce', e.target.checked)} /> Announce
            </label>
            <div className="ah-bar">
              <LuxButton variant="primary" disabled={busy} onClick={() => void save()} data-testid="button-roadmap-save">{editing ? 'Save changes' : 'Add item'}</LuxButton>
              {editing && <LuxButton variant="ghost" onClick={() => { setDraft(BLANK); setEditing(null); }}>Cancel</LuxButton>}
              <a className="ah-linkbtn" href="/updates" target="_blank" rel="noopener noreferrer">Open /updates</a>
            </div>
          </div>
        </LuxPanel>

        <LuxPanel title="Items" meta={q.data ? <LuxTag tone="mute">{rows.length} shown</LuxTag> : undefined}>
          <div className="ah-bar" style={{ marginBottom: 10 }}>
            <select className="ah-select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {ROADMAP_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <select className="ah-select" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Filter by area">
              <option value="all">All areas</option>
              {ROADMAP_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {q.isError && <QEError title="The roadmap didn't load" message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />}
          {q.isLoading && <p className="ah-note">Loading…</p>}
          {!!rows.length && (
            <div className="ah-scroll">
              <table className="ah-table ah-rows">
                <thead><tr><th>Item</th><th>Area</th><th>Status</th><th>Date</th><th>Audience</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                <tbody>
                  {rows.map((it) => (
                    <tr key={it.id} data-testid={`row-roadmap-${it.id}`}>
                      <td data-label="Item"><b>{it.title}</b>{it.announce && <> <LuxTag tone="accent">ANNOUNCE</LuxTag></>}<span className="ah-sub2">{it.description}</span><span className="ah-sub2">priority {it.priority}</span></td>
                      <td data-label="Area">{it.area}</td>
                      <td data-label="Status">
                        <LuxTag tone={TONE[it.status]}>{STATUS_LABEL[it.status].toUpperCase()}</LuxTag>
                        <select className="ah-select" style={{ marginTop: 6 }} value={it.status} onChange={(e) => void setItemStatus(it, e.target.value as RoadmapStatus)} aria-label={`Status of ${it.title}`}>
                          {ROADMAP_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                      </td>
                      <td data-label="Date">{it.targetDate ?? '—'}</td>
                      <td data-label="Audience">{it.audience}</td>
                      <td data-label="">
                        <div className="ah-acts">
                          <LuxButton onClick={() => edit(it)}>Edit</LuxButton>
                          <LuxButton variant="ghost" onClick={() => void remove(it)}>Delete</LuxButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {q.data && !rows.length && <p className="ah-note">{all.length ? 'No items match.' : 'No items yet.'}</p>}
        </LuxPanel>
      </div>
    </AdminLayout>
  );
}
