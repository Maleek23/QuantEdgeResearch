/**
 * Admin hub › Trader accounts › Self-setup (docs/DESK_ADMINS.md §Trader self-setup).
 *
 *   state   GET /api/admin/ops/trader-self-setup
 *   switch  PUT /api/admin/ops/trader-self-setup  { enabled } | { slug, open }
 *
 * The env TRADER_SELF_SETUP=off closes it regardless of the switch here.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LuxButton, LuxTag } from '@/components/lux';
import { useToast } from '@/hooks/use-toast';
import { adminWrite, getJson } from '@/components/admin/hub-data';
import { SELF_SETUP_BLOCK_LABEL, TRADER_SETUP_PATH, type SelfSetupBlock } from '@shared/trader-self-setup';

const KEY = '/api/admin/ops/trader-self-setup';

interface State {
  envOn: boolean; enabled: boolean; open: boolean;
  books: { slug: string; name: string; offered: boolean; block: SelfSetupBlock | null; closed: boolean }[];
}

export function TraderSelfSetupControls() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery<State>({ queryKey: [KEY], queryFn: () => getJson(KEY) });
  const [busy, setBusy] = useState<string | null>(null);

  const put = async (body: Record<string, unknown>, id: string) => {
    setBusy(id);
    try {
      qc.setQueryData([KEY], await adminWrite<State>('PUT', KEY, body));
    } catch (e) {
      toast({ title: 'Not changed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const s = q.data;
  if (!s) return null;
  return (
    <div style={{ marginTop: 14 }} data-testid="trader-self-setup-controls">
      <div className="ah-bar">
        <b>Self-setup from the sign-in page</b>
        <LuxTag tone={s.open ? 'accent' : 'mute'}>{s.open ? 'On' : 'Off'}</LuxTag>
        {s.envOn
          ? <LuxButton disabled={busy === 'global'} onClick={() => void put({ enabled: !s.enabled }, 'global')} data-testid="button-self-setup-global">
              {s.enabled ? 'Turn off for everyone' : 'Turn on'}</LuxButton>
          : <span className="ah-note">Off by env TRADER_SELF_SETUP</span>}
      </div>
      <p className="ah-note">
        "Trader? Set up your account" ({TRADER_SETUP_PATH}): a trader picks their name, enters their book passcode and chooses a password — username = the book's slug,
        desk admin of that book. Closed for a book once it has an account; a forgotten password is a regenerate above.
      </p>
      {!!s.books.length && (
        <div className="ah-scroll">
          <table className="ah-table ah-rows">
            <thead><tr><th>Book</th><th>Self-setup</th><th style={{ textAlign: 'right' }}>Switch</th></tr></thead>
            <tbody>
              {s.books.map((b) => (
                <tr key={b.slug} data-testid={`row-self-setup-${b.slug}`}>
                  <td data-label="Book">{b.name}<span className="ah-sub2">{b.slug}</span></td>
                  <td data-label="Self-setup">
                    {b.offered ? <LuxTag tone="accent">Offered</LuxTag> : <LuxTag tone="mute">{SELF_SETUP_BLOCK_LABEL[b.block!]}</LuxTag>}
                  </td>
                  <td data-label="">
                    <div className="ah-acts">
                      {(b.offered || b.closed) && (
                        <LuxButton disabled={busy === b.slug} onClick={() => void put({ slug: b.slug, open: b.closed }, b.slug)}>
                          {b.closed ? 'Allow' : 'Turn off'}</LuxButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
