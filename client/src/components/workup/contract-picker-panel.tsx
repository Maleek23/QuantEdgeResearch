/**
 * Adaptive contract picker — DTE window + account size in, ranked candidates
 * with explicit warnings out. Data: CBOE delayed chain (label says so).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface Candidate {
  label: string;
  mid: number;
  spreadPct: number | null;
  delta: number | null;
  thetaPerDayPct: number | null;
  openInterest: number;
  volume: number;
  costPerContract: number;
  pctOfBudget: number | null;
  warnings: string[];
  score: number;
}

const DTE_PRESETS = [
  { label: "0–3d", min: 0, max: 3 },
  { label: "4–10d", min: 4, max: 10 },
  { label: "11–30d", min: 11, max: 30 },
  { label: "31–90d", min: 31, max: 90 },
  { label: "LEAPS", min: 91, max: 500 },
];

export function ContractPickerPanel({ symbol, direction = "long" }: { symbol: string; direction?: "long" | "short" }) {
  const [preset, setPreset] = useState(1);
  const [budget, setBudget] = useState<string>(() => {
    try { return localStorage.getItem("qe-picker-budget") ?? "5000"; } catch { return "5000"; }
  });
  const budgetNum = Number(budget) || 0;
  const { min, max } = DTE_PRESETS[preset];

  const q = useQuery<{ spot: number; note: string; candidates: Candidate[] }>({
    queryKey: [`/api/contract-picker/${symbol}?dteMin=${min}&dteMax=${max}&budget=${budgetNum}&direction=${direction}`],
    staleTime: 120_000,
    retry: 0,
  });

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--nx-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 10, letterSpacing: 1, color: "var(--text-dim)", fontWeight: 700 }}>CONTRACT PICKER</span>
        <div style={{ display: "flex", gap: 4 }}>
          {DTE_PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setPreset(i)}
              style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                border: `1px solid ${i === preset ? "var(--purple)" : "var(--nx-border)"}`,
                background: i === preset ? "rgba(167,139,250,0.15)" : "transparent",
                color: i === preset ? "var(--purple)" : "var(--text-dim)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label style={{ fontSize: 10, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 4 }}>
          acct $
          <input
            value={budget}
            onChange={(e) => {
              setBudget(e.target.value);
              try { localStorage.setItem("qe-picker-budget", e.target.value); } catch { /* ok */ }
            }}
            style={{ width: 64, fontSize: 11, padding: "2px 6px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--nx-border)", borderRadius: 4, color: "inherit" }}
          />
        </label>
        <span style={{ fontSize: 9, color: "var(--text-dim)", opacity: 0.7 }}>CBOE delayed · warnings are the point</span>
      </div>

      {q.isLoading && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>reading the chain…</div>}
      {q.isError && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>no chain available for {symbol}</div>}
      {q.data && q.data.candidates.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>nothing near-the-money in this DTE window — widen it</div>
      )}

      {(q.data?.candidates ?? []).slice(0, 5).map((c) => (
        <div key={c.label} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12 }}>
            <span style={{ fontWeight: 700 }}>{c.label}</span>
            <span>
              mid ${c.mid}
              <span style={{ color: "var(--text-dim)", fontSize: 10 }}> · ${c.costPerContract}/contract{c.pctOfBudget != null ? ` (${Math.round(c.pctOfBudget * 100)}% of acct)` : ""}</span>
            </span>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
            Δ {c.delta != null ? c.delta.toFixed(2) : "—"} · θ/day {c.thetaPerDayPct != null ? (c.thetaPerDayPct * 100).toFixed(1) + "%" : "—"} · spread {c.spreadPct != null ? (c.spreadPct * 100).toFixed(0) + "%" : "—"} · OI {c.openInterest} · vol {c.volume}
          </div>
          {c.warnings.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {c.warnings.map((w) => (
                <span key={w} style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 3, background: "rgba(255,180,0,0.08)", border: "1px solid rgba(255,180,0,0.25)", color: "#e8b34b" }}>
                  ⚠ {w}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
