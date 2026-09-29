/**
 * QE states — the three non-data states every fetched surface must tell apart.
 *
 *   QELoading  the request is in flight          → skeleton rows
 *   QEError    the request FAILED                → says what failed + retry
 *   QEEmpty    the request succeeded, 0 results  → measured-empty + optional action
 *
 * SR 11-7 T3 / F7.1: a fetch failure must never read as "no data". Error and
 * empty are deliberately different in shape (solid amber-edged panel with an
 * alert icon vs. a dashed, icon-less muted note) AND in words (QEError always
 * names the thing that failed — "Slate API didn't respond" — and never says
 * "no data"/"nothing"). Rule for callers: check `isError` BEFORE the empty
 * branch, and wire `onRetry` to the query's `refetch`.
 *
 * 2026-09-29 lux pass: QEEmpty takes an optional title + icon and uses the
 * shared .lx-empty surface (components/lux/lux.css); still dashed + icon-less
 * by default so it never reads like QEError.
 *
 * Visual basis: LoadErrorCard (pages/trade-journal.tsx) and the GEX hub
 * loading/error panels. Colours are NEXUS tokens (styles/nexus.css) with
 * dark-palette fallbacks so the states also render outside `.nexus-vars`.
 */
import type { ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolSkeleton } from "@/components/ui/qe-loading";

const T = {
  panel: "var(--panel-solid, #0e1117)",
  border: "var(--nx-border, rgba(59,140,255,0.08))",
  borderHi: "var(--nx-border-hi, rgba(59,140,255,0.18))",
  text: "var(--text, #e8ecf3)",
  dim: "var(--text-dim, #8b93a3)",
  mute: "var(--text-mute, #7f889a)",
  amber: "var(--amber, #facc15)",
  cyan: "var(--cyan, #3b8cff)",
} as const;

const MONO = "'JetBrains Mono', ui-monospace, monospace";

// ─── Loading ─────────────────────────────────────────────────

/**
 * Loading = THE tool skeleton (components/ui/qe-loading.tsx), so every
 * in-flight surface — dashboard tool, page section, drawer — looks the same.
 * `rows` sets the skeleton lines; `label` names what is loading.
 */
export function QELoading({
  rows = 3,
  label,
  className,
}: {
  rows?: number;
  /** Optional caption, e.g. "building slate from the board…". */
  label?: string;
  className?: string;
}) {
  return <ToolSkeleton rows={rows} label={label} className={className} />;
}

// ─── Error ───────────────────────────────────────────────────

export function QEError({
  title,
  message,
  onRetry,
  retrying = false,
  className,
}: {
  /** What failed, e.g. "Slate API didn't respond". Never "no data". */
  title: string;
  /** Optional context — what this means / what's still safe. */
  message?: ReactNode;
  /** Wire to the query's refetch(). */
  onRetry?: () => void;
  /** Pass the query's isFetching to show the retry in progress. */
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex items-start gap-3 rounded-lg px-4 py-3.5", className)}
      style={{
        background: T.panel,
        border: `1px solid ${T.borderHi}`,
        borderLeft: `3px solid ${T.amber}`,
        fontFamily: MONO,
      }}
      data-testid="qe-error"
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: T.amber }} aria-hidden />
      <div className="min-w-0 flex-1">
        {/* sizes via tokens so phones can raise them (index.css touch & readability floor) */}
        <div style={{ fontSize: "var(--qe-state-title, 13px)", fontWeight: 700, color: T.text }}>{title}</div>
        <div style={{ fontSize: "var(--qe-state-msg, var(--fs-10-5, 12.5px))", color: T.dim, marginTop: 4, lineHeight: 1.5 }}>
          {message ?? "This is a connection failure, not an empty result — what's shown may be missing."}
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors hover:bg-white/10 disabled:opacity-60"
            style={{
              fontFamily: "inherit",
              fontSize: "var(--fs-11, 12px)",
              fontWeight: 600,
              color: T.text,
              background: "rgba(255,255,255,0.05)",
              border: `1px solid ${T.borderHi}`,
              cursor: retrying ? "default" : "pointer",
            }}
            data-testid="qe-error-retry"
          >
            <RotateCw className={cn("w-3.5 h-3.5", retrying && "animate-spin")} aria-hidden />
            {retrying ? "Retrying…" : "Try again"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Empty ───────────────────────────────────────────────────

export function QEEmpty({
  message,
  action,
  title,
  icon,
  className,
}: {
  /** Measured-empty wording — the request worked and returned nothing. */
  message: ReactNode;
  /** Optional action, e.g. a "Run Discovery now" button. */
  action?: ReactNode;
  /** Optional one-line headline above the message. */
  title?: ReactNode;
  /** Optional small icon (a lucide icon element). */
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("lx-empty", className)} data-testid="qe-empty">
      {icon && <div className="lx-empty-icon" aria-hidden>{icon}</div>}
      {title && <div className="lx-empty-title">{title}</div>}
      <div>{message}</div>
      {action && <div className="mt-1 flex justify-center">{action}</div>}
    </div>
  );
}
