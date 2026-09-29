/**
 * /slate — the daily slate: BMT-style evening watchlist cards built from the
 * platform's own measured ideas (aggressor tape, bottom reversals, crypto
 * transmissions). Presentation only — every number comes from the board.
 *
 * 2026-09-29: drawn in the page template (LuxPage / LuxPageHeader / LuxKpi /
 * lux-panel cards — components/lux/lux-page.tsx), the Journal's language.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import PreMarketGappersCard from "@/components/trade-desk/PreMarketGappersCard";
import { RefreshCw } from "lucide-react";
import { QEEmpty, QEError, QELoading } from "@/components/ui/qe-states";
import { LuxButton, LuxFootnote, LuxKpi, LuxKpiGrid, LuxPage, LuxPageHeader, LuxTag } from "@/components/lux";

interface SlateCard {
  symbol: string;
  band: string | null;
  score: number | null;
  patternLabel: string;
  provenance: string;
  lastClose: number | null;
  entryZoneLow: number | null;
  entryZoneHigh: number | null;
  stop: number | null;
  t1: number | null;
  t2: number | null;
  t2Basis: string;
  contract: string | null;
  flowNote: string;
}

interface SlateResponse {
  generatedAt: string;
  basis: string;
  cards: SlateCard[];
}

interface IndexQuote { price: number; changePercent: number }

const fmt = (n: number | null | undefined, dp = 2) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export default function SlatePage() {
  const slateQ = useQuery<SlateResponse>({
    queryKey: ["/api/slate"],
    refetchInterval: 5 * 60_000,
  });
  const idxQ = useQuery<{ quotes: Record<string, IndexQuote> }>({
    queryKey: ["/api/quotes/batch/SPY,QQQ,IWM"],
    refetchInterval: 60_000,
  });

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York",
  });
  const cards = slateQ.data?.cards ?? [];
  const idx = idxQ.data?.quotes ?? {};
  const refreshing = slateQ.isFetching || idxQ.isFetching;
  const refreshAll = () => {
    void slateQ.refetch();
    void idxQ.refetch();
  };
  const updatedAt = slateQ.dataUpdatedAt
    ? new Date(slateQ.dataUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })
    : null;

  return (
    <LuxPage>
      <LuxPageHeader
        section="Slate"
        context={today}
        title="Daily slate"
        purpose={slateQ.isError && !slateQ.data
          ? "Slate unavailable — see the error below."
          : <>{cards.length} setups · all measured · {slateQ.data?.basis ?? "loading…"}{updatedAt ? ` · updated ${updatedAt} ET` : ""}</>}
        actions={
          /* F7.15: manual refresh — the slate otherwise waits on its 5-min poll. */
          <LuxButton onClick={refreshAll} disabled={refreshing} data-testid="slate-refresh">
            <RefreshCw aria-hidden className={refreshing ? "animate-spin" : undefined} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </LuxButton>
        }
      />

      <LuxKpiGrid cols={3}>
        {(["SPY", "QQQ", "IWM"] as const).map((s) => {
          const q = idx[s];
          const up = (q?.changePercent ?? 0) >= 0;
          return (
            <LuxKpi
              key={s}
              label={s}
              value={q ? fmt(q.price) : "—"}
              sub={q
                ? <span className={up ? "lx-tone-gain" : "lx-tone-loss"}>{up ? "▲ +" : "▼ −"}{Math.abs(q.changePercent).toFixed(2)}% today</span>
                : "no quote"}
            />
          );
        })}
      </LuxKpiGrid>

      {idxQ.isError && (
        <QEError
          title="Index quotes didn't respond"
          message={idxQ.data ? "SPY/QQQ/IWM above are from the last successful load and may be stale." : "SPY/QQQ/IWM prices couldn't be loaded — the dashes above are missing quotes, not flat markets."}
          onRetry={() => void idxQ.refetch()}
          retrying={idxQ.isFetching}
        />
      )}

      {/* Pre-market gappers moved here when the Trade Desk was retired
          (2026-09-24): it was the Desk's only surface not already on the
          board, and the gap is the leading read before the open. */}
      <PreMarketGappersCard defaultExpanded />

      <h2 className="lx-section-t">Setups{cards.length ? ` · ${cards.length}` : ""}</h2>

      {slateQ.isLoading && <QELoading rows={3} label="building slate from the board…" />}
      {slateQ.isError && (
        <QEError
          title="Slate API didn't respond"
          message={
            slateQ.data
              ? "Showing the last slate that loaded — it may be stale. This is a connection failure, not a change in the board."
              : "The slate couldn't be loaded. This is a connection failure, not an empty board — setups may exist."
          }
          onRetry={() => void slateQ.refetch()}
          retrying={slateQ.isFetching}
        />
      )}
      {!slateQ.isLoading && !slateQ.isError && cards.length === 0 && (
        <QEEmpty message="No measured ideas qualify right now — measured-empty, not broken. The sweeps repopulate through the session." />
      )}

      <div className="grid gap-3 md:gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}>
        {cards.map((c) => (
          <Link key={c.symbol} href={`/r/${c.symbol}`} className="lx-panel" aria-label={`${c.symbol} — open research`}>
            <div className="lx-panel-h">
              <div className="lx-panel-h-main">
                <div className="lx-panel-h-line">
                  <span className="lx-panel-t" style={{ fontSize: 20 }}>{c.symbol}</span>
                  <LuxTag tone="gain">{c.contract ? `▲ ${c.contract.split("·")[0].trim()}` : "▲ LONG"}</LuxTag>
                  {c.band && <LuxTag tone="accent" title="Conviction band and score">{c.band}{c.score != null ? ` · ${c.score}` : ""}</LuxTag>}
                </div>
                <p className="lx-panel-sub" style={{ fontFamily: "var(--lx-font-data)" }}>
                  {fmt(c.lastClose)} close{c.contract ? ` · ${c.contract.split("·").slice(1).join("·").trim()}` : " · no contract yet — engine picks at the open"}
                </p>
              </div>
            </div>
            <div className="lx-panel-body">
              <div className="lx-panel-num" style={{ letterSpacing: "0.08em" }}>{c.patternLabel}</div>
              <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--lx-text)", minHeight: 36 }}>{c.provenance}</p>

              <div className="grid grid-cols-4 gap-2" style={{ marginTop: 14 }}>
                <Level label="Entry" value={c.entryZoneLow != null ? `${c.entryZoneLow.toFixed(2)}–${c.entryZoneHigh?.toFixed(2)}` : "—"} />
                <Level label="Stop" value={fmt(c.stop)} tone="loss" />
                <Level label="Target 1" value={fmt(c.t1)} />
                <Level label="Target 2" value={fmt(c.t2)} hint={c.t2Basis} />
              </div>

              <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--lx-line)", fontSize: 11.5, color: "var(--lx-dim)" }}>
                <span className="lx-tag" style={{ marginRight: 8 }}>FLOW</span>{c.flowNote}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <LuxFootnote>
        Setups derived from measured detectors (aggressor tape · bottom reversals · crypto transmission) ·
        T2 hover shows its basis · Re-validate at the open · Not financial advice
      </LuxFootnote>
    </LuxPage>
  );
}

/** One price level on a slate card — caption over a mono figure. */
function Level({ label, value, tone, hint }: { label: string; value: string; tone?: "loss"; hint?: string }) {
  return (
    <div style={{ minWidth: 0 }} title={hint}>
      <div className="lx-card-title" style={{ fontSize: 10.5 }}>{label}</div>
      <div className={tone === "loss" ? "lx-tone-loss" : undefined} style={{ marginTop: 3, fontFamily: "var(--lx-font-data)", fontWeight: 700, fontSize: 12, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}
