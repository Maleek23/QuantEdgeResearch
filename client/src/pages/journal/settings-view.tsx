/**
 * Journal · Settings — LuxAlgo's Settings (apps/web/src/app/settings) cut to
 * what our journal can honour. Preferences are per viewer and saved on this
 * device (localStorage, guarded); nothing here writes to a book, so they are
 * available on every book.
 *   · Default book       opened when the URL names none
 *   · Sizing display     show each book's sizing rule under the basis line, or tuck it away
 *   · Clock              times on notes in ET or this device's zone
 *   · Trading-day zone   fixed to New York, and why
 */
import { useJournal } from '@/components/journal/journal-context';
import { Card } from '@/components/journal/parts';
import { parseJournalKey } from '@shared/journal-sources';

export default function SettingsView() {
  const { prefs, setPrefs, sources } = useJournal();
  const books = sources?.sources ?? [];
  const localZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'this device'; } })();
  return (
    <div className="jr-grid">
      <Card className="jr-span-6" num="01" title="Journal">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="jr-field">
            <label htmlFor="jr-set-book">Default book</label>
            <select id="jr-set-book" className="jr-select" value={prefs.defaultBook} onChange={(e) => setPrefs({ defaultBook: parseJournalKey(e.target.value) })}>
              {(books.length ? books : [{ key: 'mine', label: 'My journal' }, { key: 'bot', label: 'Quantinum Bot' }, { key: 'desk', label: 'NEXUS ideas' }]).map((b) => (
                <option key={b.key} value={b.key}>{b.label}</option>
              ))}
            </select>
            <span className="jr-note" style={{ marginTop: 0 }}>Opened when a link doesn't name a book (?journal=). Links that do still win.</span>
          </div>

          <div className="jr-field">
            <span className="l" id="jr-set-sizing-l">Sizing display</span>
            <div className="jr-seg" role="group" aria-labelledby="jr-set-sizing-l">
              <button type="button" aria-pressed={prefs.sizing === 'show'} onClick={() => setPrefs({ sizing: 'show' })}>SHOW SIZING RULE</button>
              <button type="button" aria-pressed={prefs.sizing === 'hide'} onClick={() => setPrefs({ sizing: 'hide' })}>COLLAPSE IT</button>
            </div>
            <span className="jr-note" style={{ marginTop: 0 }}>Each book states how its dollar P&amp;L is sized (bot fills, unit-sized desk ideas, stated-or-1-contract trader posts). Collapsed, it stays one click away.</span>
          </div>
        </div>
      </Card>

      <Card className="jr-span-6" num="02" title="Time">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="jr-field">
            <span className="l" id="jr-set-clock-l">Clock for note and day times</span>
            <div className="jr-seg" role="group" aria-labelledby="jr-set-clock-l">
              <button type="button" aria-pressed={prefs.timeDisplay === 'et'} onClick={() => setPrefs({ timeDisplay: 'et' })}>NEW YORK (ET)</button>
              <button type="button" aria-pressed={prefs.timeDisplay === 'local'} onClick={() => setPrefs({ timeDisplay: 'local' })}>THIS DEVICE</button>
            </div>
            <span className="jr-note" style={{ marginTop: 0 }}>This device: {localZone}. Applies to the Daily journal, Notebook, Calendar and Missed pages.</span>
          </div>
          <div className="jr-field">
            <span className="l">Trading-day timezone</span>
            <b style={{ fontSize: 13 }}>America/New_York — fixed</b>
            <span className="jr-note" style={{ marginTop: 0 }}>
              A trade belongs to the New York trading day it closed on. The calendar, date filters, day notes and the server's insight engine all bucket
              the same way, so this isn't adjustable — changing it on one side would put the same trade on two different days.
            </span>
          </div>
        </div>
      </Card>

      <Card className="jr-span-12" num="03" title="Where These Are Kept">
        <p className="jr-note" style={{ margin: 0 }}>
          On this device only (browser storage) — they don't follow you to another browser, and clearing site data resets them. Progress goals are kept
          the same way, per book. Nothing on this page changes a journal's trades or notes.
        </p>
      </Card>
    </div>
  );
}
