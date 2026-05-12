/**
 * /analyze — dedicated page for the Contract Analyzer
 *
 * Paste any trade in any format, get the Bullflow-style graded analysis card.
 * Linked from sidebar + Trade Desk's "Analyze Idea" button.
 */
import { ContractAnalyzer } from '@/components/contract-analyzer';
import { Terminal } from 'lucide-react';

export default function AnalyzePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-lg font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[var(--brand-cyan)]" />
          Contract Analyzer
        </h1>
        <p className="text-[11px] font-mono text-muted-foreground/70">
          Paste any option contract. Get an instant Bullflow-style A+/B+/etc graded analysis with Greeks, signals, plan, and ROI scenarios.
        </p>
      </header>

      <ContractAnalyzer />

      <div className="qe-card border border-border/30 rounded-md p-3 text-[10px] font-mono text-muted-foreground/70 space-y-1.5">
        <div className="font-bold uppercase text-[var(--brand-cyan)]/80 text-[9px] tracking-wider mb-1">
          Supported formats
        </div>
        <div>• <span className="text-foreground">QCOM 300C 1/16/27 @ $18.50 x 1</span></div>
        <div>• <span className="text-foreground">MU 415C 5/29</span></div>
        <div>• <span className="text-foreground">SPY Jun 18 500P @ 4.20</span></div>
        <div>• <span className="text-foreground">O:MU260529C00415000</span> (OCC symbol)</div>
        <div className="pt-2 text-muted-foreground/50">
          Analyzes: spot, contract mid/bid/ask, Greeks (Δ/Γ/Θ/V), IV percentile, OI concentration, moneyness, DTE, price action (RSI/MACD/SMA stack), catalyst proximity, analyst consensus. Outputs synthesis + T1/T2/stop plan + ROI scenarios at ±1σ/2σ.
        </div>
      </div>
    </div>
  );
}
