/**
 * CRYPTO tools — the Crypto board (components/crypto/crypto-nexus.tsx) split
 * into dashboard tools. Each tool renders one of the board's exported
 * sections; they share the board's hooks (identical react-query keys), so a
 * Crypto dashboard with every piece on screen costs one request per endpoint.
 *
 * Ages: the pulse's own asOf, the sentiment feed's asOf, the proxy trace's
 * asOf — never the fetch time. Correlations are computed client-side from the
 * pulse closes and the proxies' daily closes, so they carry the pulse age.
 */
import {
  CryptoNexus, CryptoChartDeck, CryptoCorrelation, CryptoHeader, CryptoHowTo, CryptoProxyBoard, CryptoProxyGate,
  CryptoSentiment, CryptoSpotRead, CryptoSummary,
  useCryptoFeedsLive, useCryptoMajors, useCryptoProxyTrace, useCryptoSentiment,
  type ChartCoin,
} from '@/components/crypto/crypto-nexus';
import { QEError, QELoading } from '@/components/ui/qe-states';
import { useToolReport, useToolSetting } from '../../frame';
import './crypto-tools.css';

/** Report + gate on the shared /api/crypto/pulse query. */
function usePulseGate(what: string, note?: string) {
  const { pulseQ, pulse } = useCryptoMajors();
  useToolReport({
    asOf: pulseQ.isLoading ? undefined : pulse?.asOf ?? null,
    note: pulseQ.isError ? 'refresh failed' : note,
    tone: pulseQ.isError ? 'warn' : 'ok',
  });
  if (pulseQ.isLoading) return <QELoading rows={4} className="fd-pad" label="reading the crypto pulse…" />;
  if (pulseQ.isError && !pulse) {
    return <QEError className="fd-m" title={`${what} didn't load`} message="The crypto pulse did not answer — no price, RSI or volatility is implied." onRetry={() => pulseQ.refetch()} retrying={pulseQ.isFetching} />;
  }
  return null;
}

/* ════════════ Crypto board (all-in-one, classic) ════════════ */
export function CryptoBoardTool() {
  const { pulseQ, pulse } = useCryptoMajors();
  useToolReport({
    asOf: pulseQ.isLoading ? undefined : pulse?.asOf ?? null,
    note: pulseQ.isError ? 'pulse failed' : 'age = spot pulse',
    tone: pulseQ.isError ? 'warn' : 'ok',
  });
  return <div className="fd-fill fd-legacy"><CryptoNexus /></div>;
}

/* ════════════ Spot read · BTC / ETH ════════════ */
export function CryptoSpotTool() {
  const blocked = usePulseGate('Spot read');
  if (blocked) return blocked;
  return <div className="cx-tool fd-scroll"><CryptoSpotRead /></div>;
}

/* ════════════ Structure lab chart ════════════ */
export function CryptoChartTool() {
  const [coin, setCoin] = useToolSetting<ChartCoin>('coin', 'BTC');
  const { pulseQ, pulse } = useCryptoMajors();
  useToolReport({
    asOf: pulseQ.isLoading ? undefined : pulse?.asOf ?? null,
    note: pulseQ.isError ? 'strip refresh failed' : 'age = level strip; chart candles live',
    tone: pulseQ.isError ? 'warn' : 'ok',
  });
  return <div className="cx-tool cx-chart"><CryptoChartDeck coin={coin} onCoin={setCoin} fill /></div>;
}

/* ════════════ Summary · BTC / ETH / ratio / feeds ════════════ */
export function CryptoSummaryTool() {
  const { feedsLive } = useCryptoFeedsLive();
  const blocked = usePulseGate('Crypto summary', `${feedsLive}/2 feeds live`);
  if (blocked) return blocked;
  return <div className="cx-tool fd-scroll"><CryptoSummary /></div>;
}

/* ════════════ Proxy correlation ════════════ */
export function CryptoCorrelationTool() {
  const blocked = usePulseGate('Proxy correlation', 'r of daily log returns · <12 sessions = —');
  if (blocked) return blocked;
  return <div className="cx-tool fd-scroll"><CryptoCorrelation /></div>;
}

/* ════════════ Fear & Greed · BTC dominance ════════════ */
export function CryptoSentimentTool() {
  const q = useCryptoSentiment();
  useToolReport({
    asOf: q.isLoading ? undefined : q.data?.fearGreed?.asOf ?? q.data?.asOf ?? null,
    note: q.isError ? 'feed unreachable' : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={3} className="fd-pad" label="reading sentiment…" />;
  return <div className="cx-tool fd-scroll"><CryptoSentiment /></div>;
}

/* ════════════ Proxy promotion gate ════════════ */
export function CryptoProxyGateTool() {
  const q = useCryptoProxyTrace();
  useToolReport({
    asOf: q.isLoading ? undefined : q.data?.asOf ?? null,
    note: q.isError ? 'trace failed' : q.data ? `${q.data.eligible ?? 0} eligible` : undefined,
    tone: q.isError ? 'warn' : 'ok',
  });
  if (q.isLoading) return <QELoading rows={4} className="fd-pad" label="reading the transmission gates…" />;
  return <div className="cx-tool fd-scroll"><CryptoProxyGate /></div>;
}

/* ════════════ Proxy board ════════════ */
export function CryptoProxyBoardTool() {
  const blocked = usePulseGate('Proxy board', 'corr vs underlying computed live');
  if (blocked) return blocked;
  return <div className="cx-tool fd-scroll"><CryptoProxyBoard /></div>;
}

/* ════════════ How to read crypto ════════════ */
export function CryptoGuideTool() {
  const { pulseQ, pulse } = useCryptoMajors();
  useToolReport({
    asOf: pulseQ.isLoading ? undefined : pulse?.asOf ?? null,
    source: 'editorial · spot pulse heartbeat',
    tone: pulseQ.isError ? 'warn' : 'ok',
  });
  return (
    <div className="cx-tool fd-scroll">
      <CryptoHeader />
      <CryptoHowTo />
    </div>
  );
}
