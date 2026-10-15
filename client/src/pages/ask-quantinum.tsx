/**
 * /ask — Ask Quantinum full page: the SAME shared conversation as the sheet,
 * beside a live chart (NexusPriceChart, our chart engine) of the symbol being
 * discussed — the latest card's subject, else the latest question's page
 * ticker, else ?sym= / the focused ticker. Phone: chart on top, chat below.
 * ?q= pre-fills the composer (never auto-sent) — the docs' "Ask Quantinum"
 * button uses it to hand over the page being read as context.
 */
import { useMemo } from 'react';
import { Link, useSearch } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { NexusPriceChart } from '@/components/charting/nexus-price-chart';
import { AskQuantinumPanel, discussedSymbol } from '@/components/quantinum/ask-quantinum-panel';
import { useAskQuantinumStatus } from '@/lib/ask-quantinum';
import { useConversation, usePageContext } from '@/lib/quantinum-analyst';
import { normalizeSymbol } from '@shared/quantinum-ai';
import { ANALYST_DISCLAIMER } from '@shared/quantinum-analyst';
import '@/components/quantinum/ask-quantinum.css';

export default function AskQuantinumPage() {
  const status = useAskQuantinumStatus();
  const search = useSearch();
  const page = usePageContext();
  const conv = useConversation();
  const fromUrl = normalizeSymbol(new URLSearchParams(search).get('sym'));
  const symbol = useMemo(() => discussedSymbol(conv.messages, fromUrl ?? page.symbol ?? null), [conv.messages, fromUrl, page.symbol]);
  const q = new URLSearchParams(search).get('q');
  const seedPrompt = useMemo(() => (q ? { text: q.slice(0, 600), nonce: 1 } : null), [q]);
  const target = fromUrl ? { kind: 'ticker' as const, symbol: fromUrl, label: `${fromUrl} · chart` } : null;

  if (status.isLoading) return <main className="aq-page"><p className="aq-foot" style={{ padding: 16 }}>Loading…</p></main>;
  if (!status.data?.enabled) {
    return (
      <main className="aq-page">
        <div className="aq-page-gate">
          <h1>Ask Quantinum</h1>
          <p>Ask Quantinum is not enabled for your account.</p>
          <Link href="/t" className="lx-btn">Back to the terminal</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="aq-page" aria-label="Ask Quantinum">
      <header className="aq-page-h">
        <Link href="/t" className="lx-icon-btn lx-focus" aria-label="Back to the terminal"><ArrowLeft aria-hidden size={16} /></Link>
        <h1>Ask Quantinum</h1>
        <span className="aq-foot">{ANALYST_DISCLAIMER}</span>
      </header>
      <div className="aq-page-grid">
        <section className="aq-page-chart" aria-label={symbol ? `${symbol} live chart` : 'Chart'}>
          {symbol
            ? <><div className="aq-page-sym"><strong>{symbol}</strong><span className="aq-foot">live · the symbol under discussion</span></div><NexusPriceChart symbol={symbol} initialTf="5m" height={360} fill touchScroll /></>
            : <p className="aq-empty" style={{ padding: 16 }}>Ask about a ticker (or run <code>/levels NVDA</code>) and its live chart appears here.</p>}
        </section>
        <section className="aq-page-chat">
          <AskQuantinumPanel target={target} seedPrompt={seedPrompt} status={status.data} variant="page" />
        </section>
      </div>
    </main>
  );
}
