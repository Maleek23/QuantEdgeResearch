/**
 * ContractPickerPanel — thin wrapper kept for existing imports.
 *
 * The separate "Fit my budget" picker (its own account input, its own cost
 * chips, "CBOE delayed" hard-coded) is gone; it now renders the ONE unified
 * ContractEngine, which shares its limits with every other engine on screen
 * and names the chain it actually used.
 */
import { ContractEngine } from "@/components/contract-engine/contract-engine";

export function ContractPickerPanel({
  symbol, direction, target, stop, entry, holdPeriodLabel, title,
}: {
  symbol: string;
  direction?: "long" | "short";
  target?: number | null;
  stop?: number | null;
  entry?: number | null;
  holdPeriodLabel?: string | null;
  title?: string;
}) {
  return (
    <ContractEngine
      symbol={symbol}
      direction={direction === "short" ? "BEAR" : direction === "long" ? "BULL" : undefined}
      t1={target ?? null}
      stop={stop ?? null}
      entry={entry ?? null}
      holdPeriodLabel={holdPeriodLabel}
      title={title}
    />
  );
}
